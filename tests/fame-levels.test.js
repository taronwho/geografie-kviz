// Úrovně obtížnosti podle známosti (scripts/lib/fame-levels.mjs) – témata Vlajky a znaky, Geologie a Mytologie
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');

const load = (topic) => require(path.join(__dirname, '..', 'data', `${topic}.json`));
const floorOf = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));

test('fame-levels: pořadí známosti, známé, spodní hranice okruhu, experti a horní hranice expertů', async () => {
    const { assignLevels, fameRanks, levelGroups } = await import('../scripts/lib/fame-levels.mjs');
    // Pořadí: průměr pořadí podle jazykových verzí a návštěvnosti (váha návštěvnosti 0,5)
    const a = { sl: 100, pv: 10 }, b = { sl: 50, pv: 1000 }, c = { sl: 10, pv: 1 };
    const ranks = fameRanks([a, b, c]);
    assert.equal(ranks.get(c), 1);
    assert.ok(ranks.get(a) === ranks.get(b));
    assert.ok(fameRanks([a, b, c], 0.9).get(b) < fameRanks([a, b, c], 0.9).get(a), 's vyšší vahou návštěvnosti vede b');
    // 20 položek jedné skupiny, jedna ručně známá, jedna nikdy známá; okruh z 12 nejméně známých
    const items = Array.from({ length: 20 }, (_, i) => ({ q: `Q${i}`, n: `P${i}`, c: 'x', k: i === 19 ? 1 : 0, _: { sl: 100 - i, pv: 1000 - i * 10, pool: 'x', never: i === 0, protect: i === 18 } }));
    for (const item of items.slice(8)) item.g = ['okruh'];
    const promoted = assignLevels(items, { expertShare: () => 0.3, ceiling: () => 0.7, groups: levelGroups(items, [{ id: 'okruh' }]), expertMax: 0.45 });
    const byName = (name) => items.find(item => item.n === name);
    assert.equal(byName('P19').k, 1, 'ručně známá zůstane');
    assert.equal(byName('P0').k, 0, 'nikdy známá ani na spodní hranici');
    // Okruh 12 položek potřebuje 3 známé: P19 a dvě nejznámější z okruhu (P8, P9)
    // Kategorie (20) potřebuje 5 známých: doplní se nejznámější mimo okruh (P1, P2), ne P0
    assert.deepEqual(promoted.map(([group, name]) => `${group}:${name}`), ['okruh:P8', 'okruh:P9', 'c:x:P1', 'c:x:P2']);
    assert.deepEqual(items.filter(item => item.k === 1).map(item => item.n).sort(), ['P1', 'P19', 'P2', 'P8', 'P9']);
    // Experti: nejméně známých 30 % skupiny bez známých a chráněných; v okruhu nejvýš 45 %
    const experts = items.filter(item => item.x).map(item => item.n);
    assert.ok(!experts.includes('P18') && !experts.includes('P19'), experts.join(', '));
    assert.ok(experts.includes('P17') && experts.length <= Math.floor(12 * 0.45), experts.join(', '));
    assert.ok(items.every(item => !(item.k === 1 && item.x)), 'známá položka není pro experty');
});

for (const topic of ['geologie', 'mytologie']) {
    test(`${topic}: úrovně Základní, Mudrlant a Expert v každém okruhu`, () => {
        const data = load(topic);
        const known = data.items.filter(item => core.levelOf(item) === 1).length;
        const expert = data.items.filter(item => core.levelOf(item) === 3).length;
        const share = (n) => n / data.items.length;
        assert.ok(share(known) >= 0.2 && share(known) <= 0.36, `${topic}: Základní ${known}/${data.items.length}`);
        assert.ok(share(expert) >= 0.15 && share(expert) <= 0.32, `${topic}: Expert ${expert}/${data.items.length}`);
        assert.ok(data.items.every(item => !(item.k === 1 && item.x)), 'známá položka není pro experty');
        for (const collection of data.collections) {
            const members = core.filterItems(data.items, { collection: collection.id });
            const experts = members.filter(item => core.levelOf(item) === 3).length;
            assert.ok(experts <= Math.floor(members.length * 0.45) + 1, `${collection.id}: expertů ${experts}/${members.length}`);
            // Základní úroveň: v okruhu aspoň pár otázek (kde to známost dovolí, aspoň max(3, 25 %))
            if (members.length >= 8) assert.ok(members.filter(item => item.k === 1).length >= Math.min(3, floorOf(members.length)), `${collection.id}: známých málo`);
        }
    });
}
