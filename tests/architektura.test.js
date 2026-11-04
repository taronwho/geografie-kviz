// Testy tématu Architektura na skutečných datech (data/architektura.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/architektura.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'architektura.json'), 'utf8'));
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const ctx = { topic, items: data.items, collections: data.collections, countries };
const find = (name) => data.items.find(item => item.n === name);
const styleKeyOf = (label) => (data.items.find(item => item.c === 'slohy' && item.n === label) || { f: {} }).f.key;
// Generátor, který napoprvé vrátí zadané číslo (volba druhu otázky) a dál náhodná čísla se semínkem
const firstThen = (first, seed) => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const SPORNE = [['Gotika', 'Novogotika'], ['Gotika', 'Barokní gotika'], ['Baroko', 'Rokoko'], ['Baroko', 'Novobaroko'], ['Renesance', 'Novorenesance'],
    ['Románský sloh', 'Novorománský sloh'], ['Klasicismus', 'Empír'], ['Řecká antika', 'Římská antika'], ['Historismus', 'Novogotika']];

test('architektura: slavné a české stavby, slohy a architekti v datech', () => {
    for (const [name, style] of [['Katedrála svatého Víta v Praze', 'Gotika'], ['Karlův most', 'Gotika'], ['Vila Tugendhat', 'Funkcionalismus'],
        ['Tančící dům', 'Dekonstruktivismus'], ['Dům U Černé Matky Boží', 'Kubismus'], ['Sagrada Família', 'Secese'], ['Koloseum', 'Římská antika']]) {
        const item = find(name);
        assert.ok(item && item.k === 1 && item.c === 'stavby', `chybí známá stavba ${name}`);
        assert.equal(item.f.st, styleKeyOf(style), `${name}: sloh`);
    }
    assert.equal(find('Karlův most').cz, 1);
    for (const name of ['Gotika', 'Baroko', 'Renesance', 'Románský sloh', 'Secese', 'Kubismus', 'Funkcionalismus']) assert.ok(find(name) && find(name).k === 1, name);
    for (const name of ['Antoni Gaudí', 'Le Corbusier', 'Petr Parléř', 'Jan Blažej Santini-Aichel', 'Josef Gočár', 'Jan Kotěra']) {
        assert.ok(find(name) && find(name).c === 'architekti' && find(name).k === 1, `chybí architekt ${name}`);
    }
    assert.ok(find('Josef Gočár').cz === 1 && find('Antoni Gaudí').cz === undefined);
    assert.ok(!data.items.some(item => ['Raoul Wallenberg', 'George Washington', 'Leonardo da Vinci', 'Socha Svobody', 'Svatopetrské náměstí'].includes(item.n)),
        'jen skuteční architekti a stavby');
    // Jedna položka na název (stejně pojmenované stavby s upřesněním), roky bez rozporů a budoucnosti
    assert.equal(new Set(data.items.map(item => item.n.toLowerCase())).size, data.items.length);
    assert.ok(find('Pantheon (Řím)') || find('Pantheon'), 'Pantheon');
    assert.ok(!find('Kostel Všech svatých'), 'obecný název kostela jen s upřesněním');
    const year = new Date().getFullYear();
    for (const item of data.items) {
        const f = item.f || {};
        if (f.y !== undefined) assert.ok(f.y <= year, `${item.n}: rok`);
        if (f.died !== undefined) assert.ok(f.born < f.died && f.died <= year, `${item.n}: život`);
    }
    // Rok stavby sedí k období slohu
    for (const item of data.items.filter(other => other.c === 'stavby' && other.f.y !== undefined)) {
        const style = data.items.find(other => other.c === 'slohy' && other.f.key === item.f.st);
        assert.ok(item.f.y >= style.f.from - 150 && item.f.y <= style.f.to + 60, `${item.n}: ${item.f.y} × ${style.n}`);
    }
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    assert.ok(inCollection('cesko').includes('Karlův most') && !inCollection('cesko').includes('Koloseum'));
    assert.ok(inCollection('praha').includes('Tančící dům') && !inCollection('praha').includes('Vila Tugendhat'));
    assert.ok(inCollection('gotika').includes('Gotika') && inCollection('gotika').includes('Petr Parléř'));
    assert.ok(inCollection('moderna').includes('Dům U Černé Matky Boží'));
    assert.ok(inCollection('cesti-architekti').includes('Josef Gočár'));
});

test('architektura: otázka na sloh – fotka, jedna správná možnost, žádné sporné dvojice, sloh zakrytý', () => {
    const cathedral = find('Katedrála svatého Víta v Praze');
    const question = topic.specialQuestion(cathedral, ctx, firstThen(0.5, 'vit'));
    assert.equal(question.type, 'style');
    assert.equal(question.title, 'Jaký je to sloh?');
    assert.ok(question.showName);
    assert.equal(question.answerLabel, 'Gotika');
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(!question.choices.some(choice => ['Novogotika', 'Barokní gotika'].includes(choice.label)), question.choices.map(c => c.label).join(', '));
    assert.ok(core.checkAnswer('gotický', question) && core.checkAnswer('gotika', question) && !core.checkAnswer('baroko', question));
    assert.deepEqual(topic.questionImage(cathedral, ctx, 'style'), { file: cathedral.im, hash: cathedral.ih, label: 'Stavba', icon: 'church' });
    const text = topic.censor('style', 'Gotická katedrála s novogotickým západním průčelím, dostavěná v duchu gotiky.', cathedral, ctx);
    assert.doesNotMatch(text, /goti/i);
    // Nápovědy: sloh mezi nimi není, rok jako poslední (časová osa)
    const plan = topic.hints(cathedral, ctx, 'style');
    assert.ok(!plan.some(step => (step.facts || []).some(fact => fact.label === 'Sloh')));
    assert.equal(plan[plan.length - 2].spec.type, 'timeline');
    assert.ok(plan[plan.length - 1].facts[0].value.split(', ').every(name => find(name).cz === 1), 'k české stavbě české ukázky slohu');
    assert.ok(!topic.facts(cathedral, ctx, 'style').some(fact => fact.label === 'Sloh'));
    // Ve všech stavbách: možnosti bez sporných dvojic a název stavby sloh neprozradí
    let asked = 0;
    for (const item of data.items.filter(other => other.c === 'stavby')) {
        const special = topic.specialQuestion(item, ctx, firstThen(0.5, item.q));
        if (!special) continue;
        asked++;
        const labels = special.choices.map(choice => choice.label);
        assert.equal(new Set(labels).size, 4, `${item.n}: ${labels}`);
        for (const [a, b] of SPORNE) assert.ok(!(labels.includes(a) && labels.includes(b)), `${item.n}: ${labels.join(', ')}`);
        assert.doesNotMatch(item.n, /gotick|barokn|renesanční|secesní/i);
    }
    assert.ok(asked > 500);
    // Novogotická stavba v názvu (Novogotický kostel…) se na sloh neptá
    const named = data.items.find(item => item.c === 'stavby' && /gotick|barokn/i.test(item.n));
    if (named) assert.notEqual((topic.specialQuestion(named, ctx, firstThen(0.5, 'x')) || {}).type, 'style');
});

test('architektura: otázka „Kdo ji navrhl?“ jen u jediného autora, se jménem zakrytým', () => {
    const paul = find('Katedrála svatého Pavla');
    const question = topic.specialQuestion(paul, ctx, firstThen(0.1, 'pavel'));
    assert.equal(question.type, 'architect');
    assert.equal(question.answerLabel, 'Christopher Wren');
    assert.ok(core.checkAnswer('Wren', question) && core.checkAnswer('Christopher Wren', question));
    assert.ok(!core.checkAnswer('Bernini', question));
    assert.doesNotMatch(topic.censor('architect', 'Katedrálu navrhl Christopher Wren, Wrenovo dílo je…', paul, ctx), /Wren/);
    assert.deepEqual(topic.findAnswer('architect', 'Gian Lorenzo Bernini', paul, ctx), { topic: 'architektura', id: find('Gian Lorenzo Bernini').q });
    // Katedrála sv. Víta má víc autorů – na autora se neptá
    assert.notEqual((topic.specialQuestion(find('Katedrála svatého Víta v Praze'), ctx, firstThen(0.1, 'vit')) || {}).type, 'architect');
    // Nápověda „další stavba“ jméno architekta neobsahuje
    const plan = topic.hints(paul, ctx, 'architect');
    assert.ok(plan.every(step => (step.facts || []).every(fact => !/Wren/.test(fact.value))));
    assert.equal(topic.specialQuestion(paul, ctx, firstThen(0.95, 'pavel')), null, 'někdy i otázka na název');
});

test('architektura: sloh jako otázka, architekti, psané odpovědi', () => {
    const gothic = find('Gotika');
    for (const seed of ['a', 'b', 'c', 'd']) {
        const choices = core.buildItemChoices(gothic, data.items, core.createSeededRandom(seed), other => topic.similarity(gothic, other, ctx));
        assert.ok(!choices.some(choice => ['Novogotika', 'Barokní gotika'].includes(choice.label)), choices.map(c => c.label).join(', '));
    }
    assert.ok(core.isAnswerMatch('gotický sloh', core.nameAnswers(gothic, topic.nameAliases(gothic, ctx))));
    assert.doesNotMatch(topic.censor('name', 'Gotická architektura navazuje na románskou, novogotika ji napodobuje.', gothic, ctx), /goti/i);
    assert.match(topic.censor('name', 'Gotická architektura navazuje na románskou.', gothic, ctx), /románskou/);
    assert.equal(topic.questionImage(gothic, ctx, 'name').label, 'Ukázka');
    assert.ok(topic.facts(gothic, ctx, 'result').some(fact => fact.label === 'Období'));
    assert.equal(topic.visual(gothic, ctx, 'name').type, 'timeline');
    // Architekt: příjmení jako odpověď jen jednoznačné (Dientzenhoferů je víc)
    assert.ok(topic.nameAliases(find('Antoni Gaudí'), ctx).includes('Gaudí'));
    assert.ok(!topic.nameAliases(find('Kryštof Dientzenhofer'), ctx).includes('Dientzenhofer'));
    assert.ok(topic.nameAliases(find('Jan Blažej Santini-Aichel'), ctx).includes('Santini'));
    assert.equal(topic.questionImage(find('Antoni Gaudí'), ctx, 'name'), null, 'portrét je nápověda, ne obrázek otázky');
    assert.match(topic.subtitle(find('Josef Gočár'), ctx), /^1880–1945/);
    // K české stavbě i české události na časové ose
    const anchors = core.buildTimeline(topic.visual(find('Karlův most'), ctx, 'result'), 360).anchors.map(anchor => anchor.label).join(' ');
    assert.ok(anchors.length > 0);
});
