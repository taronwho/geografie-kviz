// Rozpis otázek po výzvě (schéma 10) a průběžné body v záhlaví otázky, v prohlížeči s falešným Supabase v paměti (jako tests/e2e-challenge-flow.test.js).
// Výzva: s každou odpovědí jdou na server i podrobnosti (text odpovědi, nápovědy, čas); čip „N b“ v záhlaví otázky se po odpovědi zvýší a záhlaví
// se na 360×640 nezalomí; po dohrání obou hráčů nabídne výsledek i okno výzvy „Rozpis otázek“ (otázky ze semínka, oba hráči vedle sebe,
// klepnutí na otázku otevře popis položky); dokud soupeř nedohraje, tlačítko není; starší odpovědi bez podrobností a starší databáze dostanou
// poznámku. Trénink má čip také. CSP bez chyb; snímky (SCREENSHOT_DIR) 360×640 i 390×780, světlý i tmavý vzhled. Bez Playwrightu se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const UID1 = '00000000-0000-0000-0000-000000000001';
const UID2 = '00000000-0000-0000-0000-000000000002';
const USERS = { 'tok-u1': { id: UID1, name: 'Jana Nováková' }, 'tok-u2': { id: UID2, name: 'Petr Svoboda' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true, ...extra });

const newDb = () => ({
    log: [], calls: [],
    profiles: { [UID1]: player(UID1, 'Jana Nováková', '🦊', { color: 'emerald' }), [UID2]: player(UID2, 'Petr Svoboda', '🐼') },
    challenges: {}, results: [], progress: [],
    // detailsMissing = databáze bez schématu 10 (sloupce a funkce rozpisu chybí)
    detailsMissing: false
});

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        const method = request.method();
        if (url.pathname.startsWith('/auth/')) return json({});
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        if (!me) return json({ message: 'no token' }, 401);
        db.log.push(`${method} ${url.pathname}`);
        const param = (name) => url.searchParams.get(name) || '';
        const eq = (name) => param(name).replace(/^eq\./, '');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        const challengeRow = (c) => ({ ...c, creator: profile(c.creator_id), invited: c.invited_id ? profile(c.invited_id) : null });
        const finished = (code, uid) => db.results.some(r => r.challenge_id === code && r.user_id === uid);
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        if (rpc) {
            const name = rpc[1];
            db.calls.push({ name, body });
            if (name === 'schema_version') return json(db.detailsMissing ? REQUIRED_SCHEMA - 1 : REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'friends_list' || name === 'weekly_leaderboard') return json([]);
            if (name === 'challenge_progress_save') {
                // starší databáze: funkce s podrobnostmi neexistuje
                if (db.detailsMissing && ('answer' in body || 'hints' in body || 'ms' in body)) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                const c = db.challenges[body.code];
                if (!c || (c.invited_id && c.invited_id !== me.id && c.creator_id !== me.id)) return json({ code: '42501', message: 'Tuhle výzvu hrát nemůžeš.' }, 403);
                if (finished(body.code, me.id)) return json({ code: '22023', message: 'Výzvu už máš dohranou.' }, 400);
                const mine = db.progress.filter(r => r.challenge_id === body.code && r.user_id === me.id);
                const prev = mine.find(r => r.idx === body.idx);
                if (prev) return prev.correct === body.correct && prev.points === body.points ? json(mine.length) : json({ code: '22023', message: 'Odpověď na tuhle otázku už je uložená, přepsat ji nejde.' }, 400);
                if (body.idx !== mine.length) return json({ code: '22023', message: 'Nejdřív se musí uložit předchozí otázky.' }, 400);
                if (body.hints !== undefined && body.hints !== null && (body.hints < 0 || body.hints > 4)) return json({ code: '22023', message: 'Neplatný počet nápověd.' }, 400);
                db.progress.push({ challenge_id: body.code, user_id: me.id, idx: body.idx, correct: body.correct, points: body.points, answer: body.answer ?? null, hints: body.hints ?? null, ms: body.ms ?? null });
                return json(mine.length + 1);
            }
            // Jako challenge_details: jen hráč s vlastním výsledkem; cizí odpovědi jen hráčů, kteří dohráli
            if (name === 'challenge_details') {
                if (db.detailsMissing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                if (!finished(body.code, me.id)) return json({ code: '42501', message: 'Rozpis otázek uvidíš, až výzvu dohraješ.' }, 403);
                return json(db.progress.filter(r => r.challenge_id === body.code && (r.user_id === me.id || finished(body.code, r.user_id))).map(({ challenge_id, ...rest }) => rest));
            }
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        if (url.pathname === '/rest/v1/challenge_progress') {
            if (db.detailsMissing && /answer/.test(param('select'))) return json({ code: '42703', message: 'column challenge_progress.answer does not exist' }, 400);
            return json(db.progress.filter(r => r.challenge_id === eq('challenge_id') && r.user_id === me.id).sort((a, b) => a.idx - b.idx).map(({ challenge_id, user_id, ...rest }) => rest));
        }
        if (/^\/rest\/v1\/tournament/.test(url.pathname)) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
        const table = url.pathname.replace('/rest/v1/', '');
        if (table === 'profiles') {
            if (method === 'PATCH') { Object.assign(db.profiles[eq('id')], body); return route.fulfill({ status: 204, body: '' }); }
            return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        }
        if (table === 'challenges') {
            if (method === 'POST') { db.challenges[body.id] = { ...body, created_at: new Date().toISOString() }; return json([db.challenges[body.id]], 201); }
            if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(challengeRow));
            if (param('id').startsWith('in.')) return json(param('id').slice(4, -1).split(',').map(id => db.challenges[id]).filter(Boolean).slice(0, 1));
            return json(db.challenges[eq('id')] ? [challengeRow(db.challenges[eq('id')])] : []);
        }
        if (table === 'challenge_results') {
            if (method === 'POST') {
                if (!finished(body.challenge_id, body.user_id)) {
                    const answered = db.progress.filter(r => r.challenge_id === body.challenge_id && r.user_id === body.user_id);
                    db.results.push({ ...body, correct: answered.filter(r => r.correct).length, points: answered.reduce((sum, r) => sum + r.points, 0), finished_at: new Date().toISOString() });
                }
                return route.fulfill({ status: 201, body: '' });
            }
            const withPlayer = (r) => ({ ...r, player: profile(r.user_id) });
            if (param('challenge_id').startsWith('in.') && param('user_id').startsWith('eq.')) { const ids = param('challenge_id').slice(4, -1).split(','); return json(db.results.filter(r => r.user_id === eq('user_id') && ids.includes(r.challenge_id))); }
            if (param('user_id').startsWith('eq.')) return json(db.results.filter(r => r.user_id === eq('user_id')).map(r => ({ ...r, challenge: challengeRow(db.challenges[r.challenge_id]) })));
            if (param('challenge_id').startsWith('in.')) { const ids = param('challenge_id').slice(4, -1).split(','); return json(db.results.filter(r => ids.includes(r.challenge_id) && r.user_id !== param('user_id').replace('neq.', '')).map(withPlayer)); }
            return json(db.results.filter(r => r.challenge_id === eq('challenge_id')).map(withPlayer));
        }
        return json([]);
    });
};

const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, colorScheme = 'light' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
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
    await tab.clock.setFixedTime(new Date('2026-11-04T10:00:00'));
    return { context, tab, log };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && content.querySelector('#home-tabs')); }, null, { timeout: 30000 });
const compact = async (tab, selector) => ((await tab.textContent(selector)) || '').replace(/\s+/g, ' ').trim();
// Snímek bez oslavy odznaku přes obrazovku (ta po chvíli zmizí sama)
const shot = async (tab, name) => {
    if (!SHOTS) return;
    await tab.waitForFunction(() => !document.getElementById('celebration'), null, { timeout: 10000 }).catch(() => {});
    await tab.waitForTimeout(300);
    await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const chipPoints = async (tab) => Number(((await tab.textContent('[data-score-chip]')) || '').replace(/\D+/g, ''));
// Záhlaví otázky: čip vlevo, štítek uprostřed bez zalomení a bez překryvu s čipem (a s časem, je-li)
const headerFits = (tab) => tab.evaluate(() => {
    const chip = document.querySelector('[data-score-chip]');
    const label = chip.parentElement.querySelector(':scope > span.inline-flex:not([data-score-chip]):not(.absolute)');
    const timer = document.querySelector('[data-tour-timer]');
    const a = chip.getBoundingClientRect();
    const b = label.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(label).lineHeight) || 15;
    return { overlap: a.right > b.left - 1 || (timer ? timer.parentElement.getBoundingClientRect().left < b.right + 1 : false), wrapped: b.height > lineHeight * 1.9 + 8, chipWrapped: a.height > 26 };
});
// Odpověď na otázku: hint = nejdřív nápověda, giveUp = Nevím; vrátí text zvolené možnosti
const answer = async (tab, { giveUp = false, hint = false, correct = false } = {}) => {
    await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
    if (hint && await tab.locator('[data-action="hint"]').count()) await tab.click('[data-action="hint"]');
    if (giveUp) { await tab.click('[data-action="give-up"]'); await tab.waitForSelector('[data-action="next"]'); return 'Nevím'; }
    const index = correct ? await tab.$$eval('[data-action="choice"]', (buttons) => buttons.findIndex(button => button.dataset.correct === 'true' || button.dataset.correct === '1')) : 0;
    const target = tab.locator('[data-action="choice"]').nth(Math.max(0, index));
    const text = ((await target.textContent()) || '').replace(/\s+/g, ' ').trim();
    await target.click();
    await tab.waitForSelector('[data-action="next"]');
    return text;
};

test('Rozpis otázek po výzvě a průběžné body', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, token, options = {}) => {
        const page = await setup(browser, login(token), options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await waitForHome(page.tab);
        return page;
    };
    // Jana výzvu dohrála dřív (s podrobnostmi u dvou otázek a jednou starší odpovědí bez nich)
    const seeded = (db, code = 'RRRRRR', { legacy = false } = {}) => {
        db.challenges[code] = { id: code, creator_id: UID1, invited_id: UID2, topic: 'zemepis', count: 5, seed: `rozpis-${code}`, include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-04T09:00:00Z' };
        const rows = [
            { correct: true, points: 4, answer: 'Praha', hints: 0, ms: 4200 },
            { correct: false, points: 0, answer: 'Velmi dlouhá odpověď, která se do buňky nevejde celá a musí se zkrátit', hints: 2, ms: 61000 },
            { correct: true, points: 2, answer: 'Lima', hints: 2, ms: 15000 },
            { correct: false, points: 0, answer: 'Nevím', hints: 4, ms: 9000 },
            { correct: true, points: 3, answer: null, hints: null, ms: null }
        ];
        rows.forEach((row, idx) => db.progress.push({ challenge_id: code, user_id: UID1, idx, ...(legacy ? { correct: row.correct, points: row.points, answer: null, hints: null, ms: null } : row) }));
        db.results.push({ challenge_id: code, user_id: UID1, correct: 3, points: 9, finished_at: '2026-11-04T09:10:00Z' });
    };

    await t.test('výzva: čip s body, podrobnosti odpovědí na server a Rozpis otázek po dohrání obou', async () => {
        for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark']]) {
            const size = `${viewport.width}x${viewport.height}-${colorScheme}`;
            const db = newDb();
            seeded(db);
            const { context, tab, log } = await start(db, 'tok-u2', { viewport, colorScheme });
            await tab.click('[data-action="challenge-open"][data-code="RRRRRR"]');
            await tab.click('[data-ch-play]');
            await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
            // první otázka: 0 b, záhlaví se vejde
            assert.equal(await chipPoints(tab), 0);
            const fits = await headerFits(tab);
            assert.deepEqual(fits, { overlap: false, wrapped: false, chipWrapped: false }, `záhlaví ${size}`);
            await shot(tab, `vyzva-body-otazka-${size}`);
            const picked = [];
            let total = 0;
            for (let i = 0; i < 5; i++) {
                if (i > 0) assert.equal(await chipPoints(tab), total, `čip před otázkou ${i + 1}`);
                if (i === 4) { assert.deepEqual(await headerFits(tab), { overlap: false, wrapped: false, chipWrapped: false }); await shot(tab, `vyzva-body-otazka5-${size}`); }
                picked.push(await answer(tab, { hint: i === 1, giveUp: i === 3 }));
                const progressRow = db.progress.find(r => r.challenge_id === 'RRRRRR' && r.user_id === UID2 && r.idx === i);
                await tab.waitForFunction(() => document.querySelector('[data-score-total]') !== null);
                if (i === 0) await shot(tab, `vyzva-body-vysledek-${size}`);
                total = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).challenge.results.reduce((sum, row) => sum + (row ? row.points : 0), 0));
                assert.match(await compact(tab, '[data-score-total]'), new RegExp(`Celkem ve hře: ${total} `), 'součet ve výsledku otázky');
                if (progressRow) assert.ok(typeof progressRow.ms === 'number' && progressRow.ms >= 0, 'čas odpovědi');
                await tab.click('[data-action="next"]');
            }
            await tab.waitForSelector('[data-action="challenge-breakdown"]', { timeout: 30000 });
            // podrobnosti odpovědí jsou na serveru
            const mine = db.progress.filter(r => r.challenge_id === 'RRRRRR' && r.user_id === UID2).sort((a, b) => a.idx - b.idx);
            assert.equal(mine.length, 5);
            assert.deepEqual(mine.map(r => r.answer), picked.map(text => text.slice(0, 120)));
            assert.equal(mine[3].answer, 'Nevím');
            assert.ok(mine.every(r => Number.isInteger(r.hints) && r.hints >= 0 && r.hints <= 4));
            assert.ok(mine[1].hints >= mine[0].hints, 'nápověda u druhé otázky');
            assert.ok(mine.every(r => Number.isInteger(r.ms) && r.ms >= 0 && r.ms <= 3600000));
            // Rozpis se po dohrání otevře sám: 5 řádků, dva sloupce (já a Jana), soupeřovy odpovědi ze serveru
            await tab.waitForSelector('#breakdown-list [data-bd-row]');
            assert.equal(await tab.locator('#breakdown-list [data-bd-row]').count(), 5);
            assert.equal(await tab.locator('#breakdown-list [data-bd-row="0"] [data-bd-cell]').count(), 2, 'oba hráči vedle sebe');
            const first = await compact(tab, '#breakdown-list [data-bd-row="0"]');
            assert.ok(first.includes(picked[0]), `moje odpověď: ${first}`);
            assert.match(first, /Praha/, 'Janina odpověď');
            assert.match(first, /4 b/);
            assert.match(await compact(tab, '#breakdown-list [data-bd-row="3"]'), /Nevím/);
            const titles = await tab.$$eval('#breakdown-list [data-bd-row] [data-bd-info] span.truncate', items => items.map(item => item.textContent.trim()));
            assert.equal(titles.length, 5, 'zadání otázek ze semínka');
            assert.ok(titles.every(text => text.length > 3), titles.join(' | '));
            // poslední Janina odpověď je starší (bez podrobností): poznámka
            assert.equal(await tab.locator('[data-bd-note]').count(), 1);
            assert.match(await compact(tab, '[data-bd-note]'), /starších odpovědí/);
            // řádky se vejdou na šířku a okno se posouvá samo (stránka ne)
            const widths = await tab.evaluate(() => ({ list: document.getElementById('breakdown-list').scrollWidth, box: document.getElementById('breakdown-list').clientWidth, page: document.documentElement.scrollWidth, view: window.innerWidth }));
            assert.ok(widths.list <= widths.box + 1 && widths.page <= widths.view, JSON.stringify(widths));
            await shot(tab, `rozpis-otazek-${size}`);
            // klepnutí na otázku: okno s popisem položky
            await tab.click('#breakdown-list [data-bd-row="0"] [data-bd-info]');
            await tab.waitForSelector('#place-info');
            await tab.click('#place-info [data-close]');
            assert.equal(await tab.locator('#dialog-overlay').count(), 1, 'rozpis zůstane otevřený');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });

    await t.test('okno výzvy: Rozpis jen po dohrání obou; starší odpovědi a starší databáze s poznámkou', async () => {
        // Jana výzvu založila a dohrála, Petr ještě ne: v okně výzvy rozpis není
        const db = newDb();
        seeded(db, 'CEKAMM');
        const page = await start(db, 'tok-u1');
        await page.tab.click('[data-action="challenge-open"][data-code="CEKAMM"]');
        await page.tab.waitForSelector('[data-ch-share]');
        assert.equal(await page.tab.locator('[data-ch-breakdown]').count(), 0, 'soupeř ještě nehrál');
        await page.context.close();

        // Oba dohráli (Janiny odpovědi bez podrobností): rozpis z okna výzvy, s poznámkou
        const both = newDb();
        seeded(both, 'DVAHRA', { legacy: true });
        for (let idx = 0; idx < 5; idx++) both.progress.push({ challenge_id: 'DVAHRA', user_id: UID2, idx, correct: idx % 2 === 0, points: idx % 2 === 0 ? 3 : 0, answer: idx % 2 === 0 ? 'Správná' : 'Špatná', hints: 1, ms: 8000 + idx });
        both.results.push({ challenge_id: 'DVAHRA', user_id: UID2, correct: 3, points: 9, finished_at: '2026-11-04T09:20:00Z' });
        for (const colorScheme of ['light', 'dark']) {
            const { context, tab, log } = await start(both, 'tok-u1', { viewport: { width: 360, height: 640 }, colorScheme });
            // klepnutí na název tématu (ne na obrázek soupeře, ten otevírá jeho profil)
            await tab.locator('[data-action="challenge-open"][data-code="DVAHRA"] span.truncate').first().click();
            await tab.click('[data-ch-breakdown]');
            await tab.waitForSelector('#breakdown-list [data-bd-row]');
            assert.equal(await tab.locator('#breakdown-list [data-bd-row]').count(), 5);
            assert.match(await compact(tab, '#breakdown-list [data-bd-row="0"]'), /Správná/);
            assert.match(await compact(tab, '[data-bd-note]'), /starších odpovědí/);
            await shot(tab, `rozpis-otazek-stare-360x640-${colorScheme}`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }

        // Starší databáze (schéma 9): odpovědi se uloží bez podrobností, rozpis ukáže jen moje odpovědi z tohoto zařízení
        const old = newDb();
        old.detailsMissing = true;
        seeded(old, 'STARAD', { legacy: true });
        const { context, tab, log } = await start(old, 'tok-u2');
        await tab.click('[data-action="challenge-open"][data-code="STARAD"]');
        await tab.click('[data-ch-play]');
        for (let i = 0; i < 5; i++) { await answer(tab); await tab.click('[data-action="next"]'); }
        await tab.waitForSelector('[data-action="challenge-breakdown"]', { timeout: 30000 });
        assert.equal(old.progress.filter(r => r.challenge_id === 'STARAD' && r.user_id === UID2).length, 5, 'průběh se uložil i bez podrobností');
        // Rozpis se otevře sám
        await tab.waitForSelector('#breakdown-list [data-bd-row]');
        assert.equal(await tab.locator('#breakdown-list [data-bd-row="0"] [data-bd-cell="none"]').count(), 1, 'soupeřovy odpovědi chybí (jen jeho součet v záhlaví)');
        assert.equal(await tab.locator('#breakdown-list [data-bd-row="0"] [data-bd-cell="ok"], #breakdown-list [data-bd-row="0"] [data-bd-cell="bad"]').count(), 1, 'moje odpověď ze zařízení');
        assert.match(await compact(tab, '#dialog-overlay'), /aktualizovat schéma/);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('trénink: čip s body v záhlaví otázky roste s odpověďmi', async () => {
        for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
            const db = newDb();
            const { context, tab, log } = await start(db, 'tok-u1', { viewport, colorScheme });
            await tab.click('#btn-practice');
            await tab.waitForSelector('[data-score-chip]', { timeout: 30000 });
            assert.equal(await chipPoints(tab), 0);
            assert.deepEqual(await headerFits(tab), { overlap: false, wrapped: false, chipWrapped: false });
            await shot(tab, `trenink-body-360x640-${colorScheme}`);
            let total = 0;
            for (let i = 0; i < 3; i++) {
                await answer(tab);
                total += await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).round.points);
                await tab.click('[data-action="next"]');
                await tab.waitForSelector('[data-score-chip]', { timeout: 30000 });
                assert.equal(await chipPoints(tab), total, `po ${i + 1}. odpovědi`);
            }
            await shot(tab, `trenink-body-po-3-360x640-${colorScheme}`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });
});
