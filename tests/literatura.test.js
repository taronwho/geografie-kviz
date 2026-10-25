// Testy tématu Literatura na skutečných datech (data/literatura.json): známé položky, okruhy, otázky na autora a na století
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const literatura = require('../topics/literatura.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'literatura.json'), 'utf8'));
const ctx = { topic: literatura, items: data.items, collections: data.collections, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
// rng, který poprvé vrátí zadanou hodnotu (rozhodne o druhu otázky) a dál se chová jako semínko
const rngStartingWith = (first, seed = 'literatura') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};

test('literatura: známé položky, česká stopa a okruhy', () => {
    for (const name of ['Božena Němcová', 'Karel Hynek Mácha', 'Karel Čapek', 'Jaroslav Hašek', 'Franz Kafka', 'William Shakespeare', 'Homér',
        'Babička', 'Máj', 'Kytice', 'R.U.R.', 'Hamlet', 'Ilias', 'Sherlock Holmes', 'Harry Potter']) {
        assert.ok(find(name) && find(name).k === 1, `chybí známá položka ${name}`);
    }
    assert.equal(find('Karel Čapek').cz, 1);
    assert.ok(inCollection('ceska-literatura').includes('Babička') && !inCollection('ceska-literatura').includes('Hamlet'));
    assert.ok(inCollection('poezie').includes('Máj') && inCollection('drama').includes('R.U.R.'));
    assert.ok(inCollection('antika').includes('Homér') && inCollection('antika').includes('Ilias'));
    assert.ok(inCollection('nobelova-cena').includes('Jaroslav Seifert'));
    assert.ok(inCollection('ruska').includes('Lev Nikolajevič Tolstoj'));
    // Politici, vědci a filmové či komiksové postavy v tématu nejsou
    assert.ok(!data.items.some(item => ['Donald Trump', 'Albert Einstein', 'Karl Marx', 'Batman', 'Mickey Mouse', 'Darth Vader', 'Bible'].includes(item.n)));
    // Jazyk tvorby podle země, ne jazyk, kterým spisovatel jen mluvil
    assert.equal(find('Franz Kafka').f.lang, 'němčina');
    assert.notEqual(find('Karel Čapek').f.lang, 'francouzština');
});

test('literatura: data bez rozporů – roky a jedinečná jména', () => {
    const thisYear = new Date().getFullYear();
    const names = new Set();
    for (const item of data.items) {
        const key = core.normalizeAnswer(item.n);
        assert.ok(!names.has(key), `dvakrát ${item.n}`);
        names.add(key);
        const f = item.f || {};
        if (f.born !== undefined && f.died !== undefined) assert.ok(f.died > f.born, `${item.n}: úmrtí před narozením`);
        for (const year of [f.born, f.died, f.year]) if (year !== undefined) assert.ok(year <= thisYear, `${item.n}: budoucí rok`);
        if (f.byq) assert.equal(ctx.byId.get(f.byq).c, 'spisovatele', `${item.n}: autor`);
    }
    // Homérovy roky jsou jen odhad – neuvádějí se
    assert.equal(find('Homér').f.born, undefined);
});

test('literatura: otázka na autora díla a postavy', () => {
    const babicka = find('Babička');
    const question = literatura.specialQuestion(babicka, ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'author');
    assert.equal(question.title, 'Kdo to napsal?');
    assert.equal(question.answerLabel, 'Božena Němcová');
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(question.choices.every(choice => ctx.byId.get(choice.id).c === 'spisovatele'));
    assert.ok(question.choices.every(choice => ctx.byId.get(choice.id).sx === 'f'), 'ke spisovatelce spisovatelky');
    assert.ok(core.checkAnswer('Němcová', question) && !core.checkAnswer('Erben', question));
    assert.match(literatura.censor('author', 'Babička je román Boženy Němcové.', babicka, ctx), /^Babička je román \[\*\*\*\]\.$/);
    assert.deepEqual(literatura.findAnswer('author', 'Karel Jaromír Erben', babicka, ctx), { topic: 'literatura', id: find('Karel Jaromír Erben').q });
    // Autoři stejnojmenných děl mezi možnostmi nejsou
    const may = find('Máj');
    for (let seed = 0; seed < 8; seed++) {
        const other = literatura.specialQuestion(may, ctx, rngStartingWith(0.1, `maj${seed}`));
        assert.ok(other && !other.choices.some(choice => (may.xa || []).includes(choice.id)));
    }
    // Postava: „Kdo tuto postavu vymyslel?“
    const holmes = literatura.specialQuestion(find('Sherlock Holmes'), ctx, rngStartingWith(0.1));
    assert.equal(holmes.title, 'Kdo tuto postavu vymyslel?');
    assert.equal(holmes.answerLabel, 'Arthur Conan Doyle');
    // Latinské tvary jmen se v popisu zakryjí (Publia Vergilia Marona)
    assert.doesNotMatch(literatura.censor('author', 'Epos Publia Vergilia Marona.', find('Aeneis'), ctx), /Publi|Vergili|Maron/);
    // Nápovědy: vznik, další díla, portrét
    assert.deepEqual(literatura.hints(babicka, ctx, 'author').map(step => step.label || step.kind), ['vznik díla', 'další díla', 'visual']);
    assert.equal(literatura.specialQuestion(babicka, ctx, rngStartingWith(0.5)), null);
});

test('literatura: otázka na století', () => {
    const macha = find('Karel Hynek Mácha');
    const question = literatura.specialQuestion(macha, ctx, rngStartingWith(0.9));
    assert.equal(question.type, 'century');
    assert.equal(question.title, 'Ve kterém století žil?');
    assert.equal(question.answerLabel, '19. století');
    assert.ok(core.checkAnswer('19', question) && !core.checkAnswer('18. století', question));
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    // Žena: narodila se; letopočty z popisu zmizí, osa bez letopočtů
    const nemcova = literatura.specialQuestion(find('Božena Němcová'), ctx, rngStartingWith(0.9));
    assert.match(nemcova.title, /žila|narodila/);
    assert.doesNotMatch(literatura.censor('century', 'Spisovatelka (1820–1862) 19. století.', find('Božena Němcová'), ctx), /\d/);
    const hints = literatura.hints(macha, ctx, 'century');
    assert.equal(hints[2].spec.blind, true);
    assert.ok(!literatura.facts(macha, ctx, 'century').some(fact => /\d/.test(fact.value)));
    // Dílo s letopočtem v názvu ani odhadnutý starověký rok se neptá
    assert.equal(literatura.specialQuestion(find('Homér'), ctx, rngStartingWith(0.9)), null);
    assert.equal(literatura.specialQuestion(find('Ilias'), ctx, rngStartingWith(0.9)), null);
});

test('literatura: nápovědy, psané odpovědi a podobné možnosti', () => {
    const capek = find('Karel Čapek');
    const anchors = core.buildTimeline(literatura.visual(capek, ctx, 'name'), 360).anchors.map(anchor => anchor.label);
    assert.ok(!anchors.some(label => /Čapk|R\.U\.R/.test(label)), anchors.join(' / '));
    assert.deepEqual(literatura.hints(capek, ctx, 'name').map(step => step.kind), ['facts', 'visual', 'photo', 'facts']);
    assert.ok(literatura.nameAliases(capek, ctx).includes('Čapek'));
    // Krátká jména (Li Po) se v popisu zakryjí celá
    assert.doesNotMatch(literatura.censor('name', 'Li Po byl básník.', find('Li Po'), ctx), /Li Po/);
    const wrongOf = (name, seed) => core.buildItemChoices(find(name), data.items, core.createSeededRandom(seed), other => literatura.similarity(find(name), other, ctx))
        .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
    for (const seed of ['a', 'b', 'c']) {
        assert.ok(wrongOf('Karel Čapek', seed).filter(other => other.cz === 1).length >= 2, 'k Čapkovi čeští spisovatelé');
        assert.ok(wrongOf('Hamlet', seed).some(other => other.f.by === 'William Shakespeare'), 'k Hamletovi další Shakespearovy hry');
    }
});
