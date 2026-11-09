// Fyzika: úrovně obtížnosti (Základní / Mudrlant / Expert) a velikost okruhů na skutečných datech (data/fyzika.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fyzika.json'), 'utf8'));
// Stejné pravidlo jako knownFloor ve scripts/lib/zemepis-levels.mjs (používá ho scripts/lib/veda-levels.mjs)
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));
const inGroup = (id) => data.items.filter(item => (item.g || []).includes(id));
const names = (id) => inGroup(id).map(item => item.n);
const level = (item) => core.levelOf(item);
const share = (list, value) => list.filter(item => level(item) === value).length / list.length;
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};

test('fyzika – úrovně: Základní, Mudrlant a Expert v rozumném poměru', () => {
    for (const item of data.items) {
        assert.ok(item.k === 0 || item.k === 1, `${item.n}: k`);
        assert.ok(item.x === undefined || (item.x === 1 && item.k === 0), `${item.n}: x jen u neznámých`);
    }
    const all = data.items;
    assert.ok(share(all, 1) >= 0.22 && share(all, 1) <= 0.34, `Základní ${share(all, 1)}`);
    assert.ok(share(all, 3) >= 0.18 && share(all, 3) <= 0.32, `Expert ${share(all, 3)}`);
    assert.ok(share(all, 2) >= 0.4, `Mudrlant ${share(all, 2)}`);
    for (const category of new Set(all.map(item => item.c))) {
        const members = all.filter(item => item.c === category);
        assert.ok(share(members, 1) >= 0.15, `kategorie ${category}: Základní ${share(members, 1)}`);
        assert.ok(share(members, 2) >= 0.2, `kategorie ${category}: Mudrlant ${share(members, 2)}`);
        assert.ok(share(members, 3) >= 0.1, `kategorie ${category}: Expert ${share(members, 3)}`);
    }
});

test('fyzika – úrovně: v každém okruhu aspoň čtvrtina známých, nejvýš 45 % pro experty', () => {
    const short = data.collections.map(collection => [collection.label, inGroup(collection.id)])
        .filter(([, members]) => members.filter(item => item.k === 1).length < knownFloor(members.length))
        .map(([label, members]) => `${label}: ${members.filter(item => item.k === 1).length}/${members.length}`);
    assert.deepEqual(short, []);
    const expert = data.collections.filter(collection => share(inGroup(collection.id), 3) > 0.46).map(collection => collection.id);
    assert.deepEqual(expert, []);
    for (const id of ['kosmonauti', 'astronomove', 'nobelova-cena-fyzika', 'galaxie', 'mlhoviny-hvezdokupy']) assert.ok(share(inGroup(id), 1) >= 0.25, id);
});

test('fyzika – úrovně: školní fyzika je známá', () => {
    for (const name of ['Slunce', 'Měsíc', 'Země', 'Mars', 'Metr', 'Kilogram', 'Sekunda', 'Kelvin', 'Rychlost', 'Síla', 'Ohmův zákon', 'Setrvačnost', 'Tření',
        'Elektron', 'Proton', 'Albert Einstein', 'Isaac Newton', 'Jurij Alexejevič Gagarin', 'Kontaktní čočka', 'Žárovka']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    // Obskurní položky známé nejsou
    for (const name of ['Kerberos', 'Messier 72']) assert.notEqual((data.items.find(item => item.n === name) || { k: 0 }).k, 1, name);
});

test('fyzika – okruhy: dost položek a bez nesmyslů', () => {
    const minimum = { teplo: 28, 'elektrina-magnetismus': 55, mechanika: 80, konstanty: 23, pristroje: 55, zakony: 70, castice: 38, mesice: 60,
        galaxie: 36, 'komety-planetky': 60, 'ceske-vynalezy': 11, 'vynalezy-19-stoleti': 60, 'vynalezy-20-stoleti': 60 };
    const small = Object.entries(minimum).filter(([id, min]) => inGroup(id).length < min).map(([id, min]) => `${id}: ${inGroup(id).length} < ${min}`);
    assert.deepEqual(small, []);
    // Galaxie NGC 1–99 a předběžná označení měsíců (S/2000 J 11) mají články jen od robotů
    assert.ok(!inGroup('galaxie').some(item => /^NGC \d{1,2}$/.test(item.n)) && !inGroup('mesice').some(item => /^S\/\d/.test(item.n)));
    // Sonda Giotto není kometa; měsíc Metis nepřebije planetka stejného jména
    assert.ok(!names('komety-planetky').includes('Giotto'));
    assert.equal(find('Metis').f.kind, 'měsíc');
    // Teplo a mechanika nejsou jen veličiny
    for (const name of ['Absolutní nula', 'Trojný bod', 'Carnotův cyklus', 'Stupeň Celsia', 'Tání']) assert.ok(names('teplo').includes(name), name);
    for (const name of ['Setrvačnost', 'Tření', 'Vztlak', 'Archimédův zákon', 'Páka']) assert.ok(names('mechanika').includes(name), name);
    for (const name of ['Ohmův zákon', 'Elektromagnetická indukce', 'Ampérmetr', 'Supravodivost']) assert.ok(names('elektrina-magnetismus').includes(name), name);
    // Permitivita vakua je konstanta, ne veličina (elementární náboj vedou Wikidata jako jednotku náboje)
    assert.ok(names('konstanty').includes('Permitivita vakua') && names('konstanty').includes('Tíhové zrychlení'));
    for (const name of ['Kaplanova turbína', 'Silon']) assert.ok(names('ceske-vynalezy').includes(name), name);
});
