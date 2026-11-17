// Dobývání v prohlížeči s falešným Supabase v paměti (jako tests/e2e-groups.test.js): dlaždice na záložce Soupeři, rozcestník (Moje hry,
// Lobby s Rychlými hrami, Založit hru), okno Barva a znak (obsazená barva nejde), založení soukromé hry, detail lobby (kód, Chci hrát,
// začátek hry), obrazovka hry (mapa se vejde na 360×640 bez posouvání, klepnutí na území, spodní list, otázka, dobytí, opevnění,
// odražený útok, přiblížení, kronika tažení), konec hry (stupně vítězů, odměna jen jednou, přehrání), pomůcky (zásoba v rozcestníku,
// okno Pomůcky, Půl na půl u otázky i v bitvě s „½“ u účastníků, Tah navíc z listu území, štítku i okna Kolo dohráno s potvrzením,
// „+1“ u tahů a záznam v kronice), Vzkříšení (blok 39: okno po ztrátě všech území, výběr území na mapě, animace, štít ochrany s odpočtem,
// zašedlý útok u soupeře, kronika u obou; bez pomůcky Mimo hru; starší databáze Návrat do hry), CSP bez chyb, tmavý režim.
// SCREENSHOT_DIR=/cesta uloží snímky (dobyvani-*.png). Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const nav = require('./nav.js');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const MAPS = Object.fromEntries(['evropa', 'cesko'].map(id => [id, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `dobyvani-${id}.json`), 'utf8'))]));

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', frame: null, title_pref: null, owl: null, ...extra });
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Falešný server Dobývání: hry, hráči, území, tahy; výsledek tahu určuje fronta force (jinak podle odpovědi)
const newDb = () => ({
    calls: [], force: [], seq: 10,
    profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald' }), 'u-2': player('u-2', 'Petr Svoboda', '🐼'), 'u-3': player('u-3', 'Eva Mistr', '🦉') },
    games: [
        { id: uuid(1), map: 'evropa', max_players: 6, hours: 72, period: 'day', actions: 5, visibility: 'public', code: 'EVR234', preset: 'evropa-3d', status: 'lobby', created_at: '2026-11-11T08:00:00Z', players: [{ user: 'u-3', seat: 0, flag_color: 'zelena', emblem: 'drak', ready: true }] },
        { id: uuid(2), map: 'cesko', max_players: 4, hours: 12, period: 'hour', actions: 3, visibility: 'public', code: 'CES234', preset: 'cesko-12h', status: 'lobby', created_at: '2026-11-11T08:00:00Z', players: [] }
    ]
});
const HOMES = { evropa: ['Q213', 'Q20', 'Q29', 'Q41'], cesko: ['Q192697', 'Q191091', 'Q193307', 'Q46070'] };
const NOW = '2026-11-11T10:00:00Z';
// Konec ochrany po Vzkříšení (blok 39): 60 s po NOW (čas stránky stojí na NOW)
const SHIELD_UNTIL = '2026-11-11T10:01:00Z';

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (!me) return json({ message: 'no token' }, 401);
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const name = rpc ? rpc[1] : '';
        if (url.pathname === '/rest/v1/profiles') { const pid = (url.searchParams.get('id') || '').replace('eq.', ''); return json(db.profiles[pid] ? [db.profiles[pid]] : []); }
        // Přátelé (db.friends: hráč → id přátel); bez nich nikdo
        if (name === 'friends_list') return json(((db.friends || {})[me.id] || []).map(fid => ({ ...db.profiles[fid], rating: 1000, last_seen: NOW, status: 'accepted', direction: 'out', since: NOW, wins: 0, losses: 0, draws: 0 })));
        if (!name.startsWith('conquest_') && !name.startsWith('dev_conquest_') && !name.startsWith('player_items')) return json(/^(friends_list|reactions|my_groups)$/.test(name) ? [] : {});
        db.calls.push({ name, body });
        const fail = (message, status = 400) => json({ code: 'P0001', message }, status);
        const find = (id) => db.games.find(g => g.id === id);
        const mapOf = (g) => MAPS[g.map];
        const players = (g) => g.players.map(p => ({ ...db.profiles[p.user], seat: p.seat, flag_color: p.flag_color, emblem: p.emblem, pattern: p.pattern || null, ready: p.ready, score: p.score || 0, score_at: p.score_at || null, place: p.place || null, me: p.user === me.id }));
        // Pozvánky (blok 24): db.invites = [{ game, user, by, declined }]; čekající pozvané vidí jen hráči hry v lobby
        const waiting = (g) => (db.invites || []).filter(i => i.game === g.id && !i.declined && !g.players.some(p => p.user === i.user));
        const summary = (g) => ({ id: g.id, map: g.map, max_players: g.max_players, hours: g.hours, ...(g.minutes ? { minutes: g.minutes } : {}), period: g.period, actions: g.actions, visibility: g.visibility, preset: g.preset, status: g.status,
            created_at: g.created_at, started_at: g.started_at || null, ends_at: g.ends_at || null, mine: g.players.some(p => p.user === me.id), creator: g.creator === me.id, code: g.code, players: players(g),
            invited: g.status === 'lobby' && g.players.some(p => p.user === me.id) ? waiting(g).map(i => ({ ...db.profiles[i.user], by_me: i.by === me.id })) : null });
        const mine = (g) => g.players.find(p => p.user === me.id);
        // penalty: v období g.penaltyPeriod hráč kvůli ztracenému hradu o tah méně (schéma 23)
        // extra: v tomto období použitý Tah navíc (blok 30, tah druhu 'extra')
        const extraOf = (g, uid) => ((g.moves || []).some(m => m.u === uid && m.k === 'extra' && (m.n || 0) === (g.periodNo || 0)) ? 1 : 0);
        const budget = (g) => { const used = (g.moves || []).filter(m => m.u === me.id && ['attack', 'fortify'].includes(m.k) && (m.n || 0) === (g.periodNo || 0)).length
            + (g.sieges || []).filter(s => s.status === 'open' && s.participants.some(p => p.user === me.id)).length; const penalty = g.penaltyPeriod !== undefined && g.penaltyPeriod === (g.periodNo || 0) ? 1 : 0;
            const extra = extraOf(g, me.id); return { period: g.periodNo || 0, base: g.actions, regions: 0, treasures: 0, loot: 0, penalty, extra, used, total: g.actions - penalty + extra, left: Math.max(0, g.actions - penalty + extra - used), period_ends_at: '2026-11-12T10:00:00Z' }; };
        // Pomůcky (blok 30), jen s db.items = { hráč: { extra_move, fifty } }: zásoba, co jde v této hře použít
        // Vzkříšení (blok 39) jen s db.revive: zásoba revive, ve hře can_revive / revive_block / revive_used
        const stock = () => (db.items ? { extra_move: 0, fifty: 0, chain_rescue: 0, ...(db.revive ? { revive: 0 } : {}), ...(db.items[me.id] || {}),
            max: { extra_move: 1, fifty: 2, chain_rescue: 1, ...(db.revive ? { revive: 3 } : {}) } } : null);
        const reviveInfo = (g, items) => {
            if (!db.revive) return {};
            const out = !g.territories.some(t => t.o === me.id);
            const block = g.status !== 'running' ? 'Hra neběží.' : !out ? 'Vzkříšení jde použít, jen když ti nezbylo žádné území.' : (items.revive || 0) < 1 ? 'Vzkříšení teď nemáš.' : null;
            return { can_revive: block === null, revive_block: block, revive_used: (g.moves || []).filter(m => m.u === me.id && m.k === 'revive').length };
        };
        const gameItems = (g) => {
            if (!db.items) return {};
            const items = stock();
            const extraUsed = (g.moves || []).some(m => m.u === me.id && m.k === 'extra');
            const last = Boolean(g.round && g.round.last);
            const block = g.status !== 'running' ? 'Hra neběží.' : extraUsed ? 'Tah navíc jde v jedné hře použít jen jednou.' : items.extra_move < 1 ? 'Tah navíc teď nemáš.'
                : last ? 'V posledním kole hry Tah navíc použít nejde.' : null;
            return { items: { ...items, extra_used: extraUsed, fifty_used: Boolean((g.fiftyUsed || {})[me.id]), can_extra: block === null, extra_block: block, ...reviveInfo(g, items) } };
        };
        const rescore = (g) => g.players.forEach(p => { const score = g.territories.filter(t => t.o === p.user).length; if (score !== p.score) { p.score = score; p.score_at = NOW; } });
        const start = (g) => {
            g.status = 'running'; g.started_at = NOW; g.ends_at = '2026-11-14T10:00:00Z';
            g.territories = mapOf(g).t.map(t => ({ t: t.id, o: null, l: 0, h: false, p: false }));
            g.moves = [];
            g.players.forEach((p, i) => { const home = g.territories.find(t => t.t === HOMES[g.map][i]); home.o = p.user; home.h = true; g.moves.push({ id: db.seq++, u: p.user, k: 'home', t: home.t, r: 'home', n: 0, at: NOW }); });
            const treasure = g.territories.find(t => !t.o && t.t === (g.map === 'cesko' ? 'Q193317' : 'Q40'));
            if (treasure) treasure.p = true;
            rescore(g);
        };
        // Bitvy o území (blok 25), jen s db.battles: stav hry má sieges a version. g.sieges = [{ id, territory, started_by, question, correct, status,
        // participants: [{ user, source, answered, picked, correct, answer_ms, result, move }], winner, outcome }]; čas stojí (NOW), termíny NOW + 50 s
        const LATER = '2026-11-11T10:00:50Z';
        const siegeJson = (g, s) => {
            const t = g.territories.find(x => x.t === s.territory);
            const mineP = s.participants.find(p => p.user === me.id);
            const done = s.status === 'resolved';
            return { id: s.id, game: g.id, territory: s.territory, status: s.status, started_by: s.started_by, started_at: NOW, join_until: LATER, ends_at: LATER, resolved_at: done ? NOW : null,
                winner: s.winner || null, outcome: s.outcome || null, mine: Boolean(mineP), answered: Boolean(mineP && mineP.answered), joined_at: mineP ? NOW : null, deadline: mineP ? LATER : null,
                can_join: !done && !mineP && t.o !== me.id,
                participants: s.participants.map(p => { const gp = g.players.find(x => x.user === p.user); return { ...db.profiles[p.user], seat: gp.seat, flag_color: gp.flag_color, emblem: gp.emblem, source: p.source || null, joined_at: NOW, deadline: LATER, answered: Boolean(p.answered), fifty: Boolean(p.fifty), me: p.user === me.id,
                    ...(done ? { correct: Boolean(p.correct), answer_ms: p.answered ? p.answer_ms : null, result: p.result, winner: s.winner === p.user, move: p.move } : {}) }; }) };
        };
        const siegeView = (g, s) => {
            const mineP = s.participants.find(p => p.user === me.id);
            return { ...siegeJson(g, s), now: NOW, ...(mineP ? { question: s.question, removed: mineP.fifty || null, answer: mineP.answered ? { choice: mineP.picked, correct: Boolean(mineP.correct), answer_ms: mineP.answer_ms, late: false } : null,
                correct_choice: mineP.answered || s.status === 'resolved' ? s.correct : null, result: mineP.result || null, move: mineP.move || null } : {}) };
        };
        const battles = (g) => (db.battles && g.status !== 'lobby' ? { sieges: (g.sieges || []).filter(s => s.status === 'open').map(s => siegeJson(g, s)), version: `${g.moves.length}.${g.siegeRev || 0}.${g.status}` } : {});
        // Další kolo (blok 26), jen s db.rounds: stav hry a puls mají round (g.round řídí test); db.now = čas serveru (jinak NOW)
        const rounds = (g) => (db.rounds && g.round ? { round: g.round } : {});
        const state = (g) => ({ ...summary(g), now: db.now || NOW, ...rounds(g), ...(g.status === 'lobby' ? {} : { ...gameItems(g), territories: g.territories, budget: g.status === 'running' ? budget(g) : null, moves: g.moves.slice(-150), claimed: Boolean(mine(g) && mine(g).claimed),
            history: g.status === 'finished' ? g.moves.filter(m => ['home', 'respawn', 'capture'].includes(m.r)) : null, ...battles(g),
            // Tahy všech hráčů v tomto kole (schéma 27)
            budgets: g.status === 'running' ? Object.fromEntries(g.players.map(p => { const used = g.moves.filter(m => m.u === p.user && ['attack', 'fortify'].includes(m.k) && (m.n || 0) === (g.periodNo || 0)).length; const extra = extraOf(g, p.user); return [p.user, { left: Math.max(0, g.actions + extra - used), total: g.actions + extra, extra }]; })) : null }) });
        // Vyhodnocení bitvy: vítěz = správně s nejkratším časem (dobude, nebo pobourá), ostatní fail / outrun
        const resolveSiege = (g, s) => {
            const t = g.territories.find(x => x.t === s.territory);
            const win = s.participants.filter(p => p.correct).sort((a, b) => a.answer_ms - b.answer_ms)[0] || null;
            for (const p of s.participants.filter(x => x !== win)) {
                const move = { id: db.seq++, u: p.user, k: 'attack', t: t.t, s: p.source || null, ok: Boolean(p.correct), v: t.o, n: 0, at: NOW, p: false, h: false, l: t.l, r: p.correct ? 'outrun' : 'fail' };
                g.moves.push(move); p.result = move.r; p.move = move;
            }
            if (win) {
                const move = { id: db.seq++, u: win.user, k: 'attack', t: t.t, s: win.source || null, ok: true, v: t.o, n: 0, at: NOW, p: false, h: false, l: t.l };
                if (t.l > 0) { t.l -= 1; move.r = 'breach'; } else { move.p = t.p; move.h = t.h && Boolean(t.o); Object.assign(t, { o: win.user, l: 0, h: false, p: false }); move.r = 'capture'; }
                move.l = t.l; g.moves.push(move); win.result = move.r; win.move = move;
            }
            Object.assign(s, { status: 'resolved', winner: win ? win.user : null, outcome: win ? win.result : 'fail' });
            g.siegeRev = (g.siegeRev || 0) + 1;
            rescore(g);
        };
        const siegeOf = (id) => { for (const g of db.games) { const s = (g.sieges || []).find(x => x.id === id); if (s) return { g, s }; } return {}; };
        // Vývojářští boti (blok 22): do lobby (chtějí hrát, plná hra začne), jejich tahy hned (každý bot dobude jedno volné území), další období
        if (name === 'dev_conquest_add_bots') {
            const g = find(body.game);
            const colours = ['bila', 'nebeska', 'hneda', 'zelena', 'zluta', 'fialova', 'oranzova', 'tyrkysova', 'ruzova', 'cerna'].filter(c => !g.players.some(p => p.flag_color === c));
            const count = Math.min(body.how_many, g.max_players - g.players.length);
            for (let i = 0; i < count; i++) {
                const bot = `bot-${db.seq++}`;
                db.profiles[bot] = player(bot, `Bot ${['Adam', 'Dana', 'Emil'][(g.players.length - 1) % 3]}`, '🤖');
                g.players.push({ user: bot, seat: g.players.length, flag_color: colours[i], emblem: 'drak', ready: true });
            }
            if (g.players.length >= g.max_players) start(g);
            return json(summary(g));
        }
        if (name === 'dev_conquest_bots_play') {
            const g = find(body.game);
            let made = 0;
            g.players.filter(p => p.user.startsWith('bot-')).forEach(p => {
                const free = g.territories.find(t => !t.o && !t.p);
                if (!free) return;
                free.o = p.user;
                g.moves.push({ id: db.seq++, u: p.user, k: 'attack', t: free.t, s: null, ok: true, r: 'capture', v: null, n: g.periodNo || 0, at: NOW, p: false, h: false, l: 0 });
                made += 1;
            });
            rescore(g);
            return json(made);
        }
        if (name === 'dev_conquest_next_period') {
            const g = find(body.game);
            g.periodNo = (g.periodNo || 0) + 1;
            if (db.loseHome) g.penaltyPeriod = g.periodNo;
            return json(state(g));
        }
        // Pomůcky (blok 30)
        if (name.startsWith('player_items') || name === 'conquest_use_extra' || name === 'conquest_use_fifty' || name === 'conquest_use_revive') {
            if (!db.items) return fail('Not found', 404);
            const items = db.items[me.id] = { extra_move: 0, fifty: 0, chain_rescue: 0, ...(db.items[me.id] || {}) };
            if (name === 'player_items_mine') return json(stock());
            // Sezóna (5. stupeň Půl na půl, 12. Záchrana navíc, 15. Tah navíc), truhla a Zlatá truhla (db.chestLucky = los vyšel; Zlatá truhla
            // dává Záchranu navíc, blok 37); plná zásoba nic nepřidá
            if (name === 'player_items_claim') {
                const kind = body.source === 'season' ? (/:15$/.test(body.key) ? 'extra_move' : /:12$/.test(body.key) ? 'chain_rescue' : 'fifty') : body.source === 'gold' ? 'chain_rescue' : 'fifty';
                // Truhla se vzácným vzorem Duha (blok 38, db.chestPattern): los 100–129, tedy jen bez pomůcky
                if ((body.source === 'chest' || body.source === 'gold') && !db.chestLucky) return json({ kind, granted: false, full: false, already: false, lucky: false, ...(body.source === 'chest' && db.chestPattern ? { pattern: 'duha' } : {}), items: stock() });
                const max = kind === 'fifty' ? 2 : 1;
                if (items[kind] >= max) return json({ kind, granted: false, full: true, already: false, count: items[kind], max, items: stock() });
                items[kind] += 1;
                return json({ kind, granted: true, full: false, already: false, count: items[kind], max, ...(body.source !== 'season' ? { lucky: true } : {}), items: stock() });
            }
            const g = find(body.game);
            // Vzkříšení: jen bez území a se zásobou; cíl neutrální nebo cizí neopevněné, ne domovský hrad ani chráněné; ochrana do NOW + 60 s
            if (name === 'conquest_use_revive') {
                if (!db.revive) return fail('Not found', 404);
                const info = gameItems(g).items;
                if (!info.can_revive) return fail(info.revive_block);
                const t = g.territories.find(x => x.t === body.target);
                if (!t) return fail('Tohle území na mapě není.');
                if (t.o && t.h) return fail('Domovský hrad Vzkříšením vzít nejde. Vyber volné nebo neopevněné území.');
                if (t.o && t.l > 0) return fail('Opevněné území Vzkříšením vzít nejde. Vyber volné nebo neopevněné území.');
                if (t.o && t.s) return fail('Území je chráněné po vzkříšení ještě 60 s.');
                const victim = t.o;
                g.moves.push({ id: db.seq++, u: me.id, k: 'revive', t: t.t, s: null, ok: true, r: 'respawn', v: victim, n: g.periodNo || 0, at: NOW, p: Boolean(t.p && !victim), h: false, l: 0 });
                Object.assign(t, { o: me.id, l: 0, h: false, p: false, s: SHIELD_UNTIL });
                items.revive -= 1;
                rescore(g);
                return json({ ...state(g), used: 'revive', territory: t.t, shield_until: SHIELD_UNTIL });
            }
            if (name === 'conquest_use_extra') {
                const info = gameItems(g).items;
                if (!info.can_extra) return fail(info.extra_block);
                items.extra_move -= 1;
                g.moves.push({ id: db.seq++, u: me.id, k: 'extra', t: null, s: null, ok: true, r: 'extra', v: null, n: g.periodNo || 0, at: NOW, p: false, h: false, l: 0 });
                // Kolo už není dohrané (hráč má zase tah) a jeho „Chci další kolo“ zmizí
                if (g.round) g.round = { ...g.round, done: false, can_ready: false, ready: g.round.ready.filter(uid => uid !== me.id) };
                return json({ ...state(g), used: 'extra_move' });
            }
            if ((g.fiftyUsed || {})[me.id]) return fail('Půl na půl jde v jedné hře použít jen jednou.');
            if (items.fifty < 1) return fail('Půl na půl teď nemáš.');
            let removed = null;
            if (body.siege) {
                const { s } = siegeOf(body.siege);
                const p = s.participants.find(x => x.user === me.id);
                removed = [0, 1, 2, 3].filter(i => i !== s.correct).slice(1, 3);
                p.fifty = removed;
                g.siegeRev = (g.siegeRev || 0) + 1;
            }
            items.fifty -= 1;
            g.fiftyUsed = { ...(g.fiftyUsed || {}), [me.id]: true };
            return json({ removed, items: stock(), fifty_used: true });
        }
        if (name === 'conquest_lobby') {
            // Vzory a vzácné znaky (blok 38): db.looks = { patterns, emblems, new, stats }, bez nich starší databáze
            return json({ ...(db.items ? { items: stock() } : {}), ...(db.looks ? { looks: db.looks } : {}), open: db.games.filter(g => g.status === 'lobby' && g.visibility === 'public').map(summary),
                mine: db.games.filter(g => mine(g)).map(g => ({ ...summary(g), budget: g.status === 'running' ? budget(g) : null, claimed: Boolean(mine(g).claimed),
                    owners: g.territories ? Object.fromEntries(g.territories.filter(t => t.o).map(t => [t.t, g.players.find(p => p.user === t.o).seat])) : null })) });
        }
        if (name === 'conquest_create') {
            const g = { id: uuid(db.seq++), creator: me.id, map: body.map_id, max_players: body.players, hours: body.hours, period: body.per, actions: body.actions_per, visibility: body.vis, code: 'NEW234', preset: null, status: 'lobby', created_at: NOW,
                players: [{ user: me.id, seat: 0, flag_color: body.colour, emblem: body.emblem_id, pattern: body.pattern_id || null, ready: false }] };
            db.games.push(g);
            // Druhý hráč se hned přidá a chce hrát
            if (db.autoJoin) g.players.push({ user: 'u-2', seat: 1, flag_color: 'cervena', emblem: 'orel', ready: true });
            return json(summary(g));
        }
        if (name === 'conquest_invite') {
            const g = find(body.game);
            if (!g || !mine(g)) return fail('Tuhle hru nehraješ.');
            if (body.friends.some(fid => !((db.friends || {})[me.id] || []).includes(fid))) return fail('Pozvat můžeš jen své přátele.');
            const fresh = body.friends.filter(fid => !g.players.some(p => p.user === fid) && !waiting(g).some(i => i.user === fid));
            if (waiting(g).length + fresh.length > g.max_players - g.players.length) return fail(`Volná místa ve hře: ${g.max_players - g.players.length - waiting(g).length}. Vyber méně přátel.`);
            db.invites = [...(db.invites || []).filter(i => !(i.game === g.id && fresh.includes(i.user))), ...fresh.map(fid => ({ game: g.id, user: fid, by: me.id, declined: false }))];
            return json(summary(g));
        }
        if (name === 'conquest_invites_mine') {
            return json((db.invites || []).filter(i => i.user === me.id && !i.declined).map(i => ({ invite: i, g: find(i.game) }))
                .filter(({ g }) => g && g.status === 'lobby' && !mine(g) && g.players.length < g.max_players)
                .map(({ invite, g }) => ({ ...summary(g), code: g.code, invited_at: NOW, invited_by: db.profiles[invite.by] })));
        }
        if (name === 'conquest_decline_invite') {
            (db.invites || []).filter(i => i.game === body.game && i.user === me.id).forEach(i => { i.declined = true; });
            return route.fulfill({ status: 204, body: '' });
        }
        if (name === 'conquest_join') {
            const g = body.join_code ? db.games.find(x => x.code === body.join_code) : find(body.game);
            if (!g) return fail('Hra s tímhle kódem není. Zkontroluj ho.');
            // Soukromá hra podle id jen s pozvánkou; přidáním pozvánka zmizí
            if (!body.join_code && g.visibility === 'private' && !(db.invites || []).some(i => i.game === g.id && i.user === me.id && !i.declined)) return fail('Hra s tímhle kódem není. Zkontroluj ho.');
            db.invites = (db.invites || []).filter(i => !(i.game === g.id && i.user === me.id));
            if (g.players.some(p => p.flag_color === body.colour)) return fail('Tuhle barvu už má jiný hráč. Vyber jinou.');
            g.players.push({ user: me.id, seat: g.players.length, flag_color: body.colour, emblem: body.emblem_id, pattern: body.pattern_id || null, ready: false });
            if (g.players.length >= g.max_players) start(g);
            return json(summary(g));
        }
        if (name === 'conquest_ready') {
            const g = find(body.game);
            mine(g).ready = body.is_ready;
            if (g.players.length >= 2 && g.players.every(p => p.ready)) start(g);
            return json(summary(g));
        }
        if (name === 'conquest_set_look') { const g = find(body.game); Object.assign(mine(g), { flag_color: body.colour, emblem: body.emblem_id, ...('pattern_id' in body ? { pattern: body.pattern_id } : {}) }); return json(summary(g)); }
        if (name === 'conquest_looks_seen') { if (db.looks) db.looks = { ...db.looks, new: [] }; return route.fulfill({ status: 204, body: '' }); }
        if (name === 'conquest_leave') { const g = find(body.game); g.players = g.players.filter(p => p.user !== me.id); return route.fulfill({ status: 204, body: '' }); }
        if (name === 'conquest_state') return json(state(find(body.game)));
        if (name === 'conquest_pulse') {
            if (!db.battles && !db.rounds) return fail('Not found', 404);
            const g = find(body.game);
            return json({ id: g.id, now: db.now || NOW, status: g.status, ends_at: g.ends_at, ...battles(g), ...rounds(g), results: (g.sieges || []).filter(s => s.status === 'resolved' && s.participants.some(p => p.user === me.id)).map(s => siegeJson(g, s)) });
        }
        if (name === 'conquest_round_ready') {
            if (!db.rounds) return fail('Not found', 404);
            const g = find(body.game);
            if (!g.round.done) return fail('Další kolo jde chtít, až všichni dohrají své tahy.');
            if (!g.round.next_at) {
                g.round.ready = body.ready === false ? g.round.ready.filter(id => id !== me.id) : [...new Set([...g.round.ready, me.id])];
                if (g.players.every(p => g.round.ready.includes(p.user))) {
                    const next = Date.parse(db.now || NOW) + 10000;
                    g.round.next_at = new Date(next).toISOString();
                    // Přeskočený zbytek kola se odečte i z konce hry (schéma 28)
                    g.ends_at = new Date(Date.parse(g.ends_at) - Math.max(0, Date.parse(g.round.ends_at) - next)).toISOString();
                }
            }
            return json(g.round);
        }
        if (name === 'conquest_siege_begin') {
            const g = find(body.game);
            if (g.territories.some(x => x.t === body.target && x.s && x.o !== me.id)) return fail('Území je chráněné po vzkříšení ještě 60 s.');
            if ((g.sieges || []).some(s => s.status === 'open' && s.territory === body.target)) return fail('Na území právě probíhá bitva. Můžeš se přidat.');
            const s = { id: uuid(db.seq++), territory: body.target, started_by: me.id, question: body.question, correct: body.correct, status: 'open', participants: [{ user: me.id, source: body.source }] };
            g.sieges = [...(g.sieges || []), s];
            g.siegeRev = (g.siegeRev || 0) + 1;
            return json({ ...siegeView(g, s), budget: budget(g) });
        }
        if (name === 'conquest_siege_join') {
            const { g, s } = siegeOf(body.siege);
            if (s.status !== 'open') return fail('Bitva už skončila.');
            if (!s.participants.some(p => p.user === me.id)) s.participants.push({ user: me.id, source: body.source });
            g.siegeRev += 1;
            return json({ ...siegeView(g, s), budget: budget(g) });
        }
        if (name === 'conquest_siege_answer') {
            const { g, s } = siegeOf(body.siege);
            const p = s.participants.find(x => x.user === me.id);
            if (!p.answered && s.status === 'open') {
                Object.assign(p, { answered: true, picked: body.choice, correct: body.choice === s.correct, answer_ms: (db.answerMs || {})[me.id] || 4200 });
                g.siegeRev += 1;
                if (s.participants.every(x => x.answered)) resolveSiege(g, s);
            }
            const done = s.status === 'resolved';
            return json({ correct: Boolean(p.correct), status: done ? 'resolved' : 'waiting', late: false, answer_ms: p.answer_ms, correct_choice: s.correct, siege: siegeView(g, s), now: NOW, ...(done ? { move: p.move, state: state(g) } : {}) });
        }
        if (name === 'conquest_siege_status') {
            const { g, s } = siegeOf(body.siege);
            if (s.status === 'open' && s.participants.every(x => x.answered)) resolveSiege(g, s);
            return json(siegeView(g, s));
        }
        if (name === 'conquest_move') {
            const g = find(body.game);
            const t = g.territories.find(x => x.t === body.target);
            if (body.move_kind === 'attack' && t.s && t.o !== me.id) return fail('Území je chráněné po vzkříšení ještě 60 s.');
            const forced = db.force.shift();
            const correct = forced ? forced !== 'fail' : body.is_correct;
            let r = 'fail';
            const victim = t.o;
            const move = { id: db.seq++, u: me.id, k: body.move_kind, t: t.t, s: body.source, ok: correct, v: victim, n: 0, at: NOW, p: false, h: false, l: t.l };
            if (body.move_kind === 'fortify') { if (correct) { t.l += 1; r = 'fortify'; } }
            else if (correct && t.l > 0) { t.l -= 1; r = 'breach'; }
            else if (correct) { move.p = t.p; move.h = t.h && Boolean(t.o); Object.assign(t, { o: me.id, l: 0, h: false, p: false }); r = 'capture'; }
            move.r = r;
            move.l = t.l;
            g.moves.push(move);
            rescore(g);
            return json({ ...state(g), move });
        }
        if (name === 'conquest_claim') {
            const g = find(body.game);
            const p = mine(g);
            const fresh = !p.claimed;
            p.claimed = true;
            return json({ place: p.place, players: g.players.length, score: p.score, moves: 5, eligible: true, claimed_now: fresh });
        }
        return json({});
    });
};

// only = jen tato forma otázky tahu (window.MUDRLANT_CONQUEST_ONLY), wiki = 'article' (úvod článku s názvem položky), 'abort' (bez sítě)
// nebo 'hang' (neodpoví), images = 'abort' (obrázky z Commons nejdou)
const ARTICLE = (title) => `${title} je velmi známé místo nebo osobnost, o které se píše v učebnicích, průvodcích i novinách celého světa. ${title} patří k tomu nejznámějšímu, co území nabízí, a každý rok přibývají další knihy, filmy a výstavy. Popis pokračuje dalšími větami o historii, lidech a místech, aby byl delší než rámeček otázky na malém telefonu a posouval se uvnitř něj, ne celá stránka. Další věta přidává podrobnosti o tom, jak se o něm mluví doma i v cizině, a ještě jedna o tom, proč ho zná skoro každý.`;
const setup = async (browser, { viewport = { width: 360, height: 640 }, colorScheme = 'light', reducedMotion = 'no-preference', storage = {}, only = null, wiki = null, images = null } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, reducedMotion, deviceScaleFactor: 1 });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    if (only) await context.addInitScript(value => { window.MUDRLANT_CONQUEST_ONLY = value; }, only);
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => (key.startsWith('session:') ? sessionStorage.setItem(key.slice(8), value) : localStorage.setItem(key, value)));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'session:mudrlant.nav': 'souperi', 'mudrlant.tips': JSON.stringify({ off: true }), ...login('tok-u1'), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route(`${ORIGIN}/**`, route => route.fulfill(serveFile(new URL(route.request().url()).pathname)));
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN || url.hostname === 'proj.supabase.co') return route.fallback();
        if (url.hostname === 'cs.wikipedia.org') {
            if (wiki === 'abort') return route.abort();
            if (wiki === 'hang') return null;
            const title = url.searchParams.get('titles') || '';
            return route.fulfill({ json: { query: { pages: wiki === 'article' ? { 1: { title, extract: ARTICLE(title) } } : {} } } });
        }
        if (url.hostname === 'upload.wikimedia.org' && images === 'abort') return route.abort();
        if (/\.(png|jpe?g|webp)$/i.test(url.pathname)) return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    await tab.clock.setFixedTime(new Date(NOW));
    return { context, tab, log };
};
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `dobyvani-${name}.png`) }); };
const fits = (tab) => tab.evaluate(() => {
    const content = document.getElementById('app-content');
    return { vertical: content.scrollHeight - content.clientHeight, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: content.scrollWidth - content.clientWidth };
});
// Klepnutí na území: bod popisku (je uvnitř území) převedený na obrazovku
const tapTerritory = async (tab, id) => {
    const point = await tab.evaluate((territory) => {
        const svg = document.querySelector('[data-cq-map] svg');
        const label = svg.querySelector(`[data-label="${territory}"]`);
        const hit = svg.querySelector(`.cq-hit[data-t="${territory}"]`);
        const data = window.__cqAnchor || null;
        const ctm = svg.getScreenCTM();
        // Bod u středu území: nad výchozím místem popisku, nebo (u už ukázaného, usazeného popisku) uprostřed textu
        const x = Number(label.getAttribute('x'));
        const size = Number(label.getAttribute('font-size') || 10);
        const inside = (py) => { try { return hit.isPointInFill(new DOMPoint(x, py)); } catch (e) { return false; } };
        const y = [Number(label.getAttribute('y')) - size * 1.2, Number(label.getAttribute('y')) - size * 0.25].find(inside) ?? Number(label.getAttribute('y')) - size * 1.2;
        return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f, ok: Boolean(hit), data };
    }, id);
    assert.ok(point.ok);
    await tab.mouse.click(point.x, point.y);
};

// Atributy (i styl) v obsahu stránky, ve kterých je některý z kousků (adresa z Commons, název souboru – často odpověď)
const attributeLeaks = (tab, parts) => tab.evaluate((fragments) => {
    const decoded = (value) => { try { return decodeURIComponent(value); } catch (e) { return value; } };
    return [document.body, ...document.body.querySelectorAll('*')].flatMap(element => [...element.attributes]
        .filter(attribute => fragments.some(part => attribute.value.includes(part) || decoded(attribute.value).includes(part)))
        .map(attribute => `${element.tagName.toLowerCase()}[${attribute.name}]`));
}, parts);
// Šířka výřezu mapy (viewBox) a šířka po doběhnutí přiblížení (beze změny po dva snímky)
const viewWidth = (tab) => tab.evaluate(() => document.querySelector('[data-cq-map] svg').viewBox.baseVal.width);
// (waitForFunction na Promise nečeká, proto vlastní smyčka s evaluate)
const settledWidth = async (tab) => {
    for (let i = 0; i < 100; i += 1) {
        const steady = await tab.evaluate(() => new Promise(resolve => {
            const width = () => document.querySelector('[data-cq-map] svg').viewBox.baseVal.width;
            const first = width();
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(width() === first ? first : null))));
        }));
        if (steady !== null) return steady;
    }
    throw new Error('Přiblížení mapy nedoběhlo');
};
// Popisek území: viditelný, velikost na displeji (px) a jestli je celý (bez okrajů písma) uvnitř území
const labelBox = (tab, id) => tab.evaluate((territory) => {
    const svg = document.querySelector('[data-cq-map] svg');
    const text = svg.querySelector(`[data-label="${territory}"]`);
    const hit = svg.querySelector(`.cq-hit[data-t="${territory}"]`);
    const box = text.getBBox();
    const mx = box.width * 0.04, my = box.height * 0.18;
    const corners = [[box.x + mx, box.y + my], [box.x + box.width - mx, box.y + my], [box.x + mx, box.y + box.height - my], [box.x + box.width - mx, box.y + box.height - my]];
    const vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect();
    const px = Number(text.getAttribute('font-size')) * Math.min(rect.width / vb.width, rect.height / vb.height);
    return { shown: getComputedStyle(text).display !== 'none', inside: corners.every(([x, y]) => hit.isPointInFill(new DOMPoint(x, y))), px };
}, id);

test('Dobývání', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, options = {}) => {
        const page = await setup(browser, options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await page.tab.waitForSelector('#conquest-card', { timeout: 30000 });
        return page;
    };

    await t.test('dlaždice na záložce Soupeři, rozcestník, Lobby s Rychlými hrami, založení soukromé hry, Barva a znak, Chci hrát a začátek hry', async () => {
        const db = newDb();
        db.autoJoin = true;
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Najdi hru nebo založ vlastní/.test(document.getElementById('conquest-card').textContent));
        // Dlaždice Dobývání je jedna ze čtyř dlaždic záložky Soupeři (Výzvy, Dobývání, Turnaje, Skupiny); bez hry a pozvánky nic nečeká
        assert.deepEqual(await tab.$$eval('#souperi-tiles > *', tiles => tiles.map(tile => tile.id)), ['challenges-tile', 'conquest-card', 'tournaments-tile', 'groups-tile']);
        assert.equal(await tab.locator('#conquest-wait').count(), 0, 'bez hry na tahu není řádek v Čeká na tebe');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'záložka Soupeři se vejde na 360×640');
        await shot(tab, 'karta-360');
        await tab.click('#conquest-card');
        await tab.waitForSelector('#conquest-hub');
        assert.match(await tab.textContent('#status-text'), /Dobývání/);
        await tab.waitForSelector('#conquest-hub [data-cq-tab="mine"][aria-selected="true"]');
        await tab.waitForFunction(() => /Zatím nehraješ žádnou hru/.test(document.getElementById('conquest-hub').textContent));
        // Jak se hraje: okno se vejde na 360×640
        await tab.click('[data-cq="help"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Jak se hraje Dobývání');
        // Pět záložek (Základy, Útok, Regiony, Konec, Pomůcky), každá se vejde; tlačítko Dál vede na další
        for (const [tabId, pattern] of [['zaklady', /Kola:[\s\S]*Chci další kolo[\s\S]*Tahy:/], ['utok', /Správně:[\s\S]*Opevnění:/], ['regiony', /Region: Skupina sousedních území[\s\S]*Britské ostrovy/], ['konec', /Body:[\s\S]*Odměny:/],
            ['pomucky', /Pomůcky:[\s\S]*Tah navíc:[\s\S]*Půl na půl:[\s\S]*Jak získat: Tah navíc: Boss týdne/]]) {
            await tab.waitForSelector(`[data-cq-help="${tabId}"]`);
            assert.match(await tab.textContent('[data-cq-help]'), pattern, tabId);
            const helpFit = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return { over: box.scrollHeight - box.clientHeight, top: rect.top, bottom: rect.bottom }; });
            assert.ok(helpFit.over <= 0 && helpFit.top >= 0 && helpFit.bottom <= 640, `nápověda ${tabId} se vejde: ${JSON.stringify(helpFit)}`);
            await shot(tab, `napoveda-${tabId}-360`);
            if (tabId !== 'pomucky') await tab.click('[data-cq-help] button[data-cq-help-tab]:not([role="tab"])');
        }
        await tab.click('[data-cq-help-tab="regiony"][role="tab"]');
        await tab.waitForSelector('[data-cq-help="regiony"]');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        await tab.click('[role="tab"][data-cq-tab="lobby"]');
        await tab.waitForSelector(`[data-cq-join="${uuid(1)}"]`);
        assert.equal(await tab.locator('[data-cq-join]').count(), 2);
        assert.match((await tab.textContent(`[data-cq-game="${uuid(2)}"]`)).replace(/\s+/g, ' '), /Česko\s*Rychlá hra\s*12 h · 3 tahy za hodinu/);
        await tab.waitForFunction(() => document.querySelectorAll('[data-cq-game] .cq-thumb path').length > 10, null, { timeout: 15000 });
        await shot(tab, 'lobby-360');
        // Založit hru: Česko, tempo Blesk ve shrnutí, pak Vlastní: kolo 1 h, hra 12 h, soukromá; barva a znak
        await tab.click('[role="tab"][data-cq-tab="create"]');
        await tab.click('[data-cq-set="map"][data-value="cesko"]');
        await tab.click('[data-cq-tempo="blesk"]');
        assert.match((await tab.textContent('[data-cq-form]')).replace(/\s+/g, ' '), /Česko\s*Blesk\s*Hra 20 min · 4 kola po 5 min\s*5 tahů za kolo/);
        await shot(tab, 'zalozit-tempo-360');
        await tab.click('[data-cq="tempo-custom"]');
        await tab.click('[data-cq-set="period"][data-value="hour"]');
        await tab.click('[data-cq-set="minutes"][data-value="720"]');
        assert.match(await tab.textContent('[data-cq-summary]'), /Hra 12 h · 12 kol po 1 h/);
        await tab.click('[data-cq-set="visibility"][data-value="private"]');
        for (let i = 0; i < 6; i++) await tab.click('[data-cq-step="players"][data-delta="1"]:not([disabled])').catch(() => {});
        assert.equal(await tab.textContent('[data-cq-value="players"]'), '6', 'Česko: nejvýš 6 hráčů');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'formulář se vejde na 360×640');
        await shot(tab, 'zalozit-360');
        await tab.click('[data-cq="look"]');
        await tab.waitForSelector('[data-cq-look]');
        await tab.click('[data-cq-color="modra"]');
        await tab.click('[data-cq-look-tab="emblem"]');
        await tab.click('[data-cq-emblem="vlk"]');
        const dialogFit = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return { over: box.scrollHeight - box.clientHeight, bottom: rect.bottom, top: rect.top }; });
        assert.ok(dialogFit.over <= 0 && dialogFit.top >= 0 && dialogFit.bottom <= 640, `okno Barva a znak se vejde: ${JSON.stringify(dialogFit)}`);
        await shot(tab, 'barva-znak-360');
        await tab.click('[data-cq="look-done"]');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        assert.match(await tab.textContent('[data-cq="look"]'), /Modrá · Vlk/);
        await tab.click('[data-cq-form] button[type="submit"]');
        await tab.waitForSelector('[data-cq-lobby-detail]');
        const create = db.calls.find(call => call.name === 'conquest_create').body;
        assert.deepEqual([create.map_id, create.players, create.hours, create.per, create.actions_per, create.vis, create.colour, create.emblem_id], ['cesko', 6, 12, 'hour', 5, 'private', 'modra', 'vlk']);
        assert.match(await tab.textContent('[data-cq-lobby-detail]'), /NEW234/);
        assert.match((await tab.textContent('[data-cq-lobby-detail]')).replace(/\s+/g, ' '), /Petr Svoboda Chce hrát/);
        await shot(tab, 'lobby-detail-360');
        // Chci hrát: všichni chtějí → hra začne a otevře se mapa
        await tab.click('[data-cq="ready"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.equal(await tab.locator('.cq-hit').count(), 14);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    for (const { width, height, colorScheme } of [{ width: 360, height: 640, colorScheme: 'light' }, { width: 390, height: 780, colorScheme: 'dark' }]) {
        await t.test(`výplně území a vzácné znaky na ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): oslava nově odemčeného, okno se záložkou Výplň a zamčenými, volba se pošle a ukáže; barevná výplň jiného hráče nejde`, async () => {
            const db = newDb();
            // V otevřené Rychlé hře má Eva Mistr Duhu (barevná výplň jen jednou ve hře)
            db.games[0].players[0].pattern = 'duha';
            db.looks = { patterns: ['plameny', 'brokat', 'duha'], emblems: ['sfinga'], new: [{ kind: 'pattern', item: 'brokat', at: NOW }], stats: { games: 3, battles: 12, sea: 7, wins: 10 } };
            const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme });
            await tab.click('#conquest-card');
            await tab.waitForSelector('#conquest-hub');
            // Nově odemčená výplň: oslava se vzorkem území a server ji dostane jako ohlášenou
            await tab.waitForFunction(() => /Nová výplň území/.test((document.getElementById('celebration') || {}).textContent || ''));
            assert.match(await tab.textContent('#celebration'), /Zlatý brokát\. Najdeš ji v okně Barva a znak/);
            assert.ok(await tab.locator('#celebration svg image[href="icons/vzory/brokat.webp"]').count() >= 1, 'vzorek území se vzorem');
            await tab.waitForTimeout(700);
            await shot(tab, `vzor-oslava-${width}-${colorScheme}`);
            await tab.click('#celebration');
            await tab.waitForFunction(() => !document.getElementById('celebration'));
            assert.ok(db.calls.some(call => call.name === 'conquest_looks_seen' && call.body.upto === NOW), 'ohlášeno do času odemčení');
            // Založit hru: okno Barva a znak se třemi záložkami
            await tab.click('[role="tab"][data-cq-tab="create"]');
            await tab.click('[data-cq="look"]');
            await tab.waitForSelector('[data-cq-look]');
            assert.equal(await tab.locator('[data-cq-look-tab]').count(), 3);
            const fit = () => tab.evaluate((h) => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return { over: box.scrollHeight - box.clientHeight, top: rect.top, bottom: rect.bottom, ok: rect.top >= 0 && rect.bottom <= h }; }, height);
            await tab.click('[data-cq-color="modra"]');
            await tab.click('[data-cq-look-tab="emblem"]');
            assert.equal(await tab.locator('[data-cq-rare] [data-cq-emblem]').count(), 12);
            assert.equal(await tab.locator('[data-cq-rare] [data-cq-locked]').count(), 11);
            // Zamčený: jen ukáže, jak ho získat (a postup), výběr se nezmění
            await tab.click('[data-cq-emblem="kraken"]');
            await tab.waitForFunction(() => /Kraken · Dobuď 40 území přes námořní cestu \(7\/40\)/.test(document.querySelector('[data-cq-look-info]').textContent));
            assert.equal(await tab.getAttribute('[data-cq-emblem="kraken"]', 'aria-checked'), 'false');
            await tab.click('[data-cq-emblem="sfinga"]');
            await tab.waitForSelector('[data-cq-emblem="sfinga"][aria-checked="true"]');
            let box = await fit();
            assert.ok(box.over <= 0 && box.ok, `Znak se vejde: ${JSON.stringify(box)}`);
            await shot(tab, `vzor-znaky-${width}-${colorScheme}`);
            await tab.click('[data-cq-look-tab="pattern"]');
            assert.equal(await tab.locator('[data-cq-pattern]').count(), 13);
            await tab.click('[data-cq-pattern="vlnky"]');
            await tab.waitForFunction(() => /Vlnky · Dobuď 15 území přes námořní cestu \(7\/15\)/.test(document.querySelector('[data-cq-look-info]').textContent));
            await tab.click('[data-cq-pattern="plameny"]');
            await tab.waitForSelector('[data-cq-pattern="plameny"][aria-checked="true"]');
            assert.match(await tab.textContent('[data-cq-look] .cq-ledger-title'), /Modrá · Sfinga · Plameny/);
            box = await fit();
            assert.ok(box.over <= 0 && box.ok, `Vzor se vejde: ${JSON.stringify(box)}`);
            assert.equal(await tab.locator('[data-cq-patterns] svg path[d^="M0 0H30"]').count(), 0, 'vzorky území, ne praporky');
            await shot(tab, `vzor-vzory-${width}-${colorScheme}`);
            await tab.click('[data-cq-look-tab="color"]');
            box = await fit();
            assert.ok(box.over <= 0 && box.ok, `Barva se vejde: ${JSON.stringify(box)}`);
            await shot(tab, `vzor-barvy-${width}-${colorScheme}`);
            await tab.click('[data-cq="look-done"]');
            await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
            assert.match(await tab.textContent('[data-cq="look"]'), /Modrá · Sfinga · Plameny/);
            assert.equal(await tab.locator('[data-cq="look"] svg image[href^="icons/vzory/"]').count(), 0, 'praporec bez výplně');
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'formulář se vejde');
            await tab.click('[data-cq-form] button[type="submit"]');
            await tab.waitForSelector('[data-cq-lobby-detail]');
            const create = db.calls.find(call => call.name === 'conquest_create').body;
            assert.deepEqual([create.emblem_id, create.pattern_id, create.colour], ['sfinga', 'plameny', 'modra']);
            // Lobby: vlastní praporec se vzácným znakem (výplň je jen na mapě)
            assert.equal(await tab.locator('[data-cq-lobby-detail] svg image[href^="icons/vzory/"]').count(), 0);
            assert.ok(await tab.locator('[data-cq-lobby-detail] svg image[href="icons/znaky/sfinga.webp"]').count() >= 1);
            await shot(tab, `vzor-lobby-${width}-${colorScheme}`);
            // Volba se pamatuje (prefs v zařízení)
            assert.deepEqual(await tab.evaluate(() => { const p = JSON.parse(localStorage.getItem('mudrlant.conquest')); return [p.emblem, p.pattern]; }), ['sfinga', 'plameny']);
            // Přidání do Rychlé hry, kde Duhu má jiný hráč: v okně je zašedlá a nejde vybrat
            await tab.click('[role="tab"][data-cq-tab="lobby"]');
            await tab.click(`[data-cq-join="${uuid(1)}"]`);
            await tab.waitForSelector('[data-cq-look]');
            await tab.click('[data-cq-look-tab="pattern"]');
            await tab.waitForSelector('[data-cq-pattern="duha"][disabled][data-cq-taken="pattern"]');
            assert.match(await tab.getAttribute('[data-cq-pattern="duha"]', 'aria-label'), /Duha \(má jiný hráč\)/);
            assert.match(await tab.textContent('[data-cq-look-info]'), /Plameny|Duha už má jiný hráč/);
            await tab.click('[data-cq-pattern="duha"]', { force: true });
            assert.equal(await tab.getAttribute('[data-cq-pattern="duha"]', 'aria-checked'), 'false', 'obsazenou výplň vybrat nejde');
            await shot(tab, `vypln-obsazena-${width}-${colorScheme}`);
            await tab.keyboard.press('Escape');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('starší databáze bez vzorů: okno Barva a znak jen se dvěma záložkami a základními znaky, uložený vzácný znak a vzor se nepošlou', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db, { storage: { 'mudrlant.conquest': JSON.stringify({ color: 'modra', emblem: 'sfinga', pattern: 'plameny' }) } });
        await tab.click('#conquest-card');
        await tab.waitForSelector('#conquest-hub');
        await tab.waitForFunction(() => /Zatím nehraješ žádnou hru/.test(document.getElementById('conquest-hub').textContent));
        await tab.click('[role="tab"][data-cq-tab="create"]');
        assert.match(await tab.textContent('[data-cq="look"]'), /Modrá · Lev/, 'vzácný znak bez databáze nejde');
        await tab.click('[data-cq="look"]');
        await tab.waitForSelector('[data-cq-look]');
        assert.equal(await tab.locator('[data-cq-look-tab]').count(), 2);
        await tab.click('[data-cq-look-tab="emblem"]');
        assert.equal(await tab.locator('[data-cq-emblem]').count(), 24);
        await tab.click('[data-cq="look-done"]');
        await tab.click('[data-cq-form] button[type="submit"]');
        await tab.waitForSelector('[data-cq-lobby-detail]');
        const create = db.calls.find(call => call.name === 'conquest_create').body;
        assert.equal('pattern_id' in create, false);
        assert.equal(create.emblem_id, 'lev');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('vývojář: boti do lobby (+1 bot, Doplnit boty), plná hra začne; ve hře Boti odehrají tahy a Další období; bez vývojářského režimu lišta není', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db, { storage: { 'mudrlant.dev': '1' } });
        await tab.click('#conquest-card');
        await tab.waitForSelector('#conquest-hub');
        await tab.click('[role="tab"][data-cq-tab="create"]');
        await tab.click('[data-cq-set="map"][data-value="evropa"]');
        await tab.waitForSelector('[data-cq-form] button[type="submit"]');
        while (Number(await tab.textContent('[data-cq-value="players"]')) > 4) await tab.click('[data-cq-step="players"][data-delta="-1"]');
        while (Number(await tab.textContent('[data-cq-value="players"]')) < 4) await tab.click('[data-cq-step="players"][data-delta="1"]');
        await tab.click('[data-cq-form] button[type="submit"]');
        await tab.waitForSelector('[data-cq-lobby-detail] [data-cq-dev]');
        assert.match(await tab.textContent('[data-cq-dev]'), /Vývojář\s*\+1 bot\s*Doplnit boty \(3\)/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'lobby s lištou vývojáře se vejde na 360×640');
        await shot(tab, 'vyvojar-lobby-360');
        await tab.click('[data-cq="dev-bot"]');
        await tab.waitForFunction(() => /Bot je ve hře a chce hrát/.test((document.getElementById('toast') || {}).textContent || ''));
        assert.match((await tab.textContent('[data-cq-lobby-detail]')).replace(/\s+/g, ' '), /Bot Adam Chce hrát/);
        assert.match(await tab.textContent('[data-cq-dev]'), /Doplnit boty \(2\)/);
        await tab.click('[data-cq="dev-bots-full"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.deepEqual(db.calls.filter(call => call.name === 'dev_conquest_add_bots').map(call => call.body.how_many), [1, 2]);
        await tab.waitForSelector('#conquest-game [data-cq-dev]');
        assert.match(await tab.textContent('#conquest-game [data-cq-dev]'), /Boti odehrají tahy\s*Další období/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'hra s lištou vývojáře se vejde na 360×640');
        await shot(tab, 'vyvojar-hra-360');
        await tab.click('[data-cq="dev-play"]');
        await tab.waitForFunction(() => /Boti odehráli 3 tahy\./.test((document.getElementById('toast') || {}).textContent || ''));
        await tab.waitForFunction(() => /Bot/.test(document.querySelector('[data-cq-recent]').textContent));
        await tab.click('[data-cq="dev-period"]');
        await tab.waitForFunction(() => /Začal 2\. den hry\./.test((document.getElementById('toast') || {}).textContent || ''));
        assert.ok(db.calls.some(call => call.name === 'dev_conquest_next_period'));
        assert.equal(await tab.locator('[data-cq-penalty]').count(), 0, 'bez ztráty hradu bez −1');
        // Ztracený hrad: v dalším období o tah méně – toast a počítadlo s červeným −1; lišta se vejde na 360×640
        db.loseHome = true;
        await tab.click('[data-cq="dev-period"]');
        await tab.waitForFunction(() => /^Začal 3\. den hry\. Kvůli ztracenému hradu máš o tah méně\.$/.test(((document.getElementById('toast') || {}).textContent || '').trim()));
        await tab.waitForSelector('[data-cq-budget] [data-cq-penalty]');
        assert.equal((await tab.textContent('[data-cq-budget]')).replace(/\s+/g, ' ').trim(), 'Tahy 4/4−1, o 1 méně kvůli ztracenému hradu');
        assert.equal(await tab.getAttribute('[data-cq-budget]', 'title'), 'Tahy v tomto období (o 1 méně kvůli ztracenému hradu). Klepni pro pomůcky');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'hra s −1 se vejde na 360×640');
        const bar = await tab.evaluate(() => {
            const box = (el) => el.getBoundingClientRect();
            const feed = box(document.querySelector('#conquest-game [data-cq="feed"]'));
            const chip = box(document.querySelector('[data-cq-budget]'));
            const title = document.querySelector('.cq-cartouche-title');
            return { feedRight: feed.right, chipRight: chip.right, feedLeft: feed.left, title: box(title).width, titleFull: title.scrollWidth <= title.clientWidth + 1 };
        });
        assert.ok(bar.feedRight <= 360 && bar.chipRight <= bar.feedLeft && bar.title > 40 && bar.titleFull, `lišta hry: ${JSON.stringify(bar)}`);
        await shot(tab, 'ztraceny-hrad-360');
        // Klepnutí na upozornění na útok (aplikace běží): service worker pošle push-open s kódem hry a hra se otevře rovnou
        const code = db.games.find(g => g.status === 'running').code;
        await tab.click('#conquest-game [data-cq="hub"]');
        await tab.waitForSelector('#conquest-hub');
        await tab.evaluate((value) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'push-open', tab: '', vyzva: '', dobyvani: value, kind: 'conquest' } })), code);
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.equal(await tab.locator('#dialog-overlay').count(), 0, 'bez okna s kódem a barvou');
        // Kód cizí hry otevře okno Mám kód hry (s vyplněným kódem) jako dřív
        await tab.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'push-open', dobyvani: 'EVR234', kind: 'conquest' } })));
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Mám kód hry');
        assert.equal(await tab.inputValue('#conquest-code'), 'EVR234');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
        // Klepnutí na upozornění, když aplikace neběží: odkaz …?dobyvani=KÓD otevře rovnou hru a toast řekne, že je o tah méně
        const cold = await setup(browser, { storage: { 'mudrlant.dev': '1' } });
        await backend(cold.context, db);
        await cold.tab.goto(`${ORIGIN}/?dobyvani=${code}`);
        await cold.tab.waitForSelector('#conquest-game [data-cq-map] svg', { timeout: 30000 });
        await cold.tab.waitForFunction(() => /Kvůli ztracenému hradu máš v tomto období o tah méně\./.test((document.getElementById('toast') || {}).textContent || ''));
        assert.equal(await cold.tab.locator('#dialog-overlay').count(), 0);
        assert.doesNotMatch(cold.tab.url(), /dobyvani=/, 'kód z adresy zmizí');
        assert.deepEqual(cold.log.errors, []);
        await cold.context.close();
        // Bez vývojářského režimu žádná lišta
        const plain = newDb();
        plain.autoJoin = true;
        const second = await start(plain);
        await second.tab.click('#conquest-card');
        await second.tab.waitForSelector('#conquest-hub');
        await second.tab.click('[role="tab"][data-cq-tab="create"]');
        await second.tab.click('[data-cq-form] button[type="submit"]');
        await second.tab.waitForSelector('[data-cq-lobby-detail]');
        assert.equal(await second.tab.locator('[data-cq-dev]').count(), 0);
        await second.context.close();
    });

    // Rozehraná hra na Evropě (já Česko, Petr Norsko)
    const running = () => {
        const db = newDb();
        const g = db.games[0];
        g.players.push({ user: 'u-1', seat: 1, flag_color: 'cervena', emblem: 'lev', ready: true });
        g.players.push({ user: 'u-2', seat: 2, flag_color: 'modra', emblem: 'orel', ready: true });
        g.players = g.players.filter(p => p.user !== 'u-3');
        g.players.forEach((p, i) => { p.seat = i; });
        g.status = 'running'; g.started_at = NOW; g.ends_at = '2026-11-14T10:00:00Z';
        g.territories = MAPS.evropa.t.map(item => ({ t: item.id, o: { Q213: 'u-1', Q214: 'u-1', Q20: 'u-2', Q183: 'u-2' }[item.id] || null, l: item.id === 'Q183' ? 2 : 0, h: ['Q213', 'Q20'].includes(item.id), p: item.id === 'Q40' }));
        g.moves = [{ id: 1, u: 'u-1', k: 'home', t: 'Q213', r: 'home', n: 0, at: NOW }, { id: 2, u: 'u-2', k: 'home', t: 'Q20', r: 'home', n: 0, at: NOW }];
        g.players.forEach(p => { p.score = g.territories.filter(x => x.o === p.user).length; p.score_at = NOW; });
        return db;
    };
    // Výplně území (blok 38): hra se třemi hráči a různými výplněmi; snímky do UZEMI_DIR (dobyvani-art/uzemi)
    const UZEMI = process.env.UZEMI_DIR || '';
    const uzemiShot = async (tab, name) => { if (UZEMI) await tab.screenshot({ path: path.join(UZEMI, `${name}.png`) }); };
    for (const [width, height, colorScheme] of [[360, 640, 'light'], [360, 640, 'dark'], [390, 780, 'light'], [390, 780, 'dark']]) {
        await t.test(`výplň území na mapě ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): jeden vzor na hráče, šedé předbarvené (blob:), barevná s lemem, vlaječky jen barva, popisky a značky čitelné`, async () => {
            const db = running();
            const g = db.games[0];
            g.players.push({ user: 'u-3', seat: 2, flag_color: 'zelena', emblem: 'jednorozec', ready: true });
            const fills = { 'u-1': 'plameny', 'u-2': 'duha', 'u-3': 'listi' };
            g.players.forEach(p => { p.pattern = fills[p.user]; });
            g.players[0].emblem = 'sfinga';
            const owners = ['u-1', 'u-2', 'u-3', null];
            g.territories = MAPS.evropa.t.map((item, i) => ({ t: item.id, o: owners[i % 4], l: i % 9 === 0 && owners[i % 4] ? 1 : 0, h: ['Q213', 'Q20', 'Q29'].includes(item.id), p: false }));
            for (const [t, o] of [['Q213', 'u-1'], ['Q20', 'u-2'], ['Q29', 'u-3']]) Object.assign(g.territories.find(x => x.t === t), { o, h: true });
            g.players.forEach(p => { p.score = g.territories.filter(x => x.o === p.user).length; });
            const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme });
            await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
            await tab.click('#conquest-wait [data-action="conquest-play"]');
            await tab.waitForSelector('#conquest-game [data-cq-map] svg');
            // Tři hráči se vzorem = tři <pattern>; šedé (Plameny, Listí) dostanou předbarvenou dlaždici blob: (bez filtru), Duha jak je
            await tab.waitForFunction(() => [...document.querySelectorAll('[data-cq-map] pattern[id^="cq-fill-"] image')].filter(img => img.getAttribute('href').startsWith('blob:')).length === 2, null, { timeout: 10000 });
            assert.equal(await tab.locator('[data-cq-map] pattern[id^="cq-fill-"]').count(), 3);
            assert.equal(await tab.locator('[data-cq-map] filter[id^="cq-fill-"]').count(), 0, 'bez filtru po předbarvení');
            assert.equal(await tab.locator('[data-cq-map] pattern[id^="cq-fill-"] image[href="icons/vzory/duha.webp"]').count(), 1);
            const owned = g.territories.filter(x => x.o).length;
            assert.equal(await tab.locator('[data-cq-map] .cq-wash-fill').count(), owned, 'každé obsazené území ve výplni');
            assert.equal(await tab.locator('[data-cq-map] .cq-band-strong').count(), g.territories.filter(x => x.o === 'u-2').length, 'Duha s lemem v barvě hráče');
            // Vlaječky na mapě: jen barva a znak (vzácný znak ano), žádná výplň
            assert.equal(await tab.locator('[data-cq-map] .cq-marks image[href^="icons/vzory/"], [data-cq-map] .cq-marks image[href^="blob:"]').count(), 0);
            assert.ok(await tab.locator('[data-cq-map] .cq-marks image[href="icons/znaky/sfinga.webp"]').count() >= 1);
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
            await tab.waitForTimeout(300);
            await uzemiShot(tab, `mapa-${width}x${height}-${colorScheme}`);
            // Přiblížení: vzor v měřítku mapy, popisek území nad výplní čitelný
            const map = await tab.$('[data-cq-map]');
            const rect = await map.boundingBox();
            await tab.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.55);
            await tab.mouse.wheel(0, -900);
            await tab.waitForSelector('[data-cq="zoom-reset"].flex');
            await tapTerritory(tab, 'Q183');
            await tab.waitForTimeout(400);
            const label = await labelBox(tab, 'Q183');
            assert.ok(label.shown && label.inside, `popisek Německa ${JSON.stringify(label)}`);
            await uzemiShot(tab, `priblizeni-${width}x${height}-${colorScheme}`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, [], 'blob: dlaždice projde CSP (img-src blob:)');
            await context.close();
        });
    }

    for (const [width, height, colorScheme] of [[360, 640, 'light'], [390, 780, 'dark']]) {
        await t.test(`hra ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): mapa bez posouvání, útok s otázkou a dobytím, pobourání hradby, opevnění, odražený útok, přiblížení, kronika`, async () => {
            const db = running();
            const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme });
            await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
            await tab.click('#conquest-wait [data-action="conquest-play"]');
            await tab.waitForSelector('#conquest-game [data-cq-map] svg');
            await tab.waitForTimeout(200);
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'obrazovka hry se vejde bez posouvání');
            const box = await tab.evaluate(() => { const map = document.querySelector('[data-cq-wrap]').getBoundingClientRect(); return { height: map.height, width: map.width }; });
            assert.ok(box.height > 200 && box.width > 300, JSON.stringify(box));
            assert.equal(await tab.locator('.cq-hit').count(), 41);
            assert.ok(await tab.locator('[data-pin="Q213"]').count() === 1 && await tab.locator('[data-mark="Q183"] [data-icon="wall"]').count() === 1);
            await shot(tab, `hra-${width}-${colorScheme}`);
            // Útok na Rakousko (neutrální s pokladem): list, otázka, dobytí
            await tapTerritory(tab, 'Q40');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
            assert.match(await tab.textContent('[data-cq-sheet]'), /Rakousko[\s\S]*Neutrální území[\s\S]*Poklad: \+1 tah/);
            assert.equal(await tab.locator('[data-cq-source]').count(), 0, 'odkud útok vede, se nevybírá (na výsledek vliv nemá)');
            assert.match(await tab.textContent('[data-cq-sheet] [data-cq-region]'), /^Region Střední Evropa · /);
            // Název území uprostřed území a celý uvnitř (7–18 px): Rakousko se na celé mapě do 7 px nevejde, mapa se po klepnutí přiblíží
            await settledWidth(tab);
            assert.ok(await viewWidth(tab) < 1000, 'mapa se kvůli názvu přiblížila');
            await shot(tab, `list-${width}-${colorScheme}`);
            const label = await labelBox(tab, 'Q40');
            assert.ok(label.shown && label.px >= 6.8 && label.px <= 18.1, JSON.stringify(label));
            assert.ok(label.inside, `název Rakouska je celý uvnitř území ${JSON.stringify(label)}`);
            db.force.push('capture');
            await tab.click('[data-cq-sheet] [data-cq="attack"]');
            await tab.waitForSelector('[data-cq-answer]', { timeout: 30000 });
            assert.equal(await tab.locator('[data-cq-answer]').count(), 4);
            assert.ok(await tab.locator('[data-cq-arrow]').count() === 1, 'šipka útoku');
            await shot(tab, `otazka-${width}-${colorScheme}`);
            await tab.click('[data-cq-answer="0"]');
            await tab.waitForFunction(() => document.querySelector('[data-wash="Q40"]'), null, { timeout: 15000 });
            await tab.waitForSelector('[data-cq-banner] .cq-banner');
            assert.match(await tab.textContent('[data-cq-banner]'), /Poklad/);
            assert.match(await tab.textContent('[data-cq-budget]'), /4\/5/);
            assert.ok(await tab.locator('[data-pin="Q40"].cq-pin-drop').count() === 1, 'vlaječka se zapíchne');
            await shot(tab, `dobyto-${width}-${colorScheme}`);
            const move = db.calls.filter(call => call.name === 'conquest_move').pop().body;
            assert.equal(move.target, 'Q40');
            assert.equal(move.move_kind, 'attack');
            assert.ok(['Q213', 'Q214'].includes(move.source));
            // Pobourání hradby v Německu
            await tapTerritory(tab, 'Q183');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
            assert.match(await tab.textContent('[data-cq-sheet]'), /Hradba[\s\S]*pobourá/);
            db.force.push('capture');
            await tab.click('[data-cq-sheet] [data-cq="attack"]');
            await tab.waitForSelector('[data-cq-answer]');
            await tab.click('[data-cq-answer="1"]');
            await tab.waitForFunction(() => /pobořena/.test((document.querySelector('[data-cq-banner]') || {}).textContent || ''), null, { timeout: 15000 });
            assert.ok(await tab.locator('[data-mark="Q183"] [data-icon="palisade"]').count() === 1, 'zbyla palisáda');
            // Opevnění domova (Česko)
            await tapTerritory(tab, 'Q213');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="fortify"]');
            assert.match(await tab.textContent('[data-cq-sheet] [data-cq="fortify"]'), /Opevnit na Palisádu/);
            db.force.push('fortify');
            await tab.click('[data-cq-sheet] [data-cq="fortify"]');
            await tab.waitForSelector('[data-cq-answer]');
            await tab.click('[data-cq-answer="2"]');
            await tab.waitForFunction(() => document.querySelector('[data-mark="Q213"] .cq-rise'), null, { timeout: 15000 });
            // Odražený útok na Německo (Petrova palisáda)
            await tapTerritory(tab, 'Q183');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
            db.force.push('fail');
            await tab.click('[data-cq-sheet] [data-cq="attack"]');
            await tab.waitForSelector('[data-cq-answer]');
            await tab.click('[data-cq-answer="3"]');
            await tab.waitForFunction(() => /Útok odražen/.test((document.querySelector('[data-cq-banner]') || {}).textContent || ''), null, { timeout: 15000 });
            assert.match(await tab.textContent('[data-cq-budget]'), /1\/5/);
            // Pořadí ukazuje tahy každého hráče, kronika jméno a za ním praporec
            assert.match((await tab.textContent('[data-cq-players]')).replace(/\s+/g, ' '), /Ty[^]*1\/5[^]*Petr Svoboda[^]*5\/5/);
            assert.equal(await tab.locator('[data-cq-players] .cq-moves').count(), 2);
            // Přiblížení kolečkem a zpět na celou mapu
            const map = await tab.$('[data-cq-map]');
            const rect = await map.boundingBox();
            await tab.mouse.move(rect.x + rect.width * 0.55, rect.y + rect.height * 0.6);
            await tab.mouse.wheel(0, -900);
            await tab.waitForSelector('[data-cq="zoom-reset"].flex');
            // Po přiblížení je Rakousko na displeji velké: název je větší a celý uvnitř území
            await tapTerritory(tab, 'Q40');
            await tab.waitForTimeout(300);
            const zoomed = await labelBox(tab, 'Q40');
            assert.ok(zoomed.shown && zoomed.inside && zoomed.px > label.px, `přiblížené Rakousko ${JSON.stringify(zoomed)} (celá mapa ${JSON.stringify(label)})`);
            await shot(tab, `priblizeni-${width}-${colorScheme}`);
            if (await tab.locator('[data-cq-sheet] [data-cq="sheet-close"]').count()) await tab.click('[data-cq-sheet] [data-cq="sheet-close"]');
            await tab.click('[data-cq="zoom-reset"]');
            await tab.waitForSelector('[data-cq="zoom-reset"].hidden', { state: 'attached' });
            // Malé území: název Lucemburska se na celé mapě nevejde ani v 7 px. Po klepnutí se mapa plynule přiblíží jen tolik, aby byl
            // celý uvnitř území (asi 7 px), se středem nad spodním listem; víc přiblížená mapa se neoddálí a kolečko hráče má přednost
            const fullWidth = await viewWidth(tab);
            await tapTerritory(tab, 'Q32');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="sheet-close"]');
            assert.match(await tab.textContent('[data-cq-sheet]'), /Lucembursko/);
            const fitted = await settledWidth(tab);
            assert.ok(fitted < fullWidth / 10, `mapa se přiblížila (výřez ${fitted.toFixed(1)} z ${fullWidth})`);
            assert.ok(fitted >= fullWidth / 20 - 0.01, 'nejvýš MAX_ZOOM');
            const tiny = await labelBox(tab, 'Q32');
            assert.ok(tiny.shown && tiny.inside, `název Lucemburska je celý uvnitř území ${JSON.stringify(tiny)}`);
            assert.ok(tiny.px >= 6.9 && tiny.px <= 7.6, `jen tolik přiblížení, kolik je potřeba: ${tiny.px.toFixed(2)} px`);
            assert.equal(await tab.locator('[data-cq="zoom-reset"].flex').count(), 1, 'tlačítko Celá mapa');
            const placed = await tab.evaluate(() => {
                const label = document.querySelector('[data-label="Q32"]').getBoundingClientRect();
                const map = document.querySelector('[data-cq-wrap]').getBoundingClientRect();
                const sheet = document.querySelector('[data-cq-sheet]').getBoundingClientRect();
                return { inMap: label.left >= map.left && label.right <= map.right && label.top >= map.top, aboveSheet: label.bottom <= Math.min(map.bottom, sheet.top) };
            });
            assert.deepEqual(placed, { inMap: true, aboveSheet: true }, 'název je vidět nad spodním listem');
            await shot(tab, `male-uzemi-${width}-${colorScheme}`);
            // Hráč oddálí kolečkem: mapa zůstane oddálená (přiblížení se neopakuje ani nepokračuje)
            const center = await tab.evaluate(() => { const box = document.querySelector('[data-label="Q32"]').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; });
            await tab.mouse.move(center.x, center.y);
            await tab.mouse.wheel(0, 300);
            const out = await settledWidth(tab);
            assert.ok(out > fitted * 1.3, `kolečko oddálilo (${out.toFixed(1)} > ${fitted.toFixed(1)})`);
            await tab.waitForTimeout(500);
            assert.equal(await viewWidth(tab), out, 'automatické přiblížení se nevrací');
            // Víc přiblížená mapa (kolečkem na maximum) se klepnutím na malé území neoddálí
            await tab.mouse.wheel(0, -3000);
            const deepest = await settledWidth(tab);
            await tapTerritory(tab, 'Q32');
            await tab.waitForTimeout(600);
            assert.ok(Math.abs(await viewWidth(tab) - deepest) < 0.01, 'klepnutí neoddálí');
            await shot(tab, `male-uzemi-max-${width}-${colorScheme}`);
            await tab.click('[data-cq-sheet] [data-cq="sheet-close"]');
            await tab.click('[data-cq="zoom-reset"]');
            await tab.waitForSelector('[data-cq="zoom-reset"].hidden', { state: 'attached' });
            // Kronika tažení
            await tab.click('#conquest-game button[aria-label="Kronika tažení"]');
            await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || {}).dataset && document.getElementById('dialog-overlay').dataset.title === 'Kronika tažení');
            const feed = (await tab.textContent('#dialog-overlay')).replace(/\s+/g, ' ');
            assert.match(feed, /Německo: Útok odražen ty · dosud Petr Svoboda/);
            assert.match(feed, /Rakousko: Dobyto ty · 11\. 11\./);
            assert.match(feed, /Česko: Opevněno na Palisádu/);
            assert.match(feed, /Německo: Hradba pobořena/);
            assert.match(feed, /Rakousko: Dobyto/);
            assert.match(feed, /Rakousko: Poklad nalezen/);
            await shot(tab, `kronika-${width}-${colorScheme}`);
            await tab.keyboard.press('Escape');
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
            // Kronika pod mapou: aspoň tři celé události i na 360×640 (na nízkém displeji je událost na jednom řádku a mapa ustoupí)
            const visibleEvents = await tab.evaluate(() => {
                const card = document.querySelector('[data-cq-recent] .cq-feed-list').getBoundingClientRect();
                return [...document.querySelectorAll('[data-cq-recent] .cq-feed-row')].filter(row => row.getBoundingClientRect().bottom <= card.bottom + 0.5).length;
            });
            assert.ok(visibleEvents >= 3, `vidět ${visibleEvents} událostí kroniky`);
            await shot(tab, `kronika-pod-mapou-${width}-${colorScheme}`);
            // Zpět z mapy na Moje hry
            await tab.click('#conquest-game [data-cq="hub"]');
            await tab.waitForSelector('#conquest-hub [data-cq-play]');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    // Bitvy o území (blok 25): stejný server s db.battles (puls, obléhání, přidání, odpověď, stav bitvy)
    await t.test('bitva o území, útočník na 360×640: odpočet, „Do bitvy vstupuje…“, čekání na ostatní, pomalejší správná odpověď prohrává', async () => {
        const db = running();
        db.battles = true;
        db.answerMs = { 'u-1': 4200, 'u-2': 2100 };
        const g = db.games[0];
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-wait [data-action="conquest-play"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        await tapTerritory(tab, 'Q40');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
        assert.match(await tab.textContent('[data-cq-sheet]'), /Na odpověď máš 60 s\. Kdo s územím sousedí, může se k bitvě přidat/);
        await tab.click('[data-cq-sheet] [data-cq="attack"]');
        await tab.waitForSelector('[data-cq-answer]', { timeout: 30000 });
        const begin = db.calls.find(call => call.name === 'conquest_siege_begin').body;
        assert.equal(begin.target, 'Q40');
        assert.ok(Number.isInteger(begin.correct) && !/"correct"/.test(JSON.stringify(begin.question)), 'správná odpověď jde zvlášť, ne v otázce');
        assert.equal(await tab.textContent('[data-cq-timer-text]'), '0:50');
        assert.match(await tab.textContent('[data-cq-sheet]'), /Bitva o Rakousko/);
        assert.match(await tab.textContent('[data-cq-budget]'), /4\/5/, 'tah je rezervovaný');
        // Petr se přidá: během otázky vyskočí zpráva a jeho praporek přibude mezi účastníky
        const siege = g.sieges[0];
        siege.participants.push({ user: 'u-2', source: 'Q183' });
        g.siegeRev += 1;
        await tab.waitForSelector('[data-cq-joined] .cq-joined', { timeout: 10000 });
        assert.match(await tab.textContent('[data-cq-joined]'), /Do bitvy vstupuje Petr Svoboda!/);
        assert.match(await tab.textContent('[data-cq-fighters]'), /ty[\s\S]*Petr Svoboda/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await shot(tab, 'bitva-otazka-360');
        // Odpovím správně, Petr ještě přemýšlí: čekání s odpočtem
        await tab.click(`[data-cq-answer="${begin.correct}"]`);
        await tab.waitForSelector('[data-cq-wait]');
        assert.ok(await tab.evaluate(() => document.querySelector('[data-cq-wait]').getBoundingClientRect().bottom <= window.innerHeight), 'čekání je celé vidět');
        assert.match((await tab.textContent('[data-cq-wait]')).replace(/\s+/g, ' '), /Čeká se na ostatní[\s\S]*ty\s*správně · 4,2 s[\s\S]*Petr Svoboda\s*přemýšlí · 0:50[\s\S]*Teď rozhoduje čas/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(400);
        await shot(tab, 'bitva-cekani-360');
        // Petr odpoví správně rychleji: území je jeho, můj tah propadl
        Object.assign(siege.participants[1], { answered: true, picked: siege.correct, correct: true, answer_ms: 2100 });
        await tab.waitForFunction(() => /Správně, ale rychlejší odpověď: Petr Svoboda\. Tah propadl\./.test((document.querySelector('[data-cq-banner]') || {}).textContent || ''), null, { timeout: 15000 });
        await tab.waitForSelector('[data-cq-sheet] [aria-label="Výsledek bitvy"]', { timeout: 15000 });
        assert.match((await tab.textContent('[data-cq-sheet]')).replace(/\s+/g, ' '), /Rakousko\s*Vyhrává Petr Svoboda a získává území\.[\s\S]*Petr Svoboda\s*vítězství · 2,1 s[\s\S]*ty\s*správně, pomaleji · 4,2 s/);
        assert.equal(g.territories.find(x => x.t === 'Q40').o, 'u-2');
        assert.match(await tab.textContent('[data-cq-budget]'), /4\/5/);
        assert.equal(await tab.locator('.cq-siege-zone').count(), 0, 'po bitvě už území obléhané není');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(400);
        await shot(tab, 'bitva-vysledek-360');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('bitva o území, kdo se přidá, na 390×780 (tmavý režim): obléhání na mapě a štítek, okno bitvy s varováním, Přidat se, stejná otázka, vítězství', async () => {
        const db = running();
        db.battles = true;
        db.answerMs = { 'u-2': 3100 };
        const g = db.games[0];
        const question = { kind: 'text', family: 'capital', prompt: 'Které město je hlavním městem tohoto státu?', difficulty: 1, choices: ['Vídeň', 'Štýrský Hradec', 'Linec', 'Salcburk'].map(label => ({ label })) };
        g.sieges = [{ id: uuid(77), territory: 'Q40', started_by: 'u-1', question, correct: 0, status: 'open', participants: [{ user: 'u-1', source: 'Q213' }] }];
        g.siegeRev = 1;
        const { context, tab, log } = await start(db, { viewport: { width: 390, height: 780 }, colorScheme: 'dark', storage: login('tok-u2') });
        await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-wait [data-action="conquest-play"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.equal(await tab.locator('[data-siege-zone="Q40"]').count(), 1, 'obléhané území má rudý lem');
        assert.equal(await tab.locator('[data-mark="Q40"] .cq-siege-badge').count(), 1, 'pečeť se zkříženými meči');
        await tab.waitForSelector('[data-cq-siege-open="Q40"]');
        assert.match(await tab.textContent('[data-cq-siege-open="Q40"]'), /Bitva o Rakousko\s*0:50/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await shot(tab, 'bitva-mapa-390-dark');
        await tab.click('[data-cq-siege-open="Q40"]');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="siege-join"]');
        assert.match((await tab.textContent('[data-cq-sheet]')).replace(/\s+/g, ' '), /Probíhá bitva\s*přidat se: 0:50[\s\S]*Jana Nováková[\s\S]*Riskantní: [\s\S]*nezíská nic a tah ztratí\.[\s\S]*Přidat se do bitvy/);
        assert.equal(await tab.locator('[data-cq-sheet] [data-cq="attack"]').count(), 0, 'zaútočit jinak než přidáním nejde');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(400);
        await shot(tab, 'bitva-pridat-390-dark');
        await tab.click('[data-cq-sheet] [data-cq="siege-join"]');
        await tab.waitForSelector('[data-cq-answer]');
        const join = db.calls.filter(call => call.name === 'conquest_siege_join').pop().body;
        assert.deepEqual([join.siege, join.source], [uuid(77), 'Q183']);
        assert.match(await tab.textContent('[data-cq-sheet]'), /Bitva o Rakousko[\s\S]*Které město je hlavním městem tohoto státu\?[\s\S]*Vídeň/);
        assert.match(await tab.textContent('[data-cq-budget]'), /4\/5/);
        await shot(tab, 'bitva-otazka-390-dark');
        await tab.click('[data-cq-answer="0"]');
        await tab.waitForSelector('[data-cq-wait]');
        assert.match(await tab.textContent('[data-cq-sheet]'), /Tvoje odpověď: Vídeň/, 'při čekání jen moje odpověď (vejde se i seznam účastníků)');
        assert.equal(await tab.locator('[data-cq-answer]').count(), 0);
        // Jana odpoví špatně: vyhrávám, území s pokladem je moje
        Object.assign(g.sieges[0].participants[0], { answered: true, picked: 2, correct: false, answer_ms: 5000 });
        await tab.waitForSelector('[data-cq-sheet] [aria-label="Výsledek bitvy"]', { timeout: 15000 });
        assert.match((await tab.textContent('[data-cq-sheet]')).replace(/\s+/g, ' '), /Vyhráváš a území je tvoje\.[\s\S]*ty\s*vítězství · 3,1 s[\s\S]*Jana Nováková\s*špatně/);
        assert.equal(g.territories.find(x => x.t === 'Q40').o, 'u-2');
        assert.ok(await tab.locator('[data-wash="Q40"]').count() === 1);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(400);
        await shot(tab, 'bitva-vitezstvi-390-dark');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    // Otázka Mudrlanta přes celou obrazovku hry: vejde se (stránka ani obrazovka hry se neposouvá, popis se posouvá ve svém rámečku)
    const fullFits = (tab, height) => tab.evaluate((h) => {
        const full = document.querySelector('[data-cq-full]');
        const rect = full.getBoundingClientRect();
        const answers = [...full.querySelectorAll('[data-cq-answer]')].map(button => button.getBoundingClientRect());
        const game = document.getElementById('conquest-game');
        return { top: rect.top >= 0, bottom: rect.bottom <= h + 0.5, answers: answers.every(box => box.bottom <= rect.bottom + 0.5 && box.height >= 40), over: full.scrollHeight - full.clientHeight, game: game.scrollHeight - game.clientHeight };
    }, height);
    const openRunning = async (options) => {
        const db = running();
        const page = await start(db, options);
        await page.tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await page.tab.click('#conquest-wait [data-action="conquest-play"]');
        await page.tab.waitForSelector('#conquest-game [data-cq-map] svg');
        return { db, ...page };
    };
    const attackWith = async (tab, db, territory, form) => {
        if (form) await tab.evaluate((value) => { window.MUDRLANT_CONQUEST_ONLY = value; }, form);
        await tapTerritory(tab, territory);
        await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
        db.force.push('capture');
        await tab.click('[data-cq-sheet] [data-cq="attack"]');
    };
    // Odpověď a konec tahu (dobytí: vlaječka se zapíchne, další klepnutí na mapu už jde)
    const answerCapture = async (tab, index, territory) => {
        await tab.click(`[data-cq-answer="${index}"]`);
        await tab.waitForSelector(`[data-pin="${territory}"].cq-pin-drop`, { timeout: 15000 });
        await tab.waitForSelector('[data-cq-banner] .cq-banner');
    };
    for (const [width, height, colorScheme] of [[360, 640, 'light'], [390, 780, 'dark']]) {
        await t.test(`otázka Mudrlanta ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): popis se zakrytým názvem, fakta a obrázek přes celou obrazovku hry, záhlaví „Útok na…“, vejde se bez posouvání, odpověď`, async () => {
            const { db, context, tab, log } = await openRunning({ viewport: { width, height }, colorScheme, only: 'text', wiki: 'article' });
            // Popis: Rakousko (neutrální, bez opevnění)
            await attackWith(tab, db, 'Q40', null);
            await tab.waitForSelector('[data-cq-full] [data-cq-qtext]', { timeout: 20000 });
            assert.equal((await tab.textContent('[data-cq-full] h2')).trim(), 'Útok na Rakousko');
            assert.equal(await tab.locator('[data-cq-full] [aria-label="Obtížnost 1 ze 3"]').count(), 1, 'hvězdy obtížnosti');
            assert.match(await tab.textContent('[data-cq-full] [data-cq-qtext]'), /„\[\*\*\*\] je velmi známé místo nebo osobnost/);
            assert.doesNotMatch(await tab.textContent('[data-cq-full] [data-cq-qtext]'), /Rakousko je velmi/);
            assert.equal(await tab.locator('[data-cq-full] [data-cq-answer]').count(), 4);
            assert.match(await tab.textContent('[data-cq-full] p'), /\?$/);
            // Po vyjetí listu (animace cq-sheet-in)
            await tab.waitForTimeout(400);
            await shot(tab, `mudrlant-popis-${width}-${colorScheme}`);
            assert.deepEqual(await fullFits(tab, height), { top: true, bottom: true, answers: true, over: 0, game: 0 }, 'popis se vejde');
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'stránka se neposouvá');
            const scroll = await tab.evaluate(() => { const box = document.querySelector('[data-cq-qtext]'); return getComputedStyle(box).overflowY; });
            assert.equal(scroll, 'auto', 'popis se posouvá ve svém rámečku');
            await answerCapture(tab, 0, 'Q40');
            assert.equal(await tab.locator('[data-cq-full]').count(), 0, 'po odpovědi zpět na mapu');
            assert.equal(await tab.evaluate(() => document.querySelector('[data-cq-sheet]').classList.contains('top-0')), false);
            // Fakta: Polsko
            await attackWith(tab, db, 'Q36', 'facts');
            await tab.waitForSelector('[data-cq-full] dl', { timeout: 20000 });
            assert.ok(await tab.locator('[data-cq-full] .cq-fact').count() >= 2, 'aspoň dvě fakta');
            assert.equal((await tab.textContent('[data-cq-full] h2')).trim(), 'Útok na Polsko');
            await tab.waitForTimeout(400);
            await shot(tab, `mudrlant-fakta-${width}-${colorScheme}`);
            assert.deepEqual(await fullFits(tab, height), { top: true, bottom: true, answers: true, over: 0, game: 0 }, 'fakta se vejdou');
            await answerCapture(tab, 1, 'Q36');
            // Obrázek: Maďarsko
            await attackWith(tab, db, 'Q28', 'photo');
            await tab.waitForSelector('[data-cq-full] .cq-qimg img[src]', { timeout: 20000 });
            // Obrázek je blob: – adresa z Commons (název souboru bývá odpovědí) není v src ani v žádném jiném atributu, alt je obecný
            assert.match(await tab.getAttribute('[data-cq-full] .cq-qimg img', 'src'), /^blob:/);
            assert.equal(await tab.getAttribute('[data-cq-full] .cq-qimg img', 'alt'), 'Obrázek k otázce');
            assert.equal(await tab.getAttribute('[data-cq-full] .cq-qimg img', 'title'), null);
            assert.deepEqual(await attributeLeaks(tab, ['upload.wikimedia.org']), [], 'adresa z Commons v atributech není');
            assert.ok(await tab.evaluate(() => { const img = document.querySelector('[data-cq-full] .cq-qimg img'); return img.getBoundingClientRect().height > 120; }), 'obrázek je velký');
            await tab.waitForTimeout(400);
            await shot(tab, `mudrlant-obrazek-${width}-${colorScheme}`);
            assert.deepEqual(await fullFits(tab, height), { top: true, bottom: true, answers: true, over: 0, game: 0 }, 'obrázek se vejde');
            await tab.click('[data-cq-full] [data-cq-answer="2"]');
            await tab.waitForFunction(() => document.querySelector('[data-cq-full] .cq-choice-ok') && /Správně/.test(document.querySelector('[data-cq-full]').textContent), null, { timeout: 5000 });
            await tab.waitForSelector('[data-pin="Q28"].cq-pin-drop', { timeout: 15000 });
            assert.deepEqual(db.calls.filter(call => call.name === 'conquest_move').map(call => call.body.target), ['Q40', 'Q36', 'Q28']);
            // Otázky se v zařízení pamatují podle položky a formy (žádná položka dvakrát)
            const asked = await tab.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mudrlant.conquestAsked')))[0]);
            assert.equal(new Set(asked.a).size, 3);
            assert.deepEqual(asked.f.slice(-3), ['text', 'facts', 'photo']);
            // Vlajky v možnostech (Slovinsko): čtyři obrázky jako blob:, název souboru („Flag of Slovenia.svg“ = odpověď) v atributech není
            await attackWith(tab, db, 'Q215', 'flag');
            await tab.waitForFunction(() => document.querySelectorAll('[data-cq-sheet] [data-cq-answer] img[src^="blob:"]:not(.invisible)').length === 4, null, { timeout: 20000 });
            assert.equal(await tab.locator('[data-cq-sheet] [data-cq-answer] img[alt=""]:not([title])').count(), 4, 'bez popisku s názvem');
            assert.deepEqual(await attributeLeaks(tab, ['upload.wikimedia.org', 'Flag_of', 'Flag of', 'Coat_of_arms']), []);
            await tab.waitForTimeout(400);
            await shot(tab, `vlajky-${width}-${colorScheme}`);
            await answerCapture(tab, 0, 'Q215');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('bez sítě: když Wikipedie a obrázky nejdou, nebo Wikipedie neodpoví do 4 s, přijde místní otázka ve spodním listu', async () => {
        // Obrázky ani Wikipedie nejdou: otázka na obrázek se nesloží a hned přijde místní otázka
        const blocked = await openRunning({ only: 'photo', wiki: 'abort', images: 'abort' });
        const started = Date.now();
        await attackWith(blocked.tab, blocked.db, 'Q40', null);
        await blocked.tab.waitForSelector('[data-cq-answer]', { timeout: 15000 });
        assert.ok(Date.now() - started < 8000, `místní otázka do 8 s (${Date.now() - started} ms)`);
        assert.equal(await blocked.tab.locator('[data-cq-full]').count(), 0, 'místo obrázku místní otázka');
        assert.deepEqual(await fits(blocked.tab), { vertical: 0, page: 0, content: 0 });
        await shot(blocked.tab, 'mudrlant-bez-site-360');
        await answerCapture(blocked.tab, 0, 'Q40');
        assert.deepEqual(blocked.log.errors, []);
        await blocked.context.close();
        // Wikipedie neodpoví: po ROUND_TIMEOUT (4 s) místní otázka, ne čekání na Wikipedii
        const slow = await openRunning({ only: 'text', wiki: 'hang' });
        const begun = Date.now();
        await attackWith(slow.tab, slow.db, 'Q40', null);
        await slow.tab.waitForSelector('[data-cq-answer]', { timeout: 15000 });
        const waited = Date.now() - begun;
        assert.ok(waited >= 3000 && waited < 9000, `místní otázka po asi 4 s (${waited} ms)`);
        assert.equal(await slow.tab.locator('[data-cq-full]').count(), 0);
        assert.deepEqual(slow.log.errors, []);
        assert.deepEqual(slow.log.csp, []);
        await slow.context.close();
    });

    // Další kolo (blok 26): rychlá hra (kola po 5 min); když všichni dohrají, okno s fajfkami, Chci další kolo a odpočet 10 s
    await t.test('další kolo na 360×640: Blesk s koly po 5 min, okno Kolo dohráno s fajfkami, zavřít a otevřít štítkem, Chci další kolo, odpočet, nové kolo', async () => {
        const db = running();
        db.rounds = true;
        const g = db.games[0];
        Object.assign(g, { period: 'min5', minutes: 20, hours: 0, ends_at: '2026-11-11T10:20:00Z' });
        g.round = { period: 0, started_at: NOW, ends_at: '2026-11-11T10:03:00Z', done: false, ready: [], next_at: null, can_ready: false };
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-wait [data-action="conquest-play"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.equal(await tab.textContent('[data-cq-next]'), 'Další kolo za 3:00', 'rychlá kola po sekundách');
        assert.ok(await tab.locator('[data-cq-round]').evaluate(el => el.classList.contains('hidden')), 'dokud všichni nedohrají, okno není');
        // Všichni dohráli: okno s hráči a prázdnými políčky
        Object.assign(g.round, { done: true, can_ready: true });
        await tab.waitForSelector('[data-cq-round] [data-cq="round-ready"]', { timeout: 10000 });
        assert.match((await tab.textContent('[data-cq-round]')).replace(/\s+/g, ' '), /Kolo 1 dohráno[\s\S]*Až budou fajfky u všech, další kolo začne za 10 s\.[\s\S]*Ty[\s\S]*Petr Svoboda[\s\S]*Chci další kolo[\s\S]*Jinak začne samo za 3:00/);
        assert.equal(await tab.locator('[data-cq-round] .cq-tick-on').count(), 0);
        // Zavřít: štítek Další kolo? na mapě, klepnutím zpět
        await tab.click('[data-cq="round-close"]');
        await tab.waitForSelector('[data-cq-chips] [data-cq="round-open"]');
        assert.match(await tab.textContent('[data-cq="round-open"]'), /Další kolo\?\s*0\/2/);
        await tab.click('[data-cq-chips] [data-cq="round-open"]');
        await tab.waitForSelector('[data-cq-round] [data-cq="round-ready"]');
        // Petr chce další kolo: u něj se objeví fajfka
        g.round.ready = ['u-2'];
        await tab.waitForSelector('[data-cq-round-player="u-2"] .cq-tick-on', { timeout: 10000 });
        assert.equal(await tab.locator('[data-cq-round-player="u-1"] .cq-tick-on').count(), 0);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(400);
        await shot(tab, 'dalsi-kolo-360');
        // Chci další kolo: všichni chtějí, server spustí odpočet 10 s
        await tab.click('[data-cq="round-ready"]');
        await tab.waitForSelector('[data-cq-round] [data-cq-count]');
        assert.deepEqual(db.calls.filter(call => call.name === 'conquest_round_ready').pop().body, { game: g.id, ready: true });
        assert.equal(await tab.textContent('[data-cq-count]'), '10');
        assert.match(await tab.textContent('[data-cq-round]'), /Další kolo začíná/);
        assert.equal(await tab.locator('[data-cq-round] .cq-tick-on').count(), 2);
        await tab.waitForTimeout(450);
        await shot(tab, 'dalsi-kolo-odpocet-360');
        // Odpočet běží po sekundách a hodiny kola pod mapou ho nepřepíšou (dřív se do čísla vypsalo „Další kolo za …“)
        db.now = '2026-11-11T10:00:01.200Z';
        await tab.clock.setFixedTime(new Date(db.now));
        await tab.waitForFunction(() => document.querySelector('[data-cq-count]').textContent === '9', null, { timeout: 5000 });
        await tab.waitForTimeout(1300);
        assert.equal(await tab.textContent('[data-cq-count]'), '9');
        assert.match(await tab.textContent('[data-cq-next]'), /^Další kolo za \d:\d\d$/);
        // Po odpočtu nové kolo: okno zmizí, toast Začalo 2. kolo.
        g.periodNo = 1;
        g.round = { period: 1, started_at: '2026-11-11T10:00:10Z', ends_at: '2026-11-11T10:05:10Z', done: false, ready: [], next_at: null, can_ready: false };
        db.now = '2026-11-11T10:00:11Z';
        await tab.clock.setFixedTime(new Date(db.now));
        await tab.waitForFunction(() => document.querySelector('[data-cq-round]').classList.contains('hidden'), null, { timeout: 10000 });
        await tab.waitForFunction(() => /Začalo 2\. kolo\./.test(document.body.textContent), null, { timeout: 10000 });
        assert.match(await tab.textContent('[data-cq-next]'), /^Další kolo za 4:59$/);
        // Přeskočený zbytek kola 1 (2:50) se odečetl z konce hry: místo 20 min hra končí 10:17:10
        assert.equal(g.ends_at, '2026-11-11T10:17:10.000Z');
        assert.equal(await tab.textContent('[data-cq-clock]'), 'zbývá 16 min', 'bez odečtení by bylo 19 min');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    // Pomůcky (blok 30): stejný server s db.items (zásoba hráčů); Půl na půl u otázky bez bitvy, Tah navíc z listu území
    const bodyText = async (tab, selector) => (await tab.textContent(selector)).replace(/\s+/g, ' ');
    await t.test('pomůcky na 360×640: zásoba v rozcestníku a okno Pomůcky; Půl na půl (dvě klepnutí, dvě špatné přeškrtnuté); Tah navíc z listu území s potvrzením, „+1“ a kronika', async () => {
        const db = running();
        db.items = { 'u-1': { extra_move: 1, fifty: 2 } };
        const g = db.games[0];
        g.actions = 2;
        const { context, tab, log } = await start(db, { only: 'capital' });
        await tab.waitForFunction(() => /Tahy 2\/2/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        // Rozcestník: pruh se zásobou, klepnutím okno Pomůcky (co dělají a jak je získat)
        await tab.click('#conquest-card');
        await tab.waitForSelector('#conquest-hub [data-cq-items]');
        assert.match(await bodyText(tab, '[data-cq-items]'), /Pomůcky\s*\+1\s*Tah navíc\s*1\/1\s*½\s*Půl na půl\s*2\/2/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(300);
        await shot(tab, 'pomucky-rozcestnik-360');
        await tab.click('[data-cq-items]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Pomůcky');
        const dialog = await bodyText(tab, '#dialog-overlay');
        assert.match(dialog, /Tah navíc\s*1\/1\s*O 1 tah víc v tomto kole\.[\s\S]*Jak získat: Poražený Boss týdne[\s\S]*Půl na půl\s*2\/2[\s\S]*Jak získat: Kvíz dne bez chyby/);
        // Záchrana navíc do Řetězovky (blok 37): krátký řádek pod pomůckami do Dobývání
        assert.match(dialog, /Záchrana navíc\s*Do Řetězovky dne: zachrání řetěz ještě jednou\.\s*0\/1/);
        assert.ok(await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return box.scrollHeight - box.clientHeight <= 0 && rect.top >= 0 && rect.bottom <= 640; }), 'okno Pomůcky se vejde');
        await shot(tab, 'pomucky-okno-360');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        // Hra: útok na Rakousko, u otázky Půl na půl (první klepnutí se ptá, druhé použije)
        await tab.click(`[data-cq-play="${uuid(1)}"]`);
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        await tapTerritory(tab, 'Q40');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
        await tab.click('[data-cq-sheet] [data-cq="attack"]');
        await tab.waitForSelector('[data-cq-answer]', { timeout: 30000 });
        await tab.waitForSelector('[data-cq="fifty"]');
        assert.match(await tab.textContent('[data-cq="fifty"]'), /½\s*Půl na půl/);
        await tab.click('[data-cq="fifty"]');
        await tab.waitForFunction(() => /Opravdu\?/.test(document.querySelector('[data-cq="fifty"]').textContent));
        assert.equal(db.calls.filter(call => call.name === 'conquest_use_fifty').length, 0, 'první klepnutí jen ptá');
        await tab.click('[data-cq="fifty"]');
        await tab.waitForFunction(() => document.querySelectorAll('[data-cq-answer][data-cq-gone]').length === 2);
        assert.deepEqual(db.calls.filter(call => call.name === 'conquest_use_fifty').pop().body, { game: g.id, siege: null, target: 'Q40' });
        assert.equal(await tab.locator('[data-cq-answer]:not([disabled])').count(), 2, 'zbývají dvě možnosti');
        assert.equal(await tab.locator('[data-cq-fifty-used]').count(), 1);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(900);
        await shot(tab, 'pomucky-pul-na-pul-360');
        // Odebraná je vždy špatná: správná zůstala
        const right = await tab.evaluate(() => [...document.querySelectorAll('[data-cq-answer]:not([disabled])')].map(button => button.textContent.trim()));
        assert.ok(right.includes('Vídeň'), JSON.stringify(right));
        db.force.push('capture');
        await tab.click('[data-cq-answer]:not([disabled])');
        await tab.waitForSelector('[data-pin="Q40"].cq-pin-drop', { timeout: 15000 });
        // Druhý tah (opevnění domova), pak tahy došly: na mapě štítek Tah navíc, v listu území nabídka
        await tapTerritory(tab, 'Q213');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="fortify"]');
        db.force.push('fortify');
        await tab.click('[data-cq-sheet] [data-cq="fortify"]');
        await tab.waitForSelector('[data-cq-answer]');
        assert.equal(await tab.locator('[data-cq="fifty"]').count(), 0, 'Půl na půl jen jednou za hru');
        await tab.click('[data-cq-answer]:not([disabled])');
        await tab.waitForFunction(() => document.querySelector('[data-mark="Q213"] .cq-rise'), null, { timeout: 15000 });
        await tab.waitForSelector('[data-cq-chips] [data-cq="extra-use"]', { timeout: 10000 });
        assert.match(await tab.textContent('[data-cq-budget]'), /0\/2/);
        await tapTerritory(tab, 'Q183');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="extra-use"]');
        assert.match(await bodyText(tab, '[data-cq-sheet]'), /Tahy na tohle období už nemáš\.\s*\+1\s*Použít Tah navíc\s*\+1 tah v tomto kole · máš 1 z 1/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(400);
        await shot(tab, 'pomucky-tah-navic-nabidka-360');
        await tab.click('[data-cq-sheet] [data-cq="extra-use"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Tah navíc');
        assert.match(await bodyText(tab, '#dialog-overlay'), /V tomto kole budeš mít o 1 tah víc\. V jedné hře jde Tah navíc použít jen jednou[\s\S]*Máš 1 z 1\./);
        await shot(tab, 'pomucky-tah-navic-potvrzeni-360');
        assert.equal(db.calls.filter(call => call.name === 'conquest_use_extra').length, 0, 'bez potvrzení nic');
        await tab.click('[data-cq="extra-confirm"]');
        await tab.waitForFunction(() => /1\/3/.test(document.querySelector('[data-cq-budget]').textContent), null, { timeout: 10000 });
        assert.equal(await tab.locator('[data-cq-budget] [data-cq-extra]').count(), 1, '„+1“ u počítadla');
        assert.equal(await tab.locator('[data-cq-players] [data-cq-moves-extra]').count(), 1, '„+1“ u tahů v pořadí');
        await tab.waitForFunction(() => /Tah navíc: v tomto kole máš o 1 tah víc!/.test((document.querySelector('[data-cq-banner]') || {}).textContent || ''));
        assert.equal(await tab.locator('[data-cq-sheet] [data-cq="attack"]').count(), 1, 'list území zase nabízí útok');
        assert.equal(await tab.locator('[data-cq-chips] [data-cq="extra-use"]').count(), 0, 'štítek zmizel');
        // Kronika: Tah navíc s praporcem a jménem hráče
        await tab.click('[data-cq="sheet-close"]');
        assert.match(await bodyText(tab, '[data-cq-recent]'), /Tah navíc\s*\+1 tah v 1\. kole\s*ty/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(2800);
        await shot(tab, 'pomucky-kronika-360');
        await tab.click('#conquest-game button[aria-label="Kronika tažení"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Kronika tažení');
        assert.match(await bodyText(tab, '#dialog-overlay'), /Tah navíc: \+1 tah v 1\. kole ty/);
        await tab.keyboard.press('Escape');
        // Okno Pomůcky ve hře (klepnutí na počítadlo tahů): obojí v této hře použité
        await tab.click('[data-cq-budget]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Pomůcky');
        assert.match(await bodyText(tab, '#dialog-overlay'), /Tah navíc\s*0\/1[\s\S]*V této hře už je použitý\.[\s\S]*Půl na půl\s*1\/2[\s\S]*V této hře už je použitá\./);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    for (const [width, height, colorScheme] of [[360, 640, 'light'], [390, 780, 'dark']]) {
    await t.test(`pomůcky v bitvě na ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): „½“ u účastníka, který použil Půl na půl, server odebere dvě špatné; výsledek bitvy s „½“`, async () => {
        const db = running();
        db.battles = true;
        db.items = { 'u-1': { fifty: 1 } };
        db.answerMs = { 'u-1': 3900, 'u-2': 2100 };
        const g = db.games[0];
        const { context, tab, log } = await start(db, { only: 'capital', viewport: { width, height }, colorScheme });
        await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-wait [data-action="conquest-play"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        await tapTerritory(tab, 'Q40');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
        await tab.click('[data-cq-sheet] [data-cq="attack"]');
        await tab.waitForSelector('[data-cq="fifty"]', { timeout: 30000 });
        const begin = db.calls.find(call => call.name === 'conquest_siege_begin').body;
        // Petr se přidá s Půl na půl: u jeho jména „½“
        const siege = g.sieges[0];
        siege.participants.push({ user: 'u-2', source: 'Q183', fifty: [0, 3].filter(i => i !== begin.correct).slice(0, 2) });
        g.siegeRev += 1;
        await tab.waitForSelector('[data-cq-fighters] [data-cq-fighter="u-2"] .cq-half-badge', { timeout: 10000 });
        // Já také: server vybere dvě nesprávné (správnou aplikace útočníka nepošle zpět)
        await tab.click('[data-cq="fifty"]');
        await tab.click('[data-cq="fifty"]');
        await tab.waitForFunction(() => document.querySelectorAll('[data-cq-answer][data-cq-gone]').length === 2);
        assert.deepEqual(db.calls.filter(call => call.name === 'conquest_use_fifty').pop().body, { game: g.id, siege: siege.id, target: null });
        const gone = await tab.evaluate(() => [...document.querySelectorAll('[data-cq-answer][data-cq-gone]')].map(button => Number(button.dataset.cqAnswer)));
        assert.ok(!gone.includes(begin.correct), 'správná zůstala');
        await tab.waitForSelector('[data-cq-fighters] [data-cq-fighter="u-1"] .cq-half-badge', { timeout: 10000 });
        assert.match(await bodyText(tab, '[data-cq-fighters]'), /ty\s*½[\s\S]*Petr Svoboda\s*½/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(900);
        await shot(tab, `pomucky-bitva-${width}-${colorScheme}`);
        await tab.click(`[data-cq-answer="${begin.correct}"]`);
        await tab.waitForSelector('[data-cq-wait]');
        Object.assign(siege.participants[1], { answered: true, picked: begin.correct, correct: true, answer_ms: 2100 });
        await tab.waitForSelector('[data-cq-sheet] [aria-label="Výsledek bitvy"]', { timeout: 15000 });
        assert.equal(await tab.locator('[data-cq-sheet] [data-cq-result-player] .cq-half-badge').count(), 2, '„½“ i ve výsledku bitvy');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await tab.waitForTimeout(400);
        await shot(tab, `pomucky-bitva-vysledek-${width}-${colorScheme}`);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
    }

    // Otázka Mudrlanta přes celou obrazovku s tlačítkem ½ v záhlaví: vejde se i s ním a po odebrání dvou možností
    for (const [width, height, colorScheme] of [[360, 640, 'light'], [390, 780, 'dark']]) {
        await t.test(`pomůcky: otázka Mudrlanta ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim) s Půl na půl se vejde bez posouvání`, async () => {
            const db = running();
            db.items = { 'u-1': { fifty: 2 } };
            const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme, only: 'text', wiki: 'article' });
            await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
            await tab.click('#conquest-wait [data-action="conquest-play"]');
            await tab.waitForSelector('#conquest-game [data-cq-map] svg');
            await attackWith(tab, db, 'Q40');
            await tab.waitForSelector('[data-cq-full] [data-cq="fifty"]', { timeout: 30000 });
            // Po vyjetí listu (animace cq-sheet-in)
            await tab.waitForTimeout(400);
            assert.deepEqual(await fullFits(tab, height), { top: true, bottom: true, answers: true, over: 0, game: 0 });
            await tab.click('[data-cq="fifty"]');
            await tab.click('[data-cq="fifty"]');
            await tab.waitForFunction(() => document.querySelectorAll('[data-cq-full] [data-cq-answer][data-cq-gone]').length === 2);
            assert.deepEqual(await fullFits(tab, height), { top: true, bottom: true, answers: true, over: 0, game: 0 });
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
            await tab.waitForTimeout(900);
            await shot(tab, `pomucky-otazka-mudrlanta-${width}-${colorScheme}`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('pomůcky: okno Kolo dohráno nabídne Tah navíc tomu, kdo ho má (ne v posledním kole); po použití hraje dál', async () => {
        const db = running();
        db.rounds = true;
        db.items = { 'u-1': { extra_move: 1 } };
        const g = db.games[0];
        Object.assign(g, { period: 'min5', minutes: 20, hours: 0, ends_at: '2026-11-11T10:20:00Z' });
        g.round = { period: 0, started_at: NOW, ends_at: '2026-11-11T10:03:00Z', done: true, ready: ['u-2'], next_at: null, can_ready: true, last: false };
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-wait [data-action="conquest-play"]');
        await tab.waitForSelector('[data-cq-round] [data-cq="extra-use"]', { timeout: 10000 });
        assert.match(await bodyText(tab, '[data-cq-round]'), /Kolo 1 dohráno[\s\S]*Chci další kolo\s*\+1\s*Použít Tah navíc\s*\+1 tah v tomto kole · máš 1 z 1/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        assert.ok(await tab.evaluate(() => { const card = document.querySelector('.cq-round-card').getBoundingClientRect(); return card.top >= 0 && card.bottom <= window.innerHeight; }), 'okno kola se vejde');
        await tab.waitForTimeout(500);
        await shot(tab, 'pomucky-kolo-dohrano-360');
        await tab.click('[data-cq-round] [data-cq="extra-use"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Tah navíc');
        await tab.click('[data-cq="extra-confirm"]');
        await tab.waitForFunction(() => document.querySelector('[data-cq-round]').classList.contains('hidden'), null, { timeout: 10000 });
        assert.match(await tab.textContent('[data-cq-budget]'), /6\/6/);
        // Poslední kolo: nabídka není
        g.round = { ...g.round, done: true, can_ready: false, last: true };
        db.items['u-1'].extra_move = 1;
        g.moves = g.moves.filter(m => m.k !== 'extra');
        assert.equal(await tab.locator('[data-cq-round] [data-cq="extra-use"]').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('pomůcky ze Sezóny a z Truhly na 360×640: 5. stupeň s pečetí Půl na půl na cestě a obřadem „Nová pomůcka do Dobývání“; v truhle navíc Půl na půl, ve Zlaté truhle Záchrana navíc', async () => {
        const db = newDb();
        db.items = { 'u-1': { extra_move: 0, fifty: 0 } };
        db.chestLucky = true;
        // Sezóna od 24 300 XP, hráč má 26 000 → 1 700 XP sezóny = stupeň 5; stupně 1–4 už vyzvednuté
        const progress = { xp: 26000, counters: { bestStreak: 5 }, badges: { tyden: '2026-10-01', 'serie-3': '2026-10-01', 'uroven-5': '2026-10-01', 'uroven-10': '2026-10-01', 'uroven-20': '2026-10-01' } };
        const rewards = { season: { id: '2026-11', startXp: 24300, claimed: { 1: 'robes:fialova', 2: 'freeze', 3: 'freeze', 4: 'themes:les' } }, freezes: 2 };
        // Záložka Dnes (pruh sezóny mezi příležitostnými pruhy)
        const { context, tab, log } = await setup(browser, { storage: { 'session:mudrlant.nav': 'dnes', 'mudrlant.progress': JSON.stringify(progress), 'mudrlant.rewards': JSON.stringify(rewards) } });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        const strip = tab.locator('[data-season-ready]');
        await strip.waitFor({ timeout: 15000 });
        assert.match(await strip.textContent(), /Sezóna Listopad: čeká odměna/);
        await strip.click();
        await tab.waitForSelector('#season-overlay [data-season-go]');
        await tab.click('#season-overlay [data-season-go]');
        await tab.waitForSelector('[data-season-reveal] [data-season-item]', { timeout: 10000 });
        assert.deepEqual(db.calls.filter(call => call.name === 'player_items_claim').map(call => call.body), [{ source: 'season', key: 'season:2026-11:5' }]);
        assert.match((await tab.textContent('[data-season-reveal]')).replace(/\s+/g, ' '), /Nová pomůcka do Dobývání\s*Půl na půl\s*V otázce v Dobývání odebere dvě špatné odpovědi\./);
        assert.equal(await tab.locator('[data-season-prize] .cq-item-fifty').count(), 1, 'pečeť pomůcky');
        const saved = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.rewards')));
        assert.equal(saved.season.claimed[5], 'pomucka:fifty');
        assert.equal(db.items['u-1'].fifty, 1);
        assert.ok(await tab.evaluate(() => { const card = document.querySelector('#season-overlay [data-season-card]').getBoundingClientRect(); return card.top >= 0 && card.bottom <= window.innerHeight; }), 'obřad se vejde');
        await tab.waitForTimeout(1300);
        await shot(tab, 'pomucky-sezona-360');
        await tab.click('#season-overlay [data-season-close]:not([data-season-x])');
        // Truhla Mudrlanta (cíle týdne splněné): navíc Půl na půl (los na serveru vyšel)
        await tab.evaluate(() => {
            const state = JSON.parse(localStorage.getItem('mudrlant.rewards'));
            state.ready = ['2026-11-09'];
            localStorage.setItem('mudrlant.rewards', JSON.stringify(state));
        });
        await tab.reload();
        await tab.waitForSelector('[data-chest-ready]', { timeout: 15000 });
        await tab.click('[data-chest-ready]');
        await tab.waitForSelector('#chest-overlay [data-chest-go]');
        await tab.click('#chest-overlay [data-chest-go]');
        await tab.waitForSelector('#chest-overlay [data-chest-pomucka]', { timeout: 10000 });
        assert.deepEqual(db.calls.filter(call => call.name === 'player_items_claim').pop().body, { source: 'chest', key: 'chest:2026-W46' });
        assert.match(await tab.textContent('[data-chest-pomucka]'), /A navíc pomůcka do Dobývání: Půl na půl/);
        assert.equal(db.items['u-1'].fifty, 2);
        await tab.waitForTimeout(1300);
        await shot(tab, 'pomucky-truhla-360');
        await tab.click('#chest-overlay [data-chest-close]');
        // Zlatá truhla: vzácně Záchrana navíc do Řetězovky (blok 37, los na serveru, jednou za týden)
        await tab.evaluate(() => {
            localStorage.setItem('mudrlant.gold', JSON.stringify({ intro: true, ready: 1 }));
            const button = document.createElement('button');
            button.dataset.action = 'gold-chest';
            button.id = 'test-gold-chest';
            document.getElementById('app-content').appendChild(button);
            button.click();
            button.remove();
        });
        await tab.waitForSelector('#chest-overlay [data-chest-go]');
        await tab.click('#chest-overlay [data-chest-go]');
        await tab.waitForSelector('#chest-overlay [data-chest-pomucka]', { timeout: 10000 });
        assert.deepEqual(db.calls.filter(call => call.name === 'player_items_claim').pop().body, { source: 'gold', key: 'gold:2026-W46' });
        assert.match(await tab.textContent('[data-chest-pomucka]'), /A navíc pomůcka do Řetězovky: Záchrana navíc/);
        assert.equal(await tab.locator('[data-chest-pomucka] .cq-item-chain_rescue').count(), 1, 'pečeť Záchrany navíc');
        assert.equal(db.items['u-1'].chain_rescue, 1);
        await tab.waitForTimeout(1300);
        await shot(tab, 'pomucky-zlata-truhla-360');
        await tab.click('#chest-overlay [data-chest-close]');
        // Další Truhla Mudrlanta bez pomůcky, ale se vzácným vzorem praporce Duha (blok 38, los na serveru)
        db.chestLucky = false;
        db.chestPattern = true;
        await tab.evaluate(() => {
            const state = JSON.parse(localStorage.getItem('mudrlant.rewards'));
            // Truhla téhož týdne je už otevřená: vrátíme ji, aby čekala znovu (jinak by ji aplikace při načtení vyřadila)
            delete state.chests['2026-11-09'];
            state.ready = ['2026-11-09'];
            localStorage.setItem('mudrlant.rewards', JSON.stringify(state));
        });
        await tab.reload();
        await tab.waitForSelector('[data-chest-ready]', { timeout: 15000 });
        await tab.click('[data-chest-ready]');
        await tab.waitForSelector('#chest-overlay [data-chest-go]');
        await tab.click('#chest-overlay [data-chest-go]');
        await tab.waitForSelector('#chest-overlay [data-chest-pattern]', { timeout: 10000 });
        assert.match(await tab.textContent('[data-chest-pattern]'), /A navíc vzácná výplň území do Dobývání: Duha/);
        assert.equal(await tab.locator('[data-chest-pattern] svg image[href="icons/vzory/duha.webp"]').count(), 1, 'vzorek území ve výplni Duha');
        assert.equal(await tab.locator('#chest-overlay [data-chest-pomucka]').count(), 0);
        await tab.waitForTimeout(1300);
        assert.ok(await tab.evaluate(() => { const card = document.querySelector('#chest-overlay [data-chest-card]').getBoundingClientRect(); return card.top >= 0 && card.bottom <= window.innerHeight; }), 'truhla se vzorem se vejde');
        await shot(tab, 'vzor-truhla-duha-360');
        await tab.click('#chest-overlay [data-chest-close]');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    // Vzkříšení (blok 39): Jana (u-1) přišla o Česko (Petr ho drží neopevněné) i o Slovensko (Petr, Palisáda)
    const fallen = ({ revive = 2, schema39 = true } = {}) => {
        const db = running();
        db.items = { 'u-1': { extra_move: 0, fifty: 0, revive } };
        db.revive = schema39;
        const g = db.games[0];
        g.territories.forEach(t => { if (t.t === 'Q213') Object.assign(t, { o: 'u-2', h: false, l: 0 }); if (t.t === 'Q214') Object.assign(t, { o: 'u-2', l: 1 }); });
        g.moves.push({ id: 3, u: 'u-2', k: 'attack', t: 'Q214', r: 'capture', v: 'u-1', n: 0, at: NOW, p: false, h: false, l: 0 },
            { id: 4, u: 'u-2', k: 'attack', t: 'Q213', r: 'capture', v: 'u-1', n: 0, at: NOW, p: false, h: true, l: 0 },
            { id: 5, u: 'u-2', k: 'fortify', t: 'Q214', r: 'fortify', n: 0, at: NOW, p: false, h: false, l: 1 });
        g.players.forEach(p => { p.score = g.territories.filter(x => x.o === p.user).length; p.score_at = NOW; });
        return db;
    };
    const openFromHub = async (tab, id) => {
        await tab.click('#conquest-card');
        await tab.waitForSelector(`[data-cq-play="${id}"]`);
        await tab.click(`[data-cq-play="${id}"]`);
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
    };
    const reviveDialogFits = (tab, height) => tab.evaluate((h) => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return box.scrollHeight - box.clientHeight <= 0 && rect.top >= 0 && rect.bottom <= h; }, height);
    for (const [width, height, colorScheme] of [[360, 640, 'light'], [390, 780, 'dark']]) {
        const mode = colorScheme === 'dark' ? 'tmavy' : 'svetly';
        await t.test(`Vzkříšení na ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): okno po ztrátě všech území, výběr území, animace, štít ochrany, kronika; soupeř vidí chráněné území se zašedlým útokem`, async () => {
            const db = fallen();
            const g = db.games[0];
            const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme });
            // Rozcestník: hra bez mých území nečeká na tah
            await tab.click('#conquest-card');
            await tab.waitForSelector(`[data-cq-game="${g.id}"]`);
            assert.match(await bodyText(tab, `[data-cq-game="${g.id}"]`), /všechna tvá území padla\s*.*Mapa/);
            assert.match(await bodyText(tab, '[data-cq-items]'), /Vzkříšení\s*2\/3/);
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
            await tab.waitForTimeout(300);
            await shot(tab, `vzkriseni-rozcestnik-${width}-${mode}`);
            await tab.click(`[data-cq-play="${g.id}"]`);
            // Okno se ukáže samo: Všechna tvá území padla, Použít Vzkříšení? Máš 2 ze 3
            await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Vzkříšení', null, { timeout: 15000 });
            const offer = await bodyText(tab, '#dialog-overlay');
            assert.match(offer, /Všechna tvá území padla\.\s*Použít Vzkříšení\? Vybereš si volné nebo neopevněné území \(ne domovský hrad\)[\s\S]*Na 60 s bude chráněné před útoky\. Domovské nebude\.\s*Máš 2 ze 3\.\s*Použít\s*Teď ne/);
            assert.doesNotMatch(offer, /\b(přišel|přišla)\b/);
            assert.ok(await reviveDialogFits(tab, height), 'okno se vejde');
            await tab.waitForTimeout(350);
            await shot(tab, `vzkriseni-okno-${width}-${mode}`);
            // Teď ne: zůstane štítek Vzkříšení dole na mapě, ten okno otevře znovu
            await tab.click('[data-cq="revive-later"]');
            await tab.waitForSelector('[data-cq-chips] [data-cq="revive-use"]');
            assert.match(await bodyText(tab, '[data-cq-chips]'), /Vzkříšení 2\/3/);
            await tab.click('[data-cq-chips] [data-cq="revive-use"]');
            await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Vzkříšení');
            await tab.click('[data-cq="revive-start"]');
            // Výběr: pruh nahoře, zlatě září jen platná území; domovský hrad ani opevněné nejdou (hláška, bez volání serveru)
            await tab.waitForSelector('[data-cq-revive-bar]');
            assert.match(await bodyText(tab, '[data-cq-revive-bar]'), /Klepni na zářící území\s*\d+ území k výběru\s*Zrušit/);
            const lit = await tab.evaluate(() => [...document.querySelectorAll('[data-cq-revive-target]')].map(path => path.dataset.cqReviveTarget));
            assert.ok(lit.includes('Q213') && lit.includes('Q40') && !lit.includes('Q214') && !lit.includes('Q20') && !lit.includes('Q183'), lit.join(','));
            assert.equal(await tab.locator('[data-cq-chips] [data-cq="revive-use"]').count(), 0, 'štítek během výběru zmizí');
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
            await tab.waitForTimeout(400);
            await shot(tab, `vzkriseni-vyber-${width}-${mode}`);
            await tapTerritory(tab, 'Q214');
            await tab.waitForFunction(() => /Opevněné území Vzkříšením vzít nejde/.test(document.body.textContent));
            assert.equal(db.calls.filter(call => call.name === 'conquest_use_revive').length, 0);
            assert.equal(await tab.locator('[data-cq-sheet] .cq-sheet').count(), 0, 'list území se při výběru neotevře');
            // Česko (neopevněné, drží ho Petr): animace, přebarvení, štít 60 s (pauza, ať druhé klepnutí vedle není dvojité klepnutí)
            await tab.waitForTimeout(450);
            await tapTerritory(tab, 'Q213');
            await tab.waitForSelector('.cq-ankh-rise');
            assert.deepEqual(db.calls.filter(call => call.name === 'conquest_use_revive').pop().body, { game: g.id, target: 'Q213' });
            await tab.waitForTimeout(550);
            await shot(tab, `vzkriseni-animace-${width}-${mode}`);
            await tab.waitForSelector('[data-shield="Q213"]', { timeout: 10000 });
            await tab.waitForFunction(() => /Vzkříšení! Česko je tvoje, 60 s chráněné\./.test((document.querySelector('[data-cq-banner]') || {}).textContent || ''));
            assert.equal((await tab.textContent('[data-shield="Q213"] [data-cq-shield-at]')).trim(), '60 s');
            assert.equal(await tab.locator('[data-cq-revive-bar]').count(), 0, 'výběr skončil');
            assert.equal(await tab.locator('[data-cq-chips] [data-cq="revive-use"]').count(), 0);
            assert.match(await tab.textContent('[data-cq-budget]'), /5\/5/, 'tahy zůstaly');
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
            await tab.waitForTimeout(700);
            await shot(tab, `vzkriseni-ochrana-${width}-${mode}`);
            // Kronika: Vzkříšení s praporcem, kdo o území přišel
            assert.match(await bodyText(tab, '[data-cq-recent]'), /Česko\s*Vzkříšení\s*ty/);
            await tab.click('#conquest-game button[aria-label="Kronika tažení"]');
            await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Kronika tažení');
            assert.match(await bodyText(tab, '#dialog-overlay'), /Česko: Vzkříšení ty · dosud Petr Svoboda/);
            await shot(tab, `vzkriseni-kronika-${width}-${mode}`);
            await tab.keyboard.press('Escape');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
            // Petr (u-2): Česko je chráněné – štít s odpočtem, zašedlé Zaútočit; v kronice „dosud ty“; po 60 s útok jde
            const other = await start(db, { viewport: { width, height }, colorScheme, storage: login('tok-u2') });
            await openFromHub(other.tab, g.id);
            await other.tab.waitForSelector('[data-shield="Q213"]');
            await tapTerritory(other.tab, 'Q213');
            await other.tab.waitForSelector('[data-cq-sheet] [data-cq-shielded]');
            assert.equal(await other.tab.locator('[data-cq-sheet] [data-cq-shielded]').isDisabled(), true);
            assert.match(await bodyText(other.tab, '[data-cq-sheet]'), /Jana Nováková[\s\S]*Zaútočit\s*Území je chráněné po vzkříšení ještě 60 s\. Pak na něj půjde zaútočit\./);
            assert.equal(await other.tab.locator('[data-cq-sheet] [data-cq="attack"]').count(), 0);
            assert.deepEqual(await fits(other.tab), { vertical: 0, page: 0, content: 0 });
            await other.tab.waitForTimeout(400);
            await shot(other.tab, `vzkriseni-chranene-${width}-${mode}`);
            await other.tab.clock.setFixedTime(new Date(Date.parse(NOW) + 45000));
            await other.tab.waitForFunction(() => /ještě 15 s/.test(document.querySelector('[data-cq-sheet]').textContent));
            await other.tab.clock.setFixedTime(new Date(Date.parse(NOW) + 61000));
            await other.tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]', { timeout: 5000 });
            assert.equal(await other.tab.locator('[data-shield="Q213"]').count(), 0, 'štít zmizel');
            await other.tab.click('[data-cq="sheet-close"]');
            await other.tab.click('#conquest-game button[aria-label="Kronika tažení"]');
            await other.tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Kronika tažení');
            assert.match(await bodyText(other.tab, '#dialog-overlay'), /Česko: Vzkříšení Jana Nováková · dosud ty/);
            assert.deepEqual(other.log.errors, []);
            assert.deepEqual(other.log.csp, []);
            await other.context.close();
        });
    }

    await t.test('Vzkříšení: bez pomůcky Mimo hru (okno jak ji získat, štítek), omezený pohyb; starší databáze Návrat do hry bez okna', async () => {
        const db = fallen({ revive: 0 });
        const g = db.games[0];
        const { context, tab, log } = await start(db, { reducedMotion: 'reduce' });
        await openFromHub(tab, g.id);
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Vzkříšení', null, { timeout: 15000 });
        assert.match(await bodyText(tab, '#dialog-overlay'), /Všechna tvá území padla\.\s*Vzkříšení nemáš, hru teď jen sleduješ\. Když ho během hry získáš, můžeš se vrátit\.\s*Jak získat Vzkříšení: Jedno na začátek, dohraná započítaná hra Dobývání s body[\s\S]*Nejvýš 3\.\s*Rozumím/);
        assert.ok(await reviveDialogFits(tab, 640));
        await shot(tab, 'vzkriseni-bez-pomucky-360');
        await tab.click('[data-cq="revive-later"]');
        await tab.waitForSelector('[data-cq-chips] [data-cq="revive-how"]');
        assert.match(await bodyText(tab, '[data-cq-chips]'), /Mimo hru · jak se vrátit/);
        await tapTerritory(tab, 'Q40');
        await tab.waitForSelector('[data-cq-sheet] .cq-sheet');
        assert.match(await bodyText(tab, '[data-cq-sheet]'), /Všechna tvá území padla\. Bez Vzkříšení hru už jen sleduješ\./);
        assert.equal(await tab.locator('[data-cq-sheet] [data-cq="revive-use"]').count(), 0);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
        // Starší databáze (bez bloku 39): okno ani štítek nejsou, hráč čeká na Návrat do hry
        const old = fallen({ schema39: false });
        const page = await start(old);
        await openFromHub(page.tab, old.games[0].id);
        await tapTerritory(page.tab, 'Q40');
        await page.tab.waitForSelector('[data-cq-sheet] .cq-sheet');
        assert.match(await bodyText(page.tab, '[data-cq-sheet]'), /Nemáš žádné území\. V dalším období dostaneš nové\./);
        assert.equal(await page.tab.locator('#dialog-overlay').count(), 0);
        assert.equal(await page.tab.locator('[data-cq-chips] [data-cq^="revive"]').count(), 0);
        assert.deepEqual(page.log.errors, []);
        await page.context.close();
    });

    await t.test('Česko na 360×640: mapa krajů, hodinové tahy, otázka o kraji', async () => {
        const db = newDb();
        const g = db.games[1];
        g.players = [{ user: 'u-1', seat: 0, flag_color: 'fialova', emblem: 'sova', ready: true }, { user: 'u-2', seat: 1, flag_color: 'oranzova', emblem: 'medved', ready: true }];
        g.status = 'running'; g.started_at = NOW; g.ends_at = '2026-11-11T22:00:00Z';
        g.territories = MAPS.cesko.t.map(item => ({ t: item.id, o: { Q192697: 'u-1', Q191091: 'u-2' }[item.id] || null, l: 0, h: ['Q192697', 'Q191091'].includes(item.id), p: item.id === 'Q193317' }));
        g.moves = [];
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Tahy 3\/3/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-wait [data-action="conquest-play"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        assert.equal(await tab.locator('.cq-abroad').count(), 1, 'kolem Česka cizina, ne moře');
        await tapTerritory(tab, 'Q193307');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
        await tab.click('[data-cq-sheet] [data-cq="attack"]');
        await tab.waitForSelector('[data-cq-answer]', { timeout: 30000 });
        assert.match(await tab.textContent('[data-cq-sheet]'), /Olomouc|Olomouck/);
        await shot(tab, 'cesko-otazka-360');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('konec hry: stupně vítězů, odměna jen jednou (XP a odznak Dobyvatel), přehrání; omezený pohyb', async () => {
        const db = running();
        const g = db.games[0];
        g.status = 'finished';
        g.ends_at = '2026-11-11T09:00:00Z';
        g.players.find(p => p.user === 'u-1').place = 1;
        g.players.find(p => p.user === 'u-2').place = 2;
        g.players.push({ user: 'u-3', seat: 2, flag_color: 'zelena', emblem: 'drak', ready: true, score: 1, place: 3 });
        g.moves.push({ id: 3, u: 'u-1', k: 'attack', t: 'Q40', r: 'capture', n: 1, at: NOW });
        const { context, tab, log } = await start(db, { reducedMotion: 'reduce' });
        // Odměna se vyzvedne už po načtení her (jednou)
        await tab.waitForFunction(() => { const p = JSON.parse(localStorage.getItem('mudrlant.progress') || '{}'); return p.xp >= 150 && p.counters && p.counters.conquestWins === 1; }, null, { timeout: 15000 });
        await tab.click('#conquest-card');
        await tab.waitForSelector(`[data-cq-play="${uuid(1)}"]`);
        assert.match(await tab.textContent(`[data-cq-game="${uuid(1)}"]`), /Konec · 1\. místo/);
        await tab.click(`[data-cq-play="${uuid(1)}"]`);
        await tab.waitForSelector('[data-cq-result]');
        assert.equal(await tab.locator('.cq-podium-step').count(), 3);
        await shot(tab, 'konec-360');
        await tab.click('[data-cq="replay"]');
        await tab.waitForSelector('[data-cq-result]', { timeout: 15000 });
        assert.equal(db.calls.filter(call => call.name === 'conquest_claim').length, 1, 'odměna jen jednou');
        const progress = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')));
        assert.equal(progress.counters.conquestWins, 1);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('konec hry poprvé: území vítěze se rozzáří, kartuše s vítězem, pak list výsledků (napodruhé hned list)', async () => {
        const db = running();
        const g = db.games[0];
        g.status = 'finished';
        g.ends_at = '2026-11-11T09:00:00Z';
        g.players.find(p => p.user === 'u-1').place = 1;
        g.players.find(p => p.user === 'u-2').place = 2;
        const { context, tab, log } = await start(db, { viewport: { width: 390, height: 780 }, colorScheme: 'dark' });
        await tab.click('#conquest-card');
        await tab.click(`[data-cq-play="${uuid(1)}"]`);
        await tab.waitForSelector('.cq-finale-banner');
        assert.ok(await tab.locator('.cq-win-glow').count() > 0, 'území vítěze září');
        assert.match(await tab.textContent('.cq-finale-banner'), /Vítězství!/);
        await tab.waitForTimeout(700);
        await shot(tab, 'konec-animace-390-dark');
        await tab.waitForSelector('[data-cq-result]', { timeout: 8000 });
        await tab.waitForTimeout(500);
        await shot(tab, 'konec-390-dark');
        // Zavření listu vrátí mapu do běžného stavu, nové otevření hry už animaci nepřehraje
        await tab.click('[data-cq="sheet-close"]');
        assert.equal(await tab.locator('.cq-win-glow, .cq-finale-banner').count(), 0);
        assert.equal(await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.conquestFinale')).length), 1);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    // Okno přes celou výšku: nevyčnívá z obrazovky a samo se neposouvá (seznam přátel se posouvá uvnitř)
    const dialogFits = (tab, height) => tab.evaluate((h) => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return box.scrollHeight - box.clientHeight <= 0 && rect.top >= 0 && rect.bottom <= h; }, height);
    const toast = (tab, pattern) => tab.waitForFunction((source) => new RegExp(source).test(((document.getElementById('toast') || {}).textContent || '').trim()), pattern.source);
    await t.test('pozvánky přátel (blok 24): při zakládání výběr přátel, v lobby „Pozváno“ a Pozvat přátele; pozvaný vidí pozvánku na kartě i v Mých hrách, z upozornění i tlačítkem se přidá, jinou odmítne', async () => {
        const db = newDb();
        db.friends = { 'u-1': ['u-2', 'u-3'], 'u-2': ['u-1', 'u-3'] };
        // Eva (u-3) už dřív pozvala Petra do své hry na Asii
        db.games.push({ id: uuid(3), creator: 'u-3', map: 'asie', max_players: 3, hours: 24, period: 'day', actions: 4, visibility: 'public', code: 'ASI234', preset: null, status: 'lobby', created_at: NOW,
            players: [{ user: 'u-3', seat: 0, flag_color: 'zelena', emblem: 'drak', ready: false }] });
        db.invites = [{ game: uuid(3), user: 'u-2', by: 'u-3', declined: false }];
        const host = await start(db);
        let { tab, log } = host;
        await tab.click('#conquest-card');
        await tab.waitForSelector('#conquest-hub');
        // Založit hru: Evropa, 4 hráči, soukromá; Pozvat přátele vedle Barvy a znaku
        await tab.click('[role="tab"][data-cq-tab="create"]');
        await tab.click('[data-cq-set="map"][data-value="evropa"]');
        await tab.click('[data-cq-set="visibility"][data-value="private"]');
        while (Number(await tab.textContent('[data-cq-value="players"]')) > 4) await tab.click('[data-cq-step="players"][data-delta="-1"]');
        while (Number(await tab.textContent('[data-cq-value="players"]')) < 4) await tab.click('[data-cq-step="players"][data-delta="1"]');
        assert.match((await tab.textContent('[data-cq="invite-pick"]')).replace(/\s+/g, ' ').trim(), /^Pozvat přátele\s*Zatím nikoho$/);
        await tab.click('[data-cq="invite-pick"]');
        await tab.waitForSelector('[data-cq-friend="u-3"]');
        assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Pozvat přátele');
        assert.match(await tab.textContent('[data-cq-invite-hint]'), /Volná místa: 3\. Pozvánky odejdou, hned jak hru založíš\./);
        assert.ok(await dialogFits(tab, 640), 'okno Pozvat přátele se vejde na 360×640');
        await tab.click('[data-cq-friend="u-2"]');
        await tab.click('[data-cq-friend="u-3"]');
        assert.deepEqual(await tab.$$eval('[data-cq-friend]', els => els.map(el => el.getAttribute('aria-checked'))), ['true', 'true']);
        assert.match(await tab.textContent('[data-cq="invite-done"]'), /Pozvat \(2\)/);
        await shot(tab, 'pozvat-pratele-360');
        await tab.click('[data-cq="invite-done"]');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        assert.match((await tab.textContent('[data-cq="invite-pick"]')).replace(/\s+/g, ' ').trim(), /Pozvánky \(2\)\s*Petr Svoboda, Eva Mistr$/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'formulář s pozvanými se vejde na 360×640');
        await shot(tab, 'zalozit-pozvanky-360');
        await tab.click('[data-cq-form] button[type="submit"]');
        await tab.waitForSelector('[data-cq-lobby-detail] [data-cq-invited]');
        await toast(tab, /^Hra je založená\. Pozvánky jsou odeslané \(2\)\.$/);
        const created = db.games.find(g => g.creator === 'u-1');
        assert.deepEqual(db.calls.filter(call => call.name === 'conquest_invite').map(call => call.body), [{ game: created.id, friends: ['u-2', 'u-3'] }]);
        // Lobby: pozvaní zašedlí „Pozváno“, Pozvat přátele (volné místo zbývá); vejde se na 360×640
        assert.deepEqual(await tab.$$eval('[data-cq-invited]', els => els.map(el => el.dataset.cqInvited)), ['u-2', 'u-3']);
        assert.match((await tab.textContent('[data-cq-lobby-detail] ul')).replace(/\s+/g, ' '), /Jana Nováková \(ty\) Čeká \S*Petr Svoboda Pozváno \S*Eva Mistr Pozváno\s*Volná místa: 3\./);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'lobby s pozvanými se vejde na 360×640');
        await shot(tab, 'lobby-pozvano-360');
        // Pozvat přátele z lobby: oba už pozvaní (zašedlí), volné místo 1
        await tab.click('[data-cq-lobby-detail] [data-cq="invite-pick"]');
        await tab.waitForSelector('[data-cq-friend="u-2"][disabled]');
        assert.match((await tab.textContent('[data-cq-friend="u-2"]')).replace(/\s+/g, ' '), /Petr Svoboda Pozváno/);
        assert.match(await tab.textContent('[data-cq-invite-hint]'), /Volná místa: 1\. Vyber, koho pozveš\./);
        assert.equal(await tab.getAttribute('[data-cq="invite-done"]', 'disabled'), '', 'bez výběru nejde poslat');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await host.context.close();

        // Petr (390×780, tmavý režim): pozvánka na kartě Dobývání (od Jany, novější první) a v Mých hrách
        db.invites.sort((a, b) => (a.by === 'u-1' ? -1 : b.by === 'u-1' ? 1 : 0));
        const guest = await start(db, { viewport: { width: 390, height: 780 }, colorScheme: 'dark', storage: { ...login('tok-u2'), 'mudrlant.conquestInvitesSeen': JSON.stringify({ [created.id]: 1, [uuid(3)]: 1 }) } });
        ({ tab, log } = guest);
        await tab.waitForSelector('#conquest-wait [data-action="conquest-invite"]', { timeout: 15000 });
        assert.match((await tab.textContent('#conquest-wait')).replace(/\s+/g, ' '), /Dobývání\s*2\s*Pozvánka od Jana Nováková Evropa · 3 dny · \+1 Přidat se/);
        assert.ok(await tab.$('#waiting-section #conquest-wait'), 'pozvánka je v části Čeká na tebe');
        assert.match((await tab.textContent('#conquest-card')).replace(/\s+/g, ' '), /Dobývání.*Pozvánky do her: 2/);
        assert.equal(await tab.getAttribute('#conquest-wait [data-cq-invite-badge]', 'aria-label'), 'Pozvánky do her: 2');
        assert.equal(await tab.locator('#dialog-overlay').count(), 0, 'viděné pozvánky se oknem znovu neukážou');
        await shot(tab, 'karta-pozvanka-390-dark');
        // Přidat se z karty: otevře se rozcestník (pozvánky v Mých hrách) a nad ním Barva a znak; zatím zavřít
        await tab.click('#conquest-wait [data-action="conquest-invite"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Tvoje barva a znak');
        await tab.waitForSelector(`#conquest-hub [data-cq-invite="${created.id}"]`);
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        assert.equal((await tab.textContent('[data-cq-tab="mine"] [data-cq-invite-count]')).replace(/\s+/g, ' ').trim(), 'Pozvánky: 2');
        assert.match((await tab.textContent(`[data-cq-invite="${created.id}"]`)).replace(/\s+/g, ' '), /Jana Nováková tě zve do hry Evropa · 3 dny · 1\/4 Přidat se Odmítnout/);
        assert.match((await tab.textContent(`[data-cq-invite="${uuid(3)}"]`)).replace(/\s+/g, ' '), /Eva Mistr tě zve do hry Asie · 1 den · 1\/3/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'Moje hry s pozvánkami se vejdou na 390×780');
        await shot(tab, 'moje-hry-pozvanky-390-dark');
        // Odmítnout Evinu pozvánku
        await tab.click(`[data-cq-decline="${uuid(3)}"]`);
        await toast(tab, /^Pozvánka odmítnuta\.$/);
        await tab.waitForFunction((gid) => !document.querySelector(`[data-cq-invite="${gid}"]`), uuid(3));
        assert.ok(db.invites.find(i => i.game === uuid(3)).declined);
        // Klepnutí na upozornění „Jana Nováková tě zve do hry“: rovnou Barva a znak (barvu Jany vybrat nejde)
        await tab.evaluate((value) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'push-open', tab: '', vyzva: '', dobyvani: value, kind: 'conquest_invite' } })), created.code);
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Tvoje barva a znak');
        assert.equal(await tab.getAttribute('[data-cq-color="cervena"]', 'disabled'), '', 'barva Jany je obsazená');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        // Přidat se tlačítkem v Mých hrách: barva a znak, pak lobby hry (bez kódu, i když je soukromá)
        await tab.click(`[data-cq-accept="${created.id}"]`);
        await tab.waitForSelector('[data-cq-color="modra"]');
        await tab.click('[data-cq-color="modra"]');
        await tab.click('[data-cq="look-done"]');
        await tab.waitForSelector(`[data-cq-lobby-detail="${created.id}"]`);
        const join = db.calls.filter(call => call.name === 'conquest_join').pop().body;
        assert.deepEqual([join.game, join.join_code, join.colour], [created.id, '', 'modra']);
        assert.match((await tab.textContent('[data-cq-lobby-detail] ul')).replace(/\s+/g, ' '), /Jana Nováková Čeká Petr Svoboda \(ty\) Čeká \S*Eva Mistr Pozváno\s*Volná místa: 2\./);
        assert.equal(db.invites.filter(i => i.user === 'u-2' && !i.declined).length, 0, 'pozvánka po přidání zmizela');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await shot(tab, 'pozvany-v-lobby-390-dark');
        // V Mých hrách už pozvánky nejsou (Evina odmítnutá, do Janiny hry se Petr přidal)
        await tab.click('#conquest-hub [data-cq-tab="mine"]');
        await tab.waitForSelector(`[data-cq-lobby="${created.id}"]`);
        assert.equal(await tab.locator('[data-cq-invite]').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await guest.context.close();
    });
    // Pozvánka po otevření aplikace (i bez upozornění): okno „Eva Mistr tě zve do Dobývání: Evropa · Rychlá hra“ s Přijmout /
    // Odmítnout / Později, jednou za pozvánku; odznak na řádku Dobývání a na záložce Soupeři ve spodní liště; nová pozvánka po návratu do aplikace
    await t.test('pozvánka po otevření aplikace na 360×640: okno jednou za pozvánku (Později), odznak na kartě i záložce, nová po návratu do aplikace (Odmítnout), Přijmout', async () => {
        const db = newDb();
        db.invites = [{ game: uuid(1), user: 'u-2', by: 'u-3', declined: false }];
        const promptTitle = (tab) => tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Pozvánka do Dobývání', null, { timeout: 15000 });
        const guest = await start(db, { colorScheme: 'light', storage: login('tok-u2') });
        let { tab, log, context } = guest;
        await promptTitle(tab);
        assert.match((await tab.textContent(`[data-cq-invite-prompt="${uuid(1)}"]`)).replace(/\s+/g, ' '), /Eva Mistr tě zve do Dobývání: Evropa · Rychlá hra/);
        assert.deepEqual(await tab.$$eval('#dialog-overlay [data-cq-prompt]', buttons => buttons.map(button => button.textContent.trim())), ['Přijmout', 'Odmítnout', 'Později']);
        assert.ok(await dialogFits(tab, 640), 'okno s pozvánkou se vejde na 360×640');
        assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
        await tab.waitForTimeout(300);
        await shot(tab, 'pozvanka-okno-360');
        // Později: okno zmizí, pozvánka zůstane v řádku Čeká na tebe s odznakem a v odznaku záložky Soupeři
        await tab.click('#dialog-overlay [data-cq-prompt="later"]');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        await tab.waitForSelector('#conquest-wait [data-cq-invite-badge]');
        assert.equal(await tab.getAttribute('#conquest-wait [data-cq-invite-badge]', 'aria-label'), 'Pozvánka do hry');
        await tab.waitForFunction(() => { const badge = document.querySelector('#app-nav [data-nav="souperi"] [data-nav-badge]'); return Boolean(badge) && !badge.classList.contains('hidden') && badge.textContent.trim() === '1'; });
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        await shot(tab, 'pozvanka-karta-odznak-360');
        assert.equal(db.calls.filter(call => call.name === 'conquest_decline_invite').length, 0, 'Později pozvánku neodmítne');
        // Po obnovení stránky (i na záložce Dnes) se stejná pozvánka znovu nenabízí, odznak záložky Soupeři zůstává
        await tab.evaluate(() => sessionStorage.setItem('mudrlant.nav', 'dnes'));
        await tab.reload();
        await nav.waitForHome(tab);
        assert.equal(await nav.currentTab(tab), 'dnes');
        await tab.waitForFunction(() => { const badge = document.querySelector('#app-nav [data-nav="souperi"] [data-nav-badge]'); return Boolean(badge) && !badge.classList.contains('hidden') && badge.textContent.trim() === '1'; }, null, { timeout: 15000 });
        await tab.waitForTimeout(800);
        assert.equal(await tab.locator('#dialog-overlay').count(), 0, 'viděná pozvánka nenaléhá');
        // Nová pozvánka (Jana do Česka): po návratu do aplikace (ověření nejvýš jednou za 5 minut) okno i na záložce Dnes
        db.invites.push({ game: uuid(2), user: 'u-2', by: 'u-1', declined: false });
        await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await tab.waitForTimeout(800);
        assert.equal(await tab.locator('#dialog-overlay').count(), 0, 'dřív než za 5 minut se server znovu neptá');
        await tab.clock.setFixedTime(new Date(Date.parse(NOW) + 6 * 60000));
        await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await promptTitle(tab);
        assert.match((await tab.textContent(`[data-cq-invite-prompt="${uuid(2)}"]`)).replace(/\s+/g, ' '), /Jana Nováková tě zve do Dobývání: Česko · Rychlá hra/);
        assert.ok(await reviveDialogFits(tab, 640));
        await shot(tab, 'pozvanka-okno-navrat-360');
        await tab.click('#dialog-overlay [data-cq-prompt="decline"]');
        await toast(tab, /^Pozvánka odmítnuta\.$/);
        assert.ok(db.invites.find(i => i.game === uuid(2)).declined);
        await tab.waitForFunction(() => { const badge = document.querySelector('#app-nav [data-nav="souperi"] [data-nav-badge]'); return Boolean(badge) && !badge.classList.contains('hidden') && badge.textContent.trim() === '1'; });
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
        // Jiné zařízení (nic viděného): Přijmout → Barva a znak pro hru, do které Eva zve
        ({ tab, log, context } = await start(db, { colorScheme: 'dark', storage: login('tok-u2') }));
        await promptTitle(tab);
        await shot(tab, 'pozvanka-okno-360-dark');
        await tab.click('#dialog-overlay [data-cq-prompt="accept"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Tvoje barva a znak', null, { timeout: 15000 });
        await tab.waitForSelector(`#conquest-hub [data-cq-invite="${uuid(1)}"]`);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
