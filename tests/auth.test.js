// Přihlášení (auth.js) a volání API (social.js): poškozené uložené přihlášení, souběžná obnova tokenu, odhlášení během obnovy,
// chyby serveru, které hráče nesmí odhlásit, a opakování po 401. Vše s napodobeným fetch a localStorage.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const now = () => Math.floor(Date.now() / 1000);
const USER = { id: 'u1', email: 'a@example.com', user_metadata: { full_name: 'Alena' } };

// Čerstvé načtení modulů nad napodobeným prostředím prohlížeče
const setup = ({ stored, fetchImpl }) => {
    const store = new Map();
    if (stored !== undefined) store.set('mudrlant.auth', typeof stored === 'string' ? stored : JSON.stringify(stored));
    const calls = [];
    globalThis.self = globalThis;
    globalThis.MUDRLANT_CONFIG = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'sb_publishable_test' };
    globalThis.localStorage = { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
    globalThis.location = { hash: '', pathname: '/', search: '', origin: 'https://app.test', assign() {} };
    globalThis.fetch = async (url, init = {}) => { calls.push({ url, init }); return fetchImpl(url, init, calls); };
    for (const file of ['auth.js', 'social.js']) delete require.cache[require.resolve(path.join('..', file))];
    const Auth = require('../auth.js');
    globalThis.MudrlantAuth = Auth;
    const Social = require('../social.js');
    return { Auth, Social, store, calls };
};
const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
const goodSession = (extra = {}) => ({ access_token: 'old', refresh_token: 'r1', expires_at: now() + 3600, user: { id: 'u1', email: 'a@example.com', name: 'Alena' }, ...extra });

test('poškozené uložené přihlášení se zahodí a hra běží jako host', async () => {
    for (const bad of ['"abc"', '12', '[]', 'null', '{"access_token":5}', '{"access_token":"x","refresh_token":"y"}', '{rozbité', '{"access_token":"x","refresh_token":"y","expires_at":"zítra"}']) {
        const { Auth, calls } = setup({ stored: bad, fetchImpl: () => { throw new Error('nemá se volat'); } });
        const state = await Auth.init();
        assert.equal(state.user, null, bad);
        assert.equal(Auth.hasSession(), false, bad);
        assert.equal(calls.length, 0, bad);
    }
});

test('souběžné požadavky sdílí jedinou obnovu tokenu', async () => {
    const { Auth, calls } = setup({
        stored: goodSession({ expires_at: now() + 10 }),
        fetchImpl: async (url) => {
            if (url.includes('grant_type=refresh_token')) { await new Promise(resolve => setTimeout(resolve, 20)); return json({ access_token: 'new', refresh_token: 'r2', expires_in: 3600, user: USER }); }
            return json(USER);
        }
    });
    // init sám obnoví (platnost < 90 s); další dvě volání po něm už nic nového nevyvolají
    await Auth.init();
    const before = calls.filter(call => call.url.includes('grant_type=refresh_token')).length;
    assert.equal(before, 1);
    const [a, b, c] = await Promise.all([Auth.accessToken(), Auth.accessToken(), Auth.accessToken()]);
    assert.deepEqual([a, b, c], ['new', 'new', 'new']);
    // vynucená obnova (401) souběžně = zase jedna
    const [d, e] = await Promise.all([Auth.accessToken(true), Auth.accessToken(true)]);
    assert.equal(d, 'new'); assert.equal(e, 'new');
    assert.equal(calls.filter(call => call.url.includes('grant_type=refresh_token')).length, 2);
});

test('odhlášení během obnovy tokenu přihlášení neoživí', async () => {
    const { Auth, store } = setup({
        stored: goodSession(),
        fetchImpl: async (url) => {
            if (url.includes('grant_type=refresh_token')) { await new Promise(resolve => setTimeout(resolve, 30)); return json({ access_token: 'new', refresh_token: 'r2', expires_in: 3600, user: USER }); }
            return json(USER);
        }
    });
    await Auth.init();
    const pending = Auth.accessToken(true);
    await Auth.logout();
    assert.equal(await pending, null);
    assert.equal(Auth.getState().user, null);
    assert.equal(store.get('mudrlant.auth'), undefined, 'po odhlášení se do úložiště nic nevrací');
});

test('přetížený server a výpadek sítě hráče neodhlásí, odmítnutý token ano', async () => {
    for (const status of [429, 500, 502, 503]) {
        const { Auth, store } = setup({ stored: goodSession({ expires_at: now() + 5 }), fetchImpl: async () => json({}, status) });
        const state = await Auth.init();
        assert.ok(Auth.hasSession(), `status ${status} nesmí odhlásit`);
        assert.ok(store.get('mudrlant.auth'), 'uloženo zůstává');
        void state;
    }
    const offline = setup({ stored: goodSession({ expires_at: now() + 5 }), fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    await offline.Auth.init();
    assert.ok(offline.Auth.hasSession());
    for (const status of [400, 401, 403]) {
        const { Auth, store } = setup({ stored: goodSession({ expires_at: now() + 5 }), fetchImpl: async () => json({}, status) });
        const state = await Auth.init();
        assert.equal(Auth.hasSession(), false, `status ${status} znamená konec přihlášení`);
        assert.equal(store.get('mudrlant.auth'), undefined);
        assert.match(state.error, /vypršelo/);
    }
});

test('odmítnutý refresh token za běhu odhlásí a oznámí změnu', async () => {
    const { Auth } = setup({ stored: goodSession(), fetchImpl: async (url) => url.includes('grant_type=refresh_token') ? json({ error: 'invalid' }, 400) : json(USER) });
    await Auth.init();
    let changes = 0;
    Auth.onChange(() => { changes++; });
    assert.equal(await Auth.accessToken(true), null);
    assert.equal(Auth.getState().user, null);
    assert.ok(changes >= 1);
});

test('social: po 401 se token jednou obnoví a požadavek zopakuje; podruhé 401 skončí chybou', async () => {
    let attempt = 0;
    const { Social, calls } = setup({
        stored: goodSession(),
        fetchImpl: async (url, init) => {
            if (url.includes('grant_type=refresh_token')) return json({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600, user: USER });
            if (url.includes('/rest/v1/profiles')) { attempt++; return init.headers.Authorization === 'Bearer fresh' ? json([{ id: 'u1', display_name: 'Alena' }]) : json({ message: 'JWT expired' }, 401); }
            return json(USER);
        }
    });
    await globalThis.MudrlantAuth.init();
    const profile = await Social.getProfile('u1');
    assert.equal(profile.display_name, 'Alena');
    assert.equal(attempt, 2);
    assert.equal(calls.filter(call => call.url.includes('grant_type=refresh_token')).length, 1);

    const always401 = setup({
        stored: goodSession(),
        fetchImpl: async (url) => url.includes('grant_type=refresh_token') ? json({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600, user: USER }) : url.includes('/rest/v1/') ? json({ message: 'JWT expired' }, 401) : json(USER)
    });
    await globalThis.MudrlantAuth.init();
    await assert.rejects(() => always401.Social.getProfile('u1'), error => error.status === 401);
    assert.equal(always401.calls.filter(call => call.url.includes('/rest/v1/')).length, 2, 'jen jedno opakování');
});

test('social: výsledek výzvy a postup se odešlou jen jako rozumná celá čísla a známá id', async () => {
    const { Social, calls } = setup({ stored: goodSession(), fetchImpl: async (url) => url.includes('/rest/v1/') ? json(null, 201) : json(USER) });
    await globalThis.MudrlantAuth.init();
    await Social.submitResult('u1', 'ABC234', { correct: NaN, points: 1e9 });
    const result = JSON.parse(calls.find(call => call.url.includes('challenge_results')).init.body);
    assert.equal(result.correct, 0);
    assert.equal(result.points, 80);
    await Social.saveProgress('u1', { xp: 1e12, badges: ['stovka', '<script>', 5, 'a'.repeat(50)] });
    const progress = JSON.parse(calls.find(call => call.init.method === 'PATCH').init.body);
    assert.equal(progress.xp, 500000);
    assert.deepEqual(progress.badges, ['stovka']);
    await Social.saveProgress('u1', { xp: NaN, badges: [] });
    assert.equal(JSON.parse(calls.filter(call => call.init.method === 'PATCH').pop().init.body).xp, 0);
});
