// Fyzika, rozšíření o astronomii a kosmonautiku (scripts/lib/fyzika-vesmir.mjs): kategorie Astronomické jevy a pojmy a Rakety a kosmické
// lodě, nové mise, čeští astronomové a kosmonauti – data, otázky podle druhu, otázka na zemi a desetiletí prvního letu, nesprávné možnosti
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/fyzika.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fyzika.json'), 'utf8'));
const ctx = { topic, items: data.items, collections: data.collections, countries: {} };
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id) => data.items.filter(item => (item.g || []).includes(id));
const rngStartingWith = (first, seed = 'vesmir') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const wrongChoices = (item, seed) => core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => topic.similarity(item, other, ctx), core.cultureLandsFor(topic, ctx))
    .filter(choice => !choice.correct).map(choice => find(choice.label));

test('fyzika – vesmír: nové kategorie na konci, dost položek a známých', () => {
    const keys = topic.categories.map(category => category.key);
    assert.deepEqual(keys.slice(-2), ['astronomie', 'rakety']);
    for (const [key, min, minKnown] of [['astronomie', 150, 40], ['rakety', 50, 15]]) {
        const list = data.items.filter(item => item.c === key);
        assert.ok(list.length >= min, `${key}: ${list.length}`);
        assert.ok(list.filter(item => item.k === 1).length >= minKnown, `${key}: známých`);
        assert.ok(list.some(item => item.x), `${key}: experti`);
    }
    for (const name of ['Zatmění Slunce', 'Černá díra', 'Perseidy', 'Olympus Mons', 'Challenger', 'Starship', 'V-2', 'Vladimír Remek', 'Sojuz 28', 'Program Apollo', 'Mir']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    for (const id of ['meteoricke-roje', 'druhy-teles', 'utvary-planet', 'nosne-rakety', 'kosmicke-lode', 'pilotovane-lety', 'ceska-kosmonautika']) {
        assert.ok(data.collections.some(collection => collection.id === id), id);
        assert.ok(inCollection(id).length >= 8, id);
    }
    // Čeští astronomové a kosmonauti, Sojuz 28 a Magion v okruhu České astronomie a kosmonautiky
    for (const name of ['Vladimír Remek', 'Jiří Grygar', 'Tadeáš Hájek z Hájku', 'Sojuz 28', 'Magion 1']) assert.ok(find(name).g.includes('ceska-kosmonautika'), name);
    assert.ok(find('Vladimír Remek').g.includes('kosmonauti') && find('Jiří Grygar').g.includes('astronomove'));
});

test('fyzika – vesmír: žádná položka z jiného tématu, kosmodromy má Technika', () => {
    const own = new Set(data.items.map(item => item.q));
    for (const file of fs.readdirSync(path.join(ROOT, 'topics'))) {
        const id = file.replace(/\.js$/, '');
        if (id === 'fyzika' || !fs.existsSync(path.join(ROOT, 'data', `${id}.json`))) continue;
        const other = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8'));
        const shared = (other.items || []).filter(item => own.has(item.q) && data.items.find(mine => mine.q === item.q && ['astronomie', 'rakety'].includes(mine.c)));
        assert.deepEqual(shared.map(item => item.n), [], id);
    }
    assert.ok(!data.items.some(item => /kosmodrom/iu.test(item.n)), 'kosmodromy patří Technice');
});

test('fyzika – vesmír: otázka podle druhu a fakta, která neprozradí název', () => {
    assert.equal(topic.questionTitle(find('Perseidy')), 'Který meteorický roj to je?');
    assert.equal(topic.questionTitle(find('Černá díra')), 'Jaký druh vesmírného tělesa to je?');
    assert.equal(topic.questionTitle(find('Challenger')), 'Který raketoplán to je?');
    assert.equal(topic.questionTitle(find('Opportunity')), 'Co je to za vozítko?');
    // Radiant v Perseovi by Perseidy prozradil: až po odpovědi; u Geminid (Blíženci) hned
    const labels = (item, mode) => topic.facts(item, ctx, mode).map(fact => fact.label);
    assert.ok(!labels(find('Perseidy'), 'name').includes('Radiant v souhvězdí'));
    assert.ok(labels(find('Perseidy'), 'result').includes('Radiant v souhvězdí'));
    assert.ok(labels(find('Geminidy'), 'name').includes('Radiant v souhvězdí'));
    // Výrobce RKK Energija by prozradil Eněrgiji
    assert.ok(!labels(find('Eněrgija'), 'name').includes('Výrobce'));
    // Pojem bez fotky má nápovědu tvaru názvu
    const hints = topic.hints(find('Oortův oblak'), ctx, 'name');
    assert.match(hints[hints.length - 1].facts[0].value, /^2 slova, začíná na O$/);
});

test('fyzika – vesmír: otázka na zemi a na desetiletí prvního letu', () => {
    const ariane = find('Ariane 6');
    const land = topic.specialQuestion(ariane, ctx, rngStartingWith(0.1));
    assert.equal(land.type, 'land');
    assert.equal(land.choices.find(choice => choice.correct).label, 'Evropa (ESA)');
    // K evropské raketě se nenabízí Francie ani Německo (Ariane je i francouzská)
    assert.ok(!land.choices.some(choice => /Francie|Německo|Velká Británie/.test(choice.label)), land.choices.map(choice => choice.label).join(', '));
    assert.ok(!topic.facts(ariane, ctx, 'land').some(fact => ['Země', 'Výrobce'].includes(fact.label)));
    assert.doesNotMatch(topic.censor('land', 'Ariane 6 je evropská nosná raketa firmy Arianespace pro ESA.', ariane, ctx), /evropsk|Arianespace|ESA/);
    const falcon = find('Falcon Heavy');
    const decade = topic.specialQuestion(falcon, ctx, rngStartingWith(0.3));
    assert.equal(decade.type, 'decade');
    assert.equal(decade.choices.find(choice => choice.correct).label, '2010. léta');
    assert.equal(new Set(decade.choices.map(choice => choice.label)).size, 4);
    assert.doesNotMatch(topic.censor('decade', 'Poprvé startovala v únoru 2018.', falcon, ctx), /2018/);
    // Raketoplán Enterprise do vesmíru neletěl
    assert.equal(topic.specialQuestion(find('Enterprise'), ctx, rngStartingWith(0.3)), null);
});

test('fyzika – vesmír: nesprávné možnosti stejného druhu, ne dvě verze téže řady', () => {
    assert.equal(topic.similarity(find('Ariane 6'), find('Ariane 4'), ctx), -Infinity);
    assert.equal(topic.similarity(find('Sojuz'), find('Sojuz (kosmická loď)'), ctx), -Infinity);
    assert.equal(topic.similarity(find('Apollo 12'), find('Apollo 11'), ctx), -Infinity);
    for (const seed of ['a', 'b', 'c', 'd']) {
        const rocket = wrongChoices(find('Starship'), seed);
        assert.ok(rocket.every(other => other.c === 'rakety' && other.ty === 'raketa'), rocket.map(other => `${other.n} [${other.ty}]`).join(', '));
        const roj = wrongChoices(find('Perseidy'), seed);
        assert.ok(roj.every(other => other.ty === 'meteorický roj'), roj.map(other => other.n).join(', '));
        const flight = wrongChoices(find('Sojuz 28'), seed);
        assert.ok(flight.every(other => other.ty === 'pilotovaný let'), flight.map(other => `${other.n} [${other.ty}]`).join(', '));
    }
});
