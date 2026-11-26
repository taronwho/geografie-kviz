// Seřaď to (sorting.js, app.js) v prohlížeči: dlaždice mezi Režimy na záložce Hrát, úvod s Řazením dne a volnou hrou, přesuny karet
// přetažením myší, šipkami, klávesami a dvěma klepnutími, kontrola se zamčenými kartami a pokusy, výsledek s hodnotami a XP, rozehrané
// Řazení dne po odchodu, volná hra s výběrem tématu, vlastnosti a obtížnosti. Všechny obrazovky se vejdou bez posouvání na 360×640
// i 390×780 ve světlém i tmavém režimu. Data témat jsou skutečná (data/*.json), Wikipedie a obrázky podvržené.
// Snímky: SHOTS_DIR=složka. Potřebuje Playwright (viz tests/e2e.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const nav = require('./nav.js');
const core = require('../quiz-core.js');
const Sorting = require('../sorting.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const items = (topic) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/${topic}.json`), 'utf8')).items;

const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
        const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        response.writeHead(200, headers);
        response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

// Nová stránka s aplikací (host, bez tipů a průvodce); block = cesty, které se nenačtou (např. sorting.js), init = skript před aplikací
const opener = (browser, origin) => async ({ viewport = { width: 360, height: 640 }, colorScheme = 'light', reducedMotion = 'no-preference', block = [], init = null } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion });
    if (init) await context.addInitScript(init);
    await context.addInitScript(() => {
        window.MUDRLANT_NUMERIC_RATE = 0;
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('mudrlant.account', JSON.stringify('host'));
        localStorage.setItem('mudrlant.variant', 'choices');
        localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
        localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
    });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return block.some(name => url.pathname === `/${name}`) ? route.abort() : route.fallback();
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: 'Krátký popis položky pro zkoušku, dost dlouhý na to, aby ho aplikace vzala jako úvod článku z Wikipedie.' } } } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    const tab = await context.newPage();
    const problems = [];
    tab.on('pageerror', error => problems.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
    await tab.goto(`${origin}/`);
    await nav.waitForHome(tab);
    return { context, tab, problems };
};

// Společné kroky: snímek, kontrola, že se obrazovka vejde, uložený stav, karty a jejich seřazení
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const fits = (tab) => tab.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    const main = document.getElementById('app-content');
    return { scroll: main.scrollHeight - main.clientHeight, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
const assertFits = async (tab, label) => {
    const fit = await fits(tab);
    assert.ok(fit.scroll <= 1 && fit.wide <= 0, `${label}: vejde se bez posouvání (${JSON.stringify(fit)})`);
};
const storage = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.sorting') || 'null'));
const names = (tab) => tab.$$eval('[data-sort-card] [data-action="sorting-card"] > span:first-child', spans => spans.map(span => span.textContent.trim()));
const lockedPositions = (tab) => tab.$$eval('[data-sort-card]', cards => cards.map(card => !card.querySelector('[data-sort-arrow]')));
const openSorting = async (tab) => {
    await nav.go(tab, 'hrat');
    await tab.click('[data-action="sorting-open"]');
    await tab.waitForSelector('[data-sorting="intro"]');
};
// Seřadí karty šipkou nahoru podle známého správného pořadí (jen volné karty; zamčené už sedí)
const solveWithArrows = async (tab, correct) => {
    for (let p = 0; p < correct.length; p++) {
        for (let guard = 0; guard < 10; guard++) {
            const now = await names(tab);
            const at = now.indexOf(correct[p]);
            if (at === p) break;
            await tab.click(`[data-action="sorting-up"][data-pos="${at}"]`);
        }
    }
    assert.deepEqual(await names(tab), correct);
};
// Bez znalosti pořadí: kontrola a pak posun volných karet o jedno volné místo dokola (každá projde všechna volná místa)
const solveByRotation = async (tab) => {
    for (let round = 0; round < 10; round++) {
        await tab.click('[data-action="sorting-check"]');
        if (await tab.waitForSelector('[data-sorting="done"]', { timeout: 400 }).then(() => true, () => false)) return round + 1;
        const locked = await lockedPositions(tab);
        const free = locked.map((on, position) => (on ? -1 : position)).filter(position => position >= 0);
        for (let i = 0; i < free.length - 1; i++) await tab.click(`[data-action="sorting-down"][data-pos="${free[i]}"]`);
    }
    throw new Error('Karty se nepodařilo seřadit');
};

test('Seřaď to: úvod, Řazení dne, přesuny, kontrola, výsledek a volná hra', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = opener(browser, origin);
    // --- Světlý režim 360×640: záložka Hrát, úvod, Řazení dne ---
    const { context, tab, problems } = await open();
    await nav.go(tab, 'hrat');
    assert.equal(await tab.$$eval('#mode-tiles > button', tiles => tiles.length), 6); // Bleskovka, Přežití, Na mapě, Seřaď to, Skládačka, Učení
    assert.match(await tab.textContent('#mode-tiles [data-action="sorting-open"]'), /Seřaď to/);
    await assertFits(tab, 'záložka Hrát se šesti režimy');
    await shot(tab, 'hrat-svetly-360');
    await openSorting(tab);
    await assertFits(tab, 'úvod');
    await tab.waitForSelector('#app-nav:not(.hidden)', { timeout: 2000 }); // na úvodu je spodní lišta
    await shot(tab, 'uvod-svetly-360');

    const day = await tab.evaluate(() => window.MudrlantCore.getDayKey());
    const daily = await Sorting.dailyRound(day, async (topic) => ({ items: items(topic), ctx: null }));
    const correct = daily.correct.map(index => daily.items[index].name);
    assert.match(await tab.textContent('#sorting-daily-title'), /Řazení dne/);
    await tab.click('[data-action="sorting-daily"]');
    await tab.waitForSelector('[data-sorting="play"]');
    assert.equal((await names(tab)).length, correct.length);
    assert.deepEqual([...(await names(tab))].sort(), [...correct].sort(), 'karty dne jako v Node (pro všechny stejné)');
    assert.ok(!(await tab.isVisible('#app-nav')), 'při řazení spodní lišta není');
    await assertFits(tab, 'hra Řazení dne');
    await shot(tab, 'hra-svetly-360');

    // Klávesa dolů posune kartu o místo
    let before = await names(tab);
    await tab.focus('[data-action="sorting-card"][data-pos="0"]');
    await tab.keyboard.press('ArrowDown');
    let after = await names(tab);
    assert.equal(after[1], before[0]);
    assert.equal(after[0], before[1]);
    assert.equal(await tab.evaluate(() => document.activeElement.dataset.pos), '1', 'fokus zůstane na posunuté kartě');
    assert.match(await tab.textContent('[data-sort-live]'), /je teď na 2\. místě/);
    // Dvě klepnutí kartu prohodí
    before = after;
    await tab.click('[data-action="sorting-card"][data-pos="0"]');
    assert.equal(await tab.getAttribute('[data-action="sorting-card"][data-pos="0"]', 'aria-pressed'), 'true');
    assert.match(await tab.textContent('[data-sort-hint]'), /Klepni na kartu, se kterou ji prohodit/);
    await tab.click('[data-action="sorting-card"][data-pos="3"]');
    after = await names(tab);
    assert.equal(after[0], before[3]);
    assert.equal(after[3], before[0]);
    // Přetažení myší z 1. na 4. místo (karty mezi se posunou nahoru)
    before = after;
    const from = await tab.$('[data-sort-card][data-pos="0"]');
    const to = await tab.$('[data-sort-card][data-pos="3"]');
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    await tab.mouse.move(a.x + 60, a.y + a.height / 2);
    await tab.mouse.down();
    for (let i = 1; i <= 8; i++) await tab.mouse.move(a.x + 60, a.y + a.height / 2 + (b.y - a.y) * i / 8);
    await tab.mouse.up();
    after = await names(tab);
    assert.deepEqual(after, [before[1], before[2], before[3], before[0], ...before.slice(4)]);
    assert.equal(await tab.$('[data-action="sorting-card"][aria-pressed="true"]'), null, 'po přetažení nic není vybrané');

    // Kontrola: správné karty zezelenají a zamknou se, počítá se pokus; dál se hraje bez trestu
    await tab.click('[data-action="sorting-check"]');
    await tab.waitForSelector('[data-sort-attempts="1"]');
    const placed = Number(await tab.getAttribute('[data-sorting-progress]', 'data-sorting-progress'));
    const locked = await lockedPositions(tab);
    const current = await names(tab);
    assert.equal(locked.filter(Boolean).length, placed);
    locked.forEach((on, position) => assert.equal(on, current[position] === correct[position], `${position + 1}. místo`));
    assert.match(await tab.textContent('[data-sorting-progress]'), new RegExp(`Na místě ${placed} z ${correct.length}`));
    // Rozehrané Řazení dne přežije odchod: Zpět na úvod a Pokračovat
    await tab.click('#btn-home');
    await tab.waitForSelector('[data-sorting="intro"]');
    assert.match(await tab.textContent('[data-action="sorting-daily"]'), /Pokračovat/);
    await tab.click('[data-action="sorting-daily"]');
    await tab.waitForSelector('[data-sorting="play"]');
    assert.deepEqual(await names(tab), current);
    assert.deepEqual(await lockedPositions(tab), locked);
    await solveWithArrows(tab, correct);
    await tab.click('[data-action="sorting-check"]');
    await tab.waitForSelector('[data-sorting="done"]');
    const doneText = await tab.textContent('[data-sorting="done"]');
    assert.match(doneText, /Seřazeno! 2 pokusy/);
    assert.match(doneText, /\+20 XP/);
    for (const index of daily.correct) assert.ok(doneText.includes(daily.items[index].label), `hodnota ${daily.items[index].label}`);
    await assertFits(tab, 'výsledek Řazení dne');
    await shot(tab, 'vysledek-dne-svetly-360');
    let state = await storage(tab);
    assert.deepEqual(state.daily[day], { attempts: 2, spec: daily.spec });
    assert.equal(state.play, null);
    // Klepnutí na kartu ukáže popis položky
    await tab.click('[data-sorting="done"] [data-action="item-info"]');
    await tab.waitForSelector('#place-info');
    await tab.keyboard.press('Escape');

    // Řazení dne už hotové: na úvodu Ukázat, výsledek bez dalších XP
    await tab.click('[data-action="sorting-intro"]');
    await tab.waitForSelector('[data-sorting="intro"]');
    assert.match(await tab.textContent('[data-action="sorting-daily"]'), /Ukázat/);
    assert.match(await tab.textContent('[data-sorting="intro"]'), /Hotovo · 2 pokusy/);

    // --- Volná hra: téma, vlastnost a těžká obtížnost (7 karet) ---
    await tab.selectOption('#sorting-topic', 'zemepis');
    await tab.waitForSelector('#sorting-spec:not([disabled])');
    await tab.selectOption('#sorting-spec', 'zemepis-hora-vyska');
    await tab.click('[data-action="sorting-level"][data-level="hard"]');
    assert.equal(await tab.getAttribute('[data-level="hard"]', 'aria-pressed'), 'true');
    state = await storage(tab);
    assert.deepEqual(state.last, { topic: 'zemepis', spec: 'zemepis-hora-vyska', level: 'hard' });
    await assertFits(tab, 'úvod po výběru');
    await tab.click('[data-sorting="intro"] [data-action="sorting-start"]');
    await tab.waitForSelector('[data-sorting="play"]');
    assert.equal((await names(tab)).length, 7);
    assert.match(await tab.textContent('[data-sorting="play"] h2'), /Seřaď od nejvyšší/);
    await assertFits(tab, 'hra se 7 kartami');
    await shot(tab, 'hra-7-karet-svetly-360');
    const checks = await solveByRotation(tab);
    const practice = await tab.textContent('[data-sorting="done"]');
    assert.match(practice, checks === 1 ? /Seřazeno napoprvé!/ : /Seřazeno!/);
    assert.match(practice, /\+\d+ XP/);
    assert.match(practice, / m\b/);
    await assertFits(tab, 'výsledek se 7 kartami');
    await shot(tab, 'vysledek-7-karet-svetly-360');
    assert.equal((await storage(tab)).games, 2);
    assert.deepEqual(problems, []);
    await context.close();

    // --- Tmavý režim 360×640 a 390×780 (i s omezeným pohybem) ---
    for (const [viewport, label, reducedMotion] of [[{ width: 360, height: 640 }, '360', 'reduce'], [{ width: 390, height: 780 }, '390', 'no-preference']]) {
        const dark = await open({ viewport, colorScheme: 'dark', reducedMotion });
        await openSorting(dark.tab);
        await assertFits(dark.tab, `úvod tmavý ${label}`);
        await shot(dark.tab, `uvod-tmavy-${label}`);
        await dark.tab.click('[data-action="sorting-level"][data-level="hard"]');
        await dark.tab.click('[data-sorting="intro"] [data-action="sorting-start"]');
        await dark.tab.waitForSelector('[data-sorting="play"]');
        await dark.tab.click('[data-action="sorting-check"]');
        await dark.tab.waitForSelector('[data-sort-attempts="1"]');
        await assertFits(dark.tab, `hra tmavá ${label}`);
        await shot(dark.tab, `hra-tmavy-${label}`);
        await solveByRotation(dark.tab);
        await assertFits(dark.tab, `výsledek tmavý ${label}`);
        await shot(dark.tab, `vysledek-tmavy-${label}`);
        assert.deepEqual(dark.problems, []);
        await dark.context.close();
    }
});

// Minihry dne na záložce Dnes: Řazení dne (sorting.js) a Skládačka dne (puzzle.js) jako dvě poloviny jednoho řádku Dnešních výzev
// (mezi Tajemnou otázkou a Bossem týdne); každá je dnešní výzva (x/6 hotovo). Nehrané = krátký stav a šipka, rozehrané = kolik karet
// sedí, hotové = fajfka a počet pokusů / tahů. Klepnutí otevře rovnou kolo (ne úvod), Zpět vede na Dnes. S jedinou minihrou (bez
// puzzle.js) je to běžný řádek s vlastností dne a tlačítkem. Když se záložka nevejde, zbudou z Miniher dne čipy v nadpisu.
// Záložka se vejde bez posouvání na 360×640 i 390×780 ve světlém i tmavém režimu; bez sorting.js Řazení dne chybí.
test('Minihry dne na záložce Dnes: Řazení dne a Skládačka dne, rovnou do kola, odškrtnutí', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = opener(browser, origin);
    // Stav dnešních výzev: pořadí řádků (Minihry dne jako #daily-minis), nadpis, zvýrazněný řádek a poloviny Miniher dne
    const specials = (tab) => tab.evaluate(() => ({
        order: [...document.querySelectorAll('#home-specials > [data-special-tile], #home-specials > #daily-minis')].map(el => el.id),
        halves: [...document.querySelectorAll('#daily-minis > [data-special-tile]')].map(tile => `${tile.id}:${tile.dataset.done}:${tile.querySelector('[data-special-text]').textContent.trim()}:${tile.querySelector('[data-cta-done]') ? 'fajfka' : 'šipka'}`),
        heading: document.querySelector('#home-specials h2').textContent.replace(/\s+/g, ' ').trim(),
        hot: (document.querySelector('#home-specials [data-hot]') || {}).id || ''
    }));
    // Řádek Řazení dne jako celý řádek (jen jedna minihra)
    const row = (tab) => tab.evaluate(() => {
        const tile = document.getElementById('sorting-card');
        return { status: tile.dataset.sortingStatus, text: tile.querySelector('[data-special-text]').textContent.trim(), label: tile.getAttribute('aria-label'),
            cta: (tile.querySelector('[data-cta]') || { textContent: '' }).textContent.trim(), tick: Boolean(tile.querySelector('[data-cta-done]')) };
    });
    // Po zápisu do úložiště se záložka Dnes překreslí (přes jinou záložku)
    const repaint = async (tab) => { await nav.go(tab, 'hrat'); await nav.go(tab, 'dnes'); };
    const backHome = async (tab) => { await tab.click('#btn-home'); await nav.waitForHome(tab); assert.equal(await nav.currentTab(tab), 'dnes', 'Zpět vede na Dnes'); };

    const { context, tab, problems } = await open();
    const day = await tab.evaluate(() => window.MudrlantCore.getDayKey());
    const daily = await Sorting.dailyRound(day, async (topic) => ({ items: items(topic), ctx: null }));
    const correct = daily.correct.map(index => daily.items[index].name);
    const variant = await tab.evaluate(() => [...document.querySelectorAll('#puzzle-card [data-special-text]')].map(el => el.textContent.trim())[0]);
    assert.ok(['Vlajka', 'Obrys státu'].includes(variant), variant);
    const seedDone = (page) => page.evaluate((day) => {
        localStorage.setItem('mudrlant.skladacka', JSON.stringify({ v: 1, daily: { [day]: { moves: 21, v: 'flag', id: '' } } }));
    }, day);

    // Nehrané: jeden řádek se dvěma polovinami, šest dnešních výzev
    let info = await specials(tab);
    assert.deepEqual(info.order, ['quiz-card', 'chain-card', 'mystery-card', 'daily-minis', 'boss-card']);
    assert.deepEqual(info.halves, ['sorting-card:0:6 karet:šipka', `puzzle-card:0:${variant}:šipka`]);
    assert.match(info.heading, /0\/6 hotovo/);
    assert.match(await tab.getAttribute('#sorting-card', 'aria-label'), /Řazení dne: seřaď 6 karet – .+\. Stejné pro všechny, bez časovače\. Hrát/);
    assert.match(await tab.getAttribute('#puzzle-card', 'aria-label'), /Skládačka dne: .+ · 16 dílků, stejná pro všechny\. Hrát/);
    await assertFits(tab, 'Dnes s Minihrami dne');
    await shot(tab, 'dnes-minihry-svetly-360');

    // Řazení dne: rovnou kolo dne, bez úvodu Seřaď to
    await tab.click('#sorting-card');
    await tab.waitForSelector('[data-sorting="play"]');
    assert.equal(await tab.$('[data-sorting="intro"]'), null);
    assert.deepEqual([...(await names(tab))].sort(), [...correct].sort(), 'karty dne');
    await tab.click('[data-action="sorting-check"]');
    await tab.waitForSelector('[data-sort-attempts="1"]');
    const placed = Number(await tab.getAttribute('[data-sorting-progress]', 'data-sorting-progress'));
    await backHome(tab);
    info = await specials(tab);
    assert.equal(info.halves[0], `sorting-card:0:${placed}/6 na místě:šipka`, 'rozehrané Řazení dne');
    await shot(tab, 'dnes-rozehrane-svetly-360');
    // Dohrání: polovina se odškrtne (fajfka, počet pokusů) a počítá se mezi hotové
    await tab.click('#sorting-card');
    await tab.waitForSelector('[data-sorting="play"]');
    await solveWithArrows(tab, correct);
    await tab.click('[data-action="sorting-check"]');
    await tab.waitForSelector('[data-sorting="done"]');
    assert.match(await tab.textContent('[data-sorting="done"]'), /\+20 XP/);
    await backHome(tab);
    info = await specials(tab);
    assert.equal(info.halves[0], 'sorting-card:1:2 pokusy:fajfka');
    assert.match(info.heading, /1\/6 hotovo/);
    await assertFits(tab, 'Dnes se seřazeným Řazením dne');
    // Hotové: klepnutí ukáže výsledek (bez dalších XP), Zpět na Dnes
    await tab.click('#sorting-card');
    await tab.waitForSelector('[data-sorting="done"]');
    assert.doesNotMatch(await tab.textContent('[data-sorting="done"]'), /XP/);
    await assertFits(tab, 'výsledek Řazení dne ze záložky Dnes');
    await backHome(tab);
    // Úvod Seřaď to ze záložky Hrát: Zpět z kola dál vede na úvod
    await openSorting(tab);
    await tab.click('[data-action="sorting-daily"]');
    await tab.waitForSelector('[data-sorting="done"]');
    await tab.click('#btn-home');
    await tab.waitForSelector('[data-sorting="intro"]');
    await tab.click('#btn-home');
    await nav.waitForHome(tab);
    await nav.go(tab, 'dnes');

    // Skládačka dne: rovnou Skládačka dne (ne úvod Skládačky), Zpět na Dnes
    await tab.click('#puzzle-card');
    await tab.waitForSelector('#puzzle-screen, #puzzle-done, #puzzle-error');
    assert.equal(await tab.$('#puzzle-intro'), null, 'bez úvodu Skládačky');
    await backHome(tab);
    // Rozehraná Skládačka dne: polovina to říká, zvýrazněný je pořád Kvíz dne
    info = await specials(tab);
    assert.deepEqual(info.halves, ['sorting-card:1:2 pokusy:fajfka', 'puzzle-card:0:Rozehráno:šipka']);
    assert.equal(info.hot, 'quiz-card');
    await assertFits(tab, 'Dnes s rozehranou Skládačkou dne');
    assert.deepEqual(problems, []);
    await context.close();

    // Tmavý režim a 390×780: nehrané a hotové Minihry dne se vejdou bez posouvání
    for (const [viewport, label, colorScheme] of [[{ width: 360, height: 640 }, 'tmavy-360', 'dark'], [{ width: 390, height: 780 }, 'svetly-390', 'light'], [{ width: 390, height: 780 }, 'tmavy-390', 'dark']]) {
        const page = await open({ viewport, colorScheme });
        assert.equal((await specials(page.tab)).halves.length, 2);
        await assertFits(page.tab, `Dnes ${label}`);
        await shot(page.tab, `dnes-minihry-${label}`);
        await page.tab.evaluate(([day, spec]) => localStorage.setItem('mudrlant.sorting', JSON.stringify({ v: 1, daily: { [day]: { attempts: 1, spec } } })), [day, daily.spec]);
        await seedDone(page.tab);
        await repaint(page.tab);
        info = await specials(page.tab);
        assert.deepEqual(info.halves, ['sorting-card:1:Napoprvé:fajfka', 'puzzle-card:1:21 tahů:fajfka']);
        assert.match(info.heading, /2\/6 hotovo/);
        assert.match(await page.tab.getAttribute('#puzzle-card', 'aria-label'), /Skládačka dne: hotovo, 21 tahů\. Ukázat výsledek/);
        await assertFits(page.tab, `Dnes hotové ${label}`);
        await shot(page.tab, `dnes-minihry-hotove-${label}`);
        assert.deepEqual(page.problems, []);
        await page.context.close();
    }

    // Jen Řazení dne (bez puzzle.js): běžný řádek s vlastností dne a tlačítkem; názvy vlastností všech dní se vejdou celé
    const rowTexts = [...new Set(Sorting.DAILY_SPECS.map(id => Sorting.rowText(Sorting.SPEC_BY_ID.get(id))))];
    for (const [viewport, label] of [[{ width: 360, height: 640 }, '360'], [{ width: 390, height: 780 }, '390']]) {
        const page = await open({ viewport, block: ['puzzle.js'] });
        assert.deepEqual((await specials(page.tab)).order, ['quiz-card', 'chain-card', 'mystery-card', 'sorting-card', 'boss-card']);
        assert.match((await specials(page.tab)).heading, /0\/5 hotovo/);
        info = await row(page.tab);
        assert.deepEqual({ status: info.status, text: info.text, cta: info.cta }, { status: 'new', text: Sorting.rowText(Sorting.SPEC_BY_ID.get(daily.spec)), cta: 'Hrát' });
        const cut = await page.tab.evaluate((texts) => {
            const el = document.querySelector('#sorting-card [data-special-text]');
            return texts.filter(text => { el.textContent = text; return el.scrollWidth > el.clientWidth + 1; });
        }, rowTexts);
        assert.deepEqual(cut, [], `názvy vlastností se vejdou (${label})`);
        await repaint(page.tab);
        await assertFits(page.tab, `Dnes jen s Řazením dne ${label}`);
        await shot(page.tab, `dnes-jen-razeni-svetly-${label}`);
        await page.tab.evaluate(([day, spec]) => localStorage.setItem('mudrlant.sorting', JSON.stringify({ v: 1, daily: { [day]: { attempts: 3, spec } } })), [day, daily.spec]);
        await repaint(page.tab);
        info = await row(page.tab);
        assert.deepEqual({ status: info.status, text: info.text, tick: info.tick }, { status: 'done', text: 'Seřazeno 3 pokusy', tick: true });
        await page.context.close();
    }

    // Velmi nízký displej (320×470, např. rozdělená obrazovka): řádek se nevejde, z Miniher dne zbudou čipy v nadpisu Dnešních
    // výzev; klepnutí otevře rovnou kolo
    const tiny = await open({ viewport: { width: 320, height: 470 } });
    assert.equal(await tiny.tab.isVisible('#daily-minis'), false);
    assert.equal(await tiny.tab.isVisible('#sorting-pill'), true);
    assert.equal(await tiny.tab.isVisible('#puzzle-pill'), true);
    assert.match(await tiny.tab.getAttribute('#sorting-pill', 'aria-label'), /Řazení dne: seřaď 6 karet/);
    await assertFits(tiny.tab, 'Dnes 320×470');
    await shot(tiny.tab, 'dnes-cipy-svetly-320');
    await tiny.tab.click('#sorting-pill');
    await tiny.tab.waitForSelector('[data-sorting="play"]');
    await backHome(tiny.tab);
    assert.deepEqual(tiny.problems, []);
    await tiny.context.close();

    // Bez sorting.js: Řazení dne chybí, Skládačka dne je běžný řádek
    const bare = await open({ block: ['sorting.js'] });
    assert.equal(await bare.tab.$('#sorting-card'), null);
    assert.deepEqual((await specials(bare.tab)).order, ['quiz-card', 'chain-card', 'mystery-card', 'puzzle-card', 'boss-card']);
    assert.match(await bare.tab.textContent('#puzzle-card'), /Skládačka dne/);
    await bare.context.close();
});
