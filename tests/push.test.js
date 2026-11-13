// Web push: klient (push.js: klíč VAPID, tvar předplatného, zapnutí, vypnutí, volby), service worker (push, notificationclick),
// odesílač (scripts/send-push.mjs) a hlídání, že se nic neposílá bez souhlasu a že v repozitáři není žádný tajný klíč.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const Push = require('../push.js');

// 65 bajtů začínajících 0x04 jako base64url = 87 znaků
const VAPID = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const ENDPOINT = 'https://push.example.com/send/abc';

const subscription = (extra = {}) => ({
    endpoint: ENDPOINT, unsubscribed: 0, options: {},
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: P256DH, auth: AUTH } }; },
    async unsubscribe() { this.unsubscribed++; return true; }, ...extra
});

// Prostředí prohlížeče: Notification, service worker s pushManager, fetch do „databáze“
const makeRoot = ({ permission = 'default', answer = 'granted', existing = null, config = {}, session = true, fail = null, reply = null } = {}) => {
    const calls = [];
    const manager = {
        current: existing,
        async getSubscription() { return this.current; },
        async subscribe(options) { calls.push({ subscribe: options }); this.current = subscription(); return this.current; }
    };
    const root = {
        MUDRLANT_CONFIG: { supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon', vapidPublicKey: VAPID, ...config },
        MudrlantAuth: { isConfigured: () => true, hasSession: () => session, accessToken: async () => (session ? 'tok' : null) },
        navigator: { userAgent: 'Chrome', serviceWorker: { ready: Promise.resolve({ pushManager: manager }) } },
        PushManager: function PushManager() {},
        Notification: { permission, requestPermission: async () => { root.Notification.permission = answer; return answer; } },
        isSecureContext: true,
        fetch: async (url, init) => {
            calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
            const failed = fail && fail(url, init);
            if (failed instanceof Error) throw failed;
            if (failed) return { ok: false, status: typeof failed === 'number' ? failed : 500, text: async () => '' };
            if (reply) { const body = reply(url, init); if (body !== undefined) return { ok: true, status: 200, text: async () => JSON.stringify(body) }; }
            return { ok: true, status: 200, text: async () => (url.includes('profiles?') && init.method === 'GET' ? JSON.stringify([{ push_tournament: true, push_challenge: false, push_conquest: true }]) : '') };
        }
    };
    return { root, calls, manager, api: Push.make(root) };
};

test('push.js: klíč VAPID a tvar předplatného', () => {
    assert.equal(Push.urlBase64ToBytes(VAPID).length, 65);
    assert.equal(Push.urlBase64ToBytes(VAPID)[0], 4);
    assert.ok(Push.rowFromSubscription(subscription()));
    assert.deepEqual(Push.rowFromSubscription(subscription()), { endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH });
    assert.equal(Push.rowFromSubscription(subscription({ endpoint: 'http://x.example/a' })), null, 'jen https');
    assert.equal(Push.rowFromSubscription(subscription({ toJSON() { return { endpoint: ENDPOINT, keys: { p256dh: 'x', auth: AUTH } }; } })), null);
    assert.equal(Push.rowFromSubscription(null), null);
    assert.equal(Push.make(makeRoot({ config: { vapidPublicKey: 'kratky' } }).root).vapidKey(), '');
});

test('push.js: bez klíče nebo bez podpory se nabídka neukáže / vysvětlí', async () => {
    assert.equal((await makeRoot({ config: { vapidPublicKey: '' } }).api.state()).kind, 'hidden');
    const ios = makeRoot();
    delete ios.root.PushManager;
    ios.root.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    assert.deepEqual(await Push.make(ios.root).state(), { kind: 'unsupported', ios: true });
    assert.equal((await makeRoot({ permission: 'denied' }).api.state()).kind, 'denied');
    assert.equal((await makeRoot({ permission: 'default' }).api.state()).kind, 'off');
    assert.equal((await makeRoot({ permission: 'granted', existing: subscription() }).api.state()).kind, 'on');
    await assert.rejects(makeRoot({ config: { vapidPublicKey: '' } }).api.enable());
});

test('push.js: zapnutí žádá o souhlas, přihlásí odběr s klíčem serveru a uloží ho přes RPC', async () => {
    const env = makeRoot();
    const result = await env.api.enable();
    assert.deepEqual(result, { ok: true });
    const subscribe = env.calls.find(call => call.subscribe).subscribe;
    assert.equal(subscribe.userVisibleOnly, true);
    assert.equal(subscribe.applicationServerKey.length, 65);
    const save = env.calls.find(call => call.url);
    assert.equal(save.url, 'https://proj.supabase.co/rest/v1/rpc/push_subscribe');
    assert.deepEqual(save.body, { endpoint_url: ENDPOINT, key_p256dh: P256DH, key_auth: AUTH });
});

test('push.js: odmítnutý souhlas nic nepřihlásí ani neuloží', async () => {
    const env = makeRoot({ answer: 'denied' });
    assert.deepEqual(await env.api.enable(), { ok: false, reason: 'denied' });
    assert.equal(env.calls.length, 0);
    const dismissed = makeRoot({ answer: 'default' });
    assert.deepEqual(await dismissed.api.enable(), { ok: false, reason: 'dismissed' });
    assert.equal(dismissed.calls.length, 0);
});

test('push.js: když uložení na server selže, předplatné v prohlížeči se zruší (nezůstane odběr, o kterém server neví)', async () => {
    const env = makeRoot({ fail: (url) => url.includes('push_subscribe') });
    await assert.rejects(env.api.enable());
    assert.equal(env.manager.current.unsubscribed, 1);
});

test('push.js: vypnutí smaže řádek v databázi (jen svůj endpoint) i předplatné; bez sítě aspoň to v prohlížeči', async () => {
    const live = subscription();
    const env = makeRoot({ permission: 'granted', existing: live });
    assert.deepEqual(await env.api.disable(), { ok: true });
    const call = env.calls.find(entry => entry.method === 'DELETE');
    assert.equal(call.url, `https://proj.supabase.co/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ENDPOINT)}`);
    assert.equal(live.unsubscribed, 1);
    const offline = subscription();
    const broken = makeRoot({ permission: 'granted', existing: offline, fail: () => true });
    assert.deepEqual(await broken.api.disable(), { ok: false });
    assert.equal(offline.unsubscribed, 1, 'v prohlížeči je odběr zrušen vždy');
    assert.deepEqual(await makeRoot().api.disable(), { ok: true }, 'bez odběru není co rušit');
});

test('push.js: volby turnaje, výzev a Dobývání se čtou a ukládají jen k vlastnímu profilu', async () => {
    const env = makeRoot();
    assert.deepEqual(await env.api.getPrefs('u-1'), { tournament: true, challenge: false, conquest: true });
    assert.equal(env.calls.find(call => call.method === 'GET').url, 'https://proj.supabase.co/rest/v1/profiles?id=eq.u-1&select=push_tournament,push_challenge,push_conquest');
    assert.deepEqual(await env.api.savePrefs('u-1', { tournament: false, challenge: true, conquest: false }), { tournament: false, challenge: true, conquest: false });
    const patch = env.calls.find(call => call.method === 'PATCH');
    assert.equal(patch.url, 'https://proj.supabase.co/rest/v1/profiles?id=eq.u-1');
    assert.deepEqual(patch.body, { push_tournament: false, push_challenge: true, push_conquest: false });
    assert.equal(await makeRoot({ fail: () => true }).api.getPrefs('u-1'), null, 'starší databáze bez sloupců');
    // Databáze před schématem 23 (bez push_conquest): turnaje a výzvy ano, Dobývání null (dlaždice se neukáže a neukládá se)
    const old = makeRoot({ fail: (url) => url.includes('push_conquest'), reply: (url, init) => (url.includes('profiles?') && init.method === 'GET' ? [{ push_tournament: false, push_challenge: true }] : undefined) });
    assert.deepEqual(await old.api.getPrefs('u-1'), { tournament: false, challenge: true, conquest: null });
    assert.deepEqual(await old.api.savePrefs('u-1', { tournament: true, challenge: true, conquest: null }), { tournament: true, challenge: true, conquest: null });
    assert.deepEqual(old.calls.find(call => call.method === 'PATCH').body, { push_tournament: true, push_challenge: true });
});

test('push.js: chyby nesou druh (kind), podle kterého aplikace ukáže konkrétní příčinu a radu', async () => {
    const kindOf = async (promise) => { try { await promise; return 'bez chyby'; } catch (error) { return { kind: error.kind, status: error.status, detail: error.detail }; } };
    // push služba prohlížeče odmítla odběr: název a zpráva chyby
    const refused = makeRoot();
    refused.manager.subscribe = async () => { const error = new Error('Registration failed - push service error'); error.name = 'AbortError'; throw error; };
    assert.deepEqual(await kindOf(refused.api.enable()), { kind: 'subscribe', status: 0, detail: 'AbortError: Registration failed - push service error' });
    // databáze bez funkcí upozornění (404) a jiná chyba serveru; předplatné v prohlížeči se zruší
    const missing = makeRoot({ fail: (url) => (url.includes('push_subscribe') ? 404 : false) });
    assert.deepEqual(await kindOf(missing.api.enable()), { kind: 'server', status: 404, detail: '' });
    assert.equal(missing.manager.current.unsubscribed, 1);
    assert.equal((await kindOf(makeRoot({ fail: (url) => (url.includes('push_subscribe') ? 503 : false) }).api.enable())).status, 503);
    // vypršelé přihlášení, bez spojení, nespuštěný service worker, nepodporovaný prohlížeč
    assert.equal((await kindOf(makeRoot({ fail: (url) => (url.includes('push_subscribe') ? 401 : false) }).api.enable())).kind, 'auth');
    assert.equal((await kindOf(makeRoot({ session: false }).api.enable())).kind, 'auth');
    assert.equal((await kindOf(makeRoot({ fail: () => new TypeError('Failed to fetch') }).api.enable())).kind, 'network');
    const noWorker = makeRoot();
    noWorker.root.navigator.serviceWorker = { ready: Promise.reject(new Error('neběží')) };
    noWorker.root.navigator.serviceWorker.ready.catch(() => {});
    assert.equal((await kindOf(Push.make(noWorker.root).enable())).kind, 'worker');
    assert.equal((await kindOf(makeRoot({ config: { vapidPublicKey: '' } }).api.enable())).kind, 'unsupported');
});

test('push.js: diagnostika ukáže povolení, service worker, předplatné (zkráceně), klíč a odpověď serveru – bez klíčů předplatného', async () => {
    const env = makeRoot({ permission: 'granted', existing: subscription(), reply: (url) => (url.includes('push_subscriptions?select=endpoint') ? [{ endpoint: ENDPOINT }] : undefined) });
    env.root.navigator.serviceWorker.getRegistration = async () => ({ scope: 'https://app.test/', active: { state: 'activated' } });
    env.root.navigator.serviceWorker.controller = {};
    const d = await env.api.diagnose();
    assert.equal(d.permission, 'granted');
    assert.equal(d.vapid, VAPID.slice(0, 8));
    assert.equal(d.vapidValid, true);
    assert.deepEqual(d.registration, { scope: 'https://app.test/', active: 'activated', waiting: false, installing: false });
    assert.equal(d.controlled, true);
    assert.equal(d.ready, true);
    assert.equal(d.subscription.endpoint, 'push.example.com/…send/abc');
    assert.deepEqual(d.server, { status: 200, count: 1, thisDevice: true });
    assert.doesNotMatch(JSON.stringify(d), new RegExp(`${P256DH}|${AUTH}|${ENDPOINT.replace(/\//g, '\\/')}`), 'klíče ani celá adresa odběru se neukazují');
    // tabulka chybí (404), bez předplatného, nepřihlášený
    const broken = await makeRoot({ fail: () => 404 }).api.diagnose();
    assert.deepEqual(broken.server, { status: 404, kind: 'server' });
    assert.deepEqual(broken.subscription, { none: true });
    assert.equal((await makeRoot({ session: false }).api.diagnose()).server, null);
});

test('push.js: zkouška v zařízení pošle service workeru zprávu a čeká na odpověď; bez povolení nic nepošle', async () => {
    assert.deepEqual(await makeRoot({ permission: 'default' }).api.testLocal(), { ok: false, reason: 'permission', permission: 'default' });
    const env = makeRoot({ permission: 'granted' });
    const posted = [];
    env.root.MessageChannel = MessageChannel;
    env.root.navigator.serviceWorker = { ready: Promise.resolve({ pushManager: env.manager, active: { postMessage: (message, ports) => { posted.push(message); ports[0].postMessage({ ok: true }); } } }) };
    assert.deepEqual(await Push.make(env.root).testLocal(), { ok: true });
    assert.deepEqual(posted, [{ type: 'push-test', payload: Push.TEST_PAYLOAD }]);
    assert.equal(Push.TEST_PAYLOAD.kind, 'test');
    assert.equal(Push.TEST_PAYLOAD.url, './?tab=multi');
    const failing = makeRoot({ permission: 'granted' });
    failing.root.MessageChannel = MessageChannel;
    failing.root.navigator.serviceWorker = { ready: Promise.resolve({ pushManager: failing.manager, active: { postMessage: (message, ports) => ports[0].postMessage({ ok: false, error: 'TypeError: No notification permission' }) } }) };
    assert.deepEqual(await Push.make(failing.root).testLocal(), { ok: false, reason: 'failed', detail: 'TypeError: No notification permission' });
    const inactive = makeRoot({ permission: 'granted' });
    inactive.root.MessageChannel = MessageChannel;
    assert.deepEqual(await inactive.api.testLocal(), { ok: false, reason: 'worker' }, 'service worker bez aktivní verze');
});

test('push.js: zkouška přes server volá jen dev_push_test a vrátí počet zařízení; účet mimo dev_admins dostane srozumitelnou chybu', async () => {
    const env = makeRoot({ reply: (url) => (url.endsWith('rpc/dev_push_test') ? 2 : undefined) });
    assert.equal(await env.api.requestServerTest(), 2);
    assert.deepEqual(env.calls.map(call => call.url), ['https://proj.supabase.co/rest/v1/rpc/dev_push_test']);
    await assert.rejects(makeRoot({ fail: () => 403 }).api.requestServerTest(), (error) => error.kind === 'forbidden');
    await assert.rejects(makeRoot({ fail: () => 404 }).api.requestServerTest(), (error) => error.kind === 'server' && error.status === 404);
});

test('push.js: stav okamžitého odesílání (dev_push_status); starší databáze, cizí účet nebo chyba spojení = null (obecný text)', async () => {
    const status = { instant: true, token: true, pg_net: true, cron: true, github: 204, last_dispatch: '2026-11-07T10:00:00Z' };
    const env = makeRoot({ reply: (url) => (url.endsWith('rpc/dev_push_status') ? status : undefined) });
    assert.deepEqual(await env.api.serverPushStatus(), { instant: true, token: true, pgNet: true, cron: true, github: 204 });
    assert.deepEqual(env.calls.map(call => [call.url, call.method]), [['https://proj.supabase.co/rest/v1/rpc/dev_push_status', 'POST']]);
    const partial = makeRoot({ reply: () => ({ instant: false, token: true, pg_net: false, cron: false, github: null }) });
    assert.deepEqual(await partial.api.serverPushStatus(), { instant: false, token: true, pgNet: false, cron: false, github: null });
    // jen skutečné true platí (řetězec ani číslo ne); kód odpovědi GitHubu jen jako kladné celé číslo
    assert.deepEqual(await makeRoot({ reply: () => ({ instant: 'true', github: '<b>' }) }).api.serverPushStatus(), { instant: false, token: false, pgNet: false, cron: false, github: null });
    for (const fail of [() => 404, () => 403, () => new TypeError('Failed to fetch')]) assert.equal(await makeRoot({ fail }).api.serverPushStatus(), null);
    assert.equal(await makeRoot({ reply: () => [] }).api.serverPushStatus(), null);
    assert.equal(await makeRoot({ session: false }).api.serverPushStatus(), null);
});

// --- service worker ---
const makeWorker = ({ windows = [] } = {}) => {
    const handlers = {};
    const shown = [];
    const opened = [];
    const messages = [];
    const clients = windows.map(url => ({ url, focus: async () => {}, postMessage: (message) => messages.push({ url, message }) }));
    const sandbox = {
        self: {
            location: { origin: 'https://app.test' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting() {}, clients: {
                claim: async () => {}, matchAll: async () => clients, openWindow: async (url) => { opened.push(url); }
            },
            registration: { scope: 'https://app.test/app/', showNotification: async (title, options) => { shown.push({ title, options }); } }
        },
        caches: {}, URL, Request: class {}, Response: {}, Promise, setTimeout, clearTimeout, fetch: async () => {}
    };
    vm.runInNewContext(read('sw.js'), sandbox);
    const push = async (data) => {
        const waits = [];
        handlers.push({ data: data === undefined ? null : { json: () => { if (data instanceof Error) throw data; return data; } }, waitUntil: (promise) => waits.push(promise) });
        await Promise.all(waits);
    };
    const click = async (url, data = undefined) => {
        const waits = [];
        let closed = false;
        handlers.notificationclick({ notification: { close: () => { closed = true; }, data: data || (url === undefined ? undefined : { url }) }, waitUntil: (promise) => waits.push(promise) });
        await Promise.all(waits);
        return closed;
    };
    // Zpráva od stránky (vývojářská zkouška upozornění); odpověď přes port
    const message = async (data) => {
        const waits = [];
        const replies = [];
        handlers.message({ data, ports: [{ postMessage: (answer) => replies.push(answer) }], waitUntil: (promise) => waits.push(promise) });
        await Promise.all(waits);
        return JSON.parse(JSON.stringify(replies));
    };
    return { push, click, message, shown, opened, messages, sandbox };
};

test('sw: push ukáže upozornění (vždy, i s chybným obsahem) a ořízne dlouhé texty', async () => {
    const worker = makeWorker();
    await worker.push({ title: 'Turnaj: dnes hraješ finále', body: 'Soupeř: Petr', url: './?tab=multi', kind: 'tournament' });
    assert.equal(worker.shown[0].title, 'Turnaj: dnes hraješ finále');
    assert.equal(worker.shown[0].options.body, 'Soupeř: Petr');
    assert.equal(worker.shown[0].options.tag, 'tournament');
    assert.equal(worker.shown[0].options.data.url, './?tab=multi');
    await worker.push(undefined);
    await worker.push(new Error('není JSON'));
    await worker.push('text');
    assert.equal(worker.shown.length, 4, 'prohlížeč vyžaduje upozornění ke každému push');
    assert.equal(worker.shown[1].title, 'Mudrlant');
    await worker.push({ title: 'x'.repeat(500), body: 'y'.repeat(500) });
    assert.equal(worker.shown[4].title.length, 80);
    assert.equal(worker.shown[4].options.body.length, 200);
});

test('sw: klepnutí otevře aplikaci na záložce Více hráčů (nové okno), nebo ji zaostří a pošle jí zprávu', async () => {
    const closed = makeWorker();
    assert.equal(await closed.click('./?tab=multi'), true, 'upozornění se zavře');
    assert.deepEqual(closed.opened, ['https://app.test/app/?tab=multi']);
    const running = makeWorker({ windows: ['https://app.test/app/'] });
    await running.click('./?tab=multi');
    assert.equal(running.opened.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(running.messages)), [{ url: 'https://app.test/app/', message: { type: 'push-open', tab: 'multi', vyzva: '', dobyvani: '', kind: '' } }]);
    // druh upozornění jde s klepnutím do aplikace (zkušební upozornění tak potvrdí, že klepnutí funguje)
    const test = makeWorker({ windows: ['https://app.test/app/'] });
    await test.click(undefined, { url: './?tab=multi', kind: 'test' });
    assert.deepEqual(JSON.parse(JSON.stringify(test.messages[0].message)), { type: 'push-open', tab: 'multi', vyzva: '', dobyvani: '', kind: 'test' });
    // Upozornění k výzvě nese kód: běžící aplikace otevře rovnou okno výzvy
    const result = makeWorker({ windows: ['https://app.test/app/'] });
    await result.click(undefined, { url: './?tab=multi&vyzva=ABC234', kind: 'challenge' });
    assert.deepEqual(JSON.parse(JSON.stringify(result.messages[0].message)), { type: 'push-open', tab: 'multi', vyzva: 'ABC234', dobyvani: '', kind: 'challenge' });
    // Upozornění na útok v Dobývání nese kód hry: běžící aplikace otevře rovnou hru, zavřená ji otevře z odkazu
    const attack = makeWorker({ windows: ['https://app.test/app/'] });
    await attack.click(undefined, { url: './?dobyvani=K7M2QX', kind: 'conquest' });
    assert.deepEqual(JSON.parse(JSON.stringify(attack.messages[0].message)), { type: 'push-open', tab: '', vyzva: '', dobyvani: 'K7M2QX', kind: 'conquest' });
    const cold = makeWorker();
    await cold.click(undefined, { url: './?dobyvani=K7M2QX', kind: 'conquest' });
    assert.deepEqual(cold.opened, ['https://app.test/app/?dobyvani=K7M2QX']);
    // Upozornění ke kolu (všichni dohráli kolo, kolo brzy končí; blok 29) mají stejný odkaz: otevřou hru, okno dalšího kola ukáže hra sama
    for (const kind of ['conquest_round', 'conquest_ending']) {
        const round = makeWorker({ windows: ['https://app.test/app/'] });
        await round.click(undefined, { url: './?dobyvani=K7M2QX', kind });
        assert.deepEqual(JSON.parse(JSON.stringify(round.messages[0].message)), { type: 'push-open', tab: '', vyzva: '', dobyvani: 'K7M2QX', kind });
    }
    const foreign = makeWorker();
    await foreign.click('https://evil.example/phish?tab=multi');
    assert.deepEqual(foreign.opened, ['https://app.test/app/'], 'cizí adresa se nikdy neotevře');
    const empty = makeWorker();
    await empty.click(undefined);
    assert.deepEqual(empty.opened, ['https://app.test/app/']);
});

test('sw: zkouška ze stránky (push-test) ukáže upozornění stejnou funkcí jako skutečný push a odpoví přes port', async () => {
    const source = read('sw.js');
    // jedna sdílená funkce pro oba případy
    assert.match(source, /const showPush = /);
    assert.match(source, /addEventListener\('push'[\s\S]*?event\.waitUntil\(showPush\(data\)\)/);
    assert.match(source, /addEventListener\('message'[\s\S]*?showPush\(message\.payload\)/);
    const worker = makeWorker();
    const payload = Push.TEST_PAYLOAD;
    assert.deepEqual(await worker.message({ type: 'push-test', payload }), [{ ok: true }]);
    await worker.push(payload);
    assert.equal(worker.shown.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(worker.shown[0])), JSON.parse(JSON.stringify(worker.shown[1])), 'zkouška = skutečný push se stejným obsahem');
    assert.equal(worker.shown[0].title, 'Zkušební upozornění Mudrlanta');
    assert.equal(worker.shown[0].options.tag, 'test');
    assert.deepEqual(JSON.parse(JSON.stringify(worker.shown[0].options.data)), { url: './?tab=multi', kind: 'test' });
    // jiné zprávy service worker ignoruje; chyba prohlížeče (bez povolení) se vrátí stránce
    assert.deepEqual(await worker.message({ type: 'neco-jineho' }), []);
    assert.equal(worker.shown.length, 2);
    worker.sandbox.self.registration.showNotification = async () => { throw Object.assign(new Error('No notification permission has been granted for this origin.'), { name: 'TypeError' }); };
    assert.deepEqual(await worker.message({ type: 'push-test', payload }), [{ ok: false, error: 'TypeError: No notification permission has been granted for this origin.' }]);
    // klepnutí na zkušební upozornění otevře záložku Více hráčů (zavřená aplikace)
    const closed = makeWorker();
    await closed.click(undefined, worker.shown[0].options.data);
    assert.deepEqual(closed.opened, ['https://app.test/app/?tab=multi']);
});

// --- odesílač ---
test('send-push: runOnce pošle, zapíše jen doručené klíče a rozliší zrušené odběry', async () => {
    const { runOnce, payloadFor, classifyError, readConfig, isQuietHour, ttlFor } = await import('../scripts/send-push.mjs');
    const row = (n, extra = {}) => ({ user_id: `u${n}`, endpoint: `https://p.example/${n}`, p256dh: P256DH, auth: AUTH, kind: 'challenge', title: `T${n}`, body: `B${n}`, url: './?tab=multi', dedupe_key: `chal:${n}`, ...extra });
    const rpcCalls = [];
    const rows = [row(1), row(2), row(3), row(4, { dedupe_key: 'chal:1', endpoint: 'https://p.example/4' })];
    const rpc = async (name, body) => { rpcCalls.push({ name, body }); return name === 'push_due' ? rows : null; };
    const sentTo = [];
    const send = async (sub, payload, sentRow) => {
        sentTo.push(sub.endpoint);
        assert.equal(sentRow.endpoint, sub.endpoint, 'odesílač dostane i řádek (kvůli platnosti upozornění)');
        if (sub.endpoint.endsWith('/2')) throw Object.assign(new Error('gone'), { statusCode: 410 });
        if (sub.endpoint.endsWith('/3')) throw Object.assign(new Error('boom'), { statusCode: 500 });
        assert.deepEqual(JSON.parse(payload), { title: sub.endpoint.endsWith('/1') ? 'T1' : 'T4', body: sub.endpoint.endsWith('/1') ? 'B1' : 'B4', url: './?tab=multi', kind: 'challenge' });
    };
    const result = await runOnce({ rpc, send, secret: 'tajne', log: () => {} });
    assert.equal(sentTo.length, 4);
    assert.deepEqual(result, { sent: 2, failed: 1, gone: 1, keys: 1 });
    const mark = rpcCalls.find(call => call.name === 'push_mark').body;
    assert.deepEqual(mark, { secret: 'tajne', keys: ['chal:1'], ok_endpoints: ['https://p.example/1', 'https://p.example/4'], failed_endpoints: ['https://p.example/3'], gone_endpoints: ['https://p.example/2'] });
    assert.equal(rpcCalls[0].body.secret, 'tajne');

    // nic k odeslání: push_mark se nevolá; dry-run: nic se neposílá ani nezapisuje
    const idle = []; await runOnce({ rpc: async (name) => { idle.push(name); return []; }, send, secret: 's', log: () => {} });
    assert.deepEqual(idle, ['push_due']);
    const dry = []; sentTo.length = 0;
    await runOnce({ rpc: async (name) => { dry.push(name); return rows; }, send, secret: 's', dryRun: true, log: () => {} });
    assert.deepEqual(dry, ['push_due']); assert.equal(sentTo.length, 0);

    assert.equal(classifyError({ statusCode: 404 }), 'gone');
    assert.equal(classifyError({ statusCode: 429 }), 'failed');
    assert.equal(classifyError(new Error('síť')), 'failed');
    assert.equal(payloadFor({ title: 'x'.repeat(300), body: 'y'.repeat(300) }).length < 400, true);
    // Platnost v push službě: upozornění ke kolu v Dobývání (blok 29) 10 minut, ostatní 6 hodin
    assert.deepEqual(['conquest_round', 'conquest_ending', 'conquest', 'conquest_invite', 'challenge', 'test', undefined].map(kind => ttlFor({ kind })), [600, 600, 21600, 21600, 21600, 21600, 21600]);
    assert.equal(ttlFor(null), 21600);
    assert.match(read('scripts/send-push.mjs'), /sendNotification\(subscription, payload, \{ TTL: ttlFor\(row\), urgency: 'normal' \}\)/);
    assert.deepEqual(readConfig(read('config.js')).url, 'https://huddetwgroskdhozlkcf.supabase.co');
    // noční klid podle pražského času (leden = UTC+1, červenec = UTC+2)
    assert.equal(isQuietHour(new Date('2026-01-15T05:30:00Z')), true);   // 6:30
    assert.equal(isQuietHour(new Date('2026-01-15T06:30:00Z')), false);  // 7:30
    assert.equal(isQuietHour(new Date('2026-07-15T18:59:00Z')), false);  // 20:59
    assert.equal(isQuietHour(new Date('2026-07-15T19:00:00Z')), true);   // 21:00
});

test('send-push: zkušební upozornění (druh test) se pošle a označí jako ostatní; v nočním klidu ruční běh pošle jen zkoušky', async () => {
    const { runOnce, planRun, payloadFor } = await import('../scripts/send-push.mjs');
    const testRow = { user_id: 'u9', endpoint: 'https://p.example/9', p256dh: P256DH, auth: AUTH, kind: 'test', title: 'Zkušební upozornění Mudrlanta', body: 'Funguje to! Klepni sem a otevře se záložka Více hráčů.', url: './?tab=multi', dedupe_key: 'test:1762500000000:u9' };
    const other = { ...testRow, endpoint: 'https://p.example/1', kind: 'tournament', title: 'Turnaj', dedupe_key: 'tour:m:u1:2026-11-09:rano' };
    // stejný obsah jako skutečné upozornění: service worker ho zobrazí stejnou funkcí
    assert.deepEqual(JSON.parse(payloadFor(testRow)), { ...Push.TEST_PAYLOAD });
    const calls = [];
    const sent = [];
    const rpc = async (name, body) => { calls.push({ name, body }); return name === 'push_due' ? [testRow, other] : null; };
    const send = async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); };
    // ve dne: všechno, push_mark dostane i klíč zkoušky
    assert.deepEqual(await runOnce({ rpc, send, secret: 's', log: () => {} }), { sent: 2, failed: 0, gone: 0, keys: 2 });
    assert.deepEqual(calls.find(call => call.name === 'push_mark').body.keys, ['test:1762500000000:u9', 'tour:m:u1:2026-11-09:rano']);
    // jen zkoušky (noční ruční běh): turnajová zpráva se nepošle ani neoznačí, přijde ráno
    calls.length = 0; sent.length = 0;
    const logs = [];
    assert.deepEqual(await runOnce({ rpc, send, secret: 's', kinds: ['test'], log: (line) => logs.push(line) }), { sent: 1, failed: 0, gone: 0, keys: 1 });
    assert.deepEqual(sent.map(item => item.payload.kind), ['test']);
    assert.deepEqual(calls.find(call => call.name === 'push_mark').body, { secret: 's', keys: ['test:1762500000000:u9'], ok_endpoints: ['https://p.example/9'], failed_endpoints: [], gone_endpoints: [] });
    assert.match(logs.join('\n'), /Noční klid: 1 upozornění počká na ráno/);
    // plán běhu: den = vše; noc + plánovaný běh = nic; noc + ruční běh = jen zkoušky; FORCE = vše
    const night = new Date('2026-01-15T22:30:00Z'); // 23:30 Praha
    const day = new Date('2026-01-15T10:00:00Z');
    assert.deepEqual(planRun({ now: day }), { send: true, kinds: null });
    assert.deepEqual(planRun({ now: day, manual: true }), { send: true, kinds: null });
    assert.deepEqual(planRun({ now: night }), { send: false, kinds: null });
    assert.deepEqual(planRun({ now: night, manual: true }), { send: true, kinds: ['test'] });
    assert.deepEqual(planRun({ now: night, force: true }), { send: true, kinds: null });
    // workflow předává, že jde o ruční běh
    assert.match(read('.github/workflows/push.yml'), /MANUAL: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}/);
});

// --- nasazení a bezpečnost ---
test('nasazení: push.js je v index.html, sw.js i pages.yml; workflow nepoužívá service_role', () => {
    assert.match(read('index.html'), /<script src="push\.js" defer><\/script>/);
    assert.match(read('sw.js'), /'push\.js'/);
    assert.match(read('.github/workflows/pages.yml'), /\bpush\.js\b/);
    const workflow = read('.github/workflows/push.yml');
    assert.match(workflow, /schedule:/);
    assert.match(workflow, /secrets\.VAPID_PRIVATE_KEY/);
    assert.match(workflow, /secrets\.PUSH_CRON_SECRET/);
    for (const file of ['.github/workflows/push.yml', 'scripts/send-push.mjs', 'push.js', 'config.js', 'docs/SUPABASE.md']) {
        assert.doesNotMatch(read(file), /sb_secret_[A-Za-z0-9_-]{8,}|SERVICE_ROLE|SUPABASE_SERVICE|eyJ[A-Za-z0-9_-]{20,}/, `${file}: žádný tajný klíč Supabase`);
    }
    assert.doesNotMatch(read('push.js'), /style="|setAttribute\(\s*['"]style|<script/, 'bez inline stylů a skriptů (CSP)');
    assert.match(read('config.js'), /vapidPublicKey:\s*'[A-Za-z0-9_-]*'/);
    assert.doesNotMatch(read('config.js'), /VAPID_PRIVATE|privateKey/i, 'soukromý klíč v repozitáři není');
});

test('okamžité odesílání: databáze spouští push.yml přes workflow_dispatch; token GitHubu jen v databázi, v repozitáři nikde', () => {
    const workflow = read('.github/workflows/push.yml');
    assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*dry_run:/, 'workflow jde spustit přes API s dry_run');
    assert.match(workflow, /schedule:/, 'hodinový plán zůstává jako záloha');
    assert.doesNotMatch(workflow, /github_token|GITHUB_PAT|secrets\.GH_/i, 'token pro okamžité odesílání v GitHub secrets není');
    const schema = read('supabase/schema.sql');
    assert.match(schema, /'\/actions\/workflows\/push\.yml\/dispatches'/);
    assert.match(schema, /jsonb_build_object\('ref', 'main', 'inputs', jsonb_build_object\('dry_run', 'false'\)\)/);
    assert.match(schema, /revoke all on function public\.push_pending\(\), public\.push_quiet_now\(\), public\.push_net_ready\(\), public\.push_kick\(\) from public, anon, authenticated;/);
    assert.doesNotMatch(schema, /grant [^;]*push_kick/, 'push_kick nikomu přes API');
    // noční klid v databázi = noční klid odesílače (QUIET_FROM 7, QUIET_TO 21)
    assert.match(read('scripts/send-push.mjs'), /const QUIET_FROM = 7;[\s\S]*const QUIET_TO = 21;/);
    assert.match(schema, /select h < 7 or h >= 21 from/);
    // návod: hotové SQL se zástupným textem místo tokenu a naplánování push_kick každou minutu
    const docs = read('docs/SUPABASE.md');
    assert.match(docs, /### Okamžité odesílání upozornění/);
    assert.match(docs, /insert into public\.app_secrets \(name, value\) values \('github_token', 'SEM_VLOZ_TOKEN'\)\n\s*on conflict \(name\) do update set value = excluded\.value;/);
    assert.match(docs, /select cron\.schedule\('upozorneni', '\* \* \* \* \*', \$\$select public\.push_kick\(\)\$\$\);/);
    assert.match(read('app.js'), /SUPABASE\.md#okamžité-odesílání-upozornění/, 'aplikace odkazuje na tuto část návodu');
    // žádný skutečný token GitHubu (ani Supabase) v žádném souboru repozitáře
    const skip = new Set(['node_modules', '.git', '.claude', 'data', 'branding', 'icons', 'reports']);
    const files = [];
    const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(rel); } else if (/\.(js|mjs|md|yml|yaml|sql|html|json|txt|sh)$/.test(entry.name)) files.push(rel);
    });
    walk('');
    assert.ok(files.length > 20 && files.includes(path.join('supabase', 'schema.sql')) && files.includes(path.join('docs', 'SUPABASE.md')));
    for (const file of files) {
        assert.doesNotMatch(read(file), /github_pat_[A-Za-z0-9_]{20,}|\bgh[pousr]_[A-Za-z0-9]{30,}/, `${file}: žádný token GitHubu`);
    }
});

test('souhlas: aplikace nezapíná upozornění sama, odhlášení je maže a schema posílá jen odběratelům', () => {
    const app = read('app.js');
    // enable se volá na jediném místě (enablePushNow) a to jen z klepnutí: přepínač, návod „zkontrolovat“, zkouška ve vývojářském režimu a nabídka
    // (plus dokončení po návratu z nastavení prohlížeče, když hráč předtím otevřel návod a povolení už udělil)
    assert.equal((app.match(/Push\.enable\(/g) || []).length, 1);
    assert.equal((app.match(/enablePushNow\(\)/g) || []).length, 4, 'togglePush, finishPushHelp, devPushEnable, acceptPushOffer');
    assert.match(app, /if \(event\.target\.closest\('\[data-push-offer-on\]'\) && !pushOffer\.busy\) acceptPushOffer\(\);/);
    assert.match(app, /if \(pushIntent && permission === 'granted'\) \{ finishPushHelp\(\); return; \}/);
    // samotná nabídka se prohlížeče neptá: tryPushOffer jen čte stav a ukazuje okno
    const offer = app.slice(app.indexOf('const tryPushOffer = async'), app.indexOf('const PUSH_OFFER_LEAD'));
    assert.doesNotMatch(offer, /enablePushNow|requestPermission|Push\.enable/);
    assert.match(app, /Push\.disable\(\)\.catch\(\(\) => \{\}\)\s*:\s*Promise\.resolve\(\)\)\.then\(\(\) => Auth\.logout\(\)\)/);
    const schema = read('supabase/schema.sql');
    assert.match(schema, /from fresh f join public\.push_subscriptions s on s\.user_id = f\.user_id/);
    assert.match(schema, /create policy "push: vlastní odběry" on public\.push_subscriptions for select to authenticated using \(user_id = auth\.uid\(\)\)/);
});
