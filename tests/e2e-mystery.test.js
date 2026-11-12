// Tajemná otázka dne v prohlížeči (mystery.js) s falešným Supabase v paměti: pruh na úvodu (nápověda 5/8 · další v 12:00, nová nápověda,
// vyřešeno), obrazovka s nápovědami podle hodin (posunuté hodiny odkryjí další nápovědu samy), psaný tip (špatný, opakovaný, správný),
// možnosti v poslední nápovědě, body, XP a odznak Detektiv, sdílení textem i obrázkem bez odpovědi, host s pozvánkou k přihlášení,
// přihlášený s tipy na serveru, statistikami dne a přáteli, druhý den včerejší odpověď na úvodu (do skrytí), starší databáze bez funkcí.
// Úvod se vejde bez posouvání na 360×640 i 390×780, kontroly rozhraní jako tests/e2e-ui-audit.test.js, CSP bez chyb.
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí. MYSTERY_SHOTS=<složka> uloží snímky obrazovek (deviceScaleFactor 1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const M = require('../mystery.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PHOTO = fs.readFileSync(path.join(ROOT, 'icons', 'topics', 'sova-vitej.webp'));
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
// Den, kdy je tématem Zeměpis (testovací data ho mají); další den je jiné téma
const TODAY = '2026-11-13';
const TOMORROW = '2026-11-14';
const SHOTS = process.env.MYSTERY_SHOTS || '';
// Pražský čas „9:41“ dne day jako okamžik
const prague = (clock, day = TODAY) => { const [h, m] = clock.split(':').map(Number); return new Date(M.pragueTime(day, h, m)); };

const serveFile = (pathname) => {
    if (fixtures.files[pathname]) return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtures.files[pathname]) };
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true });

// Databáze tajemné otázky (zjednodušeně, pravidla hlídá tests/sql-mystery.test.js); missing = starší databáze bez funkcí (404)
const newDb = () => ({
    calls: [], missing: false, mine: null,
    profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊'), 'u-2': player('u-2', 'Petr Svoboda', '🐼'), 'u-3': player('u-3', 'Eva Mistr', '🦉') }
});
const mysteryJson = (db, day) => ({ day, guesses: db.mine ? db.mine.guesses : 0, solved: Boolean(db.mine && db.mine.solved), clues: db.mine ? db.mine.clues : 0, points: db.mine ? db.mine.points : 0,
    solved_at: db.mine && db.mine.solved ? db.mine.solved_at : null, finished: Boolean(db.mine && (db.mine.solved || db.mine.guesses >= 3)), clues_now: 4 });

const backend = async (context, db) => {
    await context.route('https://proj.supabase.co/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        if (!me) return json({ message: 'no token' }, 401);
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        if (rpc) {
            const name = rpc[1];
            if (name === 'schema_version') return json(REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'friends_list' || name === 'weekly_leaderboard') return json([]);
            if (/^mystery_/.test(name)) {
                db.calls.push({ name, body });
                if (db.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                const day = body && body.for_day ? body.for_day : TODAY;
                if (name === 'mystery_state') return json(mysteryJson(db, TODAY));
                if (name === 'mystery_guess') {
                    const wrong = db.mine ? db.mine.guesses : 0;
                    db.mine = { guesses: body.idx + 1, solved: body.is_correct, clues: body.clues, points: body.is_correct ? Math.max(1, 11 - body.clues - wrong) : 0, solved_at: '9:41' };
                    return json(mysteryJson(db, TODAY));
                }
                if (name === 'mystery_stats') {
                    if (day === TODAY && !(db.mine && db.mine.solved) && !db.dayOver) return json({ day, hidden: true });
                    return json({ day, hidden: false, players: 50, solved: 17, solved_pct: 34, fastest: '0:12', avg_clues: 3.0, me: null });
                }
                if (name === 'mystery_friends') {
                    if (day === TODAY && !(db.mine && db.mine.solved) && !db.dayOver) return json({ day, hidden: true });
                    const row = (id, rank, solved, points, clues, mine = false) => ({ rank, ...db.profiles[id], solved, points, clues, guesses: 1, solved_at: solved ? '8:00' : null, me: mine });
                    return json({ day, hidden: false, friends: 2, rank: 2, rows: [row('u-2', 1, true, 10, 1), row('u-1', 2, true, 7, 4, true), row('u-3', 3, false, 0, 3)] });
                }
            }
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        const table = url.pathname.replace('/rest/v1/', '');
        const eq = (field) => (url.searchParams.get(field) || '').replace(/^eq\./, '');
        if (table === 'profiles') return json(db.profiles[eq('id')] ? [db.profiles[eq('id')]] : []);
        return json([]);
    });
};

const open = async (browser, storage, { viewport = { width: 360, height: 640 }, colorScheme = 'light', db = null, time = prague('10:00'), install = false } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: 'reduce' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) return route.fulfill(serveFile(url.pathname));
        if (url.hostname === 'proj.supabase.co') return db ? route.fallback() : route.fulfill({ json: url.pathname.startsWith('/auth/') ? {} : [] });
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: fixtures.extractFor(url.searchParams.get('titles')) } } } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org' || url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
        return route.abort();
    });
    if (db) await backend(context, db);
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    if (install) await tab.clock.install({ time });
    else await tab.clock.setFixedTime(time);
    await tab.goto(`${ORIGIN}/`);
    await tab.waitForSelector('#mystery-card', { timeout: 30000 });
    return { context, tab, log };
};
const compact = async (tab, selector) => ((await tab.textContent(selector)) || '').replace(/\s+/g, ' ').trim();
const store = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.mystery') || 'null'));
const INSPECT = (() => {
    const source = fs.readFileSync(path.join(__dirname, 'e2e-ui-audit.test.js'), 'utf8');
    const start = source.indexOf('const inspect = () => {');
    const end = source.indexOf('\ntest(', start);
    return start >= 0 && end > start ? source.slice(start + 'const inspect = '.length, end).trim().replace(/;$/, '') : null;
})();
const audit = async (tab, scene) => {
    if (!INSPECT) return;
    await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
    await tab.waitForTimeout(150);
    const found = await tab.evaluate(`(${INSPECT})()`);
    for (const kind of Object.keys(found)) assert.deepEqual(found[kind], [], `${scene}: ${kind}`);
};
const fitsScreen = async (tab, what) => {
    const size = await tab.evaluate(() => { const main = document.getElementById('app-content'); return { scroll: main.scrollHeight, client: main.clientHeight }; });
    assert.ok(size.scroll <= size.client + 1, `${what}: posouvá se (${size.scroll} > ${size.client})`);
};
const shot = async (tab, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
const openScreen = async (tab) => {
    await tab.click('[data-action="mystery-open"]');
    await tab.waitForSelector('#mystery-screen', { timeout: 30000 });
    // Fotky a obrazové nápovědy se dokreslí
    await tab.waitForTimeout(300);
};
const roundOf = async (tab, day = TODAY) => (await store(tab)).rounds[day];
const typeTip = async (tab, text) => {
    await tab.fill('#mystery-input', text);
    await tab.click('#mystery-form button[type="submit"]');
};

test('Tajemná otázka dne v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('host: pruh na úvodu, nápovědy podle hodin, špatný a opakovaný tip, úvod bez posouvání (360×640)', async () => {
        const { context, tab, log } = await open(browser, {});
        assert.equal(await tab.getAttribute('#mystery-card', 'data-mystery-status'), 'new');
        assert.equal(await compact(tab, '#mystery-card'), 'Tajemná otázka dne Nápověda 5/8 · další v 12:00');
        assert.ok(await tab.$('#mystery-card [data-mystery-new]'), 'zlatá tečka: nová nápověda');
        assert.ok(await tab.$('#mystery-card img[src$="sova-dalekohled.webp"]'));
        await fitsScreen(tab, 'úvod s pruhem tajemné otázky (360×640)');
        await audit(tab, 'úvod s pruhem tajemné otázky (360×640)');
        await shot(tab, 'uvod-360x640');
        await openScreen(tab);
        assert.match(await compact(tab, '#app-header'), /Tajemná otázka/);
        assert.match(await compact(tab, '[data-mystery-summary]'), /^Nápověda 5\/8 · další v 12:00$/);
        assert.deepEqual(await tab.$$eval('[data-mystery-clue]:not([data-locked])', items => items.map(item => Number(item.dataset.mysteryClue))), [5, 4, 3, 2, 1], 'odkryté nápovědy, nejnovější nahoře');
        assert.match(await compact(tab, '[data-mystery-clue][data-locked]'), /6\. nápověda\s*v 12:00/);
        assert.equal(await tab.$('[data-action="mystery-choice"]'), null, 'možnosti až v 16:00');
        const round = await roundOf(tab);
        assert.equal(round.topic, 'zemepis');
        const screenText = await compact(tab, '#mystery-screen');
        assert.ok(!screenText.includes(round.name), `odpověď ${round.name} na obrazovce není`);
        assert.match(screenText, /Zeměpis/);
        assert.match(screenText, /3 tipy na celý den · teď za 6 bodů/);
        await audit(tab, 'obrazovka tajemné otázky (360×640)');
        await shot(tab, 'obrazovka-360x640');
        // Špatný tip a ten samý ještě jednou (nepočítá se)
        await typeTip(tab, 'Atlantida');
        await tab.waitForSelector('[data-mystery-notice]');
        assert.equal(await compact(tab, '[data-mystery-notice]'), '„Atlantida“ to není. Zbývají 2 tipy.');
        assert.match(await compact(tab, '[data-mystery-tips]'), /Atlantida/);
        assert.match(await compact(tab, '#mystery-form label'), /2 tipy na celý den · teď za 5 bodů/);
        await typeTip(tab, 'atlantida');
        await tab.waitForFunction(() => /už jsi zkoušel/.test(document.querySelector('[data-mystery-notice]').textContent));
        assert.equal((await store(tab)).days[TODAY].tips.length, 1);
        await shot(tab, 'spatny-tip-360x640');
        await tab.click('[data-action="mystery-home"]');
        await tab.waitForSelector('#mystery-card');
        assert.equal(await compact(tab, '#mystery-card [data-mystery-text]'), 'Nápověda 5/8 · další v 12:00');
        assert.equal(await tab.$('#mystery-card [data-mystery-new]'), null, 'nápovědu už hráč viděl');
        await fitsScreen(tab, 'úvod po tipu (360×640)');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('host: hodiny běží – další nápověda se odkryje sama, v 16:00 možnosti, vyřešení, XP, odznak, sdílení bez odpovědi', async () => {
        const { context, tab, log } = await open(browser, {}, { time: prague('11:59'), install: true });
        await openScreen(tab);
        assert.equal(await tab.$$eval('[data-mystery-clue]:not([data-locked])', items => items.length), 5);
        await tab.clock.fastForward('01:30');
        await tab.waitForFunction(() => document.querySelectorAll('[data-mystery-clue]:not([data-locked])').length === 6);
        assert.match(await compact(tab, '[data-mystery-summary]'), /Nápověda 6\/8 · další v 14:00/);
        await tab.clock.fastForward('04:30:00');
        await tab.waitForFunction(() => document.querySelectorAll('[data-mystery-clue]:not([data-locked])').length === 8, null, { timeout: 15000 });
        assert.match(await compact(tab, '[data-mystery-summary]'), /^Nápověda 8\/8$/);
        assert.equal(await tab.$('[data-mystery-clue][data-locked]'), null);
        const round = await roundOf(tab);
        // Poslední nápověda je ostrá fotka – bez písmen a bez možností
        assert.equal(await tab.$('[data-mystery-pattern]'), null);
        assert.equal(await tab.$('[data-action="mystery-choice"]'), null);
        assert.ok(await tab.$('[data-mystery-photo="sharp"]'), 'ostrá fotka v poslední nápovědě');
        assert.ok(await tab.$('[data-mystery-photo="blur"]'), 'rozmazaná v předposlední');
        await audit(tab, 'poslední nápověda (360×640)');
        await shot(tab, 'posledni-napoveda-360x640');
        await tab.fill('#mystery-form input', round.name);
        await tab.click('#mystery-form button[type="submit"]');
        await tab.waitForSelector('#mystery-screen[data-mystery-status="solved"]');
        const summary = await compact(tab, '[data-mystery-summary]');
        assert.match(summary, /^Vyřešeno v 16:\d\d s 8 nápovědami · 3 body$/);
        assert.equal(await compact(tab, '[data-mystery-answer]'), round.name);
        assert.match(await compact(tab, '#mystery-screen'), /\+16 XP za Tajemnou otázku dne/);
        assert.match(await compact(tab, '#mystery-stats'), /Po přihlášení uvidíš/);
        assert.equal(await tab.$('#mystery-form'), null, 'po vyřešení už se netipuje');
        const progress = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')));
        assert.equal(progress.counters.mysterySolved, 1);
        assert.ok(progress.badges.detektiv, 'odznak Detektiv');
        // Sdílení textem (schránka) bez odpovědi
        await tab.click('[data-action="mystery-share"]');
        await tab.waitForTimeout(300);
        const clip = await tab.evaluate(() => navigator.clipboard.readText());
        assert.match(clip, /^Mudrlant · Tajemná otázka 13\. 11\. · 🔍{7}✅ · 8\. nápověda · 3 body/u);
        assert.ok(!clip.includes(round.name), 'text ke sdílení odpověď neprozradí');
        const [download] = await Promise.all([tab.waitForEvent('download'), tab.click('[data-action="mystery-share-image"]')]);
        assert.equal(download.suggestedFilename(), `mudrlant-tajemna-otazka-${TODAY}.png`);
        await shot(tab, 'vyreseno-host-360x640');
        await tab.click('[data-action="mystery-home"]');
        await tab.waitForSelector('#mystery-card[data-mystery-status="solved"]');
        assert.match(await compact(tab, '#mystery-card'), /Vyřešeno v 16:\d\d s 8 nápovědami/);
        await fitsScreen(tab, 'úvod po vyřešení (360×640)');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('přihlášený: tip na server, jak si vedli ostatní a přátelé; druhý den včerejší odpověď na úvodu, skrytí (390×780)', async () => {
        const db = newDb();
        const { context, tab, log } = await open(browser, login('tok-u1'), { viewport: { width: 390, height: 780 }, db, time: prague('9:41') });
        assert.equal(await compact(tab, '#mystery-card [data-mystery-text]'), 'Nápověda 4/8 · další v 10:00');
        await fitsScreen(tab, 'úvod s pruhem tajemné otázky (390×780)');
        await openScreen(tab);
        const round = await roundOf(tab);
        await typeTip(tab, round.name.toLocaleUpperCase('cs'));
        await tab.waitForSelector('#mystery-screen[data-mystery-status="solved"]');
        assert.match(await compact(tab, '[data-mystery-summary]'), /^Vyřešeno v 9:41 s 4 nápovědami · 7 bodů$/);
        await tab.waitForSelector('[data-mystery-community]');
        const guess = db.calls.find(call => call.name === 'mystery_guess');
        assert.deepEqual(guess.body, { for_day: TODAY, idx: 0, is_correct: true, clues: 4 });
        assert.equal(await compact(tab, '[data-mystery-community]'), 'Uhodlo 34 % hráčů, nejrychlejší v 0:12, průměrně s 3 nápovědami');
        assert.equal(await compact(tab, '[data-mystery-friend-rank]'), 'Mezi přáteli 2. z 3');
        assert.deepEqual(await tab.$$eval('[data-mystery-friends] [data-player-name]', items => items.map(item => item.textContent.trim())), ['Petr Svoboda', 'Jana Nováková (ty)', 'Eva Mistr']);
        assert.equal((await store(tab)).days[TODAY].synced, 1);
        await audit(tab, 'vyřešeno s výsledky ostatních (390×780)');
        await shot(tab, 'vyreseno-statistiky-390x780');
        // Druhý den: na úvodu včerejší odpověď a kolik hráčů ji uhodlo
        db.dayOver = true;
        await tab.clock.setFixedTime(prague('8:00', TOMORROW));
        await tab.goto(`${ORIGIN}/`);
        await tab.waitForSelector('#mystery-card[data-mystery-kind="reveal"]');
        await tab.waitForFunction(() => /uhodlo 34 %/.test(document.querySelector('#mystery-card').textContent));
        assert.equal(await compact(tab, '#mystery-card'), `Včerejší tajemná otázka Odpověď: ${round.name} · uhodlo 34 %`);
        await fitsScreen(tab, 'úvod se včerejší odpovědí (390×780)');
        await audit(tab, 'úvod se včerejší odpovědí (390×780)');
        await shot(tab, 'vcerejsi-odpoved-390x780');
        await tab.click('[data-action="mystery-reveal"]');
        await tab.waitForSelector('#mystery-screen');
        assert.equal(await compact(tab, '[data-mystery-answer]'), round.name);
        assert.match(await compact(tab, '#mystery-screen'), /Tajemná otázka · 13\. 11\. 2026/);
        await tab.waitForSelector('[data-mystery-community]');
        assert.equal(await tab.$$eval('[data-mystery-clue]:not([data-locked])', items => items.length), 8, 'včera: všechny nápovědy');
        assert.ok(db.calls.some(call => call.name === 'mystery_stats' && call.body.for_day === TODAY));
        await tab.click('#mystery-screen [data-action="mystery-dismiss"]');
        await tab.waitForSelector('#mystery-screen');
        await tab.waitForFunction(day => document.querySelector('#mystery-screen') && /Tajemná otázka dne · 14\. 11\. 2026/.test(document.querySelector('#mystery-screen').textContent), TOMORROW, { timeout: 30000 });
        await tab.click('[data-action="mystery-home"]');
        await tab.waitForSelector('#mystery-card[data-mystery-kind="today"]');
        assert.equal(await compact(tab, '#mystery-card [data-mystery-text]'), 'Nápověda 4/8 · další v 10:00');
        assert.equal((await store(tab)).days[TODAY].dismissed, true);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('druhý den skrytí křížkem přímo na úvodu (360×640, tmavý režim)', async () => {
        const solved = M.addTip(M.newEntry({ topic: 'zemepis', q: 'Q4242', name: 'Testovací hora' }), { text: 'Testovací hora', correct: true, clues: 3, at: prague('7:05').getTime() });
        const { context, tab, log } = await open(browser, { 'mudrlant.mystery': JSON.stringify({ days: { [TODAY]: { ...solved, xp: 26 } }, rounds: {} }) }, { colorScheme: 'dark', time: prague('8:00', TOMORROW) });
        assert.equal(await compact(tab, '#mystery-card'), 'Včerejší tajemná otázka Odpověď: Testovací hora');
        await fitsScreen(tab, 'úvod se včerejší odpovědí (360×640, tmavý)');
        await audit(tab, 'úvod se včerejší odpovědí (360×640, tmavý)');
        await shot(tab, 'vcerejsi-odpoved-tmavy-360x640');
        await tab.click('[data-action="mystery-dismiss"]');
        await tab.waitForSelector('#mystery-card[data-mystery-kind="today"]');
        assert.equal(await compact(tab, '#mystery-card [data-mystery-text]'), 'Nápověda 4/8 · další v 10:00');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('starší databáze bez funkcí: hraje se v zařízení, výsledky ostatních nejsou k dispozici', async () => {
        const db = { ...newDb(), missing: true };
        const { context, tab, log } = await open(browser, login('tok-u1'), { db, time: prague('14:30') });
        await openScreen(tab);
        const round = await roundOf(tab);
        await typeTip(tab, 'Atlantida');
        await tab.waitForSelector('[data-mystery-notice]');
        await typeTip(tab, round.name);
        await tab.waitForSelector('#mystery-screen[data-mystery-status="solved"]');
        assert.match(await compact(tab, '[data-mystery-summary]'), /^Vyřešeno v 14:30 s 7 nápovědami · 3 body$/);
        await tab.waitForFunction(() => /nejsou k dispozici/.test(document.querySelector('#mystery-stats').textContent));
        assert.deepEqual(db.calls.map(call => call.name), ['mystery_state'], 'po 404 se na server už neptá');
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
