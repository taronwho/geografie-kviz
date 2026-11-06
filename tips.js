// Tipy od Mudrlanta (žárovka u sovy): čistá logika bez DOMu. Tip vysvětluje jednu funkci hry (jeden hráč i více hráčů).
// Chytré nastavení: na začátku hraní se tipy ukazují častěji (třikrát denně), pak čím dál méně; tip, který hráč už nepotřebuje
// (funkci používá), se nenabídne; každý tip se ukáže jen jednou a mezi tipy je odstup. Hráč je může v Nastavení vypnout.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantTips = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const MIN_GAP_MS = 20 * 60 * 1000;
    const num = (value) => Number.isFinite(value) ? value : 0;

    // after = kolik odpovědí má hráč mít za sebou, než se tip nabídne; ready = podmínka, aby tip dával smysl;
    // used = hráč funkci už zná (tip se neukáže); multi = tip o hře více hráčů; account = vyžaduje přihlášení
    // action: kam tlačítko „Zkusit“ zavede (settings, learn, progress, multi, single)
    const TIPS = [
        { id: 'napoveda', icon: 'lightbulb', after: 2, title: 'Nevíš si rady?', text: 'Klepni na žlutou Nápovědu. Každá ti sice ubere bod, ale často stačí, aby ses dostal k odpovědi. Čím méně nápověd, tím víc bodů.',
            used: (u) => num(u.counters.noHint) >= 15 },
        { id: 'dnesni', icon: 'calendar-days', after: 0, title: 'Dnešní otázky', text: 'Každý den na tebe čeká jedna otázka z každého tématu. Za sérii dní v řadě dostaneš bonus XP a odznaky.',
            action: { kind: 'single', label: 'Na úvod' }, used: (u) => num(u.counters.bestStreak) >= 3 },
        { id: 'vyzva', icon: 'swords', multi: true, after: 8, title: 'Vyzvi kamaráda', text: 'Ve Více hráčích vyber Vyzvat: oba dostanete stejných 10 otázek a uvidíte, kdo je lepší.',
            guestText: 'Po přihlášení přes Google můžeš vyzvat kamaráda: oba dostanete stejných 10 otázek a uvidíte, kdo je lepší.',
            action: { kind: 'multi', label: 'Zkusit' }, used: (u) => num(u.counters.created) + num(u.counters.challenges) > 0 },
        { id: 'psani', icon: 'keyboard', after: 12, title: 'Těžší varianta', text: 'V Nastavení můžeš zapnout Psaní odpovědí. Body se zdvojnásobí a na diakritice ani drobném překlepu nezáleží.',
            action: { kind: 'settings', label: 'Otevřít Nastavení' }, used: (u) => num(u.counters.typedCorrect) > 0 },
        { id: 'uceni', icon: 'graduation-cap', after: 6, title: 'Učení', text: 'V Učení si projdeš celé okruhy a uvidíš, co už znáš. Dobré na přípravu před výzvou.',
            action: { kind: 'learn', label: 'Do Učení' }, used: (u) => Boolean(u.visited.learn) },
        { id: 'turnaj', icon: 'trophy', multi: true, account: true, after: 14, title: 'Týdenní turnaj', text: 'Každý týden se hraje turnaj: každý den jedno kolo s 10 otázkami, vítěz postupuje. Přihlásit se můžeš ve Více hráčích.',
            action: { kind: 'multi', label: 'Zobrazit' }, used: (u) => num(u.counters.tourPlayed) > 0 },
        { id: 'procvic', icon: 'repeat', after: 14, title: 'Procvičování špatných odpovědí', text: 'Co spleteš, se ti vrátí k procvičení za den, za tři a za týden. Najdeš to v Učení. Kdybys to nechtěl, jde to vypnout v Nastavení.',
            action: { kind: 'learn', label: 'Do Učení' }, ready: (u) => u.reviewOn, used: (u) => num(u.counters.reviewed) > 0 || !u.reviewOn },
        { id: 'nahodny', icon: 'shuffle', multi: true, account: true, after: 20, title: 'Nemáš s kým hrát?', text: 'Ve Více hráčích zkus Náhodného soupeře: najde ti hráče a hra začne hned.',
            action: { kind: 'multi', label: 'Zkusit' }, used: (u) => num(u.counters.challenges) >= 3 },
        { id: 'hvezdy', icon: 'star', after: 22, title: 'Mistrovství témat', text: 'Za každé téma sbíráš hvězdičky podle toho, kolik položek jsi poznal. V Mém postupu klepni na téma a uvidíš, co ti chybí a co za to dostaneš.',
            action: { kind: 'progress', label: 'Můj postup' }, used: (u) => Boolean(u.visited.progress) },
        { id: 'reakce', icon: 'sparkles', multi: true, account: true, after: 24, title: 'Reakce po zápase', text: 'Po dohrané výzvě nebo zápase turnaje můžeš soupeři poslat reakci: 👍 🔥 😅 🤝.',
            ready: (u) => num(u.counters.challenges) >= 1, used: (u) => num(u.counters.challenges) >= 6 },
        { id: 'sova', icon: 'sparkles', after: 28, title: 'Obleč si Mudrlanta', text: 'Za úrovně a odznaky odemykáš doplňky, rámečky a barvy. Vybereš je v Nastavení na kartě Mudrlant.',
            action: { kind: 'settings', label: 'Otevřít Nastavení' }, used: (u) => Boolean(u.visited.look) },
        { id: 'pratele', icon: 'users', multi: true, account: true, after: 30, title: 'Přátelé', text: 'V profilu hráče si ho můžeš přidat mezi přátele. Uvidíš, kdy hrál, a snadno ho vyzveš.',
            action: { kind: 'multi', label: 'Zobrazit' }, ready: (u) => num(u.counters.challenges) >= 2, used: (u) => num(u.friends) > 0 },
        { id: 'ligy', icon: 'medal', multi: true, account: true, after: 36, title: 'Ligy', text: 'Za výhry ve výzvách ti roste rating a postupuješ v ligách od Bronzu výš. Týdenní žebříček ukazuje nejlepší hráče.',
            action: { kind: 'multi', label: 'Zobrazit' }, ready: (u) => num(u.counters.challenges) >= 3, used: (u) => num(u.counters.wins) >= 8 },
        { id: 'cile', icon: 'target', after: 45, title: 'Týdenní cíle', text: 'Na úvodu máš každý týden tři nové cíle. Splníš-li všechny, čeká tě bonus XP a odznak.',
            action: { kind: 'single', label: 'Na úvod' }, used: (u) => num(u.counters.weeksDone) > 0 }
    ];
    const BY_ID = new Map(TIPS.map(tip => [tip.id, tip]));

    const EMPTY = { seen: [], day: '', n: 0, lastAt: 0, off: false, visited: {} };
    const parse = (value) => {
        const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const visited = {};
        for (const key of ['learn', 'progress', 'look']) if (v.visited && v.visited[key] === true) visited[key] = true;
        return {
            seen: Array.isArray(v.seen) ? [...new Set(v.seen.filter(id => typeof id === 'string' && BY_ID.has(id)))] : [],
            day: typeof v.day === 'string' ? v.day.slice(0, 10) : '', n: Math.max(0, Math.floor(num(v.n))), lastAt: Math.max(0, num(v.lastAt)),
            off: v.off === true, visited
        };
    };

    // Kolik tipů za den: na začátku hraní tři, pak dva, pak jeden; dlouholetí hráči jen občas (viz allowedToday)
    const dailyBudget = (launches) => launches <= 8 ? 3 : launches <= 30 ? 2 : 1;
    const dayNumber = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN; };
    // Po 60 spuštěních jen jeden tip za tři dny (kdo hraje dlouho, tipy ho nerozptylují)
    const allowedToday = (state, today, launches) => {
        const shown = state.day === today ? state.n : 0;
        if (shown >= dailyBudget(launches)) return false;
        if (launches > 60 && state.day !== today && Number.isFinite(dayNumber(state.day)) && dayNumber(today) - dayNumber(state.day) < 3) return false;
        return true;
    };

    // ctx = { counters, today, now, launches, signedIn, multiAvailable, reviewOn, friends }
    // Vrátí další tip, který se má nabídnout, nebo null
    const pick = (stateInput, ctx) => {
        const state = parse(stateInput);
        if (state.off) return null;
        const today = ctx.today;
        if (!allowedToday(state, today, num(ctx.launches))) return null;
        if (ctx.now - state.lastAt < MIN_GAP_MS) return null;
        const u = { counters: ctx.counters || {}, visited: state.visited, reviewOn: ctx.reviewOn !== false, friends: ctx.friends, signedIn: Boolean(ctx.signedIn) };
        const answered = num(u.counters.answered);
        return TIPS.find(tip => {
            if (state.seen.includes(tip.id)) return false;
            if (tip.multi && !ctx.multiAvailable) return false;
            if (tip.account && !u.signedIn) return false;
            if (answered < tip.after) return false;
            if (tip.ready && !tip.ready(u)) return false;
            return !tip.used(u);
        }) || null;
    };
    const textFor = (tip, signedIn) => (!signedIn && tip.guestText) || tip.text;
    // Tip se ukázal: zapíše se jako přečtený a započítá do dne
    const markShown = (stateInput, id, today, now) => {
        const state = parse(stateInput);
        return { ...state, seen: state.seen.includes(id) ? state.seen : [...state.seen, id], day: today, n: (state.day === today ? state.n : 0) + 1, lastAt: now };
    };
    const touch = (stateInput, feature) => {
        const state = parse(stateInput);
        return ['learn', 'progress', 'look'].includes(feature) && !state.visited[feature] ? { ...state, visited: { ...state.visited, [feature]: true } } : state;
    };
    const setOff = (stateInput, off) => ({ ...parse(stateInput), off: Boolean(off) });
    const reset = (stateInput) => ({ ...EMPTY, off: parse(stateInput).off, visited: parse(stateInput).visited });

    return { TIPS, BY_ID, EMPTY, MIN_GAP_MS, parse, dailyBudget, allowedToday, pick, textFor, markShown, touch, setOff, reset };
});
