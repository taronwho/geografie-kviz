// Jednohubka: jedna otázka na jedno klepnutí, bez rozehrávání a bez výběru. Malý čip „Jednohubka“ u nadpisu Režimy na záložce Hrát
// otevře rovnou otázku: náhodné téma z hráčových povolených (Mix v Nastavení), kategorie a obtížnost podle nastavení, vždy výběr ze
// 4 možností a bez nápověd a bez času. Po klepnutí na možnost hned výsledek (správná zeleně, špatná červeně, karta s popisem z Wikipedie
// a fotkou) a dvě tlačítka: velké „Ještě jednu“ a menší „Hotovo“, které vrátí hráče přesně tam, odkud přišel (záložka i posun).
// Série = správně zodpovězené jednohubky v řadě: chyba ji jen tiše ukončí (bez trestu, XP se nebere, nejlepší série zůstává) a odchod,
// zavření aplikace ani další den ji nepřeruší. XP: malé (3 za správnou, 1 za pokus) s denním stropem jako u Bleskovky a Přežití (modes.js).
// Čistá logika bez DOMu (uložený stav, XP se stropem, série, texty) a ovladač obrazovky (createController), který kreslí HTML;
// app.js dodá otázku (stejná příprava jako Bleskovka a Přežití: createRoundData, zakrytý úvod článku z Wikipedie), panely otázky
// a odpovědi (questionPanel, answerPanel), zápis chyb a XP. Stav se ukládá jen v zařízení (mudrlant.snack), na server se nic neposílá.
// Testy: tests/snack.test.js, tests/e2e-snack.test.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantSnack = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const STORAGE_KEY = 'mudrlant.snack';
    const TITLE = 'Jednohubka';
    // Lucide ikona čipu a štítku v hlavičce (do dodání vlastního obrázku, viz shrnutí v README)
    const ICON = 'cookie';
    // XP: záměrně méně než v běžné hře (10 + 5 za bod) i než Bleskovka (3 za správnou), jen za pokus 1 XP, ať se nic neztrácí
    const XP_CORRECT = 3;
    const XP_TRY = 1;
    // Denní strop XP za jednohubky (proti „farmení“); série se počítá dál i po stropu
    const DAILY_XP_CAP = 30;
    // Po odpovědi se Ještě jednu neodklepne omylem dvojím klepnutím na možnost (ms)
    const DOUBLE_TAP_MS = 400;

    const plural = (count, [one, few, many]) => {
        const n = Math.abs(count);
        return `${count} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
    };
    const count = (value, max = 1000000) => Number.isFinite(value) && value > 0 ? Math.min(max, Math.floor(value)) : 0;
    const DAY = /^\d{4}-\d{2}-\d{2}$/;

    // --- Uložený stav: dnešní XP, odehrané a správné jednohubky, série (teď, nejlepší a nejlepší z už skončených) ---
    // past = nejdelší skončená série: nová nejlepší se slaví jednou, když ji současná série překoná (první série rekord teprve založí)
    const EMPTY = Object.freeze({ v: 1, day: '', xp: 0, played: 0, correct: 0, streak: 0, best: 0, past: 0 });
    const parse = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const streak = count(data.streak);
        const best = Math.max(count(data.best), streak);
        return {
            v: 1, day: typeof data.day === 'string' && DAY.test(data.day) ? data.day : '', xp: count(data.xp, 100000),
            played: count(data.played), correct: Math.min(count(data.correct), count(data.played)),
            streak, best, past: Math.min(count(data.past), best)
        };
    };
    // Nový den: dnešní XP od nuly (série běží dál, den ji nepřeruší)
    const forDay = (state, dayKey) => state.day === dayKey ? state : { ...state, day: dayKey, xp: 0 };
    const xpLeftToday = (state, dayKey) => Math.max(0, DAILY_XP_CAP - forDay(parse(state), dayKey).xp);

    // Odpověď: zapíše sérii, počty a dnešní XP. Vrátí nový stav, XP s rozpisem (jako u běžné otázky: „+3 XP za správnou odpověď“)
    // a co se stalo se sérií: streak = nová délka, ended = délka série, kterou chyba ukončila (0 = žádná), record = nová nejlepší série
    const answer = (stateInput, correct, dayKey) => {
        const day = forDay(parse(stateInput), dayKey);
        const earned = correct ? XP_CORRECT : XP_TRY;
        const paid = Math.min(earned, Math.max(0, DAILY_XP_CAP - day.xp));
        const streak = correct ? day.streak + 1 : 0;
        const record = correct && day.past > 0 && streak === day.past + 1;
        const parts = paid > 0 ? [{ label: correct ? 'za správnou odpověď' : 'za pokus', xp: paid }] : [];
        const note = paid < earned ? `Dnešní strop ${DAILY_XP_CAP} XP za jednohubky je ${paid > 0 ? 'naplněný' : 'vyčerpaný – série se počítá dál'}.` : '';
        const state = {
            ...day, xp: day.xp + paid, played: day.played + 1, correct: day.correct + (correct ? 1 : 0),
            streak, best: Math.max(day.best, streak), past: correct ? day.past : Math.max(day.past, day.streak)
        };
        return { state, correct: Boolean(correct), streak, ended: correct ? 0 : day.streak, record, best: state.best, xp: { total: paid, parts, note } };
    };

    // --- Texty ---
    const streakLabel = (n) => plural(n, ['správná v řadě', 'správné v řadě', 'správných v řadě']);
    // Krátký štítek série v řádku nahoře (číslo je vidět i na úzkém displeji)
    const streakChip = (n) => n > 0 ? `Série ${n}` : 'Nová série';
    // Vlídná věta pod výsledkem: chyba sérii jen ukončí, nic se nebere
    const verdictText = (outcome, answerLabel) => {
        if (outcome.correct) {
            if (outcome.record) return `Nejlepší série: ${outcome.streak}!`;
            return outcome.streak > 1 ? `${streakLabel(outcome.streak)}.` : 'Dobrý začátek série.';
        }
        const tail = outcome.ended > 1 ? ` Série ${outcome.ended} skončila, nejlepší zůstává ${outcome.best}.` : '';
        return `Správně je ${answerLabel}.${tail}`;
    };

    // --- Ovladač obrazovky (screen 'snack'); deps viz app.js oddíl „Jednohubka“ ---
    // phase: 'loading' | 'question' | 'answered' | 'error'
    const createController = (deps) => {
        const { appContent, escapeHtml } = deps;
        let game = null;
        const load = () => parse(deps.readJson(STORAGE_KEY));
        const live = (g) => Boolean(g) && g === game && deps.getScreen() === 'snack';
        // Další otázka se chystá, dokud hráč čte výsledek, ať Ještě jednu naskočí hned
        const queue = (g) => {
            const slot = { data: null, error: null };
            slot.promise = deps.prepare(g.seen).then(data => { slot.data = data; return data; }, error => { slot.error = error; throw error; });
            slot.promise.catch(() => {});
            return slot;
        };

        const chip = (cls = '') => `<span class="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-black text-brand-950 dark:bg-gold-500/20 dark:text-gold-200 ${cls}">`;
        // Řádek nahoře: před odpovědí nejlepší série a současná série, po odpovědi verdikt, XP a série (stejná výška, nic neposkočí)
        const statusRow = (g) => {
            const state = load();
            if (g.phase !== 'answered') {
                return `
                    <div data-snack-status class="flex min-h-[1.75rem] items-center gap-2">
                        <span class="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${escapeHtml(state.best > 0 ? `Nejlepší série ${state.best}` : 'Bez spěchu a bez nápověd')}</span>
                        ${chip()}<i data-lucide="zap" class="h-3.5 w-3.5"></i><span data-snack-streak>${escapeHtml(streakChip(state.streak))}</span></span>
                    </div>`;
            }
            const o = g.outcome;
            const xp = o.xp.total ? `${chip('bg-gold-500 dark:bg-gold-500 dark:text-brand-950')}<span data-snack-xp>+${o.xp.total} XP</span></span>` : '';
            return `
                <div data-snack-status class="flex min-h-[1.75rem] items-center gap-2">
                    <span data-snack-verdict="${o.correct ? 'correct' : 'wrong'}" class="flex min-w-0 flex-1 items-center gap-1.5 text-base font-black leading-tight ${o.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}"><i data-lucide="${o.correct ? 'circle-check' : 'circle-x'}" class="h-5 w-5 shrink-0"></i> ${o.correct ? 'Správně!' : 'Tentokrát ne'}</span>
                    ${xp}
                    ${chip(o.correct && o.streak > 1 ? 'mode-pop' : '')}<i data-lucide="zap" class="h-3.5 w-3.5"></i><span data-snack-streak>${escapeHtml(streakChip(o.streak))}</span></span>
                </div>`;
        };

        const renderQuestion = (g) => {
            const data = g.data;
            const topic = deps.topicOf(data.topic);
            const style = deps.styleOf(topic);
            const category = deps.categoryOf(topic, data.category);
            const answered = g.phase === 'answered';
            const BASE = 'btn-3d-light min-h-[3rem] rounded-xl px-3 py-1.5 text-sm font-bold leading-tight';
            const choiceClass = (choice, index) => !answered ? `${BASE} bg-white text-slate-700 dark:bg-slate-700 dark:text-slate-100`
                : choice.correct ? `${BASE} border-emerald-700 bg-emerald-600 text-white dark:border-emerald-900 dark:bg-emerald-700`
                : index === g.picked ? `${BASE} border-rose-800 bg-rose-600 text-white dark:border-rose-900 dark:bg-rose-700`
                : `${BASE} bg-white text-slate-700 opacity-50 dark:bg-slate-700 dark:text-slate-100`;
            const choices = data.question.choices.map((choice, index) => `
                <button type="button" data-action="snack-choice" data-index="${index}"${answered ? ' disabled' : ''} class="${choiceClass(choice, index)}">${escapeHtml(choice.label)}</button>`).join('');
            const o = g.outcome;
            const verdict = answered ? `<p data-snack-note class="-mt-1 text-center text-[13px] font-bold leading-snug text-slate-600 dark:text-slate-300">${escapeHtml(verdictText(o, data.question.answerLabel))}${o.xp.note ? ` <span class="font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(o.xp.note)}</span>` : ''}</p>` : '';
            const bottom = answered ? `
                <div class="flex items-stretch gap-2">
                    <button type="button" data-action="snack-done" class="btn-3d-light flex min-h-[3rem] w-[6.5rem] shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"><i data-lucide="check" class="h-4 w-4 shrink-0"></i> Hotovo</button>
                    <button type="button" data-action="snack-again" data-autofocus class="btn-3d flex min-h-[3.5rem] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-lg font-black text-white shadow-lg ${style.button}">Ještě jednu <i data-lucide="arrow-right" class="h-5 w-5 shrink-0"></i></button>
                </div>` : '';
            appContent.innerHTML = `
                <div id="snack-screen" data-snack-phase="${g.phase}" data-snack-count="${g.count}" class="flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 pb-2 dark:bg-slate-900">
                    ${statusRow(g)}
                    <div class="flex flex-col items-center gap-1 text-center">
                        <span class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm ${style.solid}"><i data-lucide="${category.icon}" class="h-3 w-3"></i> ${escapeHtml(data.typeLabel)}</span>
                        <h2 class="text-[22px] font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(data.question.title)}</h2>
                    </div>
                    ${answered ? deps.answerPanel(data) : deps.questionPanel(data)}
                    <section class="${deps.CARD} p-3"><div class="grid grid-cols-2 gap-2">${choices}</div></section>
                    ${verdict}
                    <p class="sr-only" role="status">${answered ? escapeHtml(`${o.correct ? 'Správně!' : 'Tentokrát ne.'} ${verdictText(o, data.question.answerLabel)}`) : ''}</p>
                    ${bottom}
                </div>`;
            deps.renderIcons(appContent);
            deps.mountPanels();
            if (!answered) appContent.scrollTo(0, 0);
            else {
                const again = appContent.querySelector('[data-action="snack-again"]');
                if (again) again.focus({ preventScroll: true });
            }
        };
        const renderLoading = () => {
            appContent.innerHTML = `
                <div id="snack-screen" data-snack-phase="loading" class="flex min-h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center dark:bg-slate-900">
                    ${deps.loadingArt}
                    <p class="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Chystám jednohubku…</p>
                </div>`;
            deps.renderIcons(appContent);
        };
        const renderError = (g) => {
            const offline = deps.offline(g.error);
            appContent.innerHTML = `
                <div id="snack-screen" data-snack-phase="error" class="fade-in flex min-h-full flex-col items-center justify-center gap-2 bg-slate-50 p-8 text-center dark:bg-slate-900">
                    <i data-lucide="${offline ? 'wifi-off' : 'search-x'}" class="mb-2 h-14 w-14 text-slate-300 dark:text-slate-600"></i>
                    <h2 class="text-xl font-bold text-slate-700 dark:text-slate-200">${offline ? 'Chyba spojení' : 'Něco se pokazilo'}</h2>
                    <p class="mb-4 text-slate-500 dark:text-slate-400">${offline ? 'Otázku se nepodařilo načíst. Zkontroluj připojení k internetu a zkus to znovu.' : 'Otázku se nepodařilo připravit. Zkus to prosím znovu.'}</p>
                    <button type="button" data-action="snack-retry" class="rounded-2xl bg-brand-700 px-6 py-3 font-bold text-white shadow-lg active:scale-95">Zkusit znovu</button>
                    <button type="button" data-action="snack-done" class="${deps.BACK_LINK}"><i data-lucide="check" class="h-4 w-4"></i> Hotovo</button>
                </div>`;
            deps.renderIcons(appContent);
        };
        const render = () => {
            const g = game;
            if (!g) return;
            deps.setScreen('snack');
            if (g.phase === 'loading') renderLoading();
            else if (g.phase === 'error') renderError(g);
            else renderQuestion(g);
            deps.updateControlsUI();
        };

        // Další otázka: z fronty, jinak se počká na přípravu (načítání); hned se začne chystat ta další
        const showNext = async (g) => {
            if (!live(g)) return;
            const slot = g.next || queue(g);
            g.next = null;
            if (!slot.data) {
                g.phase = 'loading';
                render();
                try { await slot.promise; } catch (error) {
                    if (!live(g)) return;
                    g.phase = 'error';
                    g.error = error;
                    render();
                    return;
                }
                if (!live(g)) return;
            }
            g.data = slot.data;
            g.phase = 'question';
            g.picked = null;
            g.outcome = null;
            g.count += 1;
            deps.enter(slot.data);
            render();
            g.next = queue(g);
        };

        // Vstup odkudkoli (čip na záložce Hrát): zapamatuje si, kde hráč byl (záložka, posun, rozehraná otázka tréninku), a ukáže otázku
        const open = () => {
            if (deps.isLoading() || live(game)) return;
            deps.closeOverlays();
            if (deps.sound) deps.sound.unlock();
            deps.touch();
            game = { phase: 'loading', seen: new Set(), next: null, data: null, picked: null, outcome: null, count: 0, answeredAt: 0, back: deps.snapshot(), scroll: appContent.scrollTop };
            deps.setScreen('snack');
            showNext(game);
        };
        const choose = (index) => {
            const g = game;
            if (!live(g) || g.phase !== 'question' || !g.data) return;
            const choice = g.data.question.choices[index];
            if (!choice) return;
            const correct = Boolean(choice.correct);
            const outcome = answer(load(), correct, deps.dayKey());
            deps.writeJson(STORAGE_KEY, outcome.state);
            g.picked = index;
            g.phase = 'answered';
            g.answeredAt = Date.now();
            deps.answered(g.data, choice, correct);
            const award = deps.awardXp(outcome.xp);
            g.outcome = { ...outcome, xp: { ...outcome.xp, badges: award && award.badges ? award.badges : [] } };
            if (deps.sound) deps.sound.answer(correct);
            render();
        };
        const again = () => {
            const g = game;
            if (!live(g) || (g.phase !== 'answered' && g.phase !== 'error') || Date.now() - g.answeredAt < DOUBLE_TAP_MS) return;
            showNext(g);
        };
        // Hotovo (i šipka zpět a Zpět v prohlížeči): zpět přesně tam, odkud hráč přišel; nic se neptá, odpověď je už zapsaná
        const leave = () => {
            const g = game;
            game = null;
            if (!g) { deps.renderHome(); return; }
            deps.restore(g.back);
            deps.renderHome();
            if (g.scroll) appContent.scrollTop = g.scroll;
        };
        const retry = () => {
            const g = game;
            if (!live(g) || g.phase !== 'error') return;
            g.next = null;
            showNext(g);
        };

        return {
            open, leave, render,
            // Štítek v hlavičce: Jednohubka a téma otázky (barva tématu)
            place: () => {
                const topic = game && game.data && game.phase !== 'loading' ? deps.topicOf(game.data.topic) : null;
                return { icon: ICON, text: topic ? `${TITLE} · ${topic.title}` : TITLE, topic, topicArt: Boolean(topic) };
            },
            // Oslavy (nová úroveň, odznak) až po odpovědi, ne přes otázku
            calm: () => !game || game.phase !== 'question',
            playing: () => live(game),
            actions: {
                'snack-open': () => open(),
                'snack-choice': (button) => choose(Number(button.dataset.index)),
                'snack-again': () => again(),
                'snack-done': () => leave(),
                'snack-retry': () => retry()
            }
        };
    };

    return {
        STORAGE_KEY, TITLE, ICON, XP_CORRECT, XP_TRY, DAILY_XP_CAP, DOUBLE_TAP_MS, EMPTY,
        plural, parse, forDay, xpLeftToday, answer, streakLabel, streakChip, verdictText, createController
    };
});
