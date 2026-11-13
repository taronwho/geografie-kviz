// Tutorial při prvním spuštění (tutorial.js): prohlídka a zkoušení skutečné otázky, přeskočení, jednorázovost, Projít znovu,
// odolnost (pomalá síť, obnovení stránky, Zpět, okna, psaní, rychlé klepání), CSP, bez posouvání okna.
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
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const factFor = (date) => ({ date, year: 1922, title: 'Objev hrobky Tutanchamona', text: 'V roce 1922 objevil Howard Carter vchod do hrobky faraona Tutanchamona.', url: 'https://cs.wikipedia.org/wiki/Tutanchamon', page: 'Tutanchamon', source: 'Wikipedie' });
const SHOTS = process.env.TUTORIAL_SHOTS || '';
const RUNNING = (step) => JSON.stringify({ how: 'running', step });

const startServer = (getFact) => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/data/fakt.json') {
            const fact = getFact();
            if (!fact) { response.writeHead(404); return response.end(); }
            response.writeHead(200, { 'content-type': 'application/json' });
            return response.end(JSON.stringify(fact));
        }
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

test('tutorial při prvním spuštění', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    let fact = factFor(dayKey());
    const server = await startServer(() => fact);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // done = tutoriál je už hotový (jako u ostatních testů); stored = přesný zápis klíče; jinak čistý start v novém zařízení
    // slow = prodleva (ms) odpovědí Wikipedie; variant = způsob odpovídání
    const open = async ({ done = false, stored = null, variant = 'choices', slow = 0, viewport = { width: 390, height: 780 }, scheme = 'light' } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme: scheme });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
        await context.addInitScript(({ isDone, preset, mode }) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', mode);
            if (isDone) localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            if (preset) localStorage.setItem('mudrlant.tutorial', preset);
        }, { isDone: done, preset: stored, mode: variant });
        // Cizí servery (Wikipedie) buď hned selžou, nebo odpovídají se zpožděním
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
            if (slow) await new Promise(resolve => setTimeout(resolve, slow));
            await route.abort().catch(() => {});
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };
    const title = (tab) => tab.textContent('[data-tut-title]');
    const waitTitle = (tab, text, timeout = 30000) => tab.waitForFunction((wanted) => {
        // Krok je opravdu ukázaný (ne čekací bublina bez ztlumení)
        const el = document.querySelector('#tutorial:not(.hidden) [data-tut-title]');
        return el && el.textContent === wanted && !document.querySelector('#tutorial [data-tut-panels]').classList.contains('hidden');
    }, text, { timeout });
    // Bublina je vidět (jakýkoli krok nebo čekací text)
    const bubbleVisible = (tab) => tab.evaluate(() => {
        const root = document.getElementById('tutorial');
        return Boolean(root && !root.classList.contains('hidden') && document.querySelector('[data-tut-bubble]').getBoundingClientRect().height > 0);
    });
    const stored = (tab) => tab.evaluate(() => localStorage.getItem('mudrlant.tutorial'));
    const stepOf = async (tab) => { const value = JSON.parse(await stored(tab)); return value && value.how === 'running' ? value.step : value; };
    const noScroll = (tab) => tab.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight && window.scrollY === 0 && document.body.scrollTop === 0);
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    // Prvek pod bodem je panel tutoriálu (zablokovaný), nebo skutečný prvek stránky
    const blocked = (tab, selector) => tab.evaluate((sel) => {
        const box = document.querySelector(sel).getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return Boolean(hit && hit.closest('#tutorial'));
    }, selector);
    const next = async (tab) => { await tab.waitForTimeout(450); await tab.click('[data-tut-next]'); };
    const inside = (tab) => tab.evaluate(() => {
        const bubble = document.querySelector('[data-tut-bubble]').getBoundingClientRect();
        return bubble.top >= 0 && bubble.bottom <= window.innerHeight && bubble.left >= 0 && bubble.right <= window.innerWidth;
    });
    // Prohlídka od kroku s hlavičkou po poslední vysvětlující krok (Nastavení) až k výzvě zkusit otázku
    const tourFromBadge = async (tab, prefix = '') => {
        for (const [wanted, name] of [['Úroveň a XP', '2-hlavicka'], ['Dnešní otázky', '3-dnes'], ['Výzvy dne', '3b-vyzvy'], ['Tajemná otázka dne', '3c-zahada'], ['Témata a Mix', '4-temata'], ['Více hráčů', '4b-multi'], ['Nastavení', '5-nastaveni']]) {
            await waitTitle(tab, wanted);
            assert.equal(await inside(tab), true, wanted);
            await shot(tab, `${prefix}${name}`);
            await next(tab);
        }
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        assert.equal(await inside(tab), true);
        await shot(tab, `${prefix}6-zkusime`);
    };
    // Zkoušení po otevření otázky: nápověda (přeskočí se), odpověď, výsledek, konec přes Menu / Další
    // Pulzující rámeček je vystředěný na zvýrazněném prvku (i po dokončení animací prvku). Čeká se na stav, ne pevnou dobu:
    // při zatíženém procesoru dobíhají animace (fade-in výsledku) a přeměření rámečku později než za 1,5 s
    const ringCentered = async (tab, selector) => {
        const measure = () => tab.evaluate((sel) => {
            const r = document.querySelector('[data-tut-ring]').getBoundingClientRect(), b = document.querySelector(sel).getBoundingClientRect();
            return [r, b].map(x => ({ cx: x.left + x.width / 2, cy: x.top + x.height / 2, w: x.width, h: x.height }));
        }, selector);
        const centered = ([ring, box]) => Math.abs(ring.cx - box.cx) <= 1.5 && Math.abs(ring.cy - box.cy) <= 1.5 && ring.w - box.w <= 12 && ring.h - box.h <= 12;
        await tab.waitForFunction((sel) => {
            const r = document.querySelector('[data-tut-ring]').getBoundingClientRect(), b = document.querySelector(sel).getBoundingClientRect();
            return Math.abs(r.left + r.width / 2 - b.left - b.width / 2) <= 1.5 && Math.abs(r.top + r.height / 2 - b.top - b.height / 2) <= 1.5 && r.width - b.width <= 12 && r.height - b.height <= 12;
        }, selector, { timeout: 10000 }).catch(() => {});
        const found = await measure();
        assert.ok(centered(found), `rámeček je vystředěný a těsně kolem prvku: ${JSON.stringify(found)}`);
    };
    const finishTrial = async (tab, { typed = false } = {}) => {
        await waitTitle(tab, 'Nápověda');
        await tab.waitForTimeout(450);
        await tab.click('[data-tut-next]');
        await waitTitle(tab, 'Tvoje odpověď');
        if (typed) {
            await tab.fill('#answer-input', 'nevim');
            await tab.press('#answer-input', 'Enter');
        } else await tab.click('[data-action="choice"]');
        await waitTitle(tab, 'Výsledek');
        await ringCentered(tab, '[data-verdict]');
        await next(tab);
        await waitTitle(tab, 'Dál');
        await tab.click('[data-action="daily-home"], [data-action="next"]');
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'done' });
    };

    await t.test('celý průchod: prohlídka (žárovka, hlavička, otázky, témata, nastavení), pak zkoušení otázky', async () => {
        fact = factFor(dayKey());
        const { context, tab, problems } = await open();
        await waitTitle(tab, 'Ahoj, jsem Mudrlant!');
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 1 z 13/);
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'running', step: 0 });
        assert.equal(await tab.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-tut-next')), true, 'focus na Dál');
        assert.equal(await tab.getAttribute('[data-tut-bubble]', 'role'), 'dialog');
        assert.equal(await tab.getAttribute('[data-tut-bubble] [aria-live]', 'aria-live'), 'polite');
        assert.equal(await blocked(tab, '#btn-settings'), true, 'ostatní prvky jsou zablokované');
        assert.equal(await blocked(tab, '[data-action="play-mix"]'), true);
        assert.equal(await blocked(tab, '#fact-hint'), false, 'žárovka zůstává klikatelná (nepovinně)');
        await shot(tab, '1-zarovka');
        // Klepnutí na žárovku otevře událost dne, po zavření se pokračuje
        await tab.click('#fact-hint');
        await tab.waitForSelector('#fact-overlay');
        assert.equal(await tab.isVisible('#tutorial'), false, 'při oknu s událostí tutoriál ustoupí');
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#fact-overlay', { state: 'detached' });
        assert.equal(await stepOf(tab), 1, 'Escape zavřel jen okno, tutoriál běží dál');
        await waitTitle(tab, 'Úroveň a XP');
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 2 z 13/);
        assert.equal(await blocked(tab, '#status-badge'), true, 'prohlídka jen vysvětluje, zvýrazněné prvky jsou zakryté');
        await tourFromBadge(tab, '');
        assert.equal(await tab.locator('#settings-overlay').count(), 0, 'Nastavení se neotevřelo');
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.progress')), null, 'prohlídka nic nehraje');
        assert.equal(await blocked(tab, '[data-action="daily"]'), false);
        assert.equal(await blocked(tab, '[data-action="play-daily"]'), true);
        await tab.click('[data-action="daily"]');
        await waitTitle(tab, 'Nápověda');
        assert.equal(await stepOf(tab), 9);
        assert.equal(await blocked(tab, '[data-action="hint"]'), false);
        await shot(tab, '7-napoveda');
        await tab.click('[data-action="hint"]');
        await waitTitle(tab, 'Tvoje odpověď');
        assert.equal(await blocked(tab, '[data-action="choice"]'), false);
        await shot(tab, '8-odpoved');
        const before = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress') || '{"xp":0}').xp);
        await tab.click('[data-action="choice"]');
        await waitTitle(tab, 'Výsledek');
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'running', step: 11 }, 'po hraní se stav neztratí');
        // Mimo úvod (bez záložky Více hráčů na obrazovce) počítadlo neposkočí na „z 12“
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 12 z 13/);
        await shot(tab, '9-vysledek');
        assert.equal(await blocked(tab, '[data-verdict]'), true, 'výsledek je jen k prohlédnutí');
        const after = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress') || '{"xp":0}').xp);
        assert.ok(after >= before, 'otázka je skutečná');
        await next(tab);
        await waitTitle(tab, 'Dál');
        await shot(tab, '10-menu');
        await tab.click('[data-action="daily-home"]');
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        await tab.waitForSelector('[data-action="play-topic"]');
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'done' });
        assert.equal(await noScroll(tab), true, 'okno se neposouvá');
        assert.deepEqual(problems, [], 'bez chyb CSP');
        // Jednorázové: po obnovení se už neukáže
        await tab.reload();
        await tab.waitForSelector('[data-action="play-topic"]');
        await tab.waitForTimeout(700);
        assert.equal(await tab.locator('#tutorial').count(), 0);
        await context.close();
    });

    await t.test('Přeskočit kdykoli ukončí celý tutoriál a uloží stav; platí i Escape', async () => {
        fact = factFor(dayKey());
        let page = await open();
        await waitTitle(page.tab, 'Ahoj, jsem Mudrlant!');
        await page.tab.click('[data-tut-skip]');
        await page.tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(page.tab)), { how: 'skipped' });
        await page.tab.click('#btn-settings');
        await page.tab.waitForSelector('#settings-overlay');
        assert.deepEqual(page.problems, []);
        await page.context.close();
        page = await open();
        await waitTitle(page.tab, 'Ahoj, jsem Mudrlant!');
        await page.tab.keyboard.press('Escape');
        await page.tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(page.tab)), { how: 'skipped' });
        await page.context.close();
    });

    await t.test('bez dnešní události se začíná hlavičkou, sova se představí a kroků je o jeden méně', async () => {
        fact = null;
        const { context, tab } = await open();
        await waitTitle(tab, 'Úroveň a XP');
        assert.match(await tab.textContent('[data-tut-text]'), /Ahoj, jsem Mudrlant/);
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 1 z 12/);
        await next(tab);
        await waitTitle(tab, 'Dnešní otázky');
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 2 z 12/);
        await context.close();
    });

    await t.test('tlačítko Projít znovu tutoriál v Nastavení → Hra', async () => {
        fact = factFor(dayKey());
        const { context, tab, problems } = await open({ done: true });
        await tab.waitForTimeout(600);
        assert.equal(await tab.locator('#tutorial').count(), 0, 'hotový tutoriál se nespouští');
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-tutorial-restart]');
        await shot(tab, '11-nastaveni-tlacitko');
        await tab.click('[data-tutorial-restart]');
        await tab.waitForSelector('#settings-overlay', { state: 'detached' });
        await waitTitle(tab, 'Ahoj, jsem Mudrlant!');
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'running', step: 0 });
        await tab.keyboard.press('Escape');
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(problems, []);
        await context.close();
    });

    for (const [name, viewport, scheme] of [['tmavý 360x640', { width: 360, height: 640 }, 'dark'], ['světlý 390x780', { width: 390, height: 780 }, 'light']]) {
        await t.test(`bublina a zvýraznění se vejdou na obrazovku (${name})`, async () => {
            fact = factFor(dayKey());
            const { context, tab, problems } = await open({ viewport, scheme });
            const prefix = `v-${viewport.width}-${scheme}-`;
            await waitTitle(tab, 'Ahoj, jsem Mudrlant!');
            assert.equal(await inside(tab), true);
            await shot(tab, `${prefix}1-zarovka`);
            await next(tab);
            // I na úzkém displeji je vedle sovy úroveň (text), na kterou krok s hlavičkou posílá pro postup
            await waitTitle(tab, 'Úroveň a XP');
            assert.match(await tab.textContent('[data-tut-text]'), /klepnutí na text tvůj postup/);
            assert.equal(await tab.isVisible('#status-text'), true, 'úroveň vedle sovy je vidět');
            await tourFromBadge(tab, prefix);
            await tab.click('[data-action="daily"]');
            await waitTitle(tab, 'Nápověda');
            assert.equal(await inside(tab), true);
            await shot(tab, `${prefix}7-napoveda`);
            await next(tab);
            await waitTitle(tab, 'Tvoje odpověď');
            assert.equal(await inside(tab), true);
            await shot(tab, `${prefix}8-odpoved`);
            await tab.click('[data-action="choice"]');
            await waitTitle(tab, 'Výsledek');
            assert.equal(await inside(tab), true);
            await shot(tab, `${prefix}9-vysledek`);
            assert.equal(await noScroll(tab), true);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    // --- Odolnost: tutoriál nesmí zmizet, dokud ho hráč neukončí nebo nedojde na konec ---

    await t.test('pomalá Wikipedie: bublina zůstává s čekacím textem, po 8 s nabídne Přeskočit krok, a dojde se na konec', async () => {
        fact = null;
        const { context, tab, problems } = await open({ stored: RUNNING(8), slow: 11000 });
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        // Čas se měří hodinami stránky od chvíle těsně před klepnutím: tutoriál začne čekat až po klepnutí, takže dokud od něj
        // neuplynulo 8 s (WAIT_MS), Přeskočit krok být vidět nesmí – i když zatížený procesor zdrží jednotlivá měření
        const clicked = await tab.evaluate(() => Date.now());
        await tab.click('[data-action="daily"][data-topic="geologie"]');
        let sawWait = false;
        let earlyChecks = 0;
        for (;;) {
            const state = await tab.evaluate(() => {
                const root = document.getElementById('tutorial');
                return {
                    now: Date.now(),
                    visible: Boolean(root && !root.classList.contains('hidden') && document.querySelector('[data-tut-bubble]').getBoundingClientRect().height > 0),
                    text: (document.querySelector('[data-tut-text]') || {}).textContent || '',
                    skip: Boolean(document.querySelector('[data-tut-skipstep]:not(.hidden)')),
                    stored: localStorage.getItem('mudrlant.tutorial')
                };
            });
            const elapsed = state.now - clicked;
            if (elapsed >= 6000) break;
            assert.equal(state.visible, true, 'bublina nesmí zmizet při pomalém načítání');
            if (/Načítám otázku/.test(state.text)) sawWait = true;
            const saved = JSON.parse(state.stored);
            assert.ok(saved && saved.how === 'running' && saved.step <= 9, 'krok se nepřeskočil');
            assert.equal(state.skip, false, `Přeskočit krok až po delším čekání (${elapsed} ms od klepnutí)`);
            earlyChecks++;
            await tab.waitForTimeout(300);
        }
        assert.equal(sawWait, true, 'čekací text');
        assert.ok(earlyChecks >= 3, `čekání se kontrolovalo průběžně (${earlyChecks}×)`);
        await shot(tab, '12-pomala-sit');
        await tab.waitForSelector('[data-tut-skipstep]:not(.hidden)', { timeout: 15000 });
        assert.match(await tab.textContent('[data-tut-text]'), /nenačetla/);
        await shot(tab, '13-pomala-sit-8s');
        await finishTrial(tab);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Přeskočit krok při čekání posune o jediný krok a tutoriál se dokončí', async () => {
        fact = null;
        const { context, tab } = await open({ stored: RUNNING(8), slow: 60000 });
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        await tab.click('[data-action="daily"][data-topic="geologie"]');
        await tab.waitForSelector('[data-tut-skipstep]:not(.hidden)', { timeout: 15000 });
        assert.equal(await stepOf(tab), 9);
        await tab.click('[data-tut-skipstep]');
        assert.equal(await stepOf(tab), 10, 'jen o jeden krok');
        assert.equal(await bubbleVisible(tab), true);
        await tab.click('[data-tut-skip]');
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'skipped' });
        await context.close();
    });

    await t.test('už zodpovězená dnešní dlaždice: ukáže se rovnou výsledek a tutoriál pokračuje', async () => {
        fact = null;
        // Hráč nejdřív hraje bez tutoriálu, pak se tutoriál obnoví na zkoušení (má statistiky a postup)
        const { context, tab } = await open({ done: true });
        await tab.click('[data-action="daily"][data-topic="geologie"]');
        await tab.waitForSelector('[data-action="choice"]');
        await tab.click('[data-action="choice"]');
        await tab.waitForSelector('[data-verdict]');
        await tab.click('[data-action="daily-home"]');
        await tab.waitForSelector('[data-action="daily"]');
        await tab.evaluate((value) => { localStorage.setItem('mudrlant.tutorial', value); }, RUNNING(8));
        await tab.reload();
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        await tab.waitForSelector('[data-action="daily"][data-topic="geologie"]');
        await tab.click('[data-action="daily"][data-topic="geologie"]');
        await waitTitle(tab, 'Výsledek');
        assert.equal(await bubbleVisible(tab), true);
        await next(tab);
        await waitTitle(tab, 'Dál');
        await tab.click('[data-action="next"]');
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'done' });
        await context.close();
    });

    await t.test('psaná odpověď: Enter bez klepnutí na tlačítko i klepnutí na Odeslat', async () => {
        fact = null;
        for (const submit of ['enter', 'button']) {
            const { context, tab, problems } = await open({ variant: 'typed', stored: RUNNING(8) });
            await waitTitle(tab, 'Teď si to zkusíme doopravdy');
            await tab.click('[data-action="daily"]');
            await waitTitle(tab, 'Nápověda');
            await tab.waitForTimeout(450);
            await tab.click('[data-tut-next]');
            await waitTitle(tab, 'Tvoje odpověď');
            assert.equal(await blocked(tab, '#answer-input'), false, 'pole pro odpověď je klikatelné');
            await tab.fill('#answer-input', 'nevim');
            if (submit === 'enter') await tab.press('#answer-input', 'Enter');
            else await tab.click('#answer-form button[type="submit"]');
            await waitTitle(tab, 'Výsledek');
            await next(tab);
            await waitTitle(tab, 'Dál');
            await tab.click('[data-action="next"]');
            await tab.waitForSelector('#tutorial', { state: 'detached' });
            assert.deepEqual(problems, []);
            await context.close();
        }
    });

    await t.test('rychlé klepání: dvojklik na Dál i na dnešní otázku nic nepřeskočí', async () => {
        fact = null;
        const first = await open();
        await waitTitle(first.tab, 'Úroveň a XP');
        await first.tab.waitForTimeout(500);
        await first.tab.dblclick('[data-tut-next]');
        await waitTitle(first.tab, 'Dnešní otázky');
        await first.tab.waitForTimeout(900);
        assert.equal(await title(first.tab), 'Dnešní otázky', 'dvojklik posunul jen o jeden krok');
        await first.context.close();
        const page = await open({ stored: RUNNING(8) });
        await waitTitle(page.tab, 'Teď si to zkusíme doopravdy');
        await page.tab.dblclick('[data-action="daily"][data-topic="geologie"]');
        await waitTitle(page.tab, 'Nápověda');
        await page.tab.waitForTimeout(1200);
        assert.equal(await title(page.tab), 'Nápověda', 'dvojklik na dlaždici nepřeskočil nápovědu');
        await finishTrial(page.tab);
        await page.context.close();
    });

    await t.test('Zpět v prohlížeči a návrat na úvod uprostřed zkoušení: tutoriál zůstane a vrátí se k výběru otázky', async () => {
        fact = null;
        const { context, tab } = await open({ stored: RUNNING(8) });
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        await tab.click('[data-action="daily"]');
        await waitTitle(tab, 'Nápověda');
        await tab.waitForTimeout(450);
        await tab.click('[data-tut-next]');
        await waitTitle(tab, 'Tvoje odpověď');
        await tab.goBack();
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        assert.equal(await bubbleVisible(tab), true);
        assert.equal(await stepOf(tab), 8);
        // Znovu otevřít dnešní otázku a tentokrát se vrátit tlačítkem domů v hlavičce
        await tab.click('[data-action="daily"]');
        await waitTitle(tab, 'Nápověda');
        await tab.evaluate(() => document.getElementById('btn-home').click());
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        await tab.click('[data-action="daily"]');
        await finishTrial(tab);
        await context.close();
    });

    await t.test('okna uprostřed zkoušení (událost dne, Nastavení): tutoriál ustoupí a po zavření pokračuje stejným krokem', async () => {
        fact = factFor(dayKey());
        const { context, tab } = await open({ stored: RUNNING(8) });
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        await tab.click('[data-action="daily"]');
        await waitTitle(tab, 'Nápověda');
        await tab.evaluate(() => document.getElementById('fact-hint').click());
        await tab.waitForSelector('#fact-overlay');
        await tab.keyboard.press('Escape');
        await waitTitle(tab, 'Nápověda');
        await tab.evaluate(() => document.getElementById('btn-settings').click());
        await tab.waitForSelector('#settings-overlay');
        // Tutoriál se schová v nejbližším snímku po otevření okna (pozorovatel DOM → requestAnimationFrame), ne hned
        await tab.waitForSelector('#tutorial', { state: 'hidden', timeout: 5000 });
        await tab.waitForTimeout(300);
        assert.equal(await tab.isVisible('#tutorial'), false, 'tutoriál zůstává schovaný, dokud je okno otevřené');
        await tab.keyboard.press('Escape');
        await waitTitle(tab, 'Nápověda');
        // Zpět na telefonu zavře okno s událostí, tutoriál přitom nezmizí
        await tab.evaluate(() => document.getElementById('fact-hint').click());
        await tab.waitForSelector('#fact-overlay');
        await tab.goBack();
        await tab.waitForSelector('#fact-overlay', { state: 'detached' });
        await waitTitle(tab, 'Nápověda');
        await finishTrial(tab);
        await context.close();
    });

    await t.test('obnovení stránky uprostřed tutoriálu: pokračuje se (prohlídka, otázka, výsledek) i po hraní', async () => {
        fact = null;
        const { context, tab, problems } = await open();
        await waitTitle(tab, 'Úroveň a XP');
        await next(tab);
        await waitTitle(tab, 'Dnešní otázky');
        await tab.reload();
        await waitTitle(tab, 'Dnešní otázky');
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 2 z 12/);
        await next(tab);
        await waitTitle(tab, 'Výzvy dne');
        await next(tab);
        await waitTitle(tab, 'Tajemná otázka dne');
        await next(tab);
        await waitTitle(tab, 'Témata a Mix');
        await next(tab);
        await waitTitle(tab, 'Více hráčů');
        await next(tab);
        await waitTitle(tab, 'Nastavení');
        await next(tab);
        await waitTitle(tab, 'Teď si to zkusíme doopravdy');
        await tab.click('[data-action="daily"]');
        await waitTitle(tab, 'Nápověda');
        // Obnovení během otázky: tutoriál nezmizí (ať se otázka obnoví, nebo se hráč ocitne na úvodu)
        await tab.reload();
        await tab.waitForSelector('#tutorial:not(.hidden)');
        await tab.waitForTimeout(1500);
        assert.equal(await bubbleVisible(tab), true);
        const midTitle = await title(tab);
        assert.ok(['Nápověda', 'Tvoje odpověď', 'Teď si to zkusíme doopravdy'].includes(midTitle), midTitle);
        if (midTitle === 'Teď si to zkusíme doopravdy') {
            await tab.click('[data-action="daily"]');
            await waitTitle(tab, 'Nápověda');
        }
        await finishTrialFrom(tab);
        assert.deepEqual(problems, []);
        await context.close();

        // Obnovení na výsledku, když hráč už hrál (má statistiky a postup)
        const second = await open({ stored: RUNNING(8) });
        await waitTitle(second.tab, 'Teď si to zkusíme doopravdy');
        await second.tab.click('[data-action="daily"]');
        await waitTitle(second.tab, 'Nápověda');
        await second.tab.waitForTimeout(450);
        await second.tab.click('[data-tut-next]');
        await waitTitle(second.tab, 'Tvoje odpověď');
        await second.tab.click('[data-action="choice"]');
        await waitTitle(second.tab, 'Výsledek');
        await second.tab.reload();
        await second.tab.waitForSelector('#tutorial:not(.hidden)');
        await second.tab.waitForTimeout(1500);
        assert.equal(await bubbleVisible(second.tab), true);
        assert.ok(['Výsledek', 'Teď si to zkusíme doopravdy'].includes(await title(second.tab)));
        if ((await title(second.tab)) === 'Výsledek') {
            await next(second.tab);
            await waitTitle(second.tab, 'Dál');
            await second.tab.click('[data-action="daily-home"], [data-action="next"]');
            await second.tab.waitForSelector('#tutorial', { state: 'detached' });
            assert.deepEqual(JSON.parse(await stored(second.tab)), { how: 'done' });
        } else {
            await second.tab.click('[data-action="daily"][data-topic="geologie"]');
            await finishTrial(second.tab);
        }
        assert.deepEqual(second.problems, []);
        await second.context.close();
    });

    await t.test('uvítání: Domů před výběrem varianty tutoriál nespustí, začne až po výběru varianty', async () => {
        fact = null;
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
        await context.addInitScript(() => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
        });
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort().catch(() => {}));
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#variant-welcome [data-variant]');
        await tab.click('#btn-home');
        await tab.waitForSelector('[data-action="daily"]');
        await tab.waitForTimeout(800);
        assert.equal(await tab.locator('#tutorial').count(), 0, 'bez varianty tutoriál nečeká na otázku, která se nespustí');
        assert.equal(await stored(tab), null);
        // Dnešní otázka bez varianty vrátí na uvítání; po výběru se ukáže úvod a teprve s ním tutoriál od začátku
        await tab.click('[data-action="daily"]');
        await tab.waitForSelector('#variant-welcome [data-variant]');
        assert.equal(await tab.locator('#tutorial').count(), 0);
        await tab.click('#variant-welcome [data-variant="choices"]');
        await waitTitle(tab, 'Úroveň a XP');
        assert.match(await tab.textContent('[data-tut-count]'), /Krok 1 z 12/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    // Dokončení od libovolného kroku zkoušení (po obnovení nevíme, kde přesně hráč je)
    async function finishTrialFrom(tab) {
        for (let i = 0; i < 30; i += 1) {
            const now = await title(tab).catch(() => '');
            if (now === 'Nápověda') { await tab.waitForTimeout(450); await tab.click('[data-tut-next]'); }
            else if (now === 'Tvoje odpověď') await tab.click('[data-action="choice"]');
            else if (now === 'Výsledek') { await next(tab); }
            else if (now === 'Dál') { await tab.click('[data-action="daily-home"], [data-action="next"]'); break; }
            await tab.waitForTimeout(250);
        }
        await tab.waitForSelector('#tutorial', { state: 'detached' });
        assert.deepEqual(JSON.parse(await stored(tab)), { how: 'done' });
    }
});
