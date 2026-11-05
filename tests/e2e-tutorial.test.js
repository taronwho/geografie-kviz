// Tutorial při prvním spuštění (tutorial.js): průchod skutečnou otázkou, přeskočení, jednorázovost, Projít znovu, CSP, bez posouvání okna.
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
const SHOTS = process.env.TUTORIAL_SHOTS || '';

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

test('tutorial při prvním spuštění', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    let fact = factFor(dayKey());
    const server = await startServer(() => fact);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // done = tutoriál je už hotový (jako u ostatních testů); jinak čistý start v novém zařízení
    const open = async ({ done = false, viewport = { width: 390, height: 780 }, scheme = 'light' } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme: scheme });
        await context.addInitScript((isDone) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            if (isDone) localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
        }, done);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };
    const title = (tab) => tab.textContent('[data-tut-title]');
    const waitTitle = (tab, text) => tab.waitForFunction((wanted) => {
        const el = document.querySelector('#tutorial:not(.hidden) [data-tut-title]');
        return el && el.textContent === wanted;
    }, text);
    const stored = (tab) => tab.evaluate(() => localStorage.getItem('mudrlant.tutorial'));
    const noScroll = (tab) => tab.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight && window.scrollY === 0 && document.body.scrollTop === 0);
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    // Prvek pod bodem je panel tutoriálu (zablokovaný), nebo skutečný prvek stránky
    const blocked = (tab, selector) => tab.evaluate((sel) => {
        const box = document.querySelector(sel).getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return Boolean(hit && hit.closest('#tutorial'));
    }, selector);

    await t.test('celý průchod: žárovka, dnešní otázka, nápověda, odpověď, výsledek, menu, témata, více hráčů, nastavení', async () => {
        fact = factFor(dayKey());
        const { context, tab, problems } = await open();
        await waitTitle(tab, 'Ahoj, jsem Sova!');
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 1 z 9/);
        assert.equal(await tab.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-tut-skip')), true, 'focus na Přeskočit');
        assert.equal(await tab.getAttribute('[data-tut-bubble]', 'role'), 'dialog');
        assert.equal(await tab.getAttribute('[data-tut-bubble] [aria-live]', 'aria-live'), 'polite');
        assert.equal(await blocked(tab, '#btn-settings'), true, 'ostatní prvky jsou zablokované');
        assert.equal(await blocked(tab, '[data-action="play-mix"]'), true);
        assert.equal(await blocked(tab, '#fact-hint'), false, 'zvýrazněný prvek zůstává klikatelný');
        await shot(tab, '1-zarovka');
        await tab.click('#fact-hint');
        await tab.waitForSelector('#fact-overlay');
        assert.equal(await tab.isVisible('#tutorial'), false, 'při oknu s událostí tutoriál ustoupí');
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#fact-overlay', { state: 'detached' });
        assert.equal(await stored(tab), null, 'Escape zavřel jen okno, tutoriál běží dál');
        await waitTitle(tab, 'Dnešní otázky');
        assert.equal(await blocked(tab, '[data-action="daily"]'), false);
        assert.equal(await blocked(tab, '[data-action="play-daily"]'), true);
        await shot(tab, '2-dnes');
        await tab.click('[data-action="daily"]');
        await waitTitle(tab, 'Nápověda');
        assert.equal(await blocked(tab, '[data-action="hint"]'), false);
        await shot(tab, '3-napoveda');
        await tab.click('[data-action="hint"]');
        await waitTitle(tab, 'Tvoje odpověď');
        assert.equal(await blocked(tab, '[data-action="choice"]'), false);
        await shot(tab, '4-odpoved');
        const before = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress') || '{"xp":0}').xp);
        await tab.click('[data-action="choice"]');
        await waitTitle(tab, 'Výsledek');
        await shot(tab, '5-vysledek');
        assert.equal(await blocked(tab, '[data-verdict]'), true, 'výsledek je jen k prohlédnutí');
        const after = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress') || '{"xp":0}').xp);
        assert.ok(after >= before, 'otázka je skutečná');
        await tab.click('[data-tut-next]');
        await waitTitle(tab, 'Dál');
        await shot(tab, '6-menu');
        await tab.click('[data-action="daily-home"]');
        await waitTitle(tab, 'Témata a Mix');
        await shot(tab, '7-temata');
        await tab.click('[data-tut-next]');
        await waitTitle(tab, 'Více hráčů');
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 8 z 9/);
        assert.match(await tab.textContent('[data-tut-text]'), /kód.*přezdívk.*odvet.*rating.*lig.*týdenní žebříček.*Google/s);
        assert.equal(await blocked(tab, '[data-action="home-tab"][data-tab="multi"]'), true, 'krok je jen informační, záložka je zablokovaná');
        assert.equal(await tab.getAttribute('[data-tut-ring]', 'class').then(c => c.includes('ring-gold-400')), true);
        assert.equal(await tab.evaluate(() => {
            const ring = document.querySelector('[data-tut-ring]').getBoundingClientRect();
            const target = document.querySelector('[data-action="home-tab"][data-tab="multi"]').getBoundingClientRect();
            return Math.abs(ring.left - (target.left - 4)) <= 1 && Math.abs(ring.top - (target.top - 4)) <= 1 && Math.abs(ring.width - (target.width + 8)) <= 2;
        }), true, 'zvýrazněná je záložka Více hráčů');
        assert.equal(await tab.getAttribute('[data-action="home-tab"][aria-selected="true"]', 'data-tab'), 'single', 'záložka se nepřepíná');
        assert.equal(await noScroll(tab), true, 'krok nepřidá posouvání okna');
        await shot(tab, '8-multi');
        await tab.click('[data-tut-next]');
        await waitTitle(tab, 'Nastavení');
        await shot(tab, '9-nastaveni');
        assert.equal(await blocked(tab, '#btn-settings'), false);
        await tab.click('#btn-settings');
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        await tab.waitForSelector('#settings-overlay', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'done' });
        assert.equal(await noScroll(tab), true, 'okno se neposouvá');
        assert.deepEqual(problems, [], 'bez chyb CSP');
        // Jednorázové: po obnovení se už neukáže
        await tab.reload();
        await tab.waitForSelector('[data-action="play-topic"]');
        await tab.waitForTimeout(700);
        assert.equal(await tab.locator('#tutorial').count(), 0);
        await context.close();
    });

    await t.test('Přeskočit kdykoli ukončí celý tutoriál a uloží stav; platí i Escape', async () => {
        fact = factFor(dayKey());
        let page = await open();
        await waitTitle(page.tab, 'Ahoj, jsem Sova!');
        await page.tab.click('[data-tut-skip]');
        await page.tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(page.tab)), { how: 'skipped' });
        await page.tab.click('#btn-settings');
        await page.tab.waitForSelector('#settings-overlay');
        assert.deepEqual(page.problems, []);
        await page.context.close();
        page = await open();
        await waitTitle(page.tab, 'Ahoj, jsem Sova!');
        await page.tab.keyboard.press('Escape');
        await page.tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(page.tab)), { how: 'skipped' });
        await page.context.close();
    });

    await t.test('bez dnešní události se začíná dnešními otázkami a sova se představí', async () => {
        fact = null;
        const { context, tab } = await open();
        await waitTitle(tab, 'Dnešní otázky');
        assert.match(await tab.textContent('[data-tut-text]'), /Ahoj, jsem Sova/);
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 2 z 9/);
        await context.close();
    });

    await t.test('tlačítko Projít znovu tutoriál v Nastavení → Hra', async () => {
        fact = factFor(dayKey());
        const { context, tab, problems } = await open({ done: true });
        await tab.waitForTimeout(600);
        assert.equal(await tab.locator('#tutorial').count(), 0, 'hotový tutoriál se nespouští');
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-tutorial-restart]');
        await shot(tab, '9-nastaveni-tlacitko');
        await tab.click('[data-tutorial-restart]');
        await tab.waitForSelector('#settings-overlay', { state: 'detached' });
        await waitTitle(tab, 'Ahoj, jsem Sova!');
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(problems, []);
        await context.close();
    });

    for (const [name, viewport, scheme] of [['tmavý 360x640', { width: 360, height: 640 }, 'dark'], ['světlý 390x780', { width: 390, height: 780 }, 'light']]) {
        await t.test(`bublina a zvýraznění se vejdou na obrazovku (${name})`, async () => {
            fact = factFor(dayKey());
            const { context, tab } = await open({ viewport, scheme });
            await waitTitle(tab, 'Ahoj, jsem Sova!');
            const inside = () => tab.evaluate(() => {
                const bubble = document.querySelector('[data-tut-bubble]').getBoundingClientRect();
                return bubble.top >= 0 && bubble.bottom <= window.innerHeight && bubble.left >= 0 && bubble.right <= window.innerWidth;
            });
            assert.equal(await inside(), true);
            await shot(tab, `v-${viewport.width}-${scheme}-1`);
            await tab.click('#fact-hint');
            await tab.keyboard.press('Escape');
            await waitTitle(tab, 'Dnešní otázky');
            assert.equal(await inside(), true);
            await tab.click('[data-action="daily"]');
            await waitTitle(tab, 'Nápověda');
            assert.equal(await inside(), true);
            await shot(tab, `v-${viewport.width}-${scheme}-3`);
            await tab.click('[data-tut-next]');
            await waitTitle(tab, 'Tvoje odpověď');
            assert.equal(await inside(), true);
            await shot(tab, `v-${viewport.width}-${scheme}-4`);
            await tab.click('[data-action="choice"]');
            await waitTitle(tab, 'Výsledek');
            assert.equal(await inside(), true);
            await shot(tab, `v-${viewport.width}-${scheme}-5`);
            assert.equal(await noScroll(tab), true);
            await tab.click('[data-tut-next]');
            await waitTitle(tab, 'Dál');
            await tab.click('[data-action="daily-home"]');
            await waitTitle(tab, 'Témata a Mix');
            await tab.click('[data-tut-next]');
            await waitTitle(tab, 'Více hráčů');
            assert.equal(await inside(), true, 'bublina kroku o multiplayeru se vejde');
            assert.equal(await tab.evaluate(() => {
                const bubble = document.querySelector('[data-tut-bubble]').getBoundingClientRect();
                const target = document.querySelector('[data-action="home-tab"][data-tab="multi"]').getBoundingClientRect();
                return bubble.bottom <= target.top || bubble.top >= target.bottom;
            }), true, 'bublina nezakrývá záložku');
            await shot(tab, `v-${viewport.width}-${scheme}-8`);
            assert.equal(await noScroll(tab), true, 'ani nový krok nepřidá posouvání');
            await context.close();
        });
    }
});
