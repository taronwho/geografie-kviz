// Nastavení → Profil: rámečky profilu kolem obrázku hráče (CSS třídy .frame-* v src/input.css) a titul u jména (úroveň, nic, nebo
// získaný odznak). Obrázky hráče (postavičky a emoji) vybírá Profil sám (app.js), jejich katalog je v look.js. Používá MudrlantLook (look.js).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantLook || (isNode ? require('./look.js') : null), root.MudrlantCore || (isNode ? require('./quiz-core.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantLookFrames = api;
})(typeof self !== 'undefined' ? self : this, (Look, Core) => {
    'use strict';
    const HEADING = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const SHORT = { zadny: 'Bez', bronz: 'Bronz', stribro: 'Stříbro', zlato: 'Zlato', vavrin: 'Vavřín', plamen: 'Plamen', diamant: 'Diamant', medailista: 'Medaile', 'mistr-turnaje': 'Mistr',
        // Rámečky za sérii dní (look.js STREAK_FRAMES)
        jiskra: 'Jiskra', stovka: 'Stovka', 'vecny-ohen': 'Oheň',
        // Rámečky ligových sezón (look.js LEAGUE_FRAMES)
        'liga-zlato': 'Sezóna Zlato', 'liga-platina': 'Sezóna Platina', 'liga-diamant': 'Sezóna Diamant', 'liga-mistr': 'Sezóna Mistr' };
    // Rámeček za celé album sbírky (album.js)
    SHORT.sberatel = 'Sběratel';
    const escapeHtml = (text) => Core && Core.escapeHtml ? Core.escapeHtml(text) : String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

    // Třídy rámečku pro obrázek hráče; neznámé id (a „bez rámečku“) nedá nic, takže cizí hodnota z databáze nic nerozbije
    const frameClass = (id) => {
        const item = Look && typeof id === 'string' ? Look.find('frames', id) : null;
        return item && item.id !== 'zadny' ? ` frame frame-${item.id}` : '';
    };

    // Možnosti výběru titulu: úroveň (výchozí), nic a získané odznaky (id → název); vybraný odznak je v nabídce vždy
    // ownTitles = vlastní tituly (Look.TITLES, např. Šampion sezóny), které hráč má: jdou před odznaky
    const titleOptions = ({ level, levelTitle, earnedIds, current, badgeTitle, ownTitles = [] }) => {
        const own = ownTitles.map(item => item.id);
        const ids = [...earnedIds];
        if (current && current !== 'level' && current !== 'none' && !ids.includes(current) && !own.includes(current)) ids.push(current);
        return [
            { value: 'level', label: `Úr. ${level} · ${levelTitle}` },
            { value: 'none', label: 'Nic' },
            ...ownTitles.map(item => ({ value: item.id, label: item.title, own: true })),
            ...ids.map(id => ({ value: id, label: badgeTitle(id) || id, badge: true }))
        ];
    };

    // Text pod řadou rámečků: u zamčeného, na který hráč klepl, jak se odemkne; jinak co je vybrané
    const frameHint = (item, ctx, badgeTitle) => !item ? '' : Look.isUnlocked(item, ctx) ? item.title : `${item.title}: ${Look.unlockText(item, item.badge ? badgeTitle(item.badge) : null)}`;

    // --- Rámečky ---
    let hint = '';
    const badgeTitle = (id) => (Core && Core.BADGE_BY_ID && Core.BADGE_BY_ID[id] ? Core.BADGE_BY_ID[id].title : id);
    const previewPlayer = (ctx) => ({ ...(ctx.profile || { avatar: '🦉', color: 'emerald' }) });
    const renderFrames = (ctx) => {
        const player = previewPlayer(ctx);
        const selected = ctx.prefs.frame;
        // Sezónní rámečky (exclusive) jen ty, které hráč má: zamčených by byla dlouhá řada a získat jdou jen v sezóně svého měsíce
        const tiles = Look.FRAMES.filter(item => !item.exclusive || Look.isUnlocked(item, ctx) || item.id === selected).map(item => {
            const unlocked = Look.isUnlocked(item, ctx);
            const label = unlocked || item.id === 'zadny' ? (SHORT[item.id] || item.title) : (item.league ? 'Ligová sezóna' : item.badge ? 'Odznak' : item.exclusive ? 'Sezóna' : `Úr. ${item.level}`);
            const text = unlocked ? item.title : `${item.title}: ${Look.unlockText(item, item.badge ? badgeTitle(item.badge) : null)}`;
            return `<button type="button" data-frame="${item.id}" aria-pressed="${item.id === selected}" aria-label="${escapeHtml(unlocked ? item.title : `${text} (zamčeno)`)}" title="${escapeHtml(text)}" class="flex h-11 w-11 shrink-0 snap-start items-center justify-center rounded-xl border-2 active:scale-95 ${item.id === selected ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/40' : 'border-transparent bg-slate-100 dark:bg-slate-700/60'} ${unlocked ? '' : 'opacity-50 grayscale'}">
                ${ctx.avatarHtml ? ctx.avatarHtml({ ...player, id: null, frame: item.id }, 'h-8 w-8 text-base') : ''}<span class="sr-only">${escapeHtml(label)}</span>
            </button>`;
        }).join('');
        const shown = hint || frameHint(Look.find('frames', selected), ctx, badgeTitle);
        // Nadpis s vybraným rámečkem (nebo jak se odemkne zamčený) a jedna řada (Profil se vejde bez posouvání); na úzkém displeji
        // se řada posouvá do strany, ne celé okno
        return `<div class="mb-1 flex flex-wrap items-baseline justify-between gap-x-2"><h3 class="${HEADING}">Rámeček profilu</h3><p class="min-w-0 text-right text-[11px] font-bold leading-snug ${hint ? 'text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300'}" role="status">${escapeHtml(shown)}</p></div>
            <div class="-mx-0.5 flex w-full min-w-0 snap-x gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Rámeček profilu">${tiles}</div>`;
    };
    const clickFrames = (event, ctx) => {
        const button = event.target.closest('[data-frame]');
        if (!button) return false;
        const item = Look.find('frames', button.dataset.frame);
        if (!item) return false;
        if (!Look.isUnlocked(item, ctx)) { hint = frameHint(item, ctx, badgeTitle); return true; }
        hint = '';
        Look.setPref('frame', item.id, ctx);
        return true;
    };

    // --- Titul u jména ---
    const earnedBadgeIds = (ctx) => {
        const ids = Object.keys(ctx.badges || {}).filter(id => Core && Core.BADGE_BY_ID && Core.BADGE_BY_ID[id]);
        return Core && Core.compactBadges ? Core.compactBadges(ids) : ids;
    };
    const renderTitle = (ctx) => {
        const ownTitles = (Look.TITLES || []).filter(item => Look.isUnlocked(item, ctx));
        const options = titleOptions({
            level: ctx.level, levelTitle: Core && Core.titleForLevel ? Core.titleForLevel(ctx.level) : '', earnedIds: earnedBadgeIds(ctx), current: ctx.prefs.title, badgeTitle, ownTitles
        });
        const optionHtml = (option) => `<option value="${escapeHtml(option.value)}"${option.value === ctx.prefs.title ? ' selected' : ''}>${escapeHtml(option.label)}</option>`;
        // Popisek vlevo, výběr vedle (jeden řádek); první možnost ukazuje přesně to, co bude u jména
        return `<label class="flex items-center gap-2">
                <span class="${HEADING} shrink-0">Titul u jména</span>
                <select data-title-select aria-label="Titul u jména: co se zobrazí u tvého jména" class="min-h-[2.5rem] min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                    ${optionHtml(options[0])}${optionHtml(options[1])}
                    ${options.some(option => option.own) ? `<optgroup label="Tituly">${options.filter(option => option.own).map(optionHtml).join('')}</optgroup>` : ''}
                    ${options.some(option => option.badge) ? `<optgroup label="Získané odznaky">${options.filter(option => option.badge).map(optionHtml).join('')}</optgroup>` : ''}
                </select>
            </label>`;
    };
    const changeTitle = (event, ctx) => {
        const select = event.target.closest('[data-title-select]');
        if (!select) return false;
        Look.setPref('title', select.value, ctx);
        return true;
    };

    if (Look) {
        Look.register({ id: 'frames', tab: 'profile', title: 'Rámeček profilu', noTitle: true, order: 30, render: renderFrames, click: clickFrames, apply: () => {} });
        Look.register({ id: 'title', tab: 'profile', title: 'Titul u jména', noTitle: true, card: false, order: 40, render: renderTitle, click: () => false, change: changeTitle, apply: () => {} });
    }
    return { frameClass, titleOptions, frameHint };
});
