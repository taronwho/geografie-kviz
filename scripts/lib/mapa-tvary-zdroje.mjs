// Doplňkové zdroje obrysů pro data/mapa-tvary.json (scripts/build-mapa-tvary.mjs); licence a citace jsou v
// docs/MAPA-ZDROJE.md. Všechny odpovědi se ukládají do BUILD_CACHE (bez něj se ptá sítě pokaždé), s OFFLINE=1 se čte
// jen mezipaměť. Dotazy jdou po jednom s prodlevou a s hlavičkou User-Agent sestavení.
//  • OpenStreetMap (ODbL): objekty podle značky wikidata=Q… a jejich geometrie z QLever (qlever.dev/osm-planet,
//    Univerzita Freiburg – kopie dat OSM s dotazy SPARQL), cesty relací řek z API OpenStreetMap
//  • GMBA Mountain Inventory v2 (CC BY 4.0): pohoří, soubor shapefile z EarthEnv
//  • AOPK ČR – Geomorfologické členění ČR (CC BY 4.0): česká pohoří, ArcGIS REST
//  • Marine Regions – SeaVoX Salt and Fresh Water Body Gazetteer (CC BY 4.0): moře, zálivy a průlivy podle jména
//  • Wikimedia Commons Data:*.map (jen soubory s licencí CC0): obrysy z vlastnosti Wikidat P3896
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { cached, sleep } from './wikidata.mjs';
import { unzipFiles, readDbf, readShpPolygons } from './shapefile.mjs';

export const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const QLEVER_OSM = 'https://qlever.dev/api/osm-planet';
const OSM_API = 'https://api.openstreetmap.org/api/0.6';
const GMBA_URL = 'https://data.earthenv.org/mountains/broad/GMBA_Inventory_v2.0_broad.zip';
const GMBA_NAME = 'GMBA_Inventory_v2.0_broad';
const AOPK_GEOMORPHOLOGY = 'https://gis.nature.cz/arcgis/rest/services/PrirodniPomery/Geomorfologie/MapServer/4/query?where=1%3D1&outFields=*&outSR=4326&geometryPrecision=5&f=geojson';
const MARINE_REGIONS = 'https://marineregions.org/rest';
const COMMONS = 'https://commons.wikimedia.org/w/index.php';

export const failedHosts = new Set();
export const requests = { count: 0 };
const offline = () => Boolean(process.env.OFFLINE);

export const cacheDir = (name) => {
    if (!process.env.BUILD_CACHE) return null;
    const dir = path.resolve(process.env.BUILD_CACHE, name);
    mkdirSync(dir, { recursive: true });
    return dir;
};

// Zdvořilé stažení textu: prodleva před dotazem, opakování při 429 a 5xx; null = server odpověděl, ale obsah nemá
// (404, 400); undefined = síť nebo server selhaly (do mezipaměti se neukládá, příště se zkusí znovu)
const politeText = async (url, { delay = 1000, attempts = 3, timeout = 180000, init = {} } = {}) => {
    const host = new URL(url).host;
    if (offline() || failedHosts.has(host)) return undefined;
    let errors = 0;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        await sleep(delay);
        requests.count++;
        try {
            const response = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) }, signal: AbortSignal.timeout(timeout) });
            if (response.status === 404 || response.status === 410 || response.status === 400) return null;
            if (response.status === 429 || response.status >= 500) { await sleep(8000 * attempt); errors++; continue; }
            if (!response.ok) return null;
            return await response.text();
        } catch (error) {
            errors++;
            console.warn(`  ${host}: ${error.message} (${attempt}/${attempts})`);
            await sleep(4000 * attempt);
        }
    }
    if (errors >= attempts) failedHosts.add(host);
    return undefined;
};

// Text z mezipaměti BUILD_CACHE/dir/name, jinak ze sítě (null se ukládá jako „null“, výpadek se neukládá)
const cachedText = async (dir, name, produce) => {
    const folder = cacheDir(dir);
    const file = folder && path.join(folder, name);
    if (file && existsSync(file)) {
        const text = readFileSync(file, 'utf8');
        return text === 'null' ? null : text;
    }
    const text = await produce();
    if (text === undefined) return undefined;
    if (file) writeFileSync(file, text ?? 'null');
    return text;
};

// --- WKT -----------------------------------------------------------------------------------------------------------

// WKT (POINT, LINESTRING, POLYGON, MULTI*, GEOMETRYCOLLECTION; i s předponou <crs>) → { polygons: [[prstenec, díry…], …],
// lines: [[[lon, lat], …], …] }
export const parseWkt = (text) => {
    const result = { polygons: [], lines: [] };
    const source = String(text || '').replace(/^\s*<[^>]*>\s*/, '');
    let position = 0;
    const skip = () => { while (position < source.length && /[\s,]/.test(source[position])) position++; };
    const word = () => { skip(); const match = /^[A-Za-z]+/.exec(source.slice(position, position + 40)); if (!match) return ''; position += match[0].length; return match[0].toUpperCase(); };
    // Závorkový výraz → vnořená pole čísel
    const group = () => {
        skip();
        if (source[position] !== '(') return null;
        position++;
        const items = [];
        for (;;) {
            skip();
            if (position >= source.length) break;
            if (source[position] === ')') { position++; break; }
            if (source[position] === '(') { items.push(group()); continue; }
            const end = source.indexOf(')', position);
            const nextOpen = source.indexOf('(', position);
            const stop = nextOpen >= 0 && nextOpen < end ? nextOpen : end;
            const chunk = source.slice(position, stop < 0 ? source.length : stop);
            for (const pair of chunk.split(',')) {
                const numbers = pair.trim().split(/\s+/).map(Number);
                if (numbers.length >= 2 && numbers.every(Number.isFinite)) items.push([numbers[0], numbers[1]]);
            }
            position = stop < 0 ? source.length : stop;
        }
        return items;
    };
    const geometry = () => {
        const type = word();
        if (!type) return false;
        skip();
        if (/^EMPTY/i.test(source.slice(position, position + 5))) { position += 5; return true; }
        if (type === 'GEOMETRYCOLLECTION') {
            skip();
            if (source[position] !== '(') return false;
            position++;
            for (;;) {
                skip();
                if (position >= source.length || source[position] === ')') { position++; break; }
                if (!geometry()) break;
            }
            return true;
        }
        const body = group();
        if (!body) return false;
        if (type === 'LINESTRING') result.lines.push(body);
        else if (type === 'MULTILINESTRING') result.lines.push(...body);
        else if (type === 'POLYGON') result.polygons.push(body);
        else if (type === 'MULTIPOLYGON') result.polygons.push(...body);
        return true;
    };
    geometry();
    result.lines = result.lines.filter(line => Array.isArray(line) && line.length >= 2);
    result.polygons = result.polygons.map(rings => rings.filter(ring => Array.isArray(ring) && ring.length >= 4)).filter(rings => rings.length);
    return result;
};

// --- OpenStreetMap přes QLever -------------------------------------------------------------------------------------

const OSM_PREFIXES = `PREFIX osm: <https://www.openstreetmap.org/> PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX osmrel: <https://www.openstreetmap.org/relation/> PREFIX osmway: <https://www.openstreetmap.org/way/> PREFIX osmnode: <https://www.openstreetmap.org/node/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#> PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
`;
const qleverOsm = async (query) => {
    const text = await politeText(QLEVER_OSM, {
        delay: 600, timeout: 120000,
        init: { method: 'POST', headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: OSM_PREFIXES + query }) }
    });
    if (!text) return text;
    try { return JSON.parse(text).results.bindings; } catch { return undefined; }
};

// Objekty OpenStreetMap se značkou wikidata=QID: { QID: [{ type: 'relation'|'way'|'node', id, natural, place, boundary,
// relationType, waterway, water, name }] }; uloženo v BUILD_CACHE pod cacheName
export const osmObjectsByWikidata = (cacheName, qids) => (offline() && !(process.env.BUILD_CACHE && existsSync(path.join(process.env.BUILD_CACHE, `${cacheName}.json`))) ? {} : cached(cacheName, async () => {
    const result = {};
    for (let i = 0; i < qids.length; i += 150) {
        const rows = await qleverOsm(`SELECT ?q ?o ?nat ?place ?bnd ?type ?ww ?water ?name WHERE { VALUES ?q { ${qids.slice(i, i + 150).map(q => `"${q}"`).join(' ')} }
?o osmkey:wikidata ?q . OPTIONAL { ?o osmkey:natural ?nat } OPTIONAL { ?o osmkey:place ?place } OPTIONAL { ?o osmkey:boundary ?bnd }
OPTIONAL { ?o osmkey:type ?type } OPTIONAL { ?o osmkey:waterway ?ww } OPTIONAL { ?o osmkey:water ?water } OPTIONAL { ?o osmkey:name ?name } }`);
        if (!rows) throw new Error('QLever (OpenStreetMap) neodpovídá');
        for (const row of rows) {
            const match = /openstreetmap\.org\/(relation|way|node)\/(\d+)$/.exec(row.o.value);
            if (!match) continue;
            const value = (key) => (row[key] ? row[key].value : undefined);
            const list = result[row.q.value] = result[row.q.value] || [];
            if (list.some(entry => entry.type === match[1] && entry.id === match[2])) continue;
            list.push({ type: match[1], id: match[2], natural: value('nat'), place: value('place'), boundary: value('bnd'), relationType: value('type'), waterway: value('ww'), water: value('water'), name: value('name') });
        }
    }
    return result;
}));

// Geometrie objektu OpenStreetMap z QLever (WKT z osm2rdf): { polygons, lines }, null když ji server nemá
export const osmGeometry = async (type, id) => {
    const text = await cachedText('osm-wkt', `${type}-${id}.wkt`, async () => {
        const rows = await qleverOsm(`SELECT ?wkt WHERE { osm${type === 'relation' ? 'rel' : type}:${id} geo:hasGeometry/geo:asWKT ?wkt }`);
        if (rows === undefined) return undefined;
        return rows && rows.length ? rows[0].wkt.value : null;
    });
    return text ? parseWkt(text) : text;
};

// --- řeky z API OpenStreetMap ---------------------------------------------------------------------------------------

const round5 = (value) => Math.round(value * 1e5) / 1e5;

// Cesty relace řeky: [{ role, waterway, line }] (starší mezipaměť: jen pole čar); null když relace není,
// undefined při výpadku. Podrelace (řeka složená z úseků) se načtou do hloubky 1.
export const osmRiverWays = async (relation, depth = 0) => {
    const text = await cachedText('osm-rivers', `${relation}.json`, async () => {
        const body = await politeText(`${OSM_API}/relation/${relation}/full.json`, { delay: 1500, timeout: 300000 });
        if (!body) return body === null ? '[]' : undefined;
        let elements;
        try { ({ elements } = JSON.parse(body)); } catch { return undefined; }
        const nodes = new Map();
        for (const element of elements) if (element.type === 'node') nodes.set(element.id, [round5(element.lon), round5(element.lat)]);
        const waysById = new Map(elements.filter(element => element.type === 'way').map(element => [element.id, element]));
        const rel = elements.find(element => element.type === 'relation' && element.id === Number(relation));
        const ways = [], relations = [];
        for (const member of (rel && rel.members) || []) {
            if (member.type === 'relation') { relations.push({ id: String(member.ref), role: member.role || '' }); continue; }
            if (member.type !== 'way') continue;
            const way = waysById.get(member.ref);
            if (!way) continue;
            const line = way.nodes.map(node => nodes.get(node)).filter(Boolean);
            if (line.length >= 2) ways.push({ role: member.role || '', waterway: (way.tags || {}).waterway || '', line });
        }
        return JSON.stringify({ ways, relations });
    });
    if (!text) return text;
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    const ways = data.ways || [];
    if (depth === 0) {
        for (const sub of (data.relations || []).filter(entry => ['', 'main_stream', 'main'].includes(entry.role)).slice(0, 12)) {
            const more = await osmRiverWays(sub.id, 1);
            if (Array.isArray(more)) ways.push(...more.filter(way => !Array.isArray(way)));
        }
    }
    return ways;
};

// --- GMBA Mountain Inventory v2 -------------------------------------------------------------------------------------

// Soupis pohoří GMBA (verze „broad“: celý ručně vymezený rozsah pohoří, ne jen plochy splňující definici hor):
// { rows: [{ index, id, qid, level, feature, unit, names: [jména], local: [místní jména] }], polygons(indexy) → Map }
// null, když soubor není v mezipaměti a nejde stáhnout
export const gmbaInventory = async () => {
    const dir = cacheDir('gmba');
    if (!dir) { console.warn('GMBA: bez BUILD_CACHE se soubor (140 MB) nestahuje'); return null; }
    const shp = path.join(dir, `${GMBA_NAME}.shp`), shx = path.join(dir, `${GMBA_NAME}.shx`), dbf = path.join(dir, `${GMBA_NAME}.dbf`);
    if (![shp, shx, dbf].every(existsSync)) {
        const zip = path.join(dir, `${GMBA_NAME}.zip`);
        if (!existsSync(zip)) {
            if (offline()) return null;
            console.log('GMBA: stahuji soupis pohoří (140 MB)');
            try {
                const response = await fetch(GMBA_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(1800000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
            } catch (error) {
                console.warn(`GMBA: stažení selhalo (${error.message})`);
                failedHosts.add(new URL(GMBA_URL).host);
                return null;
            }
        }
        unzipFiles(zip, name => (new RegExp(`^${GMBA_NAME.replace(/\./g, '\\.')}\\.(shp|shx|dbf)$`).test(name) ? path.join(dir, name) : null));
    }
    const rows = readDbf(dbf, ['GMBA_V2_ID', 'WikiDataUR', 'MapUnit', 'Hier_Lvl', 'Feature', 'DBaseName', 'AsciiName', 'Name_DE', 'Name_EN', 'Name_ES', 'Name_FR', 'Name_RU', 'LocalNames'])
        .map((row, index) => ({
            index, id: row.GMBA_V2_ID, qid: (/Q\d+/.exec(row.WikiDataUR) || [null])[0], level: Number(row.Hier_Lvl), feature: row.Feature, unit: row.MapUnit,
            names: [row.DBaseName, row.AsciiName, row.Name_EN, row.Name_DE, row.Name_ES, row.Name_FR, row.Name_RU].filter(Boolean),
            local: row.LocalNames.split(';').map(name => name.replace(/\([^)]*\)\s*$/, '').trim()).filter(Boolean)
        }));
    return { rows, polygons: (indexes) => readShpPolygons(shp, shx, indexes) };
};

// --- AOPK ČR: geomorfologické členění -------------------------------------------------------------------------------

// Okrsky geomorfologického členění ČR (935 mnohoúhelníků s názvy vyšších jednotek): pole prvků GeoJSON, null při výpadku
export const aopkGeomorphology = async () => {
    const text = await cachedText('aopk', 'geomorf-4.json', () => politeText(AOPK_GEOMORPHOLOGY, { timeout: 240000 }));
    if (!text) return null;
    try { return JSON.parse(text).features || null; } catch { return null; }
};

// --- Marine Regions (jen SeaVoX) -----------------------------------------------------------------------------------

// Záznamy místopisu Marine Regions přesně toho jména: [{ MRGID, placeType, preferredGazetteerName, gazetteerSource, … }]
export const marineRegionsByName = async (name) => {
    const text = await cachedText('marineregions', `name-${name.replace(/[^\p{L}\p{N}]+/gu, '_')}.json`,
        async () => { const body = await politeText(`${MARINE_REGIONS}/getGazetteerRecordsByName.json/${encodeURIComponent(name)}/?like=false&fuzzy=false`); return body === null ? '[]' : body; });
    if (!text) return [];
    try { const rows = JSON.parse(text); return Array.isArray(rows) ? rows : []; } catch { return []; }
};
export const isSeaVox = (record) => /SeaVoX/i.test(`${record.placeType} ${record.gazetteerSource}`);
// Geometrie záznamu: { polygons, lines } jen z vrstev zdroje sourceId (128 = SeaVoX v19), null když žádná není
export const SEAVOX_SOURCE = '128';
export const marineRegionsGeometry = async (mrgid, sourceId = SEAVOX_SOURCE) => {
    const text = await cachedText('marineregions', `geometry-${mrgid}.json`, () => politeText(`${MARINE_REGIONS}/getGazetteerGeometries.jsonld/${mrgid}/`, { timeout: 240000 }));
    if (!text) return text;
    let data;
    try { data = JSON.parse(text); } catch { return null; }
    const result = { polygons: [], lines: [] };
    for (const geometry of [].concat(data['mr:hasGeometry'] || [])) {
        if (!new RegExp(`[?&]source=${sourceId}(&|$)`).test(String(geometry['@id'] || ''))) continue;
        const parsed = parseWkt(geometry['gsp:asWKT']);
        result.polygons.push(...parsed.polygons);
        result.lines.push(...parsed.lines);
    }
    return result.polygons.length ? result : null;
};

// --- Wikimedia Commons Data:*.map -----------------------------------------------------------------------------------

// Obrys ze stránky Commons Data:Jméno.map (vlastnost Wikidat P3896): { licence, polygons }, null když stránka není,
// nejde přečíst nebo nemá licenci CC0 (jiné licence se nepřebírají)
export const commonsMap = async (title) => {
    const page = /^Data:/i.test(title) ? title : `Data:${title}`;
    const text = await cachedText('commons-data', `${page.replace(/[^\p{L}\p{N}.]+/gu, '_')}.json`, () => politeText(`${COMMONS}?title=${encodeURIComponent(page.replace(/ /g, '_'))}&action=raw`));
    if (!text) return null;
    let data;
    try { data = JSON.parse(text); } catch { return null; }
    const licence = String(data.license || '');
    const polygons = [];
    const collect = (geometry) => {
        if (!geometry) return;
        if (geometry.type === 'Polygon') polygons.push(geometry.coordinates);
        else if (geometry.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
        else if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(collect);
        else if (geometry.type === 'Feature') collect(geometry.geometry);
        else if (geometry.type === 'FeatureCollection') geometry.features.forEach(collect);
    };
    collect(data.data);
    return { licence, polygons };
};
