// Otázka „Ukaž na mapě“ v prohlížeči: klepnutí, přesun tipu, přiblížení a posun mapy, klávesnice, body podle vzdálenosti,
// vzdání, varianta s psaním, kde se otázka neobjeví (dnešní otázky, chyby), mapa bez internetu a vzhled na malých telefonech
// (390×780, 360×640) ve světlém i tmavém režimu. Malá testovací data (tests/fixtures.js), skutečné mapy (data/mapa.json).
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const startServer = (flags) => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/data/mapa.json') flags.mapRequests = (flags.mapRequests || 0) + 1;
        if (pathname === '/data/mapa.json' && flags.mapDown) { response.writeHead(503); return response.end(); }
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

test('otázka „Ukaž na mapě“', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const flags = {};
    const server = await startServer(flags);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // gap = počítadlo otázek do další otázky na mapě (10 = hned další vhodná otázka je na mapě)
    const open = async ({ width = 390, height = 780, colorScheme = 'light', variant = 'choices', gap = 10, categories = ['mesto'], storage = {}, hasTouch = false } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme, hasTouch });
        await context.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
        await context.addInitScript((entries) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
        }, {
            'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': variant, 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }),
            'mudrlant.settings': JSON.stringify({ tier: 'known', seen: ['zemepis'], categories: { zemepis: categories } }), 'mudrlant.mapGap': String(gap), ...storage
        });
        await context.route(/^https:\/\//, route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cs.wikipedia.org') {
                const title = url.searchParams.get('titles');
                return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: fixtures.extractFor(title) } } } } });
            }
            if (['upload.wikimedia.org', 'tile.openstreetmap.org', 'gibs.earthdata.nasa.gov'].includes(url.hostname)) return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="play-topic"][data-topic="zemepis"]');
        return { context, tab, problems };
    };
    const startZemepis = async (tab) => {
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="map-confirm"], [data-action="choice"], #answer-form', { timeout: 30000 });
    };
    const waitForMap = (tab, selector = '[data-map-question]') => tab.waitForSelector(`${selector} svg path`, { timeout: 30000 });
    const session = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')));
    const stored = (tab, key) => tab.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    const overflow = (tab) => tab.evaluate(() => { const content = document.getElementById('app-content'); return content.scrollHeight - content.clientHeight; });
    const viewBox = (tab, selector = '[data-map-question]') => tab.evaluate((s) => document.querySelector(`${s} svg`).getAttribute('viewBox').split(' ').map(Number), selector);
    // Kde na obrazovce je místo (šířka, délka) na mapě otázky
    const screenPoint = (tab, lat, lon, selector = '[data-map-question]') => tab.evaluate(({ lat, lon, selector }) => {
        const question = JSON.parse(localStorage.getItem('mudrlant.session')).data.question;
        const [mx, my] = window.MudrlantMapQuestion.frameOf(question.map.region).toMap(lat, lon);
        const svg = document.querySelector(`${selector} svg`);
        const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
        const rect = svg.getBoundingClientRect();
        return { x: rect.left + (mx - vx) / vw * rect.width, y: rect.top + (my - vy) / vh * rect.height };
    }, { lat, lon, selector });

    await t.test('trefa: klepnutí na místo, přesun tipu, potvrzení a plné body s XP', async () => {
        const { context, tab, problems } = await open();
        await startZemepis(tab);
        await waitForMap(tab);
        const { data, round } = await session(tab);
        assert.equal(data.question.type, 'map');
        assert.match(await tab.textContent('h2'), new RegExp(`^Kde leží ${data.name}\\?$`));
        assert.deepEqual(data.hints, [], 'otázka na mapě nemá nápovědy');
        assert.equal(await tab.$('[data-action="choice"]'), null);
        assert.equal(await tab.$('[data-action="hint"]'), null);
        assert.equal(await tab.$('p.italic'), null, 'popis z Wikipedie by místo prozradil');
        assert.equal(await stored(tab, 'mudrlant.mapGap'), 0, 'počítadlo začne znovu');
        assert.equal(round.mapGuess, undefined);
        assert.ok(await tab.isDisabled('[data-action="map-confirm"]'));
        assert.match(await tab.textContent('[data-action="map-confirm"]'), /Nejdřív klepni na mapu/);
        assert.match(await tab.textContent('#app-content'), new RegExp(`Plné 4 body do ${data.question.map.full} km`));
        assert.ok(await tab.isDisabled('[data-map-zoom="out"]'), 'víc oddálit nejde');
        // Nejdřív vedle, pak přesun tipu přesně na místo
        const map = await tab.locator('[data-map-question]').boundingBox();
        await tab.mouse.click(map.x + 20, map.y + map.height - 60);
        assert.ok((await session(tab)).round.mapGuess, 'tip se uloží');
        assert.equal(await tab.locator('[data-mark="guess"]').count(), 1);
        assert.match(await tab.textContent('[data-action="map-confirm"]'), /Potvrdit/);
        const target = await screenPoint(tab, data.question.map.lat, data.question.map.lon);
        await tab.mouse.click(target.x, target.y);
        assert.equal(await tab.locator('[data-mark="guess"]').count(), 1, 'tip se přesune, nepřibude');
        const guess = (await session(tab)).round.mapGuess;
        assert.ok(Math.abs(guess.lat - data.question.map.lat) < 0.5 && Math.abs(guess.lon - data.question.map.lon) < 0.5);
        await tab.click('[data-action="map-confirm"]');
        await waitForMap(tab, '#map-guess');
        const after = await session(tab);
        assert.equal(after.round.correct, true);
        assert.equal(after.round.points, 4);
        assert.ok(after.round.map.km <= data.question.map.full);
        assert.match(await tab.textContent('[data-verdict]'), /Trefa! \+4 body/);
        assert.match(await tab.textContent('[data-verdict]'), /\+30 XP/);
        assert.equal((await stored(tab, 'mudrlant.stats')).practice.points, 4);
        assert.equal(await tab.getAttribute('[data-action="result-tab"][aria-selected="true"]', 'data-step'), 'guess', 'výsledek začne mapou s tipem');
        assert.equal(await tab.locator('#map-guess [data-mark="guess"]').count(), 1);
        assert.equal(await tab.locator('#map-guess [data-mark="target"]').count(), 1);
        assert.equal(await tab.locator('#map-guess polyline').count(), 1, 'čára mezi tipem a místem');
        assert.match(await tab.textContent('[data-map-distance]'), /^Vedle o /);
        assert.deepEqual(problems, []);
        // Další otázka už na mapě není (počítadlo začalo znovu)
        await tab.click('[data-action="next"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        assert.equal(await stored(tab, 'mudrlant.mapGap'), 1);
        await context.close();
    });

    await t.test('vedle: bez bodů, položka mezi chybami; posun tažením a přiblížení tip nepoloží', async () => {
        const { context, tab, problems } = await open({ width: 360, height: 640, colorScheme: 'dark' });
        await startZemepis(tab);
        await waitForMap(tab);
        const before = await viewBox(tab);
        await tab.click('[data-map-zoom="in"]');
        await tab.waitForTimeout(100);
        const zoomed = await viewBox(tab);
        assert.ok(Math.abs(zoomed[2] - before[2] / 2) < 0.5, 'tlačítko přiblíží dvakrát');
        assert.ok(!(await tab.isDisabled('[data-map-zoom="out"]')));
        const map = await tab.locator('[data-map-question]').boundingBox();
        await tab.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
        await tab.mouse.down();
        await tab.mouse.move(map.x + map.width / 2 + 60, map.y + map.height / 2 + 40, { steps: 6 });
        await tab.mouse.up();
        await tab.waitForTimeout(100);
        const panned = await viewBox(tab);
        assert.ok(Math.abs(panned[0] - zoomed[0]) > 1 || Math.abs(panned[1] - zoomed[1]) > 1, 'tažení posune mapu');
        assert.equal((await session(tab)).round.mapGuess, undefined, 'tažení tip nepoloží');
        await tab.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
        await tab.mouse.wheel(0, -200);
        await tab.waitForTimeout(150);
        assert.ok((await viewBox(tab))[2] < panned[2], 'kolečko přibližuje');
        // Úplně oddálit a klepnout do rohu mapy daleko od místa
        while (!(await tab.isDisabled('[data-map-zoom="out"]'))) await tab.click('[data-map-zoom="out"]');
        assert.ok(Math.abs((await viewBox(tab))[2] - before[2]) < 0.5, 'oddálení až na celou oblast');
        await tab.mouse.click(map.x + 6, map.y + 6);
        const { data } = await session(tab);
        await tab.click('[data-action="map-confirm"]');
        await waitForMap(tab, '#map-guess');
        const { round } = await session(tab);
        assert.equal(round.correct, false);
        assert.equal(round.points, 0);
        assert.ok(round.map.km > data.question.map.zero);
        assert.match(await tab.textContent('[data-verdict]'), /Tentokrát vedle/);
        assert.match(await tab.textContent('[data-verdict]'), /body jen do/);
        assert.ok((await stored(tab, 'mudrlant.mistakes')).includes(`zemepis:${data.id}`));
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('dotyk: klepnutí prstem položí tip, dva prsty přibližují a tip nepoloží', async () => {
        const { context, tab, problems } = await open({ width: 360, height: 640, hasTouch: true });
        await startZemepis(tab);
        await waitForMap(tab);
        const map = await tab.locator('[data-map-question]').boundingBox();
        const before = await viewBox(tab);
        // Dva prsty od sebe (ukazatele typu touch, jak je posílá telefon)
        await tab.evaluate(({ x, y }) => {
            const svg = document.querySelector('[data-map-question] svg');
            const fire = (type, pointerId, clientX) => svg.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', clientX, clientY: y, bubbles: true, isPrimary: pointerId === 11 }));
            fire('pointerdown', 11, x - 20);
            fire('pointerdown', 12, x + 20);
            for (let step = 1; step <= 5; step++) { fire('pointermove', 11, x - 20 - step * 12); fire('pointermove', 12, x + 20 + step * 12); }
            fire('pointerup', 11, x - 80);
            fire('pointerup', 12, x + 80);
        }, { x: map.x + map.width / 2, y: map.y + map.height / 2 });
        await tab.waitForTimeout(150);
        const pinched = await viewBox(tab);
        assert.ok(pinched[2] < before[2] / 2, `dva prsty přiblíží (${Math.round(before[2])} → ${Math.round(pinched[2])})`);
        assert.equal((await session(tab)).round.mapGuess, undefined, 'přiblížení tip nepoloží');
        await tab.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 2);
        assert.ok((await session(tab)).round.mapGuess, 'klepnutí prstem tip položí');
        assert.ok(!(await tab.isDisabled('[data-action="map-confirm"]')));
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('klávesnice: šipka položí a posune tip, Enter potvrdí; vzdání ukáže místo bez tipu', async () => {
        const { context, tab, problems } = await open();
        await startZemepis(tab);
        await waitForMap(tab);
        await tab.focus('[data-map-question]');
        await tab.keyboard.press('ArrowRight');
        const first = (await session(tab)).round.mapGuess;
        assert.ok(first, 'první šipka položí tip doprostřed');
        await tab.keyboard.press('ArrowRight');
        assert.ok((await session(tab)).round.mapGuess.lon > first.lon, 'šipka doprava posune tip na východ');
        await tab.keyboard.press('Enter');
        await waitForMap(tab, '#map-guess');
        assert.equal((await session(tab)).round.answered, true);
        await tab.click('[data-action="next"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        // Vzdání otázky na mapě
        await tab.evaluate(() => localStorage.setItem('mudrlant.mapGap', '10'));
        await tab.click('[data-action="give-up"]');
        await tab.click('[data-action="next"]');
        await waitForMap(tab);
        await tab.click('[data-action="give-up"]');
        await waitForMap(tab, '#map-guess');
        assert.match(await tab.textContent('[data-verdict]'), /Tentokrát bez odpovědi/);
        assert.equal(await tab.locator('#map-guess [data-mark="target"]').count(), 1);
        assert.equal(await tab.locator('#map-guess [data-mark="guess"]').count(), 0);
        assert.match(await tab.textContent('[data-map-distance]'), /Bez tipu/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('psaní: stejná mapa za dvojnásobek bodů (8)', async () => {
        const { context, tab, problems } = await open({ variant: 'typed' });
        await startZemepis(tab);
        await waitForMap(tab);
        assert.equal(await tab.$('#answer-form'), null, 'na mapě se nepíše');
        const { data } = await session(tab);
        assert.match(await tab.textContent('#app-content'), /Plné 8 bodů/);
        const target = await screenPoint(tab, data.question.map.lat, data.question.map.lon);
        await tab.mouse.click(target.x, target.y);
        await tab.click('[data-action="map-confirm"]');
        await waitForMap(tab, '#map-guess');
        const { round } = await session(tab);
        assert.equal(round.points, 8);
        assert.equal(round.typed, false, 'odznaky za psaní se nepočítají');
        assert.match(await tab.textContent('[data-verdict]'), /Trefa! \+8 bodů/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('režim Ukaž na mapě (zkušební): z výběru tématu jen otázky na mapě, jedna za druhou', async () => {
        // gap 0 = v běžném procvičování by otázka na mapě teď nepřišla; režim ji dá vždy
        const { context, tab, problems } = await open({ gap: 0, storage: { 'mudrlant.settings': JSON.stringify({ tier: 'known', seen: [], categories: { zemepis: ['mesto'] } }) } });
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('#play-chooser [data-chooser-map]');
        await tab.click('#play-chooser [data-chooser-map]');
        for (let i = 0; i < 3; i++) {
            await tab.waitForSelector('[data-action="map-confirm"]', { timeout: 30000 });
            assert.match(await tab.textContent('#status-badge'), /Ukaž na mapě · Zeměpis/);
            await tab.click('[data-action="give-up"]');
            await tab.waitForSelector('[data-verdict]');
            assert.match(await tab.textContent('[data-action="next"]'), /Další na mapě/);
            await tab.click('[data-action="next"]');
        }
        await tab.waitForSelector('[data-action="map-confirm"]', { timeout: 30000 });
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('dnešní otázky a procvičování chyb otázku na mapě nemají, počítadlo se nemění', async () => {
        const { context, tab, problems } = await open({ storage: { 'mudrlant.mistakes': JSON.stringify(['zemepis:Q5000', 'zemepis:Q64']) } });
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        assert.equal(await tab.$('[data-action="map-confirm"]'), null);
        assert.equal(await stored(tab, 'mudrlant.mapGap'), 10);
        await tab.click('#btn-learn');
        await tab.click('[data-action="learn-mistakes"]');
        await tab.click('[data-action="practice-mistakes"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        assert.equal(await tab.$('[data-action="map-confirm"]'), null);
        assert.equal(await stored(tab, 'mudrlant.mapGap'), 10);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('bez mapových dat obvyklá otázka; rozehraný tip přežije obnovení stránky', async () => {
        flags.mapDown = true;
        const offline = await open();
        await startZemepis(offline.tab);
        assert.ok(await offline.tab.$('[data-action="choice"]'), 'bez mapy otázka s možnostmi');
        assert.ok(await stored(offline.tab, 'mudrlant.mapGap') >= 10, 'otázka na mapě přijde, až mapa půjde načíst');
        assert.deepEqual(offline.problems, []);
        await offline.context.close();
        flags.mapDown = false;

        const { context, tab, problems } = await open();
        await startZemepis(tab);
        await waitForMap(tab);
        const map = await tab.locator('[data-map-question]').boundingBox();
        await tab.mouse.click(map.x + map.width * 0.4, map.y + map.height * 0.6);
        const guess = (await session(tab)).round.mapGuess;
        // Obnovení stránky s #obnovit vrátí rozehranou otázku (jinak aplikace začíná úvodní stránkou)
        await tab.evaluate(() => { location.hash = 'obnovit'; });
        await tab.reload();
        await waitForMap(tab);
        assert.deepEqual((await session(tab)).round.mapGuess, guess);
        assert.equal(await tab.locator('[data-map-question] [data-mark="guess"]').count(), 1);
        assert.ok(!(await tab.isDisabled('[data-action="map-confirm"]')));
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('vzhled: otázka bez posouvání, velká mapa a tlačítko Potvrdit aspoň 40 px na 390×780 i 360×640, světle i tmavě', async () => {
        for (const [width, height] of [[390, 780], [360, 640]]) {
            for (const colorScheme of ['light', 'dark']) {
                const { context, tab, problems } = await open({ width, height, colorScheme });
                await startZemepis(tab);
                await waitForMap(tab);
                // Úvodní animace obrazovky (posun o 10 px) musí doběhnout
                await tab.waitForTimeout(700);
                const where = `${width}×${height} ${colorScheme}`;
                const extra = await overflow(tab);
                assert.ok(extra <= 1, `otázka se vejde bez posouvání ${where} (${extra} px navíc)`);
                const map = await tab.locator('[data-map-question]').boundingBox();
                assert.ok(map.width >= width - 40 && map.height >= (height < 700 ? 300 : 420), `mapa ${Math.round(map.width)}×${Math.round(map.height)} ${where}`);
                const confirm = await tab.locator('[data-action="map-confirm"]').boundingBox();
                assert.ok(confirm.height >= 40 && confirm.width >= 200, `tlačítko Potvrdit ${where}`);
                for (const zoom of await tab.locator('[data-map-zoom]').all()) assert.ok((await zoom.boundingBox()).height >= 40, `tlačítka přiblížení ${where}`);
                // Mapa bez popisků: v SVG žádný text
                assert.equal(await tab.locator('[data-map-question] svg text').count(), 0);
                if (process.env.MAP_SCREENSHOTS) await tab.screenshot({ path: path.join(process.env.MAP_SCREENSHOTS, `mapa-${width}x${height}-${colorScheme}.png`) });
                const target = await screenPoint(tab, (await session(tab)).data.question.map.lat + 0.3, (await session(tab)).data.question.map.lon + 0.3);
                await tab.mouse.click(target.x, target.y);
                await tab.click('[data-action="map-confirm"]');
                await waitForMap(tab, '#map-guess');
                if (process.env.MAP_SCREENSHOTS) await tab.screenshot({ path: path.join(process.env.MAP_SCREENSHOTS, `mapa-vysledek-${width}x${height}-${colorScheme}.png`) });
                assert.deepEqual(problems, []);
                await context.close();
            }
        }
    });
});
