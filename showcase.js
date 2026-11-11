// Vitrína v profilu (schéma 18, sloupec profiles.showcase): hráč vystaví nejvýš 3 trofeje, které ostatní uvidí v jeho profilu –
// odznak (b:<id>, nejvyšší získaný stupeň skupiny, ten je v účtu), diplom za mistrovství tématu (d:<téma>) a skončenou ligovou sezónu
// (l:<RRRR-MM>:<liga>). Databáze hlídá tvar a počet, odznak (musí být v profiles.badges) a sezónu (musí být skutečným vrcholem skončeného
// měsíce); diplomy drží aplikace (rewards.js), u nich server kontroluje jen tvar. Neznámou položku (novější aplikace) vitrína přeskočí.
// Čistá logika a HTML bez DOMu; okno Vitrína, přepínače „Vystavit“ a načtení a uložení napojuje app.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantShowcase = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const MAX = 3;
    // Stejný tvar jako showcase_format_ok() v supabase/schema.sql
    const ENTRY = /^(?:b:[a-z0-9-]{1,40}|d:[a-z0-9-]{1,24}|l:\d{4}-(?:0[1-9]|1[0-2]):(?:bronz|stribro|zlato|platina|diamant|mistr))$/;
    const isEntry = (value) => typeof value === 'string' && ENTRY.test(value);
    // Platné položky bez opakování, nejvýš MAX (cizí řádek z databáze, odpověď serveru)
    const clean = (list) => [...new Set((Array.isArray(list) ? list : []).filter(isEntry))].slice(0, MAX);
    const badge = (id) => `b:${id}`;
    const diploma = (topic) => `d:${topic}`;
    const season = (month, league) => `l:${month}:${league}`;
    const parse = (entry) => {
        if (!isEntry(entry)) return null;
        if (entry.startsWith('b:')) return { kind: 'badge', id: entry.slice(2) };
        if (entry.startsWith('d:')) return { kind: 'diploma', id: entry.slice(2) };
        const [, month, league] = entry.split(':');
        return { kind: 'season', month, league };
    };
    // Vystavit / odebrat: { list, changed, added, full } (plná vitrína nic nepřidá)
    const toggle = (list, entry) => {
        const now = clean(list);
        if (!isEntry(entry)) return { list: now, changed: false, added: false, full: false };
        if (now.includes(entry)) return { list: now.filter(item => item !== entry), changed: true, added: false, full: false };
        if (now.length >= MAX) return { list: now, changed: false, added: false, full: true };
        return { list: [...now, entry], changed: true, added: true, full: false };
    };

    const esc = (text) => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    // Popis položky přes pomocníky aplikace: { kind, title, caption, label, art } nebo null (neznámý odznak, téma nebo liga).
    // h = { badge(id) → odznak | null, medal(odznak, cls), topic(id) → téma | null, diplomaTitle(téma), diplomaArt(téma, cls),
    //       leagueName(id) → název | '', emblem(liga, cls), monthLabel(RRRR-MM) }
    const describe = (entry, h, artCls = 'h-10 w-10') => {
        const item = parse(entry);
        if (!item || !h) return null;
        if (item.kind === 'badge') {
            const found = h.badge(item.id);
            return found ? { kind: 'badge', title: found.title, caption: 'Odznak', label: `Odznak ${found.title}`, art: h.medal(found, artCls) } : null;
        }
        if (item.kind === 'diploma') {
            const topic = h.topic(item.id);
            if (!topic) return null;
            const title = h.diplomaTitle(topic);
            return { kind: 'diploma', title, caption: 'Diplom', label: `Diplom ${title}`, art: h.diplomaArt(topic, artCls) };
        }
        const name = h.leagueName(item.league);
        if (!name) return null;
        const when = h.monthLabel(item.month);
        return { kind: 'season', title: name, caption: when, label: `Ligová sezóna ${when}: ${name}`, art: h.emblem(item.league, artCls) };
    };
    const described = (list, h, artCls) => clean(list).map(entry => ({ entry, ...(describe(entry, h, artCls) || {}) })).filter(item => item.kind);

    // Tři dlaždice vitríny (Profil hráče, okno Vitrína): obrázek trofeje, název a u sezóny měsíc. remove = tlačítko Odebrat u každé (vlastní vitrína).
    // Bez položek prázdný text (profil nic neukáže).
    const TILE = 'relative flex min-w-0 flex-col items-center gap-0.5 rounded-2xl bg-white px-1 pb-1.5 pt-2 text-center short:pb-1 short:pt-1.5 shadow-sm ring-1 ring-gold-300/70 dark:bg-slate-800 dark:ring-gold-700/50';
    // slots = volná místa do počtu MAX jako čárkované dlaždice (vlastní vitrína)
    const tilesHtml = (list, h, { remove = false, label = 'Vitrína', slots = false } = {}) => {
        const items = described(list, h, 'h-10 w-10 short:h-8 short:w-8');
        if (!items.length && !slots) return '';
        const empty = slots ? Array.from({ length: MAX - items.length }, () => `
            <li data-showcase-empty class="flex min-h-[6.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 px-1 text-center dark:border-slate-600">
                <i data-lucide="plus" class="h-5 w-5 text-slate-400 dark:text-slate-500"></i><span class="text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400">Volné místo</span>
            </li>`).join('') : '';
        return `<ul data-showcase class="grid grid-cols-3 gap-1.5" aria-label="${esc(label)}">${items.map(item => `
            <li data-showcase-item="${esc(item.entry)}" class="${TILE}" aria-label="${esc(item.label)}">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center short:h-8 short:w-8" aria-hidden="true">${item.art}</span>
                <span class="block w-full break-words text-[11px] font-black leading-tight text-slate-800 dark:text-slate-100">${esc(item.title)}</span>
                ${item.caption ? `<span class="block text-[10px] font-bold leading-tight text-slate-500 dark:text-slate-400">${esc(item.caption)}</span>` : ''}
                ${remove ? `<button type="button" data-showcase-remove="${esc(item.entry)}" aria-label="Odebrat z vitríny: ${esc(item.label)}" class="mt-auto flex min-h-[2.5rem] w-full items-center justify-center gap-1 rounded-xl bg-slate-100 text-[12px] font-black text-slate-700 active:scale-95 dark:bg-slate-700 dark:text-slate-200"><i data-lucide="x" class="h-3.5 w-3.5"></i>Odebrat</button>` : ''}
            </li>`).join('')}${empty}</ul>`;
    };
    // Malý náhled vitríny (hlavička Nastavení → Profil): tři kolečka, prázdné místo s plusem
    const miniHtml = (list, h) => {
        const items = described(list, h, 'h-full w-full');
        const slot = (item) => item
            ? `<span class="flex h-6 w-6 items-center justify-center rounded-full bg-white p-0.5 shadow-sm ring-1 ring-gold-300 dark:bg-slate-800 dark:ring-gold-700">${item.art}</span>`
            : '<span class="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500"><i data-lucide="plus" class="h-3 w-3"></i></span>';
        return `<span class="flex items-center gap-0.5" aria-hidden="true">${[0, 1, 2].map(index => slot(items[index])).join('')}</span>`;
    };
    // Přepínač „Vystavit“ u odznaku, diplomu nebo sezóny; full = vitrína je plná (klepnutí řekne, ať hráč nejdřív něco odebere)
    const toggleHtml = ({ entry, on, count = 0, busy = false, wide = false }) => `<button type="button" data-showcase-toggle="${esc(entry)}" aria-pressed="${on}" ${busy ? 'disabled' : ''}
        aria-label="${on ? 'Vystaveno v profilu, klepnutím odebereš' : `Vystavit v profilu (ve vitríně ${count} ze ${MAX})`}"
        class="flex ${wide ? 'min-h-[2.75rem] w-full justify-center rounded-2xl' : 'min-h-[2.5rem] shrink-0 rounded-xl'} items-center gap-1.5 px-3 text-[13px] font-black active:scale-95 disabled:opacity-60 ${on
            ? 'bg-gold-500 text-brand-950 shadow-sm'
            : 'bg-slate-100 text-brand-700 ring-1 ring-slate-200 dark:bg-slate-700 dark:text-cream dark:ring-slate-600'}"><i data-lucide="${on ? 'check' : 'gem'}" class="h-4 w-4 shrink-0"></i>${on ? 'Vystaveno' : 'Vystavit'}<span class="text-[11px] font-bold opacity-80">${on ? '' : `${count}/${MAX}`}</span></button>`;

    return { MAX, ENTRY, isEntry, clean, badge, diploma, season, parse, toggle, describe, tilesHtml, miniHtml, toggleHtml };
});
