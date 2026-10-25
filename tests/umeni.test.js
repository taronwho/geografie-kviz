// Testy tématu Výtvarné umění na skutečných datech (data/umeni.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');
const umeni = require('../topics/umeni.js');

const data = require(path.join(__dirname, '..', 'data', 'umeni.json'));
const ctx = { topic: umeni, items: data.items, collections: data.collections, countries: {}, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
// Generátor, který poprvé vrátí zadané číslo (volba druhu otázky) a pak pokračuje se semínkem
const rngStartingWith = (first, seed = 'umeni') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const asLines = (facts) => facts.map(fact => `${fact.label}: ${fact.value}`);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);

test('umění: známé obrazy, sochy a umělci, česká stopa', () => {
    for (const name of ['Mona Lisa', 'Hvězdná noc', 'Dívka s perlou', 'Guernica', 'David', 'Venuše Mélská', 'Leonardo da Vinci', 'Vincent van Gogh', 'Claude Monet']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    for (const name of ['Slovanská epopej', 'Věstonická venuše', 'Pomník svatého Václava', 'Alfons Mucha', 'Josef Lada', 'Mikoláš Aleš', 'Toyen']) {
        const item = find(name);
        assert.ok(item.k === 1 && item.cz === 1, `${name}: známá česká položka`);
    }
    // Česká stopa jen u Čechů a děl v Česku, Slováci (Ján Kulich) ne
    assert.ok(!find('Claude Monet').cz);
    assert.ok(!data.items.some(item => item.cz && /^slovensk/u.test(item.d || '')), 'slovenští umělci nejsou čeští');
    // Mezi umělci nejsou spisovatelé a herci, kteří taky malovali
    assert.ok(!data.items.some(item => ['Johann Wolfgang Goethe', 'Karel Čapek', 'Chalíl Džibrán', 'Dennis Hopper', 'Hermann Hesse'].includes(item.n)));
    // Díla mají obrázek, název bez upřesnění v závorce a žádné nevhodné akty
    assert.ok(data.items.filter(item => item.c !== 'umelci').every(item => item.im && item.ih && !/\(/.test(item.n)));
    assert.ok(!data.items.some(item => item.n === 'Původ světa'));
});

test('umění: kontrola dat – roky bez rozporů a budoucnosti, jedna položka na jméno', () => {
    const thisYear = new Date().getFullYear();
    for (const item of data.items) {
        const f = item.f || {};
        if (f.born !== undefined && f.died !== undefined) assert.ok(f.died > f.born && f.died - f.born <= 105, `${item.n}: ${f.born}–${f.died}`);
        for (const year of [f.born, f.died, f.year]) assert.ok(year === undefined || year <= thisYear, `${item.n}: rok ${year}`);
        if (item.c === 'umelci') assert.ok(f.born !== undefined, `${item.n}: bez narození`);
    }
    assert.equal(new Set(data.items.map(item => item.n.toLocaleLowerCase('cs'))).size, data.items.length);
    assert.equal(find('Pieta').c, 'sochy', 'stejné jméno dostane známější dílo (Michelangelova Pieta)');
});

test('umění: obraz je vidět hned v otázce, nápovědy podle druhu otázky', () => {
    const monaLisa = find('Mona Lisa');
    assert.deepEqual(umeni.questionImage(monaLisa, ctx, 'name'), { file: monaLisa.im, hash: monaLisa.ih, label: 'Obraz', icon: 'frame' });
    assert.equal(umeni.questionImage(find('David'), ctx, 'name').label, 'Socha');
    assert.equal(umeni.questionImage(find('Leonardo da Vinci'), ctx, 'name'), null);
    // Otázka na název: rok ukazuje časová osa (ne fakta), fakta obsahují autora, směr a sbírku
    const facts = asLines(umeni.facts(monaLisa, ctx, 'name'));
    assert.ok(facts.includes('Autor: Leonardo da Vinci') && facts.includes('Sbírka: Louvre'), facts.join(' / '));
    assert.ok(!facts.some(line => line.startsWith('Vznik')));
    assert.ok(asLines(umeni.facts(monaLisa, ctx, 'result')).includes('Vznik: kolem 1503'));
    const timeline = umeni.visual(monaLisa, ctx, 'name');
    assert.equal(timeline.type, 'timeline');
    assert.deepEqual(timeline.points, [1503]);
    // Umělec: osa života s milníky dějin umění, které ho neprozradí; Čech má české události
    const mucha = core.buildTimeline(umeni.visual(find('Alfons Mucha'), ctx, 'name'), 360).anchors.map(anchor => anchor.label);
    assert.ok(mucha.some(label => /Národního divadla|Mánes|Československa/.test(label)), mucha.join(' / '));
    const manes = core.buildTimeline(umeni.visual(find('Josef Mánes'), ctx, 'name'), 360).anchors.map(anchor => anchor.label);
    assert.ok(!manes.some(label => /Mánes/.test(label)), 'Spolek Mánes neprozradí Josefa Mánesa');
    // Pravěké dílo bez přesného roku: bez osy, vznik slovy
    const venus = find('Věstonická venuše');
    assert.equal(umeni.visual(venus, ctx, 'name'), null);
    assert.ok(asLines(umeni.facts(venus, ctx, 'name')).some(line => /^Vznik: kolem 29\s000 př\. n\. l\.$/u.test(line)), asLines(umeni.facts(venus, ctx, 'name')).join(' / '));
});

test('umění: „Kdo to namaloval?“ – jistý autor, malíři ze stejné doby, zakrytý autor', () => {
    const question = umeni.specialQuestion(find('Mona Lisa'), ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'author');
    assert.equal(question.title, 'Kdo to namaloval?');
    assert.ok(question.showName);
    assert.equal(question.answerLabel, 'Leonardo da Vinci');
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    for (const choice of question.choices) {
        const artist = ctx.byId.get(choice.id);
        assert.ok(artist && artist.c === 'umelci', choice.label);
        assert.ok(Math.abs(artist.f.born - 1452) <= 150, `${choice.label} je z jiné doby`);
    }
    assert.ok(core.checkAnswer('Leonardo', question) && core.checkAnswer('da Vinci', question) && !core.checkAnswer('Rafael Santi', question));
    assert.doesNotMatch(umeni.censor('author', 'Mona Lisa je obraz Leonarda da Vinciho z Louvru.', find('Mona Lisa'), ctx), /Leonard|Vinci/);
    // K soše sochaři
    const david = umeni.specialQuestion(find('David'), ctx, rngStartingWith(0.1));
    assert.equal(david.title, 'Kdo vytvořil tuto sochu?');
    assert.ok(david.choices.filter(choice => !choice.correct).every(choice => /sochař/u.test(ctx.byId.get(choice.id).ty)), david.choices.map(c => c.label).join(', '));
    // Dílo více autorů nebo s nejistým autorem otázku na autora nemá (Křest Krista – Verrocchio a Leonardo, Spící Venuše)
    for (const name of ['Křest Krista', 'Spící Venuše', 'Salvator Mundi']) assert.equal(umeni.specialQuestion(find(name), ctx, rngStartingWith(0.1)), null, name);
    // Nápovědy: dílo → autor → jeho další díla (bez hádaného díla)
    const hints = umeni.hints(find('Mona Lisa'), ctx, 'author');
    assert.deepEqual(hints.map(hint => hint.label), ['o díle', 'o autorovi', 'další díla']);
    assert.ok(hints[1].facts.some(fact => fact.label === 'Země' && fact.value === 'Itálie'));
    assert.ok(!/Mona Lisa/.test(hints[2].facts[0].value) && /Poslední večeře/.test(hints[2].facts[0].value));
    assert.ok(!umeni.facts(find('Mona Lisa'), ctx, 'author').some(fact => fact.label === 'Autor'));
    // Napsaný jiný umělec
    assert.deepEqual(umeni.findAnswer('author', 'Rafael Santi', find('Mona Lisa'), ctx), { topic: 'umeni', id: find('Rafael Santi').q });
});

test('umění: otázka na směr – jen jasný směr, přesná odpověď, zakryté směry v popisu', () => {
    const sunrise = find('Imprese, východ slunce');
    const question = umeni.specialQuestion(sunrise, ctx, rngStartingWith(0.4));
    assert.equal(question.type, 'style');
    assert.equal(question.answerLabel, 'impresionismus');
    assert.equal(question.choices.length, 4);
    assert.ok(question.choices.some(choice => choice.correct && choice.label === 'impresionismus'));
    assert.ok(core.checkAnswer('impresionismus', question) && core.checkAnswer('Impresionisticky', question));
    assert.ok(!core.checkAnswer('expresionismus', question), 'expresionismus není překlep impresionismu');
    assert.doesNotMatch(umeni.censor('style', 'Obraz dal jméno impresionismu, Monet byl impresionista, ne realista.', sunrise, ctx), /impresion|realist/i);
    // Osa u otázky na směr nesmí směr pojmenovat
    const timeline = core.buildTimeline(umeni.hints(sunrise, ctx, 'style')[1].spec, 360).anchors.map(anchor => anchor.label);
    assert.ok(!timeline.some(label => /impresionist/.test(label)), timeline.join(' / '));
    assert.ok(!umeni.facts(sunrise, ctx, 'style').some(fact => fact.label === 'Směr'));
    // Manet patří k realismu i impresionismu – u jeho obrazu by byly obhajitelné dvě odpovědi
    assert.equal(umeni.specialQuestion(find('Snídaně v trávě'), ctx, rngStartingWith(0.4)), null);
    // Postimpresionismus (Hvězdná noc) se od impresionismu neodliší – na směr se neptáme
    assert.equal(umeni.specialQuestion(find('Hvězdná noc'), ctx, rngStartingWith(0.4)), null);
    // Většinou otázka na název
    assert.equal(umeni.specialQuestion(sunrise, ctx, rngStartingWith(0.9)), null);
});

test('umění: psané odpovědi, nesprávné možnosti a okruhy', () => {
    assert.deepEqual(umeni.nameAliases(find('Vincent van Gogh'), ctx), ['van Gogh']);
    assert.deepEqual(umeni.nameAliases(find('Leonardo da Vinci'), ctx), ['da Vinci', 'Leonardo']);
    assert.deepEqual(umeni.nameAliases(find('Alfons Mucha'), ctx), ['Mucha']);
    // Manet a Monet se liší jedním písmenem – samotné příjmení se u nich nepřijímá
    assert.deepEqual(umeni.nameAliases(find('Claude Monet'), ctx), []);
    assert.deepEqual(umeni.nameAliases(find('Mona Lisa'), ctx), []);
    // K obrazu van Gogha jeho obrazy nebo postimpresionisté, k Leonardovi renesanční malíři
    const wrongOptions = (name) => [0, 1, 2].map(seed => core.buildItemChoices(find(name), data.items, core.createSeededRandom(`${name}${seed}`),
        other => umeni.similarity(find(name), other, ctx)).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id)));
    for (const options of wrongOptions('Hvězdná noc')) {
        assert.ok(options.every(other => other.f.by === 'Vincent van Gogh' || (other.f.mk || []).includes('postimpresionismus')), options.map(o => o.n).join(', '));
    }
    for (const options of wrongOptions('Leonardo da Vinci')) assert.ok(options.every(other => other.f.born < 1600), options.map(o => o.n).join(', '));
    for (const options of wrongOptions('Frida Kahlo')) assert.ok(options.every(other => other.sx === 'f'), options.map(o => o.n).join(', '));
    // Okruhy
    assert.ok(data.collections.length >= 8 && data.collections.length <= 20);
    assert.ok(inCollection('impresionismus').includes('Claude Monet') && inCollection('impresionismus').includes('Imprese, východ slunce'));
    assert.ok(inCollection('ceske-umeni').includes('Slovanská epopej') && !inCollection('ceske-umeni').includes('Mona Lisa'));
    assert.ok(inCollection('louvre').includes('Mona Lisa') && inCollection('renesance').includes('David'));
    assert.ok(inCollection('pravek-starovek').includes('Věstonická venuše'));
    assert.equal(umeni.subtitle(find('Mona Lisa'), ctx), 'Leonardo da Vinci · kolem 1503');
    assert.equal(umeni.subtitle(find('Alfons Mucha'), ctx), '1860–1939 · Česko');
});
