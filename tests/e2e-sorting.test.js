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

test('Seřaď to: úvod, Řazení dne, přesuny, kontrola, výsledek a volná hra', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async ({ viewport = { width: 360, height: 640 }, colorScheme = 'light', reducedMotion = 'no-preference' } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion });
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
            if (url.origin === origin) return route.fallback();
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

    // --- Světlý režim 360×640: záložka Hrát, úvod, Řazení dne ---
    const { context, tab, problems } = await open();
    await nav.go(tab, 'hrat');
    assert.equal(await tab.$$eval('#mode-tiles > button', tiles => tiles.length), 5);
    assert.match(await tab.textContent('#mode-tiles [data-action="sorting-open"]'), /Seřaď to/);
    await assertFits(tab, 'záložka Hrát s pěti režimy');
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
