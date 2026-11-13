// Dobývání v databázi (PostgreSQL 16, blok „21: Dobývání“): mapy a sousedství shodné s data/dobyvani-*.json, lobby s Rychlými hrami,
// založení a přidání (barva jen jednou, soukromá hra jen kódem, limity), Chci hrát a plná hra (domovy, poklady, body), pravidla řádků,
// tahy (sousedství, vlastní území, opevnění 0–3, pobourání, dobytí, tahy za období, region, poklad, kořist, Návrat do hry), konec hry
// (pořadí, shoda), odměna jen jednou, odchod z lobby a vypršení. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_conquest_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const ROOT = path.join(__dirname, '..');
const schema = path.join(ROOT, 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Hodiny hry (conquest_now) jdou nastavit přes mudrlant.test_now
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
const lit = (text) => (text === null ? 'null' : `'${String(text).replace(/'/g, "''")}'`);

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

const [A, B, C, D, E, F, G] = [1, 2, 3, 4, 5, 6, 7].map(id);
const create = (uid, { map = 'evropa', players = 4, hours = 72, per = 'day', actions = 5, vis = 'public', colour = 'cervena', emblem = 'lev' } = {}) =>
    as(uid, `select conquest_create(${lit(map)}, ${players}, ${hours}, ${lit(per)}, ${actions}, ${lit(vis)}, ${lit(colour)}, ${lit(emblem)});`);
const join = (uid, { game = null, code = null, colour = 'modra', emblem = 'orel' }) => as(uid, `select conquest_join(${game ? lit(game) : 'null'}, ${lit(code)}, ${lit(colour)}, ${lit(emblem)});`);
const ready = (uid, game, on = true) => as(uid, `select conquest_ready(${lit(game)}, ${on});`);
const state = (uid, game) => as(uid, `select conquest_state(${lit(game)});`);
const move = (uid, game, target, kind, correct, source = null) => as(uid, `select conquest_move(${lit(game)}, ${lit(target)}, ${lit(kind)}, ${correct}, ${lit(source)});`);
const lobby = (uid) => json(as(uid, 'select conquest_lobby();'));
// Rozložení mapy pro scénář: majitelé, úrovně, domovy a poklady nastavené přímo (správce databáze)
const place = (game, territory, owner, { level = 0, home = false, treasure = false } = {}) =>
    q(`update conquest_territories set owner = ${owner ? lit(owner) : 'null'}, level = ${level}, home = ${home}, treasure = ${treasure} where game_id = ${lit(game)} and territory = ${lit(territory)}`);
const clearMap = (game) => q(`update conquest_territories set owner = null, level = 0, home = false, treasure = false where game_id = ${lit(game)}`);
const owner = (game, territory) => q(`select coalesce(owner::text, '-') from conquest_territories where game_id = ${lit(game)} and territory = ${lit(territory)}`);
const level = (game, territory) => Number(q(`select level from conquest_territories where game_id = ${lit(game)} and territory = ${lit(territory)}`));

test('SQL: Dobývání', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 12 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    await t.test('mapy, regiony a sousedství jako v data/dobyvani-*.json; pravidla řádků na všech tabulkách', () => {
        for (const map of ['evropa', 'afrika', 'asie', 'amerika', 'cesko']) {
            const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `dobyvani-${map}.json`), 'utf8'));
            assert.equal(Number(q(`select territories from conquest_maps where id = '${map}'`)), data.t.length, map);
            assert.equal(Number(q(`select treasures from conquest_maps where id = '${map}'`)), data.treasures, map);
            assert.equal(Number(q(`select count(*) from conquest_regions where map = '${map}'`)), data.t.length);
            assert.equal(Number(q(`select count(*) from conquest_links where map = '${map}'`)), data.t.reduce((sum, item) => sum + item.nb.length, 0));
            assert.equal(q(`select count(*) from conquest_links l where map = '${map}' and not exists (select 1 from conquest_links r where r.map = l.map and r.a = l.b and r.b = l.a)`), '0', 'sousedství oběma směry');
        }
        for (const table of ['conquest_maps', 'conquest_regions', 'conquest_links', 'conquest_games', 'conquest_players', 'conquest_territories', 'conquest_moves']) {
            assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`), 't', table);
        }
    });

    await t.test('anon nic; přímý zápis a pomocné funkce nejdou', () => {
        for (const sql of ['select conquest_lobby();', `select conquest_create('evropa', 4, 72, 'day', 5, 'public', 'cervena', 'lev');`, 'select * from conquest_games;', 'select * from conquest_maps;']) {
            denied(as(null, sql, 'anon'), null, `anon: ${sql}`);
        }
        for (const sql of [`insert into conquest_games (map, max_players, duration_hours, period, actions, visibility, code) values ('evropa', 2, 6, 'day', 1, 'public', 'ABCDEF');`,
            `select conquest_start('${id(999)}');`, `select conquest_rescore('${id(999)}', '${A}');`, `select conquest_budget('${id(999)}', '${A}');`, 'select conquest_ensure_lobbies();']) {
            denied(as(A, sql), null, sql);
        }
    });

    await t.test('lobby: Rychlé hry pro každou předvolbu, jen jednou', () => {
        const first = lobby(A);
        assert.deepEqual(first.open.map(g => g.preset).sort(), ['afrika-7d', 'cesko-12h', 'evropa-3d']);
        assert.deepEqual(first.mine, []);
        lobby(B);
        assert.equal(q(`select count(*) from conquest_games where preset is not null`), '3');
        const cesko = first.open.find(g => g.preset === 'cesko-12h');
        assert.deepEqual([cesko.map, cesko.max_players, cesko.hours, cesko.period, cesko.actions], ['cesko', 4, 12, 'hour', 3]);
    });

    let game;
    await t.test('založení: kontrola nastavení, barvy a znaku', () => {
        denied(create(A, { map: 'mars' }), /mapa neexistuje/);
        denied(create(A, { map: 'cesko', players: 8 }), /2 až 6 hráčů/);
        denied(create(A, { hours: 30 }), /délku hry/);
        denied(create(A, { per: 'week' }), /za den, nebo za hodinu/);
        denied(create(A, { actions: 11 }), /1 až 10/);
        denied(create(A, { vis: 'secret' }), /veřejná, nebo soukromá/);
        denied(create(A, { colour: 'duhova' }), /barvu z nabídky/);
        denied(create(A, { emblem: 'pes' }), /znak z nabídky/);
        game = json(create(A, { players: 3 }));
        assert.equal(game.status, 'lobby');
        assert.equal(game.creator, true);
        assert.match(game.code, /^[A-Z2-9]{6}$/);
        assert.deepEqual(game.players.map(p => [p.seat, p.flag_color, p.emblem, p.ready, p.me]), [[0, 'cervena', 'lev', false, true]]);
        assert.equal(game.players[0].display_name, 'Hráč 1');
    });

    await t.test('přidání: barva jen jednou, soukromá hra jen kódem, cizí hra je v lobby', () => {
        denied(join(B, { game: game.id, colour: 'cervena' }), /barvu už má jiný hráč/);
        const joined = json(join(B, { game: game.id, colour: 'modra', emblem: 'orel' }));
        assert.equal(joined.players.length, 2);
        assert.equal(joined.players[1].seat, 1);
        // Znovu = beze změny
        assert.equal(json(join(B, { game: game.id })).players.length, 2);
        // Soukromá hra: podle id ne, kódem ano; cizí kód soukromé hry v souhrnu není
        const secret = json(create(C, { vis: 'private', colour: 'zelena', emblem: 'sova' }));
        denied(join(D, { game: secret.id }), /kódem není/);
        assert.ok(!lobby(D).open.some(g => g.id === secret.id), 'soukromá hra v lobby není');
        const byCode = json(join(D, { code: secret.code.toLowerCase(), colour: 'fialova', emblem: 'drak' }));
        assert.equal(byCode.id, secret.id);
        denied(join(D, { code: 'ZZZZZZ' }), /kódem není/);
        // Stav otevřené veřejné hry vidí každý přihlášený (bez území), soukromou ne
        assert.equal(json(state(E, game.id)).status, 'lobby');
        denied(state(E, secret.id), /nehraješ/);
        // RLS: tabulky vrací jen to, co smí hráč vidět
        assert.equal(last(ok(as(E, `select count(*) from conquest_games where id = '${secret.id}';`))), '0');
        assert.equal(last(ok(as(E, `select count(*) from conquest_players where game_id = '${game.id}';`))), '2');
    });

    await t.test('jiná barva a znak před začátkem; limity vlastních a všech her', () => {
        denied(as(B, `select conquest_set_look('${game.id}', 'cervena', 'orel');`), /barvu už má/);
        assert.equal(json(as(B, `select conquest_set_look('${game.id}', 'azurova', 'kotva');`)).players[1].emblem, 'kotva');
        // C už má jednu vlastní (soukromou), druhou smí, třetí ne
        const second = json(create(C, { colour: 'zluta', emblem: 'vez' }));
        denied(create(C, { colour: 'zluta', emblem: 'vez' }), /nejvýš 2 vlastní/);
        ok(as(C, `select conquest_leave('${second.id}');`));
        assert.equal(q(`select count(*) from conquest_games where id = '${second.id}'`), '0', 'prázdná vlastní hra zmizí');
        // Vlastní otevřené hry nejvýš 2; ve hrách (otevřených i rozehraných) nejvýš 6 najednou
        const g1 = json(create(G, { colour: 'cerna', emblem: 'vlk' }));
        const g2 = json(create(G, { colour: 'cerna', emblem: 'vlk' }));
        denied(create(G, { colour: 'cerna', emblem: 'vlk' }), /nejvýš 2 vlastní/);
        const presets = lobby(F).open.filter(g => g.preset);
        for (const g of [...presets, g1, g2]) ok(join(F, { game: g.id, colour: 'hneda', emblem: 'vlk' }));
        const own = json(create(F, { colour: 'hneda', emblem: 'vlk' }));
        denied(join(F, { game: game.id, colour: 'hneda' }), /nejvýš 6 her/);
        for (const g of [...presets, g1, g2, own]) ok(as(F, `select conquest_leave('${g.id}');`));
        assert.equal(q(`select count(*) from conquest_games where id = '${own.id}'`), '0');
        assert.equal(q(`select count(*) from conquest_games where preset is not null`), '3', 'Rychlé hry zůstanou i prázdné');
    });

    let running;
    await t.test('Chci hrát: dva hráči nestačí, dokud nechtějí oba; pak domovy, poklady a body', () => {
        assert.equal(json(ready(A, game.id)).status, 'lobby');
        const started = json(ready(B, game.id));
        assert.equal(started.status, 'running');
        assert.equal(started.started_at.slice(0, 16), '2026-11-12T10:00');
        assert.ok(started.ends_at.startsWith('2026-11-15T10:00'), started.ends_at);
        running = json(state(A, game.id));
        const homes = running.territories.filter(item => item.h);
        assert.equal(homes.length, 2);
        assert.deepEqual(homes.map(item => item.o).sort(), [A, B].sort());
        assert.equal(running.territories.filter(item => item.p).length, 5, 'pět pokladů');
        assert.ok(running.territories.filter(item => item.p).every(item => !item.o), 'poklady na neutrálních územích');
        assert.deepEqual(running.players.map(p => p.score), [1, 1]);
        assert.deepEqual(running.budget && [running.budget.left, running.budget.total, running.budget.period], [5, 5, 0]);
        assert.equal(running.moves.length, 2);
        assert.ok(running.moves.every(m => m.r === 'home'));
        // Domovy co nejdál od sebe: aspoň 3 kroky
        const [h1, h2] = homes.map(item => item.t);
        const near = q(`select count(*) from conquest_links where map = 'evropa' and a = '${h1}' and b = '${h2}'`);
        assert.equal(near, '0');
        // Hráč, který hru nehraje, data rozehrané hry nevidí
        denied(state(E, game.id), /nehraješ/);
        assert.equal(last(ok(as(E, `select count(*) from conquest_territories where game_id = '${game.id}';`))), '0');
        denied(join(E, { game: game.id, colour: 'hneda' }), /už začala/);
        denied(as(A, `select conquest_leave('${game.id}');`), /opustit nejde/);
        denied(as(A, `select conquest_set_look('${game.id}', 'zelena', 'lev');`), /před začátkem/);
    });

    await t.test('útok: jen na sousední cizí území, opevnění jen vlastního; správně = dobytí, špatně nic', () => {
        clearMap(game.id);
        place(game.id, 'Q213', A, { home: true });   // Česko
        place(game.id, 'Q36', B, { home: true });    // Polsko
        denied(move(A, game.id, 'Q213', 'attack', true), /vlastní území/);
        denied(move(A, game.id, 'Q142', 'attack', true), /sousedí s tvým/);   // Francie
        denied(move(A, game.id, 'Q183', 'attack', true, 'Q36'), /z tvého sousedního/);
        denied(move(A, game.id, 'Q183', 'fortify', true), /jen vlastní území/);
        denied(move(A, game.id, 'Q999', 'attack', true), /na mapě není/);
        const miss = json(move(A, game.id, 'Q183', 'attack', false, 'Q213'));
        assert.equal(miss.move.r, 'fail');
        assert.equal(owner(game.id, 'Q183'), '-');
        const hit = json(move(A, game.id, 'Q183', 'attack', true, 'Q213'));
        assert.deepEqual([hit.move.r, hit.move.s, hit.move.k], ['capture', 'Q213', 'attack']);
        assert.equal(owner(game.id, 'Q183'), A);
        assert.equal(hit.budget.left, 3);
        assert.equal(hit.players.find(p => p.me).score, 2);
    });

    await t.test('opevnění: palisáda, hradba, pevnost jen na domovském území; útok ubere úroveň, pak dobude', () => {
        json(move(A, game.id, 'Q183', 'fortify', true));
        json(move(A, game.id, 'Q183', 'fortify', true));
        assert.equal(level(game.id, 'Q183'), 2);
        denied(move(A, game.id, 'Q183', 'fortify', true), /naplno|nemáš/);
        q(`delete from conquest_moves where game_id = '${game.id}' and user_id = '${A}' and period = 0 and kind <> 'home'`);
        place(game.id, 'Q213', A, { home: true, level: 2 });
        assert.equal(json(move(A, game.id, 'Q213', 'fortify', true)).move.l, 3);
        denied(move(A, game.id, 'Q213', 'fortify', true), /naplno/);
        // B útočí na Německo (úroveň 2) z Polska
        place(game.id, 'Q183', A, { level: 2 });
        const first = json(move(B, game.id, 'Q183', 'attack', true, 'Q36'));
        assert.deepEqual([first.move.r, first.move.l, first.move.v], ['breach', 1, A]);
        json(move(B, game.id, 'Q183', 'attack', true, 'Q36'));
        assert.equal(level(game.id, 'Q183'), 0);
        assert.equal(owner(game.id, 'Q183'), A);
        const third = json(move(B, game.id, 'Q183', 'attack', true));
        assert.equal(third.move.r, 'capture');
        assert.equal(owner(game.id, 'Q183'), B);
    });

    await t.test('tahy za období: po vyčerpání nic, v dalším období znovu; poklad +1 hned, celý region +1', () => {
        q(`delete from conquest_moves where game_id = '${game.id}' and kind <> 'home'`);
        clearMap(game.id);
        place(game.id, 'Q213', A, { home: true });
        place(game.id, 'Q36', B, { home: true });
        for (const target of ['Q214', 'Q40', 'Q28']) json(move(A, game.id, target, 'attack', true));   // Slovensko, Rakousko, Maďarsko
        place(game.id, 'Q215', null, { treasure: true });   // Slovinsko s pokladem
        const treasure = json(move(A, game.id, 'Q215', 'attack', true));
        assert.equal(treasure.move.p, true);
        assert.equal(treasure.budget.treasures, 1);
        assert.equal(treasure.budget.left, 2, '5 + 1 za poklad − 4');
        json(move(A, game.id, 'Q183', 'attack', true));   // Německo
        json(move(A, game.id, 'Q213', 'fortify', false));
        assert.equal(json(state(A, game.id)).budget.left, 0);
        denied(move(A, game.id, 'Q183', 'fortify', true), /Tahy na tohle období už nemáš/);
        // Celá Střední Evropa (Německo, Polsko, Česko, Slovensko, Rakousko, Maďarsko, Slovinsko): +1 tah a +2 body
        place(game.id, 'Q36', A, {});
        q(`update conquest_players set lost_period = 0 where game_id = '${game.id}' and user_id = '${B}'`);
        q(`select conquest_rescore('${game.id}', '${A}')`);
        const now = json(state(A, game.id));
        assert.equal(now.budget.regions, 1);
        assert.equal(now.budget.left, 1);
        assert.equal(now.players.find(p => p.me).score, 7 + 2);
        clock = '2026-11-13T10:00:00Z';
        const next = json(state(A, game.id));
        assert.equal(next.budget.period, 1);
        assert.equal(next.budget.left, 6, '5 + region');
    });

    await t.test('Návrat do hry: kdo přišel o všechna území, dostane v dalším období nové; dobytý domov = kořist', () => {
        // B neměl od včerejška nic: při čtení stavu dostane nové domovské území
        const after = json(state(B, game.id));
        const mine = after.territories.filter(item => item.o === B);
        assert.equal(mine.length, 1);
        assert.equal(mine[0].h, true);
        assert.ok(after.moves.some(m => m.r === 'respawn' && m.u === B));
        // A dobude domov hráče B (Slovinsko z Rakouska): B přijde o vše, A dostane v dalším období kořist
        clearMap(game.id);
        place(game.id, 'Q215', B, { home: true });
        place(game.id, 'Q40', A, { home: true });
        const taken = json(move(A, game.id, 'Q215', 'attack', true));
        assert.equal(taken.move.h, true, 'dobyté domovské území');
        assert.equal(q(`select lost_period from conquest_players where game_id = '${game.id}' and user_id = '${B}'`), '1');
        clock = '2026-11-14T10:30:00Z';
        const loot = json(state(A, game.id));
        assert.equal(loot.budget.loot, 1);
        assert.equal(loot.budget.left, 6);
        assert.equal(json(state(B, game.id)).territories.filter(item => item.o === B).length, 1, 'B je zpátky');
    });

    await t.test('konec hry: pořadí podle bodů, při shodě dřív dosažené body; odměna jen jednou a jen u poctivé hry', () => {
        denied(as(A, `select conquest_claim('${game.id}');`), /neskončila/);
        // Shoda 2 : 2 – B dosáhl dvou bodů dřív
        clearMap(game.id);
        place(game.id, 'Q213', A, {}); place(game.id, 'Q214', A, {});
        place(game.id, 'Q142', B, {}); place(game.id, 'Q31', B, {});
        q(`update conquest_players set score = 2, score_at = '2026-11-14T09:00:00Z' where game_id = '${game.id}' and user_id = '${A}'`);
        q(`update conquest_players set score = 2, score_at = '2026-11-13T09:00:00Z' where game_id = '${game.id}' and user_id = '${B}'`);
        q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result) select '${game.id}', '${B}', 2, 'fortify', 'Q142', false, 'fail' from generate_series(1, 3)`);
        clock = '2026-11-15T10:00:01Z';
        denied(move(A, game.id, 'Q183', 'attack', true), /skončila/);
        const final = json(state(A, game.id));
        assert.equal(final.status, 'finished');
        assert.deepEqual(final.players.map(p => [p.me, p.place]), [[true, 2], [false, 1]]);
        assert.ok(Array.isArray(final.history) && final.history.length >= 2);
        const claim = json(as(B, `select conquest_claim('${game.id}');`));
        assert.deepEqual([claim.place, claim.players, claim.eligible, claim.claimed_now], [1, 2, true, true]);
        assert.equal(json(as(B, `select conquest_claim('${game.id}');`)).claimed_now, false, 'podruhé ne');
        // Rozehraná hra se do lobby mezi moje hry počítá jako dohraná
        assert.equal(lobby(A).mine.find(g => g.id === game.id).status, 'finished');
    });

    await t.test('krátká hra dvou hráčů odměnu nedává; plná hra začne sama; Rychlá hra se po začátku hned doplní', () => {
        clock = '2026-11-16T08:00:00Z';
        const quick = lobby(H()).open.find(g => g.preset === 'cesko-12h');
        const players = [H(), id(9), id(10), id(11)];
        const colours = ['cervena', 'modra', 'zelena', 'zluta'];
        players.forEach((uid, i) => ok(join(uid, { game: quick.id, colour: colours[i], emblem: 'sova' })));
        const started = json(state(H(), quick.id));
        assert.equal(started.status, 'running', 'plná hra začala bez Chci hrát');
        assert.equal(started.territories.filter(item => item.p).length, 1, 'Česko: jeden poklad');
        assert.equal(started.budget.left, 3);
        const fresh = lobby(H()).open.find(g => g.preset === 'cesko-12h');
        assert.ok(fresh && fresh.id !== quick.id, 'nová Rychlá hra');
        // Hodinová hra: po hodině nové období
        clock = '2026-11-16T09:00:00Z';
        assert.equal(json(state(H(), quick.id)).budget.period, 1);
        // Krátká hra dvou hráčů
        const short = json(create(id(12), { map: 'cesko', players: 2, hours: 6, per: 'hour', colour: 'cervena' }));
        ok(join(H(), { game: short.id, colour: 'modra' }));
        q(`update conquest_players set score = 3 where game_id = '${short.id}'`);
        clock = '2026-11-16T15:00:01Z';
        const claim = json(as(id(12), `select conquest_claim('${short.id}');`));
        assert.equal(claim.eligible, false);
    });

    await t.test('vypršení: lobby, které nezačalo do 7 dní, zmizí (Rychlá hra se založí znovu)', () => {
        const before = q(`select count(*) from conquest_games where status = 'lobby'`);
        assert.ok(Number(before) > 3);
        clock = '2026-11-30T10:00:00Z';
        const after = lobby(A);
        assert.deepEqual(after.open.map(g => g.preset).sort(), ['afrika-7d', 'cesko-12h', 'evropa-3d']);
        assert.ok(after.open.every(g => g.players.length === 0));
    });

    await t.test('vývojářští boti: jen dev_admins a jen ve vlastní hře; do plna, hrají sami podle času, na pokyn hned, další období, smazání', () => {
        clock = '2026-12-01T08:00:00Z';
        const DEV = id(20);
        const OTHER = id(21);
        q(`insert into auth.users (id, email, raw_user_meta_data) values ('${DEV}', 'dev@example.com', '{"full_name": "Vývojář"}'), ('${OTHER}', 'jiny@example.com', '{"full_name": "Jiný"}')`);
        const game = json(create(DEV, { map: 'evropa', players: 4, hours: 120, per: 'day', actions: 5, vis: 'private' }));
        denied(as(DEV, `select dev_conquest_add_bots('${game.id}', 1);`), /dev_admins/, 'bez dev_admins ne');
        q(`insert into dev_admins (user_id) values ('${DEV}')`);
        const other = json(create(OTHER, { map: 'cesko', players: 3, hours: 12, per: 'hour', actions: 3 }));
        denied(as(DEV, `select dev_conquest_add_bots('${other.id}', 1);`), /sám hraješ/, 'cizí hra ne');
        denied(as(DEV, `select conquest_bots_due('${game.id}', true);`), /permission denied/, 'pomocná funkce zvenčí ne');
        // Jeden bot: volná barva, chce hrát; hra čeká, dokud nechci hrát i já
        let summary = json(as(DEV, `select dev_conquest_add_bots('${game.id}', 1);`));
        assert.equal(summary.status, 'lobby');
        const bot = summary.players.find(player => !player.me);
        assert.equal(bot.ready, true);
        assert.match(bot.display_name, /Bot/);
        assert.notEqual(bot.flag_color, 'cervena', 'barvu hráče bot nevezme');
        // Do plna (víc, než se vejde, se nepřidá): plná hra začne sama
        summary = json(as(DEV, `select dev_conquest_add_bots('${game.id}', 7);`));
        assert.equal(summary.status, 'running');
        assert.equal(summary.players.length, 4);
        assert.equal(new Set(summary.players.map(player => player.flag_color)).size, 4);
        denied(as(DEV, `select dev_conquest_add_bots('${game.id}', 1);`), /nezačala/);
        const botMoves = (st, period = null) => st.moves.filter(m => m.u !== DEV && (m.k === 'attack' || m.k === 'fortify') && (period === null || m.n === period)).length;
        // Botům, kteří mají území, nezbyl v období žádný tah (čas hry přes mudrlant.test_now)
        const idle = () => q(`set mudrlant.test_now = '${clock}'; select count(*) from conquest_players p where p.game_id = '${game.id}' and p.user_id <> '${DEV}'
            and exists (select 1 from conquest_territories t where t.game_id = p.game_id and t.owner = p.user_id) and (conquest_budget(p.game_id, p.user_id) ->> 'left')::integer > 0`);
        // Na začátku období boti ještě nehrají, ve 3/4 období mají odehráno všechno; moje tahy zůstanou
        assert.equal(botMoves(json(state(DEV, game.id))), 0, 'hned po začátku nic');
        clock = '2026-12-02T02:00:00Z';
        let st = json(state(DEV, game.id));
        assert.ok(botMoves(st, 0) >= 3 * 5 - 3, `boti hráli sami (${botMoves(st, 0)})`);
        assert.equal(idle(), '0', 'boti s územím vyčerpali tahy období');
        assert.equal(st.budget.left, 5, 'moje tahy zůstaly');
        assert.ok(st.moves.filter(m => m.u !== DEV && m.k === 'attack').every(m => m.s), 'útok bota vede z jeho území');
        // Další období: hra je o den dál a o den kratší
        const endsBefore = Date.parse(st.ends_at);
        st = json(as(DEV, `select dev_conquest_next_period('${game.id}');`));
        assert.equal(st.budget.period, 1);
        assert.equal(endsBefore - Date.parse(st.ends_at), 24 * 3600 * 1000);
        assert.equal(st.budget.left, 5, 'v novém období mám znovu všechny tahy');
        assert.ok(botMoves(st, 1) > 0, 'boti hráli i v novém období');
        // Na pokyn hned: na začátku dalšího období boti sami ještě nehrají, tlačítko vývojáře je pošle odehrát všechno
        clock = '2026-12-02T08:01:00Z';
        const made = Number(last(ok(as(DEV, `select dev_conquest_bots_play('${game.id}');`))));
        assert.ok(made > 0, `boti odehráli ${made} tahů`);
        assert.equal(idle(), '0');
        assert.equal(Number(last(ok(as(DEV, `select dev_conquest_bots_play('${game.id}');`)))), 0, 'podruhé už nic');
        // Sami i bez otevřené hry (tournament_tick při otevření aplikace)
        clock = '2026-12-03T20:00:00Z';
        ok(as(DEV, 'select tournament_tick();'));
        assert.ok(Number(q(`select count(*) from conquest_moves where game_id = '${game.id}' and period = 3 and user_id <> '${DEV}' and kind in ('attack', 'fortify')`)) > 0, 'tick');
        // Smazání botů: rozehraná hra s boty zmizí celá
        ok(as(DEV, 'select dev_tournament_clear_bots();'));
        assert.equal(q(`select count(*) from conquest_games where id = '${game.id}'`), '0');
        assert.equal(q(`select count(*) from auth.users where email like 'bot-%'`), '0');
    });
});
// Osmý hráč scénáře (Rychlá hra Česko)
function H() { return id(8); }
