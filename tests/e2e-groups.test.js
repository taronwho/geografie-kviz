// Skupiny v prohlížeči s falešným Supabase v paměti (jako tests/e2e-friends.test.js): čip na záložce Více hráčů (ve stejném řádku jako
// „Přijímám výzvy z“, záložka se tím neprodlouží), okno Skupiny s dnešním vedoucím, detail se záložkami Dnes / Týden (Kvíz dne, XP),
// založení (kontrola názvu), přidání kódem i odkazem …?skupina=KÓD (přihlášený i nepřihlášený), správa zakladatelem (název a ikona,
// nový kód, odebrání člena, smazání), opuštění skupiny, Vyzvat skupinu (výzva pro kohokoli připojená ke skupině), starší databáze bez skupin,
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAAJRU5ErkJggg==', 'base64');
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
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', frame: null, title_pref: null, owl: null, ...extra });
const G1 = '11111111-1111-1111-1111-111111111111';
const G2 = '22222222-2222-2222-2222-222222222222';
const G3 = '33333333-3333-3333-3333-333333333333';

// missing = databáze ještě nemá skupiny (funkce končí 404)
const newDb = ({ missing = false } = {}) => ({
    missing, calls: [], challenges: {}, results: [],
    profiles: {
        'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald' }),
        'u-2': player('u-2', 'Petr Svoboda', '🐼'),
        'u-3': player('u-3', 'Eva Mistr', '🦉', { color: 'violet' }),
        'u-4': player('u-4', 'Lenka Dvořáková', '🐸'),
        'u-5': player('u-5', 'Tomáš Malý', '🐯')
    },
    // Čísla pro pořadí: dnešní Kvíz dne (null = nedohrál), týden (body, dny, správně, čas) a XP za týden
    stats: {
        'u-1': { today: { score: 30, correct: 8, time_ms: 95000 }, week_score: 62, week_days: 2, week_correct: 16, week_time_ms: 200000, week_xp: 540 },
        'u-2': { today: { score: 34, correct: 9, time_ms: 120000 }, week_score: 34, week_days: 1, week_correct: 9, week_time_ms: 120000, week_xp: 1260 },
        'u-3': { today: null, week_score: 70, week_days: 3, week_correct: 18, week_time_ms: 300000, week_xp: 0 },
        'u-4': { today: null, week_score: 0, week_days: 0, week_correct: 0, week_time_ms: 0, week_xp: 80 },
        'u-5': { today: { score: 12, correct: 4, time_ms: 80000 }, week_score: 12, week_days: 1, week_correct: 4, week_time_ms: 80000, week_xp: 0 }
    },
    groups: [
        { id: G1, name: '5.B Základka', icon: '🏫', code: 'K7M2QX', owner_id: 'u-1', members: ['u-1', 'u-2', 'u-3', 'u-4'] },
        { id: G2, name: 'Rodina Novákových', icon: '👪', code: 'RDN234', owner_id: 'u-5', members: ['u-5', 'u-1'] },
        // Skupina, do které se jde přidat kódem (u-1 v ní není)
        { id: G3, name: 'Šachový kroužek', icon: '🚀', code: 'SACH23', owner_id: 'u-3', members: ['u-3', 'u-4'] }
    ],
    groupChallenges: {}
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
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const name = rpc ? rpc[1] : '';
        if (/^(my_groups|group_)/.test(name)) {
            db.calls.push({ name, body });
            if (db.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
            const group = (id) => db.groups.find(g => g.id === id);
            const summary = (g) => ({ id: g.id, name: g.name, icon: g.icon, code: g.code, owner_id: g.owner_id, is_owner: g.owner_id === me.id, members: g.members.length });
            const fail = (message, status = 400) => json({ code: 'P0001', message }, status);
            const mine = (id) => { const g = group(id); return g && g.members.includes(me.id) ? g : null; };
            if (name === 'my_groups') {
                return json(db.groups.filter(g => g.members.includes(me.id)).map(g => {
                    const played = g.members.filter(id => db.stats[id].today).sort((a, b) => db.stats[b].today.score - db.stats[a].today.score);
                    return { ...summary(g), played_today: Boolean(db.stats[me.id].today), leader: played.length ? { ...profile(played[0]), score: db.stats[played[0]].today.score, time_ms: 1, me: played[0] === me.id } : null };
                }));
            }
            if (name === 'group_detail') {
                const g = mine(body.gid);
                if (!g) return fail('Tahle skupina neexistuje nebo v ní nejsi.', 403);
                const ch = db.groupChallenges[g.id];
                return json({
                    ...summary(g), day: '2026-11-11', week_start: '2026-11-09',
                    challenge: ch ? { id: ch, topic: db.challenges[ch].topic, count: db.challenges[ch].count, created_at: '2026-11-11T10:00:00Z', creator: profile(db.challenges[ch].creator_id), results: db.results.filter(r => r.challenge_id === ch) } : null,
                    rows: g.members.map(id => ({ ...profile(id), owner: id === g.owner_id, me: id === me.id, joined_at: '2026-11-01T10:00:00Z', ...db.stats[id] }))
                });
            }
            if (name === 'group_create') {
                if (body.group_name.length < 2) return fail('Název skupiny má mít 2 až 40 znaků.');
                const g = { id: '44444444-4444-4444-4444-444444444444', name: body.group_name, icon: body.group_icon, code: 'NVA234', owner_id: me.id, members: [me.id] };
                db.groups.push(g);
                return json(summary(g));
            }
            if (name === 'group_preview' || name === 'group_join') {
                const g = db.groups.find(item => item.code === body.join_code);
                if (!g) return json(null);
                if (name === 'group_preview') return json({ id: g.id, name: g.name, icon: g.icon, code: g.code, members: g.members.length, owner: profile(g.owner_id), member: g.members.includes(me.id) });
                if (!g.members.includes(me.id)) g.members.push(me.id);
                return json(summary(g));
            }
            if (name === 'group_leave') { const g = mine(body.gid); g.members = g.members.filter(id => id !== me.id); return route.fulfill({ status: 204, body: '' }); }
            if (name === 'group_update') { const g = mine(body.gid); Object.assign(g, { name: body.group_name, icon: body.group_icon }); return json(summary(g)); }
            if (name === 'group_regenerate_code') { const g = mine(body.gid); g.code = 'NEW234'; return json('NEW234'); }
            if (name === 'group_remove_member') {
                const g = mine(body.gid);
                if (g.owner_id !== me.id) return fail('Tohle může jen zakladatel skupiny.', 403);
                g.members = g.members.filter(id => id !== body.member_id);
                return route.fulfill({ status: 204, body: '' });
            }
            if (name === 'group_delete') { db.groups = db.groups.filter(g => g.id !== body.gid); return route.fulfill({ status: 204, body: '' }); }
            if (name === 'group_set_challenge') { db.groupChallenges[body.gid] = body.challenge_code; return route.fulfill({ status: 204, body: '' }); }
        }
        if (rpc && /^(friends_list|reactions)$/.test(name)) return json([]);
        if (rpc && name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
        if (/^\/rest\/v1\/(match_reactions|player_blocks)$/.test(url.pathname)) return json([]);
        if (url.pathname === '/rest/v1/profiles') return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        if (url.pathname === '/rest/v1/challenges') {
            if (method === 'POST') { db.challenges[body.id] = { ...body, created_at: '2026-11-11T10:00:00Z' }; return json([db.challenges[body.id]], 201); }
            if (url.searchParams.has('invited_id')) return json([]);
            const found = db.challenges[eq('id')];
            return json(found ? [{ ...found, creator: profile(found.creator_id), invited: null }] : []);
        }
        if (url.pathname === '/rest/v1/challenge_results') return json([]);
        return json({});
    });
};

const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, colorScheme = 'light', query = '' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
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
    await tab.clock.setFixedTime(new Date('2026-11-11T10:00:00'));
    return { context, tab, log };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && (content.textContent.includes('Dnešní otázky') || content.querySelector('#home-tabs'))); }, null, { timeout: 30000 });
const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const noHorizontalScroll = (tab) => tab.evaluate(() => {
    const content = document.getElementById('app-content');
    const overlay = document.querySelector('#dialog-overlay > div');
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: content.scrollWidth - content.clientWidth, dialog: overlay ? overlay.scrollWidth - overlay.clientWidth : 0 };
});
const waitTitle = (tab, title) => tab.waitForFunction(expected => { const overlay = document.getElementById('dialog-overlay'); return overlay && overlay.dataset.title === expected; }, title);
const compact = async (tab, selector) => (await tab.textContent(selector)).replace(/\s+/g, ' ').trim();

test('skupiny', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, options = {}, storage = login('tok-u1')) => {
        const page = await setup(browser, storage, options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/${options.query || ''}`);
        await waitForHome(page.tab);
        return page;
    };

    await t.test('čip na Více hráčů, okno Skupiny a detail: Dnes, Týden (Kvíz dne, XP), 390×780 i 360×640, světlý i tmavý', async () => {
        for (const viewport of [{ width: 390, height: 780 }, { width: 360, height: 640 }]) {
            for (const colorScheme of ['light', 'dark']) {
                const db = newDb();
                const { context, tab, log } = await start(db, { viewport, colorScheme });
                await tab.waitForFunction(() => /Skupiny\s*2/.test((document.getElementById('groups-chip') || {}).textContent || ''));
                // Čip je ve stejném řádku jako „Přijímám výzvy z“: záložka se nijak neprodlouží
                const row = await tab.evaluate(() => {
                    const chip = document.getElementById('groups-chip').getBoundingClientRect();
                    const accept = document.querySelector('[data-action="open-accept"]').getBoundingClientRect();
                    return { sameRow: Math.abs(chip.top - accept.top) < 2, gap: accept.left - chip.right, acceptWidth: accept.width };
                });
                assert.ok(row.sameRow, 'čip a Přijímám výzvy jsou v jednom řádku');
                assert.ok(row.gap >= 0 && row.acceptWidth > 120, JSON.stringify(row));
                assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                const label = `${viewport.width}-${colorScheme}`;
                await shot(tab, `skupiny-tab-${label}`);
                await tab.click('#groups-chip');
                await waitTitle(tab, 'Skupiny');
                await tab.waitForSelector('#groups-list');
                assert.equal(await tab.locator('#groups-list [data-group-open]').count(), 2);
                assert.match(await compact(tab, `[data-group-open="${G1}"]`), /5\.B Základka 4 členové · Dnes vede Petr Svoboda · 34 bodů/);
                assert.match(await compact(tab, `[data-group-open="${G2}"]`), /Rodina Novákových 2 členové · Dnes vede ty · 30 bodů/);
                assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                await shot(tab, `skupiny-seznam-${label}`);
                await tab.click(`[data-group-open="${G1}"]`);
                await tab.waitForSelector('#group-detail [data-group-row]');
                // Dnes: dohraný Kvíz dne podle bodů; kdo nehrál, je zvlášť (malé obrázky)
                assert.deepEqual(await tab.$$eval('[data-group-board] [data-group-row]', items => items.map(item => item.dataset.groupRow)), ['u-2', 'u-1']);
                assert.equal(await tab.locator('[data-group-waiting] [data-player-id], [data-group-waiting] span[aria-hidden]').count() >= 2, true);
                assert.match(await compact(tab, '[data-group-row="u-2"]'), /Petr Svoboda 34 bodů\s*9\/10 · 2:00/);
                assert.match(await compact(tab, '[data-group-code-value]'), /K7M2QX/);
                const fits = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return box.scrollHeight - box.clientHeight; });
                assert.ok(viewport.height < 700 || fits <= 0, `detail se na 390×780 vejde bez posouvání (přesah ${fits} px)`);
                assert.deepEqual(await noHorizontalScroll(tab), { page: 0, content: 0, dialog: 0 });
                await shot(tab, `skupiny-dnes-${label}`);
                await tab.click('[data-group-tab="week"]');
                assert.deepEqual(await tab.$$eval('[data-group-board] [data-group-row]', items => items.map(item => item.dataset.groupRow)), ['u-3', 'u-1', 'u-2']);
                assert.match(await compact(tab, '[data-group-row="u-3"]'), /70 bodů\s*3 dny · 18 správně/);
                await shot(tab, `skupiny-tyden-${label}`);
                await tab.click('[data-group-by="xp"]');
                assert.deepEqual(await tab.$$eval('[data-group-board] [data-group-row]', items => items.map(item => item.dataset.groupRow)), ['u-2', 'u-1', 'u-4']);
                assert.match(await compact(tab, '[data-group-row="u-2"]'), /\+1\s260 XP/);
                await shot(tab, `skupiny-xp-${label}`);
                assert.deepEqual(log.errors, []);
                assert.deepEqual(log.csp, []);
                await context.close();
            }
        }
    });

    await t.test('založení skupiny: kontrola názvu, výběr ikony, po založení detail s kódem', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.click('#groups-chip');
        await tab.waitForSelector('[data-group-new]');
        await tab.click('[data-group-new]');
        await waitTitle(tab, 'Nová skupina');
        await tab.fill('#group-name', 'X');
        await tab.press('#group-name', 'Enter');
        await tab.waitForFunction(() => /2 až 40 znaků/.test(document.getElementById('dialog-overlay').textContent));
        await tab.fill('#group-name', 'Třída <b>');
        await tab.press('#group-name', 'Enter');
        await tab.waitForFunction(() => /V názvu můžou být/.test(document.getElementById('dialog-overlay').textContent));
        assert.equal(db.calls.filter(call => call.name === 'group_create').length, 0, 'neplatný název se na server neposílá');
        await tab.fill('#group-name', '  Hokejisti   z Kladna ');
        await tab.click('[data-group-icon="⚽"]');
        assert.equal(await tab.inputValue('#group-name'), '  Hokejisti   z Kladna ', 'výběr ikony nesmaže rozepsaný název');
        await shot(tab, 'skupiny-nova');
        await tab.press('#group-name', 'Enter');
        await tab.waitForSelector('#group-detail [data-group-code-value]');
        assert.deepEqual(db.calls.find(call => call.name === 'group_create').body, { group_name: 'Hokejisti z Kladna', group_icon: '⚽' });
        assert.match(await compact(tab, '[data-group-name]'), /Hokejisti z Kladna/);
        assert.match(await compact(tab, '[data-group-code-value]'), /NVA234/);
        await tab.waitForFunction(() => /Skupiny\s*3/.test(document.getElementById('groups-chip').textContent));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('přidání kódem: neznámý kód, náhled a Přidat se; odkaz ?skupina= přihlášeného i nepřihlášeného', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.click('#groups-chip');
        await tab.waitForSelector('[data-group-code]');
        await tab.click('[data-group-code]');
        await waitTitle(tab, 'Přidat se ke skupině');
        await tab.fill('#group-code', 'ab');
        await tab.press('#group-code', 'Enter');
        await tab.waitForFunction(() => /Kód skupiny má 6 znaků/.test(document.getElementById('dialog-overlay').textContent));
        await tab.fill('#group-code', 'zzzz22');
        await tab.press('#group-code', 'Enter');
        await tab.waitForFunction(() => /Skupina s tímhle kódem není/.test(document.getElementById('dialog-overlay').textContent));
        await tab.fill('#group-code', `${ORIGIN}/?skupina=sach23`);
        await tab.press('#group-code', 'Enter');
        await tab.waitForSelector('[data-group-preview]');
        assert.match(await compact(tab, '[data-group-preview]'), /Šachový kroužek 2 členové · zakladatel: Eva Mistr/);
        await shot(tab, 'skupiny-nahled');
        await tab.click('[data-group-join]');
        await tab.waitForSelector('#group-detail [data-group-row]');
        assert.deepEqual(db.groups.find(g => g.id === G3).members, ['u-3', 'u-4', 'u-1']);
        assert.match(await compact(tab, '[data-group-name]'), /Šachový kroužek/);
        await context.close();

        // Odkaz přihlášenému: rovnou náhled; kód zmizí z adresy
        const linked = await start(newDb(), { query: '?skupina=SACH23' });
        await linked.tab.waitForSelector('[data-group-preview]');
        assert.equal(await linked.tab.evaluate(() => window.location.search), '');
        await linked.tab.click('[data-group-join]');
        await linked.tab.waitForSelector('#group-detail');
        assert.deepEqual(linked.log.errors, []);
        await linked.context.close();

        // Nepřihlášenému: výzva k přihlášení a kód zapamatovaný na potom
        const guest = await start(newDb(), { query: '?skupina=SACH23' }, {});
        await waitTitle(guest.tab, 'Skupina');
        assert.match(await compact(guest.tab, '#dialog-overlay'), /zve do skupiny/);
        assert.equal(await guest.tab.evaluate(() => localStorage.getItem('mudrlant.pendingGroup')), 'SACH23');
        await shot(guest.tab, 'skupiny-odkaz-host');
        assert.deepEqual(guest.log.errors, []);
        await guest.context.close();

        // Po přihlášení (kód zapamatovaný) se okno otevře samo
        const after = await start(newDb(), {}, { ...login('tok-u1'), 'mudrlant.pendingGroup': 'SACH23' });
        await after.tab.waitForSelector('[data-group-preview]');
        assert.equal(await after.tab.evaluate(() => localStorage.getItem('mudrlant.pendingGroup')), null);
        await after.context.close();
        assert.deepEqual(log.errors, []);
    });

    await t.test('správa zakladatelem: název a ikona, nový kód, odebrání člena a smazání (vždy druhým klepnutím)', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.click('#groups-chip');
        await tab.waitForSelector(`[data-group-open="${G1}"]`);
        await tab.click(`[data-group-open="${G1}"]`);
        await tab.waitForSelector('[data-group-manage]');
        await tab.click('[data-group-manage]');
        await waitTitle(tab, 'Správa skupiny');
        assert.equal(await tab.locator('[data-group-member]').count(), 3, 'členové bez mě');
        await shot(tab, 'skupiny-sprava');
        await tab.fill('#group-name', '5.B Základka Kladno');
        await tab.click('[data-group-icon="🎒"]');
        await tab.press('#group-name', 'Enter');
        await tab.waitForFunction(() => !/Ukládám/.test(document.getElementById('dialog-overlay').textContent) && document.querySelector('[data-group-icon="🎒"][aria-checked="true"]'));
        assert.deepEqual([db.groups[0].name, db.groups[0].icon], ['5.B Základka Kladno', '🎒']);
        await tab.click('[data-group-regen]');
        assert.match(await compact(tab, '[data-group-regen]'), /Opravdu/);
        assert.equal(db.groups[0].code, 'K7M2QX', 'první klepnutí nic nemění');
        await tab.click('[data-group-regen]');
        await tab.waitForFunction(() => /NEW234/.test(document.querySelector('[data-group-code-value]').textContent));
        await tab.click('[data-group-remove="u-4"]');
        await tab.click('[data-group-remove="u-4"]');
        await tab.waitForFunction(() => !document.querySelector('[data-group-member="u-4"]'));
        assert.deepEqual(db.groups[0].members, ['u-1', 'u-2', 'u-3']);
        await tab.click('[data-group-delete]');
        assert.match(await compact(tab, '[data-group-delete]'), /Opravdu smazat skupinu pro všechny/);
        await tab.click('[data-group-delete]');
        await waitTitle(tab, 'Skupiny');
        assert.equal(db.groups.some(g => g.id === G1), false);
        await tab.waitForFunction(() => /Skupiny\s*1/.test(document.getElementById('groups-chip').textContent));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('člen: nevidí správu, opustí skupinu až druhým klepnutím', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.click('#groups-chip');
        await tab.waitForSelector(`[data-group-open="${G2}"]`);
        await tab.click(`[data-group-open="${G2}"]`);
        await tab.waitForSelector('[data-group-leave]');
        assert.equal(await tab.locator('[data-group-manage]').count(), 0);
        await tab.click('[data-group-leave]');
        await shot(tab, 'skupiny-clen-opustit');
        assert.match(await compact(tab, '[data-group-leave]'), /Opravdu/);
        assert.ok(db.groups[1].members.includes('u-1'));
        await tab.click('[data-group-leave]');
        await waitTitle(tab, 'Skupiny');
        assert.equal(db.groups[1].members.includes('u-1'), false);
        assert.equal(await tab.locator('#groups-list [data-group-open]').count(), 1);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('Vyzvat skupinu: Nová výzva pro skupinu, výzva se připojí ke skupině a hned se hraje; v detailu je karta výzvy', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.click('#groups-chip');
        await tab.waitForSelector(`[data-group-open="${G1}"]`);
        await tab.click(`[data-group-open="${G1}"]`);
        await tab.waitForSelector('[data-group-challenge-new]');
        await tab.click('[data-group-challenge-new]');
        await waitTitle(tab, 'Nová výzva');
        assert.match(await compact(tab, '[data-ch-group]'), /Výzva skupině\s*5\.B Základka/);
        assert.equal(await tab.locator('[data-ch-who]').count(), 0, 'koho vyzvat se nevybírá');
        await shot(tab, 'skupiny-vyzva');
        await tab.click('[data-ch-count="5"]');
        await tab.click('[data-ch-create]');
        await tab.waitForSelector('[data-action="choice"]');
        // Soupeř v záhlaví otázky: skupina (ikona a název)
        assert.equal(await tab.getAttribute('[data-opponent-chip]', 'data-opponent-chip'), 'group');
        assert.match(await compact(tab, '[data-opponent-chip]'), /🏫\s*skupina\s*5\.B Základka/);
        const code = Object.keys(db.challenges)[0];
        assert.equal(db.challenges[code].invited_id, null, 'výzva pro kohokoli s kódem');
        assert.deepEqual(db.calls.find(call => call.name === 'group_set_challenge').body, { gid: G1, challenge_code: code });
        await context.close();

        // Jiný člen vidí výzvu skupiny v detailu
        const db2 = newDb();
        db2.challenges.GRP234 = { id: 'GRP234', creator_id: 'u-2', topic: 'zemepis', count: 5, seed: 's', invited_id: null };
        db2.groupChallenges[G1] = 'GRP234';
        db2.results = [{ challenge_id: 'GRP234', user_id: 'u-2', correct: 4, points: 9 }];
        const other = await start(db2);
        await other.tab.click('#groups-chip');
        await other.tab.waitForSelector(`[data-group-open="${G1}"]`);
        await other.tab.click(`[data-group-open="${G1}"]`);
        await other.tab.waitForSelector('[data-group-challenge]');
        assert.match(await compact(other.tab, '[data-group-challenge]'), /Výzva skupiny · Zeměpis Petr Svoboda · hotovo 1 z 4 Hrát/);
        await shot(other.tab, 'skupiny-vyzva-karta');
        await other.tab.click('[data-group-play="GRP234"]');
        await waitTitle(other.tab, 'Výzva');
        // Člen hraje výzvu skupiny: v záhlaví otázky je skupina, ne jen zakladatel
        await other.tab.click('[data-ch-play]');
        await other.tab.waitForSelector('[data-opponent-chip]', { timeout: 30000 });
        assert.match(await compact(other.tab, '[data-opponent-chip]'), /skupina\s*5\.B Základka/);
        assert.deepEqual(other.log.errors, []);
        await other.context.close();
        assert.deepEqual(log.errors, []);
    });

    await t.test('starší databáze bez skupin: čip zmizí, nic nespadne', async () => {
        const db = newDb({ missing: true });
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => document.querySelector('[data-action="open-accept"]') && !document.getElementById('groups-chip'));
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
