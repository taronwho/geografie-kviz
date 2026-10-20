// Test celé aplikace v prohlížeči s malými testovacími daty (tests/fixtures.js) a podvrženou Wikipedií.
// Potřebuje Playwright (npm i -D playwright && npx playwright install chromium), jinak se přeskočí.
// Soubory se servírují s CSP z _headers, takže test odhalí i porušení Content-Security-Policy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Soubor z repozitáře se stejnými hlavičkami jako na Netlify (CSP u HTML), místo skutečných dat testovací
const serveFile = (pathname) => {
    if (fixtures.files[pathname]) return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtures.files[pathname]) };
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

// options: variant (null = první spuštění), settings, storage (další uložená data), fixedRandom (Math.random vrací 0.1 →
// první položka a u zeměpisu otázka na stát, u historie na století, kde jde; číslo = vrací to číslo), wikiDown, wikiHangs, dataDown, fakeTimers, colorScheme, origin + serviceWorkers
const setup = async (browser, options = {}) => {
    const origin = options.origin || ORIGIN;
    const flags = { ...options };
    const context = await browser.newContext({ serviceWorkers: options.serviceWorkers || 'block', colorScheme: options.colorScheme || 'light' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const storage = { ...(options.storage || {}) };
    if (options.variant !== null) storage['mudrlant.variant'] = options.variant || 'choices';
    if (options.settings) storage['mudrlant.settings'] = JSON.stringify(options.settings);
    // Uložená data jen při prvním načtení, ať test vidí, co s nimi aplikace udělá
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, storage);
    if (options.fixedRandom) await context.addInitScript(value => { Math.random = () => value; }, options.fixedRandom === true ? 0.1 : options.fixedRandom);
    const tab = await context.newPage();
    const log = { wiki: [], data: 0, photos: [], tiles: 0, satellite: [], errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });

    await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) {
            if (url.pathname === '/data/zemepis.json') {
                log.data++;
                if (flags.dataDown) return route.fulfill({ status: 503, body: '' });
            }
            return route.fulfill(serveFile(url.pathname));
        }
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'cs.wikipedia.org') {
            log.wiki.push(url.href);
            if (flags.wikiDown) return route.fulfill({ status: 503, body: '' });
            if (flags.wikiHangs) return; // odpověď nikdy nepřijde
            const title = url.searchParams.get('titles');
            return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: fixtures.extractFor(title) } } } } });
        }
        if (url.hostname === 'upload.wikimedia.org') {
            log.photos.push(decodeURIComponent(url.pathname));
            return url.pathname.includes('Chybejici') ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/png', body: PNG });
        }
        if (url.hostname === 'gibs.earthdata.nasa.gov') { log.satellite.push(url.pathname); return route.fulfill({ contentType: 'image/jpeg', body: PNG }); }
        if (url.hostname === 'tile.openstreetmap.org') { log.tiles++; return route.fulfill({ contentType: 'image/png', body: PNG }); }
        return route.abort();
    });

    const now = new Date('2026-10-16T10:00:00');
    if (options.fakeTimers) await tab.clock.install({ time: now });
    else await tab.clock.setFixedTime(now);
    return { context, tab, log, flags };
};

const waitForHome = (tab) => tab.waitForSelector('text=Dnešní otázky', { timeout: 30000 });
const waitForQuestion = (tab) => tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
const waitForResult = (tab) => tab.waitForSelector('h1', { timeout: 30000 });
// Rozehraná otázka z uloženého stavu – podle ní test ví, co je správná odpověď
const readRound = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
const readStorage = (tab, key) => tab.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
const appText = (tab) => tab.textContent('#app-content');
// Záložka panelu ve výsledku (fotka, mapa, z družice, obrazová nápověda)
const openResultTab = (tab, step) => tab.click(`[data-action="result-tab"][data-step="${step}"]`);
// Učení → téma → okruh (null = celé téma)
const openCollection = async (tab, topic, collection) => {
    await tab.click('#btn-learn');
    await tab.click(`[data-action="learn-topic"][data-topic="${topic}"]`);
    await tab.click(`[data-action="learn-collection"][data-collection="${collection || ''}"]`);
    await tab.waitForSelector('[data-action="learn-practice"]');
};
const practiceCollection = async (tab, topic, collection) => {
    await openCollection(tab, topic, collection);
    await tab.click('[data-action="learn-practice"]');
    await waitForQuestion(tab);
};

test('aplikace v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('dnešní otázka zeměpisu: popis, fotka, slepá mapa, fakta, odpověď, série a sdílení', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /Zeměpis\s*čeká/);
        assert.equal(await tab.textContent('#status-text'), 'Mudrlant · 16. 10.');

        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        assert.equal(data.known, true, 'dnešní otázka je ze známých');
        assert.deepEqual(data.hints, ['photo', 'visual', 'facts']);
        assert.equal(await tab.textContent('#status-text'), 'Zeměpis · 16. 10.');
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4);
        assert.equal(await tab.locator('#answer-input').count(), 0, 've variantě s možnostmi není pole pro psaní');
        assert.equal(await tab.textContent('h2'), data.question.title);

        // Popis je vidět hned a neprozradí odpověď; HTML z Wikipedie je jen text
        const description = await tab.textContent('p.italic');
        assert.match(description, /<img src=x onerror=__xss=1>/);
        assert.ok(!description.includes(data.question.answerLabel), description);
        assert.equal(await tab.locator('#hint-photo, #hint-visual').count(), 0, 'nápovědy až na požádání');
        assert.match(await appText(tab), /Nápověda 1\/4/);
        assert.match(await appText(tab), /Za 4 body/);
        assert.equal(await tab.getAttribute('[data-action="hint-tab"][data-step="text"]', 'aria-selected'), 'true', 'popis v první záložce');

        // 1. nápověda: skutečná fotka jako pozadí prvku (ne <img>)
        await tab.click('[data-action="hint"]');
        await tab.waitForFunction(() => document.getElementById('hint-photo').style.backgroundImage.includes('upload.wikimedia.org/wikipedia/commons/thumb/a/ab/'));
        assert.match(await appText(tab), /Nápověda 2\/4/);
        // Odpověď se při nápovědě neposune – nápovědy jsou záložky panelu pevné výšky
        const answerTop = await tab.locator('[data-action="choice"]').first().boundingBox();
        assert.equal(await tab.locator('#app-content section img').count(), 0);

        // 2. nápověda: slepá mapa bez popisků s obrysy států
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual svg path');
        assert.ok(await tab.locator('#hint-visual svg path').count() >= 3, 'obrysy okolních států');
        assert.equal(await tab.locator('#hint-visual svg text').count(), 0, 'žádné popisky');
        assert.match(await appText(tab), /↔ [\d\s ]+ km/);

        // 3. nápověda: čísla a fakta, další už není
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('[data-action="hint-tab"][data-step="facts"][aria-selected="true"]');
        assert.match(await appText(tab), /Kontinent/);
        assert.equal(await tab.locator('[data-action="hint"]').count(), 0);
        assert.match(await appText(tab), /Nápověda 4\/4/);
        assert.equal((await tab.locator('[data-action="choice"]').first().boundingBox()).y, answerTop.y);

        // Popis i dřívější nápovědy jdou otevřít znovu
        await tab.click('[data-action="hint-tab"][data-step="text"]');
        assert.match(await tab.textContent('p.italic'), /<img src=x onerror=__xss=1>/);
        await tab.click('[data-action="hint-tab"][data-step="visual"]');
        await tab.waitForSelector('#hint-visual svg path');

        // Lišta nahoře nepřekrývá obsah
        const header = await tab.locator('header').boundingBox();
        const content = await tab.locator('#app-content').boundingBox();
        assert.ok(header.y + header.height <= content.y + 1, 'obsah začíná pod lištou');

        await tab.click(`[data-action="choice"]:has-text("${data.question.answerLabel}")`);
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně! \+1 bod/);
        assert.equal(await tab.textContent('h1'), data.name);
        assert.match(await appText(tab), /Čísla a fakta/);
        assert.match(await appText(tab), /Zajímavosti/);
        assert.equal(await tab.getAttribute('a:has-text("Číst na Wikipedii")', 'href'), `https://cs.wikipedia.org/wiki/${encodeURIComponent(data.title.replace(/ /g, '_'))}`);
        // Výsledek: fotka, mapa a slepá mapa v záložkách; tlačítko Další je vidět bez posouvání
        assert.deepEqual(await tab.$$eval('[data-action="result-tab"]', tabs => tabs.map(button => button.dataset.step)), ['photo', 'map']);
        await tab.waitForFunction(() => document.getElementById('result-photo').style.backgroundImage.includes('upload.wikimedia.org'));
        const nextBox = await tab.locator('[data-action="next"]').boundingBox();
        assert.ok(nextBox.y + nextBox.height <= tab.viewportSize().height, 'Další je na obrazovce');
        await openResultTab(tab, 'map');
        await tab.waitForFunction(() => document.querySelectorAll('#map-tiles img').length > 0);
        assert.ok(log.tiles > 0, 'mapa načetla dlaždice');
        await tab.click('[data-action="zoom-in"]');
        assert.match(await tab.getAttribute('#map-open-link', 'href'), /#map=10\//);

        await tab.click('[data-action="share"]');
        await tab.waitForSelector('#toast:not(.opacity-0)');
        const shared = await tab.evaluate(() => navigator.clipboard.readText());
        assert.equal(shared, 'Mudrlant · 🌍 Zeměpis · 16. 10. 2026\n✅ 1 bod · nápověda 4/4\n🔥 Série: 1\nhttps://geo.test/');

        // Zpět na dnešní otázky: zeměpis je odehraný a série běží
        await tab.click('[data-action="next"]');
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /Zeměpis\s*1 bod\s*1/);

        // Odehraná dnešní otázka zůstane uložená i po obnovení stránky
        const requestsBefore = log.wiki.length;
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForResult(tab);
        assert.equal(log.wiki.length, requestsBefore, 'dnešní otázka z mezipaměti');
        await tab.reload();
        await waitForResult(tab);
        assert.equal(await tab.textContent('h1'), data.name);
        assert.equal(log.wiki.length, requestsBefore);

        assert.equal(await tab.evaluate(() => window.__xss), undefined);
        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'všechny ikony vykreslené');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('procvičení okruhu ve variantě psaní: otázka na stát, zakrytý stát, dvojnásobek bodů', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed', fixedRandom: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await practiceCollection(tab, 'zemepis', 'c:mesto');
        const data = await readRound(tab);
        assert.equal(data.name, 'Testov');
        assert.equal(data.question.type, 'location');
        assert.equal(await tab.textContent('#status-text'), 'Zeměpis · Města');
        assert.match(await tab.textContent('h2'), /Ve kterém státě to je\?/);
        assert.match(await appText(tab), /Název: Testov/);
        const description = await tab.textContent('p.italic');
        assert.doesNotMatch(description, /Česk|česk|Jihomoravsk/, description);
        assert.match(description, /na řece Svratce/);
        assert.equal(await tab.locator('[data-action="choice"]').count(), 0, 've variantě psaní nejsou možnosti');
        assert.match(await appText(tab), /Za 8 bodů/);

        await tab.fill('#answer-input', 'Česká republika');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně! \+8 bodů/);
        assert.match(await appText(tab), /Napsaná odpověď/);
        assert.match(await appText(tab), /Česká stopa/);

        // Další z okruhu se neopakuje; napsaný jiný stát výsledek pozná a nabídne o něm popis
        assert.match(await tab.textContent('[data-action="next"]'), /Další z okruhu/);
        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        const next = await readRound(tab);
        assert.notEqual(next.name, 'Testov');
        assert.equal(next.category, 'mesto');
        await tab.fill('#answer-input', 'Rakousko');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Bohužel, to není ono/);
        assert.match(await appText(tab), /správně 1 z 2/);
        await tab.click('[data-action="item-info"]:has-text("Co je Rakousko?")');
        await tab.waitForSelector('#place-info h2:has-text("Rakousko")');
        await tab.keyboard.press('Escape');
        assert.equal(await tab.locator('#place-info').count(), 0);
        assert.equal(await tab.locator('section:has-text("ostatní možnosti")').count(), 0, 'u psaní nebyly možnosti vidět');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('stát: slepá mapa ho zvýrazní, psaná zkratka platí', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed', fixedRandom: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await practiceCollection(tab, 'zemepis', 'c:stat');
        const data = await readRound(tab);
        assert.equal(data.name, 'Švýcarsko');
        assert.equal(data.question.type, 'name');
        assert.deepEqual(data.hints, ['visual', 'facts'], 'stát bez fotky');
        assert.doesNotMatch(await tab.textContent('p.italic'), /Švýcar|švýcar/);
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual path.fill-emerald-400');
        assert.equal(await tab.locator('#hint-visual svg circle').count(), 0);
        await tab.click('[data-action="hint"]');
        assert.match(await appText(tab), /Hlavní město\s*Bern/);
        await tab.fill('#answer-input', 'svycarsko');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně! \+2 body/);
        assert.match(await appText(tab), /Evropa/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('bez skutečné fotky (vlajka, nedostupný soubor) nápověda s fotkou chybí', async () => {
        const { context, tab, log } = await setup(browser, { fixedRandom: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await practiceCollection(tab, 'zemepis', 'c:ostrov');
        for (const name of ['Vlajkový ostrov', 'Druhý ostrov']) {
            if (name !== 'Vlajkový ostrov') {
                await tab.click('[data-action="next"]');
                await waitForQuestion(tab);
            }
            const data = await readRound(tab);
            assert.equal(data.name, name);
            assert.equal(data.photoUrl, null);
            assert.match(await appText(tab), /Nápověda 1\/3/);
            assert.match(await tab.textContent('[data-action="hint"]'), /slepá mapa/i);
            await tab.click('[data-action="give-up"]');
            await waitForResult(tab);
        }
        assert.ok(!log.photos.some(file => file.includes('Flag_of')), 'vlajka se ani nestahuje');
        assert.ok(log.photos.some(file => file.includes('Chybejici')));
        // Ve výsledku bez fotky mapa a satelitní snímek okolí
        assert.deepEqual(await tab.$$eval('[data-action="result-tab"]', tabs => tabs.map(button => button.dataset.step)), ['map', 'satellite']);
        await openResultTab(tab, 'satellite');
        await tab.waitForFunction(() => document.querySelectorAll('#result-satellite img').length > 0);
        assert.ok(log.satellite.some(tile => tile.includes('_Level8/5/')));
        assert.match(await appText(tab), /Méně známé/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('špatná odpověď: okno s popisem zvolené možnosti i ostatních', async () => {
        const { context, tab, log } = await setup(browser, { fixedRandom: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await practiceCollection(tab, 'zemepis', 'c:hora');
        const data = await readRound(tab);
        assert.equal(data.name, 'Testovací hora');
        assert.equal(data.question.type, 'location');
        const wrong = data.question.choices.filter(choice => !choice.correct);
        await tab.click(`[data-action="choice"]:has-text("${wrong[0].label}")`);
        await waitForResult(tab);
        assert.match(await appText(tab), new RegExp(`Tvoje odpověď: ${wrong[0].label}`));

        // Okno s popisem: název, úvod z Wikipedie, mapa a fakta
        await tab.click(`[data-action="item-info"]:has-text("Co je ${wrong[0].label}?")`);
        await tab.waitForSelector('#place-info [role="img"] svg path');
        assert.equal(await tab.textContent('#place-info h2'), wrong[0].label);
        await tab.waitForFunction(() => /o které se píše v testu/.test(document.querySelector('#place-info [data-card-text]').textContent));
        assert.match(await tab.textContent('#place-info'), /Hlavní město/);
        assert.equal(await tab.getAttribute('#place-info a:has-text("Více na Wikipedii")', 'href'), `https://cs.wikipedia.org/wiki/${encodeURIComponent(wrong[0].label)}`);
        await tab.click('#place-info [data-close]');
        assert.equal(await tab.locator('#place-info').count(), 0);

        // Ostatní nabízené možnosti jdou rozkliknout také
        const others = await tab.locator('section:has-text("ostatní možnosti") [data-action="item-info"]').allTextContents();
        assert.deepEqual(others.map(text => text.trim()).sort(), wrong.slice(1).map(choice => choice.label).sort());
        await tab.click(`section:has-text("ostatní možnosti") [data-action="item-info"]:has-text("${wrong[1].label}")`);
        await tab.waitForSelector(`#place-info h2:has-text("${wrong[1].label}")`);
        await tab.click('#place-info', { position: { x: 5, y: 5 } });
        assert.equal(await tab.locator('#place-info').count(), 0, 'klik mimo okno ho zavře');

        // Neuhodnutá položka je v seznamu chyb
        assert.deepEqual(await readStorage(tab, 'mudrlant.mistakes'), ['zemepis:Q4242']);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('učení: okruh popořadě, postup, procvičení a opakování chyb', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);

        // Téma: okruhy a kategorie s počty
        await tab.click('#btn-learn');
        assert.equal(await tab.textContent('#status-text'), 'Učení');
        await tab.click('[data-action="learn-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="learn-collection"][data-collection="cesko"]');
        assert.equal(await tab.textContent('#status-text'), 'Učení · Zeměpis');
        assert.match(await tab.textContent('[data-collection="cesko"]'), /Česko\s*2/);
        assert.match(await tab.textContent('[data-collection="c:hora"]'), /Hory a sopky\s*3/, 'kategorie jen se známými');

        // Okruh velkoměsta popořadě podle počtu obyvatel
        await tab.click('[data-action="learn-collection"][data-collection="velkomesta"]');
        await tab.click('[data-action="learn-browse"]');
        await tab.waitForSelector('#learn-card [role="img"] svg path');
        assert.equal(await tab.textContent('#learn-card h2'), 'Berlín');
        assert.match(await appText(tab), /1 \/ 3/);
        assert.equal(await tab.isDisabled('[data-action="learn-prev"]'), true);
        await tab.waitForFunction(() => !/Načítám popis/.test(document.querySelector('#learn-card [data-card-text]').textContent));
        await tab.click('[data-action="learn-next"]');
        assert.equal(await tab.textContent('#learn-card h2'), 'Řím');
        await tab.click('[data-action="learn-next"]');
        assert.equal(await tab.textContent('#learn-card h2'), 'Vídeň');
        assert.equal(await tab.isDisabled('[data-action="learn-next"]'), true);
        await tab.click('[data-action="learn-prev"]');
        assert.equal(await tab.textContent('#learn-card h2'), 'Řím');

        // Procvičení okruhu: jen velkoměsta; po správné odpovědi roste postup
        await tab.click('[data-action="learn-collection"]');
        await tab.click('[data-action="learn-practice"]');
        await waitForQuestion(tab);
        const first = await readRound(tab);
        assert.ok(['Berlín', 'Řím', 'Vídeň'].includes(first.name) || first.question.type === 'location');
        await tab.click(`[data-action="choice"]:has-text("${first.question.answerLabel}")`);
        await waitForResult(tab);
        await openCollection(tab, 'zemepis', 'velkomesta');
        assert.match(await appText(tab), /3 položek · uhodnuto 1/);

        // Chyba z dnešní otázky se objeví v seznamu chyb
        await tab.click('#btn-home');
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        const daily = await readRound(tab);
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        await tab.click('#btn-learn');
        await tab.click('[data-action="learn-mistakes"]');
        await tab.waitForSelector('[data-action="practice-mistakes"]');
        assert.match(await appText(tab), /Procvičit chyby \(1\)/);
        await tab.click(`ul [data-action="item-info"]:has-text("${daily.name}")`);
        await tab.waitForSelector(`#place-info h2:has-text("${daily.name}")`);
        await tab.keyboard.press('Escape');

        // Procvičení chyb: stejná otázka znovu, po správné odpovědi ze seznamu zmizí
        await tab.click('[data-action="practice-mistakes"]');
        await waitForQuestion(tab);
        const again = await readRound(tab);
        assert.equal(again.id, daily.id);
        assert.equal(await tab.textContent('#status-text'), 'Opakování chyb · 1');
        await tab.click(`[data-action="choice"]:has-text("${again.question.answerLabel}")`);
        await waitForResult(tab);
        assert.match(await tab.textContent('[data-action="next"]'), /Hotovo – zpět do učení/);
        assert.deepEqual(await readStorage(tab, 'mudrlant.mistakes'), []);
        await tab.click('[data-action="next"]');
        await tab.waitForSelector('text=Zatím tu nic není');

        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'všechny ikony vykreslené');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('dlaždice tématu: poprvé výběr kategorií, pak rovnou hra; barva a změna tématu nahoře', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="play-topic"][data-topic="zemepis"]'), /Zeměpis\s*Všechny kategorie/);

        // Poprvé okno s výběrem: výchozí všechny kategorie, poslední vypnout nejde
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('#play-chooser');
        const toggles = tab.locator('#play-chooser [data-chooser-category]');
        assert.ok(await toggles.count() >= 3);
        assert.deepEqual([...new Set(await toggles.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-pressed'))))], ['true']);
        const keys = await toggles.evaluateAll(buttons => buttons.map(button => button.dataset.chooserCategory));
        for (const key of keys.filter(key => key !== 'hora')) await tab.click(`#play-chooser [data-chooser-category="${key}"]`);
        await tab.click('#play-chooser [data-chooser-category="hora"]');
        assert.match(await tab.textContent('#chooser-note'), /Aspoň jedna kategorie/);
        assert.deepEqual((await readStorage(tab, 'mudrlant.settings')).categories, { zemepis: ['hora'] });
        await tab.click('#play-chooser [data-chooser-play]');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('#play-chooser').count(), 0);
        assert.equal((await readRound(tab)).category, 'hora');
        assert.equal(await tab.textContent('#status-text'), 'Zeměpis · Hory a sopky');
        assert.match(await tab.getAttribute('#app-header', 'class'), /border-emerald-500/, 'barva tématu v hlavičce');

        // Další otázka zase z vybrané kategorie; tlačítko Hrát dál vrátí rozehranou otázku
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        const second = await readRound(tab);
        assert.equal(second.category, 'hora');
        await tab.click('#btn-learn');
        await tab.waitForSelector('[data-action="learn-topic"]');
        await tab.click('#btn-practice');
        await waitForQuestion(tab);
        assert.equal((await readRound(tab)).id, second.id, 'rozehraná otázka zůstala');

        // Klepnutí na téma nahoře: výběr kategorií i přepnutí na jiné téma
        await tab.click('#status-badge');
        await tab.waitForSelector('#play-chooser [data-chooser-category="hora"][aria-pressed="true"]');
        await tab.click('#play-chooser [data-chooser-all]');
        await tab.click('#play-chooser [data-chooser-switch="historie"]');
        assert.equal(await tab.textContent('#chooser-title'), 'Historie');
        await tab.click('#play-chooser [data-chooser-play]');
        await waitForQuestion(tab);
        assert.equal((await readRound(tab)).topic, 'historie');
        assert.equal(await tab.textContent('#status-text'), 'Historie');
        assert.match(await tab.getAttribute('#app-header', 'class'), /border-amber-500/);

        // Podruhé už dlaždice hraje rovnou s uloženým výběrem
        await tab.click('#btn-home');
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="play-topic"][data-topic="zemepis"]'), /Všechny kategorie/);
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('#play-chooser').count(), 0);
        assert.deepEqual((await readStorage(tab, 'mudrlant.settings')).seen, ['zemepis', 'historie']);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('mix: výběr témat (výchozí všechna), otázky jen z vybraných', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('[data-action="play-mix"]');
        await tab.waitForSelector('#play-chooser');
        assert.equal(await tab.locator('#play-chooser [data-chooser-topic][aria-pressed="true"]').count(), 5);
        for (const topicId of ['historie', 'biologie', 'chemie', 'fyzika']) await tab.click(`#play-chooser [data-chooser-topic="${topicId}"]`);
        await tab.click('#play-chooser [data-chooser-topic="zemepis"]');
        assert.match(await tab.textContent('#chooser-note'), /Aspoň jedno téma/);
        await tab.keyboard.press('Escape');
        assert.equal(await tab.locator('#play-chooser').count(), 0, 'Escape okno zavře');
        assert.deepEqual((await readStorage(tab, 'mudrlant.settings')).topics, ['zemepis']);
        assert.match(await tab.textContent('[data-action="play-mix"]'), /1 z 5 témat/);

        await tab.click('[data-action="play-mix"]');
        await tab.click('#play-chooser [data-chooser-play]');
        await waitForQuestion(tab);
        assert.equal((await readRound(tab)).topic, 'zemepis');
        assert.equal(await tab.textContent('#status-text'), 'Mix · Zeměpis');
        assert.match(await tab.getAttribute('#app-header', 'class'), /border-emerald-500/, 'v mixu barva tématu otázky');
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        assert.match(await tab.textContent('[data-action="next"]'), /Další otázka/);
        await tab.click('#status-badge');
        await tab.waitForSelector('#play-chooser [data-chooser-topic]');
        await tab.click('#play-chooser [data-close]');
        assert.equal(await tab.locator('#play-chooser').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('nastavení: varianta hry a známost', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('#btn-practice');
        await waitForQuestion(tab);
        assert.match(await tab.textContent('#status-text'), /^Mix · /);

        await tab.click('#btn-settings');
        await tab.click('#settings-overlay [data-variant="typed"]');
        assert.match(await tab.textContent('#settings-note'), /od další otázky/);
        assert.equal(await tab.getAttribute('#settings-overlay [data-tier="known"]', 'aria-pressed'), 'true');
        await tab.click('#settings-overlay [data-tier="all"]');
        assert.deepEqual(await readStorage(tab, 'mudrlant.settings'), { tier: 'all', topics: ['zemepis', 'historie', 'biologie', 'chemie', 'fyzika'], categories: {}, seen: [] });
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
        assert.ok(await tab.locator('[data-action="choice"]').count() >= 2);
        assert.equal(await tab.locator('#answer-input').count(), 0);

        // Známost i méně známé: v učení se kategorie počítají celé; kategorie jsou nad okruhy
        await openCollection(tab, 'zemepis', 'c:hora');
        assert.match(await appText(tab), /4 položek/);
        await tab.click('[data-action="learn-topic"]');
        const order = await tab.$$eval('[data-action="learn-collection"]', rows => rows.map(row => row.dataset.collection));
        assert.ok(order.indexOf('c:hora') < order.indexOf('cesko'), 'kategorie před okruhy');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('historie: otázka na osobnost s časovou osou, otázka na století, okruh popořadě', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed', fixedRandom: 0.5 });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="daily"][data-topic="historie"]'), /Historie\s*čeká/);

        // Kdo to je? Časová osa s životem a vládou, popis bez jména
        await practiceCollection(tab, 'historie', 'anglicti-panovnici');
        const data = await readRound(tab);
        assert.equal(data.question.type, 'name');
        assert.equal(await tab.textContent('h2'), 'Kdo to je?');
        assert.equal(await tab.getAttribute('#answer-input', 'placeholder'), 'Napiš jméno…');
        assert.deepEqual(data.hints, ['photo', 'visual', 'facts']);
        assert.ok(!(await tab.textContent('p.italic')).includes(data.name));
        await tab.click('[data-action="hint"]');
        assert.match(await tab.textContent('[data-action="hint"]'), /časová osa/i);
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual svg rect');
        const axis = await tab.textContent('#hint-visual svg');
        assert.match(axis, /život/);
        assert.match(axis, /vláda/);
        assert.match(axis, /1[56]\d0/, 'roky na ose');
        await tab.fill('#answer-input', data.name);
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně!/);
        assert.match(await appText(tab), /Vláda\s*1[56]\d\d–1[56]\d\d/);
        assert.match(await tab.textContent('#status-text'), /^Historie · Angličtí panovníci/);
        await context.close();

        // Do kterého století to patří? Jméno je vidět, letopočty z popisu i z nápověd zmizí
        const second = await setup(browser, { variant: 'typed', fixedRandom: true });
        await second.tab.goto(`${ORIGIN}/`);
        await waitForHome(second.tab);
        await practiceCollection(second.tab, 'historie', 'premyslovci');
        const century = await readRound(second.tab);
        assert.equal(century.name, 'Přemysl Otakar II.');
        assert.equal(century.question.type, 'century');
        assert.equal(await second.tab.textContent('h2'), 'Ve kterém století začal vládnout?');
        assert.match(await appText(second.tab), /Přemysl Otakar II\./);
        assert.doesNotMatch(await second.tab.textContent('p.italic'), /\d/);
        assert.deepEqual(century.hints, ['photo', 'facts'], 'časová osa by prozradila století');
        assert.ok(century.facts.every(fact => !/\d/.test(fact.value)));
        await second.tab.fill('#answer-input', '13');
        await second.tab.press('#answer-input', 'Enter');
        await waitForResult(second.tab);
        assert.match(await appText(second.tab), /Správně!/);
        assert.match(await appText(second.tab), /13\. století/);
        // Ve výsledku už časová osa je
        await openResultTab(second.tab, 'visual');
        await second.tab.waitForSelector('#result-visual svg rect');

        // Učení: okruh Přemyslovci popořadě podle roku, s časovou osou
        await openCollection(second.tab, 'historie', 'premyslovci');
        await second.tab.click('[data-action="learn-browse"]');
        await second.tab.waitForSelector('#learn-card [role="img"] svg rect');
        assert.equal(await second.tab.textContent('#learn-card h2'), 'Přemysl Otakar II.');
        await second.tab.click('[data-action="learn-next"]');
        assert.equal(await second.tab.textContent('#learn-card h2'), 'Václav II.');

        assert.equal(await second.tab.locator('i[data-lucide]').count(), 0, 'všechny ikony vykreslené');
        for (const run of [log, second.log]) {
            assert.deepEqual(run.errors, []);
            assert.deepEqual(run.csp, []);
        }
        await second.context.close();
    });

    await t.test('biologie: kam patří (řád), mapa rozšíření, psaný vědecký název', async () => {
        const { context, tab, log } = await setup(browser, { fixedRandom: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="daily"][data-topic="biologie"]'), /Biologie\s*čeká/);

        // Do kterého řádu patří? Název je vidět, řád z popisu i faktů zmizí
        await practiceCollection(tab, 'biologie', 'selmy');
        const taxon = await readRound(tab);
        assert.equal(taxon.name, 'Lev pustinný');
        assert.equal(taxon.question.type, 'taxon');
        assert.equal(await tab.textContent('h2'), 'Do kterého řádu patří?');
        assert.deepEqual(taxon.question.choices.map(choice => choice.label).sort(), ['hlodavci', 'primáti', 'sudokopytníci', 'šelmy']);
        assert.doesNotMatch(await tab.textContent('p.italic'), /šelm/i);
        assert.match(await tab.textContent('p.italic'), /Lev pustinný/);
        assert.ok(taxon.facts.every(fact => !/šelm/.test(fact.value)));
        await tab.click('[data-action="choice"]:has-text("šelmy")');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně!/);
        assert.match(await appText(tab), /Vědecký název\s*Panthera leo/);
        await context.close();

        // Co je to za zvíře? Mapa rozšíření z Commons (SVG jako PNG náhled), psaný vědecký název platí
        const second = await setup(browser, { variant: 'typed', fixedRandom: 0.5 });
        await second.tab.goto(`${ORIGIN}/`);
        await waitForHome(second.tab);
        await openCollection(second.tab, 'biologie', 'selmy');
        await second.tab.click('[data-action="learn-practice"]');
        await waitForQuestion(second.tab);
        let round = await readRound(second.tab);
        // Okruh popořadě není – dokud nepřijde lev s mapou rozšíření, vzdát a dál
        for (let i = 0; i < 6 && round.name !== 'Lev pustinný'; i++) {
            await second.tab.click('[data-action="give-up"]');
            await waitForResult(second.tab);
            await second.tab.click('[data-action="next"]');
            await waitForQuestion(second.tab);
            round = await readRound(second.tab);
        }
        assert.equal(round.name, 'Lev pustinný');
        assert.equal(round.question.type, 'name');
        assert.equal(await second.tab.textContent('h2'), 'Co je to za zvíře?');
        assert.deepEqual(round.hints, ['photo', 'visual', 'facts']);
        await second.tab.click('[data-action="hint"]');
        assert.match(await second.tab.textContent('[data-action="hint"]'), /mapa rozšíření/i);
        await second.tab.click('[data-action="hint"]');
        await second.tab.waitForFunction(() => { const map = document.querySelector('#hint-visual div[class*="bg-contain"]'); return map && map.style.backgroundImage.includes('/thumb/1/12/Lion_range.svg/500px-Lion_range.svg.png'); });
        await second.tab.fill('#answer-input', 'panthera leo');
        await second.tab.press('#answer-input', 'Enter');
        await waitForResult(second.tab);
        assert.match(await appText(second.tab), /Správně!/);
        for (const run of [log, second.log]) {
            assert.deepEqual(run.errors, []);
            assert.deepEqual(run.csp, []);
        }
        await second.context.close();
    });

    await t.test('chemie: značka prvku, slepá periodická tabulka, vzorec látky', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed', fixedRandom: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);

        // Jakou značku má tento prvek? Psaná značka platí jen přesně
        await practiceCollection(tab, 'chemie', 'alkalicke-kovy');
        const symbol = await readRound(tab);
        assert.equal(symbol.name, 'Lithium');
        assert.equal(symbol.question.type, 'symbol');
        assert.equal(await tab.textContent('h2'), 'Jakou značku má tento prvek?');
        assert.match(await appText(tab), /Název: Lithium/);
        await tab.fill('#answer-input', 'li');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně!/);
        assert.match(await appText(tab), /Značka\s*Li/);
        assert.match(await appText(tab), /Protonové číslo\s*3/);
        await context.close();

        // Který prvek to je? Nápověda periodická tabulka: 118 políček bez značek, hledané zvýrazněné
        const second = await setup(browser, { fixedRandom: 0.5 });
        await second.tab.goto(`${ORIGIN}/`);
        await waitForHome(second.tab);
        await practiceCollection(second.tab, 'chemie', 'alkalicke-kovy');
        const element = await readRound(second.tab);
        assert.equal(element.question.type, 'name');
        assert.equal(await second.tab.textContent('h2'), 'Který prvek to je?');
        assert.deepEqual(element.hints, ['photo', 'visual', 'facts']);
        await second.tab.click('[data-action="hint"]');
        assert.match(await second.tab.textContent('[data-action="hint"]'), /periodická tabulka/i);
        await second.tab.click('[data-action="hint"]');
        await second.tab.waitForSelector('#hint-visual svg rect');
        assert.equal(await second.tab.locator('#hint-visual svg rect').count(), 118);
        assert.equal(await second.tab.locator('#hint-visual svg rect.fill-rose-500').count(), 1);
        assert.equal(await second.tab.locator('#hint-visual svg text').count(), 0, 'značky prvků na tabulce nejsou');
        await second.tab.click(`[data-action="choice"]:has-text("${element.question.answerLabel}")`);
        await waitForResult(second.tab);
        assert.match(await appText(second.tab), /Správně!/);
        await second.context.close();

        // Jaký vzorec má tato látka? Psaný vzorec s obyčejnými číslicemi platí
        const third = await setup(browser, { variant: 'typed', fixedRandom: true });
        await third.tab.goto(`${ORIGIN}/`);
        await waitForHome(third.tab);
        await practiceCollection(third.tab, 'chemie', 'c:latky');
        const formula = await readRound(third.tab);
        assert.equal(formula.question.type, 'formula');
        assert.equal(await third.tab.textContent('h2'), 'Jaký vzorec má tato látka?');
        assert.ok(!formula.facts.some(fact => fact.label === 'Vzorec'));
        assert.ok(!formula.hints.includes('visual'), 'strukturní vzorec by prozradil odpověď');
        await third.tab.fill('#answer-input', formula.question.accepted[1]);
        await third.tab.press('#answer-input', 'Enter');
        await waitForResult(third.tab);
        assert.match(await appText(third.tab), /Správně!/);
        for (const run of [log, second.log, third.log]) {
            assert.deepEqual(run.errors, []);
            assert.deepEqual(run.csp, []);
        }
        await third.context.close();
    });

    await t.test('fyzika: jednotka veličiny (psaná značka), co měří jednotka, fyzik s časovou osou', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed', fixedRandom: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="daily"][data-topic="fyzika"]'), /Fyzika\s*čeká/);

        // Jaká je jednotka SI této veličiny? Značka N platí, odpověď ukáže název i značku
        await practiceCollection(tab, 'fyzika', 'c:veliciny');
        const unit = await readRound(tab);
        assert.equal(unit.name, 'Síla');
        assert.equal(unit.question.type, 'unit');
        assert.equal(await tab.textContent('h2'), 'Jaká je jednotka SI této veličiny?');
        assert.ok(!unit.facts.some(fact => fact.label === 'Jednotka SI'));
        await tab.fill('#answer-input', 'N');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně!/);
        assert.match(await appText(tab), /Jednotka SI\s*newton \(N\)/);
        await context.close();

        // Fyzik: časová osa s milníky fyziky, „Kdo je …?“ u špatné odpovědi
        const second = await setup(browser, { fixedRandom: 0.5 });
        await second.tab.goto(`${ORIGIN}/`);
        await waitForHome(second.tab);
        await practiceCollection(second.tab, 'fyzika', 'c:fyzici');
        const person = await readRound(second.tab);
        assert.equal(person.question.type, 'name');
        assert.equal(await second.tab.textContent('h2'), 'Kdo to je?');
        await second.tab.click('[data-action="hint"]');
        await second.tab.waitForSelector('#hint-visual svg rect');
        assert.match(await second.tab.textContent('#hint-visual svg'), /život/);
        const wrong = person.question.choices.find(choice => !choice.correct);
        await second.tab.click(`[data-action="choice"]:has-text("${wrong.label}")`);
        await waitForResult(second.tab);
        assert.match(await appText(second.tab), new RegExp(`Kdo je ${wrong.label}\\?`));
        for (const run of [log, second.log]) {
            assert.deepEqual(run.errors, []);
            assert.deepEqual(run.csp, []);
        }
        await second.context.close();
    });

    await t.test('první spuštění: výběr varianty hry, pak dnešní otázky', async () => {
        const { context, tab, log } = await setup(browser, { variant: null });
        await tab.goto(`${ORIGIN}/`);
        await tab.waitForSelector('text=Vítej v Mudrlantovi');
        assert.equal(log.data, 0, 'bez varianty se nic nenačítá');
        await tab.click('#variant-welcome [data-variant="typed"]');
        await waitForHome(tab);
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.variant')), 'typed');
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('#answer-input').count(), 1);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('převzetí uložených dat z Geo Kvízu', async () => {
        const { context, tab, log } = await setup(browser, {
            variant: null,
            storage: {
                geoQuizVariant: 'typed',
                geoQuizStats: JSON.stringify({
                    daily: { '2026-10-15': { correct: true, points: 4 }, '2026-10-16': { correct: true, points: 3 } },
                    practice: { played: 2, correct: 1, points: 4 }
                }),
                geoQuizMistakes: JSON.stringify(['Q4242']),
                geoQuizFilters: JSON.stringify({ categories: ['hora'], tier: 'all' }),
                geoQuizDaily19: JSON.stringify({ date: '2026-10-16' }),
                geoSessionState: JSON.stringify({ version: 7 })
            }
        });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /Zeměpis\s*3 body\s*2/);
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.variant')), 'typed');
        assert.deepEqual(await readStorage(tab, 'mudrlant.mistakes'), ['zemepis:Q4242']);
        assert.equal((await readStorage(tab, 'mudrlant.settings')).tier, 'all');
        assert.equal((await readStorage(tab, 'mudrlant.stats')).practice.points, 4);
        assert.deepEqual(await tab.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('geo'))), [], 'staré klíče jsou pryč');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('výpadek Wikipedie: hraje se dál s krátkým popisem z Wikidat', async () => {
        const { context, tab, log } = await setup(browser, { wikiDown: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        assert.equal(log.wiki.length, 2, 'dva pokusy o popis');
        assert.match(await tab.textContent('p.italic'), /v testovacím světě\./);
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        assert.doesNotMatch(await appText(tab), /Zajímavosti/);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('nedostupná data tématu: chyba spojení a opakování', async () => {
        const { context, tab, log, flags } = await setup(browser, { dataDown: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('text=Chyba spojení', { timeout: 30000 });
        assert.equal(log.data, 3);
        flags.dataDown = false;
        await tab.click('[data-action="retry"]');
        await waitForQuestion(tab);
        await context.close();
    });

    await t.test('zaseknutá Wikipedie nezdrží hru donekonečna', async () => {
        const { context, tab, log } = await setup(browser, { wikiHangs: true, fakeTimers: true });
        // Falešné hodiny zastaví i requestAnimationFrame, proto žádné waitFor…, jen posouvání času
        await tab.goto(`${ORIGIN}/`);
        for (let i = 0; i < 10 && !(await tab.isVisible('[data-action="daily"]')); i++) await tab.clock.runFor(1000);
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        for (let i = 0; i < 10 && !(await tab.isVisible('[data-action="give-up"]')); i++) {
            await tab.clock.runFor(10000);
            await tab.waitForTimeout(100);
        }
        assert.ok(await tab.isVisible('[data-action="give-up"]'));
        assert.equal(log.wiki.length, 2, 'dva pokusy, každý po vypršení limitu');
        assert.match(await tab.textContent('p.italic'), /v testovacím světě\./);
        await context.close();
    });

    await t.test('bez internetu se aplikace otevře a hraje z mezipaměti', async () => {
        const server = await startServer();
        const origin = `http://127.0.0.1:${server.address().port}`;
        const { context, tab, log } = await setup(browser, { origin, serviceWorkers: 'allow' });
        await tab.goto(`${origin}/`);
        await waitForHome(tab);
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        await tab.evaluate(() => navigator.serviceWorker.ready);

        // Vypnout síť i server – stránka i data se musí načíst jen z mezipaměti service workeru
        await context.setOffline(true);
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await tab.reload();
        await waitForQuestion(tab);
        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'ikony z mezipaměti');
        assert.equal(await tab.evaluate(() => getComputedStyle(document.getElementById('app-content')).display), 'flex', 'styly z mezipaměti');
        assert.equal(await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);

        // Nová otázka v tréninku: data témat i obrysy států z mezipaměti
        await tab.click('#btn-practice');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        for (let i = 0; i < data.hints.indexOf('visual') + 1; i++) await tab.click('[data-action="hint"]');
        // Mapa, osa i tabulka se vykreslí i bez sítě; obrázek z Commons ukáže zprávu, že se nenačetl
        if (data.hints.includes('visual')) await tab.waitForSelector('#hint-visual svg > *, #hint-visual div[class*="bg-contain"], #hint-visual p', { state: 'attached' });
        const files = ['data/zemepis.json', 'data/historie.json', 'data/biologie.json', 'data/chemie.json', 'data/fyzika.json', 'data/world.json'];
        assert.deepEqual(await tab.evaluate(list => Promise.all(list.map(file => fetch(file).then(response => response.status))), files), files.map(() => 200));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('tmavý režim', async () => {
        const { context, tab, log } = await setup(browser, { colorScheme: 'dark' });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        const background = await tab.evaluate(() => getComputedStyle(document.getElementById('app-content')).backgroundColor);
        assert.equal(background, 'rgb(15, 23, 42)');
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
