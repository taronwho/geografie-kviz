// Hlášení chyb v otázkách (PostgreSQL 16): hráč vloží jen svá hlášení s omezenou délkou a nejvýš 20 za den, čtou a mažou je jen dev_admins.
// Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_reports_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const ADMIN = '33333333-3333-3333-3333-333333333333';
const as = (role, uid, sql) => psql(dbName, `set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const asUser = (uid, sql) => as('authenticated', uid, sql);
const last = (result) => result.stdout.trim().split('\n').pop();
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => assert.equal(r.status, 0, r.stderr);
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };
const report = (uid, extra = '') => `insert into question_reports (user_id, topic, item_id, question_type, reason, note, title, answer) values ('${uid}', 'zemepis', 'Q214', 'name', 'spatna-odpoved', 'Správně je jiné město', 'Které město to je?', 'Praha'${extra});`;

const bootstrap = `
do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, public;`;

test('SQL: hlášení chyb v otázkách (RLS, délky, denní limit)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    ok(psql(dbName, '', path.join(__dirname, '..', 'supabase', 'schema.sql')));
    q(`insert into auth.users (id, email, raw_user_meta_data) values ('${A}', 'a@example.com', '{"full_name": "Alice"}'), ('${B}', 'b@example.com', '{"full_name": "Bob"}'), ('${ADMIN}', 'admin@example.com', '{"full_name": "Správce"}');`);
    q(`insert into dev_admins (user_id) values ('${ADMIN}')`);

    await t.test('hráč vloží vlastní hlášení, cizí jménem jiného ne', () => {
        ok(asUser(A, report(A)));
        assert.match(denied(asUser(A, report(B)), 'cizí user_id'), /row-level security/);
        assert.match(denied(as('anon', '', report(A)), 'anon'), /permission denied|row-level security/);
        assert.equal(q('select count(*) from question_reports'), '1');
    });

    await t.test('hráč svá ani cizí hlášení nepřečte, nezmění ani nesmaže', () => {
        assert.equal(last(asUser(A, 'select count(*) from question_reports;')), '0');
        assert.equal(last(asUser(ADMIN, 'select count(*) from question_reports;')), '1');
        denied(asUser(A, `update question_reports set note = 'x';`), 'update');
        assert.equal(last(asUser(A, 'with d as (delete from question_reports returning 1) select count(*) from d;')), '0');
        denied(as('anon', '', 'select count(*) from question_reports;'), 'anon nečte');
        assert.equal(q('select count(*) from question_reports'), '1');
    });

    await t.test('omezení hodnot a délek', () => {
        denied(asUser(A, report(A).replace("'spatna-odpoved'", "'nesmysl'")), 'neznámý důvod');
        denied(asUser(A, report(A).replace("'Správně je jiné město'", `'${'x'.repeat(501)}'`)), 'dlouhý text');
        ok(asUser(A, report(A).replace("'Správně je jiné město'", `'${'x'.repeat(500)}'`)));
        denied(asUser(A, report(A).replace("'Q214'", "'Q214; drop table'")), 'tvar item_id');
        denied(asUser(A, report(A).replace("'zemepis'", "'Zeměpis'")), 'tvar tématu');
        denied(asUser(A, report(A).replace("'Které město to je?'", `'${'t'.repeat(201)}'`)), 'dlouhé zadání');
    });

    await t.test('nejvýš 20 hlášení za 24 hodin na hráče, jiný hráč není dotčen', () => {
        const have = Number(q(`select count(*) from question_reports where user_id = '${A}'`));
        for (let i = have; i < 20; i++) ok(asUser(A, report(A)));
        assert.match(denied(asUser(A, report(A)), '21. hlášení').trim(), /Dnes už jsi poslal hodně hlášení/);
        ok(asUser(B, report(B)));
        // hlášení starší než 24 hodin se do limitu nepočítají
        q(`update question_reports set created_at = now() - interval '2 days' where user_id = '${A}'`);
        ok(asUser(A, report(A)));
    });

    await t.test('dev_admins hlášení čtou a mažou', () => {
        assert.ok(Number(last(asUser(ADMIN, 'select count(*) from question_reports;'))) >= 2);
        ok(asUser(ADMIN, `delete from question_reports where user_id = '${B}';`));
        assert.equal(q(`select count(*) from question_reports where user_id = '${B}'`), '0');
        assert.equal(last(asUser(A, 'select is_dev_admin();')), 'f');
        assert.equal(last(asUser(ADMIN, 'select is_dev_admin();')), 't');
    });

    await t.test('spuštění schématu podruhé nic nerozbije', () => {
        ok(psql(dbName, '', path.join(__dirname, '..', 'supabase', 'schema.sql')));
        assert.ok(Number(q('select count(*) from question_reports')) > 0);
    });
});
