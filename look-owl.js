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
    const PAD = { l: 0.34, r: 0.22, t: 0.26, b: 0.12 };
    const LAYER_CLASS = 'pointer-events-none absolute left-[-34%] top-[-26%] w-[156%] max-w-none select-none';
    // Pořadí kreslení: krk dole, pak obličej, hlava a ruka nahoře
    const ORDER = ['neck', 'face', 'head', 'hand'];
    // Vlastní barva z palety: původní obrázek doplňku se přebarví otočením odstínu (CSS filtr). Třídy jsou vypsané celé, ať je Tailwind najde.
    const HUE_CLASSES = { 5: 'hue-rotate-[5deg]', 10: 'hue-rotate-[10deg]', 15: 'hue-rotate-[15deg]', 20: 'hue-rotate-[20deg]', 25: 'hue-rotate-[25deg]', 30: 'hue-rotate-[30deg]', 35: 'hue-rotate-[35deg]', 40: 'hue-rotate-[40deg]', 45: 'hue-rotate-[45deg]', 50: 'hue-rotate-[50deg]', 55: 'hue-rotate-[55deg]', 60: 'hue-rotate-[60deg]', 65: 'hue-rotate-[65deg]', 70: 'hue-rotate-[70deg]', 75: 'hue-rotate-[75deg]', 80: 'hue-rotate-[80deg]', 85: 'hue-rotate-[85deg]', 90: 'hue-rotate-[90deg]', 95: 'hue-rotate-[95deg]', 100: 'hue-rotate-[100deg]', 105: 'hue-rotate-[105deg]', 110: 'hue-rotate-[110deg]', 115: 'hue-rotate-[115deg]', 120: 'hue-rotate-[120deg]', 125: 'hue-rotate-[125deg]', 130: 'hue-rotate-[130deg]', 135: 'hue-rotate-[135deg]', 140: 'hue-rotate-[140deg]', 145: 'hue-rotate-[145deg]', 150: 'hue-rotate-[150deg]', 155: 'hue-rotate-[155deg]', 160: 'hue-rotate-[160deg]', 165: 'hue-rotate-[165deg]', 170: 'hue-rotate-[170deg]', 175: 'hue-rotate-[175deg]', 180: 'hue-rotate-[180deg]', 185: 'hue-rotate-[185deg]', 190: 'hue-rotate-[190deg]', 195: 'hue-rotate-[195deg]', 200: 'hue-rotate-[200deg]', 205: 'hue-rotate-[205deg]', 210: 'hue-rotate-[210deg]', 215: 'hue-rotate-[215deg]', 220: 'hue-rotate-[220deg]', 225: 'hue-rotate-[225deg]', 230: 'hue-rotate-[230deg]', 235: 'hue-rotate-[235deg]', 240: 'hue-rotate-[240deg]', 245: 'hue-rotate-[245deg]', 250: 'hue-rotate-[250deg]', 255: 'hue-rotate-[255deg]', 260: 'hue-rotate-[260deg]', 265: 'hue-rotate-[265deg]', 270: 'hue-rotate-[270deg]', 275: 'hue-rotate-[275deg]', 280: 'hue-rotate-[280deg]', 285: 'hue-rotate-[285deg]', 290: 'hue-rotate-[290deg]', 295: 'hue-rotate-[295deg]', 300: 'hue-rotate-[300deg]', 305: 'hue-rotate-[305deg]', 310: 'hue-rotate-[310deg]', 315: 'hue-rotate-[315deg]', 320: 'hue-rotate-[320deg]', 325: 'hue-rotate-[325deg]', 330: 'hue-rotate-[330deg]', 335: 'hue-rotate-[335deg]', 340: 'hue-rotate-[340deg]', 345: 'hue-rotate-[345deg]', 350: 'hue-rotate-[350deg]', 355: 'hue-rotate-[355deg]' };
    // Pruh s duhou pod posuvníkem odstínu (třída musí být celá, ať ji Tailwind najde)
    const HUE_BAR = 'appearance-none rounded-full bg-[linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]';
    const COLOR_DOT = {
        original: 'bg-gradient-to-br from-amber-300 via-rose-400 to-sky-500', cervena: 'bg-red-600', oranzova: 'bg-orange-500', zluta: 'bg-yellow-400',
        zelena: 'bg-green-600', modra: 'bg-blue-600', fialova: 'bg-purple-600', ruzova: 'bg-pink-400',
        vlastni: 'bg-[conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]'
    };
    const escapeHtml = (text) => Core && Core.escapeHtml ? Core.escapeHtml(text) : String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const badgeTitle = (id) => (Core && Core.BADGE_BY_ID && Core.BADGE_BY_ID[id] ? Core.BADGE_BY_ID[id].title : id);

    // Adresa obrázku vrstvy; neznámé id a barva se nevykreslí (cizí hodnota nic nerozbije)
    const layerSrc = (id, color) => {
        const item = Look ? Look.find('accessories', id) : null;
        if (!item) return null;
        const known = Look.ACC_COLORS.some(entry => entry.id === color && entry.id !== 'vlastni') ? color : 'original';
        return `icons/doplnky/${item.id}${known === 'original' ? '' : `-${known}`}.webp`;
    };
    // Třída přebarvení pro vlastní odstín (o kolik se má otočit odstín původního obrázku doplňku)
    const hueClass = (id, color) => {
        const item = Look ? Look.find('accessories', id) : null;
        const hue = Look ? Look.customHue(color) : null;
        if (!item || hue === null) return '';
        const turn = (((hue - (item.hue || 0)) % 360) + 360) % 360;
        return HUE_CLASSES[Math.round(turn / 5) * 5 % 360] || '';
    };
    // attrs: u živé sovy 'data-owl-layer' (přepisuje se podle voleb), u cizí sovy 'data-keep' (nechá se, jak je)
    const layersHtml = (acc, attrs = 'data-owl-layer') => ORDER.map(slot => {
        const entry = acc && acc[slot];
        const src = entry ? layerSrc(entry.id, entry.color) : null;
        return src ? `<img ${attrs} src="${src}" alt="" class="${LAYER_CLASS} ${hueClass(entry.id, entry.color)}">` : '';
    }).join('');

    // --- Sova jako obrázek profilu: zápis voleb do textu (sloupec profiles.owl), např. 'robe=zelena;head=koruna.modra;face=bryle.original' ---
    // Platnost se kontroluje proti katalogu (ne proti odemčení – hráč má sovu, kterou si ostatní prohlížejí); neznámé části se zahodí.
    const OWL_MAX = 200;
    const encodeOwl = (prefs) => {
        const parsed = parseOwl(prefs);
        const parts = [`robe=${parsed ? parsed.robe : 'vinova'}`];
        if (parsed) for (const slot of ORDER) if (parsed.acc[slot]) parts.push(`${slot}=${parsed.acc[slot].id}.${parsed.acc[slot].color}`);
        return parts.join(';').slice(0, OWL_MAX);
    };
    // Vstup: text, nebo objekt { robe, acc } (třeba Look.prefs()); výstup { robe, acc } nebo null, když nejde o platnou sovu
    // Barva doplňku v zápisu: z katalogu, nebo vlastní odstín h<stupně> (platnost se kontroluje bez ohledu na odemčení)
    const validColor = (color) => Look.ACC_COLORS.some(entry => entry.id === color && entry.id !== 'vlastni') || Look.customHue(color) !== null;
    function parseOwl(input) {
        if (!Look) return null;
        let robe = 'vinova';
        const acc = {};
        let known = false;
        const takeRobe = (id) => { if (Look.find('robes', id)) { robe = id; known = true; } };
        const takeAcc = (slot, id, color) => {
            const item = Look.find('accessories', id);
            if (!item || item.slot !== slot || acc[slot]) return;
            acc[slot] = { id, color: validColor(color) ? color : 'original' };
            known = true;
        };
        if (typeof input === 'string') {
            if (!input || input.length > OWL_MAX) return null;
            for (const part of input.split(';')) {
                const eq = part.indexOf('=');
                if (eq < 1) continue;
                const key = part.slice(0, eq);
                const value = part.slice(eq + 1);
                if (key === 'robe') takeRobe(value);
                else if (Look.SLOTS.some(slot => slot.id === key)) { const dot = value.indexOf('.'); takeAcc(key, dot < 0 ? value : value.slice(0, dot), dot < 0 ? 'original' : value.slice(dot + 1)); }
            }
        } else if (input && typeof input === 'object') {
            takeRobe(input.robe);
            const source = input.acc && typeof input.acc === 'object' ? input.acc : {};
            for (const slot of Look.SLOTS) { const entry = source[slot.id]; if (entry && typeof entry === 'object') takeAcc(slot.id, entry.id, entry.color); }
            known = true;
        } else return null;
        return known ? { robe, acc } : null;
    }
    // Sova z dané konfigurace (ne z mých voleb): data-keep ji ochrání před přebarvením pozorovatelem z look-robes.js
    const owlAvatarHtml = (parsedOrText, imgClass = 'h-full w-auto', wrapClass = 'h-[88%]') => {
        const parsed = parseOwl(parsedOrText);
        if (!parsed) return '';
        const src = `icons/logo${parsed.robe === 'vinova' ? '' : `-${parsed.robe}`}.webp`;
        return `<span class="relative inline-flex shrink-0 ${wrapClass}"><img data-keep src="${src}" alt="" class="${imgClass}">${layersHtml(parsed.acc, 'data-keep')}</span>`;
    };

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
            class="flex h-9 w-full items-center justify-center rounded-xl border-2 ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-transparent bg-slate-50 dark:bg-slate-700/50'} ${open ? '' : 'cursor-not-allowed'}">
            <img src="icons/doplnky/${item.id}-ikona.webp" alt="" class="h-7 w-7 object-contain ${open ? '' : 'opacity-40 grayscale'}"></button>`;
    };
    const noneTile = (slot, selected) => `<button type="button" data-owl-pick="${slot}:none" aria-pressed="${selected}" title="Bez doplňku" aria-label="Bez doplňku"
        class="flex h-9 w-full items-center justify-center rounded-xl border-2 text-lg font-black text-slate-400 ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-transparent bg-slate-50 dark:bg-slate-700/50'}">–</button>`;

    const render = (ctx) => {
        const acc = ctx.prefs.acc || {};
        const slots = Look.SLOTS.map(slot => {
            const chosen = acc[slot.id] ? acc[slot.id].id : 'none';
            const items = Look.ACCESSORIES.filter(item => item.slot === slot.id);
            // Štítek místa nad řádkem a pravidelná mřížka o šesti sloupcích: první dlaždice je vždy „bez doplňku“, další doplňky se jen řadí dál
            return `<div class="flex flex-col gap-1"><p class="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">${slot.title}</p>
                <div class="grid grid-cols-9 gap-1">${noneTile(slot.id, chosen === 'none')}${items.map(item => tile(item, ctx, chosen === item.id)).join('')}</div></div>`;
        }).join('');
        // Barva patří doplňku, který hráč naposledy vybral (nebo prvnímu nasazenému)
        const target = activeSlot && acc[activeSlot] ? activeSlot : Look.SLOTS.map(slot => slot.id).find(id => acc[id]);
        const targetItem = target ? Look.find('accessories', acc[target].id) : null;
        const current = target ? acc[target].color : null;
        const custom = current !== null && Look.customHue(current) !== null;
        const customOpen = Look.ACC_COLORS.find(color => color.id === 'vlastni');
        const dot = (color) => {
            const open = Look.isUnlocked(color, ctx);
            const selected = color.id === 'vlastni' ? custom : current === color.id;
            const label = open ? color.title : `${color.title}: ${Look.unlockText(color)}`;
            return `<button type="button" data-owl-color="${target}:${color.id}" aria-pressed="${selected}" ${open ? '' : 'aria-disabled="true"'} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"
                class="h-8 w-8 rounded-full ${COLOR_DOT[color.id] || ''} ${selected ? 'ring-2 ring-slate-800/70 ring-offset-2 dark:ring-white/80 dark:ring-offset-slate-800' : ''} ${open ? '' : 'opacity-35 grayscale'} active:scale-95"></button>`;
        };
        const slider = custom && Look.isUnlocked(customOpen, ctx) ? `
            <label class="flex flex-col gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">Odstín
                <input type="range" min="0" max="355" step="5" value="${Look.customHue(current)}" data-owl-hue aria-label="Odstín vlastní barvy" class="h-6 w-full cursor-pointer ${HUE_BAR}"></label>` : '';
        const colors = targetItem ? `
            <div class="flex flex-col gap-1.5"><p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Barva: <b class="text-slate-700 dark:text-slate-200">${escapeHtml(targetItem.title)}</b></p>
            <div class="grid grid-cols-9 justify-items-center gap-1" role="group" aria-label="Barva doplňku">${Look.ACC_COLORS.map(dot).join('')}</div>${slider}</div>`
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
            const item = Look.ACC_COLORS.find(entry => entry.id === id);
            if (!item) return false;
            activeSlot = slot;
            if (!Look.isUnlocked(item, ctx)) { note = `${item.title}: ${Look.unlockText(item)}`; return true; }
            note = '';
            // Paleta začíná od odstínu, který už doplněk má, jinak od modré
            const start = Look.customHue(acc[slot].color) !== null ? acc[slot].color : 'h210';
            acc[slot] = { ...acc[slot], color: id === 'vlastni' ? start : id };
            return Look.setPref('acc', acc, ctx);
        }
        return false;
    };
    // Posuvník odstínu vlastní barvy (uloží se po puštění)
    const change = (event, ctx) => {
        const range = event.target.closest('[data-owl-hue]');
        if (!range) return false;
        const slot = activeSlot;
        const acc = { ...(ctx.prefs.acc || {}) };
        if (!slot || !acc[slot]) return false;
        acc[slot] = { ...acc[slot], color: `h${Math.round(Number(range.value) / 5) * 5 % 360}` };
        return Look.setPref('acc', acc, ctx);
    };

    if (Look) Look.register({ id: 'owl', tab: 'owl', title: 'Doplňky Mudrlanta', noTitle: true, order: 5, render, click, change, apply: (prefs) => refresh(prefs.acc || {}) });
    return { logoHtml, layersHtml, layerSrc, refresh, PAD, slotOf, encodeOwl, parseOwl, owlAvatarHtml, OWL_MAX };
});
