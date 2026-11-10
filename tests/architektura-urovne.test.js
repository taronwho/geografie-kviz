// Testy úrovní a okruhů tématu Architektura na skutečných datech (data/architektura.json): Základní (k: 1), Mudrlant, Mudrlant Expert (x: 1)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'architektura.json'), 'utf8'));
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id, tier = 'expert') => core.filterItems(data.items, { tier, collection: id });
const names = (list) => list.map(item => item.n);
const share = (list, check) => list.filter(check).length / list.length;
// Stejné pravidlo jako knownFloor ve scripts/lib/umeni-levels.mjs
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));

test('architektura: tři úrovně – podíl známých a expertních v tématu i v každé kategorii', () => {
    assert.ok(data.items.every(item => !(item.k === 1 && item.x)), 'známá položka není zároveň expertní');
    const known = share(data.items, item => item.k === 1);
    const expert = share(data.items, item => item.x === 1);
    assert.ok(known >= 0.22 && known <= 0.32, `Základní ${known}`);
    assert.ok(expert >= 0.18 && expert <= 0.3, `Expert ${expert}`);
    for (const category of ['stavby', 'prvky', 'architekti']) {
        const list = data.items.filter(item => item.c === category);
        assert.ok(share(list, item => item.k === 1) >= 0.2, `${category}: málo známých`);
        assert.ok(share(list, item => item.x === 1) <= 0.3, `${category}: moc expertních`);
    }
    // Slohy mají úroveň ručně a nikdy nejsou pro experty
    assert.ok(data.items.filter(item => item.c === 'slohy').every(item => !item.x));
    for (const name of ['Eiffelova věž', 'Karlův most', 'Koloseum', 'Tádž Mahal', 'Antoni Gaudí', 'Jan Kotěra']) assert.equal(find(name).k, 1, `${name} je známé`);
});

test('architektura: každý okruh od 8 položek má aspoň max(3, 25 %) známých a nejvýš 40 % expertních', () => {
    for (const collection of data.collections) {
        const all = inCollection(collection.id);
        if (all.length < 8) continue;
        const known = inCollection(collection.id, 'known').length;
        assert.ok(known >= knownFloor(all.length), `${collection.id}: ${known} známých z ${all.length}`);
        assert.ok(all.filter(item => item.x).length <= Math.ceil(0.4 * all.length), `${collection.id}: příliš expertních`);
    }
});

test('architektura: slohové okruhy a mosty nejsou vyhladovělé (kvóty po slozích)', () => {
    const sizes = {
        secese: 65, romansky: 85, starovek: 65, islamska: 110, klasicismus: 110, renesance: 100, moderna: 140, mosty: 105,
        gotika: 140, baroko: 136, historismus: 143, soucasna: 105
    };
    for (const [id, min] of Object.entries(sizes)) assert.ok(inCollection(id).length >= min, `${id}: ${inCollection(id).length}`);
    // Česká secese a moderna mají vlastní kvótu (v jednom limitu by je přetlačily gotické a barokní kostely)
    assert.ok(inCollection('secese').filter(item => item.cz).length >= 25);
    assert.ok(inCollection('moderna').filter(item => item.cz).length >= 70);
    for (const name of ['Obecní dům', 'Dům U Černé Matky Boží', 'Vila Tugendhat']) assert.ok(find(name), name);
    // Stavby si nechávají souřadnice (mapové otázky zeměpisu)
    assert.ok(share(data.items.filter(item => item.c === 'stavby'), item => item.la !== undefined) >= 0.9);
});
