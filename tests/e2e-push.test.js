// Upozornění v prohlížeči (Nastavení → Hra): nabídka se bez klíče VAPID neukáže, zapnutí (souhlas, předplatné, uložení do falešné databáze),
// volby turnaje a výzev, vypnutí a odhlášení mažou odběr, klepnutí na upozornění (?tab=multi) otevře Více hráčů, CSP bez chyb, bez vodorovného posouvání.
// Push API v prohlížeči je nahrazené atrapou (skutečné předplatné vyžaduje push server). Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
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
const VAPID = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const config = (key) => `window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key", vapidPublicKey: "${key}" };`;
const login = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'x@example.com', name: 'Jana Nováková' } }) };

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};

// Atrapa Push API: Notification, PushManager a service worker s pushManager; stav zařízení se čte přes window.__push
const pushStub = ({ permission, answer }) => {
    const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
    const state = { subscription: null, asked: 0, subscribed: 0, unsubscribed: 0 };
    const make = () => ({
        endpoint: 'https://push.example.com/send/abc', options: {},
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: P256DH, auth: 'tBHItJI5svbpez7KI4CCXg' } }; },
        async unsubscribe() { state.subscription = null; state.unsubscribed++; return true; }
    });
    window.__push = state;
    window.PushManager = function PushManager() {};
    window.Notification = { permission, requestPermission: async () => { state.asked++; window.Notification.permission = answer; return answer; } };
    const manager = { getSubscription: async () => state.subscription, subscribe: async () => { state.subscribed++; state.subscription = make(); return state.subscription; } };
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { ready: Promise.resolve({ pushManager: manager }), register: async () => ({}), getRegistration: async () => null, addEventListener() {}, controller: null }
    });
};

const newDb = () => ({ subscribed: [], deleted: [], patches: [], profile: { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [], push_tournament: true, push_challenge: true } });
const backend = async (context, db, key) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: config(key) }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if ((request.headers().authorization || '') !== 'Bearer tok-u1') return json({ message: 'no token' }, 401);
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        if (url.pathname === '/rest/v1/rpc/push_subscribe') { db.subscribed.push(body); return route.fulfill({ status: 204, body: '' }); }
        if (url.pathname === '/rest/v1/push_subscriptions' && request.method() === 'DELETE') { db.deleted.push(url.searchParams.get('endpoint').replace(/^eq\./, '')); return route.fulfill({ status: 204, body: '' }); }
        if (url.pathname === '/rest/v1/profiles') {
            if (request.method() === 'PATCH') { db.patches.push(body); Object.assign(db.profile, body); return route.fulfill({ status: 204, body: '' }); }
            return json([{ ...db.profile }]);
        }
        if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
        return json([]);
    });
};

const setup = async (browser, { key = VAPID, permission = 'default', answer = 'granted', storage = {}, viewport = { width: 390, height: 780 }, colorScheme = 'light' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([name, value]) => localStorage.setItem(name, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('single'), ...login, ...storage });
    await context.addInitScript(pushStub, { permission, answer });
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
    const db = newDb();
    await backend(context, db, key);
    return { context, tab, log, db };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && (content.textContent.includes('Dnešní otázky') || content.querySelector('#home-tabs'))); }, null, { timeout: 30000 });
const openSettings = async (tab) => { await tab.click('#btn-settings'); await tab.waitForSelector('#settings-overlay'); };
const overflow = (tab) => tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, box: box.scrollWidth - box.clientWidth }; });

test('upozornění (push) v Nastavení', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (options = {}) => {
        const page = await setup(browser, options);
        await page.tab.goto(`${ORIGIN}/${options.query || ''}`);
        await waitForHome(page.tab);
        return page;
    };

    await t.test('bez klíče VAPID se nabídka neukáže', async () => {
        const { context, tab, log } = await start({ key: '' });
        await openSettings(tab);
        await tab.waitForTimeout(300);
        assert.equal(await tab.locator('[data-push-toggle]').count(), 0);
        assert.doesNotMatch(await tab.textContent('#settings-overlay'), /Upozornění/);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('zapnutí: souhlas, předplatné s klíčem serveru, uložení; volby; vypnutí maže odběr', async () => {
        const { context, tab, log, db } = await start();
        await openSettings(tab);
        await tab.waitForSelector('[data-push-toggle="on"]');
        assert.match(await tab.textContent('#settings-overlay'), /Zapnout upozornění/);
        assert.equal(await tab.evaluate(() => window.__push.asked), 0, 'nic se nezapne samo');
        await tab.click('[data-push-toggle="on"]');
        await tab.waitForSelector('[data-push-toggle="off"]');
        assert.equal(await tab.evaluate(() => window.__push.asked), 1);
        assert.equal(await tab.evaluate(() => window.__push.subscribed), 1);
        assert.deepEqual(db.subscribed.map(row => row.endpoint_url), ['https://push.example.com/send/abc']);
        assert.match(await tab.textContent('#settings-note'), /zapnutá/);
        assert.deepEqual(await overflow(tab), { page: 0, box: 0 });

        // volba: výzvy vypnout
        assert.equal(await tab.getAttribute('[data-push-pref="challenge"]', 'aria-pressed'), 'true');
        await tab.click('[data-push-pref="challenge"]');
        await tab.waitForFunction(() => document.querySelector('[data-push-pref="challenge"]').getAttribute('aria-pressed') === 'false');
        assert.deepEqual(db.patches, [{ push_tournament: true, push_challenge: false }]);

        // vypnout
        await tab.click('[data-push-toggle="off"]');
        await tab.waitForSelector('[data-push-toggle="on"]');
        assert.deepEqual(db.deleted, ['https://push.example.com/send/abc']);
        assert.equal(await tab.evaluate(() => window.__push.unsubscribed), 1);
        assert.equal(await tab.evaluate(() => window.__push.subscription), null);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('odmítnutý souhlas nic neuloží; zakázáno v prohlížeči se vysvětlí', async () => {
        const refused = await start({ answer: 'denied' });
        await openSettings(refused.tab);
        await refused.tab.click('[data-push-toggle="on"]');
        await refused.tab.waitForFunction(() => /zakázaná/.test(document.getElementById('settings-note').textContent));
        assert.equal(refused.db.subscribed.length, 0);
        assert.equal(await refused.tab.evaluate(() => window.__push.subscribed), 0);
        await refused.context.close();
        const denied = await start({ permission: 'denied' });
        await openSettings(denied.tab);
        await denied.tab.waitForSelector('[data-push-toggle="on"]');
        assert.match(await denied.tab.textContent('#settings-overlay'), /zakázaná/);
        await denied.context.close();
    });

    await t.test('odhlášení z účtu smaže odběr na zařízení; tmavý režim a úzký telefon bez posouvání', async () => {
        const { context, tab, db } = await start({ viewport: { width: 360, height: 640 }, colorScheme: 'dark' });
        await openSettings(tab);
        await tab.click('[data-push-toggle="on"]');
        await tab.waitForSelector('[data-push-toggle="off"]');
        // Panel s upozorněním se vejde (pás záložek Nastavení je na 360 px starší a těsný, ten se tu nehlídá)
        assert.deepEqual(await tab.evaluate(() => { const panel = document.querySelector('[data-push-toggle]').parentElement; const box = document.querySelector('#settings-overlay > div'); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, panel: panel.scrollWidth - panel.clientWidth, outside: [...panel.querySelectorAll('button')].filter(el => el.getBoundingClientRect().right > box.getBoundingClientRect().right).length }; }), { page: 0, panel: 0, outside: 0 });
        await tab.click('#settings-overlay [data-me-tab="profile"]');
        await tab.click('[data-auth-logout]');
        await tab.waitForFunction(() => window.__push.unsubscribed === 1);
        assert.deepEqual(db.deleted, ['https://push.example.com/send/abc']);
        await context.close();
    });

    await t.test('?tab=multi z upozornění otevře Více hráčů a adresa se vyčistí', async () => {
        const { context, tab } = await start({ query: '?tab=multi' });
        await tab.waitForSelector('#home-tabs');
        assert.equal(await tab.getAttribute('#home-tabs [data-tab="multi"]', 'aria-selected'), 'true');
        assert.equal(new URL(tab.url()).search, '');
        await context.close();
    });
});
