// Testy tématu Vlajky a znaky na skutečných datech (data/vlajky.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');
const vlajky = require('../topics/vlajky.js');

const data = require(path.join(__dirname, '..', 'data', 'vlajky.json'));
const countries = require(path.join(__dirname, '..', 'data', 'countries.json')).countries;
const ctx = { topic: vlajky, items: data.items, collections: data.collections, countries, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name, category = 'vlajka') => {
    const item = data.items.find(candidate => candidate.n === name && candidate.c === category);
    assert.ok(item, `chybí ${name} (${category})`);
    return item;
};
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
// Nejpodobnější položky podle tématu (bez náhody) – z nich jádro bere nesprávné možnosti
const mostSimilar = (item, count = 6) => data.items.filter(other => other.c === item.c && other.q !== item.q)
    .map(other => [other.n, vlajky.similarity(item, other, ctx)]).sort((a, b) => b[1] - a[1]).slice(0, count).map(([name]) => name);
const choicesOf = (item, seed) => core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => vlajky.similarity(item, other, ctx));

test('vlajky: státy, známé vlajky a česká stopa', () => {
    for (const name of ['Česko', 'Slovensko', 'Německo', 'Francie', 'Spojené státy americké', 'Japonsko', 'Itálie', 'Kanada', 'Brazílie']) {
        assert.equal(find(name).k, 1, `vlajka ${name} má být známá`);
    }
    assert.equal(find('Česko').cz, 1);
    assert.equal(find('Česko', 'znak').k, 1);
    // Mezi známými znaky jen ty opravdu známé
    assert.equal(find('Ázerbájdžán', 'znak').k, 0);
    assert.ok(data.items.filter(item => item.c === 'znak' && item.k === 1).length <= 25);
    assert.equal(find('Česko', 'znak').cz, 1);
    for (const name of ['Praha', 'Brno', 'Ostrava', 'Plzeň', 'Čechy', 'Morava']) assert.ok(find(name, 'cesko').k === 1 && find(name, 'cesko').cz === 1, name);
    assert.ok(data.items.filter(item => item.c === 'cesko' && item.ty === 'kraj').length >= 12, 'kraje');
    // Stát je v datech jen jednou v každé kategorii, a když má článek o vlajce, je mezi vlajkami
    for (const category of ['vlajka', 'znak', 'cesko', 'uzemi', 'regiony', 'mesta', 'historie']) {
        const names = data.items.filter(item => item.c === category).map(item => item.n.toLocaleLowerCase('cs'));
        assert.equal(new Set(names).size, names.length, `${category}: stejné jméno dvakrát`);
    }
    assert.ok(data.items.filter(item => item.c === 'vlajka').length >= 180);
});

test('vlajky: jen dnešní vlajka a znak, každý obrázek jen u jedné položky', () => {
    assert.equal(find('Česko').im, 'Flag of the Czech Republic.svg');
    for (const item of data.items) {
        // Měny se ptají textem (obrázek bankovky je jen nápovědou a po odpovědi), ne všechny ho mají
        if (item.c === 'meny') continue;
        assert.ok(item.im && /^[0-9a-f]{2}$/.test(item.ih), `${item.n}: obrázek`);
        if (item.c !== 'historie') assert.doesNotMatch(item.im, /\(\d{4}[–-]\d{4}\)/, `${item.n}: historická vlajka ${item.im}`);
    }
    // Dvě položky se stejným obrázkem by otázka nerozlišila
    for (const category of ['vlajka', 'znak', 'cesko', 'uzemi', 'regiony', 'mesta', 'historie']) {
        const files = data.items.filter(item => item.c === category).map(item => item.im);
        assert.equal(new Set(files).size, files.length, `${category}: stejný obrázek dvakrát`);
    }
});

test('vlajky: obrázek je vidět hned v otázce', () => {
    const czechia = find('Česko');
    assert.deepEqual(vlajky.questionImage(czechia, ctx, 'name'), { file: czechia.im, hash: czechia.ih, label: 'Vlajka', icon: 'flag' });
    assert.equal(vlajky.questionImage(find('Česko', 'znak'), ctx, 'name').label, 'Znak');
    assert.equal(vlajky.questionImage(find('Brno', 'cesko'), ctx, 'name').label, 'Znak');
});

test('vlajky: nesprávné možnosti – podobné vlajky, ne k nerozeznání', () => {
    // Čad × Rumunsko a Indonésie × Monako jsou skoro stejné – spolu v možnostech nebudou
    for (let seed = 0; seed < 20; seed++) {
        assert.ok(!choicesOf(find('Čad'), `cad-${seed}`).some(choice => choice.label === 'Rumunsko'));
        assert.ok(!choicesOf(find('Indonésie'), `id-${seed}`).some(choice => choice.label === 'Monako'));
    }
    // Podobné vlajky jsou nahoře (zrcadlové pořadí barev, stejné barvy jinak)
    assert.ok(mostSimilar(find('Irsko')).includes('Pobřeží slonoviny'), mostSimilar(find('Irsko')).join(', '));
    assert.ok(mostSimilar(find('Indonésie')).includes('Polsko'), mostSimilar(find('Indonésie')).join(', '));
    // Skandinávský kříž k ostatním křížům, ne k Rusku
    assert.deepEqual(mostSimilar(find('Finsko'), 3).sort(), ['Island', 'Norsko', 'Švédsko']);
    assert.ok(mostSimilar(find('Austrálie'), 2).includes('Nový Zéland'));
    assert.ok(mostSimilar(find('Nizozemsko')).some(name => ['Lucembursko', 'Rusko', 'Francie'].includes(name)), mostSimilar(find('Nizozemsko')).join(', '));
    assert.ok(mostSimilar(find('Rumunsko')).some(name => ['Andorra', 'Moldavsko', 'Belgie'].includes(name)), mostSimilar(find('Rumunsko')).join(', '));
    // Česká vlajka mezi podobnými (Slovensko, Rusko, Slovinsko… nebo klín jako Filipíny)
    assert.ok(mostSimilar(find('Česko')).some(name => ['Filipíny', 'Slovensko', 'Rusko', 'Slovinsko', 'Kuba', 'Portoriko'].includes(name)), mostSimilar(find('Česko')).join(', '));
});

test('vlajky: psané odpovědi a zakrytí popisu', () => {
    const usa = find('Spojené státy americké');
    const question = { accepted: core.nameAnswers(usa, vlajky.nameAliases(usa, ctx)) };
    for (const answer of ['USA', 'Spojené státy americké', 'spojene staty']) assert.ok(core.checkAnswer(answer, question), answer);
    const czechia = find('Česko');
    assert.ok(core.checkAnswer('Česká republika', { accepted: core.nameAnswers(czechia, vlajky.nameAliases(czechia, ctx)) }));
    // Popis vlajky bez státu (i v jiném tvaru a přídavným jménem) a bez hlavního města
    const chad = find('Čad');
    const text = vlajky.censor('name', 'Vlajka Čadu je tvořena třemi svislými pruhy. Čadská vlajka vlaje i v N\'Djameně.', chad, ctx);
    assert.doesNotMatch(text, /Čad|Djam/u, text);
    // Přezdívka vlajky a tvar, který běžné zakrytí mine
    assert.doesNotMatch(vlajky.censor('name', 'Vlajka Dánska, známá jako Dannebrog, je červená.', find('Dánsko'), ctx), /Dán|Dannebrog/u);
    assert.doesNotMatch(vlajky.censor('name', 'Vlajka Nového Zélandu připomíná vazby Nového Zélandu.', find('Nový Zéland'), ctx), /Nov|Zéland/u);
    // Kraje a města: úvod článku se před odpovědí vůbec neukáže (prozradil by je) a žádná náhradní věta ho nenahradí
    const brno = find('Brno', 'cesko');
    assert.equal(vlajky.withholdText('name', brno), true);
    const brnoQuestion = { type: 'name', title: 'Čí je to znak?', choices: [{ label: 'Brno', correct: true, id: brno.q }] };
    const texts = core.buildQuestionTexts(brno, ctx, brnoQuestion, { description: 'Brno je druhé největší město v Česku.', more: 'Leží na soutoku Svratky a Svitavy.', funFacts: [] });
    assert.deepEqual([texts.questionText, texts.moreText, texts.origin], ['', '', 'withheld']);
    assert.equal(vlajky.withholdText('name', chad), false, 'vlajka státu má popis z článku');
    assert.ok(core.checkAnswer('Vysočina', { accepted: core.nameAnswers(find('Kraj Vysočina', 'cesko'), vlajky.nameAliases(find('Kraj Vysočina', 'cesko'), ctx)) }));
});

test('vlajky: nápovědy – kontinent, slepá mapa, hlavní město (u znaku vlajka)', () => {
    const italy = find('Itálie');
    const hints = vlajky.hints(italy, ctx, 'name');
    assert.deepEqual(hints[0].facts, [{ label: 'Kontinent', value: 'Evropa' }]);
    assert.equal(hints[1].spec.type, 'map');
    assert.equal(hints[1].spec.highlightIso, countries.Q38.iso);
    assert.deepEqual(hints[2].facts, [{ label: 'Hlavní město', value: 'Řím' }]);
    const arms = vlajky.hints(find('Itálie', 'znak'), ctx, 'name');
    assert.equal(arms[1].spec.type, 'map');
    assert.deepEqual(arms[2].spec, { type: 'image', file: italy.im, hash: italy.ih, name: 'vlajka', icon: 'flag' });
    // Krajské město, které kraj prozradí názvem, se nenabídne
    const plzenRegion = vlajky.hints(find('Plzeňský kraj', 'cesko'), ctx, 'name');
    assert.ok(!plzenRegion.some(hint => (hint.facts || []).some(fact => fact.value === 'Plzeň')));
});

test('vlajky: okruhy pro učení', () => {
    assert.ok(data.collections.length >= 8 && data.collections.length <= 50, data.collections.map(c => c.label).join(', '));
    const europe = inCollection('vlajky-evropy');
    assert.ok(europe.includes('Česko') && europe.includes('Francie') && !europe.includes('Japonsko'));
    const tricolours = inCollection('trikolory');
    for (const name of ['Francie', 'Itálie', 'Irsko', 'Rumunsko', 'Německo']) assert.ok(tricolours.includes(name), `trikolóra ${name}`);
    assert.ok(!tricolours.includes('Japonsko') && !tricolours.includes('Česko'));
    const nordic = inCollection('skandinavske-krize');
    for (const name of ['Švédsko', 'Norsko', 'Dánsko', 'Finsko', 'Island']) assert.ok(nordic.includes(name), name);
    assert.ok(inCollection('kraje').includes('Jihomoravský kraj'));
    assert.ok(inCollection('cesko-a-sousede').includes('Rakousko'));
});

test('vlajky: regiony států mají nesprávné možnosti ze stejného státu, blízké a podobně velké', () => {
    const regions = data.items.filter(item => item.c === 'regiony');
    const perCountry = new Map();
    for (const item of regions) perCountry.set(item.co[0], (perCountry.get(item.co[0]) || 0) + 1);
    let checked = 0;
    for (const item of regions) {
        if (perCountry.get(item.co[0]) < 4) continue;
        for (let seed = 0; seed < 6; seed++) {
            const wrong = choicesOf(item, `region-${seed}-${item.q}`).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
            assert.equal(wrong.length, 3);
            for (const other of wrong) assert.equal(other.co[0], item.co[0], `${item.n}: ${other.n} je z jiného státu`);
            checked++;
        }
    }
    assert.ok(checked > 1500, `zkontrolováno ${checked} otázek`);
    // Ani známá položka (Ciudad de México) nedostane známý region cizího státu jen proto, že je známý
    const mexico = regions.find(item => item.n === 'Ciudad de México');
    if (mexico) assert.ok(choicesOf(mexico, 'a').every(choice => ctx.byId.get(choice.id).co[0] === 'Q96'));
    // Stát s jediným regionem v datech (Spojené království) dostane nouzové možnosti, otázka zůstane úplná
    const lonely = regions.find(item => perCountry.get(item.co[0]) === 1);
    if (lonely) assert.equal(choicesOf(lonely, 'b').length, 4);
    // Sousední region je mezi podobnými výš než vzdálený (při stejném vzhledu vlajky)
    const texas = regions.find(item => item.n === 'Texas');
    assert.ok(texas, 'Texas je region');
    if (texas) {
        const near = regions.find(item => item.q === 'Q1649'); // Oklahoma
        const far = regions.find(item => item.q === 'Q1066807' || item.n === 'Maine');
        if (near && far) assert.ok(vlajky.similarity(texas, { ...near, sg: far.sg }, ctx) > vlajky.similarity(texas, far, ctx));
    }
    assert.deepEqual(vlajky.sameCountry, ['regiony']);
});

test('vlajky: regiony, území a zaniklé státy v okruzích, obce a úrovně', () => {
    // Texas, Kalifornie a Arizona jsou regiony (s dosavadním ID), Aljaška a Havaj území – všechny v okruhu Státy USA
    const usa = inCollection('staty-usa');
    for (const name of ['Texas', 'Kalifornie', 'Arizona', 'Aljaška', 'Havaj', 'Kansas']) assert.ok(usa.includes(name), name);
    assert.equal(usa.length, 50);
    assert.equal(find('Kalifornie', 'regiony').q, 'Q330517');
    assert.ok(inCollection('spolkove-zeme').includes('Bavorsko') && inCollection('spolkove-zeme').length === 16);
    for (const name of ['Anglie', 'Skotsko', 'Wales']) assert.ok(inCollection('severozapadni-evropa').includes(name), name);
    const australia = inCollection('kanada-australie');
    assert.ok(australia.includes('Severní teritorium') && australia.includes('Teritorium hlavního města Austrálie') && !australia.includes('Norfolk'));
    // Další státy s regiony: župy Maďarska (bez měst se župním právem), prefektury Japonska, departementy And…
    assert.ok(inCollection('japonsko-korea').length >= 55 && inCollection('madarsko-rumunsko').length >= 55 && inCollection('andske-zeme').length >= 70);
    assert.ok(inCollection('indonesie-malajsie').length >= 40 && inCollection('egypt').length >= 20);
    assert.ok(!data.items.some(item => item.c === 'regiony' && ['Debrecín', 'Segedín', 'Papua', 'Sarawak'].includes(item.n)));
    // Území v okruzích kontinentů mimo Evropu, zámořská území a regiony s britskou vlajkou, půlměsíc i u regionů a zaniklých států
    assert.ok(inCollection('vlajky-severni-ameriky').includes('Grónsko') && inCollection('vlajky-severni-ameriky').includes('Portoriko'));
    assert.ok(inCollection('vlajky-oceanie').includes('Guam') && inCollection('vlajky-oceanie').includes('Nová Kaledonie'));
    assert.ok(core.filterItems(data.items, { collection: 'vlajky-evropy' }).every(item => item.c === 'vlajka'));
    for (const name of ['Falklandy', 'Nový Jižní Wales', 'Ontario']) assert.ok(inCollection('britska-vlajka').includes(name), name);
    for (const name of ['Turecko', 'Osmanská říše', 'Jižní Karolína']) assert.ok(inCollection('pulmesic').includes(name), name);
    assert.ok(inCollection('organizace').length >= 40 && inCollection('organizace').includes('Společnost národů'));
    // Zaniklé státy: ruční seznam i další z Wikidat; vlajka k nerozeznání od dnešní (Česko, Polsko) tam není
    const historical = data.items.filter(item => item.c === 'historie');
    assert.ok(historical.length >= 150, `${historical.length}`);
    for (const name of ['Sovětský svaz', 'Osmanská říše', 'Rakousko-Uhersko', 'Německá demokratická republika']) assert.ok(historical.some(item => item.n === name), name);
    for (const name of ['Československo', 'České království', 'Druhá Polská republika']) assert.ok(!historical.some(item => item.n === name), name);
    const modernFiles = new Set(data.items.filter(item => item.c === 'vlajka' || item.c === 'uzemi').map(item => item.im));
    assert.ok(historical.every(item => !modernFiles.has(item.im)));
    // České obce od 2 000 obyvatel a velká města od 40 000
    assert.ok(inCollection('obce-cesko').length >= 200 && inCollection('velka-mesta-cesko').length >= 22);
    // Úrovně: známé vlajky zůstávají, obce zná málokdo, nejméně známé vlajky jsou pro experty, i nový okruh má otázky v Základní
    assert.equal(core.levelOf(find('Česko')), 1);
    assert.ok(inCollection('obce-cesko').filter(name => find(name, 'cesko').k === 1).length <= 30);
    assert.equal(core.levelOf(find('Tuvalu')), 3);
    assert.ok(core.filterItems(data.items, { collection: 'egypt', tier: 'known' }).length >= 3);
});

test('vlajky: měny a bankovky – kategorie na konci, data, úrovně a žádná položka jiného tématu', () => {
    const fs = require('node:fs');
    assert.equal(vlajky.categories[vlajky.categories.length - 1].key, 'meny');
    assert.deepEqual(vlajky.categories.map(category => category.key), ['vlajka', 'znak', 'cesko', 'uzemi', 'regiony', 'mesta', 'historie', 'meny']);
    const currencies = data.items.filter(item => item.c === 'meny');
    assert.ok(currencies.length >= 150, `${currencies.length}`);
    const known = currencies.filter(item => item.k === 1);
    assert.ok(known.length >= 35 && known.length <= currencies.length * 0.33, `známých ${known.length}`);
    assert.ok(currencies.filter(item => item.x === 1).length >= 30);
    for (const name of ['Euro', 'Americký dolar', 'Koruna česká', 'Libra šterlinků', 'Zlotý', 'Maďarský forint', 'Koruna československá', 'Pražský groš', 'Německá marka']) {
        assert.equal(find(name, 'meny').k, 1, `${name} má být známá`);
    }
    for (const name of ['Komorský frank', 'Tuvalský dolar']) assert.equal(core.levelOf(find(name, 'meny')), 3, name);
    assert.equal(find('Koruna česká', 'meny').cz, 1);
    assert.equal(find('Maďarský forint', 'meny').f.iso, 'HUF');
    assert.deepEqual(find('Zlotý', 'meny').co, ['Q36']);
    const names = currencies.map(item => item.n.toLocaleLowerCase('cs'));
    assert.equal(new Set(names).size, names.length, 'stejný název dvakrát');
    // Žádné ID, které má jiné téma
    const others = new Set();
    for (const file of fs.readdirSync(path.join(__dirname, '..', 'data')).filter(name => name.endsWith('.json') && name !== 'vlajky.json')) {
        const other = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', file), 'utf8'));
        for (const item of (Array.isArray(other.items) ? other.items : [])) if (item && item.q) others.add(item.q);
    }
    assert.deepEqual(currencies.filter(item => others.has(item.q)).map(item => item.n), []);
    // Okruhy: měny kontinentů, měny před eurem, zaniklé měny, historické mince
    const europe = inCollection('meny-evropy');
    assert.ok(europe.includes('Euro') && europe.includes('Koruna česká') && !europe.includes('Japonský jen'));
    for (const name of ['Německá marka', 'Italská lira', 'Slovenská koruna', 'Chorvatská kuna']) assert.ok(inCollection('meny-pred-eurem').includes(name), name);
    assert.ok(inCollection('zanikle-meny').includes('Koruna československá'));
    for (const name of ['Pražský groš', 'Tolar', 'Dukát', 'Haléř']) assert.ok(inCollection('historicke-mince').includes(name), name);
    assert.ok(inCollection('meny-ameriky-oceanie').includes('Americký dolar') && inCollection('meny-ameriky-oceanie').includes('Australský dolar'));
});

test('vlajky: měny – otázka textem, nápovědy, nesprávné možnosti a otázky se jménem', () => {
    const forint = find('Maďarský forint', 'meny');
    assert.equal(vlajky.questionImage(forint, ctx, 'name'), null, 'na bankovce je název napsaný');
    assert.equal(vlajky.withholdText('name', forint), false);
    // Nápovědy: kontinent a rok, kód ISO (symbol z písmen Ft ne), nakonec vlajka státu; fotka bankovky s napsaným názvem ne
    const hints = vlajky.hints(forint, ctx, 'name');
    assert.deepEqual(hints[0].facts, [{ label: 'Kontinent', value: 'Evropa' }, { label: 'Od roku', value: '1946' }]);
    assert.deepEqual(hints[1].facts, [{ label: 'Kód ISO', value: 'HUF' }]);
    assert.equal(hints[2].spec.file, find('Maďarsko').im);
    assert.ok(data.items.filter(item => item.c === 'meny').every(item => !vlajky.hints(item, ctx, 'name').some(hint => hint.kind === 'photo')));
    // Symbol bez písmen je nápovědou (₹), stát a symbol z písmen jen po odpovědi
    assert.ok(vlajky.hints(find('Indická rupie', 'meny'), ctx, 'name')[1].facts.some(fact => fact.value === '₹'));
    assert.ok(!vlajky.facts(forint, ctx, 'name').some(fact => fact.value === 'Ft' || /Maďarsko/.test(fact.value)));
    assert.ok(vlajky.facts(forint, ctx, 'result').some(fact => fact.label === 'Platí se v' && fact.value === 'Maďarsko'));
    assert.ok(vlajky.facts(forint, ctx, 'result').some(fact => fact.label === 'Značka' && fact.value === 'Ft'), 'značka z písmen pod popiskem, který rozlišujícím údajem není');
    // Zakrytí popisu: název, stát, kód ISO a symbol
    const text = vlajky.censor('name', 'Forint (HUF, Ft) je zákonná měna Maďarska, maďarský forint vydává banka.', forint, ctx);
    assert.doesNotMatch(text, /forint|HUF|Ft|Maďar/iu, text);
    assert.match(vlajky.censor('name', 'Lek (L) je měna Albánie. Leží v Lublani.', find('Albánský lek', 'meny'), ctx), /Leží v Lublani/u);
    // Psané odpovědi: jednotka, když ji nemá jiná měna
    const accepted = (item) => ({ accepted: core.nameAnswers(item, vlajky.nameAliases(item, ctx)) });
    assert.ok(core.checkAnswer('forint', accepted(forint)));
    assert.ok(core.checkAnswer('česká koruna', accepted(find('Koruna česká', 'meny'))));
    assert.ok(!core.checkAnswer('dolar', accepted(find('Kanadský dolar', 'meny'))));
    // Nesprávné možnosti: stejný druh, k evropské měně evropské, k dolaru jiné dolary či pesa
    for (let seed = 0; seed < 10; seed++) {
        const wrong = choicesOf(forint, `forint-${seed}`).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
        assert.ok(wrong.every(other => other.c === 'meny' && other.ty === 'měna'), wrong.map(other => other.n).join(', '));
        assert.ok(wrong.filter(other => countries[other.co[0]] && countries[other.co[0]].continent === 'EU').length >= 2, wrong.map(other => other.n).join(', '));
        const groats = choicesOf(find('Pražský groš', 'meny'), `gros-${seed}`).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
        assert.ok(groats.every(other => other.ty === 'historická mince' || other.ty === 'drobná jednotka'), groats.map(other => other.n).join(', '));
    }
    // Otázka na stát jen u měny, jejíž název stát neprozradí (zlotý ano, forint ne); otázka na symbol jen u symbolu bez písmen
    const asked = (item, type) => Array.from({ length: 40 }, (_, seed) => vlajky.specialQuestion(item, ctx, core.createSeededRandom(`${item.q}-${seed}`))).filter(q => q && q.type === type);
    const zloty = asked(find('Zlotý', 'meny'), 'location');
    assert.ok(zloty.length > 0);
    for (const question of zloty) {
        assert.equal(question.choices.length, 4);
        assert.equal(question.choices.find(choice => choice.correct).label, 'Polsko');
    }
    assert.equal(asked(forint, 'location').length, 0);
    assert.equal(asked(forint, 'usymbol').length, 0);
    const rupee = asked(find('Indická rupie', 'meny'), 'usymbol');
    assert.ok(rupee.length > 0);
    for (const question of rupee) {
        assert.equal(question.choices.find(choice => choice.correct).label, '₹');
        assert.equal(new Set(question.choices.map(choice => choice.label)).size, 4);
        assert.ok(question.choicesOnly);
    }
    assert.equal(vlajky.censor('usymbol', 'Symbol rupie je ₹.', find('Indická rupie', 'meny'), ctx), 'Symbol rupie je [***].');
});
