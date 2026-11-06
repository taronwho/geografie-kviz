// Chyby z provozu a verze schématu (PostgreSQL 16): zápis smí kdokoli s veřejným klíčem, čtení jen dev_admins, limity délky a počtu,
// schema_version() odpovídá REQUIRED_SCHEMA v app.js. Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_monitor_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const asUser = (uid, sql) => psql(dbName, `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${sql}`);
const asAnon = (sql) => psql(dbName, `set role anon; ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };
const insert = (extra = '', message = 'Chyba', hash = 'abc') => `insert into client_errors (kind, message, hash${extra ? ', ' + extra.split('=')[0] : ''}) values ('error', '${message}', '${hash}'${extra ? ', ' + extra.split('=')[1] : ''});`;

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

test('SQL: chyby z provozu a verze schématu', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(`insert into auth.users (id, email, raw_user_meta_data) values ('${id(1)}', 'a@example.com', '{"full_name": "Správce"}'), ('${id(2)}', 'b@example.com', '{"full_name": "Hráč"}')`);
    q(`insert into dev_admins (user_id) values ('${id(1)}')`);

    await t.test('schema_version: přihlášený ji přečte, shoduje se s REQUIRED_SCHEMA v aplikaci a je poslední v souboru', () => {
        const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
        const required = /const REQUIRED_SCHEMA = (\d+);/.exec(app)[1];
        assert.equal(asUser(id(2), 'select schema_version();').stdout.trim().split('\n').pop(), required);
        denied(asAnon('select schema_version();'), 'anon verzi nečte');
        const sql = fs.readFileSync(schema, 'utf8');
        assert.equal(/returns integer\s+language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1], required);
        assert.ok(sql.lastIndexOf('schema_version') > sql.lastIndexOf('client_errors'), 'verze je na konci souboru');
    });

    await t.test('zápis smí kdokoli s veřejným klíčem, přečíst nikdo', () => {
        ok(asAnon(insert()));
        ok(asUser(id(2), insert('', 'Jiná chyba', 'def')));
        denied(asUser(id(2), 'select * from client_errors;'), 'čtení tabulky přes API je zavřené');
        denied(asAnon('select * from client_errors;'));
        denied(asUser(id(2), `update client_errors set message = 'x';`));
        denied(asUser(id(2), 'delete from client_errors;'));
        assert.equal(q('select count(*) from client_errors'), '2');
    });

    await t.test('čas zapisuje server a nelze podstrčit id ani čas vzniku', () => {
        denied(asAnon(`insert into client_errors (kind, message, hash, id) values ('error', 'x', 'h', 999);`), 'id určuje databáze');
        denied(asAnon(`insert into client_errors (kind, message, hash, created_at) values ('error', 'x', 'h', '2001-01-01');`), 'created_at určuje server');
        ok(asAnon(`insert into client_errors (kind, message, hash, happened_at) values ('error', 'z klienta', 'cas', '2001-01-01');`));
        assert.equal(q(`select extract(year from created_at) >= 2026 from client_errors where hash = 'cas'`), 't');
    });

    await t.test('limity délky', () => {
        denied(asAnon(insert('', 'x'.repeat(501), 'dlouha')), 'zpráva nejvýš 500 znaků');
        denied(asAnon(insert('stack=' + `'${'y'.repeat(1001)}'`)), 'zásobník nejvýš 1000 znaků');
        denied(asAnon(insert('', '', 'prazdna')), 'prázdná zpráva');
        denied(asAnon(insert('', 'ok', 'h'.repeat(33))), 'otisk nejvýš 32 znaků');
        denied(asAnon(insert('app_version=' + `'${'v'.repeat(41)}'`)), 'verze nejvýš 40 znaků');
        ok(asAnon(insert('', 'x'.repeat(500), 'maximum')));
    });

    await t.test('čtení jen přes dev_client_errors() pro dev_admins, seskupené podle otisku', () => {
        denied(asUser(id(2), 'select * from dev_client_errors();'), 'hráč mimo dev_admins');
        denied(asAnon('select * from dev_client_errors();'));
        assert.equal(asUser(id(2), 'select dev_is_admin();').stdout.trim().split('\n').pop(), 'f');
        assert.equal(asUser(id(1), 'select dev_is_admin();').stdout.trim().split('\n').pop(), 't');
        ok(asAnon(insert('', 'Chyba', 'abc')));
        const rows = asUser(id(1), `select hash || ':' || count from dev_client_errors() order by hash;`).stdout.trim().split('\n').filter(line => /^\w+:\d+$/.test(line));
        assert.ok(rows.includes('abc:2'), rows.join(','));
        assert.ok(rows.includes('def:1'));
        denied(asUser(id(2), `insert into dev_admins (user_id) values ('${id(2)}');`));
    });

    await t.test('celkový limit: 100 za hodinu', () => {
        q(`delete from client_errors`);
        q(`insert into client_errors (kind, message, hash) select 'error', 'x' || n, 'h' || n from generate_series(1, 100) n`);
        assert.match(denied(asAnon(insert('', 'stý první', 'last'))), /Příliš mnoho hlášených chyb/);
        q(`update client_errors set created_at = now() - interval '2 hours'`);
        ok(asAnon(insert('', 'znovu povoleno', 'again')));
    });

    await t.test('celkový limit: 500 za den', () => {
        q(`delete from client_errors`);
        // hromadné založení mimo trigger, řádky se zestárnou na 3 hodiny (hodinový limit tak neplatí, denní ano)
        q(`alter table client_errors disable trigger client_errors_limit; insert into client_errors (kind, message, hash) select 'error', 'x' || n, 'h' || n from generate_series(1, 500) n; alter table client_errors enable trigger client_errors_limit; update client_errors set created_at = now() - interval '3 hours';`);
        assert.match(denied(asAnon(insert('', 'pětistá první', 'late'))), /Příliš mnoho hlášených chyb/);
    });
});
