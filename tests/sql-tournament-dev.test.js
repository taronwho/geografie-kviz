// Vývojářské nástroje turnajů (PostgreSQL 16): jen pro dev_admins, 31 botů, okamžitý start, skok o kolo, mazání botů.
// Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_tourdev_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Jako přihlášený hráč v daný den (jedna relace, ať platí nastavení dne)
const as = (uid, day, sql) => psql(dbName, `set mudrlant.test_today = '${day}'; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };
const tick = (day) => ok(psql(dbName, `set mudrlant.test_today = '${day}'; select tournament_tick();`));

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


const WED = '2026-11-04';

test('SQL: vývojářské nástroje turnajů (boti)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    ok(psql(dbName, '', path.join(__dirname, '..', 'supabase', 'schema.sql')));
    q(`insert into auth.users (id, email, raw_user_meta_data) values ('${id(1)}', 'u1@example.com', '{"full_name": "Vývojář"}'), ('${id(2)}', 'u2@example.com', '{"full_name": "Někdo"}');`);
    tick(WED);
    const tid = q(`select id from tournaments where status = 'open'`);

    await t.test('bez zápisu v dev_admins jsou nástroje zakázané', () => {
        for (const sql of [`select dev_tournament_add_bots('${tid}', 31);`, `select dev_tournament_start_now('${tid}');`, `select dev_tournament_next_round('${tid}');`, `select dev_tournament_clear_bots();`]) {
            assert.match(denied(as(id(2), WED, sql)), /nejsou pro tento účet zapnuté/);
        }
        denied(as(id(2), WED, `insert into dev_admins (user_id) values ('${id(2)}');`), 'zapsat se do dev_admins nejde');
        denied(as(id(2), WED, `select dev_bots_play('${tid}');`), 'interní funkce se přes API nevolá');
        q(`insert into dev_admins (user_id) values ('${id(1)}')`);
    });

    await t.test('31 botů + vývojář = 32 hráčů, turnaj se spustí hned a boti odehrají 1. kolo', () => {
        ok(as(id(1), WED, `select tournament_join('${tid}');`));
        assert.equal(as(id(1), WED, `select dev_tournament_add_bots('${tid}', 31);`).stdout.trim().split('\n').pop(), '31');
        assert.equal(q(`select count(*) from tournament_entries where tournament_id = '${tid}'`), '32');
        assert.equal(q(`select count(*) from auth.users where email like 'bot-%@bots.invalid'`), '31');
        assert.equal(q(`select count(*) from profiles where avatar = '🤖'`), '31');
        ok(as(id(1), WED, `select dev_tournament_start_now('${tid}');`));
        assert.equal(q(`select status || ' ' || size || ' ' || rounds || ' ' || started_on from tournaments where id = '${tid}'`), 'running 32 5 2026-11-04');
        assert.equal(q(`select count(*) from tournament_matches where round = 1`), '16');
        // zápasy dvou botů jsou hotové (rozhodl výsledek), zápas vývojáře čeká na něj
        const mine = q(`select id from tournament_matches where round = 1 and '${id(1)}' in (p1, p2)`);
        assert.equal(q(`select winner is null from tournament_matches where id = '${mine}'`), 't');
        assert.equal(q(`select count(*) from tournament_matches where round = 1 and winner is not null`), '15');
        // vývojář svůj zápas může odehrát (dnes je den 1. kola)
        ok(as(id(1), WED, `select tournament_start_match('${mine}'); select tournament_finish_match('${mine}', 10, 40);`));
        assert.equal(q(`select winner is not null from tournament_matches where id = '${mine}'`), 't');
    });

    await t.test('skok na další kola až do konce turnaje', () => {
        // Po odehrání mého zápasu už 2. kolo existuje (boti ho odehráli hned); každý skok odehraje kolo a založí další
        // Můj zápas ve 2. kole nehraju: první skok ho nechá do konce dne, druhý skok ho rozhodne kontumačně
        const roundsSeen = [];
        for (let i = 0; i < 12 && q(`select status from tournaments where id = '${tid}'`) === 'running'; i++) {
            roundsSeen.push(q(`select max(round) from tournament_matches where tournament_id = '${tid}'`));
            ok(as(id(1), WED, `select dev_tournament_next_round('${tid}');`));
        }
        const seen = [...new Set(roundsSeen)].map(Number);
        assert.ok(seen.every((round, i) => i === 0 || (round > seen[i - 1] && round - seen[i - 1] <= 2)), `kola postupují po jednom až po dvou (kontumační skok): ${seen}`);
        assert.equal(seen[seen.length - 1], 5, 'dojde se až do finále');
        assert.equal(q(`select count(*) from tournament_notices where kind = 'eliminated_noplay' and user_id = '${id(1)}'`), '1', 'neodehraný zápas se rozhodl kontumačně');
        assert.equal(q(`select count(*) from tournament_matches where round = 5`), '2', 'finále a zápas o 3. místo');
        assert.equal(q(`select count(*) from tournament_matches where round = 2`), '8');
        assert.equal(q(`select status from tournaments where id = '${tid}'`), 'finished');
        assert.equal(q(`select string_agg(place::text, ',' order by place) from tournament_entries where tournament_id = '${tid}' and place in (1, 2, 3, 4)`), '1,2,3,4');
        denied(as(id(1), WED, `select dev_tournament_next_round('${tid}');`), 'skončený turnaj dál nejde');
    });

    await t.test('mazání botů: pryč boti i turnaje, ve kterých hráli; lidé zůstanou', () => {
        assert.equal(as(id(1), WED, `select dev_tournament_clear_bots();`).stdout.trim().split('\n').pop(), '31');
        assert.equal(q(`select count(*) from auth.users where email like 'bot-%@bots.invalid'`), '0');
        assert.equal(q(`select count(*) from profiles`), '2');
        assert.equal(q(`select count(*) from tournaments where id = '${tid}'`), '0', 'turnaj s boty je pryč');
        // otevřený turnaj přijde jen o boty
        tick('2026-11-05');
        const open = q(`select id from tournaments where status = 'open' order by week_start limit 1`);
        ok(as(id(1), '2026-11-05', `select tournament_join('${open}');`));
        ok(as(id(1), '2026-11-05', `select dev_tournament_add_bots('${open}', 5);`));
        assert.equal(q(`select count(*) from tournament_entries where tournament_id = '${open}'`), '6');
        ok(as(id(1), '2026-11-05', `select dev_tournament_clear_bots();`));
        assert.equal(q(`select count(*) from tournament_entries where tournament_id = '${open}'`), '1');
        assert.equal(q(`select count(*) from tournaments where id = '${open}'`), '1');
    });
});
