// Kvíz dne: každý den (pražský čas) stejných 10 otázek pro všechny hráče, jeden započítaný pokus, pořadí dne a přátel a vlastní série dní.
// Liší se od „Dnešních otázek“ (jedna otázka z každého tématu): tady je jeden kvíz o deseti otázkách za sebou s pořadím hráčů.
// Čistá logika bez DOMu a sítě (výběr otázek ze semínka dne, součty, série, XP, text ke sdílení, uložený stav) a vykreslení obrazovek
// jako HTML; app.js jen napojí hru (runRound), server (social.js, schéma 6) a klepnutí. Testy: tests/daily-quiz.test.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantDailyQuiz = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const QUESTIONS = 10;
    // Výběr ze čtyř možností: bez nápovědy 4 body, každá nápověda bod dolů (pointsFor v quiz-core.js); psaní se v Kvízu dne nepoužívá
    const MAX_POINTS = 4;
    const MAX_SCORE = QUESTIONS * MAX_POINTS;
    // Obtížnost v rámci známých položek: 3 snadnější, 4 střední, 3 těžší; otázky jdou od snadnějších (stejný mix každý den)
    const DIFFICULTY = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2];
    // Kolik dní zpět se dopočítává řetěz „žádná položka ze včerejška“ (víc nemá smysl: shoda tří dní po sobě prakticky nenastane)
    const CHAIN_DEPTH = 3;
    // XP za dokončený kvíz (odpovědi mají své XP jako jinde): základ, za sérii dní 2 XP za den (nejvýš 10 dní, jako u Dnešních otázek) a bonus bez chyby
    const COMPLETE_XP = 30;
    const PERFECT_XP = 20;
    const STREAK_XP = 2;
    const STREAK_XP_CAP = 10;
    const KEY = 'mudrlant.dailyQuiz';
    const HISTORY_DAYS = 120;

    // --- Dny (Praha) ---
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDay = (day) => DAY_PATTERN.test(String(day || '')) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const addDays = (day, count) => dayOf(Date.parse(`${day}T00:00:00Z`) + count * 86400000);
    const pragueDay = (now = new Date()) => {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
            const get = (type) => (parts.find(part => part.type === type) || {}).value;
            const text = `${get('year')}-${get('month')}-${get('day')}`;
            if (isDay(text)) return text;
        } catch (error) { /* bez Intl se vezme UTC */ }
        return dayOf(now.getTime());
    };
    // „8. 11.“ a „8. 11. 2026“
    const formatDay = (day, withYear = false) => {
        const match = DAY_PATTERN.exec(String(day || ''));
        return match ? `${Number(match[3])}. ${Number(match[2])}.${withYear ? ` ${match[1]}` : ''}` : '';
    };
    // Čas 95 000 ms → „1:35“ (přes hodinu „1:02:05“)
    const formatTime = (ms) => {
        const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const seconds = String(total % 60).padStart(2, '0');
        return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
    };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const pointsWord = (count) => plural(count, 'bod', 'body', 'bodů');
    const daysWord = (count) => plural(count, 'den', 'dny', 'dní');

    // --- Náhoda ze semínka (stejná pro všechny hráče) ---
    const hash32 = (text) => {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        // promíchání bitů, ať se podobné řetězce (Q123, Q124) neřadí podle sebe
        hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16;
        return hash >>> 0;
    };
    const seededRandom = (seedText) => {
        let state = hash32(seedText);
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const shuffle = (list, rng) => {
        const result = [...list];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    };
    const seedFor = (day) => `mudrlant-kviz-dne-${day}`;
    // Semínko pro sestavení otázky (druh otázky, nesprávné možnosti) – stejné pro všechny
    const questionSeed = (day, index) => `${seedFor(day)}:otazka:${index}`;

    // --- Výběr otázek ---
    // Témata dne: ze skupin (Svět a dějiny, Příroda a věda, Kultura a sport) poměrně k jejich velikosti (metoda největších zbytků), pak zamíchaná;
    // pozice i má obtížnost DIFFICULTY[i]. Témat méně než otázek (jen v testech): témata se opakují.
    const slotsFor = (day, groups) => {
        const lists = (groups || []).map(group => [...new Set(group)].filter(Boolean)).filter(group => group.length);
        const total = lists.reduce((sum, group) => sum + group.length, 0);
        if (!total) return [];
        const rng = seededRandom(`${seedFor(day)}:temata`);
        const take = Math.min(QUESTIONS, total);
        const exact = lists.map(group => take * group.length / total);
        const counts = exact.map(Math.floor);
        let left = take - counts.reduce((sum, count) => sum + count, 0);
        exact.map((value, index) => ({ index, rest: value - Math.floor(value) }))
            .sort((a, b) => b.rest - a.rest || a.index - b.index)
            .forEach(({ index }) => { if (left > 0 && counts[index] < lists[index].length) { counts[index] += 1; left -= 1; } });
        let chosen = lists.flatMap((group, index) => shuffle(group, rng).slice(0, counts[index]));
        while (chosen.length < QUESTIONS) chosen = chosen.concat(shuffle(chosen.slice(0, take), rng));
        return shuffle(chosen.slice(0, QUESTIONS), rng).map((topic, slot) => ({ slot, topic, tier: DIFFICULTY[slot] }));
    };
    // Obtížnost známé položky: data témat jsou v každé kategorii seřazená podle známosti (počtu jazykových verzí Wikipedie),
    // takže první třetina známých položek kategorie je snadnější (0), prostřední střední (1) a poslední těžší (2)
    const tierCache = typeof WeakMap === 'function' ? new WeakMap() : null;
    const tiersOf = (items) => {
        if (tierCache && tierCache.has(items)) return tierCache.get(items);
        const byCategory = new Map();
        items.forEach(item => {
            if (item.k !== 1 || item.nq) return;
            if (!byCategory.has(item.c)) byCategory.set(item.c, []);
            byCategory.get(item.c).push(item);
        });
        const tiers = new Map();
        byCategory.forEach(list => list.forEach((item, index) => tiers.set(item.q, Math.min(2, Math.floor(3 * index / list.length)))));
        if (tierCache) tierCache.set(items, tiers);
        return tiers;
    };
    // Položka pro jednu pozici: kategorie losem (každá kategorie tématu stejně často), v ní položka s nejmenším otiskem (semínko dne + id).
    // Otisk místo pořadí: když přibudou nové položky, změní se výběr jen tam, kde nová položka vyhraje. exclude = id, která už padla.
    const pickFor = (day, slot, topicId, tier, data, exclude = new Set()) => {
        const items = (data && data.items) || [];
        if (!items.length) return null;
        const tiers = tiersOf(items);
        const askable = items.filter(item => !item.nq);
        const known = items.filter(item => tiers.has(item.q));
        const base = known.length ? known : askable.length ? askable : items;
        const inTier = base.filter(item => tiers.get(item.q) === tier);
        const pool = inTier.length ? inTier : base;
        const present = new Set(pool.map(item => item.c));
        const order = (data.categories || []).filter(key => present.has(key));
        const categories = [...order, ...[...present].filter(key => !order.includes(key))];
        const rng = seededRandom(`${seedFor(day)}:${slot}:${topicId}:kategorie`);
        const category = categories[Math.floor(rng() * categories.length)];
        const fresh = (list) => list.filter(item => !exclude.has(item.q));
        const candidates = [pool.filter(item => item.c === category), pool, base, items].map(fresh).find(list => list.length) || pool;
        let best = null;
        let bestHash = Infinity;
        for (const item of candidates) {
            const value = hash32(`${seedFor(day)}|${topicId}|${item.q}`);
            if (value < bestHash || (value === bestHash && String(item.q) < String(best.q))) { best = item; bestHash = value; }
        }
        return best;
    };
    // Co téma dostalo předchozí den (se stejným pravidlem, depth dní zpět); křížové shody mezi tématy se tu neřeší (stejná položka ve dvou tématech
    // dva dny po sobě je velmi vzácná a výsledek je pro všechny hráče stejný)
    const previousPicks = (day, topicId, groups, data, depth) => {
        const out = new Set();
        if (depth <= 0) return out;
        const yesterday = addDays(day, -1);
        const slots = slotsFor(yesterday, groups).filter(slot => slot.topic === topicId);
        if (!slots.length) return out;
        const before = previousPicks(yesterday, topicId, groups, data, depth - 1);
        slots.forEach(slot => {
            const item = pickFor(yesterday, slot.slot, topicId, slot.tier, data, new Set([...before, ...out]));
            if (item) out.add(item.q);
        });
        return out;
    };
    // Plán dne do pozice upTo (včetně): [{ slot, topic, tier, q }]. dataOf(id) → { items, categories } nebo null (téma se nenačetlo – plán skončí dřív).
    // Žádná položka se během dne nezopakuje a žádná není ze včerejška (ve stejném tématu).
    const planDay = (day, groups, dataOf, upTo = QUESTIONS - 1) => {
        const slots = slotsFor(day, groups);
        const used = new Set();
        const plan = [];
        for (const slot of slots.slice(0, upTo + 1)) {
            const data = dataOf(slot.topic);
            if (!data) break;
            const exclude = new Set([...previousPicks(day, slot.topic, groups, data, CHAIN_DEPTH), ...used]);
            const item = pickFor(day, slot.slot, slot.topic, slot.tier, data, exclude);
            plan.push({ ...slot, q: item ? item.q : null });
            if (item) used.add(item.q);
        }
        return plan;
    };

    // --- Výsledek ---
    // results: [{ correct, points, ms }] po otázkách; bitmap: bit i = otázka i správně
    const summarize = (results) => {
        const out = { answered: 0, correct: 0, score: 0, time_ms: 0, bitmap: 0 };
        for (let i = 0; i < QUESTIONS; i++) {
            const row = (results || [])[i];
            if (!row) break;
            out.answered += 1;
            if (row.correct) { out.correct += 1; out.bitmap |= 1 << i; }
            out.score += Math.max(0, Math.min(MAX_POINTS, Math.floor(Number(row.points) || 0)));
            out.time_ms += Math.max(0, Math.floor(Number(row.ms) || 0));
        }
        return out;
    };
    // Správně / špatně / nezodpovězeno (null) po otázkách
    const bitsOf = (bitmap, answered = QUESTIONS) => Array.from({ length: QUESTIONS }, (_, i) => (i < answered ? Boolean(bitmap & (1 << i)) : null));
    const emojiGrid = (bits) => bits.map(bit => (bit === true ? '🟩' : bit === false ? '🟥' : '⬜')).join('');
    // „Mudrlant · Kvíz dne 8. 11. · 8/10 🟩🟩🟥… · https://…“
    const shareText = ({ appName = 'Mudrlant', day, summary, url = '' }) => [
        `${appName} · Kvíz dne ${formatDay(day)}`,
        // Pořadí rozhodují body, proto jsou první; pak správně a mřížka odpovědí
        `${pointsWord(summary.score)} · ${summary.correct}/${QUESTIONS} ${emojiGrid(bitsOf(summary.bitmap, summary.answered))}`,
        url
    ].filter(Boolean).join(' · ');
    // Sova k výsledku (obrázky icons/topics/sova-<póza>.webp)
    const poseFor = (correct) => (correct >= QUESTIONS ? 'vitez' : correct >= 7 ? 'oslava' : correct >= 4 ? 'radost' : 'premysleni');

    // --- Série a XP ---
    // Série = dny po sobě s odehraným kvízem; dnešek se počítá, jen když je odehraný (jinak se počítá od včerejška).
    // frozen = dny zachráněné ochranou série (rewards.js): série přes ně pokračuje, do délky se nepočítají
    const streakOf = (days, today, frozen = []) => {
        const set = new Set(days || []);
        const saved = new Set(frozen || []);
        let day = set.has(today) ? today : addDays(today, -1);
        let count = 0;
        for (let guard = 0; guard < 4000 && (set.has(day) || saved.has(day)); guard++) { if (set.has(day)) count += 1; day = addDays(day, -1); }
        return count;
    };
    const bestStreakOf = (days) => {
        const sorted = [...new Set(days || [])].filter(isDay).sort();
        let best = 0;
        let run = 0;
        sorted.forEach((day, index) => {
            run = index && addDays(sorted[index - 1], 1) === day ? run + 1 : 1;
            best = Math.max(best, run);
        });
        return best;
    };
    const xpFor = ({ correct, streak = 0 }) => {
        const parts = [{ label: 'za dokončený Kvíz dne', xp: COMPLETE_XP }];
        if (streak > 1) parts.push({ label: `za sérii ${streak} dní Kvízu dne`, xp: STREAK_XP * Math.min(streak, STREAK_XP_CAP) });
        if (correct >= QUESTIONS) parts.push({ label: 'za Kvíz dne bez chyby', xp: PERFECT_XP });
        return { total: parts.reduce((sum, part) => sum + part.xp, 0), parts };
    };

    // --- Uložený stav v zařízení (mudrlant.dailyQuiz) ---
    // days: odehrané dny tohoto zařízení { day: { answered, correct, score, time_ms, bitmap, done, xp } } (série hosta, XP jen jednou za den a zařízení);
    // attempt: dnešní pokus { day, owner ('host' nebo id hráče), results, plan [{ topic, q }], open { index, at, hint } (otázka na obrazovce),
    // synced (kolik odpovědí potvrdil server, -1 = neví se), done, xp ({ total, parts } po dokončení), rank ({ rank, total } z pořadí) }
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const cleanSummary = (row) => ({ answered: whole(row.answered, QUESTIONS), correct: whole(row.correct, QUESTIONS), score: whole(row.score, MAX_SCORE), time_ms: whole(row.time_ms, 36000000), bitmap: whole(row.bitmap, 1023) });
    // Text odpovědi a nápovědy (pro rozpis otázek) zůstanou, když je odpověď má
    const cleanResult = (row) => (row && typeof row === 'object' ? { correct: Boolean(row.correct), points: row.points === null ? null : whole(row.points, MAX_POINTS), ms: whole(row.ms, 3600000),
        ...(typeof row.answer === 'string' && row.answer ? { answer: row.answer.slice(0, 120) } : {}), ...(Number.isInteger(row.hints) && row.hints >= 0 && row.hints <= 4 ? { hints: row.hints } : {}) } : null);
    const cleanAttempt = (raw) => {
        if (!raw || typeof raw !== 'object' || !isDay(raw.day)) return null;
        const results = [];
        for (const row of (Array.isArray(raw.results) ? raw.results : []).slice(0, QUESTIONS)) { const clean = cleanResult(row); if (!clean) break; results.push(clean); }
        const plan = (Array.isArray(raw.plan) ? raw.plan : []).slice(0, QUESTIONS).map(entry => (entry && typeof entry.topic === 'string' && typeof entry.q === 'string' ? { topic: entry.topic, q: entry.q } : null));
        const open = raw.open && Number.isInteger(raw.open.index) && raw.open.index >= results.length && raw.open.index < QUESTIONS && Number.isFinite(raw.open.at)
            ? { index: raw.open.index, at: raw.open.at, hint: Math.max(1, whole(raw.open.hint, 9)) } : null;
        const xp = raw.xp && Number.isFinite(raw.xp.total) && Array.isArray(raw.xp.parts)
            ? { total: whole(raw.xp.total, 10000), parts: raw.xp.parts.filter(part => part && typeof part.label === 'string' && Number.isFinite(part.xp)).map(part => ({ label: part.label.slice(0, 80), xp: whole(part.xp, 1000) })) } : null;
        return {
            day: raw.day, owner: typeof raw.owner === 'string' && raw.owner ? raw.owner.slice(0, 64) : 'host', results, plan, open,
            synced: Number.isInteger(raw.synced) && raw.synced >= 0 ? Math.min(raw.synced, QUESTIONS) : -1,
            done: Boolean(raw.done) && results.length === QUESTIONS || Boolean(raw.done && raw.server),
            server: raw.server && typeof raw.server === 'object' ? cleanSummary(raw.server) : null,
            xp, rank: raw.rank && Number.isInteger(raw.rank.rank) && raw.rank.rank > 0 ? { rank: raw.rank.rank, total: whole(raw.rank.total, 1e7) } : null
        };
    };
    const parseState = (raw) => {
        const state = { v: 1, days: {}, attempt: null };
        if (!raw || typeof raw !== 'object') return state;
        if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
            Object.keys(raw.days).filter(isDay).sort().slice(-HISTORY_DAYS).forEach(day => {
                const row = raw.days[day];
                if (row && typeof row === 'object') state.days[day] = { ...cleanSummary(row), done: Boolean(row.done), xp: Boolean(row.xp) };
            });
        }
        state.attempt = cleanAttempt(raw.attempt);
        return state;
    };
    const newAttempt = (day, owner) => ({ day, owner: owner || 'host', results: [], plan: [], open: null, synced: -1, done: false, server: null, xp: null, rank: null });
    // Souhrn pokusu: ze serveru, když má všechny odpovědi (jeho čas rozhoduje v pořadí, odpovědi z jiného zařízení nemají body), jinak z vlastních odpovědí
    const attemptSummary = (attempt) => {
        const own = summarize(attempt.results);
        if (attempt.server && attempt.server.answered >= own.answered) return { ...attempt.server };
        return own;
    };
    // Pokus z minulého dne se uzavře, jak stojí (nezodpovězené otázky se nepočítají), a dnešní místo se uvolní
    const rollover = (state, today) => {
        const attempt = state.attempt;
        if (!attempt || attempt.day === today) return state;
        const summary = attemptSummary(attempt);
        if (summary.answered && !state.days[attempt.day]) state.days[attempt.day] = { ...summary, done: summary.answered === QUESTIONS, xp: Boolean(attempt.xp) };
        state.attempt = null;
        return state;
    };
    // Dny, které se počítají do série (odehraný aspoň kus kvízu; dnešek jen dohraný)
    const playedDays = (state, today) => Object.keys(state.days).filter(day => state.days[day].answered > 0 && (day !== today || state.days[day].done));
    // Další otázka k hraní (-1 = všechny zodpovězené)
    const nextIndex = (attempt) => (attempt.results.length < QUESTIONS ? attempt.results.length : -1);

    // --- Vykreslení (HTML; h = pomocné funkce z app.js: avatarHtml, topicIcon, xpLine) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const art = (name, cls) => `<img src="icons/topics/${name}.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    const PRIMARY = 'flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white disabled:opacity-50';
    const SECONDARY = 'flex min-w-0 items-center justify-center gap-1.5 rounded-2xl btn-3d-light bg-white px-2 py-2.5 text-sm font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100';
    const LABEL = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';

    // Karta na úvodní stránce (Jeden hráč): stav dne a jedno tlačítko; zlatá tečka = dnes ještě nehráno
    // Dlaždice Kvízu dne v řadě Výzvy na úvodu (vykreslí app.js specialTile): krátký stav pod názvem, celý v popisku pro čtečku
    const homeTile = ({ status = 'new', answered = 0, summary = null, rank = null }) => {
        const done = status === 'done' && summary;
        const progress = status === 'progress';
        const text = done ? (rank ? `${rank}. místo · ${summary.correct}/${QUESTIONS}` : `${summary.correct}/${QUESTIONS} · ${pointsWord(summary.score)}`)
            : progress ? `Otázka ${Math.min(answered + 1, QUESTIONS)}/${QUESTIONS}` : `${QUESTIONS} otázek`;
        const label = done ? `Kvíz dne: ${pointsWord(summary.score)} · ${summary.correct}/${QUESTIONS}${rank ? ` · ${rank}. místo` : ''}`
            : progress ? `Kvíz dne: rozehráno, otázka ${Math.min(answered + 1, QUESTIONS)} z ${QUESTIONS}` : `Kvíz dne: ${QUESTIONS} otázek pro všechny, pořadí`;
        return { text, label, fresh: !done && !progress };
    };

    // Úvod: co Kvíz dne je, pravidla a tlačítko Začít / Pokračovat; topics = 10 témat dne (ikony)
    const introHtml = ({ day, topics = [], answered = 0, open = false, guest = false, offline = false, skipIntro = false }, h) => {
        const resume = answered > 0 || open;
        const rule = (icon, text) => `<li class="flex items-start gap-2.5 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70"><i data-lucide="${icon}" class="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-300"></i><span class="text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">${text}</span></li>`;
        return `
            <div id="quiz-intro" class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-4 short:gap-2 short:p-3 dark:bg-slate-900">
                <div class="rounded-[1.5rem] bg-gradient-to-br from-brand-600 to-brand-900 px-4 pb-3 pt-3 text-center text-white shadow-lg short:pt-2">
                    ${art('stopky', 'mx-auto h-14 w-14 short:h-10 short:w-10')}
                    <p class="mt-1 text-[11px] font-black uppercase tracking-widest text-gold-300">Kvíz dne · ${esc(formatDay(day, true))}</p>
                    <h1 class="mt-0.5 text-xl font-black leading-tight max-[389px]:text-[17px]">Stejných ${QUESTIONS} otázek pro všechny</h1>
                    ${topics.length ? `<div class="mt-2 flex flex-wrap justify-center gap-1" aria-label="Témata dnešních otázek">${topics.map(id => h.topicIcon(id)).join('')}</div>` : ''}
                </div>
                <ul class="flex flex-col gap-1.5">
                    ${rule('users', 'Otázky z různých témat dostane dnes každý hráč stejné. Odpovídáš výběrem ze čtyř možností.')}
                    ${rule('trophy', 'Pořadí rozhodují body (nápověda bod ubere), při shodě rychlejší čas.')}
                    ${rule('timer', 'Jeden pokus za den. Když kvíz přerušíš, dokončíš ho později, čas ale běží dál.')}
                </ul>
                <p class="px-1 text-[12px] font-semibold leading-snug text-slate-500 dark:text-slate-400">Dnešní otázky (jedna z každého tématu) zůstávají zvlášť, tohle je jeden kvíz s pořadím hráčů.</p>
                ${guest ? '<p data-quiz-guest class="rounded-2xl bg-gold-50 px-3 py-2 text-[12px] font-bold leading-snug text-gold-800 ring-1 ring-gold-200 dark:bg-gold-950/40 dark:text-gold-200 dark:ring-gold-800/60">Hraješ bez přihlášení: výsledek můžeš sdílet, do pořadí se ale nezapíše.</p>' : ''}
                ${offline ? '<p class="rounded-2xl bg-slate-100 px-3 py-2 text-[12px] font-bold leading-snug text-slate-600 dark:bg-slate-800 dark:text-slate-300">Pořadí teď není dostupné. Výsledek se uloží v zařízení a odešle, až to půjde.</p>' : ''}
                <div class="mt-auto flex flex-col gap-1.5 pt-1">
                    <button type="button" data-action="quiz-skip-intro" role="checkbox" aria-checked="${skipIntro}" class="flex min-h-[2.5rem] items-center gap-2 self-center rounded-xl px-2 text-[13px] font-bold text-slate-600 dark:text-slate-300">
                        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${skipIntro ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400 dark:border-slate-500'}">${skipIntro ? '<i data-lucide="check" class="h-3.5 w-3.5"></i>' : ''}</span>
                        Příště úvod nezobrazovat, kvíz rovnou začne
                    </button>
                    <button type="button" data-action="quiz-start" class="${PRIMARY}"><i data-lucide="play" class="h-5 w-5"></i> ${resume ? `Pokračovat · otázka ${Math.min(answered + 1, QUESTIONS)}/${QUESTIONS}` : 'Začít kvíz'}</button>
                </div>
            </div>`;
    };

    // Řádek pořadí: místo, obrázek, přezdívka, body a pod nimi správně a čas
    const rowHtml = (row, h) => `
        <li data-quiz-row="${esc(row.id)}" class="flex items-center gap-2.5 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800 ${row.me ? 'ring-2 ring-brand-600 dark:ring-brand-400' : ''}">
            <span data-place="${row.rank}" class="w-7 shrink-0 text-center text-[13px] font-black text-slate-500 dark:text-slate-400">${row.rank === 1 ? '🏆' : `${row.rank}.`}</span>
            ${h.avatarHtml(row, 'h-8 w-8 text-base', !row.me)}
            <button type="button" data-action="quiz-breakdown" data-player="${esc(row.id)}" aria-label="${esc(`Rozpis odpovědí: ${row.display_name || 'Hráč'}`)}" class="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span data-player-name class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">${esc(row.display_name || 'Hráč')}${row.me ? ' (ty)' : ''}</span>
                <span class="shrink-0 text-right"><span class="block text-sm font-black text-slate-800 dark:text-slate-100">${esc(pointsWord(row.score))}</span><span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">${row.correct}/${QUESTIONS} · ${esc(formatTime(row.time_ms))}</span></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="h-4 w-4 shrink-0 text-slate-400"><path d="M10 6h11M10 12h11M10 18h11M4 6h1M4 12h1M4 18h1"/></svg>
            </button>
        </li>`;
    // Pořadí dne (top + moje místo, když jsem mimo) nebo přátelé; board/friends null = načítá se, false = nedostupné
    const rankingHtml = ({ tab = 'all', board, friends }, h) => {
        const toggle = (id, label) => `<button type="button" role="tab" data-action="quiz-tab" data-tab="${id}" aria-selected="${tab === id}" class="flex min-h-[2.5rem] flex-1 items-center justify-center rounded-xl px-2 text-[13px] font-black ${tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`;
        const note = (text) => `<p class="rounded-2xl bg-white px-3 py-3 text-center text-sm font-semibold text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">${esc(text)}</p>`;
        let body;
        if (tab === 'friends') {
            if (friends === null || friends === undefined) body = note('Načítám přátele…');
            else if (friends === false) body = note('Přátele se teď nepodařilo načíst.');
            else if (!friends.friends) body = note('Zatím nemáš přátele. Přidáš je v profilu hráče na záložce Více hráčů.');
            else if (!friends.rows.some(row => !row.me)) body = `${friends.rows.length ? `<ol class="flex flex-col gap-1.5">${friends.rows.map(row => rowHtml(row, h)).join('')}</ol>` : ''}${note('Z přátel dnes ještě nikdo nehrál.')}`;
            else body = `<ol class="flex flex-col gap-1.5">${friends.rows.map(row => rowHtml(row, h)).join('')}</ol>`;
        } else if (board === null || board === undefined) body = note('Načítám pořadí…');
        else if (board === false) body = note('Pořadí se teď nepodařilo načíst.');
        else if (!board.top.length) body = note('Zatím nikdo nedohrál. Budeš první!');
        else {
            const mine = board.me && !board.top.some(row => row.me)
                ? `<li aria-hidden="true" class="text-center text-sm font-black leading-none text-slate-400 dark:text-slate-500">⋯</li>${rowHtml({ ...board.me, ...h.meRow, me: true }, h)}` : '';
            body = `<ol class="flex flex-col gap-1.5">${board.top.map(row => rowHtml(row, h)).join('')}${mine}</ol>`;
        }
        const total = board && board.total ? ` · ${plural(board.total, 'hráč', 'hráči', 'hráčů')}` : '';
        return `
            <section id="quiz-ranking" class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2 px-1"><h2 class="${LABEL}">Pořadí dne${tab === 'all' ? esc(total) : ''}</h2></div>
                <div role="tablist" class="flex gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${toggle('all', 'Všichni')}${toggle('friends', 'Přátelé')}</div>
                <div data-quiz-list>${body}</div>
            </section>`;
    };

    // Výsledek: sova, skóre, mřížka otázek, XP, sdílení, série, pořadí (přihlášený) nebo pozvánka k přihlášení (host);
    // pořadí je dlouhý seznam, Zpět domů proto zůstává dole lepkavě vidět
    const resultHtml = ({ day, summary, xp = null, streak = 0, best = 0, guest = false, canLogin = false, ranking = null, closed = false, pending = false, freezes = '' }, h) => {
        const bits = bitsOf(summary.bitmap, summary.answered);
        const grid = bits.map((bit, index) => `<span class="h-5 w-5 rounded-md ${bit === true ? 'bg-emerald-400' : bit === false ? 'bg-rose-400' : 'bg-white/25'}" title="${index + 1}. otázka: ${bit === true ? 'správně' : bit === false ? 'špatně' : 'bez odpovědi'}"></span>`).join('');
        const right = bits.map((bit, index) => (bit ? index + 1 : null)).filter(Boolean);
        const gridLabel = `Správně: ${right.length ? `${right.join(', ')}. otázka` : 'žádná otázka'}`;
        return `
            <div id="quiz-result" class="fade-in flex min-h-full w-full flex-col gap-3 bg-slate-50 p-4 pb-6 dark:bg-slate-900">
                <div class="rounded-[1.5rem] bg-gradient-to-br from-brand-600 to-brand-900 p-4 text-center text-white shadow-lg">
                    ${art(`sova-${poseFor(summary.correct)}`, 'mx-auto -mt-1 h-20 w-20')}
                    <p class="mt-1 text-xs font-black uppercase tracking-widest text-white/80">Kvíz dne · ${esc(formatDay(day, true))}</p>
                    <p data-quiz-score class="mt-0.5 text-4xl font-black">${esc(pointsWord(summary.score))}</p>
                    <p data-quiz-correct class="mt-0.5 text-sm font-bold text-white/90">${summary.correct}/${QUESTIONS} správně · čas ${esc(formatTime(summary.time_ms))}</p>
                    <div data-quiz-grid role="img" aria-label="${esc(gridLabel)}" class="mt-2.5 flex justify-center gap-1">${grid}</div>
                    ${closed ? '<p class="mt-2 text-[12px] font-semibold text-white/85">Kvíz nebyl dohraný, počítá se, jak stál.</p>' : ''}
                    ${pending ? '<p class="mt-2 text-[12px] font-semibold text-white/85">Výsledek čeká na odeslání, zkusím to znovu.</p>' : ''}
                    ${xp ? h.xpLine(xp) : ''}
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button type="button" data-action="quiz-share" class="${SECONDARY}"><i data-lucide="share-2" class="h-4 w-4 shrink-0"></i> Sdílet výsledek</button>
                    <button type="button" data-action="quiz-share-image" class="${SECONDARY}"><i data-lucide="image" class="h-4 w-4 shrink-0"></i> Sdílet obrázek</button>
                </div>
                <div data-quiz-streak class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
                    ${art('serie', 'h-10 w-10')}
                    <div class="min-w-0 flex-1"><p class="flex items-center gap-1.5 ${LABEL}">Moje série Kvízu dne${freezes}</p><p class="text-lg font-black leading-tight text-slate-800 dark:text-slate-100">${esc(daysWord(streak))}${best > streak ? ` <span class="text-xs font-bold text-slate-500 dark:text-slate-400">· nejlepší ${esc(daysWord(best))}</span>` : ''}</p></div>
                </div>
                ${guest ? `
                    <div data-quiz-login class="flex flex-col items-center gap-2 rounded-[1.4rem] bg-white p-4 text-center shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
                        ${art('sova-vyzva', 'h-16 w-16')}
                        <p class="text-base font-black text-slate-800 dark:text-slate-100">Přihlas se a uvidíš se v pořadí</p>
                        <p class="text-sm leading-snug text-slate-600 dark:text-slate-300">${canLogin ? 'Po přihlášení se dnešní výsledek zapíše do pořadí (když jsi Kvíz dne na účtu ještě nehrál) a porovnáš se s přáteli.' : 'Pořadí je jen pro přihlášené hráče.'}</p>
                        ${canLogin ? `<button type="button" data-action="quiz-login" class="${PRIMARY}"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>` : ''}
                    </div>` : ranking ? rankingHtml(ranking, h) : ''}
                <div class="sticky bottom-0 z-10 -mx-4 -mb-6 bg-slate-50/95 px-4 pb-6 pt-2 backdrop-blur dark:bg-slate-900/95"><button type="button" data-action="quiz-home" class="${guest && canLogin ? SECONDARY.replace('px-2 py-2.5 text-sm', 'w-full px-4 py-3 text-base') : PRIMARY}"><i data-lucide="house" class="h-5 w-5"></i> Zpět domů</button></div>
            </div>`;
    };

    return {
        QUESTIONS, MAX_POINTS, MAX_SCORE, DIFFICULTY, CHAIN_DEPTH, COMPLETE_XP, PERFECT_XP, STREAK_XP, STREAK_XP_CAP, KEY,
        isDay, addDays, pragueDay, formatDay, formatTime, pointsWord, daysWord, hash32, seededRandom, seedFor, questionSeed,
        slotsFor, tiersOf, pickFor, previousPicks, planDay,
        summarize, bitsOf, emojiGrid, shareText, poseFor, streakOf, bestStreakOf, xpFor,
        parseState, newAttempt, attemptSummary, rollover, playedDays, nextIndex,
        homeTile, introHtml, rankingHtml, resultHtml
    };
});
