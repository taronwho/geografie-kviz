// Téma Zeměpis: data/zemepis.json z Wikidat (asi 20 minut; s BUILD_CACHE=složka jde pravidla ladit bez stahování)
// Spuštění: npm run build:zemepis (potřebuje data/countries.json – npm run build:countries)
//
// 1. krok: pro každý typ (P31) seznam položek s nejvíc jazykovými verzemi (míra známosti)
// 2. krok: podrobnosti po dávkách – článek na české Wikipedii, název, souřadnice, státy, fotka, čísla
// 3. krok: zápis v UNESCO a okruhy pro systematické učení
import { sparql, id, round, values, parsePoint, imageFields, cached, inBatches, readCountries, writeTopic, sleep, CZECHIA } from './lib/wikidata.mjs';

// Typy jsou seřazené od nejvýstižnějšího – podle prvního nalezeného se místo popíše („hrad“, „mešita“…).
// limit = kolik míst z kategorie vzít, known = kolik nejznámějších z nich patří mezi „známá místa“.
// Česká místa se berou i méně známá (od czMin jazykových verzí) a mezi známá patří navíc czKnown nejznámějších z nich.
const CATEGORIES = [
    { key: 'stat', types: ['Q3624078'], min: 50, limit: 200, known: 110 },
    { key: 'hora', types: ['Q8072', 'Q169358', 'Q8502', 'Q46831'], min: 25, limit: 550, known: 90, czMin: 12, czKnown: 15 },
    { key: 'reka', types: ['Q4022'], min: 25, limit: 450, known: 90, czMin: 12, czKnown: 10 },
    { key: 'jezero', types: ['Q9430', 'Q165', 'Q23397', 'Q131681', 'Q39594', 'Q37901', 'Q187223'], min: 25, limit: 450, known: 90, czMin: 12, czKnown: 5 },
    { key: 'ostrov', types: ['Q23442', 'Q33837'], min: 30, limit: 450, known: 90 },
    {
        key: 'priroda',
        types: ['Q46169', 'Q8514', 'Q34038', 'Q35509', 'Q150784', 'Q35666', 'Q34763', 'Q39816', 'Q1139493', 'Q631305', 'Q184358'],
        min: 20, limit: 450, known: 90, czMin: 10, czKnown: 6
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
        min: 30, limit: 700, known: 160, czMin: 12, czKnown: 20
    }
];
// Starověká města a archeologická naleziště (Petra, Pompeje) patří mezi památky, ne mezi dnešní města
const LANDMARK_OVER_CITY = new Set(['Q15661340', 'Q839954']);
const WORLD_HERITAGE_SITE = 'Q9259';

const countries = readCountries();

// --- 1. krok: kandidáti podle typů ---
const candidateList = await cached('zemepis-candidates', async () => {
    const candidates = new Map();
    const add = (row, type, czech) => {
        const qid = id(row.item.value);
        const entry = candidates.get(qid) || { sitelinks: Number(row.sitelinks.value), types: [], czech: false };
        if (!entry.types.includes(type)) entry.types.push(type);
        entry.czech = entry.czech || czech;
        candidates.set(qid, entry);
    };
    for (const category of CATEGORIES) {
        for (const type of category.types) {
            const rows = await sparql(`
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:${type} ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${category.min})
} ORDER BY DESC(?sitelinks) LIMIT 1500`);
            rows.forEach(row => add(row, type, false));
            let czech = 0;
            if (category.czMin) {
                const czRows = await sparql(`
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:${type} ; wdt:P17 wd:${CZECHIA} ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${category.czMin})
}`);
                czRows.forEach(row => add(row, type, true));
                czech = czRows.length;
            }
            console.log(`${category.key} ${type}: ${rows.length}${category.czMin ? ` + ${czech} českých` : ''}`);
            await sleep(500);
        }
    }
    return [...candidates];
});
const candidates = new Map(candidateList.map(([qid, entry]) => [qid, { ...entry, types: new Set(entry.types) }]));

// --- 2. krok: podrobnosti po dávkách ---
const detailsQuery = (qids) => `
SELECT ?item ?p ?v ?ref ?time WHERE {
  VALUES ?item { ${values(qids)} }
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

const ordered = [...candidates.entries()].sort((a, b) => b[1].sitelinks - a[1].sitelinks);
console.log(`Podrobnosti k ${ordered.length} kandidátům…`);
const details = new Map(await cached('zemepis-details', async () => {
    const result = new Map(ordered.map(([qid]) => [qid, { values: {}, types: {}, pops: [], co: [] }]));
    await inBatches(ordered.map(([qid]) => qid), 80, detailsQuery, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        // Neznámá hodnota (např. datum „neznámo“) přijde bez ?v
        if (!row.v) return;
        const v = row.v.value;
        if (key === 'type') entry.types[id(row.ref.value)] = v;
        else if (key === 'pop') entry.pops.push({ value: Number(v), time: row.time ? row.time.value : '' });
        else if (key === 'co') { if (!entry.co.includes(id(v))) entry.co.push(id(v)); }
        else if (!(key in entry.values)) entry.values[key] = v;
    });
    return [...result];
}));

// Opravy chybných údajů ve Wikidatech (Annapurna je tam masiv s výškou vedlejšího vrcholu 7 756 m, hlavní vrchol má 8 091 m)
const FACT_OVERRIDES = { Q159621: { elev: '8091' } };
const TYPE_OVERRIDES = { Q159621: 'hora' };
for (const [qid, values] of Object.entries(FACT_OVERRIDES)) if (details.has(qid)) Object.assign(details.get(qid).values, values);
const numberOf = (detailValues, key) => detailValues[key] === undefined ? undefined : Number(detailValues[key]);
const factsOf = ({ values: v, pops }) => {
    const latestPop = [...pops].sort((a, b) => b.time.localeCompare(a.time) || b.value - a.value)[0];
    const area = numberOf(v, 'area');
    const length = numberOf(v, 'len');
    const facts = {
        pop: latestPop ? Math.round(latestPop.value) : undefined,
        area: area === undefined ? undefined : round(area / 1e6, area < 1e7 ? 2 : 0),
        elev: numberOf(v, 'elev') === undefined ? undefined : Math.round(numberOf(v, 'elev')),
        len: length === undefined ? undefined : round(length / 1000, length < 1e4 ? 1 : 0),
        h: numberOf(v, 'h') === undefined ? undefined : Math.round(numberOf(v, 'h')),
        year: numberOf(v, 'year'),
        cap: v.cap,
        mouth: v.mouth
    };
    return Object.fromEntries(Object.entries(facts).filter(([, x]) => x !== undefined && x !== '' && !Number.isNaN(x)));
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

// Dnešní obce v Česku jen od 5 000 obyvatel (Wikipedie má článek o každé vesnici), jinde od 30 000 nebo hlavní města
const CZECH_TOWN_MIN_POP = 5000;
const TOWN_MIN_POP = 30000;

// Počet jazykových verzí u států a ostrovů známost moc neodráží (Tuvalu jich má tolik co Kuba), proto vlastní pravidla:
// známé státy jsou evropské a ty od 3 milionů obyvatel, známá města hlavní města známých států a velkoměsta,
// známé ostrovy ty největší a nejznámější z větších (ne ostrůvky zámořských území) a pár slavných malých
const isKnownState = (qid, facts) => countries[qid].continent === 'EU' || facts.pop >= 3e6;
const FAMOUS_SMALL_ISLANDS = new Set(['Capri', 'Santorini', 'Mykonos', 'Bora Bora', 'Stromboli', 'Helgoland', 'Manhattan', 'Alcatraz']);
const stateFacts = new Map(ordered
    .filter(([qid, entry]) => countries[qid] && categoryOf(entry, factsOf(details.get(qid))).key === 'stat')
    .map(([qid]) => [qid, factsOf(details.get(qid))]));
const capitals = new Set([...stateFacts.values()].map(facts => facts.cap).filter(Boolean));
const knownCapitals = new Set([...stateFacts].filter(([qid, facts]) => isKnownState(qid, facts)).map(([, facts]) => facts.cap).filter(Boolean));
const KNOWN_RULES = {
    stat: ({ qid, facts }) => isKnownState(qid, facts),
    mesto: ({ name, facts, rank, category }) => knownCapitals.has(name) || facts.pop >= 2e6 || (rank < category.known && facts.pop >= 15e4),
    ostrov: ({ name, facts, rank, category }) => FAMOUS_SMALL_ISLANDS.has(name) || facts.area >= 1e5
        || (rank < category.known * 1.6 && facts.area >= 150) || (!facts.area && rank < category.known / 2)
};

const places = [];
const rankByCategory = {};
const czechRankByCategory = {};
for (const [qid, entry] of ordered) {
    const detail = details.get(qid);
    const { values: v, types } = detail;
    const facts = factsOf(detail);
    const category = categoryOf(entry, facts);
    const point = parsePoint(v.coord);
    // Státy jen ty, které dnes existují (stejný seznam jako v tabulce států)
    if (!category || !v.t || !point || (category.key === 'stat' && !countries[qid])) continue;
    const name = v.n || v.t.replace(/ \(.*\)$/, '');
    const isCzech = detail.co.includes(CZECHIA) || entry.czech;
    if (category.key === 'mesto' && !(facts.pop >= (isCzech ? CZECH_TOWN_MIN_POP : TOWN_MIN_POP)) && !capitals.has(name)) continue;
    const rank = rankByCategory[category.key] || 0;
    if (rank >= category.limit && !isCzech) continue;
    rankByCategory[category.key] = rank + 1;
    const czechRank = czechRankByCategory[category.key] || 0;
    if (isCzech) czechRankByCategory[category.key] = czechRank + 1;
    const knownRule = KNOWN_RULES[category.key];
    const known = (knownRule ? knownRule({ qid, name, facts, rank, category }) : rank < category.known)
        || (isCzech && czechRank < (category.czKnown || 0));
    const typeId = category.types.find(type => entry.types.has(type));
    places.push({
        q: qid,
        t: v.t,
        n: name,
        c: category.key,
        k: known ? 1 : 0,
        la: point.lat,
        lo: point.lon,
        ty: TYPE_OVERRIDES[qid] || typeLabelOf(category, typeId, types[typeId]),
        d: v.d || undefined,
        co: category.key === 'stat' ? [qid] : detail.co,
        ...imageFields(v.im),
        f: facts
    });
}

// Méně známé místo se jménem státu nebo města z jiné kategorie (sopka „Amsterdam“, řeka „Senegal“) by jen mátlo
const placeNames = new Map(places.filter(p => p.c === 'stat' || p.c === 'mesto').map(p => [p.n, p.c]));
const items = places.filter(p => p.k || p.c === 'stat' || p.c === 'mesto' || !placeNames.has(p.n));

// --- 3. krok: památky UNESCO a okruhy ---
console.log('Světové dědictví UNESCO…');
const heritage = new Set(await cached('zemepis-unesco', async () => {
    const found = [];
    await inBatches(items.map(item => item.q), 400, (qids) => `
SELECT DISTINCT ?item WHERE { VALUES ?item { ${values(qids)} } ?item wdt:P1435 wd:${WORLD_HERITAGE_SITE} . }`,
    (row) => found.push(id(row.item.value)));
    return found;
}));

const continentOf = (item) => {
    const country = item.co.map(q => countries[q]).find(c => c && c.continent);
    return country ? country.continent : '';
};
const CONTINENT_COLLECTIONS = [
    ['evropa', 'EU', 'Evropa'], ['asie', 'AS', 'Asie'], ['afrika', 'AF', 'Afrika'],
    ['severni-amerika', 'NA', 'Severní Amerika'], ['jizni-amerika', 'SA', 'Jižní Amerika'], ['oceanie', 'OC', 'Austrálie a Oceánie']
];
// Okruhy: id, název, popis, řazení při procházení (fakt a směr) a pravidlo, co do okruhu patří
const COLLECTIONS = [
    { id: 'cesko', label: 'Česko', text: 'Města, hory, řeky, přírodní místa a památky v Česku', sort: { by: 'name' }, test: item => item.co.includes(CZECHIA) },
    ...CONTINENT_COLLECTIONS.map(([key, code, label]) => ({ id: key, label, text: `Vše, co leží v kontinentu ${label}`, sort: { by: 'name' }, test: item => continentOf(item) === code })),
    { id: 'staty-evropy', label: 'Státy Evropy', sort: { by: 'name' }, test: item => item.c === 'stat' && continentOf(item) === 'EU' },
    { id: 'hlavni-mesta', label: 'Hlavní města států', sort: { by: 'name' }, test: item => item.c === 'mesto' && capitals.has(item.n) },
    { id: 'hlavni-mesta-evropy', label: 'Hlavní města Evropy', sort: { by: 'name' }, test: item => item.c === 'mesto' && capitals.has(item.n) && continentOf(item) === 'EU' },
    { id: 'velkomesta', label: 'Největší města světa', text: 'Města nad 5 milionů obyvatel', sort: { by: 'pop', desc: true }, test: item => item.c === 'mesto' && item.f.pop >= 5e6 },
    { id: 'osmitisicovky', label: 'Osmitisícovky', text: 'Hory vyšší než 8 000 m', sort: { by: 'elev', desc: true }, test: item => item.c === 'hora' && item.ty !== 'pohoří' && item.f.elev >= 8000 },
    { id: 'nejdelsi-reky', label: 'Nejdelší řeky světa', text: 'Řeky delší než 2 000 km', sort: { by: 'len', desc: true }, test: item => item.c === 'reka' && item.f.len >= 2000 },
    { id: 'unesco', label: 'Světové dědictví UNESCO', sort: { by: 'name' }, test: item => heritage.has(item.q) }
];

for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS
    .map(({ test, ...collection }) => ({ ...collection, count: items.filter(item => (item.g || []).includes(collection.id)).length }))
    .filter(collection => collection.count >= 5)
    .map(({ count, ...collection }) => collection);

for (const category of CATEGORIES) {
    const inCategory = items.filter(p => p.c === category.key);
    console.log(`${category.key}: ${inCategory.length} míst (${inCategory.filter(p => p.k).length} známých)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('zemepis', { collections, items });
