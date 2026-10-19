// Testy čisté logiky kvízu. Spuštění: npm test (stačí Node 20+, žádné závislosti)
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

test('poloha v Česku podle hranice, ne obdélníku', () => {
    assert.equal(core.isInsideCzechia(50.087, 14.421), true); // Praha
    assert.equal(core.isInsideCzechia(50.224, 12.195), true); // Aš
    assert.equal(core.isInsideCzechia(50.736, 15.740), true); // Sněžka
    assert.equal(core.isInsideCzechia(51.050, 13.738), false); // Drážďany
    assert.equal(core.isInsideCzechia(48.574, 13.461), false); // Pasov
    assert.equal(core.isInsideCzechia(49.223, 18.740), false); // Žilina
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

test('přijímané odpovědi pro stát obsahují i běžné názvy', () => {
    const accepted = core.getAcceptedAnswers({ quizType: 'location', countryIds: ['Q30'], countryNames: ['Spojené státy americké'] });
    assert.ok(core.isAnswerMatch('USA', accepted));
    assert.ok(core.isAnswerMatch('spojene staty americke', accepted));
    const czech = core.getAcceptedAnswers({ quizType: 'location', countryIds: ['Q213'], countryNames: ['Česko'] });
    assert.ok(core.isAnswerMatch('Česká republika', czech));
});

test('možnosti názvu: 4 různé, jedna správná, bez závorek', () => {
    const rng = core.createSeededRandom('test');
    const pools = {
        notable: [{ title: 'Lysá hora', category: 'Hora / Pohoří' }, { title: 'Praděd', category: 'Hora / Pohoří' }],
        all: [{ title: 'Nová Ves (okres Praha)', category: 'Město / Sídlo' }]
    };
    const choices = core.buildNameChoices('Sněžka (hora)', 'Hora / Pohoří', pools, rng);
    assert.equal(choices.length, 4);
    assert.equal(choices.filter(c => c.correct).length, 1);
    assert.equal(choices.find(c => c.correct).label, 'Sněžka');
    assert.equal(new Set(choices.map(c => core.normalizeAnswer(c.label))).size, 4);
    assert.ok(choices.some(c => c.label === 'Lysá hora') && choices.some(c => c.label === 'Praděd'));
});

test('možnosti státu: správný stát a jiné státy ze stejného kontinentu', () => {
    const choices = core.buildCountryChoices(['Q39', 'Q40'], ['Švýcarsko', 'Rakousko'], core.createSeededRandom('x'));
    assert.equal(choices.length, 4);
    assert.equal(choices.find(c => c.correct).label, 'Švýcarsko');
    const wrong = choices.filter(c => !c.correct).map(c => c.label);
    assert.ok(!wrong.includes('Rakousko'));
    const europe = core.COUNTRIES.filter(c => c.continent === 'EU').map(c => c.name);
    assert.ok(wrong.every(name => europe.includes(name)));
});

test('body podle nápověd a napsané odpovědi', () => {
    assert.equal(core.pointsFor(1, false), 3);
    assert.equal(core.pointsFor(2, false), 2);
    assert.equal(core.pointsFor(3, false), 1);
    assert.equal(core.pointsFor(1, true), 6);
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
    const text = core.buildShareText({
        dayKey: '2026-10-16', category: 'Hora / Pohoří',
        result: { correct: true, points: 6, hintLevel: 1, typed: true }, streak: 4, url: 'https://example.org/'
    });
    assert.equal(text, 'Geo Kvíz · 16. 10. 2026\n🏔️ Hora / Pohoří\n✅ 6 bodů · nápovědy 1/3 · napsáno\n🔥 Série: 4\nhttps://example.org/');
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

test('na stát se neptá u státu ani když ho prozradí název', () => {
    const base = { ownQid: 'Q1', countrySource: 'P17' };
    // Řecko má jako stát samo sebe
    assert.equal(core.isCountryItself({ ...base, title: 'Řecko', ownQid: 'Q41', countryIds: ['Q41'], countryNames: ['Řecko'] }), true);
    assert.equal(core.canAskForCountry({ ...base, title: 'Řecko', ownQid: 'Q41', countryIds: ['Q41'], countryNames: ['Řecko'] }), false);
    // Shoda názvu i bez shody ID
    assert.equal(core.isCountryItself({ ...base, title: 'Island (stát)', countryIds: ['Q189'], countryNames: ['Island'] }), true);
    // Název prozradí stát
    assert.equal(core.canAskForCountry({ ...base, title: 'Česká Lípa', countryIds: ['Q213'], countryNames: ['Česko'] }), false);
    assert.equal(core.canAskForCountry({ ...base, title: 'Řecké ostrovy', countryIds: ['Q41'], countryNames: ['Řecko'] }), false);
    // Běžné místo
    assert.equal(core.canAskForCountry({ ...base, title: 'Bavorsko', countryIds: ['Q183'], countryNames: ['Německo'] }), true);
    assert.equal(core.canAskForCountry({ ...base, title: 'Matterhorn', countryIds: ['Q39', 'Q38'], countryNames: ['Švýcarsko', 'Itálie'] }), true);
    // Bez státu z Wikidat (jen kontinent) se na stát neptá
    assert.equal(core.canAskForCountry({ ...base, title: 'Atlantik', countrySource: 'P30', countryIds: ['Q49'], countryNames: ['Severní Amerika'] }), false);
});

test('jako fotka projde jen skutečná fotka, ne vlajka, znak nebo mapa', () => {
    for (const name of ['Matterhorn_from_Zermatt.jpg', 'Sněžka_(2016).JPG', 'Plana_nad_Lužnicí.jpg', 'Malta_satellite_image.jpg']) {
        assert.equal(core.isRealPhoto(name), true, name);
    }
    for (const name of ['Flag_of_Greece.svg', 'Coat_of_arms_of_Prague.jpg', 'Greece_location_map.jpg', 'Karte_Bayern.jpg', 'Erb_Brna.png', 'EU-Greece.svg', undefined, '']) {
        assert.equal(core.isRealPhoto(name), false, String(name));
    }
});

test('satelitní dlaždice NASA mají pořadí z/y/x a zoom podle nápovědy', () => {
    const tiles = core.getTileLayout(50.087, 14.421, core.SATELLITE_ZOOM_BY_HINT[1], 400, 224, core.SATELLITE_TILES);
    assert.ok(tiles.every(tile => tile.url.startsWith('https://gibs.earthdata.nasa.gov/') && tile.url.endsWith('.jpeg')));
    // Praha na zoomu 7: x = 69, y = 43 → v adrese .../7/43/69.jpeg
    assert.ok(tiles.some(tile => tile.url.endsWith('/7/43/69.jpeg')));
    assert.deepEqual([1, 2, 3].map(level => core.SATELLITE_ZOOM_BY_HINT[level]), [7, 5, 3]);
});
