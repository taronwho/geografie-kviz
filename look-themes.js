// Barevná témata aplikace (odměna za úroveň), Nastavení → Hra. Hlavní barva brand-* se bere z CSS proměnných (src/input.css),
// téma se přepíná atributem data-theme na <html> (výchozí „vinova“ je bez atributu). Barvy ukázek ve výběru dělá
// stejný atribut na kuličce, takže nejsou potřeba inline styly (CSP je zakazuje). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    const DEFAULT = Look.DEFAULTS.theme;
    const HEADING = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';

    // Zamčené téma, na které hráč klepl: jak se odemyká (vpravo v nadpisu místo názvu vybraného tématu)
    let note = '';
    const LOCK = '<span class="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-600 text-white ring-1 ring-white dark:bg-slate-300 dark:text-slate-900 dark:ring-slate-800" aria-hidden="true"><i data-lucide="lock" class="h-2 w-2"></i></span>';
    // Kompaktně (karta Hra se vejde bez posouvání): dvě řady po osmi kuličkách, tlačítka 40 × 40 px; na nízkém displeji se řady
    // o 4 px překrývají (záporný okraj, kulička 28 px má nad sebou i pod sebou volné místo), takže řada zabere jen 36 px.
    // Název vybraného tématu je v nadpisu. Zamčená kulička je šedá se zámkem, úroveň je v popisku (i pro čtečku) a po klepnutí v nadpisu.
    const render = (ctx) => {
        const selected = (ctx.prefs && ctx.prefs.theme) || DEFAULT;
        const current = Look.find('themes', selected) || Look.THEMES[0];
        const swatches = Look.THEMES.map(theme => {
            const open = Look.isUnlocked(theme, ctx);
            const on = open && theme.id === selected;
            const lockText = open ? '' : Look.unlockText(theme);
            const ring = on ? 'ring-2 ring-slate-800/70 ring-offset-2 ring-offset-slate-50 dark:ring-white/80 dark:ring-offset-slate-900' : 'ring-1 ring-black/10';
            const dot = open
                ? `<span data-theme="${theme.id}" class="block h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-800 shadow-inner ${ring}"></span>`
                : `<span class="relative block h-7 w-7 rounded-full bg-slate-300 ring-1 ring-black/10 dark:bg-slate-600">${LOCK}</span>`;
            return `<button type="button" data-theme-pick="${theme.id}" aria-pressed="${on}"${open ? '' : ' aria-disabled="true"'} title="${theme.title}${open ? '' : `: ${lockText}`}" class="flex h-10 min-w-0 items-center justify-center rounded-xl active:scale-95 short:-my-0.5 ${open ? '' : 'cursor-not-allowed'}">
                ${dot}<span class="sr-only">${theme.title}${open ? '' : `, ${lockText}`}</span>
            </button>`;
        }).join('');
        return `<div class="flex items-baseline justify-between gap-2 px-1"><h3 class="${HEADING}">Barevné téma</h3><p class="min-w-0 truncate text-[11px] font-bold ${note ? 'text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300'}" role="status">${note || current.title}</p></div>
            <div class="grid grid-cols-8" role="group" aria-label="Barevné téma">${swatches}</div>`;
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

    Look.register({ id: 'themes', tab: 'game', title: 'Barevné téma', noTitle: true, card: false, bleed: true, order: 10, render, click, apply });
})();
