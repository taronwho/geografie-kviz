// Okno otázky: bohatší nápovědy z úvodu Wikipedie (další věty bez jména), fakta hned u chudého popisu a vzhled bez posouvání
// na malých telefonech (390×780, 360×640) ve světlém i tmavém režimu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const RICH = (title) => `${title} byl významný činitel své doby, který dlouho působil v čele své země, zanechal po sobě výrazné dílo a ovlivnil celé jedno století dějin. ` +
    'Patřil k nejvlivnějším osobnostem svého století a jeho rozhodnutí ovlivnila osudy mnoha lidí. ' +
    'Jeho vláda byla provázena sporem se šlechtou, hospodářskými reformami a dlouhými vnitřními nepokoji. ' +
    'Do pozdějších dějin vstoupil jako symbol celé jedné epochy, o které se dodnes vedou spory.';
const THIN = (title) => `${title} byl významný činitel své doby a velký státník.`;

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

test('okno otázky: nápovědy z úvodu článku a vzhled na malých telefonech', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async ({ extract, width, height, colorScheme, topic = 'historie' }) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme });
        await context.addInitScript(() => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
        });
        await context.route(/^https:\/\//, route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cs.wikipedia.org') {
                const title = url.searchParams.get('titles');
                return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: extract(title) } } } } });
            }
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector(`[data-action="daily"][data-topic="${topic}"]`);
        await tab.click(`[data-action="daily"][data-topic="${topic}"]`);
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        await tab.waitForTimeout(900);
        return { context, tab, problems };
    };
    const readRound = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
    const overflow = (tab) => tab.evaluate(() => { const content = document.getElementById('app-content'); return content.scrollHeight - content.clientHeight; });

    await t.test('bohatý úvod: první nápověda jsou další věty článku, bez jména a bez posouvání stránky', async () => {
        for (const [width, height] of [[390, 780], [360, 640]]) {
            for (const colorScheme of ['light', 'dark']) {
                const { context, tab, problems } = await open({ extract: RICH, width, height, colorScheme });
                const data = await readRound(tab);
                assert.equal(data.hints[0].key, 'excerpt', `${width}×${height}`);
                assert.deepEqual(data.leadFacts, [], 'bohatý popis fakta hned nepotřebuje');
                const description = await tab.textContent('p.italic');
                assert.ok(!description.includes('Patřil k nejvlivnějším'), 'další věty zatím nejsou vidět');
                assert.ok(await overflow(tab) <= 1, `otázka se vejde bez posouvání ${width}×${height} ${colorScheme}`);
                await tab.click('[data-action="hint"]');
                await tab.waitForSelector('[data-action="hint-tab"][aria-selected="true"]');
                assert.match(await tab.textContent('p.italic'), /Patřil k nejvlivnějším/);
                assert.doesNotMatch(await tab.textContent('p.italic'), new RegExp(data.title.replace(/[^\p{L}\s]/gu, '').split(/\s+/)[0] + '\\b', 'u'), 'ani další věty neprozradí jméno');
                assert.ok(await overflow(tab) <= 1, `i s první nápovědou ${width}×${height} ${colorScheme}`);
                assert.deepEqual(problems, []);
                await context.close();
            }
        }
    });

    await t.test('chudý úvod: bez dalších vět, první fakta hned v okně a nikde se neopakují', async () => {
        const { context, tab, problems } = await open({ extract: THIN, width: 360, height: 640, colorScheme: 'dark', topic: 'fyzika' });
        const data = await readRound(tab);
        assert.ok(!data.hints.some(hint => hint.kind === 'excerpt'), 'není co ukázat navíc');
        assert.ok(data.thin, 'otázka je označená jako chudá');
        assert.ok(data.leadFacts.length <= 3);
        const shown = await tab.$$eval('dl[aria-label="Co o tom víme"] > div', items => items.map(item => item.textContent.replace(/\s+/g, ' ').trim()));
        assert.equal(shown.length, data.leadFacts.length);
        for (const fact of data.leadFacts) {
            assert.ok(shown.some(text => text.includes(fact.value)), `${fact.label} je v okně`);
            for (const hint of data.hints.filter(other => other.kind === 'facts')) assert.ok(!hint.facts.some(other => other.label === fact.label && other.value === fact.value), 'fakt se v nápovědě neopakuje');
        }
        assert.ok(await overflow(tab) <= 1, 'i chudá otázka se vejde bez posouvání');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
