// Týdenní turnaje v prohlížeči s falešným Supabase v paměti (stav turnaje „spočítaný serverem“, jako v tests/e2e-rating.test.js):
// přihlášky a kapacita, běžící turnaj a tlačítko Hrát, zápas až do výsledku, zprávy, dialog pavouka, starší databáze bez turnajů,
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
        today, missing: false, calls: [], gets: [], myTimeMs: 20000, failJoin: null, failStart: null, stats: { best: 0, wins: 0, played: 0 }, patches: [],
        profiles: {
            'u-1': { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [], rating: 1120, rated_games: 6 },
            'u-2': { id: 'u-2', display_name: 'Petr Svoboda', avatar: '🐼', color: 'sky', xp: 4000, badges: [], rating: 1260, rated_games: 14 }
        },
        tournaments: [], entries: [], matches: [], results: [], notices: []
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
const openTournament = (db, count, { capacity = 128, mine = false } = {}) => {
    db.tournaments.push({ id: T_OPEN, topic: 'mix', week_start: '2026-11-16', started_on: null, capacity, status: 'open', size: null, rounds: null, seed: 'seed-next' });
    const others = addPlayers(db, count - (mine ? 1 : 0));
    others.forEach(user => addEntry(db, T_OPEN, user));
    if (mine) addEntry(db, T_OPEN, 'u-1');
};

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (!me) return json({ message: 'no token' }, 401);
        const param = (key) => url.searchParams.get(key) || '';
        const eq = (key) => param(key).replace(/^eq\./, '');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        const tournament = (id) => db.tournaments.find(item => item.id === id);
        const matchRow = (id) => db.matches.find(item => item.id === id);
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
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
            if (rpc[1] === 'tournament_finish_match') {
                const own = db.results.find(row => row.match_id === body.mid && row.user_id === me.id);
                if (!own || own.finished_at) return fail('Výsledek jde zapsat jen jednou.');
                Object.assign(own, { finished_at: new Date().toISOString(), correct: body.correct_count, points: body.point_count, time_ms: db.myTimeMs });
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
                const rows = db.entries.filter(entry => entry.tournament_id === eq('tournament_id')).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
                return json(rows.map(entry => ({ user_id: entry.user_id, joined_at: entry.joined_at, status: entry.status, place: entry.place, player: profile(entry.user_id) })));
            }
            if (url.pathname === '/rest/v1/tournament_matches') {
                const rows = db.matches.filter(item => item.tournament_id === eq('tournament_id')).sort((a, b) => a.round - b.round || a.slot - b.slot);
                // pravidla řádků: cizí výsledek je vidět až po rozhodnutí zápasu
                return json(rows.map(item => ({ ...item, results: db.results.filter(row => row.match_id === item.id && (row.user_id === me.id || item.winner)).map(({ match_id, ...rest }) => rest) })));
            }
            if (url.pathname === '/rest/v1/tournament_notices') return json(db.notices.filter(notice => notice.user_id === me.id && !notice.seen));
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
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'), ...storage });
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

    await t.test('začal jsem a nedokončil: neodehráno, nejde hrát znovu, rozehraný zápas se neobnovuje', async () => {
        const db = newDb();
        runningEight(db);
        const { context, tab, log } = await start(db);
        await tab.click('[data-action="tournament-play"]');
        await tab.waitForSelector('[data-action="give-up"]');
        await tab.click('[data-action="give-up"]');
        await tab.waitForSelector('h1');
        // Aplikace se zavře uprostřed zápasu
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForSelector('#tournament-card');
        assert.match((await tab.textContent('#tournament-card')).replace(/\s+/g, ' '), /Kolo jsi začal a nedokončil, počítá se jako neodehrané/);
        assert.equal(await tab.locator('[data-action="tournament-play"]').count(), 0);
        assert.equal(await tab.locator('[data-action="challenge-resume"]').count(), 0);
        await context.close();
        // Server zápas už zná (druhé zařízení): hláška serveru se ukáže a hra se nespustí
        const second = newDb();
        runningEight(second);
        const page = await start(second);
        await page.tab.waitForSelector('[data-action="tournament-play"]');
        second.failStart = 'Kolo jsi už začal.';
        await page.tab.click('[data-action="tournament-play"]');
        await page.tab.waitForFunction(() => /Kolo jsi už začal\./.test(document.getElementById('toast') ? document.getElementById('toast').textContent : ''));
        assert.equal(await page.tab.locator('[data-action="give-up"]').count(), 0);
        assert.deepEqual(page.log.errors, []);
        assert.deepEqual(log.errors, []);
        await page.context.close();
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
        await tab.waitForSelector('#tournament-rounds');
        const rounds = await tab.locator('#tournament-rounds details[data-round]').evaluateAll(list => list.map(item => ({ key: item.dataset.round, open: item.open, name: item.querySelector('summary').innerText.replace(/\s+/g, ' ').trim() })));
        assert.deepEqual(rounds.map(round => round.key), ['2', '1']);
        assert.equal(rounds[0].open, true, 'aktuální kolo je rozbalené');
        assert.equal(rounds[1].open, false, 'dřívější kolo je sbalené');
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
                await tab.waitForSelector('#tournament-rounds');
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
