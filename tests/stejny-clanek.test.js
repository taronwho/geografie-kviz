// Dvě možnosti, na které sedí stejný popis („Takové věci se nesmí nikdy stát“): u otázky „Která částice to je?“ byly Boson W,
// Graviton, Gluon a Boson Z, správně Boson Z, a popis „Bosony W a Z jsou elementární částice, které zprostředkovávají slabou
// interakci…“ – oba bosony mají na Wikipedii společný článek, takže byly správné dvě. Hlídá: pole w (článek po přesměrování,
// scripts/build-clanky.mjs), quiz-core sameArticle (stejný článek, společný článek „X a Y“), výběr možností hlavní hry
// (buildItemChoices), náhradu nesprávné možnosti, jejíž jméno je v popisu nezakryté (replaceConflicts, app.js createRoundData)
// a Dobývání (conquest.js nearDuplicate, app.js conquestRound vrátí null).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const C = require('../conquest.js');

const ROOT = path.join(__dirname, '..');
const TOPICS = ['architektura', 'biologie', 'chemie', 'film', 'fyzika', 'geologie', 'historie', 'hudba', 'literatura', 'mytologie', 'sport', 'umeni', 'vlajky', 'zemepis'];
const read = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8'));
const fyzika = read('fyzika');
const byName = (data, name) => data.items.find(item => item.n === name);
const W_Z_TEXT = 'Bosony W a Z jsou elementární částice, které zprostředkovávají slabou interakci. Objevily se v roce 1983 v CERN.';

test('data: Boson W a Boson Z mají společný článek „Boson W a Z“ (pole w), přesměrování jen tam, kde se článek liší', () => {
    const w = byName(fyzika, 'Boson W');
    const z = byName(fyzika, 'Boson Z');
    assert.equal(w.w, 'Boson W a Z');
    assert.equal(z.w, 'Boson W a Z');
    assert.ok(core.sameArticle(w, z));
    let total = 0;
    for (const id of TOPICS) for (const item of read(id).items) {
        if (!item.w) continue;
        total++;
        assert.notEqual(item.w, item.t, `${id}: ${item.n}`);
        const keys = Object.keys(item);
        assert.equal(keys[keys.indexOf('t') + 1], 'w', `${id}: ${item.n} – w hned za t`);
    }
    assert.ok(total >= 50 && total <= 400, `${total} přesměrování`);
});

test('sameArticle: stejný článek i po přesměrování, společný článek „X a Y“, ne podobný název ani jiné upřesnění', () => {
    const item = (n, t, w) => ({ q: n, n, t, ...(w ? { w } : {}) });
    assert.ok(core.sameArticle(item('Boson W', 'Boson W', 'Boson W a Z'), item('Boson Z', 'Boson Z', 'Boson W a Z')));
    assert.ok(core.sameArticle(item('Romulus a Remus', 'Romulus a Remus'), item('Remus', 'Remus')));
    assert.ok(core.sameArticle(item('Remus', 'Remus'), item('Romulus a Remus', 'Romulus a Remus')), 'v obou směrech');
    assert.ok(core.sameArticle(item('Dudley Dursley', 'Dudley Dursley', 'Dursleyovi'), item('Vernon Dursley', 'Vernon Dursley', 'Dursleyovi')));
    assert.ok(!core.sameArticle(item('Katedrála Notre-Dame', 'Katedrála Notre-Dame (Paříž)'), item('Katedrála Notre-Dame', 'Katedrála Notre-Dame (Chartres)')), 'jiné upřesnění');
    assert.ok(!core.sameArticle(item('Miltiades', 'Miltiades'), item('Miltiadés', 'Miltiadés')), 'jiná diakritika');
    assert.ok(!core.sameArticle(item('Grenada', 'Grenada'), item('Svatý Vincenc a Grenadiny', 'Svatý Vincenc a Grenadiny')), 'podobné slovo není celá část názvu');
    const same = { q: 'Q1', n: 'X', t: 'X' };
    assert.ok(!core.sameArticle(same, same), 'položka sama se sebou ne');
});

test('jméno v textu: i skloněné (Bosony W ~ Boson W, gluony ~ Gluon), krátká slova jen celá, zakrytá místa se nepočítají', () => {
    assert.ok(core.namedIn(W_Z_TEXT, 'Boson W'));
    assert.ok(core.namedIn(W_Z_TEXT, 'Boson Z'));
    assert.ok(core.namedIn('Silnou interakci zprostředkovávají gluony.', 'Gluon'));
    assert.ok(!core.namedIn(W_Z_TEXT, 'Graviton'));
    assert.ok(!core.namedIn('[***] W a [***] jsou částice', 'Boson W'), 'zakryté slovo se nepočítá');
    assert.ok(!core.namedIn('Wolfram je kov', 'W'), 'krátké slovo jen celé');
});

test('hlavní hra: k Bosonu Z nikdy Boson W mezi možnostmi (a naopak), žádné dvě položky téhož článku v žádném tématu', () => {
    const topic = require('../topics/fyzika.js');
    const ctx = { topic, items: fyzika.items, byId: new Map(fyzika.items.map(item => [item.q, item])), countries: {} };
    for (const [answer, other] of [['Boson Z', 'Boson W'], ['Boson W', 'Boson Z']]) {
        const item = byName(fyzika, answer);
        for (let s = 0; s < 80; s++) {
            const choices = core.buildItemChoices(item, fyzika.items, core.createSeededRandom(`wz|${s}`), candidate => topic.similarity ? topic.similarity(item, candidate, ctx) : 0);
            assert.equal(choices.length, 4);
            assert.ok(!choices.some(choice => choice.label === other), `${answer}: ${choices.map(choice => choice.label).join(', ')}`);
        }
    }
    // Všechny skupiny položek téhož článku ve všech tématech: žádná dvojice mezi možnostmi jedné otázky
    let groups = 0;
    for (const id of TOPICS) {
        const data = read(id);
        const byCategory = new Map();
        data.items.forEach(item => { if (!byCategory.has(item.c)) byCategory.set(item.c, []); byCategory.get(item.c).push(item); });
        for (const item of data.items) {
            const mates = byCategory.get(item.c).filter(other => core.sameArticle(item, other));
            if (!mates.length) continue;
            groups++;
            for (let s = 0; s < 6; s++) {
                const choices = core.buildItemChoices(item, data.items, core.createSeededRandom(`clanek|${id}|${s}`));
                const chosen = choices.map(choice => data.items.find(other => other.q === choice.id));
                chosen.forEach((a, i) => chosen.forEach((b, j) => assert.ok(i === j || !core.sameArticle(a, b), `${id}: ${a.n} a ${b.n} mezi možnostmi`)));
            }
        }
    }
    assert.ok(groups >= 30, `${groups} položek se společným článkem`);
});

test('popis s nezakrytým jménem nesprávné možnosti: Boson W v „Bosony W a Z…“ se nahradí, Gluon zůstane', () => {
    const topic = require('../topics/fyzika.js');
    const ctx = { topic, items: fyzika.items, byId: new Map(fyzika.items.map(item => [item.q, item])), countries: {} };
    const z = byName(fyzika, 'Boson Z');
    const choice = (name, correct = false) => ({ id: byName(fyzika, name).q, label: name, correct });
    // Přesně otázka z hlášení
    const question = { type: 'name', title: 'Která částice to je?', choices: [choice('Boson W'), choice('Graviton'), choice('Gluon'), choice('Boson Z', true)] };
    assert.ok(core.choiceConflict(question.choices[0], { question, item: z, ctx, text: W_Z_TEXT }), 'Boson W: společný článek i jméno v popisu');
    assert.ok(!core.choiceConflict(question.choices[1], { question, item: z, ctx, text: W_Z_TEXT }));
    assert.ok(!core.choiceConflict(question.choices[3], { question, item: z, ctx, text: W_Z_TEXT }), 'správná odpověď se nehlídá');
    for (let s = 0; s < 20; s++) {
        const fixed = core.replaceConflicts({ question, item: z, ctx, text: W_Z_TEXT, rng: core.createSeededRandom(`nahrada|${s}`) });
        assert.ok(fixed && fixed.choices.length === 4);
        assert.deepEqual(fixed.choices.slice(1).map(c => c.label), ['Graviton', 'Gluon', 'Boson Z'], 'ostatní možnosti i pořadí zůstanou');
        assert.notEqual(fixed.choices[0].label, 'Boson W');
        assert.ok(fixed.choices.every(c => !core.choiceConflict(c, { question: fixed, item: z, ctx, text: W_Z_TEXT })), fixed.choices.map(c => c.label).join(', '));
        assert.equal(new Set(fixed.choices.map(c => c.label)).size, 4);
        assert.equal(fixed.choices.filter(c => c.correct).length, 1);
    }
    // Záložní krátký popis z Wikidat, který je přesně popisem nesprávné možnosti, sedí i na ni
    const graviton = byName(fyzika, 'Graviton');
    if (graviton.d) assert.ok(core.choiceConflict(question.choices[1], { question, item: z, ctx, text: `${graviton.d.charAt(0).toUpperCase()}${graviton.d.slice(1)}.` }));
});

test('aplikace: createRoundData nesprávnou možnost se jménem v popisu nahradí, Dobývání s pevnými možnostmi vezme jinou otázku', () => {
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(app, /choiceConflict\(choice, \{ question, item, ctx, text: seen \}\)/);
    assert.match(app, /options\.wrong \|\| attempt === 3 \? null : replaceConflicts\(\{ question, item, ctx, text: seen, rng \}\)/);
    assert.match(app, /if \(data\.choiceConflict && form !== 'photo'\) return null;/);
});

test('Dobývání: dvě položky téhož článku nejsou mezi možnostmi (nearDuplicate)', () => {
    const entry = (name, w) => ({ label: name, key: name, topic: 'fyzika', srcs: { fyzika: { q: name, n: name, t: name, w } } });
    const ctx = { pools: { placeStems: new Set() } };
    assert.ok(C.nearDuplicate(entry('Boson W', 'Boson W a Z'), entry('Boson Z', 'Boson W a Z'), 'physics', ctx));
    assert.ok(!C.nearDuplicate(entry('Boson W', 'Boson W a Z'), entry('Graviton'), 'physics', ctx));
});
