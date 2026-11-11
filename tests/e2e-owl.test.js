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
    // Doplněk se vybírá v otevřeném místě: nejdřív čip místa vedle sovy, pak dlaždice doplňku
    const pickAcc = async (tab, value, options = {}) => { await tab.click(`[data-owl-slot="${value.split(':')[0]}"]`); await tab.click(`[data-owl-pick="${value}"]`, options); };
    const layers = (tab, scope = '#status-icon-slot') => tab.$$eval(`${scope} [data-owl-layer]`, nodes => nodes.map(node => node.getAttribute('src')));

    await t.test('výběr doplňku a barvy se projeví na logu v hlavičce a zůstane po načtení', async () => {
        const { context, tab, problems } = await open();
        assert.deepEqual(await layers(tab), [], 'na začátku bez doplňků');
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        // Čtyři místa kolem sovy; otevřené (hlava) ukazuje své doplňky, dohromady 3 × „bez doplňku“, Monokl a Bez monoklu + 68 doplňků
        assert.deepEqual(await tab.$$eval('[data-owl-slot]', nodes => nodes.map(node => [node.dataset.owlSlot, node.getAttribute('aria-pressed')])), [['head', 'true'], ['face', 'false'], ['neck', 'false'], ['hand', 'false']]);
        let tiles = 0;
        for (const slot of ['head', 'face', 'neck', 'hand']) {
            await tab.click(`[data-owl-slot="${slot}"]`);
            await tab.waitForSelector(`[data-owl-slot="${slot}"][aria-pressed="true"]`);
            assert.equal(await tab.locator(`[data-owl-pick]:not([data-owl-pick^="${slot}:"])`).count(), 0, 'jen doplňky otevřeného místa');
            tiles += await tab.locator('[data-owl-pick]').count();
        }
        assert.equal(tiles, 73, '3 × „bez doplňku“, Monokl a Bez monoklu + 68 doplňků');
        // Zamčený doplněk se nenasadí a ukáže, jak se odemkne
        await pickAcc(tab, 'hand:lupa', { force: true });
        await tab.waitForFunction(() => /Lupa: Úroveň 24/.test(document.querySelector('[data-look="owl"]').textContent));
        assert.equal(await tab.getAttribute('[data-owl-pick="hand:lupa"]', 'aria-pressed'), 'false');
        assert.deepEqual(await layers(tab, '#settings-overlay'), []);
        // Odemčený se nasadí a objeví se na sově v okně i v hlavičce pod ním
        await pickAcc(tab, 'face:bryle');
        await tab.waitForSelector('[data-owl-pick="face:bryle"][aria-pressed="true"]');
        await pickAcc(tab, 'neck:sala');
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
        await pickAcc(tab, 'face:slunecni-bryle');
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
        await pickAcc(tab, 'neck:none');
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
        await pickAcc(tab, 'hand:lupa');
        await tab.waitForSelector('[data-owl-pick="hand:lupa"][aria-pressed="true"]');
        await pickAcc(tab, 'neck:motylek');
        await tab.waitForSelector('[data-owl-pick="neck:motylek"][aria-pressed="true"]');
        await pickAcc(tab, 'head:kvetina');
        await tab.waitForSelector('[data-owl-pick="head:kvetina"][aria-pressed="true"]');
        await pickAcc(tab, 'face:bryle');
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
        await pickAcc(tab, 'head:koruna');
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
            await tab.click(`[data-owl-slot="${pick.split(':')[0]}"]`);
            assert.equal(await tab.getAttribute(`[data-owl-pick="${pick}"]`, 'aria-disabled'), null, `${pick} je odemčený`);
            await pickAcc(tab, pick);
        }
        await tab.waitForFunction(() => document.querySelectorAll('#status-icon-slot [data-owl-layer]').length === 3);
        const sources = await layers(tab);
        // Pořadí vrstev: obličej, hlava, ruka; ruka vždy navrch
        assert.deepEqual(sources.map(src => src.replace('icons/doplnky/', '').replace('.webp', '')), ['lab-bryle', 'prilba', 'sitka']);
        // Přilba nahrazuje čepici: výchozí čepice se z loga maskou skryje a s jiným doplňkem na hlavě je zase vidět
        assert.equal(await tab.evaluate(() => document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat')), true);
        assert.match(await tab.evaluate(() => getComputedStyle(document.querySelector('#status-icon-slot [data-owl] > img')).maskImage || getComputedStyle(document.querySelector('#status-icon-slot [data-owl] > img')).webkitMaskImage), /logo-maska\.webp/);
        await pickAcc(tab, 'head:none');
        await tab.waitForFunction(() => !document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat'));
        await pickAcc(tab, 'head:prilba');
        await tab.waitForFunction(() => document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat'));
        // Zamčený doplněk se klepnutím nevybere
        await pickAcc(tab, 'head:helma', { force: true });
        assert.equal((await layers(tab)).length, 3);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('monokl: doplněk v obličeji a „Bez monoklu“ ho sundají, knír ho nechá; logo bez monoklu i v barvě obleku', async () => {
        const badges = { 'zbehly-fyzika': '2026-11-01', 'turnaj-postupy-15': '2026-11-01' };
        const { context, tab, problems } = await open(JSON.stringify({ xp: 238000, counters: {}, badges }));
        const logo = (scope = '#status-icon-slot') => tab.$eval(`${scope} [data-owl] > img`, img => img.getAttribute('src'));
        const logoIs = (src) => tab.waitForFunction(wanted => ['#status-icon-slot', '[data-owl-slots]'].every(scope => {
            const img = document.querySelector(`${scope} [data-owl] > img`);
            return !img || img.getAttribute('src') === wanted;
        }), src);
        assert.equal(await logo(), 'icons/logo.webp', 'výchozí sova má monokl');
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        await tab.click('[data-owl-slot="face"]');
        await tab.waitForSelector('[data-owl-pick="face:none"][aria-pressed="true"][title="Monokl"]');
        assert.equal(await tab.getAttribute('[data-owl-pick="face:bez-monoklu"]', 'aria-pressed'), 'false');
        assert.equal(await tab.getAttribute('[data-owl-slot="face"]', 'aria-label'), 'Obličej: monokl');
        // Letecké brýle (úroveň 68) monokl nahradí: v hlavičce i v náhledu v okně je sova bez monoklu
        await pickAcc(tab, 'face:letecke-bryle');
        await tab.waitForSelector('[data-owl-pick="face:letecke-bryle"][aria-pressed="true"]');
        await logoIs('icons/logo-bez-monoklu.webp');
        assert.equal(await logo('[data-owl-slots]'), 'icons/logo-bez-monoklu.webp');
        assert.deepEqual(await layers(tab), ['icons/doplnky/letecke-bryle.webp']);
        // „Bez monoklu“: žádná vrstva, sova bez monoklu, bez výběru barvy
        await pickAcc(tab, 'face:bez-monoklu');
        await tab.waitForSelector('[data-owl-pick="face:bez-monoklu"][aria-pressed="true"]');
        assert.deepEqual(await layers(tab), []);
        await logoIs('icons/logo-bez-monoklu.webp');
        assert.equal(await tab.getAttribute('[data-owl-slot="face"]', 'aria-label'), 'Obličej: bez monoklu');
        assert.equal(await tab.locator('[data-owl-color]').count(), 0, '„Bez monoklu“ nemá barvu');
        // Knír oči nezakrývá: monokl se vrátí
        await pickAcc(tab, 'face:knir');
        await tab.waitForSelector('[data-owl-pick="face:knir"][aria-pressed="true"]');
        await logoIs('icons/logo.webp');
        assert.deepEqual(await layers(tab), ['icons/doplnky/knir.webp']);
        // Barva obleku: sova bez monoklu v zeleném taláru, s monoklem zase zelená
        await pickAcc(tab, 'face:bez-monoklu');
        await tab.click('[data-robe-pick="zelena"]');
        await logoIs('icons/logo-bez-monoklu-zelena.webp');
        await pickAcc(tab, 'face:none');
        await logoIs('icons/logo-zelena.webp');
        assert.deepEqual(await layers(tab), []);
        // Volba přežije načtení a obrázek se opravdu načte
        await pickAcc(tab, 'face:bez-monoklu');
        await logoIs('icons/logo-bez-monoklu-zelena.webp');
        await tab.click('[data-close]');
        await tab.waitForSelector('#settings-overlay', { state: 'detached' });
        await tab.reload();
        await tab.waitForSelector('#status-icon-slot [data-owl]');
        await logoIs('icons/logo-bez-monoklu-zelena.webp');
        await tab.waitForFunction(() => { const img = document.querySelector('#status-icon-slot [data-owl] > img'); return img.complete && img.naturalWidth > 0; });
        // Cylindr (úroveň 62) a meč (odznak 15 vyhraných zápasů v turnajích): skryje se čepice i zvednutá ruka jednou maskou
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        await pickAcc(tab, 'head:cylindr');
        await pickAcc(tab, 'hand:mec');
        await tab.waitForSelector('[data-owl-pick="hand:mec"][aria-pressed="true"]');
        const mask = () => tab.evaluate(() => { const img = document.querySelector('#status-icon-slot [data-owl] > img'); const style = getComputedStyle(img); return `${img.parentElement.className} ${style.maskImage || style.webkitMaskImage}`; });
        assert.match(await mask(), /owl-nohat owl-nohand .*logo-maska-oba\.webp/);
        await pickAcc(tab, 'head:none');
        await tab.waitForFunction(() => !document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat'));
        assert.match(await mask(), /logo-maska-ruka\.webp/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('všechny obrázky doplňků se načtou (žádný rozbitý odkaz)', async () => {
        const { context, tab } = await open();
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        const broken = [];
        for (const slot of ['head', 'face', 'neck', 'hand']) {
            await tab.click(`[data-owl-slot="${slot}"]`);
            await tab.waitForSelector(`[data-owl-items="${slot}"]`);
            await tab.waitForFunction(() => [...document.querySelectorAll('[data-owl-pick] img, [data-owl-slot] img')].every(img => img.complete));
            broken.push(...await tab.$$eval('[data-owl-pick] img, [data-owl-slot] img', images => images.filter(img => img.naturalWidth === 0).map(img => img.getAttribute('src'))));
        }
        assert.deepEqual(broken, []);
        await context.close();
    });

    await t.test('sezónní doplňky: ve výběru jen ze Sezónní truhly, nová čepice a ruka skryjí výchozí, pevné barvy, všechny vrstvy se načtou', async () => {
        const SEASON = ['cepice-zimni', 'karneval', 'jarni-venecek', 'destnik', 'konvalinky', 'slamak', 'snorchl', 'zmrzlina', 'tuzka', 'dyne', 'lampion', 'sala-zimni'];
        const owned = ['slamak', 'dyne', 'zmrzlina', 'snorchl'];
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript(entries => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { 'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': 'choices', 'mudrlant.progress': PROGRESS, 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.rewards': JSON.stringify({ v: 1, gifts: { accessories: owned } }) });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#btn-settings');
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="owl"]');
        await tab.waitForSelector('[data-owl-pick]');
        // Ve výběru jsou jen vlastněné sezónní doplňky (ostatní se nedají získat jinak než v sezóně svého měsíce, zamčené by jen překážely)
        const offered = [];
        for (const slot of ['head', 'face', 'neck', 'hand']) {
            await tab.click(`[data-owl-slot="${slot}"]`);
            await tab.waitForSelector(`[data-owl-items="${slot}"]`);
            offered.push(...await tab.$$eval('[data-owl-pick]', (nodes, ids) => nodes.map(node => node.dataset.owlPick.split(':')[1]).filter(id => ids.includes(id)), SEASON));
        }
        assert.deepEqual(offered.sort(), [...owned].sort());
        // Slaměný klobouk nahradí čepici, zmrzlina ruku: logo v hlavičce dostane obě masky
        await pickAcc(tab, 'head:slamak');
        await pickAcc(tab, 'hand:zmrzlina');
        await tab.waitForSelector('[data-owl-pick="hand:zmrzlina"][aria-pressed="true"]');
        await tab.waitForSelector('#status-icon-slot [data-owl].owl-nohat.owl-nohand');
        assert.deepEqual(await layers(tab), ['icons/doplnky/slamak.webp', 'icons/doplnky/zmrzlina.webp']);
        // Barva zmrzliny (příchuť) se změní; šnorchl v obličeji monokl nahradí
        await tab.click('[data-owl-color="hand:zelena"]');
        await tab.waitForSelector('#status-icon-slot [data-owl-layer][src="icons/doplnky/zmrzlina-zelena.webp"]');
        await pickAcc(tab, 'face:snorchl');
        await tab.waitForSelector('#status-icon-slot [data-owl] > img[src="icons/logo-bez-monoklu.webp"]');
        // Dýně sedí na čepici (čepice zůstane vidět) a má pevné barvy: místo palety věta
        await pickAcc(tab, 'head:dyne');
        await tab.waitForSelector('[data-owl-pick="head:dyne"][aria-pressed="true"]');
        await tab.waitForFunction(() => !document.querySelector('#status-icon-slot [data-owl]').classList.contains('owl-nohat'));
        assert.match(await tab.textContent('[data-owl-fixed]'), /Dýně má pevné barvy/);
        assert.equal(await tab.locator('[data-owl-color]').count(), 0);
        assert.deepEqual(await layers(tab), ['icons/doplnky/snorchl.webp', 'icons/doplnky/dyne.webp', 'icons/doplnky/zmrzlina-zelena.webp']);
        // Všechny vrstvy, barvy a ikony sezónních doplňků existují a dají se načíst (rám vrstvy 402 px)
        const sizes = await tab.evaluate(async (ids) => {
            const Look = window.MudrlantLook;
            const urls = ids.flatMap(id => {
                const item = Look.find('accessories', id);
                const colors = item.noColors ? [] : Look.ACC_COLORS.filter(color => color.id !== 'original' && color.id !== 'vlastni').map(color => `icons/doplnky/${id}-${color.id}.webp`);
                return [`icons/doplnky/${id}.webp`, `icons/doplnky/${id}-ikona.webp`, ...colors];
            });
            const load = (src) => new Promise(resolve => { const img = new Image(); img.onload = () => resolve([src, img.naturalWidth]); img.onerror = () => resolve([src, 0]); img.src = src; });
            return Promise.all(urls.map(load));
        }, SEASON);
        assert.equal(sizes.length, 12 * 2 + 9 * 8, 'vrstva a ikona u všech, barvy u devíti (věneček, konvalinky a dýně mají pevné barvy)');
        assert.deepEqual(sizes.filter(([src, width]) => (src.endsWith('-ikona.webp') ? width !== 96 : width !== 402)), []);
        assert.deepEqual(problems, []);
        await context.close();
    });
});
