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
// první položka a u zeměpisu otázka na stát, kde jde), wikiDown, wikiHangs, dataDown, fakeTimers, colorScheme, origin + serviceWorkers
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
    if (options.fixedRandom) await context.addInitScript(() => { Math.random = () => 0.1; });
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
const waitForQuestion = (tab) => tab.waitForSelector('text=Tvoje odpověď', { timeout: 30000 });
const waitForResult = (tab) => tab.waitForSelector('h1', { timeout: 30000 });
// Rozehraná otázka z uloženého stavu – podle ní test ví, co je správná odpověď
const readRound = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
const readStorage = (tab, key) => tab.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
const appText = (tab) => tab.textContent('#app-content');
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
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /Zeměpis\s*Čeká na tebe/);
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
        assert.match(await appText(tab), /Teď za ni získáš 4 body/);

        // 1. nápověda: skutečná fotka jako pozadí prvku (ne <img>)
        await tab.click('[data-action="hint"]');
        await tab.waitForFunction(() => document.getElementById('hint-photo').style.backgroundImage.includes('upload.wikimedia.org/wikipedia/commons/thumb/a/ab/'));
        assert.match(await appText(tab), /Nápověda 2\/4/);
        assert.equal(await tab.locator('#app-content section img').count(), 0);

        // 2. nápověda: slepá mapa bez popisků s obrysy států
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual svg path');
        assert.ok(await tab.locator('#hint-visual svg path').count() >= 3, 'obrysy okolních států');
        assert.equal(await tab.locator('#hint-visual svg text').count(), 0, 'žádné popisky');
        assert.match(await appText(tab), /↔ [\d\s ]+ km/);

        // 3. nápověda: čísla a fakta, další už není
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('text=Čísla a fakta');
        assert.equal(await tab.locator('[data-action="hint"]').count(), 0);
        assert.match(await appText(tab), /Nápověda 4\/4/);

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
        await tab.waitForFunction(() => document.querySelectorAll('#map-tiles img').length > 0);
        assert.ok(log.tiles > 0, 'mapa načetla dlaždice');

        await tab.click('[data-action="share"]');
        await tab.waitForSelector('#toast:not(.opacity-0)');
        const shared = await tab.evaluate(() => navigator.clipboard.readText());
        assert.equal(shared, 'Mudrlant · 🌍 Zeměpis · 16. 10. 2026\n✅ 1 bod · nápověda 4/4\n🔥 Série: 1\nhttps://geo.test/');

        // Zpět na dnešní otázky: zeměpis je odehraný a série běží
        await tab.click('[data-action="next"]');
        await waitForHome(tab);
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /Správně · 1 bod\s*1/);

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
        assert.match(await appText(tab), /Teď za ni získáš 8 bodů/);

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
            assert.match(await tab.textContent('[data-action="hint"]'), /slepá mapa/);
            await tab.click('[data-action="give-up"]');
            await waitForResult(tab);
        }
        assert.ok(!log.photos.some(file => file.includes('Flag_of')), 'vlajka se ani nestahuje');
        assert.ok(log.photos.some(file => file.includes('Chybejici')));
        // Ve výsledku místo fotky satelitní snímek okolí
        await tab.waitForFunction(() => document.querySelectorAll('#result-visual img').length > 0);
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

    await t.test('trénink: tlačítko vrátí rozehranou otázku, jinak nová ze zapnutých témat', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('#btn-practice');
        await waitForQuestion(tab);
        assert.match(await tab.textContent('#status-text'), /^Trénink · 0 bodů/);
        const practice = await readRound(tab);
        await tab.click('#btn-learn');
        await tab.waitForSelector('[data-action="learn-topic"]');
        await tab.click('#btn-practice');
        await waitForQuestion(tab);
        assert.equal((await readRound(tab)).id, practice.id, 'rozehraná otázka zůstala');
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        assert.match(await tab.textContent('[data-action="next"]'), /Další otázka/);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('nastavení: varianta hry, známost a témata v tréninku', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('#btn-practice');
        await waitForQuestion(tab);

        await tab.click('#btn-settings');
        await tab.click('#settings-overlay [data-variant="typed"]');
        assert.match(await tab.textContent('#settings-note'), /od další otázky/);
        assert.equal(await tab.getAttribute('#settings-overlay [data-tier="known"]', 'aria-pressed'), 'true');
        await tab.click('#settings-overlay [data-tier="all"]');
        assert.deepEqual(await readStorage(tab, 'mudrlant.settings'), { tier: 'all', topics: ['zemepis'] });
        // Jediné téma vypnout nejde
        await tab.click('#settings-overlay [data-topic-toggle="zemepis"]');
        assert.match(await tab.textContent('#settings-note'), /Aspoň jedno téma/);
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

        // Známost i méně známé: v učení se kategorie počítají celé
        await openCollection(tab, 'zemepis', 'c:hora');
        assert.match(await appText(tab), /4 položek/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
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
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /Správně · 3 body\s*2/);
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
        for (let i = 0; i < 10 && !(await tab.isVisible('text=Tvoje odpověď')); i++) {
            await tab.clock.runFor(10000);
            await tab.waitForTimeout(100);
        }
        assert.ok(await tab.isVisible('text=Tvoje odpověď'));
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

        // Nová otázka v tréninku: data tématu i obrysy států z mezipaměti
        await tab.click('#btn-practice');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        for (let i = 0; i < data.hints.indexOf('visual') + 1; i++) await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual svg path');
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
