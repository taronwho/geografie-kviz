// Test odměn v Nastavení → Profil v prohlížeči: rámečky profilu, titul u jména a postavičky (zamčené, barvy částí, staré emoji), s falešným Supabase v paměti.
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
    await tab.click('[data-me-tab="profile"]');
    await tab.waitForSelector('[data-frame="bronz"]');
};

test('odměny v Profilu: rámečky, titul a postavičky', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
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

        // Řada rámečků z katalogu (devět základních, za sérii dní, ligové sezóny, Sběratelský za album sbírky, obrázkové); zamčené jsou šedé
        // s podmínkou v popisku. Rámečky Sezóny Mudrlanta (exclusive) jsou v řadě, jen když je hráč má
        assert.equal(await tab.locator('[data-frame]').count(), await tab.evaluate(() => window.MudrlantLook.FRAMES.filter(item => !item.exclusive).length));
        assert.ok(await tab.locator('[data-frame]').count() >= 10);
        assert.equal(await tab.locator('[data-frame^="sezona-"]').count(), 0);
        assert.match(await tab.getAttribute('[data-frame="vecny-ohen"]', 'title'), /Věčný oheň: Odznak: Celý rok/);
        assert.match(await tab.getAttribute('[data-frame="sberatel"]', 'aria-label'), /Sběratelský: Odznak: Legenda sbírky \(zamčeno\)/);
        assert.match(await tab.getAttribute('[data-frame="liga-mistr"]', 'aria-label'), /Mistrovská sezóna: Ligová sezóna: vrchol Mistr \(zamčeno\)/);
        assert.equal(await tab.getAttribute('[data-frame="zadny"]', 'aria-pressed'), 'true');
        assert.match(await tab.getAttribute('[data-frame="zlato"]', 'aria-label'), /Zlatý: Úroveň 25 \(zamčeno\)/);
        assert.match(await tab.getAttribute('[data-frame="plamen"]', 'title'), /Odznak: .+/);
        assert.match(await tab.getAttribute('[data-frame="zlato"]', 'class'), /grayscale/);
        assert.doesNotMatch(await tab.getAttribute('[data-frame="vavrin"]', 'class'), /grayscale/, 'vavřín je odemčený odznakem Vítěz');
        assert.equal(await tab.locator('[data-frame="bronz"] .frame-bronz').count(), 1, 'náhled obrázku v rámečku');
        // Řada i titul se vejdou do okna bez posouvání
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');

        // Zamčený: nic se nevybere ani neuloží, ukáže se, jak se odemkne. Posunutá řada po klepnutí neskočí na začátek
        const stripLeft = await tab.$eval('[data-frame="zlato"]', el => { const strip = el.closest('.overflow-x-auto'); strip.scrollLeft = 120; return strip.scrollLeft; });
        assert.ok(stripLeft > 0, 'řada rámečků jde posunout do strany');
        await tab.$eval('[data-frame="zlato"]', el => el.click());
        await tab.waitForFunction(() => /Zlatý: Úroveň 25/.test(document.querySelector('[data-look="frames"] p').textContent));
        assert.equal(await tab.$eval('[data-frame="zlato"]', el => el.closest('.overflow-x-auto').scrollLeft), stripLeft, 'řada zůstane posunutá');
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

    // Obrázkové rámečky (look.js ART_FRAMES): prsten z obrázku icons/frames/<id>.webp, dvakrát širší než obrázek hráče (díra = obrázek)
    await t.test('obrázkové rámečky: zamčené s podmínkou, odemčený se nasadí jako prsten z obrázku kolem obrázku hráče', async () => {
        const db = newDb();
        db.profiles['u-2'].frame = 'galaxie';
        // Úroveň 40 (Ohnivý prstenec od 37), odznak Hromovládce (Bleskový prstenec) a z truhly vzácné Růže a trny
        const { context, tab, log } = await setup(browser, { ...login('tok-u1', { level: 40, badges: { vitez: '2026-10-01', 'bleskovka-20': '2026-10-02' } }), 'mudrlant.rewards': JSON.stringify({ gifts: { frames: ['ruze'] } }) });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await openLook(tab);
        const art = await tab.evaluate(() => window.MudrlantLook.ART_FRAMES.map(item => item.id));
        assert.equal(art.length, 10);
        for (const id of art) assert.equal(await tab.locator(`[data-frame="${id}"] .frame-art.frame-${id}`).count(), 1, `náhled ${id}`);
        const locked = async (id) => /grayscale/.test(await tab.getAttribute(`[data-frame="${id}"]`, 'class'));
        assert.deepEqual(await Promise.all(['ohen', 'blesk', 'ruze', 'more', 'led', 'duha-mracky', 'kralovsky-vavrin'].map(locked)), [false, false, false, true, true, true, true]);
        assert.match(await tab.getAttribute('[data-frame="more"]', 'aria-label'), /Mořská vlna: Úroveň 49 \(zamčeno\)/);
        assert.match(await tab.getAttribute('[data-frame="led"]', 'aria-label'), /Ledová koruna: Odznak: Nesmrtelný \(zamčeno\)/);
        assert.match(await tab.getAttribute('[data-frame="duha-mracky"]', 'aria-label'), /Duha s mráčky: Vzácný dárek z Truhly Mudrlanta \(zamčeno\)/);
        await tab.click('[data-frame="duha-mracky"]');
        await tab.waitForFunction(() => /Duha s mráčky: Vzácný dárek z Truhly Mudrlanta/.test(document.querySelector('[data-look="frames"] p').textContent));
        // Náhled v dlaždici: menší obrázek, ať se celý prsten (i s ozdobami) vejde do dlaždice
        const tile = await tab.evaluate(() => {
            const button = document.querySelector('[data-frame="drak"]').getBoundingClientRect();
            const avatar = document.querySelector('[data-frame="drak"] .frame-art').getBoundingClientRect();
            return { button: [button.left, button.top, button.right, button.bottom], ring: [avatar.left - avatar.width / 2, avatar.top - avatar.height / 2, avatar.right + avatar.width / 2, avatar.bottom + avatar.height / 2] };
        });
        assert.ok(tile.ring[0] >= tile.button[0] - 0.5 && tile.ring[1] >= tile.button[1] - 0.5 && tile.ring[2] <= tile.button[2] + 0.5 && tile.ring[3] <= tile.button[3] + 0.5, `prsten v dlaždici: ${JSON.stringify(tile)}`);
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');

        await tab.click('[data-frame="ohen"]');
        await until(() => db.profiles['u-1'].frame === 'ohen', 'rámeček v účtu');
        await tab.waitForFunction(() => /frame-ohen/.test(document.querySelector('#btn-settings span').className));
        // Prsten: ::after o polovinu obrázku hráče na každou stranu, obrázek z icons/frames; kroužek z přechodu (::before) není.
        // Místo v rozložení stránky zůstane (44 px), obrázek i s prstenem se zmenší (scale), ať prsten nepřekryje sousedy
        const geometry = await tab.evaluate(() => {
            const avatar = document.querySelector('#btn-settings span.frame');
            const after = getComputedStyle(avatar, '::after');
            return { w: avatar.offsetWidth, h: avatar.offsetHeight, shown: avatar.getBoundingClientRect().width, scale: getComputedStyle(avatar).scale, cls: avatar.className, image: after.backgroundImage, top: after.top, left: after.left, right: after.right, bottom: after.bottom, before: getComputedStyle(avatar, '::before').content };
        });
        assert.equal(geometry.w, 44);
        assert.equal(geometry.h, 44);
        assert.equal(geometry.scale, '0.8');
        assert.ok(Math.abs(geometry.shown - 44 * 0.8) < 0.5, `zmenšený obrázek ${geometry.shown}`);
        assert.match(geometry.cls, /\bframe frame-art frame-ohen\b/);
        assert.match(geometry.image, /icons\/frames\/ohen\.webp/);
        assert.deepEqual([geometry.top, geometry.left, geometry.right, geometry.bottom], ['-22px', '-22px', '-22px', '-22px']);
        assert.equal(geometry.before, 'none');
        // Obrázek prstenu se opravdu načte (256 × 256)
        assert.equal(await tab.evaluate(() => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalWidth); image.onerror = () => resolve(0); image.src = 'icons/frames/ohen.webp'; })), 256);
        if (process.env.SCREENSHOT_DIR) await tab.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'ramecky-vyber.png') });
        // Vzácný rámeček z truhly jde nasadit taky
        await tab.click('[data-frame="ruze"]');
        await until(() => db.profiles['u-1'].frame === 'ruze', 'vzácný rámeček v účtu');

        // Cizí hráč s obrázkovým rámečkem (pozvánka do výzvy ve Více hráčích) a můj obrázek v záhlaví
        await tab.click('#settings-overlay [data-close]');
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('#challenges-section [data-player-id="u-2"]');
        assert.match(await tab.getAttribute('#challenges-section [data-player-id="u-2"]', 'class'), /frame-art frame-galaxie/);
        assert.match(await tab.getAttribute('#btn-settings span', 'class'), /frame-art frame-ruze/);
        if (process.env.SCREENSHOT_DIR) await tab.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'ramecky-vice-hracu.png') });
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    // Rámečky Sezóny Mudrlanta (look.js SEASON_FRAMES a SEASON_MID_FRAMES): obrázkové prsteny, v řadě jen ty, které hráč má
    await t.test('rámečky sezóny: v řadě jen vlastněné, obrázkový prsten, nasazení do účtu, cizí hráč s nimi', async () => {
        const db = newDb();
        db.profiles['u-2'].frame = 'sezona-11';
        const owned = ['sezona-11-b', 'sezona-02', 'sezona-11'];
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.rewards': JSON.stringify({ gifts: { frames: owned } }) });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await openLook(tab);
        // Po měsících (Únorový, Listopadový, Listopadové lampiony), každý jako obrázkový prsten; nevlastněné sezónní v řadě nejsou
        assert.deepEqual(await tab.$$eval('[data-frame^="sezona-"]', nodes => nodes.map(node => node.dataset.frame)), ['sezona-02', 'sezona-11', 'sezona-11-b']);
        for (const id of owned) {
            assert.equal(await tab.locator(`[data-frame="${id}"] .frame-art.frame-${id}`).count(), 1, `náhled ${id}`);
            assert.doesNotMatch(await tab.getAttribute(`[data-frame="${id}"]`, 'class'), /grayscale/, `${id} odemčený`);
        }
        assert.equal(await tab.getAttribute('[data-frame="sezona-11-b"]', 'aria-label'), 'Listopadové lampiony');
        assert.equal(await tab.getAttribute('[data-frame="sezona-02"]', 'aria-label'), 'Únorový');
        // Prsten s ozdobami (Únorový sahá nejdál) se vejde do dlaždice
        const tile = await tab.evaluate(() => {
            const button = document.querySelector('[data-frame="sezona-02"]').getBoundingClientRect();
            const avatar = document.querySelector('[data-frame="sezona-02"] .frame-art').getBoundingClientRect();
            return { button: [button.left, button.top, button.right, button.bottom], ring: [avatar.left - avatar.width / 2, avatar.top - avatar.height / 2, avatar.right + avatar.width / 2, avatar.bottom + avatar.height / 2] };
        });
        assert.ok(tile.ring[0] >= tile.button[0] - 0.5 && tile.ring[1] >= tile.button[1] - 0.5 && tile.ring[2] <= tile.button[2] + 0.5 && tile.ring[3] <= tile.button[3] + 0.5, `prsten v dlaždici: ${JSON.stringify(tile)}`);
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        await tab.click('[data-frame="sezona-11-b"]');
        await until(() => db.profiles['u-1'].frame === 'sezona-11-b', 'rámeček sezóny v účtu');
        await tab.waitForFunction(() => /frame-sezona-11-b/.test(document.querySelector('#btn-settings span').className));
        assert.match(await tab.textContent('[data-look="frames"] p'), /Listopadové lampiony/);
        const ring = await tab.evaluate(() => { const avatar = document.querySelector('#btn-settings span.frame'); return { cls: avatar.className, image: getComputedStyle(avatar, '::after').backgroundImage, before: getComputedStyle(avatar, '::before').content }; });
        assert.match(ring.cls, /\bframe frame-art frame-sezona-11-b\b/);
        assert.match(ring.image, /icons\/frames\/sezona-11-b\.webp/);
        assert.equal(ring.before, 'none', 'žádný kroužek z přechodu');
        assert.equal(await tab.evaluate(() => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalWidth); image.onerror = () => resolve(0); image.src = 'icons/frames/sezona-11-b.webp'; })), 256);
        if (process.env.SCREENSHOT_DIR) await tab.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'ramecky-sezona.png') });
        // Cizí hráč se zdobnějším rámečkem listopadu (ze Sezónní truhly)
        await tab.click('#settings-overlay [data-close]');
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('#challenges-section [data-player-id="u-2"]');
        assert.match(await tab.getAttribute('#challenges-section [data-player-id="u-2"]', 'class'), /frame-art frame-sezona-11(?!-)/);
        assert.match(await tab.getAttribute('#btn-settings span', 'class'), /frame-art frame-sezona-11-b/);
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
        await tab.click('#dialog-overlay [data-close]');
        // Odměny Sezóny Mudrlanta: rámeček měsíce a titul Šampion sezóny (s korunkou) vidí i ostatní
        db.profiles['u-2'].title_pref = 'sampion-sezony';
        db.profiles['u-2'].frame = 'sezona-11';
        await tab.click('#challenges-section [data-player-id="u-2"]');
        await tab.waitForSelector('#dialog-overlay [data-own-title]');
        assert.match(await tab.textContent('#dialog-overlay [data-own-title]'), /Šampion sezóny/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('postavičky: skupiny obrázků, zamčené šedé s úrovní, barva části se ukáže vrstvou a uloží', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('#profile-name');
        // Otevřená je skupina s vybraným obrázkem (liška = Zvířátka, 20 základních emoji zdarma)
        assert.deepEqual(await tab.$$eval('[data-pic-group]', nodes => nodes.map(node => [node.textContent.trim(), node.getAttribute('aria-selected')])), [['Mudrlant', 'false'], ['Postavičky', 'false'], ['Legendy', 'false'], ['Zvířátka', 'true']]);
        assert.equal(await tab.locator('[data-avatar-strip] > button').count(), 20);
        assert.equal(await tab.getAttribute('[data-pick-avatar="🦊"]', 'aria-pressed'), 'true');
        await tab.click('[data-pic-group="postavicky"]');
        await tab.waitForSelector('[data-pic-group="postavicky"][aria-selected="true"]');
        // Úroveň 20: Knihomol (3), Axolotl (8), Kaktus (13) a Drak čajník (20) jsou odemčené, Mamut DJ (28) ne; za odznaky (turnaje) zamčené s medailí
        assert.equal(await tab.locator('[data-pick-avatar], [data-locked-avatar]').count(), 21, '21 postaviček za úrovně a odznaky (legendární mají vlastní skupinu)');
        assert.equal(await tab.locator('[data-avatar-strip] [data-locked-avatar="albatr"], [data-avatar-strip] [data-pick-avatar="albatr"]').count(), 0);
        assert.deepEqual(await tab.$$eval('[data-pick-avatar]', nodes => nodes.map(node => node.dataset.pickAvatar)), ['cervik', 'axolot', 'kaktus', 'drak']);
        assert.equal(await tab.getAttribute('[data-locked-avatar="mamut"]', 'aria-label'), 'Mamut DJ (zamčeno): Úroveň 28');
        assert.equal(await tab.getAttribute('[data-locked-avatar="mamut"]', 'title'), 'Mamut DJ: Úroveň 28');
        assert.match(await tab.textContent('[data-locked-avatar="mamut"]'), /úr\.\s28/);
        assert.equal(await tab.locator('[data-locked-avatar="mamut"] .grayscale img[src="icons/avatars/mamut.webp"]').count(), 1);
        assert.match(await tab.getAttribute('[data-locked-avatar="krecek"]', 'title'), /^Křeček boxer: Odznak: /);
        assert.equal(await tab.locator('[data-locked-avatar="krecek"] svg, [data-locked-avatar="krecek"] [data-lucide="medal"]').count(), 1, 'za odznak medaile místo úrovně');
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        await tab.waitForFunction(() => [...document.querySelectorAll('[data-avatar-strip] img')].every(img => img.complete && img.naturalWidth > 0));
        // Zamčená se nevybere, jen řekne, jak se odemkne
        await tab.click('[data-locked-avatar="mamut"]', { force: true });
        await tab.waitForFunction(() => /Mamut DJ se odemkne na úrovni 28/.test(document.getElementById('settings-note').textContent));
        assert.equal(await tab.locator('[data-pick-avatar="mamut"]').count(), 0);
        // Odemčená: čipy barev (pozadí a dvě části), krunýř nabízí jen barvy dost odlišné od původní
        await tab.click('[data-pick-avatar="drak"]');
        await tab.waitForSelector('[data-pick-avatar="drak"][aria-pressed="true"]');
        assert.deepEqual(await tab.$$eval('[data-color-target]', nodes => nodes.map(node => node.textContent.trim())), ['Pozadí', 'Dráček', 'Krunýř']);
        assert.equal(await tab.locator('[data-pick-color="sky"]').count(), 1, 'nejdřív barvy pozadí');
        await tab.click('[data-color-target="2"]');
        assert.deepEqual(await tab.$$eval('[data-pick-part]', nodes => nodes.map(node => node.dataset.pickPart)), ['2:0', '2:3', '2:4', '2:5', '2:6', '2:7', '2:8', '2:9']);
        assert.equal(await tab.getAttribute('[data-pick-part="2:0"]', 'aria-pressed'), 'true');
        await tab.click('[data-pick-part="2:6"]');
        await tab.waitForSelector('[data-pick-part="2:6"][aria-pressed="true"]');
        // Náhled v hlavičce i na dlaždici: základní obrázek a vrstva modrého krunýře v jedné buňce
        const header = await tab.$$eval('#settings-overlay [data-avatar-art] img', nodes => nodes.slice(0, 2).map(node => node.getAttribute('src')));
        assert.deepEqual(header, ['icons/avatars/drak.webp', 'icons/avatars/drak-26.webp']);
        assert.equal(await tab.locator('[data-pick-avatar="drak"] img[src="icons/avatars/drak-26.webp"]').count(), 1);
        const stack = await tab.evaluate(() => { const [a, b] = [...document.querySelector('#settings-overlay [data-avatar-art]').children].map(img => img.getBoundingClientRect()); return [a.x === b.x && a.y === b.y && a.width === b.width, a.width]; });
        assert.equal(stack[0], true, 'vrstva leží přesně na obrázku');
        // Dráček v červené, pak zpět na původní
        await tab.click('[data-color-target="1"]');
        await tab.click('[data-pick-part="1:1"]');
        await tab.waitForSelector('#settings-overlay [data-avatar-art] img[src="icons/avatars/drak-11.webp"]');
        await tab.click('[data-pick-part="1:0"]');
        await tab.waitForFunction(() => !document.querySelector('#settings-overlay [data-avatar-art] img[src="icons/avatars/drak-11.webp"]'));
        // Jiná postavička a zpět: drak má pořád modrý krunýř (barvy se pamatují pro každou postavičku zvlášť)
        await tab.click('[data-pick-avatar="kaktus"]');
        await tab.waitForSelector('#settings-overlay [data-avatar-art="kaktus"]');
        assert.deepEqual(await tab.evaluate(() => [...document.querySelector('#settings-overlay [data-avatar-art]').children].map(img => img.getAttribute('src'))), ['icons/avatars/kaktus.webp'], 'kaktus bez nastavených barev v původních');
        await tab.click('[data-pick-avatar="drak"]');
        await tab.waitForSelector('#settings-overlay [data-avatar-art="drak"] img[src="icons/avatars/drak-26.webp"]');
        // Nic se neuloží před Uložit; pak se zapíše kód postavičky s barvami (dráček původní, krunýř modrý)
        assert.equal(db.profiles['u-1'].avatar, '🦊');
        await tab.click('[data-save-profile]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].avatar, 'drak06');
        await tab.click('#settings-overlay [data-close]');
        await tab.waitForSelector('#btn-settings [data-avatar-art="drak"] img[src="icons/avatars/drak-26.webp"]');
        assert.equal(await tab.evaluate(() => document.getElementById('btn-settings').textContent.trim()), '', 'v tlačítku je obrázek, ne text');
        await tab.waitForFunction(() => [...document.querySelectorAll('#btn-settings img')].every(img => img.complete && img.naturalWidth > 0));
        // Po novém otevření je Profil zase ve skupině Postavičky s vybraným drakem
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-pic-group="postavicky"][aria-selected="true"]');
        assert.equal(await tab.getAttribute('[data-pick-avatar="drak"]', 'aria-pressed'), 'true');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('staré emoji odměny: ukáže se jako postavička, která ho nahradila, a uložením se zapíše její id', async () => {
        const db = newDb();
        db.profiles['u-1'].avatar = '🐉';
        db.profiles['u-2'].avatar = '🦁';
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('#btn-settings [data-avatar-art="drak"]');
        // Cizí hráč se starým lvem (úroveň, kterou já nemám) se ukáže jako Galaktický lev
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('#challenges-section [data-player-id="u-2"] [data-avatar-art="lev"] img[src="icons/avatars/lev.webp"]');
        assert.doesNotMatch(await tab.textContent('#challenges-section [data-player-id="u-2"]'), /🦁/);
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('[data-pic-group="postavicky"][aria-selected="true"]');
        assert.equal(await tab.getAttribute('[data-pick-avatar="drak"]', 'aria-pressed'), 'true');
        await tab.click('[data-save-profile]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].avatar, 'drak');
        assert.deepEqual(log.errors, []);
        await context.close();
    });
    await t.test('sezónní postavička: ve výběru jen vlastněná ze Sezónní truhly, uloží se s barvami, cizí profil ji ukáže vždy', async () => {
        const db = newDb();
        // Petr má listopadový Hrnek čaje s fialovým hrnkem; Jana ho nemá, ze Sezónní truhly má jen říjnového Papírového draka
        db.profiles['u-2'].avatar = 'caj7';
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.rewards': JSON.stringify({ gifts: { avatars: ['drakpa'] } }) });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('#challenges-section [data-player-id="u-2"] [data-avatar-art="caj"] img[src="icons/avatars/caj-17.webp"]');
        assert.equal(await tab.locator('#challenges-section [data-player-id="u-2"] [data-avatar-art="caj"] img[src="icons/avatars/caj.webp"]').count(), 1);
        await tab.click('#challenges-section [data-player-id="u-2"]');
        await tab.waitForSelector('#dialog-overlay [data-avatar-art="caj"] img[src="icons/avatars/caj-17.webp"]');
        await tab.click('#dialog-overlay [data-close]');
        // Výběr: 21 postaviček za úrovně a odznaky a jen vlastněná sezónní (cizí Hrnek čaje ani jiné měsíce tu nejsou, ani zamčené)
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.click('[data-pic-group="postavicky"]');
        await tab.waitForSelector('[data-pick-avatar="drakpa"]');
        assert.equal(await tab.locator('[data-pick-avatar], [data-locked-avatar]').count(), 22);
        assert.equal(await tab.locator('[data-pick-avatar="caj"], [data-locked-avatar="caj"], [data-locked-avatar="drakpa"], [data-locked-avatar="ramp"]').count(), 0);
        assert.equal(await tab.getAttribute('[data-pick-avatar="drakpa"]', 'title'), 'Papírový drak');
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        await tab.click('[data-pick-avatar="drakpa"]');
        await tab.waitForSelector('[data-pick-avatar="drakpa"][aria-pressed="true"]');
        assert.deepEqual(await tab.$$eval('[data-color-target]', nodes => nodes.map(node => node.textContent.trim())), ['Pozadí', 'Drak', 'Mašličky']);
        await tab.click('[data-color-target="1"]');
        assert.deepEqual(await tab.$$eval('[data-pick-part]', nodes => nodes.map(node => node.dataset.pickPart)), ['1:0', '1:4', '1:5', '1:6', '1:7', '1:8', '1:9']);
        await tab.click('[data-pick-part="1:6"]');
        await tab.waitForSelector('#settings-overlay [data-avatar-art="drakpa"] img[src="icons/avatars/drakpa-16.webp"]');
        await tab.click('[data-save-profile]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].avatar, 'drakpa6');
        await tab.click('#settings-overlay [data-close]');
        await tab.waitForSelector('#btn-settings [data-avatar-art="drakpa"] img[src="icons/avatars/drakpa-16.webp"]');
        await tab.waitForFunction(() => [...document.querySelectorAll('#btn-settings img')].every(img => img.complete && img.naturalWidth > 0));
        // Na zařízení, kde dárky ze sezóny ještě nejsou (jiný telefon před synchronizací), uložený obrázek ve výběru nezmizí
        assert.deepEqual(db.profiles['u-1'].rewards && db.profiles['u-1'].rewards.gifts.avatars, ['drakpa'], 'dárek ze sezóny je i v účtu');
        delete db.profiles['u-1'].rewards;
        await tab.evaluate(() => localStorage.setItem('mudrlant.rewards', JSON.stringify({})));
        await tab.reload();
        await waitForHome(tab);
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('[data-pic-group="postavicky"][aria-selected="true"]');
        assert.equal(await tab.getAttribute('[data-pick-avatar="drakpa"]', 'aria-pressed'), 'true');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
    await t.test('všech 12 sezónních postaviček: mřížka se posouvá uvnitř (půl dalšího řádku), vybraná je vidět, okno bez posouvání', async () => {
        const db = newDb();
        db.profiles['u-1'].avatar = 'pernik2';
        const seasonal = ['ramp', 'kobliz', 'snezen', 'kapka', 'pampel', 'vysved', 'meloun', 'hvezda', 'aktovk', 'drakpa', 'caj', 'pernik'];
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.rewards': JSON.stringify({ gifts: { avatars: seasonal } }) });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('#btn-settings [data-avatar-art="pernik"] img[src="icons/avatars/pernik-12.webp"]');
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('[data-pic-group="postavicky"][aria-selected="true"]');
        assert.equal(await tab.locator('[data-pick-avatar], [data-locked-avatar]').count(), 33);
        assert.deepEqual(await tab.$$eval('[data-pick-avatar]', nodes => nodes.slice(-12).map(node => node.dataset.pickAvatar)), seasonal, 'sezónní po řadě měsíců za ostatními');
        const box = () => tab.evaluate(() => {
            const strip = document.querySelector('[data-avatar-strip]');
            const s = strip.getBoundingClientRect();
            const on = strip.querySelector('[aria-pressed="true"]').getBoundingClientRect();
            const panel = document.querySelector('#settings-overlay > div');
            return { scrolls: strip.scrollHeight > strip.clientHeight, top: strip.scrollTop, height: s.height, visible: on.top >= s.top - 1 && on.bottom <= s.bottom + 1, window: panel.scrollHeight <= panel.clientHeight };
        });
        let state = await box();
        assert.equal(state.scrolls, true, 'víc než tři řádky se posouvají v mřížce');
        assert.ok(state.height > 3 * 42 && state.height < 4 * 42, `vidět je tři a půl řádku (${state.height} px)`);
        assert.equal(state.visible, true, 'vybraný Perníček je vidět');
        assert.ok(state.top > 0);
        assert.equal(state.window, true, 'okno Nastavení bez posouvání');
        // Výběr barvy překreslí okno: mřížka zůstane posunutá a Perníček vidět
        await tab.click('[data-color-target="1"]');
        await tab.click('[data-pick-part="1:6"]');
        await tab.waitForSelector('#settings-overlay [data-avatar-art="pernik"] img[src="icons/avatars/pernik-16.webp"]');
        assert.equal((await box()).top, state.top);
        // Jiná postavička v posunuté mřížce: posun zůstane
        await tab.click('[data-pick-avatar="caj"]');
        await tab.waitForSelector('[data-pick-avatar="caj"][aria-pressed="true"]');
        state = await box();
        assert.equal(state.visible, true);
        assert.ok(state.top > 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
    await t.test('legendární postavičky: skupina Legendy, zamčené s čepicí absolventa, za diplom odemčená se zlatým lemem a uloží se', async () => {
        const db = newDb();
        // Diplom Zeměpisu (plné mistrovství) odemyká Albatrose mořeplavce, ostatní legendární jsou zamčené
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.rewards': JSON.stringify({ v: 1, diplomas: { zemepis: '2026-10-01' } }) });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('#profile-name');
        await tab.click('[data-pic-group="legendy"]');
        await tab.waitForSelector('[data-pic-group="legendy"][aria-selected="true"]');
        assert.equal(await tab.locator('[data-avatar-strip] [data-pick-avatar], [data-avatar-strip] [data-locked-avatar]').count(), 14);
        assert.deepEqual(await tab.$$eval('[data-avatar-strip] [data-pick-avatar]', nodes => nodes.map(node => [node.dataset.pickAvatar, node.hasAttribute('data-legendary')])), [['albatr', true]]);
        assert.match(await tab.getAttribute('[data-pick-avatar="albatr"]', 'class'), /border-gold-300/, 'odemčená legendární má zlatý lem');
        assert.equal(await tab.getAttribute('[data-locked-avatar="klokan"]', 'aria-label'), 'Klokan šampion (legendární) (zamčeno): Diplom: Sport');
        assert.equal(await tab.getAttribute('[data-locked-avatar="klokan"]', 'title'), 'Klokan šampion: Diplom: Sport');
        assert.equal(await tab.locator('[data-locked-avatar="klokan"] svg, [data-locked-avatar="klokan"] [data-lucide="graduation-cap"]').count(), 1, 'za diplom čepice absolventa');
        assert.match(await tab.textContent('[data-legend-note]'), /Legendární postavička za diplom tématu/);
        assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; }), true, 'okno bez posouvání');
        // Zamčená se nevybere, jen řekne, jakým diplomem se odemkne
        await tab.click('[data-locked-avatar="klokan"]', { force: true });
        await tab.waitForFunction(() => /Klokan šampion se odemkne diplomem „Mistr sportu“ \(plné mistrovství tématu Sport\)\./.test(document.getElementById('settings-note').textContent));
        // Odemčená: barvy obou částí jako u ostatních postaviček, uloží se jako krátký kód
        await tab.click('[data-pick-avatar="albatr"]');
        await tab.waitForSelector('[data-pick-avatar="albatr"][aria-pressed="true"]');
        assert.deepEqual(await tab.$$eval('[data-color-target]', nodes => nodes.map(node => node.textContent.trim())), ['Pozadí', 'Uniforma', 'Moře a nebe']);
        await tab.click('[data-color-target="2"]');
        await tab.click('[data-pick-part="2:4"]');
        await tab.waitForSelector('#settings-overlay [data-avatar-art="albatr"] img[src="icons/avatars/albatr-24.webp"]');
        await tab.click('[data-save-profile]');
        await tab.waitForFunction(() => /Uloženo/.test(document.getElementById('settings-overlay').textContent));
        assert.equal(db.profiles['u-1'].avatar, 'albatr04');
        // Po novém otevření je Profil ve skupině Legendy
        await tab.click('#settings-overlay [data-close]');
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-pic-group="legendy"][aria-selected="true"]');
        assert.equal(await tab.getAttribute('[data-pick-avatar="albatr"]', 'aria-pressed'), 'true');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
    await t.test('vývojářské „Odemknout úplně vše“: sezónní, legendární i vzácné věci jsou k výběru, Vrátit můj postup vše vrátí', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.dev': '1' });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        const before = await tab.evaluate(() => localStorage.getItem('mudrlant.progress'));
        await tab.click('#btn-settings');
        await tab.click('[data-dev="all"]');
        await tab.waitForFunction(() => /Hotovo: Odemknout úplně vše/.test(document.getElementById('settings-overlay').textContent));
        await tab.click('[data-me-tab="profile"]');
        // Sezónní a vzácné rámečky odemčené, sezónní postavičky ve výběru, legendární bez zámku
        await tab.waitForSelector('[data-frame="sezona-01"]');
        assert.doesNotMatch(await tab.getAttribute('[data-frame="ruze"]', 'class'), /grayscale/);
        await tab.click('[data-pic-group="postavicky"]');
        await tab.waitForSelector('[data-pick-avatar="ramp"]');
        await tab.click('[data-pic-group="legendy"]');
        await tab.waitForSelector('[data-pick-avatar="albatr"]');
        assert.equal(await tab.locator('[data-locked-avatar]').count(), 0);
        // Po novém spuštění platí dál
        await tab.reload();
        await waitForHome(tab);
        assert.equal(await tab.evaluate(() => window.MudrlantLook.devUnlockAll()), true);
        // Vrátit můj postup: postup i zámky jako dřív
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="game"]');
        await tab.click('[data-dev="restore"]');
        await tab.waitForFunction(() => !window.MudrlantLook.devUnlockAll());
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.progress')), before);
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('[data-frame="ruze"]');
        assert.match(await tab.getAttribute('[data-frame="ruze"]', 'class'), /grayscale/);
        assert.equal(await tab.locator('[data-frame="sezona-01"]').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
    await t.test('vývojářské truhly: Truhla Mudrlanta a všech 20 stupňů sezóny na zkoušku, Vrátit můj postup vrátí odměny', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.dev': '1' });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        const before = await tab.evaluate(() => localStorage.getItem('mudrlant.rewards'));
        await tab.click('#btn-settings');
        await tab.click('[data-dev="chest"]');
        await tab.waitForSelector('#chest-overlay [data-chest-go]');
        await tab.click('#chest-overlay [data-chest-go]');
        await tab.waitForSelector('#chest-overlay [data-chest-reveal]');
        await tab.click('#chest-overlay [data-chest-close]');
        // Sezóna: okno s cestou, všechny stupně čekají na vyzvednutí
        await tab.click('#btn-settings');
        await tab.click('[data-dev="season"]');
        await tab.waitForSelector('#dialog-overlay [data-season-tier="20"][data-state="ready"]');
        assert.equal(await tab.locator('#dialog-overlay [data-season-tier][data-state="ready"]').count(), 20);
        await tab.click('#dialog-overlay [data-season-tier="20"]');
        await tab.waitForSelector('#season-overlay [data-season-go]');
        await tab.click('#season-overlay [data-season-go]');
        await tab.waitForSelector('#season-overlay [data-season-reveal]');
        await tab.click('#season-overlay [data-season-x]');
        await tab.waitForSelector('#season-overlay', { state: 'detached' });
        await tab.keyboard.press('Escape');
        assert.equal(db.profiles['u-1'].rewards, undefined, 'zkušební odměny se do účtu nezapíšou');
        // Vrátit můj postup: odměny jako předtím
        await tab.click('#btn-settings');
        await tab.click('[data-dev="restore"]');
        await tab.waitForFunction((value) => localStorage.getItem('mudrlant.rewards') === value, before);
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.dev.seasonXp')), null);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
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
        await tab.click('[data-me-tab="profile"]');
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
