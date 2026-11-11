// Album sbírky v prohlížeči (album.js, app.js): dlaždice v Mém postupu, okno alba se sekcemi (bez posouvání, jen dlouhé Odznaky se posouvají
// a tlačítko zpět zůstane vidět), podrobnosti věci a Nasadit (doplněk, téma, rámeček, titul u jména), oslava milníku jednou a rámeček
// Sběratelský za celé album. Data jsou testovací (localStorage), jako ve vývojářském režimu. Telefon 390×780 i 360×640, světlý i tmavý
// režim, bez chyb CSP. MUDRLANT_SHOTS=… uloží snímky.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const Core = require('../quiz-core.js');
const Season = require('../season.js');
const Look = require('../look.js');
// Doplňky jen z Truhly Mudrlanta (chest v look.js): sběratel je má z truhly
const CHEST_ONLY = Look.ACCESSORIES.filter(item => item.chest).map(item => item.id);

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.MUDRLANT_SHOTS || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const SECTIONS = ['avatars', 'accessories', 'frames', 'themes', 'robes', 'colors', 'badges', 'diplomas'];
const TOPICS = ['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport'];

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

// Testovací hráč: úroveň 42, pár odznaků (Vítěz → Vavřínový věnec a rámeček, Navigátor → Kompas), téma a rámeček z truhly, dva diplomy.
// Album je přes 25 %, ale odznak milníku zatím nemá (dostane ho při prvním otevření).
const DAY = '2026-10-01';
const BADGES = ['prvni-krok', 'odpovedi-10', 'odpovedi-50', 'stovka', 'rada-5', 'strelec', 'vitez', 'zbehly-zemepis-5', 'zbehly-zemepis', 'uroven-5', 'znalec', 'uroven-20', 'mudrc'];
const player = () => ({
    'mudrlant.progress': { xp: Core.xpForLevel(42), counters: { answered: 150, correct: 120, bestRun: 12, topicBest: { zemepis: 12 }, wins: 1 }, badges: Object.fromEntries(BADGES.map(id => [id, DAY])) },
    'mudrlant.rewards': { freezes: 1, gifts: { themes: ['zlata'], frames: ['diamant'] }, diplomas: { zemepis: '2026-10-20', historie: '2026-10-22' } }
});
// Celá sbírka: úroveň 100, všechny odznaky kromě odznaků alba, všechny diplomy
// Celá sbírka: k úrovni 100, odznakům a diplomům i ligový vrchol Mistr (rámečky ligových sezón jdou získat každý měsíc) a rámeček
// letošní Sezóny Mudrlanta (sezónní věc běžícího měsíce jde získat, tak k celému albu patří) a vzácné obrázkové rámečky z Truhly Mudrlanta
const SEASON_FRAME = `sezona-${Season.pragueDay().slice(5, 7)}`;
const CHEST_FRAMES = require('../look.js').FRAMES.filter(item => item.rare).map(item => item.id);
const collector = () => ({
    'mudrlant.progress': { xp: Core.xpForLevel(100), counters: {}, badges: Object.fromEntries(Core.BADGES.filter(badge => !Core.isAlbumBadge(badge.id)).map(badge => [badge.id, DAY])) },
    'mudrlant.rewards': { freezes: 2, diplomas: Object.fromEntries(TOPICS.map(id => [id, DAY])), gifts: { frames: [SEASON_FRAME, ...CHEST_FRAMES], accessories: CHEST_ONLY } },
    'mudrlant.leagueSeasons': { v: 1, best: 'mistr', bestMonth: '2026-10' }
});

test('album sbírky: sekce, podrobnosti, Nasadit a oslava milníku', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', reducedMotion = 'reduce', seed = player() } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion, deviceScaleFactor: SHOTS ? 2 : 1 });
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
    const storage = (tab, key) => tab.evaluate((name) => JSON.parse(localStorage.getItem(name)), key);
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const clearCelebrations = async (tab) => { for (let i = 0; i < 12 && await tab.locator('#celebration').count(); i++) { await tab.locator('#celebration').click({ timeout: 1500 }).catch(() => {}); await tab.waitForTimeout(300); } };
    // Přetečení posuvného panelu okna (svisle) a stránky (vodorovně)
    const overflow = (tab) => tab.evaluate(() => {
        const box = document.getElementById('dialog-overlay').firstElementChild;
        return { y: box.scrollHeight - box.clientHeight, x: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const openAlbum = async (tab) => {
        await tab.evaluate(() => document.getElementById('status-badge').click());
        await tab.waitForSelector('[data-rewards-info="album"]');
        await tab.click('[data-rewards-info="album"]');
        await tab.waitForSelector('[data-album]');
        await tab.evaluate(() => { document.querySelectorAll('#celebration-mini').forEach(el => el.remove()); });
    };

    await t.test('milník alba se oslaví jednou (odznak Sběratelská vášeň), titul jde mít u jména', async () => {
        const { context, tab, problems } = await open({ reducedMotion: 'no-preference' });
        await tab.waitForSelector('#celebration');
        assert.match(await tab.textContent('#celebration'), /Album sbírky: 25 %.*Sběratelská vášeň/s);
        await shot(tab, 'album-oslava-390-light');
        const progress = await storage(tab, 'mudrlant.progress');
        assert.ok(progress.badges['sberatel-25'], 'odznak milníku zapsaný');
        assert.ok(!progress.badges['sberatel-50'], 'další milník ne');
        await clearCelebrations(tab);
        // Další spuštění už milník neslaví
        await tab.reload();
        await tab.waitForSelector('[data-action="play-topic"]');
        await tab.waitForTimeout(1500);
        const texts = await tab.evaluate(() => [...document.querySelectorAll('#celebration, #celebration-mini')].map(el => el.textContent).join(' '));
        assert.doesNotMatch(texts, /Album sbírky/);
        // Titul z alba je v nabídce titulů (odznak z katalogu)
        assert.equal(await tab.evaluate(() => window.MudrlantLook.normalize({ title: 'sberatel-25' }, { level: 42, badges: JSON.parse(localStorage.getItem('mudrlant.progress')).badges }).title), 'sberatel-25');
        assert.deepEqual(problems, []);
        await context.close();
    });

    for (const [viewport, colorScheme] of [[{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
        const tag = `${viewport.width}-${colorScheme}`;
        await t.test(`okno alba z Mého postupu: sekce bez posouvání, počty a procenta (${tag})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            await clearCelebrations(tab);
            await tab.evaluate(() => document.getElementById('status-badge').click());
            await tab.waitForSelector('[data-progress-dialog] [data-rewards-info="album"]');
            const tile = (await tab.textContent('[data-rewards-info="album"]')).replace(/\s+/g, ' ');
            assert.match(tile, /Album sbírky\s*\d+ % sbírky/);
            const scroll = await overflow(tab);
            assert.equal(scroll.x, 0);
            if (viewport.height >= 780) assert.equal(scroll.y, 0, `Můj postup s dlaždicí alba bez posouvání (${scroll.y} px)`);
            else assert.ok(scroll.y <= 24, `Můj postup na 360×640 nejvýš trochu (${scroll.y} px)`);
            await shot(tab, `muj-postup-album-${tag}`);
            await tab.click('[data-rewards-info="album"]');
            await tab.waitForSelector('[data-album]');
            const percent = Number((await tab.textContent('[data-album-percent]')).replace(/\D+/g, ''));
            assert.ok(percent >= 25 && percent < 100, `procenta ${percent}`);
            assert.equal(Number(tile.match(/(\d+) %/)[1]), percent, 'dlaždice ukazuje stejná procenta');
            assert.deepEqual(await tab.$$eval('[data-album-tab]', nodes => nodes.map(node => node.dataset.albumTab)), SECTIONS);
            // Každá sekce: vybraná záložka, počet „mám / celkem“ sedí s dlaždicemi, okno bez posouvání (jen Odznaky se posouvají)
            for (const section of SECTIONS) {
                await tab.click(`[data-album-tab="${section}"]`);
                await tab.waitForSelector(`[data-album-section="${section}"]`);
                assert.equal(await tab.getAttribute(`[data-album-tab="${section}"]`, 'aria-selected'), 'true');
                const [have, total] = (await tab.textContent('[data-album-count]')).split('/').map(text => Number(text.trim()));
                if (section !== 'badges') {
                    const owned = await tab.locator('[data-album-section] [data-album-item][data-state="owned"]').count();
                    const missing = await tab.locator('[data-album-section] [data-album-item][data-state="missing"]').count();
                    assert.deepEqual([have, total], [owned, owned + missing], `${section}: počty sedí s dlaždicemi`);
                }
                const box = await overflow(tab);
                assert.equal(box.x, 0, `${section}: bez vodorovného posouvání`);
                // Doplňků Mudrlanta je 41: na 360×640 se sekce posouvá (dlaždice aspoň 40 px), na 390×780 se vejde
                if (section === 'badges' || (section === 'accessories' && viewport.height < 780)) {
                    // Dlouhý seznam se posouvá, tlačítko zpět je lepkavé a zůstane vidět
                    assert.ok(box.y > 0);
                    await tab.evaluate(() => { const panel = document.getElementById('dialog-overlay').firstElementChild; panel.scrollTop = panel.scrollHeight / 2; });
                    assert.ok(await tab.locator('[data-dialog-back]').isVisible());
                    const backBox = await tab.locator('[data-dialog-back]').boundingBox();
                    assert.ok(backBox.y + backBox.height <= viewport.height, 'tlačítko zpět na obrazovce');
                } else if (viewport.height >= 780) assert.equal(box.y, 0, `${section}: bez posouvání (${box.y} px)`);
                else assert.ok(box.y <= 24, `${section}: na 360×640 nejvýš trochu (${box.y} px)`);
                await shot(tab, `album-${section}-${tag}`);
            }
            // Dlaždice jsou aspoň 40 px (dotyk)
            await tab.click('[data-album-tab="accessories"]');
            const tileBox = await tab.locator('[data-album-item]').first().boundingBox();
            assert.ok(tileBox.width >= 39.5 && tileBox.height >= 39.5, `dlaždice ${tileBox.width}×${tileBox.height}`);
            // Odměny alba (klepnutí na hlavičku) a zpět
            await tab.click('[data-album-rewards]');
            await tab.waitForSelector('[data-album-rewards-list]');
            assert.equal(await tab.locator('[data-album-milestone]').count(), 4);
            assert.ok((await overflow(tab)).y <= (viewport.height >= 780 ? 0 : 24), 'odměny alba se vejdou');
            await shot(tab, `album-odmeny-${tag}`);
            await tab.click('[data-album-back]');
            await tab.waitForSelector('[data-album]');
            // Zpět na Můj postup
            await tab.click('[data-dialog-back]');
            await tab.waitForSelector('[data-progress-dialog]');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('podrobnosti věci: jak ji získat, Nasadit doplněk, použít téma, rámeček a titul u jména', async () => {
        const { context, tab, problems } = await open();
        await clearCelebrations(tab);
        await openAlbum(tab);
        // Chybějící věc: stav a návod, žádné Nasadit
        await tab.click('[data-album-tab="themes"]');
        await tab.click('[data-album-item="themes:legenda"]');
        await tab.waitForSelector('[data-album-detail="themes:legenda"]');
        assert.equal(await tab.getAttribute('[data-album-status]', 'data-album-status'), 'missing');
        assert.match(await tab.textContent('[data-album-how]'), /Od úrovně 90\. Nebo dřív z Truhly Mudrlanta/);
        assert.equal(await tab.locator('[data-album-wear]').count(), 0);
        assert.ok((await overflow(tab)).y <= 0);
        await tab.click('[data-album-back]');
        // Po návratu je vybraná stejná sekce a fokus na dlaždici
        await tab.waitForSelector('[data-album-section="themes"]');
        assert.equal(await tab.evaluate(() => document.activeElement && document.activeElement.dataset.albumItem), 'themes:legenda');
        // Téma z truhly: Použít → téma aplikace
        await tab.click('[data-album-item="themes:zlata"]');
        await tab.click('[data-album-wear]');
        await tab.waitForSelector('[data-album-worn]');
        assert.equal(await tab.getAttribute('html', 'data-theme'), 'zlata');
        assert.equal((await storage(tab, 'mudrlant.look')).theme, 'zlata');
        await shot(tab, 'album-detail-tema-390-light');
        await tab.click('[data-album-back]');
        // Doplněk za odznak: Nasadit → v místě doplňku, dlaždice je pak označená jako nasazená
        await tab.click('[data-album-tab="accessories"]');
        await tab.click('[data-album-item="accessories:kompas"]');
        await tab.waitForSelector('[data-album-detail="accessories:kompas"]');
        assert.match(await tab.textContent('[data-album-how]'), /Za odznak „Navigátor“/);
        await shot(tab, 'album-detail-390-light');
        await tab.click('[data-album-wear]');
        await tab.waitForSelector('[data-album-worn]');
        assert.match(await tab.textContent('[data-album-note]'), /Kompas: hotovo\. Změníš to v Nastavení → Mudrlant\./);
        assert.deepEqual((await storage(tab, 'mudrlant.look')).acc.neck, { id: 'kompas', color: 'original' });
        await shot(tab, 'album-detail-nasazeno-390-light');
        await tab.click('[data-album-back]');
        assert.match(await tab.getAttribute('[data-album-item="accessories:kompas"]', 'class'), /ring-brand-600/);
        // Rámeček z truhly
        await tab.click('[data-album-tab="frames"]');
        await tab.click('[data-album-item="frames:diamant"]');
        await tab.click('[data-album-wear]');
        await tab.waitForSelector('[data-album-worn]');
        assert.equal((await storage(tab, 'mudrlant.look')).frame, 'diamant');
        await tab.click('[data-album-back]');
        // Rámeček za celé album: odměna, ještě zamčená, ukazuje se barevně jako lákadlo
        await tab.click('[data-album-item="frames:sberatel"]');
        assert.equal(await tab.getAttribute('[data-album-status]', 'data-album-status'), 'reward');
        assert.match(await tab.textContent('[data-album-how]'), /Odměna za celé album sbírky \(100\s%\)/);
        await tab.click('[data-album-back]');
        // Odznaky: skupina se stupni, nejvyšší získaný jako titul u jména
        await tab.click('[data-album-tab="badges"]');
        await tab.click('[data-album-item="badges:odpovedi"]');
        await tab.waitForSelector('[data-album-tiers]');
        assert.match(await tab.textContent('[data-album-how]'), /Další stupeň „Čtvrt tisíce“/);
        await tab.click('[data-album-wear]');
        await tab.waitForSelector('[data-album-worn]');
        assert.equal((await storage(tab, 'mudrlant.look')).title, 'stovka');
        // Diplom: Ukázat diplom otevře diplom
        await tab.click('[data-album-back]');
        await tab.click('[data-album-tab="diplomas"]');
        await tab.click('[data-album-item="diplomas:zemepis"]');
        await tab.click('[data-album-wear]');
        await tab.waitForSelector('[data-diploma-preview]');
        // Bez přihlášení postavičku jako profilový obrázek nastavit nejde: věta místo tlačítka
        await tab.keyboard.press('Escape');
        await openAlbum(tab);
        await tab.click('[data-album-tab="avatars"]');
        await tab.click('[data-album-item="avatars:drak"]');
        assert.equal(await tab.locator('[data-album-wear]').count(), 0);
        assert.match(await tab.textContent('[data-album-note]'), /po přihlášení/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('celé album: všechny milníky a tituly za sekce, rámeček Sběratelský odemčený, animovaný a jde nasadit', async () => {
        const { context, tab, problems } = await open({ seed: collector(), reducedMotion: 'no-preference' });
        await tab.waitForSelector('#celebration');
        const seen = [];
        for (let i = 0; i < 16 && await tab.locator('#celebration').count(); i++) {
            seen.push((await tab.textContent('#celebration').catch(() => '')).replace(/\s+/g, ' '));
            await tab.locator('#celebration').click({ timeout: 1500 }).catch(() => {});
            await tab.waitForTimeout(350);
        }
        const all = seen.join(' | ');
        assert.match(all, /Album sbírky: 100 %.*Legenda sbírky/);
        assert.match(all, /Celá sekce: Postavičky.*Celý zvěřinec/);
        assert.match(all, /Nová odměna.*Sběratelský/);
        const progress = await storage(tab, 'mudrlant.progress');
        for (const badge of Core.BADGES.filter(entry => Core.isAlbumBadge(entry.id))) assert.ok(progress.badges[badge.id], badge.id);
        await openAlbum(tab);
        assert.equal(await tab.textContent('[data-album-percent]'), '100 %');
        await tab.click('[data-album-tab="frames"]');
        await tab.click('[data-album-item="frames:sberatel"]');
        assert.equal(await tab.getAttribute('[data-album-status]', 'data-album-status'), 'owned');
        const spin = await tab.evaluate(() => getComputedStyle(document.querySelector('[data-album-detail] .frame-sberatel'), '::before').animationName);
        assert.equal(spin, 'frameSpin', 'rámeček se otáčí');
        await shot(tab, 'album-detail-sberatel-390-light');
        await tab.click('[data-album-wear]');
        await tab.waitForSelector('[data-album-worn]');
        assert.equal((await storage(tab, 'mudrlant.look')).frame, 'sberatel');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
