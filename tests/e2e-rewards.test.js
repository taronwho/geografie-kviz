// Odměny v prohlížeči (rewards.js, app.js): Truhla Mudrlanta na úvodu (otevření, věc, nasazení, omezený pohyb), ochrana série
// (štít u dnešních otázek, sama zachrání vynechaný den), Můj postup bez posouvání a Diplomy (náhled na plátně, Sdílet/Stáhnout).
// Sdílet obrázek u Bleskovky hlídá e2e-modes. Telefon 360×640 i 390×780, světlý i tmavý režim, bez posouvání úvodu a bez chyb CSP.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const Goals = require('../goals.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.MUDRLANT_SHOTS || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

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
const dayKey = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

test('odměny: truhla, ochrana série, diplomy, sdílení obrázku', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const week = Goals.weekKey();
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', reducedMotion = 'no-preference', seed = {} } = {}) => {
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
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"]');
        return { context, tab, problems };
    };
    // Po doběhnutí úvodních animací (fade-in posouvá obsah o 10 px), nekonečné (pohupování truhly) se nečekají
    const noScroll = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const box = document.getElementById('app-content');
        return box.scrollHeight <= box.clientHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth;
    });
    const storage = (tab, key) => tab.evaluate((name) => JSON.parse(localStorage.getItem(name)), key);
    const clearCelebrations = async (tab) => { for (let i = 0; i < 8 && await tab.locator('#celebration').count(); i++) { await tab.locator('#celebration').click({ timeout: 1500 }).catch(() => {}); await tab.waitForTimeout(300); } };

    for (const [name, viewport, colorScheme] of [['390×780', { width: 390, height: 780 }, 'light'], ['360×640', { width: 360, height: 640 }, 'light'], ['390×780 tmavý', { width: 390, height: 780 }, 'dark'], ['360×640 tmavý', { width: 360, height: 640 }, 'dark']]) {
        await t.test(`truhla: pruh na úvodu, otevření, věc a nasazení (${name})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme, seed: { 'mudrlant.progress': { xp: 400, counters: {}, badges: {} }, 'mudrlant.rewards': { ready: [week], freezes: 1 } } });
            const strip = tab.locator('[data-chest-ready]');
            await strip.waitFor();
            assert.match(await strip.textContent(), /Truhla Mudrlanta čeká/);
            assert.equal(await tab.locator('[data-freeze-chip]').count(), 1, 'štít ochrany u dnešních otázek');
            assert.ok(await noScroll(tab), `úvod s truhlou bez posouvání: ${await tab.evaluate(() => { const box = document.getElementById('app-content'); return `${box.scrollHeight}/${box.clientHeight}, šířka ${document.documentElement.scrollWidth}/${window.innerWidth}`; })}`);
            const tag = `${viewport.width}-${colorScheme}`;
            await shot(tab, `uvod-truhla-${tag}`);
            await strip.click();
            await tab.waitForSelector('#chest-overlay [data-chest-card]');
            await tab.waitForTimeout(700);
            await shot(tab, `truhla-zavrena-${tag}`);
            const card = await tab.locator('[data-chest-card]').boundingBox();
            assert.ok(card.y >= 0 && card.y + card.height <= viewport.height && card.width <= viewport.width - 16, 'okno truhly se vejde');
            // Zavřená truhla čeká na klepnutí: pulzuje, nápověda, jediné tlačítko otevření je truhla sama
            assert.match(await tab.textContent('#chest-overlay .chest-hint'), /Klepni na truhlu/);
            assert.equal(await tab.locator('#chest-overlay [data-chest-go]').count(), 1);
            assert.equal(await tab.getAttribute('#chest-overlay .chest-box', 'aria-label'), 'Otevřít truhlu');
            assert.notEqual(await tab.evaluate(() => getComputedStyle(document.querySelector('#chest-overlay .chest-halo')).animationName), 'none', 'záře pulzuje');
            const closed = await tab.locator('#chest-overlay .chest-box').boundingBox();
            await tab.click('#chest-overlay button.chest-box');
            // Další klepnutí během natřásání a otevírání nic neudělají (truhla se neotevře dvakrát)
            await tab.evaluate(() => document.querySelector('#chest-overlay .chest-lid-closed').click());
            await tab.waitForSelector('[data-chest-reveal] [data-chest-item]');
            await tab.evaluate(() => document.querySelector('#chest-overlay .chest-lid-open').click());
            await tab.waitForTimeout(500);
            await shot(tab, `truhla-otevira-${tag}`);
            await tab.waitForTimeout(1100);
            await shot(tab, `truhla-otevrena-${tag}`);
            const opened = await tab.locator('#chest-overlay .chest-box').boundingBox();
            assert.ok(Math.abs(opened.y - closed.y) < 1 && Math.abs(opened.x - closed.x) < 1, 'truhla zůstane po otevření na místě');
            assert.ok(await tab.locator('[data-chest-prize]').isVisible(), 'věc vystoupala z truhly');
            const item = (await tab.textContent('[data-chest-item]')).trim();
            assert.ok(item.length > 2, `věc: ${item}`);
            assert.equal(await tab.locator('[data-chest-freeze]').count(), 1, 'k věci ochrana série (měl jen jednu)');
            const rewards = await storage(tab, 'mudrlant.rewards');
            assert.ok(rewards.chests[week] && rewards.chests[week] !== 'xp', 'truhla zapsaná s věcí');
            assert.equal(rewards.freezes, 2);
            assert.deepEqual(rewards.ready, []);
            const [category, id] = rewards.chests[week].split(':');
            assert.ok(rewards.gifts[category].includes(id));
            const after = await tab.locator('[data-chest-card]').boundingBox();
            assert.ok(after.y >= 0 && after.y + after.height <= viewport.height, 'otevřená truhla se vejde');
            if (await tab.locator('[data-chest-wear]').count()) {
                await tab.click('[data-chest-wear]');
                const look = await storage(tab, 'mudrlant.look');
                const key = { robes: 'robe', themes: 'theme', frames: 'frame' }[category];
                if (key) assert.equal(look[key], id, 'nasazeno');
                else assert.equal(Object.values(look.acc).map(entry => entry.id).includes(id), true, 'doplněk nasazen');
            } else await tab.click('[data-chest-close]');
            assert.equal(await tab.locator('#chest-overlay').count(), 0);
            // Pruh je zase cíle týdne; truhla jde otevřít jen jednou
            await tab.waitForSelector('#weekly-goals [data-goal]');
            assert.equal(await tab.locator('[data-chest-ready]').count(), 0);
            assert.equal((await storage(tab, 'mudrlant.progress')).counters.chestsOpened, 1);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('truhla při omezeném pohybu: otevře se hned, bez animace kývání', async () => {
        const { context, tab, problems } = await open({ reducedMotion: 'reduce', seed: { 'mudrlant.rewards': { ready: [week], freezes: 2 } } });
        await tab.click('[data-chest-ready]');
        await tab.waitForSelector('#chest-overlay .chest-box');
        const still = (selector) => tab.evaluate((css) => [...document.querySelectorAll(css)].every(el => getComputedStyle(el).animationName === 'none'), selector);
        assert.ok(await still('#chest-overlay .chest-body, #chest-overlay .chest-halo, #chest-overlay .chest-spark, #chest-overlay .chest-hint'), 'zavřená truhla bez pohybu');
        await tab.click('#chest-overlay .chest-box');
        await tab.waitForSelector('[data-chest-reveal]', { timeout: 300 });
        assert.ok(await still('#chest-overlay [data-chest-card] *'), 'otevřená truhla a věc bez pohybu');
        assert.equal(await tab.evaluate(() => getComputedStyle(document.querySelector('#chest-overlay .chest-lid-open')).opacity), '1', 'hned otevřená truhla');
        assert.ok(await tab.locator('[data-chest-prize]').isVisible());
        assert.equal(await tab.locator('[data-chest-freeze]').count(), 0, 'plný počet ochran: žádná navíc');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('truhla zavřená během natřásání zůstane zavřená a čeká dál', async () => {
        const { context, tab, problems } = await open({ seed: { 'mudrlant.rewards': { ready: [week], freezes: 1 } } });
        await tab.click('[data-chest-ready]');
        await tab.waitForSelector('#chest-overlay .chest-box');
        await tab.click('#chest-overlay .chest-box');
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(700);
        assert.equal(await tab.locator('#chest-overlay').count(), 0);
        const rewards = await storage(tab, 'mudrlant.rewards');
        assert.deepEqual(rewards.ready, [week], 'truhla dál čeká');
        assert.equal(rewards.chests[week], undefined);
        assert.equal(await tab.locator('[data-chest-ready]').count(), 1, 'pruh s truhlou na úvodu zůstal');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('ochrana série: vynechaný den se zachrání sám, série dnešních otázek trvá', async () => {
        const daily = Object.fromEntries([-4, -3, -2].map(offset => [dayKey(offset), { correct: true, points: 4, hintLevel: 1, levelCount: 4 }]));
        const { context, tab, problems } = await open({ viewport: { width: 360, height: 640 }, seed: { 'mudrlant.stats': { daily: { zemepis: daily }, practice: {} }, 'mudrlant.rewards': { freezes: 1 }, 'mudrlant.progress': { xp: 100, counters: { bestStreak: 3 }, badges: {} } } });
        await tab.waitForSelector('#celebration');
        assert.match(await tab.textContent('#celebration'), /Ochrana série zabrala/);
        await shot(tab, 'ochrana-zabrala-360-light');
        const rewards = await storage(tab, 'mudrlant.rewards');
        assert.equal(rewards.freezes, 0);
        assert.deepEqual(rewards.frozen, [dayKey(-1)]);
        assert.equal((await storage(tab, 'mudrlant.progress')).counters.freezesUsed, 1);
        await clearCelebrations(tab);
        await tab.evaluate(() => document.getElementById('btn-home').click());
        await tab.waitForSelector('[data-action="daily"][data-topic="zemepis"]');
        assert.match(await tab.textContent('[data-action="daily"][data-topic="zemepis"]'), /3/, 'série 3 dní přes zachráněný den');
        assert.equal(await tab.locator('[data-freeze-chip]').count(), 0, 'bez ochrany štít není');
        // Další spuštění téhož dne už nic nespotřebuje
        await tab.reload();
        await tab.waitForSelector('[data-action="play-topic"]');
        assert.equal((await storage(tab, 'mudrlant.rewards')).freezes, 0);
        assert.deepEqual(problems, []);
        await context.close();
    });

    // Můj postup se vejde bez posouvání na 390×780, na 360×640 nejvýš trochu (hráč s hodně odznaky a dvěma odměnami u odznaků)
    const overflow = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const box = document.getElementById('dialog-overlay').firstElementChild;
        return { y: box.scrollHeight - box.clientHeight, x: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    for (const [viewport, colorScheme] of [[{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
        await t.test(`Můj postup bez posouvání: odměny a diplomy, diplom jako obrázek (${viewport.width}×${viewport.height}, ${colorScheme})`, async () => {
            const learned = { zemepis: Array.from({ length: 300 }, (_, i) => `Q${900000 + i}`), historie: Array.from({ length: 70 }, (_, i) => `Q${800000 + i}`) };
            const { context, tab, problems } = await open({ viewport, colorScheme, seed: { 'mudrlant.learned': learned, 'mudrlant.rewards': { freezes: 1, name: 'Jana' }, 'mudrlant.progress': { xp: 2000, counters: { correct: 120, bestRun: 9, topicBest: { zemepis: 10 } }, badges: {} } } });
            const tag = `${viewport.width}-${colorScheme}`;
            // Plné mistrovství zeměpisu: diplom se zapíše (a oslaví) při přepočtu odznaků
            await tab.evaluate(() => document.getElementById('status-badge').click());
            await tab.waitForSelector('[data-rewards-section]');
            await clearCelebrations(tab);
            const scroll = await overflow(tab);
            await shot(tab, `muj-postup-${tag}`);
            assert.equal(scroll.x, 0, 'bez vodorovného posouvání');
            if (viewport.height >= 780) assert.equal(scroll.y, 0, `Můj postup bez posouvání (přetéká o ${scroll.y} px)`);
            else assert.ok(scroll.y <= 48, `na 360×640 nejvýš trochu posouvání (${scroll.y} px)`);
            assert.equal(await tab.locator('[data-progress-dialog] [data-mastery]').count(), 14, 'mistrovství všech témat');
            assert.doesNotMatch(await tab.textContent('#dialog-overlay'), /sláva/, 'odznak jen pro slávu neuvádí odměnu');
            assert.match(await tab.textContent('[data-freeze-count]'), /1 z 2/);
            assert.match(await tab.textContent('[data-diploma-count]'), /\d+ \/ 14/);
            await tab.click('[data-rewards-info="freeze"]');
            await tab.waitForSelector('[data-freeze-help]');
            assert.match(await tab.textContent('[data-freeze-help]'), /jeden den vynecháš/);
            await shot(tab, `ochrana-vysvetleni-${tag}`);
            await tab.click('[data-dialog-back]');
            await tab.click('[data-rewards-info="chest"]');
            await tab.waitForSelector('[data-chest-help]');
            await tab.click('[data-dialog-back]');
            // Diplomy: vlastní okno se všemi tématy
            await tab.click('[data-rewards-info="diplomas"]');
            await tab.waitForSelector('[data-diplomas] [data-diploma="zemepis"]');
            await shot(tab, `diplomy-${tag}`);
            assert.ok((await overflow(tab)).y <= 0, 'okno Diplomy bez posouvání');
            // Zamčený diplom ukáže, co chybí
            await tab.click('[data-diploma="historie"]');
            await tab.waitForSelector('[data-diploma-locked]');
            assert.match(await tab.textContent('[data-diploma-locked]'), /Chybí ti ještě 230/);
            await tab.click('[data-dialog-back]');
            // Získaný diplom: plátno 1080 × 1350 se sovou a ikonou tématu, jméno, Stáhnout
            const rewards = await storage(tab, 'mudrlant.rewards');
            assert.ok(rewards.diplomas.zemepis, 'diplom ze zeměpisu zapsaný');
            await tab.click('[data-diploma="zemepis"]');
            await tab.waitForSelector('[data-diploma-preview] canvas');
            const canvas = await tab.evaluate(() => { const c = document.querySelector('[data-diploma-preview] canvas'); return { w: c.width, h: c.height, owl: c.dataset.owl, icon: c.dataset.icon }; });
            assert.deepEqual([canvas.w, canvas.h], [1080, 1350]);
            assert.ok(canvas.owl.includes('sova-vitez'), 'sova');
            assert.equal(canvas.icon, 'icons/topics/zemepis.webp');
            assert.equal(await tab.inputValue('[data-diploma-name]'), 'Jana');
            await shot(tab, `diplom-${tag}`);
            const box = await tab.locator('#dialog-overlay > div').boundingBox();
            assert.ok(box.width <= viewport.width && box.x >= 0);
            const [download] = await Promise.all([tab.waitForEvent('download'), tab.click('[data-diploma-download]')]);
            assert.equal(download.suggestedFilename(), `mudrlant-diplom-zemepis-${rewards.diplomas.zemepis}.png`);
            if (SHOTS) await download.saveAs(path.join(SHOTS, `diplom-zemepis-${tag}.png`));
            await tab.fill('[data-diploma-name]', 'Jan Novák');
            await tab.waitForTimeout(500);
            assert.equal((await storage(tab, 'mudrlant.rewards')).name, 'Jan Novák');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    // Odměny vzhledu v Nastavení (barevné téma ve Hře, talár u Mudrlanta) se vejdou bez posouvání na 390×780 i 360×640;
    // zamčená položka po klepnutí řekne, jak se odemyká, věc z truhly je odemčená
    for (const [viewport, colorScheme] of [[{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
        await t.test(`odměny vzhledu bez posouvání (${viewport.width}×${viewport.height}, ${colorScheme})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme, seed: { 'mudrlant.progress': { xp: 2000, counters: {}, badges: { vitez: '2026-11-01' } }, 'mudrlant.rewards': { gifts: { themes: ['zlata'] } } } });
            await tab.click('#btn-settings');
            const check = async (tabId, picks) => {
                await tab.click(`[data-me-tab="${tabId}"]`);
                await tab.waitForSelector(`[data-me-tab="${tabId}"][aria-selected="true"]`);
                const scroll = await tab.evaluate(async () => {
                    await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
                    const boxes = [...document.querySelectorAll('#settings-overlay *')].filter(el => { const style = getComputedStyle(el); return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1; });
                    return { y: Math.max(0, ...boxes.map(el => el.scrollHeight - el.clientHeight)), x: document.documentElement.scrollWidth - document.documentElement.clientWidth };
                });
                await shot(tab, `nastaveni-${tabId}-${viewport.width}-${colorScheme}`);
                assert.equal(scroll.x, 0);
                assert.equal(scroll.y, 0, `${tabId} bez posouvání (přetéká o ${scroll.y} px)`);
                // Dlaždice uvnitř svého oddílu, oddíly uvnitř okna, dotykové plochy aspoň 40 px
                const outside = await tab.evaluate((selector) => [...document.querySelectorAll(selector)].filter(el => { const box = el.getBoundingClientRect(); const section = el.closest('section').getBoundingClientRect(); return box.left < section.left - 0.5 || box.right > section.right + 0.5; }).length, picks);
                assert.equal(outside, 0, 'dlaždice nepřetékají oddíl');
                const sections = await tab.evaluate(() => [...document.querySelectorAll('#settings-overlay [data-look]')].filter(el => el.getBoundingClientRect().right > document.getElementById('settings-overlay').firstElementChild.getBoundingClientRect().right + 0.5).length);
                assert.equal(sections, 0, 'oddíly nepřetékají okno');
                const small = await tab.evaluate((selector) => [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect()).filter(box => box.width < 39.5 || box.height < 39.5).length, picks);
                assert.equal(small, 0, 'dotykové plochy aspoň 40 px');
            };
            // Hra: barevné téma; zlaté téma z truhly je odemčené, Diamant (úroveň 70) zamčený a po klepnutí řekne proč
            await check('game', '[data-theme-pick]');
            assert.equal(await tab.getAttribute('[data-theme-pick="zlata"]', 'aria-disabled'), null);
            await tab.click('[data-theme-pick="diamant"]', { force: true });
            await tab.waitForFunction(() => /Diamant: Úroveň 70/.test(document.querySelector('[data-look="themes"]').textContent));
            await tab.click('[data-theme-pick="zlata"]');
            await tab.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'zlata');
            // Mudrlant: talár (zlatý od úrovně 65) a doplňky
            await check('owl', '[data-robe-pick], [data-owl-pick], [data-owl-slot]');
            await tab.click('[data-robe-pick="zlata"]', { force: true });
            await tab.waitForFunction(() => /Zlatý talár: Úroveň 65/.test(document.querySelector('[data-look="robes"]').textContent));
            assert.deepEqual(problems, []);
            await context.close();
        });
    }
});
