// Přehled série Kvízu dne (quiz-streak.js) v prohlížeči s falešným Supabase: přihlášený hráč, který 19.–24. 11. hrál a „včera večer“ dohrál
// kvíz až 26. 11. v 0:14 (hlášení 26. 11. 2026) – karta Moje série ve výsledku, okno s kalendářem (25. 11. vynechaný, 26. 11. dohraný
// po půlnoci, úseky série), výběr dne, otevření z okna Série a ochrana série a návrat zpět; dny z jiného zařízení (účet) se počítají do série
// a ochrana nezabere zbytečně; skutečně vynechaný den ochrana zachrání a přehled ukáže, kdy. Host bez účtu. Okno se vejde bez posouvání
// na 360×640 i 390×780, světlý i tmavý režim, kontroly rozhraní jako tests/e2e-ui-audit.test.js. SCREENSHOT_DIR=… uloží snímky.
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const DQ = require('../daily-quiz.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const TODAY = '2026-11-26';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const SIZES = [{ width: 360, height: 640 }, { width: 390, height: 780 }];
const TITLE = 'Přehled série Kvízu dne';

const serveFile = (pathname) => {
    if (fixtures.files[pathname]) return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtures.files[pathname]) };
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const ME = 'u-1';
const login = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: ME, email: 'x@example.com', name: 'Jana Nováková' } }) };
// Řádek daily_quiz_results dohraný v pražském čase (listopad = UTC+1)
const row = (day, time = '20:30', extra = {}) => {
    const [h, m] = time.split(':').map(Number);
    const at = new Date(Date.parse(`${day}T00:00:00Z`) + ((h - 1) * 60 + m) * 60000).toISOString();
    return { user_id: ME, day, answered: 10, correct: 7, score: 24, time_ms: 90000, bitmap: 127, started_at: at, last_at: at, finished_at: at, ...extra };
};
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = DQ.addDays(d, 1)) out.push(d); return out; };

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        if ((request.headers().authorization || '') !== 'Bearer tok-u1') return json({ message: 'no token' }, 401);
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const mine = db.rows.filter(r => r.user_id === ME);
        const played = mine.filter(r => r.answered > 0 && (r.finished_at || r.day < TODAY)).map(r => r.day);
        if (rpc) {
            const name = rpc[1];
            db.log.push(name);
            if (name === 'schema_version') return json(REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'daily_quiz_state') {
                const r = mine.find(x => x.day === TODAY);
                return json({ day: TODAY, started: Boolean(r), answered: r ? r.answered : 0, correct: r ? r.correct : 0, score: r ? r.score : 0, time_ms: r ? r.time_ms : 0, bitmap: r ? r.bitmap : 0, finished: Boolean(r && r.finished_at), streak: DQ.streakOf(played, TODAY), best_streak: DQ.bestStreakOf(played) });
            }
            if (name === 'daily_quiz_board') return json({ day: TODAY, total: 1, top: [], me: null, streak: DQ.streakOf(played, TODAY), best_streak: DQ.bestStreakOf(played) });
            if (name === 'daily_quiz_friends') return json({ day: TODAY, friends: 0, rows: [] });
            if (name === 'friends_list' || name === 'weekly_leaderboard') return json([]);
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        const table = url.pathname.replace('/rest/v1/', '');
        if (table === 'daily_quiz_results') {
            db.history.push(url.search);
            if (db.historyFails) return json({ message: 'down' }, 503);
            const since = (url.searchParams.get('day') || '').replace(/^gte\./, '');
            return json(mine.filter(r => !since || r.day >= since).map(({ user_id, bitmap, ...rest }) => rest));
        }
        if (table === 'profiles') return json([{ id: ME, display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 1200, badges: [], rating: 1200, rated_games: 0, blocked_topics: [], accepts_mix: true }]);
        return json([]);
    });
};

const setup = async (browser, storage, { viewport = SIZES[0], colorScheme = 'light', db = null, time = `${TODAY}T19:00:00Z` } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, reducedMotion: 'reduce' });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify(db ? 'google' : 'host'), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) return route.fulfill(serveFile(url.pathname));
        if (url.hostname === 'proj.supabase.co') return db ? route.fallback() : route.fulfill({ json: url.pathname.startsWith('/auth/') ? {} : [] });
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    if (db) await backend(context, db);
    else await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await tab.clock.setFixedTime(new Date(time));
    await tab.goto(`${ORIGIN}/`);
    await tab.waitForSelector('#quiz-card', { timeout: 30000 });
    return { context, tab, log };
};
const compact = async (tab, selector) => ((await tab.textContent(selector)) || '').replace(/\s+/g, ' ').trim();
const dialogTitle = (tab) => tab.evaluate(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title || '');
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
// Okno se vejde bez posouvání (posuvný panel okna)
const fits = async (tab, what, tolerance = 0) => {
    const size = await tab.evaluate(() => { const panel = document.getElementById('dialog-overlay').firstElementChild; return { scroll: panel.scrollHeight, client: panel.clientHeight }; });
    assert.ok(size.scroll <= size.client + 1 + tolerance, `${what}: okno se posouvá (${size.scroll} > ${size.client})`);
};
const shot = async (tab, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
const openStreak = async (tab) => {
    await tab.click('#quiz-card');
    await tab.waitForSelector('[data-quiz-streak]', { timeout: 30000 });
    await tab.click('[data-quiz-streak]');
    await tab.waitForFunction(title => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === title, TITLE);
    await tab.waitForSelector('#dialog-overlay [data-qs-day]');
};

test('Přehled série Kvízu dne v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    for (const size of SIZES) for (const scheme of ['light', 'dark']) {
        await t.test(`hlášení 26. 11.: dohráno po půlnoci, 25. 11. vynechaný (${size.width}×${size.height}, ${scheme})`, async () => {
            const db = { log: [], history: [], rows: [...range('2026-11-19', '2026-11-24').map(day => row(day)), row(TODAY, '0:14')] };
            const { context, tab, log } = await setup(browser, login, { viewport: size, colorScheme: scheme, db });
            await openStreak(tab);
            assert.match(await compact(tab, '[data-quiz-streak]'), /1 den · nejlepší 6 dní/);
            await tab.waitForFunction(() => document.querySelector('[data-qs-day="2026-11-24"]').dataset.qsStatus === 'done');
            assert.equal(await compact(tab, '[data-qs-current]'), '1 den');
            assert.equal(await compact(tab, '[data-qs-best]'), '6 dní');
            assert.equal(await compact(tab, '[data-qs-freezes]'), '0 z 2');
            assert.equal(await tab.getAttribute('[data-qs-day="2026-11-25"]', 'data-qs-status'), 'missed');
            assert.equal(await tab.getAttribute('[data-qs-day="2026-11-24"]', 'data-qs-status'), 'done');
            assert.equal(await tab.getAttribute('[data-qs-day="2026-11-18"]', 'data-qs-status'), 'unknown');
            assert.equal(await tab.getAttribute(`[data-qs-day="${TODAY}"]`, 'data-qs-status'), 'done');
            assert.equal(await tab.$$eval('[data-qs-day]', cells => cells.length), 67);
            // Dnešek je vybraný: dohráno v 0:14, po půlnoci
            assert.match(await compact(tab, '[data-qs-detail]'), /^Dnes \(čt 26\. 11\.\): Dohráno v 0:14 \(po půlnoci, patří k tomuto dni, ne k předchozímu večeru\) · 7\/10 správně, 24 bodů · v účtu/);
            assert.match(await tab.getAttribute(`[data-qs-day="${TODAY}"]`, 'class'), /bg-amber-400/, 'současná série zlatě');
            assert.ok(db.history.some(search => /user_id=eq\.u-1/.test(search) && /day=gte\.2026-07-29/.test(search)), db.history.join(' | '));
            await fits(tab, `přehled ${size.width}×${size.height}`);
            await audit(tab, `přehled ${size.width}×${size.height} ${scheme}`);
            await shot(tab, `prehled-${size.width}x${size.height}-${scheme}`);
            // Klepnutí na 25. 11.: co se stalo
            await tab.click('[data-qs-day="2026-11-25"]');
            await tab.waitForFunction(() => document.querySelector('[data-qs-detail]').dataset.qsDetailDay === '2026-11-25');
            assert.match(await compact(tab, '[data-qs-detail]'), /^St 25\. 11\.: Kvíz dne nebyl odehraný, tady skončila série 6 dní \(19\. 11\. – 24\. 11\.\)/);
            assert.equal(await tab.getAttribute('[data-qs-day="2026-11-25"]', 'aria-pressed'), 'true');
            await tab.click('[data-qs-day="2026-11-24"]');
            await tab.waitForFunction(() => document.querySelector('[data-qs-detail]').dataset.qsDetailDay === '2026-11-24');
            assert.match(await compact(tab, '[data-qs-detail]'), /^Út 24\. 11\.: Dohráno v 20:30/);
            await fits(tab, `přehled po výběru dne ${size.width}×${size.height}`);
            if (scheme === 'light') await shot(tab, `prehled-vybrany-den-${size.width}x${size.height}`);
            // Z okna Série a ochrana série: tlačítko Přehled dnů a návrat zpět
            await tab.click('#dialog-overlay [data-close]');
            await tab.click('[data-action="quiz-home"]');
            await tab.waitForSelector('#streak-chip');
            await tab.click('#streak-chip');
            await tab.waitForSelector('[data-quiz-streak-open]');
            // Okno Série a ochrana série: na 360×640 stejná rezerva jako v tests/e2e-dialogs-fit.test.js (dlaždice Série je tlačítko, nic nepřidává)
            await fits(tab, `Série a ochrana série ${size.width}×${size.height}`, size.height < 700 ? 24 : 0);
            if (scheme === 'light') await shot(tab, `serie-a-ochrana-${size.width}x${size.height}`);
            await tab.click('[data-quiz-streak-open]');
            await tab.waitForFunction(title => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === title, TITLE);
            await tab.waitForSelector('#dialog-overlay [data-dialog-back]');
            await fits(tab, `přehled se Zpět ${size.width}×${size.height}`);
            await tab.click('#dialog-overlay [data-dialog-back]');
            await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Série a ochrana série');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('dvě zařízení: den odehraný jinde (v účtu) se počítá do série a ochrana nezabere zbytečně', async () => {
        // Toto zařízení zná 20.–24. 11., 25. 11. se hrálo na jiném zařízení (jen v účtu); ochrana 1
        const days = Object.fromEntries(range('2026-11-20', '2026-11-24').map(day => [day, { answered: 10, correct: 6, score: 20, time_ms: 80000, bitmap: 63, done: true, xp: true }]));
        const db = { log: [], history: [], rows: range('2026-11-20', '2026-11-25').map(day => row(day)) };
        const { context, tab, log } = await setup(browser, { ...login, 'mudrlant.dailyQuiz': JSON.stringify({ v: 1, days, attempt: null }), 'mudrlant.rewards': JSON.stringify({ v: 1, freezes: 1, freezesAt: 1 }) }, { db });
        await tab.waitForFunction(() => JSON.parse(localStorage.getItem('mudrlant.rewards') || '{}').checked === '2026-11-26', null, { timeout: 15000 });
        const rewards = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.rewards')));
        assert.equal(rewards.freezes, 1, 'ochrana zůstala');
        assert.deepEqual(rewards.frozenQuiz || [], []);
        await tab.waitForFunction(() => document.querySelector('#streak-chip').dataset.streak === '6');
        await tab.click('#streak-chip');
        await tab.click('[data-quiz-streak-open]');
        await tab.waitForSelector('[data-qs-day="2026-11-25"][data-qs-status="done"]');
        assert.equal(await compact(tab, '[data-qs-current]'), '6 dní');
        await tab.click('[data-qs-day="2026-11-25"]');
        await tab.waitForFunction(() => /· v účtu$/.test(document.querySelector('[data-qs-detail]').textContent.trim()));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('skutečně vynechaný den: ochrana zabere až po načtení účtu a přehled ukáže zachráněný den s časem', async () => {
        const db = { log: [], history: [], rows: range('2026-11-20', '2026-11-24').map(day => row(day)) };
        const { context, tab, log } = await setup(browser, { ...login, 'mudrlant.rewards': JSON.stringify({ v: 1, freezes: 1, freezesAt: 1 }) }, { db, time: `${TODAY}T07:05:00Z` });
        await tab.waitForFunction(() => (JSON.parse(localStorage.getItem('mudrlant.rewards') || '{}').frozenQuiz || []).includes('2026-11-25'), null, { timeout: 15000 });
        const freezeLog = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.freezeLog')));
        assert.equal(freezeLog[0].day, '2026-11-25');
        assert.equal(freezeLog[0].at, Date.parse(`${TODAY}T07:05:00Z`));
        await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
        await tab.click('#streak-chip');
        await tab.click('[data-quiz-streak-open]');
        await tab.waitForSelector('[data-qs-day="2026-11-25"][data-qs-status="saved"]');
        await tab.click('[data-qs-day="2026-11-25"]');
        await tab.waitForFunction(() => document.querySelector('[data-qs-detail]').dataset.qsDetailDay === '2026-11-25');
        assert.match(await compact(tab, '[data-qs-detail]'), /^St 25\. 11\.: Nehráno, sérii zachránila ochrana série \(použita 26\. 11\. v 8:05\)/);
        assert.equal(await compact(tab, '[data-qs-current]'), '5 dní');
        assert.equal(await tab.getAttribute(`[data-qs-day="${TODAY}"]`, 'data-qs-status'), 'today');
        await shot(tab, 'prehled-zachraneny-den-360x640');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('účet se nenačetl: dny bez záznamu v zařízení nejsou vynechané; host vidí jen zařízení', async () => {
        const days = { '2026-11-20': { answered: 10, correct: 6, score: 20, time_ms: 80000, bitmap: 63, done: true, xp: true, at: Date.parse('2026-11-20T18:10:00Z') } };
        const db = { log: [], history: [], rows: [], historyFails: true };
        const { context, tab, log } = await setup(browser, { ...login, 'mudrlant.dailyQuiz': JSON.stringify({ v: 1, days, attempt: null }) }, { db });
        await tab.click('#streak-chip');
        await tab.click('[data-quiz-streak-open]');
        await tab.waitForFunction(() => /nenačetly/.test(document.querySelector('[data-qs-note]').textContent));
        assert.equal(await tab.getAttribute('[data-qs-day="2026-11-22"]', 'data-qs-status'), 'unknown');
        await tab.click('[data-qs-day="2026-11-20"]');
        await tab.waitForFunction(() => document.querySelector('[data-qs-detail]').dataset.qsDetailDay === '2026-11-20');
        assert.match(await compact(tab, '[data-qs-detail]'), /Dohráno v 19:10 · 6\/10 správně, 20 bodů · jen v tomto zařízení/);
        await context.close();
        const guest = await setup(browser, { 'mudrlant.dailyQuiz': JSON.stringify({ v: 1, days, attempt: null }) }, { viewport: SIZES[1], colorScheme: 'dark' });
        await guest.tab.click('#streak-chip');
        await guest.tab.click('[data-quiz-streak-open]');
        await guest.tab.waitForSelector('[data-qs-day="2026-11-22"][data-qs-status="missed"]');
        assert.match(await compact(guest.tab, '[data-qs-note]'), /Ze záznamů v tomto zařízení\./);
        assert.equal(await guest.tab.getAttribute('[data-qs-day="2026-11-19"]', 'data-qs-status'), 'unknown');
        await fits(guest.tab, 'přehled hosta 390×780');
        await shot(guest.tab, 'prehled-host-390x780-dark');
        assert.deepEqual([...log.errors, ...guest.log.errors], []);
        await guest.context.close();
    });
});
