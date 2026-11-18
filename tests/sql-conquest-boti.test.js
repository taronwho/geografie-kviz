// Boti v Dobývání pro všechny (PostgreSQL 16, blok „42: Dobývání – boti pro všechny“, docs/DOBYVANI-BOTI.md): přidání a odebrání botů
// zakladatelem v lobby (oprávnění, limity, obtížnosti i smíchané, jména), XP podle nejsilnějšího bota, rozvrh tahů v kole (nic před časem,
// nejvýš rozpočet, dohánění), bitva bota s odpovědí po jeho čase, boti se přidají do bitvy člověka a brání věž, okno obrany 15/30 s,
// úspěšnost a rychlost podle obtížnosti, strategie Super Mudrlanta, odměny a odemčení s boty, verze 42. Spouští se jen s psql a serverem
// (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_boti_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
let clock = '2026-12-10T07:00:00Z';
const sys = (sql) => q(`set mudrlant.test_now = '${clock}'; ${sql}`);
const as = (uid, sql, role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${clock}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
};
const lit = (text) => (text === null || text === undefined ? 'null' : `'${String(text).replace(/'/g, "''")}'`);
const plus = (iso, seconds) => new Date(Date.parse(iso) + seconds * 1000).toISOString();
const epoch = (sql) => Math.round(Number(q(sql)) * 1000);

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

const [A, B, C, D] = [1, 2, 3, 4].map(id);
const QUESTION = { kind: 'flag', prompt: 'Čí je tahle vlajka?', choices: [{ label: 'Litva', correct: true }, { label: 'Lotyšsko' }, { label: 'Estonsko' }, 'Polsko'] };
const create = (uid, { players = 4, hours = 72, per = 'day', actions = 5, colour = 'cervena' } = {}) =>
    as(uid, `select conquest_create('evropa', ${players}, ${hours}, ${lit(per)}, ${actions}, 'private', ${lit(colour)}, 'lev');`);
const join = (uid, code, colour) => as(uid, `select conquest_join(null, ${lit(code)}, ${lit(colour)}, 'orel');`);
const addBots = (uid, game, n, level) => as(uid, `select conquest_add_bots(${lit(game)}, ${n}, ${lit(level)});`);
const removeBot = (uid, game, bot) => as(uid, `select conquest_remove_bot(${lit(game)}, ${lit(bot)});`);
const state = (uid, game) => json(as(uid, `select conquest_state(${lit(game)});`));
const pulse = (uid, game) => json(as(uid, `select conquest_pulse(${lit(game)});`));
const begin = (uid, game, target, source = null, seed = null) => as(uid, `${seed !== null ? `select setseed(${seed});` : ''} select conquest_siege_begin(${lit(game)}, ${lit(target)}, ${lit(JSON.stringify(QUESTION))}::jsonb, 0::smallint, ${lit(source)});`);
const answer = (uid, siege, choice) => json(as(uid, `select conquest_siege_answer(${lit(siege)}, ${choice}::smallint);`));
const bots = (summary) => summary.players.filter(p => p.bot);
const place = (game, territory, owner, { level = 0, home = false, treasure = false, building = null } = {}) =>
    q(`update conquest_territories set owner = ${owner ? lit(owner) : 'null'}, level = ${level}, home = ${home}, treasure = ${treasure}, building = ${lit(building)} where game_id = ${lit(game)} and territory = ${lit(territory)}`);
const clearMap = (game) => q(`update conquest_territories set owner = null, level = 0, home = false, treasure = false, building = null where game_id = ${lit(game)};
    delete from conquest_sieges where game_id = ${lit(game)}; delete from conquest_moves where game_id = ${lit(game)} and kind <> 'home';`);
const participants = (siege) => q(`select string_agg(user_id || ' ' || coalesce((extract(epoch from joined_at) * 1000)::bigint::text, '-') || ' ' || coalesce((extract(epoch from answered_at) * 1000)::bigint::text, '-'), ',' order by joined_at) from conquest_siege_players where siege_id = ${lit(siege)}`)
    .split(',').filter(Boolean).map(row => { const [user, joined, answered] = row.split(' '); return { user, joined: Number(joined), answered: answered === '-' ? null : Number(answered) }; });
const names = (level) => JSON.parse(q(`select to_json(conquest_bot_names(${lit(level)}))`));

test('SQL: boti v Dobývání (blok 42)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q([[A, 'Alfa'], [B, 'Beta'], [C, 'Gama'], [D, 'Delta']].map(([uid, name], i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "${name}"}');`).join('\n'));

    await t.test('verze 43; přidat a odebrat boty smí jen přihlášený, pomocné funkce nikdo; jména botů', () => {
        assert.equal(last(ok(as(A, 'select schema_version();'))), '43');
        const can = (role, fn) => q(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`);
        for (const fn of ['conquest_add_bots(uuid, integer, text)', 'conquest_remove_bot(uuid, uuid)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['t', 'f', 'f'], fn);
        }
        for (const fn of ['conquest_bots_due(uuid, boolean, boolean)', 'conquest_bot_move(uuid, uuid, boolean)', 'conquest_bot_slots(public.conquest_games, uuid, integer, integer)',
            'conquest_bot_insert(public.conquest_games, text, text)', 'conquest_bot_siege_sync(uuid)', 'conquest_bot_react(uuid)', 'conquest_bots_tick()', 'conquest_xp_share(uuid)',
            'conquest_siege_defend_until(public.conquest_sieges)', 'conquest_lobby_admin(uuid)', 'conquest_bot_asleep(public.conquest_games, timestamp with time zone)',
            'conquest_bot_awake(public.conquest_games, integer)', 'conquest_bot_night_game(public.conquest_games)']) {
            assert.deepEqual([can('authenticated', fn), can('anon', fn), can('public', fn)], ['f', 'f', 'f'], fn);
        }
        for (const table of ['conquest_bot_plans', 'conquest_bot_log']) denied(as(A, `select * from ${table};`), /permission denied/, table);
        for (const level of ['easy', 'medium', 'hard']) {
            const list = names(level);
            assert.ok(list.length >= 20, `${level}: aspoň 20 jmen`);
            assert.equal(new Set(list).size, list.length, `${level}: bez opakování`);
            assert.ok(list.every(name => name.length >= 2 && name.length <= 13), `${level}: krátká jména (nejvýš 13 znaků): ${list.filter(name => name.length > 13)}`);
        }
        const all = ['easy', 'medium', 'hard'].flatMap(names);
        assert.equal(new Set(all).size, all.length, 'každé jméno jen v jedné obtížnosti');
        assert.ok(names('easy').includes('Šroubek') && names('easy').includes('Bit Bajtík') && names('medium').includes('Dr. Čip') && names('hard').includes('Prof. Kvanťák'));
    });

    let lobbyGame;
    await t.test('přidání: jen zakladatel, jen lobby, obtížnost uložená a smíchaná, jména ve hře neopakovaná, XP podle nejsilnějšího bota; odebrání', () => {
        lobbyGame = json(create(A, { players: 6 }));
        assert.equal(lobbyGame.xp_share, 100, 'bez botů 100 %');
        denied(addBots(B, lobbyGame.id, 1, 'easy'), /nehraješ/);
        ok(join(B, lobbyGame.code, 'modra'));
        denied(addBots(B, lobbyGame.id, 1, 'easy'), /jen správce lobby/, 'hra se zakladatelem: jen zakladatel');
        denied(addBots(A, lobbyGame.id, 1, 'genius'), /Vyber obtížnost bota/);
        denied(addBots(null, lobbyGame.id, 1, 'easy', 'anon'), null);
        let summary = json(addBots(A, lobbyGame.id, 1, 'easy'));
        assert.deepEqual([summary.status, bots(summary).length, bots(summary)[0].bot, bots(summary)[0].ready, summary.xp_share], ['lobby', 1, 'easy', true, 20]);
        assert.ok(names('easy').includes(bots(summary)[0].display_name.replace(/ \d+$/, '')), bots(summary)[0].display_name);
        assert.equal(summary.players.find(p => p.me).bot, null, 'člověk bez obtížnosti');
        summary = json(addBots(A, lobbyGame.id, 2, 'hard'));
        assert.deepEqual(bots(summary).map(p => p.bot).sort(), ['easy', 'hard', 'hard']);
        assert.equal(summary.xp_share, 100, 'Super Mudrlant: 100 %');
        assert.equal(new Set(bots(summary).map(p => p.display_name)).size, 3, 'jména ve hře se neopakují');
        assert.equal(new Set(summary.players.map(p => p.flag_color)).size, 5, 'barvy ve hře se neopakují');
        assert.equal(q(`select count(*) from conquest_players where game_id = '${lobbyGame.id}' and bot_level = 'hard'`), '2', 'obtížnost uložená u hráče');
        // Odebrání: jen zakladatel, jen bot
        for (const bot of bots(summary).filter(p => p.bot === 'hard')) {
            denied(removeBot(B, lobbyGame.id, bot.id), /jen správce lobby/);
            summary = json(removeBot(A, lobbyGame.id, bot.id));
        }
        denied(removeBot(A, lobbyGame.id, B), /Takový bot ve hře není/, 'člověka odebrat nejde');
        assert.deepEqual([bots(summary).length, summary.xp_share], [1, 20], 'jen Mudrlátko: 20 %');
        summary = json(addBots(A, lobbyGame.id, 1, 'medium'));
        assert.equal(summary.xp_share, 50, 'nejsilnější Mudrlant: 50 %');
        // Limit za hodinu
        q(`insert into conquest_bot_log (user_id, at) select '${A}', now() from generate_series(1, 30)`);
        denied(addBots(A, lobbyGame.id, 1, 'easy'), /za poslední hodinu přidáno hodně/);
        q(`delete from conquest_bot_log where user_id = '${A}'`);
        assert.deepEqual([summary.admin, summary.players.filter(p => p.admin).map(p => p.id)], [true, [A]], 'zakladatel je správce lobby');
        assert.equal(json(as(B, `select conquest_join(null, ${lit(lobbyGame.code)}, 'modra', 'orel');`)).admin, false);
    });

    await t.test('Rychlá hra: boty přidává správce lobby (kdo je v ní nejdéle), po jeho odchodu další; boti nikdy; s posledním člověkem boti odejdou', () => {
        const preset = json(as(C, 'select conquest_lobby();')).open.find(g => g.preset === 'cesko-12h');
        let summary = json(as(C, `select conquest_join('${preset.id}', null, 'cervena', 'lev');`));
        assert.equal(summary.admin, true, 'první, kdo se přidal, je správce');
        clock = plus(clock, 5);
        summary = json(as(D, `select conquest_join('${preset.id}', null, 'modra', 'orel');`));
        assert.deepEqual([summary.admin, summary.players.filter(p => p.admin).map(p => p.id)], [false, [C]]);
        denied(addBots(D, preset.id, 1, 'easy'), /jen správce lobby/, 'druhý přidat boty nesmí');
        summary = json(addBots(C, preset.id, 1, 'hard'));
        assert.deepEqual([summary.status, bots(summary).length, summary.players.filter(p => p.admin).map(p => p.id)], ['lobby', 1, [C]], 'bot správcem není');
        denied(removeBot(D, preset.id, bots(summary)[0].id), /jen správce lobby/);
        // Správce odejde: správcem je další nejdéle čekající člověk (ne bot, i když se přidal dřív)
        ok(as(C, `select conquest_leave('${preset.id}');`));
        summary = json(addBots(D, preset.id, 1, 'easy'));
        assert.deepEqual([summary.admin, bots(summary).length, summary.players.filter(p => p.admin).map(p => p.id)], [true, 2, [D]]);
        summary = json(removeBot(D, preset.id, bots(summary).find(p => p.bot === 'easy').id));
        assert.equal(bots(summary).length, 1);
        // Poslední člověk odejde: Rychlá hra zůstane otevřená a prázdná, bez botů
        ok(as(D, `select conquest_leave('${preset.id}');`));
        assert.equal(q(`select count(*) from conquest_players where game_id = '${preset.id}'`), '0');
        assert.equal(q(`select status from conquest_games where id = '${preset.id}'`), 'lobby');
    });

    await t.test('limity: do plna, aspoň jedno místo lidem; plná hra začne; v rozehrané hře ne; lobby jen s boty po odchodu zmizí', () => {
        const small = json(create(C, { players: 3 }));
        const summary = json(addBots(C, small.id, 5, 'medium'));
        assert.deepEqual([summary.status, bots(summary).length, summary.players.length], ['running', 2, 3], 'boti nejvýš do plna (max − 1), plná hra začne');
        denied(addBots(C, small.id, 1, 'easy'), /ještě nezačala/);
        denied(removeBot(C, small.id, bots(summary)[0].id), /ještě nezačala/);
        const lonely = json(create(D, { players: 4 }));
        ok(addBots(D, lonely.id, 2, 'easy'));
        ok(as(D, `select conquest_leave('${lonely.id}');`));
        assert.equal(q(`select count(*) from conquest_games where id = '${lonely.id}'`), '0', 'lobby jen s boty zmizí');
        // Boti hráčů nejsou vývojářští (dev_tournament_clear_bots je nechá), ale dev_is_bot je pozná
        assert.equal(q(`select count(*) from auth.users where email like 'bot-%@bots.invalid'`), '0');
        assert.equal(q(`select bool_and(dev_is_bot(id)) from auth.users where email like 'botx-%'`), 't');
    });

    await t.test('rozvrh tahů: rozložený do kola, nic před časem, útok je bitva s odpovědí bota po jeho čase, nejvýš rozpočet, dohánění, nové kolo', () => {
        clock = '2026-12-11T08:00:00Z';
        const g = json(create(C, { players: 2, hours: 6, per: 'hour', actions: 5 }));
        const started = json(addBots(C, g.id, 1, 'medium'));
        assert.equal(started.status, 'running');
        const bot = bots(started)[0].id;
        const slots = q(`select string_agg((extract(epoch from x) * 1000)::bigint::text, ',' order by n) from conquest_games g, unnest(conquest_bot_slots(g, '${bot}', 0, 5)) with ordinality s (x, n) where g.id = '${g.id}'`).split(',').map(Number);
        const start = Date.parse(clock);
        assert.equal(slots.length, 5);
        assert.deepEqual([...slots].sort((a, b) => a - b), slots, 'seřazené');
        assert.ok(slots[0] >= start + 0.04 * 3600e3 - 1, 'první tah až po 4 % kola');
        assert.ok(slots[4] <= start + 3600e3 - 360e3 + 1, 'poslední nejpozději 6 minut před koncem kola');
        assert.ok(slots[4] > slots[0], 'tahy nejsou najednou');
        // Rozložení do kola (přes 40 botů): průměrně přes třetinu kola mezi prvním a posledním tahem, nikdy všechno najednou
        const spread = q(`select avg(extract(epoch from (s[5] - s[1]))) || ' ' || min(extract(epoch from (s[5] - s[1]))) from conquest_games g,
            lateral (select conquest_bot_slots(g, gen_random_uuid(), 0, 5) s from generate_series(1, 40)) x where g.id = '${g.id}'`).split(' ').map(Number);
        assert.ok(spread[0] > 0.35 * 3600 && spread[1] > 60, `tahy rozložené do kola: ${spread}`);
        assert.equal(q(`select string_agg((extract(epoch from x) * 1000)::bigint::text, ',' order by n) from conquest_games g, unnest(conquest_bot_slots(g, '${bot}', 0, 5)) with ordinality s (x, n) where g.id = '${g.id}'`), slots.join(','), 'rozvrh je pořád stejný');
        const botMoves = () => Number(q(`select count(*) from conquest_moves where game_id = '${g.id}' and user_id = '${bot}' and kind in ('attack', 'fortify')`));
        const openSieges = () => Number(q(`select count(*) from conquest_sieges where game_id = '${g.id}' and status = 'open' and started_by = '${bot}'`));
        // Člověk je daleko: bot útočí na volná území; bitvu zatím nevidí nikdo jiný
        clock = new Date(slots[0] - 1000).toISOString();
        state(C, g.id);
        assert.deepEqual([botMoves(), openSieges()], [0, 0], 'před časem tahu nic');
        clock = new Date(slots[0] + 1000).toISOString();
        state(C, g.id);
        const moved = botMoves() + openSieges();
        assert.equal(moved, 1, 'v čase tahu jeden tah');
        if (openSieges()) {
            // Útok: obléhání jako u člověka, otázku zatím nezná (pošle ji, kdo se přidá); odpověď bota přijde po jeho čase
            const siege = q(`select id from conquest_sieges where game_id = '${g.id}' and status = 'open'`);
            assert.equal(q(`select needs_question from conquest_sieges where id = '${siege}'`), 't');
            const due = epoch(`select extract(epoch from bot_answer_at) from conquest_siege_players where siege_id = '${siege}'`);
            assert.ok(due - Date.parse(clock) + 1000 >= 12000 && due - Date.parse(clock) + 1000 <= 35000, 'Mudrlant přemýšlí 12–35 s');
            state(C, g.id);
            assert.equal(botMoves() + openSieges(), 1, 'dokud čeká na odpověď, další tah nehraje');
            clock = new Date(due - 500).toISOString();
            pulse(C, g.id);
            assert.equal(participants(siege)[0].answered, null, 'ještě neodpověděl');
            clock = new Date(due + 1500).toISOString();
            pulse(C, g.id);
            assert.equal(participants(siege)[0].answered, due, 'odpověď se zapíše s časem bota');
            assert.equal(q(`select status from conquest_sieges where id = '${siege}'`), 'resolved', 'sám = hned vyhodnoceno');
        }
        // Throttle pulsu: nejvýš jednou za 4 s
        assert.equal(sys(`select conquest_bots_due('${g.id}', false, true)`), '0');
        // Hru nikdo neotevřel: těsně před koncem kola bot dožene, co mu rozvrh dal, ne víc
        clock = plus('2026-12-11T08:00:00Z', 3600 - 30);
        state(C, g.id);
        const budget = JSON.parse(sys(`select conquest_budget('${g.id}', '${bot}')`));
        assert.equal(budget.left, 0, 'bot odehrál celé kolo');
        assert.equal(Number(q(`select count(*) from conquest_moves where game_id = '${g.id}' and user_id = '${bot}' and period = 0 and kind in ('attack', 'fortify')`)) + budget.reserved, budget.total, 'nejvýš rozpočet');
        // Nové kolo: zase až po čase prvního tahu
        clock = plus('2026-12-11T08:00:00Z', 3600 + 30);
        state(C, g.id);
        assert.equal(Number(q(`select count(*) from conquest_moves where game_id = '${g.id}' and user_id = '${bot}' and period = 1 and kind in ('attack', 'fortify')`)), 0, 'nové kolo: nic před časem');
        // Kolo dohrané: bot chce další kolo, až dohraje
        const round = state(C, g.id).round;
        assert.equal(round.ready.includes(bot), false, 'bot, který ještě hraje, další kolo nechce');
    });

    let war;
    let hard;
    let easy;
    await t.test('bitva člověka: Super Mudrlant se přidá s časem, odpoví po svém čase; bitva na něj počká; rychlejší správná odpověď vyhraje', () => {
        clock = '2026-12-12T08:00:00Z';
        war = json(create(A, { players: 4, hours: 72, per: 'day', actions: 5 }));
        ok(join(B, war.code, 'modra'));
        ok(addBots(A, war.id, 1, 'hard'));
        const full = json(addBots(A, war.id, 1, 'easy'));
        assert.equal(full.status, 'running');
        hard = bots(full).find(p => p.bot === 'hard').id;
        easy = bots(full).find(p => p.bot === 'easy').id;
        clearMap(war.id);
        place(war.id, 'Q213', A, { home: true });        // Česko
        place(war.id, 'Q36', A);                         // Polsko (sousedí s Litvou)
        place(war.id, 'Q20', B, { home: true });         // Norsko
        place(war.id, 'Q191', hard, { home: true });     // Estonsko
        place(war.id, 'Q211', hard);                     // Lotyšsko: Litva by dokončila Pobaltí
        place(war.id, 'Q29', easy, { home: true });      // Španělsko (daleko)
        place(war.id, 'Q37', null, { treasure: true });  // Litva: volná, s pokladem, neopevněná
        clock = '2026-12-12T08:10:00Z';                  // boti ještě nemají naplánovaný tah (první po 4 % dne)
        const t0 = Date.parse(clock);
        const s = json(begin(A, war.id, 'Q37', 'Q36'));
        const plan = q(`select user_id || ' ' || (extract(epoch from join_at) * 1000)::bigint || ' ' || defender from conquest_bot_plans where siege_id = '${s.id}'`).split(' ');
        assert.equal(plan[0], hard, 'Super Mudrlant, kterému by Litva dokončila region, se přidá');
        const joinAt = Number(plan[1]);
        assert.ok(joinAt >= t0 + 4000 && joinAt <= t0 + 20000, 'přidá se za 4–20 s');
        clock = new Date(joinAt - 500).toISOString();
        assert.equal(pulse(B, war.id).sieges[0].participants.length, 1, 'ještě ne');
        clock = new Date(joinAt + 500).toISOString();
        const seen = pulse(B, war.id).sieges[0];
        assert.deepEqual(seen.participants.map(p => [p.id, p.bot || null]), [[A, null], [hard, 'hard']], 'bot je vidět jako účastník s obtížností');
        const rows = participants(s.id);
        assert.equal(rows[1].joined, joinAt, 'přidal se v naplánovaný čas');
        const botDue = epoch(`select extract(epoch from bot_answer_at) from conquest_siege_players where siege_id = '${s.id}' and user_id = '${hard}'`);
        assert.ok(botDue - joinAt >= 6000 && botDue - joinAt <= 20000, 'Super Mudrlant přemýšlí 6–20 s');
        // Člověk odpoví správně až za 40 s od svého začátku: bitva čekala na bota, vyhraje rychlejší správná odpověď
        clock = new Date(t0 + 40000).toISOString();
        const r = answer(A, s.id, 0);
        assert.equal(r.status, 'resolved');
        const botCorrect = q(`select bot_correct from conquest_siege_players where siege_id = '${s.id}' and user_id = '${hard}'`) === 't';
        const botMs = botDue - joinAt;
        assert.equal(r.siege.winner, botCorrect && botMs < 40000 ? hard : A, 'vítěz podle časů odpovědí');
        assert.equal(participants(s.id)[1].answered, botDue);
    });

    await t.test('obrana: bot brání svou strážní věž (bitva na něj počká); člověk brání jen 30 s (rychlá hra 15 s), pak se bitva vyhodnotí bez něj', () => {
        assert.deepEqual(q(`select string_agg(extract(epoch from conquest_siege_defend_wait(p))::integer::text, ',' order by n) from unnest(array['min5', 'min10', 'hour', 'day']) with ordinality x (p, n)`), '15,15,30,30');
        clock = '2026-12-12T08:20:00Z';
        clearMap(war.id);
        place(war.id, 'Q213', A, { home: true });
        place(war.id, 'Q36', A);
        place(war.id, 'Q37', hard, { building: 'tower' });   // Litva s věží
        place(war.id, 'Q191', hard, { home: true });
        place(war.id, 'Q214', B, { building: 'tower' });     // Slovensko s věží (člověk)
        place(war.id, 'Q20', B, { home: true });
        let defended = null;
        for (const seed of [0.11, 0.23, 0.37, 0.51]) {
            const s = json(begin(A, war.id, 'Q37', 'Q36', seed));
            const plan = q(`select defender || ' ' || (extract(epoch from join_at) * 1000)::bigint from conquest_bot_plans where siege_id = '${s.id}' and user_id = '${hard}'`);
            if (plan) { defended = { s, plan: plan.split(' ') }; break; }
            q(`delete from conquest_sieges where id = '${s.id}'`);
        }
        assert.ok(defended, `bot věž brání (95 %) ${sys(`select conquest_budget('${war.id}', '${hard}')`)} ${q(`select string_agg(territory || ':' || coalesce(owner::text, '-') || ':' || coalesce(building, '-'), ' ') from conquest_territories where game_id = '${war.id}' and owner is not null`)}`);
        assert.equal(defended.plan[0], 'true');
        const t0 = Date.parse(clock);
        const joinAt = Number(defended.plan[1]);
        assert.ok(joinAt > t0 && joinAt < t0 + 30000, 'obránce se přidá do konce okna obrany');
        // Útočník odpoví hned: bitva čeká na naplánovanou obranu
        clock = new Date(t0 + 1000).toISOString();
        if (joinAt > t0 + 1000) assert.equal(answer(A, defended.s.id, 0).status, 'waiting', 'čeká na bota');
        clock = new Date(t0 + 60000).toISOString();
        pulse(A, war.id);
        assert.equal(q(`select status from conquest_sieges where id = '${defended.s.id}'`), 'resolved');
        assert.ok(participants(defended.s.id).some(p => p.user === hard), 'bot se bránil');
        assert.equal(q(`select defender from conquest_siege_players where siege_id = '${defended.s.id}' and user_id = '${hard}'`), 't');
        // Člověk s věží: okno obrany 30 s (hra na dny), pak bitva bez něj
        clock = '2026-12-12T08:30:00Z';
        q(`update conquest_territories set owner = '${A}' where game_id = '${war.id}' and territory = 'Q213'`);
        const s = json(begin(A, war.id, 'Q214', 'Q213'));
        assert.ok(Math.abs(Date.parse(s.defend_until) - Date.parse(clock) - 30000) < 5, 'defend_until = začátek + 30 s');
        assert.equal(pulse(B, war.id).sieges.find(x => x.id === s.id).can_defend, true);
        clock = '2026-12-12T08:30:05Z';
        assert.equal(answer(A, s.id, 0).status, 'waiting', 'čeká na obránce');
        clock = '2026-12-12T08:30:31Z';
        assert.equal(pulse(B, war.id).sieges.some(x => x.id === s.id && x.can_defend), false, 'po okně už bránit nejde');
        denied(as(B, `select conquest_siege_join('${s.id}', null);`), /pozdě|skončila/);
        assert.equal(q(`select status || ' ' || coalesce(outcome, '') from conquest_sieges where id = '${s.id}'`), 'resolved capture', 'vyhodnoceno bez obránce');
    });

    await t.test('bitva bota: člověk se přidá jen s otázkou, která pak platí pro všechny', () => {
        clock = '2026-12-12T09:00:00Z';
        clearMap(war.id);
        place(war.id, 'Q211', hard, { home: true });   // Lotyšsko
        place(war.id, 'Q36', A, { home: true });       // Polsko
        place(war.id, 'Q37', null);                    // Litva
        place(war.id, 'Q20', B, { home: true });
        place(war.id, 'Q29', easy, { home: true });
        const g = q(`select row_to_json(g) from conquest_games g where id = '${war.id}'`);
        assert.equal(sys(`select conquest_bot_siege_begin(g, '${hard}', 'hard', 'Q37', 'Q211', 0) from conquest_games g where id = '${war.id}'`), 't');
        assert.ok(g);
        const siege = pulse(A, war.id).sieges.find(x => x.territory === 'Q37');
        assert.deepEqual([siege.needs_question, siege.can_join, siege.started_by], [true, true, hard]);
        denied(as(A, `select conquest_siege_join('${siege.id}', null);`), /Otázku k bitvě se nepodařilo připravit/);
        const joined = json(as(A, `select conquest_siege_join('${siege.id}', null, ${lit(JSON.stringify(QUESTION))}::jsonb, 0::smallint);`));
        assert.equal(joined.question.prompt, QUESTION.prompt);
        assert.doesNotMatch(q(`select question::text from conquest_sieges where id = '${siege.id}'`), /correct/);
        assert.equal(q(`select needs_question from conquest_sieges where id = '${siege.id}'`), 'f');
        q(`delete from conquest_sieges where id = '${siege.id}'`);
    });

    // Noc botů (hry s kolem aspoň 6 h): žádný čas akce bota (tah, bitva, přidání, obrana, odpověď) mezi 23:00 a 7:00 pražského času
    const NIGHT = (col) => `((${col}) at time zone 'Europe/Prague')::time not between time '07:00' and time '22:59:59'`;
    const slotsOf = (game, bot, p, total) => q(`select string_agg((extract(epoch from x) * 1000)::bigint::text, ',' order by n) from conquest_games g, unnest(conquest_bot_slots(g, '${bot}', ${p}, ${total})) with ordinality s (x, n) where g.id = '${game}'`).split(',').filter(Boolean).map(Number);
    const local = (ms) => q(`select to_char(to_timestamp(${ms} / 1000.0) at time zone 'Europe/Prague', 'HH24:MI:SS')`);
    const [N1, N2, N3, N4] = [21, 22, 23, 24].map(id);
    await t.test('noc: ve hře na den boti 23:00–7:00 pražského času netáhnou, nepřidají se a nebrání; rozvrh jen do bdělé doby kola', () => {
        q([[N1, 'Sova'], [N2, 'Výr'], [N3, 'Puštík'], [N4, 'Kalous']].map(([uid, name], i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'n${i + 1}@example.com', '{"full_name": "${name}"}');`).join('\n'));
        clock = '2026-12-20T20:00:00Z';                   // 21:00 pražského času
        const g = json(create(N1, { players: 4, hours: 72, per: 'day', actions: 5 }));
        ok(join(N2, g.code, 'modra'));
        const full = json(addBots(N1, g.id, 2, 'hard'));
        assert.equal(full.status, 'running');
        const [bot1, bot2] = bots(full).map(p => p.id);
        assert.equal(q(`select conquest_bot_night_game(g) from conquest_games g where id = '${g.id}'`), 't');
        // Rozvrh: 60 botů × 3 kola, nic v noci, vše uvnitř kola
        assert.equal(q(`select count(*) from conquest_games g, generate_series(0, 2) p, generate_series(1, 60) n, lateral unnest(conquest_bot_slots(g, md5('noc' || n)::uuid, p, 5)) x
            where g.id = '${g.id}' and (${NIGHT('x')} or (x at time zone 'Europe/Prague')::time > time '22:57' or x < conquest_period_start(g, p) or x >= conquest_period_end(g, p))`), '0', 'rozvrh jen 7:00–22:57');
        // Kolo od 21:00: část tahů ještě večer, zbytek ráno a přes den (rozložené do celé bdělé doby)
        const many = q(`select count(*) filter (where (x at time zone 'Europe/Prague')::time >= time '21:00' and x < conquest_period_start(g, 0) + interval '3 hours') || ' ' || count(*)
            from conquest_games g, generate_series(1, 60) n, lateral unnest(conquest_bot_slots(g, md5('noc' || n)::uuid, 0, 5)) x where g.id = '${g.id}'`).split(' ').map(Number);
        assert.ok(many[0] > 0 && many[0] < many[1] * 0.4, `večer část tahů: ${many}`);
        // Boti hrají podle rozvrhu (čas tahu, po 45 a 70 s odpovědi a vyhodnocení); v noci nic
        const times = [bot1, bot2].flatMap(bot => slotsOf(g.id, bot, 0, JSON.parse(sys(`select conquest_budget('${g.id}', '${bot}')`)).total)).sort((a, b) => a - b);
        const night = ['2026-12-20T22:01:00Z', '2026-12-20T23:30:00Z', '2026-12-21T01:00:00Z', '2026-12-21T03:00:00Z', '2026-12-21T05:59:00Z'];
        const ticks = [...new Set([...times.flatMap(at => [at + 1000, at + 45000, at + 70000]), ...night.map(Date.parse)])].sort((a, b) => a - b);
        for (const at of ticks) {
            clock = new Date(at).toISOString();
            const made = sys(`select conquest_bots_due('${g.id}')`);
            if (night.includes(clock.replace('.000', ''))) assert.equal(made, '0', `v noci (${local(at)}) boti netáhnou`);
            sys(`select conquest_sieges_due('${g.id}', false)`);
        }
        const actions = () => q(`select count(*) || ' ' || count(*) filter (where ${NIGHT('at')}) from (
                select m.at from conquest_moves m where m.game_id = '${g.id}' and m.user_id in ('${bot1}', '${bot2}') and m.kind <> 'home'
                union all select s.started_at from conquest_sieges s where s.game_id = '${g.id}' and s.started_by in ('${bot1}', '${bot2}')
                union all select p.joined_at from conquest_siege_players p join conquest_sieges s on s.id = p.siege_id where s.game_id = '${g.id}' and p.user_id in ('${bot1}', '${bot2}')
                union all select p.answered_at from conquest_siege_players p join conquest_sieges s on s.id = p.siege_id where s.game_id = '${g.id}' and p.user_id in ('${bot1}', '${bot2}') and p.answered_at is not null
                union all select b.join_at from conquest_bot_plans b join conquest_sieges s on s.id = b.siege_id where s.game_id = '${g.id}') x`).split(' ').map(Number);
        const [total, atNight] = actions();
        assert.ok(total >= 6, `boti hráli (${total} časů akcí)`);
        assert.equal(atNight, 0, 'žádná akce bota v noci');
        // Bitvy člověka v noci: Super Mudrlant se nepřidá (ve dne by se přidal vždy: dokončí Pobaltí, poklad, neopevněné) a věž nebrání
        const setup = () => {
            clearMap(g.id);
            place(g.id, 'Q213', N1, { home: true });          // Česko
            place(g.id, 'Q36', N1);                           // Polsko
            place(g.id, 'Q20', N2, { home: true });
            place(g.id, 'Q37', null, { treasure: true });     // Litva volná
            place(g.id, 'Q191', bot2, { home: true });        // Estonsko
            place(g.id, 'Q211', bot2);                        // Lotyšsko
            place(g.id, 'Q214', bot1, { building: 'tower' }); // Slovensko s věží
            place(g.id, 'Q29', bot1, { home: true });
        };
        clock = '2026-12-21T00:30:00Z';                   // 1:30 pražského času
        setup();
        for (const seed of [0.11, 0.23, 0.37]) {
            const attack = json(begin(N1, g.id, 'Q37', 'Q36', seed));
            const tower = json(begin(N1, g.id, 'Q214', 'Q213', seed));
            assert.equal(q(`select count(*) from conquest_bot_plans where siege_id in ('${attack.id}', '${tower.id}')`), '0', 'v noci se boti nepřidají ani nebrání');
            q(`delete from conquest_sieges where id in ('${attack.id}', '${tower.id}')`);
        }
        clock = '2026-12-21T09:00:00Z';                   // 10:00
        setup();
        const day = json(begin(N1, g.id, 'Q37', 'Q36', 0.11));
        assert.equal(q(`select user_id from conquest_bot_plans where siege_id = '${day.id}'`), bot2, 've dne se Super Mudrlant přidá');
        q(`delete from conquest_sieges where id = '${day.id}'`);
    });

    await t.test('noc: kolo skoro celé v noci se do bdělé doby stlačí, kolo celé v noci má rozvrh jako dřív; rychlé a hodinové hry v noci hrají', () => {
        // Hra na 6 h s kolem na den od 21:30: bdělá doba jen 21:30–22:57
        clock = '2026-12-22T20:30:00Z';
        const short = json(create(N3, { players: 2, hours: 6, per: 'day', actions: 5 }));
        const s1 = json(addBots(N3, short.id, 1, 'hard'));
        assert.equal(s1.status, 'running');
        const shortSlots = slotsOf(short.id, bots(s1)[0].id, 0, 5);
        assert.equal(shortSlots.length, 5);
        assert.ok(shortSlots.every(at => at >= Date.parse(clock) && local(at) <= '22:57:00'), `stlačené do 21:30–22:57: ${shortSlots.map(local)}`);
        // Od 23:30 (kolo do 5:30 bez bdělé doby): rozvrh přes celé kolo a bot v noci hraje
        clock = '2026-12-22T22:30:00Z';
        const dark = json(create(N3, { players: 2, hours: 6, per: 'day', actions: 5 }));
        const s2 = json(addBots(N3, dark.id, 1, 'hard'));
        const darkSlots = slotsOf(dark.id, bots(s2)[0].id, 0, 5);
        assert.ok(darkSlots.every(at => at > Date.parse(clock) && at < Date.parse(clock) + 6 * 3600e3), 'v kole');
        assert.ok(darkSlots.some(at => local(at) > '01:00:00' && local(at) < '05:00:00'), `rozvrh i v noci: ${darkSlots.map(local)}`);
        assert.equal(q(`select conquest_bot_asleep(g, '${new Date(darkSlots[0]).toISOString()}') from conquest_games g where id = '${dark.id}'`), 'f');
        clock = new Date(darkSlots[0] + 1000).toISOString();
        assert.equal(sys(`select conquest_bots_due('${dark.id}')`), '1', 'bez bdělé doby bot hraje i v noci');
        // Hodinová hra od 23:30: noc ji neovlivní (rozvrh jako dřív, bot hraje)
        clock = '2026-12-22T22:30:00Z';
        const quick = json(create(N4, { players: 2, hours: 6, per: 'hour', actions: 5 }));
        const s3 = json(addBots(N4, quick.id, 1, 'medium'));
        assert.equal(q(`select conquest_bot_night_game(g) from conquest_games g where id = '${quick.id}'`), 'f');
        const quickSlots = slotsOf(quick.id, bots(s3)[0].id, 0, 5);
        assert.ok(quickSlots[0] >= Date.parse(clock) + 0.04 * 3600e3 - 1 && quickSlots[4] <= Date.parse(clock) + 3600e3 - 360e3 + 1, 'rozvrh hodinového kola jako dřív');
        clock = new Date(quickSlots[0] + 1000).toISOString();
        assert.equal(sys(`select conquest_bots_due('${quick.id}')`), '1', 'hodinová hra: bot hraje i ve 23:30');
    });

    await t.test('úspěšnost a rychlost podle obtížnosti (vzorky s pevným semínkem)', () => {
        const rate = (level) => Number(q(`select setseed(0.42); select avg(case when conquest_bot_correct(u, '${level}', 0) then 1.0 else 0 end)
            from (select gen_random_uuid() u from generate_series(1, 40)) x, generate_series(1, 20)`).split('\n').pop());
        const [e, m, h] = ['easy', 'medium', 'hard'].map(rate);
        assert.ok(e > 0.4 && e < 0.6, `Mudrlátko ${e}`);
        assert.ok(m > 0.6 && m < 0.8, `Mudrlant ${m}`);
        assert.ok(h > 0.8 && h < 0.96, `Super Mudrlant ${h}`);
        const skill = (level) => q(`select min(conquest_bot_skill(gen_random_uuid(), '${level}')) || ' ' || max(conquest_bot_skill(gen_random_uuid(), '${level}')) from generate_series(1, 200)`).split(' ').map(Number);
        const [eMin, eMax] = skill('easy'); const [hMin, hMax] = skill('hard');
        assert.ok(eMin >= 0.45 && eMax <= 0.55 && hMin >= 0.85 && hMax <= 0.92, 'rozsah úspěšnosti');
        const delay = (level) => q(`select min(extract(epoch from conquest_bot_answer_delay('${level}'))) || ' ' || max(extract(epoch from conquest_bot_answer_delay('${level}'))) from generate_series(1, 300)`).split(' ').map(Number);
        const [d1, d2] = delay('easy'); const [d3, d4] = delay('medium'); const [d5, d6] = delay('hard');
        assert.ok(d1 >= 25 && d2 <= 50 && d3 >= 12 && d4 <= 35 && d5 >= 6 && d6 <= 20, 'doba odpovědi');
    });

    await t.test('strategie: Super Mudrlant dokončí region a útočí na neopevněné, Mudrlátko skoro náhodně; Super Mudrlant opevní ohrožený domov', () => {
        clearMap(war.id);
        place(war.id, 'Q191', hard, { home: true, level: 3 });   // Estonsko
        place(war.id, 'Q211', hard, { level: 2 });               // Lotyšsko
        place(war.id, 'Q37', A, {});                             // Litva: dokončí Pobaltí
        const pick = (uid, level) => sys(`select (conquest_bot_attack_pick(g, '${uid}', '${level}')).target from conquest_games g where g.id = '${war.id}'`);
        const picks = Array.from({ length: 20 }, () => pick(hard, 'hard'));
        assert.deepEqual([...new Set(picks)], ['Q37'], 'region');
        const easyPicks = Array.from({ length: 30 }, () => pick(hard, 'easy'));
        assert.ok(new Set(easyPicks).size >= 2 && easyPicks.filter(x => x === 'Q37').length < 25, `Mudrlátko náhodně: ${easyPicks.join(',')}`);
        clearMap(war.id);
        place(war.id, 'Q213', hard, { home: true });            // Česko
        place(war.id, 'Q183', A, { level: 2 });                 // Německo
        place(war.id, 'Q36', A, { level: 1 });                  // Polsko
        place(war.id, 'Q40', B, { level: 2 });                  // Rakousko
        place(war.id, 'Q214', B, {});                           // Slovensko
        assert.deepEqual([...new Set(Array.from({ length: 15 }, () => pick(hard, 'hard')))], ['Q214'], 'neopevněné území');
        assert.equal(sys(`select (x).target || ' ' || (x).kind from (select conquest_bot_build_pick(g, '${hard}', 'hard') x from conquest_games g where g.id = '${war.id}') y`), 'Q213 fortify',
            'ohrožený domov opevní');
        place(war.id, 'Q213', hard, { home: true, level: 3 });
        place(war.id, 'Q20', hard, {});                         // Norsko: sousedé volní = bezpečné → důl
        place(war.id, 'Q33', hard, {});                         // Finsko
        assert.match(sys(`select (x).target || ' ' || (x).kind from (select conquest_bot_build_pick(g, '${hard}', 'hard') x from conquest_games g where g.id = '${war.id}') y`), /^Q(20|33) mine$/);
    });

    await t.test('konec hry hned: poslední kolo dohrané všemi (i boti, i bitva) ukončí hru dřív než čas; pořadí a odměna jako po čase', () => {
        clock = '2026-12-15T10:00:00Z';
        const fast = json(as(C, `select conquest_create('evropa', 3, null, 'min5', 1, 'private', 'cervena', 'lev', 20);`));
        ok(join(D, fast.code, 'modra'));
        const started = json(addBots(C, fast.id, 1, 'easy'));
        assert.equal(started.status, 'running');
        // Předposlední kolo: dohrané všemi, ale hra jde dál (není poslední)
        clock = '2026-12-15T10:10:10Z';
        let st = state(C, fast.id);
        const homeC = st.territories.find(x => x.o === C && x.h).t;
        const homeD = st.territories.find(x => x.o === D && x.h).t;
        // Poslední kolo (10:15–10:20): D dohraje, C zaútočí (bitva), boti dohrají hned po lidech; dokud bitva běží, hra neskončí
        clock = '2026-12-15T10:15:10Z';
        ok(as(D, `select conquest_move('${fast.id}', '${homeD}', 'fortify', false, null);`));
        const target = q(`select l.b from conquest_links l join conquest_territories t on t.game_id = '${fast.id}' and t.territory = l.b
            where l.map = 'evropa' and l.a = '${homeC}' and t.owner is null and not t.treasure order by l.b limit 1`);
        const s = json(begin(C, fast.id, target, homeC));
        st = state(C, fast.id);
        assert.equal(st.status, 'running', 'bitva ještě běží');
        assert.equal(Number(q(`select count(*) from conquest_moves where game_id = '${fast.id}' and period = 3 and user_id not in ('${C}', '${D}') and kind in ('attack', 'fortify')`)) >= 1, true, 'bot dohrál hned po lidech');
        clock = '2026-12-15T10:15:20Z';
        const r = answer(C, s.id, 0);
        assert.equal(r.status, 'resolved');
        assert.equal(r.state.status, 'finished', 'všichni dohráli poslední kolo: konec hned');
        assert.equal(Date.parse(r.state.ends_at), Date.parse(clock), 'konec teď, ne v 10:20');
        assert.ok(r.state.players.every(p => p.place >= 1), 'pořadí jako po čase');
        const claim = json(as(C, `select conquest_claim('${fast.id}');`));
        assert.deepEqual([claim.claimed_now, claim.players, claim.xp_share], [true, 3, 20]);
        // Hra v posledním kole, kde někdo tahy ještě má, běží dál
        const other = json(as(C, `select conquest_create('evropa', 2, null, 'min5', 2, 'private', 'cervena', 'lev', 20);`));
        ok(join(D, other.code, 'modra'));
        ok(as(C, `select conquest_ready('${other.id}', true);`));
        const go = json(as(D, `select conquest_ready('${other.id}', true);`));
        assert.equal(go.status, 'running');
        clock = '2026-12-15T10:31:00Z';
        const home2 = state(C, other.id).territories.find(x => x.o === C && x.h).t;
        ok(as(C, `select conquest_move('${other.id}', '${home2}', 'fortify', false, null);`));
        ok(as(C, `select conquest_move('${other.id}', '${home2}', 'fortify', false, null);`));
        assert.equal(state(C, other.id).status, 'running', 'D má ještě tahy');
    });

    await t.test('odměny: boti se do „aspoň 3 hráčů“ počítají, XP podle nejsilnějšího bota; odemčení vzhledu jen ze her aspoň dvou lidí (Mudrlátka se do tří nepočítají)', () => {
        const finish = (g) => {
            q(`insert into conquest_moves (game_id, user_id, period, kind, territory, success, result) select '${g}', u, 0, 'fortify', t.territory, false, 'fail'
               from conquest_players p cross join lateral (select territory from conquest_territories where game_id = '${g}' and owner = p.user_id limit 1) t, unnest(array[p.user_id]) u, generate_series(1, 3)
               where p.game_id = '${g}' and p.bot_level is null`);
            q(`update conquest_games set ends_at = '${plus(clock, -1)}' where id = '${g}'`);
        };
        const games = () => Number(json(as(D, 'select conquest_looks();')).stats.games || 0);
        const before = games();
        clock = '2026-12-20T08:00:00Z';
        // D sám se dvěma Mudrlátky: odměna ano (3 hráči), 20 % XP, odemčení ne
        const solo = json(create(D, { players: 3, hours: 6, per: 'hour' }));
        ok(addBots(D, solo.id, 2, 'easy'));
        finish(solo.id);
        const claim = json(as(D, `select conquest_claim('${solo.id}');`));
        assert.deepEqual([claim.eligible, claim.xp_share, claim.players], [true, 20, 3]);
        assert.equal(games(), before, 'hra jen s boty se do odemčení nepočítá');
        // D a A s Mudrlátkem (krátká hra): do tří hráčů se Mudrlátko nepočítá
        const pair = json(create(D, { players: 3, hours: 6, per: 'hour' }));
        ok(join(A, pair.code, 'modra'));
        ok(addBots(D, pair.id, 1, 'easy'));
        finish(pair.id);
        assert.equal(json(as(D, `select conquest_claim('${pair.id}');`)).xp_share, 20);
        assert.equal(games(), before, 'Mudrlátko jako třetí hráč nestačí');
        // D a A s Mudrlantem: počítá se (50 % XP)
        const fair = json(create(D, { players: 3, hours: 6, per: 'hour' }));
        ok(join(A, fair.code, 'modra'));
        ok(addBots(D, fair.id, 1, 'medium'));
        finish(fair.id);
        assert.equal(json(as(D, `select conquest_claim('${fair.id}');`)).xp_share, 50);
        assert.equal(games(), before + 1, 'dva lidé a Mudrlant: hra se počítá');
    });
});
