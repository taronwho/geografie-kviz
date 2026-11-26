// Statistiky pro nadšence: podrobná čísla o hraní v jednom okně (Postup → dlaždice Statistiky). Čistá logika a HTML z dat, bez úložiště a bez DOMu.
// Aplikace (app.js) si v mudrlant.statistiky vede od nasazení lehký souhrn odpovědí (record): dny, témata a okruhy, obtížnost (známější a méně
// známé položky), nápovědy, způsob odpovědi, druh hry, dobu odpovědi a záměny (správná odpověď → co hráč odpověděl). Sbírá se jen dopředu.
// Starší údaje se doplní z toho, co aplikace pamatuje odjakživa: dny a úspěšnost z kroniky (mudrlant.week, 70 dní) a z dnešních otázek
// (mudrlant.stats daily, i s okruhem) a Kvízu dne; rekordy z počítadel postupu (mudrlant.progress), Bleskovky a Přežití (mudrlant.modes),
// Kvízu dne, Tajemné otázky a Řetězovky. Vše jen v zařízení, do účtu se nesynchronizuje.
// Grafy jsou SVG s barvami přes třídy (CSP bez inline stylů), každé číslo je i jako text. Testy: tests/statistiky.test.js, tests/e2e-statistiky.test.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantStatistiky = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const KEY = 'mudrlant.statistiky';
    // Kolik dní souhrnu se drží (tři roky; den je pár bajtů)
    const KEEP_DAYS = 1100;
    // Nejvýš tolik různých záměn; při přeplnění zmizí nejméně častá (při shodě nejstarší)
    const MAX_PAIRS = 150;
    // Odpověď delší než dvě minuty (hráč nejspíš odběhl) se do průměrné doby nepočítá, jen do počtu
    const SLOW_MS = 120000;
    // Hranice košů doby odpovědi (ms): do 5 s, 5–10 s, 10–20 s, 20–40 s, 40 s – 2 min, déle
    const TIME_EDGES = [5000, 10000, 20000, 40000, SLOW_MS];
    const TIME_LABELS = ['do 5 s', '5–10 s', '10–20 s', '20–40 s', '40 s – 2 min', 'déle než 2 min'];
    // Kalendář hraní: posledních tolik týdnů (vejde se na šířku telefonu 360 px); úrovně podle počtu odpovědí za den
    const HEAT_WEEKS = 22;
    const HEAT_STEPS = [1, 10, 25, 50];
    // Graf vývoje: posledních 12 týdnů nebo 12 měsíců
    const TREND_COUNT = 12;
    // Druh hry (mode v app.js) → popisek; neznámý druh = Trénink
    const MODES = ['daily', 'practice', 'challenge', 'quiz'];
    const MODE_LABELS = { daily: 'Dnešní otázky', practice: 'Trénink a učení', challenge: 'Výzvy a turnaj', quiz: 'Kvíz dne' };
    // Odpověď bez okruhu (Odhadni číslo, Časové souvislosti)
    const NO_CATEGORY = '-';
    const NO_CATEGORY_LABEL = 'Ostatní otázky';
    const TABS = [['prehled', 'Přehled'], ['temata', 'Témata'], ['vyvoj', 'Vývoj'], ['zameny', 'Záměny'], ['rekordy', 'Rekordy']];
    const SORT_KEYS = ['title', 'answered', 'correct', 'rate', 'learned'];

    // --- Dny (klíče RRRR-MM-DD podle pražského dne z aplikace) ---
    const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
    const DAY_MS = 86400000;
    const parseDay = (day) => { const m = DAY.exec(String(day || '')); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN; };
    const isDay = (day) => typeof day === 'string' && Number.isFinite(parseDay(day)) && new Date(parseDay(day)).toISOString().slice(0, 10) === day;
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const addDays = (day, count) => dayOf(parseDay(day) + count * DAY_MS);
    const weekday = (day) => (new Date(parseDay(day)).getUTCDay() + 6) % 7;
    const weekOf = (day) => addDays(day, -weekday(day));
    const monthOf = (day) => day.slice(0, 7);
    const shortDay = (day) => { const d = new Date(parseDay(day)); return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`; };
    const longDay = (day) => `${shortDay(day)} ${day.slice(0, 4)}`;
    const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
    const MONTHS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
    const monthLabel = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
    const prevMonth = (month) => { const y = Number(month.slice(0, 4)); const m = Number(month.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

    // --- Čísla a čeština ---
    const whole = (value, max = 1e9) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
    const NBSP = ' ';
    const num = (value) => Number(value || 0).toLocaleString('cs-CZ');
    // Úspěšnost vždy na jedno desetinné místo („73,4 %“), bez odpovědí pomlčka
    const rateOf = (correct, answered) => (answered > 0 ? Math.round(correct * 1000 / answered) / 10 : null);
    const pct = (rate) => (rate === null || rate === undefined ? '–' : `${rate.toFixed(1).replace('.', ',')}${NBSP}%`);
    const seconds = (ms) => `${(Math.round(ms / 100) / 10).toFixed(1).replace('.', ',')}${NBSP}s`;
    const plural = (count, one, few, many) => { const n = Math.abs(count); return n === 1 ? one : n >= 2 && n <= 4 ? few : many; };
    const answersWord = (count) => `${num(count)}${NBSP}${plural(count, 'odpověď', 'odpovědi', 'odpovědí')}`;
    const daysWord = (count) => `${num(count)}${NBSP}${plural(count, 'den', 'dny', 'dní')}`;
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const TOPIC = /^[a-z0-9-]{1,24}$/;
    const CATEGORY = /^[a-z0-9_-]{1,30}$/;
    const cleanLabel = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : '');
    const pair = (value) => (Array.isArray(value) ? [whole(value[0]), Math.min(whole(value[0]), whole(value[1]))] : [0, 0]);

    // --- Uložený souhrn ---
    // { v: 1, since: první den záznamu, days: { den: [odpovědi, správně] }, t: { téma: { okruh: [odpovědi, správně] } },
    //   m: { druh hry: [o, s] }, k: { known: [o, s], hard: [o, s] }, h: [[o, s] × 5 podle počtu nápověd 0–4], w: { choices: [o, s], typed: [o, s] },
    //   ms: { sum, n (do 2 min), slow (déle), cs, cn (správné do 2 min), b: [6 košů] },
    //   x: { 'téma|správně id|odpověď id': [kolikrát, správně text, odpověď text, poslední den] } }
    const empty = () => ({ v: 1, since: '', days: {}, t: {}, m: {}, k: { known: [0, 0], hard: [0, 0] }, h: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
        w: { choices: [0, 0], typed: [0, 0] }, ms: { sum: 0, n: 0, slow: 0, cs: 0, cn: 0, b: [0, 0, 0, 0, 0, 0] }, x: {} });
    const parse = (raw) => {
        const state = empty();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
        if (isDay(raw.since)) state.since = raw.since;
        if (raw.days && typeof raw.days === 'object') {
            Object.keys(raw.days).filter(isDay).sort().slice(-KEEP_DAYS).forEach(day => { const p = pair(raw.days[day]); if (p[0]) state.days[day] = p; });
        }
        if (raw.t && typeof raw.t === 'object') {
            for (const [topic, cats] of Object.entries(raw.t)) {
                if (!TOPIC.test(topic) || !cats || typeof cats !== 'object') continue;
                const row = {};
                for (const [cat, value] of Object.entries(cats)) { const p = pair(value); if ((CATEGORY.test(cat) || cat === NO_CATEGORY) && p[0]) row[cat] = p; }
                if (Object.keys(row).length) state.t[topic] = row;
            }
        }
        if (raw.m && typeof raw.m === 'object') for (const id of MODES) { const p = pair(raw.m[id]); if (p[0]) state.m[id] = p; }
        if (raw.k && typeof raw.k === 'object') { state.k.known = pair(raw.k.known); state.k.hard = pair(raw.k.hard); }
        if (Array.isArray(raw.h)) state.h = state.h.map((_, i) => pair(raw.h[i]));
        if (raw.w && typeof raw.w === 'object') { state.w.choices = pair(raw.w.choices); state.w.typed = pair(raw.w.typed); }
        if (raw.ms && typeof raw.ms === 'object') {
            const ms = raw.ms;
            state.ms = { sum: whole(ms.sum, 1e13), n: whole(ms.n), slow: whole(ms.slow), cs: whole(ms.cs, 1e13), cn: Math.min(whole(ms.cn), whole(ms.n)),
                b: state.ms.b.map((_, i) => whole(Array.isArray(ms.b) ? ms.b[i] : 0)) };
        }
        if (raw.x && typeof raw.x === 'object') {
            for (const [key, value] of Object.entries(raw.x)) {
                if (!Array.isArray(value) || !/^[a-z0-9-]{1,24}\|[^|]{1,40}\|[^|]{1,40}$/.test(key)) continue;
                const right = cleanLabel(value[1]);
                const wrong = cleanLabel(value[2]);
                if (whole(value[0]) && right && wrong) state.x[key] = [whole(value[0]), right, wrong, isDay(value[3]) ? value[3] : ''];
            }
        }
        return state;
    };
    const bump = (target, correct) => { target[0] += 1; if (correct) target[1] += 1; };
    // Zapíše jednu odpověď. event: { topic, category, correct, gaveUp, typed, hints (0–4), known (true | false | null), ms (null = neznámo),
    //   mode ('daily' | 'practice' | 'challenge' | 'quiz'), right: { id, label } (správná odpověď), wrong: { id, label } (zvolená jiná položka) }.
    // Vrátí nový stav (starý se nemění); bez platného dne nebo tématu ho vrátí beze změny.
    const record = (stateInput, event = {}, day) => {
        const state = parse(stateInput);
        if (!isDay(day) || !TOPIC.test(String(event.topic || ''))) return state;
        const correct = event.correct === true;
        if (!state.since) state.since = day;
        const today = state.days[day] ? state.days[day].slice() : [0, 0];
        bump(today, correct);
        state.days[day] = today;
        const cut = addDays(day, -(KEEP_DAYS - 1));
        for (const key of Object.keys(state.days)) if (key < cut) delete state.days[key];
        const cat = CATEGORY.test(String(event.category || '')) ? event.category : NO_CATEGORY;
        const topic = state.t[event.topic] || (state.t[event.topic] = {});
        const cell = topic[cat] ? topic[cat].slice() : [0, 0];
        bump(cell, correct);
        topic[cat] = cell;
        const mode = MODES.includes(event.mode) ? event.mode : 'practice';
        const modeCell = state.m[mode] ? state.m[mode].slice() : [0, 0];
        bump(modeCell, correct);
        state.m[mode] = modeCell;
        if (event.known === true) bump(state.k.known, correct);
        else if (event.known === false) bump(state.k.hard, correct);
        const hints = Number.isInteger(event.hints) ? Math.max(0, Math.min(4, event.hints)) : 0;
        bump(state.h[hints], correct);
        bump(state.w[event.typed ? 'typed' : 'choices'], correct);
        const ms = Number(event.ms);
        if (event.ms !== null && event.ms !== undefined && Number.isFinite(ms) && ms >= 0 && !event.gaveUp) {
            const bucket = TIME_EDGES.findIndex(edge => ms < edge);
            state.ms.b[bucket === -1 ? TIME_EDGES.length : bucket] += 1;
            if (ms >= SLOW_MS) state.ms.slow += 1;
            else {
                state.ms.sum += Math.round(ms);
                state.ms.n += 1;
                if (correct) { state.ms.cs += Math.round(ms); state.ms.cn += 1; }
            }
        }
        const right = event.right || {};
        const wrong = event.wrong || {};
        const rightId = String(right.id || '');
        const wrongId = String(wrong.id || '');
        if (!correct && !event.gaveUp && rightId && wrongId && rightId !== wrongId && !/\|/.test(rightId + wrongId)
            && rightId.length <= 40 && wrongId.length <= 40 && cleanLabel(right.label) && cleanLabel(wrong.label)) {
            const key = `${event.topic}|${rightId}|${wrongId}`;
            const before = state.x[key];
            state.x[key] = [(before ? before[0] : 0) + 1, cleanLabel(right.label), cleanLabel(wrong.label), day];
            const keys = Object.keys(state.x);
            if (keys.length > MAX_PAIRS) {
                // Ven jde nejméně častá záměna, při shodě ta s nejstarším posledním výskytem (nikdy ne právě zapsaná)
                const drop = keys.filter(other => other !== key).sort((a, b) => state.x[a][0] - state.x[b][0] || (state.x[a][3] < state.x[b][3] ? -1 : state.x[a][3] > state.x[b][3] ? 1 : 0))[0];
                delete state.x[drop];
            }
        }
        return state;
    };

    // --- Dny hraní: vlastní souhrn, jinak kronika, jinak dnešní otázky a Kvíz dne ---
    // legacy = { daily: { téma: { den: { correct, category } } }, quiz: { den: { answered, correct } } }; chronicle = mudrlant.week (days: { den: { a, c } })
    // extra = { den: ['Tajemná otázka', …] } dny, kdy hráč hrál jen hru bez odpovědí v souhrnu (Tajemná otázka, Řetězovka)
    const dayTotals = ({ state, chronicle, legacy } = {}) => {
        const own = (state && state.days) || {};
        const chron = (chronicle && chronicle.days && typeof chronicle.days === 'object') ? chronicle.days : {};
        const out = {};
        const add = (day, a, c, source) => {
            if (!isDay(day) || !(a > 0)) return;
            const prev = out[day];
            if (!prev || a > prev.a) out[day] = { a, c: Math.min(a, c), source };
        };
        const fallback = {};
        for (const [topic, days] of Object.entries((legacy && legacy.daily) || {})) {
            if (!TOPIC.test(topic) || !days || typeof days !== 'object') continue;
            for (const [day, row] of Object.entries(days)) {
                if (!isDay(day) || !row || typeof row !== 'object') continue;
                const entry = fallback[day] || (fallback[day] = [0, 0]);
                entry[0] += 1;
                if (row.correct) entry[1] += 1;
            }
        }
        for (const [day, row] of Object.entries((legacy && legacy.quiz) || {})) {
            if (!isDay(day) || !row || typeof row !== 'object') continue;
            const answered = whole(row.answered, 50);
            if (!answered) continue;
            const entry = fallback[day] || (fallback[day] = [0, 0]);
            entry[0] += answered;
            entry[1] += Math.min(answered, whole(row.correct, 50));
        }
        for (const [day, p] of Object.entries(fallback)) add(day, p[0], p[1], 'legacy');
        for (const [day, row] of Object.entries(chron)) if (row && typeof row === 'object') add(day, whole(row.a), whole(row.c), 'chronicle');
        for (const [day, p] of Object.entries(own)) add(day, whole(p[0]), whole(p[1]), 'own');
        return out;
    };

    // --- Témata a okruhy: vlastní souhrn + dnešní otázky ze dnů před ním (ty znají i okruh) ---
    // topics = [{ id, title, categories: [{ key, label }] }], learned = { téma: počet poznaných položek }
    const topicRows = ({ state, legacy, topics = [], learned = {} } = {}) => {
        const since = (state && state.since) || '';
        const sums = {};
        const add = (topic, cat, a, c) => {
            const row = sums[topic] || (sums[topic] = {});
            const cell = row[cat] || (row[cat] = [0, 0]);
            cell[0] += a;
            cell[1] += c;
        };
        for (const [topic, cats] of Object.entries((state && state.t) || {})) for (const [cat, p] of Object.entries(cats)) add(topic, cat, p[0], p[1]);
        for (const [topic, days] of Object.entries((legacy && legacy.daily) || {})) {
            if (!TOPIC.test(topic) || !days || typeof days !== 'object') continue;
            for (const [day, row] of Object.entries(days)) {
                if (!isDay(day) || (since && day >= since) || !row || typeof row !== 'object') continue;
                add(topic, CATEGORY.test(String(row.category || '')) ? row.category : NO_CATEGORY, 1, row.correct ? 1 : 0);
            }
        }
        return topics.map(topic => {
            const cats = sums[topic.id] || {};
            const labels = new Map((topic.categories || []).map(cat => [cat.key, cat.label]));
            const order = (topic.categories || []).map(cat => cat.key);
            const okruhy = Object.entries(cats).map(([key, p]) => ({ key, label: key === NO_CATEGORY ? NO_CATEGORY_LABEL : labels.get(key) || key, answered: p[0], correct: p[1], rate: rateOf(p[1], p[0]) }))
                .sort((a, b) => (order.includes(a.key) ? order.indexOf(a.key) : 999) - (order.includes(b.key) ? order.indexOf(b.key) : 999) || a.label.localeCompare(b.label, 'cs'));
            const answered = okruhy.reduce((sum, row) => sum + row.answered, 0);
            const correct = okruhy.reduce((sum, row) => sum + row.correct, 0);
            return { id: topic.id, title: topic.shortTitle || topic.title, answered, correct, rate: rateOf(correct, answered), learned: whole((learned || {})[topic.id]), okruhy };
        });
    };
    // Seřazení tabulky témat; při shodě abecedně (stejné pořadí při každém otevření). Témata bez odpovědí jsou vždy na konci (kromě řazení podle názvu)
    const sortRows = (rows, key = 'answered', dir = 'desc') => {
        const sign = dir === 'asc' ? 1 : -1;
        const byTitle = (a, b) => a.title.localeCompare(b.title, 'cs');
        return rows.slice().sort((a, b) => {
            if (key === 'title') return sign * byTitle(a, b);
            if (key === 'rate' && (a.rate === null) !== (b.rate === null)) return a.rate === null ? 1 : -1;
            const diff = (a[key] || 0) - (b[key] || 0);
            return diff ? sign * diff : byTitle(a, b);
        });
    };
    // Výchozí směr po klepnutí na jiný sloupec: název od A, čísla od největšího
    const nextSort = (current, key) => {
        if (!SORT_KEYS.includes(key)) return current;
        if (current && current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
        return { key, dir: key === 'title' ? 'asc' : 'desc' };
    };

    // --- Vývoj: týdny (od pondělí) a měsíce ---
    const trend = (totals, today, period = 'weeks', count = TREND_COUNT) => {
        const out = [];
        if (period === 'months') {
            let month = monthOf(today);
            for (let i = 0; i < count; i++) { out.unshift({ key: month, label: monthLabel(month), short: MONTHS_SHORT[Number(month.slice(5, 7)) - 1], a: 0, c: 0, days: 0 }); month = prevMonth(month); }
            const index = new Map(out.map((row, i) => [row.key, i]));
            for (const [day, row] of Object.entries(totals)) { const i = index.get(monthOf(day)); if (i !== undefined && day <= today) { out[i].a += row.a; out[i].c += row.c; out[i].days += 1; } }
        } else {
            const last = weekOf(today);
            for (let i = count - 1; i >= 0; i--) {
                const week = addDays(last, -7 * i);
                out.push({ key: week, label: `${shortDay(week)} – ${shortDay(addDays(week, 6))}`, short: shortDay(week), a: 0, c: 0, days: 0 });
            }
            const index = new Map(out.map((row, i) => [row.key, i]));
            for (const [day, row] of Object.entries(totals)) { const i = index.get(weekOf(day)); if (i !== undefined && day <= today) { out[i].a += row.a; out[i].c += row.c; out[i].days += 1; } }
        }
        return out.map(row => ({ ...row, rate: rateOf(row.c, row.a) }));
    };

    // --- Kalendář hraní (jako na GitHubu): sloupce = týdny, řádky = Po–Ne ---
    const levelOf = (answers) => HEAT_STEPS.filter(step => answers >= step).length;
    const heatmap = (totals, today, extra = {}, weeks = HEAT_WEEKS) => {
        const start = addDays(weekOf(today), -7 * (weeks - 1));
        const columns = [];
        let played = 0;
        let answers = 0;
        for (let w = 0; w < weeks; w++) {
            const column = [];
            for (let d = 0; d < 7; d++) {
                const day = addDays(start, w * 7 + d);
                if (day > today) { column.push(null); continue; }
                const a = totals[day] ? totals[day].a : 0;
                const games = Array.isArray(extra[day]) ? extra[day] : [];
                const level = a ? levelOf(a) : games.length ? 1 : 0;
                if (level) played += 1;
                answers += a;
                column.push({ day, a, games, level });
            }
            columns.push(column);
        }
        // Nejdelší řada dní za sebou (v celém záznamu, ne jen v kalendáři) a současná řada
        const all = new Set([...Object.keys(totals).filter(day => totals[day].a > 0), ...Object.keys(extra).filter(day => (extra[day] || []).length)]);
        const sorted = [...all].filter(day => day <= today).sort();
        let best = 0;
        let run = 0;
        let prev = '';
        for (const day of sorted) { run = prev && addDays(prev, 1) === day ? run + 1 : 1; best = Math.max(best, run); prev = day; }
        let current = 0;
        for (let day = all.has(today) ? today : addDays(today, -1); all.has(day); day = addDays(day, -1)) current += 1;
        return { start, end: today, columns, played, answers, best, current, total: all.size, first: sorted[0] || '' };
    };

    // --- Obtížnost, nápovědy, způsob a druh hry, doba odpovědi ---
    const breakdown = (state) => {
        const row = (label, p) => ({ label, answered: p[0], correct: p[1], rate: rateOf(p[1], p[0]) });
        const hintLabels = ['Bez nápovědy', '1 nápověda', '2 nápovědy', '3 nápovědy', '4 nápovědy'];
        const ms = state.ms;
        return {
            known: [row('Známější položky', state.k.known), row('Méně známé položky', state.k.hard)],
            hints: state.h.map((p, i) => row(hintLabels[i], p)),
            ways: [row('Výběr z možností', state.w.choices), row('Psaní odpovědi', state.w.typed)],
            modes: MODES.map(id => row(MODE_LABELS[id], state.m[id] || [0, 0])),
            time: {
                n: ms.n, slow: ms.slow, avg: ms.n ? ms.sum / ms.n : null, avgCorrect: ms.cn ? ms.cs / ms.cn : null,
                avgWrong: ms.n - ms.cn ? (ms.sum - ms.cs) / (ms.n - ms.cn) : null,
                buckets: ms.b.map((count, i) => ({ label: TIME_LABELS[i], count }))
            }
        };
    };

    // --- Záměny: dvojice položek bez ohledu na směr, nejčastější první ---
    const confusions = (state, topicTitle = (id) => id, limit = 15) => {
        const pairs = new Map();
        for (const [key, value] of Object.entries(state.x || {})) {
            const [topic, rightId, wrongId] = key.split('|');
            const id = `${topic}|${[rightId, wrongId].sort().join('|')}`;
            const entry = pairs.get(id) || { topic, topicTitle: topicTitle(topic), count: 0, last: '', ways: [] };
            entry.count += value[0];
            if (value[3] > entry.last) entry.last = value[3];
            entry.ways.push({ right: value[1], wrong: value[2], count: value[0], rightId });
            pairs.set(id, entry);
        }
        return [...pairs.values()].map(entry => {
            entry.ways.sort((a, b) => b.count - a.count || a.right.localeCompare(b.right, 'cs'));
            const first = entry.ways[0];
            return { ...entry, a: first.right, b: first.wrong };
        }).sort((x, y) => y.count - x.count || (x.last < y.last ? 1 : x.last > y.last ? -1 : 0) || x.a.localeCompare(y.a, 'cs')).slice(0, limit);
    };

    // --- Rekordy ze všech módů ---
    // input = { counters, modes (MudrlantModes.parse), quiz: { days, max }, mystery: { days, max }, chain: { days, max }, totals, topicTitle }
    const TOUR_STAGES = { 1: 'účast', 2: 'čtvrtfinále', 3: 'semifinále', 4: '3. místo', 5: '2. místo', 6: 'vítězství' };
    const records = ({ counters = {}, modes = null, quiz = null, mystery = null, chain = null, totals = {}, topicTitle = (id) => id } = {}) => {
        const c = counters || {};
        const n = (key) => whole(c[key]);
        const of = (part, total) => `${num(part)} z ${num(total)}`;
        const bestTopic = Object.entries(c.topicBest || {}).filter(([, value]) => whole(value)).sort((a, b) => whole(b[1]) - whole(a[1]) || a[0].localeCompare(b[0]))[0];
        const busiest = Object.entries(totals).sort((a, b) => b[1].a - a[1].a || (a[0] < b[0] ? 1 : -1))[0];
        const sharpest = Object.entries(totals).sort((a, b) => b[1].c - a[1].c || (a[0] < b[0] ? 1 : -1))[0];
        const groups = [];
        groups.push({ title: 'Běžná hra', rows: [
            { label: 'Odpovědí celkem', value: num(n('answered')), note: n('answered') ? `správně ${num(n('correct'))} (${pct(rateOf(n('correct'), n('answered')))})` : '' },
            { label: 'Nejdelší řada správných odpovědí', value: num(n('bestRun')) },
            { label: 'Nejdelší řada v jednom tématu', value: bestTopic ? num(whole(bestTopic[1])) : '0', note: bestTopic ? topicTitle(bestTopic[0]) : '' },
            { label: 'Nejvíc odpovědí za den', value: busiest ? num(busiest[1].a) : '0', note: busiest ? longDay(busiest[0]) : '' },
            { label: 'Nejvíc správných za den', value: sharpest ? num(sharpest[1].c) : '0', note: sharpest ? longDay(sharpest[0]) : '' },
            { label: 'Správně bez nápovědy', value: num(n('noHint')) },
            { label: 'Správně napsaných odpovědí', value: num(n('typedCorrect')) },
            { label: 'Správně u méně známých položek', value: num(n('hardCorrect')) },
            { label: 'Opravené chyby', value: num(n('fixed')) }
        ] });
        groups.push({ title: 'Dnešní otázky', rows: [
            { label: 'Nejdelší série dní', value: daysWord(n('bestStreak')) },
            { label: 'Dny se všemi dnešními otázkami', value: num(n('perfectDays')) },
            { label: 'Správné dnešní otázky', value: num(n('dailyCorrect')) }
        ] });
        const modeRow = (id, label, unit) => {
            const m = modes && modes[id] ? modes[id] : { top: 0, games: 0, best: {}, total: 0 };
            const scope = Object.entries(m.best || {}).filter(([key]) => key !== 'mix').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
            return { label: `${label}: rekord`, value: `${num(m.top || 0)}${NBSP}${unit}`, note: m.games ? `odehráno ${num(m.games)}${scope ? ` · nejlepší téma ${topicTitle(scope[0])} (${num(scope[1])})` : ''}` : 'zatím neodehráno' };
        };
        const best = (days, pick) => Object.entries((days && typeof days === 'object') ? days : {}).filter(([day, row]) => isDay(day) && row && pick(row) > 0)
            .sort((a, b) => pick(b[1]) - pick(a[1]) || (a[0] < b[0] ? -1 : 1))[0];
        const quizBest = quiz ? best(quiz.days, row => whole(row.score)) : null;
        const chainBest = chain ? best(chain.days, row => whole(row.score)) : null;
        const mysteryBest = mystery ? best(mystery.days, row => (row.solved ? whole(row.points) : 0)) : null;
        groups.push({ title: 'Režimy a denní hry', rows: [
            modeRow('blitz', 'Bleskovka', 'správně'),
            modeRow('survival', 'Přežití', 'otázek'),
            { label: 'Kvíz dne: nejvíc bodů', value: quizBest ? `${num(whole(quizBest[1].score))}${quiz.max ? ` z ${num(quiz.max)}` : ''}` : '–', note: quizBest ? `${longDay(quizBest[0])} (za posledních 120 dní)` : '' },
            { label: 'Kvíz dne: dohrané dny', value: num(n('quizDone')), note: `bez chyby ${num(n('quizPerfect'))} · nejdelší série ${daysWord(n('quizBestStreak'))}` },
            { label: 'Tajemná otázka: vyřešené dny', value: num(n('mysterySolved')), note: mysteryBest ? `nejvíc bodů ${num(whole(mysteryBest[1].points))}${mystery.max ? ` z ${num(mystery.max)}` : ''} (${longDay(mysteryBest[0])}, za posledních 40 dní)` : '' },
            { label: 'Řetězovka: nejvíc bodů', value: chainBest ? `${num(whole(chainBest[1].score))}${chain.max ? ` z ${num(chain.max)}` : ''}` : '–', note: chainBest ? `${longDay(chainBest[0])} (za posledních 60 dní)` : '' },
            { label: 'Řetězovka: celé řetězy', value: num(n('chainFull')), note: `bez Záchrany ${num(n('chainClean'))} · dohrané dny ${num(n('chainDone'))}` },
            { label: 'Ukaž na mapě: plný počet bodů', value: of(n('mapExact'), n('mapAnswered')) },
            { label: 'Odhadni číslo: do 10 %', value: of(n('estimateGood'), n('estimateAnswered')) },
            { label: 'Seřaď: bez chyby', value: of(n('orderPerfect'), n('orderAnswered')) },
            { label: 'Zlaté otázky správně', value: num(n('goldCorrect')) },
            { label: 'Boss týdne: výhry', value: of(n('bossWins'), n('bossFights')) }
        ] });
        groups.push({ title: 'Soupeři', rows: [
            { label: 'Výzvy: výhry', value: of(n('wins'), n('challenges')), note: `nejdelší řada výher ${num(n('bestWinRun'))}` },
            { label: 'Turnaj: nejlepší výsledek', value: TOUR_STAGES[n('tourBest')] || '–', note: `odehrané zápasy ${num(n('tourPlayed'))} · vyhrané ${num(n('tourWins'))}` },
            { label: 'Dobývání: výhry', value: num(n('conquestWins')) }
        ] });
        return groups;
    };

    // --- Celý pohled ---
    // input = { state, chronicle, legacy, topics, learned, counters, modes, quiz, mystery, chain, extra, today }
    const build = (input = {}) => {
        const state = parse(input.state);
        const today = isDay(input.today) ? input.today : dayOf(Date.now());
        const topics = Array.isArray(input.topics) ? input.topics : [];
        const titles = new Map(topics.map(topic => [topic.id, topic.shortTitle || topic.title]));
        const topicTitle = (id) => titles.get(id) || id;
        const totals = dayTotals({ state, chronicle: input.chronicle, legacy: input.legacy });
        const rows = topicRows({ state, legacy: input.legacy, topics, learned: input.learned });
        const answered = rows.reduce((sum, row) => sum + row.answered, 0);
        const correct = rows.reduce((sum, row) => sum + row.correct, 0);
        const heat = heatmap(totals, today, input.extra || {});
        return {
            today, since: state.since,
            summary: { answered, correct, rate: rateOf(correct, answered), days: heat.total, first: heat.first },
            topics: rows,
            weeks: trend(totals, today, 'weeks'),
            months: trend(totals, today, 'months'),
            heat,
            detail: breakdown(state),
            pairs: confusions(state, topicTitle),
            records: records({ counters: input.counters, modes: input.modes, quiz: input.quiz, mystery: input.mystery, chain: input.chain, totals, topicTitle })
        };
    };

    // ===== HTML =====
    const H3 = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const CARD = 'rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70';
    const NOTE = 'text-[11.5px] font-semibold leading-snug text-slate-500 dark:text-slate-400';
    const TH = 'py-1.5 text-[11px] font-black text-slate-600 dark:text-slate-300';
    const TD = 'py-1.5 text-right text-[12.5px] font-bold tabular-nums text-slate-700 dark:text-slate-200';
    const section = (title, body, attrs = '') => `<section ${attrs} class="flex flex-col gap-1.5"><h3 class="${H3}">${esc(title)}</h3>${body}</section>`;

    // Vodorovný pruh 0–100 % (SVG, šířka atributem, bez stylů); popisek s čísly je vedle jako text
    const meter = (rate) => `<svg viewBox="0 0 100 6" preserveAspectRatio="none" class="block h-1.5 w-full" aria-hidden="true"><rect width="100" height="6" rx="3" class="fill-slate-200 dark:fill-slate-700"/>${rate ? `<rect width="${Math.max(2, Math.min(100, rate)).toFixed(1)}" height="6" rx="3" class="fill-brand-600 dark:fill-brand-400"/>` : ''}</svg>`;
    // Řádek „Známější položky · 412 z 560 · 73,6 %“ s pruhem
    // Řádek: název a úspěšnost, pruh, pod ním počty („630 správně z 923 · 69,3 % všech odpovědí“)
    const rateRow = (row, share = null) => `
        <li class="flex flex-col gap-0.5">
            <span class="flex items-baseline justify-between gap-2"><span class="min-w-0 text-[12.5px] font-bold leading-tight text-slate-700 dark:text-slate-200">${esc(row.label)}</span>
                <span class="shrink-0 text-[13px] font-black tabular-nums text-slate-800 dark:text-slate-100">${row.answered ? pct(row.rate) : '–'}</span></span>
            ${meter(row.rate)}
            <span class="text-[11px] font-semibold tabular-nums leading-tight text-slate-500 dark:text-slate-400">${row.answered ? `${num(row.correct)} správně z ${num(row.answered)}${share !== null ? ` · ${pct(share)} všech odpovědí` : ''}` : 'zatím žádné odpovědi'}</span>
        </li>`;
    const rateList = (rows, withShare = false) => {
        const total = rows.reduce((sum, row) => sum + row.answered, 0);
        return `<ul class="${CARD} flex flex-col gap-2">${rows.map(row => rateRow(row, withShare ? rateOf(row.answered, total) : null)).join('')}</ul>`;
    };
    const tile = (label, value, note = '', attrs = '') => `<div ${attrs} class="${CARD} flex min-w-0 flex-col"><span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${esc(label)}</span><span class="text-lg font-black leading-tight tabular-nums text-slate-800 dark:text-slate-100">${value}</span>${note ? `<span class="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${note}</span>` : ''}</div>`;
    const sinceNote = (view) => (view.since
        ? `Každá odpověď se do Statistik počítá od ${longDay(view.since)}. Z doby předtím jsou tu dnešní otázky, Kvíz dne a posledních 10 týdnů z kroniky.`
        : 'Každá další odpověď se do Statistik započítá. Z doby předtím jsou tu dnešní otázky, Kvíz dne a posledních 10 týdnů z kroniky.');

    const overviewHtml = (view) => {
        const d = view.detail;
        const t = d.time;
        const all = t.buckets.reduce((sum, row) => sum + row.count, 0);
        const timeRows = t.buckets.map(bucket => `
            <li class="flex flex-col gap-0.5">
                <span class="flex items-baseline justify-between gap-2"><span class="text-[12.5px] font-bold text-slate-700 dark:text-slate-200">${esc(bucket.label)}</span>
                    <span class="shrink-0 text-[12px] font-bold tabular-nums text-slate-600 dark:text-slate-300">${answersWord(bucket.count)} · <span class="font-black text-slate-800 dark:text-slate-100">${pct(rateOf(bucket.count, all))}</span></span></span>
                ${meter(rateOf(bucket.count, all))}
            </li>`).join('');
        return `
            <div class="grid grid-cols-2 gap-2">
                ${tile('Odpovědi', num(view.summary.answered), 'v tématech', 'data-st-answered')}
                ${tile('Úspěšnost', pct(view.summary.rate), `${num(view.summary.correct)} správně`, 'data-st-rate')}
                ${tile('Dny hraní', num(view.summary.days), view.summary.first ? `od ${longDay(view.summary.first)}` : '', 'data-st-days')}
                ${tile('Průměrná doba', t.avg === null ? '–' : seconds(t.avg), t.n ? `z ${answersWord(t.n)}` : 'počítá se od teď', 'data-st-time')}
            </div>
            ${section('Obtížnost položek', rateList(d.known, true), 'data-st-known')}
            ${section('Nápovědy', rateList(d.hints, true), 'data-st-hints')}
            ${section('Způsob odpovědi', rateList(d.ways, true))}
            ${section('Kde odpovídáš', rateList(d.modes, true))}
            ${section('Doba odpovědi', `
                <div class="${CARD} flex flex-col gap-2" data-st-timing>
                    <p class="text-[12.5px] font-bold leading-snug text-slate-700 dark:text-slate-200">${t.n
                        ? `Průměr ${seconds(t.avg)} · správné ${t.avgCorrect === null ? '–' : seconds(t.avgCorrect)} · nesprávné ${t.avgWrong === null ? '–' : seconds(t.avgWrong)}`
                        : 'Doba odpovědi se zatím neměřila. Počítá se od teď, u každé odpovědi od ukázání otázky.'}</p>
                    ${t.n || t.slow ? `<ul class="flex flex-col gap-2">${timeRows}</ul>` : ''}
                    ${t.slow ? `<p class="${NOTE}">${answersWord(t.slow)} déle než 2 minuty se do průměru nepočítá (nejspíš pauza).</p>` : ''}
                </div>`)}`;
    };

    const SORT_LABELS = { title: 'Téma', answered: 'Odpovědi', correct: 'Správně', rate: 'Úspěšnost', learned: 'Poznáno' };
    const topicsHtml = (view, ui) => {
        const sort = ui.sort || { key: 'answered', dir: 'desc' };
        const rows = sortRows(view.topics, sort.key, sort.dir);
        const head = (key, short, extra = '') => {
            const on = sort.key === key;
            const aria = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
            return `<th scope="col" aria-sort="${aria}" class="${TH} ${extra}"><button type="button" data-st-sort="${key}" aria-label="Seřadit podle: ${SORT_LABELS[key]}${on ? (sort.dir === 'asc' ? ', teď vzestupně' : ', teď sestupně') : ''}" class="flex min-h-[2.5rem] w-full items-center gap-0.5 ${key === 'title' ? '' : 'justify-end'} ${on ? 'text-brand-700 dark:text-brand-300' : ''}">${short}${on ? `<i data-lucide="${sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'}" class="h-3 w-3 shrink-0"></i>` : ''}</button></th>`;
        };
        const body = rows.map(row => {
            const open = ui.open === row.id;
            const main = `
                <tr class="border-t border-slate-100 dark:border-slate-700" data-st-topic="${esc(row.id)}">
                    <th scope="row" class="py-0 text-left">${row.okruhy.length
                        ? `<button type="button" data-st-open="${esc(row.id)}" aria-expanded="${open}" class="flex min-h-[2.5rem] w-full min-w-0 items-center gap-1 text-left text-[12.5px] font-black text-slate-800 dark:text-slate-100"><i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" class="h-3.5 w-3.5 shrink-0 text-slate-400"></i><span class="min-w-0 leading-tight">${esc(row.title)}</span></button>`
                        : `<span class="flex min-h-[2.5rem] min-w-0 items-center pl-[1.125rem] text-[12.5px] font-bold leading-tight text-slate-500 dark:text-slate-400">${esc(row.title)}</span>`}</th>
                    <td class="${TD}">${num(row.answered)}</td>
                    <td class="${TD}">${num(row.correct)}</td>
                    <td class="${TD} font-black">${pct(row.rate)}</td>
                    <td class="${TD}">${num(row.learned)}</td>
                </tr>`;
            const subs = open ? row.okruhy.map(cat => `
                <tr data-st-okruh="${esc(cat.key)}" class="bg-slate-50 dark:bg-slate-900/40">
                    <th scope="row" class="py-1 pl-[1.125rem] text-left text-[11.5px] font-semibold leading-tight text-slate-600 dark:text-slate-300">${esc(cat.label)}</th>
                    <td class="${TD} !text-[11.5px] !font-semibold">${num(cat.answered)}</td>
                    <td class="${TD} !text-[11.5px] !font-semibold">${num(cat.correct)}</td>
                    <td class="${TD} !text-[11.5px]">${pct(cat.rate)}</td>
                    <td class="${TD} !text-[11.5px] !font-semibold text-slate-400 dark:text-slate-500"><span aria-label="nepočítá se">–</span></td>
                </tr>`).join('') : '';
            return main + subs;
        }).join('');
        return `
            <p class="${NOTE}">Klepnutím na název sloupce seřadíš, klepnutím na téma uvidíš jeho okruhy. Poznáno = různé položky, které už máš aspoň jednou správně.</p>
            <div class="${CARD} !px-2 !py-1">
                <table class="w-full table-fixed border-collapse" data-st-table>
                    <caption class="sr-only">Úspěšnost po tématech, seřazeno podle: ${esc(SORT_LABELS[sort.key])}</caption>
                    <colgroup><col><col class="w-[2.6rem]"><col class="w-[2.6rem]"><col class="w-[3.9rem]"><col class="w-[2.6rem]"></colgroup>
                    <thead><tr>${head('title', 'Téma', 'text-left')}${head('answered', 'Odp.', 'text-right')}${head('correct', 'Spr.', 'text-right')}${head('rate', '%', 'text-right')}${head('learned', 'Pozn.', 'text-right')}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>`;
    };

    // Sloupcový graf úspěšnosti (0–100 %) s popisky období; čísla jsou pod ním v tabulce
    const trendChart = (rows, period) => {
        const W = 300;
        const H = 150;
        const left = 34;
        const top = 8;
        const bottom = 126;
        const plot = bottom - top;
        const step = (W - left) / rows.length;
        const grid = [0, 50, 100].map(value => {
            const y = bottom - plot * value / 100;
            return `<line x1="${left}" x2="${W}" y1="${y}" y2="${y}" class="stroke-slate-200 dark:stroke-slate-700" stroke-width="1"/><text x="${left - 4}" y="${y + 3}" text-anchor="end" font-size="9" class="fill-slate-500 dark:fill-slate-400">${value}${NBSP}%</text>`;
        }).join('');
        const bars = rows.map((row, i) => {
            const x = left + i * step + step * 0.18;
            const w = step * 0.64;
            const label = (period === 'months' || i % 2 === rows.length % 2) ? `<text x="${(x + w / 2).toFixed(1)}" y="${bottom + 13}" text-anchor="middle" font-size="9" class="fill-slate-500 dark:fill-slate-400">${esc(row.short.replace(/ /g, ''))}</text>` : '';
            if (row.rate === null) return `${label}<text x="${(x + w / 2).toFixed(1)}" y="${bottom - 3}" text-anchor="middle" font-size="9" class="fill-slate-400 dark:fill-slate-500">–</text>`;
            const h = Math.max(1.5, plot * row.rate / 100);
            return `<rect x="${x.toFixed(1)}" y="${(bottom - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="fill-brand-600 dark:fill-brand-400"><title>${esc(`${row.label}: ${pct(row.rate)} (${num(row.c)} z ${num(row.a)})`)}</title></rect>${label}`;
        }).join('');
        const played = rows.filter(row => row.a);
        const summary = played.length
            ? `Úspěšnost po ${period === 'months' ? 'měsících' : 'týdnech'}: ${played.map(row => `${row.label} ${pct(row.rate)}`).join(', ')}`
            : `Za posledních ${rows.length} ${period === 'months' ? 'měsíců' : 'týdnů'} zatím žádné odpovědi`;
        return `<svg viewBox="0 0 ${W} ${H}" class="block h-auto w-full" role="img" aria-label="${esc(summary)}" data-st-chart="${period}">${grid}${bars}</svg>`;
    };
    const trendTable = (rows, period) => `
        <table class="w-full border-collapse" data-st-trend-table>
            <caption class="sr-only">Úspěšnost po ${period === 'months' ? 'měsících' : 'týdnech'}</caption>
            <thead><tr><th scope="col" class="${TH} text-left">${period === 'months' ? 'Měsíc' : 'Týden'}</th><th scope="col" class="${TH} text-right">Dny</th><th scope="col" class="${TH} text-right">Odp.</th><th scope="col" class="${TH} text-right">Spr.</th><th scope="col" class="${TH} text-right">%</th></tr></thead>
            <tbody>${rows.slice().reverse().map(row => `<tr class="border-t border-slate-100 dark:border-slate-700"><th scope="row" class="py-1 text-left text-[12px] font-bold text-slate-700 dark:text-slate-200">${esc(row.label)}</th><td class="${TD} !py-1">${num(row.days)}</td><td class="${TD} !py-1">${num(row.a)}</td><td class="${TD} !py-1">${num(row.c)}</td><td class="${TD} !py-1 font-black">${pct(row.rate)}</td></tr>`).join('')}</tbody>
        </table>`;

    const HEAT_CLASSES = ['fill-slate-200 dark:fill-slate-700', 'fill-brand-200 dark:fill-brand-900', 'fill-brand-400 dark:fill-brand-700', 'fill-brand-600 dark:fill-brand-500', 'fill-brand-800 dark:fill-brand-300'];
    const HEAT_LEGEND = ['0', '1–9', '10–24', '25–49', '50+'];
    const WEEKDAY_LABELS = ['Po', '', 'St', '', 'Pá', '', 'Ne'];
    const heatHtml = (heat) => {
        const cell = 12;
        const left = 18;
        const top = 12;
        const W = left + heat.columns.length * cell;
        const H = top + 7 * cell;
        const months = heat.columns.map((column, w) => {
            const first = column.find(Boolean);
            if (!first) return '';
            const day = column.map(entry => entry && entry.day).find(value => value && value.slice(8) === '01') || (w === 0 ? first.day : '');
            return day ? `<text x="${left + w * cell}" y="9" font-size="9" class="fill-slate-500 dark:fill-slate-400">${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}</text>` : '';
        }).join('');
        const days = WEEKDAY_LABELS.map((label, d) => (label ? `<text x="0" y="${top + d * cell + 9}" font-size="8.5" class="fill-slate-500 dark:fill-slate-400">${label}</text>` : '')).join('');
        const cells = heat.columns.map((column, w) => column.map((entry, d) => {
            if (!entry) return '';
            const what = entry.a ? answersWord(entry.a) : entry.games.length ? entry.games.join(', ') : 'nehráno';
            return `<rect x="${left + w * cell}" y="${top + d * cell}" width="${cell - 2}" height="${cell - 2}" rx="2" class="${HEAT_CLASSES[entry.level]}" data-level="${entry.level}"><title>${esc(`${longDay(entry.day)}: ${what}`)}</title></rect>`;
        }).join('')).join('');
        const label = `Kalendář hraní od ${longDay(heat.start)} do ${longDay(heat.end)}: hráno ${daysWord(heat.played)}, ${answersWord(heat.answers)}`;
        return `
            <div class="${CARD} flex flex-col gap-2" data-st-heat>
                <svg viewBox="0 0 ${W} ${H}" class="block h-auto w-full" role="img" aria-label="${esc(label)}">${months}${days}${cells}</svg>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400" aria-hidden="true">Odpovědí za den:
                    ${HEAT_LEGEND.map((text, i) => `<span class="inline-flex items-center gap-1"><svg viewBox="0 0 10 10" class="h-2.5 w-2.5"><rect width="10" height="10" rx="2" class="${HEAT_CLASSES[i]}"/></svg>${text}</span>`).join('')}</div>
                <p class="text-[12.5px] font-bold leading-snug text-slate-700 dark:text-slate-200" data-st-heat-text>Za posledních ${heat.columns.length} týdnů: hráno ${daysWord(heat.played)}, ${answersWord(heat.answers)}.<br>Nejdelší řada dní za sebou: ${daysWord(heat.best)}.<br>Současná řada: ${daysWord(heat.current)}.</p>
            </div>`;
    };
    const trendHtml = (view, ui) => {
        const period = ui.period === 'months' ? 'months' : 'weeks';
        const rows = period === 'months' ? view.months : view.weeks;
        const seg = (id, label) => `<button type="button" role="tab" data-st-period="${id}" aria-selected="${period === id}" class="min-h-[2.5rem] rounded-xl px-2 text-[12.5px] font-black ${period === id ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`;
        return `
            ${section('Kalendář hraní', heatHtml(view.heat))}
            ${section('Úspěšnost v čase', `
                <div role="tablist" aria-label="Období" class="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${seg('weeks', 'Týdny')}${seg('months', 'Měsíce')}</div>
                <div class="${CARD} flex flex-col gap-2">${trendChart(rows, period)}${trendTable(rows, period)}</div>`, 'data-st-trend')}`;
    };

    const pairsHtml = (view) => {
        if (!view.pairs.length) {
            return `<div class="${CARD}" data-st-pairs-empty><p class="text-[13px] font-bold leading-snug text-slate-700 dark:text-slate-200">Zatím tu žádné záměny nejsou.</p>
                <p class="mt-1 ${NOTE}">Záměna se zapíše, když místo správné odpovědi zvolíš nebo napíšeš jinou položku hry${view.since ? ` (počítá se od ${longDay(view.since)})` : ''}. Pak tu uvidíš, co si nejčastěji pleteš a s čím.</p></div>`;
        }
        return `
            <p class="${NOTE}">Dvojice, které se ti nejčastěji pletou, a kolikrát se to stalo v kterém směru. Počítá se od ${longDay(view.since)}.</p>
            <ol class="flex flex-col gap-2" data-st-pairs>${view.pairs.map((entry, i) => `
                <li class="${CARD} flex flex-col gap-1">
                    <span class="flex items-start justify-between gap-2"><span class="min-w-0 text-[13.5px] font-black leading-snug text-slate-800 dark:text-slate-100"><span class="text-slate-400 dark:text-slate-500">${i + 1}.</span> ${esc(entry.a)} <span aria-label="a">↔</span> ${esc(entry.b)}</span><span class="shrink-0 rounded-lg bg-slate-100 px-1.5 py-0.5 text-[12px] font-black tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-100">${num(entry.count)}×</span></span>
                    <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${esc(entry.topicTitle)}${entry.last ? ` · naposledy ${longDay(entry.last)}` : ''}</span>
                    <ul class="flex flex-col gap-0.5">${entry.ways.map(way => `<li class="text-[12px] font-semibold leading-snug text-slate-600 dark:text-slate-300">Správně ${esc(way.right)}, odpověď ${esc(way.wrong)}: <span class="font-black tabular-nums text-slate-800 dark:text-slate-100">${num(way.count)}×</span></li>`).join('')}</ul>
                </li>`).join('')}</ol>`;
    };

    const recordsHtml = (view) => view.records.map(group => section(group.title, `
        <dl class="${CARD} flex flex-col divide-y divide-slate-100 !py-1 dark:divide-slate-700">${group.rows.map(row => `
            <div class="flex items-baseline justify-between gap-3 py-1.5">
                <dt class="min-w-0 text-[12.5px] font-bold leading-snug text-slate-700 dark:text-slate-200">${esc(row.label)}${row.note ? `<span class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">${esc(row.note)}</span>` : ''}</dt>
                <dd class="shrink-0 text-right text-[13px] font-black tabular-nums text-slate-800 dark:text-slate-100">${esc(row.value)}</dd>
            </div>`).join('')}</dl>`, 'data-st-records')).join('');

    // Okno: přepínač pěti částí a obsah vybrané. ui = { tab, sort: { key, dir }, open (téma s rozbalenými okruhy), period ('weeks' | 'months') }
    const pageHtml = (view, ui = {}) => {
        const tab = TABS.some(([id]) => id === ui.tab) ? ui.tab : 'prehled';
        const tabs = TABS.map(([id, label]) => `<button type="button" role="tab" id="st-tab-${id}" data-st-tab="${id}" aria-selected="${tab === id}" aria-controls="st-panel" class="min-h-[2.5rem] min-w-0 truncate rounded-[0.6rem] px-0.5 text-[11.5px] font-black ${tab === id ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`).join('');
        const body = tab === 'temata' ? topicsHtml(view, ui) : tab === 'vyvoj' ? trendHtml(view, ui) : tab === 'zameny' ? pairsHtml(view) : tab === 'rekordy' ? recordsHtml(view) : overviewHtml(view);
        return `
            <div class="flex flex-col gap-3" data-stats data-st-current="${tab}">
                <div role="tablist" aria-label="Části statistik" class="grid grid-cols-5 gap-0.5 rounded-xl bg-slate-200/70 p-0.5 dark:bg-slate-800">${tabs}</div>
                <div id="st-panel" role="tabpanel" aria-labelledby="st-tab-${tab}" class="flex flex-col gap-3">${body}</div>
                <p class="${NOTE}" data-st-since>${esc(sinceNote(view))} Statistiky jsou jen v tomto zařízení.</p>
            </div>`;
    };

    return {
        KEY, KEEP_DAYS, MAX_PAIRS, SLOW_MS, TIME_EDGES, HEAT_WEEKS, HEAT_STEPS, TREND_COUNT, MODES, MODE_LABELS, NO_CATEGORY, TABS, SORT_KEYS,
        parse, record, dayTotals, topicRows, sortRows, nextSort, trend, heatmap, levelOf, breakdown, confusions, records, build,
        pageHtml, rateOf, pct, seconds, weekOf, addDays, longDay
    };
});
