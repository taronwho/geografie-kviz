// Týdenní turnaje v prohlížeči s falešným Supabase v paměti (stav turnaje „spočítaný serverem“, jako v tests/e2e-rating.test.js):
// přihlášky a kapacita, běžící turnaj a tlačítko Hrát, zápas až do výsledku (i pokračování rozehraného po zavření aplikace), zprávy, dialog pavouka, starší databáze bez turnajů,
// CSP bez chyb, 360×640 a 390×780 bez vodorovného posouvání, tmavý režim. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
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

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};

const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T_RUN = uuid(1);
const T_OPEN = uuid(2);
const MON = '2026-11-09';
const NAMES = ['Adam', 'Barbora', 'Cyril', 'Dana', 'Emil', 'Fanda', 'Gita', 'Honza', 'Ivana', 'Jirka', 'Klára', 'Libor', 'Marta', 'Nikola', 'Ondra', 'Petra'];

// Falešná databáze: today = den (Praha) podle serveru. Hráči u-1 (já), u-2 (Petr Svoboda) a další vyplňují přihlášky.
const newDb = ({ today = MON } = {}) => {
    const db = {
        today, missing: false, schema: undefined, admin: false, errorsSent: [], calls: [], gets: [], myTimeMs: 20000, failJoin: null, failStart: null, stats: { best: 0, wins: 0, played: 0 }, patches: [],
        profiles: {
            'u-1': { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [], rating: 1120, rated_games: 6 },
            'u-2': { id: 'u-2', display_name: 'Petr Svoboda', avatar: '🐼', color: 'sky', xp: 4000, badges: [], rating: 1260, rated_games: 14 }
        },
        tournaments: [], entries: [], matches: [], results: [], notices: [],
        // Schéma 3: odpovědi zápasu po otázkách (answersMissing = starší databáze bez nich) a vyplacené XP za výhry (claimMissing = bez evidence)
        answers: [], answersMissing: false, claims: [], claimMissing: false, claimLost: 0
    };
    return db;
};
const addPlayers = (db, count) => {
    for (let i = 0; i < count; i++) db.profiles[`f-${i + 1}`] = { id: `f-${i + 1}`, display_name: `${NAMES[i % NAMES.length]} ${i + 1}`, avatar: '🐸', color: 'violet', xp: 100 * i, badges: [] };
    return Array.from({ length: count }, (_, i) => `f-${i + 1}`);
};
const addEntry = (db, tid, user, status = 'registered', place = null) => db.entries.push({ tournament_id: tid, user_id: user, joined_at: new Date(Date.UTC(2026, 10, 2, 8, db.entries.length)).toISOString(), status, place });
// Běžící turnaj o osmi hráčích (čtvrtfinále dnes): já proti Petrovi + tři zápasy ostatních
const runningEight = (db, { opponentResult = null, myStarted = false } = {}) => {
    db.tournaments.push({ id: T_RUN, topic: 'mix', week_start: MON, started_on: MON, capacity: 128, status: 'running', size: 8, rounds: 3, seed: 'seed-abc' });
    const fillers = addPlayers(db, 6);
    ['u-1', 'u-2', ...fillers].forEach(user => addEntry(db, T_RUN, user, 'playing'));
    db.matches.push({ id: uuid(101), tournament_id: T_RUN, round: 1, slot: 1, third: false, p1: 'u-1', p2: 'u-2', winner: null, decided_by: null });
    [[fillers[0], fillers[1]], [fillers[2], fillers[3]], [fillers[4], fillers[5]]].forEach(([a, b], i) => db.matches.push({ id: uuid(102 + i), tournament_id: T_RUN, round: 1, slot: 2 + i, third: false, p1: a, p2: b, winner: null, decided_by: null }));
    if (opponentResult) db.results.push({ match_id: uuid(101), user_id: 'u-2', started_at: '2026-11-09T07:00:00Z', finished_at: '2026-11-09T07:01:00Z', time_ms: 60000, ...opponentResult });
    if (myStarted) db.results.push({ match_id: uuid(101), user_id: 'u-1', started_at: '2026-11-09T08:00:00Z', finished_at: null, correct: null, points: null, time_ms: null });
    return fillers;
};
// Týž turnaj, můj zápas 1. kola už rozhodnutý serverem: vyhrál jsem (6 správně proti 2), Petr vypadl
const wonEight = (db) => {
    runningEight(db);
    Object.assign(db.matches.find(match => match.id === uuid(101)), { winner: 'u-1', decided_by: 'played' });
    db.results.push({ match_id: uuid(101), user_id: 'u-1', started_at: '2026-11-09T08:00:00Z', finished_at: '2026-11-09T08:02:00Z', correct: 6, points: 18, time_ms: 120000 },
        { match_id: uuid(101), user_id: 'u-2', started_at: '2026-11-09T07:00:00Z', finished_at: '2026-11-09T07:02:00Z', correct: 2, points: 6, time_ms: 120000 });
    Object.assign(db.entries.find(entry => entry.tournament_id === T_RUN && entry.user_id === 'u-2'), { status: 'out', place: 5 });
    db.stats = { best: 2, wins: 1, played: 1 };
};
const openTournament = (db, count, { capacity = 128, mine = false } = {}) => {
    db.tournaments.push({ id: T_OPEN, topic: 'mix', week_start: '2026-11-16', started_on: null, capacity, status: 'open', size: null, rounds: null, seed: 'seed-next' });
    const others = addPlayers(db, count - (mine ? 1 : 0));
    others.forEach(user => addEntry(db, T_OPEN, user));
    if (mine) addEntry(db, T_OPEN, 'u-1');
};

// Velký pavouk (size hráčů, první `done` kol rozhodnutých, další kolo běží; finished = celý turnaj hotový). Já (u-1) vyhrávám všechno až do kola meOut,
// kde prohrávám; ostatní vyhrává ten, kdo je dřív v seznamu přihlášených. Místa vypadlých jako v databázi: (velikost >> kolo) + 1.
const bigTournament = (db, { size, done, finished = false, meOut = 0 }) => {
    const rounds = Math.round(Math.log2(size));
    db.tournaments.push({ id: T_RUN, topic: 'mix', week_start: MON, started_on: MON, capacity: 128, status: finished ? 'finished' : 'running', size, rounds, seed: `seed-${size}` });
    const ids = ['u-1', 'u-2', ...addPlayers(db, size - 2)];
    ids.forEach(id => addEntry(db, T_RUN, id, finished ? 'finished' : 'playing'));
    const entryOf = (id) => db.entries.find(entry => entry.tournament_id === T_RUN && entry.user_id === id);
    let alive = ids;
    let count = 0;
    for (let round = 1; round <= (finished ? rounds : done + 1); round++) {
        const decided = round <= done || finished;
        const next = [];
        const losers = [];
        for (let slot = 1; slot <= alive.length / 2; slot++) {
            const [a, b] = [alive[2 * slot - 2], alive[2 * slot - 1]];
            const forced = round === meOut && (a === 'u-1' || b === 'u-1');
            const winner = !decided ? null : forced ? (a === 'u-1' ? b : a) : ids.indexOf(a) < ids.indexOf(b) ? a : b;
            const match = { id: uuid(1000 + count++), tournament_id: T_RUN, round, slot, third: false, p1: a, p2: b, winner, decided_by: decided ? 'played' : null };
            db.matches.push(match);
            if (decided) {
                db.results.push({ match_id: match.id, user_id: winner, started_at: 'x', finished_at: 'y', correct: 6 + (count % 5), points: 12, time_ms: 9000 });
                db.results.push({ match_id: match.id, user_id: winner === a ? b : a, started_at: 'x', finished_at: 'y', correct: 1 + (count % 5), points: 4, time_ms: 11000 });
                next.push(winner);
                losers.push(winner === a ? b : a);
            } else next.push(null);
        }
        if (decided && round < rounds - 1) losers.forEach(id => Object.assign(entryOf(id), { status: 'out', place: (size >> round) + 1 }));
        if (decided && round === rounds - 1) {
            const third = { id: uuid(1000 + count++), tournament_id: T_RUN, round: rounds, slot: 1, third: true, p1: losers[0], p2: losers[1], winner: finished ? losers[0] : null, decided_by: finished ? 'played' : null };
            db.matches.push(third);
            if (finished) db.results.push({ match_id: third.id, user_id: losers[0], started_at: 'x', finished_at: 'y', correct: 7, points: 12, time_ms: 9000 }, { match_id: third.id, user_id: losers[1], started_at: 'x', finished_at: 'y', correct: 5, points: 8, time_ms: 9000 });
        }
        alive = next;
    }
    if (finished) {
        const final = db.matches.find(match => match.round === rounds && !match.third);
        const bronze = db.matches.find(match => match.third);
        const other = (match) => match.winner === match.p1 ? match.p2 : match.p1;
        [[final.winner, 1], [other(final), 2], [bronze.winner, 3], [other(bronze), 4]].forEach(([id, place]) => { entryOf(id).place = place; });
    }
    return ids;
};

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        // Sběr chyb z provozu (monitor.js) posílá s veřejným klíčem, bez přihlášení
        if (url.pathname === '/rest/v1/client_errors') { db.errorsSent.push(...JSON.parse(request.postData() || '[]')); return route.fulfill({ status: 201, body: '' }); }
        if (!me) return json({ message: 'no token' }, 401);
        const param = (key) => url.searchParams.get(key) || '';
        const eq = (key) => param(key).replace(/^eq\./, '');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        const tournament = (id) => db.tournaments.find(item => item.id === id);
        const matchRow = (id) => db.matches.find(item => item.id === id);
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        if (rpc && rpc[1] === 'schema_version' && db.schema !== undefined) return db.schema === null ? json({ code: 'PGRST202', message: 'Could not find the function' }, 404) : json(db.schema);
        if (rpc && rpc[1] === 'dev_is_admin') return json(db.admin);
        if (rpc && /^dev_tournament_/.test(rpc[1])) {
            db.calls.push({ name: rpc[1], body });
            if (db.devDenied) return json({ code: '42501', message: 'Vývojářské nástroje turnajů nejsou pro tento účet zapnuté (viz docs/SUPABASE.md, dev_admins).' }, 403);
            return json(rpc[1] === 'dev_tournament_add_bots' ? 31 : rpc[1] === 'dev_tournament_clear_bots' ? 31 : rpc[1] === 'dev_tournament_reset' ? 2 : null);
        }
        // XP za výhry jednou za účet (jako claim_tournament_xp): zapíše nevyplacené výhry a vrátí je; se stejným klíčem vrátí i dřív zapsané.
        // claimLost = kolikrát se odpověď „ztratí“ (zápis proběhne, klient dostane chybu)
        if (rpc && rpc[1] === 'claim_tournament_xp') {
            if (db.missing || db.claimMissing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
            db.calls.push({ name: rpc[1], body });
            const key = body && body.retry_key;
            const again = db.claims.filter(claim => claim.user_id === me.id && key && claim.retry_key === key);
            const fresh = db.matches.filter(m => m.winner === me.id && m.decided_by && m.decided_by !== 'earlier' && !db.claims.some(claim => claim.match_id === m.id));
            fresh.forEach(m => db.claims.push({ match_id: m.id, user_id: me.id, round: m.round, retry_key: key || null }));
            if (db.claimLost > 0) { db.claimLost -= 1; return json({ message: 'boom' }, 503); }
            return json([...again, ...fresh.map(m => ({ match_id: m.id, round: m.round }))].map(claim => ({ id: claim.match_id, round: claim.round })));
        }
        if (rpc && /^(tournament_|my_tournament)/.test(rpc[1])) {
            if (db.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
            db.calls.push({ name: rpc[1], body });
            const fail = (message, status = 400) => json({ code: 'P0001', message }, status);
            if (rpc[1] === 'tournament_tick') return route.fulfill({ status: 200, body: '' });
            if (rpc[1] === 'tournament_join') {
                if (db.failJoin) return db.failJoin === 500 ? json({ message: 'boom' }, 500) : fail(db.failJoin);
                const t = tournament(body.tid);
                if (!t || t.status !== 'open') return fail('Přihlášky do tohoto turnaje jsou zavřené.');
                if (db.entries.filter(entry => entry.tournament_id === t.id).length >= t.capacity) return fail('Turnaj je plný.');
                if (!db.entries.some(entry => entry.tournament_id === t.id && entry.user_id === me.id)) addEntry(db, t.id, me.id);
                return route.fulfill({ status: 200, body: '' });
            }
            if (rpc[1] === 'tournament_leave') {
                db.entries = db.entries.filter(entry => !(entry.tournament_id === body.tid && entry.user_id === me.id));
                return route.fulfill({ status: 200, body: '' });
            }
            if (rpc[1] === 'tournament_start_match') {
                if (db.failStart) return fail(db.failStart);
                const m = matchRow(body.mid);
                if (!m || ![m.p1, m.p2].includes(me.id)) return fail('Tohle není tvůj zápas.', 403);
                if (db.results.some(row => row.match_id === m.id && row.user_id === me.id)) return fail('Kolo jsi už začal.');
                db.results.push({ match_id: m.id, user_id: me.id, started_at: new Date().toISOString(), finished_at: null, correct: null, points: null, time_ms: null });
                return route.fulfill({ status: 200, body: '' });
            }
            // Odpověď v zápase (jako tournament_answer_save): jen po začátku, před koncem, jen další v pořadí, stejná znovu nic nemění
            if (rpc[1] === 'tournament_answer_save') {
                if (db.answersMissing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                const own = db.results.find(row => row.match_id === body.mid && row.user_id === me.id);
                if (!own) return fail('Zápas jsi ještě nezačal.');
                if (own.finished_at) return fail('Zápas už je dohraný.');
                const mine = db.answers.filter(row => row.match_id === body.mid && row.user_id === me.id);
                const prev = mine.find(row => row.idx === body.idx);
                if (prev) return prev.correct === body.correct && prev.points === body.points ? json(mine.length) : fail('Odpověď na tuhle otázku už je uložená, přepsat ji nejde.');
                if (body.idx !== mine.length) return fail('Nejdřív se musí uložit předchozí otázky.');
                db.answers.push({ match_id: body.mid, user_id: me.id, idx: body.idx, correct: body.correct, points: body.points, answer: body.answer ?? null, hints: body.hints ?? null, ms: body.ms ?? null });
                return json(mine.length + 1);
            }
            // Rozpis zápasu (jako tournament_details): jen hráč zápasu, až ho sám dohraje; soupeřovy odpovědi po jeho dohrání nebo rozhodnutí
            if (rpc[1] === 'tournament_details') {
                const m = matchRow(body.mid);
                if (!m || ![m.p1, m.p2].includes(me.id)) return fail('Tohle není tvůj zápas.', 403);
                const done = (uid) => db.results.some(row => row.match_id === m.id && row.user_id === uid && row.finished_at);
                if (!done(me.id)) return fail('Rozpis otázek uvidíš, až zápas dohraješ.', 403);
                const rival = m.p1 === me.id ? m.p2 : m.p1;
                return json(db.answers.filter(row => row.match_id === m.id && (row.user_id === me.id || (row.user_id === rival && (m.winner || done(rival))))).map(({ match_id, ...rest }) => rest));
            }
            if (rpc[1] === 'tournament_finish_match') {
                const own = db.results.find(row => row.match_id === body.mid && row.user_id === me.id);
                if (!own || own.finished_at) return fail('Výsledek jde zapsat jen jednou.');
                // výsledek spočítá server z odpovědí (starší databáze bere čísla od klienta)
                const answered = db.answers.filter(row => row.match_id === body.mid && row.user_id === me.id);
                if (!db.answersMissing && answered.length < 10) return fail('Zápas ještě není dohraný: nejdřív se musí uložit všechny odpovědi.');
                const correct = db.answersMissing ? body.correct_count : answered.filter(row => row.correct).length;
                const points = db.answersMissing ? body.point_count : answered.reduce((sum, row) => sum + row.points, 0);
                Object.assign(own, { finished_at: new Date().toISOString(), correct, points, time_ms: db.myTimeMs });
                const m = matchRow(body.mid);
                const other = db.results.find(row => row.match_id === m.id && row.user_id !== me.id && row.finished_at);
                if (other) {
                    // víc správných, víc bodů, rychlejší čas (jako tournament_pick_winner)
                    const mineWins = own.correct !== other.correct ? own.correct > other.correct : own.points !== other.points ? own.points > other.points : own.time_ms < other.time_ms;
                    m.winner = mineWins ? me.id : other.user_id;
                    m.decided_by = 'played';
                    const loser = db.entries.find(entry => entry.tournament_id === m.tournament_id && entry.user_id === (mineWins ? other.user_id : me.id));
                    loser.status = 'out';
                    loser.place = 5;
                    db.stats = mineWins ? { best: 2, wins: 1, played: 1 } : { best: 2, wins: 0, played: 1 };
                }
                return route.fulfill({ status: 200, body: '' });
            }
            if (rpc[1] === 'my_tournament_stats') return json([db.stats]);
            if (rpc[1] === 'tournament_notices_seen') {
                db.notices.forEach(notice => { if (body.ids.includes(notice.id)) notice.seen = true; });
                return route.fulfill({ status: 200, body: '' });
            }
            return json({}, 404);
        }
        if (/^\/rest\/v1\/tournament/.test(url.pathname)) {
            if (db.missing) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
            db.gets.push(`${url.pathname.split('/').pop()}?${url.search}`);
            if (url.pathname === '/rest/v1/tournaments') {
                const allowed = param('status').replace(/^in\.\(|\)$/g, '').split(',');
                return json(db.tournaments.filter(item => allowed.includes(item.status)).sort((a, b) => b.week_start.localeCompare(a.week_start)));
            }
            if (url.pathname === '/rest/v1/tournament_entries') {
                const rows = db.entries.filter(entry => entry.tournament_id === eq('tournament_id') && (!eq('user_id') || entry.user_id === eq('user_id'))).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
                return json(rows.map(entry => ({ user_id: entry.user_id, joined_at: entry.joined_at, status: entry.status, place: entry.place, player: profile(entry.user_id) })));
            }
            if (url.pathname === '/rest/v1/tournament_matches') {
                const rows = db.matches.filter(item => item.tournament_id === eq('tournament_id')).sort((a, b) => a.round - b.round || a.slot - b.slot);
                // pravidla řádků: cizí výsledek je vidět až po rozhodnutí zápasu
                return json(rows.map(item => ({ ...item, results: db.results.filter(row => row.match_id === item.id && (row.user_id === me.id || item.winner)).map(({ match_id, ...rest }) => rest) })));
            }
            if (url.pathname === '/rest/v1/tournament_notices') return json(db.notices.filter(notice => notice.user_id === me.id && !notice.seen));
            if (url.pathname === '/rest/v1/tournament_answers') {
                if (db.answersMissing) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
                return json(db.answers.filter(row => row.match_id === eq('match_id') && row.user_id === me.id).sort((a, b) => a.idx - b.idx).map(({ idx, correct, points }) => ({ idx, correct, points })));
            }
            return json([]);
        }
        if (url.pathname === '/rest/v1/rpc/weekly_leaderboard') return json([]);
        if (url.pathname === '/rest/v1/rating_history') return json([]);
        if (url.pathname === '/rest/v1/profiles') {
            if (request.method() === 'PATCH') { db.patches.push(body); return route.fulfill({ status: 204, body: '' }); }
            return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        }
        if (url.pathname === '/rest/v1/challenges' || url.pathname === '/rest/v1/challenge_results') return json([]);
        return json({});
    });
};

const setup = async (browser, storage, { viewport = { width: 400, height: 800 }, colorScheme = 'light', now = `${MON}T10:00:00Z` } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, deviceScaleFactor: SHOTS ? 2 : 1 });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route(`${ORIGIN}/**`, route => route.fulfill(serveFile(new URL(route.request().url()).pathname)));
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN || url.hostname === 'proj.supabase.co') return route.fallback();
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname)) return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    await tab.clock.setFixedTime(new Date(now));
    return { context, tab, log };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && (content.textContent.includes('Dnešní otázky') || content.querySelector('#home-tabs'))); }, null, { timeout: 30000 });
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const progressOf = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress') || '{}'));
// Žádné vodorovné posouvání stránky ani obsahu
const noHorizontalScroll = (tab) => tab.evaluate(() => {
    const content = document.getElementById('app-content');
    const overlay = document.querySelector('#dialog-overlay > div');
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: content.scrollWidth - content.clientWidth, dialog: overlay ? overlay.scrollWidth - overlay.clientWidth : 0 };
});
const playMatch = async (tab, questions = 10, beforeLast = null) => {
    await tab.waitForSelector('[data-action="give-up"]');
    for (let i = 0; i < questions; i++) {
        await tab.click('[data-action="give-up"]');
        await tab.waitForSelector('h1');
        if (i === questions - 1 && beforeLast) await beforeLast();
        await tab.click('[data-action="next"]');
        if (i < questions - 1) await tab.waitForSelector('[data-action="give-up"]');
    }
};

test('týdenní turnaje', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, options = {}, storage = login('tok-u1')) => {
        const page = await setup(browser, storage, options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await waitForHome(page.tab);
        return page;
    };

    await t.test('přihlášky: naplnění, přihlášení a odhlášení, plno, chyba serveru', async () => {
        const db = newDb({ today: '2026-11-11' });
        openTournament(db, 87);
        const { context, tab, log } = await start(db, { now: '2026-11-11T10:00:00Z' });
        await tab.waitForSelector('#tournament-card');
        const card = (await tab.textContent('#tournament-card')).replace(/\s+/g, ' ');
        assert.match(card, /Týdenní turnaj/);
        assert.match(card, /Přihlášky otevřené/);
        assert.match(card, /Začíná pondělí 16\. 11\./);
        assert.equal((await tab.textContent('[data-tournament-count]')).trim(), '87/128');
        assert.equal(await tab.getAttribute('#tournament-card [role="progressbar"]', 'aria-valuenow'), '68');
        assert.ok(db.calls.some(call => call.name === 'tournament_tick'), 'aplikace při otevření zavolá tick');
        assert.equal(await tab.locator('[data-action="tournament-join"]').count(), 1);
        assert.equal(await tab.locator('[data-action="tournament-leave"]').count(), 0);
        await shot(tab, 'turnaj-prihlasky');

        await tab.click('[data-action="tournament-join"]');
        await tab.waitForFunction(() => document.querySelector('[data-tournament-count]').textContent.trim() === '88/128');
        assert.equal(db.entries.filter(entry => entry.tournament_id === T_OPEN && entry.user_id === 'u-1').length, 1);
        assert.match(await tab.textContent('#tournament-card'), /Jsi přihlášen/);
        assert.equal(await tab.locator('[data-action="tournament-leave"]').count(), 1);
        assert.equal(await tab.locator('[data-action="tournament-join"]').count(), 0);

        // Okno s přihlášenými hráči, já jsem mezi nimi
        await tab.click('[data-action="tournament-open"][data-tid]');
        await tab.click('#dialog-overlay details summary');
        await tab.waitForSelector('#tournament-entries');
        assert.equal(await tab.locator('#tournament-entries li').count(), 88);
        assert.match(await tab.textContent('#tournament-entries'), /Jana Nováková \(ty\)/);
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));

        await tab.click('[data-action="tournament-leave"]');
        await tab.waitForFunction(() => document.querySelector('[data-tournament-count]').textContent.trim() === '87/128');
        assert.equal(db.entries.some(entry => entry.user_id === 'u-1'), false);

        // Server mezitím turnaj naplnil: hláška serveru se ukáže, nic se nerozbije
        db.failJoin = 'Turnaj je plný.';
        await tab.click('[data-action="tournament-join"]');
        await tab.waitForFunction(() => /Turnaj je plný\./.test(document.getElementById('toast') ? document.getElementById('toast').textContent : ''));
        assert.equal(await tab.locator('[data-action="tournament-join"]').count(), 1);
        // Chyba serveru (500) se přeloží do srozumitelné hlášky
        db.failJoin = 500;
        await tab.click('[data-action="tournament-join"]');
        await tab.waitForFunction(() => /Přihlášení se nepodařilo/.test(document.getElementById('toast').textContent));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('plný turnaj: bez tlačítka Přihlásit se, přihlášený se odhlásit smí', async () => {
        const db = newDb({ today: '2026-11-11' });
        openTournament(db, 8, { capacity: 8 });
        const { context, tab, log } = await start(db, { now: '2026-11-11T10:00:00Z' });
        await tab.waitForSelector('#tournament-card');
        assert.equal((await tab.textContent('[data-tournament-count]')).trim(), '8/8');
        assert.equal(await tab.locator('[data-action="tournament-join"]').count(), 0);
        assert.match(await tab.textContent('#tournament-card'), /Plno/);
        assert.deepEqual(log.errors, []);
        await context.close();
        // Posledního zbývajícího místa se hráč dočká: 7/8 → přihlášení naplní kapacitu
        const second = newDb({ today: '2026-11-11' });
        openTournament(second, 7, { capacity: 8 });
        const page = await start(second, { now: '2026-11-11T10:00:00Z' });
        await page.tab.click('[data-action="tournament-join"]');
        await page.tab.waitForFunction(() => document.querySelector('[data-tournament-count]').textContent.trim() === '8/8');
        assert.equal(await page.tab.locator('[data-action="tournament-leave"]').count(), 1);
        await page.context.close();
    });

    await t.test('pozvánka: každé druhé spuštění malé okno na záložce Více hráčů, přihlášení z něj', async () => {
        const db = newDb({ today: '2026-11-11' });
        openTournament(db, 40);
        // Sudé spuštění (uložené jedno předchozí): okno vyskočí po přepnutí na Více hráčů
        const { context, tab, log } = await start(db, { now: '2026-11-11T10:00:00Z' }, { ...login('tok-u1'), 'mudrlant.homeTab': JSON.stringify('single'), 'mudrlant.tourPromo': JSON.stringify({ launches: 1, day: '2026-11-11', bulbs: 0 }) });
        assert.equal(await tab.locator('#tournament-offer').count(), 0, 'v singlu okno nevyskočí');
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('#tournament-offer');
        assert.match(await tab.textContent('#tournament-offer'), /Přihlášky do týdenního turnaje jsou otevřené/);
        assert.match(await tab.textContent('#tournament-offer'), /pondělí 16\. 11\./);
        assert.equal(await tab.evaluate(() => document.querySelector('#dialog-overlay > div').classList.contains('offer-panel')), true, 'okno svítí');
        assert.match(await tab.evaluate(() => getComputedStyle(document.querySelector('#dialog-overlay > div')).boxShadow), /rgb\(52, 211, 153\)|rgba\(52, 211, 153/, 'zelená záře');
        await tab.click('#tournament-offer [data-close]');
        await tab.waitForFunction(() => !document.getElementById('tournament-offer'));
        // Po zavření se ve stejném spuštění už nevrací
        await tab.click('[data-action="home-tab"][data-tab="single"]');
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForTimeout(600);
        assert.equal(await tab.locator('#tournament-offer').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();

        // Z okna jde rovnou přihlásit
        const joinDb = newDb({ today: '2026-11-11' });
        openTournament(joinDb, 40);
        const second = await start(joinDb, { now: '2026-11-11T10:00:00Z' }, { ...login('tok-u1'), 'mudrlant.homeTab': JSON.stringify('multi'), 'mudrlant.tourPromo': JSON.stringify({ launches: 3, day: '2026-11-11', bulbs: 2 }) });
        await second.tab.waitForSelector('#tournament-offer');
        await second.tab.click('[data-offer-join]');
        await second.tab.waitForFunction(() => /Jsi přihlášen/.test(document.getElementById('tournament-card') ? document.getElementById('tournament-card').textContent : ''));
        assert.equal(joinDb.entries.filter(entry => entry.tournament_id === T_OPEN && entry.user_id === 'u-1').length, 1);
        assert.deepEqual(second.log.errors, []);
        await second.context.close();

        // Liché spuštění: okno nevyskočí; přihlášený hráč ho nedostane nikdy
        const odd = await start(db, { now: '2026-11-11T10:00:00Z' }, { ...login('tok-u1'), 'mudrlant.homeTab': JSON.stringify('multi'), 'mudrlant.tourPromo': JSON.stringify({ launches: 0, day: '2026-11-11', bulbs: 0 }) });
        await odd.tab.waitForSelector('#tournament-card');
        await odd.tab.waitForTimeout(600);
        assert.equal(await odd.tab.locator('#tournament-offer').count(), 0);
        await odd.context.close();
        const mineDb = newDb({ today: '2026-11-11' });
        openTournament(mineDb, 40, { mine: true });
        const mine = await start(mineDb, { now: '2026-11-11T10:00:00Z' }, { ...login('tok-u1'), 'mudrlant.homeTab': JSON.stringify('multi'), 'mudrlant.tourPromo': JSON.stringify({ launches: 1, day: '2026-11-11', bulbs: 0 }) });
        await mine.tab.waitForSelector('#tournament-card');
        await mine.tab.waitForTimeout(600);
        assert.equal(await mine.tab.locator('#tournament-offer').count(), 0, 'přihlášený okno nedostane');
        assert.equal(await mine.tab.locator('#fact-hint:not(.hidden)').count(), 0, 'ani žárovku');
        await mine.context.close();
    });

    await t.test('žárovka u sovy zve do turnaje i v singlu, nejvýš ve dvou spuštěních za den', async () => {
        const db = newDb({ today: '2026-11-11' });
        openTournament(db, 40);
        const single = { ...login('tok-u1'), 'mudrlant.homeTab': JSON.stringify('single') };
        const first = await start(db, { now: '2026-11-11T10:00:00Z' }, { ...single, 'mudrlant.tourPromo': JSON.stringify({ launches: 0, day: '2026-11-11', bulbs: 0 }) });
        await first.tab.waitForSelector('#fact-hint:not(.hidden)');
        assert.match(await first.tab.getAttribute('#fact-hint', 'aria-label'), /Týdenní turnaj/);
        await first.tab.click('#fact-hint');
        await first.tab.waitForSelector('#tournament-offer');
        await first.tab.click('#tournament-offer [data-close]');
        await first.tab.waitForFunction(() => !document.getElementById('tournament-offer'));
        assert.equal(await first.tab.locator('#fact-hint:not(.hidden)').count(), 0, 'po klepnutí žárovka zmizí');
        assert.equal(JSON.parse(await first.tab.evaluate(() => localStorage.getItem('mudrlant.tourPromo'))).bulbs, 1);
        assert.deepEqual(first.log.errors, []);
        await first.context.close();
        // Druhé spuštění ten den ještě ano, třetí už ne
        const second = await start(db, { now: '2026-11-11T12:00:00Z' }, { ...single, 'mudrlant.tourPromo': JSON.stringify({ launches: 2, day: '2026-11-11', bulbs: 1 }) });
        await second.tab.waitForSelector('#fact-hint:not(.hidden)');
        await second.context.close();
        const third = await start(db, { now: '2026-11-11T14:00:00Z' }, { ...single, 'mudrlant.tourPromo': JSON.stringify({ launches: 4, day: '2026-11-11', bulbs: 2 }) });
        await third.tab.waitForSelector('#challenges-section, #app-content');
        await third.tab.waitForTimeout(800);
        assert.equal(await third.tab.locator('#fact-hint:not(.hidden)').count(), 0);
        await third.context.close();
        // Nový den: počítadlo se nuluje
        const nextDay = await start(db, { now: '2026-11-12T10:00:00Z' }, { ...single, 'mudrlant.tourPromo': JSON.stringify({ launches: 5, day: '2026-11-11', bulbs: 2 }) });
        await nextDay.tab.waitForSelector('#fact-hint:not(.hidden)');
        await nextDay.context.close();
    });

    await t.test('vývojářský režim: nástroje turnaje volají databázi (boti, spustit hned, další kolo, smazat) a hlásí chybu bez dev_admins', async () => {
        const db = newDb({ today: '2026-11-11' });
        openTournament(db, 3);
        const { context, tab, log } = await start(db, { now: '2026-11-11T10:00:00Z' }, { ...login('tok-u1'), 'mudrlant.dev': '1' });
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-dev="tour-bots"]');
        const toast = () => tab.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
        await tab.click('[data-dev="tour-bots"]');
        await tab.waitForFunction(() => /Přidáno botů: 31/.test((document.getElementById('toast') || {}).textContent || ''));
        const add = db.calls.find(call => call.name === 'dev_tournament_add_bots');
        assert.deepEqual(add.body, { tid: T_OPEN, how_many: 31 });
        await tab.click('[data-dev="tour-start"]');
        await tab.waitForFunction(() => /boti odehráli 1\. kolo/.test((document.getElementById('toast') || {}).textContent || ''));
        assert.deepEqual(db.calls.find(call => call.name === 'dev_tournament_start_now').body, { tid: T_OPEN });
        // „Další kolo“ potřebuje běžící turnaj: bez něj hláška
        await tab.click('[data-dev="tour-next"]');
        await tab.waitForFunction(() => /Žádný turnaj neběží/.test((document.getElementById('toast') || {}).textContent || ''));
        db.tournaments.push({ id: T_RUN, topic: 'mix', week_start: MON, started_on: MON, capacity: 128, status: 'running', size: 8, rounds: 3, seed: 'seed-abc' });
        await tab.click('[data-dev="tour-next"]');
        await tab.waitForFunction(() => /Posun o kolo/.test((document.getElementById('toast') || {}).textContent || ''));
        assert.deepEqual(db.calls.find(call => call.name === 'dev_tournament_next_round').body, { tid: T_RUN });
        await tab.click('[data-dev="tour-reset"]');
        await tab.waitForFunction(() => /Smazáno turnajů: 2, přihlášky jsou znovu otevřené/.test((document.getElementById('toast') || {}).textContent || ''));
        assert.ok(db.calls.some(call => call.name === 'dev_tournament_reset'));
        await tab.click('[data-dev="tour-clear"]');
        await tab.waitForFunction(() => /Smazáno botů: 31/.test((document.getElementById('toast') || {}).textContent || ''));
        // Účet bez zápisu v dev_admins
        db.devDenied = true;
        await tab.click('[data-dev="tour-bots"]');
        await tab.waitForFunction(() => /dev_admins/.test((document.getElementById('toast') || {}).textContent || ''));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('běžící turnaj: karta, Hrát, hra do výsledku (výhra, postup, XP, odznaky), bez prozrazení soupeře', async () => {
        const db = newDb();
        runningEight(db, { opponentResult: { correct: 0, points: 0, time_ms: 3600000 } });
        openTournament(db, 87);
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('#tournament-card [data-action="tournament-play"]');
        const rows = await tab.locator('#tournament-card [data-tournament-row]').count();
        assert.equal(rows, 2, 'běžící turnaj a vedle něj otevřený');
        const card = (await tab.textContent('#tournament-card')).replace(/\s+/g, ' ');
        assert.match(card, /Běží · Čtvrtfinále/);
        assert.match(card, /Dnes hraješ proti .*Petr Svoboda/);
        assert.match(card, /Přihlášky otevřené/);
        assert.match(card, /87\/128/);
        assert.ok(await tab.evaluate(() => document.getElementById('tournament-card').getBoundingClientRect().height) < 190, 'karta je kompaktní');
        await shot(tab, 'turnaj-karta-bezi');

        // Hra: server zapíše začátek, pak jde 10 otázek z výběru; soupeřův výsledek se v průběhu nenačítá
        const getsBefore = db.gets.length;
        await tab.click('[data-action="tournament-play"]');
        await tab.waitForSelector('[data-action="give-up"]');
        assert.ok(db.results.some(row => row.match_id === uuid(101) && row.user_id === 'u-1' && !row.finished_at), 'server zná začátek zápasu');
        assert.ok(db.calls.findIndex(call => call.name === 'tournament_start_match') >= 0);
        assert.match(await tab.textContent('#status-badge'), /Turnaj · 1\/10/);
        assert.equal(await tab.locator('[data-tour-timer]').count(), 1, 'u otázky turnaje běží čas');
        assert.match(await tab.textContent('[data-tour-timer]'), /^\d+:\d{2}$/);
        // Body ve hře: čip vlevo nahoře, štítek druhu otázky mezi ním a časem se nepřekrývá ani nezalomí
        assert.equal((await tab.textContent('[data-score-chip]')).trim(), '0 b');
        const header = await tab.evaluate(() => {
            const chip = document.querySelector('[data-score-chip]').getBoundingClientRect();
            const timer = document.querySelector('[data-tour-timer]').parentElement.getBoundingClientRect();
            const label = document.querySelector('[data-score-chip]').parentElement.querySelector(':scope > span.inline-flex:not(.absolute)').getBoundingClientRect();
            return { apart: chip.right <= label.left && label.right <= timer.left, oneLine: label.height < 24 };
        });
        assert.deepEqual(header, { apart: true, oneLine: true });
        assert.ok(await tab.locator('[data-action="choice"]').count() >= 2, 'varianta s výběrem z možností');
        assert.equal(await tab.locator('#answer-form').count(), 0);
        await shot(tab, 'turnaj-hra');
        let duringGame = [];
        await playMatch(tab, 10, async () => { duringGame = db.gets.slice(getsBefore); });
        await tab.waitForSelector('[data-tournament-outcome]');
        assert.deepEqual(duringGame, [], 'během hry se nečtou žádné údaje o turnaji (ani výsledek soupeře)');
        const finishCall = db.calls.find(call => call.name === 'tournament_finish_match');
        assert.deepEqual(finishCall.body, { mid: uuid(101), correct_count: 0, point_count: 0 });
        assert.equal(db.calls.filter(call => call.name === 'tournament_start_match').length, 1);

        // Výsledek: stejný počet správných i bodů, vyhrál jsem rychlejším časem
        const outcome = (await tab.textContent('#app-content')).replace(/\s+/g, ' ');
        assert.match(outcome, /Vyhráváš!/);
        assert.match(outcome, /Postupuješ dál, další kolo hraješ zítra\./);
        assert.match(outcome, /\+20 XP za vyhraný zápas/);
        assert.match(outcome, /0\/10/);
        assert.equal(await tab.locator('[data-match][data-mine]').count(), 1);
        await shot(tab, 'turnaj-vysledek');
        // Rozpis otázek: zápas je rozhodnutý, moje odpovědi ze serveru (soupeřovy se tu neuložily)
        await tab.click('[data-action="tournament-breakdown"]');
        await tab.waitForSelector('#breakdown-list [data-bd-row]', { timeout: 30000 });
        assert.equal(await tab.locator('#breakdown-list [data-bd-row]').count(), 10);
        assert.equal(await tab.locator('#breakdown-list [data-bd-row="0"] [data-bd-cell]').count(), 2, 'oba hráči vedle sebe');
        assert.match((await tab.textContent('#dialog-overlay')).replace(/\s+/g, ' '), /Soupeřovy odpovědi po otázkách se u téhle hry neuložily/);
        assert.ok(db.calls.some(call => call.name === 'tournament_details' && call.body.mid === uuid(101)));
        await shot(tab, 'turnaj-rozpis');
        await tab.click('#dialog-overlay [data-close]');
        // XP za vyhraný zápas (jednou) a odznaky z počítadel (nejlepší umístění 2 = čtvrtfinále, 1 výhra)
        await tab.waitForFunction(() => (JSON.parse(localStorage.getItem('mudrlant.progress') || '{}').xp || 0) >= 20);
        const progress = await progressOf(tab);
        assert.equal(progress.xp, 20);
        assert.equal(progress.counters.tourBest, 2);
        assert.equal(progress.counters.tourWins, 1);
        assert.ok(Object.keys(progress.badges).some(id => id.startsWith('turnaj-ucast') || id.startsWith('turnaj-ctvrtfinale')), `odznak za turnaj: ${Object.keys(progress.badges)}`);
        assert.deepEqual(await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.tourXp'))), [uuid(101)]);
        await tab.waitForFunction(() => document.getElementById('celebration') !== null);

        // Zpět na turnaj: okno ukáže kola, můj zápas je zvýrazněný a Hrát už nejde
        await tab.click('[data-action="tournament-back"]');
        await tab.waitForSelector('#tournament-bracket');
        assert.equal(await tab.locator('#tournament-bracket [data-bcard]').count() > 0, true, 'výchozí pohled je pavouk');
        await tab.click('[data-t-mode="rounds"]');
        await tab.waitForSelector('#tournament-rounds');
        assert.equal(await tab.locator('#tournament-rounds [data-mine]').count(), 1);
        assert.equal(await tab.locator('[data-t-play]').count(), 0);
        assert.match((await tab.textContent('#tournament-status')).replace(/\s+/g, ' '), /Postoupil jsi, další kolo je zítra/);
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        assert.match(await tab.textContent('#tournament-card'), /Postoupil jsi/);
        // Znovu to nejde ani na serveru
        assert.equal(db.results.filter(row => row.match_id === uuid(101) && row.user_id === 'u-1').length, 1);
        // Vyplacené XP se při dalším načtení nepřipočte podruhé
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForSelector('#tournament-card');
        assert.equal((await progressOf(tab)).xp, 20);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('XP za vyhraný zápas jednou za účet: nové zařízení ho nepřipíše znovu, ztracená odpověď serveru se dožene jednou, starší databáze jako dřív', async () => {
        const until = async (check, what) => { const end = Date.now() + 15000; while (!check()) { if (Date.now() > end) throw new Error(`nedočkal jsem se: ${what}`); await new Promise(resolve => setTimeout(resolve, 50)); } };
        const paidList = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.tourXp') || '[]'));
        // první zařízení: server výhru vrátí jako nevyplacenou, XP se připíše
        const db = newDb();
        wonEight(db);
        let page = await start(db);
        await page.tab.waitForFunction(() => (JSON.parse(localStorage.getItem('mudrlant.progress') || '{}').xp || 0) >= 20);
        assert.equal((await progressOf(page.tab)).xp, 20);
        assert.deepEqual(db.claims.map(claim => claim.match_id), [uuid(101)]);
        assert.deepEqual(await paidList(page.tab), [uuid(101)]);
        await page.context.close();
        // nové zařízení (nebo smazaná data) se stejným účtem: server výhru už nevrátí, XP se nepřipíše znovu (odznaky z účtu ano)
        page = await start(db);
        await page.tab.waitForFunction(() => JSON.parse(localStorage.getItem('mudrlant.tourXp') || '[]').length === 1);
        await until(() => db.calls.filter(call => call.name === 'claim_tournament_xp').length >= 2, 'druhý claim');
        await page.tab.waitForTimeout(300);
        const fresh = await progressOf(page.tab);
        assert.equal(fresh.xp || 0, 0, 'XP za už vyplacený zápas se na novém zařízení nepřipíše');
        assert.equal((fresh.counters || {}).tourWins, 1);
        assert.deepEqual(page.log.errors, []);
        await page.context.close();

        // ztracená odpověď: server výhru zapíše jako vyplacenou, klient dostane chybu; další otevření se stejným klíčem ji dostane znovu a XP připíše jednou
        const lost = newDb();
        wonEight(lost);
        lost.claimLost = 1;
        page = await start(lost);
        await until(() => lost.claims.length === 1 && lost.calls.some(call => call.name === 'claim_tournament_xp'), 'claim');
        await page.tab.waitForTimeout(500);
        assert.equal((await progressOf(page.tab)).xp || 0, 0, 'bez odpovědi serveru se nic nepřipíše');
        const key = await page.tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.tourXpClaim'))['u-1']);
        assert.match(key, /^[0-9a-f]{24}$/, 'klíč pro opakování zůstal uložený');
        await page.tab.reload();
        await waitForHome(page.tab);
        await page.tab.waitForFunction(() => (JSON.parse(localStorage.getItem('mudrlant.progress') || '{}').xp || 0) >= 20);
        assert.equal(lost.calls.filter(call => call.name === 'claim_tournament_xp').at(-1).body.retry_key, key, 'opakuje se se stejným klíčem');
        await page.tab.reload();
        await waitForHome(page.tab);
        await until(() => lost.calls.filter(call => call.name === 'claim_tournament_xp').length >= 3, 'třetí claim');
        await page.tab.waitForTimeout(300);
        assert.equal((await progressOf(page.tab)).xp, 20, 'připsáno jen jednou');
        assert.deepEqual(await page.tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.tourXpClaim'))), {}, 'po připsání klíč zmizí');
        assert.deepEqual(page.log.errors, []);
        await page.context.close();

        // starší databáze bez claim_tournament_xp (404): vyplacené zápasy zná jen zařízení jako dřív
        const old = newDb();
        old.claimMissing = true;
        wonEight(old);
        page = await start(old);
        await page.tab.waitForFunction(() => (JSON.parse(localStorage.getItem('mudrlant.progress') || '{}').xp || 0) >= 20);
        await page.tab.reload();
        await waitForHome(page.tab);
        await page.tab.waitForSelector('#tournament-card');
        await page.tab.waitForTimeout(300);
        assert.equal((await progressOf(page.tab)).xp, 20, 'stejné zařízení nepřipíše podruhé');
        assert.deepEqual(page.log.errors, []);
        await page.context.close();
    });

    await t.test('zápas prohraju: výsledek soupeře se ukáže až po rozhodnutí a hráč vypadne', async () => {
        const db = newDb();
        runningEight(db, { opponentResult: { correct: 5, points: 9 } });
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('[data-action="tournament-play"]');
        await tab.click('[data-action="tournament-play"]');
        await playMatch(tab);
        await tab.waitForSelector('[data-tournament-outcome]');
        const outcome = (await tab.textContent('#app-content')).replace(/\s+/g, ' ');
        assert.match(outcome, /Tentokrát to nevyšlo/);
        assert.match(outcome, /Končíš na 5\.–8\. místo/);
        assert.match(outcome, /5\/10/, 'soupeřův výsledek je vidět až po rozhodnutí');
        assert.doesNotMatch(outcome, /XP za vyhraný/);
        assert.equal((await progressOf(tab)).xp || 0, 0);
        await tab.click('[data-action="challenge-home"]');
        await tab.waitForSelector('#tournament-card');
        assert.match(await tab.textContent('#tournament-card'), /Vypadl jsi: 5\.–8\. místo/);
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('soupeř ještě nehrál: čekám, jeho výsledek se nikde neukáže', async () => {
        const db = newDb();
        runningEight(db);
        const { context, tab, log } = await start(db);
        await tab.click('[data-action="tournament-play"]');
        await playMatch(tab);
        await tab.waitForSelector('[data-tournament-outcome]');
        const outcome = (await tab.textContent('#app-content')).replace(/\s+/g, ' ');
        assert.match(outcome, /Odehráno!/);
        assert.match(outcome, /Čekáš na soupeře/);
        assert.doesNotMatch(outcome, /Vyhráváš|nevyšlo/);
        await tab.click('[data-action="challenge-home"]');
        await tab.waitForSelector('#tournament-card');
        assert.match(await tab.textContent('#tournament-card'), /Odehráno 0\/10, čekáš na soupeře/);
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('rozehraný zápas: po zavření aplikace karta nabídne Pokračovat, hraje se od další otázky a výsledek jde na server jednou', async () => {
        const db = newDb();
        runningEight(db);
        const { context, tab, log } = await start(db);
        await tab.click('[data-action="tournament-play"]');
        // tři otázky zodpovězené, čtvrtá rozehraná
        await playMatch(tab, 3);
        await tab.waitForSelector('[data-action="give-up"]');
        assert.match(await tab.textContent('#status-badge'), /Turnaj · 4\/10/);
        const session = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')));
        assert.equal(session.challenge.tournament.mid, uuid(101), 'rozehraný zápas je v uložené relaci');
        assert.equal(session.challenge.results.filter(Boolean).length, 3);
        // Aplikace se zavře uprostřed zápasu
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForSelector('#tournament-card [data-action="tournament-resume"]');
        const card = (await tab.textContent('#tournament-card')).replace(/\s+/g, ' ');
        assert.match(card, /Zápas máš rozehraný/);
        assert.match(card, /Čas běží od začátku zápasu/);
        assert.doesNotMatch(card, /začal a nedokončil/);
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        assert.equal(await tab.locator('[data-action="challenge-resume"]').count(), 0, 'rozehraný zápas nenabízí tlačítko výzvy, jen karta turnaje');
        assert.equal(await tab.getAttribute('#tournament-card [data-tournament-row="running"]', 'data-step'), 'resume');
        await shot(tab, 'turnaj-pokracovat');
        // Okno turnaje nabízí Pokračovat také
        await tab.click('[data-action="tournament-open"][data-tid]');
        await tab.waitForSelector('#tournament-status');
        assert.equal((await tab.textContent('#tournament-status [data-t-play]')).trim(), 'Pokračovat');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));

        const startCalls = db.calls.filter(call => call.name === 'tournament_start_match').length;
        await tab.click('[data-action="tournament-resume"]');
        await tab.waitForSelector('[data-action="give-up"]');
        assert.match(await tab.textContent('#status-badge'), /Turnaj · 4\/10/, 'pokračuje se od čtvrté otázky');
        assert.match(await tab.textContent('#toast'), /Čas běží od začátku zápasu/);
        assert.equal(db.calls.filter(call => call.name === 'tournament_start_match').length, startCalls, 'začátek se serveru nehlásí znovu');
        await playMatch(tab, 7);
        await tab.waitForSelector('[data-tournament-outcome]');
        assert.equal(db.calls.filter(call => call.name === 'tournament_finish_match').length, 1, 'výsledek se odešle jednou');
        assert.deepEqual(db.calls.find(call => call.name === 'tournament_finish_match').body, { mid: uuid(101), correct_count: 0, point_count: 0 });
        assert.match((await tab.textContent('#app-content')).replace(/\s+/g, ' '), /Odehráno!/);
        // Dohraný zápas se už nenabízí k pokračování (uložená relace je hotová)
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForSelector('#tournament-card');
        assert.equal(await tab.locator('[data-action="tournament-resume"]').count(), 0);
        assert.match(await tab.textContent('#tournament-card'), /Odehráno 0\/10, čekáš na soupeře/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('rozehraný zápas bez uložené relace na jiném zařízení: pokračuje se odpověďmi ze serveru, výsledek je jejich součet', async () => {
        const db = newDb();
        runningEight(db, { myStarted: true });
        // na prvním zařízení zodpověděl tři otázky (dvě správně), pak smazal data / vzal jiný telefon
        db.answers.push({ match_id: uuid(101), user_id: 'u-1', idx: 0, correct: true, points: 4 }, { match_id: uuid(101), user_id: 'u-1', idx: 1, correct: false, points: 0 }, { match_id: uuid(101), user_id: 'u-1', idx: 2, correct: true, points: 3 });
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('#tournament-card [data-action="tournament-resume"]');
        const card = (await tab.textContent('#tournament-card')).replace(/\s+/g, ' ');
        assert.match(card, /Zápas máš rozehraný/);
        assert.doesNotMatch(card, /začal a nedokončil/);
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        await tab.click('[data-action="tournament-resume"]');
        await tab.waitForSelector('[data-action="give-up"]');
        assert.match(await tab.textContent('#status-badge'), /Turnaj · 4\/10/, 'pokračuje se první otázkou, kterou server nemá');
        assert.equal(db.calls.filter(call => call.name === 'tournament_start_match').length, 0, 'zápas se znovu nezačíná');
        await playMatch(tab, 7);
        await tab.waitForSelector('[data-tournament-outcome]');
        assert.deepEqual(db.answers.filter(row => row.user_id === 'u-1').map(row => row.idx), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'odpovědi jdou na server v pořadí, žádná dvakrát');
        const mine = db.results.find(row => row.match_id === uuid(101) && row.user_id === 'u-1');
        assert.deepEqual([mine.correct, mine.points], [2, 7], 'výsledek je součet odpovědí na serveru');
        assert.match((await tab.textContent('#app-content')).replace(/\s+/g, ' '), /2\/10/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('rozehraný zápas bez uložené relace (starší databáze bez odpovědí) a po půlnoci: pokračovat nejde', async () => {
        // Server začátek zná, zařízení relaci nemá a databáze odpovědi neeviduje: neodehráno, nejde hrát znovu
        const db = newDb();
        db.answersMissing = true;
        runningEight(db, { myStarted: true });
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('#tournament-card');
        assert.match((await tab.textContent('#tournament-card')).replace(/\s+/g, ' '), /Kolo jsi začal a nedokončil, počítá se jako neodehrané/);
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        assert.equal(await tab.locator('[data-action="tournament-resume"]').count(), 0);
        assert.equal(await tab.locator('[data-action="challenge-resume"]').count(), 0);
        assert.deepEqual(log.errors, []);
        await context.close();
        // Druhé zařízení: server zápas už zná, hláška serveru se ukáže a hra se nespustí
        const second = newDb();
        runningEight(second);
        const page = await start(second);
        await page.tab.waitForSelector('[data-action="tournament-play"]');
        second.failStart = 'Kolo jsi už začal.';
        await page.tab.click('[data-action="tournament-play"]');
        await page.tab.waitForFunction(() => /Kolo jsi už začal\./.test(document.getElementById('toast') ? document.getElementById('toast').textContent : ''));
        assert.equal(await page.tab.locator('[data-action="give-up"]').count(), 0);
        assert.deepEqual(page.log.errors, []);
        await page.context.close();
        // Uložená relace je z dneška, ale den kola už skončil: obnova se nenabízí
        const third = newDb();
        runningEight(third, { myStarted: true });
        const saved = { version: 8, mode: 'challenge', data: { topic: 'zemepis' }, round: { answered: true }, pool: { kind: 'mix' }, timestamp: Date.parse('2026-11-09T23:50:00Z'),
            challenge: { code: 'turnaj', topic: 'mix', seed: 'seed-abc-r1', count: 10, index: 2, results: [{ correct: true, points: 3 }, { correct: false, points: 0 }, { correct: true, points: 2 }], hard: false, categories: [], variant: 'choices', done: false, tournament: { tid: T_RUN, mid: uuid(101), round: 1, name: 'Čtvrtfinále' } } };
        const late = await start(third, { now: '2026-11-10T07:00:00Z' }, { ...login('tok-u1'), 'mudrlant.session': JSON.stringify(saved) });
        await late.tab.waitForSelector('#tournament-card');
        assert.equal(await late.tab.locator('[data-action="tournament-resume"]').count(), 0);
        assert.equal(await late.tab.locator('[data-action="challenge-resume"]').count(), 0);
        assert.match((await late.tab.textContent('#tournament-card')).replace(/\s+/g, ' '), /Čas na zápas vypršel/);
        assert.deepEqual(late.log.errors, []);
        await late.context.close();
    });

    await t.test('rozehraný zápas vyprší za běhu aplikace: Pokračovat ukáže přátelskou hlášku a zápas se nenabízí dál', async () => {
        const db = newDb();
        runningEight(db, { myStarted: true });
        const saved = { version: 8, mode: 'challenge', data: { topic: 'zemepis' }, round: { answered: true }, pool: { kind: 'mix' }, timestamp: Date.parse('2026-11-09T10:00:00Z'),
            challenge: { code: 'turnaj', topic: 'mix', seed: 'seed-abc-r1', count: 10, index: 2, results: [{ correct: true, points: 3 }, { correct: false, points: 0 }, { correct: true, points: 2 }], hard: false, categories: [], variant: 'choices', done: false, tournament: { tid: T_RUN, mid: uuid(101), round: 1, name: 'Čtvrtfinále' } } };
        const { context, tab, log } = await start(db, {}, { ...login('tok-u1'), 'mudrlant.session': JSON.stringify(saved) });
        await tab.waitForSelector('#tournament-card [data-action="tournament-resume"]');
        // Přes půlnoc zůstala karta otevřená; server den kola už zná jako skončený
        await tab.clock.setFixedTime(new Date('2026-11-10T07:00:00Z'));
        db.today = '2026-11-10';
        await tab.click('[data-action="tournament-resume"]');
        await tab.waitForFunction(() => /Tenhle zápas už vypršel/.test(document.getElementById('toast') ? document.getElementById('toast').textContent : ''));
        assert.equal(await tab.locator('[data-action="give-up"]').count(), 0);
        assert.equal(await tab.locator('[data-action="tournament-resume"]').count(), 0);
        assert.equal(db.calls.filter(call => call.name === 'tournament_finish_match').length, 0, 'prošlý zápas se na server neodesílá');
        assert.match((await tab.textContent('#tournament-card')).replace(/\s+/g, ' '), /Čas na zápas vypršel/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('verze schématu: aktuální nic neukáže, starší aplikace vyzve k aktualizaci, starší databáze se hlásí', async () => {
        const required = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'))[1]);
        // aktuální schéma
        let db = newDb();
        db.schema = required;
        let page = await start(db);
        await page.tab.waitForSelector('#tournament-card, #home-tabs');
        await page.tab.waitForTimeout(300);
        assert.equal(await page.tab.locator('#schema-notice').count(), 0);
        assert.deepEqual(page.log.errors, []);
        await page.context.close();
        // databáze je novější než aplikace
        db = newDb();
        db.schema = required + 1;
        page = await start(db);
        await page.tab.waitForSelector('#schema-notice[data-kind="client"]');
        assert.match((await page.tab.textContent('#schema-notice')).replace(/\s+/g, ' '), /Aktualizuj stránku/);
        assert.deepEqual(await noHorizontalScroll(page.tab), { page: 0, content: 0, dialog: 0 });
        await shot(page.tab, 'schema-aplikace-stara');
        await page.tab.click('#schema-notice [data-action="schema-close"]');
        assert.equal(await page.tab.locator('#schema-notice').count(), 0);
        assert.deepEqual(page.log.errors, []);
        assert.deepEqual(page.log.csp, []);
        await page.context.close();
        // databáze je starší než aplikace (funkce schema_version chybí): běžný hráč s tím nic nenadělá, proto nevidí nic; správce hlášku a návod
        db = newDb();
        db.schema = null;
        page = await start(db);
        await page.tab.waitForSelector('#tournament-card, #home-tabs');
        await page.tab.waitForTimeout(500);
        assert.equal(await page.tab.locator('#schema-notice').count(), 0, 'běžný hráč o staré databázi neví');
        assert.deepEqual(page.log.errors, []);
        await page.context.close();
        db = newDb();
        db.schema = required - 1 || 0;
        db.admin = true;
        page = await start(db);
        await page.tab.waitForSelector('#schema-notice[data-kind="database"]');
        await page.tab.click('#schema-notice [data-action="schema-close"]');
        await page.tab.click('#btn-settings');
        await page.tab.waitForSelector('#schema-banner');
        assert.match(await page.tab.textContent('#schema-banner'), /spusť znovu supabase\/schema\.sql/);
        assert.deepEqual(page.log.errors, []);
        await page.context.close();
    });

    await t.test('chyba v aplikaci se anonymně nahlásí do client_errors, jen jednou a bez parametrů adresy', async () => {
        const db = newDb();
        const { context, tab } = await start(db);
        // Zkušební hodiny stránky házejí chyby z časovačů mimo událost window error, proto se událost vyvolá přímo
        await tab.evaluate(() => { const boom = new TypeError('zkušební chyba'); for (let i = 0; i < 2; i++) window.dispatchEvent(new ErrorEvent('error', { error: boom, message: boom.message })); });
        // Odeslání dávky při skrytí stránky (zkušební hodiny stránky odložený časovač nespustí)
        await tab.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        const deadline = Date.now() + 8000;
        while (!db.errorsSent.length && Date.now() < deadline) await tab.waitForTimeout(100);
        assert.equal(db.errorsSent.length, 1, 'stejná chyba se hlásí jednou');
        const [row] = db.errorsSent;
        assert.match(row.message, /zkušební chyba/);
        assert.equal(row.kind, 'error');
        assert.doesNotMatch(row.url, /[?#]/);
        assert.deepEqual(Object.keys(row).sort(), ['app_version', 'happened_at', 'hash', 'kind', 'message', 'stack', 'url', 'user_agent']);
        assert.doesNotMatch(JSON.stringify(row), /tok-u1|u-1|Jana|example\.com/);
        await context.close();
    });

    await t.test('Chyby z provozu: panel správce ukáže seskupené chyby', async () => {
        const db = newDb();
        db.admin = true;
        const { context, tab } = await start(db, {}, { ...login('tok-u1'), 'mudrlant.dev': '1' });
        await context.route('https://proj.supabase.co/rest/v1/rpc/dev_client_errors', route => route.fulfill({ json: [
            { hash: 'aaaa1111', count: 3, last_at: '2026-11-09T09:00:00Z', kind: 'error', message: 'TypeError: x is undefined', stack: 'at f (app.js:1:1)', url: 'https://x.cz/app/', user_agent: 'UA', app_version: 'abc1234' },
            { hash: 'bbbb2222', count: 1, last_at: '2026-11-09T08:00:00Z', kind: 'rejection', message: '<img src=x onerror=alert(1)>', stack: null, url: null, user_agent: null, app_version: null }
        ] }));
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-dev="errors"]');
        await tab.click('[data-dev="errors"]');
        await tab.waitForSelector('#client-errors li');
        assert.equal(await tab.locator('#client-errors li').count(), 2);
        assert.match(await tab.textContent('#client-errors'), /3×/);
        assert.equal(await tab.locator('#client-errors img').count(), 0, 'text chyby se neinterpretuje jako HTML');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        await shot(tab, 'chyby-z-provozu');
        await context.close();
    });

    await t.test('kolo se dnes nehraje: karta ukáže, kdy hraju, a tlačítko Hrát chybí', async () => {
        const db = newDb();
        runningEight(db);
        // Další kolo (semifinále) vzniklo dřív a hraje se až zítra
        db.matches.push({ id: uuid(110), tournament_id: T_RUN, round: 2, slot: 1, third: false, p1: 'u-1', p2: 'f-3', winner: null, decided_by: null });
        db.matches.filter(item => item.round === 1).forEach(item => { item.winner = item.p1; item.decided_by = 'played'; });
        const { context, tab } = await start(db);
        await tab.waitForSelector('#tournament-card');
        const card = (await tab.textContent('#tournament-card')).replace(/\s+/g, ' ');
        assert.match(card, /Běží · Semifinále/);
        assert.match(card, /Další kolo hraješ zítra proti .+ 3/);
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        await context.close();
    });

    await t.test('dialog pavouka: kola, aktuální rozbalené, moje zápasy, hledání, konečné pořadí', async () => {
        const db = newDb({ today: '2026-11-10' });
        // Šestnáct hráčů: osmifinále hotové včetně výsledků, čtvrtfinále se dnes hraje
        db.tournaments.push({ id: T_RUN, topic: 'mix', week_start: MON, started_on: MON, capacity: 128, status: 'running', size: 16, rounds: 4, seed: 'seed-16' });
        const fillers = addPlayers(db, 14);
        ['u-1', 'u-2', ...fillers].forEach(user => addEntry(db, T_RUN, user, 'playing'));
        const players = ['u-1', 'u-2', ...fillers];
        players.forEach((user, i) => { if (i % 2 === 0) return; });
        for (let i = 0; i < 8; i++) {
            const m = { id: uuid(200 + i), tournament_id: T_RUN, round: 1, slot: i + 1, third: false, p1: players[2 * i], p2: players[2 * i + 1], winner: players[2 * i], decided_by: i === 3 ? 'walkover' : 'played' };
            db.matches.push(m);
            db.results.push({ match_id: m.id, user_id: m.p1, started_at: 'x', finished_at: 'y', correct: 8 - i, points: 12, time_ms: 10000 });
            if (i !== 3) db.results.push({ match_id: m.id, user_id: m.p2, started_at: 'x', finished_at: 'y', correct: 3, points: 5, time_ms: 11000 });
            db.entries.find(entry => entry.tournament_id === T_RUN && entry.user_id === m.p2).status = 'out';
            db.entries.find(entry => entry.tournament_id === T_RUN && entry.user_id === m.p2).place = 9;
        }
        [0, 1, 2, 3].forEach(i => db.matches.push({ id: uuid(300 + i), tournament_id: T_RUN, round: 2, slot: i + 1, third: false, p1: players[4 * i], p2: players[4 * i + 2], winner: null, decided_by: null }));
        const { context, tab, log } = await start(db, { now: '2026-11-10T10:00:00Z', viewport: { width: 360, height: 640 } });
        await tab.waitForSelector('#tournament-card');
        assert.match((await tab.textContent('#tournament-card')).replace(/\s+/g, ' '), /Běží · Čtvrtfinále/);
        await tab.click('#tournament-card [data-action="tournament-open"]');
        await tab.waitForSelector('#tournament-bracket');
        await tab.click('[data-t-mode="rounds"]');
        await tab.waitForSelector('#tournament-rounds');
        const rounds = await tab.locator('#tournament-rounds details[data-round]').evaluateAll(list => list.map(item => ({ key: item.dataset.round, open: item.open, name: item.querySelector('summary').innerText.replace(/\s+/g, ' ').trim() })));
        assert.deepEqual(rounds.map(round => round.key), ['2', '1']);
        assert.equal(rounds[0].open, true, 'aktuální kolo je rozbalené');
        assert.equal(rounds[1].open, true, 'poslední dohrané kolo je rozbalené, ať jsou vidět jeho výsledky');
        assert.match(rounds[0].name, /Čtvrtfinále dnes · 0\/4 rozhodnuto/);
        assert.match(rounds[1].name, /Osmifinále pondělí 9\. 11\. · 8\/8 rozhodnuto/);
        assert.equal(await tab.locator('#tournament-rounds li').count(), 12);
        assert.equal(await tab.locator('#tournament-rounds li[data-mine]').count(), 2, 'moje zápasy ve dvou kolech');
        assert.match((await tab.textContent('#tournament-status')).replace(/\s+/g, ' '), /Čtvrtfinále: Dnes hraješ proti/);
        await tab.click('#tournament-rounds details[data-round="1"] summary');
        const first = (await tab.textContent('#tournament-rounds li[data-match="' + uuid(200) + '"]')).replace(/\s+/g, ' ');
        assert.match(first, /Jana Nováková \(ty\)/);
        assert.match(first, /8\/10 · 12 b/);
        assert.match(first, /Petr Svoboda/);
        assert.match(await tab.textContent('#tournament-rounds li[data-match="' + uuid(203) + '"]'), /Kontumačně/);
        await shot(tab, 'turnaj-dialog-360');
        // Hledání hráče rozbalí kola a schová ostatní zápasy
        await tab.fill('#tournament-search', 'petr');
        assert.equal(await tab.locator('#tournament-rounds li:not(.hidden)').count(), 1);
        await tab.fill('#tournament-search', 'zzz');
        assert.equal(await tab.locator('#tournament-rounds li:not(.hidden)').count(), 0);
        assert.equal(await tab.locator('#tournament-empty:not(.hidden)').count(), 1);
        await tab.fill('#tournament-search', '');
        assert.equal(await tab.locator('#tournament-rounds li:not(.hidden)').count(), 12);
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });

        // Jak to funguje a zpět
        await tab.click('[data-t-help]');
        await tab.waitForSelector('#tournament-rules');
        const rules = await tab.textContent('#tournament-rules');
        assert.match(rules, /v pondělí/);
        assert.match(rules, /mocnina dvou/);
        assert.match(rules, /kontumačně/);
        assert.match(rules, /zápas o 3\. místo|o 3\. místo/);
        await tab.click('[data-t-back]');
        await tab.waitForSelector('#tournament-rounds');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();

        // Skončený turnaj: konečné pořadí 1.–4.
        const done = newDb({ today: '2026-11-13' });
        done.tournaments.push({ id: T_RUN, topic: 'mix', week_start: MON, started_on: MON, capacity: 128, status: 'finished', size: 8, rounds: 3, seed: 's' });
        const others = addPlayers(done, 6);
        ['u-1', 'u-2', ...others].forEach(user => addEntry(done, T_RUN, user, 'finished'));
        const places = { 'u-2': 1, 'f-1': 2, 'u-1': 3, 'f-2': 4 };
        done.entries.forEach(entry => { entry.place = places[entry.user_id] || 6; });
        done.matches.push({ id: uuid(400), tournament_id: T_RUN, round: 3, slot: 1, third: false, p1: 'u-2', p2: 'f-1', winner: 'u-2', decided_by: 'played' });
        done.matches.push({ id: uuid(401), tournament_id: T_RUN, round: 3, slot: 1, third: true, p1: 'u-1', p2: 'f-2', winner: 'u-1', decided_by: 'played' });
        const page = await start(done, { now: '2026-11-13T10:00:00Z' });
        await page.tab.waitForSelector('#tournament-card');
        assert.match((await page.tab.textContent('#tournament-card')).replace(/\s+/g, ' '), /Poslední turnaj.*Skončil, 3\. místo/);
        await page.tab.click('#tournament-card [data-action="tournament-open"]');
        await page.tab.waitForSelector('#tournament-podium');
        const podium = (await page.tab.locator('#tournament-podium li').allTextContents()).map(text => text.replace(/\s+/g, ' ').trim());
        assert.equal(podium.length, 4);
        assert.match(podium[0], /^1\..*Petr Svoboda/);
        assert.match(podium[2], /^3\..*Jana Nováková \(ty\)/);
        await page.tab.click('[data-t-mode="rounds"]');
        const groups = await page.tab.locator('#tournament-rounds details[data-round]').evaluateAll(list => list.map(item => item.dataset.round));
        assert.deepEqual(groups, ['3t', '3']);
        assert.match(await page.tab.textContent('#tournament-rounds'), /O 3\. místo/);
        await shot(page.tab, 'turnaj-konec');
        assert.deepEqual(page.log.errors, []);
        await page.context.close();
    });

    await t.test('zprávy: jedno okno, označí se jako přečtené, oslava a odznaky za umístění', async () => {
        const db = newDb({ today: '2026-11-16' });
        db.stats = { best: 6, wins: 3, played: 1 };
        const base = { user_id: 'u-1', tournament_id: T_RUN, created_at: '2026-11-15T20:00:00Z', seen: false };
        db.notices.push({ ...base, id: 1, kind: 'excluded_full', detail: '8' });
        db.notices.push({ ...base, id: 2, kind: 'cancelled', detail: '5' });
        db.notices.push({ ...base, id: 3, kind: 'eliminated_noplay', detail: null });
        db.notices.push({ ...base, id: 4, kind: 'result', detail: '1' });
        db.notices.push({ ...base, id: 5, user_id: 'u-2', kind: 'result', detail: '3' });
        const { context, tab, log } = await start(db, { now: '2026-11-16T10:00:00Z' });
        await tab.waitForSelector('#tournament-notices');
        const items = (await tab.locator('#tournament-notices [data-notice]').allTextContents()).map(text => text.replace(/\s+/g, ' ').trim());
        assert.equal(items.length, 4, 'cizí zpráva se neukáže');
        assert.match(items[0], /Turnaj se hraje na pavouk.*8 hráčů.*tentokrát nehraješ/);
        assert.match(items[0], /Přihlas se do příštího turnaje/);
        assert.match(items[1], /jen 5 hráčů.*aspoň 8.*Přihlas se do dalšího turnaje/);
        assert.match(items[2], /neodehrál.*kontumačně/);
        assert.match(items[3], /Skončil jsi na 1\. místo/);
        await shot(tab, 'turnaj-zpravy');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        // Oslava vítěze (a odznaky) přijdou až po zavření okna se zprávami
        assert.equal(await tab.locator('#celebration').count(), 0);
        assert.deepEqual(Object.keys((await progressOf(tab)).badges || {}), []);
        await tab.click('#tournament-notices [data-close]');
        await tab.waitForFunction(() => document.getElementById('celebration') && /Vítěz turnaje/.test(document.getElementById('celebration').textContent), null, { timeout: 5000 });
        assert.deepEqual(db.notices.filter(notice => notice.user_id === 'u-1').map(notice => notice.seen), [true, true, true, true]);
        assert.equal(db.notices.find(notice => notice.id === 5).seen, false);
        assert.deepEqual(db.calls.find(call => call.name === 'tournament_notices_seen').body, { ids: [1, 2, 3, 4] });
        // Odznaky za turnaje se udělí z počítadel účtu a uloží do účtu
        await tab.waitForFunction(() => Object.keys((JSON.parse(localStorage.getItem('mudrlant.progress') || '{}').badges) || {}).some(id => id.startsWith('turnaj')));
        const progress = await progressOf(tab);
        assert.equal(progress.counters.tourBest, 6);
        assert.equal(progress.counters.tourWins, 3);
        // Po zavření a dalším otevření domů se zprávy neukazují znovu
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForTimeout(600);
        assert.equal(await tab.locator('#tournament-notices').count(), 0);
        assert.ok(db.patches.some(patch => (patch.badges || []).some(id => id.startsWith('turnaj'))), 'odznaky se uložily do účtu');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('starší databáze bez turnajů: karta se neukáže a nic nespadne', async () => {
        const db = newDb();
        db.missing = true;
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('[data-action="new-challenge"]');
        await tab.waitForTimeout(500);
        assert.equal(await tab.locator('#tournament-card').count(), 0);
        assert.equal(await tab.locator('#tournament-notices').count(), 0);
        assert.equal(await tab.locator('[data-action="tournament-help"]').count(), 0);
        // Přepnutí záložek a návrat domů dál funguje
        await tab.click('[data-action="home-tab"][data-tab="single"]');
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('[data-action="new-challenge"]');
        assert.equal(await tab.locator('#tournament-card').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    // Pavouk a celé pořadí ve velkých turnajích
    const openDialog = async (tab) => {
        await tab.waitForSelector('#tournament-card');
        await tab.click('#tournament-card [data-action="tournament-open"]');
        await tab.waitForSelector('#tournament-bracket [data-bcard]');
    };
    const columnsOf = (tab) => tab.locator('#bracket-scroll [data-bcol]').evaluateAll(list => list.map(item => item.dataset.bcol));
    const cardsIn = (tab, round) => tab.locator(`#bracket-scroll [data-bcol="${round}"] [data-bcard]`).count();
    const showBracket = (tab) => tab.evaluate(() => { document.getElementById('tournament-bracket').scrollIntoView({ block: 'start' }); });
    const rankingRows = (tab) => tab.locator('#tournament-ranking li[data-rank]').evaluateAll(list => list.map(item => item.dataset.names));
    const groupTitles = (tab) => tab.locator('#tournament-ranking section[data-rgroup] h3 > span:first-child').allTextContents();

    await t.test('pavouk 32 hráčů uprostřed: od osmifinále, celý pavouk, cesta hráče, celé pořadí', async () => {
        const db = newDb({ today: '2026-11-12' });
        const ids = bigTournament(db, { size: 32, done: 3 });
        const { context, tab, log } = await start(db, { now: '2026-11-12T10:00:00Z', viewport: { width: 360, height: 640 } });
        await tab.waitForSelector('#tournament-card');
        assert.match((await tab.textContent('#tournament-card')).replace(/\s+/g, ' '), /Běží · Semifinále/);
        await openDialog(tab);
        // Výchozí pohled: od osmifinále (zbývá 16 hráčů), pohár a vítěz vpravo
        assert.deepEqual(await columnsOf(tab), ['2', '3', '4', '5', 'cup']);
        assert.deepEqual([await cardsIn(tab, 2), await cardsIn(tab, 3), await cardsIn(tab, 4), await cardsIn(tab, 5)], [8, 4, 2, 2], 've finálovém sloupci i zápas o 3. místo');
        const heads = (await tab.locator('#bracket-scroll [data-bcol] > div:first-child').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim());
        assert.match(heads[0], /^Osmifinále út 10\. 11\. · 8 zápasů/);
        assert.match(heads[2], /^Semifinále běží · 2 zápasů/);
        assert.match(heads[3], /^Finále zítra$/);
        assert.match(heads[4], /^Vítěz/);
        assert.equal(await tab.locator('#tournament-bracket button[data-b-full]').getAttribute('aria-pressed'), 'false');
        // Karta má dva řádky: avatar, jméno, skóre x/10; vítěz s fajfkou, poražený ztlumený; nehraný zápas „—“
        const first = tab.locator('#bracket-scroll [data-bcell="2-1"] [data-bcard]');
        const text = (await first.innerText()).replace(/\s+/g, ' ');
        assert.match(text, /Jana Nováková \d\/10.*Adam 1 \d\/10/);
        assert.equal(await first.locator('svg path[d="M5 13l4 4L19 7"]').count(), 1, 'jedna fajfka u vítěze');
        assert.equal(await first.locator('button').count(), 2);
        const box = await first.boundingBox();
        assert.ok(box.height >= 38 && box.height <= 46, `kompaktní karta (${box.height})`);
        const semi = (await tab.locator('#bracket-scroll [data-bcell="4-1"] [data-bcard]').innerText()).replace(/\s+/g, ' ');
        assert.match(semi.trim(), /Jana Nováková — .+ —$/, 'zápas bez výsledku');
        // Moje větev: moje karty a ta, která na mě čeká; předvybraný posun na moje kolo (semifinále)
        assert.ok(await tab.locator('#bracket-scroll [data-bcard][data-onpath]').count() >= 3);
        await tab.waitForFunction(() => document.getElementById('bracket-scroll').scrollLeft > 100);
        // Bez vodorovného posouvání stránky; posouvá se jen kontejner, se scroll-snap po kolech
        await showBracket(tab);
        const geometry = await tab.evaluate(() => { const box = document.getElementById('bracket-scroll'); return { wide: box.scrollWidth > box.clientWidth + 50, snap: getComputedStyle(box).scrollSnapType, overflowX: getComputedStyle(box).overflowX, max: getComputedStyle(box).maxHeight }; });
        assert.equal(geometry.wide, true);
        assert.match(geometry.snap, /x/);
        assert.equal(geometry.overflowX, 'auto');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        await tab.evaluate(() => document.getElementById('bracket-scroll').scrollTo({ left: 0 }));
        assert.equal(await tab.evaluate(() => document.getElementById('bracket-scroll').scrollLeft), 0);
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        await shot(tab, 'pavouk-32-osmifinale-360');
        // Celý pavouk: všechna kola
        await tab.click('[data-b-full]');
        await tab.waitForSelector('#bracket-scroll [data-bcol="1"]');
        assert.deepEqual(await columnsOf(tab), ['1', '2', '3', '4', '5', 'cup']);
        assert.equal(await cardsIn(tab, 1), 16);
        assert.equal(await tab.locator('#tournament-bracket button[data-b-full]').getAttribute('aria-pressed'), 'true');
        await showBracket(tab);
        await tab.evaluate(() => document.getElementById('bracket-scroll').scrollTo({ left: 0, top: 0 }));
        await shot(tab, 'pavouk-32-cely-360');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        await tab.click('[data-b-full]');
        await tab.waitForFunction(() => document.querySelector('#bracket-scroll').dataset.from === '2');
        // Klepnutí na hráče zvýrazní jeho cestu, ostatní zmizí do pozadí, druhé klepnutí zruší
        const target = ids[8];
        const beforePath = await tab.locator('#bracket-scroll [data-bcard][data-onpath]').count();
        assert.equal(beforePath, 3, 'moje větev: osmifinále, čtvrtfinále, semifinále');
        await tab.locator(`#bracket-scroll [data-bp="${target}"]`).first().click();
        await tab.waitForSelector('[data-b-clear]');
        const path = await tab.locator('#bracket-scroll [data-bcard][data-onpath]').evaluateAll(list => list.map(item => item.closest('[data-bcell]').dataset.bcell));
        assert.deepEqual(path, ['2-3', '3-2', '4-1'], 'jen karty jeho cesty');
        assert.ok(await tab.locator('#bracket-scroll .opacity-40').count() > 5, 'ostatní ztlumené');
        assert.equal(await tab.locator(`#bracket-scroll [data-bp="${target}"][aria-pressed="true"]`).count() >= 3, true);
        await shot(tab, 'pavouk-32-cesta-360');
        await tab.locator(`#bracket-scroll [data-bp="${target}"]`).first().click();
        await tab.waitForFunction(() => !document.querySelector('[data-b-clear]'));
        assert.equal(await tab.locator('#bracket-scroll .opacity-40').count(), 0);
        assert.equal(await tab.locator('#bracket-scroll [data-bcard][data-onpath]').count(), beforePath, 'zpět moje větev');

        // Celé pořadí: místa 1.–4. nejsou, nahoře ještě hrají, pak vypadlí po kolech; můj řádek je vidět
        await tab.click('summary[data-ranking]');
        await tab.waitForSelector('#tournament-ranking li[data-me]');
        assert.match(await tab.locator('summary[data-ranking]').innerText(), /Celé pořadí \(32 hráčů\)/);
        assert.deepEqual(await groupTitles(tab), ['Ještě hrají', '5.–8. místo', '9.–16. místo', '17.–32. místo']);
        const rows = await rankingRows(tab);
        assert.equal(rows.length, 32);
        assert.equal(new Set(rows).size, 32, 'bez duplicit');
        await tab.waitForFunction(() => { const row = document.querySelector('#tournament-ranking li[data-me]'); const rect = row.getBoundingClientRect(); const panel = document.querySelector('#dialog-overlay > div').getBoundingClientRect(); return rect.top >= panel.top && rect.bottom <= panel.bottom; });
        assert.match((await tab.locator('#tournament-ranking li[data-me]').innerText()).replace(/\s+/g, ' '), /Jana Nováková \(ty\) Semifinále/);
        await shot(tab, 'poradi-32-360');
        // Hledání funguje i v pořadí a v pavouku
        await tab.fill('#tournament-search', 'petr s');
        assert.deepEqual((await tab.locator('#tournament-ranking li[data-rank]:not(.hidden)').allInnerTexts()).map(item => item.replace(/\s+/g, ' ').trim().replace(/^\d+\. /, '').replace(/^\S+ /, '').replace(/ \d+ b · \d+:\d\d$/, '')), ['Petr Svoboda']);
        assert.equal(await tab.locator('#tournament-ranking section:not(.hidden)').count(), 1);
        await tab.fill('#tournament-search', 'zzz');
        assert.equal(await tab.locator('#tournament-empty:not(.hidden)').count(), 1);
        await tab.fill('#tournament-search', '');
        assert.equal(await tab.locator('#tournament-ranking li[data-rank]:not(.hidden)').count(), 32);
        assert.equal(await tab.locator('#tournament-empty:not(.hidden)').count(), 0);
        // Seznam kol je pořád k dispozici
        await tab.click('[data-t-mode="rounds"]');
        await tab.waitForSelector('#tournament-rounds details[data-round]');
        assert.equal(await tab.locator('#tournament-bracket').count(), 0);
        await tab.click('[data-t-mode="bracket"]');
        await tab.waitForSelector('#tournament-bracket [data-bcard]');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('po odehrání 1. kola jsou jeho výsledky vidět: pavouk začíná posledním dohraným kolem a seznam kol ho má rozbalené', async () => {
        const db = newDb({ today: '2026-11-10' });
        bigTournament(db, { size: 32, done: 1 });
        const { context, tab, log } = await start(db, { now: '2026-11-10T10:00:00Z', viewport: { width: 390, height: 780 } });
        await tab.waitForSelector('#tournament-card');
        await openDialog(tab);
        // Osmifinále ještě není odehrané, ale 1. kolo (šestnáctifinále) s výsledky je v pavouku jako první sloupec
        assert.deepEqual((await columnsOf(tab)).slice(0, 2), ['1', '2']);
        assert.equal(await cardsIn(tab, 1), 16);
        assert.match((await tab.locator('#bracket-scroll [data-bcell="1-1"] [data-bcard]').innerText()).replace(/\s+/g, ' '), /\d+\/10/, 'skóre z 1. kola je vidět');
        // Seznam kol: rozbalené je aktuální i poslední dohrané kolo
        await tab.click('#tournament-bracket button[data-b-full]').catch(() => {});
        await tab.click('button:has-text("Seznam kol")');
        await tab.waitForSelector('details[data-round]');
        const open = await tab.locator('details[data-round][open]').count();
        assert.ok(open >= 2, `rozbalená jsou aspoň dvě kola (${open})`);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('skončený turnaj 128 hráčů: celé pořadí bez duplicit, pavouk od osmifinále i celý', async () => {
        const db = newDb({ today: '2026-11-16' });
        const ids = bigTournament(db, { size: 128, done: 7, finished: true, meOut: 5 });
        assert.equal(new Set(ids).size, 128);
        const { context, tab, log } = await start(db, { now: '2026-11-16T10:00:00Z', viewport: { width: 390, height: 780 } });
        await openDialog(tab);
        assert.deepEqual(await columnsOf(tab), ['4', '5', '6', '7', 'cup'], 'od osmifinále (zbývá 16 hráčů)');
        assert.deepEqual([await cardsIn(tab, 4), await cardsIn(tab, 5), await cardsIn(tab, 6), await cardsIn(tab, 7)], [8, 4, 2, 2]);
        // Vítěz a pódium
        const final = db.matches.find(match => match.round === 7 && !match.third);
        assert.ok((await tab.locator('#bracket-scroll [data-bcol="cup"]').innerText()).includes(db.profiles[final.winner].display_name), 'vítěz vpravo');
        assert.equal(await tab.locator('#tournament-podium li').count(), 4);
        // Celé pořadí
        await tab.click('summary[data-ranking]');
        await tab.waitForSelector('#tournament-ranking li[data-me]');
        assert.match(await tab.locator('summary[data-ranking]').innerText(), /Celé pořadí \(128 hráčů\)/);
        assert.deepEqual(await groupTitles(tab), ['1.–4. místo', '5.–8. místo', '9.–16. místo', '17.–32. místo', '33.–64. místo', '65.–128. místo']);
        const rows = await rankingRows(tab);
        assert.equal(rows.length, 128);
        assert.equal(new Set(rows).size, 128, 'bez duplicit');
        const notes = (await tab.locator('#tournament-ranking section[data-rgroup] h3 > span:last-child').allTextContents());
        assert.deepEqual(notes, ['', 'Čtvrtfinále · 4', 'Osmifinále · 8', 'Šestnáctifinále · 16', '2. kolo · 32', '1. kolo · 64']);
        const mine = tab.locator('#tournament-ranking li[data-me]');
        assert.equal(await mine.count(), 1);
        assert.equal(await mine.evaluate(item => item.closest('section').dataset.rgroup), 'p5', 'vypadl jsem ve čtvrtfinále: 5.–8. místo');
        await tab.waitForFunction(() => { const row = document.querySelector('#tournament-ranking li[data-me]'); const rect = row.getBoundingClientRect(); const panel = document.querySelector('#dialog-overlay > div').getBoundingClientRect(); return rect.top >= panel.top && rect.bottom <= panel.bottom; });
        await shot(tab, 'poradi-128-390');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        // Pavouk celý: sedm sloupců, 64 karet v prvním, svislé posouvání uvnitř kontejneru
        await tab.click('summary[data-ranking]');
        await tab.click('[data-b-full]');
        await tab.waitForSelector('#bracket-scroll [data-bcol="1"]');
        assert.deepEqual(await columnsOf(tab), ['1', '2', '3', '4', '5', '6', '7', 'cup']);
        assert.equal(await cardsIn(tab, 1), 64);
        const size = await tab.evaluate(() => { const box = document.getElementById('bracket-scroll'); return { tall: box.scrollHeight > box.clientHeight + 200, limit: box.clientHeight <= window.innerHeight * 0.6 + 1, card: document.querySelector('#bracket-scroll [data-bcol="1"] [data-bcard]').getBoundingClientRect().height }; });
        assert.equal(size.tall, true, 'svislé posouvání uvnitř kontejneru');
        assert.equal(size.limit, true, 'max 60dvh');
        assert.ok(size.card <= 46, `kompaktní karta (${size.card})`);
        await showBracket(tab);
        await tab.evaluate(() => document.getElementById('bracket-scroll').scrollTo({ left: 0, top: 0 }));
        await shot(tab, 'pavouk-128-cely-390');
        await tab.click('[data-b-me]');
        await tab.waitForTimeout(700);
        assert.equal(await tab.evaluate(() => { const rect = document.querySelector('#bracket-scroll [data-bfocus] [data-bcard]').getBoundingClientRect(); const box = document.getElementById('bracket-scroll').getBoundingClientRect(); return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom; }), true, 'Moje místo ukáže mou kartu');
        await shot(tab, 'pavouk-128-moje-390');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('vypadl jsem v prvním kole: pavouk se hned ukáže celý, 64 hráčů', async () => {
        const db = newDb({ today: '2026-11-16' });
        bigTournament(db, { size: 64, done: 6, finished: true, meOut: 1 });
        const { context, tab, log } = await start(db, { now: '2026-11-16T10:00:00Z' });
        await openDialog(tab);
        assert.deepEqual(await columnsOf(tab), ['1', '2', '3', '4', '5', '6', 'cup']);
        assert.equal(await tab.locator('#bracket-scroll').getAttribute('data-from'), '1');
        await tab.click('summary[data-ranking]');
        await tab.waitForSelector('#tournament-ranking li[data-me]');
        assert.equal(await tab.locator('#tournament-ranking li[data-me]').evaluate(item => item.closest('section').dataset.rgroup), 'p33');
        assert.ok((await groupTitles(tab)).includes('33.–64. místo'));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    for (const [width, height] of [[360, 640], [390, 780]]) {
        for (const colorScheme of ['light', 'dark']) {
            await t.test(`pavouk a pořadí ${width}×${height}, ${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim: bez vodorovného posouvání stránky`, async () => {
                for (const finished of [false, true]) {
                    const db = newDb({ today: finished ? '2026-11-16' : '2026-11-12' });
                    bigTournament(db, finished ? { size: 128, done: 7, finished: true, meOut: 5 } : { size: 32, done: 3 });
                    const { context, tab, log } = await start(db, { now: finished ? '2026-11-16T10:00:00Z' : '2026-11-12T10:00:00Z', viewport: { width, height }, colorScheme });
                    await openDialog(tab);
                    const name = `${finished ? '128' : '32'}-${width}-${colorScheme}`;
                    assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                    await showBracket(tab);
                    await shot(tab, `pavouk-${name}`);
                    await tab.evaluate(() => { const box = document.getElementById('bracket-scroll'); box.scrollTo({ left: box.scrollWidth, top: 0 }); });
                    assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                    await shot(tab, `pavouk-konec-${name}`);
                    await tab.click('[data-b-full]');
                    await tab.waitForSelector('#bracket-scroll [data-bcol="1"]');
                    await showBracket(tab);
                    await tab.evaluate(() => document.getElementById('bracket-scroll').scrollTo({ left: 0, top: 0 }));
                    assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                    await shot(tab, `pavouk-cely-${name}`);
                    await tab.click('summary[data-ranking]');
                    await tab.waitForSelector('#tournament-ranking li[data-me]');
                    await tab.waitForTimeout(600);
                    assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                    await shot(tab, `poradi-${name}`);
                    assert.deepEqual(log.errors, []);
                    assert.deepEqual(log.csp, []);
                    await context.close();
                }
            });
        }
    }

    for (const [width, height] of [[360, 640], [390, 780]]) {
        for (const colorScheme of ['light', 'dark']) {
            await t.test(`vzhled ${width}×${height}, ${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim: bez vodorovného posouvání`, async () => {
                const db = newDb();
                runningEight(db);
                openTournament(db, 87, { mine: true });
                const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme });
                await tab.waitForSelector('#tournament-card [data-action="tournament-play"]');
                assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                await tab.locator('#tournament-card').scrollIntoViewIfNeeded();
                await shot(tab, `turnaj-karta-${width}-${colorScheme}`);
                const box = await tab.evaluate(() => { const rect = document.getElementById('tournament-card').getBoundingClientRect(); return { left: rect.left, right: rect.right, height: rect.height }; });
                assert.ok(box.left >= 0 && box.right <= width, 'karta se vejde na šířku');
                assert.ok(box.height < 190, `karta je kompaktní (${box.height})`);
                // Okno turnaje a pravidla
                await tab.click('#tournament-card [data-action="tournament-open"][data-tid="' + T_RUN + '"]');
                await tab.waitForSelector('#tournament-bracket');
                assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                await shot(tab, `turnaj-okno-${width}-${colorScheme}`);
                await tab.click('[data-t-help]');
                await tab.waitForSelector('#tournament-rules');
                assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                await shot(tab, `turnaj-pravidla-${width}-${colorScheme}`);
                assert.deepEqual(log.errors, []);
                assert.deepEqual(log.csp, []);
                await context.close();
            });
        }
    }
});
