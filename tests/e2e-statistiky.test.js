// Statistiky pro nadšence v prohlížeči (statistiky.js, app.js): dlaždice Statistiky na záložce Postup, okno s pěti částmi (Přehled, Témata,
// Vývoj, Záměny, Rekordy), řazení tabulky témat a rozbalení okruhů, přepnutí týdnů a měsíců, kalendář hraní jako SVG a zápis odpovědi do souhrnu.
// Telefon 390×780 (světlý) i 360×640 (tmavý): záložka Postup bez posouvání, okno bez posunu do stran (dlouhé části se posouvají uvnitř okna,
// nadpis s křížkem zůstává nahoře), tlačítka aspoň 40 px, bez chyb CSP. MUDRLANT_SHOTS=adresář uloží snímky.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const nav = require('./nav.js');
const S = require('../statistiky.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.MUDRLANT_SHOTS || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const NOW = '2026-11-26T10:00:00Z';
const TODAY = '2026-11-26';

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

// Souhrn: 8 týdnů hraní ve třech tématech (Zeměpis vede počtem, Hudba úspěšností), dvě záměny, doba odpovědi
const seedState = () => {
    let state = S.parse(null);
    for (let i = 55; i >= 0; i--) {
        if (i % 3 === 1) continue;
        const day = S.addDays(TODAY, -i);
        for (let k = 0; k < 6; k++) state = S.record(state, { topic: 'zemepis', category: k % 2 ? 'stat' : 'mesto', correct: k % 3 !== 0, hints: k % 3, known: k < 4, ms: 3000 + k * 4000, mode: 'practice' }, day);
        state = S.record(state, { topic: 'hudba', category: 'skladatele', correct: true, ms: 6000, mode: 'daily', known: true }, day);
    }
    for (let i = 0; i < 3; i++) state = S.record(state, { topic: 'zemepis', category: 'stat', correct: false, ms: 5000, right: { id: 'Q40', label: 'Rakousko' }, wrong: { id: 'Q408', label: 'Austrálie' } }, '2026-11-20');
    state = S.record(state, { topic: 'zemepis', category: 'stat', correct: false, ms: 5000, right: { id: 'Q408', label: 'Austrálie' }, wrong: { id: 'Q40', label: 'Rakousko' } }, '2026-11-21');
    return state;
};

test('statistiky pro nadšence: dlaždice, okno s pěti částmi, řazení, grafy a zápis odpovědi', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', seed = {} } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        await context.addInitScript((data) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
            for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
        }, {
            'mudrlant.progress': { xp: 2040, counters: { answered: 300, correct: 210, days: 37, bestRun: 14, bestStreak: 6, topicBest: { zemepis: 11 }, blitzBest: 12 }, badges: {} },
            'mudrlant.learned': { zemepis: ['Q1', 'Q2', 'Q3', 'Q4'], hudba: ['Q5'] },
            'mudrlant.modes': { v: 1, blitz: { best: { mix: 12 }, top: 12, games: 4, total: 30 }, survival: { best: {}, top: 0, games: 0, total: 0 } },
            ...seed
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.clock.setFixedTime(new Date(NOW));
        await tab.goto(`${origin}/`);
        await nav.waitForHome(tab);
        return { context, tab, problems };
    };
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const tabFits = (tab) => tab.evaluate(() => { const box = document.getElementById('app-content'); return box.scrollHeight <= box.clientHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth; });
    // Okno: žádný posun do stran (panel ani stránka), nadpis s křížkem vidět i po posunutí dolů
    const dialogCheck = (tab) => tab.evaluate(async () => {
        const panel = document.querySelector('#dialog-overlay > div');
        const head = panel.querySelector('[data-dialog-head]');
        const wide = [...panel.querySelectorAll('[data-stats] *')].filter(el => { const r = el.getBoundingClientRect(); const p = panel.getBoundingClientRect(); return r.width > 0 && (r.right > p.right + 1 || r.left < p.left - 1); }).map(el => el.tagName + (el.dataset ? Object.keys(el.dataset).join(',') : ''));
        panel.scrollTop = panel.scrollHeight;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const h = head.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const headSeen = h.top >= p.top - 1 && h.bottom <= p.bottom + 1;
        panel.scrollTop = 0;
        return { hscroll: panel.scrollWidth - panel.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth, wide: wide.slice(0, 5), headSeen };
    });
    const smallButtons = (tab) => tab.$$eval('#dialog-overlay [data-stats] button', nodes => nodes.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && Math.min(r.width, r.height) < 39.5; }).map(el => el.textContent.trim()));
    // Zavře okna (Statistiky otevřené z Mistrovství se zavřou zpět do Mistrovství, pak i to)
    const closeAll = async (tab) => {
        for (let i = 0; i < 3 && await tab.$('#dialog-overlay'); i++) { await tab.click('#dialog-overlay [data-close]'); await tab.waitForTimeout(400); }
        await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
    };
    const text = (tab, selector) => tab.evaluate((sel) => document.querySelector(sel).innerText.replace(/\s+/g, ' ').trim(), selector);

    for (const [name, viewport, colorScheme] of [['390×780', { width: 390, height: 780 }, 'light'], ['360×640 tmavý', { width: 360, height: 640 }, 'dark']]) {
        await t.test(`Postup → Statistiky, všechny části (${name})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme, seed: { 'mudrlant.statistiky': seedState() } });
            const tag = `${viewport.width}x${viewport.height}-${colorScheme}`;
            await nav.go(tab, 'postup');
            assert.equal(await tab.locator('#postup-tiles [data-open-stats]').count(), 0, 'Statistiky nemají na Postupu dlaždici (místo má Pas)');
            assert.ok(await tabFits(tab), 'záložka Postup se vejde bez posouvání');
            await shot(tab, `statistiky-postup-${tag}`);

            await tab.click('#postup-tiles [data-open-mastery-all]');
            await tab.click('[data-mastery-dialog] [data-open-stats]');
            await tab.waitForSelector('#dialog-overlay [data-stats]');
            assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Statistiky pro nadšence');
            // Z Mistrovství se Statistiky otevřou na části Témata; přepne se na Přehled
            assert.equal(await tab.getAttribute('[data-stats]', 'data-st-current'), 'temata');
            await tab.click('[data-st-tab="prehled"]');
            await tab.waitForSelector('[data-stats][data-st-current="prehled"]');
            // Přehled: souhrn jako text (8 týdnů, 37 dní × 7 odpovědí + 4 záměny)
            const days = 56 - Math.floor(56 / 3) - (56 % 3 > 1 ? 1 : 0);
            const answered = days * 7 + 4;
            assert.equal(await text(tab, '[data-st-answered] .text-lg'), answered.toLocaleString('cs-CZ'));
            assert.match(await text(tab, '[data-st-rate]'), /^Úspěšnost \d+,\d %/);
            assert.match(await text(tab, '[data-st-time]'), /^Průměrná doba \d+,\d s z /);
            assert.match(await text(tab, '[data-st-known]'), /Známější položky \d+,\d % \d+ správně z \d+ · \d+,\d % všech odpovědí/);
            assert.match(await text(tab, '[data-st-since]'), /od 3\. 10\. 2026/);
            const check = async (part) => {
                const found = await dialogCheck(tab);
                assert.equal(found.hscroll, 0, `${part}: okno se neposouvá do stran`);
                assert.equal(found.page, 0, `${part}: stránka se neposouvá do stran`);
                assert.deepEqual(found.wide, [], `${part}: nic nepřečnívá`);
                assert.ok(found.headSeen, `${part}: nadpis s křížkem zůstává vidět`);
                assert.deepEqual(await smallButtons(tab), [], `${part}: tlačítka aspoň 40 px`);
            };
            await check('Přehled');
            await shot(tab, `statistiky-prehled-${tag}`);

            // Témata: výchozí řazení podle počtu odpovědí, klepnutí na % seřadí od nejvyšší úspěšnosti, znovu obráceně
            await tab.click('[data-st-tab="temata"]');
            await tab.waitForSelector('[data-st-table]');
            const order = () => tab.$$eval('[data-st-topic]', rows => rows.map(row => row.dataset.stTopic));
            assert.deepEqual((await order()).slice(0, 2), ['zemepis', 'hudba']);
            assert.equal(await tab.getAttribute('th:has([data-st-sort="answered"])', 'aria-sort'), 'descending');
            await tab.click('[data-st-sort="rate"]');
            assert.deepEqual((await order()).slice(0, 2), ['hudba', 'zemepis']);
            assert.equal(await tab.getAttribute('th:has([data-st-sort="rate"])', 'aria-sort'), 'descending');
            assert.equal(await tab.evaluate(() => document.activeElement && document.activeElement.dataset.stSort), 'rate', 'zaměření zůstane na sloupci');
            await tab.click('[data-st-sort="rate"]');
            assert.equal(await tab.getAttribute('th:has([data-st-sort="rate"])', 'aria-sort'), 'ascending');
            await tab.click('[data-st-sort="answered"]');
            // Okruhy Zeměpisu: Státy a Města, dohromady celé téma
            await tab.click('[data-st-open="zemepis"]');
            assert.equal(await tab.getAttribute('[data-st-open="zemepis"]', 'aria-expanded'), 'true');
            const okruhy = await tab.$$eval('[data-st-okruh] th', cells => cells.map(cell => cell.textContent.trim()));
            assert.deepEqual(okruhy, ['Státy', 'Města']);
            const sums = await tab.evaluate(() => {
                const cells = (row) => [...row.querySelectorAll('td')].map(td => Number(td.textContent.replace(/\D/g, '')));
                const topic = cells(document.querySelector('[data-st-topic="zemepis"]'));
                const parts = [...document.querySelectorAll('[data-st-okruh]')].map(cells);
                return { topic: topic[0], parts: parts.reduce((sum, row) => sum + row[0], 0) };
            });
            assert.equal(sums.topic, sums.parts, 'okruhy dávají dohromady téma');
            await check('Témata');
            await shot(tab, `statistiky-temata-${tag}`);

            // Vývoj: kalendář (22 týdnů, budoucí dny bez políčka) a graf týdnů → měsíců s tabulkou
            await tab.click('[data-st-tab="vyvoj"]');
            await tab.waitForSelector('[data-st-heat] svg');
            const cells = await tab.$$eval('[data-st-heat] rect[data-level]', rects => rects.length);
            assert.equal(cells, (S.HEAT_WEEKS - 1) * 7 + 4, 'čtvrtek = 4 dny posledního týdne');
            assert.match(await text(tab, '[data-st-heat-text]'), new RegExp(`hráno ${days} dní`));
            const weeks = S.trend(S.dayTotals({ state: seedState() }), TODAY, 'weeks').filter(row => row.a).length;
            assert.equal(await tab.$$eval('[data-st-chart="weeks"] rect', rects => rects.length), weeks, 'sloupec za každý týden s odpověďmi');
            await tab.click('[data-st-period="months"]');
            await tab.waitForSelector('[data-st-chart="months"]');
            assert.match(await text(tab, '[data-st-trend-table] tbody tr:first-child'), /^listopad 2026 \d+ \d+ \d+ \d+,\d %$/);
            await check('Vývoj');
            await shot(tab, `statistiky-vyvoj-${tag}`);

            // Záměny: dvojice Rakousko ↔ Austrálie, 4× (3× a 1×)
            await tab.click('[data-st-tab="zameny"]');
            await tab.waitForSelector('[data-st-pairs]');
            const first = await text(tab, '[data-st-pairs] > li:first-child');
            assert.match(first, /^1\. Rakousko ↔ Austrálie 4× Zeměpis · naposledy 21\. 11\. 2026 Správně Rakousko, odpověď Austrálie: 3× Správně Austrálie, odpověď Rakousko: 1×$/);
            await check('Záměny');
            await shot(tab, `statistiky-zameny-${tag}`);

            // Rekordy ze všech módů
            await tab.click('[data-st-tab="rekordy"]');
            await tab.waitForSelector('[data-st-records]');
            const records = await text(tab, '#st-panel');
            assert.match(records, /Nejdelší řada správných odpovědí 14/);
            assert.match(records, /Bleskovka: rekord odehráno 4 12 správně/);
            await check('Rekordy');
            await shot(tab, `statistiky-rekordy-${tag}`);

            // Zavřením zpět na záložce Postup; při dalším otevření stejná část
            await closeAll(tab);
            assert.equal(await nav.currentTab(tab), 'postup');
            await tab.click('#postup-tiles [data-open-mastery-all]');
            await tab.click('[data-mastery-dialog] [data-open-stats]');
            await tab.waitForSelector('[data-stats]');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('bez souhrnu: prázdné části se srozumitelným textem, odpověď se zapíše', async () => {
        const { context, tab, problems } = await open({ viewport: { width: 360, height: 640 } });
        await nav.go(tab, 'postup');
        await tab.click('#postup-tiles [data-open-mastery-all]');
        await tab.click('[data-mastery-dialog] [data-open-stats]');
        await tab.waitForSelector('[data-stats]');
        await tab.click('[data-st-tab="prehled"]');
        await tab.waitForSelector('[data-stats][data-st-current="prehled"]');
        assert.match(await text(tab, '[data-st-timing]'), /Doba odpovědi se zatím neměřila/);
        await tab.click('[data-st-tab="zameny"]');
        await tab.waitForSelector('[data-st-pairs-empty]');
        assert.match(await text(tab, '[data-st-pairs-empty]'), /^Zatím tu žádné záměny nejsou\./);
        await shot(tab, 'statistiky-prazdne-360x640');
        await closeAll(tab);

        // Druhá cesta (vždy, i když se desátá dlaždice na nízký telefon nevejde): Mistrovství témat → Statistiky na části Témata, zpět do Mistrovství
        await tab.click('#postup-tiles [data-open-mastery-all]');
        await tab.waitForSelector('[data-mastery-dialog] [data-open-stats]');
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return box.scrollHeight - box.clientHeight; }), 0, 'odkaz se vejde do volného místa mřížky');
        await tab.click('[data-mastery-dialog] [data-open-stats]');
        await tab.waitForSelector('[data-stats][data-st-current="temata"]');
        await tab.click('#dialog-overlay [data-dialog-back]');
        await tab.waitForSelector('[data-mastery-dialog]');
        await closeAll(tab);

        // Dnešní otázka ze Zeměpisu: odpověď se zapíše do souhrnu (den, téma, okruh, druh hry, doba)
        await nav.daily(tab, 'zemepis');
        await tab.waitForSelector('[data-action="choice"]');
        const label = (await tab.textContent('[data-action="choice"] >> nth=0')).replace(/\s+/g, ' ').trim();
        await tab.click('[data-action="choice"] >> nth=0');
        await tab.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('mudrlant.statistiky') || '{}'); return s.days && s.days['2026-11-26']; });
        const state = S.parse(await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.statistiky'))));
        assert.equal(state.since, TODAY);
        const [a, c] = state.days[TODAY];
        assert.equal(a, 1);
        assert.deepEqual(state.m, { daily: [1, c] });
        assert.equal(Object.values(state.t.zemepis).reduce((sum, p) => sum + p[0], 0), 1);
        assert.equal(state.ms.n, 1, 'doba odpovědi změřená');
        assert.equal(state.h[0][0], 1, 'bez nápovědy');
        const pairs = Object.values(state.x);
        if (c) assert.deepEqual(pairs, [], 'správná odpověď není záměna');
        else if (pairs.length) assert.equal(pairs[0][2], label, 'záměna s textem zvolené možnosti');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
