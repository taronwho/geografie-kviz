// Téma Film, rozšíření: televizní pořady, večerníčky, komiksy a anime (scripts/lib/film-rozsireni.mjs) na skutečných datech
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');
const film = require('../topics/film.js');

const data = require(path.join(__dirname, '..', 'data', 'film.json'));
const ctx = { topic: film, items: data.items, collections: data.collections, countries: {}, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name, category) => {
    const item = data.items.find(candidate => candidate.n === name && (!category || candidate.c === category));
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCategory = (category) => data.items.filter(item => item.c === category);
const inGroup = (id) => data.items.filter(item => (item.g || []).includes(id));
const rngStartingWith = (first, seed = 'film') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const share = (list) => list.filter(item => item.k === 1).length / list.length;

test('rozšíření: nové kategorie na konci seznamu, velikost a známé položky', () => {
    assert.deepEqual(film.categories.map(category => category.key), ['filmy', 'animovane', 'serialy', 'reziseri', 'herci', 'porady', 'vecernicky', 'komiksy']);
    for (const [category, min] of [['porady', 80], ['vecernicky', 60], ['komiksy', 120]]) {
        const list = inCategory(category);
        assert.ok(list.length >= min, `${category}: ${list.length}`);
        assert.ok(list.filter(item => item.k === 1).length >= 23, `${category}: známých ${list.filter(item => item.k === 1).length}`);
        assert.ok(share(list) >= 0.2 && share(list) <= 0.36, `${category}: Základní ${share(list)}`);
        assert.ok(list.every(item => item.t && item.d && item.ty), `${category}: článek, popis a druh`);
    }
    for (const name of ['Chcete být milionářem?', 'Riskuj!', 'AZ-kvíz', 'Kufr', 'StarDance …když hvězdy tančí', 'Pošta pro tebe', 'Večerníček', 'Události', 'Top Gear']) {
        assert.equal(find(name, 'porady').k, 1, `${name} má být známý pořad`);
    }
    for (const name of ['O krtkovi', 'Pat a Mat', 'Maxipes Fík', 'O loupežníku Rumcajsovi', 'Mach a Šebestová', 'Krkonošské pohádky', 'Rákosníček', 'Říkání o víle Amálce']) {
        assert.equal(find(name, 'vecernicky').k, 1, `${name} má být známý večerníček`);
    }
    for (const name of ['Superman', 'Batman', 'Spider-Man', 'Asterix', 'Garfield', 'Čtyřlístek', 'Rychlé šípy', 'Pikachu', 'Naruto', 'Pokémon']) {
        assert.equal(find(name, 'komiksy').k, 1, `${name} má být známý v kategorii Komiksy a anime`);
    }
    // Známé české pořady a večerníčky jsou české, světové ne
    assert.ok(find('Kufr', 'porady').cz === 1 && find('Pošta pro tebe', 'porady').cz === 1 && !find('Big Brother', 'porady').cz);
    assert.ok(find('Rákosníček').cz === 1 && !find('Bolek a Lolek').cz);
});

test('rozšíření: přesunuté seriály si ponechaly id, úroveň a okruhy', () => {
    // Večerníčky ze seriálů, anime seriály do komiksů a anime, Top Gear do pořadů
    for (const [qid, category] of [['Q724491', 'vecernicky'], ['Q590132', 'vecernicky'], ['Q3562452', 'vecernicky'], ['Q239937', 'komiksy'], ['Q477916', 'komiksy'], ['Q33162', 'porady']]) {
        assert.equal(ctx.byId.get(qid).c, category, qid);
    }
    assert.equal(find('O krtkovi').k, 1);
    assert.ok(find('O krtkovi').g.includes('ceska-animace') && find('O krtkovi').g.includes('animovane-serialy'));
    assert.equal(find('Pokémon').ty, 'anime seriál');
    assert.ok(find('Pokémon').g.includes('anime-manga'));
    // Seriály zůstaly seriály (Simpsonovi, Krtek a Panda nejsou večerníčky)
    assert.equal(find('Simpsonovi').c, 'serialy');
    assert.equal(find('Krtek a Panda').c, 'serialy');
});

test('rozšíření: jedna položka na jméno v kategorii, fotky jen u postav', () => {
    for (const category of ['porady', 'vecernicky', 'komiksy']) {
        const names = inCategory(category).map(item => item.n.toLocaleLowerCase('cs'));
        assert.equal(new Set(names).size, names.length, category);
    }
    // Plakát, obálka nebo logo pořadu či komiksu by prozradily název: fotku mají jen postavy a týmy
    for (const item of [...inCategory('porady'), ...inCategory('vecernicky')]) assert.ok(!item.im, `${item.n}: obrázek`);
    for (const item of inCategory('komiksy').filter(other => other.im)) assert.match(item.ty, /postav|tým|klub/u, item.n);
    assert.ok(inCategory('komiksy').filter(item => item.k === 1 && item.im).length >= 20, 'známé postavy s fotkou');
    // Ruční vyřazení fotek, na kterých postava není (výloha s hračkami, hlavolam)
    assert.ok(!find('Kačer Donald').im && !find('Rychlé šípy').im);
});

test('rozšíření: okruhy pořadů, večerníčků a komiksů', () => {
    for (const id of ['ceske-porady', 'souteze-reality-show', 'talk-show', 'vecernicky-klasika', 'marvel', 'dc-comics', 'evropsky-komiks', 'cesky-komiks', 'anime-manga']) {
        assert.ok(data.collections.some(collection => collection.id === id), `okruh ${id}`);
        assert.ok(inGroup(id).length >= 15, `${id}: ${inGroup(id).length}`);
    }
    assert.ok(inGroup('marvel').some(item => item.n === 'Spider-Man') && inGroup('dc-comics').some(item => item.n === 'Batman'));
    assert.ok(inGroup('cesky-komiks').some(item => item.n === 'Čtyřlístek') && inGroup('evropsky-komiks').some(item => item.n === 'Asterix'));
    assert.ok(inGroup('ceske-porady').some(item => item.n === 'AZ-kvíz') && !inGroup('ceske-porady').some(item => item.n === 'Top Gear'));
    assert.ok(inGroup('vecernicky-klasika').some(item => item.n === 'O krtkovi'));
    // Nové okruhy jsou na konci seznamu (dřívější pořadí zůstalo)
    assert.equal(data.collections[0].id, 'cesky-film');
    assert.equal(data.collections[data.collections.length - 1].id, 'anime-manga');
});

test('pořady: fakta, moderátoři a otázka „Kdo pořad moderoval?“', () => {
    const kufr = find('Kufr', 'porady');
    const facts = film.facts(kufr, ctx, 'name');
    assert.deepEqual(facts.map(fact => fact.label), ['Vysílání', 'Země', 'Stanice']);
    assert.ok(!facts.some(fact => fact.label === 'Moderace'), 'moderátor je samostatná nápověda');
    assert.ok(film.facts(kufr, ctx, 'result').some(fact => fact.label === 'Moderace' && /Zedníček/.test(fact.value)));
    const question = film.specialQuestion(kufr, ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'host');
    assert.equal(question.title, 'Kdo pořad moderoval?');
    assert.equal(question.answerLabel, 'Pavel Zedníček');
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(core.checkAnswer('Zedníček', question));
    assert.doesNotMatch(film.censor('host', 'Soutěž moderoval Pavel Zedníček, Zedníčkův Kufr…', kufr, ctx), /Zedníč/);
    // Moderátor v názvu pořadu (Show Jana Krause): bez otázky na moderátora i bez nápovědy s ním
    const kraus = find('Show Jana Krause');
    assert.equal(film.specialQuestion(kraus, ctx, rngStartingWith(0.1)), null);
    assert.ok(film.hints(kraus, ctx, 'name').every(hint => (hint.facts || []).every(fact => !/Kraus/.test(fact.value))));
    // Nesprávné možnosti: pořady, k českému české
    for (let seed = 0; seed < 4; seed++) {
        const choices = core.buildItemChoices(kufr, data.items, core.createSeededRandom(`kufr${seed}`), other => film.similarity(kufr, other, ctx));
        assert.ok(choices.every(choice => ctx.byId.get(choice.id).c === 'porady' && ctx.byId.get(choice.id).cz === 1), choices.map(choice => choice.label).join(', '));
    }
});

test('večerníčky: autor, hlasy, režie a otázky', () => {
    const amalka = find('Říkání o víle Amálce');
    assert.equal(film.subtitle(amalka, ctx), '1975 · Československo');
    const question = film.specialQuestion(amalka, ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'creator');
    assert.equal(question.title, 'Kdo napsal předlohu večerníčku?');
    assert.equal(question.answerLabel, 'Václav Čtvrtek');
    assert.ok(question.choices.every(choice => !choice.correct || choice.label === 'Václav Čtvrtek'));
    assert.ok(core.checkAnswer('Čtvrtek', question));
    const hints = film.hints(amalka, ctx, 'name');
    assert.deepEqual(hints.map(hint => hint.label || 'fakta'), ['fakta', 'hlasy', 'předloha']);
    assert.ok(hints[2].facts.some(fact => fact.label === 'Režie'));
    assert.equal(film.specialQuestion(find('O krtkovi'), ctx, rngStartingWith(0.3)).title, 'Ve kterém desetiletí se začal vysílat?');
    // Nesprávné možnosti jsou večerníčky
    const choices = core.buildItemChoices(amalka, data.items, core.createSeededRandom('amalka'), other => film.similarity(amalka, other, ctx));
    assert.ok(choices.every(choice => ctx.byId.get(choice.id).c === 'vecernicky'), choices.map(choice => choice.label).join(', '));
});

test('komiksy a anime: druh otázky, postava k postavě, tvůrce a první výskyt', () => {
    const superman = find('Superman', 'komiksy');
    assert.equal(film.questionTitle(superman), 'Která postava to je?');
    assert.equal(film.questionTitle(find('Naruto', 'komiksy')), 'Která manga to je?');
    assert.equal(film.questionTitle(find('X-Men', 'komiksy')), 'Který tým to je?');
    assert.equal(film.questionTitle(find('Pokémon')), 'Které anime to je?');
    assert.equal(film.questionTitle(find('Asterix')), 'Který komiks to je?');
    assert.equal(film.questionTitle(find('Kufr', 'porady')), null);
    // Nesprávné možnosti: k postavě postavy, k dílu díla
    for (const name of ['Superman', 'Naruto', 'Pikachu']) {
        const item = find(name, 'komiksy');
        for (let seed = 0; seed < 4; seed++) {
            const choices = core.buildItemChoices(item, data.items, core.createSeededRandom(`${name}${seed}`), other => film.similarity(item, other, ctx));
            assert.ok(choices.every(choice => ctx.byId.get(choice.id).c === 'komiksy' && (/postav|tým|klub/u.test(ctx.byId.get(choice.id).ty) === /postav|tým|klub/u.test(item.ty))),
                `${name}: ${choices.map(choice => choice.label).join(', ')}`);
        }
    }
    // Kdo postavu vytvořil? Správný je první z tvůrců, spolutvůrce mezi nesprávnými není; psát jde kterékoli jméno
    const spider = find('Spider-Man', 'komiksy');
    const creator = film.specialQuestion(spider, ctx, rngStartingWith(0.1));
    assert.equal(creator.title, 'Kdo postavu vytvořil?');
    assert.equal(creator.answerLabel, 'Stan Lee');
    assert.ok(!creator.choices.some(choice => choice.label === 'Steve Ditko'));
    assert.ok(core.checkAnswer('Ditko', creator) && core.checkAnswer('Stan Lee', creator));
    const decade = film.specialQuestion(superman, ctx, rngStartingWith(0.3));
    assert.equal(decade.title, 'Ve kterém desetiletí se postava poprvé objevila?');
    assert.equal(decade.answerLabel, '30. léta');
    // Nápovědy: o komiksu → tvůrci → vlastní jméno a herci z filmů; vlastní jméno ani herci nejsou mezi fakty před odpovědí
    const batman = find('Batman', 'komiksy');
    const hints = film.hints(batman, ctx, 'name');
    assert.ok(hints[2].facts.some(fact => fact.value === 'Bruce Wayne'));
    assert.ok(!film.facts(batman, ctx, 'name').some(fact => fact.label === 'Vlastním jménem'));
    assert.ok(film.facts(batman, ctx, 'result').some(fact => fact.label === 'Ve filmech'));
    // Psaná odpověď: anglický název (Kačer Donald – Donald Duck)
    assert.ok(film.nameAliases(find('Kačer Donald'), ctx).includes('Donald Duck'));
});
