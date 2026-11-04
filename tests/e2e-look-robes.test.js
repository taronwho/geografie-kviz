// Odměna „barva obleku sovy“ v prohlížeči: výběr v Nastavení → Vzhled, přepnutí obrázků sovy, zamčené barvy, uložení volby.
// Potřebuje Playwright, jinak se přeskočí. Soubory se servírují s CSP z _headers (inline styl by se zablokoval).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const Core = require('../quiz-core.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];

const serveFile = (pathname) => {
    if (fixtures.files[pathname]) return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtures.files[pathname]) };
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};

const open = async (browser, { level, storage = {} }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const entries = { 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.progress': JSON.stringify({ xp: Core.xpForLevel(level) }), ...storage };
    await context.addInitScript(values => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
    }, entries);
    const tab = await context.newPage();
    const problems = [];
    tab.on('pageerror', error => problems.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) return route.abort();
        return route.fulfill(serveFile(url.pathname));
    });
    await tab.goto(`${ORIGIN}/`);
    await tab.waitForSelector('#btn-settings');
    return { context, tab, problems };
};
const openLook = async (tab) => {
    await tab.click('#btn-settings');
    await tab.click('[data-me-tab="look"]');
    await tab.waitForSelector('[data-robe-pick]');
};
const owlSources = (tab) => tab.evaluate(() => [...document.querySelectorAll('img:not([data-keep])')].map(img => img.getAttribute('src')).filter(src => /^icons\/(logo|topics\/sova-)/.test(src)));

test('barva obleku sovy', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('výběr barvy přepne sovy v celé aplikaci, uloží se a zamčené barvy nejdou vybrat', async () => {
        const { context, tab, problems } = await open(browser, { level: 12 });
        assert.equal(await tab.evaluate(() => document.documentElement.dataset.robe), 'vinova');
        assert.ok((await owlSources(tab)).length > 0, 'na úvodu je sova');
        assert.ok((await owlSources(tab)).every(src => !/-(zelena|modra)\.webp$/.test(src)));

        await openLook(tab);
        const tiles = await tab.$$eval('[data-robe-pick]', nodes => nodes.map(node => ({ id: node.dataset.robePick, locked: node.getAttribute('aria-disabled') === 'true', selected: node.getAttribute('aria-pressed') === 'true' })));
        assert.deepEqual(tiles.map(tile => tile.id), ['vinova', 'zelena', 'modra', 'ruzova', 'fialova', 'cerna', 'zlata']);
        assert.deepEqual(tiles.filter(tile => tile.locked).map(tile => tile.id), ['ruzova', 'fialova', 'cerna', 'zlata'], 'na 12. úrovni jsou zamčené růžová a výš');
        assert.equal(tiles.find(tile => tile.selected).id, 'vinova');
        assert.match(await tab.textContent('[data-robe-pick="ruzova"]'), /Úr\. 20/);

        // Zamčená barva se nevybere
        await tab.click('[data-robe-pick="cerna"]', { force: true });
        assert.equal(await tab.evaluate(() => document.documentElement.dataset.robe), 'vinova');
        assert.equal(await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.look') || '{}').robe || 'vinova'), 'vinova');

        // Odemčená ano: atribut, uložení a všechny obrázky sovy (i v pozadí) mají variantu
        await tab.click('[data-robe-pick="modra"]');
        assert.equal(await tab.evaluate(() => document.documentElement.dataset.robe), 'modra');
        assert.equal(await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.look')).robe), 'modra');
        assert.equal(await tab.getAttribute('[data-robe-pick="modra"]', 'aria-pressed'), 'true');
        const sources = await owlSources(tab);
        assert.ok(sources.length > 0 && sources.every(src => /-modra\.webp$/.test(src)), `sova v modré: ${sources}`);
        // Varianty se skutečně načtou (existují)
        await tab.waitForFunction(() => [...document.querySelectorAll('img')].filter(img => /-modra\.webp$/.test(img.getAttribute('src'))).every(img => img.complete && img.naturalWidth > 0));

        // Nově vykreslená sova (zavření okna, jiná obrazovka) je také modrá
        await tab.click('[data-close]');
        await tab.click('#btn-learn');
        assert.ok((await owlSources(tab)).every(src => /-modra\.webp$/.test(src)));

        // Zpět na vínovou = původní soubory
        await openLook(tab);
        await tab.click('[data-robe-pick="vinova"]');
        assert.equal(await tab.evaluate(() => document.documentElement.dataset.robe), 'vinova');
        assert.ok((await owlSources(tab)).every(src => !/-(zelena|modra)\.webp$/.test(src)));
        await tab.click('[data-robe-pick="zelena"]');

        // Po obnovení stránky zůstane
        await tab.reload();
        await tab.waitForSelector('#btn-settings');
        assert.equal(await tab.evaluate(() => document.documentElement.dataset.robe), 'zelena');
        const after = await owlSources(tab);
        assert.ok(after.length > 0 && after.every(src => /-zelena\.webp$/.test(src)));
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('uložená zamčená barva se ignoruje a při vysoké úrovni jsou odemčené všechny', async () => {
        const locked = await open(browser, { level: 3, storage: { 'mudrlant.look': JSON.stringify({ robe: 'zlata' }) } });
        assert.equal(await locked.tab.evaluate(() => document.documentElement.dataset.robe), 'vinova');
        await locked.context.close();

        const high = await open(browser, { level: 70, storage: { 'mudrlant.look': JSON.stringify({ robe: 'zlata' }) } });
        assert.equal(await high.tab.evaluate(() => document.documentElement.dataset.robe), 'zlata');
        await openLook(high.tab);
        assert.equal(await high.tab.$$eval('[data-robe-pick][aria-disabled="true"]', nodes => nodes.length), 0);
        await high.context.close();
    });
});
