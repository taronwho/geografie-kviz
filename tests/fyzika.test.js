// Testy tématu Fyzika na skutečných datech (data/fyzika.json): rozsah, nové okruhy (zákony a jevy, částice, mise, astronomové) a zakrývání odpovědi
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/fyzika.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fyzika.json'), 'utf8'));
const ctx = { topic, items: data.items, collections: data.collections, countries: {} };
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);

test('fyzika: rozsah dat a všechny kategorie', () => {
    const known = data.items.filter(item => item.k === 1).length;
    assert.ok(data.items.length >= 1500 && known >= 400, `${data.items.length} položek, ${known} známých`);
    const counts = {};
    for (const item of data.items) counts[item.c] = (counts[item.c] || 0) + 1;
    assert.deepEqual(Object.keys(counts).sort(), topic.categories.map(category => category.key).sort());
    assert.equal(new Set(data.items.map(item => item.n.toLowerCase())).size, data.items.length, 'jedna položka na název');
    assert.equal(new Set(data.items.map(item => item.q)).size, data.items.length, 'jedna položka na ID');
    // Vesmír, mise a lidé mají fotku
    for (const item of data.items.filter(other => ['vesmir', 'mise', 'fyzici', 'astronomove'].includes(other.c))) assert.ok(item.im && item.ih, `${item.n}: fotka`);
    const year = new Date().getFullYear();
    for (const item of data.items.filter(other => other.f)) {
        const f = item.f;
        if (f.died !== undefined) assert.ok(f.born < f.died && f.died <= year, `${item.n}: život`);
        if (f.year !== undefined) assert.ok(f.year <= year, `${item.n}: rok`);
    }
});

test('fyzika: známé zákony, částice, mise, souhvězdí a lidé', () => {
    for (const name of ['Ohmův zákon', 'Dopplerův jev', 'Velký třesk', 'Elektron', 'Higgsův boson', 'Foton', 'Voyager 1', 'Apollo 11', 'Orion', 'Albert Einstein',
        'Werner Heisenberg', 'Jurij Alexejevič Gagarin', 'Planckova konstanta']) {
        const item = find(name);
        assert.ok(item && item.k === 1, `chybí známá položka ${name}`);
    }
    assert.equal(find('Ohmův zákon').c, 'pojmy');
    assert.equal(find('Elektron').c, 'castice');
    assert.equal(find('Voyager 1').c, 'mise');
    assert.equal(find('Jurij Alexejevič Gagarin').c, 'astronomove');
    // Obskurní položky známé nejsou (měsíc Kerberos, hvězdokupa Messier 72, kometa Giotto)
    for (const name of ['Kerberos', 'Messier 72']) assert.notEqual((find(name) || { k: 0 }).k, 1, name);
    assert.ok(inCollection('zakony').includes('Ohmův zákon') && inCollection('jevy').includes('Dopplerův jev') && inCollection('castice').includes('Proton'));
    assert.ok(inCollection('kosmicke-mise').includes('Voyager 1') && inCollection('mlhoviny-hvezdokupy').length >= 20);
    assert.ok(inCollection('kosmonauti').length >= 20 && inCollection('astronomove').length >= 50);
    assert.ok(inCollection('konstanty').includes('Planckova konstanta'));
});

test('fyzika: popis nových položek nezná jejich název a možnosti jsou téhož druhu', () => {
    const ohm = find('Ohmův zákon');
    const question = { type: 'name', title: 'Který zákon, jev nebo pojem to je?', choices: [], showName: false };
    const hidden = core.hideAnswer('Ohmův zákon říká, že proud je přímo úměrný napětí. Georg Ohm jej objevil roku 1827.', question, ohm, ctx);
    assert.doesNotMatch(hidden, /Ohm/i, hidden);
    // Možnosti k zákonu jsou zákony a principy, ne konstanty či jevy (Ohmův zákon × Coulombův zákon)
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const choices = core.buildItemChoices(ohm, data.items, core.createSeededRandom(seed), other => topic.similarity(ohm, other, ctx), core.cultureLandsFor(topic, ctx))
            .filter(choice => !choice.correct).map(choice => find(choice.label));
        assert.equal(choices.length, 3);
        assert.ok(choices.every(other => other.c === 'pojmy' && other.ty === 'zákon'), choices.map(other => `${other.n} [${other.ty}]`).join(', '));
    }
    // Částice: k elektronu částice
    const electron = find('Elektron');
    const wrong = core.buildItemChoices(electron, data.items, core.createSeededRandom('e1'), other => topic.similarity(electron, other, ctx), core.cultureLandsFor(topic, ctx))
        .filter(choice => !choice.correct).map(choice => find(choice.label));
    assert.ok(wrong.every(other => other.c === 'castice'), wrong.map(other => other.n).join(', '));
    // Sonda: fakta (rok, provozovatel) a osa u astronoma
    const voyager = find('Voyager 1');
    assert.ok(topic.facts(voyager, ctx, 'name').some(fact => fact.label === 'Rok'));
    assert.equal(topic.visual(find('Albert Einstein'), ctx, 'name').type, 'timeline');
});
