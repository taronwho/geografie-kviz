// Postup bonusových funkcí v účtu (PostgreSQL 16, schéma 52): bonus_progress a bonus_progress_save. Zápis jen ke stejné verzi řádku
// (souběh dvou zařízení: druhý zápis ke staré verzi vrátí null a nic nepřepíše), čtení jen vlastního řádku (RLS), přímý zápis do tabulky
// zakázaný, tvar a strop velikosti, export_my_data a smazání účtu. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_bonus_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const as = (uid, sql, role = 'authenticated') => psql(dbName, `set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
};
const save = (uid, data, rev) => as(uid, `select coalesce(bonus_progress_save('${JSON.stringify(data).replace(/'/g, "''")}'::jsonb, ${rev})::text, 'null');`);

const bootstrap = `
do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, public;`;

const A = id(1);
const B = id(2);

test('SQL: postup bonusových funkcí v účtu (bonus_progress, schéma 52)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(`insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');`);

    await t.test('verze schématu je aspoň 52', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 52);
    });

    await t.test('první zápis k verzi 0, další jen ke stejné verzi; souběžný zápis ke staré verzi nic nepřepíše', () => {
        assert.equal(last(ok(as(A, 'select count(*) from bonus_progress;'))), '0', 'bez zápisu žádný řádek');
        assert.equal(last(ok(save(A, { v: 1, learned: { zemepis: ['Q1'] } }, 0))), '1');
        // Druhé zařízení četlo před prvním zápisem (verze 0): odmítnuto
        assert.equal(last(ok(save(A, { v: 1, learned: { zemepis: ['Q2'] } }, 0))), 'null');
        assert.equal(last(ok(save(A, { v: 1, learned: { zemepis: ['Q1', 'Q2'] } }, 1))), '2');
        // Obě zařízení načetla verzi 2: první zapíše, druhé ke staré verzi neprojde
        assert.equal(last(ok(save(A, { v: 1, learned: { zemepis: ['Q1', 'Q2', 'Q3'] } }, 2))), '3');
        assert.equal(last(ok(save(A, { v: 1, learned: { zemepis: ['Q9'] } }, 2))), 'null');
        assert.equal(last(ok(save(A, { v: 1 }, 7))), 'null', 'neexistující verze');
        assert.equal(last(ok(as(A, `select (data->'learned'->'zemepis')::text || rev::text from bonus_progress;`))).replace(/\s/g, ''), '["Q1","Q2","Q3"]3');
    });

    await t.test('čtení jen vlastního řádku, přímý zápis do tabulky zakázaný, bez přihlášení nic', () => {
        assert.equal(last(ok(save(B, { v: 1, snack: { best: 4 } }, 0))), '1');
        assert.equal(last(ok(as(B, 'select count(*) from bonus_progress;'))), '1');
        assert.equal(last(ok(as(B, `select count(*) from bonus_progress where user_id = '${A}';`))), '0', 'cizí řádek RLS skryje');
        denied(as(B, `update bonus_progress set rev = 0 where user_id = '${B}';`), /permission denied/);
        denied(as(B, `insert into bonus_progress (user_id, data) values ('${B}', '{}');`), /permission denied/);
        denied(as(B, `delete from bonus_progress where user_id = '${B}';`), /permission denied/);
        denied(as(null, `select bonus_progress_save('{}'::jsonb, 0);`), /Přihlas se/);
        denied(as(null, 'select count(*) from bonus_progress;', 'anon'), /permission denied/);
        denied(as(null, `select bonus_progress_save('{}'::jsonb, 0);`, 'anon'), /permission denied/);
    });

    await t.test('tvar a velikost: jen objekt, nejvýš 512 KiB, platná verze', () => {
        denied(as(B, `select bonus_progress_save('[1,2]'::jsonb, 1);`), /Neplatný postup/);
        denied(as(B, `select bonus_progress_save('"text"'::jsonb, 1);`), /Neplatný postup/);
        denied(as(B, `select bonus_progress_save(null, 1);`), /Neplatný postup/);
        denied(as(B, `select bonus_progress_save('{}'::jsonb, -1);`), /Neplatná verze/);
        denied(as(B, `select bonus_progress_save(jsonb_build_object('x', repeat('a', 530000)), 1);`), /příliš velký/);
        // Velký, ale povolený dokument (jako 30 000 poznaných položek)
        assert.equal(last(ok(as(B, `select bonus_progress_save(jsonb_build_object('learned', jsonb_build_object('zemepis', (select jsonb_agg('Q' || g) from generate_series(1000000, 1030000) g))), 1);`))), '2');
        assert.equal(last(ok(as(B, 'select rev from bonus_progress;'))), '2');
    });

    await t.test('export_my_data má bonusovy_postup, smazání účtu ho smaže', () => {
        const exported = JSON.parse(last(ok(as(A, 'select export_my_data()::text;'))));
        assert.equal(exported.bonusovy_postup.verze, 3);
        assert.deepEqual(exported.bonusovy_postup.data.learned.zemepis, ['Q1', 'Q2', 'Q3']);
        const empty = JSON.parse(last(ok(as(id(9), 'select export_my_data()::text;'))));
        assert.equal(empty.bonusovy_postup, null);
        ok(as(A, 'select delete_my_account();'));
        assert.equal(q(`select count(*) from bonus_progress where user_id = '${A}'`), '0');
        assert.equal(q(`select count(*) from bonus_progress where user_id = '${B}'`), '1');
    });
});
