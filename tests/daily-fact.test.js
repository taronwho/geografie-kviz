const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../scripts/daily-fact.mjs');

const FEED = {
    selected: [
        { text: 'Událost bez stránky', year: 1900, pages: [] },
        { text: 'Egyptolog Howard Carter objevil vchod do hrobky Tutanchamona.', year: 1922, pages: [{ type: 'standard', title: 'Tutankhamun' }] }
    ],
    events: [{ text: 'Jiná věc', year: 1800, pages: [{ type: 'standard', title: 'Other' }] }],
    births: []
};
const EXTRACT = 'Tutanchamon byl faraon osmnácté dynastie. Jeho hrobku objevil 4. listopadu 1922 Howard Carter v Údolí králů. Hrobka byla téměř neporušená.';
const GOOD = { title: 'Objev hrobky Tutanchamona', text: 'V roce 1922 objevil britský egyptolog Howard Carter v Údolí králů vchod do hrobky faraona Tutanchamona. Byla téměř neporušená, a proto se stala jedním z nejslavnějších archeologických nálezů v dějinách.' };

const makeFetch = (geminiReplies, calls = []) => async (url, init) => {
    calls.push(url);
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (url.includes('onthisday')) return json(FEED);
    if (url.includes('en.wikipedia.org/w/api.php')) {
        return url.includes('Tutankhamun') ? json({ query: { pages: { 1: { langlinks: [{ lang: 'cs', '*': 'Tutanchamon' }] } } } }) : json({ query: { pages: { 2: {} } } });
    }
    if (url.includes('cs.wikipedia.org')) return json({ title: 'Tutanchamon', extract: EXTRACT, content_urls: { desktop: { page: 'https://cs.wikipedia.org/wiki/Tutanchamon' } } });
    if (url.includes('generativelanguage')) {
        assert.equal(init.headers['x-goog-api-key'], 'klíč');
        const reply = geminiReplies.shift();
        return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] });
    }
    throw new Error(`neočekávaná adresa ${url}`);
};

test('denní zajímavost: pražské datum a výběr kandidátů jen se stránkou', async () => {
    const { pragueDay, candidatesFor } = await load();
    assert.match(pragueDay(), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(pragueDay(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
    const list = candidatesFor(FEED, '2026-11-04');
    assert.deepEqual(list.map(item => item.title).sort(), ['Other', 'Tutankhamun']);
    assert.deepEqual(candidatesFor(FEED, '2026-11-04'), list, 'stejný den = stejné pořadí');
});

test('denní zajímavost: kontrola odpovědi odmítne vymyšlená čísla, adresy a špatnou délku', async () => {
    const { validateFact } = await load();
    const sources = `${EXTRACT} 1922`;
    assert.equal(validateFact(GOOD, sources), null);
    assert.match(validateFact({ ...GOOD, text: GOOD.text.replace('1922', '1925') }, sources), /čísla mimo zdroje: 1925/);
    assert.match(validateFact({ ...GOOD, text: `${GOOD.text} https://example.com` }, sources), /adresu/);
    assert.match(validateFact({ ...GOOD, text: 'Krátké.' }, sources), /znaků/);
    assert.match(validateFact({ title: 'x' }, sources), /chybí/);
});

test('denní zajímavost: sestaví výsledek s odkazem na českou Wikipedii a při špatné odpovědi to zkusí znovu', async () => {
    const { buildFact } = await load();
    const calls = [];
    const logs = [];
    const fact = await buildFact({ day: '2026-11-04', key: 'klíč', fetchImpl: makeFetch([{ title: 'Špatné', text: 'V roce 1999 se stalo cokoli.'.repeat(6) }, GOOD], calls), log: (line) => logs.push(line) });
    assert.equal(fact.date, '2026-11-04');
    assert.equal(fact.year, 1922);
    assert.equal(fact.title, GOOD.title);
    assert.equal(fact.url, 'https://cs.wikipedia.org/wiki/Tutanchamon');
    assert.equal(fact.source, 'Wikipedie');
    assert.ok(logs.some(line => /čísla mimo zdroje/.test(line)), 'první odpověď se zahodila');
    assert.equal(calls.filter(url => url.includes('generativelanguage')).length, 2);
});

test('denní zajímavost: bez použitelné odpovědi skončí chybou, ne vymyšleným faktem', async () => {
    const { buildFact } = await load();
    const bad = { title: 'Nic', text: 'x' };
    await assert.rejects(buildFact({ day: '2026-11-04', key: 'klíč', fetchImpl: makeFetch(Array.from({ length: 10 }, () => bad)) }), /Nepodařilo se/);
});
