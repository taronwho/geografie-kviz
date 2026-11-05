// Týdenní turnaje: čistá logika bez DOMu (názvy kol, dny kol, stav karty turnaje, texty zpráv). Pravidla a posun kol dělá databáze
// (supabase/schema.sql, sekce „Týdenní turnaje“); tady se jen správně zobrazí to, co server spočítal. app.js ji jen volá.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantTournament = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const QUESTIONS = 10;
    const MIN_PLAYERS = 8;
    const MAX_PLAYERS = 128;
    const WIN_XP = 20;
    const WEEKDAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

    // --- Dny (Praha) ---
    // Den jako text RRRR-MM-DD; počítá se v UTC, ať letní čas nic neposouvá
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
    const parseDay = (day) => {
        const match = DAY_PATTERN.exec(String(day || ''));
        return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
    };
    const dayKey = (date) => date.toISOString().slice(0, 10);
    const addDays = (day, count) => { const date = parseDay(day); return date ? dayKey(new Date(date.getTime() + count * 86400000)) : ''; };
    const diffDays = (a, b) => { const first = parseDay(a); const second = parseDay(b); return first && second ? Math.round((first.getTime() - second.getTime()) / 86400000) : NaN; };
    // Dnešní den v Praze (kolo turnaje se počítá podle pražského dne, nezávisle na pásmu telefonu)
    const pragueToday = (now = new Date()) => {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
            const get = (type) => (parts.find(part => part.type === type) || {}).value;
            const text = `${get('year')}-${get('month')}-${get('day')}`;
            if (parseDay(text)) return text;
        } catch (error) { /* bez Intl se vezme UTC */ }
        return dayKey(now);
    };
    const formatDay = (day) => { const date = parseDay(day); return date ? `${date.getUTCDate()}. ${date.getUTCMonth() + 1}.` : ''; };
    const weekdayName = (day) => { const date = parseDay(day); return date ? WEEKDAYS[date.getUTCDay()] : ''; };
    // „dnes“, „zítra“, jinak „pondělí 9. 11.“
    const dayWord = (day, today) => {
        const gap = diffDays(day, today);
        if (gap === 0) return 'dnes';
        if (gap === 1) return 'zítra';
        return `${weekdayName(day)} ${formatDay(day)}`;
    };
    // Týden turnaje: „9. 11. – 15. 11.“
    const weekLabel = (weekStart) => `${formatDay(weekStart)} – ${formatDay(addDays(weekStart, 6))}`;

    // --- Kola ---
    const NAMES = { 128: '1. kolo', 64: '2. kolo', 32: 'Šestnáctifinále', 16: 'Osmifinále', 8: 'Čtvrtfinále', 4: 'Semifinále', 2: 'Finále' };
    // Název kola podle počtu hráčů v kole (u malých pavouků stejně: osm hráčů začíná čtvrtfinále)
    const roundName = (players, third = false) => third ? 'O 3. místo' : NAMES[players] || `Kolo (${players} hráčů)`;
    const playersInRound = (size, round) => Math.max(2, Math.round(Number(size) / Math.pow(2, round - 1)));
    const tournamentRoundName = (tournament, round, third = false) => roundName(playersInRound(tournament.size, round), third);
    // Den, kdy se hraje kolo n: started_on + n − 1
    const roundDay = (tournament, round) => addDays(tournament.started_on, round - 1);
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const playersWord = (count) => plural(count, 'hráč', 'hráči', 'hráčů');
    // Místo: „3. místo“; vyřazený v kole má rozmezí (5.–8. místo)
    const placeLabel = (place) => `${place}. místo`;
    const eliminatedLabel = (place) => place >= 5 ? `${place}.–${2 * (place - 1)}. místo` : placeLabel(place);

    // Zápasy po kolech (nejnižší kolo první; ve finálovém kole je za finále ještě zápas o 3. místo), v každém podle pozice v pavouku
    const groupRounds = (tournament, matches) => {
        const groups = new Map();
        [...matches].sort((a, b) => a.round - b.round || Number(a.third) - Number(b.third) || a.slot - b.slot).forEach(match => {
            const key = `${match.round}${match.third ? 't' : ''}`;
            if (!groups.has(key)) groups.set(key, { key, round: match.round, third: Boolean(match.third), name: tournamentRoundName(tournament, match.round, match.third), day: roundDay(tournament, match.round), matches: [] });
            groups.get(key).matches.push(match);
        });
        return [...groups.values()];
    };
    // Aktuální kolo = poslední kolo, které už existuje (to se právě hraje, nebo se hrálo naposledy)
    const currentRound = (matches) => matches.reduce((top, match) => Math.max(top, match.round), 0);
    const decided = (match) => Boolean(match && match.winner);
    const involves = (match, userId) => Boolean(match && userId && (match.p1 === userId || match.p2 === userId));
    const opponentOf = (match, userId) => match.p1 === userId ? match.p2 : match.p1;
    // Můj zápas v nejvyšším kole, ve kterém jsem (semifinalista poražený: zápas o 3. místo)
    const myMatch = (matches, userId) => matches.filter(match => involves(match, userId)).sort((a, b) => b.round - a.round || Number(b.third) - Number(a.third))[0] || null;
    const resultOf = (match, userId) => ((match && match.results) || []).find(row => row.user_id === userId) || null;
    // Stav hráče v turnaji se rozlišuje podle toho, co server už spočítal: viz cardState
    const winnerPlace = (tournament, match) => match.third ? 3 : match.round === tournament.rounds ? 1 : null;

    // --- Stav karty turnaje ---
    // tournament: řádek tournaments; entries: přihlášky (user_id, status, place); matches: zápasy s výsledky; today: den (Praha)
    // Vrací popis, ze kterého se karta vykreslí: { phase, ... }.
    const cardState = ({ tournament, entries = [], matches = [], me, today }) => {
        const mine = entries.find(entry => entry.user_id === me) || null;
        const base = { id: tournament.id, status: tournament.status, week: tournament.week_start };
        if (tournament.status === 'open') {
            const count = entries.length;
            const capacity = tournament.capacity || MAX_PLAYERS;
            const joined = Boolean(mine);
            const closed = diffDays(tournament.week_start, today) <= 0;
            return { ...base, phase: 'open', count, capacity, joined, full: count >= capacity, closed, canJoin: !joined && !closed && count < capacity, canLeave: joined && !closed, start: tournament.week_start, percent: Math.min(100, Math.round(count / capacity * 100)), enough: count >= MIN_PLAYERS };
        }
        if (tournament.status === 'cancelled') return { ...base, phase: 'cancelled', count: entries.length };
        const playing = Boolean(mine && ['playing', 'out', 'finished'].includes(mine.status));
        if (tournament.status === 'finished') {
            return { ...base, phase: 'finished', playing, place: playing ? mine.place : null, label: playing && mine.place ? placeLabel(mine.place) : '' };
        }
        // Běží
        const round = currentRound(matches);
        const state = { ...base, phase: 'running', playing, round, roundName: '', size: tournament.size };
        if (!playing) return { ...state, role: 'spectator', roundName: round ? tournamentRoundName(tournament, round) : '' };
        const match = myMatch(matches, me);
        if (!match) return { ...state, role: 'player', step: 'none' };
        const day = roundDay(tournament, match.round);
        const own = resultOf(match, me);
        const out = { ...state, role: 'player', match, matchId: match.id, round: match.round, third: Boolean(match.third), roundName: tournamentRoundName(tournament, match.round, match.third), day, opponent: opponentOf(match, me), correct: own && own.finished_at ? own.correct : null, points: own && own.finished_at ? own.points : null };
        if (decided(match)) {
            if (match.winner === me) {
                const finalRound = match.round >= tournament.rounds;
                return { ...out, step: 'won', how: match.decided_by, nextDay: finalRound ? null : roundDay(tournament, match.round + 1), final: finalRound };
            }
            return { ...out, step: 'lost', how: match.decided_by, place: mine.place || null, label: mine.place ? eliminatedLabel(mine.place) : '' };
        }
        const gap = diffDays(day, today);
        if (gap > 0) return { ...out, step: 'later' };
        if (gap < 0) return { ...out, step: 'counting' };
        if (own && own.finished_at) return { ...out, step: 'waiting' };
        if (own) return { ...out, step: 'unfinished' };
        return { ...out, step: 'play', canPlay: true };
    };

    // Věta pro kartu a okno turnaje podle stavu hráče
    const statusText = (state, names = {}, today) => {
        const opponent = state.opponent ? names[state.opponent] || 'soupeř' : '';
        if (state.phase === 'open') {
            if (state.closed) return 'Přihlášky jsou zavřené.';
            return `Začíná ${weekdayName(state.start)} ${formatDay(state.start)}`;
        }
        if (state.phase === 'cancelled') return 'Turnaj se nehrál, přihlásilo se málo hráčů.';
        if (state.phase === 'finished') return state.playing && state.place ? `Skončil, ${placeLabel(state.place)}.` : 'Turnaj skončil.';
        if (state.role === 'spectator') return 'Turnaj právě běží. Ty v něm nehraješ.';
        switch (state.step) {
        case 'play': return `Dnes hraješ proti ${opponent}.`;
        case 'unfinished': return 'Kolo jsi začal a nedokončil, počítá se jako neodehrané.';
        case 'waiting': return `Odehráno ${state.correct}/${QUESTIONS}, čekáš na soupeře.`;
        case 'later': return `Další kolo hraješ ${dayWord(state.day, today)} proti ${opponent}.`;
        case 'counting': return 'Kolo skončilo, výsledek se právě počítá.';
        case 'won': return state.final ? (state.third ? 'Vyhrál jsi zápas o 3. místo.' : 'Vyhrál jsi finále!') : `Postoupil jsi, další kolo je ${dayWord(state.nextDay, today)}.`;
        case 'lost': return state.label ? `Vypadl jsi: ${state.label}.` : 'Vypadl jsi z turnaje.';
        default: return 'Čeká se na další kolo.';
        }
    };

    // --- Zprávy od serveru ---
    // Vrací { title, text, place? } pro jednu zprávu tournament_notices; neznámý druh se přeskočí (null)
    const noticeText = (notice) => {
        const detail = Math.floor(Number(notice && notice.detail));
        switch (notice && notice.kind) {
        case 'excluded_full': return { title: 'Turnaj bez tebe', text: `Turnaj se hraje na pavouk, takže hrají jen nejdřív přihlášení${Number.isFinite(detail) && detail > 0 ? ` (tentokrát ${playersWord(detail)})` : ''}. Ty ses přihlásil mezi posledními, takže tentokrát nehraješ. Přihlas se do příštího turnaje, nejlépe hned při otevření přihlášek.` };
        case 'cancelled': return { title: 'Turnaj se zrušil', text: `Do turnaje se přihlásilo jen ${Number.isFinite(detail) ? playersWord(detail) : 'málo hráčů'}, a je jich potřeba aspoň ${MIN_PLAYERS}, takže se tenhle týden nehrál. Přihlas se do dalšího turnaje.` };
        case 'eliminated_noplay': return { title: 'Vypadl jsi z turnaje', text: 'Své kolo jsi neodehrál, a proto ho prohráváš kontumačně. Příště si ho zahraj v den kola.' };
        case 'result': {
            const place = Number.isFinite(detail) && detail > 0 ? detail : null;
            return { title: 'Turnaj skončil', place, text: place ? `Skončil jsi na ${placeLabel(place)}.${place <= 3 ? ' Gratulace!' : ''}` : 'Turnaj skončil.' };
        }
        default: return null;
        }
    };

    // Návod „Jak turnaje fungují“ (krátké body)
    const RULES = [
        'Každý týden se hraje turnaj v Mixu všech témat, začíná v pondělí. Přihlášky se otevírají hned po začátku předchozího turnaje.',
        `Hraje nejvyšší mocnina dvou nejdřív přihlášených hráčů (nejvýš ${MAX_PLAYERS}, nejméně ${MIN_PLAYERS}). Ostatní letos nehrají. Když se přihlásí méně než ${MIN_PLAYERS}, turnaj se ruší.`,
        `Pavouk je vyřazovací. Jedno kolo trvá jeden den: dvojice mají ${QUESTIONS} stejných otázek z Mixu (jen ze známějších) a každý je odehraje kdykoli během dne, jen jednou.`,
        'Vyhraje ten, kdo má víc správných odpovědí, pak víc bodů, pak je rychlejší (čas měří server) a nakonec toho, kdo se přihlásil dřív.',
        'Kdo kolo neodehraje, prohrává kontumačně a vypadává; soupeř, který odehrál, postupuje. Když neodehraje nikdo, postupuje dřívější přihlášený.',
        'Poražení semifinalisté hrají o 3. místo v den finále.',
        'Za každý vyhraný zápas dostaneš 20 XP a za umístění v turnajích odznaky.'
    ];

    // Nejvýš čtyři první místa (1.–4.) po skončení: seřazená podle místa
    const podium = (entries) => entries.filter(entry => entry.place >= 1 && entry.place <= 4 && entry.status === 'finished').sort((a, b) => a.place - b.place);
    // Mapa id → přezdívka z přihlášek
    const nameMap = (entries) => Object.fromEntries(entries.map(entry => [entry.user_id, (entry.player && entry.player.display_name) || 'Hráč']));
    // Výhry, za které patří XP: moje vyhrané zápasy, kde hrál aspoň vítěz (nehrálo-li se, „dřívější přihlášený“ XP nedává)
    const xpMatches = (matches, userId) => matches.filter(match => match.winner === userId && match.decided_by !== 'earlier').map(match => match.id);

    return {
        QUESTIONS, MIN_PLAYERS, MAX_PLAYERS, WIN_XP, RULES,
        parseDay, addDays, diffDays, pragueToday, formatDay, weekdayName, dayWord, weekLabel,
        roundName, playersInRound, tournamentRoundName, roundDay, plural, playersWord, placeLabel, eliminatedLabel,
        groupRounds, currentRound, decided, involves, opponentOf, myMatch, resultOf, winnerPlace,
        cardState, statusText, noticeText, podium, nameMap, xpMatches
    };
});
