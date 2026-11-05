// Test rating/lig/žebříčku v databázi (PostgreSQL 16). Spouští se jen když je dostupný psql a server
// (PGHOST/PGPORT, výchozí /tmp:5439, uživatel postgres); jinak se přeskočí.
// Vytvoří si dočasnou databázi, napodobí Supabase (role, auth.uid()) a pustí supabase/schema.sql dvakrát.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_rating_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'];
// Jako klient (PostgREST): role authenticated + přihlášený uživatel
const asUser = (uid, sql) => psql(dbName, `begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true); ${sql}; commit;`);
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const play = (code, uid, correct, points) => { const r = asUser(uid, `insert into challenge_results (challenge_id, user_id, correct, points) values ('${code}', '${uid}', ${correct}, ${points})`); assert.equal(r.status, 0, r.stderr); };
const challenge = (code, creator) => q(`insert into challenges (id, creator_id, topic, seed, count) values ('${code}', '${creator}', 'mix', 's', 10)`);
const rating = (uid) => Number(q(`select rating from profiles where id = '${uid}'`));

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
alter default privileges in schema public grant all on tables to anon, authenticated;`;

test('SQL: rating, ligy a žebříček', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) { const r = psql(dbName, '', schema); assert.equal(r.status, 0, `schema.sql běh ${run + 1}: ${r.stderr}`); }
    q(ids.map((id, i) => `insert into auth.users (id, email) values ('${id}', 'hrac${i}@example.com')`).join(';'));

    await t.test('výchozí rating 1000 a ligy podle hranic', () => {
        assert.equal(rating(ids[0]), 1000);
        const leagues = q(`select string_agg(rating_league(r), ',') from unnest(array[100, 1099, 1100, 1249, 1250, 1399, 1400, 1549, 1550, 1699, 1700, 3000]) r`);
        assert.equal(leagues, 'bronz,bronz,stribro,stribro,zlato,zlato,platina,platina,diamant,diamant,mistr,mistr');
    });

    await t.test('klient rating zapsat nemůže', () => {
        // sloupec rating nemá klient oprávnění měnit (a kdyby měl, vrátí ho trigger zpět)
        const denied = asUser(ids[0], `update profiles set rating = 4000, rated_games = 99 where id = '${ids[0]}'`);
        assert.notEqual(denied.status, 0);
        const r = asUser(ids[0], `update profiles set display_name = 'Přejmenován' where id = '${ids[0]}'`);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(rating(ids[0]), 1000);
        assert.equal(q(`select rated_games from profiles where id = '${ids[0]}'`), '0');
        assert.equal(q(`select display_name from profiles where id = '${ids[0]}'`), 'Přejmenován');
        const h = asUser(ids[0], `insert into rating_history (challenge_id, user_id, outcome, delta, rating_after) values ('X', '${ids[0]}', 'win', 5, 5)`);
        assert.notEqual(h.status, 0);
    });

    await t.test('sólová hra rating nemění; po druhém výsledku se spočítá ELO jednou', () => {
        challenge('AAAAAA', ids[0]);
        play('AAAAAA', ids[0], 8, 20);
        assert.equal(rating(ids[0]), 1000);
        assert.equal(q(`select count(*) from rating_history`), '0');
        play('AAAAAA', ids[1], 5, 12);
        assert.equal(rating(ids[0]), 1012);
        assert.equal(rating(ids[1]), 988);
        assert.equal(q(`select outcome || delta from rating_history where user_id = '${ids[0]}'`), 'win12');
        assert.equal(q(`select outcome || delta from rating_history where user_id = '${ids[1]}'`), 'loss-12');
        // opakovaný zápis (už existující výsledek) ani třetí hráč nic nezmění
        const dup = asUser(ids[1], `insert into challenge_results (challenge_id, user_id, correct, points) values ('AAAAAA', '${ids[1]}', 10, 40) on conflict do nothing`);
        assert.equal(dup.status, 0, dup.stderr);
        play('AAAAAA', ids[2], 10, 40);
        assert.equal(rating(ids[0]), 1012);
        assert.equal(rating(ids[1]), 988);
        assert.equal(rating(ids[2]), 1000);
        assert.equal(q(`select count(*) from rating_history`), '2');
        assert.equal(q(`select rated_games from profiles where id = '${ids[0]}'`), '1');
    });

    await t.test('shoda správných rozhoduje body; úplná shoda je remíza (mírně silnější skoro nic)', () => {
        challenge('BBBBBB', ids[2]);
        play('BBBBBB', ids[2], 6, 15);
        play('BBBBBB', ids[3], 6, 15);
        assert.equal(q(`select outcome from rating_history where challenge_id = 'BBBBBB' and user_id = '${ids[2]}'`), 'draw');
        assert.equal(rating(ids[2]), 1000);
        challenge('CCCCCC', ids[0]);
        play('CCCCCC', ids[0], 7, 20);
        play('CCCCCC', ids[3], 7, 20);
        assert.equal(rating(ids[0]), 1012);
        assert.equal(rating(ids[3]), 1000);
        challenge('DDDDDD', ids[3]);
        play('DDDDDD', ids[3], 7, 18);
        play('DDDDDD', ids[2], 7, 25);
        assert.equal(q(`select outcome from rating_history where challenge_id = 'DDDDDD' and user_id = '${ids[2]}'`), 'win');
    });

    await t.test('součet změn je nulový, stejná dvojice max. 3x za týden (pak změna 0)', () => {
        const before = q(`select sum(rating) from profiles`);
        for (const code of ['EEEEE1', 'EEEEE2', 'EEEEE3', 'EEEEE4']) {
            challenge(code, ids[0]);
            play(code, ids[0], 9, 30);
            play(code, ids[1], 3, 5);
        }
        assert.equal(q(`select sum(rating) from profiles`), before);
        assert.equal(q(`select capped::text || delta from rating_history where challenge_id = 'EEEEE4' and user_id = '${ids[0]}'`), 'true0');
        assert.equal(q(`select count(*) from rating_history where challenge_id like 'EEEEE%' and capped`), '4');
    });

    await t.test('týdenní žebříček: veřejná pole, řazení, jen přihlášení', () => {
        const r = asUser(ids[0], `select display_name, league, week_delta, week_wins, week_games, rating from weekly_leaderboard()`);
        assert.equal(r.status, 0, r.stderr);
        const rows = r.stdout.trim().split('\n').filter(line => line.includes('|'));
        assert.ok(rows.length >= 3);
        const deltas = rows.map(row => Number(row.split('|')[2]));
        assert.deepEqual(deltas, [...deltas].sort((a, b) => b - a));
        q(`update profiles set owl = 'robe=zelena' where id = '${ids[0]}'`);
        assert.match(asUser(ids[0], `select owl from weekly_leaderboard() where id = '${ids[0]}'`).stdout, /robe=zelena/, 'žebříček vrací i sovu');
        const anon = psql(dbName, `begin; set local role anon; select * from weekly_leaderboard(); commit;`);
        assert.notEqual(anon.status, 0);
    });
});
