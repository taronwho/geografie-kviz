// Čistá logika týdenních turnajů (tournament.js): názvy kol, dny, stav karty podle toho, co spočítal server, texty zpráv.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tournament.js');

const ME = 'u-me';
const OTHER = 'u-other';
const running = { id: 't1', status: 'running', week_start: '2026-11-09', started_on: '2026-11-09', size: 8, rounds: 3, capacity: 128, seed: 's' };
const entry = (id, status = 'playing', place = null) => ({ user_id: id, status, place, player: { display_name: id } });
const match = (extra) => ({ id: 'm1', round: 1, slot: 1, third: false, p1: ME, p2: OTHER, winner: null, decided_by: null, results: [], ...extra });
const state = (matches, today, entries = [entry(ME), entry(OTHER)], tournament = running) => T.cardState({ tournament, entries, matches, me: ME, today });

test('názvy kol podle počtu hráčů v kole', () => {
    const names = { 128: '1. kolo', 64: '2. kolo', 32: 'Šestnáctifinále', 16: 'Osmifinále', 8: 'Čtvrtfinále', 4: 'Semifinále', 2: 'Finále' };
    Object.entries(names).forEach(([players, name]) => assert.equal(T.roundName(Number(players)), name));
    assert.equal(T.roundName(2, true), 'O 3. místo');
    assert.equal(T.roundName(4, true), 'O 3. místo');
    // pavouk o 128: kolo 1 = 128 hráčů, kolo 7 = finále; pavouk o 8: kolo 1 = čtvrtfinále
    assert.equal(T.tournamentRoundName({ size: 128 }, 1), '1. kolo');
    assert.equal(T.tournamentRoundName({ size: 128 }, 3), 'Šestnáctifinále');
    assert.equal(T.tournamentRoundName({ size: 128 }, 7), 'Finále');
    assert.equal(T.tournamentRoundName({ size: 128 }, 7, true), 'O 3. místo');
    assert.equal(T.tournamentRoundName({ size: 8 }, 1), 'Čtvrtfinále');
    assert.equal(T.tournamentRoundName({ size: 8 }, 2), 'Semifinále');
    assert.equal(T.tournamentRoundName({ size: 16 }, 1), 'Osmifinále');
    assert.equal(T.playersInRound(64, 3), 16);
});

test('dny: kolo n se hraje v den started_on + n − 1, formát a slova', () => {
    assert.equal(T.roundDay({ started_on: '2026-11-09' }, 1), '2026-11-09');
    assert.equal(T.roundDay({ started_on: '2026-11-09' }, 4), '2026-11-12');
    assert.equal(T.addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(T.addDays('2026-03-28', 2), '2026-03-30', 'přechod na letní čas nic neposouvá');
    assert.equal(T.diffDays('2026-11-12', '2026-11-09'), 3);
    assert.equal(T.formatDay('2026-11-09'), '9. 11.');
    assert.equal(T.formatDay('2026-01-31'), '31. 1.');
    assert.equal(T.weekdayName('2026-11-09'), 'pondělí');
    assert.equal(T.weekdayName('2026-11-15'), 'neděle');
    assert.equal(T.dayWord('2026-11-10', '2026-11-10'), 'dnes');
    assert.equal(T.dayWord('2026-11-11', '2026-11-10'), 'zítra');
    assert.equal(T.dayWord('2026-11-13', '2026-11-10'), 'pátek 13. 11.');
    assert.equal(T.weekLabel('2026-11-09'), '9. 11. – 15. 11.');
    assert.equal(T.formatDay('nesmysl'), '');
});

test('dnešní den se bere podle Prahy, ne podle pásma zařízení', () => {
    assert.equal(T.pragueToday(new Date('2026-11-09T23:30:00Z')), '2026-11-10', '0:30 v Praze už je úterý');
    assert.equal(T.pragueToday(new Date('2026-11-09T22:30:00Z')), '2026-11-09');
    assert.equal(T.pragueToday(new Date('2026-07-09T22:30:00Z')), '2026-07-10', 'v létě je Praha o dvě hodiny napřed');
});

test('stav karty: přihlášky otevřené (naplnění, přihlášen, zavřeno, plno)', () => {
    const open = { id: 't2', status: 'open', week_start: '2026-11-16', capacity: 128 };
    const entries = Array.from({ length: 87 }, (_, i) => entry(`p${i}`, 'registered'));
    let card = T.cardState({ tournament: open, entries, matches: [], me: ME, today: '2026-11-10' });
    assert.equal(card.phase, 'open');
    assert.equal(card.count, 87);
    assert.equal(card.percent, 68);
    assert.equal(card.canJoin, true);
    assert.equal(card.canLeave, false);
    assert.equal(T.statusText(card, {}, '2026-11-10'), 'Začíná pondělí 16. 11.');
    card = T.cardState({ tournament: open, entries: [...entries, entry(ME, 'registered')], matches: [], me: ME, today: '2026-11-10' });
    assert.equal(card.joined, true);
    assert.equal(card.canJoin, false);
    assert.equal(card.canLeave, true);
    // plno: nový se nepřihlásí, přihlášený se odhlásit smí
    const full = Array.from({ length: 128 }, (_, i) => entry(`p${i}`, 'registered'));
    card = T.cardState({ tournament: open, entries: full, matches: [], me: ME, today: '2026-11-10' });
    assert.equal(card.full, true);
    assert.equal(card.canJoin, false);
    // v den začátku je přihlašování zavřené
    card = T.cardState({ tournament: open, entries, matches: [], me: ME, today: '2026-11-16' });
    assert.equal(card.closed, true);
    assert.equal(card.canJoin, false);
    assert.equal(card.enough, true);
});

test('stav karty: běžící turnaj a moje kolo', () => {
    // dnes se hraje, ještě jsem nezačal
    let card = state([match()], '2026-11-09');
    assert.equal(card.step, 'play');
    assert.equal(card.canPlay, true);
    assert.equal(card.matchId, 'm1');
    assert.equal(card.opponent, OTHER);
    assert.equal(card.roundName, 'Čtvrtfinále');
    assert.equal(T.statusText(card, { [OTHER]: 'Petr' }, '2026-11-09'), 'Dnes hraješ proti Petr.');
    // začal a nedokončil
    card = state([match({ results: [{ user_id: ME, started_at: 'x', finished_at: null }] })], '2026-11-09');
    assert.equal(card.step, 'unfinished');
    assert.equal(card.canPlay, undefined);
    assert.match(T.statusText(card, {}, '2026-11-09'), /začal a nedokončil, počítá se jako neodehrané/);
    // odehrál, čeká na soupeře
    card = state([match({ results: [{ user_id: ME, started_at: 'x', finished_at: 'y', correct: 7, points: 20 }] })], '2026-11-09');
    assert.equal(card.step, 'waiting');
    assert.equal(card.correct, 7);
    assert.match(T.statusText(card, {}, '2026-11-09'), /čekáš na soupeře/);
    // kolo je až zítra (následující kolo vzniklo dřív)
    card = state([match({ round: 2, id: 'm2' })], '2026-11-09');
    assert.equal(card.step, 'later');
    assert.equal(card.roundName, 'Semifinále');
    assert.equal(T.statusText(card, { [OTHER]: 'Petr' }, '2026-11-09'), 'Další kolo hraješ zítra proti Petr.');
    // kolo skončilo, server ještě nerozhodl
    card = state([match()], '2026-11-10');
    assert.equal(card.step, 'counting');
});

test('stav karty: rozehraný zápas s uloženou relací jde dohrát jen v den kola', () => {
    const started = [{ user_id: ME, started_at: 'x', finished_at: null }];
    // server zná začátek a zařízení má uloženou relaci tohoto zápasu: Pokračovat
    let card = T.cardState({ tournament: running, entries: [entry(ME), entry(OTHER)], matches: [match({ results: started })], me: ME, today: '2026-11-09', savedMatch: 'm1' });
    assert.equal(card.step, 'resume');
    assert.equal(card.canResume, true);
    assert.equal(card.canPlay, undefined);
    assert.equal(card.matchId, 'm1');
    assert.match(T.statusText(card, {}, '2026-11-09'), /Čas běží od začátku zápasu/);
    // uložená relace patří jinému zápasu (nebo chybí – jiné zařízení): začal a nedokončil
    card = T.cardState({ tournament: running, entries: [entry(ME), entry(OTHER)], matches: [match({ results: started })], me: ME, today: '2026-11-09', savedMatch: 'jiny' });
    assert.equal(card.step, 'unfinished');
    card = T.cardState({ tournament: running, entries: [entry(ME), entry(OTHER)], matches: [match({ results: started })], me: ME, today: '2026-11-09', savedMatch: null });
    assert.equal(card.step, 'unfinished');
    // uložená relace bez začátku na serveru nic neobnovuje (zápas se hraje od začátku)
    card = T.cardState({ tournament: running, entries: [entry(ME), entry(OTHER)], matches: [match()], me: ME, today: '2026-11-09', savedMatch: 'm1' });
    assert.equal(card.step, 'play');
    // po půlnoci dne kola se obnova nenabízí
    card = T.cardState({ tournament: running, entries: [entry(ME), entry(OTHER)], matches: [match({ results: started })], me: ME, today: '2026-11-10', savedMatch: 'm1' });
    assert.equal(card.step, 'counting');
    // dohraný zápas má přednost
    card = T.cardState({ tournament: running, entries: [entry(ME), entry(OTHER)], matches: [match({ results: [{ user_id: ME, started_at: 'x', finished_at: 'y', correct: 4, points: 9 }] })], me: ME, today: '2026-11-09', savedMatch: 'm1' });
    assert.equal(card.step, 'waiting');
});
test('stav karty: postoupil, vypadl, finále, bronz, divák', () => {
    let card = state([match({ winner: ME, decided_by: 'played' })], '2026-11-09');
    assert.equal(card.step, 'won');
    assert.equal(card.nextDay, '2026-11-10');
    assert.equal(T.statusText(card, {}, '2026-11-09'), 'Postoupil jsi, další kolo je zítra.');
    card = state([match({ winner: OTHER, decided_by: 'played' })], '2026-11-10', [entry(ME, 'out', 5), entry(OTHER)]);
    assert.equal(card.step, 'lost');
    assert.equal(card.label, '5.–8. místo');
    assert.equal(T.statusText(card, {}, '2026-11-10'), 'Vypadl jsi: 5.–8. místo.');
    // moje poslední zápas je nejvyššího kola; zápas o 3. místo se bere před předchozím semifinále
    card = state([match({ id: 'sf', round: 2, winner: OTHER }), match({ id: 'b', round: 3, third: true })], '2026-11-11', [entry(ME, 'out', 3), entry(OTHER)]);
    assert.equal(card.matchId, 'b');
    assert.equal(card.roundName, 'O 3. místo');
    assert.equal(card.step, 'play');
    // vyhrané finále
    card = state([match({ id: 'f', round: 3, winner: ME })], '2026-11-11');
    assert.equal(card.final, true);
    assert.equal(T.statusText(card, {}, '2026-11-11'), 'Vyhrál jsi finále!');
    // divák (nehraju): nemám přihlášku ve hře
    card = state([match({ p1: 'a', p2: 'b' })], '2026-11-09', [entry('a'), entry('b'), entry(ME, 'excluded')]);
    assert.equal(card.role, 'spectator');
    assert.equal(card.roundName, 'Čtvrtfinále');
    // skončený turnaj
    card = T.cardState({ tournament: { ...running, status: 'finished' }, entries: [entry(ME, 'finished', 2)], matches: [], me: ME, today: '2026-11-12' });
    assert.equal(card.phase, 'finished');
    assert.equal(card.label, '2. místo');
    assert.equal(T.statusText(card, {}, '2026-11-12'), 'Skončil, 2. místo.');
});

test('texty zpráv od serveru', () => {
    assert.match(T.noticeText({ kind: 'excluded_full', detail: '8' }).text, /8 hráčů/);
    assert.match(T.noticeText({ kind: 'excluded_full', detail: '8' }).text, /nehraješ/);
    assert.match(T.noticeText({ kind: 'excluded_full', detail: '8' }).text, /příštího turnaje/);
    assert.match(T.noticeText({ kind: 'cancelled', detail: '5' }).text, /5 hráčů/);
    assert.match(T.noticeText({ kind: 'cancelled', detail: '1' }).text, /1 hráč,/);
    assert.match(T.noticeText({ kind: 'eliminated_noplay' }).text, /neodehrál/);
    const result = T.noticeText({ kind: 'result', detail: '2' });
    assert.equal(result.place, 2);
    assert.match(result.text, /2\. místo/);
    assert.equal(T.noticeText({ kind: 'neznamy' }), null);
    assert.equal(T.noticeText(null), null);
});

test('zápasy po kolech: seřazené, finále a bronz, výhry za XP', () => {
    const t = { size: 4, started_on: '2026-11-09', rounds: 2 };
    const matches = [
        { id: 'c', round: 2, slot: 1, third: true, p1: 'a', p2: 'b' }, { id: 'b', round: 1, slot: 2, p1: 'c', p2: 'd', winner: 'c', decided_by: 'walkover' },
        { id: 'a', round: 1, slot: 1, p1: 'a', p2: 'b', winner: 'a', decided_by: 'played' }, { id: 'd', round: 2, slot: 1, third: false, p1: 'a', p2: 'c' }
    ];
    const groups = T.groupRounds(t, matches);
    assert.deepEqual(groups.map(group => group.name), ['Semifinále', 'Finále', 'O 3. místo']);
    assert.deepEqual(groups[0].matches.map(match => match.id), ['a', 'b']);
    assert.equal(groups[1].day, '2026-11-10');
    assert.equal(T.currentRound(matches), 2);
    assert.deepEqual(T.xpMatches(matches.concat({ id: 'e', winner: 'a', decided_by: 'earlier' }), 'a'), ['a']);
    assert.deepEqual(T.podium([{ user_id: 'x', status: 'finished', place: 2 }, { user_id: 'y', status: 'finished', place: 1 }, { user_id: 'z', status: 'out', place: 7 }]).map(entry => entry.user_id), ['y', 'x']);
});

test('místa a množné číslo', () => {
    assert.equal(T.placeLabel(3), '3. místo');
    assert.equal(T.eliminatedLabel(9), '9.–16. místo');
    assert.equal(T.eliminatedLabel(3), '3. místo');
    assert.equal(T.playersWord(1), '1 hráč');
    assert.equal(T.playersWord(3), '3 hráči');
    assert.equal(T.playersWord(8), '8 hráčů');
    assert.ok(T.RULES.length >= 6);
});

// --- Celé pořadí a pavouk ---
// Simulace serveru: hráči p1..pN, v každém zápase vyhraje ten s nižším číslem; doneRounds = počet rozhodnutých kol (další kolo už běží)
const simulate = (size, doneRounds, { finished = false } = {}) => {
    const rounds = Math.round(Math.log2(size));
    const tournament = { id: 'tx', status: finished ? 'finished' : 'running', week_start: '2026-11-09', started_on: '2026-11-09', size, rounds, capacity: 128 };
    let alive = Array.from({ length: size }, (_, i) => `p${i + 1}`);
    const matches = [];
    const places = new Map();
    for (let round = 1; round <= Math.min(doneRounds + (finished ? 0 : 1), rounds); round++) {
        const next = [];
        const losers = [];
        const decided = round <= doneRounds;
        for (let slot = 1; slot <= alive.length / 2; slot++) {
            const [p1, p2] = [alive[2 * slot - 2], alive[2 * slot - 1]];
            matches.push({ id: `m${round}-${slot}`, round, slot, third: false, p1, p2, winner: decided ? p1 : null, decided_by: decided ? 'played' : null, results: decided ? [{ user_id: p1, correct: 8, points: 10, finished_at: 'x' }, { user_id: p2, correct: 3, points: 4, finished_at: 'x' }] : [] });
            next.push(p1);
            losers.push(p2);
        }
        if (decided && round < rounds - 1) losers.forEach(id => places.set(id, (size >> round) + 1));
        if (decided && round === rounds - 1) matches.push({ id: `m${rounds}-1t`, round: rounds, slot: 1, third: true, p1: losers[0], p2: losers[1], winner: finished ? losers[0] : null, decided_by: finished ? 'played' : null, results: [] });
        alive = next;
    }
    if (finished) {
        const final = matches.find(match => match.round === rounds && !match.third);
        const third = matches.find(match => match.third);
        places.set(final.winner, 1).set(final.p2, 2).set(third.winner, 3).set(third.p2, 4);
    }
    const entries = Array.from({ length: size }, (_, i) => entry(`p${i + 1}`, finished ? 'finished' : places.has(`p${i + 1}`) ? 'out' : 'playing', places.get(`p${i + 1}`) || null));
    return { tournament, matches, entries };
};

test('rozmezí míst: skupina vypadlých z velikosti skupiny', () => {
    assert.deepEqual(T.placeRange(5, 4), { from: 5, to: 8, label: '5.–8. místo' });
    assert.deepEqual(T.placeRange(9, 8), { from: 9, to: 16, label: '9.–16. místo' });
    assert.deepEqual(T.placeRange(65, 64), { from: 65, to: 128, label: '65.–128. místo' });
    assert.deepEqual(T.placeRange(3, 1), { from: 3, to: 3, label: '3. místo' });
    assert.equal(T.placeRange(5).label, '5. místo');
    // kolo, ve kterém hráč vypadl (místo v databázi je (velikost >> kolo) + 1)
    assert.deepEqual(T.roundOfPlace(128, 65), { round: 1, third: false });
    assert.deepEqual(T.roundOfPlace(128, 5), { round: 5, third: false });
    assert.deepEqual(T.roundOfPlace(8, 5), { round: 1, third: false });
    assert.deepEqual(T.roundOfPlace(16, 2), { round: 4, third: false });
    assert.deepEqual(T.roundOfPlace(16, 4), { round: 4, third: true });
    assert.equal(T.roundOfPlace(null, 5), null);
});

test('pořadí skončeného turnaje o 128: top 4, pak skupiny od nejvyššího místa, všichni právě jednou', () => {
    const { tournament, entries, matches } = simulate(128, 7, { finished: true });
    const result = T.standings(entries, tournament, matches);
    assert.equal(result.total, 128);
    assert.equal(result.playing.length, 0);
    assert.deepEqual(result.groups.map(g => g.label), ['1.–4. místo', '5.–8. místo', '9.–16. místo', '17.–32. místo', '33.–64. místo', '65.–128. místo']);
    assert.deepEqual(result.groups[0].rows.map(r => [r.entry.user_id, r.place, r.label]), [['p1', 1, 'Vítěz'], ['p65', 2, 'Finále'], ['p33', 3, 'O 3. místo'], ['p97', 4, 'O 3. místo']]);
    assert.deepEqual(result.groups.map(g => g.rows.length), [4, 4, 8, 16, 32, 64]);
    assert.deepEqual(result.groups.map(g => g.roundName), ['', 'Čtvrtfinále', 'Osmifinále', 'Šestnáctifinále', '2. kolo', '1. kolo']);
    const all = result.groups.flatMap(g => g.rows.map(r => r.entry.user_id));
    assert.equal(all.length, 128);
    assert.equal(new Set(all).size, 128, 'bez duplicit');
});

test('pořadí běžícího turnaje: nahoře ještě hrají, pak vypadlí po kolech; přihlášení a vyloučení v pořadí nejsou', () => {
    const { tournament, entries, matches } = simulate(32, 3);
    entries.push({ user_id: 'x1', status: 'excluded', place: null, player: { display_name: 'Vyloučený' } }, { user_id: 'x2', status: 'registered', place: null, player: { display_name: 'Přihlášený' } });
    const result = T.standings(entries, tournament, matches);
    assert.equal(result.total, 32);
    assert.equal(result.playing.length, 4, 'po třech kolech zbývají čtyři');
    assert.ok(result.playing.every(row => row.label === 'Semifinále'));
    assert.deepEqual(result.groups.map(g => [g.from, g.to, g.rows.length, g.roundName]), [[5, 8, 4, 'Čtvrtfinále'], [9, 16, 8, 'Osmifinále'], [17, 32, 16, 'Šestnáctifinále']]);
    const ids = [...result.playing.map(r => r.entry.user_id), ...result.groups.flatMap(g => g.rows.map(r => r.entry.user_id))];
    assert.equal(new Set(ids).size, 32);
    assert.ok(!ids.includes('x1') && !ids.includes('x2'));
});

test('pořadí: semifinalisté poražení čekají na zápas o 3. místo a jsou mezi těmi, kdo ještě hrají', () => {
    const { tournament, entries, matches } = simulate(8, 2);
    const result = T.standings(entries, tournament, matches);
    assert.deepEqual(result.playing.map(r => [r.entry.user_id, r.label]).sort(), [['p1', 'Finále'], ['p3', 'O 3. místo'], ['p5', 'Finále'], ['p7', 'O 3. místo']]);
    assert.deepEqual(result.groups.map(g => g.label), ['5.–8. místo']);
});

test('pavouk o 32: sloupce kol, sourozenecké zápasy vedle sebe, vítěz doprostřed, budoucí karty bez zápasu', () => {
    const { tournament, matches } = simulate(32, 3);
    const bracket = T.bracketColumns(matches, tournament, 'p5');
    assert.deepEqual(bracket.columns.map(c => c.name), ['Šestnáctifinále', 'Osmifinále', 'Čtvrtfinále', 'Semifinále', 'Finále']);
    assert.deepEqual(bracket.columns.map(c => c.cards.length), [16, 8, 4, 2, 1]);
    assert.deepEqual(bracket.columns.map(c => c.day), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    assert.deepEqual(bracket.columns.map(c => c.current), [false, false, false, true, false]);
    // karta s v kole c má hráče z karet 2s−1 a 2s předchozího sloupce
    for (let c = 1; c < bracket.columns.length; c++) {
        bracket.columns[c].cards.forEach((card, i) => {
            assert.equal(card.slot, i + 1);
            assert.equal(card.p1, bracket.columns[c - 1].cards[2 * i].winner);
            assert.equal(card.p2, bracket.columns[c - 1].cards[2 * i + 1].winner);
        });
    }
    assert.equal(bracket.columns[0].cards[0].exists, true);
    assert.equal(bracket.columns[4].cards[0].exists, false, 'finále ještě není založené');
    assert.equal(bracket.columns[4].cards[0].p1, null);
    assert.equal(bracket.champion, null);
    assert.equal(bracket.third.exists, false);
    assert.equal(bracket.third.p1, null);
    // skóre z výsledků; zápas bez výsledků má správné odpovědi null (v kartě „—“)
    assert.deepEqual(bracket.columns[0].cards[0].sides.map(s => [s.id, s.correct, s.won, s.lost]), [['p1', 8, true, false], ['p2', 3, false, true]]);
    assert.deepEqual(bracket.columns[3].cards[0].sides.map(s => [s.correct, s.won, s.lost]), [[null, false, false], [null, false, false]]);
});

test('pavouk: moje karty, karta, která na mě čeká, a cesta hráče', () => {
    const { tournament, matches } = simulate(32, 3);
    // p5 vyhrál kola 1 a 2, ve čtvrtfinále prohrál s p1
    const bracket = T.bracketColumns(matches, tournament, 'p5');
    assert.deepEqual(bracket.columns.flatMap(c => c.cards).filter(card => card.mine).map(card => card.key), ['1-3', '2-2', '3-1']);
    assert.equal(bracket.focusRound, 3);
    assert.equal(bracket.columns.flatMap(c => c.cards).filter(card => card.waits).length, 0, 'vypadlý hráč nic nečeká');
    // p1 hraje semifinále; čeká ho finále
    const first = T.bracketColumns(matches, tournament, 'p1');
    assert.equal(first.focusRound, 4);
    assert.deepEqual(first.columns.flatMap(c => c.cards).filter(card => card.mine).map(card => card.key), ['1-1', '2-1', '3-1', '4-1']);
    assert.deepEqual(first.columns.flatMap(c => c.cards).filter(card => card.waits).map(card => card.key), ['5-1']);
    const path = T.playerPath(first, 'p1');
    assert.deepEqual([...path.keys], ['1-1', '2-1', '3-1', '4-1']);
    assert.deepEqual([...path.won], ['1-1', '2-1', '3-1'], 'semifinále ještě nevyhrál');
    assert.equal(T.playerPath(first, '').keys.size, 0);
    // divák: pavouk se zaměří na běžící kolo
    assert.equal(T.bracketColumns(matches, tournament, '').focusRound, 4);
});

test('pavouk skončeného turnaje o 8: vítěz, zápas o 3. místo, cesta hráče i přes zápas o 3. místo', () => {
    const { tournament, matches } = simulate(8, 3, { finished: true });
    const bracket = T.bracketColumns(matches, tournament, 'p1');
    assert.deepEqual(bracket.columns.map(c => c.name), ['Čtvrtfinále', 'Semifinále', 'Finále']);
    assert.equal(bracket.champion, 'p1');
    assert.equal(bracket.third.exists, true);
    assert.equal(bracket.third.key, 'third');
    assert.equal(bracket.third.winner, 'p3');
    assert.ok(bracket.columns.every(c => !c.current), 'turnaj skončil');
    const path = T.playerPath(bracket, 'p3');
    assert.deepEqual([...path.keys], ['1-2', '2-1', 'third']);
    assert.deepEqual([...path.won], ['1-2', 'third']);
});

test('pavouk: od kdy se ukazuje (zbývá 16 hráčů) a zkrácené dny', () => {
    assert.equal(T.bracketStartRound({ size: 128, rounds: 7 }), 4);
    assert.equal(T.bracketStartRound({ size: 64, rounds: 6 }), 3);
    assert.equal(T.bracketStartRound({ size: 32, rounds: 5 }), 2);
    assert.equal(T.bracketStartRound({ size: 16, rounds: 4 }), 1);
    assert.equal(T.bracketStartRound({ size: 8, rounds: 3 }), 1);
    assert.equal(T.dayShort('2026-11-10', '2026-11-10'), 'dnes');
    assert.equal(T.dayShort('2026-11-11', '2026-11-10'), 'zítra');
    assert.equal(T.dayShort('2026-11-13', '2026-11-10'), 'pá 13. 11.');
    assert.deepEqual(T.bracketColumns([], { size: null, rounds: null }), { columns: [], third: null, champion: null, focusRound: 0 });
});

test('přesné pořadí vypadlých: víc bodů celkem, při shodě menší celkový čas, pak dřívější přihlášení', () => {
    const tournament = { id: 't', size: 8, rounds: 3, status: 'finished', seed: 's', started_on: '2026-11-09' };
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const place = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 5, g: 5, h: 5 };
    const entries = ids.map((id, i) => ({ user_id: id, status: 'finished', place: place[id], joined_at: `2026-11-02T08:0${i}:00Z`, player: { display_name: id.toUpperCase() } }));
    const done = (round, slot, p1, p2, r1, r2, third = false) => ({ id: `${round}-${slot}`, round, slot, third, p1, p2, winner: p1, results: [
        { user_id: p1, finished_at: 'x', points: r1[0], time_ms: r1[1], correct: 5 }, { user_id: p2, finished_at: 'x', points: r2[0], time_ms: r2[1], correct: 4 }] });
    // čtvrtfinále: e–a, f–b, g–c, h–d; poražení e, f, g, h mají body 20, 24, 24, 22 a časy 50 s, 80 s, 60 s, 40 s
    const matches = [done(1, 1, 'a', 'e', [30, 40000], [20, 50000]), done(1, 2, 'b', 'f', [30, 40000], [24, 80000]), done(1, 3, 'c', 'g', [30, 40000], [24, 60000]), done(1, 4, 'd', 'h', [30, 40000], [22, 40000])];
    const result = T.standings(entries, tournament, matches);
    const group = result.groups.find(g => g.key === 'p5');
    assert.deepEqual(group.rows.map(r => [r.entry.user_id, r.place, r.points]), [['g', 5, 24], ['f', 6, 24], ['h', 7, 22], ['e', 8, 20]], 'body, při shodě čas (g 60 s před f 80 s)');
    assert.equal(group.individual, true);
    assert.equal(T.formatDuration(group.rows[0].timeMs), '1:00');
    // při úplné shodě rozhoduje dřívější přihlášení
    const tie = [done(1, 1, 'a', 'e', [30, 1], [20, 5000]), done(1, 2, 'b', 'f', [30, 1], [20, 5000])];
    const tied = T.standings(entries, tournament, tie).groups.find(g => g.key === 'p5').rows.map(r => r.entry.user_id);
    assert.deepEqual(tied.slice(0, 2), ['e', 'f']);
});

test('lastDecidedRound: poslední kolo, ve kterém jsou všechny hlavní zápasy rozhodnuté', () => {
    const matches = [{ round: 1, slot: 1, winner: 'a' }, { round: 1, slot: 2, winner: 'b' }, { round: 2, slot: 1, winner: null }, { round: 2, slot: 2, winner: 'c' }, { round: 3, slot: 1, third: true, winner: 'x' }];
    assert.equal(T.lastDecidedRound(matches), 1);
    assert.equal(T.lastDecidedRound([]), 0);
    assert.equal(T.lastDecidedRound(matches.map(match => ({ ...match, winner: match.winner || 'z' }))), 2, 'zápas o 3. místo se nepočítá');
});
