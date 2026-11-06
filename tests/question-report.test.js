// Nahlášení chyby v otázce (question-report.js): očištění hlášení, offline fronta, přátelské hlášky, odeslání fronty bez zdvojení
const test = require('node:test');
const assert = require('node:assert/strict');
const Report = require('../question-report.js');

const memory = () => { const data = new Map(); return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)) }; };
const CONTEXT = { topic: 'historie', itemId: 'Q42', questionType: 'name', title: 'Který panovník to byl?', answer: 'Karel IV.' };
const error = (status, message = 'x') => Object.assign(new Error(message), { status });

test('buildReport: povolené důvody, délky a tvar identifikátorů jako v databázi', () => {
    const report = Report.buildReport(CONTEXT, 'nejasne-zadani', '  Zadání  se\n\n hodí  k jiné osobě.  ');
    assert.deepEqual(report, { topic: 'historie', item_id: 'Q42', question_type: 'name', reason: 'nejasne-zadani', note: 'Zadání se\nhodí k jiné osobě.', title: 'Který panovník to byl?', answer: 'Karel IV.' });
    assert.equal(Report.buildReport(CONTEXT, 'nesmysl', ''), null, 'neznámý důvod');
    assert.equal(Report.buildReport({ ...CONTEXT, itemId: "Q1'; drop" }, 'jine', ''), null, 'podezřelé id');
    assert.equal(Report.buildReport({ ...CONTEXT, topic: 'Zeměpis' }, 'jine', ''), null, 'tvar tématu');
    assert.equal(Report.buildReport(CONTEXT, 'jine', 'x'.repeat(900)).note.length, Report.NOTE_MAX);
    assert.equal(Report.buildReport({ ...CONTEXT, title: 't'.repeat(500) }, 'jine').title.length, 200);
    assert.equal(Report.buildReport(CONTEXT, 'jine', undefined).note, '');
});

test('submit: odeslání, odmítnutí bez účtu, fronta bez sítě i při výpadku serveru', async () => {
    const report = Report.buildReport(CONTEXT, 'spatna-odpoved', '');
    const sent = [];
    const send = async (value) => { sent.push(value); };
    let storage = memory();
    assert.equal((await Report.submit(report, { user: 'u1', send, storage })).state, 'sent');
    assert.equal(sent.length, 1);

    const guest = await Report.submit(report, { user: null, send: null, storage });
    assert.equal(guest.state, 'refused');
    assert.match(guest.message, /Přihlas se/);

    const offline = await Report.submit(report, { user: 'u1', send, storage, online: false });
    assert.equal(offline.state, 'queued');
    assert.match(offline.message, /offline/);
    assert.equal(sent.length, 1, 'bez sítě se nic neposílá');
    assert.equal(Report.readQueue(storage).length, 1);

    for (const failure of [new TypeError('Failed to fetch'), error(503), error(0)]) {
        storage = memory();
        const result = await Report.submit(report, { user: 'u1', send: async () => { throw failure; }, storage });
        assert.equal(result.state, 'queued', String(failure.status));
        assert.equal(Report.readQueue(storage).length, 1);
    }
    assert.equal((await Report.submit(null, { user: 'u1', send, storage })).state, 'refused');
});

test('submit: odmítnutí databází se nefrontuje a hláška je přátelská', async () => {
    const report = Report.buildReport(CONTEXT, 'jine', '');
    const storage = memory();
    const run = (failure) => Report.submit(report, { user: 'u1', send: async () => { throw failure; }, storage });
    const missing = await run(error(404));
    assert.equal(missing.state, 'refused');
    assert.match(missing.message, /databáze/);
    assert.match((await run(error(401))).message, /přihlas/);
    const limit = await run(error(400, 'Dnes už jsi poslal hodně hlášení, zkus to zítra.'));
    assert.equal(limit.message, 'Dnes už jsi poslal hodně hlášení, zkus to zítra.');
    assert.equal((await run(error(400, 'new row violates check constraint'))).state, 'refused');
    assert.deepEqual(Report.readQueue(storage), []);
});

test('flush: pošle jen hlášení přihlášeného účtu, na síťové chybě se zastaví a souběžná volání neposílají dvakrát', async () => {
    const storage = memory();
    const a = Report.buildReport(CONTEXT, 'jine', 'a');
    const b = Report.buildReport({ ...CONTEXT, itemId: 'Q43' }, 'jine', 'b');
    const c = Report.buildReport({ ...CONTEXT, itemId: 'Q44' }, 'jine', 'c');
    Report.enqueue(storage, 'u1', a);
    Report.enqueue(storage, 'u2', b);
    Report.enqueue(storage, 'u1', c);
    const sent = [];
    const results = await Promise.all([1, 2].map(() => Report.flush({ user: 'u1', send: async (value) => { await new Promise(resolve => setTimeout(resolve, 5)); sent.push(value.note); }, storage })));
    assert.deepEqual(sent, ['a', 'c'], 'každé hlášení jednou');
    assert.equal(results[0], 2);
    assert.deepEqual(Report.readQueue(storage).map(entry => entry.user), ['u2'], 'cizí účet zůstal ve frontě');

    Report.enqueue(storage, 'u2', a);
    let calls = 0;
    const flaky = async () => { calls++; throw new TypeError('Failed to fetch'); };
    assert.equal(await Report.flush({ user: 'u2', send: flaky, storage }), 0);
    assert.equal(calls, 1, 'po první síťové chybě se přestane');
    assert.equal(Report.readQueue(storage).length, 2);

    assert.equal(await Report.flush({ user: 'u2', send: async () => { throw error(400, 'limit'); }, storage }), 0);
    assert.deepEqual(Report.readQueue(storage), [], 'odmítnutá hlášení se zahodí');
    assert.equal(await Report.flush({ user: null, send: null, storage }), 0);
});

test('fronta: poškozený obsah úložiště nevadí a fronta je omezená', () => {
    const storage = memory();
    storage.setItem('mudrlant.reports', '{rozbite');
    assert.deepEqual(Report.readQueue(storage), []);
    storage.setItem('mudrlant.reports', JSON.stringify([{ user: 'u1', report: { topic: '../x', item_id: 'Q1', reason: 'jine' } }, 5, null]));
    assert.deepEqual(Report.readQueue(storage), [], 'neplatné záznamy se zahodí');
    const report = Report.buildReport(CONTEXT, 'jine', '');
    for (let i = 0; i < 40; i++) Report.enqueue(storage, 'u1', report);
    assert.equal(Report.readQueue(storage).length, 20);
    const broken = { getItem: () => { throw new Error('zablokováno'); }, setItem: () => { throw new Error('zablokováno'); } };
    assert.deepEqual(Report.readQueue(broken), []);
    assert.doesNotThrow(() => Report.enqueue(broken, 'u1', report));
});
