// Testy témat (topics/*.js) a jejich dat (data/<téma>.json). Každé nové téma projde stejnou kontrolou automaticky.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const TOPIC_FILES = fs.readdirSync(path.join(ROOT, 'topics')).filter(file => file.endsWith('.js'));
const TOPICS = TOPIC_FILES.map(file => require(path.join(ROOT, 'topics', file)));
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SERVICE_WORKER = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ICONS = fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8');
const VISUALS = fs.readFileSync(path.join(ROOT, 'visuals.js'), 'utf8');
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const WORLD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world.json'), 'utf8'));

const hasIcon = (name) => ICONS.includes(`"${name}":`);

test('každé téma má vše, co jádro potřebuje, a je zapojené do aplikace', () => {
    assert.ok(TOPICS.length >= 1);
    assert.equal(new Set(TOPICS.map(topic => topic.id)).size, TOPICS.length, 'ID témat jsou unikátní');
    for (const [index, topic] of TOPICS.entries()) {
        const where = topic.id || TOPIC_FILES[index];
        assert.match(topic.id, /^[a-z]+$/, where);
        assert.equal(`${topic.id}.js`, TOPIC_FILES[index], `${where}: soubor se jmenuje podle ID`);
        for (const key of ['title', 'icon', 'emoji', 'color', 'dataFile']) assert.ok(topic[key], `${where}: chybí ${key}`);
        for (const key of ['question', 'one', 'next', 'atlas', 'placeholder']) assert.ok(topic.words && topic.words[key], `${where}: chybí words.${key}`);
        for (const key of ['facts', 'subtitle']) assert.equal(typeof topic[key], 'function', `${where}: chybí ${key}()`);
        assert.ok(Array.isArray(topic.categories) && topic.categories.length, `${where}: kategorie`);
        assert.equal(new Set(topic.categories.map(c => c.key)).size, topic.categories.length, `${where}: klíče kategorií`);
        for (const category of topic.categories) {
            for (const key of ['key', 'label', 'one', 'icon']) assert.ok(category[key], `${where}/${category.key}: chybí ${key}`);
            assert.ok(hasIcon(category.icon), `${where}/${category.key}: ikona ${category.icon} není v icons.js`);
        }
        assert.ok(hasIcon(topic.icon), `${where}: ikona ${topic.icon} není v icons.js`);
        if (topic.subtitleIcon) assert.ok(hasIcon(topic.subtitleIcon), `${where}: ikona ${topic.subtitleIcon}`);
        assert.ok(INDEX_HTML.includes(`<script src="topics/${topic.id}.js" defer></script>`), `${where}: chybí v index.html`);
        assert.ok(SERVICE_WORKER.includes(`'topics/${topic.id}.js'`) && SERVICE_WORKER.includes(`'${topic.dataFile}'`), `${where}: chybí v sw.js`);
        assert.ok(fs.existsSync(path.join(ROOT, topic.dataFile)), `${where}: chybí ${topic.dataFile}`);
    }
});

for (const topic of TOPICS) {
    test(`data tématu ${topic.title}: položky, kategorie, okruhy a nápovědy`, () => {
        const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
        const ctx = { topic, items: data.items, collections: data.collections, countries: COUNTRIES };
        const categoryKeys = topic.categories.map(c => c.key);
        assert.equal(new Set(data.items.map(item => item.q)).size, data.items.length, 'každá položka jen jednou');
        for (const item of data.items) {
            assert.ok(/^Q\d+$/.test(item.q) && item.t && item.n, JSON.stringify(item));
            assert.ok(categoryKeys.includes(item.c), `${item.n}: kategorie ${item.c}`);
            assert.ok(item.k === 0 || item.k === 1, `${item.n}: známost`);
            if (item.im) assert.match(item.ih || '', /^[0-9a-f]{2}$/, `${item.n}: hash fotky`);
        }
        // Každá kategorie má dost položek i známých, aby šlo hrát a nabídnout čtyři možnosti
        for (const key of categoryKeys) {
            const inCategory = data.items.filter(item => item.c === key);
            assert.ok(inCategory.length >= 8, `${topic.id}/${key}: jen ${inCategory.length} položek`);
            assert.ok(inCategory.some(item => item.k === 1), `${topic.id}/${key}: žádná známá položka`);
        }
        // Okruhy: unikátní, s položkami, a položky odkazují jen na existující okruhy
        const collectionIds = new Set(data.collections.map(c => c.id));
        assert.equal(collectionIds.size, data.collections.length);
        for (const collection of data.collections) {
            assert.ok(collection.label, collection.id);
            assert.ok(core.filterItems(data.items, { collection: collection.id }).length >= 5, `okruh ${collection.label} je skoro prázdný`);
        }
        for (const item of data.items) for (const group of item.g || []) assert.ok(collectionIds.has(group), `${item.n}: neznámý okruh ${group}`);

        // Nápovědy, podtitulek a fakta jdou sestavit pro každou položku a obrazová nápověda je známého druhu
        for (const item of data.items) {
            assert.equal(typeof topic.subtitle(item, ctx), 'string');
            for (const mode of ['name', 'result', 'card']) assert.ok(Array.isArray(topic.facts(item, ctx, mode)));
            const visual = topic.visual ? topic.visual(item, ctx, 'name') : null;
            if (visual) assert.ok(VISUALS.includes(`${visual.type}: {`) || VISUALS.includes(`register('${visual.type}'`), `${item.n}: neznámá nápověda ${visual.type}`);
        }
        // Možnosti odpovědí se dají postavit pro každou kategorii
        for (const key of categoryKeys) {
            const item = data.items.find(candidate => candidate.c === key && candidate.k === 1);
            const choices = core.buildItemChoices(item, data.items, core.createSeededRandom(key), other => topic.groupOf ? topic.groupOf(other, ctx) : '');
            assert.equal(choices.length, 4, `${topic.id}/${key}: možnosti`);
        }
    });
}

// --- Zeměpis ---

const zemepis = TOPICS.find(topic => topic.id === 'zemepis');
const COUNTRIES_TABLE = {
    Q213: { name: 'Česko', continent: 'EU', iso: '203' },
    Q36: { name: 'Polsko', continent: 'EU', iso: '616' },
    Q142: { name: 'Francie', continent: 'EU', iso: '250' },
    Q183: { name: 'Německo', continent: 'EU', iso: '276' },
    Q40: { name: 'Rakousko', continent: 'EU', iso: '040' },
    Q30: { name: 'Spojené státy americké', continent: 'NA', iso: '840' }
};
const geoCtx = { countries: COUNTRIES_TABLE, items: [] };
const place = (q, n, c, co, extra = {}) => ({ q, t: n, n, c, k: 1, la: 50, lo: 15, ty: '', co, f: {}, ...extra });
const asText = (list) => list.map(fact => `${fact.label}: ${fact.value}`.replace(/ /g, ' '));

test('zeměpis: na stát se ptá jen tam, kde to dává smysl', () => {
    const always = () => 0;
    const ask = (item) => zemepis.specialQuestion(item, geoCtx, always);
    const prague = ask(place('Q1085', 'Praha', 'mesto', ['Q213']));
    assert.equal(prague.type, 'location');
    assert.equal(prague.answerLabel, 'Česko');
    assert.ok(prague.showName);
    assert.ok(prague.choices.every(choice => choice.topic === 'zemepis' && COUNTRIES_TABLE[choice.id]));
    assert.ok(core.isAnswerMatch('Česká republika', prague.accepted));
    // Stát sám, místo na hranici dvou států, název prozrazující stát, stát mimo tabulku
    assert.equal(ask(place('Q213', 'Česko', 'stat', ['Q213'])), null);
    assert.equal(ask(place('Q170424', 'Sněžka', 'hora', ['Q213', 'Q36'])), null);
    assert.equal(ask(place('Q1288', 'Česká Lípa', 'mesto', ['Q213'])), null);
    assert.equal(ask(place('Q1', 'Ostrov', 'ostrov', ['Q99'])), null);
    // Jen asi u třetiny otázek
    assert.equal(zemepis.specialQuestion(place('Q1085', 'Praha', 'mesto', ['Q213']), geoCtx, () => 0.9), null);
});

test('zeměpis: zakrytí státu a vyhledání napsaného státu', () => {
    const prague = place('Q1085', 'Praha', 'mesto', ['Q213']);
    assert.doesNotMatch(zemepis.censor('location', 'Praha je hlavní město Česka, leží v Čechách.', prague, geoCtx), /Česk|Čech/);
    assert.equal(zemepis.censor('name', 'Text', prague, geoCtx), null, 'u otázky na název zakrývá jádro');
    assert.deepEqual(zemepis.findAnswer('location', 'Rakousko', prague, geoCtx), { topic: 'zemepis', id: 'Q40' });
    assert.equal(zemepis.findAnswer('name', 'Rakousko', prague, geoCtx), null);
    assert.deepEqual(zemepis.nameAliases(place('Q30', 'Spojené státy americké', 'stat', ['Q30'])), ['USA', 'Spojené státy', 'Amerika']);
});

test('zeměpis: fakta podle druhu otázky, podtitulek a slepá mapa', () => {
    const snezka = place('Q170424', 'Sněžka', 'hora', ['Q213', 'Q36'], { f: { elev: 1603 } });
    assert.deepEqual(asText(zemepis.facts(snezka, geoCtx, 'name')), ['Státy: Česko, Polsko', 'Kontinent: Evropa', 'Nadmořská výška: 1 603 m']);
    assert.deepEqual(asText(zemepis.facts(snezka, geoCtx, 'card')), ['Nadmořská výška: 1 603 m']);
    const eiffel = place('Q243', 'Eiffelova věž', 'stavba', ['Q142'], { f: { h: 330, year: 1889 } });
    assert.deepEqual(asText(zemepis.facts(eiffel, geoCtx, 'location')), ['Kontinent: Evropa', 'Výška: 330 m', 'Vznik: 1889']);
    const czechia = place('Q213', 'Česko', 'stat', ['Q213'], { f: { cap: 'Praha', area: 78871, pop: 10900555 } });
    assert.deepEqual(asText(zemepis.facts(czechia, geoCtx, 'name')), ['Kontinent: Evropa', 'Hlavní město: Praha', 'Počet obyvatel: 10,9 mil.', 'Rozloha: 78 871 km²']);
    assert.equal(zemepis.subtitle(snezka, geoCtx), 'Česko, Polsko');
    assert.equal(zemepis.subtitle(czechia, geoCtx), 'Evropa');
    assert.equal(zemepis.subtitle(place('Q1', 'Tichý oceán', 'jezero', []), geoCtx), 'Mezinárodní vody');
    // Mapa: u státu zvýrazněný stát a výřez podle rozlohy, u otázky na stát širší výřez
    assert.deepEqual(zemepis.visual(czechia, geoCtx, 'name'), { type: 'map', lat: 50, lon: 15, span: 15, highlightIso: '203', label: 'Stát je uprostřed' });
    const prague = place('Q1085', 'Praha', 'mesto', ['Q213']);
    assert.equal(zemepis.visual(prague, geoCtx, 'name').span, 24);
    assert.equal(zemepis.visual(prague, geoCtx, 'location').span, 36);
    assert.equal(zemepis.isCzech(prague), true);
});

test('zeměpis: okruhy a známá místa ve skutečných datech', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'zemepis.json'), 'utf8'));
    for (const name of ['Praha', 'Paříž', 'Česko', 'Mount Everest', 'Vltava', 'Eiffelova věž', 'Sněžka']) {
        assert.ok(data.items.some(item => item.n === name && item.k === 1), `chybí známé místo ${name}`);
    }
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    assert.ok(inCollection('cesko').includes('Sněžka') && inCollection('cesko').includes('Brno'));
    assert.ok(!inCollection('cesko').includes('Paříž'));
    assert.ok(inCollection('osmitisicovky').includes('Mount Everest') && !inCollection('osmitisicovky').includes('Himálaj'));
    assert.ok(inCollection('hlavni-mesta-evropy').includes('Praha'));
    // Státy jsou v tabulce států a skoro všechny mají obrys pro zvýraznění na slepé mapě
    const outlines = new Set(WORLD.countries.map(c => c.id));
    const states = data.items.filter(item => item.c === 'stat');
    assert.ok(states.every(item => COUNTRIES[item.q]));
    assert.ok(states.filter(item => outlines.has(COUNTRIES[item.q].iso)).length >= 150);
});
