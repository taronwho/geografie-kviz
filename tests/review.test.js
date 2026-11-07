// Opakování s rozestupy (review.js): intervaly krabiček, co je na řadě, limit karet a uložení
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Review = require('../review.js');

const TODAY = '2026-11-04';

test('špatná odpověď založí kartu v krabičce 0 na zítra, opakovaná chyba ji vrátí na začátek', () => {
    const cards = Review.onAnswer([], 'zemepis:Q1', false, TODAY);
    assert.deepEqual(cards, [{ topic: 'zemepis', q: 'Q1', box: 0, due: '2026-11-05' }]);
    // Správná odpověď den před termínem kartu nemění (není na řadě)
    assert.deepEqual(Review.onAnswer(cards, 'zemepis:Q1', true, TODAY), cards);
    // V opakování (force) se posune vždy
    const forced = Review.onAnswer(cards, 'zemepis:Q1', true, TODAY, { force: true });
    assert.equal(forced[0].box, 1);
    assert.equal(forced[0].due, '2026-11-07');
    const reset = Review.onAnswer(forced, 'zemepis:Q1', false, '2026-11-07');
    assert.deepEqual(reset, [{ topic: 'zemepis', q: 'Q1', box: 0, due: '2026-11-08' }]);
    // Správná odpověď na položku bez karty kartu nezakládá
    assert.deepEqual(Review.onAnswer([], 'zemepis:Q2', true, TODAY), []);
    // Nesmyslný klíč nebo den nic nezmění
    assert.deepEqual(Review.onAnswer(cards, 'bez-dvojtecky', false, TODAY), cards);
    assert.deepEqual(Review.onAnswer(cards, 'zemepis:Q1', false, 'včera'), cards);
});

test('Leitnerovy krabičky: správné odpovědi posouvají termín o 1, 3, 7, 14 a 30 dní, pak karta zmizí', () => {
    assert.deepEqual(Review.INTERVALS, [1, 3, 7, 14, 30]);
    let cards = Review.onAnswer([], 'historie:Q7', false, TODAY);
    let day = TODAY;
    const dues = [];
    for (let i = 0; i < 4; i++) {
        day = cards[0].due;
        cards = Review.onAnswer(cards, 'historie:Q7', true, day);
        assert.equal(cards[0].box, i + 1);
        dues.push(Review.diffDays(cards[0].due, day));
    }
    assert.deepEqual(dues, [3, 7, 14, 30]);
    // Z poslední krabičky správná odpověď kartu odstraní (zvládnuto)
    cards = Review.onAnswer(cards, 'historie:Q7', true, cards[0].due);
    assert.deepEqual(cards, []);
});

test('na řadě jsou karty s termínem dnes nebo dřív; text dalšího opakování', () => {
    const cards = [
        { topic: 'a', q: '1', box: 0, due: '2026-11-03' },
        { topic: 'a', q: '2', box: 1, due: '2026-11-04' },
        { topic: 'b', q: '3', box: 2, due: '2026-11-05' },
        { topic: 'b', q: '4', box: 3, due: '2026-11-09' }
    ];
    assert.deepEqual(Review.dueCards(cards, TODAY).map(Review.keyOf), ['a:1', 'a:2']);
    assert.equal(Review.dueCount(cards, TODAY), 2);
    assert.equal(Review.nextDueText(cards, TODAY), 'další procvičení dnes');
    assert.equal(Review.nextDueText(cards.slice(2), TODAY), 'další procvičení zítra');
    assert.equal(Review.nextDueText(cards.slice(3), TODAY), 'další procvičení za 5 dní');
    assert.equal(Review.nextDueText(cards.slice(3), '2026-11-06'), 'další procvičení za 3 dny');
    assert.equal(Review.nextDueText([], TODAY), '');
    assert.equal(Review.nextDue(cards, TODAY), '2026-11-05');
    assert.equal(Review.summaryText({ mastered: 3, total: 5 }, cards.slice(2), TODAY), 'Zvládnuto 3 z 5, další procvičení zítra');
    assert.equal(Review.summaryText({ mastered: 1, total: 1 }, [], TODAY), 'Zvládnuto 1 z 1');
    assert.equal(Review.cardsWord(1), '1 karta');
    assert.equal(Review.cardsWord(3), '3 karty');
    assert.equal(Review.cardsWord(12), '12 karet');
});

test('dřívější chyby se přidají jako karty na dnes, existující karty zůstanou', () => {
    const cards = [{ topic: 'zemepis', q: 'Q1', box: 2, due: '2026-11-20' }];
    const merged = Review.importMistakes(cards, ['zemepis:Q1', 'historie:Q5', 'nesmysl'], TODAY);
    assert.deepEqual(merged, [cards[0], { topic: 'historie', q: 'Q5', box: 0, due: TODAY }]);
    assert.equal(Review.importMistakes(cards, [], TODAY), cards, 'bez nových chyb stejné pole');
    assert.deepEqual(Review.removeCard(merged, 'historie:Q5'), cards);
    assert.equal(Review.findCard(merged, 'historie:Q5').box, 0);
    assert.equal(Review.findCard(merged, 'x:y'), null);
});

test('limit 500 karet: nejstarší se zahodí', () => {
    assert.equal(Review.LIMIT, 500);
    let cards = [];
    for (let i = 0; i < 505; i++) cards = Review.onAnswer(cards, `t:${i}`, false, TODAY);
    assert.equal(cards.length, 500);
    assert.equal(cards[0].q, '5', 'prvních pět nejstarších zmizelo');
    assert.equal(cards[499].q, '504');
    const imported = Review.importMistakes(cards, ['t:a', 't:b'], TODAY);
    assert.equal(imported.length, 500);
    assert.equal(imported[499].q, 'b');
});

test('serializace: uložené karty se načtou zpět, poškozená data se vyřadí', () => {
    const cards = [{ topic: 'zemepis', q: 'Q1', box: 1, due: '2026-11-07' }, { topic: 'chemie', q: '12', box: 4, due: '2026-12-01' }];
    const parsed = Review.parse(JSON.parse(Review.serialize(cards)));
    assert.deepEqual(parsed, cards);
    assert.deepEqual(Review.parse(null), []);
    assert.deepEqual(Review.parse('x'), []);
    assert.deepEqual(Review.parse([
        null, 'text', { topic: 'a' }, { topic: 'a', q: 'b', box: 9, due: '2026-11-07' }, { topic: 'a', q: 'b', box: 0, due: '2026-11-08' },
        { topic: '', q: 'c', box: 0, due: '2026-11-07' }, { topic: 'a', q: 'c', box: 'x', due: '2026-11-07' }, { topic: 'a', q: 'd', box: 1, due: 'zítra' }
    ]), [{ topic: 'a', q: 'b', box: 4, due: '2026-11-07' }, { topic: 'a', q: 'c', box: 0, due: '2026-11-07' }], 'krabička v mezích, duplicity a špatné dny ven');
    assert.equal(Review.parse(Array.from({ length: 600 }, (_, i) => ({ topic: 'a', q: String(i), box: 0, due: TODAY }))).length, 500);
});

test('review.js je v index.html, v service workeru a v nasazení', () => {
    const root = path.join(__dirname, '..');
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /<script src="review\.js" defer><\/script>/);
    assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /'review\.js'/);
    assert.match(fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8'), /\breview\.js\b/);
});
