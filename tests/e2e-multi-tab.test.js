// Záložka Soupeři a její okna Výzvy a Turnaje (spodní lišta): s typickým obsahem (jedna příchozí výzva, přihlášený turnaj, tři poslední
// výzvy, liga) i s hodně obsahem se všechno vejde na 390×780 i 360×640 bez posouvání stránky; dlouhé seznamy (poslední výzvy) se posouvají
// jen uvnitř okna Výzvy a jde dojet až na konec. Rychlé akce fungují, Zobrazit vše rozbalí starší výzvy.
// Falešný Supabase v paměti jako v tests/e2e-tournament.test.js. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
// SCREENSHOT_DIR=/cesta uloží snímky (a s SOFT=1 se přesah jen vypíše).
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
const SOFT = Boolean(process.env.SOFT);

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

const newDb = () => ({
    calls: [],
    profiles: {
        'u-1': { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [], rating: 1012, rated_games: 6 },
        'u-2': { id: 'u-2', display_name: 'Petr Svoboda', avatar: '🐼', color: 'sky', xp: 4000, badges: [], rating: 1260, rated_games: 14 },
        'u-3': { id: 'u-3', display_name: 'Eva Mistr', avatar: '🦉', color: 'violet', xp: 9000, badges: [], rating: 1720, rated_games: 80 },
        'u-4': { id: 'u-4', display_name: 'Tomáš Král', avatar: '🐯', color: 'amber', xp: 500, badges: [], rating: 1100, rated_games: 9 },
        'u-5': { id: 'u-5', display_name: 'Lenka Dvořáková', avatar: '🐙', color: 'rose', xp: 800, badges: [], rating: 980, rated_games: 3 }
    },
    challenges: {}, results: [], tournaments: [], entries: [], matches: []
});
const addPlayers = (db, count, prefix = 'f') => {
    for (let i = 0; i < count; i++) db.profiles[`${prefix}-${i + 1}`] = { id: `${prefix}-${i + 1}`, display_name: `Hráč ${i + 1}`, avatar: '🐸', color: 'violet', xp: 100 * i, badges: [] };
    return Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);
};
const addEntry = (db, tid, user, status = 'registered') => db.entries.push({ tournament_id: tid, user_id: user, joined_at: new Date(Date.UTC(2026, 10, 2, 8, db.entries.length)).toISOString(), status, place: null });
const openTournament = (db, count, { mine = true } = {}) => {
    db.tournaments.push({ id: T_OPEN, topic: 'mix', week_start: '2026-11-16', started_on: null, capacity: 128, status: 'open', size: null, rounds: null, seed: 'seed-next' });
    addPlayers(db, count - (mine ? 1 : 0), 'g').forEach(user => addEntry(db, T_OPEN, user));
    if (mine) addEntry(db, T_OPEN, 'u-1');
};
const runningEight = (db) => {
    db.tournaments.push({ id: T_RUN, topic: 'mix', week_start: MON, started_on: MON, capacity: 128, status: 'running', size: 8, rounds: 3, seed: 'seed-abc' });
    addPlayers(db, 3);
    const fillers = ['u-3', 'u-4', 'u-5', 'f-1', 'f-2', 'f-3'];
    ['u-1', 'u-2', ...fillers].forEach(user => addEntry(db, T_RUN, user, 'playing'));
    db.matches.push({ id: uuid(101), tournament_id: T_RUN, round: 1, slot: 1, third: false, p1: 'u-1', p2: 'u-2', winner: null, decided_by: null });
    [[fillers[0], fillers[1]], [fillers[2], fillers[3]], [fillers[4], fillers[5]]].forEach(([a, b], i) => db.matches.push({ id: uuid(102 + i), tournament_id: T_RUN, round: 1, slot: 2 + i, third: false, p1: a, p2: b, winner: null, decided_by: null }));
};
// Výzvy: id, soupeř, téma, počet, moje správné odpovědi, soupeřovy (null = čeká na soupeře); čím větší minutes, tím novější
const addChallenge = (db, id, other, topic, count, mine, theirs, { incoming = false, minutes = 0 } = {}) => {
    const stamp = (extra) => `2026-11-05T10:${String(10 + minutes + extra).padStart(2, '0')}:00Z`;
    db.challenges[id] = { id, creator_id: incoming ? other : 'u-1', invited_id: incoming ? 'u-1' : other, topic, count, seed: 's', created_at: stamp(0) };
    if (theirs !== null) db.results.push({ challenge_id: id, user_id: other, correct: theirs, points: theirs * 2, finished_at: stamp(0) });
    if (mine !== null) db.results.push({ challenge_id: id, user_id: 'u-1', correct: mine, points: mine * 2, finished_at: stamp(1) });
};
const typical = (db) => {
    openTournament(db, 87);
    addChallenge(db, 'INC001', 'u-2', 'zemepis', 10, null, 7, { incoming: true });
    addChallenge(db, 'REC001', 'u-3', 'historie', 10, 7, 5, { minutes: 6 });
    addChallenge(db, 'REC002', 'u-4', 'mix', 10, 4, 8, { minutes: 5 });
    addChallenge(db, 'REC003', 'u-5', 'vlajky', 5, 5, null, { minutes: 4 });
};
// 25 dohraných výzev: Poslední výzvy se načítají po stránkách při posouvání rozbaleného seznamu
const many = (db) => {
    for (let i = 0; i < 24; i++) addChallenge(db, `OLD${String(i).padStart(3, '0')}`, 'u-3', 'mix', 10, 5, 4, { minutes: i * 2 });
    addChallenge(db, 'REC001', 'u-4', 'historie', 10, 7, 5, { minutes: 48 });
};
const busy = (db) => {
    runningEight(db);
    openTournament(db, 87, { mine: false });
    addChallenge(db, 'INC001', 'u-2', 'zemepis', 10, null, 7, { incoming: true });
    addChallenge(db, 'INC002', 'u-3', 'historie', 15, null, 9, { incoming: true });
    addChallenge(db, 'REC001', 'u-3', 'historie', 10, 7, 5, { minutes: 12 });
    addChallenge(db, 'REC002', 'u-4', 'mix', 10, 4, 8, { minutes: 10 });
    addChallenge(db, 'REC003', 'u-5', 'vlajky', 5, 5, null, { minutes: 8 });
    addChallenge(db, 'REC004', 'u-2', 'zemepis', 10, 6, 6, { minutes: 6 });
    addChallenge(db, 'REC005', 'u-4', 'sport', 10, 9, 3, { minutes: 4 });
    addChallenge(db, 'REC006', 'u-3', 'film', 10, 2, 9, { minutes: 2 });
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
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        const challengeRow = (c) => ({ ...c, creator: profile(c.creator_id), invited: c.invited_id ? profile(c.invited_id) : null });
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        // Schéma 3: průběh výzvy a XP za výhry (tady jen přijmout a nic nevracet)
        if (rpc && rpc[1] === 'challenge_progress_save') return json(1);
        if (rpc && rpc[1] === 'claim_tournament_xp') return json([]);
        if (url.pathname === '/rest/v1/challenge_progress') return json([]);
        if (rpc && /^(tournament_|my_tournament)/.test(rpc[1])) {
            db.calls.push(rpc[1]);
            if (rpc[1] === 'my_tournament_stats') return json([{ best: 0, wins: 0, played: 0 }]);
            if (rpc[1] === 'tournament_join') {
                const tid = JSON.parse(request.postData() || '{}').tid;
                if (!db.entries.some(entry => entry.tournament_id === tid && entry.user_id === me.id)) addEntry(db, tid, me.id);
            }
            return route.fulfill({ status: 200, body: '' });
        }
        if (/^\/rest\/v1\/tournament/.test(url.pathname)) {
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
                return json(rows.map(item => ({ ...item, results: [] })));
            }
            return json([]);
        }
        if (url.pathname === '/rest/v1/rpc/weekly_leaderboard') return json([]);
        if (url.pathname === '/rest/v1/rating_history') return json([]);
        if (url.pathname === '/rest/v1/profiles') {
            if (request.method() === 'PATCH') return route.fulfill({ status: 204, body: '' });
            return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        }
        if (url.pathname === '/rest/v1/challenges') {
            if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(challengeRow));
            return json(db.challenges[eq('id')] ? [challengeRow(db.challenges[eq('id')])] : []);
        }
        if (url.pathname === '/rest/v1/challenge_results') {
            const ids = param('challenge_id').startsWith('in.') ? param('challenge_id').slice(4, -1).split(',') : null;
            if (param('select').includes('challenge:challenges')) {
                const before = param('finished_at').startsWith('lt.') ? Date.parse(decodeURIComponent(param('finished_at').slice(3))) : Infinity;
                db.pages = (db.pages || 0) + 1;
                return json(db.results.filter(row => row.user_id === eq('user_id') && Date.parse(row.finished_at) < before).sort((a, b) => b.finished_at.localeCompare(a.finished_at)).slice(0, Number(param('limit')) || 50).map(row => ({ ...row, challenge: challengeRow(db.challenges[row.challenge_id]) })));
            }
            if (ids && param('user_id').startsWith('neq.')) return json(db.results.filter(row => ids.includes(row.challenge_id) && row.user_id !== param('user_id').replace('neq.', '')).map(row => ({ ...row, player: profile(row.user_id) })));
            if (ids) return json(db.results.filter(row => ids.includes(row.challenge_id) && row.user_id === eq('user_id')).map(row => ({ challenge_id: row.challenge_id })));
            return json(db.results.filter(row => row.challenge_id === eq('challenge_id')).map(row => ({ ...row, player: profile(row.user_id) })));
        }
        return json({});
    });
};

const setup = async (browser, { viewport, colorScheme = 'light', now }) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, deviceScaleFactor: SHOTS ? 2 : 1 });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => (key.startsWith('session:') ? sessionStorage.setItem(key.slice(8), value) : localStorage.setItem(key, value)));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'session:mudrlant.nav': 'souperi:vyzvy', ...login('tok-u1') });
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
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
// Svislý přesah obsahu přes okno a vodorovné posouvání stránky i obsahu
const measure = (tab) => tab.evaluate(() => {
    const content = document.getElementById('app-content');
    return { overflow: content.scrollHeight - content.clientHeight, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: content.scrollWidth - content.clientWidth };
});

test('záložka Soupeři a okna Výzvy a Turnaje se vejdou bez posouvání', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (fill, { viewport, colorScheme, now, keyboard = false }) => {
        const db = newDb();
        fill(db);
        const page = await setup(browser, { viewport, colorScheme, now });
        // Náhrada visualViewport: window.__keyboard(px) „otevře“ klávesnici – viditelná plocha se zmenší, okno stránky (innerHeight) zůstane jako v Chromu
        if (keyboard) await page.context.addInitScript(() => {
            const fake = new EventTarget();
            let inset = 0;
            Object.defineProperties(fake, {
                height: { get: () => window.innerHeight - inset }, width: { get: () => window.innerWidth },
                offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, pageTop: { get: () => 0 }, pageLeft: { get: () => 0 }, scale: { get: () => 1 }
            });
            Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
            window.__keyboard = (px) => { inset = px; fake.dispatchEvent(new Event('resize')); };
        });
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await page.tab.waitForSelector('#challenges-section [data-action="new-challenge"]');
        await page.tab.waitForSelector('#league-card');
        await page.tab.waitForSelector('[data-action="challenge-open"][data-code="REC001"]');
        await page.tab.waitForTimeout(300);
        return { ...page, db };
    };

    // Okno Výzvy má vlastní posuvný panel (příchozí výzvy, liga, poslední výzvy); stránka ani obsah se neposouvají
    const panel = (tab) => tab.evaluate(() => { const list = document.querySelector('#challenges-section [data-scroll-list]'); return { over: list.scrollHeight - list.clientHeight, top: list.scrollTop }; });
    const fitsAll = async (tab, what) => {
        const size = await measure(tab);
        console.log(`# ${what}: přesah ${size.overflow} px`);
        assert.equal(size.page, 0, `${what}: stránka se neposouvá vodorovně`);
        assert.equal(size.content, 0, `${what}: obsah se neposouvá vodorovně`);
        if (!SOFT) assert.equal(size.overflow, 0, `${what}: obsah se neposouvá svisle`);
        assert.equal(await tab.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 0, `${what}: stránka se neposouvá svisle`);
        assert.equal(await tab.locator('#app-nav:not(.hidden)').count(), 1, `${what}: spodní lišta je vidět`);
    };

    for (const [width, height] of [[390, 780], [360, 640]]) {
        for (const colorScheme of ['light', 'dark']) {
            await t.test(`typický obsah ${width}×${height}, ${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim: okno Výzvy, záložka Soupeři a okno Turnaje bez posouvání`, async () => {
                const { context, tab, log } = await start(typical, { viewport: { width, height }, colorScheme, now: '2026-11-11T10:00:00Z' });
                await fitsAll(tab, `Výzvy ${width}x${height} ${colorScheme}`);
                await shot(tab, `vyzvy-typicky-${width}-${colorScheme}`);
                // Nic nepřetéká přes okraj
                const outside = await tab.evaluate((w) => [...document.querySelectorAll('#challenges-section *')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && (rect.right > w + 0.5 || rect.left < -0.5); }).map(node => node.tagName + '.' + String(node.className).slice(0, 40)), width);
                assert.deepEqual(outside, []);
                if (SOFT) { await context.close(); return; }
                // Pořadí podle důležitosti: rychlé akce, čekající výzva, liga, poslední výzvy
                const order = await tab.evaluate(() => ['[data-action="new-challenge"]', '#challenges-section [data-action="challenge-open"][data-code="INC001"]', '#league-card', '[data-action="challenge-open"][data-code="REC001"]'].map(selector => document.querySelector(selector).getBoundingClientRect().top));
                assert.deepEqual([...order].sort((a, b) => a - b), order, 'pořadí sekcí');
                // Poslední tři výzvy jsou v seznamu a jde k nim dojet (seznam se posouvá jen uvnitř okna)
                assert.equal(await tab.locator('[data-action="challenge-open"][data-code^="REC"]').count(), 3);
                await tab.evaluate(() => { const list = document.querySelector('#challenges-section [data-scroll-list]'); list.scrollTop = list.scrollHeight; });
                const last = await tab.evaluate(() => { const row = document.querySelector('[data-action="challenge-open"][data-code="REC003"]').getBoundingClientRect(); const bar = document.getElementById('app-nav').getBoundingClientRect(); return { bottom: row.bottom, bar: bar.top }; });
                assert.ok(last.bottom <= last.bar + 0.5, `poslední výzva je celá nad spodní lištou: ${JSON.stringify(last)}`);
                // Zpět na záložku Soupeři: nejnaléhavější věc (příchozí výzva) a čtyři dlaždice
                await tab.click('[data-action="souperi-back"]');
                await tab.waitForSelector('#souperi-tiles');
                assert.equal(await nav.currentTab(tab), 'souperi');
                assert.equal(await tab.getAttribute('#waiting-section', 'data-waiting'), '1');
                assert.ok(await tab.$('#waiting-section [data-action="challenge-open"][data-code="INC001"]'), 'čekající výzva je v části Čeká na tebe');
                assert.equal((await tab.textContent('#challenges-tile [data-tile-badge]')).trim(), '1');
                assert.equal((await tab.textContent('#app-nav [data-nav="souperi"] [data-nav-badge]')).trim(), '1');
                await fitsAll(tab, `Soupeři ${width}x${height} ${colorScheme}`);
                await shot(tab, `souperi-typicky-${width}-${colorScheme}`);
                // Okno Turnaje: karta turnaje s přihláškou, dole Archiv a Jak to funguje
                await nav.tournaments(tab);
                await tab.waitForSelector('#tournament-card');
                assert.match(await tab.textContent('#tournament-card'), /Přihláška hotová/);
                assert.equal(await tab.locator('#tournaments-section [data-action="tournament-archive"], #tournaments-section [data-action="tournament-help"]').count(), 2);
                await fitsAll(tab, `Turnaje ${width}x${height} ${colorScheme}`);
                await shot(tab, `turnaje-typicky-${width}-${colorScheme}`);
                assert.deepEqual(log.errors, []);
                assert.deepEqual(log.csp, []);
                await context.close();
            });
        }
    }

    await t.test('Poslední výzvy: rozbalení ukáže všechny načtené, posouvání seznamu dolů načte starší až do konce; stránka se neposouvá', async () => {
        const { context, tab, log } = await start(many, { viewport: { width: 390, height: 780 }, now: `${MON}T10:00:00Z` });
        const rows = () => tab.locator('#challenges-section [data-action="challenge-open"][data-code^="OLD"]').count();
        await tab.waitForFunction(() => document.querySelectorAll('#challenges-section [data-action="challenge-open"]').length === 3);
        await tab.click('[data-action="recent-more"]');
        // prvních 8 + hned další stránka (hlídka na konci je vidět), pak posouvání seznamu dolů načte zbytek
        await tab.waitForFunction(() => document.querySelectorAll('#challenges-section [data-action="challenge-open"]').length >= 16, null, { timeout: 20000 });
        for (let i = 0; i < 6 && !(await tab.$('#challenges-section [data-recent-end]')); i++) {
            await tab.evaluate(() => { const list = document.querySelector('#challenges-section [data-scroll-list]'); list.scrollTo(0, list.scrollHeight); });
            await tab.waitForTimeout(700);
        }
        await tab.waitForSelector('#challenges-section [data-recent-end]', { timeout: 20000 });
        assert.equal(await rows(), 24, 'všech 25 výzev (24 starších + nejnovější REC001)');
        assert.match(await tab.textContent('[data-recent-end]'), /To jsou všechny tvoje výzvy/);
        const codes = await tab.$$eval('#challenges-section [data-action="challenge-open"]', items => items.map(item => item.dataset.code));
        assert.equal(new Set(codes).size, codes.length, 'bez duplicit');
        assert.equal(codes[0], 'REC001', 'nejnovější nahoře');
        assert.deepEqual(codes.slice(1), [...codes.slice(1)].sort().reverse(), 'starší od nejnovější');
        // Dlouhý seznam se posouvá jen uvnitř okna a jde dojet až na konec (poslední řádek celý nad spodní lištou)
        await tab.evaluate(() => { const list = document.querySelector('#challenges-section [data-scroll-list]'); list.scrollTo(0, list.scrollHeight); });
        assert.ok((await panel(tab)).over > 0, 'seznam se posouvá uvnitř okna');
        const end = await tab.evaluate(() => { const mark = document.querySelector('[data-recent-end]').getBoundingClientRect(); return { bottom: mark.bottom, bar: document.getElementById('app-nav').getBoundingClientRect().top }; });
        assert.ok(end.bottom <= end.bar + 0.5, `konec seznamu je nad spodní lištou: ${JSON.stringify(end)}`);
        await fitsAll(tab, 'rozbalené Poslední výzvy');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    for (const [width, height, colorScheme] of [[390, 780, 'light'], [360, 640, 'dark']]) await t.test(`hodně obsahu ${width}×${height}, ${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim: běžící turnaj, dvě pozvánky, šest výzev; Zobrazit vše rozbalí starší; Čeká na tebe ukáže zápas a +2 další`, async () => {
        const { context, tab, log } = await start(busy, { viewport: { width, height }, colorScheme, now: `${MON}T10:00:00Z` });
        await tab.waitForSelector('#challenges-section [data-action="challenge-open"][data-code="INC002"]');
        await fitsAll(tab, `Výzvy s hodně obsahem ${width}x${height}`);
        await shot(tab, `vyzvy-hodne-${width}-${colorScheme}`);
        if (SOFT) { await context.close(); return; }
        assert.equal(await tab.locator('#challenges-section [data-action="challenge-open"][data-code^="REC"]').count(), 3, 'jen poslední tři');
        await tab.click('[data-action="recent-more"]');
        await tab.waitForFunction(() => document.querySelectorAll('#challenges-section [data-action="challenge-open"][data-code^="REC"]').length === 6);
        assert.equal(await tab.locator('[data-action="recent-more"]').getAttribute('aria-expanded'), 'true');
        await fitsAll(tab, `rozbalené výzvy ${width}x${height}`);
        await shot(tab, `vyzvy-hodne-rozbaleno-${width}-${colorScheme}`);
        await tab.click('[data-action="recent-more"]');
        await tab.waitForFunction(() => document.querySelectorAll('#challenges-section [data-action="challenge-open"][data-code^="REC"]').length === 3);
        // Záložka Soupeři: nejnaléhavější je dnešní zápas turnaje, obě pozvánky jsou pod „+2 další“
        await tab.click('[data-action="souperi-back"]');
        await tab.waitForSelector('#waiting-section [data-wait="tournament"][data-action="tournament-play"]');
        assert.equal(await tab.getAttribute('#waiting-section', 'data-waiting'), '3');
        assert.equal((await tab.textContent('#waiting-section [data-action="waiting-all"]')).replace(/\s+/g, ' ').trim(), '+2 další');
        assert.equal((await tab.textContent('#app-nav [data-nav="souperi"] [data-nav-badge]')).trim(), '3');
        await fitsAll(tab, `Soupeři s hodně obsahem ${width}x${height}`);
        await shot(tab, `souperi-hodne-${width}-${colorScheme}`);
        await tab.click('#waiting-section [data-action="waiting-all"]');
        await tab.waitForSelector('#waiting-list');
        assert.equal(await tab.locator('#waiting-list [data-action="challenge-open"][data-code^="INC"]').count(), 2);
        assert.equal(await tab.locator('#waiting-list [data-action="tournament-play"]').count(), 1);
        assert.ok(await tab.evaluate(() => document.querySelector('#dialog-overlay > div').getBoundingClientRect().bottom <= window.innerHeight), 'okno Čeká na tebe se vejde');
        await shot(tab, `ceka-na-tebe-${width}-${colorScheme}`);
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        // Okno Turnaje: běžící turnaj se zápasem k odehrání
        await nav.tournaments(tab);
        await tab.waitForSelector('#tournament-card [data-action="tournament-play"]');
        await fitsAll(tab, `Turnaje s hodně obsahem ${width}x${height}`);
        await shot(tab, `turnaje-hodne-${width}-${colorScheme}`);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('turnaj s otevřenými přihláškami a nepřihlášený hráč: karta v okně Turnaje zeleně svítí, přihlášený ne', async () => {
        const { context, tab, log } = await start((db) => { typical(db); db.entries = db.entries.filter(entry => entry.user_id !== 'u-1'); }, { viewport: { width: 390, height: 780 }, colorScheme: 'light', now: '2026-11-11T10:00:00Z' });
        await nav.tournaments(tab);
        await tab.waitForSelector('#tournament-card [data-action="tournament-join"]');
        assert.equal(await tab.locator('#tournament-card.tour-glow').count(), 1);
        assert.match(await tab.evaluate(() => getComputedStyle(document.getElementById('tournament-card')).boxShadow), /52, 211, 153/);
        await shot(tab, 'turnaj-svit-390-light');
        await tab.click('[data-action="tournament-join"]');
        await tab.waitForSelector('#tournament-card [data-action="tournament-leave"]');
        assert.equal(await tab.locator('#tournament-card.tour-glow').count(), 0, 'po přihlášení karta nesvítí');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('rychlé akce: Vyzvat, Náhodný soupeř, Zadat kód a Přijímám výzvy z', { skip: SOFT }, async () => {
        const { context, tab, log } = await start(typical, { viewport: { width: 390, height: 780 }, colorScheme: 'light', now: '2026-11-11T10:00:00Z' });
        assert.match((await tab.textContent('#challenges-section')).replace(/\s+/g, ' '), /Přijímám výzvy z: všechna témata/);
        // Dlaždice rychlých akcí mají vlastní ilustrace a skutečně se načtou
        for (const [selector, name] of [['[data-action="new-challenge"]', 'vyzva'], ['[data-action="random-challenge"]', 'nahodny'], ['[data-action="join-challenge"]', 'kod']]) {
            await tab.waitForFunction(([s, n]) => { const img = document.querySelector(`#challenges-section ${s} img[src="icons/topics/${n}.webp"]`); return img && img.complete && img.naturalWidth > 0; }, [selector, name]);
        }
        await tab.click('#challenges-section [data-action="new-challenge"]');
        await tab.waitForSelector('[data-ch-who="player"][aria-checked="true"]');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        await tab.click('#challenges-section [data-action="random-challenge"]');
        await tab.waitForSelector('[data-ch-who="random"][aria-checked="true"]');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        await tab.click('#challenges-section [data-action="join-challenge"]');
        await tab.waitForSelector('#challenge-code');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        await tab.click('#challenges-section [data-action="open-accept"]');
        await tab.waitForSelector('[data-accept-topic]');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('Zadat kód na malém telefonu: otevřená klávesnice okno nepřekryje, po zavření se vrátí dolů', async () => {
        const { context, tab, log } = await start(typical, { viewport: { width: 360, height: 640 }, colorScheme: 'light', now: '2026-11-11T10:00:00Z', keyboard: true });
        await tab.click('#challenges-section [data-action="join-challenge"]');
        await tab.waitForSelector('#challenge-code');
        const KEYBOARD = 300;
        await tab.evaluate(px => window.__keyboard(px), KEYBOARD);
        await tab.waitForFunction(() => document.documentElement.classList.contains('kb-open'));
        await tab.waitForTimeout(100);
        const open = await tab.evaluate(() => {
            const panel = document.getElementById('dialog-overlay').firstElementChild.getBoundingClientRect();
            const field = document.getElementById('challenge-code').getBoundingClientRect();
            const submit = document.querySelector('#dialog-overlay button[type="submit"]');
            return { panelTop: panel.top, panelBottom: panel.bottom, fieldTop: field.top, fieldBottom: field.bottom, submitBottom: submit ? submit.getBoundingClientRect().bottom : null };
        });
        const visible = 640 - KEYBOARD;
        assert.ok(open.panelBottom <= visible + 1, `spodek okna ${open.panelBottom} px musí být nad klávesnicí (${visible} px)`);
        assert.ok(open.panelTop >= 0, 'okno nesmí utéct nahoru mimo obrazovku');
        assert.ok(open.fieldTop >= 0 && open.fieldBottom <= visible, `pole pro kód (${open.fieldTop}–${open.fieldBottom} px) musí být vidět`);
        await shot(tab, 'kod-klavesnice-360x640');
        await tab.evaluate(() => window.__keyboard(0));
        await tab.waitForFunction(() => !document.documentElement.classList.contains('kb-open'));
        const closed = await tab.evaluate(() => document.getElementById('dialog-overlay').firstElementChild.getBoundingClientRect().bottom);
        assert.ok(closed > visible + 100, 'po zavření klávesnice je okno zase dole');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('chybně nahlášená výška okna (Android po aktualizaci): aplikace se přizpůsobí viditelné ploše, spodek není useknutý', async () => {
        const { context, tab, log } = await start(typical, { viewport: { width: 360, height: 640 }, colorScheme: 'light', now: '2026-11-11T10:00:00Z', keyboard: true });
        // Bez zaměřeného pole: viditelná plocha je o 150 px menší než okno – nejde o klávesnici
        await tab.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.__keyboard(150); });
        await tab.waitForFunction(() => Math.round(document.body.getBoundingClientRect().height) === 490);
        assert.equal(await tab.evaluate(() => document.documentElement.classList.contains('kb-open')), false, 'bez pole to není klávesnice');
        await tab.evaluate(() => window.__keyboard(0));
        await tab.waitForFunction(() => Math.round(document.body.getBoundingClientRect().height) === 640);
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
