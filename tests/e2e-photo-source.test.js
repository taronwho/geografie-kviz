// Zdroj obrázku v prohlížeči: tlačítko „i“ u vlajky v otázce ukáže před odpovědí jen licenci (žádný název souboru ani autora),
// po odpovědi autora a odkaz na Wikimedia Commons; bez sítě náhradní údaje. Okno se vejde na malý telefon (390×780, 360×640)
// ve světlém i tmavém režimu, zavře se Escape a vrátí fokus na „i“. Bez chyb CSP a v konzoli; Commons API je podvržené.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const Source = require('../photo-source.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const AUTHOR = 'Testovací Kreslíř';
const metadata = (title) => ({ query: { pages: { '-1': { title, imageinfo: [{ extmetadata: {
    Artist: { value: `<a href="//commons.wikimedia.org/wiki/User:Test">${AUTHOR}</a>` },
    LicenseShortName: { value: 'CC BY-SA 4.0' },
    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
    Credit: { value: 'Vlastní dílo' },
    DateTimeOriginal: { value: '2009-05-01' },
    ImageDescription: { value: `<p>${title.replace(/^File:/, '')} – popis souboru</p>` }
} }] } } } });

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

test('zdroj obrázku: „i“ u vlajky před odpovědí a po ní', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async ({ width, height, colorScheme, commonsDown = false, atlas = false }) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme });
        await context.addInitScript(() => {
            window.MUDRLANT_NUMERIC_RATE = 0;
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
        });
        const log = { commons: [], errors: [], console: [] };
        await context.route(/^https:\/\//, route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cs.wikipedia.org') {
                const title = url.searchParams.get('titles');
                return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: fixtures.extractFor(title) } } } } });
            }
            if (url.hostname === 'commons.wikimedia.org') {
                log.commons.push(url.searchParams.get('titles'));
                if (commonsDown) return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: '' });
                return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(metadata(url.searchParams.get('titles'))) });
            }
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        const tab = await context.newPage();
        tab.on('pageerror', error => log.errors.push(error.message));
        tab.on('console', message => {
            if (/Content Security Policy/i.test(message.text())) log.errors.push(message.text());
            // Zajímavost dne a verze aplikace testovací server nemá (404) – to s obrázky nesouvisí
            if (message.type() === 'error' && !/\/(data\/fakt|version)\.json$/.test(message.location().url || '')) log.console.push(message.text());
        });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#btn-learn', { timeout: 30000 });
        await tab.click('#btn-learn');
        if (atlas) {
            // Atlas učení (zeměpis, velkoměsta popořadě): karta s fotkou, žádná otázka
            await tab.click('[data-action="learn-topic"][data-topic="zemepis"]');
            await tab.click('[data-action="learn-collection"][data-collection="velkomesta"]');
            await tab.click('[data-action="learn-browse"]');
            await tab.waitForSelector('#learn-card h2');
            return { context, tab, log };
        }
        // Vlajky evropských států: vlajka je vidět hned (obrázek otázky), název souboru („Flag of …“) by prozradil odpověď
        await tab.click('[data-action="learn-topic"][data-topic="vlajky"]');
        await tab.click('[data-action="learn-collection"][data-collection="vlajky-evropy"]');
        await tab.click('[data-action="learn-practice"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        return { context, tab, log };
    };
    const readRound = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
    const dialogText = (tab) => tab.textContent('#photo-source');
    // Okno je celé vidět a nic se v něm neposouvá
    const fits = (tab) => tab.evaluate(() => {
        const panel = document.querySelector('#photo-source > div');
        const box = panel.getBoundingClientRect();
        return { scroll: panel.scrollHeight - panel.clientHeight, inside: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth };
    });
    const sourceButton = (tab, panel) => tab.locator(`#${panel} [data-photo-info]:not(.hidden)`);

    for (const [width, height, colorScheme] of [[390, 780, 'light'], [360, 640, 'dark']]) {
        await t.test(`${width}×${height} ${colorScheme}: před odpovědí jen licence, po odpovědi autor a odkaz`, async () => {
            const { context, tab, log } = await open({ width, height, colorScheme });
            const data = await readRound(tab);
            assert.ok(data.questionImage && data.questionImage.url, 'otázka ukazuje vlajku');
            const fileName = Source.fileFromUrl(data.questionImage.url);
            assert.ok(fileName, data.questionImage.url);

            // Před odpovědí: „i“ v levém dolním rohu vlajky, na dotyk aspoň 44 px
            const button = sourceButton(tab, 'hint-tab-panel');
            await button.waitFor({ timeout: 15000 });
            const box = await button.boundingBox();
            const frame = await tab.locator('#hint-tab-panel #question-image').boundingBox();
            assert.ok(box.width >= 43.5 && box.height >= 43.5, `dotyková plocha ${box.width}×${box.height}`);
            assert.ok(Math.abs(box.x - frame.x) <= 1 && Math.abs(box.y + box.height - (frame.y + frame.height)) <= 1, 'vlevo dole');
            await button.click();
            await tab.waitForSelector('#photo-source [data-source-row="license"]');
            assert.equal(await tab.locator('#photo-zoom').count(), 0, '„i“ neotevře zvětšení');
            const before = await dialogText(tab);
            assert.match(before, /Zdroj obrázku/);
            assert.match(before, /Licence\s*CC BY-SA 4\.0/);
            assert.match(before, /Zdroj\s*Wikimedia Commons/);
            assert.match(before, /Autora, název souboru a odkaz uvidíš po odpovědi\./);
            for (const secret of [fileName, fileName.replace(/\.\w+$/, ''), AUTHOR, 'popis souboru', 'Vlastní dílo', data.name]) assert.ok(!before.includes(secret), `před odpovědí je vidět „${secret}“`);
            assert.equal(await tab.locator('#photo-source [data-source-commons], #photo-source a[href*="commons.wikimedia.org"]').count(), 0, 'žádný odkaz na soubor');
            assert.equal(await tab.getAttribute('#photo-source [data-source-row="license"] a', 'href'), 'https://creativecommons.org/licenses/by-sa/4.0');
            assert.equal(await tab.getAttribute('#photo-source a[href="licence.html"]', 'href'), 'licence.html');
            assert.deepEqual(await fits(tab), { scroll: 0, inside: true }, 'okno se vejde bez posouvání');
            // Escape zavře okno a fokus se vrátí na „i“
            await tab.keyboard.press('Escape');
            await tab.waitForSelector('#photo-source', { state: 'detached' });
            assert.ok(await tab.evaluate(() => document.activeElement && document.activeElement.matches('[data-photo-info]')), 'fokus zpět na „i“');
            assert.match(await tab.textContent('#app-content'), /Nápovědy 0\//, 'otázka běží dál');

            // Po odpovědi: autor, datum, popis, licence, soubor a odkaz na Commons
            await tab.click(`[data-action="choice"]:has-text("${data.question.answerLabel}")`);
            await tab.waitForSelector('[data-action="next"], [data-action="result-tab"]', { timeout: 30000 });
            const imageTab = tab.locator('[data-action="result-tab"][data-step="image"]');
            if (await imageTab.count() && await imageTab.getAttribute('aria-selected') !== 'true') await imageTab.click();
            const resultButton = sourceButton(tab, 'result-tab-panel');
            await resultButton.waitFor({ timeout: 15000 });
            await resultButton.click();
            await tab.waitForSelector('#photo-source [data-source-row="artist"]');
            const after = await dialogText(tab);
            assert.match(after, new RegExp(`Autor\\s*${AUTHOR}`));
            assert.match(after, /Datum\s*2009-05-01/);
            assert.match(after, /popis souboru/);
            assert.match(after, /Licence\s*CC BY-SA 4\.0/);
            assert.ok(after.includes(fileName), 'název souboru po odpovědi');
            const link = tab.locator('#photo-source [data-source-commons]');
            assert.equal(await link.getAttribute('href'), Source.pageUrl(fileName));
            assert.equal(await link.getAttribute('target'), '_blank');
            assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
            assert.match(await link.textContent(), /Otevřít na Wikimedia Commons/);
            assert.deepEqual(await fits(tab), { scroll: 0, inside: true }, 'i po odpovědi se okno vejde');
            // Zavírací tlačítko také vrátí fokus na „i“
            await tab.click('#photo-source [data-close]');
            await tab.waitForSelector('#photo-source', { state: 'detached' });
            assert.ok(await tab.evaluate(() => document.activeElement && document.activeElement.matches('#result-tab-panel [data-photo-info]')));
            assert.deepEqual(log.commons, [`File:${fileName}`], 'metadata se stáhnou jednou (pak z paměti)');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.console, []);
            await context.close();
        });
    }

    await t.test('atlas učení: u fotky na kartě hned autor a odkaz (nic se nehádá)', async () => {
        const { context, tab, log } = await open({ width: 360, height: 640, colorScheme: 'dark', atlas: true });
        const button = tab.locator('#learn-card [data-photo-info]:not(.hidden)');
        await button.waitFor({ timeout: 15000 });
        await button.click();
        await tab.waitForSelector('#photo-source [data-source-row="artist"]');
        assert.match(await dialogText(tab), new RegExp(`Autor\\s*${AUTHOR}`));
        assert.equal(await tab.getAttribute('#photo-source [data-source-commons]', 'href'), Source.pageUrl('Berlín z jihu.jpg'));
        assert.deepEqual(await fits(tab), { scroll: 0, inside: true });
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#photo-source', { state: 'detached' });
        assert.ok(await tab.evaluate(() => document.activeElement && document.activeElement.matches('#learn-card [data-photo-info]')));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.console, []);
        await context.close();
    });

    await t.test('bez Commons API: náhradní údaje, po odpovědi soubor a odkaz bez sítě', async () => {
        const { context, tab, log } = await open({ width: 360, height: 640, colorScheme: 'light', commonsDown: true });
        const data = await readRound(tab);
        const fileName = Source.fileFromUrl(data.questionImage.url);
        const button = sourceButton(tab, 'hint-tab-panel');
        await button.waitFor({ timeout: 15000 });
        await button.click();
        await tab.waitForSelector('#photo-source [data-source-status]:has-text("Podrobnosti se teď nepodařilo načíst.")');
        const before = await dialogText(tab);
        assert.match(before, /Zdroj\s*Wikimedia Commons/);
        assert.ok(!before.includes(fileName));
        await tab.keyboard.press('Escape');
        await tab.click(`[data-action="choice"]:has-text("${data.question.answerLabel}")`);
        const imageTab = tab.locator('[data-action="result-tab"][data-step="image"]');
        await tab.waitForSelector('[data-action="result-tab"]', { timeout: 30000 });
        if (await imageTab.count() && await imageTab.getAttribute('aria-selected') !== 'true') await imageTab.click();
        const resultButton = sourceButton(tab, 'result-tab-panel');
        await resultButton.waitFor({ timeout: 15000 });
        await resultButton.click();
        await tab.waitForSelector('#photo-source [data-source-status]:has-text("Podrobnosti se teď nepodařilo načíst.")');
        assert.ok((await dialogText(tab)).includes(fileName));
        assert.equal(await tab.getAttribute('#photo-source [data-source-commons]', 'href'), Source.pageUrl(fileName));
        assert.equal(log.commons.length, 2, 'nepovedený dotaz se příště zkusí znovu');
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
