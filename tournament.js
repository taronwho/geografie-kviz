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
    // tournament: řádek tournaments; entries: přihlášky (user_id, status, place); matches: zápasy s výsledky; today: den (Praha);
    // savedMatch: id zápasu, který má toto zařízení rozehraný v uložené relaci (null = žádný)
    // Vrací popis, ze kterého se karta vykreslí: { phase, ... }.
    const cardState = ({ tournament, entries = [], matches = [], me, today, savedMatch = null }) => {
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
        // Den kola skončil: rozehraný a nedohraný zápas vypršel (expired), jinak se jen dopočítává
        if (gap < 0) return { ...out, step: 'counting', expired: Boolean(own && !own.finished_at) };
        if (own && own.finished_at) return { ...out, step: 'waiting' };
        // Rozehraný zápas: server zná začátek a toto zařízení má uloženou relaci, pokračuje se od další otázky (čas běží od začátku).
        // Bez uložené relace (jiné zařízení, smazaná data) se kolo počítá jako neodehrané.
        if (own && savedMatch && savedMatch === match.id) return { ...out, step: 'resume', canResume: true };
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
        case 'resume': return 'Zápas máš rozehraný, dohraj ho. Čas běží od začátku zápasu.';
        case 'waiting': return `Odehráno ${state.correct}/${QUESTIONS}, čekáš na soupeře.`;
        case 'later': return `Další kolo hraješ ${dayWord(state.day, today)} proti ${opponent}.`;
        case 'counting': return state.expired ? 'Čas na zápas vypršel, kolo skončilo dřív, než jsi ho dohrál. Počítá se jako neodehrané.' : 'Kolo skončilo, výsledek se právě počítá.';
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

    // --- Celé pořadí ---
    const IN_GAME = ['playing', 'out', 'finished'];
    const entryName = (entry) => (entry.player && entry.player.display_name) || 'Hráč';
    // Součet bodů a času hráče ze všech jeho dohraných zápasů turnaje (výsledky soupeřů jsou vidět až po rozhodnutí zápasu, v pořadí skončeného turnaje tedy všechny)
    const totalsOf = (matches, userId) => {
        let points = 0; let timeMs = 0; let played = 0;
        (matches || []).forEach(match => {
            const row = resultOf(match, userId);
            if (row && row.finished_at) { points += Number(row.points) || 0; timeMs += Number(row.time_ms) || 0; played += 1; }
        });
        return { points, timeMs, played };
    };
    const formatDuration = (ms) => { const total = Math.max(0, Math.round((Number(ms) || 0) / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
    // Přesné pořadí ve skupině vypadlých: víc bodů celkem, při shodě menší celkový čas, pak dřívější přihlášení
    const byTotals = (totals) => (a, b) => (totals.get(b.user_id).points - totals.get(a.user_id).points)
        || (totals.get(a.user_id).timeMs - totals.get(b.user_id).timeMs)
        || String(a.joined_at || '').localeCompare(String(b.joined_at || '')) || byName(a, b);
    const byName = (a, b) => entryName(a).localeCompare(entryName(b), 'cs');
    // Rozmezí míst skupiny vypadlých: skupina o `count` hráčích, která začíná na místě `place` (5.–8.); jediný hráč má jen „3. místo“
    const placeRange = (place, count = 1) => {
        const from = Math.floor(Number(place));
        const to = from + Math.max(1, Math.floor(Number(count) || 1)) - 1;
        return { from, to, label: to > from ? `${from}.–${to}. místo` : placeLabel(from) };
    };
    // Kolo, ve kterém vypadl hráč s tímto místem (v databázi (velikost >> kolo) + 1); místa 1.–4. patří finálovému kolu
    const roundOfPlace = (size, place) => {
        if (!(size >= 2) || !(place >= 1)) return null;
        if (place <= 4) return { round: Math.round(Math.log2(size)), third: place >= 3 };
        const round = Math.round(Math.log2(size / (place - 1)));
        return round >= 1 ? { round, third: false } : null;
    };
    // Pořadí všech hráčů turnaje: { playing: [{ entry, label }] (ještě hrají, nahoře), groups: [{ key, from, to, label, roundName, rows: [{ entry, place, label }] }], total }
    // První skupina „top“ má místa 1.–4. po jednom, další vypadlí po kolech (stejné místo v databázi = jedna skupina). Přihlášení a vyloučení v pořadí nejsou.
    const standings = (entries, tournament, matches = []) => {
        const inGame = entries.filter(entry => IN_GAME.includes(entry.status));
        const roundLabel = (info) => info ? tournamentRoundName(tournament, info.round, info.third) : '';
        const playing = inGame.filter(entry => !entry.place && entry.status === 'playing').sort(byName).map(entry => {
            const match = myMatch(matches, entry.user_id);
            return { entry, label: match ? tournamentRoundName(tournament, match.round, match.third) : '' };
        });
        const placed = inGame.filter(entry => entry.place >= 1);
        const unplaced = inGame.filter(entry => !(entry.place >= 1) && !playing.some(row => row.entry === entry)).sort(byName);
        const groups = [];
        const totals = new Map(inGame.map(entry => [entry.user_id, totalsOf(matches, entry.user_id)]));
        const withTotals = (entry, place, label) => ({ entry, place, label, points: totals.get(entry.user_id).points, timeMs: totals.get(entry.user_id).timeMs });
        const top = placed.filter(entry => entry.place <= 4).sort((a, b) => a.place - b.place || byName(a, b));
        if (top.length) {
            groups.push({ key: 'top', from: 1, to: 4, label: '1.–4. místo', roundName: '', individual: true, rows: top.map(entry => withTotals(entry, entry.place, entry.place === 1 ? 'Vítěz' : roundLabel(roundOfPlace(tournament.size, entry.place)))) });
        }
        const byPlace = new Map();
        placed.filter(entry => entry.place > 4).forEach(entry => { if (!byPlace.has(entry.place)) byPlace.set(entry.place, []); byPlace.get(entry.place).push(entry); });
        [...byPlace.keys()].sort((a, b) => a - b).forEach(place => {
            const list = byPlace.get(place).sort(byTotals(totals));
            const range = placeRange(place, list.length);
            const name = roundLabel(roundOfPlace(tournament.size, place));
            // přesná místa uvnitř skupiny podle celkových bodů a času
            groups.push({ key: `p${place}`, from: range.from, to: range.to, label: range.label, roundName: name, individual: true, rows: list.map((entry, index) => withTotals(entry, range.from + index, name)) });
        });
        if (unplaced.length) groups.push({ key: 'none', from: null, to: null, label: 'Bez umístění', roundName: '', individual: false, rows: unplaced.map(entry => ({ entry, place: null, label: '' })) });
        return { playing, groups, total: inGame.length };
    };

    // --- Pavouk (sloupce kol) ---
    // První kolo, ve kterém zbývá nejvýš 16 hráčů (osmifinále a dál); u malých turnajů 1
    const bracketStartRound = (tournament) => {
        for (let round = 1; round <= tournament.rounds; round++) if (playersInRound(tournament.size, round) <= 16) return round;
        return 1;
    };
    // Poslední kolo, ve kterém jsou všechny (hlavní) zápasy rozhodnuté; 0, když žádné
    const lastDecidedRound = (matches) => {
        const byRound = new Map();
        (matches || []).filter(match => !match.third).forEach(match => { if (!byRound.has(match.round)) byRound.set(match.round, []); byRound.get(match.round).push(match); });
        let last = 0;
        [...byRound.keys()].sort((a, b) => a - b).forEach(round => { if (byRound.get(round).every(match => match.winner)) last = round; });
        return last;
    };
    // Co z karty zápasu jde říct o hráči: { won, lost } (vítěz / poražený, dokud se nerozhodne, nic)
    const sideOf = (card, id) => ({ id, won: Boolean(card.winner && card.winner === id), lost: Boolean(card.winner && id && card.winner !== id) });
    // Sloupce kola po kole se všemi kartami zápasů, i těmi, které ještě nejsou (jen pozice v pavouku, hráči z rozhodnutých zápasů před nimi).
    // Karty jsou podle pozice (slot): sourozenci 2s−1 a 2s se potkají v kartě s na stejné úrovni, takže vítěz postupuje „doprostřed“.
    // Vrací { columns: [{ round, name, day, players, current, cards }], third (karta o 3. místo | null), champion (id | null), focusRound }.
    const bracketColumns = (matches, tournament, me = '') => {
        const size = Number(tournament.size) || 0;
        const rounds = Number(tournament.rounds) || (size >= 2 ? Math.round(Math.log2(size)) : 0);
        if (!(size >= 2) || !(rounds >= 1)) return { columns: [], third: null, champion: null, focusRound: 0 };
        const real = new Map(matches.map(match => [`${match.round}-${match.slot}${match.third ? 't' : ''}`, match]));
        const current = tournament.status === 'running' ? currentRound(matches) : 0;
        const make = (round, slot, third, p1, p2) => {
            const match = real.get(`${round}-${slot}${third ? 't' : ''}`);
            const card = match
                ? { key: third ? 'third' : `${round}-${slot}`, id: match.id, round, slot, third, exists: true, p1: match.p1 || null, p2: match.p2 || null, winner: match.winner || null, decidedBy: match.decided_by || null, results: match.results || [] }
                : { key: third ? 'third' : `${round}-${slot}`, id: '', round, slot, third, exists: false, p1: p1 || null, p2: p2 || null, winner: null, decidedBy: null, results: [] };
            card.sides = [card.p1, card.p2].map(id => {
                const result = id ? card.results.find(row => row.user_id === id && row.finished_at) : null;
                return { ...sideOf(card, id), correct: result ? result.correct : null };
            });
            card.mine = Boolean(me && (card.p1 === me || card.p2 === me));
            card.waits = false;
            return card;
        };
        const columns = [];
        let previous = null;
        for (let round = 1; round <= rounds; round++) {
            const count = Math.max(1, size >> round);
            const cards = [];
            for (let slot = 1; slot <= count; slot++) {
                const feeders = previous ? [previous.cards[2 * slot - 2], previous.cards[2 * slot - 1]] : [];
                const card = make(round, slot, false, feeders[0] && feeders[0].winner, feeders[1] && feeders[1].winner);
                // Karta, která čeká na mě: zápas před ní jsem ještě nedohrál
                card.waits = Boolean(me && !card.mine && feeders.some(feeder => feeder && feeder.mine && feeder.exists && !feeder.winner));
                cards.push(card);
            }
            const column = { round, name: tournamentRoundName(tournament, round), day: roundDay(tournament, round), players: playersInRound(size, round), current: round === current, cards };
            columns.push(column);
            previous = column;
        }
        // Zápas o 3. místo: poražení semifinalisté
        let third = null;
        if (rounds >= 2) {
            const semis = columns[rounds - 2].cards;
            const loser = (card) => card && card.winner ? (card.winner === card.p1 ? card.p2 : card.p1) : null;
            third = make(rounds, 1, true, loser(semis[0]), loser(semis[1]));
        }
        const final = columns[rounds - 1].cards[0];
        const focusRound = (() => {
            const mine = columns.flatMap(column => column.cards).filter(card => card.mine && !card.third);
            return mine.length ? Math.max(...mine.map(card => card.round)) : Math.max(1, currentRound(matches));
        })();
        return { columns, third, champion: final && final.winner ? final.winner : null, focusRound };
    };
    // Cesta hráče pavoukem: klíče karet, ve kterých hrál (keys), a těch, které vyhrál (won)
    const playerPath = (bracket, userId) => {
        const keys = new Set();
        const won = new Set();
        if (!userId) return { keys, won };
        const cards = bracket.columns.flatMap(column => column.cards).concat(bracket.third ? [bracket.third] : []);
        cards.forEach(card => {
            if (card.p1 !== userId && card.p2 !== userId) return;
            keys.add(card.key);
            if (card.winner === userId) won.add(card.key);
        });
        return { keys, won };
    };
    // Krátký den kola do záhlaví sloupce: „dnes“, „zítra“, „po 9. 11.“
    const DAY_SHORT = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
    const dayShort = (day, today) => {
        const gap = diffDays(day, today);
        if (gap === 0) return 'dnes';
        if (gap === 1) return 'zítra';
        const date = parseDay(day);
        return date ? `${DAY_SHORT[date.getUTCDay()]} ${formatDay(day)}` : '';
    };

    return {
        QUESTIONS, MIN_PLAYERS, MAX_PLAYERS, WIN_XP, RULES,
        parseDay, addDays, totalsOf, formatDuration, diffDays, pragueToday, formatDay, weekdayName, dayWord, weekLabel,
        roundName, playersInRound, tournamentRoundName, roundDay, plural, playersWord, placeLabel, eliminatedLabel,
        groupRounds, currentRound, decided, involves, opponentOf, myMatch, resultOf, winnerPlace,
        cardState, statusText, noticeText, podium, nameMap, xpMatches,
        placeRange, roundOfPlace, standings, bracketStartRound, lastDecidedRound, bracketColumns, playerPath, dayShort
    };
});
