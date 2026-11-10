// Otázka „Ukaž na mapě“ (question-map.js): výřezy a zobrazení, výběr položek na skutečných datech, body podle vzdálenosti,
// kdy otázka přijde a mapová data (data/mapa.json) včetně zapojení do aplikace a práce bez internetu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const MapQuestion = require('../question-map.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const mapData = JSON.parse(read('data/mapa.json'));
const countries = JSON.parse(read('data/countries.json')).countries;
const zemepis = JSON.parse(read('data/zemepis.json'));
const sport = JSON.parse(read('data/sport.json'));
core.setCountries(countries);
const zemepisCtx = { topic: { id: 'zemepis' }, items: zemepis.items, countries };
const sportCtx = { topic: { id: 'sport' }, items: sport.items, countries };
const place = (n, c, la, lo, extra = {}) => ({ q: `T-${n}`, n, t: n, c, k: 1, la, lo, ty: '', ...extra });
const byName = (name, category) => zemepis.items.find(item => item.n === name && (!category || item.c === category));

test('výřezy: delší strana 1000 jednotek (svět 8000), zobrazení jde tam i zpět, data map odpovídají mapám', () => {
    // V datech jen mapy, na kterých se hledá: svět a Česko; kontinenty určují jen poloměry bodů
    assert.deepEqual(Object.keys(mapData.regions).sort(), ['cesko', 'svet']);
    for (const region of [...MapQuestion.REGIONS, MapQuestion.WORLD]) {
        const frame = MapQuestion.frameOf(region);
        assert.equal(Math.max(frame.width, frame.height), region.units || 1000, region.id);
        assert.ok(Math.min(frame.width, frame.height) > (region.units ? 3000 : 500), `${region.id}: výřez není nudle`);
        const stored = mapData.regions[region.id];
        if (stored) {
            assert.deepEqual(stored.frame, [frame.width, frame.height], `${region.id}: data/mapa.json je ze stejných výřezů (npm run build:mapa)`);
            assert.deepEqual(stored.center, region.center);
        }
        // Krajní místa oblasti jsou ve výřezu a zpětné zobrazení vrátí stejné místo
        for (const [lat, lon] of region.bounds) {
            assert.ok(MapQuestion.insideFrame(region, lat, lon), `${region.id}: ${lat},${lon} ve výřezu`);
            const [x, y] = frame.toMap(lat, lon);
            const back = frame.fromMap(x, y);
            assert.ok(Math.abs(back.lat - lat) < 1e-6 && Math.abs(((back.lon - lon + 540) % 360) - 180) < 1e-6, `${region.id}: ${lat},${lon} tam i zpět`);
        }
    }
    // Diagonála určuje body: Česko stovky km, kontinenty tisíce
    assert.ok(MapQuestion.frameOf('cesko').diagonalKm > 450 && MapQuestion.frameOf('cesko').diagonalKm < 800);
    for (const id of ['evropa', 'afrika', 'asie', 'severni-amerika', 'jizni-amerika', 'oceanie']) {
        const km = MapQuestion.frameOf(id).diagonalKm;
        assert.ok(km > 5000 && km < 20000, `${id}: ${km} km`);
    }
});

test('oblast: Česko podle státu (i stadion jen s názvem státu), jinak kontinent; místa mimo výřez žádnou', () => {
    const regionOf = (item) => (MapQuestion.regionFor(item, countries) || {}).id || null;
    assert.equal(regionOf(byName('Brno', 'mesto')), 'cesko');
    assert.equal(regionOf(byName('Sněžka', 'hora')), 'cesko', 'hora na hranici s Polskem je na mapě Česka');
    assert.equal(regionOf(byName('Paříž', 'mesto')), 'evropa');
    assert.equal(regionOf(byName('Reykjavík', 'mesto')), 'evropa', 'Island do Evropy patří');
    assert.equal(regionOf(byName('Káhira', 'mesto')), 'afrika');
    assert.equal(regionOf(byName('Tokio', 'mesto')), 'asie');
    assert.equal(regionOf(byName('New York', 'mesto')), 'severni-amerika');
    assert.equal(regionOf(byName('Rio de Janeiro', 'mesto')), 'jizni-amerika');
    assert.equal(regionOf(byName('Sydney', 'mesto')), 'oceanie');
    assert.equal(regionOf(byName('Honolulu', 'mesto')), null, 'Havaj je mimo výřez Severní Ameriky');
    assert.equal(regionOf({ q: 'x', la: 50, lo: 15 }), 'evropa', 'bez státu kontinent podle polohy');
    assert.equal(regionOf({ q: 'x', la: 0, lo: -140 }), null, 'uprostřed Tichého oceánu žádná oblast');
    assert.equal(regionOf({ q: 'x', la: -77, lo: 161 }), null, 'Antarktida také ne');
    const venue = (land, la, lo) => ({ q: 'v', n: 'Stadion', c: 'sportoviste', ty: 'stadion', la, lo, f: { land } });
    assert.equal(regionOf(venue('Česko', 50.1, 14.4)), 'cesko');
    assert.equal(regionOf(venue('Španělsko', 41.38, 2.12)), 'evropa', 'Camp Nou: kontinent podle polohy');
});

test('položky: body, plochy a čáry (moře, souostroví, pohoří, řeky, státy jen s obrysem), bez stavby ve velkém městě v Česku a bez dvojznačných jmen', () => {
    const ctx = { topic: { id: 'zemepis' }, items: [], countries };
    const CZ = ['Q213'];
    assert.ok(MapQuestion.candidate(place('Testov', 'mesto', 50, 15, { co: CZ }), ctx));
    assert.ok(MapQuestion.candidate(place('Karlštejn', 'stavba', 49.94, 14.19, { co: CZ, ty: 'hrad' }), ctx));
    assert.ok(MapQuestion.candidate(place('Sněžka', 'hora', 50.74, 15.74, { co: CZ, ty: 'hora' }), ctx));
    assert.equal(MapQuestion.candidate(place('Krkonoše', 'hora', 50.7, 15.6, { co: CZ, ty: 'pohoří' }), ctx, { shapes: {} }), null, 'pohoří bez obrysu ne');
    assert.equal(MapQuestion.candidate(place('Vltava', 'reka', 50.3, 14.5, { co: CZ, ty: 'řeka' }), ctx, { shapes: {} }), null, 'řeka bez čáry ne');
    assert.ok(MapQuestion.candidate(place('Vltava', 'reka', 50.3, 14.5, { co: CZ, ty: 'řeka' }), ctx, { shapes: { 'T-Vltava': '~48800,14000,1500,400' } }), 'řeka s čárou ano');
    assert.equal(MapQuestion.candidate(place('Severní moře', 'jezero', 56, 3, { co: ['Q20'], ty: 'moře' }), ctx, { shapes: {} }), null);
    assert.equal(MapQuestion.candidate(place('Baleáry', 'ostrov', 39.5, 3, { co: ['Q29'], ty: 'souostroví' }), ctx, { shapes: {} }), null);
    assert.ok(MapQuestion.candidate(place('Baleáry', 'ostrov', 39.5, 3, { co: ['Q29'], ty: 'souostroví' }), ctx, { shapes: { 'T-Baleáry': '39000,2000,0,2000,1000,0' } }), 's obrysem ano');
    assert.equal(MapQuestion.candidate(place('Česko', 'stat', 49.8, 15.5, { co: CZ }), ctx), null);
    assert.equal(MapQuestion.candidate(place('Prašná brána', 'stavba', 50.087, 14.428, { co: CZ, ty: 'brána' }), ctx), null, 'v Praze = jen „kde je Praha“');
    assert.ok(MapQuestion.candidate(place('Praha', 'mesto', 50.083, 14.42, { co: CZ }), ctx), 'samo velké město ano');
    assert.equal(MapQuestion.candidate(place('Dunaj', 'reka', 48, 17, { co: ['Q40'] }), { ...ctx, topic: { id: 'historie' } }), null, 'jiná témata ne');
    // Dvojznačné jméno: stejný druh daleko od sebe ne, jiný druh (město × řeka) nevadí
    const smrkJizera = place('Smrk', 'hora', 50.89, 15.27, { co: CZ, ty: 'hora' });
    const smrkBeskydy = { ...place('Smrk', 'hora', 49.5, 18.37, { co: CZ, ty: 'hora' }), q: 'T-Smrk-2' };
    const moskvaCity = place('Moskva', 'mesto', 55.75, 37.62, { co: ['Q159'] });
    const moskvaRiver = { ...place('Moskva', 'reka', 55.08, 38.85, { co: ['Q159'], ty: 'řeka' }), q: 'T-Moskva-2' };
    const items = [smrkJizera, smrkBeskydy, moskvaCity, moskvaRiver];
    assert.equal(MapQuestion.candidate(smrkJizera, { ...ctx, items }), null);
    assert.ok(MapQuestion.candidate(moskvaCity, { ...ctx, items }));
});

test('skutečná data: tisíce míst ze zeměpisu a stovky stadionů, všechna na nakreslené pevnině uvnitř výřezu', () => {
    const counts = {};
    const summary = [];
    for (const [topicId, ctx] of [['zemepis', zemepisCtx], ['sport', sportCtx]]) {
        let total = 0;
        for (const item of ctx.items) {
            const question = MapQuestion.buildQuestion(item, ctx, mapData);
            if (!question) continue;
            total++;
            counts[question.map.region] = (counts[question.map.region] || 0) + 1;
            assert.equal(question.type, 'map');
            assert.ok(MapQuestion.insideFrame(MapQuestion.REGION_BY_ID[question.map.region], question.map.lat, question.map.lon));
            assert.ok(question.map.full > 0 && question.map.zero > question.map.full);
            assert.deepEqual(question.choices, []);
            assert.match(question.title, /^Kde (leží|stojí) .+\?$/);
        }
        summary.push(`${topicId}: ${total}`);
        assert.ok(total >= (topicId === 'zemepis' ? 2400 : 300), `${topicId}: ${total} otázek na mapě`);
    }
    for (const region of MapQuestion.REGIONS) assert.ok(counts[region.id] >= 40, `${region.id}: ${counts[region.id]} míst`);
    // Hledá se na mapě světa (neprozradí kontinent), místa v Česku na mapě Česka
    assert.equal(MapQuestion.mapRegionOf('evropa').id, 'svet');
    assert.equal(MapQuestion.mapRegionOf('cesko').id, 'cesko');
    assert.ok(counts.cesko >= 300, 'Česko má stovky míst');
    // Ostrov, který na mapě není (Capri do 1:50m nepatří), se neptá; Kréta a Mallorca ano
    assert.ok(MapQuestion.buildQuestion(byName('Kréta', 'ostrov'), zemepisCtx, mapData));
    assert.ok(MapQuestion.buildQuestion(byName('Mallorca', 'ostrov'), zemepisCtx, mapData));
    assert.equal(MapQuestion.buildQuestion(byName('Capri', 'ostrov'), zemepisCtx, mapData), null);
    assert.equal(MapQuestion.buildQuestion(byName('Brno', 'mesto'), zemepisCtx, null), null, 'bez mapových dat žádná otázka');
    const frame = MapQuestion.frameOf('svet');
    assert.equal(MapQuestion.onDrawnLand(mapData.regions.svet, frame, 48.86, 2.35), true, 'Paříž na pevnině');
    assert.equal(MapQuestion.onDrawnLand(mapData.regions.svet, frame, 45, -20), false, 'Atlantik ne');
    assert.equal(MapQuestion.onDrawnLand(mapData.regions.svet, frame, -17.8, 178), true, 'Fidži u 180. poledníku');
    // Kam hráč klepl: stát (česky), na mapě Česka kraj; moře nic
    assert.equal(MapQuestion.areaAt(mapData.regions.svet, frame, 14.5, 100.2), 'Thajsko');
    assert.equal(MapQuestion.areaAt(mapData.regions.svet, frame, 11.55, 104.9), 'Kambodža');
    assert.equal(MapQuestion.areaAt(mapData.regions.svet, frame, 64, -45), 'Grónsko', 'i závislá území česky');
    assert.equal(MapQuestion.areaAt(mapData.regions.svet, frame, 45, -20), null);
    assert.equal(MapQuestion.areaAt(mapData.regions.cesko, MapQuestion.frameOf('cesko'), 49.19, 16.6), 'Jihomoravský kraj');
    assert.equal(MapQuestion.areaAt(mapData.regions.cesko, MapQuestion.frameOf('cesko'), 50.08, 14.42), 'Praha');
    console.log(`  otázky na mapě: ${summary.join(', ')}; ${JSON.stringify(counts)}`);
});

test('otázka je čistá funkce položky (stejná pro všechny hráče) a ptá se česky', () => {
    const brno = byName('Brno', 'mesto');
    const first = MapQuestion.buildQuestion(brno, zemepisCtx, mapData);
    assert.deepEqual(first, MapQuestion.buildQuestion(brno, zemepisCtx, mapData));
    assert.deepEqual(first.map, { region: 'cesko', view: 'cesko', lat: brno.la, lon: brno.lo, ...MapQuestion.radiiFor(brno, MapQuestion.REGION_BY_ID.cesko) });
    assert.equal(first.title, 'Kde leží Brno?');
    assert.equal(first.answerLabel, 'Brno');
    assert.equal(MapQuestion.titleFor({ n: 'Karlštejn', c: 'stavba', ty: 'hrad' }), 'Kde stojí Karlštejn?');
    assert.equal(MapQuestion.titleFor({ n: 'Machu Picchu', c: 'stavba', ty: 'archeologická lokalita' }), 'Kde leží Machu Picchu?');
    assert.equal(MapQuestion.titleFor({ n: 'Niagarské vodopády', c: 'priroda', ty: 'vodopád' }), 'Kde leží Niagarské vodopády?');
    assert.equal(MapQuestion.titleFor({ n: 'Camp Nou', c: 'sportoviste', ty: 'stadion' }), 'Kde stojí Camp Nou?');
});

test('body: plné do 3 % diagonály, pak ubývají do nuly na 20 %; celé číslo 0…max, psaní dvojnásobek', () => {
    const cz = MapQuestion.radiiFor({ c: 'mesto' }, 'cesko');
    const diagonal = MapQuestion.frameOf('cesko').diagonalKm;
    assert.equal(cz.full, MapQuestion.roundKm(diagonal * 0.03));
    assert.equal(cz.zero, MapQuestion.roundKm(diagonal * 0.2));
    // Kulaté hranice: hráč vidí „do 200 km“, ne „do 222 km“
    assert.deepEqual([3, 18, 222, 335, 1491, 2236].map(MapQuestion.roundKm), [3, 20, 200, 350, 1500, 2200]);
    const tiers = MapQuestion.pointTiers({ full: 200, zero: 1500 }, 4);
    assert.deepEqual(tiers.map(tier => tier.points), [4, 3, 2, 1]);
    assert.equal(tiers[0].km, 200);
    assert.equal(tiers[3].km, 1500);
    assert.ok(tiers.every((tier, i) => i === 0 || tier.km > tiers[i - 1].km), 'hranice rostou');
    assert.ok(tiers.every(tier => tier.km % 50 === 0), 'všechny kulaté');
    for (const tier of tiers) {
        assert.equal(MapQuestion.pointsForDistance(tier.km, { full: 200, zero: 1500 }, 4), tier.points, `${tier.km} km = ${tier.points} b`);
        assert.equal(MapQuestion.pointsForDistance(tier.km + 0.1, { full: 200, zero: 1500 }, 4), tier.points - 1);
    }
    assert.deepEqual(MapQuestion.pointTiers({ full: 20, zero: 120 }, 8).map(tier => tier.points), [8, 7, 6, 5, 4, 3, 2, 1]);
    assert.equal(MapQuestion.maxPoints(false), 4);
    assert.equal(MapQuestion.maxPoints(true), 8);
    for (const max of [4, 8]) {
        let previous = Infinity;
        for (let km = 0; km <= cz.zero + 20; km += 0.5) {
            const points = MapQuestion.pointsForDistance(km, cz, max);
            assert.ok(Number.isInteger(points) && points >= 0 && points <= max);
            assert.ok(points <= previous, 'čím dál, tím méně bodů');
            previous = points;
            if (km <= cz.full) assert.equal(points, max);
            if (km > cz.full) assert.ok(points < max, 'za plným poloměrem už ne plný počet');
            if (km <= cz.zero && km > cz.full) assert.ok(points >= 1, 'do nulového poloměru aspoň bod');
            if (km > cz.zero) assert.equal(points, 0);
        }
    }
    // Plošné místo (ostrov, jezero) má plné body i dál od středu
    const crete = MapQuestion.radiiFor(byName('Kréta', 'ostrov'), 'evropa');
    const city = MapQuestion.radiiFor({ c: 'mesto' }, 'evropa');
    assert.ok(crete.full > city.full + 40 && Math.abs((crete.zero - crete.full) - (city.zero - city.full)) <= 100, 'stejně široký pás ubývání (až na zaokrouhlení)');
    // Vyhodnocení tipu: Jihlava místo Brna je asi 75 km vedle
    const brno = MapQuestion.buildQuestion(byName('Brno', 'mesto'), zemepisCtx, mapData);
    const result = MapQuestion.evaluate(brno, { lat: 49.396, lon: 15.591 }, false);
    assert.ok(result.km > 70 && result.km < 80, `${result.km} km`);
    assert.ok(result.points > 0 && result.points < 4);
    assert.equal(result.max, 4);
    assert.equal(MapQuestion.evaluate(brno, { lat: brno.map.lat, lon: brno.map.lon }, true).points, 8);
    assert.equal(MapQuestion.evaluate(brno, { lat: 50.08, lon: 14.42 }, false).points, 0, 'Praha místo Brna (185 km) bez bodů');
    assert.equal(MapQuestion.evaluate(brno, null, false), null);
    assert.equal(MapQuestion.evaluate(brno, { lat: NaN, lon: 1 }, false), null);
    // Body sedí s kontrolou na serveru (výzvy: 0…4, při psaní 0…8, správně = aspoň bod)
    for (const typed of [false, true]) {
        for (const km of [0, 10, 30, 60, 90, 130, 1000]) {
            const points = MapQuestion.pointsForDistance(km, cz, MapQuestion.maxPoints(typed));
            assert.ok(points >= 0 && points <= (typed ? 8 : 4));
        }
    }
});

test('vzdálenost pro hráče a čára po velkém kruhu', () => {
    assert.equal(MapQuestion.formatKm(0.4), 'méně než 1 km');
    assert.equal(MapQuestion.formatKm(3.44), '3,4 km');
    assert.equal(MapQuestion.formatKm(37.4), '37 km');
    assert.match(MapQuestion.formatKm(1237), /^1\s240 km$/);
    const line = MapQuestion.greatCircle({ lat: 50, lon: 14 }, { lat: 40, lon: -74 }, 10);
    assert.equal(line.length, 11);
    assert.ok(Math.abs(line[0].lat - 50) < 1e-9 && Math.abs(line[10].lon + 74) < 1e-9);
    assert.ok(line[5].lat > 50, 'velký kruh z Evropy do Ameriky vede přes sever');
});

test('kdy přijde otázka na mapě: nejdřív po 6 vhodných otázkách, nejpozději po 10; počítadlo v zařízení', async () => {
    assert.equal(MapQuestion.isDue(0, () => 0), false);
    assert.equal(MapQuestion.isDue(5, () => 0), false, 'náhodné číslo nerozhodne před šestou otázkou (testy s pevným Math.random)');
    assert.equal(MapQuestion.isDue(6, () => 0.1), true);
    assert.equal(MapQuestion.isDue(6, () => 0.9), false);
    assert.equal(MapQuestion.isDue(10, () => 0.99), true);
    // Průměrně asi každá osmá vhodná otázka
    let questions = 0;
    let maps = 0;
    let gap = 0;
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 20000; i++) {
        questions++;
        if (MapQuestion.isDue(gap, rng)) { maps++; gap = 0; } else gap++;
    }
    assert.ok(questions / maps > 7 && questions / maps < 9, `každá ${(questions / maps).toFixed(1)}.`);

    let stored = null;
    const storage = { read: () => stored, write: (value) => { stored = value; } };
    const loadMap = async () => mapData;
    const brno = byName('Brno', 'mesto');
    // Položka bez souřadnic na mapu nejde
    const river = { ...zemepis.items.find(item => item.c === 'reka'), la: undefined };
    assert.equal(await MapQuestion.nextQuestion(river, zemepisCtx, { storage, rng: () => 0, loadMap }), null);
    assert.equal(stored, null, 'nevhodná položka počítadlo nemění');
    for (let i = 1; i <= 6; i++) {
        assert.equal(await MapQuestion.nextQuestion(brno, zemepisCtx, { storage, rng: () => 0.1, loadMap }), null);
        assert.equal(stored, i);
    }
    const question = await MapQuestion.nextQuestion(brno, zemepisCtx, { storage, rng: () => 0.1, loadMap });
    assert.equal(question.type, 'map');
    assert.equal(stored, 0, 'po otázce na mapě se počítá znovu');
    stored = 'nesmysl';
    assert.equal(await MapQuestion.nextQuestion(brno, zemepisCtx, { storage, rng: () => 0, loadMap }), null);
    assert.equal(stored, 1, 'poškozené počítadlo začne od nuly');
    stored = 10;
    assert.equal(await MapQuestion.nextQuestion(brno, zemepisCtx, { storage, rng: () => 0.9, loadMap: async () => { throw new Error('offline'); } }), null, 'bez mapy obvyklá otázka');
    assert.ok(stored >= 10, 'otázka na mapě přijde hned, jak to půjde');
});

test('data/mapa.json: lehké cesty SVG bez popisků, Česko s kraji a řekami', () => {
    const size = fs.statSync(path.join(ROOT, 'data/mapa.json')).size;
    assert.ok(size < 600 * 1024, `${Math.round(size / 1024)} kB`);
    assert.match(mapData.source, /Natural Earth/);
    for (const [id, region] of Object.entries(mapData.regions)) {
        for (const [layer, d] of Object.entries(region.layers)) {
            assert.match(d, /^M[-\d Mlz]+$/, `${id}/${layer}: jen M, l, z a celá čísla`);
            assert.ok(d.length < 140 * 1024, `${id}/${layer}: ${Math.round(d.length / 1024)} kB`);
        }
        assert.ok(region.layers.land && region.layers.borders, `${id}: pevnina a hranice`);
    }
    const czech = mapData.regions.cesko.layers;
    for (const layer of ['home', 'inner', 'rivers']) assert.ok(czech[layer], `Česko: ${layer}`);
    const outline = MapQuestion.ringsOf(czech.home);
    assert.equal(outline.length, 1, 'obrys Česka je jeden prstenec');
    assert.ok(outline[0].length > 300, 'obrys Česka je podrobný (1:10m)');
    // Obrys Česka obsahuje všechna česká města z dat
    const frame = MapQuestion.frameOf('cesko');
    const ring = outline[0];
    const inside = (x, y) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { if ((ring[i][1] > y) !== (ring[j][1] > y) && x < (ring[j][0] - ring[i][0]) * (y - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit; } return hit; };
    const czechCities = zemepis.items.filter(item => item.c === 'mesto' && (item.co || []).includes('Q213'));
    const outside = czechCities.filter(item => !inside(...frame.toMap(item.la, item.lo)));
    assert.ok(outside.length <= 2, `města mimo obrys: ${outside.map(item => item.n).join(', ')}`);
    // Kraje: 14 krajů má mezi sebou desítky hranic
    assert.ok(MapQuestion.ringsOf(czech.inner).length >= 20);
});

test('zapojení: skript ve stránce před aplikací, data i skript v mezipaměti pro hraní bez internetu, styly z Tailwindu', () => {
    const html = read('index.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    assert.ok(scripts.indexOf('question-map.js') > scripts.indexOf('quiz-core.js'));
    assert.ok(scripts.indexOf('question-map.js') < scripts.indexOf('app.js'));
    const sw = read('sw.js');
    assert.match(sw, /'question-map\.js'/);
    assert.match(sw, /'data\/mapa\.json'/);
    assert.match(read('tailwind.config.js'), /'\.\/question-map\.js'/);
    const css = read('styles.css');
    for (const cls of ['fill-emerald-500\\/15', 'fill-brand-600\\/25', 'stroke-sky-500', 'touch-none']) assert.ok(css.includes(cls), `styles.css: ${cls}`);
    // Bez inline stylů (CSP): v šablonách modulu žádný atribut style
    assert.doesNotMatch(read('question-map.js'), /[\s"']style=|\.style\.\w+\s*=[^=]/);
    const app = read('app.js');
    assert.match(app, /mode !== 'practice' \|\| pool\.kind === 'mistakes' \|\| pool\.kind === 'review'/, 'jen trénink, ne dnešní otázky, výzvy, turnaje, chyby ani opakování');
});

test('plochy: obrys z data/mapa-tvary.json – uvnitř přesná trefa, jinak vzdálenost od okraje; moře jen s obrysem', () => {
    // Čtverec 1° × 1° kolem 50° s. š., 14–15° v. d. (první bod, pak rozdíly v tisícinách stupně)
    const square = '50000,14000,0,1000,1000,0,0,-1000';
    const rings = MapQuestion.decodeShape(square);
    assert.deepEqual(rings, [[[50, 14], [50, 15], [51, 15], [51, 14]]]);
    assert.equal(MapQuestion.distanceToShapeKm(rings, { lat: 50.5, lon: 14.5 }), 0, 'uvnitř');
    const west = MapQuestion.distanceToShapeKm(rings, { lat: 50.5, lon: 13 });
    assert.ok(Math.abs(west - 71) < 3, `1° západně na 50,5° je asi 71 km od okraje (${west})`);
    // Kroužek přes 180. poledník (délky nad 180°) i tip na druhé straně
    const fiji = MapQuestion.decodeShape('-18000,179000,0,2000,1000,0,0,-2000');
    assert.equal(MapQuestion.distanceToShapeKm(fiji, { lat: -17.5, lon: -179.5 }), 0, 'Fidži přes 180. poledník');
    // Otázka s obrysem: plné body kdekoli uvnitř, poloměry bez přídavku za rozlohu, měří se od okraje
    const lake = place('Testovací jezero', 'jezero', 50.5, 14.5, { ty: 'jezero', q: 'T-lake', f: { area: 9000 }, co: ['Q213'] });
    const lakeCtx = { ...zemepisCtx, items: [lake] };
    const question = MapQuestion.buildQuestion(lake, lakeCtx, { ...mapData, shapes: { 'T-lake': square } });
    assert.equal(question.map.shape, square);
    assert.deepEqual({ full: question.map.full, zero: question.map.zero }, MapQuestion.radiiFor(lake, 'cesko', true));
    assert.equal(MapQuestion.evaluate(question, { lat: 50.95, lon: 14.95 }, false).points, 4, 'roh plochy daleko od středu');
    assert.equal(MapQuestion.evaluate(question, { lat: 50.95, lon: 14.95 }, false).km, 0);
    // Moře, záliv, poušť, souostroví: jen s obrysem
    const sea = place('Testovací moře', 'jezero', 55, 18, { ty: 'moře', q: 'T-sea' });
    assert.ok(MapQuestion.SHAPE_ONLY.has('moře'));
    assert.equal(MapQuestion.candidate(sea, { ...zemepisCtx, items: [sea] }, { ...mapData, shapes: {} }), null);
    assert.equal(MapQuestion.buildQuestion(sea, { ...zemepisCtx, items: [sea] }, { ...mapData, shapes: {} }), null);
});

test('pohled: místa v Česku na mapě Česka, jinak napůl celý svět a napůl rovnou kontinent (stejně pro všechny)', () => {
    const counts = { world: 0, continent: 0, cesko: 0 };
    for (const item of zemepis.items) {
        const question = MapQuestion.buildQuestion(item, zemepisCtx, mapData);
        if (!question) continue;
        counts[question.map.view]++;
        if (question.map.region === 'cesko') assert.equal(question.map.view, 'cesko');
        else assert.equal(question.map.view, MapQuestion.viewFor(item));
    }
    const ratio = counts.world / (counts.world + counts.continent);
    assert.ok(ratio > 0.4 && ratio < 0.6, `svět ${counts.world}, kontinent ${counts.continent}`);
});

test('druhy míst: město, stát, řeka, pohoří, bitva, událost, stavba, region… – každé místo má druh a otázka správné sloveso', () => {
    assert.ok(MapQuestion.MAP_GROUPS.length >= 12);
    for (const topic of ['zemepis', 'sport', 'historie', 'architektura', 'vlajky']) assert.ok(MapQuestion.MAP_TOPICS.includes(topic), topic);
    // Každá položka, na kterou jde otázka na mapě, patří do druhu (pro střídání v režimu Ukaž na mapě)
    for (const [topicId, ctx] of [['zemepis', zemepisCtx], ['sport', sportCtx]]) {
        for (const item of ctx.items) if (MapQuestion.buildQuestion(item, ctx, mapData)) assert.ok(MapQuestion.groupOf(item), `${topicId}: ${item.n}`);
    }
    assert.equal(MapQuestion.titleFor({ c: 'reka', n: 'Dunaj' }), 'Kudy teče Dunaj?');
    assert.equal(MapQuestion.titleFor({ c: 'bitva', n: 'Bitva u Slavkova' }), 'Kde se odehrála bitva u Slavkova?');
    assert.equal(MapQuestion.titleFor({ c: 'bitva', n: 'Obléhání Vídně' }), 'Kde se odehrálo obléhání Vídně?');
    assert.equal(MapQuestion.titleFor({ c: 'udalosti', ty: 'konference', n: 'Jaltská konference' }), 'Kde se konala Jaltská konference?');
    assert.equal(MapQuestion.titleFor({ c: 'udalosti', ty: 'smlouva', n: 'Mnichovská dohoda' }), 'Kde byla podepsána Mnichovská dohoda?');
    assert.equal(MapQuestion.titleFor({ c: 'udalosti', ty: 'havárie', n: 'Černobylská havárie' }), 'Černobylská havárie – kde se to stalo?');
    assert.equal(MapQuestion.titleFor({ c: 'stavby', ty: 'hrobka', n: 'Tádž Mahal' }), 'Kde stojí Tádž Mahal?');
    // Války a epidemie na mapu nepatří (nejsou v jednom místě)
    const historieCtx = { topic: { id: 'historie' }, items: [], countries };
    assert.equal(MapQuestion.candidate(place('Třicetiletá válka', 'bitva', 50, 14, { ty: 'válka', co: ['Q183'] }), historieCtx), null);
    assert.equal(MapQuestion.candidate(place('Černá smrt', 'udalosti', 45, 10, { ty: 'epidemie', co: ['Q38'] }), historieCtx), null);
    assert.ok(MapQuestion.candidate(place('Bitva u Lipan', 'bitva', 50.03, 15.0, { ty: 'bitva', co: ['Q213'] }), historieCtx));
    // Řeka jako čára: vzdálenost k čáře, uvnitř být nejde; poloviční poloměry
    const line = MapQuestion.decodeShape('~50000,14000,0,1000,0,1000');
    assert.equal(line.line, true);
    assert.ok(MapQuestion.distanceToShapeKm(line, { lat: 50, lon: 15 }) < 0.5, 'na řece');
    const off = MapQuestion.distanceToShapeKm(line, { lat: 50.5, lon: 15 });
    assert.ok(Math.abs(off - 55.6) < 2, `0,5° na sever je asi 56 km (${off})`);
    const point = MapQuestion.radiiFor({ c: 'reka' }, 'evropa', true, false);
    const river = MapQuestion.radiiFor({ c: 'reka' }, 'evropa', true, true);
    assert.ok(river.full < point.full && river.zero < point.zero);
});
