// Service worker: strategie síť → mezipaměť, nezapisuje do mezipaměti cizí obsah (přihlašovací stránka Wi-Fi), padá na mezipaměť bez sítě.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

const makeWorker = ({ networkResponse, cached = {} }) => {
    const handlers = {};
    const stored = new Map(Object.entries(cached));
    const puts = [];
    const caches = {
        open: async () => ({ put: async (request, response) => { puts.push(request.url); stored.set(request.url, response); }, addAll: async () => {} }),
        match: async (request) => stored.get(typeof request === 'string' ? `https://app.test/${request}` : request.url),
        keys: async () => [], delete: async () => true
    };
    const sandbox = {
        self: { location: { origin: 'https://app.test' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: () => {}, clients: { claim: async () => {} } },
        caches, URL, Request: class { constructor(url) { this.url = url; } }, Response: { error: () => ({ error: true }) }, Promise, setTimeout, clearTimeout,
        fetch: async () => { if (networkResponse instanceof Error) throw networkResponse; return networkResponse; }
    };
    vm.runInNewContext(source, sandbox);
    const run = async (url, mode = 'no-cors') => {
        let answer;
        const waits = [];
        handlers.fetch({ request: { method: 'GET', url, mode, clone() { return this; } }, respondWith: (promise) => { answer = promise; }, waitUntil: (promise) => waits.push(promise) });
        const response = await answer;
        await Promise.all(waits);
        return response;
    };
    return { run, puts };
};
const reply = (body, type = 'application/javascript', ok = true) => ({ ok, headers: { get: () => type }, clone() { return this; }, body });

test('sw: dobrý soubor se uloží, přihlašovací HTML místo skriptu ne', async () => {
    const good = makeWorker({ networkResponse: reply('ok') });
    assert.equal((await good.run('https://app.test/app.js')).body, 'ok');
    assert.deepEqual(good.puts, ['https://app.test/app.js']);
    const portal = makeWorker({ networkResponse: reply('<html>Přihlaste se k Wi-Fi', 'text/html; charset=utf-8') });
    await portal.run('https://app.test/app.js');
    await portal.run('https://app.test/data/zemepis.json');
    assert.deepEqual(portal.puts, [], 'HTML se do mezipaměti jako skript nebo data nedostane');
    const page = makeWorker({ networkResponse: reply('<html>', 'text/html') });
    await page.run('https://app.test/', 'navigate');
    assert.equal(page.puts.length, 1, 'stránka aplikace se ukládá');
    const error404 = makeWorker({ networkResponse: reply('x', 'text/plain', false) });
    await error404.run('https://app.test/chybi.js');
    assert.deepEqual(error404.puts, []);
});

test('sw: bez sítě poslouží mezipaměť, cizí adresy a POST se nechytají', async () => {
    const offline = makeWorker({ networkResponse: new TypeError('offline'), cached: { 'https://app.test/app.js': reply('z cache') } });
    assert.equal((await offline.run('https://app.test/app.js')).body, 'z cache');
    const empty = makeWorker({ networkResponse: new TypeError('offline') });
    assert.deepEqual(await empty.run('https://app.test/neznamy.js'), { error: true });
    let intercepted = false;
    const worker = makeWorker({ networkResponse: reply('x') });
    void worker;
    const handlers = {};
    vm.runInNewContext(source, { self: { location: { origin: 'https://app.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } }, caches: {}, URL, Request: class {}, Response: {}, fetch: async () => {} });
    handlers.fetch({ request: { method: 'GET', url: 'https://cs.wikipedia.org/w/api.php', mode: 'cors' }, respondWith: () => { intercepted = true; } });
    handlers.fetch({ request: { method: 'POST', url: 'https://app.test/x', mode: 'cors' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
});
