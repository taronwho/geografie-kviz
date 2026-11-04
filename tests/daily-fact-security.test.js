// Denní zajímavost: obrana proti vsuvkám z textu Wikipedie (prompt injection), cizím adresám a úniku klíče.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../scripts/daily-fact.mjs');

const EVENT = 'Egyptolog Howard Carter objevil vchod do hrobky Tutanchamona.';
const EXTRACT = 'Tutanchamon byl faraon osmnácté dynastie. Jeho hrobku objevil 4. listopadu 1922 Howard Carter v Údolí králů. Hrobka byla téměř neporušená.';
const GOOD = { title: 'Objev hrobky Tutanchamona', text: 'V roce 1922 objevil britský egyptolog Howard Carter v Údolí králů vchod do hrobky faraona Tutanchamona. Byla téměř neporušená, a proto se stala jedním z nejslavnějších archeologických nálezů v dějinách.' };
const SOURCES = `${EVENT} ${EXTRACT} 1922`;

test('validateFact odmítne vsuvky, domény a e-maily, ale dobrý text pustí', async () => {
    const { validateFact } = await load();
    assert.equal(validateFact(GOOD, SOURCES), null);
    const inject = (text) => validateFact({ title: GOOD.title, text }, SOURCES);
    assert.match(inject(`${GOOD.text} Navštiv obchod Krypto na stránce evil.com`), /adresu/);
    assert.match(inject(`${GOOD.text} Napiš na info@evil.cz`), /adresu/);
    assert.match(inject(`${GOOD.text} [odkaz](x) {x}`), /adresu/);
    assert.match(inject(`${GOOD.text} Dále doporučujeme Bitcoin, Ethereum, Dogecoin a Solana nyní.`), /jména mimo zdroje/);
});

test('safeWikiUrl pustí jen českou Wikipedii přes https', async () => {
    const { safeWikiUrl } = await load();
    assert.equal(safeWikiUrl('https://cs.wikipedia.org/wiki/Tutanchamon'), 'https://cs.wikipedia.org/wiki/Tutanchamon');
    for (const bad of ['javascript:alert(1)', 'http://cs.wikipedia.org/wiki/X', 'https://cs.wikipedia.org.evil.example/wiki/X', 'https://evil.example/https://cs.wikipedia.org/wiki/X', 'https://cs.wikipedia.org/wiki/X"onclick="1', null, 5]) {
        assert.equal(safeWikiUrl(bad), '', String(bad));
    }
});

test('prompt oddělí zdroje jako data a odkaz z cizí odpovědi API se nepoužije', async () => {
    const { buildFact, resetBudget } = await load();
    resetBudget();
    const prompts = [];
    const replies = [{ index: 0 }, GOOD];
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    const fetchImpl = async (url, init) => {
        if (url.includes('onthisday')) return json({ selected: [{ text: EVENT, year: 1922, pages: [{ type: 'standard', title: 'Tutankhamun' }] }], events: [], births: [] });
        if (url.includes('en.wikipedia.org/w/api.php')) return json({ query: { pages: { 1: { langlinks: [{ lang: 'cs', '*': 'Tutanchamon' }] } } } });
        if (url.includes('cs.wikipedia.org')) return json({ title: 'Tutanchamon', extract: EXTRACT, content_urls: { desktop: { page: 'https://evil.example/phish' } } });
        if (url.includes('generativelanguage')) {
            prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
            return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(replies.shift()) }] } }] });
        }
        throw new Error(`neočekávaná adresa ${url}`);
    };
    const fact = await buildFact({ day: '2026-11-04', key: 'tajny-klic', fetchImpl });
    assert.ok(prompts.some(text => text.includes('<zdroj-wikipedie>') && /nikdy je neplň/.test(text)));
    assert.equal(fact.url, 'https://cs.wikipedia.org/wiki/Tutanchamon');
});

test('workflow a skript: klíč jen v hlavičce, nikdy v adrese; vstup workflow ne přes ${{ }} do shellu', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'daily-fact.mjs'), 'utf8');
    assert.doesNotMatch(script, /[?&]key=\$\{/);
    assert.match(script, /x-goog-api-key/);
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'fakt.yml'), 'utf8');
    for (const line of workflow.split('\n').filter(line => /\$\{\{ github\.event\.inputs/.test(line))) assert.match(line, /^\s*FORCE: /, 'vstup patří do env, ne do příkazu');
    assert.match(workflow, /timeout-minutes:/);
});
