// Pořadí dne v Řazení dne a Skládačce dne (minigame-rank.js) v prohlížeči se skutečnými daty a falešným Supabase v paměti:
// přihlášený hráč dohraje Řazení dne → výsledek (pokusy a vlastnost dne) se pošle na server, ve výsledku je pruh s místem a podílem
// „napoprvé“, tlačítko Pořadí otevře okno se záložkami Všichni / Přátelé (moje řádka zvýrazněná). Skládačka dne dohraná na jiném zařízení
// (záznam z bonus-sync.js) se při otevření výsledku pošle také; server vrátí uložený výsledek a druhou řádku neudělá; pořadí je jen mezi
// hráči stejného obrázku (obrys místo vlajky se jen spočítá). Nepřihlášený hráč vidí výzvu k přihlášení, starší databáze (schéma 52, bez
// funkcí) srovnání neukáže a nic se nerozbije. Obrazovky a okna se vejdou bez posouvání na 360×640 i 390×780 ve světlém i tmavém režimu,
// kontroly rozhraní jako tests/e2e-ui-audit.test.js, CSP bez chyb. SCREENSHOT_DIR=<složka> uloží snímky. Potřebuje Playwright.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nav = require('./nav.js');
const Sorting = require('../sorting.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const NOW = new Date('2026-11-27T12:00:00+01:00');
const TODAY = '2026-11-27';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const items = (topic) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/${topic}.json`), 'utf8')).items;

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1' } };
const LOGIN = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'x@example.com', name: 'Jana Nováková' } }) };
const player = (id, name, avatar) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true });
const NAMES = ['Petr Svoboda', 'Eva Malá', 'Karel Dlouhý', 'Lucie Bílá', 'Tomáš Černý', 'Alena Nová', 'Jiří Král', 'Marie Veselá', 'Ondřej Hrubý', 'Zuzana Krátká', 'Pavel Pokorný'];

// Databáze miniher (zjednodušeně, pravidla hlídá tests/sql-minigame-rank.test.js); missing = starší databáze bez bloku 53 (404)
const newDb = ({ missing = false } = {}) => ({ calls: [], missing, rows: {}, profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊') } });
const others = (game) => NAMES.map((name, i) => ({ id: `u-${i + 2}`, display_name: name, avatar: '🐼', color: 'sky', value: game === 'sorting' ? 1 + Math.floor(i / 3) : 16 + i * 2 }));
const boardOf = (db, game) => {
    const mine = db.rows[game];
    const list = [...others(game), ...(mine ? [{ ...db.profiles['u-1'], value: mine.value, mine: true }] : [])].sort((a, b) => a.value - b.value || (a.mine ? 1 : -1));
    const rankOf = (value) => 1 + list.filter(row => row.value < value).length;
    const best = game === 'sorting' ? 1 : 16;
    return {
        day: TODAY, game, players: list.length, other: game === 'puzzle' ? 3 : 0, first: list.filter(row => row.value === best).length,
        first_pct: Math.round(100 * list.filter(row => row.value === best).length / list.length), best: list[0].value,
        me: mine ? { day: TODAY, value: mine.value, variant: mine.variant, rank: rankOf(mine.value) } : null,
        top: list.slice(0, 10).map(row => ({ rank: rankOf(row.value), id: row.id, display_name: row.display_name, avatar: row.avatar, color: row.color, value: row.value, me: Boolean(row.mine) }))
    };
};
const backend = async (context, db) => {
    await context.route('https://proj.supabase.co/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        if (!me) return json({ message: 'no token' }, 401);
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        if (rpc) {
            const name = rpc[1];
            if (name === 'schema_version') return json(db.missing ? 52 : REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'friends_list' || name === 'weekly_leaderboard') return json([]);
            if (/^minigame_/.test(name)) {
                db.calls.push({ name, body });
                if (db.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                if (name === 'minigame_submit') {
                    if (body.for_day !== TODAY) return json({ message: 'Výsledek se dá poslat jen za dnešní den.' }, 400);
                    if (!db.rows[body.p_game]) db.rows[body.p_game] = { value: body.p_value, variant: body.p_variant };
                    return json(boardOf(db, body.p_game).me);
                }
                if (name === 'minigame_board') return json(boardOf(db, body.p_game));
                if (name === 'minigame_friends') {
                    const board = boardOf(db, body.p_game);
                    return json({ day: TODAY, game: body.p_game, friends: 2, other: body.p_game === 'puzzle' ? 1 : 0, rows: board.top.filter(row => row.me || row.id === 'u-3') });
                }
            }
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        const table = url.pathname.replace('/rest/v1/', '');
        const eq = (field) => (url.searchParams.get(field) || '').replace(/^eq\./, '');
        if (table === 'profiles') return json(db.profiles[eq('id')] ? [db.profiles[eq('id')]] : []);
        return json([]);
    });
};

const open = async (browser, storage, { viewport = { width: 360, height: 640 }, colorScheme = 'light', db = null } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await context.addInitScript(entries => {
        window.MUDRLANT_NUMERIC_RATE = 0;
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) return route.fulfill(serveFile(url.pathname));
        if (url.hostname === 'proj.supabase.co') return db ? route.fallback() : route.fulfill({ json: url.pathname.startsWith('/auth/') ? {} : [] });
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: 'Krátký popis položky pro zkoušku, dost dlouhý na to, aby ho aplikace vzala jako úvod článku z Wikipedie.' } } } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    if (db) await backend(context, db);
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await tab.clock.setFixedTime(NOW);
    await tab.goto(`${ORIGIN}/`);
    await nav.waitForHome(tab);
    return { context, tab, log };
};
const INSPECT = (() => {
    const source = fs.readFileSync(path.join(__dirname, 'e2e-ui-audit.test.js'), 'utf8');
    const start = source.indexOf('const inspect = () => {');
    const end = source.indexOf('\ntest(', start);
    return start >= 0 && end > start ? source.slice(start + 'const inspect = '.length, end).trim().replace(/;$/, '') : null;
})();
const audit = async (tab, scene) => {
    if (!INSPECT) return;
    await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
    await tab.waitForTimeout(150);
    const found = await tab.evaluate(`(${INSPECT})()`);
    for (const kind of Object.keys(found)) assert.deepEqual(found[kind], [], `${scene}: ${kind}`);
};
const settle = (tab) => tab.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
});
const fitsScreen = async (tab, what) => {
    await settle(tab);
    const size = await tab.evaluate(() => { const main = document.getElementById('app-content'); return { scroll: main.scrollHeight, client: main.clientHeight, wide: document.documentElement.scrollWidth - innerWidth }; });
    assert.ok(size.scroll <= size.client + 1, `${what}: posouvá se (${size.scroll} > ${size.client})`);
    assert.ok(size.wide <= 1, `${what}: do strany`);
};
const fitsDialog = async (tab, what) => {
    const size = await tab.evaluate(() => { const box = document.getElementById('dialog-overlay').firstElementChild; return { scroll: box.scrollHeight, client: box.clientHeight }; });
    assert.ok(size.scroll <= size.client + 1, `${what}: okno se posouvá (${size.scroll} > ${size.client})`);
};
const shot = async (tab, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
const compact = async (tab, selector) => ((await tab.innerText(selector)) || '').replace(/\s+/g, ' ').trim();

const dailySpec = async () => (await Sorting.dailyRound(TODAY, async (topic) => ({ items: items(topic), ctx: null }))).spec;
const names = (tab) => tab.$$eval('[data-sort-card] [data-action="sorting-card"] > span:first-child', spans => spans.map(span => span.textContent.trim()));
const solve = async (tab) => {
    const daily = await Sorting.dailyRound(TODAY, async (topic) => ({ items: items(topic), ctx: null }));
    const correct = daily.correct.map(index => daily.items[index].name);
    // Nejdřív jedna kontrola napřeskáčku (2 pokusy), pak šipkami do správného pořadí
    await tab.click('[data-action="sorting-check"]');
    await tab.waitForSelector('[data-sorting="play"], [data-sorting="done"]');
    if (await tab.$('[data-sorting="done"]')) return 1;
    for (let p = 0; p < correct.length; p++) {
        for (let guard = 0; guard < 10; guard++) {
            const now = await names(tab);
            const at = now.indexOf(correct[p]);
            if (at === p) break;
            await tab.click(`[data-action="sorting-up"][data-pos="${at}"]`);
        }
    }
    await tab.click('[data-action="sorting-check"]');
    await tab.waitForSelector('[data-sorting="done"]');
    return 2;
};
const openToday = async (tab, card) => {
    await nav.go(tab, 'dnes');
    await tab.click(`#${card}`);
};
const PUZZLE_DONE = (moves) => ({ 'mudrlant.skladacka': JSON.stringify({ v: 1, daily: { [TODAY]: { moves, v: 'outline', id: 'Q213' } } }) });

test('Pořadí dne v Řazení dne a Skládačce dne', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const spec = await dailySpec();

    await t.test('přihlášený 360×640: Řazení dne dohrané → odeslání, pruh s pořadím, okno Všichni / Přátelé', async () => {
        const db = newDb();
        const { context, tab, log } = await open(browser, LOGIN, { db });
        await openToday(tab, 'sorting-card');
        await tab.waitForSelector('[data-sorting="play"]');
        const attempts = await solve(tab);
        await tab.waitForSelector('[data-mg-rank="sorting"] [data-mg-summary]');
        const submits = db.calls.filter(call => call.name === 'minigame_submit');
        assert.deepEqual(submits.map(call => call.body), [{ p_game: 'sorting', for_day: TODAY, p_value: attempts, p_variant: spec }]);
        const strip = await compact(tab, '[data-mg-rank="sorting"]');
        assert.match(strip, /^\d+\. místo z 12 · napoprvé \d+ % · nejlepší 1 pokus Pořadí$/);
        await fitsScreen(tab, 'výsledek Řazení dne s pořadím (360×640)');
        await audit(tab, 'výsledek Řazení dne s pořadím');
        await shot(tab, 'razeni-vysledek-360x640-light');

        await tab.click('[data-action="mg-rank-open"]');
        await tab.waitForSelector('#dialog-overlay [data-mg-dialog="sorting"]');
        assert.equal(await tab.getAttribute('#dialog-overlay', 'data-title'), 'Pořadí dne');
        assert.equal(await tab.$$eval('#dialog-overlay [data-mg-row]', rows => rows.length), 10);
        const mine = await tab.$$eval('#dialog-overlay [data-mg-row]', rows => rows.filter(row => /\(ty\)/.test(row.textContent)).map(row => row.className));
        assert.equal(mine.length, 1, 'moje řádka');
        assert.match(mine[0], /ring-gold-300/, 'zvýrazněná');
        await fitsDialog(tab, 'okno Pořadí dne (360×640)');
        await audit(tab, 'okno Pořadí dne');
        await shot(tab, 'razeni-poradi-vsichni-360x640-light');
        await tab.click('#dialog-overlay [data-mg-tab="friends"]');
        await tab.waitForSelector('#dialog-overlay [data-mg-tab="friends"][aria-selected="true"]');
        assert.equal(await tab.$$eval('#dialog-overlay [data-mg-row]', rows => rows.length), 2, 'já a jeden přítel');
        await fitsDialog(tab, 'okno Pořadí dne – Přátelé');
        await shot(tab, 'razeni-poradi-pratele-360x640-light');
        await tab.click('#dialog-overlay [data-close]');

        // Opětovné otevření hotového: pruh je zase vidět, druhá řádka nevznikne (server vrátí uložený výsledek)
        await tab.click('#btn-home');
        await nav.waitForHome(tab);
        await openToday(tab, 'sorting-card');
        await tab.waitForSelector('[data-sorting="done"] [data-mg-rank="sorting"] [data-mg-summary]');
        assert.equal(Object.keys(db.rows).length, 1);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('Skládačka dne dohraná na jiném zařízení: odeslání při otevření výsledku, jen stejný obrázek, poznámka o jiném', async () => {
        const db = newDb();
        db.rows.puzzle = { value: 20, variant: 'outline:Q213' }; // první zařízení už poslalo
        for (const [viewport, scheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark']]) {
            const label = `${viewport.width}x${viewport.height}-${scheme}`;
            const { context, tab, log } = await open(browser, { ...LOGIN, ...PUZZLE_DONE(24) }, { db, viewport, colorScheme: scheme });
            await openToday(tab, 'puzzle-card');
            await tab.waitForSelector('#puzzle-done [data-mg-rank="puzzle"] [data-mg-summary]', { timeout: 30000 });
            const submit = db.calls.filter(call => call.name === 'minigame_submit').pop();
            assert.deepEqual(submit.body, { p_game: 'puzzle', for_day: TODAY, p_value: 24, p_variant: 'outline:Q213' });
            assert.equal(db.rows.puzzle.value, 20, 'první výsledek platí, druhá řádka nevznikne');
            assert.match(await compact(tab, '[data-mg-rank="puzzle"]'), /místo z 12 · bez chyby \d+ % · nejlepší 16 tahů/);
            await fitsScreen(tab, `výsledek Skládačky dne s pořadím (${label})`);
            await audit(tab, `výsledek Skládačky dne (${label})`);
            await shot(tab, `skladacka-vysledek-${label}`);
            await tab.click('[data-action="mg-rank-open"]');
            await tab.waitForSelector('#dialog-overlay [data-mg-dialog="puzzle"]');
            assert.match(await compact(tab, '#dialog-overlay [data-mg-other]'), /Mimo toto pořadí \(jiný obrázek, třeba obrys místo vlajky\): 3 hráči\./);
            assert.match(await compact(tab, '#dialog-overlay [data-mg-list]'), /16 tahů ✓/);
            await fitsDialog(tab, `okno Pořadí dne Skládačky (${label})`);
            await audit(tab, `okno Pořadí dne Skládačky (${label})`);
            await shot(tab, `skladacka-poradi-${label}`);
            await tab.click('#dialog-overlay [data-mg-tab="friends"]');
            await tab.waitForSelector('#dialog-overlay [data-mg-tab="friends"][aria-selected="true"]');
            assert.match(await compact(tab, '#dialog-overlay [data-mg-other]'), /1 hráč\./);
            await fitsDialog(tab, `okno Pořadí dne Skládačky – Přátelé (${label})`);
            await shot(tab, `skladacka-poradi-pratele-${label}`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });

    await t.test('Řazení dne hotové v tmavém režimu a 390×780: pruh se vejde', async () => {
        const db = newDb();
        db.rows.sorting = { value: 3, variant: spec };
        const sortingDone = { 'mudrlant.sorting': JSON.stringify({ v: 1, daily: { [TODAY]: { attempts: 3, spec } } }) };
        for (const [viewport, scheme] of [[{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark']]) {
            const label = `${viewport.width}x${viewport.height}-${scheme}`;
            const { context, tab, log } = await open(browser, { ...LOGIN, ...sortingDone }, { db, viewport, colorScheme: scheme });
            await openToday(tab, 'sorting-card');
            await tab.waitForSelector('[data-sorting="done"] [data-mg-rank="sorting"] [data-mg-summary]');
            assert.match(await compact(tab, '[data-mg-rank="sorting"]'), /místo z 12/);
            await fitsScreen(tab, `výsledek Řazení dne (${label})`);
            await audit(tab, `výsledek Řazení dne (${label})`);
            await shot(tab, `razeni-vysledek-${label}`);
            await tab.click('[data-action="mg-rank-open"]');
            await tab.waitForSelector('#dialog-overlay [data-mg-dialog="sorting"]');
            await fitsDialog(tab, `okno Pořadí dne Řazení (${label})`);
            await shot(tab, `razeni-poradi-${label}`);
            assert.deepEqual(log.errors, []);
            await context.close();
        }
    });

    await t.test('nepřihlášený: výzva k přihlášení v obou výsledcích, nic se neposílá', async () => {
        const db = newDb();
        const { context, tab, log } = await open(browser, { 'mudrlant.sorting': JSON.stringify({ v: 1, daily: { [TODAY]: { attempts: 2, spec } } }), ...PUZZLE_DONE(18) }, { db });
        await openToday(tab, 'sorting-card');
        await tab.waitForSelector('[data-sorting="done"] [data-mg-rank="sorting"] [data-action="mg-rank-login"]');
        assert.match(await compact(tab, '[data-mg-rank="sorting"]'), /Po přihlášení uvidíš své pořadí dne a kolik hráčů seřadilo karty napoprvé\. Přihlásit se/);
        await fitsScreen(tab, 'výsledek Řazení dne bez přihlášení');
        await audit(tab, 'výsledek Řazení dne bez přihlášení');
        await shot(tab, 'razeni-host-360x640-light');
        await tab.click('#btn-home');
        await nav.waitForHome(tab);
        await openToday(tab, 'puzzle-card');
        await tab.waitForSelector('#puzzle-done [data-mg-rank="puzzle"] [data-action="mg-rank-login"]', { timeout: 30000 });
        await fitsScreen(tab, 'výsledek Skládačky dne bez přihlášení');
        await shot(tab, 'skladacka-host-360x640-light');
        assert.deepEqual(db.calls, []);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('starší databáze (schéma 52): srovnání se neukáže, hra funguje', async () => {
        const db = newDb({ missing: true });
        const { context, tab, log } = await open(browser, { ...LOGIN, ...PUZZLE_DONE(18), 'mudrlant.sorting': JSON.stringify({ v: 1, daily: { [TODAY]: { attempts: 2, spec } } }) }, { db });
        await openToday(tab, 'sorting-card');
        await tab.waitForSelector('[data-sorting="done"]');
        await tab.waitForFunction(() => !document.querySelector('[data-mg-rank]'));
        await tab.click('#btn-home');
        await nav.waitForHome(tab);
        await openToday(tab, 'puzzle-card');
        await tab.waitForSelector('#puzzle-done', { timeout: 30000 });
        await tab.waitForTimeout(300);
        assert.equal(await tab.$('[data-mg-rank]'), null, 'pruh se neukáže');
        assert.equal(db.calls.filter(call => call.name === 'minigame_submit').length, 1, 'po první 404 se už nic neposílá');
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
