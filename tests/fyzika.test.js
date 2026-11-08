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

// Generátor, který poprvé vrátí zadané číslo (volba druhu otázky) a pak pokračuje se semínkem
const rngStartingWith = (first, seed = 'fyzika') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};

test('fyzika: vynálezy a vynálezci – data, otázka na vynálezce a na dobu vynálezu', () => {
    const inventions = data.items.filter(item => item.c === 'vynalezy');
    assert.ok(inventions.length >= 80 && inventions.length <= 300, `vynálezů ${inventions.length}`);
    const known = inventions.filter(item => item.k === 1).length / inventions.length;
    assert.ok(known >= 0.2 && known <= 0.35, `známých ${known}`);
    assert.ok(inventions.every(item => item.f.by && Number.isFinite(item.f.year) && item.ty === 'vynález'));
    // Vynálezce je jen údaj, fyzik není dvakrát (Newton, Faraday jsou mezi fyziky, vynálezy nejsou položkami fyziků)
    assert.ok(!inventions.some(item => data.items.some(other => other.c === 'fyzici' && other.q === item.q)));
    assert.equal(find('Telefon').f.by, 'Alexander Graham Bell');
    assert.ok(find('Lodní šroub').cz === 1 && find('Kontaktní čočka').f.by === 'Otto Wichterle');
    assert.ok(inCollection('ceske-vynalezy').includes('Ruchadlo') && inCollection('vynalezy-19-stoleti').includes('Žárovka'));
    // Kdo to vynalezl? – soupeři o prvenství (Meucci, Gray) mezi možnostmi nejsou
    const phone = find('Telefon');
    for (const seed of ['a', 'b', 'c', 'd']) {
        const question = topic.specialQuestion(phone, ctx, rngStartingWith(0.1, seed));
        assert.equal(question.type, 'inventor');
        assert.equal(question.choices.filter(choice => choice.correct).length, 1);
        assert.ok(!question.choices.some(choice => /Meucci|Gray|Reis/.test(choice.label)), question.choices.map(choice => choice.label).join(', '));
        assert.ok(core.checkAnswer('Bell', question));
    }
    const wright = topic.specialQuestion(find('Letoun'), ctx, rngStartingWith(0.1));
    assert.ok(core.checkAnswer('Wrightové', wright) && core.checkAnswer('bratři Wrightové', wright));
    assert.doesNotMatch(topic.censor('inventor', 'Telefon vynalezl Alexander Graham Bell, Bellův patent je z roku 1876.', phone, ctx), /Bell/);
    // Doba: do roku 1900 století, potom desetiletí; letopočty z popisu zmizí
    const century = topic.specialQuestion(phone, ctx, rngStartingWith(0.4));
    assert.equal(century.title, 'Ve kterém století to bylo vynalezeno?');
    assert.equal(century.answerLabel, '19. století');
    const decade = topic.specialQuestion(find('Počítačová myš'), ctx, rngStartingWith(0.4));
    assert.equal(decade.type, 'decade');
    assert.equal(decade.answerLabel, '60. léta');
    assert.ok(core.checkAnswer('1964', decade) && core.checkAnswer('60. léta', decade));
    assert.doesNotMatch(topic.censor('century', 'Telefon (1876) je vynález 19. století.', phone, ctx), /1876|19\./);
    // Nápovědy: u názvu fotka, rok a země, osa a nakonec vynálezce; u vynálezce bez jména
    assert.deepEqual(topic.hints(phone, ctx, 'name').map(hint => hint.label || hint.kind), ['photo', 'facts', 'visual', 'vynálezce']);
    assert.ok(!topic.hints(phone, ctx, 'inventor').some(hint => (hint.facts || []).some(fact => /Bell/.test(fact.value))));
    // Nesprávné možnosti názvu: vynálezy podobné doby
    const choices = core.buildItemChoices(phone, data.items, core.createSeededRandom('tel'), other => topic.similarity(phone, other, ctx), core.cultureLandsFor(topic, ctx));
    assert.ok(choices.every(choice => find(choice.label).c === 'vynalezy' && Math.abs(find(choice.label).f.year - 1876) <= 120), choices.map(choice => choice.label).join(', '));
});
