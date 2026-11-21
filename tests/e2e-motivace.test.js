// Motivace (blok 32) v prohlížeči s falešným Supabase v paměti: pruh tematického víkendu na úvodu (a čip na nízkém displeji), 2× XP
// za otázku z tématu víkendu, prestiž po úrovni 100 (vysvětlení, potvrzení, ★ u úrovně), Pozvi kamarády (karta, okno, vyzvednutí
// odměn), reakce a vítězné efekty (výběr a náhled), vitrína s odměnami ze Sezóny, zašedlá sezónní postavička měsíce ve výběru obrázku
// a vlastní barva obleku od úrovně 20 (zamčená, posuvníky, přebarvená sova jako blob:). 390×780 i 360×640, světlý i tmavý režim,
// bez posouvání stránky a bez chyb CSP. SCREENSHOT_DIR=adresář uloží snímky. Potřebuje Playwright, jinak se přeskočí.
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
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
// Sobota tematického víkendu (Víkend filmu, weekend.js) a všední den
const WEEKEND = new Date('2026-11-21T11:00:00Z');
const WEEKDAY = new Date('2026-11-18T11:00:00Z');

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const login = () => ({ 'mudrlant.auth': JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'x@example.com', name: 'Jana Nováková' } }) });
const newDb = (over = {}) => ({
    profile: { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', frame: null, title_pref: null, owl: null, xp: 30000, badges: [], rating: 1200, rated_games: 3, prestige: 0, prestige_xp: 0, victory_fx: null, showcase: [], rewards: null },
    referral: { code: 'ABCD2345', inviter: null, games: 5, join_until: null, qualified: 1, claimed: [], ready: ['pritel-1'],
        invited: [{ id: 'u-2', display_name: 'Petr Svoboda', avatar: '🐼', color: 'sky', games: 4, qualified: true }, { id: 'u-3', display_name: 'Eva Malá', avatar: '🐸', color: 'rose', games: 1, qualified: false }] },
    calls: [], ...over
});
const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const method = request.method();
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        if (rpc) {
            db.calls.push(rpc[1]);
            if (rpc[1] === 'schema_version') return json(REQUIRED_SCHEMA);
            if (rpc[1] === 'referral_status') return json(db.referral);
            if (rpc[1] === 'referral_claim') { const got = db.referral.ready; db.referral = { ...db.referral, claimed: [...db.referral.claimed, ...got], ready: [] }; return json(got); }
            if (rpc[1] === 'prestige_up') {
                if (db.profile.xp < 330000) return json({ code: 'P0001', message: 'Do prestiže ještě chybí XP.' }, 400);
                db.profile = { ...db.profile, prestige: 1, prestige_xp: db.profile.xp };
                return json({ prestige: 1, prestige_xp: db.profile.xp });
            }
            if (rpc[1] === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (rpc[1] === 'league_seasons') return json({ month: '2026-11', seasons: [], best: null });
            return json([]);
        }
        if (url.pathname === '/rest/v1/profiles') {
            if (method === 'PATCH') {
                db.calls.push(`patch:${Object.keys(body).join(',')}`);
                if (body.xp !== undefined) body.xp = Math.max(db.profile.xp, body.xp);
                db.profile = { ...db.profile, ...body };
                return json([db.profile]);
            }
            return json([db.profile]);
        }
        return json([]);
    });
};
const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, colorScheme = 'light', now = WEEKDAY, db = null, reducedMotion = 'no-preference' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, reducedMotion });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => (key.startsWith('session:') ? sessionStorage.setItem(key.slice(8), value) : localStorage.setItem(key, value)));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.tips': JSON.stringify({ off: true }), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route(`${ORIGIN}/**`, route => route.fulfill(serveFile(new URL(route.request().url()).pathname)));
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN || url.hostname === 'proj.supabase.co') return route.fallback();
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
        return route.abort();
    });
    // Falešný Supabase až nakonec: pozdější pravidlo má přednost (i před config.js z ORIGIN)
    if (db) await backend(context, db);
    await tab.clock.setFixedTime(now);
    return { context, tab, log };
};
const progress = (xp, badges = {}) => ({ 'mudrlant.progress': JSON.stringify({ xp, counters: {}, badges }) });
const waitForHome = (tab) => nav.waitForHome(tab);
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
// Stránka se neposouvá (ani do strany); obsah úvodu se vejde do plochy
const fits = (tab) => tab.evaluate(() => ({
    page: document.scrollingElement.scrollHeight - window.innerHeight, wide: document.scrollingElement.scrollWidth - window.innerWidth,
    content: (() => { const c = document.getElementById('app-content'); return c ? c.scrollHeight - c.clientHeight : 0; })()
}));
const visible = (tab, selector) => tab.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(el).display !== 'none'; }, selector);

test('motivace: tematický víkend, prestiž, pozvi kamarády, reakce a efekty, vitrína se Sezónou, sezónní postavička, vlastní barva obleku', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('tematický víkend: pruh (nebo čip, když se nevejde) na záložce Dnes, štítek 2× XP na záložce Hrát; bez posouvání', async () => {
        for (const [viewport, colorScheme, name] of [[{ width: 390, height: 780 }, 'light', 'vikend-390'], [{ width: 360, height: 640 }, 'light', 'vikend-360'], [{ width: 360, height: 640 }, 'dark', 'vikend-360-tmavy']]) {
            const { context, tab, log } = await setup(browser, progress(3000), { viewport, colorScheme, now: WEEKEND });
            await tab.goto(`${ORIGIN}/`);
            await waitForHome(tab);
            await tab.waitForTimeout(400);
            // Záložka Dnes: víkend je mezi příležitostnými pruhy, a to právě jednou: jako pruh, když se vejde (390×780 vždy), jinak jako čip
            assert.equal(await tab.locator('#dnes-extras [data-action="weekend-play"]').count(), 1, 'víkend je na záložce Dnes právě jednou');
            if (viewport.height > 700) assert.equal(await visible(tab, '#weekend-banner'), true, 'na 390×780 jako pruh');
            const label = await tab.getAttribute('#dnes-extras #weekend-banner, #dnes-extras #weekend-chip', 'aria-label');
            assert.match(label, /Víkend filmu: do neděle 24:00 dvojnásobek XP za otázky z tématu Film/);
            let size = await fits(tab);
            assert.ok(size.page <= 0 && size.wide <= 0 && size.content <= 0, `${name}: ${JSON.stringify(size)}`);
            await shot(tab, name);
            // Záložka Hrát: štítek 2× XP na dlaždici Filmu
            await nav.go(tab, 'hrat');
            assert.equal(await tab.locator('[data-action="play-topic"][data-topic="film"] [data-weekend-tile]').count(), 1, 'štítek na dlaždici Filmu');
            assert.equal(await tab.locator('[data-weekend-tile]').count(), 1);
            size = await fits(tab);
            assert.ok(size.page <= 0 && size.wide <= 0 && size.content <= 0, `${name} (Hrát): ${JSON.stringify(size)}`);
            await shot(tab, `${name}-hrat`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
        // Všední den: nic
        const { context, tab } = await setup(browser, progress(3000), { now: WEEKDAY });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        assert.equal(await tab.locator('#weekend-banner, #weekend-chip, [data-weekend-tile]').count(), 0);
        await nav.go(tab, 'hrat');
        assert.equal(await tab.locator('[data-weekend-tile]').count(), 0);
        await context.close();
    });

    await t.test('2× XP za otázku z tématu víkendu (řádek v rozpisu XP)', async () => {
        const { context, tab, log } = await setup(browser, progress(3000), { now: WEEKEND });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.locator('[data-action="weekend-play"]:visible').first().click();
        // Téma Film (Co hrát: rovnou hra, nebo nejdřív okno s kategoriemi)
        await tab.waitForSelector('[data-action="choice"], #chooser-overlay [data-action="chooser-play"], [data-chooser-play]', { timeout: 30000 });
        if (!(await tab.locator('[data-action="choice"]').count())) await tab.locator('[data-action="chooser-play"], [data-chooser-play]').first().click();
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        const before = JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.progress'))).xp;
        await tab.locator('[data-action="choice"]').first().click();
        await tab.waitForFunction(() => document.getElementById('app-content').textContent.includes('Víkend filmu: dvojnásobek XP'), null, { timeout: 15000 });
        const after = JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.progress'))).xp;
        assert.ok(after - before >= 4, `odpověď (i špatná za 2 XP) se zdvojnásobí: ${after - before}`);
        await shot(tab, 'vikend-xp');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('prestiž: na úrovni 100 vysvětlení a potvrzení, pak ★1 a úroveň znovu od 1 (host)', async () => {
        const { context, tab, log } = await setup(browser, progress(335000), { viewport: { width: 360, height: 640 } });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('#status-text');
        await tab.waitForSelector('[data-prestige-ready]');
        await tab.click('[data-open-levels]');
        await tab.waitForSelector('[data-prestige-panel] [data-prestige-go]');
        assert.match(await tab.textContent('[data-prestige-panel]'), /Nic neztratíš/);
        await shot(tab, 'prestiz-nabidka');
        await tab.click('[data-prestige-go]');
        await tab.waitForSelector('[data-prestige-confirm]');
        await shot(tab, 'prestiz-potvrzeni');
        await tab.click('[data-prestige-confirm-go]');
        // V hlavičce místo „★1“ medailon prestiže (bronz) a úroveň znovu od 1; hlavička se vejde do 360 px
        await tab.waitForSelector('#status-text [data-prestige-medal="1"][data-prestige-tier="1"][aria-label="Prestiž 1"]');
        assert.match(await tab.textContent('#status-text'), /^\s*Mudrlant\s*Úr\. 1 · Mudrlant/, 'úroveň znovu od 1, titul Mudrlant zůstává');
        assert.deepEqual(await tab.evaluate(() => { const header = document.getElementById('app-header'); return [header.scrollWidth - header.clientWidth, document.documentElement.scrollWidth - window.innerWidth]; }), [0, 0], 'hlavička se vejde');
        assert.deepEqual(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.prestige'))), { n: 1, at: 335000 });
        // Úrovně a tituly: velký medailon v kartě prestiže
        await tab.waitForSelector('#dialog-overlay [data-prestige-panel] [data-prestige-medal="1"]');
        await tab.waitForTimeout(600);
        await shot(tab, 'prestiz-hotovo');
        // Po zavření okna oslava s medailonem a větou o novém medailonu
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#celebration [data-prestige-medal="1"]');
        assert.match(await tab.textContent('#celebration'), /Prestiž ★1.*Nový medailon prestiže: Bronz\./s);
        await tab.waitForTimeout(700);
        await shot(tab, 'prestiz-oslava');
        await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
        await shot(tab, 'prestiz-hlavicka-360');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('prestiž na zkoušku ve vývojářském režimu: přihlášený hráč s 30 000 XP, prestiž jen v zařízení (bez prestige_up), Vrátit můj postup ji zruší', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, { ...login(), ...progress(30000), 'mudrlant.dev': '1' }, { db, viewport: { width: 360, height: 640 } });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await nav.settings(tab);
        await tab.click('[data-dev="prestige"]');
        await tab.waitForSelector('[data-prestige-panel] [data-prestige-go]');
        await tab.click('[data-prestige-go]');
        await tab.waitForSelector('[data-prestige-confirm]');
        await tab.click('[data-prestige-confirm-go]');
        await tab.waitForSelector('#status-text [data-prestige-medal="1"]');
        // Můj obrázek v hlavičce dostane medailon podle prestiže v zařízení (na zkoušku ji server nezná)
        await tab.waitForSelector('#btn-settings [data-prestige-badge="1"]');
        assert.ok(!db.calls.includes('prestige_up'), 'na zkoušku se server neptá');
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.prestige'))).n, 1);
        await shot(tab, 'prestiz-na-zkousku');
        // Vrátit můj postup: prestiž i XP jako předtím
        await tab.evaluate(() => { const overlay = document.getElementById('dialog-overlay'); if (overlay) overlay.remove(); document.querySelectorAll('.celebration-overlay, #celebration-overlay').forEach(node => node.remove()); });
        await nav.settings(tab);
        await tab.click('[data-dev="restore"]');
        await tab.waitForFunction(() => localStorage.getItem('mudrlant.prestige') === null);
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.progress'))).xp, 30000);
        assert.doesNotMatch(await tab.textContent('#status-text'), /★/);
        await tab.waitForFunction(() => !document.querySelector('#status-text [data-prestige-medal], #btn-settings [data-prestige-badge]'));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('Prestiž: náhled ve vývojářském režimu: ◀ ▶ mění stupeň v zařízení, medailon hned v hlavičce i u obrázku, Vrátit můj postup ho zruší', async () => {
        for (const colorScheme of ['light', 'dark']) {
            const db = newDb();
            const { context, tab, log } = await setup(browser, { ...login(), ...progress(30000), 'mudrlant.dev': '1' }, { db, colorScheme, viewport: { width: 360, height: 640 } });
            await tab.goto(`${ORIGIN}/`);
            await waitForHome(tab);
            await nav.settings(tab);
            await tab.click('[data-dev="pv:1"]');
            await tab.waitForSelector('#status-text [data-prestige-medal="1"]');
            await tab.waitForSelector('#btn-settings [data-prestige-badge="1"]');
            assert.equal(await tab.textContent('[data-dev-prestige-value]'), '1');
            await tab.click('[data-dev="pv:11"]');
            await tab.waitForSelector('#status-text [data-prestige-medal="11"][data-prestige-tier="10"][data-prestige-aura="1"]');
            // Tlačítka se po každém klepnutí vykreslí znovu: klepne se přímo v DOMu
            const press = (label) => tab.evaluate((text) => document.querySelector(`[data-dev-prestige] [aria-label="${text}"]`).click(), label);
            for (let i = 0; i < 9; i++) { // 11 → 21 … 91 → 99
                const before = await tab.textContent('[data-dev-prestige-value]');
                await press('O deset prestiží výš');
                await tab.waitForFunction((value) => document.querySelector('[data-dev-prestige-value]').textContent !== value, before);
            }
            await tab.waitForSelector('#status-text [data-prestige-medal="99"][data-prestige-aura="max"]');
            assert.ok(await tab.$('[data-dev-prestige] [aria-label="O prestiž výš"][disabled]'), 'nad 99 to nejde');
            assert.match(await tab.textContent('[data-dev-prestige] + p'), /Legendární · rozsvícení 48\/48/);
            for (const n of [5, 8, 10]) {
                await tab.evaluate((value) => { const button = document.querySelector('[data-dev-prestige] button'); button.dataset.dev = `pv:${value}`; button.click(); }, n);
                await tab.waitForSelector(`#btn-settings [data-prestige-badge="${n}"]`);
            }
            await tab.evaluate(() => document.querySelector('[data-dev-prestige]').scrollIntoView({ block: 'center' }));
            await shot(tab, `prestiz-nahled-${colorScheme}`);
            assert.ok(!db.calls.includes('prestige_up'), 'náhled se serveru neptá');
            await tab.click('[data-dev="restore"]');
            await tab.waitForFunction(() => localStorage.getItem('mudrlant.prestige') === null && !document.querySelector('#status-text [data-prestige-medal], #btn-settings [data-prestige-badge]'));
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });

    await t.test('pozvi kamarády: karta v okně Přátelé a řádek na záložce Já, okno s kódem a odměnami, vyzvednutí (rámeček a XP)', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, { ...login(), ...progress(30000), }, { db, viewport: { width: 360, height: 640 } });
        await tab.goto(`${ORIGIN}/`);
        // Karta Pozvi kamarády je dole v okně Přátelé (záložka Soupeři, tlačítko + v pásu přátel) …
        await nav.waitForHome(tab);
        await nav.go(tab, 'souperi');
        await tab.click('[data-friends-add]');
        await tab.waitForSelector('#friends-dialog #referral-card', { timeout: 30000 });
        assert.match(await tab.textContent('#referral-card'), /Pozvi kamarády[\s\S]*Čeká 1 odměna/);
        assert.equal(await tab.evaluate(() => { const panel = document.querySelector('#dialog-overlay > div'); return panel.scrollWidth <= panel.clientWidth && panel.getBoundingClientRect().bottom <= window.innerHeight; }), true, 'okno Přátelé se vejde');
        await shot(tab, 'pozvi-pratele');
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
        // … a jako řádek na záložce Já
        await nav.go(tab, 'ja');
        assert.match(await tab.textContent('[data-ja="referral"]'), /Pozvi kamarády[\s\S]*Čeká odměna za pozvání/);
        await tab.click('[data-ja="referral"]');
        await tab.waitForSelector('[data-referral-dialog]');
        assert.match(await tab.textContent('[data-referral-code]'), /ABCD-2345/);
        await shot(tab, 'pozvi-okno');
        await tab.click('[data-referral-claim]');
        await tab.waitForFunction(() => !document.querySelector('[data-referral-claim]'));
        assert.ok(db.calls.includes('referral_claim'));
        assert.deepEqual(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.perks'))).referral, ['pritel-1']);
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.progress'))).xp, 30300);
        await shot(tab, 'pozvi-vyzvednuto');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('odkaz ?pritel= bez přihlášení: okno s pozvánkou', async () => {
        const { context, tab, log } = await setup(browser, progress(0), { db: newDb() });
        await tab.goto(`${ORIGIN}/?pritel=abcd-2345`);
        await tab.waitForSelector('[data-referral-welcome]', { timeout: 30000 });
        assert.deepEqual(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.referral'))).code, 'ABCD2345');
        assert.doesNotMatch(await tab.evaluate(() => location.search), /pritel/);
        await shot(tab, 'pozvi-odkaz');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('reakce a vítězné efekty: přehled, výběr efektu (uloží se) a náhled animace', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, { ...login(), ...progress(30000) }, { db, viewport: { width: 360, height: 640 } });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'reactions-info'; b.id = 'perks-test'; document.getElementById('app-content').appendChild(b); });
        await tab.evaluate(() => document.getElementById('perks-test').click());
        await tab.waitForSelector('[data-perks-dialog]');
        assert.equal(await tab.getAttribute('[data-perk-reaction="🧠"]', 'data-unlocked'), 'true', 'úroveň 30');
        assert.equal(await tab.getAttribute('[data-perk-reaction="🙌"]', 'data-unlocked'), 'false');
        await tab.waitForSelector('[data-fx-pick="hvezdy"]:not([disabled])');
        await shot(tab, 'reakce-efekty');
        await tab.click('[data-fx-pick="hvezdy"]');
        await tab.waitForSelector('[data-victory-fx="hvezdy"]');
        assert.equal(db.profile.victory_fx, 'hvezdy');
        await tab.waitForTimeout(900);
        await shot(tab, 'vitezny-efekt');
        const size = await fits(tab);
        assert.ok(size.page <= 0 && size.wide <= 0, JSON.stringify(size));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('vitrína: odměny ze Sezóny jdou vystavit (titul Šampion sezóny)', async () => {
        const db = newDb();
        const rewards = { v: 1, gifts: { titles: ['sampion-sezony'], frames: ['sezona-11'], avatars: ['caj'] } };
        const { context, tab, log } = await setup(browser, { ...login(), ...progress(30000), 'mudrlant.rewards': JSON.stringify(rewards) }, { db });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await nav.settings(tab);
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('[data-open-showcase]', { timeout: 15000 });
        await tab.click('[data-open-showcase]');
        await tab.click('[data-showcase-go="season-items"]');
        await tab.waitForSelector('[data-showcase-toggle="t:sampion-sezony"]');
        assert.equal(await tab.locator('[data-showcase-toggle^="s:"]').count(), 2);
        await tab.click('[data-showcase-toggle="t:sampion-sezony"]');
        await tab.waitForFunction(() => document.querySelector('[data-showcase-toggle="t:sampion-sezony"]').getAttribute('aria-pressed') === 'true');
        await tab.waitForFunction(() => !document.querySelector('[data-showcase-toggle][disabled]'));
        assert.deepEqual(db.profile.showcase, ['t:sampion-sezony']);
        await shot(tab, 'vitrina-sezona');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('výběr obrázku: postavička letošní sezóny (listopad: Hrnek čaje) zašedlá s textem, jak ji získat', async () => {
        const { context, tab, log } = await setup(browser, { ...login(), ...progress(30000) }, { db: newDb(), viewport: { width: 360, height: 640 } });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await nav.settings(tab);
        await tab.click('[data-me-tab="profile"]');
        await tab.click('[data-pic-group="postavicky"]');
        await tab.waitForSelector('[data-locked-avatar="caj"]', { state: 'attached' });
        await tab.evaluate(() => document.querySelector('[data-locked-avatar="caj"]').scrollIntoView({ block: 'center' }));
        assert.match(await tab.getAttribute('[data-locked-avatar="caj"]', 'aria-label'), /Hrnek čaje \(zamčeno\): Získáš v Sezóně Mudrlanta \(20\. stupeň\)/);
        assert.equal(await tab.locator('[data-locked-avatar="pernik"]').count(), 0, 'jiné měsíce ne');
        await tab.evaluate(() => document.querySelector('[data-locked-avatar="caj"]').click());
        await tab.waitForFunction(() => document.getElementById('settings-overlay').textContent.includes('Získáš v Sezóně Mudrlanta (20. stupeň)'));
        await shot(tab, 'postavicka-sezony');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('vlastní barva obleku: zamčená do úrovně 20, pak posuvníky a přebarvená sova (blob:) i v profilu', async () => {
        const locked = await setup(browser, progress(9000), { viewport: { width: 360, height: 640 } });
        await locked.tab.goto(`${ORIGIN}/`);
        await waitForHome(locked.tab);
        await nav.settings(locked.tab);
        await locked.tab.click('[data-me-tab="owl"]');
        await locked.tab.waitForSelector('[data-robe-custom][data-locked]');
        assert.match(await locked.tab.textContent('[data-robe-custom]'), /Od 20\. úrovně/);
        assert.equal(await locked.tab.locator('[data-robe-hue]').count(), 0);
        await shot(locked.tab, 'barva-obleku-zamcena');
        await locked.context.close();

        const db = newDb();
        const { context, tab, log } = await setup(browser, { ...login(), ...progress(30000), 'mudrlant.owl-avatar': 'true' }, { db, viewport: { width: 360, height: 640 } });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await nav.settings(tab);
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-robe-hue]');
        await tab.evaluate(() => { const range = document.querySelector('[data-robe-hue]'); range.value = '210'; range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new Event('change', { bubbles: true })); });
        await tab.waitForSelector('[data-robe-pick="vlastni"][aria-pressed="true"]');
        await tab.evaluate(() => { const range = document.querySelector('[data-robe-light]'); range.value = '-15'; range.dispatchEvent(new Event('change', { bubbles: true })); });
        const prefs = JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.look')));
        assert.deepEqual([prefs.robe, prefs.robeColor], ['vlastni', '210.-15']);
        // Sova v hlavičce aplikace se přebarví (blob:), původní obrázek zůstane v data-owl-base
        await tab.waitForFunction(() => [...document.querySelectorAll('img[data-owl-base]')].some(img => img.src.startsWith('blob:')), null, { timeout: 15000 });
        assert.equal(await tab.evaluate(() => document.documentElement.dataset.robe), 'vlastni');
        await tab.waitForTimeout(400);
        await shot(tab, 'barva-obleku');
        const size = await fits(tab);
        assert.ok(size.page <= 0 && size.wide <= 0, JSON.stringify(size));
        // Přepnutí zpět na zelený talár vrátí předpřipravený obrázek
        await tab.click('[data-robe-pick="zelena"]');
        await tab.waitForFunction(() => ![...document.querySelectorAll('img')].some(img => img.src.startsWith('blob:') && !img.hasAttribute('data-robe-color')));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('cizí sova s vlastní barvou se přebarví i v tmavém režimu (data-robe-color)', async () => {
        const { context, tab, log } = await setup(browser, progress(500), { colorScheme: 'dark' });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.evaluate(() => { document.getElementById('app-content').insertAdjacentHTML('afterbegin', `<div id="cizi" class="h-24 w-24">${window.MudrlantOwl.owlAvatarHtml('robe=vlastni;robec=95.10;head=koruna.modra')}</div>`); });
        await tab.waitForFunction(() => { const img = document.querySelector('#cizi img[data-robe-color]'); return img && img.src.startsWith('blob:'); }, null, { timeout: 15000 });
        await tab.locator('#cizi').screenshot(SHOTS ? { path: path.join(SHOTS, 'cizi-sova.png') } : {});
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
