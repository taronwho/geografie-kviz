// Vzhled: rámečky profilu kolem obrázku hráče (CSS třídy .frame-* v src/input.css) a titul u jména (úroveň, nic, nebo získaný odznak).
// Obrázky hráče (odemykatelná emoji) se vybírají v záložce Profil (app.js), jejich katalog je v look.js. Používá MudrlantLook (look.js).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantLook || (isNode ? require('./look.js') : null), root.MudrlantCore || (isNode ? require('./quiz-core.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantLookFrames = api;
})(typeof self !== 'undefined' ? self : this, (Look, Core) => {
    'use strict';
    const SHORT = { zadny: 'Bez', bronz: 'Bronz', stribro: 'Stříbro', zlato: 'Zlato', vavrin: 'Vavřín', plamen: 'Plamen', diamant: 'Diamant' };
    const escapeHtml = (text) => Core && Core.escapeHtml ? Core.escapeHtml(text) : String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

    // Třídy rámečku pro obrázek hráče; neznámé id (a „bez rámečku“) nedá nic, takže cizí hodnota z databáze nic nerozbije
    const frameClass = (id) => {
        const item = Look && typeof id === 'string' ? Look.find('frames', id) : null;
        return item && item.id !== 'zadny' ? ` frame frame-${item.id}` : '';
    };

    // Možnosti výběru titulu: úroveň (výchozí), nic a získané odznaky (id → název); vybraný odznak je v nabídce vždy
    const titleOptions = ({ level, levelTitle, earnedIds, current, badgeTitle }) => {
        const ids = [...earnedIds];
        if (current && current !== 'level' && current !== 'none' && !ids.includes(current)) ids.push(current);
        return [
            { value: 'level', label: `Úroveň a titul (Úr. ${level} · ${levelTitle})` },
            { value: 'none', label: 'Nic' },
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
        const tiles = Look.FRAMES.map(item => {
            const unlocked = Look.isUnlocked(item, ctx);
            const label = unlocked || item.id === 'zadny' ? SHORT[item.id] : (item.badge ? 'Odznak' : `Úr. ${item.level}`);
            const text = unlocked ? item.title : `${item.title}: ${Look.unlockText(item, item.badge ? badgeTitle(item.badge) : null)}`;
            return `<button type="button" data-frame="${item.id}" aria-pressed="${item.id === selected}" aria-label="${escapeHtml(unlocked ? item.title : `${text} (zamčeno)`)}" title="${escapeHtml(text)}" class="flex min-w-0 flex-col items-center gap-1 rounded-xl border-2 px-0.5 pb-1 pt-2 active:scale-95 ${item.id === selected ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/40' : 'border-transparent bg-slate-100 dark:bg-slate-700/60'} ${unlocked ? '' : 'opacity-50 grayscale'}">
                ${ctx.avatarHtml ? ctx.avatarHtml({ ...player, id: null, frame: item.id }, 'h-8 w-8 text-base') : ''}
                <span class="max-w-full truncate text-[10px] font-bold leading-none text-slate-600 dark:text-slate-300">${escapeHtml(label)}</span>
            </button>`;
        }).join('');
        const shown = hint || frameHint(Look.find('frames', selected), ctx, badgeTitle);
        return `<div class="grid grid-cols-7 gap-1" role="group" aria-label="Rámeček profilu">${tiles}</div>
            <p class="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400" role="status">${escapeHtml(shown)}${ctx.user ? '' : ' · uvidí ho hráči po přihlášení'}</p>`;
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
        const options = titleOptions({
            level: ctx.level, levelTitle: Core && Core.titleForLevel ? Core.titleForLevel(ctx.level) : '', earnedIds: earnedBadgeIds(ctx), current: ctx.prefs.title, badgeTitle
        });
        const optionHtml = (option) => `<option value="${escapeHtml(option.value)}"${option.value === ctx.prefs.title ? ' selected' : ''}>${escapeHtml(option.label)}</option>`;
        return `<label class="block">
                <span class="sr-only">Co se zobrazí u tvého jména</span>
                <select data-title-select class="min-h-[2.75rem] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                    ${optionHtml(options[0])}${optionHtml(options[1])}
                    ${options.length > 2 ? `<optgroup label="Získané odznaky">${options.slice(2).map(optionHtml).join('')}</optgroup>` : ''}
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
        Look.register({ id: 'frames', title: 'Rámeček profilu', order: 30, render: renderFrames, click: clickFrames, apply: () => {} });
        Look.register({ id: 'title', title: 'Titul u jména', order: 40, render: renderTitle, click: () => false, change: changeTitle, apply: () => {} });
    }
    return { frameClass, titleOptions, frameHint };
});
