// Rating hráčů (ELO) a ligy. Čistá logika bez DOMu; stejný výpočet a hranice lig má databáze (supabase/schema.sql),
// která rating počítá po dohrání výzvy. Tady slouží k zobrazení (liga, postup do další ligy, týden) a k testům.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantRating = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const START = 1000;
    const MIN = 100;
    const K = 24;
    // Ligy od nejnižší; from = nejnižší rating v lize. Ikona je z Lucide (scripts/build-icons.mjs), css = třída .league-* v src/input.css
    const LEAGUES = [
        { id: 'bronz', name: 'Bronz', from: 0, icon: 'shield', css: 'league-bronz' },
        { id: 'stribro', name: 'Stříbro', from: 1100, icon: 'shield-check', css: 'league-stribro' },
        { id: 'zlato', name: 'Zlato', from: 1250, icon: 'medal', css: 'league-zlato' },
        { id: 'platina', name: 'Platina', from: 1400, icon: 'award', css: 'league-platina' },
        { id: 'diamant', name: 'Diamant', from: 1550, icon: 'gem', css: 'league-diamant' },
        { id: 'mistr', name: 'Mistr', from: 1700, icon: 'crown', css: 'league-mistr' }
    ];
    const cleanRating = (value) => {
        const number = Math.floor(Number(value));
        return Number.isFinite(number) ? Math.max(MIN, Math.min(5000, number)) : START;
    };
    const leagueIndex = (rating) => {
        const value = cleanRating(rating);
        let index = 0;
        LEAGUES.forEach((league, i) => { if (value >= league.from) index = i; });
        return index;
    };
    const leagueFor = (rating) => LEAGUES[leagueIndex(rating)];
    const leagueById = (id) => LEAGUES.find(league => league.id === id) || LEAGUES[0];
    // Postup v lize: ratingy od začátku ligy do začátku další (u nejvyšší ligy bez další)
    const leagueProgress = (rating) => {
        const value = cleanRating(rating);
        const index = leagueIndex(value);
        const league = LEAGUES[index];
        const next = LEAGUES[index + 1] || null;
        if (!next) return { league, next: null, percent: 100, toNext: 0 };
        // Pruh Bronzu začíná na 900 (nižší ratingy jsou vzácné), ostatní ligy na své hranici
        const from = index === 0 ? 900 : league.from;
        return { league, next, percent: Math.max(0, Math.min(100, Math.round((value - from) / (next.from - from) * 100))), toNext: next.from - value };
    };
    // ELO: očekávané skóre hráče A proti B
    const expectedScore = (ratingA, ratingB) => 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    // Skóre výzvy z pohledu A: 1 výhra, 0 prohra, 0.5 remíza (víc správných, pak víc bodů)
    const duelScore = (a, b) => a.correct !== b.correct ? (a.correct > b.correct ? 1 : 0) : a.points !== b.points ? (a.points > b.points ? 1 : 0) : 0.5;
    // Změna ratingu hráče A (B má opačnou); rating neklesne pod MIN. Shodné s rate_challenge() v databázi.
    const ratingChange = (ratingA, ratingB, score) => {
        const a = cleanRating(ratingA);
        const b = cleanRating(ratingB);
        const raw = Math.round(K * (score - expectedScore(a, b)));
        return Math.min(Math.max(raw, MIN - a), b - MIN);
    };
    const formatDelta = (delta) => delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '±0';
    // Začátek aktuálního týdne (pondělí 00:00 podle času prohlížeče) a pondělí–neděle jako text
    const weekStart = (now = new Date()) => {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        return start;
    };
    const weekLabel = (now = new Date()) => {
        const start = weekStart(now);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
        return `${start.getDate()}. ${start.getMonth() + 1}. – ${end.getDate()}. ${end.getMonth() + 1}.`;
    };

    // --- Závěrečná obrazovka výzvy: výsledek slovy a hláška (stejná pro tutéž výzvu, ať se po překreslení nemění) ---
    // Výsledek proti nejlepšímu soupeři: víc správných odpovědí, při shodě víc bodů, jinak remíza. Bez soupeře = čekání.
    const outcomeOf = (mine, rival) => {
        if (!rival) return 'cekani';
        if (mine.correct !== rival.correct) return mine.correct > rival.correct ? 'vyhra' : 'prohra';
        if (mine.points !== rival.points) return mine.points > rival.points ? 'vyhra' : 'prohra';
        return 'remiza';
    };
    const HEADLINES = { vyhra: 'Vyhrál jsi!', prohra: 'Tentokrát prohra', remiza: 'Remíza!', cekani: 'Hotovo, čeká se na soupeře' };
    const QUIPS = {
        vyhra: [
            'Mudrlant smekl čepici. Doslova.',
            'Soupeř právě googluje, jak se to stalo.',
            'Tohle si zaslouží zlatou hvězdičku. A možná dvě.',
            'Mozek na plný plyn, soupeř na volnoběh.',
            'Vítězství s monoklem a s klidem.',
            'Takhle se to dělá. Zápis do síně slávy.',
            'Kdyby se kvíz dal sníst, byl bys dnes sytý.',
            'Soupeř si říká, že měl vypnout notifikace.',
            'Hladce, jako když Mudrlant letí nocí.',
            'Znalosti 1, náhoda 0.',
            'Na tuhle výzvu se bude vzpomínat. Alespoň tady.',
            'Mudrlant je pyšný. Tiše, ale moc.',
            'Říkej si klidně profesore.',
            'Další takový výkon a bude se o tobě učit v dějepisu.',
            'Tohle nebylo štěstí, tohle byla chytrost.',
            'Vítěz bere vše. Aspoň čest a pár bodů.'
        ],
        prohra: [
            'I Mudrlant občas zahouká vedle. Příště to vyjde.',
            'Prohra je jen vítězství, které se zdrželo.',
            'Soupeř měl dnes štěstí. A možná i trochu znalostí.',
            'Chyby jsou nejlepší učitel. Lekce zaplacená.',
            'Mudrlant tě stejně obdivuje. Zatím tajně.',
            'Odveta je vždycky na stole.',
            'Nevadí, aspoň už víš, co příště nehádat.',
            'Tohle kolo ne, ale celý kvíz zdaleka není u konce.',
            'Dnes prohra, zítra legenda.',
            'I Einstein začínal s jedničkou z fyziky. Možná.',
            'Mudrlant prohru neřeší, Mudrlant plánuje odvetu.',
            'Zlatou medaili si necháme na příště.',
            'Zvedni zobák, odveta čeká.',
            'Teď víš o jedné otázce víc než dřív.',
            'Soupeř vyhrál bitvu, válka teprve začíná.',
            'Dobrý hráč se pozná podle toho, že hned chce odvetu.'
        ],
        remiza: [
            'Remíza! Dva Mudrlanti, jedna hlava.',
            'Nikdo nevyhrál, nikdo neprohrál, oba jste chytří.',
            'Přesně stejně? To je skoro podezřelé.',
            'Souboj titánů skončil nerozhodně. Mudrlant je ohromený.',
            'Vyrovnaný soupeř je nejlepší soupeř.',
            'Půl vítězství pro každého a půl bonbonu pro Mudrlanta.',
            'Remíza: když se dva geniální mozky potkají.',
            'Rozhodl by až rozstřel. Dáte odvetu?',
            'Tohle se nepoštěstí často. Vážně.',
            'Stejně dobří. Stejně vychytralí. Stejně líní na odvetu?',
            'Váha spravedlnosti se ani nehnula.',
            'Nerozhodně, ale s hlavou vztyčenou.',
            'Mudrlant říká: oba jste vyhráli, jen trochu méně.',
            'Žádný vítěz, žádný poražený, jen dva zdatní hráči.',
            'Pat! Šachisté by byli pyšní.',
            'Remíza je vlastně dvojité vítězství. Tak nějak.'
        ],
        cekani: [
            'Tvůj výsledek je v tahu, teď je řada na soupeři.',
            'Mudrlant drží palce, aby soupeř stihl dohrát.',
            'Pošli kód kamarádovi a ať se snaží.',
            'Hotovo! Teď už jen napjaté čekání.',
            'Výzva je venku. Soupeř, tvůj tah.',
            'Zatím jsi první. Vydrží to?',
            'Mudrlant nervózně přešlapuje na bidýlku.',
            'Čekání na soupeře: nejtěžší disciplína kvízu.',
            'Tvůj výsledek je v bezpečí. Výsledek soupeře zatím tajemství.',
            'Mezitím můžeš zahrát dnešní otázky.',
            'Až soupeř dohraje, uvidíš, kdo vyhrál.',
            'Odvedl jsi svoje. Zbytek je na soupeři.',
            'Výzva rozeslána, Mudrlant hlídá hnízdo.',
            'Dobrá práce. Teď trpělivost.',
            'Výsledek se spočítá, jakmile soupeř zahraje.',
            'Napětí stoupá. Mudrlant okusuje pírko.'
        ]
    };
    const hashOf = (text) => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const quipFor = (outcome, seed) => { const list = QUIPS[outcome] || QUIPS.cekani; return list[hashOf(`${outcome}|${seed}`) % list.length]; };
    
    return { outcomeOf, HEADLINES, QUIPS, quipFor, START, MIN, K, LEAGUES, cleanRating, leagueIndex, leagueFor, leagueById, leagueProgress, expectedScore, duelScore, ratingChange, formatDelta, weekStart, weekLabel };
});
