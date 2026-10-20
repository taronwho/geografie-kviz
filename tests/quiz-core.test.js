// Testy obecného jádra (quiz-core.js). Spuštění: npm test (stačí Node 20+, žádné závislosti)
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../quiz-core.js');

test('zakrytí názvu včetně diakritiky a skloňování', () => {
    const cases = [
        ['Aš je město na západě Čech. V Aši žije 13 tisíc lidí.', 'Aš', /Aš/i],
        ['Řím je město, římský císař, v Římě.', 'Řím', /Řím/i],
        ['Praha je hlavní město. V Praze žije přes milion lidí, Prahou teče Vltava.', 'Praha', /Prah|Praz/i],
        ['Hradec Králové je město. V Hradci sídlí univerzita.', 'Hradec Králové', /Hradc|Hradec/i],
        ['Plzeň je město. V Plzni se vaří pivo, plzeňský kraj.', 'Plzeň', /Plz/i],
        ['Sněžka je hora. Na Sněžce je bouda.', 'Sněžka', /Sněž/i],
        ['Labe je řeka. Na Labi leží Děčín.', 'Labe (řeka)', /Lab/i],
        ['St. Moritz je středisko.', 'St. Moritz (C++)', /Moritz/]
    ];
    for (const [text, name, leak] of cases) {
        assert.doesNotMatch(core.censorName(text, name), leak, `${name}: ${core.censorName(text, name)}`);
    }
});

test('zakrytí státu nezakryje nesouvisející slova', () => {
    const peru = core.censorCountry('Machu Picchu je pevnost v Peru, nejlépe zachovalá. Těží se tu perla.', 'Peru');
    assert.doesNotMatch(peru, /Peru /);
    assert.match(peru, /pevnost/);
    assert.match(peru, /nejlépe/);
    assert.match(peru, /perla/);

    const mali = core.censorCountry('Jezero v Mali má velkou rozlohu, mapa Mali.', 'Mali');
    assert.doesNotMatch(mali, /Mali/);
    assert.match(mali, /má velkou/);

    assert.doesNotMatch(core.censorCountry('Leží v Číně, čínského původu.', 'Čína'), /Čín|čín/);
    assert.doesNotMatch(core.censorCountry('Leží v Indii, indický stát, Indie je velká.', 'Indie'), /Indi|indi/);
    assert.doesNotMatch(core.censorCountry('Alpy leží v Rakousku, Švýcarsku a Itálii.', 'Rakousko, Švýcarsko, Itálie'), /Rakous|Švýcar|Itál/);
    assert.doesNotMatch(core.censorCountry('Hora leží ve střední Evropě, nedaleko Antarktidě.', 'Rakousko'), /Evrop|Antarktid/);
    assert.doesNotMatch(core.censorCountry('Nejvyšší hora v Česku, české hory, Českého ráje.', 'Česko'), /Česk|česk/);
    assert.equal(core.censorCountry('Text bez země a jezero.', core.UNKNOWN_COUNTRY), 'Text bez země a jezero.');
});

test('dělení na věty nerozbije zkratky a řadové číslovky', () => {
    const { description, funFacts } = core.processWikiText(
        'Sněžka je nejvyšší hora Česka s výškou 1603 m n. m. a leží v Krkonoších na hranici s Polskem. ' +
        'Ve 20. století zde byla postavena meteorologická observatoř na vrcholu hory. ' +
        'Na vrchol vede lanovka z Pece pod Sněžkou, která byla postavena roku 1949. ' +
        'Hlavní město je hl. m. Praha, kde stojí sv. Václav ve velkém počtu soch. ' +
        'Jezero má hloubku 3.5 metru a mnoho ryb v sobě.'
    );
    assert.match(description, /1603 m n\. m\. a leží v Krkonoších/);
    assert.match(description, / Ve 20\. století zde byla postavena/);
    assert.ok(funFacts.some(fact => fact.includes('hl. m. Praha') && fact.includes('sv. Václav')));
});

test('úvod jen z krátkých vět dá neprázdný popis', () => {
    const { description } = core.processWikiText('Kozí hřbet je hora. Leží v Krkonoších. Je vysoká 1422 m. Vede tam značená cesta. Je to oblíbené místo.');
    assert.ok(description.length >= 50, description);
    assert.match(description, /^Kozí hřbet je hora\./);
});

test('generátor se semínkem je opakovatelný', () => {
    const a = core.createSeededRandom('geo-kviz-2026-10-16');
    const b = core.createSeededRandom('geo-kviz-2026-10-16');
    const c = core.createSeededRandom('geo-kviz-2026-10-17');
    const first = [a(), a(), a()];
    assert.deepEqual(first, [b(), b(), b()]);
    assert.notDeepEqual(first, [c(), c(), c()]);
    assert.ok(first.every(value => value >= 0 && value < 1));
});

test('escapeHtml', () => {
    assert.equal(core.escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
});

test('psaná odpověď toleruje diakritiku, velikost písmen a drobný překlep', () => {
    assert.ok(core.isAnswerMatch('snezka', ['Sněžka']));
    assert.ok(core.isAnswerMatch('Kilimandzaro', ['Kilimandžáro']));
    assert.ok(core.isAnswerMatch('Kilimanžaro', ['Kilimandžáro']));
    assert.ok(core.isAnswerMatch('labe', ['Labe (řeka)']));
    assert.ok(!core.isAnswerMatch('Lipno', ['Labe']));
    assert.ok(!core.isAnswerMatch('', ['Labe']));
    assert.ok(!core.isAnswerMatch('Brno', ['Brod']));
});

test('přijímané odpovědi: název i titulek článku, u státu i běžné názvy', () => {
    const accepted = core.countryAnswers(['Q30'], ['Spojené státy americké']);
    assert.ok(core.isAnswerMatch('USA', accepted));
    assert.ok(core.isAnswerMatch('spojene staty americke', accepted));
    assert.ok(core.isAnswerMatch('Česká republika', core.countryAnswers(['Q213'], ['Česko'])));
    const bridge = core.nameAnswers({ n: 'Karlův most', t: 'Karlův most' });
    assert.ok(core.isAnswerMatch('karluv most', bridge));
    assert.ok(!core.isAnswerMatch('USA', bridge));
    // Titulek s upřesněním v závorce i bez něj, další názvy z tématu
    const labe = core.nameAnswers({ n: 'Labe', t: 'Labe (řeka)' }, ['Elbe']);
    assert.ok(core.isAnswerMatch('labe', labe) && core.isAnswerMatch('Elbe', labe));
});

test('body podle nápověd a napsané odpovědi', () => {
    // 4 úrovně: popis, fotka, slepá mapa, fakta
    assert.deepEqual([1, 2, 3, 4].map(level => core.pointsFor(level, 4, false)), [4, 3, 2, 1]);
    assert.deepEqual([1, 2, 3, 4].map(level => core.pointsFor(level, 4, true)), [8, 6, 4, 2]);
    // Bez fotky jen 3 úrovně
    assert.deepEqual([1, 2, 3].map(level => core.pointsFor(level, 3, false)), [3, 2, 1]);
    assert.equal(core.formatPoints(1), '1 bod');
    assert.equal(core.formatPoints(3), '3 body');
    assert.equal(core.formatPoints(6), '6 bodů');
    assert.equal(core.formatPoints(0), '0 bodů');
});

test('série dní', () => {
    const results = {
        '2026-10-13': { correct: true },
        '2026-10-14': { correct: true },
        '2026-10-15': { correct: true },
        '2026-10-11': { correct: true }
    };
    assert.equal(core.computeStreak(results, '2026-10-16'), 3); // dnešek ještě neodehraný
    assert.equal(core.computeStreak({ ...results, '2026-10-16': { correct: true } }, '2026-10-16'), 4);
    assert.equal(core.computeStreak({ ...results, '2026-10-16': { correct: false } }, '2026-10-16'), 0);
    assert.equal(core.computeStreak({ '2026-02-28': { correct: true }, '2026-03-01': { correct: true } }, '2026-03-01'), 2);
});

test('text pro sdílení', () => {
    const topic = { title: 'Zeměpis', emoji: '🌍' };
    const text = core.buildShareText({
        appName: 'Mudrlant', topic, dayKey: '2026-10-16',
        result: { correct: true, points: 8, hintLevel: 1, levelCount: 4, typed: true }, streak: 4, url: 'https://example.org/'
    });
    assert.equal(text, 'Mudrlant · 🌍 Zeměpis · 16. 10. 2026\n✅ 8 bodů · nápověda 1/4 · napsáno\n🔥 Série: 4\nhttps://example.org/');
    const lost = core.buildShareText({ appName: 'Mudrlant', topic, dayKey: '2026-10-16', result: { correct: false, points: 0, hintLevel: 3, levelCount: 3 }, streak: 0, url: '' });
    assert.equal(lost, 'Mudrlant · 🌍 Zeměpis · 16. 10. 2026\n❌ tentokrát ne · nápověda 3/3\n🔥 Série: 0');
});

test('dlaždice mapy pokryjí výřez a bod je uprostřed', () => {
    const tiles = core.getTileLayout(50.087, 14.421, 5, 400, 224);
    assert.ok(tiles.length >= 2 && tiles.length <= 6);
    for (const tile of tiles) assert.match(tile.url, /^https:\/\/tile\.openstreetmap\.org\/5\/\d+\/\d+\.png$/);
    // Praha na zoomu 5 je v dlaždici x=17, y=10
    assert.ok(tiles.some(tile => tile.url.endsWith('/5/17/10.png')));
    const covered = (x, y) => tiles.some(t => x >= t.left && x < t.left + 256 && y >= t.top && y < t.top + 256);
    assert.ok(covered(0, 0) && covered(399, 223) && covered(200, 112));
    // Přes 180. poledník se čísla dlaždic přetočí
    const wrapped = core.getTileLayout(0, 179.9, 2, 600, 200);
    assert.ok(wrapped.some(tile => tile.url.startsWith('https://tile.openstreetmap.org/2/0/')));
});

test('seznam států odpovídá Wikidatům: unikátní ID a názvy', () => {
    assert.equal(new Set(core.COUNTRIES.map(c => c.id)).size, core.COUNTRIES.length);
    assert.equal(new Set(core.COUNTRIES.map(c => c.name)).size, core.COUNTRIES.length);
    assert.ok(core.COUNTRIES.every(c => /^Q\d+$/.test(c.id) && ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'].includes(c.continent)));
});

test('jako fotka projde jen skutečná fotka, ne vlajka, znak nebo mapa', () => {
    for (const name of ['Matterhorn_from_Zermatt.jpg', 'Sněžka_(2016).JPG', 'Plana_nad_Lužnicí.jpg', 'Malta_satellite_image.jpg']) {
        assert.equal(core.isRealPhoto(name), true, name);
    }
    for (const name of ['Flag_of_Greece.svg', 'Coat_of_arms_of_Prague.jpg', 'Greece_location_map.jpg', 'Karte_Bayern.jpg', 'Erb_Brna.png', 'EU-Greece.svg', undefined, '']) {
        assert.equal(core.isRealPhoto(name), false, String(name));
    }
});

// Věty ve stylu úvodů české Wikipedie: [ID státu, věta, co nesmí zůstat, co musí zůstat]
const COUNTRY_CASES = [
    ['Q884', 'Mandžanggul je jeskyně nacházející se v Jižní Koreji na ostrově Čedžu mezi městy Gimnyeong-ri a Gujwaeup.', /korej|koreji|jižní/i, /jeskyně/],
    ['Q884', 'Soul je hlavní město Jižní Koreje a leží na Korejském poloostrově.', /kore/i, /hlavní město/],
    ['Q884', 'Ostrov je největším jihokorejským ostrovem a oblíbeným cílem turistů.', /korej/i, /ostrov/],
    ['Q30', 'Yellowstone je národní park ve Spojených státech amerických, převážně ve státě Wyoming.', /spojen|americk|wyoming/i, /národní park/],
    ['Q30', 'Je to nejvyšší hora v USA a jedna z nejznámějších hor Severní Ameriky.', /\bUSA\b|ameri/i, /nejvyšší hora/],
    ['Q30', 'Řeka protéká severoamerickým kontinentem a vlévá se do Mexického zálivu.', /americk/i, /protéká/],
    ['Q145', 'Ben Nevis je nejvyšší hora Spojeného království a leží ve Skotsku ve Velké Británii.', /spojen|královst|británi/i, /nejvyšší hora/],
    ['Q183', 'Zugspitze je nejvyšší hora Německa, leží ve spolkové zemi Bavorsko na hranici s Rakouskem.', /němec|německ|bavorsk/i, /Rakouskem/],
    ['Q38', 'Etna je činná sopka na Sicílii v Itálii, nejvyšší činná sopka italského území.', /itál|ital/i, /činná sopka/],
    ['Q142', 'Lazurové pobřeží je pobřeží ve Francii, francouzská riviéra je známá letovisky.', /franc/i, /pobřeží/],
    ['Q41', 'Olymp je nejvyšší hora Řecka a podle řecké mytologie sídlo bohů.', /řeck|řeck/i, /mytologie/],
    ['Q148', "Jang-c'-ťiang je nejdelší řeka Číny a Čínské lidové republiky, protéká celou ČLR.", /čín|ČLR/i, /nejdelší řeka/],
    ['Q17', 'Fudži je nejvyšší hora Japonska a symbol japonské kultury.', /japon/i, /symbol/],
    ['Q668', 'Ganga je řeka v Indii, posvátná pro indické hinduisty.', /indi/i, /posvátná/],
    ['Q159', 'Bajkal je jezero na Sibiři v Rusku, nejhlubší jezero Ruské federace.', /rusk/i, /nejhlubší jezero/],
    ['Q96', 'Popocatépetl je činná sopka v Mexiku, druhá nejvyšší hora mexického území.', /mexi/i, /činná sopka/],
    ['Q16', 'Banff je národní park v Kanadě v provincii Alberta, nejstarší kanadský park.', /kanad|alberta/i, /národní park/],
    ['Q408', 'Uluru je skalní útvar v Austrálii, posvátný pro australské domorodce.', /austral|austrál/i, /skalní útvar/],
    ['Q155', 'Cukrová homole je hora v Brazílii a symbol brazilského města Rio.', /brazil|brazíl/i, /symbol/],
    ['Q79', 'Sinaj je poloostrov v Egyptě mezi Středozemním a Rudým mořem, patří egyptské vládě.', /egypt/i, /poloostrov/],
    ['Q1028', 'Atlas je pohoří v Maroku, nejvyšší vrchol marockého pohoří je Toubkal.', /marok|marock/i, /nejvyšší vrchol/],
    ['Q43', 'Ararat je hora na východě Turecka, nejvyšší hora tureckého území.', /turec/i, /nejvyšší hora/],
    ['Q664', 'Milford Sound je fjord na Novém Zélandu, nejznámější novozélandský fjord.', /zéland|zeland/i, /fjord/],
    ['Q298', 'Atacama je poušť v Chile, nejsušší místo chilského území.', /chil/i, /poušť/],
    ['Q419', 'Titicaca je jezero na hranici Peru a Bolívie, posvátné pro peruánské Inky.', /\bperu|peruán/i, /jezero.*pro /],
    ['Q213', 'Sněžka je nejvyšší hora Česka a České republiky, leží na hranici ČR s Polskem.', /česk|ČR/i, /Polskem/],
    ['Q252', 'Krakatoa je sopka v Indonésii, nejznámější indonéská sopka.', /indonés/i, /sopka/],
    ['Q881', 'Halong je záliv ve Vietnamu, symbol vietnamské krajiny.', /vietnam/i, /záliv/],
    ['Q924', 'Kilimandžáro leží v Tanzanii nedaleko hranice s Keňou.', /tanzan/i, /Keňou/],
    ['Q20', 'Geirangerfjord je fjord v Norsku, jeden z nejkrásnějších norských fjordů.', /norsk/i, /fjord/]
];

test('otázka na stát: v popisu nezůstane název ani přídavné jméno státu', () => {
    for (const [id, text, forbidden, required] of COUNTRY_CASES) {
        const country = core.COUNTRIES.find(c => c.id === id);
        const out = core.censorCountry(text, country.name, core.getCountryAliases([id]));
        assert.doesNotMatch(out, forbidden, `${country.name}: ${out}`);
        assert.match(out, required, `${country.name}: zakryto navíc: ${out}`);
    }
});

test('otázka na název: zakryje i odvozená přídavná jména', () => {
    const cases = [
        ['Praha', 'Praha je hlavní město. V Praze žije přes milion lidí, pražský hrad je dominantou.', /prah|praz|praž/i, /hlavní město/],
        ['Brno', 'Brno je druhé největší město, brněnská přehrada je oblíbená.', /brn/i, /přehrada/],
        ['Ústí nad Labem', 'Ústí nad Labem je statutární město, ústecký kraj leží na severu.', /úst|labem/i, /statutární město/],
        ['České Budějovice', 'České Budějovice jsou krajské město, budějovický pivovar je známý.', /budějovic|česk/i, /krajské město/],
        ['Peru', 'Peru je stát v Jižní Americe, peruánská kuchyně je pestrá a je známá pro ceviche.', /peru/i, / pro ceviche/]
    ];
    for (const [name, text, forbidden, required] of cases) {
        const out = core.censorName(text, name);
        assert.doesNotMatch(out, forbidden, `${name}: ${out}`);
        assert.match(out, required, `${name}: zakryto navíc: ${out}`);
    }
});

// Malá sada položek ve formátu data/<téma>.json (zde místa ze zeměpisu)
const COUNTRIES_TABLE = {
    Q213: { name: 'Česko', continent: 'EU', iso: '203' },
    Q183: { name: 'Německo', continent: 'EU', iso: '276' },
    Q40: { name: 'Rakousko', continent: 'EU', iso: '040' },
    Q36: { name: 'Polsko', continent: 'EU', iso: '616' },
    Q142: { name: 'Francie', continent: 'EU', iso: '250' },
    Q17: { name: 'Japonsko', continent: 'AS', iso: '392' },
    Q30: { name: 'Spojené státy americké', continent: 'NA', iso: '840' }
};
const place = (q, n, c, k, co, extra = {}) => ({ q, t: n, n, c, k, la: 50, lo: 15, ty: '', co, f: {}, ...extra });
const PLACES = [
    place('Q1085', 'Praha', 'mesto', 1, ['Q213'], { f: { pop: 1384732 }, g: ['cesko'] }),
    place('Q64', 'Berlín', 'mesto', 1, ['Q183'], { f: { pop: 3700000 } }),
    place('Q1741', 'Vídeň', 'mesto', 1, ['Q40'], { f: { pop: 1900000 } }),
    place('Q31487', 'Krakov', 'mesto', 1, ['Q36']),
    place('Q1490', 'Tokio', 'mesto', 1, ['Q17'], { f: { pop: 14000000 } }),
    place('Q14960', 'Brno', 'mesto', 0, ['Q213'], { f: { pop: 400000 }, g: ['cesko'] }),
    place('Q170424', 'Sněžka', 'hora', 1, ['Q213', 'Q36'], { f: { elev: 1603 }, g: ['cesko'] }),
    place('Q39231', 'Fudži', 'hora', 1, ['Q17'], { f: { elev: 3776 } }),
    place('Q243', 'Eiffelova věž', 'stavba', 1, ['Q142'], { f: { h: 330, year: 1889 } }),
    place('Q1288', 'Česká Lípa', 'mesto', 0, ['Q213'], { g: ['cesko'] }),
    place('Q213', 'Česko', 'stat', 1, ['Q213'], { f: { cap: 'Praha', area: 78871, pop: 10900555 }, g: ['cesko'] })
];
const continentOf = (item) => core.getContinent(item, COUNTRIES_TABLE);

test('okruhy: celé téma, kategorie a zvláštní okruhy; známost', () => {
    assert.equal(core.filterItems(PLACES).length, PLACES.length);
    assert.deepEqual(core.filterItems(PLACES, { tier: 'known', collection: 'c:mesto' }).map(p => p.n), ['Praha', 'Berlín', 'Vídeň', 'Krakov', 'Tokio']);
    assert.deepEqual(core.filterItems(PLACES, { collection: 'cesko' }).map(p => p.n), ['Praha', 'Brno', 'Sněžka', 'Česká Lípa', 'Česko']);
    assert.deepEqual(core.filterItems(PLACES, { tier: 'known', collection: 'cesko' }).map(p => p.n), ['Praha', 'Sněžka', 'Česko']);
    assert.equal(core.inCollection(PLACES[0], null), true);
    assert.equal(core.inCollection(PLACES[0], 'c:hora'), false);
});

test('řazení okruhu: podle názvu česky, nebo podle faktu; bez údaje na konec', () => {
    assert.deepEqual(core.sortItems(PLACES.filter(p => p.c === 'mesto')).map(p => p.n), ['Berlín', 'Brno', 'Česká Lípa', 'Krakov', 'Praha', 'Tokio', 'Vídeň']);
    assert.deepEqual(core.sortItems(PLACES.filter(p => p.c === 'mesto'), { by: 'pop', desc: true }).map(p => p.n),
        ['Tokio', 'Berlín', 'Vídeň', 'Praha', 'Brno', 'Česká Lípa', 'Krakov']);
    assert.deepEqual(core.sortItems(PLACES.filter(p => p.c === 'hora'), { by: 'elev' }).map(p => p.n), ['Sněžka', 'Fudži']);
});

test('náhodná položka: nejdřív kategorie, nedávno hrané se neopakují', () => {
    const rng = core.createSeededRandom('vyber');
    const counts = {};
    for (let i = 0; i < 400; i++) {
        const picked = core.pickItem(PLACES, rng);
        counts[picked.c] = (counts[picked.c] || 0) + 1;
    }
    // Čtyři kategorie zhruba stejně často, i když měst je v sadě nejvíc
    assert.deepEqual(Object.keys(counts).sort(), ['hora', 'mesto', 'stat', 'stavba']);
    assert.ok(Object.values(counts).every(count => count > 60), JSON.stringify(counts));
    // Nedávno hrané se přeskočí, dokud je z čeho vybírat
    const mountains = PLACES.filter(p => p.c === 'hora');
    for (let i = 0; i < 20; i++) assert.equal(core.pickItem(mountains, rng, ['Q170424']).n, 'Fudži');
    assert.ok(['Sněžka', 'Fudži'].includes(core.pickItem(mountains, rng, ['Q170424', 'Q39231']).n));
    // Stejné semínko a pořadí kategorií = stejná dnešní otázka pro všechny
    const order = ['stat', 'mesto', 'hora', 'stavba'];
    const a = core.pickItem(PLACES, core.createSeededRandom('geo-kviz-2026-10-19'), [], order);
    const b = core.pickItem(PLACES, core.createSeededRandom('geo-kviz-2026-10-19'), [], order);
    assert.equal(a.q, b.q);
});

test('možnosti názvu: stejná kategorie, přednostně stejná skupina a známost; nesou ID', () => {
    const choices = core.buildItemChoices(PLACES[0], PLACES, core.createSeededRandom('a'), continentOf);
    assert.equal(choices.length, 4);
    assert.equal(choices.filter(c => c.correct).length, 1);
    assert.equal(choices.find(c => c.correct).label, 'Praha');
    // Známá evropská města, ne Tokio, Brno ani hora
    assert.deepEqual(choices.filter(c => !c.correct).map(c => c.label).sort(), ['Berlín', 'Krakov', 'Vídeň']);
    assert.ok(choices.every(c => PLACES.find(p => p.q === c.id).n === c.label));
    // Málo položek v kategorii: doplní se z čeho jde a možnosti se neopakují
    const few = core.buildItemChoices(PLACES[7], PLACES, core.createSeededRandom('b'), continentOf);
    assert.deepEqual(few.map(c => c.label).sort(), ['Fudži', 'Sněžka']);
});

test('možnosti názvu: přednost má stejný typ', () => {
    const water = [
        place('Q1', 'Bospor', 'jezero', 1, ['Q213'], { ty: 'průliv' }),
        place('Q2', 'Dardanely', 'jezero', 1, [], { ty: 'průliv' }),
        place('Q3', 'Gibraltarský průliv', 'jezero', 0, [], { ty: 'průliv' }),
        place('Q4', 'Lamanšský průliv', 'jezero', 1, ['Q142'], { ty: 'průliv' }),
        place('Q5', 'Bajkal', 'jezero', 1, ['Q213'], { ty: 'jezero' }),
        place('Q6', 'Lipno', 'jezero', 1, ['Q213'], { ty: 'přehradní nádrž' })
    ];
    const choices = core.buildItemChoices(water[0], water, core.createSeededRandom('c'), continentOf);
    assert.deepEqual(choices.map(c => c.label).sort(), ['Bospor', 'Dardanely', 'Gibraltarský průliv', 'Lamanšský průliv']);
});

test('možnosti státu: jiné státy ze stejného kontinentu, s ID', () => {
    const choices = core.buildCountryChoices('Q183', COUNTRIES_TABLE, core.createSeededRandom('x'));
    assert.equal(choices.length, 4);
    assert.equal(choices.find(c => c.correct).label, 'Německo');
    const european = ['Česko', 'Rakousko', 'Polsko', 'Francie'];
    assert.ok(choices.filter(c => !c.correct).every(c => european.includes(c.label)));
    assert.ok(choices.every(c => COUNTRIES_TABLE[c.id] && COUNTRIES_TABLE[c.id].name === c.label));
});

test('napsaná špatná odpověď: která jiná položka nebo stát to je', () => {
    const prague = PLACES[0];
    assert.equal(core.findAnswerItem('Viden', prague, PLACES), 'Q1741');
    assert.equal(core.findAnswerItem('fudzi', prague, PLACES), 'Q39231', 'i z jiné kategorie');
    assert.equal(core.findAnswerItem('Praha', prague, PLACES), null, 'správná položka se nehledá');
    assert.equal(core.findAnswerItem('Atlantida', prague, PLACES), null);
    assert.equal(core.findAnswerCountry('USA', ['Q213'], COUNTRIES_TABLE), 'Q30');
    assert.equal(core.findAnswerCountry('rakousko', ['Q213'], COUNTRIES_TABLE), 'Q40');
    assert.equal(core.findAnswerCountry('Česká republika', ['Q213'], COUNTRIES_TABLE), null);
});

test('seznam chyb: chyba na začátek, správná odpověď ho odebere', () => {
    let mistakes = core.updateMistakes([], 'zemepis:Q1', false);
    mistakes = core.updateMistakes(mistakes, 'historie:Q2', false);
    mistakes = core.updateMistakes(mistakes, 'zemepis:Q1', false);
    assert.deepEqual(mistakes, ['zemepis:Q1', 'historie:Q2']);
    assert.deepEqual(core.updateMistakes(mistakes, 'zemepis:Q1', true), ['historie:Q2']);
    assert.deepEqual(core.updateMistakes(mistakes, 'zemepis:Q3', true), ['zemepis:Q1', 'historie:Q2']);
    assert.equal(core.updateMistakes(Array.from({ length: 300 }, (_, i) => `zemepis:Q${i}`), 'zemepis:Q999', false).length, 300);
});

test('pořadí nápověd: fotka, obrazová nápověda, fakta; chybějící se vynechá', () => {
    assert.deepEqual(core.getHintSteps({ hasPhoto: true, hasVisual: true, hasFacts: true }), ['photo', 'visual', 'facts']);
    assert.deepEqual(core.getHintSteps({ hasPhoto: false, hasVisual: true, hasFacts: true }), ['visual', 'facts']);
    assert.deepEqual(core.getHintSteps({ hasPhoto: true, hasVisual: false, hasFacts: false }), ['photo']);
});

test('fakta: české formátování, chybějící údaje se vynechají, rok i před naším letopočtem', () => {
    const formats = [['pop', 'Počet obyvatel', core.formatPopulation], ['h', 'Výška', v => `${core.formatNumber(v)} m`], ['year', 'Vznik', core.formatYear]];
    const asText = (list) => list.map(fact => `${fact.label}: ${fact.value}`.replace(/\u00a0/g, ' '));
    assert.deepEqual(asText(core.formatFacts({ f: { pop: 10900555, h: 0, year: 1889 } }, formats)), ['Počet obyvatel: 10,9 mil.', 'Vznik: 1889']);
    assert.deepEqual(asText(core.formatFacts({ f: { pop: 15200, year: -3800 } }, formats)), ['Počet obyvatel: 15 200', 'Vznik: 3800 př. n. l.']);
    assert.deepEqual(asText(core.formatFacts({ f: { year: 82 } }, formats)), ['Vznik: 82 n. l.']);
});

test('šířka slepé mapy: základ, nebo podle rozlohy či délky', () => {
    assert.equal(core.getMapSpan({}, 24), 24);
    assert.equal(core.getMapSpan({ area: 78871 }, 14), 15);
    assert.equal(core.getMapSpan({ area: 17098246 }, 14), 120);
    assert.equal(core.getMapSpan({ area: 316 }, 14), 14);
    assert.equal(core.getMapSpan({ area: 165250000 }, 30), 120);
    assert.equal(core.getMapSpan({ len: 6400 }, 24), 46);
    assert.equal(core.getMapSpan({ len: 430 }, 24), 24);
});

test('slepá mapa: místo uprostřed, mimo výřez nic, zvýraznění státu, přes 180. poledník', () => {
    const square = (id, lon, lat, size) => ({ id, r: [[lon, lat, lon + size, lat, lon + size, lat + size, lon, lat + size].map(v => v * 10)] });
    const world = { countries: [square('203', 12, 48, 6), square('392', 130, 30, 10), square('242', 178, -18, 3)] };
    const view = { lat: 51, lon: 15, spanLon: 24, width: 400, height: 240, highlightIso: '203' };
    const shapes = core.buildBlindMap(world, view);
    assert.deepEqual(shapes.map(s => s.id), ['203']);
    assert.equal(shapes[0].highlight, true);
    // Obdélník 12–18° E je souměrně kolem středu 15° E: x od 150 do 250
    const xs = [...shapes[0].d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => Number(m[1]));
    assert.deepEqual([Math.min(...xs), Math.max(...xs)], [150, 250]);
    // Fidži u 180. poledníku se ukáže i při pohledu z druhé strany
    const pacific = core.buildBlindMap(world, { lat: -17, lon: -179, spanLon: 30, width: 300, height: 200 });
    assert.deepEqual(pacific.map(s => s.id), ['242']);
    assert.equal(pacific[0].highlight, false);
});

test('odkaz na náhled fotky z Wikimedia Commons', () => {
    // Hash je MD5 názvu souboru s podtržítky (počítá ho skript sady míst)
    const hash = require('node:crypto').createHash('md5').update('Charles_Bridge,_Prague.jpg').digest('hex').slice(0, 2);
    assert.equal(core.commonsPhotoUrl('Charles Bridge, Prague.jpg', hash),
        `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash}/Charles_Bridge%2C_Prague.jpg/960px-Charles_Bridge%2C_Prague.jpg`);
    assert.equal(core.commonsPhotoUrl('Karlův most.jpg', 'ab', 500), 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Karl%C5%AFv_most.jpg/500px-Karl%C5%AFv_most.jpg');
    // Kresba SVG má náhled PNG; původní soubor bez náhledu (malé obrázky Commons nezvětší)
    assert.equal(core.commonsPhotoUrl('Mapa.svg', 'cd', 500), 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mapa.svg/500px-Mapa.svg.png');
    assert.equal(core.commonsFileUrl('Malá mapa.png', 'cd'), 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Mal%C3%A1_mapa.png');
});

test('století: kladná i před naším letopočtem, popisek', () => {
    assert.equal(core.centuryOf(1348), 14);
    assert.equal(core.centuryOf(1400), 14);
    assert.equal(core.centuryOf(1401), 15);
    assert.equal(core.centuryOf(1), 1);
    assert.equal(core.centuryOf(-44), -1);
    assert.equal(core.centuryOf(-753), -8);
    assert.equal(core.centuryLabel(14), '14. století');
    assert.equal(core.centuryLabel(-8), '8. století př. n. l.');
});

test('časová osa: pruhy uvnitř šířky, rozumné značky, známé události bez vlastních roků a jmen', () => {
    const anchors = [[1348, 'založení Karlovy univerzity', 1], [1415, 'upálení Jana Husa', 1], [1306, 'vymření Přemyslovců', 1], [1347, 'morová epidemie'], [1453, 'pád Konstantinopole'], [1066, 'bitva u Hastingsu']];
    const layout = core.buildTimeline({ spans: [{ kind: 'life', from: 1316, to: 1378 }, { kind: 'reign', from: 1346, to: 1378 }], points: [], hide: 'Karel IV.', anchors }, 400);
    assert.ok(layout.start < 1316 && layout.end > 1378);
    for (const bar of layout.bars) assert.ok(bar.x >= 0 && bar.x + bar.width <= 400);
    assert.ok(layout.bars[0].width > layout.bars[1].width);
    assert.ok(layout.ticks.length >= 2 && layout.ticks.length <= 5);
    assert.ok(core.buildTimeline({ spans: [], points: [-44] }, 360).ticks.length <= 4);
    assert.ok(layout.ticks.every(tick => tick.x >= 0 && tick.x <= 400));
    assert.ok(layout.anchors.length <= 3);
    assert.ok(layout.anchors.every(anchor => anchor.year < layout.start || anchor.year > layout.end ? false : true));
    // Založení Karlovy univerzity by prozradilo Karla IV.
    assert.ok(!layout.anchors.some(anchor => /Karl/.test(anchor.label)));
    // Blízké dějiny mají přednost před světovými, události mimo osu se nevyberou
    assert.deepEqual(layout.anchors.map(anchor => anchor.year), [1306, 1415]);
    assert.deepEqual(core.buildTimeline({ spans: [{ kind: 'reign', from: 1346, to: 1378 }], anchors: [[1347, 'morová epidemie']] }, 400).anchors.map(a => a.label), ['1347 morová epidemie']);
    assert.deepEqual(core.buildTimeline({ spans: [{ kind: 'reign', from: 1346, to: 1378 }] }, 400).anchors, [], 'bez událostí od tématu žádné');
    // Bod před naším letopočtem a popisky let
    const ancient = core.buildTimeline({ spans: [], points: [-44], hide: 'Atentát', anchors: [[-44, 'zavraždění Caesara']] }, 360);
    assert.equal(ancient.points.length, 1);
    assert.ok(ancient.ticks.some(tick => /př\. n\. l\./.test(tick.label)));
    assert.ok(!ancient.anchors.some(anchor => anchor.year === -44));
});
