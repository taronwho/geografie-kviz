// Bleskovka a Přežití (modes.js, app.js) a zvuky s vibracemi (sound.js) v prohlížeči: vstup z okna Co hrát, úvod, hra s časem
// a trestem, životy, výsledek s rekordem, XP a chybami do procvičování; přepínače Zvuky a Vibrace v Nastavení. Rozložení na 390×780
// a 360×640 ve světlém i tmavém režimu bez posouvání. Snímky: SHOTS_DIR=složka. Potřebuje Playwright (viz tests/e2e.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Úvod článku nese značku položky (K + QID): test podle ní pozná správnou odpověď, hra ji nezakryje (není to jméno)
const ZEMEPIS = fixtures.files['/data/zemepis.json'].items;
const COUNTRIES = fixtures.files['/data/countries.json'].countries;
const BY_TITLE = new Map(ZEMEPIS.map(item => [item.t, item]));
const BY_Q = new Map(ZEMEPIS.map(item => [item.q, item]));
const extract = (title) => BY_TITLE.has(title)
    ? `Tato položka má v testu značku K${BY_TITLE.get(title).q} a je známá svou krásou, dlouhou historií a mnoha zajímavostmi, které je třeba uhodnout. ` +
      'Ve dvacátém století se o ní začalo psát po celém světě a dodnes ji navštěvují lidé z mnoha různých zemí.'
    : fixtures.extractFor(title);

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

test('Bleskovka, Přežití, zvuky a vibrace', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // seed = další položky localStorage; clock = hodiny pod kontrolou testu (Bleskovka do konce bez čekání)
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', seed = {}, clock = false } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
        await context.addInitScript((seed) => {
            // Záznam tónů (frekvence) a vibrací: test pozná, co zaznělo
            window.__tones = [];
            window.__vibrations = [];
            const Base = window.AudioContext;
            if (Base) {
                const create = Base.prototype.createOscillator;
                Base.prototype.createOscillator = function () {
                    const osc = create.call(this);
                    const set = osc.frequency.setValueAtTime.bind(osc.frequency);
                    osc.frequency.setValueAtTime = (value, time) => { window.__tones.push(value); return set(value, time); };
                    return osc;
                };
            }
            navigator.vibrate = (pattern) => { window.__vibrations.push(pattern); return true; };
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
            for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, JSON.stringify(value));
        }, seed);
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.fallback();
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: extract(url.searchParams.get('titles')) } } } } });
            if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        const tab = await context.newPage();
        if (clock) await tab.clock.install();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    // Po doběhnutí úvodních animací (fade-in posouvá obsah o 10 px), nekonečné (pulz, pohupování) se nečekají
    const fits = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const main = document.getElementById('app-content');
        return { scroll: main.scrollHeight - main.clientHeight, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const storage = (tab, key) => tab.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), key);
    // Okno Co hrát pro Zeměpis (při prvním klepnutí na dlaždici) a režim z něj
    const openMode = async (tab, kind) => {
        // Dlaždice tématu otevře okno jen poprvé; jinak se hraje rovnou a okno se otevře klepnutím na téma v hlavičce
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        const opened = await tab.waitForSelector('#chooser-title:has-text("Zeměpis")', { timeout: 2000 }).then(() => true, () => false);
        if (!opened) {
            await tab.waitForSelector('[data-action="give-up"]');
            await tab.click('#status-badge');
            await tab.waitForSelector('#chooser-title:has-text("Zeměpis")');
        }
        await tab.click(`[data-chooser-mode="${kind}"]`);
        await tab.waitForSelector(`[data-mode-intro="${kind}"]`);
    };
    const waitQuestion = (tab, asked) => tab.waitForSelector(`[data-mode-question][data-phase="question"][data-asked="${asked}"]`);
    // Správná odpověď podle značky v popisu (otázka na název) nebo podle státu pojmenované položky (Ve kterém státě to je?)
    const solve = async (tab) => {
        const info = await tab.evaluate(() => {
            const panel = document.querySelector('[data-mode-question] [role="tabpanel"]');
            const named = panel.querySelector('b');
            return { text: panel.textContent, name: named ? named.textContent.trim() : null, labels: [...document.querySelectorAll('[data-action="mode-choice"]')].map(el => el.textContent.trim()) };
        });
        const item = info.name ? BY_TITLE.get(info.name) : BY_Q.get((info.text.match(/značku K(Q\d+)/) || [])[1]);
        assert.ok(item, `položka otázky: ${info.text.slice(0, 120)}`);
        const answer = info.name ? COUNTRIES[item.co[0]].name : item.n;
        const right = info.labels.indexOf(answer);
        assert.ok(right >= 0, `správná odpověď ${answer} mezi ${info.labels.join(', ')}`);
        return { right, wrong: right === 0 ? 1 : 0, answer, item, labels: info.labels };
    };

    await t.test('okno Co hrát nabízí nahoře Hrát a pod ním Bleskovku a Přežití; úvod ukáže pravidla a rekordy; úvod se nemění', async () => {
        const { context, tab, problems } = await open();
        await tab.click('[data-action="play-mix"]');
        await tab.waitForSelector('#play-chooser [data-chooser-mode="blitz"]');
        const buttons = await tab.evaluate(() => [...document.querySelectorAll('#play-chooser [data-chooser-mode]')].map(el => ({ text: el.textContent.trim(), title: el.querySelector('.font-black').textContent.trim(), label: el.getAttribute('aria-label'), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width })));
        assert.deepEqual(buttons.map(button => button.title), ['Bleskovka', 'Přežití']);
        assert.match(buttons[0].label, /60 sekund/);
        for (const button of buttons) assert.ok(button.h >= 44 && button.w >= 44, `${button.text}: ${button.w}×${button.h}`);
        // Hrát přes celou šířku nahoře, pod ním oba režimy v jednom řádku, teprve pak výběr témat
        const layout = await tab.evaluate(() => {
            const play = document.querySelector('[data-chooser-play]').getBoundingClientRect();
            const blitz = document.querySelector('[data-chooser-mode="blitz"]').getBoundingClientRect();
            const survival = document.querySelector('[data-chooser-mode="survival"]').getBoundingClientRect();
            const topics = document.querySelector('#play-chooser [data-chooser-topic]').getBoundingClientRect();
            return { below: blitz.top >= play.bottom - 1, row: Math.abs(blitz.top - survival.top) < 2, topicsBelow: topics.top >= blitz.bottom - 1 };
        });
        assert.deepEqual(layout, { below: true, row: true, topicsBelow: true });
        await shot(tab, 'rezimy-vyber-390');
        await tab.click('#play-chooser [data-close]');
        // Úvodní obrazovka zůstává bez vstupu navíc (místo nezabírá) a bez posouvání
        assert.equal(await tab.locator('#app-content [data-chooser-mode], #app-content [data-mode-intro]').count(), 0);
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await openMode(tab, 'blitz');
        const intro = await tab.textContent('[data-mode-intro]');
        assert.match(intro, /Bleskovka/);
        assert.match(intro, /60 sekund/);
        assert.match(intro, /ubere 3 sekundy/);
        assert.match(intro, /Zeměpis · všechny kategorie · Základní/);
        assert.match(intro, /\+3\sXP za každou správnou odpověď \(dnes ještě až 150\sXP\)/);
        assert.equal((await tab.textContent('[data-mode-record-scope]')).replace(/\s+/g, ' ').trim(), 'Rekord tématu –');
        assert.match(await tab.textContent('#status-badge'), /Bleskovka · Zeměpis/i);
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        // Zpět na úvod
        await tab.click('[data-action="mode-home"]');
        await tab.waitForSelector('[data-action="play-topic"]');
        // Tlačítko Zpět (telefon) během hry: domů, hra se zahodí
        await openMode(tab, 'survival');
        await tab.click('[data-action="mode-start"]');
        await waitQuestion(tab, 1);
        await tab.goBack();
        await tab.waitForSelector('[data-action="play-topic"]');
        assert.equal(await storage(tab, 'mudrlant.modes'), null, 'nedohraná hra se nezapíše');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Bleskovka: čas stojí při načítání, chyba ubere 3 s, konec času ukáže výsledek, rekord, XP a chyby do procvičování', async () => {
        const { context, tab, problems } = await open({ clock: true });
        await openMode(tab, 'blitz');
        await tab.click('[data-action="mode-start"]');
        await waitQuestion(tab, 1);
        // Správně
        const first = await solve(tab);
        await tab.click(`[data-action="mode-choice"][data-index="${first.right}"]`);
        await tab.waitForSelector('[data-mode-question][data-phase="feedback"]');
        assert.match(await tab.getAttribute(`[data-action="mode-choice"][data-index="${first.right}"]`, 'class'), /bg-emerald-600/);
        assert.match(await tab.textContent('[data-mode-question] [role="status"]'), /Správně/);
        await waitQuestion(tab, 2);
        assert.match(await tab.getAttribute('[data-mode-question] [aria-label^="Správně"]', 'aria-label'), /Správně: 1/);
        // Špatně: −3 s, správná odpověď zeleně, chybná červeně
        const second = await solve(tab);
        const before = Number(await tab.textContent('[data-mode-clock]'));
        await tab.click(`[data-action="mode-choice"][data-index="${second.wrong}"]`);
        await tab.waitForSelector('[data-mode-penalty]');
        assert.equal((await tab.textContent('[data-mode-penalty]')).trim(), '−3 s');
        const after = Number(await tab.textContent('[data-mode-clock]'));
        assert.ok(after <= before - 3 && after >= before - 4, `čas ${before} → ${after}`);
        assert.match(await tab.getAttribute(`[data-action="mode-choice"][data-index="${second.right}"]`, 'class'), /bg-emerald-600/);
        assert.match(await tab.getAttribute(`[data-action="mode-choice"][data-index="${second.wrong}"]`, 'class'), /bg-rose-600/);
        assert.match(await tab.textContent('[data-mode-question] [role="status"]'), new RegExp(`Správně je ${second.answer}`));
        await shot(tab, 'bleskovka-chyba-390');
        // Chyba je v Mých chybách a v kartách procvičování, správná odpověď v poznaných položkách
        assert.ok((await storage(tab, 'mudrlant.mistakes')).includes(`zemepis:${second.item.q}`));
        assert.ok((await storage(tab, 'mudrlant.review')).some(card => JSON.stringify(card).includes(second.item.q)), 'karta procvičování');
        assert.ok((await storage(tab, 'mudrlant.learned')).zemepis.includes(first.item.q));
        await waitQuestion(tab, 3);
        // Posledních 5 s tiká, pak konec
        const tonesBefore = await tab.evaluate(() => window.__tones.length);
        const left = Number(await tab.textContent('[data-mode-clock]'));
        await tab.clock.fastForward((left - 7.5) * 1000);
        await tab.waitForFunction(() => { const el = document.querySelector('[data-mode-clock]'); return el && Number(el.textContent) <= 8 && Number(el.textContent) >= 6; });
        assert.match(await tab.getAttribute('[data-mode-bar]', 'class'), /bg-rose-500/, 'posledních 10 s červeně');
        assert.deepEqual(await tab.evaluate((from) => window.__tones.slice(from), tonesBefore), [], 'před posledními 5 s se netiká');
        await tab.clock.runFor(3500);
        const ticks = await tab.evaluate((from) => window.__tones.slice(from), tonesBefore);
        assert.ok(ticks.length >= 1 && ticks.every(f => f === 1046.5), `tikání: ${ticks.join(', ')}`);
        await tab.clock.runFor(6000);
        await tab.waitForSelector('[data-mode-result="blitz"]');
        const result = await tab.textContent('[data-mode-result]');
        assert.match(result, /1\s*správná odpověď/);
        assert.match(result, /První rekord v tématu/);
        assert.match(result, /Chyby\s*1/);
        assert.match(result, /\+3 XP za 1 správnou odpověď/);
        assert.match(result, /Co ti uteklo/);
        assert.match(result, new RegExp(second.item.n));
        const modes = await storage(tab, 'mudrlant.modes');
        assert.equal(modes.blitz.best.zemepis, 1);
        assert.equal(modes.blitz.top, 1);
        assert.equal(modes.blitz.games, 1);
        assert.equal(modes.xp.blitz, 3);
        assert.equal((await storage(tab, 'mudrlant.progress')).xp, 3, 'XP připsané do postupu');
        const stats = await storage(tab, 'mudrlant.stats');
        assert.equal(stats && stats.practice ? stats.practice.played : 0, 0, 'do statistik tréninku se nepočítá');
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await shot(tab, 'bleskovka-vysledek-390');
        // Okno s popisem chybné položky
        await tab.click(`[data-mode-result] [data-action="item-info"][data-id="${second.item.q}"]`);
        await tab.waitForSelector('#place-info');
        await tab.click('#place-info [data-close]');
        // Hrát znovu = rovnou nová hra, Ukončit hru bez otázky = zpět na úvod režimu
        await tab.click('[data-action="mode-again"]');
        await waitQuestion(tab, 1);
        assert.equal(await tab.textContent('[data-mode-clock]'), '60');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('nový rekord: oslava, fanfára, vibrace a bonus +20 XP; odchod během hry výsledek nezapíše', async () => {
        const seed = { 'mudrlant.modes': { v: 1, blitz: { best: { zemepis: 1 }, top: 1, games: 1, total: 1 } } };
        const { context, tab, problems } = await open({ colorScheme: 'dark', seed });
        await openMode(tab, 'blitz');
        assert.equal((await tab.textContent('[data-mode-record-scope]')).replace(/\s+/g, ' ').trim(), 'Rekord tématu 1');
        await tab.click('[data-action="mode-start"]');
        for (let asked = 1; asked <= 2; asked++) {
            await waitQuestion(tab, asked);
            const { right } = await solve(tab);
            await tab.click(`[data-action="mode-choice"][data-index="${right}"]`);
        }
        await waitQuestion(tab, 3);
        const tones = await tab.evaluate(() => window.__tones);
        assert.ok(tones.includes(659.25) && tones.includes(880), `zvuk správné odpovědi: ${tones.join(', ')}`);
        await tab.click('[data-action="mode-quit"]');
        await tab.waitForSelector('[data-mode-new-record]');
        assert.match(await tab.textContent('[data-mode-new-record]'), /Nový rekord!/);
        await tab.waitForSelector('#celebration');
        assert.match(await tab.textContent('#celebration'), /Nový rekord!.*Bleskovka · Zeměpis: 2 správné odpovědi/);
        assert.match(await tab.textContent('[data-mode-xp]'), /\+6 XP za 2 správné odpovědi/);
        assert.match(await tab.textContent('[data-mode-xp]'), /\+20 XP za nový rekord/);
        assert.deepEqual(await tab.evaluate(() => window.__vibrations), [[70, 50, 70, 50, 160]], 'vibrace při rekordu (bez chyb žádná jiná)');
        assert.ok((await tab.evaluate(() => window.__tones)).includes(1046.5), 'fanfára rekordu');
        assert.equal((await storage(tab, 'mudrlant.modes')).blitz.best.zemepis, 2);
        await shot(tab, 'bleskovka-rekord-390-tmavy');
        // Rozehraná hra a odchod Domů: nic se nezapíše
        await tab.click('[data-action="mode-again"]');
        await waitQuestion(tab, 1);
        await tab.click('#btn-home');
        await tab.waitForSelector('[data-action="play-topic"]');
        await tab.waitForTimeout(300);
        assert.equal((await storage(tab, 'mudrlant.modes')).blitz.games, 2, 'odehraná je jen dokončená hra');
        assert.equal(await tab.evaluate(() => Boolean(document.querySelector('[data-mode-question]'))), false);
        assert.deepEqual(problems, []);
        await context.close();
    });

    for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
        await t.test(`Přežití: tři životy, chyba ubere srdce, konec po třetí chybě (${viewport.width}×${viewport.height}, ${colorScheme})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            await openMode(tab, 'survival');
            const intro = await tab.textContent('[data-mode-intro]');
            assert.match(intro, /3 životy/);
            assert.match(intro, /Začíná se známými/);
            assert.match(intro, /\+4\sXP za každou přežitou otázku/);
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 }, 'úvod bez posouvání');
            await shot(tab, `preziti-uvod-360-${colorScheme}`);
            await tab.click('[data-action="mode-start"]');
            await waitQuestion(tab, 1);
            assert.equal(await tab.getAttribute('[data-mode-lives]', 'data-mode-lives'), '3');
            assert.match(await tab.textContent('[data-mode-lives]'), /Známé/);
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 }, 'otázka bez posouvání');
            assert.equal(await tab.locator('[data-action="hint"]').count(), 0, 'bez nápověd');
            await shot(tab, `preziti-otazka-360-${colorScheme}`);
            const { right } = await solve(tab);
            await tab.click(`[data-action="mode-choice"][data-index="${right}"]`);
            const missed = [];
            for (let asked = 2; asked <= 4; asked++) {
                await waitQuestion(tab, asked);
                const question = await solve(tab);
                missed.push(question.item.q);
                await tab.click(`[data-action="mode-choice"][data-index="${question.wrong}"]`);
                await tab.waitForSelector(`[data-mode-lives="${4 - asked}"]`);
                if (asked === 2) {
                    assert.deepEqual(await tab.evaluate(() => window.__vibrations), [40], 'krátká vibrace při chybě');
                    await shot(tab, `preziti-chyba-360-${colorScheme}`);
                }
            }
            await tab.waitForSelector('[data-mode-result="survival"]');
            const result = await tab.textContent('[data-mode-result]');
            assert.match(result, /1\s*přežitá otázka/);
            assert.match(result, /Otázek\s*4/);
            assert.match(result, /\+4 XP za 1 přežitou otázku/);
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 }, 'výsledek bez posouvání');
            const mistakes = await storage(tab, 'mudrlant.mistakes');
            for (const q of missed) assert.ok(mistakes.includes(`zemepis:${q}`), `chyba ${q} v Mých chybách`);
            const modes = await storage(tab, 'mudrlant.modes');
            assert.deepEqual(modes.survival.best, { zemepis: 1 });
            assert.equal(modes.blitz.games, 0, 'rekordy Bleskovky zvlášť');
            await shot(tab, `preziti-vysledek-360-${colorScheme}`);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    for (const [viewport, colorScheme] of [[{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'light']]) {
        await t.test(`Bleskovka: úvod, otázka i výsledek bez posouvání (${viewport.width}×${viewport.height}, ${colorScheme})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            await openMode(tab, 'blitz');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `bleskovka-uvod-${viewport.width}-${colorScheme}`);
            await tab.click('[data-action="mode-start"]');
            await waitQuestion(tab, 1);
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            const timer = await tab.evaluate(() => { const r = document.querySelector('[data-mode-clock-chip]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
            assert.ok(timer.top >= 0 && timer.bottom < viewport.height / 3, 'odpočet je nahoře na očích');
            await shot(tab, `bleskovka-otazka-${viewport.width}-${colorScheme}`);
            // Jedna správná odpověď (s nulou není co sdílet), pak Ukončit hru
            const first = await solve(tab);
            await tab.click(`[data-action="mode-choice"][data-index="${first.right}"]`);
            await waitQuestion(tab, 2);
            await tab.click('[data-action="mode-quit"]');
            await tab.waitForSelector('[data-mode-result="blitz"]');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `bleskovka-vysledek-${viewport.width}-${colorScheme}`);
            // Sdílet obrázek (share-card.js): bez podpory sdílení souboru se PNG stáhne
            const [download] = await Promise.all([tab.waitForEvent('download'), tab.click('[data-action="mode-share-image"]')]);
            assert.match(download.suggestedFilename(), /^mudrlant-bleskovka-\d{4}-\d{2}-\d{2}\.png$/);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('Nastavení → Hra: Zvuky a Vibrace (výchozí zapnuté), volba se pamatuje, vypnuté zvuky mlčí; karta se vejde', async () => {
        for (const [viewport, colorScheme, limit] of [[{ width: 390, height: 780 }, 'light', 0], [{ width: 360, height: 640 }, 'dark', 0]]) {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            await tab.click('#btn-settings');
            await tab.waitForSelector('[data-sound-toggle]');
            assert.equal(await tab.getAttribute('[data-sound-toggle]', 'aria-checked'), 'true');
            assert.equal(await tab.getAttribute('[data-vibration-toggle]', 'aria-checked'), 'true');
            assert.equal(await tab.getAttribute('[data-sound-toggle]', 'role'), 'switch');
            const sizes = await tab.evaluate(() => [...document.querySelectorAll('[data-sound-toggle], [data-vibration-toggle]')].map(el => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); }));
            // Řádek přepínače: 44 px, na nízkém displeji (360×640) 40 px, ať se karta Hra vejde bez posouvání
            for (const size of sizes) assert.ok(size >= (viewport.height > 770 ? 44 : 40), `přepínač ${size} px`);
            // Karta Hra se neposouvá na 390×780 ani na 360×640 (host)
            const over = await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight - box.clientHeight; });
            assert.ok(over <= limit, `karta Hra ${viewport.width}×${viewport.height}: posun ${over} px (nejvýš ${limit})`);
            await shot(tab, `nastaveni-zvuky-${viewport.width}-${colorScheme}`);
            await tab.click('[data-sound-toggle]');
            await tab.waitForFunction(() => document.querySelector('[data-sound-toggle]').getAttribute('aria-checked') === 'false');
            await tab.click('[data-vibration-toggle]');
            await tab.waitForFunction(() => document.querySelector('[data-vibration-toggle]').getAttribute('aria-checked') === 'false');
            assert.deepEqual(await storage(tab, 'mudrlant.sound'), { sound: false, vibration: false });
            assert.match(await tab.textContent('#settings-note'), /Vibrace jsou vypnuté/);
            await tab.click('#settings-overlay [data-close]');
            // Po obnovení stránky platí uložená volba a hra mlčí
            await tab.reload();
            await tab.waitForSelector('[data-action="play-topic"]');
            await openMode(tab, 'survival');
            await tab.click('[data-action="mode-start"]');
            await waitQuestion(tab, 1);
            const { wrong } = await solve(tab);
            await tab.click(`[data-action="mode-choice"][data-index="${wrong}"]`);
            await tab.waitForSelector('[data-mode-lives="2"]');
            assert.deepEqual(await tab.evaluate(() => [window.__tones.length, window.__vibrations.length]), [0, 0], 'vypnuté zvuky i vibrace');
            await tab.click('#btn-settings');
            assert.equal(await tab.getAttribute('[data-sound-toggle]', 'aria-checked'), 'false');
            assert.deepEqual(problems, []);
            await context.close();
        }
    });
});
