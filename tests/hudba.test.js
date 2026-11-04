// Testy tématu Hudba na skutečných datech (data/hudba.json): známé položky, okruhy, otázky na autora a na období
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const hudba = require('../topics/hudba.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hudba.json'), 'utf8'));
const ctx = { topic: hudba, items: data.items, collections: data.collections, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
// rng, který poprvé vrátí zadanou hodnotu (rozhodne o druhu otázky) a dál se chová jako semínko
const rngStartingWith = (first, seed = 'hudba') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const asLines = (facts) => facts.map(fact => `${fact.label}: ${fact.value}`);

test('hudba: známé položky, česká stopa a okruhy', () => {
    for (const name of ['Bedřich Smetana', 'Antonín Dvořák', 'Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Karel Gott', 'Marta Kubišová',
        'The Beatles', 'Queen', 'Olympic', 'Kabát', 'Má vlast', 'Prodaná nevěsta', 'Bohemian Rhapsody']) {
        assert.ok(find(name) && find(name).k === 1, `chybí známá položka ${name}`);
    }
    assert.equal(find('Bedřich Smetana').cz, 1);
    assert.equal(find('Wolfgang Amadeus Mozart').cz, undefined);
    assert.ok(inCollection('cesti-skladatele').includes('Leoš Janáček') && !inCollection('cesti-skladatele').includes('Wolfgang Amadeus Mozart'));
    assert.ok(inCollection('ceska-popularni').includes('Karel Gott') && inCollection('ceska-popularni').includes('Olympic'));
    assert.ok(!inCollection('ceska-popularni').includes('Ema Destinnová'), 'operní pěvkyně nepatří do populární hudby');
    assert.ok(inCollection('baroko').includes('Antonio Vivaldi') && !inCollection('baroko').includes('Wolfgang Amadeus Mozart'));
    assert.ok(inCollection('klasicismus').includes('Wolfgang Amadeus Mozart'));
    assert.ok(inCollection('opera').includes('Prodaná nevěsta'));
    assert.ok(inCollection('slavna-alba').includes('Abbey Road'));
    // Herci a dirigenti, které Wikidata vedou i jako hudebníky, v tématu nejsou
    assert.ok(!data.items.some(item => ['Keanu Reeves', 'Bill Clinton', 'Herbert von Karajan', 'Leonardo da Vinci'].includes(item.n)));
});

test('hudba: data bez rozporů – roky, jedinečná jména, hymny', () => {
    const thisYear = new Date().getFullYear();
    const names = new Set();
    for (const item of data.items) {
        const key = core.normalizeAnswer(item.n);
        assert.ok(!names.has(key), `dvakrát ${item.n}`);
        names.add(key);
        const f = item.f || {};
        if (f.born !== undefined && f.died !== undefined) assert.ok(f.died > f.born, `${item.n}: úmrtí před narozením`);
        for (const year of [f.born, f.died, f.from, f.year]) if (year !== undefined) assert.ok(year <= thisYear, `${item.n}: budoucí rok ${year}`);
        // Autor díla v datech je skutečně osoba nebo kapela
        if (f.byq) assert.ok(['skladatele', 'hudebnici', 'kapely'].includes(ctx.byId.get(f.byq).c), `${item.n}: autor`);
    }
    // Hymny jen česká, číslovaná díla jen pod známým názvem
    assert.deepEqual(data.items.filter(item => item.ty === 'hymna').map(item => item.n), ['Kde domov můj']);
    assert.ok(!data.items.some(item => item.c === 'dila' && /^Symfonie č\. \d+$/.test(item.n)));
});

test('hudba: otázka na autora díla', () => {
    const bride = find('Prodaná nevěsta');
    const question = hudba.specialQuestion(bride, ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'author');
    assert.equal(question.title, 'Kdo to složil?');
    assert.equal(question.answerLabel, 'Bedřich Smetana');
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(question.choices.every(choice => ctx.byId.get(choice.id).c === 'skladatele'), 'možnosti jsou skladatelé');
    // Psaná odpověď i příjmením, které nemá nikdo jiný
    assert.ok(core.checkAnswer('Smetana', question) && core.checkAnswer('Bedřich Smetana', question) && !core.checkAnswer('Dvořák', question));
    assert.deepEqual(hudba.findAnswer('author', 'Antonín Dvořák', bride, ctx), { topic: 'hudba', id: find('Antonín Dvořák').q });
    // Popis bez autora (i ve 2. pádě), název díla zůstane
    const text = hudba.censor('author', 'Prodaná nevěsta je komická opera Bedřicha Smetany.', bride, ctx);
    assert.doesNotMatch(text, /Smetan|Bedřich/);
    assert.match(text, /Prodaná nevěsta/);
    // Rusalku složil i Dargomyžskij – mezi možnostmi nesmí být
    const rusalka = find('Rusalka');
    for (let seed = 0; seed < 10; seed++) {
        const other = hudba.specialQuestion(rusalka, ctx, rngStartingWith(0.1, `rusalka${seed}`));
        assert.ok(other && !other.choices.some(choice => (rusalka.xa || []).includes(choice.id)));
    }
    // Album a píseň: „Čí je to…?“, možnosti jsou interpreti stejného druhu
    const album = hudba.specialQuestion(find('Abbey Road'), ctx, rngStartingWith(0.1));
    assert.equal(album.title, 'Čí je to album?');
    assert.ok(album.choices.every(choice => ctx.byId.get(choice.id).c === 'kapely'));
    assert.ok(core.checkAnswer('Beatles', album));
    // Latinský tvar jména se v popisu zakryje taky (opera Wolfganga Amadea Mozarta)
    assert.doesNotMatch(hudba.censor('author', 'Opera Wolfganga Amadea Mozarta.', find('Don Giovanni'), ctx), /Amade|Mozart|Wolfgang/);
    // Nápovědy: vznik, další díla autora, portrét – bez autora samotného
    const hints = hudba.hints(bride, ctx, 'author');
    assert.deepEqual(hints.map(step => step.label || step.kind), ['vznik díla', 'další díla', 'visual']);
    assert.ok(!JSON.stringify(hints[0].facts).includes('Smetana'));
    assert.equal(hudba.specialQuestion(bride, ctx, rngStartingWith(0.9)), null, 'jen u části otázek');
});

test('hudba: otázka na hudební období', () => {
    const bach = find('Johann Sebastian Bach');
    const question = hudba.specialQuestion(bach, ctx, rngStartingWith(0.1));
    assert.equal(question.type, 'period');
    assert.equal(question.answerLabel, 'baroko');
    assert.deepEqual(question.choices.map(choice => choice.label).sort(), ['baroko', 'klasicismus', 'renesance', 'romantismus'], 'nejbližší období');
    assert.ok(core.checkAnswer('barokní', question) && core.checkAnswer('Baroko', question) && !core.checkAnswer('klasicismus', question));
    // Z popisu zmizí období i letopočty
    assert.doesNotMatch(hudba.censor('period', 'Německý barokní skladatel (1685–1750), vrchol baroka.', bach, ctx), /barok|1685|1750/i);
    // Nápovědy: současníci, dílo, osa bez letopočtů, nakonec roky života
    const hints = hudba.hints(bach, ctx, 'period');
    assert.ok(hints[0].facts[0].value.split(', ').every(name => find(name).c === 'skladatele'));
    assert.equal(hints[2].spec.blind, true);
    assert.ok(!hudba.facts(bach, ctx, 'period').some(fact => /\d/.test(fact.value) || fact.label === 'Období'));
    // Beethoven stojí na přelomu klasicismu a romantismu – na období se u něj neptáme
    assert.equal(hudba.specialQuestion(find('Ludwig van Beethoven'), ctx, rngStartingWith(0.1)), null);
});

test('hudba: nápovědy, časová osa, psané odpovědi a podobné možnosti', () => {
    const smetana = find('Bedřich Smetana');
    // Časová osa neprozradí jméno (Smetanova Prodaná nevěsta)
    const anchors = core.buildTimeline(hudba.visual(smetana, ctx, 'name'), 360).anchors.map(anchor => anchor.label);
    assert.ok(anchors.length >= 1 && !anchors.some(label => /Smetan/.test(label)), anchors.join(' / '));
    // Otázka na jméno: fakta → osa → fotka → slavné dílo
    assert.deepEqual(hudba.hints(smetana, ctx, 'name').map(step => step.kind), ['facts', 'visual', 'photo', 'facts']);
    assert.ok(asLines(hudba.facts(smetana, ctx, 'result')).includes('Období: romantismus'));
    // Psané odpovědi: příjmení, název kapely bez „The“, známý název symfonie
    assert.ok(hudba.nameAliases(find('Wolfgang Amadeus Mozart'), ctx).includes('Mozart'));
    assert.ok(hudba.nameAliases(find('The Beatles'), ctx).includes('Beatles'));
    assert.ok(hudba.nameAliases(find('Symfonie „Z Nového světa“'), ctx).includes('Novosvětská'));
    // Nesprávné možnosti: k Smetanovi skladatelé, k české kapele hlavně české kapely
    const wrongOf = (name, seed) => core.buildItemChoices(find(name), data.items, core.createSeededRandom(seed), other => hudba.similarity(find(name), other, ctx))
        .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
    for (const seed of ['a', 'b', 'c']) {
        assert.ok(wrongOf('Olympic', seed).filter(other => other.cz === 1).length >= 2);
        assert.ok(wrongOf('Marta Kubišová', seed).every(other => other.sx === 'f'), 'ke zpěvačce zpěvačky');
    }
});
