// Téma Výtvarné umění: data/umeni.json z Wikidat – obrazy, sochy, malíři a sochaři
// Spuštění: npm run build:umeni (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { sparql, qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';

const PAINTING = 'Q3305213';
const HUMAN = 'Q5';
const FEMALE = 'Q6581072';
// Další druhy obrazů, které nejsou podtřídou malby: cyklus a skupina obrazů (Slovanská epopej, Výkřik), freska, nástěnná malba, ikona, kresba
const PAINTING_TYPES = ['Q16905563', 'Q18573970', 'Q15727816', 'Q134194', 'Q99516640', 'Q132137', 'Q93184'];
// Sochy: socha, skulptura, sousoší, plastika, bronzová, mramorová a jezdecká socha, busta, obří a monumentální socha, figurka,
// pravěká venuše, Velký Buddha, reliéf, soubor odlitků (Rodinův Myslitel)
const SCULPTURE_TYPES = ['Q179700', 'Q860861', 'Q2293362', 'Q350268', 'Q928357', 'Q837249', 'Q659396', 'Q241045', 'Q1779653', 'Q3476533',
    'Q1066288', 'Q248726', 'Q1051606', 'Q245117', 'Q28890616', 'Q29168168'];
// Povolání: malíř, sochař, grafik, rytec, kreslíř
const ARTIST_OCCUPATIONS = ['Q1028181', 'Q1281618', 'Q1925963', 'Q329439', 'Q15296811'];
// Státy českých dějin (Rakousko-Uhersko ne – patřil by sem i Klimt)
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q153136']);

const csArticle = (variable) => `?a schema:about ${variable} . ?a schema:isPartOf <https://cs.wikipedia.org/> . ${variable} wikibase:sitelinks ?sl .`;
const fromRows = (rows) => rows.map(row => [id(row.x.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);

// --- 1. krok: kandidáti (přes QLever – strom podtříd malby by query.wikidata.org nezvládly) ---
const candidates = await cached('umeni-candidates', async () => {
    const paintings = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE {
  { ?x wdt:P31/wdt:P279* wd:${PAINTING} } UNION { VALUES ?type { ${values(PAINTING_TYPES)} } ?x wdt:P31 ?type }
  ?x wdt:P18 ?image . ${csArticle('?x')} }`));
    const sculptures = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(SCULPTURE_TYPES)} } ?x wdt:P31 ?type .
  ?x wdt:P18 ?image . ${csArticle('?x')} FILTER NOT EXISTS { ?x wdt:P279 ?class } }`));
    const artists = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?occ { ${values(ARTIST_OCCUPATIONS)} } ?x wdt:P106 ?occ ; wdt:P31 wd:${HUMAN} .
  ${csArticle('?x')} FILTER(?sl >= 12) }`));
    // Čeští umělci i méně známí (stačí pár jazyků)
    const czechArtists = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?occ { ${values(ARTIST_OCCUPATIONS)} } VALUES ?state { ${values([...CZECH_STATES])} }
  ?x wdt:P106 ?occ ; wdt:P27 ?state ; wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= 4) }`));
    return { paintings, sculptures, artists: [...new Map([...artists, ...czechArtists])].sort((a, b) => b[1] - a[1]) };
});
// Čeští umělci 19. století mají ve Wikidatech často jen Rakouské císařství, Předlitavsko nebo Svatou říši římskou –
// zda jsou čeští, rozhodne až popis
const OLD_STATES = ['Q131964', 'Q28513', 'Q699964', 'Q12548', 'Q268970'];
const oldCzech = await cached('umeni-old-czech', async () => fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE {
  VALUES ?occ { ${values(ARTIST_OCCUPATIONS)} } VALUES ?state { ${values(OLD_STATES)} } ?x wdt:P106 ?occ ; wdt:P27 ?state ; wdt:P31 wd:${HUMAN} .
  ?x schema:description ?desc FILTER(LANG(?desc) = "cs" && REGEX(?desc, "^(český|česká|moravský|moravská)", "i")) ${csArticle('?x')} FILTER(?sl >= 4) }`)));
for (const entry of oldCzech) if (!candidates.artists.some(([qid]) => qid === entry[0])) candidates.artists.push(entry);
candidates.artists.sort((a, b) => b[1] - a[1]);
console.log(`Kandidáti: ${candidates.paintings.length} obrazů, ${candidates.sculptures.length} soch, ${candidates.artists.length} umělců`);

// --- 2. krok: podrobnosti po dávkách ---
const SINGLE = { t: 1, n: 1, d: 1, en: 1, im: 1, born: 1, died: 1, sex: 1 };
const collect = (result) => (row) => {
    const entry = result.get(id(row.item.value));
    const key = row.p.value;
    if (!row.v) return;
    const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
    // Vznik díla i s přesností (9 = rok, 8 = desetiletí, 7 = století) a kvalifikátorem „kolem roku“ či „nejpozději“
    if (key === 'year') entry.year = [...(entry.year || []), { v, prec: Number(row.prec ? row.prec.value : 9), q: row.q ? id(row.q.value) : '' }];
    // Autor i s kvalifikátorem povahy údaje (připisováno, možná) – takový autor není jistý
    else if (key === 'cr') entry.cr = [...(entry.cr || []), { id: v, q: row.q ? id(row.q.value) : '' }];
    else if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
    else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
};
const workDetails = (qids) => `SELECT ?item ?p ?v ?prec ?q WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item p:P170 ?s . ?s ps:P170 ?v . OPTIONAL { ?s pq:P5102|pq:P1480 ?q } BIND("cr" AS ?p) }
  UNION { ?item wdt:P1773 ?v BIND("attr" AS ?p) }
  UNION { ?item p:P571 ?s . ?s psv:P571 ?node . ?node wikibase:timeValue ?v ; wikibase:timePrecision ?prec . OPTIONAL { ?s pq:P1480|pq:P5102 ?q } BIND("year" AS ?p) }
  UNION { ?item wdt:P135 ?v BIND("mov" AS ?p) }
  UNION { ?item wdt:P195 ?v BIND("coll" AS ?p) }
  UNION { ?item wdt:P276 ?v BIND("loc" AS ?p) }
  UNION { ?item wdt:P186 ?v BIND("mat" AS ?p) }
  UNION { ?item wdt:P136 ?v BIND("genre" AS ?p) }
  UNION { ?item wdt:P495 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("land" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
}`;
const personDetails = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "en") BIND("en" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P135 ?v BIND("mov" AS ?p) }
  UNION { ?item wdt:P800 ?v BIND("works" AS ?p) }
  UNION { ?item wdt:P106 ?v BIND("occ" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
}`;
const fetchDetails = async (list, query, size) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, size, query, collect(result));
    return [...result];
};
const workIds = [...candidates.paintings, ...candidates.sculptures].map(([qid]) => qid);
const works = new Map(await cached('umeni-works', () => fetchDetails(workIds, workDetails, 60)));
// Autoři děl patří k umělcům, i když sami nejsou mezi kandidáty (nápověda a možnosti u otázky „Kdo to vytvořil?“)
const creatorIds = [...new Set([...works.values()].flatMap(work => (work.cr || []).map(creator => creator.id)))].filter(q => /^Q\d+$/.test(q));
const personIds = [...new Set([...candidates.artists.map(([qid]) => qid), ...creatorIds])];
const people = new Map(await cached('umeni-people', () => fetchDetails(personIds, personDetails, 100)));
// Kandidáti přidaní po uložení mezipaměti se dočtou zvlášť
const missingPeople = personIds.filter(qid => !people.has(qid));
for (const [qid, detail] of await cached('umeni-people-extra', () => fetchDetails(missingPeople, personDetails, 100))) people.set(qid, detail);
console.log(`Podrobnosti: ${works.size} děl, ${people.size} osob`);

// České (a anglické) názvy odkazovaných položek: směry, sbírky, místa, materiály, žánry, země, druhy
const referenced = new Set();
for (const work of works.values()) for (const key of ['mov', 'coll', 'loc', 'mat', 'genre', 'co', 'land', 'type', 'attr']) (work[key] || []).forEach(q => referenced.add(q));
for (const person of people.values()) for (const key of ['cit', 'mov', 'works', 'occ']) (person[key] || []).forEach(q => referenced.add(q));
for (const q of referenced) if (!/^Q\d+$/.test(q)) referenced.delete(q);
const labels = new Map(await cached('umeni-labels', async () => {
    const result = [];
    await inBatches([...referenced], 300, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]));
    return result;
}));
// Názvy položek, na které odkazují dočtení umělci
const missingLabels = [...new Set([...people.values()].flatMap(person => ['cit', 'mov', 'works', 'occ'].flatMap(key => person[key] || [])))]
    .filter(qid => /^Q\d+$/.test(qid) && !labels.has(`cs:${qid}`) && !labels.has(`en:${qid}`));
for (const [key, label] of await cached('umeni-labels-extra', async () => {
    const result = [];
    await inBatches(missingLabels, 300, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]));
    return result;
})) labels.set(key, label);
const cs = (qid) => labels.get(`cs:${qid}`);
const en = (qid) => labels.get(`en:${qid}`) || '';

// Jména jen v mezinárodní podobě: Picasso a další mají místo českého štítku jen „mul“
const missingNames = [...works, ...people].filter(([, detail]) => !detail.n).map(([qid]) => qid);
const mulNames = await cached('umeni-mul', async () => {
    const result = [];
    await inBatches(missingNames, 300, (qids) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "mul") }`,
        (row) => result.push([id(row.item.value), row.l.value]));
    return result;
});
for (const [qid, name] of mulNames) for (const map of [works, people]) if (map.has(qid) && !map.get(qid).n) map.get(qid).n = name;
// Název bez upřesnění v závorce („Astronom (Vermeer)“ → Astronom), s velkým písmenem
const nameOf = (detail) => {
    const name = (detail.n || detail.t || '').replace(/ \(.*\)$/, '');
    return name.charAt(0).toUpperCase() + name.slice(1);
};
const sitelinks = new Map([...candidates.paintings, ...candidates.sculptures, ...candidates.artists]);

// --- 3. krok: pravidla ---
// Umělecké směry: podrobný směr z Wikidat → hrubé období (okruhy, nesprávné možnosti, otázka na směr);
// question = směr, na který se dá ptát (od sousedních se jasně liší), from–to = kdy dílo toho směru mohlo vzniknout
const MOVEMENTS = [
    { key: 'gotika', ids: ['Q46825', 'Q867769', 'Q19595137', 'Q1332178', 'Q1277524', 'Q1197938'], from: 1140, to: 1530, question: true },
    { key: 'renesance', ids: ['Q4692', 'Q1474884', 'Q1472236', 'Q1404472', 'Q2455000', 'Q610877', 'Q913340'], from: 1400, to: 1600, question: true },
    // Rané nizozemské malířství (van Eyck) bývá řazeno ke gotice i k renesanci, benátská škola sahá až do 18. století – jen okruh
    { key: 'renesance', ids: ['Q443153', 'Q610687'], from: 1400, to: 1600 },
    { key: 'manyrismus', ids: ['Q131808', 'Q584084'], from: 1520, to: 1620 },
    { key: 'baroko', ids: ['Q37853', 'Q2352880', 'Q6076361', 'Q808561', 'Q6076358', 'Q1994273'], from: 1590, to: 1760, question: true },
    { key: 'rokoko', ids: ['Q122960', 'Q5668507'], from: 1720, to: 1790 },
    { key: 'klasicismus', ids: ['Q14378', 'Q170292', 'Q577147'], from: 1750, to: 1850, question: true },
    { key: 'romantismus', ids: ['Q37068', 'Q3088366', 'Q2477112'], from: 1780, to: 1870, question: true },
    { key: 'realismus', ids: ['Q10857409', 'Q2642826', 'Q109260', 'Q143357'], from: 1830, to: 1900, question: true },
    { key: 'akademismus', ids: ['Q189458'], from: 1800, to: 1910 },
    { key: 'impresionismus', ids: ['Q40415'], from: 1860, to: 1926, question: true },
    { key: 'postimpresionismus', ids: ['Q166713', 'Q150091', 'Q200034', 'Q382056', 'Q889525', 'Q847847', 'Q503708', 'Q2487023'], from: 1880, to: 1910 },
    { key: 'symbolismus', ids: ['Q164800', 'Q184814'], from: 1850, to: 1920 },
    { key: 'secese', ids: ['Q34636', 'Q208208'], from: 1890, to: 1915, question: true },
    { key: 'expresionismus', ids: ['Q80113'], from: 1905, to: 1935, question: true },
    { key: 'kubismus', ids: ['Q42934'], from: 1907, to: 1925, question: true },
    { key: 'avantgarda', ids: ['Q166593', 'Q131221', 'Q6034', 'Q519443', 'Q617166'], from: 1905, to: 1930 },
    { key: 'surrealismus', ids: ['Q39427'], from: 1920, to: 1970, question: true },
    { key: 'abstrakce', ids: ['Q128115', 'Q177725', 'Q217213', 'Q191970', 'Q845421', 'Q207445', 'Q207103', 'Q182331', 'Q173436'], from: 1910, to: 1990 },
    { key: 'popart', ids: ['Q134147'], from: 1955, to: 1975, question: true }
];
const movementOf = (qid) => MOVEMENTS.find(movement => movement.ids.includes(qid));
const movementKeys = (qids = []) => [...new Set(qids.map(movementOf).filter(Boolean).map(movement => movement.key))];
// Směr díla pro otázku: právě jeden jasný směr a rok vzniku do něj sedí
const styleOf = (qids = [], year) => {
    const found = [...new Set(qids.map(movementOf).filter(Boolean))];
    if (new Set(found.map(movement => movement.key)).size !== 1 || year === undefined) return undefined;
    return found.every(movement => movement.question && year >= movement.from && year <= movement.to) ? found[0].key : undefined;
};

// Muzea: sbírka nebo místo → okruh a krátký český název
const MUSEUMS = {
    louvre: { label: 'Louvre', ids: ['Q19675', 'Q3044768', 'Q3044753', 'Q3044747', 'Q3044749', 'Q3044772', 'Q3044750'] },
    orsay: { label: 'Musée d’Orsay', ids: ['Q23402'] },
    prado: { label: 'Prado', ids: ['Q160112'] },
    uffizi: { label: 'Galerie Uffizi', ids: ['Q51252'] },
    vatikan: { label: 'Vatikánská muzea', ids: ['Q182955', 'Q2943', 'Q774940'] },
    'ng-londyn': { label: 'Národní galerie v Londýně', ids: ['Q180788'] },
    metropolitan: { label: 'Metropolitní muzeum v New Yorku', ids: ['Q160236'] },
    ermitaz: { label: 'Ermitáž', ids: ['Q132783'] },
    rijksmuseum: { label: 'Rijksmuseum', ids: ['Q190804'] },
    'ng-praha': { label: 'Národní galerie v Praze', ids: ['Q1419555', 'Q394832', 'Q496259'] },
    khm: { label: 'Uměleckohistorické muzeum ve Vídni', ids: ['Q95569'] },
    tretjakovska: { label: 'Treťjakovská galerie', ids: ['Q183334'] },
    moma: { label: 'MoMA v New Yorku', ids: ['Q188740'] },
    drazdany: { label: 'Galerie starých mistrů v Drážďanech', ids: ['Q653002', 'Q4890'] },
    washington: { label: 'Národní galerie ve Washingtonu', ids: ['Q214867'] },
    'ruske-muzeum': { label: 'Ruské muzeum v Petrohradu', ids: ['Q211043'] },
    mauritshuis: { label: 'Mauritshuis', ids: ['Q221092'] },
    berlin: { label: 'Obrazárna v Berlíně', ids: ['Q165631'] },
    chicago: { label: 'Art Institute of Chicago', ids: ['Q239303'] },
    'kapitolska-muzea': { label: 'Kapitolská muzea', ids: ['Q333906'] },
    'britske-muzeum': { label: 'Britské muzeum', ids: ['Q6373'] },
    belvedere: { label: 'Belvedere ve Vídni', ids: ['Q303139'] },
    'moravska-galerie': { label: 'Moravská galerie v Brně', ids: ['Q3094617'] },
    ajg: { label: 'Alšova jihočeská galerie', ids: ['Q8552687'] }
};
const placesOf = (detail) => [...(detail.coll || []), ...(detail.loc || [])];
const museumOf = (detail) => {
    for (const qid of placesOf(detail)) {
        const key = Object.keys(MUSEUMS).find(museum => MUSEUMS[museum].ids.includes(qid));
        if (key) return key;
    }
    // Další oddělení Louvru (ne Louvre Abú Zabí)
    return placesOf(detail).some(qid => /of the Louvre$/.test(en(qid))) ? 'louvre' : undefined;
};
const collectionLabel = (detail) => {
    const key = museumOf(detail);
    if (key) return MUSEUMS[key].label;
    // Jiná sbírka jen s rozumným českým názvem
    return (detail.coll || []).map(cs).find(text => text && text.length <= 40 && !/sbírka|collection|fond|oddělení|point/iu.test(text));
};

// Technika z materiálů (olej na plátně, tempera na dřevě, freska) a materiál sochy
const OIL = 'Q296955';
const CANVAS = 'Q12321255';
const PANELS = ['Q106857709', 'Q287', 'Q106857823', 'Q106857865', 'Q107103548', 'Q575018', 'Q2075708'];
const TEMPERA = 'Q175166';
const FRESCO = ['Q25631150', 'Q134194', 'Q22669139'];
const SCULPTURE_MATERIALS = [['Q34095', 'bronz'], ['Q40861', 'mramor'], ['Q40088', 'mramor'], ['Q13085', 'pískovec'], ['Q106529311', 'pískovec'],
    ['Q41177', 'žula'], ['Q23757', 'vápenec'], ['Q287', 'dřevo'], ['Q575018', 'dřevo'], ['Q2075708', 'dřevo'], ['Q11427', 'ocel'], ['Q172587', 'ocel'],
    ['Q22657', 'beton'], ['Q184190', 'beton'], ['Q45621', 'keramika'], ['Q11224919', 'mamutovina'], ['Q82001', 'slonovina'], ['Q897', 'zlato'],
    ['Q753', 'měď'], ['Q11469', 'sklo'], ['Q663', 'hliník'], ['Q483269', 'litina'], ['Q22731', 'kámen']];
const techniqueOf = (detail, isSculpture) => {
    const materials = detail.mat || [];
    if (isSculpture) {
        const found = SCULPTURE_MATERIALS.find(([qid]) => materials.includes(qid));
        return found ? found[1] : undefined;
    }
    if ([...materials, ...(detail.type || [])].some(qid => FRESCO.includes(qid))) return 'freska';
    const onPanel = materials.some(qid => PANELS.includes(qid));
    if (materials.includes(OIL)) return materials.includes(CANVAS) ? 'olej na plátně' : onPanel ? 'olej na dřevě' : 'olejomalba';
    if (materials.includes(TEMPERA)) return onPanel ? 'tempera na dřevě' : 'tempera';
    return undefined;
};

// Druh díla, jak ho hráč vidí v otázce
const PAINTING_KINDS = [[['Q134194', 'Q22669139'], 'freska'], [['Q99516640', 'Q219423'], 'nástěnná malba'], [['Q93184'], 'kresba'], [['Q132137'], 'ikona'],
    [['Q79218'], 'triptych'], [['Q1278452', 'Q15711026', 'Q46686', 'Q11801536'], 'oltářní obraz'], [['Q16905563', 'Q18573970', 'Q15727816'], 'série obrazů']];
const SCULPTURE_KINDS = [[['Q241045'], 'busta'], [['Q659396'], 'jezdecká socha'], [['Q1066288', 'Q248726'], 'soška'], [['Q245117'], 'reliéf'],
    [['Q2293362'], 'sousoší'], [['Q179700', 'Q928357', 'Q837249', 'Q1779653', 'Q3476533', 'Q1051606', 'Q29168168'], 'socha']];
const kindOf = (types = [], isSculpture) => {
    const found = (isSculpture ? SCULPTURE_KINDS : PAINTING_KINDS).find(([qids]) => qids.some(qid => types.includes(qid)));
    if (found) return found[1];
    // Cyklus fresek a malovaný strop (Sixtinská kaple) nemají český název druhu
    if (!isSculpture && types.some(qid => /fresco|ceiling/i.test(en(qid)))) return 'freska';
    return isSculpture ? 'plastika' : 'obraz';
};

// Co do soch nepatří: kašny, sloupy, stavby, nápisy, ztracená a smyšlená díla; Rhodský kolos a Feidiův Zeus známe jen z kreseb
const NOT_SCULPTURE = /fontán|fountain|kašn|sloup|column|stél|nápis|inscription|archeologická lokalita|stavba|building|park|hodiny|clock|orloj|mauzoleum|budova|brán|oblouk|obelisk|studn|jeskyn|diorama|muzeum|psané dílo|baldachýn|katedra|lost|hypothetical|chrám|klášter|pítko|vila|automat|instalace|land art|model|kalvári|krucifix/iu;
// Další díla, která sem nepatří: lisované mince, krystalová lebka, Pomník Wikipedie, nevhodné akty (Původ světa) a zdi
const NOT_WORKS = new Set(['Q41553', 'Q46239', 'Q786806', 'Q254170', 'Q761739', 'Q776429', 'Q949076', 'Q1394918', 'Q1632877', 'Q685524', 'Q18201640',
    'Q924174', 'Q334138', 'Q167536', 'Q19697889', 'Q326503', 'Q10860702', 'Q134611583']);
// Moderní sochu bez známého umělce vezmeme, jen když je opravdu slavná (Socha svobody), jinak by mezi sochy pronikly turistické atrakce
const FAMOUS_LINKS = 45;
// Obrazy: skalní malby, naleziště a stavby ne
const NOT_PAINTING = /archeologická lokalita|jeskyn|turistické|park|stavba|zeď|kaple/iu;

// Umělci: popis musí říkat, že jde hlavně o výtvarníka (Goethe „spisovatel, umělec a politik“ ne, Mucha „fotograf, malíř“ ano)
const ART_WORD = /(?<!\p{L})(malíř|malířk|sochař|výtvarn|grafi[kč]|rytec|rytkyn|kreslíř|ilustrátor|umělec|umělkyn|portrétist|krajinář|ikonopis)/iu;
const OTHER_WORD = /(?<!\p{L})(spisovatel|básn|politik|herec|herečk|zpěv|písničkář|skladatel|hudebn|režisér|filozof|filosof|vynález|král|královn|císař|kníže|kněžn|princ|vědec|lékař|animátor|šlechtic|teolog|kritik|matematik|astronom|módní|designér|esejist|novinář|kosmonaut|astronaut|podnikatel)/iu;
const isArtist = (detail) => {
    const text = detail.d || '';
    if (text) {
        const art = text.search(ART_WORD);
        const other = text.search(OTHER_WORD);
        return art >= 0 && (other < 0 || art < other);
    }
    // Bez českého popisu podle anglického
    const english = detail.en || '';
    return /\b(painter|sculptor|engraver|printmaker)\b/i.test(english)
        && !/\b(politician|writer|poet|actor|actress|singer|composer|architect)\b/i.test(english.split(/painter|sculptor|engraver|printmaker/i)[0]);
};
const ROLES = [[/malíř|portrétist|krajinář|ikonopis|painter/iu, 'malíř', 'malířka'], [/sochař|sculptor/iu, 'sochař', 'sochařka'],
    [/grafi[kč]|printmaker/iu, 'grafik', 'grafička'], [/rytec|rytkyn|engraver/iu, 'rytec', 'rytkyně'], [/kreslíř/iu, 'kreslíř', 'kreslířka'],
    [/ilustrátor/iu, 'ilustrátor', 'ilustrátorka'], [/výtvarn|umělec|umělkyn/iu, 'výtvarník', 'výtvarnice']];
// Hlavní obor podle prvního výtvarného slova v popisu (Michelangelo „sochař, malíř“ je sochař)
// Malíř má přednost před grafikem či ilustrátorem (Munch „grafik a malíř“, Lada „ilustrátor, malíř“)
const roleOf = (detail) => {
    const match = ART_WORD.exec(detail.d || '') || /painter|sculptor|engraver|printmaker/i.exec(detail.en || '');
    const word = match && !/sochař|sculptor/iu.test(match[0]) && /malíř/iu.test(detail.d || '') ? 'malíř' : match ? match[0] : 'malíř';
    const found = ROLES.find(([pattern]) => pattern.test(word));
    return detail.sex === FEMALE ? found[2] : found[1];
};
// Země podle přídavného jména na začátku popisu („italský renesanční malíř“ → Itálie)
const NATIONS = [['československ', 'Československo'], ['česk', 'Česko'], ['slovensk', 'Slovensko'], ['italsk', 'Itálie'], ['francouzsk', 'Francie'], ['španělsk', 'Španělsko'],
    ['nizozemsk', 'Nizozemsko'], ['holandsk', 'Nizozemsko'], ['vlámsk', 'Flandry'], ['belgick', 'Belgie'], ['německ', 'Německo'],
    ['rakousk', 'Rakousko'], ['švýcarsk', 'Švýcarsko'], ['britsk', 'Spojené království'], ['anglick', 'Anglie'], ['skotsk', 'Skotsko'],
    ['irsk', 'Irsko'], ['americk', 'USA'], ['kanadsk', 'Kanada'], ['mexick', 'Mexiko'], ['brazilsk', 'Brazílie'], ['argentinsk', 'Argentina'],
    ['kolumbijsk', 'Kolumbie'], ['chilsk', 'Chile'], ['kubánsk', 'Kuba'], ['rusk', 'Rusko'], ['sovětsk', 'Sovětský svaz'], ['ukrajinsk', 'Ukrajina'],
    ['běloruský', 'Bělorusko'], ['polsk', 'Polsko'], ['maďarsk', 'Maďarsko'], ['rumunsk', 'Rumunsko'], ['bulharsk', 'Bulharsko'],
    ['srbsk', 'Srbsko'], ['chorvatsk', 'Chorvatsko'], ['slovinsk', 'Slovinsko'], ['řeck', 'Řecko'], ['portugalsk', 'Portugalsko'],
    ['norsk', 'Norsko'], ['švédsk', 'Švédsko'], ['dánsk', 'Dánsko'], ['finsk', 'Finsko'], ['islandsk', 'Island'], ['litevsk', 'Litva'],
    ['lotyšsk', 'Lotyšsko'], ['estonsk', 'Estonsko'], ['gruzínsk', 'Gruzie'], ['arménsk', 'Arménie'], ['tureck', 'Turecko'],
    ['izraelsk', 'Izrael'], ['japonsk', 'Japonsko'], ['čínsk', 'Čína'], ['korejsk', 'Korea'], ['indick', 'Indie'], ['australsk', 'Austrálie'],
    ['katalánsk', 'Španělsko'], ['benátsk', 'Itálie'], ['florentsk', 'Itálie']];
const landOf = (detail) => {
    const first = ((detail.d || '').trim().split(/\s+/)[0] || '').toLowerCase().split('-')[0];
    const found = /(ský|cký|ská|cká|ký|ká)$/u.test(first) && NATIONS.find(([stem]) => first.startsWith(stem));
    return found ? found[1] : undefined;
};
// Český umělec: popis „český“ (ne „československý“ – tak Wikidata popisují hlavně Slováky), jinak občanství bez jiné národnosti
const SLOVAKIA = 'Q214';
const isCzechPerson = (detail) => !(detail.cit || []).includes(SLOVAKIA) && (/^(česk(?!oslovensk)|moravsk)/iu.test((detail.d || '').trim())
    || ((detail.cit || []).some(qid => CZECH_STATES.has(qid)) && !landOf(detail)));
// Nejznámější čeští výtvarníci (známí i bez mnoha jazykových verzí; pořadí podle Wikidat by vyneslo spíš Menga či Orlika)
const CZECH_KNOWN = ['Alfons Mucha', 'Josef Čapek', 'František Kupka', 'Josef Lada', 'Václav Hollar', 'David Černý', 'Mikoláš Aleš', 'Josef Mánes',
    'Petr Brandl', 'Toyen', 'Václav Brožík', 'Josef Václav Myslbek', 'Max Švabinský', 'Zdeněk Burian', 'Bohumil Kubišta', 'Antonín Slavíček',
    'Emil Filla', 'Karel Škréta', 'Jakub Schikaneder', 'Vojtěch Hynais', 'František Bílek', 'Josef Matěj Navrátil', 'Jan Zrzavý', 'Ladislav Šaloun',
    'Matyáš Bernard Braun', 'Ferdinand Maxmilián Brokoff', 'Adolf Born', 'Jan Štursa', 'Julius Mařák', 'Mistr Theodorik'];
// Lidé s povoláním malíř, kteří patří jinam (spisovatel Džibrán, biolog Haeckel, herec Dennis Hopper, vynálezce Daguerre)
const NOT_ARTISTS = new Set(['Q47737', 'Q48246', 'Q102711', 'Q131405']);

// Roky: úmrtí před narozením nebo věk přes 105 let je chyba v datech, budoucnost taky
const THIS_YEAR = new Date().getFullYear();
const lifeYears = (detail) => {
    let born = yearOf(detail.born);
    let died = yearOf(detail.died);
    if (born !== undefined && born > THIS_YEAR) born = undefined;
    if (died !== undefined && died > THIS_YEAR) died = undefined;
    if (born !== undefined && died !== undefined && (died <= born || died - born > 105)) died = undefined;
    return { born, died };
};
// Vznik díla: nejpřesnější údaj; „kolem“ u odhadu (kvalifikátor circa, přesnost na desetiletí, víc různých roků),
// u starých děl často jen století
const CIRCA = new Set(['Q5727902', 'Q18122778', 'Q30230067', 'Q56644435']);
const workYear = (detail) => {
    const entries = (detail.year || []).map(entry => ({ ...entry, year: yearOf(entry.v) })).filter(entry => entry.year !== undefined && entry.year <= THIS_YEAR);
    if (!entries.length) return {};
    const best = [...entries].sort((a, b) => b.prec - a.prec || (CIRCA.has(a.q) ? 1 : 0) - (CIRCA.has(b.q) ? 1 : 0) || a.year - b.year)[0];
    if (best.prec <= 7) return { century: best.year > 0 ? Math.ceil(best.year / 100) : -Math.ceil(-best.year / 100) || -1 };
    const years = new Set(entries.filter(entry => entry.prec >= 8).map(entry => entry.year));
    return { year: best.year, approx: best.prec < 9 || CIRCA.has(best.q) || years.size > 1 ? 1 : undefined };
};

// Jisté autorství: jediný autor bez „připisováno“ či „možná“, který je člověk se jménem
const UNCERTAIN = new Set(['Q18122778', 'Q30230067', 'Q230768', 'Q56644435', 'Q18912752', 'Q10578722']);
const creatorsOf = (detail) => (detail.cr || []).filter(creator => /^Q\d+$/.test(creator.id));
const sureCreator = (detail) => {
    const creators = creatorsOf(detail);
    if (creators.length !== 1 || (detail.attr || []).length || UNCERTAIN.has(creators[0].q)) return undefined;
    const person = people.get(creators[0].id);
    return person && (person.type || []).includes(HUMAN) && person.n ? creators[0].id : undefined;
};

// --- 4. krok: položky ---
// Kolik vzít, kolik nejznámějších je „známých“, od kolika jazykových verzí; české položky navíc až do czLimit
// (czKnown = nejznámější české, které jsou známé)
const LIMITS = {
    obrazy: { limit: 320, known: 60, czLimit: 30, czKnown: 4, minLinks: 8, czMinLinks: 3 },
    sochy: { limit: 170, known: 22, czLimit: 25, czKnown: 7, minLinks: 7, czMinLinks: 4 },
    umelci: { limit: 420, known: 80, czLimit: 110, czKnown: 25 }
};
// Sbírka chebské galerie; stát díla jen dnešní Česko (Československo by vzalo i sochy na Slovensku)
const CZECH_PLACES = new Set(['Q101017512', 'Q44385654']);
const CZECHIA = 'Q213';
const names = new Set();
const nameKey = (name) => name.toLocaleLowerCase('cs');
const items = [];
const rank = {};
const czechRank = {};
// Přidá položku, pokud se vejde do limitu (české do vlastního); isKnown(pořadí, počet už známých českých) rozhodne o známosti
const add = (category, item, isCzech, isKnown) => {
    const settings = LIMITS[category];
    const position = rank[category] || 0;
    const czechPosition = czechRank[category] || 0;
    if (isCzech ? czechPosition >= settings.czLimit : position >= settings.limit) return false;
    // Jedna položka na jméno (Zrození Venuše od Botticelliho, ne od Cabanela)
    if (names.has(nameKey(item.n))) return false;
    names.add(nameKey(item.n));
    rank[category] = position + 1;
    if (isCzech) czechRank[category] = czechPosition + 1;
    const czechKnown = items.filter(other => other.c === category && other.cz && other.k).length;
    items.push(compact({ ...item, c: category, k: isKnown(position, czechKnown) ? 1 : 0, cz: isCzech ? 1 : undefined }));
    return true;
};

// Umělci (vybraní dřív, aby dílo mohlo odkázat na autora); obory z popisu, směry z Wikidat
const artistIds = new Set();
for (const [qid] of candidates.artists) {
    const detail = people.get(qid);
    if (!detail || !detail.t || !nameOf(detail) || NOT_ARTISTS.has(qid) || !(detail.type || []).includes(HUMAN) || !isArtist(detail)) continue;
    const { born, died } = lifeYears(detail);
    if (born === undefined) continue;
    artistIds.add(qid);
}

const typeTexts = (detail) => (detail.type || []).map(qid => `${cs(qid) || ''} ${en(qid)}`).join(' | ');
const workItems = [];
// Obrazy i sochy podle známosti dohromady – stejné jméno dostane známější dílo (Michelangelova Pieta, ne Riberova)
const paintingIds = new Set(candidates.paintings.map(([qid]) => qid));
const workList = [...new Map([...candidates.sculptures, ...candidates.paintings])].sort((a, b) => b[1] - a[1]);
for (const [qid, links] of workList) {
    if (NOT_WORKS.has(qid)) continue;
    const category = paintingIds.has(qid) ? 'obrazy' : 'sochy';
    const isSculpture = category === 'sochy';
    const detail = works.get(qid);
    if (!detail || !detail.t || !detail.im) continue;
    if ((isSculpture ? NOT_SCULPTURE : NOT_PAINTING).test(typeTexts(detail))) continue;
    const creators = creatorsOf(detail).map(creator => people.get(creator.id)).filter(person => person && person.n);
    const { year, approx, century } = workYear(detail);
    // Obraz bez autora jen jako ikona; socha aspoň s autorem, dobou vzniku, směrem nebo sbírkou
    if (!isSculpture && !creators.length && !(detail.type || []).includes('Q132137')) continue;
    if (isSculpture && !creators.length && year === undefined && century === undefined && !detail.mov && !detail.coll) continue;
    const museum = museumOf(detail);
    const author = sureCreator(detail);
    const authorDetail = author && people.get(author);
    const isCzech = (authorDetail && isCzechPerson(authorDetail)) || ['ng-praha', 'moravska-galerie', 'ajg'].includes(museum)
        || placesOf(detail).some(place => CZECH_PLACES.has(place)) || [...(detail.land || []), ...(detail.co || [])].some(state => state === CZECHIA);
    const settings = LIMITS[category];
    if (links < (isCzech ? settings.czMinLinks : settings.minLinks)) continue;
    // Moderní socha (od roku 1850) jen od umělce z dat, česká nebo opravdu slavná
    const isModern = (year ?? (century !== undefined ? century * 100 : 2000)) >= 1850;
    if (isSculpture && isModern && !isCzech && links < FAMOUS_LINKS && !creatorsOf(detail).some(creator => artistIds.has(creator.id))) continue;
    const movementLabel = (detail.mov || []).map(cs).find(Boolean);
    const keys = movementKeys(detail.mov);
    // Země: podle (prvního) autora, u soch bez autora stát, kde stojí (jen jeden – odlitky Myslitele jsou po celém světě)
    const land = creators.length ? creators.map(landOf).find(Boolean) : isSculpture && (detail.land || []).length === 1 ? cs(detail.land[0]) : undefined;
    const item = {
        q: qid,
        t: detail.t,
        n: nameOf(detail),
        ty: kindOf(detail.type, isSculpture),
        d: detail.d,
        ...imageFields(detail.im),
        f: compact({
            year,
            ya: approx,
            yc: century,
            // Autoři (nejvýš dva), jistý autor zvlášť pro otázku „Kdo to vytvořil?“
            by: creators.slice(0, 2).map(nameOf).join(' a ') || undefined,
            bq: author && artistIds.has(author) ? author : undefined,
            mov: movementLabel,
            st: styleOf(detail.mov, year),
            mk: keys,
            coll: collectionLabel(detail),
            tech: techniqueOf(detail, isSculpture),
            land,
            y: year ?? (century !== undefined ? (century > 0 ? century * 100 - 50 : century * 100 + 50) : undefined)
        }),
        museum
    };
    // Mezi známá česká díla jen díla českých autorů (Dürerova Růžencová slavnost v Národní galerii ne)
    const czechAuthor = isCzech && Boolean(authorDetail && isCzechPerson(authorDetail));
    if (add(category, item, isCzech, (position, czechKnown) => position < settings.known || (czechAuthor && czechKnown < settings.czKnown))) {
        workItems.push(items[items.length - 1]);
    }
}

// Díla v datech podle autora (nejznámější první) – nápověda „slavná díla“ a směr umělce, který ho ve Wikidatech nemá
const worksBy = new Map();
for (const work of workItems) {
    const author = sureCreator(works.get(work.q));
    if (author) worksBy.set(author, [...(worksBy.get(author) || []), work]);
}
for (const [qid] of candidates.artists) {
    if (!artistIds.has(qid)) continue;
    const detail = people.get(qid);
    const { born, died } = lifeYears(detail);
    const own = worksBy.get(qid) || [];
    const keys = movementKeys(detail.mov);
    const fromWorks = [...new Set(own.flatMap(work => work.f.mk || []))];
    // Slavná díla: z dat, jinak „významná díla“ z Wikidat (Hokusaiova Velká vlna je dřevoryt, mezi obrazy není)
    const famous = own.length ? own.map(work => work.n) : (detail.works || []).map(cs).filter(name => name && name.length <= 40);
    const item = {
        q: qid,
        t: detail.t,
        n: nameOf(detail),
        ty: roleOf(detail),
        d: detail.d,
        sx: detail.sex === FEMALE ? 'f' : undefined,
        ...imageFields(detail.im),
        f: compact({
            born,
            died,
            land: landOf(detail),
            mov: (detail.mov || []).map(cs).filter(Boolean).slice(0, 2),
            mk: keys.length ? keys : fromWorks,
            works: famous.slice(0, 3),
            y: born + 35
        })
    };
    // Známí: z nejznámějších jen ti, o kterých data něco vědí (směr nebo díla); z Čechů ti nejznámější
    const isCzech = isCzechPerson(detail);
    const isKnown = (position) => isCzech ? CZECH_KNOWN.includes(item.n) : position < LIMITS.umelci.known && Boolean(item.f.mk || item.f.works);
    if (!add('umelci', item, isCzech, isKnown)) artistIds.delete(qid);
}
// Autor díla, který se do umělců nevešel, odkaz nemá
for (const work of workItems) if (work.f.bq && !items.some(item => item.q === work.f.bq)) delete work.f.bq;

// --- 5. krok: okruhy pro učení ---
const hasMovement = (...keys) => (item) => (item.f.mk || []).some(key => keys.includes(key));
const BY_YEAR = { by: 'y' };
const COLLECTIONS = [
    { id: 'ceske-umeni', label: 'České umění', text: 'Čeští malíři a sochaři a jejich díla', sort: BY_YEAR, test: item => item.cz },
    { id: 'pravek-starovek', label: 'Pravěk a starověk', text: 'Pravěké venuše a antické sochy', sort: BY_YEAR, test: item => item.c !== 'umelci' && item.f.y < 500 },
    { id: 'gotika', label: 'Gotika', sort: BY_YEAR, test: hasMovement('gotika') },
    { id: 'renesance', label: 'Renesance', text: 'I manýrismus', sort: BY_YEAR, test: hasMovement('renesance', 'manyrismus') },
    { id: 'baroko', label: 'Baroko a rokoko', sort: BY_YEAR, test: hasMovement('baroko', 'rokoko') },
    { id: 'klasicismus-romantismus', label: 'Klasicismus a romantismus', sort: BY_YEAR, test: hasMovement('klasicismus', 'romantismus') },
    { id: 'realismus', label: 'Realismus a akademismus', sort: BY_YEAR, test: hasMovement('realismus', 'akademismus') },
    { id: 'impresionismus', label: 'Impresionismus a postimpresionismus', sort: BY_YEAR, test: hasMovement('impresionismus', 'postimpresionismus') },
    { id: 'secese', label: 'Secese a symbolismus', sort: BY_YEAR, test: hasMovement('secese', 'symbolismus') },
    { id: 'moderni-umeni', label: 'Moderní umění', text: 'Expresionismus, kubismus, surrealismus, abstrakce, pop-art', sort: BY_YEAR,
        test: hasMovement('expresionismus', 'kubismus', 'avantgarda', 'surrealismus', 'abstrakce', 'popart') },
    { id: 'nizozemsti-mistri', label: 'Nizozemští a vlámští mistři', sort: BY_YEAR, test: item => ['Nizozemsko', 'Flandry', 'Belgie'].includes(item.f.land) && item.f.y < 1750 },
    { id: 'malirky-a-socharky', label: 'Malířky a sochařky', sort: BY_YEAR, test: item => item.sx === 'f' },
    ...Object.entries(MUSEUMS).map(([key, museum]) => ({ id: key, label: museum.label, text: 'Díla ve sbírce', sort: BY_YEAR, test: item => item.museum === key }))
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
    delete item.museum;
}
// Muzeum jen s dostatkem děl (aspoň 10), ostatní okruhy aspoň s pěti položkami
const sizeOf = (collection) => items.filter(item => (item.g || []).includes(collection.id)).length;
const collections = COLLECTIONS.filter(collection => sizeOf(collection) >= (MUSEUMS[collection.id] ? 10 : 5)).map(({ test, ...collection }) => collection);
const kept = new Set(collections.map(collection => collection.id));
for (const item of items) {
    if (!item.g) continue;
    item.g = item.g.filter(group => kept.has(group));
    if (!item.g.length) delete item.g;
}

for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.cz).length} českých)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${sizeOf(collection)}`);

writeTopic('umeni', { collections, items });
