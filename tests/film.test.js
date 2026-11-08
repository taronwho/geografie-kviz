// Testy tématu Film na skutečných datech (data/film.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');
const film = require('../topics/film.js');

const data = require(path.join(__dirname, '..', 'data', 'film.json'));
const ctx = { topic: film, items: data.items, collections: data.collections, countries: {}, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
// Generátor, který poprvé vrátí zadané číslo (volba druhu otázky) a pak pokračuje se semínkem
const rngStartingWith = (first, seed = 'film') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);

test('film: známé filmy a filmaři, česká stopa', () => {
    for (const name of ['Kmotr', 'Titanic', 'Casablanca', 'Pulp Fiction: Historky z podsvětí', 'Alfred Hitchcock', 'Steven Spielberg', 'Charlie Chaplin', 'Marilyn Monroe']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    for (const name of ['Ostře sledované vlaky', 'Kolja', 'Pelíšky', 'Obecná škola', 'Tři oříšky pro Popelku', 'Marketa Lazarová', 'Kulový blesk',
        'Vesničko má středisková', 'Limonádový Joe aneb Koňská opera', 'Miloš Forman', 'Jiří Menzel', 'Rudolf Hrušínský', 'Libuše Šafránková', 'Bolek Polívka']) {
        const item = find(name);
        assert.ok(item.k === 1 && item.cz === 1, `${name}: známá česká položka`);
    }
    // Koprodukce natočené v Praze nejsou české filmy, zpěváci a politici nejsou herci
    assert.ok(!find('Casino Royale').cz);
    assert.ok(!data.items.some(item => ['Ronald Reagan', 'Madonna', 'Frank Sinatra', 'Donald Trump', 'Walt Disney'].includes(item.n)));
    assert.equal(find('Lída Baarová').c, 'herci', 'herečka má přednost před filmem stejného jména');
    // Filmy bez obrázku (plakáty nejsou volné), filmaři s fotkou
    assert.ok(data.items.filter(item => item.c === 'filmy').every(item => !item.im));
    assert.ok(data.items.filter(item => item.c !== 'filmy' && item.k === 1).filter(item => item.im).length >= 150);
    // Animované filmy mají vlastní kategorii, mezi filmy nejsou
    assert.ok(data.items.filter(item => item.ty === 'animovaný film').every(item => item.c === 'animovane'));
});

test('film: kontrola dat – roky, jedna položka na jméno, filmografie', () => {
    const thisYear = new Date().getFullYear();
    for (const item of data.items) {
        const f = item.f || {};
        if (f.born !== undefined && f.died !== undefined) assert.ok(f.died > f.born && f.died - f.born <= 105, `${item.n}: ${f.born}–${f.died}`);
        for (const year of [f.born, f.died, f.year]) assert.ok(year === undefined || year <= thisYear, `${item.n}: rok ${year}`);
        if (['filmy', 'animovane', 'serialy'].includes(item.c)) assert.ok(f.year >= 1880, `${item.n}: bez roku`);
        else assert.ok(f.born !== undefined && f.films && f.films.length, `${item.n}: bez narození nebo filmů`);
    }
    assert.equal(new Set(data.items.map(item => item.n.toLocaleLowerCase('cs'))).size, data.items.length);
    assert.deepEqual(find('Pelíšky').f.dir, ['Jan Hřebejk']);
    assert.ok(find('Kolja').f.cast.includes('Zdeněk Svěrák'));
    assert.ok(find('Miloš Forman').f.films.includes('Přelet nad kukaččím hnízdem'));
    // V obsazení napřed herci, ne režisér v cameo roli
    assert.ok(!find('Vesničko má středisková').f.cast.includes('František Vláčil'));
});

test('film: nápovědy k názvu filmu – fakta, herci, režie; fakta podle otázky', () => {
    const godfather = find('Kmotr');
    const hints = film.hints(godfather, ctx, 'name');
    assert.deepEqual(hints.map(hint => hint.label || 'fakta'), ['fakta', 'hrají', 'režie']);
    assert.ok(hints[0].facts.some(fact => fact.label === 'Rok' && fact.value === '1972'));
    assert.ok(hints[0].facts.some(fact => fact.label === 'Oscar'));
    assert.match(hints[1].facts[0].value, /Marlon Brando/);
    assert.equal(hints[2].facts[0].value, 'Francis Ford Coppola');
    assert.ok(!film.facts(godfather, ctx, 'name').some(fact => fact.label === 'Režie'), 'režie je až samostatná nápověda');
    assert.ok(film.facts(godfather, ctx, 'result').some(fact => fact.label === 'Režie'));
    assert.ok(!film.facts(godfather, ctx, 'decade').some(fact => fact.label === 'Rok'));
    // Film se hádá z popisu a nápověd, osa jen po odpovědi; filmař má osu života s milníky filmu
    assert.equal(film.visual(godfather, ctx, 'name'), null);
    assert.equal(film.visual(godfather, ctx, 'result').type, 'timeline');
    const forman = core.buildTimeline(film.visual(find('Miloš Forman'), ctx, 'name'), 360).anchors.map(anchor => anchor.label);
    assert.ok(forman.some(label => /nové vlny|pražské jaro|Karlových Varech|Barrandov|komunistický/.test(label)), forman.join(' / '));
    // Psaná odpověď: původní název a část před „aneb“; příjmení jen nezaměnitelné (Jan a Zdeněk Svěrák ne)
    assert.ok(film.nameAliases(godfather, ctx).includes('The Godfather'));
    assert.ok(film.nameAliases(find('Limonádový Joe aneb Koňská opera'), ctx).includes('Limonádový Joe'));
    assert.deepEqual(film.nameAliases(find('Miloš Forman'), ctx), ['Forman']);
    assert.deepEqual(film.nameAliases(find('Jan Svěrák'), ctx), []);
    assert.equal(film.subtitle(find('Pelíšky'), ctx), '1999 · Jan Hřebejk');
});

test('film: „Kdo film režíroval?“ – jediný režisér, režiséři podobné doby a země, zakrytý režisér', () => {
    const kolja = find('Kolja');
    const question = film.specialQuestion(kolja, ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'director');
    assert.equal(question.answerLabel, 'Jan Svěrák');
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(question.choices.every(choice => ctx.byId.get(choice.id).c === 'reziseri'));
    assert.ok(question.choices.filter(choice => ctx.byId.get(choice.id).cz === 1).length >= 3, question.choices.map(c => c.label).join(', '));
    assert.ok(core.checkAnswer('Jan Svěrák', question) && !core.checkAnswer('Zdeněk Svěrák', question));
    assert.doesNotMatch(film.censor('director', 'Kolja je film Jana Svěráka podle scénáře Zdeňka Svěráka.', kolja, ctx), /Jana Svěráka/);
    // Nápovědy: o filmu → herci → další filmy režiséra (bez hádaného)
    const hints = film.hints(kolja, ctx, 'director');
    assert.deepEqual(hints.map(hint => hint.label), ['o filmu', 'hrají', 'další filmy']);
    assert.ok(!/Kolja/.test(hints[2].facts[0].value) && /Obecná škola/.test(hints[2].facts[0].value));
    // Režisér v obsazení se v nápovědě „hrají“ neukáže (Tarantino v Pulp Fiction)
    const pulp = find('Pulp Fiction: Historky z podsvětí');
    assert.ok(!film.hints(pulp, ctx, 'director')[1].facts[0].value.includes('Quentin Tarantino'));
    // Film více režisérů otázku nemá
    assert.equal(film.specialQuestion(find('Sedmikrásky'), ctx, rngStartingWith(0.1)), null);
    assert.deepEqual(film.findAnswer('director', 'Jiří Menzel', kolja, ctx), { topic: 'film', id: find('Jiří Menzel').q });
});

test('film: „Ve kterém desetiletí měl premiéru?“ – sousední desetiletí, přesná odpověď, zakryté roky', () => {
    const trains = find('Ostře sledované vlaky');
    const question = film.specialQuestion(trains, ctx, rngStartingWith(0.3));
    assert.equal(question.type, 'decade');
    assert.equal(question.answerLabel, '60. léta');
    const decades = question.choices.map(choice => Number(choice.id.replace('desetileti-', ''))).sort((a, b) => a - b);
    assert.ok(decades.every(decade => Math.abs(decade - 1960) <= 30), decades.join(', '));
    assert.ok(decades.includes(1950) && decades.includes(1970));
    for (const answer of ['60. léta', '60', '1960', '1966', 'šedesátá léta', 'sedesata leta']) assert.ok(core.checkAnswer(answer, question), answer);
    for (const answer of ['70. léta', 'sedmdesátá léta', '1970', '1959']) assert.ok(!core.checkAnswer(answer, question), answer);
    assert.doesNotMatch(film.censor('decade', 'Film z roku 1966 natočil v 60. letech Jiří Menzel, šedesátá léta byla zlatá.', trains, ctx), /1966|60\.|šedesát/);
    const hints = film.hints(trains, ctx, 'decade');
    assert.deepEqual(hints.map(hint => hint.label || (hint.spec && hint.spec.name)), ['žánr a země', 'osa bez letopočtů', 'hrají', 'režie', 've stejné době']);
    // Osa bez letopočtů: jen názvy událostí před a po filmu
    const blind = core.buildTimeline(hints[1].spec, 340);
    assert.equal(blind.ticks.length, 0);
    assert.ok(blind.anchors.length >= 2 && blind.anchors.every(anchor => !/\d/.test(anchor.label)), blind.anchors.map(anchor => anchor.label).join(' / '));
    assert.ok(hints.every(hint => (hint.facts || []).every(fact => !/\b19\d\d\b/.test(fact.value))), 'nápovědy bez letopočtu');
    // Premiéra na přelomu desetiletí nebo natočení jindy – na desetiletí se neptáme
    const uncertain = data.items.find(item => item.c === 'filmy' && !item.f.dq);
    assert.ok(uncertain);
    assert.equal(film.specialQuestion(uncertain, ctx, rngStartingWith(0.3)), null);
    assert.equal(film.specialQuestion(trains, ctx, rngStartingWith(0.9)), null);
    // Popisky desetiletí: 20. století zkráceně, jinak celým rokem
    const avatar = film.specialQuestion(find('Avatar'), ctx, rngStartingWith(0.3));
    assert.equal(avatar.answerLabel, '2000. léta');
});

test('film: nesprávné možnosti a okruhy', () => {
    const wrongOptions = (name) => [0, 1, 2].map(seed => core.buildItemChoices(find(name), data.items, core.createSeededRandom(`${name}${seed}`),
        other => film.similarity(find(name), other, ctx)).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id)));
    for (const options of wrongOptions('Pelíšky')) assert.ok(options.every(other => other.cz === 1), options.map(o => o.n).join(', '));
    for (const options of wrongOptions('Libuše Šafránková')) assert.ok(options.every(other => other.sx === 'f' && other.cz === 1), options.map(o => o.n).join(', '));
    for (const options of wrongOptions('Alfred Hitchcock')) assert.ok(options.every(other => other.f.born < 1950), options.map(o => o.n).join(', '));
    assert.ok(data.collections.length >= 8 && data.collections.length <= 30);
    assert.ok(inCollection('cesky-film').includes('Kolja') && !inCollection('cesky-film').includes('Kmotr'));
    assert.ok(inCollection('ceska-klasika').includes('Ostře sledované vlaky') && !inCollection('ceska-klasika').includes('Pelíšky'));
    assert.ok(inCollection('pohadky').includes('Tři oříšky pro Popelku'));
    assert.ok(inCollection('oscar-film').includes('Kmotr'));
    assert.ok(inCollection('drzitele-oscara').includes('Miloš Forman'));
    assert.ok(inCollection('westerny').includes('Limonádový Joe aneb Koňská opera'));
});

test('film: Hrají podle obsazení (pořadí v titulcích), ne podle slávy herce', () => {
    // Captain Marvel: Brie Larson v hlavní roli, ne Scarlett Johansson v krátké scéně po titulcích
    assert.deepEqual(find('Captain Marvel').f.cast.slice(0, 2), ['Brie Larson', 'Samuel L. Jackson']);
    assert.ok(!find('Captain Marvel').f.cast.includes('Scarlett Johanssonová'));
    assert.equal(find('Avengers: Endgame').f.cast[0], 'Robert Downey Jr.');
    assert.deepEqual(find('Kmotr').f.cast.slice(0, 2), ['Marlon Brando', 'Al Pacino']);
});

// --- Animované filmy a seriály ---

test('film: animované filmy – vlastní kategorie, studio a známost', () => {
    const animated = data.items.filter(item => item.c === 'animovane');
    assert.ok(animated.length >= 100 && animated.length <= 300, `animovaných filmů ${animated.length}`);
    const known = animated.filter(item => item.k === 1).length / animated.length;
    assert.ok(known >= 0.2 && known <= 0.35, `známých ${known}`);
    for (const name of ['Lví král', 'Shrek', 'Toy Story: Příběh hraček', 'Ledové království']) assert.equal(find(name).k, 1, `${name} má být známý`);
    assert.equal(find('Lví král').c, 'animovane');
    assert.equal(find('Toy Story: Příběh hraček').f.studio, 'Pixar');
    assert.ok(animated.some(item => item.cz === 1), 'česká animace');
    assert.ok(animated.every(item => !item.im), 'plakáty nejsou volné');
    // Okruhy studií
    assert.ok(inCollection('pixar').includes('Toy Story: Příběh hraček') && inCollection('disney').includes('Lví král'));
    assert.ok(!data.collections.some(collection => collection.id === 'animovane'), 'okruh Animované filmy nahradila kategorie');
});

test('film: otázka „Které studio film natočilo?“ – bez druhé správné odpovědi (Pixar a Disney)', () => {
    const toyStory = find('Toy Story: Příběh hraček');
    for (let seed = 0; seed < 8; seed++) {
        const question = film.specialQuestion(toyStory, ctx, rngStartingWith(0.3, `studio${seed}`));
        assert.equal(question.type, 'studio');
        assert.equal(question.answerLabel, 'Pixar');
        assert.equal(question.choices.filter(choice => choice.correct).length, 1);
        assert.ok(!question.choices.some(choice => choice.label === 'Walt Disney'), 'filmy Pixaru vydával Disney');
    }
    const lionKing = film.specialQuestion(find('Lví král'), ctx, rngStartingWith(0.3));
    assert.ok(core.checkAnswer('Disney', lionKing) && !core.checkAnswer('Pixar', lionKing));
    // Popis bez jména studia, název filmu zůstane
    const text = film.censor('studio', 'Toy Story je animovaný film studia Pixar, který distribuovalo studio Walt Disney Pictures.', toyStory, ctx);
    assert.doesNotMatch(text, /Pixar|Disney/);
    // Ostatní otázky animovaného filmu: desetiletí premiéry, jinak název
    assert.equal(film.specialQuestion(find('Shrek'), ctx, rngStartingWith(0.5)).type, 'decade');
    assert.equal(film.specialQuestion(find('Shrek'), ctx, rngStartingWith(0.9)), null);
});

test('film: seriály – české i světové, tvůrce, vysílání a otázky', () => {
    const series = data.items.filter(item => item.c === 'serialy');
    assert.ok(series.length >= 100 && series.length <= 300, `seriálů ${series.length}`);
    const known = series.filter(item => item.k === 1).length / series.length;
    assert.ok(known >= 0.2 && known <= 0.35, `známých ${known}`);
    for (const name of ['Simpsonovi', 'Přátelé', 'Nemocnice na kraji města', 'Arabela', 'Návštěvníci']) assert.equal(find(name).k, 1, `${name} má být známý`);
    assert.ok(find('Nemocnice na kraji města').cz === 1 && !find('Simpsonovi').cz);
    // Soutěže a reality show nejsou seriály
    assert.ok(!series.some(item => /SuperStar|má talent|Big Brother/u.test(item.n)));
    const hospital = find('Nemocnice na kraji města');
    assert.deepEqual(film.facts(hospital, ctx, 'name').map(fact => fact.label).slice(0, 1), ['Vysílání']);
    assert.ok(!film.facts(hospital, ctx, 'name').some(fact => fact.label === 'Scénář'), 'autor je samostatná nápověda');
    assert.equal(film.subtitle(find('Simpsonovi'), ctx).split(' · ')[0], 'od 1989');
    // Kdo napsal scénář? – možnosti jsou scenáristé jiných českých seriálů
    const writer = film.specialQuestion(hospital, ctx, rngStartingWith(0.1));
    assert.equal(writer.type, 'creator');
    assert.equal(writer.title, 'Kdo napsal scénář seriálu?');
    assert.equal(writer.answerLabel, 'Jaroslav Dietl');
    assert.equal(writer.choices.filter(choice => choice.correct).length, 1);
    assert.ok(core.checkAnswer('Dietl', writer));
    assert.doesNotMatch(film.censor('creator', 'Seriál napsal Jaroslav Dietl, Dietlův scénář…', hospital, ctx), /Dietl/);
    const simpsons = film.specialQuestion(find('Simpsonovi'), ctx, rngStartingWith(0.1));
    assert.equal(simpsons.title, 'Kdo seriál vytvořil?');
    assert.equal(simpsons.answerLabel, 'Matt Groening');
    // Desetiletí začátku vysílání
    const decade = film.specialQuestion(find('Simpsonovi'), ctx, rngStartingWith(0.3));
    assert.equal(decade.title, 'Ve kterém desetiletí se začal vysílat?');
    assert.equal(decade.answerLabel, '80. léta');
    // Nesprávné možnosti seriálu jsou seriály (ne filmy) a k českému české
    for (let seed = 0; seed < 4; seed++) {
        const choices = core.buildItemChoices(hospital, data.items, core.createSeededRandom(`nemocnice${seed}`), other => film.similarity(hospital, other, ctx));
        assert.ok(choices.every(choice => ctx.byId.get(choice.id).c === 'serialy' && ctx.byId.get(choice.id).cz === 1), choices.map(choice => choice.label).join(', '));
    }
    assert.ok(inCollection('ceske-serialy').includes('Arabela') && inCollection('animovane-serialy').includes('Simpsonovi'));
});
