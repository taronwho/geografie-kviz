// Hra více hráčů v prohlížeči s falešným Supabase v paměti (jako tests/e2e-friends.test.js), opravy z kontroly hry více hráčů:
// výsledek v Posledních výzvách podle bodů, remíza s pohárem pro oba, upozornění na vyzvaného jen pro zakladatele, obnova výzvy po zodpovězené
// otázce (bez druhé odpovědi), neodeslaný výsledek se neztratí, cizí rozehraná výzva na stejném zařízení, okna se po pozdní odpovědi znovu neotevřou,
// přijímaná témata se ukládají po jednom, pozvánky od zablokovaných, ikony v profilu hráče, české tvary v bilanci. CSP bez chyb, 360×640 i 390×780.
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
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
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true, ...extra });

const newDb = () => ({
    fail: {}, delay: {}, patches: [], log: [],
    profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald' }), 'u-2': player('u-2', 'Petr Svoboda', '🐼'), 'u-3': player('u-3', 'Eva Mistr', '🦉') },
    challenges: {}, results: [], blocks: [], friendships: []
});
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        const method = request.method();
        const key = `${method} ${url.pathname}`;
        if (url.pathname.startsWith('/auth/')) return json({});
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        if (!me) return json({ message: 'no token' }, 401);
        db.log.push(key);
        if (db.delay[key]) await sleep(db.delay[key]);
        if (db.fail[key]) return json({ message: 'boom' }, db.fail[key]);
        const param = (name) => url.searchParams.get(name) || '';
        const eq = (name) => param(name).replace(/^eq\./, '');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        const challengeRow = (c) => ({ ...c, creator: profile(c.creator_id), invited: c.invited_id ? profile(c.invited_id) : null });
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        if (rpc) {
            const name = rpc[1];
            if (name === 'schema_version') return json(REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'friends_list') return json([]);
            if (name === 'weekly_leaderboard') return json([]);
            if (name === 'search_players') return json(Object.values(db.profiles).filter(p => p.id !== me.id && p.display_name.toLowerCase().includes(String(body.term).toLowerCase())));
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        const table = url.pathname.replace('/rest/v1/', '');
        if (table === 'profiles') {
            if (method === 'PATCH') { db.patches.push(body); Object.assign(db.profiles[eq('id')], body); return route.fulfill({ status: 204, body: '' }); }
            return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        }
        if (table === 'challenges') {
            if (method === 'POST') { db.challenges[body.id] = { ...body, created_at: new Date().toISOString() }; return json([db.challenges[body.id]], 201); }
            if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(challengeRow));
            if (param('id').startsWith('in.')) return json(param('id').slice(4, -1).split(',').map(id => db.challenges[id]).filter(Boolean).slice(0, 1));
            return json(db.challenges[eq('id')] ? [challengeRow(db.challenges[eq('id')])] : []);
        }
        if (table === 'challenge_results') {
            if (method === 'POST') {
                if (!db.results.some(r => r.challenge_id === body.challenge_id && r.user_id === body.user_id)) db.results.push({ ...body, finished_at: new Date().toISOString() });
                return route.fulfill({ status: 201, body: '' });
            }
            const withPlayer = (r) => ({ ...r, player: profile(r.user_id) });
            if (param('challenge_id').startsWith('in.') && param('user_id').startsWith('eq.')) { const ids = param('challenge_id').slice(4, -1).split(','); return json(db.results.filter(r => r.user_id === eq('user_id') && ids.includes(r.challenge_id))); }
            if (param('user_id').startsWith('eq.')) return json(db.results.filter(r => r.user_id === eq('user_id')).map(r => ({ ...r, challenge: challengeRow(db.challenges[r.challenge_id]) })));
            if (param('challenge_id').startsWith('in.')) { const ids = param('challenge_id').slice(4, -1).split(','); return json(db.results.filter(r => ids.includes(r.challenge_id) && r.user_id !== param('user_id').replace('neq.', '')).map(withPlayer)); }
            return json(db.results.filter(r => r.challenge_id === eq('challenge_id')).map(withPlayer));
        }
        if (table === 'player_blocks') return json(db.blocks.map(id => ({ blocked: id, created_at: '2026-11-04T09:00:00Z', player: profile(id) })));
        return json([]);
    });
};

const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, colorScheme = 'light' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'), ...storage });
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
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && content.querySelector('#home-tabs')); }, null, { timeout: 30000 });
const compact = async (tab, selector) => ((await tab.textContent(selector)) || '').replace(/\s+/g, ' ').trim();
const sessionItem = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data.id);
// Odpověď na otázku (první možnost nebo Nevím) a případně Další
const answer = async (tab, { next = true, giveUp = false } = {}) => {
    await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
    await tab.click(giveUp ? '[data-action="give-up"]' : '[data-action="choice"] >> nth=0');
    await tab.waitForSelector('[data-action="next"]');
    if (next) await tab.click('[data-action="next"]');
};
const dialogTitle = (tab) => tab.evaluate(() => { const overlay = document.getElementById('dialog-overlay'); return overlay ? overlay.dataset.title : null; });

test('hra více hráčů: výzvy, obnova, okna a profil', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, token = 'tok-u1', options = {}) => {
        const page = await setup(browser, login(token), options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await waitForHome(page.tab);
        await page.tab.waitForSelector('[data-action="new-challenge"]');
        return page;
    };

    await t.test('Poslední výzvy: při shodě správných rozhodují body; remíza má pohár u obou; vyzvaný nevidí upozornění sám na sebe', async () => {
        for (const [viewport, colorScheme] of [[{ width: 390, height: 780 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
            const db = newDb();
            db.challenges.WWWWWW = { id: 'WWWWWW', creator_id: 'u-1', invited_id: 'u-2', topic: 'historie', count: 10, seed: 's1', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-03T10:00:00Z' };
            db.challenges.LLLLLL = { id: 'LLLLLL', creator_id: 'u-2', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 's2', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-03T11:00:00Z' };
            db.results.push(
                { challenge_id: 'WWWWWW', user_id: 'u-1', correct: 6, points: 20, finished_at: '2026-11-03T10:10:00Z' }, { challenge_id: 'WWWWWW', user_id: 'u-2', correct: 6, points: 14, finished_at: '2026-11-03T10:20:00Z' },
                { challenge_id: 'LLLLLL', user_id: 'u-1', correct: 3, points: 8, finished_at: '2026-11-03T11:10:00Z' }, { challenge_id: 'LLLLLL', user_id: 'u-2', correct: 3, points: 9, finished_at: '2026-11-03T11:20:00Z' });
            const { context, tab, log } = await start(db, 'tok-u1', { viewport, colorScheme });
            await tab.waitForSelector('[data-action="challenge-open"][data-code="WWWWWW"]');
            assert.match(await compact(tab, '[data-action="challenge-open"][data-code="WWWWWW"]'), /vyhráno 6\/10/, 'víc bodů při stejném počtu správných je výhra');
            assert.match(await compact(tab, '[data-action="challenge-open"][data-code="LLLLLL"]'), /prohráno 3\/5/);
            // Profil soupeře: bilance česky (1 výhra, 1 prohra) a tlačítka přátel s ikonami
            await tab.click('[data-action="challenge-open"][data-code="WWWWWW"] [data-player-id="u-2"]');
            await tab.waitForSelector('[data-rematch]');
            const profileText = await compact(tab, '#dialog-overlay');
            assert.match(profileText, /1 výhra/);
            assert.match(profileText, /1 prohra/);
            assert.match(profileText, /0 remíz/);
            assert.equal(await tab.locator('#dialog-overlay [data-more] svg').count(), 1, 'menu ⋯ má ikonu');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
        // Remíza: oba hráči jsou první (pohár); vyzvaný hráč po dohrání nevidí „uvidí výzvu na úvodní stránce“ sám o sobě
        const db = newDb();
        db.challenges.DDDDDD = { id: 'DDDDDD', creator_id: 'u-1', invited_id: 'u-2', topic: 'zemepis', count: 5, seed: 'remiza', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-03T10:00:00Z' };
        db.results.push({ challenge_id: 'DDDDDD', user_id: 'u-1', correct: 0, points: 0, finished_at: '2026-11-03T10:10:00Z' });
        const { context, tab, log } = await start(db, 'tok-u2');
        await tab.click('[data-action="challenge-open"][data-code="DDDDDD"]');
        await tab.click('[data-ch-play]');
        for (let i = 0; i < 5; i++) await answer(tab, { giveUp: true });
        await tab.waitForSelector('[data-challenge-outcome="remiza"]');
        assert.deepEqual(await tab.$$eval('#app-content ol [data-place]', items => items.map(item => item.dataset.place)), ['1', '1']);
        assert.equal(await tab.locator('[data-invited-note]').count(), 0, 'vyzvaný hráč nevidí upozornění sám na sebe');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('obnova po zodpovězené otázce pokračuje další otázkou; neodeslaný výsledek se nabídne k dokončení, jinému účtu ne', async () => {
        const db = newDb();
        const { context, tab, log } = await start(db);
        await tab.click('[data-action="new-challenge"]');
        await tab.click('[data-ch-who="anyone"]');
        await tab.click('[data-ch-count="5"]');
        await tab.click('[data-ch-create]');
        await answer(tab);
        await tab.waitForSelector('[data-action="choice"]');
        const second = await sessionItem(tab);
        // Druhá otázka zodpovězená, aplikace se zavře před „Další“
        await answer(tab, { next: false, giveUp: true });
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForSelector('[data-action="challenge-resume"]');
        assert.match(await compact(tab, '[data-action="challenge-resume"]'), /Pokračovat ve výzvě \(3\/5\)/);
        // Detail výzvy nabízí pokračování (ne hru od začátku)
        const code = Object.keys(db.challenges)[0];
        await tab.click('[data-action="join-challenge"]');
        await tab.fill('#challenge-code', code);
        await tab.press('#challenge-code', 'Enter');
        await tab.waitForSelector('[data-ch-play]');
        assert.match(await compact(tab, '[data-ch-play]'), /Pokračovat ve výzvě \(3\/5\)/);
        await tab.click('[data-ch-play]');
        await tab.waitForSelector('[data-action="choice"]');
        assert.notEqual(await sessionItem(tab), second, 'zodpovězená otázka se nehraje znovu');
        assert.equal(await tab.textContent('#status-text'), 'Výzva · 3/5');
        await answer(tab);
        await answer(tab);
        // Výsledek se nepodaří odeslat: výzva zůstane rozehraná (i po zavření aplikace)
        db.fail['POST /rest/v1/challenge_results'] = 503;
        await answer(tab);
        await tab.waitForSelector('[data-action="challenge-retry"]');
        await tab.click('[data-action="challenge-home"]');
        await waitForHome(tab);
        await tab.waitForSelector('[data-action="challenge-resume"]');
        assert.match(await compact(tab, '[data-action="challenge-resume"]'), /Dokončit výzvu/);
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForSelector('[data-action="challenge-resume"]');
        // Jiný účet na stejném zařízení cizí rozehranou výzvu nevidí
        await tab.evaluate((auth) => localStorage.setItem('mudrlant.auth', auth), login('tok-u2')['mudrlant.auth']);
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForSelector('[data-action="new-challenge"]');
        await tab.waitForTimeout(300);
        assert.equal(await tab.locator('[data-action="challenge-resume"]').count(), 0);
        await tab.evaluate((auth) => localStorage.setItem('mudrlant.auth', auth), login('tok-u1')['mudrlant.auth']);
        await tab.reload();
        await waitForHome(tab);
        delete db.fail['POST /rest/v1/challenge_results'];
        await tab.click('[data-action="challenge-resume"]');
        await tab.waitForSelector('[data-challenge-outcome]');
        assert.equal(db.results.filter(row => row.challenge_id === code).length, 1, 'výsledek je na serveru jednou');
        await tab.click('[data-action="challenge-home"]');
        await waitForHome(tab);
        await tab.waitForSelector('[data-action="challenge-open"]');
        assert.equal(await tab.locator('[data-action="challenge-resume"]').count(), 0);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('pozdní odpovědi neotevřou zavřené okno; přijímaná témata se ukládají po jednom; pozvánka od zablokovaného zmizí', async () => {
        const db = newDb();
        db.challenges.BBBBBB = { id: 'BBBBBB', creator_id: 'u-3', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 'b', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-03T10:00:00Z' };
        db.challenges.PPPPPP = { id: 'PPPPPP', creator_id: 'u-2', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 'p', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-03T10:00:00Z' };
        db.blocks.push('u-3');
        const { context, tab, log } = await start(db);
        await tab.waitForSelector('[data-action="challenge-open"][data-code="PPPPPP"]');
        assert.equal(await tab.locator('[data-action="challenge-open"][data-code="BBBBBB"]').count(), 0, 'pozvánka od zablokovaného hráče se nezobrazí');
        assert.match(await compact(tab, '[data-action="home-tab"][data-tab="multi"]'), /Více hráčů ?1$/);
        // Detail výzvy: okno se zavře dřív, než výzva dorazí
        db.delay['GET /rest/v1/challenges'] = 700;
        await tab.click('[data-action="challenge-open"][data-code="PPPPPP"]');
        await tab.waitForSelector('#dialog-overlay');
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(1200);
        assert.equal(await dialogTitle(tab), null, 'detail výzvy se znovu neotevře');
        delete db.delay['GET /rest/v1/challenges'];
        // Profil hráče: zavřený před načtením statistik se znovu neotevře
        db.delay['GET /rest/v1/challenge_results'] = 700;
        await tab.click('[data-action="challenge-open"][data-code="PPPPPP"] [data-player-id="u-2"]');
        await tab.waitForSelector('#dialog-overlay');
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(1200);
        assert.equal(await dialogTitle(tab), null, 'profil se znovu neotevře');
        delete db.delay['GET /rest/v1/challenge_results'];
        // Nová výzva: výběr hráče dotáhne jeho přijímaná témata; okno zavřené mezitím se neotevře
        db.delay['GET /rest/v1/profiles'] = 700;
        await tab.click('[data-action="new-challenge"]');
        await tab.fill('#opp-search', 'Petr');
        await tab.waitForSelector('[data-pick-opp="u-2"]');
        await tab.click('[data-pick-opp="u-2"]');
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(1200);
        assert.equal(await dialogTitle(tab), null, 'nová výzva se znovu neotevře');
        delete db.delay['GET /rest/v1/profiles'];
        // Přijímaná témata: rychlá klepnutí se ukládají po sobě a server skončí ve stavu, který ukazuje okno
        db.delay['PATCH /rest/v1/profiles'] = 400;
        await tab.click('[data-action="open-accept"]');
        await tab.waitForSelector('[data-accept-topic="historie"]');
        await tab.click('[data-accept-topic="historie"]');
        await tab.click('[data-accept-topic="sport"]');
        await tab.click('[data-accept-topic="historie"]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('dialog-overlay').textContent), null, { timeout: 10000 });
        await tab.waitForTimeout(500);
        assert.deepEqual(db.profiles['u-1'].blocked_topics, ['sport']);
        assert.deepEqual(db.patches.map(patch => patch.blocked_topics).pop(), ['sport']);
        assert.equal(await tab.getAttribute('[data-accept-topic="historie"]', 'aria-checked'), 'true');
        assert.equal(await tab.getAttribute('[data-accept-topic="sport"]', 'aria-checked'), 'false');
        // Zavřené okno se po uložení neotevře
        await tab.click('[data-accept-topic="vlajky"]');
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(900);
        assert.equal(await dialogTitle(tab), null, 'přijímané výzvy se znovu neotevřou');
        assert.deepEqual(db.profiles['u-1'].blocked_topics, ['sport', 'vlajky']);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('přihlášení jiného účtu v jiné kartě: přijímaná témata předchozího účtu se neuloží pod nový', async () => {
        const db = newDb();
        db.profiles['u-1'].blocked_topics = ['historie', 'sport'];
        const { context, tab, log } = await start(db);
        await tab.waitForFunction(() => /12 z 14 témat/.test(document.querySelector('[data-action="open-accept"]').textContent));
        const other = await context.newPage();
        await other.goto(`${ORIGIN}/licence.html`);
        await other.evaluate((auth) => localStorage.setItem('mudrlant.auth', auth), login('tok-u2')['mudrlant.auth']);
        await tab.waitForFunction(() => /Petr Svoboda/.test(document.getElementById('btn-settings').getAttribute('aria-label')));
        await tab.waitForFunction(() => /všechna témata/.test(document.querySelector('[data-action="open-accept"]').textContent));
        await tab.click('[data-action="open-accept"]');
        await tab.waitForSelector('[data-accept-topic="vlajky"]');
        await tab.click('[data-accept-topic="vlajky"]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('dialog-overlay').textContent));
        assert.deepEqual(db.profiles['u-2'].blocked_topics, ['vlajky']);
        assert.deepEqual(db.profiles['u-1'].blocked_topics, ['historie', 'sport']);
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
