// Test barevných témat (Nastavení → Vzhled) v prohlížeči: přepnutí, zamčené téma, pamatování volby, tmavý režim a CSP.
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí. Soubory se servírují s CSP z _headers.
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
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
// 9000 xp = úroveň 16: Oceán (16) je odemčený, Západ slunce (26) ne
const PROGRESS = JSON.stringify({ xp: 9000, counters: {}, badges: {} });

const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (fixtures.files[pathname]) {
            response.writeHead(200, { 'content-type': 'application/json' });
            return response.end(JSON.stringify(fixtures.files[pathname]));
        }
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
        const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        response.writeHead(200, headers);
        response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

test('barevná témata ve Vzhledu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async (options = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: options.colorScheme || 'light', viewport: { width: 390, height: 780 } });
        await context.addInitScript(entries => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': 'choices', ...(options.progress === false ? {} : { 'mudrlant.progress': PROGRESS }), ...(options.storage || {}) });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#btn-settings');
        return { context, tab, problems };
    };
    const openLook = async (tab) => {
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="look"]');
        await tab.waitForSelector('[data-theme-pick]');
    };
    const brand = (tab) => tab.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-600').trim());
    const dataTheme = (tab) => tab.evaluate(() => document.documentElement.getAttribute('data-theme'));
    // Skutečná barva tlačítka s třídou bg-brand-700 (záložky Vzhledu) – ověřuje, že Tailwind bere barvu z proměnných
    const tabColor = (tab) => tab.evaluate(() => getComputedStyle(document.querySelector('[data-me-tab][aria-selected="true"]')).backgroundColor);

    await t.test('výchozí vínové téma vypadá jako dřív a zamčená témata jsou šedá s úrovní', async () => {
        const { context, tab, problems } = await open();
        assert.equal(await dataTheme(tab), null);
        assert.equal(await brand(tab), '159 50 86');
        await openLook(tab);
        assert.equal(await tab.locator('[data-theme-pick]').count(), 8);
        assert.equal(await tab.getAttribute('[data-theme-pick="vinova"]', 'aria-pressed'), 'true');
        assert.equal(await tabColor(tab), 'rgb(135, 35, 63)', 'brand-700 je pořád #87233f');
        assert.match(await tab.textContent('[data-theme-pick="zapad"]'), /Úroveň 26/);
        assert.match(await tab.textContent('[data-theme-pick="legenda"]'), /Úroveň 90/);
        assert.equal(await tab.locator('[data-theme-pick="zapad"] [data-theme]').count(), 0, 'zamčené téma nemá barevný náhled');
        assert.doesNotMatch(await tab.textContent('[data-theme-pick="ocean"]'), /Úroveň/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('odemčené téma se přepne, zamčené nic neudělá a volba se pamatuje', async () => {
        const { context, tab, problems } = await open();
        await openLook(tab);
        await tab.click('[data-theme-pick="zapad"]', { force: true });
        assert.equal(await dataTheme(tab), null, 'zamčené téma se nepoužije');
        assert.equal(await tab.getAttribute('[data-theme-pick="vinova"]', 'aria-pressed'), 'true');
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.look')), null);

        await tab.click('[data-theme-pick="ocean"]');
        assert.equal(await dataTheme(tab), 'ocean');
        assert.equal(await brand(tab), '42 109 167');
        assert.equal(await tabColor(tab), 'rgb(28, 89, 143)');
        assert.equal(await tab.getAttribute('[data-theme-pick="ocean"]', 'aria-pressed'), 'true');
        assert.equal(await tab.getAttribute('[data-theme-pick="vinova"]', 'aria-pressed'), 'false');
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.look'))).theme, 'ocean');

        await tab.reload();
        await tab.waitForSelector('#btn-settings');
        assert.equal(await dataTheme(tab), 'ocean', 'po načtení znovu');
        await openLook(tab);
        assert.equal(await tab.getAttribute('[data-theme-pick="ocean"]', 'aria-pressed'), 'true');

        await tab.click('[data-theme-pick="vinova"]');
        assert.equal(await dataTheme(tab), null);
        assert.equal(await brand(tab), '159 50 86');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('uložené téma, které hráč ještě nemá odemčené, se nepoužije', async () => {
        const { context, tab } = await open({ storage: { 'mudrlant.look': JSON.stringify({ theme: 'legenda' }) } });
        assert.equal(await dataTheme(tab), null);
        await context.close();
    });

    await t.test('všechna témata při vysoké úrovni a tmavý režim bez posuvníku a bez chyb', async () => {
        const { context, tab, problems } = await open({ colorScheme: 'dark', progress: false, storage: { 'mudrlant.progress': JSON.stringify({ xp: 10000000, counters: {}, badges: {} }) } });
        await openLook(tab);
        for (const id of ['les', 'ocean', 'zapad', 'fialova', 'zlata', 'diamant', 'legenda']) {
            await tab.click(`[data-theme-pick="${id}"]`);
            assert.equal(await dataTheme(tab), id);
            assert.notEqual(await brand(tab), '159 50 86');
        }
        assert.equal(await tab.locator('[data-theme-pick]:has-text("Úroveň")').count(), 0, 'nic není zamčené');
        const grid = await tab.evaluate(() => { const g = document.querySelector('[data-look="themes"]'); return g.scrollWidth <= g.clientWidth; });
        assert.ok(grid, 'mřížka se nevejde do šířky jen zřídka');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
