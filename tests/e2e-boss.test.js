// Boss týdne v prohlížeči (boss.js, app.js) s falešným Supabase v paměti: dlaždice v řadě Výzvy (3 pokusy, souboj běží, ❤ %, Poraženo!),
// úvod v aréně (řeč bosse, pravidla, Síň bossů), souboj (zásah s bonusem za rychlost, chyba s prasklým srdcem, vypršený čas, psaná odpověď
// u 4. a 8. otázky, poloviční čas na konci, boss mění stupně podle životů), výhra (emblém boss-kapitan, titul, 150 XP jen jednou za týden),
// prohra s dalším pokusem, rozehraný souboj po obnovení stránky, přihlášený se společnou lištou a odesláním pokusů na server, společný
// bonus příští týden, starší databáze bez funkcí. Úvod, souboj i výsledek se vejdou bez posouvání na 360×640 i 390×780, kontroly
// rozhraní jako tests/e2e-ui-audit.test.js, CSP bez chyb. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
// BOSS_SHOTS=<složka> uloží snímky obrazovek.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const Boss = require('../boss.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PHOTO = fs.readFileSync(path.join(ROOT, 'icons', 'topics', 'sova-vitej.webp'));
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
// Týden 9.–15. 11. 2026: boss Kapitán Mudrlant (Zeměpis – testovací data ho mají); čtvrtek 12. 11. ve 13:00 pražského času (UTC+1)
const WEEK = '2026-11-09';
const NEXT_WEEK = '2026-11-16';
const NOW = new Date('2026-11-12T12:00:00Z');
const SHOTS = process.env.BOSS_SHOTS || '';

const serveFile = (pathname) => {
    if (fixtures.files[pathname]) return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtures.files[pathname]) };
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true });

// Databáze bosse (zjednodušeně, pravidla hlídá tests/sql-boss.test.js); missing = starší databáze bez funkcí (404)
const newDb = () => ({ calls: [], missing: false, players: 10, beaten: 3, me: null, bonus: { xp: 0 }, profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊') } });
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
            if (/^boss_/.test(name)) {
                db.calls.push({ name, body });
                if (db.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                const week = (body && body.for_week) || WEEK;
                const mine = () => (db.me && week === WEEK ? { week: WEEK, attempts: db.me.attempts, best_damage: db.me.best, defeated: db.me.best >= 700, bonus_claimed: false } : null);
                if (name === 'boss_week_stats') return json({ week, players: db.players, defeated: db.beaten, defeated_pct: Math.round(100 * db.beaten / db.players), reached: db.beaten * 2 >= db.players, over: false, me: mine() });
                if (name === 'boss_submit') {
                    const attempts = db.me ? db.me.attempts : 0;
                    if (body.idx < attempts) return json({ ...mine(), first_win: false });
                    if (attempts >= 3) return json({ code: '22023', message: 'Pokusy na tento týden došly.' }, 400);
                    const first = body.is_defeated && !(db.me && db.me.best >= 700);
                    if (!db.me) db.players += 1;
                    if (first) db.beaten += 1;
                    db.me = { attempts: attempts + 1, best: Math.max(db.me ? db.me.best : 0, body.damage) };
                    return json({ ...mine(), first_win: first });
                }
                if (name === 'boss_claim_bonus') return json({ week: body.for_week, played: true, reached: db.bonus.xp > 0, claimed: db.bonus.xp > 0, xp: db.bonus.xp });
            }
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        const table = url.pathname.replace('/rest/v1/', '');
        const eq = (field) => (url.searchParams.get(field) || '').replace(/^eq\./, '');
        if (table === 'profiles') return json(db.profiles[eq('id')] ? [db.profiles[eq('id')]] : []);
        return json([]);
    });
};

const open = async (browser, storage, { viewport = { width: 360, height: 640 }, colorScheme = 'light', db = null, time = NOW, reducedMotion = 'reduce' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, deviceScaleFactor: 1, reducedMotion });
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
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: fixtures.extractFor(url.searchParams.get('titles')) } } } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org' || url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
        return route.abort();
    });
    if (db) await backend(context, db);
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    // Hodiny pod kontrolou testu: čas otázky se počítá jen tehdy, když ho test posune (runFor)
    await tab.clock.install({ time });
    await tab.goto(`${ORIGIN}/`);
    await tab.waitForSelector('#boss-card', { timeout: 30000 });
    return { context, tab, log };
};
const compact = async (tab, selector) => ((await tab.textContent(selector)) || '').replace(/\s+/g, ' ').trim();
const state = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.boss') || 'null'));
const progress = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress') || 'null'));
const INSPECT = (() => {
    const source = fs.readFileSync(path.join(__dirname, 'e2e-ui-audit.test.js'), 'utf8');
    const start = source.indexOf('const inspect = () => {');
    const end = source.indexOf('\ntest(', start);
    return start >= 0 && end > start ? source.slice(start + 'const inspect = '.length, end).trim().replace(/;$/, '') : null;
})();
const audit = async (tab, scene) => {
    if (!INSPECT) return;
    await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
    const found = await tab.evaluate(`(${INSPECT})()`);
    for (const kind of Object.keys(found)) assert.deepEqual(found[kind], [], `${scene}: ${kind}`);
};
const fitsScreen = async (tab, what) => {
    const size = await tab.evaluate(() => { const main = document.getElementById('app-content'); return { scroll: main.scrollHeight, client: main.clientHeight }; });
    assert.ok(size.scroll <= size.client + 1, `${what}: posouvá se (${size.scroll} > ${size.client})`);
};
const shot = async (tab, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
// Posun hodin (časovače hry: odpočet otázky, pauza po odpovědi)
const wait = (tab, ms) => tab.clock.runFor(ms);
const openIntro = async (tab) => {
    await tab.click('[data-action="boss-open"]');
    await tab.waitForSelector('#boss-intro');
    await wait(tab, 1500);
};
// Otázka souboje je na obrazovce (možnosti nebo pole na psaní)
const question = async (tab) => {
    await tab.waitForSelector('#boss-question [data-boss-answers]', { timeout: 30000 });
    return (await state(tab)).open.shown;
};
// Odpověď: správná / špatná podle uložené otázky (jako tests/e2e-daily-quiz.test.js čte relaci); u psaní správný název nebo nesmysl
const answer = async (tab, correct = true, { next = true } = {}) => {
    const shown = await question(tab);
    if (await tab.$('#boss-input')) {
        await tab.fill('#boss-input', correct ? shown.data.question.answerLabel : 'Atlantida');
        await tab.click('#boss-form button[type="submit"]');
    } else {
        const index = shown.data.question.choices.findIndex(choice => (correct ? choice.correct : !choice.correct));
        await tab.click(`[data-action="boss-choice"][data-index="${index}"]`);
    }
    await tab.waitForSelector('[data-boss-bubble]');
    if (next) await wait(tab, 3000);
    return shown;
};
const hp = async (tab) => Number(await tab.getAttribute('#boss-strip [data-boss-hp]', 'data-boss-hp'));
// Zbývající čas těsně po ukázání otázky (běh testu smí ubrat pár sekund skutečného času)
const clockNear = async (tab, limit) => {
    const left = Number(await compact(tab, '#boss-strip [data-boss-clock]'));
    assert.ok(left <= limit && left >= limit - 3, `čas na otázku ${limit} s, zbývá ${left} s`);
};

test('Boss týdne v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    assert.equal(Boss.bossForWeek(WEEK).id, 'kapitan');

    await t.test('host (360×640): dlaždice, úvod v aréně, souboj se zásahy, chybou, psanou odpovědí a stupni bosse, výhra s emblémem a XP', async () => {
        const { context, tab, log } = await open(browser, {});
        assert.equal(await compact(tab, '#boss-card'), 'Boss týdne 3 pokusy');
        assert.equal(await tab.getAttribute('#boss-card', 'data-boss-status'), 'new');
        assert.ok(await tab.$('#boss-card [data-boss-new]'), 'zlatá tečka: tento týden ještě nehráno');
        assert.ok(await tab.$('#home-specials #quiz-card + #boss-card, #home-specials #boss-card'), 'v řadě Výzvy');
        await fitsScreen(tab, 'úvod s dlaždicí bosse (360×640)');
        await audit(tab, 'úvod s dlaždicí bosse (360×640)');
        await shot(tab, 'uvod-360x640');

        await openIntro(tab);
        assert.match(await compact(tab, '#app-header'), /Boss týdne/);
        assert.match(await compact(tab, '#boss-intro'), /Kapitán Mudrlant/);
        assert.match(await compact(tab, '#boss-intro'), /Mořský vlk · Zeměpis/);
        const speech = await compact(tab, '#boss-speech [data-boss-speech-text]');
        assert.ok(Boss.BY_ID.kapitan.intro.includes(speech), `úvodní řeč: ${speech}`);
        assert.match(await compact(tab, '#boss-intro [data-boss-status]'), /3 pokusy na tento týden, počítá se nejlepší/);
        assert.match(await compact(tab, '#boss-intro [data-boss-community]'), /Po přihlášení uvidíš, kolik hráčů bosse porazilo/);
        assert.equal(await compact(tab, '[data-action="boss-start"]'), 'Do souboje');
        await fitsScreen(tab, 'úvod souboje (360×640)');
        await audit(tab, 'úvod souboje (360×640)');
        await shot(tab, 'arena-uvod-360x640');
        // Pravidla a Síň bossů v okně
        await tab.click('[data-action="boss-rules"]');
        await tab.waitForSelector('[data-boss-rules]');
        assert.match(await compact(tab, '[data-boss-rules]'), /4\. a 8\. otázky schová možnosti/);
        await tab.click('#dialog-overlay [data-close]');
        await tab.click('[data-action="boss-hall"]');
        await tab.waitForSelector('[data-boss-hall-list]');
        assert.equal(await tab.$$eval('[data-boss-hall]', items => items.length), Boss.BOSSES.length);
        assert.match(await compact(tab, '[data-boss-hall="kapitan"]'), /Boss tohoto týdne/);
        await audit(tab, 'Síň bossů (360×640)');
        await shot(tab, 'sin-bossu-360x640');
        await tab.click('#dialog-overlay [data-close]');

        // Souboj
        await tab.click('[data-action="boss-start"]');
        await question(tab);
        assert.equal(await hp(tab), 700);
        assert.equal(await tab.getAttribute('#boss-strip [data-boss-hearts]', 'data-boss-hearts'), '3');
        assert.equal(await compact(tab, '#boss-strip [data-boss-count]'), 'Otázka 1/10');
        await clockNear(tab, 30);
        assert.equal(await tab.$('#boss-input'), null, 'první otázka s možnostmi');
        await fitsScreen(tab, 'souboj (360×640)');
        await audit(tab, 'souboj (360×640)');
        await shot(tab, 'souboj-360x640');
        // Rychlá správná odpověď: 50 + plný bonus 30
        await answer(tab, true, { next: false });
        assert.equal(await hp(tab), 620);
        assert.equal(await tab.getAttribute('[data-boss-bubble]', 'data-boss-bubble'), 'hit');
        assert.ok(Boss.BY_ID.kapitan.hit.includes(await compact(tab, '[data-boss-bubble] p:last-child')));
        assert.equal(await compact(tab, '#boss-strip .boss-dmg'), '−80');
        assert.equal(await compact(tab, '#boss-strip .boss-dmg-tag'), 'Rychlý zásah!');
        await shot(tab, 'zasah-360x640');
        await wait(tab, 3000);
        // Chyba: srdce praskne, boss se posměje (stupeň 1 = nafoukaný)
        await answer(tab, false, { next: false });
        assert.equal(await tab.getAttribute('#boss-strip [data-boss-hearts]', 'data-boss-hearts'), '2');
        assert.ok(await tab.$('#boss-strip .boss-heart-break'), 'srdce praskne');
        assert.equal(await tab.getAttribute('[data-boss-bubble]', 'data-boss-bubble'), 'taunt');
        assert.ok(Boss.BY_ID.kapitan.taunt[1].includes(await compact(tab, '[data-boss-bubble] p:last-child')), 'posměšek ve stupni 1');
        assert.equal(await hp(tab), 620);
        await shot(tab, 'chyba-360x640');
        await wait(tab, 3000);
        // Pomalejší odpověď (13 s): menší bonus za rychlost (do 20 s klesá k nule)
        await question(tab);
        await wait(tab, 13000);
        await answer(tab, true);
        const slow = (await state(tab)).open.results[2];
        assert.ok(slow.ms >= 13000 && slow.ms < 20000, `čas ${slow.ms} ms`);
        assert.equal(await hp(tab), 620 - Boss.damageFor(true, slow.ms));
        assert.ok(Boss.damageFor(true, slow.ms) < 80 && Boss.damageFor(true, slow.ms) > 50);
        // 4. otázka: schválnost – možnosti schované, odpověď se píše
        await question(tab);
        assert.ok(await tab.$('#boss-input'), 'psaná odpověď');
        assert.equal(await tab.$('[data-action="boss-choice"]'), null);
        assert.equal(await tab.getAttribute('[data-boss-trick]', 'data-boss-trick'), 'typed');
        await clockNear(tab, 40);
        await fitsScreen(tab, 'psaná otázka (360×640)');
        await audit(tab, 'psaná otázka (360×640)');
        await shot(tab, 'psani-360x640');
        await answer(tab, true, { next: false });
        assert.equal(await tab.getAttribute('[data-boss-typed]', 'data-boss-typed'), 'correct');
        assert.equal(await tab.getAttribute('#boss-strip', 'data-stage'), '1');
        await wait(tab, 3000);
        // 5. otázka: boss klesne pod dvě třetiny životů → stupeň 2 (Zraněný): záblesk, nový obrázek, hláška stupně
        await answer(tab, true, { next: false });
        let status = Boss.fightStatus((await state(tab)).open.results);
        assert.equal(await hp(tab), status.hp);
        assert.equal(status.stage, 2);
        assert.equal(await tab.getAttribute('#boss-strip', 'data-stage'), '2');
        assert.equal(await tab.getAttribute('#boss-portrait', 'data-stage'), '2');
        assert.equal(await compact(tab, '#boss-strip [data-boss-stage-label]'), 'Zraněný');
        assert.equal(await tab.getAttribute('[data-boss-bubble]', 'data-boss-bubble'), 'stage');
        assert.ok(Boss.BY_ID.kapitan.stage[2].includes(await compact(tab, '[data-boss-bubble] p:last-child')), 'hláška stupně 2');
        assert.ok(await tab.$('#boss-portrait.boss-standin-2'), 'zástupný obrázek s filtrem stupně 2');
        await shot(tab, 'stupen-2-360x640');
        await wait(tab, 3000);
        // Vypršený čas: chyba, srdce praskne; posměšek ve stupni 2 je nervózní
        await question(tab);
        await wait(tab, 31000);
        await tab.waitForSelector('[data-boss-timeout]');
        assert.equal(await tab.getAttribute('#boss-strip [data-boss-hearts]', 'data-boss-hearts'), '1');
        assert.ok(Boss.BY_ID.kapitan.taunt[2].includes(await compact(tab, '[data-boss-bubble] p:last-child')), 'posměšek ve stupni 2');
        assert.equal((await state(tab)).open.results[5].timeout, true);
        await wait(tab, 3000);
        await answer(tab, true);
        // 8. otázka: psaní a poloviční čas (20 s)
        await question(tab);
        assert.equal(await tab.getAttribute('[data-boss-trick]', 'data-boss-trick'), 'both');
        await clockNear(tab, 20);
        await answer(tab, true);
        // 9. otázka: poloviční čas 15 s; boss je v koncích (stupeň 3)
        await question(tab);
        await clockNear(tab, 15);
        assert.equal(await tab.getAttribute('[data-boss-trick]', 'data-boss-trick'), 'half');
        await answer(tab, true, { next: false });
        status = Boss.fightStatus((await state(tab)).open.results);
        assert.equal(status.stage, 3);
        assert.equal(await tab.getAttribute('#boss-strip', 'data-stage'), '3');
        assert.equal(await compact(tab, '#boss-strip [data-boss-stage-label]'), 'V koncích');
        assert.ok(await tab.$('#boss-portrait.boss-standin-3'));
        await shot(tab, 'stupen-3-360x640');
        await wait(tab, 3000);
        // 10. otázka správně, ale boss vydrží: prohra, počítá se uštědřené poškození
        await answer(tab, true, { next: false });
        status = Boss.fightStatus((await state(tab)).open.results);
        assert.ok(status.over && !status.won && status.hp > 0);
        await wait(tab, 3000);
        await tab.waitForSelector('#boss-result[data-boss-outcome="lost"]');
        assert.match(await compact(tab, '#boss-result'), /Boss odolal/);
        assert.match(await compact(tab, '#boss-result'), new RegExp(`vydržel s ${status.percent} % životů`));
        assert.match(await compact(tab, '[data-boss-attempts]'), new RegExp(`Nejlepší pokus: ${status.damage} poškození · zbývají 2 pokusy`));
        assert.equal(await compact(tab, '[data-action="boss-again"]'), 'Zkusit znovu');
        await fitsScreen(tab, 'prohra (360×640)');
        await audit(tab, 'prohra (360×640)');
        await shot(tab, 'prohra-360x640');
        let saved = await state(tab);
        assert.equal(saved.open, null);
        assert.deepEqual(saved.weeks[WEEK].attempts.map(row => [row.n, row.damage, row.defeated]), [[1, status.damage, false]]);
        assert.equal((await progress(tab)).counters.bossFights, 1);
        await tab.click('[data-action="boss-home"]');
        await tab.waitForSelector('#boss-card[data-boss-status="played"]');
        assert.equal(await compact(tab, '#boss-card'), `Boss týdne ❤ ${status.percent} %`);
        await tab.click('[data-action="boss-open"]');
        await tab.waitForSelector('#boss-intro');
        assert.equal(await compact(tab, '[data-action="boss-start"]'), 'Do souboje · 2. pokus');
        await tab.click('[data-action="boss-start"]');

        // Druhý pokus: jiné otázky (semínko pokusu), výhra rychlými odpověďmi bez chyby
        const first = await question(tab);
        assert.equal((await state(tab)).open.n, 2);
        for (let i = 0; i < 9; i++) await answer(tab, true, { next: i < 8 });
        assert.equal(await hp(tab), 0);
        assert.equal(await tab.getAttribute('#boss-portrait', 'data-stage'), '4');
        assert.equal(await tab.getAttribute('[data-boss-bubble]', 'data-boss-bubble'), 'defeat');
        assert.ok(await tab.$('#boss-portrait img[src$="sova-prohra-modra.webp"]'), 'obrázek poraženého bosse');
        await shot(tab, 'porazeny-360x640');
        await wait(tab, 3500);
        await tab.waitForSelector('#boss-result[data-boss-outcome="won"]');
        assert.match(await compact(tab, '#boss-result h1'), /Vítězství!/);
        assert.match(await compact(tab, '[data-boss-reward]'), /Titul „Přemožitel Kapitána“/);
        assert.match(await compact(tab, '[data-boss-xp]'), /\+150 XP/);
        assert.ok(await tab.$('[data-boss-reward] [data-badge-art] img'), 'emblém: portrét v kulatém rámu');
        await fitsScreen(tab, 'výhra (360×640)');
        await audit(tab, 'výhra (360×640)');
        await shot(tab, 'vyhra-360x640');
        const won = await progress(tab);
        assert.ok(won.badges['boss-kapitan'], 'emblém boss-kapitan mezi odznaky');
        assert.equal(won.counters.bossWins, 1);
        assert.equal(won.counters.bossFights, 2);
        saved = await state(tab);
        assert.equal(saved.emblems.kapitan, WEEK);
        assert.equal(saved.weeks[WEEK].xp, true);
        assert.ok(first.data.id, 'druhý pokus má vlastní otázky (semínko týdne a pokusu)');
        // Titul u jména jde nastavit (odznak), na úvodu dlaždice Poraženo!
        assert.equal(await tab.evaluate(() => window.MudrlantLook.normalize({ title: 'boss-kapitan' }, { level: 1, badges: JSON.parse(localStorage.getItem('mudrlant.progress')).badges }).title), 'boss-kapitan');
        await tab.click('[data-action="boss-home"]');
        await tab.waitForSelector('#boss-card[data-boss-status="defeated"]');
        assert.equal(await compact(tab, '#boss-card'), 'Boss týdne Poraženo!');
        await fitsScreen(tab, 'úvod po výhře (360×640)');
        // Úvod po výhře: další souboj už ne, příští boss
        await tab.click('[data-action="boss-open"]');
        await tab.waitForSelector('#boss-intro');
        assert.equal(await tab.$('[data-action="boss-start"]'), null);
        assert.match(await compact(tab, '[data-boss-next]'), /V pondělí přijde Rytíř Mudrlant/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('rozehraný souboj po obnovení stránky pokračuje stejnou otázkou, čas běží dál (390×780, tmavý režim)', async () => {
        const { context, tab, log } = await open(browser, {}, { viewport: { width: 390, height: 780 }, colorScheme: 'dark' });
        await openIntro(tab);
        await fitsScreen(tab, 'úvod souboje (390×780)');
        await audit(tab, 'úvod souboje (390×780, tmavý)');
        await shot(tab, 'arena-uvod-390x780-tmava');
        await tab.click('[data-action="boss-start"]');
        await answer(tab, true);
        const shown = await question(tab);
        await fitsScreen(tab, 'souboj (390×780)');
        await audit(tab, 'souboj (390×780, tmavý)');
        await shot(tab, 'souboj-390x780-tmava');
        await wait(tab, 5000);
        await tab.reload();
        await tab.waitForSelector('#boss-card[data-boss-status="open"]');
        assert.equal(await compact(tab, '#boss-card'), 'Boss týdne Souboj běží');
        await tab.click('[data-action="boss-open"]');
        await tab.waitForSelector('#boss-intro');
        assert.match(await compact(tab, '[data-action="boss-start"]'), /Pokračovat v souboji · otázka 2\/10/);
        await tab.click('[data-action="boss-start"]');
        const again = await question(tab);
        assert.equal(again.data.id, shown.data.id, 'stejná otázka');
        assert.equal(again.at, shown.at, 'čas otázky běží od prvního ukázání');
        const left = Number(await compact(tab, '#boss-strip [data-boss-clock]'));
        assert.ok(left <= 25 && left >= 15, `čas běží dál: zbývá ${left} s`);
        assert.equal(await hp(tab), 620);
        // Domů během souboje: souboj zůstane rozehraný
        await tab.click('#btn-home');
        await tab.waitForSelector('#boss-card[data-boss-status="open"]');
        assert.ok((await state(tab)).open);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('přihlášený: společná lišta, pokus na server, pokusy došly; příští týden společný bonus 50 XP (390×780)', async () => {
        const db = newDb();
        const { context, tab, log } = await open(browser, login('tok-u1'), { viewport: { width: 390, height: 780 }, db });
        await openIntro(tab);
        await tab.waitForSelector('[data-boss-community="open"]');
        assert.match(await compact(tab, '[data-boss-community]'), /Bosse tento týden porazilo 30 % hráčů\s*3 z 10/);
        assert.match(await compact(tab, '[data-boss-community]'), /aspoň polovina hráčů, kteří to zkusili, dostane každý z nich 50 XP navíc/);
        await fitsScreen(tab, 'úvod se společnou lištou (390×780)');
        await audit(tab, 'úvod se společnou lištou (390×780)');
        await shot(tab, 'arena-prihlaseny-390x780');
        // Prohra třemi chybami
        await tab.click('[data-action="boss-start"]');
        await answer(tab, true);
        for (let i = 0; i < 3; i++) await answer(tab, false, { next: i < 2 });
        await wait(tab, 3000);
        await tab.waitForSelector('#boss-result[data-boss-outcome="lost"]');
        await tab.waitForFunction(() => document.querySelector('[data-boss-community]') && /4 z 11|11/.test(document.querySelector('[data-boss-community]').textContent));
        const submit = db.calls.find(call => call.name === 'boss_submit');
        assert.deepEqual(submit.body, { for_week: WEEK, idx: 0, damage: 80, is_defeated: false });
        assert.ok((await state(tab)).weeks[WEEK].attempts[0].synced, 'pokus odeslaný');
        await fitsScreen(tab, 'prohra přihlášeného (390×780)');
        await audit(tab, 'prohra přihlášeného (390×780)');
        // Server zná 3 pokusy (dva z jiného zařízení): souboj už nejde začít
        db.me.attempts = 3;
        db.me.best = 300;
        await tab.click('[data-action="boss-home"]');
        await tab.click('[data-action="boss-open"]');
        await tab.waitForFunction(() => /Pokusy na tento týden došly/.test(document.querySelector('#boss-intro [data-boss-status]').textContent));
        assert.equal(await tab.$('[data-action="boss-start"]'), null);
        assert.match(await compact(tab, '#boss-intro [data-boss-status]'), /Nejlepší pokus: 300 poškození/);
        await tab.click('[data-action="boss-home"]');
        await tab.waitForSelector('#boss-card[data-boss-status="out"]');
        assert.equal(await compact(tab, '#boss-card'), 'Boss týdne ❤ 58 %');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();

        // Příští týden: společný bonus za minulý týden (jednou), boss Rytíř Mudrlant
        db.bonus = { xp: 50 };
        // XP z účtu (falešný profil má 100) + společný bonus
        const xpBefore = 100;
        const later = await open(browser, login('tok-u1'), { viewport: { width: 390, height: 780 }, db, time: new Date('2026-11-16T09:00:00Z') });
        await later.tab.waitForFunction(() => JSON.parse(localStorage.getItem('mudrlant.boss') || '{"claims":{}}').claims['u-1'] === '2026-11-09');
        // Bonus se zkouší za minulý týden jednou: 2. 11. (při prvním otevření, cíl nesplněn) a 9. 11. (splněno: +50 XP)
        const claim = db.calls.filter(call => call.name === 'boss_claim_bonus');
        assert.deepEqual(claim.map(call => call.body), [{ for_week: '2026-11-02' }, { for_week: WEEK }]);
        assert.equal((await progress(later.tab)).xp, xpBefore + 50);
        await later.tab.waitForSelector('#celebration');
        assert.match(await compact(later.tab, '#celebration'), /Společná výhra!/);
        assert.match(await compact(later.tab, '#boss-card'), /3 pokusy/);
        assert.match(await later.tab.getAttribute('#boss-card', 'aria-label'), /Rytíř Mudrlant/);
        await later.tab.reload();
        await later.tab.waitForSelector('#boss-card');
        await wait(later.tab, 2000);
        assert.equal(db.calls.filter(call => call.name === 'boss_claim_bonus').length, 2, 'bonus za týden jen jednou');
        assert.deepEqual(later.log.errors, []);
        await later.context.close();
    });

    await t.test('starší databáze bez funkcí: hraje se v zařízení, bez společné lišty', async () => {
        const db = newDb();
        db.missing = true;
        const { context, tab, log } = await open(browser, login('tok-u1'), { db });
        await openIntro(tab);
        await tab.waitForSelector('[data-boss-community="off"]');
        await tab.click('[data-action="boss-start"]');
        await answer(tab, true);
        assert.equal(await hp(tab), 620);
        assert.deepEqual(log.errors, []);
        await context.close();
    });
});
