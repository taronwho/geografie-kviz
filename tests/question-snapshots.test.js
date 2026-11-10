// Zamrzlé otázky v social.js (schéma 17): claimQuestion a questionSnapshots volají správné funkce databáze, neplatné semínko ani data na server
// nejdou, starší databáze bez funkcí (404) vrací null a dál se na ně aplikace neptá, chyba spojení a odmítnutí serverem se vyhodí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const setup = (handler) => {
    const calls = [];
    globalThis.self = globalThis;
    globalThis.MUDRLANT_CONFIG = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'sb_publishable_test' };
    globalThis.MudrlantAuth = { accessToken: async () => 'tok' };
    globalThis.fetch = async (url, init = {}) => {
        const call = { url: String(url).replace('https://x.supabase.co/rest/v1/', ''), method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
        calls.push(call);
        const result = await handler(call);
        if (result instanceof Error) throw result;
        return { ok: result.status < 400, status: result.status, json: async () => result.body, text: async () => result.body === undefined ? '' : JSON.stringify(result.body) };
    };
    delete require.cache[require.resolve(path.join('..', 'social.js'))];
    return { Social: require('../social.js'), calls };
};
const question = { topic: 'zemepis', id: 'Q40', question: { title: 'Který stát to je?', choices: [{ label: 'Rakousko', correct: true }] } };

test('claimQuestion: uloží otázku k semínku a vrátí tu, kterou má server (první uloženou)', async () => {
    const stored = { ...question, id: 'Q39' };
    const { Social, calls } = setup(() => ({ status: 200, body: stored }));
    assert.deepEqual(await Social.claimQuestion('vyzva-ABC234-x1:0', question), stored);
    assert.deepEqual(calls, [{ url: 'rpc/question_snapshot_claim', method: 'POST', body: { seed: 'vyzva-ABC234-x1:0', data: question } }]);
    // Neplatné semínko nebo data na server nejdou
    for (const [seed, data] of [['', question], ['x'.repeat(201), question], ['a b:0', question], ["x'or:1", question], ['vyzva:0', null], ['vyzva:0', [1]], ['vyzva:0', 'text']]) {
        await assert.rejects(() => Social.claimQuestion(seed, data), /Neplatná otázka/);
    }
    assert.equal(calls.length, 1);
});

test('claimQuestion: odpověď, která není objekt, je null; odmítnutí serverem a chyba spojení se vyhodí', async () => {
    let result = { status: 200, body: [1, 2] };
    const { Social } = setup(() => result);
    assert.equal(await Social.claimQuestion('seed-abc-r1:0', question), null);
    result = { status: 403, body: { message: 'Tuhle otázku uložit nejde.' } };
    await assert.rejects(() => Social.claimQuestion('seed-abc-r1:0', question), (error) => error.status === 403 && /uložit nejde/.test(error.message));
    result = new TypeError('Failed to fetch');
    await assert.rejects(() => Social.claimQuestion('seed-abc-r1:0', question), /Failed to fetch/);
});

test('questionSnapshots: jedna žádost na víc semínek, jen platná semínka a objekty, bez prototypových klíčů', async () => {
    const { Social, calls } = setup(() => ({ status: 200, body: [
        { seed: 'mudrlant-kviz-dne-2026-11-10:otazka:0', data: question },
        { seed: 'mudrlant-kviz-dne-2026-11-10:otazka:1', data: 'text' },
        { seed: 'cizi-semínko:0', data: question },
        { seed: '__proto__', data: { polluted: true } }
    ] }));
    const found = await Social.questionSnapshots(['mudrlant-kviz-dne-2026-11-10:otazka:0', 'mudrlant-kviz-dne-2026-11-10:otazka:1', 'mudrlant-kviz-dne-2026-11-10:otazka:0', 'a b', '__proto__']);
    assert.deepEqual(calls.map(call => [call.url, call.body]), [['rpc/question_snapshots_get', { seeds: ['mudrlant-kviz-dne-2026-11-10:otazka:0', 'mudrlant-kviz-dne-2026-11-10:otazka:1', '__proto__'] }]]);
    assert.ok(Object.keys(found).includes('mudrlant-kviz-dne-2026-11-10:otazka:0'));
    assert.ok(!Object.keys(found).includes('mudrlant-kviz-dne-2026-11-10:otazka:1'), 'data, která nejsou objekt, vypadnou');
    assert.ok(!Object.keys(found).includes('cizi-semínko:0'), 'semínko, o které se nežádalo, vypadne');
    assert.deepEqual(found['mudrlant-kviz-dne-2026-11-10:otazka:0'], question);
    assert.equal(Object.getPrototypeOf(found), null, 'výsledek je bez prototypu');
    assert.equal({}.polluted, undefined, 'prototyp objektů se nezměnil');
    assert.deepEqual(Object.keys(await Social.questionSnapshots([])), [], 'prázdný seznam bez žádosti');
    assert.equal(calls.length, 1);
});

test('starší databáze bez zamrzlých otázek (404): null a dál se nevolá', async () => {
    const { Social, calls } = setup(() => ({ status: 404, body: { code: 'PGRST202', message: 'Could not find the function' } }));
    assert.equal(await Social.questionSnapshots(['vyzva-ABC234-x1:0']), null);
    assert.equal(await Social.claimQuestion('vyzva-ABC234-x1:0', question), null);
    assert.equal(await Social.questionSnapshots(['vyzva-ABC234-x1:1']), null);
    assert.equal(calls.length, 1, 'po první 404 se databáze už neptá');
});
