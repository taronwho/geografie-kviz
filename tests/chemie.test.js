// Chemie: nositelé Nobelovy ceny za chemii (rok a za co) a kategorie Materiály a suroviny na skutečných datech (data/chemie.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/chemie.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chemie.json'), 'utf8'));
const ctx = { topic, items: data.items, collections: data.collections, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const byId = (qid) => ctx.byId.get(qid);
const inGroup = (id) => data.items.filter(item => (item.g || []).includes(id));
const nobelValue = (item) => (topic.facts(item, ctx, 'name').find(fact => fact.label === 'Nobelova cena') || {}).value;

test('chemie – Nobelova cena: všichni laureáti v Chemicích s rokem a zdůvodněním', () => {
    const laureates = data.items.filter(item => item.f && item.f.nobel === 1);
    assert.ok(laureates.length >= 200, `${laureates.length} laureátů`);
    assert.ok(laureates.every(item => item.c === 'chemici' && (item.g || []).includes('nobelova-cena-chemie')));
    // Dřív chyběli (bez fotky je vyřadilo pravidlo IMAGE_FROM): Wittig, Cram, Pedersen, Moore, Stein
    for (const qid of ['Q77171', 'Q135151', 'Q244998', 'Q110952', 'Q156492']) assert.equal((byId(qid) || {}).c, 'chemici', qid);
    for (const item of laureates) {
        const chemistry = (item.f.np || []).filter(([year]) => year === item.f.ny);
        assert.ok(Number.isInteger(item.f.ny) && item.f.ny >= 1901, `${item.n}: rok ceny`);
        assert.ok(chemistry.length && chemistry.every(([, why]) => why && why !== 'chemii'), `${item.n}: za co`);
    }
    assert.equal(nobelValue(find('Marie Curie-Skłodowská')), '1903 za fyziku; 1911 za objev radia a polonia');
    assert.equal(nobelValue(find('Jaroslav Heyrovský')), '1959 za objev a rozvoj polarografie');
    assert.equal(nobelValue(find('Frederick Sanger')), '1958 za určení struktury inzulinu; 1980 za určování pořadí bází v nukleových kyselinách');
    assert.equal(nobelValue(find('Linus Pauling')), '1954 za výzkum povahy chemické vazby; 1962 za mír');
    // Chemik s Nobelovou cenou za jiný obor ji má také, ale do okruhu laureátů za chemii nepatří
    const others = data.items.filter(item => item.c === 'chemici' && item.f.np && !item.f.nobel);
    assert.ok(others.length >= 20 && others.every(item => !(item.g || []).includes('nobelova-cena-chemie')));
    // Okruh laureátů se řadí podle roku ceny
    assert.deepEqual(data.collections.find(collection => collection.id === 'nobelova-cena-chemie').sort, { by: 'ny' });
    // Starší tvar dat (jen nobel: 1) má fakt „za chemii“
    assert.equal(nobelValue({ c: 'chemici', f: { born: 1900, nobel: 1 } }), 'za chemii');
});

test('chemie – Nobelova cena: zdůvodnění neprozradí laureáta (Grignardovo činidlo, Woodův kov…)', () => {
    const extra = core.genericWordsOf(ctx);
    const leaks = data.items.filter(item => item.c === 'chemici' && item.f.np).filter(item => {
        const answers = [item.n, core.displayName(item.t)];
        return core.factRevealsAnswer({ label: 'Nobelova cena', value: nobelValue(item) }, answers,
            { isGeneric: (word) => core.isGenericWord(word, extra), rootNames: core.specificWords(answers, extra) });
    }).map(item => `${item.n}: ${nobelValue(item)}`);
    assert.deepEqual(leaks, []);
});

test('chemie – Materiály a suroviny: kategorie, okruhy, úrovně a přesunuté položky', () => {
    const keys = topic.categories.map(category => category.key);
    assert.deepEqual(keys, ['prvky', 'latky', 'reakce', 'pojmy', 'chemici', 'materialy'], 'nová kategorie na konci, stávající klíče zůstaly');
    const materials = data.items.filter(item => item.c === 'materialy');
    assert.ok(materials.length >= 150, `${materials.length} materiálů`);
    assert.ok(materials.filter(item => item.k === 1).length >= 60, 'známé materiály');
    assert.ok(materials.filter(item => item.im).length / materials.length >= 0.85, 'fotky');
    for (const id of ['kovy-slitiny', 'plasty-pryz', 'kompozity', 'sklo-keramika', 'stavebni-hmoty', 'paliva', 'papir-vlakna', 'barvy-lepidla', 'vybusniny', 'cistidla-hnojiva']) {
        assert.ok(inGroup(id).length >= 6 && inGroup(id).every(item => item.c === 'materialy'), id);
    }
    // Každý materiál má aspoň dva fakty (z nich jsou nápovědy a Tajemná otázka)
    const poor = materials.filter(item => topic.facts(item, ctx, 'result').length < 2 && !['Lepidlo', 'Pigment', 'Vosk', 'Slitina'].includes(item.n)).map(item => item.n);
    assert.deepEqual(poor, []);
    // Přesunuté z Pojmů a metod: stejné ID, stejná úroveň, okruh Slitiny, směsi a materiály zůstal
    for (const [qid, k, x] of [['Q11427', 1], ['Q11469', 1], ['Q22656', 1], ['Q146368', 1], ['Q811360', 0, 1], ['Q1127242', 0, 1], ['Q243558', 0]]) {
        const item = byId(qid);
        assert.equal(item.c, 'materialy', qid);
        assert.equal(item.k, k, `${item.n}: k`);
        assert.equal(item.x, x, `${item.n}: x`);
    }
    assert.ok(find('Ocel').g.includes('slitiny-smesi') && find('Ocel').g.includes('kovy-slitiny'));
    // Nerosty a horniny jsou Geologie, sloučeniny se vzorcem Sloučeniny a látky
    for (const name of ['Kaolin', 'Jíl', 'Grafit', 'Mramor', 'Antracit', 'Hnědé uhlí']) assert.ok(!materials.some(item => item.n === name), name);
    assert.equal(find('Nitroglycerin').c, 'latky');
});

test('chemie – Materiály: další názvy, nápovědy od okruhu po fotku, fakta bez prozrazení', () => {
    const teflon = find('Teflon');
    assert.deepEqual(topic.nameAliases(teflon, ctx), ['Polytetrafluorethylen', 'PTFE']);
    assert.equal(topic.nameAliases(find('Korozivzdorná ocel'), ctx)[0], 'Nerezová ocel');
    const hints = topic.hints(find('Bronz'), ctx, 'name');
    assert.deepEqual(hints.map(hint => hint.kind === 'photo' ? 'fotka' : hint.label), ['okruh', 'složení', 'využití', 'fotka']);
    assert.deepEqual(hints[1].facts, [{ label: 'Složení', value: 'měď, cín' }]);
    assert.equal(topic.facts(find('Kevlar'), ctx, 'result').find(fact => fact.label === 'Vynálezkyně').value, 'Stephanie Kwolek');
    assert.equal(topic.facts(find('Kordit'), ctx, 'result').find(fact => fact.label === 'Vynálezci').value, 'Frederick Abel a James Dewar');
    // Popis zakryje i další název (polytetrafluorethylen u teflonu)
    const censored = topic.censor('name', 'Polytetrafluorethylen (PTFE, teflon) je fluorovaný polymer.', teflon, ctx);
    assert.equal(censored, null, 'zakrývá jádro s nameAliases');
    // Fotky s napsanou odpovědí (SEMTEX-H, PLASTILINA, štítek KEVLAR) se nepoužijí; dynamit má fotku bez nápisu
    for (const name of ['Semtex', 'Plastelína', 'Kevlar', 'Konstantan', 'Kalafuna']) assert.equal(find(name).im, undefined, name);
    assert.equal(find('Dynamit').im, 'Inserting dynamite into hole.jpg');
    assert.notEqual(find('Pryskyřice').im, find('Epoxidová pryskyřice').im);
});

test('chemie – Materiály: nadřazený pojem a jeho druh nejsou spolu mezi možnostmi', () => {
    const materials = data.items.filter(item => item.c === 'materialy');
    const pairs = [];
    for (const item of materials) {
        for (let seed = 0; seed < 8; seed++) {
            const choices = core.buildItemChoices(item, data.items, core.createSeededRandom(`${item.q}|${seed}`), other => topic.similarity(item, other, ctx));
            assert.equal(choices.length, 4);
            const names = choices.filter(choice => !choice.correct).map(choice => choice.label);
            for (const name of names) {
                const a = core.normalizeAnswer(item.n);
                const b = core.normalizeAnswer(name);
                if (a.endsWith(b) || b.endsWith(a)) pairs.push(`${item.n} – ${name}`);
            }
            // K PET ani k bronzu nikdy obecný plast či slitina
            if (['PET', 'Polyvinylchlorid', 'Teflon'].includes(item.n)) assert.ok(!names.includes('Plast'), `${item.n}: ${names}`);
            if (['Bronz', 'Mosaz', 'Dural'].includes(item.n)) assert.ok(!names.includes('Slitina'), `${item.n}: ${names}`);
            if (item.n === 'Zvonovina') assert.ok(!names.includes('Bronz'), names.join(', '));
        }
    }
    assert.deepEqual([...new Set(pairs)], []);
    // Obecný materiál dostane obecné materiály z jiných okruhů
    const steel = core.buildItemChoices(find('Ocel'), data.items, core.createSeededRandom('ocel'), other => topic.similarity(find('Ocel'), other, ctx));
    assert.ok(steel.filter(choice => !choice.correct).every(choice => ['Sklo', 'Plast', 'Keramika', 'Beton', 'Dřevo', 'Papír', 'Slitina', 'Litina', 'Bronz', 'Kaučuk',
        'Kompozitní materiál', 'Polyestery', 'Pryskyřice', 'Pigment', 'Lepidlo', 'Vosk', 'Detergent', 'Hnojivo'].includes(choice.label)), steel.map(choice => choice.label).join(', '));
});
