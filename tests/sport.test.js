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
    for (const name of ['Albert Camus', 'Niels Bohr', 'Ivana Trumpová', 'Edvard Beneš', 'Henry Ford', 'Viktor Orbán', 'Sean Connery', 'Yanni', 'Suthida']) {
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
    assert.ok(data.collections.length >= 8 && data.collections.length <= 24);
    assert.ok(inCollection('nagano').includes('Jaromír Jágr') && inCollection('nagano').includes('Dominik Hašek'));
    assert.ok(inCollection('cesti-olympijsti-vitezove').includes('Emil Zátopek') && inCollection('cesti-olympijsti-vitezove').includes('Věra Čáslavská'));
    assert.ok(!inCollection('cesti-sportovci').includes('Pelé'));
    assert.ok(inCollection('zimni-sporty').includes('Martina Sáblíková') && inCollection('zimni-sporty').includes('Biatlon'));
    assert.ok(!inCollection('zimni-sporty').includes('Pavel Nedvěd'));
    assert.equal(inCollection('letni-oh').length, 30);
    assert.ok(inCollection('atletika').includes('Skok o tyči') && inCollection('atletika').includes('Jan Železný'));
});

test('sport: kluby, sportoviště a soutěže – známé položky, fakta, nápovědy a nesprávné možnosti', () => {
    const byCategory = (key) => data.items.filter(item => item.c === key);
    const clubs = byCategory('kluby');
    const venues = byCategory('sportoviste');
    const competitions = byCategory('souteze');
    assert.ok(clubs.length >= 400 && venues.length >= 400 && competitions.length >= 140, `${clubs.length}/${venues.length}/${competitions.length}`);
    for (const name of ['Real Madrid CF', 'AC Sparta Praha', 'Camp Nou', 'Old Trafford', 'Wimbledon', 'Tour de France', 'Liga mistrů UEFA']) {
        assert.ok(find(name) && find(name).k === 1, `chybí známá položka ${name}`);
    }
    // Známé jsou jen vybrané kluby a sportoviště (počet článků na známost nestačí), ale pořád je jich dost
    assert.ok(clubs.filter(item => item.k).length >= 60 && venues.filter(item => item.k).length >= 25);
    assert.equal(find('AC Sparta Praha').cz, 1);
    assert.equal(find('Real Madrid CF').cz, undefined);
    // Každá položka má popis, zemi a sport (soutěž i sportoviště, klub), sportoviště fotku a souřadnice
    for (const item of [...clubs, ...venues]) {
        assert.ok(item.f.land, item.n);
        assert.ok(item.t && item.ty, item.n);
    }
    for (const item of clubs) assert.ok(item.f.sport, item.n);
    for (const item of venues) assert.ok(item.im && item.la !== undefined && item.lo !== undefined, item.n);
    for (const item of competitions) assert.ok(item.f.sport && item.ty, item.n);
    // Nesprávné možnosti klubu: týž sport (druh klubu je u otázky vidět) a k české Spartě české a slovenské kluby
    const sparta = find('AC Sparta Praha');
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const wrong = core.buildItemChoices(sparta, data.items, core.createSeededRandom(seed), other => sport.similarity(sparta, other, ctx), core.cultureLandsFor(sport, ctx)).filter(choice => !choice.correct);
        const others = wrong.map(choice => data.items.find(item => item.q === choice.id));
        assert.ok(others.every(other => other.c === 'kluby' && other.f.sport === 'fotbal'), others.map(other => other.n).join(', '));
        assert.ok(others.filter(other => ['Česko', 'Slovensko'].includes(other.f.land)).length >= 2, others.map(other => `${other.n} (${other.f.land})`).join(', '));
    }
    // Nesprávné možnosti sportoviště: stejný druh (stadion, aréna, okruh)
    const monza = venues.find(item => item.ty === 'závodní okruh' && item.k);
    for (const seed of ['a', 'b', 'c']) {
        const wrong = core.buildItemChoices(monza, data.items, core.createSeededRandom(seed), other => sport.similarity(monza, other, ctx), core.cultureLandsFor(sport, ctx)).filter(choice => !choice.correct);
        assert.ok(wrong.every(choice => data.items.find(item => item.q === choice.id).ty === 'závodní okruh'), wrong.map(choice => choice.label).join(', '));
    }
    // Nápovědy: klub – země, mapa, aréna, fotka; sportoviště – země, mapa, kapacita, fotka; soutěž – sport, původ
    const barcelona = find('FC Barcelona');
    assert.deepEqual(sport.hints(barcelona, ctx, 'name').map(hint => hint.kind), ['facts', 'visual', 'facts', 'photo']);
    assert.equal(sport.visual(barcelona, ctx, 'name'), null);
    assert.ok(sport.visual(barcelona, ctx, 'result').type === 'map');
    const campNou = find('Camp Nou');
    const venueHints = sport.hints(campNou, ctx, 'name');
    assert.deepEqual(venueHints.map(hint => hint.kind), ['facts', 'visual', 'facts', 'photo']);
    assert.ok(venueHints[2].facts.some(fact => fact.label === 'Kapacita'));
    assert.deepEqual(sport.hints(find('Wimbledon'), ctx, 'name').map(hint => hint.kind), ['facts', 'facts', 'photo']);
    // Domácí tým, který nese jméno sportoviště, jméno neprozradí
    const oita = venues.find(item => /Ōita/.test(item.n));
    if (oita) assert.ok(!sport.facts(oita, ctx, 'name').some(fact => /Óita|Oita/.test(fact.value)));
    // Psaná odpověď: klub bez zkratky právní formy (Barcelona), jen když je jednoznačná
    assert.ok(core.isAnswerMatch('Barcelona', [barcelona.n, ...sport.nameAliases(barcelona, ctx)]));
    // Okruhy
    assert.ok(inCollection('fotbalove-kluby').includes('FC Barcelona') && inCollection('ceske-kluby').includes('AC Sparta Praha'));
    assert.ok(inCollection('stadiony-a-haly').includes('Camp Nou') && inCollection('souteze').includes('Tour de France'));
    assert.ok(inCollection('okruhy').every(name => venues.some(item => item.n === name && item.ty === 'závodní okruh')));
    assert.ok(inCollection('motorsport').includes('Scuderia Ferrari'));
    assert.ok(!inCollection('severoamericke-ligy').includes('FC Barcelona') && inCollection('severoamericke-ligy').includes('Los Angeles Lakers'));
});

test('sport: úrovně obtížnosti – Základní v každém okruhu a kategorii, Expert jen pro méně známé', () => {
    const share = (list, test) => list.filter(test).length / list.length;
    for (const item of data.items) assert.ok(!(item.k === 1 && item.x), `${item.n}: známá i expertní`);
    // Celé téma: Základní asi čtvrtina až třetina, Expert asi pětina až třetina
    const known = share(data.items, item => item.k === 1);
    const expert = share(data.items, item => item.x);
    assert.ok(known >= 0.22 && known <= 0.36, `Základní ${known}`);
    assert.ok(expert >= 0.18 && expert <= 0.32, `Expert ${expert}`);
    // Každá kategorie a každý okruh od 8 položek má aspoň max(3, 25 %) známých a nejvýš 40 % expertních
    const groups = [...['sportovci', 'olympiady', 'sporty', 'kluby', 'sportoviste', 'souteze'].map(c => [c, data.items.filter(item => item.c === c)]),
        ...data.collections.map(collection => [collection.id, inCollection(collection.id).map(find)])];
    for (const [id, list] of groups) {
        if (list.length < 8) continue;
        const knownCount = list.filter(item => item.k === 1).length;
        assert.ok(knownCount >= Math.max(3, Math.floor(0.25 * list.length)), `${id}: známých ${knownCount} z ${list.length}`);
        assert.ok(list.filter(item => item.x).length <= Math.ceil(0.4 * list.length), `${id}: příliš expertních`);
    }
    // Hvězdy jsou známé, i když mají málo jazykových verzí (rozhoduje i návštěvnost české Wikipedie); perličky expertní
    for (const name of ['Usain Bolt', 'Michael Phelps', 'Jelena Rybakinová', 'Camp Nou', 'Los Angeles Lakers', 'Tour de France', 'Velká pardubická', 'Bílí Tygři Liberec']) {
        assert.equal(find(name)?.k, 1, name);
    }
    for (const name of ['Royal Bafokeng Stadium', 'Pesäpallo']) assert.equal(find(name)?.x, 1, name);
    // Olympijské sporty nejsou pro experty; Expert je v každé velké kategorii
    for (const item of data.items.filter(other => other.c === 'sporty' && other.f.oh)) assert.ok(!item.x, item.n);
    for (const c of ['sportovci', 'kluby', 'sportoviste', 'souteze']) assert.ok(data.items.filter(item => item.c === c && item.x).length >= 30, c);
});

test('sport: rozšířené okruhy – olympijští vítězové, legendy, sportovkyně, kluby, okruhy a soutěže', () => {
    // Nagano 1998: celý zlatý tým (23 hráčů), i bez medaile ve Wikidatech
    assert.equal(inCollection('nagano').length, 23);
    for (const name of ['Josef Beránek', 'Milan Hnilička', 'Libor Procházka']) assert.ok(inCollection('nagano').includes(name), name);
    // Čeští olympijští vítězové i z týmů (fotbal 1980, gymnastky 1948); Slováci z doby Československa ne
    const czechChampions = inCollection('cesti-olympijsti-vitezove');
    assert.ok(czechChampions.length >= 90, `${czechChampions.length}`);
    for (const name of ['Ladislav Vízek', 'Ota Zaremba', 'Martin Fuksa', 'Věra Růžičková', 'Ester Ledecká']) assert.ok(czechChampions.includes(name), name);
    for (const name of ['Ondrej Nepela', 'Anton Tkáč']) assert.ok(!czechChampions.includes(name), name);
    // Legendy: aspoň 4 zlaté, i sprinteři, u kterých Wikidata medaile neuvádějí; medaile se nepočítají dvakrát
    const legends = inCollection('olympijske-legendy');
    assert.ok(legends.length >= 100, `${legends.length}`);
    for (const name of ['Usain Bolt', 'Carl Lewis', 'Paavo Nurmi', 'Jesse Owens', 'Michael Phelps', 'Bjørn Dæhlie']) assert.ok(legends.includes(name), name);
    for (const name of legends) assert.ok(find(name).f.gold >= 4, name);
    assert.equal(find('Mark Spitz').f.gold, 9);
    assert.equal(find('Jason Lezak').f.gold, 4);
    // Sportovkyně všechny ženy, ne jen ty známé
    const women = inCollection('sportovkyne').map(find);
    assert.ok(women.length >= 250 && women.every(item => item.sx === 'f'), `${women.length}`);
    assert.ok(women.filter(item => item.k !== 1).length >= 100);
    // Kluby zámořských lig a českých soutěží (i ty, které \b v regulárním výrazu dřív vyřadilo), bez finále a ročníků
    assert.ok(inCollection('severoamericke-ligy').length >= 100);
    for (const name of ['Toronto Maple Leafs', 'Golden State Warriors', 'Los Angeles Dodgers']) assert.ok(inCollection('severoamericke-ligy').includes(name), name);
    assert.equal(find('Super Bowl').c, 'souteze');
    assert.ok(inCollection('ceske-kluby').length >= 140 && inCollection('ceske-kluby').includes('Bílí Tygři Liberec'));
    assert.ok(!data.items.some(item => item.c === 'kluby' && /sezóna|ročník|\d{4}\/\d{2}/u.test(`${item.n} ${item.d || ''}`)));
    // Míčové hry i méně známé, bojové a vodní sporty, okruhy bez hipodromů a letišť, soutěže
    assert.ok(inCollection('micove-hry').length >= 50 && inCollection('micove-hry').includes('Padel'));
    assert.ok(inCollection('bojove-sporty').length >= 120 && inCollection('vodni-sporty').length >= 150);
    assert.ok(inCollection('okruhy').length >= 55);
    assert.ok(!data.items.some(item => item.ty === 'závodní okruh' && /hip+odrom|cirkus|letiště|sjezdovk|dostih/iu.test(`${item.n} ${item.d || ''}`)));
    assert.equal(find('Ascotské závodiště').ty, 'dostihové závodiště');
    assert.ok(inCollection('souteze').length >= 140);
    for (const name of ['Mistrovství světa v ledním hokeji', 'Serie A', 'Velká pardubická']) assert.ok(inCollection('souteze').includes(name), name);
    assert.doesNotMatch(find('Kolem Flander').d, /Holandsk/);
});
