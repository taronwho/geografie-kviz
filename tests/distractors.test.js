// Nesprávné možnosti jsou co nejpodobnější správné odpovědi podle strukturovaných vlastností (země, jazyk jména, doba, typ):
// k japonskému režisérovi nejbližší kultury, k Čechovi Češi – a správná odpověď nesmí být jediná „typová“.
// Test běží na skutečných datech všech témat.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../quiz-core.js');
const P = require('./pipeline.js');

const choicesFor = (ctx, item, seed) => core.buildItemChoices(item, ctx.items, core.createSeededRandom(seed), other => ctx.topic.similarity(item, other, ctx), core.cultureLandsFor(ctx.topic, ctx))
    .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));

test('země osoby či díla se doplní z popisu a české stopy, když ji data nemají', () => {
    assert.deepEqual(core.landsOf({ d: 'česká rocková skupina', f: { from: 1990 } }), ['Česko']);
    assert.deepEqual(core.landsOf({ d: 'anglická rocková skupina', f: { from: 1962 } }), ['Spojené království']);
    assert.deepEqual(core.landsOf({ d: 'japonský filmový režisér', f: { born: 1910 } }), ['Japonsko']);
    assert.deepEqual(core.landsOf({ d: 'píseň Ivana Mládka', cz: 1, f: { year: 1977, by: 'Banjo Band' } }), ['Česko']);
    assert.deepEqual(core.landsOf({ d: 'americký savec', cz: 1, f: { lat: 'Canis' } }), [], 'druhy ani místa podle popisu nemají kulturu jmen');
    assert.deepEqual(core.landsOf({ f: { land: ['Spojené státy americké', 'Itálie'] } }), ['Spojené státy americké', 'Itálie']);
    // Historické státy na dnešní
    assert.deepEqual(core.landsOf({ f: { land: 'Papežský stát' } }), ['Itálie']);
    // Vzdálenost kultur: stát, skupina, oblast, sousední oblast, jiná
    assert.equal(core.cultureDistance('Itálie', 'Itálie'), 0);
    assert.equal(core.cultureDistance('Japonsko', 'Jižní Korea'), 1);
    assert.equal(core.cultureDistance('Japonsko', 'Indie'), 2);
    assert.equal(core.cultureDistance('Japonsko', 'Egypt'), 3);
    assert.equal(core.cultureDistance('Japonsko', 'Švédsko'), 4);
});

test('reálné příklady: japonský a italský režisér, indický chemik, česká píseň', () => {
    const film = P.loadContext('film');
    const find = (ctx, name) => ctx.items.find(item => item.n === name);
    const distance = (a, b) => core.cultureDistance(core.landOf(a), core.landOf(b));
    // Italský režisér: tři další Italové (v datech jsou čtyři)
    const fellini = find(film, 'Federico Fellini');
    for (let seed = 0; seed < 5; seed++) assert.deepEqual(choicesFor(film, fellini, `f${seed}`).map(other => core.landOf(other)), ['Itálie', 'Itálie', 'Itálie']);
    // Japonský režisér je v datech jediný: nejbližší kultury (Korea, Čína), ne Evropa
    const kurosawa = find(film, 'Akira Kurosawa');
    for (let seed = 0; seed < 5; seed++) {
        const wrong = choicesFor(film, kurosawa, `k${seed}`);
        assert.ok(wrong.every(other => distance(kurosawa, other) <= 1), wrong.map(other => `${other.n} (${core.landOf(other)})`).join(', '));
    }
    // Indický chemik je v datech jediný: aspoň asijské kultury, ne Evropané ani Američané
    const chemie = P.loadContext('chemie');
    const indian = chemie.items.find(item => item.c === 'chemici' && core.landOf(item) === 'Indie');
    assert.ok(indian);
    for (let seed = 0; seed < 5; seed++) {
        const wrong = choicesFor(chemie, indian, `i${seed}`);
        assert.ok(wrong.every(other => distance(indian, other) <= 2), wrong.map(other => `${other.n} (${core.landOf(other)})`).join(', '));
    }
    // Česká píseň: mezi možnostmi nejsou samé anglické písně
    const hudba = P.loadContext('hudba');
    const jozin = find(hudba, 'Jožin z bažin');
    for (let seed = 0; seed < 8; seed++) {
        const wrong = choicesFor(hudba, jozin, `j${seed}`);
        assert.ok(wrong.filter(other => core.landOf(other) === 'Česko').length >= 2, wrong.map(other => `${other.n} (${core.landOf(other)})`).join(', '));
    }
});

// Pro každé téma a kategorii s osobami či díly: aspoň polovina nesprávných možností ze stejné země (kde to data dovolují)
// a správná odpověď není jediná ze své země, pokud existují aspoň tři další položky téže země a stejného druhu a pohlaví
// (štítek u otázky: „tenista“, „malířka“ – jiný druh by byl poznat hned)
test('nesprávné možnosti ve skutečných datech: stejná země a doba, správná odpověď není jediná „typová“', () => {
    const report = [];
    for (const topicId of P.TOPIC_IDS) {
        const ctx = P.loadContext(topicId);
        for (const category of [...new Set(ctx.items.map(item => item.c))]) {
            const items = ctx.items.filter(item => item.c === category);
            const withLand = items.filter(item => core.landsOf(item).length && !(ctx.topic.culture && ctx.topic.culture(item, ctx) !== undefined));
            if (withLand.length < items.length * 0.5) continue;
            const step = Math.max(1, Math.floor(withLand.length / 40));
            let questions = 0;
            let same = 0;
            let lone = 0;
            let eraQuestions = 0;
            let eraNear = 0;
            for (const item of withLand.filter((_, index) => index % step === 0)) {
                const land = core.landOf(item);
                // Stejný druh (štítek u otázky) a pohlaví: jediná žena mezi muži by byla poznat hned, proto k ženě jen ženy
                const compatible = (other) => (!item.ty || other.ty === item.ty) && (item.sx === 'f') === (other.sx === 'f');
                const peers = items.filter(other => other.q !== item.q && core.landOf(other) === land && compatible(other));
                const near = items.filter(other => other.q !== item.q && other.f && other.f.y !== undefined && Math.abs(core.centuryOf(other.f.y) - core.centuryOf((item.f || {}).y)) <= 1 && compatible(other));
                for (let seed = 0; seed < 2; seed++) {
                    const wrong = choicesFor(ctx, item, `${item.q}${seed}`);
                    if (peers.length >= 3) {
                        questions++;
                        const count = wrong.filter(other => core.landOf(other) === land).length;
                        same += count;
                        if (count === 0) lone++;
                    }
                    if ((item.f || {}).y !== undefined && near.length >= 3) {
                        eraQuestions++;
                        eraNear += wrong.filter(other => other.f && other.f.y !== undefined && Math.abs(core.centuryOf(other.f.y) - core.centuryOf(item.f.y)) <= 1).length;
                    }
                }
            }
            if (questions >= 10) {
                const share = same / (questions * 3);
                report.push({ where: `${topicId}/${category}`, questions, share, lone: lone / questions, era: eraQuestions >= 10 ? eraNear / (eraQuestions * 3) : null });
            }
        }
    }
    assert.ok(report.length >= 15, `ověřeno jen ${report.length} kategorií`);
    for (const row of report) {
        assert.ok(row.share >= 0.8, `${row.where}: jen ${(row.share * 100).toFixed(0)} % možností ze stejné země`);
        assert.ok(row.lone <= 0.03, `${row.where}: správná odpověď je jediná ze své země v ${(row.lone * 100).toFixed(1)} % otázek`);
        if (row.era !== null) assert.ok(row.era >= 0.5, `${row.where}: jen ${(row.era * 100).toFixed(0)} % možností z podobné doby`);
    }
});

// Typ je u otázky vidět (štítek „tenista“, „fotbalista“): má přednost před zemí, země řadí až v rámci téhož typu
test('sport: k tenistovi tenisté, k Japonci Japonec nebo nejbližší kultura téhož sportu', () => {
    const sport = P.loadContext('sport');
    const kei = sport.items.find(item => item.n === 'Kei Nišikori');
    for (let seed = 0; seed < 5; seed++) assert.ok(choicesFor(sport, kei, `kei${seed}`).every(other => other.f.sport === 'tenis'));
});

test('možnosti ve všech tématech jsou čtyři různé názvy a správná je právě jedna', () => {
    for (const topicId of P.TOPIC_IDS) {
        const ctx = P.loadContext(topicId);
        for (const category of ctx.topic.categories) {
            const items = ctx.items.filter(item => item.c === category.key);
            for (const item of items.filter((_, index) => index % Math.max(1, Math.floor(items.length / 8)) === 0)) {
                const choices = core.buildItemChoices(item, ctx.items, core.createSeededRandom(item.q), other => ctx.topic.similarity(item, other, ctx), core.cultureLandsFor(ctx.topic, ctx));
                assert.equal(choices.length, 4, `${topicId}/${category.key}: ${item.n}`);
                assert.equal(choices.filter(choice => choice.correct).length, 1);
                assert.equal(new Set(choices.map(choice => core.normalizeAnswer(choice.label))).size, 4, `${item.n}: ${choices.map(c => c.label).join(', ')}`);
            }
        }
    }
});
