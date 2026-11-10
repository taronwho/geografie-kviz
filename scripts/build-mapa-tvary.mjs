// Obrysy plošných míst pro otázku „Ukaž na mapě“ (jezera, moře, zálivy, průlivy, ostrovy, souostroví, národní parky,
// pouště, poloostrovy, pohoří, chráněná území Česka, státy, regiony a kraje) a průběh řek: klepnutí kamkoli dovnitř
// obrysu je přesný zásah a vzdálenost se měří od okraje (u řeky od čáry).
// Zdroje (licence, citace a co se z nich bere: docs/MAPA-ZDROJE.md):
//  1. Natural Earth 5.1.2 (volné dílo) – shoda podle vlastnosti wikidataid (u regionů i podle bodu položky ve správné
//     zemi, u řek i podle jména);
//  2. OpenStreetMap (© přispěvatelé OpenStreetMap, ODbL) – relace z vlastnosti Wikidat P402 (obrys z
//     polygons.openstreetmap.fr) a objekty se značkou wikidata=Q… (geometrie z QLever), průběh řek z API OpenStreetMap;
//  3. GMBA Mountain Inventory v2 (CC BY 4.0) – pohoří podle QID, jinak podle jména;
//  4. AOPK ČR, Geomorfologické členění ČR (CC BY 4.0) – česká pohoří podle jména jednotky;
//  5. Marine Regions – SeaVoX Salt and Fresh Water Body Gazetteer (CC BY 4.0) – moře, zálivy a průlivy podle jména;
//  6. Wikimedia Commons Data:*.map z vlastnosti Wikidat P3896 (jen soubory s licencí CC0).
// Každý obrys projde kontrolou (bod položky uvnitř nebo blízko, rozloha zhruba sedí s Wikidaty nebo s obvyklou velikostí
// druhu, ostrov leží na pevnině a moře ve vodě, délka řeky sedí), jinak se zahodí a vypíše mezi zamítnutými.
//
// Zápis data/mapa-tvary.json: { source, generated, shapes: { QID: "prstenec;prstenec;…" nebo "~čára;čára;…" } }.
// Prstenec = celá čísla oddělená čárkou v tisícinách stupně (Math.round(stupně * 1000)): první dvojice je šířka a délka
// prvního bodu, každá další dvojice je rozdíl (Δšířka, Δdélka) od předchozího bodu. Prstence (vnější i díry) se
// vyhodnocují pravidlem sudá–lichá přes všechny prstence; první bod se na konci neopakuje. Délka je v prstenci souvislá
// (přes 180. poledník pokračuje za ±180), celý obrys leží u bodu položky.
// Řeka (text začíná „~“): lomené čáry oddělené „;“, každá zapsaná stejně jako prstenec, ale NEuzavřená (poslední bod
// se s prvním nespojuje); vzdálenost tipu se měří od nejbližšího úseku.
// Spuštění: npm run build:mapa-tvary (s BUILD_CACHE=složka se odpovědi uloží a další běh se sítě neptá;
// OFFLINE=1 použije jen to, co už v mezipaměti je)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { layer, polygonsOf, linesOf } from './lib/natural-earth.mjs';
import { qlever, values, cached, sleep, id } from './lib/wikidata.mjs';
import {
    prepareRing, prepareLine, sphericalKm2, inRings, distanceKm, lineDistanceKm, lineKm, bboxOf, sizeKm, polygonsKm2,
    dissolve, compress, compressLines, joinLines, encodeRing, decodeShape, bufferLine, landIndex, polygonsFromOrientedRings, evenOddKm2
} from './lib/mapa-tvary-geo.mjs';
import { mainWays, mainStem, removeSpikes } from './lib/mapa-tvary-reky.mjs';
import {
    osmObjectsByWikidata, osmGeometry, osmRiverWays, gmbaInventory, aopkGeomorphology, marineRegionsByName, marineRegionsGeometry,
    isSeaVox, commonsMap, failedHosts as sourceFailedHosts, requests as sourceRequests
} from './lib/mapa-tvary-zdroje.mjs';

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
// Chráněná území Česka (zeměpis, okruh priroda): vlastní skupina s vlastní mezipamětí relací
const PROTECTED_KINDS = ['chráněná krajinná oblast', 'národní přírodní rezervace'];
const WATER_KINDS = ['moře', 'zátoka', 'průliv'];
const SOURCE = 'Natural Earth 5.1.2 (naturalearthdata.com, volné dílo); OpenStreetMap (© přispěvatelé OpenStreetMap, data pod licencí ODbL 1.0, '
    + 'openstreetmap.org/copyright; obrysy relací z polygons.openstreetmap.fr, objekty se značkou wikidata z QLever a průběh řek z API OpenStreetMap); '
    + 'GMBA Mountain Inventory v2 (Snethlage et al. 2022, doi:10.48601/earthenv-t9k2-1407, CC BY 4.0); '
    + 'AOPK ČR – Geomorfologické členění ČR (Mackovčin, P. et al. 2005, CC BY 4.0); '
    + 'Marine Regions – SeaVoX Salt and Fresh Water Body Gazetteer v19 (BODC 2023, doi:10.14284/590, CC BY 4.0); '
    + 'Wikimedia Commons Data (soubory map s licencí CC0); obrysy zjednodušeny';

const OSM_POLYGONS = 'https://polygons.openstreetmap.fr';
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const NEAR_KM = 15;             // bod položky smí ležet tak daleko od obrysu (nebo 5 % jeho velikosti)
const RIVER_NEAR_KM = 30;       // bod řeky smí ležet tak daleko od čáry
const RIVER_LENGTH_FACTOR = 2.5;
const RIVER_OSM_MAX = Number(process.env.RIVER_OSM_MAX ?? 330);      // nejvýš tolik řek z API OpenStreetMap (chybějící nebo neúplné v Natural Earth; známé napřed)
const RIVER_SHORT_SHARE = 0.7;  // čára kratší než tento podíl délky řeky (nebo bod dál než RIVER_FAR_KM): zkusí se OpenStreetMap
const RIVER_FAR_KM = 50;

// Zjednodušení podle skupiny: plochy jako dřív; státy a regiony hruběji (na mapě světa se měří s tolerancí ~200 km),
// kraje Česka jemněji (mapa Česka)
const AREA_OPTIONS = { maxPoints: 150, maxPointsBig: 300 };
// trustInside: shoda QID s bodem položky uvnitř obrysu stačí i při nesedící rozloze (Wikidata mají u některých regionů
// rozlohu i s mořem nebo nárokem v Antarktidě); nearShare: bod souostrovního státu může ležet v moři mezi ostrovy
const STATE_OPTIONS = { maxPoints: 120, maxPointsBig: 250, toleranceShare: 0.005, ringShare: 0.005, manyRings: 30, minTolerance: 0.01, toleranceBasis: 'largest', dissolve: true, trustInside: true, nearShare: 0.35 };
const REGION_OPTIONS = { maxPoints: 42, maxPointsBig: 80, toleranceShare: 0.012, ringShare: 0.01, manyRings: 10, minTolerance: 0.01, toleranceBasis: 'largest', dissolve: true, trustInside: true };
const KRAJ_OPTIONS = { maxPoints: 110, maxPointsBig: 110, toleranceShare: 0.004, ringShare: 0.01, minTolerance: 0.003, dissolve: true, trustInside: true };
const RIVER_OPTIONS = { maxPoints: 120, toleranceShare: 0.005, minTolerance: 0.005, minShare: 0.02 };
// Řeky z OpenStreetMap: nejvýš 150 bodů (velké řeky mají v relaci statisíce bodů), krátké potoky jemněji
const RIVER_OSM_OPTIONS = { maxPoints: 150, toleranceShare: 0.005, minTolerance: 0.002, minShare: 0.03, postprocess: line => removeSpikes(line) };
// Doplněné plochy: pohoří a chráněná území úsporněji (soubor má zůstat do ~1,3 MB)
const RANGE_OPTIONS = { maxPoints: 90, maxPointsBig: 180 };
const CZECH_RANGE_OPTIONS = { maxPoints: 80, maxPointsBig: 80, toleranceShare: 0.006, minTolerance: 0.003, dissolve: true, trustInside: true };
// trustInside: rozloha rezervací bývá ve Wikidatech v hektarech – hranice se značkou wikidata a bodem uvnitř stačí
const PROTECTED_OPTIONS = {
    'chráněná krajinná oblast': { maxPoints: 70, maxPointsBig: 70, minTolerance: 0.002, trustInside: true },
    'národní přírodní rezervace': { maxPoints: 24, maxPointsBig: 24, minTolerance: 0.0005, trustInside: true }
};
// Souostroví: tolerance podle největšího ostrova (jinak se ostrovy přes půl oceánu slijí do trojúhelníků)
const ARCHIPELAGO_OPTIONS = { toleranceBasis: 'largest', ringShare: 0.003, manyRings: 30, minTolerance: 0.002 };
const EXTRA_OPTIONS = { maxPoints: 110, maxPointsBig: 220 };
const BIG_KM = 2000;
// Rozloha z Wikidat je u těchto položek zjevně chybná a k ověření obrysu se nepoužije (zůstává bod položky a obvyklá
// velikost druhu): Apeninský poloostrov 131 km² (správně kolem 131 tisíc), Akabský záliv 239 km² (záliv 160 × 24 km),
// Aljašský poloostrov 1,5 mil. km² (rozloha celé Aljašky), Kergueleny 397 080 km² (souostroví má 7 215 km²)
const AREA_UNRELIABLE = new Set(['Q145694', 'Q81611', 'Q60064', 'Q46772']);
const areaOf = (item) => (AREA_UNRELIABLE.has(item.q) ? undefined : item.f && item.f.area);

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
    const area0 = areaOf(item);
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
            // Obrys, který polygons.openstreetmap.fr nevydá, se zkusí ještě z QLever
            const fallback = geometry ? null : await osmGeometry('relation', relation);
            const polygons = geometry ? geometryPolygons(geometry) : fallback && fallback.polygons.length ? fallback.polygons : null;
            if (!polygons) { rejected.push(`${item.q} ${item.n} [osm ${relation}]: obrys nedostupný`); continue; }
            const result = buildShape(item, polygons, options(item));
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'osm'; break; }
            rejected.push(`${item.q} ${item.n} [osm ${relation}]: ${result.reason}`);
        }
        done++;
        process.stdout.write(`  ${done}/${pending.length} (dotazů ${osmRequests})\r`);
    }
    if (pending.length) console.log();
};

// --- doplňkové zdroje ploch ------------------------------------------------------------------------------------------

// Jména z Wikidat ({ QID: [štítek, …aliasy] } v daných jazycích, štítky napřed) a hodnoty vlastnosti
const wikidataNames = (cacheName, qids, languages) => cached(cacheName, async () => {
    const result = {};
    for (let i = 0; i < qids.length; i += 150) {
        const rows = await qlever(`PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?x ?l ?alt WHERE { VALUES ?x { ${values(qids.slice(i, i + 150))} } { ?x rdfs:label ?l BIND(0 AS ?alt) } UNION { ?x skos:altLabel ?l BIND(1 AS ?alt) }
FILTER(LANG(?l) IN (${languages.map(language => `"${language}"`).join(', ')})) }`);
        const labels = rows.filter(row => row.alt.value === '0'), aliases = rows.filter(row => row.alt.value !== '0');
        for (const row of [...labels, ...aliases]) {
            const list = result[id(row.x.value)] = result[id(row.x.value)] || [];
            if (!list.includes(row.l.value)) list.push(row.l.value);
        }
        await sleep(500);
    }
    return result;
});
const wikidataValues = (cacheName, qids, property) => cached(cacheName, async () => {
    const result = {};
    for (let i = 0; i < qids.length; i += 200) {
        const rows = await qlever(`SELECT ?x ?v WHERE { VALUES ?x { ${values(qids.slice(i, i + 200))} } ?x wdt:${property} ?v }`);
        for (const row of rows) (result[id(row.x.value)] = result[id(row.x.value)] || []).push(row.v.value);
        await sleep(500);
    }
    return result;
});

// Pevnina z Natural Earth 1 : 10 mil. (státy): pro kontrolu, že ostrov leží na pevnině a moře ve vodě, a pro šířku průlivu
let landCache = null;
const land = async () => {
    if (!landCache) landCache = landIndex((await layer('ne_10m_admin_0_countries')).features.flatMap(feature => polygonsOf(feature.geometry)));
    return landCache;
};

// Průliv nakreslený v OpenStreetMap jen osou: obal čáry o poloměru podle vzdálenosti osy od pobřeží (dolní kvartil, 1,5–40 km)
const straitPolygons = async (item, lines) => {
    const index = await land();
    const polygons = [];
    for (const raw of lines) {
        const line = prepareLine(raw, item.lo);
        const samples = [];
        for (let i = 0; i < 9; i++) samples.push(line[Math.round(i * (line.length - 1) / 8)]);
        const distances = samples.map(point => index.coastKm(point, 60)).sort((a, b) => a - b);
        // Dolní kvartil: osa bývá protažená do širšího moře za průlivem, medián by obal roztáhl přes pobřeží
        const radius = Math.max(1.5, Math.min(40, distances[Math.floor(distances.length / 4)]));
        const ring = bufferLine(line, radius);
        if (ring) polygons.push([ring]);
    }
    return polygons;
};

const closedRings = (lines) => joinLines(lines).filter(line => line.length >= 4 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1]).map(line => [line]);

// Objekty OpenStreetMap se značkou wikidata=QID položky (relace i uzavřené cesty), geometrie z QLever
const OSM_SKIP_RELATION_TYPES = new Set(['waterway', 'route', 'route_master', 'public_transport', 'restriction', 'street', 'associatedStreet', 'tunnel', 'bridge']);
const fillFromOsmTags = async (label, items, { cacheName, options, shapes, origin, rejected, lines = () => false }) => {
    const tagged = await osmObjectsByWikidata(cacheName, items.map(item => item.q).sort());
    const pending = items.filter(item => !shapes[item.q] && (tagged[item.q] || []).some(object => object.type !== 'node'));
    console.log(`${label}: OpenStreetMap podle značky wikidata ${pending.length} položek`);
    let done = 0, added = 0;
    for (const item of pending) {
        const objects = tagged[item.q].filter(object => object.type !== 'node' && object.boundary !== 'maritime' && !OSM_SKIP_RELATION_TYPES.has(object.relationType || ''))
            .sort((a, b) => (a.type === 'relation' ? 0 : 1) - (b.type === 'relation' ? 0 : 1) || (a.boundary === 'administrative' ? 1 : 0) - (b.boundary === 'administrative' ? 1 : 0));
        for (const object of objects.slice(0, 4)) {
            const tag = `osm ${object.type} ${object.id}`;
            const geometry = await osmGeometry(object.type, object.id);
            if (!geometry) { rejected.push(`${item.q} ${item.n} [${tag}]: geometrie nedostupná`); continue; }
            let polygons = geometry.polygons, source = 'osm';
            if (!polygons.length && geometry.lines.length && lines(item)) { polygons = await straitPolygons(item, geometry.lines); source = 'osm-osa'; }
            // Souostroví zapsané jen pobřežními čarami ostrovů (relace type=group, cluster): uzavřené čáry jsou prstence
            if (!polygons.length && geometry.lines.length && ['ostrov', 'souostroví'].includes(item.ty)) polygons = closedRings(geometry.lines);
            if (!polygons.length) { rejected.push(`${item.q} ${item.n} [${tag}]: není plocha`); continue; }
            const result = buildShape(item, polygons, options(item));
            const reason = result.shape ? await sanityReason(item, result.shape, source, true) : result.reason;
            if (!reason) { shapes[item.q] = result.shape; origin[item.q] = source; added++; break; }
            rejected.push(`${item.q} ${item.n} [${tag}]: ${reason}`);
        }
        done++;
        process.stdout.write(`  ${done}/${pending.length} (dotazů ${sourceRequests.count})\r`);
    }
    if (pending.length) console.log(`\n${label}: z toho přijato ${added}`);
};

// Moře, zálivy a průlivy podle anglického jména v místopisu Marine Regions – jen záznamy SeaVoX (CC BY 4.0; mořské
// oblasti IHO v3 mají licenci CC BY-NC-SA a neberou se)
const fillFromSeaVox = async (items, { shapes, origin, rejected }) => {
    const water = items.filter(item => WATER_KINDS.includes(item.ty));
    const pending = water.filter(item => !shapes[item.q]);
    if (!pending.length) return;
    const names = await wikidataNames('mapa-tvary-vody-jmena', water.map(item => item.q).sort(), ['en']);
    console.log(`Vody: Marine Regions (SeaVoX) ${pending.length} položek`);
    let done = 0, added = 0;
    for (const item of pending) {
        const tried = new Set();
        for (const name of (names[item.q] || []).slice(0, 3)) {
            for (const record of (await marineRegionsByName(name)).filter(isSeaVox)) {
                // Geometrii nese záznam SeaVoX sám (přijatý záznam téhož jména bývá oblast IHO s jinou licencí)
                const mrgid = record.MRGID;
                if (tried.has(mrgid)) continue;
                tried.add(mrgid);
                const geometry = await marineRegionsGeometry(mrgid);
                if (!geometry) { rejected.push(`${item.q} ${item.n} [seavox ${mrgid}]: geometrie nedostupná`); continue; }
                // SeaVoX vymezuje moře a zálivy místy úžeji nebo šířeji než rozloha z Wikidat: až 4×, nad 3× jen s bodem uvnitř
                const result = buildShape(item, geometry.polygons, EXTRA_OPTIONS, 4);
                const area0 = areaOf(item);
                const loose = result.shape && area0 > 0 && Math.max(result.area / area0, area0 / result.area) > 3 && result.distance > 0;
                const reason = loose ? `rozloha ${Math.round(result.area)} km² ≠ ${area0} km² a bod mimo obrys` : result.shape ? await sanityReason(item, result.shape, 'seavox', true) : result.reason;
                if (!reason) { shapes[item.q] = result.shape; origin[item.q] = 'seavox'; added++; break; }
                rejected.push(`${item.q} ${item.n} [seavox ${mrgid} ${record.preferredGazetteerName}]: ${reason}`);
            }
            if (shapes[item.q]) break;
        }
        done++;
        process.stdout.write(`  ${done}/${pending.length} (dotazů ${sourceRequests.count})\r`);
    }
    console.log(`\nVody: z Marine Regions přijato ${added}`);
};

// Obrysy z Wikimedia Commons (vlastnost Wikidat P3896, stránky Data:….map) – jen s licencí CC0
const fillFromCommons = async (items, { shapes, origin, rejected }) => {
    const pages = await wikidataValues('mapa-tvary-p3896', items.map(item => item.q).sort(), 'P3896');
    const pending = items.filter(item => !shapes[item.q] && pages[item.q]);
    console.log(`Plochy: Wikimedia Commons ${pending.length} položek s mapou`);
    for (const item of pending) {
        for (const url of pages[item.q]) {
            const title = decodeURIComponent(String(url).replace(/^.*\/data\/main\//, '').replace(/\+/g, ' '));
            const map = await commonsMap(title);
            if (!map) { rejected.push(`${item.q} ${item.n} [commons ${title}]: mapa nedostupná`); continue; }
            if (!/^CC0/i.test(map.licence)) { rejected.push(`${item.q} ${item.n} [commons ${title}]: licence ${map.licence || 'neuvedena'} (bere se jen CC0)`); continue; }
            const result = buildShape(item, map.polygons, { ...EXTRA_OPTIONS, ...(item.ty === 'souostroví' ? ARCHIPELAGO_OPTIONS : {}) });
            const reason = result.shape ? await sanityReason(item, result.shape, 'commons', true) : result.reason;
            if (!reason) { shapes[item.q] = result.shape; origin[item.q] = 'commons'; break; }
            rejected.push(`${item.q} ${item.n} [commons ${title}]: ${reason}`);
        }
    }
};

// --- pohoří: AOPK ČR a GMBA --------------------------------------------------------------------------------------------

const normalizeUnit = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ').trim();
// Položky, které se v geomorfologickém členění jmenují jinak: QID → [úroveň, jméno jednotky]
const CZECH_UNIT_ALIASES = {
    Q215573: ['PODSOUSTAVA', 'Západní Beskydy'],                   // Beskydy (česká část)
    Q152131: ['SOUSTAVA', 'Krkonošsko-jesenická soustava'],        // Krkonošsko-jesenická subprovincie
    Q1529966: ['CELEK', 'Králický Sněžník']                        // Masiv Králického Sněžníku
};
const CZECH_LEVELS = ['SOUSTAVA', 'PODSOUSTAVA', 'CELEK', 'PODCELEK', 'OKRSEK'];

// Jednotky geomorfologického členění: klíč „ÚROVEŇ jméno“ i samotné jméno (vyšší úroveň má přednost) → mnohoúhelníky okrsků
const czechUnits = (features) => {
    const units = new Map();
    for (const level of CZECH_LEVELS) {
        const groups = new Map();
        for (const feature of features) {
            const name = feature.properties && feature.properties[level];
            if (!name || !feature.geometry) continue;
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(...polygonsOf(feature.geometry));
        }
        for (const [name, polygons] of groups) {
            units.set(`${level} ${name}`, { level, name, polygons });
            if (!units.has(normalizeUnit(name))) units.set(normalizeUnit(name), { level, name, polygons });
        }
    }
    return units;
};

// Je nový obrys pohoří aspoň tak dobrý jako dosavadní? Dosavadní zůstane, když v něm bod položky leží a v novém ne,
// nebo když jeho rozloha sedí s Wikidaty výrazně líp (poměr aspoň 1,5× blíž).
const keepCurrentRange = (item, current, candidate) => {
    const point = [item.lo, item.la];
    const currentInside = distanceKm(current.rings, point) === 0;
    if (currentInside && candidate.distance > 0) return 'bod leží v dosavadním obrysu a v novém ne';
    const area0 = areaOf(item);
    if (area0 > 0) {
        const ratio = (area) => Math.max(area / area0, area0 / area);
        const currentRatio = ratio(evenOddKm2(current.rings));
        if (currentRatio * 1.5 < ratio(candidate.area)) return `dosavadní rozloha sedí líp (${currentRatio.toFixed(1)}× proti ${ratio(candidate.area).toFixed(1)}×)`;
    }
    return null;
};

const buildRanges = async (items, { shapes, origin, rejected, replaced }) => {
    // 1. Česká pohoří z geomorfologického členění (jen území Česka): podle jména jednotky. Bod položky musí ležet uvnitř
    // nebo na hranici (do 2 km – hraniční hřeben); když leží dál za hranicí (pohoří je hlavně v sousední zemi, česká část
    // je jen cíp jako u Stolových hor), počká jednotka jako záloha, až když pohoří nenajde GMBA
    const features = await aopkGeomorphology();
    if (!features) console.warn('Pohoří: geomorfologické členění AOPK ČR není dostupné');
    const units = features ? czechUnits(features) : new Map();
    let czech = 0;
    const czechFallback = new Map();
    for (const item of items) {
        if (!(item.co || []).includes('Q213')) continue;
        const alias = CZECH_UNIT_ALIASES[item.q];
        const unit = alias ? units.get(`${alias[0]} ${alias[1]}`) : units.get(normalizeUnit(item.n)) || units.get(normalizeUnit(item.t));
        if (!unit) continue;
        const tag = `aopk ${unit.level.toLowerCase()} ${unit.name}`;
        const result = buildShape(item, unit.polygons, { ...AREA_OPTIONS, ...CZECH_RANGE_OPTIONS });
        if (!result.shape) { rejected.push(`${item.q} ${item.n} [${tag}]: ${result.reason}`); continue; }
        if (result.distance > 2) { czechFallback.set(item.q, { result, tag }); continue; }
        if (shapes[item.q]) replaced.push(`${item.q} ${item.n}: ${origin[item.q]} → aopk`);
        shapes[item.q] = result.shape;
        origin[item.q] = 'aopk';
        czech++;
    }
    console.log(`Pohoří: AOPK ČR ${czech} českých pohoří`);
    // Záloha: česká část přeshraničního pohoří, pokud jinak obrys nemá a nejde jen o cíp
    const useCzechFallback = () => {
        for (const item of items) {
            const entry = czechFallback.get(item.q);
            if (!entry || shapes[item.q]) continue;
            const area0 = areaOf(item);
            const fits = area0 > 0 ? entry.result.area <= 3 * area0 && entry.result.area >= area0 / 3 : entry.result.area >= TYPICAL_KM2['pohoří'][0];
            if (!fits) { rejected.push(`${item.q} ${item.n} [${entry.tag}]: bod ${Math.round(entry.result.distance)} km za hranicí a česká část má jen ${Math.round(entry.result.area)} km²`); continue; }
            shapes[item.q] = entry.result.shape;
            origin[item.q] = 'aopk';
        }
    };

    // 2. GMBA Mountain Inventory: podle QID, jinak podle jména (česky, anglicky, německy, francouzsky, španělsky, rusky)
    const inventory = await gmbaInventory();
    if (!inventory) { console.warn('Pohoří: soupis GMBA není dostupný'); useCzechFallback(); return; }
    const names = await wikidataNames('mapa-tvary-pohori-jmena', items.map(item => item.q).sort(), ['cs', 'en', 'de', 'fr', 'es', 'ru']);
    const byQid = new Map(), byName = new Map();
    const push = (map, key, row) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(row); };
    for (const row of inventory.rows) {
        push(byQid, row.qid, row);
        if (/\(nn\)\s*$/.test(row.names[0] || '') || /Support polygon|Continent|Ocean/.test(row.feature)) continue;
        for (const name of new Set([...row.names, ...row.local].map(normalizeUnit))) push(byName, name, row);
    }
    const candidates = new Map();
    for (const item of items) {
        if (origin[item.q] === 'aopk') continue;
        const qidRows = byQid.get(item.q) || [];
        const keys = new Set([item.n, item.t, ...(names[item.q] || [])].map(normalizeUnit).filter(Boolean));
        const nameRows = qidRows.length ? [] : [...new Set([...keys].flatMap(key => byName.get(key) || []))];
        if (qidRows.length || nameRows.length) candidates.set(item.q, { rows: qidRows.length ? qidRows : nameRows, how: qidRows.length ? 'qid' : 'jméno' });
    }
    const polygons = inventory.polygons([...new Set([...candidates.values()].flatMap(entry => entry.rows.map(row => row.index)))].sort((a, b) => a - b));
    let taken = 0;
    for (const item of items) {
        const entry = candidates.get(item.q);
        if (!entry) continue;
        const area0 = areaOf(item);
        let best = null;
        for (const row of entry.rows) {
            const tag = `gmba ${row.id} ${row.names[0]} (${entry.how})`;
            // Shoda QID: rozloha se smí lišit až 5× (GMBA vymezuje pohoří šířeji než rozloha z Wikidat), nad 3× jen s bodem uvnitř
            const result = buildShape(item, polygonsFromOrientedRings(polygons.get(row.index) || []), { ...AREA_OPTIONS, ...RANGE_OPTIONS }, entry.how === 'qid' ? 5 : 3);
            if (!result.shape) { rejected.push(`${item.q} ${item.n} [${tag}]: ${result.reason}`); continue; }
            if (area0 > 0 && Math.max(result.area / area0, area0 / result.area) > 3 && result.distance > 0) { rejected.push(`${item.q} ${item.n} [${tag}]: rozloha ${Math.round(result.area)} km² ≠ ${area0} km² a bod mimo obrys`); continue; }
            // Shoda jen podle jména: bod musí ležet uvnitř (do 5 km) a obrys nesmí být drobný
            if (entry.how === 'jméno' && result.distance > 5) { rejected.push(`${item.q} ${item.n} [${tag}]: shoda jména, ale bod ${Math.round(result.distance)} km mimo obrys`); continue; }
            if (!(area0 > 0) && result.area < TYPICAL_KM2['pohoří'][0]) { rejected.push(`${item.q} ${item.n} [${tag}]: jen ${Math.round(result.area)} km²`); continue; }
            const score = (result.distance === 0 ? 0 : 1000 + result.distance) + (area0 > 0 ? Math.abs(Math.log(result.area / area0)) : -Math.log10(result.area + 1));
            if (!best || score < best.score) best = { ...result, score, tag };
        }
        if (!best) continue;
        if (shapes[item.q]) {
            const reason = keepCurrentRange(item, shapes[item.q], best);
            if (reason) { rejected.push(`${item.q} ${item.n} [${best.tag}]: ${reason}`); continue; }
            replaced.push(`${item.q} ${item.n}: ${origin[item.q]} → gmba`);
        }
        shapes[item.q] = best.shape;
        origin[item.q] = 'gmba';
        taken++;
    }
    useCzechFallback();
    console.log(`Pohoří: GMBA ${taken} pohoří (shoda QID u ${[...candidates.values()].filter(entry => entry.how === 'qid').length}, shoda jména u ${[...candidates.values()].filter(entry => entry.how === 'jméno').length} položek)`);
};

// --- kontrola ploch: obvyklá velikost druhu, ostrov na pevnině, moře ve vodě ------------------------------------------

// Obvyklá rozloha druhu v km² [nejméně, nejvíc]: dolní mez platí jen bez známé rozlohy (jinak rozhoduje shoda s Wikidaty),
// horní vždy. Pohoří menší než 50 km² je spíš rezervace nebo vrchol než pohoří (jednotky geomorfologického členění ČR
// jsou vymezené úředně a dolní mez se na ně nevztahuje).
const TYPICAL_KM2 = {
    'pohoří': [50, 5e6], ostrov: [0, 2.3e6], 'souostroví': [0, 4e6], jezero: [0.005, 4.5e5], 'přehradní nádrž': [0.02, 1e4], laguna: [0.02, 3e4],
    'moře': [2000, 2e7], 'zátoka': [0.5, 3e6], 'průliv': [0.3, 2e6], 'národní park': [0.05, 1.1e6], 'poušť': [20, 1.2e7], poloostrov: [0, 3.5e6],
    'chráněná krajinná oblast': [10, 2500], 'národní přírodní rezervace': [0.005, 150]
};
// Podíl pevniny se měří proti Natural Earth 1 : 10 mil.: menší ostrovy tam chybějí nebo leží o kus vedle (Faerské ostrovy
// vycházejí na 40–70 %), proto jen u ostrovů od 200 km² (obec Vlieland i s Waddenzee má 316 km², ostrov sám 40 km²)
const ISLAND_LAND_MIN_KM2 = 200;
const WATER_LAND_MIN_KM2 = 3000;   // úzké zálivy Natural Earth nekreslí a jezera počítá k pevnině – jen velké nové plochy

// Důvod, proč obrys nevyhovuje (jinak null). fresh: obrys z doplňkového zdroje (přísnější kontrola vody a souostroví)
const sanityReason = async (item, shape, source, fresh = false) => {
    const bounds = TYPICAL_KM2[item.ty];
    const area = evenOddKm2(shape.rings);
    const area0 = areaOf(item);
    if (bounds && area > bounds[1]) return `rozloha ${Math.round(area)} km² je na ${item.ty} moc`;
    if (bounds && !(area0 > 0) && area < bounds[0] && source !== 'aopk') return `rozloha ${area.toFixed(1)} km² je na ${item.ty} málo (rozloha ve Wikidatech chybí)`;
    const index = await land();
    if (item.ty === 'ostrov' && area >= ISLAND_LAND_MIN_KM2) {
        const share = index.share(shape.rings);
        if (share !== null && share < 0.5) return `jen ${Math.round(share * 100)} % obrysu ostrova leží na pevnině (obrys zřejmě s pobřežními vodami)`;
    }
    if (fresh && item.ty === 'souostroví' && !(area0 > 0) && area >= WATER_LAND_MIN_KM2) {
        const share = index.share(shape.rings);
        if (share !== null && share < 0.25) return `jen ${Math.round(share * 100)} % obrysu souostroví leží na pevnině`;
    }
    if (fresh && WATER_KINDS.includes(item.ty) && area >= WATER_LAND_MIN_KM2) {
        const share = index.share(shape.rings);
        if (share !== null && share > 0.8) return `${Math.round(share * 100)} % obrysu leží na pevnině`;
    }
    return null;
};

const auditAreas = async (items, { shapes, origin, rejected, removed }) => {
    for (const item of items) {
        if (!shapes[item.q]) continue;
        const reason = await sanityReason(item, shapes[item.q], origin[item.q]);
        if (!reason) continue;
        rejected.push(`${item.q} ${item.n} [kontrola, ${origin[item.q]}]: ${reason}`);
        removed.push(`${item.q} ${item.n} (${item.ty}, ${origin[item.q]}): ${reason}`);
        delete shapes[item.q];
        delete origin[item.q];
    }
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

const buildRiver = (item, lines, options = RIVER_OPTIONS) => {
    if (!lines || !lines.length) return { reason: 'žádné úseky' };
    const point = [item.lo, item.la];
    const joined = joinLines(lines.map(line => prepareLine(line, item.lo)));
    const length = joined.reduce((sum, line) => sum + lineKm(line), 0);
    const len0 = item.f && item.f.len;
    if (len0 > 0 && (length > len0 * RIVER_LENGTH_FACTOR || length < len0 / RIVER_LENGTH_FACTOR)) return { reason: `délka ${Math.round(length)} km ≠ ${len0} km` };
    const shape = compressLines(joined, options);
    if (!shape) return { reason: 'po zjednodušení nic nezbylo' };
    const distance = lineDistanceKm(shape.lines, point);
    const drawn = shape.lines.reduce((sum, line) => sum + lineKm(line), 0);
    if (distance > riverLimitKm(item, drawn)) return { reason: `bod ${Math.round(distance)} km od čáry (délka ${Math.round(drawn)} km)` };
    return { shape, length, distance, drawn };
};

// Řeka z relace OpenStreetMap: hlavní tok ze sítě cest (bez ramen a náhonů), části přes krátké mezery spojené
const buildOsmRiver = (item, ways) => {
    const len0 = (item.f && item.f.len) || 0;
    const lines = mainWays(ways).map(line => prepareLine(line, item.lo));
    if (!lines.length) return { reason: 'žádné úseky' };
    const stems = mainStem(lines, { snapKm: 0.05, gapKm: Math.max(2, Math.min(40, 0.02 * len0)) });
    return buildRiver(item, stems, RIVER_OSM_OPTIONS);
};

// Jak dobře čára řeku vystihuje: podíl délky před zjednodušením (1 = sedí; bez známé délky 1), řeka s bodem daleko od
// čáry má srážku. Měří se nezjednodušená délka: zjednodušením se meandry narovnají a nakreslená čára je vždy kratší.
const RIVER_BETTER = 0.15;      // o tolik musí být relace OpenStreetMap lepší, aby nahradila čáru z Natural Earth
const riverScore = (item, length, distance) => {
    const len0 = item.f && item.f.len;
    const share = len0 > 0 ? Math.min(length / len0, len0 / length) : 1;
    // „Daleko“ se měří k délce řeky: u Išimu (2 450 km) je bod 80 km za koncem čáry drobnost, u Vydry (24 km) ne
    return share - (distance > Math.max(RIVER_FAR_KM, 0.04 * (len0 || 0)) ? 0.2 : 0);
};
const riverNeedsMore = (item, drawn, distance) => {
    const len0 = item.f && item.f.len;
    return (len0 > 0 && drawn < RIVER_SHORT_SHARE * len0) || distance > RIVER_FAR_KM;
};

// Řeky, jejichž délka se počítá i se zdrojnicemi jiného jména: QID → další jména úseků v Natural Earth
const RIVER_EXTRA_NAMES = {
    Q5413: ['Chang Jiang', 'Jinsha', 'Tongtian', 'Tuotuo'],                                   // Jang-c'-ťiang
    Q3392: ['White Nile', 'Mountain Nile', 'Albert Nile', 'Victoria Nile', 'Kagera'],         // Nil
    Q3783: ['Amazonas', 'Ucayali'],                                                           // Amazonka (s Ucayali a Apurímacem)
    Q3503: ['Congo', 'Lualaba']                                                               // Kongo (s Lualabou)
};

// --- hlavní běh ----------------------------------------------------------------------------------------------------

const hasPoint = (item) => typeof item.la === 'number' && typeof item.lo === 'number';

export const GROUPS = {
    plochy: (item, file) => file === 'zemepis' && (KINDS[item.c] || []).includes(item.ty),
    chranene: (item, file) => file === 'zemepis' && item.c === 'priroda' && PROTECTED_KINDS.includes(item.ty),
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
    const previous = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')).shapes || {} : {};
    const shapes = {}, origin = {}, rejected = [], replaced = [], removed = [];
    const context = { shapes, origin, rejected, replaced, removed };

    // Plochy (jezera, ostrovy, příroda): Natural Earth, relace OpenStreetMap z P402, pak objekty OpenStreetMap se značkou
    // wikidata (průlivy nakreslené osou jako obal čáry), moře a zálivy ze SeaVoX a mapy z Wikimedia Commons
    const ne = await naturalEarth(NE_LAYERS);
    await buildAreas('Plochy', groupItems.plochy, { ...context, ne, relationsCache: 'mapa-tvary-p402', options: () => AREA_OPTIONS });
    await auditAreas(groupItems.plochy, context);
    await fillFromOsmTags('Plochy', groupItems.plochy, { ...context, cacheName: 'mapa-tvary-osm-plochy', options: item => ({ ...AREA_OPTIONS, ...EXTRA_OPTIONS, ...(item.ty === 'souostroví' ? ARCHIPELAGO_OPTIONS : {}) }), lines: item => item.ty === 'průliv' });
    await fillFromSeaVox(groupItems.plochy, context);
    await fillFromCommons(groupItems.plochy, context);

    // Chráněná území Česka (CHKO, NPR): hranice z OpenStreetMap (boundary=protected_area)
    const protectedOptions = item => ({ ...AREA_OPTIONS, ...PROTECTED_OPTIONS[item.ty] });
    await buildAreas('Chráněná území', groupItems.chranene, { ...context, ne: new Map(), relationsCache: 'mapa-tvary-p402-chranene', options: protectedOptions });
    await fillFromOsmTags('Chráněná území', groupItems.chranene, { ...context, cacheName: 'mapa-tvary-osm-chranene', options: protectedOptions });

    // Pohoří: Natural Earth a relace OpenStreetMap jako dřív, česká z geomorfologického členění AOPK ČR, ostatní z GMBA
    // (GMBA nahradí dosavadní obrys, pokud ten není zjevně lepší – viz keepCurrentRange), nakonec plochy OpenStreetMap
    await buildAreas('Pohoří', groupItems.pohori, { ...context, ne, relationsCache: 'mapa-tvary-p402-pohori', options: () => ({ ...AREA_OPTIONS, insideWithoutArea: true }) });
    await buildRanges(groupItems.pohori, context);
    await fillFromOsmTags('Pohoří', groupItems.pohori, { ...context, cacheName: 'mapa-tvary-osm-pohori', options: () => ({ ...AREA_OPTIONS, ...RANGE_OPTIONS, insideWithoutArea: true }) });

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

    // Řeky jako čáry: Natural Earth podle QID a jména; kde čára chybí, je kratší než 70 % délky řeky nebo leží přes
    // 50 km od bodu položky, zkusí se relace OpenStreetMap (z P402 i podle značky wikidata) a vezme se lepší z obou
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
    const riverState = {};
    for (const item of rivers) {
        const keys = new Set([item.n, item.t, ...(names[item.q] || []), ...(RIVER_EXTRA_NAMES[item.q] || [])].map(normalizeName).filter(Boolean));
        const attempts = [];
        const qidSegments = byQid.get(item.q) || [];
        const nameSegments = [...keys].flatMap(k => byName.get(k) || []);
        const altSegments = [...keys].flatMap(k => byAlt.get(k) || []);
        if (qidSegments.length || nameSegments.length) attempts.push(['ne', [...new Set([...qidSegments, ...nameSegments])]]);
        if (altSegments.length) attempts.push(['ne alt', [...new Set([...qidSegments, ...nameSegments, ...altSegments])]]);
        for (const [source, pool] of attempts) {
            const picked = riverFromSegments(item, pool);
            const result = picked.lines ? buildRiver(item, picked.lines) : picked;
            if (result.shape) { shapes[item.q] = result.shape; origin[item.q] = 'ne'; riverState[item.q] = { drawn: result.drawn, length: result.length, distance: result.distance }; break; }
            rejected.push(`${item.q} ${item.n} [${source}]: ${result.reason}`);
        }
    }
    console.log(`Řeky: Natural Earth ${rivers.filter(item => shapes[item.q]).length} / ${rivers.length}`);
    const riverRelations = await osmRelations('mapa-tvary-p402-reky', rivers.map(item => item.q).sort());
    const riverTagged = await osmObjectsByWikidata('mapa-tvary-osm-reky', rivers.map(item => item.q).sort());
    const relationsOf = (item) => [...new Set([...(riverRelations[item.q] || []),
        ...(riverTagged[item.q] || []).filter(object => object.type === 'relation' && object.relationType === 'waterway').map(object => object.id)])];
    // Nejdřív známé řeky, pak podle délky
    const needy = rivers.filter(item => (!shapes[item.q] || riverNeedsMore(item, riverState[item.q].drawn, riverState[item.q].distance)) && relationsOf(item).length)
        .sort((a, b) => (b.k === 1) - (a.k === 1) || ((b.f && b.f.len) || 0) - ((a.f && a.f.len) || 0)).slice(0, RIVER_OSM_MAX);
    console.log(`Řeky: OpenStreetMap ${needy.length} řek s relací (chybějí nebo jsou neúplné)`);
    let done = 0;
    for (const item of needy) {
        let best = null;
        const fetched = [];
        const consider = (ways, tag) => {
            const result = buildOsmRiver(item, ways);
            if (!result.shape) { rejected.push(`${item.q} ${item.n} [osm ${tag}]: ${result.reason}`); return; }
            const score = riverScore(item, result.length, result.distance);
            if (!best || score > best.score) best = { ...result, score, tag };
        };
        for (const relation of relationsOf(item).slice(0, 4)) {
            const ways = await osmRiverWays(relation);
            if (!ways) { rejected.push(`${item.q} ${item.n} [osm ${relation}]: relace nedostupná`); continue; }
            fetched.push(ways);
            consider(ways, relation);
        }
        // Řeka rozdělená do více relací (úseky po státech): zkusí se i všechny dohromady
        if (fetched.length > 1 && fetched.every(ways => ways.length && !Array.isArray(ways[0]))) consider(fetched.flat(), 'všechny relace');
        done++;
        process.stdout.write(`  ${done}/${needy.length} (dotazů ${sourceRequests.count})\r`);
        if (!best) continue;
        const current = riverState[item.q];
        if (current) {
            const currentScore = riverScore(item, current.length, current.distance);
            if (!(best.score > currentScore + RIVER_BETTER)) { rejected.push(`${item.q} ${item.n} [osm ${best.tag}]: čára z Natural Earth je stejně dobrá nebo lepší (${Math.round(current.length)} km proti ${Math.round(best.length)} km z ${item.f.len} km)`); continue; }
            replaced.push(`${item.q} ${item.n}: ne → osm (délka ${Math.round(current.length)} → ${Math.round(best.length)} z ${item.f.len} km)`);
        }
        shapes[item.q] = best.shape;
        origin[item.q] = 'osm';
        riverState[item.q] = { drawn: best.drawn, length: best.length, distance: best.distance };
    }
    if (needy.length) console.log();

    // Závěrečná kontrola chráněných území a pohoří (plochy prošly kontrolou výš, doplňky při přijetí)
    await auditAreas([...groupItems.chranene, ...groupItems.pohori], context);

    // Zápis: v pořadí položek (zeměpis, pak vlajky)
    const position = new Map(all.map(({ item }, index) => [item, index]));
    const ordered = Object.fromEntries(Object.values(groupItems).flat().filter(item => shapes[item.q])
        .sort((a, b) => position.get(a) - position.get(b)).map(item => [item.q, shapes[item.q].text]));
    const output = { source: SOURCE, generated: new Date().toISOString().slice(0, 10), shapes: ordered };
    const json = JSON.stringify(output);
    writeFileSync(dataFile, json + '\n');

    if (rejected.length) {
        console.log(`\nZamítnuté obrysy (${rejected.length}):`);
        rejected.forEach(line => console.log('  ' + line));
    }
    if (replaced.length) {
        console.log(`\nNahrazené obrysy (${replaced.length}):`);
        replaced.forEach(line => console.log('  ' + line));
    }
    if (removed.length) {
        console.log(`\nVyřazeno závěrečnou kontrolou (${removed.length}):`);
        removed.forEach(line => console.log('  ' + line));
    }
    const shortRivers = rivers.filter(item => shapes[item.q] && riverNeedsMore(item, riverState[item.q].length, riverState[item.q].distance));
    console.log(`\nŘeky, kterým i po doplnění chybí přes ${Math.round((1 - RIVER_SHORT_SHARE) * 100)} % délky (před zjednodušením) nebo mají bod přes ${RIVER_FAR_KM} km od čáry (${shortRivers.length}):`);
    console.log('  ' + shortRivers.map(item => `${item.n} ${Math.round(riverState[item.q].length)}/${item.f.len} km, bod ${Math.round(riverState[item.q].distance)} km (${origin[item.q]})`).join('; '));

    // Změny proti dosavadnímu souboru
    const changes = {};
    for (const [group, list] of Object.entries(groupItems)) {
        for (const item of list) {
            const key = group === 'plochy' || group === 'chranene' ? item.ty : group;
            const row = changes[key] = changes[key] || { stejné: 0, nové: 0, změněné: 0, zrušené: 0 };
            const before = previous[item.q], after = ordered[item.q];
            if (before && after) row[before === after ? 'stejné' : 'změněné']++;
            else if (after) row.nové++;
            else if (before) row.zrušené++;
        }
    }
    console.log('\nZměny proti dosavadnímu souboru:');
    for (const [key, row] of Object.entries(changes)) console.log(`  ${key.padEnd(28)} stejné ${String(row.stejné).padStart(4)}  nové ${String(row.nové).padStart(4)}  změněné ${String(row.změněné).padStart(4)}  zrušené ${String(row.zrušené).padStart(4)}`);

    console.log('\nPokrytí (obrys / položek; známé k=1; podle zdroje):');
    for (const [group, list] of Object.entries(groupItems)) {
        const table = {};
        for (const item of list) {
            const key = group === 'plochy' || group === 'chranene' ? `${item.c}/${item.ty}` : group;
            const row = table[key] = table[key] || { have: 0, total: 0, sources: {}, known: 0, knownHave: 0, bytes: 0 };
            row.total++;
            if (item.k === 1) row.known++;
            if (shapes[item.q]) {
                row.have++;
                row.sources[origin[item.q]] = (row.sources[origin[item.q]] || 0) + 1;
                row.bytes += shapes[item.q].text.length + item.q.length + 6;
                if (item.k === 1) row.knownHave++;
            }
        }
        for (const [key, row] of Object.entries(table)) {
            console.log(`  ${key.padEnd(38)} ${String(row.have).padStart(4)} / ${String(row.total).padEnd(4)} známé ${String(row.knownHave).padStart(3)} / ${String(row.known).padEnd(4)} (${Object.entries(row.sources).map(([source, count]) => `${source} ${count}`).join(', ')}) ${(row.bytes / 1024).toFixed(1)} kB`);
        }
    }
    const points = Object.values(shapes).reduce((sum, shape) => sum + shape.points, 0);
    console.log(`Celkem ${Object.keys(ordered).length} obrysů, ${points} bodů, ${(Buffer.byteLength(json) / 1024).toFixed(1)} kB → data/mapa-tvary.json`);
    const failed = new Set([...failedHosts, ...sourceFailedHosts]);
    if (failed.size) console.warn(`Nedostupné servery: ${[...failed].join(', ')}`);
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
