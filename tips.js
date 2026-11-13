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
    // action: kam tlačítko „Zkusit“ zavede (settings, learn, progress, multi, single, quiz = Kvíz dne, mystery = Tajemná otázka dne, modes = okno Co hrát
    // s Bleskovkou a Přežitím, goals = cíle týdne a truhla, gold = okno Zlatá otázka, boss = Boss týdne, chain = Řetězovka dne)
    const TIPS = [
        { id: 'napoveda', icon: 'lightbulb', after: 2, title: 'Nevíš si rady?', text: 'Klepni na žluté tlačítko Nápověda. Každá nápověda sice sníží body za správnou odpověď, ale často tě k ní dovede. Čím méně nápověd použiješ, tím víc bodů získáš.',
            used: (u) => num(u.counters.noHint) >= 15 },
        { id: 'dnesni', icon: 'calendar-days', after: 0, title: 'Dnešní otázky', text: 'Každý den máš z každého tématu jednu dnešní otázku. Když je hraješ několik dní po sobě, roste ti série a za ni dostáváš bonusové XP.',
            used: (u) => num(u.counters.bestStreak) >= 3 },
        { id: 'vyzva', icon: 'swords', multi: true, after: 8, title: 'Vyzvi kamaráda', text: 'Na záložce Více hráčů klepni na Vyzvat. Ty i kamarád dostanete stejných 10 otázek a uvidíte, kdo z vás je lepší.',
            guestText: 'Po přihlášení přes Google můžeš vyzvat kamaráda. Oba dostanete stejných 10 otázek a uvidíte, kdo z vás je lepší.',
            action: { kind: 'multi', label: 'Zkusit' }, used: (u) => num(u.counters.created) + num(u.counters.challenges) > 0 },
        { id: 'kviz-dne', icon: 'timer', after: 4, title: 'Kvíz dne', text: 'Každý den čeká 10 otázek z různých témat, stejných pro všechny hráče. Máš na ně jen jeden pokus. Počítají se body i čas a na konci uvidíš své pořadí.',
            guestText: 'Každý den čeká 10 otázek z různých témat, stejných pro všechny hráče. Máš na ně jen jeden pokus. Po přihlášení uvidíš i své pořadí mezi všemi hráči a mezi přáteli.',
            action: { kind: 'quiz', label: 'Zahrát Kvíz dne' }, ready: (u) => u.quiz, used: (u) => num(u.counters.quizDone) > 0 },
        { id: 'tajemna', icon: 'telescope', art: 'sova-dalekohled', after: 9, title: 'Tajemná otázka dne', text: 'Na úvodní obrazovce je každý den tajemná otázka, stejná pro všechny. Nápovědy přibývají během dne: ano/ne, vzdálenost od Prahy, doba, indicie, nakonec fotka. Máš 3 pokusy a čím dřív uhodneš, tím víc bodů. Druhý den uvidíš odpověď a kolik hráčů ji uhodlo.',
            action: { kind: 'mystery', label: 'Hádat' }, ready: (u) => u.mystery, used: (u) => num(u.counters.mysterySolved) > 0 },
        { id: 'psani', icon: 'keyboard', after: 12, title: 'Těžší varianta: psaní', text: 'V Nastavení na záložce Hra můžeš místo výběru z možností zvolit Psaní odpovědi. Za správnou odpověď pak dostaneš dvojnásobek bodů. Na diakritice, velkých písmenech ani drobném překlepu nezáleží.',
            action: { kind: 'settings', tab: 'game', label: 'Otevřít Nastavení' }, used: (u) => num(u.counters.typedCorrect) > 0 },
        { id: 'uceni', icon: 'graduation-cap', after: 6, title: 'Učení', text: 'V Učení si projdeš všechna témata a jejich okruhy a uvidíš, co už znáš a co ještě ne. Hodí se to i jako příprava na výzvu.',
            action: { kind: 'learn', label: 'Do Učení' }, used: (u) => Boolean(u.visited.learn) },
        { id: 'rezimy', icon: 'zap', after: 10, title: 'Bleskovka a Přežití', text: 'V Bleskovce máš 60 sekund na co nejvíc správných odpovědí. V Přežití máš 3 životy a každá chyba ti jeden vezme. Klepni na dlaždici tématu nebo na Mix: obě hry najdeš v okně, které se otevře, pod tlačítkem Hrát. Rekordy se ti ukládají.',
            action: { kind: 'modes', label: 'Vybrat hru' }, ready: (u) => u.modes, used: (u) => num(u.counters.blitzGames) + num(u.counters.survivalGames) > 0 },
        { id: 'turnaj', icon: 'trophy', multi: true, account: true, after: 14, title: 'Týdenní turnaj', text: 'Každý týden začíná turnaj. Každý den se hraje jedno kolo: 10 otázek proti jednomu soupeři a kdo vyhraje, postupuje do dalšího kola. Přihlásit se můžeš na záložce Více hráčů.',
            action: { kind: 'multi', label: 'Zobrazit' }, used: (u) => num(u.counters.tourPlayed) > 0 },
        { id: 'procvic', icon: 'repeat', after: 14, title: 'Procvičování chyb', text: 'Otázky, ve kterých chybuješ, se ti vrátí k procvičení po 1, 3, 7, 14 a 30 dnech. Najdeš je v Učení. Vypnout to můžeš v Nastavení na záložce Hra.',
            action: { kind: 'learn', label: 'Do Učení' }, ready: (u) => u.reviewOn, used: (u) => num(u.counters.reviewed) > 0 || !u.reviewOn },
        { id: 'nahodny', icon: 'shuffle', multi: true, account: true, after: 20, title: 'Nemáš s kým hrát?', text: 'Na záložce Více hráčů klepni na Náhodný soupeř. Najdu ti jiného hráče a hra začne hned.',
            action: { kind: 'multi', label: 'Zkusit' }, used: (u) => num(u.counters.challenges) >= 3 },
        { id: 'ciselne', icon: 'list-ordered', after: 16, title: 'Seřaď a Odhadni', text: 'Občas přijde otázka Seřaď nebo Odhadni. U Seřaď klepáním urči pořadí čtyř položek: za správné pořadí dostaneš 4 body, za jednu prohozenou sousední dvojici 2 body. U Odhadni napiš číslo: čím blíž správné hodnotě, tím víc bodů.',
            ready: (u) => num(u.counters.orderAnswered) + num(u.counters.estimateAnswered) > 0, used: (u) => num(u.counters.orderAnswered) + num(u.counters.estimateAnswered) >= 6 },
        { id: 'mapa', icon: 'crosshair', after: 18, title: 'Ukaž na mapě', text: 'Klepni do slepé mapy tam, kde podle tebe hledané místo leží. Značku pak můžeš posunout a mapu přiblížit. Čím blíž se trefíš, tím víc bodů. Když získáš aspoň 1 bod, počítá se odpověď jako správná.',
            ready: (u) => num(u.counters.mapAnswered) > 0, used: (u) => num(u.counters.mapAnswered) >= 5 },
        { id: 'hvezdy', icon: 'star', after: 22, title: 'Mistrovství témat', text: 'V každém tématu sbíráš hvězdičky podle toho, kolik různých položek už znáš. V Mém postupu klepni na téma a uvidíš, co ti k další hvězdičce chybí a co za ni dostaneš.',
            action: { kind: 'progress', label: 'Můj postup' }, used: (u) => Boolean(u.visited.progress) },
        { id: 'reakce', icon: 'sparkles', multi: true, account: true, after: 24, title: 'Reakce po zápase', text: 'Po dohrané výzvě nebo zápase v turnaji můžeš soupeři poslat reakci: 👍 🔥 😅 🤝.',
            ready: (u) => num(u.counters.challenges) >= 1, used: (u) => num(u.counters.challenges) >= 6 },
        { id: 'kviz-poradi', icon: 'trophy', account: true, after: 26, title: 'Pořadí Kvízu dne', text: 'Ve výsledku Kvízu dne si můžeš přepnout pořadí všech hráčů, nebo jen přátel. Rozhodují body, při shodě kratší čas. Prohlédnout si můžeš i pořadí z předchozích dnů.',
            ready: (u) => u.quiz && num(u.counters.quizDone) >= 1, used: (u) => num(u.counters.quizDone) >= 8 },
        { id: 'ostatni', icon: 'users', account: true, after: 30, title: 'Jak odpověděli ostatní', text: 'Po každé odpovědi uvidíš pod výsledkem, kolik procent hráčů na otázku odpovědělo správně. Tvoje odpovědi se do přehledu započítávají anonymně a pomáhají vybírat otázky přiměřené obtížnosti.',
            used: (u) => num(u.counters.answered) >= 600 },
        { id: 'sova', icon: 'sparkles', after: 28, title: 'Obleč si Mudrlanta', text: 'Za nové úrovně a odznaky získáváš doplňky a taláry pro Mudrlanta a také postavičky a rámečky pro svůj profil. Mudrlanta oblékneš v Nastavení na záložce Mudrlant.',
            action: { kind: 'settings', tab: 'owl', label: 'Obléct Mudrlanta' }, used: (u) => Boolean(u.visited.look) },
        { id: 'pratele', icon: 'users', multi: true, account: true, after: 30, title: 'Přátelé', text: 'Klepni na jméno hráče, třeba v žebříčku nebo u výzvy, a v profilu, který se otevře, zvol Přidat do přátel. Přátele pak snadno vyzveš a uvidíš, kdy naposledy hráli.',
            action: { kind: 'multi', label: 'Zobrazit' }, ready: (u) => num(u.counters.challenges) >= 2, used: (u) => num(u.friends) > 0 },
        { id: 'ligy', icon: 'medal', multi: true, account: true, after: 36, title: 'Ligy', text: 'Za výhry ve výzvách ti roste rating a podle něj postupuješ ligami od Bronzu až po Mistra. V týdenním žebříčku uvidíš nejlepší hráče týdne.',
            action: { kind: 'multi', label: 'Zobrazit' }, ready: (u) => num(u.counters.challenges) >= 3, used: (u) => num(u.counters.wins) >= 8 },
        { id: 'obrazek', icon: 'share-2', after: 34, title: 'Sdílej obrázek', text: 'Výsledek Kvízu dne, dnešních otázek, Bleskovky, Přežití i vyhrané výzvy můžeš sdílet jako obrázek s tvým Mudrlantem. Stačí u výsledku klepnout na Sdílet obrázek.',
            ready: (u) => num(u.counters.quizDone) + num(u.counters.blitzGames) + num(u.counters.survivalGames) + num(u.counters.dailyCorrect) > 0, used: (u) => num(u.counters.sharedImages) > 0 },
        { id: 'ochrana', icon: 'shield-check', after: 38, title: 'Ochrana série', text: 'Když jeden den nehraješ, ochrana série se použije sama a tvoje série dnešních otázek i Kvízu dne se nepřeruší. Najednou můžeš mít nejvýš dvě. Získáš je za 7 dní hraní v řadě a často i v Truhle Mudrlanta.',
            ready: (u) => num(u.counters.bestStreak) >= 2 || num(u.counters.quizBestStreak) >= 2 || num(u.freezes) > 0, used: (u) => num(u.counters.freezesUsed) > 0 },
        { id: 'cile', icon: 'target', after: 45, title: 'Týdenní cíle', text: 'Na úvodní obrazovce máš každý týden tři nové cíle. Když splníš všechny tři, dostaneš bonusové XP, odznak a Truhlu Mudrlanta s novou věcí pro Mudrlanta.',
            action: { kind: 'goals', label: 'Ukázat cíle' }, used: (u) => num(u.counters.weeksDone) > 0 },
        { id: 'truhla', icon: 'sparkles', after: 60, title: 'Truhla Mudrlanta', text: 'Truhlu dostaneš, když splníš všechny tři cíle týdne. Vždycky v ní najdeš něco, co ještě nemáš: doplněk, barvu, rámeček, talár nebo barevné téma aplikace, které by se ti jinak odemklo až později. Často v ní je i ochrana série.',
            action: { kind: 'goals', label: 'Ukázat cíle' }, ready: (u) => u.goals, used: (u) => num(u.counters.chestsOpened) > 0 },
        { id: 'diplomy', icon: 'award', after: 50, title: 'Diplomy', text: 'Když v tématu získáš všech 5 hvězdiček, dostaneš diplom s Mudrlantem a svým jménem. Najdeš ho v Mém postupu v části Diplomy a můžeš ho sdílet nebo stáhnout.',
            action: { kind: 'progress', label: 'Můj postup' }, ready: (u) => num(u.maxStars) >= 3, used: (u) => Boolean(u.visited.diplomas) },
        // art = obrázek místo sovy s žárovkou (icons/topics/<art>.webp, docs/OBRAZKY.md č. 133, 148, 150)
        { id: 'sezona', icon: 'sparkles', art: 'sezona', after: 30, title: 'Sezóna Mudrlanta', text: 'Každý měsíc běží nová Sezóna Mudrlanta. Za XP z hraní postupuješ po 20 stupních a na každém dostaneš odměnu. Na 10. stupni čeká rámeček měsíce, na 20. Sezónní truhla s rámečkem, doplňkem, postavičkou a titulem. Získat je jde jen v daném měsíci.',
            action: { kind: 'progress', label: 'Můj postup' }, ready: (u) => u.season, used: (u) => Boolean(u.visited.season) },
        { id: 'album', icon: 'book-open', art: 'album', after: 70, title: 'Album sbírky', text: 'V Mém postupu najdeš Album sbírky se vším, co můžeš pro Mudrlanta a svůj profil získat. Uvidíš, co ti ještě chybí, a za každý milník sbírky dostaneš odznak Sběratel.',
            action: { kind: 'progress', label: 'Můj postup' }, ready: (u) => u.album, used: (u) => Boolean(u.visited.album) },
        { id: 'kronika', icon: 'book-open', after: 40, title: 'Mudrlantova kronika', text: 'Každou neděli večer ti Mudrlant shrne uplynulý týden: kolik otázek máš za sebou, téma a titul týdne a tvoje nové objevy. Kroniku najdeš i v Mém postupu a můžeš ji sdílet jako obrázek.',
            action: { kind: 'chronicle', label: 'Otevřít kroniku' }, ready: (u) => u.chronicle && num(u.counters.days) >= 2, used: (u) => Boolean(u.visited.chronicle) },
        { id: 'ligove-sezony', icon: 'calendar-days', art: 'ligova-sezona', multi: true, account: true, after: 40, title: 'Ligové sezóny', text: 'Každý kalendářní měsíc je jedna ligová sezóna. Po jejím skončení dostaneš rámeček profilu podle nejvyšší ligy, které v ní dosáhneš, od Stříbra až po Mistra. Rámeček ti zůstane navždy. Výsledky sezón si můžeš vystavit ve vitríně.',
            action: { kind: 'leagueSeasons', label: 'Ligové sezóny' }, ready: (u) => u.leagueSeasons && num(u.counters.challenges) >= 2, used: (u) => Boolean(u.visited.leagueSeasons) },
        { id: 'legendy', icon: 'graduation-cap', after: 55, title: 'Legendární postavičky', text: 'Když získáš diplom z tématu (všech 5 hvězdiček), odemkne se ti legendární postavička pro profilový obrázek. Každé téma má vlastní. Najdeš je v Nastavení na záložce Profil, v části Profilový obrázek pod Legendy.',
            action: { kind: 'settings', tab: 'profile', label: 'Ukázat Legendy' }, ready: (u) => num(u.maxStars) >= 3, used: (u) => Boolean(u.visited.legends) },
        { id: 'sady', icon: 'sparkles', after: 65, title: 'Celý look tématu', text: 'Každé téma má sadu tří doplňků pro Mudrlanta: za 3 hvězdičky v tématu, za 300 a za 1000 správných odpovědí. Když Mudrlanta oblékneš do celé sady, získá look tématu (třeba Cestovatel), který uvidí i ostatní. Sady najdeš v Mém postupu u témat.',
            action: { kind: 'progress', label: 'Můj postup' }, ready: (u) => num(u.maxStars) >= 3, used: (u) => Boolean(u.visited.looks) },
        { id: 'skupiny', icon: 'users', art: 'skupiny', multi: true, account: true, after: 25, title: 'Skupiny', text: 'Založ si skupinu s kamarády, rodinou nebo spolužáky. Budete mít společné výzvy, vlastní týdenní žebříček a přehled, kdo z vás hrál. Ostatní pozveš odkazem.',
            action: { kind: 'groups', label: 'Skupiny' }, ready: (u) => num(u.counters.challenges) >= 1, used: (u) => Boolean(u.visited.groups) },
        { id: 'vitrina', icon: 'gem', art: 'vitrina', multi: true, account: true, after: 80, title: 'Vitrína v profilu', text: 'V Nastavení na záložce Profil si vyber až 3 trofeje, které ostatní uvidí ve tvém profilu: odznak, diplom nebo výsledek ligové sezóny.',
            action: { kind: 'settings', label: 'Nastavení', tab: 'profile' }, ready: (u) => u.showcase, used: (u) => Boolean(u.visited.showcase) },
        // Zlatá otázka (gold.js): art = stejný obrázek jako gold.js ART.owl (hlídá tests/gold.test.js)
        { id: 'zlata', icon: 'sparkles', art: 'zlata-otazka', after: 12, title: 'Zlatá otázka', text: 'Zhruba jednou za 50 otázek přijde Zlatá otázka se zlatým rámečkem. Dává trojnásobek XP a za správnou odpověď bez nápovědy i zlatý střípek. Pět střípků otevře Zlatou truhlu se vzácnou věcí.',
            action: { kind: 'gold', label: 'Ukázat střípky' }, ready: (u) => u.gold, used: (u) => Boolean(u.visited.gold) || num(u.counters.goldCorrect) >= 3 },
        // Boss týdne (boss.js); obrázek do dodání portrétu bosse (docs/NOVE-MODY.md č. 215) sova s výzvou
        { id: 'boss', icon: 'swords', art: 'sova-vyzva', after: 8, title: 'Boss týdne', text: 'Každý týden tě na úvodu vyzve jiný boss, Mudrlant v převleku. Sraz mu správnými odpověďmi všech 700 životů, rychlé odpovědi ho zasáhnou víc. Máš 3 pokusy za týden a za výhru získáš emblém, titul a 150 XP.',
            action: { kind: 'boss', label: 'Do arény' }, ready: (u) => u.boss, used: (u) => num(u.counters.bossFights) > 0 },
        { id: 'dobyvani', icon: 'swords', art: 'dobyvani', multi: true, account: true, after: 20, title: 'Dobývání', text: 'Na záložce Více hráčů najdeš Dobývání: s dalšími hráči dobýváte mapu otázkami o stavbách, osobnostech, dílech a místech napadených území a opevňujete svá území. Přidej se k Rychlé hře v Lobby, nebo založ vlastní a pozvi kamarády kódem.',
            action: { kind: 'conquest', label: 'Otevřít Dobývání' }, used: (u) => Boolean(u.visited.conquest) },
        // Dobývání (schéma 23): ztracený hrad stojí tah, upozornění na útoky; pro toho, kdo už Dobývání otevřel (pravidlo je nové pro všechny)
        { id: 'dobyvani-hrad', icon: 'castle', art: 'hrad-domov', multi: true, account: true, after: 20, title: 'Braň svůj hrad', text: 'V Dobývání se vyplatí opevnit domovský hrad: s každým stupněm roste a Pevnost na něm dává +1 tah za období. Kdo o hrad přijde, má v dalším období o 1 tah méně. Se zapnutými upozorněními se o útoku dozvíš hned.',
            action: { kind: 'conquest', label: 'Otevřít Dobývání' }, ready: (u) => Boolean(u.visited.conquest), used: () => false },
        // Dobývání (schéma 26): rychlé hry a další kolo; pro toho, kdo Dobývání už otevřel
        { id: 'dobyvani-blesk', icon: 'zap', art: 'dobyvani', multi: true, account: true, after: 20, title: 'Dobývání za 20 minut', text: 'Při zakládání hry v Dobývání zvol tempo Blesk: hra trvá 20 minut a kola 5 minut. Když všichni dohrají své tahy dřív, klepnou na Chci další kolo a další začne po odpočtu 10 s.',
            action: { kind: 'conquest', label: 'Otevřít Dobývání' }, ready: (u) => Boolean(u.visited.conquest), used: () => false },
        // Dobývání (schéma 25): bitvy o území; pro toho, kdo Dobývání už otevřel (pravidlo je nové pro všechny)
        { id: 'dobyvani-bitvy', icon: 'swords', art: 'dobyvani', multi: true, account: true, after: 20, title: 'Bitvy o území', text: 'Když v Dobývání někdo zaútočí na území, se kterým sousedíš, uvidíš na mapě bitvu a můžeš se přidat. Všichni dostanou stejnou otázku a 60 s, území získá nejrychlejší správná odpověď. Riskantní: správně, ale pomaleji znamená tah bez zisku.',
            action: { kind: 'conquest', label: 'Otevřít Dobývání' }, ready: (u) => Boolean(u.visited.conquest), used: () => false },
        // Dobývání (schéma 24): pozvánky přátel; pro toho, kdo Dobývání už otevřel a přátele má; kdo přátele už pozval, tip nepotřebuje
        { id: 'dobyvani-pratele', icon: 'user-plus', art: 'dobyvani', multi: true, account: true, after: 20, title: 'Pozvi přátele do Dobývání', text: 'Při zakládání hry v Dobývání klepni na Pozvat přátele a vyber je ze seznamu. Pozvánka jim přijde do aplikace a přidají se i do soukromé hry bez kódu.',
            action: { kind: 'conquest', label: 'Otevřít Dobývání' }, ready: (u) => Boolean(u.visited.conquest) && num(u.friends) > 0, used: (u) => Boolean(u.visited.conquestInvite) },
        // Kamarádské sázky (bets.js): obrázek č. 243 sova-sazka (bets.js ART.owl)
        { id: 'sazky', icon: 'gem', art: 'sova-sazka', multi: true, account: true, after: 30, title: 'Kamarádské sázky', text: 'Klepni na Vyzvat a vyber konkrétního hráče. V řádku Sázka můžeš vsadit 10, 25 nebo 50 XP a přidat vtipnou hlášku. Kdo vyhraje, vklad získá. Úroveň ti nikdy neklesne.',
            action: { kind: 'multi', label: 'Zkusit' }, ready: (u) => u.bets && num(u.counters.challenges) >= 2, used: (u) => Boolean(u.visited.bets) || num(u.counters.bets) > 0 },
        // Řetězovka dne (chain.js); art = č. 212 retezovka (jako chain.js ART.tile)
        { id: 'retezovka', icon: 'trophy', art: 'retezovka', after: 7, title: 'Řetězovka dne', text: 'V řadě Výzvy na úvodu čeká Řetězovka: 7 otázek, kde odpověď na jednu je začátkem další. Článek 1 dává 1 bod, článek 7 sedm bodů. Špatná odpověď řetěz přetrhne, jednou za hru ale pomůže Záchrana.',
            action: { kind: 'chain', label: 'Zkusit Řetězovku' }, ready: (u) => u.chain, used: (u) => num(u.counters.chainDone) > 0 }
    ];
    const BY_ID = new Map(TIPS.map(tip => [tip.id, tip]));

    const EMPTY = { seen: [], day: '', n: 0, lastAt: 0, off: false, visited: {} };
    // Navštívené části hry (tip o nich už není potřeba): Učení, Můj postup, Vzhled, Diplomy, Sezóna, Album, Vitrína, Kronika týdne
    const VISITED = ['learn', 'progress', 'look', 'diplomas', 'season', 'album', 'showcase', 'leagueSeasons', 'legends', 'looks', 'groups', 'chronicle', 'gold', 'conquest', 'bets', 'conquestInvite'];
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
            quiz: ctx.quiz !== false, mystery: ctx.mystery !== false, modes: ctx.modes !== false, goals: ctx.goals !== false, freezes: ctx.freezes, maxStars: ctx.maxStars,
            season: ctx.season !== false, album: ctx.album !== false, showcase: ctx.showcase !== false, chronicle: ctx.chronicle !== false, leagueSeasons: Boolean(ctx.leagueSeasons),
            gold: ctx.gold !== false,
            boss: ctx.boss !== false,
            bets: Boolean(ctx.bets),
            chain: ctx.chain !== false };
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
