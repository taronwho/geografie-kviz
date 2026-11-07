// Přátelé, blokování, reakce po zápase a nahlášení (PostgreSQL 16): RLS, triggery a funkce ze sekce „Sociální vrstva“ v supabase/schema.sql.
// Spouští se jen když je dostupný psql a server (viz tests/sql-security.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_social_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const D = '44444444-4444-4444-4444-444444444444';
const as = (role, uid, sql) => psql(dbName, `set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const asUser = (uid, sql) => as('authenticated', uid, sql);
const last = (result) => result.stdout.trim().split('\n').pop();
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => assert.equal(r.status, 0, r.stderr);
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };
const count = (uid, sql) => Number(last(asUser(uid, `select count(*) from (${sql}) x`)));

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

test('SQL: přátelé, blokování, reakce a nahlášení', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) { const r = psql(dbName, '', schema); assert.equal(r.status, 0, `schema.sql běh ${run + 1}: ${r.stderr}`); }
    q(`insert into auth.users (id, email, raw_user_meta_data) values
        ('${A}', 'a@example.com', '{"full_name": "Alena"}'), ('${B}', 'b@example.com', '{"full_name": "Bohumil"}'),
        ('${C}', 'c@example.com', '{"full_name": "Cecil"}'), ('${D}', 'd@example.com', '{"full_name": "Dana"}')`);

    await t.test('žádost o přátelství: jen sám za sebe, ne sám sobě, ne jako přijatá', () => {
        denied(asUser(A, `insert into friendships (user_id, friend_id) values ('${A}', '${A}')`), 'sám sobě');
        denied(asUser(A, `insert into friendships (user_id, friend_id) values ('${B}', '${C}')`), 'za jiného');
        denied(as('anon', null, `insert into friendships (user_id, friend_id) values ('${A}', '${B}')`), 'bez přihlášení');
        // status accepted v žádosti se přepíše na pending, nikdy se nevloží jako přijatý
        ok(asUser(A, `insert into friendships (user_id, friend_id, status) values ('${A}', '${B}', 'accepted')`));
        assert.equal(q(`select status from friendships where user_id = '${A}' and friend_id = '${B}'`), 'pending');
    });

    await t.test('cizí žádosti nikdo nevidí, přijímá jen oslovený', () => {
        assert.equal(count(C, `select * from friendships`), 0, 'třetí hráč nevidí nic');
        assert.equal(count(A, `select * from friendships`), 1);
        assert.equal(count(B, `select * from friendships`), 1);
        // žadatel se sám nepřijme, třetí také ne
        assert.equal(last(asUser(A, `with u as (update friendships set status = 'accepted' where user_id = '${A}' returning 1) select count(*) from u`)), '0');
        assert.equal(last(asUser(C, `with u as (update friendships set status = 'accepted' returning 1) select count(*) from u`)), '0');
        denied(asUser(B, `update friendships set user_id = '${C}' where friend_id = '${B}'`), 'dvojici měnit nejde');
        denied(asUser(B, `update friendships set created_at = '2000-01-01' where friend_id = '${B}'`));
        assert.equal(last(asUser(C, `with d as (delete from friendships returning 1) select count(*) from d`)), '0', 'třetí nic nesmaže');
        assert.equal(q(`select status from friendships where user_id = '${A}'`), 'pending');
        // friends_list: oba vidí jen svou dvojici, směr podle strany
        assert.equal(last(asUser(B, `select direction || ':' || status from friends_list()`)), 'in:pending');
        assert.equal(last(asUser(A, `select direction || ':' || status from friends_list()`)), 'out:pending');
        assert.equal(count(C, `select * from friends_list()`), 0);
        ok(asUser(B, `update friendships set status = 'accepted' where user_id = '${A}' and friend_id = '${B}'`));
        assert.equal(q(`select status from friendships where user_id = '${A}'`), 'accepted');
        denied(asUser(B, `update friendships set status = 'pending' where user_id = '${A}'`), 'zpět na čekající ne');
        denied(asUser(B, `update friendships set status = 'cokoli' where user_id = '${A}'`));
    });

    await t.test('opačná čekající žádost se rovnou přijme, duplicita nevznikne', () => {
        ok(asUser(C, `insert into friendships (user_id, friend_id) values ('${C}', '${D}')`));
        ok(asUser(D, `insert into friendships (user_id, friend_id) values ('${D}', '${C}')`));
        assert.equal(q(`select count(*) || ':' || min(status) from friendships where '${C}' in (user_id, friend_id)`), '1:accepted');
        // další žádost téže dvojice nic nepřidá
        asUser(C, `insert into friendships (user_id, friend_id) values ('${C}', '${D}')`);
        assert.equal(q(`select count(*) from friendships where '${C}' in (user_id, friend_id)`), '1');
    });

    await t.test('zrušit přátelství může kdokoli z dvojice', () => {
        assert.equal(last(asUser(D, `with d as (delete from friendships where user_id = '${C}' and friend_id = '${D}' returning 1) select count(*) from d`)), '1');
        assert.equal(q(`select count(*) from friendships where '${C}' in (user_id, friend_id)`), '0');
    });

    await t.test('limit žádostí za hodinu a limit počtu přátel', () => {
        const ids = Array.from({ length: 31 }, (_, i) => `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, '0')}`);
        q(`insert into auth.users (id, email) select x, x || '@e.com' from unnest(array['${ids.join("','")}']::uuid[]) x`);
        for (let i = 0; i < 30; i++) ok(asUser(C, `insert into friendships (user_id, friend_id) values ('${C}', '${ids[i]}')`));
        denied(asUser(C, `insert into friendships (user_id, friend_id) values ('${C}', '${ids[30]}')`), '31. žádost za hodinu');
        q(`delete from friendships where user_id = '${C}'`);
        // 200 přátel
        q(`set session_replication_role = replica; insert into friendships (user_id, friend_id, status) select '${C}', x, 'accepted' from unnest(array['${ids.join("','")}']::uuid[]) x`);
        assert.equal(q(`select friend_count('${C}')`), '31');
        q(`delete from friendships where user_id = '${C}'`);
        q(`insert into auth.users (id, email) select gen_random_uuid(), 'm' || g || '@e.com' from generate_series(1, 200) g`);
        q(`set session_replication_role = replica; insert into friendships (user_id, friend_id, status, created_at) select '${D}', id, 'accepted', now() - interval '2 days' from profiles where id not in ('${D}', '${A}', '${B}', '${C}') limit 200`);
        assert.equal(q(`select friend_count('${D}')`), '200');
        denied(asUser(D, `insert into friendships (user_id, friend_id) values ('${D}', '${A}')`), 'přes 200 přátel');
        q(`delete from friendships where user_id = '${D}'`);
    });

    await t.test('blok: nahlížení jen vlastních, nejde zablokovat sebe, ruší přátelství', () => {
        denied(asUser(A, `insert into player_blocks (blocker, blocked) values ('${A}', '${A}')`), 'sebe');
        denied(asUser(A, `insert into player_blocks (blocker, blocked) values ('${C}', '${A}')`), 'za jiného');
        ok(asUser(A, `insert into player_blocks (blocker, blocked) values ('${A}', '${B}')`));
        assert.equal(q(`select count(*) from friendships where user_id = '${A}' and friend_id = '${B}'`), '0', 'přátelství skončilo');
        assert.equal(count(A, `select * from player_blocks`), 1);
        assert.equal(count(B, `select * from player_blocks`), 0, 'zablokovaný o bloku neví');
        assert.equal(last(asUser(B, `with d as (delete from player_blocks returning 1) select count(*) from d`)), '0', 'cizí blok nesmaže');
        denied(asUser(B, `insert into friendships (user_id, friend_id) values ('${B}', '${A}')`), 'žádost přes blok');
        denied(asUser(A, `insert into friendships (user_id, friend_id) values ('${A}', '${B}')`), 'žádost blokovanému');
    });

    await t.test('blok: hledání, náhodný soupeř a výzva obejdou blokovaného (oběma směry)', () => {
        assert.equal(count(A, `select * from search_players('Bohu')`), 0);
        assert.equal(count(B, `select * from search_players('Alen')`), 0);
        assert.equal(count(C, `select * from search_players('Bohu')`), 1);
        assert.equal(count(C, `select * from search_players('B')`), 0, 'krátký dotaz nic nevrací');
        assert.equal(count(C, `select * from search_players('%%')`), 0, 'zástupné znaky se berou doslova');
        // náhodný soupeř: nikdy blokovaný, ani ten, kdo blokoval mě
        q(`delete from profiles where id not in ('${A}', '${B}')`);
        for (let i = 0; i < 5; i++) {
            assert.equal(count(A, `select * from random_opponent()`), 0);
            assert.equal(count(B, `select * from random_opponent()`), 0);
        }
        denied(asUser(A, `insert into challenges (id, creator_id, topic, seed, count, invited_id) values ('BLOK01', '${A}', 'mix', 's', 10, '${B}')`), 'výzva blokovanému');
        denied(asUser(B, `insert into challenges (id, creator_id, topic, seed, count, invited_id) values ('BLOK02', '${B}', 'mix', 's', 10, '${A}')`), 'výzva tomu, kdo mě blokoval');
        ok(asUser(A, `insert into challenges (id, creator_id, topic, seed, count) values ('OTEVRE', '${A}', 'mix', 's', 10)`));
        ok(asUser(A, `delete from player_blocks where blocker = '${A}'`));
        assert.equal(count(A, `select * from search_players('Bohu')`), 1);
        ok(asUser(A, `insert into challenges (id, creator_id, topic, seed, count, invited_id) values ('BLOK03', '${A}', 'mix', 's', 10, '${B}')`));
    });

    await t.test('reakce: jen mezi účastníky odehrané výzvy, jedna na výzvu, přepsat jde jen emoji', () => {
        q(`insert into challenge_results (challenge_id, user_id, correct, points) values ('BLOK03', '${A}', 5, 50), ('BLOK03', '${B}', 4, 40)`);
        denied(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('BLOK03', '${A}', '${A}', '🔥')`), 'sobě');
        denied(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('BLOK03', '${B}', '${A}', '🔥')`), 'za jiného');
        denied(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('BLOK03', '${A}', '${B}', '💩')`), 'neznámé emoji');
        denied(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('OTEVRE', '${A}', '${B}', '🔥')`), 'B výzvu nehrál');
        denied(asUser(A, `insert into match_reactions (from_id, to_id, emoji) values ('${A}', '${B}', '🔥')`), 'bez zápasu');
        ok(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('BLOK03', '${A}', '${B}', '🔥')`));
        denied(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('BLOK03', '${A}', '${B}', '👍')`), 'druhá reakce stejné výzvy');
        // přepsání tak, jak ho posílá PostgREST (upsert se všemi sloupci)
        ok(asUser(A, `insert into match_reactions (challenge_id, match_id, from_id, to_id, emoji) values ('BLOK03', null, '${A}', '${B}', '🤝') on conflict (challenge_id, match_id, from_id) do update set challenge_id = excluded.challenge_id, match_id = excluded.match_id, from_id = excluded.from_id, to_id = excluded.to_id, emoji = excluded.emoji`));
        assert.equal(q(`select emoji from match_reactions where challenge_id = 'BLOK03'`), '🤝');
        assert.equal(q(`select count(*) from match_reactions`), '1');
        // příjemce ji vidí, nikdo jiný ne; příjemce ji nezmění
        assert.equal(count(B, `select * from match_reactions`), 1);
        assert.equal(count(C, `select * from match_reactions`), 0);
        assert.equal(last(asUser(B, `with u as (update match_reactions set emoji = '👍' returning 1) select count(*) from u`)), '0');
        ok(asUser(A, `update match_reactions set to_id = '${A}', challenge_id = 'OTEVRE'`));
        assert.equal(q(`select to_id || challenge_id from match_reactions`), `${B}BLOK03`, 'příjemce ani výzva se nemění (drží trigger)');
        // blok reakce zastaví
        q(`insert into player_blocks (blocker, blocked) values ('${B}', '${A}')`);
        denied(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('BLOK03', '${A}', '${B}', '👍')`).toString() || 'x');
        q(`delete from player_blocks`);
    });

    await t.test('reakce k zápasu turnaje: jen oba účastníci zápasu', () => {
        q(`insert into tournaments (topic, week_start, status) values ('mix', current_date, 'running')`);
        const tid = q(`select id from tournaments limit 1`);
        q(`insert into tournament_matches (tournament_id, round, slot, p1, p2) values ('${tid}', 1, 1, '${A}', '${B}')`);
        const mid = q(`select id from tournament_matches limit 1`);
        ok(asUser(B, `insert into match_reactions (match_id, from_id, to_id, emoji) values ('${mid}', '${B}', '${A}', '🤝')`));
        denied(asUser(D, `insert into match_reactions (match_id, from_id, to_id, emoji) values ('${mid}', '${D}', '${A}', '🤝')`), 'cizí zápas');
        denied(asUser(A, `insert into match_reactions (challenge_id, match_id, from_id, to_id, emoji) values ('BLOK03', '${mid}', '${A}', '${B}', '🤝')`), 'výzva i zápas najednou');
    });

    await t.test('nahlášení: vlastní, ne sám na sebe, limity, vidí jen reporter a správce', () => {
        denied(asUser(A, `insert into player_reports (reporter, reported, reason) values ('${A}', '${A}', 'jine')`), 'sám sebe');
        denied(asUser(A, `insert into player_reports (reporter, reported, reason) values ('${B}', '${A}', 'jine')`), 'za jiného');
        denied(asUser(A, `insert into player_reports (reporter, reported, reason) values ('${A}', '${B}', 'nesmysl')`), 'neznámý důvod');
        denied(asUser(A, `insert into player_reports (reporter, reported, reason, note) values ('${A}', '${B}', 'jine', '${'x'.repeat(301)}')`), 'dlouhá poznámka');
        ok(asUser(A, `insert into player_reports (reporter, reported, reason, note, resolved_at) values ('${A}', '${B}', 'obtezovani', 'Nehezky\nzprávy ${'x'.repeat(280)}', now())`));
        assert.equal(q(`select (resolved_at is null)::text || ':' || (note !~ '[[:cntrl:]]')::text from player_reports`), 'true:true', 'resolved_at si klient nenastaví, řídicí znaky pryč');
        assert.equal(count(A, `select * from player_reports`), 1);
        assert.equal(count(B, `select * from player_reports`), 0, 'nahlášený o tom neví');
        assert.equal(count(C, `select * from player_reports`), 0);
        denied(asUser(A, `update player_reports set resolved_at = now()`), 'klient nic nemění');
        denied(asUser(A, `delete from player_reports`), 'ani nemaže');
        denied(as('anon', null, `select * from player_reports`));
        for (let i = 0; i < 9; i++) ok(asUser(A, `insert into player_reports (reporter, reported, reason) values ('${A}', '${B}', 'jine')`));
        denied(asUser(A, `insert into player_reports (reporter, reported, reason) values ('${A}', '${B}', 'jine')`), '11. za den');
    });

    await t.test('správce nahlášení: jen dev_admins; resolve funguje', () => {
        denied(asUser(A, `select * from dev_player_reports()`), 'obyčejný hráč');
        denied(asUser(A, `select dev_report_resolve(1)`));
        denied(as('anon', null, `select * from dev_player_reports()`));
        q(`insert into dev_admins (user_id) values ('${B}')`);
        assert.equal(last(asUser(B, `select count(*) from dev_player_reports()`)), '10');
        const first = last(asUser(B, `select id from dev_player_reports() order by id limit 1`));
        ok(asUser(B, `select dev_report_resolve(${first})`));
        assert.equal(q(`select count(*) from player_reports where resolved_at is not null`), '1');
        assert.equal(last(asUser(B, `select reported_name || ':' || reason from dev_player_reports() where resolved_at is null limit 1`)).split(':')[1], 'jine');
        denied(asUser(B, `insert into dev_admins (user_id) values ('${A}')`), 'dev_admins si klient nezapíše');
    });

    await t.test('last_seen: touch_seen jen vlastní řádek, klient ho nezapíše a cizí aktivitu nevidí', () => {
        denied(asUser(A, `insert into player_seen (user_id, last_seen) values ('${A}', now())`), 'zápis jen přes touch_seen');
        denied(asUser(A, `update player_seen set last_seen = now()`));
        ok(asUser(A, `select touch_seen()`));
        assert.notEqual(q(`select last_seen from player_seen where user_id = '${A}'`), '');
        assert.equal(q(`select count(*) from player_seen where user_id = '${B}'`), '0');
        denied(as('anon', null, `select touch_seen()`));
        // V profilech (čte je každý přihlášený) poslední aktivita není; v player_seen vidí hráč jen svůj řádek
        assert.equal(q(`select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'last_seen'`), '0');
        ok(asUser(B, `select touch_seen()`));
        assert.equal(count(B, `select * from player_seen`), 1);
        assert.equal(count(C, `select * from player_seen`), 0);
        denied(as('anon', null, `select * from player_seen`));
    });

    await t.test('friends_list: poslední aktivitu vidí jen přátelé, ne žadatel ani oslovený', () => {
        q(`insert into auth.users (id, email, raw_user_meta_data) values ('${C}', 'c@example.com', '{"full_name": "Cecil"}'), ('${D}', 'd@example.com', '{"full_name": "Dana"}') on conflict (id) do nothing;
           insert into profiles (id, display_name) values ('${C}', 'Cecil'), ('${D}', 'Dana') on conflict (id) do nothing;
           delete from player_blocks; delete from friendships where '${A}' in (user_id, friend_id) or '${C}' in (user_id, friend_id) or '${D}' in (user_id, friend_id);
           insert into player_seen (user_id, last_seen) values ('${A}', now()), ('${C}', now()), ('${D}', now()) on conflict (user_id) do update set last_seen = now()`);
        ok(asUser(A, `insert into friendships (user_id, friend_id) values ('${A}', '${C}'), ('${A}', '${D}')`));
        ok(asUser(C, `update friendships set status = 'accepted' where user_id = '${A}' and friend_id = '${C}'`));
        assert.equal(last(asUser(A, `select (last_seen is not null)::text from friends_list() where id = '${C}'`)), 'true', 'přítel');
        assert.equal(last(asUser(A, `select (last_seen is null)::text from friends_list() where id = '${D}'`)), 'true', 'moje čekající žádost');
        assert.equal(last(asUser(D, `select (last_seen is null)::text from friends_list() where id = '${A}'`)), 'true', 'cizí žádost pro mě');
        assert.equal(last(asUser(C, `select (last_seen is not null)::text from friends_list() where id = '${A}'`)), 'true');
        // Hledání hráčů vrací profily: bez poslední aktivity
        assert.ok(!/last_seen/.test(last(asUser(B, `select to_jsonb(p)::text from search_players('Cecil') p`))));
    });

    await t.test('pomocné funkce jdou volat jen interně', () => {
        denied(asUser(A, `select is_blocked('${A}', '${B}')`));
        denied(asUser(A, `select friend_count('${A}')`));
        denied(as('anon', null, `select * from friends_list()`));
        denied(as('anon', null, `select * from search_players('Alena')`));
    });
});
