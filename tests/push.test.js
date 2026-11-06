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
const makeRoot = ({ permission = 'default', answer = 'granted', existing = null, config = {}, session = true, fail = null } = {}) => {
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
            if (fail && fail(url, init)) return { ok: false, status: 500, text: async () => '' };
            return { ok: true, status: 200, text: async () => (url.includes('profiles?') && init.method === 'GET' ? JSON.stringify([{ push_tournament: true, push_challenge: false }]) : '') };
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

test('push.js: volby turnaje a výzev se čtou a ukládají jen k vlastnímu profilu', async () => {
    const env = makeRoot();
    assert.deepEqual(await env.api.getPrefs('u-1'), { tournament: true, challenge: false });
    assert.deepEqual(await env.api.savePrefs('u-1', { tournament: false, challenge: true }), { tournament: false, challenge: true });
    const patch = env.calls.find(call => call.method === 'PATCH');
    assert.equal(patch.url, 'https://proj.supabase.co/rest/v1/profiles?id=eq.u-1');
    assert.deepEqual(patch.body, { push_tournament: false, push_challenge: true });
    assert.equal(await makeRoot({ fail: () => true }).api.getPrefs('u-1'), null, 'starší databáze bez sloupců');
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
    const click = async (url) => {
        const waits = [];
        let closed = false;
        handlers.notificationclick({ notification: { close: () => { closed = true; }, data: url === undefined ? undefined : { url } }, waitUntil: (promise) => waits.push(promise) });
        await Promise.all(waits);
        return closed;
    };
    return { push, click, shown, opened, messages };
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
    assert.deepEqual(JSON.parse(JSON.stringify(running.messages)), [{ url: 'https://app.test/app/', message: { type: 'push-open', tab: 'multi' } }]);
    const foreign = makeWorker();
    await foreign.click('https://evil.example/phish?tab=multi');
    assert.deepEqual(foreign.opened, ['https://app.test/app/'], 'cizí adresa se nikdy neotevře');
    const empty = makeWorker();
    await empty.click(undefined);
    assert.deepEqual(empty.opened, ['https://app.test/app/']);
});

// --- odesílač ---
test('send-push: runOnce pošle, zapíše jen doručené klíče a rozliší zrušené odběry', async () => {
    const { runOnce, payloadFor, classifyError, readConfig, isQuietHour } = await import('../scripts/send-push.mjs');
    const row = (n, extra = {}) => ({ user_id: `u${n}`, endpoint: `https://p.example/${n}`, p256dh: P256DH, auth: AUTH, kind: 'challenge', title: `T${n}`, body: `B${n}`, url: './?tab=multi', dedupe_key: `chal:${n}`, ...extra });
    const rpcCalls = [];
    const rows = [row(1), row(2), row(3), row(4, { dedupe_key: 'chal:1', endpoint: 'https://p.example/4' })];
    const rpc = async (name, body) => { rpcCalls.push({ name, body }); return name === 'push_due' ? rows : null; };
    const sentTo = [];
    const send = async (sub, payload) => {
        sentTo.push(sub.endpoint);
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
    assert.deepEqual(readConfig(read('config.js')).url, 'https://huddetwgroskdhozlkcf.supabase.co');
    // noční klid podle pražského času (leden = UTC+1, červenec = UTC+2)
    assert.equal(isQuietHour(new Date('2026-01-15T05:30:00Z')), true);   // 6:30
    assert.equal(isQuietHour(new Date('2026-01-15T06:30:00Z')), false);  // 7:30
    assert.equal(isQuietHour(new Date('2026-07-15T18:59:00Z')), false);  // 20:59
    assert.equal(isQuietHour(new Date('2026-07-15T19:00:00Z')), true);   // 21:00
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

test('souhlas: aplikace nezapíná upozornění sama, odhlášení je maže a schema posílá jen odběratelům', () => {
    const app = read('app.js');
    // enable se volá jen z klepnutí na tlačítko (togglePush), nikde jinde
    assert.equal((app.match(/Push\.enable\(/g) || []).length, 1);
    assert.match(app, /Push\.disable\(\)\.catch\(\(\) => \{\}\)\s*:\s*Promise\.resolve\(\)\)\.then\(\(\) => Auth\.logout\(\)\)/);
    const schema = read('supabase/schema.sql');
    assert.match(schema, /from fresh f join public\.push_subscriptions s on s\.user_id = f\.user_id/);
    assert.match(schema, /create policy "push: vlastní odběry" on public\.push_subscriptions for select to authenticated using \(user_id = auth\.uid\(\)\)/);
});
