// Časové souvislosti – kvalita: známost položek (pole obscure v data/souvislosti.json, scripts/lib/souvislosti-fame.mjs: Klaus Ebner,
// Černý leden a stanice Grimeton mezi známé nepatří), obor osobnosti z popisu (Henry Scott Tuke malíř a fotograf) a panel otázky
// bez osobnosti, který se na telefonu 360 × 640 vejde bez posouvání (obrázky 2 × 2, autoři a obory v možnostech).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const Time = require('../time-questions.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const seeded = (text) => core.createSeededRandom(text);
const contextOf = (topicId) => {
    const topic = require(`../topics/${topicId}.js`);
    const items = read(`data/${topicId}.json`).items;
    return { topic, items, byId: new Map(items.map(item => [item.q, item])), textPhotos: new Set() };
};

test('známost: položky k = 1, které Češi skoro neznají (Klaus Ebner, Černý leden, Grimeton), se mezi známé neberou; Kvíz dne do FAME_FROM jako dřív', () => {
    const index = read('data/souvislosti.json');
    const obscure = new Set(index.obscure);
    const all = [...index.people, ...index.dated];
    const qOf = (name) => (all.find(entry => entry.n === name) || {}).q;
    for (const name of ['Klaus Ebner', 'Černý leden', 'Rádiová stanice Grimeton']) assert.ok(obscure.has(qOf(name)), name);
    for (const name of ['Isaac Newton', 'Jan Otčenášek', 'Bitva u Lipan', 'Wolfgang Amadeus Mozart', 'Franz Kafka']) assert.ok(qOf(name) && !obscure.has(qOf(name)), name);
    // Otázek zůstane dost: slavných je skoro 90 % osob a přes 90 % věcí
    const famous = (list) => list.filter(entry => !obscure.has(entry.q)).length / list.length;
    assert.ok(famous(index.people) > 0.88 && famous(index.dated) > 0.9, `${famous(index.people)} ${famous(index.dated)}`);
    assert.ok(obscure.size > 100 && obscure.size < 600, `${obscure.size} bez slávy`);
    Time.setIndex(index);
    const ctx = contextOf('literatura');
    const data = Time.entriesFor(ctx);
    assert.ok(data.byId.get(qOf('Klaus Ebner')).o, 'Klaus Ebner má příznak o');
    const known = ctx.items.filter(item => item.k === 1);
    let checked = 0;
    for (let i = 0; i < 150; i++) {
        const planned = Time.plan({ ctx, item: known[i % known.length], pool: known, rng: seeded(`slava:${i}`), force: true });
        const round = planned && Time.buildRound(planned, ctx);
        if (!round) continue;
        checked++;
        for (const id of Time.idsOf(round)) assert.ok(!data.byId.get(id).o, `${data.byId.get(id).n} mezi známými`);
    }
    assert.ok(checked > 100, `${checked} otázek`);
    // Hraní i méně známých (úroveň Mudrlant): položka hraného tématu bez slávy smí být, z ostatních témat ne
    for (let i = 0; i < 60; i++) {
        const planned = Time.plan({ ctx, item: ctx.items[i * 7], pool: ctx.items, rng: seeded(`vse:${i}`), force: true });
        const round = planned && Time.buildRound(planned, ctx);
        if (round) for (const id of Time.idsOf(round)) assert.ok(!(data.byId.get(id).o && data.byId.get(id).tp !== 'literatura'), data.byId.get(id).n);
    }
    // Kvíz dne dřívějších dnů (už hrané) vybírá jako dřív, od FAME_FROM jen slavné
    assert.ok(Time.FAME_FROM > Time.QUIZ_FROM);
    let fresh = 0;
    for (let i = 0; i < 20; i++) {
        const planned = Time.quizPlan(`mudrlant-kviz-dne-${Time.FAME_FROM}:otazka:${i}`, ctx, known[i]);
        const round = planned && Time.buildRound(planned, ctx);
        if (!round) continue;
        fresh++;
        for (const id of Time.idsOf(round)) assert.ok(!data.byId.get(id).o, data.byId.get(id).n);
    }
    assert.ok(fresh > 10);
});

test('obor osobnosti z popisu, když je obor kategorie zavádějící (Henry Scott Tuke malíř a fotograf, Vangelis skladatel, Kepler astronom)', () => {
    const facts = (topicId, name) => Time.timeFacts(read(`data/${topicId}.json`).items.find(item => item.n === name), topicId);
    assert.equal(facts('umeni', 'Henry Scott Tuke').ty, 'malíř a fotograf');
    assert.equal(facts('hudba', 'Vangelis').ty, 'skladatel');
    assert.equal(facts('fyzika', 'Johannes Kepler').ty, 'astronom');
    // Obor, který popis potvrzuje jako první, zůstane
    assert.equal(facts('fyzika', 'Albert Einstein').ty, 'fyzik');
    assert.equal(facts('hudba', 'Karel Gott').ty, 'zpěvák');
    assert.equal(read('data/souvislosti.json').people.find(entry => entry.n === 'Johannes Kepler').ty, 'astronom');
});

test('panel otázky bez osobnosti: bez posouvání uvnitř (obrázky 2 × 2 na výšku panelu), autoři a obory v možnostech', () => {
    const row = (name, photo) => ({ id: name, name, detail: 'x', photo, from: 1900, to: 1950, correct: false });
    const html = Time.leadHtml({ time: { type: 'order', kind: 'film', rows: [row('A', 'https://upload.wikimedia.org/a.jpg'), row('B', 'https://upload.wikimedia.org/b.jpg'), row('C', null), row('D', 'https://upload.wikimedia.org/d.jpg')] } });
    assert.ok(!/overflow-y-auto/.test(html), 'panel se neposouvá');
    assert.match(html, /grid h-full grid-cols-2 grid-rows-2/);
    assert.equal((html.match(/<li /g) || []).length, 4);
    assert.ok(!/style=/.test(html), 'bez inline stylů (CSP)');
    // Bez obrázků (filmy): jen věta, co se porovnává a co ukáže nápověda
    const plain = Time.leadHtml({ time: { type: 'order', kind: 'film', rows: ['A', 'B', 'C', 'D'].map(name => row(name, null)) } });
    assert.match(plain, /podle roku premiéry\. Roky dvou z nich ukáže nápověda\./);
    assert.ok(!/overflow-y-auto/.test(plain));
    const born = Time.leadHtml({ time: { type: 'born', rows: ['A', 'B', 'C', 'D'].map(name => row(name, null)) } });
    assert.match(born, /podle roku narození/);
    // Skutečná data: u otázky bez osobnosti mají možnosti krátký popis (režisér, autor, obor a země)
    Time.setIndex(read('data/souvislosti.json'));
    const ctx = contextOf('film');
    const known = ctx.items.filter(item => item.k === 1 && item.c === 'filmy');
    let withDetail = 0, total = 0;
    for (let i = 0; i < 40; i++) {
        const planned = Time.plan({ ctx, item: known[i], pool: known, rng: seeded(`panel:${i}`), force: 'order' });
        const round = planned && Time.buildRound(planned, ctx);
        if (!round) continue;
        total++;
        if (round.question.choices.every(choice => choice.detail)) withDetail++;
        for (const choice of round.question.choices) assert.ok(!choice.detail || choice.detail.length <= 26, choice.detail);
    }
    assert.ok(total > 20 && withDetail / total > 0.8, `${withDetail}/${total}`);
});
