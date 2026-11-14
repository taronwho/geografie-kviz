// Skupiny: soukromé skupiny (třída, rodina, kamarádi) s vlastním pořadím Kvízu dne (dnes, týden) a týdenních XP.
// Data drží databáze (supabase/schema.sql, blok „Skupiny (schéma 8)“) přes social.js. Tady je čistá logika (název, kód, odkaz, pořadí)
// a okna Skupiny, Nová skupina, Přidat se ke skupině, detail skupiny a Správa skupiny. app.js předá pomocné funkce (createUI) a napojí
// čip na záložce Více hráčů, odkaz …?skupina=KÓD a Vyzvat skupinu (výzva pro všechny členy přes stávající výzvy).
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantGroups = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    // Stejný seznam ikon hlídá server (group_icons v schema.sql)
    const ICONS = ['🦉', '🏫', '🎒', '📚', '👪', '🏠', '🤝', '🌍', '🚀', '⚽', '🎨', '🎵', '🧪', '🦊', '🐼', '🔥'];
    const NAME_MIN = 2;
    const NAME_MAX = 40;
    const MAX_GROUPS = 10;
    const MAX_MEMBERS = 50;
    const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const LINK_PARAM = 'skupina';
    const PENDING_KEY = 'mudrlant.pendingGroup';
    const QUESTIONS = 10;

    // --- Název ---
    const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim();
    // Písmena (i s diakritikou), číslice, mezera a pár znaků (jako u přezdívky, navíc čárka, závorky, vykřičník a otazník)
    const NAME_PATTERN = /^[\p{L}\p{N} _.,!?()+#:/-]+$/u;
    const nameError = (name) => {
        const text = cleanName(name);
        if (text.length < NAME_MIN || text.length > NAME_MAX) return `Název skupiny má mít ${NAME_MIN} až ${NAME_MAX} znaků.`;
        if (!NAME_PATTERN.test(text)) return 'V názvu můžou být písmena, číslice, mezera a znaky . , _ - ! ? ( ) + # : /';
        return '';
    };
    const cleanIcon = (icon) => (ICONS.includes(icon) ? icon : ICONS[0]);

    // --- Kód a odkaz ---
    // Kód z textu nebo z odkazu (…?skupina=ABC234); malá písmena, mezery a pomlčky se opraví, zaměnitelné 0/O a 1/I/L v kódu nejsou
    const parseCode = (text) => {
        const raw = String(text || '');
        const fromLink = raw.match(/[?&#]skupina=([A-Za-z0-9-]+)/);
        const code = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[\s-]/g, '');
        return /^[A-Z0-9]{6}$/.test(code) && [...code].every(char => CODE_ALPHABET.includes(char)) ? code : '';
    };
    const linkFor = (code, place = root.location) => `${place ? `${place.origin}${place.pathname}` : ''}?${LINK_PARAM}=${code}`;

    // --- Pořadí ---
    // Místo se sdílí při shodě (víc hráčů na 1. místě = všichni mají pohár)
    const placed = (rows, better) => rows.map(row => ({ ...row, place: 1 + rows.filter(other => better(other, row)).length }));
    // Dnes: dohraný Kvíz dne, víc bodů, při shodě kratší čas; kdo dnes nedohrál, je zvlášť
    const rankToday = (rows) => {
        const played = (rows || []).filter(row => row.today).sort((a, b) => b.today.score - a.today.score || a.today.time_ms - b.today.time_ms || String(a.display_name).localeCompare(String(b.display_name), 'cs'));
        return {
            ranked: placed(played, (other, row) => other.today.score > row.today.score || (other.today.score === row.today.score && other.today.time_ms < row.today.time_ms)),
            waiting: (rows || []).filter(row => !row.today)
        };
    };
    // Týden: součet bodů Kvízu dne od pondělí (při shodě kratší celkový čas), nebo XP získané tento týden
    const rankWeek = (rows, by = 'quiz') => {
        const list = rows || [];
        if (by === 'xp') {
            const gained = list.filter(row => row.week_xp > 0).sort((a, b) => b.week_xp - a.week_xp || String(a.display_name).localeCompare(String(b.display_name), 'cs'));
            return { ranked: placed(gained, (other, row) => other.week_xp > row.week_xp), waiting: list.filter(row => !(row.week_xp > 0)) };
        }
        const played = list.filter(row => row.week_days > 0).sort((a, b) => b.week_score - a.week_score || a.week_time_ms - b.week_time_ms || String(a.display_name).localeCompare(String(b.display_name), 'cs'));
        return {
            ranked: placed(played, (other, row) => other.week_score > row.week_score || (other.week_score === row.week_score && other.week_time_ms < row.week_time_ms)),
            waiting: list.filter(row => !(row.week_days > 0))
        };
    };

    // --- Text ---
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const membersWord = (count) => plural(count, 'člen', 'členové', 'členů');
    const pointsWord = (count) => plural(count, 'bod', 'body', 'bodů');
    const daysWord = (count) => plural(count, 'den', 'dny', 'dní');
    const formatTime = (ms) => {
        const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    };
    const formatXp = (value) => String(Math.round(value || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const shortName = (name, max = 14) => { const text = String(name || 'Hráč').trim(); return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`; };
    // Řádek v seznamu skupin: kdo dnes vede Kvíz dne
    const leaderText = (group) => {
        if (!group.leader) return 'Kvíz dne dnes ještě nikdo nedohrál';
        return `Dnes vede ${group.leader.me ? 'ty' : shortName(group.leader.display_name)} · ${pointsWord(group.leader.score)}`;
    };

    // --- Vykreslení ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const LABEL = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const CARD = 'rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70';
    const SMALL_BUTTON = 'flex min-h-[2.5rem] min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-black active:scale-95';
    const LIGHT_BUTTON = `${SMALL_BUTTON} btn-3d-light bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100`;
    const BRAND_BUTTON = `${SMALL_BUTTON} btn-3d bg-brand-700 text-white disabled:opacity-50`;
    const DANGER_BUTTON = `${SMALL_BUTTON} bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900`;
    const INPUT = 'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-bold text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
    const iconBubble = (icon, size = 'h-10 w-10 text-xl') => `<span aria-hidden="true" class="flex ${size} shrink-0 items-center justify-center rounded-xl bg-gold-50 ring-1 ring-gold-200 dark:bg-slate-700 dark:ring-slate-600">${esc(cleanIcon(icon))}</span>`;
    // Ilustrace (icons/topics/<název>.webp, jako uiArt v app.js); sova-* se přebarví podle obleku (look-robes.js)
    const art = (name, cls) => `<img src="icons/topics/${name}.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    // Poznámka v bílé kartě; s obrázkem (owl = póza sovy, např. 'sova-ceka') vlevo od textu
    const note = (text, owl = '') => (owl
        ? `<div class="flex items-center gap-3 rounded-2xl bg-white p-2 pr-3 shadow-sm dark:bg-slate-800">${art(owl, 'h-14 w-14')}<p class="min-w-0 text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">${esc(text)}</p></div>`
        : `<p class="rounded-2xl bg-white px-3 py-3 text-center text-sm font-semibold text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">${esc(text)}</p>`);
    // Nikdo další ve skupině (správa): sova s dalekohledem vyhlíží členy
    const nobodyHtml = () => `<div class="flex items-center gap-3 px-1">${art('sova-dalekohled', 'h-14 w-14')}<p class="min-w-0 text-[13px] leading-snug text-slate-500 dark:text-slate-400">Zatím tu nikdo další není. Pošli ostatním kód skupiny.</p></div>`;
    const errorNote = (text) => (text ? `<p class="min-h-[1.25rem] text-sm font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(text)}</p>` : '');

    // Čip na záložce Více hráčů (vedle „Přijímám výzvy z“): otevře okno Skupiny; count = počet mých skupin (null = ještě nenačteno)
    const chipHtml = (count) => `
        <button type="button" id="groups-chip" data-action="groups-open" title="Skupiny: soukromé pořadí pro třídu, rodinu nebo kamarády" class="flex min-h-[2rem] shrink-0 items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 text-[11.5px] font-black text-brand-950 ring-1 ring-gold-300/70 active:scale-95 dark:bg-gold-900/20 dark:text-gold-200 dark:ring-gold-700/60">${art('skupiny', '-my-1 -ml-1.5 h-6 w-6')}Skupiny${count ? `<span class="rounded-full bg-brand-700 px-1.5 py-px text-[10px] leading-none text-white">${count}</span>` : ''}</button>`;

    const groupRowHtml = (group) => `
        <li><button type="button" data-group-open="${esc(group.id)}" class="flex w-full items-center gap-2.5 ${CARD} p-2 text-left active:scale-[0.99]">
            ${iconBubble(group.icon)}
            <span class="min-w-0 flex-1">
                <span class="block truncate text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">${esc(group.name)}</span>
                <span class="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${esc(membersWord(group.members))} · ${esc(leaderText(group))}</span>
            </span>
            ${group.played_today ? '' : '<span aria-hidden="true" title="Dnešní Kvíz dne ještě nemáš" class="h-2 w-2 shrink-0 rounded-full bg-gold-500"></span>'}
            <i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-400"></i>
        </button></li>`;
    // Okno Skupiny: seznam, nebo vysvětlení, když ještě žádnou nemám; dole Založit a Mám kód
    const listHtml = (groups, { error = '' } = {}) => {
        const full = Array.isArray(groups) && groups.length >= MAX_GROUPS;
        const body = groups === undefined ? note('Načítám skupiny…')
            : groups === false ? note('Skupiny se nepodařilo načíst. Zkontroluj připojení.')
                : groups === null ? note('Skupiny zatím nejsou k dispozici.')
                : !groups.length ? `<div class="flex items-start gap-3 ${CARD} p-3">${art('skupiny', 'h-14 w-14')}<div class="flex min-w-0 flex-col gap-1.5"><p class="text-[14px] font-black leading-snug text-slate-800 dark:text-slate-100">Soukromé pořadí pro třídu, rodinu nebo kamarády</p><p class="text-[13px] leading-snug text-slate-600 dark:text-slate-300">Založ skupinu a pošli ostatním kód. Uvidíte, kdo dnes vede v Kvízu dne, kdo má nejvíc bodů za týden a kdo získal nejvíc XP.</p></div></div>`
                    : `<ul id="groups-list" class="flex flex-col gap-1.5">${groups.map(groupRowHtml).join('')}</ul>`;
        return `
            <div class="flex flex-col gap-3">
                ${body}
                <div class="grid grid-cols-2 gap-2">
                    <button type="button" data-group-new ${full ? 'disabled' : ''} class="${BRAND_BUTTON}"><i data-lucide="plus" class="h-4 w-4"></i> Založit</button>
                    <button type="button" data-group-code class="${LIGHT_BUTTON}"><i data-lucide="hash" class="h-4 w-4"></i> Mám kód</button>
                </div>
                ${full ? `<p class="text-[12px] font-semibold text-slate-500 dark:text-slate-400">Jsi v ${MAX_GROUPS} skupinách, víc nejde. Nejdřív nějakou opusť.</p>` : ''}
                ${errorNote(error)}
            </div>`;
    };
    // Výběr ikony skupiny (8 × 2)
    const iconPickerHtml = (chosen) => `
        <div role="radiogroup" aria-label="Ikona skupiny" class="grid grid-cols-8 gap-1">
            ${ICONS.map(icon => `<button type="button" role="radio" aria-checked="${icon === chosen}" aria-label="Ikona ${esc(icon)}" data-group-icon="${esc(icon)}" class="flex aspect-square min-w-0 items-center justify-center rounded-xl text-xl active:scale-95 ${icon === chosen ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'}">${esc(icon)}</button>`).join('')}
        </div>`;
    // Formulář názvu a ikony (založení i přejmenování)
    const formHtml = ({ name = '', icon = ICONS[1], busy = false, error = '', submit = 'Založit skupinu' }) => `
        <form data-group-form class="flex flex-col gap-3" autocomplete="off">
            <label class="flex flex-col gap-1.5"><span class="${LABEL}">Název</span>
                <input id="group-name" data-autofocus type="text" maxlength="${NAME_MAX}" placeholder="Např. 5.B nebo Rodina Novákových" value="${esc(name)}" class="${INPUT}"></label>
            <div class="flex flex-col gap-1.5"><span class="${LABEL}">Ikona</span>${iconPickerHtml(icon)}</div>
            <button type="submit" ${busy ? 'disabled' : ''} class="${BRAND_BUTTON} w-full py-3 text-base">${busy ? 'Ukládám…' : esc(submit)}</button>
            ${errorNote(error)}
        </form>`;
    // Přidání kódem: pole na kód, po nalezení náhled skupiny a tlačítko Přidat se
    const joinHtml = ({ code = '', preview = null, busy = false, error = '' }) => {
        const found = preview ? `
            <div data-group-preview class="flex items-center gap-3 ${CARD} p-2.5">
                ${iconBubble(preview.icon, 'h-12 w-12 text-2xl')}
                <span class="min-w-0 flex-1"><span class="block truncate text-[15px] font-black text-slate-800 dark:text-slate-100">${esc(preview.name)}</span>
                <span class="block truncate text-[12px] font-semibold text-slate-500 dark:text-slate-400">${esc(membersWord(preview.members))}${preview.owner ? ` · zakladatel: ${esc(preview.owner.display_name)}` : ''}</span></span>
            </div>
            ${preview.member ? `<button type="button" data-group-open="${esc(preview.id)}" class="${BRAND_BUTTON} w-full py-3 text-base"><i data-lucide="users" class="h-5 w-5"></i> Už jsi členem: otevřít</button>`
                : `<button type="button" data-group-join ${busy ? 'disabled' : ''} class="${BRAND_BUTTON} w-full py-3 text-base"><i data-lucide="user-plus" class="h-5 w-5"></i> ${busy ? 'Přidávám…' : 'Přidat se'}</button>`}` : '';
        return `
            <form data-group-find class="flex flex-col gap-3" autocomplete="off">
                <input id="group-code" ${preview ? '' : 'data-autofocus'} type="text" inputmode="text" autocapitalize="characters" maxlength="200" placeholder="Např. K7M2QX" value="${esc(code)}" aria-label="Kód skupiny" class="${INPUT} py-3 text-center text-xl font-black uppercase tracking-widest">
                ${preview ? '' : `<button type="submit" ${busy ? 'disabled' : ''} class="${BRAND_BUTTON} w-full py-3 text-base">${busy ? 'Hledám…' : 'Najít skupinu'}</button>`}
                ${found}
                ${errorNote(error)}
            </form>`;
    };

    // Řádek pořadí: místo, obrázek, přezdívka, hodnota vpravo (h = pomocné funkce z app.js: avatarHtml)
    const boardRowHtml = (row, main, sub, h) => `
        <li data-group-row="${esc(row.id)}" class="flex items-center gap-2.5 rounded-2xl bg-white p-1 pr-2.5 shadow-sm dark:bg-slate-800 ${row.me ? 'ring-2 ring-brand-600 dark:ring-brand-400' : ''}">
            <span data-place="${row.place}" class="w-6 shrink-0 text-center text-[13px] font-black text-slate-500 dark:text-slate-400">${row.place === 1 ? '🏆' : `${row.place}.`}</span>
            ${h.avatarHtml(row, 'h-8 w-8 text-base', !row.me)}
            <span class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">${esc(row.display_name || 'Hráč')}${row.me ? ' (ty)' : ''}</span>
            <span class="shrink-0 text-right leading-tight"><span class="block text-sm font-black leading-tight text-slate-800 dark:text-slate-100">${esc(main)}</span>${sub ? `<span class="block text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${esc(sub)}</span>` : ''}</span>
        </li>`;
    // Kdo v pořadí ještě není: malé obrázky v jedné řadě
    const waitingHtml = (rows, label, h) => (rows.length ? `
        <div data-group-waiting class="flex items-center gap-2 px-1">
            <span class="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">${esc(label)}</span>
            <span class="flex min-w-0 flex-1 flex-wrap gap-1">${rows.map(row => `<span title="${esc(row.display_name || 'Hráč')}${row.me ? ' (ty)' : ''}">${h.avatarHtml(row, 'h-6 w-6 text-xs', !row.me)}</span>`).join('')}</span>
        </div>` : '');
    const boardHtml = (detail, view, h) => {
        if (view.tab === 'week') {
            const { ranked, waiting } = rankWeek(detail.rows, view.by);
            const list = ranked.map(row => (view.by === 'xp'
                ? boardRowHtml(row, `+${formatXp(row.week_xp)} XP`, '', h)
                : boardRowHtml(row, pointsWord(row.week_score), `${daysWord(row.week_days)} · ${row.week_correct} správně`, h))).join('');
            return `${ranked.length ? `<ol class="flex flex-col gap-1.5">${list}</ol>` : note(view.by === 'xp' ? 'Tento týden zatím nikdo nezískal XP.' : 'Tento týden zatím nikdo nehrál Kvíz dne.', 'sova-ceka')}
                ${waitingHtml(waiting, view.by === 'xp' ? 'Bez XP:' : 'Nehráli:', h)}`;
        }
        const { ranked, waiting } = rankToday(detail.rows);
        const list = ranked.map(row => boardRowHtml(row, pointsWord(row.today.score), `${row.today.correct}/${QUESTIONS} · ${formatTime(row.today.time_ms)}`, h)).join('');
        return `${ranked.length ? `<ol class="flex flex-col gap-1.5">${list}</ol>` : note('Dnešní Kvíz dne zatím nikdo ze skupiny nedohrál.', 'sova-ceka')}
            ${waitingHtml(waiting, 'Ještě nehráli:', h)}`;
    };
    // Výzva skupině: téma, od koho, kolik členů už hrálo, tlačítko na detail výzvy
    const challengeHtml = (detail, h) => {
        const c = detail.challenge;
        if (!c) return '';
        const mine = c.results.some(row => row.user_id === (detail.rows.find(item => item.me) || {}).id);
        return `
            <div data-group-challenge class="flex items-center gap-2.5 ${CARD} p-1.5">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><i data-lucide="${esc(h.topicIcon(c.topic))}" class="h-5 w-5"></i></span>
                <span class="min-w-0 flex-1"><span class="block truncate text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">Výzva skupiny · ${esc(h.topicTitle(c.topic))}</span>
                <span class="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${c.creator ? `${esc(shortName(c.creator.display_name))} · ` : ''}hotovo ${c.results.length} z ${detail.members}</span></span>
                <button type="button" data-group-play="${esc(c.id)}" class="${mine ? LIGHT_BUTTON : BRAND_BUTTON} shrink-0"><i data-lucide="${mine ? 'trophy' : 'play'}" class="h-4 w-4"></i>${mine ? 'Výsledky' : 'Hrát'}</button>
            </div>`;
    };
    // Detail skupiny: hlavička, kód s pozvánkou, záložky Dnes / Týden (v týdnu Kvíz dne / XP), výzva skupiny a akce. Pořadí je seznam
    // všech členů (u velké skupiny se okno posouvá): Vyzvat skupinu a Spravovat / Opustit jsou dole lepkavě, zůstanou vidět
    const detailHtml = (detail, view, h) => {
        if (!detail) return note(view.error || 'Načítám skupinu…');
        const tab = (id, label) => `<button type="button" role="tab" data-group-tab="${id}" aria-selected="${view.tab === id}" class="flex min-h-[2.5rem] flex-1 items-center justify-center rounded-xl px-2 text-[13px] font-black ${view.tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`;
        const by = (id, label) => `<button type="button" data-group-by="${id}" aria-pressed="${view.by === id}" class="min-h-[2rem] rounded-full px-3 text-[12px] font-black ${view.by === id ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'}">${label}</button>`;
        const me = detail.rows.find(row => row.me);
        const confirmLeave = view.confirm === 'leave';
        return `
            <div id="group-detail" data-group-id="${esc(detail.id)}" class="flex flex-col gap-2">
                <div class="flex items-center gap-2.5">
                    ${iconBubble(detail.icon, 'h-10 w-10 text-2xl')}
                    <div class="min-w-0 flex-1"><p data-group-name class="truncate text-[16px] font-black leading-tight text-slate-800 dark:text-slate-100">${esc(detail.name)}</p>
                    <p class="truncate text-[12px] font-semibold text-slate-500 dark:text-slate-400">${esc(membersWord(detail.members))}${detail.is_owner ? ' · jsi zakladatel' : ''}</p></div>
                </div>
                <div class="flex items-center gap-2 ${CARD} py-1 pl-3 pr-1">
                    <span class="flex min-w-0 flex-1 items-baseline gap-2"><span class="shrink-0 ${LABEL}">Kód</span><span data-group-code-value class="truncate font-mono text-lg font-black tracking-[0.2em] text-slate-800 dark:text-slate-100">${esc(detail.code)}</span></span>
                    <button type="button" data-group-share class="${LIGHT_BUTTON} shrink-0"><i data-lucide="share-2" class="h-4 w-4"></i> Pozvat</button>
                </div>
                <div role="tablist" class="flex gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${tab('day', 'Dnes')}${tab('week', 'Týden')}</div>
                ${view.tab === 'week' ? `<div class="flex items-center gap-1.5"><span class="mr-auto text-[11px] font-bold text-slate-500 dark:text-slate-400">Od pondělí</span>${by('quiz', 'Kvíz dne')}${by('xp', 'XP')}</div>` : ''}
                <div data-group-board class="flex flex-col gap-1.5">${boardHtml(detail, view, h)}</div>
                ${view.tab === 'day' && me && !me.today ? '<button type="button" data-group-quiz class="self-start rounded-lg px-1 py-1 text-[12px] font-black text-brand-700 underline underline-offset-2 dark:text-cream">Zahraj si dnešní Kvíz dne</button>' : ''}
                ${challengeHtml(detail, h)}
                <div data-group-actions class="sticky -bottom-5 z-10 -mx-5 -my-1.5 flex gap-2 bg-slate-50/95 px-5 py-1.5 backdrop-blur dark:bg-slate-900/95">
                    <button type="button" data-group-challenge-new class="${BRAND_BUTTON} flex-1 whitespace-nowrap"><i data-lucide="swords" class="h-4 w-4 shrink-0"></i> Vyzvat skupinu</button>
                    ${detail.is_owner ? `<button type="button" data-group-manage class="${LIGHT_BUTTON} shrink-0"><i data-lucide="pencil" class="h-4 w-4"></i> Spravovat</button>`
                        : `<button type="button" data-group-leave class="${confirmLeave ? DANGER_BUTTON : LIGHT_BUTTON} shrink-0"><i data-lucide="log-out" class="h-4 w-4"></i> ${confirmLeave ? 'Opravdu?' : 'Opustit'}</button>`}
                </div>
                <button type="button" data-group-back class="flex min-h-[2.5rem] items-center justify-center gap-1 rounded-xl text-[13px] font-bold text-slate-500 dark:text-slate-400"><i data-lucide="chevron-left" class="h-4 w-4"></i> Všechny skupiny</button>
                ${errorNote(view.error)}
            </div>`;
    };
    // Správa (zakladatel): název a ikona, nový kód, odebrání členů, smazání; nevratné akce chtějí druhé klepnutí
    const manageHtml = (detail, view, h) => {
        const others = detail.rows.filter(row => !row.me);
        const confirm = view.confirm || '';
        const members = others.length ? `<ul class="flex flex-col gap-1.5">${others.map(row => `
            <li data-group-member="${esc(row.id)}" class="flex items-center gap-2.5 rounded-2xl bg-white p-1.5 shadow-sm dark:bg-slate-800">
                ${h.avatarHtml(row, 'h-8 w-8 text-base', false)}
                <span class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">${esc(row.display_name || 'Hráč')}</span>
                <button type="button" data-group-remove="${esc(row.id)}" class="${confirm === `remove:${row.id}` ? DANGER_BUTTON : LIGHT_BUTTON} shrink-0 px-2.5"><i data-lucide="user-minus" class="h-4 w-4"></i>${confirm === `remove:${row.id}` ? 'Opravdu?' : '<span class="sr-only">Odebrat</span>'}</button>
            </li>`).join('')}</ul>` : nobodyHtml();
        return `
            <div id="group-manage" class="flex flex-col gap-3">
                ${formHtml({ name: view.name, icon: view.icon, busy: view.busy, error: view.formError, submit: 'Uložit název a ikonu' })}
                <div class="flex items-center gap-2 ${CARD} py-1.5 pl-3 pr-1.5">
                    <span class="min-w-0 flex-1"><span class="block ${LABEL}">Kód skupiny</span><span data-group-code-value class="block font-mono text-lg font-black tracking-[0.2em] text-slate-800 dark:text-slate-100">${esc(detail.code)}</span></span>
                    <button type="button" data-group-regen class="${confirm === 'regen' ? DANGER_BUTTON : LIGHT_BUTTON} shrink-0"><i data-lucide="repeat" class="h-4 w-4"></i> ${confirm === 'regen' ? 'Opravdu?' : 'Nový kód'}</button>
                </div>
                ${confirm === 'regen' ? '<p class="-mt-2 px-1 text-[12px] font-semibold text-slate-500 dark:text-slate-400">Starý kód a odkaz přestanou platit. Členové ve skupině zůstanou.</p>' : ''}
                <div class="flex flex-col gap-1.5"><span class="${LABEL} px-1">Členové (${others.length})</span>${members}</div>
                <button type="button" data-group-delete class="${DANGER_BUTTON} w-full"><i data-lucide="trash-2" class="h-4 w-4"></i> ${confirm === 'delete' ? 'Opravdu smazat skupinu pro všechny?' : 'Smazat skupinu'}</button>
                <button type="button" data-group-open="${esc(detail.id)}" class="flex min-h-[2.5rem] items-center justify-center gap-1 rounded-xl text-[13px] font-bold text-slate-500 dark:text-slate-400"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět na skupinu</button>
                ${errorNote(view.error)}
            </div>`;
    };

    // --- Okna (deps z app.js: Social, showDialog, closeDialog, avatarHtml, showToast, signedUser, login, openChallenge, newGroupChallenge,
    // openQuiz, topicTitle, topicIcon, renderIcons, share) ---
    const createUI = (deps) => {
        const Social = deps.Social;
        // null = databáze skupiny nemá (čip se neukáže), undefined = ještě nenačteno, false = chyba spojení
        let groups;
        let loading = null;
        // Seznam se při každém překreslení záložky nenačítá znovu: nejdřív po minutě (okno Skupiny ho načte vždy)
        let loadedAt = 0;
        const overlayTitle = () => { const overlay = root.document && root.document.getElementById('dialog-overlay'); return overlay ? overlay.dataset.title : null; };
        const errorText = (error, fallback) => (error && error.message ? error.message : fallback);
        const store = () => { try { return root.localStorage; } catch (e) { return null; } };
        const paintChip = () => {
            const chip = root.document && root.document.getElementById('groups-chip');
            if (!chip) return;
            if (groups === null) { chip.remove(); return; }
            chip.outerHTML = chipHtml(Array.isArray(groups) ? groups.length : 0);
            const fresh = root.document.getElementById('groups-chip');
            if (fresh && deps.renderIcons) deps.renderIcons(fresh);
        };
        const refresh = async (force = false) => {
            if (!deps.signedUser() || !Social) return groups;
            if (loading) return loading;
            if (!force && Array.isArray(groups) && Date.now() - loadedAt < 60000) return groups;
            const user = deps.signedUser();
            loading = (async () => {
                try {
                    const list = await Social.myGroups();
                    if (deps.signedUser() && deps.signedUser().id === user.id) { groups = list; loadedAt = Date.now(); }
                } catch (error) {
                    if (!Array.isArray(groups)) groups = false;
                } finally { loading = null; }
                paintChip();
                if (overlayTitle() === 'Skupiny') renderList();
                return groups;
            })();
            return loading;
        };
        const reset = () => { groups = undefined; loading = null; loadedAt = 0; };
        const chip = () => (groups === null ? '' : chipHtml(Array.isArray(groups) ? groups.length : 0));

        // Okno Skupiny se otevře hned (s posledním známým seznamem) a seznam se načte znovu
        const openList = () => {
            if (!deps.signedUser()) { deps.login(); return; }
            renderList();
            if (!loading) refresh(true);
        };
        const renderList = () => {
            deps.showDialog('Skupiny', listHtml(groups), {
                onClick: (event) => {
                    const open = event.target.closest('[data-group-open]');
                    if (open) { openDetail(open.dataset.groupOpen); return; }
                    if (event.target.closest('[data-group-new]')) openCreate();
                    if (event.target.closest('[data-group-code]')) openJoin();
                }
            });
        };
        const openCreate = () => {
            const draft = { name: '', icon: ICONS[1], busy: false, error: '' };
            const render = () => deps.showDialog('Nová skupina', formHtml(draft), {
                onClick: (event) => {
                    const icon = event.target.closest('[data-group-icon]');
                    if (icon) { const input = root.document.getElementById('group-name'); if (input) draft.name = input.value; draft.icon = cleanIcon(icon.dataset.groupIcon); draft.error = ''; render(); }
                },
                onInput: (event) => { if (event.target.id === 'group-name') draft.name = event.target.value; },
                onSubmit: async () => {
                    if (draft.busy) return;
                    draft.error = nameError(draft.name);
                    if (draft.error) { render(); return; }
                    draft.busy = true;
                    render();
                    try {
                        const group = await Social.groupCreate(cleanName(draft.name), draft.icon);
                        groups = [...(Array.isArray(groups) ? groups : []), group];
                        paintChip();
                        deps.showToast('Skupina je založená. Pošli ostatním kód.');
                        openDetail(group.id);
                    } catch (error) {
                        draft.busy = false;
                        draft.error = errorText(error, 'Skupinu se nepodařilo založit.');
                        if (overlayTitle() === 'Nová skupina') render();
                    }
                }
            });
            render();
        };
        // Přidání kódem (i z odkazu): bez přihlášení se kód zapamatuje a po přihlášení se okno otevře znovu
        const openJoin = (initial = '') => {
            if (!deps.signedUser()) {
                const saved = parseCode(initial);
                if (saved) { const s = store(); if (s) { try { s.setItem(PENDING_KEY, saved); } catch (e) { /* bez úložiště se kód nepamatuje */ } } }
                deps.showDialog('Skupina', `
                    <p class="mb-4 text-sm text-slate-600 dark:text-slate-300">Někdo tě zve do skupiny v Mudrlantovi. Přihlas se a hned potom se ke skupině přidáš.</p>
                    <button type="button" data-group-login class="${BRAND_BUTTON} w-full py-3 text-base"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>`,
                { onClick: (event) => { if (event.target.closest('[data-group-login]')) deps.login(); } });
                return;
            }
            const state = { code: parseCode(initial) || '', preview: null, busy: false, error: '' };
            const title = 'Přidat se ke skupině';
            const render = () => deps.showDialog(title, joinHtml(state), {
                onClick: async (event) => {
                    const open = event.target.closest('[data-group-open]');
                    if (open) { openDetail(open.dataset.groupOpen); return; }
                    if (!event.target.closest('[data-group-join]') || state.busy || !state.preview) return;
                    state.busy = true;
                    render();
                    try {
                        const group = await Social.groupJoin(state.preview.code);
                        if (!group) throw new Error('Skupina s tímhle kódem už neexistuje. Popros o nový kód.');
                        groups = Array.isArray(groups) ? [...groups.filter(item => item.id !== group.id), group] : groups;
                        paintChip();
                        deps.showToast(`Jsi ve skupině ${group.name}.`);
                        openDetail(group.id);
                    } catch (error) {
                        state.busy = false;
                        state.error = errorText(error, 'Přidání se nepodařilo.');
                        if (overlayTitle() === title) render();
                    }
                },
                // Jiný kód (přepsání pole) zruší náhled
                onInput: (event) => { if (event.target.id === 'group-code' && state.preview) { state.code = event.target.value; state.preview = null; state.error = ''; render(); } },
                onSubmit: () => {
                    const input = root.document.getElementById('group-code');
                    state.code = input ? input.value : state.code;
                    find();
                }
            });
            const find = async () => {
                const code = parseCode(state.code);
                if (!code) { state.error = 'Kód skupiny má 6 znaků, třeba K7M2QX. Můžeš vložit i celý odkaz.'; render(); return; }
                state.busy = true;
                state.error = '';
                render();
                try {
                    state.preview = await Social.groupPreview(code);
                    state.code = code;
                    if (!state.preview) state.error = 'Skupina s tímhle kódem není. Zkontroluj ho, nebo popros o nový.';
                } catch (error) {
                    state.error = errorText(error, 'Skupinu se nepodařilo najít.');
                }
                state.busy = false;
                if (overlayTitle() === title) render();
            };
            render();
            if (state.code) find();
        };
        // Po přihlášení: otevře přidání ke skupině z odkazu, na který hráč klepl
        const afterLogin = () => {
            const s = store();
            let code = '';
            try { code = s ? parseCode(s.getItem(PENDING_KEY)) : ''; if (s) s.removeItem(PENDING_KEY); } catch (e) { code = ''; }
            if (code) openJoin(code);
        };
        // Odkaz …?skupina=KÓD: kód se z adresy hned odstraní
        const takeLink = () => {
            const place = root.location;
            if (!place) return '';
            const params = new URLSearchParams(place.search);
            if (!params.has(LINK_PARAM)) return '';
            const code = parseCode(`?${LINK_PARAM}=${params.get(LINK_PARAM)}`);
            params.delete(LINK_PARAM);
            const query = params.toString();
            try { root.history.replaceState(root.history.state, '', place.pathname + (query ? `?${query}` : '') + place.hash); } catch (error) { /* adresa zůstane */ }
            return code;
        };

        // Detail skupiny; view si pamatuje záložku mezi otevřeními
        const view = { tab: 'day', by: 'quiz', confirm: '', error: '' };
        let token = 0;
        const openDetail = async (groupId) => {
            const mine = ++token;
            let detail = null;
            view.confirm = '';
            view.error = '';
            const title = 'Skupina';
            const stillOpen = () => mine === token && overlayTitle() === title;
            const render = () => deps.showDialog(title, detailHtml(detail, view, deps), { onClick });
            const load = async () => {
                try {
                    detail = await Social.groupDetail(groupId);
                    view.error = '';
                } catch (error) {
                    view.error = errorText(error, 'Skupinu se nepodařilo načíst.');
                    if (error && (error.status === 403 || error.status === 401)) { groups = Array.isArray(groups) ? groups.filter(item => item.id !== groupId) : groups; paintChip(); }
                }
                if (stillOpen()) render();
            };
            const onClick = async (event) => {
                const tab = event.target.closest('[data-group-tab]');
                const by = event.target.closest('[data-group-by]');
                if (tab) { view.tab = tab.dataset.groupTab === 'week' ? 'week' : 'day'; view.confirm = ''; render(); return; }
                if (by) { view.by = by.dataset.groupBy === 'xp' ? 'xp' : 'quiz'; render(); return; }
                if (event.target.closest('[data-group-back]')) { openList(); return; }
                if (!detail) return;
                if (event.target.closest('[data-group-share]')) {
                    deps.share({ title: `Skupina ${detail.name} v Mudrlantovi`, text: `Přidej se do mé skupiny „${detail.name}“ v Mudrlantovi.\nKód skupiny: ${detail.code}`, url: linkFor(detail.code) });
                    return;
                }
                if (event.target.closest('[data-group-quiz]')) { deps.closeDialog(); deps.openQuiz(); return; }
                const play = event.target.closest('[data-group-play]');
                if (play) { deps.openChallenge(play.dataset.groupPlay); return; }
                if (event.target.closest('[data-group-challenge-new]')) { deps.newGroupChallenge({ id: detail.id, name: detail.name, icon: detail.icon }); return; }
                if (event.target.closest('[data-group-manage]')) { openManage(detail); return; }
                if (event.target.closest('[data-group-leave]')) {
                    if (view.confirm !== 'leave') { view.confirm = 'leave'; render(); return; }
                    try {
                        await Social.groupLeave(detail.id);
                        groups = Array.isArray(groups) ? groups.filter(item => item.id !== detail.id) : groups;
                        paintChip();
                        deps.showToast(`Opustil jsi skupinu ${detail.name}.`);
                        openList();
                    } catch (error) {
                        view.confirm = '';
                        view.error = errorText(error, 'Skupinu se nepodařilo opustit.');
                        if (stillOpen()) render();
                    }
                }
            };
            render();
            await load();
        };
        const openManage = (detail) => {
            const state = { name: detail.name, icon: detail.icon, busy: false, formError: '', error: '', confirm: '' };
            const title = 'Správa skupiny';
            const render = () => deps.showDialog(title, manageHtml(detail, state, deps), { onClick, onSubmit, onInput });
            const fail = (error, fallback) => { state.busy = false; state.confirm = ''; state.error = errorText(error, fallback); if (overlayTitle() === title) render(); };
            const onInput = (event) => { if (event.target.id === 'group-name') state.name = event.target.value; };
            const onSubmit = async () => {
                if (state.busy) return;
                state.formError = nameError(state.name);
                if (state.formError) { render(); return; }
                state.busy = true;
                render();
                try {
                    const updated = await Social.groupUpdate(detail.id, cleanName(state.name), state.icon);
                    Object.assign(detail, { name: updated.name, icon: updated.icon });
                    groups = Array.isArray(groups) ? groups.map(item => (item.id === detail.id ? { ...item, name: updated.name, icon: updated.icon } : item)) : groups;
                    state.busy = false;
                    state.name = updated.name;
                    deps.showToast('Uloženo.');
                    render();
                } catch (error) { fail(error, 'Změnu se nepodařilo uložit.'); }
            };
            const onClick = async (event) => {
                const icon = event.target.closest('[data-group-icon]');
                if (icon) { const input = root.document.getElementById('group-name'); if (input) state.name = input.value; state.icon = cleanIcon(icon.dataset.groupIcon); render(); return; }
                const open = event.target.closest('[data-group-open]');
                if (open) { openDetail(detail.id); return; }
                const remove = event.target.closest('[data-group-remove]');
                if (remove) {
                    const memberId = remove.dataset.groupRemove;
                    if (state.confirm !== `remove:${memberId}`) { state.confirm = `remove:${memberId}`; render(); return; }
                    try {
                        await Social.groupRemoveMember(detail.id, memberId);
                        detail.rows = detail.rows.filter(row => row.id !== memberId);
                        detail.members = Math.max(1, detail.members - 1);
                        state.confirm = '';
                        deps.showToast('Člen je odebraný. Pokud nemá zpátky, vygeneruj nový kód.');
                        render();
                    } catch (error) { fail(error, 'Člena se nepodařilo odebrat.'); }
                    return;
                }
                if (event.target.closest('[data-group-regen]')) {
                    if (state.confirm !== 'regen') { state.confirm = 'regen'; render(); return; }
                    try {
                        detail.code = await Social.groupNewCode(detail.id);
                        groups = Array.isArray(groups) ? groups.map(item => (item.id === detail.id ? { ...item, code: detail.code } : item)) : groups;
                        state.confirm = '';
                        deps.showToast('Nový kód je hotový, starý už neplatí.');
                        render();
                    } catch (error) { fail(error, 'Nový kód se nepodařilo vytvořit.'); }
                    return;
                }
                if (event.target.closest('[data-group-delete]')) {
                    if (state.confirm !== 'delete') { state.confirm = 'delete'; render(); return; }
                    try {
                        await Social.groupDelete(detail.id);
                        groups = Array.isArray(groups) ? groups.filter(item => item.id !== detail.id) : groups;
                        paintChip();
                        deps.showToast(`Skupina ${detail.name} je smazaná.`);
                        openList();
                    } catch (error) { fail(error, 'Skupinu se nepodařilo smazat.'); }
                }
            };
            render();
        };
        return { chip, refresh, reset, openList, openCreate, openJoin, openDetail, afterLogin, takeLink, groups: () => groups };
    };

    return {
        ICONS, NAME_MIN, NAME_MAX, MAX_GROUPS, MAX_MEMBERS, LINK_PARAM, PENDING_KEY,
        cleanName, nameError, cleanIcon, parseCode, linkFor, rankToday, rankWeek, leaderText, membersWord, formatTime,
        chipHtml, listHtml, formHtml, joinHtml, detailHtml, manageHtml, createUI
    };
});
