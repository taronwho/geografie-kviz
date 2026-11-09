// Chemie: úrovně obtížnosti (Základní / Mudrlant / Expert) a velikost okruhů na skutečných datech (data/chemie.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chemie.json'), 'utf8'));
// Stejné pravidlo jako knownFloor ve scripts/lib/zemepis-levels.mjs (používá ho scripts/lib/veda-levels.mjs)
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));
const inGroup = (id) => data.items.filter(item => (item.g || []).includes(id));
const level = (item) => core.levelOf(item);
const share = (list, value) => list.filter(item => level(item) === value).length / list.length;
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};

test('chemie – úrovně: Základní, Mudrlant a Expert v rozumném poměru', () => {
    for (const item of data.items) {
        assert.ok(item.k === 0 || item.k === 1, `${item.n}: k`);
        assert.ok(item.x === undefined || (item.x === 1 && item.k === 0), `${item.n}: x jen u neznámých`);
    }
    const all = data.items;
    assert.ok(share(all, 1) >= 0.24 && share(all, 1) <= 0.34, `Základní ${share(all, 1)}`);
    assert.ok(share(all, 3) >= 0.18 && share(all, 3) <= 0.32, `Expert ${share(all, 3)}`);
    assert.ok(share(all, 2) >= 0.4, `Mudrlant ${share(all, 2)}`);
    for (const category of new Set(all.map(item => item.c))) {
        const members = all.filter(item => item.c === category);
        assert.ok(share(members, 1) >= 0.2, `kategorie ${category}: Základní ${share(members, 1)}`);
        assert.ok(share(members, 2) >= 0.2, `kategorie ${category}: Mudrlant ${share(members, 2)}`);
        assert.ok(share(members, 3) >= 0.1, `kategorie ${category}: Expert ${share(members, 3)}`);
    }
});

test('chemie – úrovně: v každém okruhu aspoň čtvrtina známých, nejvýš 45 % pro experty', () => {
    const short = data.collections.map(collection => [collection.label, inGroup(collection.id)])
        .filter(([, members]) => members.filter(item => item.k === 1).length < knownFloor(members.length))
        .map(([label, members]) => `${label}: ${members.filter(item => item.k === 1).length}/${members.length}`);
    assert.deepEqual(short, []);
    const expert = data.collections.filter(collection => share(inGroup(collection.id), 3) > 0.46).map(collection => collection.id);
    assert.deepEqual(expert, []);
    // Jmenné reakce a zákony měly dřív skoro nic známého
    for (const id of ['jmenne-reakce', 'zakony', 'metody', 'lanthanoidy', 'leciva']) assert.ok(share(inGroup(id), 1) >= 0.25, id);
});

test('chemie – úrovně: školní chemie je známá, okrajové položky pro experty', () => {
    for (const name of ['Vodík', 'Kyslík', 'Uhlík', 'Železo', 'Zlato', 'Uran', 'Voda', 'Oxid uhličitý', 'Chlorid sodný', 'Kyselina sírová', 'Hydroxid sodný',
        'Ethanol', 'Methan', 'Glukóza', 'Vitamín C', 'Inzulin', 'Destilace', 'Kyselina acetylsalicylová']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    // Prvky do stroncia jsou známé vždy, supertěžké prvky pro experty
    assert.ok(data.items.filter(item => item.c === 'prvky' && item.f.z <= 38).every(item => item.k === 1));
    const superheavy = data.items.filter(item => item.c === 'prvky' && item.f.z >= 104);
    assert.ok(superheavy.every(item => item.k === 0) && share(superheavy, 3) >= 0.75, 'supertěžké prvky');
    for (const id of ['oxidy', 'uhlovodiky', 'jmenne-reakce', 'metody']) assert.ok(share(inGroup(id), 3) >= 0.15, `${id}: experti`);
});

test('chemie – okruhy: dost položek i v dřív malých okruzích, bez izomerů a nesmyslů', () => {
    const minimum = { oxidy: 95, uhlovodiky: 95, leciva: 80, hormony: 40, cukry: 30, alkoholy: 33, aminokyseliny: 30, hydroxidy: 20, vitaminy: 20,
        'typy-reakci': 125, 'prumyslove-procesy': 28, zakony: 30, metody: 70 };
    const small = Object.entries(minimum).filter(([id, min]) => inGroup(id).length < min).map(([id, min]) => `${id}: ${inGroup(id).length} < ${min}`);
    assert.deepEqual(small, []);
    const ids = data.items.map(item => item.q);
    assert.equal(new Set(ids).size, ids.length, 'každá položka jednou');
    assert.equal(new Set(data.items.map(item => item.n.toLowerCase())).size, data.items.length, 'jména se neopakují');
    // Dvacet stavebních aminokyselin, žádná léčiva ani herbicidy mezi aminokyselinami
    const amino = inGroup('aminokyseliny').map(item => item.n);
    for (const name of ['Lysin', 'Methionin', 'Prolin', 'Asparagin', 'Kyselina glutamová', 'Threonin']) assert.ok(amino.includes(name), name);
    for (const name of ['Glyfosát', 'Fencyklidin', 'Fenobarbital', 'Lamotrigin', 'Dextrometorfan']) assert.ok(!amino.includes(name), name);
    // Bílkovinné hormony podle názvu článku
    for (const name of ['Růstový hormon', 'Parathormon', 'Erythropoetin']) assert.ok(inGroup('hormony').some(item => item.n === name), name);
    // Doplněné uhlovodíky nejsou polohové izomery ani radikály
    assert.ok(!data.items.some(item => /radikál/iu.test(item.n) && item.c === 'latky'));
    for (const item of data.items.filter(other => other.c === 'latky')) assert.ok(item.t && (item.f.formula || /vitam|hormon/iu.test((item.g || []).join())), `${item.n}: vzorec`);
});
