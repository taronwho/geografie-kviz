// Testy tématu Mytologie na skutečných datech (data/mytologie.json): známé položky, okruhy, otázky na protějšek a na mytologii
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const mytologie = require('../topics/mytologie.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mytologie.json'), 'utf8'));
const ctx = { topic: mytologie, items: data.items, collections: data.collections, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
// rng, který poprvé vrátí zadanou hodnotu (rozhodne o druhu otázky) a dál se chová jako semínko
const rngStartingWith = (first, seed = 'mytologie') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};

test('mytologie: známé položky, kategorie, česká stopa a okruhy', () => {
    const expected = {
        recka: ['Zeus', 'Héra', 'Athéna', 'Hermés', 'Apollón', 'Afrodíté', 'Jupiter', 'Venuše', 'Mars', 'Héraklés', 'Achilles', 'Odysseus', 'Prométheus'],
        egyptska: ['Ra', 'Isis', 'Osiris', 'Anubis', 'Horus'],
        severska: ['Thór', 'Ódin', 'Loki', 'Freya'],
        slovanska: ['Perun', 'Veles', 'Mokoš', 'Libuše', 'Přemysl Oráč', 'Krok', 'Bivoj', 'Horymír', 'Praotec Čech', 'Golem'],
        bytosti: ['Kentaur', 'Mínótauros', 'Pegas', 'Kerberos', 'Fénix', 'Vodník', 'Rusalka', 'Drak']
    };
    for (const [category, names] of Object.entries(expected)) {
        for (const name of names) {
            const item = find(name);
            assert.ok(item, `chybí ${name}`);
            assert.equal(item.c, category, `${name}: kategorie`);
        }
    }
    for (const name of ['Zeus', 'Hermés', 'Libuše', 'Perun', 'Vodník', 'Isis', 'Thór', 'Pegas']) assert.equal(find(name).k, 1, `${name} je známý`);
    // Bájná knížata z výčtu Přemyslovců zná málokdo
    assert.equal(find('Mnata').k, 0);
    assert.equal(find('Libuše').cz, 1);
    assert.equal(find('Vodník').cz, 1);
    assert.ok(!find('Zeus').cz);
    assert.deepEqual(inCollection('olympsti-bohove').sort(), ['Afrodíté', 'Apollón', 'Arés', 'Artemis', 'Athéna', 'Démétér', 'Dionýsos', 'Hádés', 'Héfaistos', 'Hermés', 'Hestia', 'Héra', 'Poseidón', 'Zeus'].sort());
    assert.ok(inCollection('ceske-povesti').includes('Bivoj') && !inCollection('ceske-povesti').includes('Perun'));
    assert.ok(inCollection('slovansti-bohove').includes('Perun') && !inCollection('slovansti-bohove').includes('Libuše'));
    assert.ok(inCollection('egyptsti-bohove').includes('Anubis'));
    assert.ok(inCollection('recti-hrdinove').includes('Héraklés') && inCollection('trojska-valka').includes('Hektór'));
    assert.ok(inCollection('recke-bytosti').includes('Pegas') && inCollection('slovanske-bytosti').includes('Vodník'));
    assert.ok(data.collections.length >= 8 && data.collections.length <= 20);
    // Egyptští bohové pod známými jmény, Usir a Eset jako další psané odpovědi
    assert.ok(find('Osiris').al.includes('Usir') && find('Isis').al.includes('Eset'));
    // Šárka má na Wikipedii jen článek o jménu – v tématu není; ani místa a předměty
    assert.ok(!data.items.some(item => ['Šárka', 'Yggdrasil', 'Midgard', 'Mjöllnir', 'Lucifer', 'Romulus a Remus'].includes(item.n)));
});

test('mytologie: data bez rozporů – jedinečná jména a další názvy, opravené pohlaví', () => {
    const names = new Map();
    for (const item of data.items) {
        const key = core.normalizeAnswer(item.n);
        assert.ok(!names.has(key), `dvakrát ${item.n}`);
        names.set(key, item);
        assert.ok(item.t, `${item.n}: bez článku`);
    }
    // Další název nesmí být jménem jiné položky
    for (const item of data.items) {
        for (const alias of item.al || []) {
            const other = names.get(core.normalizeAnswer(alias));
            assert.ok(!other || other === item, `${item.n}: další název ${alias} patří ${other && other.n}`);
        }
    }
    assert.equal(find('Šu').ty, 'bůh');
    assert.notEqual(find('Šu').sx, 'f');
    // Rodiče jen jednoznační: u Dionýsa víc verzí matky
    assert.equal(find('Dionýsos').f.fa, 'Zeus');
    assert.equal(find('Dionýsos').f.mo, undefined);
    // Achillova „manželka“ Helena z pozdní báje se neuvádí
    assert.equal(find('Achilles').f.sp, undefined);
});

test('mytologie: otázka na protějšek – Zeus a Jupiter, Apollón bez protějšku', () => {
    const zeus = find('Zeus');
    const question = mytologie.specialQuestion(zeus, ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'counterpart');
    assert.equal(question.title, 'Jak se jmenuje v římské mytologii?');
    assert.equal(question.answerLabel, 'Jupiter');
    assert.equal(question.showName, true);
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.equal(new Set(question.choices.map(choice => choice.label)).size, 4);
    assert.ok(core.checkAnswer('Jupiter', question) && !core.checkAnswer('Neptun', question));
    // Naopak: z římského jména řecké, k bohyni bohyně
    const venus = mytologie.specialQuestion(find('Venuše'), ctx, rngStartingWith(0.1));
    assert.equal(venus.title, 'Jak se jmenuje v řecké mytologii?');
    assert.equal(venus.answerLabel, 'Afrodíté');
    assert.ok(venus.choices.every(choice => ['Afrodíté', 'Héra', 'Athéna', 'Artemis', 'Hestia', 'Démétér', 'Persefona'].includes(choice.label)));
    // Všechny klasické dvojice
    for (const [greek, roman] of [['Héra', 'Juno'], ['Poseidón', 'Neptun'], ['Athéna', 'Minerva'], ['Arés', 'Mars'], ['Hermés', 'Merkur'],
        ['Artemis', 'Diana'], ['Héfaistos', 'Vulkán'], ['Hestia', 'Vesta'], ['Démétér', 'Ceres'], ['Dionýsos', 'Bakchus'], ['Hádés', 'Pluto'],
        ['Erós', 'Amor'], ['Kronos', 'Saturn']]) {
        assert.equal(find(greek).f.cp, roman, `${greek} – ${roman}`);
        assert.equal(find(roman).f.cp, greek, `${roman} – ${greek}`);
    }
    assert.equal(find('Apollón').f.cp, undefined);
    assert.equal(mytologie.specialQuestion(find('Apollón'), ctx, rngStartingWith(0.1)), null);
    // Protějšek z popisu zmizí, jméno zůstane
    assert.equal(mytologie.censor('counterpart', 'Zeus, u Římanů Jupiter.', zeus, ctx), 'Zeus, u Římanů [***].');
    // Nápovědy: oblast, rodina pod římskými jmény, první písmeno
    const hints = mytologie.hints(zeus, ctx, 'counterpart');
    assert.deepEqual(hints.map(step => step.label), ['oblast a symboly', 'rodina v římské mytologii', 'první písmeno']);
    assert.deepEqual(hints[1].facts[0], { label: 'Rodiče', value: 'Saturn a Ops' });
    assert.equal(hints[2].facts[0].value, 'J…');
    // Hráč napsal jiného římského boha
    assert.deepEqual(mytologie.findAnswer('counterpart', 'Neptun', zeus, ctx), { topic: 'mytologie', id: find('Neptun').q });
});

test('mytologie: otázka „Ze které mytologie je?“ jen u postav jediné mytologie', () => {
    const thor = mytologie.specialQuestion(find('Thór'), ctx, rngStartingWith(0.9));
    assert.equal(thor.type, 'myth');
    assert.equal(thor.answerLabel, 'severská');
    assert.ok(core.checkAnswer('severská', thor) && core.checkAnswer('nordická', thor) && !core.checkAnswer('řecká', thor));
    assert.equal(thor.choices.filter(choice => choice.correct).length, 1);
    // U Dia je záludnou možností římská, u řeckého hrdiny bez protějšku římská není (Římané báje převzali)
    assert.ok(mytologie.specialQuestion(find('Zeus'), ctx, rngStartingWith(0.9)).choices.some(choice => choice.label === 'římská'));
    for (let seed = 0; seed < 6; seed++) {
        const achilles = mytologie.specialQuestion(find('Achilles'), ctx, rngStartingWith(0.9, `achilles${seed}`));
        assert.ok(!achilles.choices.some(choice => choice.label === 'římská'));
    }
    // Postavy dvou mytologií, české pověsti a bytosti celé Evropy se na mytologii neptají
    for (const name of ['Apollón', 'Libuše', 'Drak', 'Sfinx', 'Golem', 'Ježibaba']) {
        assert.equal(mytologie.specialQuestion(find(name), ctx, rngStartingWith(0.9)), null, name);
    }
    // Popis bez prozrazující mytologie
    assert.doesNotMatch(mytologie.censor('myth', 'Severský bůh hromu z Ásgardu, syn Ódina.', find('Thór'), ctx), /Severs|Ásgard/);
    assert.doesNotMatch(mytologie.censor('myth', 'Bůh řecké mytologie, jeden z olympských bohů.', find('Zeus'), ctx), /řeck|olymp/i);
    assert.match(mytologie.censor('myth', 'Bůh řeky Nil.', find('Hapi'), ctx), /řeky/);
    // Nápověda s fotkou je až poslední – obraz (egyptské malby) mytologii prozradí nejvíc
    assert.ok(['photo', 'visual'].includes(mytologie.hints(find('Thór'), ctx, 'myth').pop().kind));
    assert.equal(mytologie.specialQuestion(find('Thór'), ctx, rngStartingWith(0.5)), null);
});

test('mytologie: otázka na jméno – zakrytí, nápovědy, možnosti a psané odpovědi', () => {
    const zeus = find('Zeus');
    const text = mytologie.censor('name', 'Zeus je nejvyšší bůh. Diovi zasvětili Olympii, Římané ho nazývali Jupiter.', zeus, ctx);
    assert.doesNotMatch(text, /Zeus|Dio|Jupiter/);
    assert.doesNotMatch(mytologie.censor('name', 'Ra (také Re) byl bůh slunce.', find('Ra'), ctx), /\bRa\b|\bRe\b/);
    assert.doesNotMatch(mytologie.censor('name', 'Odysseus, syn Laerta. Odyssea čekala Pénelopé.', find('Odysseus'), ctx), /Odysse/);
    assert.deepEqual(mytologie.hints(zeus, ctx, 'name').map(step => step.label || step.kind), ['facts', 'photo', 'oblast a symboly', 'rodina', 'protějšek']);
    assert.ok(mytologie.facts(zeus, ctx, 'result').some(fact => fact.label === 'Protějšek v římské mytologii' && fact.value === 'Jupiter'));
    // Psané odpovědi: egyptologické tvary, počeštěné latinské
    const accepted = (name) => core.nameAnswers(find(name), mytologie.nameAliases(find(name), ctx));
    assert.ok(core.isAnswerMatch('Usir', accepted('Osiris')));
    assert.ok(core.isAnswerMatch('Venus', accepted('Venuše')));
    assert.ok(core.isAnswerMatch('Minotaurus', accepted('Mínótauros')));
    assert.ok(core.isAnswerMatch('Přemysl', accepted('Přemysl Oráč')));
    // Nesprávné možnosti: k bohyni bohyně, protějšek ani splývající bytost nikdy
    const wrongOf = (name, seed) => core.buildItemChoices(find(name), data.items, core.createSeededRandom(seed), other => mytologie.similarity(find(name), other, ctx))
        .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
    for (let seed = 0; seed < 30; seed++) {
        assert.ok(wrongOf('Afrodíté', `a${seed}`).every(other => other.sx === 'f' && other.n !== 'Venuše'));
        assert.ok(!wrongOf('Medúsa', `m${seed}`).some(other => other.n === 'Gorgony'));
        assert.ok(!wrongOf('Ježibaba', `j${seed}`).some(other => other.n === 'Baba Jaga'));
        assert.ok(!wrongOf('Satyr', `s${seed}`).some(other => other.n === 'Faun'));
    }
    for (const seed of ['a', 'b', 'c']) {
        assert.ok(wrongOf('Libuše', seed).every(other => other.cz === 1), 'k Libuši postavy českých pověstí');
        assert.ok(wrongOf('Thór', seed).every(other => other.f.my === 'severská'));
    }
    assert.equal(mytologie.subtitle(find('Libuše'), ctx), 'České pověsti');
    assert.equal(mytologie.subtitle(find('Thór'), ctx), 'Severská mytologie');
    assert.equal(mytologie.isCzech(find('Bivoj')), true);
});
