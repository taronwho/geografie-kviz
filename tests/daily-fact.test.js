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
    if (url.includes('generativelanguage') && url.includes('/v1beta/models?')) return json({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.5-flash-lite-tts', supportedGenerationMethods: ['generateContent'] }] });
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

test('denní zajímavost: kategorie se střídají po dnech', async () => {
    const { categoryFor, CATEGORIES } = await load();
    const seen = new Set(Array.from({ length: 7 }, (_, i) => categoryFor(`2026-11-${String(i + 1).padStart(2, '0')}`)));
    assert.equal(seen.size, CATEGORIES.length, 'za týden se vystřídají všechny kategorie');
    assert.notEqual(categoryFor('2026-11-04'), categoryFor('2026-11-05'));
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
    const { buildFact, resetBudget } = await load();
    resetBudget();
    const calls = [];
    const logs = [];
    const fact = await buildFact({ day: '2026-11-04', key: 'klíč', fetchImpl: makeFetch([{ index: 0, category: 'příroda a objevy' }, { title: 'Špatné', text: 'V roce 1999 se stalo cokoli.'.repeat(6) }, GOOD], calls), log: (line) => logs.push(line) });
    assert.equal(fact.date, '2026-11-04');
    assert.equal(fact.year, 1922);
    assert.equal(fact.title, GOOD.title);
    assert.equal(fact.url, 'https://cs.wikipedia.org/wiki/Tutanchamon');
    assert.equal(fact.source, 'Wikipedie');
    assert.ok(logs.some(line => /čísla mimo zdroje/.test(line)), 'první odpověď se zahodila');
    assert.equal(calls.filter(url => url.includes('generativelanguage') && url.includes(':generateContent')).length, 3, 'výběr + dva pokusy o text');
    assert.equal(fact.category, 'příroda a objevy', 'štítek je kategorie, kam vybraná událost opravdu patří');
    assert.equal(fact.en, 'Tutankhamun');
    assert.deepEqual(fact.recent, []);
});

test('denní zajímavost: štítek tématu jen s kategorií potvrzenou u vybrané události', async () => {
    const { buildFact, resetBudget } = await load();
    resetBudget();
    // Model nevrátil platnou kategorii (nebo vybral mimo kategorii dne): bez štítku, ať nestojí „významné osobnosti“ u pádu zdi
    const fact = await buildFact({ day: '2026-11-04', key: 'klíč', fetchImpl: makeFetch([{ index: 0, category: 'nesmysl' }, GOOD]) });
    assert.equal(fact.title, GOOD.title);
    assert.equal('category' in fact, false);
    resetBudget();
    // Výběr selhal (index mimo seznam): použije se první kandidát, ale bez štítku
    const fallback = await buildFact({ day: '2026-11-04', key: 'klíč', fetchImpl: makeFetch([{ index: 99, category: 'sport' }, GOOD]) });
    assert.equal('category' in fallback, false);
});

test('denní zajímavost: událost z posledních dnů se nezopakuje a historie se přenáší', async () => {
    const { buildFact, resetBudget, recentFrom, sameTopic } = await load();
    assert.equal(sameTopic('Pád Berlínské zdi', 'Berlínská zeď'), true, 'stejné téma podle výrazného slova');
    assert.equal(sameTopic('Vznik Československa', 'Československá televize', false), false, 'starší záznamy jen podle stejné stránky');
    const previous = { date: '2026-11-03', page: 'Tutanchamon', en: 'Tutankhamun', recent: [{ date: '2026-11-02', page: 'Pád Berlínské zdi' }, { date: '2026-08-01', page: 'Dávno' }] };
    const recent = recentFrom(previous, '2026-11-04');
    assert.deepEqual(recent.map(entry => entry.page), ['Tutanchamon', 'Pád Berlínské zdi'], 'nejnovější první, starší než 45 dní pryč');
    resetBudget();
    const logs = [];
    // Jediný kandidát s českou stránkou byl předevčírem: nic jiného nezbývá, tak raději chyba než opakování
    await assert.rejects(buildFact({ day: '2026-11-04', key: 'klíč', recent, fetchImpl: makeFetch([{ index: 0, category: 'sport' }, GOOD]), log: (line) => logs.push(line) }), /Žádná událost/);
    assert.ok(logs.some(line => /bylo v posledních dnech/.test(line)));
    resetBudget();
    const fact = await buildFact({ day: '2026-11-04', key: 'klíč', recent: [{ date: '2026-11-03', page: 'Pád Berlínské zdi' }], fetchImpl: makeFetch([{ index: 0, category: 'sport' }, GOOD]) });
    assert.deepEqual(fact.recent, [{ date: '2026-11-03', page: 'Pád Berlínské zdi' }], 'historie jde do dalšího dne');
});

test('denní zajímavost: bez použitelné odpovědi skončí chybou, ne vymyšleným faktem', async () => {
    const { buildFact, resetBudget } = await load();
    resetBudget();
    const bad = { title: 'Nic', text: 'x' };
    await assert.rejects(buildFact({ day: '2026-11-04', key: 'klíč', fetchImpl: makeFetch(Array.from({ length: 10 }, () => bad)) }), /Nepodařilo se|Vyčerpán/);
});

test('denní zajímavost: pořadí modelů – nejnovější flash-lite, pak flash, bez TTS a obrázkových', async () => {
    const { rankModels } = await load();
    const order = rankModels(['models/gemini-3.1-flash-lite', 'models/gemini-3.5-flash-lite', 'models/gemini-3.5-flash-lite-tts', 'models/gemini-3.8-flash', 'models/gemini-2.5-flash', 'models/gemini-3-pro-image', 'models/gemini-embedding-1', 'models/text-bison']);
    assert.deepEqual(order, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash']);
});

test('denní zajímavost: při 429 prvního modelu se zkusí další (každý má vlastní limit)', async () => {
    const { buildFact, resetBudget } = await load();
    resetBudget();
    let tried = [];
    const base = makeFetch([{ index: 0 }, GOOD]);
    const fetchImpl = async (url, init) => {
        const model = (url.match(/models\/([^:/?]+):generateContent/) || [])[1];
        if (model) { tried.push(model); if (model === 'gemini-3.5-flash-lite') return { ok: false, status: 429, text: async () => 'quota', json: async () => ({}) }; }
        return base(url, init);
    };
    const fact = await buildFact({ day: '2026-11-04', key: 'klíč', fetchImpl });
    assert.equal(fact.title, GOOD.title);
    assert.ok(tried.includes('gemini-3.5-flash-lite') && tried.some(model => model !== 'gemini-3.5-flash-lite'), `zkoušené modely: ${tried}`);
});
