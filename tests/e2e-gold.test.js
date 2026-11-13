// Zlatá otázka (gold.js, app.js) v prohlížeči: zlatá karta se štítkem „Zlatá otázka · 3× XP“ a třpytem, bublina s vysvětlením při první
// zlaté otázce, trojnásobek XP, střípek za správnou odpověď bez nápovědy (s nápovědou jen XP), počítadlo mudrlant.gold, pátý střípek otevře
// Zlatou truhlu (stejné okno jako Truhla Mudrlanta) se vzácnou věcí, odznak Zlatokop I, dnešní otázka zůstane zlatá i po návratu, další
// otázka zlatá není, Bleskovka (čas stojí pod bublinou, střípek přiletí do okénka nad hrou, XP navíc ve výsledku), Můj postup → Zlaté
// střípky a okno Zlatá otázka se statistikami. Vše bez posouvání na 360×640 i 390×780, ve světlém i tmavém režimu, CSP bez chyb.
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí. SHOTS_DIR=<složka> uloží snímky obrazovek.
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
// Úvod článku nese značku položky (K + QID): test podle ní v Bleskovce pozná správnou odpověď (jako tests/e2e-modes.test.js)
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

test('Zlatá otázka', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

    // seed = další položky localStorage; motion = animace zapnuté (jinak „omezit pohyb“: bez letu a jiskřiček); clock = hodiny pod kontrolou testu
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', seed = {}, motion = false, clock = false } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion: motion ? 'no-preference' : 'reduce', deviceScaleFactor: 1 });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; window.MUDRLANT_MAP_SHARE = 0; });
        await context.addInitScript((seed) => {
            // Záznam tónů (frekvence): test pozná zvuk zlaté otázky a střípku
            window.__tones = [];
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
            if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org' || url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/png', body: PNG });
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
    const storage = (tab, key) => tab.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), key);
    // Po doběhnutí úvodních animací: přetečení obsahu svisle a vodorovně
    const fits = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const main = document.getElementById('app-content');
        return { scroll: main.scrollHeight - main.clientHeight, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    // Trénink Zeměpisu (okno Co hrát jen poprvé) a první otázka
    const practice = async (tab) => {
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        if (await tab.waitForSelector('#chooser-title', { timeout: 2500 }).then(() => true, () => false)) await tab.click('[data-chooser-play]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
    };
    // Správná možnost rozehrané otázky (uložené kolo v mudrlant.session)
    const rightChoice = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data.question.choices.findIndex(choice => choice.correct));
    const goldLook = (tab) => tab.evaluate(() => {
        const card = document.querySelector('#hint-tab-panel');
        const ribbon = document.querySelector('[data-gold-ribbon] .gold-ribbon');
        const box = (el) => (el ? el.getBoundingClientRect() : null);
        const c = box(card);
        const r = box(ribbon);
        return {
            screen: Boolean(document.querySelector('#app-content > .gold-screen')), card: Boolean(card && card.classList.contains('gold-card')),
            label: ribbon ? ribbon.textContent.replace(/\s+/g, ' ').trim() : null,
            onEdge: Boolean(c && r && Math.abs((r.top + r.bottom) / 2 - c.top) <= 2 && Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2) <= 2),
            bubble: Boolean(document.getElementById('gold-bubble'))
        };
    });

    await t.test('první zlatá otázka: zlatá karta, štítek na jejím okraji, bublina s vysvětlením; správně bez nápovědy = 3× XP, střípek a Zlatokop I', async () => {
        for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 390, height: 780 }, 'dark']]) {
            const seed = { 'mudrlant.gold': { since: 79 }, 'mudrlant.progress': { xp: 0, counters: { goldCorrect: 9 }, badges: {} } };
            const { context, tab, problems } = await open({ viewport, colorScheme, seed });
            await practice(tab);
            await tab.waitForSelector('#gold-bubble');
            assert.deepEqual(await goldLook(tab), { screen: true, card: true, label: 'Zlatá otázka · 3× XP', onEdge: true, bubble: true });
            assert.match(await tab.textContent('#gold-bubble'), /Tohle je Zlatá otázka![\s\S]*trojnásobek XP[\s\S]*zlatý střípek[\s\S]*Pět střípků otevře Zlatou truhlu/);
            // Bublina nezakryje možnosti odpovědí, tlačítko Rozumím je dost velké
            const layout = await tab.evaluate(() => {
                const bubble = document.getElementById('gold-bubble').getBoundingClientRect();
                const choice = document.querySelector('[data-action="choice"]').getBoundingClientRect();
                const close = document.querySelector('[data-gold-bubble-close]').getBoundingClientRect();
                return { clear: bubble.bottom <= choice.top, close: Math.min(close.width, close.height) >= 40 };
            });
            assert.deepEqual(layout, { clear: true, close: true });
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `zlata-otazka-bublina-${viewport.width}-${colorScheme}`);
            const gold = await storage(tab, 'mudrlant.gold');
            assert.deepEqual([gold.since, gold.intro], [0, true], 'počítadlo od nuly, vysvětlení jen jednou');
            await tab.click('[data-gold-bubble-close]');
            await tab.waitForSelector('#gold-bubble', { state: 'detached' });
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `zlata-otazka-${viewport.width}-${colorScheme}`);
            // Správně bez nápovědy: 30 XP za odpověď + 60 XP za zlatou otázku, střípek, odznak Zlatokop I (10. správná zlatá)
            await tab.click(`[data-action="choice"][data-index="${await rightChoice(tab)}"]`);
            await tab.waitForSelector('[data-gold-result="shard"]');
            const verdict = (await tab.textContent('[data-verdict]')).replace(/\s+/g, ' ');
            assert.match(verdict, /\+30 XP za správnou odpověď/);
            assert.match(verdict, /\+60 XP za zlatou otázku \(3× XP\)/);
            assert.match(verdict, /Zlatokop I/);
            const row = (await tab.textContent('[data-gold-result]')).replace(/\s+/g, ' ');
            assert.match(row, /Zlatý střípek je tvůj! Ještě 4 střípky a otevřeš Zlatou truhlu\./);
            assert.equal(await tab.locator('[data-gold-result] .gold-slot-full').count(), 1);
            const progress = await storage(tab, 'mudrlant.progress');
            assert.equal(progress.xp, 90);
            assert.equal(progress.counters.goldCorrect, 10);
            assert.ok(progress.badges['zlatokop-10'], 'odznak Zlatokop I');
            const after = await storage(tab, 'mudrlant.gold');
            assert.deepEqual([after.total, after.correct, after.found, after.shards, after.ready], [1, 1, 1, 1, 0]);
            // Zlatá otázka nemá v tréninku jiné body než obyčejná
            assert.match(verdict, /Správně! \+4 body/);
            await tab.waitForTimeout(300);
            await shot(tab, `zlata-vysledek-${viewport.width}-${colorScheme}`);
            // Další otázka zlatá není (prvních 10 otázek po zlaté nikdy)
            await tab.click('[data-action="next"]');
            await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
            assert.equal(await tab.locator('.gold-card, [data-gold-ribbon]').count(), 0);
            assert.equal((await storage(tab, 'mudrlant.gold')).since, 1);
            assert.deepEqual(problems, []);
            await context.close();
        }
    });

    await t.test('s nápovědou jen trojnásobek XP bez střípku; špatně = 3× XP za pokus; bublina už se neukáže', async () => {
        const { context, tab, problems } = await open({ colorScheme: 'dark', seed: { 'mudrlant.gold': { since: 79, intro: true, shards: 2 } } });
        await practice(tab);
        await tab.waitForSelector('.gold-card');
        assert.equal(await tab.locator('#gold-bubble').count(), 0, 'vysvětlení jen při první zlaté otázce');
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('[data-action="choice"]');
        assert.deepEqual((await goldLook(tab)).card, true, 'po nápovědě zůstává karta zlatá');
        assert.equal(await tab.locator('[data-gold-ribbon]').count(), 1);
        await tab.click(`[data-action="choice"][data-index="${await rightChoice(tab)}"]`);
        await tab.waitForSelector('[data-gold-result="xp"]');
        assert.match(await tab.textContent('[data-gold-result]'), /Trojnásobek XP je tvůj[\s\S]*jen za správnou odpověď bez nápovědy/);
        assert.match((await tab.textContent('[data-verdict]')).replace(/\s+/g, ' '), /\+25 XP za správnou odpověď\s*\+50 XP za zlatou otázku/);
        assert.deepEqual((({ shards, correct, total }) => [shards, correct, total])(await storage(tab, 'mudrlant.gold')), [2, 1, 1]);
        await context.close();
        // Špatná odpověď: 2 XP za pokus a 4 navíc
        const wrong = await open({ seed: { 'mudrlant.gold': { since: 79, intro: true } } });
        await practice(wrong.tab);
        await wrong.tab.waitForSelector('.gold-card');
        const right = await rightChoice(wrong.tab);
        await wrong.tab.click(`[data-action="choice"][data-index="${right === 0 ? 1 : 0}"]`);
        await wrong.tab.waitForSelector('[data-gold-result="miss"]');
        assert.match(await wrong.tab.textContent('[data-gold-result]'), /Tentokrát bez střípku/);
        assert.equal((await storage(wrong.tab, 'mudrlant.progress')).xp, 6);
        assert.deepEqual([...problems, ...wrong.problems], []);
        await wrong.context.close();
    });

    await t.test('pátý střípek otevře Zlatou truhlu (okno Truhly Mudrlanta ve zlatém): vzácná věc, kterou hráč nemá, jde hned nasadit', async () => {
        for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light']]) {
            const rewards = { v: 1, gifts: { accessories: ['vrtulka', 'srdickove-bryle', 'vencek', 'paska', 'hrnek'], frames: ['duha-mracky'] } };
            const { context, tab, problems } = await open({ viewport, colorScheme, seed: { 'mudrlant.gold': { since: 79, intro: true, shards: 4 }, 'mudrlant.rewards': rewards } });
            await practice(tab);
            await tab.click(`[data-action="choice"][data-index="${await rightChoice(tab)}"]`);
            await tab.waitForSelector('[data-gold-result="shard"]');
            assert.match(await tab.textContent('[data-gold-result]'), /Máš všech pět\. Zlatá truhla je tvoje!/);
            // Truhla se otevře sama, zavřená zlatá truhla s pozlaceným obrázkem
            await tab.waitForSelector('#chest-overlay [data-chest-go]');
            assert.equal(await tab.getAttribute('#chest-overlay', 'aria-label'), 'Zlatá truhla');
            assert.match(await tab.textContent('#chest-overlay'), /5 zlatých střípků[\s\S]*Zlatá truhla[\s\S]*Klepni na truhlu/);
            assert.equal(await tab.locator('#chest-overlay .gold-chest .chest-body.gold-tint').count(), 1);
            await shot(tab, `zlata-truhla-${viewport.width}-${colorScheme}`);
            await tab.click('#chest-overlay [data-chest-go]');
            await tab.waitForSelector('[data-chest-reveal]');
            // Jediná vzácná věc, kterou hráč ještě nemá: rámeček Růže a trny
            assert.equal((await tab.textContent('[data-chest-item]')).trim(), 'Růže a trny');
            assert.match(await tab.textContent('[data-chest-reveal]'), /Vzácný rámeček profilu[\s\S]*Vzácný rámeček, který jinak najdeš jen v truhlách\. Teď je tvůj\./);
            const box = await tab.evaluate(() => { const card = document.querySelector('[data-chest-card]').getBoundingClientRect(); return { top: card.top >= 0, bottom: card.bottom <= window.innerHeight }; });
            assert.deepEqual(box, { top: true, bottom: true }, 'otevřená truhla se vejde');
            await shot(tab, `zlata-truhla-otevrena-${viewport.width}-${colorScheme}`);
            const gold = await storage(tab, 'mudrlant.gold');
            assert.deepEqual([gold.shards, gold.ready, gold.chests, gold.last], [0, 0, 1, 'frames:ruze']);
            assert.ok((await storage(tab, 'mudrlant.rewards')).gifts.frames.includes('ruze'));
            await tab.click('[data-chest-wear]');
            await tab.waitForSelector('#chest-overlay', { state: 'detached' });
            assert.equal((await storage(tab, 'mudrlant.look')).frame, 'ruze', 'rámeček nasazený');
            assert.equal(await tab.locator('[data-gold-result] [data-action="gold-chest"]').count(), 0, 'otevřená truhla už nečeká');
            assert.deepEqual(problems, []);
            await context.close();
        }
    });

    await t.test('dnešní otázka zůstane zlatá i po návratu (počítadlo se nezvýší dvakrát)', async () => {
        const { context, tab, problems } = await open({ seed: { 'mudrlant.gold': { since: 79, intro: true } } });
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        await tab.waitForSelector('.gold-card');
        await tab.click('#btn-home');
        await tab.waitForSelector('[data-action="daily"][data-topic="zemepis"]');
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('.gold-card');
        assert.equal((await storage(tab, 'mudrlant.gold')).since, 0);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Bleskovka: čas stojí pod bublinou, střípek přiletí do okénka nad hrou, ve výsledku XP navíc a střípky', async () => {
        const solve = async (tab) => {
            const info = await tab.evaluate(() => {
                const panel = document.querySelector('[data-mode-question] [role="tabpanel"]');
                const named = panel.querySelector('b');
                return { text: panel.textContent, name: named ? named.textContent.trim() : null, labels: [...document.querySelectorAll('[data-action="mode-choice"]')].map(el => el.textContent.trim()) };
            });
            const item = info.name ? BY_TITLE.get(info.name) : BY_Q.get((info.text.match(/značku K(Q\d+)/) || [])[1]);
            assert.ok(item, `položka otázky: ${info.text.slice(0, 120)}`);
            return info.labels.indexOf(info.name ? COUNTRIES[item.co[0]].name : item.n);
        };
        for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 390, height: 780 }, 'dark']]) {
            const { context, tab, problems } = await open({ viewport, colorScheme, motion: true, clock: true, seed: { 'mudrlant.gold': { since: 79 } } });
            await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
            await tab.waitForSelector('#chooser-title');
            await tab.click('[data-chooser-mode="blitz"]');
            await tab.click('[data-action="mode-start"]');
            await tab.waitForSelector('[data-mode-question][data-phase="question"] .gold-card');
            await tab.waitForSelector('#gold-bubble');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `zlata-bleskovka-${viewport.width}-${colorScheme}`);
            // Pod bublinou čas stojí
            await tab.clock.runFor(3000);
            assert.equal(await tab.textContent('[data-mode-clock]'), '60');
            await tab.click('[data-gold-bubble-close]');
            await tab.clock.runFor(1200);
            assert.notEqual(await tab.textContent('[data-mode-clock]'), '60', 'po zavření bubliny čas běží');
            const right = await solve(tab);
            await tab.click(`[data-action="mode-choice"][data-index="${right}"]`);
            await tab.waitForSelector('#gold-hud');
            assert.match(await tab.getAttribute('#gold-hud', 'aria-label'), /Zlatý střípek: 1 z 5/);
            assert.ok(await tab.locator('#gold-fx .gold-spark').count() >= 10, 'jiskřičky');
            assert.equal(await tab.locator('#gold-fx .gold-flyer').count(), 1, 'letící střípek');
            // Okénko sedí na řádku s časem, čas ani počet správných nezakryje
            const hud = await tab.evaluate(() => {
                const box = (el) => el.getBoundingClientRect();
                const h = box(document.getElementById('gold-hud'));
                const clock = box(document.querySelector('[data-mode-clock-chip]'));
                const score = box(document.querySelector('[data-mode-timer] > span:last-child'));
                return { row: h.top < clock.bottom && h.bottom > clock.top, clear: h.left >= clock.right && h.right <= score.left };
            });
            assert.deepEqual(hud, { row: true, clear: true });
            await tab.clock.runFor(1600);
            await tab.waitForFunction(() => document.querySelectorAll('#gold-hud .gold-slot-full').length === 1 || !document.getElementById('gold-hud'));
            assert.ok((await tab.evaluate(() => window.__tones)).includes(1975.53), 'zvuk zlaté otázky a střípku');
            await tab.click('[data-action="mode-quit"]');
            await tab.waitForSelector('[data-mode-result="blitz"]');
            const result = (await tab.textContent('[data-mode-result]')).replace(/\s+/g, ' ');
            assert.match(result, /\+3 XP za 1 správnou odpověď/);
            assert.match(result, /\+6 XP za zlatou otázku \(3× XP\)/);
            assert.match(result, /Z této hry máš zlatý střípek/);
            assert.match(result, /Ještě 4 střípky a otevřeš Zlatou truhlu\./);
            assert.equal(await tab.locator('#gold-hud').count(), 0, 'okénko nad hrou ve výsledku zmizí');
            const progress = await storage(tab, 'mudrlant.progress');
            assert.equal(progress.xp, 9);
            assert.equal(progress.counters.goldCorrect, 1);
            assert.deepEqual((({ shards, correct, total }) => [shards, correct, total])(await storage(tab, 'mudrlant.gold')), [1, 1, 1]);
            await shot(tab, `zlata-bleskovka-vysledek-${viewport.width}-${colorScheme}`);
            assert.deepEqual(problems, []);
            await context.close();
        }
    });

    await t.test('Můj postup: dlaždice Zlaté střípky otevře okno Zlatá otázka se statistikami; vejde se bez posouvání', async () => {
        for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light']]) {
            const seed = { 'mudrlant.gold': { total: 14, correct: 11, found: 9, shards: 3, chests: 1, intro: true, last: 'frames:ruze' }, 'mudrlant.tips': { off: true } };
            const { context, tab, problems } = await open({ viewport, colorScheme, seed });
            await tab.click('#btn-settings');
            await tab.click('[data-open-progress]');
            await tab.waitForSelector('[data-progress-dialog]');
            const tile = (await tab.textContent('[data-rewards-info="gold"]')).replace(/\s+/g, ' ');
            assert.match(tile, /Střípky|Zlaté střípky/);
            assert.match(tile, /3 z 5/);
            const panelFits = () => tab.evaluate(() => { const panel = document.getElementById('dialog-overlay').firstElementChild; return panel.scrollHeight - panel.clientHeight; });
            assert.equal(await panelFits(), 0, 'Můj postup s dlaždicí se vejde');
            await tab.click('[data-rewards-info="gold"]');
            await tab.waitForSelector('[data-gold-info]');
            assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Zlatá otázka');
            const info = (await tab.textContent('[data-gold-info]')).replace(/\s+/g, ' ');
            assert.match(info, /Zhruba jednou za 50 otázek přijde Zlatá otázka/);
            assert.match(info, /14\s*Zlaté otázky\s*11\s*Správné odpovědi\s*1\s*Otevřené truhly/);
            assert.match(info, /3 z 5 střípků/);
            assert.match(info, /Minule ve Zlaté truhle: Růže a trny/);
            assert.equal(await panelFits(), 0, 'okno Zlatá otázka se vejde');
            assert.ok(await tab.locator('#dialog-overlay [data-dialog-back]').count(), 'zpět na Můj postup');
            assert.equal((await storage(tab, 'mudrlant.tips')).visited.gold, true, 'tip o Zlaté otázce už není potřeba');
            await shot(tab, `zlata-okno-${viewport.width}-${colorScheme}`);
            assert.deepEqual(problems, []);
            await context.close();
        }
        // Čekající Zlatá truhla: dlaždice svítí a okno nabídne Otevřít Zlatou truhlu
        const { context, tab } = await open({ seed: { 'mudrlant.gold': { ready: 1, intro: true } } });
        await tab.click('#btn-settings');
        await tab.click('[data-open-progress]');
        await tab.waitForSelector('[data-progress-dialog]');
        assert.match((await tab.textContent('[data-rewards-info="gold"]')).replace(/\s+/g, ' '), /Čeká!/);
        await tab.click('[data-rewards-info="gold"]');
        await tab.click('[data-gold-open]');
        await tab.waitForSelector('#chest-overlay .gold-chest');
        await context.close();
    });
});
