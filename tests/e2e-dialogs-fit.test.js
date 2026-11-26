// Okna se vejdou bez posouvání: projde všechna okna aplikace, která jdou otevřít (profil hráče, Nastavení, záložka Postup, Co hrát, výzvy,
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
const nav = require('./nav.js');
const DQ = require('../daily-quiz.js');
const Stats = require('../statistiky.js');

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
// Záložky Nastavení (a jejich stavy) a karty Kroniky týdne se musí vejít bez posouvání na obou velikostech, bez rezervy
const SETTINGS_STRICT = /^(Nastavení|Kronika týdne)/;
// FIT_SCHEME=dark projde okna v tmavém režimu (snímky pro kontrolu vzhledu)
const SCHEME = process.env.FIT_SCHEME === 'dark' ? 'dark' : 'light';

// Dlouhé seznamy, které se posouvat smí: reason = proč, size = jen na této velikosti (jinak na obou), keep = hlavní akce, která při posouvání
// zůstane vidět (lepkavě). Lepkavý nadpis okna se zavíráním (data-dialog-head) se hlídá u všech výjimek v #dialog-overlay.
const EXEMPT = {
    // Ze záložky Postup se otevírají bez rodičovského okna: zavírá je lepkavý nadpis s křížkem (hlídá se u všech výjimek)
    'Všechny odznaky': { reason: 'seznam všech odznaků (stovky medailí po skupinách)' },
    'Úrovně a tituly': { reason: 'seznam všech úrovní s tituly' },
    'Rozpis otázek výzvy': { reason: 'seznam všech otázek s odpověďmi obou hráčů (záhlaví sloupců lepkavě)' },
    'Týdenní žebříček': { reason: 'žebříček hráčů' },
    'Turnaj (běží)': { reason: 'pavouk a pořadí desítek hráčů', keep: '[data-t-play]' },
    'Popis místa': { reason: 'článek z Wikipedie (text libovolné délky)', keep: '#place-info [data-close]' },
    'Kvíz dne – výsledek': { reason: 'obrazovka s pořadím dne a přátel (žebříček)', keep: '[data-action="quiz-home"]' },
    'Přátelé': { reason: 'seznam všech přátel (posouvá se uvnitř okna)', size: '360×640' },
    'Skupiny – detail': { reason: 'pořadí všech členů skupiny (devět se na 390×780 vejde)', size: '360×640', keep: '[data-group-challenge-new]' },
    'Skupiny – detail (Týden)': { reason: 'týdenní pořadí všech členů skupiny', keep: '[data-group-challenge-new]' },
    'Skupiny – správa': { reason: 'seznam všech členů s odebráním' },
    // Statistiky pro nadšence (statistiky.js): samostatná obrazovka s tabulkami a grafy, posouvá se uvnitř okna pod lepkavým nadpisem
    'Statistiky pro nadšence': { reason: 'přehled čísel o hraní (souhrn, obtížnost, nápovědy, doba odpovědi)' },
    'Statistiky – Témata': { reason: 'tabulka všech témat s okruhy' },
    'Statistiky – Vývoj': { reason: 'kalendář hraní, graf a tabulka 12 týdnů' },
    'Statistiky – Záměny': { reason: 'seznam nejčastějších záměn (až 15 dvojic)' },
    'Statistiky – Rekordy': { reason: 'rekordy ze všech her' }
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
            // Obrázkové rámečky (look.js ART_FRAMES): já vzácnou Duhu s mráčky z truhly, Petr Strážného draka – okna se musí vejít i s nimi
            [ME]: player(1, 'Jana Nováková', '🦊', { color: 'emerald', frame: 'duha-mracky', xp: 26000, badges: BADGES.slice(0, 16), rating: 1380, rated_games: 40, rewards: null, showcase: ['l:2026-10:diamant', 'b:vyhry-50'] }),
            // Petr má jako obrázek sezónní postavičku (Hrnek čaje s fialovým hrnkem), kterou já nemám: v jeho profilu se ukáže stejně
            [PETR]: player(2, 'Petr Svoboda', 'caj7', { frame: 'drak', xp: 14200, badges: BADGES, rating: 1520, rated_games: 60, showcase: ['l:2026-10:mistr', 'b:dokonale-14', 'd:zemepis'] }),
            [EVA]: player(3, 'Eva Mistrová', '🦉', { color: 'violet', xp: 90000, badges: BADGES, rating: 1720, rated_games: 120 }),
            [uid(4)]: player(4, 'Lenka Dvořáková', '🐸', { xp: 3000, rating: 1150 }),
            // Tomáš má jako obrázek sovu v celém looku Trenér (sada Sport): v jeho profilu zlatý štítek „Celý look: Trenér“
            [TOMAS]: player(5, 'Tomáš Malý', '🐯', { owl: 'robe=modra;head=celenka.original;neck=pistalka.cervena;hand=pohar.original', xp: 9000, badges: BADGES.slice(4), rating: 1290, rated_games: 22 })
        },
        // Přátelství: Petr a Lenka přijatí, Tomášovi jsem poslala žádost, Eva čeká na mě
        friendships: [{ user_id: ME, friend_id: PETR, status: 'accepted' }, { user_id: uid(4), friend_id: ME, status: 'accepted' }, { user_id: ME, friend_id: TOMAS, status: 'pending' }, { user_id: EVA, friend_id: ME, status: 'pending' }],
        challenges: {}, results: [], progress: [], blocks: [uid(14), uid(15)], reactions: [],
        quiz: {}, groups: [], tournaments: [], entries: [], matches: [], tResults: [], notices: [],
        poll: { id: 7, closed: false, visible: true, mine: null, changes_left: 10, options: [{ id: 'hrady-zamky', title: 'Hrady a zámky', votes: 12 }, { id: 'opery', title: 'Opery', votes: 4 }, { id: 'olympijske-hry', title: 'Olympijské hry', votes: 9 }, { id: 'ceske-dejiny', title: 'České dějiny', votes: 7 }] },
        conquest: { open: [], mine: [] }
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
    // Dobývání: běžící hra na mapě Evropy se čtyřmi hráči, v tomto kole mi zbývají 4 tahy z 5
    const seat = (id, n, colour, emblem) => ({ ...db.profiles[id], seat: n, flag_color: colour, emblem, ready: true, score: 40 - 6 * n, score_at: null, place: null, me: id === ME });
    db.conquest.mine.push({ id: uid(700), map: 'evropa', max_players: 4, hours: 72, period: 'day', actions: 5, visibility: 'private', preset: null, status: 'running', created_at: '2026-11-09T08:00:00Z', started_at: '2026-11-10T08:00:00Z', ends_at: '2026-11-13T08:00:00Z',
        mine: true, creator: true, code: 'EVR234', players: [seat(ME, 0, 'cervena', 'lev'), seat(PETR, 1, 'modra', 'orel'), seat(EVA, 2, 'zelena', 'drak'), seat(TOMAS, 3, 'zluta', 'vez')], invited: null, claimed: false,
        budget: { period: 1, base: 5, regions: 0, treasures: 0, loot: 0, penalty: 0, extra: 0, used: 1, total: 5, left: 4, period_ends_at: '2026-11-12T08:00:00Z' }, owners: { Q213: 0, Q36: 1, Q183: 2, Q142: 3, Q40: 0, Q214: 0 } });
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
            // Hlasování o tématu speciálního turnaje (schéma 31) a Dobývání: moje běžící hra, ve které mám ještě tahy
            if (name === 'tournament_poll_state' || name === 'tournament_vote') {
                if (name === 'tournament_vote') db.poll.mine = body.theme;
                return json(db.poll.mine ? { ...db.poll, total: db.poll.options.reduce((sum, option) => sum + option.votes, 0) + 1 } : { ...db.poll, total: null, options: db.poll.options.map(({ id, title }) => ({ id, title })) });
            }
            if (name === 'conquest_lobby') return json(db.conquest);
            if (name === 'conquest_invites_mine') return json([]);
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
            // Kamarádské sázky (schéma 21): přehled s limitem, nabídka sázky u výzvy db.stakeOffer a sázková bilance Petra (profil hráče)
            if (name === 'challenge_stakes') return json({ limit: 50, week_xp: 120, open: 0, stats: { bets: 7, wins: 5, losses: 2, draws: 0, balance: 45, best: 3, streak: 1 }, rows: [] });
            if (name === 'challenge_settle_stake') return json(db.stakeOffer === body.code ? { id: body.code, stake: 25, state: 'offered', taunt: 1, role: 'opponent', other: EVA, done: false, other_done: true, fresh: false } : { id: body.code, stake: null, state: null, fresh: false });
            if (name === 'challenge_stake_stats') return json(body.player === PETR ? { bets: 6, wins: 4, losses: 2, draws: 0, balance: 30, best: 3, streak: 0 } : null);
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
    // + celá sada doplňků Zeměpis (zběhlost, 300 a 1000 správných): Mistrovství Zeměpisu ukáže tlačítko Obléknout celou sadu
    const badges = Object.fromEntries([...BADGES, 'sberatel-25', 'zbehly-zemepis', 'tema-zemepis-300', 'tema-zemepis-1000'].map((id, i) => [id, `2026-10-${String(1 + i).padStart(2, '0')}`]));
    const learned = { zemepis: Array.from({ length: 320 }, (_, i) => `Q${900000 + i}`), historie: Array.from({ length: 140 }, (_, i) => `Q${800000 + i}`), vlajky: Array.from({ length: 60 }, (_, i) => `Q${700000 + i}`), biologie: Array.from({ length: 40 }, (_, i) => `Q${600000 + i}`) };
    return {
        'mudrlant.progress': JSON.stringify({ xp: 26000, counters: { correct: 2600, answered: 3400, bestRun: 52, topicBest: { zemepis: 10, historie: 9 }, challengesPlayed: 120, challengeWins: 64 }, badges }),
        'mudrlant.learned': JSON.stringify(learned),
        // Celý look Cestovatel už oslavený (oblečení v okně Nastavení by jinak po zavření ukázalo oslavu přes další okna)
        'mudrlant.looks': JSON.stringify(['zemepis']),
        // Mudrlantova kronika: minulý týden (2.–8. 11.) se všemi pěti kartami a dlouhým názvem objevu týdne
        'mudrlant.week': JSON.stringify({ v: 1, days: {
            '2026-11-02': { a: 1240, c: 1004, p: 3100, xp: 12400, run: 48, h: [0, 900, 340, 0], t: { architektura: [700, 600], historie: [540, 404] }, n: 312, ex: ['Chrám Svaté rodiny (Sagrada Família) v Barceloně', 'architektura'], cw: 12, cl: 9, cp: 21, tw: 3 },
            '2026-11-05': { a: 30, c: 20, xp: 300, t: { hudba: [30, 20] }, q: 10 } } }),
        // Sezóna Mudrlanta: od 15 000 XP (11 000 XP sezóny = stupeň 14), pět stupňů vyzvednutých; oba rámečky, postavička a titul z minulé sezóny
        'mudrlant.rewards': JSON.stringify({ v: 1, freezes: 2, name: 'Jana Nováková', ready: ['2026-11-02'], chests: { '2026-10-26': 'xp' }, diplomas: { zemepis: '2026-10-20' },
            gifts: { frames: ['sezona-10', 'sezona-10-b', 'duha-mracky'], avatars: ['drakpa'], titles: ['sampion-sezony'] },
            season: { id: '2026-11', startXp: 15000, claimed: { 1: 'robes:fialova', 2: 'accessories:kvetina', 3: 'freeze', 4: 'themes:fialova', 5: 'colors:ruzova' } } }),
        // Zlatá otázka (gold.js): Zlatá truhla čeká (nejvyšší podoba okna Zlatá otázka i dlaždice v Mém postupu), minule dala rámeček
        'mudrlant.gold': JSON.stringify({ v: 1, total: 14, correct: 11, found: 10, shards: 0, ready: 1, chests: 1, intro: true, last: 'frames:ruze' }),
        // Statistiky pro nadšence: tři měsíce odpovědí ve čtyřech tématech s okruhy, doba odpovědi a dlouhé názvy v záměnách
        'mudrlant.statistiky': JSON.stringify(statsState())
    };
};
const statsState = () => {
    let state = Stats.parse(null);
    const plan = [['zemepis', ['stat', 'mesto', 'hora', 'reka', 'ostrov']], ['historie', ['panovnik', 'bitva']], ['architektura', ['stavba']], ['hudba', ['skladatele']]];
    for (let i = 90; i >= 0; i--) {
        if (i % 4 === 3) continue;
        const day = Stats.addDays(TODAY, -i);
        plan.forEach(([topic, cats], t) => cats.forEach((category, k) => {
            state = Stats.record(state, { topic, category, correct: (i + k + t) % 3 !== 0, hints: (i + k) % 5, known: k % 2 === 0, ms: 2500 + ((i * 7 + k) % 40) * 1000, mode: Stats.MODES[(i + t) % 4] }, day);
        }));
    }
    const long = [['Chrám Svaté rodiny (Sagrada Família)', 'Katedrála Notre-Dame v Paříži'], ['Svatá říše římská', 'Velkomoravská říše'], ['Lotyšsko', 'Litva']];
    long.forEach(([right, wrong], i) => { for (let k = 0; k <= i; k++) state = Stats.record(state, { topic: 'architektura', category: 'stavba', correct: false, right: { id: `Q${10 + i}`, label: right }, wrong: { id: `Q${20 + i}`, label: wrong } }, Stats.addDays(TODAY, -k)); });
    return state;
};

// start = záložka po načtení (výchozí Soupeři: většina oken se otevírá odtud; '' = nechat Dnes), now = čas aplikace, scale = hustota snímků
const setup = async (browser, { viewport, storage = {}, db = newDb(), query = '', signedOut = false, scheme = SCHEME, welcome = false, start = 'souperi', now = NOW, scale = SHOTS ? 2 : 1 } = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: scheme, viewport, reducedMotion: 'reduce', deviceScaleFactor: scale });
    await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
    await context.addInitScript(pushStub);
    await context.addInitScript(entries => {
        if (sessionStorage.getItem('test-storage-set')) return;
        sessionStorage.setItem('test-storage-set', '1');
        Object.entries(entries).forEach(([key, value]) => (key.startsWith('session:') ? sessionStorage.setItem(key.slice(8), value) : localStorage.setItem(key, value)));
    }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', ...(welcome ? {} : { 'mudrlant.account': JSON.stringify('host') }), ...(signedOut ? {} : login), ...richStorage(), ...storage });
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
    await tab.clock.setFixedTime(new Date(now));
    await tab.goto(`${ORIGIN}/${query}`);
    // welcome = uvítání (ještě bez volby účtu): místo úvodu čeká na obrazovku s přihlášením
    await tab.waitForFunction((welcome) => { const content = document.getElementById('app-content'); return Boolean(content && content.querySelector(welcome ? '#account-welcome' : ':scope > [data-tab-root]')); }, welcome, { timeout: 30000 });
    if (!welcome && !signedOut && start) await nav.go(tab, start);
    return { context, tab, log, db };
};

const OVERLAYS = ['dialog-overlay', 'settings-overlay', 'play-chooser', 'place-info', 'chest-overlay', 'season-overlay'];
// Přetečení posuvného panelu otevřeného okna (u obrazovky v #app-content jejího obsahu); vrátí i rozměry panelu a jeho hlavní akce
const measure = (screen) => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    const overlay = screen ? null : ['dialog-overlay', 'settings-overlay', 'play-chooser', 'place-info', 'chest-overlay', 'season-overlay'].map(id => document.getElementById(id)).find(Boolean);
    // Odměna sezóny: posouvá se celé okno (karta je ukotvená shora jako truhla)
    const panel = screen ? document.getElementById('app-content') : overlay && (overlay.id === 'chest-overlay' ? overlay.querySelector('[data-chest]') || overlay.firstElementChild : overlay.id === 'season-overlay' ? overlay : overlay.firstElementChild);
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
        // Oslava (bublina nad spodní lištou po načtení) zakrývá spodek obsahu; nečeká se, až zmizí sama
        await tab.evaluate(() => document.querySelectorAll('#celebration, #celebration-mini').forEach(el => el.remove()));
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
            const { context, tab, log, db } = await setup(browser, { viewport: size });
            await tab.waitForSelector('#friends-strip [data-player-id]', { timeout: 20000 });
            await tab.waitForTimeout(800);
            await closeAll(tab);
            // Profil hráče: přítel (bilance, aktivita, poslední reakce) a hráč, kterému jsem poslala žádost
            await scene(tab, 'Profil hráče (přítel)', size, async () => {
                await nav.go(tab, 'souperi'); await closeAll(tab); await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.waitForFunction(() => document.getElementById('player-league') && document.querySelector('#dialog-overlay [aria-label="Odznaky"]') && /Poslední reakce/.test(document.getElementById('dialog-overlay').textContent) && document.querySelectorAll('#dialog-overlay [data-showcase-item]').length === 3);
                await tab.waitForSelector('#dialog-overlay [data-avatar-art="caj"] img[src="icons/avatars/caj-17.webp"]');
                // Kamarádské sázky: sázková bilance hráče v kartě statistik
                await tab.waitForSelector('#dialog-overlay [data-bet-balance]');
            });
            await scene(tab, 'Profil hráče (žádost odeslána)', size, async () => {
                await action(tab, 'challenge-open', { code: 'VWX234' });
                await tab.waitForSelector(`#dialog-overlay [data-player-id="${TOMAS}"]`);
                await tab.click(`#dialog-overlay [data-player-id="${TOMAS}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.waitForFunction(() => document.querySelector('[data-friend="cancel"]') && document.getElementById('player-league') && /Poslední reakce/.test(document.getElementById('dialog-overlay').textContent));
                assert.equal((await tab.textContent('#dialog-overlay [data-profile-head] [data-owl-look="sport"]')).trim(), 'Celý look: Trenér');
            });
            await scene(tab, 'Profil hráče – menu ⋯', size, async () => {
                await nav.go(tab, 'souperi'); await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.waitForFunction(() => document.getElementById('player-league'));
                await tab.click('[data-more]');
                await tab.waitForSelector('[data-report]');
            });
            await scene(tab, 'Nahlásit hráče', size, async () => {
                await nav.go(tab, 'souperi'); await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-more]');
                await tab.click('[data-more]');
                await tab.click('[data-report]');
                await tab.waitForSelector('#report-form');
                await tab.click('[data-reason]');
            });
            await scene(tab, 'Zablokovat hráče', size, async () => {
                await nav.go(tab, 'souperi'); await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                await tab.waitForSelector('[data-rematch]');
                await tab.click('[data-more]');
                await tab.click('[data-block="on"]');
                await tab.waitForSelector('[data-block-confirm]');
            });
            // Nastavení: tři záložky (Hra, Profil = jak mě vidí ostatní, Mudrlant) a jejich stavy (skupiny obrázků, barva části postavičky,
            // posuvník všech barev, doplněk s barvou); na obou velikostech bez posouvání (SETTINGS_STRICT)
            const settingsTab = async (id) => {
                await nav.settingsFromJa(tab, id);
                await tab.click(`[data-me-tab="${id}"]`);
                await tab.waitForSelector(`[data-me-tab="${id}"][aria-selected="true"]`);
            };
            const settled = () => tab.waitForFunction(() => [...document.querySelectorAll('#settings-overlay img')].every(img => img.complete));
            for (const [id, title] of [['game', 'Hra'], ['profile', 'Profil'], ['owl', 'Mudrlant']]) {
                await scene(tab, `Nastavení – ${title}`, size, async () => { await settingsTab(id); await settled(); await tab.waitForTimeout(300); });
            }
            // Obrázkový rámeček z účtu je kolem obrázku v hlavičce Nastavení i v řadě rámečků (ta se posouvá do strany, okno ne)
            await settingsTab('profile');
            assert.equal(await tab.locator('#settings-overlay [data-frame="duha-mracky"][aria-pressed="true"] .frame-art').count(), 1, 'vybraná Duha s mráčky');
            assert.ok(await tab.locator('#settings-overlay .frame-art.frame-duha-mracky').count() >= 2, 'i v hlavičce okna');
            await closeAll(tab);
            await scene(tab, 'Nastavení – Profil (Mudrlant)', size, async () => { await settingsTab('profile'); await tab.click('[data-pic-group="mudrlant"]'); await tab.waitForSelector('[data-pick-owl="titul-1"]'); await settled(); });
            await scene(tab, 'Nastavení – Profil (Postavičky, barva části)', size, async () => {
                await settingsTab('profile');
                await tab.click('[data-pic-group="postavicky"]');
                // Sezónní postavička ze Sezónní truhly je mezi ostatními (vlastněná k výběru); postavička probíhající sezóny (listopad: Hrnek
                // čaje) je šedá zamčená s cestou k ní (blok 32), jiné nevlastněné sezónní postavičky se neukážou
                await tab.waitForSelector('[data-pick-avatar="drakpa"]');
                assert.equal(await tab.locator('[data-pick-avatar="caj"]').count(), 0);
                assert.equal(await tab.locator('[data-locked-avatar="caj"]').count(), 1);
                assert.equal(await tab.locator('[data-pick-avatar="pernik"], [data-locked-avatar="pernik"]').count(), 0);
                await tab.click('[data-pick-avatar="mamut"]');
                await tab.click('[data-color-target="2"]');
                await tab.click('[data-pick-part="2:5"]');
                await tab.waitForSelector('[data-pick-part="2:5"][aria-pressed="true"]');
                await settled();
            });
            // Legendární postavičky za diplomy (14 dlaždic a věta o diplomu); Jana má diplom Zeměpisu, Albatros mořeplavec je odemčený
            await scene(tab, 'Nastavení – Profil (Legendy)', size, async () => {
                await settingsTab('profile');
                await tab.click('[data-pic-group="legendy"]');
                await tab.click('[data-pick-avatar="albatr"]');
                await tab.waitForSelector('[data-pick-avatar="albatr"][aria-pressed="true"]');
                await tab.click('[data-color-target="1"]');
                await tab.waitForSelector('[data-pick-part="1:0"]');
                await settled();
            });
            // Roboti z Dobývání: zamčení s postupem (0/3), vybraný robot z daru
            await scene(tab, 'Nastavení – Profil (Roboti)', size, async () => {
                await settingsTab('profile');
                await tab.click('[data-pic-group="roboti"]');
                await tab.waitForSelector('[data-locked-avatar="rkudla"]');
                assert.match(await tab.textContent('[data-locked-avatar="rkudla"]'), /0\/3/);
                await settled();
            });
            await scene(tab, 'Nastavení – Profil (všechny barvy)', size, async () => { await settingsTab('profile'); await tab.click('[data-pick-hue-open]'); await tab.waitForSelector('[data-pick-hue]'); await settled(); });
            // Celý look (Cestovatel): zlatý štítek pod sovou, otevřená ruka s paletou barev globusu
            await scene(tab, 'Nastavení – Mudrlant (celý look)', size, async () => {
                await settingsTab('owl');
                for (const pick of ['neck:kompas', 'head:cestovatelsky-klobouk', 'hand:globus']) {
                    await tab.click(`[data-owl-slot="${pick.split(':')[0]}"]`);
                    await tab.click(`[data-owl-pick="${pick}"]`);
                    await tab.waitForSelector(`[data-owl-pick="${pick}"][aria-pressed="true"]`);
                }
                await tab.waitForSelector('[data-owl-look-line] [data-owl-look="zemepis"]');
                await tab.waitForSelector('[data-owl-color="hand:modra"]');
                await settled();
            });
            await scene(tab, 'Nastavení – Mudrlant (doplněk s barvou)', size, async () => {
                await settingsTab('owl');
                await tab.click('[data-owl-slot="neck"]');
                await tab.click('[data-owl-pick="neck:sala"]');
                await tab.waitForSelector('[data-owl-color="neck:modra"]');
                await settled();
            });
            await scene(tab, 'Zablokovaní hráči', size, async () => {
                await nav.settingsFromJa(tab);
                await tab.click('[data-me-tab="game"]');
                await tab.click('[data-open-blocked]');
                await tab.waitForSelector('#blocked-list');
            });
            await scene(tab, 'Moje data', size, async () => {
                await nav.settingsFromJa(tab);
                await tab.click('[data-me-tab="game"]');
                await tab.click('[data-open-privacy]');
                await tab.waitForSelector('#dialog-overlay [data-delete-account]');
            });
            await scene(tab, 'Moje data – potvrzení smazání', size, async () => {
                await nav.settingsFromJa(tab);
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
                await nav.settingsFromJa(tab);
                await tab.click('[data-me-tab="game"]');
                await tab.waitForSelector('[data-push-toggle="on"]');
                await tab.click('[data-push-toggle="on"]');
                await tab.waitForSelector('#push-help');
            });
            // Záložka Postup (dřív okno Můj postup) a okna z ní
            const progress = async () => { await nav.go(tab, 'postup'); await tab.waitForSelector('#tab-postup [data-open-levels]'); };
            await scene(tab, 'Záložka Postup', size, progress, { screen: true });
            await scene(tab, 'Mistrovství témat', size, async () => { await progress(); await tab.click('[data-open-mastery-all]'); await tab.waitForSelector('[data-mastery-dialog]'); });
            await scene(tab, 'Úrovně a tituly', size, async () => { await progress(); await tab.click('[data-open-levels]'); await waitTitle(tab, 'Úrovně a tituly'); });
            await scene(tab, 'Všechny odznaky', size, async () => { await progress(); await tab.click('[data-open-badges]'); await waitTitle(tab, 'Odznaky'); });
            // Mistrovství Zeměpisu: celá sada doplňků s tlačítkem Obléknout celou sadu (nejvyšší podoba okna)
            await scene(tab, 'Mistrovství tématu', size, async () => { await progress(); await tab.click('[data-open-mastery-all]'); await tab.click('[data-mastery="zemepis"]'); await tab.waitForFunction(() => /^Mistrovství/.test(document.getElementById('dialog-overlay').dataset.title)); await tab.waitForSelector('[data-mastery-look] [data-wear-set="zemepis"]'); });
            await scene(tab, 'Diplomy', size, async () => { await progress(); await tab.click('[data-rewards-info="diplomas"]'); await tab.waitForSelector('[data-diplomas]'); });
            await scene(tab, 'Diplom', size, async () => { await progress(); await tab.click('[data-rewards-info="diplomas"]'); await tab.click('[data-diploma="zemepis"]'); await tab.waitForSelector('[data-diploma-preview] canvas'); });
            await scene(tab, 'Diplom (zamčený)', size, async () => { await progress(); await tab.click('[data-rewards-info="diplomas"]'); await tab.click('[data-diploma="historie"]'); await tab.waitForSelector('[data-diploma-locked]'); });
            await scene(tab, 'Ochrana série', size, async () => { await progress(); await tab.click('[data-rewards-info="freeze"]'); await tab.waitForSelector('[data-freeze-help]'); });
            // Přehled série Kvízu dne (quiz-streak.js) z dlaždice Série: kalendář 10 týdnů, vybraný den, úseky série a tlačítko Zpět
            await scene(tab, 'Přehled série Kvízu dne', size, async () => { await progress(); await tab.click('[data-rewards-info="freeze"]'); await tab.click('[data-quiz-streak-open]'); await tab.waitForSelector('#dialog-overlay [data-qs-day]'); await tab.waitForSelector('#dialog-overlay [data-dialog-back]'); });
            // Mudrlantova kronika (chronicle.js): každá karta příběhu (s přepínačem Minulý / Tento týden) se vejde bez posouvání
            const chronicle = async (pageName) => {
                await progress();
                await tab.click('[data-open-chronicle]');
                await tab.waitForSelector('[data-chronicle]');
                for (let i = 0; i < 5 && await tab.getAttribute('[data-chronicle]', 'data-kr-page') !== pageName; i++) await tab.click('[data-kr-next]');
                await tab.waitForSelector(`[data-chronicle][data-kr-page="${pageName}"]`);
            };
            for (const pageName of ['titul', 'cisla', 'tema', 'souboje', 'zaver']) await scene(tab, `Kronika týdne – ${pageName}`, size, () => chronicle(pageName));
            // Statistiky pro nadšence (statistiky.js): pět částí přepínačem nahoře; dlouhé části se posouvají uvnitř okna (výjimky výše)
            // Statistiky vedou z okna Mistrovství témat (na Postupu nemají dlaždici)
            const stats = async (part) => {
                await progress();
                await tab.click('[data-open-mastery-all]'); await tab.click('[data-mastery-dialog] [data-open-stats]');
                await tab.waitForSelector('[data-stats]'); await tab.click(`[data-st-tab="${part}"]`); await tab.waitForSelector(`[data-stats][data-st-current="${part}"]`); };
            await scene(tab, 'Statistiky pro nadšence', size, () => stats('prehled'));
            await scene(tab, 'Statistiky – Témata', size, () => stats('temata'));
            await scene(tab, 'Statistiky – Vývoj', size, () => stats('vyvoj'));
            await scene(tab, 'Statistiky – Záměny', size, () => stats('zameny'));
            await scene(tab, 'Statistiky – Rekordy', size, () => stats('rekordy'));
            // Album sbírky (album.js): sekce s nejvíc věcmi (doplňky), Odznaky (posouvají se), podrobnosti postavičky (s Nasadit) a odměny alba
            const album = async (section) => { await progress(); await tab.click('[data-rewards-info="album"]'); await tab.waitForSelector('[data-album]'); await tab.click(`[data-album-tab="${section}"]`); await tab.waitForSelector(`[data-album-section="${section}"]`); };
            await scene(tab, 'Album sbírky', size, () => album('accessories'));
            await scene(tab, 'Album – Odznaky', size, () => album('badges'));
            await scene(tab, 'Album – podrobnosti', size, async () => { await album('avatars'); await tab.click('[data-album-item][data-state="owned"]'); await tab.waitForSelector('[data-album-detail] [data-album-wear]'); });
            await scene(tab, 'Album – odměny', size, async () => { await album('avatars'); await tab.click('[data-album-rewards]'); await tab.waitForSelector('[data-album-rewards-list]'); });
            await scene(tab, 'Cíle týdne', size, async () => { await action(tab, 'goals-open'); await waitTitle(tab, 'Cíle týdne'); });
            await scene(tab, 'Truhla Mudrlanta', size, async () => { await action(tab, 'chest-open'); await tab.waitForSelector('#chest-overlay button'); });
            // Zlatá otázka: okno z Mého postupu (dlaždice Zlatá truhla), Zlatá truhla zavřená a otevřená (stejné okno jako Truhla Mudrlanta)
            await scene(tab, 'Zlatá otázka', size, async () => { await progress(); await tab.click('[data-rewards-info="gold"]'); await tab.waitForSelector('[data-gold-info] [data-gold-open]'); });
            await scene(tab, 'Zlatá truhla', size, async () => { await action(tab, 'gold-chest'); await tab.waitForSelector('#chest-overlay .gold-chest [data-chest-go]'); }, { keep: true });
            await scene(tab, 'Zlatá truhla – odměna', size, async () => { await tab.click('#chest-overlay [data-chest-go]'); await tab.waitForSelector('#chest-overlay [data-chest-reveal]'); await tab.waitForFunction(() => [...document.querySelectorAll('#chest-overlay img')].every(img => img.complete)); });
            // Sezóna Mudrlanta: okno s cestou 20 stupňů a odhalení odměny (zavřená pečeť, otevřená)
            await scene(tab, 'Sezóna', size, async () => { await progress(); await tab.click('[data-season-open]'); await tab.waitForSelector('[data-season-path]'); });
            await scene(tab, 'Sezóna – pečeť', size, async () => { await action(tab, 'season-claim'); await tab.waitForSelector('#season-overlay [data-season-go]'); });
            await scene(tab, 'Sezóna – odměna', size, async () => { await action(tab, 'season-claim'); await tab.waitForSelector('#season-overlay [data-season-go]'); await tab.click('#season-overlay [data-season-go]'); await tab.waitForSelector('[data-season-reveal]'); });
            // Co hrát (výběr témat mixu a jednoho tématu)
            await scene(tab, 'Co hrát – mix', size, async () => { await action(tab, 'play-mix'); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
            await scene(tab, 'Co hrát – téma', size, async () => { await nav.go(tab, 'hrat'); await tab.waitForSelector('[data-action="play-topic"]'); await tab.click('[data-action="play-topic"][data-topic="zemepis"]'); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
            await nav.go(tab, 'souperi');
            // Nová okna hlavních obrazovek: výběr tématu dnešní otázky, vše, co čeká, Přátelé a Účet
            await scene(tab, 'Dnešní otázky', size, async () => { await action(tab, 'daily-sheet'); await tab.waitForSelector('#daily-sheet [data-action="daily"]'); });
            await scene(tab, 'Čeká na tebe', size, async () => { await action(tab, 'waiting-all'); await tab.waitForSelector('#waiting-list'); });
            await scene(tab, 'Přátelé', size, async () => { await action(tab, 'friends-open'); await tab.waitForSelector('#friends-list'); });
            await scene(tab, 'Účet', size, async () => { await nav.go(tab, 'ja'); await tab.click('#ja-rows [data-ja="account"]'); await tab.waitForSelector('#account-dialog'); });
            await nav.go(tab, 'souperi');
            // Výzvy
            await scene(tab, 'Nová výzva', size, async () => { await action(tab, 'new-challenge'); await waitTitle(tab, 'Nová výzva'); await tab.waitForTimeout(300); });
            // Kamarádské sázky (bets.js): řádek Sázka s vybranou sázkou a hláškou, pravidla sázek a nabídka sázky u vyzvaného
            const stakeRow = async (expand = false) => {
                await action(tab, 'new-challenge');
                await waitTitle(tab, 'Nová výzva');
                await tab.click(`#dialog-overlay [data-pick-opp="${PETR}"]`);
                await tab.waitForSelector('[data-stake-card]');
                await tab.click('[data-ch-open="stake"]');
                await tab.click('[data-stake-pick="25"]');
                await tab.click('[aria-label="Další hláška"]');
                if (!expand) await tab.click('[data-ch-open="stake"]');
                await tab.waitForTimeout(200);
            };
            await scene(tab, 'Nová výzva – sázka', size, () => stakeRow());
            await scene(tab, 'Kamarádské sázky', size, async () => { await stakeRow(true); await tab.click('[data-stake-help]'); await tab.waitForSelector('[data-bet-help] [data-bet-mine]'); });
            await scene(tab, 'Výzva – nabídka sázky', size, async () => { db.stakeOffer = 'HJK567'; await action(tab, 'challenge-open', { code: 'HJK567' }); await tab.waitForSelector('[data-stake-offer]'); });
            db.stakeOffer = null;
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
                await nav.settingsFromJa(tab);
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
                await nav.daily(tab);
                await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
                await action(tab, 'report-question');
                await waitTitle(tab, 'Nahlásit chybu v otázce');
                await tab.click('#dialog-overlay [data-reason]');
            });
            await action(tab, 'daily-home');
            await nav.go(tab, 'souperi');
            // Kvíz dne – výsledek (dohráno), obrazovka
            await scene(tab, 'Kvíz dne – výsledek', size, async () => { await action(tab, 'quiz-open'); await tab.waitForSelector('[data-action="quiz-share"]', { timeout: 20000 }); await tab.waitForTimeout(800); }, { screen: true });
            assert.deepEqual(log.csp, []);
            await context.close();
        });

        await t.test(`Kvíz dne – úvod, tip, pozvánka do turnaje a přezdívka (${size.width}×${size.height})`, async () => {
            const db = newDb({ quizDone: false });
            db.entries = db.entries.filter(e => !(e.tournament_id === uid(900) && e.user_id === ME));
            // Okno s přezdívkou vyskočí hned po načtení (přes záložku Dnes), proto se po startu nepřepíná
            const { context, tab } = await setup(browser, { viewport: size, db, start: '', storage: { 'mudrlant.nickPending': JSON.stringify(Date.parse(NOW)), 'mudrlant.tips': JSON.stringify({}) } });
            await scene(tab, 'Přezdívka', size, async () => { await tab.waitForSelector('#nick-input', { timeout: 20000 }); });
            await scene(tab, 'Kvíz dne – úvod', size, async () => { await action(tab, 'quiz-open'); await tab.waitForSelector('[data-action="quiz-start"]', { timeout: 20000 }); }, { screen: true });
            await action(tab, 'quiz-home');
            await nav.waitForHome(tab);
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

        // Sezónní truhla (20. stupeň): všechny věci měsíce vějířem (doplněk, rámeček, postavička a titul) se vejdou
        await t.test(`Sezónní truhla (${size.width}×${size.height})`, async () => {
            const claimed = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, 'xp:150']));
            const storage = { 'mudrlant.rewards': JSON.stringify({ v: 1, freezes: 2, season: { id: '2026-11', startXp: 5000, claimed } }) };
            const { context, tab, log } = await setup(browser, { viewport: size, storage });
            await scene(tab, 'Sezónní truhla – odměna', size, async () => {
                await action(tab, 'season-claim');
                await tab.waitForSelector('#season-overlay [data-season-go]');
                await tab.click('#season-overlay [data-season-go]');
                await tab.waitForSelector('[data-season-reveal]');
                assert.match(await tab.textContent('[data-season-item]'), /Lampion · Listopadový rámeček · postavička Hrnek čaje · titul Šampion sezóny/);
                await tab.waitForFunction(() => [...document.querySelectorAll('#season-overlay img')].every(img => img.complete));
            });
            assert.deepEqual(log.csp, []);
            await context.close();
        });

        // Sběratel všech sezónních doplňků (12 ze Sezónních truhel): ve výběru doplňků je jich nejvíc (hlava 17 doplňků, ruka 14),
        // okno se musí vejít i tak; u Dýně (pevné barvy) je místo palety věta
        await t.test(`Nastavení – Mudrlant se všemi sezónními doplňky (${size.width}×${size.height})`, async () => {
            const rewards = JSON.parse(richStorage()['mudrlant.rewards']);
            rewards.gifts.accessories = ['cepice-zimni', 'karneval', 'jarni-venecek', 'destnik', 'konvalinky', 'slamak', 'snorchl', 'zmrzlina', 'tuzka', 'dyne', 'lampion', 'sala-zimni'];
            const { context, tab, log } = await setup(browser, { viewport: size, storage: { 'mudrlant.rewards': JSON.stringify(rewards) } });
            const openSlot = async (slot, pick = null) => {
                await nav.settingsFromJa(tab, 'owl');
                await tab.click('[data-me-tab="owl"]');
                await tab.waitForSelector('[data-me-tab="owl"][aria-selected="true"]');
                await tab.click(`[data-owl-slot="${slot}"]`);
                await tab.waitForSelector(`[data-owl-slot="${slot}"][aria-pressed="true"]`);
                if (pick) { await tab.click(`[data-owl-pick="${slot}:${pick}"]`); await tab.waitForSelector(`[data-owl-pick="${slot}:${pick}"][aria-pressed="true"]`); }
                await tab.waitForFunction(() => [...document.querySelectorAll('#settings-overlay img')].every(img => img.complete));
            };
            await scene(tab, 'Nastavení – Mudrlant (všechny sezónní, hlava)', size, async () => {
                await openSlot('head', 'slamak');
                assert.equal(await tab.locator('[data-owl-pick^="head:"]').count(), 27, '„bez doplňku“ a 26 doplňků na hlavu (se sadami k tématům)');
                await tab.waitForSelector('[data-owl-color="head:modra"]');
            });
            await scene(tab, 'Nastavení – Mudrlant (všechny sezónní, ruka)', size, async () => {
                await openSlot('hand', 'lampion');
                assert.equal(await tab.locator('[data-owl-pick^="hand:"]').count(), 27, '„bez doplňku“ a 26 doplňků do ruky (se sadami k tématům)');
            });
            await scene(tab, 'Nastavení – Mudrlant (pevné barvy)', size, async () => {
                await openSlot('head', 'dyne');
                await tab.waitForSelector('[data-owl-fixed]');
                assert.equal(await tab.locator('[data-owl-color]').count(), 0, 'Dýně nemá paletu');
            });
            assert.deepEqual(log.csp, []);
            await context.close();
        });

        // Bez účtu: Nastavení má jen Hru (s přihlášením místo účtu) a Mudrlanta
        await t.test(`Nastavení bez účtu (${size.width}×${size.height})`, async () => {
            const { context, tab, log } = await setup(browser, { viewport: size, signedOut: true });
            const open = async (id) => {
                await nav.settingsFromJa(tab, id);
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
        const tiny = Object.entries(table).filter(([name]) => /^(Profil hráče|Nahlásit hráče|Zablokovat hráče|Kronika týdne)/.test(name))
            .flatMap(([name, row]) => Object.entries(row.detail || {}).flatMap(([key, found]) => found.small.map(item => `${name} ${key}: ${item}`)));
        assert.deepEqual(tiny, [], 'dotykové plochy v profilu hráče a v Kronice týdne aspoň 40 px');
    });
});

// --- Stránka se neposouvá (pravidlo: na 360×640 ani 390×780 se nic neposouvá), ve světlém i tmavém režimu ---
// Hlavní obrazovky a okna s plnými daty: pět záložek spodní lišty (Dnes, Hrát, Soupeři, Postup, Já), okna Výzvy a Turnaje na záložce
// Soupeři, otázka (se všemi nápovědami a po odpovědi; lišta je při hře skrytá), Co hrát (mix a téma), Nastavení (tři záložky), Album sbírky
// (všechny sekce), Cíle týdne, Dnešní otázky, Čeká na tebe, Přátelé, Účet, profil přítele a uvítání před volbou účtu. Neposouvá se dokument
// (stránka), obsah aplikace (#app-content) ani panel okna a žádný blok záložky není uříznutý pod spodní lištou; posouvat se smí jen
// vnitřní seznam, který je ze své povahy dlouhý (poslední výzvy, turnaje, přátelé, mřížka alba: data-scroll-list), a ten je celý uvnitř
// svého okna a jde dojet až na konec. Záložky se hlídají i na 412×915 a na nejmenším telefonu 320×568 (tam i Co hrát).
// Dlouhé seznamy v oknech (výjimky EXEMPT výše) a ostatní okna hlídá tabulka testu „okna se vejdou bez posouvání“.
const pageOverflow = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    const doc = document.scrollingElement || document.documentElement;
    const main = document.getElementById('app-content');
    const overlay = ['dialog-overlay', 'settings-overlay', 'play-chooser', 'place-info'].map(id => document.getElementById(id)).find(Boolean);
    const panel = overlay ? overlay.firstElementChild : null;
    const box = panel ? panel.getBoundingClientRect() : null;
    const lists = panel ? [...panel.querySelectorAll('[data-scroll-list]')] : [];
    // Záložka: obal obsahu se musí vejít do plochy nad lištou a žádný jeho blok nesmí být uříznutý (okna Výzvy a Turnaje mají pevnou výšku)
    const root = main ? main.querySelector(':scope > [data-tab-root]') : null;
    const area = main ? main.getBoundingClientRect() : null;
    const cut = root ? [...root.querySelectorAll(':scope > *, :scope > section > *')].filter(el => { const r = el.getBoundingClientRect(); return r.height > 0 && (r.bottom > area.bottom + 1 || r.top < area.top - 1); }).length : 0;
    const bar = document.getElementById('app-nav');
    const barBox = bar && !bar.classList.contains('hidden') ? bar.getBoundingClientRect() : null;
    resolve({
        page: Math.max(0, doc.scrollHeight - window.innerHeight),
        content: main ? Math.max(0, main.scrollHeight - main.clientHeight) : 0,
        dialog: panel ? Math.max(0, panel.scrollHeight - panel.clientHeight) : 0,
        outside: lists.filter(list => { const r = list.getBoundingClientRect(); return r.top < box.top - 1 || r.bottom > box.bottom + 1; }).length,
        tab: root ? Math.max(0, root.scrollHeight - main.clientHeight) : 0,
        cut,
        // Spodní lišta: je vidět celá, u spodního okraje okna a všech pět záložek má dotykovou plochu aspoň 44 px
        bar: barBox ? { bottom: Math.round(window.innerHeight - barBox.bottom), top: Math.round(barBox.top - (area ? area.bottom : 0)), tabs: [...bar.querySelectorAll('[data-nav]')].map(el => Math.round(Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height))) } : null
    });
})));
// Vnitřní seznam záložky (Poslední výzvy, turnaje) jde posunout až na konec: poslední blok je pak celý vidět nad spodní lištou
const listReachesEnd = () => new Promise(resolve => {
    const list = document.querySelector('#app-content [data-scroll-list]');
    if (!list) return resolve('seznam chybí');
    list.scrollTop = list.scrollHeight;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const box = list.getBoundingClientRect();
        const area = document.getElementById('app-content').getBoundingClientRect();
        const last = [...list.querySelectorAll('button, p, li, div')].filter(el => el.getBoundingClientRect().height > 0).pop();
        const lastBox = last ? last.getBoundingClientRect() : box;
        const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
        list.scrollTop = 0;
        resolve(!atEnd ? 'seznam nedojede na konec' : box.bottom > area.bottom + 1 ? 'seznam přesahuje pod lištu' : lastBox.bottom > box.bottom + 1 ? 'poslední položka seznamu není celá vidět' : '');
    }));
});
const TAB_NAMES = { dnes: 'Dnes', hrat: 'Hrát', souperi: 'Soupeři', postup: 'Postup', ja: 'Já' };

test('stránka se neposouvá: obrazovky a okna ve světlém i tmavém režimu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const found = [];
    const rows = [];
    t.after(async () => {
        await browser.close();
        console.log(`\n${rows.join('\n')}\n`);
    });
    const act = (tab, name, data = {}) => tab.evaluate(([name, data]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = name;
        Object.assign(button.dataset, data);
        button.className = 'hidden';
        document.getElementById('app-content').appendChild(button);
        button.click();
        button.remove();
    }, [name, data]);
    const closeOverlays = async (tab) => {
        for (let i = 0; i < 6 && await tab.evaluate((ids) => ids.some(id => document.getElementById(id)), OVERLAYS); i++) {
            await tab.keyboard.press('Escape');
            await tab.waitForTimeout(60);
        }
        await tab.evaluate((ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.remove(); }), OVERLAYS);
    };
    // allow = co se tu posouvat smí: 'content' u výsledku otázky (článek o položce pod verdiktem, tlačítko Další je lepkavé a vidět hned)
    // bar: true = obrazovka se spodní lištou (musí být vidět celá u spodního okraje), false = hra (lišta skrytá), null = nehlídá se
    const measure = async (tab, name, key, allow = [], bar = null) => {
        await tab.evaluate(() => { document.querySelectorAll('#celebration, #celebration-mini, #toast').forEach(el => el.remove()); });
        await tab.waitForTimeout(200);
        const size = await tab.evaluate(pageOverflow);
        const over = ['page', 'content', 'dialog', 'tab'].filter(kind => size[kind] > 0 && !allow.includes(kind)).map(kind => `${{ page: 'stránka', content: 'obsah', dialog: 'okno', tab: 'záložka' }[kind]} ${size[kind]} px`);
        if (size.outside) over.push('vnitřní seznam přesahuje okno');
        if (size.cut && !allow.includes('content')) over.push(`uříznuté bloky záložky: ${size.cut}`);
        if (bar === true && !size.bar) over.push('spodní lišta chybí');
        if (bar === true && size.bar && (size.bar.bottom !== 0 || size.bar.top !== 0)) over.push(`spodní lišta není u spodního okraje pod obsahem (${size.bar.top}/${size.bar.bottom} px)`);
        if (bar === true && size.bar && size.bar.tabs.some(side => side < 44)) over.push(`záložka lišty pod 44 px (${size.bar.tabs.join(', ')})`);
        if (bar === false && size.bar) over.push('spodní lišta je vidět i při hře');
        rows.push(`${`${name} ${key}`.padEnd(48)} ${over.join(', ') || 'bez posouvání'}`);
        if (over.length) found.push(`${name} ${key}: ${over.join(', ')}`);
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `stranka-${name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${key.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`) });
    };
    const scene = async (tab, name, key, open, allow = [], bar = null) => {
        try {
            await open();
            await measure(tab, name, key, allow, bar);
        } catch (error) {
            found.push(`${name} ${key}: ${error.message.split('\n')[0]}`);
        }
        await closeOverlays(tab);
    };
    // Pět záložek a obě okna záložky Soupeři (Výzvy s rozbaleným seznamem posledních výzev, Turnaje): nic se neposouvá a seznam dojede na konec
    const tabScenes = async (tab, key, { signedIn = true } = {}) => {
        for (const id of ['dnes', 'hrat', 'souperi', 'postup', 'ja']) {
            await scene(tab, `záložka ${TAB_NAMES[id]}${signedIn ? '' : ' (bez účtu)'}`, key, async () => { await nav.go(tab, id); await tab.waitForTimeout(350); }, [], true);
        }
        if (!signedIn) return;
        await scene(tab, 'Soupeři – Výzvy', key, async () => {
            await nav.challenges(tab);
            await tab.waitForSelector('#challenges-section [data-action="challenge-open"]');
            await tab.waitForSelector('#league-card');
        }, [], true);
        await scene(tab, 'Soupeři – Výzvy (všechny výzvy)', key, async () => {
            await nav.challenges(tab);
            await tab.click('[data-action="recent-more"]');
            await tab.waitForSelector('[data-action="recent-more"][aria-expanded="true"]');
            await tab.waitForTimeout(300);
            const end = await tab.evaluate(listReachesEnd);
            if (end) throw new Error(end);
        }, [], true);
        await act(tab, 'recent-more');
        await scene(tab, 'Soupeři – Turnaje', key, async () => {
            await nav.tournaments(tab);
            await tab.waitForSelector('#tournament-card [data-tournament-row]');
            await tab.waitForSelector('#tournament-poll');
            const end = await tab.evaluate(listReachesEnd);
            if (end) throw new Error(end);
        }, [], true);
        await nav.go(tab, 'souperi');
    };
    const SECTIONS = ['avatars', 'accessories', 'frames', 'themes', 'robes', 'colors', 'badges', 'diplomas'];
    for (const scheme of ['light', 'dark']) {
        for (const size of SIZES) {
            const key = `${size.width}×${size.height} ${scheme}`;
            await t.test(`obrazovky a okna (${key})`, async () => {
                const { context, tab, log } = await setup(browser, { viewport: size, scheme });
                await tab.waitForSelector('#friends-strip [data-player-id]', { timeout: 20000 });
                await tab.waitForSelector('#waiting-section');
                await tab.waitForTimeout(800);
                await closeOverlays(tab);
                await tabScenes(tab, key);
                // Záložka Dnes: řádek Truhla čeká a dnešní výzvy; Soupeři: to nejnaléhavější a „+N další“; lišta má odznak u Soupeřů
                await nav.go(tab, 'dnes');
                assert.equal(await tab.locator('#home-specials [data-special-tile]').count(), 4, 'čtyři dnešní výzvy');
                assert.equal(await tab.locator('#home-specials [data-special-tile][data-hot]').count(), 1, 'jeden zvýrazněný řádek');
                assert.equal(await tab.locator('#chest-row[data-chest-ready]').count(), 1, 'Truhla čeká');
                assert.ok(Number(await tab.textContent('#app-nav [data-nav="souperi"] [data-nav-badge]')) >= 2, 'odznak s počtem čekajících u Soupeřů');
                await scene(tab, 'Dnešní otázky', key, async () => { await tab.click('[data-action="daily-sheet"]'); await tab.waitForSelector('#daily-sheet [data-action="daily"]'); });
                await scene(tab, 'Čeká na tebe', key, async () => { await nav.go(tab, 'souperi'); await tab.click('[data-action="waiting-all"]'); await tab.waitForSelector('#waiting-list'); });
                await scene(tab, 'Přátelé', key, async () => { await nav.go(tab, 'souperi'); await tab.click('[data-friends-add]'); await tab.waitForSelector('#friends-list'); }, size.height < 700 ? ['dialog'] : []);
                await scene(tab, 'Účet', key, async () => { await nav.go(tab, 'ja'); await tab.click('#ja-rows [data-ja="account"]'); await tab.waitForSelector('#account-dialog'); });
                await scene(tab, 'Co hrát – mix', key, async () => { await nav.mix(tab, { play: false }); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
                await scene(tab, 'Co hrát – téma', key, async () => { await nav.topic(tab, 'zemepis', { play: false }); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
                await scene(tab, 'Mistrovství témat', key, async () => { await nav.go(tab, 'postup'); await tab.click('[data-open-mastery-all]'); await tab.waitForSelector('[data-mastery-dialog]'); });
                for (const [id, title] of [['game', 'Hra'], ['profile', 'Profil'], ['owl', 'Mudrlant']]) {
                    await scene(tab, `Nastavení – ${title}`, key, async () => {
                        await nav.settingsFromJa(tab, id);
                        await tab.waitForSelector(`[data-me-tab="${id}"][aria-selected="true"]`);
                        await tab.waitForTimeout(300);
                    });
                }
                for (const section of SECTIONS) {
                    await scene(tab, `Album – ${section}`, key, async () => {
                        await nav.go(tab, 'postup');
                        await tab.click('[data-rewards-info="album"]');
                        await tab.waitForSelector('[data-album]');
                        await tab.click(`[data-album-tab="${section}"]`);
                        await tab.waitForSelector(`[data-album-section="${section}"]`);
                    });
                }
                await scene(tab, 'Cíle týdne', key, async () => { await nav.go(tab, 'postup'); await tab.click('#weekly-goals'); await tab.waitForSelector('#dialog-overlay'); await tab.waitForTimeout(200); });
                await scene(tab, 'Profil hráče (přítel)', key, async () => {
                    await nav.go(tab, 'souperi');
                    await tab.click(`#friends-strip [data-player-id="${PETR}"]`);
                    await tab.waitForSelector('[data-rematch]');
                    await tab.waitForFunction(() => document.getElementById('player-league'));
                });
                // Otázka: na začátku, se všemi nápovědami a po odpovědi; spodní lišta je při hře skrytá a v hlavičce je šipka zpět
                await nav.topic(tab, 'zemepis');
                await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
                await measure(tab, 'otázka', key, [], false);
                assert.equal(await tab.locator('#btn-home:not(.hidden)').count(), 1, 'při hře je v hlavičce šipka zpět');
                for (let step = 0; step < 6 && await tab.$('[data-action="hint"]'); step++) await tab.click('[data-action="hint"]');
                await measure(tab, 'otázka se všemi nápovědami', key, [], false);
                await (await tab.$$('[data-action="choice"]'))[0].click();
                await tab.waitForSelector('[data-verdict]');
                // Výsledek otázky: spodní lišta jen na vyšším displeji (na 360×640 je výsledek rozvržený na celou výšku)
                await measure(tab, 'výsledek otázky', key, ['content'], size.height > 770 ? true : false);
                const seen = await tab.evaluate(() => ['[data-verdict]', '[data-action="next"]'].map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5; }));
                assert.deepEqual(seen, [true, true], 'verdikt i Další vidět bez posouvání');
                // Domů vrátí na záložku, ze které se hrálo (Hrát), a lišta je zpátky
                await tab.click('#btn-home');
                await tab.waitForSelector('#app-content > [data-tab-root="hrat"]');
                assert.equal(await tab.locator('#app-nav:not(.hidden) [data-nav="hrat"][aria-current="page"]').count(), 1);
                assert.equal(await tab.locator('#btn-home.hidden').count(), 1, 'na hlavních obrazovkách není šipka zpět');
                assert.equal(await tab.locator('#btn-practice, #btn-learn').count(), 0, 'tlačítka Hrát dál a Učení v hlavičce už nejsou');
                assert.deepEqual(log.csp, []);
                assert.deepEqual(log.errors, []);
                await context.close();
            });
        }
        // Záložky na velkém telefonu (412×915) a na nejmenším (320×568, tam i Co hrát), bez účtu a uvítání před volbou účtu
        await t.test(`záložky na 412×915 a 320×568, bez účtu a uvítání (${scheme})`, async () => {
            for (const extra of [{ width: 412, height: 915 }, { width: 320, height: 568 }]) {
                const key = `${extra.width}×${extra.height} ${scheme}`;
                const { context, tab, log } = await setup(browser, { viewport: extra, scheme });
                await tab.waitForSelector('#friends-strip [data-player-id]', { timeout: 20000 });
                await tab.waitForSelector('#waiting-section');
                await tab.waitForTimeout(800);
                await closeOverlays(tab);
                await tabScenes(tab, key);
                if (extra.height < 600) {
                    await scene(tab, 'Co hrát – mix', key, async () => { await nav.mix(tab, { play: false }); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
                    await scene(tab, 'Co hrát – téma', key, async () => { await nav.topic(tab, 'zemepis', { play: false }); await tab.waitForSelector('#play-chooser [data-chooser-play]'); });
                }
                assert.deepEqual(log.csp, []);
                assert.deepEqual(log.errors, []);
                await context.close();
            }
            for (const size of SIZES) {
                const key = `${size.width}×${size.height} ${scheme}`;
                // Bez účtu: Soupeři nabízejí přihlášení, ostatní záložky fungují
                const guest = await setup(browser, { viewport: size, scheme, signedOut: true });
                await tabScenes(guest.tab, key, { signedIn: false });
                await nav.go(guest.tab, 'souperi');
                assert.equal(await guest.tab.locator('#souperi-login [data-action="auth-login"]').count(), 1, 'bez účtu pozvánka k přihlášení');
                assert.equal(await guest.tab.locator('#souperi-tiles').count(), 0);
                assert.deepEqual(guest.log.csp, []);
                await guest.context.close();
                const welcome = await setup(browser, { viewport: size, scheme, signedOut: true, welcome: true });
                await measure(welcome.tab, 'uvítání', key, [], false);
                assert.deepEqual(welcome.log.csp, []);
                await welcome.context.close();
            }
        });
    }
    // Záložka Dnes se vším najednou: Truhla čeká, Zlatá truhla, odměna Sezóny, včerejší Tajemná otázka a tematický víkend. Příležitostné
    // pruhy se ukážou celé, jen když se vejdou; jinak z nich zbydou čipy v jedné řadě. Posouvat se nesmí nikdy a nic nesmí zmizet.
    await t.test('záložka Dnes s příležitostnými pruhy: celé pruhy, nebo čipy, nikdy posouvání', async () => {
        const Weekend = require('../weekend.js');
        // Nejbližší sobota po TODAY, na kterou připadá tematický víkend
        let day = new Date(`${TODAY}T11:00:00Z`);
        while (!(day.getUTCDay() === 6 && Weekend.at(day) && Weekend.at(day).state === 'active')) day = new Date(day.getTime() + 86400000);
        const iso = day.toISOString().slice(0, 10);
        const yesterday = new Date(day.getTime() - 86400000).toISOString().slice(0, 10);
        const storage = { 'mudrlant.mystery': JSON.stringify({ v: 1, days: { [yesterday]: { topic: 'zemepis', q: 'Q213', name: 'Matterhorn', tips: [] } } }) };
        for (const size of [...SIZES, { width: 320, height: 568 }, { width: 412, height: 915 }]) {
            const key = `${size.width}×${size.height}`;
            const { context, tab, log } = await setup(browser, { viewport: size, storage, now: day.toISOString(), start: '' });
            await tab.waitForSelector('#dnes-extras');
            await tab.waitForTimeout(500);
            await closeOverlays(tab);
            await measure(tab, 'Dnes se všemi pruhy', key, [], true);
            const state = await tab.evaluate(() => {
                const shown = (el) => Boolean(el) && el.getBoundingClientRect().height > 0;
                // V dokumentu je jen jedna podoba (data-mode), druhá čeká v <template>
                const extras = document.getElementById('dnes-extras');
                const actions = (root) => [...root.querySelectorAll('[data-action]')].map(el => el.dataset.action).filter(name => name !== 'mystery-dismiss' && name !== 'chronicle-dismiss').sort();
                const live = extras.querySelector(':scope > [data-live]');
                return { mode: extras.dataset.mode, shown: shown(live), live: actions(live), stored: actions(extras.querySelector(':scope > template').content), chest: shown(document.getElementById('chest-row')),
                    twice: [...document.querySelectorAll('#app-content [data-action]')].map(el => el.dataset.action).filter((name, index, all) => ['gold-chest', 'mystery-reveal', 'season-claim', 'weekend-play'].includes(name) && all.indexOf(name) !== index) };
            });
            assert.equal(state.chest, true, `${key}: řádek Truhla čeká je vidět vždy`);
            assert.equal(state.shown, true, `${key}: pruhy nebo čipy jsou vidět`);
            assert.deepEqual(state.stored, state.live, `${key}: čipy vedou na stejná místa jako pruhy`);
            assert.deepEqual(state.twice, [], `${key}: každá akce je na záložce jen jednou`);
            for (const name of ['gold-chest', 'mystery-reveal', 'season-claim', 'weekend-play']) assert.ok(state.live.includes(name), `${key}: ${name} (${iso})`);
            if (size.height <= 640) assert.equal(state.mode, 'chips', `${key}: na nízkém displeji čipy`);
            if (size.height >= 900) assert.equal(state.mode, 'strips', `${key}: na vysokém displeji celé pruhy`);
            // Čip jde klepnout (Zlatá truhla se otevře)
            if (state.mode === 'chips') { await tab.click('#dnes-extras [data-action="gold-chest"]'); await tab.waitForSelector('#chest-overlay'); }
            assert.deepEqual(log.csp, []);
            assert.deepEqual(log.errors, []);
            await context.close();
        }
    });
    await t.test('výsledek: nic se neposouvá', () => assert.deepEqual(found, [], 'obrazovky a okna bez posouvání stránky'));
});

// --- Jednotný vzhled hlavních obrazovek: tlačítka akcí v řádcích mají všude stejný rozměr a rozložení, čip série v hlavičce ---
// Tlačítko akce (data-cta) má na záložce Dnes, v řádku Čeká na tebe, v okně Čeká na tebe a v oknech Výzvy a Turnaje stejnou šířku
// i výšku, ikonu na stejném místě a popisek, který se vejde (i na 360 px); fajfka hotového řádku sedí vystředěná ve stejném sloupci.
// Čip série v hlavičce: obrázek plamene s počtem dní, čárka a obrázek štítu s počtem ochran; od obrázku hráče ho dělí 12 px (s obrázkovým rámečkem
// o jeho přesah víc), je svisle vystředěný s obrázkem a bez série je celý šedý.
// Svislé posouvání obsahu a stránky (obojí má být 0)
const pageOverflowSimple = (tab) => tab.evaluate(() => { const main = document.getElementById('app-content'); return [main.scrollHeight - main.clientHeight, document.documentElement.scrollHeight - window.innerHeight]; });
test('jednotný vzhled: tlačítka akcí v řádcích a čip série v hlavičce', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());
    // Rozměry tlačítek akcí v zadaném místě stránky: šířka, výška, pravý okraj, poloha ikony od levého okraje tlačítka, přetečení popisku
    const ctas = (tab, scope) => tab.evaluate((scope) => [...document.querySelectorAll(`${scope} [data-cta], ${scope} [data-cta-done]`)].filter(el => el.getBoundingClientRect().width > 0).map(el => {
        const box = el.getBoundingClientRect();
        const icon = el.querySelector('svg');
        const label = el.querySelector('[data-cta-label]');
        const row = el.closest('[data-special-tile], [data-wait], #daily-card, #chest-row, #season-strip, #gold-chest-row, #weekend-banner, #conquest-wait, [data-tournament-row], [data-friend-request], button, div');
        return {
            text: el.textContent.replace(/\s+/g, ' ').trim(), done: el.hasAttribute('data-cta-done'), w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10, right: Math.round(box.right),
            icon: icon ? Math.round((icon.getBoundingClientRect().left - box.left) * 10) / 10 : null, iconSize: icon ? Math.round(icon.getBoundingClientRect().width) : null,
            centred: icon && el.hasAttribute('data-cta-done') ? Math.abs((icon.getBoundingClientRect().left + icon.getBoundingClientRect().width / 2) - (box.left + box.width / 2)) <= 0.6 : null,
            over: label ? label.scrollWidth - label.clientWidth : 0, vertical: row ? Math.abs((box.top + box.height / 2) - (row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2)) : 0
        };
    }), scope);
    const uniform = (list, what, size) => {
        assert.ok(list.length > 0, `${what}: aspoň jedno tlačítko`);
        for (const item of list) {
            assert.deepEqual([item.w, item.h], size, `${what}: „${item.text}“ má rozměr ${item.w}×${item.h}, čeká se ${size.join('×')}`);
            assert.ok(item.over <= 0, `${what}: popisek „${item.text}“ se nevejde (o ${item.over} px)`);
            if (item.done) assert.equal(item.centred, true, `${what}: fajfka je vystředěná ve sloupci tlačítek`);
            else { assert.equal(item.icon, 10, `${what}: ikona „${item.text}“ je 10 px od levého okraje tlačítka`); assert.equal(item.iconSize, 16, `${what}: ikona „${item.text}“ má 16 px`); }
        }
    };
    const sameColumn = (list, what) => assert.equal(new Set(list.map(item => item.right)).size, 1, `${what}: tlačítka jsou v jednom sloupci vpravo: ${JSON.stringify(list.map(item => [item.text, item.right]))}`);

    for (const [size, scheme] of [[{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light']]) {
        await t.test(`tlačítka akcí ${size.width}×${size.height} (${scheme}): Dnes, Čeká na tebe, Výzvy, Turnaje`, async () => {
            // Tři dnešní otázky hotové (Hrát dál), Kvíz dne hotový (fajfka), Truhla, odměna Sezóny, Zlatá truhla, dnes zápas turnaje,
            // dvě pozvánky do výzev, tahy v Dobývání a žádost o přátelství
            const stats = { daily: Object.fromEntries(['zemepis', 'historie', 'vlajky'].map(topic => [topic, { [TODAY]: { correct: true, points: 3, hintLevel: 1, levelCount: 5 } }])), practice: { played: 10, correct: 8, points: 20 } };
            const { context, tab, log } = await setup(browser, { viewport: size, scheme, start: 'dnes', storage: { 'mudrlant.stats': JSON.stringify(stats) } });
            const expected = size.height <= 770 ? [96, 36] : [96, 40];
            await tab.waitForSelector('#home-specials [data-special-tile]');
            await tab.waitForTimeout(500);
            const dnes = await ctas(tab, '#tab-dnes');
            assert.ok(dnes.length >= 5, `Dnes: ${JSON.stringify(dnes.map(item => item.text))}`);
            assert.ok(dnes.some(item => item.done), 'Dnes: hotový řádek s fajfkou');
            assert.ok(dnes.some(item => item.text === 'Hrát dál'), 'Dnes: Dnešní otázky s Hrát dál');
            uniform(dnes, 'Dnes', expected);
            sameColumn(dnes, 'Dnes');
            for (const item of dnes) assert.ok(item.vertical <= 1, `Dnes: „${item.text}“ je svisle uprostřed řádku`);
            // Zlaté tlačítko zvýrazněného řádku a tlumená tlačítka mají stejný rozměr (hlídá uniform), zlatě orámovaný je jen jeden řádek
            assert.equal(await tab.locator('#tab-dnes [data-hot]').count(), 1, 'Dnes: zlatě zvýrazněný je jen řádek, který je na řadě');
            assert.deepEqual(await pageOverflowSimple(tab), [0, 0], 'Dnes se neposouvá');
            // Záložka Soupeři: řádek Čeká na tebe a okno se všemi čekajícími
            await nav.go(tab, 'souperi');
            await tab.waitForSelector('#waiting-section');
            const waiting = await ctas(tab, '#waiting-section');
            uniform(waiting, 'Čeká na tebe', expected);
            sameColumn([...waiting, { text: 'sloupec záložky Dnes', right: dnes[0].right }], 'Čeká na tebe a Dnes');
            await tab.click('#waiting-section [data-action="waiting-all"]');
            await tab.waitForSelector('#waiting-list');
            const list = await ctas(tab, '#waiting-list');
            assert.ok(list.length >= 3, `okno Čeká na tebe: ${JSON.stringify(list.map(item => item.text))}`);
            uniform(list, 'okno Čeká na tebe', expected);
            sameColumn(list, 'okno Čeká na tebe');
            await tab.keyboard.press('Escape');
            await tab.waitForSelector('#dialog-overlay', { state: 'detached' });
            // Okna Výzvy a Turnaje
            await nav.challenges(tab);
            await tab.waitForSelector('#challenges-section [data-wait="challenge"]');
            uniform(await ctas(tab, '#challenges-section'), 'okno Výzvy', expected);
            await nav.tournaments(tab);
            await tab.waitForSelector('#tournament-card [data-cta]');
            uniform(await ctas(tab, '#tournaments-section'), 'okno Turnaje', expected);
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }

    // Čip série: s obrázkovým rámečkem (duha s mraky) i bez rámečku, na 360 i 390 px; se sérií a ochranami i bez nich
    for (const [width, framed, streak] of [[360, true, 12], [390, true, 0], [360, false, 0], [390, false, 12]]) {
        await t.test(`čip série v hlavičce ${width} px, ${framed ? 's obrázkovým rámečkem' : 'bez rámečku'}, ${streak ? `série ${streak} dní` : 'bez série'}`, async () => {
            const db = newDb();
            if (!framed) db.profiles[ME].frame = null;
            const days = Array.from({ length: streak }, (_, i) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10));
            const rewards = JSON.parse(richStorage()['mudrlant.rewards']);
            rewards.freezes = streak ? 2 : 0;
            const storage = { 'mudrlant.rewards': JSON.stringify(rewards), 'mudrlant.stats': JSON.stringify({ daily: streak ? { zemepis: Object.fromEntries(days.map(day => [day, { correct: true, points: 3, hintLevel: 1, levelCount: 5 }])) } : {}, practice: { played: 1, correct: 1, points: 1 } }),
                ...(framed ? {} : { 'mudrlant.look': JSON.stringify({ frame: 'zadny' }) }) };
            const { context, tab, log } = await setup(browser, { viewport: { width, height: width === 360 ? 640 : 780 }, scheme: width === 360 ? 'dark' : 'light', db, storage, start: 'dnes' });
            await tab.waitForSelector('#streak-chip');
            await tab.waitForFunction((want) => Boolean(document.querySelector('#btn-settings .frame-art')) === want, framed, { timeout: 15000 });
            await tab.waitForTimeout(300);
            const seen = await tab.evaluate(() => {
                const chip = document.querySelector('#streak-chip [data-chip]').getBoundingClientRect();
                const button = document.getElementById('streak-chip').getBoundingClientRect();
                const avatar = document.querySelector('#btn-settings').getBoundingClientRect();
                const badge = document.getElementById('status-badge').getBoundingClientRect();
                const style = getComputedStyle(document.querySelector('#streak-chip [data-chip]'));
                const friends = getComputedStyle(document.createElement('span'));
                const icons = [...document.querySelectorAll('#streak-chip img')].map(img => ({ size: Math.round(img.getBoundingClientRect().width), src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, grey: getComputedStyle(img).filter.includes('grayscale') }));
                return {
                    gap: Math.round(avatar.left - chip.right), centre: Math.abs((chip.top + chip.height / 2) - (avatar.top + avatar.height / 2)), chipHeight: Math.round(chip.height), touch: Math.round(button.height),
                    left: Math.round(chip.left - badge.right), radius: style.borderRadius, font: [style.fontSize, style.fontWeight], icons, friends: Boolean(friends),
                    streak: document.querySelector('#streak-chip [data-streak-part]').textContent.trim(), freezes: document.querySelector('#streak-chip [data-freeze-part]').textContent.trim(),
                    divider: document.querySelectorAll('#streak-chip [data-chip] > span[aria-hidden="true"]').length, label: document.getElementById('streak-chip').getAttribute('aria-label'),
                    header: document.getElementById('app-header').scrollWidth - document.getElementById('app-header').clientWidth
                };
            });
            assert.equal(seen.gap, framed ? 18 : 12, `mezera mezi čipem a obrázkem hráče: ${JSON.stringify(seen)}`);
            assert.ok(seen.centre <= 0.6, 'čip je svisle vystředěný s obrázkem hráče');
            assert.deepEqual([seen.chipHeight, seen.touch], [36, 44], 'čip 36 px, dotyková plocha 44 px');
            assert.ok(seen.left >= 8, `čip se nedotýká štítku s úrovní (${seen.left} px)`);
            assert.equal(seen.header, 0, 'hlavička nepřetéká');
            assert.deepEqual([seen.streak, seen.freezes, seen.divider], [String(streak), streak ? '2' : '0', 1], 'plamen s počtem dní, čárka, štít s počtem ochran');
            assert.deepEqual(seen.icons.map(icon => [icon.src, icon.size, icon.loaded]), [['icons/topics/serie.webp', 24, true], ['icons/topics/ochrana-serie.webp', 24, true]], 'obrázky aplikace (plamen série, štít ochrany), stejně velké');
            assert.deepEqual(seen.font, ['12px', '900']);
            // Zlatý plamen (a modrý štít) jen s běžící sérií a ochranou; jinak mají obě ikony stejnou klidnou šedou
            assert.deepEqual(seen.icons.map(icon => icon.grey), streak ? [false, false] : [true, true], 'barevné jen s běžící sérií a ochranou, jinak šedé');
            assert.match(seen.label, streak ? /^Série: 12 dní v řadě, ochrana série: 2 z 2$/ : /^Série dní: zatím žádná, ochrana série: 0 z 2$/);
            // Stejný čip jako „N dnes aktivní“ u přátel: plocha, okraj, zaoblení a písmo
            await nav.go(tab, 'souperi');
            await tab.waitForSelector('[data-friends-active]');
            const same = await tab.evaluate(() => {
                const pick = (el) => { const style = getComputedStyle(el); return [style.backgroundColor, style.borderRadius, style.fontSize, style.fontWeight, style.boxShadow, Math.round(el.getBoundingClientRect().height)]; };
                return [pick(document.querySelector('#streak-chip [data-chip]')), pick(document.querySelector('[data-friends-active]'))];
            });
            assert.deepEqual(same[0], same[1], 'čip série vypadá stejně jako čip aktivních přátel');
            // Klepnutí má stejnou funkci jako dřív: vysvětlení ochrany série
            await tab.click('#streak-chip');
            await tab.waitForFunction(() => (document.getElementById('dialog-overlay') || { dataset: {} }).dataset.title === 'Série a ochrana série');
            assert.deepEqual(log.errors, []);
            assert.deepEqual(log.csp, []);
            await context.close();
        });
    }
});

// --- Snímky hlavních obrazovek ke schválení vzhledu: NAV_SHOTS=složka (jinak se přeskočí) ---
// Přihlášená hráčka s přáteli, čekající výzvou, hrou Dobývání, ve které má tahy, přihláškou do týdenního turnaje s hlasováním o tématu
// a čekající Truhlou Mudrlanta. Pět záložek na 390×780 a 360×640 tmavě a 390×780 světle, okna Výzvy a Turnaje, Soupeři bez účtu a otázka
// (spodní lišta je při hře skrytá). Snímky jsou PNG ve dvojnásobném rozlišení.
const NAV_SHOTS = process.env.NAV_SHOTS || '';
test('snímky hlavních obrazovek (NAV_SHOTS)', { skip: !chromium ? 'Playwright není nainstalovaný' : !NAV_SHOTS && 'bez NAV_SHOTS' }, async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    fs.mkdirSync(NAV_SHOTS, { recursive: true });
    const shot = async (tab, name) => {
        await tab.evaluate(() => { document.querySelectorAll('#celebration, #celebration-mini, #toast').forEach(el => el.remove()); });
        await tab.waitForFunction(() => [...document.querySelectorAll('#app-shell img')].every(img => img.complete));
        await tab.waitForTimeout(450);
        await tab.screenshot({ path: path.join(NAV_SHOTS, `${name}.png`) });
    };
    // Jen otevřený turnaj příštího týdne (přihláška hotová) a hlasování; dnes se nehraje žádný zápas
    const shotDb = () => {
        const db = newDb({ quizDone: true });
        db.tournaments = db.tournaments.filter(item => item.status === 'open');
        db.entries = db.entries.filter(entry => db.tournaments.some(item => item.id === entry.tournament_id));
        db.matches = [];
        // Žádost o přátelství od Evy nečeká (nahoře je jedna výzva a tahy v Dobývání)
        db.friendships = db.friendships.map(row => (row.user_id === EVA ? { ...row, status: 'accepted' } : row));
        return db;
    };
    // Běžný den hráčky: série 12 dní, tři dnešní otázky hotové, Truhla Mudrlanta čeká; odměny Sezóny vyzvednuté a Zlatá truhla ještě ne
    const shotStorage = () => {
        const rich = richStorage();
        const rewards = JSON.parse(rich['mudrlant.rewards']);
        rewards.season.claimed = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, 'xp:150']));
        const days = Array.from({ length: 12 }, (_, i) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10));
        const daily = { zemepis: Object.fromEntries(days.map(day => [day, { correct: true, points: 3, hintLevel: 2, levelCount: 5 }])) };
        for (const topic of ['historie', 'vlajky']) daily[topic] = { [TODAY]: { correct: topic === 'historie', points: topic === 'historie' ? 4 : 0, hintLevel: 1, levelCount: 5 } };
        return { 'mudrlant.rewards': JSON.stringify(rewards), 'mudrlant.gold': JSON.stringify({ v: 1, total: 14, correct: 11, found: 10, shards: 3, ready: 0, chests: 1, intro: true, last: 'frames:ruze' }),
            'mudrlant.stats': JSON.stringify({ daily, practice: { played: 420, correct: 330, points: 1100 } }) };
    };
    try {
        for (const [size, scheme] of [[{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light']]) {
            const key = `${size.width}x${size.height}-${scheme === 'dark' ? 'tmave' : 'svetle'}`;
            const { context, tab } = await setup(browser, { viewport: size, scheme, db: shotDb(), storage: shotStorage(), scale: 2 });
            await tab.waitForSelector('#friends-strip [data-player-id]', { timeout: 20000 });
            await tab.waitForSelector('#waiting-section');
            await tab.waitForFunction(() => /Tahy 4\/5/.test(document.getElementById('conquest-card').textContent) && /hlas/.test(document.getElementById('tournaments-tile').textContent));
            for (const id of ['dnes', 'hrat', 'souperi', 'postup', 'ja']) {
                await nav.go(tab, id);
                await shot(tab, `zalozka-${id}-${key}`);
            }
            if (scheme === 'dark') {
                await nav.challenges(tab);
                await tab.waitForSelector('#challenges-section [data-action="challenge-open"]');
                await tab.waitForSelector('#league-card');
                await shot(tab, `okno-vyzvy-${key}`);
                await nav.tournaments(tab);
                await tab.waitForSelector('#tournament-poll');
                await shot(tab, `okno-turnaje-${key}`);
            }
            if (size.height === 780 && scheme === 'dark') {
                // Otázka: šipka zpět a štítek tématu v hlavičce, lišta skrytá; po odpovědi je lišta zpátky
                await nav.topic(tab, 'zemepis');
                await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
                await shot(tab, `otazka-bez-listy-${key}`);
                await tab.click('[data-action="choice"] >> nth=0');
                await tab.waitForSelector('[data-verdict]');
                await tab.waitForSelector('#app-nav:not(.hidden)');
                await shot(tab, `vysledek-otazky-s-listou-${key}`);
                // Bleskovka: úvod s lištou, výsledek s lištou
                await tab.click('#app-nav [data-nav="hrat"]');
                await tab.waitForSelector('#mode-tiles');
                await tab.click('[data-action="mode-tile"][data-mode="blitz"]');
                await tab.waitForSelector('[data-mode-intro="blitz"]');
                await shot(tab, `bleskovka-uvod-s-listou-${key}`);
                await tab.click('[data-action="mode-start"]');
                await tab.waitForSelector('[data-mode-question][data-phase="question"]', { timeout: 30000 });
                await tab.click('[data-action="mode-quit"]');
                await tab.waitForSelector('[data-mode-result="blitz"]');
                await shot(tab, `bleskovka-vysledek-s-listou-${key}`);
                // Rozcestník Dobývání s lištou
                await tab.click('#app-nav [data-nav="souperi"]');
                await tab.waitForSelector('#conquest-card');
                await tab.click('#conquest-card');
                await tab.waitForSelector('#conquest-hub');
                await tab.waitForTimeout(600);
                await shot(tab, `dobyvani-rozcestnik-s-listou-${key}`);
            }
            await context.close();
        }
        // Barevná témata aplikace (odměny za úrovně): pět záložek v tématu Oceán (světle) a Hluboký les (tmavě)
        for (const [theme, scheme] of [['ocean', 'light'], ['les', 'dark']]) {
            const storage = { ...shotStorage(), 'mudrlant.look': JSON.stringify({ theme }) };
            const { context, tab } = await setup(browser, { viewport: { width: 390, height: 780 }, scheme, db: shotDb(), storage, scale: 2 });
            await tab.waitForSelector('#friends-strip [data-player-id]', { timeout: 20000 });
            assert.equal(await tab.evaluate(() => document.documentElement.dataset.theme), theme);
            for (const id of ['dnes', 'hrat', 'souperi', 'postup', 'ja']) {
                await nav.go(tab, id);
                await shot(tab, `tema-${theme}-${id}-390x780-${scheme === 'dark' ? 'tmave' : 'svetle'}`);
            }
            await context.close();
        }
        const guest = await setup(browser, { viewport: { width: 390, height: 780 }, scheme: 'dark', signedOut: true, storage: { 'mudrlant.progress': JSON.stringify({ xp: 2400, counters: {}, badges: {} }), 'mudrlant.learned': '{}', 'mudrlant.rewards': JSON.stringify({ v: 1, freezes: 0 }), 'mudrlant.gold': '{}', 'mudrlant.week': '{}' }, scale: 2 });
        await nav.go(guest.tab, 'souperi');
        await shot(guest.tab, 'zalozka-souperi-bez-uctu-390x780-tmave');
        await guest.context.close();
        // Hlavička zblízka: čip série vedle obrázku hráče s obrázkovým rámečkem i bez něj, se sérií i bez, na 360 a 390 px
        for (const [width, framed, streak, scheme] of [[360, true, 12, 'dark'], [390, true, 12, 'light'], [360, false, 0, 'dark'], [390, false, 0, 'light']]) {
            const db = shotDb();
            if (!framed) db.profiles[ME].frame = null;
            const storage = shotStorage();
            if (!streak) {
                const rewards = JSON.parse(storage['mudrlant.rewards']);
                rewards.freezes = 0;
                Object.assign(storage, { 'mudrlant.rewards': JSON.stringify(rewards), 'mudrlant.stats': JSON.stringify({ daily: {}, practice: { played: 1, correct: 1, points: 1 } }) });
            }
            if (!framed) storage['mudrlant.look'] = JSON.stringify({ frame: 'zadny' });
            const { context, tab } = await setup(browser, { viewport: { width, height: 640 }, scheme, db, storage, start: 'dnes', scale: 2 });
            await tab.waitForSelector('#streak-chip');
            await tab.waitForFunction((want) => Boolean(document.querySelector('#btn-settings .frame-art')) === want, framed, { timeout: 15000 });
            await tab.waitForTimeout(500);
            await tab.screenshot({ path: path.join(NAV_SHOTS, `hlavicka-${width}-${framed ? 'ramecek' : 'bez-ramecku'}-${streak ? 'serie' : 'bez-serie'}-${scheme === 'dark' ? 'tmave' : 'svetle'}.png`), clip: { x: 0, y: 0, width, height: 84 } });
            await context.close();
        }
    } finally {
        await browser.close();
    }
});
