// Tutorial při prvním spuštění: sova provede hráče skutečnou dnešní otázkou. Jeden krok = jeden zvýrazněný prvek, zbytek obrazovky
// je ztlumený (čtyři panely kolem prvku, ten sám zůstává klikatelný). Čistá logika kroků a uloženého stavu je nahoře a testuje se
// v Node (tests/tutorial.test.js); vykreslení a napojení na stránku je dole a běží jen v prohlížeči.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantTutorial = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const KEY = 'mudrlant.tutorial';
    // Hráč, který už hrál (před vznikem tutoriálu), ho při prvním otevření nové verze nedostane
    const PLAYED_KEYS = ['mudrlant.stats', 'mudrlant.progress', 'mudrlant.history'];
    const SETTLE_MS = 3500;

    // target = prvek, který se zvýrazní; area 'parent' = zvýrazní se celý jeho rodič (řada dlaždic, mřížka odpovědí);
    // hit = na co se musí klepnout (výchozí target); mode 'tap' = klepnutí na prvek posune dál, 'info' = jen vysvětlení a tlačítko Dál;
    // soft = klepnutí je nepovinné, bublina má i tlačítko Dál
    const STEPS = [
        { id: 'fact', owl: 'sova-vitej', mode: 'tap', target: '#fact-hint:not(.hidden)', title: 'Ahoj, jsem Sova!', text: 'Klepni na žárovku u loga, povím ti, co se stalo tento den v dějinách.' },
        { id: 'daily', owl: 'sova-vitej', mode: 'tap', target: '[data-action="daily"]', area: 'parent', title: 'Dnešní otázky', text: 'Každý den tu najdeš otázku z každého tématu. Klepni na libovolné a zkusíme si ji doopravdy.', intro: 'Ahoj, jsem Sova! Každý den tu najdeš otázku z každého tématu. Klepni na libovolné a zkusíme si ji doopravdy.' },
        { id: 'hint', owl: 'sova-premysleni', mode: 'tap', soft: true, softLabel: 'Bez nápovědy', target: '[data-action="hint"]', title: 'Nápověda', text: 'Nevíš si rady? Klepni na nápovědu. Čím víc nápověd použiješ, tím méně bodů za správnou odpověď dostaneš.' },
        { id: 'choice', owl: 'sova-premysleni', mode: 'tap', target: '[data-action="choice"]', area: 'parent', title: 'Tvoje odpověď', text: 'Vyber odpověď. Je to skutečná otázka, získané XP se ti započítají.' },
        { id: 'result', owl: 'sova-radost', mode: 'info', target: '[data-verdict]', title: 'Výsledek', text: 'Tady vidíš, jak jsi dopadl, a kolik XP jsi získal. Z XP roste tvoje úroveň (ukazuje ji hlavička na úvodu) a za výkony dostaneš odznaky.' },
        { id: 'menu', owl: 'sova-vitej', mode: 'tap', target: '[data-action="daily-home"], [data-action="next"]', title: 'Dál', text: 'Tlačítko Menu tě vrátí na úvod, tlačítko vedle něj ti dá další dnešní otázku. Klepni na Menu.' },
        { id: 'home', owl: 'sova-vitej', mode: 'info', target: '[data-action="play-topic"]', area: 'parent', title: 'Témata a Mix', text: 'Dlaždice jsou témata, vyber si, co chceš hrát. Mix míchá otázky ze všech témat.' },
        { id: 'multi', owl: 'sova-vyzva', mode: 'info', target: '[data-action="home-tab"][data-tab="multi"]', title: 'Více hráčů', text: 'Na téhle záložce vyzveš kamaráda kódem nebo přezdívkou a dáš si odvetu. Z výher roste tvůj rating a liga, je tu i týdenní žebříček. Chce to přihlášení přes Google.' },
        { id: 'settings', owl: 'sova-vitej', mode: 'tap', target: '#btn-settings', title: 'Nastavení', text: 'Tady upravíš Vzhled sovy a aplikace a přihlásíš se, abys mohl hrát výzvy s kamarády. Klepni na kolečko.' }
    ];

    // Úložiště může chybět nebo házet výjimky
    const read = (storage) => {
        try { return storage && storage.getItem(KEY); } catch (e) { return null; }
    };
    const isDone = (storage) => Boolean(read(storage));
    const hasPlayed = (storage) => {
        try { return PLAYED_KEYS.some(key => storage && storage.getItem(key)); } catch (e) { return false; }
    };
    const shouldStart = (storage) => !isDone(storage) && !hasPlayed(storage);
    const markDone = (storage, how) => {
        try { if (storage) storage.setItem(KEY, JSON.stringify({ how: how === 'skipped' ? 'skipped' : 'done' })); } catch (e) { /* bez úložiště se tutoriál ukáže znovu */ }
    };
    const reset = (storage) => {
        try { if (storage) storage.removeItem(KEY); } catch (e) { /* nic */ }
    };

    // Který krok je na řadě. present(krok) říká, jestli jeho cílový prvek je na obrazovce. Hned po klepnutí (strict) se čeká
    // na přesně následující krok (obrazovka se ještě načítá); jinak se kroky bez prvku přeskočí. Bez dalšího prvku se čeká.
    const plan = (steps, index, present, strict) => {
        if (index >= steps.length) return { state: 'finished', index: steps.length };
        if (present(steps[index])) return { state: 'show', index };
        if (strict) return { state: 'wait', index };
        for (let next = index + 1; next < steps.length; next += 1) if (present(steps[next])) return { state: 'show', index: next };
        return { state: 'wait', index };
    };
    // První ukázaný krok se představí (když žárovka není, uvítání nese krok s dnešními otázkami)
    const textFor = (step, first) => (first && step.intro ? step.intro : step.text);
    const owlFor = (step, first) => (first && step.id !== 'fact' ? 'sova-vitej' : step.owl);

    const api = { KEY, STEPS, SETTLE_MS, isDone, hasPlayed, shouldStart, markDone, reset, plan, textFor, owlFor };
    if (!root || !root.document) return api;

    // --- Prohlížeč ---
    const doc = root.document;
    const EXTERNAL = '#fact-overlay, #settings-overlay, #dialog-overlay, #photo-zoom, #place-info, #play-chooser';
    const PANEL = 'pointer-events-auto fixed bg-slate-900/70 dark:bg-black/75';
    let ui = null;
    let observer = null;
    let state = null;
    let frame = 0;
    let timer = 0;

    const setBox = (el, left, top, width, height) => {
        el.style.left = `${Math.round(left)}px`;
        el.style.top = `${Math.round(top)}px`;
        el.style.width = `${Math.max(0, Math.round(width))}px`;
        el.style.height = `${Math.max(0, Math.round(height))}px`;
    };
    const visible = (el) => {
        if (!el || !el.isConnected) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
    };
    const holeOf = (step) => {
        const el = doc.querySelector(step.target);
        const base = el && step.area === 'parent' ? el.parentElement : el;
        return visible(base) ? base : null;
    };
    const present = (step) => Boolean(holeOf(step));
    const external = () => Boolean(doc.querySelector(EXTERNAL));

    const build = () => {
        const el = doc.createElement('div');
        el.id = 'tutorial';
        el.className = 'pointer-events-none fixed inset-0 z-[65] hidden';
        el.innerHTML = `
            <div data-tut-panels>
                <div data-tut-panel class="${PANEL}"></div><div data-tut-panel class="${PANEL}"></div><div data-tut-panel class="${PANEL}"></div><div data-tut-panel class="${PANEL}"></div>
                <div data-tut-cover class="pointer-events-auto fixed"></div>
                <div data-tut-ring class="pointer-events-none fixed rounded-2xl ring-4 ring-gold-400 shadow-[0_0_18px_rgba(239,197,92,0.9)] motion-safe:animate-pulse"></div>
            </div>
            <div data-tut-bubble role="dialog" aria-label="Tutoriál" class="pointer-events-auto fixed inset-x-3 mx-auto max-w-sm rounded-3xl bg-white p-3 shadow-2xl ring-2 ring-gold-400 dark:bg-slate-800">
                <div class="flex items-start gap-2">
                    <img data-tut-owl src="icons/topics/sova-vitej.webp" alt="" class="-my-2 h-16 w-16 shrink-0 object-contain drop-shadow-md">
                    <div role="status" aria-live="polite" class="min-w-0 flex-1">
                        <p data-tut-count class="text-[10px] font-black uppercase tracking-widest text-gold-700 dark:text-gold-400"></p>
                        <p data-tut-title class="text-base font-black leading-tight text-slate-800 dark:text-slate-100"></p>
                        <p data-tut-text class="mt-0.5 text-[13px] leading-snug text-slate-600 dark:text-slate-300"></p>
                    </div>
                </div>
                <div class="mt-2 flex items-center justify-between gap-2">
                    <button type="button" data-tut-skip class="rounded-xl px-3 py-2 text-[13px] font-bold text-slate-500 underline underline-offset-2 active:scale-95 dark:text-slate-400">Přeskočit</button>
                    <button type="button" data-tut-next class="hidden rounded-xl btn-3d bg-brand-700 px-4 py-2 text-[13px] font-black text-white active:scale-95">Dál</button>
                </div>
            </div>`;
        doc.body.appendChild(el);
        const q = (selector) => el.querySelector(selector);
        ui = { root: el, panels: [...el.querySelectorAll('[data-tut-panel]')], cover: q('[data-tut-cover]'), ring: q('[data-tut-ring]'), group: q('[data-tut-panels]'), bubble: q('[data-tut-bubble]'), owl: q('[data-tut-owl]'), count: q('[data-tut-count]'), title: q('[data-tut-title]'), text: q('[data-tut-text]'), skip: q('[data-tut-skip]'), next: q('[data-tut-next]') };
        ui.skip.addEventListener('click', () => finish('skipped'));
        ui.next.addEventListener('click', () => advance());
    };

    const placeBubble = (box) => {
        const height = root.innerHeight;
        const bubble = ui.bubble;
        bubble.style.removeProperty('top');
        bubble.style.removeProperty('bottom');
        if (!box) { bubble.style.top = '4.75rem'; return; }
        const room = bubble.offsetHeight + 12;
        const below = height - box.bottom;
        const above = box.top;
        if (below >= room || below >= above) bubble.style.top = `${Math.max(8, Math.min(box.bottom + 10, height - room + 4))}px`;
        else bubble.style.top = `${Math.max(8, box.top - room + 2)}px`;
    };

    const paint = (step, hole, waiting) => {
        const first = state.shown === 0 || (state.firstId === step.id);
        const waitingText = state.strictUntil > Date.now() ? 'Chvilku…' : 'Dohraj otázku, sova se ukáže zase.';
        ui.group.classList.toggle('hidden', waiting);
        ui.next.classList.toggle('hidden', waiting || !(step.mode === 'info' || step.soft));
        ui.next.textContent = step.soft && step.mode === 'tap' ? step.softLabel || 'Dál' : 'Dál';
        if (waiting) {
            ui.owl.src = 'icons/topics/sova-premysleni.webp';
            ui.count.textContent = '';
            ui.title.textContent = '';
            ui.text.textContent = waitingText;
            placeBubble(null);
            return;
        }
        const wanted = `icons/topics/${owlFor(step, first)}.webp`;
        if (!ui.owl.src.endsWith(wanted)) ui.owl.src = wanted;
        ui.count.textContent = `Krok ${STEPS.indexOf(step) + 1} z ${STEPS.length}`;
        ui.title.textContent = step.title;
        ui.text.textContent = textFor(step, first);
        const rect = hole.getBoundingClientRect();
        const pad = 4;
        const left = Math.max(0, rect.left - pad);
        const top = Math.max(0, rect.top - pad);
        const right = Math.min(root.innerWidth, rect.right + pad);
        const bottom = Math.min(root.innerHeight, rect.bottom + pad);
        const [up, down, side, other] = ui.panels;
        setBox(up, 0, 0, root.innerWidth, top);
        setBox(down, 0, bottom, root.innerWidth, root.innerHeight - bottom);
        setBox(side, 0, top, left, bottom - top);
        setBox(other, right, top, root.innerWidth - right, bottom - top);
        setBox(ui.ring, left, top, right - left, bottom - top);
        setBox(ui.cover, left, top, right - left, bottom - top);
        ui.cover.classList.toggle('hidden', step.mode !== 'info');
        placeBubble({ top, bottom });
    };

    const layout = () => {
        frame = 0;
        if (!state || !ui) return;
        if (external()) { ui.root.classList.add('hidden'); return; }
        const strict = state.strictUntil > Date.now();
        const result = plan(STEPS, state.index, present, strict);
        if (result.state === 'finished') { finish('done'); return; }
        const fresh = state.painted !== result.index;
        state.index = result.index;
        ui.root.classList.remove('hidden');
        if (result.state === 'wait') {
            state.painted = null;
            paint(STEPS[state.index], null, true);
            return;
        }
        const step = STEPS[state.index];
        if (state.firstId === null) state.firstId = step.id;
        const hole = holeOf(step);
        if (fresh) {
            state.painted = state.index;
            if (hole && hole.scrollIntoView) hole.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        paint(step, hole, false);
        if (fresh) ui.skip.focus({ preventScroll: true });
    };
    const refresh = () => { if (state && !frame) frame = root.requestAnimationFrame(layout); };

    const advance = () => {
        if (!state) return;
        state.index += 1;
        state.painted = null;
        state.shown += 1;
        state.strictUntil = Date.now() + SETTLE_MS;
        root.clearTimeout(timer);
        timer = root.setTimeout(refresh, SETTLE_MS + 50);
        if (state.index >= STEPS.length) { finish('done'); return; }
        refresh();
    };

    const finish = (how) => {
        if (!state) return;
        markDone(root.localStorage, how);
        state = null;
        root.clearTimeout(timer);
        if (observer) { observer.disconnect(); observer = null; }
        doc.removeEventListener('click', onClick, true);
        doc.removeEventListener('keydown', onKey, true);
        root.removeEventListener('resize', refresh);
        root.removeEventListener('orientationchange', refresh);
        doc.removeEventListener('scroll', refresh, true);
        if (ui) { ui.root.remove(); ui = null; }
    };

    // Klepnutí na zvýrazněný prvek proběhne normálně (nic nezastavujeme) a po něm se jde na další krok
    const onClick = (event) => {
        if (!state || !ui || ui.root.classList.contains('hidden') || state.painted === null) return;
        const step = STEPS[state.index];
        if (step.mode !== 'tap' || !event.target.closest || ui.root.contains(event.target)) return;
        const hole = holeOf(step);
        const hit = event.target.closest(step.hit || step.target);
        if (!hit || !hole || !hole.contains(hit)) return;
        const last = step.id === 'settings';
        root.setTimeout(() => {
            if (!state) return;
            if (last) {
                // Nastavení se jen ukáže a hned zavře
                const close = doc.querySelector('#settings-overlay [data-close]');
                if (close) close.click();
            }
            advance();
        }, 0);
    };
    const onKey = (event) => {
        if (event.key !== 'Escape' || !state || external()) return;
        event.stopPropagation();
        finish('skipped');
    };

    const begin = (fromStep) => {
        if (state || !doc.body) return;
        state = { index: fromStep || 0, painted: null, shown: 0, firstId: null, strictUntil: 0 };
        if (!ui) build();
        doc.addEventListener('click', onClick, true);
        doc.addEventListener('keydown', onKey, true);
        root.addEventListener('resize', refresh);
        root.addEventListener('orientationchange', refresh);
        doc.addEventListener('scroll', refresh, true);
        const content = doc.getElementById('app-content');
        observer = new root.MutationObserver(refresh);
        if (content) observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
        observer.observe(doc.body, { childList: true });
        const header = doc.getElementById('app-header');
        if (header) observer.observe(header, { attributes: true, subtree: true, attributeFilter: ['class'] });
        refresh();
    };

    // Po prvním zobrazení domovské obrazovky: ukáže se, jen když tutoriál ještě nebyl a hráč ještě nehrál. ready = čekání na žárovku.
    api.maybeStart = (options = {}) => {
        if (state || !shouldStart(root.localStorage)) return;
        const run = () => { if (!state && shouldStart(root.localStorage) && doc.querySelector('[data-action="daily"]')) begin(0); };
        if (options.ready && options.ready.then) options.ready.then(run, run); else run();
    };
    // Tlačítko v Nastavení: znovu od začátku (musí se zavolat na domovské obrazovce)
    api.restart = () => {
        if (state) finish('skipped');
        reset(root.localStorage);
        begin(0);
    };
    api.isActive = () => Boolean(state);
    api.skip = () => finish('skipped');
    return api;
});
