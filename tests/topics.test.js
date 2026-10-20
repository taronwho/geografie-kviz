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

// --- Historie ---

const historie = TOPICS.find(topic => topic.id === 'historie');
const histCtx = { countries: COUNTRIES_TABLE, items: [] };
const person = (n, c, f, extra = {}) => ({ q: 'Q1', t: n, n, c, k: 1, ty: '', f: { y: f.from ?? f.born, ...f }, ...extra });
const anchorsOf = (item, mode = 'name') => core.buildTimeline(historie.visual(item, histCtx, mode), 360).anchors.map(anchor => anchor.label);

test('historie: časová osa, události z vlastních dějin, otázka na století', () => {
    const edward = person('Eduard III.', 'panovnik', { born: 1312, died: 1377, from: 1327, to: 1377, dyn: 'Plantageneti', land: 'Anglické království' }, { ty: 'anglický král', g: ['anglicti-panovnici'] });
    const charles = person('Karel IV.', 'panovnik', { born: 1316, died: 1378, from: 1346, to: 1378, land: 'Svatá říše římská' }, { ty: 'český král', cz: 1 });
    assert.deepEqual(historie.regionsOf(edward), ['anglie']);
    assert.deepEqual(historie.regionsOf(charles), ['cesko', 'nemecko'], 'Svatá říše římská není starověký Řím');
    // Anglický král nemá na ose české události, český král je má a jeho vlastní univerzita ho neprozradí
    const czech = /Karlovy|Husa|Přemyslovců|Moravském/;
    assert.ok(!anchorsOf(edward).some(label => czech.test(label)), anchorsOf(edward).join(' / '));
    assert.ok(anchorsOf(edward).some(label => /stoleté války/.test(label)));
    assert.ok(anchorsOf(charles).some(label => czech.test(label)));
    assert.ok(!anchorsOf(charles).some(label => /Karl/.test(label)));
    // Bez vlastních dějin jen světové události
    const gandhi = person('Mahátma Gándhí', 'osobnost', { born: 1869, died: 1948 }, { f: { born: 1869, died: 1948, y: 1904 } });
    assert.deepEqual(historie.regionsOf(gandhi), []);
    assert.ok(!anchorsOf(gandhi).some(label => czech.test(label) || /Mnichov|Československa/.test(label)));

    // Otázka na století: jméno je vidět, nápověda časovou osou ani roky ve faktech nejsou
    const century = historie.specialQuestion(charles, histCtx, () => 0.1);
    assert.equal(century.type, 'century');
    assert.equal(century.answerLabel, '14. století');
    assert.ok(century.accepted.includes('14'));
    assert.equal(century.choices.filter(choice => choice.correct).length, 1);
    assert.equal(historie.visual(charles, histCtx, 'century'), null);
    assert.ok(historie.facts(charles, histCtx, 'century').every(fact => !/\d/.test(fact.value)));
    assert.doesNotMatch(historie.censor('century', 'Karel IV. vládl od roku 1346 ve 14. století.', charles, histCtx), /\d/);
    assert.equal(historie.specialQuestion(charles, histCtx, () => 0.9), null);
    // Po odpovědi fakta i se stoletím a rozumně zapsaná období
    const asLine = (list) => list.map(fact => `${fact.label}: ${fact.value}`);
    assert.ok(asLine(historie.facts(charles, histCtx, 'result')).includes('Století: 14. století'));
    assert.equal(historie.subtitle(person('Alfréd Veliký', 'panovnik', { born: 849, died: 899, from: 871, to: 899 }), histCtx), '849–899 n. l.');
    assert.equal(historie.subtitle(person('Caesar', 'statnik', { born: -100, died: -44 }), histCtx), '100–44 př. n. l.');
});

test('historie: okruhy a známé osobnosti ve skutečných datech', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'historie.json'), 'utf8'));
    for (const name of ['Karel IV.', 'Napoleon Bonaparte', 'Tomáš Garrigue Masaryk', 'Jindřich VIII. Tudor', 'Bitva u Stalingradu']) {
        assert.ok(data.items.some(item => item.n === name && item.k === 1), `chybí známá položka ${name}`);
    }
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    assert.ok(inCollection('premyslovci').includes('Přemysl Otakar II.'));
    assert.ok(!inCollection('premyslovci').includes('Karel IV.'));
    assert.ok(inCollection('anglicti-panovnici').includes('Alžběta I.'));
    assert.ok(inCollection('prezidenti-cr').includes('Václav Havel'));
    assert.ok(inCollection('druha-svetova').includes('Bitva u Stalingradu'), 'bitva patří k válce i nepřímo');
    // Herci a filmaři mezi osobnostmi dějin nejsou
    assert.ok(!data.items.some(item => ['Humphrey Bogart', 'Clark Gable', 'Christopher Lee'].includes(item.n)));
});

// --- Biologie ---

const biologie = TOPICS.find(topic => topic.id === 'biologie');
const organism = (q, n, c, f, extra = {}) => ({ q, t: n, n, c, k: 1, f, ...extra });

test('biologie: otázka „Kam patří?“, psaný název, fakta a mapa rozšíření', () => {
    const items = [
        organism('Q140', 'Lev', 'savci', { lat: 'Panthera leo', cls: 'savci', ord: 'šelmy', fam: 'kočkovití', iucn: 'VU', mass: 188, len: 2.5, life: 14 }, { rm: 'Lion range.svg', rh: '67' }),
        organism('Q1', 'Veverka obecná', 'savci', { cls: 'savci', ord: 'hlodavci' }),
        organism('Q2', 'Šimpanz učenlivý', 'savci', { cls: 'savci', ord: 'primáti' }),
        organism('Q3', 'Srnec obecný', 'savci', { cls: 'savci', ord: 'sudokopytníci' }),
        organism('Q4', 'Ptakopysk podivný', 'savci', { cls: 'savci', ord: 'Monotremata' }),
        organism('Q5', 'Sýkora koňadra', 'ptaci', { cls: 'ptáci', ord: 'pěvci' }),
        organism('Q6', 'Sýkora modřinka', 'ptaci', { cls: 'ptáci', ord: 'pěvci' }),
        organism('Q7', 'Dub letní', 'rostliny', { cls: 'vyšší dvouděložné', ord: 'bukotvaré', fam: 'bukovité' })
    ];
    const ctx = { items };
    const lion = items[0];
    const taxon = biologie.specialQuestion(lion, ctx, () => 0.1);
    assert.equal(taxon.type, 'taxon');
    assert.equal(taxon.title, 'Do kterého řádu patří?');
    assert.deepEqual(taxon.choices.map(choice => choice.label).sort(), ['hlodavci', 'primáti', 'sudokopytníci', 'šelmy'], 'jen české názvy řádů stejné třídy');
    assert.equal(taxon.answerLabel, 'šelmy');
    assert.equal(biologie.specialQuestion(lion, ctx, () => 0.9), null);
    assert.equal(biologie.specialQuestion(items[4], ctx, () => 0.1), null, 'vědecký název řádu se nehádá');
    assert.equal(biologie.specialQuestion(items[7], ctx, () => 0.1), null, 'málo čeledí na výběr');
    // Popis bez hledaného řádu, název druhu zůstane; fakta bez řádu a čeledi
    const text = biologie.censor('taxon', 'Lev je velká kočkovitá šelma. Šelmy jsou masožravci.', lion, ctx);
    assert.doesNotMatch(text, /šelm|Šelm/);
    assert.match(text, /Lev/);
    const asLine = (list) => list.map(fact => `${fact.label}: ${fact.value}`.replace(/ /g, ' '));
    assert.deepEqual(asLine(biologie.facts(lion, ctx, 'taxon')), ['Třída: savci', 'Ohrožení: zranitelný', 'Hmotnost: až 188 kg', 'Délka: až 2,5 m', 'Dožívá se: až 14 let']);
    assert.ok(asLine(biologie.facts(lion, ctx, 'name')).includes('Řád: šelmy'));
    assert.ok(!asLine(biologie.facts(lion, ctx, 'name')).some(line => /Panthera/.test(line)), 'vědecký název až po odpovědi');
    assert.ok(asLine(biologie.facts(lion, ctx, 'result')).includes('Vědecký název: Panthera leo'));
    // Psaná odpověď: vědecký název a jedinečné první slovo („veverka“ ano, „sýkora“ ne)
    assert.deepEqual(biologie.nameAliases(lion, ctx), ['Panthera leo']);
    assert.deepEqual(biologie.nameAliases(items[1], ctx), ['Veverka']);
    assert.deepEqual(biologie.nameAliases(items[5], ctx), []);
    // Mapa rozšíření je obrázek z Commons, kresba SVG jako náhled PNG
    assert.deepEqual(biologie.visual(lion, ctx, 'name'), { type: 'image', file: 'Lion range.svg', hash: '67', name: 'mapa rozšíření', icon: 'map' });
    assert.equal(biologie.visual(items[1], ctx, 'name'), null);
    assert.match(core.commonsPhotoUrl('Lion range.svg', '67', 500), /\/thumb\/6\/67\/Lion_range\.svg\/500px-Lion_range\.svg\.png$/);
});

test('biologie: okruhy a známé druhy ve skutečných datech', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'biologie.json'), 'utf8'));
    for (const name of ['Lev', 'Pes domácí', 'Liška obecná', 'Sýkora koňadra', 'Hřib smrkový', 'Dub letní', 'Triceratops']) {
        assert.ok(data.items.some(item => item.n === name && item.k === 1), `chybí známý druh ${name}`);
    }
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    assert.ok(inCollection('domaci-zvirata').includes('Pes domácí') && inCollection('domaci-zvirata').includes('Kočka domácí'));
    assert.ok(inCollection('nase-priroda').includes('Liška obecná') && !inCollection('nase-priroda').includes('Lev'));
    assert.ok(inCollection('selmy').includes('Lev') && !inCollection('selmy').includes('Srnec obecný'));
    assert.ok(!inCollection('dinosauri').some(name => /^(Sýkora|Kur|Holub)/.test(name)), 'ptáci nejsou mezi dinosaury');
    // Kytovci jsou řád podle školní systematiky, ne sudokopytníci
    assert.equal(data.items.find(item => item.n === 'Kosatka dravá').f.ord, 'kytovci');
    // Stejné jméno u šelmy i houby: houba má upřesnění
    assert.ok(data.items.some(item => item.n === 'Liška obecná (houba)'));
});

// --- Chemie ---

const chemie = TOPICS.find(topic => topic.id === 'chemie');

test('chemie: periodická tabulka, značka prvku, vzorec a zakrytí v popisu', () => {
    // Rozložení tabulky: každé políčko jednou, lanthanoidy a aktinoidy pod tabulkou
    const cells = new Set();
    for (let z = 1; z <= 118; z++) {
        const position = core.periodicPosition(z);
        assert.ok(position.col >= 1 && position.col <= 18, `sloupec prvku ${z}`);
        cells.add(`${position.row}:${position.col}`);
        assert.ok(core.elementFamily(z), `skupina prvku ${z}`);
    }
    assert.equal(cells.size, 118);
    assert.deepEqual(core.periodicPosition(26), { period: 4, row: 4, col: 8 }, 'železo: 4. perioda, 8. skupina');
    assert.equal(core.periodicPosition(57).row, 9);
    assert.equal(core.elementFamily(11).label, 'alkalický kov');

    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chemie.json'), 'utf8'));
    const ctx = { items: data.items };
    const iron = data.items.find(item => item.n === 'Železo');
    const water = data.items.find(item => item.n === 'Voda');
    assert.ok(iron && iron.k === 1 && iron.f.sym === 'Fe' && iron.f.z === 26);
    assert.ok(water && water.k === 1 && water.f.formula === 'H₂O');
    // Značka: matoucí možnosti začínají stejným písmenem
    const symbol = chemie.specialQuestion(iron, ctx, () => 0.1);
    assert.equal(symbol.type, 'symbol');
    assert.ok(symbol.choices.every(choice => choice.label.startsWith('F')), symbol.choices.map(c => c.label).join(' '));
    assert.deepEqual(symbol.accepted, ['Fe']);
    assert.ok(!core.isAnswerMatch('F', symbol.accepted), 'u značky se překlep netoleruje');
    // Vzorec: psaný s obyčejnými číslicemi platí, strukturní vzorec se u té otázky neukáže
    const formula = chemie.specialQuestion(water, ctx, () => 0.1);
    assert.equal(formula.type, 'formula');
    assert.ok(core.isAnswerMatch('H2O', formula.accepted));
    assert.equal(chemie.visual(water, ctx, 'formula'), null);
    assert.ok(!chemie.facts(water, ctx, 'formula').some(fact => fact.label === 'Vzorec'));
    assert.deepEqual(chemie.visual(iron, ctx, 'name'), { type: 'periodic', z: 26 });
    // Popis: značka ani vzorec nezůstanou, ale česká slova „na“ a „o“ ano
    const ironText = chemie.censor('name', 'Železo (Fe) je kov. Rez je Fe₂O₃, na vzduchu reaguje s kyslíkem O₂ a mluví se o něm často.', iron, ctx);
    assert.doesNotMatch(ironText, /Želez|Fe/);
    assert.match(ironText, / na vzduchu .* o něm/);
    assert.doesNotMatch(chemie.censor('formula', 'Voda (H₂O) je sloučenina, vzorec H2O.', water, ctx), /H₂O|H2O/);
    assert.match(chemie.censor('symbol', 'Železo je kov se značkou Fe.', iron, ctx), /Železo je kov se značkou \[\*\*\*\]/);
    // Okruhy
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    assert.ok(inCollection('alkalicke-kovy').includes('Sodík') && !inCollection('alkalicke-kovy').includes('Vodík'));
    assert.ok(inCollection('kyseliny').includes('Kyselina sírová'));
    assert.ok(inCollection('nobelova-cena-chemie').includes('Marie Curie-Skłodowská'));
    assert.ok(!data.items.some(item => ['Leonardo da Vinci', 'Margaret Thatcherová'].includes(item.n)), 'jen skuteční chemici');
});

// --- Fyzika ---

const fyzika = TOPICS.find(topic => topic.id === 'fyzika');

test('fyzika: jednotka veličiny, značka a veličina jednotky, zakrytí značek', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fyzika.json'), 'utf8'));
    const ctx = { items: data.items };
    const find = (name) => data.items.find(item => item.n === name);
    for (const name of ['Síla', 'Teplota', 'Elektrický proud', 'Newton', 'Pascal', 'Kelvin', 'Jupiter', 'Měsíc', 'Albert Einstein', 'Isaac Newton']) {
        assert.ok(find(name) && find(name).k === 1, `chybí známá položka ${name}`);
    }
    assert.equal(find('Síla').f.unit, 'newton');
    assert.equal(find('Kelvin').f.measures, 'teplota');
    assert.equal(find('Volt').f.system, 'odvozená jednotka SI');
    assert.ok(!data.items.some(item => item.c === 'jednotky' && /^(Týden|Měsíc|Rok|Procento)$/.test(item.n)), 'kalendářní a jiné nefyzikální jednotky ne');
    assert.ok(!data.items.some(item => /^(Planeta X|Devátá planeta|Vulkán|Nemesis)$/.test(item.n)), 'hypotetická tělesa ne');
    // Jednotka veličiny: psaná i značkou, mezi fakty u té otázky jednotka chybí
    const unit = fyzika.specialQuestion(find('Síla'), ctx, () => 0.1);
    assert.equal(unit.type, 'unit');
    assert.equal(unit.answerLabel, 'newton (N)');
    assert.ok(core.isAnswerMatch('N', unit.accepted) && core.isAnswerMatch('newton', unit.accepted));
    assert.ok(!fyzika.facts(find('Síla'), ctx, 'unit').some(fact => fact.label === 'Jednotka SI'));
    // Jednotka: značka (do 0,25), co měří (do 0,45), jinak název
    assert.equal(fyzika.specialQuestion(find('Pascal'), ctx, () => 0.1).type, 'usymbol');
    assert.equal(fyzika.specialQuestion(find('Pascal'), ctx, () => 0.3).type, 'measures');
    assert.equal(fyzika.specialQuestion(find('Pascal'), ctx, () => 0.9), null);
    // Značky: víceznakové všude, jednoznakové jen za číslem (předložka „V“ zůstane)
    assert.equal(fyzika.censor('unit', 'Síla se měří v newtonech (N), 1 N je velmi malá síla. V praxi…', find('Síla'), ctx), 'Síla se měří v [***], 1 [***] je velmi malá síla. V praxi…');
    assert.doesNotMatch(fyzika.censor('name', 'Pascal (Pa) je jednotka tlaku, 100 Pa je málo.', find('Pascal'), ctx), /Pascal|Pa\b/);
    // Fyzik: časová osa s milníky fyziky, vlastní objev ho neprozradí
    const einstein = fyzika.visual(find('Albert Einstein'), ctx, 'name');
    assert.equal(einstein.type, 'timeline');
    assert.ok(!core.buildTimeline(einstein, 360).anchors.some(anchor => /Einstein/.test(anchor.label)));
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    assert.deepEqual(inCollection('zakladni-jednotky-si').sort(), ['Ampér', 'Kandela', 'Kelvin', 'Kilogram', 'Metr', 'Mol', 'Sekunda']);
    assert.ok(inCollection('slunecni-soustava').includes('Jupiter') && inCollection('slunecni-soustava').includes('Měsíc'));
});
