// Geologie, rozšíření o přírodní katastrofy, podnebí a počasí (scripts/lib/geologie-rozsireni.mjs): kategorie Přírodní katastrofy,
// Podnebí a klima a Počasí a oblaka – data, otázky podle druhu, fakta a nápovědy, otázka na desetiletí, nesprávné možnosti
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/geologie.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'geologie.json'), 'utf8'));
const ctx = { topic, items: data.items, collections: data.collections, countries: {}, byId: new Map(data.items.map(item => [item.q, item])) };
const NEW = ['katastrofy', 'klima', 'pocasi'];
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id) => data.items.filter(item => (item.g || []).includes(id));
const rngStartingWith = (first, seed = 'katastrofy') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const wrongChoices = (item, seed) => core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => topic.similarity(item, other, ctx))
    .filter(choice => !choice.correct).map(choice => find(choice.label));

test('geologie – rozšíření: nové kategorie na konci, dost položek, známých i expertních', () => {
    const keys = topic.categories.map(category => category.key);
    assert.deepEqual(keys, ['nerosty', 'kameny', 'horniny', 'obdobi', 'utvary', 'zkameneliny', ...NEW]);
    assert.equal(topic.title, 'Geologie');
    for (const [key, min, minKnown] of [['katastrofy', 60, 18], ['klima', 50, 15], ['pocasi', 20, 6]]) {
        const list = data.items.filter(item => item.c === key);
        assert.ok(list.length >= min, `${key}: ${list.length}`);
        assert.ok(list.filter(item => item.k === 1).length >= minKnown, `${key}: známých`);
        assert.ok(list.some(item => item.x), `${key}: experti`);
        // Počasí jen omezeně: menší než katastrofy i podnebí
        if (key === 'pocasi') assert.ok(list.length < 40);
    }
    for (const name of ['Zemětřesení a tsunami v Tóhoku (2011)', 'Krakatoa', 'Eyjafjallajökull', 'Povodně na Moravě a Odře (1997)', 'Tornádo na Břeclavsku a Hodonínsku',
        'Richterova stupnice', 'Tropický pás', 'Monzun', 'El Niño', 'Golfský proud', 'Tundra', 'Doba ledová', 'Cumulonimbus', 'Cirrus', 'Tornádo']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    // Odborné pojmy a nedávné vzdálené katastrofy známé nejsou
    for (const name of ['Hadleyova buňka', 'Severoatlantická oscilace', 'Zemětřesení v Tibetu (2025)', 'Lenticularis']) assert.notEqual(find(name).k, 1, name);
    for (const id of ['zemetreseni', 'hurikany-tajfuny', 'povodne-bure', 'podnebne-pasy', 'biomy', 'klimaticke-jevy', 'oblaka', 'jevy-pocasi']) {
        assert.ok(data.collections.some(collection => collection.id === id), id);
        const members = inCollection(id);
        assert.ok(members.length >= 8, id);
        assert.ok(members.filter(item => item.k === 1).length >= Math.max(3, Math.ceil(members.length * 0.25)), `${id}: známých`);
    }
    for (const name of ['Povodně v Evropě (2002)', 'Tornádo na Břeclavsku a Hodonínsku']) assert.ok(find(name).cz === 1 && find(name).g.includes('ceske-katastrofy'), name);
});

test('geologie – rozšíření: žádná položka z jiného tématu (zemětřesení a hurikány Historie, sopky Zeměpisu, duha Fyziky)', () => {
    const own = new Map(data.items.filter(item => NEW.includes(item.c)).map(item => [item.q, item]));
    for (const file of fs.readdirSync(path.join(ROOT, 'topics'))) {
        const id = file.replace(/\.js$/, '');
        if (id === 'geologie' || !fs.existsSync(path.join(ROOT, 'data', `${id}.json`))) continue;
        const other = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8'));
        assert.deepEqual((other.items || []).filter(item => own.has(item.q)).map(item => item.n), [], id);
    }
    for (const name of ['Hurikán Katrina', 'Zemětřesení na Haiti (2010)', 'Vesuv', 'Pinatubo', 'Duha', 'Blesk']) assert.ok(!data.items.some(item => item.n === name), name);
    // Jedna položka na jméno i po rozšíření
    assert.equal(new Set(data.items.map(item => item.n.toLocaleLowerCase('cs'))).size, data.items.length);
});

test('geologie – rozšíření: otázka podle druhu, fakta a nápovědy, které pomáhají a neprozradí název', () => {
    assert.equal(topic.questionTitle(find('Velké zemětřesení v Kantó')), 'Které zemětřesení to bylo?');
    assert.equal(topic.questionTitle(find('Krakatoa')), 'Která sopka to je?');
    assert.equal(topic.questionTitle(find('Hurikán Irma')), 'Který hurikán to byl?');
    assert.equal(topic.questionTitle(find('Tajfun Haiyan')), 'Který tajfun to byl?');
    assert.equal(topic.questionTitle(find('Beaufortova stupnice')), 'Která stupnice to je?');
    assert.equal(topic.questionTitle(find('Středomořské podnebí')), 'Jaký typ podnebí to je?');
    assert.equal(topic.questionTitle(find('Savana')), 'Jaký biom to je?');
    assert.equal(topic.questionTitle(find('Cumulus')), 'Jaký druh oblaku to je?');
    assert.equal(topic.questionTitle(find('Křemen')), null, 'stávající kategorie beze změny');
    const facts = (item, mode = 'name') => Object.fromEntries(topic.facts(item, ctx, mode).map(fact => [fact.label, fact.value]));
    const tohoku = facts(find('Zemětřesení a tsunami v Tóhoku (2011)'));
    assert.equal(tohoku['Magnitudo'], '9,0');
    assert.equal(tohoku['Země'], 'Japonsko');
    assert.match(tohoku['Oběti'], /^asi 18\s500 obětí$/);
    assert.equal(facts(find('Eyjafjallajökull'))['Oběti'], 'žádné');
    assert.equal(facts(find('Krakatoa'))['Slavná erupce'], '1883');
    // Autor stupnice by ji prozradil (Richter – Richterova): jen po odpovědi
    assert.ok(!('Autor' in facts(find('Richterova stupnice'))));
    assert.equal(facts(find('Richterova stupnice'), 'result')['Autor'], 'Charles Richter');
    // Nápovědy: nejdřív síla a oběti, rok až nakonec; žádný údaj nápovědy neobsahuje slovo názvu
    const hints = topic.hints(find('Velké zemětřesení v Kantó'), ctx, 'name');
    assert.deepEqual(hints[0].facts.map(fact => fact.label), ['Magnitudo', 'Oběti']);
    assert.equal(hints.find(hint => hint.kind === 'visual').spec.type, 'map');
    assert.deepEqual(hints[hints.length - 1].facts.map(fact => fact.label), ['Rok']);
    for (const item of data.items.filter(other => NEW.includes(other.c))) {
        // Slova názvu kromě druhu (zemětřesení, hurikán, povodeň, oblak…), který je vidět i ve štítku otázky
        const generic = ['zemetreseni', 'tsunami', 'hurikan', 'tajfun', 'cyklon', 'povodne', 'povoden', 'tornado', 'oblak', 'oblaka', 'boure', 'stupnice', 'podnebi', 'proud']
            .concat(core.normalizeAnswer(item.ty).split(' ')).map(word => word.slice(0, 5));
        const words = core.normalizeAnswer(item.n.replace(/\([^)]*\)/g, '')).split(' ').filter(word => word.length >= 5 && !generic.includes(word.slice(0, 5)));
        for (const hint of topic.hints(item, ctx, 'name').filter(entry => entry.kind === 'facts')) {
            for (const fact of hint.facts.filter(entry => !['Rok', 'Země', 'Slavná erupce'].includes(entry.label))) {
                const value = core.normalizeAnswer(fact.value);
                assert.ok(!words.some(word => value.includes(word.slice(0, 5))), `${item.n}: ${fact.label} „${fact.value}“`);
            }
        }
        assert.ok(topic.hints(item, ctx, 'name').some(hint => hint.kind === 'facts' && hint.facts.length), `${item.n}: bez nápovědy`);
    }
    // Oblak a jev počasí mají fotku v otázce, katastrofa a podnebí ji mají jen jako nápovědu
    assert.equal(topic.questionImage(find('Cumulonimbus')).label, 'Oblak');
    assert.equal(topic.questionImage(find('Krakatoa')), null);
    assert.ok(data.items.filter(item => item.c === 'pocasi').every(item => item.im && item.ih));
});

test('geologie – rozšíření: otázka na desetiletí tropické cyklóny, ne u názvu s rokem', () => {
    const irma = find('Hurikán Irma');
    const decade = topic.specialQuestion(irma, ctx, rngStartingWith(0.1));
    assert.equal(decade.type, 'decade');
    assert.equal(decade.title, 'Ve kterém desetiletí řádil tento hurikán?');
    assert.equal(decade.choices.find(choice => choice.correct).label, '2010. léta');
    assert.equal(new Set(decade.choices.map(choice => choice.label)).size, 4);
    assert.ok(!topic.facts(irma, ctx, 'decade').some(fact => fact.label === 'Rok'));
    assert.doesNotMatch(topic.censor('decade', 'Irma zasáhla v září 2017 Karibik.', irma, ctx), /2017/);
    assert.equal(topic.specialQuestion(find('Hurikán Michael (2018)'), ctx, rngStartingWith(0.1)), null, 'rok v názvu');
    assert.equal(topic.specialQuestion(find('Krakatoa'), ctx, rngStartingWith(0.1)), null, 'jen tropické cyklóny');
    assert.equal(topic.specialQuestion(irma, ctx, rngStartingWith(0.9)), null);
});

test('geologie – rozšíření: nesprávné možnosti stejného druhu a skupiny', () => {
    assert.equal(topic.similarity(find('Richterova stupnice'), find('Krakatoa'), ctx), -Infinity);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const quake = wrongChoices(find('Velké zemětřesení v Kantó'), seed);
        assert.ok(quake.every(other => ['zemětřesení', 'tsunami'].includes(other.ty)), quake.map(other => `${other.n} [${other.ty}]`).join(', '));
        const hurricane = wrongChoices(find('Hurikán Irma'), seed);
        assert.ok(hurricane.every(other => other.ty === 'hurikán'), hurricane.map(other => other.n).join(', '));
        const scale = wrongChoices(find('Beaufortova stupnice'), seed);
        assert.ok(scale.every(other => other.ty === 'stupnice'), scale.map(other => other.n).join(', '));
        const cloud = wrongChoices(find('Cumulus'), seed);
        assert.ok(cloud.every(other => other.ty === 'oblak'), cloud.map(other => other.n).join(', '));
        const current = wrongChoices(find('Golfský proud'), seed);
        assert.ok(current.every(other => other.ty === 'mořský proud'), current.map(other => other.n).join(', '));
        // Doba ledová a glaciál, El Niño a La Niña se jako možnosti nesejdou
        assert.ok(!wrongChoices(find('Doba ledová'), seed).some(other => other.n === 'Glaciál'));
        assert.ok(!wrongChoices(find('El Niño'), seed).some(other => other.n === 'La Niña'));
    }
});
