// Číselné otázky ve výzvě (numeric-questions.js): dva hráči se stejným kódem dostanou stejné otázky Seřaď a Odhadni číslo
// ve stejném pořadí (plán ze semínka výzvy) a server přijme body podle pravidel průběhu (schéma 3: nejvýš 4 body u výzvy
// s výběrem z možností, správně právě když jsou body). Falešný Supabase v paměti jen s tím, co výzva potřebuje.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, body: '' };
    const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const profile = (id) => ({ id, display_name: Object.values(USERS).find(user => user.id === id).name, avatar: '🦉', color: 'sky', xp: 100, badges: [], rating: 1200, rated_games: 0, blocked_topics: [], accepts_mix: true });

// Jen to, co výzva potřebuje: výzva podle kódu, průběh po otázkách (jako challenge_progress_save) a výsledek z průběhu
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
        if (rpc) {
            if (rpc[1] === 'schema_version') return json(REQUIRED_SCHEMA);
            if (rpc[1] === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (['friends_list', 'weekly_leaderboard'].includes(rpc[1])) return json([]);
            if (rpc[1] === 'challenge_progress_save') {
                const c = db.challenges[body.code];
                const mine = db.progress.filter(row => row.challenge_id === body.code && row.user_id === me.id);
                // Stejná kontrola jako v databázi (supabase/schema.sql)
                const limit = c.variant === 'choices' ? 4 : 8;
                if (!Number.isInteger(body.points) || body.points < 0 || body.points > limit || body.correct !== (body.points > 0)) {
                    db.rejected.push(body);
                    return json({ code: '22023', message: 'Neplatný výsledek otázky.' }, 400);
                }
                if (body.idx !== mine.length) return json({ code: '22023', message: 'Nejdřív se musí uložit předchozí otázky.' }, 400);
                db.progress.push({ challenge_id: body.code, user_id: me.id, idx: body.idx, correct: body.correct, points: body.points });
                return json(mine.length + 1);
            }
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        if (url.pathname === '/rest/v1/challenge_progress') return json(db.progress.filter(row => row.challenge_id === eq('challenge_id') && row.user_id === me.id).map(({ idx, correct, points }) => ({ idx, correct, points })));
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

test('výzva s číselnými otázkami: oba hráči mají stejné otázky, server přijme body', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const db = {
        challenges: { CSNMRX: { id: 'CSNMRX', creator_id: 'u-1', invited_id: null, topic: 'zemepis', count: 4, seed: 'cisla-vyzva', include_hard: false, categories: ['hora', 'reka'], variant: 'choices', created_at: '2026-11-04T09:00:00Z' } },
        progress: [], results: [], rejected: []
    };
    // Každá otázka výzvy číselná (jinak asi každá osmá); force se nastaví hned, jak se skript načte, ještě před otevřením výzvy
    const play = async (token, answers) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript(({ auth }) => {
            let numeric;
            Object.defineProperty(window, 'MudrlantNumeric', { configurable: true, get: () => numeric, set: (value) => { if (value) value.force = 'order'; numeric = value; } });
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
        await tab.goto(`${ORIGIN}/?vyzva=CSNMRX`);
        await tab.waitForSelector('[data-ch-play]', { timeout: 30000 });
        await tab.click('[data-ch-play]');
        const questions = [];
        for (let index = 0; index < 4; index++) {
            await tab.waitForSelector('[data-numeric-question="order"]', { timeout: 30000 });
            const data = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
            questions.push({ spec: data.numeric.spec, dir: data.numeric.dir, items: data.numeric.items.map(row => row.id) });
            const [a, b, c, d] = data.numeric.order;
            for (const pick of answers[index] === 'swap' ? [a, b, d, c] : answers[index] === 'wrong' ? [d, c, b, a] : [a, b, c, d]) await tab.click(`[data-action="order-pick"][data-index="${pick}"]`);
            await tab.click('[data-action="order-confirm"]');
            await tab.waitForSelector('[data-numeric-result="order"]');
            await tab.click('[data-action="next"]');
        }
        await tab.waitForSelector('[data-challenge-outcome], [data-action="challenge-share"]', { timeout: 30000 });
        assert.deepEqual(problems, []);
        await context.close();
        return questions;
    };
    const first = await play('tok-u1', ['ok', 'swap', 'wrong', 'ok']);
    const second = await play('tok-u2', ['wrong', 'ok', 'ok', 'swap']);
    assert.deepEqual(second, first, 'stejné otázky, stejné položky, stejné pořadí na obrazovce');
    assert.equal(new Set(first.flatMap(question => question.items)).size, 16, 'žádná položka se ve výzvě nezopakuje');
    assert.ok(first.every(question => ['zemepis-hora-vyska', 'zemepis-reka-delka'].includes(question.spec)), 'jen z kategorií výzvy');
    assert.deepEqual(db.rejected, [], 'server žádnou odpověď neodmítl');
    const pointsOf = (user) => db.progress.filter(row => row.user_id === user).sort((x, y) => x.idx - y.idx).map(row => [row.correct, row.points]);
    // Výzva s pevným výběrem z možností: nejvýš 4 body, i když hráč jinak hraje psaní odpovědí
    assert.deepEqual(pointsOf('u-1'), [[true, 4], [true, 2], [false, 0], [true, 4]]);
    assert.deepEqual(pointsOf('u-2'), [[false, 0], [true, 4], [true, 4], [true, 2]]);
    assert.deepEqual(db.results.map(row => [row.user_id, row.correct, row.points]), [['u-1', 3, 10], ['u-2', 3, 10]]);
});
