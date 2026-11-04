// Další dnešní otázka se nabízí z témat, na která se dnes ještě neodpovídalo, v náhodném pořadí (ne vždy stejném).
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

test('další dnešní téma je náhodné z neodehraných', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // První téma po „Hrát vše“ při pevném náhodném čísle: 0 = první neodehrané, 0.99 = poslední
    const firstTopic = async (random) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript((value) => {
            Math.random = () => value;
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
        }, random);
        const tab = await context.newPage();
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-daily"]');
        await tab.click('[data-action="play-daily"]');
        await tab.waitForSelector('[data-action="choice"], #app-content [data-topic-title], #status-text', { timeout: 30000 });
        await tab.waitForFunction(() => /·/.test(document.getElementById('status-text').textContent), null, { timeout: 30000 });
        const label = (await tab.textContent('#status-text')).trim();
        await context.close();
        return label;
    };

    const low = await firstTopic(0);
    const high = await firstTopic(0.99);
    assert.notEqual(low, high, `náhodná volba dává různá témata (${low} / ${high})`);
});
