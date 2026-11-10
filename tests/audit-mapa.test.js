// Kontrola mapy pro otázku „Ukaž na mapě“ (scripts/audit-mapa.mjs, scripts/lib/audit-mapa-checks.mjs) a regrese podkladové
// mapy data/mapa.json: moře jsou voda a pevnina pevnina (i Kaspické moře), hranice nekončí „do ztracena“, každý stát má
// plochu, známá jezera jsou nakreslená, soubor oprav data/mapa-opravy.json je platný. Pomocníky sestavení mapy
// (scripts/lib/mapa-podklad.mjs) a geometrie kontroly mají vlastní testy na malých příkladech.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const load = () => Promise.all([
    import('../scripts/lib/audit-mapa-checks.mjs'), import('../scripts/lib/audit-mapa-geo.mjs'), import('../scripts/lib/mapa-podklad.mjs'), import('../scripts/lib/audit-mapa-known.mjs')
]);
const collect = () => { const findings = []; return { findings, add: (severity, section, code, text, extra = {}) => findings.push({ severity, section, code, text, ...extra }) }; };
const list = (findings) => findings.map(finding => `${finding.code}: ${finding.text}`).join('\n');

test('podkladová mapa světa: moře, jezera a pevnina na známých místech, žádná hranice do ztracena, šev a díry v pořádku', async () => {
    const [checks] = await load();
    const data = checks.loadData(ROOT);
    const world = new checks.Basemap(data.map.regions.svet, 'svet');
    // Kaspické moře bylo nakreslené jako pevnina (díra Eurasie skončila v jiné cestě než její pevnina)
    for (const [lat, lon] of [[45, 50.5], [42, 50.5], [38.5, 51.5]]) assert.equal(world.isLand(lat, lon), false, `Kaspické moře ${lat}, ${lon} je voda`);
    assert.equal(world.isLand(44, 54), true, 'východní břeh Kaspického moře je pevnina');
    for (const [name, lat, lon] of [['Černé moře', 43.5, 34], ['Baltské moře', 56, 19], ['Středozemní moře', 35, 18], ['Rudé moře', 20, 38.5], ['Perský záliv', 27, 51], ['Hudsonův záliv', 60, -86]]) {
        assert.equal(world.isLand(lat, lon), false, `${name} je voda`);
    }
    for (const [name, lat, lon] of [['Praha', 50.08, 14.42], ['Madrid', 40.42, -3.7], ['Dillí', 28.6, 77.2], ['Brasília', -15.8, -47.9], ['Fidži u 180. poledníku', -17.8, 178]]) {
        assert.equal(world.isLand(lat, lon), true, `${name} je pevnina`);
        assert.equal(world.isLake(lat, lon), false, `${name} není v jezeře`);
    }
    for (const [name, lat, lon] of [['Hořejší jezero', 47.7, -87.5], ['Viktoriino jezero', -1, 33], ['Bajkal', 53.5, 108], ['Aralské jezero', 45, 58.4], ['Balaton', 46.85, 17.75],
        ['Ženevské jezero', 46.45, 6.55], ['Bodamské jezero', 47.6, 9.4], ['Gardské jezero', 45.6, 10.65]]) {
        assert.equal(world.isLake(lat, lon), true, `${name} je nakreslené`);
    }
    // Celá kontrola: žádný kritický nález, žádný konec hranice dál než 1,5 jednotky od břehu, jezera či jiné hranice
    const { findings, add } = collect();
    const stats = checks.checkWorld(world, add);
    const serious = findings.filter(finding => ['critical', 'high'].includes(finding.severity));
    assert.deepEqual(serious, [], list(serious));
    assert.deepEqual(findings.filter(finding => finding.code === 'hranice-do-ztracena'), [], 'žádná hranice do ztracena');
    assert.ok(stats.borders.worstUnits <= 1.5, `nejhorší konec hranice ${stats.borders.worstUnits} j`);
    assert.ok(stats.borders.lines > 300 && stats.lakes > 150 && stats.rings.land > 1300, JSON.stringify(stats));
    assert.equal(stats.holes, 1, 'jediná díra v pevnině je Kaspické moře');
    assert.equal(stats.antarctica.drawnBelowFrame, true, 'Antarktida je pod výřezem (pro vysoké displeje)');
    // Malé ostrovy z položek otázek a nejmenší státy jsou nakreslené (do 6 km od bodu), ostrůvek pod rozlišení ne
    for (const [name, lat, lon] of [['Capri', 40.55, 14.233], ['Aigina', 37.73, 23.49], ['Nauru', -0.527, 166.935], ['Male', 4.175, 73.509], ['Funafuti', -8.52, 179.2]]) {
        assert.equal(world.landNear(lat, lon, 6), true, `${name} je na mapě`);
    }
    // Hranice státu sloučeného z částí se nekreslí (Somaliland, severní Kypr): uprostřed bývalé čáry žádná hranice není
    const borders = new (await load())[1].SegmentIndex(16);
    world.parts.borders.forEach((part, index) => borders.addLine(part.points, false, index));
    for (const [name, lat, lon] of [['Somálsko × Somaliland', 9.5, 48.6], ['Kypr × severní Kypr', 35.1, 33.4]]) {
        const [x, y] = world.toMap(lat, lon);
        assert.equal(borders.nearest(x, y, 3), null, `${name}: bez vnitřní hranice`);
    }
});

test('podkladová mapa Česka: 14 krajů pokrývá Česko, krajská města ve svých krajích, řeky na místě', async () => {
    const [checks] = await load();
    const data = checks.loadData(ROOT);
    const { findings, add } = collect();
    const stats = checks.checkCzech(new checks.Basemap(data.map.regions.cesko, 'cesko'), add);
    assert.deepEqual(findings, [], list(findings));
    assert.equal(stats.kraje, 14);
    assert.ok(stats.rivers >= 8);
});

test('státy: každý stát ze hry má plochu na mapě se stejným jménem, hlavní město v ní a plochy se nepřekrývají', async () => {
    const [checks] = await load();
    const data = checks.loadData(ROOT);
    const world = new checks.Basemap(data.map.regions.svet, 'svet');
    for (const [qid, country] of Object.entries(data.countries)) assert.ok(world.areaByName.has(require('../quiz-core.js').normalizeAnswer(country.name)), `${country.name} (${qid}) má plochu`);
    const { findings, add } = collect();
    const stats = checks.checkStates(world, data, add);
    const serious = findings.filter(finding => ['critical', 'high'].includes(finding.severity));
    assert.deepEqual(serious, [], list(serious));
    assert.equal(stats.withArea, stats.countries);
    assert.ok(stats.capitalsChecked > 180, `zkontrolovaných hlavních měst ${stats.capitalsChecked}`);
    // V enklávě se najde vnitřní stát (menší plochy jsou v datech první); sloučené státy mají jednu plochu
    const MapQuestion = require('../question-map.js');
    const frame = MapQuestion.frameOf('svet');
    assert.equal(MapQuestion.areaAt(data.map.regions.svet, frame, 41.903, 12.453), 'Vatikán');
    assert.equal(MapQuestion.areaAt(data.map.regions.svet, frame, -29.6, 28.2), 'Lesotho');
    assert.equal(MapQuestion.areaAt(data.map.regions.svet, frame, 9.56, 44.06), 'Somálsko', 'Hargeisa: Somaliland je součást plochy Somálska');
    assert.equal(MapQuestion.areaAt(data.map.regions.svet, frame, 35.33, 33.32), 'Kypr', 'Kyrenia: severní Kypr je součást plochy Kypru');
    assert.equal(MapQuestion.areaAt(data.map.regions.svet, frame, 31.9, 35.2), 'Stát Palestina');
});

test('soubor oprav: jen položky z dat, každá s důvodem, opravené polohy jsou platné a skutečně něco mění', async () => {
    const [checks, geo] = await load();
    const data = checks.loadData(ROOT);
    const { findings, add } = collect();
    checks.checkFixes(data, add);
    const serious = findings.filter(finding => finding.severity === 'critical');
    assert.deepEqual(serious, [], list(serious));
    const items = new Map(Object.values(data.topics).flat().map(item => [item.q, item]));
    for (const [qid, reason] of Object.entries(data.fixes.skip)) {
        assert.ok(items.has(qid), `skip: ${qid} je v datech`);
        assert.ok(typeof reason === 'string' && reason.length > 20, `skip: ${qid} má důvod`);
    }
    for (const [qid, point] of Object.entries(data.fixes.points)) {
        assert.ok(items.has(qid), `points: ${qid} je v datech`);
        assert.ok(Array.isArray(point) && point.length === 2 && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180);
        assert.ok(geo.haversineKm([items.get(qid).la, items.get(qid).lo], point) > 1, `points: ${qid} se od dat liší`);
        assert.ok((data.fixes.notes || {})[qid], `points: ${qid} má důvod v notes`);
    }
    // Opravy se v kontrole použijí stejně jako v aplikaci: vyřazené místo se neptá, opravená poloha je v otázce
    const { asked, all } = checks.askable(data);
    for (const qid of Object.keys(data.fixes.skip)) assert.ok(!asked.some(entry => entry.item.q === qid), `${qid} se neptá`);
    for (const [qid, point] of Object.entries(data.fixes.points)) {
        const entry = asked.find(candidate => candidate.item.q === qid);
        assert.ok(entry, `${qid} se ptá`);
        assert.deepEqual([entry.question.map.lat, entry.question.map.lon], point);
    }
    assert.ok(all.length > asked.length && asked.length > 7000, `otázek na mapě ${asked.length}`);
});

test('otázky a polohy: žádný kritický nález, každý druh má otázky, státy jsou v plochách svých států', async () => {
    const [checks] = await load();
    const result = checks.runAudit({ root: ROOT, only: ['polohy', 'otazky'] });
    const critical = result.findings.filter(finding => finding.severity === 'critical');
    assert.deepEqual(critical, [], list(critical));
    // Místo ve státě, který neuvádí (dál než 300 km za hranicí), mimo historii nesmí zůstat bez opravy
    const wrong = result.findings.filter(finding => finding.code === 'jiny-stat' && finding.severity === 'high');
    assert.deepEqual(wrong, [], list(wrong));
    for (const row of result.coverage) assert.ok(row.levels[1].built + row.levels[0].built >= 100, `${row.label}: ${row.levels[1].built + row.levels[0].built} otázek`);
    assert.ok(result.stats.otazky.views.cesko > 1000 && result.stats.otazky.views.world > 3000 && result.stats.otazky.views.continent > 1500, JSON.stringify(result.stats.otazky.views));
    for (const [label, entry] of Object.entries(result.patterns)) assert.ok(entry.count > 0, `vzor zadání ${label}`);
});

test('geometrie kontroly: cesty SVG, bod v kroužcích, nejbližší úsek, rozloha, křížení, části čáry', async () => {
    const [, geo] = await load();
    const parts = geo.parsePath('M0 0l10 0 0 10-10 0zM20 20l5 5 5-5');
    assert.deepEqual(parts.map(part => [part.closed, part.points.length]), [[true, 4], [false, 3]]);
    assert.deepEqual(parts[1].points, [[20, 20], [25, 25], [30, 20]]);
    // Sudá–lichá: čtverec s dírou
    const set = new geo.RingSet([[[0, 0], [10, 0], [10, 10], [0, 10]], [[4, 4], [6, 4], [6, 6], [4, 6]]]);
    assert.equal(set.contains(2, 2), true);
    assert.equal(set.contains(5, 5), false, 'v díře');
    assert.equal(set.contains(12, 5), false);
    assert.equal(set.smallestAround(5, 5).area, 4);
    // Velký kroužek (pásy) dává stejný výsledek jako přímý výpočet
    const circle = Array.from({ length: 400 }, (_, i) => [50 + 40 * Math.cos(i / 400 * 2 * Math.PI), 50 + 40 * Math.sin(i / 400 * 2 * Math.PI)]);
    const big = new geo.RingSet([circle]);
    for (let x = 1; x < 100; x += 7) for (let y = 1; y < 100; y += 7) assert.equal(big.contains(x, y), Math.hypot(x - 50, y - 50) < 40 - 0.01 ? true : Math.hypot(x - 50, y - 50) > 40.01 ? false : big.contains(x, y), `${x},${y}`);
    const [ix, iy] = geo.interiorPoint([[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]]);
    assert.equal(geo.insideRing(ix, iy, [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]]), true, 'bod uvnitř kroužku tvaru L');
    const index = new geo.SegmentIndex(8);
    index.addLine([[0, 0], [100, 0]], false, 'a');
    index.addLine([[0, 50], [100, 50]], false, 'b');
    assert.equal(index.nearest(40, 10, 20).tag, 'a');
    assert.equal(Math.round(index.nearest(40, 10, 20).distance), 10);
    assert.equal(index.nearest(40, 10, 60, tag => tag === 'b').tag, 'b');
    assert.equal(index.nearest(40, 25, 5), null);
    assert.equal(geo.selfCrossings([[0, 0], [10, 10], [10, 0], [0, 10]]), 1, 'motýlek se kříží jednou');
    assert.equal(geo.selfCrossings([[0, 0], [10, 0], [10, 10], [0, 10]]), 0);
    // Stupeň × stupeň na rovníku je asi 12 360 km², na 60° polovina
    assert.ok(Math.abs(geo.sphericalKm2([[0, 0], [0, 1], [1, 1], [1, 0]]) - 12364) < 60);
    assert.ok(Math.abs(geo.sphericalKm2([[60, 0], [60, 1], [61, 1], [61, 0]]) - 6090) < 120);
    assert.ok(Math.abs(geo.shapeKm2([[[0, 0], [0, 2], [2, 2], [2, 0]], [[0.5, 0.5], [0.5, 1.5], [1.5, 1.5], [1.5, 0.5]]]) - 3 * 12364) < 200, 'díra se odečte');
    assert.ok(Math.abs(geo.haversineKm([50, 14], [50, 15]) - 71.5) < 1);
    assert.equal(geo.insideGeoRings([[[-18, 179], [-18, 181], [-17, 181], [-17, 179]]], -17.5, -179.5), true, 'kroužek přes 180. poledník');
    const line = [[[50, 14], [50, 15]], [[50, 15.05], [50, 16]], [[50, 18], [50, 19]]];
    const pieces = geo.lineComponents(line, 8);
    assert.equal(pieces.components, 2, 'úseky do 8 km patří k sobě');
    assert.ok(pieces.gapKm > 130 && pieces.gapKm < 150, `mezera ${pieces.gapKm} km`);
    assert.ok(Math.abs(geo.distanceToLinesKm(line, 50.5, 14.5) - 55.6) < 1);
    assert.ok(geo.samplesInside([[[0, 0], [0, 2], [2, 2], [2, 0]]], 50).length >= 16);
});

test('sestavení mapy: sloučení sousedních ploch, hranice jen po pevnině, výběr ostrovů z podrobnější vrstvy', async () => {
    const [, , build] = await load();
    // Dva čtverce se společnou hranou → jeden obdélník bez vnitřní čáry
    const merged = build.dissolve([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].length, 7, 'šest rohů a uzavření');
    assert.ok(!merged[0].some((point, i) => i > 0 && point[0] === 1 && merged[0][i - 1][0] === 1 && point[1] !== merged[0][i - 1][1]), 'společná hrana zmizela');
    assert.equal(build.dissolve([[[0, 0], [1, 0], [1, 1], [0, 0]], [[5, 5], [6, 5], [6, 6], [5, 5]]]).length, 2, 'nesousedící plochy zůstanou');
    // Čára mezi dvěma částmi státu se pozná, cizí hranice ne
    const left = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], right = [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]];
    assert.equal(build.runsBetween([[1, 0], [1, 0.5], [1, 1]], left, right), true);
    assert.equal(build.runsBetween([[0, 0], [0, 0.5], [0, 1]], left, right), false);
    assert.deepEqual(build.ringPath([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [1, 0], [0, 1]).length, 3, 'kratší cesta po obvodu');
    // Hranice: pevnina je x ≤ 10; čára vedená do moře skončí u břehu, čára celá v moři zmizí, úzký průliv se překlene
    const dry = (x) => x <= 10 || (x >= 12 && x <= 30);
    const trimmed = build.trimToLand([[0, 0], [5, 0], [11, 0], [20, 0], [40, 0]], dry);
    assert.equal(trimmed.length, 1);
    assert.ok(trimmed[0][0][0] === 0 && Math.abs(trimmed[0][trimmed[0].length - 1][0] - 30) <= 0.5, `konec u břehu: ${JSON.stringify(trimmed[0])}`);
    assert.deepEqual(build.trimToLand([[50, 0], [60, 0]], dry), []);
    const split = build.trimToLand([[0, 0], [100, 0], [200, 0]], (x) => x <= 10 || x >= 150);
    assert.equal(split.length, 2, 'široké moře čáru rozdělí');
    // Ostrovy: jen ty u bodů položek, které hrubší vrstva nemá; souostroví bere ostrovy v okruhu
    const square = (lon, lat, size) => [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]];
    const fine = [square(10, 10, 0.05), square(10.2, 10, 0.05), square(20, 20, 0.05), square(30, 30, 3)];
    const km2 = (ring) => (ring[1][0] - ring[0][0]) ** 2 * 12300;
    const picked = build.pickIslands([{ lat: 10.02, lon: 10.02 }, { lat: 30.5, lon: 30.5 }], fine, () => false, { areaOf: km2, maxKm2: 3000 });
    assert.deepEqual(picked, [fine[0]], 'ostrov s bodem ano, velká pevnina ne');
    assert.equal(build.pickIslands([{ lat: 10.02, lon: 10.1, radiusKm: 30 }], fine, () => false, { areaOf: km2 }).length, 2, 'souostroví');
    assert.equal(build.pickIslands([{ lat: 10.02, lon: 10.02 }], fine, () => true, { areaOf: km2 }).length, 0, 'ostrov, který hrubší vrstva má, se nepřidá');
    assert.equal(build.pickIslands([{ lat: 10.02, lon: 10.07 }], fine, () => false, { areaOf: km2, nearKm: 4 }).length, 1, 'bod těsně vedle ostrova');
    assert.equal(build.landTester([[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]])(5, 5), false, 'díra není pevnina');
});

test('skript kontroly: npm run audit:mapa, zpráva v reports/ a zapojení souboru oprav do popisu', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['audit:mapa'], 'node scripts/audit-mapa.mjs');
    const script = fs.readFileSync(path.join(ROOT, 'scripts/audit-mapa.mjs'), 'utf8');
    assert.match(script, /reports\/audit-mapy\.md/);
    assert.match(script, /process\.exit\(exitCode\)/);
    const report = fs.readFileSync(path.join(ROOT, 'reports/audit-mapy.md'), 'utf8');
    for (const heading of ['## Souhrn', '## Podkladová mapa světa', '## Státy na mapě', '## Polohy položek', '## Obrysy', '## Sestavení otázek', '## Pokrytí', '## Opravy']) assert.ok(report.includes(heading), heading);
    assert.match(report, /kritických: \*\*0\*\*/, 'uložená zpráva je bez kritických nálezů');
});
