// Upravená sova jako obrázek profilu: dlaždice „Moje sova“, uložení do (falešné) databáze, zobrazení u druhého hráče,
// automatické přeuložení po změně doplňku, vejde se bez posouvání a bez chyb CSP.
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
// 11 000 xp = úroveň 18: zelený talár (6), brýle (4), šála (14) jsou odemčené
const PROGRESS = JSON.stringify({ xp: 11000, counters: {}, badges: {} });

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

test('sova jako obrázek profilu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // Falešný Supabase v paměti (jen to, co tenhle test potřebuje): profily a výzva od hráčky 1 pro hráče 2
    const db = {
        profiles: {
            'u-1': { id: 'u-1', display_name: 'Jana', avatar: '🦊', color: 'emerald', owl: null },
            'u-2': { id: 'u-2', display_name: 'Petr', avatar: '🐸', color: 'sky', owl: null }
        },
        challenges: { ABC234: { id: 'ABC234', topic: 'zemepis', seed: 's', count: 5, creator_id: 'u-1', invited_id: 'u-2', created_at: '2026-11-03T10:00:00Z' } },
        writes: []
    };
    const users = { 'tok-u1': { id: 'u-1', name: 'Jana' }, 'tok-u2': { id: 'u-2', name: 'Petr' } };
    const backend = async (context) => {
        await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
        await context.route('https://proj.supabase.co/**', route => {
            const request = route.request();
            const url = new URL(request.url());
            const me = users[(request.headers().authorization || '').replace('Bearer ', '')];
            const json = (body, status = 200) => route.fulfill({ status, json: body });
            if (url.pathname.startsWith('/auth/')) return json({});
            if (!me) return json({ message: 'no token' }, 401);
            const eq = (key) => (url.searchParams.get(key) || '').replace(/^eq\./, '');
            const body = request.postData() ? JSON.parse(request.postData()) : null;
            if (url.pathname === '/rest/v1/profiles') {
                // Databáze, ve které ještě nebylo znovu spuštěno schema.sql: sloupec owl neexistuje
                if (db.noOwlColumn && ((body && 'owl' in body) || /\bowl\b/.test(url.searchParams.get('select') || ''))) return json({ message: 'column profiles.owl does not exist' }, 400);
                if (request.method() === 'PATCH') {
                    if (eq('id') !== me.id) return json([]);
                    // Starší schéma: vlastní odstín barvy porušuje omezení color
                    if (db.oldColorCheck && body && /^h\d+$/.test(body.color || '')) return json({ message: 'violates check constraint profiles_color_list' }, 400);
                    db.writes.push(body);
                    Object.assign(db.profiles[me.id], body);
                    return json([db.profiles[me.id]]);
                }
                return json([db.profiles[eq('id')]].filter(Boolean));
            }
            if (url.pathname === '/rest/v1/challenges' && url.searchParams.has('invited_id')) {
                return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(c => ({ ...c, creator: db.profiles[c.creator_id], invited: db.profiles[c.invited_id] })));
            }
            return json([]);
        });
    };
    const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: users[token].id, email: 'x@example.com', name: users[token].name } }) });
    const open = async (token, { viewport = { width: 390, height: 780 }, scheme = 'light', extra = {} } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme: scheme });
        await context.addInitScript(entries => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { 'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': 'choices', 'mudrlant.progress': PROGRESS, 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), ...login(token), ...extra });
        await backend(context);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#btn-settings span');
        return { context, tab, problems };
    };
    const fits = (tab) => tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; });
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, name) }); };
    const waitFor = async (check, message) => {
        for (let i = 0; i < 60; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
        assert.fail(message);
    };

    await t.test('výběr dlaždice „Moje sova“, uložení, zobrazení u druhého hráče a přeuložení po změně doplňku', async () => {
        const one = await open('tok-u1');
        await one.tab.click('#btn-settings');
        // Barva obleku a brýle z Nastavení → Vzhled / Sova
        await one.tab.click('[data-me-tab="look"]');
        await one.tab.click('[data-robe-pick="zelena"]');
        await one.tab.click('[data-me-tab="owl"]');
        await one.tab.click('[data-owl-pick="face:bryle"]');
        await one.tab.waitForSelector('[data-owl-pick="face:bryle"][aria-pressed="true"]');
        // Profil: první dlaždice je „Moje sova“ s mým náhledem
        await one.tab.click('[data-me-tab="profile"]');
        await one.tab.waitForSelector('[data-pick-owl]');
        assert.equal(await one.tab.evaluate(() => document.querySelector('[data-avatar-strip]').firstElementChild === document.querySelector('[data-pick-owl]')), true, 'dlaždice je první');
        assert.equal(await one.tab.getAttribute('[data-pick-owl]', 'aria-label'), 'Sova Mudrlant');
        assert.equal(await one.tab.getAttribute('[data-pick-owl]', 'aria-pressed'), 'false');
        assert.equal(await one.tab.getAttribute('[data-pick-owl] img[data-keep]', 'src'), 'icons/logo-zelena.webp');
        assert.ok(await one.tab.locator('[data-pick-owl] img[src="icons/doplnky/bryle.webp"]').count(), 'náhled má brýle');
        await shot(one.tab, 'owl-avatar-profil-pred.png');
        await one.tab.click('[data-pick-owl]');
        await one.tab.waitForSelector('[data-pick-owl][aria-pressed="true"]');
        assert.equal(await one.tab.locator('[data-pick-avatar][aria-pressed="true"]').count(), 0, 'emoji není vybrané');
        // Hlavička okna už ukazuje sovu v kruhu s barvou hráče
        assert.equal(await one.tab.locator('#settings-overlay span.rounded-full img[data-keep][src="icons/logo-zelena.webp"]').count(), 1);
        assert.equal(await fits(one.tab), true, 'okno Profil bez posouvání');
        await shot(one.tab, 'owl-avatar-profil-vybrano.png');
        assert.equal(db.profiles['u-1'].owl, null, 'nic se neuložilo před Uložit');
        await one.tab.click('[data-save-profile]');
        await one.tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].owl, 'robe=zelena;face=bryle.original');
        assert.equal(db.profiles['u-1'].avatar, '🦉', 'záloha pro starší aplikaci');
        await one.tab.click('#settings-overlay [data-close]');
        await one.tab.waitForSelector('#btn-settings img[data-keep][src="icons/logo-zelena.webp"]');
        assert.equal(await one.tab.locator('#btn-settings').evaluate(button => button.textContent.trim()), '', 'v tlačítku není emoji');

        // Druhý hráč (jiný oblek, jiná barva) vidí sovu hráčky 1 tak, jak ji nastavila; příchozí výzva ji ukáže u tvůrce
        const two = await open('tok-u2', { extra: { 'mudrlant.look': JSON.stringify({ robe: 'modra' }) } });
        await two.tab.click('[data-action="home-tab"][data-tab="multi"]');
        await two.tab.waitForSelector('#challenges-section [data-player-id="u-1"]');
        const seen = await two.tab.$$eval('#challenges-section [data-player-id="u-1"] img', nodes => nodes.map(node => [node.getAttribute('src'), node.hasAttribute('data-keep')]));
        assert.deepEqual(seen, [['icons/logo-zelena.webp', true], ['icons/doplnky/bryle.webp', true]]);
        await two.tab.waitForTimeout(300);
        assert.equal(await two.tab.getAttribute('#challenges-section [data-player-id="u-1"] img', 'src'), 'icons/logo-zelena.webp', 'pozorovatel look-robes.js cizí sovu nepřebarví na můj modrý oblek');
        assert.equal(await two.tab.locator('#btn-settings img[data-keep]').count(), 0, 'druhý hráč má v tlačítku své emoji');
        await shot(two.tab, 'owl-avatar-cizi-hrac.png');
        assert.deepEqual(two.problems, []);
        await two.context.close();

        // Změna doplňku v Nastavení → Sova přeuloží profil sama (bez Uložit) a hned se projeví v tlačítku
        const writes = db.writes.length;
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="owl"]');
        await one.tab.click('[data-owl-pick="neck:sala"]');
        await one.tab.waitForSelector('[data-owl-pick="neck:sala"][aria-pressed="true"]');
        await one.tab.click('[data-owl-color="neck:cervena"]');
        await one.tab.waitForSelector('[data-owl-color="neck:cervena"][aria-pressed="true"]');
        await one.tab.click('[data-owl-pick="head:none"]');
        await one.tab.click('#settings-overlay [data-close]');
        await one.tab.waitForSelector('#btn-settings img[src="icons/doplnky/sala-cervena.webp"]');
        await waitFor(() => db.profiles['u-1'].owl === 'robe=zelena;neck=sala.cervena;face=bryle.original', `profil se nepřeuložil: ${db.profiles['u-1'].owl}`);
        assert.equal(db.writes.length - writes, 1, 'uložení po prodlevě sloučilo víc klepnutí do jednoho');
        assert.deepEqual(Object.keys(db.writes[db.writes.length - 1]), ['owl'], 'přeuložení posílá jen sovu');
        assert.deepEqual(one.problems, []);
        await one.context.close();
    });

    await t.test('databáze bez sloupce owl: sova se přesto ukáže v zařízení a po načtení zůstane', async () => {
        db.noOwlColumn = true;
        db.profiles['u-1'].owl = undefined;
        const { context, tab, problems } = await open('tok-u1', { extra: { 'mudrlant.look': JSON.stringify({ robe: 'zelena' }) } });
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('[data-pick-owl]');
        await tab.click('[data-pick-owl]');
        await tab.waitForSelector('[data-pick-owl][aria-pressed="true"]');
        await tab.click('[data-save-profile]');
        await tab.waitForFunction(() => /Uloženo/.test(document.querySelector('#settings-overlay').textContent));
        await tab.click('[data-close]');
        await tab.waitForSelector('#btn-settings img[src="icons/logo-zelena.webp"]');
        await tab.reload();
        await tab.waitForSelector('#btn-settings img[src="icons/logo-zelena.webp"]');
        assert.deepEqual(problems, []);
        await context.close();
        db.noOwlColumn = false;
    });

    await t.test('posuvník všech barev: vlastní odstín se uloží, ukáže hned i po načtení; starší schéma dostane nejbližší pojmenovanou', async () => {
        for (const old of [false, true]) {
            db.oldColorCheck = old;
            db.profiles['u-1'].color = 'emerald';
            const { context, tab, problems } = await open('tok-u1');
            await tab.click('#btn-settings');
            await tab.click('[data-me-tab="profile"]');
            await tab.waitForSelector('[data-pick-hue]');
            await tab.locator('[data-pick-hue]').evaluate((el) => { el.value = '210'; el.dispatchEvent(new Event('change', { bubbles: true })); });
            await tab.waitForSelector('[data-pick-hue]');
            assert.equal(await tab.inputValue('[data-pick-hue]'), '210');
            assert.ok(await tab.locator('#settings-overlay span.rounded-full[class*="hsl(210deg"]').count() > 0, 'náhled má vlastní barvu');
            await tab.click('[data-save-profile]');
            await tab.waitForFunction(() => /Uloženo/.test(document.querySelector('#settings-overlay').textContent));
            assert.equal(db.profiles['u-1'].color, old ? 'sky' : 'h210');
            await tab.click('[data-close]');
            await tab.reload();
            await tab.waitForSelector('#btn-settings');
            assert.ok(await tab.locator('#btn-settings span[class*="hsl(210deg"], #btn-settings [class*="hsl(210deg"]').count() > 0, 'po načtení zůstane vlastní barva');
            assert.deepEqual(problems, []);
            await context.close();
        }
        db.oldColorCheck = false;
        db.profiles['u-1'].color = 'emerald';
    });

    await t.test('sova titulu jako profilovka: dosažená jde vybrat, vyšší je zamčená; uloží se s pózou, druhý hráč ji vidí', async () => {
        db.profiles['u-1'].owl = null;
        db.profiles['u-1'].avatar = '🦊';
        // Úroveň 18 (PROGRESS): sovy titulů 1–4 (Zvědavec … Znalec) jsou dosažené, 5–11 zamčené; zelený talár a brýle
        const one = await open('tok-u1', { extra: { 'mudrlant.look': JSON.stringify({ robe: 'zelena', acc: { face: { id: 'bryle', color: 'original' } } }) } });
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="profile"]');
        await one.tab.waitForSelector('[data-pick-owl="titul-1"]');
        // Pořadí v pásu obrázků: Moje sova, sovy titulů (dosažené, pak zamčené), emoji
        const tiles = await one.tab.$$eval('[data-avatar-strip] > button', nodes => nodes.slice(0, 13).map(node => node.dataset.pickOwl !== undefined ? `vyber:${node.dataset.pickOwl}` : node.dataset.lockedOwl ? `zamčeno:${node.dataset.lockedOwl}` : 'emoji'));
        assert.deepEqual(tiles, ['vyber:', 'vyber:titul-1', 'vyber:titul-2', 'vyber:titul-3', 'vyber:titul-4', 'zamčeno:titul-5', 'zamčeno:titul-6', 'zamčeno:titul-7', 'zamčeno:titul-8', 'zamčeno:titul-9', 'zamčeno:titul-10', 'zamčeno:titul-11', 'emoji']);
        // Náhled je sova titulu v mém zeleném taláru, bez doplňků, oříznutá do kolečka
        assert.equal(await one.tab.getAttribute('[data-pick-owl="titul-4"] img', 'src'), 'icons/topics/sova-titul-4-zelena.webp');
        assert.equal(await one.tab.locator('[data-pick-owl="titul-4"] span.rounded-full.overflow-hidden img[data-keep]').count(), 1);
        assert.equal(await one.tab.locator('[data-pick-owl="titul-4"] img[src*="doplnky"]').count(), 0);
        assert.equal(await one.tab.getAttribute('[data-pick-owl="titul-2"]', 'aria-label'), 'Sova titulu Učeň (Učeň, Žák)');
        // Zamčená: zašedlá, s úrovní, od které se odemkne, nejde vybrat (klepnutí jen poradí)
        const locked = '[data-locked-owl="titul-5"]';
        assert.equal(await one.tab.getAttribute(locked, 'aria-disabled'), 'true');
        assert.equal(await one.tab.getAttribute(locked, 'title'), 'Sova titulu Učenec (Učenec, Vzdělanec, Erudit): od úrovně 27');
        assert.match(await one.tab.textContent(locked), /úr\.\s27/);
        // Mudrlant (nejvyšší titul, úroveň 100) má vlastní sovu: jediný titul stupně, proto bez výčtu v závorce
        assert.equal(await one.tab.getAttribute('[data-locked-owl="titul-11"]', 'title'), 'Sova titulu Mudrlant: od úrovně 100');
        assert.match(await one.tab.textContent('[data-locked-owl="titul-11"]'), /úr\.\s100/);
        assert.equal(await one.tab.getAttribute('[data-locked-owl="titul-11"] img', 'src'), 'icons/topics/sova-titul-11-zelena.webp');
        assert.equal(await one.tab.locator(`${locked} .grayscale img`).count(), 1);
        assert.equal(await one.tab.locator(`${locked}[data-pick-owl]`).count(), 0);
        await one.tab.click(locked, { force: true });
        await one.tab.waitForFunction(() => /Sova titulu Učenec se odemkne od úrovně 27\./.test(document.getElementById('settings-overlay').textContent));
        assert.equal(await one.tab.locator('[data-pick-owl][aria-pressed="true"]').count(), 0, 'zamčená sova se nevybrala');
        assert.equal(await one.tab.getAttribute('[data-pick-avatar="🦊"]', 'aria-pressed'), 'true');
        // Dosažená: vybere se, hlavička okna ji hned ukáže (bez uložení se nic nepošle)
        await one.tab.click('[data-pick-owl="titul-4"]');
        await one.tab.waitForSelector('[data-pick-owl="titul-4"][aria-pressed="true"]');
        assert.equal(await one.tab.getAttribute('[data-pick-owl=""]', 'aria-pressed'), 'false', 'Moje sova (s doplňky) není vybraná');
        assert.equal(await one.tab.evaluate(() => { const header = document.getElementById('settings-title').closest('.flex'); const img = header.querySelector('img[data-owl-pose]'); return img && img.getAttribute('src'); }), 'icons/topics/sova-titul-4-zelena.webp');
        assert.equal(await fits(one.tab), true, 'okno Profil bez posouvání');
        await one.tab.waitForFunction(() => [...document.querySelectorAll('[data-avatar-strip] img')].every(img => img.complete && img.naturalWidth > 0));
        await shot(one.tab, 'sova-titulu-profilovka.png');
        assert.equal(db.profiles['u-1'].owl, null);
        await one.tab.click('[data-save-profile]');
        await one.tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].owl, 'robe=zelena;pose=titul-4;face=bryle.original', 'póza v textu sovy, doplňky zůstávají pro starší aplikaci');
        assert.equal(db.profiles['u-1'].avatar, '🦉');
        assert.equal(await one.tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.look')).pose), 'titul-4');
        await one.tab.click('#settings-overlay [data-close]');
        await one.tab.waitForSelector('#btn-settings img[data-owl-pose="titul-4"][src="icons/topics/sova-titul-4-zelena.webp"]');
        assert.equal(await one.tab.locator('#btn-settings img[src*="doplnky"]').count(), 0, 'v tlačítku je sova titulu bez doplňků');

        // Změna barvy obleku přeuloží profil a sova titulu změní barvu (pro mě hned, pro ostatní z databáze)
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="look"]');
        await one.tab.click('[data-robe-pick="modra"]');
        await one.tab.click('#settings-overlay [data-close]');
        await one.tab.waitForSelector('#btn-settings img[data-owl-pose="titul-4"][src="icons/topics/sova-titul-4-modra.webp"]');
        await waitFor(() => db.profiles['u-1'].owl === 'robe=modra;pose=titul-4;face=bryle.original', `profil se nepřeuložil: ${db.profiles['u-1'].owl}`);

        // Druhý hráč (zelený oblek) vidí sovu titulu hráčky 1 v jejím modrém taláru: u výzvy i v jejím profilu
        const two = await open('tok-u2', { extra: { 'mudrlant.look': JSON.stringify({ robe: 'zelena' }) } });
        await two.tab.click('[data-action="home-tab"][data-tab="multi"]');
        await two.tab.waitForSelector('#challenges-section [data-player-id="u-1"] img[data-owl-pose="titul-4"]');
        await two.tab.waitForTimeout(300);
        const seen = await two.tab.$$eval('#challenges-section [data-player-id="u-1"] img', nodes => nodes.map(node => [node.getAttribute('src'), node.hasAttribute('data-keep')]));
        assert.deepEqual(seen, [['icons/topics/sova-titul-4-modra.webp', true]], 'jen sova titulu, nepřebarvená mým oblekem');
        await shot(two.tab, 'sova-titulu-cizi-hrac.png');
        await two.tab.click('#challenges-section [data-player-id="u-1"]');
        await two.tab.waitForSelector('#dialog-overlay img[data-owl-pose="titul-4"][src="icons/topics/sova-titul-4-modra.webp"]');
        assert.deepEqual(two.problems, []);
        await two.context.close();

        // Ztráta úrovně (vývojářský reset na úroveň 10): ukáže se nejvyšší dosažená sova titulu (Učeň), ne zamčená Znalec
        await one.tab.goto(`${origin}/?vyvojar`);
        await one.tab.waitForSelector('#btn-settings img[data-owl-pose="titul-4"]');
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="game"]');
        await one.tab.click('[data-dev="level:10"]');
        await one.tab.waitForSelector('[data-dev="restore"]');
        await one.tab.keyboard.press('Escape');
        // Na úrovni 10 je zamčený i modrý talár (úroveň 12): sova titulu je ve výchozím vínovém
        await one.tab.waitForSelector('#btn-settings img[data-owl-pose="titul-2"][src="icons/topics/sova-titul-2.webp"]');
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="profile"]');
        await one.tab.waitForSelector('[data-pick-owl="titul-2"][aria-pressed="true"]');
        assert.equal(await one.tab.locator('[data-locked-owl="titul-4"]').count(), 1, 'Znalec je teď zamčený');
        // Po návratu úrovně je zpátky zvolená sova (volba se neztratí)
        await one.tab.click('[data-me-tab="game"]');
        await one.tab.click('[data-dev="restore"]');
        await one.tab.waitForFunction(() => !document.querySelector('[data-dev="restore"]'));
        await one.tab.keyboard.press('Escape');
        await one.tab.waitForSelector('#btn-settings img[data-owl-pose="titul-4"]');
        // (talár zůstane do načtení stránky výchozí, jako u každé volby zamčené během nižší úrovně)
        await one.tab.reload();
        await one.tab.waitForSelector('#btn-settings img[data-owl-pose="titul-4"][src="icons/topics/sova-titul-4-modra.webp"]');
        assert.equal(db.profiles['u-1'].owl, 'robe=modra;pose=titul-4;face=bryle.original', 'vývojářský reset se do účtu neuložil');
        assert.deepEqual(one.problems, []);
        await one.context.close();
        db.profiles['u-1'].owl = null;
        db.profiles['u-1'].avatar = '🦊';
    });

    await t.test('sova Mudrlanta (titul-11): na úrovni 100 odemčená, uloží se s pózou a druhý hráč ji vidí celou v kolečku', async () => {
        db.profiles['u-1'].owl = null;
        db.profiles['u-1'].avatar = '🦊';
        const progress = JSON.stringify({ xp: require('../quiz-core.js').xpForLevel(100), counters: {}, badges: {} });
        const one = await open('tok-u1', { extra: { 'mudrlant.progress': progress, 'mudrlant.look': JSON.stringify({ robe: 'zlata' }) } });
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="profile"]');
        await one.tab.waitForSelector('[data-pick-owl="titul-11"]');
        assert.equal(await one.tab.locator('[data-locked-owl]').count(), 0, 'na úrovni 100 nic zamčeného');
        assert.equal(await one.tab.getAttribute('[data-pick-owl="titul-11"]', 'aria-label'), 'Sova titulu Mudrlant');
        assert.equal(await one.tab.getAttribute('[data-pick-owl="titul-11"] img', 'src'), 'icons/topics/sova-titul-11-zlata.webp');
        await one.tab.click('[data-pick-owl="titul-11"]');
        await one.tab.waitForSelector('[data-pick-owl="titul-11"][aria-pressed="true"]');
        // Sova se vejde do kolečka celá (menší než kolečko, uprostřed, mírně níž), třídy Tailwindu, ne inline styl
        const crop = await one.tab.evaluate(() => {
            const img = document.querySelector('[data-pick-owl="titul-11"] img'); const box = img.parentElement.getBoundingClientRect(); const pic = img.getBoundingClientRect();
            return { ratio: pic.width / box.width, centre: (pic.left + pic.width / 2 - box.left) / box.width, style: img.getAttribute('style') };
        });
        assert.ok(crop.ratio > 0.75 && crop.ratio < 0.9 && Math.abs(crop.centre - 0.5) < 0.03 && crop.style === null, JSON.stringify(crop));
        await one.tab.click('[data-save-profile]');
        await one.tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].owl, 'robe=zlata;pose=titul-11');
        await one.tab.click('#settings-overlay [data-close]');
        await one.tab.waitForSelector('#btn-settings img[data-owl-pose="titul-11"][src="icons/topics/sova-titul-11-zlata.webp"]');
        const two = await open('tok-u2', { extra: { 'mudrlant.look': JSON.stringify({ robe: 'zelena' }) } });
        await two.tab.click('[data-action="home-tab"][data-tab="multi"]');
        await two.tab.waitForSelector('#challenges-section [data-player-id="u-1"] img[data-owl-pose="titul-11"][src="icons/topics/sova-titul-11-zlata.webp"]');
        assert.deepEqual(two.problems, []);
        await two.context.close();
        assert.deepEqual(one.problems, []);
        await one.context.close();
        db.profiles['u-1'].owl = null;
        db.profiles['u-1'].avatar = '🦊';
    });

    await t.test('emoji zruší sovu; tmavý režim; profil se vejde na malém telefonu', async () => {
        for (const viewport of [{ width: 390, height: 780 }, { width: 360, height: 640 }]) {
            db.profiles['u-1'].owl = 'robe=zelena;face=bryle.original';
            const one = await open('tok-u1', { viewport, scheme: 'dark', extra: { 'mudrlant.look': JSON.stringify({ robe: 'zelena', acc: { face: { id: 'bryle', color: 'original' } } }) } });
            await one.tab.click('#btn-settings');
            await one.tab.click('[data-me-tab="profile"]');
            await one.tab.waitForSelector('[data-pick-owl][aria-pressed="true"]', { timeout: 5000 });
            await shot(one.tab, `owl-avatar-profil-tmavy-${viewport.width}.png`);
            const overflow = () => one.tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight - box.clientHeight; });
            const withOwl = await overflow();
            await one.tab.click('[data-pick-avatar="🐼"]');
            await one.tab.waitForSelector('[data-pick-owl][aria-pressed="false"]');
            // Sova okno nezvětší oproti emoji; na běžném telefonu se okno vejde úplně (na 360×640 se posouvalo už předtím)
            assert.equal(withOwl, await overflow(), `sova nezvětší okno ${viewport.width}×${viewport.height}`);
            if (viewport.height >= 780) assert.ok(withOwl <= 0, 'Profil bez posouvání');
            assert.equal(await one.tab.evaluate(() => document.getElementById('settings-title').closest('.flex').querySelectorAll('img[data-keep]').length), 0, 'v hlavičce okna je zase emoji');
            await one.tab.click('[data-save-profile]');
            await one.tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
            assert.equal(db.profiles['u-1'].owl, null);
            assert.equal(db.profiles['u-1'].avatar, '🐼');
            assert.deepEqual(one.problems, []);
            await one.context.close();
        }
    });

    await t.test('záložka Mudrlant: tlačítko „Použít jako profilový obrázek“ uloží mou sovu; pak řekne, že už jí je', async () => {
        db.profiles['u-1'].owl = null;
        db.profiles['u-1'].avatar = '🦊';
        const one = await open('tok-u1', { extra: { 'mudrlant.look': JSON.stringify({ robe: 'zelena', acc: { face: { id: 'bryle', color: 'original' } } }) } });
        await one.tab.click('#btn-settings');
        await one.tab.click('[data-me-tab="owl"]');
        await one.tab.waitForSelector('[data-owl-as-avatar]');
        assert.equal(await one.tab.locator('[data-owl-avatar-on]').count(), 0);
        await one.tab.click('[data-owl-as-avatar]');
        await one.tab.waitForSelector('[data-owl-avatar-on]');
        await waitFor(() => db.profiles['u-1'].owl === 'robe=zelena;face=bryle.original', `neuložilo se: ${db.profiles['u-1'].owl}`);
        assert.equal(db.profiles['u-1'].avatar, '🦉');
        assert.equal(await one.tab.locator('[data-owl-as-avatar]').count(), 0, 'tlačítko zmizí');
        // Hlavička okna ukazuje sovu místo emoji
        assert.equal(await one.tab.locator('#settings-overlay span.rounded-full img[data-keep][src="icons/logo-zelena.webp"]').count(), 1);
        await shot(one.tab, 'owl-avatar-zalozka-mudrlant.png');
        assert.deepEqual(one.problems, []);
        await one.context.close();
    });
});
