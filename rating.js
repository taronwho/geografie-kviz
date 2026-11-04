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
    return { START, MIN, K, LEAGUES, cleanRating, leagueIndex, leagueFor, leagueById, leagueProgress, expectedScore, duelScore, ratingChange, formatDelta, weekStart, weekLabel };
});
