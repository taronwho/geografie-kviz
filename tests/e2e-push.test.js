// Upozornění v prohlížeči (Nastavení → Hra): nabídka se bez klíče VAPID neukáže, zapnutí (souhlas, předplatné, uložení do falešné databáze),
// viditelný výsledek přímo u přepínače („Zapínám…“, konkrétní příčina a rada: zamítnuto, zavřený dotaz, nespuštěný service worker, chyba push
// služby, 404 serveru), návod pro zablokovaná upozornění a dokončení po povolení, volby turnaje a výzev, vypnutí a odhlášení mažou odběr,
// klepnutí na upozornění (?tab=multi) otevře Více hráčů, vývojářský režim (diagnostika, zkouška v zařízení, zkouška přes server s okamžitým
// odesíláním i bez něj a se starší databází), CSP bez chyb,
// bez vodorovného posouvání. Push API v prohlížeči je nahrazené atrapou (skutečné předplatné vyžaduje push server), service worker také
// (zkouška v zařízení: atrapa přijme zprávu push-test a odpoví; klepnutí na upozornění se napodobí zprávou push-open).
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const SHOTS = process.env.SHOTS_DIR || '';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==', 'base64');
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

// Atrapa Push API: Notification, PushManager a service worker s pushManager; stav zařízení se čte přes window.__push.
// realNotification = ponechá skutečné Notification prohlížeče (povolení řídí context.grantPermissions); delay = dotaz prohlížeče odpoví po delay ms;
// subscribeError = push služba odmítne odběr; readyNever = service worker se nikdy nespustí. Zprávy pro service worker (push-test) se zapisují
// do __push.swMessages a atrapa odpoví { ok: true }; window.__swEmit(data) napodobí zprávu od service workeru (klepnutí na upozornění).
const pushStub = ({ permission, answer, realNotification, delay, subscribeError, readyNever, noPush }) => {
    const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
    const state = { subscription: null, asked: 0, subscribed: 0, unsubscribed: 0, swMessages: [], listeners: [] };
    const make = () => ({
        endpoint: 'https://push.example.com/send/abc', options: {},
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: P256DH, auth: 'tBHItJI5svbpez7KI4CCXg' } }; },
        async unsubscribe() { state.subscription = null; state.unsubscribed++; return true; }
    });
    window.__push = state;
    if (noPush) { delete window.PushManager; return; }
    window.PushManager = function PushManager() {};
    if (!realNotification) {
        window.Notification = {
            permission,
            requestPermission: async () => {
                state.asked++;
                if (delay) await new Promise(resolve => setTimeout(resolve, delay));
                if (window.Notification.permission === 'default') window.Notification.permission = answer;
                return window.Notification.permission;
            }
        };
    }
    const manager = {
        getSubscription: async () => state.subscription,
        subscribe: async () => {
            if (subscribeError) throw new DOMException('Registration failed - push service error', 'AbortError');
            state.subscribed++; state.subscription = make(); return state.subscription;
        }
    };
    const registration = {
        scope: `${location.origin}/`, pushManager: manager,
        active: { state: 'activated', postMessage: (message, ports) => { state.swMessages.push(message); if (ports && ports[0]) ports[0].postMessage({ ok: true }); } }
    };
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
            ready: readyNever ? new Promise(() => {}) : Promise.resolve(registration), register: async () => registration,
            getRegistration: async () => (readyNever ? undefined : registration), controller: null,
            addEventListener(type, listener) { if (type === 'message') state.listeners.push(listener); }
        }
    });
    window.__swEmit = (data) => state.listeners.forEach(listener => listener({ data }));
};

// Otevřený turnaj (přihlášky do příštího pondělí), do kterého se hráč může přihlásit
const TID = '11111111-2222-3333-4444-555555555555';
const nextMonday = () => { const day = new Date(); day.setUTCDate(day.getUTCDate() + (((8 - day.getUTCDay()) % 7) || 7)); return day.toISOString().slice(0, 10); };
const newDb = () => ({ subscribed: [], deleted: [], patches: [], devTests: 0, statusCalls: 0, pushStatus: undefined, subscribeStatus: 0, devAdmin: true, devices: 1, entries: [], joins: 0, profile: { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [], push_tournament: true, push_challenge: true },
    tournament: { id: TID, topic: 'mix', week_start: nextMonday(), started_on: null, capacity: 32, status: 'open', size: null, rounds: null, seed: 's1' } });
const backend = async (context, db, key) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: config(key) }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if ((request.headers().authorization || '') !== 'Bearer tok-u1') return json({ message: 'no token' }, 401);
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        if (url.pathname === '/rest/v1/rpc/push_subscribe') {
            if (db.subscribeStatus) return json({ code: 'PGRST202', message: 'Could not find the function public.push_subscribe' }, db.subscribeStatus);
            db.subscribed.push(body); return route.fulfill({ status: 204, body: '' });
        }
        if (url.pathname === '/rest/v1/rpc/dev_push_test') {
            if (!db.devAdmin) return json({ code: '42501', message: 'Zkušební upozornění smí poslat jen účet v dev_admins (viz docs/SUPABASE.md).' }, 403);
            if (db.devices) db.devTests++;
            return json(db.devices);
        }
        // Stav okamžitého odesílání (schéma 5): pushStatus = odpověď, 404 = starší databáze bez funkce, undefined = jako ostatní RPC (null)
        if (url.pathname === '/rest/v1/rpc/dev_push_status' && db.pushStatus !== undefined) {
            db.statusCalls++;
            if (!db.devAdmin) return json({ code: '42501', message: 'Stav upozornění smí číst jen účet v dev_admins.' }, 403);
            return db.pushStatus === 404 ? json({ code: 'PGRST202', message: 'Could not find the function public.dev_push_status' }, 404) : json(db.pushStatus);
        }
        if (url.pathname === '/rest/v1/rpc/tournament_tick') return route.fulfill({ status: 200, body: '' });
        if (url.pathname === '/rest/v1/rpc/tournament_join') { db.joins++; if (!db.entries.includes('u-1')) db.entries.push('u-1'); return route.fulfill({ status: 200, body: '' }); }
        if (url.pathname === '/rest/v1/rpc/tournament_leave') { db.entries = db.entries.filter(id => id !== 'u-1'); return route.fulfill({ status: 200, body: '' }); }
        if (url.pathname === '/rest/v1/tournaments') return json(db.tournament ? [db.tournament] : []);
        if (url.pathname === '/rest/v1/tournament_entries') return json(db.entries.map(id => ({ user_id: id, joined_at: '2026-11-01T10:00:00Z', status: 'joined', place: null, player: { ...db.profile } })));
        if (url.pathname === '/rest/v1/push_subscriptions' && request.method() === 'DELETE') { db.deleted.push(url.searchParams.get('endpoint').replace(/^eq\./, '')); return route.fulfill({ status: 204, body: '' }); }
        if (url.pathname === '/rest/v1/push_subscriptions') return json(db.subscribed.filter(row => !db.deleted.includes(row.endpoint_url)).map(row => ({ endpoint: row.endpoint_url })));
        if (url.pathname === '/rest/v1/profiles') {
            if (request.method() === 'PATCH') { db.patches.push(body); Object.assign(db.profile, body); return route.fulfill({ status: 204, body: '' }); }
            return json([{ ...db.profile }]);
        }
        if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
        return json([]);
    });
};

const setup = async (browser, { key = VAPID, permission = 'default', answer = 'granted', storage = {}, viewport = { width: 390, height: 780 }, colorScheme = 'light', grant = false, realNotification = false, delay = 0, subscribeError = false, readyNever = false, noPush = false, userAgent = undefined, db: dbOptions = {} } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, ...(userAgent ? { userAgent } : {}) });
    if (grant) await context.grantPermissions(['notifications'], { origin: ORIGIN });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([name, value]) => localStorage.setItem(name, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('single'), 'mudrlant.tips': JSON.stringify({ off: true }), ...login, ...storage });
    await context.addInitScript(pushStub, { permission, answer, realNotification, delay, subscribeError, readyNever, noPush });
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
    const db = { ...newDb(), ...dbOptions };
    await backend(context, db, key);
    return { context, tab, log, db };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && (content.textContent.includes('Dnešní otázky') || content.querySelector('#home-tabs'))); }, null, { timeout: 30000 });
const openSettings = async (tab) => { await tab.click('#btn-settings'); await tab.waitForSelector('#settings-overlay'); };
const overflow = (tab, selector = '#settings-overlay > div') => tab.evaluate((selector) => { const box = document.querySelector(selector); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, box: box.scrollWidth - box.clientWidth }; }, selector);
// Text u přepínače (podtitulek řádku) a rada pod ním
const status = (tab) => tab.textContent('[data-push-status]');
const advice = async (tab) => ((await tab.$('[data-push-advice]')) ? tab.textContent('[data-push-advice]') : '');
// Rada u přepínače se ukáže, je vidět bez posouvání (v okně Nastavení) a nic nepřetéká do strany
const visibleNear = (tab, selector) => tab.evaluate((selector) => {
    const el = document.querySelector(selector);
    const box = document.querySelector('#settings-overlay > div').getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return rect.top >= box.top && rect.bottom <= box.bottom && rect.height > 0;
}, selector);

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

    await t.test('zapnutí: „Zapínám…“, souhlas, předplatné s klíčem serveru, uložení, výsledek u přepínače; volby; vypnutí maže odběr', async () => {
        const { context, tab, log, db } = await start({ delay: 700 });
        await openSettings(tab);
        await tab.waitForSelector('[data-push-toggle="on"]');
        // Řádek Upozornění se spínačem (vypnuto) v kartě Hra
        assert.equal(await tab.getAttribute('[data-push-toggle="on"]', 'role'), 'switch');
        assert.equal(await tab.getAttribute('[data-push-toggle="on"]', 'aria-checked'), 'false');
        assert.match(await tab.textContent('[data-push-toggle="on"]'), /Upozornění/);
        assert.equal(await tab.evaluate(() => window.__push.asked), 0, 'nic se nezapne samo');
        await tab.click('[data-push-toggle="on"]');
        // během čekání na dotaz prohlížeče je vidět, že se něco děje, a spínač nejde stisknout znovu
        await tab.waitForFunction(() => /Zapínám/.test(document.querySelector('[data-push-status]').textContent));
        assert.equal(await tab.getAttribute('[data-push-toggle]', 'aria-busy'), 'true');
        assert.equal(await tab.$eval('[data-push-toggle]', el => el.disabled), true);
        await tab.waitForSelector('[data-push-toggle="off"]');
        assert.equal(await tab.getAttribute('[data-push-toggle="off"]', 'aria-checked'), 'true');
        assert.equal(await tab.evaluate(() => window.__push.asked), 1);
        assert.equal(await tab.evaluate(() => window.__push.subscribed), 1);
        assert.deepEqual(db.subscribed.map(row => row.endpoint_url), ['https://push.example.com/send/abc']);
        assert.match(await status(tab), /upozornění jsou zapnutá/);
        assert.match(await tab.textContent('#toast'), /upozornění jsou zapnutá/, 'i v toastu');
        assert.ok(await visibleNear(tab, '[data-push-status]'), 'výsledek je vidět u přepínače bez posouvání');
        assert.deepEqual(await overflow(tab), { page: 0, box: 0 });
        // Karta Hra se i se zapnutými upozorněními (řádek se spínačem a volby, co posílat) vejde na 390×780 bez posouvání
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight - box.clientHeight; }), 0, 'karta Hra bez posouvání');
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'upozorneni-zapnuto-390.png') });

        // volba: výzvy vypnout
        assert.equal(await tab.getAttribute('[data-push-pref="challenge"]', 'aria-pressed'), 'true');
        await tab.click('[data-push-pref="challenge"]');
        await tab.waitForFunction(() => document.querySelector('[data-push-pref="challenge"]').getAttribute('aria-pressed') === 'false');
        assert.deepEqual(db.patches, [{ push_tournament: true, push_challenge: false }]);

        // vypnout
        await tab.click('[data-push-toggle="off"]');
        await tab.waitForSelector('[data-push-toggle="on"]');
        assert.match(await status(tab), /upozornění jsou vypnutá/);
        assert.deepEqual(db.deleted, ['https://push.example.com/send/abc']);
        assert.equal(await tab.evaluate(() => window.__push.unsubscribed), 1);
        assert.equal(await tab.evaluate(() => window.__push.subscription), null);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('skutečné povolení prohlížeče (grantPermissions): zapne se; když databáze funkce nemá (404), hráč to vidí i s radou', async () => {
        const granted = await start({ grant: true, realNotification: true });
        assert.equal(await granted.tab.evaluate(() => Notification.permission), 'granted');
        await openSettings(granted.tab);
        await granted.tab.click('[data-push-toggle="on"]');
        await granted.tab.waitForSelector('[data-push-toggle="off"]');
        assert.equal(granted.db.subscribed.length, 1);
        assert.match(await status(granted.tab), /zapnutá/);
        await granted.context.close();

        const missing = await start({ grant: true, realNotification: true, db: { subscribeStatus: 404 } });
        await openSettings(missing.tab);
        await missing.tab.click('[data-push-toggle="on"]');
        await missing.tab.waitForSelector('[data-push-advice]');
        assert.match(await status(missing.tab), /Databáze nemá funkce upozornění/);
        assert.match(await advice(missing.tab), /supabase\/schema\.sql/);
        assert.equal(await missing.tab.getAttribute('[data-push-advice]', 'role'), 'alert');
        assert.equal(await missing.tab.getAttribute('[data-push-toggle]', 'aria-checked'), 'false', 'spínač zůstal vypnutý');
        assert.equal(await missing.tab.evaluate(() => window.__push.unsubscribed), 1, 'odběr v prohlížeči se zrušil');
        assert.ok(await visibleNear(missing.tab, '[data-push-advice]'), 'rada je vidět u přepínače');
        assert.match(await missing.tab.textContent('#toast'), /Databáze nemá funkce upozornění/);
        assert.deepEqual(await overflow(missing.tab), { page: 0, box: 0 });
        if (SHOTS) await missing.tab.screenshot({ path: path.join(SHOTS, 'upozorneni-404-390.png') });
        assert.deepEqual(missing.log.errors, []);
        await missing.context.close();

        // bez udělení: prohlížeč dotaz sám odmítne nebo zavře – hráč vždy dostane srozumitelnou hlášku, nic se neuloží
        const plain = await start({ realNotification: true });
        await openSettings(plain.tab);
        await plain.tab.click('[data-push-toggle="on"]');
        await plain.tab.waitForSelector('[data-push-advice]');
        assert.match(await status(plain.tab), /zablokoval|bez volby/);
        assert.equal(plain.db.subscribed.length, 0);
        await plain.context.close();
    });

    await t.test('odmítnutý souhlas, zavřený dotaz, chyba push služby a nespuštěný service worker: konkrétní příčina a rada u přepínače', async () => {
        const refused = await start({ answer: 'denied' });
        await openSettings(refused.tab);
        await refused.tab.click('[data-push-toggle="on"]');
        await refused.tab.waitForSelector('[data-push-advice]');
        assert.match(await status(refused.tab), /zablokoval/);
        assert.match(await advice(refused.tab), /Klepni na řádek Upozornění/);
        assert.equal(refused.db.subscribed.length, 0);
        assert.equal(await refused.tab.evaluate(() => window.__push.subscribed), 0);
        await refused.context.close();

        const dismissed = await start({ answer: 'default' });
        await openSettings(dismissed.tab);
        await dismissed.tab.click('[data-push-toggle="on"]');
        await dismissed.tab.waitForSelector('[data-push-advice]');
        assert.match(await status(dismissed.tab), /zavřel bez volby/);
        assert.match(await advice(dismissed.tab), /zvonku/);
        await dismissed.context.close();

        const serviceError = await start({ subscribeError: true });
        await openSettings(serviceError.tab);
        await serviceError.tab.click('[data-push-toggle="on"]');
        await serviceError.tab.waitForSelector('[data-push-advice]');
        assert.match(await status(serviceError.tab), /Push služba prohlížeče odběr odmítla/);
        assert.match(await advice(serviceError.tab), /AbortError: Registration failed - push service error/);
        assert.equal(serviceError.db.subscribed.length, 0);
        await serviceError.context.close();

        // service worker se nespustí: po čekání (8 s) se řádek ukáže a zapnutí řekne proč nejde
        const noWorker = await start({ readyNever: true, permission: 'granted' });
        await openSettings(noWorker.tab);
        await noWorker.tab.waitForSelector('[data-push-toggle="on"]', { timeout: 20000 });
        await noWorker.tab.click('[data-push-toggle="on"]');
        await noWorker.tab.waitForSelector('[data-push-advice]', { timeout: 20000 });
        assert.match(await status(noWorker.tab), /service worker/);
        assert.match(await advice(noWorker.tab), /Obnov stránku/);
        await noWorker.context.close();
    });

    await t.test('zablokovaná upozornění: klepnutí ukáže návod krok za krokem; po povolení „zkontrolovat“ dokončí zapnutí, stejně tak návrat do aplikace', async () => {
        const { context, tab, db, log } = await start({ permission: 'denied' });
        await openSettings(tab);
        await tab.waitForSelector('[data-push-toggle="on"]');
        assert.match(await status(tab), /zakázaná/);
        await tab.click('[data-push-toggle="on"]');
        await tab.waitForSelector('#push-help');
        assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Jak povolit upozornění');
        // na počítači (Chromium v testu) je první návod pro počítač, ostatní zařízení jsou pod „Jiné zařízení“
        assert.equal(await tab.getAttribute('#push-help', 'data-env'), 'desktop');
        assert.equal(await tab.getAttribute('#push-help > section', 'data-push-help'), 'desktop');
        assert.match(await tab.textContent('#push-help > section'), /zámek/);
        assert.deepEqual(await tab.$$eval('#push-help details [data-push-help]', els => els.map(el => el.dataset.pushHelp)), ['android', 'app', 'ios']);
        assert.match(await tab.textContent('#push-help details'), /Resetovat oprávnění/);
        assert.match(await tab.textContent('#push-help details'), /Informace o aplikaci/);
        assert.match(await tab.textContent('#push-help details'), /Nastavení iPhonu → Oznámení/);
        assert.deepEqual(await overflow(tab, '#dialog-overlay > div'), { page: 0, box: 0 });
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'upozorneni-navod-390.png') });
        // pořád zakázáno: řekne to
        await tab.click('[data-push-help-check]');
        await tab.waitForSelector('[data-push-help-note]');
        assert.match(await tab.textContent('[data-push-help-note]'), /pořád blokuje/);
        assert.equal(db.subscribed.length, 0);
        // hráč povolí v prohlížeči a klepne na „zkontrolovat“: zapnutí se dokončí a Nastavení ukáže zapnuto
        await tab.evaluate(() => { window.Notification.permission = 'granted'; });
        await tab.click('[data-push-help-check]');
        await tab.waitForSelector('#settings-overlay [data-push-toggle="off"]');
        assert.equal(await tab.locator('#push-help').count(), 0);
        assert.equal(db.subscribed.length, 1);
        assert.match(await status(tab), /zapnutá/);
        assert.deepEqual(log.errors, []);
        await context.close();

        // návrat do aplikace z nastavení prohlížeče (visibilitychange): po otevření návodu se zapnutí dokončí samo
        const back = await start({ permission: 'denied' });
        await openSettings(back.tab);
        await back.tab.click('[data-push-toggle="on"]');
        await back.tab.waitForSelector('#push-help');
        await back.tab.evaluate(() => { window.Notification.permission = 'granted'; document.dispatchEvent(new Event('visibilitychange')); });
        await back.tab.waitForSelector('#settings-overlay [data-push-toggle="off"]');
        assert.equal(back.db.subscribed.length, 1);
        await back.context.close();

        // bez otevřeného návodu se po návratu jen přečte stav: řádek z „zakázaná“ sám přepne na běžný vypnutý přepínač (nic se nezapne samo)
        const quiet = await start({ permission: 'denied' });
        await openSettings(quiet.tab);
        await quiet.tab.waitForSelector('[data-push-toggle="on"]');
        await quiet.tab.evaluate(() => { window.Notification.permission = 'default'; document.dispatchEvent(new Event('visibilitychange')); });
        await quiet.tab.waitForFunction(() => /Zápas v turnaji/.test(document.querySelector('[data-push-status]').textContent));
        assert.equal(quiet.db.subscribed.length, 0);
        assert.equal(await quiet.tab.evaluate(() => window.__push.asked), 0);
        await quiet.context.close();
    });

    await t.test('odhlášení z účtu smaže odběr na zařízení; tmavý režim a úzký telefon bez posouvání', async () => {
        const { context, tab, db } = await start({ viewport: { width: 360, height: 640 }, colorScheme: 'dark' });
        await openSettings(tab);
        await tab.click('[data-push-toggle="on"]');
        await tab.waitForSelector('[data-push-toggle="off"]');
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'upozorneni-zapnuto-360-tmavy.png') });
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

    await t.test('vývojářský režim: diagnostika upozornění (povolení, service worker, předplatné, klíč, server)', async () => {
        const { context, tab, log } = await start({ query: '?vyvojar', permission: 'granted' });
        await openSettings(tab);
        await tab.click('[data-push-toggle="on"]');
        await tab.waitForSelector('[data-push-toggle="off"]');
        await tab.click('[data-dev="push-diag"]');
        await tab.waitForSelector('#push-diagnostics');
        const row = (key) => tab.textContent(`[data-diag="${key}"] dd`);
        assert.equal(await row('permission'), 'granted');
        assert.match(await row('sw'), /^ano \(activated\)/);
        assert.equal(await row('ready'), 'ano');
        assert.equal(await row('subscription'), 'push.example.com/…send/abc');
        assert.equal(await row('vapid'), `${VAPID.slice(0, 8)}…`);
        assert.match(await row('server'), /odpovídá, odběrů účtu 1, toto zařízení ano/);
        assert.doesNotMatch(await tab.textContent('#push-diagnostics'), /BNcRdreALRFX|tBHItJI5/, 'klíče předplatného se neukazují');
        assert.deepEqual(await overflow(tab, '#dialog-overlay > div'), { page: 0, box: 0 });
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'upozorneni-diagnostika-390.png') });
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('vývojářský režim: zkouška v zařízení přes service worker (bez serveru) a klepnutí otevře Více hráčů', async () => {
        const { context, tab, log } = await start({ query: '?vyvojar', permission: 'granted' });
        await openSettings(tab);
        await tab.click('[data-dev="push-local"]');
        await tab.waitForSelector('[data-push-test-result="ok"]');
        assert.match(await tab.textContent('#push-test'), /Upozornění se zobrazilo/);
        assert.match(await tab.textContent('#push-test'), /Klepni na něj/);
        assert.deepEqual(await tab.evaluate(() => window.__push.swMessages), [{ type: 'push-test', payload: { title: 'Zkušební upozornění Mudrlanta', body: 'Funguje to! Klepni sem a otevře se záložka Více hráčů.', url: './?tab=multi', kind: 'test' } }]);
        // klepnutí na upozornění: service worker pošle push-open s druhem test
        await tab.evaluate(() => window.__swEmit({ type: 'push-open', tab: 'multi', kind: 'test' }));
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        assert.equal(await tab.getAttribute('#home-tabs [data-tab="multi"]', 'aria-selected'), 'true');
        assert.match(await tab.textContent('#toast'), /Klepnutí na upozornění funguje/);
        assert.deepEqual(log.errors, []);
        await context.close();

        // bez povolení: zkouška to řekne a nabídne povolení; po souhlasu proběhne
        const ask = await start({ query: '?vyvojar' });
        await openSettings(ask.tab);
        await ask.tab.click('[data-dev="push-local"]');
        await ask.tab.waitForSelector('[data-push-test-enable]');
        assert.match(await ask.tab.textContent('#push-test'), /nejsou povolená/);
        assert.equal(await ask.tab.evaluate(() => window.__push.swMessages.length), 0);
        await ask.tab.click('[data-push-test-enable]');
        await ask.tab.waitForSelector('[data-push-test-result="ok"]');
        assert.equal(await ask.tab.evaluate(() => window.__push.asked), 1);
        assert.equal(await ask.tab.evaluate(() => window.__push.swMessages.length), 1);
        assert.equal(ask.db.subscribed.length, 1, 'povolení zapne upozornění stejně jako přepínač');
        await ask.context.close();

        // zablokovaná: rovnou návod, jak povolit
        const blocked = await start({ query: '?vyvojar', permission: 'denied' });
        await openSettings(blocked.tab);
        await blocked.tab.click('[data-dev="push-local"]');
        await blocked.tab.waitForSelector('#push-help');
        await blocked.context.close();
    });

    // Okno bez svislého posouvání (celé vidět) a bez přetékání do strany
    const fitsDialog = (tab) => tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return { vertical: box.scrollHeight - box.clientHeight, horizontal: box.scrollWidth - box.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    const DOCS = 'https://github.com/taronwho/geografie-kviz/blob/main/docs/SUPABASE.md#okamžité-odesílání-upozornění';
    const HINT = 'Hned ho pošleš na GitHubu: Actions → Upozornění → Run workflow.';
    const serverTest = async (options) => {
        const page = await start({ query: '?vyvojar', ...options });
        await openSettings(page.tab);
        await page.tab.click('[data-dev="push-server"]');
        await page.tab.waitForSelector('[data-push-test-result]');
        return { ...page, text: await page.tab.textContent('#push-test') };
    };

    await t.test('vývojářský režim: zkouška přes server zařadí zprávu a srozumitelně řekne, co dál (bez okamžitého odesílání, i se starší databází)', async () => {
        for (const pushStatus of [undefined, 404, { instant: false, token: false, pg_net: false, cron: false, github: null }]) {
            const { context, tab, db, log, text } = await serverTest({ viewport: { width: 360, height: 640 }, db: { pushStatus } });
            const label = JSON.stringify(pushStatus);
            assert.equal(db.devTests, 1, label);
            assert.equal(await tab.getAttribute('[data-push-test-result]', 'data-push-test-result'), 'ok');
            assert.match(text, /Zkušební upozornění čeká na odeslání \(zařízení: 1\)/, label);
            assert.match(text, /Server upozornění posílá, jen když ho spustí GitHub\. Má to být každou hodinu, ale GitHub to často udělá až mnohem později\./, label);
            assert.equal(await tab.textContent('[data-push-test-next]'), 'Aby upozornění přicházela do 1–2 minut, zapni okamžité odesílání podle návodu Okamžité odesílání upozornění.', label);
            assert.equal(await tab.getAttribute('[data-push-test-docs]', 'href'), DOCS);
            assert.equal(await tab.getAttribute('[data-push-test-docs]', 'target'), '_blank');
            assert.equal(await tab.textContent('[data-push-test-hint]'), HINT, 'ruční spuštění jen jako vedlejší rada');
            assert.equal(await tab.locator('[data-push-test-setup]').count(), 0, 'nic nastaveného = žádný seznam chybějících kroků');
            assert.doesNotMatch(text, /dry_run|dry-run|workflow_dispatch|pg_net|pg_cron/, `bez technických výrazů: ${label}`);
            assert.deepEqual(await fitsDialog(tab), { vertical: 0, horizontal: 0, page: 0 }, `celé okno vidět na 360×640: ${label}`);
            if (SHOTS && pushStatus === undefined) await tab.screenshot({ path: path.join(SHOTS, 'upozorneni-zkouska-server-360.png') });
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });

    await t.test('vývojářský režim: s okamžitým odesíláním „přijde do 1–2 minut“; odmítnutí GitHubem a rozpracované nastavení řekne', async () => {
        const instant = await serverTest({ viewport: { width: 360, height: 640 }, db: { pushStatus: { instant: true, token: true, pg_net: true, cron: true, github: 204 } } });
        assert.equal(instant.db.statusCalls, 1);
        assert.match(instant.text, /Zkušební upozornění je na cestě \(zařízení: 1\)/);
        assert.equal(await instant.tab.textContent('[data-push-test-next]'), 'Upozornění přijde do 1–2 minut.');
        assert.match(instant.text, /Nic dalšího dělat nemusíš\./);
        assert.equal(await instant.tab.locator('[data-push-test-hint], [data-push-test-docs], [data-push-test-setup]').count(), 0, 'nic dalšího k dělání');
        assert.doesNotMatch(instant.text, /GitHub|Run workflow|dry_run/);
        assert.deepEqual(await fitsDialog(instant.tab), { vertical: 0, horizontal: 0, page: 0 });
        if (SHOTS) await instant.tab.screenshot({ path: path.join(SHOTS, 'upozorneni-zkouska-okamzite-360.png') });
        await instant.tab.click('#push-test [data-close]');
        await instant.tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        await instant.context.close();

        // první spuštění ještě bez odpovědi GitHubu (github null) je taky v pořádku
        const fresh = await serverTest({ db: { pushStatus: { instant: true, token: true, pg_net: true, cron: true, github: null } } });
        assert.equal(await fresh.tab.textContent('[data-push-test-next]'), 'Upozornění přijde do 1–2 minut.');
        await fresh.context.close();

        const refused = await serverTest({ viewport: { width: 360, height: 640 }, db: { pushStatus: { instant: true, token: true, pg_net: true, cron: true, github: 401 } } });
        assert.match(refused.text, /čeká na odeslání/);
        assert.match(refused.text, /GitHub ho naposledy odmítl \(chyba 401\)\. Token nejspíš vypršel\./);
        assert.equal(await refused.tab.textContent('[data-push-test-next]'), 'Vytvoř nový token a spusť znovu stejné SQL podle návodu Okamžité odesílání upozornění.');
        assert.equal(await refused.tab.getAttribute('[data-push-test-docs]', 'href'), DOCS);
        assert.equal(await refused.tab.textContent('[data-push-test-hint]'), HINT);
        assert.deepEqual(await fitsDialog(refused.tab), { vertical: 0, horizontal: 0, page: 0 });
        await refused.context.close();

        const partial = await serverTest({ viewport: { width: 360, height: 640 }, db: { pushStatus: { instant: false, token: true, pg_net: true, cron: false, github: null } } });
        assert.match(partial.text, /Server upozornění posílá, jen když ho spustí GitHub/);
        assert.equal(await partial.tab.textContent('[data-push-test-setup]'), 'Okamžité odesílání je nastavené jen zčásti, chybí: úloha pg_cron.');
        assert.deepEqual(await fitsDialog(partial.tab), { vertical: 0, horizontal: 0, page: 0 }, 'i nejdelší varianta se vejde');
        await partial.context.close();
    });

    await t.test('vývojářský režim: zkouška přes server – účet mimo dev_admins a účet bez odběru srozumitelně', async () => {
        const stranger = await start({ query: '?vyvojar', db: { devAdmin: false } });
        await openSettings(stranger.tab);
        await stranger.tab.click('[data-dev="push-server"]');
        await stranger.tab.waitForSelector('[data-push-test-result="error"]');
        assert.match(await stranger.tab.textContent('#push-test'), /není v dev_admins/);
        await stranger.context.close();

        const none = await start({ query: '?vyvojar', db: { devices: 0 } });
        await openSettings(none.tab);
        await none.tab.click('[data-dev="push-server"]');
        await none.tab.waitForSelector('[data-push-test-enable]');
        assert.match(await none.tab.textContent('#push-test'), /nemá zapnutá upozornění/);
        assert.equal(none.db.devTests, 0);
        await none.context.close();
    });

    // --- Nabídka upozornění (hra se sama zeptá) ---
    const offerRecord = (tab) => tab.evaluate(() => (JSON.parse(localStorage.getItem('mudrlant.pushOffer') || '{}'))['u-1'] || null);
    const setOfferRecord = (tab, record) => tab.evaluate((record) => localStorage.setItem('mudrlant.pushOffer', JSON.stringify({ 'u-1': record })), record);
    const joinTournament = async (tab) => {
        await tab.waitForSelector(`[data-action="tournament-join"][data-tid="${TID}"]`, { timeout: 15000 });
        await tab.click(`[data-action="tournament-join"][data-tid="${TID}"]`);
    };
    // Nabídka se neukáže: počká se déle, než je její zpoždění, a okno nesmí být
    const noOffer = async (tab, wait = 4500) => { await tab.waitForTimeout(wait); assert.equal(await tab.locator('#push-offer, #push-offer-ios').count(), 0, 'nabídka se nemá ukázat'); };
    const multi = { 'mudrlant.homeTab': JSON.stringify('multi') };
    // Znovu načtená aplikace s odhlášeným hráčem z turnaje (ať jde přihlásit znovu)
    // (pozvánka do turnaje vyskakuje při každém druhém spuštění: počítadlo spuštění se vrátí, ať tu nepřekáží)
    const reloadOut = async (tab, db) => { db.entries = []; await tab.evaluate(() => localStorage.setItem('mudrlant.tourPromo', JSON.stringify({ launches: 0 }))); await tab.reload(); await waitForHome(tab); };

    await t.test('nabídka po přihlášení do turnaje: sova, užitek, noční klid, Zapnout → souhlas prohlížeče a potvrzení; už nikdy znovu', async () => {
        const { context, tab, db, log } = await start({ storage: multi });
        assert.equal(await tab.locator('#push-offer').count(), 0, 'po spuštění se nikdo neptá');
        await joinTournament(tab);
        await tab.waitForSelector('#push-offer', { timeout: 10000 });
        assert.equal(await tab.getAttribute('#push-offer', 'data-context'), 'tournament');
        const text = await tab.textContent('#push-offer');
        assert.match(text, /Mám ti dát vědět\?/);
        assert.match(text, /Jsi v turnaji!/);
        assert.match(text, /Začíná tvůj zápas turnaje – kdo kolo neodehraje, vypadává\./);
        assert.match(text, /Někdo tě vyzval\./);
        assert.match(text, /Soupeř dohrál tvoji výzvu\./);
        assert.match(text, /V noci \(21–7 h\) nic neposílám\. Vypnout jde kdykoli v Nastavení → Hra\./);
        assert.ok(await tab.$('#push-offer img[src*="sova-"]'), 'sova Mudrlant');
        assert.equal((await tab.textContent('[data-push-offer-on]')).trim(), 'Zapnout upozornění');
        assert.match(await tab.textContent('#push-offer [data-close]'), /Teď ne/);
        assert.equal(await tab.evaluate(() => window.__push.asked), 0, 'samotná nabídka se prohlížeče neptá');
        // vejde se na telefon bez posouvání a bez přetékání do strany
        assert.deepEqual(await overflow(tab, '#dialog-overlay > div'), { page: 0, box: 0 });
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return box.scrollHeight - box.clientHeight; }), 0, 'okno bez posouvání');
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'nabidka-upozorneni-390.png') });
        const shownRecord = await offerRecord(tab);
        assert.equal(shownRecord.shown, 1, 'ukázání se počítá hned');
        assert.equal(shownRecord.done, false);
        await tab.click('[data-push-offer-on]');
        await tab.waitForSelector('#push-offer[data-done]');
        assert.match(await tab.textContent('#push-offer'), /Upozornění jsou zapnutá/);
        assert.equal(await tab.evaluate(() => window.__push.asked), 1);
        assert.equal(db.subscribed.length, 1, 'zapnutí stejné jako v Nastavení: předplatné uložené na serveru');
        assert.equal((await offerRecord(tab)).done, true);
        await tab.click('#push-offer [data-close]');
        // v Nastavení je zapnuto
        await openSettings(tab);
        await tab.waitForSelector('[data-push-toggle="off"]');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('nabídka: chyba při zapnutí je srozumitelná a jde zkusit znovu; zamítnutí v prohlížeči = už nikdy a návod', async () => {
        const failing = await start({ storage: multi, db: { subscribeStatus: 404 } });
        await joinTournament(failing.tab);
        await failing.tab.waitForSelector('#push-offer');
        await failing.tab.click('[data-push-offer-on]');
        await failing.tab.waitForSelector('[data-push-offer-note]');
        assert.match(await failing.tab.textContent('[data-push-offer-note]'), /Databáze nemá funkce upozornění/);
        assert.match(await failing.tab.textContent('[data-push-offer-on]'), /Zkusit znovu/);
        await failing.context.close();

        const refused = await start({ storage: multi, answer: 'denied' });
        await joinTournament(refused.tab);
        await refused.tab.waitForSelector('#push-offer');
        await refused.tab.click('[data-push-offer-on]');
        await refused.tab.waitForSelector('[data-push-offer-help]');
        assert.match(await refused.tab.textContent('[data-push-offer-note]'), /zablokoval/);
        assert.equal((await offerRecord(refused.tab)).done, true, 'po zamítnutí v prohlížeči už nikdy');
        await refused.tab.click('[data-push-offer-help]');
        await refused.tab.waitForSelector('#push-help');
        await refused.context.close();
    });

    await t.test('„Teď ne“: znovu nejdřív za 7 dní, celkem nejvýš 3×', async () => {
        const { context, tab, db } = await start({ storage: multi });
        await joinTournament(tab);
        await tab.waitForSelector('#push-offer');
        await tab.click('#push-offer [data-close]');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        const first = await offerRecord(tab);
        assert.equal(first.shown, 1);
        assert.ok(Math.abs(first.last - Date.now()) < 60000);
        assert.equal(first.done, false);
        // do 7 dnů nic (znovu přihlášení do turnaje, po 6 dnech)
        await setOfferRecord(tab, { ...first, last: Date.now() - 6 * 86400000 });
        await reloadOut(tab, db);
        await joinTournament(tab);
        await noOffer(tab);
        // po 7 dnech znovu (podruhé)
        await setOfferRecord(tab, { ...(await offerRecord(tab)), last: Date.now() - 8 * 86400000 });
        await reloadOut(tab, db);
        await joinTournament(tab);
        await tab.waitForSelector('#push-offer');
        assert.equal((await offerRecord(tab)).shown, 2);
        await tab.click('#push-offer [data-close]');
        // potřetí ukázaná nabídka je poslední
        await setOfferRecord(tab, { ...(await offerRecord(tab)), shown: 3, last: Date.now() - 30 * 86400000 });
        await reloadOut(tab, db);
        await joinTournament(tab);
        await noOffer(tab);
        await context.close();
    });

    await t.test('nabídka se neukáže, když prohlížeč už povolil nebo zablokoval, nebo když jsou upozornění zapnutá', async () => {
        for (const permission of ['denied', 'granted']) {
            const { context, tab } = await start({ storage: multi, permission });
            await joinTournament(tab);
            await noOffer(tab, 5000);
            assert.equal((await offerRecord(tab)).done, true, `${permission}: už nikdy`);
            assert.equal(await tab.evaluate(() => window.__push.asked), 0);
            await context.close();
        }
        // bez klíče VAPID ani bez přihlášení se nic neplánuje
        const noKey = await start({ storage: multi, key: '' });
        await joinTournament(noKey.tab);
        await noOffer(noKey.tab);
        await noKey.context.close();
    });

    await t.test('jinak nejdřív při 3. otevření záložky Více hráčů; ne během tutoriálu a ne přes jiné okno', async () => {
        const { context, tab } = await start();
        const toMulti = async () => { await tab.click('#home-tabs [data-tab="multi"]'); await tab.waitForFunction(() => document.querySelector('#home-tabs [data-tab="multi"]').getAttribute('aria-selected') === 'true'); };
        const toSingle = () => tab.click('#home-tabs [data-tab="single"]');
        await toMulti();
        await noOffer(tab, 4000);
        await toSingle();
        await toMulti();
        await noOffer(tab, 4000);
        assert.equal((await offerRecord(tab)).opens, 2);
        await toSingle();
        await toMulti();
        await tab.waitForSelector('#push-offer', { timeout: 10000 });
        assert.equal(await tab.getAttribute('#push-offer', 'data-context'), 'multi');
        await context.close();

        // tutoriál běží: nabídka počká a ze záložky Více hráčů se tentokrát vzdá
        const tutorial = await start({ storage: { 'mudrlant.pushOffer': JSON.stringify({ 'u-1': { shown: 0, last: 0, opens: 2, done: false } }) } });
        await tutorial.tab.evaluate(() => localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'running', step: 2 })));
        await tutorial.tab.click('#home-tabs [data-tab="multi"]');
        await noOffer(tutorial.tab, 8000);
        assert.equal((await offerRecord(tutorial.tab)).shown, 0, 'během tutoriálu se nepočítá ani neukáže');
        await tutorial.context.close();

        // jiné okno (Nastavení) je otevřené: nabídka po přihlášení do turnaje počká, až se zavře
        const busy = await start({ storage: multi });
        await joinTournament(busy.tab);
        await openSettings(busy.tab);
        await busy.tab.waitForTimeout(4500);
        assert.equal(await busy.tab.locator('#push-offer').count(), 0, 'ne přes otevřené Nastavení');
        await busy.tab.keyboard.press('Escape');
        await busy.tab.waitForSelector('#push-offer', { timeout: 10000 });
        await busy.context.close();
    });

    await t.test('iPhone bez přidání na plochu: místo nabídky jednou krátká rada', async () => {
        const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
        const { context, tab, log } = await start({ storage: multi, noPush: true, userAgent: iphone });
        await joinTournament(tab);
        await tab.waitForSelector('#push-offer-ios', { timeout: 10000 });
        assert.match(await tab.textContent('#push-offer-ios'), /Na iPhonu nejdřív Sdílet → Přidat na plochu a otevři odtamtud/);
        assert.equal((await offerRecord(tab)).done, true, 'rada jen jednou');
        assert.deepEqual(await overflow(tab, '#dialog-overlay > div'), { page: 0, box: 0 });
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
