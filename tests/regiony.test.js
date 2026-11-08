// Slepá mapa regionu (data/regiony.json, quiz-core.js) a oddálení slepé mapy uvnitř velkého státu – na skutečných datech
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../quiz-core.js');
const vlajky = require('../topics/vlajky.js');

const ROOT = path.join(__dirname, '..');
const regiony = require(path.join(ROOT, 'data', 'regiony.json'));
const world = require(path.join(ROOT, 'data', 'world.json'));
const data = require(path.join(ROOT, 'data', 'vlajky.json'));
const countries = require(path.join(ROOT, 'data', 'countries.json')).countries;
const ctx = { topic: vlajky, items: data.items, countries };

// Panel nápovědy na telefonu: 390×780 (vyšší panel) a 360×640 se čtyřmi možnostmi (nízký široký pruh)
const PANELS = [[358, 200], [328, 120]];
// Jazykové společenství není správní region – jeho obrys Natural Earth nemá, ukáže se jen tečka
const DOT_ONLY = ['Německojazyčné společenství Belgie'];

// Délka čar cesty SVG ve výřezu (úsek se počítá, když je jeho střed uvnitř)
const visibleLength = (d, width, height) => {
    let total = 0;
    let previous = null;
    for (const [, command, x, y] of d.matchAll(/([MLZ])(?:(-?[\d.]+) (-?[\d.]+))?/g)) {
        if (command === 'Z') { previous = null; continue; }
        const point = [Number(x), Number(y)];
        if (command === 'L' && previous) {
            const [mx, my] = [(point[0] + previous[0]) / 2, (point[1] + previous[1]) / 2];
            if (mx >= 0 && mx <= width && my >= 0 && my <= height) total += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
        }
        previous = point;
    }
    return total;
};
const regionItems = data.items.filter(item => item.c === 'regiony');
const krajItems = data.items.filter(item => item.c === 'cesko' && item.ty === 'kraj');

test('regiony: data pro každý stát okruhu Regiony států a pro Česko, každý region s obrysem', () => {
    const needed = new Set([...regionItems.map(item => item.co[0]), 'Q213']);
    assert.deepEqual(Object.keys(regiony.countries).sort(), [...needed].sort(), 'jen státy s položkami okruhu (a Česko)');
    for (const item of [...regionItems, ...krajItems]) {
        const entry = regiony.countries[item.co[0]];
        if (DOT_ONLY.includes(item.n)) { assert.equal(entry.i[item.q], undefined, item.n); continue; }
        assert.ok(entry.i[item.q], `${item.n}: region nalezený`);
        // Městečka jako Ceuta a Melilla jsou na mapě celého státu menší než bod – stačí tečka
        if (item.f.area > 100) assert.ok(entry.i[item.q].r.length > 0, `${item.n}: obrys regionu`);
    }
    assert.equal(krajItems.length, 13);
});

test('regiony: na mapě každého regionu je dost hranic, tečka je ve výřezu a nic není popsané', () => {
    for (const item of [...regionItems, ...krajItems]) {
        const spec = vlajky.visual(item, ctx, 'name');
        assert.deepEqual(spec.regional, { country: item.co[0], item: item.q }, item.n);
        const entry = regiony.countries[spec.regional.country];
        for (const [width, height] of PANELS) {
            const map = core.buildRegionalMap(entry, { item: spec.regional.item, lat: spec.lat, lon: spec.lon, width, height });
            const where = `${item.n} ${width}×${height}`;
            // Obrysy států (pobřeží a hranice) a hranice regionů dohromady aspoň tři čtvrtiny obvodu mapy
            // (dřív u státu USA jediná zatoulaná čára)
            const borders = ['own', 'others', 'lines'].reduce((sum, layer) => sum + visibleLength(map.layers[layer], width, height), 0);
            assert.ok(borders >= (width + height) * 0.75, `${where}: hranic ${Math.round(borders)} px`);
            // Na běžném panelu i hranice regionů uvnitř státu
            if (height === 200) assert.ok(visibleLength(map.layers.lines, width, height) >= 50, `${where}: hranice regionů`);
            assert.ok(map.dot.x >= 0 && map.dot.x <= width && map.dot.y >= 0 && map.dot.y <= height, `${where}: tečka ve výřezu`);
            if (!DOT_ONLY.includes(item.n) && item.f.area > 1000) assert.ok(map.layers.region, `${where}: region zvýrazněný`);
            // Měřítko: výřez širší než region a nejvýš jako mapa půlky světa
            assert.ok(map.span >= 3 && map.span <= 130, `${where}: výřez ${map.span}°`);
            assert.ok(map.lat > -80 && map.lat < 80);
        }
    }
});

test('regiony: stát USA ukáže celé USA s hranicemi států, region v Rusku jeho okolí', () => {
    const find = (name) => data.items.find(item => item.n === name && item.c === 'regiony');
    const kansas = find('Kansas');
    const usa = core.buildRegionalMap(regiony.countries.Q30, { item: kansas.q, lat: kansas.la, lon: kansas.lo, width: 358, height: 200 });
    // Celé USA (asi 58° délky) i s okrajem; dřív výřez 14° kolem bodu bez jediné hranice
    assert.ok(usa.span > 55 && usa.span < 75, `výřez ${usa.span}°`);
    assert.ok(visibleLength(usa.layers.lines, 358, 200) > 2000, 'hranice států');
    assert.ok(usa.layers.region && usa.layers.lakes, 'Kansas zvýrazněný, Velká jezera');
    const tatarstan = find('Tatarstán');
    const russia = core.buildRegionalMap(regiony.countries.Q159, { item: tatarstan.q, lat: tatarstan.la, lon: tatarstan.lo, width: 358, height: 200 });
    assert.equal(russia.span, core.REGIONAL_WINDOW[0], 'Rusko se celé nevejde – okolí regionu');
    assert.ok(Math.abs(russia.dot.x - 179) < 60, 'Tatarstán zhruba uprostřed');
    // Bez obrysu regionu (stát bez dat regionu) tečka na místě položky
    const point = core.buildRegionalMap(regiony.countries.Q30, { item: 'Q0', lat: 41.88, lon: -87.63, width: 358, height: 200 });
    assert.equal(point.layers.region, '');
    assert.ok(point.dot.x > 179, 'Chicago je na východ od středu USA');
});

test('regiony: zápis čísel cest a výřez', () => {
    // Po pěti bitech, znaménko v nejnižším bitu: 0, -1, 1, 16 (dva znaky)
    assert.deepEqual(core.decodeNumbers('ABCgB'), [0, -1, 1, 16]);
    const entry = { f: [0, 0, 10, 5] };
    // Rámec státu i s okrajem; region mimo rámec ho rozšíří
    assert.deepEqual(core.regionalView(entry, { p: [5, 2] }, 2), { x: 5, y: 2.5, span: 10 * 1.12 });
    assert.equal(core.regionalView(entry, { b: [0, 0, 20, 5], p: [15, 2] }, 2).span, 20 * 1.12);
    // Bez rámce (Rusko) okolí regionu, nejméně 40°
    assert.deepEqual(core.regionalView({}, { p: [50, 60] }, 2), { x: 50, y: 60, span: 40 });
    // Celý stát by na nízkém širokém panelu byl proužek (Chile) – pak okolí regionu
    assert.equal(core.regionalView({ f: [0, 0, 10, 50] }, { p: [5, 20] }, 3).span, 40);
});

test('vlajky: slepá mapa regionu jen u regionů, měst a českých znaků', () => {
    const of = (category) => data.items.find(item => item.c === category && item.la !== undefined);
    for (const category of ['regiony', 'mesta', 'cesko']) {
        const item = of(category);
        assert.deepEqual(vlajky.visual(item, ctx, 'name').regional, { country: item.co[0], item: item.q }, category);
    }
    for (const category of ['vlajka', 'uzemi', 'historie']) assert.equal(vlajky.visual(of(category), ctx, 'name').regional, undefined, category);
    assert.match(vlajky.visual(of('regiony'), ctx, 'name').label, /tečkou/);
});

test('slepá mapa uvnitř velkého státu se oddálí, na moři a u pobřeží ne', () => {
    const view = (lat, lon, spanLon = 24) => core.blindMapSpan(world, { lat, lon, spanLon, width: 358, height: 200 });
    // Denver, Kazaň: ve výřezu 24° skoro žádná čára (obrysy 1:110m) – oddálí se, nejvýš na trojnásobek
    for (const [lat, lon] of [[39.74, -104.99], [55.79, 49.12]]) {
        const span = view(lat, lon);
        assert.ok(span > 24 && span <= 72, `${lat}, ${lon}: ${span}°`);
        assert.ok(core.visibleOutline(world, { lat, lon, spanLon: span, width: 358, height: 200 }) >= 358 + 200 || span === 72);
    }
    // Praha (hranice blízko), Honolulu (ostrovy v moři), uprostřed Atlantiku: beze změny
    assert.equal(view(50.08, 14.42), 24);
    assert.equal(view(21.3, -157.86), 24);
    assert.equal(view(30, -40, 30), 30);
    // Malý umělý svět: bod uprostřed velkého čtverce pevniny
    const square = { countries: [{ id: '1', r: [[0, 0, 400, 0, 400, 400, 0, 400].map(v => v * 10)] }] };
    assert.ok(core.blindMapSpan(square, { lat: 20, lon: 20, spanLon: 10, width: 300, height: 200 }) > 10);
});
