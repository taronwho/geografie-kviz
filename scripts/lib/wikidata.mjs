// Společné pomocníky pro sestavení dat témat z Wikidat (dotazy na query.wikidata.org, zápis do data/)
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ENDPOINT = 'https://query.wikidata.org/sparql';
// QLever (Univerzita Freiburg) zvládne i dotazy přes celý strom taxonů, na kterých query.wikidata.org vyprší
const QLEVER = 'https://qlever.dev/api/wikidata';
const QLEVER_PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX schema: <http://schema.org/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX p: <http://www.wikidata.org/prop/> PREFIX ps: <http://www.wikidata.org/prop/statement/> PREFIX psn: <http://www.wikidata.org/prop/statement/value-normalized/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
`;
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';

export const CZECHIA = 'Q213';
export const CONTINENTS = { Q46: 'EU', Q48: 'AS', Q15: 'AF', Q49: 'NA', Q18: 'SA', Q538: 'OC', Q55643: 'OC', Q3960: 'OC', Q51: 'AN' };

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Dotaz SPARQL s opakováním při přetížení (429, 5xx) i výpadku spojení
export const sparql = async (query, endpoint = ENDPOINT, attempts = 6) => {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        let status;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ query })
            });
            if (response.ok) return (await response.json()).results.bindings;
            status = `HTTP ${response.status}`;
        } catch (error) {
            status = error.message;
        }
        console.warn(`  ${status}, zkouším znovu (${attempt}/${attempts})`);
        await sleep(15000 * attempt);
    }
    throw new Error('Wikidata neodpovídají');
};
export const qlever = (query, attempts) => sparql(QLEVER_PREFIXES + query, QLEVER, attempts);

export const id = (uri) => uri.split('/').pop();
export const round = (n, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;
export const values = (qids) => qids.map(q => 'wd:' + q).join(' ');

// Souřadnice na jiném tělese (Olympus Mons na Marsu) mají před bodem odkaz na glóbus – ty vynecháme
export const parsePoint = (wkt) => {
    if (!wkt || wkt.trim().startsWith('<')) return null;
    const match = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/i.exec(wkt);
    return match ? { lon: round(Number(match[1]), 3), lat: round(Number(match[2]), 3) } : null;
};

export const fileName = (commonsUrl) => decodeURIComponent(commonsUrl.split('/Special:FilePath/').pop());

// Náhled fotky přímo z upload.wikimedia.org: cesta podle MD5 názvu souboru
export const thumbHash = (file) => createHash('md5').update(file.replace(/ /g, '_')).digest('hex').slice(0, 2);

// Fotky z Wikidat, které nejdou použít (reports/licence-problemy.md: metadata Commons bez licence, smazaný soubor),
// a volná náhrada z Commons; prázdný řetězec = položka bez fotky
export const PHOTO_REPLACEMENTS = {
    // NASA PIA… bez šablony licence na Commons
    'PIA18317-SaturnMoon-Tethys-Cassini-20150411.jpg': 'Global view of Tethys from Cassini.jpg',
    'PIA24168-Asteroid-99942Apophis-RadarImages-20210326.jpg': '99942 Apophis shape.png',
    // Soubory, které na Commons už nejsou (Wikidata už mají jiné)
    'Bundesarchiv B 145 Bild-F078072-0004, Konrad Adenauer.jpg': 'Konrad Adenauer - 14. CDU-Bundesparteitag-kasf0095.JPG',
    'Parus atricapillus 2 (Marek Szczepanek).jpg': 'Poecile montanus Raschötz 20190905.jpg',
    'Slobodan Milosevic in French delegation 2000.png': 'Stevan Kragujević, Slobodan Milošević, portret.jpg'
};

// Fotka položky: název souboru a hash pro náhled (jen skutečné fotky řeší až aplikace)
export const imageFields = (commonsUrl) => {
    if (!commonsUrl) return {};
    const found = fileName(commonsUrl);
    const image = Object.hasOwn(PHOTO_REPLACEMENTS, found) ? PHOTO_REPLACEMENTS[found] : found;
    return image ? { im: image, ih: thumbHash(image) } : {};
};

// Rok z data Wikidat (i před naším letopočtem: „-0753-01-01T00:00:00Z“)
export const yearOf = (dateValue) => {
    const match = /^(-?)(\d+)-/.exec(dateValue || '');
    return match ? Number(match[1] + match[2]) : undefined;
};

export const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== '' && v !== null
    && !(typeof v === 'number' && Number.isNaN(v)) && !(Array.isArray(v) && v.length === 0)));

// Mezivýsledek do souboru, aby šlo pravidla ladit bez opakovaného stahování (proměnná BUILD_CACHE=složka)
export const cached = async (name, compute) => {
    const dir = process.env.BUILD_CACHE;
    const file = dir && `${dir}/${name}.json`;
    if (file && existsSync(file)) {
        console.log(`  (z mezipaměti ${file})`);
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    const result = await compute();
    if (file) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, JSON.stringify(result));
    }
    return result;
};

// Po dávkách: dotaz s VALUES pro každou dávku ID, řádky předá funkci onRow
export const inBatches = async (qids, size, buildQuery, onRow, run = sparql) => {
    for (let i = 0; i < qids.length; i += size) {
        const rows = await run(buildQuery(qids.slice(i, i + size)));
        rows.forEach(onRow);
        process.stdout.write(`  ${Math.min(i + size, qids.length)}/${qids.length}\r`);
        await sleep(500);
    }
};

export const readCountries = () => JSON.parse(readFileSync(new URL('../../data/countries.json', import.meta.url), 'utf8')).countries;

// Popis z Wikidat s rozbitou závorkou („[od 1939 v muzeu)“, „(50 let]]“) – zlomek v nesprávné závorce se vypustí
export const cleanDescription = (text) => typeof text !== 'string' ? text : text
    .replace(/\s*\[[^\[\]()]*\)+/g, '')
    .replace(/\s*\([^\[\]()]*\]+/g, '')
    .replace(/\s*[\[\]]+/g, '')
    .replace(/\s*\([^)]*$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;]+$/, '')
    // Tečka na konci: hra za krátký popis tečku přidává sama („Americký herec..“, „př. n. l..“)
    .replace(/\.+$/, '')
    .trim();

// Druh stavby podle jejího jména: Wikidata mají u zámků „hrad“ (castle), u kostela „katedrála“, u rotundy „kaple“ –
// štítek otázky by pak odporoval názvu (Zámek Kroměříž – hrad). Když název začíná druhem stavby a štítek je jiný druh,
// platí druh z názvu; když název druh štítku obsahuje (Mešita-katedrála, Zámek … – muzeum), štítek zůstane
const BUILDING_TYPES = ['kostel', 'katedrála', 'bazilika', 'chrám', 'kaple', 'rotunda', 'klášter', 'mešita', 'synagoga', 'hrad', 'zámek', 'palác', 'pevnost',
    'věž', 'most', 'muzeum', 'divadlo', 'radnice', 'nádraží', 'stadion', 'pagoda'];
const COMPATIBLE = new Set(['bazilika:katedrála', 'katedrála:bazilika', 'kostel:bazilika', 'kaple:kostel']);
const typeWordOf = (text) => BUILDING_TYPES.find(word => new RegExp(`(?<![\\p{L}])${word}(?![\\p{L}])`, 'iu').test(text || ''));
export const buildingTypeFromName = (name, ty) => {
    if (!name || !ty) return ty;
    const leading = BUILDING_TYPES.find(word => new RegExp(`^${word}(?![\\p{L}])`, 'iu').test(name));
    const typed = typeWordOf(ty);
    // „Chrám“ je obecné slovo (kostel, katedrála i mešita); bazilika může být i katedrálou a kostel bazilikou
    if (!leading || !typed || leading === typed || leading === 'chrám' || COMPATIBLE.has(`${leading}:${typed}`)) return ty;
    return new RegExp(`(?<![\\p{L}])${typed}(?![\\p{L}])`, 'iu').test(name) ? ty : leading;
};

// Zapíše data tématu; okruhy s méně než 5 položkami vynechá (i z položek), aby v učení nebyly skoro prázdné
export const writeTopic = (topicId, { collections: allCollections, items }) => {
    const sizes = new Map(allCollections.map(collection => [collection.id, items.filter(item => (item.g || []).includes(collection.id)).length]));
    const collections = allCollections.filter(collection => sizes.get(collection.id) >= 5);
    const kept = new Set(collections.map(collection => collection.id));
    for (const item of items) {
        if (!item.g) continue;
        item.g = item.g.filter(group => kept.has(group));
        if (!item.g.length) delete item.g;
    }
    for (const item of items) {
        if (item.d) item.d = cleanDescription(item.d);
        if (item.ty) item.ty = cleanDescription(item.ty);
    }
    mkdirSync(new URL('../../data/', import.meta.url), { recursive: true });
    writeFileSync(new URL(`../../data/${topicId}.json`, import.meta.url), JSON.stringify({
        generated: new Date().toISOString().slice(0, 10),
        collections,
        items
    }));
    console.log(`Hotovo: data/${topicId}.json, ${items.length} položek, ${collections.length} okruhů`);
};
