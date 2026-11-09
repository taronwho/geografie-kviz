// Testy úrovní a okruhů tématu Hudba na skutečných datech (data/hudba.json): Základní (k: 1), Mudrlant, Mudrlant Expert (x: 1)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hudba.json'), 'utf8'));
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id, tier = 'expert') => core.filterItems(data.items, { tier, collection: id });
const names = (list) => list.map(item => item.n);
const share = (list, check) => list.filter(check).length / list.length;
// Stejné pravidlo jako knownFloor ve scripts/lib/hudba-levels.mjs
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));

test('hudba: tři úrovně – podíl známých a expertních v tématu i v každé kategorii', () => {
    assert.ok(data.items.every(item => !(item.k === 1 && item.x)), 'známá položka není zároveň expertní');
    const known = share(data.items, item => item.k === 1);
    const expert = share(data.items, item => item.x === 1);
    assert.ok(known >= 0.24 && known <= 0.32, `Základní ${known}`);
    assert.ok(expert >= 0.18 && expert <= 0.3, `Expert ${expert}`);
    for (const category of ['skladatele', 'hudebnici', 'kapely', 'dila', 'opery']) {
        const list = data.items.filter(item => item.c === category);
        assert.ok(share(list, item => item.k === 1) >= 0.22, `${category}: málo známých`);
        assert.ok(share(list, item => item.x === 1) <= 0.35, `${category}: moc expertních`);
    }
});

test('hudba: každý okruh od 8 položek má aspoň max(3, 25 %) známých a nejvýš 40 % expertních', () => {
    for (const collection of data.collections) {
        const all = inCollection(collection.id);
        if (all.length < 8) continue;
        const known = inCollection(collection.id, 'known').length;
        assert.ok(known >= knownFloor(all.length), `${collection.id}: ${known} známých z ${all.length}`);
        assert.ok(all.filter(item => item.x).length <= Math.ceil(0.4 * all.length), `${collection.id}: příliš expertních`);
    }
});

test('hudba: žánrové a dobové okruhy nejsou vyhladovělé', () => {
    const sizes = {
        elektronicka: 80, 'folk-country': 90, 'jazz-blues': 100, 'hip-hop': 120, 'rnb-soul': 120, 'leta-70': 200, reggae: 20,
        renesance: 20, baroko: 60, klasicismus: 45, romantismus: 150, 'hudba-20-stoleti': 200,
        'cesti-skladatele': 65, 'ceska-dila': 90, 'ceske-opery': 75, muzikaly: 50, 'balet-a-muzikal': 75, 'slovenska-hudba': 45
    };
    for (const [id, min] of Object.entries(sizes)) assert.ok(inCollection(id).length >= min, `${id}: ${inCollection(id).length}`);
    for (const name of ['Skrillex', 'Tiësto', 'Fatboy Slim', 'Darude', 'Kygo', 'Daft Punk']) assert.ok(names(inCollection('elektronicka')).includes(name), name);
    for (const name of ['Daft Punk', 'Avicii', 'David Guetta']) assert.equal(find(name).k, 1, `${name} je známý`);
    // Okruhy období podle středu tvorby: Beethoven v klasicismu, Telemann v baroku; díla podle skladatele
    assert.ok(names(inCollection('klasicismus')).includes('Ludwig van Beethoven') && names(inCollection('baroko')).includes('Georg Philipp Telemann'));
    assert.ok(names(inCollection('klasicismus')).includes('Malá noční hudba') && names(inCollection('klasicismus')).includes('Kouzelná flétna'));
    assert.ok(!names(inCollection('baroko')).includes('Wolfgang Amadeus Mozart'));
    // Hudba bez žánru (písně, alba, muzikály) do období nepatří
    for (const period of ['renesance', 'baroko', 'klasicismus', 'romantismus', 'hudba-20-stoleti']) {
        assert.ok(!inCollection(period).some(item => ['píseň', 'album', 'muzikál'].includes(item.ty)), period);
    }
});

test('hudba: opery a muzikály – správný druh, české opery, slovenská hudba', () => {
    // Muzikál není „skladba“ a je mezi jevištními díly
    for (const name of ['Pomáda', 'My Fair Lady', 'Mary Poppins', 'Dracula', 'Chicago', 'Krysař']) {
        assert.equal(find(name)?.c, 'opery', name);
        assert.equal(find(name).ty, 'muzikál', name);
    }
    assert.ok(!data.items.some(item => item.c === 'dila' && item.ty === 'skladba' && /muzikál/u.test(item.d || '')), 'muzikál mezi skladbami');
    for (const name of ['Hubička', 'Dimitrij', 'Prodaná nevěsta', 'Věc Makropulos']) assert.ok(names(inCollection('ceske-opery')).includes(name), name);
    for (const item of data.items.filter(item => item.c === 'opery')) assert.ok(item.d && item.f.year !== undefined, `${item.n}: popis a rok premiéry`);
    // Slovenská hudba: slovenští zpěváci a kapely, ne mezi českými díly
    for (const name of ['Elán', 'Miroslav Žbirka', 'Marika Gombitová', 'Pavol Habera', 'Eugen Suchoň']) assert.ok(names(inCollection('slovenska-hudba')).includes(name), name);
    assert.ok(!inCollection('ceske-opery').some(item => names(inCollection('slovenska-hudba')).includes(item.n)), 'slovenské dílo mezi českými');
    assert.ok(inCollection('slovenska-hudba', 'known').length >= 12);
    // Doplněné osoby a kapely mají fotku
    assert.ok(share(data.items.filter(item => ['skladatele', 'hudebnici', 'kapely'].includes(item.c)), item => item.im) >= 0.97);
});
