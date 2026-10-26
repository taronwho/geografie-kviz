// Téma Architektura: data/architektura.json z Wikidat (přes QLever) – stavby s jasným slohem, architektonické slohy, architekti
// Spuštění: npm run build:architektura (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování;
// potřebuje data/countries.json a data/zemepis.json – z měst zeměpisu se bere město stavby)
import { readFileSync } from 'node:fs';
import { qlever, id, values, parsePoint, imageFields, yearOf, compact, cached, inBatches, writeTopic, readCountries, CZECHIA } from './lib/wikidata.mjs';

const ARCHITECT = 'Q42973';
const FEMALE = 'Q6581072';
const WORLD_HERITAGE_SITE = 'Q9259';
// Státy, ke kterým patří čeští architekti (Česko, Československo, České království, Protektorát, Morava…)
const CZECH_STATES = new Set([CZECHIA, 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266']);

// Slohy: klíč, český název (odpověď), položka Wikidat s článkem (popis slohu), období (od–do, popis) a styly Wikidat,
// které k němu patří (podslohy, regionální varianty). known = sloh, který zná každý středoškolák.
const STYLES = [
    { key: 'recko', name: 'Řecká antika', q: 'Q331273', from: -700, to: -30, period: '7.–1. století př. n. l.', known: 1, styles: ['Q331273', 'Q2011484'] },
    { key: 'rim', name: 'Římská antika', q: 'Q223750', from: -300, to: 476, period: '3. století př. n. l. – 5. století', known: 1, styles: ['Q223750'] },
    { key: 'byzantsky', name: 'Byzantský sloh', q: 'Q47591', from: 330, to: 1453, period: '4.–15. století', known: 1, styles: ['Q47591'] },
    { key: 'islamska', name: 'Islámská architektura', q: 'Q212940', from: 650, to: 2026, period: 'od 7. století dodnes', known: 1,
        styles: ['Q212940', 'Q527449', 'Q542261', 'Q247492', 'Q1501585', 'Q2864672'] },
    { key: 'romansky', name: 'Románský sloh', q: 'Q46261', from: 1000, to: 1250, period: '11.–13. století', known: 1, styles: ['Q46261', 'Q46805', 'Q136693'] },
    { key: 'gotika', name: 'Gotika', q: 'Q176483', from: 1140, to: 1530, period: 'polovina 12. – počátek 16. století', known: 1,
        styles: ['Q176483', 'Q46825', 'Q695863', 'Q10924220', 'Q1351624', 'Q33247990', 'Q12018399', 'Q750752', 'Q3111491', 'Q72553961', 'Q2245489', 'Q867769'] },
    { key: 'renesance', name: 'Renesance', q: 'Q236122', from: 1420, to: 1620, period: '15.–16. století (v Čechách do roku 1620)', known: 1,
        styles: ['Q236122', 'Q4692', 'Q1444486', 'Q6297212', 'Q1404472'] },
    { key: 'baroko', name: 'Baroko', q: 'Q840829', from: 1600, to: 1780, period: '17.–18. století', known: 1,
        styles: ['Q840829', 'Q37853', 'Q13107150', 'Q64334168', 'Q109180294', 'Q6092662', 'Q5501689', 'Q2574110', 'Q1542287', 'Q3624106'] },
    { key: 'barokni-gotika', name: 'Barokní gotika', q: 'Q4176287', from: 1690, to: 1740, period: 'přelom 17. a 18. století', known: 0, styles: ['Q4176287'] },
    { key: 'rokoko', name: 'Rokoko', q: 'Q122960', from: 1730, to: 1780, period: 'polovina 18. století', known: 1, styles: ['Q122960', 'Q11350230'] },
    { key: 'klasicismus', name: 'Klasicismus', q: 'Q54111', from: 1750, to: 1840, period: 'od poloviny 18. do poloviny 19. století', known: 1,
        styles: ['Q54111', 'Q170292', 'Q14378', 'Q1513688'] },
    { key: 'empir', name: 'Empír', q: 'Q191105', from: 1800, to: 1830, period: 'počátek 19. století', known: 1, styles: ['Q191105'] },
    { key: 'historismus', name: 'Historismus', q: 'Q277466', from: 1830, to: 1914, period: '19. století', known: 1,
        styles: ['Q277466', 'Q51879601', 'Q2479493', 'Q2537632', 'Q460501', 'Q1216982'] },
    { key: 'novogotika', name: 'Novogotika', q: 'Q186363', from: 1830, to: 1914, period: '19. století', known: 1, styles: ['Q186363'] },
    { key: 'novoromansky', name: 'Novorománský sloh', q: 'Q744373', from: 1830, to: 1914, period: '19. století', known: 0, styles: ['Q744373'] },
    { key: 'novorenesance', name: 'Novorenesance', q: 'Q502163', from: 1840, to: 1914, period: '2. polovina 19. století', known: 1, styles: ['Q502163'] },
    { key: 'novobaroko', name: 'Novobaroko', q: 'Q911397', from: 1850, to: 1914, period: '2. polovina 19. a počátek 20. století', known: 1, styles: ['Q911397'] },
    { key: 'novobyzantsky', name: 'Novobyzantský sloh', q: 'Q966571', from: 1840, to: 1914, period: '19. a počátek 20. století', known: 0, styles: ['Q966571', 'Q2860359'] },
    { key: 'secese', name: 'Secese', q: 'Q1295040', from: 1890, to: 1914, period: 'přelom 19. a 20. století', known: 1,
        styles: ['Q1295040', 'Q34636', 'Q1122677', 'Q61777202', 'Q208208', 'Q687031'] },
    { key: 'kubismus', name: 'Kubismus', q: 'Q42934', from: 1911, to: 1925, period: '1911–1925', known: 1, styles: ['Q42934'] },
    { key: 'artdeco', name: 'Art deco', q: 'Q173782', from: 1920, to: 1940, period: '20. a 30. léta 20. století', known: 1, styles: ['Q173782', 'Q12720942', 'Q9322693', 'Q928960'] },
    { key: 'funkcionalismus', name: 'Funkcionalismus', q: 'Q47942', from: 1920, to: 1970, period: '20.–60. léta 20. století', known: 1,
        styles: ['Q47942', 'Q162324', 'Q478774', 'Q61777227', 'Q115096449', 'Q115096446', 'Q2535546', 'Q11784483', 'Q124354'] },
    { key: 'socrealismus', name: 'Socialistický realismus', q: 'Q1134824', from: 1932, to: 1958, period: '30.–50. léta 20. století', known: 0, styles: ['Q1134824', 'Q180902'] },
    { key: 'brutalismus', name: 'Brutalismus', q: 'Q994776', from: 1950, to: 1985, period: '50.–80. léta 20. století', known: 1, styles: ['Q994776'] },
    { key: 'postmodernismus', name: 'Postmodernismus', q: 'Q595448', from: 1970, to: 2000, period: '70.–90. léta 20. století', known: 1, styles: ['Q595448', 'Q47783'] },
    { key: 'hightech', name: 'High-tech', q: 'Q845318', from: 1970, to: 2026, period: 'od 70. let 20. století', known: 0, styles: ['Q845318'] },
    { key: 'dekonstruktivismus', name: 'Dekonstruktivismus', q: 'Q238255', from: 1980, to: 2026, period: 'od 80. let 20. století', known: 1, styles: ['Q238255'] }
];
const STYLE_BY_KEY = new Map(STYLES.map(style => [style.key, style]));
const STYLE_OF_QID = new Map(STYLES.flatMap(style => style.styles.map(q => [q, style.key])));
// Příliš obecné označení (moderní, středověká, lidová architektura) – sloh neurčí, ale ani mu neodporuje
const VAGUE_STYLES = new Set(['Q245188', 'Q878985', 'Q1349760', 'Q4198718', 'Q186018', 'Q12271', 'Q930314', 'Q12049741', 'Q2864605',
    'Q2494008', 'Q744296', 'Q37068', 'Q3271544', 'Q17012219', 'Q2657199', 'Q192664', 'Q54124', 'Q189548', 'Q163687', 'Q47848', 'Q2860334',
    'Q109280471', 'Q60138']);
// Napodobení a smíšené slohy, které by se počítaly k původnímu (neomaurský sloh není islámská architektura, mudéjar ani národní romantismus secese)
const OTHER_STYLES = new Set(['Q74156', 'Q1077702', 'Q2860353']);
// Slavné stavby, u nichž Wikidata uvádějí vedle hlavního slohu i vedlejší: Sagrada Família je dílo katalánské secese
// (s novogotickými prvky), dům U Černé Matky Boží učebnicová ukázka kubismu (se secesním zábradlím)
const STYLE_OVERRIDES = { Q48435: 'secese', Q2717859: 'kubismus' };
// Dvojice „původní sloh – jeho napodobení“: stavba dostavěná ve stejném duchu (katedrála sv. Víta) patří k původnímu slohu,
// u ostatních dvojic rozhoduje užší sloh (empír, rokoko, novogotika místo historismu)
const MAIN_OF_PAIR = [
    ['gotika', 'novogotika', 'gotika'], ['romansky', 'novoromansky', 'romansky'], ['renesance', 'novorenesance', 'renesance'],
    ['baroko', 'novobaroko', 'baroko'], ['byzantsky', 'novobyzantsky', 'byzantsky'], ['klasicismus', 'empir', 'empir'], ['baroko', 'rokoko', 'rokoko'],
    ...['novogotika', 'novoromansky', 'novorenesance', 'novobaroko', 'novobyzantsky'].map(key => ['historismus', key, key])
];
// Rok vzniku musí sedět k období slohu (s rezervou) – jinak je chybný rok nebo sloh, nebo jde o přestavbu
const STYLE_MARGIN = (style) => style.from < 1000 ? 150 : style.from >= 1890 ? 10 : 60;

const LIMITS = { stavby: { limit: 700, known: 110, czKnown: 35 }, architekti: { limit: 170, known: 50, czLimit: 80, czKnown: 20 } };

// Druh stavby podle českých názvů typů (P31): první pravidlo v pořadí, které některý typ splní
const BUILDING_TYPES = [
    [/katedrál/, 'katedrála'], [/bazilik|basilica/, 'bazilika'], [/mešit/, 'mešita'], [/synagog/, 'synagoga'],
    [/klášter|monastýr|opatství|lávra/, 'klášter'], [/kapl/, 'kaple'], [/kostel|cerkev|kostelík/, 'kostel'], [/chrám/, 'chrám'],
    [/hrad|pevnost|fort/, 'hrad'], [/zámek|letohrádek|rezidence/, 'zámek'], [/palác/, 'palác'], [/radnic/, 'radnice'], [/parlament/, 'budova parlamentu'],
    [/amfiteátr|divadl|opera|odeon|koncertní sál/, 'divadlo'], [/stadion|aréna/, 'stadion'], [/most|viadukt/, 'most'],
    [/mrakodrap|výšková budova/, 'mrakodrap'], [/věž|rozhledna|vysílač|maják/, 'věž'], [/nádraží|stanice/, 'nádraží'],
    [/vítězný oblouk|brán/, 'brána'], [/mauzoleum|hrobka|krematori/, 'hrobka'], [/hradb/, 'hradby'], [/vila/, 'vila'], [/muze|galeri/, 'muzeum'],
    [/knihovn/, 'knihovna'], [/univerzit|škol|akademi/, 'škola'], [/nemocnic/, 'nemocnice'], [/hotel/, 'hotel'],
    [/přehrad/, 'přehrada'], [/obchodní dům|obchodní centrum|bazar|tržnic/, 'obchodní dům'], [/kancelář|administrativní/, 'kancelářská budova'],
    [/dům|budova/, 'budova']
];
// Co není stavba se slohem: socha, obelisk, člověk vždy; náměstí, ulice, zeď či pomník jen tehdy, když není zároveň budovou
// (Karlův most je i ulicí)
const NOT_BUILDING = /^(socha|obrovitá socha|skulptura|člověk|obelisk|hraniční bod)$/;
const NOT_BUILDING_ALONE = /^(náměstí|ulice|park|zahrada|zeď|fontána|pomník|památník)$/;
// Zřícenina středověké a pozdější stavby sloh na fotce neukáže (u antiky je zřícenina běžná)
const RUIN = /zřícenin/;
// Stavby s chybným slohem ve Wikidatech (Leninovo mauzoleum je konstruktivistické, Washingtonův monument obelisk)
// a s nafouknutým počtem jazykových verzí (Aucklandská gramatická škola)
const EXCLUDED = new Set(['Q191414', 'Q178114', 'Q37819', 'Q72738698']);
// Ukázka slohu (obrázek v otázce „Který sloh to je?“): stavba, na které je sloh dobře vidět (ne zřícenina ani interiér)
const EXAMPLES = { recko: 'Q756824', renesance: 'Q205367', klasicismus: 'Q82425', byzantsky: 'Q721817', historismus: 'Q11290', brutalismus: 'Q653858',
    rokoko: 'Q156675', novobyzantsky: 'Q43282', novobaroko: 'Q118618', socrealismus: 'Q167566' };
const CHURCH_TYPES = new Set(['katedrála', 'bazilika', 'kostel', 'kaple', 'klášter', 'opatství', 'chrám']);
const CASTLE_TYPES = new Set(['hrad', 'zámek', 'palác', 'opevnění']);

const countries = readCountries();
// Města ze zeměpisu: první z nich ve správním zařazení stavby (P131) je „město“ (Praha, ne Praha 1 nebo Hradčany)
const zemepis = JSON.parse(readFileSync(new URL('../data/zemepis.json', import.meta.url), 'utf8'));
const CITIES = new Map(zemepis.items.filter(item => item.c === 'mesto').map(item => [item.q, item.n]));
const CITY_POINTS = zemepis.items.filter(item => item.c === 'mesto' && item.la !== undefined);
// Nejbližší město zeměpisu do 12 km (Tower Bridge leží ve čtvrti Tower Hamlets, ale v Londýně)
const nearestCity = (point) => {
    if (!point) return undefined;
    const km = (city) => Math.hypot((city.la - point.lat) * 111, (city.lo - point.lon) * 111 * Math.cos(point.lat * Math.PI / 180));
    const best = CITY_POINTS.reduce((found, city) => !found || km(city) < km(found) ? city : found, null);
    return best && km(best) < 12 ? best.n : undefined;
};

// --- 1. krok: stavby s uvedeným slohem, fotkou a českým článkem (známé ve světě a české i méně známé) ---
const buildingCandidates = await cached('architektura-candidates', async () => {
    const rows = await qlever(`SELECT ?b (MAX(?links) AS ?sl) (MAX(?inCz) AS ?cz) WHERE { ?b wdt:P149 ?s . ?b wdt:P18 ?im .
  ?a schema:about ?b . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?b wikibase:sitelinks ?links .
  BIND(IF(EXISTS { ?b wdt:P17 wd:${CZECHIA} }, 1, 0) AS ?inCz) FILTER(?links >= 15 || (?inCz = 1 && ?links >= 4)) } GROUP BY ?b`);
    return rows.map(row => [id(row.b.value), Number(row.sl.value), Number(row.cz.value)]).sort((a, b) => b[1] - a[1]);
});
// Moderní slohy a barokní gotika mají v Česku hodně staveb jen s několika jazykovými verzemi (kubistické domy, funkcionalistické vily)
const MODERN_CZECH_STYLES = ['barokni-gotika', 'empir', 'secese', 'kubismus', 'artdeco', 'funkcionalismus', 'socrealismus', 'brutalismus', 'postmodernismus', 'hightech', 'dekonstruktivismus'];
const extraCandidates = await cached('architektura-candidates-extra', async () => {
    const styleIds = MODERN_CZECH_STYLES.flatMap(key => STYLE_BY_KEY.get(key).styles);
    const rows = await qlever(`SELECT ?b (MAX(?links) AS ?sl) WHERE { VALUES ?s { ${values(styleIds)} } ?b wdt:P149 ?s . ?b wdt:P18 ?im . ?b wdt:P17 wd:${CZECHIA} .
  ?a schema:about ?b . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?b wikibase:sitelinks ?links } GROUP BY ?b`);
    return rows.map(row => [id(row.b.value), Number(row.sl.value), 1]);
});
const knownCandidates = new Set(buildingCandidates.map(([q]) => q));
buildingCandidates.push(...extraCandidates.filter(([q]) => !knownCandidates.has(q)));
buildingCandidates.sort((a, b) => b[1] - a[1]);
console.log(`Stavby (kandidáti): ${buildingCandidates.length}`);

// --- 2. krok: podrobnosti po dávkách ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1, coord: 1, born: 1, died: 1, sex: 1 };
const fetchDetails = async (list, extra = '') => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, 150, (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  ${extra}
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (key === 'sl') entry.sl = Number(v);
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    return result;
};
const BUILDING_DETAILS = `
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P131 ?v BIND("loc" AS ?p) }
  UNION { ?item wdt:P84 ?v BIND("arch" AS ?p) }
  UNION { ?item wdt:P149 ?v BIND("style" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("year" AS ?p) }
  UNION { ?item wdt:P1619 ?v BIND("open" AS ?p) }
  UNION { ?item wdt:P576 ?v BIND("gone" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P1435 ?v BIND("her" AS ?p) }`;
const buildingDetails = new Map(await cached('architektura-details', async () => [...await fetchDetails(buildingCandidates.map(([q]) => q), BUILDING_DETAILS)]));
// Kandidáti přidaní po uložení mezipaměti se dočtou zvlášť
const missingDetails = buildingCandidates.map(([q]) => q).filter(q => !buildingDetails.has(q));
if (missingDetails.length) {
    for (const [q, detail] of await cached(`architektura-details-extra-${missingDetails.length}`, async () => [...await fetchDetails(missingDetails, BUILDING_DETAILS)])) buildingDetails.set(q, detail);
}

// Sloh, který není v tabulce: patří-li (P279*) k jedinému slohu z tabulky (cihlová gotika, brabantská gotika), počítá se k němu
const usedStyles = [...new Set([...buildingDetails.values()].flatMap(detail => detail.style || []))];
const unknownStyles = usedStyles.filter(q => /^Q\d+$/.test(q) && !STYLE_OF_QID.has(q) && !VAGUE_STYLES.has(q));
const styleParents = new Map(await cached('architektura-style-parents', async () => {
    const found = new Map(unknownStyles.map(q => [q, []]));
    await inBatches(unknownStyles, 200, (qids) => `SELECT ?s ?root WHERE { VALUES ?s { ${values(qids)} } VALUES ?root { ${values([...STYLE_OF_QID.keys()])} } ?s wdt:P279+ ?root }`,
        (row) => found.get(id(row.s.value)).push(id(row.root.value)), qlever);
    return [...found];
}));
const styleKeyOf = (q) => {
    if (STYLE_OF_QID.has(q)) return STYLE_OF_QID.get(q);
    if (VAGUE_STYLES.has(q)) return null;
    if (OTHER_STYLES.has(q)) return 'jiny';
    const keys = new Set((styleParents.get(q) || []).map(root => STYLE_OF_QID.get(root)));
    return keys.size === 1 ? [...keys][0] : 'jiny';
};

// Jen stavby (P31/P279* architektonická struktura) – sloh mívají ve Wikidatech i města (Ålesund) nebo náměstí
const structureQuery = (list) => async () => {
    const found = [];
    await inBatches(list, 300, (qids) => `SELECT DISTINCT ?b WHERE { VALUES ?b { ${values(qids)} } ?b wdt:P31/wdt:P279* wd:Q811979 }`,
        (row) => found.push(id(row.b.value)), qlever);
    return found;
};
const structures = new Set(await cached('architektura-structures', structureQuery(buildingCandidates.filter(([q]) => !missingDetails.includes(q)).map(([q]) => q))));
if (missingDetails.length) for (const q of await cached(`architektura-structures-extra-${missingDetails.length}`, structureQuery(missingDetails))) structures.add(q);

// --- 3. krok: správní zařazení (pro město) ---
const parentsOf = new Map(await cached('architektura-admin', async () => {
    const parents = new Map();
    let level = [...new Set([...buildingDetails.values()].flatMap(detail => detail.loc || []))].filter(q => /^Q\d+$/.test(q));
    for (let depth = 0; depth < 4 && level.length; depth++) {
        const next = new Set();
        await inBatches(level, 300, (qids) => `SELECT ?x ?p WHERE { VALUES ?x { ${values(qids)} } ?x wdt:P131 ?p }`, (row) => {
            const x = id(row.x.value);
            const p = id(row.p.value);
            parents.set(x, [...(parents.get(x) || []), p]);
            if (!parents.has(p)) next.add(p);
        }, qlever);
        level = [...next].filter(q => !parents.has(q));
    }
    return [...parents];
}));

// --- 4. krok: architekti (povoláním architekt, s českým článkem) a autoři staveb ---
const architectCandidates = await cached('architektura-architects', async () => {
    const rows = await qlever(`SELECT DISTINCT ?p ?sl WHERE { ?p wdt:P106 wd:${ARCHITECT} . ?a schema:about ?p . ?a schema:isPartOf <https://cs.wikipedia.org/> .
  ?p wikibase:sitelinks ?sl . FILTER(?sl >= 12) }`);
    return rows.map(row => [id(row.p.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);
});
const isQid = (q) => /^Q\d+$/.test(q);
const authorIds = [...new Set([...buildingDetails.values()].flatMap(detail => detail.arch || []))].filter(isQid);
const personIds = [...new Set([...architectCandidates.map(([q]) => q), ...authorIds])];
const PERSON_DETAILS = `
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P19/wdt:P17 ?v BIND("bornIn" AS ?p) }
  UNION { ?item wdt:P106 ?v BIND("occ" AS ?p) }
  UNION { ?item wdt:P800 ?v BIND("work" AS ?p) }
  UNION { ?item wdt:P135 ?v BIND("movement" AS ?p) }`;
const personDetails = new Map(await cached('architektura-people', async () => [...await fetchDetails(personIds, PERSON_DETAILS)]));

// --- 5. krok: slohy (článek, popis, obrázek) a české názvy odkazovaných položek ---
const styleDetails = new Map(await cached('architektura-styles', async () => [...await fetchDetails(STYLES.map(style => style.q))]));
const referenced = [...new Set([
    ...[...buildingDetails.values()].flatMap(detail => [...(detail.loc || []), ...(detail.type || [])]),
    ...[...parentsOf.values()].flat(),
    ...[...personDetails.values()].flatMap(detail => [...(detail.cit || []), ...(detail.work || [])])
])].filter(isQid);
const labels = new Map(await cached('architektura-labels', async () => {
    const result = [];
    await inBatches(referenced, 400, (qids) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
        (row) => result.push([id(row.item.value), row.l.value]), qlever);
    return result;
}));
const cs = (qid) => labels.get(qid);


// --- Stavby ---
const THIS_YEAR = new Date().getFullYear();
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s*\(.*\)$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const minYear = (list) => {
    const years = (list || []).map(yearOf).filter(year => year !== undefined);
    return years.length ? Math.min(...years) : undefined;
};
// Hlavní sloh stavby: jediný sloh z tabulky (nebo dvojice původní – napodobený), jinak null (víc slohů, přestavba)
const mainStyleOf = (qid, detail) => {
    if (STYLE_OVERRIDES[qid]) return STYLE_OVERRIDES[qid];
    const keys = new Set((detail.style || []).map(styleKeyOf).filter(Boolean));
    if (keys.has('jiny')) return null;
    for (const [a, b, main] of MAIN_OF_PAIR) {
        if (keys.has(a) && keys.has(b)) {
            keys.delete(a);
            keys.delete(b);
            keys.add(main);
        }
    }
    return keys.size === 1 ? [...keys][0] : null;
};
const fitsStyle = (year, style) => year !== undefined && year <= THIS_YEAR
    && year >= style.from - STYLE_MARGIN(style) && year <= style.to + STYLE_MARGIN(style);
// Rok vzniku (P571), když nesedí ke slohu, pak rok otevření (Ještěd: chata 1901, dnešní stavba 1973); null = rok odporuje slohu
const yearFor = (detail, style) => {
    const founded = minYear(detail.year);
    if (fitsStyle(founded, style)) return founded;
    const opened = minYear(detail.open);
    if (fitsStyle(opened, style)) return opened;
    return founded === undefined && opened === undefined ? undefined : null;
};
const typeLabels = (detail) => (detail.type || []).map(cs).filter(Boolean).map(label => label.toLowerCase());
const typeOf = (detail) => {
    const types = typeLabels(detail);
    const found = BUILDING_TYPES.find(([pattern]) => types.some(label => pattern.test(label)));
    return found ? found[1] : 'stavba';
};
const isBuilding = (detail, style) => {
    const types = typeLabels(detail);
    if (types.some(label => NOT_BUILDING.test(label)) || (style.from >= 1000 && types.some(label => RUIN.test(label)))) return false;
    return !types.some(label => NOT_BUILDING_ALONE.test(label)) || typeOf(detail) !== 'stavba';
};
// Město: první město zeměpisu ve správním zařazení (do pěti úrovní), jinak obec, ve které stavba leží
const cityOf = (detail, point) => {
    const direct = (detail.loc || []).filter(isQid);
    let level = direct;
    for (let depth = 0; depth < 5 && level.length; depth++) {
        const city = level.find(q => CITIES.has(q));
        if (city) return CITIES.get(city);
        level = level.flatMap(q => parentsOf.get(q) || []);
    }
    const near = nearestCity(point);
    if (near) return near;
    const label = direct.map(cs).find(Boolean);
    return label && !/\d|obvod|okres|kraj|distrikt|čtvrť|provincie|region|hrabství|oblast/iu.test(label) ? label : undefined;
};

const bareName = (detail) => capitalize(detail.n || detail.t.replace(/ \(.*\)$/, ''));
const kept = [];
for (const [qid, sl] of buildingCandidates) {
    const detail = buildingDetails.get(qid);
    if (!detail || !detail.t || !detail.im || detail.gone || !structures.has(qid) || EXCLUDED.has(qid)) continue;
    const key = mainStyleOf(qid, detail);
    if (!key || !isBuilding(detail, STYLE_BY_KEY.get(key))) continue;
    const year = yearFor(detail, STYLE_BY_KEY.get(key));
    if (year === null) continue;
    kept.push({ qid, sl, detail, key, year, cz: (detail.co || []).includes(CZECHIA) });
}
const bareCounts = new Map();
for (const { detail } of kept) bareCounts.set(normalize(bareName(detail)), (bareCounts.get(normalize(bareName(detail))) || 0) + 1);
// Ze světa ty nejznámější, z Česka i méně známé; malé slohy (kubismus, antika) celé
const styleCounts = {};
for (const entry of kept) styleCounts[entry.key] = (styleCounts[entry.key] || 0) + 1;
const WORLD_LIMIT = 430;
const CZECH_LIMIT = 270;
const SMALL_STYLE = 25;
// Z Česka nejvýš tolik staveb jednoho slohu – jinak by zbytek zabraly barokní a gotické kostely
const CZECH_STYLE_LIMIT = 55;
const czechPerStyle = {};
let worldRank = 0;
let czechRank = 0;
const names = new Set();
const buildings = [];
const zemepisKnown = new Set(zemepis.items.filter(item => item.k === 1).map(item => item.q));
for (const entry of kept) {
    const { qid, detail, key, year, cz } = entry;
    const small = styleCounts[key] <= SMALL_STYLE;
    if ((cz ? czechRank >= CZECH_LIMIT || (czechPerStyle[key] || 0) >= CZECH_STYLE_LIMIT : worldRank >= WORLD_LIMIT) && !small) continue;
    // Jedna položka na název: stavby stejného jména (Pantheon, kostel Všech svatých) dostanou název článku s upřesněním
    let name = bareName(detail);
    if (/^Q\d+$/.test(name)) continue;
    if (bareCounts.get(normalize(name)) > 1 && /\(.+\)$/.test(detail.t)) name = detail.t;
    else if (names.has(normalize(name))) name = detail.t;
    if (names.has(name.toLowerCase())) continue;
    names.add(normalize(name));
    names.add(name.toLowerCase());
    const rank = cz ? czechRank++ : worldRank++;
    if (cz) czechPerStyle[key] = (czechPerStyle[key] || 0) + 1;
    // QLever píše „POINT(…)“ velkými písmeny
    const point = parsePoint((detail.coord || '').replace(/^POINT/i, 'Point'));
    const authors = (detail.arch || []).filter(isQid);
    const authorNames = authors.map(q => (personDetails.get(q) || {}).n).filter(Boolean);
    buildings.push({
        q: qid,
        t: detail.t,
        n: name,
        c: 'stavby',
        // Známé: známé památky zeměpisu, nejznámější ze světa a z Česka a dvě nejznámější české stavby každého slohu (kubistický dům U Černé Matky Boží)
        k: zemepisKnown.has(qid) || (cz ? rank < LIMITS.stavby.czKnown || (czechPerStyle[key] <= 2 && entry.sl >= 8) : rank < LIMITS.stavby.known) ? 1 : 0,
        // Obecné „stavba“ nic neřekne (a mezi možnostmi by spojovalo nesouvisející stavby)
        ty: typeOf(detail) === 'stavba' ? undefined : typeOf(detail),
        d: detail.d,
        cz: cz ? 1 : undefined,
        la: point ? point.lat : undefined,
        lo: point ? point.lon : undefined,
        co: (detail.co || []).filter(q => countries[q]),
        ...imageFields(detail.im),
        f: compact({
            st: key,
            y: year,
            // Autoři jen celí (bez nepojmenovaných), jediný autor i s odkazem na položku
            arch: authorNames.length && authorNames.length === authors.length ? authorNames.join(', ') : undefined,
            aq: authors.length === 1 && authorNames.length === 1 ? authors[0] : undefined,
            city: cityOf(detail, point),
            unesco: (detail.her || []).includes(WORLD_HERITAGE_SITE) ? 1 : undefined,
            // Vedlejší slohy (Sagrada Família má i novogotické prvky) – mezi nesprávnými možnostmi nesmí být
            no: STYLE_OVERRIDES[qid] ? [...new Set((detail.style || []).map(styleKeyOf).filter(other => other && other !== 'jiny' && other !== key))] : undefined
        }),
        sl: entry.sl
    });
}

// --- Architekti ---
const isFemale = (detail) => (detail.sex || '') === FEMALE;
const designed = new Map();
for (const building of buildings) {
    for (const q of (buildingDetails.get(building.q).arch || []).filter(isQid)) designed.set(q, [...(designed.get(q) || []), building]);
}
const knownBuildingAuthors = new Set([...designed].filter(([, list]) => list.some(building => building.k === 1)).map(([q]) => q));
// Čeští architekti: občanstvím, narozením, popisem („český architekt“, „rakousko-český“) nebo stavbou v Česku
const isCzechPerson = (q, detail) => (detail.cit || []).some(c => CZECH_STATES.has(c)) || (detail.bornIn || []).includes(CZECHIA)
    || /(?<!\p{L})(?:česk|[\p{L}]+-česk)/iu.test(detail.d || '') || CZECH_WORK.has(q) || (designed.get(q) || []).some(building => building.cz === 1);
// Sloh architekta: podle jeho staveb v datech (převažující), jinak podle hnutí (P135), když ho určí jednoznačně
const styleOfArchitect = (q, detail) => {
    const counts = {};
    // Jen stavby, které navrhl sám (restaurátor gotické katedrály není gotický architekt)
    for (const building of (designed.get(q) || []).filter(other => other.f.aq === q)) counts[building.f.st] = (counts[building.f.st] || 0) + 1;
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (ranked.length) return ranked.length === 1 || ranked[0][1] > ranked[1][1] ? ranked[0][0] : undefined;
    const keys = new Set((detail.movement || []).map(styleKeyOf).filter(key => key && key !== 'jiny'));
    return keys.size === 1 ? [...keys][0] : undefined;
};
const countryName = (detail) => {
    const list = (detail.cit || []).filter(isQid);
    const current = list.find(q => countries[q]);
    return current ? countries[current].name : list.map(cs).find(Boolean);
};
// Známí jinak než stavbami (diplomat Wallenberg, umělec Aj Wej-wej, plavec Hajós, filolog Ventris, Olena Zelenská)
const NOT_ARCHITECTS = new Set(['Q59321885', 'Q160115', 'Q152850', 'Q313443', 'Q92601', 'Q259378']);
// Cizí architekti, kteří navrhli slavné stavby v Česku (Plečnik: úpravy Pražského hradu, kostel Nejsvětějšího Srdce Páně)
const CZECH_WORK = new Set(['Q314886']);
const people = [...personDetails]
    .map(([q, detail]) => ({ q, detail, sl: detail.sl || 0, cz: isCzechPerson(q, detail) }))
    // Povolání „architekt“ mají ve Wikidatech i malíři a politici (Washington, Jefferson, Wallenberg) – architektem musí být
    // hlavně (první povolání v popisu: „český architekt“), nebo navrhl některou stavbu v datech (Michelangelo)
    .filter(({ q, detail }) => detail.t && detail.n && yearOf(detail.born) !== undefined && !NOT_ARCHITECTS.has(q)
        && (/^[\p{L}-]+(?: [\p{L}-]+)? architekt/iu.test(detail.d || '') || (designed.has(q) && /architekt/iu.test(detail.d || ''))))
    .sort((a, b) => b.sl - a.sl);
const architects = [];
let czechArchitectRank = 0;
for (const { q, detail, sl, cz } of people) {
    const born = yearOf(detail.born);
    const died = yearOf(detail.died);
    // Data narození a úmrtí bez rozporů, žádná budoucnost
    if (born > THIS_YEAR - 20 || (died !== undefined && (died <= born || died > THIS_YEAR || died - born > 110))) continue;
    const famous = cz ? sl >= 6 || designed.has(q) : sl >= 25 || knownBuildingAuthors.has(q) || (designed.get(q) || []).length >= 2;
    const full = cz ? czechArchitectRank >= LIMITS.architekti.czLimit : architects.length - czechArchitectRank >= LIMITS.architekti.limit;
    if (!famous || full || names.has(normalize(detail.n))) continue;
    names.add(normalize(detail.n));
    // Nejznámější stavba (u českého architekta česká – Parléř je autorem katedrály sv. Víta, ne kolínské)
    const own = [...(designed.get(q) || [])].sort((a, b) => (cz ? (b.cz || 0) - (a.cz || 0) : 0) || b.sl - a.sl);
    const czRank = cz ? czechArchitectRank++ : 0;
    architects.push({
        q,
        t: detail.t,
        n: detail.n,
        c: 'architekti',
        k: (!cz && architects.length - czechArchitectRank < LIMITS.architekti.known) || knownBuildingAuthors.has(q) || (cz && czRank < LIMITS.architekti.czKnown) ? 1 : 0,
        ty: isFemale(detail) ? 'architektka' : 'architekt',
        sx: isFemale(detail) ? 'f' : undefined,
        d: detail.d,
        cz: cz ? 1 : undefined,
        ...imageFields(detail.im),
        f: compact({
            born, died, land: countryName(detail), st: styleOfArchitect(q, detail),
            work: own.length ? own[0].n : undefined, y: born + 35
        })
    });
}
// Otázka „Kdo ji navrhl?“ jen u architekta, který je mezi položkami
const architectIds = new Set(architects.map(item => item.q));
for (const building of buildings) if (building.f.aq && !architectIds.has(building.f.aq)) delete building.f.aq;

// --- Slohy: ukázkou je nejznámější stavba slohu ---
const styles = [];
for (const style of STYLES) {
    const detail = styleDetails.get(style.q);
    const examples = buildings.filter(building => building.f.st === style.key).sort((a, b) => b.sl - a.sl);
    if (!detail || !detail.t || examples.length < 3) continue;
    const example = examples.find(building => building.q === EXAMPLES[style.key]) || examples.find(building => building.k === 1) || examples[0];
    styles.push({
        q: style.q,
        t: detail.t,
        n: style.name,
        c: 'slohy',
        k: style.known,
        ty: 'sloh',
        d: detail.d,
        im: example.im,
        ih: example.ih,
        f: { key: style.key, from: style.from, to: style.to, per: style.period, ex: example.n, y: style.from }
    });
}
const styleKeys = new Set(styles.map(style => style.f.key));
const items = [...styles, ...buildings.filter(building => styleKeys.has(building.f.st)), ...architects];
for (const item of items) {
    delete item.sl;
    if (item.f.st && !styleKeys.has(item.f.st)) delete item.f.st;
}

// --- Okruhy ---
const IN_PRAGUE = (item) => item.la >= 49.94 && item.la <= 50.18 && item.lo >= 14.22 && item.lo <= 14.71;
const styleOf = (item) => item.c === 'slohy' ? item.f.key : item.f.st;
const byStyles = (...keys) => (item) => keys.includes(styleOf(item));
const BY_YEAR = { by: 'y' };
const COLLECTIONS = [
    { id: 'cesko', label: 'Česká architektura', text: 'Stavby v Česku a čeští architekti', sort: BY_YEAR, test: item => item.cz === 1 },
    { id: 'praha', label: 'Praha', text: 'Stavby v Praze', sort: BY_YEAR, test: item => item.c === 'stavby' && item.cz === 1 && IN_PRAGUE(item) },
    { id: 'cesti-architekti', label: 'Čeští architekti', sort: BY_YEAR, test: item => item.c === 'architekti' && item.cz === 1 },
    { id: 'unesco', label: 'Světové dědictví UNESCO', sort: BY_YEAR, test: item => item.c === 'stavby' && item.f.unesco === 1 },
    { id: 'hrady-zamky', label: 'Hrady, zámky a paláce', sort: BY_YEAR, test: item => item.c === 'stavby' && CASTLE_TYPES.has(item.ty) },
    { id: 'chramy', label: 'Kostely, kláštery a mešity', sort: BY_YEAR,
        test: item => item.c === 'stavby' && (CHURCH_TYPES.has(item.ty) || ['mešita', 'synagoga'].includes(item.ty)) },
    { id: 'starovek', label: 'Antika a Byzanc', text: 'Řecká a římská antika, byzantský sloh', sort: BY_YEAR, test: byStyles('recko', 'rim', 'byzantsky') },
    { id: 'islamska', label: 'Islámská architektura', sort: BY_YEAR, test: byStyles('islamska') },
    { id: 'romansky', label: 'Románský sloh', sort: BY_YEAR, test: byStyles('romansky') },
    { id: 'gotika', label: 'Gotika', sort: BY_YEAR, test: byStyles('gotika') },
    { id: 'renesance', label: 'Renesance', sort: BY_YEAR, test: byStyles('renesance') },
    { id: 'baroko', label: 'Baroko a rokoko', text: 'I barokní gotika', sort: BY_YEAR, test: byStyles('baroko', 'rokoko', 'barokni-gotika') },
    { id: 'klasicismus', label: 'Klasicismus a empír', sort: BY_YEAR, test: byStyles('klasicismus', 'empir') },
    { id: 'historismus', label: 'Historismus', text: 'Novogotika, novorenesance, novobaroko…', sort: BY_YEAR,
        test: byStyles('historismus', 'novogotika', 'novoromansky', 'novorenesance', 'novobaroko', 'novobyzantsky') },
    { id: 'secese', label: 'Secese', sort: BY_YEAR, test: byStyles('secese') },
    { id: 'moderna', label: 'Moderna 20. století', text: 'Kubismus, art deco, funkcionalismus, socialistický realismus', sort: BY_YEAR,
        test: byStyles('kubismus', 'artdeco', 'funkcionalismus', 'socrealismus') },
    { id: 'soucasna', label: 'Současná architektura', text: 'Brutalismus, postmodernismus, high-tech, dekonstruktivismus', sort: BY_YEAR,
        test: byStyles('brutalismus', 'postmodernismus', 'hightech', 'dekonstruktivismus') }
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

for (const category of ['slohy', 'stavby', 'architekti']) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.cz).length} českých)`);
}
const perStyle = {};
for (const item of items.filter(item => item.c === 'stavby')) perStyle[item.f.st] = (perStyle[item.f.st] || 0) + 1;
console.log('stavby podle slohu:', JSON.stringify(perStyle));
console.log(`otázka na architekta možná u ${items.filter(item => item.f.aq).length} staveb`);
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('architektura', { collections, items });
