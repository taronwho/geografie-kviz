// Pomůcka Vzkříšení v Dobývání (PostgreSQL 16, blok „39: Dobývání – pomůcka Vzkříšení“): automatický Návrat do hry už není; hráč bez území
// se vrátí jen Vzkříšením (nejvýš 3 v zásobě). Zisk: startovní jednou, 8. stupeň Sezóny, Truhla Mudrlanta 10 % a Zlatá truhla 15 %
// (stejný týdenní los), milník série Kvízu dne, započítaná hra s body (conquest_claim: revive_item); boti nic. Použití: jen bez území
// a se zásobou; cíl neutrální nebo cizí neopevněné území, ne domovský hrad, obléhané ani chráněné; zásoba o 1 méně, území není domovské,
// tah 'revive' v kronice s obětí, poklad +1 tah; ochrana 60 s (útok, bitva, boti ani jiné Vzkříšení ne, majitel opevnit smí; s časem
// z mudrlant.test_now); hráč bez území a bot bez území kolo dohráli a další kolo chtějí sami, pořadí hráčů bez bodů podle toho, kdo
// vydržel déle; Fénix i po Vzkříšení. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_vzkriseni_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Hodiny (mudrlant.test_now: Dobývání, pomůcky) a den Kvízu dne (mudrlant.test_today)
let clock = '2026-11-12T10:00:00Z';
let today = '2026-11-12';
const as = (uid, sql, role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${clock}'; set mudrlant.test_today = '${today}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
// Jako správce databáze, ale s hodinami testu (začátek hry s botem)
const sys = (sql) => { const r = psql(dbName, `set mudrlant.test_now = '${clock}'; ${sql}`); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const lit = (text) => (text === null ? 'null' : `'${String(text).replace(/'/g, "''")}'`);
const items = (uid) => json(as(uid, 'select player_items_mine();'));
const setStock = (uid, kind, count) => q(`insert into player_items (user_id, kind, count) values ('${uid}', '${kind}', ${count}) on conflict (user_id, kind) do update set count = excluded.count`);
const claim = (uid, source, key) => as(uid, `select player_items_claim(${lit(source)}, ${lit(key)});`);
const pick = (item) => item && [item.kind, item.granted, Boolean(item.full), Boolean(item.already), item.count];

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
const BOT = id(90);
const create = (uid, { players = 3, hours = 72, minutes = null, per = 'day', actions = 3 } = {}) =>
    as(uid, `select conquest_create('evropa', ${players}, ${hours}, ${lit(per)}, ${actions}, 'private', 'cervena', 'lev', ${minutes === null ? 'null' : minutes});`);
const join = (uid, code, colour) => as(uid, `select conquest_join(null, ${lit(code)}, ${lit(colour)}, 'orel');`);
const state = (uid, game) => json(as(uid, `select conquest_state(${lit(game)});`));
const move = (uid, game, target, kind, correct, source = null) => as(uid, `select conquest_move(${lit(game)}, ${lit(target)}, ${lit(kind)}, ${correct}, ${lit(source)});`);
const revive = (uid, game, target) => as(uid, `select conquest_use_revive(${lit(game)}, ${lit(target)});`);
const QUESTION = { kind: 'flag', prompt: 'Čí je tahle vlajka?', choices: [{ label: 'Slovensko', correct: true }, { label: 'Slovinsko' }, { label: 'Srbsko' }, { label: 'Rusko' }] };
const begin = (uid, game, target) => as(uid, `select conquest_siege_begin(${lit(game)}, ${lit(target)}, ${lit(JSON.stringify(QUESTION))}::jsonb, 0::smallint, null);`);
const place = (game, territory, owner, { level = 0, home = false, treasure = false } = {}) =>
    q(`update conquest_territories set owner = ${owner ? lit(owner) : 'null'}, level = ${level}, home = ${home}, treasure = ${treasure}, shield_until = null where game_id = ${lit(game)} and territory = ${lit(territory)}`);
const clearMap = (game) => q(`update conquest_territories set owner = null, level = 0, home = false, treasure = false, shield_until = null where game_id = ${lit(game)}`);
const owned = (st, uid) => st.territories.filter(item => item.o === uid).map(item => item.t).sort();
// Hra tří hráčů na 3 dny (kolo = den, 3 tahy), začne plná; mapa: Česko (a), Polsko (b), Slovensko (c), jinak nic
const newGame = (a, b, c, options = {}) => {
    const game = json(create(a, options));
    ok(join(b, game.code, 'modra'));
    if (c === BOT) sys(`select conquest_add_player(g, '${BOT}', 'zelena', 'drak') from conquest_games g where g.id = '${game.id}'`);
    else ok(join(c, game.code, 'zelena'));
    clearMap(game.id);
    place(game.id, 'Q213', a, { home: true });
    place(game.id, 'Q36', b, { home: true });
    if (c !== BOT) place(game.id, 'Q214', c, { home: true });
    q(`update conquest_players set lost_period = null where game_id = '${game.id}'`);
    return game;
};

test('SQL: pomůcka Vzkříšení', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q([A, B, C, D, E].map((uid, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    q(`insert into auth.users (id, email, raw_user_meta_data) values ('${BOT}', 'bot-${BOT}@bots.invalid', '{"full_name": "Bot Adam"}')`);

    await t.test('zisk: startovní jednou, strop 3, 8. stupeň Sezóny, Truhla 10 % a Zlatá truhla 15 % ze stejného losu, milník série Kvízu dne; boti nic', () => {
        assert.equal(q(`select schema_version()`), '39');
        clock = '2026-11-20T10:00:00Z';
        // Startovní: první načtení zásoby (i lobby nebo stav hry), jen jednou
        assert.deepEqual([items(A).revive, items(A).max.revive], [1, 3]);
        assert.equal(items(A).revive, 1, 'podruhé nic');
        json(as(A, 'select conquest_lobby();'));
        assert.equal(q(`select string_agg(key || '=' || kind || '=' || granted, ',') from player_item_grants where user_id = '${A}'`), 'starter=revive=true');
        // Boti nic
        assert.equal(q(`select conquest_revive_starter('${BOT}') is null`), 't');
        assert.equal(q(`select count(*) from player_item_grants where user_id = '${BOT}'`), '0');
        // 8. stupeň Sezóny (jednou za klíč); strop 3 – plná zásoba nic
        assert.deepEqual(pick(json(claim(A, 'season', 'season:2026-11:8'))), ['revive', true, false, false, 2]);
        assert.deepEqual(pick(json(claim(A, 'season', 'season:2026-11:8'))), ['revive', true, false, true, 2], 'jednou za klíč');
        assert.deepEqual(pick(json(claim(A, 'season', 'season:2026-10:8'))), ['revive', true, false, false, 3]);
        setStock(A, 'revive', 3);
        clock = '2026-12-02T10:00:00Z';
        assert.deepEqual(pick(json(claim(A, 'season', 'season:2026-12:8'))), ['revive', false, true, false, 3], 'nejvýš 3');
        // Truhla Mudrlanta 130–229 (10 %) a Zlatá truhla 200–349 (15 %): stejný týdenní los jako ostatní pomůcky
        clock = '2026-11-20T10:00:00Z';
        const users = Array.from({ length: 160 }, (_, i) => id(600 + i));
        q(`insert into auth.users (id, email) select u, 'v' || u || '@example.com' from unnest(array[${users.map(lit).join(', ')}]::uuid[]) u`);
        const roll = (uid, key) => Number(q(`select player_item_roll('${uid}', '${key}')`));
        const chestLucky = users.filter(u => roll(u, 'chest:2026-W47') >= 130 && roll(u, 'chest:2026-W47') < 230);
        assert.ok(chestLucky.length >= 5 && chestLucky.length <= 32, `zhruba 10 %: ${chestLucky.length} ze 160`);
        const chest = json(claim(chestLucky[0], 'chest', 'chest:2026-W47'));
        assert.deepEqual([chest.kind, chest.granted, chest.lucky, chest.items.revive, chest.items.fifty], ['revive', true, true, 1, 0]);
        assert.equal(json(claim(chestLucky[0], 'chest', 'chest:2026-W47')).already, true, 'jen jednou za týden');
        const goldLucky = users.filter(u => roll(u, 'gold:2026-W47') >= 200 && roll(u, 'gold:2026-W47') < 350);
        assert.ok(goldLucky.length >= 10 && goldLucky.length <= 45, `zhruba 15 %: ${goldLucky.length} ze 160`);
        const gold = json(claim(goldLucky[0], 'gold', 'gold:2026-W47'));
        assert.deepEqual([gold.kind, gold.granted, gold.lucky], ['revive', true, true]);
        // Milník série Kvízu dne: 7 dní po sobě (dohraný kvíz) dá Vzkříšení jednou, dny předtím a po něm nic
        const play = (uid, day) => {
            today = day;
            json(as(uid, 'select daily_quiz_start();'));
            let res = null;
            for (let idx = 0; idx < 10; idx++) res = json(as(uid, `select daily_quiz_answer('${day}', ${idx}, ${idx % 2 === 0}, ${idx % 2 === 0 ? 3 : 0}, 3000);`));
            return res;
        };
        const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
        for (const day of days) assert.equal(play(C, day).revive_item, undefined, day);
        const seventh = play(C, '2026-11-16');
        assert.equal(seventh.streak, 7);
        assert.deepEqual([...pick(seventh.revive_item), seventh.revive_item.source, seventh.revive_item.at], ['revive', true, false, false, 1, 'daily-streak', 7]);
        assert.equal(play(C, '2026-11-17').revive_item, undefined, 'milník jen jednou');
        today = '2026-11-12';
    });

    let game;
    await t.test('použití: jen bez území a se zásobou; cíle neutrální a cizí neopevněné (ne opevněné, domov, bitva); zásoba o 1 méně, ne domovské, kronika', () => {
        clock = '2026-12-01T10:00:00Z';
        game = newGame(A, B, C);
        setStock(A, 'revive', 2);
        denied(revive(A, game.id, 'Q183'), /Vzkříšení jde použít, jen když ti nezbylo žádné území\./);
        let st = state(A, game.id);
        assert.deepEqual([st.items.revive, st.items.can_revive, st.items.revive_used], [2, false, 0]);
        // A přijde o Česko (B ho drží bez opevnění)
        place(game.id, 'Q213', B);
        setStock(A, 'revive', 0);
        st = state(A, game.id);
        assert.deepEqual([st.items.can_revive, st.items.revive_block], [false, 'Vzkříšení teď nemáš.']);
        denied(revive(A, game.id, 'Q183'), /Vzkříšení teď nemáš\./);
        setStock(A, 'revive', 2);
        assert.deepEqual([state(A, game.id).items.can_revive, state(A, game.id).items.revive_block], [true, null]);
        // Neplatné cíle
        place(game.id, 'Q40', C, { level: 1 });
        denied(revive(A, game.id, 'Q999'), /Tohle území na mapě není\./);
        denied(revive(A, game.id, 'Q36'), /Domovský hrad Vzkříšením vzít nejde\./);
        denied(revive(A, game.id, 'Q40'), /Opevněné území Vzkříšením vzít nejde\./);
        const s = json(begin(B, game.id, 'Q183'));
        denied(revive(A, game.id, 'Q183'), /Na území právě probíhá bitva\./);
        const targets = q(`set mudrlant.test_now = '${clock}'; select array_to_string(conquest_revive_targets(g, '${A}'), ',') from conquest_games g where g.id = '${game.id}'`).split(',');
        assert.ok(targets.includes('Q213') && targets.includes('Q28') && !targets.includes('Q36') && !targets.includes('Q40') && !targets.includes('Q183') && !targets.includes('Q214'), targets.join(','));
        assert.equal(denied(revive(A, game.id, 'Q214'), /Domovský hrad/) && true, true, 'domov C');
        assert.equal(items(A).revive, 2, 'nic se neubralo');
        ok(as(B, `select conquest_siege_answer('${s.id}', 0::smallint);`));
        // Vzkříšení na neopevněném Česku, které drží B: A ho má, ne jako domov, chráněné 60 s; B o něj přišel
        const before = state(A, game.id).budget;
        const res = json(revive(A, game.id, 'Q213'));
        assert.deepEqual([res.used, res.territory], ['revive', 'Q213']);
        assert.equal(new Date(res.shield_until).toISOString(), '2026-12-01T10:01:00.000Z');
        const row = res.territories.find(item => item.t === 'Q213');
        assert.deepEqual([row.o, row.h, row.l, new Date(row.s).toISOString()], [A, false, 0, '2026-12-01T10:01:00.000Z']);
        assert.deepEqual([res.items.revive, res.items.revive_used, res.items.can_revive], [1, 1, false]);
        assert.deepEqual([res.budget.left, res.budget.total], [before.left, before.total], 'Vzkříšení tah nestojí');
        const mv = res.moves[res.moves.length - 1];
        assert.deepEqual([mv.k, mv.r, mv.u, mv.v, mv.t, mv.h, mv.n], ['revive', 'respawn', A, B, 'Q213', false, 0]);
        assert.ok(state(B, game.id).moves.some(m => m.k === 'revive' && m.v === B), 'B to vidí v kronice');
        assert.equal(q(`select count(*) from conquest_players where game_id = '${game.id}' and user_id = '${A}' and score = 1`), '1');
        denied(revive(A, game.id, 'Q28'), /jen když ti nezbylo žádné území/, 'podruhé ne, území už má');
        // Pevnost jen na domově: vzkříšené území nejde nad Hradbu
        q(`update conquest_territories set level = 2 where game_id = '${game.id}' and territory = 'Q213'`);
        denied(move(A, game.id, 'Q213', 'fortify', true), /opevněné naplno/);
        q(`update conquest_territories set level = 0 where game_id = '${game.id}' and territory = 'Q213'`);
    });

    await t.test('ochrana 60 s: útok, bitva, boti ani jiné Vzkříšení ne, majitel opevní; s časem zase normálně', () => {
        clock = '2026-12-01T10:00:00Z';
        denied(move(B, game.id, 'Q213', 'attack', true), /Území je chráněné po vzkříšení ještě 60 s\./);
        clock = '2026-12-01T10:00:15Z';
        denied(move(B, game.id, 'Q213', 'attack', true, 'Q36'), /ještě 45 s\./);
        denied(begin(B, game.id, 'Q213'), /Území je chráněné po vzkříšení ještě 45 s\./);
        // C bez území se Vzkříšením: chráněné území nevezme
        place(game.id, 'Q214', null);
        place(game.id, 'Q40', null);
        setStock(C, 'revive', 1);
        denied(revive(C, game.id, 'Q213'), /Území je chráněné po vzkříšení ještě 45 s\./);
        // Majitel opevnit smí
        ok(move(A, game.id, 'Q213', 'fortify', true));
        clock = '2026-12-01T10:00:59Z';
        assert.ok(state(B, game.id).territories.find(item => item.t === 'Q213').s, 'ochrana ještě běží');
        clock = '2026-12-01T10:01:01Z';
        assert.equal(state(B, game.id).territories.find(item => item.t === 'Q213').s, undefined, 'po 60 s bez ochrany');
        const hit = json(move(B, game.id, 'Q213', 'attack', true, 'Q36'));
        assert.equal(hit.move.r, 'breach', 'normální útok (Palisáda pobořena)');
        // C se teď vrátí na neutrální Slovensko
        assert.deepEqual(owned(json(revive(C, game.id, 'Q214')), C), ['Q214']);
    });

    await t.test('poklad: Vzkříšení na neutrálním území s pokladem dá +1 tah v tomto kole', () => {
        clock = '2026-12-01T12:00:00Z';
        place(game.id, 'Q213', B);
        place(game.id, 'Q28', null, { treasure: true });
        const before = state(A, game.id).budget;
        const res = json(revive(A, game.id, 'Q28'));
        assert.equal(res.moves[res.moves.length - 1].p, true);
        assert.deepEqual([res.budget.treasures, res.budget.total], [before.treasures + 1, before.total + 1]);
        assert.equal(res.territories.find(item => item.t === 'Q28').p, false, 'poklad sebraný');
        assert.equal(res.items.revive_used, 2);
    });

    await t.test('mimo hru bez Vzkříšení: kolo dohrané a další kolo chce sám; bot bez území se nevrací a hru nerozbije; boti chráněné území vynechají', () => {
        clock = '2026-12-05T10:00:00Z';
        const fast = newGame(D, E, BOT, { players: 3, hours: 0, minutes: 20, per: 'min5', actions: 2 });
        // Bot nemá území: nehraje a sám se nevrátí
        assert.equal(q(`set mudrlant.test_now = '${clock}'; select conquest_bots_due('${fast.id}', true)`), '0');
        let st = state(D, fast.id);
        assert.deepEqual(owned(st, BOT), []);
        assert.ok(!st.moves.some(m => m.r === 'respawn'));
        // E přijde o všechno a Vzkříšení nemá: je mimo hru, kolo za něj platí jako dohrané a další kolo chce sám (jako bot)
        place(fast.id, 'Q36', null);
        items(E);
        setStock(E, 'revive', 0);
        st = state(E, fast.id);
        assert.deepEqual([st.items.revive_block, st.round.can_ready, st.round.done], ['Vzkříšení teď nemáš.', false, false]);
        ok(move(D, fast.id, 'Q214', 'attack', false));
        st = json(move(D, fast.id, 'Q40', 'attack', false));
        assert.deepEqual([st.round.done, st.round.can_ready, [...st.round.ready].sort()], [true, true, [E, BOT].sort()]);
        const go = json(as(D, `select conquest_round_ready('${fast.id}', true);`));
        assert.ok(go.next_at, 'odpočet: chce jen D, ostatní se počítají sami');
        // Další kolo: bot dostane území vedle chráněného Česka hráče D, které ochrana drží (D se tam vzkřísil)
        clock = '2026-12-05T10:00:11Z';
        place(fast.id, 'Q213', null);
        place(fast.id, 'Q40', BOT);
        setStock(D, 'revive', 1);
        json(revive(D, fast.id, 'Q213'));
        q(`update conquest_territories set owner = '${BOT}' where game_id = '${fast.id}' and territory not in ('Q213', 'Q40')`);
        q(`update conquest_territories set owner = null where game_id = '${fast.id}' and territory in ('Q183', 'Q36')`);
        sys(`select conquest_bots_due('${fast.id}', true)`);
        assert.equal(q(`select owner from conquest_territories where game_id = '${fast.id}' and territory = 'Q213'`), D, 'bot chráněné území nenapadl');
        assert.ok(Number(q(`select count(*) from conquest_moves where game_id = '${fast.id}' and user_id = '${BOT}' and kind = 'attack'`)) >= 1, 'bot hrál jinde');
    });

    await t.test('konec hry: hráči bez bodů podle toho, kdo vydržel déle; započítaná hra s body dá Vzkříšení jednou (revive_item); Fénix i po Vzkříšení', () => {
        clock = '2026-12-10T10:00:00Z';
        const g = newGame(A, B, C);
        setStock(A, 'revive', 1);
        q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result) select '${g.id}', u, 0, 'fortify', 'Q213', false, 'fail'
            from unnest(array['${A}', '${B}', '${C}']::uuid[]) u, generate_series(1, 3)`);
        // A se vzkřísí (Fénix), B a C skončí bez území: C o poslední přišel dřív než B
        place(g.id, 'Q213', null);
        json(revive(A, g.id, 'Q183'));
        place(g.id, 'Q36', null);
        place(g.id, 'Q214', null);
        q(`update conquest_players set score = 0, score_at = '2026-12-11T10:00:00Z' where game_id = '${g.id}' and user_id = '${B}'`);
        q(`update conquest_players set score = 0, score_at = '2026-12-10T12:00:00Z' where game_id = '${g.id}' and user_id = '${C}'`);
        clock = '2026-12-13T10:00:01Z';
        const won = json(as(A, `select conquest_claim('${g.id}');`));
        assert.deepEqual([won.place, won.eligible, won.claimed_now], [1, true, true]);
        assert.deepEqual(pick(won.revive_item), ['revive', true, false, false, 1]);
        assert.equal(json(as(A, `select conquest_claim('${g.id}');`)).revive_item, undefined, 'jen jednou');
        const [placeB, placeC] = [json(as(B, `select conquest_claim('${g.id}');`)), json(as(C, `select conquest_claim('${g.id}');`))];
        assert.deepEqual([placeB.place, placeC.place], [2, 3], 'B vydržel déle');
        assert.deepEqual([placeB.revive_item, placeC.revive_item], [undefined, undefined], 'bez bodů nic');
        assert.equal(q(`select (conquest_look_stats('${A}') ->> 'win_comeback')`), '1', 'Fénix: výhra po Vzkříšení');
    });

    await t.test('oprávnění: použití jen přihlášený hráč hry; anon nic; bot ne', () => {
        denied(as(null, `select conquest_use_revive('${game.id}', 'Q183');`, 'anon'), null);
        denied(as(null, `select conquest_use_revive('${game.id}', 'Q183');`), /Přihlas se/);
        denied(revive(D, game.id, 'Q183'), /nehraješ/);
        denied(as(A, `select conquest_revive_starter('${A}');`), /permission denied/);
        denied(as(A, `update conquest_territories set shield_until = null;`), /permission denied/);
    });
});
