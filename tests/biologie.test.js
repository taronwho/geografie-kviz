// Testy tématu Biologie na skutečných datech (data/biologie.json): plemena psů a koček a lidské tělo
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/biologie.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'biologie.json'), 'utf8'));
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(COUNTRIES);
const ctx = { topic, items: data.items, collections: data.collections, countries: COUNTRIES, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
// Generátor, který poprvé vrátí zadané číslo (volba druhu otázky) a pak pokračuje se semínkem
const rngStartingWith = (first, seed = 'biologie') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const share = (list) => list.filter(item => item.k === 1).length / list.length;
const wrongChoices = (item, seed) => core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => topic.similarity(item, other, ctx))
    .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));

test('biologie: plemena psů a koček – data, známost a okruhy', () => {
    const breeds = data.items.filter(item => item.c === 'plemena');
    assert.ok(breeds.length >= 300 && breeds.length <= 420, `plemen ${breeds.length}`);
    assert.ok(share(breeds) >= 0.2 && share(breeds) <= 0.35, `známých ${share(breeds)}`);
    assert.ok(breeds.every(item => item.im && item.ih && ['psí plemeno', 'kočičí plemeno'].includes(item.ty)), 'plemeno se pozná podle fotky');
    for (const name of ['Německý ovčák', 'Labradorský retrívr', 'Siamská kočka', 'Perská kočka', 'Československý vlčák']) assert.equal(find(name).k, 1, `${name} má být známé`);
    // Divoký pes (dingo) plemenem není; plemena nejsou „naší přírodou“
    assert.ok(!breeds.some(item => /dingo/iu.test(item.n)));
    assert.ok(!inCollection('nase-priroda').includes('Československý vlčák'));
    assert.equal(find('Německý ovčák').f.fci, 'ovčáčtí, pasteveční a honáčtí psi');
    assert.equal(find('Čivava').f.fci, 'společenská plemena');
    assert.ok(inCollection('kocici-plemena').includes('Siamská kočka') && !inCollection('psi-plemena').includes('Siamská kočka'));
    assert.ok(inCollection('fci-terieri').includes('Yorkšírský teriér') || inCollection('fci-terieri').length >= 10);
    assert.ok(inCollection('ceska-plemena').includes('Československý vlčák'));
});

test('biologie: plemena – nesprávné možnosti stejného druhu, otázka na zemi původu', () => {
    // Ke kočce kočky, ke psovi psi (nikdy plemeno místo orgánu nebo zvířete)
    for (const seed of ['a', 'b', 'c']) {
        assert.ok(wrongChoices(find('Siamská kočka'), seed).every(other => other.c === 'plemena' && other.f.kind === 'kocka'));
        assert.ok(wrongChoices(find('Rotvajler'), seed).every(other => other.c === 'plemena' && other.f.kind === 'pes'));
    }
    // Ze které země plemeno pochází? Jen když to název neprozradí (Německý ovčák)
    const chihuahua = topic.specialQuestion(find('Čivava'), ctx, rngStartingWith(0.1));
    assert.equal(chihuahua.title, 'Ze které země plemeno pochází?');
    assert.equal(chihuahua.answerLabel, 'Mexiko');
    assert.equal(chihuahua.choices.filter(choice => choice.correct).length, 1);
    assert.ok(core.checkAnswer('Mexiko', chihuahua));
    assert.equal(topic.specialQuestion(find('Německý ovčák'), ctx, rngStartingWith(0.1)), null);
    assert.equal(topic.specialQuestion(find('Čivava'), ctx, rngStartingWith(0.9)), null);
    assert.doesNotMatch(topic.censor('location', 'Čivava je mexické plemeno psa z Mexika.', find('Čivava'), ctx), /mexick|Mexik/i);
    // Nápovědy: fotka, velikost a skupina, nakonec země původu (ta je u otázky na zemi skrytá)
    const hints = topic.hints(find('Čivava'), ctx, 'name');
    assert.deepEqual(hints.map(hint => hint.label || hint.kind), ['photo', 'facts', 'země původu']);
    assert.ok(!topic.hints(find('Čivava'), ctx, 'location').some(hint => (hint.facts || []).some(fact => fact.value === 'Mexiko')));
    // Psaná odpověď: samotné „Německý“ neplatí
    assert.ok(!topic.nameAliases(find('Německý ovčák'), ctx).includes('Německý'));
});

test('biologie: lidské tělo – kosti, svaly, orgány a žlázy', () => {
    const body = data.items.filter(item => item.c === 'telo');
    assert.ok(body.length >= 120 && body.length <= 300, `částí těla ${body.length}`);
    assert.ok(share(body) >= 0.2 && share(body) <= 0.35, `známých ${share(body)}`);
    for (const kind of ['kost', 'sval', 'orgán', 'žláza']) assert.ok(body.filter(item => item.ty === kind).length >= 10, `${kind}`);
    assert.ok(body.every(item => item.f.sys), 'každá část těla má soustavu');
    assert.equal(find('Stehenní kost').f.part, 'dolní končetina');
    assert.equal(find('Kyčelní kost').f.part, 'pánev');
    assert.equal(find('Slinivka břišní').f.sys, 'trávicí soustava');
    for (const name of ['Srdce', 'Játra', 'Plíce', 'Stehenní kost', 'Bránice']) assert.equal(find(name).k, 1, `${name} má být známé`);
    // Žádné vnější pohlavní orgány a u rozmnožovací soustavy žádné obrázky; obrázky jsou kresby a schémata
    assert.ok(!body.some(item => /penis|vulva|pochva|klitoris|šourek/iu.test(item.n)));
    assert.ok(body.filter(item => item.f.sys === 'rozmnožovací soustava').every(item => !item.im));
    assert.ok(body.filter(item => item.im).every(item => !/dissect|cadaver|autops|surg|specimen/iu.test(item.im)));
    assert.ok(inCollection('kosti').includes('Stehenní kost') && inCollection('organy').includes('Srdce'));
});

test('biologie: lidské tělo – nápovědy, latinský název a podobné možnosti', () => {
    const femur = find('Stehenní kost');
    assert.deepEqual(topic.hints(femur, ctx, 'name').map(hint => hint.label || hint.kind), ['photo', 'facts', 'latinsky']);
    assert.ok(topic.nameAliases(femur, ctx).includes('os femoris'), 'latinsky jde odpovědět také');
    assert.ok(!topic.facts(femur, ctx, 'name').some(fact => fact.label === 'Latinsky'), 'latinský název až jako poslední nápověda');
    assert.ok(topic.facts(femur, ctx, 'result').some(fact => fact.label === 'Latinsky'));
    // Ke kosti kosti (nejlépe ze stejné části těla), k orgánu orgány; nikdy plemeno
    for (const seed of ['a', 'b', 'c']) {
        const bones = wrongChoices(femur, seed);
        assert.ok(bones.every(other => other.c === 'telo' && other.ty === 'kost'), bones.map(other => other.n).join(', '));
        assert.ok(bones.filter(other => other.f.part === 'dolní končetina').length >= 2, bones.map(other => other.n).join(', '));
        assert.ok(wrongChoices(find('Srdce'), seed).every(other => other.c === 'telo' && other.ty === 'orgán'));
    }
    // Na řád ani čeleď se u těla a plemen neptáme
    assert.equal(topic.specialQuestion(femur, ctx, rngStartingWith(0.1)), null);
    assert.equal(topic.subtitle(find('Srdce'), ctx), 'orgán · oběhová soustava');
});
