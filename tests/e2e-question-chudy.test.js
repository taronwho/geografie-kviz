// Neinformativní popis (quiz-core.js isBareText, od BARE_TEXT_FROM 2026-11-27): úvod článku, ze kterého po zakrytí zbyde jen obecný
// druh („[***] je druh a typ…“), se v okně otázky neukáže. Místo něj fakta ukázaná hned (záložka Fakta) a u zvířat a rostlin fotka
// zdarma jako obrázek otázky. Otázka se musí vejít na 360×640 bez posouvání (světlý i tmavý režim). Dnešní otázky dne před
// BARE_TEXT_FROM zůstanou jako dřív (popis vidět).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const nav = require('./nav.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// Úvod bez jediného údaje: po zakrytí názvu zbydou jen obecná slova a spojky
const BARE = (title) => `${title} je druh a typ, který je jako ten, který byl.`;

const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (fixtures.files[pathname]) { response.writeHead(200, { 'content-type': 'application/json' }); return response.end(JSON.stringify(fixtures.files[pathname])); }
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
        const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        response.writeHead(200, headers);
        response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

test('neinformativní popis se neukáže, otázku nesou fakta nebo fotka a vejde se na 360×640', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async ({ day, topic, colorScheme = 'dark' }) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 360, height: 640 }, colorScheme });
        await context.clock.setFixedTime(new Date(`${day}T12:00:00`));
        await context.addInitScript(() => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
        });
        await context.route(/^https:\/\//, route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cs.wikipedia.org') {
                const title = url.searchParams.get('titles');
                return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: BARE(title) } } } } });
            }
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        await tab.goto(`${origin}/`);
        await nav.waitForHome(tab);
        await nav.daily(tab, topic);
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        await tab.waitForTimeout(900);
        return { context, tab, problems };
    };
    const readRound = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
    const overflow = (tab) => tab.evaluate(() => { const content = document.getElementById('app-content'); return content.scrollHeight - content.clientHeight; });
    const panelText = (tab) => tab.evaluate(() => (document.getElementById('hint-tab-panel') || {}).textContent || '');

    const days = (from, count) => Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
    const isName = (data) => data.question.type === 'name' && !data.question.showName;
    // Den a téma, kde dnešní otázka odpovídá případu (otázka se losuje podle data)
    const findCase = async (topics, from, count, wanted) => {
        for (const topic of topics) {
            for (const day of days(from, count)) {
                const { context, tab } = await open({ day, topic });
                const data = await readRound(tab);
                await context.close();
                if (wanted(data)) return { topic, day };
            }
        }
        return null;
    };
    const CASES = [
        ['fakta hned', ['literatura', 'hudba', 'umeni', 'historie'], (data) => isName(data) && !data.questionImage && data.leadFacts.length >= 2],
        ['fotka zdarma', ['biologie'], (data) => isName(data) && Boolean(data.questionImage && data.questionImage.lead)],
        ['otázka se jménem', ['historie', 'film'], (data) => !isName(data) && data.question.type !== 'map']
    ];
    for (const [label, topics, wanted] of CASES) {
        const found = await findCase(topics, '2026-11-28', 8, wanted);
        assert.ok(found, `případ ${label} se našel`);
        for (const colorScheme of ['light', 'dark']) {
            await t.test(`${label}: ${found.topic} ${found.day} bez neinformativního popisu (${colorScheme})`, async (st) => {
                const { context, tab, problems } = await open({ ...found, colorScheme });
                const data = await readRound(tab);
                st.diagnostic(`${data.name}: ${data.question.title} – ${data.questionImage ? 'fotka zdarma' : `${data.leadFacts.length} fakta hned`}`);
                assert.equal(data.questionText, '', 'popis se neukáže');
                assert.equal(data.bareText, true);
                assert.doesNotMatch(await panelText(tab), /druh a typ/, 'neinformativní text není vidět');
                if (isName(data) && data.questionImage) {
                    // Fotka zdarma: je obrázkem otázky a už není placenou nápovědou
                    assert.equal(data.questionImage.label, 'Fotka');
                    assert.ok(!data.hints.some(hint => hint.kind === 'photo'));
                    assert.equal(await tab.locator('#question-image').count(), 1);
                } else if (isName(data)) {
                    assert.ok(data.leadFacts.length >= 2, 'aspoň dvě fakta ukázaná hned');
                    const shown = await tab.$$eval('dl[aria-label="Co o tom víme"] > div', items => items.map(item => item.textContent.replace(/\s+/g, ' ').trim()));
                    assert.equal(shown.length, data.leadFacts.length);
                    for (const fact of data.leadFacts) assert.ok(shown.some(text => text.includes(fact.value)), `${fact.label} je v okně`);
                    assert.match(await tab.textContent('#hint-tab-panel'), /Fakta/);
                } else {
                    assert.doesNotMatch(await panelText(tab), /nepodařilo načíst/, 'otázka se jménem: jen název, bez hlášky o Wikipedii');
                }
                assert.ok(await overflow(tab) <= 1, `otázka se vejde bez posouvání (${found.topic}, ${colorScheme})`);
                // Všechny nápovědy otevřené: pořád bez posouvání
                for (let guard = 0; guard < 8 && await tab.locator('[data-action="hint"]').count(); guard++) {
                    await tab.click('[data-action="hint"]');
                    await tab.waitForTimeout(250);
                    assert.ok(await overflow(tab) <= 1, `nápověda ${guard + 1} se vejde (${found.topic}, ${colorScheme})`);
                }
                assert.deepEqual(problems, []);
                await context.close();
            });
        }
    }

    await t.test('dnešní otázka dne před 27. 11. zůstane jako dřív (popis vidět)', async () => {
        const found = await findCase(['historie', 'literatura', 'hudba'], '2026-11-19', 8, (data) => isName(data) && !data.questionImage);
        assert.ok(found);
        const { context, tab, problems } = await open(found);
        const data = await readRound(tab);
        assert.ok(!data.bareText);
        assert.match(data.questionText, /druh a typ/);
        assert.deepEqual(problems, []);
        await context.close();
    });
});
