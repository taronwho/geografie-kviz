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
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
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

// options: variant (null = první spuštění), account (null = úvod s přihlášením ještě nebyl), settings, storage (další uložená data), fixedRandom (Math.random vrací 0.1 →
// první položka a u zeměpisu otázka na stát, u historie na století, kde jde; číslo = vrací to číslo), wikiDown, wikiHangs, dataDown, fakeTimers, colorScheme, origin + serviceWorkers
const setup = async (browser, options = {}) => {
    const origin = options.origin || ORIGIN;
    const flags = { ...options };
    const context = await browser.newContext({ serviceWorkers: options.serviceWorkers || 'block', colorScheme: options.colorScheme || 'light' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const storage = { ...(options.storage || {}) };
    if (options.variant !== null) storage['mudrlant.variant'] = options.variant || 'choices';
    // Úvod s přihlášením jen v testech, které ho chtějí (account: null = hráč ještě nevolil)
    if (options.account !== null) storage['mudrlant.account'] = JSON.stringify('host');
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
            // wikiThinFirst: první popis je příliš krátký (stub), další jsou běžné
            if (flags.wikiThinFirst && !flags.thinServed) {
                flags.thinServed = title;
                return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: 'Krátký popis jedné osoby ve zkušebním světě. Nic dalšího.' } } } } });
            }
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

// Úvodní stránka: dnešní otázky (Jeden hráč), nebo přepínač (i při záložce Více hráčů)
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && (content.textContent.includes('Dnešní otázky') || content.querySelector('#home-tabs'))); }, null, { timeout: 30000 });
const waitForQuestion = (tab) => tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
const waitForResult = (tab) => tab.waitForSelector('h1', { timeout: 30000 });
// Rozehraná otázka z uloženého stavu – podle ní test ví, co je správná odpověď
const readRound = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
const hintKeys = (data) => data.hints.map(hint => hint.key);
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
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /čeká/);
        assert.match(await tab.textContent('[data-action="play-daily"]'), /Hrát vše\s*· zbývá 14/);
        // Úvod: sova z loga, název a datum
        assert.equal(await tab.textContent('#status-text'), 'MudrlantÚr. 1 · Zvědavec');
        assert.equal(await tab.getAttribute('#status-badge', 'aria-label'), 'Mudrlant · 16. 10. – můj postup');
        assert.equal(await tab.locator('#status-icon-slot img[src="icons/logo.webp"]').count(), 1);
        assert.ok(await tab.evaluate(() => document.querySelector('#status-icon-slot img').naturalWidth > 0), 'logo se načte');

        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        assert.equal(data.known, true, 'dnešní otázka je ze známých');
        assert.equal(data.question.type, 'location');
        assert.deepEqual(hintKeys(data), ['photo', 'facts', 'visual']);
        assert.equal(await tab.textContent('#status-text'), 'Zeměpis · 16. 10.');
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4);
        assert.equal(await tab.locator('#answer-input').count(), 0, 've variantě s možnostmi není pole pro psaní');
        assert.equal(await tab.textContent('h2'), data.question.title);

        // Popis je vidět hned a neprozradí odpověď; HTML z Wikipedie je jen text
        const description = await tab.textContent('p.italic');
        assert.match(description, /<img src=x onerror=__xss=1>/);
        assert.ok(!description.includes(data.question.answerLabel), description);
        assert.equal(await tab.locator('#hint-photo, #hint-visual').count(), 0, 'nápovědy až na požádání');
        assert.match(await appText(tab), /Nápovědy 0\/3/);
        assert.match(await appText(tab), /Za 4 body/);
        // Dokud není odemčená nápověda, je v panelu jen popis (bez záložek); tlačítko nápovědy říká, co odemkne
        assert.equal(await tab.locator('[role="tablist"]').count(), 0);
        assert.match(await tab.textContent('[data-action="hint"]'), /Fotka[\s\S]*pak 3 body/);

        // 1. nápověda: skutečná fotka jako pozadí prvku (ne <img>)
        await tab.click('[data-action="hint"]');
        await tab.waitForFunction(() => document.getElementById('hint-photo').style.backgroundImage.includes('upload.wikimedia.org/wikipedia/commons/thumb/a/ab/'));
        assert.match(await appText(tab), /Nápovědy 1\/3/);
        // Odpověď se při nápovědě neposune – nápovědy jsou záložky panelu pevné výšky
        const answerTop = await tab.locator('[data-action="choice"]').first().boundingBox();
        assert.equal(await tab.locator('#app-content section img').count(), 0);

        // 2. nápověda u otázky na stát: kontinent a čísla (slepá mapa by stát skoro prozradila, je až poslední)
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('[data-action="hint-tab"][data-step="facts"][aria-selected="true"]');
        assert.match(await appText(tab), /Kontinent/);

        // 3. nápověda: slepá mapa bez popisků s obrysy států, další už není
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual svg path');
        assert.ok(await tab.locator('#hint-visual svg path').count() >= 3, 'obrysy okolních států');
        assert.equal(await tab.locator('#hint-visual svg text').count(), 0, 'žádné popisky');
        assert.match(await appText(tab), /↔ [\d\s ]+ km/);
        assert.equal(await tab.locator('[data-action="hint"]').count(), 0);
        assert.match(await appText(tab), /Nápovědy 3\/3/);
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
        assert.equal(shared, 'Mudrlant · 🌍 Zeměpis · 16. 10. 2026\n✅ 1 bod · nápovědy 3/3\n🔥 Série: 1\nhttps://geo.test/');

        // Po dnešní otázce nabízí další dnešní otázku z jiného tématu, nebo návrat do menu
        assert.match(await tab.textContent('[data-action="next"]'), /Další dnešní: Vlajky a znaky/);
        await tab.click('[data-action="daily-home"]');
        await waitForHome(tab);
        // Zeměpis je odehraný a série běží; tlačítko nahoře pokračuje ve zbývajících dnešních otázkách
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /1 bod\s*1/);
        assert.match(await tab.textContent('[data-action="play-daily"]'), /Pokračovat\s*· zbývá 13/);

        // Odehraná dnešní otázka zůstane uložená i po obnovení stránky
        const requestsBefore = log.wiki.length;
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForResult(tab);
        assert.equal(log.wiki.length, requestsBefore, 'dnešní otázka z mezipaměti');
        // Zkušenosti: odpověď a bonus za dnešní otázku se zapíšou, na úvodu je úroveň a okno Můj postup
        const gained = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')).xp);
        assert.ok(gained >= 15, `XP za dnešní otázku (${gained})`);
        assert.match(await tab.textContent('[data-verdict]'), new RegExp(`\\+${gained} XP`));
        assert.ok(await tab.evaluate(() => 'prvni-krok' in JSON.parse(localStorage.getItem('mudrlant.progress')).badges), 'odznak První krok');
        assert.match(await tab.textContent('[data-verdict]'), /První krok/);
        // Po obnovení stránky (třeba po aktualizaci) se zodpovězená otázka znovu neukazuje: začíná se na úvodní stránce
        await tab.reload();
        await waitForHome(tab);
        assert.equal(await tab.locator('h1').count(), 0);
        await tab.click('#status-badge');
        await tab.waitForSelector('#dialog-overlay');
        assert.match(await tab.textContent('#dialog-overlay'), /Můj postup/);
        assert.match(await tab.textContent('#dialog-overlay'), /Zvědavec/);
        assert.match(await tab.textContent('#dialog-overlay'), new RegExp(`Celkem ${gained} XP`));
        assert.equal(await tab.locator('#dialog-overlay li').count(), 14 + 3, 'mistrovství všech témat a tři nejbližší odznaky');
        assert.match(await tab.textContent('#dialog-overlay'), /Všechny odznaky\s*1 \/ \d{3}/);
        // Okno se všemi odznaky: skupiny se stupni, klepnutím na medaili podrobnosti
        await tab.click('[data-open-badges]');
        await tab.waitForSelector('[data-badge="prvni-krok"]');
        assert.ok(await tab.locator('[data-badge]').count() >= 120, 'všechny odznaky');
        await tab.click('[data-badge="stovka"]');
        assert.match(await tab.textContent('#dialog-overlay'), /100 správných odpovědí\./);
        await tab.keyboard.press('Escape');
        // Výsledek u dnešní otázky je vidět celý (ne zkrácený na „4 bod…“)
        const cut = await tab.evaluate(() => [...document.querySelectorAll('[data-action="daily"] span.truncate')].filter(span => span.scrollWidth > span.clientWidth).map(span => span.textContent));
        assert.deepEqual(cut, []);
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
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
        await tab.click('[data-action="item-info"]:has-text("Ukaž Rakousko")');
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
        assert.deepEqual(hintKeys(data), ['visual', 'facts'], 'stát bez fotky');
        assert.doesNotMatch(await tab.textContent('p.italic'), /Švýcar|švýcar/);
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual path.fill-emerald-400');
        assert.equal(await tab.locator('#hint-visual svg circle').count(), 0);
        await tab.click('[data-action="hint"]');
        // Hlavní město i kontinent jsou vidět už v popisu („Hlavním městem je Bern… ve střední Evropě“) – nápověda je neopakuje
        const factsPane = await tab.textContent('#hint-tab-panel [role="tabpanel"]');
        assert.match(factsPane, /Rozloha\s*41\s285 km²/);
        assert.doesNotMatch(factsPane, /Bern|Evropa/);
        await tab.fill('#answer-input', 'svycarsko');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        // Dvě nápovědy z 4 bodů ubraly 2, psaná odpověď dvojnásobek
        assert.match(await appText(tab), /Správně! \+4 body/);
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
            assert.match(await appText(tab), /Nápovědy 0\/2/);
            // Bez fotky začínají nápovědy mapou, u otázky na stát fakty
            assert.match(await tab.textContent('[data-action="hint"]'), data.question.type === 'location' ? /čísla a fakta/i : /slepá mapa/i);
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
        await tab.click(`[data-action="item-info"]:has-text("Ukaž ${wrong[0].label}")`);
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
        assert.equal((await tab.textContent('[data-action="play-topic"][data-topic="zemepis"]')).trim(), 'Zeměpis', 'bez omezení kategorií jen název');

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
        assert.equal((await tab.textContent('[data-action="play-topic"][data-topic="zemepis"]')).trim(), 'Zeměpis');
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
        const allTopics = await tab.$$eval('#play-chooser [data-chooser-topic]', buttons => buttons.map(button => button.dataset.chooserTopic));
        assert.ok(allTopics.length >= 5);
        assert.equal(await tab.locator('#play-chooser [data-chooser-topic][aria-pressed="true"]').count(), allTopics.length);
        for (const topicId of allTopics.filter(id => id !== 'zemepis')) await tab.click(`#play-chooser [data-chooser-topic="${topicId}"]`);
        await tab.click('#play-chooser [data-chooser-topic="zemepis"]');
        assert.match(await tab.textContent('#chooser-note'), /Aspoň jedno téma/);
        await tab.keyboard.press('Escape');
        assert.equal(await tab.locator('#play-chooser').count(), 0, 'Escape okno zavře');
        assert.deepEqual((await readStorage(tab, 'mudrlant.settings')).topics, ['zemepis']);
        assert.equal((await tab.textContent('[data-action="play-mix"]')).trim(), 'Mix', 'v dlaždici jen název');
        assert.match(await tab.getAttribute('[data-action="play-mix"]', 'title'), /1 z \d+ témat/, 'výběr témat jako nápověda');

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
        const saved = await readStorage(tab, 'mudrlant.settings');
        assert.deepEqual({ ...saved, topics: undefined, known: undefined }, { tier: 'all', topics: undefined, known: undefined, categories: {}, seen: [] });
        assert.deepEqual(saved.topics, saved.known, 'v mixu všechna témata, nová si nastavení pamatuje');
        assert.ok(['zemepis', 'historie', 'biologie', 'chemie', 'fyzika'].every(id => saved.topics.includes(id)));
        await tab.click('#settings-overlay [data-close]');
        assert.equal(await tab.locator('#settings-overlay').count(), 0);
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4, 'u rozehrané otázky zůstanou možnosti');

        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('#answer-input').count(), 1, 'další otázka už je na psaní');

        // Zpět na možnosti jde hned (je to snazší)
        await tab.click('#btn-settings');
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
        assert.match(await tab.textContent('[data-action="daily"][data-topic="historie"]'), /čeká/);

        // Kdo to je? Časová osa s životem a vládou, popis bez jména
        await practiceCollection(tab, 'historie', 'anglicti-panovnici');
        const data = await readRound(tab);
        assert.equal(data.question.type, 'name');
        assert.equal(await tab.textContent('h2'), 'Kdo to je?');
        assert.equal(await tab.getAttribute('#answer-input', 'placeholder'), 'Napiš jméno…');
        assert.deepEqual(hintKeys(data), ['photo', 'visual', 'facts']);
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
        // Fotka ani běžná fakta století neprozradí; nápovědy jsou současníci a osa bez letopočtů, bez číslic
        assert.ok(!hintKeys(century).includes('photo'));
        assert.ok(century.hints.every(hint => hint.kind !== 'facts' || hint.extra));
        assert.ok(century.hints.flatMap(hint => hint.facts || []).every(fact => !/\d/.test(fact.value)));
        assert.ok(century.hints.filter(hint => hint.kind === 'visual').every(hint => hint.spec.blind));
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
        assert.match(await tab.textContent('[data-action="daily"][data-topic="biologie"]'), /čeká/);

        // Do kterého řádu patří? Název je vidět, řád z popisu i faktů zmizí
        await practiceCollection(tab, 'biologie', 'selmy');
        const taxon = await readRound(tab);
        assert.equal(taxon.name, 'Lev pustinný');
        assert.equal(taxon.question.type, 'taxon');
        assert.equal(await tab.textContent('h2'), 'Do kterého řádu patří?');
        assert.deepEqual(taxon.question.choices.map(choice => choice.label).sort(), ['hlodavci', 'primáti', 'sudokopytníci', 'šelmy']);
        assert.doesNotMatch(await tab.textContent('p.italic'), /šelm/i);
        assert.match(await tab.textContent('p.italic'), /Lev pustinný/);
        assert.ok(taxon.hints.flatMap(hint => hint.facts || []).every(fact => !/šelm/.test(fact.value)));
        assert.ok(!hintKeys(taxon).includes('visual'), 'mapa rozšíření řád neprozradí');
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
        assert.deepEqual(hintKeys(round), ['photo', 'visual', 'facts', 'facts-2'], 'poslední nápověda vědecký název');
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

        // Lithium → Li je vidět už v názvu, na značku se tedy neptá
        await practiceCollection(tab, 'chemie', 'alkalicke-kovy');
        const trivial = await readRound(tab);
        assert.equal(trivial.name, 'Lithium');
        assert.equal(trivial.question.type, 'name');
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        assert.match(await appText(tab), /Značka\s*Li/);
        assert.match(await appText(tab), /Protonové číslo\s*3/);

        // Jakou značku má tento prvek? Nápověda latinský název (Natrium), psaná značka platí jen přesně
        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        const symbol = await readRound(tab);
        assert.equal(symbol.name, 'Sodík');
        assert.equal(symbol.question.type, 'symbol');
        assert.equal(await tab.textContent('h2'), 'Jakou značku má tento prvek?');
        assert.match(await appText(tab), /Název: Sodík/);
        assert.deepEqual(symbol.hints.map(hint => hint.label), ['latinský název']);
        await tab.click('[data-action="hint"]');
        assert.match(await tab.textContent('#hint-tab-panel [role="tabpanel"]'), /Latinsky\s*Natrium/);
        await tab.fill('#answer-input', 'Na');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně! \+6 bodů/, 'po jedné nápovědě 3 body, psaná odpověď dvojnásobek');
        assert.match(await appText(tab), /Latinsky\s*Natrium/, 'nápověda je i mezi fakty výsledku');
        await context.close();

        // Který prvek to je? Nápověda periodická tabulka: 118 políček bez značek, hledané zvýrazněné
        const second = await setup(browser, { fixedRandom: 0.5 });
        await second.tab.goto(`${ORIGIN}/`);
        await waitForHome(second.tab);
        await practiceCollection(second.tab, 'chemie', 'alkalicke-kovy');
        const element = await readRound(second.tab);
        assert.equal(element.question.type, 'name');
        assert.equal(await second.tab.textContent('h2'), 'Který prvek to je?');
        assert.deepEqual(hintKeys(element), ['photo', 'visual', 'facts']);
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
        assert.ok(!formula.hints.flatMap(hint => hint.facts || []).some(fact => fact.label === 'Vzorec'));
        assert.ok(!hintKeys(formula).includes('visual'), 'strukturní vzorec by prozradil odpověď');
        assert.ok(formula.hints.some(hint => hint.label === 'složení'), 'nápověda: z jakých prvků látka je');
        // Vzorec napsaný obyčejnými číslicemi a malými písmeny platí (h2so4 = H₂SO₄)
        await third.tab.fill('#answer-input', formula.question.accepted[0].replace(/[₀-₉]/g, digit => '₀₁₂₃₄₅₆₇₈₉'.indexOf(digit)).toLowerCase());
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
        assert.match(await tab.textContent('[data-action="daily"][data-topic="fyzika"]'), /čeká/);

        // Jaká je jednotka SI této veličiny? Značka N platí, odpověď ukáže název i značku
        await practiceCollection(tab, 'fyzika', 'c:veliciny');
        const unit = await readRound(tab);
        assert.equal(unit.name, 'Síla');
        assert.equal(unit.question.type, 'unit');
        assert.equal(await tab.textContent('h2'), 'Jaká je jednotka SI této veličiny?');
        assert.ok(!unit.hints.flatMap(hint => hint.facts || []).some(fact => fact.label === 'Jednotka SI'));
        await tab.fill('#answer-input', 'N');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně!/);
        assert.match(await appText(tab), /Jednotka SI\s*newton \(N\)/);
        await context.close();

        // Fyzik: časová osa s milníky fyziky, „Ukaž …“ u špatné odpovědi
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
        assert.match(await appText(second.tab), new RegExp(`Ukaž ${wrong.label}`));
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
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /3 body\s*2/);
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

    await t.test('příliš chudý popis (stub z Wikipedie): otázka se vymění za jinou s dostatečným popisem', async () => {
        const { context, tab, log, flags } = await setup(browser, { wikiThinFirst: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('[data-action="daily"][data-topic="historie"]');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        assert.ok(flags.thinServed, 'stub se opravdu vrátil');
        assert.notEqual(data.title, flags.thinServed, 'chudá otázka se nezobrazí');
        assert.ok(data.questionText.replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word)).length >= 14, 'popis má dost slov');
        assert.ok(log.wiki.length >= 2, 'popis se hledal znovu');
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
        await waitForHome(tab);
        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'ikony z mezipaměti');
        assert.equal(await tab.evaluate(() => getComputedStyle(document.getElementById('app-content')).display), 'flex', 'styly z mezipaměti');
        assert.equal(await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);

        // Nová otázka v tréninku: data témat i obrysy států z mezipaměti
        await tab.click('#btn-practice');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        for (let i = 0; i < hintKeys(data).indexOf('visual') + 1; i++) await tab.click('[data-action="hint"]');
        // Mapa, osa i tabulka se vykreslí i bez sítě; obrázek z Commons ukáže zprávu, že se nenačetl
        if (hintKeys(data).includes('visual')) await tab.waitForSelector('#hint-visual svg > *, #hint-visual div[class*="bg-contain"], #hint-visual p', { state: 'attached' });
        const files = ['data/zemepis.json', 'data/historie.json', 'data/biologie.json', 'data/chemie.json', 'data/fyzika.json', 'data/world.json'];
        assert.deepEqual(await tab.evaluate(list => Promise.all(list.map(file => fetch(file).then(response => response.status))), files), files.map(() => 200));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('nová verze se do otevřené aplikace dostane sama i tlačítkem Aktualizovat', async () => {
        // Jako GitHub Pages: soubory platí v mezipaměti prohlížeče 10 minut, každé nasazení má jiný service worker a verzi
        let build = 'aaaaaaa';
        const server = http.createServer((request, response) => {
            const pathname = new URL(request.url, 'http://localhost').pathname;
            let { status, headers, body } = serveFile(pathname);
            if (pathname === '/version.json') ({ status, headers, body } = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ built: '2026-11-02T18:00:00Z', commit: build }) });
            if (pathname === '/sw.js') body = String(body).replace("const CACHE_NAME = 'mudrlant-v3';", `const CACHE_NAME = 'mudrlant-${build}';`);
            if (pathname === '/app.js') body = `${body}\nwindow.__build = '${build}';`;
            response.writeHead(status, { ...headers, 'cache-control': 'max-age=600' });
            response.end(body);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const { context, tab, log } = await setup(browser, { origin, serviceWorkers: 'allow' });
        await tab.goto(`${origin}/`);
        await waitForHome(tab);
        await tab.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        assert.equal(await tab.evaluate(() => window.__build), 'aaaaaaa');
        const versionShown = async () => {
            await tab.click('#btn-settings');
            await tab.waitForFunction(() => /·/.test(document.getElementById('app-version').textContent));
            return tab.textContent('#app-version');
        };
        assert.match(await versionShown(), /aaaaaaa/);

        // Nasazení: tlačítko Aktualizovat načte novou verzi, i když prohlížeč má staré soubory ještě 10 minut platné
        build = 'bbbbbbb';
        let loads = 0;
        tab.on('load', () => { loads++; });
        await Promise.all([tab.waitForEvent('load'), tab.click('[data-update-app]')]);
        await waitForHome(tab);
        await tab.waitForFunction(() => window.__build === 'bbbbbbb');
        await tab.waitForFunction(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated');
        await tab.waitForTimeout(500);
        assert.equal(loads, 1, 'stránka se obnoví jen jednou');
        assert.match(await versionShown(), /bbbbbbb/);

        // Další nasazení: stačí se do aplikace vrátit (z pozadí) – nový service worker stránku sám obnoví
        build = 'ccccccc';
        await tab.click('[data-close]');
        await Promise.all([tab.waitForEvent('load'), tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))]);
        await waitForHome(tab);
        await tab.waitForFunction(() => window.__build === 'ccccccc');
        assert.deepEqual(log.errors, []);
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });

    await t.test('tlačítko Zpět na mobilu vrací v aplikaci, na úvodní obrazovce ji teprve opustí', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        const guarded = () => tab.evaluate(() => Boolean(history.state && history.state.mudrlantBack));
        assert.equal(await guarded(), false, 'na úvodní obrazovce žádný krok navíc – Zpět aplikaci zavře');

        // Z otázky zpět domů
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        assert.equal(await guarded(), true);
        await tab.goBack();
        await waitForHome(tab);
        assert.equal(await guarded(), false);

        // Otevřené okno (nastavení) se zavře, obrazovka zůstane
        await tab.click('#btn-settings');
        await tab.waitForSelector('#settings-overlay');
        await tab.goBack();
        await tab.waitForSelector('#settings-overlay', { state: 'detached' });
        await waitForHome(tab);

        // Učení: o úroveň výš, pak domů
        await tab.click('#btn-learn');
        await tab.waitForSelector('[data-action="learn-topic"][data-topic="zemepis"]');
        await tab.click('[data-action="learn-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="learn-collection"]');
        await tab.goBack();
        await tab.waitForSelector('[data-action="learn-topic"][data-topic="zemepis"]');
        await tab.goBack();
        await waitForHome(tab);
        await tab.waitForFunction(() => !(history.state && history.state.mudrlantBack));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('fotka s napsanou odpovědí (jméno na dresu) se jako nápověda nenabídne', async () => {
        // Nejdřív zjistit dnešní otázku zeměpisu, pak ji označit v data/photo-text.json jako fotku s textem odpovědi
        const first = await setup(browser);
        await first.tab.goto(`${ORIGIN}/`);
        await waitForHome(first.tab);
        await first.tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(first.tab);
        const daily = await readRound(first.tab);
        assert.ok(hintKeys(daily).includes('photo'));
        await first.context.close();

        const { context, tab, log } = await setup(browser);
        await context.route('**/data/photo-text.json', route => route.fulfill({ json: { zemepis: [daily.id] } }));
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        assert.equal(data.id, daily.id);
        assert.ok(!hintKeys(data).includes('photo'), hintKeys(data).join(', '));
        assert.deepEqual(log.errors, []);
        await context.close();

        // Když je známá poloha nápisu, fotka zůstane nápovědou a nápis se rozmaže (jen před odpovědí, i ve zvětšení)
        const masked = await setup(browser);
        const file = await (async () => {
            await masked.tab.goto(`${ORIGIN}/`);
            return masked.tab.evaluate(async id => (await (await fetch('data/zemepis.json')).json()).items.find(item => item.q === id).im, daily.id);
        })();
        await masked.context.route('**/data/photo-text.json', route => route.fulfill({ json: { zemepis: [daily.id] } }));
        await masked.context.route('**/data/photo-masks.json', route => route.fulfill({ json: { [file]: [[0.1, 0.4, 0.5, 0.15]] } }));
        await masked.tab.reload();
        await waitForHome(masked.tab);
        await masked.tab.click('[data-action="daily"][data-topic="zemepis"]');
        await waitForQuestion(masked.tab);
        const round = await readRound(masked.tab);
        assert.ok(hintKeys(round).includes('photo'), hintKeys(round).join(', '));
        assert.deepEqual(round.photoMasks, [[0.1, 0.4, 0.5, 0.15]]);
        await masked.tab.click('[data-action="hint"]');
        await masked.tab.waitForSelector('#hint-photo [data-photo-mask] > div', { state: 'attached' });
        const box = await masked.tab.$eval('#hint-photo [data-photo-mask] > div', element => [element.style.left, element.style.top, element.style.width, element.style.height]);
        assert.deepEqual(box.map(value => parseFloat(value)), [10, 40, 50, 15]);
        await masked.tab.click('[data-action="give-up"]');
        await waitForResult(masked.tab);
        assert.equal(await masked.tab.locator('#result-photo [data-photo-mask]').count(), 0, 'po odpovědi celá fotka');
        assert.deepEqual(masked.log.errors, []);
        await masked.context.close();
    });

    await t.test('úvod: přihlášení přes Google, méně výrazně hraní bez přihlášení; přihlášený ani bez nastavení ho nevidí', async () => {
        const configure = async (context) => {
            await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
            await context.route('https://proj.supabase.co/**', route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/auth/v1/user') return route.fulfill({ json: { id: 'u-1', email: 'jana@example.com', user_metadata: { full_name: 'Jana Nováková' } } });
                if (url.pathname === '/auth/v1/authorize') return route.fulfill({ contentType: 'text/html', body: '<title>Google</title>' });
                return route.fulfill({ json: [] });
            });
        };
        // První spuštění: sova, hlavní tlačítko Google a pod ním odkaz bez přihlášení
        const fresh = await setup(browser, { account: null, variant: null });
        await configure(fresh.context);
        await fresh.tab.goto(`${ORIGIN}/`);
        await fresh.tab.waitForSelector('#account-welcome');
        assert.equal(await fresh.tab.locator('#account-welcome img[src="icons/topics/sova-vitej.webp"]').count(), 1);
        assert.match(await fresh.tab.textContent('#account-welcome [data-action="auth-login"]'), /Přihlásit se přes Google/);
        assert.match(await fresh.tab.textContent('#account-welcome [data-action="play-as-host"]'), /Pokračovat bez přihlášení/);
        await Promise.all([fresh.tab.waitForURL(/proj\.supabase\.co\/auth\/v1\/authorize/), fresh.tab.click('#account-welcome [data-action="auth-login"]')]);
        assert.equal(new URL(fresh.tab.url()).searchParams.get('provider'), 'google');
        await fresh.context.close();

        // Bez přihlášení: dál k výběru varianty, volba se pamatuje
        const host = await setup(browser, { account: null, variant: null });
        await configure(host.context);
        await host.tab.goto(`${ORIGIN}/`);
        await host.tab.click('#account-welcome [data-action="play-as-host"]');
        await host.tab.waitForSelector('#variant-welcome');
        await host.tab.click('#variant-welcome [data-variant="choices"]');
        await waitForHome(host.tab);
        await host.tab.reload();
        await waitForHome(host.tab);
        assert.equal(await host.tab.locator('#account-welcome').count(), 0);
        assert.deepEqual(host.log.errors, []);
        await host.context.close();

        // Návrat z Googlu: úvod se přeskočí rovnou na variantu
        const back = await setup(browser, { account: null, variant: null });
        await configure(back.context);
        await back.tab.goto(`${ORIGIN}/#access_token=tok-1&refresh_token=ref-1&expires_in=3600&token_type=bearer`);
        await back.tab.waitForSelector('#variant-welcome');
        assert.equal(await back.tab.locator('#account-welcome').count(), 0);
        await back.context.close();

        // Hráč, který už hraje a není přihlášený, úvod uvidí jednou; bez nastaveného Supabase nikdy
        const existing = await setup(browser, { account: null });
        await configure(existing.context);
        await existing.tab.goto(`${ORIGIN}/`);
        await existing.tab.waitForSelector('#account-welcome');
        await existing.tab.click('[data-action="play-as-host"]');
        await waitForHome(existing.tab);
        await existing.context.close();
        const plain = await setup(browser, { account: null });
        await plain.context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
        await plain.tab.goto(`${ORIGIN}/`);
        await waitForHome(plain.tab);
        assert.equal(await plain.tab.locator('#account-welcome').count(), 0);
        await plain.context.close();
    });

    await t.test('účet: bez nastavení se nic neukáže, s nastavením přihlášení Google, návrat s tokeny, odhlášení', async () => {
        // Bez nastavení (prázdný config.js) část Účet v Nastavení není
        const plain = await setup(browser);
        await plain.context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
        await plain.tab.goto(`${ORIGIN}/`);
        await waitForHome(plain.tab);
        await plain.tab.click('#btn-settings');
        await plain.tab.waitForSelector('#settings-overlay');
        assert.equal(await plain.tab.locator('[data-auth-login], [data-auth-logout]').count(), 0);
        await plain.context.close();

        const calls = [];
        const configure = async (context) => {
            await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
            await context.route('https://proj.supabase.co/**', route => {
                const url = new URL(route.request().url());
                calls.push(`${route.request().method()} ${url.pathname}${url.search}`);
                if (url.pathname === '/auth/v1/user') {
                    return route.fulfill({ json: route.request().headers().authorization === 'Bearer tok-1' ? { id: 'u-1', email: 'jana@example.com', user_metadata: { full_name: 'Jana Nováková' } } : {} , status: route.request().headers().authorization === 'Bearer tok-1' ? 200 : 401 });
                }
                if (url.pathname === '/auth/v1/authorize') return route.fulfill({ contentType: 'text/html', body: '<title>Google</title>' });
                return route.fulfill({ json: {} });
            });
        };

        // S nastavením: tlačítko Přihlásit míří na Supabase s Googlem a návratem na tuto stránku
        const first = await setup(browser);
        await configure(first.context);
        await first.tab.goto(`${ORIGIN}/`);
        await waitForHome(first.tab);
        await first.tab.click('#btn-settings');
        await first.tab.waitForSelector('[data-auth-login]');
        assert.equal(await first.tab.locator('[data-auth-logout]').count(), 0);
        await Promise.all([first.tab.waitForURL(/proj\.supabase\.co\/auth\/v1\/authorize/), first.tab.click('[data-auth-login]')]);
        const target = new URL(first.tab.url());
        assert.equal(target.searchParams.get('provider'), 'google');
        assert.equal(target.searchParams.get('redirect_to'), `${ORIGIN}/`);
        await first.context.close();

        // Návrat z přihlášení: tokeny v #hash se uloží, z adresy zmizí a v Nastavení je jméno i odhlášení
        const back = await setup(browser);
        await configure(back.context);
        await back.tab.goto(`${ORIGIN}/#access_token=tok-1&refresh_token=ref-1&expires_in=3600&token_type=bearer`);
        await waitForHome(back.tab);
        await back.tab.waitForFunction(() => !location.hash);
        await back.tab.click('#btn-settings');
        await back.tab.waitForSelector('[data-me-tab="profile"]');
        assert.equal(await back.tab.locator('[data-auth-logout]').count(), 0, 'odhlášení je až v záložce Profil');
        await back.tab.click('[data-me-tab="profile"]');
        await back.tab.waitForSelector('[data-auth-logout]');
        assert.match(await back.tab.textContent('#settings-overlay'), /Jana Nováková/);
        assert.match(await back.tab.textContent('#settings-overlay'), /jana@example\.com/);
        assert.ok(calls.some(call => call.startsWith('GET /auth/v1/user')));
        // Po obnovení stránky zůstane přihlášený
        await back.tab.reload();
        await waitForHome(back.tab);
        await back.tab.click('#btn-settings');
        await back.tab.click('[data-me-tab="profile"]');
        await back.tab.waitForSelector('[data-auth-logout]');
        assert.equal(await back.tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.auth')).user.id), 'u-1');
        // Odhlášení smaže uložený účet a zavolá Supabase
        await back.tab.click('[data-auth-logout]');
        await back.tab.waitForSelector('#settings-overlay', { state: 'detached' });
        await back.tab.click('#btn-settings');
        await back.tab.waitForSelector('[data-auth-login]');
        assert.equal(await back.tab.evaluate(() => localStorage.getItem('mudrlant.auth')), null);
        assert.ok(calls.some(call => call.startsWith('POST /auth/v1/logout')));
        assert.deepEqual(back.log.errors, []);
        await back.context.close();

        // Chyba z přihlášení (zrušil na Googlu) se ukáže a nic se neuloží
        const failed = await setup(browser);
        await configure(failed.context);
        await failed.tab.goto(`${ORIGIN}/#error=access_denied&error_description=Přihlášení+zrušeno`);
        await waitForHome(failed.tab);
        await failed.tab.click('#btn-settings');
        await failed.tab.waitForSelector('[data-auth-login]');
        assert.match(await failed.tab.textContent('#settings-overlay'), /Přihlášení zrušeno/);
        assert.equal(await failed.tab.evaluate(() => localStorage.getItem('mudrlant.auth')), null);
        await failed.context.close();
    });

    await t.test('profil a výzvy: přezdívka a obrázek v záhlaví, výzva hráči podle přezdívky, náhodný soupeř, příchozí výzva, žebříček', async () => {
        // Falešný Supabase v paměti: profily, výzvy a výsledky; každý hráč má svůj token
        const db = { profiles: {}, challenges: {}, results: [] };
        const users = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
        const profileOf = (id) => db.profiles[id] || (db.profiles[id] = { id, display_name: Object.values(users).find(user => user.id === id).name, avatar: '🦊', color: 'emerald' });
        profileOf('u-1');
        profileOf('u-2');
        const backend = async (context) => {
            await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
            await context.route('https://proj.supabase.co/**', route => {
                const request = route.request();
                const url = new URL(request.url());
                const me = users[(request.headers().authorization || '').replace('Bearer ', '')];
                const json = (body, status = 200) => route.fulfill({ status, json: body });
                if (url.pathname.startsWith('/auth/')) return json({});
                if (!me) return json({ message: 'no token' }, 401);
                const param = (key) => url.searchParams.get(key) || '';
                const eq = (key) => param(key).replace(/^eq\./, '');
                const body = request.postData() ? JSON.parse(request.postData()) : null;
                const resultRow = (row) => ({ ...row, player: profileOf(row.user_id) });
                const challengeRow = (c) => ({ ...c, creator: profileOf(c.creator_id), invited: c.invited_id ? profileOf(c.invited_id) : null });
                if (url.pathname === '/rest/v1/rpc/random_opponent') return json(Object.values(db.profiles).filter(profile => profile.id !== me.id).slice(0, 1));
                if (url.pathname === '/rest/v1/profiles') {
                    if (request.method() === 'PATCH') {
                        if (body.display_name && Object.values(db.profiles).some(profile => profile.id !== eq('id') && profile.display_name.toLowerCase() === body.display_name.toLowerCase())) return json({ code: '23505' }, 409);
                        Object.assign(profileOf(eq('id')), body);
                        return json([profileOf(eq('id'))]);
                    }
                    if (param('display_name').startsWith('ilike.')) {
                        const term = param('display_name').slice(6).replace(/\*/g, '').toLowerCase();
                        return json(Object.values(db.profiles).filter(profile => profile.id !== me.id && profile.display_name.toLowerCase().includes(term)));
                    }
                    return json([profileOf(eq('id'))]);
                }
                if (url.pathname === '/rest/v1/challenges') {
                    if (request.method() === 'POST') {
                        if (db.challenges[body.id]) return json({}, 409);
                        db.challenges[body.id] = { ...body, created_at: `2026-11-03T10:0${Object.keys(db.challenges).length}:00Z` };
                        return json([db.challenges[body.id]], 201);
                    }
                    if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(challengeRow));
                    if (param('id').startsWith('in.')) return json(param('id').slice(4, -1).split(',').map(id => db.challenges[id]).filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 1));
                    const found = db.challenges[eq('id')];
                    return json(found ? [challengeRow(found)] : []);
                }
                if (url.pathname === '/rest/v1/challenge_results') {
                    if (request.method() === 'POST') {
                        if (!db.results.some(row => row.challenge_id === body.challenge_id && row.user_id === body.user_id)) db.results.push({ ...body, finished_at: `2026-11-03T10:0${db.results.length}:00Z` });
                        return route.fulfill({ status: 201, body: '' });
                    }
                    if (param('challenge_id').startsWith('in.') && param('user_id').startsWith('eq.')) {
                        const ids = param('challenge_id').slice(4, -1).split(',');
                        return json(db.results.filter(row => row.user_id === eq('user_id') && ids.includes(row.challenge_id)));
                    }
                    if (param('user_id').startsWith('eq.')) return json(db.results.filter(row => row.user_id === eq('user_id')).map(row => ({ ...row, challenge: challengeRow(db.challenges[row.challenge_id]) })));
                    if (param('challenge_id').startsWith('in.')) {
                        const ids = param('challenge_id').slice(4, -1).split(',');
                        return json(db.results.filter(row => ids.includes(row.challenge_id) && row.user_id !== param('user_id').replace('neq.', '')).map(resultRow));
                    }
                    return json(db.results.filter(row => row.challenge_id === eq('challenge_id')).map(resultRow));
                }
                return json({});
            });
        };
        const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: users[token].id, email: 'x@example.com', name: users[token].name } }) });

        // Hráčka 1: profil v záhlaví, obsazená přezdívka, úprava profilu
        const one = await setup(browser, { storage: login('tok-u1') });
        await backend(one.context);
        await one.tab.goto(`${ORIGIN}/`);
        await waitForHome(one.tab);
        // Úvodní stránka má přepínač Jeden hráč / Více hráčů; výzvy jsou ve Více hráčů a volba se pamatuje
        assert.equal(await one.tab.locator('[data-action="home-tab"][aria-selected="true"]').getAttribute('data-tab'), 'single');
        assert.equal(await one.tab.locator('#challenges-section').count(), 0, 'výzvy jsou až v druhé záložce');
        await one.tab.click('[data-action="home-tab"][data-tab="multi"]');
        await one.tab.waitForSelector('#challenges-section [data-action="new-challenge"]');
        assert.equal(await one.tab.locator('[data-action="daily"]').count(), 0, 'dnešní otázky jsou v záložce Jeden hráč');
        await one.tab.waitForSelector('#btn-settings span');
        assert.match(await one.tab.getAttribute('#btn-settings', 'aria-label'), /Jana Nováková/);
        assert.equal(await one.tab.locator('#btn-profile').count(), 0, 'nastavení a profil jsou jedno tlačítko');
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="profile"]');
        await one.tab.waitForSelector('#profile-name');
        // Okno se vejde bez posouvání
        assert.equal(await one.tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        await one.tab.fill('#profile-name', 'petr svoboda');
        await one.tab.click('[data-save-profile]');
        await one.tab.waitForFunction(() => /už má jiný hráč/.test(document.getElementById('settings-overlay').textContent));
        await one.tab.fill('#profile-name', 'J');
        await one.tab.click('[data-save-profile]');
        await one.tab.waitForFunction(() => /2 až 24 znaků/.test(document.getElementById('settings-overlay').textContent));
        await one.tab.fill('#profile-name', 'Janička');
        await one.tab.click('[data-pick-avatar="🐼"]');
        await one.tab.click('[data-pick-color="sky"]');
        assert.equal(await one.tab.inputValue('#profile-name'), 'Janička', 'přezdívka zůstane po výběru obrázku');
        await one.tab.click('[data-save-profile]');
        await one.tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.deepEqual([db.profiles['u-1'].display_name, db.profiles['u-1'].avatar, db.profiles['u-1'].color], ['Janička', '🐼', 'sky']);
        await one.tab.click('#settings-overlay [data-close]');
        await one.tab.waitForFunction(() => document.getElementById('btn-settings').textContent.includes('🐼'));

        // Výzva konkrétnímu hráči: hledání podle přezdívky (Petr), téma zeměpis, 5 otázek
        await one.tab.click('#challenges-section [data-action="new-challenge"]');
        await one.tab.click('[data-ch-who="player"]');
        await one.tab.click('[data-ch-create]');
        await one.tab.waitForFunction(() => /Vyber hráče/.test(document.getElementById('dialog-overlay').textContent));
        await one.tab.fill('#opp-search', 'pet');
        await one.tab.waitForSelector('[data-pick-opp="u-2"]');
        assert.equal(await one.tab.locator('[data-pick-opp]').count(), 1, 'sama sebe nenajde');
        await one.tab.click('[data-pick-opp="u-2"]');
        // Téma je souhrnný řádek (výchozí: všechna témata), rozbalí se klepnutím; počet otázek je vždy vidět
        assert.match(await one.tab.textContent('[data-ch-open="topics"]'), /Všechna témata/);
        await one.tab.click('[data-ch-open="topics"]');
        await one.tab.click('[data-ch-topic="zemepis"]');
        await one.tab.click('[data-ch-count="5"]');
        await one.tab.click('[data-ch-create]');
        await waitForQuestion(one.tab);
        const [code] = Object.keys(db.challenges);
        assert.match(code, /^[A-Z0-9]{6}$/);
        assert.deepEqual([db.challenges[code].topic, db.challenges[code].count, db.challenges[code].creator_id, db.challenges[code].invited_id], ['zemepis', 5, 'u-1', 'u-2']);
        assert.equal(await one.tab.textContent('#status-text'), 'Výzva · 1/5');
        const firstId = (await readRound(one.tab)).id;
        for (let i = 0; i < 5; i++) {
            await one.tab.click('[data-action="give-up"]');
            await waitForResult(one.tab);
            assert.match(await one.tab.textContent('[data-action="next"]'), i < 4 ? new RegExp(`Další otázka \\(${i + 2}/5\\)`) : /Dokončit výzvu/);
            await one.tab.click('[data-action="next"]');
            if (i < 4) await waitForQuestion(one.tab);
        }
        await one.tab.waitForSelector('[data-action="challenge-home"]');
        assert.match(await one.tab.textContent('#app-content'), /0\/5/);
        assert.match(await one.tab.textContent('#app-content'), /Petr Svoboda/);
        assert.deepEqual(db.results.map(row => [row.challenge_id, row.user_id, row.correct]), [[code, 'u-1', 0]]);
        // Odznaky a úroveň se uloží i do účtu (viditelné ostatním)
        for (let i = 0; i < 50 && !(db.profiles['u-1'].badges || []).includes('soupere'); i++) await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(db.profiles['u-1'].badges.includes('soupere') && db.profiles['u-1'].badges.includes('zalozene-1'), `odznaky v účtu (nejvyšší stupně): ${db.profiles['u-1'].badges}`);
        assert.equal(typeof db.profiles['u-1'].xp, 'number');
        assert.equal(Object.keys(JSON.parse(await one.tab.evaluate(() => localStorage.getItem('mudrlant.stats'))).daily).length, 0, 'výzva se nepočítá do dnešních otázek');
        // Tlačítko Zpět z výsledku výzvy vede domů
        await one.tab.goBack();
        await waitForHome(one.tab);
        await one.tab.waitForFunction(() => document.querySelector('#challenges-section').textContent.includes('Zeměpis'));

        // Nastavení výzvy: Vlajky, jen okruh vlajek států, i těžší otázky, psaní odpovědí – hraje se přesně podle něj
        await one.tab.click('#challenges-section [data-action="new-challenge"]');
        await one.tab.click('[data-ch-who="anyone"]');
        await one.tab.click('[data-ch-open="topics"]');
        await one.tab.click('[data-ch-topic="vlajky"]');
        for (const key of ['znak', 'uzemi', 'cesko']) await one.tab.click(`[data-ch-cat="${key}"]`);
        assert.equal(await one.tab.locator('[data-ch-cat][aria-pressed="true"]').count(), 1);
        await one.tab.click('[data-ch-cat="vlajka"]');
        assert.equal(await one.tab.locator('[data-ch-cat][aria-pressed="true"]').count(), 1, 'poslední okruh nejde zrušit');
        await one.tab.click('[data-ch-open="settings"]');
        await one.tab.click('[data-ch-hard="yes"]');
        await one.tab.click('[data-ch-variant="typed"]');
        assert.match(await one.tab.textContent('[data-ch-open="settings"]'), /I těžší · Psaní/);
        await one.tab.click('[data-ch-count="5"]');
        await one.tab.click('[data-ch-create]');
        await waitForQuestion(one.tab);
        const custom = Object.values(db.challenges).find(c => c.topic === 'vlajky');
        assert.deepEqual([custom.categories, custom.include_hard, custom.variant, custom.invited_id], [['vlajka'], true, 'typed', null]);
        const customRound = await one.tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')));
        assert.equal(customRound.data.category, 'vlajka', 'jen vybraný okruh');
        assert.equal(customRound.round.variant, 'typed', 'pevný způsob odpovídání výzvy');
        await one.tab.click('#btn-home');
        await waitForHome(one.tab);

        // Víc témat najednou; klepání na témata nehází okno nahoru
        await one.tab.click('#challenges-section [data-action="new-challenge"]');
        await one.tab.click('[data-ch-who="anyone"]');
        await one.tab.click('[data-ch-open="topics"]');
        await one.tab.click('[data-ch-topic="zemepis"]');
        await one.tab.click('[data-ch-topic="historie"]');
        assert.match(await one.tab.textContent('[data-ch-open="topics"]'), /Zeměpis \+ Historie/);
        await one.tab.evaluate(() => { document.querySelector('#dialog-overlay > div').scrollTop = 120; });
        await one.tab.click('[data-ch-topic="biologie"]');
        assert.ok(await one.tab.evaluate(() => document.querySelector('#dialog-overlay > div').scrollTop) >= 100, 'okno po klepnutí zůstane, kde bylo');
        await one.tab.click('[data-ch-topic="biologie"]');
        await one.tab.click('[data-ch-count="5"]');
        await one.tab.click('[data-ch-create]');
        await waitForQuestion(one.tab);
        const multi = Object.values(db.challenges).find(c => c.topic.includes(','));
        assert.equal(multi.topic, 'zemepis,historie');
        assert.ok(['zemepis', 'historie'].includes((await readRound(one.tab)).topic));
        await one.tab.click('#btn-home');
        await waitForHome(one.tab);

        // Náhodný soupeř: vybere se jiný hráč (tady jediný další, Petr)
        await one.tab.click('#challenges-section [data-action="new-challenge"]');
        await one.tab.click('[data-ch-who="random"]');
        await one.tab.click('[data-ch-count="5"]');
        await one.tab.click('[data-ch-create]');
        await waitForQuestion(one.tab);
        assert.equal(Object.values(db.challenges).find(c => c.topic === 'mix').invited_id, 'u-2');
        assert.deepEqual(one.log.errors, []);
        await one.context.close();

        // Hráč 2: výzva se mu ukáže na úvodní stránce, otevře ji a zahraje stejné otázky
        const two = await setup(browser, { storage: login('tok-u2') });
        await backend(two.context);
        await two.tab.goto(`${ORIGIN}/`);
        await waitForHome(two.tab);
        // Čekající výzva je vidět už na záložce Více hráčů jako číslo
        await two.tab.waitForFunction(() => /Více hráčů\s*2/.test(document.getElementById('home-tabs').textContent));
        await two.tab.click('[data-action="home-tab"][data-tab="multi"]');
        await two.tab.waitForSelector(`#challenges-section [data-action="challenge-open"][data-code="${code}"]`);
        assert.match(await two.tab.textContent('#challenges-section'), /Janička tě vyzývá/);
        assert.match(await two.tab.textContent('#challenges-section'), /Čekají na tebe/);
        await two.tab.click(`#challenges-section [data-action="challenge-open"][data-code="${code}"]`);
        await two.tab.waitForSelector('#dialog-overlay [data-ch-play]');
        assert.match(await two.tab.textContent('#dialog-overlay'), /Janička tě vyzývá/);
        assert.match(await two.tab.textContent('#dialog-overlay'), /0\/5/);
        await two.tab.click('[data-ch-play]');
        await waitForQuestion(two.tab);
        assert.equal((await readRound(two.tab)).id, firstId, 'stejná první otázka jako u soupeře');
        assert.equal(await two.tab.textContent('#status-text'), 'Výzva · 1/5');

        // Klepnutí na obrázek soupeře otevře jeho profil, odtud jde vyzvat k odvetě se stejným nastavením
        db.results.push({ challenge_id: code, user_id: 'u-2', correct: 3, points: 7, finished_at: '2026-11-03T11:00:00Z' });
        await two.tab.click('#btn-home');
        await waitForHome(two.tab);
        await two.tab.click('[data-action="home-tab"][data-tab="multi"]');
        await two.tab.click(`#challenges-section [data-action="challenge-open"][data-code="${code}"]`);
        await two.tab.waitForSelector('#dialog-overlay [data-player-id="u-1"]');
        await two.tab.click('#dialog-overlay [data-player-id="u-1"]');
        await two.tab.waitForSelector('#dialog-overlay [data-rematch]');
        const profileText = await two.tab.textContent('#dialog-overlay');
        assert.match(profileText, /Janička/);
        assert.match(profileText, /Vaše bilance/);
        assert.match(profileText, /1\s*výher/);
        assert.match(profileText, /Vyzvat k odvetě/);
        assert.match(profileText, /Zeměpis · 5 otázek/);
        const before = Object.keys(db.challenges).length;
        await two.tab.click('[data-rematch]');
        await waitForQuestion(two.tab);
        const rematch = Object.values(db.challenges).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        assert.equal(Object.keys(db.challenges).length, before + 1);
        assert.deepEqual([rematch.creator_id, rematch.invited_id, rematch.topic, rematch.count], ['u-2', 'u-1', 'zemepis', 5]);
        assert.equal(await two.tab.textContent('#status-text'), 'Výzva · 1/5');
        assert.deepEqual(two.log.errors, []);
        await two.context.close();

        // Odkaz s kódem otevře výzvu; bez přihlášení se kód uloží a nabídne se přihlášení
        const guest = await setup(browser);
        await backend(guest.context);
        await guest.tab.goto(`${ORIGIN}/?vyzva=${code}`);
        await guest.tab.waitForSelector('[data-auth-login-dialog]');
        assert.equal(await guest.tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.pendingChallenge'))), code);
        assert.equal(new URL(guest.tab.url()).search, '', 'kód zmizí z adresy');
        await guest.context.close();
    });

    await t.test('dvě obrazové nápovědy (mapa a vlajka u státního znaku): každá karta ukáže svůj obrázek', async () => {
        const hint = (extra) => ({ icon: 'map', ...extra });
        const data = {
            topic: 'vlajky', id: 'Q222', title: 'Albánie', name: 'Albánie', category: 'znak', known: true, typeLabel: 'státní znak',
            question: { type: 'name', title: 'Čí je to státní znak?', showName: false, choices: [{ id: 'a', label: 'Albánie', correct: true }, { id: 'b', label: 'Rusko' }, { id: 'c', label: 'Polsko' }, { id: 'd', label: 'Slovensko' }], accepted: ['Albánie'], placeholder: '', answerLabel: 'Albánie' },
            questionText: 'Státní znak [***] je černý dvouhlavý orel.', photoUrl: null, questionImage: null, visual: null, resultVisual: null, resultFacts: [],
            hints: [
                hint({ key: 'visual', kind: 'visual', label: 'slepá mapa', spec: { type: 'map', lat: 41, lon: 20, span: 14, highlightIso: '008', label: 'Stát je uprostřed' } }),
                hint({ key: 'visual-2', kind: 'visual', label: 'vlajka', icon: 'flag', spec: { type: 'image', file: 'Flag of Albania.svg', hash: '36', name: 'vlajka', icon: 'flag' } })
            ],
            subtitle: '', coords: null, isCzech: false, description: '', funFacts: []
        };
        const session = { version: 8, data, round: { hintLevel: 3, variant: 'choices', answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false, tab: 'visual' }, mode: 'practice', pool: { kind: 'topic', topic: 'vlajky' }, challenge: null, timestamp: Date.now() };
        const { context, tab, log } = await setup(browser, { storage: { 'mudrlant.session': JSON.stringify(session) } });
        await tab.goto(`${ORIGIN}/#obnovit`);
        await waitForQuestion(tab);
        await tab.waitForSelector('#hint-visual svg path');
        // Karta Vlajka: vlastní prvek s obrázkem vlajky, ne mapa
        await tab.click('[data-action="hint-tab"][data-step="visual-2"]');
        await tab.waitForFunction(() => { const picture = document.querySelector('#hint-visual-2 > div'); return picture && picture.style.backgroundImage.includes('Flag_of_Albania'); });
        assert.equal(await tab.locator('#hint-visual-2 svg').count(), 0, 've vlajce není mapa');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('tmavý režim', async () => {
        const { context, tab, log } = await setup(browser, { colorScheme: 'dark' });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        const background = await tab.evaluate(() => getComputedStyle(document.getElementById('app-content')).backgroundColor);
        assert.equal(background, 'rgb(33, 35, 38)', 'grafitové pozadí podle loga');
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
