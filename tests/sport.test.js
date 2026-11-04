// Testy tématu Sport na skutečných datech (data/sport.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const sport = require('../topics/sport.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sport.json'), 'utf8'));
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const ctx = { topic: sport, items: data.items, collections: data.collections, countries };
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
// rng, které nejdřív vrátí first (rozhodne o druhu otázky), pak náhodná čísla se semínkem
const rngStarting = (first, seed = 'sport') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};

test('sport: známí sportovci, hry a sporty, česká stopa a čistá data', () => {
    for (const name of ['Jaromír Jágr', 'Dominik Hašek', 'Emil Zátopek', 'Věra Čáslavská', 'Martina Navrátilová', 'Petra Kvitová', 'Jan Železný',
        'Roman Šebrle', 'Ester Ledecká', 'Martina Sáblíková', 'Pavel Nedvěd', 'Petr Čech', 'Pelé', 'Lionel Messi', 'Roger Federer', 'Usain Bolt',
        'Michael Jordan', 'Wayne Gretzky', 'Letní olympijské hry 1952', 'Zimní olympijské hry 1998', 'Fotbal', 'Lední hokej', 'Hod oštěpem']) {
        assert.ok(find(name) && find(name).k === 1, `chybí známá položka ${name}`);
    }
    assert.equal(find('Jaromír Jágr').cz, 1);
    assert.equal(find('Pelé').cz, undefined);
    // Slavní hlavně něčím jiným, i když hráli sport, mezi sportovci nejsou
    for (const name of ['Albert Camus', 'Niels Bohr', 'Ivana Trumpová', 'Edvard Beneš', 'Henry Ford', 'Viktor Orbán', 'Sean Connery']) {
        assert.ok(!find(name), `${name} není sportovec`);
    }
    // Zrušené (1916, 1940, 1944) a budoucí hry chybí
    const years = data.items.filter(item => item.c === 'olympiady').map(item => `${item.f.type}${item.f.year}`);
    assert.ok(!years.some(key => /1916|1940|1944/.test(key)));
    assert.ok(data.items.filter(item => item.c === 'olympiady').every(item => item.f.year <= new Date().getFullYear()));
    // Data narození a úmrtí bez rozporů, jména jednou
    for (const item of data.items.filter(other => other.c === 'sportovci')) {
        assert.ok(item.f.born < new Date().getFullYear() - 10, item.n);
        if (item.f.died !== undefined) assert.ok(item.f.died > item.f.born, item.n);
        if (item.f.to !== undefined) assert.ok(item.f.to >= item.f.from, item.n);
    }
    assert.equal(new Set(data.items.map(item => item.n.toLowerCase())).size, data.items.length);
    // Velikost dat
    assert.ok(fs.statSync(path.join(ROOT, 'data', 'sport.json')).size < 1.5e6);
});

test('sport: ve kterém sportu se proslavil – jediný sport, zakrytý popis, psaný sport', () => {
    const jagr = find('Jaromír Jágr');
    const question = sport.specialQuestion(jagr, ctx, rngStarting(0.1));
    assert.equal(question.type, 'sport');
    assert.equal(question.title, 'Ve kterém sportu se proslavil?');
    assert.ok(question.showName);
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.equal(question.answerLabel, 'lední hokej');
    assert.ok(core.checkAnswer('hokej', question) && core.checkAnswer('Lední hokej', question) && !core.checkAnswer('fotbal', question));
    // Ženský tvar, a jen u sportovců s jedním sportem (Ledecká jezdí na lyžích i snowboardu)
    assert.equal(sport.specialQuestion(find('Petra Kvitová'), ctx, rngStarting(0.1)).title, 'Ve kterém sportu se proslavila?');
    assert.equal(sport.specialQuestion(find('Ester Ledecká'), ctx, rngStarting(0.1)), null);
    assert.equal(sport.specialQuestion(jagr, ctx, rngStarting(0.9)), null);
    // Popis bez sportu, druhu sportovce i klubů
    const text = sport.censor('sport', 'Jaromír Jágr je český lední hokejista, hrál NHL za Pittsburgh Penguins a vyhrál turnaj v Naganu.', jagr, ctx);
    assert.doesNotMatch(text, /hokej|NHL|Pittsburgh/);
    assert.match(text, /Jaromír Jágr je český/);
    // Nápovědy: fakta o sportovci, kluby, nakonec fotka; časová osa sport nenapoví
    const hints = sport.hints(jagr, ctx, 'sport');
    assert.deepEqual(hints.map(hint => hint.kind), ['facts', 'facts', 'photo']);
    assert.equal(sport.visual(jagr, ctx, 'sport'), null);
    // Napsaný jiný sport, který je položkou tématu, jde otevřít
    assert.deepEqual(sport.findAnswer('sport', 'fotbal', jagr, ctx), { topic: 'sport', id: find('Fotbal').q });
});

test('sport: kdo to je – časová osa se sportovními událostmi, příjmení jako odpověď', () => {
    const zatopek = find('Emil Zátopek');
    const timeline = sport.visual(zatopek, ctx, 'name');
    assert.equal(timeline.type, 'timeline');
    assert.deepEqual(timeline.spans.map(span => span.kind), ['life', 'reign']);
    // Vlastní událost (Zátopkův trojboj) osa neukáže
    assert.ok(!core.buildTimeline(timeline, 360).anchors.some(anchor => /Zátop/.test(anchor.label)));
    assert.deepEqual(sport.hints(zatopek, ctx, 'name').map(hint => hint.kind), ['visual', 'facts', 'photo']);
    const facts = sport.facts(zatopek, ctx, 'name').map(fact => `${fact.label}: ${fact.value}`);
    assert.ok(facts.includes('Olympijské zlato: LOH 1948, LOH 1952'), facts.join(' / '));
    assert.ok(sport.nameAliases(zatopek, ctx).includes('Zátopek'));
    // Příjmení, které nese víc sportovců, nestačí
    const ronaldo = find('Cristiano Ronaldo');
    assert.ok(!sport.nameAliases(ronaldo, ctx).includes('Ronaldo'));
    // Nesprávné možnosti: stejné pohlaví a sport
    for (const seed of ['a', 'b', 'c']) {
        const choices = core.buildItemChoices(find('Petra Kvitová'), data.items, core.createSeededRandom(seed), other => sport.similarity(find('Petra Kvitová'), other, ctx));
        for (const choice of choices) assert.equal(find(choice.label).sx, 'f', choice.label);
        assert.ok(choices.every(choice => find(choice.label).f.sport === 'tenis'), choices.map(choice => choice.label).join(', '));
    }
});

test('sport: olympijské hry – kde se konaly, rok v popisu skrytý, sousední hry', () => {
    const helsinki = find('Letní olympijské hry 1952');
    const host = sport.specialQuestion(helsinki, ctx, rngStarting(0.1));
    assert.equal(host.type, 'host');
    assert.equal(host.title, 'Kde se konaly letní olympijské hry 1952?');
    assert.equal(host.answerLabel, 'Helsinky');
    assert.ok(core.checkAnswer('Helsinki', host) && !core.checkAnswer('Stockholm', host));
    // Nesprávné možnosti: města jiných letních her
    const summerHosts = new Set(data.items.filter(item => item.c === 'olympiady' && item.f.type === 'L').map(item => item.f.names[0]));
    assert.ok(host.choices.every(choice => summerHosts.has(choice.label)), host.choices.map(choice => choice.label).join(', '));
    assert.doesNotMatch(sport.censor('host', 'Hry se konaly v Helsinkách, hlavním městě Finska.', helsinki, ctx), /Helsink|Finsk/);
    assert.deepEqual(sport.hints(helsinki, ctx, 'host').map(hint => hint.kind), ['facts', 'visual', 'facts']);
    // Melbourne 1956 mělo jezdecké soutěže ve Stockholmu – Stockholm mezi možnostmi není
    const melbourne = find('Letní olympijské hry 1956');
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const question = sport.specialQuestion(melbourne, ctx, rngStarting(0.1, seed));
        assert.ok(!question.choices.some(choice => choice.label === 'Stockholm'));
    }
    // Milán a Cortina 2026: možnost je Milán, Cortina (1956) mezi nesprávnými není, psaná Cortina platí
    const milan = find('Zimní olympijské hry 2026');
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const question = sport.specialQuestion(milan, ctx, rngStarting(0.1, seed));
        assert.equal(question.choices.find(choice => choice.correct).label, 'Milán');
        assert.ok(!question.choices.some(choice => /Cortina/.test(choice.label)));
        assert.ok(core.checkAnswer('Cortina', question));
    }
    // Otázka na hry: rok a pořadové číslo z popisu zmizí, město zůstane
    const text = sport.censor('name', 'Letní olympijské hry 1952, oficiálně Hry XV. olympiády, se konaly v Helsinkách v roce 1952.', helsinki, ctx);
    assert.doesNotMatch(text, /1952|XV\./);
    assert.match(text, /Helsinkách/);
    assert.ok(sport.nameAliases(helsinki, ctx).includes('LOH 1952') && sport.nameAliases(helsinki, ctx).includes('Helsinky 1952'));
    const hints = sport.hints(helsinki, ctx, 'name');
    const neighbours = hints.find(hint => hint.label === 'sousední hry').facts.map(fact => `${fact.label}: ${fact.value}`);
    assert.deepEqual(neighbours, ['Předchozí hry: Londýn', 'Další hry: Melbourne']);
    assert.ok(hints.find(hint => hint.label === 'olympijští vítězové').facts[0].value.includes('Emil Zátopek'));
    assert.equal(sport.visual(helsinki, ctx, 'name'), null, 'mapa by u otázky na rok nepomohla');
    assert.deepEqual(sport.coords(helsinki), { lat: helsinki.la, lon: helsinki.lo });
});

test('sport: sporty – obrázek v otázce, plavecké způsoby a disciplíny jen mezi sebou', () => {
    const football = find('Fotbal');
    assert.deepEqual(sport.questionImage(football, ctx, 'name'), { file: football.im, hash: football.ih, label: 'Sport', icon: 'image' });
    assert.equal(sport.questionImage(find('Jaromír Jágr'), ctx, 'name'), null);
    const crawl = find('Kraul');
    const question = sport.specialQuestion(crawl, ctx, core.createSeededRandom('kraul'));
    assert.equal(question.title, 'Který plavecký způsob to je?');
    assert.deepEqual(question.choices.map(choice => choice.label).sort(), ['Kraul', 'Motýlek', 'Prsa', 'Znak']);
    // Plavání a kraul (lezení a bouldering) by na fotce šly splést – nikdy nejsou spolu
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const swimming = core.buildItemChoices(find('Plavání'), data.items, core.createSeededRandom(seed), other => sport.similarity(find('Plavání'), other, ctx));
        assert.ok(!swimming.some(choice => ['Kraul', 'Prsa', 'Motýlek', 'Znak', 'Triatlon'].includes(choice.label)), swimming.map(choice => choice.label).join(', '));
        const climbing = core.buildItemChoices(find('Sportovní lezení'), data.items, core.createSeededRandom(seed), other => sport.similarity(find('Sportovní lezení'), other, ctx));
        assert.ok(!climbing.some(choice => ['Horolezectví', 'Bouldering'].includes(choice.label)));
    }
    // Fakta: hráči a rok na olympiádě; vybavení bez názvu sportu
    const facts = sport.facts(football, ctx, 'result').map(fact => `${fact.label}: ${fact.value}`);
    assert.ok(facts.includes('Hráčů na hřišti: 11 za tým') && facts.includes('Na olympiádě od: 1900'), facts.join(' / '));
    assert.ok(!facts.some(fact => /fotbal/i.test(fact)), facts.join(' / '));
});

test('sport: okruhy ve skutečných datech', () => {
    assert.ok(data.collections.length >= 8 && data.collections.length <= 20);
    assert.ok(inCollection('nagano').includes('Jaromír Jágr') && inCollection('nagano').includes('Dominik Hašek'));
    assert.ok(inCollection('cesti-olympijsti-vitezove').includes('Emil Zátopek') && inCollection('cesti-olympijsti-vitezove').includes('Věra Čáslavská'));
    assert.ok(!inCollection('cesti-sportovci').includes('Pelé'));
    assert.ok(inCollection('zimni-sporty').includes('Martina Sáblíková') && inCollection('zimni-sporty').includes('Biatlon'));
    assert.ok(!inCollection('zimni-sporty').includes('Pavel Nedvěd'));
    assert.equal(inCollection('letni-oh').length, 30);
    assert.ok(inCollection('atletika').includes('Skok o tyči') && inCollection('atletika').includes('Jan Železný'));
});
