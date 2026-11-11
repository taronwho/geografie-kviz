// Otázky „Ukaž na mapě“ ve výzvě (question-map.js, app.js challengePicker): o otázce na mapě rozhoduje semínko otázky, takže ji oba hráči
// dostanou stejnou i bez otázek uložených na serveru; body podle vzdálenosti projdou kontrolou průběhu (nejvýš 4 u výběru z možností,
// správně = aspoň bod), rozpis otázek ukáže „Ukaž na mapě“, místo, vzdálenost a body obou hráčů. Uložená otázka na mapě má jednu (správnou)
// možnost, aby ji přijala i starší aplikace. Výzva bez značky v semínku (starší verze aplikace) otázky na mapě nemá.
// Semínko 'mapa-vyzva-4.mapa': na mapě je jen 2. otázka (tests/question-map-multiplayer.test.js počítá podíl). Falešný Supabase v paměti.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const SHOTS = process.env.SCREENSHOT_DIR || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const U1 = '00000000-0000-0000-0000-000000000001';
const U2 = '00000000-0000-0000-0000-000000000002';
const USERS = { 'tok-u1': { id: U1, name: 'Jana Nováková' }, 'tok-u2': { id: U2, name: 'Petr Svoboda' } };
const SEED = 'mapa-vyzva-4.mapa';
// Semínko bez značky, u kterého by podle čísel byla 2. otázka na mapě (kdyby výzva mapu nesla)
const OLD_SEED = 'stara-vyzva-7';

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, body: '' };
    const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const profile = (id) => ({ id, display_name: Object.values(USERS).find(user => user.id === id).name, avatar: '🦉', color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 0, blocked_topics: [], accepts_mix: true });

// Výzva podle kódu, průběh po otázkách (kontroly jako challenge_progress_save), výsledek z průběhu, rozpis (challenge_details) a zamrzlé otázky
// (db.snapshots = null: databáze bez nich, otázky se skládají jen v zařízení)
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
        const eq = (name) => (url.searchParams.get(name) || '').replace(/^eq\./, '');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const missing = () => json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        if (rpc) {
            if (rpc[1] === 'schema_version') return json(REQUIRED_SCHEMA);
            if (rpc[1] === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (['friends_list', 'weekly_leaderboard'].includes(rpc[1])) return json([]);
            if (rpc[1] === 'question_snapshots_get') return db.snapshots ? json((body.seeds || []).filter(seed => db.snapshots[seed]).map(seed => ({ seed, data: db.snapshots[seed] }))) : missing();
            if (rpc[1] === 'question_snapshot_claim') { if (!db.snapshots) return missing(); if (!db.snapshots[body.seed]) db.snapshots[body.seed] = body.data; return json(db.snapshots[body.seed]); }
            if (rpc[1] === 'challenge_progress_save') {
                const c = db.challenges[body.code];
                const mine = db.progress.filter(row => row.challenge_id === body.code && row.user_id === me.id);
                const limit = c.variant === 'choices' ? 4 : 8;
                if (!Number.isInteger(body.points) || body.points < 0 || body.points > limit || body.correct !== (body.points > 0)
                    || (body.answer != null && (typeof body.answer !== 'string' || body.answer.length < 1 || body.answer.length > 120))) {
                    db.rejected.push(body);
                    return json({ code: '22023', message: 'Neplatný výsledek otázky.' }, 400);
                }
                if (body.idx !== mine.length) return json({ code: '22023', message: 'Nejdřív se musí uložit předchozí otázky.' }, 400);
                db.progress.push({ challenge_id: body.code, user_id: me.id, idx: body.idx, correct: body.correct, points: body.points, answer: body.answer ?? null, hints: body.hints ?? null, ms: body.ms ?? null });
                return json(mine.length + 1);
            }
            if (rpc[1] === 'challenge_details') {
                return json(db.progress.filter(row => row.challenge_id === body.code).map(({ user_id, idx, correct, points, answer, hints, ms }) => ({ user_id, idx, correct, points, answer, hints, ms })));
            }
            return missing();
        }
        if (url.pathname === '/rest/v1/challenge_progress') return json(db.progress.filter(row => row.challenge_id === eq('challenge_id') && row.user_id === me.id).map(({ idx, correct, points, answer, hints, ms }) => ({ idx, correct, points, answer, hints, ms })));
        if (/^\/rest\/v1\/tournament/.test(url.pathname)) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
        const table = url.pathname.replace('/rest/v1/', '');
        if (table === 'profiles') return request.method() === 'PATCH' ? route.fulfill({ status: 204, body: '' }) : json(eq('id') ? [profile(eq('id'))] : []);
        if (table === 'challenges') {
            const c = db.challenges[eq('id')];
            return json(c ? [{ ...c, creator: profile(c.creator_id), invited: null }] : []);
        }
        if (table === 'challenge_results') {
            if (request.method() === 'POST') {
                const answered = db.progress.filter(row => row.challenge_id === body.challenge_id && row.user_id === body.user_id);
                db.results.push({ ...body, correct: answered.filter(row => row.correct).length, points: answered.reduce((sum, row) => sum + row.points, 0), finished_at: new Date().toISOString() });
                return route.fulfill({ status: 201, body: '' });
            }
            return json(db.results.filter(row => row.challenge_id === eq('challenge_id')).map(row => ({ ...row, player: profile(row.user_id) })));
        }
        return json([]);
    });
};

test('výzva s otázkou na mapě: oba hráči ji mají stejnou, body projdou, rozpis ji ukáže', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const challengeRow = (id, seed) => ({ id, creator_id: U1, invited_id: null, topic: 'zemepis', count: 3, seed, include_hard: false, categories: ['mesto'], variant: 'choices', created_at: '2026-11-04T09:00:00Z' });
    const db = {
        challenges: { MAPVYZ: challengeRow('MAPVYZ', SEED), STARAV: challengeRow('STARAV', OLD_SEED) },
        progress: [], results: [], rejected: [], snapshots: {}
    };
    // aim: 'hit' = klepnout přesně na místo, 'far' = do rohu mapy; choice: 'ok' = správná možnost, 'skip' = Nevím
    const play = async (token, code, plan, { snapshots = true, after = null } = {}) => {
        const saved = db.snapshots;
        if (!snapshots) db.snapshots = null;
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        await context.addInitScript(({ auth }) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            const values = { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'typed', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.auth': auth };
            Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { auth: JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
        await context.route(`${ORIGIN}/**`, route => route.fulfill(serveFile(new URL(route.request().url()).pathname)));
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === ORIGIN || url.hostname === 'proj.supabase.co') return route.fallback();
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
            if (/\.(png|jpe?g|webp)$/i.test(url.pathname)) return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        await backend(context, db);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.clock.setFixedTime(new Date('2026-11-04T10:00:00'));
        await tab.goto(`${ORIGIN}/?vyzva=${code}`);
        await tab.waitForSelector('[data-ch-play]', { timeout: 30000 });
        await tab.click('[data-ch-play]');
        const questions = [];
        for (let index = 0; index < plan.length; index++) {
            await tab.waitForSelector('[data-map-question] svg path, [data-action="choice"]', { timeout: 30000 });
            const data = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
            questions.push({ id: data.id, type: data.question.type, title: data.question.title, answer: data.question.answerLabel, map: data.question.map || null });
            if (data.question.type === 'map') {
                // Výzva s pevným výběrem z možností: nejvýš 4 body (i když hráč jinak píše odpovědi)
                assert.match(await tab.textContent('[data-map-tiers-toggle]'), /Plné 4 body/);
                assert.equal(await tab.locator('[data-score-chip]').count(), 1, 'body ve hře v záhlaví i u otázky na mapě');
                const point = await tab.evaluate(({ aim }) => {
                    const question = JSON.parse(localStorage.getItem('mudrlant.session')).data.question;
                    const svg = document.querySelector('[data-map-question] svg');
                    const rect = svg.getBoundingClientRect();
                    if (aim === 'far') return { x: rect.left + 12, y: rect.top + 12 };
                    const [mx, my] = window.MudrlantMapQuestion.frameOf(window.MudrlantMapQuestion.mapRegionOf(question.map.region)).toMap(question.map.lat, question.map.lon);
                    const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
                    return { x: rect.left + (mx - vx) / vw * rect.width, y: rect.top + (my - vy) / vh * rect.height };
                }, { aim: plan[index] });
                await tab.mouse.click(point.x, point.y);
                await tab.click('[data-action="map-confirm"]');
                await tab.waitForSelector('[data-action="next"]');
                if (SHOTS && index === 1) await tab.screenshot({ path: path.join(SHOTS, `vyzva-mapa-vysledek-${token}.png`) });
            } else if (plan[index] === 'ok') {
                const correct = data.question.choices.findIndex(choice => choice.correct);
                await tab.click(`[data-action="choice"][data-index="${correct}"]`);
            } else {
                await tab.click('[data-action="give-up"]');
            }
            await tab.waitForSelector('[data-action="next"]');
            await tab.click('[data-action="next"]');
        }
        await tab.waitForSelector('[data-challenge-outcome], [data-action="challenge-share"]', { timeout: 30000 });
        if (after) await after(tab);
        assert.deepEqual(problems, []);
        await context.close();
        db.snapshots = saved;
        return questions;
    };

    const first = await play('tok-u1', 'MAPVYZ', ['ok', 'hit', 'skip']);
    assert.deepEqual(first.map(question => question.type === 'map'), [false, true, false], 'na mapě je jen 2. otázka (podle semínka)');
    assert.match(first[1].title, /^Kde leží .+\?$/);
    assert.deepEqual(db.rejected, [], 'server žádnou odpověď neodmítl');
    const rowsOf = (user, code = 'MAPVYZ') => db.progress.filter(row => row.user_id === user && row.challenge_id === code).sort((a, b) => a.idx - b.idx);
    const [, hit] = rowsOf(U1);
    assert.equal(hit.correct, true);
    assert.ok(hit.points >= 1 && hit.points <= 4, `trefa: ${hit.points} b`);
    assert.match(hit.answer, /^Vedle o .*km$/);
    // Otázka na mapě uložená na serveru: i starší aplikace ji přijme (aspoň jedna možnost a přijímané odpovědi) a zahraje ji na mapě
    const stored = db.snapshots[`${SEED}:1`];
    assert.equal(stored.question.type, 'map');
    assert.ok(Array.isArray(stored.question.choices) && stored.question.choices.length > 0 && Array.isArray(stored.question.accepted));
    assert.deepEqual(stored.question.choices, [{ id: first[1].id, label: first[1].answer, correct: true }]);

    // Druhý hráč bez otázek na serveru (starší databáze): stejné otázky jen ze semínka; po dohrání se otevře rozpis
    let breakdown = '';
    const second = await play('tok-u2', 'MAPVYZ', ['skip', 'far', 'ok'], {
        snapshots: false,
        after: async (tab) => {
            await tab.waitForSelector('#breakdown-list [data-bd-row="1"] [data-bd-cell]', { timeout: 30000 });
            breakdown = (await tab.textContent('#breakdown-list [data-bd-row="1"]')).replace(/\s+/g, ' ');
            if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'vyzva-mapa-rozpis.png') });
            assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'bez vodorovného posouvání');
        }
    });
    assert.deepEqual(second, first, 'stejné otázky, stejné místo na mapě');
    assert.deepEqual(db.rejected, []);
    const far = rowsOf(U2)[1];
    assert.ok(far.points >= 0 && far.points <= 4 && far.correct === (far.points > 0), JSON.stringify(far));
    assert.match(far.answer, /^Vedle o .*km$/);
    // Rozpis: „Ukaž na mapě“, místo, u obou hráčů vzdálenost a body
    assert.match(breakdown, new RegExp(`Ukaž na mapě.*${first[1].answer}`));
    assert.ok(breakdown.includes(`${hit.answer}`) && breakdown.includes(`${far.answer}`), breakdown);
    assert.match(breakdown, new RegExp(`Ty: ${far.answer} .*${far.points} b.*Jana Nováková: ${hit.answer} .*${hit.points} b`), "nejdřív vlastní odpověď, vedle soupeř");
    assert.deepEqual(db.results.map(row => [row.user_id, row.points]), [[U1, rowsOf(U1).reduce((sum, row) => sum + row.points, 0)], [U2, rowsOf(U2).reduce((sum, row) => sum + row.points, 0)]]);

    // Výzva bez značky v semínku (založená starší verzí aplikace): stejné položky, ale žádná otázka na mapě
    const old = await play('tok-u1', 'STARAV', ['ok', 'ok', 'ok']);
    assert.ok(old.every(question => question.type !== 'map'), JSON.stringify(old.map(question => question.type)));
    const MapQuestion = require('../question-map.js');
    assert.equal(MapQuestion.multiplayerDue(`${OLD_SEED}:1`), true, 'se značkou by 2. otázka byla na mapě');
    assert.equal(MapQuestion.seedAllowsMaps(OLD_SEED), false);
    assert.deepEqual(rowsOf(U1, 'STARAV').map(row => [row.correct, row.points]), [[true, 4], [true, 4], [true, 4]]);
});
