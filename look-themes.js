// Vzhled: barevná témata aplikace (odměna za úroveň). Hlavní barva brand-* se bere z CSS proměnných (src/input.css),
// téma se přepíná atributem data-theme na <html> (výchozí „vinova“ je bez atributu). Barvy ukázek ve výběru dělá
// stejný atribut na kuličce, takže nejsou potřeba inline styly (CSP je zakazuje). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    const DEFAULT = Look.DEFAULTS.theme;

    const render = (ctx) => {
        const selected = (ctx.prefs && ctx.prefs.theme) || DEFAULT;
        return `<div class="grid grid-cols-4 gap-1.5" role="group" aria-label="Barevné téma">${Look.THEMES.map(theme => {
            const open = Look.isUnlocked(theme, ctx);
            const on = open && theme.id === selected;
            const dot = open
                ? `<span data-theme="${theme.id}" class="block h-6 w-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-800 shadow-inner ring-1 ring-black/10"></span>`
                : '<span class="block h-6 w-6 rounded-full bg-slate-300 ring-1 ring-black/10 dark:bg-slate-600"></span>';
            const tile = on ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40' : open ? 'bg-slate-100 active:scale-95 dark:bg-slate-700/60' : 'bg-slate-100 opacity-70 dark:bg-slate-700/40';
            return `<button type="button" data-theme-pick="${theme.id}" aria-pressed="${on}"${open ? '' : ' aria-disabled="true"'} class="flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 ${tile}">
                ${dot}
                <span class="w-full text-balance text-center text-[11px] font-bold leading-tight ${open ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}">${theme.title}</span>
                ${open ? '' : `<span class="w-full truncate text-center text-[10px] font-semibold leading-none text-slate-600 dark:text-slate-300">${Look.unlockText(theme)}</span>`}
            </button>`;
        }).join('')}</div>`;
    };

    const click = (event, ctx) => {
        const button = event.target.closest('[data-theme-pick]');
        if (!button) return false;
        const theme = Look.find('themes', button.dataset.themePick);
        if (!theme || !Look.isUnlocked(theme, ctx)) return false;
        return Look.setPref('theme', theme.id, ctx);
    };

    const apply = (prefs) => {
        const id = prefs && prefs.theme && prefs.theme !== DEFAULT ? prefs.theme : null;
        const root = document.documentElement;
        if (id) root.setAttribute('data-theme', id); else root.removeAttribute('data-theme');
    };

    Look.register({ id: 'themes', title: 'Barevné téma', order: 10, render, click, apply });
})();
