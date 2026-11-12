// Mudrlantova kronika v prohlížeči (chronicle.js, app.js): pruh „Tvůj týden v kostce je hotový“ na úvodu v neděli večer a v pondělí
// (jednou za týden, jde skrýt), okno s příběhem v pěti kartách (titul, čísla, téma a objev, souboje, cíl a sdílení), sdílení obrázku,
// Kronika týdne z Mého postupu (minulý a tento týden) a zápis odpovědi do denních záznamů. Telefon 390×780 i 360×640 (tmavý),
// okna bez posouvání a bez chyb CSP. MUDRLANT_SHOTS=adresář uloží snímky (deviceScaleFactor 1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.MUDRLANT_SHOTS || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
// Neděle 15. 11. 2026 20:00 v Praze
const SUNDAY = '2026-11-15T19:00:00Z';
const MONDAY = '2026-11-16T09:00:00Z';
const WEDNESDAY = '2026-11-11T10:00:00Z';
const WEEK = '2026-11-09';

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

// Týden 9.–15. 11.: pět dní hraní, Zeměpis vede (34 z 50 otázek), výhra a prohra ve výzvě, dva objevy; minulý týden 40 otázek z Historie
const WEEK_LOG = {
    v: 1, seen: '', days: {
        '2026-11-03': { a: 40, c: 30, p: 80, xp: 400, h: [0, 40, 0, 0], t: { historie: [40, 30] } },
        '2026-11-09': { a: 20, c: 16, p: 50, xp: 300, run: 9, h: [0, 20, 0, 0], t: { zemepis: [14, 12], historie: [6, 4] }, n: 4, ex: ['Lichtenštejnsko', 'zemepis'] },
        '2026-11-10': { a: 10, c: 7, p: 20, xp: 120, run: 5, h: [0, 5, 5, 0], t: { zemepis: [6, 5], hudba: [4, 2] }, cw: 1, cp: 1 },
        '2026-11-12': { a: 8, c: 6, p: 18, xp: 90, h: [0, 8, 0, 0], t: { zemepis: [8, 6] }, cl: 1, cp: 1, n: 2, ex: ['Bhútán', 'zemepis'] },
        '2026-11-14': { a: 6, c: 5, p: 12, xp: 60, h: [0, 6, 0, 0], t: { vlajky: [6, 5] } },
        '2026-11-15': { a: 6, c: 5, p: 14, xp: 70, run: 12, h: [0, 0, 6, 0], t: { zemepis: [6, 5] } }
    }
};

test('kronika týdne: pruh, příběh, sdílení, skrytí a Můj postup', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', seed = {}, now = SUNDAY } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        // Systémové sdílení souboru: zapamatuje si, co se sdílelo
        await context.addInitScript(() => {
            navigator.canShare = (data) => Boolean(data && data.files && data.files.length);
            navigator.share = async (data) => { window.__shared = { files: (data.files || []).map(file => ({ name: file.name, type: file.type, size: file.size })), text: data.text || '' }; };
        });
        await context.addInitScript((data) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.homeTab', JSON.stringify('single'));
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
            for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
        }, { 'mudrlant.week': WEEK_LOG, 'mudrlant.progress': { xp: 1040, counters: { answered: 90, correct: 69, days: 6 }, badges: {} }, ...seed });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.clock.setFixedTime(new Date(now));
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };
    const storage = (tab, key) => tab.evaluate((name) => JSON.parse(localStorage.getItem(name)), key);
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const noScroll = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const box = document.getElementById('app-content');
        return box.scrollHeight <= box.clientHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth;
    });
    const dialogOverflow = (tab) => tab.evaluate(() => { const box = document.getElementById('dialog-overlay').firstElementChild; return { v: box.scrollHeight - box.clientHeight, h: box.scrollWidth - box.clientWidth }; });
    const page = (tab) => tab.getAttribute('[data-chronicle]', 'data-kr-page');
    // Tlačítka v okně kroniky aspoň 40 px
    const smallButtons = (tab) => tab.$$eval('#dialog-overlay [data-chronicle] button', nodes => nodes.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && Math.min(r.width, r.height) < 39.5; }).map(el => el.textContent.trim()));

    for (const [name, viewport, colorScheme] of [['390×780', { width: 390, height: 780 }, 'light'], ['360×640 tmavý', { width: 360, height: 640 }, 'dark']]) {
        await t.test(`neděle večer: pruh, pět karet, sdílení a jednou za týden (${name})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            const tag = `${viewport.width}x${viewport.height}-${colorScheme}`;
            const strip = tab.locator(`[data-chronicle-strip="${WEEK}"]`);
            await strip.waitFor();
            assert.match(await strip.textContent(), /Tvůj týden v kostce je hotový[\s\S]*Zeměpisný cestovatel týdne · 9\. – 15\. 11\./);
            assert.equal(await tab.locator('#weekly-goals').count(), 1, 'pruh je místo pruhu cílů týdne');
            assert.equal(await tab.locator('[data-action="goals-open"]').count(), 0);
            assert.ok(await noScroll(tab), 'úvod bez posouvání');
            await shot(tab, `kronika-uvod-${tag}`);

            await tab.click('[data-action="chronicle-open"]');
            await tab.waitForSelector('#dialog-overlay [data-chronicle]');
            assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Kronika týdne');
            assert.equal((await storage(tab, 'mudrlant.week')).seen, WEEK, 'otevřením je týden viděný');
            assert.equal(await tab.locator('[data-kr-week]').count(), 0, 'z pruhu bez přepínače týdnů');
            const pages = [];
            for (let i = 0; i < 5; i++) {
                pages.push(await page(tab));
                assert.deepEqual(await dialogOverflow(tab), { v: 0, h: 0 }, `karta ${pages[i]} se vejde bez posouvání`);
                assert.deepEqual(await smallButtons(tab), [], 'tlačítka aspoň 40 px');
                await tab.waitForTimeout(150);
                await shot(tab, `kronika-${i + 1}-${pages[i]}-${tag}`);
                if (pages[i] === 'titul') {
                    assert.equal(await tab.textContent('[data-kr-title]'), 'Zeměpisný cestovatel týdne');
                    assert.match(await tab.textContent('[data-chronicle]'), /Hráno 5 dní ze 7/);
                    assert.equal(await tab.locator('[data-kr-prev]').isDisabled(), true);
                }
                if (pages[i] === 'cisla') {
                    assert.equal((await tab.innerText('[data-kr-answered]')).replace(/\s+/g, ' ').trim(), '50 odpovědí');
                    assert.match(await tab.textContent('[data-kr-accuracy]'), /78 %/);
                    assert.match(await tab.textContent('[data-kr-xp]'), /\+640/);
                    assert.match(await tab.textContent('[data-kr-compare="more"]'), /O 25 % víc než minulý týden/);
                    assert.match(await tab.textContent('[data-kr-run]'), /12 správných v řadě/);
                    // Zpět a znovu dál
                    await tab.click('[data-kr-prev]');
                    assert.equal(await page(tab), 'titul');
                    await tab.click('[data-kr-next]');
                    assert.equal(await page(tab), 'cisla');
                }
                if (pages[i] === 'tema') {
                    assert.equal(await tab.getAttribute('[data-kr-topic]', 'data-kr-topic'), 'zemepis');
                    assert.equal(await tab.locator('[data-kr-card] img[src="icons/topics/zemepis.webp"]').count(), 1, 'ilustrace tématu');
                    assert.match(await tab.textContent('[data-kr-discovery]'), /6 nových poznaných položek/);
                    assert.equal(await tab.textContent('[data-kr-example]'), 'Bhútán');
                }
                if (pages[i] === 'souboje') {
                    assert.match(await tab.textContent('[data-kr-won]'), /1\s*výhra/);
                    assert.match(await tab.textContent('[data-kr-lost]'), /1\s*prohra/);
                }
                if (i < 4) {
                    // Karta se listuje klepnutím na kartu (jako příběh), jinak tlačítkem Dál
                    if (i % 2) await tab.click('[data-kr-card]', { position: { x: 40, y: 40 } });
                    else await tab.click('[data-kr-next]');
                }
            }
            assert.deepEqual(pages, ['titul', 'cisla', 'tema', 'souboje', 'zaver']);
            assert.equal(await tab.getAttribute('[data-kr-goal]', 'data-kr-goal'), 'tema', 'cíl: téma, které zůstalo stranou');
            assert.match(await tab.textContent('[data-kr-next]'), /Hotovo/);
            // Sdílení obrázku přes systémové sdílení
            await tab.click('[data-kr-share]');
            await tab.waitForFunction(() => window.__shared);
            const shared = await tab.evaluate(() => window.__shared);
            assert.deepEqual(shared.files.map(file => [file.name, file.type]), [['mudrlant-tyden-2026-11-09.png', 'image/png']]);
            assert.ok(shared.files[0].size > 5000, 'obrázek není prázdný');
            assert.match(shared.text, /^Můj týden v Mudrlantovi \(9\. – 15\. 11\.\): 50 odpovědí, 78 % správně, \+640 XP, 5 dní ze 7\. Titul: Zeměpisný cestovatel týdne\./);
            assert.equal((await storage(tab, 'mudrlant.progress')).counters.sharedImages, 1, 'počítadlo sdílených obrázků');
            // Hotovo zavře okno; pruh zmizí a na úvodu jsou zase cíle týdne
            await tab.click('[data-kr-next]');
            await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
            await tab.waitForSelector('[data-action="goals-open"]');
            assert.equal(await tab.locator('[data-chronicle-strip]').count(), 0);
            await tab.reload();
            await tab.waitForSelector('[data-action="goals-open"]');
            assert.equal(await tab.locator('[data-chronicle-strip]').count(), 0, 'jednou za týden');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('karta pro sdílení: obrázek sedmi dnů s titulem', async () => {
        const { context, tab, problems } = await open();
        const info = await tab.evaluate(async () => {
            const K = window.MudrlantChronicle;
            const sum = K.summarize(JSON.parse(localStorage.getItem(K.KEY)), '2026-11-09');
            const card = K.cardInput(sum, K.verdict(sum, {}), { robe: 'vinova', url: location.href, appName: 'Mudrlant' });
            const canvas = await window.MudrlantShareCard.render(card);
            return { w: canvas.width, h: canvas.height, owl: canvas.dataset.owl, grid: card.grid, url: canvas.toDataURL('image/png') };
        });
        assert.deepEqual([info.w, info.h], [1080, 1080]);
        assert.match(info.owl, /^icons\/topics\/sova-[a-z]+\.webp$/);
        assert.deepEqual(info.grid, [true, true, null, true, null, true, true]);
        if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'kronika-sdileni.png'), Buffer.from(info.url.split(',')[1], 'base64'));
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('skrytí pruhu křížkem; pondělí ukáže minulý týden; ve středu pruh není', async () => {
        const monday = await open({ now: MONDAY, viewport: { width: 360, height: 640 } });
        await monday.tab.waitForSelector(`[data-chronicle-strip="${WEEK}"]`);
        await monday.tab.click('[data-action="chronicle-dismiss"]');
        await monday.tab.waitForSelector('[data-action="goals-open"]');
        assert.equal(await monday.tab.locator('[data-chronicle-strip]').count(), 0);
        assert.equal((await storage(monday.tab, 'mudrlant.week')).seen, WEEK);
        assert.equal(await monday.tab.locator('#dialog-overlay').count(), 0, 'skrytí okno neotevře');
        assert.deepEqual(monday.problems, []);
        await monday.context.close();
        const wednesday = await open({ now: WEDNESDAY });
        await wednesday.tab.waitForSelector('[data-action="goals-open"]');
        assert.equal(await wednesday.tab.locator('[data-chronicle-strip]').count(), 0);
        await wednesday.context.close();
        // Neděle večer, ale týden s jediným dnem hraní: pruh se nenabízí
        const thin = await open({ seed: { 'mudrlant.week': { v: 1, days: { '2026-11-15': { a: 3, c: 2 } } } } });
        await thin.tab.waitForSelector('[data-action="goals-open"]');
        assert.equal(await thin.tab.locator('[data-chronicle-strip]').count(), 0);
        await thin.context.close();
    });

    for (const [name, viewport] of [['390×780', { width: 390, height: 780 }], ['360×640', { width: 360, height: 640 }]]) {
        await t.test(`Kronika týdne z Mého postupu: minulý a tento týden, zpět do Mého postupu (${name})`, async () => {
            const { context, tab, problems } = await open({ now: WEDNESDAY, viewport });
            await tab.click('#btn-settings');
            await tab.click('[data-open-progress]');
            await tab.waitForSelector('[data-progress-dialog]');
            assert.deepEqual(await dialogOverflow(tab), { v: 0, h: 0 }, 'Můj postup se vejde i s odkazem na kroniku');
            await tab.click('[data-open-chronicle]');
            await tab.waitForSelector('[data-chronicle]');
            // Ve středu: minulý týden (2.–8. 11.) je dokončený, jen úterý s Historií
            assert.equal(await tab.getAttribute('[data-kr-week="last"]', 'aria-selected'), 'true');
            assert.equal(await tab.getAttribute('[data-chronicle]', 'data-kr-week-key'), '2026-11-02');
            assert.equal(await tab.textContent('[data-kr-title]'), 'Strážce dějin týdne');
            assert.deepEqual(await dialogOverflow(tab), { v: 0, h: 0 });
            assert.deepEqual(await smallButtons(tab), []);
            await shot(tab, `kronika-postup-minuly-${viewport.width}x${viewport.height}`);
            // Tento týden zatím (pondělí a úterý; středa už podle zápisu)
            await tab.click('[data-kr-week="this"]');
            assert.equal(await tab.getAttribute('[data-chronicle]', 'data-kr-week-key'), WEEK);
            assert.equal(await tab.getAttribute('[data-kr-week="this"]', 'aria-selected'), 'true');
            await tab.click('[data-kr-next]');
            assert.equal((await tab.innerText('[data-kr-answered]')).replace(/\s+/g, ' ').trim(), '50 odpovědí');
            assert.deepEqual(await dialogOverflow(tab), { v: 0, h: 0 });
            await shot(tab, `kronika-postup-tento-${viewport.width}x${viewport.height}`);
            // Křížek vrátí do Mého postupu
            await tab.click('#dialog-overlay [data-close]');
            await tab.waitForSelector('[data-progress-dialog]');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('odpověď se zapíše do denního záznamu kroniky (Praha)', async () => {
        const { context, tab, problems } = await open({ now: WEDNESDAY, seed: { 'mudrlant.week': { v: 1, days: {} } } });
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="choice"]');
        await tab.click('[data-action="choice"] >> nth=0');
        await tab.waitForFunction(() => { const log = JSON.parse(localStorage.getItem('mudrlant.week') || '{}'); return log.days && log.days['2026-11-11']; });
        const day = (await storage(tab, 'mudrlant.week')).days['2026-11-11'];
        assert.equal(day.a, 1);
        assert.deepEqual(day.h, [0, 1, 0, 0], '11:00 v Praze = den');
        assert.equal(day.t.zemepis[0], 1);
        assert.ok(day.xp > 0, 'XP za odpověď');
        assert.equal(day.c || 0, day.t.zemepis[1]);
        if (day.c) assert.equal(day.n, 1, 'správná odpověď = nově poznaná položka');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
