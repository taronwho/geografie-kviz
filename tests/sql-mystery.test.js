// Tajemná otázka dne v databázi (PostgreSQL, schéma 19): jeden řádek na hráče a den (den a čas určuje server, Praha), tipy jen po pořadí
// a nejvýš 3, po vyřešení nic dalšího, opakované odeslání téhož tipu nic nezmění, body počítá server (nápovědy podle hodin i při změně
// času, starý tip si nepřisvojí dřívější nápovědu), limit volání, statistiky dne (podíl, nejrychlejší, průměr nápověd) a přátel až po
// dořešení, pravidla řádků a oprávnění (hráč nezapíše nic přímo, cizí řádky nevidí, anon nic), odznaky Detektiv v katalogu, export
// a smazání účtu. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Mystery = require('../mystery.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_mystery_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const DAY = '2026-11-12';
// Pražský čas 12. 11. (zimní čas, UTC+1): „9:41“ = 08:41Z
const at = (clock, day = DAY) => { const [h, m] = clock.split(':').map(Number); return new Date(Mystery.pragueTime(day, h, m)).toISOString(); };
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Jako přihlášený hráč (role authenticated) v daném okamžiku (ISO); anon bez přihlášení
const as = (uid, sql, now = at('13:00'), role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${now}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const guess = (uid, idx, correct, clues, now = at('13:00'), forDay = DAY) => as(uid, `select mystery_guess('${forDay}', ${idx}, ${correct}, ${clues});`, now);

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

const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map(id);

test('SQL: Tajemná otázka dne', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    // Schéma jde spustit opakovaně (idempotentní migrace)
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 6 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    await t.test('verze schématu 19, tabulka s pravidly řádků, odznaky Detektiv v katalogu', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 19);
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.mystery_results'::regclass`), 't');
        assert.equal(q(`select count(*) from unnest(badge_catalog()) b where b in ('detektiv', 'detektiv-7', 'detektiv-30', 'detektiv-100', 'detektiv-365')`), '5');
    });

    await t.test('anon nic; hráč nezapíše přímo do tabulky a pomocné funkce nevolá', () => {
        for (const sql of ['select mystery_state();', `select mystery_guess('${DAY}', 0, true, 1);`, 'select mystery_stats();', 'select mystery_friends();', 'select * from mystery_results;']) {
            denied(as(null, sql, at('13:00'), 'anon'), null, `anon: ${sql}`);
        }
        denied(as(A, `insert into mystery_results (user_id, day, guesses, solved, clues, points, solved_at) values ('${A}', '${DAY}', 1, true, 1, 10, now());`), /permission denied/);
        denied(as(A, 'update mystery_results set points = 10;'), /permission denied/);
        denied(as(A, 'delete from mystery_results;'), /permission denied/);
        for (const sql of ['select mystery_today();', 'select mystery_now();', `select mystery_clues_at(now());`, `select mystery_visible('${A}', '${DAY}');`]) denied(as(A, sql), /permission denied/, sql);
        denied(as(null, 'select mystery_state();'), /Přihlas se/);
    });

    await t.test('nápovědy podle pražských hodin (0, 7, 9 … 20) i v den změny času', () => {
        const clues = (iso) => Number(q(`select mystery_clues_at('${iso}'::timestamptz)`));
        assert.deepEqual(['0:00', '6:59', '7:00', '10:59', '11:00', '14:30', '17:00', '23:59'].map(clock => clues(at(clock))), [1, 1, 2, 3, 4, 5, 7, 8]);
        // 29. 3. 2026 se v Praze přechází na letní čas (2:00 → 3:00), 25. 10. 2026 zpět (3:00 → 2:00); hodiny nápověd se nemění
        for (const day of ['2026-03-29', '2026-10-25']) {
            for (let n = 1; n <= 8; n++) {
                const unlock = new Date(Mystery.clueTime(day, n));
                assert.equal(clues(unlock.toISOString()), n, `${day}: ${n}. nápověda v ${Mystery.hourLabel(n)}`);
                if (n > 1) assert.equal(clues(new Date(unlock.getTime() - 60000).toISOString()), n - 1, `${day}: minutu před ${Mystery.hourLabel(n)}`);
            }
        }
        // shoda s aplikací
        assert.equal(Mystery.cluesAt(Date.parse(at('16:30'))), 6);
    });

    await t.test('stav a tipy: den určuje server, jen po pořadí, body podle nápověd a špatných tipů', () => {
        assert.deepEqual(json(as(A, 'select mystery_state();')), { day: DAY, guesses: 0, solved: false, clues: 0, points: 0, solved_at: null, finished: false, clues_now: 5 });
        // cizí den a nesmysly
        denied(guess(A, 0, true, 1, at('13:00'), '2026-11-11'), /už skončila/);
        denied(guess(A, 1, false, 5), /předchozí tip/);
        denied(guess(A, 3, false, 5), /Neplatný tip/);
        denied(guess(A, 0, false, 9), /Neplatný tip/);
        denied(guess(A, 0, false, 0), /Neplatný tip/);
        // A: špatně v 9:41 (4 nápovědy), správně ve 13:05 (6 nápověd) → 11 − 6 − 1 = 4 body
        let state = json(guess(A, 0, false, 4, at('12:41')));
        assert.deepEqual([state.guesses, state.solved, state.points, state.finished], [1, false, 0, false]);
        state = json(guess(A, 1, true, 6, at('16:05')));
        assert.deepEqual([state.guesses, state.solved, state.clues, state.points, state.solved_at, state.finished], [2, true, 6, 4, '16:05', true]);
        // po vyřešení už nic; stejný tip znovu (ztracená odpověď) nic nezmění
        denied(guess(A, 2, false, 8, at('20:00')), /vyřešenou/);
        assert.equal(json(guess(A, 1, true, 6, at('16:06'))).points, 4, 'opakované odeslání');
        assert.equal(json(guess(A, 0, false, 4, at('16:06'))).points, 4, 'opakované odeslání dřívějšího tipu');
        denied(guess(A, 1, false, 6, at('16:06')), /už máš uložený/);
        denied(guess(A, 0, true, 6, at('16:06')), /už máš uložený/);
        assert.equal(q(`select guesses || ':' || solved || ':' || clues || ':' || points from mystery_results where user_id = '${A}'`), '2:true:6:4');
        // B: hned po půlnoci s 1. nápovědou → 10 bodů
        assert.equal(json(guess(B, 0, true, 1, at('0:21'))).points, 10);
        // C: tři špatné tipy → hotovo, nevyřešeno, čtvrtý nejde
        ok(guess(C, 0, false, 2, at('8:00')));
        ok(guess(C, 1, false, 3, at('9:30')));
        state = json(guess(C, 2, false, 3, at('10:00')));
        assert.deepEqual([state.guesses, state.solved, state.points, state.finished], [3, false, 0, true]);
        denied(guess(C, 3, true, 8, at('20:15')), /Neplatný tip/);
        denied(guess(C, 2, true, 8, at('20:15')), /už máš uložený/);
        // D: tvrdí 1. nápovědu, ale tip přišel v 15:00 (před 10 minutami bylo vidět 7 nápověd) → počítá se 7; 2 špatné předtím → 11 − 7 − 2 = 2
        ok(guess(D, 0, false, 1, at('18:30')));
        ok(guess(D, 1, false, 1, at('18:30')));
        state = json(guess(D, 2, true, 1, at('18:30')));
        assert.deepEqual([state.clues, state.points], [7, 2]);
        // Nápověda, která se odkryla před méně než 10 minutami, se ještě nevynutí (pomalé spojení): E v 16:05 s viděnými 7 nápovědami
        assert.deepEqual((({ clues, points }) => [clues, points])(json(guess(E, 0, true, 7, at('20:02')))), [7, 4]);
        // Body nikdy pod 1: F s 8 nápovědami po dvou špatných
        ok(guess(F, 0, false, 8, at('20:30'))); ok(guess(F, 1, false, 8, at('20:30')));
        assert.equal(json(guess(F, 2, true, 8, at('20:31'))).points, 1);
    });

    await t.test('pravidla řádků: hráč vidí jen svůj řádek; kontrola hodnot', () => {
        assert.equal(last(ok(as(A, 'select count(*) from mystery_results;'))), '1');
        denied(psql(dbName, `insert into mystery_results (user_id, day, guesses, solved, clues, points) values ('${A}', '2026-11-01', 1, true, 1, 10)`), /mystery_results_values/, 'vyřešeno bez času');
        denied(psql(dbName, `insert into mystery_results (user_id, day, guesses, solved, clues, points) values ('${A}', '2026-11-01', 4, false, 1, 0)`), /mystery_results_values/, 'víc než 3 tipy');
        denied(psql(dbName, `insert into mystery_results (user_id, day, guesses, solved, clues, points) values ('${A}', '2026-11-01', 1, false, 1, 3)`), /mystery_results_values/, 'body bez vyřešení');
    });

    await t.test('limit volání: nejvýš 40 uložení za den', () => {
        q(`update mystery_results set calls = 40 where user_id = '${B}'`);
        denied(guess(B, 0, true, 1, at('15:00')), /Příliš mnoho/);
        q(`update mystery_results set calls = 1 where user_id = '${B}'`);
    });

    await t.test('statistiky dne: až po dořešení, podíl, nejrychlejší, průměr nápověd a můj výsledek', () => {
        // Hráč, který dnes ještě nedořešil, nic nevidí (jen hidden)
        q(`insert into auth.users (id, email) values ('${id(7)}', 'u7@example.com')`);
        assert.deepEqual(json(as(id(7), 'select mystery_stats();')), { day: DAY, hidden: true });
        assert.deepEqual(json(as(id(7), 'select mystery_friends();')), { day: DAY, hidden: true });
        ok(guess(id(7), 0, false, 5, at('14:00')));
        assert.equal(json(as(id(7), 'select mystery_stats();', at('14:00'))).hidden, true, 'jeden špatný tip ještě nestačí');
        // A vyřešil: 7 hráčů s tipem, uhodlo 5 (A, B, D, E, F), nejrychlejší B v 0:12, průměr nápověd (6 + 1 + 7 + 7 + 8) / 5 = 5,8
        const stats = json(as(A, 'select mystery_stats();', at('21:00')));
        assert.deepEqual({ ...stats, avg_clues: Number(stats.avg_clues) }, {
            day: DAY, hidden: false, players: 7, solved: 5, solved_pct: 71, fastest: '0:21', avg_clues: 5.8,
            me: { solved: true, clues: 6, guesses: 2, points: 4, solved_at: '16:05' }
        });
        // C neuhodl, ale vyčerpal tipy: vidí; budoucí a starý den ne
        assert.equal(json(as(C, 'select mystery_stats();', at('21:00'))).players, 7);
        denied(as(A, `select mystery_stats('2026-11-13');`, at('21:00')), /30 dní/);
        denied(as(A, `select mystery_stats('2026-10-01');`, at('21:00')), /30 dní/);
        // Druhý den vidí včerejšek každý (i kdo tehdy netipoval); prázdný den = 0 hráčů
        const tomorrow = at('11:00', '2026-11-13');
        assert.equal(json(as(id(7), `select mystery_stats('${DAY}');`, tomorrow)).players, 7);
        assert.deepEqual((({ players, solved_pct, fastest }) => [players, solved_pct, fastest])(json(as(A, `select mystery_stats('2026-11-11');`, tomorrow))), [0, 0, null]);
        assert.equal(json(as(A, 'select mystery_stats();', tomorrow)).hidden, true, 'nový den: dnešek zase až po dořešení');
    });

    await t.test('přátelé: jen přijatí a já, pořadí podle vyřešení, bodů a času, moje místo; jen veřejné údaje', () => {
        // A ↔ B a A ↔ C přijatí, A → D jen žádost
        q(`insert into friendships (user_id, friend_id) values ('${A}', '${B}'), ('${C}', '${A}'), ('${A}', '${D}');
           update friendships set status = 'accepted' where (user_id = '${A}' and friend_id = '${B}') or (user_id = '${C}' and friend_id = '${A}');`);
        const friends = json(as(A, 'select mystery_friends();', at('21:00')));
        assert.equal(friends.friends, 2);
        assert.equal(friends.rank, 2);
        assert.deepEqual(friends.rows.map(r => [r.rank, r.id, r.solved, r.points, r.clues, r.me]), [[1, B, true, 10, 1, false], [2, A, true, 4, 6, true], [3, C, false, 0, 3, false]]);
        assert.equal(friends.rows[0].solved_at, '0:21');
        assert.deepEqual(Object.keys(friends.rows[0]).sort(), ['avatar', 'clues', 'color', 'display_name', 'frame', 'guesses', 'id', 'me', 'owl', 'points', 'rank', 'solved', 'solved_at', 'title_pref']);
        const lonely = json(as(E, 'select mystery_friends();', at('21:00')));
        assert.deepEqual([lonely.friends, lonely.rank, lonely.rows.length], [0, 1, 1]);
    });

    await t.test('export dat obsahuje tajemnou otázku (jen vlastní) a smazání účtu ji smaže', () => {
        const exported = json(as(A, 'select export_my_data();', at('21:00')));
        assert.equal(exported.tajemna_otazka.length, 1);
        assert.ok(exported.tajemna_otazka.every(r => r.user_id === A));
        ok(as(F, 'select delete_my_account();', at('21:00')));
        assert.equal(q(`select count(*) from mystery_results where user_id = '${F}'`), '0');
    });
});
