// Biologie – člověk a zdraví (scripts/lib/biologie-zdravi.mjs) na skutečných datech: nemoci, lékařství, slavní lékaři a psychologie
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/biologie.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'biologie.json'), 'utf8'));
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(COUNTRIES);
const ctx = { topic, items: data.items, collections: data.collections, countries: COUNTRIES, byId: new Map(data.items.map(item => [item.q, item])) };
const HEALTH = ['nemoci', 'lekarstvi', 'lekari', 'psychologie'];
const inCategory = (key) => data.items.filter(item => item.c === key);
const find = (name, category) => {
    const item = data.items.find(candidate => candidate.n === name && (!category || candidate.c === category));
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
const wrongChoices = (item, seed) => core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => topic.similarity(item, other, ctx), core.cultureLandsFor(topic, ctx))
    .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
const known = (list) => list.filter(item => item.k === 1);

test('zdraví: nové kategorie na konci seznamu, staré klíče zůstaly', () => {
    const keys = topic.categories.map(category => category.key);
    assert.deepEqual(keys.slice(0, 11), ['savci', 'ptaci', 'plazi', 'ryby', 'hmyz', 'bezobratli', 'rostliny', 'houby', 'pravek', 'plemena', 'telo']);
    assert.deepEqual(keys.slice(11), HEALTH);
    for (const key of HEALTH) {
        const category = topic.categories.find(entry => entry.key === key);
        assert.ok(category.label.length <= 16, `${key}: krátký název do okna Co hrát`);
        assert.ok(category.icon && category.question && category.placeholder, key);
    }
});

test('zdraví: dost položek a dost známých v každé kategorii', () => {
    const minimum = { nemoci: [250, 70], lekarstvi: [150, 45], lekari: [90, 30], psychologie: [150, 40] };
    for (const [key, [size, knownMin]] of Object.entries(minimum)) {
        const list = inCategory(key);
        assert.ok(list.length >= size, `${key}: ${list.length} položek`);
        assert.ok(known(list).length >= knownMin, `${key}: ${known(list).length} známých`);
        // Známé jen opravdu známé: nejvýš polovina kategorie
        assert.ok(known(list).length <= list.length * 0.5, `${key}: ${known(list).length} známých z ${list.length}`);
    }
    for (const name of ['Chřipka', 'Tuberkulóza', 'Covid-19', 'Diabetes mellitus', 'Alzheimerova choroba', 'Spalničky', 'Deprese', 'Plané neštovice']) assert.equal(find(name, 'nemoci').k, 1, name);
    for (const name of ['Kardiologie', 'Pediatrie', 'Očkování', 'Antibiotikum', 'Penicilin', 'Fonendoskop', 'Defibrilátor', 'Magnetická rezonance']) assert.equal(find(name, 'lekarstvi').k, 1, name);
    for (const name of ['Hippokratés', 'Louis Pasteur', 'Alexander Fleming', 'Jan Evangelista Purkyně', 'Edward Jenner', 'Robert Koch']) assert.equal(find(name, 'lekari').k, 1, name);
    for (const name of ['Sigmund Freud', 'Carl Gustav Jung', 'Arachnofobie', 'Klaustrofobie', 'Déjà vu', 'Temperament']) assert.equal(find(name, 'psychologie').k, 1, name);
});

test('zdraví: nemoci – skupina podle MKN-10, bez drastických fotek, nevhodných a obecných položek', () => {
    const diseases = inCategory('nemoci');
    assert.ok(diseases.every(item => item.f && item.f.grp), 'každá nemoc má skupinu');
    assert.equal(find('Chřipka').f.grp, 'dýchací soustava');
    assert.equal(find('Tuberkulóza').f.grp, 'infekce a parazité');
    assert.equal(find('Parkinsonova nemoc').f.grp, 'nervová soustava', 'Parkinson není duševní porucha');
    assert.equal(find('Schizofrenie').ty, 'duševní porucha');
    // Fotka jen ze světelného či elektronového mikroskopu (původce, tkáň), nikdy pacient, kůže nebo rána
    for (const item of diseases.filter(entry => entry.im)) {
        assert.match(item.im, /\.jpe?g$/i, item.n);
        assert.doesNotMatch(item.im, /patient|child|boy|girl|woman|rash|lesion|skin|wound|ulcer|gangren|face|penis|vagin|surg|autops/i, `${item.n}: ${item.im}`);
    }
    assert.ok(diseases.filter(item => item.im).length >= 30, 'snímky z mikroskopu u infekčních nemocí');
    // Do rodinného kvízu nepatří sexuální poruchy, sebevraždy, popravy a obecné pojmy; fobie jsou v psychologii
    assert.ok(!diseases.some(item => /erekt|ejakul|penis|sebevra|poprav|oběšen|^syndrom$|onemocnění$|fobie$/iu.test(item.n)), 'nevhodné či obecné položky');
    // Očkování jen u nemocí s běžnou očkovací látkou (u Alzheimerovy choroby jsou ve Wikidatech jen pokusné)
    assert.equal(find('Spalničky').f.vac, 1);
    assert.equal(find('Alzheimerova choroba').f.vac, undefined);
    assert.ok(inCollection('ockovani').includes('Tetanus') && inCollection('detske-nemoci').includes('Zarděnky'));
    assert.ok(inCollection('nemoci-infekcni').includes('Mor') && inCollection('nemoci-dusevni').includes('Deprese'));
});

test('zdraví: nemoci – nápovědy, kód MKN-10 až po odpovědi, jiný český název jako odpověď', () => {
    const flu = find('Chřipka');
    const hints = topic.hints(flu, ctx, 'name');
    assert.deepEqual(hints.map(hint => hint.label || hint.kind), ['facts', 'příznaky', 'původce', 'photo']);
    assert.ok(hints[0].facts.some(fact => fact.label === 'Skupina nemocí'));
    assert.ok(!topic.facts(flu, ctx, 'name').some(fact => fact.label === 'Kód MKN-10'));
    assert.ok(topic.facts(flu, ctx, 'result').some(fact => fact.label === 'Kód MKN-10'));
    // Fakt, který by prozradil název (hepatitida – hepatologie), aplikace zahodí; skupina nemocí ale zůstane skoro všude
    // (hodnota bez slov „nemoc“ a „porucha“, která jsou v názvech; zahodí se jen u Srdečního selhání, Rakoviny plic a podobných)
    const generic = core.genericWordsOf(ctx);
    let kept = 0;
    for (const item of inCategory('nemoci')) {
        const names = core.answerNamesFor({ type: 'name', choices: [] }, item, ctx);
        const options = { isGeneric: (word) => core.isGenericWord(word, generic), rootNames: core.specificWords(names, generic) };
        if (topic.facts(item, ctx, 'name').some(fact => fact.label === 'Skupina nemocí' && !core.factRevealsAnswer(fact, names, options))) kept++;
    }
    assert.ok(kept >= inCategory('nemoci').length * 0.9, `skupina zůstane u ${kept} z ${inCategory('nemoci').length}`);
    assert.ok(core.checkAnswer('cukrovka', { accepted: core.nameAnswers(find('Diabetes mellitus'), topic.nameAliases(find('Diabetes mellitus'), ctx)) }));
    assert.equal(topic.questionTitle(find('Deprese')), 'Jaká duševní porucha to je?');
    assert.equal(topic.questionTitle(flu), null, 'u nemoci platí otázka kategorie');
    assert.equal(topic.specialQuestion(flu, ctx, () => 0.1), null, 'na řád se u nemocí neptáme');
});

test('zdraví: nesprávné možnosti ze stejné kategorie a stejného druhu', () => {
    for (const seed of ['a', 'b', 'c']) {
        const flu = wrongChoices(find('Chřipka'), seed);
        assert.ok(flu.every(other => other.c === 'nemoci'), flu.map(other => other.n).join(', '));
        assert.ok(flu.filter(other => other.f.grp === 'dýchací soustava' || other.f.grp === 'infekce a parazité').length >= 2, flu.map(other => other.n).join(', '));
        assert.ok(wrongChoices(find('Kardiologie'), seed).every(other => other.c === 'lekarstvi' && other.f.kind === 'obory'));
        assert.ok(wrongChoices(find('Fonendoskop'), seed).every(other => other.f.kind === 'pristroje'));
        assert.ok(wrongChoices(find('Arachnofobie'), seed).every(other => other.f.kind === 'fobie'));
        assert.ok(wrongChoices(find('Sigmund Freud'), seed).every(other => other.c === 'psychologie' && other.f.born !== undefined), 'k psychologovi jen psychologové');
        assert.ok(wrongChoices(find('Alexander Fleming'), seed).every(other => other.c === 'lekari' && other.sx !== 'f'));
    }
    assert.equal(topic.questionTitle(find('Kardiologie')), 'Který lékařský obor to je?');
    assert.equal(topic.questionTitle(find('Arachnofobie')), 'Jaká fobie to je?');
    assert.equal(topic.questionTitle(find('Sigmund Freud')), 'Kdo to je?');
});

test('zdraví: lékaři a psychologové – fotka, roky, země; ne politici, spisovatelé a zločinci', () => {
    const people = data.items.filter(item => (item.c === 'lekari' || item.c === 'psychologie') && item.f.born !== undefined);
    assert.ok(people.every(item => item.ty && Number.isInteger(item.f.born)), 'druh a rok narození');
    assert.ok(inCategory('lekari').every(item => item.im), 'lékař se pozná podle fotky');
    for (const name of ['Josef Mengele', 'Anton Pavlovič Čechov', 'Che Guevara', 'Salvador Allende', 'Friedrich Schiller', 'Carl Linné']) {
        assert.ok(!data.items.some(item => item.n === name && HEALTH.includes(item.c)), name);
    }
    assert.equal(find('Sigmund Freud').c, 'psychologie');
    assert.equal(find('Ivan Petrovič Pavlov').c, 'lekari');
    assert.ok(inCollection('cesti-lekari').includes('Jan Evangelista Purkyně'));
    assert.ok(inCollection('lekari-davnych-dob').includes('Hippokratés') && !inCollection('lekari-davnych-dob').includes('Alexander Fleming'));
    assert.equal(find('Alexander Fleming').f.nobel, 1);
    // Časová osa s milníky medicíny, obor jen lékařský (ne poezie u Avicenny)
    assert.equal(topic.visual(find('Robert Koch'), ctx).type, 'timeline');
    assert.ok(!(find('Avicenna').f.field || []).includes('poezie'));
    assert.match(topic.subtitle(find('Louis Pasteur'), ctx), /^1822–1895/);
});

test('zdraví: psychologie – fobie, jevy a experimenty; lékařství po okruzích', () => {
    const phobias = inCategory('psychologie').filter(item => item.f.kind === 'fobie');
    assert.ok(phobias.length >= 15 && phobias.every(item => /fobie$/u.test(item.n)), phobias.map(item => item.n).join(', '));
    assert.ok(inCollection('psychologicke-experimenty').includes('Milgramův experiment'));
    for (const id of ['lekarske-obory', 'leky', 'lekarske-pristroje', 'vysetreni-lecba', 'psychologove', 'psychologicke-pojmy', 'fobie']) {
        assert.ok(inCollection(id).length >= 15, `${id}: ${inCollection(id).length}`);
    }
    // Obory a zákroky z operačních sálů bez fotky
    for (const name of ['Chirurgie', 'Transplantace srdce', 'Císařský řez', 'Amputace']) assert.ok(!find(name, 'lekarstvi').im, name);
});
