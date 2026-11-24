// Téma Sport a hry, hry: deskové a karetní hry, šachy a videohry (scripts/lib/sport-hry.mjs) na skutečných datech
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const sport = require('../topics/sport.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sport.json'), 'utf8'));
const ctx = { topic: sport, items: data.items, collections: data.collections, countries: {}, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name, category) => {
    const item = data.items.find(candidate => candidate.n === name && (!category || candidate.c === category));
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCategory = (category) => data.items.filter(item => item.c === category);
const rngStartingWith = (first, seed = 'hry') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const GAMES = ['deskove', 'sachy', 'videohry'];

test('hry: nové kategorie na konci seznamu, Sport a hry, velikost a známé položky', () => {
    assert.equal(sport.title, 'Sport a hry');
    assert.deepEqual(sport.categories.map(category => category.key), ['sportovci', 'olympiady', 'sporty', 'kluby', 'sportoviste', 'souteze', ...GAMES]);
    for (const [category, min, known] of [['deskove', 70, 20], ['sachy', 100, 20], ['videohry', 180, 40]]) {
        const list = inCategory(category);
        const knownCount = list.filter(item => item.k === 1).length;
        assert.ok(list.length >= min, `${category}: ${list.length}`);
        assert.ok(knownCount >= known, `${category}: známých ${knownCount}`);
        assert.ok(knownCount / list.length <= 0.45, `${category}: Základní ${knownCount / list.length}`);
        assert.ok(list.filter(item => item.x).length >= list.length * 0.15, `${category}: expertních ${list.filter(item => item.x).length}`);
        assert.ok(list.every(item => item.t && item.ty && item.f), `${category}: článek, druh a údaje`);
        assert.ok(list.every(item => !(item.k === 1 && item.x)), `${category}: známá položka není expertní`);
    }
    for (const name of ['Šachy', 'Člověče, nezlob se!', 'Monopoly', 'Dostihy a sázky', 'Prší', 'Mariáš', 'Poker', 'Scrabble', 'Uno']) {
        assert.equal(find(name, 'deskove').k, 1, `${name} má být známá hra`);
    }
    for (const name of ['Král', 'Dáma', 'Pěšec', 'Jezdec', 'Rošáda', 'Mat', 'Pat', 'Sicilská obrana', 'Dámský gambit', 'Deep Blue']) {
        assert.equal(find(name, 'sachy').k, 1, `${name} má být známý šachový pojem`);
    }
    for (const name of ['Minecraft', 'Tetris', 'Super Mario Bros.', 'Pac-Man', 'Grand Theft Auto V', 'Mafia: The City of Lost Heaven', 'Kingdom Come: Deliverance']) {
        assert.equal(find(name, 'videohry').k, 1, `${name} má být známá videohra`);
    }
    // Česká stopa
    assert.ok(find('Krycí jména').cz === 1 && find('Mafia: The City of Lost Heaven').cz === 1 && !find('Monopoly').cz && !find('Minecraft').cz);
    // Šachisté nejsou položkami (jen fakty), konzole nejsou (má je Technika)
    assert.ok(!data.items.some(item => GAMES.includes(item.c) && /šachist|herní konzole/u.test(item.d || '')));
});

test('hry: žádná položka jiného tématu, existující položky beze změny kategorie, jména jednou v kategorii', () => {
    const own = new Set(data.items.map(item => item.q));
    for (const file of fs.readdirSync(path.join(ROOT, 'data'))) {
        if (file === 'sport.json' || !file.endsWith('.json')) continue;
        let other;
        try { other = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8')); } catch { continue; }
        const clash = (Array.isArray(other.items) ? other.items : []).filter(item => item && item.q && own.has(item.q) && GAMES.includes(ctx.byId.get(item.q).c));
        assert.deepEqual(clash.map(item => `${item.q} ${item.n}`), [], `hry v ${file}`);
    }
    assert.equal(new Set(data.items.map(item => item.q)).size, data.items.length, 'id jednou');
    for (const category of GAMES) {
        const names = inCategory(category).map(item => item.n.toLocaleLowerCase('cs'));
        assert.equal(new Set(names).size, names.length, `${category}: stejné jméno dvakrát`);
    }
    // Původní položky jsou před hrami (pokrok hráčů je na nich, pořadí se nemění)
    const firstGame = data.items.findIndex(item => GAMES.includes(item.c));
    assert.ok(data.items.slice(firstGame).every(item => GAMES.includes(item.c)));
});

test('hry: otázka podle druhu a nesprávné možnosti stejného druhu', () => {
    const rng = core.createSeededRandom('hry-moznosti');
    const checkKind = (item, sameKind) => {
        const choices = core.buildItemChoices(item, data.items, rng, other => sport.similarity(item, other, ctx));
        const wrong = choices.filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
        assert.equal(wrong.length, 3, item.n);
        for (const other of wrong) assert.ok(sameKind(other), `${item.n}: ${other.n} (${other.ty})`);
    };
    assert.equal(sport.questionTitle(find('Prší')), 'Která karetní hra to je?');
    assert.equal(sport.questionTitle(find('Monopoly')), 'Která desková hra to je?');
    assert.equal(sport.questionTitle(find('Pěšec')), 'Která šachová figura to je?');
    assert.equal(sport.questionTitle(find('Sicilská obrana')), 'Které šachové zahájení to je?');
    assert.equal(sport.questionTitle(find('Rošáda')), null, 'pojem: otázka kategorie');
    assert.equal(sport.categories.find(category => category.key === 'sachy').question, 'Co je to za šachový pojem?');
    assert.equal(sport.questionTitle(find('Minecraft')), null);
    for (let i = 0; i < 5; i++) {
        checkKind(find('Prší'), other => /karetní/u.test(other.ty));
        checkKind(find('Monopoly'), other => ['desková hra', 'hra s kameny', 'stolní hra', 'kostková hra', 'hra na papíře'].includes(other.ty));
        checkKind(find('Jezdec'), other => other.ty === 'figura');
        checkKind(find('Sicilská obrana'), other => other.ty === 'zahájení');
        checkKind(find('Rošáda'), other => ['pravidlo', 'motiv', 'mat', 'vybavení', 'titul', 'organizace'].includes(other.ty));
        checkKind(find('Minecraft'), other => other.c === 'videohry');
    }
});

test('hry: nápovědy pomáhají a odpověď neprozradí', () => {
    const plain = (hints) => hints.flatMap(hint => hint.facts || []).map(entry => entry.value).join(' · ');
    // Figura: hodnota a tah; zahájení: skupina a tahy
    const knight = sport.hints(find('Jezdec'), ctx, 'name');
    assert.match(plain(knight), /3 pěšci/);
    assert.match(plain(knight), /písmene L/);
    const sicilian = sport.hints(find('Sicilská obrana'), ctx, 'name');
    assert.match(plain(sicilian), /polootevřená hra/);
    assert.match(plain(sicilian), /1\. e4 c5/);
    // Šachisté jako fakt u soutěží a partií
    assert.match(plain(sport.hints(find('Mistrovství světa v šachu'), ctx, 'name')), /Kasparov/);
    assert.match(plain(sport.hints(find('Nesmrtelná partie'), ctx, 'name')), /Anderssen/);
    // Fakt se jménem hry se nenabídne (autor Fischer u Fischerových šachů, série u GTA)
    assert.doesNotMatch(plain(sport.hints(find('Fischerovy šachy'), ctx, 'name')), /Fischer/);
    assert.doesNotMatch(plain(sport.hints(find('Grand Theft Auto V'), ctx, 'name')), /Grand Theft Auto/);
    // Videohra: rok a žánr, vývojář, série a platformy
    const minecraft = sport.hints(find('Minecraft'), ctx, 'name');
    assert.ok(minecraft.some(hint => (hint.facts || []).some(entry => entry.label === 'Vydáno')));
    assert.ok(minecraft.some(hint => (hint.facts || []).some(entry => entry.label === 'Vývojář' && /Mojang/.test(entry.value))));
    // Každá nápověda faktů u her má aspoň jeden fakt u většiny položek (jinak by nic nevyřadila)
    for (const category of GAMES) {
        const list = inCategory(category);
        const useful = list.filter(item => sport.hints(item, ctx, 'name').filter(hint => hint.kind === 'facts' && hint.facts.length).length >= 1);
        assert.ok(useful.length >= list.length * 0.85, `${category}: nápovědy s fakty jen u ${useful.length} z ${list.length}`);
    }
});

test('hry: Které studio hru vyvinulo? a Kdo hru vymyslel?', () => {
    const gta = find('Grand Theft Auto V');
    const studio = sport.specialQuestion(gta, ctx, rngStartingWith(0.1));
    assert.equal(studio.type, 'studio');
    assert.equal(studio.title, 'Které studio hru vyvinulo?');
    assert.equal(studio.choices.length, 4);
    assert.equal(studio.choices.filter(choice => choice.correct).length, 1);
    assert.ok(!studio.choices.some(choice => !choice.correct && /Rockstar/.test(choice.label)), 'jiné studio téže firmy by bylo druhou správnou');
    assert.ok(core.checkAnswer('Rockstar North', studio));
    assert.doesNotMatch(sport.censor('studio', 'Grand Theft Auto V vyvinulo studio Rockstar North a vydala firma Rockstar Games.', gta, ctx), /Rockstar/);
    assert.equal(sport.specialQuestion(gta, ctx, rngStartingWith(0.9)), null);
    const codenames = find('Krycí jména');
    const author = sport.specialQuestion(codenames, ctx, rngStartingWith(0.1));
    assert.equal(author.type, 'author');
    assert.equal(author.answerLabel, 'Vlaada Chvátil');
    assert.ok(core.checkAnswer('Chvátil', author));
    assert.doesNotMatch(sport.censor('author', 'Hru vymyslel Vlaada Chvátil.', codenames, ctx), /Chvátil/);
    // Šachy jen název
    assert.equal(sport.specialQuestion(find('Rošáda'), ctx, rngStartingWith(0.1)), null);
});

test('hry: psané odpovědi a okruhy', () => {
    const accepted = (item) => core.nameAnswers(item, sport.nameAliases(item, ctx));
    assert.ok(core.isAnswerMatch('GTA V', accepted(find('Grand Theft Auto V'))));
    assert.ok(core.isAnswerMatch('Skyrim', accepted(find('The Elder Scrolls V: Skyrim'))));
    // Název před dvojtečkou jen u jediné hry (Mafia má víc dílů)
    assert.ok(!core.isAnswerMatch('Mafia', accepted(find('Mafia: Domovina'))));
    assert.ok(core.isAnswerMatch('FIDE', accepted(find('Mezinárodní šachová federace'))));
    assert.ok(core.isAnswerMatch('zugzwang', accepted(find('Nevýhoda tahu'))));
    assert.ok(core.isAnswerMatch('Catan', accepted(find('Osadníci z Katanu'))));
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    assert.ok(inCollection('sachova-zahajeni').includes('Sicilská obrana'));
    assert.ok(inCollection('karetni-hry').includes('Mariáš') && !inCollection('karetni-hry').includes('Monopoly'));
    assert.ok(inCollection('ceske-hry').includes('Krycí jména') && inCollection('ceske-hry').includes('Mafia: The City of Lost Heaven'));
    assert.ok(inCollection('retro-videohry').includes('Pac-Man') && !inCollection('retro-videohry').includes('Minecraft'));
    for (const id of ['karetni-hry', 'sachova-pravidla', 'sachova-zahajeni', 'ceske-hry', 'retro-videohry', 'moderni-videohry']) {
        const members = data.items.filter(item => (item.g || []).includes(id));
        assert.ok(members.length >= 8, `${id}: ${members.length}`);
        assert.ok(members.filter(item => item.k === 1).length >= Math.ceil(members.length * 0.2), `${id}: málo známých`);
    }
});
