// Odškrtávací seznam okruhu a Můj obor (Učení). Čistá logika bez DOMu a k ní HTML seznamu, ukazatele a pečeti; napojení na hru dělá app.js
// (oddíl „Odškrtávací seznam a Můj obor“).
//
// Odškrtávací seznam: každý okruh Učení (zvláštní okruh z data/<téma>.json collections i kategorie) jako úplný seznam položek v pořadí
// prohlížení (sort okruhu nebo kategorie). Zaškrtnutá = hráč ji „umí“ podle stávajícího záznamu aplikace: aspoň jednou správně poznaná
// položka (mudrlant.learned, totéž, z čeho počítá postup okruhu v Učení a hvězdičky Mistrovství). Nic nového se nepočítá ani nestahuje.
// Seznam není tahák: jméno ukáže jen u poznaných položek (s fajfkou), nepoznané mají prázdné políčko a místo jména „???“ a nedají se
// otevřít (okno s popisem by jméno prozradilo); počet X / Y a postup k 100 % jsou vidět vždy. Filtr Vše / Chybí / Hotovo.
// Po 100 % se okruh uzavře zlatou pečetí: zapíše se při prvním zobrazení hotového okruhu (s animací razítka; s omezeným pohybem bez ní)
// a zůstane i tehdy, když do okruhu v nových datech přibude položka (pečeť je za dokončení, ukazatel pak poctivě ukáže nové X / Y).
//
// Můj obor: hráč si vybere jeden okruh (nebo kategorii) a hraje ho systematicky celý. Otázky jen z oboru, nejdřív položky, které ještě
// neumí, popořadě v pořadí seznamu; po odpovědi se pozice (kurzor = naposledy zodpovězená položka) uloží a příště se naváže hned za ní.
// Špatně zodpovězená položka se nepřeskakuje navždy: zůstane nezaškrtnutá a přijde znovu v dalším kole seznamu (žádný trest, žádné body
// navíc). Když hráč umí všechno, obor se dál hraje jako opakování celého seznamu popořadě. Obor jde kdykoli změnit; rozpracované obory
// (každý se svým kurzorem) si modul pamatuje, aktuální je jeden.
//
// Úložiště: jen v zařízení, mudrlant.obor = { current: 'téma|okruh' | null, fields: { 'téma|okruh': { cursor, at } }, seals: { 'téma|okruh': 'RRRR-MM-DD' } }.
// Okruh je id ze sbírek (cesko, premyslovci) nebo kategorie s předponou c: (c:stat). Server se nepoužívá.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantObor = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const STORAGE_KEY = 'mudrlant.obor';
    const FILTERS = ['all', 'missing', 'done'];
    // Kolik rozpracovaných oborů si modul pamatuje (nejdéle nehrané odpadnou); hodně, aby se nic neztratilo nečekaně
    const MAX_FIELDS = 40;
    const EMPTY = Object.freeze({ current: null, fields: {}, seals: {} });

    const keyOf = (topic, collection) => `${topic}|${collection}`;
    const parseKey = (key) => {
        const text = String(key || '');
        const at = text.indexOf('|');
        return at > 0 && at < text.length - 1 ? { topic: text.slice(0, at), collection: text.slice(at + 1) } : null;
    };
    const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

    // Uložený stav, odolně proti poškozeným datům
    const parse = (raw) => {
        const input = raw && typeof raw === 'object' ? raw : {};
        const fields = {};
        Object.entries(input.fields && typeof input.fields === 'object' ? input.fields : {}).forEach(([key, value]) => {
            if (!parseKey(key) || !value || typeof value !== 'object') return;
            fields[key] = { cursor: typeof value.cursor === 'string' && value.cursor ? value.cursor : null, at: Number.isFinite(value.at) ? value.at : 0,
                label: typeof value.label === 'string' ? value.label.slice(0, 80) : '' };
        });
        const seals = {};
        Object.entries(input.seals && typeof input.seals === 'object' ? input.seals : {}).forEach(([key, day]) => { if (parseKey(key) && isDay(day)) seals[key] = day; });
        const current = typeof input.current === 'string' && fields[input.current] ? input.current : null;
        return { current, fields, seals };
    };
    const load = (storage) => {
        try { return parse(JSON.parse(storage.getItem(STORAGE_KEY) || 'null')); } catch (e) { return parse(null); }
    };
    const save = (storage, state) => {
        try { storage.setItem(STORAGE_KEY, JSON.stringify(parse(state))); } catch (e) { /* plné nebo zakázané úložiště: postup jen v paměti */ }
    };

    // Stav okruhu: kolik položek hráč umí; procenta dolů, takže 100 % je opravdu všechno
    const summarize = (items, known) => {
        const total = items.length;
        const done = items.filter(item => known.has(item.q)).length;
        return { total, done, missing: total - done, percent: total ? Math.floor(done / total * 100) : 0, complete: total > 0 && done === total };
    };

    // Řádky seznamu v pořadí okruhu: číslo (pořadí v celém okruhu, i ve filtru), id, jestli ji hráč umí a jméno – jen u poznané
    // (nepoznaná má name null, v seznamu „???“)
    const HIDDEN_NAME = '???';
    const rows = (items, known, filter = 'all') => items
        .map((item, index) => ({ n: index + 1, id: item.q, name: known.has(item.q) ? item.n : null, known: known.has(item.q) }))
        .filter(row => filter === 'missing' ? !row.known : filter === 'done' ? row.known : true);

    // Další položka oboru: první neznámá za kurzorem (popořadě, na konci seznamu se pokračuje od začátku); když hráč umí všechno,
    // opakování popořadě – položka za kurzorem. phase = 'learn' | 'review'; index = pořadí v okruhu (od 0)
    const next = (ids, known, cursor = null) => {
        const total = ids.length;
        if (!total) return null;
        const at = cursor ? ids.indexOf(cursor) : -1;
        for (let step = 1; step <= total; step++) {
            const index = (at + step) % total;
            if (!known.has(ids[index])) return { id: ids[index], index, phase: 'learn' };
        }
        const index = (at + 1) % total;
        return { id: ids[index], index, phase: 'review' };
    };

    // Obor zvolený jako aktuální (rozpracovaný zůstane se svým kurzorem; nový začíná od začátku seznamu); label = název okruhu
    // pro dlaždici v Učení, ať se kvůli němu nemusí načítat data tématu
    const choose = (stateInput, key, now = Date.now(), label = '') => {
        const state = parse(stateInput);
        if (!parseKey(key)) return state;
        const before = state.fields[key];
        const fields = { ...state.fields, [key]: { cursor: before ? before.cursor : null, at: now, label: String(label || (before ? before.label : '')).slice(0, 80) } };
        const kept = Object.entries(fields).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_FIELDS);
        return { ...state, current: key, fields: Object.fromEntries(kept) };
    };
    // Odpověď v oboru: kurzor na zodpovězenou položku (příště se naváže za ní)
    const noteAnswer = (stateInput, key, id, now = Date.now()) => {
        const state = parse(stateInput);
        if (!state.fields[key] || !id) return state;
        return { ...state, fields: { ...state.fields, [key]: { ...state.fields[key], cursor: String(id), at: now } } };
    };
    // Odebrání rozpracovaného oboru ze seznamu (poznané položky ani pečeť se nemažou: patří k okruhu, ne k oboru)
    const remove = (stateInput, key) => {
        const state = parse(stateInput);
        const fields = { ...state.fields };
        delete fields[key];
        return { ...state, fields, current: state.current === key ? null : state.current };
    };
    const leave = (stateInput) => ({ ...parse(stateInput), current: null });
    // Rozpracované obory od naposledy hraného
    const fieldList = (stateInput) => Object.entries(parse(stateInput).fields).sort((a, b) => b[1].at - a[1].at).map(([key, value]) => ({ key, ...parseKey(key), ...value }));

    const isSealed = (stateInput, key) => Boolean(parse(stateInput).seals[key]);
    // Pečeť patří okruhu, který je hotový a pečeť ještě nemá (zapíše se při prvním zobrazení)
    const needsSeal = (stateInput, key, summary) => Boolean(summary && summary.complete) && !isSealed(stateInput, key);
    const seal = (stateInput, key, day) => {
        const state = parse(stateInput);
        return state.seals[key] || !parseKey(key) || !isDay(day) ? state : { ...state, seals: { ...state.seals, [key]: day } };
    };

    // Česká čísla s mezerou po tisících (1 420), skloňování „položka“
    const num = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const items = (count) => `${num(count)} ${count === 1 ? 'položka' : count >= 2 && count <= 4 ? 'položky' : 'položek'}`;
    const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

    // --- HTML (Tailwind třídy; ikony Lucide přes data-lucide, vykreslí je app.js) ---

    // Zlatá pečeť: zlatý kotouč s čárkovaným vnitřním kruhem a medailí (ikona award); animate = razítko při prvním udělení (CSS .seal-stamp, jen bez omezení pohybu)
    const sealHtml = ({ size = 'lg', animate = false, label = 'Okruh uzavřen zlatou pečetí' } = {}) => {
        const box = size === 'sm' ? 'h-6 w-6' : size === 'md' ? 'h-11 w-11' : 'h-16 w-16 short:h-14 short:w-14';
        const icon = size === 'sm' ? 'h-3.5 w-3.5' : size === 'md' ? 'h-6 w-6' : 'h-8 w-8 short:h-7 short:w-7';
        return `<span data-seal class="${animate ? 'seal-stamp ' : ''}relative inline-flex ${box} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600 text-gold-950 shadow-md ring-2 ring-gold-600 dark:ring-gold-300" role="img" aria-label="${escapeHtml(label)}">
            ${size === 'sm' ? '' : '<span class="absolute inset-1 rounded-full border-2 border-dashed border-gold-50/80" aria-hidden="true"></span>'}
            <i data-lucide="award" class="relative ${icon}" aria-hidden="true"></i>
        </span>`;
    };

    // Velký ukazatel X / Y s procenty a pruhem; sealed = pečeť vedle čísel (animate = právě udělená); link = HTML vpravo na řádku stavu
    const meterHtml = (summary, { sealed = false, animate = false, link = '' } = {}) => `
        <div data-checklist-meter class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-baseline gap-x-2 leading-none">
                    <span class="text-4xl font-black tracking-tight text-slate-800 short:text-3xl dark:text-slate-50" data-checklist-count>${num(summary.done)}<span class="text-2xl text-slate-400 short:text-xl dark:text-slate-500">&nbsp;/&nbsp;${num(summary.total)}</span></span>
                    <span class="text-lg font-black ${summary.complete ? 'text-gold-700 dark:text-gold-300' : 'text-slate-500 dark:text-slate-400'}" data-checklist-percent>${summary.percent} %</span>
                </p>
                <span class="mt-2 block h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" role="progressbar" aria-label="Umíš ${summary.done} z ${summary.total}" aria-valuemin="0" aria-valuemax="${summary.total}" aria-valuenow="${summary.done}">
                    <span class="block h-full w-0 rounded-full bg-gold-500" data-progress="${summary.total ? Math.floor(summary.done / summary.total * 100) : 0}"></span>
                </span>
                <p class="mt-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400"><span class="min-w-0">${summary.complete ? (sealed ? 'Hotovo – uzavřeno zlatou pečetí' : 'Hotovo') : `Chybí ${items(summary.missing)}`}</span>${link}</p>
            </div>
            ${sealed ? sealHtml({ animate }) : `<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-300 short:h-14 short:w-14 dark:border-slate-600 dark:text-slate-600" title="Pečeť dostaneš za 100 %" aria-hidden="true"><i data-lucide="award" class="h-7 w-7"></i></span>`}
        </div>`;

    // Políčka seznamu: vlastní SVG místo ikon Lucide (okruh mívá i tisíce položek, převádění ikon by trvalo)
    const CHECKED = '<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white dark:bg-emerald-500" aria-hidden="true"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
    const UNCHECKED = '<span class="h-5 w-5 shrink-0 rounded-md border-2 border-slate-300 dark:border-slate-600" aria-hidden="true"></span>';

    // Přepínač filtru s počty; aktivní tlačítko má aria-pressed
    const filterHtml = (summary, filter) => {
        const options = [['all', 'Vše', summary.total], ['missing', 'Chybí', summary.missing], ['done', 'Hotovo', summary.done]];
        return `<div class="grid shrink-0 grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800" role="group" aria-label="Filtr seznamu">
            ${options.map(([id, label, count]) => `<button type="button" data-action="checklist-filter" data-filter="${id}" aria-pressed="${filter === id}" class="min-h-[2.5rem] rounded-xl px-1 text-[13px] font-black transition-colors ${filter === id ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}">${label} <span class="font-semibold opacity-70">${num(count)}</span></button>`).join('')}
        </div>`;
    };

    // Seznam v okně s vlastním posouváním; klepnutím na poznanou položku se otevře okno s popisem (data-action item-info v app.js),
    // nepoznaná je jen řádek s číslem, prázdným políčkem a „???“ (jméno se neukáže ani čtečce obrazovky)
    // Položka, na kterou obor čeká, se v seznamu nezvýrazní (prozradilo by to, která otázka přijde)
    const listHtml = (list, { topic, filter = 'all' } = {}) => {
        if (!list.length) {
            const text = filter === 'missing' ? 'Nic nechybí – všechno umíš.' : filter === 'done' ? 'Zatím tu nic není. Co poznáš správně, zaškrtne se.' : 'Okruh je prázdný.';
            return `<p data-checklist-empty class="flex flex-1 items-center justify-center p-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">${text}</p>`;
        }
        return `<ul data-checklist class="relative min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-white dark:divide-slate-700/70 dark:border-slate-700 dark:bg-slate-800" aria-label="Položky okruhu">
            ${list.map(row => `<li>${row.known && row.name !== null ? `
                <button type="button" data-checklist-row data-action="item-info" data-topic="${escapeHtml(topic)}" data-id="${escapeHtml(row.id)}" data-known="1" class="flex min-h-[2.75rem] w-full items-center gap-2.5 px-3 py-1.5 text-left">
                    <span class="w-8 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500">${row.n}.</span>
                    ${CHECKED}
                    <span class="min-w-0 flex-1 truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">${escapeHtml(row.name)}</span>
                    <span class="sr-only">umíš</span>
                </button>` : `
                <div data-checklist-row data-id="${escapeHtml(row.id)}" data-known="0" class="flex min-h-[2.75rem] w-full items-center gap-2.5 px-3 py-1.5">
                    <span class="w-8 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500">${row.n}.</span>
                    ${UNCHECKED}
                    <span class="min-w-0 flex-1 truncate text-[14px] font-black tracking-widest text-slate-400 dark:text-slate-500" aria-hidden="true">${HIDDEN_NAME}</span>
                    <span class="sr-only">zatím nepoznaná položka</span>
                </div>`}
            </li>`).join('')}
        </ul>`;
    };

    // Tlačítko u okruhu v Učení: Udělat z toho můj obor / pokračovat / navázat na rozpracovaný
    const chooseButtonHtml = ({ mine = false, started = false } = {}) => `
        <button type="button" data-action="obor-choose" class="flex w-full items-center gap-3 rounded-[1.5rem] border-2 border-gold-300 bg-gold-50 p-3.5 text-left shadow-sm transition-all active:scale-[0.98] dark:border-gold-700 dark:bg-gold-900/20">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-200 text-gold-900 dark:bg-gold-800 dark:text-gold-100"><i data-lucide="target" class="h-6 w-6"></i></span>
            <span class="min-w-0 flex-1"><span class="block text-lg font-black text-slate-800 dark:text-slate-50">${mine ? 'Můj obor – pokračovat' : started ? 'Můj obor – navázat' : 'Udělat z toho můj obor'}</span>
            <span class="block text-sm text-slate-600 dark:text-slate-300">${mine || started ? 'Navážeš tam, kde hra skončila' : 'Celý okruh popořadě, nejdřív co neumíš'}</span></span>
            <i data-lucide="chevron-right" class="h-5 w-5 shrink-0 text-gold-700 dark:text-gold-300"></i>
        </button>`;

    // Dlaždice Můj obor v mřížce Učení; span = celá třída col-span-N (kvůli Tailwindu), wide = vejde se i název oboru
    const tileHtml = ({ span = 'col-span-2', label = '', wide = true } = {}) => `
        <button type="button" data-action="learn-obor" class="${span} flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-gold-300 bg-gold-50 p-2 text-center shadow-sm transition-all active:scale-[0.98] dark:border-gold-700 dark:bg-gold-900/20">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-200 text-gold-900 dark:bg-gold-800 dark:text-gold-100"><i data-lucide="target" class="h-6 w-6"></i></span>
            <span class="w-full text-[11.5px] font-black leading-tight text-slate-800 dark:text-slate-100">Můj obor${wide ? `<span class="block truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">${label ? escapeHtml(label) : 'Jeden okruh popořadě'}</span>` : ''}</span>
        </button>`;

    // Stránka Můj obor bez zvoleného oboru: co to je a jak si obor vybrat
    const introHtml = () => `
        <section class="flex flex-col items-center gap-2 rounded-[1.5rem] border border-slate-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <span class="flex h-16 w-16 items-center justify-center rounded-full bg-gold-200 text-gold-900 dark:bg-gold-800 dark:text-gold-100"><i data-lucide="target" class="h-9 w-9"></i></span>
            <h2 class="text-xl font-black text-slate-800 dark:text-slate-50">Můj obor</h2>
            <p class="text-sm text-slate-600 dark:text-slate-300">Vyber si jeden okruh a projdi ho celý. Otázky přijdou jen z něj, popořadě, nejdřív to, co ještě neumíš. Příště se naváže přesně tam, kde hra skončila.</p>
            <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">V Učení otevři téma, klepni na okruh a pak na Udělat z toho můj obor.</p>
            <button type="button" data-action="learn-back" class="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white"><i data-lucide="graduation-cap" class="h-5 w-5"></i> Vybrat okruh</button>
        </section>`;

    // Hlavní tlačítko oboru podle dalšího kroku (next): Začít, Pokračovat, nebo Opakovat popořadě; číslo položky, ne její jméno
    const playButtonHtml = (step, { started = false, total = 0, buttonClass = '' } = {}) => {
        const title = !step ? 'Okruh je prázdný' : step.phase === 'review' ? 'Opakovat popořadě' : started ? 'Pokračovat' : 'Začít';
        const icon = step && step.phase === 'review' ? 'repeat' : 'play';
        const text = !step ? '' : step.phase === 'review' ? `Všechno umíš · opakování od č. ${step.index + 1}` : `Na řadě č. ${step.index + 1} z ${num(total)} · bez spěchu`;
        return `<button type="button" data-action="obor-play" ${step ? '' : 'disabled'} class="flex w-full shrink-0 items-center gap-3 rounded-[1.5rem] px-4 py-3 text-left text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 short:py-2.5 ${buttonClass} btn-3d">
            <i data-lucide="${icon}" class="h-7 w-7 shrink-0"></i>
            <span class="min-w-0"><span class="block text-lg font-black leading-tight">${title}</span>${text ? `<span class="block text-sm text-white/90">${text}</span>` : ''}</span>
        </button>`;
    };

    // Řádek rozpracovaného oboru v okně Změnit obor (přepnout, odebrat); softClass = barvy tématu pro symbol
    const fieldRowHtml = ({ key, label, topicTitle, summary, sealed = false, current = false, softClass = '' }) => `
        <li class="flex items-center gap-2">
            <button type="button" data-obor-switch="${escapeHtml(key)}"${current ? ' aria-current="true"' : ''} class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left dark:bg-slate-800 ${current ? 'border-gold-400 dark:border-gold-600' : 'border-transparent'}">
                ${sealed ? sealHtml({ size: 'md' }) : `<span class="shrink-0 rounded-xl p-2 ${softClass}"><i data-lucide="target" class="h-5 w-5"></i></span>`}
                <span class="min-w-0 flex-1">
                    <span class="block truncate font-black text-slate-800 dark:text-slate-100">${escapeHtml(label)}</span>
                    <span class="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(topicTitle)} · ${num(summary.done)} / ${num(summary.total)} · ${summary.percent} %</span>
                </span>
            </button>
            <button type="button" data-obor-remove="${escapeHtml(key)}" aria-label="Odebrat ze seznamu: ${escapeHtml(label)}" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
        </li>`;
    // Obsah okna Změnit obor
    const changeBodyHtml = (rowsHtml) => `
        <p class="mb-3 text-sm text-slate-600 dark:text-slate-300">Každý rozpracovaný obor si pamatuje, kde hra skončila. Klepnutím na něj v něm pokračuješ. Odebráním ze seznamu nepřijdeš o nic, co už umíš.</p>
        ${rowsHtml ? `<ul data-obor-fields class="flex max-h-[45dvh] flex-col gap-2 overflow-y-auto overscroll-contain">${rowsHtml}</ul>` : '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Zatím žádný rozpracovaný obor.</p>'}
        <button type="button" data-obor-new class="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl btn-3d-light bg-white px-4 py-3 text-base font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100"><i data-lucide="graduation-cap" class="h-5 w-5"></i> Vybrat jiný okruh v Učení</button>`;

    return { STORAGE_KEY, FILTERS, MAX_FIELDS, EMPTY, HIDDEN_NAME, keyOf, parseKey, parse, load, save, summarize, rows, next, choose, noteAnswer, remove, leave, fieldList,
        isSealed, needsSeal, seal, num, items, sealHtml, meterHtml, filterHtml, listHtml, chooseButtonHtml, tileHtml, introHtml, playButtonHtml, fieldRowHtml, changeBodyHtml };
});
