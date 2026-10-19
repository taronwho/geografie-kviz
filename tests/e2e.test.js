// Test celé aplikace v prohlížeči s podvrženými odpověďmi Wikipedie a Wikidat.
// Potřebuje Playwright (npm i -D playwright && npx playwright install chromium), jinak se přeskočí.
// Soubory se servírují s CSP z _headers, takže test odhalí i porušení Content-Security-Policy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Soubor z repozitáře se stejnými hlavičkami jako na Netlify (CSP u HTML)
const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};

// Skutečný server na localhostu – service worker se přes podvržené odpovědi Playwrightu registrovat nedá
const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const { status, headers, body } = serveFile(new URL(request.url, 'http://localhost').pathname);
        response.writeHead(status, headers);
        response.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

const page = (pageid, title, extract, lat, lon, extra = {}) => ({ pageid, title, extract, coordinates: [{ lat, lon }], pageprops: { wikibase_item: `Q${pageid}` }, ...extra });
const TARGET = page(4242, 'Testovací hora (Alpy)',
    'Testovací hora je hora v pohoří Alpy ve Švýcarsku, vysoká přibližně tři tisíce metrů nad mořem. <img src=x onerror=__xss=1> ' +
    'Na vrcholu stojí horská chata, kterou navštěvují turisté z celého světa. Hora je známá svými ledovci a krásnými výhledy do okolních údolí. ' +
    'Ve 20. století zde vznikla lanovka vedoucí až na vrchol hory.', 46.5, 8.0, { thumbnail: { source: 'https://upload.wikimedia.org/broken.jpg' } });
const OTHERS = [
    page(5001, 'Vedlejší vrch', 'Vedlejší vrch je hora v pohoří Jura, která má nadmořskou výšku přes tisíc metrů a je oblíbená mezi turisty z okolí i ze zahraničí.', 47.0, 7.0),
    page(5002, 'Malé jezero', 'Malé jezero je jezero v podhůří, které je napájeno několika potoky a slouží jako rekreační oblast pro obyvatele okolních měst a vesnic.', 46.0, 7.5)
];

const setup = async (browser, options = {}) => {
    const origin = options.origin || ORIGIN;
    const context = await browser.newContext({ serviceWorkers: options.serviceWorkers || 'block', colorScheme: options.colorScheme || 'light' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    // Uložená varianta hry (null = první spuštění s výběrem varianty)
    if (options.variant !== null) await context.addInitScript(variant => localStorage.setItem('geoQuizVariant', variant), options.variant || 'choices');
    const tab = await context.newPage();
    const log = { wiki: [], wikidata: [], tiles: 0, errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });

    await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) return route.fulfill(serveFile(url.pathname));
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'cs.wikipedia.org') {
            log.wiki.push(url.href);
            if (options.wikiDown) return route.fulfill({ status: 503, body: '' });
            if (options.wikiHangs) return; // odpověď nikdy nepřijde
            if (url.searchParams.get('prop') === 'langlinks') {
                const pages = {};
                url.searchParams.get('pageids').split('|').forEach(id => {
                    pages[id] = { pageid: Number(id), langlinks: Array.from({ length: 12 }, (_, i) => ({ lang: `l${i}` })) };
                });
                return route.fulfill({ json: { query: { pages } } });
            }
            const pages = {};
            [TARGET, ...OTHERS].forEach(p => { pages[p.pageid] = JSON.parse(JSON.stringify(p)); });
            return route.fulfill({ json: { query: { pages } } });
        }
        if (url.hostname === 'www.wikidata.org') {
            log.wikidata.push(url.href);
            if (options.wikidataDown) return route.fulfill({ status: 500, body: '' });
            if (url.searchParams.get('action') === 'wbgetclaims') {
                const property = url.searchParams.get('property');
                const claim = (id, extra = {}) => ({ mainsnak: { datavalue: { value: { id } } }, rank: 'normal', ...extra });
                let claims = {};
                // countryItself: hádané místo je samo státem (jako Řecko) – P17 ukazuje samo na sebe
                if (property === 'P17' && options.countryItself) claims = { P17: [claim('Q4242')] };
                else if (property === 'P17') claims = { P17: [claim('Q39', { rank: 'preferred' }), claim('Q131964', { qualifiers: { P582: [{}] } })] };
                else if (property === 'P30' && options.countryItself) claims = { P30: [claim('Q46')] };
                return route.fulfill({ json: { claims } });
            }
            const labels = { Q39: 'Švýcarsko', Q4242: 'Testovací hora', Q46: 'Evropa' };
            const entities = {};
            url.searchParams.get('ids').split('|').forEach(id => { if (labels[id]) entities[id] = { labels: { cs: { value: labels[id] } } }; });
            return route.fulfill({ json: { entities } });
        }
        if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ status: 404, body: '' });
        if (url.hostname === 'images.unsplash.com') return route.fulfill({ contentType: 'image/png', body: PNG });
        if (url.hostname === 'tile.openstreetmap.org') { log.tiles++; return route.fulfill({ contentType: 'image/png', body: PNG }); }
        return route.abort();
    });

    const now = new Date('2026-10-16T10:00:00');
    if (options.fakeTimers) await tab.clock.install({ time: now });
    else await tab.clock.setFixedTime(now);
    return { context, tab, log };
};

const correctChoiceLabel = async (tab) => (await tab.textContent('h2')).includes('Jak se jmenuje') ? 'Testovací hora' : 'Švýcarsko';
const waitForQuestion = (tab) => tab.waitForSelector('text=Tvoje odpověď', { timeout: 30000 });
const waitForResult = (tab) => tab.waitForSelector('h1', { timeout: 30000 });

test('aplikace v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('dnešní místo: nápovědy, odpověď, série a sdílení', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);

        assert.match(log.wiki[0], /generator=allpages/);
        assert.equal(await tab.textContent('#status-text'), 'Dnešní místo · 16. 10.');
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4);
        assert.equal(await tab.locator('#answer-input').count(), 0, 've variantě s možnostmi není pole pro psaní');
        assert.equal(await tab.locator('#app-content img').count(), 0, 'rozmazaná fotka nesmí být <img>');
        await tab.waitForFunction(() => document.getElementById('hint-photo').style.backgroundImage.includes('unsplash'));
        assert.match(await tab.getAttribute('#hint-photo', 'class'), /photo-blur-1/);
        assert.equal(await tab.locator('p.italic').count(), 0, 'na první úrovni ještě není text');

        // Fotka není zakrytá textem a lišta nahoře nepřekrývá obsah
        const header = await tab.locator('header').boundingBox();
        const photo = await tab.locator('#hint-photo').boundingBox();
        const content = await tab.locator('#app-content').boundingBox();
        assert.ok(header.y + header.height <= content.y + 1, 'obsah začíná pod lištou');
        assert.ok(photo.y >= content.y, 'fotka je v obsahu pod lištou');
        assert.equal(await tab.locator('#hint-photo ~ h2, #hint-photo ~ div h2').count(), 0, 'přes fotku není nadpis');

        await tab.click('[data-action="hint"]');
        assert.match(await tab.locator('section', { hasText: 'Nápovědy' }).textContent(), /2\/3/);
        assert.match(await tab.getAttribute('#hint-photo', 'class'), /photo-blur-2/);
        const hint = await tab.textContent('p.italic');
        assert.match(hint, /<img src=x onerror=__xss=1>/, 'HTML z Wikipedie se zobrazí jako text');

        await tab.click(`[data-action="choice"]:has-text("${await correctChoiceLabel(tab)}")`);
        await waitForResult(tab);
        assert.match(await tab.textContent('#app-content'), /Správně! \+2 body/);
        assert.equal(await tab.textContent('h1'), 'Testovací hora (Alpy)');
        assert.match(await tab.textContent('#app-content'), /Švýcarsko/);
        assert.doesNotMatch(await tab.textContent('#app-content'), /Q131964/);
        await tab.waitForFunction(() => document.querySelectorAll('#map-tiles img').length > 0);
        assert.ok(log.tiles > 0, 'mapa načetla dlaždice');

        await tab.click('[data-action="share"]');
        await tab.waitForSelector('#toast:not(.opacity-0)');
        const shared = await tab.evaluate(() => navigator.clipboard.readText());
        assert.match(shared, /^Geo Kvíz · 16\. 10\. 2026\n🏔️ Hora \/ Pohoří\n✅ 2 body · nápovědy 2\/3\n🔥 Série: 1\nhttps:\/\/geo\.test\/$/);

        // Po návratu z tréninku zůstane dnešní místo odhalené
        await tab.click('#btn-random');
        await waitForQuestion(tab);
        assert.ok(log.wiki.some(url => url.includes('generator=random')));
        assert.match(await tab.textContent('#status-text'), /Trénink · 0 bodů/);
        const requestsBefore = log.wiki.length;
        await tab.click('#btn-daily');
        await waitForResult(tab);
        assert.equal(log.wiki.length, requestsBefore, 'dnešní místo z mezipaměti');
        assert.match(await tab.textContent('#app-content'), /Správně!/);

        // Po obnovení stránky totéž
        await tab.reload();
        await waitForResult(tab);
        assert.equal(log.wiki.length, requestsBefore);

        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'všechny ikony vykreslené');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('trénink ve variantě psaní: dvojnásobek bodů a další místo', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed' });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        await tab.click('#btn-random');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('[data-action="choice"]').count(), 0, 've variantě psaní nejsou možnosti');
        assert.match(await tab.textContent('#app-content'), /Teď za ni získáš 6 bodů/);

        const typed = (await correctChoiceLabel(tab)) === 'Švýcarsko' ? 'svycarsko' : 'testovaci hora';
        await tab.fill('#answer-input', typed);
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await tab.textContent('#app-content'), /Správně! \+6 bodů/);
        assert.match(await tab.textContent('#app-content'), /Napsaná odpověď/);
        assert.match(await tab.textContent('#status-text'), /Trénink · 6 bodů/);

        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        assert.match(await tab.textContent('#app-content'), /Tentokrát bez odpovědi/);
        assert.match(await tab.textContent('#app-content'), /správně 1 z 2/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('první spuštění: výběr varianty hry před první otázkou', async () => {
        const { context, tab, log } = await setup(browser, { variant: null });
        await tab.goto(`${ORIGIN}/`);
        await tab.waitForSelector('text=Jak chceš hrát?');
        assert.equal(log.wiki.length, 0, 'bez varianty se nic nenačítá');
        await tab.click('#variant-welcome [data-variant="typed"]');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('#answer-input').count(), 1);
        assert.equal(await tab.evaluate(() => localStorage.getItem('geoQuizVariant')), 'typed');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('nastavení: psaní až od další otázky, možnosti hned', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);

        await tab.click('#btn-settings');
        await tab.click('#settings-overlay [data-variant="typed"]');
        assert.match(await tab.textContent('#settings-note'), /od další otázky/);
        await tab.click('#settings-overlay [data-close]');
        assert.equal(await tab.locator('#settings-overlay').count(), 0);
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4, 'u rozehrané otázky zůstanou možnosti');

        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('#answer-input').count(), 1, 'další otázka už je na psaní');

        // Zpět na možnosti jde hned (je to snazší)
        await tab.click('[data-action="settings"]');
        await tab.click('#settings-overlay [data-variant="choices"]');
        assert.match(await tab.textContent('#settings-note'), /hned/);
        await tab.keyboard.press('Escape');
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('stát jako hádané místo: ptá se na název, poloha je kontinent', async () => {
        const { context, tab, log } = await setup(browser, { countryItself: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        assert.match(await tab.textContent('h2'), /Jak se jmenuje/, 'na stát u státu se neptá');
        const labels = await tab.locator('[data-action="choice"]').allTextContents();
        assert.ok(labels.some(label => label.trim() === 'Testovací hora'));
        await tab.click('[data-action="hint"]');
        assert.match(await tab.textContent('#app-content'), /Poloha: Evropa/);
        assert.doesNotMatch(await tab.textContent('#app-content'), /Poloha: Testovací/);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('bez státu z Wikidat se ptá jen na název', async () => {
        const { context, tab } = await setup(browser, { wikidataDown: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        assert.match(await tab.textContent('h2'), /Jak se jmenuje/);
        await tab.click('[data-action="hint"]');
        assert.doesNotMatch(await tab.textContent('#app-content'), /Poloha:/);
        await context.close();
    });

    await t.test('výpadek Wikipedie: chyba spojení a opakování v dnešním režimu', async () => {
        const { context, tab, log } = await setup(browser, { wikiDown: true });
        await tab.goto(`${ORIGIN}/`);
        await tab.waitForSelector('text=Chyba spojení', { timeout: 30000 });
        assert.equal(log.wiki.length, 3);
        await tab.click('[data-action="retry"]');
        await tab.waitForSelector('text=Chyba spojení', { timeout: 30000 });
        assert.ok(log.wiki.slice(3).every(url => url.includes('generator=allpages')));
        await context.close();
    });

    await t.test('zaseknutý dotaz skončí chybou spojení, ne nekonečným načítáním', async () => {
        const { context, tab, log } = await setup(browser, { wikiHangs: true, fakeTimers: true });
        // Falešné hodiny zastaví i requestAnimationFrame, proto žádné waitFor…, jen posouvání času
        await tab.goto(`${ORIGIN}/`);
        assert.ok(await tab.isVisible('text=Prozkoumávám atlas světa'));
        for (let i = 0; i < 10 && !(await tab.isVisible('text=Chyba spojení')); i++) {
            await tab.clock.runFor(15000);
            await tab.waitForTimeout(100);
        }
        assert.ok(await tab.isVisible('text=Chyba spojení'));
        assert.equal(log.wiki.length, 3, 'tři pokusy, každý po vypršení limitu');
        await context.close();
    });

    await t.test('bez internetu se aplikace otevře z mezipaměti', async () => {
        const server = await startServer();
        const origin = `http://127.0.0.1:${server.address().port}`;
        const { context, tab, log } = await setup(browser, { origin, serviceWorkers: 'allow' });
        await tab.goto(`${origin}/`);
        await waitForQuestion(tab);
        await tab.evaluate(() => navigator.serviceWorker.ready);

        // Vypnout síť i server – stránka se musí načíst jen z mezipaměti service workeru
        await context.setOffline(true);
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await tab.reload();
        await waitForQuestion(tab);
        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'ikony z mezipaměti');
        assert.equal(await tab.evaluate(() => getComputedStyle(document.getElementById('app-content')).display), 'flex', 'styly z mezipaměti');
        assert.equal(await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('tmavý režim', async () => {
        const { context, tab, log } = await setup(browser, { colorScheme: 'dark' });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        const background = await tab.evaluate(() => getComputedStyle(document.getElementById('app-content')).backgroundColor);
        assert.equal(background, 'rgb(15, 23, 42)');
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
