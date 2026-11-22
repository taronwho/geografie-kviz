// Barva obleku sovy (Nastavení → Mudrlant). Sova v aplikaci jsou obrázky icons/logo.webp a icons/topics/sova-<póza>.webp (vínový talár);
// ostatní barvy jsou předpřipravené varianty <název>-<barva>.webp (scripts/owl-robes.py). Po výběru se všechny obrázky sovy
// přepnou na variantu (i ty, které se vykreslí později – hlídá je MutationObserver). Používá MudrlantLook (look.js).
// Vlastní barva obleku (od úrovně 20, robe 'vlastni'): odstín a světlost z posuvníků, vínová sova se přebarví v prohlížeči
// (robe-color.js, adresa blob:; původní obrázek zůstane v data-owl-base). Cizí sova s vlastní barvou má data-robe-color (look-owl.js)
// a přebarví se stejně, i když jinak se obrázky s data-keep nemění.
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    const RobeColor = window.MudrlantRobeColor || null;
    if (!Look) return;
    const CUSTOM = Look.ROBE_CUSTOM;
    const ROBE_IDS = Look.ROBES.map(robe => robe.id).filter(id => id !== 'vinova' && id !== CUSTOM);
    // Pózy sovy včetně sov titulů (sova-titul-1 … 11) a logo bez monoklu (icons/logo-bez-monoklu.webp, look-owl.js)
    const OWL_SRC = /^(icons\/(?:logo(?:-vek\d)?(?:-bez-monoklu)?|topics\/sova-[a-z0-9-]+?))(?:-(?:zelena|modra|ruzova|fialova|cerna|zlata|bila))?\.webp$/;
    const owlSrc = (src, robe) => {
        const match = OWL_SRC.exec(src || '');
        return match ? `${match[1]}${robe && ROBE_IDS.includes(robe) ? `-${robe}` : ''}.webp` : null;
    };
    const esc = (text) => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    let robe = 'vinova';
    let robeColor = Look.ROBE_COLOR_DEFAULT;
    let note = '';
    const retint = (img) => {
        const keep = img.hasAttribute('data-keep');
        const color = img.getAttribute('data-robe-color') || (!keep && robe === CUSTOM ? robeColor : null);
        const base = img.getAttribute('data-owl-base') || img.getAttribute('src');
        if (color && RobeColor) {
            const vinova = owlSrc(base, 'vinova');
            if (!vinova) return;
            const key = `${vinova}|${color}`;
            if (img.getAttribute('data-owl-tint') === key) return;
            img.setAttribute('data-owl-base', vinova);
            img.setAttribute('data-owl-tint', key);
            if (!/^blob:/.test(img.getAttribute('src') || '')) img.setAttribute('src', vinova);
            RobeColor.tint(vinova, color).then(url => { if (img.getAttribute('data-owl-tint') === key && url) img.setAttribute('src', url); });
            return;
        }
        if (keep) return;
        const next = owlSrc(base, robe);
        if (img.hasAttribute('data-owl-base')) { img.removeAttribute('data-owl-base'); img.removeAttribute('data-owl-tint'); }
        if (next && next !== img.getAttribute('src')) img.setAttribute('src', next);
    };
    const retintAll = (rootNode) => {
        if (rootNode.nodeType !== 1) return;
        if (rootNode.tagName === 'IMG') retint(rootNode);
        else rootNode.querySelectorAll('img').forEach(retint);
    };
    let observer = null;
    const observe = () => {
        if (observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') retint(record.target);
                else record.addedNodes.forEach(retintAll);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-robe-color'] });
    };
    // Náhled při tažení posuvníkem (okno se překreslí až po puštění, 'change'): sova v dlaždici a puntík barvy
    const draft = (scope) => {
        const hue = scope.querySelector('[data-robe-hue]');
        const light = scope.querySelector('[data-robe-light]');
        return hue && light ? (Look.cleanRobeColor(`${Math.round(Number(hue.value) / 5) * 5 % 360}.${Math.round(Number(light.value) / 5) * 5}`) || robeColor) : robeColor;
    };
    document.addEventListener('input', (event) => {
        const range = event.target.closest && event.target.closest('[data-robe-hue], [data-robe-light]');
        const box = range ? range.closest('[data-robe-custom]') : null;
        if (!box) return;
        const color = draft(box);
        const preview = box.querySelector('[data-robe-preview]');
        if (preview) preview.setAttribute('data-robe-color', color);
    });

    // Horní řádek karty: dlaždice vlastní barvy, vedle ní nadpis „Barva obleku“ s názvem taláru a pod ním posuvníky odstínu a světlosti
    // vedle sebe; zamčená do úrovně 20 („Od 20. úrovně“, posuvníky se neukážou). Nadpis a vlastní barva sdílejí jeden řádek vysoký
    // jako dlaždice, ať se karta Mudrlant vejde bez posouvání i na 360×640 (s nejdelším výběrem doplňků). Posuvníky mají pruhy z tříd
    // (duha, tma → světlo), žádné vložené styly (CSP).
    const headRow = (ctx, heading) => {
        const item = Look.find('robes', CUSTOM);
        if (!item) return `<div class="mb-1 px-1">${heading}</div>`;
        const open = Look.isUnlocked(item, ctx);
        const selected = ctx.prefs.robe === CUSTOM;
        const color = ctx.prefs.robeColor || Look.ROBE_COLOR_DEFAULT;
        const [hue, light] = color.split('.').map(Number);
        const tile = `<button type="button" data-robe-pick="${CUSTOM}" ${open ? '' : 'aria-disabled="true"'} aria-pressed="${selected}" aria-label="${esc(item.title)}${open ? '' : ', zamčeno: od 20. úrovně'}" title="${esc(item.title)}${open ? '' : ': od 20. úrovně'}"
                class="relative flex h-11 w-11 shrink-0 p-px ${open ? '' : 'cursor-not-allowed'}">
                <span class="robe-rainbow flex h-full w-full items-center justify-center rounded-xl p-0.5 ${selected ? 'ring-2 ring-brand-500' : ''}"><span class="flex h-full w-full items-center justify-center rounded-[0.6rem] bg-slate-50 dark:bg-slate-700"><img src="icons/topics/sova-vitej.webp" alt="" data-keep data-robe-preview data-robe-color="${esc(color)}" class="h-9 w-full max-w-[2.25rem] object-contain ${open ? '' : 'opacity-40 grayscale'}"></span></span>
                ${open ? '' : '<span class="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-600 text-white ring-1 ring-white dark:bg-slate-300 dark:text-slate-900 dark:ring-slate-800" aria-hidden="true"><i data-lucide="lock" class="h-2 w-2"></i></span>'}
            </button>`;
        const below = open
            ? `<div class="mt-1 flex items-center gap-3">
                    <input type="range" min="0" max="355" step="5" value="${hue}" data-robe-hue aria-label="Vlastní barva obleku: odstín" class="robe-range robe-range-hue h-4 min-w-0 flex-1 cursor-pointer">
                    <input type="range" min="-40" max="40" step="5" value="${light}" data-robe-light aria-label="Vlastní barva obleku: světlost" class="robe-range robe-range-light h-4 min-w-0 flex-1 cursor-pointer">
                </div>`
            : '<p class="mt-0.5 text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400">Vlastní barva obleku: Od 20. úrovně</p>';
        return `<div data-robe-custom ${open ? '' : 'data-locked '}class="mb-1 flex items-center gap-2 px-1">${tile}<div class="min-w-0 flex-1">${heading}${below}</div></div>`;
    };

    Look.register({
        id: 'robes', tab: 'owl', title: 'Barva obleku', order: 20, tight: true, noTitle: true,
        // Kompaktně (karta Mudrlant se vejde bez posouvání): osm talárů v jedné řadě, jen sova v dlaždici 44 px, zamčená zašedlá se zámkem;
        // název a jak se odemyká je v popisku (i pro čtečku) a vpravo v nadpisu (vybraný talár, nebo zamčený, na který hráč klepl).
        // Řada sahá i do okraje karty a tlačítka nemají mezery (i na 360 px aspoň 40 px na šířku); mezeru mezi dlaždicemi dělá okraj
        // tlačítka kolem barevného podkladu. Vlastní barva je v řádku s nadpisem nad nimi (headRow).
        render: (ctx) => {
            const chosen = ctx.prefs.robe;
            const tiles = Look.ROBES.filter(item => item.id !== CUSTOM).map(item => {
                const open = Look.isUnlocked(item, ctx);
                const selected = item.id === chosen;
                const art = owlSrc('icons/topics/sova-vitej.webp', item.id);
                const lockText = open ? '' : Look.unlockText(item).replace('Úroveň', 'Úr.');
                return `<button type="button" data-robe-pick="${item.id}" ${open ? '' : 'aria-disabled="true"'} aria-pressed="${selected}" aria-label="${esc(item.title)}${open ? '' : `, zamčeno: ${esc(Look.unlockText(item))}`}" title="${esc(item.title)}${open ? '' : `: ${esc(Look.unlockText(item))}`}"
                    class="relative flex h-11 min-w-0 p-px ${open ? '' : 'cursor-not-allowed'}">
                    <span class="flex h-full w-full min-w-0 items-center justify-center rounded-xl ${selected ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-950' : 'bg-slate-50 dark:bg-slate-700/50'}"><img src="${art}" alt="" data-keep class="h-10 w-full max-w-[2.5rem] object-contain ${open ? '' : 'opacity-40 grayscale'}"></span>
                    ${open ? '' : `<span class="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-600 text-white ring-1 ring-white dark:bg-slate-300 dark:text-slate-900 dark:ring-slate-800" aria-hidden="true"><i data-lucide="lock" class="h-2 w-2"></i></span>`}
                    <span class="sr-only">${esc(lockText)}</span>
                </button>`;
            }).join('');
            const current = Look.find('robes', chosen) || Look.ROBES[0];
            const heading = `<div class="flex items-baseline justify-between gap-2"><h3 class="shrink-0 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Barva obleku</h3><span class="min-w-0 truncate text-[11px] font-bold ${note ? 'text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300'}">${esc(note || current.title)}</span></div>`;
            return `${headRow(ctx, heading)}
                <div class="-mx-1 grid grid-cols-8" role="group" aria-label="Barva obleku Mudrlanta">${tiles}</div>`;
        },
        click: (event, ctx) => {
            const button = event.target.closest('[data-robe-pick]');
            if (!button) return false;
            const item = Look.find('robes', button.dataset.robePick);
            if (!item) return false;
            if (!Look.isUnlocked(item, ctx)) { note = `${item.title}: ${item.custom ? 'od 20. úrovně' : Look.unlockText(item)}`; return true; }
            note = '';
            return Look.setPref('robe', item.id, ctx);
        },
        // Puštěný posuvník: barva se uloží a vlastní talár se rovnou oblékne
        change: (event, ctx) => {
            const box = event.target.closest('[data-robe-custom]');
            if (!box || !event.target.closest('[data-robe-hue], [data-robe-light]')) return false;
            const item = Look.find('robes', CUSTOM);
            if (!item || !Look.isUnlocked(item, ctx)) return false;
            note = '';
            Look.setPref('robeColor', draft(box), ctx);
            if (ctx.prefs.robe !== CUSTOM) Look.setPref('robe', CUSTOM, ctx);
            return true;
        },
        apply: (prefs) => {
            robe = prefs.robe === CUSTOM || ROBE_IDS.includes(prefs.robe) ? prefs.robe : 'vinova';
            robeColor = Look.cleanRobeColor(prefs.robeColor) || Look.ROBE_COLOR_DEFAULT;
            document.documentElement.dataset.robe = robe;
            if (RobeColor) RobeColor.setCurrent(robe === CUSTOM ? robeColor : null);
            observe();
            retintAll(document.documentElement);
        }
    });
})();
