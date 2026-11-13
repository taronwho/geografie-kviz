// Dobývání v prohlížeči s falešným Supabase v paměti (jako tests/e2e-groups.test.js): karta na záložce Více hráčů, rozcestník (Moje hry,
// Lobby s Rychlými hrami, Založit hru), okno Barva a znak (obsazená barva nejde), založení soukromé hry, detail lobby (kód, Chci hrát,
// začátek hry), obrazovka hry (mapa se vejde na 360×640 bez posouvání, klepnutí na území, spodní list, otázka, dobytí, opevnění,
// odražený útok, přiblížení, kronika tažení), konec hry (stupně vítězů, odměna jen jednou, přehrání), CSP bez chyb, tmavý režim.
// SCREENSHOT_DIR=/cesta uloží snímky (dobyvani-*.png). Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const MAPS = Object.fromEntries(['evropa', 'cesko'].map(id => [id, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `dobyvani-${id}.json`), 'utf8'))]));

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', frame: null, title_pref: null, owl: null, ...extra });
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Falešný server Dobývání: hry, hráči, území, tahy; výsledek tahu určuje fronta force (jinak podle odpovědi)
const newDb = () => ({
    calls: [], force: [], seq: 10,
    profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald' }), 'u-2': player('u-2', 'Petr Svoboda', '🐼'), 'u-3': player('u-3', 'Eva Mistr', '🦉') },
    games: [
        { id: uuid(1), map: 'evropa', max_players: 6, hours: 72, period: 'day', actions: 5, visibility: 'public', code: 'EVR234', preset: 'evropa-3d', status: 'lobby', created_at: '2026-11-11T08:00:00Z', players: [{ user: 'u-3', seat: 0, flag_color: 'zelena', emblem: 'drak', ready: true }] },
        { id: uuid(2), map: 'cesko', max_players: 4, hours: 12, period: 'hour', actions: 3, visibility: 'public', code: 'CES234', preset: 'cesko-12h', status: 'lobby', created_at: '2026-11-11T08:00:00Z', players: [] }
    ]
});
const HOMES = { evropa: ['Q213', 'Q20', 'Q29', 'Q41'], cesko: ['Q192697', 'Q191091', 'Q193307', 'Q46070'] };
const NOW = '2026-11-11T10:00:00Z';

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (!me) return json({ message: 'no token' }, 401);
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const name = rpc ? rpc[1] : '';
        if (url.pathname === '/rest/v1/profiles') return json(db.profiles[(url.searchParams.get('id') || '').replace('eq.', '')] ? [db.profiles['u-1']] : []);
        if (!name.startsWith('conquest_') && !name.startsWith('dev_conquest_')) return json(/^(friends_list|reactions|my_groups)$/.test(name) ? [] : {});
        db.calls.push({ name, body });
        const fail = (message, status = 400) => json({ code: 'P0001', message }, status);
        const find = (id) => db.games.find(g => g.id === id);
        const mapOf = (g) => MAPS[g.map];
        const players = (g) => g.players.map(p => ({ ...db.profiles[p.user], seat: p.seat, flag_color: p.flag_color, emblem: p.emblem, ready: p.ready, score: p.score || 0, score_at: p.score_at || null, place: p.place || null, me: p.user === me.id }));
        const summary = (g) => ({ id: g.id, map: g.map, max_players: g.max_players, hours: g.hours, period: g.period, actions: g.actions, visibility: g.visibility, preset: g.preset, status: g.status,
            created_at: g.created_at, started_at: g.started_at || null, ends_at: g.ends_at || null, mine: g.players.some(p => p.user === me.id), creator: g.creator === me.id, code: g.code, players: players(g) });
        const mine = (g) => g.players.find(p => p.user === me.id);
        const budget = (g) => { const used = (g.moves || []).filter(m => m.u === me.id && ['attack', 'fortify'].includes(m.k) && (m.n || 0) === (g.periodNo || 0)).length; return { period: g.periodNo || 0, base: g.actions, regions: 0, treasures: 0, loot: 0, used, total: g.actions, left: Math.max(0, g.actions - used), period_ends_at: '2026-11-12T10:00:00Z' }; };
        const rescore = (g) => g.players.forEach(p => { const score = g.territories.filter(t => t.o === p.user).length; if (score !== p.score) { p.score = score; p.score_at = NOW; } });
        const start = (g) => {
            g.status = 'running'; g.started_at = NOW; g.ends_at = '2026-11-14T10:00:00Z';
            g.territories = mapOf(g).t.map(t => ({ t: t.id, o: null, l: 0, h: false, p: false }));
            g.moves = [];
            g.players.forEach((p, i) => { const home = g.territories.find(t => t.t === HOMES[g.map][i]); home.o = p.user; home.h = true; g.moves.push({ id: db.seq++, u: p.user, k: 'home', t: home.t, r: 'home', n: 0, at: NOW }); });
            const treasure = g.territories.find(t => !t.o && t.t === (g.map === 'cesko' ? 'Q193317' : 'Q40'));
            if (treasure) treasure.p = true;
            rescore(g);
        };
        const state = (g) => ({ ...summary(g), now: NOW, ...(g.status === 'lobby' ? {} : { territories: g.territories, budget: g.status === 'running' ? budget(g) : null, moves: g.moves.slice(-150), claimed: Boolean(mine(g) && mine(g).claimed),
            history: g.status === 'finished' ? g.moves.filter(m => ['home', 'respawn', 'capture'].includes(m.r)) : null }) });
        // Vývojářští boti (blok 22): do lobby (chtějí hrát, plná hra začne), jejich tahy hned (každý bot dobude jedno volné území), další období
        if (name === 'dev_conquest_add_bots') {
            const g = find(body.game);
            const colours = ['zelena', 'zluta', 'fialova', 'oranzova', 'tyrkysova', 'hneda', 'cerna'].filter(c => !g.players.some(p => p.flag_color === c));
            const count = Math.min(body.how_many, g.max_players - g.players.length);
            for (let i = 0; i < count; i++) {
                const bot = `bot-${db.seq++}`;
                db.profiles[bot] = player(bot, `Bot ${['Adam', 'Dana', 'Emil'][(g.players.length - 1) % 3]}`, '🤖');
                g.players.push({ user: bot, seat: g.players.length, flag_color: colours[i], emblem: 'drak', ready: true });
            }
            if (g.players.length >= g.max_players) start(g);
            return json(summary(g));
        }
        if (name === 'dev_conquest_bots_play') {
            const g = find(body.game);
            let made = 0;
            g.players.filter(p => p.user.startsWith('bot-')).forEach(p => {
                const free = g.territories.find(t => !t.o && !t.p);
                if (!free) return;
                free.o = p.user;
                g.moves.push({ id: db.seq++, u: p.user, k: 'attack', t: free.t, s: null, ok: true, r: 'capture', v: null, n: g.periodNo || 0, at: NOW, p: false, h: false, l: 0 });
                made += 1;
            });
            rescore(g);
            return json(made);
        }
        if (name === 'dev_conquest_next_period') {
            const g = find(body.game);
            g.periodNo = (g.periodNo || 0) + 1;
            return json(state(g));
        }
        if (name === 'conquest_lobby') {
            return json({ open: db.games.filter(g => g.status === 'lobby' && g.visibility === 'public').map(summary),
                mine: db.games.filter(g => mine(g)).map(g => ({ ...summary(g), budget: g.status === 'running' ? budget(g) : null, claimed: Boolean(mine(g).claimed),
                    owners: g.territories ? Object.fromEntries(g.territories.filter(t => t.o).map(t => [t.t, g.players.find(p => p.user === t.o).seat])) : null })) });
        }
        if (name === 'conquest_create') {
            const g = { id: uuid(db.seq++), creator: me.id, map: body.map_id, max_players: body.players, hours: body.hours, period: body.per, actions: body.actions_per, visibility: body.vis, code: 'NEW234', preset: null, status: 'lobby', created_at: NOW,
                players: [{ user: me.id, seat: 0, flag_color: body.colour, emblem: body.emblem_id, ready: false }] };
            db.games.push(g);
            // Druhý hráč se hned přidá a chce hrát
            if (db.autoJoin) g.players.push({ user: 'u-2', seat: 1, flag_color: 'cervena', emblem: 'orel', ready: true });
            return json(summary(g));
        }
        if (name === 'conquest_join') {
            const g = body.join_code ? db.games.find(x => x.code === body.join_code) : find(body.game);
            if (!g) return fail('Hra s tímhle kódem není. Zkontroluj ho.');
            if (g.players.some(p => p.flag_color === body.colour)) return fail('Tuhle barvu už má jiný hráč. Vyber jinou.');
            g.players.push({ user: me.id, seat: g.players.length, flag_color: body.colour, emblem: body.emblem_id, ready: false });
            if (g.players.length >= g.max_players) start(g);
            return json(summary(g));
        }
        if (name === 'conquest_ready') {
            const g = find(body.game);
            mine(g).ready = body.is_ready;
            if (g.players.length >= 2 && g.players.every(p => p.ready)) start(g);
            return json(summary(g));
        }
        if (name === 'conquest_set_look') { const g = find(body.game); Object.assign(mine(g), { flag_color: body.colour, emblem: body.emblem_id }); return json(summary(g)); }
        if (name === 'conquest_leave') { const g = find(body.game); g.players = g.players.filter(p => p.user !== me.id); return route.fulfill({ status: 204, body: '' }); }
        if (name === 'conquest_state') return json(state(find(body.game)));
        if (name === 'conquest_move') {
            const g = find(body.game);
            const t = g.territories.find(x => x.t === body.target);
            const forced = db.force.shift();
            const correct = forced ? forced !== 'fail' : body.is_correct;
            let r = 'fail';
            const victim = t.o;
            const move = { id: db.seq++, u: me.id, k: body.move_kind, t: t.t, s: body.source, ok: correct, v: victim, n: 0, at: NOW, p: false, h: false, l: t.l };
            if (body.move_kind === 'fortify') { if (correct) { t.l += 1; r = 'fortify'; } }
            else if (correct && t.l > 0) { t.l -= 1; r = 'breach'; }
            else if (correct) { move.p = t.p; move.h = t.h && Boolean(t.o); Object.assign(t, { o: me.id, l: 0, h: false, p: false }); r = 'capture'; }
            move.r = r;
            move.l = t.l;
            g.moves.push(move);
            rescore(g);
            return json({ ...state(g), move });
        }
        if (name === 'conquest_claim') {
            const g = find(body.game);
            const p = mine(g);
            const fresh = !p.claimed;
            p.claimed = true;
            return json({ place: p.place, players: g.players.length, score: p.score, moves: 5, eligible: true, claimed_now: fresh });
        }
        return json({});
    });
};

const setup = async (browser, { viewport = { width: 360, height: 640 }, colorScheme = 'light', reducedMotion = 'no-preference', storage = {} } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, reducedMotion, deviceScaleFactor: 1 });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'), 'mudrlant.tips': JSON.stringify({ off: true }), ...login('tok-u1'), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route(`${ORIGIN}/**`, route => route.fulfill(serveFile(new URL(route.request().url()).pathname)));
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN || url.hostname === 'proj.supabase.co') return route.fallback();
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname)) return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    await tab.clock.setFixedTime(new Date(NOW));
    return { context, tab, log };
};
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `dobyvani-${name}.png`) }); };
const fits = (tab) => tab.evaluate(() => {
    const content = document.getElementById('app-content');
    return { vertical: content.scrollHeight - content.clientHeight, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: content.scrollWidth - content.clientWidth };
});
// Klepnutí na území: bod popisku (je uvnitř území) převedený na obrazovku
const tapTerritory = async (tab, id) => {
    const point = await tab.evaluate((territory) => {
        const svg = document.querySelector('[data-cq-map] svg');
        const label = svg.querySelector(`[data-label="${territory}"]`);
        const hit = svg.querySelector(`.cq-hit[data-t="${territory}"]`);
        const data = window.__cqAnchor || null;
        const ctm = svg.getScreenCTM();
        const x = Number(label.getAttribute('x'));
        const y = Number(label.getAttribute('y')) - Number(label.getAttribute('font-size') || 10) * 1.2;
        return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f, ok: Boolean(hit), data };
    }, id);
    assert.ok(point.ok);
    await tab.mouse.click(point.x, point.y);
};

test('Dobývání', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, options = {}) => {
        const page = await setup(browser, options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await page.tab.waitForSelector('#conquest-card', { timeout: 30000 });
        return page;
    };

    await t.test('karta na Více hráčů, rozcestník, Lobby s Rychlými hrami, založení soukromé hry, Barva a znak, Chci hrát a začátek hry', async () => {
        const db = newDb();
        db.autoJoin = true;
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Najdi hru nebo založ vlastní/.test(document.getElementById('conquest-card').textContent));
        const order = await tab.evaluate(() => [document.getElementById('conquest-card'), document.querySelector('[data-action="new-challenge"]')].map(el => el.getBoundingClientRect().top));
        assert.ok(order[0] < order[1], 'karta je nahoře');
        await shot(tab, 'karta-360');
        await tab.click('#conquest-card [data-action="conquest-open"]');
        await tab.waitForSelector('#conquest-hub');
        assert.match(await tab.textContent('#status-text'), /Dobývání/);
        await tab.waitForSelector('#conquest-hub [data-cq-tab="mine"][aria-selected="true"]');
        await tab.waitForFunction(() => /Zatím nehraješ žádnou hru/.test(document.getElementById('conquest-hub').textContent));
        // Jak se hraje: okno se vejde na 360×640
        await tab.click('[data-cq="help"]');
        await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Jak se hraje Dobývání');
        const helpFit = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return box.scrollHeight - box.clientHeight; });
        assert.ok(helpFit <= 0, `nápověda se vejde (přesah ${helpFit} px)`);
        await shot(tab, 'napoveda-360');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        await tab.click('[role="tab"][data-cq-tab="lobby"]');
        await tab.waitForSelector(`[data-cq-join="${uuid(1)}"]`);
        assert.equal(await tab.locator('[data-cq-join]').count(), 2);
        assert.match((await tab.textContent(`[data-cq-game="${uuid(2)}"]`)).replace(/\s+/g, ' '), /Česko\s*Rychlá hra\s*12 h · 3 tahy za hodinu/);
        await tab.waitForFunction(() => document.querySelectorAll('[data-cq-game] .cq-thumb path').length > 10, null, { timeout: 15000 });
        await shot(tab, 'lobby-360');
        // Založit hru: Česko, 12 h, hodina, soukromá; barva a znak
        await tab.click('[role="tab"][data-cq-tab="create"]');
        await tab.click('[data-cq-set="map"][data-value="cesko"]');
        await tab.click('[data-cq-set="hours"][data-value="12"]');
        await tab.click('[data-cq-set="period"][data-value="hour"]');
        await tab.click('[data-cq-set="visibility"][data-value="private"]');
        for (let i = 0; i < 6; i++) await tab.click('[data-cq-step="players"][data-delta="1"]:not([disabled])').catch(() => {});
        assert.equal(await tab.textContent('[data-cq-value="players"]'), '6', 'Česko: nejvýš 6 hráčů');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'formulář se vejde na 360×640');
        await shot(tab, 'zalozit-360');
        await tab.click('[data-cq="look"]');
        await tab.waitForSelector('[data-cq-look]');
        await tab.click('[data-cq-color="modra"]');
        await tab.click('[data-cq-look-tab="emblem"]');
        await tab.click('[data-cq-emblem="vlk"]');
        const dialogFit = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return { over: box.scrollHeight - box.clientHeight, bottom: rect.bottom, top: rect.top }; });
        assert.ok(dialogFit.over <= 0 && dialogFit.top >= 0 && dialogFit.bottom <= 640, `okno Barva a znak se vejde: ${JSON.stringify(dialogFit)}`);
        await shot(tab, 'barva-znak-360');
        await tab.click('[data-cq="look-done"]');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
        assert.match(await tab.textContent('[data-cq="look"]'), /Modrá · Vlk/);
        await tab.click('[data-cq-form] button[type="submit"]');
        await tab.waitForSelector('[data-cq-lobby-detail]');
        const create = db.calls.find(call => call.name === 'conquest_create').body;
        assert.deepEqual([create.map_id, create.players, create.hours, create.per, create.actions_per, create.vis, create.colour, create.emblem_id], ['cesko', 6, 12, 'hour', 5, 'private', 'modra', 'vlk']);
        assert.match(await tab.textContent('[data-cq-lobby-detail]'), /NEW234/);
        assert.match((await tab.textContent('[data-cq-lobby-detail]')).replace(/\s+/g, ' '), /Petr Svoboda Chce hrát/);
        await shot(tab, 'lobby-detail-360');
        // Chci hrát: všichni chtějí → hra začne a otevře se mapa
        await tab.click('[data-cq="ready"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.equal(await tab.locator('.cq-hit').count(), 14);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('vývojář: boti do lobby (+1 bot, Doplnit boty), plná hra začne; ve hře Boti odehrají tahy a Další období; bez vývojářského režimu lišta není', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db, { storage: { 'mudrlant.dev': '1' } });
        await tab.click('#conquest-card [data-action="conquest-open"]');
        await tab.waitForSelector('#conquest-hub');
        await tab.click('[role="tab"][data-cq-tab="create"]');
        await tab.click('[data-cq-set="map"][data-value="evropa"]');
        await tab.waitForSelector('[data-cq-form] button[type="submit"]');
        while (Number(await tab.textContent('[data-cq-value="players"]')) > 4) await tab.click('[data-cq-step="players"][data-delta="-1"]');
        while (Number(await tab.textContent('[data-cq-value="players"]')) < 4) await tab.click('[data-cq-step="players"][data-delta="1"]');
        await tab.click('[data-cq-form] button[type="submit"]');
        await tab.waitForSelector('[data-cq-lobby-detail] [data-cq-dev]');
        assert.match(await tab.textContent('[data-cq-dev]'), /Vývojář\s*\+1 bot\s*Doplnit boty \(3\)/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'lobby s lištou vývojáře se vejde na 360×640');
        await shot(tab, 'vyvojar-lobby-360');
        await tab.click('[data-cq="dev-bot"]');
        await tab.waitForFunction(() => /Bot je ve hře a chce hrát/.test((document.getElementById('toast') || {}).textContent || ''));
        assert.match((await tab.textContent('[data-cq-lobby-detail]')).replace(/\s+/g, ' '), /Bot Adam Chce hrát/);
        assert.match(await tab.textContent('[data-cq-dev]'), /Doplnit boty \(2\)/);
        await tab.click('[data-cq="dev-bots-full"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.deepEqual(db.calls.filter(call => call.name === 'dev_conquest_add_bots').map(call => call.body.how_many), [1, 2]);
        await tab.waitForSelector('#conquest-game [data-cq-dev]');
        assert.match(await tab.textContent('#conquest-game [data-cq-dev]'), /Boti odehrají tahy\s*Další období/);
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'hra s lištou vývojáře se vejde na 360×640');
        await shot(tab, 'vyvojar-hra-360');
        await tab.click('[data-cq="dev-play"]');
        await tab.waitForFunction(() => /Boti odehráli 3 tahy\./.test((document.getElementById('toast') || {}).textContent || ''));
        await tab.waitForFunction(() => /Bot/.test(document.querySelector('[data-cq-recent]').textContent));
        await tab.click('[data-cq="dev-period"]');
        await tab.waitForFunction(() => /Začal 2\. den hry\./.test((document.getElementById('toast') || {}).textContent || ''));
        assert.ok(db.calls.some(call => call.name === 'dev_conquest_next_period'));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
        // Bez vývojářského režimu žádná lišta
        const plain = newDb();
        plain.autoJoin = true;
        const second = await start(plain);
        await second.tab.click('#conquest-card [data-action="conquest-open"]');
        await second.tab.waitForSelector('#conquest-hub');
        await second.tab.click('[role="tab"][data-cq-tab="create"]');
        await second.tab.click('[data-cq-form] button[type="submit"]');
        await second.tab.waitForSelector('[data-cq-lobby-detail]');
        assert.equal(await second.tab.locator('[data-cq-dev]').count(), 0);
        await second.context.close();
    });

    // Rozehraná hra na Evropě (já Česko, Petr Norsko)
    const running = () => {
        const db = newDb();
        const g = db.games[0];
        g.players.push({ user: 'u-1', seat: 1, flag_color: 'cervena', emblem: 'lev', ready: true });
        g.players.push({ user: 'u-2', seat: 2, flag_color: 'modra', emblem: 'orel', ready: true });
        g.players = g.players.filter(p => p.user !== 'u-3');
        g.players.forEach((p, i) => { p.seat = i; });
        g.status = 'running'; g.started_at = NOW; g.ends_at = '2026-11-14T10:00:00Z';
        g.territories = MAPS.evropa.t.map(item => ({ t: item.id, o: { Q213: 'u-1', Q214: 'u-1', Q20: 'u-2', Q183: 'u-2' }[item.id] || null, l: item.id === 'Q183' ? 2 : 0, h: ['Q213', 'Q20'].includes(item.id), p: item.id === 'Q40' }));
        g.moves = [{ id: 1, u: 'u-1', k: 'home', t: 'Q213', r: 'home', n: 0, at: NOW }, { id: 2, u: 'u-2', k: 'home', t: 'Q20', r: 'home', n: 0, at: NOW }];
        g.players.forEach(p => { p.score = g.territories.filter(x => x.o === p.user).length; p.score_at = NOW; });
        return db;
    };
    for (const [width, height, colorScheme] of [[360, 640, 'light'], [390, 780, 'dark']]) {
        await t.test(`hra ${width}×${height} (${colorScheme === 'dark' ? 'tmavý' : 'světlý'} režim): mapa bez posouvání, útok s otázkou a dobytím, pobourání hradby, opevnění, odražený útok, přiblížení, kronika`, async () => {
            const db = running();
            const { context, tab, log } = await start(db, { viewport: { width, height }, colorScheme });
            await tab.waitForFunction(() => /Tahy 5\/5/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
            await tab.click('#conquest-card [data-action="conquest-play"]');
            await tab.waitForSelector('#conquest-game [data-cq-map] svg');
            await tab.waitForTimeout(200);
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 }, 'obrazovka hry se vejde bez posouvání');
            const box = await tab.evaluate(() => { const map = document.querySelector('[data-cq-wrap]').getBoundingClientRect(); return { height: map.height, width: map.width }; });
            assert.ok(box.height > 200 && box.width > 300, JSON.stringify(box));
            assert.equal(await tab.locator('.cq-hit').count(), 41);
            assert.ok(await tab.locator('[data-pin="Q213"]').count() === 1 && await tab.locator('[data-mark="Q183"] [data-icon="wall"]').count() === 1);
            await shot(tab, `hra-${width}-${colorScheme}`);
            // Útok na Rakousko (neutrální s pokladem): list, otázka, dobytí
            await tapTerritory(tab, 'Q40');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
            assert.match(await tab.textContent('[data-cq-sheet]'), /Rakousko[\s\S]*Neutrální území[\s\S]*Poklad: \+1 tah/);
            assert.ok(await tab.locator('[data-cq-source]').count() >= 2, 'výběr, odkud útočit');
            await shot(tab, `list-${width}-${colorScheme}`);
            db.force.push('capture');
            await tab.click('[data-cq-sheet] [data-cq="attack"]');
            await tab.waitForSelector('[data-cq-answer]', { timeout: 30000 });
            assert.equal(await tab.locator('[data-cq-answer]').count(), 4);
            assert.ok(await tab.locator('[data-cq-arrow]').count() === 1, 'šipka útoku');
            await shot(tab, `otazka-${width}-${colorScheme}`);
            await tab.click('[data-cq-answer="0"]');
            await tab.waitForFunction(() => document.querySelector('[data-wash="Q40"]'), null, { timeout: 15000 });
            await tab.waitForSelector('[data-cq-banner] .cq-banner');
            assert.match(await tab.textContent('[data-cq-banner]'), /Poklad/);
            assert.match(await tab.textContent('[data-cq-budget]'), /4\/5/);
            assert.ok(await tab.locator('[data-pin="Q40"].cq-pin-drop').count() === 1, 'vlaječka se zapíchne');
            await shot(tab, `dobyto-${width}-${colorScheme}`);
            const move = db.calls.filter(call => call.name === 'conquest_move').pop().body;
            assert.equal(move.target, 'Q40');
            assert.equal(move.move_kind, 'attack');
            assert.ok(['Q213', 'Q214'].includes(move.source));
            // Pobourání hradby v Německu
            await tapTerritory(tab, 'Q183');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
            assert.match(await tab.textContent('[data-cq-sheet]'), /Hradba[\s\S]*pobourá/);
            db.force.push('capture');
            await tab.click('[data-cq-sheet] [data-cq="attack"]');
            await tab.waitForSelector('[data-cq-answer]');
            await tab.click('[data-cq-answer="1"]');
            await tab.waitForFunction(() => /pobořena/.test((document.querySelector('[data-cq-banner]') || {}).textContent || ''), null, { timeout: 15000 });
            assert.ok(await tab.locator('[data-mark="Q183"] [data-icon="palisade"]').count() === 1, 'zbyla palisáda');
            // Opevnění domova (Česko)
            await tapTerritory(tab, 'Q213');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="fortify"]');
            assert.match(await tab.textContent('[data-cq-sheet] [data-cq="fortify"]'), /Opevnit na Palisádu/);
            db.force.push('fortify');
            await tab.click('[data-cq-sheet] [data-cq="fortify"]');
            await tab.waitForSelector('[data-cq-answer]');
            await tab.click('[data-cq-answer="2"]');
            await tab.waitForFunction(() => document.querySelector('[data-mark="Q213"] .cq-rise'), null, { timeout: 15000 });
            // Odražený útok na Německo (Petrova palisáda)
            await tapTerritory(tab, 'Q183');
            await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
            db.force.push('fail');
            await tab.click('[data-cq-sheet] [data-cq="attack"]');
            await tab.waitForSelector('[data-cq-answer]');
            await tab.click('[data-cq-answer="3"]');
            await tab.waitForFunction(() => /Útok odražen/.test((document.querySelector('[data-cq-banner]') || {}).textContent || ''), null, { timeout: 15000 });
            assert.match(await tab.textContent('[data-cq-budget]'), /1\/5/);
            // Přiblížení kolečkem a zpět na celou mapu
            const map = await tab.$('[data-cq-map]');
            const rect = await map.boundingBox();
            await tab.mouse.move(rect.x + rect.width * 0.55, rect.y + rect.height * 0.6);
            await tab.mouse.wheel(0, -900);
            await tab.waitForSelector('[data-cq="zoom-reset"].flex');
            await shot(tab, `priblizeni-${width}-${colorScheme}`);
            await tab.click('[data-cq="zoom-reset"]');
            await tab.waitForSelector('[data-cq="zoom-reset"].hidden', { state: 'attached' });
            // Kronika tažení
            await tab.click('#conquest-game button[aria-label="Kronika tažení"]');
            await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || {}).dataset && document.getElementById('dialog-overlay').dataset.title === 'Kronika tažení');
            const feed = (await tab.textContent('#dialog-overlay')).replace(/\s+/g, ' ');
            assert.match(feed, /Německo: Útok odražen ty · dosud Petr Svoboda/);
            assert.match(feed, /Rakousko: Dobyto ty · 11\. 11\./);
            assert.match(feed, /Česko: Opevněno na Palisádu/);
            assert.match(feed, /Německo: Hradba pobořena/);
            assert.match(feed, /Rakousko: Dobyto/);
            assert.match(feed, /Rakousko: Poklad nalezen/);
            await shot(tab, `kronika-${width}-${colorScheme}`);
            await tab.keyboard.press('Escape');
            assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
            // Zpět z mapy na Moje hry
            await tab.click('#conquest-game [data-cq="hub"]');
            await tab.waitForSelector('#conquest-hub [data-cq-play]');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('Česko na 360×640: mapa krajů, hodinové tahy, otázka o kraji', async () => {
        const db = newDb();
        const g = db.games[1];
        g.players = [{ user: 'u-1', seat: 0, flag_color: 'fialova', emblem: 'sova', ready: true }, { user: 'u-2', seat: 1, flag_color: 'oranzova', emblem: 'medved', ready: true }];
        g.status = 'running'; g.started_at = NOW; g.ends_at = '2026-11-11T22:00:00Z';
        g.territories = MAPS.cesko.t.map(item => ({ t: item.id, o: { Q192697: 'u-1', Q191091: 'u-2' }[item.id] || null, l: 0, h: ['Q192697', 'Q191091'].includes(item.id), p: item.id === 'Q193317' }));
        g.moves = [];
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /Tahy 3\/3/.test(document.getElementById('conquest-card').textContent), null, { timeout: 15000 });
        await tab.click('#conquest-card [data-action="conquest-play"]');
        await tab.waitForSelector('#conquest-game [data-cq-map] svg');
        assert.deepEqual(await fits(tab), { vertical: 0, page: 0, content: 0 });
        assert.equal(await tab.locator('.cq-abroad').count(), 1, 'kolem Česka cizina, ne moře');
        await tapTerritory(tab, 'Q193307');
        await tab.waitForSelector('[data-cq-sheet] [data-cq="attack"]');
        await tab.click('[data-cq-sheet] [data-cq="attack"]');
        await tab.waitForSelector('[data-cq-answer]', { timeout: 30000 });
        assert.match(await tab.textContent('[data-cq-sheet]'), /Olomouc|Olomouck/);
        await shot(tab, 'cesko-otazka-360');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('konec hry: stupně vítězů, odměna jen jednou (XP a odznak Dobyvatel), přehrání; omezený pohyb', async () => {
        const db = running();
        const g = db.games[0];
        g.status = 'finished';
        g.ends_at = '2026-11-11T09:00:00Z';
        g.players.find(p => p.user === 'u-1').place = 1;
        g.players.find(p => p.user === 'u-2').place = 2;
        g.players.push({ user: 'u-3', seat: 2, flag_color: 'zelena', emblem: 'drak', ready: true, score: 1, place: 3 });
        g.moves.push({ id: 3, u: 'u-1', k: 'attack', t: 'Q40', r: 'capture', n: 1, at: NOW });
        const { context, tab, log } = await start(db, { reducedMotion: 'reduce' });
        // Odměna se vyzvedne už po načtení her (jednou)
        await tab.waitForFunction(() => { const p = JSON.parse(localStorage.getItem('mudrlant.progress') || '{}'); return p.xp >= 150 && p.counters && p.counters.conquestWins === 1; }, null, { timeout: 15000 });
        await tab.click('#conquest-card [data-action="conquest-open"]');
        await tab.waitForSelector(`[data-cq-play="${uuid(1)}"]`);
        assert.match(await tab.textContent(`[data-cq-game="${uuid(1)}"]`), /Konec · 1\. místo/);
        await tab.click(`[data-cq-play="${uuid(1)}"]`);
        await tab.waitForSelector('[data-cq-result]');
        assert.equal(await tab.locator('.cq-podium-step').count(), 3);
        await shot(tab, 'konec-360');
        await tab.click('[data-cq="replay"]');
        await tab.waitForSelector('[data-cq-result]', { timeout: 15000 });
        assert.equal(db.calls.filter(call => call.name === 'conquest_claim').length, 1, 'odměna jen jednou');
        const progress = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')));
        assert.equal(progress.counters.conquestWins, 1);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
