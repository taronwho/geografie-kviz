// Opakování s rozestupy (karty z chyb, dlaždice v Učení, čip u tlačítka Učení) a týdenní cíle na úvodu: rozložení na telefonu, tmavý režim, průchod opakováním.
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

test('opakování s rozestupy a týdenní cíle', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', mistakes = [] } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme });
        await context.addInitScript((seed) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            if (seed.length) localStorage.setItem('mudrlant.mistakes', JSON.stringify(seed));
        }, mistakes);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };
    const noScroll = (tab) => tab.evaluate(() => { const box = document.getElementById('app-content'); return box.scrollHeight <= box.clientHeight + 1; });

    for (const [name, viewport, colorScheme] of [['390×780', { width: 390, height: 780 }, 'light'], ['360×640 tmavý režim', { width: 360, height: 640 }, 'dark']]) {
        await t.test(`úvod: cíle týdne se vejdou bez posouvání (${name})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            const goals = tab.locator("#weekly-goals");
            await goals.waitFor();
            assert.equal(await goals.locator('[data-goal]').count(), 3);
            assert.match(await goals.textContent(), /Cíle týdne\s*0\/3/);
            await goals.click();
            await tab.waitForSelector('#dialog-overlay [data-goal-row]');
            assert.equal(await tab.locator('#dialog-overlay [data-goal-row]').count(), 3);
            assert.match(await tab.textContent('#dialog-overlay'), /\+\d+ XP/);
            assert.match(await tab.textContent('#dialog-overlay'), /bonus \+200 XP/);
            await tab.keyboard.press('Escape');
            await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
            await tab.waitForTimeout(400);
            // Na 360×640 se úvod posouval už před cíli (14 témat); tam se hlídá jen to, že pruh cílů přibyl nanejvýš o svou výšku
            if (viewport.height >= 780) assert.equal(await noScroll(tab), true, 'úvod bez posouvání');
            else assert.ok(await tab.evaluate(() => { const b = document.getElementById('app-content'); return b.scrollHeight - b.clientHeight <= 120; }), 'posun na malém telefonu zůstává malý');
            const box = await goals.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= viewport.width, 'karta cílů nepřetéká');
            assert.equal(await tab.locator('[data-review-due]').count(), 0, 'bez karet žádný čip');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('chyby se stanou kartami, Učení ukáže počet a opakování je dohraje', async () => {
        const { context, tab, problems } = await open({ mistakes: ['zemepis:Q4242', 'zemepis:Q39'] });
        await tab.waitForSelector('[data-review-due]');
        assert.equal((await tab.textContent('[data-review-due]')).replace(/\D/g, ''), '2');
        await tab.click('#btn-learn');
        await tab.waitForSelector('[data-review-section]');
        assert.match(await tab.textContent('[data-review-section]'), /K procvičení dnes \(2\)/);
        await tab.waitForTimeout(500);
        assert.equal(await noScroll(tab), true, 'Učení bez posouvání');
        await tab.click('[data-action="review-start"]');
        await tab.waitForSelector('[data-action="choice"]');
        assert.match(await tab.textContent('body'), /Procvičování · 1\/2/);
        for (let i = 0; i < 2; i++) {
            await tab.locator('[data-action="choice"]').first().click();
            await tab.waitForSelector('[data-action="next"]');
            await tab.click('[data-action="next"]');
            if (i === 0) await tab.waitForSelector('[data-action="choice"]');
        }
        await tab.waitForSelector('[data-review-section]');
        assert.match(await tab.textContent('[data-review-section]'), /Zvládnuto \d z 2/);
        const cards = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.review')));
        const today = await tab.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
        for (const card of cards) assert.ok(card.due > today, 'zopakovaná karta se vrací později');
        assert.equal(await tab.locator('[data-action="review-start"]').count(), 0, 'dnes už není co opakovat');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('opakování jde v Nastavení vypnout: zmizí čip i dlaždice a nezakládají se karty; zapnout jde zpět', async () => {
        const { context, tab, problems } = await open({ mistakes: ['zemepis:Q4242', 'zemepis:Q39'] });
        await tab.waitForSelector('[data-review-due]');
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-review-toggle]');
        assert.equal(await tab.getAttribute('[data-review-toggle]', 'aria-checked'), 'true', 've výchozím stavu zapnuto');
        await tab.click('[data-review-toggle]');
        await tab.waitForFunction(() => document.querySelector('[data-review-toggle]').getAttribute('aria-checked') === 'false');
        assert.equal(await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.reviewOn'))), false);
        assert.equal(await tab.locator('[data-review-due]').count(), 0, 'čip zmizel');
        await tab.click('[data-close]');
        await tab.click('#btn-learn');
        await tab.waitForSelector('[data-action="learn-topic"], #app-content');
        await tab.waitForTimeout(300);
        assert.equal(await tab.locator('[data-review-section]').count(), 0, 'dlaždice opakování zmizela');
        await tab.click('#btn-settings');
        await tab.click('[data-review-toggle]');
        await tab.waitForFunction(() => document.querySelector('[data-review-toggle]').getAttribute('aria-checked') === 'true');
        await tab.click('[data-close]');
        await tab.waitForSelector('[data-review-due]');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
