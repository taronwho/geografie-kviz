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
