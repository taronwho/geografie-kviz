// Dobývání v databázi (PostgreSQL 16, blok „21: Dobývání“): mapy a sousedství shodné s data/dobyvani-*.json, lobby s Rychlými hrami,
// založení a přidání (barva jen jednou, soukromá hra jen kódem, limity), Chci hrát a plná hra (domovy, poklady, body), pravidla řádků,
// tahy (sousedství, vlastní území, opevnění 0–3, pobourání, dobytí, tahy za období, region, poklad, kořist, ztracený hrad, Návrat do hry), konec hry
// (pořadí, shoda), odměna jen jednou, odchod z lobby a vypršení; rychlé hry a Chci další kolo (blok 26: délka v minutách, aspoň 3 kola, předčasné
// kolo s odpočtem, tahy a bonusy ve správném kole, boti, poslední kolo, oprávnění). Spouští se jen s psql a serverem (viz tests/sql-rating.test.js),
// jinak se přeskočí.
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
        assert.deepEqual(first.open.map(g => g.preset).sort(), ['afrika-7d', 'blesk-20m', 'cesko-12h', 'evropa-3d']);
        assert.deepEqual(first.mine, []);
        lobby(B);
        assert.equal(q(`select count(*) from conquest_games where preset is not null`), '4');
        const cesko = first.open.find(g => g.preset === 'cesko-12h');
        assert.deepEqual([cesko.map, cesko.max_players, cesko.hours, cesko.minutes, cesko.period, cesko.actions], ['cesko', 4, 12, 720, 'hour', 3]);
        // Rychlá hra Blesk (blok 26): délka jen v minutách
        const blesk = first.open.find(g => g.preset === 'blesk-20m');
        assert.deepEqual([blesk.map, blesk.max_players, blesk.hours, blesk.minutes, blesk.period, blesk.actions], ['evropa', 4, null, 20, 'min5', 5]);
    });

    let game;
    await t.test('založení: kontrola nastavení, barvy a znaku', () => {
        denied(create(A, { map: 'mars' }), /mapa neexistuje/);
        denied(create(A, { map: 'cesko', players: 8 }), /2 až 6 hráčů/);
        denied(create(A, { hours: 30 }), /délku hry/);
        denied(create(A, { per: 'week' }), /Kolo trvá den, hodinu, 10 minut, nebo 5 minut\./);
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
        assert.equal(json(as(B, `select conquest_set_look('${game.id}', 'tyrkysova', 'kotva');`)).players[1].emblem, 'kotva');
        // C už má jednu vlastní (soukromou), druhou smí, třetí ne
        const second = json(create(C, { colour: 'zluta', emblem: 'vez' }));
        denied(create(C, { colour: 'zluta', emblem: 'vez' }), /nejvýš 2 vlastní/);
        ok(as(C, `select conquest_leave('${second.id}');`));
        assert.equal(q(`select count(*) from conquest_games where id = '${second.id}'`), '0', 'prázdná vlastní hra zmizí');
        // Vlastní otevřené hry nejvýš 2; ve hrách (otevřených i rozehraných) nejvýš 6 najednou
        const g1 = json(create(G, { colour: 'cerna', emblem: 'vlk' }));
        const g2 = json(create(G, { colour: 'cerna', emblem: 'vlk' }));
        denied(create(G, { colour: 'cerna', emblem: 'vlk' }), /nejvýš 2 vlastní/);
        const presets = lobby(F).open.filter(g => g.preset).slice(0, 3);
        for (const g of [...presets, g1, g2]) ok(join(F, { game: g.id, colour: 'ruzova', emblem: 'vlk' }));
        const own = json(create(F, { colour: 'ruzova', emblem: 'vlk' }));
        denied(join(F, { game: game.id, colour: 'ruzova' }), /nejvýš 6 her/);
        for (const g of [...presets, g1, g2, own]) ok(as(F, `select conquest_leave('${g.id}');`));
        assert.equal(q(`select count(*) from conquest_games where id = '${own.id}'`), '0');
        assert.equal(q(`select count(*) from conquest_games where preset is not null`), '4', 'Rychlé hry zůstanou i prázdné');
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
        assert.deepEqual(after.open.map(g => g.preset).sort(), ['afrika-7d', 'blesk-20m', 'cesko-12h', 'evropa-3d']);
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

    await t.test('ztracený hrad (blok 23): komu soupeř dobude domovské území, má v dalším období o 1 tah méně; pobourání ani odražený útok nevadí; nikdy méně než 0', () => {
        clock = '2026-12-05T08:00:00Z';
        const [X, Y] = [id(30), id(31)];
        q(`insert into auth.users (id, email, raw_user_meta_data) values ('${X}', 'x@example.com', '{"full_name": "Hráč X"}'), ('${Y}', 'y@example.com', '{"full_name": "Hráč Y"}')`);
        const game = json(create(X, { map: 'evropa', players: 2, hours: 12, per: 'hour', actions: 2, vis: 'private' }));
        ok(join(Y, { code: game.code, colour: 'modra' }));
        assert.equal(json(state(X, game.id)).status, 'running', 'plná hra začala');
        const budget = (uid) => json(state(uid, game.id)).budget;
        clearMap(game.id);
        place(game.id, 'Q213', X, { home: true });   // Česko: domov X
        place(game.id, 'Q40', X, {});                // Rakousko
        place(game.id, 'Q36', Y, { home: true });    // Polsko: domov Y
        assert.deepEqual([budget(X).penalty, budget(X).total], [0, 2], 'na začátku bez postihu');
        // Období 0: Y dobude domov X; postih platí až od dalšího období (v tomtéž období ne)
        const taken = json(move(Y, game.id, 'Q213', 'attack', true, 'Q36'));
        assert.deepEqual([taken.move.r, taken.move.h, taken.move.v], ['capture', true, X]);
        assert.deepEqual([budget(X).period, budget(X).penalty, budget(X).total, budget(X).left], [0, 0, 2, 2]);
        // Období 1: X má o tah méně (2 − 1), Y kořist (2 + 1)
        clock = '2026-12-05T09:05:00Z';
        const lost = budget(X);
        assert.deepEqual([lost.period, lost.base, lost.penalty, lost.total, lost.left], [1, 2, 1, 1, 1]);
        assert.deepEqual([budget(Y).penalty, budget(Y).loot, budget(Y).total], [0, 1, 3]);
        assert.equal(lobby(X).mine.find(g => g.id === game.id).budget.penalty, 1, 'i v Mých hrách');
        // Nikdy méně než 0: s jediným tahem za období po ztrátě hradu žádný tah
        q(`update conquest_games set actions = 1 where id = '${game.id}'`);
        assert.deepEqual([budget(X).total, budget(X).left], [0, 0]);
        denied(move(X, game.id, 'Q40', 'fortify', true), /Tahy na tohle období už nemáš/);
        q(`update conquest_games set actions = 2 where id = '${game.id}'`);
        // Období 1: nový domov X (Rakousko s palisádou); Y ho jen pobourá a pak neuspěje – v období 2 je X bez postihu
        place(game.id, 'Q40', X, { home: true, level: 1 });
        place(game.id, 'Q213', Y, {});
        assert.equal(json(move(Y, game.id, 'Q40', 'attack', true, 'Q213')).move.r, 'breach');
        assert.equal(json(move(Y, game.id, 'Q40', 'attack', false, 'Q213')).move.r, 'fail');
        clock = '2026-12-05T10:05:00Z';
        assert.deepEqual([budget(X).period, budget(X).penalty, budget(X).total], [2, 0, 2]);
        // Postih platí, i když útočník mezitím smazal účet (tah bez hráče)
        q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result, victim, home) values ('${game.id}', null, 2, 'attack', 'Q40', true, 'capture', '${X}', true)`);
        clock = '2026-12-05T11:05:00Z';
        assert.deepEqual([budget(X).period, budget(X).penalty, budget(X).total], [3, 1, 1]);
    });

    // Pozvánky (blok 24)
    const [HOST, P1, P2, P3, P4, STRANGER, OWNER] = [40, 41, 42, 43, 44, 45, 46].map(id);
    const invite = (uid, game, ids) => as(uid, `select conquest_invite(${lit(game)}, array[${ids.map(lit).join(', ')}]::uuid[]);`);
    const invitesOf = (uid) => json(as(uid, 'select conquest_invites_mine();'));
    const decline = (uid, game) => as(uid, `select conquest_decline_invite(${lit(game)});`);
    const befriend = (a, b) => q(`insert into friendships (user_id, friend_id) values ('${a}', '${b}'); update friendships set status = 'accepted' where user_id = '${a}' and friend_id = '${b}';`);
    let party;
    await t.test('pozvánky (blok 24): jen přijatí přátelé, jen hráč hry před začátkem, nejvýš tolik, kolik je volných míst; souhrn s pozvanými jen hráčům', () => {
        clock = '2026-12-06T08:00:00Z';
        q(`insert into auth.users (id, email, raw_user_meta_data) select u, 'p' || n || '@example.com', jsonb_build_object('full_name', name)
            from unnest(array['${HOST}', '${P1}', '${P2}', '${P3}', '${P4}', '${STRANGER}', '${OWNER}']::uuid[], array['Velitel', 'Ada', 'Bára', 'Cyril', 'Dita', 'Cizinec', 'Majitel'])
            with ordinality as x (u, name, n)`);
        [P1, P2, P3, P4].forEach(friend => befriend(HOST, friend));
        q(`insert into friendships (user_id, friend_id) values ('${HOST}', '${STRANGER}')`);   // jen žádost, přítel to není
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.conquest_invites'::regclass`), 't');
        denied(as(HOST, 'select * from conquest_invites;'), /permission denied/, 'tabulka jen přes funkce');
        denied(as(HOST, `insert into conquest_invites (game_id, user_id, invited_by) values ('${id(999)}', '${P1}', '${HOST}');`), /permission denied/);
        denied(as(null, 'select conquest_invites_mine();', 'anon'), null, 'anon nic');
        party = json(create(HOST, { map: 'evropa', players: 3, hours: 72, vis: 'private' }));
        assert.deepEqual(party.invited, [], 'hráč vidí (zatím prázdný) seznam pozvaných');
        denied(invite(HOST, party.id, [STRANGER]), /jen své přátele/, 'čekající žádost nestačí');
        denied(invite(HOST, party.id, [P1, STRANGER]), /jen své přátele/, 'pozvání neprojde ani částečně');
        denied(invite(HOST, party.id, [HOST]), /jen své přátele/, 'sebe ne');
        denied(invite(HOST, party.id, []), /Vyber, koho chceš pozvat/);
        denied(invite(P1, party.id, [HOST]), /nehraješ/, 'jen hráč hry');
        denied(invite(HOST, id(999), [P1]), /nehraješ/);
        assert.equal(q(`select count(*) from conquest_invites`), '0');
        // Hra pro 3, zakladatel je ve hře: nejvýš 2 čekající pozvánky
        denied(invite(HOST, party.id, [P1, P2, P3]), /Volná místa ve hře: 2\. Vyber méně přátel\./);
        const invited = json(invite(HOST, party.id, [P1, P2, P1]));
        assert.deepEqual(invited.invited.map(p => p.id).sort(), [P1, P2].sort());
        assert.deepEqual(invited.invited.map(p => p.display_name).sort(), ['Ada', 'Bára']);
        assert.ok(invited.invited.every(p => p.by_me === true && 'avatar' in p && 'owl' in p), JSON.stringify(invited.invited));
        denied(invite(HOST, party.id, [P3]), /už čekají na pozvané přátele/);
        assert.equal(json(invite(HOST, party.id, [P1])).invited.length, 2, 'opakované pozvání nic nezmění');
        // Pozvaný hru (soukromou) zatím nehraje: stav hry ani souhrn s pozvanými nevidí
        denied(state(P1, party.id), /nehraješ/);
    });

    await t.test('pozvánky (blok 24): pozvaný je vidí, přidá se do soukromé hry bez kódu, odmítne; odmítnutého jde pozvat znovu; začátkem hry pozvánky končí', () => {
        const mine = invitesOf(P1);
        assert.equal(mine.length, 1);
        const [inv] = mine;
        assert.deepEqual([inv.id, inv.map, inv.hours, inv.max_players, inv.status, inv.code, inv.mine, inv.invited], [party.id, 'evropa', 72, 3, 'lobby', party.code, false, null]);
        assert.deepEqual([inv.invited_by.id, inv.invited_by.display_name, inv.players.length], [HOST, 'Velitel', 1]);
        assert.equal(inv.minutes, 72 * 60, 'délka hry v minutách (blok 26)');
        assert.ok(inv.invited_at && 'avatar' in inv.invited_by && 'frame' in inv.invited_by);
        assert.deepEqual(invitesOf(P3), [], 'nepozvaný nic');
        // Bez pozvánky do soukromé hry podle id ne; s pozvánkou ano a pozvánka zmizí
        denied(join(P3, { game: party.id, colour: 'zelena' }), /kódem není/);
        const joined = json(join(P1, { game: party.id, colour: 'modra', emblem: 'orel' }));
        assert.equal(joined.status, 'lobby');
        assert.deepEqual(joined.players.map(p => p.id), [HOST, P1]);
        assert.deepEqual(joined.invited.map(p => p.id), [P2], 'kdo se přidal, mezi pozvanými není');
        assert.deepEqual(invitesOf(P1), []);
        assert.equal(q(`select count(*) from conquest_invites where game_id = '${party.id}' and user_id = '${P1}'`), '0');
        // Poslední volné místo čeká na P2; P2 odmítne → pozvánka zmizí, v lobby není, místo je pro dalšího
        denied(invite(HOST, party.id, [P3]), /už čekají/);
        ok(decline(P2, party.id));
        ok(decline(P2, party.id));
        assert.deepEqual(invitesOf(P2), []);
        assert.deepEqual(json(state(HOST, party.id)).invited, []);
        denied(join(P2, { game: party.id, colour: 'zelena' }), /kódem není/, 'odmítnutá pozvánka do hry nepustí');
        // Znovu pozvat odmítnutého jde (odmítnutí se zruší); pak už místo pro P3 není
        assert.deepEqual(json(invite(P1, party.id, [HOST])).invited, [], 'pozvat hráče, který už ve hře je, nic nezmění');
        assert.deepEqual(json(invite(HOST, party.id, [P2])).invited.map(p => [p.id, p.by_me]), [[P2, true]]);
        assert.equal(invitesOf(P2).length, 1);
        assert.equal(q(`select declined_at is null from conquest_invites where game_id = '${party.id}' and user_id = '${P2}'`), 't');
        denied(invite(HOST, party.id, [P3]), /už čekají/);
        // Druhý hráč hry vidí pozvané taky (pozval je někdo jiný)
        assert.deepEqual(json(state(P1, party.id)).invited.map(p => [p.id, p.by_me]), [[P2, false]]);
        // Kód hry funguje dál (i odmítnutému), přidání kódem pozvánku smaže; plná hra začne a pozvánky do ní končí
        q(`update conquest_invites set declined_at = now() where game_id = '${party.id}' and user_id = '${P2}'`);
        const full = json(join(P2, { code: party.code, colour: 'zelena', emblem: 'vlk' }));
        assert.equal(full.status, 'running');
        assert.equal(full.invited, null, 'po začátku hry žádní pozvaní');
        assert.equal(q(`select count(*) from conquest_invites where game_id = '${party.id}'`), '0');
        denied(invite(HOST, party.id, [P3]), /ještě nezačala/);
    });

    await t.test('pozvánky (blok 24): blokovaného zakladatele pozvánka mine; do plné hry ani po začátku se pozvánka neukáže', () => {
        // Veřejná hra cizího zakladatele, který P4 blokuje: HOST je v ní a P4 (svého přítele) pozve – pozvánka nevznikne
        const open = json(create(OWNER, { map: 'cesko', players: 3, hours: 12, per: 'hour', colour: 'cerna', emblem: 'vlk' }));
        ok(join(HOST, { game: open.id, colour: 'modra' }));
        q(`insert into player_blocks (blocker, blocked) values ('${OWNER}', '${P4}')`);
        assert.deepEqual(json(invite(HOST, open.id, [P4])).invited, []);
        assert.deepEqual(invitesOf(P4), []);
        // P3 pozvaný do hry, která se mezitím zaplní (cizím hráčem): pozvánka se mu neukáže
        assert.deepEqual(json(invite(HOST, open.id, [P3])).invited.map(p => p.id), [P3]);
        assert.equal(invitesOf(P3).length, 1);
        q(`update conquest_games set max_players = 2 where id = '${open.id}'`);
        assert.deepEqual(invitesOf(P3), [], 'plná hra');
        q(`update conquest_games set max_players = 3 where id = '${open.id}'`);
        assert.equal(invitesOf(P3).length, 1);
        q(`delete from player_blocks where blocker = '${OWNER}'`);
    });

    await t.test('pozvánky (blok 24): upozornění „X tě zve do hry“ jednou za pozvánku (i po opětovném pozvání), vypnutelné, limit 10 minut, jen čerstvé', () => {
        const SECRET = 'tajne-heslo-pro-cron-1234567890';
        const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
        q(`insert into app_secrets (name, value) values ('push_cron', '${SECRET}') on conflict (name) do update set value = excluded.value`);
        q(`delete from push_sent; delete from push_subscriptions;`);
        const rows = (sql) => { const text = q(sql); return text ? text.split('\n').map(line => line.split('|')) : []; };
        const items = () => rows(`select user_id || '|' || kind || '|' || title || '|' || body || '|' || url || '|' || dedupe_key from conquest_invite_push_items() order by dedupe_key`);
        const pending = () => rows(`select user_id || '|' || kind || '|' || title || '|' || dedupe_key from push_pending() where kind = 'conquest_invite' order by dedupe_key`);
        // P3 má čekající pozvánku do hry na 12 hodin (Česko, od HOST)
        const open = q(`select game_id from conquest_invites where user_id = '${P3}' and declined_at is null`);
        const openCode = q(`select code from conquest_games where id = '${open}'`);
        assert.deepEqual(items(), [[P3, 'conquest_invite', 'Dobývání: Velitel tě zve do hry', 'Mapa Česko · hra na 12 hodin. Vyber si barvu a přidej se.', `./?dobyvani=${openCode}`, `cqi:${open}:${P3}`]]);
        assert.deepEqual(q(`select string_agg(conquest_push_length(h), '|' order by h) from unnest(array[6, 12, 24, 48, 72, 120, 168]) h`).split('|'),
            ['6 hodin', '12 hodin', '1 den', '2 dny', '3 dny', '5 dní', '7 dní']);
        denied(as(P3, 'select * from conquest_invite_push_items();'), /permission denied/, 'pomocná funkce není pro hráče');
        // Bez odběru nic; s odběrem jedno upozornění; vypnuté Dobývání nic
        assert.deepEqual(pending(), []);
        ok(as(P3, `select push_subscribe('https://push.example.com/send/p3', '${P256DH}', 'tBHItJI5svbpez7KI4CCXg');`));
        assert.deepEqual(pending(), [[P3, 'conquest_invite', 'Dobývání: Velitel tě zve do hry', `cqi:${open}:${P3}`]]);
        q(`update profiles set push_conquest = false where id = '${P3}'`);
        assert.deepEqual(items(), [], 'vypnuté upozornění z Dobývání');
        q(`update profiles set push_conquest = true where id = '${P3}'`);
        // Odesláno: push_mark zapíše druh conquest_invite a pozvaného; tatáž pozvánka znovu nepřijde (ani po odmítnutí a novém pozvání)
        q(`select push_mark('${SECRET}', array['cqi:${open}:${P3}']::text[]);`);
        assert.equal(q(`select kind || ' ' || user_id from push_sent where dedupe_key = 'cqi:${open}:${P3}'`), `conquest_invite ${P3}`);
        assert.deepEqual(pending(), []);
        ok(decline(P3, open));
        assert.deepEqual(items(), [], 'odmítnutá pozvánka nic');
        ok(invite(HOST, open, [P3]));
        assert.equal(items().length, 1);
        assert.deepEqual(pending(), [], 'stejná pozvánka podruhé ne');
        // Pozvánka do jiné hry: nejdřív 10 minut po posledním upozornění tohoto druhu
        const other = json(create(P4, { map: 'afrika', players: 4, hours: 168, colour: 'zluta', emblem: 'lev' }));
        befriend(P4, P3);
        ok(invite(P4, other.id, [P3]));
        assert.deepEqual(items().map(row => [row[2], row[3]]).find(row => /Dita/.test(row[0])), ['Dobývání: Dita tě zve do hry', 'Mapa Afrika · hra na 7 dní. Vyber si barvu a přidej se.']);
        assert.deepEqual(pending(), [], 'do 10 minut nic');
        q(`update push_sent set sent_at = sent_at - interval '11 minutes'`);
        assert.deepEqual(pending().map(row => row[3]), [`cqi:${other.id}:${P3}`]);
        // Jen čerstvé (do 3 dnů), jen dokud hra čeká a pozvaný v ní není
        q(`update conquest_invites set created_at = now() - interval '4 days' where game_id = '${other.id}'`);
        assert.ok(!items().some(row => row[5] === `cqi:${other.id}:${P3}`), 'starší než 3 dny');
        q(`update conquest_invites set created_at = now() where game_id = '${other.id}'`);
        ok(join(P3, { game: other.id, colour: 'modra' }));
        assert.ok(!items().some(row => row[5] === `cqi:${other.id}:${P3}`), 'kdo se přidal, upozornění nedostane');
        q(`delete from push_sent; delete from push_subscriptions;`);
    });

    // Bitvy o území (blok 25): S1–S3 útočí z Česka, Polska a Rakouska na Slovensko, které drží S4 (domov S4 je Maďarsko)
    const [S1, S2, S3, S4] = [50, 51, 52, 53].map(id);
    const QUESTION = { kind: 'flag', prompt: 'Čí je tahle vlajka?', image: 'https://example.com/vlajka.svg',
        choices: [{ label: 'Slovensko', correct: true }, { label: 'Slovinsko', correct: false }, { label: 'Srbsko' }, 'Rusko'] };
    const begin = (uid, game, target, { question = QUESTION, correct = 0, source = null } = {}) =>
        as(uid, `select conquest_siege_begin(${lit(game)}, ${lit(target)}, ${lit(JSON.stringify(question))}::jsonb, ${correct === null ? 'null' : correct}::smallint, ${lit(source)});`);
    const joinSiege = (uid, siege, source = null) => as(uid, `select conquest_siege_join(${lit(siege)}, ${lit(source)});`);
    const answer = (uid, siege, choice) => as(uid, `select conquest_siege_answer(${lit(siege)}, ${choice === null ? 'null' : choice}::smallint);`);
    const siegeStatus = (uid, siege) => as(uid, `select conquest_siege_status(${lit(siege)});`);
    const pulse = (uid, game) => json(as(uid, `select conquest_pulse(${lit(game)});`));
    const attacks = (game) => { const text = q(`select user_id || ' ' || result || ' ' || success || ' ' || coalesce(victim::text, '-') || ' ' || period from conquest_moves where game_id = '${game}' and kind = 'attack' order by id`); return text ? text.split('\n') : []; };
    let war;
    const battleMap = () => {
        clearMap(war.id);
        place(war.id, 'Q213', S1, { home: true });   // Česko
        place(war.id, 'Q36', S2, { home: true });    // Polsko
        place(war.id, 'Q40', S3, { home: true });    // Rakousko
        place(war.id, 'Q214', S4, {});               // Slovensko: cíl
        place(war.id, 'Q28', S4, { home: true });    // Maďarsko
        q(`delete from conquest_sieges where game_id = '${war.id}'; delete from conquest_moves where game_id = '${war.id}' and kind <> 'home';
           update conquest_players set lost_period = null where game_id = '${war.id}'`);
    };

    await t.test('bitvy (blok 25): tabulky jen přes funkce, oprávnění, kontrola otázky (velikost, 2–8 možností, index správné)', () => {
        clock = '2026-12-10T07:00:00Z';
        q(`insert into auth.users (id, email, raw_user_meta_data) select u, 's' || n || '@example.com', jsonb_build_object('full_name', name)
            from unnest(array['${S1}', '${S2}', '${S3}', '${S4}']::uuid[], array['Alfa', 'Beta', 'Gama', 'Delta']) with ordinality as x (u, name, n)`);
        war = json(create(S1, { map: 'evropa', players: 4, hours: 72, per: 'day', actions: 5, vis: 'private' }));
        [[S2, 'modra'], [S3, 'zelena'], [S4, 'zluta']].forEach(([uid, colour]) => ok(join(uid, { code: war.code, colour, emblem: 'vlk' })));
        assert.equal(json(state(S1, war.id)).status, 'running');
        for (const table of ['conquest_sieges', 'conquest_siege_players']) {
            assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`), 't', table);
            denied(as(S1, `select * from ${table};`), /permission denied/, `${table}: správná odpověď jen přes funkce`);
        }
        const rpc = ['conquest_siege_begin(uuid, text, jsonb, smallint, text)', 'conquest_siege_join(uuid, text)', 'conquest_siege_answer(uuid, smallint)', 'conquest_siege_status(uuid)', 'conquest_pulse(uuid)'];
        const internal = ['conquest_besieged(uuid)', 'conquest_attack_check(public.conquest_games, uuid, text, text)', 'conquest_attack_apply(uuid, uuid, text, text, integer, boolean)',
            'conquest_siege_window()', 'conquest_siege_grace()', 'conquest_version(public.conquest_games)', 'conquest_siege_question(jsonb, integer)',
            'conquest_siege_json(public.conquest_sieges, uuid)', 'conquest_siege_view(public.conquest_sieges, uuid)', 'conquest_sieges_json(uuid, uuid)',
            'conquest_siege_resolve(uuid, boolean)', 'conquest_sieges_due(uuid, boolean)', 'conquest_siege_tick(public.conquest_games)', 'conquest_siege_game(uuid, uuid, boolean)'];
        const can = (role, fn) => q(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`);
        for (const fn of rpc) assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['t', 'f', 'f'], fn);
        for (const fn of internal) assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['f', 'f', 'f'], fn);
        denied(as(S1, `select conquest_siege_resolve('${id(999)}', true);`), /permission denied/);
        denied(as(S1, `select conquest_sieges_due('${war.id}', true);`), /permission denied/);
        denied(as(null, `select conquest_pulse('${war.id}');`, 'anon'), null, 'anon nic');
        denied(as(null, `select conquest_siege_begin('${war.id}', 'Q214', '{}'::jsonb, 0::smallint, null);`, 'anon'), null);
        battleMap();
        // Otázka: objekt s 2–8 možnostmi (objekty nebo texty), index správné v rozsahu, nejvýš 40 kB
        const bad = /Otázka k bitvě není v pořádku\./;
        denied(begin(S1, war.id, 'Q214', { question: [1, 2] }), bad);
        denied(begin(S1, war.id, 'Q214', { question: { prompt: 'Bez možností' } }), bad);
        denied(begin(S1, war.id, 'Q214', { question: { prompt: 'Jedna', choices: ['A'] } }), bad);
        denied(begin(S1, war.id, 'Q214', { question: { prompt: 'Devět', choices: 'ABCDEFGHI'.split('') } }), bad);
        denied(begin(S1, war.id, 'Q214', { question: { prompt: 'Číslo', choices: ['A', 5] } }), bad);
        denied(begin(S1, war.id, 'Q214', { correct: 4 }), bad);
        denied(begin(S1, war.id, 'Q214', { correct: -1 }), bad);
        denied(begin(S1, war.id, 'Q214', { correct: null }), bad);
        denied(begin(S1, war.id, 'Q214', { question: { ...QUESTION, prompt: 'x'.repeat(41000) } }), /Otázka k bitvě je moc velká\./);
        assert.equal(q(`select count(*) from conquest_sieges`), '0');
        assert.equal(json(state(S1, war.id)).budget.left, 5, 'odmítnutá otázka tah nestojí');
    });

    await t.test('bitvy (blok 25): sám a správně = dobytí, sám a špatně = odraženo; tah rezervovaný hned, po vyhodnocení zapsaný (bez dvojího počítání); puls', () => {
        clock = '2026-12-10T08:00:00Z';
        const v0 = pulse(S2, war.id).version;
        assert.match(v0, /^\d+\.\d+\.\d+\.\d+\.running$/, 'tah, bitvy, Chci další kolo, kolo (blok 26), stav');
        const s = json(begin(S1, war.id, 'Q214', { source: 'Q213' }));
        assert.deepEqual([s.status, s.territory, s.mine, s.answered, s.started_by, s.correct_choice, s.answer], ['open', 'Q214', true, false, S1, null, null]);
        assert.ok(s.joined_at.startsWith('2026-12-10T08:00:00') && s.deadline.startsWith('2026-12-10T08:01:00') && s.join_until.startsWith('2026-12-10T08:01:00') && s.ends_at.startsWith('2026-12-10T08:01:00'), JSON.stringify(s));
        assert.ok(s.now.startsWith('2026-12-10T08:00:00'));
        assert.deepEqual(s.participants.map(p => [p.id, p.display_name, p.flag_color, p.source, p.answered, p.me]), [[S1, 'Alfa', 'cervena', 'Q213', false, true]]);
        assert.ok('avatar' in s.participants[0] && 'owl' in s.participants[0] && 'frame' in s.participants[0]);
        assert.deepEqual([s.budget.reserved, s.budget.used, s.budget.left], [1, 1, 4], 'tah rezervovaný hned');
        // Uložená otázka je bez příznaků správnosti, správná odpověď jen zvlášť
        assert.doesNotMatch(q(`select question::text from conquest_sieges where id = '${s.id}'`), /correct/);
        assert.equal(q(`select correct_choice from conquest_sieges where id = '${s.id}'`), '0');
        // Puls: ostatní obléhání hned vidí; přidat se smí soused, majitel ne
        const seen = pulse(S2, war.id);
        assert.notEqual(seen.version, v0, 'verze se změnila');
        assert.equal(seen.sieges.length, 1);
        assert.deepEqual([seen.sieges[0].id, seen.sieges[0].mine, seen.sieges[0].answered, seen.sieges[0].can_join], [s.id, false, false, true]);
        assert.ok(!('question' in seen.sieges[0]) && !('correct_choice' in seen.sieges[0]), 'puls otázku nemá');
        assert.equal(pulse(S4, war.id).sieges[0].can_join, false, 'majitel se nepřidá');
        assert.deepEqual([pulse(S1, war.id).sieges[0].mine, pulse(S1, war.id).sieges[0].can_join], [true, false]);
        assert.deepEqual(json(state(S3, war.id)).sieges.map(x => x.territory), ['Q214'], 'stav hry má otevřené bitvy taky');
        // Odpověď po 7 s: správně, jediný účastník = hned vyhodnoceno, dobytí
        clock = '2026-12-10T08:00:07Z';
        const r = json(answer(S1, s.id, 0));
        assert.deepEqual([r.correct, r.status, r.late, r.answer_ms, r.correct_choice], [true, 'resolved', false, 7000, 0]);
        assert.deepEqual([r.move.r, r.move.v, r.move.s, r.move.n, r.move.k], ['capture', S4, 'Q213', 0, 'attack']);
        assert.deepEqual([r.siege.status, r.siege.outcome, r.siege.winner], ['resolved', 'capture', S1]);
        assert.deepEqual(r.siege.participants.map(p => [p.id, p.correct, p.answer_ms, p.result, p.winner]), [[S1, true, 7000, 'capture', true]]);
        assert.equal(owner(war.id, 'Q214'), S1);
        assert.deepEqual([r.state.budget.reserved, r.state.budget.used, r.state.budget.left], [0, 1, 4], 'rezervace se změnila v tah, ne dva');
        assert.deepEqual(r.state.sieges, []);
        assert.deepEqual(attacks(war.id), [`${S1} capture true ${S4} 0`]);
        // Odpověď jen jednou; po vyhodnocení se už nikdo nepřidá
        assert.deepEqual([json(answer(S1, s.id, 2)).correct, json(answer(S1, s.id, 2)).status], [true, 'resolved']);
        denied(joinSiege(S2, s.id), /Bitva už skončila\./);
        assert.equal(pulse(S1, war.id).results.map(x => x.id).join(), s.id, 'moje nedávná bitva ve výsledcích pulsu');
        // Sám a špatně: útok odražen, tah propadl
        clock = '2026-12-10T08:01:00Z';
        const w = json(begin(S1, war.id, 'Q28'));
        clock = '2026-12-10T08:01:04Z';
        const miss = json(answer(S1, w.id, 3));
        assert.deepEqual([miss.correct, miss.status, miss.correct_choice, miss.move.r, miss.move.v, miss.siege.outcome, miss.siege.winner], [false, 'resolved', 0, 'fail', S4, 'fail', null]);
        assert.equal(owner(war.id, 'Q28'), S4);
        assert.deepEqual([miss.state.budget.used, miss.state.budget.left], [2, 3]);
        denied(answer(S2, w.id, 0), /V téhle bitvě nebojuješ\./);
        denied(siegeStatus(id(1), w.id), /nehraješ/, 'cizí hráč stav bitvy nevidí');
    });

    await t.test('bitvy (blok 25): přidání a dva účastníci – rychlejší správná odpověď vyhraje (i když se přidal později), pomalejší správná = prohraná bitva; obléhané území neopevní ani na ně jinak nezaútočí', () => {
        battleMap();
        clock = '2026-12-10T09:00:00Z';
        const s = json(begin(S1, war.id, 'Q214'));
        denied(move(S4, war.id, 'Q214', 'fortify', true), /Obléhané území teď nejde opevnit\./);
        denied(move(S2, war.id, 'Q214', 'attack', true, 'Q36'), /Na území právě probíhá bitva\. Můžeš se přidat\./);
        denied(begin(S3, war.id, 'Q214'), /Na území právě probíhá bitva\. Můžeš se přidat\./);
        denied(joinSiege(S4, s.id), /vlastní území/);
        denied(joinSiege(id(1), s.id), /nehraješ/);
        denied(joinSiege(S2, s.id, 'Q213'), /z tvého sousedního/);
        place(war.id, 'Q40', null); place(war.id, 'Q142', S3, { home: true });
        denied(joinSiege(S3, s.id), /sousedí s tvým/);
        place(war.id, 'Q142', null); place(war.id, 'Q40', S3, { home: true });
        // S2 se přidá po 10 s: dostane stejnou otázku, ale bez správné odpovědi
        clock = '2026-12-10T09:00:10Z';
        const j = json(joinSiege(S2, s.id));
        assert.deepEqual([j.mine, j.answered, j.answer, j.correct_choice], [true, false, null, null]);
        assert.ok(j.joined_at.startsWith('2026-12-10T09:00:10') && j.deadline.startsWith('2026-12-10T09:01:10') && j.ends_at.startsWith('2026-12-10T09:01:10') && j.join_until.startsWith('2026-12-10T09:01:00'), JSON.stringify(j));
        assert.deepEqual(j.question, { kind: 'flag', prompt: QUESTION.prompt, image: QUESTION.image, choices: [{ label: 'Slovensko' }, { label: 'Slovinsko' }, { label: 'Srbsko' }, 'Rusko'] });
        assert.doesNotMatch(JSON.stringify(j).replace(/"correct_choice":null/, ''), /correct/, 'přidaný správnou odpověď nedostane');
        assert.deepEqual(j.participants.map(p => [p.id, p.source, p.answered]), [[S1, null, false], [S2, 'Q36', false]], 'území útoku se doplní samo');
        assert.equal(j.budget.reserved, 1);
        assert.equal(json(joinSiege(S2, s.id)).budget.reserved, 1, 'podruhé se nic nerezervuje');
        // S1 odpoví po 15 s (čeká se na S2), S2 po 12 s od přidání: S2 je rychlejší
        clock = '2026-12-10T09:00:15Z';
        const first = json(answer(S1, s.id, 0));
        assert.deepEqual([first.correct, first.status, first.answer_ms, first.correct_choice, 'state' in first], [true, 'waiting', 15000, 0, false]);
        const waiting = json(siegeStatus(S2, s.id));
        assert.deepEqual([waiting.correct_choice, waiting.participants[0].answered, 'correct' in waiting.participants[0]], [null, true, false], 'kdo neodpověděl, správnou odpověď nevidí');
        assert.ok(waiting.question && waiting.question.choices.length === 4);
        const spectator = json(siegeStatus(S3, s.id));
        assert.deepEqual([spectator.mine, 'question' in spectator, 'correct_choice' in spectator], [false, false, false], 'divák otázku nevidí');
        clock = '2026-12-10T09:00:22Z';
        const second = json(answer(S2, s.id, 0));
        assert.deepEqual([second.correct, second.status, second.answer_ms, second.move.r, second.siege.winner, second.siege.outcome], [true, 'resolved', 12000, 'capture', S2, 'capture']);
        assert.deepEqual(second.siege.participants.map(p => [p.id, p.correct, p.answer_ms, p.result, p.winner]), [[S1, true, 15000, 'outrun', false], [S2, true, 12000, 'capture', true]]);
        assert.equal(owner(war.id, 'Q214'), S2);
        assert.deepEqual(attacks(war.id), [`${S1} outrun true ${S4} 0`, `${S2} capture true ${S4} 0`], 'prohraná bitva napřed, tah vítěze nahoře v kronice');
        const lost = json(siegeStatus(S1, s.id));
        assert.deepEqual([lost.result, lost.move.r, lost.answer.correct], ['outrun', 'outrun', true]);
        assert.deepEqual([json(state(S1, war.id)).budget.used, json(state(S2, war.id)).budget.used], [1, 1], 'tah propadl oběma');
        assert.deepEqual(pulse(S1, war.id).results.map(x => [x.id, x.winner]), [[s.id, S2]]);
    });

    await t.test('bitvy (blok 25): rychlejší začínající vyhraje; opevněné území vítěz jen pobourá; při shodě času vyhraje, kdo se přidal dřív', () => {
        battleMap();
        place(war.id, 'Q214', S4, { level: 1 });
        clock = '2026-12-10T10:00:00Z';
        const s = json(begin(S1, war.id, 'Q214', { source: 'Q213' }));
        clock = '2026-12-10T10:00:03Z';
        ok(joinSiege(S2, s.id));
        clock = '2026-12-10T10:00:05Z';
        assert.equal(json(answer(S1, s.id, 0)).status, 'waiting');
        clock = '2026-12-10T10:00:20Z';
        const r = json(answer(S2, s.id, 0));
        assert.deepEqual([r.correct, r.answer_ms, r.move.r, r.siege.winner, r.siege.outcome], [true, 17000, 'outrun', S1, 'breach']);
        assert.deepEqual([owner(war.id, 'Q214'), level(war.id, 'Q214')], [S4, 0]);
        assert.deepEqual(attacks(war.id), [`${S2} outrun true ${S4} 0`, `${S1} breach true ${S4} 0`]);
        // Shoda: oba odpoví správně za 10 s, vyhraje S1 (přidal se dřív)
        battleMap();
        clock = '2026-12-10T11:00:00Z';
        const tie = json(begin(S1, war.id, 'Q214'));
        clock = '2026-12-10T11:00:05Z';
        ok(joinSiege(S2, tie.id));
        clock = '2026-12-10T11:00:10Z';
        ok(answer(S1, tie.id, 0));
        clock = '2026-12-10T11:00:15Z';
        const end = json(answer(S2, tie.id, 0));
        assert.deepEqual(end.siege.participants.map(p => [p.id, p.answer_ms, p.result]), [[S1, 10000, 'capture'], [S2, 10000, 'outrun']]);
        assert.equal(owner(war.id, 'Q214'), S1);
    });

    await t.test('bitvy (blok 25): pozdní odpověď je jako žádná; přidat se jde jen 60 s; opuštěná bitva se vyhodnotí po termínu (+3 s) v pulsu i ve stavu hry', () => {
        battleMap();
        clock = '2026-12-10T12:00:00Z';
        const s = json(begin(S1, war.id, 'Q214'));
        clock = '2026-12-10T12:00:30Z';
        ok(joinSiege(S2, s.id));
        // S1 měl čas do 12:01:00 (+3 s na síť): správná odpověď v 12:01:04 se nepočítá
        clock = '2026-12-10T12:01:04Z';
        const late = json(answer(S1, s.id, 0));
        assert.deepEqual([late.correct, late.late, late.status, late.correct_choice], [false, true, 'waiting', 0]);
        clock = '2026-12-10T12:01:10Z';
        denied(joinSiege(S3, s.id), /Bitva už skončila\./, 'přidat se jde jen 60 s od začátku');
        // S2 neodpoví: termín 12:01:30 + 3 s
        clock = '2026-12-10T12:01:32Z';
        const before = pulse(S3, war.id);
        assert.equal(before.sieges.length, 1, 'ještě rezerva na síť');
        clock = '2026-12-10T12:01:34Z';
        const after = pulse(S3, war.id);
        assert.deepEqual(after.sieges, []);
        assert.notEqual(after.version, before.version);
        assert.deepEqual(attacks(war.id), [`${S1} fail false ${S4} 0`, `${S2} fail false ${S4} 0`], 'nikdo správně = útok odražen');
        assert.equal(owner(war.id, 'Q214'), S4);
        const gone = json(answer(S2, s.id, 0));
        assert.deepEqual([gone.status, gone.correct, gone.late, gone.move.r], ['resolved', false, true, 'fail'], 'odpověď po vyhodnocení se nezapíše');
        assert.deepEqual(gone.siege.participants.map(p => [p.id, p.answered, p.result]), [[S1, true, 'fail'], [S2, false, 'fail']]);
        denied(joinSiege(S3, s.id), /Bitva už skončila\./);
        // Opuštěná bitva: nikdo se nevrátí, vyhodnotí ji stav hry
        clock = '2026-12-10T12:10:00Z';
        const abandoned = json(begin(S1, war.id, 'Q214'));
        clock = '2026-12-10T12:11:04Z';
        const st = json(state(S2, war.id));
        assert.deepEqual(st.sieges, []);
        assert.equal(q(`select status || ' ' || outcome from conquest_sieges where id = '${abandoned.id}'`), 'resolved fail');
        assert.equal(st.moves[st.moves.length - 1].r, 'fail');
    });

    await t.test('bitvy (blok 25): upozornění na útok ukáže výsledek bitvy (vítěz, špatné odpovědi; prohraná bitva se nepočítá)', () => {
        const pushRows = () => { const text = q(`select title || '|' || body || '|' || url || '|' || dedupe_key from conquest_push_items() where user_id = '${S4}'`); return text ? text.split('\n').map(line => line.split('|')) : []; };
        const fresh = () => q(`update conquest_moves set at = now() - interval '1 minute' where game_id = '${war.id}' and kind = 'attack'`);
        battleMap();
        q(`delete from push_sent`);
        clock = '2026-12-10T14:00:00Z';
        const s = json(begin(S1, war.id, 'Q214'));
        clock = '2026-12-10T14:00:02Z'; ok(joinSiege(S2, s.id));
        clock = '2026-12-10T14:00:03Z'; ok(joinSiege(S3, s.id));
        clock = '2026-12-10T14:00:05Z'; ok(answer(S1, s.id, 0));
        clock = '2026-12-10T14:00:10Z'; ok(answer(S2, s.id, 0));
        clock = '2026-12-10T14:00:12Z';
        const done = json(answer(S3, s.id, 1));
        assert.deepEqual(done.siege.participants.map(p => [p.id, p.result]), [[S1, 'capture'], [S2, 'outrun'], [S3, 'fail']]);
        fresh();
        const capture = q(`select id from conquest_moves where game_id = '${war.id}' and result = 'capture'`);
        assert.deepEqual(pushRows(), [['Dobývání: jedno tvé území padlo (+1 další útok)', 'Útočník: Alfa. Území sousedí s tvými, můžeš ho dobýt zpět.', `./?dobyvani=${war.code}`, `cq:${war.id}:${S4}:${capture}`]]);
        // Nikdo správně: útok odražen
        battleMap();
        q(`delete from push_sent`);
        clock = '2026-12-10T14:10:00Z';
        const r = json(begin(S1, war.id, 'Q214'));
        clock = '2026-12-10T14:10:02Z'; ok(joinSiege(S2, r.id));
        clock = '2026-12-10T14:10:05Z'; ok(answer(S1, r.id, 1));
        clock = '2026-12-10T14:10:08Z';
        assert.equal(json(answer(S2, r.id, 2)).siege.outcome, 'fail');
        fresh();
        const [row] = pushRows();
        assert.equal(row[0], 'Dobývání: útok na tvé území odražen (+1 další útok)');
        assert.match(row[1], /^Útočník: (Alfa|Beta)\. Možná to zkusí znovu, opevni se\.$/);
        q(`delete from push_sent`);
    });

    await t.test('bitvy (blok 25): boti obléhaná území vynechají (nezaútočí na ně, neopevní je)', () => {
        const botMove = () => q(`set mudrlant.test_now = '${clock}'; select conquest_bot_move('${war.id}', '${S3}')`);
        const botMoves = () => q(`select coalesce(string_agg(kind || ' ' || territory, ',' order by id), '') from conquest_moves where game_id = '${war.id}' and user_id = '${S3}' and kind in ('attack', 'fortify')`);
        // S3 (jako bot) drží jen Irsko, jediný soused Spojené království je obléhaný: místo útoku opevní Irsko
        clearMap(war.id);
        q(`delete from conquest_sieges where game_id = '${war.id}'; delete from conquest_moves where game_id = '${war.id}' and kind <> 'home'`);
        place(war.id, 'Q142', S1, { home: true });   // Francie
        place(war.id, 'Q27', S3, {});                // Irsko
        clock = '2026-12-10T15:00:00Z';
        const s = json(begin(S1, war.id, 'Q145'));
        assert.equal(botMove(), 't');
        assert.equal(botMoves(), 'fortify Q27');
        place(war.id, 'Q27', S3, { level: 2 });
        assert.equal(botMove(), 'f', 'nemá co hrát');
        assert.equal(botMoves(), 'fortify Q27');
        // Obléhané vlastní území (Spojené království) bot neopevní, útočí jinam
        q(`delete from conquest_sieges where id = '${s.id}'; delete from conquest_moves where game_id = '${war.id}' and kind <> 'home'`);
        place(war.id, 'Q145', S3, {});
        clock = '2026-12-10T15:10:00Z';
        json(begin(S1, war.id, 'Q145'));
        for (let i = 0; i < 4; i++) assert.equal(botMove(), 't');
        assert.ok(botMoves().split(',').every(entry => entry && !entry.endsWith('Q145')), botMoves());
        assert.equal(q(`select count(*) from conquest_sieges where game_id = '${war.id}' and status = 'open'`), '1');
    });

    await t.test('pevnost (blok 25): Pevnost na domovském území dává +1 tah hned po opevnění; pobouráním o něj hráč přijde', () => {
        battleMap();
        place(war.id, 'Q213', S1, { home: true, level: 2 });
        clock = '2026-12-10T16:00:00Z';
        const plain = json(state(S1, war.id)).budget;
        assert.deepEqual([plain.fortress, plain.total, plain.left], [0, 5, 5]);
        const built = json(move(S1, war.id, 'Q213', 'fortify', true));
        assert.equal(built.move.l, 3);
        assert.deepEqual([built.budget.fortress, built.budget.total, built.budget.used, built.budget.left], [1, 6, 1, 5], 'tah navíc hned');
        assert.equal(json(state(S1, war.id)).budget.fortress, 1);
        // Pevnost na území, které není domovské, být nemůže; domov soupeře S1 nepomáhá ostatním
        assert.equal(json(state(S2, war.id)).budget.fortress, 0);
        const breach = json(move(S2, war.id, 'Q213', 'attack', true, 'Q36'));
        assert.deepEqual([breach.move.r, breach.move.l], ['breach', 2]);
        const after = json(state(S1, war.id)).budget;
        assert.deepEqual([after.fortress, after.total, after.left], [0, 5, 4]);
        // V dalším období platí znovu, dokud pevnost drží
        place(war.id, 'Q213', S1, { home: true, level: 3 });
        clock = '2026-12-11T07:30:00Z';
        assert.deepEqual([json(state(S1, war.id)).budget.period, json(state(S1, war.id)).budget.fortress, json(state(S1, war.id)).budget.total], [1, 1, 6]);
    });

    await t.test('bitvy (blok 25): tah se počítá v období, kdy se hráč přidal; před koncem hry se otevřená bitva vyhodnotí', () => {
        battleMap();
        // Hra začala 10. 12. v 7:00: obléhání v posledních sekundách období 1, odpověď v období 2
        clock = '2026-12-12T06:59:40Z';
        const s = json(begin(S1, war.id, 'Q214'));
        assert.deepEqual([s.budget.period, s.budget.reserved, s.budget.left], [1, 1, 4]);
        clock = '2026-12-12T07:00:05Z';
        const next = json(state(S1, war.id)).budget;
        assert.deepEqual([next.period, next.reserved, next.used, next.left], [2, 0, 0, 5], 'rezervace patří do období 1');
        const r = json(answer(S1, s.id, 0));
        assert.deepEqual([r.correct, r.answer_ms, r.move.r, r.move.n], [true, 25000, 'capture', 1]);
        assert.deepEqual([r.state.budget.period, r.state.budget.used, r.state.budget.left], [2, 0, 5]);
        // Konec hry (13. 12. v 7:00): S1 odpověděl správně, S2 ne – bitva se vyhodnotí před pořadím a S1 území získá
        battleMap();
        clock = '2026-12-13T06:59:50Z';
        const last = json(begin(S1, war.id, 'Q214'));
        clock = '2026-12-13T06:59:52Z'; ok(joinSiege(S2, last.id));
        clock = '2026-12-13T06:59:55Z';
        assert.equal(json(answer(S1, last.id, 0)).status, 'waiting');
        clock = '2026-12-13T07:00:01Z';
        const final = json(state(S3, war.id));
        assert.equal(final.status, 'finished');
        assert.deepEqual(final.sieges, []);
        assert.equal(owner(war.id, 'Q214'), S1);
        assert.deepEqual(attacks(war.id), [`${S2} fail false ${S4} 2`, `${S1} capture true ${S4} 2`]);
        assert.equal(final.players.find(p => p.id === S1).score, 2, 'dobyté území se počítá do pořadí');
        const gone = json(answer(S2, last.id, 0));
        assert.deepEqual([gone.status, gone.late, gone.state.status], ['resolved', true, 'finished']);
        denied(begin(S2, war.id, 'Q214'), /skončila/);
        assert.equal(pulse(S1, war.id).status, 'finished');
    });

    // Rychlé hry a další kolo (blok 26): R1 a R2 hrají rychlou hru (Evropa, 20 minut, kolo 5 minut, 2 tahy); R3 je přítel na pozvánku
    const [R1, R2, R3, DEV2] = [60, 61, 62, 63].map(id);
    const createFast = (uid, { map = 'evropa', players = 2, hours = 0, minutes = 20, per = 'min5', actions = 2, vis = 'private', colour = 'cervena', emblem = 'lev' } = {}) =>
        as(uid, `select conquest_create(${lit(map)}, ${players}, ${hours}, ${lit(per)}, ${actions}, ${lit(vis)}, ${lit(colour)}, ${lit(emblem)}, ${minutes === null ? 'null' : minutes});`);
    const roundReady = (uid, game, on = true) => as(uid, `select conquest_round_ready(${lit(game)}, ${on});`);
    const at = (value) => (value === null || value === undefined ? value : new Date(value).toISOString());
    const roundView = (round) => round && { ...round, started_at: at(round.started_at), ends_at: at(round.ends_at), next_at: at(round.next_at) };
    let fast;

    await t.test('rychlé hry (blok 26): kolo 10 nebo 5 minut, délka v minutách a aspoň 3 kola; minutes v každém souhrnu; staré volání funguje; oprávnění', () => {
        clock = '2026-12-20T10:00:00Z';
        q(`insert into auth.users (id, email, raw_user_meta_data) select u, 'r' || n || '@example.com', jsonb_build_object('full_name', name)
            from unnest(array['${R1}', '${R2}', '${R3}', '${DEV2}']::uuid[], array['Rychlík', 'Blesk', 'Kamarád', 'Vývojářka']) with ordinality as x (u, name, n)`);
        denied(createFast(R1, { minutes: null }), /Vyber délku hry z nabídky\./, 'rychlá hra bez minut');
        denied(createFast(R1, { minutes: 25 }), /Vyber délku hry z nabídky\./);
        denied(createFast(R1, { minutes: 180 }), /Vyber délku hry z nabídky\./);
        denied(createFast(R1, { per: 'min10', minutes: 20 }), /Hra musí mít aspoň 3 kola\. Zvol delší hru, nebo kratší kolo\./, '2 kola po 10 minutách');
        denied(createFast(R1, { per: 'min2' }), /Kolo trvá den, hodinu, 10 minut, nebo 5 minut\./);
        denied(createFast(R1, { per: 'hour', hours: 7 }), /Vyber délku hry z nabídky\./, 'hra na hodiny dál podle hodin');
        // Kolo 10 minut a 30 minut = 3 kola; u hry na hodiny se minuty nepoužijí
        const ten = json(createFast(R1, { per: 'min10', minutes: 30 }));
        assert.deepEqual([ten.hours, ten.minutes, ten.period, ten.status], [null, 30, 'min10', 'lobby']);
        assert.equal(q(`select duration_hours is null and duration_minutes = 30 from conquest_games where id = '${ten.id}'`), 't');
        const hourly = json(createFast(R1, { per: 'hour', hours: 6, minutes: 20 }));
        assert.deepEqual([hourly.hours, hourly.minutes, hourly.period], [6, 360, 'hour']);
        // Moje hry v lobby mají minutes taky (hra na hodiny = hodiny × 60; pozvánky hlídá test bloku 24)
        assert.deepEqual(lobby(R1).mine.map(g => [g.id, g.hours, g.minutes]).sort(), [[ten.id, null, 30], [hourly.id, 6, 360]].sort());
        ok(as(R1, `select conquest_leave('${ten.id}');`));
        ok(as(R1, `select conquest_leave('${hourly.id}');`));
        // Jako PostgREST se jmény parametrů: bez minutes (starší aplikace) i s nimi
        const named = json(as(R1, `select conquest_create(map_id => 'cesko', players => 2, hours => 12, per => 'hour', actions_per => 2, vis => 'private', colour => 'cervena', emblem_id => 'lev');`));
        assert.deepEqual([named.hours, named.minutes], [12, 720]);
        ok(as(R1, `select conquest_leave('${named.id}');`));
        const namedFast = json(as(R1, `select conquest_create(map_id => 'cesko', players => 2, hours => null, per => 'min5', actions_per => 2, vis => 'private', colour => 'cervena', emblem_id => 'lev', minutes => 45);`));
        assert.deepEqual([namedFast.hours, namedFast.minutes, namedFast.period], [null, 45, 'min5']);
        ok(as(R1, `select conquest_leave('${namedFast.id}');`));
        // Databáze nepustí nesouhlasnou délku ani přímo
        for (const values of [`'min5', 6, null`, `'min5', null, 25`, `'day', null, 20`, `'hour', 6, 20`, `'day', null, null`]) {
            const r = psql(dbName, `insert into conquest_games (map, max_players, period, duration_hours, duration_minutes, actions, visibility, code) values ('evropa', 2, ${values}, 1, 'public', 'ZZZZZ2')`);
            assert.notEqual(r.status, 0, values);
            assert.match(r.stderr, /conquest_games_values/, values);
        }
        assert.equal(lobby(R1).open.find(g => g.preset === 'evropa-3d').minutes, 72 * 60);
        // Oprávnění: jen Chci další kolo a nové založení; stará podoba založení zmizela; pomocné funkce a značky nikdo zvenčí
        const can = (role, fn) => q(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`);
        for (const fn of ['conquest_round_ready(uuid, boolean)', 'conquest_create(text, integer, integer, text, integer, text, text, text, integer)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['t', 'f', 'f'], fn);
        }
        for (const fn of ['conquest_minutes(public.conquest_games)', 'conquest_period_start(public.conquest_games, integer)', 'conquest_period_end(public.conquest_games, integer)',
            'conquest_round_countdown()', 'conquest_round_player_done(public.conquest_games, uuid)', 'conquest_round_done(public.conquest_games)',
            'conquest_round_json(public.conquest_games, uuid)', 'conquest_presets()', 'conquest_period(public.conquest_games)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['f', 'f', 'f'], fn);
        }
        assert.equal(q(`select to_regprocedure('public.conquest_create(text, integer, integer, text, integer, text, text, text)') is null`), 't', 'stará podoba se osmi parametry');
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.conquest_round_marks'::regclass`), 't');
        denied(as(R1, 'select * from conquest_round_marks;'), /permission denied/, 'značky jen přes funkce');
        denied(as(R1, `select conquest_round_done(g) from conquest_games g limit 1;`), /permission denied/);
        denied(as(null, `select conquest_round_ready('${id(999)}', true);`, 'anon'), null, 'anon nic');
        denied(roundReady(R1, id(999)), /nehraješ/);
    });

    await t.test('další kolo (blok 26): kolo je hotové, až nikdo nemá tah a neběží bitva; všichni chtějí → odpočet 10 s → nové kolo s novými tahy; konec hry se nemění', () => {
        clock = '2026-12-20T11:00:00Z';
        fast = json(createFast(R1, { actions: 2 }));
        denied(roundReady(R1, fast.id), /Hra ještě nezačala\./);
        ok(join(R2, { code: fast.code, colour: 'modra' }));
        let st = json(state(R1, fast.id));
        assert.equal(st.status, 'running');
        assert.deepEqual([at(st.started_at), at(st.ends_at), st.minutes, st.hours], ['2026-12-20T11:00:00.000Z', '2026-12-20T11:20:00.000Z', 20, null]);
        assert.deepEqual(roundView(st.round), { period: 0, started_at: '2026-12-20T11:00:00.000Z', ends_at: '2026-12-20T11:05:00.000Z', done: false, ready: [],
            next_at: null, can_ready: false, last: false });
        assert.equal(at(st.budget.period_ends_at), '2026-12-20T11:05:00.000Z');
        clearMap(fast.id);
        place(fast.id, 'Q213', R1, { home: true });   // Česko
        place(fast.id, 'Q36', R2, { home: true });    // Polsko
        denied(roundReady(R1, fast.id), /Další kolo jde chtít, až všichni dohrají své tahy\./);
        // R1 dohraje, R2 ještě ne
        json(move(R1, fast.id, 'Q214', 'attack', true));
        st = json(move(R1, fast.id, 'Q40', 'attack', false));
        assert.deepEqual([st.budget.left, st.round.done, st.round.can_ready], [0, false, false]);
        denied(roundReady(R1, fast.id), /Další kolo jde chtít/);
        // R2: opevnění a obléhání (rezervovaný tah) – tahy nemá nikdo, ale bitva běží
        json(move(R2, fast.id, 'Q36', 'fortify', true));
        const s = json(begin(R2, fast.id, 'Q183', { source: 'Q36' }));
        assert.equal(s.budget.left, 0);
        assert.equal(json(state(R1, fast.id)).round.done, false, 'otevřená bitva');
        denied(roundReady(R2, fast.id), /Další kolo jde chtít/);
        clock = '2026-12-20T11:00:05Z';
        assert.equal(json(answer(R2, s.id, 0)).status, 'resolved');
        st = json(state(R1, fast.id));
        assert.deepEqual([st.round.done, st.round.can_ready, st.round.ready, st.round.next_at], [true, true, [], null]);
        // R1 chce další kolo (opakovaně beze změny), pak už ne a zase chce; R2 to vidí v pulsu, verze se mění
        const v0 = pulse(R2, fast.id).version;
        const first = json(roundReady(R1, fast.id));
        assert.deepEqual([first.ready, first.next_at, first.can_ready, first.done], [[R1], null, false, true]);
        assert.deepEqual(json(roundReady(R1, fast.id)).ready, [R1], 'podruhé beze změny');
        const seen = pulse(R2, fast.id);
        assert.deepEqual([seen.round.ready, seen.round.can_ready], [[R1], true]);
        assert.notEqual(seen.version, v0, 'značka verze se změnila');
        assert.deepEqual(json(roundReady(R1, fast.id, false)).ready, []);
        assert.deepEqual(json(roundReady(R1, fast.id, false)).ready, [], 'přestat podruhé beze změny');
        assert.deepEqual(json(roundReady(R1, fast.id)).ready, [R1]);
        // Poslední chce i R2: za 10 s začne další kolo; do té doby běží kolo 0 a tahy nikdo nemá
        clock = '2026-12-20T11:00:20Z';
        const go = roundView(json(roundReady(R2, fast.id)));
        assert.deepEqual(go, { period: 0, started_at: '2026-12-20T11:00:00.000Z', ends_at: '2026-12-20T11:00:30.000Z', done: true, ready: [R1, R2],
            next_at: '2026-12-20T11:00:30.000Z', can_ready: false, last: false });
        denied(roundReady(R1, fast.id, false), /Odpočet už běží, další kolo začne za chvíli\./, 'odpočet nejde zrušit');
        assert.equal(at(json(roundReady(R1, fast.id)).next_at), '2026-12-20T11:00:30.000Z', 'znovu chtít nic nezmění');
        assert.deepEqual(roundView(pulse(R1, fast.id).round).next_at, '2026-12-20T11:00:30.000Z');
        clock = '2026-12-20T11:00:29Z';
        st = json(state(R1, fast.id));
        assert.deepEqual([st.budget.period, st.budget.left, at(st.budget.period_ends_at)], [0, 0, '2026-12-20T11:00:30.000Z']);
        denied(move(R1, fast.id, 'Q213', 'fortify', true), /Tahy na tohle období už nemáš/);
        const vCountdown = pulse(R1, fast.id).version;
        // Nové kolo: znovu 2 tahy, nikdo zatím nechce další kolo, konec kola za 5 minut od předčasného začátku, konec hry stejný
        clock = '2026-12-20T11:00:31Z';
        st = json(state(R1, fast.id));
        assert.deepEqual([st.budget.period, st.budget.used, st.budget.left, at(st.budget.period_ends_at)], [1, 0, 2, '2026-12-20T11:05:30.000Z']);
        assert.deepEqual(roundView(st.round), { period: 1, started_at: '2026-12-20T11:00:30.000Z', ends_at: '2026-12-20T11:05:30.000Z', done: false, ready: [],
            next_at: null, can_ready: false, last: false });
        assert.equal(at(st.ends_at), '2026-12-20T11:20:00.000Z');
        assert.notEqual(pulse(R1, fast.id).version, vCountdown, 'nové kolo změní značku verze');
        assert.equal(json(state(R2, fast.id)).budget.left, 2);
        // Další kola jdou po 5 minutách od předčasného začátku
        clock = '2026-12-20T11:05:29Z';
        assert.equal(json(state(R1, fast.id)).budget.period, 1);
        clock = '2026-12-20T11:05:31Z';
        st = json(state(R1, fast.id));
        assert.deepEqual([st.budget.period, at(st.round.started_at), at(st.round.ends_at)], [2, '2026-12-20T11:05:30.000Z', '2026-12-20T11:10:30.000Z']);
    });

    await t.test('další kolo (blok 26): kořist, ztracený hrad, Návrat do hry a Pevnost v předčasném kole; hráč bez území kolo dohrál; upozornění o dalším kole', () => {
        // Kolo 2 (od 11:05:30): R1 má domov Rakousko s Pevností (+1 tah), R2 jen domov Slovinsko
        clearMap(fast.id);
        place(fast.id, 'Q40', R1, { home: true, level: 3 });
        place(fast.id, 'Q215', R2, { home: true });
        q(`update conquest_players set lost_period = null where game_id = '${fast.id}'`);
        let st = json(state(R1, fast.id));
        assert.deepEqual([st.budget.period, st.budget.fortress, st.budget.total], [2, 1, 3]);
        const taken = json(move(R1, fast.id, 'Q215', 'attack', true, 'Q40'));
        assert.deepEqual([taken.move.r, taken.move.h, taken.move.n], ['capture', true, 2]);
        // R2 nemá území (čeká na Návrat do hry): kolo dohrál, i když mu tahy zbývají
        const lost = json(state(R2, fast.id));
        assert.deepEqual([lost.territories.filter(item => item.o === R2).length, lost.budget.left, lost.round.done], [0, 2, false]);
        json(move(R1, fast.id, 'Q213', 'attack', false, 'Q40'));
        st = json(move(R1, fast.id, 'Q214', 'attack', false, 'Q40'));
        assert.deepEqual([st.budget.left, st.round.done, st.round.can_ready], [0, true, true]);
        assert.equal(json(state(R2, fast.id)).round.can_ready, true, 'i hráč bez území může chtít další kolo');
        // Upozornění pro R2 (rychlá hra): o dalším kole; jen útoky z posledních 30 minut
        const pushRows = () => { const text = q(`select title || '|' || body from conquest_push_items() where user_id = '${R2}'`); return text ? text.split('\n').map(line => line.split('|')) : []; };
        q(`update conquest_moves set at = now() - interval '20 minutes' where game_id = '${fast.id}' and kind = 'attack'`);
        assert.deepEqual(pushRows(), [['Dobývání: padl tvůj domovský hrad', 'Útočník: Rychlík. V dalším kole dostaneš nové domovské území, ale o tah méně.']]);
        q(`update conquest_moves set at = now() - interval '40 minutes' where game_id = '${fast.id}' and kind = 'attack'`);
        assert.deepEqual(pushRows(), [], 'v rychlé hře jen čerstvé útoky');
        // Oba chtějí další kolo v 11:06:00: kolo 3 začne v 11:06:10
        clock = '2026-12-20T11:06:00Z';
        ok(roundReady(R2, fast.id));
        assert.equal(at(json(roundReady(R1, fast.id)).next_at), '2026-12-20T11:06:10.000Z');
        assert.equal(json(state(R2, fast.id)).territories.filter(item => item.o === R2).length, 0, 'během odpočtu ještě bez Návratu do hry');
        // Kolo 3: R1 kořist a Pevnost (2 + 1 + 1), R2 Návrat do hry a o tah méně (2 − 1)
        clock = '2026-12-20T11:06:11Z';
        const back = json(state(R2, fast.id));
        assert.equal(back.budget.period, 3);
        assert.deepEqual(back.territories.filter(item => item.o === R2).map(item => item.h), [true], 'Návrat do hry');
        assert.ok(back.moves.some(m => m.r === 'respawn' && m.u === R2 && m.n === 3));
        assert.deepEqual([back.budget.penalty, back.budget.total], [1, 1]);
        const winner = json(state(R1, fast.id)).budget;
        assert.deepEqual([winner.period, winner.loot, winner.fortress, winner.total, winner.left], [3, 1, 1, 4, 4]);
        // Opakované spuštění schema.sql s rozehranou rychlou hrou a předčasnými koly nic nerozbije
        ok(psql(dbName, '', schema));
        assert.deepEqual([json(state(R1, fast.id)).budget.period, json(state(R1, fast.id)).budget.left, json(state(R1, fast.id)).minutes], [3, 4, 20]);
        // Kdo nemá co hrát (celá mapa jeho a všechno opevněné naplno), kolo dohrál, i když mu tahy zbývají
        const playerDone = (uid) => q(`set mudrlant.test_now = '${clock}'; select conquest_round_player_done(g, '${uid}') from conquest_games g where g.id = '${fast.id}'`);
        assert.equal(playerDone(R1), 'f', 'R1 má tahy a kam útočit');
        q(`update conquest_territories set owner = '${R1}', level = case when home then 3 else 2 end where game_id = '${fast.id}'`);
        assert.deepEqual([playerDone(R1), playerDone(R2), json(state(R1, fast.id)).round.done], ['t', 't', true]);
        assert.ok(json(state(R1, fast.id)).budget.left > 0);
        // Poslední kolo (kola 3, 4 a 5 od 11:06:10, kolo 5 končí s hrou v 11:20): další kolo chtít nejde
        clock = '2026-12-20T11:17:00Z';
        st = json(state(R1, fast.id));
        assert.deepEqual([st.round.period, st.round.last, at(st.round.ends_at), at(st.budget.period_ends_at)], [5, true, '2026-12-20T11:20:00.000Z', '2026-12-20T11:20:00.000Z']);
        q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result) select '${fast.id}', u, 5, 'fortify', 'Q40', false, 'fail'
            from unnest(array['${R1}', '${R2}']::uuid[]) u, generate_series(1, 6)`);
        st = json(state(R1, fast.id));
        assert.deepEqual([st.round.done, st.round.can_ready, st.round.last], [true, false, true]);
        denied(roundReady(R1, fast.id), /Tohle kolo je poslední\. Hra skončí, až vyprší čas\./);
        // Konec hry v ends_at jako dosud: kolo už není
        clock = '2026-12-20T11:20:01Z';
        const final = json(state(R1, fast.id));
        assert.deepEqual([final.status, final.round], ['finished', null]);
        assert.equal(pulse(R2, fast.id).round, null);
        denied(roundReady(R1, fast.id), /Hra už skončila\./);
        assert.equal(json(as(R1, `select conquest_claim('${fast.id}');`)).eligible, false, 'rychlá hra dvou hráčů odměnu nedává');
    });

    await t.test('rychlé hry (blok 26): pozvánka „hra na 20 minut“; Rychlá hra Blesk začne plná a hned se doplní', () => {
        clock = '2026-12-20T12:00:00Z';
        befriend(R1, R3);
        const lobbyGame = json(createFast(R1, { players: 3 }));
        ok(invite(R1, lobbyGame.id, [R3]));
        assert.deepEqual(q(`select body from conquest_invite_push_items() where user_id = '${R3}'`), 'Mapa Evropa · hra na 20 minut. Vyber si barvu a přidej se.');
        assert.equal(invitesOf(R3)[0].minutes, 20);
        ok(as(R1, `select conquest_leave('${lobbyGame.id}');`));
        const blesk = lobby(R1).open.find(g => g.preset === 'blesk-20m');
        [R1, R2, R3, DEV2].forEach((uid, i) => ok(join(uid, { game: blesk.id, colour: ['cervena', 'modra', 'zelena', 'zluta'][i], emblem: 'sova' })));
        const started = json(state(R1, blesk.id));
        assert.deepEqual([started.status, started.minutes, started.period, started.budget.left, at(started.round.ends_at)], ['running', 20, 'min5', 5, '2026-12-20T12:05:00.000Z']);
        assert.deepEqual([at(started.started_at), at(started.ends_at)], ['2026-12-20T12:00:00.000Z', '2026-12-20T12:20:00.000Z']);
        const fresh = lobby(R1).open.find(g => g.preset === 'blesk-20m');
        assert.ok(fresh && fresh.id !== blesk.id, 'nová Rychlá hra Blesk');
        q(`delete from conquest_games where id = '${blesk.id}'`);
    });

    await t.test('další kolo (blok 26): boti kolo dohrají, jakmile lidé dohráli, a chtějí další kolo sami; vývojářské další období posune i předčasná kola', () => {
        clock = '2026-12-21T08:00:00Z';
        q(`insert into dev_admins (user_id) values ('${DEV2}') on conflict do nothing`);
        const game = json(createFast(DEV2, { players: 4, actions: 2, colour: 'zluta' }));
        const summary = json(as(DEV2, `select dev_conquest_add_bots('${game.id}', 3);`));
        assert.equal(summary.status, 'running');
        const bots = summary.players.filter(p => !p.me).map(p => p.id);
        const botMoves = () => Number(q(`select count(*) from conquest_moves where game_id = '${game.id}' and user_id <> '${DEV2}' and kind in ('attack', 'fortify')`));
        let st = json(state(DEV2, game.id));
        assert.deepEqual([botMoves(), st.round.done, st.round.ready.length], [0, false, 3], 'boti zatím nehrají, ale další kolo chtějí');
        assert.deepEqual([...st.round.ready].sort(), [...bots].sort());
        const home = st.territories.find(item => item.o === DEV2 && item.h).t;
        json(move(DEV2, game.id, home, 'fortify', false));
        assert.equal(botMoves(), 0, 'dokud mám tah, boti hrají podle času');
        st = json(move(DEV2, game.id, home, 'fortify', false));
        assert.ok(botMoves() > 0, 'po mém posledním tahu boti hned dohráli');
        const idle = q(`set mudrlant.test_now = '${clock}'; select count(*) from conquest_players p where p.game_id = '${game.id}' and p.user_id <> '${DEV2}'
            and exists (select 1 from conquest_territories t where t.game_id = p.game_id and t.owner = p.user_id) and (conquest_budget(p.game_id, p.user_id) ->> 'left')::integer > 0`);
        assert.equal(idle, '0', 'botům s územím nezbyl žádný tah');
        assert.deepEqual([st.round.done, st.round.can_ready], [true, true]);
        // Jsem jediný člověk: moje Chci další kolo hned spustí odpočet
        clock = '2026-12-21T08:00:30Z';
        const go = json(roundReady(DEV2, game.id));
        assert.deepEqual([go.ready.length, at(go.next_at)], [4, '2026-12-21T08:00:40.000Z']);
        // Vývojářské další období během odpočtu: hra je o kolo dál (kolo 1) a o 5 minut kratší, odpočet skončil
        const endsBefore = Date.parse(json(state(DEV2, game.id)).ends_at);
        st = json(as(DEV2, `select dev_conquest_next_period('${game.id}');`));
        assert.deepEqual([st.budget.period, st.round.period, st.round.next_at, endsBefore - Date.parse(st.ends_at)], [1, 1, null, 5 * 60e3]);
        st = json(as(DEV2, `select dev_conquest_next_period('${game.id}');`));
        assert.deepEqual([st.budget.period, st.budget.used, st.round.period], [2, 0, 2]);
        ok(as(DEV2, 'select dev_tournament_clear_bots();'));
        assert.equal(q(`select count(*) from conquest_games where id = '${game.id}'`), '0');
    });
});
// Osmý hráč scénáře (Rychlá hra Česko)
function H() { return id(8); }
