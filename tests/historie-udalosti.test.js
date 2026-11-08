// Testy okruhu Události tématu Historie na skutečných datech (data/historie.json): smlouvy, kongresy, katastrofy, výpravy…
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/historie.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'historie.json'), 'utf8'));
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(COUNTRIES);
const ctx = { topic, items: data.items, collections: data.collections, countries: COUNTRIES, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
const rngStartingWith = (first, seed = 'historie') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};

test('historie: události – data bez bitev a válek, známost, okruhy', () => {
    const events = data.items.filter(item => item.c === 'udalosti');
    assert.ok(events.length >= 100 && events.length <= 300, `událostí ${events.length}`);
    const known = events.filter(item => item.k === 1).length / events.length;
    assert.ok(known >= 0.2 && known <= 0.35, `známých ${known}`);
    assert.ok(events.every(item => Number.isFinite(item.f.year) && item.ty), 'rok a druh');
    // Bitvy, války a revoluce jsou jen v kategorii Bitvy, války a revoluce
    assert.ok(!events.some(item => /bitva|válka|revoluce|obléhání/u.test(item.ty)));
    assert.ok(!events.some(item => /revoluc/iu.test(item.n)));
    // Filmy a díly seriálů se jménem události (Zkáza Titanicu z Futuramy) událostmi nejsou
    assert.ok(!events.some(item => /film|seriál/u.test(item.d || '')));
    for (const name of ['Vestfálský mír', 'Mnichovská dohoda', 'Černobylská havárie', 'Černá smrt', 'Vídeňský kongres']) assert.equal(find(name).c, 'udalosti', name);
    assert.equal(find('Mnichovská dohoda').cz, 1);
    assert.ok(inCollection('smlouvy').includes('Vestfálský mír') && inCollection('katastrofy').includes('Černobylská havárie'));
    assert.ok(inCollection('ceske-dejiny').includes('Pražské jaro'));
});

test('historie: události – století, stát a nápovědy', () => {
    const westphalia = find('Vestfálský mír');
    // Ve kterém století? Smlouva se podepisuje
    const century = topic.specialQuestion(westphalia, ctx, rngStartingWith(0.1));
    assert.equal(century.title, 'Ve kterém století byla podepsána?');
    assert.equal(century.answerLabel, '17. století');
    assert.equal(topic.specialQuestion(find('Černá smrt'), ctx, rngStartingWith(0.1)).title, 'Ve kterém století se to stalo?');
    // Ve kterém dnešním státě? Nesprávné možnosti jsou sousední státy, odpověď jen jedna
    const country = topic.specialQuestion(westphalia, ctx, rngStartingWith(0.4));
    assert.equal(country.type, 'location');
    assert.equal(country.title, 'Ve kterém dnešním státě byla podepsána?');
    assert.equal(country.answerLabel, 'Německo');
    assert.equal(country.choices.filter(choice => choice.correct).length, 1);
    assert.ok(country.choices.every(choice => COUNTRIES[choice.id].continent === 'EU'), country.choices.map(choice => choice.label).join(', '));
    assert.ok(core.checkAnswer('Německo', country));
    assert.deepEqual(topic.findAnswer('location', 'Rakousko', westphalia, ctx), { topic: 'zemepis', id: 'Q40' });
    // Místo nebo stát v názvu (Velký požár Londýna, Černobylská havárie) – na stát se neptáme
    assert.equal(topic.specialQuestion(find('Velký požár Londýna'), ctx, rngStartingWith(0.4)), null);
    assert.equal(topic.specialQuestion(find('Černobylská havárie'), ctx, rngStartingWith(0.4)), null);
    // Z popisu u otázky na stát zmizí stát i národnost, z nápověd místo, stát a mapa
    assert.doesNotMatch(topic.censor('location', 'Mír uzavřený v Německu, v německých městech Münster a Osnabrück.', westphalia, ctx), /Němec|němec|Německ/);
    const hints = topic.hints(westphalia, ctx, 'location');
    assert.ok(hints.every(hint => hint.kind !== 'visual' || hint.spec.type !== 'map'));
    assert.ok(!hints.some(hint => (hint.facts || []).some(fact => /Německo/.test(fact.value))));
    // Otázka na název: rok, místo a stát mezi fakty, mapa místa
    assert.ok(topic.facts(find('Černobylská havárie'), ctx, 'name').some(fact => fact.label === 'Stát' && fact.value === 'Ukrajina'));
    assert.equal(topic.visual(westphalia, ctx, 'name').type, 'map');
    // Nesprávné možnosti: jiné události, ke smlouvě smlouvy
    for (const seed of ['a', 'b', 'c']) {
        const choices = core.buildItemChoices(westphalia, data.items, core.createSeededRandom(seed), other => topic.similarity(westphalia, other, ctx), core.cultureLandsFor(topic, ctx))
            .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
        assert.ok(choices.every(other => other.c === 'udalosti'), choices.map(other => other.n).join(', '));
        assert.ok(choices.filter(other => /smlouva/u.test(other.ty)).length >= 2, choices.map(other => `${other.n} [${other.ty}]`).join(', '));
    }
});
