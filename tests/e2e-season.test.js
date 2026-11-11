// Sezóna Mudrlanta a odměny za sérii dní v prohlížeči (season.js, rewards.js, app.js): pruh s čekajícími odměnami na úvodu, odhalení
// odměny (pečeť, Truhla v půli sezóny, Sezónní truhla s rámečkem a titulem, nasazení), karta v Mém postupu a okno s cestou 20 stupňů,
// dovybrání minulé sezóny do 7. dne a pak propadnutí, omezený pohyb a řádek „Další odměna za sérii“. Telefon 390×780 i 360×640,
// světlý i tmavý režim, okna bez posouvání a bez chyb CSP. MUDRLANT_SHOTS=adresář uloží snímky.
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
const NOW = '2026-11-11T10:00:00Z';
const NOV = '2026-11';

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
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const dayBefore = (offset) => new Date(Date.parse(NOW) - offset * 86400000).toISOString().slice(0, 10);
const streakDays = (count) => Object.fromEntries(Array.from({ length: count }, (_, i) => [dayBefore(i + 1), { correct: true, points: 4, hintLevel: 1, levelCount: 4 }]));
// Odznaky, které hráč s 26 000 XP dávno má (ať se v testu neslaví nové)
const BADGES = { tyden: '2026-10-01', 'serie-3': '2026-10-01', 'uroven-5': '2026-10-01', 'uroven-10': '2026-10-01', 'uroven-20': '2026-10-01' };

test('sezóna: pruh, odhalení odměn, cesta, Sezónní truhla, dovybrání a odměny za sérii', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', reducedMotion = 'no-preference', seed = {}, now = NOW } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        await context.addInitScript((data) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
            for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
        }, seed);
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
    const clearCelebrations = async (tab) => { for (let i = 0; i < 8 && await tab.locator('#celebration').count(); i++) { await tab.locator('#celebration').click({ timeout: 1500 }).catch(() => {}); await tab.waitForTimeout(250); } };
    const fits = async (tab, selector, viewport) => {
        const box = await tab.locator(selector).boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height + 1 && box.x >= 0 && box.x + box.width <= viewport.width, `${selector} se vejde: ${JSON.stringify(box)}`);
    };
    // Po doběhnutí úvodních animací (fade-in posouvá obsah o 10 px), nekonečné (pulzování) se nečekají
    const noScroll = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const box = document.getElementById('app-content');
        return box.scrollHeight <= box.clientHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth;
    });
    const dialogOverflow = (tab) => tab.evaluate(() => { const box = document.getElementById('dialog-overlay').firstElementChild; return box.scrollHeight - box.clientHeight; });

    for (const [name, viewport, colorScheme] of [['390×780', { width: 390, height: 780 }, 'light'], ['360×640 tmavý', { width: 360, height: 640 }, 'dark']]) {
        await t.test(`pruh na úvodu, pečeť, další odměna, karta v Mém postupu a cesta (${name})`, async () => {
            // Sezóna od 21 000 XP, hráč má 26 000 → 5 000 XP sezóny = stupeň 10; stupně 1 a 2 už vyzvednuté
            const seed = { 'mudrlant.progress': { xp: 26000, counters: { bestStreak: 5 }, badges: BADGES }, 'mudrlant.rewards': { season: { id: NOV, startXp: 21000, claimed: { 1: 'robes:fialova', 2: 'freeze' } }, freezes: 1 } };
            const { context, tab, problems } = await open({ viewport, colorScheme, seed });
            const tag = `${viewport.width}-${colorScheme}`;
            const strip = tab.locator('[data-season-ready]');
            await strip.waitFor();
            assert.match(await strip.textContent(), /Sezóna Listopad: čekají 8 odměn/);
            assert.equal(await tab.locator('#weekly-goals').count(), 1, 'pruh je místo cílů týdne (jeden řádek)');
            assert.ok(await noScroll(tab), 'úvod bez posouvání');
            await shot(tab, `sezona-uvod-${tag}`);
            await strip.click();
            await tab.waitForSelector('#season-overlay [data-season-go]');
            assert.match(await tab.textContent('#season-overlay'), /Listopad 2026 · stupeň 3[\s\S]*Odměna sezóny[\s\S]*Klepni na pečeť/i);
            await fits(tab, '#season-overlay [data-season-card]', viewport);
            await shot(tab, `sezona-pecet-${tag}`);
            await tab.click('#season-overlay [data-season-go]');
            // Další klepnutí během otevírání nic neudělají
            await tab.evaluate(() => document.querySelector('#season-overlay .season-seal').click());
            await tab.waitForSelector('[data-season-reveal] [data-season-item]');
            await tab.waitForTimeout(1300);
            await shot(tab, `sezona-odmena-${tag}`);
            await fits(tab, '#season-overlay [data-season-card]', viewport);
            let rewards = await storage(tab, 'mudrlant.rewards');
            assert.deepEqual(Object.keys(rewards.season.claimed).sort(), ['1', '2', '3']);
            assert.equal(rewards.season.claimed[3], 'freeze', 'stupeň 3: ochrana série');
            assert.equal(rewards.freezes, 2);
            assert.match(await tab.textContent('[data-season-item]'), /Ochrana série/);
            // Další → stupeň 4 (věc), rovnou nasadit
            assert.match(await tab.textContent('[data-season-next]'), /Další\s*7/);
            await tab.click('[data-season-next]');
            await tab.waitForSelector('#season-overlay [data-season-go]');
            await tab.click('#season-overlay [data-season-go]');
            await tab.waitForSelector('[data-season-reveal] [data-season-item]');
            rewards = await storage(tab, 'mudrlant.rewards');
            const [category, id] = rewards.season.claimed[4].split(':');
            assert.ok(rewards.gifts[category].includes(id), 'věc mezi dárky');
            const item = (await tab.textContent('[data-season-item]')).trim();
            assert.ok(item.length > 2);
            if (await tab.locator('[data-season-wear]').count()) {
                await tab.click('[data-season-wear]');
                const look = await storage(tab, 'mudrlant.look');
                const key = { robes: 'robe', themes: 'theme', frames: 'frame' }[category];
                if (key) assert.equal(look[key], id, 'nasazeno');
                else assert.ok(Object.values(look.acc).some(entry => entry.id === id), 'doplněk nasazen');
                await tab.waitForSelector('#season-overlay [data-season-go]');
            } else await tab.click('[data-season-next]');
            await tab.click('#season-overlay [data-season-close]');
            assert.equal(await tab.locator('#season-overlay').count(), 0);
            await clearCelebrations(tab);
            // Můj postup: karta sezóny se stupněm, dny do konce a počtem čekajících odměn
            await tab.click('#btn-settings');
            await tab.click('[data-open-progress]');
            await tab.waitForSelector('[data-season-card]');
            assert.match(await tab.textContent('[data-season-card]'), /Sezóna Listopad[\s\S]*10\/20[\s\S]*zbývá 20 dní[\s\S]*Vzít\s*6/);
            assert.ok(await dialogOverflow(tab) <= (viewport.height < 700 ? 24 : 0), 'Můj postup se vejde');
            await shot(tab, `sezona-muj-postup-${tag}`);
            // Okno s cestou: 20 stupňů (vyzvednuté, čekající, zamčené), popis zvoleného stupně
            await tab.click('[data-season-open]');
            await tab.waitForSelector('[data-season-path]');
            assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Sezóna Listopad 2026');
            const states = await tab.$$eval('[data-season-tier]', nodes => nodes.map(node => node.dataset.state));
            assert.equal(states.length, 20);
            assert.deepEqual(states.slice(0, 4), ['claimed', 'claimed', 'claimed', 'claimed']);
            assert.deepEqual(states.slice(4, 10), Array(6).fill('ready'));
            assert.deepEqual(states.slice(10), Array(10).fill('locked'));
            assert.equal(await dialogOverflow(tab), 0, 'okno sezóny bez posouvání');
            await shot(tab, `sezona-cesta-${tag}`);
            await tab.click('[data-season-tier="20"]');
            assert.match(await tab.textContent('[data-season-detail]'), /Stupeň 20:.*Sezónní truhla: Lampion, Listopadový rámeček, titul Šampion sezóny.*19\s100 XP/);
            // Klepnutí na čekající stupeň ho rovnou otevře
            await tab.click('[data-season-tier="7"]');
            await tab.waitForSelector('#season-overlay [data-season-go]');
            assert.match(await tab.textContent('#season-overlay'), /stupeň 7/i);
            await tab.keyboard.press('Escape');
            assert.equal(await tab.locator('#season-overlay').count(), 0, 'Escape zavře, stupeň čeká dál');
            assert.equal((await storage(tab, 'mudrlant.rewards')).season.claimed[7], undefined);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('Truhla v půli sezóny a Sezónní truhla: dvě věci, doplněk a rámeček měsíce a titul, nasazení přežije nové načtení', async () => {
        const claimed = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 'freeze']));
        const seed = { 'mudrlant.progress': { xp: 46000, counters: {}, badges: BADGES }, 'mudrlant.rewards': { season: { id: NOV, startXp: 21000, claimed }, freezes: 2 } };
        const { context, tab, problems } = await open({ seed });
        await tab.click('[data-season-ready]');
        await tab.waitForSelector('#season-overlay [data-season-go]');
        assert.match(await tab.textContent('#season-overlay'), /Truhla v půli sezóny[\s\S]*Klepni na truhlu/);
        assert.equal(await tab.locator('#season-overlay img[src="icons/topics/truhla.webp"]').count(), 1);
        await tab.click('#season-overlay [data-season-go]');
        await tab.waitForSelector('[data-season-reveal]');
        assert.equal(await tab.locator('[data-season-prize]').count(), 2, 'dvě věci vějířem');
        const mid = (await storage(tab, 'mudrlant.rewards')).season.claimed[10].split('+');
        assert.equal(mid.length, 2);
        assert.notEqual(mid[0].split(':')[0], mid[1].split(':')[0]);
        // Zbylé stupně 11–19 rychle (vyzvednou se bez nasazení), pak Sezónní truhla
        for (let tier = 11; tier <= 19; tier++) {
            await tab.click('[data-season-next]');
            await tab.waitForSelector('#season-overlay [data-season-go]');
            await tab.click('#season-overlay [data-season-go]');
            await tab.waitForSelector('[data-season-reveal]');
        }
        await tab.click('[data-season-next]');
        await tab.waitForSelector('#season-overlay [data-season-go]');
        assert.match(await tab.textContent('#season-overlay'), /Sezóna Listopad 2026[\s\S]*Celá cesta sezóny[\s\S]*Sezónní truhla/);
        assert.equal(await tab.locator('#season-overlay .season-royal .season-ribbon').count(), 1, 'slavnostní truhla se stuhou');
        await tab.waitForTimeout(400);
        await shot(tab, 'sezonni-truhla-zavrena');
        await tab.click('#season-overlay [data-season-go]');
        await tab.waitForSelector('[data-season-reveal]');
        await tab.waitForTimeout(2200);
        await shot(tab, 'sezonni-truhla-otevrena');
        assert.match(await tab.textContent('[data-season-item]'), /Lampion · Listopadový rámeček · titul Šampion sezóny/);
        // Listopadový doplněk Lampion (jen ze Sezónní truhly) je mezi třemi věcmi vějířem
        assert.equal(await tab.locator('[data-season-prize]').count(), 3);
        assert.equal(await tab.locator('#season-overlay [data-season-prize] img[src="icons/doplnky/lampion-ikona.webp"]').count(), 1);
        const rewards = await storage(tab, 'mudrlant.rewards');
        assert.equal(rewards.season.claimed[20], 'accessories:lampion+frames:sezona-11+titles:sampion-sezony');
        assert.ok(rewards.gifts.frames.includes('sezona-11') && rewards.gifts.titles.includes('sampion-sezony') && rewards.gifts.accessories.includes('lampion'));
        await tab.click('[data-season-wear]');
        let look = await storage(tab, 'mudrlant.look');
        assert.equal(look.frame, 'sezona-11', 'exkluzivní rámeček nasazený');
        assert.deepEqual(look.acc.hand, { id: 'lampion', color: 'original' }, 'lampion v ruce');
        assert.equal(look.title, 'sampion-sezony', 'titul nasazený');
        // Po novém načtení zůstane (dárek ze sezóny = odemčeno), titul je u jména v Nastavení
        await tab.reload();
        await tab.waitForSelector('[data-action="play-topic"]');
        await clearCelebrations(tab);
        look = await storage(tab, 'mudrlant.look');
        assert.equal(look.frame, 'sezona-11');
        assert.equal(await tab.evaluate(() => window.MudrlantLook.prefs({ level: 37, badges: {} }).frame), 'sezona-11');
        // Lampion na sově v hlavičce (nová ruka: výchozí ruka se skryje maskou)
        assert.equal(await tab.locator('#status-icon-slot [data-owl][class*="owl-nohand"] [data-owl-layer][src="icons/doplnky/lampion.webp"]').count(), 1, 'lampion na logu v hlavičce');
        await tab.click('#btn-settings');
        await tab.waitForSelector('#settings-overlay [data-open-progress]');
        assert.match(await tab.textContent('#settings-overlay [data-open-progress]'), /Šampion sezóny/);
        // Ve výběru doplňků je z sezónních jen ten vlastněný (Lampion), s barvami
        await tab.click('[data-me-tab="owl"]');
        await tab.click('[data-owl-slot="hand"]');
        await tab.waitForSelector('[data-owl-pick="hand:lampion"][aria-pressed="true"]');
        assert.equal(await tab.locator('[data-owl-pick="hand:destnik"], [data-owl-pick="hand:zmrzlina"]').count(), 0, 'nevlastněné sezónní doplňky ve výběru nejsou');
        await tab.click('[data-owl-color="hand:modra"]');
        await tab.waitForSelector('#status-icon-slot [data-owl-layer][src="icons/doplnky/lampion-modra.webp"]');
        await tab.keyboard.press('Escape');
        assert.equal(await tab.locator('[data-season-ready]').count(), 0, 'nic nečeká');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('omezený pohyb: pečeť se otevře hned, bez animací', async () => {
        const seed = { 'mudrlant.progress': { xp: 1000, counters: {}, badges: {} }, 'mudrlant.rewards': { season: { id: NOV, startXp: 700, claimed: {} } } };
        const { context, tab, problems } = await open({ reducedMotion: 'reduce', seed });
        await clearCelebrations(tab);
        await tab.click('[data-season-ready]');
        await tab.waitForSelector('#season-overlay [data-season-go]');
        const still = (selector) => tab.evaluate((css) => [...document.querySelectorAll(css)].every(el => getComputedStyle(el).animationName === 'none'), selector);
        assert.ok(await still('#season-overlay [data-season-card] *'), 'bez pohybu');
        await tab.click('#season-overlay [data-season-go]');
        await tab.waitForSelector('[data-season-reveal]', { timeout: 300 });
        assert.ok(await still('#season-overlay [data-season-card] *'), 'otevřená bez pohybu');
        assert.ok(await tab.locator('[data-season-prize]').isVisible());
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('minulá sezóna: nevyzvednuté stupně jdou vyzvednout do 7. dne, pak propadnou', async () => {
        const rewards = { season: { id: '2026-12', startXp: 29500, claimed: {} }, past: { id: NOV, startXp: 21000, endXp: 29500, claimed: { 1: 'robes:fialova' } } };
        const seed = { 'mudrlant.progress': { xp: 29600, counters: {}, badges: BADGES }, 'mudrlant.rewards': rewards };
        let { context, tab, problems } = await open({ seed, now: '2026-12-03T10:00:00Z' });
        const strip = tab.locator('[data-season-ready]');
        await strip.waitFor();
        assert.match(await strip.textContent(), /Sezóna Listopad: 12 odměn jen do 7\. 12\./);
        await shot(tab, 'sezona-minula-uvod');
        await strip.click();
        await tab.waitForSelector('#season-overlay [data-season-go]');
        assert.match(await tab.textContent('#season-overlay'), /Listopad 2026 · stupeň 2/i);
        await tab.click('#season-overlay [data-season-go]');
        await tab.waitForSelector('[data-season-reveal]');
        assert.ok((await storage(tab, 'mudrlant.rewards')).past.claimed[2]);
        await tab.click('#season-overlay [data-season-close]');
        // V okně prosincové sezóny je odkaz na zbytek listopadu
        await clearCelebrations(tab);
        await tab.click('#btn-settings');
        await tab.click('[data-open-progress]');
        await tab.click('[data-season-open]');
        await tab.waitForSelector('[data-season-claim-past]');
        assert.match(await tab.textContent('[data-season-claim-past]'), /Sezóna Listopad 2026: 11 odměn vyzvedni do 7\. 12\./);
        assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Sezóna Prosinec 2026');
        await shot(tab, 'sezona-minula-okno');
        assert.deepEqual(problems, []);
        await context.close();
        // 8. prosince už propadly: na úvodu zase cíle týdne
        ({ context, tab, problems } = await open({ seed, now: '2026-12-08T10:00:00Z' }));
        await tab.waitForSelector('#weekly-goals');
        assert.equal(await tab.locator('[data-season-ready]').count(), 0);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('první spuštění v měsíci: sezóna od teď, další měsíc nová sezóna', async () => {
        const { context, tab, problems } = await open({ seed: { 'mudrlant.progress': { xp: 12345, counters: {}, badges: {} } } });
        const rewards = await storage(tab, 'mudrlant.rewards');
        assert.deepEqual(rewards.season, { id: NOV, startXp: 12345, claimed: {} });
        assert.equal(await tab.locator('[data-season-ready]').count(), 0, 'XP z dřívějška se nepočítá');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('odměny za sérii: štítek série na úvodu, okno ochrany série a výsledek dnešní otázky', async () => {
        const seed = { 'mudrlant.progress': { xp: 3000, counters: { bestStreak: 6 }, badges: { 'serie-3': '2026-11-01' } }, 'mudrlant.stats': { daily: { zemepis: streakDays(6) }, practice: {} }, 'mudrlant.rewards': { freezes: 1 } };
        const { context, tab, problems } = await open({ seed });
        await clearCelebrations(tab);
        assert.match(await tab.getAttribute('[data-action="daily"][data-topic="zemepis"] [title^="Série"]', 'title'), /Série 6 dní · Další odměna za sérii: Jiskra za 7 dní \(zbývá 1\)/);
        await tab.click('[data-action="freeze-info"]');
        await tab.waitForSelector('#dialog-overlay [data-streak-reward]');
        assert.match(await tab.textContent('#dialog-overlay [data-streak-reward]'), /Další odměna za sérii: Jiskra za 7 dní \(zbývá 1\)/);
        assert.equal(await tab.locator('#dialog-overlay [data-streak-reward] .frame-jiskra').count(), 1, 'ukázka rámečku');
        await shot(tab, 'serie-ochrana');
        await tab.keyboard.press('Escape');
        // Výsledek dnešní otázky (vzdáno: série padne na 0)
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
        await tab.click('[data-action="give-up"]');
        await tab.waitForSelector('[data-streak-reward]');
        assert.match(await tab.textContent('[data-streak-reward]'), /Další odměna za sérii: Jiskra za 7 dní \(zbývá 7\)/);
        await tab.evaluate(() => document.querySelector('[data-streak-reward]').scrollIntoView({ block: 'center' }));
        await shot(tab, 'serie-vysledek');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
