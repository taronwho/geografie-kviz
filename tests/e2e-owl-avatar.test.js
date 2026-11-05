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
        assert.equal(await one.tab.evaluate(() => document.querySelector('[data-pick-avatar]').previousElementSibling === document.querySelector('[data-pick-owl]')), true, 'dlaždice je první');
        assert.equal(await one.tab.getAttribute('[data-pick-owl]', 'aria-label'), 'Moje sova');
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
            assert.equal(await one.tab.locator('#settings-overlay span.rounded-full img[data-keep]').count(), 0, 'v hlavičce okna je zase emoji');
            await one.tab.click('[data-save-profile]');
            await one.tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
            assert.equal(db.profiles['u-1'].owl, null);
            assert.equal(db.profiles['u-1'].avatar, '🐼');
            assert.deepEqual(one.problems, []);
            await one.context.close();
        }
    });
});
