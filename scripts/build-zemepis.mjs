// Téma Zeměpis: data/zemepis.json z Wikidat (asi 20 minut; s BUILD_CACHE=složka jde pravidla ladit bez stahování)
// Spuštění: npm run build:zemepis (potřebuje data/countries.json – npm run build:countries)
//
// 1. krok: pro každý typ (P31) seznam položek s nejvíc jazykovými verzemi (míra známosti)
// 2. krok: podrobnosti po dávkách – článek na české Wikipedii, název, souřadnice, státy, fotka, čísla
// 3. krok: zápis v UNESCO a okruhy pro systematické učení
// 4. krok: úrovně obtížnosti (scripts/lib/zemepis-levels.mjs) – u míst v Česku podle návštěvnosti článků na české Wikipedii
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sparql, id, round, values, parsePoint, imageFields, cached, inBatches, readCountries, writeTopic, sleep, CZECHIA, buildingTypeFromName } from './lib/wikidata.mjs';
import { czechPageviews, cachedByKey, assignLevels, levelSummary } from './lib/zemepis-levels.mjs';

const require = createRequire(import.meta.url);
const { getContinent, normalizeAnswer } = require('../quiz-core.js');
const MapQuestion = require('../question-map.js');
const czechOutline = (() => {
    const layers = JSON.parse(readFileSync(new URL('../data/mapa.json', import.meta.url), 'utf8')).regions.cesko.layers;
    return MapQuestion.ringsOf(layers.home);
})();
// Leží bod uvnitř obrysu Česka na mapě hry (1:10m)? Pohraniční městečko těsně za zjednodušenou hranicí by na mapě Česka leželo venku
const insideCzechOutline = (lat, lon) => {
    const [x, y] = MapQuestion.frameOf('cesko').toMap(lat, lon);
    let inside = false;
    for (const ring of czechOutline) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            if ((ring[i][1] > y) !== (ring[j][1] > y) && x < (ring[j][0] - ring[i][0]) * (y - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
        }
    }
    return inside;
};

// Typy jsou seřazené od nejvýstižnějšího – podle prvního nalezeného se místo popíše („hrad“, „mešita“…).
// limit = kolik míst z kategorie vzít, known = kolik nejznámějších z nich patří mezi „známá místa“.
// Česká místa se berou i méně známá (od czMin jazykových verzí) a mezi známá patří navíc czKnown nejznámějších z nich.
const CATEGORIES = [
    { key: 'stat', types: ['Q3624078'], min: 50, limit: 200, known: 110 },
    { key: 'hora', types: ['Q8072', 'Q169358', 'Q8502', 'Q46831'], min: 25, limit: 550, known: 90, czMin: 12, czKnown: 15 },
    { key: 'reka', types: ['Q4022'], min: 25, limit: 450, known: 90, czMin: 12, czKnown: 10 },
    { key: 'jezero', types: ['Q9430', 'Q165', 'Q23397', 'Q131681', 'Q39594', 'Q1322134', 'Q37901', 'Q187223'], min: 25, limit: 480, known: 90, czMin: 12, czKnown: 5 },
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
        min: 60, limit: 820, known: 220, czMin: 25, czKnown: 30
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
// Česko podrobněji: všechna města (status „město“), hrady a zámky, řeky, hory, chráněná území a přehrady s článkem na české
// Wikipedii (od min jazykových verzí). Tyto typy se hledají jen v Česku, ve světě platí CATEGORIES.
const CZECH_EXTRA = [
    { key: 'mesto', types: ['Q15978299'], min: 0 },
    { key: 'stavba', types: ['Q23413', 'Q751876', 'Q17715832', 'Q1404207', 'Q615810'], min: 5 },
    { key: 'reka', types: ['Q4022'], min: 8 },
    { key: 'hora', types: ['Q8502', 'Q46831', 'Q54050', 'Q1197120'], min: 8 },
    // Chráněné krajinné oblasti, národní přírodní rezervace a národní přírodní památky
    { key: 'priroda', types: ['Q20290500', 'Q8545897', 'Q11789735'], min: 0 },
    { key: 'jezero', types: ['Q131681'], min: 5 }
];
for (const extra of CZECH_EXTRA) {
    const category = CATEGORIES.find(c => c.key === extra.key);
    category.czTypes = [...new Set([...(category.czTypes || []), ...extra.types.filter(type => !category.types.includes(type))])];
}
const typesOf = (category) => [...category.types, ...(category.czTypes || [])];
const CZECH_TOWN = 'Q15978299';
// Zrušené chráněné území
const ABOLISHED = 'Q27670147';

// Starověká města a archeologická naleziště (Petra, Pompeje) patří mezi památky, ne mezi dnešní města
const LANDMARK_OVER_CITY = new Set(['Q15661340', 'Q839954']);
const WORLD_HERITAGE_SITE = 'Q9259';

const countries = readCountries();

// --- 1. krok: kandidáti podle typů ---
// Mezipaměť podle nastavení typů: přidaný typ (záliv) se do starého seznamu kandidátů nepromítne
const candidateKey = createHash('md5').update(JSON.stringify(CATEGORIES.map(({ key, types, min, czMin }) => [key, types, min, czMin]))).digest('hex').slice(0, 12);
const candidateList = await cached(`zemepis-candidates-${candidateKey}`, async () => {
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
// Nizozemsko a Dánsko nejsou ve Wikidatech „suverénní stát“ (tím je celé království i se zámořím), přidají se ručně
const EXTRA_STATES = { Q55: 400, Q35: 400 };
for (const [qid, sitelinks] of Object.entries(EXTRA_STATES)) {
    if (!candidates.has(qid)) candidates.set(qid, { sitelinks, types: new Set(['Q3624078']), czech: false });
}
// Velkoměsta, která Wikidata vedou jen jako obec (Fortaleza: „municipality v Brazílii“)
const EXTRA_CITIES = { Q43463: 150 };
for (const [qid, sitelinks] of Object.entries(EXTRA_CITIES)) {
    if (!candidates.has(qid)) candidates.set(qid, { sitelinks, types: new Set(['Q515']), czech: false });
}
// Česko podrobněji (CZECH_EXTRA): jen místa s článkem na české Wikipedii
const czechExtraList = await cached('zemepis-cz-extra-candidates', async () => {
    const found = [];
    for (const extra of CZECH_EXTRA) {
        for (const type of extra.types) {
            const rows = await sparql(`
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:${type} ; wdt:P17 wd:${CZECHIA} ; wikibase:sitelinks ?sitelinks .
  ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .
  FILTER(?sitelinks >= ${extra.min})
}`);
            rows.forEach(row => found.push([id(row.item.value), Number(row.sitelinks.value), type]));
            console.log(`Česko ${extra.key} ${type}: ${rows.length}`);
            await sleep(500);
        }
    }
    return found;
});
for (const [qid, sitelinks, type] of czechExtraList) {
    const entry = candidates.get(qid) || { sitelinks, types: new Set(), czech: true, extra: true };
    entry.types.add(type);
    entry.czech = true;
    candidates.set(qid, entry);
}
// Hlavní města podle QID (štítek hlavního města v češtině někdy chybí – Oslo) i s těmi, která typy měst nenajdou
const STATE_QIDS = [...new Set([...Object.keys(countries), ...Object.keys(EXTRA_STATES)])];
// Hlavní město, jehož položka ve Wikidatech nemá článek (Managua: nová položka sídla, článek má položka obce), a sporné
// „hlavní město“ Palestiny Východní Jeruzalém (čtvrť Jeruzaléma, ne město)
const CAPITAL_FIXES = { Q131546626: 'Q3274' };
const NOT_CAPITALS = new Set(['Q212938']);
const capitalPairs = (await cached('zemepis-capitals', async () => {
    const pairs = [];
    await inBatches(STATE_QIDS, 100, (qids) => `
SELECT ?state ?cap ?sitelinks WHERE {
  VALUES ?state { ${values(qids)} }
  ?state p:P36 ?s . ?s ps:P36 ?cap ; wikibase:rank ?rank . ?cap wikibase:sitelinks ?sitelinks .
  FILTER(?rank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?s pq:P582 ?end }
}`, (row) => pairs.push([id(row.state.value), id(row.cap.value), Number(row.sitelinks.value)]));
    return pairs;
})).map(([state, cap, sitelinks]) => [state, CAPITAL_FIXES[cap] || cap, sitelinks]).filter(([, cap]) => !NOT_CAPITALS.has(cap));
for (const [, cap, sitelinks] of capitalPairs) {
    if (!candidates.has(cap)) candidates.set(cap, { sitelinks, types: new Set(['Q5119']), czech: false });
    else if (!CATEGORIES.some(category => typesOf(category).some(type => candidates.get(cap).types.has(type)))) candidates.get(cap).types.add('Q5119');
}

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
  UNION { ?item wdt:P576 ?date BIND(YEAR(?date) AS ?v) BIND("end" AS ?p) }
}`;

const ordered = [...candidates.entries()].sort((a, b) => b[1].sitelinks - a[1].sitelinks);
console.log(`Podrobnosti k ${ordered.length} kandidátům…`);
const fetchDetails = async (qids) => {
    const result = new Map(qids.map(qid => [qid, { values: {}, types: {}, pops: [], co: [] }]));
    await inBatches(qids, 80, detailsQuery, (row) => {
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
};
const details = new Map(await cached('zemepis-details', () => fetchDetails(ordered.map(([qid]) => qid))));
// Kandidáti přidaní až po uložení podrobností do mezipaměti (Nizozemsko, Dánsko, Česko podrobněji) se dotáhnou zvlášť
const missing = ordered.map(([qid]) => qid).filter(qid => !details.has(qid)).sort();
if (missing.length) {
    const key = createHash('md5').update(missing.join('-')).digest('hex').slice(0, 12);
    for (const [qid, detail] of await cached(`zemepis-details-extra-${key}`, () => fetchDetails(missing))) details.set(qid, detail);
}

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
    const matched = CATEGORIES.filter(category => typesOf(category).some(type => entry.types.has(type)));
    const isAncient = [...entry.types].some(type => LANDMARK_OVER_CITY.has(type));
    if (matched.some(c => c.key === 'mesto') && isAncient && !(facts.pop >= 10000)) return CATEGORIES.find(c => c.key === 'stavba');
    return matched[0];
};

// Popis typu: kratší české názvy a nic, co by prozradilo stát („obec ve Španělsku“)
const ONE = { stat: 'stát', mesto: 'město', hora: 'hora', reka: 'řeka', jezero: 'vodní plocha', ostrov: 'ostrov', priroda: 'přírodní místo', stavba: 'stavba' };
const TYPE_LABELS = {
    Q108178728: 'hlavní město', Q5119: 'hlavní město', Q51929311: 'největší město státu', Q120560: 'bazilika', Q5153359: 'město', Q15284: 'město', Q3957: 'město', Q7930989: 'město',
    // Záliv (gulf) je ve hře zátoka jako dřív (obrysy, otázka na stát)
    Q1322134: 'zátoka', Q15978299: 'město', Q20290500: 'chráněná krajinná oblast', Q8545897: 'národní přírodní rezervace', Q11789735: 'národní přírodní památka', Q17715832: 'zřícenina hradu'
};
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
// Hlavní města podle QID výroku P36 státu (ne podle českého štítku, ten u Osla chybí)
const capitals = new Set(capitalPairs.filter(([state]) => countries[state]).map(([, cap]) => cap));
const knownCapitals = new Set(capitalPairs.filter(([state]) => stateFacts.has(state) && isKnownState(state, stateFacts.get(state))).map(([, cap]) => cap));
const KNOWN_RULES = {
    stat: ({ qid, facts }) => isKnownState(qid, facts),
    mesto: ({ qid, facts, rank, category }) => knownCapitals.has(qid) || facts.pop >= 2e6 || (rank < category.known && facts.pop >= 15e4),
    ostrov: ({ name, facts, rank, category }) => FAMOUS_SMALL_ISLANDS.has(name) || facts.area >= 1e5
        || (rank < category.known * 1.6 && facts.area >= 150) || (!facts.area && rank < category.known / 2)
};

// Název hradu nebo zámku podle článku, když se jmenuje stejně jako město (Loket → Hrad Loket, Český Krumlov → Zámek Český Krumlov)
const CASTLE_WORDS = { hrad: 'Hrad', zámek: 'Zámek', 'zřícenina hradu': 'Hrad', tvrz: 'Tvrz' };
const castleWord = (place) => (/\((hrad|zámek|zřícenina hradu|tvrz)\b/u.exec(place.t) || [])[1] || (CASTLE_WORDS[place.ty] ? place.ty : null);
// Chráněná území: „Chráněná krajinná oblast Pálava“ → „CHKO Pálava“, „Národní přírodní rezervace Rejvíz“ → „Rejvíz“ (druh ukazuje štítek)
const shortProtectedName = (name) => name
    .replace(/^Chráněná krajinná oblast /u, 'CHKO ')
    .replace(/^Národní přírodní (?:rezervace|památka) /u, '');

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
    // Česko podrobněji: jen s popisem a fotkou, ne zaniklé (zrušená chráněná území, zaniklé hrady)
    if (entry.extra && (!v.d || !v.im || v.end || types[ABOLISHED] || /^zaniklý|^zaniklá|^zrušen/u.test(v.d))) continue;
    // Český štítek bývá malým písmenem (socha Svobody), název místa ve hře velkým; štítek „Q1“ (mrakodrap) není název
    const rawName = shortProtectedName(v.n || v.t.replace(/ \(.*\)$/, ''));
    if (/^Q\d+$/.test(rawName)) continue;
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const isCzech = detail.co.includes(CZECHIA) || entry.czech;
    // Města v Česku se statusem „město“ všechna, jinak obce v Česku od 5 000 obyvatel
    const isCzechTown = isCzech && (entry.types.has(CZECH_TOWN) || Object.hasOwn(types, CZECH_TOWN));
    if (category.key === 'mesto' && !(facts.pop >= (isCzech ? CZECH_TOWN_MIN_POP : TOWN_MIN_POP)) && !capitals.has(qid) && !isCzechTown) continue;
    // Pořadí v kategorii (známá místa podle něj) jen u míst z hlavního výběru, ať doplněná česká místa (i malá města)
    // pořadí ostatních nemění
    const added = entry.extra || (isCzechTown && !(facts.pop >= CZECH_TOWN_MIN_POP));
    const rank = rankByCategory[category.key] || 0;
    const overLimit = rank >= category.limit;
    if (overLimit && !isCzech && !capitals.has(qid)) continue;
    if (!added && !overLimit) rankByCategory[category.key] = rank + 1;
    const czechRank = czechRankByCategory[category.key] || 0;
    if (isCzech && !added) czechRankByCategory[category.key] = czechRank + 1;
    const knownRule = KNOWN_RULES[category.key];
    const known = !added && ((knownRule ? knownRule({ qid, name, facts, rank, category }) : rank < category.known)
        || (isCzech && czechRank < (category.czKnown || 0)));
    const typeId = typesOf(category).find(type => entry.types.has(type));
    places.push({
        q: qid,
        t: v.t,
        n: name,
        c: category.key,
        k: known ? 1 : 0,
        la: point.lat,
        lo: point.lon,
        ty: TYPE_OVERRIDES[qid] || (category.key === 'stavba' ? buildingTypeFromName(name, typeLabelOf(category, typeId, types[typeId])) : typeLabelOf(category, typeId, types[typeId])),
        d: v.d || undefined,
        // Jen dnešní státy (u Moskevské konzervatoře ne Sovětský svaz a Ruské impérium)
        co: category.key === 'stat' ? [qid] : detail.co.filter(country => countries[country]),
        ...imageFields(v.im),
        // Rok vzniku státu (Francie 481) by jen mátl
        f: category.key === 'stat' ? Object.fromEntries(Object.entries(facts).filter(([key]) => key !== 'year')) : facts,
        // Jen pro sestavení (do dat se nezapíše): známost a původ
        _: { sitelinks: entry.sitelinks, czech: isCzech, extra: Boolean(entry.extra), town: isCzechTown, types: Object.keys(types) }
    });
}
// Hlavní město státu, kterému chybí český štítek (Norsko → Oslo)
const placeById = new Map(places.map(place => [place.q, place]));
for (const [state, cap] of capitalPairs) {
    const place = placeById.get(state);
    if (place && place.c === 'stat' && !place.f.cap && placeById.has(cap)) place.f.cap = placeById.get(cap).n;
}

const keyOf = (name) => normalizeAnswer(name);
// Hrad nebo zámek se jménem města v Česku dostane do názvu druh stavby (Hrad Loket), ať se s městem neplete
const czechTownNames = new Set(places.filter(p => p.c === 'mesto' && p._.czech).map(p => keyOf(p.n)));
for (const place of places) {
    const word = place.c === 'stavba' && place._.czech && czechTownNames.has(keyOf(place.n)) && castleWord(place);
    if (!word) continue;
    place.n = `${CASTLE_WORDS[word]} ${place.n}`;
    // Štítek podle článku: Wikidata mají u zámků často „hrad“ (Zámek Blatná – hrad by si odporovalo)
    if (word === 'zámek' && place.ty === 'hrad') place.ty = 'zámek';
}
// Malé město v Česku (doplněné pod 5 000 obyvatel) se jménem jiného místa (Svratka, Sázava – řeky) vynecháme, řeka je známější
const otherNames = new Set(places.filter(p => p.c !== 'mesto').map(p => keyOf(p.n)));
const isSmallCzechTown = (p) => p.c === 'mesto' && p._.town && !(p.f.pop >= CZECH_TOWN_MIN_POP);
// Malé město těsně za zjednodušenou hranicí na mapě hry (Boží Dar, Vidnava) by na mapě Česka leželo venku – také ne
const kept = places.filter(p => !(isSmallCzechTown(p) && (otherNames.has(keyOf(p.n)) || !insideCzechOutline(p.la, p.lo))));
// Méně známé místo se jménem státu nebo města z jiné kategorie (sopka „Amsterdam“, řeka „Senegal“) by jen mátlo
const placeNames = new Map(kept.filter(p => p.c === 'stat' || p.c === 'mesto').map(p => [p.n, p.c]));
const named = kept.filter(p => p.k || p.c === 'stat' || p.c === 'mesto' || !placeNames.has(p.n));
// Doplněné české místo (i malé město) se stejným jménem jako jiné místo v datech (NPR Praděd × hora Praděd, město Janov ×
// italský Janov) – hra by je nerozlišila
const isAdded = (p) => p._.extra || isSmallCzechTown(p);
const usedNames = new Set(named.filter(p => !isAdded(p)).map(p => keyOf(p.n)));
const unique = named.filter(p => {
    if (!isAdded(p)) return true;
    if (usedNames.has(keyOf(p.n))) return false;
    usedNames.add(keyOf(p.n));
    return true;
});
// Stejně pojmenovaná místa v Česku ve stejné kategorii: z měst (Hranice na Moravě × Hranice u Aše) zůstane jen větší,
// pokud je to druhé malé; jinak dostanou název článku s upřesněním (Smrk (Jizerské hory), Kamenice (přítok Labe))
const sameName = new Map();
for (const p of unique.filter(p => p._.czech && p.c !== 'stat')) {
    const key = `${p.c}|${keyOf(p.n)}`;
    if (!sameName.has(key)) sameName.set(key, []);
    sameName.get(key).push(p);
}
const dropped = new Set();
for (const group of [...sameName.values()].filter(group => group.length > 1)) {
    group.sort((a, b) => (b.f.pop || 0) - (a.f.pop || 0));
    const rest = group.filter((p, index) => !(index > 0 && p.c === 'mesto' && !(p.f.pop >= CZECH_TOWN_MIN_POP) && (dropped.add(p), true)));
    if (rest.length > 1) for (const p of rest) if (/\(.+\)$/.test(p.t)) p.n = p.t;
}
const items = unique.filter(p => !dropped.has(p));

// --- 3. krok: památky UNESCO a okruhy ---
console.log('Světové dědictví UNESCO…');
const heritageKey = createHash('md5').update(items.map(item => item.q).sort().join('-')).digest('hex').slice(0, 12);
const heritage = new Set(await cached(`zemepis-unesco-${heritageKey}`, async () => {
    const found = [];
    await inBatches(items.map(item => item.q), 400, (qids) => `
SELECT DISTINCT ?item WHERE { VALUES ?item { ${values(qids)} } ?item wdt:P1435 wd:${WORLD_HERITAGE_SITE} . }`,
    (row) => found.push(id(row.item.value)));
    return found;
}));

// Kontinent podle státu, u míst ve státech na pomezí (Rusko, Turecko…) podle polohy – stejně jako ve hře
const continentOf = (item) => getContinent(item, countries);
const CONTINENT_COLLECTIONS = [
    ['evropa', 'EU', 'Evropa'], ['asie', 'AS', 'Asie'], ['afrika', 'AF', 'Afrika'],
    ['severni-amerika', 'NA', 'Severní Amerika'], ['jizni-amerika', 'SA', 'Jižní Amerika'], ['oceanie', 'OC', 'Austrálie a Oceánie']
];
const CASTLE_TYPES = new Set(['hrad', 'zámek', 'zřícenina hradu', 'skalní hrad', 'vodní hrad', 'tvrz', 'lovecký zámeček']);
// Národní přírodní památky (přes sto, skoro všechny pro experty) jsou jen v okruhu Česko
const PROTECTED_TYPES = new Set(['národní park', 'chráněná krajinná oblast', 'národní přírodní rezervace']);
// Okruhy: id, název, popis, řazení při procházení (fakt a směr) a pravidlo, co do okruhu patří
const COLLECTIONS = [
    { id: 'cesko', label: 'Česko', text: 'Města, hory, řeky, přírodní místa a památky v Česku', sort: { by: 'name' }, test: item => item.co.includes(CZECHIA) },
    { id: 'ceska-mesta', label: 'Města v Česku', text: 'Všechna města v Česku od Prahy po nejmenší', sort: { by: 'pop', desc: true }, test: item => item.c === 'mesto' && item.co.includes(CZECHIA) },
    { id: 'hrady-zamky', label: 'Hrady a zámky', text: 'Hrady, zámky a zříceniny v Česku', sort: { by: 'name' }, test: item => item.c === 'stavba' && item.co.includes(CZECHIA) && CASTLE_TYPES.has(item.ty) },
    { id: 'chranena-uzemi', label: 'Chráněná území Česka', text: 'Národní parky, chráněné krajinné oblasti a národní přírodní rezervace', sort: { by: 'name' }, test: item => item.c === 'priroda' && item.co.includes(CZECHIA) && PROTECTED_TYPES.has(item.ty) },
    ...CONTINENT_COLLECTIONS.map(([key, code, label]) => ({ id: key, label, text: `Vše, co leží v kontinentu ${label}`, sort: { by: 'name' }, test: item => continentOf(item) === code })),
    { id: 'staty-evropy', label: 'Státy Evropy', sort: { by: 'name' }, test: item => item.c === 'stat' && continentOf(item) === 'EU' },
    { id: 'hlavni-mesta', label: 'Hlavní města států', sort: { by: 'name' }, test: item => item.c === 'mesto' && capitals.has(item.q) },
    { id: 'hlavni-mesta-evropy', label: 'Hlavní města Evropy', sort: { by: 'name' }, test: item => item.c === 'mesto' && capitals.has(item.q) && continentOf(item) === 'EU' },
    { id: 'velkomesta', label: 'Největší města světa', text: 'Města nad 3 miliony obyvatel', sort: { by: 'pop', desc: true }, test: item => item.c === 'mesto' && item.f.pop >= 3e6 },
    { id: 'osmitisicovky', label: 'Osmitisícovky', text: 'Hory vyšší než 8 000 m', sort: { by: 'elev', desc: true }, test: item => item.c === 'hora' && item.ty !== 'pohoří' && item.f.elev >= 8000 },
    { id: 'nejdelsi-reky', label: 'Nejdelší řeky světa', text: 'Řeky delší než 1 500 km', sort: { by: 'len', desc: true }, test: item => item.c === 'reka' && item.f.len >= 1500 },
    { id: 'unesco', label: 'Světové dědictví UNESCO', sort: { by: 'name' }, test: item => heritage.has(item.q) }
];

for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
// --- 4. krok: úrovně obtížnosti ---
// Známost míst v Česku podle návštěvnosti článků na české Wikipedii (jazykové verze tam nafoukli roboti)
const czechTitles = items.filter(item => item._.czech).map(item => item.t).sort();
console.log(`Návštěvnost ${czechTitles.length} článků o místech v Česku…`);
const pageviews = await cachedByKey('zemepis-cz-pageviews', czechTitles, czechPageviews);
for (const item of items) if (item._.czech) item._.pv = pageviews[item.t] || 0;

// Místa v Česku se porovnávají ve skupinách: města, hory, řeky, vodní plochy, hrady a zámky, ostatní stavby a chráněná území
// podle druhu (chráněnou krajinnou oblast zná skoro každý, národní přírodní památku málokdo)
const czechPool = (item) => item.c === 'stavba' ? (CASTLE_TYPES.has(item.ty) ? 'hrady' : 'stavby')
    : item.c === 'priroda' ? ({ 'chráněná krajinná oblast': 'chko', 'národní přírodní rezervace': 'npr', 'národní přírodní památka': 'npp' }[item.ty] || 'priroda')
        : item.c;
// Podíl známých (horní část skupiny podle návštěvnosti), nejmenší návštěvnost známého místa za rok a podíl pro experty (spodní část)
const CZECH_POOLS = {
    hora: { known: 0.25, minViews: 5000, expert: 0.35 },
    reka: { known: 0.25, minViews: 3000, expert: 0.35 },
    jezero: { known: 0.3, minViews: 5000, expert: 0.3 },
    hrady: { known: 0.3, minViews: 5000, expert: 0.35 },
    stavby: { known: 0.35, minViews: 8000, expert: 0.2 },
    priroda: { known: 0.6, minViews: 5000, expert: 0.2 },
    chko: { known: 0.7, minViews: 2000, expert: 0 },
    npr: { known: 0.08, minViews: 3000, expert: 0.5 },
    // Národní přírodní památky jsou pro experty, kromě těch nejnavštěvovanějších
    npp: { known: 0.04, minViews: 3000, expert: 0.85 }
};
// Česká města: známá krajská a statutární města, města od 15 000 obyvatel a turisticky slavná (návštěvnost mezi 12 % nejvyšších);
// pro experty města pod 3 000 obyvatel, která nejsou ani trochu slavná (ne v horní polovině návštěvnosti) a nejsou okresní
const REGIONAL_TOWNS = ['Q12031379', 'Q257978'];
const DISTRICT_TOWN = 'Q8452914';
const TOWN_MIN_VIEWS = 20000;
// Spodní hranice okruhu povýší i menší města, ale jen ta s návštěvností v horní čtvrtině měst
const TOWN_CEILING_VIEWS = 12000;
const czechKnown = (item, index, list) => {
    if (item.c === 'stat') return false;
    if (item.c === 'mesto') {
        return item._.types.some(type => REGIONAL_TOWNS.includes(type)) || item.f.pop >= 15000
            || (index < list.length * 0.12 && item._.pv >= TOWN_MIN_VIEWS);
    }
    const pool = CZECH_POOLS[czechPool(item)];
    return index < list.length * pool.known && item._.pv >= pool.minViews;
};
const czechExpert = (item, index, list) => {
    if (item.c === 'stat') return false;
    if (item.c === 'mesto') return !(item.f.pop >= 3000) && index >= list.length * 0.5 && !item._.types.includes(DISTRICT_TOWN);
    return index >= list.length * (1 - CZECH_POOLS[czechPool(item)].expert);
};
// Ve světě: pro experty čtvrtina nejméně známých míst kategorie (podle jazykových verzí), ne státy, hlavní města,
// velkoměsta, osmitisícovky, nejdelší řeky a místa na Slovensku
const SLOVAKIA = 'Q214';
const PROTECTED_GROUPS = new Set(['staty-evropy', 'hlavni-mesta', 'hlavni-mesta-evropy', 'velkomesta', 'osmitisicovky', 'nejdelsi-reky']);
const isProtected = (item) => item.c === 'stat' || (item.co || []).includes(SLOVAKIA) || (item.g || []).some(group => PROTECTED_GROUPS.has(group));
// Spodní hranice okruhu nepovýší úplně neznámá místa: ve světě aspoň 60 jazykových verzí, v Česku návštěvnost jako u známých
const WORLD_KNOWN_MIN = 60;
const ceiling = (item) => !item._.czech ? item._.sitelinks >= WORLD_KNOWN_MIN
    : item._.pv >= (item.c === 'mesto' ? TOWN_CEILING_VIEWS : CZECH_POOLS[czechPool(item)].minViews);
const levelGroups = [
    ...COLLECTIONS.map(collection => ({ id: collection.id, members: items.filter(item => (item.g || []).includes(collection.id)) })),
    ...CATEGORIES.map(category => ({ id: `kategorie ${category.key}`, members: items.filter(item => item.c === category.key) }))
];
const promoted = assignLevels(items, { czechPool, czechKnown, czechExpert, worldExpertShare: () => 0.25, isProtected, ceiling, groups: levelGroups });
console.log(`Spodní hranice známých míst povýšila ${promoted.length} míst`);
const czechSamples = items.filter(item => item._.czech && item.c !== 'stat');
for (const item of items) delete item._;

const collections = COLLECTIONS
    .map(({ test, ...collection }) => ({ ...collection, count: items.filter(item => (item.g || []).includes(collection.id)).length }))
    .filter(collection => collection.count >= 5)
    .map(({ count, ...collection }) => collection);

console.log(levelSummary('vše', items));
for (const category of CATEGORIES) console.log(levelSummary(category.key, items.filter(p => p.c === category.key)));
for (const collection of collections) console.log(levelSummary(`okruh ${collection.label}`, items.filter(item => (item.g || []).includes(collection.id))));
console.log(levelSummary('Česko (bez státu)', czechSamples));

writeTopic('zemepis', { collections, items });
