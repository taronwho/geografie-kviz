// Vzhled: barva obleku sovy. Sova v aplikaci jsou obrázky icons/logo.webp a icons/topics/sova-<póza>.webp (vínový talár);
// ostatní barvy jsou předpřipravené varianty <název>-<barva>.webp (scripts/owl-robes.py). Po výběru se všechny obrázky sovy
// přepnou na variantu (i ty, které se vykreslí později – hlídá je MutationObserver). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    const ROBE_IDS = Look.ROBES.map(robe => robe.id).filter(id => id !== 'vinova');
    const OWL_SRC = /^(icons\/(?:logo|topics\/sova-[a-z]+?))(?:-(?:zelena|modra|ruzova|fialova|cerna|zlata))?\.webp$/;
    const owlSrc = (src, robe) => {
        const match = OWL_SRC.exec(src || '');
        return match ? `${match[1]}${robe && robe !== 'vinova' ? `-${robe}` : ''}.webp` : null;
    };
    const esc = (text) => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    let robe = 'vinova';
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
        id: 'robes', title: 'Barva obleku sovy', order: 20,
        render: (ctx) => {
            const chosen = ctx.prefs.robe;
            return `<div class="grid grid-cols-7 gap-1">${Look.ROBES.map(item => {
                const open = Look.isUnlocked(item, ctx);
                const selected = item.id === chosen;
                const art = owlSrc('icons/topics/sova-vitej.webp', item.id);
                return `<button type="button" data-robe-pick="${item.id}" ${open ? '' : 'aria-disabled="true"'} aria-pressed="${selected}" aria-label="${esc(item.title)}${open ? '' : `, zamčeno: ${esc(Look.unlockText(item))}`}"
                    class="flex flex-col items-center rounded-xl border-2 px-0 py-1 text-center ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-transparent bg-slate-50 dark:bg-slate-700/50'} ${open ? '' : 'cursor-not-allowed'}">
                    <img src="${art}" alt="" data-keep class="h-10 w-10 object-contain ${open ? '' : 'opacity-40 grayscale'}">
                    <span class="mt-0.5 text-[10px] font-bold leading-tight ${open ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}">${esc(item.title.replace(' talár', ''))}</span>
                    ${open ? '' : `<span class="text-[10px] leading-tight text-slate-500 dark:text-slate-400">${esc(Look.unlockText(item).replace('Úroveň', 'Úr.'))}</span>`}
                </button>`;
            }).join('')}</div>`;
        },
        click: (event, ctx) => {
            const button = event.target.closest('[data-robe-pick]');
            if (!button) return false;
            return Look.setPref('robe', button.dataset.robePick, ctx);
        },
        apply: (prefs) => {
            robe = ROBE_IDS.includes(prefs.robe) ? prefs.robe : 'vinova';
            document.documentElement.dataset.robe = robe;
            observe();
            retintAll(document.documentElement);
        }
    });
})();
