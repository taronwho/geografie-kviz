// Barva obleku sovy (Nastavení → Mudrlant). Sova v aplikaci jsou obrázky icons/logo.webp a icons/topics/sova-<póza>.webp (vínový talár);
// ostatní barvy jsou předpřipravené varianty <název>-<barva>.webp (scripts/owl-robes.py). Po výběru se všechny obrázky sovy
// přepnou na variantu (i ty, které se vykreslí později – hlídá je MutationObserver). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    const ROBE_IDS = Look.ROBES.map(robe => robe.id).filter(id => id !== 'vinova');
    // Pózy sovy včetně sov titulů (sova-titul-1 … 11)
    const OWL_SRC = /^(icons\/(?:logo|topics\/sova-[a-z0-9-]+?))(?:-(?:zelena|modra|ruzova|fialova|cerna|zlata))?\.webp$/;
    const owlSrc = (src, robe) => {
        const match = OWL_SRC.exec(src || '');
        return match ? `${match[1]}${robe && robe !== 'vinova' ? `-${robe}` : ''}.webp` : null;
    };
    const esc = (text) => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    let robe = 'vinova';
    let note = '';
    const retint = (img) => {
        if (img.hasAttribute('data-keep')) return;
        const next = owlSrc(img.getAttribute('src'), robe);
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
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    };

    Look.register({
        id: 'robes', tab: 'owl', title: 'Barva obleku', order: 20, tight: true, noTitle: true,
        // Kompaktně (karta Mudrlant se vejde bez posouvání): jen sova v dlaždici 44 px, zamčená zašedlá se zámkem; název a jak se odemyká
        // je v popisku (i pro čtečku) a vpravo v nadpisu (vybraný talár, nebo zamčený, na který hráč klepl)
        render: (ctx) => {
            const chosen = ctx.prefs.robe;
            const tiles = Look.ROBES.map(item => {
                const open = Look.isUnlocked(item, ctx);
                const selected = item.id === chosen;
                const art = owlSrc('icons/topics/sova-vitej.webp', item.id);
                const lockText = open ? '' : Look.unlockText(item).replace('Úroveň', 'Úr.');
                return `<button type="button" data-robe-pick="${item.id}" ${open ? '' : 'aria-disabled="true"'} aria-pressed="${selected}" aria-label="${esc(item.title)}${open ? '' : `, zamčeno: ${esc(Look.unlockText(item))}`}" title="${esc(item.title)}${open ? '' : `: ${esc(Look.unlockText(item))}`}"
                    class="relative flex h-11 min-w-0 items-center justify-center rounded-xl ${selected ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-950' : 'bg-slate-50 dark:bg-slate-700/50'} ${open ? '' : 'cursor-not-allowed'}">
                    <img src="${art}" alt="" data-keep class="h-10 w-10 object-contain ${open ? '' : 'opacity-40 grayscale'}">
                    ${open ? '' : `<span class="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-600 text-white ring-1 ring-white dark:bg-slate-300 dark:text-slate-900 dark:ring-slate-800" aria-hidden="true"><i data-lucide="lock" class="h-2 w-2"></i></span><span class="sr-only">${esc(lockText)}</span>`}
                </button>`;
            }).join('');
            const current = Look.find('robes', chosen) || Look.ROBES[0];
            return `<div class="mb-1 flex items-baseline justify-between gap-2 px-1"><h3 class="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Barva obleku</h3><p class="min-w-0 truncate text-[11px] font-bold ${note ? 'text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300'}" role="status">${esc(note || current.title)}</p></div>
                <div class="grid grid-cols-7 gap-0.5" role="group" aria-label="Barva obleku Mudrlanta">${tiles}</div>`;
        },
        click: (event, ctx) => {
            const button = event.target.closest('[data-robe-pick]');
            if (!button) return false;
            const item = Look.find('robes', button.dataset.robePick);
            if (!item) return false;
            if (!Look.isUnlocked(item, ctx)) { note = `${item.title}: ${Look.unlockText(item)}`; return true; }
            note = '';
            return Look.setPref('robe', item.id, ctx);
        },
        apply: (prefs) => {
            robe = ROBE_IDS.includes(prefs.robe) ? prefs.robe : 'vinova';
            document.documentElement.dataset.robe = robe;
            observe();
            retintAll(document.documentElement);
        }
    });
})();
