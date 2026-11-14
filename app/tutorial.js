// Tutorial při prvním spuštění: sova nejdřív ukáže, co je na úvodní obrazovce co (prohlídka, každý krok jen vysvětlení s tlačítkem
// Dál), pak si hráč zkusí skutečnou dnešní otázku. Jeden krok = jeden zvýrazněný prvek, zbytek obrazovky je ztlumený (čtyři panely
// kolem prvku, ten sám zůstává klikatelný). Běžící tutoriál se ukládá po každém kroku, takže přežije obnovení stránky i hraní
// mezi kroky; zmizí jen po Přeskočit nebo po posledním kroku. Čistá logika kroků a uloženého stavu je nahoře a testuje se
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
    // Jak dlouho se čeká na cílový prvek, než bublina nabídne Přeskočit krok
    const WAIT_MS = 8000;
    // Krátká prodleva po klepnutí: obrazovka se ještě přepíná, nesmí se hned vracet
    const GRACE_MS = 900;

    // target = prvek, který se zvýrazní; area 'parent' = zvýrazní se celý jeho rodič (řada dlaždic, mřížka odpovědí);
    // hit = na co se musí klepnout (výchozí target); mode 'tap' = klepnutí na prvek posune dál, 'info' = jen vysvětlení a tlačítko Dál;
    // soft = klepnutí je nepovinné, bublina má i tlačítko Dál; skippable = chybí-li prvek, ale některý z dalších je vidět, krok se
    // vynechá (jinak se na prvek vždy čeká); phase 'tour' = prohlídka, 'try' = zkoušení; wait = text při čekání na prvek
    const TOUR_WAIT = 'Vrať se na úvodní obrazovku, tam ti vše ukážu.';
    const QUESTION_LOST = 'Otázka se nenačetla. Zkus ji otevřít znovu z úvodní obrazovky, nebo tento krok přeskoč.';
    const STEPS = [
        { id: 'fact', phase: 'tour', owl: 'sova-vitej', mode: 'tap', soft: true, softLabel: 'Dál', skippable: true, target: '#fact-hint:not(.hidden)', hit: '#fact-hint', title: 'Ahoj, jsem Mudrlant!', text: 'Žárovka u mého loga ukazuje, co se tento den stalo v dějinách. Můžeš na ni klepnout, nebo pokračovat tlačítkem Dál.', wait: 'Hledám žárovku…', waitLong: TOUR_WAIT },
        { id: 'badge', phase: 'tour', owl: 'sova-vitej', mode: 'info', target: '#status-badge', title: 'Úroveň a XP', text: 'Za správné odpovědi sbíráš XP, rosteš v úrovních a za výkony dostaneš odznaky. Klepnutí na sovu otevře událost dne, klepnutí na text tvůj postup.', intro: 'Ahoj, jsem Mudrlant! Za správné odpovědi sbíráš XP, rosteš v úrovních a za výkony dostaneš odznaky. Klepnutí na sovu otevře událost dne, klepnutí na text tvůj postup.',
            // I na úzkém displeji (360 px) je vedle sovy úroveň s pruhem (bez názvu a titulu), takže text platí všude
            wait: 'Chvilku…', waitLong: TOUR_WAIT },
        { id: 'daily', phase: 'tour', owl: 'sova-vitej', mode: 'info', target: '[data-action="daily"]', area: 'parent', title: 'Dnešní otázky', text: 'Každý den tu najdeš jednu otázku z každého tématu. Zodpovězené se označí a nové přibudou zítra.', intro: 'Ahoj, jsem Mudrlant! Každý den tu najdeš otázku z každého tématu. Splněné se označí, další čekají do zítřka.', wait: 'Chvilku…', waitLong: TOUR_WAIT },
        { id: 'quiz', phase: 'tour', owl: 'sova-vitej', mode: 'info', skippable: true, target: '#home-specials', title: 'Výzvy dne', text: 'V řadě Výzvy najdeš hry, které jsou stejné pro všechny hráče: Kvíz dne s 10 otázkami, Řetězovku, kde je odpověď začátkem další otázky, a Bosse týdne, kterého porazíš správnými odpověďmi.', wait: 'Chvilku…', waitLong: TOUR_WAIT },
        { id: 'mystery', phase: 'tour', owl: 'sova-dalekohled', mode: 'info', skippable: true, target: '#mystery-card', title: 'Tajemná otázka dne', text: 'Každý den jedna záhada, stejná pro všechny. Během dne přibývají nápovědy. Máš 3 pokusy a čím dřív uhodneš, tím víc bodů získáš.', wait: 'Chvilku…', waitLong: TOUR_WAIT },
        { id: 'topics', phase: 'tour', owl: 'sova-vitej', mode: 'info', target: '[data-action="play-topic"]', area: 'parent', title: 'Témata a Mix', text: 'Každá dlaždice je jedno téma, klepni na to, které chceš hrát. Mix míchá otázky ze všech témat.', wait: 'Chvilku…', waitLong: TOUR_WAIT },
        { id: 'multi', phase: 'tour', owl: 'sova-vyzva', mode: 'info', target: '[data-action="home-tab"][data-tab="multi"]', title: 'Více hráčů', text: 'Na téhle záložce vyzveš kamaráda kódem nebo přezdívkou a dáš si odvetu. Z výher roste tvůj rating a liga, je tu i týdenní žebříček a turnaj. Chce to přihlášení přes Google.', wait: TOUR_WAIT, waitLong: TOUR_WAIT, skippable: true },
        { id: 'settings', phase: 'tour', owl: 'sova-vitej', mode: 'info', target: '#btn-settings', title: 'Nastavení', text: 'Tady oblékneš Mudrlanta a vybereš si profilový obrázek a rámeček. Taky se tu přihlásíš a pak můžeš hrát výzvy s kamarády.', wait: 'Chvilku…', waitLong: TOUR_WAIT },
        { id: 'try', phase: 'try', owl: 'sova-vitej', mode: 'tap', target: '[data-action="daily"]', area: 'parent', hit: '[data-action="daily"]', title: 'Teď si to zkusíme doopravdy', text: 'Klepni na libovolnou dnešní otázku. Je skutečná, získané XP se ti započítají.', wait: 'Chvilku…', waitLong: 'Vrať se na úvodní obrazovku a klepni na dnešní otázku, nebo tento krok přeskoč.' },
        { id: 'hint', phase: 'try', owl: 'sova-premysleni', mode: 'tap', soft: true, softLabel: 'Bez nápovědy', skippable: true, target: '[data-action="hint"]', title: 'Nápověda', text: 'Nevíš si rady? Klepni na nápovědu. Čím víc nápověd použiješ, tím méně bodů za správnou odpověď dostaneš.', wait: 'Načítám otázku…', waitLong: QUESTION_LOST },
        { id: 'choice', phase: 'try', owl: 'sova-premysleni', mode: 'tap', skippable: true, target: '[data-action="choice"], #answer-form', area: 'parent', hit: '[data-action="choice"], #answer-form button[type="submit"]', title: 'Tvoje odpověď', text: 'Vyber jednu z možností, nebo odpověď napiš. Je to skutečná otázka, získané XP se ti započítají.', wait: 'Načítám otázku…', waitLong: QUESTION_LOST },
        { id: 'result', phase: 'try', owl: 'sova-radost', mode: 'info', target: '[data-verdict]', title: 'Výsledek', text: 'Tady vidíš, jak to dopadlo a kolik XP ti to přineslo. Z XP roste tvoje úroveň (ukazuje ji hlavička na úvodu) a za výkony dostaneš odznaky.', wait: 'Chvilku…', waitLong: 'Výsledek se neukázal. Odpověz na otázku, nebo tento krok přeskoč.' },
        { id: 'menu', phase: 'try', owl: 'sova-vitej', mode: 'tap', target: '[data-action="daily-home"], [data-action="next"]', area: 'parent', hit: '[data-action="daily-home"], [data-action="next"]', title: 'Dál', text: 'Tlačítko Menu tě vrátí na úvodní obrazovku, tlačítko vedle něj otevře další dnešní otázku. Klepnutím na kterékoli z nich tutoriál skončí.', wait: 'Chvilku…', waitLong: 'Tlačítko se neukázalo. Vrať se na úvod, nebo tento krok přeskoč.' }
    ];
    const TRY_INDEX = STEPS.findIndex(step => step.id === 'try');

    // Uložený stav: {how:'running', step:n} = běží, {how:'done'|'skipped'} = hotovo. Úložiště může chybět nebo házet výjimky
    const read = (storage) => {
        try { return storage ? storage.getItem(KEY) : null; } catch (e) { return null; }
    };
    const parse = (storage) => {
        const raw = read(storage);
        if (!raw) return null;
        let value = null;
        try { value = JSON.parse(raw); } catch (e) { /* starý či cizí zápis: bráno jako hotovo */ }
        if (value && value.how === 'running') {
            const step = Number.isInteger(value.step) ? Math.min(Math.max(value.step, 0), STEPS.length - 1) : 0;
            return { how: 'running', step, noFact: value.noFact === true };
        }
        return { how: value && value.how === 'skipped' ? 'skipped' : 'done' };
    };
    const isRunning = (storage) => { const saved = parse(storage); return Boolean(saved) && saved.how === 'running'; };
    const isDone = (storage) => { const saved = parse(storage); return Boolean(saved) && saved.how !== 'running'; };
    const hasPlayed = (storage) => {
        try { return PLAYED_KEYS.some(key => storage && storage.getItem(key)); } catch (e) { return false; }
    };
    // Běžící tutoriál pokračuje, i když hráč mezitím hrál; nový se ukáže jen tomu, kdo ještě nehrál
    const shouldStart = (storage) => isRunning(storage) || (!isDone(storage) && !hasPlayed(storage));
    const resumeStep = (storage) => { const saved = parse(storage); return saved && saved.how === 'running' ? saved.step : 0; };
    const write = (storage, value) => {
        try { if (storage) storage.setItem(KEY, JSON.stringify(value)); } catch (e) { /* bez úložiště se tutoriál ukáže znovu */ }
    };
    // noFact = žárovka u sovy nebyla, krok s ní se nepočítá (pamatuje se, ať počítadlo po obnovení sedí)
    const markRunning = (storage, step, noFact) => write(storage, noFact ? { how: 'running', step, noFact: true } : { how: 'running', step });
    const resumeNoFact = (storage) => { const saved = parse(storage); return Boolean(saved && saved.how === 'running' && saved.noFact); };
    const markDone = (storage, how) => write(storage, { how: how === 'skipped' ? 'skipped' : 'done' });
    const reset = (storage) => {
        try { if (storage) storage.removeItem(KEY); } catch (e) { /* nic */ }
    };

    // Který krok je na řadě. present(krok) říká, jestli jeho cílový prvek je na obrazovce. Chybí-li prvek, čeká se na něj;
    // jen nepovinné kroky (skippable) se vynechají, když je vidět některý z dalších. Po posledním kroku konec.
    const plan = (steps, index, present) => {
        if (index >= steps.length) return { state: 'finished', index: steps.length };
        if (present(steps[index])) return { state: 'show', index };
        if (steps[index].skippable) {
            for (let next = index + 1; next < steps.length; next += 1) {
                if (present(steps[next])) return { state: 'show', index: next };
                if (!steps[next].skippable) break;
            }
        }
        return { state: 'wait', index };
    };
    // Kolikátý krok z kolika; žárovka (hidden = ['fact']) se nepočítá, když u sovy není
    const position = (steps, index, hidden = []) => {
        const active = steps.filter(step => !hidden.includes(step.id));
        const at = active.indexOf(steps[index]);
        return { n: at < 0 ? 0 : at + 1, total: active.length };
    };
    // První ukázaný krok se představí (když žárovka není, uvítání nese první krok prohlídky)
    const textFor = (step, first) => (first && step.intro ? step.intro : step.text);
    const owlFor = (step, first) => (first && step.id !== 'fact' && step.phase === 'tour' ? 'sova-vitej' : step.owl);

    const api = { KEY, STEPS, TRY_INDEX, WAIT_MS, GRACE_MS, isDone, isRunning, hasPlayed, shouldStart, resumeStep, resumeNoFact, markRunning, markDone, reset, plan, position, textFor, owlFor };
    if (!root || !root.document) return api;

    // --- Prohlížeč ---
    const doc = root.document;
    const EXTERNAL = '#fact-overlay, #settings-overlay, #dialog-overlay, #photo-zoom, #place-info, #play-chooser';
    // Kroky při zkoušení otázky: hráč musí otázku číst, proto je bublina menší (bez sovy), pozadí světlejší a bublina radši pod otázkou
    const READ_IDS = ['hint', 'choice'];
    const SHORT = { hint: 'Nevíš? Klepni na nápovědu.', choice: 'Vyber odpověď, nebo ji napiš. XP se počítají.' };
    const PANEL = 'pointer-events-auto fixed bg-slate-900/70 dark:bg-black/75';
    let ui = null;
    let observer = null;
    let state = null;
    let frame = 0;
    let waitTimer = 0;

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
    // Krok Více hráčů se nepočítá, když záložka není (hra bez Supabase). Rozhoduje nastavení hry, ne to, jestli je záložka
    // právě vidět: mimo úvod (otázka, výsledek) by jinak počítadlo skočilo z „Krok 7 z 11“ na „Krok 7 z 10“
    const multiOn = () => {
        try { return Boolean(root.MudrlantAuth && root.MudrlantAuth.isConfigured() && root.MudrlantSocial); } catch (e) { return false; }
    };
    const hidden = () => [...(state && state.noFact ? ['fact'] : []), ...(multiOn() || doc.querySelector('[data-action="home-tab"][data-tab="multi"]') ? [] : ['multi'])];

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
                    <button type="button" data-tut-skip class="rounded-xl px-3 py-2.5 text-[13px] font-bold text-slate-500 underline underline-offset-2 active:scale-95 dark:text-slate-400">Přeskočit</button>
                    <button type="button" data-tut-skipstep class="hidden rounded-xl btn-3d bg-slate-200 px-4 py-2 text-[13px] font-black text-slate-700 active:scale-95 dark:bg-slate-700 dark:text-slate-100">Přeskočit krok</button>
                    <button type="button" data-tut-next class="hidden rounded-xl btn-3d bg-brand-700 px-4 py-2 text-[13px] font-black text-white active:scale-95">Dál</button>
                </div>
            </div>`;
        doc.body.appendChild(el);
        const q = (selector) => el.querySelector(selector);
        ui = { root: el, panels: [...el.querySelectorAll('[data-tut-panel]')], cover: q('[data-tut-cover]'), ring: q('[data-tut-ring]'), group: q('[data-tut-panels]'), bubble: q('[data-tut-bubble]'), owl: q('[data-tut-owl]'), count: q('[data-tut-count]'), title: q('[data-tut-title]'), text: q('[data-tut-text]'), skip: q('[data-tut-skip]'), skipStep: q('[data-tut-skipstep]'), next: q('[data-tut-next]') };
        ui.skip.addEventListener('click', () => finish('skipped'));
        ui.next.addEventListener('click', () => {
            // Rychlé dvojité klepnutí nesmí přeskočit celý další krok
            if (!state || state.painted === null || Date.now() - state.paintedAt < 350) return;
            advance(state.index);
        });
        ui.skipStep.addEventListener('click', () => { if (state) advance(state.index); });
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

    const counter = (step) => {
        const { n, total } = position(STEPS, STEPS.indexOf(step), hidden());
        return `Krok ${n} z ${total}`;
    };

    // Čekání na prvek: skupina ztlumení se skryje (hráč může stránku ovládat), bublina říká, na co se čeká
    const paintWaiting = (step) => {
        const long = Date.now() - state.waitSince >= WAIT_MS;
        ui.group.classList.add('hidden');
        ui.next.classList.add('hidden');
        ui.skipStep.classList.toggle('hidden', !long);
        ui.owl.classList.remove('hidden');
        ui.panels.forEach(panel => { panel.style.opacity = ''; });
        if (!ui.owl.src.endsWith('sova-premysleni.webp')) ui.owl.src = 'icons/topics/sova-premysleni.webp';
        ui.count.classList.remove('hidden');
        ui.count.textContent = counter(step);
        ui.title.textContent = step.title;
        ui.text.textContent = long ? step.waitLong || step.wait : step.wait;
        placeBubble(null);
    };

    const paint = (step, hole) => {
        const first = state.fromStart && state.firstId === step.id;
        ui.group.classList.remove('hidden');
        ui.skipStep.classList.add('hidden');
        ui.next.classList.toggle('hidden', !(step.mode === 'info' || step.soft));
        ui.next.textContent = step.soft && step.mode === 'tap' ? step.softLabel || 'Dál' : 'Dál';
        const read = READ_IDS.includes(step.id);
        ui.owl.classList.toggle('hidden', read);
        ui.panels.forEach(panel => { panel.style.opacity = read ? '0.4' : ''; });
        const wanted = `icons/topics/${owlFor(step, first)}.webp`;
        if (!ui.owl.src.endsWith(wanted)) ui.owl.src = wanted;
        ui.count.textContent = counter(step);
        ui.title.textContent = step.title;
        ui.text.textContent = read && SHORT[step.id] ? SHORT[step.id] : textFor(step, first);
        ui.count.classList.toggle('hidden', read);
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

    const persist = () => { if (state) markRunning(root.localStorage, state.index, state.noFact); };

    const layout = () => {
        frame = 0;
        if (!state || !ui) return;
        if (external()) { ui.root.classList.add('hidden'); return; }
        let result = plan(STEPS, state.index, present);
        if (result.state === 'finished') { finish('done'); return; }
        // Uprostřed zkoušení jsme zase na úvodu (Zpět, nová otázka se nenačetla): vrátí se na výběr dnešní otázky
        if (result.state === 'wait' && result.index > TRY_INDEX && state.graceUntil <= Date.now() && present(STEPS[TRY_INDEX])) {
            result = { state: 'show', index: TRY_INDEX };
        }
        ui.root.classList.remove('hidden');
        if (result.index !== state.index) { state.index = result.index; persist(); }
        const step = STEPS[state.index];
        if (result.state === 'wait') {
            if (state.painted !== null || !state.waitSince) { state.painted = null; state.waitSince = Date.now(); }
            root.clearTimeout(waitTimer);
            const left = WAIT_MS - (Date.now() - state.waitSince);
            if (left > 0) waitTimer = root.setTimeout(refresh, left + 50);
            paintWaiting(step);
            return;
        }
        root.clearTimeout(waitTimer);
        state.waitSince = 0;
        if (state.firstId === null) state.firstId = step.id;
        const hole = holeOf(step);
        const fresh = state.painted !== state.index;
        if (fresh) {
            state.painted = state.index;
            state.paintedAt = Date.now();
            state.tapped = -1;
            if (hole && hole.scrollIntoView) hole.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        paint(step, hole);
        if (fresh) { root.setTimeout(refresh, 500); root.setTimeout(refresh, 1200); }
        if (fresh) (ui.next.classList.contains('hidden') ? ui.skip : ui.next).focus({ preventScroll: true });
    };
    const refresh = () => { if (state && !frame) frame = root.requestAnimationFrame(layout); };

    // Posun o krok dál (from = krok, ze kterého se jde; opožděné či zdvojené klepnutí tak nic nepřeskočí)
    const advance = (from) => {
        if (!state || (from !== undefined && from !== state.index)) return;
        state.index += 1;
        state.painted = null;
        state.waitSince = 0;
        state.graceUntil = Date.now() + GRACE_MS;
        if (state.index >= STEPS.length) { finish('done'); return; }
        persist();
        root.setTimeout(refresh, GRACE_MS + 50);
        refresh();
    };

    const finish = (how) => {
        if (!state) return;
        markDone(root.localStorage, how);
        state = null;
        root.clearTimeout(waitTimer);
        if (observer) { observer.disconnect(); observer = null; }
        doc.removeEventListener('click', onClick, true);
        doc.removeEventListener('keydown', onKey, true);
        root.removeEventListener('resize', refresh);
        root.removeEventListener('orientationchange', refresh);
        doc.removeEventListener('scroll', refresh, true);
        doc.removeEventListener('animationend', refresh, true);
        doc.removeEventListener('transitionend', refresh, true);
        if (ui) { ui.root.remove(); ui = null; }
    };

    // Klepnutí na zvýrazněný prvek proběhne normálně (nic nezastavujeme) a po něm se jde na další krok
    const onClick = (event) => {
        if (!state || !ui || ui.root.classList.contains('hidden') || state.painted === null) return;
        const step = STEPS[state.index];
        if (step.mode !== 'tap' || !event.target.closest || ui.root.contains(event.target)) return;
        if (state.tapped === state.index) return;
        const hole = holeOf(step);
        const hit = event.target.closest(step.hit || step.target);
        if (!hit || !hole || !hole.contains(hit)) return;
        const from = state.index;
        state.tapped = from;
        root.setTimeout(() => advance(from), 0);
    };
    const onKey = (event) => {
        if (event.key !== 'Escape' || !state || external()) return;
        event.stopPropagation();
        finish('skipped');
    };

    const begin = (fromStep) => {
        if (state || !doc.body) return;
        const start = fromStep || 0;
        state = { index: start, painted: null, paintedAt: 0, tapped: -1, firstId: null, fromStart: start === 0, graceUntil: 0, waitSince: 0, noFact: false };
        // Bez žárovky u sovy se krok s ní nepočítá ani nečeká
        if (start === 0 ? !present(STEPS[0]) : resumeNoFact(root.localStorage)) state.noFact = true;
        if (!ui) build();
        persist();
        doc.addEventListener('click', onClick, true);
        doc.addEventListener('keydown', onKey, true);
        root.addEventListener('resize', refresh);
        root.addEventListener('orientationchange', refresh);
        doc.addEventListener('scroll', refresh, true);
        // Prvky se při objevení pohybují (animace): rámeček se přeměří, až skončí
        doc.addEventListener('animationend', refresh, true);
        doc.addEventListener('transitionend', refresh, true);
        const content = doc.getElementById('app-content');
        observer = new root.MutationObserver(refresh);
        if (content) observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
        observer.observe(doc.body, { childList: true });
        const header = doc.getElementById('app-header');
        if (header) observer.observe(header, { attributes: true, subtree: true, attributeFilter: ['class'] });
        refresh();
    };

    // Spuštění po zobrazení úvodu (nebo po načtení aplikace): běžící tutoriál pokračuje od uloženého kroku, nový se ukáže jen
    // tomu, kdo ještě nehrál. ready = čekání na žárovku.
    api.maybeStart = (options = {}) => {
        if (state || !shouldStart(root.localStorage)) return;
        const run = () => {
            if (state || !shouldStart(root.localStorage)) return;
            if (isRunning(root.localStorage)) begin(resumeStep(root.localStorage));
            else if (doc.querySelector('[data-action="daily"]')) begin(0);
        };
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
