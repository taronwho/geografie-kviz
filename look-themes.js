// Vzhled: barevná témata aplikace (odměna za úroveň). Hlavní barva brand-* se bere z CSS proměnných (src/input.css),
// téma se přepíná atributem data-theme na <html> (výchozí „vinova“ je bez atributu). Barvy ukázek ve výběru dělá
// stejný atribut na kuličce, takže nejsou potřeba inline styly (CSP je zakazuje). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    const DEFAULT = Look.DEFAULTS.theme;

    // Zamčené téma, na které hráč klepl: jak se odemyká (řádek pod mřížkou)
    let note = '';
    const LOCK = '<span class="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-600 text-white ring-1 ring-white dark:bg-slate-300 dark:text-slate-900 dark:ring-slate-800" aria-hidden="true"><i data-lucide="lock" class="h-2 w-2"></i></span>';
    // Kompaktně (Vzhled se vejde bez posouvání): malá dlaždice s kuličkou a názvem; zamčená má na šedé kuličce zámek,
    // úroveň je v popisku (i pro čtečku) a po klepnutí v řádku pod mřížkou
    const render = (ctx) => {
        const selected = (ctx.prefs && ctx.prefs.theme) || DEFAULT;
        const tiles = Look.THEMES.map(theme => {
            const open = Look.isUnlocked(theme, ctx);
            const on = open && theme.id === selected;
            const lockText = open ? '' : Look.unlockText(theme);
            const dot = open
                ? `<span data-theme="${theme.id}" class="block h-4 w-4 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-800 shadow-inner ring-1 ring-black/10"></span>`
                : `<span class="relative block h-4 w-4 shrink-0 rounded-full bg-slate-300 ring-1 ring-black/10 dark:bg-slate-600">${LOCK}</span>`;
            const tile = on ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40' : open ? 'bg-slate-100 active:scale-95 dark:bg-slate-700/60' : 'bg-slate-100 dark:bg-slate-700/40';
            return `<button type="button" data-theme-pick="${theme.id}" aria-pressed="${on}"${open ? '' : ' aria-disabled="true"'} title="${theme.title}${open ? '' : `: ${lockText}`}" class="flex min-h-[2.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 text-center ${tile}">
                ${dot}
                <span class="w-full text-balance text-[10px] font-bold leading-[1.1] ${open ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}">${theme.title}${open ? '' : `<span class="sr-only">, ${lockText}</span>`}</span>
            </button>`;
        }).join('');
        return `<div class="grid grid-cols-4 gap-1" role="group" aria-label="Barevné téma">${tiles}</div>${note ? `<p class="mt-1 text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400" role="status">${note}</p>` : ''}`;
    };

    const click = (event, ctx) => {
        const button = event.target.closest('[data-theme-pick]');
        if (!button) return false;
        const theme = Look.find('themes', button.dataset.themePick);
        if (!theme) return false;
        if (!Look.isUnlocked(theme, ctx)) { note = `${theme.title}: ${Look.unlockText(theme)}`; return true; }
        note = '';
        return Look.setPref('theme', theme.id, ctx);
    };

    const apply = (prefs) => {
        const id = prefs && prefs.theme && prefs.theme !== DEFAULT ? prefs.theme : null;
        const root = document.documentElement;
        if (id) root.setAttribute('data-theme', id); else root.removeAttribute('data-theme');
    };

    Look.register({ id: 'themes', title: 'Barevné téma', order: 10, render, click, apply });
})();
