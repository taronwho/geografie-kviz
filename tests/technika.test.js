// Testy tématu Technika a vynálezy na skutečných datech (data/technika.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const technika = require('../topics/technika.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'technika.json'), 'utf8'));
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(countries);
const ctx = { topic: technika, items: data.items, collections: data.collections, countries, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
// rng, které nejdřív vrátí first (rozhodne o druhu otázky), pak náhodná čísla se semínkem
const rngStarting = (first, seed = 'technika') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const wrongOptions = (name, seed) => core.buildItemChoices(find(name), data.items, core.createSeededRandom(seed), other => technika.similarity(find(name), other, ctx), core.cultureLandsFor(technika, ctx))
    .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));

test('technika: známé položky ve všech kategoriích, česká stopa a čistá data', () => {
    for (const name of ['Thomas Alva Edison', 'Henry Ford', 'František Křižík', 'Kolo', 'Kompas', 'Škoda Octavia', 'Škoda Auto', 'Tatra 87', 'TGV', 'Pendolino', 'Boeing 747',
        'Concorde', 'Titanic', 'iPhone', 'PlayStation', 'Commodore 64', 'Linux', 'Facebook', 'Jaderná elektrárna Temelín', 'Letiště Václava Havla Praha', 'Metro v Praze',
        'Apple', 'Microsoft']) {
        assert.ok(find(name) && find(name).k === 1, `chybí známá položka ${name}`);
    }
    assert.equal(find('František Křižík').cz, 1);
    assert.equal(find('Škoda Octavia').cz, 1);
    assert.equal(find('Thomas Alva Edison').cz, undefined);
    // Každá kategorie má na základní úroveň dost známých položek (aspoň 30) a skoro všechny stroje a dopravní prostředky mají fotku
    for (const category of technika.categories) {
        const list = data.items.filter(item => item.c === category.key);
        assert.ok(list.filter(item => item.k === 1).length >= 30, `${category.key}: jen ${list.filter(item => item.k === 1).length} známých`);
        if (['auta', 'vlaky', 'letadla', 'lode', 'elektronika'].includes(category.key)) assert.ok(list.filter(item => item.im).length >= list.length * 0.9, `${category.key}: fotky`);
    }
    // Položka není zároveň v jiném tématu (Tesla a Watt jsou ve Fyzice, mosty v Architektuře, průplavy v Zeměpisu)
    const others = new Set();
    for (const file of fs.readdirSync(path.join(ROOT, 'topics')).filter(name => name !== 'technika.js')) {
        const other = require(path.join(ROOT, 'topics', file));
        for (const item of JSON.parse(fs.readFileSync(path.join(ROOT, other.dataFile), 'utf8')).items) others.add(item.q);
    }
    assert.deepEqual(data.items.filter(item => others.has(item.q)).map(item => item.n), []);
    assert.ok(!find('Nikola Tesla') && !find('James Watt') && !find('Golden Gate Bridge'));
    // Rozcestníky a osoby mezi firmami do tématu nepatří
    assert.ok(!data.items.some(item => /^rozcestník/u.test(item.d || '')));
    assert.ok(data.items.filter(item => item.c === 'firmy').every(item => item.f.born === undefined));
    // Jména jednou, rozumná data narození
    assert.equal(new Set(data.items.map(item => item.n.toLowerCase())).size, data.items.length);
    for (const item of data.items.filter(other => other.c === 'vynalezci')) {
        assert.ok(item.f.born < new Date().getFullYear() - 15, item.n);
        if (item.f.died !== undefined) assert.ok(item.f.died > item.f.born, item.n);
    }
    assert.ok(fs.statSync(path.join(ROOT, 'data', 'technika.json')).size < 1.5e6);
});

test('technika: fotka stroje je otázkou, osoby, firmy a stavby mají fotku v nápovědě', () => {
    const tgv = find('TGV');
    assert.deepEqual(technika.questionImage(tgv, ctx, 'name'), { file: tgv.im, hash: tgv.ih, label: 'Fotka', icon: 'image' });
    assert.equal(technika.questionImage(find('Thomas Alva Edison'), ctx, 'name'), null);
    assert.equal(technika.questionImage(find('Škoda Auto'), ctx, 'name'), null, 'automobilka není fotka auta');
    assert.equal(technika.questionImage(find('Letiště Václava Havla Praha'), ctx, 'name'), null);
    assert.equal(technika.questionImage(tgv, ctx, 'maker'), null);
    // Zadání podle druhu: automobilka, letiště a elektrárna mají vlastní
    assert.equal(technika.questionTitle(find('Škoda Auto')), 'Která automobilka to je?');
    assert.equal(technika.questionTitle(find('Letiště Václava Havla Praha')), 'Které letiště to je?');
    assert.equal(technika.questionTitle(find('Jaderná elektrárna Temelín')), 'Která elektrárna to je?');
    assert.equal(technika.questionTitle(find('Škoda Octavia')), null);
    // Osoba: osa života, fakta, nakonec fotka; dílo bez vlastního jména
    const edison = find('Thomas Alva Edison');
    assert.deepEqual(technika.hints(edison, ctx, 'name').map(hint => hint.kind), ['facts', 'facts', 'photo']);
    assert.equal(technika.visual(edison, ctx, 'name'), null, 'osa by jen opakovala roky z popisu');
    assert.equal(technika.visual(edison, ctx, 'result').type, 'timeline');
    const facts = technika.facts(edison, ctx, 'name').map(fact => `${fact.label}: ${fact.value}`);
    assert.ok(facts.includes('Známé dílo: žárovka, fonograf'), facts.join(' / '));
    for (const item of data.items.filter(other => other.c === 'vynalezci' && other.f.work)) {
        assert.ok(!core.censorName(item.f.work, item.n).includes('[***]'), `${item.n}: dílo prozradí jméno (${item.f.work})`);
    }
    // Stavba: mapa v nápovědě, souřadnice
    const temelin = find('Jaderná elektrárna Temelín');
    assert.ok(technika.hints(temelin, ctx, 'name').some(hint => hint.kind === 'visual' && hint.spec && hint.spec.type === 'map'));
    assert.deepEqual(technika.coords(temelin), { lat: temelin.la, lon: temelin.lo });
    assert.ok(technika.facts(temelin, ctx, 'result').some(fact => fact.label === 'Výkon'));
    assert.equal(technika.coords(edison), null);
});

test('technika: nesprávné možnosti stejného druhu (k Boeingu 747 dopravní letadla, k Octavii auta, k letišti letiště)', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
        const planes = wrongOptions('Boeing 747', seed);
        assert.ok(planes.every(other => other.c === 'letadla' && other.ty === 'dopravní letadlo'), planes.map(other => `${other.n} (${other.ty})`).join(', '));
        const cars = wrongOptions('Škoda Octavia', seed);
        assert.ok(cars.every(other => other.c === 'auta' && other.ty !== 'automobilka'), cars.map(other => other.n).join(', '));
        assert.ok(cars.filter(other => other.f.land === 'Česko').length >= 2, cars.map(other => other.n).join(', '));
        const makers = wrongOptions('Škoda Auto', seed);
        assert.ok(makers.every(other => other.ty === 'automobilka'), makers.map(other => other.n).join(', '));
        const airports = wrongOptions('Letiště Václava Havla Praha', seed);
        assert.ok(airports.every(other => other.ty === 'letiště'), airports.map(other => other.n).join(', '));
        const plants = wrongOptions('Jaderná elektrárna Temelín', seed);
        assert.ok(plants.every(other => /elektrárna$/u.test(other.ty)), plants.map(other => other.n).join(', '));
        const trams = wrongOptions('Tatra T3', seed);
        assert.ok(trams.every(other => other.ty === 'tramvaj'), trams.map(other => other.n).join(', '));
        const people = wrongOptions('František Křižík', seed);
        assert.ok(people.every(other => other.c === 'vynalezci'), people.map(other => other.n).join(', '));
    }
});

test('technika: kdo to vyrobil, ze které země firma pochází a ve kterém desetiletí', () => {
    // Výrobce, který není v názvu (Walkman – Sony), ne u modelu se značkou v názvu (Škoda Octavia)
    const walkman = find('Walkman');
    const maker = technika.specialQuestion(walkman, ctx, rngStarting(0.1));
    assert.equal(maker.type, 'maker');
    assert.equal(maker.title, 'Kdo to vyrobil?');
    assert.equal(maker.answerLabel, 'Sony');
    assert.equal(maker.choices.length, 4);
    assert.equal(maker.choices.filter(choice => choice.correct).length, 1);
    assert.ok(maker.choices.every(choice => !/^Sony /u.test(choice.label) || choice.correct), maker.choices.map(choice => choice.label).join(', '));
    assert.ok(core.checkAnswer('Sony', maker));
    assert.doesNotMatch(technika.censor('maker', 'Walkman je přenosný přehrávač firmy Sony.', walkman, ctx), /Sony/);
    assert.notEqual((technika.specialQuestion(find('Škoda Octavia'), ctx, rngStarting(0.1)) || {}).type, 'maker');
    // Země automobilky: možnosti jsou státy, popis bez země a národnosti
    const skoda = find('Škoda Auto');
    const country = technika.specialQuestion(skoda, ctx, rngStarting(0.1));
    assert.equal(country.type, 'location');
    assert.equal(country.title, 'Ze které země automobilka pochází?');
    assert.equal(country.answerLabel, 'Česko');
    assert.ok(country.choices.every(choice => countries[choice.id] && choice.topic === 'zemepis'), country.choices.map(choice => choice.label).join(', '));
    assert.ok(core.checkAnswer('Česká republika', country) || core.checkAnswer('Česko', country));
    assert.doesNotMatch(technika.censor('location', 'Škoda Auto je český výrobce automobilů se sídlem v Mladé Boleslavi.', skoda, ctx), /český|Mladé Boleslavi/);
    assert.ok(!technika.facts(skoda, ctx, 'location').some(fact => ['Země', 'Sídlo'].includes(fact.label)));
    // Desetiletí prvního letu: rok v popisu zakrytý, fakta bez roku
    const concorde = find('Concorde');
    const decade = technika.specialQuestion(concorde, ctx, rngStarting(0.95));
    assert.equal(decade.type, 'decade');
    assert.equal(decade.answerLabel, '60. léta');
    assert.ok(core.checkAnswer('1969', decade) && core.checkAnswer('60. léta', decade) && !core.checkAnswer('70. léta', decade));
    assert.doesNotMatch(technika.censor('decade', 'Concorde poprvé vzlétl v roce 1969 a létal do roku 2003.', concorde, ctx), /1969|2003/);
    assert.ok(!technika.facts(concorde, ctx, 'decade').some(fact => fact.label === 'První let'));
    assert.equal(technika.specialQuestion(concorde, ctx, rngStarting(0.5)), null, 'většinou obyčejná otázka');
});

test('technika: okruhy ve skutečných datech', () => {
    assert.ok(data.collections.length >= 10 && data.collections.length <= 30);
    assert.ok(inCollection('cesko').includes('František Křižík') && inCollection('cesko').includes('Tatra 87') && !inCollection('cesko').includes('TGV'));
    assert.ok(inCollection('letiste').includes('Letiště Václava Havla Praha') && !inCollection('letiste').includes('Metro v Praze'));
    assert.ok(inCollection('herni-konzole').includes('PlayStation') && inCollection('herni-konzole').includes('Game Boy'));
    assert.ok(inCollection('automobilky').includes('Škoda Auto') && !inCollection('automobilky').includes('Škoda Octavia'));
    assert.ok(inCollection('skoda').includes('Škoda Octavia'));
    assert.ok(inCollection('tramvaje').includes('Tatra T3'));
});
