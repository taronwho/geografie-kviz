// Přátelé, reakce po zápase, blokování a nahlášení v prohlížeči s falešným Supabase v paměti (jako tests/e2e-rating.test.js):
// žádosti o přátelství (přijetí, odebrání), pás přátel, blokování a odblokování, nahlášení, reakce po výzvě, starší databáze bez těchto tabulek,
// CSP bez chyb, 360×640 a 390×780 bez vodorovného posouvání, tmavý režim. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
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

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, ...extra });

// missing = databáze ještě nemá přátele, bloky, reakce a nahlášení (tabulky ani funkce): dotazy na ně končí chybou 404
const newDb = ({ missing = false } = {}) => ({
    missing, devAdmin: false, calls: [], reports: [], reactions: [], blocks: [], seenCalls: 0,
    profiles: {
        'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald' }),
        'u-2': player('u-2', 'Petr Svoboda', '🐼'),
        'u-3': player('u-3', 'Eva Mistr', '🦉', { color: 'violet' }),
        'u-4': player('u-4', 'Lenka Dvořáková', '🐸')
    },
    // Přátelství: u-1 ↔ u-2 přijaté, u-3 → u-1 čeká na mě
    friendships: [{ user_id: 'u-1', friend_id: 'u-2', status: 'accepted' }, { user_id: 'u-3', friend_id: 'u-1', status: 'pending' }],
    challenges: { ABC234: { id: 'ABC234', creator_id: 'u-2', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 's', created_at: '2026-11-03T10:00:00Z' } },
    results: [{ challenge_id: 'ABC234', user_id: 'u-2', correct: 3, points: 7, finished_at: '2026-11-03T10:30:00Z' }]
});

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (!me) return json({ message: 'no token' }, 401);
        const param = (key) => url.searchParams.get(key) || '';
        const eq = (key) => param(key).replace(/^eq\./, '');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const method = request.method();
        const profile = (id) => ({ ...db.profiles[id] });
        const challengeRow = (c) => ({ ...c, creator: profile(c.creator_id), invited: c.invited_id ? profile(c.invited_id) : null });
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const social = rpc ? /^(friends_list|touch_seen|search_players|dev_player_reports|dev_report_resolve)$/.test(rpc[1]) : /^\/rest\/v1\/(friendships|player_blocks|player_reports|match_reactions)$/.test(url.pathname);
        if (social && db.missing) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
        if (rpc && rpc[1] === 'touch_seen') { db.seenCalls++; return route.fulfill({ status: 204, body: '' }); }
        if (rpc && rpc[1] === 'friends_list') {
            return json(db.friendships.filter(f => f.user_id === 'u-1' || f.friend_id === 'u-1').map(f => {
                const other = f.user_id === 'u-1' ? f.friend_id : f.user_id;
                return { ...profile(other), last_seen: '2026-11-04T08:00:00Z', status: f.status, direction: f.user_id === 'u-1' ? 'out' : 'in', since: '2026-11-01T10:00:00Z', wins: other === 'u-2' ? 3 : 0, losses: other === 'u-2' ? 1 : 0, draws: 0 };
            }));
        }
        if (rpc && rpc[1] === 'search_players') return json([]);
        if (rpc && rpc[1] === 'dev_report_resolve') return route.fulfill({ status: 204, body: '' });
        if (rpc && rpc[1] === 'dev_player_reports') {
            if (!db.devAdmin) return json({ code: '42501', message: 'Vývojářské nástroje turnajů nejsou pro tento účet zapnuté (viz docs/SUPABASE.md, dev_admins).' }, 403);
            return json(db.reports.map((r, i) => ({ id: i + 1, reporter_id: 'u-1', reporter_name: 'Jana Nováková', reported_id: r.reported, reported_name: db.profiles[r.reported].display_name, reported_avatar: db.profiles[r.reported].avatar, reported_color: 'sky', reason: r.reason, note: r.note, created_at: '2026-11-04T09:00:00Z', resolved_at: null })));
        }
        if (url.pathname === '/rest/v1/friendships') {
            db.calls.push({ method, search: url.search, body });
            if (method === 'POST') { db.friendships.push({ user_id: body.user_id, friend_id: body.friend_id, status: 'pending' }); return route.fulfill({ status: 201, body: '' }); }
            if (method === 'PATCH') { db.friendships.filter(f => f.user_id === eq('user_id') && f.friend_id === eq('friend_id')).forEach(f => { f.status = body.status; }); return route.fulfill({ status: 204, body: '' }); }
            if (method === 'DELETE') { db.friendships = db.friendships.filter(f => !(f.user_id === 'u-1' || f.friend_id === 'u-1') || !(url.search.includes(f.user_id) && url.search.includes(f.friend_id))); return route.fulfill({ status: 204, body: '' }); }
            return json([]);
        }
        if (url.pathname === '/rest/v1/player_blocks') {
            if (method === 'POST') {
                if (db.blockFails) return json({ code: 'P0001', message: 'Máš zablokováno příliš mnoho hráčů.' }, 400);
                db.blocks.push(body.blocked); db.friendships = db.friendships.filter(f => ![f.user_id, f.friend_id].includes(body.blocked)); return route.fulfill({ status: 201, body: '' });
            }
            if (method === 'DELETE') { db.blocks = db.blocks.filter(id => id !== eq('blocked')); return route.fulfill({ status: 204, body: '' }); }
            return json(db.blocks.map(id => ({ blocked: id, created_at: '2026-11-04T09:00:00Z', player: profile(id) })));
        }
        if (url.pathname === '/rest/v1/player_reports') { db.reports.push({ reported: body.reported, reason: body.reason, note: body.note }); return route.fulfill({ status: 201, body: '' }); }
        if (url.pathname === '/rest/v1/match_reactions') {
            if (method === 'POST') { db.reactions.push(body); return route.fulfill({ status: 201, body: '' }); }
            return json(db.reactions.map(r => ({ ...r, id: 1, created_at: '2026-11-04T10:00:00Z' })).filter(r => r.to_id === 'u-1' || r.from_id === 'u-1'));
        }
        if (url.pathname === '/rest/v1/profiles') return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        if (url.pathname === '/rest/v1/challenges') {
            if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(challengeRow));
            const found = db.challenges[eq('id')];
            return json(found ? [challengeRow(found)] : []);
        }
        if (url.pathname === '/rest/v1/challenge_results') {
            if (method === 'POST') { db.results.push({ ...body, finished_at: '2026-11-04T10:05:00Z' }); return route.fulfill({ status: 201, body: '' }); }
            if (param('user_id').startsWith('eq.') && param('select').includes('challenge:challenges')) return json(db.results.filter(row => row.user_id === eq('user_id')).map(row => ({ ...row, challenge: challengeRow(db.challenges[row.challenge_id]) })));
            if (param('user_id').startsWith('eq.')) return json(db.results.filter(row => row.user_id === eq('user_id')));
            if (param('challenge_id').startsWith('in.')) return json(db.results.filter(row => param('challenge_id').slice(4, -1).split(',').includes(row.challenge_id) && row.user_id !== param('user_id').replace('neq.', '')).map(row => ({ ...row, player: profile(row.user_id) })));
            return json(db.results.filter(row => row.challenge_id === eq('challenge_id')).map(row => ({ ...row, player: profile(row.user_id) })));
        }
        return json({});
    });
};

const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, colorScheme = 'light' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'), ...storage });
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
    await tab.clock.setFixedTime(new Date('2026-11-04T10:00:00'));
    return { context, tab, log };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && (content.textContent.includes('Dnešní otázky') || content.querySelector('#home-tabs'))); }, null, { timeout: 30000 });
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const noHorizontalScroll = (tab) => tab.evaluate(() => {
    const content = document.getElementById('app-content');
    const overlay = document.querySelector('#dialog-overlay > div');
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: content.scrollWidth - content.clientWidth, dialog: overlay ? overlay.scrollWidth - overlay.clientWidth : 0 };
});
const closeDialog = async (tab) => { await tab.keyboard.press('Escape'); await tab.waitForFunction(() => !document.getElementById('dialog-overlay')); };
const compact = async (tab, selector) => (await tab.textContent(selector)).replace(/\s+/g, ' ').trim();

test('přátelé, reakce, blokování a nahlášení', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, options = {}) => {
        const page = await setup(browser, login('tok-u1'), options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await waitForHome(page.tab);
        return page;
    };

    await t.test('pás přátel a žádost: přijetí, odmítnutí, kompaktní rozvržení bez posouvání', async () => {
        for (const [viewport, colorScheme] of [[{ width: 390, height: 780 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
            const db = newDb();
            const { context, tab, log } = await start(db, { viewport, colorScheme });
            await tab.waitForSelector('#friends-strip');
            assert.equal(await tab.locator('#friends-strip [data-player-id]').count(), 1);
            assert.match(await compact(tab, '#friends-section'), /Přátelé · 1/);
            assert.match(await compact(tab, '[data-friend-request="u-3"]'), /Eva Mistr ?tě chce mít v přátelích/);
            assert.ok(db.seenCalls >= 1, 'poslední aktivita se zapíše');
            assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
            await shot(tab, `pratele-${viewport.width}-${colorScheme}`);
            await tab.click('[data-action="friend-accept"][data-id="u-3"]');
            await tab.waitForFunction(() => document.querySelectorAll('#friends-strip [data-player-id]').length === 2);
            assert.equal(db.friendships.find(f => f.user_id === 'u-3').status, 'accepted');
            assert.equal(await tab.locator('[data-friend-request]').count(), 0);
            assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
        const db = newDb();
        const { context, tab } = await start(db);
        await tab.waitForSelector('[data-friend-request="u-3"]');
        await tab.click('[data-action="friend-decline"][data-id="u-3"]');
        await tab.waitForFunction(() => !document.querySelector('[data-friend-request]'));
        assert.equal(db.friendships.some(f => f.user_id === 'u-3'), false, 'odmítnutí žádost smaže');
        assert.equal(await tab.locator('#friends-strip [data-player-id]').count(), 1);
        await context.close();
    });

    await t.test('profil hráče: přidat do přátel, odebrat, bilance a aktivita přítele', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('#friends-strip');
        await tab.click('#friends-strip [data-player-id="u-2"]');
        await tab.waitForSelector('[data-friend="remove"]');
        const info = await compact(tab, '#dialog-overlay');
        assert.match(info, /Přítel · aktivní dnes/);
        assert.match(info, /bilance 3:1/);
        await shot(tab, 'profil-pritel');
        await tab.click('[data-friend="remove"]');
        await tab.waitForSelector('[data-friend="add"]');
        assert.equal(db.friendships.some(f => f.friend_id === 'u-2' || f.user_id === 'u-2'), false);
        await closeDialog(tab);
        assert.equal(await tab.locator('#friends-strip').count(), 0, 'bez přátel pás zmizí');
        // Cizí hráč z výzvy: poslat žádost
        await tab.click('[data-action="challenge-open"][data-code="ABC234"]');
        await tab.waitForSelector('#dialog-overlay [data-player-id="u-2"]');
        await tab.click('#dialog-overlay [data-player-id="u-2"]');
        await tab.waitForSelector('[data-friend="add"]');
        await tab.click('[data-friend="add"]');
        await tab.waitForSelector('[data-friend="cancel"]');
        assert.deepEqual(db.friendships.find(f => f.user_id === 'u-1' && f.friend_id === 'u-2'), { user_id: 'u-1', friend_id: 'u-2', status: 'pending' });
        assert.match(await compact(tab, '#dialog-overlay'), /Žádost odeslána/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('blokování: potvrzení, odblokování v Nastavení, chyba serveru', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('#friends-strip');
        await tab.click('#friends-strip [data-player-id="u-2"]');
        await tab.click('[data-more]');
        await tab.click('[data-block="on"]');
        await tab.waitForSelector('[data-block-confirm]');
        assert.match(await compact(tab, '[data-block-confirm]'), /Zablokovat hráče Petr Svoboda\?.*nevyzve tě.*náhodný soupeř/);
        await shot(tab, 'blokovani-potvrzeni');
        await tab.click('[data-block-cancel]');
        assert.deepEqual(db.blocks, []);
        // Chyba serveru se ukáže jako hláška
        db.blockFails = true;
        await tab.click('[data-more]');
        await tab.click('[data-block="on"]');
        await tab.click('[data-block-go]');
        await tab.waitForFunction(() => /příliš mnoho/.test(document.getElementById('dialog-overlay').textContent));
        db.blockFails = false;
        await tab.click('[data-more]');
        await tab.click('[data-block="on"]');
        await tab.click('[data-block-go]');
        await tab.waitForFunction(() => /je zablokovaný/.test(document.getElementById('dialog-overlay').textContent));
        assert.deepEqual(db.blocks, ['u-2']);
        assert.equal(await tab.locator('[data-friend]').count(), 0, 'u blokovaného není tlačítko přátelství');
        assert.match(await compact(tab, '#dialog-overlay'), /máš zablokovaného/);
        await closeDialog(tab);
        assert.equal(await tab.locator('#friends-strip').count(), 0, 'blokovaný zmizel z přátel');
        // Nastavení → Zablokovaní hráči → Odblokovat
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.click('[data-open-blocked]');
        await tab.waitForSelector('#blocked-list');
        assert.match(await compact(tab, '#blocked-list'), /Petr Svoboda/);
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        await tab.click('[data-unblock="u-2"]');
        await tab.waitForFunction(() => /Nikoho zablokovaného/.test(document.getElementById('dialog-overlay').textContent));
        assert.deepEqual(db.blocks, []);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('nahlášení: důvod je povinný, poznámka se uloží, správce ho vidí a označí jako vyřešené', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('#friends-strip');
        await tab.click('#friends-strip [data-player-id="u-2"]');
        await tab.click('[data-more]');
        await tab.click('[data-report]');
        await tab.waitForSelector('#report-form');
        assert.equal(await tab.locator('[data-report-send]').isDisabled(), true, 'bez důvodu nejde odeslat');
        assert.equal(await tab.getAttribute('#report-note', 'maxlength'), '300');
        await tab.click('[data-reason="obtezovani"]');
        await tab.fill('#report-note', 'Posílá nevhodné zprávy');
        await shot(tab, 'nahlaseni');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        await tab.click('[data-report-send]');
        await tab.waitForFunction(() => /nahlášení jsme přijali/.test(document.getElementById('dialog-overlay').textContent));
        assert.deepEqual(db.reports, [{ reported: 'u-2', reason: 'obtezovani', note: 'Posílá nevhodné zprávy' }]);
        await closeDialog(tab);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('správce: obyčejný účet nahlášení nevidí, dev_admins je vidí a označí jako vyřešená', async () => {
        const db = newDb();
        db.reports.push({ reported: 'u-4', reason: 'podvadeni', note: 'Podezřelé časy' });
        const page = await setup(browser, { ...login('tok-u1'), 'mudrlant.dev': '1' });
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await waitForHome(page.tab);
        const { tab, log, context } = page;
        await tab.click('#btn-settings');
        await tab.click('[data-dev="player-reports"]');
        await tab.waitForFunction(() => /dev_admins/.test(document.getElementById('dialog-overlay').textContent));
        await closeDialog(tab);
        db.devAdmin = true;
        await tab.click('#btn-settings');
        await tab.click('[data-dev="player-reports"]');
        await tab.waitForSelector('#dev-reports');
        assert.match(await compact(tab, '#dev-reports'), /Lenka Dvořáková · Podvádění ?od Jana Nováková.*Podezřelé časy/);
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        await tab.click('[data-resolve="1"]');
        await tab.waitForFunction(() => /vyřešeno/.test(document.getElementById('dev-reports').textContent));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('reakce po výzvě: čtyři emoji, jedna se pošle, soupeř ji uvidí', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.click('[data-action="challenge-open"][data-code="ABC234"]');
        await tab.click('[data-ch-play]');
        await tab.waitForSelector('[data-action="give-up"]');
        for (let i = 0; i < 5; i++) {
            await tab.click('[data-action="give-up"]');
            await tab.waitForSelector('h1');
            await tab.click('[data-action="next"]');
            if (i < 4) await tab.waitForSelector('[data-action="give-up"]');
        }
        await tab.waitForSelector('[data-reactions]');
        assert.equal(await tab.locator('[data-reactions] [data-emoji]').count(), 4);
        await shot(tab, 'reakce');
        await tab.click('[data-reactions] [data-emoji="🔥"]');
        await tab.waitForFunction(() => /Poslal jsi/.test(document.querySelector('[data-reactions]').textContent));
        assert.deepEqual(db.reactions.map(r => [r.from_id, r.to_id, r.emoji, r.challenge_id]), [['u-1', 'u-2', '🔥', 'ABC234']]);
        assert.equal(await tab.getAttribute('[data-reactions] [data-emoji="🔥"]', 'aria-pressed'), 'true');
        assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
        // Přepsání jinou reakcí posílá znovu (databáze první přepíše)
        await tab.click('[data-reactions] [data-emoji="🤝"]');
        await tab.waitForFunction(() => document.querySelector('[data-reactions] [data-emoji="🤝"]').getAttribute('aria-pressed') === 'true');
        assert.equal(db.reactions.length, 2);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('starší databáze bez přátel: nic se nerozbije, sekce se neukážou', async () => {
        const db = newDb({ missing: true });
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('#app-content [data-action="challenge-open"][data-code="ABC234"]');
        assert.equal(await tab.locator('#friends-section').count(), 0);
        assert.equal(await tab.locator('[data-friend-request]').count(), 0);
        await tab.click('[data-action="challenge-open"][data-code="ABC234"]');
        await tab.click('#dialog-overlay [data-player-id="u-2"]');
        await tab.waitForSelector('[data-more]');
        assert.equal(await tab.locator('[data-friend]').count(), 0, 'bez tabulky se tlačítko přátelství neukáže');
        await tab.click('[data-more]');
        await tab.click('[data-block="on"]');
        await tab.click('[data-block-go]');
        await tab.waitForFunction(() => /schema\.sql/.test(document.getElementById('dialog-overlay').textContent));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
