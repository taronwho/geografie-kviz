// Slepá mapa městských částí: obrysy pražských městských částí (okruh Pražské části ve Vlajkách a znacích) z OpenStreetMap
// (© přispěvatelé OpenStreetMap, ODbL), zapsané do data/regiony.json pod cities.<Wikidata města> stejně jako regiony států
// (scripts/build-regiony.mjs): c = obrys města, l = hranice částí, i = část položky (b = rámec, p = tečka, r = obrys).
// Natural Earth městské části nemá; hranice se berou z Nominatim (vyhledání podle názvu, shoda podle značky wikidata).
// Spuštění: npm run build:casti (s BUILD_CACHE=složka se odpovědi uloží a další běh se sítě neptá)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { polygonsOf, simplify, planarArea } from './lib/natural-earth.mjs';
import { encodePoints } from './lib/regional-encode.mjs';

const require = createRequire(import.meta.url);
const { mercatorY } = require('../quiz-core.js');
const regionsFile = new URL('../data/regiony.json', import.meta.url);
const vlajky = JSON.parse(readFileSync(new URL('../data/vlajky.json', import.meta.url), 'utf8'));

// Města s částmi: Wikidata města, relace města v OpenStreetMap, výběr položek
const CITIES = [{ q: 'Q1085', relation: 'R435514', name: 'Praha', items: (item) => item.ty === 'městská část' && (item.co || [])[0] === 'Q213' }];
// Zápis po q stupních (asi 15 m) a zjednodušení: na telefonu (360 px) je přiblížené město široké asi 0,1° délky
const Q = 0.0002;
const TOLERANCE = 0.00025;
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'Mudrlant/1.0 (quiz map build; one-off boundary download)';
const cacheDir = process.env.BUILD_CACHE ? path.resolve(process.env.BUILD_CACHE, 'nominatim') : null;
if (cacheDir) mkdirSync(cacheDir, { recursive: true });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Nominatim smí dostat nejvýš jeden dotaz za sekundu
const fetchJson = async (url) => {
    const file = cacheDir && path.join(cacheDir, `${crypto.createHash('sha1').update(url).digest('hex')}.json`);
    if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    await sleep(1100);
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'cs' } });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const json = await response.json();
    if (file) writeFileSync(file, JSON.stringify(json));
    return json;
};
const GEOMETRY = 'format=json&polygon_geojson=1&polygon_threshold=0.0001&extratags=1';
const search = (query) => fetchJson(`${NOMINATIM}/search?q=${encodeURIComponent(query)}&countrycodes=cz&limit=5&${GEOMETRY}`);
const lookup = (ids) => fetchJson(`${NOMINATIM}/lookup?osm_ids=${ids}&${GEOMETRY}`);

const project = ([lon, lat]) => [lon, mercatorY(lat)];
const bboxOf = (points) => points.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const round4 = (values) => values.map(value => Math.round(value * 10000) / 10000);
const inRing = (ring, [x, y]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};
const encodeRings = (rings) => rings.map(ring => simplify(ring.map(project), TOLERANCE)).filter(ring => ring.length >= 4 && planarArea(ring) > 0)
    .map(ring => encodePoints(ring.slice(0, -1), Q)).filter(encoded => encoded.count >= 3).map(encoded => encoded.text);
const encodeLines = (rings) => rings.map(ring => encodePoints(simplify(ring.map(project), TOLERANCE), Q)).filter(encoded => encoded.count >= 2).map(encoded => encoded.text);
const outerRings = (geometry) => polygonsOf(geometry).map(polygon => polygon[0]);

// Hranice části: výsledek se značkou wikidata položky, přednostně správní hranice (boundary=administrative)
const findPart = async (item) => {
    const names = [item.n, ...(/^Praha[ -]/u.test(item.n) ? [] : [`Praha-${item.n}`])];
    for (const name of names) {
        const results = await search(`${name}, Praha`);
        const matching = results.filter(result => (result.extratags || {}).wikidata === item.q && /Polygon/.test((result.geojson || {}).type || ''));
        const best = matching.find(result => result.class === 'boundary' && result.type === 'administrative') || matching[0];
        if (best) return best;
    }
    return null;
};

const regions = JSON.parse(readFileSync(regionsFile, 'utf8'));
const cities = {};
for (const city of CITIES) {
    const [outline] = await lookup(city.relation);
    if (!outline) throw new Error(`Obrys města ${city.name} se nenašel`);
    const cityRings = outerRings(outline.geojson);
    const entry = { a: city.name, q: Q, m: 0.05, f: round4(bboxOf(cityRings.flat().map(project))), c: encodeRings(cityRings), o: [], l: [], w: [], i: {} };
    const missing = [];
    for (const item of vlajky.items.filter(city.items)) {
        const part = await findPart(item);
        if (!part) { missing.push(item.n); continue; }
        const rings = outerRings(part.geojson);
        entry.l.push(...encodeLines(rings));
        const point = project([item.lo, item.la]);
        const projected = rings.map(ring => ring.map(project));
        // Tečka: poloha položky, když leží v části, jinak střed rámce největšího prstence
        const largest = projected.reduce((best, ring) => planarArea(ring) > planarArea(best) ? ring : best);
        const box = bboxOf(largest);
        const inside = projected.some(ring => inRing(ring, point)) ? point : [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
        entry.i[item.q] = { b: round4(bboxOf(projected.flat())), p: round4(inside), r: encodeRings(rings) };
    }
    cities[city.q] = entry;
    console.log(`${city.name}: ${Object.keys(entry.i).length} částí, ${Math.round(JSON.stringify(entry).length / 1024)} kB${missing.length ? `, chybí: ${missing.join(', ')}` : ''}`);
}
regions.citiesSource = '© přispěvatelé OpenStreetMap (ODbL 1.0): hranice městských částí';
regions.cities = cities;
writeFileSync(regionsFile, JSON.stringify(regions));
