// Skládačka (puzzle.js, napojení v app.js) v prohlížeči: dlaždice na záložce Hrát mezi Režimy, úvod (varianta, počet dílků, sbírka),
// skládání klepnutím (vyber a polož), tažením myší i dotykem (stránka se při tažení neposouvá), nepovedený pokus bez trestu a nápověda
// po dvou pokusech, zvuk a vibrace zapadnutí, tip „Co to je?“, výsledek s názvem, faktem, sbírkou a XP, velké Další, návrat z rozehrané
// skládačky. Obrázek vlajky jde z Commons jako blob (v DOMu ani v adrese není název souboru). Rozložení na 390×780 a 360×640 ve světlém
// i tmavém režimu bez posouvání. Snímky: SHOTS_DIR=složka. Potřebuje Playwright (viz tests/e2e.test.js).
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
// Vlajka z „Commons“: česká vlajka (2 × 2 dílky jsou všechny různé)
const FLAG = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 3 2"><rect width="3" height="2" fill="#fff"/><rect width="3" height="1" y="1" fill="#d7141a"/><path d="M0 0L1.5 1L0 2Z" fill="#11457e"/></svg>';
// Státy z testovacích dat (fixtures): vlajky i obrysy jsou jen pro ně; Česko zůstane jako jediné nesložené
const STATES = Object.keys(fixtures.files['/data/countries.json'].countries);
// Vlajky států z data/vlajky.json (téma Vlajky se v testu bere ze skutečných dat; ne každý stát v nich vlajku má)
const FLAG_STATES = STATES.filter(q => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/vlajky.json'), 'utf8')).items.some(item => item.c === 'vlajka' && item.co && item.co.length === 1 && item.co[0] === q));
const OTHERS = FLAG_STATES.filter(q => q !== 'Q213');
const Puzzle = require('../puzzle.js');
// Dny Skládačky dne: 26. 11. 2026 obrys, 27. 11. 2026 vlajka (střídá se po dnech)
const OUTLINE_DAY = '2026-11-26';
const FLAG_DAY = '2026-11-27';

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

test('Skládačka: vlajka a obrys státu z dílků', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async ({ viewport = { width: 390, height: 780 }, colorScheme = 'light', seed = {}, reducedMotion = 'no-preference', day = '', flagsOff = false } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, hasTouch: true, reducedMotion });
        // Pevné datum (Skládačka dne); časovače běží dál
        if (day) await context.clock.setFixedTime(new Date(`${day}T12:00:00+01:00`));
        await context.addInitScript((seed) => {
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
        const flagRequests = [];
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.fallback();
            if (url.hostname === 'upload.wikimedia.org' && flagsOff) return route.abort();
            if (url.hostname === 'upload.wikimedia.org') { flagRequests.push(url.pathname); return route.fulfill({ contentType: 'image/svg+xml', body: FLAG, headers: { 'access-control-allow-origin': '*' } }); }
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: fixtures.extractFor(url.searchParams.get('titles')) } } } } });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await nav.waitForHome(tab);
        return { context, tab, problems, flagRequests };
    };
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const fits = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        const main = document.getElementById('app-content');
        return { scroll: main.scrollHeight - main.clientHeight, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const storage = (tab, key) => tab.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), key);
    const placed = async (tab) => Number(await tab.textContent('[data-pz-placed]'));
    // Klepnutí prstem se vyřídí až po dokončení dotyku (setTimeout 0 v puzzle.js): počká se na další úlohu stránky
    const settle = (tab) => tab.evaluate(() => new Promise(resolve => setTimeout(resolve, 30)));
    const openIntro = async (tab) => {
        await nav.go(tab, 'hrat');
        await tab.click('#mode-tiles [data-action="puzzle-open"]');
        await tab.waitForSelector('#puzzle-intro');
    };
    const startPuzzle = async (tab) => {
        await tab.click('[data-action="puzzle-start"]');
        await tab.waitForSelector('#puzzle-screen [data-pz-piece]', { timeout: 15000 });
    };
    const center = async (tab, selector) => { const box = await tab.locator(selector).boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
    // Tažení myší (s pohybem přes desku)
    const mouseDrag = async (tab, from, to) => {
        const a = await center(tab, from);
        const b = await center(tab, to);
        await tab.mouse.move(a.x, a.y);
        await tab.mouse.down();
        await tab.mouse.move(a.x + 12, a.y - 12, { steps: 2 });
        await tab.mouse.move(b.x, b.y, { steps: 8 });
        await tab.mouse.up();
        await tab.waitForFunction(() => !document.querySelector('.pz-ghost'));
    };
    // Tažení prstem (dotykové události přes CDP, jako na telefonu); vrátí, zda se během tažení posunula stránka nebo obsah
    const touchDrag = async (tab, cdp, from, to) => {
        const a = await center(tab, from);
        const b = await center(tab, to);
        const scrolled = () => tab.evaluate(() => window.scrollY + document.getElementById('app-content').scrollTop);
        const before = await scrolled();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
        let moved = false;
        for (let i = 1; i <= 8; i++) {
            const x = a.x + (b.x - a.x) * i / 8, y = a.y + (b.y - a.y) * i / 8;
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
            if (i === 5) moved = (await scrolled()) !== before || await tab.$('.pz-ghost') === null;
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await tab.waitForFunction(() => !document.querySelector('.pz-ghost'));
        return { moved, after: (await scrolled()) !== before };
    };
    // Položí dílek klepnutím: nejdřív na jeho místo, a když tam už leží stejně vypadající dílek, na první volné místo, kam pasuje
    const tapPlace = async (tab, piece) => {
        const count = await placed(tab);
        await tab.click(`[data-pz-piece="${piece}"]`);
        const own = await tab.$(`button[data-pz-slot="${piece}"]`);
        if (own) { await own.click(); if (await placed(tab) > count) return; }
        for (const slot of await tab.$$eval('button[data-pz-slot]', list => list.map(el => el.dataset.pzSlot))) {
            if (!(await tab.$(`[data-pz-piece="${piece}"][aria-pressed="true"]`))) await tab.click(`[data-pz-piece="${piece}"]`);
            await tab.click(`button[data-pz-slot="${slot}"]`);
            if (await placed(tab) > count) return;
        }
        assert.fail(`dílek ${piece} nejde položit`);
    };

    await t.test('dlaždice Skládačka na záložce Hrát, úvod s volbou varianty a počtu dílků, vlajka klepnutím, tažením myší i prstem, tip a výsledek', async () => {
        const { context, tab, problems, flagRequests } = await open({ seed: { 'mudrlant.skladacka': { variant: 'outline', size: 9, got: { flag: OTHERS } } } });
        await nav.go(tab, 'hrat');
        const tiles = await tab.$$eval('#mode-tiles > button', list => list.map(el => ({ title: el.querySelector('[data-mode-title]').textContent.trim(), cut: el.querySelector('[data-mode-title]').scrollWidth > el.querySelector('[data-mode-title]').clientWidth + 1, h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width })));
        assert.ok(tiles.some(tile => tile.title === 'Skládačka'), tiles.map(tile => tile.title).join(', '));
        for (const tile of tiles) {
            assert.ok(!tile.cut, `název ${tile.title} se vejde`);
            assert.ok(tile.h >= 44 && tile.w >= 44, `${tile.title}: ${tile.w}×${tile.h}`);
        }
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await openIntro(tab);
        assert.match(await tab.textContent('#status-badge'), /Skládačka/i);
        // Uložená volba (obrys, 9 dílků), sbírka X / Y podle dat
        assert.equal(await tab.getAttribute('[data-action="puzzle-variant"][data-variant="outline"]', 'aria-pressed'), 'true');
        assert.equal(await tab.getAttribute('[data-action="puzzle-size"][data-size="9"]', 'aria-pressed'), 'true');
        await tab.waitForFunction((n) => document.querySelector('[data-puzzle-count="flag"]').textContent.trim() === `Sbírka ${n - 1} / ${n}`, FLAG_STATES.length, { timeout: 5000 });
        assert.match(await tab.textContent('[data-puzzle-count="outline"]'), /Sbírka 0 \/ 7/);
        const intro = await tab.textContent('#puzzle-intro');
        assert.match(intro, /Bez časovače/);
        assert.match(intro, /přetáhni na jeho místo, nebo ho klepnutím vyber/);
        assert.match(intro, /dnes ještě až 40\sXP/);
        await tab.click('[data-action="puzzle-variant"][data-variant="flag"]');
        await tab.click('[data-action="puzzle-size"][data-size="4"]');
        assert.deepEqual({ variant: (await storage(tab, 'mudrlant.skladacka')).variant, size: (await storage(tab, 'mudrlant.skladacka')).size }, { variant: 'flag', size: 4 });
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await shot(tab, 'skladacka-uvod-390-light');
        await startPuzzle(tab);
        // Vlajka Česka (jediná nesložená), obrázek jako blob: bez názvu souboru
        assert.ok(flagRequests.some(name => /Flag/i.test(decodeURIComponent(name))), 'vlajka z Commons');
        const html = await tab.innerHTML('#puzzle-screen');
        assert.doesNotMatch(html, /Flag|Czech|\.svg|upload\.wikimedia/i, 'v DOMu není název souboru');
        assert.match(html, /href="blob:/);
        assert.equal(await tab.locator('[data-pz-piece]').count(), 4);
        assert.equal(await tab.locator('button[data-pz-slot]').count(), 4);
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        assert.match(await tab.textContent('#status-badge'), /Skládačka · Vlajka/i);
        // Lišta během skládání skrytá (víc místa)
        assert.ok(await tab.$eval('#app-nav', nav => nav.classList.contains('hidden')));
        await shot(tab, 'skladacka-vlajka-390-light');

        // Klepnutím: vybrat dílek 0 a dvakrát špatně (vrátí se, bez trestu), pak nápověda a správně
        await tab.click('[data-pz-piece="0"]');
        assert.equal(await tab.getAttribute('[data-pz-piece="0"]', 'aria-pressed'), 'true');
        await tab.click('button[data-pz-slot="3"]');
        assert.equal(await placed(tab), 0);
        assert.match(await tab.textContent('[data-pz-status]'), /nepatří/);
        assert.equal(await tab.getAttribute('[data-pz-piece="0"]', 'aria-pressed'), 'true', 'dílek zůstane vybraný');
        assert.equal(await tab.locator('.pz-hint').count(), 0);
        await tab.click('button[data-pz-slot="1"]');
        assert.equal(await tab.locator('button[data-pz-slot="0"].pz-hint').count(), 1, 'po dvou pokusech nápověda');
        assert.match(await tab.textContent('[data-pz-status]'), /Zvýrazněné místo/);
        await tab.evaluate(() => { window.__tones.length = 0; window.__vibrations.length = 0; });
        await tab.click('button[data-pz-slot="0"]');
        assert.equal(await placed(tab), 1);
        assert.equal(await tab.locator('[data-pz-slot="0"][data-filled]').count(), 1);
        assert.equal(await tab.locator('[data-pz-piece="0"]').count(), 0, 'dílek zmizel ze zásobníku');
        assert.equal(await tab.textContent('[data-pz-moves]'), '3');
        assert.match(await tab.textContent('[data-pz-status]'), /Zapadl\. Zbývají 3 dílky\./);
        assert.ok(await tab.evaluate(() => window.__tones.includes(1567.98)), 'cvaknutí');
        assert.deepEqual(await tab.evaluate(() => window.__vibrations), [12]);
        // Položený dílek se už nehne: místo je jen obrázek, ne tlačítko
        assert.equal(await tab.locator('button[data-pz-slot="0"]').count(), 0);

        // Tažení myší na špatné místo: dílek se vrátí, pak na správné
        await mouseDrag(tab, '[data-pz-piece="1"]', 'button[data-pz-slot="2"]');
        assert.equal(await placed(tab), 1);
        assert.equal(await tab.locator('[data-pz-piece="1"]').count(), 1);
        await tab.waitForFunction(() => !document.querySelector('.pz-ghost'));
        await mouseDrag(tab, '[data-pz-piece="1"]', 'button[data-pz-slot="1"]');
        assert.equal(await placed(tab), 2);
        await tab.waitForFunction(() => !document.querySelector('.pz-ghost'));

        // Tip: čtyři možnosti, správná je Česko; jednou a dál už nejde
        await tab.click('[data-action="puzzle-guess"]');
        const options = await tab.$$eval('[data-action="puzzle-guess-pick"]', list => list.map(el => el.textContent.trim()));
        assert.equal(options.length, 4);
        assert.ok(options.includes('Česko'), options.join(', '));
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await shot(tab, 'skladacka-tip-390-light');
        await tab.click('[data-action="puzzle-guess-pick"]:has-text("Česko")');
        assert.match(await tab.textContent('[data-pz-status]'), /Správně, je to Česko!/);
        assert.equal(await tab.textContent('[data-pz-named]'), 'Česko');
        assert.equal(await tab.locator('[data-action="puzzle-guess"]').count(), 0);

        // Tažení prstem: stránka se neposune
        const cdp = await context.newCDPSession(tab);
        const touch = await touchDrag(tab, cdp, '[data-pz-piece="2"]', 'button[data-pz-slot="2"]');
        assert.deepEqual(touch, { moved: false, after: false }, 'při tažení se nic neposouvá a dílek jede s prstem');
        assert.equal(await placed(tab), 3);
        await tab.evaluate(() => { window.__tones.length = 0; window.__vibrations.length = 0; });
        // Poslední dílek klepnutím prstem (hned po tažení prstem i po myši): hotovo
        await tab.tap('[data-pz-piece="3"]');
        await settle(tab);
        await tab.tap('button[data-pz-slot="3"]');
        await tab.waitForSelector('#puzzle-done');
        assert.ok(await tab.evaluate(() => window.__tones.includes(1046.5)), 'tón složení');
        assert.deepEqual(await tab.evaluate(() => window.__vibrations), [[30, 40, 70]]);
        assert.equal((await tab.textContent('[data-pz-name]')).trim(), 'Česko');
        // Malá vlajka u názvu (u vlajky z obrázku skládačky)
        await tab.waitForSelector('[data-pz-flag="shown"] img');
        const mini = await tab.$eval('[data-pz-flag]', el => ({ h: el.getBoundingClientRect().height, src: el.querySelector('img').getAttribute('src') }));
        assert.ok(mini.h >= 20 && mini.h <= 24.5, JSON.stringify(mini));
        assert.match(mini.src, /^blob:/);
        const done = (await tab.textContent('#puzzle-done')).replace(/\s+/g, ' ');
        assert.match(done, /Vlajka · 4 dílky · 7 tahů/);
        assert.match(done, /Stát v Evropě · hlavní město Praha/);
        assert.match(done, /Uhodnuto dřív, než bylo hotovo!/);
        assert.ok(done.includes(`Celá sbírka je složená · ${FLAG_STATES.length} / ${FLAG_STATES.length}`), done);
        assert.match(done, /\+4\sXP/);
        assert.match(done, /za složení \(4 dílky\)/);
        assert.match(done, /za uhodnutí předem/);
        const saved = await storage(tab, 'mudrlant.skladacka');
        assert.ok(saved.got.flag.includes('Q213'));
        assert.equal(saved.xp, 4);
        assert.equal((await storage(tab, 'mudrlant.progress')).xp, 4);
        // Lišta je zpět a výsledek se vejde
        assert.ok(!(await tab.$eval('#app-nav', nav => nav.classList.contains('hidden'))));
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        await shot(tab, 'skladacka-hotovo-390-light');
        // Další: jiná vlajka hned
        await tab.click('[data-action="puzzle-next"]');
        await tab.waitForSelector('#puzzle-screen [data-pz-piece]');
        // Zpět: úvod s Pokračovat, skládačka zůstane rozehraná
        await tab.click('[data-pz-piece="0"]');
        await tab.click('button[data-pz-slot="0"]');
        await tab.click('#btn-home');
        await tab.waitForSelector('#puzzle-intro [data-action="puzzle-resume"]');
        await tab.click('[data-action="puzzle-resume"]');
        await tab.waitForSelector('#puzzle-screen');
        assert.equal(await placed(tab), 1);
        assert.deepEqual(problems, []);
        await context.close();
    });

    for (const colorScheme of ['light', 'dark']) {
        await t.test(`360×640 ${colorScheme}: obrys státu z 16 dílků, zaměnitelné moře, bez posouvání; omezený pohyb`, async () => {
            const { context, tab, problems } = await open({ viewport: { width: 360, height: 640 }, colorScheme, reducedMotion: colorScheme === 'dark' ? 'reduce' : 'no-preference',
                seed: { 'mudrlant.skladacka': { variant: 'outline', size: 16 } } });
            await nav.go(tab, 'hrat');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `skladacka-hrat-360-${colorScheme}`);
            await openIntro(tab);
            await tab.waitForFunction(() => /Sbírka 0 \/ 7/.test(document.querySelector('[data-puzzle-count="outline"]').textContent));
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `skladacka-uvod-360-${colorScheme}`);
            await startPuzzle(tab);
            assert.equal(await tab.locator('[data-pz-piece]').count(), 16);
            assert.equal(await tab.locator("#puzzle-screen [data-pz-piece] svg path").count(), 16, 'obrys v každém dílku (SVG)');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            // Deska i zásobník celé na obrazovce, dílky aspoň 40 px na šířku na desce
            const boxes = await tab.evaluate(() => {
                const rect = (el) => el.getBoundingClientRect();
                const main = rect(document.getElementById('app-content'));
                const board = rect(document.querySelector('[data-pz-board]'));
                const tray = rect(document.querySelector('[data-pz-tray]'));
                const piece = rect(document.querySelector('[data-pz-piece]'));
                return { inside: [board, tray].every(r => r.top >= main.top - 1 && r.bottom <= main.bottom + 1 && r.left >= main.left - 1 && r.right <= main.right + 1), slot: board.width / 4, piece: Math.min(piece.width, piece.height) };
            });
            assert.ok(boxes.inside, 'deska a zásobník na obrazovce');
            assert.ok(boxes.slot >= 40 && boxes.piece >= 28, JSON.stringify(boxes));
            await shot(tab, `skladacka-obrys-360-${colorScheme}`);
            // Tažení prstem i na malém displeji
            const cdp = await context.newCDPSession(tab);
            const piece = await tab.getAttribute('[data-pz-piece]', 'data-pz-piece');
            const own = await tab.$(`button[data-pz-slot="${piece}"]`);
            assert.ok(own);
            const touch = await touchDrag(tab, cdp, `[data-pz-piece="${piece}"]`, `button[data-pz-slot="${piece}"]`);
            assert.equal(touch.after, false);
            assert.equal(await placed(tab), 1);
            // Hned po tažení prstem klepnutí prstem: vybere dílek (tažený dílek nezmizí dřív, než prst pustí displej)
            const next = await tab.getAttribute('[data-pz-piece]', 'data-pz-piece');
            await tab.tap(`[data-pz-piece="${next}"]`);
            await settle(tab);
            assert.equal(await tab.getAttribute(`[data-pz-piece="${next}"]`, 'aria-pressed'), 'true');
            // Zbytek klepnutím; moře je zaměnitelné, takže každý dílek někam zapadne
            for (let i = 0; i < 20 && await tab.$('[data-pz-piece]'); i++) await tapPlace(tab, await tab.getAttribute('[data-pz-piece]', 'data-pz-piece'));
            await tab.waitForSelector('#puzzle-done');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            assert.match(await tab.textContent('#puzzle-done'), /Obrys státu · 16 dílků/);
            assert.match(await tab.textContent('#puzzle-done'), /Rozloha \d/);
            assert.match(await tab.textContent('#puzzle-done'), /Nové ve sbírce · 1 \/ 7/);
            assert.match(await tab.textContent('#puzzle-done'), /\+6\sXP/);
            // Malá vlajka u obrysu (náhled z Commons jako blob, s rámečkem)
            await tab.waitForSelector('[data-pz-flag="shown"] img');
            assert.match(await tab.getAttribute('[data-pz-flag] img', 'src'), /^blob:/);
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `skladacka-hotovo-360-${colorScheme}`);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    // Složí celou rozehranou skládačku klepnutím
    const solve = async (tab) => {
        for (let i = 0; i < 40 && await tab.$('[data-pz-piece]'); i++) await tapPlace(tab, await tab.getAttribute('[data-pz-piece]', 'data-pz-piece'));
        await tab.waitForSelector('#puzzle-done');
    };
    const dailyCases = [
        { day: OUTLINE_DAY, viewport: { width: 360, height: 640 }, colorScheme: 'light' },
        { day: OUTLINE_DAY, viewport: { width: 390, height: 780 }, colorScheme: 'dark' },
        { day: FLAG_DAY, viewport: { width: 390, height: 780 }, colorScheme: 'light' },
        { day: FLAG_DAY, viewport: { width: 360, height: 640 }, colorScheme: 'dark' }
    ];
    for (const { day, viewport, colorScheme } of dailyCases) {
        const variant = Puzzle.dailyVariant(day);
        const size = `${viewport.width}`;
        await t.test(`Skládačka dne ${day} (${variant}) ${viewport.width}×${viewport.height} ${colorScheme}: karta na úvodu, 4 × 4, XP jednou, výsledek s vlajkou`, async () => {
            const { tab, context, problems } = await open({ viewport, colorScheme, day, seed: { 'mudrlant.skladacka': { variant: 'flag', size: 4, day, xp: 40 } } });
            await openIntro(tab);
            // Karta Skládačka dne nahoře: nesplněná, tlačítko Hrát; úvod se vejde
            const card = tab.locator('[data-puzzle-daily="open"]');
            assert.equal(await card.count(), 1);
            assert.match((await card.textContent()).replace(/\s+/g, ' '), new RegExp(`Skládačka dne ${variant === 'flag' ? 'Vlajka' : 'Obrys státu'} · 16 dílků · \\+15 XP Hrát`));
            const order = await tab.$$eval('#puzzle-intro > *', list => list.map(el => (el.dataset.puzzleDaily ? 'daily' : el.getAttribute('role') || el.tagName.toLowerCase())));
            assert.equal(order[1], 'daily', `karta hned pod nadpisem: ${order.join(', ')}`);
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `skladacka-dne-uvod-${size}-${colorScheme}-${variant}`);
            await tab.click('[data-action="puzzle-daily"]');
            await tab.waitForSelector('#puzzle-screen [data-pz-piece]', { timeout: 15000 });
            assert.equal(await tab.getAttribute('#puzzle-screen', 'data-size'), '16');
            assert.equal(await tab.getAttribute('#puzzle-screen', 'data-variant'), variant);
            assert.equal(await tab.locator('[data-pz-piece]').count(), 16);
            assert.match(await tab.textContent('#status-badge'), /Skládačka dne/);
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            // Stejné zamíchání pro všechny: pořadí zásobníku je ze semínka dne
            const tray = await tab.$$eval('[data-pz-piece]', list => list.map(el => Number(el.dataset.pzPiece)));
            assert.deepEqual(tray, Puzzle.createGame({ variant, size: 16, item: {}, rng: Puzzle.seeded(`skladacka-dne|${day}`) }).tray);
            await shot(tab, `skladacka-dne-hra-${size}-${colorScheme}-${variant}`);
            // Odchod a návrat: rozehraná Skládačka dne pokračuje (karta ukazuje Pokračovat)
            await tapPlace(tab, tray[0]);
            await tab.click('#btn-home');
            await tab.waitForSelector('[data-puzzle-daily="open"]');
            assert.match(await tab.textContent('[data-action="puzzle-daily"]'), /Pokračovat/);
            await tab.click('[data-action="puzzle-daily"]');
            await tab.waitForSelector('#puzzle-screen');
            assert.equal(await placed(tab), 1);
            await solve(tab);
            const done = (await tab.textContent('#puzzle-done')).replace(/\s+/g, ' ');
            assert.match(done, /Skládačka dne · 16 dílků · \d+ tahů/);
            assert.match(done, /\+15\sXP/);
            assert.match(done, /za Skládačku dne/);
            assert.match(done, /Hrát volně/);
            // Malá vlajka státu u názvu, s rámečkem (bílá vlajka je vidět i v tmavém režimu)
            await tab.waitForSelector('[data-pz-flag="shown"] img');
            const mini = await tab.$eval('[data-pz-flag]', el => { const r = el.getBoundingClientRect(); return { h: r.height, w: r.width, ring: getComputedStyle(el).boxShadow, name: el.nextElementSibling.textContent.trim() }; });
            assert.ok(mini.h >= 20 && mini.h <= 24.5 && mini.w >= 20, JSON.stringify(mini));
            assert.notEqual(mini.ring, 'none', 'rámeček');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `skladacka-dne-hotovo-${size}-${colorScheme}-${variant}`);
            const saved = await storage(tab, 'mudrlant.skladacka');
            const entry = saved.daily[day];
            assert.equal(entry.v, variant);
            assert.ok(entry.moves >= 16);
            assert.equal(saved.xp, 40, 'mimo denní strop volné hry');
            assert.ok(saved.got[variant].includes(entry.id), 've sbírce');
            assert.equal(mini.name, fixtures.files['/data/countries.json'].countries[entry.id].name);
            assert.equal((await storage(tab, 'mudrlant.progress')).xp, 15);
            // Zpět na úvod: splněná karta s fajfkou a počtem tahů; Ukázat ukáže výsledek bez XP
            await tab.click('[data-action="puzzle-intro"]');
            await tab.waitForSelector('[data-puzzle-daily="done"]');
            assert.match((await tab.textContent('[data-puzzle-daily="done"]')).replace(/\s+/g, ' '), new RegExp(`Hotovo · ${entry.moves} tahů Ukázat`));
            assert.equal(await tab.locator('[data-puzzle-daily="done"] .lucide-circle-check, [data-puzzle-daily="done"] [data-lucide="circle-check"]').count(), 1, 'fajfka');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `skladacka-dne-uvod-hotovo-${size}-${colorScheme}-${variant}`);
            await tab.click('[data-action="puzzle-daily"]');
            await tab.waitForSelector('#puzzle-done [data-pz-daily-done]');
            assert.match(await tab.textContent('#puzzle-done'), new RegExp(`${entry.moves} tahů`));
            assert.equal(await tab.locator('#puzzle-done [data-pz-xp]').count(), 0, 'bez XP podruhé');
            await tab.waitForSelector('[data-pz-flag="shown"] img');
            assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
            await shot(tab, `skladacka-dne-vysledek-${size}-${colorScheme}-${variant}`);
            assert.equal((await storage(tab, 'mudrlant.progress')).xp, 15);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('Skládačka dne v den vlajky bez internetu: skládá se obrys téhož státu, malá vlajka chybí a nic se nerozbije', async () => {
        const { tab, context, problems } = await open({ viewport: { width: 360, height: 640 }, day: FLAG_DAY, flagsOff: true });
        await openIntro(tab);
        await tab.click('[data-action="puzzle-daily"]');
        await tab.waitForSelector('#puzzle-screen [data-pz-piece]', { timeout: 20000 });
        assert.equal(await tab.getAttribute('#puzzle-screen', 'data-variant'), 'outline');
        assert.match(await tab.textContent('[data-pz-status]'), /Vlajka se teď nenačetla, dnes se skládá obrys státu/);
        await solve(tab);
        assert.equal(await tab.locator('[data-pz-flag="shown"]').count(), 0);
        assert.deepEqual(await fits(tab), { scroll: 0, wide: 0 });
        assert.equal((await storage(tab, 'mudrlant.skladacka')).daily[FLAG_DAY].v, 'outline');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
