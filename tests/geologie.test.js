// Testy tématu Geologie na skutečných datech (data/geologie.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');
const geologie = require('../topics/geologie.js');

const data = require(path.join(__dirname, '..', 'data', 'geologie.json'));
const ctx = { topic: geologie, items: data.items, collections: data.collections, countries: {}, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
// Generátor, který poprvé vrátí zadané číslo (volba druhu otázky) a pak pokračuje se semínkem
const rngStartingWith = (first, seed = 'geologie') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const asLines = (facts) => facts.map(fact => `${fact.label}: ${fact.value}`);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
const wrongOptions = (name, seeds = 6) => Array.from({ length: seeds }, (_, seed) => core.buildItemChoices(find(name), data.items,
    core.createSeededRandom(`${name}${seed}`), other => geologie.similarity(find(name), other, ctx)).filter(choice => !choice.correct).map(choice => choice.label));

test('geologie: známé položky a česká stopa', () => {
    for (const name of ['Křemen', 'Kalcit', 'Pyrit', 'Zlato', 'Diamant', 'Rubín', 'Ametyst', 'Žula', 'Čedič', 'Pískovec', 'Mramor', 'Druhohory', 'Jura']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    for (const name of ['Vltavín', 'Pyrop', 'Uraninit', 'Stříbro', 'Kasiterit', 'Achát', 'Opuka', 'Znělec', 'Čedič']) {
        const item = find(name);
        assert.ok(item.cz === 1 && item.k === 1, `${name}: známá česká položka`);
    }
    assert.ok(!find('Diamant').cz && !find('Halit').cz);
    assert.match(find('Uraninit').f.czl, /Jáchymov/);
    assert.match(find('Stříbro').f.czl, /Kutná Hora/);
    // Nerost, ne chemický prvek: článek „Zlato (minerál)“; ortoklas pod článkem o draselném živci
    assert.equal(find('Zlato').t, 'Zlato (minerál)');
    assert.equal(find('Ortoklas').t, 'Draselný živec');
    // Skupiny nerostů a hornina se jménem periody (křída) v tématu nejsou
    for (const name of ['Slída', 'Živce', 'Plagioklas', 'Selenit']) assert.ok(!data.items.some(item => item.n === name), name);
    // Slavný diamant není nerost: je mezi drahými kameny jako slavný broušený kámen
    assert.ok(!data.items.some(item => item.c === 'nerosty' && item.n === 'Koh-i-Noor'));
    assert.equal(find('Křída').c, 'obdobi');
});

test('geologie: kontrola dat – fotky, tvrdost, období, jedna položka na jméno', () => {
    assert.equal(new Set(data.items.map(item => item.n.toLocaleLowerCase('cs'))).size, data.items.length);
    for (const item of data.items) {
        const f = item.f || {};
        // Nerost, kámen i hornina se poznávají z fotky v otázce (opuka ji ve Wikidatech nemá – náhrada z Commons)
        if (item.c === 'nerosty' || item.c === 'kameny' || item.c === 'horniny') assert.ok(item.im && item.ih, `${item.n}: bez fotky`);
        if (f.h) assert.ok(f.h[0] >= 1 && f.h[0] <= f.h[1] && f.h[1] <= 10, `${item.n}: tvrdost ${f.h}`);
        if (f.formula) assert.ok(!/[☐{]/.test(f.formula), `${item.n}: vzorec ${f.formula}`);
        if (item.c === 'obdobi') assert.ok(f.from > f.to && f.from <= 4600 && f.to >= 0, `${item.n}: ${f.from}–${f.to}`);
        if (item.c === 'horniny') assert.ok(f.grp && f.comp && f.orig, `${item.n}: skupina, složení a vznik`);
    }
    // Mohsova stupnice: deset srovnávacích nerostů seřazených podle tvrdosti
    const mohs = core.sortItems(data.items.filter(item => (item.g || []).includes('mohsova-stupnice')), { by: 'hm' }).map(item => item.n);
    assert.deepEqual(mohs, ['Mastek', 'Sádrovec', 'Kalcit', 'Fluorit', 'Apatit', 'Ortoklas', 'Křemen', 'Topaz', 'Korund', 'Diamant']);
    // Wikidata mají u minerálů chybné soustavy a vrypy – data je mají opravené
    assert.equal(find('Topaz').f.sys, 'kosočtverečná');
    assert.equal(find('Mastek').f.sys, 'jednoklonná');
    assert.equal(find('Hematit').f.str, 'třešňově červený');
    assert.equal(find('Křemen').f.str, undefined);
});

test('geologie: fotka je vidět hned v otázce, období ji nemají', () => {
    const pyrit = find('Pyrit');
    assert.deepEqual(geologie.questionImage(pyrit, ctx, 'name'), { file: pyrit.im, hash: pyrit.ih, label: 'Nerost', icon: 'gem' });
    assert.equal(geologie.questionImage(find('Rubín'), ctx, 'name').label, 'Kámen');
    assert.equal(geologie.questionImage(find('Žula'), ctx, 'group').label, 'Hornina');
    assert.equal(geologie.questionImage(find('Jura'), ctx, 'name'), null);
    // Nápovědy u názvu nerostu: třída a soustava → stupnice tvrdosti → vryp a hustota → ruda a naleziště → vzorec
    const hints = geologie.hints(find('Galenit'), ctx, 'name');
    assert.deepEqual(hints.map(hint => hint.kind === 'visual' ? hint.spec.type : hint.label || 'fakta'),
        ['fakta', 'scale', 'vryp a hustota', 'těžba a naleziště', 'vzorec']);
    assert.ok(asLines(hints[3].facts).includes('Těží se z něj: olovo'));
    assert.ok(asLines(hints[3].facts).some(line => /Příbram/.test(line)));
});

test('geologie: stupnice tvrdosti a stáří', () => {
    const pyrit = geologie.visual(find('Pyrit'), ctx, 'name');
    assert.equal(pyrit.type, 'scale');
    assert.equal(pyrit.value, 6.25);
    assert.equal(pyrit.valueLabel, 'tvrdost 6–6,5');
    assert.deepEqual(pyrit.ticks.map(tick => tick.label), ['mastek', 'sádrovec', 'kalcit', 'fluorit', 'apatit', 'živec', 'křemen', 'topaz', 'korund', 'diamant']);
    // Srovnávací nerost svou značku v otázce nepojmenuje, po odpovědi ano
    assert.equal(geologie.visual(find('Kalcit'), ctx, 'name').ticks[2].label, '3');
    assert.equal(geologie.visual(find('Kalcit'), ctx, 'result').ticks[2].label, 'kalcit');
    // U otázky na tvrdost stupnice není (prozradila by odpověď)
    assert.equal(geologie.visual(find('Kalcit'), ctx, 'hardness'), null);
    const jura = geologie.visual(find('Jura'), ctx, 'name');
    assert.ok(jura.log && jura.value === 201.4 && jura.max === 4600, JSON.stringify(jura));
    const periodHints = geologie.hints(find('Jura'), ctx, 'name');
    assert.ok(periodHints.some(hint => hint.kind === 'visual' && hint.spec.type === 'image' && /Paleographic/.test(hint.spec.file)));
    assert.equal(geologie.subtitle(find('Jura'), ctx), 'perioda druhohor · před 201,4–143,1 mil. let');
    // Hranice podle aktuální tabulky ICS (v2026/06; prvohory po revizi 2024), ne ze starší verze (ordovik 485,4)
    const ICS = { Kambrium: [538.8, 486.85], Ordovik: [486.85, 443.1], Silur: [443.1, 419.62], Devon: [419.62, 358.86], Karbon: [358.86, 298.9],
        Perm: [298.9, 251.902], Trias: [251.902, 201.4], Křída: [143.1, 66], Neogén: [23.04, 2.58], Archaikum: [4031, 2500] };
    for (const [name, range] of Object.entries(ICS)) assert.deepEqual([find(name).f.from, find(name).f.to], range, name);
    // Navazující období: konec jednoho je začátek dalšího v téže nadřazené jednotce
    const periods = data.items.filter(item => item.c === 'obdobi' && item.f.lvl === 'perioda' && ['Prvohory', 'Druhohory', 'Třetihory'].includes(item.f.par))
        .sort((a, b) => b.f.from - a.f.from);
    for (let i = 1; i < periods.length; i++) assert.equal(periods[i].f.from, periods[i - 1].f.to, `${periods[i - 1].n} → ${periods[i].n}`);
    assert.equal(geologie.subtitle(find('Holocén'), ctx).replace(/\s/g, ' '), 'epocha čtvrtohor · před 11 700 let až dodnes');
});

test('geologie: „Jakou má tvrdost podle Mohse?“ – jen jedno číslo tvrdosti, zakrytá čísla v popisu', () => {
    const question = geologie.specialQuestion(find('Kalcit'), ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'hardness');
    assert.ok(question.showName);
    assert.equal(question.answerLabel, '3');
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(question.choices.every(choice => Math.abs(Number(choice.label.replace(',', '.')) - 3) <= 2));
    assert.ok(core.checkAnswer('3', question) && !core.checkAnswer('4', question) && !core.checkAnswer('3,5', question));
    const zircon = geologie.specialQuestion(find('Zirkon'), ctx, rngStartingWith(0.1));
    assert.equal(zircon.answerLabel, '7,5');
    assert.ok(core.checkAnswer('7,5', zircon) && core.checkAnswer('7.5', zircon) && !core.checkAnswer('7', zircon));
    // Rozpětí (pyrit 6–6,5) ani méně známé nerosty otázku na tvrdost nemají
    assert.notEqual((geologie.specialQuestion(find('Pyrit'), ctx, rngStartingWith(0.1)) || {}).type, 'hardness');
    assert.notEqual((geologie.specialQuestion(find('Chryzoberyl'), ctx, rngStartingWith(0.1)) || {}).type, 'hardness');
    // Nápovědy: zkouška nehtem, mincí či nožem → srovnání se stupnicí
    const hints = geologie.hints(find('Kalcit'), ctx, 'hardness');
    assert.deepEqual(asLines(hints[0].facts), ['Zkouška: Nehet ne, ale měděná mince do něj rýpe.']);
    assert.deepEqual(asLines(hints[1].facts), ['Na Mohsově stupnici: tvrdší než sádrovec, měkčí než fluorit']);
    assert.deepEqual(asLines(geologie.hints(find('Ametyst'), ctx, 'hardness')[1].facts), ['Stejně tvrdý jako: křemen']);
    assert.ok(!geologie.facts(find('Kalcit'), ctx, 'hardness').some(fact => fact.label === 'Tvrdost'));
    assert.equal(geologie.censor('hardness', 'Kalcit je třetím nerostem Mohsovy stupnice, má tvrdost 3. Hustota je 2,7.', find('Kalcit')),
        'Kalcit je [***] nerostem Mohsovy stupnice, má tvrdost [***]. Hustota je 2,7.');
    assert.doesNotMatch(geologie.censor('hardness', 'Mastek je nejměkčí nerost.', find('Mastek')), /nejměkčí/);
});

test('geologie: „Jaký má vzorec?“ – vzorce se stejným složením nejsou mezi možnostmi', () => {
    const question = geologie.specialQuestion(find('Kalcit'), ctx, rngStartingWith(0.3));
    assert.equal(question.type, 'formula');
    assert.equal(question.match, 'formula');
    assert.equal(question.answerLabel, 'CaCO₃');
    assert.ok(core.checkAnswer('CaCO3', question) && !core.checkAnswer('MgCO3', question));
    assert.equal(question.choices.length, 4);
    // Aragonit má taky CaCO₃ – mezi nesprávnými možnostmi být nesmí
    assert.ok(question.choices.filter(choice => !choice.correct).every(choice => !core.isFormulaMatch(choice.label, ['CaCO3'])), question.choices.map(c => c.label).join(', '));
    const pyrite = geologie.specialQuestion(find('Pyrit'), ctx, rngStartingWith(0.3));
    assert.ok(pyrite.choices.every(choice => choice.correct || choice.label !== 'FeS₂'));
    assert.deepEqual(asLines(geologie.hints(find('Pyrit'), ctx, 'formula')[1].facts), ['Prvky: železo, síra']);
    assert.ok(!geologie.facts(find('Pyrit'), ctx, 'formula').some(fact => fact.label === 'Vzorec'));
    assert.equal(geologie.censor('formula', 'Pyrit je disulfid železa FeS2, tedy FeS₂.', find('Pyrit')), 'Pyrit je disulfid železa [***], tedy [***].');
    // Nejasný zápis (opál SiO₂·nH₂O, olivín (Mg,Fe)₂SiO₄) otázku na vzorec nemá
    for (const name of ['Opál', 'Olivín', 'Jantar']) assert.equal(geologie.specialQuestion(find(name), ctx, rngStartingWith(0.25)), null, name);
});

test('geologie: „Do které skupiny hornin patří?“ – čtyři skupiny, zakryté prozrazující slova', () => {
    const question = geologie.specialQuestion(find('Žula'), ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'group');
    assert.deepEqual(question.choices.map(choice => choice.label).sort(), ['Hlubinná vyvřelina', 'Přeměněná hornina', 'Usazená hornina', 'Výlevná vyvřelina']);
    assert.equal(question.answerLabel, 'Hlubinná vyvřelina');
    assert.ok(core.checkAnswer('hlubinna', question) && core.checkAnswer('vyvřelá', question) && !core.checkAnswer('usazená', question));
    assert.equal(geologie.specialQuestion(find('Mramor'), ctx, rngStartingWith(0.1)).answerLabel, 'Přeměněná hornina');
    assert.equal(geologie.specialQuestion(find('Čedič'), ctx, rngStartingWith(0.1)).answerLabel, 'Výlevná vyvřelina');
    assert.ok(core.checkAnswer('sedimentární', geologie.specialQuestion(find('Pískovec'), ctx, rngStartingWith(0.1))));
    // Žilné horniny a sporné zařazení (migmatit) otázku na skupinu nemají
    for (const name of ['Pegmatit', 'Migmatit', 'Greisen']) assert.equal(geologie.specialQuestion(find(name), ctx, rngStartingWith(0.1)), null, name);
    assert.doesNotMatch(geologie.censor('group', 'Žula je hlubinná vyvřelá (magmatická) hornina, vzniká tuhnutím magmatu, ne usazováním.', find('Žula')),
        /hlubin|vyvřel|magmat|usazov/);
    // Nápovědy skupinu neprozradí slovem, ale pomohou: složení a vzhled
    const hints = geologie.hints(find('Mramor'), ctx, 'group');
    assert.deepEqual(hints.map(hint => hint.label), ['složení', 'vzhled a vznik']);
    for (const fact of hints.flatMap(hint => hint.facts)) assert.ok(!core.censorName(fact.value, question.accepted.join(', ')).includes('[***]'), fact.value);
    assert.ok(!geologie.facts(find('Mramor'), ctx, 'group').some(fact => fact.label === 'Skupina'));
});

test('geologie: nesprávné možnosti, psané odpovědi a okruhy', () => {
    // Kameny, které by se na fotce nerozeznaly, se mezi možnostmi nesejdou; období ne se svou érou
    for (const options of wrongOptions('Pyrop')) assert.ok(!options.includes('Almandin'), options.join(', '));
    for (const options of wrongOptions('Rubín')) assert.ok(!options.includes('Spinel'), options.join(', '));
    for (const options of wrongOptions('Ortoklas')) assert.ok(!options.includes('Mikroklin') && !options.includes('Sanidin'), options.join(', '));
    for (const options of wrongOptions('Jura')) assert.ok(!options.includes('Druhohory'), options.join(', '));
    // K rubínu červené kameny, k pyritu sulfidy, k žule vyvřeliny
    for (const options of wrongOptions('Rubín')) assert.ok(options.filter(name => find(name).f.cg === 'červený').length >= 2, options.join(', '));
    for (const options of wrongOptions('Pyrit')) assert.ok(options.every(name => find(name).f.cls === 2), options.join(', '));
    for (const options of wrongOptions('Žula')) assert.ok(options.every(name => ['hlubinna', 'vylevna', 'zilna'].includes(find(name).f.grp)), options.join(', '));
    // Lidové a starší české názvy
    const accepts = (name, answer) => core.isAnswerMatch(answer, core.nameAnswers(find(name), geologie.nameAliases(find(name), ctx)));
    assert.ok(accepts('Uraninit', 'smolinec') && accepts('Halit', 'kamenná sůl') && accepts('Žula', 'granit') && accepts('Vltavín', 'moldavit'));
    assert.ok(accepts('Pyrop', 'český granát') && accepts('Druhohory', 'mezozoikum') && accepts('Ortoklas', 'draselný živec'));
    assert.ok(!accepts('Kalcit', 'aragonit'));
    // Okruhy
    assert.ok(data.collections.length >= 8 && data.collections.length <= 40);
    assert.ok(inCollection('cesko').includes('Vltavín') && inCollection('cesko').includes('Opuka') && !inCollection('cesko').includes('Diamant'));
    assert.ok(inCollection('rudy').includes('Galenit') && inCollection('rudy').includes('Kasiterit') && !inCollection('rudy').includes('Křemen'));
    assert.ok(inCollection('vyvrele').includes('Čedič') && inCollection('usazene').includes('Pískovec') && inCollection('premenene').includes('Rula'));
    assert.ok(inCollection('odrudy-kremene').includes('Ametyst') && inCollection('sulfidy').includes('Pyrit'));
    assert.equal(geologie.subtitle(find('Ametyst'), ctx), 'odrůda křemene · SiO₂');
    assert.equal(geologie.subtitle(find('Pyrit'), ctx), 'sulfidy · FeS₂');
    assert.equal(geologie.subtitle(find('Žula'), ctx), 'hlubinná vyvřelina');
});

test('geologie: útvary a jevy, zkameněliny, epochy a věky', () => {
    for (const name of ['Fjord', 'Gejzír', 'Stalaktit', 'Moréna', 'Impaktní kráter']) assert.equal(find(name).c, 'utvary', name);
    for (const name of ['Trilobiti', 'Amoniti', 'Belemniti', 'Lepidodendron']) assert.equal(find(name).c, 'zkameneliny', name);
    for (const name of ['Miocén', 'Cenoman', 'Ediakara']) assert.equal(find(name).c, 'obdobi', name);
    for (const name of ['Fjord', 'Trilobiti', 'Amoniti']) assert.equal(find(name).k, 1, `${name} je známý`);
    for (const item of data.items.filter(other => ['utvary', 'zkameneliny'].includes(other.c))) {
        assert.ok(item.im && item.ih, `${item.n}: fotka je podstata otázky`);
        assert.ok(item.f.grp, `${item.n}: skupina`);
        const facts = geologie.facts(item, ctx, 'name');
        assert.ok(facts.length >= 1, `${item.n}: fakta`);
        // Nápověda název neprozradí
        for (const fact of facts) assert.ok(!core.censorName(fact.value, item.n).includes('[***]'), `${item.n}: ${fact.value}`);
    }
    // K moréně jiné ledovcové útvary
    for (const options of wrongOptions('Moréna')) assert.ok(options.filter(name => find(name).f.grp === 'ledovcove').length >= 2, options.join(', '));
    assert.ok(inCollection('ledovcove-utvary').includes('Fjord') && inCollection('prvohorni-zivot').includes('Trilobiti'));
    // Věk křídy leží v křídě
    assert.equal(find('Cenoman').f.par, 'Křída');
    assert.ok(find('Cenoman').f.from < find('Křída').f.from && find('Cenoman').f.to >= find('Křída').f.to);
});

test('geologie: nové nerosty, kameny, horniny, útvary, místa a období', () => {
    // Nerosty s ručně doplněnou tvrdostí a barvou, odrůdy jako drahé kameny, horniny se skupinou
    assert.deepEqual(find('Tetraedrit').f.h, [3.5, 4]);
    assert.equal(find('Tetraedrit').c, 'nerosty');
    assert.match(find('Johannit').f.czl, /Jáchymov/);
    for (const name of ['Heliotrop', 'Morion', 'Ametrín', 'Tsavorit', 'Hyalit']) assert.equal(find(name).c, 'kameny', name);
    assert.equal(find('Morion').f.par, 'křemen');
    assert.equal(geologie.subtitle(find('Adulár')), 'odrůda ortoklasu · KAlSi₃O₈');
    for (const [name, group] of [['Rašelina', 'usazena'], ['Kaolin', 'usazena'], ['Komatiit', 'vylevna'], ['Larvikit', 'hlubinna'], ['Smirek', 'premenena']]) {
        assert.equal(find(name).c, 'horniny', name);
        assert.equal(find(name).f.grp, group, name);
    }
    // Útvary a slavná místa: druh a místo, česká stopa, české jméno s původním jako psanou odpovědí
    for (const name of ['Vodopád', 'Ledovec', 'Cenote', 'Stolová hora', 'Obrův chodník', 'Pravčická brána', 'Chicxulubský kráter']) assert.equal(find(name).c, 'utvary', name);
    const causeway = find('Obrův chodník');
    assert.ok(asLines(geologie.facts(causeway, ctx, 'name')).includes('Kde to je: Severní Irsko'));
    assert.ok(geologie.nameAliases(causeway).includes("Giant's Causeway"));
    assert.equal(find('Pravčická brána').cz, 1);
    assert.ok(inCollection('slavna-mista').includes('Pamukkale') && inCollection('impakty').includes('Chicxulubský kráter'));
    // Slavné diamanty: hmotnost v karátech, nesprávné možnosti jsou jiné slavné diamanty
    const cullinan = find('Cullinan');
    assert.ok(asLines(geologie.facts(cullinan, ctx, 'name')).some(line => /^Hmotnost: 3\s?106 karátů$/u.test(line)));
    assert.ok(asLines(geologie.facts(find('Hope'), ctx, 'name')).some(line => /^Hmotnost: 45,52 karátu$/u.test(line)));
    assert.equal(geologie.subtitle(find('Hope')).split(' · ')[0], 'slavný diamant');
    for (const options of wrongOptions('Cullinan')) assert.ok(options.every(name => find(name).f.fam === 1), options.join(', '));
    assert.equal(inCollection('slavne-diamanty').length, 5);
    // Období z téže tabulky: rét končí začátkem jury, kenozoikum trvá dodnes, prekambrium končí kambriem
    assert.equal(find('Rét').f.to, find('Jura').f.from);
    assert.equal(find('Kenozoikum').f.to, 0);
    assert.equal(find('Prekambrium').f.to, find('Kambrium').f.from);
    assert.ok(inCollection('prekambrium').includes('Ediakara') && !inCollection('prekambrium').includes('Kambrium'));
    assert.ok(!inCollection('epochy').includes('Spodní křída') && !inCollection('veky').includes('Dan'));
    // Žádný fakt útvaru ani zkameněliny neprozradí název (druh „krasové jevy“ u jeskyní, místo u propasti)
    for (const item of data.items.filter(other => other.c === 'utvary' || other.c === 'zkameneliny')) {
        for (const fact of geologie.facts(item, ctx, 'name')) assert.ok(!core.censorName(fact.value, [item.n, ...(item.f.al || [])].join(', ')).includes('[***]'), `${item.n}: ${fact.value}`);
    }
});
