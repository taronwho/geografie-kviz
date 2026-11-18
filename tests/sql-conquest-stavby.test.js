// Stavby, ozdoby a další sady hradů v Dobývání (PostgreSQL 16, blok „41: Dobývání – stavby, ozdoby a další sady hradů“,
// docs/DOBYVANI-STAVBY.md): Postavit (opevnění, strážní věž, důl) i neplatné případy, obrana strážní věží odkudkoli (odražený útok,
// vítězný útočník věž zbourá, bitva na obránce počká), upozornění „Útok na tvé území, braň ho!“, důl za 2 body i po dobytí, padlé opevnění,
// odemčení Perníkového hradu, Parostrojní pevnosti a Ledového paláce, boti se stavbami, verze 41. Spouští se jen s psql a serverem
// (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_stavby_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const ROOT = path.join(__dirname, '..');
const schema = path.join(ROOT, 'supabase', 'schema.sql');
const C = require('../conquest.js');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
let clock = '2026-12-10T07:00:00Z';
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
const at = (seconds) => new Date(Date.parse('2026-12-10T07:00:00Z') + seconds * 1000).toISOString();

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

// A útočí z Česka, T drží Slovensko (věž), Rakousko (důl) a Maďarsko, domov má daleko v Norsku; B drží Polsko
const [A, T, B, U1, U2, U3, ADMIN] = [1, 2, 3, 4, 5, 6, 7].map(id);
const QUESTION = { kind: 'flag', prompt: 'Čí je tahle vlajka?', choices: [{ label: 'Slovensko', correct: true }, { label: 'Slovinsko' }, { label: 'Srbsko' }, 'Rusko'] };
const create = (uid, { players = 3, hours = 72, per = 'day', actions = 10, colour = 'cervena', emblem = 'lev' } = {}) =>
    as(uid, `select conquest_create('evropa', ${players}, ${hours}, ${lit(per)}, ${actions}, 'private', ${lit(colour)}, ${lit(emblem)});`);
const join = (uid, code, colour) => as(uid, `select conquest_join(null, ${lit(code)}, ${lit(colour)}, 'orel');`);
const move = (uid, game, target, kind, correct = true) => as(uid, `select conquest_move(${lit(game)}, ${lit(target)}, ${lit(kind)}, ${correct}, null);`);
const begin = (uid, game, target) => as(uid, `select conquest_siege_begin(${lit(game)}, ${lit(target)}, ${lit(JSON.stringify(QUESTION))}::jsonb, 0::smallint, null);`);
const joinSiege = (uid, siege) => as(uid, `select conquest_siege_join(${lit(siege)}, null);`);
const answer = (uid, siege, choice) => json(as(uid, `select conquest_siege_answer(${lit(siege)}, ${choice}::smallint);`));
const pulse = (uid, game) => json(as(uid, `select conquest_pulse(${lit(game)});`));
const row = (game, territory) => q(`select coalesce(owner::text, '-') || '|' || level || '|' || coalesce(building, '-') from conquest_territories where game_id = ${lit(game)} and territory = ${lit(territory)}`);
const score = (game, uid) => Number(q(`select score from conquest_players where game_id = ${lit(game)} and user_id = ${lit(uid)}`));
const left = (game, uid) => Number(q(`set mudrlant.test_now = '${clock}'; select conquest_budget(${lit(game)}, ${lit(uid)}) ->> 'left'`));
const place = (game, territory, owner, { level = 0, home = false, building = null } = {}) =>
    q(`update conquest_territories set owner = ${owner ? lit(owner) : 'null'}, level = ${level}, home = ${home}, treasure = false, building = ${lit(building)} where game_id = ${lit(game)} and territory = ${lit(territory)}`);

test('SQL: stavby a ozdoby v Dobývání (blok 41)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q([[A, 'Alfa'], [T, 'Věžník'], [B, 'Beta'], [U1, 'Perník'], [U2, 'Pára'], [U3, 'Led'], [ADMIN, 'Správce']]
        .map(([uid, name], i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "${name}"}');`).join('\n'));
    q(`insert into dev_admins (user_id) values ('${ADMIN}')`);

    let game;
    const map = () => {
        q(`update conquest_territories set owner = null, level = 0, home = false, treasure = false, building = null where game_id = '${game.id}';
           delete from conquest_sieges where game_id = '${game.id}'; delete from conquest_moves where game_id = '${game.id}' and kind <> 'home';`);
        place(game.id, 'Q213', A, { home: true });   // Česko
        place(game.id, 'Q20', T, { home: true });    // Norsko (daleko od Slovenska)
        place(game.id, 'Q214', T);                   // Slovensko
        place(game.id, 'Q40', T);                    // Rakousko
        place(game.id, 'Q28', T);                    // Maďarsko
        place(game.id, 'Q36', B, { home: true });    // Polsko
        q(`set mudrlant.test_now = '${clock}'; select conquest_rescore('${game.id}', u) from unnest(array['${A}', '${T}', '${B}']::uuid[]) u`);
    };

    await t.test('verze 41, sloupce a omezení staveb', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 41, 'verze aspoň 41');
        assert.equal(q(`select count(*) from information_schema.columns where table_name = 'conquest_territories' and column_name = 'building'`), '1');
        assert.equal(q(`select count(*) from information_schema.columns where table_name = 'conquest_siege_players' and column_name = 'defender'`), '1');
        assert.equal(q('select array_to_string(conquest_castles(), \',\')'), C.CASTLE_SETS.map(set => set.id).join(','));
        // Pomocné funkce bloku jen interně
        for (const fn of ['conquest_siege_defender_due(public.conquest_sieges)', 'conquest_defend_push_items()', 'conquest_territories_building()']) {
            assert.equal(q(`select has_function_privilege('authenticated', 'public.${fn}', 'execute')`), 'f', fn);
        }
    });

    await t.test('Postavit: strážní věž, důl a opevnění na vlastním území; neplatné případy', () => {
        game = json(create(A));
        ok(join(T, game.code, 'modra'));
        ok(join(B, game.code, 'zelena'));
        map();
        // Věž: stavba je tah fortify se stavbou v b; území má building 'tower', úroveň 0
        const built = json(move(T, game.id, 'Q214', 'tower'));
        assert.deepEqual([built.move.k, built.move.r, built.move.b, built.move.l], ['fortify', 'fortify', 'tower', 0]);
        assert.equal(row(game.id, 'Q214'), `${T}|0|tower`);
        assert.equal(built.territories.find(item => item.t === 'Q214').b, 'tower', 'conquest_state posílá stavbu');
        // Na území je jen jedna stavba: druhá stavba ani opevnění ne
        denied(move(T, game.id, 'Q214', 'mine'), /Na území už stojí stavba/);
        denied(move(T, game.id, 'Q214', 'fortify'), /Na území už stojí stavba/);
        // Domovský hrad se jen opevňuje
        denied(move(T, game.id, 'Q20', 'tower'), /Na domovském hradu jde jen opevnění/);
        assert.equal(json(move(T, game.id, 'Q20', 'fortify')).move.b, null, 'opevnění domova bez stavby');
        // Cizí území ne
        denied(move(A, game.id, 'Q40', 'mine'), /Stavět jde jen na vlastním území/);
        denied(move(A, game.id, 'Q40', 'banka'), /Neplatný tah/);
        // Špatná odpověď: tah propadne, stavba nevznikne
        const miss = json(move(T, game.id, 'Q28', 'mine', false));
        assert.deepEqual([miss.move.r, miss.move.b], ['fail', 'mine']);
        assert.equal(row(game.id, 'Q28'), `${T}|0|-`);
        // Opevnění mimo domov = stavba 'wall' (Palisáda, pak Hradba); na opevněné území věž ani důl ne
        assert.equal(json(move(T, game.id, 'Q28', 'fortify')).move.b, 'wall');
        assert.equal(row(game.id, 'Q28'), `${T}|1|wall`);
        denied(move(T, game.id, 'Q28', 'tower'), /Na území už stojí stavba/);
        assert.equal(json(move(T, game.id, 'Q28', 'fortify')).move.l, 2);
        denied(move(T, game.id, 'Q28', 'fortify'), /opevněné naplno/);
        // Spoušť drží opevnění podle úrovně i při přímé úpravě
        q(`update conquest_territories set level = 0 where game_id = '${game.id}' and territory = 'Q28'`);
        assert.equal(row(game.id, 'Q28'), `${T}|0|-`);
        q(`update conquest_territories set level = 1 where game_id = '${game.id}' and territory = 'Q28'`);
        assert.equal(row(game.id, 'Q28'), `${T}|1|wall`);
        // Obléhané území stavět nejde
        ok(begin(A, game.id, 'Q40'));
        denied(move(T, game.id, 'Q40', 'mine'), /Na obléhaném území teď stavět nejde/);
        // Stavba stojí tah: T odehrál věž, opevnění domova, nepovedený důl, dvě opevnění = 5 z 10
        assert.equal(left(game.id, T), 5);
    });

    await t.test('důl: 2 body místo 1, při dobytí nepadá a získá ho dobyvatel', () => {
        map();
        const before = score(game.id, T);
        ok(move(T, game.id, 'Q40', 'mine'));
        assert.equal(score(game.id, T), before + 1, 'důl = bod navíc hned');
        const scoreA = score(game.id, A);
        // Dobytí (okamžitý útok postaru): důl zůstane dobyvateli i s bodem navíc
        const taken = json(move(A, game.id, 'Q40', 'attack'));
        assert.deepEqual([taken.move.r, taken.move.b], ['capture', 'mine']);
        assert.equal(row(game.id, 'Q40'), `${A}|0|mine`);
        assert.equal(score(game.id, A), scoreA + 2);
        assert.equal(score(game.id, T), before - 1);
        // Konečné pořadí podle bodů s dolem
        assert.equal(q(`select string_agg(user_id::text || ':' || score, ',' order by seat) from conquest_players where game_id = '${game.id}'`),
            `${A}:${scoreA + 2},${T}:${before - 1},${B}:${score(game.id, B)}`);
    });

    await t.test('strážní věž: majitel brání odkudkoli, bitva na něj počká; správně a nejrychleji = útok odražen, věž stojí', () => {
        map();
        ok(move(T, game.id, 'Q214', 'tower'));
        const usedBefore = left(game.id, T);
        // Upozornění pro majitele: chce upozornění z Dobývání a má odběr
        q(`update profiles set push_conquest = true where id = '${T}';
           insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.example.com/vez-1', '${T}', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg')`);
        clock = at(0);
        const siege = json(begin(A, game.id, 'Q214'));
        const seen = pulse(T, game.id).sieges.find(item => item.id === siege.id);
        assert.deepEqual([seen.can_join, seen.can_defend], [true, true], 'majitel s věží se může přidat, i když neútočí odnikud');
        assert.deepEqual([pulse(B, game.id).sieges[0].can_join, pulse(B, game.id).sieges[0].can_defend], [true, false], 'B s územím sousedí: přidá se jako útočník, ne obránce');
        const pushes = q(`set mudrlant.test_now = '${clock}'; select user_id || '|' || kind || '|' || title || '|' || dedupe_key from push_pending() where kind = 'conquest_defend'`).split('\n');
        assert.deepEqual(pushes, [`${T}|conquest_defend|Útok na tvé území, braň ho!|cqd:${game.id}:${T}:${siege.id}`]);
        // Útočník odpoví správně za 10 s: bitva čeká na obránce
        clock = at(10);
        assert.equal(answer(A, siege.id, 0).status, 'waiting');
        // Obránce se přidá (bez sousedství a bez území útoku) a odpoví správně za 4 s: rychleji
        clock = at(20);
        const joined = json(joinSiege(T, siege.id));
        assert.ok(joined.question && joined.participants.some(item => item.me && item.defender), 'obránce dostane otázku');
        assert.equal(q(`set mudrlant.test_now = '${clock}'; select count(*) from push_pending() where kind = 'conquest_defend'`), '0', 'kdo brání, upozornění už nedostane');
        clock = at(24);
        const done = answer(T, siege.id, 0);
        assert.equal(done.status, 'resolved');
        assert.deepEqual([done.move.k, done.move.r, done.move.b], ['defend', 'repel', 'tower']);
        assert.equal(done.siege.outcome, 'repel');
        assert.equal(row(game.id, 'Q214'), `${T}|0|tower`, 'území i věž zůstávají');
        assert.equal(q(`select string_agg(kind || ' ' || result, ',' order by id) from conquest_moves where game_id = '${game.id}' and territory = 'Q214' and kind in ('attack', 'defend')`), 'attack outrun,defend repel');
        assert.equal(left(game.id, T), usedBefore - 1, 'obrana stojí tah');
        // Odražený útok je vyhraná bitva (odemykání sad)
        assert.equal(q(`select conquest_look_stats('${T}') ->> 'battles'`), '1');
        // push_mark zná klíč cqd:
        q(`delete from push_sent`);
        assert.ok(q(`select pg_get_functiondef('public.push_mark(text, text[], text[], text[], text[])'::regprocedure) like '%when ''cqd'' then ''conquest_defend''%'`) === 't');
    });

    await t.test('strážní věž: vyhraje-li útočník, území dobude a věž padne (zřícenina v tazích kola); pobořené poslední opevnění', () => {
        map();
        clock = at(100);
        ok(move(T, game.id, 'Q214', 'tower'));
        const siege = json(begin(A, game.id, 'Q214'));
        clock = at(105);
        ok(joinSiege(T, siege.id));
        clock = at(107);
        assert.equal(answer(T, siege.id, 2).status, 'waiting', 'obránce špatně');
        clock = at(112);
        const done = answer(A, siege.id, 0);
        assert.equal(done.status, 'resolved');
        assert.deepEqual([done.move.k, done.move.r, done.move.b], ['attack', 'capture', 'tower']);
        assert.equal(row(game.id, 'Q214'), `${A}|0|-`, 'věž padla');
        assert.equal(q(`select kind || ' ' || result || ' ' || coalesce(victim::text, '-') from conquest_moves where game_id = '${game.id}' and kind = 'defend'`), 'defend fail -');
        // Zřícenina se v aplikaci odvodí z tahů kola (b = 'tower') – stav hry je posílá
        const state = json(as(A, `select conquest_state('${game.id}');`));
        const view = C.viewOf(state, require('../data/dobyvani-evropa.json'), A);
        assert.equal(view.ruins.has('Q214'), true);
        // Opevnění mimo domov: pobourání poslední úrovně = bez stavby, tah útoku s b 'wall'
        place(game.id, 'Q40', T, { level: 1 });
        assert.equal(row(game.id, 'Q40'), `${T}|1|wall`);
        const breach = json(move(A, game.id, 'Q40', 'attack'));
        assert.deepEqual([breach.move.r, breach.move.l, breach.move.b], ['breach', 0, 'wall']);
        assert.equal(row(game.id, 'Q40'), `${T}|0|-`);
    });

    await t.test('strážní věž: když obránce nepřijde, bitva skončí po termínu přidání; bez tahů bránit nejde', () => {
        map();
        clock = at(200);
        ok(move(T, game.id, 'Q214', 'tower'));
        const siege = json(begin(A, game.id, 'Q214'));
        clock = at(205);
        assert.equal(answer(A, siege.id, 0).status, 'waiting');
        clock = at(200 + 64);
        pulse(A, game.id);
        assert.equal(q(`select outcome from conquest_sieges where id = '${siege.id}'`), 'capture');
        assert.equal(row(game.id, 'Q214'), `${A}|0|-`);
        // Majitel bez tahů: bitva nečeká, přidat se nejde
        map();
        clock = at(300);
        ok(move(T, game.id, 'Q214', 'tower'));
        q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result, at)
           select '${game.id}', '${T}', 0, 'fortify', 'Q20', false, 'fail', '${clock}' from generate_series(1, ${left(game.id, T)})`);
        assert.equal(left(game.id, T), 0);
        const second = json(begin(A, game.id, 'Q214'));
        assert.deepEqual([pulse(T, game.id).sieges[0].can_defend], [false]);
        denied(joinSiege(T, second.id), /Tahy na tohle období už nemáš/);
        clock = at(303);
        assert.equal(answer(A, second.id, 0).status, 'resolved', 'bez možné obrany se nečeká');
        // Bez věže se majitel nepřidá
        map();
        clock = at(400);
        const plain = json(begin(A, game.id, 'Q40'));
        denied(joinSiege(T, plain.id), /Na vlastní území útočit nejde/);
    });

    await t.test('další sady hradů: Perníkový hrad za sérii 100 dní, Parostrojní pevnost za 100 bitev, Ledový palác za 10 Bossů', () => {
        const castles = (uid) => json(as(uid, 'select conquest_looks();')).castles;
        assert.deepEqual([castles(U1), castles(U2), castles(U3)], [[], [], []]);
        q(`update profiles set badges = array['kviz-serie-100'] where id = '${U1}'`);
        assert.deepEqual(castles(U1), ['pernikovy']);
        q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result, at)
           select '${game.id}', '${U2}', 0, 'attack', 'Q213', true, 'breach', '${clock}' from generate_series(1, 99)`);
        assert.deepEqual(castles(U2), ['orientalni'], '99 bitev: zatím jen Orientální palác');
        q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result, at) values ('${game.id}', '${U2}', 0, 'attack', 'Q213', true, 'capture', '${clock}')`);
        assert.deepEqual(castles(U2), ['orientalni', 'parostrojni']);
        q(`insert into boss_results (user_id, week, best_damage, defeated, attempts) select '${U3}', date '2026-01-05' + 7 * n, 700, true, 1 from generate_series(0, 9) n`);
        assert.deepEqual(castles(U3), ['ledovy']);
        // Volba v lobby: jen odemčená sada
        const lobby = json(as(U3, `select conquest_create('evropa', 3, 72, 'day', 5, 'private', 'cervena', 'lev', null, null, 'ledovy');`));
        assert.equal(lobby.players.find(player => player.me).castle, 'ledovy');
        denied(as(U3, `select conquest_set_look('${lobby.id}', 'cervena', 'lev', null, 'pernikovy');`), /Tenhle hrad ještě nemáš/);
    });

    await t.test('boti: občas postaví strážní věž nebo důl, nic nerozbijí', () => {
        clock = '2026-12-20T08:00:00Z';
        const bots = json(as(ADMIN, `select conquest_create('evropa', 4, 24, 'hour', 10, 'private', 'cervena', 'lev');`));
        ok(as(ADMIN, `select dev_conquest_add_bots('${bots.id}', 3);`));
        for (let hour = 0; hour < 20; hour++) {
            clock = new Date(Date.parse('2026-12-20T08:00:00Z') + hour * 3600 * 1000 + 50 * 60 * 1000).toISOString();
            q(`set mudrlant.test_now = '${clock}'; select setseed(${(hour + 1) / 40}); select conquest_bots_due('${bots.id}', true);`);
        }
        const built = q(`select coalesce(string_agg(distinct building, ','), '') from conquest_moves where game_id = '${bots.id}' and kind = 'fortify' and result = 'fortify' and building in ('tower', 'mine')`);
        assert.ok(built.length > 0, 'boti postavili věž nebo důl');
        assert.ok(Number(q(`select count(*) from conquest_moves where game_id = '${bots.id}' and kind = 'attack'`)) > 20, 'boti dál útočí');
    });
});
