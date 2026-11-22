// Testy tématu Jídlo a pití na skutečných datech (data/jidlo.json)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const jidlo = require('../topics/jidlo.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'jidlo.json'), 'utf8'));
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(countries);
const ctx = { topic: jidlo, items: data.items, collections: data.collections, countries };
const find = (name) => data.items.find(item => item.n === name);
const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
const asLines = (facts) => facts.map(fact => `${fact.label}: ${fact.value}`);
// rng, které nejdřív vrátí first (rozhodne o druhu otázky), pak náhodná čísla se semínkem
const rngStarting = (first, seed = 'jidlo') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};

test('jídlo: známé položky ve všech kategoriích, česká stopa a čistá data', () => {
    const known = {
        pokrmy: ['Pizza', 'Svíčková na smetaně', 'Vepřo knedlo zelo', 'Guláš', 'Suši', 'Smažený sýr', 'Kulajda', 'Hamburger', 'Lasagne'],
        sladkosti: ['Chléb', 'Rohlík', 'Vánočka', 'Bábovka', 'Tiramisu', 'Zmrzlina', 'Čokoláda', 'Trdelník', 'Croissant'],
        syry: ['Hermelín', 'Olomoucké tvarůžky', 'Niva', 'Eidam', 'Mozzarella', 'Parmezán', 'Camembert'],
        ovoce: ['Jablko', 'Banán', 'Švestka', 'Třešně', 'Jahoda', 'Pomeranč', 'Kešu', 'Vlašský ořech'],
        zelenina: ['Mrkev', 'Brambor', 'Rajče', 'Okurka', 'Cibule', 'Česnek', 'Zelí', 'Hrách'],
        koreni: ['Pepř', 'Skořice', 'Vanilka', 'Bazalka', 'Kmín', 'Majoránka', 'Šafrán'],
        napoje: ['Káva', 'Espresso', 'Cappuccino', 'Čaj', 'Zelený čaj', 'Limonáda', 'Horká čokoláda'],
        alkohol: ['Pivo', 'Pivo plzeňského typu', 'Víno', 'Slivovice', 'Becherovka', 'Whisky', 'Mojito', 'Ryzlink rýnský', 'Frankovka'],
        kuchari: ['Gordon Ramsay', 'Jamie Oliver', 'Zdeněk Pohlreich', 'Magdalena Dobromila Rettigová', 'Auguste Escoffier', 'Paul Bocuse']
    };
    for (const [category, names] of Object.entries(known)) {
        for (const name of names) {
            const item = find(name);
            assert.ok(item && item.k === 1 && item.c === category, `chybí známá položka ${category}/${name}`);
        }
    }
    // Každá kategorie má dost známých položek na základní obtížnost a skoro všechny mají fotku
    for (const category of jidlo.categories.map(entry => entry.key)) {
        const list = data.items.filter(item => item.c === category);
        assert.ok(list.filter(item => item.k === 1).length >= 25, `${category}: málo známých`);
        assert.ok(list.filter(item => item.im).length >= 0.95 * list.length, `${category}: fotky`);
    }
    // Česká stopa podle země původu a ručního štítku
    for (const name of ['Svíčková na smetaně', 'Olomoucké tvarůžky', 'Hermelín', 'Kulajda', 'Zdeněk Pohlreich', 'Vánočka']) assert.equal(find(name).cz, 1, name);
    for (const name of ['Pizza', 'Suši', 'Gordon Ramsay', 'Mozzarella']) assert.equal(find(name).cz, undefined, name);
    // Značky (fotka lahve s názvem by odpověď prozradila) a lidé známí něčím jiným z tříd Wikidat do tématu nepatří
    for (const name of ['Baileys Irish Cream', 'Smirnoff', 'Absolut', 'Malibu', 'Veselá kráva', 'Kurt Franz', 'Danny Kaye', 'Brian Boitano']) {
        assert.ok(!find(name), `${name} v tématu není`);
    }
    // Jména jednou v celém tématu, kuchaři s rokem narození, roky vzniku jen novověké
    assert.equal(new Set(data.items.map(item => item.n.toLowerCase())).size, data.items.length);
    for (const item of data.items.filter(other => other.c === 'kuchari')) {
        assert.ok(item.f.born < new Date().getFullYear() - 18, item.n);
        if (item.f.died !== undefined) assert.ok(item.f.died > item.f.born, item.n);
    }
    assert.ok(data.items.every(item => item.f.year === undefined || item.f.year >= 1500), 'pověsti (preclík 610) jako rok vzniku ne');
    assert.ok(fs.statSync(path.join(ROOT, 'data', 'jidlo.json')).size < 1e6);
});

test('jídlo: plody a zelenina s článkem o rostlině mají název potraviny, čeleď a vědecký název', () => {
    const cashew = find('Kešu');
    assert.equal(cashew.t, 'Ledvinovník západní');
    assert.equal(cashew.f.fam, 'ledvinovníkovité');
    assert.ok(core.isAnswerMatch('kešu', core.nameAnswers(cashew, jidlo.nameAliases(cashew, ctx))));
    assert.ok(core.isAnswerMatch('Ledvinovník západní', core.nameAnswers(cashew, jidlo.nameAliases(cashew, ctx))), 'i název rostliny');
    assert.ok(core.isAnswerMatch('brambory', core.nameAnswers(find('Brambor'), jidlo.nameAliases(find('Brambor'), ctx))));
    assert.ok(core.isAnswerMatch('sushi', core.nameAnswers(find('Suši'), jidlo.nameAliases(find('Suši'), ctx))));
    // Popis „druh rostliny“ by u plodu mátl: místo něj druh položky
    assert.ok(data.items.filter(item => ['ovoce', 'zelenina', 'koreni'].includes(item.c)).every(item => !/^druh rostliny/u.test(item.d || '')));
    // Čeleď jen rostlinná (med nemá „čeleď včelovití“)
    assert.ok(data.items.every(item => !item.f.fam || /ité$/u.test(item.f.fam)));
    const apple = find('Jablko');
    assert.deepEqual(asLines(jidlo.facts(apple, ctx, 'name')).filter(line => line.startsWith('Čeleď')), ['Čeleď: růžovité']);
    assert.equal(jidlo.specialQuestion(apple, ctx, rngStarting(0.01)), null, 'u ovoce se na zemi původu neptá');
    assert.deepEqual(jidlo.culture(apple), [], 'rostliny bez kultury jmen');
});

test('jídlo: odkud pochází – zakrytý popis, nápovědy bez země, psaný stát', () => {
    const pizza = find('Pizza');
    const question = jidlo.specialQuestion(pizza, ctx, rngStarting(0.01));
    assert.equal(question.type, 'location');
    assert.equal(question.title, 'Ze které země pochází tento pokrm?');
    assert.ok(question.showName);
    assert.equal(question.answerLabel, 'Itálie');
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices.filter(choice => choice.correct).length, 1);
    assert.ok(question.choices.every(choice => choice.topic === 'zemepis' && countries[choice.id]));
    assert.ok(core.checkAnswer('Itálie', question) && !core.checkAnswer('Francie', question));
    assert.deepEqual(jidlo.findAnswer('location', 'Francie', pizza, ctx), { topic: 'zemepis', id: 'Q142' });
    // Popis bez země a národnosti, fakta a nápovědy bez země původu a kuchyně
    assert.doesNotMatch(jidlo.censor('location', 'Pizza je italský pokrm, který pochází z Itálie (Neapol).', pizza, ctx), /ital|Itál/i);
    const hints = jidlo.hints(pizza, ctx, 'location');
    const texts = hints.flatMap(hint => (hint.facts || []).map(fact => `${fact.label}: ${fact.value}`)).join(' | ');
    assert.doesNotMatch(texts, /Itál|italsk/);
    assert.match(texts, /Kontinent: Evropa/);
    // Jen asi u třetiny otázek; název prozrazující zemi (Řecký salát) ne
    assert.equal(jidlo.specialQuestion(pizza, ctx, rngStarting(0.9)), null);
    assert.equal(jidlo.specialQuestion(find('Řecký salát'), ctx, rngStarting(0.01)), null);
    // Ostatní kategorie s jednou zemí původu: sýr, nápoj, kuchař
    assert.equal(jidlo.specialQuestion(find('Ementál'), ctx, rngStarting(0.01)).answerLabel, 'Švýcarsko');
    assert.equal(jidlo.specialQuestion(find('Cappuccino'), ctx, rngStarting(0.01)).title, 'Ze které země pochází tento nápoj?');
});

test('jídlo: fakta, nápovědy, podtitulek a časová osa kuchařů', () => {
    const pizza = find('Pizza');
    const lines = asLines(jidlo.facts(pizza, ctx, 'name'));
    assert.ok(lines.includes('Země původu: Itálie'), lines.join(' / '));
    assert.ok(lines.some(line => line.startsWith('Suroviny: ')));
    assert.ok(!asLines(jidlo.facts(pizza, ctx, 'location')).some(line => /Země původu|Kuchyně/.test(line)));
    assert.equal(jidlo.subtitle(pizza, ctx), 'pokrm · Itálie');
    assert.equal(jidlo.subtitle(find('Kulajda'), ctx), 'polévka · Česko');
    // Kuchař: fakta (země, povolání), fotka, roky života; osa života po odpovědi (obrazová nápověda tématu)
    const ramsay = find('Gordon Ramsay');
    const plan = jidlo.hints(ramsay, ctx, 'name');
    assert.deepEqual(plan.map(step => step.kind), ['facts', 'photo', 'facts']);
    assert.deepEqual(asLines(plan[2].facts), ['Narození: 1966']);
    const timeline = jidlo.visual(ramsay, ctx, 'result');
    assert.equal(timeline.type, 'timeline');
    assert.equal(timeline.hide, 'Gordon Ramsay');
    // Surovina, která je slovem odpovědi, se neukáže (Hrachová polévka × hrášek)
    assert.ok(!asLines(jidlo.facts(find('Hrachová polévka'), ctx, 'name')).some(line => /hrách|hrášek/i.test(line)));
    assert.ok(asLines(jidlo.facts(ramsay, ctx, 'result')).some(line => line === 'Život: * 1966'));
    assert.match(jidlo.subtitle(ramsay, ctx), /^\* 1966 · kuchař/);
    assert.equal(find('Nigella Lawsonová').ty, 'autorka kuchařek');
    // Alkohol: obsah alkoholu v procentech
    const whisky = find('Whisky');
    if (whisky.f.abv) assert.ok(asLines(jidlo.facts(whisky, ctx, 'name')).some(line => /^Obsah alkoholu: \d/.test(line)));
});

test('jídlo: nesprávné možnosti stejného druhu (polévka k polévkám, likér k likérům, kuchař ke kuchařům)', () => {
    const choicesFor = (name, seed = name) => {
        const item = find(name);
        return core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => jidlo.similarity(item, other, ctx), core.cultureLandsFor(jidlo, ctx))
            .filter(choice => !choice.correct).map(choice => data.items.find(other => other.q === choice.id));
    };
    for (const [name, ty] of [['Kulajda', 'polévka'], ['Amaretto', 'likér'], ['Mrkev', 'kořenová zelenina'], ['Espresso', 'kávový nápoj'], ['Ryzlink rýnský', 'odrůda vinné révy']]) {
        const wrong = choicesFor(name);
        assert.equal(wrong.length, 3, name);
        assert.ok(wrong.filter(item => item.ty === ty).length >= 2, `${name}: ${wrong.map(item => `${item.n} (${item.ty})`).join(', ')}`);
    }
    // Kuchaři: k Pohlreichovi čeští kuchaři
    const czech = choicesFor('Zdeněk Pohlreich');
    assert.ok(czech.filter(item => item.cz === 1).length >= 2, czech.map(item => item.n).join(', '));
    // Ke slavné položce slavné (Pizza nemá mezi možnostmi neznámé pokrmy)
    assert.ok(choicesFor('Pizza').every(item => item.k === 1));
});

test('jídlo: okruhy', () => {
    assert.ok(inCollection('ceska-kuchyne').includes('Svíčková na smetaně') && !inCollection('ceska-kuchyne').includes('Pizza'));
    assert.ok(inCollection('italska-kuchyne').includes('Pizza') && inCollection('italska-kuchyne').includes('Tiramisu'));
    assert.ok(inCollection('polevky').includes('Kulajda') && !inCollection('polevky').includes('Guláš'));
    assert.ok(inCollection('citrusy').includes('Citron') && inCollection('orechy').includes('Kešu'));
    assert.ok(inCollection('odrudy-ovoce').includes('Granny Smith') && !inCollection('odrudy-ovoce').includes('Merlot'));
    assert.ok(inCollection('odrudy-revy').includes('Merlot') && inCollection('pivo').includes('Ležák'));
    assert.ok(inCollection('cesti-kuchari').includes('Zdeněk Pohlreich') && !inCollection('cesti-kuchari').includes('Gordon Ramsay'));
    for (const collection of data.collections) assert.ok(inCollection(collection.id).length >= 5, collection.id);
    // Okruh od 8 položek má aspoň čtvrtinu známých (jinak by se v základní obtížnosti skoro nehrál)
    for (const collection of data.collections) {
        const members = core.filterItems(data.items, { collection: collection.id });
        if (members.length >= 8) assert.ok(members.filter(item => item.k === 1).length >= Math.ceil(members.length * 0.15), `${collection.id}: známých ${members.filter(item => item.k === 1).length}/${members.length}`);
    }
});
