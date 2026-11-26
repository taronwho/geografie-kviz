// Seřaď to: klidná minihra bez časovače. Hráč seřadí 5–7 karet podle jedné vlastnosti z dat témat (výška hory, rok narození, rozloha státu,
// délka řeky, rok premiéry, protonové číslo…). Karty jde přetáhnout, posunout šipkami (i klávesami nahoru a dolů) nebo prohodit dvěma klepnutími.
// Tlačítko Zkontrolovat: karty na správném místě zezelenají a zamknou se, ostatní se jen jemně zhoupnou a dál se přesouvají mezi volnými místy
// (zamčené karty stojí). Žádný trest, počítají se jen pokusy. Na konci karty ukážou skutečné hodnoty a postupně „zapadnou“.
// Vlastnosti a hodnoty jsou ty spolehlivé z numeric-questions.js (SPECS: stejné jako u otázek Seřaď uvnitř kvízu), obtížnost = počet karet
// a jak blízko jsou hodnoty u sebe. Řazení dne: každý den jedna sada stejná pro všechny (semínko = pražský den, pevný seznam vlastností).
// Čistá logika bez DOMu (výběr karet, přesuny, kontrola, XP s denním stropem, uložený stav) a vykreslení s ovládáním (createController);
// app.js jen napojí data témat (loadTopic), XP (awardModeXp) a klepnutí. Stav je jen v zařízení (mudrlant.sorting).
// Testy: tests/sorting.test.js (logika na skutečných datech), tests/e2e-sorting.test.js (v prohlížeči, 360×640 i 390×780).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore, isNode ? require('./numeric-questions.js') : root.MudrlantNumeric);
    if (isNode) module.exports = api;
    else root.MudrlantSorting = api;
})(typeof self !== 'undefined' ? self : this, (core, Numeric) => {
    'use strict';
    const { escapeHtml, shuffle, normalizeAnswer, createSeededRandom } = core;

    const KEY = 'mudrlant.sorting';
    const HISTORY_DAYS = 60;
    // Obtížnost: počet karet, jen známé položky a jak daleko od sebe hodnoty jsou (spread násobí odstup z numeric-questions.js SPECS.gap;
    // close = karty kolem jedné hodnoty, ne z celé škály)
    const LEVELS = {
        easy: { id: 'easy', title: 'Lehká', cards: 5, known: true, spread: 2, close: false, note: '5 karet, hodnoty daleko od sebe' },
        medium: { id: 'medium', title: 'Střední', cards: 6, known: true, spread: 1.35, close: false, note: '6 karet' },
        hard: { id: 'hard', title: 'Těžká', cards: 7, known: false, spread: 1, close: true, note: '7 karet, hodnoty blízko u sebe' }
    };
    const LEVEL_IDS = ['easy', 'medium', 'hard'];
    // XP: volná hra 2 XP za kartu a 4 XP navíc za seřazení napoprvé, nejvýš 60 XP denně; Řazení dne 20 XP a 10 XP navíc napoprvé (jednou denně,
    // mimo strop). Záměrně málo: kolo trvá chvilku a hraje se pro radost
    const XP_PER_CARD = 2;
    const FIRST_TRY_XP = 4;
    const DAILY_XP_CAP = 60;
    const DAILY_XP = 20;
    const DAILY_FIRST_XP = 10;
    const DAILY_LEVEL = 'medium';
    // Řazení dne: pevný seznam vlastností s dostatkem známých položek, den po dni dokola (den d hraje DAILY_SPECS[d mod 21]); sousední
    // vlastnosti jsou z různých témat (i poslední a první), takže dva dny po sobě nejsou ze stejného tématu. Seznam neměnit: změnil by už
    // hrané dny (rozšíření jen s dnem, od kterého platí nový seznam)
    const DAILY_SPECS = [
        'zemepis-hora-vyska', 'historie-panovnik-narozeni', 'zemepis-reka-delka', 'chemie-prvky-z', 'film-filmy-year', 'zemepis-stat-obyvatele',
        'literatura-spisovatele-narozeni', 'architektura-stavby-y', 'zemepis-mesto-obyvatele', 'hudba-dila-year', 'sport-kluby-from',
        'zemepis-stat-rozloha', 'umeni-obrazy-year', 'historie-bitva-rok', 'fyzika-fyzici-narozeni', 'zemepis-ostrov-rozloha',
        'architektura-mrakodrapy-vyska', 'geologie-nerosty-tvrdost', 'hudba-kapely-from', 'sport-sportoviste-kapacita', 'literatura-dila-year'
    ];

    // --- Vlastnosti ---
    const SPEC_BY_ID = new Map(Numeric.SPECS.filter(spec => spec.order).map(spec => [spec.id, spec]));
    const TOPIC_IDS = [...new Set([...SPEC_BY_ID.values()].map(spec => spec.topic))];
    const specsFor = (topicId) => [...SPEC_BY_ID.values()].filter(spec => spec.topic === topicId);
    // Směr řazení: vždy první uvedený u vlastnosti (hory od nejvyšší, roky od nejstaršího), ať je pravidlo předvídatelné
    const dirOf = (spec) => Object.keys(spec.order)[0];
    const pickText = (value, group) => value && typeof value === 'object' ? value[group] || '' : value || '';
    // Název vlastnosti do výběru („Hory podle nadmořské výšky“); u geologických období jeden název pro éry, periody i epochy
    const specLabel = (spec) => {
        const text = spec.order[dirOf(spec)][1];
        return typeof text === 'string' ? text : 'Éry, periody a epochy podle stáří';
    };
    const specTitle = (spec) => spec.order[dirOf(spec)][0];
    const groupOf = (spec, item) => (spec.group ? spec.group(item) : '');

    // --- Dny ---
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const dayNumber = (day) => { const [y, m, d] = String(day).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
    const shiftDay = (day, count) => new Date((dayNumber(day) + count) * 86400000).toISOString().slice(0, 10);
    const dailySpecId = (day) => DAILY_SPECS[(dayNumber(day) % DAILY_SPECS.length + DAILY_SPECS.length) % DAILY_SPECS.length];

    // --- Výběr karet ---
    // Dvě hodnoty jsou dost daleko od sebe: odstup vlastnosti (SPECS.gap) násobený obtížností
    const apart = (gap, a, b, spread) => {
        if (gap.mode === 'ratio') return Math.max(a, b) >= Math.min(a, b) * gap.min ** spread;
        if (gap.mode === 'year') return Math.abs(a - b) >= Numeric.yearGap(Math.min(a, b)) * spread;
        return Math.abs(a - b) >= gap.min * spread;
    };
    const distance = (gap, a, b) => (gap.mode === 'ratio' ? Math.abs(Math.log(a / b)) : Math.abs(a - b));
    const eligibleFor = (spec, items, knownOnly) => items.filter(item => Numeric.isEligible(spec, item) && (!knownOnly || item.k === 1));

    // count položek se stejnou skupinou, různými názvy a hodnotami dost daleko od sebe (close: nejbližší k výchozí, jinak náhodně)
    const pickCards = (spec, eligible, count, spread, close, rng) => {
        if (eligible.length < count) return null;
        const value = (item) => Numeric.valueOf(spec, item);
        for (const anchor of shuffle(eligible, rng).slice(0, 16)) {
            const group = groupOf(spec, anchor);
            const chosen = [anchor];
            const names = new Set([normalizeAnswer(anchor.n)]);
            let candidates = shuffle(eligible, rng);
            if (close) candidates = candidates.map(item => [item, distance(spec.gap, value(anchor), value(item))]).sort((a, b) => a[1] - b[1]).map(([item]) => item);
            for (const candidate of candidates) {
                if (chosen.length === count) break;
                if (candidate.q === anchor.q || groupOf(spec, candidate) !== group || names.has(normalizeAnswer(candidate.n))) continue;
                if (!chosen.every(other => apart(spec.gap, value(other), value(candidate), spread))) continue;
                chosen.push(candidate);
                names.add(normalizeAnswer(candidate.n));
            }
            if (chosen.length === count) return chosen;
        }
        return null;
    };

    // Karty pro vlastnost a obtížnost. Když se z dat nedají sestavit (málo známých položek), postupně se povolí: menší odstup, méně známé
    // položky, nakonec méně karet (nejméně 5). Vrátí { items, cards, eased } nebo null
    const chooseCards = (spec, items, level, rng) => {
        const tries = [];
        for (let cards = level.cards; cards >= 5; cards--) {
            tries.push({ cards, known: level.known, spread: level.spread });
            if (level.spread > 1) tries.push({ cards, known: level.known, spread: 1 });
            if (level.known) tries.push({ cards, known: false, spread: 1 });
        }
        for (const [index, attempt] of tries.entries()) {
            const chosen = pickCards(spec, eligibleFor(spec, items, attempt.known), attempt.cards, attempt.spread, level.close, rng);
            if (chosen) return { items: chosen, cards: attempt.cards, eased: index > 0 };
        }
        return null;
    };

    // Kolik karet je na správném místě
    const placedCount = (order, correct) => order.filter((index, position) => index === correct[position]).length;

    // Kolo: karty (název, popisek, hodnota), správné pořadí a zamíchané pořadí na začátku.
    // order[pozice] = index karty, correct[pozice] = index karty ve správném pořadí, locked[pozice] = karta je zkontrolovaná na správném místě
    const makeRound = ({ spec: specId, items, level: levelId = 'medium', rng = Math.random, ctx = null, mode = 'practice', day = '' }) => {
        const spec = SPEC_BY_ID.get(specId);
        const level = LEVELS[levelId] || LEVELS.medium;
        if (!spec || !Array.isArray(items)) return null;
        const picked = chooseCards(spec, items, level, rng);
        if (!picked) return null;
        const dir = dirOf(spec);
        const unit = Numeric.UNITS[spec.unit];
        // Popisek pod názvem jen tehdy, když ho mají všechny karty a je stejného druhu (jako u otázky Seřaď) a nic neopakuje
        const details = picked.items.map(item => String((spec.detail ? spec.detail(item, ctx) : item.ty) || ''));
        const keys = spec.detail && spec.detail.keyOf ? picked.items.map(item => spec.detail.keyOf(item)) : null;
        const sameDetail = details.every(Boolean) && (!keys || keys.every(key => key === keys[0]));
        const cards = picked.items.map((item, index) => {
            const value = Numeric.valueOf(spec, item);
            const detail = sameDetail && !normalizeAnswer(item.n).includes(normalizeAnswer(details[index])) ? details[index] : '';
            return { id: item.q, name: item.n, detail, value, label: spec.label ? spec.label(item) : unit.format(value) };
        });
        const correct = cards.map((card, index) => index).sort((a, b) => (dir === 'desc' ? cards[b].value - cards[a].value : cards[a].value - cards[b].value));
        // Začíná se zamícháno: nejvýš jedna karta náhodou na správném místě, nikdy celé pořadí ani obrácené
        let order = shuffle(cards.map((card, index) => index), rng);
        for (let i = 0; i < 30 && placedCount(order, correct) > 1; i++) order = shuffle(order, rng);
        if (placedCount(order, correct) > 1 || order.join() === [...correct].reverse().join()) order = [...correct.slice(1), correct[0]];
        return {
            v: 1, mode, day, topic: spec.topic, spec: spec.id, dir, level: level.id, eased: picked.eased,
            title: specTitle(spec), subtitle: pickText(spec.order[dir][1], groupOf(spec, picked.items[0])),
            items: cards, correct, order, locked: cards.map(() => false), attempts: 0, checks: [], done: false
        };
    };

    // Řazení dne: stejné pro všechny (semínko = den, střední obtížnost); položky tak, jak byly v ten den (core.itemsAsOf).
    // Když by se vlastnost dne z dat nesestavila, vezme se další ze seznamu
    const dailyRound = (day, loadItems) => {
        const start = DAILY_SPECS.indexOf(dailySpecId(day));
        return (async () => {
            for (let step = 0; step < DAILY_SPECS.length; step++) {
                const specId = DAILY_SPECS[(start + step) % DAILY_SPECS.length];
                const spec = SPEC_BY_ID.get(specId);
                if (!spec) continue;
                const { items, ctx } = await loadItems(spec.topic);
                const dayItems = core.itemsAsOf ? core.itemsAsOf(items, day) : items;
                const round = makeRound({ spec: specId, items: dayItems, level: DAILY_LEVEL, rng: createSeededRandom(`serad-to|${day}|${specId}`), ctx, mode: 'daily', day });
                if (round) return round;
            }
            return null;
        })();
    };

    // --- Přesuny (jen mezi volnými místy; zamčené karty stojí) ---
    const freePositions = (round) => round.locked.map((locked, position) => (locked ? -1 : position)).filter(position => position >= 0);
    const isFree = (round, position) => Number.isInteger(position) && position >= 0 && position < round.order.length && !round.locked[position];
    // Nové pořadí po přesunu karty z volného místa from na volné místo to (karty mezi nimi se posunou o volné místo)
    const movedOrder = (round, from, to) => {
        if (round.done || !isFree(round, from) || !isFree(round, to) || from === to) return round.order;
        const free = freePositions(round);
        const sequence = free.map(position => round.order[position]);
        const [card] = sequence.splice(free.indexOf(from), 1);
        sequence.splice(free.indexOf(to), 0, card);
        const order = [...round.order];
        free.forEach((position, index) => { order[position] = sequence[index]; });
        return order;
    };
    const moveCard = (round, from, to) => ({ ...round, order: movedOrder(round, from, to) });
    // O jedno volné místo nahoru (delta −1) či dolů (+1); na kraji se nic nestane
    const neighbour = (round, position, delta) => {
        const free = freePositions(round);
        const index = free.indexOf(position);
        return index < 0 ? -1 : free[index + delta] === undefined ? -1 : free[index + delta];
    };
    const stepCard = (round, position, delta) => {
        const to = neighbour(round, position, delta);
        return to < 0 ? round : moveCard(round, position, to);
    };
    const swapCards = (round, a, b) => {
        if (round.done || !isFree(round, a) || !isFree(round, b) || a === b) return round;
        const order = [...round.order];
        [order[a], order[b]] = [order[b], order[a]];
        return { ...round, order };
    };

    // Kontrola: karty na správném místě se zamknou (newly = nově zamčené pozice), ostatní zůstanou volné (wrong)
    const check = (round) => {
        if (round.done) return { round, newly: [], wrong: [], placed: round.order.length, done: true };
        const locked = round.order.map((index, position) => round.locked[position] || index === round.correct[position]);
        const newly = locked.map((on, position) => (on && !round.locked[position] ? position : -1)).filter(position => position >= 0);
        const wrong = locked.map((on, position) => (on ? -1 : position)).filter(position => position >= 0);
        const placed = locked.filter(Boolean).length;
        const done = placed === round.order.length;
        const next = { ...round, locked, attempts: round.attempts + 1, checks: [...round.checks, placed], done };
        return { round: next, newly, wrong, placed, done };
    };

    // --- Uložený stav: dnešní XP volné hry, Řazení dne (historie a rozehraný den), počty a poslední výběr ---
    const count = (value, max = 1e7) => (Number.isFinite(value) && value > 0 ? Math.min(max, Math.floor(value)) : 0);
    const permutation = (list, length) => Array.isArray(list) && list.length === length && list.every(Number.isInteger) && new Set(list).size === length && list.every(index => index >= 0 && index < length);
    const parse = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const daily = {};
        for (const [day, entry] of Object.entries(data.daily && typeof data.daily === 'object' ? data.daily : {})) {
            if (DAY.test(day) && entry && typeof entry === 'object' && count(entry.attempts, 1000)) daily[day] = { attempts: count(entry.attempts, 1000), spec: SPEC_BY_ID.has(entry.spec) ? entry.spec : '' };
        }
        const last = data.last && typeof data.last === 'object' ? data.last : {};
        const play = data.play && typeof data.play === 'object' && DAY.test(data.play.day) ? data.play : null;
        return {
            v: 1, day: typeof data.day === 'string' && DAY.test(data.day) ? data.day : '', xp: count(data.xp, 100000),
            games: count(data.games), perfect: count(data.perfect), cards: count(data.cards), daily,
            // Rozehrané Řazení dne (odchod z obrazovky ho nezahodí): pořadí, zamčené karty a pokusy
            play: play && Array.isArray(play.order) && Array.isArray(play.locked) ? { day: play.day, order: play.order.slice(0, 9), locked: play.locked.slice(0, 9).map(Boolean), attempts: count(play.attempts, 1000), checks: Array.isArray(play.checks) ? play.checks.slice(0, 1000).map(value => count(value, 9)) : [] } : null,
            last: {
                topic: last.topic === 'mix' || TOPIC_IDS.includes(last.topic) ? last.topic : 'mix',
                spec: SPEC_BY_ID.has(last.spec) ? last.spec : '',
                level: LEVELS[last.level] ? last.level : 'medium'
            }
        };
    };
    const forDay = (state, day) => (state.day === day ? state : { ...state, day, xp: 0 });
    const xpLeftToday = (state, day) => Math.max(0, DAILY_XP_CAP - forDay(state, day).xp);
    const dailyDone = (state, day) => state.daily[day] || null;
    // Série Řazení dne: dny v řadě končící dneškem (nebo včerejškem, když dnešní ještě nehrál)
    const dailyStreak = (state, day) => {
        let cursor = state.daily[day] ? day : shiftDay(day, -1);
        let streak = 0;
        while (state.daily[cursor] && streak < HISTORY_DAYS) { streak++; cursor = shiftDay(cursor, -1); }
        return streak;
    };
    // Rozehrané Řazení dne do kola (jen stejný den a platné pořadí)
    const restorePlay = (state, round) => {
        const play = state.play;
        const n = round.order.length;
        if (!play || play.day !== round.day || !permutation(play.order, n) || play.locked.length !== n) return round;
        // Zamčená smí být jen karta, která na tom místě opravdu je správně
        const locked = play.locked.map((on, position) => on && play.order[position] === round.correct[position]);
        return { ...round, order: play.order, locked, attempts: play.attempts, checks: play.checks };
    };
    const savePlay = (state, round) => (round.mode === 'daily' && !round.done
        ? { ...state, play: { day: round.day, order: round.order, locked: round.locked, attempts: round.attempts, checks: round.checks } } : state);

    const xpPart = (label, xp) => ({ label, xp });
    const cardWord = (n) => (n === 1 ? 'kartu' : n >= 2 && n <= 4 ? 'karty' : 'karet');
    // Seřazené kolo: zapíše počty, Řazení dne a dnešní XP. Vrátí nový stav a XP s rozpisem ({ total, parts, note } jako Bleskovka)
    const finish = (stateInput, round, day) => {
        const state = forDay(parse(stateInput), day);
        const n = round.items.length;
        const first = round.attempts === 1;
        const base = { ...state, games: state.games + 1, perfect: state.perfect + (first ? 1 : 0), cards: state.cards + n };
        if (round.mode === 'daily') {
            if (state.daily[round.day]) return { state: { ...base, play: null }, xp: { total: 0, parts: [], note: '' }, first };
            const daily = { ...state.daily, [round.day]: { attempts: round.attempts, spec: round.spec } };
            for (const key of Object.keys(daily)) if (dayNumber(key) < dayNumber(day) - HISTORY_DAYS) delete daily[key];
            const parts = [xpPart('za Řazení dne', DAILY_XP), ...(first ? [xpPart('napoprvé', DAILY_FIRST_XP)] : [])];
            return { state: { ...base, daily, play: null }, xp: { total: parts.reduce((sum, part) => sum + part.xp, 0), parts, note: '' }, first };
        }
        const earned = n * XP_PER_CARD + (first ? FIRST_TRY_XP : 0);
        const room = Math.max(0, DAILY_XP_CAP - state.xp);
        const paid = Math.min(earned, room);
        const parts = [];
        if (paid > 0) parts.push(xpPart(`za ${n} ${cardWord(n)}${first ? ' napoprvé' : ''}${paid < earned ? ` (dnešní strop ${DAILY_XP_CAP} XP)` : ''}`, paid));
        const note = earned > paid ? (paid > 0 ? `Dnešní strop ${DAILY_XP_CAP} XP za volné řazení je naplněný.` : `Dnešní strop ${DAILY_XP_CAP} XP za volné řazení je vyčerpaný – hrát můžeš dál pro radost.`) : '';
        return { state: { ...base, xp: state.xp + paid }, xp: { total: paid, parts, note }, first };
    };

    // --- Vzhled (HTML) ---
    const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
    const attemptsText = (n) => plural(n, 'pokus', 'pokusy', 'pokusů');
    const CARD_FREE = 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-700';
    const CARD_PICKED = 'border-gold-500 bg-gold-50 ring-2 ring-gold-400 dark:border-gold-400 dark:bg-gold-900/30';
    const CARD_LOCKED = 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30';
    const BADGE_FREE = 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-100';
    const BADGE_LOCKED = 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950';
    const ARROW = 'flex h-10 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-200 dark:hover:bg-slate-600';

    // Řádek postupu: jeden dílek za každou kartu, zelený za zamčenou (viditelný postup ke 100 %)
    const progressHtml = (round) => {
        const placed = round.locked.filter(Boolean).length;
        return `
            <div class="flex items-center gap-2" data-sorting-progress="${placed}">
                <span class="flex min-w-0 flex-1 gap-1" aria-hidden="true">${round.locked.map(on => `<span class="h-2 flex-1 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}"></span>`).join('')}</span>
                <span class="shrink-0 text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300">Na místě ${placed} z ${round.order.length}</span>
            </div>`;
    };
    const cardLabel = (round, position) => {
        const card = round.items[round.order[position]];
        const where = `${position + 1}. místo: ${card.name}${card.detail ? `, ${card.detail}` : ''}`;
        return round.locked[position] ? `${where}. Na správném místě.` : `${where}. Šipkou nahoru nebo dolů kartu posuneš, klepnutím ji vybereš k prohození.`;
    };
    const cardHtml = (round, position, ui, marks) => {
        const index = round.order[position];
        const card = round.items[index];
        const locked = round.locked[position];
        const picked = ui.picked === position;
        const anim = marks.newly.includes(position) ? 'sort-snap' : marks.wrong.includes(position) ? 'sort-nudge' : '';
        const tight = round.order.length >= 7 ? 'min-h-[2.75rem]' : 'min-h-[3rem]';
        return `
            <li data-sort-slot="${position}">
                <div data-sort-card data-pos="${position}" data-item="${index}" class="sort-card ${anim} flex ${tight} touch-none select-none items-center gap-2 rounded-2xl border-2 py-0.5 pl-1.5 pr-0.5 ${locked ? CARD_LOCKED : picked ? CARD_PICKED : CARD_FREE}">
                    <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums ${locked ? BADGE_LOCKED : BADGE_FREE}" aria-hidden="true">${position + 1}</span>
                    <button type="button" data-action="sorting-card" data-pos="${position}" ${locked ? 'aria-disabled="true"' : `aria-pressed="${picked}"`} aria-label="${escapeHtml(cardLabel(round, position))}" class="min-w-0 flex-1 self-stretch py-1 text-left ${locked ? 'cursor-default' : 'cursor-grab'}">
                        <span class="line-clamp-1 break-words text-[15px] font-bold leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(card.name)}</span>
                        ${card.detail ? `<span class="block truncate text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${escapeHtml(card.detail)}</span>` : ''}
                    </button>
                    ${locked ? '<span class="flex h-10 w-12 shrink-0 items-center justify-center text-emerald-700 dark:text-emerald-300" aria-hidden="true"><i data-lucide="lock" class="h-4 w-4"></i></span>' : `
                    <span class="flex shrink-0" data-sort-arrow>
                        <button type="button" data-action="sorting-up" data-pos="${position}" ${neighbour(round, position, -1) < 0 ? 'disabled' : ''} aria-label="${escapeHtml(`Posunout ${card.name} výš`)}" class="${ARROW}"><i data-lucide="chevron-up" class="h-5 w-5"></i></button>
                        <button type="button" data-action="sorting-down" data-pos="${position}" ${neighbour(round, position, 1) < 0 ? 'disabled' : ''} aria-label="${escapeHtml(`Posunout ${card.name} níž`)}" class="${ARROW}"><i data-lucide="chevron-down" class="h-5 w-5"></i></button>
                    </span>`}
                </div>
            </li>`;
    };
    // Rada pod kartami: co dělat dál (bez slov o chybách)
    const hintText = (round, ui) => {
        if (ui.picked !== null && ui.picked !== undefined && round.items[round.order[ui.picked]]) return `Vybráno: ${round.items[round.order[ui.picked]].name}. Klepni na kartu, se kterou ji prohodit.`;
        if (!round.attempts) return 'Přetáhni karty, nebo je posuň šipkami. Pak klepni na Zkontrolovat.';
        const placed = round.locked.filter(Boolean).length;
        return `Zelené karty sedí a zůstanou. Zbylé ${round.order.length - placed === 1 ? 'přesuň' : 'přesuň mezi sebou'} a zkontroluj znovu.`;
    };
    const headerHtml = (round) => `
        <div class="flex flex-col items-center text-center">
            <h2 class="text-xl font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(round.title)}</h2>
            <p class="text-[13px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${escapeHtml(round.subtitle)}</p>
        </div>`;

    const playHtml = (round, ui, marks = { newly: [], wrong: [] }) => `
        <div data-sorting="play" class="fade-in flex min-h-full w-full flex-col gap-2 bg-slate-50 p-3 short:gap-1.5 short:py-2 dark:bg-slate-900">
            ${headerHtml(round)}
            ${progressHtml(round)}
            <ol data-sort-list class="relative flex flex-col gap-1.5" aria-label="Karty k seřazení">${round.order.map((index, position) => cardHtml(round, position, ui, marks)).join('')}</ol>
            <p data-sort-hint class="min-h-[2rem] text-center text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">${escapeHtml(hintText(round, ui))}</p>
            <p data-sort-live class="sr-only" aria-live="polite">${escapeHtml(ui.live || '')}</p>
            <div class="mt-auto flex items-center gap-2">
                <button type="button" data-action="sorting-check" class="btn-3d flex min-h-[3rem] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-base font-black text-white ${ui.style.button}">
                    <i data-lucide="check" class="h-5 w-5"></i> Zkontrolovat
                </button>
                <span class="shrink-0 text-center text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400" data-sort-attempts="${round.attempts}">${round.attempts ? `${attemptsText(round.attempts)}<br>zatím` : 'bez časovače'}</span>
            </div>
        </div>`;

    // Seřazeno: karty se skutečnými hodnotami postupně „zapadnou“ (sort-reveal se zpožděním sort-d1…), klepnutím popis položky
    const doneHtml = (round, ui) => {
        const first = round.attempts === 1;
        const rows = round.correct.map((index, position) => {
            const card = round.items[index];
            return `
                <li>
                    <button type="button" data-action="item-info" data-topic="${escapeHtml(round.topic)}" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(`${position + 1}. ${card.name}, ${card.label}. Klepnutím zobrazíš popis.`)}" class="sort-reveal sort-d${Math.min(7, position + 1)} flex ${round.order.length >= 7 ? 'min-h-[2.75rem]' : 'min-h-[3rem]'} w-full items-center gap-2 rounded-2xl border-2 px-1.5 py-0.5 text-left ${CARD_LOCKED}">
                        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums ${BADGE_LOCKED}" aria-hidden="true">${position + 1}</span>
                        <span class="min-w-0 flex-1">
                            <span class="line-clamp-1 break-words text-[15px] font-bold leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(card.name)}</span>
                            ${card.detail ? `<span class="block truncate text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${escapeHtml(card.detail)}</span>` : ''}
                        </span>
                        <span class="shrink-0 pr-1 text-right text-[13px] font-black tabular-nums leading-tight text-emerald-800 dark:text-emerald-200">${escapeHtml(card.label)}</span>
                    </button>
                </li>`;
        }).join('');
        const streak = round.mode === 'daily' && ui.streak > 1 ? ` · série ${ui.streak} dní` : '';
        return `
        <div data-sorting="done" class="fade-in flex min-h-full w-full flex-col gap-2 bg-slate-50 p-3 short:gap-1.5 short:py-2 dark:bg-slate-900">
            ${headerHtml(round)}
            <div data-verdict tabindex="-1" class="sort-pop flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 outline-none dark:border-emerald-800 dark:bg-emerald-900/30">
                ${ui.uiArt(first ? 'sova-vitez' : 'sova-radost', 'h-12 w-12 -my-1')}
                <div class="min-w-0 flex-1">
                    <p class="font-black leading-tight text-emerald-800 dark:text-emerald-200">${first ? 'Seřazeno napoprvé!' : `Seřazeno! ${attemptsText(round.attempts)}`}${escapeHtml(streak)}</p>
                    ${ui.xpHtml || ''}
                </div>
            </div>
            <ol class="flex flex-col gap-1.5" aria-label="Správné pořadí s hodnotami">${rows}</ol>
            <p class="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">Klepnutím na kartu se o ní dozvíš víc.</p>
            <div class="mt-auto flex gap-2">
                <button type="button" data-action="sorting-intro" class="btn-3d-light flex min-h-[3rem] shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-white px-4 text-base font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-100"><i data-lucide="list-ordered" class="h-5 w-5"></i> Výběr</button>
                <button type="button" data-action="sorting-start" class="btn-3d flex min-h-[3rem] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-base font-black text-white ${ui.style.button}"><i data-lucide="shuffle" class="h-5 w-5"></i> ${round.mode === 'daily' ? 'Hrát volně' : 'Další karty'}</button>
            </div>
        </div>`;
    };

    // Úvod: Řazení dne a volná hra (téma, vlastnost, obtížnost)
    const introHtml = (state, ui) => {
        const day = ui.day;
        const done = dailyDone(state, day);
        const spec = SPEC_BY_ID.get(dailySpecId(day));
        const playing = state.play && state.play.day === day && !done;
        const streak = dailyStreak(state, day);
        const settings = state.last;
        const options = (list) => list.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === (list.selected || '') ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
        const topicList = [['mix', 'Všechna témata'], ...ui.topics.map(topic => [topic.id, topic.title])];
        topicList.selected = settings.topic;
        const specList = settings.topic === 'mix' ? [['', 'Náhodná vlastnost']] : [['', 'Náhodná vlastnost'], ...specsFor(settings.topic).map(one => [one.id, specLabel(one)])];
        specList.selected = settings.topic === 'mix' ? '' : settings.spec;
        const left = xpLeftToday(state, day);
        const select = 'min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[15px] font-bold text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
        return `
        <div data-sorting="intro" class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 short:gap-2 dark:bg-slate-900">
            <div class="flex items-center gap-3">
                ${ui.uiArt('sova-premysleni', 'h-12 w-12 -my-1')}
                <div class="min-w-0">
                    <h1 class="text-2xl font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">Seřaď to</h1>
                    <p class="text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">Bez časovače, opravuj, kolikrát chceš.</p>
                </div>
            </div>
            <section class="${ui.card} p-3" aria-labelledby="sorting-daily-title">
                <div class="flex items-center gap-3">
                    <div class="min-w-0 flex-1">
                        <h2 id="sorting-daily-title" class="${ui.cardTitle}"><i data-lucide="calendar-days" class="h-4 w-4 ${ui.style.text}"></i> Řazení dne${streak > 1 ? ` <span class="rounded-md bg-gold-100 px-1.5 py-0.5 text-[10px] text-gold-800 dark:bg-gold-900/50 dark:text-gold-200">série ${streak}</span>` : ''}</h2>
                        <p class="mt-0.5 truncate text-[15px] font-bold leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(spec ? specLabel(spec) : '')}</p>
                        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">${done ? `Hotovo · ${attemptsText(done.attempts)}` : `${LEVELS[DAILY_LEVEL].cards} karet · stejné pro všechny`}</p>
                    </div>
                    <button type="button" data-action="sorting-daily" class="${done ? 'btn-3d-light bg-white text-slate-700 dark:bg-slate-700 dark:text-slate-100' : `btn-3d text-white ${ui.style.button}`} flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-2xl px-4 text-sm font-black">
                        <i data-lucide="${done ? 'check' : 'play'}" class="h-4 w-4"></i> ${done ? 'Ukázat' : playing ? 'Pokračovat' : 'Hrát'}
                    </button>
                </div>
            </section>
            <section class="${ui.card} flex flex-col gap-2 p-3" aria-labelledby="sorting-free-title">
                <h2 id="sorting-free-title" class="${ui.cardTitle}"><i data-lucide="shuffle" class="h-4 w-4 ${ui.style.text}"></i> Volná hra</h2>
                <label class="flex items-center gap-2"><span class="w-[4.5rem] shrink-0 text-xs font-bold leading-tight text-slate-600 dark:text-slate-300">Téma</span>
                    <select id="sorting-topic" class="${select}">${options(topicList)}</select></label>
                <label class="flex items-center gap-2"><span class="w-[4.5rem] shrink-0 text-xs font-bold leading-tight text-slate-600 dark:text-slate-300">Podle čeho</span>
                    <select id="sorting-spec" class="${select}" ${settings.topic === 'mix' ? 'disabled' : ''}>${options(specList)}</select></label>
                <div role="group" aria-label="Obtížnost" class="grid grid-cols-3 gap-1.5">
                    ${LEVEL_IDS.map(id => `<button type="button" data-action="sorting-level" data-level="${id}" aria-pressed="${settings.level === id}" title="${escapeHtml(LEVELS[id].note)}" class="flex min-h-[2.75rem] flex-col items-center justify-center rounded-xl border-2 px-1 py-1 text-center ${settings.level === id ? ui.style.on : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'}"><span class="text-sm font-black leading-tight">${LEVELS[id].title}</span><span class="text-[11px] font-semibold leading-tight opacity-80">${LEVELS[id].cards} karet</span></button>`).join('')}
                </div>
                <button type="button" data-action="sorting-start" class="btn-3d flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-black text-white ${ui.style.button}"><i data-lucide="play" class="h-5 w-5"></i> Hrát</button>
            </section>
            <p class="text-center text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${left > 0 ? `${XP_PER_CARD} XP za kartu, napoprvé +${FIRST_TRY_XP} XP · dnes ještě až ${left} XP` : `Dnešní strop ${DAILY_XP_CAP} XP je vyčerpaný, hraj dál pro radost.`}</p>
        </div>`;
    };
    const loadingHtml = (ui) => `
        <div data-sorting="loading" class="flex min-h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 p-6 dark:bg-slate-900">
            ${ui.uiArt('sova-premysleni', 'bob h-20 w-20')}
            <p class="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Chystám karty…</p>
        </div>`;
    const errorHtml = (ui) => `
        <div data-sorting="error" class="fade-in flex min-h-full flex-col items-center justify-center gap-2 bg-slate-50 p-8 text-center dark:bg-slate-900">
            <i data-lucide="wifi-off" class="mb-2 h-14 w-14 text-slate-300 dark:text-slate-600"></i>
            <h2 class="text-xl font-bold text-slate-700 dark:text-slate-200">Karty se nepodařilo připravit</h2>
            <p class="mb-3 text-slate-500 dark:text-slate-400">Zkontroluj připojení k internetu a zkus to znovu.</p>
            <button type="button" data-action="sorting-intro" class="btn-3d rounded-2xl px-6 py-3 font-bold text-white ${ui.style.button}">Zpět na výběr</button>
        </div>`;

    // --- Ovladač obrazovky (prohlížeč) ---
    // deps: appContent, setScreen, getScreen, renderHome, renderIcons, updateControlsUI, closePlaceInfo, uiArt, topics (seznam témat
    // { id, title }), loadTopic, readJson, writeJson, getDayKey, xpLine, awardXp(xp) → xp s odznaky, style (barvy tlačítek), card, cardTitle, sound
    const createController = (deps) => {
        let view = null; // 'intro' | 'loading' | 'play' | 'done' | 'error'
        let round = null;
        let picked = null;
        let live = '';
        let xpHtml = '';
        let token = 0;
        let drag = null;
        let draggedAt = 0;
        const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const load = () => parse(deps.readJson(KEY));
        const save = (state) => deps.writeJson(KEY, state);
        const today = () => deps.getDayKey();
        const topics = () => deps.topics().filter(topic => TOPIC_IDS.includes(topic.id));
        const ui = () => ({ uiArt: deps.uiArt, style: deps.style, card: deps.card, cardTitle: deps.cardTitle, picked, live, xpHtml, day: today(), topics: topics(), streak: dailyStreak(load(), today()) });
        const root = () => deps.appContent.firstElementChild;

        // FLIP: karty se z původního místa plynule přesunou na nové (při „omezit pohyb“ hned)
        const rects = () => new Map([...deps.appContent.querySelectorAll('[data-sort-card]')].map(el => [el.dataset.item, el.getBoundingClientRect().top]));
        const glide = (before) => {
            if (!before || calm()) return;
            deps.appContent.querySelectorAll('[data-sort-card]').forEach(el => {
                const from = before.get(el.dataset.item);
                const dy = from === undefined ? 0 : from - el.getBoundingClientRect().top;
                if (!dy) return;
                el.style.transition = 'none';
                el.style.transform = `translateY(${dy}px)`;
                requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform 220ms ease-out'; el.style.transform = ''; }));
            });
        };
        const paint = (html, { focus = null, before = null, top = true } = {}) => {
            deps.setScreen('sorting');
            deps.closePlaceInfo();
            deps.appContent.innerHTML = html;
            deps.renderIcons(deps.appContent);
            if (top) deps.appContent.scrollTo(0, 0);
            deps.updateControlsUI();
            glide(before);
            const wrap = root();
            if (!wrap) return;
            if (view === 'intro') wrap.addEventListener('change', onChange);
            if (view === 'play') {
                const list = wrap.querySelector('[data-sort-list]');
                list.addEventListener('pointerdown', onDown);
                list.addEventListener('keydown', onKey);
            }
            if (focus) { const el = wrap.querySelector(focus); if (el) el.focus({ preventScroll: true }); }
            if (view === 'done') { const verdict = wrap.querySelector('[data-verdict]'); if (verdict) verdict.focus({ preventScroll: true }); }
        };
        const render = (options = {}) => {
            if (view === 'intro') paint(introHtml(load(), ui()), options);
            else if (view === 'loading') paint(loadingHtml(ui()), options);
            else if (view === 'error') paint(errorHtml(ui()), options);
            else if (view === 'done' && round) paint(doneHtml(round, ui()), options);
            else if (round) paint(playHtml(round, ui(), options.marks), { top: false, ...options });
        };

        const open = () => { stopDrag(); view = 'intro'; round = null; picked = null; render(); };
        const leave = () => { stopDrag(); token++; view = null; round = null; deps.renderHome(); };
        const back = () => { if (view === 'intro' || view === null) leave(); else open(); };

        // Uloží rozehrané Řazení dne (po každém přesunu i kontrole)
        const keep = () => { if (round && round.mode === 'daily') save(savePlay(load(), round)); };
        const loadItems = async (topicId) => { const ctx = await deps.loadTopic(topicId); return { items: ctx.items, ctx }; };

        const startDaily = async () => {
            const day = today();
            const mine = ++token;
            view = 'loading';
            render();
            try {
                const made = await dailyRound(day, loadItems);
                if (mine !== token) return;
                if (!made) throw new Error('Řazení dne nejde sestavit');
                const state = load();
                round = restorePlay(state, made);
                const done = dailyDone(state, day);
                // Už seřazené: ukáže se výsledek (bez dalších XP)
                if (done) { round = { ...round, order: [...round.correct], locked: round.correct.map(() => true), attempts: done.attempts, done: true }; xpHtml = ''; view = 'done'; }
                else view = 'play';
                picked = null;
                live = '';
                render();
            } catch (error) {
                if (mine !== token) return;
                view = 'error';
                render();
            }
        };
        const startPractice = async () => {
            const state = load();
            const settings = state.last;
            const mine = ++token;
            view = 'loading';
            render();
            try {
                const rng = Math.random;
                let made = null;
                for (let attempt = 0; attempt < 6 && !made; attempt++) {
                    const topicId = settings.topic === 'mix' ? TOPIC_IDS[Math.floor(rng() * TOPIC_IDS.length)] : settings.topic;
                    const specs = specsFor(topicId);
                    const specId = settings.topic !== 'mix' && settings.spec && attempt === 0 ? settings.spec : specs[Math.floor(rng() * specs.length)].id;
                    const { items, ctx } = await loadItems(topicId);
                    made = makeRound({ spec: specId, items, level: settings.level, rng, ctx, mode: 'practice' });
                }
                if (mine !== token) return;
                if (!made) throw new Error('Karty nejde sestavit');
                round = made;
                picked = null;
                live = '';
                view = 'play';
                render();
            } catch (error) {
                if (mine !== token) return;
                view = 'error';
                render();
            }
        };

        const announce = (text) => { live = text; const el = deps.appContent.querySelector('[data-sort-live]'); if (el) el.textContent = text; };
        const positionOf = (itemIndex) => round.order.indexOf(itemIndex);
        // Přesun s plynulým posunem karet, ohlášením pro čtečku a zachovaným fokusem
        const apply = (next, itemIndex, focusSel) => {
            if (!next || next.order === round.order) return;
            const before = rects();
            round = next;
            picked = null;
            keep();
            const card = round.items[itemIndex];
            live = card ? `${card.name} je teď na ${positionOf(itemIndex) + 1}. místě.` : '';
            render({ before, focus: focusSel ? focusSel(positionOf(itemIndex)) : null });
        };
        const step = (position, delta, arrow = false) => {
            if (!round || round.done || !isFree(round, position)) return;
            const itemIndex = round.order[position];
            const next = stepCard(round, position, delta);
            if (next === round) return;
            apply(next, itemIndex, (to) => {
                const own = `[data-action="${delta < 0 ? 'sorting-up' : 'sorting-down'}"][data-pos="${to}"]`;
                return arrow && neighbour(next, to, delta) >= 0 ? own : `[data-action="sorting-card"][data-pos="${to}"]`;
            });
        };
        const tap = (position) => {
            if (Date.now() - draggedAt < 400 || !round || round.done || !isFree(round, position)) return;
            if (picked === null) { picked = position; live = `Vybráno: ${round.items[round.order[position]].name}.`; render({ focus: `[data-action="sorting-card"][data-pos="${position}"]` }); return; }
            if (picked === position) { picked = null; live = 'Výběr zrušen.'; render({ focus: `[data-action="sorting-card"][data-pos="${position}"]` }); return; }
            const itemIndex = round.order[picked];
            apply(swapCards(round, picked, position), itemIndex, () => `[data-action="sorting-card"][data-pos="${position}"]`);
        };
        const checkNow = () => {
            if (!round || round.done) return;
            stopDrag();
            const result = check(round);
            round = result.round;
            picked = null;
            if (result.done) {
                const outcome = finish(deps.readJson(KEY), round, today());
                save(outcome.state);
                const xp = outcome.xp.total || outcome.xp.note ? deps.awardXp(outcome.xp) : outcome.xp;
                xpHtml = deps.xpLine(xp, 'text-emerald-800 dark:text-emerald-300') + (xp.note ? `<p class="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">${escapeHtml(xp.note)}</p>` : '');
                if (deps.sound) deps.sound.play(outcome.first ? 'record' : 'correct');
                view = 'done';
                render();
                return;
            }
            keep();
            if (deps.sound && result.newly.length) deps.sound.play('correct');
            live = `Na místě ${result.placed} z ${round.order.length}.`;
            render({ marks: { newly: result.newly, wrong: result.wrong } });
        };

        // --- Přetahování (Pointer Events): karta jede za prstem, ostatní volné uhýbají; zamčené stojí ---
        const cards = () => [...deps.appContent.querySelectorAll('[data-sort-card]')];
        const stopDrag = () => {
            if (!drag) return;
            cards().forEach(el => { el.style.transform = ''; el.style.transition = ''; el.classList.remove('sort-lift'); });
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            drag = null;
        };
        const onDown = (event) => {
            if (drag || !round || round.done || (event.button !== undefined && event.button > 0) || event.target.closest('[data-sort-arrow]')) return;
            const el = event.target.closest('[data-sort-card]');
            const position = el ? Number(el.dataset.pos) : -1;
            if (!el || !isFree(round, position)) return;
            const slots = cards().map(card => { const rect = card.getBoundingClientRect(); return { pos: Number(card.dataset.pos), top: rect.top, mid: rect.top + rect.height / 2, el: card }; }).sort((a, b) => a.pos - b.pos);
            drag = { pointer: event.pointerId, from: position, startY: event.clientY, active: false, target: position, slots, el };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
        };
        const onMove = (event) => {
            if (!drag || event.pointerId !== drag.pointer) return;
            const dy = event.clientY - drag.startY;
            if (!drag.active && Math.abs(dy) < 8) return;
            if (!drag.active) { drag.active = true; drag.el.classList.add('sort-lift'); picked = null; }
            event.preventDefault();
            drag.el.style.transition = 'none';
            drag.el.style.transform = `translateY(${dy}px)`;
            const mid = drag.slots[drag.from].mid + dy;
            const free = freePositions(round);
            const target = free.reduce((best, position) => (Math.abs(drag.slots[position].mid - mid) < Math.abs(drag.slots[best].mid - mid) ? position : best), drag.from);
            if (target === drag.target) return;
            drag.target = target;
            const preview = movedOrder(round, drag.from, target);
            drag.slots.forEach(slot => {
                if (slot.pos === drag.from || round.locked[slot.pos]) return;
                const to = preview.indexOf(round.order[slot.pos]);
                slot.el.style.transition = calm() ? 'none' : 'transform 150ms ease-out';
                slot.el.style.transform = to === slot.pos ? '' : `translateY(${drag.slots[to].top - slot.top}px)`;
            });
        };
        const onUp = (event) => {
            if (!drag || event.pointerId !== drag.pointer) return;
            const { active, from, target } = drag;
            if (!active) { stopDrag(); return; }
            draggedAt = Date.now();
            const before = rects();
            const itemIndex = round.order[from];
            stopDrag();
            if (target === from) { render({ before }); return; }
            const next = moveCard(round, from, target);
            round = next;
            keep();
            live = `${round.items[itemIndex].name} je teď na ${positionOf(itemIndex) + 1}. místě.`;
            render({ before });
        };
        const onCancel = (event) => { if (drag && event.pointerId === drag.pointer) stopDrag(); };
        const onKey = (event) => {
            const button = event.target.closest('[data-action="sorting-card"]');
            if (!button || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
            event.preventDefault();
            step(Number(button.dataset.pos), event.key === 'ArrowUp' ? -1 : 1);
        };
        const onChange = (event) => {
            const state = load();
            if (event.target.id === 'sorting-topic') save({ ...state, last: { ...state.last, topic: event.target.value, spec: '' } });
            else if (event.target.id === 'sorting-spec') save({ ...state, last: { ...state.last, spec: event.target.value } });
            else return;
            render({ focus: `#${event.target.id}`, top: false });
        };

        const actions = {
            'sorting-open': () => { if (!deps.isLoading || !deps.isLoading()) open(); },
            'sorting-intro': () => open(),
            'sorting-daily': () => startDaily(),
            'sorting-start': () => startPractice(),
            'sorting-level': (button) => {
                const state = load();
                if (!LEVELS[button.dataset.level]) return;
                save({ ...state, last: { ...state.last, level: button.dataset.level } });
                render({ focus: `[data-level="${button.dataset.level}"]`, top: false });
            },
            'sorting-card': (button) => tap(Number(button.dataset.pos)),
            'sorting-up': (button) => step(Number(button.dataset.pos), -1, true),
            'sorting-down': (button) => step(Number(button.dataset.pos), 1, true),
            'sorting-check': () => checkNow()
        };
        return {
            actions, open, leave, back,
            // Rozehrané kolo (oslavy úrovně počkají na výsledek); spodní lišta je jen na úvodu (app.js CALM_SCREENS), ať se 7 karet vejde
            isPlaying: () => deps.getScreen() === 'sorting' && (view === 'play' || view === 'loading'),
            place: () => ({ icon: 'list-ordered', text: round && view !== 'intro' && round.mode === 'daily' ? 'Řazení dne' : 'Seřaď to' }),
            games: () => load().games,
            // Jen pro testy: stav kola
            debug: () => ({ view, round })
        };
    };

    return {
        KEY, LEVELS, LEVEL_IDS, XP_PER_CARD, FIRST_TRY_XP, DAILY_XP_CAP, DAILY_XP, DAILY_FIRST_XP, DAILY_SPECS, DAILY_LEVEL, TOPIC_IDS,
        SPEC_BY_ID, specsFor, specLabel, dirOf, dailySpecId, apart, chooseCards, makeRound, dailyRound, placedCount,
        freePositions, movedOrder, moveCard, stepCard, swapCards, neighbour, check,
        parse, forDay, xpLeftToday, dailyDone, dailyStreak, restorePlay, savePlay, finish,
        introHtml, playHtml, doneHtml, createController
    };
});
