// Zneužití databáze (PostgreSQL 16): pokusy přihlášeného hráče o zápis cizích dat, podvržení výsledku, přepsání ratingu/XP/odznaků,
// přetečení limitů a volání pomocných funkcí. Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('../quiz-core.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_security_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const as = (role, uid, sql) => psql(dbName, `set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const asUser = (uid, sql) => as('authenticated', uid, sql);
// Poslední řádek výstupu (výsledek posledního select)
const last = (result) => result.stdout.trim().split('\n').pop();
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => assert.equal(r.status, 0, r.stderr);
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };

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

test('SQL: zneužití (RLS, oprávnění, XP, odznaky, limity)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) { const r = psql(dbName, '', schema); assert.equal(r.status, 0, `schema.sql běh ${run + 1}: ${r.stderr}`); }
    q(`insert into auth.users (id, email, raw_user_meta_data) values
        ('${A}', 'a@example.com', '{"full_name": "Alena"}'),
        ('${B}', 'b@example.com', '{"full_name": "<img src=x onerror=alert(1)>Bob\\"\\\\"}'),
        ('${C}', 'c@example.com', '{"full_name": "Alena"}')`);

    await t.test('přezdívka z Googlu se zbaví znaků pro HTML a rozliší se', () => {
        const names = q(`select string_agg(display_name, '|' order by created_at, id) from profiles`).split('|');
        assert.ok(names.every(name => !/[<>&"'`\\]/.test(name)), names.join('|'));
        assert.equal(new Set(names.map(name => name.toLowerCase())).size, 3);
        assert.ok(names.includes('Alena') && names.some(name => /^Alena \d+$/.test(name)));
    });

    await t.test('katalog odznaků v databázi odpovídá aplikaci', () => {
        const inDb = q(`select unnest(badge_catalog())`).split('\n').sort();
        assert.deepEqual(inDb, core.BADGES.map(badge => badge.id).sort());
        assert.ok(core.xpForLevel(core.MAX_LEVEL) <= 500000, 'strop XP v databázi musí pojmout nejvyšší úroveň');
    });

    await t.test('cizí profil se nezapíše, vlastní jen povolené sloupce', () => {
        assert.equal(last(asUser(A, `with u as (update profiles set display_name = 'Hacker' where id = '${B}' returning 1) select count(*) from u`)), '0');
        assert.notEqual(q(`select display_name from profiles where id = '${B}'`), 'Hacker');
        denied(asUser(A, `update profiles set id = '${C}' where id = '${A}'`));
        denied(asUser(A, `update profiles set rating = 3000 where id = '${A}'`));
        denied(asUser(A, `update profiles set rated_games = 50 where id = '${A}'`));
        denied(asUser(A, `update profiles set created_at = '2000-01-01' where id = '${A}'`));
        denied(asUser(A, `insert into profiles (id, display_name) values (gen_random_uuid(), 'Falešný')`));
        denied(asUser(A, `delete from profiles where id = '${A}'`));
        denied(asUser(A, `truncate profiles`));
        // délky a tvar
        denied(asUser(A, `update profiles set display_name = '${'x'.repeat(25)}' where id = '${A}'`));
        denied(asUser(A, `update profiles set color = 'javascript' where id = '${A}'`));
        ok(asUser(A, `update profiles set color = 'h210' where id = '${A}'`));
        ok(asUser(A, `update profiles set color = 'h355' where id = '${A}'`));
        denied(asUser(A, `update profiles set color = 'h212' where id = '${A}'`));
        denied(asUser(A, `update profiles set color = 'h360' where id = '${A}'`));
        denied(asUser(A, `update profiles set color = 'h2100' where id = '${A}'`));
        denied(asUser(A, `update profiles set frame = 'a b' where id = '${A}'`));
        denied(asUser(A, `update profiles set blocked_topics = array_fill('x'::text, array[31]) where id = '${A}'`));
        denied(asUser(A, `update profiles set blocked_topics = array_fill(repeat('x', 100), array[10]) where id = '${A}'`));
        ok(asUser(A, `update profiles set display_name = 'Alena K', avatar = '🐼', color = 'sky', accepts_mix = false where id = '${A}'`));
        assert.equal(q(`select display_name || avatar || color from profiles where id = '${A}'`), 'Alena K🐼sky');
    });

    await t.test('sova jako obrázek profilu: vlastní řádek, jen platný tvar, jde i smazat', () => {
        const owl = 'robe=zelena;head=koruna.modra;face=bryle.original;neck=sala.ruzova;hand=lupa.zelena';
        ok(asUser(A, `update profiles set avatar = '🦉', owl = '${owl}' where id = '${A}'`));
        assert.equal(q(`select owl from profiles where id = '${A}'`), owl);
        // cizí řádek se nezmění
        assert.equal(last(asUser(A, `with u as (update profiles set owl = 'robe=cerna' where id = '${B}' returning 1) select count(*) from u`)), '0');
        assert.equal(q(`select coalesce(owl, '-') from profiles where id = '${B}'`), '-');
        // špatný tvar: velká písmena, mezera, HTML, uvozovky, prázdné, příliš dlouhé
        for (const bad of ['Robe=zelena', 'robe=zelena;head=a b', '<script>', `robe='x'`, '', 'a'.repeat(201)]) denied(asUser(A, `update profiles set owl = '${bad.replace(/'/g, "''")}' where id = '${A}'`), bad);
        ok(asUser(A, `update profiles set owl = '${'a'.repeat(200)}' where id = '${A}'`));
        ok(asUser(A, `update profiles set owl = null where id = '${A}'`));
        assert.equal(q(`select coalesce(owl, '-') from profiles where id = '${A}'`), '-');
        // ostatní hráči sovu čtou
        q(`update profiles set owl = '${owl}' where id = '${A}'`);
        assert.equal(last(asUser(B, `select owl from profiles where id = '${A}'`)), owl);
        q(`update profiles set owl = null where id = '${A}'`);
    });

    await t.test('XP jen roste a má strop; odznaky jen přibývají a jen z katalogu', () => {
        ok(asUser(A, `update profiles set xp = 1200 where id = '${A}'`));
        assert.equal(q(`select xp from profiles where id = '${A}'`), '1200');
        ok(asUser(A, `update profiles set xp = 5 where id = '${A}'`));
        assert.equal(q(`select xp from profiles where id = '${A}'`), '1200', 'XP nejde snížit');
        ok(asUser(A, `update profiles set xp = -5 where id = '${A}'`));
        assert.equal(q(`select xp from profiles where id = '${A}'`), '1200', 'záporné XP nic nezmění');
        ok(asUser(A, `update profiles set xp = 9999999 where id = '${A}'`));
        assert.equal(q(`select xp from profiles where id = '${A}'`), '500000');
        ok(asUser(A, `update profiles set badges = array['prvni-krok', 'neexistuje', '<script>', 'tema-sport-300'] where id = '${A}'`));
        assert.equal(q(`select array_to_string(badges, ',') from profiles where id = '${A}'`), 'prvni-krok,tema-sport-300');
        ok(asUser(A, `update profiles set badges = array['stovka'] where id = '${A}'`));
        assert.equal(q(`select array_to_string(badges, ',') from profiles where id = '${A}'`), 'prvni-krok,stovka,tema-sport-300', 'odznaky se sjednocují, nemizí');
        ok(asUser(A, `update profiles set badges = '{}' where id = '${A}'`));
        assert.equal(q(`select cardinality(badges) from profiles where id = '${A}'`), '3');
        // správce (postgres) smí vše, i snížit
        q(`update profiles set xp = 10 where id = '${A}'`);
        assert.equal(q(`select xp from profiles where id = '${A}'`), '10');
    });

    await t.test('výzvy: cizí jméno, tvar, limit za hodinu, nezměnitelnost', () => {
        const insert = (uid, creator, code, extra = {}) => asUser(uid, `insert into challenges (id, creator_id, topic, seed, count${extra.invited ? ', invited_id' : ''}${extra.created ? ', created_at' : ''}) values ('${code}', '${creator}', '${extra.topic || 'mix'}', '${extra.seed || 's'}', ${extra.count || 10}${extra.invited ? `, '${extra.invited}'` : ''}${extra.created ? `, '${extra.created}'` : ''})`);
        denied(insert(A, B, 'AAAAA1'), 'výzva za jiného hráče');
        denied(insert(A, A, 'AAAAA2', { topic: 'x<script>' }), 'téma s HTML');
        denied(insert(A, A, 'AAAAA3', { seed: 'a b"c' }), 'semínko s uvozovkou');
        denied(insert(A, A, 'AAAAA4', { count: 500 }), 'počet otázek');
        denied(insert(A, A, 'AAAAA5', { invited: A }), 'výzva sám sobě');
        ok(insert(A, A, 'AAAAA6', { created: '2001-01-01' }));
        assert.ok(Number(q(`select extract(year from created_at) from challenges where id = 'AAAAA6'`)) >= 2026, 'čas určuje server');
        for (let i = 0; i < 30; i++) ok(insert(C, C, `LIM${String(100 + i)}`));
        const limited = denied(insert(C, C, 'LIM998'), '31. výzva za hodinu');
        assert.match(limited, /příliš mnoho/);
        ok(insert(B, B, 'BBBBB1'));
        // výzvu nejde upravit ani smazat (ani vlastní)
        denied(asUser(A, `update challenges set count = 3 where id = 'AAAAA6'`));
        denied(asUser(A, `delete from challenges where id = 'AAAAA6'`));
    });

    await t.test('výsledky: jen vlastní, jen pro určeného hráče, čas určuje server, nejdou měnit', () => {
        q(`insert into challenges (id, creator_id, topic, seed, count, invited_id) values ('PRIVAT', '${A}', 'mix', 's', 10, '${B}')`);
        const result = (uid, as_, code, correct, points, extra = '') => asUser(uid, `insert into challenge_results (challenge_id, user_id, correct, points${extra ? ', finished_at' : ''}) values ('${code}', '${as_}', ${correct}, ${points}${extra ? `, '${extra}'` : ''})`);
        denied(result(C, B, 'PRIVAT', 5, 10), 'výsledek za jiného hráče');
        denied(result(C, C, 'PRIVAT', 5, 10), 'cizí hráč do soukromé výzvy');
        denied(result(B, B, 'PRIVAT', 11, 10), 'víc správných než otázek');
        denied(result(B, B, 'PRIVAT', 5, 41), 'víc bodů než možné');
        denied(result(B, B, 'PRIVAT', -1, 0), 'záporné');
        denied(result(B, B, 'NENI01', 1, 1), 'neexistující výzva');
        ok(result(B, B, 'PRIVAT', 5, 10, '2001-01-01'));
        assert.ok(Number(q(`select extract(year from finished_at) from challenge_results where challenge_id = 'PRIVAT'`)) >= 2026, 'finished_at určuje server');
        denied(asUser(B, `update challenge_results set correct = 10, points = 40 where challenge_id = 'PRIVAT'`), 'výsledek nejde přepsat');
        denied(asUser(B, `delete from challenge_results where challenge_id = 'PRIVAT'`));
        ok(result(A, A, 'PRIVAT', 7, 20));
        assert.equal(q(`select count(*) from rating_history where challenge_id = 'PRIVAT'`), '2');
        // do ratingu a historie klient nesáhne
        denied(asUser(B, `update rating_history set delta = 500`));
        denied(asUser(B, `delete from rating_history`));
        // cizí hráč s kódem otevřené výzvy smí hrát
        ok(result(C, C, 'BBBBB1', 6, 12));
    });

    await t.test('anon a pomocné funkce', () => {
        denied(as('anon', '', `select * from profiles`));
        denied(as('anon', '', `select * from challenges`));
        denied(as('anon', '', `select * from random_opponent()`));
        denied(as('anon', '', `select * from weekly_leaderboard()`));
        denied(as('anon', '', `select unique_display_name('x')`));
        denied(asUser(A, `select unique_display_name('x')`));
        denied(asUser(A, `select protect_rating()`));
        denied(asUser(A, `select * from random_opponent() where 1 = 0; select handle_new_user()`));
        // přihlášený e-mail cizích hráčů nevidí: v profilech ani žádném sloupci
        assert.equal(q(`select count(*) from information_schema.columns where table_schema = 'public' and column_name ilike '%mail%'`), '0');
        denied(asUser(A, `select * from auth.users`));
    });
});
