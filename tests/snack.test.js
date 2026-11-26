// Jednohubka (snack.js): série správných v řadě bez trestu, malé XP s denním stropem, uložený stav a texty
const test = require('node:test');
const assert = require('node:assert/strict');
const Snack = require('../snack.js');

const DAY = '2026-11-26';
const NEXT = '2026-11-27';
const play = (answers, state = Snack.EMPTY, day = DAY) => answers.reduce((acc, correct) => {
    const outcome = Snack.answer(acc.state, correct, day);
    return { state: outcome.state, outcomes: [...acc.outcomes, outcome] };
}, { state, outcomes: [] });

test('správná odpověď prodlouží sérii a dá 3 XP, chyba sérii jen ukončí a dá 1 XP za pokus', () => {
    const { state, outcomes } = play([true, true, true, false, true]);
    assert.deepEqual(outcomes.map(o => o.streak), [1, 2, 3, 0, 1]);
    assert.deepEqual(outcomes.map(o => o.xp.total), [3, 3, 3, 1, 3]);
    assert.deepEqual(outcomes[3].xp.parts, [{ label: 'za pokus', xp: 1 }]);
    assert.deepEqual(outcomes[0].xp.parts, [{ label: 'za správnou odpověď', xp: 3 }]);
    assert.equal(outcomes[3].ended, 3, 'chyba ukončila sérii 3');
    assert.equal(outcomes[4].ended, 0);
    assert.deepEqual({ played: state.played, correct: state.correct, streak: state.streak, best: state.best, past: state.past, xp: state.xp }, { played: 5, correct: 4, streak: 1, best: 3, past: 3, xp: 13 });
});

test('nová nejlepší série se slaví, jen když překoná dřívější (první série rekord teprve založí)', () => {
    const first = play([true, true]);
    assert.deepEqual(first.outcomes.map(o => o.record), [false, false]);
    const again = play([false, true, true, true, true], first.state);
    assert.deepEqual(again.outcomes.map(o => o.record), [false, false, false, true, false], 'slaví se jednou, při překonání');
    assert.equal(again.state.best, 4);
});

test('denní strop XP: po 30 XP už nic, série běží dál; další den znovu', () => {
    const answers = Array(12).fill(true);
    const { state, outcomes } = play(answers);
    assert.equal(state.xp, Snack.DAILY_XP_CAP);
    assert.equal(outcomes.reduce((sum, o) => sum + o.xp.total, 0), 30);
    assert.equal(outcomes[9].xp.total, 3);
    assert.match(outcomes[9].xp.note, /^$/);
    assert.equal(outcomes[10].xp.total, 0);
    assert.deepEqual(outcomes[10].xp.parts, []);
    assert.match(outcomes[10].xp.note, /vyčerpaný – série se počítá dál/);
    assert.equal(outcomes[11].streak, 12);
    assert.equal(Snack.xpLeftToday(state, DAY), 0);
    assert.equal(Snack.xpLeftToday(state, NEXT), 30);
    // Strop naplněný jen zčásti (29 + 3 → 1)
    const partial = Snack.answer({ ...state, xp: 29 }, true, DAY);
    assert.equal(partial.xp.total, 1);
    assert.match(partial.xp.note, /naplněný/);
    // Další den: XP od nuly, série nepřerušená
    const tomorrow = Snack.answer(state, true, NEXT);
    assert.equal(tomorrow.xp.total, 3);
    assert.equal(tomorrow.streak, 13);
    assert.equal(tomorrow.state.day, NEXT);
});

test('uložený stav: neplatná data se vyčistí, nejlepší série není menší než současná', () => {
    assert.deepEqual(Snack.parse(null), { ...Snack.EMPTY });
    assert.deepEqual(Snack.parse('x'), { ...Snack.EMPTY });
    assert.deepEqual(Snack.parse([1]), { ...Snack.EMPTY });
    const parsed = Snack.parse({ day: '2026-11-26', xp: 12.7, played: 5, correct: 9, streak: 4, best: 2, past: 9, extra: 1 });
    assert.deepEqual(parsed, { v: 1, day: '2026-11-26', xp: 12, played: 5, correct: 5, streak: 4, best: 4, past: 4 });
    assert.equal(Snack.parse({ day: 'zítra', xp: -5, streak: NaN }).day, '');
    assert.equal(Snack.parse({ xp: -5 }).xp, 0);
    // Odpověď na rozbitý stav nespadne
    assert.equal(Snack.answer({ streak: 'x' }, true, DAY).streak, 1);
});

test('texty: čeština podle čísla a vlídný verdikt bez trestu', () => {
    assert.equal(Snack.streakLabel(1), '1 správná v řadě');
    assert.equal(Snack.streakLabel(3), '3 správné v řadě');
    assert.equal(Snack.streakLabel(5), '5 správných v řadě');
    assert.equal(Snack.streakChip(0), 'Nová série');
    assert.equal(Snack.streakChip(7), 'Série 7');
    const [one, two] = play([true, true]).outcomes;
    assert.equal(Snack.verdictText(one, 'Praha'), 'Dobrý začátek série.');
    assert.equal(Snack.verdictText(two, 'Praha'), '2 správné v řadě.');
    const wrong = play([true, true, true, false]).outcomes[3];
    assert.equal(Snack.verdictText(wrong, 'Praha'), 'Správně je Praha. Série 3 skončila, nejlepší zůstává 3.');
    assert.equal(Snack.verdictText(Snack.answer(Snack.EMPTY, false, DAY), 'Brno'), 'Správně je Brno.');
    const record = play([true, false, true, true]).outcomes[3];
    assert.equal(Snack.verdictText(record, 'Praha'), 'Nejlepší série: 2!');
    for (const text of [Snack.streakLabel(2), wrong.xp.note, Snack.answer({ xp: 30, day: DAY }, true, DAY).xp.note]) {
        assert.doesNotMatch(text, /ztratil|ztratila|prohrál|prohrála|trest/i, 'bez trestu a genderově neutrálně');
    }
});

test('ovladač: akce Jednohubky a stav obrazovky bez DOMu', () => {
    const ctl = Snack.createController({ appContent: {}, escapeHtml: String, getScreen: () => 'home', readJson: () => null });
    assert.deepEqual(Object.keys(ctl.actions).sort(), ['snack-again', 'snack-choice', 'snack-done', 'snack-open', 'snack-retry']);
    assert.equal(ctl.calm(), true);
    assert.equal(ctl.playing(), false);
    assert.deepEqual(ctl.place(), { icon: Snack.ICON, text: 'Jednohubka', topic: null, topicArt: false });
});
