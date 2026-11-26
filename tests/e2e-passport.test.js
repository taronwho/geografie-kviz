// Cestovní pas v prohlížeči (passport.js, app.js): dlaždice Pas v Mém postupu, zpětné doplnění z poznaných položek, obálka s kontinenty,
// stránky kontinentů s pevnou mřížkou (okno ani stránka se neposouvají, buňky nepřetékají), listování šipkami, přejetím i klávesami,
// nové razítko (bouchne jednou, při „omezit pohyb“ bez animace), velké razítko kontinentu a malý čip razítka ve výsledku otázky.
// Pas se skutečnými daty (197 států), odpověď s testovacími daty. Telefon 390×780 i 360×640, světlý i tmavý režim, bez chyb CSP.
// MUDRLANT_SHOTS=… uloží snímky.
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
const SHOTS = process.env.MUDRLANT_SHOTS || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const COUNTRIES = require('../data/countries.json').countries;
const SOUTH = Object.keys(COUNTRIES).filter(id => COUNTRIES[id].continent === 'SA');

// files = data podstrčená místo skutečných (null = skutečná data)
const startServer = (files) => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (files && files[pathname]) { response.writeHead(200, { 'content-type': 'application/json' }); return response.end(JSON.stringify(files[pathname])); }
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
        const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        response.writeHead(200, headers);
        response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

// Testovací Zeměpis jen se státy: každá dnešní otázka je na stát, správná odpověď dá razítko
const STATES_ONLY = { '/data/countries.json': fixtures.files['/data/countries.json'], '/data/zemepis.json': { ...fixtures.files['/data/zemepis.json'], items: fixtures.files['/data/zemepis.json'].items.filter(item => item.c === 'stat') } };

test('cestovní pas: obálka, stránky kontinentů, listování, nová razítka a čip ve výsledku', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const real = await startServer(null);
    const small = await startServer(STATES_ONLY);
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); real.close(); small.close(); });
    const open = async ({ server = real, viewport = { width: 390, height: 780 }, colorScheme = 'light', reducedMotion = 'reduce', seed = {} } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion, deviceScaleFactor: SHOTS ? 2 : 1 });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        await context.addInitScript((data) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
            for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
        }, seed);
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
            const url = new URL(route.request().url());
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`http://127.0.0.1:${server.address().port}/`);
        await nav.waitForHome(tab);
        return { context, tab, problems };
    };
    const storage = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.passport')));
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const overflow = (tab) => tab.evaluate(() => {
        const box = document.getElementById('dialog-overlay').firstElementChild;
        return { y: box.scrollHeight - box.clientHeight, x: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    // Buňky razítek nepřetékají (text i vlajka se vejdou do své buňky mřížky) a mřížka nepřetéká stránku
    const cellsFit = (tab) => tab.evaluate(() => {
        const bad = [...document.querySelectorAll('[data-pas-cell]')].filter(cell => cell.scrollHeight > cell.clientHeight + 1 || cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.dataset.pasCell);
        const book = document.querySelector('[data-pas-book]');
        return { bad, book: book.scrollHeight - book.clientHeight };
    });
    const where = (tab) => tab.textContent('[data-pas-where]');
    const openPass = async (tab) => {
        await nav.go(tab, 'postup');
        await tab.waitForSelector('[data-open-passport]');
        await tab.click('[data-open-passport]');
        await tab.waitForSelector('[data-pas]');
    };
    // Hráč s dřívějším postupem: Česko a Francie (i přes Paříž), celá Jižní Amerika (Zeměpis), indonéská vlajka (Vlajky a znaky)
    const veteran = () => ({ 'mudrlant.learned': { zemepis: ['Q213', 'Q142', 'Q90', ...SOUTH], vlajky: ['Q101472'] } });

    for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark']]) {
        const tag = `${viewport.width}-${colorScheme}`;
        await t.test(`pas z dřívějška: obálka a všechny stránky bez posouvání (${tag})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme, seed: veteran() });
            await nav.go(tab, 'postup');
            // Dlaždice se po doplnění z dřívějška překreslí na 15 / 197 (bez nových razítek: zpětná razítka se nebouchají)
            await tab.waitForFunction(() => /15 \/ 197/.test((document.querySelector('[data-open-passport]') || {}).textContent || ''), null, { timeout: 30000 });
            const scroll = await tab.evaluate(() => { const content = document.getElementById('app-content'); return { y: content.firstElementChild.scrollHeight - content.clientHeight, x: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
            assert.deepEqual(scroll, { x: 0, y: 0 }, 'záložka Postup s dlaždicí Pas bez posouvání');
            await shot(tab, `postup-${tag}`);
            // Přihlášený hráč má navíc Vitrínu: s 11 dlaždicemi (i Statistiky; postup-many, postup-lots) se záložka vejde také (na nízkém displeji dlaždice bez obrázků ve čtyřech sloupcích)
            const tenTiles = await tab.evaluate(() => {
                const grid = document.getElementById('postup-tiles');
                const extra = grid.querySelector('[data-open-chronicle]').cloneNode(true);
                extra.removeAttribute('data-open-chronicle');
                grid.appendChild(extra);
                grid.classList.add('postup-many', 'postup-lots');
                const content = document.getElementById('app-content');
                return { over: content.firstElementChild.scrollHeight - content.clientHeight, tiles: grid.children.length };
            });
            await shot(tab, `postup-11-dlazdic-${tag}`);
            await tab.evaluate(() => {
                const grid = document.getElementById('postup-tiles');
                grid.lastElementChild.remove();
                grid.classList.remove('postup-many', 'postup-lots');
            });
            assert.equal(tenTiles.tiles, 11);
            assert.ok(tenTiles.over <= 0, `11 dlaždic bez posouvání (${tenTiles.over} px)`);
            await openPass(tab);
            assert.match(await where(tab), /Obsah pasu · 1 \/ 14/);
            assert.equal((await tab.textContent('[data-pas-total]')).trim(), '15 / 197');
            assert.equal((await tab.textContent('[data-pas-count="EU"]')).trim(), '2 / 47');
            assert.equal((await tab.textContent('[data-pas-count="SA"]')).trim(), '12 / 12');
            assert.equal((await tab.textContent('[data-pas-count="AS"]')).trim(), '1 / 47');
            assert.equal(await tab.locator('[data-pas-big="SA"]').count(), 1, 'velké razítko za kompletní Jižní Ameriku');
            assert.equal(await tab.locator('.pas-thud').count(), 0);
            assert.deepEqual(await overflow(tab), { x: 0, y: 0 }, 'obálka bez posouvání');
            assert.ok((await cellsFit(tab)).book <= 0, 'obsah obálky se vejde do stránky pasu');
            assert.equal(await tab.locator('[data-pas-share]').count(), 1, 'pas jde sdílet');
            await shot(tab, `pas-obalka-${tag}`);
            const state = await storage(tab);
            assert.deepEqual(state.filled, { zemepis: true, vlajky: true });
            assert.equal(state.stamps.Q213, '', 'zpětné razítko bez data');
            assert.equal(state.done.SA, '');
            // Všechny stránky: šipkou dál; pevná mřížka, buňky nepřetékají, okno bez posouvání
            for (let page = 2; page <= 14; page++) {
                await tab.click('[data-pas-next]');
                await tab.waitForSelector(`[data-pas-page="${page - 1}"]`);
                assert.match(await where(tab), new RegExp(`· ${page} / 14$`));
                const fit = await cellsFit(tab);
                assert.deepEqual(fit.bad, [], `stránka ${page}: buňky se vejdou`);
                assert.ok(fit.book <= 0, `stránka ${page}: mřížka se vejde (${fit.book} px)`);
                assert.deepEqual(await overflow(tab), { x: 0, y: 0 }, `stránka ${page} bez posouvání`);
                const text = await where(tab);
                if (page === 2) {
                    assert.match(text, /^Evropa/);
                    assert.equal(await tab.locator('[data-pas-cell="Q213"][data-pas-have]').count(), 1, 'Česko má razítko');
                    assert.match(await tab.getAttribute('[data-pas-cell="Q213"]', 'title'), /razítko dřív/);
                    assert.equal(await tab.locator('[data-pas-cell="Q31"][data-pas-have]').count(), 0, 'Belgie je prázdné místo');
                    assert.match(await tab.textContent('[data-pas-cell="Q31"]'), /Belgie/);
                    await shot(tab, `pas-evropa-${tag}`);
                }
                if (/^Afrika · 8 /.test(text)) await shot(tab, `pas-afrika-${tag}`);
                if (/^Jižní Amerika/.test(text)) { assert.equal(await tab.locator('[data-pas-book] [data-pas-big="SA"]').count(), 1); await shot(tab, `pas-jizni-amerika-${tag}`); }
            }
            assert.equal(await tab.isDisabled('[data-pas-next]'), true, 'poslední stránka: dál nejde');
            // Klávesy a přejetí prstem (myš: stisk, posun doprava, puštění = zpět)
            await tab.keyboard.press('ArrowLeft');
            await tab.waitForSelector('[data-pas-page="12"]');
            const box = await tab.locator('[data-pas-book]').boundingBox();
            await tab.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
            await tab.mouse.down();
            await tab.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 4 });
            await tab.mouse.up();
            await tab.waitForSelector('[data-pas-page="11"]');
            await tab.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
            await tab.mouse.down();
            await tab.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 4 });
            await tab.mouse.up();
            await tab.waitForSelector('[data-pas-page="12"]');
            // Řádek kontinentu na obálce vede na jeho první stránku
            for (let i = 0; i < 12; i++) await tab.click('[data-pas-prev]');
            await tab.waitForSelector('[data-pas-page="0"]');
            await tab.click('[data-pas-go]:has([data-pas-count="AF"])');
            assert.match(await where(tab), /^Afrika · 8 \/ 14/);
            await tab.click('#dialog-overlay [data-close]');
            await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('nové razítko: zlatá dlaždice, pas otevře jeho stránku, bouchne jednou; velké razítko kontinentu', async () => {
        const stamps = Object.fromEntries(SOUTH.map(id => [id, '2026-11-20']));
        const seed = { 'mudrlant.learned': {}, 'mudrlant.passport': { v: 1, stamps: { ...stamps, Q30: '2026-11-25' }, done: { SA: '2026-11-20' }, filled: { zemepis: true, vlajky: true }, seen: SOUTH.slice(1), doneSeen: [] } };
        for (const colorScheme of ['light', 'dark']) {
            const { context, tab, problems } = await open({ viewport: { width: 360, height: 640 }, colorScheme, reducedMotion: 'no-preference', seed });
            await nav.go(tab, 'postup');
            await tab.waitForSelector('[data-open-passport]');
            assert.match(await tab.textContent('[data-open-passport] [data-passport-value]'), /\+2\s+nová/u);
            assert.match(await tab.getAttribute('[data-open-passport]', 'class'), /ring-gold/);
            await tab.click('[data-open-passport]');
            await tab.waitForSelector('[data-pas]');
            // Pas se otevře na první stránce s novým razítkem v pořadí kontinentů: Severní Amerika (USA) před Jižní Amerikou
            const text = await where(tab);
            assert.match(text, /^Severní Amerika/);
            assert.equal(await tab.locator('[data-pas-cell="Q30"][data-pas-fresh] .pas-thud').count(), 1, 'razítko USA bouchne');
            assert.match(await tab.textContent('[data-pas-cell="Q30"]'), /25\. 11\. 2026/);
            await tab.waitForTimeout(700);
            await shot(tab, `pas-nove-razitko-360-${colorScheme}`);
            assert.deepEqual(await overflow(tab), { x: 0, y: 0 });
            let state = await storage(tab);
            assert.ok(state.seen.includes('Q30'), 'po ukázání viděné');
            // Jižní Amerika: nové razítko státu i velké razítko kontinentu bouchnou
            await tab.click('[data-pas-prev]');
            for (let guard = 0; guard < 14 && !/^Obsah/.test(await where(tab)); guard++) await tab.click('[data-pas-prev]');
            await tab.click('[data-pas-go]:has([data-pas-count="SA"])');
            assert.equal(await tab.locator('[data-pas-book] [data-pas-big="SA"] .pas-thud').count(), 1, 'velké razítko bouchne');
            assert.equal(await tab.locator(`[data-pas-cell="${SOUTH[0]}"] .pas-thud`).count(), 1);
            await tab.waitForTimeout(800);
            await shot(tab, `pas-kompletni-kontinent-360-${colorScheme}`);
            state = await storage(tab);
            assert.ok(state.doneSeen.includes('SA') && state.seen.includes(SOUTH[0]));
            // Podruhé už nic nebouchá
            await tab.click('[data-pas-next]');
            await tab.click('[data-pas-prev]');
            assert.equal(await tab.locator('.pas-thud').count(), 0);
            await tab.click('#dialog-overlay [data-close]');
            await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
            assert.match(await tab.textContent('[data-open-passport] [data-passport-value]'), /13\s*\/\s*197/);
            assert.deepEqual(problems, []);
            await context.close();
        }
        // Omezit pohyb: bez animace, štítek Nové zůstane
        const { context, tab, problems } = await open({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce', seed });
        await openPass(tab);
        assert.equal(await tab.locator('.pas-thud').count(), 0);
        assert.match(await tab.textContent('[data-pas-cell="Q30"]'), /Nové/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('správná odpověď na stát: malý čip razítka ve výsledku, razítko s dnešním dnem v pasu', async () => {
        const { context, tab, problems } = await open({ server: small, viewport: { width: 360, height: 640 } });
        await nav.daily(tab, 'zemepis');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        const data = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
        const index = data.question.choices.findIndex(choice => choice.correct);
        await tab.click(`[data-action="choice"] >> nth=${index}`);
        await tab.waitForSelector('[data-verdict]');
        await tab.waitForSelector('[data-stamp-chip]');
        assert.equal((await tab.textContent('[data-stamp-chip]')).trim(), data.name);
        await shot(tab, 'vysledek-cip-razitka-360-light');
        const state = await storage(tab);
        const day = await tab.evaluate(() => window.MudrlantCore.getDayKey());
        assert.equal(state.stamps[data.id], day);
        assert.equal(Object.keys(state.stamps).length, 1);
        assert.deepEqual(problems, []);
        await context.close();
    });
});
