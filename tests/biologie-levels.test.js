// Biologie: úrovně obtížnosti (Základní / Mudrlant / Expert) a velikost okruhů na skutečných datech (data/biologie.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'biologie.json'), 'utf8'));
// Stejné pravidlo jako knownFloor ve scripts/lib/zemepis-levels.mjs (používá ho i scripts/lib/biologie-levels.mjs)
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));
const inGroup = (id) => data.items.filter(item => (item.g || []).includes(id));
const level = (item) => core.levelOf(item);
const share = (list, value) => list.filter(item => level(item) === value).length / list.length;
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};

test('biologie – úrovně: Základní, Mudrlant a Expert v rozumném poměru', () => {
    for (const item of data.items) {
        assert.ok(item.k === 0 || item.k === 1, `${item.n}: k`);
        assert.ok(item.x === undefined || (item.x === 1 && item.k === 0), `${item.n}: x jen u neznámých`);
    }
    const all = data.items;
    assert.ok(share(all, 1) >= 0.24 && share(all, 1) <= 0.34, `Základní ${share(all, 1)}`);
    assert.ok(share(all, 3) >= 0.18 && share(all, 3) <= 0.32, `Expert ${share(all, 3)}`);
    assert.ok(share(all, 2) >= 0.4, `Mudrlant ${share(all, 2)}`);
    // Každá kategorie má všechny tři úrovně a aspoň pětinu známých
    for (const category of new Set(all.map(item => item.c))) {
        const members = all.filter(item => item.c === category);
        assert.ok(share(members, 1) >= 0.2, `kategorie ${category}: Základní ${share(members, 1)}`);
        assert.ok(share(members, 2) >= 0.25, `kategorie ${category}: Mudrlant ${share(members, 2)}`);
        assert.ok(share(members, 3) >= 0.1, `kategorie ${category}: Expert ${share(members, 3)}`);
    }
});

test('biologie – úrovně: v každém okruhu aspoň čtvrtina známých (Základní hraje většina hráčů)', () => {
    const short = data.collections.map(collection => [collection.label, inGroup(collection.id)])
        .filter(([, members]) => members.filter(item => item.k === 1).length < knownFloor(members.length))
        .map(([label, members]) => `${label}: ${members.filter(item => item.k === 1).length}/${members.length}`);
    assert.deepEqual(short, []);
    // Okruhy, kde dřív skoro nic známé nebylo
    for (const id of ['orchideje', 'letouni', 'papousci', 'vacnatci', 'lebka', 'svaly', 'kaktusy', 'vyhynule']) {
        const members = inGroup(id);
        assert.ok(members.filter(item => item.k === 1).length >= knownFloor(members.length), id);
    }
});

test('biologie – úrovně: známé zůstanou známé, neznámé jsou pro experty', () => {
    // Naše příroda, domácí zvířata a slavní dinosauři nikdy nejsou pro experty
    assert.ok(inGroup('nase-priroda').every(item => item.k === 1), 'naše příroda je známá');
    for (const name of ['Pes domácí', 'Kočka domácí', 'Kůň', 'Tur domácí', 'Lev', 'Slon africký', 'Liška obecná', 'Sýkora koňadra', 'Hřib smrkový',
        'Dub letní', 'Triceratops', 'Tyrannosaurus rex', 'Německý ovčák', 'Srdce', 'Žaludek', 'Lebka', 'Mozek']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    // Povýšit na známé kvůli malému okruhu jde jen dost známý druh: v okruzích doplněných méně známými druhy zbydou i experti
    for (const id of ['lipnicovite', 'orchideje', 'brouci', 'hvezdnicovite', 'papousci', 'psi-plemena', 'svaly']) {
        assert.ok(share(inGroup(id), 3) >= 0.15, `${id}: experti ${share(inGroup(id), 3)}`);
    }
});

test('biologie – okruhy: dost položek i v dřív malých okruzích', () => {
    const minimum = {
        lipnicovite: 80, hvezdnicovite: 100, sovy: 50, zraloci: 50, blanokridli: 42, brouci: 90, orchideje: 50, letouni: 50,
        ruzovite: 100, papousci: 100, bobovite: 100, jehlicnany: 100, hlodavci: 100, obojzivelnici: 100, zelvy: 100, primati: 100,
        'domaci-zvirata': 40, 'kocici-plemena': 45, 'fci-honici': 30, 'fci-ovcaci': 45, 'fci-spicove': 33,
        traveni: 28, 'nervova-soustava': 50, lebka: 26
    };
    const small = Object.entries(minimum).filter(([id, min]) => inGroup(id).length < min).map(([id, min]) => `${id}: ${inGroup(id).length} < ${min}`);
    assert.deepEqual(small, []);
});

test('biologie – nové položky splňují pravidla kvality', () => {
    const ids = data.items.map(item => item.q);
    assert.equal(new Set(ids).size, ids.length, 'každá položka jednou');
    const names = data.items.map(item => `${item.c}|${item.n.toLocaleLowerCase('cs')}`);
    assert.equal(new Set(names).size, names.length, 'jména se v kategorii neopakují');
    for (const item of data.items) {
        assert.ok(item.t && item.n, `${item.q}: článek a jméno`);
        if (!['telo', 'pravek'].includes(item.c)) {
            assert.ok(item.im, `${item.n}: fotka`);
            assert.notEqual(item.n.toLowerCase(), String((item.f || {}).lat || '').toLowerCase(), `${item.n}: jen vědecké jméno`);
        }
    }
    // Žaludek není vnější pohlavní orgán (dřívější filtr na „žalud“ ho vyřadil); žalud penisu v datech není
    assert.equal(find('Žaludek').f.sys, 'trávicí soustava');
    assert.ok(!data.items.some(item => item.c === 'telo' && /^žalud$/iu.test(item.n)));
    // Lebka a dolní čelist jsou kosti hlavy, hlavové nervy patří do nervové soustavy
    assert.ok(inGroup('lebka').some(item => item.n === 'Lebka') && inGroup('lebka').some(item => item.n === 'Dolní čelist'));
    assert.equal(find('Zrakový nerv').ty, 'nerv');
    assert.ok(inGroup('nervova-soustava').includes(find('Bloudivý nerv')));
    assert.ok(inGroup('domaci-zvirata').includes(find('Mula')));
});
