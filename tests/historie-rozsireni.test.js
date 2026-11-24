// Rozšíření tématu Historie (scripts/lib/historie-rozsireni.mjs): Archeologie a starověk, Piráti, Mezinárodní organizace, Lidové tradice,
// svátky a kroje a objevitelé a mořeplavci – na skutečných datech (data/historie.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const historie = require('../topics/historie.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const data = read('data/historie.json');
const countries = read('data/countries.json').countries;
const ctx = { items: data.items, countries, topic: historie };
const NEW = ['archeologie', 'pirati', 'organizace', 'tradice'];
const inCategory = (key) => data.items.filter(item => item.c === key);
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};

test('historie: nové kategorie na konci seznamu, dost položek a známých, ikony', () => {
    const keys = historie.categories.map(category => category.key);
    assert.deepEqual(keys.slice(0, 7), ['panovnik', 'statnik', 'osobnost', 'bitva', 'udalosti', 'rise', 'kolonie']);
    assert.deepEqual(keys.slice(7), NEW);
    const icons = fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8');
    for (const category of historie.categories.slice(7)) assert.ok(icons.includes(`"${category.icon}"`) || icons.includes(`'${category.icon}'`), category.icon);
    const minimum = { archeologie: 100, pirati: 35, organizace: 70, tradice: 90 };
    for (const key of NEW) {
        const list = inCategory(key);
        assert.ok(list.length >= minimum[key], `${key}: ${list.length}`);
        const known = list.filter(item => item.k === 1).length;
        assert.ok(known >= 10 && known / list.length >= 0.2 && known / list.length <= 0.45, `${key}: ${known} známých z ${list.length}`);
        assert.ok(list.every(item => item.kd && historie.questionTitle(item)), `${key}: druh a otázka`);
    }
});

test('historie: rozšíření nemá položky jiných témat ani památky UNESCO, jména a obrázky se neopakují', () => {
    const topics = fs.readdirSync(path.join(ROOT, 'topics')).map(file => file.replace(/\.js$/, '')).filter(id => id !== 'historie');
    const others = new Map();
    for (const id of [...topics, 'vynalezy']) for (const item of read(`data/${id}.json`).items) others.set(item.q, id);
    for (const item of data.items.filter(item => NEW.includes(item.c) || item.xe)) {
        assert.ok(!others.has(item.q), `${item.n} (${item.q}) už je v tématu ${others.get(item.q)}`);
        assert.ok(!Object.hasOwn(countries, item.q), `${item.n} je stát`);
    }
    const names = new Map();
    for (const item of data.items.filter(item => NEW.includes(item.c))) {
        const key = `${item.c}|${core.normalizeAnswer(item.n)}`;
        assert.ok(!names.has(key), `${item.n}: jméno dvakrát`);
        names.set(key, item);
    }
    const images = data.items.map(item => item.im).filter(Boolean);
    assert.equal(new Set(images).size, images.length, 'stejný obrázek u dvou položek');
    // Památky UNESCO a stavby mají Zeměpis a Architektura, fiktivní piráti Film a Literatura
    for (const name of ['Stonehenge', 'Pompeje', 'Machu Picchu', 'Terakotová armáda', 'Rosettská deska', 'Jack Sparrow', 'Kapitán Hook', 'UNESCO']) {
        assert.ok(!data.items.some(item => item.n === name), name);
    }
});

test('historie: druhy otázek a nesprávné možnosti stejného druhu', () => {
    assert.equal(historie.questionTitle(find('Keltové')), 'Který národ to je?');
    assert.equal(historie.questionTitle(find('Klínové písmo')), 'Které písmo to je?');
    assert.equal(historie.questionTitle(find('Černovous')), 'Kdo to je?');
    assert.equal(historie.questionTitle(find('Jolly Roger')), 'Co je to?');
    assert.equal(historie.questionTitle(find('Hanza')), 'Která aliance nebo spolek to je?');
    assert.equal(historie.questionTitle(find('Masopust')), 'Který svátek to je?');
    assert.equal(historie.questionTitle(find('Kimono')), 'Který oděv to je?');
    assert.equal(historie.questionTitle(find('Karel IV.')), null);
    // Stálé semínko (lineární kongruenční generátor), ať test vychází pokaždé stejně
    let seed = 12345;
    const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (const name of ['Masopust', 'Kimono', 'Pomlázka', 'Keltové', 'Doba bronzová', 'Severoatlantická aliance', 'Trojspolek', 'Anne Bonny', 'Howard Carter', 'Valašsko']) {
        const item = find(name);
        const choices = core.buildItemChoices(item, data.items, rng, other => historie.similarity(item, other, ctx));
        const others = choices.filter(choice => !choice.correct).map(choice => data.items.find(candidate => candidate.q === choice.id));
        assert.equal(choices.length, 4, name);
        for (const other of others) {
            assert.equal(other.c, item.c, `${name}: ${other.n} z jiné kategorie`);
            assert.ok(historie.similarity(item, other, ctx) > 0, `${name}: ${other.n} jiného druhu`);
        }
    }
});

test('historie: fakta nových položek pomáhají a neprozradí název', () => {
    const asLine = (facts) => facts.map(fact => `${fact.label}: ${fact.value}`);
    assert.ok(asLine(historie.facts(find('Den české státnosti'), ctx, 'name')).includes('Kdy: 28. září'));
    assert.ok(asLine(historie.facts(find('Organizace spojených národů'), ctx, 'name')).includes('Sídlo: New York'));
    assert.ok(asLine(historie.facts(find('Moustérien'), ctx, 'name')).some(line => /^Datování: 313\s000 – 31\s000 př\. n\. l\.$/u.test(line)));
    assert.deepEqual(historie.nameAliases(find('Severoatlantická aliance')).filter(alias => alias === 'NATO'), ['NATO']);
    const words = (text) => core.normalizeAnswer(text).split(' ').filter(word => word.length >= 5).map(word => word.slice(0, 5));
    for (const item of data.items.filter(item => NEW.includes(item.c))) {
        const name = new Set(words(item.n));
        for (const fact of historie.facts(item, ctx, 'name')) {
            if (fact.label === 'Kdy' || fact.label === 'Země') continue;
            assert.ok(!words(String(fact.value)).some(word => name.has(word)), `${item.n}: ${fact.label} ${fact.value}`);
        }
        // Otázka na století: v nápovědách ani faktech žádný letopočet
        const century = historie.specialQuestion(item, ctx, () => 0.1);
        if (century) assert.ok(historie.facts(item, ctx, 'century').every(fact => !/\d{3}/.test(fact.value)), `${item.n}: rok u otázky na století`);
    }
});

test('historie: objevitelé a mořeplavci – okruh, fakt Cesty a objevy, nově Amundsen a Holub', () => {
    const explorers = core.filterItems(data.items, { tier: 'expert', collection: 'objevitele' });
    assert.ok(explorers.length >= 100, `${explorers.length}`);
    assert.ok(explorers.every(item => item.c === 'osobnost' && item.f.exp), 'každý objevitel je osobnost s faktem');
    const columbus = find('Kryštof Kolumbus');
    assert.equal(columbus.k, 1);
    assert.ok(historie.facts(columbus, ctx, 'name').some(fact => fact.label === 'Cesty a objevy'));
    assert.ok(!historie.facts(columbus, ctx, 'century').some(fact => fact.label === 'Cesty a objevy'), 'u otázky na století ne');
    for (const name of ['Roald Amundsen', 'Thor Heyerdahl', 'Emil Holub']) assert.equal(find(name).k, 1, name);
    // Fakt neobsahuje jméno objevitele
    for (const item of explorers) {
        const surname = core.normalizeAnswer(item.n).split(' ').filter(word => word.length >= 5).pop();
        if (surname) assert.ok(!core.normalizeAnswer(item.f.exp).includes(surname.slice(0, 5)), `${item.n}: ${item.f.exp}`);
    }
});
