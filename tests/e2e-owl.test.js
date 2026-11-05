// Nastavení → Sova: výběr doplňků a jejich barvy, zamčené doplňky, vrstvy na logu v hlavičce, pamatování a CSP.
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
// 11 000 xp = úroveň 18: brýle (4), motýlek (9), šála (14) a sluneční brýle (18) jsou odemčené, lupa (24) a koruna (42) ne
const PROGRESS = JSON.stringify({ xp: 11000, counters: {}, badges: {} });

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

test('doplňky sovy v Nastavení', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async (progress = PROGRESS) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript(entries => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { 'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': 'choices', 'mudrlant.progress': progress, 'mudrlant.tutorial': JSON.stringify({ how: 'done' }) });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#btn-settings');
        return { context, tab, problems };
    };
    const layers = (tab, scope = '#status-icon-slot') => tab.$$eval(`${scope} [data-owl-layer]`, nodes => nodes.map(node => node.getAttribute('src')));

    await t.test('výběr doplňku a barvy se projeví na logu v hlavičce a zůstane po načtení', async () => {
        const { context, tab, problems } = await open();
        assert.deepEqual(await layers(tab), [], 'na začátku bez doplňků');
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        assert.equal(await tab.locator('[data-owl-pick]').count(), 28, '4 × „bez doplňku“ + 24 doplňků');
        // Zamčený doplněk se nenasadí a ukáže, jak se odemkne
        await tab.click('[data-owl-pick="hand:lupa"]', { force: true });
        await tab.waitForFunction(() => /Lupa: Úroveň 24/.test(document.querySelector('[data-look="owl"]').textContent));
        assert.equal(await tab.getAttribute('[data-owl-pick="hand:lupa"]', 'aria-pressed'), 'false');
        assert.deepEqual(await layers(tab, '#settings-overlay'), []);
        // Odemčený se nasadí a objeví se na sově v okně i v hlavičce pod ním
        await tab.click('[data-owl-pick="face:bryle"]');
        await tab.waitForSelector('[data-owl-pick="face:bryle"][aria-pressed="true"]');
        await tab.click('[data-owl-pick="neck:sala"]');
        await tab.waitForSelector('[data-owl-pick="neck:sala"][aria-pressed="true"]');
        assert.deepEqual(await layers(tab), ['icons/doplnky/sala.webp', 'icons/doplnky/bryle.webp']);
        // Barva patří naposledy vybranému doplňku
        await tab.click('[data-owl-color="neck:modra"]');
        await tab.waitForSelector('[data-owl-color="neck:modra"][aria-pressed="true"]');
        assert.deepEqual(await layers(tab), ['icons/doplnky/sala-modra.webp', 'icons/doplnky/bryle.webp']);
        // Barvy se odemykají úrovní (zelená od úr. 8 je odemčená, růžová od úr. 38 a paleta od úr. 80 ne)
        await tab.click('[data-owl-color="neck:ruzova"]', { force: true });
        await tab.waitForFunction(() => /Růžová: Úroveň 38/.test(document.querySelector('[data-look="owl"]').textContent));
        await tab.click('[data-owl-color="neck:vlastni"]', { force: true });
        await tab.waitForFunction(() => /Vlastní barva \(paleta\): Úroveň 80/.test(document.querySelector('[data-look="owl"]').textContent));
        assert.deepEqual(await layers(tab), ['icons/doplnky/sala-modra.webp', 'icons/doplnky/bryle.webp'], 'zamčená barva se nenasadí');
        // V jednom místě je nejvýš jeden doplněk: sluneční brýle nahradí kulaté
        await tab.click('[data-owl-pick="face:slunecni-bryle"]');
        await tab.waitForSelector('[data-owl-pick="face:slunecni-bryle"][aria-pressed="true"]');
        assert.equal(await tab.getAttribute('[data-owl-pick="face:bryle"]', 'aria-pressed'), 'false');
        // Okno se vejde bez posouvání
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        await tab.click('[data-close]');
        await tab.waitForSelector('#settings-overlay', { state: 'detached' });
        assert.deepEqual(await layers(tab), ['icons/doplnky/sala-modra.webp', 'icons/doplnky/slunecni-bryle.webp']);
        await tab.reload();
        await tab.waitForSelector('#status-icon-slot [data-owl-layer]');
        assert.deepEqual(await layers(tab), ['icons/doplnky/sala-modra.webp', 'icons/doplnky/slunecni-bryle.webp'], 'volba přežije načtení');
        // „Bez doplňku“ ho sundá
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.click('[data-owl-pick="neck:none"]');
        await tab.waitForSelector('[data-owl-pick="neck:none"][aria-pressed="true"]');
        assert.deepEqual(await layers(tab), ['icons/doplnky/slunecni-bryle.webp']);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('doplňky jdou přidávat v libovolném pořadí: nejdřív spodní místo, pak horní', async () => {
        const { context, tab, problems } = await open(JSON.stringify({ xp: 82000, counters: {}, badges: {} }));
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        await tab.click('[data-owl-pick="hand:lupa"]');
        await tab.waitForSelector('[data-owl-pick="hand:lupa"][aria-pressed="true"]');
        await tab.click('[data-owl-pick="neck:motylek"]');
        await tab.waitForSelector('[data-owl-pick="neck:motylek"][aria-pressed="true"]');
        await tab.click('[data-owl-pick="head:kvetina"]');
        await tab.waitForSelector('[data-owl-pick="head:kvetina"][aria-pressed="true"]');
        await tab.click('[data-owl-pick="face:bryle"]');
        await tab.waitForSelector('[data-owl-pick="face:bryle"][aria-pressed="true"]');
        assert.deepEqual(await layers(tab), ['icons/doplnky/motylek.webp', 'icons/doplnky/bryle.webp', 'icons/doplnky/kvetina.webp', 'icons/doplnky/lupa.webp']);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('nejlepší odměna: vlastní barva z palety přebarví doplněk z původního obrázku', async () => {
        const { context, tab, problems } = await open(JSON.stringify({ xp: 238000, counters: {}, badges: {} }));
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        await tab.click('[data-owl-pick="head:koruna"]');
        await tab.waitForSelector('[data-owl-pick="head:koruna"][aria-pressed="true"]');
        assert.equal(await tab.locator('[data-owl-hue]').count(), 0, 'posuvník je jen u vlastní barvy');
        await tab.click('[data-owl-color="head:vlastni"]');
        await tab.waitForSelector('[data-owl-hue]');
        // Posuvník odstínu: koruna je zlatá (odstín 40), zvolený odstín 120 = otočení o 80°
        await tab.$eval('[data-owl-hue]', range => { range.value = '120'; range.dispatchEvent(new Event('change', { bubbles: true })); });
        await tab.waitForFunction(() => document.querySelector('#status-icon-slot [data-owl-layer]'));
        const layer = await tab.$eval('#status-icon-slot [data-owl-layer]', node => [node.getAttribute('src'), node.className]);
        assert.equal(layer[0], 'icons/doplnky/koruna.webp');
        assert.match(layer[1], /hue-rotate-\[80deg\]/);
        assert.equal(await tab.inputValue('[data-owl-hue]'), '120', 'posuvník drží zvolený odstín');
        assert.equal(await tab.evaluate(() => getComputedStyle(document.querySelector('#status-icon-slot [data-owl-layer]')).filter.includes('hue-rotate')), true, 'filtr se skutečně použije');
        // Po načtení zůstane
        await tab.reload();
        await tab.waitForSelector('#status-icon-slot [data-owl-layer]');
        assert.match(await tab.$eval('#status-icon-slot [data-owl-layer]', node => node.className), /hue-rotate-\[80deg\]/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('doplňky za zběhlost v tématech: zamčené bez odznaku, s odznaky jdou zkombinovat (přilba + laboratorní brýle + síťka)', async () => {
        const badges = Object.fromEntries(['biologie', 'geologie', 'chemie'].map(topic => [`zbehly-${topic}`, '2026-11-01']));
        const { context, tab, problems } = await open(JSON.stringify({ xp: 11000, counters: {}, badges }));
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        // Bez odznaku (Mytologie) je helma zamčená a říká, co pro ni udělat
        assert.equal(await tab.getAttribute('[data-owl-pick="head:helma"]', 'aria-disabled'), 'true');
        assert.match(await tab.getAttribute('[data-owl-pick="head:helma"]', 'title'), /Odznak: Posel bohů/);
        for (const pick of ['head:prilba', 'face:lab-bryle', 'hand:sitka']) {
            assert.equal(await tab.getAttribute(`[data-owl-pick="${pick}"]`, 'aria-disabled'), null, `${pick} je odemčený`);
            await tab.click(`[data-owl-pick="${pick}"]`);
        }
        await tab.waitForFunction(() => document.querySelectorAll('#status-icon-slot [data-owl-layer]').length === 3);
        const sources = await layers(tab);
        // Pořadí vrstev: obličej, hlava, ruka; ruka vždy navrch
        assert.deepEqual(sources.map(src => src.replace('icons/doplnky/', '').replace('.webp', '')), ['lab-bryle', 'prilba', 'sitka']);
        // Přilba nahrazuje čepici: výchozí čepice se z loga maskou skryje a s jiným doplňkem na hlavě je zase vidět
        assert.equal(await tab.evaluate(() => document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat')), true);
        assert.match(await tab.evaluate(() => getComputedStyle(document.querySelector('#status-icon-slot [data-owl] > img')).maskImage || getComputedStyle(document.querySelector('#status-icon-slot [data-owl] > img')).webkitMaskImage), /logo-maska\.webp/);
        await tab.click('[data-owl-pick="head:none"]');
        await tab.waitForFunction(() => !document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat'));
        await tab.click('[data-owl-pick="head:prilba"]');
        await tab.waitForFunction(() => document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat'));
        // Zamčený doplněk se klepnutím nevybere
        await tab.click('[data-owl-pick="head:helma"]', { force: true });
        assert.equal((await layers(tab)).length, 3);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('všechny obrázky doplňků se načtou (žádný rozbitý odkaz)', async () => {
        const { context, tab } = await open();
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        await tab.waitForFunction(() => [...document.querySelectorAll('[data-owl-pick] img')].every(img => img.complete));
        const broken = await tab.$$eval('[data-owl-pick] img', images => images.filter(img => img.naturalWidth === 0).map(img => img.getAttribute('src')));
        assert.deepEqual(broken, []);
        await context.close();
    });
});
