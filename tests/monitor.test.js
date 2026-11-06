// Sběr chyb z provozu (monitor.js): anonymizace, limity, seskupení, odeslání dávky, zapojení do stránky.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../monitor.js');

const CONFIG = { supabaseUrl: 'https://proj.supabase.co/', supabaseAnonKey: 'sb_publishable_test' };
const make = (extra = {}) => {
    const calls = [];
    let pending = null;
    const fetch = (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return Promise.resolve({ ok: true }); };
    const monitor = M.createMonitor({ config: CONFIG, fetch, agent: 'Agent/1.0', href: 'https://x.github.io/app/?code=ABC123#token=secret', now: () => new Date('2026-11-06T10:00:00Z'), schedule: (run) => { pending = run; return 1; }, cancel: () => {}, ...extra });
    return { monitor, calls };
};
const memory = () => { const data = {}; return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, data }; };

test('monitor: bez nastavení Supabase nic neodesílá', () => {
    const calls = [];
    const monitor = M.createMonitor({ config: {}, fetch: () => calls.push(1) });
    assert.equal(monitor.enabled, false);
    assert.equal(monitor.report('error', new Error('x')), false);
    assert.equal(calls.length, 0);
});

test('monitor: adresy bez parametrů, zásobník zkrácený, žádné osobní údaje', async () => {
    assert.equal(M.cleanUrl('https://x.cz/app/?code=ABC#access_token=t'), 'https://x.cz/app/');
    const error = new Error('Něco se pokazilo');
    error.stack = 'Error: Něco se pokazilo\n    at f (https://x.cz/app/app.js?v=3:10:5)\n\n    at g (https://x.cz/app/app.js#h:11:2)';
    const { monitor, calls } = make();
    monitor.setVersion('abc1234');
    assert.equal(monitor.report('error', error), true);
    await monitor.flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://proj.supabase.co/rest/v1/client_errors');
    assert.equal(calls[0].options.headers.apikey, 'sb_publishable_test');
    const [row] = calls[0].body;
    assert.equal(row.url, 'https://x.github.io/app/');
    assert.equal(row.app_version, 'abc1234');
    assert.equal(row.kind, 'error');
    assert.doesNotMatch(row.stack, /\?v=3|#h|\n\n/);
    assert.deepEqual(Object.keys(row).sort(), ['app_version', 'happened_at', 'hash', 'kind', 'message', 'stack', 'url', 'user_agent']);
    assert.doesNotMatch(JSON.stringify(row), /ABC123|secret/);
});

test('monitor: délky odpovídají omezením v databázi', async () => {
    const error = new Error('x'.repeat(2000));
    error.stack = 'y'.repeat(5000);
    const { monitor, calls } = make();
    monitor.setVersion('v'.repeat(100));
    monitor.report('r'.repeat(50), error);
    await monitor.flush();
    const [row] = calls[0].body;
    assert.ok(row.message.length <= 500 && row.stack.length <= 1000 && row.app_version.length <= 40 && row.kind.length <= 20 && row.hash.length <= 32);
});

test('monitor: stejná chyba jednou, nejvýš 5 za relaci', async () => {
    const { monitor, calls } = make();
    const same = new Error('a');
    assert.equal(monitor.report('error', same), true);
    assert.equal(monitor.report('error', same), false, 'stejná zpráva a zásobník se neposílají znovu');
    for (let i = 0; i < 10; i++) monitor.report('error', new Error(`jiná ${i}`));
    assert.equal(monitor.count(), M.MAX_PER_SESSION);
    await monitor.flush();
    assert.equal(calls[0].body.length, 5);
    assert.equal(await monitor.flush(), false, 'prázdná fronta se neodesílá');
});

test('monitor: denní limit zařízení přežije novou relaci, nový den ho vynuluje', () => {
    const storage = memory();
    let day = '2026-11-06';
    const now = () => new Date(`${day}T10:00:00Z`);
    let total = 0;
    for (let session = 0; session < 6; session++) {
        const { monitor } = make({ storage, now });
        for (let i = 0; i < 5; i++) if (monitor.report('error', new Error(`s${session}-${i}`))) total += 1;
    }
    assert.equal(total, M.MAX_PER_DAY);
    day = '2026-11-07';
    assert.equal(make({ storage, now }).monitor.report('error', new Error('nový den')), true);
    // nefunkční úložiště nevadí
    const broken = { getItem() { throw new Error('zakázáno'); }, setItem() { throw new Error('zakázáno'); } };
    assert.equal(make({ storage: broken }).monitor.report('error', new Error('b')), true);
});

test('monitor: chyba odeslání monitor nerozbije', async () => {
    const monitor = M.createMonitor({ config: CONFIG, fetch: () => Promise.reject(new Error('offline')) });
    monitor.report('error', new Error('a'));
    assert.equal(await monitor.flush(), false);
    const thrower = M.createMonitor({ config: CONFIG, fetch: () => { throw new Error('boom'); } });
    thrower.report('error', new Error('b'));
    assert.equal(await thrower.flush(), false);
});

test('monitor: describe zvládne text, objekt i prázdnou hodnotu', () => {
    assert.equal(M.describe('text').message, 'text');
    assert.equal(M.describe({ a: 1 }).message, '{"a":1}');
    assert.equal(M.describe(undefined, 'záloha').message, 'záloha');
    assert.equal(M.describe(null).message, 'Neznámá chyba');
    assert.equal(M.describe(new TypeError('špatně')).message, 'TypeError: špatně');
});

test('monitor: zapojení do okna – error, unhandledrejection, pagehide', async () => {
    const listeners = {};
    const sent = [];
    const win = {
        MUDRLANT_CONFIG: CONFIG, navigator: { userAgent: 'UA' }, location: { href: 'https://x.cz/?a=1' }, localStorage: memory(),
        fetch: (url, options) => { sent.push(JSON.parse(options.body)); return Promise.resolve({}); },
        addEventListener: (name, fn) => { listeners[name] = fn; }, setTimeout: (fn) => { listeners.timer = fn; return 1; }, clearTimeout: () => {}
    };
    const monitor = M.install(win);
    assert.ok(monitor.enabled);
    listeners.error({ message: '', error: null });
    assert.equal(monitor.pending(), 0, 'chyby načítání zdrojů bez zprávy se nehlásí');
    listeners.error({ message: 'Uncaught', error: new Error('padlo to') });
    listeners.unhandledrejection({ reason: new Error('slib') });
    assert.equal(monitor.pending(), 2);
    listeners.pagehide();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].map(row => row.kind), ['error', 'rejection']);
});
