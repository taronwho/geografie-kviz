// Film: úrovně obtížnosti (Základní / Mudrlant / Expert) a velikost okruhů na skutečných datech (data/film.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'film.json'), 'utf8'));
// Stejné pravidlo jako knownFloor ve scripts/lib/zemepis-levels.mjs (používá ho i scripts/lib/film-levels.mjs)
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));
const inGroup = (id) => data.items.filter(item => (item.g || []).includes(id));
const level = (item) => core.levelOf(item);
const share = (list, value) => list.filter(item => level(item) === value).length / list.length;
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};

test('film – úrovně: Základní, Mudrlant a Expert v rozumném poměru', () => {
    for (const item of data.items) {
        assert.ok(item.k === 0 || item.k === 1, `${item.n}: k`);
        assert.ok(item.x === undefined || (item.x === 1 && item.k === 0), `${item.n}: x jen u neznámých`);
    }
    const all = data.items;
    assert.ok(share(all, 1) >= 0.24 && share(all, 1) <= 0.33, `Základní ${share(all, 1)}`);
    assert.ok(share(all, 3) >= 0.18 && share(all, 3) <= 0.32, `Expert ${share(all, 3)}`);
    assert.ok(share(all, 2) >= 0.4, `Mudrlant ${share(all, 2)}`);
    // Každá kategorie má všechny tři úrovně a aspoň pětinu známých
    for (const category of new Set(all.map(item => item.c))) {
        const members = all.filter(item => item.c === category);
        assert.ok(share(members, 1) >= 0.2 && share(members, 1) <= 0.36, `kategorie ${category}: Základní ${share(members, 1)}`);
        assert.ok(share(members, 2) >= 0.3, `kategorie ${category}: Mudrlant ${share(members, 2)}`);
        assert.ok(share(members, 3) >= 0.1, `kategorie ${category}: Expert ${share(members, 3)}`);
        // České položky: aspoň pětina známých, ale ne skoro všechny (u režisérů je ruční seznam nejznámějších delší)
        const czech = members.filter(item => item.cz);
        assert.ok(share(czech, 1) >= 0.2 && share(czech, 1) <= 0.5, `kategorie ${category}, české: Základní ${share(czech, 1)}`);
        assert.ok(share(czech, 2) >= 0.3, `kategorie ${category}, české: Mudrlant ${share(czech, 2)}`);
    }
});

test('film – úrovně: v každém okruhu aspoň čtvrtina známých a nejvýš 45 % pro experty', () => {
    const report = (test) => data.collections.map(collection => [collection.label, inGroup(collection.id)]).filter(([, members]) => test(members))
        .map(([label, members]) => `${label}: ${members.filter(item => item.k === 1).length} známých, ${members.filter(item => item.x).length} expert z ${members.length}`);
    assert.deepEqual(report(members => members.filter(item => item.k === 1).length < knownFloor(members.length)), []);
    assert.deepEqual(report(members => members.filter(item => item.x).length > Math.floor(members.length * 0.45)), []);
    // Malé okruhy nejsou celé známé – úroveň Mudrlant v nich přidá něco nového
    assert.deepEqual(report(members => members.length >= 15 && members.filter(item => item.k === 1).length > members.length * 0.75), []);
});

test('film – úrovně: slavné filmy, seriály a filmaři jsou známí, české podle toho, co Češi znají', () => {
    for (const name of ['Kmotr', 'Titanic', 'Casablanca', 'Star Wars: Epizoda IV – Nová naděje', 'Lví král', 'Simpsonovi', 'Přátelé', 'Steven Spielberg',
        'Charlie Chaplin', 'Pelíšky', 'Tři oříšky pro Popelku', 'S čerty nejsou žerty', 'Arabela', 'O krtkovi', 'Miloš Forman', 'Libuše Šafránková']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    // Známé české televizní pohádky (málo jazykových verzí, ale Češi je znají)
    const fairyTales = inGroup('pohadky').filter(item => item.cz);
    assert.ok(fairyTales.filter(item => item.k === 1).length >= 20, 'známé české pohádky');
    // Perličky: v každé velké kategorii jsou i položky jen pro experty
    for (const category of ['filmy', 'serialy', 'herci', 'reziseri']) {
        assert.ok(data.items.some(item => item.c === category && item.x === 1 && !item.cz), `${category}: zahraniční perličky`);
        assert.ok(data.items.some(item => item.c === category && item.x === 1 && item.cz), `${category}: české perličky`);
    }
});

test('film – okruhy: dost položek i v dřív malých okruzích', () => {
    const minimum = {
        westerny: 50, horory: 120, 'hollywood-klasika': 80, superhrdinove: 95, 'nemy-film': 30, 'oscar-film': 90,
        pohadky: 90, 'zlata-sedesata': 65, 'slovensky-film': 45, 'ceska-animace': 40,
        disney: 65, dreamworks: 35, ghibli: 15, pixar: 25,
        sitcomy: 70, 'krimi-serialy': 100, 'animovane-serialy': 100
    };
    const small = Object.entries(minimum).filter(([id, min]) => inGroup(id).length < min).map(([id, min]) => `${id}: ${inGroup(id).length} < ${min}`);
    assert.deepEqual(small, []);
    // Česká animace: filmy i večerníčky
    assert.ok(inGroup('ceska-animace').some(item => item.c === 'serialy') && inGroup('ceska-animace').some(item => item.c === 'animovane'));
});

test('film – nové položky splňují pravidla kvality', () => {
    const ids = data.items.map(item => item.q);
    assert.equal(new Set(ids).size, ids.length, 'každá položka jednou');
    // Popis chybí jen výjimečně (u známých filmů, které poznáš podle faktů a nápověd)
    assert.ok(data.items.filter(item => !item.d).length <= data.items.length * 0.04, 'popisy');
    for (const item of data.items) {
        assert.ok(item.t, `${item.n}: článek`);
        if (['filmy', 'animovane', 'serialy'].includes(item.c)) assert.ok(!item.im, `${item.n}: plakáty nejsou volné`);
    }
    // Němé filmy jsou celovečerní (ne krátké filmy z počátků kinematografie)
    for (const item of inGroup('nemy-film')) assert.ok(item.f.year >= 1910 || item.f.len >= 40, `${item.n}: ${item.f.year}`);
});
