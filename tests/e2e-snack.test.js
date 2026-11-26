// Jednohubka (snack.js, app.js oddíl Jednohubka) v prohlížeči: čip u nadpisu Režimy na záložce Hrát (úvod se kvůli němu neposouvá),
// rovnou otázka z povoleného tématu (výběr ze 4 možností, panel otázky z běžné hry), okamžitý výsledek s kartou odpovědi, série
// správných v řadě bez trestu, XP s denním stropem, chyby do Mých chyb, Ještě jednu a Hotovo zpět přesně tam, odkud hráč přišel
// (záložka i rozehraná otázka tréninku), Zpět v prohlížeči. Rozložení na 360×640 a 390×780 ve světlém i tmavém režimu bez posouvání.
// Snímky: SHOTS_DIR=složka. Potřebuje Playwright (viz tests/e2e.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const nav = require('./nav.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Úvod článku nese značku položky (K + QID): test podle ní pozná správnou odpověď (jako tests/e2e-modes.test.js)
// Mix jen ze Zeměpisu: known = všechna témata, ať je aplikace do mixu nepřidá jako nová
const ALL_TOPICS = fs.readdirSync(path.join(ROOT, 'topics')).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
const ZEMEPIS = fixtures.files['/data/zemepis.json'].items;
const COUNTRIES = fixtures.files['/data/countries.json'].countries;
const BY_TITLE = new Map(ZEMEPIS.map(item => [item.t, item]));
const BY_Q = new Map(ZEMEPIS.map(item => [item.q, item]));
const extract = (title) => BY_TITLE.has(title)
    ? `Tato položka má v ukázce značku K${BY_TITLE.get(title).q} a je známá svou krásou, dlouhou historií a mnoha zajímavostmi, které je třeba uhodnout. ` +
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

test('Jednohubka', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // Mix jen ze Zeměpisu (test pozná správnou odpověď podle značky v popisu); seed = další položky localStorage
    const open = async ({ viewport = { width: 360, height: 640 }, colorScheme = 'light', seed = {} } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen otázky s výběrem (Seřaď a Odhadni: e2e-numeric)
        await context.addInitScript(([seed, known]) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
            localStorage.setItem('mudrlant.settings', JSON.stringify({ tier: 'known', topics: ['zemepis'], known, seen: ['zemepis'] }));
            for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, JSON.stringify(value));
        }, [seed, ALL_TOPICS]);
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.fallback();
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: extract(url.searchParams.get('titles')) } } } } });
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
    // Po doběhnutí úvodních animací (fade-in), nekonečné se nečekají
    const fits = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const main = document.getElementById('app-content');
        return { scroll: main.scrollHeight - main.clientHeight, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const storage = (tab, key) => tab.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), key);
    const waitQuestion = (tab, count) => tab.waitForSelector(`#snack-screen[data-snack-phase="question"][data-snack-count="${count}"]`);
    // Správná odpověď podle značky v popisu (otázka na název) nebo podle státu pojmenované položky (Ve kterém státě to je?)
    const solve = async (tab) => {
        const info = await tab.evaluate(() => {
            const panel = document.querySelector('#snack-screen [role="tabpanel"]');
            const named = panel.querySelector('b');
            return { text: panel.textContent, name: named ? named.textContent.trim() : null, labels: [...document.querySelectorAll('[data-action="snack-choice"]')].map(el => el.textContent.trim()) };
        });
        const item = info.name ? BY_TITLE.get(info.name) : BY_Q.get((info.text.match(/značku K(Q\d+)/) || [])[1]);
        assert.ok(item, `položka otázky: ${info.text.slice(0, 120)}`);
        const answer = info.name ? COUNTRIES[item.co[0]].name : item.n;
        const right = info.labels.indexOf(answer);
        assert.ok(right >= 0, `správná odpověď ${answer} mezi ${info.labels.join(', ')}`);
        return { right, wrong: right === 0 ? 1 : 0, answer, item };
    };
    const openSnack = async (tab) => {
        await nav.go(tab, 'hrat');
        await tab.click('[data-action="snack-open"]');
    };
    const again = async (tab) => {
        await tab.waitForTimeout(450);
        await tab.click('[data-action="snack-again"]');
    };

    await t.test('čip na záložce Hrát úvod neposune; otázka, správně a špatně, série, XP, chyby, Ještě jednu a Hotovo zpět na Hrát', async () => {
        const { context, tab, problems } = await open();
        await nav.go(tab, 'hrat');
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 }, 'záložka Hrát se s čipem neposouvá');
        const chip = await tab.evaluate(() => {
            const button = document.querySelector('[data-action="snack-open"]').getBoundingClientRect();
            const heading = [...document.querySelectorAll('#tab-hrat h2')].find(h => /Režimy/.test(h.textContent)).getBoundingClientRect();
            return { h: button.height, w: button.width, row: Math.abs((button.top + button.height / 2) - (heading.top + heading.height / 2)) < 4, right: button.right <= window.innerWidth };
        });
        assert.ok(chip.h >= 44 && chip.w >= 44, `čip ${chip.w}×${chip.h}`);
        assert.deepEqual([chip.row, chip.right], [true, true], 'čip je v řádku nadpisu Režimy');
        await shot(tab, 'hrat-cip-360-light');
        const before = (await storage(tab, 'mudrlant.progress') || { xp: 0 }).xp || 0;

        // Rovnou otázka: bez úvodu a výběru, spodní lišta skrytá, štítek v hlavičce, nic se neposouvá
        await openSnack(tab);
        await waitQuestion(tab, 1);
        assert.equal(await tab.locator('#app-nav.hidden').count(), 1, 'při otázce bez spodní lišty');
        assert.match(await tab.textContent('#status-badge'), /Jednohubka · Zeměpis/i);
        assert.equal((await tab.textContent('[data-snack-streak]')).trim(), 'Nová série');
        assert.equal(await tab.locator('[data-action="snack-choice"]').count(), 4);
        assert.equal(await tab.locator('[data-action="snack-again"], [data-action="snack-done"], [data-action="hint"]').count(), 0, 'před odpovědí jen otázka');
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });

        // Správně: hned výsledek, karta odpovědi s popisem z Wikipedie, +3 XP a Série 1
        const first = await solve(tab);
        await tab.click(`[data-action="snack-choice"][data-index="${first.right}"]`);
        await tab.waitForSelector('#snack-screen[data-snack-phase="answered"] [data-snack-verdict="correct"]');
        assert.equal((await tab.textContent('#result-tab-panel [data-answer-name]')).trim(), first.item.n);
        assert.equal((await tab.textContent('[data-snack-xp]')).replace(/\s+/g, ' ').trim(), '+3 XP');
        assert.equal((await tab.textContent('[data-snack-streak]')).trim(), 'Série 1');
        assert.match(await tab.textContent('[data-snack-note]'), /Dobrý začátek série/);
        assert.equal(await tab.locator('[data-action="snack-choice"]:not([disabled])').count(), 0, 'po odpovědi nejde klepnout znovu');
        assert.equal(await tab.evaluate(() => document.activeElement && document.activeElement.dataset.action), 'snack-again', 'Ještě jednu má fokus');
        const sizes = await tab.evaluate(() => ['snack-again', 'snack-done'].map(action => { const box = document.querySelector(`[data-action="${action}"]`).getBoundingClientRect(); return { w: box.width, h: box.height, bottom: box.bottom }; }));
        assert.ok(sizes[0].w > sizes[1].w * 1.5 && sizes[0].h >= sizes[1].h, `Ještě jednu je velké, Hotovo menší: ${JSON.stringify(sizes)}`);
        assert.ok(sizes.every(size => size.bottom <= 640 && size.h >= 44), 'obě tlačítka celá na očích');
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        assert.deepEqual(await storage(tab, 'mudrlant.snack'), { v: 1, day: await tab.evaluate(() => window.MudrlantCore.getDayKey()), xp: 3, played: 1, correct: 1, streak: 1, best: 1, past: 0 });
        assert.equal((await storage(tab, 'mudrlant.progress')).xp, before + 3);
        await shot(tab, 'jednohubka-spravne-360-light');

        // Ještě jednu: další otázka; špatně = Tentokrát ne, +1 XP za pokus, nová série, chyba do Mých chyb
        await again(tab);
        await waitQuestion(tab, 2);
        assert.equal((await tab.textContent('[data-snack-streak]')).trim(), 'Série 1');
        const second = await solve(tab);
        await tab.click(`[data-action="snack-choice"][data-index="${second.wrong}"]`);
        await tab.waitForSelector('[data-snack-verdict="wrong"]');
        assert.equal((await tab.textContent('[data-snack-xp]')).replace(/\s+/g, ' ').trim(), '+1 XP');
        assert.equal((await tab.textContent('[data-snack-streak]')).trim(), 'Nová série');
        assert.match(await tab.textContent('[data-snack-note]'), new RegExp(`Správně je ${second.answer}\\.`));
        const mistakes = await storage(tab, 'mudrlant.mistakes');
        assert.ok(JSON.stringify(mistakes).includes(second.item.q), 'chyba je v Mých chybách');
        const saved = await storage(tab, 'mudrlant.snack');
        assert.deepEqual([saved.played, saved.correct, saved.streak, saved.best, saved.xp], [2, 1, 0, 1, 4]);
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await shot(tab, 'jednohubka-spatne-360-light');

        // Hotovo: zpět na záložku Hrát
        await tab.click('[data-action="snack-done"]');
        await tab.waitForSelector('#app-content > [data-tab-root="hrat"]');
        assert.equal(await tab.locator('#app-nav.hidden').count(), 0, 'spodní lišta je zpátky');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Hotovo i Zpět vrátí přesně tam, odkud hráč přišel: rozehraná otázka tréninku zůstane k dohrání', async () => {
        const { context, tab, problems } = await open({ viewport: { width: 390, height: 780 } });
        // Rozehraná otázka Mixu, pak zpět na Hrát: vedle Mixu je Pokračovat
        await nav.mix(tab);
        await tab.waitForSelector('[data-action="give-up"]');
        const practiceTitle = (await tab.textContent('#app-content h2')).trim();
        await tab.click('#btn-home');
        await tab.waitForSelector('#app-content > [data-tab-root="hrat"] [data-action="resume-practice"]');
        await openSnack(tab);
        await waitQuestion(tab, 1);
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        // Zpět v prohlížeči (telefon) během otázky: bez ptaní zpět na Hrát, Pokračovat zůstane
        await tab.goBack();
        await tab.waitForSelector('#app-content > [data-tab-root="hrat"] [data-action="resume-practice"]');
        assert.equal(await tab.locator('#dialog-overlay').count(), 0);
        assert.equal(await storage(tab, 'mudrlant.snack'), null, 'bez odpovědi se nic nezapíše');
        // Znovu, odpověď a Hotovo: zpět na Hrát a rozehraná otázka jde dohrát
        await openSnack(tab);
        await waitQuestion(tab, 1);
        const { right } = await solve(tab);
        await tab.click(`[data-action="snack-choice"][data-index="${right}"]`);
        await tab.waitForSelector('[data-snack-verdict="correct"]');
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await tab.click('[data-action="snack-done"]');
        await tab.waitForSelector('#app-content > [data-tab-root="hrat"] [data-action="resume-practice"]');
        await tab.click('[data-action="resume-practice"]');
        await tab.waitForSelector('[data-action="give-up"]');
        assert.equal((await tab.textContent('#app-content h2')).trim(), practiceTitle, 'pokračuje stejná otázka tréninku');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('denní strop XP: po vyčerpání bez XP, série se počítá dál; nová nejlepší série', async () => {
        const day = await (async () => { const { context, tab } = await open(); const key = await tab.evaluate(() => window.MudrlantCore.getDayKey()); await context.close(); return key; })();
        const { context, tab, problems } = await open({ seed: { 'mudrlant.snack': { day, xp: 30, played: 9, correct: 8, streak: 2, best: 2, past: 2 } } });
        const before = (await storage(tab, 'mudrlant.progress') || { xp: 0 }).xp || 0;
        await openSnack(tab);
        await waitQuestion(tab, 1);
        assert.equal((await tab.textContent('[data-snack-streak]')).trim(), 'Série 2');
        assert.match(await tab.textContent('#snack-screen [data-snack-status]'), /Nejlepší série 2/i);
        const { right } = await solve(tab);
        await tab.click(`[data-action="snack-choice"][data-index="${right}"]`);
        await tab.waitForSelector('[data-snack-verdict="correct"]');
        assert.equal(await tab.locator('[data-snack-xp]').count(), 0, 'nad strop bez XP');
        assert.equal((await tab.textContent('[data-snack-streak]')).trim(), 'Série 3');
        const note = await tab.textContent('[data-snack-note]');
        assert.match(note, /Nejlepší série: 3!/);
        assert.match(note, /strop 30\sXP za jednohubky je vyčerpaný/);
        assert.equal(((await storage(tab, 'mudrlant.progress')) || { xp: 0 }).xp || 0, before);
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('rozložení 360×640 a 390×780, světlý i tmavý režim: otázka i výsledek bez posouvání', async () => {
        for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 780 }]) {
            for (const colorScheme of ['light', 'dark']) {
                const { context, tab, problems } = await open({ viewport, colorScheme });
                const name = `${viewport.width}-${colorScheme}`;
                await nav.go(tab, 'hrat');
                assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 }, `Hrát ${name}`);
                await shot(tab, `hrat-${name}`);
                await openSnack(tab);
                await waitQuestion(tab, 1);
                assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 }, `otázka ${name}`);
                await shot(tab, `otazka-${name}`);
                const { right, wrong } = await solve(tab);
                await tab.click(`[data-action="snack-choice"][data-index="${colorScheme === 'light' ? right : wrong}"]`);
                await tab.waitForSelector('#snack-screen[data-snack-phase="answered"]');
                assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 }, `výsledek ${name}`);
                await shot(tab, `vysledek-${name}`);
                assert.deepEqual(problems, []);
                await context.close();
            }
        }
    });
});
