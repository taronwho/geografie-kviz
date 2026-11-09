// Kvíz dne v prohlížeči (daily-quiz.js, share-card.js) s falešným Supabase v paměti: karta na úvodu, úvod s pravidly, deset otázek jen s výběrem
// z možností (i když hráč jinak píše), pokračování po zavření (stejná otázka, nápovědy i čas zůstanou), výsledek s mřížkou, XP a sérií,
// sdílení textem (schránka) a obrázkem (PNG z plátna bez „zašpinění“, stažení), host bez pořadí s pozvánkou k přihlášení, přihlášený
// s odpověďmi na serveru po otázkách, pořadím dne a přátel, převzetí hostovského výsledku po přihlášení, obrázek u dnešní otázky a po vyhrané výzvě.
// CSP bez chyb, 360×640 i 390×780. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const DQ = require('../daily-quiz.js');
const TODAY = '2026-11-08';

const serveFile = (pathname) => {
    if (fixtures.files[pathname]) return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtures.files[pathname]) };
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true, ...extra });

// Databáze Kvízu dne jako v supabase/schema.sql (zjednodušeně, pravidla hlídá tests/sql-daily-quiz.test.js)
const newDb = () => ({
    log: [], answers: [], missing: false, fail: {},
    profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald' }), 'u-2': player('u-2', 'Petr Svoboda', '🐼'), 'u-3': player('u-3', 'Eva Mistr', '🦉') },
    friendships: [{ user_id: 'u-1', friend_id: 'u-2', status: 'accepted' }],
    // dohrané pokusy jiných hráčů dnes
    quiz: {
        [`u-2|${TODAY}`]: { user_id: 'u-2', day: TODAY, answered: 10, correct: 9, score: 30, time_ms: 70000, bitmap: 1022, finished: true },
        [`u-3|${TODAY}`]: { user_id: 'u-3', day: TODAY, answered: 10, correct: 10, score: 40, time_ms: 55000, bitmap: 1023, finished: true }
    },
    challenges: {}, results: []
});
const quizJson = (db, uid, row) => {
    const days = Object.values(db.quiz).filter(r => r.user_id === uid && r.answered > 0 && (r.finished || r.day < TODAY)).map(r => r.day);
    return { day: TODAY, started: Boolean(row), answered: row ? row.answered : 0, correct: row ? row.correct : 0, score: row ? row.score : 0, time_ms: row ? row.time_ms : 0, bitmap: row ? row.bitmap : 0, finished: Boolean(row && row.finished), streak: DQ.streakOf(days, TODAY), best_streak: DQ.bestStreakOf(days) };
};
const ranked = (db, filter) => Object.values(db.quiz).filter(r => r.day === TODAY && r.finished && filter(r))
    .sort((a, b) => b.score - a.score || a.time_ms - b.time_ms)
    .map((r, i, all) => ({ ...r, rank: 1 + all.filter(o => o.score > r.score || (o.score === r.score && o.time_ms < r.time_ms)).length, pos: i + 1 }));

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
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
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        if (rpc) {
            const name = rpc[1];
            db.log.push(name);
            if (name === 'schema_version') return json(REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'friends_list') return json([]);
            if (/^daily_quiz_/.test(name)) {
                if (db.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                if (db.fail[name]) return json({ code: '22023', message: db.fail[name] }, 400);
                const key = `${me.id}|${TODAY}`;
                const row = db.quiz[key];
                if (name === 'daily_quiz_state') return json(quizJson(db, me.id, row));
                if (name === 'daily_quiz_start') {
                    if (!row) db.quiz[key] = { user_id: me.id, day: TODAY, answered: 0, correct: 0, score: 0, time_ms: 0, bitmap: 0, finished: false };
                    return json(quizJson(db, me.id, db.quiz[key]));
                }
                if (name === 'daily_quiz_answer') {
                    db.answers.push({ user: me.id, ...body });
                    if (body.for_day !== TODAY) return json({ code: '22023', message: 'Tenhle Kvíz dne už skončil. Dnes je nový.' }, 400);
                    if (!row) return json({ code: '22023', message: 'Kvíz dne nejdřív začni.' }, 400);
                    if ((body.is_correct && (body.points < 1 || body.points > 4)) || (!body.is_correct && body.points !== 0)) return json({ code: '22023', message: 'Neplatné body.' }, 400);
                    if (body.idx < row.answered) return ((row.bitmap >> body.idx) & 1) === (body.is_correct ? 1 : 0) ? json(quizJson(db, me.id, row)) : json({ code: '22023', message: 'Na tuhle otázku už odpověď máš.' }, 400);
                    if (body.idx > row.answered) return json({ code: '22023', message: 'Nejdřív se musí uložit předchozí otázka.' }, 400);
                    Object.assign(row, { answered: row.answered + 1, correct: row.correct + (body.is_correct ? 1 : 0), score: row.score + body.points, time_ms: row.time_ms + Math.max(body.ms, 1000), bitmap: row.bitmap | (body.is_correct ? 1 << body.idx : 0) });
                    row.finished = row.answered === 10;
                    return json(quizJson(db, me.id, row));
                }
                const shape = (r) => ({ rank: r.rank, ...profile(r.user_id), score: r.score, correct: r.correct, time_ms: r.time_ms, me: r.user_id === me.id });
                if (name === 'daily_quiz_board') {
                    const all = ranked(db, () => true);
                    const mine = all.find(r => r.user_id === me.id);
                    const days = Object.values(db.quiz).filter(r => r.user_id === me.id && r.finished).map(r => r.day);
                    return json({ day: TODAY, total: all.length, top: all.filter(r => r.pos <= (body.top_n || 50)).map(shape), me: mine ? { rank: mine.rank, score: mine.score, correct: mine.correct, time_ms: mine.time_ms, bitmap: mine.bitmap, answered: mine.answered } : null, streak: DQ.streakOf(days, TODAY), best_streak: DQ.bestStreakOf(days) });
                }
                if (name === 'daily_quiz_friends') {
                    const circle = db.friendships.filter(f => f.status === 'accepted' && (f.user_id === me.id || f.friend_id === me.id)).map(f => (f.user_id === me.id ? f.friend_id : f.user_id));
                    return json({ day: TODAY, friends: circle.length, rows: ranked(db, r => r.user_id === me.id || circle.includes(r.user_id)).map(shape) });
                }
            }
            if (name === 'weekly_leaderboard') return json([]);
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        const table = url.pathname.replace('/rest/v1/', '');
        const eq = (field) => (url.searchParams.get(field) || '').replace(/^eq\./, '');
        if (table === 'profiles') return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        if (table === 'challenges') return json(db.challenges[eq('id')] ? [{ ...db.challenges[eq('id')], creator: profile(db.challenges[eq('id')].creator_id), invited: null }] : []);
        if (table === 'challenge_results') {
            if (request.method() === 'POST') { db.results.push({ ...body, finished_at: new Date().toISOString() }); return route.fulfill({ status: 201, body: '' }); }
            if (url.searchParams.get('challenge_id')) return json(db.results.filter(r => r.challenge_id === eq('challenge_id')).map(r => ({ ...r, player: profile(r.user_id) })));
            return json([]);
        }
        return json([]);
    });
};

const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, colorScheme = 'light', db = null } = {}) => {
    // Bez animací (fade-in posouvá obsah o 10 px a měření výšky by ho počítalo)
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, acceptDownloads: true, reducedMotion: 'reduce' });
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
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: fixtures.extractFor(url.searchParams.get('titles')) } } } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org' || url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    if (db) await backend(context, db);
    else await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await tab.clock.setFixedTime(new Date(`${TODAY}T10:00:00Z`));
    await tab.goto(`${ORIGIN}/`);
    await tab.waitForSelector('#quiz-card', { timeout: 30000 });
    return { context, tab, log };
};
const compact = async (tab, selector) => ((await tab.textContent(selector)) || '').replace(/\s+/g, ' ').trim();
const quizStore = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.dailyQuiz') || 'null'));
const session = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
// Odpověď na otázku kvízu: správná (podle uložené otázky), nebo špatná; volitelně s nápovědou
const answer = async (tab, { correct = true, hint = false, next = true } = {}) => {
    await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
    if (hint && await tab.$('[data-action="hint"]')) await tab.click('[data-action="hint"]');
    const data = await session(tab);
    const index = data.question.choices.findIndex(choice => (correct ? choice.correct : !choice.correct));
    await tab.click(`[data-action="choice"][data-index="${index}"]`);
    await tab.waitForSelector('[data-action="next"]');
    if (next) await tab.click('[data-action="next"]');
    return data;
};
// Stejné kontroly rozhraní jako tests/e2e-ui-audit.test.js (vodorovný posun, zakrytí, malé dotykové plochy, kontrast, uříznutý text)
const INSPECT = (() => {
    const source = fs.readFileSync(path.join(__dirname, 'e2e-ui-audit.test.js'), 'utf8');
    const start = source.indexOf('const inspect = () => {');
    const end = source.indexOf('\ntest(', start);
    return start >= 0 && end > start ? source.slice(start + 'const inspect = '.length, end).trim().replace(/;$/, '') : null;
})();
const audit = async (tab, scene) => {
    if (!INSPECT) return;
    // Oslava nové úrovně (po prvním dohraném kvízu) je přechodná karta přes obrazovku, s kvízem nesouvisí
    await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
    await tab.waitForTimeout(150);
    const found = await tab.evaluate(`(${INSPECT})()`);
    for (const kind of Object.keys(found)) assert.deepEqual(found[kind], [], `${scene}: ${kind}`);
};
const fitsScreen = async (tab, what) => {
    const size = await tab.evaluate(() => { const main = document.getElementById('app-content'); return { scroll: main.scrollHeight, client: main.clientHeight }; });
    assert.ok(size.scroll <= size.client + 1, `${what}: posouvá se (${size.scroll} > ${size.client})`);
};

test('Kvíz dne v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    await t.test('host: karta, úvod, 10 otázek jen s možnostmi, výsledek, XP, sdílení textem i obrázkem, jeden pokus', async () => {
        // Hráč jinak píše odpovědi: Kvíz dne je pro všechny s výběrem z možností
        const { context, tab, log } = await setup(browser, { 'mudrlant.variant': 'typed' }, { viewport: { width: 360, height: 640 } });
        assert.equal(await tab.getAttribute('#quiz-card', 'data-quiz-status'), 'new');
        assert.ok(await tab.$('#quiz-card [data-quiz-new]'), 'zlatá tečka: dnes ještě nehráno');
        assert.match(await compact(tab, '#quiz-card'), /Kvíz dne 10 otázek pro všechny · pořadí Hrát/);
        await fitsScreen(tab, 'úvod s kartou Kvízu dne (360×640)');
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-intro');
        const intro = await compact(tab, '#quiz-intro');
        assert.match(intro, /Kvíz dne · 8\. 11\. 2026/);
        assert.match(intro, /Stejných 10 otázek pro všechny/);
        assert.match(intro, /Dnešní otázky \(jedna z každého tématu\) zůstávají zvlášť/);
        assert.match(intro, /Hraješ bez přihlášení/);
        assert.equal(await tab.$$eval('#quiz-intro [aria-label="Témata dnešních otázek"] > *', items => items.length), 10, 'deset témat dne');
        await fitsScreen(tab, 'úvod Kvízu dne (360×640)');
        await audit(tab, 'úvod Kvízu dne (360×640)');
        await tab.click('[data-action="quiz-start"]');
        const seen = [];
        for (let i = 0; i < 10; i++) {
            await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
            assert.equal(await tab.$('#answer-form'), null, 'žádné psaní odpovědi');
            assert.match(await compact(tab, '#status-text'), new RegExp(`Kvíz dne · ${i + 1}/10`));
            assert.ok(await tab.$('[data-tour-timer]'), 'u otázky běží čas');
            // Body ve hře: čip vlevo nahoře (správná odpověď bez nápovědy za 4 body, třetí otázka špatně), vedle času se nepřekrývá
            assert.equal(await compact(tab, '[data-score-chip]'), `${4 * (i - (i > 2 ? 1 : 0))} b`);
            assert.ok(await tab.evaluate(() => document.querySelector('[data-score-chip]').getBoundingClientRect().right < document.querySelector('[data-score-chip] ~ span').getBoundingClientRect().left), 'čip a čas se nepřekrývají');
            if (i === 5 && process.env.SCREENSHOT_DIR) await tab.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'kviz-dne-body-360x640-light.png') });
            const data = await answer(tab, { correct: i !== 2, next: false });
            seen.push(`${data.topic}:${data.id}`);
            assert.match(await compact(tab, '[data-action="next"]'), i < 9 ? new RegExp(`Další otázka \\(${i + 2}/10\\)`) : /Dokončit Kvíz dne/);
            await tab.click('[data-action="next"]');
        }
        assert.equal(new Set(seen).size, 10, 'žádná otázka se neopakuje');
        assert.ok(new Set(seen.map(id => id.split(':')[0])).size >= 8, 'otázky z různých témat');
        await tab.waitForSelector('#quiz-result');
        const result = await compact(tab, '#quiz-result');
        assert.match(result, /9\/10/);
        assert.match(result, /\+30 XP za dokončený Kvíz dne/);
        assert.match(result, /Moje série Kvízu dne\s*1 den/);
        assert.match(result, /Přihlas se a uvidíš se v pořadí/);
        await audit(tab, 'výsledek hosta (360×640)');
        assert.equal(await tab.$$eval('[data-quiz-grid] > span', cells => cells.map(cell => cell.className.includes('emerald') ? 1 : 0).join('')), '1101111111');
        // Text ke sdílení: bez navigator.share (headless) jde do schránky
        await tab.click('[data-action="quiz-share"]');
        await tab.waitForSelector('#toast:not(.opacity-0)');
        const url = `${ORIGIN}/`;
        assert.equal(await tab.evaluate(() => navigator.clipboard.readText()), `Mudrlant · Kvíz dne 8. 11. · 9/10 🟩🟩🟥🟩🟩🟩🟩🟩🟩🟩 · ${url}`);
        // Obrázek: PNG z plátna (nezašpiněného, obrázky z vlastního původu) se bez sdílení souborů stáhne
        const [download] = await Promise.all([tab.waitForEvent('download'), tab.click('[data-action="quiz-share-image"]')]);
        assert.equal(download.suggestedFilename(), `mudrlant-kviz-dne-${TODAY}.png`);
        const file = fs.readFileSync(await download.path());
        assert.equal(file.subarray(1, 4).toString(), 'PNG');
        assert.ok(file.length > 20000, `obrázek má obsah (${file.length} B)`);
        const card = await tab.evaluate(async () => {
            const canvas = await window.MudrlantShareCard.render({ kicker: 'Kvíz dne', headline: '9/10', detail: '30 bodů', grid: [true, false], day: '2026-11-08', robe: 'zelena', pose: 'oslava', url: location.href });
            // plátno jde přečíst (není zašpiněné) a sova v barvě obleku i logo se načetly ze stejného původu
            return { size: [canvas.width, canvas.height], png: canvas.toDataURL('image/png').slice(0, 22), owl: canvas.dataset.owl, logo: canvas.dataset.logo };
        });
        assert.deepEqual(card.size, [1080, 1080]);
        assert.equal(card.png, 'data:image/png;base64,');
        assert.equal(card.owl, 'icons/topics/sova-oslava-zelena.webp');
        assert.equal(card.logo, 'icons/logo-zelena.webp');
        // XP: odpovědi + 30 za dokončení, uložené jednou
        const store = await quizStore(tab);
        assert.equal(store.days[TODAY].done, true);
        assert.equal(store.days[TODAY].xp, true);
        assert.equal(store.attempt.xp.total, 30);
        // Znovu z úvodu: rovnou výsledek (jeden pokus za den)
        await tab.click('[data-action="quiz-home"]');
        await tab.waitForSelector('#quiz-card[data-quiz-status="done"]');
        assert.match(await compact(tab, '#quiz-card'), /9\/10/);
        await fitsScreen(tab, 'úvod po dohrání (360×640)');
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-result');
        assert.equal(await tab.$('[data-action="quiz-start"]'), null);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('pokračování po zavření: stejná otázka, nápovědy zůstanou, čas běží dál', async () => {
        const { context, tab, log } = await setup(browser, {}, { colorScheme: 'dark' });
        await tab.click('#quiz-card');
        await tab.click('[data-action="quiz-start"]');
        await answer(tab, { correct: true });
        await answer(tab, { correct: false });
        await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
        if (await tab.$('[data-action="hint"]')) await tab.click('[data-action="hint"]');
        const open = (await quizStore(tab)).attempt.open;
        const third = await session(tab);
        assert.equal(open.index, 2);
        // Zavření aplikace uprostřed otázky
        await tab.reload();
        await tab.waitForSelector('#quiz-card[data-quiz-status="progress"]');
        assert.match(await compact(tab, '#quiz-card'), /Rozehráno · otázka 3\/10 Pokračovat/);
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-intro');
        assert.match(await compact(tab, '[data-action="quiz-start"]'), /Pokračovat · otázka 3\/10/);
        await tab.click('[data-action="quiz-start"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
        const again = await session(tab);
        assert.equal(`${again.topic}:${again.id}`, `${third.topic}:${third.id}`, 'stejná otázka');
        assert.deepEqual(again.question.choices.map(c => c.label), third.question.choices.map(c => c.label), 'stejné možnosti');
        const round = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).round);
        assert.equal(round.hintLevel, open.hint, 'použité nápovědy zůstaly');
        assert.equal(round.timerStart, open.at, 'čas běží od prvního zobrazení');
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('úvod jde vypnout: příště kvíz začne rovnou, v Nastavení → Hra se zase zapne', async () => {
        const { context, tab, log } = await setup(browser, {}, {});
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-intro [data-action="quiz-skip-intro"][aria-checked="false"]');
        await tab.click('[data-action="quiz-skip-intro"]');
        await tab.waitForSelector('#quiz-intro [data-action="quiz-skip-intro"][aria-checked="true"]');
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.quizSkipIntro')), '1');
        await tab.reload();
        await tab.click('#quiz-card');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
        assert.equal(await tab.locator('#quiz-intro').count(), 0, 'bez úvodu rovnou první otázka');
        // Nastavení → Hra: řádek Úvod Kvízu dne (jen když je vypnutý) ho zase zapne
        await tab.click('#btn-settings');
        await tab.waitForSelector('[data-quiz-intro-toggle]');
        await tab.click('[data-quiz-intro-toggle]');
        await tab.waitForFunction(() => localStorage.getItem('mudrlant.quizSkipIntro') === null);
        await tab.waitForFunction(() => !document.querySelector('[data-quiz-intro-toggle]'));
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('přihlášený: odpovědi po otázkách na server, pořadí dne s mým místem, přátelé, série ze serveru', async () => {
        const db = newDb();
        // včera dohráno: série pokračuje
        db.quiz[`u-1|2026-11-07`] = { user_id: 'u-1', day: '2026-11-07', answered: 10, correct: 7, score: 20, time_ms: 90000, bitmap: 127, finished: true };
        const { context, tab, log } = await setup(browser, login('tok-u1'), { db });
        await tab.waitForFunction(() => document.querySelector('#quiz-card'));
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-intro');
        assert.equal(await tab.$('[data-quiz-guest]'), null, 'přihlášený nevidí poznámku pro hosta');
        await tab.click('[data-action="quiz-start"]');
        for (let i = 0; i < 10; i++) await answer(tab, { correct: i < 8 });
        await tab.waitForSelector('#quiz-result');
        await tab.waitForSelector('[data-quiz-row="u-1"]', { timeout: 30000 });
        assert.deepEqual(db.answers.map(a => a.idx), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'odpovědi po pořadí, každá jednou');
        assert.ok(db.answers.every(a => a.for_day === TODAY && (a.is_correct ? a.points >= 1 && a.points <= 4 : a.points === 0)));
        assert.ok(db.log.indexOf('daily_quiz_start') < db.log.indexOf('daily_quiz_answer'), 'nejdřív začátek, pak odpovědi');
        assert.equal(db.quiz[`u-1|${TODAY}`].finished, true);
        const ranking = await compact(tab, '#quiz-ranking');
        assert.match(ranking, /Pořadí dne · 3 hráči/);
        assert.match(ranking, /🏆 .*Eva Mistr 40 bodů/);
        assert.match(ranking, /Jana Nováková \(ty\)/);
        assert.match(await compact(tab, '[data-quiz-streak]'), /2 dny/, 'série ze serveru (včera + dnes)');
        assert.match(await compact(tab, '#quiz-result'), /\+4 XP za sérii 2 dní Kvízu dne/);
        await tab.click('[data-action="quiz-tab"][data-tab="friends"]');
        const friends = await compact(tab, '#quiz-ranking');
        assert.match(friends, /Petr Svoboda/);
        assert.doesNotMatch(friends, /Eva Mistr/, 'jen přátelé');
        await audit(tab, 'výsledek s pořadím přátel (390×780)');
        // Karta na úvodu: hotovo s místem
        await tab.click('[data-action="quiz-home"]');
        await tab.waitForSelector('#quiz-card[data-quiz-status="done"]');
        // 8 správně bez nápověd = 32 bodů: za Evou (40), před Petrem (30)
        assert.match(await compact(tab, '#quiz-card'), /8\/10 · 32 bodů · 2\. místo/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('host dohraje, přihlásí se a výsledek se zapíše na účet; jinde dohraný pokus platí ze serveru', async () => {
        const db = newDb();
        const guest = await setup(browser, {}, { db, viewport: { width: 360, height: 640 } });
        await guest.tab.click('#quiz-card');
        await guest.tab.click('[data-action="quiz-start"]');
        for (let i = 0; i < 10; i++) await answer(guest.tab, { correct: i % 2 === 0 });
        await guest.tab.waitForSelector('[data-action="quiz-login"]');
        const stored = await quizStore(guest.tab);
        // Přihlášení (návrat z Googlu = nové načtení s tokenem)
        await guest.tab.evaluate((auth) => { localStorage.setItem('mudrlant.auth', auth); localStorage.setItem('mudrlant.quizLogin', JSON.stringify('2026-11-08')); }, login('tok-u1')['mudrlant.auth']);
        await guest.tab.reload();
        await guest.tab.waitForSelector('#quiz-result', { timeout: 30000 });
        await guest.tab.waitForSelector('[data-quiz-row="u-1"]', { timeout: 30000 });
        assert.equal(db.quiz[`u-1|${TODAY}`].answered, 10);
        assert.equal(db.quiz[`u-1|${TODAY}`].bitmap, stored.days[TODAY].bitmap, 'na server šly hostovy odpovědi');
        assert.match(await compact(guest.tab, '#quiz-result'), /5\/10/);
        // XP se znovu nepřipsalo
        assert.equal((await quizStore(guest.tab)).attempt.xp.total, 30);
        await guest.context.close();

        // Jiné zařízení (bez místních dat): pokus už je na serveru dohraný, hraje se jen výsledek
        const other = await setup(browser, login('tok-u1'), { db });
        await other.tab.waitForSelector('#quiz-card[data-quiz-status="done"]', { timeout: 30000 });
        await other.tab.click('#quiz-card');
        await other.tab.waitForSelector('#quiz-result');
        assert.equal(await other.tab.$('[data-action="quiz-start"]'), null);
        assert.match(await compact(other.tab, '#quiz-result'), /5\/10/);
        assert.equal(await other.tab.$$eval('[data-quiz-grid] > span', cells => cells.map(cell => cell.className.includes('emerald') ? 1 : 0).join('')), '1010101010');
        assert.deepEqual(other.log.errors, []);
        await other.context.close();
    });

    await t.test('rozehráno na jiném zařízení: pokračuje se otázkou, kterou server ještě nemá', async () => {
        const db = newDb();
        db.quiz[`u-1|${TODAY}`] = { user_id: 'u-1', day: TODAY, answered: 3, correct: 2, score: 7, time_ms: 20000, bitmap: 5, finished: false };
        const { context, tab, log } = await setup(browser, login('tok-u1'), { db });
        await tab.waitForSelector('#quiz-card[data-quiz-status="progress"]', { timeout: 30000 });
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-intro');
        assert.match(await compact(tab, '[data-action="quiz-start"]'), /Pokračovat · otázka 4\/10/);
        await tab.click('[data-action="quiz-start"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
        assert.match(await compact(tab, '#status-text'), /Kvíz dne · 4\/10/);
        await answer(tab, { correct: true });
        await tab.waitForFunction(() => true);
        await tab.waitForTimeout(300);
        assert.deepEqual(db.answers.map(a => a.idx), [3]);
        assert.equal(db.quiz[`u-1|${TODAY}`].answered, 4);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('starší databáze bez Kvízu dne: hraje se v zařízení, pořadí jen hlásí nedostupnost', async () => {
        const db = newDb();
        db.missing = true;
        const { context, tab, log } = await setup(browser, login('tok-u1'), { db, viewport: { width: 360, height: 640 }, colorScheme: 'dark' });
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-intro');
        assert.match(await compact(tab, '#quiz-intro'), /Pořadí teď není dostupné/);
        await tab.click('[data-action="quiz-start"]');
        for (let i = 0; i < 10; i++) await answer(tab, { correct: true });
        await tab.waitForSelector('#quiz-result');
        await tab.waitForFunction(() => /nepodařilo načíst/.test(document.getElementById('quiz-ranking').textContent));
        assert.match(await compact(tab, '#quiz-result'), /\+50 XP/, '30 za dokončení a 20 bez chyby');
        assert.match(await compact(tab, '#quiz-result'), /\+20 XP za Kvíz dne bez chyby/);
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('obrázek ke sdílení i u výsledku dnešní otázky; se sdílením souborů jde přes navigator.share', async () => {
        const { context, tab, log } = await setup(browser, {});
        // Prohlížeč umí sdílet soubory: obrázek jde do systémového sdílení jako PNG
        await tab.evaluate(() => {
            window.__shared = null;
            navigator.canShare = (data) => Boolean(data && data.files && data.files.length);
            navigator.share = async (data) => { window.__shared = { files: (data.files || []).map(file => ({ name: file.name, type: file.type, size: file.size })), text: data.text || '' }; };
        });
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
        await tab.click('[data-action="choice"] >> nth=0');
        await tab.waitForSelector('[data-action="share-image"]');
        assert.match(await compact(tab, '[data-action="share-image"]'), /Sdílet obrázek/);
        await tab.click('[data-action="share-image"]');
        await tab.waitForFunction(() => window.__shared);
        const shared = await tab.evaluate(() => window.__shared);
        assert.equal(shared.files.length, 1);
        assert.equal(shared.files[0].type, 'image/png');
        assert.match(shared.files[0].name, /^mudrlant-dnesni-zemepis-2026-11-08\.png$/);
        assert.ok(shared.files[0].size > 20000);
        // Text: sdílení systémem (bez schránky)
        await tab.click('[data-action="share"]');
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });

    await t.test('vyhraná výzva: vedle sdílení výzvy i Sdílet obrázek (stažení); sdílení výzvy jde do schránky', async () => {
        const db = newDb();
        db.challenges.VYHRAJ = { id: 'VYHRAJ', creator_id: 'u-2', invited_id: null, topic: 'zemepis', count: 5, seed: 'vyhraj-1', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-08T08:00:00Z' };
        db.results.push({ challenge_id: 'VYHRAJ', user_id: 'u-2', correct: 1, points: 2, finished_at: '2026-11-08T08:10:00Z' });
        const { context, tab, log } = await setup(browser, login('tok-u1'), { db, viewport: { width: 360, height: 640 } });
        await tab.goto(`${ORIGIN}/?vyzva=VYHRAJ`);
        await tab.waitForSelector('[data-ch-play]', { timeout: 30000 });
        await tab.click('[data-ch-play]');
        for (let i = 0; i < 5; i++) await answer(tab, { correct: true });
        await tab.waitForSelector('[data-challenge-outcome="vyhra"]', { timeout: 30000 });
        await tab.waitForSelector('[data-action="challenge-share-image"]');
        const [download] = await Promise.all([tab.waitForEvent('download'), tab.click('[data-action="challenge-share-image"]')]);
        assert.equal(download.suggestedFilename(), `mudrlant-vyzva-${TODAY}.png`);
        await tab.click('[data-action="challenge-share"]');
        await tab.waitForFunction(() => /Odkaz na výzvu zkopírován/.test(document.getElementById('toast').textContent));
        assert.match(await tab.evaluate(() => navigator.clipboard.readText()), /Kód výzvy: VYHRAJ\nhttps:\/\/geo\.test\/\?vyzva=VYHRAJ$/);
        assert.deepEqual(log.errors, []);
        assert.deepEqual(log.csp, []);
        await context.close();
    });
});
