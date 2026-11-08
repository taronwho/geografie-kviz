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
    assert.ok(data.collections.length >= 8 && data.collections.length <= 40, data.collections.map(c => c.label).join(', '));
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
    const texas = regions.find(item => item.q === 'Q1439');
    if (texas) {
        const near = regions.find(item => item.q === 'Q1649'); // Oklahoma
        const far = regions.find(item => item.q === 'Q1066807' || item.n === 'Maine');
        if (near && far) assert.ok(vlajky.similarity(texas, { ...near, sg: far.sg }, ctx) > vlajky.similarity(texas, far, ctx));
    }
    assert.deepEqual(vlajky.sameCountry, ['regiony']);
});
