// Regresní testy z kontroly otázek (úkol #42): věcné chyby v datech a v nabídce možností, které se dají hlídat automaticky
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');
const chemie = require('../topics/chemie.js');
const historie = require('../topics/historie.js');
const sport = require('../topics/sport.js');

const load = (name) => require(path.join(__dirname, '..', 'data', `${name}.json`));
const find = (data, name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const nationality = () => import(path.join(__dirname, '..', 'scripts', 'lib', 'nationality.mjs'));

test('národnost z popisu: země osobnosti souhlasí s přídavným jménem', async () => {
    const { nationsOf, isLandConsistent, landByDescription, landsByDescription } = await nationality();
    assert.deepEqual(nationsOf('americký architekt').map(nation => nation[1]), ['Spojené státy americké']);
    assert.deepEqual(nationsOf('anglický, skotský a irský král').map(nation => nation[1]), ['Spojené království'.replace('Spojené království', 'Anglie'), 'Skotsko', 'Irsko']);
    assert.deepEqual(nationsOf('maďarský a britský fyzik').map(nation => nation[1]), ['Maďarsko', 'Spojené království']);
    assert.deepEqual(nationsOf('fyzik americký'), [], 'řadu přídavných jmen ukončí první podstatné jméno');
    // Wikidata: Willy Brandt – Norsko, Boris Johnson – USA, Wellington – Portugalské království
    assert.equal(isLandConsistent('německý politik', 'Norsko'), false);
    assert.equal(isLandConsistent('britský politik', 'Spojené státy americké'), false);
    assert.equal(isLandConsistent('německý fyzik', 'Pruské království'), true, 'historický stát souhlasí');
    assert.equal(isLandConsistent('skotský matematik', 'Skotské království'), true);
    assert.equal(isLandConsistent('politik', 'Norsko'), true, 'bez národnosti v popisu platí cokoli');
    assert.equal(landByDescription('italský architekt', ['Francie', 'Itálie']), 'Itálie');
    assert.equal(landByDescription('italský architekt', ['Francie']), 'Itálie');
    assert.equal(landByDescription('architekt', ['Francie']), 'Francie');
    // Film: země z popisu napřed, i když ji Wikidata vynechala (Pro hrst dolarů: Španělsko, USA)
    assert.deepEqual(landsByDescription('italský spaghetti western', ['Španělsko', 'Spojené státy americké']).slice(0, 2), ['Itálie', 'Španělsko']);
    assert.deepEqual(landsByDescription('britsko-americký film', ['Spojené státy americké', 'Francie']).slice(0, 2), ['Spojené království', 'Spojené státy americké']);
});

test('země osobností ve fyzice, chemii, dějinách a architektuře souhlasí s popisem', async () => {
    const { isLandConsistent } = await nationality();
    for (const topic of ['fyzika', 'chemie', 'historie', 'architektura']) {
        for (const item of load(topic).items) {
            const land = (item.f || {}).land;
            // Panovník si nechává zemi původu (česká královna ze Španělska)
            if (!land || !item.d || item.c === 'panovnik') continue;
            assert.ok(isLandConsistent(item.d, land), `${topic}/${item.n}: „${item.d}“ × ${land}`);
        }
    }
    const history = load('historie');
    assert.equal(find(history, 'Willy Brandt').f.land, 'Německo');
    assert.equal(find(history, 'Boris Johnson').f.land, 'Spojené království');
    assert.equal(find(history, 'Kateřina II. Veliká').f.land, 'Rusko');
    assert.equal(find(load('architektura'), 'Richard Meier').f.land, 'Spojené státy americké');
    assert.equal(find(load('architektura'), 'Renzo Piano').f.land, 'Itálie');
    assert.equal(find(load('fyzika'), 'Lise Meitnerová').f.land, 'Rakousko');
});

test('film: první země odpovídá popisu („britský film“ nemá být z Japonska)', async () => {
    const { isLandConsistent } = await nationality();
    const film = load('film');
    for (const item of film.items.filter(candidate => candidate.c === 'filmy')) {
        assert.ok(isLandConsistent(item.d, item.f.land[0]), `${item.n}: „${item.d}“ × ${item.f.land.join(', ')}`);
    }
    assert.deepEqual(find(film, 'Pro hrst dolarů').f.land, ['Itálie', 'Španělsko']);
    assert.equal(find(film, 'Teorie všeho').f.land[0], 'Spojené království');
    assert.equal(find(film, 'Duna').f.land[0], 'Spojené státy americké');
});

test('chemie: hustota plynů se nezaokrouhlí na nulu a kapaliny nejsou tisíckrát lehčí', () => {
    const data = load('chemie');
    const ctx = { items: data.items, countries: {} };
    const densityOf = (name) => chemie.facts(find(data, name), ctx, 'name').find(fact => fact.label === 'Hustota').value;
    assert.equal(densityOf('Vodík'), '0,00009 g/cm³');
    assert.equal(densityOf('Helium'), '0,00018 g/cm³');
    assert.equal(densityOf('Zlato'), '19,32 g/cm³');
    assert.equal(find(data, 'Chlorid amonný').f.dens, 1.527);
    assert.equal(find(data, 'Kyselina kyanovodíková').f.dens, 0.687);
    for (const item of data.items.filter(candidate => candidate.f.dens !== undefined)) {
        const shown = chemie.facts(item, ctx, 'name').find(fact => fact.label === 'Hustota');
        assert.ok(shown && !/^0 g/.test(shown.value), `${item.n}: ${shown && shown.value}`);
    }
});

test('chemie: vzorce v obvyklém zápisu, ne v Hillově (BaSO₄, ne BaO₄S) a bez překlepů', () => {
    const data = load('chemie');
    const expected = {
        'Síran barnatý': 'BaSO₄', 'Síran amonný': '(NH₄)₂SO₄', 'Chlorid amonný': 'NH₄Cl', 'Bromovodík': 'HBr', 'Fluorovodík': 'HF',
        'Oxid sírový': 'SO₃', 'Oxid fosforečný': 'P₄O₁₀', 'Uhličitan draselný': 'K₂CO₃', 'Chlorečnan draselný': 'KClO₃', 'Dusičnan olovnatý': 'Pb(NO₃)₂'
    };
    for (const [name, formula] of Object.entries(expected)) {
        const item = find(data, name);
        assert.equal(item.f.formula, formula, name);
        assert.equal(item.f.plain, formula.replace(/[₀-₉]/g, digit => '₀₁₂₃₄₅₆₇₈₉'.indexOf(digit)), `${name}: prostý zápis`);
        assert.deepEqual([...core.formulaCounts(item.f.formula)], [...core.formulaCounts(item.f.plain)], `${name}: vzorec i prostý zápis mají stejné atomy`);
    }
    for (const item of data.items.filter(candidate => candidate.c === 'latky' && candidate.f.formula)) {
        assert.doesNotMatch(item.f.formula, /CIO/, `${item.n}: velké I místo l ve vzorci ${item.f.formula}`);
        // Anorganické látky s H a bez C v abecedním pořadí prvků (ClH₄N, BrH) jsou Hillův zápis
        assert.doesNotMatch(item.f.formula, /^(Br|Cl|F|I)H[₀-₉]?$/, `${item.n}: ${item.f.formula}`);
    }
    assert.equal(find(data, 'Wolfram').f.named, undefined, 'vlk obecný není původ názvu wolframu');
});

test('dějiny: část a celek (Říjnová revoluce × Ruská revoluce) nejsou nabídnuty spolu', () => {
    const data = load('historie');
    const names = new Set(data.items.map(item => item.n.toLocaleLowerCase('cs')));
    const parts = data.items.filter(item => item.f.war && names.has(item.f.war.toLocaleLowerCase('cs')) && item.f.war.toLocaleLowerCase('cs') !== item.n.toLocaleLowerCase('cs'));
    assert.ok(parts.length >= 10);
    const similarity = (item) => (other) => historie.similarity(item, other, {});
    for (const part of parts) {
        const whole = data.items.find(item => item.n.toLocaleLowerCase('cs') === part.f.war.toLocaleLowerCase('cs'));
        for (const [asked, shown] of [[part, whole], [whole, part]]) {
            for (let seed = 0; seed < 25; seed++) {
                const choices = core.buildItemChoices(asked, data.items, core.createSeededRandom(`${asked.q}-${seed}`), similarity(asked));
                assert.ok(!choices.some(choice => choice.id === shown.q), `${asked.n}: v možnostech i ${shown.n}`);
            }
        }
    }
    const revolution = find(data, 'Ruská revoluce');
    for (let seed = 0; seed < 100; seed++) {
        const labels = core.buildItemChoices(revolution, data.items, core.createSeededRandom(`ruska-${seed}`), similarity(revolution)).map(choice => choice.label);
        assert.ok(!labels.includes('Říjnová revoluce') && !labels.includes('Únorová revoluce'), labels.join(', '));
    }
});

test('sport: jiný zápis názvu (rugby, basket, džudo) se v popisu zakryje', () => {
    const data = load('sport');
    const censor = (name, text) => {
        const item = find(data, name);
        const names = [item.n, item.t, ...sport.nameAliases(item, { items: data.items })];
        return core.mergeCensored(core.censorName(text, names.join(', ')));
    };
    assert.doesNotMatch(censor('Ragby', 'Ragby je míčový sport. Dělí se na rugby union a rugby league.'), /rugby/i);
    assert.doesNotMatch(censor('Basketbal', 'Basketbal, česky též košíková, zkráceně basket, je sport.'), /basket|košík/i);
    assert.doesNotMatch(censor('Judo', 'Judo nebo džudo je japonské bojové umění.'), /džudo|judo/i);
    assert.ok(core.isAnswerMatch('rugby', sport.nameAliases(find(data, 'Ragby'), { items: data.items })));
});

test('architektura: roky a města stavem odpovídají skutečnosti', () => {
    const data = load('architektura');
    // Gotická přestavba Saint-Denis je z 12. století, ne rok 1101 (nabízí se románský sloh)
    assert.equal(find(data, 'Bazilika svatého Denise').f.y, 1144);
    assert.equal(find(data, 'Divadlo F. X. Šaldy').f.y, 1883);
    assert.equal(find(data, 'Národní knihovna Kosova').f.y, 1982);
    // Okres není město
    assert.equal(find(data, 'Hooverova přehrada').f.city, undefined);
    assert.equal(find(data, 'Mount Vernon').f.city, undefined);
    for (const item of data.items) assert.doesNotMatch((item.f || {}).city || '', /\bCounty\b/, item.n);
});

// --- Audit prozrazování odpovědi a psaných odpovědí (úkol #43) ---

test('psaná odpověď: pořadí slov, římské číslice a řadové číslovky číslem', () => {
    assert.ok(core.isAnswerMatch('Hus Jan', ['Jan Hus']));
    assert.ok(core.isAnswerMatch('korea jizni', ['Jižní Korea']));
    assert.ok(core.isAnswerMatch('Karel 4', ['Karel IV.']));
    assert.ok(core.isAnswerMatch('karel iv', ['Karel IV.']));
    assert.ok(core.isAnswerMatch('Ludvík 14', ['Ludvík XIV.']));
    assert.ok(core.isAnswerMatch('1. světová válka', ['První světová válka']));
    assert.ok(core.isAnswerMatch('2. světová válka', ['Druhá světová válka']));
    // Číslo musí sedět přesně, i s jiným pořadím slov se jiný člověk nepřijme
    assert.ok(!core.isAnswerMatch('Karel 14', ['Karel IV.']));
    assert.ok(!core.isAnswerMatch('Ludvík XIV', ['Ludvík XV.']));
    assert.ok(!core.isAnswerMatch('Václav 2', ['Václav III.']));
    assert.ok(!core.isAnswerMatch('Jan', ['Jan Hus']));
    assert.ok(!core.isAnswerMatch('Jan Hos', ['Jan Hus']));
    assert.ok(!core.isAnswerMatch('Severní Korea', ['Jižní Korea']));
});

test('psaná odpověď: osobnost stačí příjmením nebo iniciálou, panovník s číslem ne', () => {
    const answers = (topic, name) => core.nameAnswers(find(load(topic), name));
    assert.ok(core.isAnswerMatch('Hus', answers('historie', 'Jan Hus')));
    assert.ok(core.isAnswerMatch('einstein', answers('fyzika', 'Albert Einstein')));
    assert.ok(core.isAnswerMatch('A. Einstein', answers('fyzika', 'Albert Einstein')));
    assert.ok(core.isAnswerMatch('da Vinci', answers('umeni', 'Leonardo da Vinci')));
    assert.ok(!core.isAnswerMatch('Newton', answers('fyzika', 'Albert Einstein')));
    assert.ok(!core.isAnswerMatch('Karel', answers('historie', 'Karel IV.')));
    assert.ok(!core.isAnswerMatch('Veliký', answers('historie', 'Alexandr Veliký')));
    // Místo, které není osobnost, příjmení nemá
    assert.ok(!core.isAnswerMatch('Králové', core.nameAnswers({ n: 'Hradec Králové', t: 'Hradec Králové' })));
});

test('nápovědy: jméno nesprávné možnosti ve faktu ji nevyřadí (Kerberos: Sourozenci Chiméra, Hydra)', () => {
    const facts = [{ label: 'Rodiče', value: 'Týfón a Echidna' }, { label: 'Sourozenci', value: 'Chiméra, Hydra' }, { label: 'Sourozenci', value: 'Nemejský lev, Orthos, Hydra' }];
    const shown = core.dropChoiceNames(facts, ['Echidna', 'Chiméra', 'Hydra']);
    assert.deepEqual(shown, [{ label: 'Rodič', value: 'Týfón' }, { label: 'Sourozenci', value: 'Nemejský lev, Orthos' }]);
    assert.deepEqual(core.dropChoiceNames(facts, []), facts);
    // Bez diakritiky a velikosti písmen
    assert.deepEqual(core.dropChoiceNames([{ label: 'Sourozenci', value: 'Chiméra' }], ['chimera']), []);
});

test('zakrytí: tvary jména v popisu (Zápolští, Přemyslovci, stříbra, vápenatý, Aepycerotinae, Fobovým)', () => {
    const hidden = (text, name) => core.censorName(text, name);
    // Množné číslo na -ští/-čtí a ženský rod rodu (Přemyslovna – Přemyslovci)
    assert.doesNotMatch(hidden('Rod: Zápolští a Zápolský', 'Jan Zápolský'), /Zápol/);
    assert.doesNotMatch(hidden('Rod Nasavští', 'Žofie Nasavská'), /Nasav/);
    assert.doesNotMatch(hidden('z rodu Přemyslovců', 'Doubravka Přemyslovna'), /Přemysl/);
    assert.doesNotMatch(hidden('Meitnerium nese jméno po Meitner', 'Lise Meitnerová'), /Meitner/);
    // Přídavné jméno od podstatného a podstatné na -ec: stříbrný – stříbra, vápenec – vápenatý, prachovec – prachová
    assert.doesNotMatch(hidden('Je jednou ze solí stříbra.', 'Dusičnan stříbrný'), /stříbr/);
    assert.doesNotMatch(hidden('Složena z uhličitanu vápenatého.', 'Vápenec'), /vápen/);
    assert.doesNotMatch(hidden('prachová zrna křemene', 'Prachovec'), /prachov/);
    // Latinské koncovky: čeleď i podčeleď jména
    assert.doesNotMatch(hidden('z čeledi Carcharodontosauridae', 'Carcharodontosaurus'), /Carcharodontosaur/);
    assert.doesNotMatch(hidden('podčeledi Aepycerotinae', 'Aepyceros melampus'), /Aepycer/);
    assert.doesNotMatch(hidden('Rodiče: Théseus a Hippolyta', 'Hippolytos'), /Hippolyt/);
    // Řecká jména na -os a krátká jména na samohlásku
    assert.doesNotMatch(hidden('bratr Fobovým a Fobem', 'Fobos'), /Fob/);
    assert.doesNotMatch(hidden('Freyem a Freyou', 'Frey'), /Frey/);
    assert.doesNotMatch(hidden('syn Búriho', 'Búri'), /Búri/);
    // Přídavné jméno v názvu a země v textu (Malajský poloostrov – Malajsie)
    assert.doesNotMatch(hidden('Stát: Malajsie', 'Malajský poloostrov'), /Malajs/);
    // Jiná čárka v samohlásce (Babylón × Babylonie) a lomítko v názvu (9P/Tempel)
    assert.doesNotMatch(hidden('Hlavní město: Babylón', 'Babylonie'), /Babyl/);
    assert.doesNotMatch(hidden('Objevitel: Ernst Tempel', '9P/Tempel'), /Tempel/);
    // Dvojtečka v názvu filmu („prstenů:“ jinak kmen nenajde)
    assert.doesNotMatch(hidden('třetí díl Pána prstenů', 'Pán prstenů: Návrat krále'), /prsten/);
    // Saint před zakrytým jménem patří k němu
    assert.equal(hidden('v Saint Louis v Missouri', 'Louis'), 'v [***] v Missouri');
    // Běžná slova zůstanou
    assert.equal(hidden('Hradec Králové a hrad', 'Hradec Králové'), '[***] a hrad');
});

test('nápovědy: fakt se stejným kořenem jako jméno odpovědi se pozná (Těží se z něj: antimon u Antimonitu)', () => {
    assert.ok(core.sharesWordRoot('Těží se z něj: antimon', 'Antimonit'));
    assert.ok(core.sharesWordRoot('Hlavní město: Ciudad de México', 'Mexiko'));
    assert.ok(core.sharesWordRoot('Rod: valentiniánská dynastie', 'Valentinianus I.'));
    assert.ok(!core.sharesWordRoot('Hlavní město: Praha', 'Brno'));
    assert.ok(!core.sharesWordRoot('Sourozenci: Hydra', 'Kerberos'));
});

test('popis: příliš zakrytá věta s běžnými slovy se nahradí další větou, výčet jmen zůstane', () => {
    const censorWork = (text) => core.censorName(text, 'Mechanická práce');
    const description = 'Mechanická práce je fyzikální veličina. Práce je určena silou a dráhou, po které síla působí na těleso.';
    const more = 'Jednotkou je joule, který se používá pro měření energie a tepla ve všech oborech fyziky a techniky.';
    const chosen = core.chooseDescription('Práci koná síla, práci konanou silou počítáme.', `${description} ${more}`, censorWork);
    assert.ok(core.censoredShare(censorWork(chosen.description)) <= core.MAX_CENSORED_SHARE, chosen.description);
    // Výčet jmen (Marie Salomea [***], rozená [***]) smysl neztrácí, popis se nemění
    const censorPerson = (text) => core.censorName(text, 'Marie Curie-Skłodowská');
    const person = 'Maria Salomea Skłodowská-Curieová, rozená Skłodowska, známá též jako Marie Curie, byla polská vědkyně.';
    assert.deepEqual(core.chooseDescription(person, 'Získala dvě Nobelovy ceny za fyziku a chemii, jako první člověk na světě.', censorPerson), { description: person, more: 'Získala dvě Nobelovy ceny za fyziku a chemii, jako první člověk na světě.' });
    // Dobrý popis se nemění
    assert.deepEqual(core.chooseDescription('Praha je hlavní město Česka.', 'Leží na Vltavě.', (text) => core.censorName(text, 'Praha')), { description: 'Praha je hlavní město Česka.', more: 'Leží na Vltavě.' });
});

test('chemie: „Pojmenován po“ ze stejného kořene jako prvek odpověď neprozradí', () => {
    const data = load('chemie');
    const ctx = { items: data.items, countries: {} };
    const named = (name) => chemie.facts(find(data, name), ctx, 'name').find(fact => fact.label === 'Pojmenován po');
    for (const element of ['Plutonium', 'Americium', 'Rutherfordium', 'Uran', 'Titan', 'Fluor', 'Vodík', 'Uhlík', 'Curium']) assert.equal(named(element), undefined, element);
    assert.equal(named('Selen').value, 'Měsíc');
    assert.equal(named('Rtuť').value, 'Merkur');
    assert.ok(core.isAnswerMatch('glukosa', core.nameAnswers(find(data, 'Glukóza'), chemie.nameAliases(find(data, 'Glukóza'), ctx))));
});

test('data: popis z Wikidat nemá rozbité závorky ani dvojité mezery', () => {
    for (const topic of ['zemepis', 'historie', 'biologie', 'chemie', 'fyzika', 'geologie', 'architektura', 'umeni', 'hudba', 'film', 'literatura', 'sport', 'mytologie', 'vlajky']) {
        for (const item of load(topic).items) {
            for (const key of ['d', 'ty']) {
                const value = item[key];
                if (!value) continue;
                assert.doesNotMatch(value, /[\[\]]/, `${topic}/${item.n}: ${key}`);
                assert.equal((value.match(/\(/g) || []).length, (value.match(/\)/g) || []).length, `${topic}/${item.n}: ${key} má nevyvážené závorky`);
                assert.doesNotMatch(value, /\s{2,}/, `${topic}/${item.n}: ${key}`);
            }
        }
    }
});
