// Ligové sezóny a vitrína v profilu (schéma 18) v prohlížeči s falešným Supabase v paměti (jako tests/e2e-rating.test.js):
// pruh sezóny pod kartou ligy, okno Ligové sezóny (vrchol měsíce, dny do konce, další odměna, rámečky, minulé sezóny), oslava nového rámečku
// jednou (i po obnovení stránky ne znovu), rámeček odemčený i bez připojení, výběr trofejí do vitríny (sezóna, odznak, diplom), vitrína
// v Profilu hráče u druhého hráče, náhled vitríny v Nastavení → Profil a starší databáze bez sezón a vitríny (nic se neukáže, žádné chyby).
// SCREENSHOT_DIR=… uloží snímky 390×780 ve světlém i tmavém režimu. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../quiz-core.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const NOW = '2026-11-11T10:00:00Z';
const SHOWCASE = /^(?:b:[a-z0-9-]{1,40}|d:[a-z0-9-]{1,24}|l:\d{4}-(?:0[1-9]|1[0-2]):(?:bronz|stribro|zlato|platina|diamant|mistr))$/;

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};

const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', frame: null, title_pref: null, owl: null, xp: 100, badges: [], rating: 1200, rated_games: 5, showcase: [], ...extra });

// Sezóny „spočítané serverem“: listopad běží (Zlato), říjen Diamant, září Zlato, červenec Platina; nejlepší skončená = říjen (Diamant)
const SEASONS_U1 = {
    month: '2026-11',
    seasons: [
        { month: '2026-11', league: 'zlato', peak: 1380, games: 7, finished: false },
        { month: '2026-10', league: 'diamant', peak: 1580, games: 23, finished: true },
        { month: '2026-09', league: 'zlato', peak: 1300, games: 9, finished: true },
        { month: '2026-07', league: 'platina', peak: 1450, games: 12, finished: true }
    ],
    best: { month: '2026-10', league: 'diamant', peak: 1580 }
};
const SEASONS_U2 = { month: '2026-11', seasons: [{ month: '2026-10', league: 'mistr', peak: 1720, games: 40, finished: true }], best: { month: '2026-10', league: 'mistr', peak: 1720 } };

// missing = databáze schématu 17 (funkce league_seasons 404, sloupec showcase 400)
const newDb = ({ missing = false } = {}) => ({
    missing, patches: [],
    profiles: {
        'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald', xp: 26000, rating: 1380, rated_games: 40, badges: ['vitez', 'serie-60', 'vyhry-25'] }),
        'u-2': player('u-2', 'Petr Svoboda', '🐼', { xp: 14200, rating: 1520, rated_games: 60, badges: ['vitez', 'tema-zemepis-600'], showcase: ['l:2026-10:mistr', 'b:tema-zemepis-600', 'd:zemepis'] }),
        'u-3': player('u-3', 'Eva Mistrová', '🦉', { color: 'violet', xp: 90000, rating: 1720 })
    },
    seasons: { 'u-1': SEASONS_U1, 'u-2': SEASONS_U2 },
    weekly: []
});

const backend = async (context, db, { offline = false } = {}) => {
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
        if (url.pathname === '/rest/v1/rpc/schema_version') return json(db.missing ? 17 : 18);
        if (url.pathname === '/rest/v1/rpc/league_seasons') {
            if (offline) return route.abort('internetdisconnected');
            if (db.missing) return json({ message: 'Could not find the function public.league_seasons' }, 404);
            return json(db.seasons[(body && body.player) || me.id] || { month: '2026-11', seasons: [], best: null });
        }
        if (url.pathname === '/rest/v1/rpc/weekly_leaderboard') return json(Object.values(db.profiles).map((p, i) => ({ ...p, league: 'zlato', week_delta: 20 - i, week_wins: 1, week_games: 2 })));
        if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
        if (url.pathname === '/rest/v1/profiles') {
            if (/showcase/.test(param('select')) && db.missing) return json({ code: '42703', message: 'column profiles.showcase does not exist' }, 400);
            if (method === 'PATCH') {
                const target = db.profiles[eq('id')];
                if (!target || eq('id') !== me.id) return json([]);
                db.patches.push(body);
                if (body.showcase) {
                    if (db.missing) return json({ code: 'PGRST204', message: "Could not find the 'showcase' column" }, 400);
                    if (body.showcase.length > 3 || !body.showcase.every(item => SHOWCASE.test(item))) return json({ message: 'check constraint' }, 400);
                    // Jako check_showcase(): odznak jen z profilu, sezóna jen skutečná skončená
                    const seasons = db.seasons[me.id];
                    target.showcase = [...new Set(body.showcase)].filter(item => !item.startsWith('b:') ? !item.startsWith('l:') || seasons.seasons.some(row => row.finished && `l:${row.month}:${row.league}` === item) : target.badges.includes(item.slice(2)));
                }
                for (const key of ['frame', 'title_pref', 'xp', 'badges', 'owl']) if (key in body) target[key] = key === 'badges' ? [...new Set([...target.badges, ...body.badges])] : body[key];
                return /representation/.test(request.headers().prefer || '') ? json([profile(me.id)]) : route.fulfill({ status: 204, body: '' });
            }
            const row = db.profiles[eq('id')];
            return json(row ? [profile(eq('id'))] : []);
        }
        return json([]);
    });
};

const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, scheme = 'light' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: scheme, viewport, deviceScaleFactor: SHOTS ? 2 : 1 });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, {
        'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'),
        // sberatel-25: hráč s takovým postupem má čtvrtinu Alba sbírky dávno (oslava milníku alba by jinak předběhla oslavu rámečku sezóny)
        'mudrlant.progress': JSON.stringify({ xp: 26000, counters: { correct: 2600, answered: 3400, challengesPlayed: 120, challengeWins: 30 }, badges: { vitez: '2026-10-01', 'vyhry-5': '2026-10-02', 'vyhry-25': '2026-10-20', 'serie-60': '2026-10-21', 'sberatel-25': '2026-10-22' } }),
        'mudrlant.rewards': JSON.stringify({ v: 1, diplomas: { zemepis: '2026-10-20' }, name: 'Jana Nováková' }),
        ...storage
    });
    const tab = await context.newPage();
    tab.setDefaultTimeout(15000);
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) return route.fulfill(serveFile(url.pathname));
        if (url.hostname === 'proj.supabase.co') return route.fallback();
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
        return route.abort();
    });
    await tab.clock.setFixedTime(new Date(NOW));
    return { context, tab, log };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && content.querySelector('#home-tabs')); }, null, { timeout: 30000 });
// Snímek (jen se SCREENSHOT_DIR); oslavy odznaků z testovacích dat (První krok…) by zakryly okno, kromě snímku oslavy se odklidí
const shot = async (tab, name, scheme) => {
    if (!SHOTS) return;
    if (!/oslava/.test(name)) await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
    await tab.waitForTimeout(250);
    await tab.screenshot({ path: path.join(SHOTS, `${name}-${scheme}.png`) });
};
const fits = (tab) => tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return box.scrollHeight - box.clientHeight; });
// Čeká, až falešný server dostane změnu (bez pevného čekání)
const until = async (check, timeout = 10000) => { const end = Date.now() + timeout; while (!check()) { if (Date.now() > end) throw new Error('nedočkal se změny na serveru'); await new Promise(resolve => setTimeout(resolve, 50)); } };
const text = async (tab, selector) => (await tab.textContent(selector)).replace(/\s+/g, ' ').trim();

test('ligové sezóny a vitrína v profilu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    let chosen = null;

    for (const scheme of SHOTS ? ['light', 'dark'] : ['light']) {
        await t.test(`pruh sezóny, oslava rámečku, okno sezón a vitrína (${scheme})`, async () => {
            const db = newDb();
            const { context, tab, log } = await setup(browser, login('tok-u1'), { scheme });
            await backend(context, db);
            await tab.goto(`${ORIGIN}/`);
            await waitForHome(tab);

            // Oslava: rámeček za říjnový Diamant (nejvyšší nový), nižší rámečky v textu; nová odměna jen jednou
            await tab.waitForSelector('#celebration');
            const party = await text(tab, '#celebration');
            assert.match(party, /Nová odměna/);
            assert.match(party, /Rámeček Diamantová sezóna \(říjen 2026\) a 3 další – vyber si je v Nastavení → Profil/);
            assert.equal(await tab.locator('#celebration .frame-liga-diamant').count(), 1, 'oslava ukazuje můj obrázek v novém rámečku');
            await shot(tab, 'sezona-oslava', scheme);
            await tab.click('#celebration');
            await tab.waitForFunction(() => !document.getElementById('celebration'));
            // Další oslavy (odznaky z testovacích počítadel) by na snímcích zakrývaly okna
            if (SHOTS) await tab.evaluate(() => new MutationObserver(() => { const card = document.getElementById('celebration'); if (card) card.remove(); }).observe(document.body, { childList: true }));

            // Pruh pod kartou ligy: sezóna listopad, 20 dní do konce (11. 11.), další odměna Mistr
            await tab.waitForSelector('#league-card [data-league-strip]');
            assert.match(await text(tab, '#league-card [data-league-strip]'), /Ligová sezóna listopad · ještě 20 dní ?Dosáhni Mistra a získáš rámeček$/);
            assert.equal(await tab.locator('#league-card [data-league-strip] .frame-liga-mistr').count(), 1, 'náhled rámečku další odměny');
            assert.ok(await tab.evaluate(() => document.getElementById('league-card').getBoundingClientRect().height) < 120, 'karta zůstává kompaktní');
            await shot(tab, 'sezona-karta', scheme);

            // Okno Ligové sezóny: běžící sezóna, další odměna, rámečky (3 získané, Mistr zamčený), minulé sezóny
            await tab.click('#league-card [data-league-strip]');
            await tab.waitForSelector('[data-league-seasons]');
            assert.match(await text(tab, '[data-season-now]'), /Ligová sezóna listopad 2026 Nejvýš zatím: Zlato 1380 · 7 výzev · ještě 20 dní/);
            assert.equal(await text(tab, '[data-season-goal] p'), 'Dosáhni Mistra do konce listopadu a získáš rámeček Mistrovská sezóna. Chybí ti 320 bodů ratingu.');
            assert.deepEqual(await tab.$$eval('[data-season-reward]', nodes => nodes.map(node => `${node.dataset.seasonReward}:${node.hasAttribute('data-earned')}`)), ['stribro:true', 'zlato:true', 'platina:true', 'diamant:true', 'mistr:false']);
            assert.equal(await tab.locator('[data-season-month]').count(), 12, '12 skončených měsíců');
            assert.deepEqual(await tab.$$eval('[data-season-month]:not([disabled])', nodes => nodes.map(node => node.dataset.seasonMonth)), ['2026-10', '2026-09', '2026-07']);
            assert.equal(await tab.locator('[data-season-month="2026-10"] img[data-league-emblem="diamant"]').count(), 1);
            assert.ok(await fits(tab) <= 0, 'okno se vejde bez posouvání');
            await shot(tab, 'sezona-okno', scheme);

            // Vystavení říjnové sezóny do vitríny
            await tab.click('[data-season-month="2026-10"]');
            await tab.waitForSelector('[data-season-detail="2026-10"]');
            assert.match(await text(tab, '[data-season-detail="2026-10"]'), /říjen 2026: Diamant ?1580 · 23 výzev Vystavit ?0\/3/);
            await tab.click('[data-showcase-toggle="l:2026-10:diamant"]');
            await tab.waitForSelector('[data-showcase-toggle="l:2026-10:diamant"][aria-pressed="true"]');
            await until(() => db.profiles['u-1'].showcase.length === 1);
            await tab.waitForFunction(() => /Vystaveno ve tvém profilu/.test((document.getElementById('toast') || {}).textContent || ''));
            assert.deepEqual(db.profiles['u-1'].showcase, ['l:2026-10:diamant']);
            assert.equal(await tab.locator('[data-season-month="2026-10"] [data-season-shown]').count(), 1, 'vystavená sezóna má značku');
            assert.ok(await fits(tab) <= 0, 'i s vybranou sezónou bez posouvání');
            await shot(tab, 'sezona-vystavena', scheme);

            // Jak fungují ligy: bod o sezónách a tlačítko zpět do sezón
            await tab.click('#dialog-overlay [data-league-help]');
            await tab.waitForSelector('#league-help [data-help-seasons]');
            assert.match(await text(tab, '[data-help-seasons]'), /Ligová sezóna trvá kalendářní měsíc/);
            assert.ok(await fits(tab) <= 0);
            await shot(tab, 'sezona-jak-funguji-ligy', scheme);
            await tab.click('[data-help-seasons-open]');
            await tab.waitForSelector('[data-league-seasons]');
            await tab.keyboard.press('Escape');

            // Odznak do vitríny (Můj postup → Odznaky): nejvyšší stupeň jde vystavit, nižší ne
            await tab.click('#btn-settings');
            await tab.click('[data-open-progress]');
            await tab.click('[data-open-badges]');
            await tab.click('#dialog-overlay [data-badge="vyhry-5"]');
            assert.match(await text(tab, '#dialog-overlay .sticky.top-11'), /Do vitríny v profilu jde vystavit nejvyšší získaný stupeň/);
            assert.equal(await tab.locator('[data-showcase-toggle]').count(), 0);
            await tab.click('#dialog-overlay [data-badge="vyhry-25"]');
            await tab.click('[data-showcase-toggle="b:vyhry-25"]');
            await tab.waitForSelector('[data-showcase-toggle="b:vyhry-25"][aria-pressed="true"]');
            await until(() => db.profiles['u-1'].showcase.length === 2);
            assert.deepEqual(db.profiles['u-1'].showcase, ['l:2026-10:diamant', 'b:vyhry-25']);
            await shot(tab, 'vitrina-odznak', scheme);
            await tab.keyboard.press('Escape');

            // Diplom do vitríny (tlačítko vedle Diplomy, okno se nezvětší)
            await tab.click('#btn-settings');
            await tab.click('[data-open-progress]');
            await tab.click('[data-rewards-info="diplomas"]');
            await tab.click('[data-diploma="zemepis"]');
            await tab.waitForSelector('[data-diploma-showcase] [data-showcase-toggle="d:zemepis"]');
            await tab.click('[data-showcase-toggle="d:zemepis"]');
            await tab.waitForSelector('[data-showcase-toggle="d:zemepis"][aria-pressed="true"]');
            await until(() => db.profiles['u-1'].showcase.length === 3);
            assert.deepEqual(db.profiles['u-1'].showcase, ['l:2026-10:diamant', 'b:vyhry-25', 'd:zemepis']);
            assert.ok(await fits(tab) <= 0, 'okno diplomu se vejde');
            await shot(tab, 'vitrina-diplom', scheme);
            await tab.keyboard.press('Escape');

            // Nastavení → Profil: náhled vitríny vedle titulu a rámečky sezón (Diamant odemčený, Mistr zamčený); plná vitrína
            await tab.click('#btn-settings');
            await tab.click('[data-me-tab="profile"]');
            await tab.waitForSelector('#settings-overlay [data-open-showcase]');
            assert.equal(await tab.locator('#settings-overlay [data-open-showcase] img').count() >= 3, true, 'tři trofeje v náhledu');
            assert.equal(await tab.getAttribute('[data-frame="liga-diamant"]', 'class').then(cls => /grayscale/.test(cls)), false, 'rámeček Diamantové sezóny je odemčený');
            assert.equal(await tab.getAttribute('[data-frame="liga-mistr"]', 'class').then(cls => /grayscale/.test(cls)), true, 'Mistrovská sezóna je zamčená');
            await tab.click('[data-frame="liga-diamant"]');
            await tab.waitForSelector('[data-frame="liga-diamant"][aria-pressed="true"]');
            await tab.waitForFunction(() => document.querySelector('#btn-settings .frame-liga-diamant'));
            assert.equal(await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight - box.clientHeight; }), 0, 'Profil se vejde bez posouvání');
            await tab.evaluate(() => { const row = document.querySelector('[data-frame="liga-diamant"]'); row.scrollIntoView({ inline: 'center', block: 'nearest' }); });
            await shot(tab, 'nastaveni-profil-vitrina', scheme);
            await tab.click('[data-frame="liga-mistr"]');
            assert.match(await text(tab, '[data-look="frames"] [role="status"]'), /Mistrovská sezóna: Ligová sezóna: vrchol Mistr/);

            // Okno Vitrína: tři trofeje s Odebrat; odebrání uloží
            await tab.click('#settings-overlay [data-open-showcase]');
            await tab.waitForSelector('[data-showcase-dialog]');
            assert.deepEqual(await tab.$$eval('[data-showcase-dialog] [data-showcase-item]', nodes => nodes.map(node => node.dataset.showcaseItem)), ['l:2026-10:diamant', 'b:vyhry-25', 'd:zemepis']);
            assert.ok(await fits(tab) <= 0);
            await shot(tab, 'vitrina-okno', scheme);
            await tab.click('[data-showcase-remove="b:vyhry-25"]');
            await tab.waitForFunction(() => document.querySelectorAll('[data-showcase-dialog] [data-showcase-item]').length === 2);
            await until(() => db.profiles['u-1'].showcase.length === 2);
            await tab.waitForFunction(() => /Odebráno/.test((document.getElementById('toast') || {}).textContent || ''));
            assert.deepEqual(db.profiles['u-1'].showcase, ['l:2026-10:diamant', 'd:zemepis']);
            assert.equal(await tab.locator('[data-showcase-dialog] [data-showcase-empty]').count(), 1);
            await tab.click('[data-showcase-go="badges"]');
            await waitTitle(tab, 'Odznaky');
            await tab.keyboard.press('Escape');

            // Cizí profil: vitrína Petra (Mistr, odznak, diplom), bez tlačítek Odebrat
            await tab.click('#league-card [data-action="weekly-board"]');
            await tab.waitForSelector('#weekly-list');
            await tab.click('#weekly-list [data-player-id="u-2"]');
            await tab.waitForSelector('#dialog-overlay [data-showcase]');
            assert.deepEqual(await tab.$$eval('#dialog-overlay [data-showcase-item]', nodes => nodes.map(node => node.textContent.replace(/\s+/g, ' ').trim())), ['Mistr říjen 2026', `${Core.BADGE_BY_ID['tema-zemepis-600'].title} Odznak`, 'Mistr zeměpisu Diplom']);
            assert.equal(await tab.locator('#dialog-overlay [data-showcase-remove]').count(), 0);
            await tab.waitForSelector('[data-rematch]');
            await tab.waitForTimeout(300);
            assert.ok(await fits(tab) <= 0, 'profil s vitrínou se vejde');
            await shot(tab, 'profil-hrace-vitrina', scheme);
            await tab.keyboard.press('Escape');

            // Po obnovení stránky se oslava nezopakuje (pamatuje se v zařízení)
            await tab.reload();
            await waitForHome(tab);
            await tab.waitForSelector('#league-card [data-league-strip]');
            await tab.waitForTimeout(1500);
            assert.equal(await tab.locator('#celebration').count(), 0, 'oslava jen jednou');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
            chosen = db;
        });
    }

    // Stejný „server“, na kterém Jana vitrínu a rámeček vybrala: Petr je uvidí v jejím profilu
    await t.test('druhý hráč vidí vybranou vitrínu a rámeček sezóny v Profilu hráče', async () => {
        const db = chosen;
        assert.ok(db, 'vitrínu vybral předchozí test');
        assert.deepEqual(db.profiles['u-1'].showcase, ['l:2026-10:diamant', 'd:zemepis']);
        assert.equal(db.profiles['u-1'].frame, 'liga-diamant');
        const { context, tab, log } = await setup(browser, login('tok-u2'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('#league-card');
        await tab.click('#league-card [data-action="weekly-board"]');
        await tab.waitForSelector('#weekly-list');
        assert.equal(await tab.locator('#weekly-list [data-player-id="u-1"].frame-liga-diamant').count(), 1, 'rámeček sezóny vidí i ostatní');
        await tab.click('#weekly-list [data-player-id="u-1"]');
        await tab.waitForSelector('#dialog-overlay [data-showcase]');
        assert.deepEqual(await tab.$$eval('#dialog-overlay [data-showcase-item]', nodes => nodes.map(node => node.dataset.showcaseItem)), ['l:2026-10:diamant', 'd:zemepis']);
        assert.match(await text(tab, '#dialog-overlay [data-showcase]'), /Diamant říjen 2026.*Mistr zeměpisu Diplom/);
        assert.equal(await tab.locator('#dialog-overlay [data-profile-head] .frame-liga-diamant').count(), 1, 'rámeček v hlavičce profilu');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('rámeček sezóny zůstane odemčený i bez připojení (pamatuje se v zařízení)', async () => {
        const db = newDb();
        const cache = { v: 1, best: 'platina', bestMonth: '2026-07', user: 'u-1', data: SEASONS_U1, at: 1 };
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.leagueSeasons': JSON.stringify(cache), 'mudrlant.look': JSON.stringify({ frame: 'liga-platina' }) });
        await backend(context, db, { offline: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('#btn-settings .frame-liga-platina');
        assert.equal(await tab.evaluate(() => window.MudrlantLook.prefs().frame), 'liga-platina', 'zvolený rámeček se nezahodí');
        // Bez spojení se ukáže uložená sezóna (pruh i okno)
        await tab.waitForSelector('#league-card [data-league-strip]');
        await tab.waitForTimeout(800);
        assert.doesNotMatch(await tab.locator('#celebration').count() ? await text(tab, '#celebration') : '', /sezóna/i, 'bez spojení žádná oslava sezóny');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('databáze schématu 17: bez sezón a vitríny, žádné chyby', async () => {
        const db = newDb({ missing: true });
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('#league-card');
        await tab.waitForTimeout(800);
        assert.equal(await tab.locator('[data-league-strip]').count(), 0, 'pruh sezóny se neukáže');
        await tab.click('#league-card [data-action="league-help"]');
        await tab.waitForSelector('#league-help');
        assert.equal(await tab.locator('[data-help-seasons]').count(), 0);
        await tab.keyboard.press('Escape');
        await tab.click('#btn-settings');
        await tab.click('[data-me-tab="profile"]');
        await tab.waitForSelector('[data-frame="liga-zlato"]');
        assert.equal(await tab.locator('[data-open-showcase]').count(), 0, 'bez vitríny v databázi žádný náhled');
        assert.equal(await tab.getAttribute('[data-frame="liga-zlato"]', 'class').then(cls => /grayscale/.test(cls)), true, 'rámečky sezón zamčené');
        await tab.click('[data-open-progress]');
        await tab.click('[data-open-badges]');
        await tab.click('#dialog-overlay [data-badge="vyhry-25"]');
        assert.equal(await tab.locator('[data-showcase-toggle]').count(), 0, 'bez Vystavit');
        await tab.keyboard.press('Escape');
        await tab.click('#league-card [data-action="weekly-board"]');
        await tab.waitForSelector('#weekly-list');
        await tab.click('#weekly-list [data-player-id="u-2"]');
        await tab.waitForSelector('[data-rematch]');
        await tab.waitForTimeout(400);
        assert.equal(await tab.locator('#dialog-overlay [data-showcase]').count(), 0);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});

const waitTitle = (tab, title) => tab.waitForFunction(expected => { const overlay = document.getElementById('dialog-overlay'); return overlay && overlay.dataset.title === expected; }, title);
