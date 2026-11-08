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

test('literatura: postavy – ručně vybrané, popisy bez díla a autora, otázka „Ze kterého díla je?“', () => {
    const characters = data.items.filter(item => item.c === 'postavy');
    assert.ok(characters.length >= 140, `postav ${characters.length}`);
    for (const name of ['Lord Voldemort', 'Glum', 'Šmak', 'Kapitán Hook', 'Vinnetou', 'Arthur Dent', 'Sindibád', 'Rumcajs', 'Jára Cimrman', 'Ostap Bender']) {
        assert.equal(find(name)?.c, 'postavy', name);
    }
    for (const name of ['Lord Voldemort', 'Šmak', 'Kapitán Hook', 'Pinocchio', 'Sindibád']) assert.equal(find(name).k, 1, `${name} je známá`);
    // Popis postavy neobsahuje název díla ani příjmení autora (u otázky na dílo a autora by odpověď prozradil)
    for (const item of characters.filter(other => other.d)) {
        const f = item.f || {};
        const surname = (f.by || '').split(' ').filter(word => word.length >= 3).pop();
        const names = [f.work, ...(f.wa || []), surname].filter(Boolean);
        if (names.length) assert.ok(!core.censorName(item.d, names.join(', ')).includes('[***]'), `${item.n}: ${item.d}`);
        assert.ok(!core.censorName(item.d, item.n).includes('[***]'), `${item.n}: popis jmenuje postavu – ${item.d}`);
    }
    // Ze kterého díla je? Šmak: Hobit (i zkrácený název), nesprávné možnosti od jiných autorů
    const smak = find('Šmak');
    const question = literatura.specialQuestion(smak, ctx, rngStartingWith(0.9));
    assert.equal(question.type, 'work');
    assert.equal(question.title, 'Ze kterého díla je tato postava?');
    assert.equal(question.showName, true);
    assert.equal(question.answerLabel, 'Hobit aneb Cesta tam a zase zpátky');
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(core.checkAnswer('Hobit', question) && !core.checkAnswer('Pán prstenů', question));
    for (let seed = 0; seed < 10; seed++) {
        const other = literatura.specialQuestion(smak, ctx, rngStartingWith(0.9, `smak${seed}`));
        for (const choice of other.choices.filter(entry => !entry.correct)) {
            const work = ctx.byId.get(choice.id);
            assert.ok(work && work.c === 'dila' && work.f.by !== smak.f.by, `${choice.label}: jiný autor`);
        }
    }
    // Popis bez díla a autora: zakryje se název díla, zkrácený název i jméno autora
    const censored = literatura.censor('work', 'Šmak je drak z knihy Hobit aneb Cesta tam a zase zpátky (Hobit), kterou napsal J. R. R. Tolkien.', smak, ctx);
    assert.doesNotMatch(censored, /Hobit|Tolkien|Cesta tam/);
    assert.match(censored, /^Šmak je drak/);
    // Nápovědy: země, autor, fotka; dílo ne
    assert.deepEqual(literatura.hints(smak, ctx, 'work').map(step => step.label || step.kind), ['původ', 'autor', 'photo']);
    assert.ok(!literatura.facts(smak, ctx, 'work').some(fact => fact.label === 'Dílo'));
    // Dílo mimo téma (Stopařův průvodce po Galaxii): správná možnost je jeho název
    const dent = literatura.specialQuestion(find('Arthur Dent'), ctx, rngStartingWith(0.9));
    assert.equal(dent.answerLabel, 'Stopařův průvodce po Galaxii');
    assert.ok(core.checkAnswer('Stopařův průvodce', dent));
    // Napsané jiné dílo se pozná
    assert.deepEqual(literatura.findAnswer('work', 'Pán prstenů', smak, ctx), { topic: 'literatura', id: find('Pán prstenů').q });
    // Postava celé série (Gandalf, Harry Potter) a postava, jejíž jméno je v názvu díla (Pinocchio), se na dílo neptá
    for (const name of ['Gandalf', 'Harry Potter', 'Sherlock Holmes', 'Pinocchio']) {
        assert.equal(literatura.specialQuestion(find(name), ctx, rngStartingWith(0.9)), null, name);
    }
    // Kdo tuto postavu vymyslel? u postavy od autora z tématu; od autora mimo téma (Barrie) se neptá
    assert.equal(literatura.specialQuestion(find('Šmak'), ctx, rngStartingWith(0.1)).answerLabel, 'John Ronald Reuel Tolkien');
    assert.equal(literatura.specialQuestion(find('Kapitán Hook'), ctx, rngStartingWith(0.1)), null);
    // Česká stopa u českých postav
    assert.equal(find('Rumcajs').cz, 1);
    assert.ok(inCollection('ceska-literatura').includes('Jára Cimrman'));
});
