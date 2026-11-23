// Zeměpis: skutečná data (data/zemepis.json ze scripts/build-zemepis.mjs) – hlavní města v okruzích, Česko podrobněji
// a úrovně obtížnosti (k = 1 Základní, x = 1 Mudrlant Expert) v každém okruhu a kategorii
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'zemepis.json'), 'utf8'));
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const CZECHIA = 'Q213';
// Stejné pravidlo jako knownFloor ve scripts/lib/zemepis-levels.mjs
const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));
const inGroup = (id) => data.items.filter(item => (item.g || []).includes(id));
const czech = data.items.filter(item => (item.co || []).includes(CZECHIA) && item.c !== 'stat');
const find = (name, category) => data.items.find(item => item.n === name && (!category || item.c === category));

test('hlavní města: každé hlavní město státu z dat je v okruhu hlavních měst, evropská i v okruhu Evropy', () => {
    const capitals = new Set(inGroup('hlavni-mesta').map(item => item.n));
    const european = new Set(inGroup('hlavni-mesta-evropy').map(item => item.n));
    const stateNames = new Set(data.items.filter(item => item.c === 'stat').map(item => item.n));
    const missing = [];
    for (const state of data.items.filter(item => item.c === 'stat')) {
        assert.ok(COUNTRIES[state.q], `${state.n} je v tabulce států`);
        const cap = state.f && state.f.cap;
        // Městské státy (Monako, Vatikán, Singapur) jsou svým vlastním hlavním městem
        if (!cap || stateNames.has(cap)) continue;
        // Hlavní město, které v datech je, musí být v okruhu (u Palestiny je Východní Jeruzalém čtvrť, ne město)
        const present = data.items.some(item => item.c === 'mesto' && item.n === cap);
        if (!present && state.q === 'Q219060') continue;
        if (!capitals.has(cap)) missing.push(`${cap} (${state.n})`);
        if (COUNTRIES[state.q].continent === 'EU' && !european.has(cap)) missing.push(`${cap} (${state.n}, Evropa)`);
    }
    assert.deepEqual(missing, []);
    // Dřív chyběla: Oslo bez českého štítku hlavního města, Bukurešť úplně
    for (const name of ['Oslo', 'Bukurešť', 'Praha', 'Bratislava', 'Varšava', 'Kodaň', 'Amsterdam']) assert.ok(european.has(name), name);
    // Každý evropský stát má hlavní město (u městských států sebe)
    for (const [qid, country] of Object.entries(COUNTRIES).filter(([, country]) => country.continent === 'EU')) {
        const state = data.items.find(item => item.q === qid);
        assert.ok(state && state.f.cap, `${country.name}: hlavní město`);
        assert.ok(european.has(state.f.cap) || stateNames.has(state.f.cap), `${country.name}: ${state.f.cap}`);
    }
    // Hlavní města mají ve hře jedinou položku (jinak by otázka měla dvě správné odpovědi)
    const names = inGroup('hlavni-mesta').map(item => core.normalizeAnswer(item.n));
    assert.equal(new Set(names).size, names.length);
});

test('okruhy podle hranic: velkoměsta od 3 milionů, nejdelší řeky od 1 500 km', () => {
    const byId = new Map(data.collections.map(collection => [collection.id, collection]));
    assert.match(byId.get('velkomesta').text, /3 miliony/);
    assert.match(byId.get('nejdelsi-reky').text, /1 500 km/);
    assert.ok(inGroup('velkomesta').every(item => item.c === 'mesto' && item.f.pop >= 3e6));
    assert.ok(inGroup('velkomesta').length >= 80, `${inGroup('velkomesta').length} velkoměst`);
    assert.ok(inGroup('nejdelsi-reky').every(item => item.c === 'reka' && item.f.len >= 1500));
    assert.ok(inGroup('nejdelsi-reky').length >= 80, `${inGroup('nejdelsi-reky').length} řek`);
    for (const name of ['Nil', 'Amazonka', 'Dunaj', 'Volha']) assert.ok(inGroup('nejdelsi-reky').some(item => item.n === name), name);
});

test('Česko podrobněji: všechna města, hrady a zámky, chráněná území, přehrady – s článkem, popisem, polohou a fotkou', () => {
    const towns = czech.filter(item => item.c === 'mesto');
    assert.ok(towns.length >= 580, `${towns.length} měst v Česku`);
    assert.ok(towns.filter(item => item.f.pop < 5000).length >= 250, 'i malá města');
    assert.ok(inGroup('ceska-mesta').length === towns.length);
    assert.ok(inGroup('hrady-zamky').length >= 150, `${inGroup('hrady-zamky').length} hradů a zámků`);
    const protectedTypes = {};
    for (const item of inGroup('chranena-uzemi')) protectedTypes[item.ty] = (protectedTypes[item.ty] || 0) + 1;
    assert.ok(protectedTypes['chráněná krajinná oblast'] >= 24, JSON.stringify(protectedTypes));
    assert.ok(protectedTypes['národní přírodní rezervace'] >= 60, JSON.stringify(protectedTypes));
    assert.ok(!protectedTypes['národní přírodní památka'], 'národní přírodní památky jsou jen v okruhu Česko');
    assert.ok(czech.filter(item => item.ty === 'národní přírodní památka').length >= 80);
    assert.ok(protectedTypes['národní park'] >= 4, JSON.stringify(protectedTypes));
    assert.ok(czech.filter(item => item.c === 'reka').length >= 120);
    assert.ok(czech.filter(item => item.c === 'hora').length >= 110);
    assert.ok(czech.filter(item => item.c === 'jezero' && item.ty === 'přehradní nádrž').length >= 15);
    // Každé místo: článek, poloha (mapové otázky), u českých i popis a fotka
    for (const item of data.items) {
        assert.ok(item.t && item.n && item.c, item.q);
        assert.ok(Number.isFinite(item.la) && Number.isFinite(item.lo), `${item.n}: poloha`);
    }
    const bare = czech.filter(item => !item.d || !item.im).map(item => item.n);
    assert.ok(bare.length <= 5, bare.join(', '));
    // Zkrácený název chráněné krajinné oblasti, druh na štítku
    assert.equal(find('CHKO Pálava', 'priroda').ty, 'chráněná krajinná oblast');
    // Hrad se jménem města má v názvu druh stavby
    assert.ok(find('Loket', 'mesto') && find('Hrad Loket', 'stavba'));
});

test('jednoznačná jména: v Česku žádná dvě místa stejné kategorie se stejným jménem, bez duplicit položek', () => {
    const ids = data.items.map(item => item.q);
    assert.equal(new Set(ids).size, ids.length, 'každá položka jednou');
    const seen = new Map();
    const clashes = [];
    for (const item of czech) {
        // Upřesnění v závorce rozliší (Smrk (Jizerské hory) × Smrk (Moravskoslezské Beskydy))
        const key = `${item.c}|${item.n.toLocaleLowerCase('cs')}`;
        if (seen.has(key)) clashes.push(item.n);
        seen.set(key, item);
    }
    assert.deepEqual(clashes, []);
});

test('úrovně: Základní, Mudrlant a Expert v rozumném poměru, v každém okruhu a kategorii dost známých míst', () => {
    const level = (item) => core.levelOf(item);
    for (const item of data.items) {
        assert.ok(item.k === 0 || item.k === 1, `${item.n}: k`);
        assert.ok(item.x === undefined || (item.x === 1 && item.k === 0), `${item.n}: x jen u neznámých`);
    }
    const share = (list, value) => list.filter(item => level(item) === value).length / list.length;
    const all = data.items;
    assert.ok(share(all, 1) >= 0.24 && share(all, 1) <= 0.36, `Základní ${share(all, 1)}`);
    assert.ok(share(all, 3) >= 0.15 && share(all, 3) <= 0.32, `Expert ${share(all, 3)}`);
    assert.ok(share(all, 2) >= 0.38, `Mudrlant ${share(all, 2)}`);
    // Spodní hranice: okruh od 8 míst má aspoň max(3, 25 %) známých (Základní hraje většina hráčů)
    const short = data.collections.map(collection => [collection.label, inGroup(collection.id)])
        .filter(([, members]) => members.filter(item => item.k === 1).length < knownFloor(members.length))
        .map(([label, members]) => `${label}: ${members.filter(item => item.k === 1).length}/${members.length}`);
    assert.deepEqual(short, []);
    // Kategorie aspoň pětina známých (u přírody ve světě je známých národních parků a pouští málo, neznámé se nepovyšují)
    for (const category of new Set(all.map(item => item.c))) {
        const members = all.filter(item => item.c === category);
        assert.ok(share(members, 1) >= 0.18, `kategorie ${category}: ${share(members, 1)}`);
    }
    // Základní úroveň: nejznámější místa
    for (const [name, category] of [['Praha', 'mesto'], ['Brno', 'mesto'], ['Český Krumlov', 'mesto'], ['Karlštejn', 'stavba'], ['Sněžka', 'hora'],
        ['Vltava', 'reka'], ['Oslo', 'mesto'], ['Bukurešť', 'mesto'], ['CHKO Český ráj', 'priroda']]) {
        const item = find(name, category);
        assert.ok(item && item.k === 1, `${name} je známé`);
    }
    // Státy, hlavní města, osmitisícovky a velkoměsta nejsou pro experty; Expert je pro malá města a národní přírodní památky
    for (const id of ['staty-evropy', 'hlavni-mesta', 'osmitisicovky', 'velkomesta']) assert.ok(inGroup(id).every(item => !item.x), id);
    assert.ok(all.filter(item => item.c === 'stat').every(item => !item.x));
    const smallTowns = czech.filter(item => item.c === 'mesto' && item.f.pop < 2000);
    assert.ok(share(smallTowns, 3) >= 0.4, `malá města pro experty: ${share(smallTowns, 3)}`);
    assert.ok(czech.filter(item => item.c === 'mesto' && item.f.pop >= 15000).every(item => item.k === 1), 'města od 15 000 obyvatel jsou známá');
    const monuments = czech.filter(item => item.ty === 'národní přírodní památka');
    assert.ok(share(monuments, 3) >= 0.6, `národní přírodní památky pro experty: ${share(monuments, 3)}`);
});

// --- Rozšíření (scripts/lib/zemepis-rozsireni.mjs): památky UNESCO, národní parky, moře, rekordy a fakta ---
const topic = require('../topics/zemepis.js');
const geoCtx = { topic, items: data.items, countries: COUNTRIES };
const factText = (item, mode) => topic.facts(item, geoCtx, mode).map(fact => `${fact.label}: ${fact.value}`);

test('památky UNESCO: celá místa ze světového dědictví (města, centra, naleziště, krajiny), ne jednotlivé budovy', () => {
    const heritage = data.items.filter(item => item.c === 'dedictvi');
    assert.ok(heritage.length >= 150, `${heritage.length} památek`);
    assert.ok(heritage.filter(item => item.k === 1).length >= 35, 'dost známých');
    assert.equal(topic.categories.at(-1).key, 'dedictvi', 'nová kategorie na konci seznamu');
    for (const item of heritage) {
        assert.ok((item.g || []).includes('unesco'), `${item.n}: v okruhu UNESCO`);
        assert.ok(item.co.length >= 1 && item.co.length <= 2, `${item.n}: ${item.co.length} států`);
        assert.ok(core.isRealPhoto(item.im) && !topic.offSubjectPhoto(item), `${item.n}: fotka`);
        assert.doesNotMatch(item.n, /^(?:Kostel|Katedrála|Hrad|Zámek|Palác|Klášter|Pevnost|Most|Muzeum)(?![\p{L}])/u, item.n);
        assert.ok(!['hrad', 'zámek', 'kostel', 'katedrála', 'palác', 'mešita', 'klášter'].includes(item.ty), `${item.n}: ${item.ty}`);
    }
    for (const [name, ty] of [['Trója', 'starověké město'], ['Lednicko-valtický areál', 'kulturní krajina'], ['Staré Město (Praha)', 'historické centrum'],
        ['Via Appia', 'historická cesta'], ['Holašovice', 'historická vesnice']]) {
        const item = find(name, 'dedictvi');
        assert.ok(item && item.k === 1 && item.ty === ty, `${name}: ${item && item.ty}`);
    }
    // Zápis do UNESCO je fakt nápovědy, otázka „Ve kterém státě to je?“ jde
    const troy = find('Trója', 'dedictvi');
    assert.ok(factText(troy, 'name').includes('Zápis do UNESCO: 1998'));
    const location = topic.specialQuestion(troy, geoCtx, () => 0.1);
    assert.equal(location && location.answerLabel, 'Turecko');
});

test('národní parky, přírodní dědictví, moře a oceány: nové položky a okruhy', () => {
    for (const name of ['Plitvická jezera', 'Krugerův národní park', 'Národní park Zion']) assert.equal((find(name, 'priroda') || {}).ty, 'národní park', name);
    assert.ok(inGroup('narodni-parky').length >= 250 && inGroup('narodni-parky').every(item => item.c === 'priroda' && item.ty === 'národní park'));
    assert.ok(inGroup('narodni-parky').some(item => item.n === 'Národní park Šumava'), 'i české parky');
    const natural = inGroup('unesco-priroda');
    assert.ok(natural.length >= 150, `${natural.length} přírodních památek`);
    for (const name of ['Velký bariérový útes', 'Bajkal', 'Yellowstonský národní park']) assert.ok(natural.some(item => item.n === name), name);
    assert.ok(natural.every(item => (item.g || []).includes('unesco')));
    // Moře: dřív chyběla Středozemní, Černé a Baltské; na stát se u moří neptá (omývají víc států)
    const seas = inGroup('more');
    assert.ok(seas.length >= 280 && seas.every(item => item.c === 'jezero'), `${seas.length} moří`);
    for (const name of ['Středozemní moře', 'Černé moře', 'Baltské moře', 'Japonské moře', 'Tichý oceán', 'Bospor']) {
        const item = seas.find(sea => sea.n === name);
        assert.ok(item && item.k === 1, name);
        assert.equal(topic.specialQuestion(item, geoCtx, () => 0.1), null, `${name}: bez otázky na stát`);
    }
    assert.ok(factText(find('Bajkal', 'jezero'), 'name').some(text => /^Největší hloubka: 1\s642 m$/u.test(text)));
});

test('rekordy a úřední jazyky: fakta až po odpovědi a v atlasu, ne v nápovědě', () => {
    const everest = find('Mount Everest', 'hora');
    assert.ok(factText(everest, 'result').includes('Rekord: nejvyšší hora světa'));
    assert.ok(factText(everest, 'card').includes('Rekord: nejvyšší hora světa'));
    assert.ok(!factText(everest, 'name').some(text => text.startsWith('Rekord')), 'v nápovědě ne');
    assert.ok(inGroup('rekordy').length >= 50 && inGroup('rekordy').every(item => item.f.rec));
    const czechia = find('Česko', 'stat');
    assert.ok(factText(czechia, 'result').includes('Úřední jazyk: čeština'));
    assert.ok(!factText(czechia, 'name').some(text => text.includes('čeština')), 'jazyk by stát prozradil');
    assert.ok(factText(find('Švýcarsko', 'stat'), 'card').some(text => text.startsWith('Úřední jazyky: ')));
});
