// Mytologie, rozšíření (scripts/lib/mytologie-rozsireni.mjs): kategorie Náboženství, Světci a světice, Záhady a legendy – data, otázky
// podle druhu, Ke kterému náboženství patří?, Kdo založil?, Kdy má svátek?, Kde prý žije?, nesprávné možnosti a fakta bez prozrazení
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/mytologie.js');
const Mystery = require('../mystery.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mytologie.json'), 'utf8'));
const ctx = { topic, items: data.items, collections: data.collections, byId: new Map(data.items.map(item => [item.q, item])) };
const NEW = ['nabozenstvi', 'svetci', 'zahady'];
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id) => data.items.filter(item => (item.g || []).includes(id));
const rngStartingWith = (first, seed = 'rozsireni') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const wrongChoices = (item, seed) => core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => topic.similarity(item, other, ctx), core.cultureLandsFor(topic, ctx))
    .filter(choice => !choice.correct).map(choice => data.items.find(other => other.n === choice.label));

test('mytologie – rozšíření: nové kategorie na konci, dost položek, známých i expertních', () => {
    assert.deepEqual(topic.categories.map(category => category.key).slice(-3), NEW);
    assert.equal(topic.title, 'Mytologie');
    for (const [key, min, minKnown] of [['nabozenstvi', 150, 45], ['svetci', 90, 25], ['zahady', 55, 15]]) {
        const list = data.items.filter(item => item.c === key);
        assert.ok(list.length >= min, `${key}: ${list.length}`);
        assert.ok(list.filter(item => item.k === 1).length >= minKnown, `${key}: známých`);
        assert.ok(list.some(item => item.x), `${key}: experti`);
        assert.ok(list.every(item => !(item.k === 1 && item.x)), `${key}: známé nejsou pro experty`);
    }
    for (const name of ['Křesťanství', 'Islám', 'Buddhismus', 'Vánoce', 'Bible', 'Papež', 'Husitství', 'Svatá Ludmila', 'Jan Nepomucký', 'Svatý Mikuláš', 'Svatý Vojtěch',
        'Svatí Cyril a Metoděj', 'Svatý Martin', 'Yetti', 'Lochnesská nestvůra', 'Bermudský trojúhelník', 'UFO', 'Robin Hood']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    for (const id of ['svetova-nabozenstvi', 'krestanske-cirkve', 'cirkevni-rady', 'nabozenske-svatky', 'cesti-svetci', 'apostolove', 'svetice', 'kryptidi', 'zahadna-mista', 'legendarni-postavy']) {
        assert.ok(data.collections.some(collection => collection.id === id), id);
        const members = inCollection(id);
        assert.ok(members.length >= 8, id);
        assert.ok(members.filter(item => item.k === 1).length >= Math.max(3, Math.ceil(members.length * 0.25)), `${id}: známých`);
    }
    for (const name of ['Svatá Ludmila', 'Jan Nepomucký', 'Svatý Prokop', 'Zdislava z Lemberka']) assert.ok(find(name).g.includes('cesti-svetci'), name);
    // Česká stopa (odznak České pověsti) jen u pověstí, ne u světců
    assert.ok(data.items.filter(item => NEW.includes(item.c)).every(item => !item.cz));
});

test('mytologie – rozšíření: žádná položka z jiného tématu, posvátné stavby ne, jména se neopakují', () => {
    const fresh = new Set(data.items.filter(item => NEW.includes(item.c)).map(item => item.q));
    for (const file of fs.readdirSync(path.join(ROOT, 'topics'))) {
        const id = file.replace(/\.js$/, '');
        if (id === 'mytologie' || !fs.existsSync(path.join(ROOT, 'data', `${id}.json`))) continue;
        const other = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8'));
        assert.deepEqual((other.items || []).filter(item => fresh.has(item.q)).map(item => item.n), [], id);
    }
    // Světci, které má Historie (svatý Václav, Anežka Česká, František z Assisi), tu nejsou
    for (const name of ['Svatý Václav', 'Anežka Česká', 'František z Assisi', 'Atlantida']) {
        assert.ok(data.items.filter(item => item.n === name).every(item => !NEW.includes(item.c)), name);
    }
    assert.ok(!data.items.some(item => NEW.includes(item.c) && /^(?:kostel|katedrála|mešita|synagoga|chrám|klášter|bazilika)/iu.test(item.n)));
    const ids = data.items.map(item => item.q);
    assert.equal(new Set(ids).size, ids.length);
    const plain = (text) => core.normalizeAnswer(text).replace(/\s+/g, '');
    const names = data.items.map(item => plain(item.n));
    assert.equal(new Set(names).size, names.length, 'jména se neopakují');
});

test('mytologie – rozšíření: otázka podle druhu, fakta a nápovědy bez prozrazení', () => {
    assert.equal(topic.questionTitle(find('Buddhismus')), 'Které náboženství to je?');
    assert.equal(topic.questionTitle(find('Templáři')), 'Který řád to je?');
    assert.equal(topic.questionTitle(find('Chanuka')), 'Který svátek to je?');
    assert.equal(topic.questionTitle(find('Svatá Lucie')), 'Která světice je to?');
    assert.equal(topic.questionTitle(find('Svatý Ondřej')), 'Který apoštol je to?');
    assert.equal(topic.questionTitle(find('Yetti')), 'Který tajemný tvor to je?');
    // Ostatní kategorie mají otázku kategorie
    assert.equal(topic.questionTitle(find('Zeus')), null);
    const labels = (item, mode) => topic.facts(item, ctx, mode).map(fact => fact.label);
    // Zakladatel, který název prozradí (Luteránství – Martin Luther, Konfucianismus – Konfucius), až po odpovědi
    assert.ok(!labels(find('Luteránství'), 'name').includes('Zakladatel'));
    assert.ok(labels(find('Luteránství'), 'result').includes('Zakladatel'));
    assert.ok(!labels(find('Konfucianismus'), 'name').includes('Zakladatel'));
    assert.ok(labels(find('Sikhismus'), 'name').includes('Zakladatel'));
    // Náboženství, které je v názvu (Sunnitský islám), se u otázky na název neukáže
    assert.ok(!labels(find('Sunnitský islám'), 'name').includes('Náboženství'));
    assert.ok(labels(find('Chanuka'), 'name').includes('Náboženství'));
    // Ústřední postava křesťanství: věcný popisek, ne „zakladatel“
    assert.deepEqual(topic.facts(find('Křesťanství'), ctx, 'result').find(fact => fact.value === 'Ježíš Kristus').label, 'Ústřední postava');
    // Světec: svátek, patron, doba
    const nicholas = topic.facts(find('Svatý Mikuláš'), ctx, 'result');
    assert.ok(nicholas.some(fact => fact.label === 'Svátek' && fact.value === '6. prosince'));
    assert.equal(topic.facts(find('Jan Nepomucký'), ctx, 'result').find(fact => fact.label === 'Svátek').value, '16. května');
    // Kde u Krysaře z Hamelnu (Hameln) by název prozradilo
    assert.ok(!labels(find('Krysař z Hamelnu'), 'name').includes('Kde'));
    // Každá položka má nápovědu (fakta nebo obrázek)
    for (const item of data.items.filter(item => NEW.includes(item.c))) {
        const hints = topic.hints(item, ctx, 'name').filter(hint => hint.kind === 'photo' ? item.im : hint.kind === 'visual' ? hint.spec : hint.facts && hint.facts.length);
        assert.ok(hints.length >= 1, `${item.n}: bez nápovědy`);
    }
});

test('mytologie – rozšíření: Ke kterému náboženství patří? a Kdo založil?', () => {
    const q = topic.specialQuestion(find('Chanuka'), ctx, rngStartingWith(0.1));
    assert.equal(q.type, 'religion');
    assert.equal(q.choices.find(choice => choice.correct).label, 'judaismus');
    assert.equal(new Set(q.choices.map(choice => choice.label)).size, 4);
    assert.doesNotMatch(topic.censor('religion', 'Chanuka je židovský svátek světel připomínající obnovu chrámu v Jeruzalémě.', find('Chanuka'), ctx), /židovsk/iu);
    // Reinkarnace je i v buddhismu a džinismu: nebudou nesprávnou možností; Desatero má i křesťanství
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const re = topic.specialQuestion(find('Reinkarnace'), ctx, rngStartingWith(0.1, seed));
        assert.ok(!re.choices.some(choice => !choice.correct && ['buddhismus', 'džinismus', 'sikhismus'].includes(choice.label)), re.choices.map(choice => choice.label).join(', '));
        const ten = topic.specialQuestion(find('Desatero'), ctx, rngStartingWith(0.1, seed));
        assert.ok(!ten.choices.some(choice => choice.label === 'křesťanství'));
    }
    // Náboženství v názvu: otázka se neklade
    assert.equal(topic.specialQuestion(find('Sunnitský islám'), ctx, rngStartingWith(0.1)), null);
    const founder = topic.specialQuestion(find('Jezuité'), ctx, rngStartingWith(0.4));
    assert.equal(founder.type, 'founder');
    assert.equal(founder.title, 'Kdo tento řád založil?');
    assert.equal(founder.choices.find(choice => choice.correct).label, 'Ignác z Loyoly');
    assert.equal(new Set(founder.choices.map(choice => choice.label)).size, 4);
    // Zakladatel v názvu (Luteránství) nebo ústřední postava: bez otázky na zakladatele
    assert.equal(topic.specialQuestion(find('Luteránství'), ctx, rngStartingWith(0.4)), null);
    assert.equal(topic.specialQuestion(find('Křesťanství'), ctx, rngStartingWith(0.4)), null);
    assert.doesNotMatch(topic.censor('founder', 'Řád založil Ignác z Loyoly roku 1540.', find('Jezuité'), ctx), /Loyol/u);
});

test('mytologie – rozšíření: Kdy má svátek? a Kde prý žije?', () => {
    const feast = topic.specialQuestion(find('Svatý Mikuláš'), ctx, rngStartingWith(0.1));
    assert.equal(feast.type, 'feast');
    assert.equal(feast.choices.find(choice => choice.correct).label, '6. prosince');
    assert.equal(new Set(feast.choices.map(choice => choice.label)).size, 4);
    assert.ok(core.isAnswerMatch('6. 12.', feast.accepted) || feast.accepted.includes('6. 12.'));
    assert.doesNotMatch(topic.censor('feast', 'Jeho svátek se slaví 6. prosince, v předvečer chodí s čertem a andělem.', find('Svatý Mikuláš'), ctx), /6\. prosince/u);
    const region = topic.specialQuestion(find('Yetti'), ctx, rngStartingWith(0.1));
    assert.equal(region.type, 'region');
    assert.equal(region.choices.find(choice => choice.correct).label, 'Himálaj');
    // Nesprávné možnosti z jiných oblastí (ne poušť Gobi k Himálaji, ne USA k Severní Americe)
    for (const seed of ['a', 'b', 'c', 'd']) {
        const bigfoot = topic.specialQuestion(find('Bigfoot'), ctx, rngStartingWith(0.1, seed));
        assert.ok(!bigfoot.choices.some(choice => !choice.correct && /USA/u.test(choice.label)), bigfoot.choices.map(choice => choice.label).join(', '));
        const yeti = topic.specialQuestion(find('Yetti'), ctx, rngStartingWith(0.1, seed));
        assert.ok(!yeti.choices.some(choice => /Gobi/u.test(choice.label)));
    }
});

test('mytologie – rozšíření: nesprávné možnosti stejného druhu a pohlaví', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
        const lucie = wrongChoices(find('Svatá Lucie'), seed);
        assert.ok(lucie.every(other => other.c === 'svetci' && other.sx === 'f'), lucie.map(other => other.n).join(', '));
        const order = wrongChoices(find('Jezuité'), seed);
        assert.ok(order.every(other => other.ty === 'řád'), order.map(other => `${other.n} [${other.ty}]`).join(', '));
        const feast = wrongChoices(find('Vánoce'), seed);
        assert.ok(feast.every(other => ['svátek', 'období'].includes(other.ty)), feast.map(other => other.n).join(', '));
        const cryptid = wrongChoices(find('Yetti'), seed);
        assert.ok(cryptid.every(other => other.ty === 'kryptid'), cryptid.map(other => other.n).join(', '));
    }
});

test('mytologie – rozšíření: nové kategorie nejsou v tajemné otázce', () => {
    for (let day = 1; day <= 60; day++) {
        const key = `2026-12-${String(((day - 1) % 28) + 1).padStart(2, '0')}`;
        const item = Mystery.pickItem(`${key}${day > 28 ? 'x' : ''}`, 'mytologie', data.items);
        assert.ok(item && !NEW.includes(item.c), `${key}: ${item && item.n}`);
    }
});
