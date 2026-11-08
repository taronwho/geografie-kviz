// Test ratingu, lig a týdenního žebříčku v prohlížeči s falešným Supabase v paměti (rating po výzvě počítá „databáze“ stejným vzorcem jako rating.js).
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Rating = require('../rating.js');

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

const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });

const newDb = () => ({
    profiles: {
        'u-1': { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [], rating: 1120, rated_games: 6 },
        'u-2': { id: 'u-2', display_name: 'Petr Svoboda', avatar: '🐼', color: 'sky', xp: 4000, badges: [], rating: 1260, rated_games: 14 },
        'u-3': { id: 'u-3', display_name: 'Eva Mistr', avatar: '🦉', color: 'violet', xp: 90000, badges: [], rating: 1720, rated_games: 80 }
    },
    challenges: { ABC234: { id: 'ABC234', creator_id: 'u-2', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 's', created_at: '2026-11-03T10:00:00Z' } },
    results: [{ challenge_id: 'ABC234', user_id: 'u-2', correct: 3, points: 7, finished_at: '2026-11-03T10:30:00Z' }],
    history: [],
    // Týdenní žebříček „spočítaný serverem“ (veřejná pole)
    weekly: [
        { id: 'u-3', display_name: 'Eva Mistr', avatar: '🦉', color: 'violet', frame: null, title_pref: null, xp: 90000, rating: 1720, league: 'mistr', week_delta: 31, week_wins: 3, week_games: 4 },
        { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', frame: null, title_pref: null, xp: 0, rating: 1120, league: 'stribro', week_delta: 12, week_wins: 1, week_games: 2 },
        { id: 'u-2', display_name: 'Petr Svoboda', avatar: '🐼', color: 'sky', frame: null, title_pref: null, xp: 4000, rating: 1260, league: 'zlato', week_delta: -8, week_wins: 0, week_games: 2 }
    ]
});

// missing = databáze ještě nemá rating (sloupec ani funkce): dotazy na ně končí chybou 400/404
const backend = async (context, db, { missing = false } = {}) => {
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
        const profile = (id) => ({ ...db.profiles[id] });
        const challengeRow = (c) => ({ ...c, creator: profile(c.creator_id), invited: c.invited_id ? profile(c.invited_id) : null });
        if (url.pathname === '/rest/v1/rpc/weekly_leaderboard') return missing ? json({ message: 'not found' }, 404) : json(db.weekly);
        if (url.pathname === '/rest/v1/rating_history') {
            if (missing) return json({ message: 'relation does not exist' }, 404);
            return json(db.history.filter(row => row.challenge_id === eq('challenge_id') && row.user_id === eq('user_id')));
        }
        if (url.pathname === '/rest/v1/profiles') {
            if (/rating/.test(param('select')) && missing) return json({ code: '42703', message: 'column profiles.rating does not exist' }, 400);
            return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        }
        if (url.pathname === '/rest/v1/challenges') {
            if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(challengeRow));
            const found = db.challenges[eq('id')];
            return json(found ? [challengeRow(found)] : []);
        }
        if (url.pathname === '/rest/v1/challenge_results') {
            if (request.method() === 'POST') {
                if (db.results.some(row => row.challenge_id === body.challenge_id && row.user_id === body.user_id)) return route.fulfill({ status: 201, body: '' });
                db.results.push({ ...body, finished_at: '2026-11-03T11:00:00Z' });
                // Rating po druhém výsledku výzvy (jako trigger v databázi)
                const same = db.results.filter(row => row.challenge_id === body.challenge_id);
                if (same.length === 2 && !missing) {
                    const [a, b] = same;
                    const score = Rating.duelScore(a, b);
                    const delta = Rating.ratingChange(db.profiles[a.user_id].rating, db.profiles[b.user_id].rating, score);
                    const outcome = (s) => s === 1 ? 'win' : s === 0 ? 'loss' : 'draw';
                    db.profiles[a.user_id].rating += delta;
                    db.profiles[b.user_id].rating -= delta;
                    db.history.push({ challenge_id: body.challenge_id, user_id: a.user_id, delta, rating_after: db.profiles[a.user_id].rating, outcome: outcome(score), capped: false });
                    db.history.push({ challenge_id: body.challenge_id, user_id: b.user_id, delta: -delta, rating_after: db.profiles[b.user_id].rating, outcome: outcome(1 - score), capped: false });
                }
                return route.fulfill({ status: 201, body: '' });
            }
            if (param('user_id').startsWith('eq.') && param('select').includes('challenge:challenges')) return json(db.results.filter(row => row.user_id === eq('user_id')).map(row => ({ ...row, challenge: challengeRow(db.challenges[row.challenge_id]) })));
            if (param('user_id').startsWith('eq.')) return json(db.results.filter(row => row.user_id === eq('user_id')));
            if (param('challenge_id').startsWith('in.')) return json(db.results.filter(row => param('challenge_id').slice(4, -1).split(',').includes(row.challenge_id) && row.user_id !== param('user_id').replace('neq.', '')).map(row => ({ ...row, player: profile(row.user_id) })));
            return json(db.results.filter(row => row.challenge_id === eq('challenge_id')).map(row => ({ ...row, player: profile(row.user_id) })));
        }
        return json({});
    });
};

const setup = async (browser, storage, viewport = { width: 400, height: 800 }) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'light', viewport });
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

test('rating, ligy a týdenní žebříček', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('karta Moje liga, týdenní žebříček, změna ratingu po výzvě a liga v profilu soupeře', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);

        // Karta Moje liga: Stříbro, rating 1120, ukazatel do Zlata (130 bodů), kompaktní
        await tab.waitForSelector('#league-card');
        const card = await tab.textContent('#league-card');
        assert.match(card, /Stříbro · 1120/);
        assert.match(card, /Do ligy Zlato ještě 130/);
        assert.equal(await tab.getAttribute('#league-card [role="progressbar"]', 'aria-valuenow'), '13');
        assert.ok(await tab.evaluate(() => document.getElementById('league-card').getBoundingClientRect().height) < 80, 'karta je nízká');
        // Erb ligy je vlastní ilustrace a skutečně se načte
        await tab.waitForFunction(() => { const img = document.querySelector('#league-card img[data-league-emblem="stribro"]'); return img && img.complete && img.naturalWidth > 0; });
        assert.match(await tab.getAttribute('#league-card img[data-league-emblem="stribro"]', 'src'), /icons\/topics\/liga-stribro\.webp$/);
        await shot(tab, 'multi-liga');

        // Týdenní žebříček: tři hráči, můj řádek zvýrazněný, změny s mínusem, přepis týdne
        await tab.click('#league-card [data-action="weekly-board"]');
        await tab.waitForSelector('#weekly-list');
        assert.equal(await tab.locator('#weekly-list li').count(), 3);
        assert.equal(await tab.locator('#weekly-list li[data-me]').count(), 1);
        assert.match(await tab.textContent('#weekly-list li[data-me]'), /Jana Nováková \(ty\)/);
        const board = await tab.textContent('#dialog-overlay');
        assert.match(board, /Týden 2\. 11\. – 8\. 11\./);
        assert.match(board, /\+31/);
        assert.match(board, /−8/);
        assert.match(board, /Mistr · 1720/);
        assert.equal(await tab.locator('#weekly-list li').first().textContent().then(text => /Eva Mistr/.test(text)), true);
        await shot(tab, 'tydenni-zebricek');
        await tab.keyboard.press('Escape');
        await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));

        // Výzva od Petra (3/5): Jana ji zahraje bez jediné správné, prohraje a ztratí rating
        const expected = Rating.ratingChange(1120, 1260, 0);
        assert.ok(expected < 0);
        await tab.click('[data-action="challenge-open"][data-code="ABC234"]');
        await tab.click('[data-ch-play]');
        await tab.waitForSelector('[data-action="give-up"]');
        for (let i = 0; i < 5; i++) {
            await tab.click('[data-action="give-up"]');
            await tab.waitForSelector('h1');
            await tab.click('[data-action="next"]');
            if (i < 4) await tab.waitForSelector('[data-action="give-up"]');
        }
        await tab.waitForSelector('#rating-change');
        const change = await tab.textContent('#rating-change');
        assert.ok(change.includes(Rating.formatDelta(expected)), change);
        assert.ok(change.includes(String(1120 + expected)), change);
        assert.equal(db.profiles['u-1'].rating, 1120 + expected);
        assert.equal(db.profiles['u-2'].rating, 1260 - expected);
        await shot(tab, 'vysledek-vyzvy');

        // Profil soupeře ukáže jeho ligu a (nový) rating
        await tab.click('#app-content [data-player-id="u-2"]');
        await tab.waitForSelector('#player-league');
        assert.equal((await tab.textContent('#player-league')).replace(/\s+/g, ' ').trim(), `Zlato · ${1260 - expected}`);
        await shot(tab, 'profil-souperem');
        await tab.keyboard.press('Escape');

        // Zpět domů: karta ukazuje nový rating, detail výzvy ukáže změnu
        await tab.click('[data-action="challenge-home"]');
        await tab.waitForSelector('#league-card');
        assert.match(await tab.textContent('#league-card'), new RegExp(`${1120 + expected}`));
        await tab.click('[data-action="challenge-open"][data-code="ABC234"]');
        await tab.waitForFunction(() => /Tvůj rating/.test(document.getElementById('dialog-overlay').textContent));
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('žebříček: můj řádek má moji sovu, i když ji databáze (starší schéma) nevrací', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, { ...login('tok-u1'), 'mudrlant.owlAvatar': 'true', 'mudrlant.avatarColor': '"h160"', 'mudrlant.look': JSON.stringify({ robe: 'zelena' }) });
        await backend(context, db);
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('#league-card');
        await tab.click('#league-card [data-action="weekly-board"]');
        await tab.waitForSelector('#weekly-list');
        assert.equal(await tab.locator('#weekly-list li[data-me] img[data-keep]').count() > 0, true, 'můj řádek ukazuje sovu, ne emoji');
        assert.equal(await tab.locator('#weekly-list li:not([data-me]) img[data-keep]').count(), 0, 'cizí řádky bez sovy zůstanou s emoji');
        assert.match(await tab.getAttribute('#weekly-list li[data-me] span.rounded-full', 'class'), /hsl\(160deg/, 'můj řádek má můj vlastní odstín pozadí, ne nejbližší pojmenovanou barvu');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
    for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 780 }]) {
        await t.test(`vysvětlení lig z karty i z týdenního žebříčku (${viewport.width}x${viewport.height})`, async () => {
            const db = newDb();
            const { context, tab, log } = await setup(browser, login('tok-u1'), viewport);
            await backend(context, db);
            await tab.goto(`${ORIGIN}/`);
            await waitForHome(tab);
            await tab.waitForSelector('#league-card');
            assert.ok(await tab.evaluate(() => document.getElementById('league-card').getBoundingClientRect().height) < 80, 'karta zůstává nízká');
            assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'karta nepřetéká');
            await shot(tab, `liga-karta-${viewport.width}`);

            // Z karty: dialog s pravidly, všemi ligami z Rating.LEAGUES (název a hranice) a týdenním žebříčkem
            await tab.click('#league-card [data-action="league-help"]');
            await tab.waitForSelector('#league-help');
            const help = await tab.textContent('#dialog-overlay');
            assert.match(help, /Jak fungují ligy/);
            assert.match(help, new RegExp(`začíná na ${Rating.START}`));
            assert.match(help, /jen ve výzvách proti jiným hráčům/);
            assert.match(help, /Silnější soupeř/);
            assert.match(help, /Remíza rating skoro nemění/);
            assert.match(help, /Týdenní žebříček/);
            assert.match(help, /V pondělí se počítá znovu/);
            assert.equal(await tab.locator('#league-help [data-league]').count(), Rating.LEAGUES.length);
            const expectedRange = (index) => {
                const league = Rating.LEAGUES[index];
                const next = Rating.LEAGUES[index + 1];
                return !next ? `od ${league.from}` : index === 0 ? `do ${next.from - 1}` : `${league.from}–${next.from - 1}`;
            };
            for (const [index, league] of Rating.LEAGUES.entries()) {
                const text = (await tab.textContent(`#league-help [data-league="${league.id}"]`)).replace(/\s+/g, ' ');
                assert.ok(text.includes(league.name), text);
                assert.ok(text.includes(expectedRange(index)), `${league.name}: ${text}`);
                assert.equal(await tab.locator(`#league-help [data-league="${league.id}"] img[data-league-emblem="${league.id}"]`).count(), 1, 'erb ligy jako na kartě');
            }
            assert.match(await tab.textContent('#league-help [data-league="stribro"]'), /\(ty\)/, 'moje liga je označená');
            assert.equal(await tab.locator('#league-help [data-help-back]').count(), 0, 'z karty tlačítko Zpět není');
            const fit = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return { scroll: box.scrollHeight - box.clientHeight, bottom: box.getBoundingClientRect().bottom, height: window.innerHeight }; });
            assert.ok(fit.scroll <= 1, `dialog se vejde bez posouvání (přesah ${fit.scroll}px)`);
            assert.ok(fit.bottom <= fit.height, 'dialog je celý na obrazovce');
            await shot(tab, `liga-vysvetleni-${viewport.width}`);
            await tab.keyboard.press('Escape');
            await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));

            // Z týdenního žebříčku: tlačítko ?, a Zpět na žebříček
            await tab.click('#league-card [data-action="weekly-board"]');
            await tab.waitForSelector('#weekly-list');
            await shot(tab, `liga-zebricek-${viewport.width}`);
            await tab.click('#dialog-overlay [data-league-help]');
            await tab.waitForSelector('#league-help');
            assert.equal(await tab.locator('#league-help [data-league]').count(), Rating.LEAGUES.length);
            assert.equal(await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); return box.scrollHeight - box.clientHeight <= 1; }), true, 'i se tlačítkem Zpět se vejde');
            await shot(tab, `liga-vysvetleni-zpet-${viewport.width}`);
            await tab.click('#dialog-overlay [data-help-back]');
            await tab.waitForSelector('#weekly-list');
            assert.match(await tab.textContent('#dialog-overlay'), /Týdenní žebříček/);
            await tab.keyboard.press('Escape');
            await tab.waitForFunction(() => !document.getElementById('dialog-overlay'));
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('databáze bez ratingu: aplikace nespadne, karta ligy se neukáže', async () => {
        const db = newDb();
        const { context, tab, log } = await setup(browser, login('tok-u1'));
        await backend(context, db, { missing: true });
        await tab.goto(`${ORIGIN}/`);
        await waitForHome(tab);
        await tab.waitForSelector('[data-action="new-challenge"]');
        await tab.waitForSelector('[data-action="challenge-open"][data-code="ABC234"]');
        assert.equal(await tab.locator('#league-card').count(), 0);
        assert.equal(await tab.locator('[data-action="weekly-board"]').count(), 0);
        // Výzvu jde i tak zahrát; výsledek bez změny ratingu
        await tab.click('[data-action="challenge-open"][data-code="ABC234"]');
        await tab.click('[data-ch-play]');
        await tab.waitForSelector('[data-action="give-up"]');
        for (let i = 0; i < 5; i++) {
            await tab.click('[data-action="give-up"]');
            await tab.waitForSelector('h1');
            await tab.click('[data-action="next"]');
            if (i < 4) await tab.waitForSelector('[data-action="give-up"]');
        }
        await tab.waitForSelector('[data-action="challenge-home"]');
        assert.equal(await tab.locator('#rating-change').count(), 0);
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
