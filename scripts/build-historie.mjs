// Téma Historie: data/historie.json z Wikidat – panovníci, státníci, osobnosti, bitvy a války, říše minulosti
// Spuštění: npm run build:historie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { sparql, id, values, parsePoint, imageFields, yearOf, compact, cached, inBatches, writeTopic, sleep } from './lib/wikidata.mjs';

const HUMAN = 'Q5';
const FEMALE = 'Q6581072';

// Funkce (P39) – podle nich okruhy i popis osoby („český král“); pořadí = přednost při popisu
const POSITIONS = {
    cesky_kral: 'Q45341328', cesky_knize: 'Q27562678', rimsky_cisar: 'Q842606', cisar_srr: 'Q181765',
    anglicky_kral: 'Q18810062', britsky_kral: ['Q9134365', 'Q110324075', 'Q111722535'], francouzsky_kral: 'Q18384454', francouzsky_cisar: 'Q5373953',
    rusky_imperator: 'Q2618625', car: 'Q12370489', rakousky_cisar: 'Q166877', nemecky_cisar: 'Q501503', uhersky_kral: 'Q6412254',
    polsky_kral: 'Q3273712', fransky_kral: 'Q22923081', faraon: 'Q37110', papez: 'Q19546',
    prezident_csr: 'Q15233311', prezident_cr: 'Q1819381', prezident_usa: 'Q11696', britsky_premier: 'Q14211', nemecky_kancler: 'Q56022'
};
const ids = (value) => [].concat(value);
const MONARCH_POSITIONS = ['cesky_kral', 'cesky_knize', 'rimsky_cisar', 'cisar_srr', 'anglicky_kral', 'britsky_kral', 'francouzsky_kral',
    'francouzsky_cisar', 'rusky_imperator', 'car', 'rakousky_cisar', 'nemecky_cisar', 'uhersky_kral', 'polsky_kral', 'fransky_kral', 'faraon'].flatMap(key => ids(POSITIONS[key]));
const STATESMAN_POSITIONS = ['prezident_csr', 'prezident_cr', 'prezident_usa', 'britsky_premier', 'nemecky_kancler'].flatMap(key => ids(POSITIONS[key]));
// Pořadí při popisu osoby; faraon a papež až nakonec (Alexandr Veliký je spíš makedonský král)
const POSITION_ORDER = Object.entries(POSITIONS).filter(([key]) => key !== 'faraon' && key !== 'papez').flatMap(([, value]) => ids(value));
// Funkce bez českého názvu ve Wikidatech
const LABEL_OVERRIDES = { Q110324075: 'britský král', Q111722535: 'britský král' };

// Rody (P53); s větvemi, které mají ve Wikidatech vlastní položku (Habsbursko-Lotrinští, Holstein-Gottorp-Romanov, angličtí Stuartovci)
const DYNASTIES = {
    premyslovci: 'Q287652', lucemburkove: 'Q122293', habsburkove: ['Q65968', 'Q645719', 'Q3624777'], jagellonci: 'Q194355', tudorovci: 'Q101978',
    windsorove: 'Q81589', stuartovci: ['Q179840', 'Q3973466'], plantageneti: 'Q106151', bourboni: ['Q58389', 'Q3642350'], romanovci: ['Q112707', 'Q870568'],
    hohenzollernove: 'Q83969', juliovsko_claudiovska: 'Q192841', karlovci: 'Q133602', valoisove: 'Q182135'
};
const CZECH_DYNASTIES = [DYNASTIES.premyslovci, DYNASTIES.lucemburkove, DYNASTIES.jagellonci];

// Války, k nimž patří bitvy (P361)
const WARS = { prvni_svetova: 'Q361', druha_svetova: 'Q362', husitske: 'Q478301', tricetileta: 'Q2487', napoleonske: 'Q78994', stoleta: 'Q12551' };

// Státy, které patří k českým dějinám (dnešní Česko, Československo, České království, Protektorát…)
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266', 'Q1215545', 'Q207320']);
const CZECH_POSITIONS = [POSITIONS.cesky_kral, POSITIONS.cesky_knize, POSITIONS.prezident_csr, POSITIONS.prezident_cr];

// Kategorie: kolik vzít a kolik nejznámějších je „známých“ (czKnown = navíc nejznámější česká)
const CATEGORIES = {
    panovnik: { limit: 900, known: 150, czKnown: 45 },
    statnik: { limit: 450, known: 110, czKnown: 15 },
    osobnost: { limit: 600, known: 120, czKnown: 30 },
    bitva: { limit: 700, known: 120, czKnown: 20 },
    rise: { limit: 400, known: 80, czKnown: 6 }
};

// --- 1. krok: kandidáti ---
const CANDIDATE_QUERIES = [
    ['osoba', 'monarcha', `?item wdt:P106 wd:Q116 ; wikibase:sitelinks ?sl . FILTER(?sl >= 30)`],
    ['osoba', 'funkce', `VALUES ?pos { ${values([...MONARCH_POSITIONS, ...STATESMAN_POSITIONS, POSITIONS.papez])} } ?item wdt:P39 ?pos ; wikibase:sitelinks ?sl . FILTER(?sl >= 15)`],
    ['osoba', 'rod', `VALUES ?fam { ${values(Object.values(DYNASTIES).flat())} } ?item wdt:P53 ?fam ; wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sl . FILTER(?sl >= 15)`],
    ['osoba', 'český rod', `VALUES ?fam { ${values(CZECH_DYNASTIES)} } ?item wdt:P53 ?fam ; wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sl . FILTER(?sl >= 6)`],
    ['statnik', 'hlava státu', `?pos wdt:P279* wd:Q48352 . ?item wdt:P39 ?pos ; wikibase:sitelinks ?sl . FILTER(?sl >= 100)`],
    ['statnik', 'hlava vlády', `?pos wdt:P279* wd:Q2285706 . ?item wdt:P39 ?pos ; wikibase:sitelinks ?sl . FILTER(?sl >= 100)`],
    ['osoba', 'objevitel', `?item wdt:P106 wd:Q11900058 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['osoba', 'vojevůdce', `?item wdt:P106 wd:Q1402561 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['osoba', 'důstojník', `?item wdt:P106 wd:Q189290 ; wikibase:sitelinks ?sl . FILTER(?sl >= 90)`],
    ['osoba', 'revolucionář', `?item wdt:P106 wd:Q3242115 ; wikibase:sitelinks ?sl . FILTER(?sl >= 50)`],
    ['osoba', 'teolog', `?item wdt:P106 wd:Q1234713 ; wikibase:sitelinks ?sl . FILTER(?sl >= 60)`],
    ['osoba', 'conquistador', `?item wdt:P106 wd:Q126236 ; wikibase:sitelinks ?sl . FILTER(?sl >= 30)`],
    ['udalost', 'bitva', `?item wdt:P31 wd:Q178561 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    ['udalost', 'česká bitva', `?item wdt:P31 wd:Q178561 ; wdt:P17 wd:Q213 ; wikibase:sitelinks ?sl . FILTER(?sl >= 5)`],
    ['udalost', 'obléhání', `?item wdt:P31 wd:Q188055 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    ['udalost', 'válka', `?item wdt:P31 wd:Q198 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    ['udalost', 'revoluce', `?item wdt:P31 wd:Q10931 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    ['stat', 'historický stát', `?item wdt:P31 wd:Q3024240 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['stat', 'říše', `?item wdt:P31 wd:Q48349 ; wdt:P576 [] ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['stat', 'český stát', `VALUES ?item { ${values([...CZECH_STATES].filter(q => q !== 'Q213'))} } ?item wikibase:sitelinks ?sl .`]
];

const candidateList = await cached('historie-candidates', async () => {
    const candidates = new Map();
    for (const [kind, name, where] of CANDIDATE_QUERIES) {
        const rows = await sparql(`SELECT DISTINCT ?item ?sl WHERE { ${where} } LIMIT 4000`);
        for (const row of rows) {
            const qid = id(row.item.value);
            const entry = candidates.get(qid) || { sitelinks: Number(row.sl.value), kinds: [] };
            if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
            candidates.set(qid, entry);
        }
        console.log(`${name}: ${rows.length}`);
        await sleep(500);
    }
    return [...candidates];
});
const candidates = new Map(candidateList);

// --- 2. krok: podrobnosti po dávkách ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1, born: 1, died: 1, from: 1, to: 1, start: 1, end: 1, date: 1, coord: 1, sex: 1 };
const detailsQuery = (qids) => `
SELECT ?item ?p ?v ?start ?end WHERE {
  VALUES ?item { ${values(qids)} }
  { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("from" AS ?p) }
  UNION { ?item wdt:P576 ?v BIND("to" AS ?p) }
  UNION { ?item wdt:P580 ?v BIND("start" AS ?p) }
  UNION { ?item wdt:P582 ?v BIND("end" AS ?p) }
  UNION { ?item wdt:P585 ?v BIND("date" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P53 ?v BIND("fam" AS ?p) }
  UNION { ?item wdt:P361 ?v BIND("part" AS ?p) }
  UNION { ?item wdt:P276 ?v BIND("loc" AS ?p) }
  UNION { ?item wdt:P36 ?v BIND("cap" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P106 ?v BIND("occ" AS ?p) }
  UNION { ?item p:P39 ?s . ?s ps:P39 ?v . OPTIONAL { ?s pq:P580 ?start } OPTIONAL { ?s pq:P582 ?end } BIND("pos" AS ?p) }
}`;

const ordered = [...candidates.entries()].sort((a, b) => b[1].sitelinks - a[1].sitelinks);
console.log(`Podrobnosti k ${ordered.length} kandidátům…`);
const details = new Map(await cached('historie-details', async () => {
    const result = new Map(ordered.map(([qid]) => [qid, { pos: [] }]));
    await inBatches(ordered.map(([qid]) => qid), 60, detailsQuery, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        if (!row.v) return;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (key === 'pos') entry.pos.push({ id: v, start: row.start ? row.start.value : '', end: row.end ? row.end.value : '' });
        else if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    });
    return [...result];
}));

// České názvy odkazovaných položek (rody, války, místa, hlavní města, funkce, typy, země)
const referenced = new Set();
for (const detail of details.values()) {
    for (const key of ['fam', 'part', 'loc', 'cap', 'cit', 'type', 'occ', 'co']) (detail[key] || []).forEach(q => referenced.add(q));
    detail.pos.forEach(position => referenced.add(position.id));
}
// Neznámé hodnoty (prázdné uzly) nejsou položky
for (const q of referenced) if (!/^Q\d+$/.test(q)) referenced.delete(q);
console.log(`Názvy ${referenced.size} odkazovaných položek…`);
const labels = new Map(await cached('historie-labels', async () => {
    const result = [];
    await inBatches([...referenced], 400, (qids) => `
SELECT ?item ?label WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?label FILTER(LANG(?label) = "cs") }`,
    (row) => result.push([id(row.item.value), row.label.value]));
    return result;
}));
const label = (qid) => LABEL_OVERRIDES[qid] || labels.get(qid);

// Bitvy patří k válce i nepřímo (bitva u Stalingradu → východní fronta → druhá světová válka)
const warMembers = new Map(await cached('historie-wars', async () => {
    const result = [];
    for (const war of Object.values(WARS)) {
        const rows = await sparql(`SELECT DISTINCT ?item WHERE { ?item wdt:P361+ wd:${war} }`);
        result.push([war, rows.map(row => id(row.item.value))]);
        await sleep(500);
    }
    return result;
}).then(entries => entries.map(([war, members]) => [war, new Set(members)])));

// --- 3. krok: položky ---
const word = (text) => new RegExp(`(?<!\\p{L})${text}(?!\\p{L})`, 'u');
const FEMININE = [['král', 'královna'], ['císař', 'císařovna'], ['kníže', 'kněžna'], ['car', 'carevna'], ['prezident', 'prezidentka'],
    ['premiér', 'premiérka'], ['kancléř', 'kancléřka'], ['vévoda', 'vévodkyně'], ['panovník', 'panovnice'], ['imperátor', 'imperátorka'], ['faraon', 'faraonka']];
// „anglický král“ → „anglická královna“: změní se i přídavná jména před funkcí
const feminine = (text) => {
    const changed = FEMININE.reduce((result, [male, female]) => result.replace(word(male), female), text);
    return changed === text ? text : changed.replace(/(\p{L}+)ý(?!\p{L})/gu, '$1á');
};
// Funkce podle důležitosti: nejdřív panovnické, pak státnické; dvorské a čestné funkce se nepočítají
const MONARCH_ROLES = ['král', 'královna', 'císař', 'císařovna', 'car', 'imperátor', 'sultán', 'chán', 'šáh', 'kníže', 'faraon', 'vévoda', 'panovník'].map(word);
const STATESMAN_ROLES = [/^prezident \p{L}/u, /^premiér/u, /kancléř/u, /předseda vlády/u, /ministerský předseda/u, /diktátor/u, /konzul/u];
const STATESMAN_FALLBACK = /prezident|premiér|kancléř|předseda|vůdce|tajemník|chalífa|emír/u;
const NOT_A_ROLE = /choť|manžel|spolukníže|následník|Oxford|Akademie|Svazu|kurfiřt|kníže z Walesu/u;

// Spisovatelé a vědci s čestnou funkcí, které Wikidata vedou i jako „státníky“ (Goethe, Gorkij, Laplace), jsou osobnosti;
// herci, kteří byli starosty (Clint Eastwood), do dějepisu nepatří
const CATEGORY_OVERRIDES = {
    Q5879: 'osobnost', Q12706: 'osobnost', Q44481: 'osobnost', Q140694: 'osobnost', Q189564: 'osobnost', Q167997: 'osobnost',
    Q315366: 'osobnost', Q344661: 'osobnost', Q43203: null, Q104027: null
};
// Kategorie osoby: panovník (povolání nebo funkce), státník (prezidenti, premiéři, hlavy států a vlád), jinak osobnost
const positionLabels = (detail) => detail.pos.map(position => label(position.id) || '').filter(text => text && !NOT_A_ROLE.test(text));
const occupationLabels = (detail) => (detail.occ || []).map(label).filter(Boolean);
const isPopeDetail = (detail) => detail.pos.some(position => ids(POSITIONS.papez).includes(position.id));
const personCategory = (detail, entry) => {
    const positionIds = detail.pos.map(position => position.id);
    const titles = positionLabels(detail);
    if (isPopeDetail(detail)) return 'osobnost';
    if ((detail.occ || []).includes('Q116') || positionIds.some(q => MONARCH_POSITIONS.includes(q))
        || titles.some(text => MONARCH_ROLES.some(role => role.test(text)))) return 'panovnik';
    if (positionIds.some(q => STATESMAN_POSITIONS.includes(q)) || titles.some(text => STATESMAN_ROLES.some(role => role.test(text)))
        || occupationLabels(detail).some(text => /^(státník|vládce|diktátor)$/u.test(text))
        // Hlava státu nebo vlády, jejíž funkce nemá český název (Lenin, Kim Čong-un)
        || (entry.kinds.includes('statnik') && occupationLabels(detail).includes('politik') && titles.some(text => STATESMAN_FALLBACK.test(text)))) return 'statnik';
    return 'osobnost';
};
// Osobnosti: herci a filmaři sem nepatří; od roku 1800 jen lidé s „dějinným“ povoláním (spisovatelé patří do jiného tématu)
const ENTERTAINMENT = /herec|herečka|scenárist|režisér|zpěvák|zpěvačka|komik|producent|skladatel|moderátor|model/u;
const ROYAL = /^(král|královna|císař|císařovna|kníže|kněžna|princ|princezna|vévoda|vévodkyně|markrabě|hrabě|hraběnka)$/u;
const HISTORICAL = /objevitel|cestovatel|mořeplavec|námořník|vojevůdce|generál|revolucionář|reformátor|kazatel|politik|státník|aktivist|kosmonaut|astronaut|vynálezce|vládce|diplomat|misionář|prorok|světec|bojovník|teolog|filozof/u;
// Filozofové a teologové posledních dvou století patří spíš do jiných témat
const MODERN_HISTORICAL = new RegExp(HISTORICAL.source.replace('|teolog|filozof', ''), 'u');
const isHistoricalPerson = (detail, born) => {
    const occupations = occupationLabels(detail);
    if (occupations.some(text => ENTERTAINMENT.test(text))) return false;
    return born === undefined || born < 1800 || occupations.some(text => MODERN_HISTORICAL.test(text));
};
const eventCategory = () => 'bitva';

// Hlavní funkce osoby: první ze známých funkcí, jinak podle názvu (král před vévodou, prezident před premiérem)
const mainPosition = (detail, category) => {
    const found = (qid) => ({ id: qid, statements: detail.pos.filter(position => position.id === qid) });
    const known = POSITION_ORDER.find(qid => detail.pos.some(position => position.id === qid));
    if (known) return found(known);
    // Egyptští faraoni z číslovaných dynastií a Ptolemaiovci jsou faraoni („sakkárský král“ by mátl), Alexandr Veliký
    // a perští králové ne
    const isEgyptian = (detail.fam || []).map(label).some(text => /^\d+\. dynastie$|Ptolemaiovci/u.test(text || ''));
    const pharaoh = ids(POSITIONS.faraon).find(qid => detail.pos.some(position => position.id === qid));
    if (pharaoh && isEgyptian) return found(pharaoh);
    const roles = category === 'statnik' ? [...STATESMAN_ROLES, ...MONARCH_ROLES] : [...MONARCH_ROLES, ...STATESMAN_ROLES];
    for (const role of [...roles, word('papež')]) {
        const match = detail.pos.find(position => !NOT_A_ROLE.test(label(position.id) || '') && role.test(label(position.id) || ''));
        if (match) return found(match.id);
    }
    return null;
};

const typeLabelOf = (category, detail, main) => {
    let text = main && label(main.id);
    if (!text || text.length > 40) {
        const occupations = occupationLabels(detail).filter(name => name.length <= 30);
        // Šlechtický titul má přednost (Eliška Přemyslovna má ve Wikidatech „filozof“ i „královna“)
        // Filozof a teolog až za ostatními dějinnými povoláními (vojevůdce, reformátor), jsou u lidí často jen navíc
        const occupation = occupations.find(name => ROYAL.test(name))
            || occupations.find(name => HISTORICAL.test(name) && !/filozof|teolog/u.test(name))
            || occupations.find(name => HISTORICAL.test(name)) || occupations[0];
        text = category === 'osobnost' && occupation ? occupation : { panovnik: 'panovník', statnik: 'státník', osobnost: 'osobnost' }[category];
    }
    return detail.sex === FEMALE ? feminine(text) : text;
};

const STATE_TYPES = /říše|království|císařství|chalífát|chanát|sultanát|republika|kolonie|knížectví|vévodství|impérium|federace|konfederace|unie|městský stát|loutkový stát/u;
const EVENT_TYPES = /bitva|válka|obléhání|revoluce|povstání|tažení|operace|vylodění|bombardování|útok/u;

// Občanství „habsburská monarchie“ má Komenský i Rakušané – české osobnosti z té doby jmenovitě
const CZECH_PEOPLE = new Set(['Q12735']);
const isCzechItem = (detail, main, qid) => CZECH_STATES.has(qid) || CZECH_PEOPLE.has(qid)
    || [...(detail.cit || []), ...(detail.co || [])].some(q => CZECH_STATES.has(q))
    || (detail.fam || []).some(q => CZECH_DYNASTIES.includes(q))
    || detail.pos.some(position => CZECH_POSITIONS.includes(position.id))
    || Boolean(main && CZECH_POSITIONS.includes(main.id));

// Kontrola dat narození a úmrtí: Wikidata u starověku často uvádějí jen století („500“ = 5. století). Zaokrouhlený rok,
// který odporuje druhému (úmrtí před narozením, věk přes 105 let, obojí stejné), se vynechá.
const THIS_YEAR = new Date().getFullYear();
const isRound = (year) => year % 50 === 0;
const lifeYears = (rawBorn, rawDied) => {
    let born = rawBorn !== undefined && rawBorn <= THIS_YEAR ? rawBorn : undefined;
    let died = rawDied !== undefined && rawDied <= THIS_YEAR ? rawDied : undefined;
    if (born !== undefined && died !== undefined && (died <= born || died - born > 105)) {
        if (isRound(died) && !isRound(born)) died = undefined;
        else born = undefined;
    }
    return { born, died };
};

// Ze stejně pojmenovaných položek zůstane ta, která má k českým dějinám nejblíž (Anna Jagellonská, česká královna),
// jinak ta známější
const nameKeyOf = (detail) => (detail.n || detail.t.replace(/ \(.*\)$/, '')).toLocaleLowerCase('cs');
const czechScore = (detail, qid) => (isCzechItem(detail, null, qid) ? 2 : 0) + (/česk/u.test(detail.d || '') ? 1 : 0);
const preferredByName = new Map();
for (const [qid] of ordered) {
    const detail = details.get(qid);
    if (!detail || !detail.t) continue;
    const key = nameKeyOf(detail);
    const current = preferredByName.get(key);
    if (!current || czechScore(detail, qid) > czechScore(details.get(current), current)) preferredByName.set(key, qid);
}

const items = [];
const rankByCategory = {};
const czechRankByCategory = {};
for (const [qid, entry] of ordered) {
    const detail = details.get(qid);
    if (!detail || !detail.t) continue;
    const isPerson = (entry.kinds.includes('osoba') || entry.kinds.includes('statnik')) && (detail.type || []).includes(HUMAN);
    const kind = isPerson ? 'osoba' : entry.kinds.includes('udalost') ? 'udalost' : entry.kinds.includes('stat') ? 'stat' : null;
    if (!kind) continue;
    const category = qid in CATEGORY_OVERRIDES ? CATEGORY_OVERRIDES[qid]
        : kind === 'osoba' ? personCategory(detail, entry) : kind === 'udalost' ? eventCategory() : 'rise';
    if (!category) continue;
    const main = kind === 'osoba' ? mainPosition(detail, category) : null;
    const { born, died } = lifeYears(yearOf(detail.born), yearOf(detail.died));
    if (category === 'osobnost' && !isHistoricalPerson(detail, born)) continue;
    // Panovnické rody a svazové republiky SSSR nejsou státy, které by stálo za to hádat
    const typeLabels = (detail.type || []).map(label).filter(Boolean);
    if (kind === 'stat' && (typeLabels.some(text => /rod|dynastie/u.test(text)) || /sovětská socialistická republika/iu.test(detail.n || ''))) continue;
    let facts;
    let year;
    if (kind === 'osoba') {
        // Doba vlády nebo úřadu: od prvního začátku do posledního konce hlavní funkce
        const starts = (main ? main.statements : []).map(s => yearOf(s.start)).filter(y => y !== undefined);
        const ends = (main ? main.statements : []).map(s => yearOf(s.end)).filter(y => y !== undefined);
        let from = starts.length ? Math.min(...starts) : undefined;
        let to = ends.length ? Math.max(...ends) : undefined;
        // Vláda mimo život (nástup po smrti, konec po smrti) je chyba v datech: konec nejpozději smrtí, nástup jinak pryč
        if (from !== undefined && ((died !== undefined && from > died) || (born !== undefined && from < born))) from = undefined;
        if (to !== undefined && died !== undefined && to > died) to = died;
        if (to !== undefined && (from === undefined || to < from)) to = from === undefined ? undefined : to;
        if (born === undefined && from === undefined) continue;
        // Bez začátku vlády zhruba vrchol života – ve 35 letech, u krátkého života dřív (Gagarin, Princip)
        year = from ?? (born !== undefined ? Math.min(born + 35, died !== undefined ? Math.round(born + (died - born) * 0.75) : born + 35) : undefined);
        facts = {
            born, died, from, to,
            dyn: (detail.fam || []).map(label).filter(Boolean)[0],
            land: (detail.cit || []).map(label).filter(Boolean)[0],
            y: year
        };
    } else if (kind === 'udalost') {
        // Roky v názvu článku (Rusko-turecká válka (1768–1774)) platí přednostně; datum (P585) bývá jen zaokrouhlené
        // na století (Války růží „1500“), proto až po začátku (P580)
        const titled = /\((\d{3,4})(?:[–-](\d{3,4}))?\)$/.exec(detail.t || '');
        let start = titled ? Number(titled[1]) : yearOf(detail.start) ?? yearOf(detail.date);
        let end = titled ? (titled[2] ? Number(titled[2]) : undefined) : yearOf(detail.end);
        // Konec před začátkem: jeden z údajů je chybný, platí ten dřívější (Irácká invaze do Kuvajtu 1990, ne 2009)
        if (end !== undefined && start !== undefined && end < start) [start, end] = [end, undefined];
        // Pravěk (neolitická revoluce) do bitev a válek nepatří, budoucnost (válka „do roku 2100“) taky ne
        if (start === undefined || start < -3000 || start > THIS_YEAR) continue;
        if (end !== undefined && end > THIS_YEAR) end = undefined;
        year = start;
        facts = {
            year: start,
            end: end !== undefined && end !== start ? end : undefined,
            war: (detail.part || []).map(label).filter(Boolean)[0],
            place: (detail.loc || []).map(label).filter(Boolean)[0],
            y: year
        };
    } else {
        const from = yearOf(detail.from) ?? yearOf(detail.start);
        const to = yearOf(detail.to) ?? yearOf(detail.end);
        if (from === undefined || to === undefined) continue;
        year = from;
        facts = { from, to, cap: (detail.cap || []).map(label).filter(Boolean)[0], y: year };
    }
    const settings = CATEGORIES[category];
    const isCzech = isCzechItem(detail, main, qid);
    // Papežové mají díky robotům články ve spoustě jazyků – známost a limit počítáme zvlášť
    const isPope = isPopeDetail(detail);
    const rankKey = isPope ? 'papez' : category;
    const rank = rankByCategory[rankKey] || 0;
    const limits = isPope ? { limit: 300, known: 12 } : settings;
    if (rank >= limits.limit && !isCzech) continue;
    // Stejné jméno má i jiná položka (dvě Anny Jagellonské, dvě Řecko-turecké války) – zůstane jen jedna, jinak by byla sporná
    if (preferredByName.get(nameKeyOf(detail)) !== qid) continue;
    rankByCategory[rankKey] = rank + 1;
    const czechRank = czechRankByCategory[category] || 0;
    if (isCzech) czechRankByCategory[category] = czechRank + 1;
    const point = parsePoint(detail.coord);
    const name = detail.n || detail.t.replace(/ \(.*\)$/, '');
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: category,
        k: rank < limits.known || (isCzech && czechRank < settings.czKnown) ? 1 : 0,
        ty: isPope ? 'papež' : kind === 'osoba' ? typeLabelOf(category, detail, main) : typeLabels.find(text => (kind === 'stat' ? STATE_TYPES : EVENT_TYPES).test(text)),
        d: detail.d,
        cz: isCzech ? 1 : undefined,
        // Pohlaví osoby – u nesprávných možností k panovnici panovnice
        sx: kind === 'osoba' && detail.sex === FEMALE ? 'f' : undefined,
        la: kind === 'udalost' && point ? point.lat : undefined,
        lo: kind === 'udalost' && point ? point.lon : undefined,
        co: kind === 'udalost' ? (detail.co || []) : undefined,
        ...imageFields(detail.im),
        f: compact(facts),
        // Pro okruhy: funkce a rody osoby, války bitvy
        pos: kind === 'osoba' ? [...new Set(detail.pos.map(position => position.id))].filter(q => Object.values(POSITIONS).flat().includes(q)) : undefined,
        fam: kind === 'osoba' ? (detail.fam || []).filter(q => Object.values(DYNASTIES).flat().includes(q)) : undefined,
        part: kind === 'udalost' ? Object.values(WARS).filter(war => warMembers.get(war).has(qid)) : undefined
    }));
}

// Názvy s velkým písmenem („Bitva u Lipan“); „Václav II. Český“ → „Václav II.“, pokud se tak nejmenuje nikdo jiný
const TERRITORIAL = /^(.+ [IVXLC]+\.) \p{Lu}\p{Ll}+[sc]k[ýá]$/u;
const shortName = (name) => (TERRITORIAL.exec(name) || [])[1];
const nameCount = new Map();
for (const item of items) for (const name of new Set([item.n, shortName(item.n)].filter(Boolean))) nameCount.set(name, (nameCount.get(name) || 0) + 1);
for (const item of items) {
    const short = shortName(item.n);
    if (short && nameCount.get(short) === 1) item.n = short;
    item.n = item.n.charAt(0).toUpperCase() + item.n.slice(1);
}

// --- 4. krok: okruhy pro systematické učení ---
const hasPosition = (...keys) => (item) => keys.some(key => ids(POSITIONS[key]).some(q => (item.pos || []).includes(q)));
// Rod: jeho panovníci a známí členové (ne všechny princezny a vévodové)
const hasDynasty = (key) => (item) => (item.c === 'panovnik' || item.k === 1) && ids(DYNASTIES[key]).some(q => (item.fam || []).includes(q));
const inWar = (key) => (item) => (item.part || []).includes(WARS[key]) || item.q === WARS[key];
const BY_YEAR = { by: 'y' };
const COLLECTIONS = [
    { id: 'ceske-dejiny', label: 'České dějiny', text: 'Panovníci, prezidenti, osobnosti a bitvy českých zemí', sort: BY_YEAR, test: item => item.cz },
    { id: 'cesti-panovnici', label: 'Čeští panovníci', text: 'Knížata a králové', sort: BY_YEAR, test: hasPosition('cesky_knize', 'cesky_kral') },
    { id: 'premyslovci', label: 'Přemyslovci', sort: BY_YEAR, test: hasDynasty('premyslovci') },
    { id: 'lucemburkove', label: 'Lucemburkové', sort: BY_YEAR, test: hasDynasty('lucemburkove') },
    { id: 'jagellonci', label: 'Jagellonci', sort: BY_YEAR, test: hasDynasty('jagellonci') },
    { id: 'habsburkove', label: 'Habsburkové', sort: BY_YEAR, test: hasDynasty('habsburkove') },
    { id: 'prezidenti-cr', label: 'Prezidenti Československa a Česka', sort: BY_YEAR, test: hasPosition('prezident_csr', 'prezident_cr') },
    { id: 'anglicti-panovnici', label: 'Angličtí a britští panovníci', sort: BY_YEAR, test: hasPosition('anglicky_kral', 'britsky_kral') },
    { id: 'plantageneti', label: 'Plantageneti', sort: BY_YEAR, test: hasDynasty('plantageneti') },
    { id: 'tudorovci', label: 'Tudorovci', sort: BY_YEAR, test: hasDynasty('tudorovci') },
    { id: 'stuartovci', label: 'Stuartovci', sort: BY_YEAR, test: hasDynasty('stuartovci') },
    { id: 'windsorove', label: 'Windsorové', sort: BY_YEAR, test: hasDynasty('windsorove') },
    { id: 'britsti-premieri', label: 'Britští premiéři', sort: BY_YEAR, test: hasPosition('britsky_premier') },
    { id: 'francouzsti-panovnici', label: 'Francouzští králové a císaři', sort: BY_YEAR, test: hasPosition('francouzsky_kral', 'francouzsky_cisar', 'fransky_kral') },
    { id: 'karlovci', label: 'Karlovci', sort: BY_YEAR, test: hasDynasty('karlovci') },
    { id: 'valoisove', label: 'Valoisové', sort: BY_YEAR, test: hasDynasty('valoisove') },
    { id: 'bourboni', label: 'Bourboni', sort: BY_YEAR, test: hasDynasty('bourboni') },
    { id: 'rimsti-cisari', label: 'Římští císaři', sort: BY_YEAR, test: hasPosition('rimsky_cisar') },
    { id: 'juliovsko-claudiovska', label: 'Juliovsko-claudiovská dynastie', sort: BY_YEAR, test: hasDynasty('juliovsko_claudiovska') },
    { id: 'cisari-srr', label: 'Císaři Svaté říše římské', sort: BY_YEAR, test: hasPosition('cisar_srr') },
    { id: 'rusti-panovnici', label: 'Ruští carové a imperátoři', sort: BY_YEAR, test: hasPosition('car', 'rusky_imperator') },
    { id: 'romanovci', label: 'Romanovci', sort: BY_YEAR, test: hasDynasty('romanovci') },
    { id: 'hohenzollernove', label: 'Hohenzollernové', sort: BY_YEAR, test: hasDynasty('hohenzollernove') },
    { id: 'nemecti-kancleri', label: 'Němečtí kancléři', sort: BY_YEAR, test: hasPosition('nemecky_kancler') },
    { id: 'prezidenti-usa', label: 'Prezidenti USA', sort: BY_YEAR, test: hasPosition('prezident_usa') },
    { id: 'faraoni', label: 'Egyptští faraoni', sort: BY_YEAR, test: hasPosition('faraon') },
    { id: 'papezove', label: 'Papežové', sort: BY_YEAR, test: hasPosition('papez') },
    { id: 'husitske-valky', label: 'Husitské války', sort: BY_YEAR, test: inWar('husitske') },
    { id: 'stoleta-valka', label: 'Stoletá válka', sort: BY_YEAR, test: inWar('stoleta') },
    { id: 'tricetileta-valka', label: 'Třicetiletá válka', sort: BY_YEAR, test: inWar('tricetileta') },
    { id: 'napoleonske-valky', label: 'Napoleonské války', sort: BY_YEAR, test: inWar('napoleonske') },
    { id: 'prvni-svetova', label: 'První světová válka', sort: BY_YEAR, test: inWar('prvni_svetova') },
    { id: 'druha-svetova', label: 'Druhá světová válka', sort: BY_YEAR, test: inWar('druha_svetova') },
    { id: 'starovek', label: 'Starověk', text: 'Do pádu Západořímské říše (476)', sort: BY_YEAR, test: item => item.f.y < 476 },
    { id: 'stredovek', label: 'Středověk', text: '476–1492', sort: BY_YEAR, test: item => item.f.y >= 476 && item.f.y < 1492 },
    { id: 'novovek', label: 'Novověk', text: '1492–1914', sort: BY_YEAR, test: item => item.f.y >= 1492 && item.f.y < 1914 },
    { id: 'moderni-dejiny', label: '20. a 21. století', text: 'Od první světové války', sort: BY_YEAR, test: item => item.f.y >= 1914 }
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS
    .map(({ test, ...collection }) => collection)
    .filter(collection => items.filter(item => (item.g || []).includes(collection.id)).length >= 5);
// Pomocné údaje pro okruhy už v datech nejsou potřeba
for (const item of items) { delete item.pos; delete item.fam; delete item.part; }

for (const category of Object.keys(CATEGORIES)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('historie', { collections, items });
