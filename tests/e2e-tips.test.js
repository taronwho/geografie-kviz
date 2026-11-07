// Tipy od Mudrlanta: žárovka u sovy s vysvětlením funkce hry, odstup mezi tipy, vypnutí v Nastavení, obnovení ve vývojářském režimu.
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

test('tipy od Mudrlanta', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', dev = false } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme });
        await context.addInitScript((devOn) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            if (devOn) localStorage.setItem('mudrlant.dev', '1');
        }, dev);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };
    const bulbVisible = (tab) => tab.evaluate(() => { const el = document.getElementById('fact-hint'); return Boolean(el) && !el.classList.contains('hidden'); });

    await t.test('nový hráč: žárovka ukáže první tip, po přečtení zmizí a nevrací se hned; stav se uloží', async () => {
        const { context, tab, problems } = await open();
        await tab.waitForFunction(() => { const el = document.getElementById('fact-hint'); return el && !el.classList.contains('hidden'); });
        assert.match(await tab.getAttribute('#fact-hint', 'title'), /tip/i);
        await tab.click('#fact-hint');
        await tab.waitForSelector('#tip-dialog');
        assert.equal(await tab.getAttribute('#tip-dialog', 'data-tip'), 'dnesni');
        assert.match(await tab.textContent('#tip-dialog'), /Dnešní otázky/);
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return box.scrollHeight <= box.clientHeight + 1; }), true, 'tip se vejde bez posouvání');
        const state = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.tips')));
        assert.deepEqual(state.seen, ['dnesni']);
        assert.equal(state.n, 1);
        await tab.click('#tip-dialog [data-close]');
        await tab.waitForSelector('#tip-dialog', { state: 'detached' });
        assert.equal(await bulbVisible(tab), false, 'hned po tipu žárovka zmizí (odstup mezi tipy)');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Nastavení: vypnutí tipů skryje žárovku, dev tlačítko je vrátí', async () => {
        const { context, tab } = await open({ dev: true });
        await tab.waitForFunction(() => { const el = document.getElementById('fact-hint'); return el && !el.classList.contains('hidden'); });
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-tips-toggle]');
        assert.equal(await tab.getAttribute('[data-tips-toggle]', 'aria-checked'), 'true');
        await tab.click('[data-tips-toggle]');
        await tab.waitForFunction(() => document.querySelector('[data-tips-toggle]').getAttribute('aria-checked') === 'false');
        await tab.click('[data-close]');
        assert.equal(await bulbVisible(tab), false);
        await tab.click('#btn-settings');
        await tab.click('[data-tips-toggle]');
        await tab.waitForFunction(() => document.querySelector('[data-tips-toggle]').getAttribute('aria-checked') === 'true');
        await tab.click('[data-dev="tips"]');
        await tab.click('[data-close]');
        await tab.waitForFunction(() => { const el = document.getElementById('fact-hint'); return el && !el.classList.contains('hidden'); });
        await context.close();
    });

    await t.test('tlačítko u tipu vede na funkci a „Tipy už nechci“ je vypne', async () => {
        const { context, tab } = await open();
        await tab.evaluate(() => localStorage.setItem('mudrlant.tips', JSON.stringify({ seen: ['dnesni', 'napoveda'], day: '2000-01-01', n: 0, lastAt: 0, off: false, visited: {} })));
        await tab.evaluate(() => { const p = JSON.parse(localStorage.getItem('mudrlant.progress') || '{}'); p.counters = { ...(p.counters || {}), answered: 10 }; localStorage.setItem('mudrlant.progress', JSON.stringify(p)); });
        await tab.reload();
        await tab.waitForSelector('[data-action="play-topic"]');
        await tab.waitForFunction(() => { const el = document.getElementById('fact-hint'); return el && !el.classList.contains('hidden'); });
        await tab.click('#fact-hint');
        await tab.waitForSelector('#tip-dialog');
        const kind = await tab.evaluate(() => document.querySelector('#tip-dialog').dataset.tip);
        assert.ok(['vyzva', 'uceni'].includes(kind), kind);
        if (await tab.locator('[data-tip-go]').count()) {
            await tab.click('[data-tip-go]');
            await tab.waitForSelector('#tip-dialog', { state: 'detached' });
        } else await tab.click('#tip-dialog [data-close]');
        await context.close();
        const second = await open();
        await second.tab.waitForFunction(() => { const el = document.getElementById('fact-hint'); return el && !el.classList.contains('hidden'); });
        await second.tab.click('#fact-hint');
        await second.tab.waitForSelector('#tip-dialog');
        await second.tab.click('[data-tip-off]');
        await second.tab.waitForSelector('#tip-dialog', { state: 'detached' });
        assert.equal(await second.tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.tips')).off), true);
        assert.equal(await bulbVisible(second.tab), false);
        await second.context.close();
    });
});
