// Obrysy plošných míst pro otázku „Ukaž na mapě“ (jezera, moře, zálivy, průlivy, ostrovy, souostroví, národní parky,
// pouště, poloostrovy, pohoří, státy, regiony a kraje) a průběh řek: klepnutí kamkoli dovnitř obrysu je přesný zásah
// a vzdálenost se měří od okraje (u řeky od čáry).
// Zdroje: 1. Natural Earth 5.1.2 (volné dílo) – shoda podle vlastnosti wikidataid (u regionů i podle bodu položky ve
// správné zemi, u řek i podle jména); 2. OpenStreetMap (© přispěvatelé OpenStreetMap, ODbL) – relace z vlastnosti
// Wikidat P402, obrys z polygons.openstreetmap.fr, průběh řeky z API OpenStreetMap.
// Každý obrys projde kontrolou (bod položky uvnitř nebo blízko, rozloha zhruba sedí s Wikidaty, délka řeky sedí),
// jinak se zahodí.
//
// Zápis data/mapa-tvary.json: { source, generated, shapes: { QID: "prstenec;prstenec;…" nebo "~čára;čára;…" } }.
// Prstenec = celá čísla oddělená čárkou v tisícinách stupně (Math.round(stupně * 1000)): první dvojice je šířka a délka
// prvního bodu, každá další dvojice je rozdíl (Δšířka, Δdélka) od předchozího bodu. Prstence (vnější i díry) se
// vyhodnocují pravidlem sudá–lichá přes všechny prstence; první bod se na konci neopakuje. Délka je v prstenci souvislá
// (přes 180. poledník pokračuje za ±180), celý obrys leží u bodu položky.
// Řeka (text začíná „~“): lomené čáry oddělené „;“, každá zapsaná stejně jako prstenec, ale NEuzavřená (poslední bod
// se s prvním nespojuje); vzdálenost tipu se měří od nejbližšího úseku.
// Spuštění: npm run build:mapa-tvary (s BUILD_CACHE=složka se odpovědi uloží a další běh se sítě neptá;
// OFFLINE=1 použije jen obrysy a řeky OpenStreetMap už uložené v mezipaměti)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { layer, polygonsOf, linesOf } from './lib/natural-earth.mjs';
import { qlever, values, cached, sleep, id } from './lib/wikidata.mjs';
import {
    prepareRing, prepareLine, sphericalKm2, inRings, distanceKm, lineDistanceKm, lineKm, bboxOf, sizeKm, polygonsKm2,
    dissolve, compress, compressLines, joinLines, encodeRing, decodeShape
} from './lib/mapa-tvary-geo.mjs';

export { sphericalKm2, inRings, distanceKm, encodeRing, decodeShape };

const dataFile = new URL('../data/mapa-tvary.json', import.meta.url);
const zemepis = JSON.parse(readFileSync(new URL('../data/zemepis.json', import.meta.url), 'utf8'));
const vlajky = JSON.parse(readFileSync(new URL('../data/vlajky.json', import.meta.url), 'utf8'));

// Které položky zeměpisu mají obrys plochy: okruh → druhy (státy, řeky a regiony z vlajek mají vlastní skupiny níž)
export const KINDS = {
    jezero: ['jezero', 'přehradní nádrž', 'laguna', 'moře', 'zátoka', 'průliv'],
    ostrov: ['ostrov', 'souostroví'],
    priroda: ['národní park', 'poušť', 'poloostrov']
};
const NE_LAYERS = ['ne_10m_lakes', 'ne_10m_lakes_europe', 'ne_10m_lakes_north_america', 'ne_10m_geography_marine_polys', 'ne_10m_geography_regions_polys'];
const SOURCE = 'Natural Earth 5.1.2 (naturalearthdata.com, volné dílo); OpenStreetMap (© přispěvatelé OpenStreetMap, data pod licencí ODbL 1.0, '
    + 'openstreetmap.org/copyright; obrysy relací z polygons.openstreetmap.fr a průběh řek z API OpenStreetMap podle vlastnosti Wikidat P402)';

const OSM_POLYGONS = 'https://polygons.openstreetmap.fr';
const OSM_API = 'https://api.openstreetmap.org/api/0.6';
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const NEAR_KM = 15;             // bod položky smí ležet tak daleko od obrysu (nebo 5 % jeho velikosti)
const RIVER_NEAR_KM = 30;       // bod řeky smí ležet tak daleko od čáry
const RIVER_LENGTH_FACTOR = 2.5;
const RIVER_OSM_MAX = 40;       // nejvýš tolik řek z API OpenStreetMap (jen známé, které Natural Earth nemá nebo jen kus)
const RIVER_WEAK_KM = 100;      // čára z Natural Earth dál od bodu (chybí horní tok): zkusí se i OpenStreetMap

// Zjednodušení podle skupiny: plochy jako dřív; státy a regiony hruběji (na mapě světa se měří s tolerancí ~200 km),
// kraje Česka jemněji (mapa Česka)
const AREA_OPTIONS = { maxPoints: 150, maxPointsBig: 300 };
// trustInside: shoda QID s bodem položky uvnitř obrysu stačí i při nesedící rozloze (Wikidata mají u některých regionů
// rozlohu i s mořem nebo nárokem v Antarktidě); nearShare: bod souostrovního státu může ležet v moři mezi ostrovy
const STATE_OPTIONS = { maxPoints: 120, maxPointsBig: 250, toleranceShare: 0.005, ringShare: 0.005, manyRings: 30, minTolerance: 0.01, toleranceBasis: 'largest', dissolve: true, trustInside: true, nearShare: 0.35 };
const REGION_OPTIONS = { maxPoints: 42, maxPointsBig: 80, toleranceShare: 0.012, ringShare: 0.01, manyRings: 10, minTolerance: 0.01, toleranceBasis: 'largest', dissolve: true, trustInside: true };
const KRAJ_OPTIONS = { maxPoints: 110, maxPointsBig: 110, toleranceShare: 0.004, ringShare: 0.01, minTolerance: 0.003, dissolve: true, trustInside: true };
const RIVER_OPTIONS = { maxPoints: 120, toleranceShare: 0.005, minTolerance: 0.005, minShare: 0.02 };
const BIG_KM = 2000;

// Státy, které Natural Earth vede rozdělené (neuznané části) nebo pod jiným QID: QID položky → QID prvků Natural Earth
const STATE_FEATURES = {
    Q219060: ['Q23792'],                       // Stát Palestina → Palestinská území
    Q1045: ['Q1045', 'Q34754'],                // Somálsko včetně Somalilandu
    Q229: ['Q229', 'Q23681', 'Q116970']        // Kypr včetně severu a nárazníkové zóny
};
const SMALL_STATE_KM2 = 20000;                 // menší státy rovnou z 1 : 10 mil. (v 1 : 50 mil. jsou jen hrubě)

// Regiony, které Natural Earth vede ještě po starých částech: QID → země a jména prvků admin-1
const REGION_PARTS = {
    Q127676: ['NOR', ['Nord-Trøndelag', 'Sør-Trøndelag']],   // Trøndelag
    Q2729021: ['NOR', ['Aust-Agder', 'Vest-Agder']],         // Agder
    Q56404886: ['NOR', ['Hedmark', 'Oppland']]               // Innlandet
};

// --- zdroje --------------------------------------------------------------------------------------------------------

// Obrysy z Natural Earth: QID → [{ layer, features: [mnohoúhelníky] }] v pořadí vrstev
const naturalEarth = async (layers) => {
    const byQid = new Map();
    for (const name of layers) {
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
const osmRelations = (cacheName, qids) => cached(cacheName, async () => {
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

// Jména řek z Wikidat (anglicky, německy, francouzsky, španělsky, štítky i aliasy) pro shodu s Natural Earth
const riverNames = (qids) => cached('mapa-tvary-reky-jmena', async () => {
    const result = {};
    for (let i = 0; i < qids.length; i += 150) {
        const rows = await qlever(`PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?x ?l WHERE { VALUES ?x { ${values(qids.slice(i, i + 150))} } { ?x rdfs:label ?l } UNION { ?x skos:altLabel ?l }
FILTER(LANG(?l) IN ("en", "de", "fr", "es", "pt", "ru")) }`);
        for (const row of rows) (result[id(row.x.value)] = result[id(row.x.value)] || []).push(row.l.value);
        await sleep(500);
    }
    return result;
});

const cacheDir = (name) => {
    if (!process.env.BUILD_CACHE) return null;
    const dir = path.resolve(process.env.BUILD_CACHE, name);
    mkdirSync(dir, { recursive: true });
    return dir;
};
const osmCacheDir = cacheDir('osm-polygons');
const riverCacheDir = cacheDir('osm-rivers');
const failedHosts = new Set();
let osmRequests = 0;

const politeFetch = async (url, delay = 400) => {
    await sleep(delay);
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
    if (process.env.OFFLINE || failedHosts.has(new URL(OSM_POLYGONS).host)) return null;
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

// Průběh řeky z relace OpenStreetMap (waterway): cesty hlavního toku ([[lon, lat], …]), null když relace není;
// do BUILD_CACHE/osm-rivers se ukládají už vybrané čáry (odpověď API má i megabajty)
const osmRiver = async (relation) => {
    const file = riverCacheDir && path.join(riverCacheDir, `${relation}.json`);
    if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    const host = new URL(OSM_API).host;
    if (process.env.OFFLINE || failedHosts.has(host)) return null;
    let lines = null, networkErrors = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await politeFetch(`${OSM_API}/relation/${relation}/full.json`, 1500);
            if (response.status === 404 || response.status === 410) { lines = []; break; }
            if (response.status === 429 || response.status >= 500) { await sleep(10000 * attempt); continue; }
            if (!response.ok) { lines = []; break; }
            const { elements } = await response.json();
            const nodes = new Map(elements.filter(e => e.type === 'node').map(e => [e.id, [e.lon, e.lat]]));
            const ways = new Map(elements.filter(e => e.type === 'way').map(e => [e.id, e]));
            const rel = elements.find(e => e.type === 'relation' && e.id === Number(relation));
            lines = [];
            for (const member of (rel && rel.members) || []) {
                if (member.type !== 'way' || !['', 'main_stream', 'main'].includes(member.role || '')) continue;
                const way = ways.get(member.ref);
                const tags = (way && way.tags) || {};
                if (!way || (tags.waterway && !['river', 'stream', 'canal'].includes(tags.waterway))) continue;
                const line = way.nodes.map(n => nodes.get(n)).filter(Boolean);
                if (line.length >= 2) lines.push(line);
            }
            break;
        } catch (error) {
            networkErrors++;
            console.warn(`  řeka ${relation}: ${error.message} (${attempt}/3)`);
            await sleep(5000 * attempt);
        }
    }
    if (lines === null) {
        if (networkErrors >= 3) failedHosts.add(host);
        return null;
    }
    if (file) writeFileSync(file, JSON.stringify(lines));
    return lines;
};

const geometryPolygons = (geometry) => !geometry ? [] : geometry.type === 'GeometryCollection'
    ? geometry.geometries.flatMap(geometryPolygons) : polygonsOf(geometry);

// --- kontrola a sestavení ploch ------------------------------------------------------------------------------------

const preparePolygons = (item, polygons) => polygons.map(rings => rings.map(ring => prepareRing(ring, item.lo)).filter(ring => ring.length >= 3)).filter(rings => rings.length);

// Rozložené mnohoúhelníky ([[prstenec, díry…], …], [lon, lat]) → obrys, nebo důvod zamítnutí
const buildShape = (item, polygons, options = AREA_OPTIONS, areaFactor = 3) => {
    const point = [item.lo, item.la];
    const prepared = preparePolygons(item, polygons);
    if (!prepared.length) return { reason: 'prázdná geometrie' };
    const area = polygonsKm2(prepared);
    const area0 = item.f && item.f.area;
    const areaOff = area0 > 0 && (area > area0 * areaFactor || area < area0 / areaFactor);
    if (areaOff && !(options.trustInside && inRings(prepared.flat(), point))) return { reason: `rozloha ${Math.round(area)} km² ≠ ${area0} km²` };
    if (!(area0 > 0) && area > 15e6) return { reason: `nesmyslně velká plocha ${Math.round(area)} km²` };
    const rings = options.dissolve ? dissolve(prepared.flat()) : prepared.flat();
    const big = item.ty === 'moře' || sizeKm(bboxOf(rings)) > BIG_KM;
    const { maxPoints, maxPointsBig, dissolve: _, trustInside, insideWithoutArea, nearShare = 0.05, ...rest } = options;
    // Drobné ostrůvky (pár set metrů) by se při běžné toleranci slily do bodu – pak jemněji
    const shape = compress(rings, { ...rest, maxPoints: big ? maxPointsBig : maxPoints })
        || compress(rings, { ...rest, maxPoints, minTolerance: 0.0005 });
    if (!shape) return { reason: 'po zjednodušení nic nezbylo' };
    const distance = distanceKm(shape.rings, point);
    const limit = Math.max(NEAR_KM, nearShare * sizeKm(bboxOf(shape.rings)));
    if (distance > limit) return { reason: `bod ${Math.round(distance)} km od obrysu (mez ${Math.round(limit)} km)` };
    // Pohoří bez známé rozlohy: obrys z OSM bývá jen část (rezervace, přírodní park) – bere se, jen když bod leží uvnitř
    // (Moravskoslezské Beskydy měly obrys 23 km² devět kilometrů od bodu)
    if (insideWithoutArea && !(area0 > 0) && distance > 1) return { reason: `bez rozlohy a bod ${Math.round(distance)} km mimo obrys` };
    return { shape, area, distance };
};

// Více prvků se stejným QID: jen ty u bodu položky a bez překryvu (pravidlo sudá–lichá by překryv vyrušilo)
const mergeFeatures = (item, features) => {
    const point = [item.lo, item.la];
    const measured = features.map(polygons => {
        const prepared = preparePolygons(item, polygons);
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

// Společný postup: Natural Earth podle QID (případně vlastní hledání), pak OpenStreetMap z P402
const buildAreas = async (label, items, { ne, extra, relationsCache, options, shapes, origin, rejected }) => {
    for (const item of items) {
        for (const entry of ne.get(item.q) || []) {
            const result = buildShape(item, mergeFeatures(item, entry.features), options(item));
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'ne'; break; }
            rejected.push(`${item.q} ${item.n} [${entry.layer}]: ${result.reason}`);
        }
        if (!shapes[item.q] && extra) {
            const result = extra(item);
            if (result && result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'ne'; } else if (result) rejected.push(`${item.q} ${item.n} [ne podle bodu]: ${result.reason}`);
        }
    }
    const rest = items.filter(item => !shapes[item.q]);
    console.log(`${label}: Natural Earth ${items.length - rest.length} / ${items.length}`);
    const relations = await osmRelations(relationsCache, items.map(item => item.q).sort());
    const pending = rest.filter(item => relations[item.q]);
    console.log(`${label}: OpenStreetMap ${pending.length} položek s relací`);
    let done = 0;
    for (const item of pending) {
        for (const relation of relations[item.q]) {
            const geometry = await osmPolygon(relation);
            if (!geometry) { rejected.push(`${item.q} ${item.n} [osm ${relation}]: obrys nedostupný`); continue; }
            const result = buildShape(item, geometryPolygons(geometry), options(item));
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'osm'; break; }
            rejected.push(`${item.q} ${item.n} [osm ${relation}]: ${result.reason}`);
        }
        done++;
        process.stdout.write(`  ${done}/${pending.length} (dotazů ${osmRequests})\r`);
    }
    if (pending.length) console.log();
};

// Regiony bez shody QID: prvek admin-1 země položky, ve kterém leží bod položky – sám, nebo s dalšími prvky stejného
// regionu (francouzské departementy → region, italské provincie → region, hrabství → Anglie); rozloha musí sedět těsněji
const regionByPoint = (admin1, countryCodes) => (item) => {
    const codes = (item.co || []).flatMap(q => countryCodes.get(q) || []);
    const features = admin1.filter(f => codes.includes(f.properties.adm0_a3));
    if (!features.length) return { reason: 'země bez prvků admin-1' };
    const point = [item.lo, item.la];
    const prepared = features.map(f => ({ f, polygons: preparePolygons(item, polygonsOf(f.geometry)) }));
    // Prvky u bodu (bod hlavního města oblasti může ležet v samostatném prvku města)
    const hosts = prepared.map(p => ({ ...p, d: distanceKm(p.polygons.flat(), point) })).filter(p => p.d < 2 * NEAR_KM).sort((a, b) => a.d - b.d);
    if (!hosts.length) return { reason: 'bod neleží v žádném prvku admin-1' };
    const candidates = [];
    const parts = REGION_PARTS[item.q];
    if (parts) candidates.push(prepared.filter(p => p.f.properties.adm0_a3 === parts[0] && parts[1].includes(p.f.properties.name)));
    for (const host of hosts) {
        candidates.push([host]);
        for (const field of ['region', 'region_sub', 'geonunit']) {
            const value = host.f.properties[field];
            if (value) candidates.push(prepared.filter(p => p.f.properties[field] === value));
        }
    }
    const area0 = item.f && item.f.area;
    let best = null;
    for (const group of candidates) {
        const polygons = group.flatMap(p => p.polygons);
        const area = polygonsKm2(polygons);
        const ratio = area0 > 0 ? Math.max(area / area0, area0 / area) : Infinity;
        if (ratio > 1.6 || !polygons.length) continue;
        if (!best || ratio < best.ratio) best = { ratio, polygons };
    }
    if (!best) return { reason: `rozloha prvků u bodu nesedí s ${area0} km²` };
    return buildShape(item, best.polygons, { ...(item.c === 'cesko' ? KRAJ_OPTIONS : REGION_OPTIONS), trustInside: false }, 1.6);
};

// --- řeky ----------------------------------------------------------------------------------------------------------

const normalizeName = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(river|rio|rivière|riviere|fleuve|fluss|reka|река)\b/g, ' ').replace(/[^a-z0-9а-я]+/g, ' ').trim();

// Úseky řek z Natural Earth: { lines, names, altNames, qid, rank }
const naturalEarthRivers = async () => {
    const segments = [];
    for (const name of ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_rivers_north_america']) {
        console.log(`Natural Earth: ${name}`);
        const geojson = await layer(name);
        for (const feature of geojson.features) {
            const p = feature.properties;
            const lines = linesOf(feature.geometry).filter(line => line.length >= 2);
            if (!lines.length) continue;
            const names = new Set([p.name, p.name_en].filter(Boolean).map(normalizeName).filter(Boolean));
            // name_alt v doplňkových vrstvách často jmenuje řeku, do které úsek teče (Oka → Volga), jako jiné jméno se
            // bere jen v hlavní vrstvě
            const altNames = name === 'ne_10m_rivers_lake_centerlines' ? new Set(String(p.name_alt || '').split(/[;,/]/).map(normalizeName).filter(Boolean)) : new Set();
            segments.push({ lines, names, altNames, qid: p.wikidataid || null, rank: p.scalerank ?? 99, layer: name });
        }
    }
    return segments;
};

const endpoints = (lines) => lines.flatMap(line => [line[0], line[line.length - 1]]);
const pointKm = ([x1, y1], [x2, y2]) => Math.hypot((x2 - x1) * 111.32 * Math.cos((y1 + y2) / 2 * Math.PI / 180), (y2 - y1) * 110.57);

// Mez vzdálenosti bodu řeky od čáry: 30 km; Natural Earth ale často nemá horní tok (bod položky bývá u pramene),
// takže u řeky, jejíž (zjednodušená) čára má aspoň polovinu délky z Wikidat, stačí 12 % délky (nejvýš 800 km)
const riverLimitKm = (item, length = Infinity) => {
    const len0 = item.f && item.f.len;
    return len0 > 0 && length >= 0.5 * len0 ? Math.max(RIVER_NEAR_KM, Math.min(800, 0.12 * len0)) : RIVER_NEAR_KM;
};

// Úseky řeky → souvislé skupiny (konce do 20 km od sebe); vybere se skupina u bodu položky a skupiny se shodou QID u bodu,
// k nim se přidají stejně pojmenované skupiny s mezerou do 8 % délky řeky (úseky přerušené přehradou bez jména);
// úseky, které jen kopírují už vybrané (stejná řeka ve dvou vrstvách), se vynechají
const riverFromSegments = (item, segments) => {
    const point = [item.lo, item.la];
    const pool = segments.map(s => ({ ...s, lines: s.lines.map(line => prepareLine(line, item.lo)) }));
    const parent = pool.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const ends = pool.map(s => endpoints(s.lines));
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
        if (find(i) === find(j)) continue;
        if (ends[i].some(a => ends[j].some(b => pointKm(a, b) < 20))) parent[find(i)] = find(j);
    }
    const groups = new Map();
    pool.forEach((s, i) => { const root = find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(s); });
    const measured = [...groups.values()].map(group => ({ group, distance: lineDistanceKm(group.flatMap(s => s.lines), point), qid: group.some(s => s.qid === item.q) }));
    const nearest = measured.reduce((a, b) => (a.distance <= b.distance ? a : b));
    // I skupina se shodou QID musí ležet u bodu (Natural Earth má pod QID Lublaňky i kus Sávy)
    const chosen = measured.filter(m => (m === nearest || m.qid) && m.distance <= riverLimitKm(item));
    if (!chosen.length) return { reason: `čára ${Math.round(nearest.distance)} km od bodu` };
    const gap = Math.max(20, 0.08 * ((item.f && item.f.len) || 0));
    for (let grown = true; grown;) {
        grown = false;
        const chosenEnds = chosen.flatMap(m => endpoints(m.group.flatMap(s => s.lines)));
        for (const m of measured) {
            if (chosen.includes(m)) continue;
            const mEnds = endpoints(m.group.flatMap(s => s.lines));
            if (mEnds.some(a => chosenEnds.some(b => pointKm(a, b) < gap))) { chosen.push(m); grown = true; }
        }
    }
    const selected = [];
    for (const segment of chosen.flatMap(m => m.group).sort((a, b) => a.rank - b.rank)) {
        const already = selected.flatMap(s => s.lines);
        const sample = segment.lines.flat().filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 20)) === 0);
        const copied = already.length && sample.filter(p => lineDistanceKm(already, p) < 3).length >= 0.8 * sample.length;
        if (!copied) selected.push(segment);
    }
    return { lines: selected.flatMap(s => s.lines) };
};

const buildRiver = (item, lines) => {
    if (!lines || !lines.length) return { reason: 'žádné úseky' };
    const point = [item.lo, item.la];
    const joined = joinLines(lines.map(line => prepareLine(line, item.lo)));
    const length = joined.reduce((sum, line) => sum + lineKm(line), 0);
    const len0 = item.f && item.f.len;
    if (len0 > 0 && (length > len0 * RIVER_LENGTH_FACTOR || length < len0 / RIVER_LENGTH_FACTOR)) return { reason: `délka ${Math.round(length)} km ≠ ${len0} km` };
    const shape = compressLines(joined, RIVER_OPTIONS);
    if (!shape) return { reason: 'po zjednodušení nic nezbylo' };
    const distance = lineDistanceKm(shape.lines, point);
    const drawn = shape.lines.reduce((sum, line) => sum + lineKm(line), 0);
    if (distance > riverLimitKm(item, drawn)) return { reason: `bod ${Math.round(distance)} km od čáry (délka ${Math.round(drawn)} km)` };
    return { shape, length, distance };
};

// --- hlavní běh ----------------------------------------------------------------------------------------------------

const hasPoint = (item) => typeof item.la === 'number' && typeof item.lo === 'number';

export const GROUPS = {
    plochy: (item, file) => file === 'zemepis' && (KINDS[item.c] || []).includes(item.ty),
    pohori: (item, file) => file === 'zemepis' && item.c === 'hora' && item.ty === 'pohoří',
    staty: (item, file) => file === 'zemepis' && item.c === 'stat',
    reky: (item, file) => file === 'zemepis' && item.c === 'reka',
    regiony: (item, file) => file === 'vlajky' && (item.c === 'regiony' || (item.c === 'cesko' && item.ty === 'kraj'))
};

const main = async () => {
    const all = [...zemepis.items.map(item => ({ item, file: 'zemepis' })), ...vlajky.items.map(item => ({ item, file: 'vlajky' }))];
    const groupItems = {};
    const taken = new Set();
    for (const [group, test] of Object.entries(GROUPS)) {
        groupItems[group] = all.filter(({ item, file }) => test(item, file) && hasPoint(item) && !taken.has(item.q)).map(({ item }) => item);
        groupItems[group].forEach(item => taken.add(item.q));
        console.log(`Skupina ${group}: ${groupItems[group].length} položek`);
    }
    const shapes = {}, origin = {}, rejected = [];
    const context = { shapes, origin, rejected };

    // Plochy (jezera, ostrovy, příroda) a pohoří
    const ne = await naturalEarth(NE_LAYERS);
    await buildAreas('Plochy', groupItems.plochy, { ...context, ne, relationsCache: 'mapa-tvary-p402', options: () => AREA_OPTIONS });
    await buildAreas('Pohoří', groupItems.pohori, { ...context, ne, relationsCache: 'mapa-tvary-p402-pohori', options: () => ({ ...AREA_OPTIONS, insideWithoutArea: true }) });

    // Státy: Natural Earth 1 : 50 mil., drobné státy, které tam nejsou, z 1 : 10 mil.
    const countries = await naturalEarth(['ne_50m_admin_0_countries', 'ne_10m_admin_0_countries']);
    const stateSource = new Map();
    for (const item of groupItems.staty) {
        const qids = STATE_FEATURES[item.q] || [item.q];
        const layers = ['ne_50m_admin_0_countries', 'ne_10m_admin_0_countries'];
        if (item.f && item.f.area < SMALL_STATE_KM2) layers.reverse();
        const entries = [];
        for (const layerName of layers) {
            const features = qids.flatMap(q => ((countries.get(q) || []).find(e => e.layer === layerName) || { features: [] }).features);
            if (features.length && qids.every(q => (countries.get(q) || []).some(e => e.layer === layerName))) entries.push({ layer: layerName, features: [features.flat()] });
        }
        stateSource.set(item.q, entries);
    }
    await buildAreas('Státy', groupItems.staty, { ...context, ne: stateSource, relationsCache: 'mapa-tvary-p402-staty', options: () => STATE_OPTIONS });

    // Regiony a kraje Česka: admin-1 podle QID, jinak podle bodu ve správné zemi, nakonec OpenStreetMap
    const admin0 = (await layer('ne_10m_admin_0_countries')).features;
    const countryCodes = new Map();
    for (const f of admin0) {
        const q = f.properties.WIKIDATAID;
        if (!countryCodes.has(q)) countryCodes.set(q, []);
        for (const code of [f.properties.ADM0_A3, f.properties.SOV_A3]) if (!countryCodes.get(q).includes(code)) countryCodes.get(q).push(code);
    }
    const admin1 = (await layer('ne_10m_admin_1_states_provinces')).features;
    const regionSource = new Map();
    for (const f of admin1) {
        const q = f.properties.wikidataid;
        if (!q) continue;
        if (!regionSource.has(q)) regionSource.set(q, [{ layer: 'ne_10m_admin_1_states_provinces', features: [] }]);
        regionSource.get(q)[0].features.push(polygonsOf(f.geometry));
    }
    // Více prvků se stejným QID (region z více částí) se slučuje celé, ne jen nejbližší
    for (const entry of regionSource.values()) entry[0].features = [entry[0].features.flat()];
    await buildAreas('Regiony', groupItems.regiony, {
        ...context, ne: regionSource, extra: regionByPoint(admin1, countryCodes), relationsCache: 'mapa-tvary-p402-regiony',
        options: item => (item.c === 'cesko' ? KRAJ_OPTIONS : REGION_OPTIONS)
    });

    // Řeky jako čáry: Natural Earth podle QID a jména, pak OpenStreetMap (jen známé, nejvýš RIVER_OSM_MAX)
    const segments = await naturalEarthRivers();
    const rivers = groupItems.reky;
    const names = await riverNames(rivers.map(item => item.q).sort());
    const byName = new Map(), byAlt = new Map(), byQid = new Map();
    const add = (map, key, segment) => { if (!map.has(key)) map.set(key, []); map.get(key).push(segment); };
    for (const s of segments) {
        s.names.forEach(n => add(byName, n, s));
        s.altNames.forEach(n => add(byAlt, n, s));
        if (s.qid) add(byQid, s.qid, s);
    }
    const distances = {};
    for (const item of rivers) {
        const keys = new Set([item.n, item.t, ...(names[item.q] || [])].map(normalizeName).filter(Boolean));
        const attempts = [];
        const qidSegments = byQid.get(item.q) || [];
        const nameSegments = [...keys].flatMap(k => byName.get(k) || []);
        const altSegments = [...keys].flatMap(k => byAlt.get(k) || []);
        if (qidSegments.length || nameSegments.length) attempts.push(['ne', [...new Set([...qidSegments, ...nameSegments])]]);
        if (altSegments.length) attempts.push(['ne alt', [...new Set([...qidSegments, ...nameSegments, ...altSegments])]]);
        for (const [source, pool] of attempts) {
            const picked = riverFromSegments(item, pool);
            const result = picked.lines ? buildRiver(item, picked.lines) : picked;
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'ne'; distances[item.q] = result.distance; break; }
            rejected.push(`${item.q} ${item.n} [${source}]: ${result.reason}`);
        }
    }
    console.log(`Řeky: Natural Earth ${rivers.filter(item => shapes[item.q]).length} / ${rivers.length}`);
    const riverRelations = await osmRelations('mapa-tvary-p402-reky', rivers.map(item => item.q).sort());
    // Nejdřív známé řeky bez čáry (od nejdelších), pak známé, kterým Natural Earth chybí kus u bodu položky
    const byLength = (a, b) => ((b.f && b.f.len) || 0) - ((a.f && a.f.len) || 0);
    const known = rivers.filter(item => item.k === 1 && riverRelations[item.q]);
    const missing = [...known.filter(item => !shapes[item.q]).sort(byLength), ...known.filter(item => distances[item.q] > RIVER_WEAK_KM).sort(byLength)].slice(0, RIVER_OSM_MAX);
    console.log(`Řeky: OpenStreetMap ${missing.length} známých řek s relací`);
    let done = 0;
    for (const item of missing) {
        for (const relation of riverRelations[item.q]) {
            const lines = await osmRiver(relation);
            if (!lines) { rejected.push(`${item.q} ${item.n} [osm ${relation}]: relace nedostupná`); continue; }
            const result = buildRiver(item, lines);
            if (result.shape && shapes[item.q] && !(result.distance < distances[item.q])) { rejected.push(`${item.q} ${item.n} [osm ${relation}]: bod ${Math.round(result.distance)} km od čáry, Natural Earth má blíž`); break; }
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'osm'; break; }
            rejected.push(`${item.q} ${item.n} [osm ${relation}]: ${result.reason}`);
        }
        done++;
        process.stdout.write(`  ${done}/${missing.length} (dotazů ${osmRequests})\r`);
    }
    if (missing.length) console.log();

    // Zápis: v pořadí položek (zeměpis, pak vlajky)
    const ordered = Object.fromEntries(Object.values(groupItems).flat().filter(item => shapes[item.q])
        .sort((a, b) => all.findIndex(x => x.item === a) - all.findIndex(x => x.item === b)).map(item => [item.q, shapes[item.q].text]));
    const output = { source: SOURCE, generated: new Date().toISOString().slice(0, 10), shapes: ordered };
    const json = JSON.stringify(output);
    writeFileSync(dataFile, json + '\n');

    if (rejected.length) {
        console.log(`\nZamítnuté obrysy (${rejected.length}):`);
        rejected.forEach(line => console.log('  ' + line));
    }
    console.log('\nPokrytí (obrys / položek, z toho NE + OSM; známé k=1):');
    for (const [group, list] of Object.entries(groupItems)) {
        const table = {};
        for (const item of list) {
            const key = group === 'plochy' ? `${item.c}/${item.ty}` : group;
            const row = table[key] = table[key] || { have: 0, total: 0, ne: 0, osm: 0, known: 0, knownHave: 0, bytes: 0 };
            row.total++;
            if (item.k === 1) row.known++;
            if (shapes[item.q]) {
                row.have++;
                row[origin[item.q]]++;
                row.bytes += shapes[item.q].text.length + item.q.length + 6;
                if (item.k === 1) row.knownHave++;
            }
        }
        for (const [key, row] of Object.entries(table)) {
            console.log(`  ${key.padEnd(24)} ${String(row.have).padStart(4)} / ${String(row.total).padEnd(4)} známé ${String(row.knownHave).padStart(3)} / ${String(row.known).padEnd(4)} (NE ${row.ne}, OSM ${row.osm}) ${(row.bytes / 1024).toFixed(1)} kB`);
        }
    }
    const points = Object.values(shapes).reduce((sum, shape) => sum + shape.points, 0);
    console.log(`Celkem ${Object.keys(ordered).length} obrysů, ${points} bodů, ${(Buffer.byteLength(json) / 1024).toFixed(1)} kB → data/mapa-tvary.json`);
    if (failedHosts.size) console.warn(`Nedostupné servery: ${[...failedHosts].join(', ')}`);
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
