// Řetězovka dne v prohlížeči (chain.js) se skutečnými daty témat a falešným Supabase v paměti: dlaždice v řadě Výzvy (7 článků, rozehráno,
// body a místo), úvod poprvé, otázky článek po článku (zacvaknutí článku, cesta nad otázkou), špatná odpověď (rozhodnutí o Záchraně),
// Záchrana jiné otázky na stejný článek za 0 bodů, přetržení řetězu, výsledek s celým řetězem, okno článku, sdílení textem, XP jednou za den,
// pokračování po zavření, cvičná řetězovka; přihlášený: odeslání výsledku, pořadí dne a okno pořadí, výsledek dohraný na jiném zařízení,
// starší databáze bez funkcí. Obrazovky i okna se vejdou bez posouvání na 360×640 i 390×780, kontroly rozhraní jako tests/e2e-ui-audit.test.js
// (světlý i tmavý režim), CSP bez chyb. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí. CHAIN_SHOTS=<složka> uloží snímky.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Chain = require('../chain.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PHOTO = fs.readFileSync(path.join(ROOT, 'icons', 'topics', 'sova-vitej.webp'));
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const TODAY = '2026-11-13';
const NOON = new Date('2026-11-13T12:00:00+01:00');
const SHOTS = process.env.CHAIN_SHOTS || '';

// Skutečné soubory aplikace a dat (řetěz se staví ze všech témat)
const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' } };
const login = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'x@example.com', name: 'Jana Nováková' } }) };
const player = (id, name, avatar) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true });

// Databáze Řetězovky (zjednodušeně, pravidla hlídá tests/sql-chain.test.js); missing = starší databáze bez funkcí (404)
const newDb = () => ({ calls: [], missing: false, mine: null, profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊'), 'u-2': player('u-2', 'Petr Svoboda', '🐼') } });
const statsOf = (db) => {
    const me = db.mine ? { day: TODAY, ...db.mine, rank: db.mine.score >= 28 ? 1 : 2 } : null;
    const top = [{ rank: 1, ...db.profiles['u-2'], links: 7, score: 28, rescued: false, me: false }, ...(me ? [{ rank: me.rank, ...db.profiles['u-1'], links: me.links, score: me.score, rescued: me.rescued, me: true }] : [])];
    return { day: TODAY, players: 41, full: 11, full_pct: 27, best: 28, me, top };
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
            if (name === 'schema_version') return json(REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'friends_list' || name === 'weekly_leaderboard') return json([]);
            if (/^chain_/.test(name)) {
                db.calls.push({ name, body });
                if (db.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                if (name === 'chain_submit') {
                    if (!db.mine) db.mine = { links: body.links, score: body.score, rescued: body.rescued };
                    return json({ day: body.for_day, ...db.mine, rank: 2 });
                }
                if (name === 'chain_day_stats') return json(statsOf(db));
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
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await context.addInitScript(entries => {
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
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
        return route.abort();
    });
    if (db) await backend(context, db);
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await tab.clock.setFixedTime(NOON);
    await tab.goto(`${ORIGIN}/`);
    await tab.waitForSelector('#chain-card', { timeout: 30000 });
    return { context, tab, log };
};
const compact = async (tab, selector) => ((await tab.innerText(selector)) || '').replace(/\s+/g, ' ').trim();
const store = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.chain') || 'null'));
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
const fitsScreen = async (tab, what) => {
    const size = await tab.evaluate(() => { const main = document.getElementById('app-content'); return { scroll: main.scrollHeight, client: main.clientHeight, wide: document.documentElement.scrollWidth - innerWidth }; });
    assert.ok(size.scroll <= size.client + 1, `${what}: posouvá se (${size.scroll} > ${size.client})`);
    assert.ok(size.wide <= 1, `${what}: do strany`);
};
const fitsDialog = async (tab, what) => {
    const size = await tab.evaluate(() => { const box = document.getElementById('dialog-overlay').firstElementChild; return { scroll: box.scrollHeight, client: box.clientHeight }; });
    assert.ok(size.scroll <= size.client + 1, `${what}: okno se posouvá (${size.scroll} > ${size.client})`);
};
const shot = async (tab, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
// Správná a špatná odpověď na otázku na obrazovce (podle uloženého pokusu; u záchrany podle chain.js)
const answers = (tab) => tab.evaluate(() => {
    const C = window.MudrlantChain;
    const state = C.parseState(JSON.parse(localStorage.getItem('mudrlant.chain')));
    const ask = C.currentAsk(state.attempt);
    const source = ask.rescue || ask.question;
    const right = source.options[source.answer].id;
    return { k: ask.k, rescue: Boolean(ask.rescue), right, wrong: source.options.find(option => option.id !== right).id, text: source.text };
});
const choose = async (tab, id) => {
    await tab.click(`[data-action="chain-choice"][data-id="${id}"]`);
};
const nextQuestion = async (tab, k) => tab.waitForFunction((n) => {
    const screen = document.querySelector('#chain-screen[data-chain-phase="ask"]');
    return screen && /Článek (\d)/.exec(screen.querySelector('#chain-question').textContent)[1] === String(n);
}, k, { timeout: 15000 });
const openChain = async (tab) => {
    await tab.click('#chain-card');
    await tab.waitForSelector('#chain-intro, #chain-screen, #chain-result', { timeout: 60000 });
    await tab.waitForTimeout(250);
};

test('Řetězovka dne v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('host 360×640: dlaždice, úvod, články, Záchrana, přetržení, výsledek, sdílení, XP, cvičná řetězovka', async () => {
        const { context, tab, log } = await open(browser, {});
        // Dlaždice v řadě Výzvy: 7 článků, zlatá tečka, úvod se vejde
        assert.equal(await tab.getAttribute('#chain-card', 'data-chain-status'), 'new');
        assert.equal(await compact(tab, '#chain-card'), 'Řetězovka 7 článků');
        assert.ok(await tab.$('#chain-card [data-chain-new]'), 'zlatá tečka: dnes ještě nehráno');
        assert.equal(await tab.$$eval('#home-specials [data-special-tile]', tiles => tiles.map(tile => tile.id).sort().join(' ')), 'boss-card chain-card quiz-card', 'řada Výzvy: Kvíz dne, Řetězovka, Boss týdne');
        await tab.waitForTimeout(600);
        await fitsScreen(tab, 'úvod s dlaždicí Řetězovky (360×640)');
        await audit(tab, 'úvod s dlaždicí Řetězovky');
        await shot(tab, 'retezovka-uvod-360x640-light');

        // Poprvé úvod s pravidly
        await openChain(tab);
        assert.ok(await tab.$('#chain-intro'), 'úvod s pravidly');
        assert.match(await compact(tab, '#chain-intro'), /Řetěz má 7 článků.*Celý řetěz má 28 bodů.*Záchranu/);
        assert.match(await compact(tab, '#app-header'), /Řetězovka/i);
        assert.match(await compact(tab, '#app-content'), /Řetězovka dne · 13\. 11\./i, 'datum dne pod hlavičkou');
        assert.equal(await store(tab).then(state => state.attempt), null, 'pokus začne až klepnutím na Začít řetěz');
        await fitsScreen(tab, 'úvod Řetězovky');
        await audit(tab, 'úvod Řetězovky');
        await shot(tab, 'retezovka-pravidla-360x640-light');
        await tab.click('[data-action="chain-start"]');
        await nextQuestion(tab, 1);
        const chain = (await store(tab)).attempt.chain;
        assert.equal(chain.questions.length, 7);
        // Stejný řetěz jako v Node (stejná data, stejné semínko dne)
        const sources = Object.fromEntries(Chain.SOURCES.map(topic => [topic, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${topic}.json`), 'utf8')).items]));
        const expected = Chain.dailyChain(Chain.buildGraph(sources, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries), TODAY);
        assert.deepEqual(chain.questions.map(question => question.to.id), expected.questions.map(question => question.to.id));
        assert.equal(await compact(tab, '[data-chain-path]'), chain.start.name);
        assert.match(await compact(tab, '#chain-question'), new RegExp(`Článek 1 · za 1 bod Záchrana ${chain.questions[0].text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
        assert.equal(await tab.$$eval('[data-action="chain-choice"]', buttons => buttons.length), 4);
        await fitsScreen(tab, 'otázka Řetězovky (360×640)');
        await audit(tab, 'otázka Řetězovky');
        await shot(tab, 'retezovka-otazka-360x640-light');

        // Dva správné články: 1 + 2 body, článek zacvakne, uzel přibude do cesty
        let ask = await answers(tab);
        await choose(tab, ask.right);
        await tab.waitForSelector('#chain-screen[data-chain-phase="right"] .chain-right');
        assert.ok(await tab.$('[data-chain-strip] .chain-click[data-link="1"]'), 'článek zacvakne');
        await nextQuestion(tab, 2);
        assert.equal(await compact(tab, '[data-chain-path]'), `${chain.start.name} → ${chain.questions[0].to.name}`);
        ask = await answers(tab);
        await choose(tab, ask.right);
        await nextQuestion(tab, 3);
        assert.match(await compact(tab, '[data-chain-status]'), /^2\/7 · 3 body$/);
        assert.equal(await tab.$$eval('[data-chain-strip] .chain-link-done', links => links.length), 2);

        // Špatně na 3. článku: rozhodnutí o Záchraně (neprozradí správnou odpověď)
        ask = await answers(tab);
        await choose(tab, ask.wrong);
        await tab.waitForSelector('[data-chain-decide]');
        const wrongName = chain.questions[2].options.find(option => option.id === ask.wrong).name;
        assert.match(await compact(tab, '[data-chain-decide]'), new RegExp(`Řetěz praská! „${wrongName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}“ to není`));
        assert.ok(!(await compact(tab, '#chain-screen')).includes(`Správně bylo`));
        assert.ok(await tab.$('[data-chain-strip] .chain-link-broken'), 'článek praská');
        assert.deepEqual((await store(tab)).attempt.pending, { k: 3, chosen: ask.wrong, phase: 'decide' });
        await fitsScreen(tab, 'rozhodnutí o Záchraně');
        await audit(tab, 'rozhodnutí o Záchraně');
        await shot(tab, 'retezovka-praska-360x640-light');
        // Zavření aplikace a návrat: rozhodnutí čeká
        await tab.click('#btn-home');
        await tab.waitForSelector('#chain-card');
        assert.equal(await compact(tab, '#chain-card'), 'Řetězovka Článek 3/7');
        assert.equal(await tab.$('#chain-card [data-chain-new]'), null);
        await openChain(tab);
        await tab.waitForSelector('[data-chain-decide]');

        // Záchrana: jiná otázka na stejný článek, za 0 bodů
        await tab.click('[data-action="chain-rescue"]');
        await tab.waitForSelector('#chain-screen[data-chain-phase="ask"]');
        ask = await answers(tab);
        assert.ok(ask.rescue);
        assert.notEqual(ask.text, chain.questions[2].text);
        assert.match(await compact(tab, '#chain-question'), /Záchrana · za 0 bodů/i);
        assert.ok(!(await tab.$$eval('[data-action="chain-choice"]', buttons => buttons.map(button => button.dataset.id))).includes(chain.questions[2].options.find(option => option.name === wrongName).id), 'zvolená špatná odpověď v záchraně není');
        await fitsScreen(tab, 'otázka Záchrany');
        await audit(tab, 'otázka Záchrany');
        await shot(tab, 'retezovka-zachrana-360x640-light');
        await choose(tab, ask.right);
        await nextQuestion(tab, 4);
        assert.match(await compact(tab, '[data-chain-status]'), /^3\/7 · 3 body$/);
        assert.match(await compact(tab, '#chain-question'), /Záchrana použita/);
        assert.equal(await tab.$$eval('[data-chain-strip] .chain-link-rescued', links => links.length), 1);

        // Druhá chyba: Záchrana už není, řetěz se přetrhne a ukáže se správná odpověď
        ask = await answers(tab);
        await choose(tab, ask.wrong);
        await tab.waitForSelector('[data-chain-broken]');
        assert.match(await compact(tab, '[data-chain-broken]'), new RegExp(`Řetěz se přetrhl na 4\\. článku Správně bylo: ${chain.questions[3].to.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        await fitsScreen(tab, 'přetržený řetěz');
        await audit(tab, 'přetržený řetěz');
        await shot(tab, 'retezovka-pretrzeno-360x640-light');
        await tab.click('[data-action="chain-result"]');
        await tab.waitForSelector('#chain-result');
        await tab.waitForTimeout(300);
        assert.match(await compact(tab, '#chain-result'), /Řetězovka dne · 13\. 11\. 3 body 3\/7 článků · se Záchranou \+6 XP/i);
        assert.equal(await tab.$$eval('[data-action="chain-step"]', rows => rows.length), 7, 'celý řetěz včetně nedohraných článků');
        assert.match(await compact(tab, '[data-chain-rows]'), new RegExp(`${chain.questions[0].to.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\+1`));
        assert.match(await compact(tab, '[data-action="chain-step"][data-k="3"]'), /Záchrana/);
        assert.match(await compact(tab, '#chain-stats'), /Po přihlášení uvidíš své pořadí dne/);
        await fitsScreen(tab, 'výsledek Řetězovky (360×640)');
        await audit(tab, 'výsledek Řetězovky');
        await shot(tab, 'retezovka-vysledek-360x640-light');
        // XP jednou za den: 2 XP za bod
        const progress = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')));
        assert.equal(progress.xp, 6);
        assert.equal(progress.counters.chainDone, 1);
        // Okno článku: otázka, možnosti a co hráč zvolil
        await tab.click('[data-action="chain-step"][data-k="4"]');
        await tab.waitForSelector('[data-chain-step="4"]');
        assert.match(await compact(tab, '[data-chain-step="4"]'), /Tady se řetěz přetrhl/);
        await fitsDialog(tab, 'okno článku (360×640)');
        await audit(tab, 'okno článku');
        await shot(tab, 'retezovka-clanek-360x640-light');
        await tab.keyboard.press('Escape');
        // Sdílení textem do schránky (bez odpovědí)
        await tab.click('[data-action="chain-share"]');
        await tab.waitForFunction(() => navigator.clipboard.readText().then(text => /Řetězovka/.test(text)));
        const shared = await tab.evaluate(() => navigator.clipboard.readText());
        assert.equal(shared.split('\n')[0], 'Mudrlant · Řetězovka 13. 11. 🔗🔗🛟💥 · 3 body · https://geo.test/');
        assert.ok(!chain.questions.some(question => shared.includes(question.to.name)), 'sdílení nic neprozradí');

        // Na úvodu výsledek; znovu otevřít = výsledek, XP podruhé ne
        await tab.click('[data-action="chain-home"]');
        await tab.waitForSelector('#chain-card[data-chain-status="done"]');
        assert.equal(await compact(tab, '#chain-card'), 'Řetězovka 3 body · 3/7');
        await openChain(tab);
        assert.ok(await tab.$('#chain-result'));
        assert.equal((await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')))).xp, 6);

        // Cvičná řetězovka: bez úvodu a bodů; odpovídá se první možností, dokud řetěz nepraskne nebo není celý
        await tab.click('[data-action="chain-practice"]');
        await tab.waitForSelector('#chain-screen', { timeout: 60000 });
        assert.match(await compact(tab, '#chain-screen'), /Cvičná řetězovka/i);
        assert.doesNotMatch(await compact(tab, '#chain-question'), /bod/);
        await audit(tab, 'otázka cvičné řetězovky');
        for (let step = 0; step < 20 && !(await tab.$('#chain-result')); step++) {
            if (await tab.$('[data-chain-decide]')) { await tab.click('[data-action="chain-giveup"]'); continue; }
            if (await tab.$('[data-chain-broken]')) { await tab.click('[data-action="chain-result"]'); continue; }
            const first = await tab.$('#chain-screen[data-chain-phase="ask"] [data-action="chain-choice"]');
            if (first) await first.click();
            await tab.waitForSelector('#chain-screen[data-chain-phase="ask"], [data-chain-decide], [data-chain-broken], #chain-result', { timeout: 15000 });
            await tab.waitForTimeout(100);
        }
        await tab.waitForSelector('#chain-result', { timeout: 15000 });
        assert.match(await compact(tab, '#chain-result'), /Cvičná řetězovka \d\/7 článků (Celý řetěz!|Řetěz se přetrhl)/i);
        assert.equal(await tab.$('[data-action="chain-share"]'), null, 'cvičná se nesdílí');
        assert.equal((await store(tab)).days[TODAY].score, 3, 'cvičná nic nezmění');
        assert.equal((await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')))).xp, 6, 'cvičná bez XP');
        await fitsScreen(tab, 'výsledek cvičné řetězovky');
        await audit(tab, 'výsledek cvičné řetězovky');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    for (const [viewport, colorScheme] of [[{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light']]) {
        await t.test(`vzhled ${viewport.width}×${viewport.height} (${colorScheme}): úvod, otázka, rozhodnutí, výsledek`, async () => {
            const { context, tab, log } = await open(browser, { 'mudrlant.chain': JSON.stringify({ intro: true }) }, { viewport, colorScheme });
            const tag = `${viewport.width}x${viewport.height}-${colorScheme}`;
            // Úvod bez posouvání hlídá tests/e2e-ui-audit.test.js (na 390×780 se zhuštění rozhoduje až po doplnění karet); tady kontroly rozhraní
            await tab.waitForTimeout(600);
            await audit(tab, `úvod ${tag}`);
            await shot(tab, `retezovka-uvod-${tag}`);
            await openChain(tab);
            await nextQuestion(tab, 1);
            await fitsScreen(tab, `otázka ${tag}`);
            await audit(tab, `otázka ${tag}`);
            await shot(tab, `retezovka-otazka-${tag}`);
            let ask = await answers(tab);
            await choose(tab, ask.right);
            await nextQuestion(tab, 2);
            ask = await answers(tab);
            await choose(tab, ask.wrong);
            await tab.waitForSelector('[data-chain-decide]');
            await fitsScreen(tab, `rozhodnutí ${tag}`);
            await audit(tab, `rozhodnutí ${tag}`);
            await shot(tab, `retezovka-praska-${tag}`);
            await tab.click('[data-action="chain-giveup"]');
            await tab.waitForSelector('[data-chain-broken]');
            await tab.click('[data-action="chain-result"]');
            await tab.waitForSelector('#chain-result');
            await tab.waitForTimeout(300);
            assert.match(await compact(tab, '#chain-result'), /1 bod 1\/7 článků \+2 XP/);
            await fitsScreen(tab, `výsledek ${tag}`);
            await audit(tab, `výsledek ${tag}`);
            await shot(tab, `retezovka-vysledek-${tag}`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('přihlášený: výsledek na server, pořadí dne a okno pořadí, dlaždice s místem; jiné zařízení a starší databáze', async () => {
        const db = newDb();
        const { context, tab, log } = await open(browser, { ...login, 'mudrlant.chain': JSON.stringify({ intro: true }) }, { db });
        await openChain(tab);
        await nextQuestion(tab, 1);
        assert.ok(db.calls.some(call => call.name === 'chain_day_stats'), 'nejdřív zjistí, jestli hráč nedohrál jinde');
        assert.ok(!db.calls.some(call => call.name === 'chain_submit'));
        assert.equal((await store(tab)).attempt.owner, 'u-1');
        for (let k = 1; k <= 2; k++) {
            const ask = await answers(tab);
            await choose(tab, ask.right);
            await nextQuestion(tab, k + 1);
        }
        let ask = await answers(tab);
        await choose(tab, ask.wrong);
        await tab.waitForSelector('[data-chain-decide]');
        await tab.click('[data-action="chain-giveup"]');
        await tab.click('[data-action="chain-result"]');
        for (let i = 0; i < 100 && !db.calls.some(call => call.name === 'chain_submit'); i++) await tab.waitForTimeout(100);
        await tab.waitForFunction(() => /2\. místo/.test((document.querySelector('[data-chain-community]') || {}).textContent || ''));
        assert.deepEqual(db.calls.filter(call => call.name === 'chain_submit').map(call => call.body), [{ for_day: TODAY, links: 2, score: 3, rescued: false }]);
        assert.equal(await compact(tab, '[data-chain-community]'), '2. místo z 41 · celý řetěz dalo 27 % · nejlepší 28 bodů');
        assert.equal((await store(tab)).attempt.synced, true);
        await fitsScreen(tab, 'výsledek přihlášeného');
        await audit(tab, 'výsledek přihlášeného');
        await shot(tab, 'retezovka-vysledek-prihlaseny-360x640-light');
        await tab.click('[data-action="chain-ranking"]');
        await tab.waitForSelector('[data-chain-ranking]');
        assert.match(await compact(tab, '[data-chain-ranking]'), /41 hráčů · celý řetěz 27 % · nejlepší 28 bodů 🏆 .*Petr Svoboda 28 bodů · 7\/7 2\. .*Jana Nováková \(ty\) 3 body · 2\/7/);
        await fitsDialog(tab, 'okno pořadí');
        await audit(tab, 'okno pořadí');
        await shot(tab, 'retezovka-poradi-360x640-light');
        await tab.keyboard.press('Escape');
        await tab.click('[data-action="chain-home"]');
        await tab.waitForSelector('#chain-card[data-chain-status="done"]');
        assert.equal(await compact(tab, '#chain-card'), 'Řetězovka 3 body · 2.');
        assert.deepEqual(log.errors, []);
        await context.close();

        // Jiné zařízení (bez místního pokusu): server ví, že hráč dnes dohrál → rovnou výsledek a dlaždice s místem
        const other = await open(browser, { ...login, 'mudrlant.chain': JSON.stringify({ intro: true }) }, { db });
        await other.tab.waitForSelector('#chain-card[data-chain-status="done"]', { timeout: 15000 });
        assert.equal(await compact(other.tab, '#chain-card'), 'Řetězovka 3 body · 2.');
        await openChain(other.tab);
        await other.tab.waitForSelector('#chain-result');
        assert.match(await compact(other.tab, '#chain-result'), /3 body 2\/7 článků/);
        assert.equal(db.calls.filter(call => call.name === 'chain_submit').length, 1, 'podruhé se neodesílá');
        await other.context.close();

        // Starší databáze bez funkcí: hraje se v zařízení, výsledek bez pořadí
        const old = newDb();
        old.missing = true;
        const legacy = await open(browser, { ...login, 'mudrlant.chain': JSON.stringify({ intro: true }) }, { db: old });
        await openChain(legacy.tab);
        await nextQuestion(legacy.tab, 1);
        ask = await answers(legacy.tab);
        await choose(legacy.tab, ask.wrong);
        await legacy.tab.waitForSelector('[data-chain-decide]');
        await legacy.tab.click('[data-action="chain-giveup"]');
        await legacy.tab.click('[data-action="chain-result"]');
        await legacy.tab.waitForSelector('#chain-result');
        await legacy.tab.waitForFunction(() => /není k dispozici/.test(document.getElementById('chain-stats').textContent));
        assert.deepEqual(legacy.log.errors, []);
        await legacy.context.close();
    });
});
