// Doplňky sovy: průhledné vrstvy icons/doplnky/<doplněk>[-<barva>].webp (scripts/owl-accessories.py) se kladou přes logo sovy.
// Vrstva má rám loga rozšířený o okraje (koruna, sluchátka a lupa přesahují obrys), proto je větší než logo a posunutá do záporu.
// Hráč si v Nastavení → Sova vybere doplněk v každém místě (hlava, obličej, krk, ruka) a jeho barvu. Používá MudrlantLook (look.js).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantLook || (isNode ? require('./look.js') : null), root.MudrlantCore || (isNode ? require('./quiz-core.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantOwl = api;
})(typeof self !== 'undefined' ? self : this, (Look, Core) => {
    'use strict';
    // Okraje vrstvy v podílu rozměrů loga (musí odpovídat PAD ve scripts/owl-accessories.py)
    const PAD = { l: 0.14, r: 0.14, t: 0.26, b: 0.05 };
    const LAYER_CLASS = 'pointer-events-none absolute left-[-14%] top-[-26%] w-[128%] max-w-none select-none';
    // Pořadí kreslení: krk dole, pak obličej, hlava a ruka nahoře
    const ORDER = ['neck', 'face', 'head', 'hand'];
    const COLOR_DOT = {
        original: 'bg-gradient-to-br from-amber-300 via-rose-400 to-sky-500', cervena: 'bg-red-600', oranzova: 'bg-orange-500', zluta: 'bg-yellow-400',
        zelena: 'bg-green-600', modra: 'bg-blue-600', fialova: 'bg-purple-600', ruzova: 'bg-pink-400'
    };
    const escapeHtml = (text) => Core && Core.escapeHtml ? Core.escapeHtml(text) : String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const badgeTitle = (id) => (Core && Core.BADGE_BY_ID && Core.BADGE_BY_ID[id] ? Core.BADGE_BY_ID[id].title : id);

    // Adresa obrázku vrstvy; neznámé id a barva se nevykreslí (cizí hodnota nic nerozbije)
    const layerSrc = (id, color) => {
        const item = Look ? Look.find('accessories', id) : null;
        if (!item) return null;
        const known = Look.ACC_COLORS.some(entry => entry.id === color) ? color : 'original';
        return `icons/doplnky/${item.id}${known === 'original' ? '' : `-${known}`}.webp`;
    };
    const layersHtml = (acc) => ORDER.map(slot => {
        const entry = acc && acc[slot];
        const src = entry ? layerSrc(entry.id, entry.color) : null;
        return src ? `<img data-owl-layer src="${src}" alt="" class="${LAYER_CLASS}">` : '';
    }).join('');

    const currentAcc = () => (Look ? Look.prefs().acc : null) || {};
    // Logo sovy s vybranými doplňky; wrapClass patří obalu (okraje), imgClass samotné sově
    const logoHtml = (wrapClass, imgClass, acc = currentAcc()) =>
        `<span data-owl class="relative inline-flex shrink-0 ${wrapClass}"><img src="icons/logo.webp" alt="" class="${imgClass}">${layersHtml(acc)}</span>`;

    // Po změně voleb se vrstvy všech sov na stránce přepíší na místě
    const refresh = (acc) => {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('[data-owl]').forEach(wrapper => {
            wrapper.querySelectorAll('[data-owl-layer]').forEach(layer => layer.remove());
            wrapper.insertAdjacentHTML('beforeend', layersHtml(acc));
        });
    };

    let activeSlot = null;
    let note = '';
    const slotOf = (id) => (Look.find('accessories', id) || {}).slot;

    const tile = (item, ctx, selected) => {
        const open = Look.isUnlocked(item, ctx);
        const label = open ? item.title : `${item.title}: ${Look.unlockText(item, item.badge ? badgeTitle(item.badge) : null)}`;
        return `<button type="button" data-owl-pick="${item.slot}:${item.id}" aria-pressed="${selected}" ${open ? '' : 'aria-disabled="true"'} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"
            class="flex h-11 w-11 items-center justify-center rounded-xl border-2 ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-transparent bg-slate-50 dark:bg-slate-700/50'} ${open ? '' : 'cursor-not-allowed'}">
            <img src="icons/doplnky/${item.id}-ikona.webp" alt="" class="h-8 w-8 object-contain ${open ? '' : 'opacity-40 grayscale'}"></button>`;
    };
    const noneTile = (slot, selected) => `<button type="button" data-owl-pick="${slot}:none" aria-pressed="${selected}" title="Bez doplňku" aria-label="Bez doplňku"
        class="flex h-11 w-11 items-center justify-center rounded-xl border-2 text-lg font-black text-slate-400 ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-transparent bg-slate-50 dark:bg-slate-700/50'}">–</button>`;

    const render = (ctx) => {
        const acc = ctx.prefs.acc || {};
        const slots = Look.SLOTS.map(slot => {
            const chosen = acc[slot.id] ? acc[slot.id].id : 'none';
            const items = Look.ACCESSORIES.filter(item => item.slot === slot.id);
            return `<div class="flex items-center gap-2"><span class="w-14 shrink-0 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">${slot.title}</span>
                <div class="flex flex-wrap gap-1.5">${noneTile(slot.id, chosen === 'none')}${items.map(item => tile(item, ctx, chosen === item.id)).join('')}</div></div>`;
        }).join('');
        // Barva patří doplňku, který hráč naposledy vybral (nebo prvnímu nasazenému)
        const target = activeSlot && acc[activeSlot] ? activeSlot : Look.SLOTS.map(slot => slot.id).find(id => acc[id]);
        const targetItem = target ? Look.find('accessories', acc[target].id) : null;
        const colors = targetItem ? `
            <div class="flex flex-col gap-1.5"><p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Barva: <b class="text-slate-700 dark:text-slate-200">${escapeHtml(targetItem.title)}</b></p>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Barva doplňku">${Look.ACC_COLORS.map(color => `<button type="button" data-owl-color="${target}:${color.id}" aria-pressed="${acc[target].color === color.id}" title="${color.title}" aria-label="${color.title}"
                class="h-8 w-8 rounded-full ${COLOR_DOT[color.id] || ''} ${acc[target].color === color.id ? 'ring-2 ring-slate-800/70 ring-offset-2 dark:ring-white/80 dark:ring-offset-slate-800' : ''} active:scale-95"></button>`).join('')}</div></div>`
            : '<p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Vyber doplněk a pak jeho barvu.</p>';
        return `<div class="flex flex-col gap-2.5">
            <div class="flex justify-center py-1">${logoHtml('mt-6', 'h-24 w-auto drop-shadow-lg [@media(max-height:700px)]:h-16', acc)}</div>
            ${slots}${colors}
            ${note ? `<p role="status" class="text-[11px] font-bold text-brand-700 dark:text-brand-300">${escapeHtml(note)}</p>` : ''}
        </div>`;
    };

    // Klepnutí: zamčený doplněk jen ukáže, jak se odemyká; odemčený se nasadí (nahradí doplněk ve svém místě), „–“ ho sundá
    const click = (event, ctx) => {
        const pick = event.target.closest('[data-owl-pick]');
        const color = event.target.closest('[data-owl-color]');
        const acc = { ...(ctx.prefs.acc || {}) };
        if (pick) {
            const [slot, id] = pick.dataset.owlPick.split(':');
            note = '';
            if (id === 'none') { delete acc[slot]; if (activeSlot === slot) activeSlot = null; }
            else {
                const item = Look.find('accessories', id);
                if (!item || item.slot !== slot) return false;
                if (!Look.isUnlocked(item, ctx)) { note = `${item.title}: ${Look.unlockText(item, item.badge ? badgeTitle(item.badge) : null)}`; return true; }
                acc[slot] = { id, color: acc[slot] && acc[slot].id === id ? acc[slot].color : 'original' };
                activeSlot = slot;
            }
            return Look.setPref('acc', acc, ctx) || Boolean(note);
        }
        if (color) {
            const [slot, id] = color.dataset.owlColor.split(':');
            if (!acc[slot]) return false;
            acc[slot] = { ...acc[slot], color: id };
            activeSlot = slot;
            note = '';
            return Look.setPref('acc', acc, ctx);
        }
        return false;
    };

    if (Look) Look.register({ id: 'owl', tab: 'owl', title: 'Doplňky sovy', noTitle: true, order: 5, render, click, apply: (prefs) => refresh(prefs.acc || {}) });
    return { logoHtml, layersHtml, layerSrc, refresh, PAD, slotOf };
});
