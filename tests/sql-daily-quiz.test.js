// Kvíz dne v databázi (PostgreSQL 16, schéma 6): jeden pokus na hráče a den (den určuje server, Praha), odpovědi jen po pořadí, body a čas
// v mezích (příliš rychlá odpověď, body nad maximum, přepsání, přeskočení, cizí den), čas měří i server (zavření aplikace čas nezastaví),
// limit volání, pořadí dne (top N, moje místo, shoda, nedohrané jen u minulých dnů), pořadí přátel, série, pravidla řádků a oprávnění
// (hráč nezapíše nic přímo, cizí řádky nevidí, anon nic), jen veřejné údaje profilu, export a smazání účtu. Spouští se jen s psql a serverem
// (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_dailyquiz_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const DAY = '2026-11-08';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Jako přihlášený hráč (role authenticated) v daný den (Praha); anon bez přihlášení
const as = (uid, sql, day = DAY, role = 'authenticated') => psql(dbName, `set mudrlant.test_today = '${day}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const start = (uid, day = DAY) => json(as(uid, 'select daily_quiz_start();', day));
const answer = (uid, idx, correct, points, ms = 4000, day = DAY, forDay = day) => as(uid, `select daily_quiz_answer('${forDay}', ${idx}, ${correct}, ${points}, ${ms});`, day);
const row = (uid, day = DAY) => q(`select answered || ':' || correct || ':' || score || ':' || bitmap || ':' || (finished_at is not null) from daily_quiz_results where user_id = '${uid}' and day = '${day}'`);
// Celý kvíz: odpovědi podle masky (1 = správně za body, 0 = špatně), čas na otázku ms
const play = (uid, mask, points = 4, ms = 3000, day = DAY) => {
    start(uid, day);
    [...mask].forEach((bit, idx) => ok(answer(uid, idx, bit === '1', bit === '1' ? points : 0, ms, day)));
};

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

const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(id);

test('SQL: Kvíz dne', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 5 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    await t.test('verze schématu 6 a tabulka s pravidly řádků', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 6);
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.daily_quiz_results'::regclass`), 't');
    });

    await t.test('anon nic; hráč nezapíše přímo do tabulky a pomocné funkce nevolá', () => {
        for (const sql of ['select daily_quiz_state();', 'select daily_quiz_start();', `select daily_quiz_answer('${DAY}', 0, true, 4, 3000);`, 'select daily_quiz_board();', 'select daily_quiz_friends();', 'select * from daily_quiz_results;']) {
            denied(as(null, sql, DAY, 'anon'), null, `anon: ${sql}`);
        }
        denied(as(A, `insert into daily_quiz_results (user_id, day, answered, correct, score, bitmap, finished_at) values ('${A}', '${DAY}', 10, 10, 40, 1023, now());`), /permission denied/);
        denied(as(A, `update daily_quiz_results set score = 40;`), /permission denied/);
        denied(as(A, `delete from daily_quiz_results;`), /permission denied/);
        for (const sql of ['select daily_quiz_today();', `select * from daily_quiz_streaks('${A}', '${DAY}');`, `select * from daily_quiz_counted('${DAY}', '${DAY}');`]) denied(as(A, sql), /permission denied/, sql);
        // Nepřihlášený s rolí authenticated (bez tokenu) taky ne
        denied(as(null, 'select daily_quiz_start();'), /Přihlas se/);
    });

    await t.test('stav a začátek: den určuje server, řádek jen jednou, druhý start nic nezaloží', () => {
        const before = json(as(A, 'select daily_quiz_state();'));
        assert.deepEqual([before.day, before.started, before.answered, before.finished], [DAY, false, 0, false]);
        assert.equal(q(`select count(*) from daily_quiz_results`), '0', 'stav nic nezakládá');
        const first = start(A);
        assert.deepEqual([first.day, first.started, first.answered], [DAY, true, 0]);
        start(A);
        assert.equal(q(`select count(*) from daily_quiz_results where user_id = '${A}'`), '1');
        // Pražský den: 23:30 UTC 8. 11. je v Praze už 9. 11.
        assert.equal(q(`select (timestamptz '2026-11-08 23:30:00+00' at time zone 'Europe/Prague')::date`), '2026-11-09');
    });

    await t.test('odpovědi: jen další v pořadí, stejná znovu nic nemění, přepsat ani přeskočit nejde, body a čas v mezích', () => {
        denied(answer(B, 0, true, 4), /nejdřív začni/, 'bez začátku');
        denied(answer(A, 1, true, 4), /předchozí otázka/, 'přeskočení');
        ok(answer(A, 0, true, 3));
        assert.equal(row(A), '1:1:3:1:false');
        // Ztracená odpověď serveru: stejná odpověď znovu projde a nic nezmění
        ok(answer(A, 0, true, 3));
        assert.equal(row(A), '1:1:3:1:false');
        denied(answer(A, 0, false, 0), /už odpověď máš/, 'přepsání');
        denied(answer(A, 1, true, 5), /Neplatné body/, 'nad maximum výběru z možností');
        denied(answer(A, 1, true, 0), /Neplatné body/, 'správně bez bodu');
        denied(answer(A, 1, false, 2), /Neplatné body/, 'špatně s body');
        denied(answer(A, 10, true, 4), /Neplatná odpověď/);
        denied(answer(A, -1, true, 4), /Neplatná odpověď/);
        denied(answer(A, 1, true, 4, 200), /příliš rychle/, 'odpověď za 0,2 s');
        denied(answer(A, 1, true, 4, 4000, DAY, '2026-11-07'), /už skončil/, 'otázky jiného dne');
        assert.equal(row(A), '1:1:3:1:false', 'odmítnuté nic nezapsaly');
        ['1', '0', '1', '1', '1', '1', '0', '1', '1'].forEach((bit, i) => ok(answer(A, i + 1, bit === '1', bit === '1' ? 4 : 0)));
        assert.equal(row(A), `10:8:31:${0b1101111011}:true`);
        const done = json(as(A, 'select daily_quiz_state();'));
        assert.deepEqual([done.answered, done.correct, done.score, done.finished, done.bitmap], [10, 8, 31, true, 0b1101111011]);
        denied(answer(A, 9, false, 0), /už odpověď máš/, 'po dohrání nic nepřepíše');
        assert.equal(json(as(A, 'select daily_quiz_start();')).finished, true, 'začít znovu nejde: start vrátí dohraný pokus');
        assert.equal(row(A), `10:8:31:${0b1101111011}:true`);
    });

    await t.test('čas: server započte aspoň dobu od předchozí odpovědi (bez 15 s), nejvýš 5 minut na otázku', () => {
        start(C);
        ok(answer(C, 0, true, 4, 2000));
        assert.equal(q(`select time_ms from daily_quiz_results where user_id = '${C}'`), '2000');
        // Hráč otázku nechal otevřenou 2 minuty (třeba hledal odpověď) a tvrdí, že odpověděl za sekundu
        q(`update daily_quiz_results set last_at = now() - interval '2 minutes' where user_id = '${C}'`);
        ok(answer(C, 1, true, 4, 1000));
        const after = Number(q(`select time_ms from daily_quiz_results where user_id = '${C}'`));
        assert.ok(after >= 2000 + 105000 && after < 2000 + 110000, `započteno ${after - 2000} ms`);
        // Aplikace zavřená na hodinu: nejvýš 5 minut
        q(`update daily_quiz_results set last_at = now() - interval '1 hour' where user_id = '${C}'`);
        ok(answer(C, 2, false, 0, 1000));
        assert.equal(Number(q(`select time_ms from daily_quiz_results where user_id = '${C}'`)) - after, 300000);
    });

    await t.test('limit: nejvýš 40 volání za den', () => {
        start(D);
        q(`update daily_quiz_results set calls = 40 where user_id = '${D}'`);
        denied(as(D, 'select daily_quiz_start();'), /Příliš mnoho/);
        denied(answer(D, 0, true, 4), /Příliš mnoho/);
        q(`update daily_quiz_results set calls = 0 where user_id = '${D}'`);
    });

    await t.test('kontroly tabulky: body, mřížka a dohrání musí sedět (ani správce nezapíše nesmysl)', () => {
        const bad = (values) => denied(psql(dbName, `insert into daily_quiz_results (user_id, day, answered, correct, score, bitmap, time_ms, finished_at) values ('${E}', '2026-10-01', ${values})`));
        bad('10, 10, 41, 1023, 1000, now()');
        bad('10, 9, 36, 1023, 1000, now()');
        bad('3, 1, 4, 8, 1000, null');
        bad('10, 10, 40, 1023, 1000, null');
        bad('5, 5, 20, 31, 1000, now()');
        ok(psql(dbName, `insert into daily_quiz_results (user_id, day, answered, correct, score, bitmap, time_ms, finished_at) values ('${E}', '2026-10-01', 3, 2, 5, 5, 1000, null)`));
        q(`delete from daily_quiz_results where user_id = '${E}'`);
    });

    await t.test('pravidla řádků: hráč čte jen své řádky', () => {
        assert.equal(last(ok(as(B, 'select count(*) from daily_quiz_results;'))), '0');
        assert.equal(last(ok(as(A, 'select count(*) from daily_quiz_results;'))), '1');
    });

    await t.test('pořadí dne: body, pak čas; shoda sdílí místo; top N a moje místo; nedohraný dnes chybí, minulý den se počítá, jak stál', () => {
        play(B, '1111111111', 4, 2000); // 40 b., 20 s
        play(E, '1111111111', 4, 2000); // 40 b., 20 s – stejně jako B
        // D rozehráno: dnes se nepočítá
        ok(answer(D, 0, true, 4));
        const board = json(as(A, 'select daily_quiz_board();'));
        assert.equal(board.day, DAY);
        assert.equal(board.total, 3);
        assert.deepEqual(board.top.map(r => [r.rank, r.id, r.score]), [[1, B, 40], [1, E, 40], [3, A, 31]]);
        assert.deepEqual(board.me && [board.me.rank, board.me.score, board.me.correct, board.me.answered], [3, 31, 8, 10]);
        assert.ok(board.top.find(r => r.id === A).me);
        assert.ok(!board.top.find(r => r.id === B).me);
        // Jen veřejné údaje profilu: žádné e-maily, mřížka cizích hráčů ani čas začátku
        const keys = Object.keys(board.top[0]).sort();
        assert.deepEqual(keys, ['avatar', 'color', 'correct', 'display_name', 'frame', 'id', 'me', 'owl', 'rank', 'score', 'time_ms', 'title_pref']);
        assert.doesNotMatch(last(ok(as(A, 'select daily_quiz_board();'))), /@example\.com/);
        // Top 1: jsem mimo, moje místo zůstává
        const top1 = json(as(A, 'select daily_quiz_board(null, 1);'));
        assert.equal(top1.top.length, 1);
        assert.equal(top1.me.rank, 3);
        assert.equal(json(as(A, 'select daily_quiz_board(null, 5000);')).top.length, 3, 'limit se ořízne');
        // D (nedohráno) dnes nemá místo
        assert.equal(json(as(D, 'select daily_quiz_board();')).me, null);
        // Další den: včerejší nedohraný pokus D se počítá, jak stál
        const yesterday = json(as(D, `select daily_quiz_board('${DAY}');`, '2026-11-09'));
        assert.equal(yesterday.total, 5, 'i nedohrané pokusy C a D');
        assert.deepEqual([yesterday.me.rank, yesterday.me.score, yesterday.me.answered], [5, 4, 1]);
        denied(as(A, `select daily_quiz_board('2026-11-09');`), /posledních 30 dní/, 'budoucí den');
        denied(as(A, `select daily_quiz_board('2026-09-01');`), /posledních 30 dní/, 'moc starý den');
        // Po půlnoci dnešní pokus nejde dohrát
        denied(answer(D, 1, true, 4, 4000, '2026-11-09', DAY), /už skončil/);
    });

    await t.test('pořadí přátel: jen přijatí přátelé a já', () => {
        // A a B jsou přátelé, A → E jen žádost
        q(`insert into friendships (user_id, friend_id) values ('${A}', '${B}'); update friendships set status = 'accepted' where user_id = '${A}' and friend_id = '${B}';
           insert into friendships (user_id, friend_id) values ('${A}', '${E}');`);
        const friends = json(as(A, 'select daily_quiz_friends();'));
        assert.equal(friends.friends, 1);
        assert.deepEqual(friends.rows.map(r => [r.rank, r.id, r.me]), [[1, B, false], [2, A, true]]);
        const lonely = json(as(C, 'select daily_quiz_friends();'));
        assert.deepEqual([lonely.friends, lonely.rows.length], [0, 0], 'C nedohrál a přátele nemá');
    });

    await t.test('série: dny po sobě, dnešek jen dohraný, nejdelší série', () => {
        for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-06', '2026-11-07']) play(B, '1010101010', 4, 3000, day);
        const today = json(as(B, 'select daily_quiz_state();'));
        assert.deepEqual([today.streak, today.best_streak], [3, 3], '6., 7. a dnes 8. 11.');
        const board = json(as(B, 'select daily_quiz_board();'));
        assert.deepEqual([board.streak, board.best_streak], [3, 3]);
        // Ráno dalšího dne (ještě nehráno): série od včerejška trvá
        assert.equal(json(as(B, 'select daily_quiz_state();', '2026-11-09')).streak, 3);
        assert.equal(json(as(B, 'select daily_quiz_state();', '2026-11-11')).streak, 0, 'vynechaný den sérii ukončí');
        // Rozehraný dnešek se do série ještě nepočítá
        assert.equal(json(as(D, 'select daily_quiz_state();')).streak, 0);
    });

    await t.test('export dat obsahuje Kvíz dne (jen vlastní) a smazání účtu ho smaže', () => {
        const exported = json(as(A, 'select export_my_data();'));
        assert.equal(exported.kviz_dne.length, 1);
        assert.ok(exported.kviz_dne.every(r => r.user_id === A));
        ok(as(E, 'select delete_my_account();'));
        assert.equal(q(`select count(*) from daily_quiz_results where user_id = '${E}'`), '0');
    });
});
