// Odškrtávací seznam okruhu a Můj obor (obor.js) v prohlížeči: Učení → okruh → seznam a filtr, volba oboru, hra popořadě,
// navázání po znovuotevření, zlatá pečeť za 100 % (s animací i s omezeným pohybem), změna oboru; bez posouvání stránky na 390×780 i 360×640.
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

// Přemyslovci v testovacích datech: Přemysl Otakar II. (1253) a Václav II. (1283), řazení podle roku; hráč zná Václava II.
const KNOWN = { historie: ['Q130006'] };
const KEY = 'historie|premyslovci';

test('odškrtávací seznam okruhu a Můj obor', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', reducedMotion = 'no-preference', seed = {} } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        await context.addInitScript((values) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
        }, { 'mudrlant.learned': KNOWN, ...seed });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await nav.waitForHome(tab);
        return { context, tab, problems };
    };
    // Stránka se neposouvá (po doběhnutí úvodní animace fade-in o 10 px)
    const noScroll = async (tab) => {
        await tab.waitForTimeout(450);
        return tab.evaluate(() => { const box = document.getElementById('app-content'); return box.scrollHeight <= box.clientHeight + 1; });
    };
    const store = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.obor')));
    const openCollection = async (tab) => {
        await nav.learn(tab);
        await tab.click('[data-action="learn-topic"][data-topic="historie"]');
        await tab.click('[data-action="learn-collection"][data-collection="premyslovci"]');
        await tab.waitForSelector('[data-checklist-card]');
    };
    const answerRight = async (tab) => {
        await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
        const data = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
        await tab.click(`[data-action="choice"]:has-text("${data.question.answerLabel}")`);
        await tab.waitForSelector('[data-action="next"]');
        return data;
    };

    for (const [name, viewport, colorScheme] of [['390×780', { width: 390, height: 780 }, 'light'], ['360×640 tmavý režim', { width: 360, height: 640 }, 'dark']]) {
        await t.test(`seznam okruhu, filtr a stránka oboru bez posouvání (${name})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            await nav.learn(tab);
            await tab.waitForSelector('[data-action="learn-obor"]');
            assert.equal(await noScroll(tab), true, 'Učení s dlaždicí Můj obor bez posouvání');
            await tab.click('[data-action="learn-topic"][data-topic="historie"]');
            await tab.click('[data-action="learn-collection"][data-collection="premyslovci"]');
            await tab.waitForSelector('[data-checklist-card]');
            assert.match(await tab.textContent('[data-checklist-count]'), /^1\s*\/\s*2$/);
            assert.match(await tab.textContent('[data-checklist-percent]'), /50 %/);
            assert.equal(await noScroll(tab), true, 'okruh bez posouvání');
            // Seznam: obě položky v pořadí okruhu, zaškrtnutá jen známá
            await tab.click('[data-action="learn-list"]');
            await tab.waitForSelector('[data-checklist]');
            const rows = await tab.$$eval('[data-checklist] [data-action="item-info"]', list => list.map(row => [row.textContent.replace(/\s+/g, ' ').trim(), row.dataset.known]));
            assert.deepEqual(rows, [['1. Přemysl Otakar II. ještě ne', '0'], ['2. Václav II. umíš', '1']]);
            assert.equal(await noScroll(tab), true, 'seznam bez posouvání stránky');
            await tab.click('[data-action="checklist-filter"][data-filter="missing"]');
            await tab.waitForSelector('[data-filter="missing"][aria-pressed="true"]');
            assert.deepEqual(await tab.$$eval('[data-checklist] [data-action="item-info"]', list => list.map(row => row.dataset.id)), ['Q130005']);
            await tab.click('[data-action="checklist-filter"][data-filter="done"]');
            await tab.waitForSelector('[data-filter="done"][aria-pressed="true"]');
            assert.deepEqual(await tab.$$eval('[data-checklist] [data-action="item-info"]', list => list.map(row => row.dataset.id)), ['Q130006']);
            // Klepnutím na položku okno s popisem
            await tab.click('[data-checklist] [data-action="item-info"]');
            await tab.waitForSelector('#place-info h2:has-text("Václav II.")');
            await tab.keyboard.press('Escape');
            // Zpět na okruh a Udělat z toho můj obor
            await tab.click('#btn-home');
            await tab.waitForSelector('[data-action="obor-choose"]');
            assert.match(await tab.textContent('[data-action="obor-choose"]'), /Udělat z toho můj obor/);
            await tab.click('[data-action="obor-choose"]');
            await tab.waitForSelector('[data-obor-card]');
            assert.match(await tab.textContent('[data-obor-card]'), /Můj obor · Historie\s*Přemyslovci/);
            assert.match(await tab.textContent('[data-action="obor-play"]'), /Začít\s*Na řadě č\. 1 z 2/);
            assert.equal(await tab.locator('[data-checklist] li').count(), 2);
            assert.equal(await noScroll(tab), true, 'Můj obor bez posouvání');
            assert.equal((await store(tab)).current, KEY);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('obor se hraje popořadě, navazuje po znovuotevření a za 100 % dá zlatou pečeť', async () => {
        const { context, tab, problems } = await open({ seed: { 'mudrlant.obor': { current: KEY, fields: { [KEY]: { cursor: null, at: 1, label: 'Přemyslovci' } } } } });
        await nav.learn(tab);
        assert.match(await tab.textContent('[data-action="learn-obor"]'), /Můj obor\s*Přemyslovci/, 'dlaždice ukazuje obor bez načtení tématu');
        await tab.click('[data-action="learn-obor"]');
        await tab.click('[data-action="obor-play"]');
        // Jediná neznámá položka: Přemysl Otakar II.
        const first = await answerRight(tab);
        assert.equal(first.id, 'Q130005');
        assert.equal(await tab.textContent('#status-text'), 'Můj obor · Přemyslovci · 1/2');
        assert.equal((await store(tab)).fields[KEY].cursor, 'Q130005', 'pozice se uložila hned po odpovědi');
        assert.match(await tab.textContent('[data-action="next"]'), /Uzavřít okruh zlatou pečetí/);
        await tab.click('[data-action="next"]');
        // Stránka oboru: pečeť dopadne jako razítko, hláška a zápis do úložiště
        await tab.waitForSelector('[data-obor-card] [data-seal].seal-stamp');
        await tab.waitForSelector('#toast:has-text("Okruh uzavřen zlatou pečetí")');
        assert.notEqual(await tab.$eval('[data-seal]', el => getComputedStyle(el).animationName), 'none', 'animace razítka');
        assert.match(await tab.textContent('[data-checklist-count]'), /^2\s*\/\s*2$/);
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test((await store(tab)).seals[KEY]));
        // Hotový obor se opakuje popořadě: za Přemyslem Otakarem II. přijde Václav II.
        assert.match(await tab.textContent('[data-action="obor-play"]'), /Opakovat popořadě\s*Všechno umíš · opakování od č\. 2/);
        await tab.click('[data-action="obor-play"]');
        const second = await answerRight(tab);
        assert.equal(second.id, 'Q130006');
        assert.match(await tab.textContent('[data-action="next"]'), /Další z oboru/);
        // Šipka zpět ze hry vede na stránku oboru; pečeť podruhé bez animace
        await tab.click('#btn-home');
        await tab.waitForSelector('[data-obor-card] [data-seal]');
        assert.equal(await tab.locator('[data-seal].seal-stamp').count(), 0);
        // Znovuotevření aplikace: naváže se za naposledy zodpovězenou položkou
        await tab.reload();
        await nav.waitForHome(tab);
        await nav.learn(tab);
        await tab.click('[data-action="learn-obor"]');
        await tab.waitForSelector('[data-obor-card]');
        assert.match(await tab.textContent('[data-action="obor-play"]'), /opakování od č\. 1/);
        // Pečeť je vidět i v přehledu okruhů tématu
        await tab.click('#btn-home');
        await tab.click('[data-action="learn-topic"][data-topic="historie"]');
        await tab.waitForSelector('[data-action="learn-collection"][data-collection="premyslovci"][data-sealed] [data-seal]');
        assert.equal(await tab.locator('[data-action="learn-collection"][data-collection="anglicti-panovnici"][data-sealed]').count(), 0);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('s omezeným pohybem pečeť bez animace; změna oboru si pamatuje rozpracované (360×640)', async () => {
        const all = { historie: ['Q130005', 'Q130006'] };
        const { context, tab, problems } = await open({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce', seed: { 'mudrlant.learned': all } });
        await openCollection(tab);
        await tab.waitForSelector('[data-checklist-card] [data-seal].seal-stamp');
        assert.equal(await tab.$eval('[data-seal]', el => getComputedStyle(el).animationName), 'none', 'omezit pohyb: bez razítka');
        assert.equal(await noScroll(tab), true);
        // Dva obory: Přemyslovci a Angličtí panovníci; v okně Změnit obor oba s postupem, přepnutí a odebrání
        await tab.click('[data-action="obor-choose"]');
        await tab.waitForSelector('[data-obor-card]');
        await tab.click('#btn-home');
        await tab.click('[data-action="learn-topic"][data-topic="historie"]');
        await tab.click('[data-action="learn-collection"][data-collection="anglicti-panovnici"]');
        await tab.click('[data-action="obor-choose"]');
        await tab.waitForSelector('[data-obor-card]:has-text("Angličtí panovníci")');
        await tab.click('[data-action="obor-change"]');
        await tab.waitForSelector('#dialog-overlay [data-obor-fields]');
        const fields = await tab.$$eval('#dialog-overlay [data-obor-switch]', list => list.map(row => [row.dataset.oborSwitch, row.getAttribute('aria-current'), row.textContent.replace(/\s+/g, ' ').trim()]));
        assert.deepEqual(fields, [
            ['historie|anglicti-panovnici', 'true', 'Angličtí panovníci Historie · 0 / 2 · 0 %'],
            ['historie|premyslovci', null, 'Přemyslovci Historie · 2 / 2 · 100 %']
        ]);
        assert.equal(await tab.locator('#dialog-overlay [data-obor-switch="historie|premyslovci"] [data-seal]').count(), 1);
        const box = await tab.$eval('#dialog-overlay > div', el => { const r = el.getBoundingClientRect(); return [r.top, r.bottom]; });
        assert.ok(box[0] >= 0 && box[1] <= 640, 'okno se vejde na výšku');
        await tab.click('#dialog-overlay [data-obor-switch="historie|premyslovci"]');
        await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
        await tab.waitForSelector('[data-obor-card]:has-text("Přemyslovci")');
        assert.equal((await store(tab)).current, KEY);
        await tab.click('[data-action="obor-change"]');
        await tab.click('#dialog-overlay [data-obor-remove="historie|anglicti-panovnici"]');
        await tab.waitForFunction(() => document.querySelectorAll('#dialog-overlay [data-obor-switch]').length === 1);
        assert.deepEqual(Object.keys((await store(tab)).fields), [KEY]);
        assert.deepEqual((await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.learned')))).historie, ['Q130005', 'Q130006'], 'odebrání nesmaže, co hráč umí');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
