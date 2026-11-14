// Pomůcky do Dobývání v databázi (PostgreSQL 16, blok „30: Dobývání – pomůcky“): Tah navíc (nejvýš 1) a Půl na půl (nejvýš 2).
// Zisk jednou za klíč zdroje a se stropem (Boss týdne, Kvíz dne bez chyby a celá Řetězovka nejvýš jednou za ISO týden, výhra v Dobývání,
// 5. a 15. stupeň Sezóny Mudrlanta jen v tomto a minulém měsíci, Truhla Mudrlanta s losem 5 % jednou za týden), plná zásoba (týdenní
// klíče se zkusí znovu, sezóna a truhla ne), boti nic; použití ve hře (Tah navíc jednou za hru, ne v posledním kole, ne v odpočtu, ne bez
// území, přidá právě jeden tah, je v kronice a v tazích všech; Půl na půl jednou za hru, v bitvě vybere server dvě nesprávné možnosti
// a ostatní účastníci vidí, že ji hráč použil); pravidla řádků, oprávnění, export a smazání účtu. Spouští se jen s psql a serverem
// (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_pomucky_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Hodiny (mudrlant.test_now: boss, Dobývání, pomůcky, Řetězovka) a den Kvízu dne (mudrlant.test_today)
let clock = '2026-11-12T10:00:00Z';
let today = '2026-11-12';
const as = (uid, sql, role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${clock}'; set mudrlant.test_today = '${today}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const lit = (text) => (text === null ? 'null' : `'${String(text).replace(/'/g, "''")}'`);
const mine = (uid) => { const items = json(as(uid, 'select player_items_mine();')); return [items.extra_move, items.fifty]; };
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
// Dobývání
const create = (uid, { map = 'evropa', players = 2, hours = 0, minutes = 20, per = 'min5', actions = 2, vis = 'private', colour = 'cervena', emblem = 'lev' } = {}) =>
    as(uid, `select conquest_create(${lit(map)}, ${players}, ${hours}, ${lit(per)}, ${actions}, ${lit(vis)}, ${lit(colour)}, ${lit(emblem)}, ${minutes === null ? 'null' : minutes});`);
const join = (uid, code, colour = 'modra') => as(uid, `select conquest_join(null, ${lit(code)}, ${lit(colour)}, 'orel');`);
const state = (uid, game) => json(as(uid, `select conquest_state(${lit(game)});`));
const move = (uid, game, target, kind, correct) => as(uid, `select conquest_move(${lit(game)}, ${lit(target)}, ${lit(kind)}, ${correct}, null);`);
const useExtra = (uid, game) => as(uid, `select conquest_use_extra(${lit(game)});`);
const useFifty = (uid, game, { siege = null, target = null } = {}) => as(uid, `select conquest_use_fifty(${lit(game)}, ${siege ? `${lit(siege)}::uuid` : 'null'}, ${lit(target)});`);
const place = (game, territory, owner, { level = 0, home = false } = {}) =>
    q(`update conquest_territories set owner = ${owner ? lit(owner) : 'null'}, level = ${level}, home = ${home}, treasure = false where game_id = ${lit(game)} and territory = ${lit(territory)}`);
const clearMap = (game) => q(`update conquest_territories set owner = null, level = 0, home = false, treasure = false where game_id = ${lit(game)}`);
const QUESTION = { kind: 'flag', prompt: 'Čí je tahle vlajka?', choices: [{ label: 'Slovensko', correct: true }, { label: 'Slovinsko' }, { label: 'Srbsko' }, { label: 'Rusko' }] };
const begin = (uid, game, target, { question = QUESTION, correct = 0 } = {}) =>
    as(uid, `select conquest_siege_begin(${lit(game)}, ${lit(target)}, ${lit(JSON.stringify(question))}::jsonb, ${correct}::smallint, null);`);
const joinSiege = (uid, siege) => as(uid, `select conquest_siege_join(${lit(siege)}, null);`);
const answer = (uid, siege, choice) => as(uid, `select conquest_siege_answer(${lit(siege)}, ${choice}::smallint);`);
// Rychlá hra (kolo 5 minut, 20 minut = 4 kola, 2 tahy za kolo), plná hra začne sama; mapa: první Česko, druhý Polsko, třetí Slovensko
const newGame = (a = A, b = B, options = {}, c = null) => {
    const game = json(create(a, { ...options, players: c ? 3 : 2 }));
    ok(join(b, game.code));
    if (c) ok(join(c, game.code, 'zelena'));
    clearMap(game.id);
    place(game.id, 'Q213', a, { home: true });
    place(game.id, 'Q36', b, { home: true });
    if (c) place(game.id, 'Q214', c, { home: true });
    return game;
};

test('SQL: pomůcky do Dobývání', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q([A, B, C, D, E].map((uid, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    q(`insert into auth.users (id, email, raw_user_meta_data) values ('${BOT}', 'bot-${BOT}@bots.invalid', '{"full_name": "Bot Adam"}')`);

    await t.test('tabulky jen přes funkce: pravidla řádků, strop v kontrole, oprávnění funkcí; anon nic', () => {
        for (const table of ['player_items', 'player_item_grants']) {
            assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`), 't', table);
            denied(as(A, `insert into ${table} (user_id, kind) values ('${A}', 'fifty');`), /permission denied/, `${table}: zápis jen přes funkce`);
            denied(as(A, `update ${table} set kind = 'fifty';`), /permission denied/);
            denied(as(A, `delete from ${table};`), /permission denied/);
        }
        const can = (role, fn) => q(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`);
        for (const fn of ['player_items_mine()', 'player_items_claim(text, text)', 'conquest_use_extra(uuid)', 'conquest_use_fifty(uuid, uuid, text)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['t', 'f', 'f'], fn);
        }
        for (const fn of ['player_items_now()', 'player_items_week(date)', 'player_item_cap(text)', 'player_items_json(uuid)', 'player_item_grant(uuid, text, text, boolean)',
            'player_item_lucky(uuid, text)', 'conquest_extra_block(public.conquest_games, uuid)', 'conquest_items_json(public.conquest_games, uuid)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['f', 'f', 'f'], fn);
        }
        denied(as(A, `select player_item_grant('${A}', 'fifty', 'daily:2026-W46', false);`), /permission denied/, 'zisk jen ze serveru');
        for (const sql of ['select player_items_mine();', `select player_items_claim('season', 'season:2026-11:5');`, 'select * from player_items;']) denied(as(null, sql, 'anon'), null, sql);
        denied(as(null, 'select player_items_mine();'), /Přihlas se/);
        assert.deepEqual(json(as(A, 'select player_items_mine();')), { extra_move: 0, fifty: 0, max: { extra_move: 1, fifty: 2 } });
        // Strop: Tah navíc nejvýš 1, Půl na půl nejvýš 2 (ani správce databáze víc nezapíše)
        for (const [kind, count] of [['extra_move', 2], ['fifty', 3], ['fifty', -1], ['jiny', 1]]) {
            const r = psql(dbName, `insert into player_items (user_id, kind, count) values ('${E}', '${kind}', ${count})`);
            assert.notEqual(r.status, 0, `${kind} ${count}`);
            assert.match(r.stderr, /player_items_values/);
        }
        const bad = psql(dbName, `insert into player_item_grants (user_id, key, kind, granted) values ('${E}', 'cokoli:1', 'fifty', true)`);
        assert.match(bad.stderr, /player_item_grants_values/, 'jen známé klíče');
        // Boti nic nedostanou
        assert.equal(q(`select player_item_grant('${BOT}', 'fifty', 'daily:2026-W46', false) is null`), 't');
        denied(claim(BOT, 'season', 'season:2026-11:5'), /Boti pomůcky nedostávají/);
        assert.equal(q(`select count(*) from player_items where user_id = '${BOT}'`), '0');
    });

    await t.test('Boss týdne: první výhra v týdnu dá Tah navíc (jednou), plná zásoba nic navíc', () => {
        clock = '2026-11-12T12:00:00Z';
        const week = '2026-11-09';
        const lost = json(as(A, `select boss_submit('${week}', 0, 300, false);`));
        assert.equal(lost.item, undefined, 'prohra nic');
        const won = json(as(A, `select boss_submit('${week}', 1, 700, true);`));
        assert.equal(won.first_win, true);
        assert.deepEqual(pick(won.item), ['extra_move', true, false, false, 1]);
        assert.equal(won.item.max, 1);
        // Opakované odeslání téhož pokusu ani další výhra téhož týdne nic nedá
        assert.equal(json(as(A, `select boss_submit('${week}', 1, 700, true);`)).item, undefined);
        assert.equal(json(as(A, `select boss_submit('${week}', 2, 700, true);`)).item, undefined);
        assert.deepEqual(mine(A), [1, 0]);
        // Další týden: Tah navíc už má → „plno“, nic nepřibude, klíč týdne je hotový
        clock = '2026-11-17T12:00:00Z';
        const full = json(as(A, `select boss_submit('2026-11-16', 0, 700, true);`));
        assert.deepEqual(pick(full.item), ['extra_move', false, true, false, 1]);
        assert.deepEqual(mine(A), [1, 0]);
        assert.equal(q(`select string_agg(key || '=' || granted, ',' order by key) from player_item_grants where user_id = '${A}'`), 'boss:2026-11-09=true,boss:2026-11-16=false');
    });

    await t.test('Kvíz dne bez chyby: Půl na půl nejvýš jednou za ISO týden; s plnou zásobou se v týdnu zkusí znovu; s chybou nic', () => {
        const play = (uid, day, mask) => {
            today = day;
            json(as(uid, 'select daily_quiz_start();'));
            let lastResult = null;
            [...mask].forEach((bit, idx) => { lastResult = json(as(uid, `select daily_quiz_answer('${day}', ${idx}, ${bit === '1'}, ${bit === '1' ? 3 : 0}, 3000);`)); });
            return lastResult;
        };
        // Čtvrtek 12. 11. 2026 (týden 46): bez chyby → Půl na půl
        const first = play(B, '2026-11-12', '1111111111');
        assert.equal(first.finished, true);
        assert.deepEqual(pick(first.item), ['fifty', true, false, false, 1]);
        // Pátek téhož týdne: znovu bez chyby → klíč týdne už je použitý, nic nepřibude
        assert.deepEqual(pick(play(B, '2026-11-13', '1111111111').item), ['fifty', true, false, true, 1]);
        assert.deepEqual(mine(B), [0, 1]);
        // S chybou nic
        assert.equal(play(B, '2026-11-16', '1111111110').item, undefined);
        // Další týden bez chyby → druhá; týden potom plno, pak se jedna použije a další kvíz bez chyby téhož týdne ji vrátí
        assert.deepEqual(pick(play(B, '2026-11-17', '1111111111').item), ['fifty', true, false, false, 2]);
        assert.deepEqual(pick(play(B, '2026-11-23', '1111111111').item), ['fifty', false, true, false, 2]);
        setStock(B, 'fifty', 1);
        assert.deepEqual(pick(play(B, '2026-11-24', '1111111111').item), ['fifty', true, false, false, 2]);
        assert.deepEqual(pick(play(B, '2026-11-25', '1111111111').item), ['fifty', true, false, true, 2], 'v týdnu jen jednou');
        assert.equal(q(`select string_agg(key, ',' order by key) from player_item_grants where user_id = '${B}' and granted`), 'daily:2026-W46,daily:2026-W47,daily:2026-W48');
        // Mezi odpověďmi uprostřed kvízu pomůcka není
        today = '2026-11-12';
        json(as(C, 'select daily_quiz_start();'));
        assert.equal(json(as(C, `select daily_quiz_answer('2026-11-12', 0, true, 3, 3000);`)).item, undefined);
    });

    await t.test('Řetězovka: celý řetěz (7 článků) dá Půl na půl nejvýš jednou za ISO týden; kratší ani opakované odeslání nic', () => {
        const submit = (uid, day, links) => { clock = `${day}T12:00:00Z`; return json(as(uid, `select chain_submit('${day}', ${links}, ${links * (links + 1) / 2}, false);`)); };
        assert.equal(submit(C, '2026-11-12', 6).item, undefined);
        assert.deepEqual(pick(submit(C, '2026-11-13', 7).item), ['fifty', true, false, false, 1]);
        assert.equal(json(as(C, `select chain_submit('2026-11-13', 7, 28, false);`)).item, undefined, 'druhé odeslání téhož dne nic');
        assert.deepEqual(pick(submit(C, '2026-11-14', 7).item), ['fifty', true, false, true, 1], 'týden 46 už má');
        assert.deepEqual(pick(submit(C, '2026-11-16', 7).item), ['fifty', true, false, false, 2], 'pondělí = nový týden');
        assert.equal(q(`select string_agg(key, ',' order by key) from player_item_grants where user_id = '${C}'`), 'chain:2026-W46,chain:2026-W47');
    });

    await t.test('Sezóna Mudrlanta: 5. stupeň Půl na půl, 15. stupeň Tah navíc, jednou za klíč, jen tento a minulý měsíc; plná zásoba = věc (klíč hotový)', () => {
        clock = '2026-11-20T10:00:00Z';
        const r5 = json(claim(D, 'season', 'season:2026-11:5'));
        assert.deepEqual(pick(r5), ['fifty', true, false, false, 1]);
        assert.deepEqual(r5.items, { extra_move: 0, fifty: 1, max: { extra_move: 1, fifty: 2 } });
        assert.deepEqual(pick(json(claim(D, 'season', 'season:2026-11:5'))), ['fifty', true, false, true, 1], 'jednou za klíč (druhé zařízení dostane totéž)');
        assert.deepEqual(pick(json(claim(D, 'season', 'season:2026-11:15'))), ['extra_move', true, false, false, 1]);
        // Minulý měsíc ještě jde (dovybrání), starší ne; jiné stupně, tvary a zdroje ne
        assert.deepEqual(pick(json(claim(D, 'season', 'season:2026-10:5'))), ['fifty', true, false, false, 2]);
        denied(claim(D, 'season', 'season:2026-09:5'), /Tahle sezóna už skončila\./);
        denied(claim(D, 'season', 'season:2026-12:5'), /Tahle sezóna už skončila\./);
        for (const key of ['season:2026-11:10', 'season:2026-11:20', 'season:2026-11', 'chest:2026-W47', null]) denied(claim(D, 'season', key), /Pomůcku dává jen 5\. a 15\. stupeň sezóny\./, String(key));
        denied(claim(D, 'boss', 'boss:2026-11-16'), /Neznámý zdroj pomůcky\./, 'Boss, Kvíz dne a Řetězovku počítá server sám');
        // Plno: 15. stupeň minulé sezóny nic nepřidá (aplikace dá běžnou věc) a později to už nezkusí znovu
        const full = json(claim(D, 'season', 'season:2026-10:15'));
        assert.deepEqual(pick(full), ['extra_move', false, true, false, 1]);
        setStock(D, 'extra_move', 0);
        assert.deepEqual(pick(json(claim(D, 'season', 'season:2026-10:15'))), ['extra_move', false, true, true, 0], 'stupeň už dal věc');
        assert.deepEqual(mine(D), [0, 2]);
        // Leden: prosinec je minulý měsíc (přes konec roku)
        clock = '2027-01-03T10:00:00Z';
        assert.deepEqual(pick(json(claim(D, 'season', 'season:2026-12:15'))), ['extra_move', true, false, false, 1]);
        denied(claim(D, 'season', 'season:2026-11:15'), /skončila/);
    });

    await t.test('Truhla Mudrlanta: los 5 % na serveru, jednou za týden (nový los nejde), jen tento nebo minulý týden; plno nic', () => {
        clock = '2026-11-20T10:00:00Z';
        const week = 'chest:2026-W47';
        denied(claim(E, 'chest', 'chest:2026-W40'), /Truhla patří k jinému týdnu\./);
        denied(claim(E, 'chest', 'chest:2026-11-20'), /Truhla patří k jinému týdnu\./);
        // Los je pevný pro hráče a týden: najdi hráče se štěstím a bez něj
        const users = Array.from({ length: 120 }, (_, i) => id(200 + i));
        q(`insert into auth.users (id, email) select u, 'l' || u || '@example.com' from unnest(array[${users.map(lit).join(', ')}]::uuid[]) u`);
        const lucky = q(`select string_agg(u::text, ',') from unnest(array[${users.map(lit).join(', ')}]::uuid[]) u where player_item_lucky(u, '${week}')`).split(',').filter(Boolean);
        assert.ok(lucky.length >= 1 && lucky.length <= 20, `zhruba 5 %: ${lucky.length} ze 120`);
        const unlucky = users.find(u => !lucky.includes(u));
        const no = json(claim(unlucky, 'chest', week));
        assert.deepEqual([no.granted, no.lucky, no.items.fifty], [false, false, 0]);
        assert.deepEqual([json(claim(unlucky, 'chest', week)).granted, json(claim(unlucky, 'chest', week)).already], [false, true], 'nový los nejde');
        const yes = json(claim(lucky[0], 'chest', week));
        assert.deepEqual([yes.granted, yes.lucky, yes.count, yes.items.fifty], [true, true, 1, 1]);
        assert.deepEqual([json(claim(lucky[0], 'chest', week)).granted, json(claim(lucky[0], 'chest', week)).already, mine(lucky[0])[1]], [true, true, 1], 'jen jednou za týden');
        // Minulý týden ještě jde (truhla otevřená po půlnoci z neděle na pondělí)
        assert.equal(claim(lucky[0], 'chest', 'chest:2026-W46').status, 0);
        // Plná zásoba: se štěstím nic nepřibude
        const another = lucky.find(u => u !== lucky[0]) || null;
        if (another) {
            setStock(another, 'fifty', 2);
            const full = json(claim(another, 'chest', week));
            assert.deepEqual([full.granted, full.full, full.count], [false, true, 2]);
        }
    });

    let game;
    await t.test('Tah navíc ve hře: +1 tah právě v tomto kole, kronika a tahy všech; jednou za hru; zásoba o 1 méně', () => {
        clock = '2026-12-01T10:00:00Z';
        setStock(A, 'extra_move', 1);
        game = newGame();
        let st = state(A, game.id);
        assert.deepEqual([st.items.extra_move, st.items.fifty, st.items.extra_used, st.items.fifty_used, st.items.can_extra, st.items.extra_block], [1, 0, false, false, true, null]);
        assert.deepEqual([st.budget.total, st.budget.left, st.budget.extra], [2, 2, 0]);
        assert.equal(state(B, game.id).items.can_extra, false, 'B Tah navíc nemá');
        assert.equal(state(B, game.id).items.extra_block, 'Tah navíc teď nemáš.');
        ok(move(A, game.id, 'Q214', 'attack', true));
        ok(move(A, game.id, 'Q40', 'attack', false));
        assert.equal(state(A, game.id).budget.left, 0);
        clock = '2026-12-01T10:01:00Z';
        st = json(useExtra(A, game.id));
        assert.equal(st.used, 'extra_move');
        assert.deepEqual([st.budget.total, st.budget.used, st.budget.left, st.budget.extra], [3, 2, 1, 1]);
        assert.deepEqual([st.items.extra_move, st.items.extra_used, st.items.can_extra], [0, true, false]);
        const extra = st.moves.filter(m => m.k === 'extra');
        assert.deepEqual(extra.map(m => [m.u, m.t, m.r, m.n, m.ok]), [[A, null, 'extra', 0, true]], 'v kronice bez území');
        // Ostatní to vidí: kronika a tahy hráče (budgets.extra)
        const other = state(B, game.id);
        assert.deepEqual(other.budgets[A], { left: 1, total: 3, extra: 1 });
        assert.deepEqual(other.budgets[B], { left: 2, total: 2, extra: 0 });
        assert.equal(other.moves.filter(m => m.k === 'extra').length, 1);
        // Právě jeden tah navíc: odehraje ho a víc nejde
        ok(move(A, game.id, 'Q213', 'fortify', true));
        denied(move(A, game.id, 'Q213', 'fortify', true), /Tahy na tohle období už nemáš/);
        // Jednou za hru (i s novou zásobou)
        setStock(A, 'extra_move', 1);
        denied(useExtra(A, game.id), /Tah navíc jde v jedné hře použít jen jednou\./);
        assert.deepEqual(mine(A), [1, 0], 'zásoba se neubrala');
        // Další kolo: Tah navíc už nepočítá (jen v kole, kdy se použil)
        clock = '2026-12-01T10:05:01Z';
        st = state(A, game.id);
        assert.deepEqual([st.budget.period, st.budget.total, st.budget.extra], [1, 2, 0]);
        denied(useExtra(C, game.id), /nehraješ/);
        denied(as(null, `select conquest_use_extra('${game.id}');`, 'anon'), null);
    });

    await t.test('Tah navíc: ne v posledním kole, ne během odpočtu do dalšího kola, ne bez území, ne bez zásoby; kdo chtěl další kolo, hraje dál', () => {
        clock = '2026-12-02T10:00:00Z';
        const g2 = newGame(B, C);
        setStock(B, 'extra_move', 0);
        denied(useExtra(B, g2.id), /Tah navíc teď nemáš\./);
        setStock(B, 'extra_move', 1);
        // Bez území (čeká na Návrat do hry)
        place(g2.id, 'Q36', null);
        place(g2.id, 'Q213', null);
        q(`update conquest_territories set owner = '${C}' where game_id = '${g2.id}' and territory = 'Q183'`);
        assert.equal(state(B, g2.id).items.extra_block, 'Bez území Tah navíc použít nejde. Počkej na Návrat do hry.');
        denied(useExtra(B, g2.id), /Bez území Tah navíc použít nejde\./);
        place(g2.id, 'Q213', B, { home: true });
        // Kolo dohrané, B chce další kolo, pak použije Tah navíc: značka zmizí a kolo zase není hotové
        ok(move(B, g2.id, 'Q214', 'attack', true));
        ok(move(B, g2.id, 'Q213', 'fortify', true));
        ok(move(C, g2.id, 'Q183', 'fortify', true));
        ok(move(C, g2.id, 'Q183', 'fortify', true));
        let st = state(B, g2.id);
        assert.deepEqual([st.round.done, st.round.can_ready], [true, true]);
        ok(as(B, `select conquest_round_ready('${g2.id}', true);`));
        assert.deepEqual(state(C, g2.id).round.ready, [B]);
        st = json(useExtra(B, g2.id));
        assert.deepEqual([st.round.done, st.round.ready, st.budget.left], [false, [], 1]);
        // Odpočet do dalšího kola: Tah navíc nejde (ve hře C)
        setStock(C, 'extra_move', 1);
        ok(move(B, g2.id, 'Q213', 'fortify', true));
        ok(as(B, `select conquest_round_ready('${g2.id}', true);`));
        ok(as(C, `select conquest_round_ready('${g2.id}', true);`));
        assert.ok(state(C, g2.id).round.next_at, 'odpočet běží');
        assert.equal(state(C, g2.id).items.extra_block, 'Další kolo právě začíná. Tah navíc použij až v něm.');
        denied(useExtra(C, g2.id), /Další kolo právě začíná\./);
        // Poslední kolo hry: nejde (odpočet zkrátil hru o přeskočený zbytek kola: konec 10:15:10, poslední kolo od 10:10:10)
        clock = '2026-12-02T10:12:00Z';
        st = state(C, g2.id);
        assert.equal(st.round.last, true);
        assert.equal(st.items.can_extra, false);
        denied(useExtra(C, g2.id), /V posledním kole hry Tah navíc použít nejde\./);
        assert.deepEqual(mine(C).slice(0, 1), [1]);
        // Hra na hodiny: poslední hodina se pozná stejně (konec kola = konec hry)
        clock = '2026-12-03T10:00:00Z';
        setStock(D, 'extra_move', 1);
        const hourly = newGame(D, E, { per: 'hour', hours: 6, minutes: null });
        assert.equal(state(D, hourly.id).items.can_extra, true);
        clock = '2026-12-03T15:10:00Z';
        assert.equal(state(D, hourly.id).items.extra_block, 'V posledním kole hry Tah navíc použít nejde.');
        clock = '2026-12-03T14:50:00Z';
        assert.equal(json(useExtra(D, hourly.id)).budget.extra, 1, 'předposlední hodina ještě jde');
    });

    await t.test('Půl na půl bez bitvy (opevnění): jednou za hru, opakované volání před tahem nic dalšího neubere', () => {
        clock = '2026-12-05T10:00:00Z';
        setStock(A, 'fifty', 2);
        const g3 = newGame(A, B, { per: 'day', hours: 72, minutes: null, actions: 3 });
        denied(useFifty(A, g3.id, { target: 'Q999' }), /Tohle území na mapě není\./);
        const used = json(useFifty(A, g3.id, { target: 'Q213' }));
        assert.deepEqual([used.removed, used.fifty_used, used.items.fifty], [null, true, 1]);
        assert.deepEqual(json(useFifty(A, g3.id, { target: 'Q213' })).items.fifty, 1, 'stejná otázka: nic dalšího');
        assert.equal(state(A, g3.id).items.fifty_used, true);
        ok(move(A, g3.id, 'Q213', 'fortify', true));
        denied(useFifty(A, g3.id, { target: 'Q213' }), /Půl na půl jde v jedné hře použít jen jednou\./);
        denied(useFifty(A, g3.id, { target: 'Q214' }), /jen jednou/);
        assert.deepEqual(mine(A)[1], 1);
        setStock(B, 'fifty', 0);
        denied(useFifty(B, g3.id, { target: 'Q36' }), /Půl na půl teď nemáš\./);
    });

    await t.test('Půl na půl v bitvě: server odebere dvě nesprávné možnosti (správnou neprozradí), ostatní vidí ½; po odpovědi ani u mapy ne', () => {
        clock = '2026-12-06T10:00:00Z';
        setStock(A, 'fifty', 2);
        setStock(B, 'fifty', 1);
        // Slovensko (C) je cíl, sousedí s Českem (A) i Polskem (B)
        const g4 = newGame(A, B, { per: 'day', hours: 72, minutes: null, actions: 5 }, C);
        const s = json(begin(A, g4.id, 'Q214', { correct: 2 }));
        clock = '2026-12-06T10:00:05Z';
        const j = json(joinSiege(B, s.id));
        assert.equal(j.removed, null);
        const r = json(useFifty(A, g4.id, { siege: s.id }));
        assert.equal(r.removed.length, 2);
        assert.ok(!r.removed.includes(2) && r.removed.every(i => i >= 0 && i < 4) && r.removed[0] < r.removed[1], JSON.stringify(r.removed));
        assert.deepEqual(json(useFifty(A, g4.id, { siege: s.id })).removed, r.removed, 'opakované volání vrátí totéž');
        assert.equal(r.items.fifty, 1);
        assert.deepEqual(json(as(A, `select conquest_siege_status('${s.id}');`)).removed, r.removed, 'po návratu do bitvy zůstane');
        // Ostatní vidí, že Půl na půl použil (ne které možnosti)
        const seen = json(as(B, `select conquest_siege_status('${s.id}');`));
        assert.deepEqual(seen.participants.map(p => [p.id, p.fifty]), [[A, true], [B, false]]);
        assert.equal(seen.removed, null);
        const pulse = json(as(C, `select conquest_pulse('${g4.id}');`));
        assert.deepEqual(pulse.sieges[0].participants.map(p => p.fifty), [true, false]);
        // B odpoví, pak už Půl na půl nejde
        ok(answer(B, s.id, 1));
        denied(useFifty(B, g4.id, { siege: s.id }), /Na tuhle otázku už Půl na půl použít nejde\./);
        assert.equal(mine(B)[1], 1);
        // Cizí bitva a cizí hra ne; jednou za hru i jinde
        denied(useFifty(C, g4.id, { siege: s.id }), /V téhle bitvě nebojuješ\./);
        denied(useFifty(A, g4.id, { target: 'Q213' }), /jen jednou/);
        // Výsledek bitvy ukáže ½ u toho, kdo ji použil
        const done = json(answer(A, s.id, 2));
        assert.equal(done.status, 'resolved');
        assert.deepEqual(done.siege.participants.map(p => [p.id, p.fifty, p.winner]), [[A, true, true], [B, false, false]]);
        // Mapa, letopočet a odhad čísla ne
        clock = '2026-12-06T11:00:00Z';
        const map = { kind: 'map', prompt: 'Kde leží Brno?', choices: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }] };
        setStock(B, 'fifty', 1);
        const s2 = json(begin(B, g4.id, 'Q214', { question: map, correct: 0 }));
        denied(useFifty(B, g4.id, { siege: s2.id }), /U téhle otázky Půl na půl použít nejde\./);
    });

    await t.test('výhra ve hře Dobývání: vítěz s aspoň 3 tahy dostane Půl na půl (conquest_claim ho řekne jednou), druhý ne; bez tahů ne', () => {
        clock = '2026-12-10T10:00:00Z';
        setStock(D, 'fifty', 0);
        setStock(E, 'fifty', 0);
        const g5 = newGame(D, E);
        ok(move(D, g5.id, 'Q214', 'attack', true));
        ok(move(D, g5.id, 'Q40', 'attack', true));
        clock = '2026-12-10T10:05:01Z';
        ok(move(D, g5.id, 'Q28', 'attack', true));
        clock = '2026-12-10T10:21:00Z';
        const won = json(as(D, `select conquest_claim('${g5.id}');`));
        assert.deepEqual([won.place, won.claimed_now], [1, true]);
        assert.deepEqual(pick(won.item), ['fifty', true, false, false, 1]);
        assert.equal(json(as(D, `select conquest_claim('${g5.id}');`)).item, undefined, 'jen jednou');
        const second = json(as(E, `select conquest_claim('${g5.id}');`));
        assert.deepEqual([second.place, second.item], [2, undefined]);
        assert.deepEqual(mine(E), [0, 0]);
        // Vítěz bez 3 vlastních tahů nic
        clock = '2026-12-11T10:00:00Z';
        const g6 = newGame(D, E);
        place(g6.id, 'Q214', D, {});
        clock = '2026-12-11T10:21:00Z';
        const lazy = json(as(D, `select conquest_claim('${g6.id}');`));
        assert.deepEqual([lazy.place, lazy.item], [1, undefined]);
        assert.deepEqual(mine(D)[1], 1);
        // Lobby ukáže zásobu
        assert.deepEqual(json(as(D, 'select conquest_lobby();')).items, { extra_move: 0, fifty: 1, max: { extra_move: 1, fifty: 2 } });
    });

    await t.test('export dat má pomůcky (zásoba a odkud přišly), smazání účtu je smaže', () => {
        const exported = json(as(B, 'select export_my_data();'));
        assert.deepEqual(exported.pomucky.zasoba.map(row => [row.kind, row.count]).sort(), [['extra_move', mine(B)[0]], ['fifty', mine(B)[1]]]);
        assert.ok(exported.pomucky.ziskane.some(row => row.key === 'daily:2026-W46' && row.granted));
        assert.ok(exported.pomucky.ziskane.every(row => row.user_id === B));
        assert.equal(last(ok(as(B, 'select count(*) from player_items;'))), '2', 'jen vlastní řádky');
        ok(as(B, 'select delete_my_account();'));
        assert.equal(q(`select count(*) from player_items where user_id = '${B}'`), '0');
        assert.equal(q(`select count(*) from player_item_grants where user_id = '${B}'`), '0');
    });
});
