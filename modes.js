// Režimy pro jednoho hráče: Bleskovka (60 sekund, co nejvíc správných odpovědí) a Přežití (tři životy, otázky postupně těžší).
// Čistá logika bez DOMu: pravidla, hodiny Bleskovky, obtížnost Přežití, rekordy a XP s denním stropem.
// Rekordy se ukládají jen v zařízení (mudrlant.modes): do účtu se synchronizují jen XP a odznaky, ne statistiky.
// Obrazovky režimů kreslí app.js (oddíl „Bleskovka a Přežití“), zvuky a vibrace sound.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantModes = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const STORAGE_KEY = 'mudrlant.modes';
    const IDS = ['blitz', 'survival'];

    // feedback = jak dlouho (ms) zůstane po odpovědi vidět správná a špatná odpověď, než přijde další otázka
    // xpPer = XP za každou správnou odpověď (Bleskovka) či přežitou otázku (Přežití); hodnoty jsou záměrně nižší než v běžné hře
    // (tam správná odpověď dá 10 XP + 5 za bod), protože otázka tu trvá pár sekund a nečte se výsledek
    const MODES = {
        blitz: {
            id: 'blitz', title: 'Bleskovka', titleAcc: 'Bleskovku', icon: 'zap', seconds: 60, penalty: 3, xpPer: 3,
            tagline: '60 sekund, co nejvíc správných odpovědí',
            unit: ['správná odpověď', 'správné odpovědi', 'správných odpovědí'],
            xpUnit: ['správnou odpověď', 'správné odpovědi', 'správných odpovědí'],
            feedback: { correct: 350, wrong: 900 }
        },
        survival: {
            id: 'survival', title: 'Přežití', titleAcc: 'Přežití', icon: 'heart', lives: 3, xpPer: 4,
            tagline: 'Tři životy, otázky postupně těžší',
            unit: ['přežitá otázka', 'přežité otázky', 'přežitých otázek'],
            xpUnit: ['přežitou otázku', 'přežité otázky', 'přežitých otázek'],
            feedback: { correct: 500, wrong: 1700 }
        }
    };
    // Denní strop XP za každý režim zvlášť (bez bonusu za rekord), proti „farmení“; rekordy se počítají dál i po stropu
    const DAILY_XP_CAP = 150;
    // Bonus za překonaný rekord (tématu nebo celkový): jednou denně v každém režimu
    const RECORD_XP = 20;
    // Tikání v posledních sekundách Bleskovky
    const TICK_FROM = 5;
    // Přežití: prvních EASY_QUESTIONS otázek jen ze známých položek, pak během RAMP_QUESTIONS otázek přibývají méně známé,
    // až se vybírá z celé sady (všechny položky stejně, takže převáží méně známé – jich je víc)
    const EASY_QUESTIONS = 5;
    const RAMP_QUESTIONS = 20;

    const plural = (count, [one, few, many]) => {
        const n = Math.abs(count);
        return `${count} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
    };
    const scoreLabel = (id, score) => plural(score, MODES[id].unit);

    // Pravidla do úvodní obrazovky režimu (ikona Lucide a věta)
    const rules = (id) => id === 'blitz' ? [
        { icon: 'timer', text: `${MODES.blitz.seconds} sekund – odpověz správně na co nejvíc otázek` },
        { icon: 'layout-grid', text: 'Vždy výběr ze 4 možností, bez nápověd' },
        { icon: 'circle-x', text: `Špatná odpověď ubere ${MODES.blitz.penalty} sekundy` },
        { icon: 'hourglass', text: 'Čas běží, jen když je vidět otázka' }
    ] : [
        { icon: 'heart', text: `${MODES.survival.lives} životy – každá chyba jeden ubere` },
        { icon: 'gauge', text: 'Začíná se známými, postupně přibývají těžší' },
        { icon: 'layout-grid', text: 'Vždy výběr ze 4 možností, bez nápověd a bez spěchu' },
        { icon: 'trophy', text: 'Hraje se, dokud máš aspoň jeden život' }
    ];

    // --- Hodiny Bleskovky: { left: zbývající ms, since: kdy se naposledy rozběhly, null = stojí } ---
    const createClock = (seconds = MODES.blitz.seconds) => ({ left: Math.max(0, seconds) * 1000, since: null });
    const clockLeft = (clock, now) => Math.max(0, clock.left - (clock.since === null ? 0 : Math.max(0, now - clock.since)));
    const clockRunning = (clock) => clock.since !== null;
    const startClock = (clock, now) => clock.since === null ? { left: clockLeft(clock, now), since: now } : clock;
    const pauseClock = (clock, now) => ({ left: clockLeft(clock, now), since: null });
    // Trest za špatnou odpověď: ubere čas (nikdy pod nulu); běžící hodiny běží dál
    const penalize = (clock, ms, now) => ({ left: Math.max(0, clockLeft(clock, now) - Math.max(0, ms)), since: clock.since === null ? null : now });
    // Zobrazené celé sekundy (2,1 s = „3“, až nula je konec)
    const secondsShown = (ms) => Math.max(0, Math.ceil(ms / 1000));
    // Tik, když se zobrazená sekunda změnila na 5, 4, 3, 2 nebo 1 (po trestu z 9 na 6 se netiká, z 7 na 4 jednou);
    // vrátí sekundu, za kterou tiknout, jinak 0
    const tickDue = (before, after) => after < before && after >= 1 && after <= TICK_FROM ? after : 0;

    // --- Přežití: podíl méně známých položek podle počtu už položených otázek (0 → 1) ---
    const hardShare = (asked) => Math.min(1, Math.max(0, (Math.max(0, asked) - EASY_QUESTIONS + 1) / RAMP_QUESTIONS));
    // Známost další otázky: 'known' (jen známé) nebo 'all' (celá sada); rng = Math.random nebo semínko v testech
    const survivalTier = (asked, rng = Math.random) => {
        const share = hardShare(asked);
        return share > 0 && rng() < share ? 'all' : 'known';
    };
    // Popisek obtížnosti pro hráče
    const difficultyLabel = (asked) => {
        const share = hardShare(asked);
        return share <= 0 ? 'Známé' : share >= 1 ? 'Celá sada' : 'Přibývají těžší';
    };

    // Otázka jde hrát v režimu, jen když má aspoň dvě možnosti a právě jedna je správná
    // (budoucí druhy otázek bez výběru z možností se v režimech přeskočí)
    const playable = (data) => Boolean(data && data.question && Array.isArray(data.question.choices)
        && data.question.choices.length >= 2 && data.question.choices.filter(choice => choice && choice.correct).length === 1);

    // --- Uložený stav: rekordy (best = podle tématu nebo 'mix', top = celkový), počty her a dnešní XP ---
    const SCOPE = /^[a-z0-9-]{1,30}$/;
    const count = (value, max = 100000) => Number.isFinite(value) && value > 0 ? Math.min(max, Math.floor(value)) : 0;
    const emptyMode = () => ({ best: {}, top: 0, games: 0, total: 0 });
    const emptyDay = () => ({ blitz: 0, survival: 0 });
    const parse = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const state = { v: 1, day: typeof data.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : '', xp: emptyDay(), bonus: { blitz: false, survival: false } };
        for (const id of IDS) {
            const saved = data[id] && typeof data[id] === 'object' ? data[id] : {};
            const best = {};
            for (const [scope, value] of Object.entries(saved.best && typeof saved.best === 'object' ? saved.best : {})) {
                if (SCOPE.test(scope) && count(value, 10000)) best[scope] = count(value, 10000);
            }
            const top = Math.max(count(saved.top, 10000), ...Object.values(best), 0);
            state[id] = { best, top, games: count(saved.games), total: count(saved.total, 10000000) };
            state.xp[id] = data.xp ? count(data.xp[id], 100000) : 0;
            state.bonus[id] = Boolean(data.bonus && data.bonus[id] === true);
        }
        return state;
    };
    // Nový den: dnešní XP a bonus za rekord od nuly
    const forDay = (state, dayKey) => state.day === dayKey ? state : { ...state, day: dayKey, xp: emptyDay(), bonus: { blitz: false, survival: false } };
    const scopeOf = (pool) => pool && pool.kind === 'topic' && SCOPE.test(String(pool.topic || '')) ? pool.topic : 'mix';
    const recordsOf = (state, id, scope) => ({ scope: (state[id].best[scope] || 0), overall: state[id].top, games: state[id].games });
    // Kolik XP za režim dnes ještě zbývá (bez bonusu za rekord)
    const xpLeftToday = (state, id, dayKey) => Math.max(0, DAILY_XP_CAP - forDay(state, dayKey).xp[id]);

    // Konec hry: zapíše rekordy a dnešní XP. Vrátí nový stav, rekordy před hrou a po ní, zda padl rekord a XP s rozpisem
    // („+N XP za …“ jako u běžné otázky). Rekord se slaví, jen když hráč překonal dřívější (první hra rekord teprve založí).
    const finish = (state, id, scope, score, dayKey) => {
        const mode = MODES[id];
        const points = count(score, 10000);
        const day = forDay(state, dayKey);
        const before = recordsOf(day, id, scope);
        const scopeRecord = points > before.scope && before.scope > 0;
        const overallRecord = points > before.overall && before.overall > 0;
        const firstRecord = before.scope === 0 && points > 0;
        const best = { ...day[id].best };
        if (points > (best[scope] || 0)) best[scope] = points;
        const earned = points * mode.xpPer;
        const room = Math.max(0, DAILY_XP_CAP - day.xp[id]);
        const paid = Math.min(earned, room);
        const parts = [];
        if (paid > 0) parts.push({ label: `za ${plural(points, mode.xpUnit)}${paid < earned ? ` (dnešní strop ${DAILY_XP_CAP} XP)` : ''}`, xp: paid });
        const bonus = (scopeRecord || overallRecord) && !day.bonus[id] ? RECORD_XP : 0;
        if (bonus) parts.push({ label: 'za nový rekord', xp: bonus });
        const capped = earned > paid;
        const note = !capped ? '' : paid > 0
            ? `Dnešní strop ${DAILY_XP_CAP} XP za ${mode.titleAcc} je naplněný.`
            : `Dnešní strop ${DAILY_XP_CAP} XP za ${mode.titleAcc} je vyčerpaný – rekordy se počítají dál.`;
        const next = {
            ...day,
            [id]: { best, top: Math.max(day[id].top, points), games: day[id].games + 1, total: day[id].total + points },
            xp: { ...day.xp, [id]: day.xp[id] + paid },
            bonus: { ...day.bonus, [id]: day.bonus[id] || bonus > 0 }
        };
        return {
            state: next, score: points, before, after: recordsOf(next, id, scope),
            scopeRecord, overallRecord, record: scopeRecord || overallRecord, firstRecord,
            xp: { total: paid + bonus, parts, note }
        };
    };

    return {
        STORAGE_KEY, IDS, MODES, DAILY_XP_CAP, RECORD_XP, TICK_FROM, EASY_QUESTIONS, RAMP_QUESTIONS,
        plural, scoreLabel, rules, createClock, clockLeft, clockRunning, startClock, pauseClock, penalize, secondsShown, tickDue,
        hardShare, survivalTier, difficultyLabel, playable, parse, forDay, scopeOf, recordsOf, xpLeftToday, finish
    };
});
