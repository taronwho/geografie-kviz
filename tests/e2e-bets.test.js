// Kamarádské sázky v prohlížeči s falešným Supabase v paměti (jako tests/e2e-challenge-flow.test.js; funkce sázek se chovají jako v databázi,
// blok 21): volba sázky v okně Nová výzva jen u konkrétního hráče, limit z posledních 7 dní, hláška, pravidla s návratem do rozpracované výzvy;
// nabídka u vyzvaného (Přijmout sázku / Hrát bez sázky), výsledek s mincemi, které se sypou k vítězi (při omezeném pohybu ne), vyrovnání
// dohrané sázky na pozadí, mince u výzev v seznamu, sázková bilance v profilu hráče a sladění XP podle součtů v účtu (prohra z jiného
// zařízení se starším XP nepřepíše). Bez chyb CSP, na 360×640 i 390×780. SAZKY_SHOTS=… uloží snímky (světlý i tmavý režim).
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
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const SHOTS = process.env.SAZKY_SHOTS || '';

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};
const USERS = { 'tok-u1': { id: 'u-1', name: 'Jana Nováková' }, 'tok-u2': { id: 'u-2', name: 'Petr Svoboda' } };
const login = (token) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id: USERS[token].id, email: 'x@example.com', name: USERS[token].name } }) });
const player = (id, name, avatar, extra = {}) => ({ id, display_name: name, avatar, color: 'sky', xp: 3000, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true, bet_won: 0, bet_lost: 0, ...extra });
const floorOf = (xp) => xp - core.levelProgress(xp).into;

const newDb = () => ({
    fail: {}, patches: [], log: [],
    profiles: { 'u-1': player('u-1', 'Jana Nováková', '🦊', { color: 'emerald' }), 'u-2': player('u-2', 'Petr Svoboda', '🐼'), 'u-3': player('u-3', 'Eva Mistrová', '🦉') },
    challenges: {}, results: [], progress: [],
    // XP za posledních 7 dní (stake_week_xp) po hráčích; force = výsledek, který „server“ spočítá (body a správné), ať je vítěz jistý
    week: { 'u-1': 30, 'u-2': 200, 'u-3': 200 }, force: {}
});
const OUTCOME = (mine, theirs) => (mine.points !== theirs.points ? (mine.points > theirs.points ? 'win' : 'loss') : mine.correct !== theirs.correct ? (mine.correct > theirs.correct ? 'win' : 'loss') : 'draw');

// Funkce sázek jako v databázi (challenge_offer_stake, challenge_answer_stake, challenge_settle_stake, challenge_stakes, challenge_stake_stats)
const betRpc = (db, me, name, body) => {
    const fail = (message, status = 400) => ({ status, body: { code: 'P0001', message } });
    const open = (uid, skip) => Object.values(db.challenges).filter(c => c.stake && c.id !== skip && ((c.creator_id === uid && ['offered', 'accepted'].includes(c.stake_state) && !c.stake_settled_creator)
        || (c.invited_id === uid && c.stake_state === 'accepted' && !c.stake_settled_opponent))).reduce((sum, c) => sum + c.stake, 0);
    const available = (uid, skip = null) => Math.min(50, Math.max(0, (db.week[uid] || 0) - open(uid, skip)));
    const json = (c, uid) => {
        const creator = c.creator_id === uid;
        const other = creator ? c.invited_id : c.creator_id;
        const mine = db.results.find(r => r.challenge_id === c.id && r.user_id === uid);
        const theirs = db.results.find(r => r.challenge_id === c.id && r.user_id === other);
        return { id: c.id, stake: c.stake || null, state: c.stake_state || null, taunt: c.taunt ?? null, role: creator ? 'creator' : 'opponent', other, expired: false,
            settled: Boolean(creator ? c.stake_settled_creator : c.stake_settled_opponent), delta: (creator ? c.stake_delta_creator : c.stake_delta_opponent) ?? null,
            other_settled: Boolean(creator ? c.stake_settled_opponent : c.stake_settled_creator), done: Boolean(mine), other_done: Boolean(theirs), outcome: mine && theirs ? OUTCOME(mine, theirs) : null };
    };
    const stats = (uid) => {
        const rows = Object.values(db.challenges).filter(c => c.stake_state === 'accepted' && (c.creator_id === uid || c.invited_id === uid)).map(c => json(c, uid)).filter(r => r.outcome);
        return { bets: rows.length, wins: rows.filter(r => r.outcome === 'win').length, losses: rows.filter(r => r.outcome === 'loss').length, draws: rows.filter(r => r.outcome === 'draw').length,
            balance: rows.reduce((sum, r) => sum + (r.delta || 0), 0), best: rows.filter(r => r.outcome === 'win').length, streak: 0 };
    };
    const c = body && body.code ? db.challenges[body.code] : null;
    if (name === 'challenge_stakes') {
        return { status: 200, body: { limit: available(me), week_xp: db.week[me] || 0, open: open(me), stats: stats(me),
            rows: Object.values(db.challenges).filter(ch => ch.stake && (ch.creator_id === me || ch.invited_id === me)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(ch => json(ch, me)) } };
    }
    if (name === 'challenge_stake_stats') return { status: 200, body: db.profiles[body.player] ? stats(body.player) : null };
    if (!c) return fail('Výzva neexistuje.');
    if (name === 'challenge_offer_stake') {
        if (c.creator_id !== me) return fail('Tuhle sázku nabídnout nemůžeš: výzva není tvoje.', 403);
        if (!c.invited_id) return fail('Sázka jde jen ve výzvě konkrétnímu hráči.');
        if (c.stake) return fail('Sázka už je nabídnutá.');
        if (![10, 25, 50].includes(body.amount)) return fail('Vsadit jde 10, 25 nebo 50 XP.');
        if (db.progress.some(r => r.challenge_id === c.id)) return fail('Sázku jde nabídnout jen před začátkem hry.');
        if (body.amount > available(me, c.id)) return fail(`Vsadit můžeš nejvýš ${available(me, c.id)} XP (tolik máš z posledních 7 dní).`);
        Object.assign(c, { stake: body.amount, stake_state: 'offered', taunt: body.taunt_id ?? null });
        return { status: 200, body: json(c, me) };
    }
    if (name === 'challenge_answer_stake') {
        if (c.invited_id !== me) return fail('Na tuhle sázku odpovědět nemůžeš.', 403);
        if (c.stake_state !== 'offered') return c.stake_state === (body.accept ? 'accepted' : 'declined') ? { status: 200, body: json(c, me) } : fail('Na sázku už je odpověď.');
        if (body.accept && c.stake > available(me, c.id)) return fail(`Vsadit můžeš nejvýš ${available(me, c.id)} XP (tolik máš z posledních 7 dní).`);
        c.stake_state = body.accept ? 'accepted' : 'declined';
        return { status: 200, body: json(c, me) };
    }
    if (name === 'challenge_settle_stake') {
        if (c.creator_id !== me && c.invited_id !== me) return fail('Tahle sázka ti nepatří.', 403);
        const info = json(c, me);
        if (c.stake_state !== 'accepted' || !info.outcome || info.settled) return { status: 200, body: { ...info, fresh: false } };
        const profile = db.profiles[me];
        const delta = info.outcome === 'win' ? c.stake : info.outcome === 'loss' ? -Math.min(c.stake, profile.xp - floorOf(profile.xp)) : 0;
        profile.xp += delta;
        profile.bet_won += Math.max(delta, 0);
        profile.bet_lost += Math.max(-delta, 0);
        if (c.creator_id === me) Object.assign(c, { stake_settled_creator: true, stake_delta_creator: delta }); else Object.assign(c, { stake_settled_opponent: true, stake_delta_opponent: delta });
        return { status: 200, body: { ...json(c, me), fresh: true, xp: profile.xp, won: profile.bet_won, lost: profile.bet_lost } };
    }
    return null;
};

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        const method = request.method();
        if (url.pathname.startsWith('/auth/')) return json({});
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        if (!me) return json({ message: 'no token' }, 401);
        const key = `${method} ${url.pathname}`;
        db.log.push(key);
        if (db.fail[key]) return json({ message: 'boom' }, db.fail[key]);
        const param = (name) => url.searchParams.get(name) || '';
        const eq = (name) => param(name).replace(/^eq\./, '');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        const challengeRow = (c) => ({ ...c, creator: profile(c.creator_id), invited: c.invited_id ? profile(c.invited_id) : null });
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        if (rpc) {
            const name = rpc[1];
            if (name === 'schema_version') return json(REQUIRED_SCHEMA);
            if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
            if (name === 'friends_list' || name === 'weekly_leaderboard') return json([]);
            if (name === 'search_players') return json(Object.values(db.profiles).filter(p => p.id !== me.id && p.display_name.toLowerCase().includes(String(body.term).toLowerCase())));
            if (name === 'random_opponent') return json([profile('u-3')]);
            if (/^challenge_(offer|answer|settle)_stake$|^challenge_stake(s|_stats)$/.test(name)) {
                if (db.betsMissing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                const result = betRpc(db, me.id, name, body);
                return json(result.body, result.status);
            }
            if (name === 'challenge_progress_save') {
                const c = db.challenges[body.code];
                const mine = db.progress.filter(r => r.challenge_id === body.code && r.user_id === me.id);
                if (mine.some(r => r.idx === body.idx)) return json(mine.length);
                db.progress.push({ challenge_id: body.code, user_id: me.id, idx: body.idx, correct: body.correct, points: body.points });
                // Vyzvaný začal hrát bez odpovědi na nabídku: hraje se bez sázky (stake_close_offer)
                if (body.idx === 0 && c && c.invited_id === me.id && c.stake_state === 'offered') c.stake_state = 'declined';
                return json(mine.length + 1);
            }
            return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        }
        if (url.pathname === '/rest/v1/challenge_progress') return json(db.progress.filter(r => r.challenge_id === eq('challenge_id') && r.user_id === me.id).sort((a, b) => a.idx - b.idx).map(({ idx, correct, points }) => ({ idx, correct, points })));
        if (/^\/rest\/v1\/tournament/.test(url.pathname)) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
        const table = url.pathname.replace('/rest/v1/', '');
        if (table === 'profiles') {
            if (method === 'PATCH') {
                db.patches.push(body);
                const target = db.profiles[eq('id')];
                // Jako protect_rating: klient XP jen zvyšuje
                if (target) Object.assign(target, body, body.xp !== undefined ? { xp: Math.max(target.xp, body.xp) } : {});
                return route.fulfill({ status: 204, body: '' });
            }
            return json(db.profiles[eq('id')] ? [profile(eq('id'))] : []);
        }
        if (table === 'challenges') {
            if (method === 'POST') { db.challenges[body.id] = { ...body, created_at: new Date().toISOString() }; return json([db.challenges[body.id]], 201); }
            if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(challengeRow));
            if (param('id').startsWith('in.')) return json(param('id').slice(4, -1).split(',').map(id => db.challenges[id]).filter(Boolean).slice(0, 1));
            return json(db.challenges[eq('id')] ? [challengeRow(db.challenges[eq('id')])] : []);
        }
        if (table === 'challenge_results') {
            if (method === 'POST') {
                if (!db.results.some(r => r.challenge_id === body.challenge_id && r.user_id === body.user_id)) {
                    const answered = db.progress.filter(r => r.challenge_id === body.challenge_id && r.user_id === body.user_id);
                    const totals = db.force[body.challenge_id] || { correct: answered.filter(r => r.correct).length, points: answered.reduce((sum, r) => sum + r.points, 0) };
                    db.results.push({ ...body, ...totals, finished_at: new Date().toISOString() });
                }
                return route.fulfill({ status: 201, body: '' });
            }
            const withPlayer = (r) => ({ ...r, player: profile(r.user_id) });
            if (param('challenge_id').startsWith('in.') && param('user_id').startsWith('eq.')) { const ids = param('challenge_id').slice(4, -1).split(','); return json(db.results.filter(r => r.user_id === eq('user_id') && ids.includes(r.challenge_id))); }
            if (param('user_id').startsWith('eq.')) return json(db.results.filter(r => r.user_id === eq('user_id')).map(r => ({ ...r, challenge: challengeRow(db.challenges[r.challenge_id]) })));
            if (param('challenge_id').startsWith('in.')) { const ids = param('challenge_id').slice(4, -1).split(','); return json(db.results.filter(r => ids.includes(r.challenge_id) && r.user_id !== param('user_id').replace('neq.', '')).map(withPlayer)); }
            return json(db.results.filter(r => r.challenge_id === eq('challenge_id')).map(withPlayer));
        }
        return json([]);
    });
};

const setup = async (browser, storage, { viewport = { width: 390, height: 780 }, colorScheme = 'light', reducedMotion = 'no-preference' } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme, viewport, reducedMotion });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'),
        'mudrlant.progress': JSON.stringify({ xp: 3000, counters: { answered: 200, correct: 150, challenges: 4 }, badges: {} }), ...storage });
    const tab = await context.newPage();
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    if (process.env.SAZKY_DEBUG) tab.on('framenavigated', frame => { if (frame === tab.mainFrame()) console.log('NAV', frame.url()); });
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route(`${ORIGIN}/**`, route => route.fulfill(serveFile(new URL(route.request().url()).pathname)));
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN || url.hostname === 'proj.supabase.co') return route.fallback();
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
        return route.abort();
    });
    await tab.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
    return { context, tab, log };
};
const waitForHome = (tab) => tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && content.querySelector('#home-tabs')); }, null, { timeout: 30000 });
const compact = async (tab, selector) => ((await tab.textContent(selector)) || '').replace(/\s+/g, ' ').trim();
const giveUp = async (tab) => {
    await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
    await tab.click('[data-action="give-up"]');
    await tab.waitForSelector('[data-action="next"]');
    await tab.click('[data-action="next"]');
};
const localXp = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.progress')).xp);
const overflow = (tab) => tab.evaluate(() => { const panel = document.querySelector('#dialog-overlay > div'); return panel.scrollHeight - panel.clientHeight; });
const fitsScreen = (tab) => tab.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.getElementById('app-content').scrollWidth <= document.getElementById('app-content').clientWidth);
const shot = async (tab, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await tab.screenshot({ path: path.join(SHOTS, `sazky-${name}.png`) }); } };
const closeDialogs = async (tab) => { for (let i = 0; i < 3 && await tab.locator('#dialog-overlay').count(); i++) { await tab.keyboard.press('Escape'); await tab.waitForTimeout(80); } };

test('Kamarádské sázky', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    const start = async (db, token = 'tok-u1', options = {}) => {
        const page = await setup(browser, { ...login(token), ...(options.storage || {}) }, options);
        await backend(page.context, db);
        await page.tab.goto(`${ORIGIN}/`);
        await waitForHome(page.tab);
        await page.tab.waitForSelector('[data-action="new-challenge"]');
        return page;
    };
    // SAZKY_SIZES=all: obě velikosti ve světlém i tmavém režimu (snímky ke kontrole vzhledu), jinak 390×780 světle a 360×640 tmavě
    const SIZES = process.env.SAZKY_SIZES === 'all'
        ? [[{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark']]
        : [[{ width: 390, height: 780 }, 'light'], [{ width: 360, height: 640 }, 'dark']];

    await t.test('okno Nová výzva: sázka jen u konkrétního hráče, limit, hláška, pravidla s návratem; po založení se nabídne', async () => {
        for (const [viewport, colorScheme] of SIZES) {
            const db = newDb();
            const { context, tab, log } = await start(db, 'tok-u1', { viewport, colorScheme });
            await tab.click('[data-action="new-challenge"]');
            await tab.waitForSelector('[data-ch-who="player"]');
            assert.equal(await tab.locator('[data-stake-card]').count(), 0, 'bez vybraného hráče řádek Sázka není');
            await tab.fill('#opp-search', 'Petr');
            await tab.waitForSelector('[data-pick-opp="u-2"]');
            await tab.click('[data-pick-opp="u-2"]');
            await tab.waitForSelector('[data-stake-card]');
            assert.match(await compact(tab, '[data-stake-summary]'), /^Bez sázky$/);
            await shot(tab, `vyzvat-sbalene-${viewport.width}-${colorScheme}`);
            assert.ok(await overflow(tab) <= (viewport.height < 700 ? 24 : 0), `sbalený řádek Sázka se vejde (${viewport.width}×${viewport.height}): ${await overflow(tab)} px`);
            // Náhodný hráč a odkaz: bez sázky
            await tab.click('[data-ch-who="random"]');
            assert.equal(await tab.locator('[data-stake-card]').count(), 0);
            await tab.click('[data-ch-who="anyone"]');
            assert.equal(await tab.locator('[data-stake-card]').count(), 0);
            await tab.click('[data-ch-who="player"]');
            await tab.click('[data-ch-open="stake"]');
            await tab.waitForSelector('[data-stake-picker]');
            // Limit 30 XP: 50 nejde, hláška řekne proč
            assert.equal(await tab.getAttribute('[data-stake-pick="50"]', 'aria-disabled'), 'true');
            assert.match(await compact(tab, '[data-stake-note]'), /nejvýš 30 XP: tolik máš z posledních 7 dní/);
            // Klepnutí na vklad nad limit (Playwright tlačítko s aria-disabled sám neklepne)
            await tab.$eval('[data-stake-pick="50"]', el => el.click());
            await tab.waitForFunction(() => /nejvýš 30 XP/.test(document.querySelector('[data-stake-note]').textContent));
            assert.equal(await tab.getAttribute('[data-stake-pick="0"]', 'aria-pressed'), 'true', 'vklad nad limit se nevybere');
            await tab.click('[data-stake-pick="25"]');
            assert.equal(await tab.getAttribute('[data-stake-pick="25"]', 'aria-pressed'), 'true');
            await tab.waitForSelector('[data-taunt-row]');
            assert.match(await compact(tab, '[data-taunt-row]'), /Bez hlášky/);
            await tab.click('[data-taunt-step="1"][aria-label="Další hláška"]');
            await tab.click('[data-taunt-step="1"][aria-label="Další hláška"]');
            assert.match(await compact(tab, '[data-taunt-row]'), /„Připrav si peněženku!“/);
            assert.match(await compact(tab, '[data-stake-summary]'), /25 XP · „Připrav si peněženku!“/);
            await shot(tab, `vyzvat-${viewport.width}-${colorScheme}`);
            // Rozbalená sázka se smí posunout (jako rozbalené Téma), tlačítko Vytvořit a hrát zůstává přilepené dole na očích
            assert.ok(await tab.evaluate(() => { const r = document.querySelector('[data-ch-create]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }), 'Vytvořit a hrát je vidět');
            // Pravidla a zpět: rozpracovaná výzva (hráč, sázka, hláška) zůstane
            await tab.click('[data-stake-help]');
            await tab.waitForSelector('[data-bet-help]');
            assert.match(await compact(tab, '#dialog-overlay'), /úroveň nikdy neklesne/);
            assert.match(await compact(tab, '#dialog-overlay'), /Teď můžeš vsadit až 30 XP/);
            assert.ok(await overflow(tab) <= 0, 'pravidla sázek se vejdou');
            await shot(tab, `pravidla-${viewport.width}-${colorScheme}`);
            await tab.click('[data-dialog-back]');
            await tab.waitForSelector('[data-stake-card]');
            assert.match(await compact(tab, '[data-stake-summary]'), /25 XP · „Připrav si peněženku!“/);
            assert.match(await compact(tab, '#dialog-overlay'), /Petr Svoboda/);
            // Založení: sázka se nabídne hned (před první otázkou), pak se hraje
            await tab.click('[data-ch-count="5"]');
            await tab.click('[data-ch-create]');
            await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
            const created = Object.values(db.challenges).find(c => c.creator_id === 'u-1');
            assert.deepEqual([created.invited_id, created.stake, created.stake_state, created.taunt], ['u-2', 25, 'offered', 1]);
            for (let i = 0; i < 5; i++) await giveUp(tab);
            await tab.waitForSelector('[data-stake-status="pending"]');
            assert.match(await compact(tab, '[data-stake-status]'), /Sázka 25 XP čeká, až ji Petr Svoboda přijme/);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });

    await t.test('vyzvaný: nabídka s hláškou, Přijmout sázku nad limit nejde, Hrát bez sázky ano; přijatá sázka a výhra s mincemi', async () => {
        for (const [viewport, colorScheme] of SIZES) {
            const db = newDb();
            db.week['u-1'] = 20;
            // Eva vyzvala mě o 50 XP (víc, než mám) a Petr o 10 XP s hláškou; oba už hráli (0 bodů)
            db.challenges.EVA234 = { id: 'EVA234', creator_id: 'u-3', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 'e', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-12T08:00:00Z', stake: 50, stake_state: 'offered', taunt: 0 };
            db.challenges.PET234 = { id: 'PET234', creator_id: 'u-2', invited_id: 'u-1', topic: 'historie', count: 5, seed: 'p', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-12T09:00:00Z', stake: 10, stake_state: 'offered', taunt: 6 };
            db.results.push({ challenge_id: 'EVA234', user_id: 'u-3', correct: 0, points: 0, finished_at: '2026-11-12T08:10:00Z' }, { challenge_id: 'PET234', user_id: 'u-2', correct: 0, points: 0, finished_at: '2026-11-12T09:10:00Z' });
            db.force.PET234 = { correct: 3, points: 9 };
            const { context, tab, log } = await start(db, 'tok-u1', { viewport, colorScheme });
            await tab.waitForSelector('[data-action="challenge-open"][data-code="PET234"] [data-stake-badge="offer"]');
            assert.match(await tab.getAttribute('[data-code="PET234"] [data-stake-badge]', 'title'), /Nabídka sázky 10 XP/);
            assert.ok(await fitsScreen(tab), 'řádky s mincí bez vodorovného posunu');
            await shot(tab, `seznam-nabidky-${viewport.width}-${colorScheme}`);
            // Nad limit: chyba ze serveru, pak Hrát bez sázky
            await tab.click('[data-action="challenge-open"][data-code="EVA234"]');
            await tab.waitForSelector('[data-stake-offer]');
            assert.match(await compact(tab, '[data-stake-offer]'), /Sázka 50 XP.*Eva Mistrová sází.*\+50 XP.*−50 XP.*„Tohle dám levou zadní!“/);
            assert.match(await compact(tab, '[data-stake-short]'), /nejvýš 20 XP/);
            assert.equal(await tab.locator('[data-ch-play]').count(), 0, 'místo Hrát výzvu dvě tlačítka');
            await shot(tab, `nabidka-${viewport.width}-${colorScheme}`);
            assert.ok(await overflow(tab) <= (viewport.height < 700 ? 24 : 0), `nabídka sázky se vejde (${viewport.width}×${viewport.height}): ${await overflow(tab)} px`);
            await tab.click('[data-stake-answer="yes"]');
            await tab.waitForSelector('[data-stake-error]');
            assert.match(await compact(tab, '[data-stake-error]'), /nejvýš 20 XP/);
            assert.equal(db.challenges.EVA234.stake_state, 'offered');
            await tab.click('[data-stake-answer="no"]');
            await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
            assert.equal(db.challenges.EVA234.stake_state, 'declined');
            for (let i = 0; i < 5; i++) await giveUp(tab);
            await tab.waitForSelector('[data-challenge-outcome]');
            assert.equal(await tab.locator('[data-bet-result]').count(), 0, 'bez sázky žádné mince');
            await tab.click('[data-action="challenge-home"]').catch(() => {});
            await closeDialogs(tab);
            await tab.click('[data-action="challenge-home"]').catch(() => {});
            await waitForHome(tab);
            // Přijatá sázka: hraje se, výhra → mince se sypou ke mně, +10 XP v zařízení i v účtu
            const before = await localXp(tab);
            await tab.click('[data-action="challenge-open"][data-code="PET234"]');
            await tab.waitForSelector('[data-stake-offer]');
            assert.match(await compact(tab, '[data-taunt]'), /„Znám odpovědi i ze spaní.“/);
            await tab.click('[data-stake-answer="yes"]');
            await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
            assert.equal(db.challenges.PET234.stake_state, 'accepted');
            for (let i = 0; i < 4; i++) await giveUp(tab);
            await tab.waitForSelector('[data-action="give-up"]');
            await tab.click('[data-action="give-up"]');
            await tab.waitForSelector('[data-action="next"]');
            await tab.click('[data-action="next"]');
            await tab.waitForSelector('[data-bet-result="won"]');
            const flying = await tab.evaluate(() => document.querySelectorAll('.bet-flying').length);
            assert.ok(flying > 0, 'mince letí k vítězi');
            await tab.waitForTimeout(500);
            await shot(tab, `vysledek-let-${viewport.width}-${colorScheme}`);
            assert.match(await compact(tab, '[data-bet-result]'), /Sázka 10 XP.*Sázka je tvoje! \+10 XP.*Mince soupeře putují k tobě/);
            await tab.waitForFunction(() => !document.querySelector('.bet-flying'), null, { timeout: 5000 });
            await shot(tab, `vysledek-${viewport.width}-${colorScheme}`);
            assert.ok(await fitsScreen(tab), 'výsledek bez vodorovného posunu');
            assert.equal(db.profiles['u-1'].bet_won, 10);
            assert.equal(db.challenges.PET234.stake_settled_opponent, true);
            await tab.waitForFunction((xp) => JSON.parse(localStorage.getItem('mudrlant.progress')).xp >= xp + 10, before);
            const ledger = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.bets')));
            assert.deepEqual(ledger.users['u-1'], { won: 10, lost: 0 });
            assert.ok(ledger.shown.includes('PET234'));
            // Rozpis otázek se otevře až po sypání mincí
            await tab.waitForSelector('#dialog-overlay', { timeout: 6000 });
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });

    await t.test('zakladatel: dohraná sázka se vyrovná na pozadí (prohra jen nad hranicí úrovně), mince u výzvy a detail bez dalšího sypání', async () => {
        for (const [viewport, colorScheme] of SIZES) {
            const db = newDb();
            // Moje výzva Petrovi o 25 XP: přijal, oba dohráli, Petr líp; mám 2610 XP (úroveň 9 od 2600) → odečte se jen 10
            db.profiles['u-1'].xp = 2610;
            db.challenges.MUJ234 = { id: 'MUJ234', creator_id: 'u-1', invited_id: 'u-2', topic: 'zemepis', count: 5, seed: 'm', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-11T08:00:00Z', stake: 25, stake_state: 'accepted', taunt: 2 };
            db.challenges.VYH234 = { id: 'VYH234', creator_id: 'u-2', invited_id: 'u-1', topic: 'vlajky', count: 5, seed: 'v', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-10T08:00:00Z', stake: 10, stake_state: 'accepted', taunt: null, stake_settled_opponent: true, stake_delta_opponent: 10, stake_settled_creator: true, stake_delta_creator: -10 };
            db.results.push({ challenge_id: 'MUJ234', user_id: 'u-1', correct: 2, points: 6, finished_at: '2026-11-11T08:10:00Z' }, { challenge_id: 'MUJ234', user_id: 'u-2', correct: 4, points: 14, finished_at: '2026-11-11T09:10:00Z' },
                { challenge_id: 'VYH234', user_id: 'u-1', correct: 4, points: 12, finished_at: '2026-11-10T08:10:00Z' }, { challenge_id: 'VYH234', user_id: 'u-2', correct: 1, points: 3, finished_at: '2026-11-10T09:10:00Z' });
            const { context, tab, log } = await start(db, 'tok-u1', { viewport, colorScheme, storage: { 'mudrlant.progress': JSON.stringify({ xp: 2610, counters: { answered: 200, challenges: 4 }, badges: {} }), 'mudrlant.bets': JSON.stringify({ users: { 'u-1': { won: 0, lost: 0 } }, shown: [] }) } });
            await tab.waitForSelector('[data-code="MUJ234"] [data-stake-badge="lost"]', { timeout: 15000 });
            await tab.waitForSelector('#toast');
            assert.match(await compact(tab, '#toast'), /Sázka nevyšla: −10 XP. Úroveň zůstává./);
            assert.equal(db.profiles['u-1'].xp, 2600);
            assert.equal(db.profiles['u-1'].bet_lost, 10);
            await tab.waitForFunction(() => JSON.parse(localStorage.getItem('mudrlant.progress')).xp === 2600);
            assert.equal(core.levelFromXp(2600), core.levelFromXp(2610), 'úroveň neklesla');
            assert.match(await tab.getAttribute('[data-code="MUJ234"] [data-stake-badge]', 'title'), /Prohraná sázka −10 XP/);
            assert.match(await tab.getAttribute('[data-code="VYH234"] [data-stake-badge]', 'title'), /Vyhraná sázka \+10 XP/);
            // Starší XP z hraní prohru v účtu nepřepíše (ani další sladění s účtem)
            await tab.waitForTimeout(600);
            assert.equal(db.profiles['u-1'].xp, 2600, 'starší XP z hraní prohru v účtu nepřepíše');
            assert.ok(await fitsScreen(tab));
            await shot(tab, `seznam-${viewport.width}-${colorScheme}`);
            // Detail: výsledek sázky s mincemi u Petra
            await tab.click('[data-action="challenge-open"][data-code="MUJ234"]');
            await tab.waitForSelector('#dialog-overlay [data-bet-result="lost"]');
            assert.match(await compact(tab, '[data-bet-result]'), /Sázka 25 XP nevyšla. −10 XP/);
            await tab.evaluate(() => document.querySelectorAll('#toast, #celebration').forEach(el => el.remove()));
            await shot(tab, `detail-${viewport.width}-${colorScheme}`);
            assert.ok(await overflow(tab) <= (viewport.height < 700 ? 24 : 0), `detail s výsledkem sázky se vejde: ${await overflow(tab)} px`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });

    await t.test('omezený pohyb: výsledek bez letících mincí; profil hráče se sázkovou bilancí; databáze bez sázek nic neukáže', async () => {
        const db = newDb();
        db.challenges.RED234 = { id: 'RED234', creator_id: 'u-2', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 'r', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-12T08:00:00Z', stake: 25, stake_state: 'accepted', taunt: null };
        db.results.push({ challenge_id: 'RED234', user_id: 'u-2', correct: 0, points: 0, finished_at: '2026-11-12T08:10:00Z' });
        db.force.RED234 = { correct: 2, points: 6 };
        const { context, tab, log } = await start(db, 'tok-u1', { reducedMotion: 'reduce' });
        await tab.click('[data-action="challenge-open"][data-code="RED234"]');
        await tab.waitForSelector('[data-stake-status="active"]');
        assert.match(await compact(tab, '[data-stake-status]'), /Sázka 25 XP platí/);
        await tab.click('[data-ch-play]');
        for (let i = 0; i < 5; i++) await giveUp(tab);
        await tab.waitForSelector('[data-bet-result="won"]');
        await tab.waitForTimeout(300);
        assert.equal(await tab.evaluate(() => document.querySelectorAll('.bet-flying').length), 0, 'bez animace letu');
        await closeDialogs(tab);
        await tab.click('[data-action="challenge-home"]');
        await waitForHome(tab);
        // Profil Petra: sázková bilance (Petr svou prohru už vyrovnal)
        Object.assign(db.challenges.RED234, { stake_settled_creator: true, stake_delta_creator: -25 });
        await tab.waitForSelector('[data-action="challenge-open"][data-code="RED234"] [data-player-id="u-2"]');
        await tab.click('[data-action="challenge-open"][data-code="RED234"] [data-player-id="u-2"]');
        await tab.waitForSelector('[data-bet-balance]');
        assert.match(await compact(tab, '[data-bet-balance]'), /Sázky\s*−25 XP\s*0 výher\s*1 prohra/);
        await shot(tab, 'profil-390-light');
        assert.ok(await overflow(tab) <= 0, 'profil s bilancí se vejde');
        await context.close();
        assert.deepEqual(log.errors, []);
        // Starší databáze: bez řádku Sázka a bez mincí
        const old = newDb();
        old.betsMissing = true;
        const legacy = await start(old, 'tok-u1');
        await legacy.tab.click('[data-action="new-challenge"]');
        await legacy.tab.fill('#opp-search', 'Petr');
        await legacy.tab.click('[data-pick-opp="u-2"]');
        await legacy.tab.waitForTimeout(500);
        assert.equal(await legacy.tab.locator('[data-stake-card]').count(), 0);
        assert.deepEqual(legacy.log.errors, []);
        await legacy.context.close();
    });

    await t.test('jiné zařízení: prohra vyrovnaná jinde se odečte před sloučením XP (starší vyšší XP ji nepřepíše)', async () => {
        const db = newDb();
        db.profiles['u-1'] = { ...db.profiles['u-1'], xp: 2975, bet_lost: 25 };
        const { context, tab, log } = await start(db, 'tok-u1', { storage: { 'mudrlant.progress': JSON.stringify({ xp: 3000, counters: { answered: 200 }, badges: {} }), 'mudrlant.bets': JSON.stringify({ users: { 'u-1': { won: 0, lost: 0 } }, shown: [] }) } });
        await tab.waitForFunction(() => JSON.parse(localStorage.getItem('mudrlant.progress')).xp === 2975, null, { timeout: 15000 });
        assert.ok(!db.patches.some(patch => patch.xp > 2975));
        assert.equal(db.profiles['u-1'].xp, 2975);
        const ledger = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.bets')));
        assert.deepEqual(ledger.users['u-1'], { won: 0, lost: 25 });
        assert.deepEqual(log.errors, []);
        await context.close();
    });

    await t.test('profil hráče se sázkovou bilancí se vejde ve všech velikostech a režimech', async () => {
        for (const [viewport, colorScheme] of SIZES) {
            const db = newDb();
            db.challenges.PRF234 = { id: 'PRF234', creator_id: 'u-2', invited_id: 'u-1', topic: 'zemepis', count: 5, seed: 'f', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-10T08:00:00Z', stake: 25, stake_state: 'accepted', taunt: null, stake_settled_creator: true, stake_delta_creator: 25, stake_settled_opponent: true, stake_delta_opponent: -25 };
            db.challenges.PRG234 = { id: 'PRG234', creator_id: 'u-1', invited_id: 'u-2', topic: 'vlajky', count: 5, seed: 'g', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-11T08:00:00Z', stake: 10, stake_state: 'accepted', taunt: null, stake_settled_creator: true, stake_delta_creator: 10, stake_settled_opponent: true, stake_delta_opponent: -10 };
            db.results.push({ challenge_id: 'PRF234', user_id: 'u-1', correct: 1, points: 3, finished_at: '2026-11-10T08:10:00Z' }, { challenge_id: 'PRF234', user_id: 'u-2', correct: 4, points: 12, finished_at: '2026-11-10T09:10:00Z' },
                { challenge_id: 'PRG234', user_id: 'u-1', correct: 4, points: 12, finished_at: '2026-11-11T08:10:00Z' }, { challenge_id: 'PRG234', user_id: 'u-2', correct: 1, points: 3, finished_at: '2026-11-11T09:10:00Z' });
            const { context, tab, log } = await start(db, 'tok-u1', { viewport, colorScheme, storage: { 'mudrlant.bets': JSON.stringify({ users: { 'u-1': { won: 10, lost: 25 } }, shown: ['PRF234', 'PRG234'] }) } });
            await tab.waitForSelector('[data-code="PRF234"] [data-stake-badge="lost"]');
            await tab.click('[data-action="challenge-open"][data-code="PRF234"] [data-player-id="u-2"]');
            await tab.waitForSelector('[data-bet-balance]');
            assert.match(await compact(tab, '[data-bet-balance]'), /Sázky\s*\+15 XP\s*1 výhra\s*1 prohra/);
            await shot(tab, `profil-${viewport.width}-${colorScheme}`);
            assert.ok(await overflow(tab) <= (viewport.height < 700 ? 24 : 0), `profil se vejde: ${await overflow(tab)} px`);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        }
    });
});
