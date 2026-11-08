// Test odměn ve Vzhledu v prohlížeči: rámečky profilu, titul u jména a zamčené obrázky hráče, s falešným Supabase v paměti.
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};

const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
// Hráčka 1 je na úrovni 20 s odznakem Vítěz: odemčený je bronz, stříbro a vavřín; zlatý rámeček (úr. 25) a plamen (odznak série 30 dní) jsou zamčené
const login = (token, { level = 20, badges = { vitez: '2026-10-01' } } = {}) => ({
    'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }),
    'mudrlant.progress': JSON.stringify({ xp: core.xpForLevel(level), badges })
});

// Falešný Supabase: profily (včetně sloupců frame a title_pref, které jdou „vypnout“ jako ve starším schématu) a pozvánky do výzev
const backend = async (context, db, { noExtras = false, calls = [] } = {}) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (!me) return json({ message: 'no token' }, 401);
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const select = url.searchParams.get('select') || '';
        const eq = (key) => (url.searchParams.get(key) || '').replace(/^eq\./, '');
        calls.push(`${request.method()} ${url.pathname}?select=${select}${body ? ` ${JSON.stringify(body)}` : ''}`);
        if (noExtras && (/frame|title_pref/.test(select) || (body && ('frame' in body || 'title_pref' in body)))) return json({ code: '42703', message: 'column does not exist' }, 400);
        const profile = (id) => {
            const row = { ...db.profiles[id] };
            if (noExtras) { delete row.frame; delete row.title_pref; }
            return row;
        };
        if (url.pathname === '/rest/v1/profiles') {
            if (request.method() === 'PATCH') {
                Object.assign(db.profiles[eq('id')], body);
                return json([profile(eq('id'))]);
            }
            return json([profile(eq('id'))]);
        }
        if (url.pathname === '/rest/v1/challenges' && url.searchParams.has('invited_id')) {
            return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(c => ({ ...c, creator: profile(c.creator_id) })));
        }
        if (url.pathname === '/rest/v1/challenge_results') return json([]);
        return json([]);
    });
};

const newDb = () => ({
    profiles: {
        'u-1': { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [] },
        // Petr má zlatý rámeček a jako titul odznak Vítěz
        'u-2': { id: 'u-2', display_name: 'Petr Svoboda', avatar: '🐼', color: 'sky', xp: core.xpForLevel(30), badges: ['vitez'], frame: 'zlato', title_pref: 'vitez' }
    },
    challenges: { ABC234: { id: 'ABC234', creator_id: 'u-2', invited_id: 'u-1', topic: 'zemepis', count: 5, created_at: '2026-11-03T10:00:00Z' } }
});

const setup = async (browser, storage) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'light', viewport: { width: 400, height: 800 } });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), ...storage });
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
    await tab.clock.setFixedTime(new Date('2026-10-16T10:00:00'));
    return { context, tab, log };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && (content.textContent.includes('Dnešní otázky') || content.querySelector('#home-tabs'))); }, null, { timeout: 30000 });
const until = async (check, message) => {
    for (let i = 0; i < 60; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.fail(message);
};
const openLook = async (tab) => {
    await tab.click('#btn-settings');
    await tab.click('[data-me-tab="look"]');
    await tab.waitForSelector('[data-frame="bronz"]');
};

test('odměny ve Vzhledu: rámečky, titul a obrázky hráče', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('rámeček: zamčený se nevybere, odemčený se uloží do účtu, ukáže se kolem obrázku a zůstane po načtení', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('#btn-settings span');
        assert.doesNotMatch(await tab.getAttribute('#btn-settings span', 'class'), /frame/, 'na začátku bez rámečku');
        await openLook(tab);

        // Řada devíti rámečků; zamčené jsou šedé s podmínkou v popisku
        assert.equal(await tab.locator('[data-frame]').count(), 9);
        assert.equal(await tab.getAttribute('[data-frame="zadny"]', 'aria-pressed'), 'true');
        assert.match(await tab.getAttribute('[data-frame="zlato"]', 'aria-label'), /Zlatý: Úroveň 25 \(zamčeno\)/);
        assert.match(await tab.getAttribute('[data-frame="plamen"]', 'title'), /Odznak: .+/);
        assert.match(await tab.getAttribute('[data-frame="zlato"]', 'class'), /grayscale/);
        assert.doesNotMatch(await tab.getAttribute('[data-frame="vavrin"]', 'class'), /grayscale/, 'vavřín je odemčený odznakem Vítěz');
        assert.equal(await tab.locator('[data-frame="bronz"] .frame-bronz').count(), 1, 'náhled obrázku v rámečku');
        // Řada i titul se vejdou do okna bez posouvání
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');

        // Zamčený: nic se nevybere ani neuloží, ukáže se, jak se odemkne
        await tab.click('[data-frame="zlato"]');
        await tab.waitForFunction(() => /Zlatý: Úroveň 25/.test(document.querySelector('[data-look="frames"] p').textContent));
        assert.equal(await tab.getAttribute('[data-frame="zadny"]', 'aria-pressed'), 'true');
        assert.equal(await tab.getAttribute('[data-frame="zlato"]', 'aria-pressed'), 'false');
        assert.equal(db.profiles['u-1'].frame, undefined);

        // Odemčený: vybere se, uloží do účtu a ukáže kolem obrázku v záhlaví
        await tab.click('[data-frame="bronz"]');
        await tab.waitForFunction(() => document.querySelector('[data-frame="bronz"]').getAttribute('aria-pressed') === 'true');
        await until(() => db.profiles['u-1'].frame === 'bronz', 'rámeček v účtu');
        assert.match(await tab.getAttribute('#btn-settings span', 'class'), /frame-bronz/);
        assert.match(await tab.getAttribute('#settings-overlay span.frame', 'class'), /frame-bronz/, 'i v hlavičce okna');
        // Rámeček je kolem kruhu: obrázek se nezmenší ani nedeformuje, kroužek je mimo něj
        const geometry = await tab.evaluate(() => {
            const avatar = document.querySelector('#btn-settings span.frame');
            const box = avatar.getBoundingClientRect();
            const ring = getComputedStyle(avatar, '::before');
            return { w: box.width, h: box.height, ring: ring.backgroundImage, inset: ring.insetBlockStart || ring.top, mask: ring.maskImage || ring.webkitMaskImage };
        });
        assert.equal(geometry.w, geometry.h);
        assert.equal(geometry.w, 44);
        assert.match(geometry.ring, /conic-gradient/);
        assert.match(geometry.inset, /^-\d/);
        assert.match(geometry.mask, /radial-gradient/);

        // Jiný odemčený rámeček (vavřín) a vrácení na „Bez“
        await tab.click('[data-frame="vavrin"]');
        await until(() => db.profiles['u-1'].frame === 'vavrin', 'vavřín v účtu');
        await tab.click('[data-frame="zadny"]');
        await until(() => db.profiles['u-1'].frame === null, 'bez rámečku v účtu');
        assert.doesNotMatch(await tab.getAttribute('#btn-settings span', 'class'), /frame/);
        await tab.click('[data-frame="stribro"]');
        await until(() => db.profiles['u-1'].frame === 'stribro', 'stříbro v účtu');

        // Po načtení stránky zůstane (z úložiště zařízení i z účtu)
        await tab.reload();
        await waitForHome(tab);
        await tab.waitForFunction(() => /frame-stribro/.test((document.querySelector('#btn-settings span') || {}).className || ''));
        await openLook(tab);
        assert.equal(await tab.getAttribute('[data-frame="stribro"]', 'aria-pressed'), 'true');
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.look'))).frame, 'stribro');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('nové zařízení převezme rámeček a titul z účtu', async () => {
        const db = newDb();
        Object.assign(db.profiles['u-1'], { frame: 'vavrin', title_pref: 'none' });
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForFunction(() => /frame-vavrin/.test((document.querySelector('#btn-settings span') || {}).className || ''));
        await openLook(tab);
        assert.equal(await tab.getAttribute('[data-frame="vavrin"]', 'aria-pressed'), 'true');
        assert.equal(await tab.inputValue('[data-title-select]'), 'none');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('titul u jména: volba se uloží do účtu; cizí hráč se zobrazí s rámečkem a svým titulem', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await openLook(tab);
        // Nabídka: úroveň (výchozí), nic a získané odznaky
        assert.equal(await tab.inputValue('[data-title-select]'), 'level');
        const options = await tab.locator('[data-title-select] option').evaluateAll(list => list.map(option => [option.value, option.textContent]));
        assert.match(options[0][1], /Úr\. 20 · /);
        assert.deepEqual(options.slice(1).map(option => option[0]), ['none', 'vitez']);
        await tab.selectOption('[data-title-select]', 'none');
        await until(() => db.profiles['u-1'].title_pref === 'none', 'titul Nic v účtu');
        await tab.selectOption('[data-title-select]', 'vitez');
        await until(() => db.profiles['u-1'].title_pref === 'vitez', 'odznak jako titul v účtu');
        assert.equal(await tab.inputValue('[data-title-select]'), 'vitez');
        // Zvolený titul je vidět i u mého jména v hlavičce Nastavení
        await tab.waitForFunction(() => /Vítěz/.test(document.querySelector('[data-open-progress]').textContent));
        await tab.selectOption('[data-title-select]', 'level');
        await tab.waitForFunction(() => /Úr\. 20 · /.test(document.querySelector('[data-open-progress]').textContent));
        await until(() => db.profiles['u-1'].title_pref === null, 'úroveň (výchozí) v účtu');
        await tab.selectOption('[data-title-select]', 'none');
        await until(() => db.profiles['u-1'].title_pref === 'none', 'titul Nic v účtu podruhé');
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.look'))).title, 'none');
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        await tab.click('#settings-overlay [data-close]');

        // Pozvánka od Petra: jeho obrázek má zlatý rámeček a v profilu má místo úrovně titul Vítěz
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('#challenges-section [data-player-id="u-2"]');
        assert.match(await tab.getAttribute('#challenges-section [data-player-id="u-2"]', 'class'), /frame-zlato/);
        await tab.click('#challenges-section [data-player-id="u-2"]');
        await tab.waitForFunction(() => /Vítěz/.test((document.getElementById('dialog-overlay') || {}).textContent || ''));
        assert.match(await tab.getAttribute('#dialog-overlay span.frame', 'class'), /frame-zlato/);
        assert.doesNotMatch(await tab.textContent('#dialog-overlay'), /Úr\. 30/);
        await tab.click('#dialog-overlay [data-close]');

        // Petr si titul vypne: v jeho profilu není vidět nic; s neplatnou hodnotou z databáze se zobrazí úroveň
        db.profiles['u-2'].title_pref = 'none';
        await tab.click('#challenges-section [data-player-id="u-2"]');
        await tab.waitForSelector('#dialog-overlay span.frame');
        await tab.waitForTimeout(400);
        assert.doesNotMatch(await tab.textContent('#dialog-overlay'), /Úr\. 30|Vítěz/);
        await tab.click('#dialog-overlay [data-close]');
        db.profiles['u-2'].title_pref = 'neexistuje';
        await tab.click('#challenges-section [data-player-id="u-2"]');
        await tab.waitForFunction(() => /Úr\. 30/.test((document.getElementById('dialog-overlay') || {}).textContent || ''));
        assert.doesNotMatch(await tab.textContent('#dialog-overlay'), /neexistuje/, 'neznámý titul se neukáže');
        await tab.click('#dialog-overlay [data-close]');
        // Titul je jen vzhled: vybraný odznak se ukáže, i když ho v uloženém postupu hráče ještě není (třeba při zkoušení ve vývojářském režimu)
        db.profiles['u-2'].title_pref = 'gladiator';
        await tab.click('#challenges-section [data-player-id="u-2"]');
        await tab.waitForFunction(() => /Gladiátor/.test((document.getElementById('dialog-overlay') || {}).textContent || ''));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('obrázky hráče: zamčené jsou šedé s úrovní a nejdou vybrat, odemčený se uloží', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('#profile-name');
        // Úroveň 20: Orel (3), Vlk (8), Žralok (13) a Drak (20) jsou odemčené, T-Rex (28) ne
        assert.equal(await tab.locator('[data-pick-avatar="🐉"]').count(), 1);
        assert.equal(await tab.locator('[data-pick-avatar="🦖"]').count(), 0);
        assert.match(await tab.getAttribute('[data-locked-avatar="🦖"]', 'aria-label'), /zamčený: Úroveň 28/);
        assert.equal(await tab.getAttribute('[data-locked-avatar="🦖"]', 'title'), 'Úroveň 28');
        assert.match(await tab.getAttribute('[data-locked-avatar="🦖"]', 'class'), /grayscale/);
        assert.equal(await tab.locator('[data-pick-avatar], [data-locked-avatar]').count(), 41, '20 základních a 21 odemykaných (úroveň, turnaje, odznaky Kvízu dne, režimů a otázek)');
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        await tab.click('[data-locked-avatar="🦖"]', { force: true });
        await tab.waitForFunction(() => /T-Rex se odemkne na úrovni 28/.test(document.getElementById('settings-note').textContent));
        assert.equal(await tab.locator('[data-pick-avatar="🦖"]').count(), 0);
        await tab.click('[data-pick-avatar="🐉"]');
        await tab.click('[data-save-profile]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].avatar, '🐉');
        await tab.click('#settings-overlay [data-close]');
        await tab.waitForFunction(() => document.getElementById('btn-settings').textContent.includes('🐉'));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('starší databáze bez sloupců frame a title_pref: nic nespadne, požadavky se zopakují bez nich', async () => {
        const db = newDb();
        const calls = [];
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db, { noExtras: true, calls });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        // Pozvánka se načte i bez sloupců (zopakuje se bez nich)
        await tab.waitForSelector('#challenges-section [data-player-id="u-2"]');
        assert.equal(await tab.getAttribute('#challenges-section [data-player-id="u-2"]', 'class').then(value => /frame-/.test(value)), false);
        const selects = calls.filter(call => call.startsWith('GET /rest/v1/profiles'));
        assert.match(selects[0], /select=id,display_name,avatar,color,frame,title_pref/, 'nejdřív s novými sloupci');
        assert.match(selects[1], /select=id,display_name,avatar,color$/, 'pak bez nich');
        assert.ok(calls.some(call => /challenges\?select=[^ ]*creator:profiles!creator_id\(id,display_name,avatar,color\)/.test(call)), 'další požadavky už rovnou bez nich');
        assert.ok(!calls.some(call => call.includes('/challenges') && /frame/.test(call)));
        // Volba rámečku se uloží aspoň na zařízení, účet se nezmění a nic neselže
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="look"]');
        await tab.click('[data-frame="bronz"]');
        await tab.waitForFunction(() => document.querySelector('[data-frame="bronz"]').getAttribute('aria-pressed') === 'true');
        await tab.waitForTimeout(300);
        assert.equal(db.profiles['u-1'].frame, undefined);
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.look'))).frame, 'bronz');
        // Uložení profilu funguje dál
        await tab.click('[data-me-tab="profile"]');
        await tab.click('[data-pick-avatar="🐼"]');
        await tab.click('[data-save-profile]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].avatar, '🐼');
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
