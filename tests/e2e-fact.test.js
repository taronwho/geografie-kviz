// Denní zajímavost na úvodní obrazovce: bublina sovy, okno s textem a odkazem na Wikipedii, zapamatování přečtení, zastaralý soubor.
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
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const factFor = (date) => ({ date, year: 1922, title: 'Objev hrobky Tutanchamona', text: 'V roce 1922 objevil Howard Carter vchod do hrobky faraona Tutanchamona.', url: 'https://cs.wikipedia.org/wiki/Tutanchamon', page: 'Tutanchamon', source: 'Wikipedie' });

const startServer = (getFact) => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/data/fakt.json') {
            const fact = getFact();
            if (!fact) { response.writeHead(404); return response.end(); }
            response.writeHead(200, { 'content-type': 'application/json' });
            return response.end(JSON.stringify(fact));
        }
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

test('denní zajímavost', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    let fact = null;
    const server = await startServer(() => fact);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async () => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript(() => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };

    await t.test('bez souboru nebo se starým dnem se bublina neukáže', async () => {
        fact = null;
        let page = await open();
        await page.tab.waitForTimeout(500);
        assert.equal(await page.tab.isVisible('#fact-hint'), false);
        await page.context.close();
        fact = factFor('2020-01-01');
        page = await open();
        await page.tab.waitForTimeout(500);
        assert.equal(await page.tab.isVisible('#fact-hint'), false, 'včerejší zajímavost se neukazuje');
        await page.context.close();
    });

    await t.test('bublina nabídne zajímavost, okno má text a odkaz na Wikipedii, po přečtení zůstane titulek', async () => {
        fact = factFor(dayKey());
        const { context, tab, problems } = await open();
        await tab.waitForSelector('#fact-hint:not(.hidden)');
        assert.equal(await tab.isVisible('#fact-hint'), true, 'nepřečtená má žárovku');
        await tab.waitForTimeout(600);
        assert.equal(await tab.evaluate(() => { const box = document.getElementById('app-content'); return box.scrollHeight <= box.clientHeight; }), true, 'úvod bez posouvání');
        await tab.click('#fact-hint');
        await tab.waitForSelector('#dialog-overlay [data-fact-link]');
        assert.match(await tab.textContent('#dialog-overlay'), /Howard Carter/);
        assert.equal(await tab.getAttribute('[data-fact-link]', 'href'), 'https://cs.wikipedia.org/wiki/Tutanchamon');
        assert.equal(await tab.getAttribute('[data-fact-link]', 'target'), '_blank');
        assert.match(await tab.getAttribute('[data-fact-link]', 'rel'), /noopener/);
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
        assert.equal(await tab.isVisible('#fact-hint'), false, 'po přečtení žárovka zmizí');
        await tab.reload();
        await tab.waitForSelector('[data-action="play-topic"]');
        await tab.waitForTimeout(500);
        assert.equal(await tab.isVisible('#fact-hint'), false, 'přečtení se pamatuje');
        // Zajímavost jde otevřít i po přečtení klepnutím na sovu; klepnutí na text vedle sovy otevře postup
        await tab.click('#status-icon-slot');
        await tab.waitForSelector('#dialog-overlay [data-fact-link]');
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
        await tab.click('#status-text');
        await tab.waitForSelector('#dialog-overlay');
        assert.doesNotMatch(await tab.textContent('#dialog-overlay'), /Howard Carter/, 'text vedle sovy otevře postup, ne zajímavost');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('podezřelý odkaz (mimo Wikipedii) se nepřijme', async () => {
        fact = { ...factFor(dayKey()), url: 'https://example.com/x' };
        const { context, tab } = await open();
        await tab.waitForTimeout(500);
        assert.equal(await tab.isVisible('#fact-hint'), false);
        await context.close();
    });
});
