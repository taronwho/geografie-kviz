// Okna se vejdou bez posouvání: projde všechna okna aplikace, která jdou otevřít (profil hráče, Nastavení, Můj postup, Co hrát, výzvy,
// odměny, skupiny, Kvíz dne, turnaj, přátelé, hlášení, upozornění, popis místa, tip, Moje data, přezdívka), s realisticky plnými daty
// z falešného Supabase v paměti (jako tests/e2e-friends.test.js, e2e-groups, e2e-tournament, e2e-daily-quiz) na 390×780 a 360×640.
// Měří svislé přetečení posuvného panelu okna (scrollHeight − clientHeight), vypíše tabulku a hlídá: na 390×780 nula, na 360×640 nejvýš
// malá rezerva. Dlouhé seznamy (výjimky níže, každá s důvodem) se posouvat smí, ale hlavička okna a hlavní akce zůstanou vidět.
// SCREENSHOT_DIR=… uloží snímky oken. Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const DQ = require('../daily-quiz.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const VAPID = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const CONFIG = `window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key", vapidPublicKey: "${VAPID}" };`;
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const SHOTS = process.env.SCREENSHOT_DIR || '';
const NOW = '2026-11-11T10:00:00Z'; // středa
const TODAY = '2026-11-11';
const MON = '2026-11-09';
const SIZES = [{ width: 390, height: 780 }, { width: 360, height: 640 }];
// Na 360×640 smí okno přetéct nejvýš o tolik (víc než stejná tvrdá nula by znamenalo skládat obsah do sloupců, které se nevejdou)
const SMALL_TOLERANCE = 24;
// Záložky Nastavení (a jejich stavy) se musí vejít bez posouvání na obou velikostech, bez rezervy
const SETTINGS_STRICT = /^Nastavení/;
// FIT_SCHEME=dark projde okna v tmavém režimu (snímky pro kontrolu vzhledu)
const SCHEME = process.env.FIT_SCHEME === 'dark' ? 'dark' : 'light';

// Dlouhé seznamy, které se posouvat smí: reason = proč, size = jen na této velikosti (jinak na obou), keep = hlavní akce, která při posouvání
// zůstane vidět (lepkavě). Lepkavý nadpis okna se zavíráním (data-dialog-head) se hlídá u všech výjimek v #dialog-overlay.
const EXEMPT = {
    'Všechny odznaky': { reason: 'seznam všech odznaků (stovky medailí po skupinách)', keep: '[data-back-progress]' },
    'Album – Odznaky': { reason: 'všechny skupiny odznaků v albu sbírky (přes 50 dlaždic)', keep: '[data-back-progress]' },
    'Úrovně a tituly': { reason: 'seznam všech úrovní s tituly', keep: '[data-back-progress]' },
    'Rozpis otázek výzvy': { reason: 'seznam všech otázek s odpověďmi obou hráčů (záhlaví sloupců lepkavě)' },
    'Týdenní žebříček': { reason: 'žebříček hráčů' },
    'Turnaj (běží)': { reason: 'pavouk a pořadí desítek hráčů', keep: '[data-t-play]' },
    'Popis místa': { reason: 'článek z Wikipedie (text libovolné délky)', keep: '#place-info [data-close]' },
    'Kvíz dne – výsledek': { reason: 'obrazovka s pořadím dne a přátel (žebříček)', keep: '[data-action="quiz-home"]' },
    'Skupiny – detail': { reason: 'pořadí všech členů skupiny (devět se na 390×780 vejde)', size: '360×640', keep: '[data-group-challenge-new]' },
    'Skupiny – detail (Týden)': { reason: 'týdenní pořadí všech členů skupiny', keep: '[data-group-challenge-new]' },
    'Skupiny – správa': { reason: 'seznam všech členů s odebráním' }
};
const exempt = (name, key) => (EXEMPT[name] && (!EXEMPT[name].size || EXEMPT[name].size === key) ? EXEMPT[name] : null);

const serveFile = (pathname) => {
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { status: 404, headers: {}, body: '' };
    const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
    return { status: 200, headers, body: fs.readFileSync(file) };
};

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = uid(1);
const PETR = uid(2);
const EVA = uid(3);
const TOMAS = uid(5);
const USERS = { 'tok-u1': { id: ME, name: 'Jana Nováková' } };
const login = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: ME, email: 'jana.novakova@example.com', name: 'Jana Nováková' } }) };
const BADGES = ['odpovedi-2500', 'rada-50', 'serie-60', 'dny-100', 'dokonale-14', 'bez-napovedy-500', 'psani-500', 'tezke-200', 'vyzvy-100', 'vyhry-50', 'vyhry-v-rade-10',
    'zalozene-50', 'perfektni-vyzvy-25', 'uroven-50', 'poznane-3000', 'vsestrannost-9', 'hvezdy-2', 'tema-zemepis-600', 'tema-historie-300', 'zbehly-vlajky-25', 'turnaj-semifinale',
    'kviz-dne-50', 'kviz-serie-14', 'bleskovka-16'];
const player = (n, name, avatar, extra = {}) => ({ id: uid(n), display_name: name, avatar, color: 'sky', frame: null, title_pref: null, owl: null, xp: 100 * n, badges: [], rating: 1200, rated_games: 5, blocked_topics: [], accepts_mix: true, ...extra });
const NAMES = ['Adam Král', 'Barbora Malá', 'Cyril Dušek', 'Dana Horáková', 'Emil Pokorný', 'František Beneš', 'Gita Veselá', 'Honza Černý', 'Ivana Marková', 'Jiří Fiala',
    'Klára Šťastná', 'Libor Kolář', 'Marta Urbanová', 'Nikola Bartoš', 'Ondřej Kříž', 'Petra Sýkorová'];
const CODES = ['ABC234', 'DEF567', 'GHJ892', 'KMN345', 'PQR678', 'STU923', 'VWX234', 'XYZ456', 'BCD789', 'EFG234'];

const newDb = ({ quizDone = true } = {}) => {
    const db = {
        profiles: {
            [ME]: player(1, 'Jana Nováková', '🦊', { color: 'emerald', xp: 26000, badges: BADGES.slice(0, 16), rating: 1380, rated_games: 40, rewards: null, showcase: ['l:2026-10:diamant', 'b:vyhry-50'] }),
            [PETR]: player(2, 'Petr Svoboda', '🐼', { xp: 14200, badges: BADGES, rating: 1520, rated_games: 60, showcase: ['l:2026-10:mistr', 'b:dokonale-14', 'd:zemepis'] }),
            [EVA]: player(3, 'Eva Mistrová', '🦉', { color: 'violet', xp: 90000, badges: BADGES, rating: 1720, rated_games: 120 }),
            [uid(4)]: player(4, 'Lenka Dvořáková', '🐸', { xp: 3000, rating: 1150 }),
            [TOMAS]: player(5, 'Tomáš Malý', '🐯', { xp: 9000, badges: BADGES.slice(4), rating: 1290, rated_games: 22 })
        },
        // Přátelství: Petr a Lenka přijatí, Tomášovi jsem poslala žádost, Eva čeká na mě
        friendships: [{ user_id: ME, friend_id: PETR, status: 'accepted' }, { user_id: uid(4), friend_id: ME, status: 'accepted' }, { user_id: ME, friend_id: TOMAS, status: 'pending' }, { user_id: EVA, friend_id: ME, status: 'pending' }],
        challenges: {}, results: [], progress: [], blocks: [uid(14), uid(15)], reactions: [],
        quiz: {}, groups: [], tournaments: [], entries: [], matches: [], tResults: [], notices: []
    };
    for (let i = 0; i < 16; i++) db.profiles[uid(10 + i)] = player(10 + i, NAMES[i], ['🐸', '🦁', '🐨', '🐙', '🦄', '🐝'][i % 6], { xp: 500 * i, rating: 1100 + 25 * i });
    // Výzvy s Petrem a Tomášem (obojí dohrané), jedna od Petra čeká na mě
    CODES.forEach((code, i) => {
        const other = i < 6 ? PETR : TOMAS;
        db.challenges[code] = { id: code, creator_id: i % 2 ? ME : other, invited_id: i % 2 ? other : ME, topic: ['zemepis', 'historie', 'mix', 'vlajky', 'biologie'][i % 5], count: 10, seed: `s-${code}`, include_hard: i === 0, categories: [], variant: 'choices', created_at: `2026-11-0${1 + (i % 9)}T10:00:00Z` };
        db.results.push({ challenge_id: code, user_id: other, correct: 5 + (i % 4), points: 14 + i, finished_at: `2026-11-0${1 + (i % 9)}T10:30:00Z` });
        db.results.push({ challenge_id: code, user_id: ME, correct: 6 + (i % 3), points: 16 + (i % 5), finished_at: `2026-11-0${1 + (i % 9)}T11:00:00Z` });
        for (const [user, base] of [[ME, 0], [other, 1]]) for (let idx = 0; idx < 10; idx++) db.progress.push({ challenge_id: code, user_id: user, idx, correct: (idx + base) % 3 !== 0, points: (idx + base) % 3 !== 0 ? 1 + ((idx + base) % 4) : 0, answer: (idx + base) % 3 !== 0 ? 'Praha' : 'Velmi dlouhá odpověď, která se do buňky nevejde', hints: idx % 4, ms: 4000 + idx * 1500 });
    });
    db.challenges.HJK567 = { id: 'HJK567', creator_id: EVA, invited_id: ME, topic: 'historie', count: 10, seed: 's-new', include_hard: false, categories: [], variant: 'choices', created_at: '2026-11-11T08:00:00Z' };
    db.results.push({ challenge_id: 'HJK567', user_id: EVA, correct: 8, points: 25, finished_at: '2026-11-11T08:20:00Z' });
    db.reactions.push({ id: 1, challenge_id: 'ABC234', match_id: null, from_id: PETR, to_id: ME, emoji: '🔥', created_at: '2026-11-10T10:00:00Z' }, { id: 2, challenge_id: 'VWX234', match_id: null, from_id: TOMAS, to_id: ME, emoji: '🤝', created_at: '2026-11-10T10:00:00Z' });
    // Kvíz dne: dohrané pokusy ostatních (a můj, když quizDone)
    [PETR, EVA, uid(4), TOMAS, ...Array.from({ length: 12 }, (_, i) => uid(10 + i))].forEach((user, i) => { db.quiz[`${user}|${TODAY}`] = { user_id: user, day: TODAY, answered: 10, correct: 10 - (i % 6), score: 40 - 3 * (i % 7), time_ms: 50000 + 7000 * i, bitmap: 1023 >> (i % 3), finished: true }; });
    if (quizDone) db.quiz[`${ME}|${TODAY}`] = { user_id: ME, day: TODAY, answered: 10, correct: 8, score: 30, time_ms: 95000, bitmap: 1019, finished: true };
    ['2026-11-08', '2026-11-09', '2026-11-10'].forEach(day => { db.quiz[`${ME}|${day}`] = { user_id: ME, day, answered: 10, correct: 7, score: 25, time_ms: 90000, bitmap: 1015, finished: true }; });
    // Skupiny: třída (zakladatelka já, 9 členů), rodina a kroužek
    const G = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
    db.groups.push({ id: G(1), name: '5.B Základní škola Komenského', icon: '🏫', code: 'K7M2QX', owner_id: ME, members: [ME, PETR, EVA, uid(4), TOMAS, uid(10), uid(11), uid(12), uid(13)] },
        { id: G(2), name: 'Rodina Novákových', icon: '👪', code: 'RDN234', owner_id: TOMAS, members: [TOMAS, ME, uid(14)] },
        { id: G(3), name: 'Šachový kroužek', icon: '🚀', code: 'SACH23', owner_id: EVA, members: [EVA, ME, PETR, uid(15)] });
    db.groupChallenge = 'HJK567';
    // Turnaje: otevřený příští týden (40 přihlášených, já mezi nimi) a běžící tento týden (16 hráčů, já hraju čtvrtfinále)
    const T_OPEN = uid(900);
    const T_RUN = uid(901);
    db.tournaments.push({ id: T_OPEN, topic: 'mix', week_start: '2026-11-16', started_on: null, capacity: 64, status: 'open', size: null, rounds: null, seed: 'next' });
    db.tournaments.push({ id: T_RUN, topic: 'mix', week_start: MON, started_on: '2026-11-10', capacity: 64, status: 'running', size: 16, rounds: 4, seed: 'run' });
    const runIds = [ME, PETR, EVA, uid(4), TOMAS, ...Array.from({ length: 11 }, (_, i) => uid(10 + i))];
    runIds.forEach((user, i) => db.entries.push({ tournament_id: T_RUN, user_id: user, joined_at: `2026-11-0${1 + (i % 7)}T08:${String(10 + i).padStart(2, '0')}:00Z`, status: 'playing', place: null }));
    [ME, ...Array.from({ length: 16 }, (_, i) => uid(10 + i)), PETR, EVA].forEach((user, i) => db.entries.push({ tournament_id: T_OPEN, user_id: user, joined_at: `2026-11-1${i % 2}T08:${String(10 + i).padStart(2, '0')}:00Z`, status: 'registered', place: null }));
    let mid = 0;
    let alive = runIds;
    for (let round = 1; round <= 2; round++) {
        const next = [];
        for (let slot = 1; slot <= alive.length / 2; slot++) {
            const [a, b] = [alive[2 * slot - 2], alive[2 * slot - 1]];
            const decided = round === 1;
            const winner = decided ? a : null;
            const match = { id: uid(1000 + mid++), tournament_id: T_RUN, round, slot, third: false, p1: a, p2: b, winner, decided_by: decided ? 'played' : null };
            db.matches.push(match);
            if (decided) db.tResults.push({ match_id: match.id, user_id: a, started_at: 'x', finished_at: 'y', correct: 7, points: 20, time_ms: 90000 }, { match_id: match.id, user_id: b, started_at: 'x', finished_at: 'y', correct: 4, points: 11, time_ms: 95000 });
            if (decided) { const loser = db.entries.find(e => e.tournament_id === T_RUN && e.user_id === b); loser.status = 'out'; loser.place = 9; }
            next.push(a);
        }
        alive = next;
    }
    db.weekly = Object.values(db.profiles).slice(0, 14).map((p, i) => ({ ...p, league: ['mistr', 'zlato', 'stribro', 'bronz'][i % 4], week_delta: 30 - 4 * i, week_wins: 4 - (i % 4), week_games: 5 }));
    return db;
};

const quizJson = (db, user, row) => {
    const days = Object.values(db.quiz).filter(r => r.user_id === user && r.answered > 0 && (r.finished || r.day < TODAY)).map(r => r.day);
    return { day: TODAY, started: Boolean(row), answered: row ? row.answered : 0, correct: row ? row.correct : 0, score: row ? row.score : 0, time_ms: row ? row.time_ms : 0, bitmap: row ? row.bitmap : 0, finished: Boolean(row && row.finished), streak: DQ.streakOf(days, TODAY), best_streak: DQ.bestStreakOf(days) };
};

const backend = async (context, db) => {
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
    await context.route('https://proj.supabase.co/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        const me = USERS[(request.headers().authorization || '').replace('Bearer ', '')];
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        const none = () => route.fulfill({ status: 204, body: '' });
        if (url.pathname.startsWith('/auth/')) return json({});
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        if (!me) return json({ message: 'no token' }, 401);
        const param = (key) => url.searchParams.get(key) || '';
        const eq = (key) => param(key).replace(/^eq\./, '');
        const inList = (key) => param(key).replace(/^in\.\(|\)$/g, '').split(',');
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const method = request.method();
        const profile = (id) => (db.profiles[id] ? { ...db.profiles[id] } : null);
        const challengeRow = (c) => ({ ...c, creator: profile(c.creator_id), invited: c.invited_id ? profile(c.invited_id) : null });
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const name = rpc ? rpc[1] : '';
        if (rpc) {
            if (name === 'schema_version') return json(REQUIRED_SCHEMA);
            if (name === 'touch_seen' || name === 'tournament_tick') return none();
            if (name === 'dev_is_admin') return json(false);
            if (name === 'friends_list') {
                return json(db.friendships.filter(f => f.user_id === me.id || f.friend_id === me.id).map(f => {
                    const other = f.user_id === me.id ? f.friend_id : f.user_id;
                    return { ...profile(other), last_seen: '2026-11-11T08:00:00Z', status: f.status, direction: f.user_id === me.id ? 'out' : 'in', since: '2026-11-01T10:00:00Z', wins: other === PETR ? 4 : 1, losses: other === PETR ? 2 : 1, draws: other === PETR ? 1 : 0 };
                }));
            }
            if (name === 'search_players') return json([]);
            if (name === 'weekly_leaderboard') return json(db.weekly);
            if (name === 'league_seasons') {
                const leagues = ['diamant', 'platina', 'zlato', 'mistr', 'stribro', 'zlato', 'bronz', 'platina', 'zlato', 'diamant', 'stribro', 'zlato'];
                const months = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11'];
                return json({ month: '2026-11', seasons: [{ month: '2026-11', league: 'zlato', peak: 1380, games: 7, finished: false }, ...months.map((month, i) => ({ month, league: leagues[i], peak: 1100 + 50 * i, games: 3 + i, finished: true }))], best: { month: '2026-07', league: 'mistr', peak: 1720 } });
            }
            if (name === 'claim_tournament_xp') return json([]);
            if (name === 'challenge_details') {
                return json(db.progress.filter(r => r.challenge_id === body.code).map(({ challenge_id, ...rest }) => rest));
            }
            if (name === 'my_tournament_stats') return json([{ best: 4, wins: 3, played: 5 }]);
            if (name === 'tournament_details') return json([]);
            if (/^tournament_/.test(name)) return none();
            if (/^daily_quiz_/.test(name)) {
                const row = db.quiz[`${me.id}|${TODAY}`];
                if (name === 'daily_quiz_state' || name === 'daily_quiz_start') return json(quizJson(db, me.id, row));
                const all = Object.values(db.quiz).filter(r => r.day === TODAY && r.finished).sort((a, b) => b.score - a.score || a.time_ms - b.time_ms).map((r, i) => ({ ...r, rank: i + 1 }));
                const shape = (r) => ({ rank: r.rank, ...profile(r.user_id), score: r.score, correct: r.correct, time_ms: r.time_ms, me: r.user_id === me.id });
                if (name === 'daily_quiz_board') {
                    const mine = all.find(r => r.user_id === me.id);
                    return json({ day: TODAY, total: all.length, top: all.slice(0, body.top_n || 50).map(shape), me: mine ? { rank: mine.rank, score: mine.score, correct: mine.correct, time_ms: mine.time_ms, bitmap: mine.bitmap, answered: mine.answered } : null, streak: 4, best_streak: 9 });
                }
                if (name === 'daily_quiz_friends') {
                    const circle = db.friendships.filter(f => f.status === 'accepted').map(f => (f.user_id === me.id ? f.friend_id : f.user_id));
                    return json({ day: TODAY, friends: circle.length, rows: all.filter(r => r.user_id === me.id || circle.includes(r.user_id)).map(shape) });
                }
                return json(quizJson(db, me.id, row));
            }
            if (/^(my_groups|group_)/.test(name)) {
                const group = (id) => db.groups.find(g => g.id === id);
                const summary = (g) => ({ id: g.id, name: g.name, icon: g.icon, code: g.code, owner_id: g.owner_id, is_owner: g.owner_id === me.id, members: g.members.length });
                const stat = (id, i) => ({ today: i % 3 === 2 ? null : { score: 36 - 3 * i, correct: 9 - (i % 4), time_ms: 60000 + 5000 * i }, week_score: 120 - 9 * i, week_days: 3 - (i % 3), week_correct: 30 - i, week_time_ms: 300000 + i * 1000, week_xp: 1500 - 100 * i });
                if (name === 'my_groups') return json(db.groups.filter(g => g.members.includes(me.id)).map(g => ({ ...summary(g), played_today: true, leader: { ...profile(g.members[1]), score: 36, time_ms: 1, me: false } })));
                if (name === 'group_detail') {
                    const g = group(body.gid);
                    const ch = db.challenges[db.groupChallenge];
                    return json({
                        ...summary(g), day: TODAY, week_start: MON,
                        challenge: g.owner_id === me.id ? { id: ch.id, topic: ch.topic, count: ch.count, created_at: ch.created_at, creator: profile(ch.creator_id), results: db.results.filter(r => r.challenge_id === ch.id) } : null,
                        rows: g.members.map((id, i) => ({ ...profile(id), owner: id === g.owner_id, me: id === me.id, joined_at: '2026-11-01T10:00:00Z', ...stat(id, i) }))
                    });
                }
                if (name === 'group_preview') { const g = db.groups.find(item => item.code === body.join_code); return json(g ? { id: g.id, name: g.name, icon: g.icon, code: g.code, members: g.members.length, owner: profile(g.owner_id), member: g.members.includes(me.id) } : null); }
                return none();
            }
            if (name === 'export_my_data') return json({ ucet: { id: me.id } });
            return json(null);
        }
        if (/^\/rest\/v1\/(friendships|player_blocks|player_reports|question_reports)$/.test(url.pathname)) {
            if (method !== 'GET') return route.fulfill({ status: 201, body: '' });
            if (url.pathname === '/rest/v1/player_blocks') return json(db.blocks.map(id => ({ blocked: id, created_at: '2026-11-04T09:00:00Z', player: profile(id) })));
            return json([]);
        }
        if (url.pathname === '/rest/v1/match_reactions') {
            if (method !== 'GET') return route.fulfill({ status: 201, body: '' });
            const from = eq('from_id');
            const to = eq('to_id');
            return json(db.reactions.filter(r => (!from || r.from_id === from) && (!to || r.to_id === to)));
        }
        if (url.pathname === '/rest/v1/profiles') {
            if (method === 'PATCH') return none();
            const row = profile(eq('id'));
            return json(row ? [row] : []);
        }
        if (url.pathname === '/rest/v1/rating_history') return json([]);
        if (url.pathname === '/rest/v1/challenge_progress') return json(db.progress.filter(r => r.challenge_id === eq('challenge_id') && r.user_id === me.id).map(({ challenge_id, user_id, ...rest }) => rest));
        if (url.pathname === '/rest/v1/challenges') {
            if (method === 'POST') { db.challenges[body.id] = { ...body, created_at: NOW }; return json([db.challenges[body.id]], 201); }
            if (url.searchParams.has('invited_id')) return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(challengeRow));
            if (param('id').startsWith('in.')) return json(inList('id').map(id => db.challenges[id]).filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 1));
            const found = db.challenges[eq('id')];
            return json(found ? [challengeRow(found)] : []);
        }
        if (url.pathname === '/rest/v1/challenge_results') {
            if (method === 'POST') return route.fulfill({ status: 201, body: '' });
            const withPlayer = (r) => ({ ...r, player: profile(r.user_id) });
            if (param('challenge_id').startsWith('in.') && param('user_id').startsWith('eq.')) return json(db.results.filter(r => r.user_id === eq('user_id') && inList('challenge_id').includes(r.challenge_id)));
            if (param('user_id').startsWith('eq.')) return json(db.results.filter(r => r.user_id === eq('user_id')).sort((a, b) => b.finished_at.localeCompare(a.finished_at)).map(r => ({ ...r, challenge: challengeRow(db.challenges[r.challenge_id]) })));
            if (param('challenge_id').startsWith('in.')) return json(db.results.filter(r => inList('challenge_id').includes(r.challenge_id) && r.user_id !== param('user_id').replace('neq.', '')).map(withPlayer));
            return json(db.results.filter(r => r.challenge_id === eq('challenge_id')).map(withPlayer));
        }
        if (url.pathname === '/rest/v1/tournaments') return json(db.tournaments.filter(t => inList('status').includes(t.status)));
        if (url.pathname === '/rest/v1/tournament_entries') {
            const rows = db.entries.filter(e => e.tournament_id === eq('tournament_id') && (!eq('user_id') || e.user_id === eq('user_id'))).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
            return json(rows.map(e => ({ user_id: e.user_id, joined_at: e.joined_at, status: e.status, place: e.place, player: profile(e.user_id) })));
        }
        if (url.pathname === '/rest/v1/tournament_matches') {
            return json(db.matches.filter(m => m.tournament_id === eq('tournament_id')).map(m => ({ ...m, results: db.tResults.filter(r => r.match_id === m.id).map(({ match_id, ...rest }) => rest) })));
        }
        if (url.pathname === '/rest/v1/tournament_notices') return json(db.notices);
        if (url.pathname === '/rest/v1/push_subscriptions') return json([]);
        return json([]);
    });
};

// Atrapa Push API (jako tests/e2e-push.test.js): prohlížeč má upozornění zablokovaná, klepnutí na přepínač otevře návod
const pushStub = () => {
    window.PushManager = function PushManager() {};
    window.Notification = { permission: 'denied', requestPermission: async () => 'denied' };
    const registration = { scope: `${location.origin}/`, pushManager: { getSubscription: async () => null, subscribe: async () => null }, active: { state: 'activated', postMessage: () => {} } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration), register: async () => registration, getRegistration: async () => registration, controller: null, addEventListener() {} } });
};

// Bohatý stav v zařízení: úroveň, odznaky, naučená místa (hvězdy mistrovství), odměny (ochrana série, čekající truhla, diplom), cíle týdne
const richStorage = () => {
    // + milník alba sbírky, který tahle sbírka (asi 30 %) už má – oslava milníku by jinak na úvodu odsunula nabídku přezdívky
    const badges = Object.fromEntries([...BADGES, 'sberatel-25'].map((id, i) => [id, `2026-10-${String(1 + i).padStart(2, '0')}`]));
    const learned = { zemepis: Array.from({ length: 320 }, (_, i) => `Q${900000 + i}`), historie: Array.from({ length: 140 }, (_, i) => `Q${800000 + i}`), vlajky: Array.from({ length: 60 }, (_, i) => `Q${700000 + i}`), biologie: Array.from({ length: 40 }, (_, i) => `Q${600000 + i}`) };
    return {
        'mudrlant.progress': JSON.stringify({ xp: 26000, counters: { correct: 2600, answered: 3400, bestRun: 52, topicBest: { zemepis: 10, historie: 9 }, challengesPlayed: 120, challengeWins: 64 }, badges }),
        'mudrlant.learned': JSON.stringify(learned),
        'mudrlant.rewards': JSON.stringify({ v: 1, freezes: 2, name: 'Jana Nováková', ready: ['2026-11-02'], chests: { '2026-10-26': 'xp' }, diplomas: { zemepis: '2026-10-20' } })
    };
};

const setup = async (browser, { viewport, storage = {}, db = newDb(), query = '', signedOut = false } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: SCHEME, viewport, reducedMotion: 'reduce', deviceScaleFactor: SHOTS ? 2 : 1 });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    await context.addInitScript(pushStub);
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host'), 'mudrlant.homeTab': JSON.stringify('multi'), ...(signedOut ? {} : login), ...richStorage(), ...storage });
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const log = { errors: [], csp: [] };
    tab.on('pageerror', error => log.errors.push(error.message));
    tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text()); });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) return route.fulfill(serveFile(url.pathname));
        if (url.hostname === 'proj.supabase.co') return route.fallback();
        if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: fixtures.extractFor(url.searchParams.get('titles')) } } } } });
        if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org' || url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/png', body: PNG });
        return route.abort();
    });
    await backend(context, db);
    await tab.clock.setFixedTime(new Date(NOW));
    await tab.goto(`${ORIGIN}/${query}`);
    await tab.waitForFunction(() => { const content = document.getElementById('app-content'); return Boolean(content && content.querySelector('#home-tabs')); }, null, { timeout: 30000 });
    return { context, tab, log, db };
};

const OVERLAYS = ['dialog-overlay', 'settings-overlay', 'play-chooser', 'place-info', 'chest-overlay'];
// Přetečení posuvného panelu otevřeného okna (u obrazovky v #app-content jejího obsahu); vrátí i rozměry panelu a jeho hlavní akce
const measure = (screen) => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    const overlay = screen ? null : ['dialog-overlay', 'settings-overlay', 'play-chooser', 'place-info', 'chest-overlay'].map(id => document.getElementById(id)).find(Boolean);
    const panel = screen ? document.getElementById('app-content') : overlay && (overlay.id === 'chest-overlay' ? overlay.querySelector('[data-chest]') || overlay.firstElementChild : overlay.firstElementChild);
    if (!panel) return resolve(null);
    const box = panel.getBoundingClientRect();
    // Dotykové plochy pod 40 px (tlačítka a odkazy v okně; skryté a mimo panel se nepočítají)
    const small = [...panel.querySelectorAll('button, a[href], [role="tab"], summary')].filter(el => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Math.min(r.width, r.height) < 39.5 && el.closest('[data-touch-ok]') === null;
    }).map(el => `${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
    resolve({ overflow: Math.max(0, panel.scrollHeight - panel.clientHeight), height: Math.round(box.height), top: Math.round(box.top), bottom: Math.round(box.bottom), hscroll: panel.scrollWidth - panel.clientWidth, small });
})));

test('okna se vejdou bez posouvání', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const table = {};
    const errors = [];
    t.after(async () => {
        await browser.close();
        // Tabulka přetečení (px) po oknech a velikostech
        const names = Object.keys(table);
        const width = Math.max(...names.map(name => name.length), 10);
        const lines = [`${'Okno'.padEnd(width)}  390×780  360×640  `, ...names.map(name => `${name.padEnd(width)}  ${String(table[name]['390×780'] ?? '–').padStart(7)}  ${String(table[name]['360×640'] ?? '–').padStart(7)}  ${EXEMPT[name] ? `výjimka${EXEMPT[name].size ? ` (${EXEMPT[name].size})` : ''}: ${EXEMPT[name].reason}` : ''}`)];
        console.log(`\n${lines.join('\n')}\n`);
    });

    // Otevře okno přes delegaci akcí aplikace (stejné jako klepnutí na tlačítko s data-action v obsahu)
    const action = (tab, name, data = {}) => tab.evaluate(([name, data]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = name;
        Object.assign(button.dataset, data);
        button.className = 'hidden';
        document.getElementById('app-content').appendChild(button);
        button.click();
        button.remove();
    }, [name, data]);
    const closeAll = async (tab) => {
        for (let i = 0; i < 6; i++) {
            const open = await tab.evaluate((ids) => ids.some(id => document.getElementById(id)), OVERLAYS);
            if (!open) return;
            await tab.keyboard.press('Escape');
            await tab.waitForTimeout(60);
        }
        await tab.evaluate((ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.remove(); }), OVERLAYS);
    };
    const waitTitle = (tab, title) => tab.waitForFunction(expected => { const overlay = document.getElementById('dialog-overlay'); return overlay && overlay.dataset.title === expected; }, title, { timeout: 15000 });
    const settle = async (tab) => {
        await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); document.querySelectorAll('#toast').forEach(el => el.remove()); });
        await tab.waitForTimeout(250);
    };
    const record = async (tab, name, size, { screen = false } = {}) => {
        await settle(tab);
        const found = await tab.evaluate(measure, screen);
        const key = `${size.width}×${size.height}`;
        table[name] = table[name] || {};
        if (!found) { table[name][key] = 'chybí'; errors.push(`${name} ${key}: okno se neotevřelo`); return; }
        table[name][key] = found.overflow;
        table[name].detail = { ...(table[name].detail || {}), [key]: found };
        const rule = exempt(name, key);
        if (rule && found.overflow > 0) {
            const hidden = await tab.evaluate(async ([screen, keep]) => {
                const overlay = screen ? null : ['dialog-overlay', 'settings-overlay', 'play-chooser', 'place-info'].map(id => document.getElementById(id)).find(Boolean);
                const panel = screen ? document.getElementById('app-content') : overlay.firstElementChild;
                panel.scrollTop = Math.round((panel.scrollHeight - panel.clientHeight) / 2);
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                const box = panel.getBoundingClientRect();
                const seen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); };
                const out = [];
                const head = overlay && overlay.id === 'dialog-overlay' ? overlay.querySelector('[data-dialog-head]') : null;
                if (overlay && overlay.id === 'dialog-overlay' && !seen(head)) out.push('nadpis okna');
                if (keep && !seen(document.querySelector(keep))) out.push(keep);
                return out;
            }, [screen, rule.keep || '']);
            if (hidden.length) errors.push(`${name} ${key}: po posunutí není vidět ${hidden.join(', ')}`);
            if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${size.width}-posunuto.png`) });
        }
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${size.width}.png`) });
    };
    // Jedno okno: otevře, změří, zavře (chyba jednoho okna nezastaví ostatní, nahlásí se na konci)
    // FIT_ONLY=regulární výraz projde jen odpovídající okna (rychlé ladění jednoho okna)
    const only = process.env.FIT_ONLY ? new RegExp(process.env.FIT_ONLY, 'i') : null;
    const scene = async (tab, name, size, open, options = {}) => {
        if (only && !only.test(name)) return;
        try {
            await open();
            await record(tab, name, size, options);
        } catch (error) {
            const key = `${size.width}×${size.height}`;
            table[name] = { ...(table[name] || {}), [key]: 'chyba' };
            errors.push(`${name} ${key}: ${error.message.split('\n')[0]}`);
        }
        if (!options.keep) await closeAll(tab);
    };

    for (const size of SIZES) {
        await t.test(`okna přihlášeného hráče s plnými daty (${size.width}×${size.height})`, async () => {
            const { context, tab, log } = await setup(browser, { viewport: size });
            await tab.waitForSelector('#friends-strip [data-player-id]', { timeout: 20000 });
            await tab.waitForTimeout(800);
            await closeAll(tab);
            // Profil hráče: přítel (bilance, aktivita, poslední reakce) a hráč, kterému jsem poslala žádost
            await scene(tab, 'Profil hráče (přítel)', size, async () => {
                await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.waitForFunction(() => document.getElementById('player-league') && document.querySelector('#dialog-overlay [aria-label="Odznaky"]') && /Poslední reakce/.test(document.getElementById('dialog-overlay').textContent) && document.querySelectorAll('#dialog-overlay [data-showcase-item]').length === 3);
            });
            await scene(tab, 'Profil hráče (žádost odeslána)', size, async () => {
                await action(tab, 'challenge-open', { code: 'VWX234' });
                await tab.waitForSelector(`#dialog-overlay [data-player-id="${TOMAS}"]`);
                await tab.click(`#dialog-overlay [data-player-id="${TOMAS}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.waitForFunction(() => document.querySelector('[data-friend="cancel"]') && document.getElementById('player-league') && /Poslední reakce/.test(document.getElementById('dialog-overlay').textContent));
            });
            await scene(tab, 'Profil hráče – menu ⋯', size, async () => {
                await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.waitForFunction(() => document.getElementById('player-league'));
                await tab.click('[data-more]');
                await tab.waitForSelector('[data-report]');
            });
            await scene(tab, 'Nahlásit hráče', size, async () => {
                await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-more]');
                await tab.click('[data-more]');
                await tab.click('[data-report]');
                await tab.waitForSelector('#report-form');
                await tab.click('[data-reason]');
            });
            await scene(tab, 'Zablokovat hráče', size, async () => {
                await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.click('[data-more]');
                await tab.click('[data-block="on"]');
                await tab.waitForSelector('[data-block-confirm]');
            });
            // Nastavení: tři záložky (Hra, Profil = jak mě vidí ostatní, Mudrlant) a jejich stavy (skupiny obrázků, barva části postavičky,
            // posuvník všech barev, doplněk s barvou); na obou velikostech bez posouvání (SETTINGS_STRICT)
            const settingsTab = async (id) => {
                await tab.click('#btn-settings');
                await tab.waitForSelector('#settings-overlay');
                await tab.click(`[data-me-tab="${id}"]`);
                await tab.waitForSelector(`[data-me-tab="${id}"][aria-selected="true"]`);
            };
            const settled = () => tab.waitForFunction(() => [...document.querySelectorAll('#settings-overlay img')].every(img => img.complete));
            for (const [id, title] of [['game', 'Hra'], ['profile', 'Profil'], ['owl', 'Mudrlant']]) {
                await scene(tab, `Nastavení – ${title}`, size, async () => { await settingsTab(id); await settled(); await tab.waitForTimeout(300); });
            }
            await scene(tab, 'Nastavení – Profil (Mudrlant)', size, async () => { await settingsTab('profile'); await tab.click('[data-pic-group="mudrlant"]'); await tab.waitForSelector('[data-pick-owl="titul-1"]'); await settled(); });
            await scene(tab, 'Nastavení – Profil (Postavičky, barva části)', size, async () => {
                await settingsTab('profile');
                await tab.click('[data-pic-group="postavicky"]');
                await tab.click('[data-pick-avatar="mamut"]');
                await tab.click('[data-color-target="2"]');
                await tab.click('[data-pick-part="2:5"]');
                await tab.waitForSelector('[data-pick-part="2:5"][aria-pressed="true"]');
                await settled();
            });
            await scene(tab, 'Nastavení – Profil (všechny barvy)', size, async () => { await settingsTab('profile'); await tab.click('[data-pick-hue-open]'); await tab.waitForSelector('[data-pick-hue]'); await settled(); });
            await scene(tab, 'Nastavení – Mudrlant (doplněk s barvou)', size, async () => {
                await settingsTab('owl');
                await tab.click('[data-owl-slot="neck"]');
                await tab.click('[data-owl-pick="neck:sala"]');
                await tab.waitForSelector('[data-owl-color="neck:modra"]');
                await settled();
            });
            await scene(tab, 'Zablokovaní hráči', size, async () => {
                await tab.click('#btn-settings');
                await tab.click('[data-me-tab="game"]');
                await tab.click('[data-open-blocked]');
                await tab.waitForSelector('#blocked-list');
            });
            await scene(tab, 'Moje data', size, async () => {
                await tab.click('#btn-settings');
                await tab.click('[data-me-tab="game"]');
                await tab.click('[data-open-privacy]');
                await tab.waitForSelector('#dialog-overlay [data-delete-account]');
            });
            await scene(tab, 'Moje data – potvrzení smazání', size, async () => {
                await tab.click('#btn-settings');
                await tab.click('[data-me-tab="game"]');
                await tab.click('[data-open-privacy]');
                await tab.click('#dialog-overlay [data-delete-account]');
                await tab.waitForSelector('[data-delete-cancel]');
            });
            await scene(tab, 'Přijímané výzvy', size, async () => {
                await action(tab, 'open-accept');
                await waitTitle(tab, 'Přijímané výzvy');
                await tab.waitForTimeout(400);
            });
            await scene(tab, 'Jak povolit upozornění', size, async () => {
                await tab.click('#btn-settings');
                await tab.click('[data-me-tab="game"]');
                await tab.waitForSelector('[data-push-toggle="on"]');
                await tab.click('[data-push-toggle="on"]');
                await tab.waitForSelector('#push-help');
            });
            // Můj postup a okna z něj
            const progress = async () => { await tab.click('#btn-settings'); await tab.click('[data-open-progress]'); await tab.waitForSelector('[data-progress-dialog]'); };
            await scene(tab, 'Můj postup', size, progress);
            await scene(tab, 'Úrovně a tituly', size, async () => { await progress(); await tab.click('[data-open-levels]'); await waitTitle(tab, 'Úrovně a tituly'); });
            await scene(tab, 'Všechny odznaky', size, async () => { await progress(); await tab.click('[data-open-badges]'); await waitTitle(tab, 'Odznaky'); });
            await scene(tab, 'Mistrovství tématu', size, async () => { await progress(); await tab.click('[data-mastery="zemepis"]'); await tab.waitForFunction(() => /^Mistrovství/.test(document.getElementById('dialog-overlay').dataset.title)); });
            await scene(tab, 'Diplomy', size, async () => { await progress(); await tab.click('[data-rewards-info="diplomas"]'); await tab.waitForSelector('[data-diplomas]'); });
            await scene(tab, 'Diplom', size, async () => { await progress(); await tab.click('[data-rewards-info="diplomas"]'); await tab.click('[data-diploma="zemepis"]'); await tab.waitForSelector('[data-diploma-preview] canvas'); });
            await scene(tab, 'Diplom (zamčený)', size, async () => { await progress(); await tab.click('[data-rewards-info="diplomas"]'); await tab.click('[data-diploma="historie"]'); await tab.waitForSelector('[data-diploma-locked]'); });
            await scene(tab, 'Ochrana série', size, async () => { await progress(); await tab.click('[data-rewards-info="freeze"]'); await tab.waitForSelector('[data-freeze-help]'); });
            // Album sbírky (album.js): sekce s nejvíc věcmi (doplňky), Odznaky (posouvají se), podrobnosti postavičky (s Nasadit) a odměny alba
            const album = async (section) => { await progress(); await tab.click('[data-rewards-info="album"]'); await tab.waitForSelector('[data-album]'); await tab.click(`[data-album-tab="${section}"]`); await tab.waitForSelector(`[data-album-section="${section}"]`); };
            await scene(tab, 'Album sbírky', size, () => album('accessories'));
            await scene(tab, 'Album – Odznaky', size, () => album('badges'));
            await scene(tab, 'Album – podrobnosti', size, async () => { await album('avatars'); await tab.click('[data-album-item][data-state="owned"]'); await tab.waitForSelector('[data-album-detail] [data-album-wear]'); });
            await scene(tab, 'Album – odměny', size, async () => { await album('avatars'); await tab.click('[data-album-rewards]'); await tab.waitForSelector('[data-album-rewards-list]'); });
            await scene(tab, 'Cíle týdne', size, async () => { await action(tab, 'goals-open'); await waitTitle(tab, 'Cíle týdne'); });
            await scene(tab, 'Truhla Mudrlanta', size, async () => { await action(tab, 'chest-open'); await tab.waitForSelector('#chest-overlay button'); });
            // Co hrát (výběr témat mixu a jednoho tématu)
            await scene(tab, 'Co hrát – mix', size, async () => { await action(tab, 'play-mix'); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
            await scene(tab, 'Co hrát – téma', size, async () => { await action(tab, 'home-tab', { tab: 'single' }); await tab.waitForSelector('[data-action="play-topic"]'); await tab.click('[data-action="play-topic"][data-topic="zemepis"]'); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
            await action(tab, 'home-tab', { tab: 'multi' });
            // Výzvy
            await scene(tab, 'Nová výzva', size, async () => { await action(tab, 'new-challenge'); await waitTitle(tab, 'Nová výzva'); await tab.waitForTimeout(300); });
            await scene(tab, 'Zadat kód', size, async () => { await action(tab, 'join-challenge'); await waitTitle(tab, 'Zadat kód výzvy'); });
            await scene(tab, 'Výzva – detail (dohraná)', size, async () => { await action(tab, 'challenge-open', { code: 'ABC234' }); await tab.waitForSelector(`#dialog-overlay [data-player-id="${PETR}"]`); await tab.waitForTimeout(300); });
            await scene(tab, 'Výzva – detail (čeká na mě)', size, async () => { await action(tab, 'challenge-open', { code: 'HJK567' }); await tab.waitForSelector('[data-ch-play]'); });
            await scene(tab, 'Rozpis otázek výzvy', size, async () => {
                await action(tab, 'challenge-open', { code: 'ABC234' });
                await tab.waitForSelector('#dialog-overlay [data-ch-breakdown], #dialog-overlay [data-action="challenge-breakdown"], #dialog-overlay [data-breakdown]', { timeout: 15000 });
                await tab.click('#dialog-overlay [data-ch-breakdown], #dialog-overlay [data-action="challenge-breakdown"], #dialog-overlay [data-breakdown]');
                await waitTitle(tab, 'Rozpis otázek');
                await tab.waitForSelector('#dialog-overlay table, #dialog-overlay [data-breakdown-row], #dialog-overlay ol', { timeout: 15000 });
            });
            await scene(tab, 'Týdenní žebříček', size, async () => { await action(tab, 'weekly-board'); await waitTitle(tab, 'Týdenní žebříček'); await tab.waitForFunction(() => !/Načítám/.test(document.getElementById('dialog-overlay').textContent)); });
            await scene(tab, 'Jak fungují ligy', size, async () => { await action(tab, 'league-help'); await waitTitle(tab, 'Jak fungují ligy'); });
            // Ligové sezóny a vitrína (schéma 18)
            await scene(tab, 'Ligové sezóny', size, async () => { await action(tab, 'league-seasons'); await tab.waitForSelector('[data-league-seasons]'); await tab.waitForSelector('[data-season-month="2026-07"]:not([disabled])'); });
            await scene(tab, 'Ligové sezóny (vybraná sezóna)', size, async () => {
                await action(tab, 'league-seasons');
                await tab.waitForSelector('[data-season-month="2026-07"]:not([disabled])');
                await tab.click('[data-season-month="2026-07"]');
                await tab.waitForSelector('[data-season-detail="2026-07"] [data-showcase-toggle]');
            });
            await scene(tab, 'Vitrína', size, async () => {
                await tab.click('#btn-settings');
                await tab.click('[data-me-tab="profile"]');
                await tab.click('#settings-overlay [data-open-showcase]');
                await tab.waitForSelector('[data-showcase-dialog] [data-showcase-item]');
            });
            // Skupiny
            await scene(tab, 'Skupiny – seznam', size, async () => { await action(tab, 'groups-open'); await waitTitle(tab, 'Skupiny'); await tab.waitForSelector('[data-group-open]'); });
            await scene(tab, 'Skupiny – detail', size, async () => { await action(tab, 'groups-open'); await tab.waitForSelector('[data-group-open]'); await tab.click('[data-group-open]'); await tab.waitForSelector('[data-group-manage]'); await tab.waitForTimeout(300); });
            await scene(tab, 'Skupiny – detail (Týden)', size, async () => {
                await action(tab, 'groups-open'); await tab.waitForSelector('[data-group-open]'); await tab.click('[data-group-open]'); await tab.waitForSelector('[data-group-manage]');
                const week = await tab.$('[data-group-tab="week"]'); if (week) await week.click(); await tab.waitForTimeout(300);
            });
            await scene(tab, 'Skupiny – správa', size, async () => { await action(tab, 'groups-open'); await tab.waitForSelector('[data-group-open]'); await tab.click('[data-group-open]'); await tab.click('[data-group-manage]'); await tab.waitForSelector('#dialog-overlay form, #dialog-overlay input'); });
            await scene(tab, 'Skupiny – nová', size, async () => { await action(tab, 'groups-open'); await tab.waitForSelector('[data-group-new]'); await tab.click('[data-group-new]'); await waitTitle(tab, 'Nová skupina'); });
            await scene(tab, 'Skupiny – přidat kódem', size, async () => { await action(tab, 'groups-open'); await tab.waitForSelector('[data-group-code]'); await tab.click('[data-group-code]'); await tab.waitForSelector('#dialog-overlay input'); await tab.fill('#dialog-overlay input', 'SACH23'); await tab.waitForTimeout(800); });
            // Turnaj
            await scene(tab, 'Turnaj (přihlášky)', size, async () => { await action(tab, 'tournament-open', { tid: uid(900) }); await tab.waitForSelector('#tournament-entries', { state: 'attached' }); });
            await scene(tab, 'Turnaj (běží)', size, async () => { await action(tab, 'tournament-open', { tid: uid(901) }); await tab.waitForSelector('#tournament-status'); await tab.waitForTimeout(300); });
            await scene(tab, 'Jak turnaje fungují', size, async () => { await action(tab, 'tournament-help'); await waitTitle(tab, 'Jak turnaje fungují'); });
            // Popis místa (okno s článkem) a nahlášení chyby v otázce
            await scene(tab, 'Popis místa', size, async () => { await action(tab, 'item-info', { topic: 'zemepis', id: 'Q213' }); await tab.waitForSelector('#place-info'); await tab.waitForTimeout(800); });
            await scene(tab, 'Nahlásit chybu', size, async () => {
                await action(tab, 'home-tab', { tab: 'single' });
                await tab.waitForSelector('[data-action="daily"]');
                await tab.click('[data-action="daily"]');
                await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
                await action(tab, 'report-question');
                await waitTitle(tab, 'Nahlásit chybu v otázce');
                await tab.click('#dialog-overlay [data-reason]');
            });
            await action(tab, 'daily-home');
            await action(tab, 'home-tab', { tab: 'multi' });
            // Kvíz dne – výsledek (dohráno), obrazovka
            await scene(tab, 'Kvíz dne – výsledek', size, async () => { await action(tab, 'quiz-open'); await tab.waitForSelector('[data-action="quiz-share"]', { timeout: 20000 }); await tab.waitForTimeout(800); }, { screen: true });
            assert.deepEqual(log.csp, []);
            await context.close();
        });

        await t.test(`Kvíz dne – úvod, tip, pozvánka do turnaje a přezdívka (${size.width}×${size.height})`, async () => {
            const db = newDb({ quizDone: false });
            db.entries = db.entries.filter(e => !(e.tournament_id === uid(900) && e.user_id === ME));
            const { context, tab } = await setup(browser, { viewport: size, db, storage: { 'mudrlant.nickPending': JSON.stringify(Date.parse(NOW)), 'mudrlant.tips': JSON.stringify({}) } });
            await scene(tab, 'Přezdívka', size, async () => { await tab.waitForSelector('#nick-input', { timeout: 20000 }); });
            await scene(tab, 'Kvíz dne – úvod', size, async () => { await action(tab, 'quiz-open'); await tab.waitForSelector('[data-action="quiz-start"]', { timeout: 20000 }); }, { screen: true });
            await action(tab, 'quiz-home');
            await tab.waitForSelector('#home-tabs');
            await scene(tab, 'Pozvánka do turnaje', size, async () => {
                await tab.waitForFunction(() => { const el = document.getElementById('fact-hint'); return el && !el.classList.contains('hidden'); }, null, { timeout: 15000 });
                if (!(await tab.$('#tournament-offer'))) await tab.click('#fact-hint');
                await tab.waitForSelector('#tournament-offer');
            });
            await scene(tab, 'Tip od Mudrlanta', size, async () => {
                await tab.waitForFunction(() => { const el = document.getElementById('fact-hint'); return el && !el.classList.contains('hidden'); }, null, { timeout: 15000 });
                await tab.click('#fact-hint');
                await tab.waitForSelector('#tip-dialog');
            });
            await context.close();
        });

        // Bez účtu: Nastavení má jen Hru (s přihlášením místo účtu) a Mudrlanta
        await t.test(`Nastavení bez účtu (${size.width}×${size.height})`, async () => {
            const { context, tab, log } = await setup(browser, { viewport: size, signedOut: true });
            const open = async (id) => {
                await tab.click('#btn-settings');
                await tab.waitForSelector('#settings-overlay');
                await tab.click(`[data-me-tab="${id}"]`);
                await tab.waitForSelector(`[data-me-tab="${id}"][aria-selected="true"]`);
                await tab.waitForFunction(() => [...document.querySelectorAll('#settings-overlay img')].every(img => img.complete));
            };
            await scene(tab, 'Nastavení bez účtu – Hra', size, async () => {
                await open('game');
                assert.deepEqual(await tab.$$eval('[data-me-tab]', nodes => nodes.map(node => node.dataset.meTab)), ['game', 'owl']);
            });
            await scene(tab, 'Nastavení bez účtu – Mudrlant', size, () => open('owl'));
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    await t.test('výsledek: přetečení po oknech', () => {
        assert.deepEqual(errors, [], 'všechna okna se otevřela');
        const over = [];
        for (const [name, row] of Object.entries(table)) {
            const big = row['390×780'];
            const small = row['360×640'];
            const tolerance = SETTINGS_STRICT.test(name) ? 0 : SMALL_TOLERANCE;
            if (!exempt(name, '390×780') && typeof big === 'number' && big > 0) over.push(`${name} 390×780: ${big} px`);
            if (!exempt(name, '360×640') && typeof small === 'number' && small > tolerance) over.push(`${name} 360×640: ${small} px`);
        }
        assert.deepEqual(over, [], 'okna bez posouvání');
        // Přepracovaný profil hráče a nahlášení: všechna tlačítka aspoň 40 px
        const tiny = Object.entries(table).filter(([name]) => /^(Profil hráče|Nahlásit hráče|Zablokovat hráče)/.test(name))
            .flatMap(([name, row]) => Object.entries(row.detail || {}).flatMap(([key, found]) => found.small.map(item => `${name} ${key}: ${item}`)));
        assert.deepEqual(tiny, [], 'dotykové plochy v profilu hráče aspoň 40 px');
    });
});
