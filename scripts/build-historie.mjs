// Téma Historie: data/historie.json z Wikidat – panovníci, státníci, osobnosti, bitvy a války, říše minulosti
// Spuštění: npm run build:historie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování; DEBUG_GROUP=okruh vypíše jeho položky
// podle známosti). Úrovně: k: 1 = Základní (zhruba čtvrtina každé kategorie a okruhu), x: 1 = Mudrlant Expert (perličky), jinak Mudrlant
import { sparql, id, values, parsePoint, imageFields, yearOf, compact, cached, inBatches, writeTopic, sleep } from './lib/wikidata.mjs';
import { landByDescription } from './lib/nationality.mjs';
import { createHash } from 'node:crypto';

const HUMAN = 'Q5';
const FEMALE = 'Q6581072';

// Funkce (P39) – podle nich okruhy i popis osoby („český král“); pořadí = přednost při popisu
const POSITIONS = {
    cesky_kral: 'Q45341328', cesky_knize: 'Q27562678', rimsky_cisar: 'Q842606', cisar_srr: 'Q181765',
    anglicky_kral: 'Q18810062', britsky_kral: ['Q9134365', 'Q110324075', 'Q111722535'], francouzsky_kral: 'Q18384454', francouzsky_cisar: 'Q5373953',
    rusky_imperator: 'Q2618625', car: 'Q12370489', rakousky_cisar: 'Q166877', nemecky_cisar: 'Q501503', uhersky_kral: 'Q6412254',
    polsky_kral: 'Q3273712', fransky_kral: 'Q22923081', faraon: 'Q37110', papez: 'Q19546',
    prezident_csr: 'Q15233311', prezident_cr: 'Q1819381', prezident_usa: 'Q11696', britsky_premier: 'Q14211',
    // Kancléř Německa: obecně, spolkový (od 1949), císařský (1871–1918) a říšský (1919–1945)
    nemecky_kancler: ['Q56022', 'Q4970706', 'Q7618907', 'Q7050658']
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

// Kategorie: kolik nejznámějších vzít (české položky se vejdou vždy); známost a expertní úroveň určuje krok 5
const CATEGORIES = {
    panovnik: { limit: 1150 },
    statnik: { limit: 520 },
    osobnost: { limit: 1150 },
    bitva: { limit: 1150 },
    rise: { limit: 460 },
    // Události: limit určuje krok 3b (EVENT_LIMIT)
    udalosti: { limit: 460 }
};

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
// Roky válek: osoba patří k válce, jen když v ní mohla bojovat (ne Turgut Reis z 16. století u napoleonských válek)
const WAR_YEARS = { prvni_svetova: [1914, 1918], druha_svetova: [1939, 1945], husitske: [1419, 1436], tricetileta: [1618, 1648], napoleonske: [1799, 1815], stoleta: [1337, 1453] };
// Osoby k válkám podle P607 (účastník konfliktu) jen u válek do roku 1900; u první světové vybraní ručně (P607 tam mají statisíce vojáků)
const PERSON_WARS = ['husitske', 'tricetileta', 'napoleonske', 'stoleta'];
// Osobnosti válek, které Wikidata k válce nepřiřazují (nebo jen přes jednotlivé bitvy)
const WAR_PEOPLE = {
    prvni_svetova: ['Q192615', 'Q4701', 'Q319962', 'Q2667', 'Q58579', 'Q312564', 'Q207958', 'Q272383', 'Q80492', 'Q82180', 'Q170596', 'Q155022', 'Q78521',
        'Q207738', 'Q5721', 'Q171730', 'Q34296', 'Q134982', 'Q2677', 'Q40787', 'Q191974', 'Q49448', 'Q333809', 'Q76909', 'Q57130', 'Q237564', 'Q78492',
        'Q152274', 'Q43063', 'Q51068', 'Q93363', 'Q51056'],
    husitske: ['Q215968', 'Q366500', 'Q57124', 'Q575086', 'Q571199', 'Q3259870', 'Q1391780', 'Q690877', 'Q1934125', 'Q326752', 'Q1238108', 'Q2464985',
        'Q712603', 'Q716233', 'Q159679'],
    tricetileta: ['Q57195', 'Q52938', 'Q155534', 'Q150599', 'Q153545', 'Q708618', 'Q716769', 'Q320791', 'Q946744', 'Q695234', 'Q697963', 'Q155127',
        'Q150575'],
    stoleta: ['Q7226', 'Q129247', 'Q161527', 'Q314905', 'Q155167', 'Q133372', 'Q170586'],
    napoleonske: ['Q517', 'Q45662', 'Q131691', 'Q83235', 'Q185801', 'Q151173', 'Q40756', 'Q153522']
};

const EXTRA_PEOPLE = ['Q60059'];

// Dřívější limity kategorií: co je za nimi, musí mít český popis
const OLD_LIMITS = { panovnik: 900, statnik: 450, osobnost: 600, bitva: 700, rise: 400 };

// --- 1. krok: kandidáti ---
// Bitvy všech druhů: námořní bitvy, obléhání, tažení, ofenzívy a invaze (podtřídy bitvy vybrané ručně – „legendární bitva“ ani
// „policejní razie“ sem nepatří)
const BATTLE_TYPES = ['Q178561', 'Q1261499', 'Q188055', 'Q831663', 'Q2001676', 'Q743488', 'Q3636229', 'Q48767773', 'Q9173759', 'Q135467957', 'Q467011',
    'Q5176896', 'Q1384277', 'Q15991159', 'Q6982012', 'Q12041935', 'Q12041934', 'Q104708121', 'Q9266805', 'Q25512705', 'Q15047343', 'Q16056723',
    'Q841418', 'Q4688003', 'Q476807', 'Q678146', 'Q4698343'];
const CANDIDATE_QUERIES = [
    ['osoba', 'monarcha', `?item wdt:P106 wd:Q116 ; wikibase:sitelinks ?sl . FILTER(?sl >= 30)`],
    ['osoba', 'funkce', `VALUES ?pos { ${values([...MONARCH_POSITIONS, ...STATESMAN_POSITIONS, POSITIONS.papez])} } ?item wdt:P39 ?pos ; wikibase:sitelinks ?sl . FILTER(?sl >= 15)`],
    ['osoba', 'rod', `VALUES ?fam { ${values(Object.values(DYNASTIES).flat())} } ?item wdt:P53 ?fam ; wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sl . FILTER(?sl >= 15)`],
    ['osoba', 'český rod', `VALUES ?fam { ${values(CZECH_DYNASTIES)} } ?item wdt:P53 ?fam ; wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sl . FILTER(?sl >= 6)`],
    ['statnik', 'hlava státu', `?pos wdt:P279* wd:Q48352 . ?item wdt:P39 ?pos ; wikibase:sitelinks ?sl . FILTER(?sl >= 100)`],
    ['statnik', 'hlava vlády', `?pos wdt:P279* wd:Q2285706 . ?item wdt:P39 ?pos ; wikibase:sitelinks ?sl . FILTER(?sl >= 100)`],
    ['osoba', 'objevitel', `?item wdt:P106 wd:Q11900058 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['osoba', 'vojevůdce', `?item wdt:P106 wd:Q1402561 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['osoba', 'důstojník', `?item wdt:P106 wd:Q189290 ; wikibase:sitelinks ?sl . FILTER(?sl >= 55)`],
    // Voják (military personnel), námořní a armádní důstojník, admirál, maršál, diplomat: Jana z Arku, Nelson, Kutuzov, Metternich
    ['osoba', 'voják', `?item wdt:P106 wd:Q47064 ; wikibase:sitelinks ?sl . FILTER(?sl >= 55)`],
    ['osoba', 'námořní důstojník', `VALUES ?occ { wd:Q10669499 wd:Q132851 } ?item wdt:P106 ?occ ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['osoba', 'armádní důstojník', `VALUES ?occ { wd:Q38239859 wd:Q111837 wd:Q7820253 } ?item wdt:P106 ?occ ; wikibase:sitelinks ?sl . FILTER(?sl >= 45)`],
    ['osoba', 'diplomat', `?item wdt:P106 wd:Q193391 ; wikibase:sitelinks ?sl . FILTER(?sl >= 75)`],
    ['osoba', 'revolucionář', `?item wdt:P106 wd:Q3242115 ; wikibase:sitelinks ?sl . FILTER(?sl >= 50)`],
    ['osoba', 'teolog', `?item wdt:P106 wd:Q1234713 ; wikibase:sitelinks ?sl . FILTER(?sl >= 60)`],
    ['osoba', 'conquistador', `?item wdt:P106 wd:Q126236 ; wikibase:sitelinks ?sl . FILTER(?sl >= 30)`],
    ['osoba', 'osobnost války', `VALUES ?item { ${values(Object.values(WAR_PEOPLE).flat())} } ?item wikibase:sitelinks ?sl .`],
    // Slavní, které by dotazy podle povolání minuly (Albert Veliký už ve Wikidatech nemá povolání teolog)
    ['osoba', 'vybrané osobnosti', `VALUES ?item { ${values(EXTRA_PEOPLE)} } ?item wikibase:sitelinks ?sl .`],
    // Účastníci válek do roku 1900 (P607 přímo nebo přes bitvu války); u husitů stačí článek na české Wikipedii
    ...PERSON_WARS.map(key => ['osoba', `účastník: ${key}`, `?conflict wdt:P361* wd:${WARS[key]} . ?item wdt:P607 ?conflict ; wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sl .
        FILTER(?sl >= ${key === 'husitske' ? 6 : 25}) ?cs schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .`]),
    ['udalost', 'bitva', `VALUES ?type { ${values(BATTLE_TYPES)} } ?item wdt:P31 ?type ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    // Od Česka napřed (spojení s VALUES druhů Wikidata nestihnou)
    ['udalost', 'česká bitva', `?item wdt:P17 wd:Q213 ; wdt:P31 ?type ; wikibase:sitelinks ?sl . FILTER(?sl >= 5) FILTER(?type IN (${BATTLE_TYPES.map(q => `wd:${q}`).join(', ')}))`],
    ['udalost', 'válka', `?item wdt:P31 wd:Q198 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    ['udalost', 'revoluce', `?item wdt:P31 wd:Q10931 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    ['stat', 'historický stát', `?item wdt:P31 wd:Q3024240 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['stat', 'říše', `?item wdt:P31 wd:Q48349 ; wdt:P576 [] ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['stat', 'český stát', `VALUES ?item { ${values([...CZECH_STATES].filter(q => q !== 'Q213'))} } ?item wikibase:sitelinks ?sl .`]
];
// Zdroje s nižším prahem známosti: položka jen z nich musí mít český popis (osoba i fotku) a u událostí druh bitvy či války
const RELAXED_SOURCES = new Set(['voják', 'námořní důstojník', 'armádní důstojník', 'diplomat', 'válečná událost', ...PERSON_WARS.map(key => `účastník: ${key}`)]);

const candidateList = await cached('historie-candidates', async () => {
    const candidates = new Map();
    const add = (kind, name) => (row) => {
        const qid = id(row.item.value);
        const entry = candidates.get(qid) || { sitelinks: Number(row.sl.value), kinds: [], src: [] };
        if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
        if (!entry.src.includes(name)) entry.src.push(name);
        candidates.set(qid, entry);
    };
    // Každý dotaz v mezipaměti zvlášť: když Wikidata jeden nezvládnou, nemusí se po opravě stahovat všechny znovu
    const slug = (name) => name.normalize('NFD').replace(/[^\w]+/g, '-');
    for (const [kind, name, where] of CANDIDATE_QUERIES) {
        const rows = await cached(`historie-q-${slug(name)}-${createHash('md5').update(where).digest('hex').slice(0, 6)}`,
            () => sparql(`SELECT DISTINCT ?item ?sl WHERE { ${where} } LIMIT 4000`));
        rows.forEach(add(kind, name));
        console.log(`${name}: ${rows.length}`);
        await sleep(500);
    }
    // Bitvy, tažení a další součásti sledovaných válek už od 10 jazykových verzí, husitské s jakýmkoli článkem na české Wikipedii
    // (Bitva na Vítkově); druhá světová válka má součástí tisíce, tam stačí obecný práh
    for (const [key, war] of Object.entries(WARS)) {
        if (key === 'druha_svetova') continue;
        const rows = await cached(`historie-q-valka-${key}`, async () => {
            const result = [];
            await inBatches([...warMembers.get(war)], 250, (qids) => `SELECT ?item ?sl WHERE { VALUES ?item { ${values(qids)} } ?item wikibase:sitelinks ?sl .
  FILTER(?sl >= ${key === 'husitske' ? 1 : 10}) ?cs schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> . FILTER NOT EXISTS { ?item wdt:P31 wd:${HUMAN} } }`,
            (row) => result.push(row));
            return result;
        });
        rows.forEach(add('udalost', 'válečná událost'));
        const count = rows.length;
        console.log(`součásti války ${key}: ${count}`);
    }
    return [...candidates];
});
const candidates = new Map(candidateList);
const ALL_DYNASTIES = Object.values(DYNASTIES).flat();
const isRelaxedOnly = (entry) => (entry.src || []).every(name => RELAXED_SOURCES.has(name));

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
  UNION { ?item wdt:P607 ?v BIND("conf" AS ?p) }
  UNION { ?item p:P39 ?s . ?s ps:P39 ?v . OPTIONAL { ?s pq:P580 ?start } OPTIONAL { ?s pq:P582 ?end } BIND("pos" AS ?p) }
}`;

const ordered = [...candidates.entries()].sort((a, b) => b[1].sitelinks - a[1].sitelinks);
console.log(`Podrobnosti k ${ordered.length} kandidátům…`);
const fetchDetails = async (list) => {
    const result = new Map(list.map(qid => [qid, { pos: [] }]));
    await inBatches(list, 60, detailsQuery, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        if (!row.v) return;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (key === 'pos') entry.pos.push({ id: v, start: row.start ? row.start.value : '', end: row.end ? row.end.value : '' });
        else if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    });
    return [...result];
};
const details = new Map(await cached('historie-details', () => fetchDetails(ordered.map(([qid]) => qid))));
// Kandidáti, kteří přibyli po uložení mezipaměti, se dočtou zvlášť
const missingDetails = ordered.map(([qid]) => qid).filter(qid => !details.has(qid));
if (missingDetails.length) for (const [qid, detail] of await cached(`historie-details-${missingDetails.length}`, () => fetchDetails(missingDetails))) details.set(qid, detail);

// České názvy odkazovaných položek (rody, války, místa, hlavní města, funkce, typy, země)
const referenced = new Set();
for (const detail of details.values()) {
    for (const key of ['fam', 'part', 'loc', 'cap', 'cit', 'type', 'occ', 'co']) (detail[key] || []).forEach(q => referenced.add(q));
    detail.pos.forEach(position => referenced.add(position.id));
}
// Neznámé hodnoty (prázdné uzly) nejsou položky
for (const q of referenced) if (!/^Q\d+$/.test(q)) referenced.delete(q);
console.log(`Názvy ${referenced.size} odkazovaných položek…`);
const fetchLabels = async (list) => {
    const result = [];
    await inBatches(list, 400, (qids) => `
SELECT ?item ?label WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?label FILTER(LANG(?label) = "cs") }`,
    (row) => result.push([id(row.item.value), row.label.value]));
    return result;
};
const labels = new Map(await cached('historie-labels', () => fetchLabels([...referenced])));
// Názvy pro dočtené kandidáty (položky bez českého názvu zůstanou bez něj, dotaz se na ně opakuje jen jednou)
const missingLabels = missingDetails.length ? [...referenced].filter(qid => !labels.has(qid)) : [];
if (missingLabels.length) for (const [qid, text] of await cached(`historie-labels-${missingDetails.length}-${missingLabels.length}`, () => fetchLabels(missingLabels))) labels.set(qid, text);
const label = (qid) => LABEL_OVERRIDES[qid] || labels.get(qid);


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
// Vojáci a důstojníci po roce 1800 jen tehdy, když nejsou známí hlavně něčím jiným (spisovatel, vědec, sportovec, který sloužil v armádě)
const MILITARY = /důstojník|admirál|maršál|voják|letec|pilot|velitel/u;
const OTHER_FIELD = /spisovatel|básník|prozaik|dramatik|novinář|publicist|malíř|sochař|fotograf|architekt|fyzik|chemik|matematik|astronom|biolog|lékař|geolog|botanik|zoolog|přírodověd|vědec|inženýr|fotbalist|sportov|hráč|atlet|tenist|hokejist|boxer|cyklist|plavec|zápasník|lyžař|jezdec|závodník|šermíř|olympionik|podnikatel|ekonom|historik|právník|sociolog|psycholog|hudebník/u;
const isHistoricalPerson = (detail, born) => {
    const occupations = occupationLabels(detail);
    if (occupations.some(text => ENTERTAINMENT.test(text))) return false;
    if (born === undefined || born < 1800 || occupations.some(text => MODERN_HISTORICAL.test(text))) return true;
    return occupations.some(text => MILITARY.test(text)) && !occupations.some(text => OTHER_FIELD.test(text));
};
// Účastník války známý hlavně něčím jiným (fyzik Biot, astronom Encke ve službě za napoleonských válek) do dějepisu války nepatří
const isMainlyOtherField = (detail) => {
    const occupations = occupationLabels(detail);
    // Popis říká, čím byl hlavně: „rakouský astronom“ Wilhelm von Biela, i když sloužil jako důstojník, „ruský básník a diplomat“ Ťutčev
    const description = detail.d || '';
    const otherAt = description.search(OTHER_FIELD);
    const historicalAt = description.search(new RegExp(`${MILITARY.source}|vojevůdce|generál|politik|státník|diplomat|panovník|král|císař|vévoda`, 'u'));
    if (otherAt >= 0 && (historicalAt < 0 || otherAt < historicalAt)) return true;
    return occupations.some(text => OTHER_FIELD.test(text) || /filozof|teolog/u.test(text))
        && !occupations.some(text => MILITARY.test(text) || /vojevůdce|generál|politik|státník|diplomat|panovník|vládce|šlechtic|revolucionář/u.test(text));
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
        // Vojenská hodnost přednostně (Nelson: admirál, ne politik)
        const occupation = occupations.find(name => ROYAL.test(name)) || occupations.find(name => /^(admirál|maršál|vojevůdce|generál)$/u.test(name))
            || occupations.find(name => HISTORICAL.test(name) && !/filozof|teolog/u.test(name))
            || occupations.find(name => HISTORICAL.test(name)) || occupations[0];
        text = category === 'osobnost' && occupation ? occupation : { panovnik: 'panovník', statnik: 'státník', osobnost: 'osobnost' }[category];
    }
    return detail.sex === FEMALE ? feminine(text) : text;
};

const STATE_TYPES = /říše|království|císařství|chalífát|chanát|sultanát|republika|kolonie|knížectví|vévodství|impérium|federace|konfederace|unie|městský stát|loutkový stát/u;
const EVENT_TYPES = /bitva|válka|obléhání|revoluce|povstání|tažení|operace|vylodění|bombardování|útok/u;

// Občanství „habsburská monarchie“ má Komenský i Rakušané – české osobnosti z té doby jmenovitě
// Bitva u Zborova (československé legie) se odehrála na Ukrajině, patří ale k českým dějinám
const CZECH_PEOPLE = new Set(['Q12735', 'Q697697']);
// Husitské bitvy bez státu ve Wikidatech (Bitva na Vítkově), české královny z ciziny a čeští šlechtici bez občanství poznáme podle popisu
const isCzechItem = (detail, main, qid) => CZECH_STATES.has(qid) || CZECH_PEOPLE.has(qid) || /husit|(?<!\p{L})(česk|morav)/iu.test(detail.d || '')
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
    // Položka jen ze zdrojů s nižším prahem ustoupí té z hlavních dotazů (historik Tacitus jako „voják“ by vytlačil císaře Tacita)
    const score = (id) => czechScore(details.get(id), id) * 2 + (isRelaxedOnly(candidates.get(id)) ? 0 : 1);
    if (!current || score(qid) > score(current)) preferredByName.set(key, qid);
}

// Války osoby: ručně vybrané, jinak podle P607 (účastník přímo války nebo její bitvy) u válek do roku 1900, když v ní mohla bojovat
const personWars = (qid, detail, born, died) => Object.entries(WARS).filter(([key, war]) => {
    if ((WAR_PEOPLE[key] || []).includes(qid)) return true;
    if (!PERSON_WARS.includes(key) || isMainlyOtherField(detail)) return false;
    const [start, end] = WAR_YEARS[key];
    const lived = born === undefined ? died !== undefined && died >= start && died - 60 <= end : born + 14 <= end && (died === undefined ? born + 70 : died) >= start;
    return lived && (detail.conf || []).some(conflict => conflict === war || warMembers.get(war).has(conflict));
}).map(([, war]) => war);

const items = [];
const rankByCategory = {};
// Panovníci, kterým Wikidata dala cizí příslušnost (Kateřina II. Veliká: Pruské království, Karel X.: Španělsko, Michal I.: Švýcarsko)
const RULER_LAND = { 'Kateřina II. Veliká': 'Rusko', 'Karel X.': 'Francie', 'Michal I.': 'Rumunsko' };
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
    // Známí členové panovnických rodů (princ William, velkokněžna Anastázie) patří k rodu, i když nevládli
    const isRoyal = kind === 'osoba' && (detail.fam || []).some(q => ALL_DYNASTIES.includes(q)) && entry.sitelinks >= 30
        && !occupationLabels(detail).some(text => ENTERTAINMENT.test(text));
    const royalOnly = category === 'osobnost' && !isHistoricalPerson(detail, born);
    if (royalOnly && !isRoyal) continue;
    // Položka jen ze zdrojů s nižším prahem (vojáci, diplomaté, účastníci válek, menší bitvy válek, členové rodů): s českým popisem,
    // osoba s fotkou, ne vědec ve službě
    const relaxed = isRelaxedOnly(entry) || royalOnly;
    if (relaxed && (!detail.d || (kind === 'osoba' && (!detail.im || isMainlyOtherField(detail))))) continue;
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
            // Příslušnost podle popisu (Willy Brandt ve Wikidatech: Norsko); panovníkovi zůstává země původu (česká královna ze Španělska)
            land: RULER_LAND[detail.t] || (category === 'panovnik' ? (detail.cit || []).map(label).filter(Boolean)[0] : landByDescription(detail.d, (detail.cit || []).map(label))),
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
    const ty = kind === 'osoba' ? typeLabelOf(category, detail, main) : typeLabels.find(text => (kind === 'stat' ? STATE_TYPES : EVENT_TYPES).test(text));
    // Součást války jen z dotazu na součásti (smlouva, strana, armáda) bitvou ani válkou není
    if (relaxed && kind === 'udalost' && !ty) continue;
    const settings = CATEGORIES[category];
    const isCzech = isCzechItem(detail, main, qid);
    // Česká jen podle rodu (Lucemburkové z Ligny, polští Jagellonci) – bez bonusu ke známosti; Přemyslovci jsou čeští všichni,
    // ostatní podle popisu („česká královna“, „moravský markrabě“)
    const czechByDynastyOnly = isCzech && !isCzechItem({ ...detail, fam: [] }, main, qid) && !(detail.fam || []).includes(DYNASTIES.premyslovci)
        && !/česk|morav/u.test(detail.d || '');
    // Papežové mají díky robotům články ve spoustě jazyků – známost a limit počítáme zvlášť
    const isPope = isPopeDetail(detail);
    const rankKey = isPope ? 'papez' : category;
    const rank = rankByCategory[rankKey] || 0;
    const limits = isPope ? { limit: 300 } : settings;
    if (rank >= limits.limit && !isCzech) continue;
    // Za dřívějšími limity kategorií (méně známí, přibyli s úrovní Expert) jen s českým popisem
    if (!detail.d && !isCzech && rank >= (OLD_LIMITS[rankKey] ?? Infinity)) continue;
    // Stejné jméno má i jiná položka (dvě Anny Jagellonské, dvě Řecko-turecké války) – zůstane jen jedna, jinak by byla sporná
    if (preferredByName.get(nameKeyOf(detail)) !== qid) continue;
    rankByCategory[rankKey] = rank + 1;
    const point = parsePoint(detail.coord);
    // Jednoslovný štítek, který článek upřesňuje („James“ → „James, hrabě z Wessexu“, „Cchao“ → „Cchao Cchao“), by byl nejasný
    const titleName = detail.t.replace(/ \(.*\)$/, '');
    const name = detail.n && !(/^\S+$/u.test(detail.n) && (titleName.startsWith(`${detail.n} `) || titleName.startsWith(`${detail.n},`))) ? detail.n : titleName;
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: category,
        ty: isPope ? 'papež' : ty,
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
        part: kind === 'udalost' ? Object.values(WARS).filter(war => warMembers.get(war).has(qid))
            : kind === 'osoba' ? personWars(qid, detail, born, died) : undefined,
        // Pro známost (krok 5): počet jazykových verzí, papež
        sl: entry.sitelinks,
        czb: isCzech && !czechByDynastyOnly ? 1 : undefined,
        pope: isPope || undefined
    }));
}

// --- 3b. krok: události (smlouvy a mírové smlouvy, kongresy a koncily, objevné výpravy, katastrofy, atentáty, korunovace…) ---
// Bitvy, války a revoluce mají vlastní kategorii – tady jen to, co mezi nimi není
const EVENT_QUERIES = [
    ['mírová smlouva', `?item wdt:P31 wd:Q625298 ; wikibase:sitelinks ?sl . FILTER(?sl >= 30)`],
    ['smlouva', `?item wdt:P31 wd:Q131569 ; wikibase:sitelinks ?sl . FILTER(?sl >= 50)`],
    ['koncil', `?item wdt:P31 wd:Q51645 ; wikibase:sitelinks ?sl . FILTER(?sl >= 20)`],
    // Konference a summity (Jalta, Teherán, Berlínský kongres), mírové konference (Vídeňský kongres)
    ['konference', `VALUES ?type { wd:Q625994 wd:Q1072326 wd:Q7157512 wd:Q18564543 } ?item wdt:P31 ?type ; wikibase:sitelinks ?sl . FILTER(?sl >= 15)`],
    ['zemětřesení', `?item wdt:P31 wd:Q7944 ; wikibase:sitelinks ?sl . FILTER(?sl >= 20)`],
    ['tsunami', `?item wdt:P31 wd:Q8070 ; wikibase:sitelinks ?sl . FILTER(?sl >= 20)`],
    ['hurikán', `VALUES ?type { wd:Q34439356 wd:Q8092 } ?item wdt:P31 ?type ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    // Ztroskotání lodí, letecké a železniční nehody, jaderné a průmyslové havárie, výbuchy
    ['havárie', `VALUES ?type { wd:Q2620513 wd:Q744913 wd:Q1078765 wd:Q1620824 wd:Q68800046 wd:Q179057 } ?item wdt:P31 ?type ; wikibase:sitelinks ?sl . FILTER(?sl >= 18)`],
    ['požár', `?item wdt:P31 wd:Q168983 ; wikibase:sitelinks ?sl . FILTER(?sl >= 15)`],
    ['epidemie', `VALUES ?type { wd:Q44512 wd:Q12184 } ?item wdt:P31 ?type ; wikibase:sitelinks ?sl . FILTER(?sl >= 35)`],
    ['hladomor', `?item wdt:P31 wd:Q168247 ; wikibase:sitelinks ?sl . FILTER(?sl >= 35)`],
    ['povodeň', `?item wdt:P31 wd:Q8068 ; wikibase:sitelinks ?sl . FILTER(?sl >= 30)`],
    ['výbuch sopky', `?item wdt:P31 wd:Q7692360 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)`],
    ['expedice', `?item wdt:P31 wd:Q2401485 ; wikibase:sitelinks ?sl . FILTER(?sl >= 28)`],
    ['atentát', `?item wdt:P31 wd:Q3882219 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['protest', `?item wdt:P31 wd:Q273120 ; wikibase:sitelinks ?sl . FILTER(?sl >= 45)`],
    ['masakr', `?item wdt:P31 wd:Q3199915 ; wikibase:sitelinks ?sl . FILTER(?sl >= 50)`],
    ['převrat', `?item wdt:P31 wd:Q45382 ; wikibase:sitelinks ?sl . FILTER(?sl >= 40)`],
    ['korunovace', `?item wdt:P31 wd:Q209715 ; wikibase:sitelinks ?sl . FILTER(?sl >= 20)`]
];
// Slavné události, které Wikidata vedou pod obecným druhem (historická událost, listina, konference): podle českého názvu
const PINNED_EVENTS = ['Pád Berlínské zdi', 'Znovusjednocení Německa', 'Rozpad Sovětského svazu', 'Rozdělení Československa', 'Pražské jaro',
    'Invaze vojsk Varšavské smlouvy do Československa', 'Operace Anthropoid', 'Vyhlazení Lidic', 'Pražská defenestrace (1419)', 'Pražská defenestrace (1618)',
    'Černobylská havárie', 'Havárie elektrárny Fukušima I', 'Havárie elektrárny Three Mile Island', 'Potopení Titanicu', 'Katastrofa vzducholodi Hindenburg',
    'Erupce Vesuvu', 'Velký požár Londýna', 'Velký požár Říma', 'Velký požár v Chicagu', 'Požár Říšského sněmu', 'Bostonské pití čaje', 'teroristické útoky 11. září 2001',
    'Milánský edikt', 'Edikt nantský', 'Magna charta', 'Zlatá bula sicilská', 'Zlatá bula Karla IV.', 'Deklarace nezávislosti Spojených států amerických',
    'Magna charta libertatum', 'Havárie vzducholodi Hindenburg', 'Rozpad Československa', 'Upálení mistra Jana Husa',
    'Mnichovská dohoda', 'Vídeňský kongres', 'Jaltská konference', 'Postupimská konference', 'Teheránská konference', 'Berlínský kongres', 'Berlínská konference',
    'Konference ve Wannsee', 'Pařížská mírová konference 1919', 'Bartolomějská noc', 'Křišťálová noc', 'holokaust', 'Velká hospodářská krize',
    'Magellanova expedice', 'Lewisova a Clarkova expedice', 'Amundsenova expedice na jižní pól', 'Expedice Terra Nova', 'Upálení Jana Husa', 'Kutnohorský dekret',
    'Únor 1948', 'Atentát na Johna Fitzgeralda Kennedyho', 'Atentát na Abrahama Lincolna', 'Zavraždění Julia Caesara', 'Kolumbova první plavba',
    'Objevení Ameriky', 'Zámořské objevy', 'Rozdělení Indie', 'Berlínská blokáda', 'Karibská krize', 'Přistání v Zátoce sviní', 'Watergate', 'Vídeňská arbitráž',
    'Pražský mír', 'Vestfálský mír', 'Versailleská smlouva', 'Korunovace Alžběty II.', 'Hladomor na Ukrajině', 'Černá smrt', 'Španělská chřipka', 'Arabské jaro',
    'Solný pochod', 'Pochod na Řím', 'Baltský řetěz', 'Den D', 'Norimberský proces', 'Lidická tragédie', 'Akce K', 'Zavraždění Václava', 'Babylonské zajetí'];
// Druhy, které jsou bitvou, válkou nebo revolucí (ty jsou v kategorii Bitvy, války a revoluce)
const MILITARY_TYPES = /bitva|válka|obléhání|revoluce|vojensk|tažení|operace(?! Anthropoid)|ofenzíva|invaze|bombardování/u;
const eventCandidates = new Map(await cached('historie-udalosti-candidates-5', async () => {
    const result = new Map();
    for (const [kind, where] of EVENT_QUERIES) {
        const rows = await sparql(`SELECT DISTINCT ?item ?sl WHERE { ${where} ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> . } LIMIT 2000`);
        for (const row of rows) if (!result.has(id(row.item.value))) result.set(id(row.item.value), { sl: Number(row.sl.value), kind });
        console.log(`událost ${kind}: ${rows.length}`);
        await sleep(500);
    }
    // Český štítek bývá s malým písmenem (pád Berlínské zdi); ze stejně pojmenovaných (film Operace Anthropoid) ta s nejvíc jazykovými verzemi
    const forms = [...new Set(PINNED_EVENTS.flatMap(name => [name, name.charAt(0).toLocaleLowerCase('cs') + name.slice(1)]))];
    // Podle štítku i podle názvu článku na české Wikipedii (Magna charta libertatum)
    const pinned = await sparql(`SELECT ?item ?l ?sl WHERE { VALUES ?l { ${forms.map(name => `${JSON.stringify(name)}@cs`).join(' ')} }
  { ?item rdfs:label ?l } UNION { ?t schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?l }
  ?item wikibase:sitelinks ?sl . ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> . }`);
    const best = new Map();
    for (const row of pinned) {
        const key = row.l.value.toLocaleLowerCase('cs');
        if (!best.has(key) || best.get(key).sl < Number(row.sl.value)) best.set(key, { qid: id(row.item.value), sl: Number(row.sl.value) });
    }
    for (const { qid, sl } of best.values()) result.set(qid, { ...(result.get(qid) || { kind: 'událost' }), sl, pinned: true });
    console.log(`události podle názvu: ${best.size} z ${PINNED_EVENTS.length}`);
    return [...result];
}));
const eventIds = [...eventCandidates.keys()].filter(qid => !items.some(item => item.q === qid));
const eventDetailsQuery = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P580 ?v BIND("start" AS ?p) }
  UNION { ?item wdt:P582 ?v BIND("end" AS ?p) }
  UNION { ?item wdt:P585 ?v BIND("date" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("from" AS ?p) }
  UNION { ?item wdt:P577 ?v BIND("pub" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P276|wdt:P1071 ?v BIND("loc" AS ?p) }
  UNION { ?item wdt:P276|wdt:P1071 ?l . ?l wdt:P17 ?v BIND("lco" AS ?p) }
  UNION { ?item wdt:P276|wdt:P1071 ?l . ?l wdt:P625 ?v BIND("lcoord" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P361 ?v BIND("part" AS ?p) }
}`;
const EVENT_SINGLE = { t: 1, n: 1, d: 1, im: 1, start: 1, end: 1, date: 1, from: 1, pub: 1, coord: 1, lcoord: 1 };
const fetchEventDetails = async (list) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, 50, eventDetailsQuery, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        if (!row.v) return;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (EVENT_SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    });
    return [...result];
};
const eventDetails = new Map(await cached('historie-udalosti-details', () => fetchEventDetails(eventIds)));
// Události, které přibyly po uložení mezipaměti, se dočtou zvlášť
const missingEvents = eventIds.filter(qid => !eventDetails.has(qid));
if (missingEvents.length) for (const [qid, detail] of await cached(`historie-udalosti-details-${missingEvents.length}`, () => fetchEventDetails(missingEvents))) eventDetails.set(qid, detail);
const eventRefs = [...new Set([...eventDetails.values()].flatMap(detail => [...(detail.loc || []), ...(detail.type || []), ...(detail.part || [])]))].filter(qid => /^Q\d+$/.test(qid) && !labels.has(qid));
for (const [qid, text] of await cached(`historie-udalosti-labels-${eventRefs.length}`, async () => {
    const result = [];
    await inBatches(eventRefs, 400, (qids) => `SELECT ?item ?label WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?label FILTER(LANG(?label) = "cs") }`,
        (row) => result.push([id(row.item.value), row.label.value]));
    return result;
})) labels.set(qid, text);

// Druh události: podle dotazu, jinak podle druhu ve Wikidatech
const EVENT_KINDS = [['invaze', /invaz|okupac/u], ['konference', /konferenc|kongres|summit/u], ['mírová smlouva', /mírov/u], ['smlouva', /smlouv|dohod|pakt|úmluv/u], ['listina', /listin|edikt|bula|charta|deklarac|dekret/u],
    ['konference', /konferenc|kongres|summit/u], ['koncil', /koncil/u], ['proces', /proces/u], ['korunovace', /korunovac/u], ['zemětřesení', /zemětřes/u],
    ['tsunami', /tsunami/u], ['hurikán', /hurikán|tajfun|cyklón/u],
    ['hladomor', /hladomor/u], ['epidemie', /epidemi|pandemi|(?<!\p{L})mor(?!\p{L})|chřipk/u], ['výbuch sopky', /erupc|sopk/u], ['požár', /požár/u], ['povodeň', /povod/u],
    ['havárie', /havári|neštěstí|katastrof|ztroskot|potopení|nehod|výbuch|exploz/u], ['expedice', /expedic|výprav|plavb|objev/u], ['masakr', /masakr|genocid|pogrom|holokaust|vyvražd|vyhlazen/u], ['atentát', /atentát|zavražd|vražd/u],
    ['převrat', /převrat|puč/u], ['protest', /protest|demonstrac|pochod|nepokoj/u], ['masakr', /masakr|genocid|pogrom|holokaust/u], ['krize', /krize/u]];
// Druh: napřed podle názvu (Vídeňský kongres, Invaze vojsk Varšavské smlouvy), pak podle dotazu, druhu ve Wikidatech a popisu
const eventKindOf = (entry, detail) => {
    const byName = (EVENT_KINDS.find(([, pattern]) => pattern.test((detail.n || detail.t || '').toLocaleLowerCase('cs'))) || [])[0];
    if (byName) return byName;
    if (entry.kind !== 'událost') return entry.kind;
    const text = [...(detail.type || []).map(label), detail.d].filter(Boolean).join(' · ').toLocaleLowerCase('cs');
    // Soudní proces jen podle názvu (Norimberský proces) – „proces rozpadu“ v popisu soudem není
    return (EVENT_KINDS.find(([kind, pattern]) => kind !== 'proces' && pattern.test(text)) || ['událost'])[0];
};
const EVENT_LIMIT = 460;
const NEW_EVENT_KINDS = new Set(['konference', 'tsunami', 'hurikán', 'havárie', 'požár']);
// Mírových smluv, leteckých nehod a zemětřesení je mnoho – vezmou se jen ty nejznámější, ať nepřeválcují ostatní události
const EVENT_KIND_LIMITS = { 'mírová smlouva': 42, smlouva: 24, koncil: 21, 'zemětřesení': 36, masakr: 12, havárie: 40, hurikán: 12, tsunami: 8, konference: 30 };
// Názvy událostí, které mají ve Wikidatech štítek s rokem nebo nejasný (Pražská defenestrace (1419) – „První pražská defenestrace  (1419)“)
const EVENT_NAMES = { Q688769: 'První pražská defenestrace' };
// AIDS je nemoc, ne událost, Zkáza Titanicu díl seriálu; revoluce patří k bitvám a válkám
const NOT_EVENTS = new Set(['Q12199', 'Q959313']);
const eventNames = new Set();
const eventKindCounts = {};
const events = [];
for (const [qid, entry] of [...eventCandidates].sort((a, b) => b[1].sl - a[1].sl)) {
    const detail = eventDetails.get(qid);
    if (!detail || !detail.t || events.length >= EVENT_LIMIT || NOT_EVENTS.has(qid) || /revoluc/iu.test(detail.n || detail.t)) continue;
    // Film, díl seriálu nebo kniha se jménem události (Operace Anthropoid z roku 2021) událostí nejsou
    if (/(?<!\p{L})(film|seriál|román|kniha|píseň|videohr|album)/iu.test(detail.d || '')) continue;
    const typeLabels = (detail.type || []).map(label).filter(Boolean);
    if (typeLabels.some(text => MILITARY_TYPES.test(text)) && !entry.pinned) continue;
    // Rok: začátek, datum, vznik (smlouvy), zveřejnění; konec jen u déle trvajících
    const titled = /\((\d{3,4})(?:[–-](\d{3,4}))?\)$/.exec(detail.t || '');
    let start = titled ? Number(titled[1]) : yearOf(detail.start) ?? yearOf(detail.date) ?? yearOf(detail.from) ?? yearOf(detail.pub);
    let end = titled ? (titled[2] ? Number(titled[2]) : undefined) : yearOf(detail.end);
    if (start === undefined || start < -3000 || start > THIS_YEAR) continue;
    // Nedávné události (po roce 2015) jsou spíš zprávy než dějiny
    if (start > 2015 && !entry.pinned) continue;
    if (end !== undefined && (end < start || end > THIS_YEAR)) end = undefined;
    const name = EVENT_NAMES[qid] || detail.n || detail.t.replace(/ \(.*\)$/, '');
    const kind = eventKindOf(entry, detail);
    // „Konference“ ve Wikidatech jsou i veletrhy (Electronic Entertainment Expo, Google I/O) – jen setkání, která se tak jmenují
    if (entry.kind === 'konference' && !entry.pinned && !/konferenc|kongres|summit|sjezd|shromáždění/iu.test(name)) continue;
    // Jedna událost na jméno (Pražský mír 1635 i 1866 jsou dvě různé – rozliší je rok v závorce názvu článku)
    const nameKey = name.toLocaleLowerCase('cs');
    // České události se vejdou vždy (Vyhlazení Lidic i nad limit masakrů)
    const czechLike = /(?<!\p{L})(česk|čech|morav|pražsk|lidic|lidick)/iu.test(`${name} ${detail.d || ''}`);
    // Nové druhy událostí (konference, havárie, hurikány…) a zemětřesení pod dřívějším prahem jen s českým popisem; ekumenické koncily
    // jsou všechny (název říká, co to je)
    if (!detail.d && !entry.pinned && (NEW_EVENT_KINDS.has(entry.kind) || (entry.kind === 'zemětřesení' && entry.sl < 45))) continue;
    if (eventNames.has(nameKey) || (!czechLike && (eventKindCounts[kind] || 0) >= (EVENT_KIND_LIMITS[kind] ?? Infinity))) continue;
    if (preferredByName.has(name.toLocaleLowerCase('cs')) && preferredByName.get(name.toLocaleLowerCase('cs')) !== qid && items.some(item => item.q === preferredByName.get(name.toLocaleLowerCase('cs')))) continue;
    const point = parsePoint(detail.coord) || parsePoint(detail.lcoord);
    // Stát: přímo u události, jinak stát místa (u smluv místa podpisu)
    const countries = [...new Set([...(detail.co || []), ...(detail.lco || [])])];
    const isCzech = countries.some(q => CZECH_STATES.has(q)) || /(?<!\p{L})(česk|čech|morav|pražsk|lidick)/iu.test(`${name} ${detail.d || ''}`);
    eventNames.add(nameKey);
    eventKindCounts[kind] = (eventKindCounts[kind] || 0) + 1;
    events.push({ qid, entry, detail, name, start, end, point, countries, isCzech, kind });
}
// Nejznámější české události
const CZECH_EVENTS_KNOWN = new Set(['Pražské jaro', 'Mnichovská dohoda', 'První pražská defenestrace', 'Pražská defenestrace (1618)', 'Upálení Jana Husa',
    'Operace Anthropoid', 'Vyhlazení Lidic', 'Rozdělení Československa', 'Invaze vojsk Varšavské smlouvy do Československa', 'Únor 1948', 'Kutnohorský dekret',
    'Zlatá bula sicilská', 'Pražský mír']);
for (const event of events) {
    const { qid, detail, name, start, end, point, countries } = event;
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: 'udalosti',
        ty: event.kind,
        d: detail.d,
        cz: event.isCzech ? 1 : undefined,
        la: point ? point.lat : undefined,
        lo: point ? point.lon : undefined,
        co: countries,
        ...imageFields(detail.im),
        f: compact({
            year: start,
            end: end !== undefined && end !== start ? end : undefined,
            place: (detail.loc || []).map(label).filter(Boolean)[0],
            war: (detail.part || []).map(label).filter(Boolean)[0],
            y: start
        }),
        sl: event.entry.sl,
        czb: event.isCzech ? 1 : undefined,
        pe: event.entry.pinned || undefined,
        pinned: CZECH_EVENTS_KNOWN.has(name) || undefined
    }));
}
console.log(`události: ${events.length}`);

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
// Rod: jeho panovníci a známí členové (od 30 jazykových verzí, u českých rodů od 15) – ne všechny princezny a vévodové
const hasDynasty = (key) => (item) => ids(DYNASTIES[key]).some(q => (item.fam || []).includes(q))
    && (item.c === 'panovnik' || item.sl >= (ids(DYNASTIES[key]).some(q => CZECH_DYNASTIES.includes(q)) ? 15 : 30));
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
    { id: 'smlouvy', label: 'Smlouvy a mírové smlouvy', text: 'Od Vestfálského míru po Mnichovskou dohodu', sort: BY_YEAR, test: item => item.c === 'udalosti' && /smlouva|listina/u.test(item.ty || '') },
    { id: 'kongresy-koncily', label: 'Kongresy, konference a koncily', sort: BY_YEAR, test: item => item.c === 'udalosti' && /konference|koncil/u.test(item.ty || '') },
    { id: 'katastrofy', label: 'Katastrofy a epidemie', text: 'Zemětřesení, požáry, hladomory, morové rány a havárie', sort: BY_YEAR,
        test: item => item.c === 'udalosti' && /zemětřesení|tsunami|hurikán|epidemie|hladomor|požár|povodeň|havárie|výbuch sopky/u.test(item.ty || '') },
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
// --- 5. krok: úrovně – Základní (k: 1, co zná většina lidí), Mudrlant, Mudrlant Expert (x: 1, opravdové perličky) ---
// Známost podle počtu jazykových verzí; české dějiny mají bonus (Bitva na Vítkově zná u nás každý, ve světě málokdo),
// papežové mají články díky robotům skoro ve všech jazycích, proto se jim počítá jen část
const fameOf = (item) => (item.pope ? item.sl * 0.6 : item.sl) * (item.czb ? 3 : 1) + (item.czb ? 20 : 0);
const fame = new Map(items.map(item => [item, fameOf(item)]));
const byFame = (list) => [...list].sort((a, b) => fame.get(b) - fame.get(a));
const levelGroup = (item) => item.pope ? 'papez' : item.c;
const groupsOfLevel = new Map();
for (const item of items) groupsOfLevel.set(levelGroup(item), [...(groupsOfLevel.get(levelGroup(item)) || []), item]);
// Pořadí v kategorii (0 = nejznámější, 1 = nejméně známá)
const quantile = new Map();
for (const list of groupsOfLevel.values()) byFame(list).forEach((item, index) => quantile.set(item, list.length > 1 ? index / (list.length - 1) : 0));
// Známých je v každé kategorii zhruba čtvrtina, papežů jen hrstka; perliček (Expert) asi čtvrtina nejméně známých
const KNOWN_SHARE = { default: 0.24, papez: 0.065 };
const EXPERT_SHARE = { default: 0.75, papez: 0.45 };
const shareOf = (table, item) => table[levelGroup(item)] ?? table.default;
const known = new Set(items.filter(item => item.pinned || quantile.get(item) < shareOf(KNOWN_SHARE, item)));
// Okruhy, kde je známých příliš (prezidenti USA, angličtí králové mají články ve všech jazycích): nad 45 % zůstanou známí jen
// opravdu slavní (procento nejznámějších v kategorii); české okruhy zná český hráč z větší části (60 %)
const ERA_GROUPS = new Set(['starovek', 'stredovek', 'novovek', 'moderni-dejiny']);
const CZECH_GROUPS = new Set(['ceske-dejiny', 'cesti-panovnici', 'premyslovci', 'lucemburkove', 'jagellonci', 'prezidenti-cr']);
const membersOf = (collectionId) => items.filter(item => (item.g || []).includes(collectionId));
// Co je v takovém okruhu za hranicí, nebude známé ani díky jinému okruhu (anglický král ve středověku)
const blocked = new Set();
for (const collection of collections) {
    const members = byFame(membersOf(collection.id));
    if (members.length < 8 || ERA_GROUPS.has(collection.id)) continue;
    const cap = Math.ceil(members.length * (CZECH_GROUPS.has(collection.id) ? 0.6 : 0.45));
    const isFamous = (item) => item.pinned || (item.czb ? item.sl >= 50 : quantile.get(item) < 0.01);
    members.slice(cap).filter(item => !isFamous(item)).forEach(item => { known.delete(item); blocked.add(item); });
}
// Každý okruh od 8 položek má aspoň čtvrtinu známých (nejméně 3) – ale jen z horní poloviny své kategorie, ať se obskurní faraon
// nestane „známým“ jen proto, že je okruh malý. Napřed bez položek za hranicí jiného okruhu; když to nestačí, má přednost
// tenhle okruh (Plantageneti potřebují Eduarda III., i když mezi všemi anglickými panovníky už je známých dost) – ne ale doby
const fillCollection = (collection, allowBlocked) => {
    const members = byFame(membersOf(collection.id));
    if (members.length < 8) return;
    const need = Math.max(3, Math.ceil(members.length * 0.25));
    for (const item of members) {
        if (members.filter(other => known.has(other)).length >= need) break;
        if (!known.has(item) && (allowBlocked || !blocked.has(item)) && quantile.get(item) < (item.pope ? 0.08 : 0.5)) known.add(item);
    }
};
collections.forEach(collection => fillCollection(collection, false));
collections.filter(collection => !ERA_GROUPS.has(collection.id)).forEach(collection => fillCollection(collection, true));
for (const item of items) {
    item.k = known.has(item) ? 1 : 0;
    // Expert: nejméně známá čtvrtina kategorie a vše s pár jazykovými verzemi (mimo české dějiny)
    // Vybrané slavné události (Magellanova expedice) perličkou nejsou, i když je ve Wikidatech vedená položka s málo jazyky
    if (!item.k && !item.pe && (quantile.get(item) >= shareOf(EXPERT_SHARE, item) || (!item.czb && item.sl < 12))) item.x = 1;
}

// Stejná fotka u víc položek (bitva i válka s jedním obrazem, dva Merovejci s jedním portrétem) by v otázce nerozlišila odpověď –
// zůstane jen u té známější
const imageOwner = new Map();
for (const item of byFame(items)) {
    if (!item.im) continue;
    if (imageOwner.has(item.im)) { delete item.im; delete item.ih; } else imageOwner.set(item.im, item);
}
// Perlička bez popisu by byla neuhodnutelná: vypadne osoba bez fotky, položka bez popisu i obrázku a položka bez popisu mimo
// tematické okruhy (Germanicus bez popisu zůstane mezi Juliovci-Claudiovci); české dějiny, vybrané události a koncily zůstanou vždy
const PERSON_CATEGORIES = new Set(['panovnik', 'statnik', 'osobnost']);
const inTopicCollection = (item) => (item.g || []).some(group => !ERA_GROUPS.has(group));
const unusable = new Set(items.filter(item => item.x && !item.cz && !item.pe && item.ty !== 'koncil'
    && ((PERSON_CATEGORIES.has(item.c) && !item.im) || (!item.d && (!item.im || !inTopicCollection(item))))));
for (let index = items.length - 1; index >= 0; index--) if (unusable.has(items[index])) items.splice(index, 1);
// Zbytky HTML v popisu z Wikidat (CO<sub>2</sub>) a závorka na konci bez začátku (Cato mladší: „… 95–46 př. n. l.)“)
for (const item of items) {
    if (!item.d) continue;
    item.d = item.d.replace(/<\/?(sub|sup)>/g, '');
    if ((item.d.match(/\(/g) || []).length < (item.d.match(/\)/g) || []).length) item.d = item.d.replace(/\s*\)$/, '');
}
if (process.env.DEBUG_GROUP) console.log(byFame(membersOf(process.env.DEBUG_GROUP)).map(item => `${item.n} ${fame.get(item)} q${quantile.get(item).toFixed(3)} k${item.k} ${blocked.has(item) ? "B" : ""}`).join("\n"));
// Pomocné údaje pro okruhy a úrovně už v datech nejsou potřeba
for (const item of items) { delete item.pos; delete item.fam; delete item.part; delete item.sl; delete item.czb; delete item.pe; delete item.pope; delete item.pinned; }

for (const [group, list] of groupsOfLevel) {
    const at = (share) => Math.round(fame.get(byFame(list)[Math.min(list.length - 1, Math.floor(share * (list.length - 1)))]));
    console.log(`známost ${group}: hranice známých ${at(shareOf(KNOWN_SHARE, list[0]))}, polovina ${at(0.5)}, hranice perliček ${at(shareOf(EXPERT_SHARE, list[0]))}`);
}
const levelCounts = (list) => `${list.length} (${list.filter(item => item.k).length} známých, ${list.filter(item => item.x).length} expert)`;
for (const category of Object.keys(CATEGORIES)) console.log(`${category}: ${levelCounts(items.filter(item => item.c === category))}`);
for (const collection of collections) console.log(`okruh ${collection.label}: ${levelCounts(membersOf(collection.id))}`);

writeTopic('historie', { collections, items });
