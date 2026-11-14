// Týdenní cíle: čistá logika bez DOMu. Každý týden (od pondělí podle pražského času) se ze semínka týdne vylosují tři cíle,
// každý s cílovou hodnotou a odměnou v XP; za všechny tři je bonus, odznak „Týdenní cíle“ (počítadlo weeksDone) a Truhla Mudrlanta (rewards.js).
// Postup se počítá z běžných počítadel postupu rozdílem od snímku uloženého na začátku týdne (mudrlant.goals).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantGoals = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const COUNT = 3;
    const BONUS_XP = 200;
    const REWARDS = [50, 100, 150];

    // --- Týden (pondělí podle Prahy) ---
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    const parseDay = (day) => {
        const match = DAY_PATTERN.exec(String(day || ''));
        return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
    };
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const pragueDay = (now = new Date()) => {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
            const get = (type) => (parts.find(part => part.type === type) || {}).value;
            const text = `${get('year')}-${get('month')}-${get('day')}`;
            if (Number.isFinite(parseDay(text))) return text;
        } catch (error) { /* bez Intl se vezme UTC */ }
        return dayOf(now.getTime());
    };
    // Klíč týdne = jeho pondělí (RRRR-MM-DD)
    const weekKey = (now = new Date()) => {
        const day = pragueDay(now);
        const time = parseDay(day);
        const weekday = (new Date(time).getUTCDay() + 6) % 7;
        return dayOf(time - weekday * 86400000);
    };
    const formatDay = (day) => { const time = parseDay(day); return Number.isFinite(time) ? `${new Date(time).getUTCDate()}. ${new Date(time).getUTCMonth() + 1}.` : ''; };
    // „3. 11. – 9. 11.“
    const weekLabel = (week) => `${formatDay(week)} – ${formatDay(dayOf(parseDay(week) + 6 * 86400000))}`;
    // Kolik dní do konce týdne zbývá (včetně dneška): 7 v pondělí, 1 v neděli
    const daysLeft = (now = new Date()) => 7 - Math.round((parseDay(pragueDay(now)) - parseDay(weekKey(now))) / 86400000);

    // --- Losování ---
    const hashOf = (text) => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const seededRandom = (seedText) => {
        let state = hashOf(seedText) || 1;
        return () => {
            state = (state + 0x6D2B79F5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    // Druhy cílů: metric = klíč v počítadlech (topics.<téma> pro téma), multi = jen s hrou více hráčů (přihlášení),
    // xp = odměna (50 lehký, 100 střední, 150 těžký); needs = jen když aplikace danou část má (quiz = Kvíz dne, modes = Bleskovka
    // a Přežití, numeric = otázky Seřaď a Odhadni); perDay = nejvýš jednou denně (cíl se nelosuje, když týden na něj nemá dost dní);
    // group = z jedné skupiny nejvýš jeden cíl za týden (Bleskovka nebo Přežití)
    const KINDS = [
        { id: 'spravne', icon: 'target', target: 40, xp: 100, metric: 'correct', title: (t) => `Odpověz správně na ${plural(t, 'otázku', 'otázky', 'otázek')}` },
        { id: 'tema', icon: 'medal', target: 20, xp: 100, topic: true, metric: (topic) => `topics.${topic.id}`, title: (t, topic) => `${plural(t, 'správná odpověď', 'správné odpovědi', 'správných odpovědí')} v tématu ${topic.title}` },
        { id: 'dnesni', icon: 'calendar-days', target: 10, xp: 50, metric: 'dailyCorrect', title: (t) => `Odpověz správně na ${plural(t, 'dnešní otázku', 'dnešní otázky', 'dnešních otázek')}` },
        { id: 'bez-napovedy', icon: 'eye-off', target: 15, xp: 100, metric: 'noHint', title: (t) => `Odpověz správně na ${plural(t, 'otázku', 'otázky', 'otázek')} bez nápovědy` },
        { id: 'dny', icon: 'calendar-check', target: 4, xp: 50, perDay: true, metric: 'days', title: (t) => `Hrej ${plural(t, 'den', 'různé dny', 'různých dní')}` },
        { id: 'poznane', icon: 'book-open', target: 15, xp: 100, metric: 'learned', title: (t) => `Poznej ${plural(t, 'novou položku', 'nové položky', 'nových položek')}` },
        { id: 'opakovani', icon: 'repeat', target: 20, xp: 100, metric: 'reviewed', title: (t) => `Procvič ${plural(t, 'špatnou odpověď', 'špatné odpovědi', 'špatných odpovědí')}` },
        { id: 'chyby', icon: 'repeat', target: 10, xp: 50, metric: 'fixed', title: (t) => `Oprav ${plural(t, 'dřívější chybu', 'dřívější chyby', 'dřívějších chyb')}` },
        { id: 'vyzvy', icon: 'swords', target: 3, xp: 100, multi: true, metric: 'challenges', title: (t) => `Dohraj ${plural(t, 'výzvu', 'výzvy', 'výzev')}` },
        { id: 'vyhry', icon: 'trophy', target: 2, xp: 150, multi: true, metric: 'wins', title: (t) => `Vyhraj ${plural(t, 'výzvu', 'výzvy', 'výzev')}` },
        { id: 'turnaj', icon: 'trophy', target: 1, xp: 150, multi: true, metric: 'tourPlayed', title: () => 'Odehraj turnajové kolo' },
        { id: 'kviz', icon: 'timer', target: 3, xp: 100, needs: 'quiz', perDay: true, metric: 'quizDone', title: (t) => `Zahraj Kvíz dne ${t}×` },
        { id: 'bleskovka', icon: 'zap', target: 1, xp: 50, needs: 'modes', group: 'rezimy', metric: 'blitzTen', title: () => 'Bleskovka: aspoň 10 správně v jedné hře' },
        { id: 'preziti', icon: 'heart', target: 1, xp: 100, needs: 'modes', group: 'rezimy', metric: 'survivalFifteen', title: () => 'Přežij 15 otázek v jedné hře Přežití' },
        { id: 'serad', icon: 'list-ordered', target: 3, xp: 150, needs: 'numeric', metric: 'orderPerfect', title: (t) => `Seřaď ${t}× bez chyby` }
    ];
    // Cíl jde hrát: hra více hráčů, potřebná část aplikace, téma, vypnuté druhy (skip), dost dní do konce týdne
    const available = (kind, { topics = [], multiplayer = false, skip = [], quiz = false, modes = false, numeric = false, daysLeft = 7 } = {}) =>
        (multiplayer || !kind.multi) && (!kind.topic || topics.length > 0) && !skip.includes(kind.id)
        && (!kind.needs || Boolean({ quiz, modes, numeric }[kind.needs])) && (!kind.perDay || kind.target <= daysLeft);
    const build = (kind, topic) => ({ id: topic ? `${kind.id}-${topic.id}` : kind.id, kind: kind.id, icon: kind.icon, target: kind.target, xp: kind.xp, metric: typeof kind.metric === 'function' ? kind.metric(topic) : kind.metric, title: kind.title(kind.target, topic) });
    const sortGoals = (goals) => goals.sort((a, b) => a.xp - b.xp || a.id.localeCompare(b.id));
    // Tři různé cíle týdne; stejné semínko (týden a nabídka cílů) = stejné cíle, seřazené od nejlehčího. Aplikace vybrané cíle uloží
    // do stavu týdne (goals), takže se během týdne nezmění, ani když se nabídka změní (přihlášení, vypnuté opakování)
    const weeklyGoals = (week, options = {}) => {
        const topics = options.topics || [];
        const rng = seededRandom(`mudrlant-cile-${week}`);
        const pool = KINDS.filter(kind => available(kind, options));
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const groups = new Set();
        const picked = pool.filter(kind => {
            if (kind.group && groups.has(kind.group)) return false;
            if (kind.group) groups.add(kind.group);
            return true;
        }).slice(0, COUNT);
        return sortGoals(picked.map(kind => build(kind, kind.topic ? topics[Math.floor(rng() * topics.length)] : null)));
    };
    // Uložené cíle týdne zpět z id (tema-historie = cíl na téma Historie); null, když některý už neplatí (neznámý druh či téma,
    // nedostupný: odhlášený hráč u výzev, vypnuté opakování) – pak se vylosují znovu
    const goalsFromIds = (ids, options = {}) => {
        if (!Array.isArray(ids) || ids.length !== COUNT) return null;
        const topics = options.topics || [];
        const list = ids.map(id => {
            const kind = KINDS.find(entry => (entry.topic ? String(id).startsWith(`${entry.id}-`) : entry.id === id));
            if (!kind || !available(kind, { ...options, daysLeft: 7 })) return null;
            const topic = kind.topic ? topics.find(entry => `${kind.id}-${entry.id}` === id) : null;
            return kind.topic && !topic ? null : build(kind, topic);
        });
        return list.every(Boolean) && new Set(list.map(goal => goal.kind)).size === COUNT ? sortGoals(list) : null;
    };
    // Cíle stavu týdne: uložené, jinak vylosované (stav ze starší verze bez uložených cílů = jen druhy cílů, které znala)
    const goalsFor = (state, options = {}) => goalsFromIds(state && state.goals, options)
        || weeklyGoals(state.week, state.legacy ? { ...options, quiz: false, modes: false, numeric: false, daysLeft: 7 } : options);

    // --- Postup ---
    const number = (value) => (Number.isFinite(value) ? value : 0);
    // Hodnota metriky: „topics.historie“ = počítadlo tématu
    const valueOf = (metrics, key) => {
        if (!metrics) return 0;
        if (key.startsWith('topics.')) return number(Number((metrics.topics || {})[key.slice(7)]));
        return number(Number(metrics[key]));
    };
    // Snímek počítadel pro rozdíl: jen čísla a počítadla témat
    const snapshotOf = (metrics) => {
        const snapshot = {};
        for (const [key, value] of Object.entries(metrics || {})) if (typeof value === 'number' && Number.isFinite(value)) snapshot[key] = value;
        snapshot.topics = Object.fromEntries(Object.entries((metrics && metrics.topics) || {}).filter(([, value]) => Number.isFinite(value)));
        return snapshot;
    };
    // Stav týdne z úložiště: nový týden (nebo nic uloženého) = nový snímek a nic splněného
    const ensureState = (saved, week, metrics) => {
        if (saved && saved.week === week && saved.snapshot && typeof saved.snapshot === 'object') {
            const kept = { week, snapshot: saved.snapshot, claimed: Array.isArray(saved.claimed) ? saved.claimed.filter(id => typeof id === 'string') : [], bonus: saved.bonus === true };
            // Uložené cíle týdne; stav bez nich (ze starší verze) se pozná podle legacy
            if (Array.isArray(saved.goals) && saved.goals.length === COUNT && saved.goals.every(id => typeof id === 'string')) kept.goals = saved.goals.slice();
            else kept.legacy = true;
            return kept;
        }
        return { week, snapshot: snapshotOf(metrics), claimed: [], bonus: false };
    };
    const progressOf = (goal, state, metrics) => Math.max(0, Math.min(goal.target, valueOf(metrics, goal.metric) - valueOf(state.snapshot, goal.metric)));
    const progress = (goals, state, metrics) => goals.map(goal => {
        const value = progressOf(goal, state, metrics);
        return { goal, value, done: value >= goal.target, claimed: state.claimed.includes(goal.id) };
    });
    // Nově splněné cíle (odměna jen jednou) a bonus za všechny tři (také jednou); vrátí nový stav a co připsat
    const settle = (state, goals, metrics) => {
        const rows = progress(goals, state, metrics);
        const awards = rows.filter(row => row.done && !row.claimed).map(row => ({ id: row.goal.id, title: row.goal.title, xp: row.goal.xp }));
        const claimed = [...state.claimed, ...awards.map(award => award.id)];
        const allDone = goals.length > 0 && goals.every(goal => claimed.includes(goal.id));
        const bonus = allDone && !state.bonus ? BONUS_XP : 0;
        const next = { ...state, claimed, bonus: state.bonus || bonus > 0 };
        return { state: next, awards, bonus, xp: awards.reduce((sum, award) => sum + award.xp, 0) + bonus, allDone };
    };

    return { COUNT, BONUS_XP, REWARDS, KINDS, pragueDay, weekKey, weekLabel, daysLeft, seededRandom, available, weeklyGoals, goalsFromIds, goalsFor, valueOf, snapshotOf, ensureState, progress, settle };
});
