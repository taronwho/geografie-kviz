// Skupiny v databázi (PostgreSQL 16, schéma 8): založení (název, ikona, kód), přidání kódem (náhled, malá písmena, neznámý kód, hádání kódů),
// limity (nejvýš 10 skupin na hráče, 50 členů na skupinu), práva zakladatele (přejmenovat, nový kód, odebrat člena, smazat) a člena (opustit),
// pravidla řádků (nečlen skupinu ani její členy nevidí, nikdo nic nezapíše přímo, anon nic), pořadí skupiny (Kvíz dne dnes a za týden,
// týdenní XP ze synchronizace postupu), jen veřejné údaje profilu, výzva skupině (jen vlastní otevřená výzva, nepočítá se do ratingu),
// export a smazání účtu (převzetí skupiny). Spouští se jen s psql a serverem (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_groups_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

// Středa; týden začíná v pondělí 9. 11.
const DAY = '2026-11-11';
const MONDAY = '2026-11-09';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const as = (uid, sql, day = DAY, role = 'authenticated') => psql(dbName, `set mudrlant.test_today = '${day}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const lit = (text) => `'${String(text).replace(/'/g, "''")}'`;
const create = (uid, name, icon = '🏫') => json(as(uid, `select group_create(${lit(name)}, ${lit(icon)});`));
// Bez výsledku (neznámý kód) vrací funkce null: v textu 'null', ať se nesplete s ostatními řádky výstupu
const join = (uid, code) => as(uid, `select coalesce(group_join(${lit(code)})::text, 'null');`);
const detail = (uid, gid, day = DAY) => json(as(uid, `select group_detail('${gid}');`, day));
// Dohraný (nebo jen rozehraný) Kvíz dne zapsaný rovnou do tabulky (jeho pravidla hlídá tests/sql-daily-quiz.test.js)
const quiz = (uid, day, correct, score, timeMs, finished = true) => {
    const answered = finished ? 10 : Math.max(correct, 1);
    q(`insert into daily_quiz_results (user_id, day, answered, correct, score, time_ms, bitmap, finished_at)
       values ('${uid}', '${day}', ${answered}, ${correct}, ${score}, ${timeMs}, ${(1 << correct) - 1}, ${finished ? 'now()' : 'null'})`);
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

const USERS = 70;
const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(id);

test('SQL: Skupiny', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: USERS }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    let main;
    await t.test('verze schématu 8, pravidla řádků na všech tabulkách skupin', () => {
        assert.equal(last(ok(as(A, 'select schema_version();'))), '8');
        for (const table of ['groups', 'group_members', 'group_challenges', 'group_join_tries', 'xp_weekly']) {
            assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`), 't', table);
        }
    });

    await t.test('anon nic; přímý zápis do tabulek ani pomocné funkce nejdou', () => {
        for (const sql of ['select my_groups();', `select group_create('Třída', '🏫');`, `select group_join('ABCDEF');`, `select group_preview('ABCDEF');`,
            `select group_detail('${id(999)}');`, 'select * from groups;', 'select * from group_members;', 'select * from xp_weekly;']) {
            denied(as(null, sql, DAY, 'anon'), null, `anon: ${sql}`);
        }
        denied(as(null, `select group_create('Třída', '🏫');`), /Přihlas se/, 'bez tokenu');
        denied(as(A, `insert into groups (name, icon, code, owner_id) values ('Třída', '🏫', 'ABCDEF', '${A}');`), /permission denied/);
        denied(as(A, `insert into group_members (group_id, user_id) values (gen_random_uuid(), '${A}');`), /permission denied/);
        denied(as(A, `insert into xp_weekly (user_id, week, gained) values ('${A}', '${MONDAY}', 99999);`), /permission denied/);
        denied(as(A, `select * from group_join_tries;`), /permission denied/);
        for (const sql of ['select group_new_code();', `select group_clean_name('x');`, `select group_parse_code('ABCDEF');`, `select group_code_blocked('${A}');`,
            `select group_week_start('${DAY}');`, 'select group_icons();']) denied(as(A, sql), /permission denied/, sql);
    });

    await t.test('založení: název 2–40 znaků bez nepovolených znaků, ikona z nabídky, kód 6 znaků, zakladatel je členem', () => {
        main = create(A, '  5.B   Základka  ', '🏫');
        assert.equal(main.name, '5.B Základka', 'mezery očištěné');
        assert.match(main.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
        assert.deepEqual([main.is_owner, main.members, main.icon], [true, 1, '🏫']);
        denied(as(A, `select group_create('X', '🏫');`), /2 až 40/);
        denied(as(A, `select group_create(${lit('x'.repeat(41))}, '🏫');`), /2 až 40/);
        denied(as(A, `select group_create('<b>Třída</b>', '🏫');`), /nepovolený znak/);
        denied(as(A, `select group_create('Třída', '💩');`), /ikonu/);
        denied(as(A, `select group_create('Třída', null);`), /ikonu/);
        assert.equal(q(`select count(*) from groups`), '1', 'odmítnuté nic nezaložily');
    });

    await t.test('přidání kódem: náhled, malá písmena a mezery, opakované přidání nic nezmění, neznámý kód = null', () => {
        const preview = json(as(B, `select group_preview(${lit(main.code.toLowerCase().replace(/(...)/, '$1 '))});`));
        assert.deepEqual([preview.name, preview.members, preview.member, preview.owner.display_name], ['5.B Základka', 1, false, 'Hráč 1']);
        assert.deepEqual(Object.keys(preview.owner).sort(), ['avatar', 'color', 'display_name', 'frame', 'id', 'owl', 'title_pref']);
        const joined = json(join(B, main.code.toLowerCase()));
        assert.deepEqual([joined.id, joined.members, joined.is_owner], [main.id, 2, false]);
        assert.equal(json(join(B, main.code)).members, 2, 'podruhé se nic nezmění');
        assert.equal(last(ok(join(C, 'ZZZZZZ'))), 'null', 'neznámý kód vrátí null');
        assert.equal(last(ok(as(C, `select coalesce(group_preview('nesmysl')::text, 'null');`))), 'null');
        ok(join(C, main.code));
        assert.equal(json(as(C, `select group_preview(${lit(main.code)});`)).member, true);
    });

    await t.test('nečlen skupinu ani její členy nevidí (tabulky, detail, výzvy), člen jen své skupiny', () => {
        const other = create(D, 'Rodina', '👪');
        assert.equal(last(ok(as(E, `select count(*) from groups;`))), '0');
        assert.equal(last(ok(as(E, `select count(*) from group_members;`))), '0');
        assert.equal(last(ok(as(E, `select count(*) from group_challenges;`))), '0');
        denied(as(E, `select group_detail('${main.id}');`), /neexistuje nebo v ní nejsi/);
        assert.deepEqual(json(as(E, 'select my_groups();')), []);
        // Člen hlavní skupiny vidí ji a její 3 členy, ne cizí skupinu Rodina
        assert.equal(last(ok(as(B, `select string_agg(name, ',') from groups;`))), '5.B Základka');
        assert.equal(last(ok(as(B, `select count(*) from group_members;`))), '3');
        assert.equal(last(ok(as(B, `select count(*) from group_members where group_id = '${other.id}';`))), '0');
        denied(as(B, `select group_detail('${other.id}');`), /neexistuje nebo v ní nejsi/);
        // Ani zápis přes tabulky (žádné právo insert/update/delete)
        denied(as(E, `update groups set name = 'Moje' where id = '${main.id}';`), /permission denied/);
        denied(as(E, `delete from group_members where group_id = '${main.id}';`), /permission denied/);
        ok(as(D, `select group_delete('${other.id}');`));
    });

    await t.test('člen nesmí odebrat jiné, přejmenovat, změnit kód ani smazat; opustit smí, zakladatel ne', () => {
        denied(as(B, `select group_remove_member('${main.id}', '${C}');`), /jen zakladatel/);
        denied(as(B, `select group_remove_member('${main.id}', '${A}');`), /jen zakladatel/);
        denied(as(B, `select group_update('${main.id}', 'Ukradená', '🔥');`), /jen zakladatel/);
        denied(as(B, `select group_regenerate_code('${main.id}');`), /jen zakladatel/);
        denied(as(B, `select group_delete('${main.id}');`), /jen zakladatel/);
        denied(as(E, `select group_remove_member('${main.id}', '${B}');`), /neexistuje nebo v ní nejsi/, 'nečlen');
        denied(as(E, `select group_leave('${main.id}');`), /neexistuje nebo v ní nejsi/);
        assert.equal(q(`select count(*) from group_members where group_id = '${main.id}'`), '3');
        denied(as(A, `select group_leave('${main.id}');`), /Zakladatel skupinu neopouští/);
        ok(as(C, `select group_leave('${main.id}');`));
        assert.equal(q(`select count(*) from group_members where group_id = '${main.id}'`), '2');
    });

    await t.test('zakladatel: přejmenuje, změní ikonu, nový kód (starý přestane platit), odebere člena, sebe ne', () => {
        const renamed = json(as(A, `select group_update('${main.id}', 'Třída 5.B', '🎒');`));
        assert.deepEqual([renamed.name, renamed.icon], ['Třída 5.B', '🎒']);
        denied(as(A, `select group_update('${main.id}', 'A', '🎒');`), /2 až 40/);
        const oldCode = main.code;
        const fresh = last(ok(as(A, `select group_regenerate_code('${main.id}');`)));
        assert.match(fresh, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
        assert.notEqual(fresh, oldCode);
        main.code = fresh;
        assert.equal(last(ok(join(D, oldCode))), 'null', 'starý kód nefunguje');
        ok(join(D, fresh));
        ok(as(A, `select group_remove_member('${main.id}', '${D}');`));
        denied(as(A, `select group_remove_member('${main.id}', '${D}');`), /není/);
        denied(as(A, `select group_remove_member('${main.id}', '${A}');`), /Sebe/);
        assert.equal(q(`select string_agg(user_id::text, ',' order by joined_at) from group_members where group_id = '${main.id}'`), `${A},${B}`);
    });

    await t.test('hádání kódů: po 20 neúspěšných pokusech za hodinu se dál nehledá', () => {
        const guesser = id(60);
        for (let i = 0; i < 20; i++) assert.equal(last(ok(join(guesser, 'QQQQQQ'))), 'null');
        denied(join(guesser, main.code), /Příliš mnoho špatných kódů/);
        denied(as(guesser, `select group_preview(${lit(main.code)});`), /Příliš mnoho/);
        q(`update group_join_tries set window_start = now() - interval '2 hours' where user_id = '${guesser}'`);
        assert.equal(json(join(guesser, main.code)).id, main.id, 'po hodině znovu');
        ok(as(guesser, `select group_leave('${main.id}');`));
        // Platný kód se nepočítá jako pokus (počet zůstal z prošlého okna, další špatný kód začne nové okno)
        assert.equal(q(`select tries from group_join_tries where user_id = '${guesser}'`), '20');
        ok(join(guesser, 'QQQQQQ'));
        assert.equal(q(`select tries from group_join_tries where user_id = '${guesser}'`), '1');
    });

    await t.test('limit: hráč nejvýš v 10 skupinách (zakládání i přidání)', () => {
        const owner = id(30);
        const made = Array.from({ length: 10 }, (_, i) => create(owner, `Skupina ${i + 1}`, '🚀'));
        denied(as(owner, `select group_create('Jedenáctá', '🚀');`), /nejvýš v 10 skupinách/);
        denied(join(owner, main.code), /nejvýš v 10 skupinách/);
        assert.equal(q(`select count(*) from group_members where user_id = '${owner}'`), '10');
        // Kdo je v 10 skupinách, do další se nepřidá ani kódem cizí skupiny
        const joiner = id(31);
        made.forEach(group => ok(join(joiner, group.code)));
        denied(join(joiner, main.code), /nejvýš v 10 skupinách/);
        ok(as(joiner, `select group_leave('${made[0].id}');`));
        ok(join(joiner, main.code));
        ok(as(joiner, `select group_leave('${main.id}');`));
        made.forEach(group => ok(as(owner, `select group_delete('${group.id}');`)));
        assert.equal(q(`select count(*) from group_members where user_id in ('${owner}', '${joiner}')`), '0', 'smazání skupiny smaže i členství');
    });

    await t.test('limit: skupina má nejvýš 50 členů', () => {
        const big = create(id(40), 'Celá škola', '🌍');
        for (let n = 41; n < 90 && n <= USERS; n++) ok(join(id(n), big.code));
        // 1 + 30 členů (id 41–70); doplní se rovnou do tabulky až na 50 a další se už nepřidá
        q(`insert into group_members (group_id, user_id) select '${big.id}', u.id from auth.users u
           where u.id not in (select user_id from group_members where group_id = '${big.id}') and u.id not in ('${A}', '${B}', '${C}', '${D}', '${E}')
           order by u.id limit ${50 - Number(q(`select count(*) from group_members where group_id = '${big.id}'`))}`);
        assert.equal(q(`select count(*) from group_members where group_id = '${big.id}'`), '50');
        denied(join(E, big.code), /plná/);
        ok(as(id(40), `select group_delete('${big.id}');`));
    });

    await t.test('blokování: hráč, kterého zakladatel zablokoval, se nepřidá', () => {
        q(`insert into player_blocks (blocker, blocked) values ('${A}', '${E}')`);
        denied(join(E, main.code), /nemůžeš/);
        q(`delete from player_blocks where blocker = '${A}'`);
    });

    await t.test('týdenní XP: přírůstky ze synchronizace postupu, nejvýš 1500 za zápis, první nahrání do prázdného účtu se nepočítá', () => {
        const gained = (uid, week = MONDAY) => q(`select coalesce((select gained from xp_weekly where user_id = '${uid}' and week = '${week}'), 0)`);
        ok(as(A, `update profiles set xp = 20000 where id = '${A}';`));
        assert.equal(gained(A), '0', 'starší postup ze zařízení');
        ok(as(A, `update profiles set xp = 20320 where id = '${A}';`));
        ok(as(A, `update profiles set xp = 25000 where id = '${A}';`));
        assert.equal(gained(A), String(320 + 1500));
        ok(as(A, `update profiles set xp = 100 where id = '${A}';`));
        assert.equal(q(`select xp from profiles where id = '${A}'`), '25000', 'XP neklesne');
        assert.equal(gained(A), String(320 + 1500));
        ok(as(B, `update profiles set xp = 180 where id = '${B}';`));
        ok(as(B, `update profiles set xp = 400 where id = '${B}';`, '2026-11-16'));
        assert.equal(gained(B), '180', 'malé první nahrání se počítá');
        assert.equal(gained(B, '2026-11-16'), '220', 'další týden má vlastní součet');
        // Cizí profil změnit nejde (pravidlo řádků), takže ani cizí týdenní XP
        ok(as(B, `update profiles set xp = 99999 where id = '${A}';`));
        assert.equal(gained(A), String(320 + 1500));
        assert.equal(last(ok(as(B, 'select count(*) from xp_weekly;'))), '2', 'hráč vidí jen své týdny');
    });

    await t.test('pořadí skupiny: Kvíz dne dnes (jen dohraný) a za týden, týdenní XP, jen veřejné údaje profilu', () => {
        ok(join(C, main.code));
        quiz(A, DAY, 8, 30, 90000);
        quiz(B, DAY, 9, 34, 120000, false);
        quiz(B, MONDAY, 10, 40, 80000);
        quiz(B, '2026-11-10', 6, 20, 70000, false);
        quiz(A, '2026-11-08', 10, 40, 60000);
        quiz(C, MONDAY, 5, 18, 100000);
        const data = detail(B, main.id);
        assert.deepEqual([data.day, data.week_start, data.members, data.is_owner], [DAY, MONDAY, 3, false]);
        const byId = Object.fromEntries(data.rows.map(row => [row.id, row]));
        assert.deepEqual(byId[A].today, { score: 30, correct: 8, time_ms: 90000 });
        assert.equal(byId[B].today, null, 'rozehraný dnešek se do Dnes nepočítá');
        assert.deepEqual([byId[A].week_score, byId[A].week_days], [30, 1], 'neděle 8. 11. patří do minulého týdne');
        assert.deepEqual([byId[B].week_score, byId[B].week_days, byId[B].week_correct], [60, 2, 16], 'minulý den i nedohraný, jak stál; dnešní nedohraný ne');
        assert.deepEqual([byId[C].week_score, byId[C].today], [18, null]);
        assert.deepEqual([byId[A].week_xp, byId[B].week_xp, byId[C].week_xp], [1820, 180, 0]);
        assert.deepEqual([byId[A].owner, byId[B].me, byId[A].me], [true, true, false]);
        const allowed = ['avatar', 'color', 'display_name', 'frame', 'id', 'joined_at', 'me', 'owl', 'owner', 'title_pref', 'today', 'week_correct', 'week_days', 'week_score', 'week_time_ms', 'week_xp'];
        data.rows.forEach(row => assert.deepEqual(Object.keys(row).sort(), allowed, 'žádný e-mail, rating ani XP celkem'));
        // Moje skupiny: dnešní vedoucí (dohraný pokus) a jestli jsem dnes hrál
        const mine = json(as(B, 'select my_groups();'));
        assert.equal(mine.length, 1);
        assert.deepEqual([mine[0].leader.display_name, mine[0].leader.score, mine[0].played_today, mine[0].members], ['Hráč 1', 30, false, 3]);
        assert.equal(json(as(A, 'select my_groups();'))[0].played_today, true);
        assert.equal(json(as(A, 'select my_groups();'))[0].leader.me, true);
    });

    await t.test('výzva skupině: jen vlastní čerstvá výzva pro kohokoli, výsledky jen členů, do ratingu se nepočítá', () => {
        q(`insert into challenges (id, creator_id, topic, seed, count) values ('GRP234', '${B}', 'zemepis', 'vyzva-GRP234', 5)`);
        q(`insert into challenges (id, creator_id, topic, seed, count, invited_id) values ('DUO234', '${B}', 'zemepis', 'vyzva-DUO234', 5, '${A}')`);
        q(`insert into challenges (id, creator_id, topic, seed, count) values ('CIZ234', '${C}', 'zemepis', 'vyzva-CIZ234', 5)`);
        denied(as(B, `select group_set_challenge('${main.id}', 'DUO234');`), /připojit nejde/, 'výzva pro jednoho hráče');
        denied(as(B, `select group_set_challenge('${main.id}', 'CIZ234');`), /připojit nejde/, 'cizí výzva');
        denied(as(E, `select group_set_challenge('${main.id}', 'GRP234');`), /nejsi/, 'nečlen');
        ok(as(B, `select group_set_challenge('${main.id}', 'grp234');`));
        denied(as(B, `select group_set_challenge('${main.id}', 'GRP234');`), /už ke skupině patří/);
        // Hrají tři členové a jeden cizí hráč s kódem
        const results = [[B, 4, 9], [A, 5, 12], [E, 5, 20], [C, 2, 4]];
        results.forEach(([uid, correct, points]) => q(`insert into challenge_results (challenge_id, user_id, correct, points) values ('GRP234', '${uid}', ${correct}, ${points})`));
        assert.equal(q(`select count(*) from rating_history where challenge_id = 'GRP234'`), '0', 'bez ratingu');
        const data = detail(C, main.id);
        assert.equal(data.challenge.id, 'GRP234');
        assert.equal(data.challenge.creator.display_name, 'Hráč 2');
        assert.deepEqual(data.challenge.results.map(row => row.user_id), [A, B, C], 'jen členové, nejlepší první');
        // Nečlen připojenou výzvu nevidí v tabulce propojení
        assert.equal(last(ok(as(E, `select count(*) from group_challenges;`))), '0');
    });

    await t.test('export: moje skupiny, výzvy skupině a týdenní XP; cizí členové ne', () => {
        const data = json(as(B, 'select export_my_data();'));
        assert.equal(data.skupiny.length, 1);
        assert.deepEqual([data.skupiny[0].nazev, data.skupiny[0].zakladatel], ['Třída 5.B', false]);
        assert.deepEqual(data.skupiny_vyzvy.map(row => row.vyzva), ['GRP234']);
        assert.deepEqual(data.xp_tydny.map(row => [row.week, row.gained]), [[MONDAY, 180], ['2026-11-16', 220]]);
        assert.ok(!JSON.stringify(data.skupiny).includes(C), 'ostatní členové nejsou v exportu');
    });

    await t.test('smazání účtu: skupinu převezme nejdéle přidaný člen, skupina jen se zakladatelem zmizí, členství i týdenní XP zmizí', () => {
        const solo = create(A, 'Jen já', '🦉');
        assert.equal(last(ok(as(A, 'select delete_my_account();'))), 't');
        assert.equal(q(`select owner_id from groups where id = '${main.id}'`), B, 'převzal nejdéle přidaný');
        assert.equal(q(`select count(*) from groups where id = '${solo.id}'`), '0');
        assert.equal(q(`select count(*) from group_members where user_id = '${A}'`), '0');
        assert.equal(q(`select count(*) from xp_weekly where user_id = '${A}'`), '0');
        const data = detail(B, main.id);
        assert.deepEqual([data.is_owner, data.members], [true, 2]);
        ok(as(B, `select group_remove_member('${main.id}', '${C}');`));
    });

    await t.test('oprávnění funkcí: hráč volá jen RPC skupin, pomocné funkce ani triggerové nikdo', () => {
        const granted = q(`select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'group%' or p.proname in ('my_groups', 'is_group_member', 'count_weekly_xp'))
            and has_function_privilege('authenticated', p.oid, 'execute')`);
        assert.deepEqual(granted.split(','), ['group_create', 'group_delete', 'group_detail', 'group_join', 'group_leave', 'group_preview', 'group_regenerate_code',
            'group_remove_member', 'group_set_challenge', 'group_update', 'is_group_member', 'my_groups'].sort());
        const anon = q(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'group%' or p.proname in ('my_groups', 'is_group_member', 'count_weekly_xp')) and has_function_privilege('anon', p.oid, 'execute')`);
        assert.equal(anon, '0');
        // Funkce, které mění data, běží s právy vlastníka a pevnou search_path
        const definers = q(`select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'group%' and has_function_privilege('authenticated', p.oid, 'execute') and not (p.prosecdef and array_to_string(p.proconfig, ',') like 'search_path=%')`);
        assert.equal(definers, '');
    });
});
