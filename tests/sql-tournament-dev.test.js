// Vývojářské nástroje turnajů (PostgreSQL 16): jen pro dev_admins, 31 botů, okamžitý start, skok o kolo, mazání botů.
// Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { finishMatchSql } = require('./sql-play.js');

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
        ok(as(id(1), WED, `select tournament_start_match('${mine}'); ${finishMatchSql(mine, 10, 40)}`));
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

    await t.test('smazání odehraného turnaje znovu otevře přihlášky', () => {
        // Po dev startu žádný turnaj s otevřenými přihláškami není (běžící blokuje týden); po smazání vznikne nový otevřený
        assert.equal(q(`select count(*) from tournaments where status = 'open'`), '0');
        denied(as(id(2), WED, `select dev_tournament_reset();`), 'jen dev_admins');
        assert.equal(as(id(1), WED, `select dev_tournament_reset();`).stdout.trim().split('\n').pop(), '1');
        assert.equal(q(`select count(*) from tournaments where status = 'finished' or status = 'running'`), '0');
        assert.equal(q(`select count(*) from tournaments where status = 'open'`), '1', 'přihlášky se znovu otevřely');
        assert.equal(q(`select count(*) from tournament_matches`), '0');
        assert.equal(q(`select count(*) from tournament_entries`), '0');
        // otevřený turnaj reset nesmaže
        assert.equal(as(id(1), WED, `select dev_tournament_reset();`).stdout.trim().split('\n').pop(), '0');
        assert.equal(q(`select count(*) from tournaments where status = 'open'`), '1');
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

    await t.test('boti hrají své kolo sami každý den od 9:00, vývojář je může pustit hned', () => {
        const D1 = '2026-11-06', D2 = '2026-11-07';
        const at = (day, time, sql) => psql(dbName, `set mudrlant.test_today = '${day}'; set mudrlant.test_time = '${time}'; ${sql}`);
        const tour = q(`select id from tournaments where status = 'open' order by week_start limit 1`);
        ok(as(id(1), D1, `select dev_tournament_add_bots('${tour}', 31);`));
        ok(as(id(1), D1, `select dev_tournament_start_now('${tour}');`));
        const botsIn = (round) => q(`select count(*) from tournament_results r join tournament_matches m on m.id = r.match_id
            where m.tournament_id = '${tour}' and m.round = ${round} and r.finished_at is not null and dev_is_bot(r.user_id)`);
        assert.equal(botsIn(1), '31', 'při startu boti odehrají 1. kolo hned');
        // Boti mají odpovědi po otázkách (správně, body 4/3/2/1 podle nápověd, čas) a výsledek je jejich součet
        assert.equal(q(`select count(*) from tournament_answers a join tournament_matches m on m.id = a.match_id where m.tournament_id = '${tour}' and m.round = 1`), '310');
        assert.equal(q(`select count(*) from tournament_answers where hints is null or ms is null or hints not between 0 and 3 or (correct and points <> greatest(4 - hints, 1)) or (not correct and points <> 0)`), '0');
        assert.equal(q(`select count(*) from tournament_results r join tournament_matches m on m.id = r.match_id
            cross join lateral (select count(*) filter (where a.correct)::integer as c, sum(a.points)::integer as p, sum(a.ms)::integer as t from tournament_answers a where a.match_id = r.match_id and a.user_id = r.user_id) s
            where m.tournament_id = '${tour}' and dev_is_bot(r.user_id) and (r.correct <> s.c or r.points <> s.p or r.time_ms <> s.t)`), '0', 'výsledek = součet odpovědí');
        const mine = q(`select id from tournament_matches where tournament_id = '${tour}' and round = 1 and '${id(1)}' in (p1, p2)`);
        ok(as(id(1), D1, `select tournament_start_match('${mine}'); ${finishMatchSql(mine, 10, 40)}`));
        assert.equal(q(`select max(round) from tournament_matches where tournament_id = '${tour}'`), '2');
        // 2. kolo má svůj den až zítra: dnes ani zítra před devátou boti nehrají
        ok(at(D1, '23:00', 'select tournament_tick();'));
        ok(at(D2, '08:59', 'select tournament_tick();'));
        assert.equal(botsIn(2), '0', 'před 9:00 boti čekají');
        // v 9:00 je odehraje jakýkoli tick (otevření aplikace, odesílání upozornění, pg_cron)
        ok(at(D2, '09:00', 'select tournament_tick();'));
        assert.ok(Number(botsIn(2)) >= 15, `v 9:00 boti odehráli 2. kolo (${botsIn(2)})`);
        assert.equal(q(`select count(*) from tournament_matches where tournament_id = '${tour}' and round = 2 and winner is null`), '1', 'čeká jen můj zápas');
        // interní funkce přes API nejdou, vývojářské tlačítko jen pro dev_admins; podruhé už boti nemají co hrát
        denied(as(id(2), D2, 'select tournament_bots_due();'));
        assert.match(denied(as(id(2), D2, `select dev_tournament_bots_play('${tour}');`)), /nejsou pro tento účet zapnuté/);
        assert.equal(as(id(1), D2, `select dev_tournament_bots_play('${tour}');`).stdout.trim().split('\n').pop(), '0');
    });

    await t.test('tlačítko „Boti odehrají kolo“ pustí boty hned i před 9:00', () => {
        const tour = q(`select id from tournaments where status = 'running' order by week_start limit 1`);
        const mine = q(`select id from tournament_matches where tournament_id = '${tour}' and round = 2 and '${id(1)}' in (p1, p2)`);
        ok(as(id(1), '2026-11-07', `select tournament_start_match('${mine}'); ${finishMatchSql(mine, 10, 40)}`));
        assert.equal(q(`select max(round) from tournament_matches where tournament_id = '${tour}'`), '3');
        // posun o den (jako dev skok), ale ráno v 7:00: tick nic, tlačítko ano
        q(`update tournaments set started_on = started_on - 1 where id = '${tour}'`);
        ok(psql(dbName, `set mudrlant.test_today = '2026-11-07'; set mudrlant.test_time = '07:00'; select tournament_tick();`));
        const played = as(id(1), '2026-11-07', `set mudrlant.test_time = '07:00'; select dev_tournament_bots_play('${tour}');`);
        assert.ok(Number(ok(played).stdout.trim().split('\n').pop()) >= 1, played.stdout);
    });
});
