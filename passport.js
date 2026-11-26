// Cestovní pas: sbírka razítek za státy světa. Za každý stát, který hráč správně pozná, dostane do pasu razítko s vlajkou a datem
// prvního získání. Čistá logika bez DOMu (stav, razítka, stránky knihy) a HTML stránek pasu; napojení na hru (zápis po odpovědi,
// okno, listování, zvuk) dělá app.js v oddílu „Cestovní pas“.
//
// Pravidla (předvídatelná, bez trestů):
// - Razítko dává správná odpověď na položku, která je státem: v Zeměpisu stát sám (kategorie Státy, i otázka Ukaž na mapě)
//   a hlavní město státu (Města, druh „hlavní město“), ve Vlajkách a znacích vlajka nebo státní znak státu. Na druhu otázky
//   (výběr, psaní, mapa) nezáleží. Chyba nic nebere, razítko zůstane navždy.
// - Státy jsou podle data/countries.json (197 států, kontinent v poli continent). Na každý kontinent je v pasu pevná mřížka
//   všech jeho států podle abecedy; prázdné místo ukazuje obrys a název. Kontinent s víc než 18 státy má víc stránek (nejvýš 18 na stránku,
//   stránky stejně velké), takže se stránka vejde na telefon 360 × 640 bez posouvání.
// - Datum je den prvního získání. Pas zpětně naplní dosavadní poznané položky (mudrlant.learned), jejich den ale neznáme:
//   taková razítka mají místo data „dřív“. Doplnění proběhne pro každé téma jednou (filled), až je téma načtené.
// - Za kompletní kontinent je velké razítko s dnem, kdy se kontinent doplnil (u zpětně doplněného kontinentu „dřív“).
// - Nová razítka (seen je nemá) se v pasu „bouchnou“ (animace, při „omezit pohyb“ jen štítek Nové) a pak se zapíšou jako viděná.
// Stav je jen v zařízení (mudrlant.passport) jako poznané položky; server nepotřebuje.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantCore || (isNode ? require('./quiz-core.js') : null), root.MudrlantFlags || (isNode ? require('./look-flags.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantPassport = api;
})(typeof self !== 'undefined' ? self : this, (Core, Flags) => {
    'use strict';
    const KEY = 'mudrlant.passport';
    // Témata, ze kterých jdou razítka
    const TOPICS = ['zemepis', 'vlajky'];
    // Pořadí kontinentů v pasu a barva inkoustu razítek (Tailwind třídy, ať je build:css najde)
    const CONTINENTS = [
        { id: 'EU', name: 'Evropa', ink: 'text-sky-700 dark:text-sky-300', border: 'border-sky-600 dark:border-sky-400', soft: 'bg-sky-50 dark:bg-sky-950/40', bar: 'bg-sky-600 dark:bg-sky-400' },
        { id: 'AS', name: 'Asie', ink: 'text-rose-700 dark:text-rose-300', border: 'border-rose-600 dark:border-rose-400', soft: 'bg-rose-50 dark:bg-rose-950/40', bar: 'bg-rose-600 dark:bg-rose-400' },
        { id: 'AF', name: 'Afrika', ink: 'text-amber-800 dark:text-amber-300', border: 'border-amber-600 dark:border-amber-400', soft: 'bg-amber-50 dark:bg-amber-950/40', bar: 'bg-amber-600 dark:bg-amber-400' },
        { id: 'NA', name: 'Severní Amerika', ink: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-600 dark:border-emerald-400', soft: 'bg-emerald-50 dark:bg-emerald-950/40', bar: 'bg-emerald-600 dark:bg-emerald-400' },
        { id: 'SA', name: 'Jižní Amerika', ink: 'text-teal-700 dark:text-teal-300', border: 'border-teal-600 dark:border-teal-400', soft: 'bg-teal-50 dark:bg-teal-950/40', bar: 'bg-teal-600 dark:bg-teal-400' },
        { id: 'OC', name: 'Austrálie a Oceánie', ink: 'text-violet-700 dark:text-violet-300', border: 'border-violet-600 dark:border-violet-400', soft: 'bg-violet-50 dark:bg-violet-950/40', bar: 'bg-violet-600 dark:bg-violet-400' }
    ];
    const CONTINENT_BY_ID = new Map(CONTINENTS.map(continent => [continent.id, continent]));
    const PAGE_MAX = 18;
    // Počet států v data/countries.json (dlaždice v Mém postupu ho ukáže, i když data států ještě nejsou načtená; hlídá tests/passport.test.js)
    const TOTAL = 197;
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const QID = /^Q\d{1,10}$/;
    const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const esc = (text) => (Core && Core.escapeHtml ? Core.escapeHtml(String(text)) : String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));

    // --- Stav ---
    // { v: 1, stamps: { QID: 'RRRR-MM-DD' | '' (zpětně, den neznámý) }, done: { kontinent: den | '' }, filled: { téma: true }, seen: [QID], doneSeen: [kontinent] }
    const EMPTY = { v: 1, stamps: {}, done: {}, filled: {}, seen: [], doneSeen: [] };
    const parse = (value) => {
        const v = isObject(value) ? value : {};
        const stamps = {};
        if (isObject(v.stamps)) for (const [id, day] of Object.entries(v.stamps)) if (QID.test(id) && (day === '' || DAY.test(day))) stamps[id] = day;
        const done = {};
        if (isObject(v.done)) for (const [id, day] of Object.entries(v.done)) if (CONTINENT_BY_ID.has(id) && (day === '' || DAY.test(day))) done[id] = day;
        const filled = {};
        if (isObject(v.filled)) for (const topic of TOPICS) if (v.filled[topic] === true) filled[topic] = true;
        const seen = Array.isArray(v.seen) ? [...new Set(v.seen.filter(id => Object.prototype.hasOwnProperty.call(stamps, id)))] : [];
        const doneSeen = Array.isArray(v.doneSeen) ? [...new Set(v.doneSeen.filter(id => Object.prototype.hasOwnProperty.call(done, id)))] : [];
        return { v: 1, stamps, done, filled, seen, doneSeen };
    };

    // --- Který stát položka představuje ---
    const single = (item) => (Array.isArray(item.co) && item.co.length === 1 ? item.co[0] : null);
    // QID státu, za který položka tématu dává razítko, jinak null; countries = data/countries.json (countries)
    const stampOf = (topicId, item, countries) => {
        if (!item || !isObject(countries)) return null;
        let id = null;
        if (topicId === 'zemepis') {
            if (item.c === 'stat') id = item.q;
            else if (item.c === 'mesto' && item.ty === 'hlavní město') id = single(item);
        } else if (topicId === 'vlajky' && (item.c === 'vlajka' || item.c === 'znak')) id = single(item);
        return id && Object.prototype.hasOwnProperty.call(countries, id) && CONTINENT_BY_ID.has(countries[id].continent) ? id : null;
    };

    // Státy kontinentu podle abecedy: [{ id, name }]
    const collator = typeof Intl !== 'undefined' ? new Intl.Collator('cs') : null;
    const byName = (a, b) => (collator ? collator.compare(a.name, b.name) : a.name.localeCompare(b.name));
    const countriesOf = (countries, continentId) => Object.entries(countries || {})
        .filter(([, country]) => country && country.continent === continentId)
        .map(([id, country]) => ({ id, name: country.name })).sort(byName);
    // Kontinenty, které právě zkompletovalo razítko (nebo zpětné doplnění): den se zapíše jen jednou
    const settleDone = (state, countries, day) => {
        const done = { ...state.done };
        for (const continent of CONTINENTS) {
            if (Object.prototype.hasOwnProperty.call(done, continent.id)) continue;
            const list = countriesOf(countries, continent.id);
            if (list.length && list.every(country => Object.prototype.hasOwnProperty.call(state.stamps, country.id))) done[continent.id] = day;
        }
        return { ...state, done };
    };

    // Zpětné doplnění z poznaných položek tématu (ids) podle položek tématu (byId: Map id → položka). Razítka bez data, rovnou viděná
    // (nebouchají se), celé kontinenty také. Vrací { state, added: počet nových razítek }.
    const backfill = (stateInput, topicId, ids, byId, countries) => {
        const state = parse(stateInput);
        if (!TOPICS.includes(topicId) || state.filled[topicId]) return { state, added: 0 };
        const stamps = { ...state.stamps };
        const seen = new Set(state.seen);
        let added = 0;
        for (const id of Array.isArray(ids) ? ids : []) {
            const country = stampOf(topicId, byId && byId.get ? byId.get(id) : null, countries);
            if (!country || Object.prototype.hasOwnProperty.call(stamps, country)) continue;
            stamps[country] = '';
            seen.add(country);
            added += 1;
        }
        const next = settleDone({ ...state, stamps, seen: [...seen], filled: { ...state.filled, [topicId]: true } }, countries, '');
        next.doneSeen = [...new Set([...next.doneSeen, ...Object.keys(next.done).filter(id => !Object.prototype.hasOwnProperty.call(state.done, id))])];
        return { state: next, added };
    };

    // Správná odpověď na položku: razítko, pokud ho stát ještě nemá. Vrací { state, stamp: QID | null, continent: id | null (právě kompletní) }
    const record = (stateInput, topicId, item, countries, day) => {
        const state = parse(stateInput);
        const id = stampOf(topicId, item, countries);
        if (!id || Object.prototype.hasOwnProperty.call(state.stamps, id) || !DAY.test(String(day))) return { state, stamp: null, continent: null };
        const next = settleDone({ ...state, stamps: { ...state.stamps, [id]: day } }, countries, day);
        const continent = countries[id].continent;
        return { state: next, stamp: id, continent: !Object.prototype.hasOwnProperty.call(state.done, continent) && Object.prototype.hasOwnProperty.call(next.done, continent) ? continent : null };
    };

    // Razítka a celé kontinenty, které hráč v pasu ještě neviděl
    const freshStamps = (stateInput) => { const state = parse(stateInput); const seen = new Set(state.seen); return Object.keys(state.stamps).filter(id => !seen.has(id)); };
    const freshDone = (stateInput) => { const state = parse(stateInput); const seen = new Set(state.doneSeen); return Object.keys(state.done).filter(id => !seen.has(id)); };
    const markSeen = (stateInput, ids = [], continents = []) => {
        const state = parse(stateInput);
        return parse({ ...state, seen: [...state.seen, ...ids], doneSeen: [...state.doneSeen, ...continents] });
    };

    // --- Kniha ---
    // Vlajka státu podle jména (look-flags.js: vlajky států z Vlajek a znaků); stát bez vlajky v datech má null
    let flagsByName = null;
    const flagOf = (name) => {
        if (!Flags || !Flags.list) return null;
        if (!flagsByName) flagsByName = new Map(Flags.list().map(flag => [flag.name, flag]));
        return flagsByName.get(name) || null;
    };
    // Rozdělení kontinentu na stejně velké stránky po nejvýš PAGE_MAX státech
    const chunk = (list) => {
        const count = Math.max(1, Math.ceil(list.length / PAGE_MAX));
        const size = Math.ceil(list.length / count);
        return Array.from({ length: count }, (_, index) => list.slice(index * size, (index + 1) * size));
    };
    // { have, total, percent, continents: [{ ...kontinent, have, total, complete, doneDay, fresh, firstPage, pages }], pages: [{ kind: 'cover' } | { kind: 'continent', continent, part, parts, cells }] }
    // buňka: { id, name, flag, have, day, fresh }
    const book = (stateInput, countries) => {
        const state = parse(stateInput);
        const fresh = new Set(freshStamps(state));
        const pages = [{ kind: 'cover' }];
        const continents = CONTINENTS.map(continent => {
            const list = countriesOf(countries, continent.id).map(country => ({
                ...country, flag: flagOf(country.name), have: Object.prototype.hasOwnProperty.call(state.stamps, country.id),
                day: state.stamps[country.id] || '', fresh: fresh.has(country.id)
            }));
            const have = list.filter(cell => cell.have).length;
            const parts = chunk(list);
            const entry = {
                ...continent, have, total: list.length, complete: list.length > 0 && have === list.length,
                doneDay: Object.prototype.hasOwnProperty.call(state.done, continent.id) ? state.done[continent.id] : null,
                doneFresh: Object.prototype.hasOwnProperty.call(state.done, continent.id) && !state.doneSeen.includes(continent.id),
                fresh: list.filter(cell => cell.fresh).length, firstPage: pages.length
            };
            if (list.length) parts.forEach((cells, part) => pages.push({ kind: 'continent', continent: entry, part, parts: parts.length, cells }));
            return entry;
        }).filter(continent => continent.total > 0);
        const have = continents.reduce((sum, continent) => sum + continent.have, 0);
        const total = continents.reduce((sum, continent) => sum + continent.total, 0);
        return { have, total, percent: total ? Math.floor((have / total) * 100 + 1e-9) : 0, continents, pages, fresh: fresh.size };
    };
    // První stránka s novým razítkem (nebo nově kompletním kontinentem), jinak 0 (obálka)
    const firstFreshPage = (pass) => {
        const index = pass.pages.findIndex(page => page.kind === 'continent' && (page.cells.some(cell => cell.fresh) || (page.part === 0 && page.continent.doneFresh)));
        return index < 0 ? 0 : index;
    };

    // --- Texty ---
    const plural = (count, one, few, many) => (Core && Core.plural ? Core.plural(count, one, few, many) : `${count} ${many}`);
    const formatDay = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : ''; };
    const dayLabel = (day) => formatDay(day) || 'dřív';
    const RULES = 'Razítko dostaneš za každý stát, který správně poznáš: v Zeměpisu stát nebo jeho hlavní město, ve Vlajkách a znacích vlajku nebo státní znak. Chyba nic nebere.';
    const shareText = (pass) => [
        `Můj cestovní pas v Mudrlantovi: ${pass.have} / ${pass.total} států`,
        ...pass.continents.map(continent => `${continent.complete ? '✅' : '▫️'} ${continent.name} ${continent.have} / ${continent.total}`)
    ].join('\n');
    // Malý signál po odpovědi (čip pod výsledkem)
    const chipText = (name) => `Razítko do pasu: ${name}`;

    // --- HTML ---
    // Rotace razítek podle státu (pevná, ať se pas při každém otevření neliší)
    const TILTS = ['-rotate-3', '-rotate-2', '-rotate-1', 'rotate-1', 'rotate-2', 'rotate-3'];
    const tiltOf = (id) => TILTS[[...String(id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TILTS.length];
    // Zpoždění bouchnutí po sobě (nejvýš 8 tříd, další razítka bouchnou s posledním)
    const delayOf = (index) => `pas-d${Math.min(index, 7)}`;
    const bar = (have, total, cls) => `<span class="block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full rounded-full ${cls}" data-progress="${total ? Math.round((have / total) * 100) : 0}"></span></span>`;
    // Velké razítko kontinentu (kruh s dvojitým okrajem); size = třídy velikosti
    // mini = malá pečeť jen s fajfkou (řádek kontinentu na obálce). Rotace je na obalu, bouchnutí na kruhu.
    const bigStampHtml = (continent, { size = 'h-16 w-16', fresh = false, reduced = false, mini = false } = {}) => `
        <span data-pas-big="${continent.id}" class="flex shrink-0 -rotate-12" title="${esc(`${continent.name}: všechny státy (${dayLabel(continent.doneDay)})`)}" role="img" aria-label="${esc(`Velké razítko: ${continent.name} kompletní`)}">
            <span class="pas-ink pas-big ${size} ${continent.ink} ${continent.border} ${fresh && !reduced ? 'pas-thud' : ''} flex flex-col items-center justify-center rounded-full ${mini ? 'border-[3px]' : 'border-4'} border-double bg-white/60 text-center dark:bg-slate-900/40">
                ${mini ? '<i data-lucide="check" class="h-4 w-4"></i>' : `<span class="text-[7px] font-black uppercase leading-none">Kompletní</span>
                <i data-lucide="check" class="my-0.5 h-4 w-4"></i>
                <span class="whitespace-nowrap text-[7px] font-black uppercase leading-none">${esc(dayLabel(continent.doneDay))}</span>`}
            </span>
        </span>`;
    const cellHtml = (cell, continent, order, reduced) => {
        if (!cell.have) {
            return `<li data-pas-cell="${esc(cell.id)}" title="${esc(`${cell.name}: zatím bez razítka`)}" class="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-slate-300 px-0.5 py-0.5 text-center dark:border-slate-600">
                <span class="h-4 w-6 rounded-sm border border-dashed border-slate-300 dark:border-slate-600 short:h-3.5 short:w-5" aria-hidden="true"></span>
                <span class="line-clamp-2 max-w-full text-[10px] font-bold leading-[1.25] text-slate-400 dark:text-slate-500">${esc(cell.name)}</span>
                <span class="sr-only">zatím bez razítka</span>
            </li>`;
        }
        const flag = cell.flag && Core && Core.commonsPhotoUrl
            ? `<img src="${esc(Core.commonsPhotoUrl(cell.flag.file, cell.flag.hash, 60))}" alt="" loading="lazy" draggable="false" class="h-4 w-6 rounded-sm object-cover ring-1 ring-black/10 short:h-3.5 short:w-5 dark:ring-white/20">`
            : `<i data-lucide="flag" class="h-4 w-4 short:h-3.5 short:w-3.5" aria-hidden="true"></i>`;
        return `<li data-pas-cell="${esc(cell.id)}" data-pas-have${cell.fresh ? ' data-pas-fresh' : ''} title="${esc(`${cell.name}: razítko ${dayLabel(cell.day)}`)}" class="relative min-w-0 ${tiltOf(cell.id)}">
            <span class="pas-ink ${cell.fresh && !reduced ? `pas-thud ${delayOf(order)}` : ''} flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 ${continent.border} ${continent.soft} ${continent.ink} px-0.5 py-0.5 text-center">
                <span class="flex max-w-full items-center gap-1">${flag}<span class="truncate text-[8.5px] font-bold leading-none opacity-80">${esc(dayLabel(cell.day))}</span></span>
                <span class="line-clamp-2 max-w-full text-[10px] font-black leading-[1.25]">${esc(cell.name)}</span>
            </span>
            ${cell.fresh ? '<span class="absolute -right-1 -top-1.5 rounded-full bg-gold-500 px-1 text-[8px] font-black uppercase leading-[1.4] text-brand-950 shadow-sm">Nové</span>' : ''}
        </li>`;
    };
    const coverHtml = (pass, { reduced = false, canShare = false } = {}) => `
        <div class="flex items-center gap-3">
            <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-800 text-gold-300 shadow-inner short:h-10 short:w-10" aria-hidden="true"><i data-lucide="stamp" class="h-7 w-7 short:h-6 short:w-6"></i></span>
            <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-2"><span class="text-base font-black leading-tight text-slate-800 dark:text-slate-100">Státy světa</span><span data-pas-total class="shrink-0 text-sm font-black tabular-nums text-slate-700 dark:text-slate-200">${pass.have} / ${pass.total}</span></span>
                <span class="mt-1 block">${bar(pass.have, pass.total, 'bg-gold-500')}</span>
            </span>
            ${canShare ? '<button type="button" data-pas-share aria-label="Sdílet pas" title="Sdílet pas" class="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-700"><i data-lucide="share-2" class="h-5 w-5"></i></button>' : ''}
        </div>
        <p class="text-[12px] font-semibold leading-snug text-slate-600 dark:text-slate-300 short:text-[11.5px]">${esc(RULES)}</p>
        <ul class="flex flex-col gap-1.5 short:gap-1">${pass.continents.map(continent => `
            <li><button type="button" data-pas-go="${continent.firstPage}" class="flex min-h-[2.6rem] w-full items-center gap-2.5 rounded-xl bg-white px-2.5 py-1 text-left shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70 short:min-h-[2.3rem]" aria-label="${esc(`${continent.name}: ${continent.have} z ${continent.total} států${continent.complete ? ', kompletní' : ''}`)}">
                <span class="min-w-0 flex-1">
                    <span class="flex items-baseline justify-between gap-2"><span class="truncate text-[13px] font-black leading-tight ${continent.ink}">${esc(continent.name)}</span><span class="shrink-0 text-[12px] font-black tabular-nums text-slate-600 dark:text-slate-300" data-pas-count="${continent.id}">${continent.have} / ${continent.total}</span></span>
                    <span class="mt-0.5 block">${bar(continent.have, continent.total, continent.bar)}</span>
                </span>
                ${continent.complete ? bigStampHtml(continent, { size: 'h-9 w-9', mini: true, reduced }) : continent.fresh ? `<span class="shrink-0 rounded-full bg-gold-500 px-1.5 text-[10px] font-black leading-5 text-brand-950">+${continent.fresh}</span>` : '<i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-400"></i>'}
            </button></li>`).join('')}
        </ul>`;
    const continentPageHtml = (page, { reduced = false } = {}) => {
        const continent = page.continent;
        const freshOrder = new Map(page.cells.filter(cell => cell.fresh).map((cell, index) => [cell.id, index]));
        return `
        <div class="relative flex min-h-[3rem] items-center gap-2 short:min-h-[2.6rem]${continent.complete ? ' pr-16' : ''}">
            <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-2">
                    <span class="truncate text-base font-black leading-tight ${continent.ink}" data-pas-continent="${continent.id}">${esc(continent.name)}</span>
                    <span class="shrink-0 text-sm font-black tabular-nums text-slate-700 dark:text-slate-200">${continent.have} / ${continent.total}</span>
                </span>
                <span class="mt-1 block">${bar(continent.have, continent.total, continent.bar)}</span>
                ${page.parts > 1 ? `<span class="mt-0.5 block text-[10.5px] font-bold text-slate-500 dark:text-slate-400">Strana ${page.part + 1} z ${page.parts}</span>` : ''}
            </span>
            ${continent.complete ? `<span class="absolute -right-1 -top-2 z-10">${bigStampHtml(continent, { size: 'h-16 w-16', fresh: page.part === 0 && continent.doneFresh, reduced })}</span>` : ''}
        </div>
        <ol class="grid flex-1 grid-cols-3 grid-rows-6 gap-1.5 short:gap-1" aria-label="${esc(`Státy: ${continent.name}`)}">${page.cells.map(cell => cellHtml(cell, continent, freshOrder.get(cell.id) || 0, reduced)).join('')}</ol>`;
    };
    // Celé okno pasu: stránka, listování (šipky, tečky stránek); index = číslo stránky
    const passHtml = (pass, index, options = {}) => {
        const at = Math.max(0, Math.min(pass.pages.length - 1, Number(index) || 0));
        const page = pass.pages[at];
        const body = page.kind === 'cover' ? coverHtml(pass, options) : continentPageHtml(page, options);
        const arrow = (dir, disabled) => `<button type="button" data-pas-${dir} ${disabled ? 'disabled' : ''} aria-label="${dir === 'prev' ? 'Předchozí stránka' : 'Další stránka'}" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/70 disabled:opacity-35 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700/70 short:h-10 short:w-10"><i data-lucide="chevron-${dir === 'prev' ? 'left' : 'right'}" class="h-5 w-5"></i></button>`;
        const label = page.kind === 'cover' ? 'Obsah pasu' : page.continent.name;
        return `
        <div data-pas data-pas-page="${at}" class="flex flex-col gap-2 short:gap-1.5">
            <div data-pas-book class="pas-page flex h-[27rem] touch-pan-y select-none flex-col gap-2 rounded-2xl border-l-8 border-brand-800 bg-[#fbf7ec] p-3 shadow-inner ring-1 ring-slate-200 dark:border-brand-950 dark:bg-slate-800/70 dark:ring-slate-700 short:h-[24.5rem] short:gap-1.5 short:p-2.5" aria-live="polite" aria-label="${esc(`Stránka ${at + 1} z ${pass.pages.length}: ${label}`)}">${body}</div>
            <div class="flex items-center justify-between gap-2">
                ${arrow('prev', at === 0)}
                <span class="min-w-0 truncate text-center text-[12px] font-bold text-slate-600 dark:text-slate-300" data-pas-where>${esc(label)} · ${at + 1} / ${pass.pages.length}</span>
                ${arrow('next', at === pass.pages.length - 1)}
            </div>
        </div>`;
    };

    // --- Napojení do hry (app.js) ---
    // Dlaždice Pas v Mém postupu: obrázek (zatím razítko z Lucide), hodnota a popis; ready = čekají nová razítka (zlatý lem)
    const TILE_ART = '<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-800 text-gold-300 shadow-inner short:h-8 short:w-8 tiny:h-6 tiny:w-6" aria-hidden="true"><i data-lucide="stamp" class="h-5 w-5 tiny:h-4 tiny:w-4"></i></span>';
    const tile = (stateInput) => {
        const state = parse(stateInput);
        const have = Object.keys(state.stamps).length;
        const fresh = freshStamps(state).length;
        return {
            art: TILE_ART, ready: fresh > 0,
            value: fresh ? `+${plural(fresh, 'nové', 'nová', 'nových')}` : `${have} / ${TOTAL}`,
            label: `Cestovní pas: ${have} z ${TOTAL} států${fresh ? `, ${plural(fresh, 'nové razítko', 'nová razítka', 'nových razítek')}` : ''}`
        };
    };
    // Souhrn Bleskovky a Přežití: nová razítka hry (názvy států) a tlačítko do pasu; card, cardTitle = třídy karty aplikace
    const modeResultHtml = (names, { reduced = false, card = '', cardTitle = '' } = {}) => (!Array.isArray(names) || !names.length ? '' : `
        <section data-mode-passport class="${card} p-3">
            <h3 class="${cardTitle}"><i data-lucide="stamp" class="h-4 w-4 text-brand-700 dark:text-brand-300"></i> ${names.length === 1 ? 'Nové razítko do pasu' : `Nová razítka do pasu: ${names.length}`}</h3>
            <ul class="mt-1.5 flex flex-wrap gap-1.5">${names.slice(0, 6).map((name, index) => `<li class="pas-ink ${reduced ? '' : `pas-thud ${delayOf(index)}`} inline-flex items-center gap-1 rounded-lg border-2 border-brand-700 px-2 py-0.5 text-[12px] font-black text-brand-800 dark:border-brand-300 dark:text-brand-200"><i data-lucide="stamp" class="h-3.5 w-3.5"></i>${esc(name)}</li>`).join('')}${names.length > 6 ? `<li class="self-center text-xs font-bold text-slate-500 dark:text-slate-400">a ${names.length - 6} další</li>` : ''}</ul>
            <button type="button" data-action="open-passport" class="mt-2 inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-700">Otevřít pas <i data-lucide="chevron-right" class="h-4 w-4"></i></button>
        </section>`);
    // Přejetí prstem (nebo myší) po stránce doleva / doprava listuje: turn(1) dál, turn(-1) zpět; svislý pohyb ne
    const bindSwipe = (element, turn) => {
        let start = null;
        element.addEventListener('pointerdown', (event) => { start = { x: event.clientX, y: event.clientY }; });
        element.addEventListener('pointerup', (event) => {
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            start = null;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
        });
        element.addEventListener('pointercancel', () => { start = null; });
    };

    return {
        KEY, TOPICS, CONTINENTS, PAGE_MAX, TOTAL, EMPTY, RULES, parse, stampOf, countriesOf, backfill, record, freshStamps, freshDone, markSeen,
        flagOf, book, firstFreshPage, formatDay, dayLabel, shareText, chipText, passHtml, bigStampHtml, tile, modeResultHtml, bindSwipe
    };
});
