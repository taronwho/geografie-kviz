// Testy úrovní a okruhů tématu Výtvarné umění na skutečných datech (data/umeni.json): Základní (k: 1), Mudrlant, Mudrlant Expert (x: 1)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'umeni.json'), 'utf8'));
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id, tier = 'expert') => core.filterItems(data.items, { tier, collection: id });
const names = (list) => list.map(item => item.n);
const share = (list, check) => list.filter(check).length / list.length;
// Stejný klíč jména jako nameKey ve scripts/build-umeni.mjs (bez „sv.“)
const nameKey = (name) => name.toLocaleLowerCase('cs').replace(/(?<!\p{L})(?:sv\.|svat(?:ý|á|é|í|ých))\s*/gu, '').replace(/\s+/g, ' ').trim();
// Stejné pravidlo jako knownFloor ve scripts/lib/umeni-levels.mjs
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));

test('umění: tři úrovně – podíl známých a expertních v tématu i v každé kategorii', () => {
    assert.ok(data.items.every(item => !(item.k === 1 && item.x)), 'známá položka není zároveň expertní');
    const known = share(data.items, item => item.k === 1);
    const expert = share(data.items, item => item.x === 1);
    assert.ok(known >= 0.24 && known <= 0.32, `Základní ${known}`);
    assert.ok(expert >= 0.18 && expert <= 0.3, `Expert ${expert}`);
    for (const category of ['obrazy', 'sochy', 'umelci', 'fotografove', 'ilustratori', 'smery']) {
        const list = data.items.filter(item => item.c === category);
        assert.ok(share(list, item => item.k === 1) >= 0.2, `${category}: málo známých`);
        assert.ok(share(list, item => item.x === 1) <= 0.3, `${category}: moc expertních`);
    }
    // Nejslavnější díla a umělci jsou Základní, česká klasika taky; méně známá díla jsou pro experty
    for (const name of ['Mona Lisa', 'Poslední večeře', 'Výkřik', 'Myslitel', 'Pablo Picasso', 'Alfons Mucha', 'Josef Lada', 'Slovanská epopej']) {
        assert.equal(find(name).k, 1, `${name} je známé`);
    }
    for (const item of data.items.filter(item => item.x)) assert.ok(!['Mona Lisa', 'Leonardo da Vinci'].includes(item.n));
});

test('umění: každý okruh od 8 položek má aspoň max(3, 25 %) známých a nejvýš 40 % expertních', () => {
    for (const collection of data.collections) {
        const all = inCollection(collection.id);
        if (all.length < 8) continue;
        const known = inCollection(collection.id, 'known').length;
        assert.ok(known >= knownFloor(all.length), `${collection.id}: ${known} známých z ${all.length}`);
        assert.ok(all.filter(item => item.x).length <= Math.ceil(0.4 * all.length), `${collection.id}: příliš expertních`);
    }
});

test('umění: okruhy směrů a sbírek nejsou vyhladovělé', () => {
    const sizes = {
        gotika: 40, realismus: 90, secese: 90, impresionismus: 100, 'klasicismus-romantismus': 100, 'pravek-starovek': 50,
        'ng-praha': 30, uffizi: 22, louvre: 34, renesance: 188, baroko: 122, 'moderni-umeni': 141, 'ceske-umeni': 232
    };
    for (const [id, min] of Object.entries(sizes)) assert.ok(inCollection(id).length >= min, `${id}: ${inCollection(id).length}`);
    // Gotika i podle doby vzniku (bez směru ve Wikidatech), ne ruské ikony ani renesance
    for (const name of ['Cimabue', 'Krumlovská madona', 'Madona zbraslavská', 'Vyšebrodský cyklus', 'Mistr třeboňského oltáře']) assert.ok(names(inCollection('gotika')).includes(name), name);
    assert.ok(!inCollection('gotika').some(item => item.ty === 'ikona' || ['Mona Lisa', 'Masaccio', 'Luca Signorelli', 'Giovanni Antonio Bazzi'].includes(item.n)));
    // Pravěk a starověk: díla do roku 500 a antičtí sochaři
    for (const name of ['Věstonická venuše', 'Láokoón a jeho synové', 'Diskobolos', 'Feidiás']) assert.ok(names(inCollection('pravek-starovek')).includes(name), name);
    assert.ok(!data.items.some(item => /papyrus|stéla|nápis/iu.test(item.ty || '')), 'papyry a nápisy nejsou výtvarná díla');
    // Národní galerie v Praze: gotické desky s jedinou jazykovou verzí
    for (const name of ['Madona zbraslavská', 'Madona z Vyššího Brodu', 'Madona roudnická']) assert.ok(names(inCollection('ng-praha')).includes(name), name);
});

test('umění: stejnojmenná díla – druhé dostane autora do názvu a otázku na autora ne', () => {
    const same = data.items.filter(item => / – /.test(item.n) && (item.c === 'obrazy' || item.c === 'sochy'));
    assert.ok(same.length >= 3, `stejnojmenných ${same.length}`);
    for (const item of same) {
        const [base, author] = item.n.split(' – ');
        assert.equal(item.f.by, author, item.n);
        assert.ok(!item.f.bq, `${item.n}: otázka na autora by ho prozradila`);
        assert.ok((item.al || []).includes(base), `${item.n}: původní název platí jako odpověď`);
        assert.ok(data.items.some(other => nameKey(other.n) === nameKey(base) && (other.c === 'obrazy' || other.c === 'sochy')), `${item.n}: chybí dílo ${base}`);
    }
    // Nápověda „další díla“ u umělce autora v názvu nenese
    for (const artist of data.items.filter(item => item.c === 'umelci')) {
        for (const work of artist.f.works || []) assert.ok(!work.includes(artist.n), `${artist.n}: ${work}`);
    }
    assert.ok(names(inCollection('uffizi')).filter(name => /^Klanění tří králů/.test(name)).length >= 2);
});
