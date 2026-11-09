// Obrysy plošných míst pro otázku „Ukaž na mapě“ (jezera, moře, zálivy, průlivy, ostrovy, souostroví, národní parky,
// pouště, poloostrovy): klepnutí kamkoli dovnitř obrysu je přesný zásah a vzdálenost se měří od okraje.
// Zdroje: 1. Natural Earth 5.1.2 (volné dílo) – shoda podle vlastnosti wikidataid; 2. OpenStreetMap (© přispěvatelé
// OpenStreetMap, ODbL) – relace z vlastnosti Wikidat P402, obrys z polygons.openstreetmap.fr.
// Každý obrys projde kontrolou (bod položky uvnitř nebo blízko, rozloha zhruba sedí s Wikidaty), jinak se zahodí.
//
// Zápis data/mapa-tvary.json: { source, generated, shapes: { QID: "prstenec;prstenec;…" } }.
// Prstenec = celá čísla oddělená čárkou v tisícinách stupně (Math.round(stupně * 1000)): první dvojice je šířka a délka
// prvního bodu, každá další dvojice je rozdíl (Δšířka, Δdélka) od předchozího bodu. Prstence (vnější i díry) se
// vyhodnocují pravidlem sudá–lichá přes všechny prstence; první bod se na konci neopakuje. Délka je v prstenci souvislá
// (přes 180. poledník pokračuje za ±180), celý obrys leží u bodu položky.
// Spuštění: npm run build:mapa-tvary (s BUILD_CACHE=složka se odpovědi uloží a další běh se sítě neptá;
// OFFLINE=1 použije jen obrysy OpenStreetMap už uložené v mezipaměti)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { layer, polygonsOf, simplify, planarArea } from './lib/natural-earth.mjs';
import { qlever, values, cached, sleep, id } from './lib/wikidata.mjs';

const dataFile = new URL('../data/mapa-tvary.json', import.meta.url);
const zemepis = JSON.parse(readFileSync(new URL('../data/zemepis.json', import.meta.url), 'utf8'));

// Které položky mají obrys: okruh → druhy
export const KINDS = {
    jezero: ['jezero', 'přehradní nádrž', 'laguna', 'moře', 'zátoka', 'průliv'],
    ostrov: ['ostrov', 'souostroví'],
    priroda: ['národní park', 'poušť', 'poloostrov']
};
const NE_LAYERS = ['ne_10m_lakes', 'ne_10m_lakes_europe', 'ne_10m_lakes_north_america', 'ne_10m_geography_marine_polys', 'ne_10m_geography_regions_polys'];
const SOURCE = 'Natural Earth 5.1.2 (naturalearthdata.com, volné dílo); OpenStreetMap (© přispěvatelé OpenStreetMap, data pod licencí ODbL 1.0, '
    + 'openstreetmap.org/copyright; obrysy relací z polygons.openstreetmap.fr podle vlastnosti Wikidat P402)';

const OSM_POLYGONS = 'https://polygons.openstreetmap.fr';
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const UNIT = 1000;              // tisíciny stupně
const MIN_TOLERANCE = 0.005;    // stupně
const TINY_TOLERANCE = 0.0005;  // pro obrysy menší než pár tisícin stupně
const TOLERANCE_SHARE = 0.005;  // podíl úhlopříčky rámečku obrysu
const MIN_RING_SHARE = 0.01;    // menší prstence než 1 % největšího se vynechají
const MAX_POINTS = 150;
const MAX_POINTS_BIG = 300;     // moře a jiné obrovské plochy
const EARTH_KM = 6371.0088;
const NEAR_KM = 15;             // bod položky smí ležet tak daleko od obrysu (nebo 5 % jeho velikosti)

// --- geometrie ---------------------------------------------------------------------------------------------------

// Prstenec bez opakovaného posledního bodu, délka souvislá a posunutá o násobek 360° co nejblíž bodu položky
const prepareRing = (ring, lon0) => {
    const points = ring.map(([x, y]) => [x, y]);
    if (points.length > 1) {
        const [fx, fy] = points[0];
        const [lx, ly] = points[points.length - 1];
        if (fx === lx && fy === ly) points.pop();
    }
    for (let i = 1; i < points.length; i++) {
        while (points[i][0] - points[i - 1][0] > 180) points[i][0] -= 360;
        while (points[i][0] - points[i - 1][0] < -180) points[i][0] += 360;
    }
    const mean = points.reduce((sum, p) => sum + p[0], 0) / (points.length || 1);
    const shift = Math.round((lon0 - mean) / 360) * 360;
    if (shift) points.forEach(p => { p[0] += shift; });
    return points;
};

// Rozloha prstence na kouli v km² (bez znaménka)
export const sphericalKm2 = (points) => {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        sum += (x2 - x1) * Math.PI / 180 * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180));
    }
    return Math.abs(sum * EARTH_KM * EARTH_KM / 2);
};

export const inRings = (rings, [x, y]) => {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
    }
    return inside;
};

// Vzdálenost bodu [lon, lat] od obrysu v km (0 uvnitř); přibližně v rovině kolem bodu, s ohledem na posun o 360°
export const distanceKm = (rings, [lon, lat]) => {
    let best = Infinity;
    for (const shift of [0, -360, 360]) {
        const point = [lon + shift, lat];
        if (inRings(rings, point)) return 0;
        const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
        for (const ring of rings) {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const ax = (ring[j][0] - point[0]) * kx, ay = (ring[j][1] - lat) * ky;
                const bx = (ring[i][0] - point[0]) * kx, by = (ring[i][1] - lat) * ky;
                const dx = bx - ax, dy = by - ay;
                const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
                best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
            }
        }
    }
    return best;
};

const bboxOf = (rings) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings) for (const [x, y] of ring) {
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
    }
    return box;
};
const diagonalDeg = (box) => Math.hypot(box[2] - box[0], box[3] - box[1]);
const sizeKm = (box) => Math.hypot((box[2] - box[0]) * 111.32 * Math.cos((box[1] + box[3]) / 2 * Math.PI / 180), (box[3] - box[1]) * 110.57);

// Rozloha sudá–lichá z rozložených mnohoúhelníků (vnější prstenec minus díry)
const polygonsKm2 = (polygons) => polygons.reduce((sum, rings) => sum + Math.max(0, sphericalKm2(rings[0]) - rings.slice(1).reduce((s, r) => s + sphericalKm2(r), 0)), 0);

// Douglas–Peucker uzavřeného prstence: rozdělí se v nejvzdálenějším bodě od prvního, oba konce zůstanou
const simplifyRing = (ring, tolerance) => {
    if (ring.length <= 4) return ring;
    let far = 0, worst = -1;
    ring.forEach(([x, y], i) => {
        const d = (x - ring[0][0]) ** 2 + (y - ring[0][1]) ** 2;
        if (d > worst) { worst = d; far = i; }
    });
    const first = simplify(ring.slice(0, far + 1), tolerance);
    const second = simplify([...ring.slice(far), ring[0]], tolerance);
    return [...first, ...second.slice(1, -1)];
};

// Zaokrouhlení na tisíciny stupně a vypuštění opakovaných bodů (i posledního shodného s prvním)
const quantize = (ring) => {
    const out = [];
    for (const [x, y] of ring) {
        const q = [Math.round(x * UNIT), Math.round(y * UNIT)];
        const last = out[out.length - 1];
        if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
    }
    while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
    return out;
};

export const encodeRing = (ring) => {
    const numbers = [ring[0][1], ring[0][0]];
    for (let i = 1; i < ring.length; i++) numbers.push(ring[i][1] - ring[i - 1][1], ring[i][0] - ring[i - 1][0]);
    return numbers.join(',');
};
// Opak zápisu (stejné pravidlo jako v testu a v aplikaci): [[[lat, lon], …], …] ve stupních
export const decodeShape = (text) => text.split(';').map(part => {
    const numbers = part.split(',').map(Number);
    const ring = [];
    let lat = 0, lon = 0;
    for (let i = 0; i < numbers.length; i += 2) {
        lat += numbers[i];
        lon += numbers[i + 1];
        ring.push([lat / UNIT, lon / UNIT]);
    }
    return ring;
});

// Zjednodušení celého obrysu pod strop počtu bodů; vrací { text, rings (stupně [lon, lat]), points }
const compress = (rings, maxPoints, minTolerance = MIN_TOLERANCE) => {
    const diagonal = diagonalDeg(bboxOf(rings));
    const areas = rings.map(planarArea);
    const largest = Math.max(...areas);
    let tolerance = Math.max(minTolerance, TOLERANCE_SHARE * diagonal);
    let ringShare = MIN_RING_SHARE;
    for (let round = 0; round < 40; round++) {
        const kept = [];
        rings.forEach((ring, i) => {
            if (areas[i] < ringShare * largest) return;
            const q = quantize(simplifyRing(ring, tolerance));
            if (q.length >= 3 && planarArea(q) > 0) kept.push(q);
        });
        const points = kept.reduce((sum, ring) => sum + ring.length, 0);
        if (kept.length && points <= maxPoints) {
            return { text: kept.map(encodeRing).join(';'), rings: kept.map(ring => ring.map(([x, y]) => [x / UNIT, y / UNIT])), points };
        }
        if (!kept.length) return null;
        // Moc bodů: hrubší tolerance a u mnoha prstenců i vyšší práh malých ostrůvků
        tolerance *= 1.25;
        if (kept.length > 8) ringShare *= 1.6;
    }
    return null;
};

// --- zdroje --------------------------------------------------------------------------------------------------------

// Obrysy z Natural Earth: QID → [{ layer, features: [mnohoúhelníky] }] v pořadí vrstev
const naturalEarth = async () => {
    const byQid = new Map();
    for (const name of NE_LAYERS) {
        console.log(`Natural Earth: ${name}`);
        const geojson = await layer(name);
        for (const feature of geojson.features) {
            const qid = feature.properties.wikidataid || feature.properties.WIKIDATAID;
            if (!qid) continue;
            if (!byQid.has(qid)) byQid.set(qid, []);
            const entries = byQid.get(qid);
            let entry = entries.find(e => e.layer === name);
            if (!entry) entries.push(entry = { layer: name, features: [] });
            entry.features.push(polygonsOf(feature.geometry));
        }
    }
    return byQid;
};

// Relace OpenStreetMap z Wikidat (P402)
const osmRelations = (qids) => cached('mapa-tvary-p402', async () => {
    const result = {};
    for (let i = 0; i < qids.length; i += 200) {
        const rows = await qlever(`SELECT ?x ?r WHERE { VALUES ?x { ${values(qids.slice(i, i + 200))} } ?x wdt:P402 ?r }`);
        for (const row of rows) {
            const qid = id(row.x.value);
            const relation = row.r.value.trim();
            if (/^\d+$/.test(relation)) (result[qid] = result[qid] || []).push(relation);
        }
        await sleep(500);
    }
    return result;
});

const osmCacheDir = process.env.BUILD_CACHE ? path.resolve(process.env.BUILD_CACHE, 'osm-polygons') : null;
if (osmCacheDir) mkdirSync(osmCacheDir, { recursive: true });
const failedHosts = new Set();
let osmRequests = 0;

const politeFetch = async (url) => {
    await sleep(400);
    osmRequests++;
    return fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120000) });
};

// Obrys relace jako GeoJSON geometrie (null, když ho server nevydá); syrová odpověď se ukládá do BUILD_CACHE/osm-polygons
const osmPolygon = async (relation) => {
    const file = osmCacheDir && path.join(osmCacheDir, `${relation}.json`);
    if (file && existsSync(file)) {
        const text = readFileSync(file, 'utf8');
        return text === 'null' ? null : JSON.parse(text);
    }
    if (process.env.OFFLINE) return null;
    const url = `${OSM_POLYGONS}/get_geojson.py?id=${relation}&params=0`;
    let text = null, triggered = false, networkErrors = 0;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const response = await politeFetch(url);
            const body = await response.text();
            if (response.ok && body.trim().startsWith('{')) { text = body; break; }
            // Neznámý nebo ještě nevygenerovaný obrys: jednou si o vygenerování řekneme, pak znovu
            if (!triggered && (response.status === 500 || response.status === 404 || response.ok)) {
                triggered = true;
                try { await (await politeFetch(`${OSM_POLYGONS}/index.py?id=${relation}`)).text(); } catch { /* jen pokus */ }
                continue;
            }
            if (response.status >= 500 || response.status === 429) { await sleep(2000 * attempt); continue; }
            break;
        } catch (error) {
            networkErrors++;
            console.warn(`  ${relation}: ${error.message} (${attempt}/4)`);
            await sleep(3000 * attempt);
        }
    }
    if (text === null && networkErrors >= 4) {
        failedHosts.add(new URL(OSM_POLYGONS).host);
        return null;  // výpadek spojení se neukládá, příští běh to zkusí znovu
    }
    if (file) writeFileSync(file, text ?? 'null');
    return text ? JSON.parse(text) : null;
};

const geometryPolygons = (geometry) => !geometry ? [] : geometry.type === 'GeometryCollection'
    ? geometry.geometries.flatMap(geometryPolygons) : polygonsOf(geometry);

// --- kontrola a sestavení ------------------------------------------------------------------------------------------

// Rozložené mnohoúhelníky ([[prstenec, díry…], …], [lon, lat]) → obrys, nebo důvod zamítnutí
const buildShape = (item, polygons) => {
    const point = [item.lo, item.la];
    const prepared = polygons.map(rings => rings.map(ring => prepareRing(ring, item.lo)).filter(ring => ring.length >= 3)).filter(rings => rings.length);
    if (!prepared.length) return { reason: 'prázdná geometrie' };
    const area = polygonsKm2(prepared);
    const area0 = item.f && item.f.area;
    if (area0 > 0 && (area > area0 * 3 || area < area0 / 3)) return { reason: `rozloha ${Math.round(area)} km² ≠ ${area0} km²` };
    if (!(area0 > 0) && area > 15e6) return { reason: `nesmyslně velká plocha ${Math.round(area)} km²` };
    const rings = prepared.flat();
    const big = item.ty === 'moře' || sizeKm(bboxOf(rings)) > 2000;
    // Drobné ostrůvky (pár set metrů) by se při běžné toleranci slily do bodu – pak jemněji
    const shape = compress(rings, big ? MAX_POINTS_BIG : MAX_POINTS) || compress(rings, MAX_POINTS, TINY_TOLERANCE);
    if (!shape) return { reason: 'po zjednodušení nic nezbylo' };
    const distance = distanceKm(shape.rings, point);
    const limit = Math.max(NEAR_KM, 0.05 * sizeKm(bboxOf(shape.rings)));
    if (distance > limit) return { reason: `bod ${Math.round(distance)} km od obrysu (mez ${Math.round(limit)} km)` };
    return { shape, area, distance };
};

// Více prvků se stejným QID: jen ty u bodu položky a bez překryvu (pravidlo sudá–lichá by překryv vyrušilo)
const mergeFeatures = (item, features) => {
    const point = [item.lo, item.la];
    const measured = features.map(polygons => {
        const prepared = polygons.map(rings => rings.map(ring => prepareRing(ring, item.lo)).filter(ring => ring.length >= 3)).filter(r => r.length);
        const outer = prepared.map(rings => rings[0]);
        return { prepared, outer, distance: outer.length ? distanceKm(outer, point) : Infinity, size: outer.length ? sizeKm(bboxOf(outer)) : 0, area: polygonsKm2(prepared) };
    }).filter(f => f.prepared.length);
    if (!measured.length) return [];
    const nearest = measured.reduce((a, b) => (a.distance <= b.distance ? a : b));
    const near = measured.filter(f => f === nearest || f.distance <= Math.max(50, nearest.size)).sort((a, b) => b.area - a.area);
    const kept = [];
    for (const feature of near) {
        const overlaps = kept.some(other => feature.outer.some(ring => inRings(other.outer, ring[0])));
        if (!overlaps) kept.push(feature);
    }
    return kept.flatMap(f => f.prepared);
};

const main = async () => {
    const items = zemepis.items.filter(item => (KINDS[item.c] || []).includes(item.ty) && typeof item.la === 'number' && typeof item.lo === 'number');
    console.log(`Položek s plochou: ${items.length}`);
    const ne = await naturalEarth();
    const shapes = {}, origin = {}, rejected = [];

    for (const item of items) {
        for (const entry of ne.get(item.q) || []) {
            const result = buildShape(item, mergeFeatures(item, entry.features));
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'ne'; break; }
            rejected.push(`${item.q} ${item.n} [${entry.layer}]: ${result.reason}`);
        }
    }
    console.log(`Natural Earth: ${Object.keys(shapes).length} obrysů`);

    const rest = items.filter(item => !shapes[item.q]);
    console.log(`Relace OpenStreetMap z Wikidat (${items.length} položek)`);
    const relations = await osmRelations(items.map(item => item.q).sort());
    const pending = rest.filter(item => relations[item.q]);
    console.log(`OpenStreetMap: ${pending.length} položek s relací`);
    let done = 0;
    for (const item of pending) {
        for (const relation of relations[item.q]) {
            const geometry = await osmPolygon(relation);
            if (!geometry) { rejected.push(`${item.q} ${item.n} [osm ${relation}]: obrys nedostupný`); continue; }
            const result = buildShape(item, geometryPolygons(geometry));
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'osm'; break; }
            rejected.push(`${item.q} ${item.n} [osm ${relation}]: ${result.reason}`);
        }
        done++;
        process.stdout.write(`  ${done}/${pending.length} (dotazů ${osmRequests})\r`);
    }
    console.log();

    const ordered = Object.fromEntries(items.filter(item => shapes[item.q]).map(item => [item.q, shapes[item.q].text]));
    const output = { source: SOURCE, generated: new Date().toISOString().slice(0, 10), shapes: ordered };
    const json = JSON.stringify(output);
    writeFileSync(dataFile, json + '\n');

    if (rejected.length) {
        console.log(`\nZamítnuté obrysy (${rejected.length}):`);
        rejected.forEach(line => console.log('  ' + line));
    }
    console.log('\nPokrytí (obrys / položek, z toho NE + OSM):');
    const table = {};
    for (const item of items) {
        const key = `${item.c}/${item.ty}`;
        const row = table[key] = table[key] || { have: 0, total: 0, ne: 0, osm: 0 };
        row.total++;
        if (shapes[item.q]) { row.have++; row[origin[item.q]]++; }
    }
    for (const [key, row] of Object.entries(table)) console.log(`  ${key.padEnd(24)} ${String(row.have).padStart(4)} / ${String(row.total).padEnd(4)} (NE ${row.ne}, OSM ${row.osm})`);
    const points = Object.values(shapes).reduce((sum, shape) => sum + shape.points, 0);
    console.log(`Celkem ${Object.keys(ordered).length} / ${items.length} obrysů, ${points} bodů, ${(Buffer.byteLength(json) / 1024).toFixed(1)} kB → data/mapa-tvary.json`);
    if (failedHosts.size) console.warn(`Nedostupné servery: ${[...failedHosts].join(', ')}`);
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
