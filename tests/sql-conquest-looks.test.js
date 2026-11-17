// Výplně území (vzory) a vzácné znaky do Dobývání v databázi (PostgreSQL 16, blok „38: Dobývání – výplně území a vzácné znaky“): statistiky
// hráče z dat serveru (i zpětně: dohrané hry, výhry podle mapy, tempa a Návratu do hry, hry bez ztráty hradu, celé regiony, vyhrané bitvy,
// území přes moře, Boss týdne, série Kvízu dne, celé Řetězovky, odznaky Zlaté otázky, zimní Sezóna, Truhla, úroveň), odemčení do
// conquest_looks a ohlášení nových, volba při založení, přidání a změně vzhledu jen odemčeného (správce cokoli), vzor v souhrnu hry,
// truhla s Duhou, boti nic, pravidla řádků, oprávnění, export a smazání účtu. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_looks_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
const C = require('../conquest.js');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
let clock = '2026-11-12T10:00:00Z';
const as = (uid, sql, role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${clock}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const lit = (text) => (text === null || text === undefined ? 'null' : `'${String(text).replace(/'/g, "''")}'`);

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

const [A, B, D, E, ADMIN] = [1, 2, 4, 5, 6].map(id);
const BOT = id(90);
let LUCKY = null;
const looks = (uid) => json(as(uid, 'select conquest_looks();'));
// Nepovinné poslední parametry: výplň (pattern, blok 38) a sada hradů (castle, blok 40); bez nich volání postaru
const tail = (pattern, castle) => (pattern === undefined && castle === undefined ? '' : `, ${lit(pattern === undefined ? null : pattern)}${castle === undefined ? '' : `, ${lit(castle)}`}`);
const create = (uid, { map = 'evropa', players = 2, hours = 24, minutes = null, per = 'hour', actions = 5, colour = 'cervena', emblem = 'lev', pattern, castle } = {}) =>
    as(uid, `select conquest_create(${lit(map)}, ${players}, ${hours === null ? 'null' : hours}, ${lit(per)}, ${actions}, 'private', ${lit(colour)}, ${lit(emblem)}, ${minutes === null ? 'null' : minutes}${tail(pattern, castle)});`);
const join = (uid, code, { colour = 'modra', emblem = 'orel', pattern, castle } = {}) =>
    as(uid, `select conquest_join(null, ${lit(code)}, ${lit(colour)}, ${lit(emblem)}${tail(pattern, castle)});`);
const move = (uid, game, target, kind, source = null) => ok(as(uid, `select conquest_move(${lit(game)}, ${lit(target)}, ${lit(kind)}, true, ${lit(source)});`));
const place = (game, territory, owner, { home = false } = {}) =>
    q(`update conquest_territories set owner = ${owner ? lit(owner) : 'null'}, level = 0, home = ${home}, treasure = false where game_id = ${lit(game)} and territory = ${lit(territory)}`);
// Hra na den pro dva (počítá se: trvá aspoň den), mapa a domovy podle zadání
const twoPlayerGame = (a, b, map, homeA, homeB) => {
    const game = json(create(a, { map }));
    ok(join(b, game.code));
    q(`update conquest_territories set owner = null, level = 0, home = false, treasure = false where game_id = ${lit(game.id)}`);
    place(game.id, homeA, a, { home: true });
    place(game.id, homeB, b, { home: true });
    return game;
};
const finish = (game) => q(`update conquest_games set ends_at = '2026-11-01T00:00:00Z' where id = ${lit(game.id)}`);

test('SQL: výplně území a vzácné znaky v Dobývání', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q([A, B, D, E, ADMIN].map((uid, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    q(`insert into auth.users (id, email, raw_user_meta_data) values ('${BOT}', 'bot-${BOT}@bots.invalid', '{"full_name": "Bot Adam"}')`);
    q(`insert into dev_admins (user_id) values ('${ADMIN}')`);

    await t.test('katalog odpovídá conquest.js (pořadí, statistika a hranice); seznamy vzorů, vzácných znaků a sad hradů', () => {
        const rows = q(`select string_agg(kind || '|' || item || '|' || stat || '|' || need, ',' order by kind desc, ord) from conquest_look_catalog()`).split(',');
        const js = [...C.PATTERNS.map(p => `pattern|${p.id}|${p.stat}|${p.need}`), ...C.RARE_EMBLEMS.map(e => `emblem|${e.id}|${e.stat}|${e.need}`),
            ...C.CASTLE_SETS.map(c => `castle|${c.id}|${c.stat}|${c.need}`)];
        assert.deepEqual(rows, js);
        assert.equal(q('select array_to_string(conquest_castles(), \',\')'), C.CASTLE_SETS.map(c => c.id).join(','));
        assert.equal(q('select array_to_string(conquest_patterns(), \',\')'), C.PATTERNS.map(p => p.id).join(','));
        assert.equal(q('select array_to_string(conquest_rare_emblems(), \',\')'), C.RARE_EMBLEMS.map(e => e.id).join(','));
        assert.equal(q('select count(*) from conquest_links where sea'), '58', 'námořní spoje oběma směry na čtyřech mapách');
        assert.equal(q(`select sea from conquest_links where map = 'evropa' and a = 'Q142' and b = 'Q145'`), 't', 'Francie–Velká Británie přes moře');
        assert.equal(q(`select sea from conquest_links where map = 'evropa' and a = 'Q142' and b = 'Q31'`), 'f', 'Francie–Belgie po souši');
    });

    await t.test('nový hráč nic nemá; tabulka jen přes funkce; oprávnění; anon nic; bot nic', () => {
        const mine = looks(A);
        assert.deepEqual([mine.patterns, mine.emblems, mine.new], [[], [], []]);
        assert.equal(mine.stats.games, 0);
        assert.equal(mine.stats.level, 1);
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.conquest_looks'::regclass`), 't');
        denied(as(A, `insert into conquest_looks (user_id, kind, item) values ('${A}', 'pattern', 'duha');`), /permission denied/, 'zápis jen přes funkce');
        denied(as(A, `update conquest_looks set seen_at = now();`), /permission denied/);
        const can = (role, fn) => q(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`);
        for (const fn of ['conquest_looks()', 'conquest_looks_seen(timestamp with time zone)', 'conquest_create(text, integer, integer, text, integer, text, text, text, integer, text, text)',
            'conquest_join(uuid, text, text, text, text, text)', 'conquest_set_look(uuid, text, text, text, text)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['t', 'f', 'f'], fn);
        }
        for (const fn of ['conquest_look_stats(uuid)', 'conquest_looks_json(uuid)', 'conquest_look_owned(uuid, text, text)', 'conquest_check_style(uuid, text, text)',
            'conquest_chest_pattern(uuid, text)', 'conquest_look_catalog()', 'conquest_rare_emblems()', 'conquest_patterns()', 'conquest_add_player(public.conquest_games, uuid, text, text, text, text)',
            'conquest_castles()', 'conquest_check_castle(uuid, text)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['f', 'f', 'f'], fn);
        }
        for (const old of ['conquest_join(uuid, text, text, text)', 'conquest_set_look(uuid, text, text)', 'conquest_create(text, integer, integer, text, integer, text, text, text, integer)',
            'conquest_add_player(public.conquest_games, uuid, text, text)', 'conquest_join(uuid, text, text, text, text)', 'conquest_set_look(uuid, text, text, text)',
            'conquest_create(text, integer, integer, text, integer, text, text, text, integer, text)', 'conquest_add_player(public.conquest_games, uuid, text, text, text)']) {
            assert.equal(q(`select to_regprocedure('public.${old}') is null`), 't', `stará podoba ${old} zmizela`);
        }
        denied(as(null, 'select conquest_looks();', 'anon'), null, 'anon nic');
        denied(as(null, 'select conquest_looks();'), /Přihlas se/);
        denied(as(A, `select conquest_look_stats('${A}');`), /permission denied/);
        assert.deepEqual(JSON.parse(q(`select conquest_looks_json('${BOT}')`)), { patterns: [], emblems: [], castles: [], new: [], stats: {} });
        assert.deepEqual([mine.castles, mine.stats.home_fortress, mine.stats.season15], [[], 0, 0], 'sady hradů (blok 40)');
        assert.equal(q(`select conquest_look_stats('${BOT}')`), '{}');
    });

    await t.test('volba: vzácný znak a vzor jen odemčené, neznámý vzor ne; bez vzoru jako dřív (i staré volání bez parametru); správce cokoli', () => {
        denied(create(A, { emblem: 'sfinga' }), /Tenhle vzácný znak ještě nemáš/);
        denied(create(A, { pattern: 'plameny' }), /Tuhle výplň území ještě nemáš/);
        denied(create(A, { pattern: 'kostkovany' }), /Vyber výplň území z nabídky/);
        denied(create(A, { emblem: 'jednorozec-x' }), /Vyber znak z nabídky/);
        const game = json(create(A));
        assert.equal(game.players[0].pattern, null);
        denied(join(B, game.code, { emblem: 'gryf' }), /vzácný znak ještě nemáš/);
        denied(join(B, game.code, { pattern: 'duha' }), /výplň území ještě nemáš/);
        // Správce vidí jen opravdu odemčené (jako běžný hráč; všechno mu nabídne až vývojářské „Odemknout úplně vše“), vybrat smí cokoli
        const admin = looks(ADMIN);
        assert.equal(admin.patterns.length, 0);
        assert.equal(admin.emblems.length, 0);
        assert.deepEqual(admin.new, [], 'správci se nic neohlašuje (nic opravdu neodemkl)');
        const joined = json(join(ADMIN, game.code, { emblem: 'kraken', pattern: 'brokat', colour: 'zelena' }));
        const row = joined.players.find(p => p.id === ADMIN);
        assert.deepEqual([row.emblem, row.pattern], ['kraken', 'brokat']);
        q(`delete from conquest_games where id = ${lit(game.id)}`);
    });

    await t.test('výhra na mapě Afrika: Sfinga po skončení hry (claim ohlásí novou), pak jde vybrat; hra bez ztráty hradu, bitvy; ohlášení jednou', () => {
        clock = '2026-11-12T10:00:00Z';
        const game = twoPlayerGame(A, B, 'afrika', 'Q262', 'Q79');
        move(A, game.id, 'Q1028', 'attack', 'Q262');
        move(A, game.id, 'Q948', 'attack', 'Q262');
        move(A, game.id, 'Q262', 'fortify');
        move(B, game.id, 'Q1016', 'attack', 'Q79');
        finish(game);
        const claim = json(as(A, `select conquest_claim(${lit(game.id)});`));
        assert.equal(claim.place, 1);
        assert.deepEqual(claim.looks.emblems, ['sfinga']);
        assert.deepEqual(claim.looks.new.map(n => `${n.kind}:${n.item}`), ['emblem:sfinga']);
        const s = claim.looks.stats;
        assert.deepEqual([s.games, s.wins, s.win_afrika, s.win_evropa, s.safe_home, s.battles, s.wins4, s.win_comeback], [1, 1, 1, 0, 1, 2, 0, 0]);
        // Poražený: hra se počítá jen s aspoň 3 vlastními tahy (B měl jeden)
        assert.equal(looks(B).stats.games, 0);
        assert.equal(looks(B).stats.battles, 1);
        // Ohlášení: seen do času odemčení → příště už není nové
        ok(as(A, `select conquest_looks_seen(${lit(claim.looks.new[0].at)});`));
        assert.deepEqual(looks(A).new, []);
        assert.deepEqual(looks(A).emblems, ['sfinga'], 'odemčené zůstane');
        // Teď jde Sfinga vybrat; souhrn hry ji ukáže všem
        const next = json(create(A, { emblem: 'sfinga' }));
        assert.equal(next.players[0].emblem, 'sfinga');
        q(`delete from conquest_games where id = ${lit(next.id)}`);
    });

    await t.test('území přes moře: dobytí po námořním spoji (Francie → Velká Británie) se počítá, po souši ne; zisk zůstane i po smazání hry', () => {
        clock = '2026-11-13T10:00:00Z';
        const game = twoPlayerGame(D, E, 'evropa', 'Q142', 'Q28');
        move(D, game.id, 'Q145', 'attack', 'Q142');
        move(D, game.id, 'Q31', 'attack', 'Q142');
        const s = looks(D).stats;
        assert.deepEqual([s.sea, s.battles], [1, 2]);
        // Odemčené zůstane, i když hra zmizí (Vlnky za 15 území přes moře: tady jen zapsané ručně jako dřívější zisk)
        q(`insert into conquest_looks (user_id, kind, item, unlocked_at) values ('${D}', 'pattern', 'vlnky', '2026-11-13T10:00:00Z')`);
        q(`delete from conquest_games where id = ${lit(game.id)}`);
        assert.deepEqual(looks(D).patterns, ['vlnky']);
        assert.equal(looks(D).stats.sea, 0);
    });

    await t.test('zpětně z jiných módů: Boss 4×, série Kvízu dne 30 dní, 15 celých Řetězovek, Zlatá otázka 10, zimní Sezóna 15. stupeň, úroveň 50', () => {
        const before = looks(E);
        assert.deepEqual(before.patterns, []);
        q(`insert into boss_results (user_id, week, best_damage, defeated, attempts) select '${E}', date '2026-09-07' + 7 * i, 700, true, 1 from generate_series(0, 3) i`);
        q(`insert into daily_quiz_results (user_id, day) select '${E}', date '2026-09-01' + i from generate_series(0, 29) i`);
        q(`insert into chain_results (user_id, day, links, score) select '${E}', date '2026-09-01' + i, 7, 28 from generate_series(0, 14) i`);
        q(`update profiles set badges = array['zlatokop-10'], xp = 82000 where id = '${E}'`);
        q(`insert into player_item_grants (user_id, key, kind, granted) values ('${E}', 'season:2026-01:15', 'extra_move', false)`);
        const after = looks(E);
        assert.deepEqual(after.patterns, ['mramor', 'hvezdna-noc', 'listi', 'led', 'zlato']);
        assert.deepEqual(after.emblems, ['sova-mudrlant']);
        assert.deepEqual([after.stats.boss, after.stats.daily_streak, after.stats.chains, after.stats.gold, after.stats.winter15, after.stats.level], [4, 30, 15, 10, 1, 50]);
        assert.equal(after.new.length, 6, 'všechno nové se ohlásí');
        // Série musí být po sobě: s mezerou se počítá nejdelší úsek; podzimní 15. stupeň zimní není
        q(`insert into daily_quiz_results (user_id, day) select '${D}', date '2026-09-01' + i from generate_series(0, 20) i where i <> 10`);
        q(`insert into player_item_grants (user_id, key, kind, granted) values ('${D}', 'season:2026-10:15', 'extra_move', true)`);
        const d = looks(D).stats;
        assert.deepEqual([d.daily_streak, d.winter15], [10, 0]);
        // Odznak série stačí (dřívější série jen v zařízení)
        q(`update profiles set badges = array['kviz-serie-100'] where id = '${D}'`);
        assert.equal(looks(D).stats.daily_streak, 100);
    });

    await t.test('Truhla Mudrlanta: los 100–129 dá Duhu (hned odemčená, truhla ji ohlásí), jinak ne', () => {
        clock = '2026-11-12T10:00:00Z';
        const week = q(`select 'chest:' || player_items_week('2026-11-12')`);
        const lucky = Number(q(`select n from generate_series(100, 20000) n where conquest_chest_pattern(('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '${week}') limit 1`));
        const unlucky = Number(q(`select n from generate_series(100, 20000) n where not conquest_chest_pattern(('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '${week}') limit 1`));
        const [L, U] = [id(lucky), id(unlucky)];
        LUCKY = L;
        q(`insert into auth.users (id, email) values ('${L}', 'l@example.com'), ('${U}', 'n@example.com')`);
        const r = json(as(L, `select player_items_claim('chest', '${week}');`));
        assert.equal(r.pattern, 'duha');
        assert.deepEqual(looks(L).patterns, ['duha']);
        assert.equal(json(as(L, `select player_items_claim('chest', '${week}');`)).pattern, 'duha', 'opakované otevření totéž');
        assert.equal(json(as(U, `select player_items_claim('chest', '${week}');`)).pattern, undefined);
        assert.deepEqual(looks(U).patterns, []);
    });

    await t.test('barevná výplň (Hermelín, Zlatá fólie, Zlatý brokát, Duha) jen jednou ve hře; šedé mohou mít víc hráčů (barvy jsou různé); pojistka v indexu', () => {
        clock = '2026-11-14T09:00:00Z';
        const L = LUCKY;
        const game = json(create(L, { pattern: 'duha', players: 4 }));
        denied(join(ADMIN, game.code, { colour: 'zelena', pattern: 'duha' }), /Výplň Duha už v této hře má jiný hráč\. Vyber jinou\./);
        const joined = json(join(ADMIN, game.code, { colour: 'zelena', pattern: 'brokat' }));
        assert.equal(joined.players.find(p => p.id === ADMIN).pattern, 'brokat');
        denied(as(ADMIN, `select conquest_set_look(${lit(game.id)}, 'zelena', 'lev', 'duha');`), /Výplň Duha už v této hře má jiný hráč/);
        // Šedá výplň: stejnou může mít víc hráčů (Mramor má E i správce), barvy jsou ve hře vždy různé
        json(as(ADMIN, `select conquest_set_look(${lit(game.id)}, 'zelena', 'lev', 'mramor');`));
        const both = json(join(E, game.code, { colour: 'fialova', pattern: 'mramor' }));
        assert.deepEqual(both.players.filter(p => p.pattern === 'mramor').map(p => p.flag_color).sort(), ['fialova', 'zelena']);
        denied(join(B, game.code, { colour: 'zelena' }), /Tuhle barvu už má jiný hráč/, 'barvy ve hře různé');
        // Hráč, který výplň má, ji může znovu potvrdit; když ji pustí, může ji vzít jiný
        json(as(L, `select conquest_set_look(${lit(game.id)}, 'cervena', 'lev', 'duha');`));
        json(as(L, `select conquest_set_look(${lit(game.id)}, 'cervena', 'lev', null);`));
        const taken = json(as(ADMIN, `select conquest_set_look(${lit(game.id)}, 'zelena', 'lev', 'duha');`));
        assert.equal(taken.players.find(p => p.me).pattern, 'duha');
        // Pojistka: dvě stejné barevné výplně v jedné hře nepustí ani přímý zápis
        const bad = psql(dbName, `update conquest_players set pattern = 'duha' where game_id = ${lit(game.id)} and user_id = '${L}'`);
        assert.match(bad.stderr, /conquest_players_fill_key/);
        q(`delete from conquest_games where id = ${lit(game.id)}`);
    });

    await t.test('vzor ve hře: založení, přidání a změna vzhledu se vzorem; souhrn ukáže vzor všem; vzor null = bez vzoru', () => {
        clock = '2026-11-14T10:00:00Z';
        const game = json(create(E, { pattern: 'mramor', emblem: 'sova-mudrlant', players: 3 }));
        assert.deepEqual([game.players[0].pattern, game.players[0].emblem], ['mramor', 'sova-mudrlant']);
        const joined = json(join(A, game.code, { emblem: 'sfinga' }));
        assert.equal(joined.players.find(p => p.id === A).pattern, null);
        const lobby = json(as(B, 'select conquest_lobby();'));
        assert.ok(lobby.looks && Array.isArray(lobby.looks.patterns), 'lobby posílá looks');
        const changed = json(as(E, `select conquest_set_look(${lit(game.id)}, 'cervena', 'lev', 'led');`));
        assert.deepEqual([changed.players.find(p => p.me).pattern, changed.players.find(p => p.me).emblem], ['led', 'lev']);
        denied(as(E, `select conquest_set_look(${lit(game.id)}, 'cervena', 'lev', 'duha');`), /výplň území ještě nemáš/);
        denied(as(A, `select conquest_set_look(${lit(game.id)}, 'zelena', 'kraken', null);`), /vzácný znak ještě nemáš/);
        const plain = json(as(E, `select conquest_set_look(${lit(game.id)}, 'cervena', 'lev', null);`));
        assert.equal(plain.players.find(p => p.me).pattern, null);
        // Vzor drží i kontrola v tabulce
        const bad = psql(dbName, `update conquest_players set pattern = 'Špatně!' where game_id = ${lit(game.id)} and user_id = '${E}'`);
        assert.match(bad.stderr, /conquest_players_pattern/);
    });

    await t.test('sady hradů (blok 40): Pevnost na domově 10×, 25 bitev, 15. stupeň Sezóny ve 3 sezónách; volba jen odemčené (správce cokoli), víc hráčů se stejnou sadou, souhrn všem', () => {
        clock = '2026-11-15T10:00:00Z';
        const [F, G] = [7, 8].map(id);
        q(`insert into auth.users (id, email) values ('${F}', 'f@example.com'), ('${G}', 'g@example.com')`);
        denied(create(F, { castle: 'goticky' }), /Tenhle hrad ještě nemáš\. Vyber jiný\./);
        denied(create(F, { castle: 'vezovy' }), /Vyber hrad z nabídky\./);
        denied(create(F, { pattern: null, castle: 'Gotický!' }), /Vyber hrad z nabídky/);
        assert.deepEqual(looks(F).castles, []);
        // Pevnost na domovském hradu ve skutečné hře: tři opevnění domova (Palisáda, Hradba, Pevnost), počítá se jen Pevnost
        const game = twoPlayerGame(F, G, 'evropa', 'Q142', 'Q28');
        for (let i = 0; i < 3; i++) move(F, game.id, 'Q142', 'fortify');
        assert.equal(q(`select level from conquest_territories where game_id = ${lit(game.id)} and territory = 'Q142'`), '3');
        move(G, game.id, 'Q28', 'fortify');
        assert.deepEqual([looks(F).stats.home_fortress, looks(G).stats.home_fortress], [1, 0]);
        // Dalších 8 Pevností z dřívějších her (zapsané rovnou do kroniky) a nepovedený pokus (nepočítá se): 9 z 10, ještě nic
        const fortify = (uid, count, result = 'fortify') => q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result, level)
            select ${lit(game.id)}, '${uid}', 1, 'fortify', 'Q142', ${result === 'fortify'}, '${result}', 3 from generate_series(1, ${count})`);
        fortify(F, 8);
        fortify(F, 1, 'fail');
        assert.deepEqual([looks(F).stats.home_fortress, looks(F).castles], [9, []]);
        fortify(F, 1);
        const unlocked = looks(F);
        assert.deepEqual([unlocked.stats.home_fortress, unlocked.castles], [10, ['goticky']]);
        assert.deepEqual(unlocked.new.filter(n => n.kind === 'castle').map(n => n.item), ['goticky'], 'nový hrad se ohlásí');
        // 25 vyhraných bitev (dobytí nebo pobořené opevnění) = Orientální palác
        const battles = (count) => q(`insert into conquest_moves (game_id, user_id, period, kind, territory, source, success, result, level)
            select ${lit(game.id)}, '${G}', 1, 'attack', 'Q142', 'Q28', true, case when i % 2 = 0 then 'capture' else 'breach' end, 0 from generate_series(1, ${count}) i`);
        battles(23);
        assert.deepEqual([looks(G).stats.battles, looks(G).castles], [23, []]);
        battles(2);
        assert.deepEqual(looks(G).castles, ['orientalni']);
        // 15. stupeň Sezóny ve 3 různých sezónách (jiné stupně se nepočítají) = Japonský hrad
        q(`insert into player_item_grants (user_id, key, kind, granted) values ('${F}', 'season:2026-01:15', 'extra_move', true), ('${F}', 'season:2026-05:15', 'extra_move', false),
            ('${F}', 'season:2026-05:5', 'fifty', true), ('${F}', 'season:2026-06:8', 'revive', true)`);
        assert.deepEqual([looks(F).stats.season15, looks(F).castles], [2, ['goticky']]);
        q(`insert into player_item_grants (user_id, key, kind, granted) values ('${F}', 'season:2026-09:15', 'extra_move', false)`);
        assert.deepEqual([looks(F).stats.season15, looks(F).castles], [3, ['goticky', 'japonsky']], 'v pořadí nabídky');
        // Odemčené zůstane, i když hra s Pevnostmi zmizí
        q(`delete from conquest_games where id = ${lit(game.id)}`);
        assert.deepEqual([looks(F).stats.home_fortress, looks(F).castles], [0, ['goticky', 'japonsky']]);
        // Volba: založení s odemčenou sadou, souhrn ji ukáže; cizí zamčená ne; stejnou sadu smí mít víc hráčů (správce cokoli)
        const lobby = json(create(F, { castle: 'goticky', emblem: 'lev', players: 4 }));
        assert.deepEqual([lobby.players[0].castle, lobby.players[0].pattern], ['goticky', null]);
        denied(join(G, lobby.code, { castle: 'goticky' }), /Tenhle hrad ještě nemáš/);
        const joined = json(join(G, lobby.code, { castle: 'orientalni' }));
        assert.equal(joined.players.find(p => p.id === G).castle, 'orientalni');
        const admin = json(join(ADMIN, lobby.code, { colour: 'zelena', pattern: 'brokat', castle: 'goticky' }));
        assert.deepEqual(admin.players.filter(p => p.castle === 'goticky').map(p => p.id).sort(), [F, ADMIN].sort(), 'sada není jedinečná');
        assert.equal(looks(ADMIN).castles.length, 0, 'správce vidí jen opravdu odemčené');
        // Ostatní hráči vidí sadu v lobby i ve stavu hry
        assert.equal(json(as(G, `select conquest_state(${lit(lobby.id)});`)).players.find(p => p.id === F).castle, 'goticky');
        assert.equal(json(as(G, 'select conquest_lobby();')).mine.find(g => g.id === lobby.id).players.find(p => p.id === F).castle, 'goticky');
        // Změna vzhledu: jiná odemčená sada, zamčená ne, null = základní; volání bez sady (starší aplikace) nechá základní hrad
        const setLook = (uid, colour, castle) => as(uid, `select conquest_set_look(${lit(lobby.id)}, ${lit(colour)}, 'lev', null${castle === undefined ? '' : `, ${lit(castle)}`});`);
        assert.equal(json(setLook(F, 'cervena', 'japonsky')).players.find(p => p.me).castle, 'japonsky');
        denied(setLook(F, 'cervena', 'orientalni'), /Tenhle hrad ještě nemáš/);
        denied(setLook(F, 'cervena', 'neznamy'), /Vyber hrad z nabídky/);
        assert.equal(json(setLook(F, 'cervena', null)).players.find(p => p.me).castle, null);
        assert.equal(json(setLook(F, 'cervena', '')).players.find(p => p.me).castle, null, 'prázdná = základní');
        json(setLook(G, 'modra', 'orientalni'));
        assert.equal(json(setLook(G, 'modra')).players.find(p => p.me).castle, null);
        // Pravidlo v tabulce
        const bad = psql(dbName, `update conquest_players set castle = 'Špatně!' where game_id = ${lit(lobby.id)} and user_id = '${F}'`);
        assert.match(bad.stderr, /conquest_players_castle/);
        // Bot sadu nemá a nic neodemyká
        assert.deepEqual(JSON.parse(q(`select conquest_looks_json('${BOT}')`)).castles, []);
        q(`delete from conquest_games where id = ${lit(lobby.id)}`);
    });

    await t.test('export a smazání účtu', () => {
        const exported = json(as(E, 'select export_my_data();'));
        assert.deepEqual(exported.dobyvani_vzhled.map(row => `${row.kind}:${row.item}`).sort(), ['emblem:sova-mudrlant', 'pattern:hvezdna-noc', 'pattern:led', 'pattern:listi', 'pattern:mramor', 'pattern:zlato']);
        assert.equal(q(`select string_agg(item, ',' order by item) from conquest_looks where user_id = '${D}'`), 'hvezdna-noc,vlnky', 'Vlnky ze smazané hry a Hvězdná noc za odznak série');
        ok(as(D, 'select delete_my_account();'));
        assert.equal(q(`select count(*) from conquest_looks where user_id = '${D}'`), '0');
    });
});
