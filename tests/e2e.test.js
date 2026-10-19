// Test celé aplikace v prohlížeči s malou testovací sadou míst a podvrženou Wikipedií.
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
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Testovací sada míst ve formátu data/places.json. Známá místa mají fotku i fakta (dnešní místo má tedy 4 úrovně),
// ostrovy jsou méně známé a slouží k testu míst bez fotky.
const place = (q, n, c, k, co, extra = {}) => ({ q, t: n, n, c, k, la: 47, lo: 8, ty: '', d: `${c} v testovacím světě`, co, im: `${n}_z_jihu.jpg`, ih: 'ab', f: {}, ...extra });
const DATASET = {
    generated: '2026-10-19',
    countries: {
        Q39: { name: 'Švýcarsko', continent: 'EU', iso: '756' },
        Q40: { name: 'Rakousko', continent: 'EU', iso: '040' },
        Q183: { name: 'Německo', continent: 'EU', iso: '276' },
        Q142: { name: 'Francie', continent: 'EU', iso: '250' },
        Q38: { name: 'Itálie', continent: 'EU', iso: '380' },
        Q213: { name: 'Česko', continent: 'EU', iso: '203' },
        Q17: { name: 'Japonsko', continent: 'AS', iso: '392' }
    },
    places: [
        place('Q39', 'Švýcarsko', 'stat', 1, ['Q39'], { im: undefined, la: 46.8, lo: 8.2, f: { cap: 'Bern', area: 41285, pop: 8700000 } }),
        place('Q40', 'Rakousko', 'stat', 1, ['Q40'], { im: undefined, la: 47.6, lo: 14.1, f: { cap: 'Vídeň', area: 83879 } }),
        place('Q183', 'Německo', 'stat', 1, ['Q183'], { im: undefined, la: 51, lo: 10, f: { cap: 'Berlín', area: 357588 } }),
        place('Q142', 'Francie', 'stat', 1, ['Q142'], { im: undefined, la: 46, lo: 2, f: { cap: 'Paříž', area: 551695 } }),
        place('Q5000', 'Testov', 'mesto', 1, ['Q213'], { ty: 'město', la: 50, lo: 15, f: { pop: 120000 } }),
        place('Q64', 'Berlín', 'mesto', 1, ['Q183'], { la: 52.5, lo: 13.4, f: { pop: 3700000 } }),
        place('Q1741', 'Vídeň', 'mesto', 1, ['Q40'], { la: 48.2, lo: 16.4, f: { pop: 1900000 } }),
        place('Q220', 'Řím', 'mesto', 1, ['Q38'], { la: 41.9, lo: 12.5, f: { pop: 2800000 } }),
        place('Q4242', 'Testovací hora', 'hora', 1, ['Q39'], { ty: 'hora', la: 46.5, lo: 8, f: { elev: 3000 } }),
        place('Q4243', 'Vedlejší vrch', 'hora', 1, ['Q142'], { f: { elev: 1500 } }),
        place('Q4244', 'Malý kopec', 'hora', 0, ['Q40'], { f: { elev: 900 } }),
        place('Q39231', 'Fudži', 'hora', 1, ['Q17'], { la: 35.4, lo: 138.7, f: { elev: 3776 } }),
        place('Q6001', 'Vlajkový ostrov', 'ostrov', 0, ['Q38'], { im: 'Flag_of_Testland.svg', la: 40, lo: 9 }),
        place('Q6002', 'Druhý ostrov', 'ostrov', 0, ['Q142'], { im: 'Chybejici_fotka.jpg', la: 42, lo: 9 })
    ]
};

const EXTRACTS = {
    'Testovací hora': 'Testovací hora je hora v pohoří Alpy ve Švýcarsku, vysoká přibližně tři tisíce metrů. <img src=x onerror=__xss=1> ' +
        'Na vrcholu Testovací hory stojí horská chata, kterou navštěvují turisté z celého světa. Hora je známá svými ledovci a výhledy do údolí. ' +
        'Ve 20. století zde vznikla lanovka vedoucí až na vrchol hory.',
    'Testov': 'Testov je statutární město v Česku, leží v Jihomoravském kraji na řece Svratce. Je to známé české univerzitní město s bohatou historií. ' +
        'Ve městě sídlí několik vysokých škol a velký výstavní areál, který každoročně hostí mnoho veletrhů.',
    'Švýcarsko': 'Švýcarsko, oficiálně Švýcarská konfederace, je vnitrozemský stát ve střední Evropě. Hlavním městem je Bern, největším městem Curych. ' +
        'Švýcarská neutralita má dlouhou tradici a země je známá hodinkami, sýry a čokoládou.'
};
const extractFor = (title) => EXTRACTS[title] || `${title} je místo, o kterém se píše v testu. <img src=x onerror=__xss=1> ` +
    'Leží v zemi, kterou je třeba uhodnout, a je známé svou krásou a dlouhou historií. Ve 20. století sem začali jezdit turisté z celého světa. ' +
    'Místo má bohatou historii a nabízí mnoho zajímavostí pro návštěvníky každého věku.';

// Soubor z repozitáře se stejnými hlavičkami jako na Netlify (CSP u HTML), místo skutečné sady míst testovací
const serveFile = (pathname) => {
    if (pathname === '/data/places.json') return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(DATASET) };
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

// options: variant (null = první spuštění), filters, fixedRandom (Math.random vrací 0.1 → první místo a otázka na stát, kde jde),
// wikiDown, wikiHangs, dataDown, fakeTimers, colorScheme, origin + serviceWorkers
const setup = async (browser, options = {}) => {
    const origin = options.origin || ORIGIN;
    const flags = { ...options };
    const context = await browser.newContext({ serviceWorkers: options.serviceWorkers || 'block', colorScheme: options.colorScheme || 'light' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    if (options.variant !== null) await context.addInitScript(variant => localStorage.setItem('geoQuizVariant', variant), options.variant || 'choices');
    if (options.filters) await context.addInitScript(filters => localStorage.setItem('geoQuizFilters', filters), JSON.stringify(options.filters));
    if (options.fixedRandom) await context.addInitScript(() => { Math.random = () => 0.1; });
    const tab = await context.newPage();
    const log = { wiki: [], data: 0, photos: [], tiles: 0, satellite: [], errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });

    await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) {
            if (url.pathname === '/data/places.json') {
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
            return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: extractFor(title) } } } } });
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

const waitForQuestion = (tab) => tab.waitForSelector('text=Tvoje odpověď', { timeout: 30000 });
const waitForResult = (tab) => tab.waitForSelector('h1', { timeout: 30000 });
// Rozehrané místo z uloženého stavu – podle něj test ví, co je správná odpověď
const readRound = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('geoSessionState')).data);
const correctAnswer = (data) => data.quizType === 'name' ? data.name : data.countryNames[0];
const appText = (tab) => tab.textContent('#app-content');

test('aplikace v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('dnešní místo: popis, fotka, slepá mapa, fakta, odpověď, série a sdílení', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        const data = await readRound(tab);

        assert.equal(data.known, true, 'dnešní místo je známé');
        assert.deepEqual(data.hints, ['photo', 'map', 'facts']);
        assert.equal(await tab.textContent('#status-text'), 'Dnešní místo · 16. 10.');
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4);
        assert.equal(await tab.locator('#answer-input').count(), 0, 've variantě s možnostmi není pole pro psaní');
        assert.match(await tab.textContent('h2'), data.quizType === 'name' ? /Co je to za místo\?/ : /Ve kterém státě to je\?/);

        // Popis je vidět hned a neprozradí odpověď; HTML z Wikipedie je jen text
        const description = await tab.textContent('p.italic');
        assert.match(description, /<img src=x onerror=__xss=1>/);
        if (data.quizType === 'name') assert.ok(!description.includes(data.name), description);
        else assert.ok(!description.includes(data.countryNames[0]), description);
        assert.equal(await tab.locator('#hint-photo, #hint-map').count(), 0, 'nápovědy až na požádání');
        assert.match(await appText(tab), /Nápověda 1\/4/);
        assert.match(await appText(tab), /Teď za ni získáš 4 body/);

        // 1. nápověda: skutečná fotka jako pozadí prvku (ne <img>)
        await tab.click('[data-action="hint"]');
        await tab.waitForFunction(() => document.getElementById('hint-photo').style.backgroundImage.includes('upload.wikimedia.org/wikipedia/commons/thumb/a/ab/'));
        assert.match(await appText(tab), /Nápověda 2\/4/);
        assert.match(await appText(tab), /Teď za ni získáš 3 body/);
        assert.equal(await tab.locator('#app-content section img').count(), 0);

        // 2. nápověda: slepá mapa bez popisků s obrysy států a terčem uprostřed
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-map svg path');
        assert.ok(await tab.locator('#hint-map svg path').count() >= 3, 'obrysy okolních států');
        assert.equal(await tab.locator('#hint-map svg text').count(), 0, 'žádné popisky');
        if (data.category === 'stat') assert.ok(await tab.locator('#hint-map path.fill-emerald-400').count() > 0, 'stát je zvýrazněný');
        else assert.equal(await tab.locator('#hint-map svg circle').count(), 2, 'terč uprostřed');
        assert.match(await appText(tab), /↔ [\d\s ]+ km/);

        // 3. nápověda: čísla a fakta, další už není
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('text=Čísla a fakta');
        assert.ok(await tab.locator('dl dt').count() >= 1);
        assert.equal(await tab.locator('[data-action="hint"]').count(), 0);
        assert.match(await appText(tab), /Nápověda 4\/4/);

        // Lišta nahoře nepřekrývá obsah
        const header = await tab.locator('header').boundingBox();
        const content = await tab.locator('#app-content').boundingBox();
        assert.ok(header.y + header.height <= content.y + 1, 'obsah začíná pod lištou');

        await tab.click(`[data-action="choice"]:has-text("${correctAnswer(data)}")`);
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
        assert.match(shared, /^Geo Kvíz · 16\. 10\. 2026\n\S+ [^\n]+\n✅ 1 bod · nápověda 4\/4\n🔥 Série: 1\nhttps:\/\/geo\.test\/$/);

        // Po návratu z tréninku zůstane dnešní místo odhalené
        await tab.click('#btn-random');
        await waitForQuestion(tab);
        assert.match(await tab.textContent('#status-text'), /Trénink · 0 bodů/);
        const requestsBefore = log.wiki.length;
        await tab.click('#btn-daily');
        await waitForResult(tab);
        assert.equal(log.wiki.length, requestsBefore, 'dnešní místo z mezipaměti');
        assert.equal(await tab.textContent('h1'), data.name);

        // Po obnovení stránky totéž
        await tab.reload();
        await waitForResult(tab);
        assert.equal(log.wiki.length, requestsBefore);

        assert.equal(await tab.evaluate(() => window.__xss), undefined);
        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'všechny ikony vykreslené');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('otázka na stát ve variantě psaní: zakrytý stát, dvojnásobek bodů, další místo', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed', fixedRandom: true, filters: { categories: ['mesto'], tier: 'known' } });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        await tab.click('#btn-random');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        assert.equal(data.name, 'Testov');
        assert.equal(data.quizType, 'location');
        assert.match(await tab.textContent('h2'), /Ve kterém státě to je\?/);
        assert.match(await appText(tab), /Název: Testov/);
        const description = await tab.textContent('p.italic');
        assert.doesNotMatch(description, /Česk|česk|Jihomoravsk/, description);
        assert.match(description, /na řece Svratce/);
        assert.match(description, /statutární město/);
        assert.equal(await tab.locator('[data-action="choice"]').count(), 0, 've variantě psaní nejsou možnosti');
        assert.match(await appText(tab), /Teď za ni získáš 8 bodů/);

        await tab.fill('#answer-input', 'Česká republika');
        await tab.press('#answer-input', 'Enter');
        await waitForResult(tab);
        assert.match(await appText(tab), /Správně! \+8 bodů/);
        assert.match(await appText(tab), /Napsaná odpověď/);
        assert.match(await appText(tab), /Česká stopa/);
        assert.match(await tab.textContent('#status-text'), /Trénink · 8 bodů/);

        // Další místo se neopakuje
        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        assert.notEqual((await readRound(tab)).name, 'Testov');
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        assert.match(await appText(tab), /Tentokrát bez odpovědi/);
        assert.match(await appText(tab), /správně 1 z 2/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('stát: na stát se neptá, slepá mapa ho zvýrazní, psaná zkratka platí', async () => {
        const { context, tab, log } = await setup(browser, { variant: 'typed', fixedRandom: true, filters: { categories: ['stat'], tier: 'known' } });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        await tab.click('#btn-random');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        assert.equal(data.name, 'Švýcarsko');
        assert.equal(data.quizType, 'name');
        assert.deepEqual(data.hints, ['map', 'facts'], 'stát bez fotky');
        assert.doesNotMatch(await tab.textContent('p.italic'), /Švýcar|švýcar/);
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-map path.fill-emerald-400');
        assert.equal(await tab.locator('#hint-map svg circle').count(), 0);
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
        const { context, tab, log } = await setup(browser, { fixedRandom: true, filters: { categories: ['ostrov'], tier: 'all' } });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        for (const name of ['Vlajkový ostrov', 'Druhý ostrov']) {
            await tab.click('#btn-random');
            await waitForQuestion(tab);
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
        assert.match(await appText(tab), /Méně známé místo/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('první spuštění: výběr varianty hry před první otázkou', async () => {
        const { context, tab, log } = await setup(browser, { variant: null });
        await tab.goto(`${ORIGIN}/`);
        await tab.waitForSelector('text=Jak chceš hrát?');
        assert.equal(log.data, 0, 'bez varianty se nic nenačítá');
        await tab.click('#variant-welcome [data-variant="typed"]');
        await waitForQuestion(tab);
        assert.equal(await tab.locator('#answer-input').count(), 1);
        assert.equal(await tab.evaluate(() => localStorage.getItem('geoQuizVariant')), 'typed');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('nastavení: varianta hry a co hádat v tréninku', async () => {
        const { context, tab, log } = await setup(browser);
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);

        await tab.click('#btn-settings');
        await tab.click('#settings-overlay [data-variant="typed"]');
        assert.match(await tab.textContent('#settings-note'), /od další otázky/);

        // Výchozí: všechny kategorie, jen známá místa; počty podle sady
        assert.equal(await tab.getAttribute('#settings-overlay [data-tier="known"]', 'aria-pressed'), 'true');
        assert.match(await tab.textContent('#settings-overlay [data-category="hora"]'), /Hory a sopky\s*3/);
        await tab.click('#settings-overlay [data-tier="all"]');
        assert.match(await tab.textContent('#settings-overlay [data-category="hora"]'), /Hory a sopky\s*4/);
        assert.match(await tab.textContent('#settings-note'), /od dalšího místa v tréninku/);

        // Vypnout všechno kromě ostrovů; poslední kategorie vypnout nejde
        for (const key of ['stat', 'mesto', 'hora', 'reka', 'jezero', 'priroda', 'stavba']) await tab.click(`#settings-overlay [data-category="${key}"]`);
        await tab.click('#settings-overlay [data-category="ostrov"]');
        assert.match(await tab.textContent('#settings-note'), /Aspoň jedna kategorie/);
        assert.equal(await tab.getAttribute('#settings-overlay [data-category="ostrov"]', 'aria-pressed'), 'true');
        assert.deepEqual(JSON.parse(await tab.evaluate(() => localStorage.getItem('geoQuizFilters'))), { categories: ['ostrov'], tier: 'all' });
        await tab.click('#settings-overlay [data-close]');
        assert.equal(await tab.locator('#settings-overlay').count(), 0);
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4, 'u rozehrané otázky zůstanou možnosti');

        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        await tab.click('[data-action="next"]');
        await waitForQuestion(tab);
        assert.equal((await readRound(tab)).category, 'ostrov', 'trénink jen z vybrané kategorie');
        assert.equal(await tab.locator('#answer-input').count(), 1, 'další otázka už je na psaní');

        // Zpět na možnosti jde hned (je to snazší)
        await tab.click('[data-action="settings"]');
        await tab.click('#settings-overlay [data-variant="choices"]');
        assert.match(await tab.textContent('#settings-note'), /hned/);
        await tab.keyboard.press('Escape');
        // V testovací sadě jsou jen dva ostrovy: u otázky na název dvě možnosti, u otázky na stát čtyři
        assert.ok(await tab.locator('[data-action="choice"]').count() >= 2);
        assert.equal(await tab.locator('#answer-input').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('výpadek Wikipedie: hraje se dál s krátkým popisem z Wikidat', async () => {
        const { context, tab, log } = await setup(browser, { wikiDown: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForQuestion(tab);
        assert.equal(log.wiki.length, 2, 'dva pokusy o popis');
        assert.match(await tab.textContent('p.italic'), /v testovacím světě\./);
        await tab.click('[data-action="give-up"]');
        await waitForResult(tab);
        assert.doesNotMatch(await appText(tab), /Zajímavosti/);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('nedostupná data hry: chyba spojení a opakování', async () => {
        const { context, tab, log, flags } = await setup(browser, { dataDown: true });
        await tab.goto(`${ORIGIN}/`);
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
        await waitForQuestion(tab);
        await tab.evaluate(() => navigator.serviceWorker.ready);

        // Vypnout síť i server – stránka i data hry se musí načíst jen z mezipaměti service workeru
        await context.setOffline(true);
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await tab.reload();
        await waitForQuestion(tab);
        assert.equal(await tab.locator('i[data-lucide]').count(), 0, 'ikony z mezipaměti');
        assert.equal(await tab.evaluate(() => getComputedStyle(document.getElementById('app-content')).display), 'flex', 'styly z mezipaměti');
        assert.equal(await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);

        // Nové místo v tréninku: sada míst i obrysy států z mezipaměti
        await tab.click('#btn-random');
        await waitForQuestion(tab);
        const data = await readRound(tab);
        for (let i = 0; i < data.hints.indexOf('map') + 1; i++) await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-map svg path');
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
