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
    // action: kam tlačítko „Zkusit“ zavede (settings, learn, progress, multi, single, quiz = Kvíz dne, modes = okno Co hrát
    // s Bleskovkou a Přežitím, goals = cíle týdne a truhla)
    const TIPS = [
        { id: 'napoveda', icon: 'lightbulb', after: 2, title: 'Nevíš si rady?', text: 'Klepni na žlutou Nápovědu. Každá ti sice ubere bod, ale často stačí, aby ses dostal k odpovědi. Čím méně nápověd, tím víc bodů.',
            used: (u) => num(u.counters.noHint) >= 15 },
        { id: 'dnesni', icon: 'calendar-days', after: 0, title: 'Dnešní otázky', text: 'Každý den na tebe čeká jedna otázka z každého tématu. Za sérii dní v řadě dostaneš bonus XP a odznaky.',
            used: (u) => num(u.counters.bestStreak) >= 3 },
        { id: 'vyzva', icon: 'swords', multi: true, after: 8, title: 'Vyzvi kamaráda', text: 'Ve Více hráčích vyber Vyzvat: oba dostanete stejných 10 otázek a uvidíte, kdo je lepší.',
            guestText: 'Po přihlášení přes Google můžeš vyzvat kamaráda: oba dostanete stejných 10 otázek a uvidíte, kdo je lepší.',
            action: { kind: 'multi', label: 'Zkusit' }, used: (u) => num(u.counters.created) + num(u.counters.challenges) > 0 },
        { id: 'kviz-dne', icon: 'timer', after: 4, title: 'Kvíz dne', text: 'Každý den čeká 10 stejných otázek z různých témat pro všechny hráče. Máš jen jeden pokus, počítají se body i čas a uvidíš, kolikátý jsi dnes byl.',
            guestText: 'Každý den čeká 10 stejných otázek z různých témat pro všechny hráče. Máš jen jeden pokus. Po přihlášení uvidíš i své pořadí dne a mezi přáteli.',
            action: { kind: 'quiz', label: 'Zahrát Kvíz dne' }, ready: (u) => u.quiz, used: (u) => num(u.counters.quizDone) > 0 },
        { id: 'psani', icon: 'keyboard', after: 12, title: 'Těžší varianta', text: 'V Nastavení můžeš zapnout Psaní odpovědí. Body se zdvojnásobí a na diakritice ani drobném překlepu nezáleží.',
            action: { kind: 'settings', label: 'Otevřít Nastavení' }, used: (u) => num(u.counters.typedCorrect) > 0 },
        { id: 'uceni', icon: 'graduation-cap', after: 6, title: 'Učení', text: 'V Učení si projdeš celé okruhy a uvidíš, co už znáš. Dobré na přípravu před výzvou.',
            action: { kind: 'learn', label: 'Do Učení' }, used: (u) => Boolean(u.visited.learn) },
        { id: 'rezimy', icon: 'zap', after: 10, title: 'Bleskovka a Přežití', text: 'Klepni na dlaždici tématu nebo na Mix (ve hře na štítek tématu nahoře). V okně Co hrát najdeš vedle Hrát i Bleskovku (60 sekund) a Přežití (3 životy). Rekordy se ti pamatují.',
            action: { kind: 'modes', label: 'Vybrat hru' }, ready: (u) => u.modes, used: (u) => num(u.counters.blitzGames) + num(u.counters.survivalGames) > 0 },
        { id: 'turnaj', icon: 'trophy', multi: true, account: true, after: 14, title: 'Týdenní turnaj', text: 'Každý týden se hraje turnaj: každý den jedno kolo s 10 otázkami, vítěz postupuje. Přihlásit se můžeš ve Více hráčích.',
            action: { kind: 'multi', label: 'Zobrazit' }, used: (u) => num(u.counters.tourPlayed) > 0 },
        { id: 'procvic', icon: 'repeat', after: 14, title: 'Procvičování špatných odpovědí', text: 'Co spleteš, se ti vrátí k procvičení za den, za tři a za týden. Najdeš to v Učení. Kdybys to nechtěl, jde to vypnout v Nastavení.',
            action: { kind: 'learn', label: 'Do Učení' }, ready: (u) => u.reviewOn, used: (u) => num(u.counters.reviewed) > 0 || !u.reviewOn },
        { id: 'nahodny', icon: 'shuffle', multi: true, account: true, after: 20, title: 'Nemáš s kým hrát?', text: 'Ve Více hráčích zkus Náhodného soupeře: najde ti hráče a hra začne hned.',
            action: { kind: 'multi', label: 'Zkusit' }, used: (u) => num(u.counters.challenges) >= 3 },
        { id: 'ciselne', icon: 'list-ordered', after: 16, title: 'Seřaď a Odhadni', text: 'Občas přijde otázka Seřaď (klepáním urči pořadí 1 až 4) nebo Odhadni číslo. Body jsou za přesnost: celé pořadí 4 body, jedna prohozená dvojice 2; u odhadu do 5 % plné body, čím dál od pravdy, tím méně.',
            ready: (u) => num(u.counters.orderAnswered) + num(u.counters.estimateAnswered) > 0, used: (u) => num(u.counters.orderAnswered) + num(u.counters.estimateAnswered) >= 6 },
        { id: 'mapa', icon: 'crosshair', after: 18, title: 'Ukaž na mapě', text: 'Klepni na slepou mapu, kde místo leží. Tip můžeš posunout a mapu přiblížit. Body podle vzdálenosti: blízko plné body, dál jich ubývá; aspoň bod znamená správně.',
            ready: (u) => num(u.counters.mapAnswered) > 0, used: (u) => num(u.counters.mapAnswered) >= 5 },
        { id: 'hvezdy', icon: 'star', after: 22, title: 'Mistrovství témat', text: 'Za každé téma sbíráš hvězdičky podle toho, kolik položek jsi poznal. V Mém postupu klepni na téma a uvidíš, co ti chybí a co za to dostaneš.',
            action: { kind: 'progress', label: 'Můj postup' }, used: (u) => Boolean(u.visited.progress) },
        { id: 'reakce', icon: 'sparkles', multi: true, account: true, after: 24, title: 'Reakce po zápase', text: 'Po dohrané výzvě nebo zápase turnaje můžeš soupeři poslat reakci: 👍 🔥 😅 🤝.',
            ready: (u) => num(u.counters.challenges) >= 1, used: (u) => num(u.counters.challenges) >= 6 },
        { id: 'kviz-poradi', icon: 'trophy', account: true, after: 26, title: 'Pořadí Kvízu dne', text: 'Ve výsledku Kvízu dne přepínáš mezi pořadím všech hráčů a přátel. Rozhodují body a při shodě rychlejší čas. Pořadí se dá prohlédnout i za předchozí dny.',
            ready: (u) => u.quiz && num(u.counters.quizDone) >= 1, used: (u) => num(u.counters.quizDone) >= 8 },
        { id: 'ostatni', icon: 'users', account: true, after: 30, title: 'Jak odpověděli ostatní', text: 'Po odpovědi ti pod verdiktem ukážu, kolik procent hráčů otázku uhodlo. Tvoje odpovědi se do souhrnu přidávají bez jména a pomáhají vybírat otázky přiměřené obtížnosti.',
            used: (u) => num(u.counters.answered) >= 600 },
        { id: 'sova', icon: 'sparkles', after: 28, title: 'Obleč si Mudrlanta', text: 'Za úrovně a odznaky odemykáš doplňky a taláry pro Mudrlanta a postavičky a rámečky pro svůj profil. Mudrlanta oblékáš v Nastavení na kartě Mudrlant.',
            action: { kind: 'settings', tab: 'owl', label: 'Obléct Mudrlanta' }, used: (u) => Boolean(u.visited.look) },
        { id: 'pratele', icon: 'users', multi: true, account: true, after: 30, title: 'Přátelé', text: 'V profilu hráče si ho můžeš přidat mezi přátele. Uvidíš, kdy hrál, a snadno ho vyzveš.',
            action: { kind: 'multi', label: 'Zobrazit' }, ready: (u) => num(u.counters.challenges) >= 2, used: (u) => num(u.friends) > 0 },
        { id: 'ligy', icon: 'medal', multi: true, account: true, after: 36, title: 'Ligy', text: 'Za výhry ve výzvách ti roste rating a postupuješ v ligách od Bronzu výš. Týdenní žebříček ukazuje nejlepší hráče.',
            action: { kind: 'multi', label: 'Zobrazit' }, ready: (u) => num(u.counters.challenges) >= 3, used: (u) => num(u.counters.wins) >= 8 },
        { id: 'obrazek', icon: 'share-2', after: 34, title: 'Sdílej obrázek', text: 'Výsledek Kvízu dne, dnešní otázky, Bleskovky, Přežití i vyhrané výzvy můžeš sdílet jako obrázek s Mudrlantem v tvém taláru. Klepni na Sdílet obrázek.',
            ready: (u) => num(u.counters.quizDone) + num(u.counters.blitzGames) + num(u.counters.survivalGames) + num(u.counters.dailyCorrect) > 0, used: (u) => num(u.counters.sharedImages) > 0 },
        { id: 'ochrana', icon: 'shield-check', after: 38, title: 'Ochrana série', text: 'Když jeden den vynecháš, ochrana série se použije sama a série dnešních otázek i Kvízu dne ti zůstanou. Mít můžeš dvě. Získáš je z Truhly Mudrlanta a za 7 dní v řadě.',
            ready: (u) => num(u.counters.bestStreak) >= 2 || num(u.counters.quizBestStreak) >= 2 || num(u.freezes) > 0, used: (u) => num(u.counters.freezesUsed) > 0 },
        { id: 'cile', icon: 'target', after: 45, title: 'Týdenní cíle', text: 'Na úvodu máš každý týden tři nové cíle. Splníš-li všechny, čeká tě bonus XP, odznak a Truhla Mudrlanta s novou věcí pro Mudrlanta.',
            action: { kind: 'goals', label: 'Ukázat cíle' }, used: (u) => num(u.counters.weeksDone) > 0 },
        { id: 'truhla', icon: 'sparkles', after: 60, title: 'Truhla Mudrlanta', text: 'Za všechny tři cíle týdne dostaneš truhlu. Vždy v ní je něco, co ještě nemáš: doplněk, barva, rámeček, talár nebo barevné téma, které by se ti jinak odemklo až později. Často i ochrana série.',
            action: { kind: 'goals', label: 'Ukázat cíle' }, ready: (u) => u.goals, used: (u) => num(u.counters.chestsOpened) > 0 },
        { id: 'diplomy', icon: 'award', after: 50, title: 'Diplomy', text: 'Za plné mistrovství tématu (5 hvězdiček) dostaneš diplom s Mudrlantem a svým jménem. Najdeš ho v Mém postupu v části Diplomy a můžeš ho sdílet nebo stáhnout.',
            action: { kind: 'progress', label: 'Můj postup' }, ready: (u) => num(u.maxStars) >= 3, used: (u) => Boolean(u.visited.diplomas) },
        // art = obrázek místo sovy s žárovkou (icons/topics/<art>.webp, docs/OBRAZKY.md č. 133, 148, 150)
        { id: 'sezona', icon: 'sparkles', art: 'sezona', after: 30, title: 'Sezóna Mudrlanta', text: 'Každý měsíc běží Sezóna Mudrlanta: XP z hraní tě posouvají po cestě 20 stupňů a na každém čeká odměna. V půli cesty čeká rámeček měsíce, na konci Sezónní truhla s druhým, zdobnějším rámečkem, doplňkem a postavičkou. Ty jdou získat jen v tom měsíci.',
            action: { kind: 'progress', label: 'Můj postup' }, ready: (u) => u.season, used: (u) => Boolean(u.visited.season) },
        { id: 'album', icon: 'book-open', art: 'album', after: 70, title: 'Album sbírky', text: 'V Mém postupu najdeš Album sbírky se vším, co jde pro Mudrlanta a tvůj profil získat. Uvidíš, co ti ještě chybí, a za milníky sbírky dostaneš odznaky Sběratel.',
            action: { kind: 'progress', label: 'Můj postup' }, ready: (u) => u.album, used: (u) => Boolean(u.visited.album) },
        { id: 'kronika', icon: 'book-open', after: 40, title: 'Mudrlantova kronika', text: 'Každou neděli večer ti Mudrlant shrne týden: kolik otázek padlo, téma a titul týdne i nové objevy. Kroniku najdeš i v Mém postupu a můžeš ji sdílet jako obrázek.',
            action: { kind: 'chronicle', label: 'Otevřít kroniku' }, ready: (u) => u.chronicle && num(u.counters.days) >= 2, used: (u) => Boolean(u.visited.chronicle) },
        { id: 'vitrina', icon: 'gem', art: 'vitrina', multi: true, account: true, after: 80, title: 'Vitrína v profilu', text: 'V Nastavení → Profil si vyber až 3 trofeje, které ostatní uvidí ve tvém profilu: odznak, diplom nebo výsledek ligové sezóny.',
            action: { kind: 'settings', label: 'Nastavení', tab: 'profile' }, ready: (u) => u.showcase, used: (u) => Boolean(u.visited.showcase) }
    ];
    const BY_ID = new Map(TIPS.map(tip => [tip.id, tip]));

    const EMPTY = { seen: [], day: '', n: 0, lastAt: 0, off: false, visited: {} };
    // Navštívené části hry (tip o nich už není potřeba): Učení, Můj postup, Vzhled, Diplomy, Sezóna, Album, Vitrína, Kronika týdne
    const VISITED = ['learn', 'progress', 'look', 'diplomas', 'season', 'album', 'showcase', 'chronicle'];
    const parse = (value) => {
        const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const visited = {};
        for (const key of VISITED) if (v.visited && v.visited[key] === true) visited[key] = true;
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

    // ctx = { counters, today, now, launches, signedIn, multiAvailable, reviewOn, friends, quiz, modes, goals (části hry, které aplikace má),
    // freezes (počet ochran série), maxStars (nejvíc hvězd mistrovství v některém tématu) }
    // Vrátí další tip, který se má nabídnout, nebo null
    const pick = (stateInput, ctx) => {
        const state = parse(stateInput);
        if (state.off) return null;
        const today = ctx.today;
        if (!allowedToday(state, today, num(ctx.launches))) return null;
        if (ctx.now - state.lastAt < MIN_GAP_MS) return null;
        const u = { counters: ctx.counters || {}, visited: state.visited, reviewOn: ctx.reviewOn !== false, friends: ctx.friends, signedIn: Boolean(ctx.signedIn),
            quiz: ctx.quiz !== false, modes: ctx.modes !== false, goals: ctx.goals !== false, freezes: ctx.freezes, maxStars: ctx.maxStars,
            season: ctx.season !== false, album: ctx.album !== false, showcase: ctx.showcase !== false, chronicle: ctx.chronicle !== false };
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
        return VISITED.includes(feature) && !state.visited[feature] ? { ...state, visited: { ...state.visited, [feature]: true } } : state;
    };
    const setOff = (stateInput, off) => ({ ...parse(stateInput), off: Boolean(off) });
    const reset = (stateInput) => ({ ...EMPTY, off: parse(stateInput).off, visited: parse(stateInput).visited });

    return { TIPS, BY_ID, EMPTY, MIN_GAP_MS, parse, dailyBudget, allowedToday, pick, textFor, markShown, touch, setOff, reset };
});
