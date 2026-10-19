// Sestaví sadu míst pro kvíz z Wikidat: data/places.json
// Spuštění: npm run build:places (dotazuje query.wikidata.org, trvá asi deset minut)
//
// 1. krok: pro každý typ (P31) seznam položek s nejvíc jazykovými verzemi (míra známosti)
// 2. krok: podrobnosti po dávkách – článek na české Wikipedii, název, souřadnice, státy, fotka, čísla
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'GeoKvizBuild/1.0 (https://github.com/taronwho/geografie-kviz)';
const CZECHIA = 'Q213';

// Typy jsou seřazené od nejvýstižnějšího – podle prvního nalezeného se místo popíše („hrad“, „mešita“…).
// limit = kolik míst z kategorie vzít, known = kolik nejznámějších z nich patří mezi „známá místa“.
// Česká místa se berou i méně známá (od czMin jazykových verzí) a mezi známá patří navíc czKnown nejznámějších z nich.
const CATEGORIES = [
    { key: 'stat', types: ['Q3624078'], min: 50, limit: 200, known: 110 },
    { key: 'hora', types: ['Q8072', 'Q169358', 'Q8502', 'Q46831'], min: 25, limit: 550, known: 90, czMin: 12, czKnown: 20 },
    { key: 'reka', types: ['Q4022'], min: 25, limit: 450, known: 90, czMin: 12, czKnown: 15 },
    { key: 'jezero', types: ['Q9430', 'Q165', 'Q23397', 'Q131681', 'Q39594', 'Q37901', 'Q187223'], min: 25, limit: 450, known: 90, czMin: 12, czKnown: 5 },
    { key: 'ostrov', types: ['Q23442', 'Q33837'], min: 30, limit: 450, known: 90 },
    {
        key: 'priroda',
        types: ['Q46169', 'Q8514', 'Q34038', 'Q35509', 'Q150784', 'Q35666', 'Q34763', 'Q39816', 'Q1139493', 'Q631305', 'Q184358'],
        min: 20, limit: 450, known: 90, czMin: 10, czKnown: 10
    },
    {
        key: 'mesto',
        types: ['Q108178728', 'Q5119', 'Q1637706', 'Q1549591', 'Q200250', 'Q174844', 'Q51929311', 'Q515', 'Q1093829', 'Q7930989',
            'Q42744322', 'Q484170', 'Q747074', 'Q2074737', 'Q494721', 'Q12131624', 'Q925381', 'Q2264924', 'Q133442', 'Q3957', 'Q15284', 'Q5153359'],
        min: 60, limit: 800, known: 220, czMin: 25, czKnown: 30
    },
    {
        key: 'stavba',
        types: ['Q23413', 'Q16560', 'Q53536964', 'Q751876', 'Q2977', 'Q56242215', 'Q163687', 'Q120560', 'Q334383', 'Q44613', 'Q16970',
            'Q32815', 'Q5393308', 'Q842402', 'Q58621988', 'Q267596', 'Q44539', 'Q162875', 'Q175582', 'Q12516', 'Q131668', 'Q935773',
            'Q1784293', 'Q57821', 'Q11303', 'Q1440300', 'Q11166728', 'Q797765', 'Q853854', 'Q12570', 'Q158438', 'Q12280', 'Q143912',
            'Q82117', 'Q1779653', 'Q179700', 'Q483453', 'Q153562', 'Q2114972', 'Q12323', 'Q949819', 'Q174782', 'Q4588528', 'Q2319498',
            'Q4989906', 'Q207694', 'Q33506', 'Q1081138', 'Q15661340', 'Q839954'],
        min: 30, limit: 700, known: 160, czMin: 12, czKnown: 30
    }
];
// Starověká města a archeologická naleziště (Petra, Pompeje) patří mezi památky, ne mezi dnešní města
const LANDMARK_OVER_CITY = new Set(['Q15661340', 'Q839954']);

const CONTINENTS = { Q46: 'EU', Q48: 'AS', Q15: 'AF', Q49: 'NA', Q18: 'SA', Q538: 'OC', Q55643: 'OC', Q3960: 'OC', Q51: 'AN' };

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sparql = async (query) => {
    for (let attempt = 1; attempt <= 6; attempt++) {
        let status;
        try {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ query })
            });
            if (response.ok) return (await response.json()).results.bindings;
            status = `HTTP ${response.status}`;
        } catch (error) {
            status = error.message;
        }
        console.warn(`  ${status}, zkouším znovu (${attempt}/6)`);
        await sleep(15000 * attempt);
    }
    throw new Error('Wikidata neodpovídají');
};

const id = (uri) => uri.split('/').pop();
const round = (n, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;

// --- Státy: české názvy, kontinent a číselný kód ISO (pro zvýraznění na slepé mapě) ---
console.log('Státy…');
const countries = {};
const countryRows = await sparql(`
SELECT ?c ?label ?iso (GROUP_CONCAT(DISTINCT ?cont; separator="|") AS ?continents) WHERE {
  ?c wdt:P31 wd:Q3624078 .
  FILTER NOT EXISTS { ?c wdt:P576 [] }
  ?c rdfs:label ?label FILTER(LANG(?label) = "cs")
  OPTIONAL { ?c wdt:P299 ?iso }
  OPTIONAL { ?c wdt:P30 ?cont }
} GROUP BY ?c ?label ?iso`);
// Nizozemské a Dánské království (celky i se zámořím) by se pletly s Nizozemskem a Dánskem
const EXCLUDED_STATES = new Set(['Q29999', 'Q756617']);
for (const row of countryRows) {
    if (EXCLUDED_STATES.has(id(row.c.value))) continue;
    const continent = (row.continents ? row.continents.value : '').split('|').map(id).map(q => CONTINENTS[q]).find(Boolean);
    countries[id(row.c.value)] = { name: row.label.value, continent: continent || '', iso: row.iso ? row.iso.value : '' };
}
console.log(`  ${Object.keys(countries).length} států`);

// --- 1. krok: kandidáti podle typů ---
// Volitelně se mezivýsledek uloží (PLACES_CACHE=soubor), aby šel 2. krok zopakovat bez dlouhého 1. kroku
const CACHE = process.env.PLACES_CACHE;
const candidates = new Map(); // qid → { sitelinks, types: Set, czech }
const addCandidate = (row, type, czech) => {
    const qid = id(row.item.value);
    const entry = candidates.get(qid) || { sitelinks: Number(row.sitelinks.value), types: new Set(), czech: false };
    entry.types.add(type);
    entry.czech = entry.czech || czech;
    candidates.set(qid, entry);
};

if (CACHE && existsSync(CACHE)) {
    for (const [qid, entry] of JSON.parse(readFileSync(CACHE, 'utf8'))) candidates.set(qid, { ...entry, types: new Set(entry.types) });
    console.log(`Kandidáti z ${CACHE}: ${candidates.size}`);
} else for (const category of CATEGORIES) {
    for (const type of category.types) {
        const rows = await sparql(`
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:${type} ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${category.min})
} ORDER BY DESC(?sitelinks) LIMIT 1500`);
        rows.forEach(row => addCandidate(row, type, false));
        let czech = 0;
        if (category.czMin) {
            const czRows = await sparql(`
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:${type} ; wdt:P17 wd:${CZECHIA} ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${category.czMin})
}`);
            czRows.forEach(row => addCandidate(row, type, true));
            czech = czRows.length;
        }
        console.log(`${category.key} ${type}: ${rows.length}${category.czMin ? ` + ${czech} českých` : ''}`);
        await sleep(500);
    }
}

if (CACHE && !existsSync(CACHE)) {
    writeFileSync(CACHE, JSON.stringify([...candidates].map(([qid, entry]) => [qid, { ...entry, types: [...entry.types] }])));
}

// --- 2. krok: podrobnosti po dávkách ---
const detailsQuery = (qids) => `
SELECT ?item ?p ?v ?ref ?time WHERE {
  VALUES ?item { ${qids.map(q => 'wd:' + q).join(' ')} }
  { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item p:P1082 ?s . ?s a wikibase:BestRank ; ps:P1082 ?v . OPTIONAL { ?s pq:P585 ?time } BIND("pop" AS ?p) }
  UNION { ?item p:P2046 ?s . ?s a wikibase:BestRank ; psn:P2046/wikibase:quantityAmount ?v BIND("area" AS ?p) }
  UNION { ?item p:P2044 ?s . ?s a wikibase:BestRank ; psn:P2044/wikibase:quantityAmount ?v BIND("elev" AS ?p) }
  UNION { ?item p:P2043 ?s . ?s a wikibase:BestRank ; psn:P2043/wikibase:quantityAmount ?v BIND("len" AS ?p) }
  UNION { ?item p:P2048 ?s . ?s a wikibase:BestRank ; psn:P2048/wikibase:quantityAmount ?v BIND("h" AS ?p) }
  UNION { ?item wdt:P571 ?date BIND(YEAR(?date) AS ?v) BIND("year" AS ?p) }
  UNION { ?item wdt:P36 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("cap" AS ?p) }
  UNION { ?item wdt:P403 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("mouth" AS ?p) }
  UNION { ?item wdt:P31 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND(STR(?x) AS ?ref) BIND("type" AS ?p) }
}`;

// Souřadnice na jiném tělese (Olympus Mons na Marsu) mají před bodem odkaz na glóbus – ty vynecháme
const parsePoint = (wkt) => {
    if (!wkt || wkt.trim().startsWith('<')) return null;
    const match = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt || '');
    return match ? { lon: round(Number(match[1]), 3), lat: round(Number(match[2]), 3) } : null;
};

const fileName = (commonsUrl) => decodeURIComponent(commonsUrl.split('/Special:FilePath/').pop());

// Podrobnosti se při PLACES_CACHE také uloží, aby šlo pravidla níž ladit bez opakovaného stahování
const DETAILS_CACHE = CACHE && CACHE.replace(/(\.json)?$/, '.details.json');
const fetchDetails = async (qids) => {
    if (DETAILS_CACHE && existsSync(DETAILS_CACHE)) {
        console.log(`Podrobnosti z ${DETAILS_CACHE}`);
        return new Map(JSON.parse(readFileSync(DETAILS_CACHE, 'utf8')));
    }
    const details = new Map(qids.map(q => [q, { values: {}, types: {}, pops: [], co: [] }]));
    for (let i = 0; i < qids.length; i += 80) {
        const rows = await sparql(detailsQuery(qids.slice(i, i + 80)));
        for (const row of rows) {
            const entry = details.get(id(row.item.value));
            const key = row.p.value;
            // Neznámá hodnota (např. datum „neznámo“) přijde bez ?v
            if (!row.v) continue;
            const v = row.v.value;
            if (key === 'type') entry.types[id(row.ref.value)] = v;
            else if (key === 'pop') entry.pops.push({ value: Number(v), time: row.time ? row.time.value : '' });
            else if (key === 'co') { if (!entry.co.includes(id(v))) entry.co.push(id(v)); }
            else if (!(key in entry.values)) entry.values[key] = v;
        }
        process.stdout.write(`  ${Math.min(i + 80, qids.length)}/${qids.length}\r`);
        await sleep(500);
    }
    if (DETAILS_CACHE) writeFileSync(DETAILS_CACHE, JSON.stringify([...details]));
    return details;
};

const ordered = [...candidates.entries()].sort((a, b) => b[1].sitelinks - a[1].sitelinks);
console.log(`Podrobnosti k ${ordered.length} kandidátům…`);
const details = await fetchDetails(ordered.map(([qid]) => qid));

const numberOf = (values, key) => values[key] === undefined ? undefined : Number(values[key]);
const factsOf = ({ values, pops }) => {
    const latestPop = [...pops].sort((a, b) => b.time.localeCompare(a.time) || b.value - a.value)[0];
    const area = numberOf(values, 'area');
    const facts = {
        pop: latestPop ? Math.round(latestPop.value) : undefined,
        area: area === undefined ? undefined : round(area / 1e6, area < 1e7 ? 2 : 0),
        elev: numberOf(values, 'elev') === undefined ? undefined : Math.round(numberOf(values, 'elev')),
        len: numberOf(values, 'len') === undefined ? undefined : Math.round(numberOf(values, 'len') / 1000),
        h: numberOf(values, 'h') === undefined ? undefined : Math.round(numberOf(values, 'h')),
        year: numberOf(values, 'year'),
        cap: values.cap,
        mouth: values.mouth
    };
    return Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined && v !== '' && !Number.isNaN(v)));
};

// Každé místo do jedné kategorie: první v pořadí CATEGORIES vyhrává (Monako je stát, ne město).
// Starověká města a naleziště bez dnešních obyvatel (Petra, Pompeje) patří mezi památky, Káhira mezi města.
const categoryOf = (entry, facts) => {
    const matched = CATEGORIES.filter(category => category.types.some(type => entry.types.has(type)));
    const isAncient = [...entry.types].some(type => LANDMARK_OVER_CITY.has(type));
    if (matched.some(c => c.key === 'mesto') && isAncient && !(facts.pop >= 10000)) return CATEGORIES.find(c => c.key === 'stavba');
    return matched[0];
};

// Popis typu: kratší české názvy a nic, co by prozradilo stát („obec ve Španělsku“)
const ONE = { stat: 'stát', mesto: 'město', hora: 'hora', reka: 'řeka', jezero: 'vodní plocha', ostrov: 'ostrov', priroda: 'přírodní místo', stavba: 'stavba' };
const TYPE_LABELS = { Q108178728: 'hlavní město', Q5119: 'hlavní město', Q51929311: 'největší město státu', Q120560: 'bazilika', Q5153359: 'město', Q15284: 'město', Q3957: 'město', Q7930989: 'město' };
const typeLabelOf = (category, typeId, label) => {
    if (TYPE_LABELS[typeId]) return TYPE_LABELS[typeId];
    if (!label || /\s(?:v|ve|na)\s/u.test(label)) return ONE[category.key];
    return label;
};

// Dnešní obce v Česku jen od 5 000 obyvatel (Wikipedie má článek o každé vesnici)
const CZECH_TOWN_MIN_POP = 5000;

// Náhled fotky přímo z upload.wikimedia.org: cesta podle MD5 názvu souboru, šířka 960 px je jedna ze standardních velikostí
const thumbHash = (file) => createHash('md5').update(file.replace(/ /g, '_')).digest('hex').slice(0, 2);

const places = [];
const rankByCategory = {};
const czechRankByCategory = {};
for (const [qid, entry] of ordered) {
    const detail = details.get(qid);
    const { values, types } = detail;
    const facts = factsOf(detail);
    const category = categoryOf(entry, facts);
    const point = parsePoint(values.coord);
    // Státy jen ty, které dnes existují (stejný seznam jako v tabulce států)
    if (!category || !values.t || !point || (category.key === 'stat' && !countries[qid])) continue;
    const isCzech = detail.co.includes(CZECHIA) || entry.czech;
    if (category.key === 'mesto' && isCzech && !(facts.pop >= CZECH_TOWN_MIN_POP)) continue;
    const rank = rankByCategory[category.key] || 0;
    if (rank >= category.limit && !isCzech) continue;
    rankByCategory[category.key] = rank + 1;
    const czechRank = czechRankByCategory[category.key] || 0;
    if (isCzech) czechRankByCategory[category.key] = czechRank + 1;
    const known = rank < category.known || (isCzech && czechRank < (category.czKnown || 0));
    const typeId = category.types.find(type => entry.types.has(type));
    const image = values.im ? fileName(values.im) : undefined;
    places.push({
        q: qid,
        t: values.t,
        n: values.n || values.t.replace(/ \(.*\)$/, ''),
        c: category.key,
        k: known ? 1 : 0,
        la: point.lat,
        lo: point.lon,
        ty: typeLabelOf(category, typeId, types[typeId]),
        d: values.d || undefined,
        co: category.key === 'stat' ? [qid] : detail.co,
        im: image,
        ih: image ? thumbHash(image) : undefined,
        f: facts
    });
}

// Méně známé místo se jménem známého místa jiné kategorie (sopka „Amsterdam“) by jen mátlo
const knownNames = new Map(places.filter(p => p.k).map(p => [p.n, p.c]));
const result = places.filter(p => p.k || !knownNames.has(p.n) || knownNames.get(p.n) === p.c);

for (const category of CATEGORIES) {
    const inCategory = result.filter(p => p.c === category.key);
    console.log(`${category.key}: ${inCategory.length} míst (${inCategory.filter(p => p.k).length} známých)`);
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/places.json', import.meta.url), JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    countries,
    places: result
}));
console.log(`Hotovo: ${result.length} míst`);
