// Dobývání v prohlížeči s falešným Supabase v paměti (jako tests/e2e-groups.test.js): karta na záložce Více hráčů, rozcestník (Moje hry,
// Lobby s Rychlými hrami, Založit hru), okno Barva a znak (obsazená barva nejde), založení soukromé hry, detail lobby (kód, Chci hrát,
// začátek hry), obrazovka hry (mapa se vejde na 360×640 bez posouvání, klepnutí na území, spodní list, otázka, dobytí, opevnění,
// odražený útok, přiblížení, kronika tažení), konec hry (stupně vítězů, odměna jen jednou, přehrání), CSP bez chyb, tmavý režim.
// SCREENSHOT_DIR=/cesta uloží snímky (dobyvani-*.png). Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
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
        if (!name.startsWith('conquest_') && !name.startsWith('dev_conquest_')) return json(/^(friends_list|reactions|my_groups)$/.test(name) ? [] : {});
        db.calls.push({ name, body });
        const fail = (message, status = 400) => json({ code: 'P0001', message }, status);
        const find = (id) => db.games.find(g => g.id === id);
        const mapOf = (g) => MAPS[g.map];
        const players = (g) => g.players.map(p => ({ ...db.profiles[p.user], seat: p.seat, flag_color: p.flag_color, emblem: p.emblem, ready: p.ready, score: p.score || 0, score_at: p.score_at || null, place: p.place || null, me: p.user === me.id }));
        // Pozvánky (blok 24): db.invites = [{ game, user, by, declined }]; čekající pozvané vidí jen hráči hry v lobby
        const waiting = (g) => (db.invites || []).filter(i => i.game === g.id && !i.declined && !g.players.some(p => p.user === i.user));
        const summary = (g) => ({ id: g.id, map: g.map, max_players: g.max_players, hours: g.hours, ...(g.minutes ? { minutes: g.minutes } : {}), period: g.period, actions: g.actions, visibility: g.visibility, preset: g.preset, status: g.status,
            created_at: g.created_at, started_at: g.started_at || null, ends_at: g.ends_at || null, mine: g.players.some(p => p.user === me.id), creator: g.creator === me.id, code: g.code, players: players(g),
            invited: g.status === 'lobby' && g.players.some(p => p.user === me.id) ? waiting(g).map(i => ({ ...db.profiles[i.user], by_me: i.by === me.id })) : null });
        const mine = (g) => g.players.find(p => p.user === me.id);
        // penalty: v období g.penaltyPeriod hráč kvůli ztracenému hradu o tah méně (schéma 23)
        const budget = (g) => { const used = (g.moves || []).filter(m => m.u === me.id && ['attack', 'fortify'].includes(m.k) && (m.n || 0) === (g.periodNo || 0)).length
            + (g.sieges || []).filter(s => s.status === 'open' && s.participants.some(p => p.user === me.id)).length; const penalty = g.penaltyPeriod !== undefined && g.penaltyPeriod === (g.periodNo || 0) ? 1 : 0; return { period: g.periodNo || 0, base: g.actions, regions: 0, treasures: 0, loot: 0, penalty, used, total: g.actions - penalty, left: Math.max(0, g.actions - penalty - used), period_ends_at: '2026-11-12T10:00:00Z' }; };
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
                participants: s.participants.map(p => { const gp = g.players.find(x => x.user === p.user); return { ...db.profiles[p.user], seat: gp.seat, flag_color: gp.flag_color, emblem: gp.emblem, source: p.source || null, joined_at: NOW, deadline: LATER, answered: Boolean(p.answered), me: p.user === me.id,
                    ...(done ? { correct: Boolean(p.correct), answer_ms: p.answered ? p.answer_ms : null, result: p.result, winner: s.winner === p.user, move: p.move } : {}) }; }) };
        };
        const siegeView = (g, s) => {
            const mineP = s.participants.find(p => p.user === me.id);
            return { ...siegeJson(g, s), now: NOW, ...(mineP ? { question: s.question, answer: mineP.answered ? { choice: mineP.picked, correct: Boolean(mineP.correct), answer_ms: mineP.answer_ms, late: false } : null,
                correct_choice: mineP.answered || s.status === 'resolved' ? s.correct : null, result: mineP.result || null, move: mineP.move || null } : {}) };
        };
        const battles = (g) => (db.battles && g.status !== 'lobby' ? { sieges: (g.sieges || []).filter(s => s.status === 'open').map(s => siegeJson(g, s)), version: `${g.moves.length}.${g.siegeRev || 0}.${g.status}` } : {});
        // Další kolo (blok 26), jen s db.rounds: stav hry a puls mají round (g.round řídí test); db.now = čas serveru (jinak NOW)
        const rounds = (g) => (db.rounds && g.round ? { round: g.round } : {});
        const state = (g) => ({ ...summary(g), now: db.now || NOW, ...rounds(g), ...(g.status === 'lobby' ? {} : { territories: g.territories, budget: g.status === 'running' ? budget(g) : null, moves: g.moves.slice(-150), claimed: Boolean(mine(g) && mine(g).claimed),
            history: g.status === 'finished' ? g.moves.filter(m => ['home', 'respawn', 'capture'].includes(m.r)) : null, ...battles(g),
            // Tahy všech hráčů v tomto kole (schéma 27)
            budgets: g.status === 'running' ? Object.fromEntries(g.players.map(p => { const used = g.moves.filter(m => m.u === p.user && ['attack', 'fortify'].includes(m.k) && (m.n || 0) === (g.periodNo || 0)).length; return [p.user, { left: Math.max(0, g.actions - used), total: g.actions }]; })) : null }) });
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
            const colours = ['zelena', 'zluta', 'fialova', 'oranzova', 'tyrkysova', 'ruzova', 'cerna'].filter(c => !g.players.some(p => p.flag_color === c));
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
        if (name === 'conquest_lobby') {
            return json({ open: db.games.filter(g => g.status === 'lobby' && g.visibility === 'public').map(summary),
                mine: db.games.filter(g => mine(g)).map(g => ({ ...summary(g), budget: g.status === 'running' ? budget(g) : null, claimed: Boolean(mine(g).claimed),
                    owners: g.territories ? Object.fromEntries(g.territories.filter(t => t.o).map(t => [t.t, g.players.find(p => p.user === t.o).seat])) : null })) });
        }
        if (name === 'conquest_create') {
            const g = { id: uuid(db.seq++), creator: me.id, map: body.map_id, max_players: body.players, hours: body.hours, period: body.per, actions: body.actions_per, visibility: body.vis, code: 'NEW234', preset: null, status: 'lobby', created_at: NOW,
                players: [{ user: me.id, seat: 0, flag_color: body.colour, emblem: body.emblem_id, ready: false }] };
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
            g.players.push({ user: me.id, seat: g.players.length, flag_color: body.colour, emblem: body.emblem_id, ready: false });
            if (g.players.length >= g.max_players) start(g);
            return json(summary(g));
        }
        if (name === 'conquest_ready') {
            const g = find(body.game);
            mine(g).ready = body.is_ready;
            if (g.players.length >= 2 && g.players.every(p => p.ready)) start(g);
            return json(summary(g));
        }
        if (name === 'conquest_set_look') { const g = find(body.game); Object.assign(mine(g), { flag_color: body.colour, emblem: body.emblem_id }); return json(summary(g)); }
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
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'), 'mudrlant.tips': JSON.stringify({ off: true }), ...login('tok-u1'), ...storage });
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
        const x = Number(label.getAttribute('x'));
        const y = Number(label.getAttribute('y')) - Number(label.getAttribute('font-size') || 10) * 1.2;
        return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f, ok: Boolean(hit), data };
    }, id);
    assert.ok(point.ok);
    await tab.mouse.click(point.x, point.y);
};

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

    await t.test('karta na Více hráčů, rozcestník, Lobby s Rychlými hrami, založení soukromé hry, Barva a znak, Chci hrát a začátek hry', async () => {
        const db = newDb();
        db.autoJoin = true;
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Najdi hru nebo založ vlastní/.test(document.getElementById('conquest-card').textContent));
        const order = await tab.evaluate(() => [document.getElementById('conquest-card'), document.querySelector('[data-action="new-challenge"]')].map(el => el.getBoundingClientRect().top));
        assert.ok(order[0] < order[1], 'karta je nahoře');
        await shot(tab, 'karta-360');
        await tab.click('#conquest-card [data-action="conquest-open"]');
        await tab.waitForSelector('#conquest-hub');
        assert.match(await tab.textContent('#status-text'), /Dobývání/);
        await tab.waitForSelector('#conquest-hub [data-cq-tab="mine"][aria-selected="true"]');
        await tab.waitForFunction(() => /Zatím nehraješ žádnou hru/.test(document.getElementById('conquest-hub').textContent));
        // Jak se hraje: okno se vejde na 360×640
        await tab.click('[data-cq="help"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Jak se hraje Dobývání');
        // Čtyři záložky (Základy, Útok, Regiony, Konec), každá se vejde; tlačítko Dál vede na další
        for (const [tabId, pattern] of [['zaklady', /Kola:[\s\S]*Chci další kolo[\s\S]*Tahy:/], ['utok', /Správně:[\s\S]*Opevnění:/], ['regiony', /Region: Skupina sousedních území[\s\S]*Britské ostrovy/], ['konec', /Body:[\s\S]*Odměny:/]]) {
            await tab.waitForSelector(`[data-cq-help="${tabId}"]`);
            assert.match(await tab.textContent('[data-cq-help]'), pattern, tabId);
            const helpFit = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return { over: box.scrollHeight - box.clientHeight, top: rect.top, bottom: rect.bottom }; });
            assert.ok(helpFit.over <= 0 && helpFit.top >= 0 && helpFit.bottom <= 640, `nápověda ${tabId} se vejde: ${JSON.stringify(helpFit)}`);
            await shot(tab, `napoveda-${tabId}-360`);
            if (tabId !== 'konec') await tab.click('[data-cq-help] button[data-cq-help-tab]:not([role="tab"])');
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

    await t.test('vývojář: boti do lobby (+1 bot, Doplnit boty), plná hra začne; ve hře Boti odehrají tahy a Další období; bez vývojářského režimu lišta není', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db, { storage: { 'mudrlant.dev': '1' } });
        await tab.click('#conquest-card [data-action="conquest-open"]');
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
        assert.equal(await tab.getAttribute('[data-cq-budget]', 'title'), 'Tahy v tomto období (o 1 méně kvůli ztracenému hradu)');
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
        await second.tab.click('#conquest-card [data-action="conquest-open"]');
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
    for (const [width, height, colorScheme] of [[360, 640, 'light'], [390, 780, 'dark']]) {
        await t.test(`hra ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): mapa bez posouvání, útok s otázkou a dobytím, pobourání hradby, opevnění, odražený útok, přiblížení, kronika`, async () => {
            const db = running();
            const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme });
            await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
            await tab.click('#conquest-card [data-action="conquest-play"]');
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
            await shot(tab, `list-${width}-${colorScheme}`);
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
            await shot(tab, `priblizeni-${width}-${colorScheme}`);
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
        await tab.click('#conquest-card [data-action="conquest-play"]');
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
        await tab.click('#conquest-card [data-action="conquest-play"]');
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
        await page.tab.click('#conquest-card [data-action="conquest-play"]');
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
            await tab.waitForSelector('[data-cq-full] .cq-qimg img', { timeout: 20000 });
            assert.match(await tab.getAttribute('[data-cq-full] .cq-qimg img', 'src'), /^https:\/\/upload\.wikimedia\.org\//);
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
        await tab.click('#conquest-card [data-action="conquest-play"]');
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

    await t.test('Česko na 360×640: mapa krajů, hodinové tahy, otázka o kraji', async () => {
        const db = newDb();
        const g = db.games[1];
        g.players = [{ user: 'u-1', seat: 0, flag_color: 'fialova', emblem: 'sova', ready: true }, { user: 'u-2', seat: 1, flag_color: 'oranzova', emblem: 'medved', ready: true }];
        g.status = 'running'; g.started_at = NOW; g.ends_at = '2026-11-11T22:00:00Z';
        g.territories = MAPS.cesko.t.map(item => ({ t: item.id, o: { Q192697: 'u-1', Q191091: 'u-2' }[item.id] || null, l: 0, h: ['Q192697', 'Q191091'].includes(item.id), p: item.id === 'Q193317' }));
        g.moves = [];
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Tahy 3\/3/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-card [data-action="conquest-play"]');
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
        await tab.click('#conquest-card [data-action="conquest-open"]');
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
        await tab.click('#conquest-card [data-action="conquest-open"]');
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
        await tab.click('#conquest-card [data-action="conquest-open"]');
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
        const guest = await start(db, { viewport: { width: 390, height: 780 }, colorScheme: 'dark', storage: login('tok-u2') });
        ({ tab, log } = guest);
        await tab.waitForSelector('#conquest-card [data-action="conquest-invite"]', { timeout: 15000 });
        assert.match((await tab.textContent('#conquest-card')).replace(/\s+/g, ' '), /Dobývání\s*Pozvánka od Jana Nováková Evropa · 3 dny · \+1 Přidat se/);
        await shot(tab, 'karta-pozvanka-390-dark');
        // Přidat se z karty: otevře se rozcestník (pozvánky v Mých hrách) a nad ním Barva a znak; zatím zavřít
        await tab.click('#conquest-card [data-action="conquest-invite"]');
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
});
