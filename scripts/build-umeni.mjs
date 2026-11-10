// Téma Výtvarné umění: data/umeni.json z Wikidat – obrazy, sochy, malíři a sochaři
// Spuštění: npm run build:umeni (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování).
// Dosud známé položky z data/umeni.json se nestanou expertními.
import { readFileSync, existsSync } from 'node:fs';
import { sparql, qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';
import { repsQuery, repOfRow, pickReps, architectIds, czechWorkName } from './lib/umeni-rules.mjs';
import { assignLevels, levelSummary, fameOf, fameQuantiles, czechPageviewsBatch } from './lib/umeni-levels.mjs';
import { cachedByKey } from './lib/zemepis-levels.mjs';

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
// Fotograf, fotoreportér; ilustrátor, karikaturista, autor komiksů, kreslíř
const PHOTOGRAPHER_OCCUPATIONS = ['Q33231'];
const ILLUSTRATOR_OCCUPATIONS = ['Q644687', 'Q1114448', 'Q715301', 'Q15296811'];
// Umělecké směry, slohy a školy výtvarného umění (ručně: Wikidata pod „umělecké hnutí“ vedou i hudbu, literaturu a film), podle známosti
const ART_MOVEMENTS = ['Q4692', 'Q37068', 'Q37853', 'Q39427', 'Q40415', 'Q42934', 'Q6034', 'Q46825', 'Q80113', 'Q34636', 'Q131221', 'Q128115',
    'Q170292', 'Q124354', 'Q102932', 'Q164800', 'Q134147', 'Q10857409', 'Q166713', 'Q173436', 'Q131808', 'Q173782', 'Q166593', 'Q46805',
    'Q185905', 'Q180902', 'Q191970', 'Q186030', 'Q177725', 'Q184814', 'Q38166', 'Q189458', 'Q207103', 'Q200034', 'Q203209', 'Q207445',
    'Q182331', 'Q326478', 'Q150091', 'Q154432', 'Q17516', 'Q281108', 'Q108908', 'Q143357', 'Q152778', 'Q594150', 'Q503708', 'Q751880',
    'Q939559', 'Q372600', 'Q848365', 'Q943853', 'Q212611', 'Q2352880', 'Q422681', 'Q915841', 'Q610877', 'Q443153', 'Q610687', 'Q519443',
    'Q851869', 'Q589655', 'Q576913', 'Q217213', 'Q847847', 'Q1332178', 'Q708807', 'Q55995', 'Q889525', 'Q62506', 'Q753683', 'Q938864',
    'Q252801', 'Q1133329', 'Q277466', 'Q224885', 'Q1066218', 'Q768100', 'Q680559', 'Q584084', 'Q941875', 'Q1054254', 'Q1401605', 'Q273506',
    'Q845421', 'Q1578378', 'Q3357314', 'Q587691', 'Q891532', 'Q1351977', 'Q1407578', 'Q1399604', 'Q695830', 'Q2344569', 'Q1382662',
    'Q1633309', 'Q3272569', 'Q3108623', 'Q979160', 'Q858436', 'Q1086353', 'Q540807', 'Q1886249', 'Q208208', 'Q1683337'];
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
    // Fotografové, ilustrátoři a karikaturisté (povolání mimo malíře a sochaře) – opět i čeští méně známí
    const byOccupation = async (occupations, minLinks, czechMinLinks) => {
        const world = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?occ { ${values(occupations)} } ?x wdt:P106 ?occ ; wdt:P31 wd:${HUMAN} .
  ${csArticle('?x')} FILTER(?sl >= ${minLinks}) }`));
        const czech = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?occ { ${values(occupations)} } VALUES ?state { ${values([...CZECH_STATES])} }
  ?x wdt:P106 ?occ ; wdt:P27 ?state ; wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= ${czechMinLinks}) }`));
        return [...new Map([...world, ...czech])].sort((a, b) => b[1] - a[1]);
    };
    const photographers = await byOccupation(PHOTOGRAPHER_OCCUPATIONS, 15, 5);
    const illustrators = await byOccupation(ILLUSTRATOR_OCCUPATIONS, 12, 4);
    // Umělecké směry, slohy a hnutí (bez obrázku – ptáme se na popis)
    const movements = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?x { ${values(ART_MOVEMENTS)} } ${csArticle('?x')} }`));
    return { paintings, sculptures, photographers, illustrators, movements, artists: [...new Map([...artists, ...czechArtists])].sort((a, b) => b[1] - a[1]) };
});
// Čeští umělci 19. století mají ve Wikidatech často jen Rakouské císařství, Předlitavsko nebo Svatou říši římskou –
// zda jsou čeští, rozhodne až popis
const OLD_STATES = ['Q131964', 'Q28513', 'Q699964', 'Q12548', 'Q268970'];
const oldCzech = await cached('umeni-old-czech', async () => fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE {
  VALUES ?occ { ${values(ARTIST_OCCUPATIONS)} } VALUES ?state { ${values(OLD_STATES)} } ?x wdt:P106 ?occ ; wdt:P27 ?state ; wdt:P31 wd:${HUMAN} .
  ?x schema:description ?desc FILTER(LANG(?desc) = "cs" && REGEX(?desc, "^(český|česká|moravský|moravská)", "i")) ${csArticle('?x')} FILTER(?sl >= 4) }`)));
for (const entry of oldCzech) if (!candidates.artists.some(([qid]) => qid === entry[0])) candidates.artists.push(entry);
candidates.artists.sort((a, b) => b[1] - a[1]);
// Pravěká a antická díla (vznik do roku 500): mnohá nemají druh ze SCULPTURE_TYPES (Níké Samothrácká je „artefakt“, Lví muž
// a Láokoón „skulptura“ jako podtřída) – berou se z celého stromu soch, obrazů, mozaik a výtvarných děl a druh se ověří až
// podle českých názvů typů (ANCIENT_KIND); obraz = malba, freska nebo mozaika
const ancient = await cached('umeni-ancient', async () => (await qlever(`SELECT ?x (MAX(?sl) AS ?links) (MAX(?isPainting) AS ?pt) WHERE {
  VALUES ?cls { wd:Q860861 wd:Q3305213 wd:Q133067 wd:Q4502142 }
  ?x wdt:P31/wdt:P279* ?cls . ?x wdt:P571 ?d . FILTER(YEAR(?d) < 500)
  ?x wdt:P18 ?image . ${csArticle('?x')}
  BIND(IF(EXISTS { VALUES ?pc { wd:Q3305213 wd:Q134194 wd:Q133067 } ?x wdt:P31/wdt:P279* ?pc }, 1, 0) AS ?isPainting)
} GROUP BY ?x`)).map(row => [id(row.x.value), Number(row.links.value), Number(row.pt.value)]));
const ancientIds = new Set();
const knownWorkIds = new Set([...candidates.paintings, ...candidates.sculptures].map(([qid]) => qid));
for (const [qid, links, painting] of ancient) {
    ancientIds.add(qid);
    if (!knownWorkIds.has(qid)) (painting ? candidates.paintings : candidates.sculptures).push([qid, links]);
}
for (const list of [candidates.paintings, candidates.sculptures]) list.sort((a, b) => b[1] - a[1]);
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
// Díla přidaná po uložení mezipaměti (antická) se dočtou zvlášť
const extraWorks = await cachedByKey('umeni-works-extra', workIds.filter(qid => !works.has(qid)), async (qids) => Object.fromEntries(await fetchDetails(qids, workDetails, 60)));
for (const [qid, detail] of Object.entries(extraWorks)) if (!works.has(qid)) works.set(qid, detail);
// Autoři děl patří k umělcům, i když sami nejsou mezi kandidáty (nápověda a možnosti u otázky „Kdo to vytvořil?“)
const creatorIds = [...new Set([...works.values()].flatMap(work => (work.cr || []).map(creator => creator.id)))].filter(q => /^Q\d+$/.test(q));
const personIds = [...new Set([...candidates.artists, ...candidates.photographers, ...candidates.illustrators].map(([qid]) => qid).concat(creatorIds))];
const people = new Map(await cached('umeni-people', () => fetchDetails(personIds, personDetails, 100)));
// Kandidáti přidaní po uložení mezipaměti se dočtou zvlášť
const missingPeople = personIds.filter(qid => !people.has(qid));
for (const [qid, detail] of Object.entries(await cachedByKey('umeni-people-more', missingPeople, async (qids) => Object.fromEntries(await fetchDetails(qids, personDetails, 100))))) {
    if (!people.has(qid) && personIds.includes(qid)) people.set(qid, detail);
}
console.log(`Podrobnosti: ${works.size} děl, ${people.size} osob`);

// Směry: popis, vznik a zánik, země a nejznámější představitelé (lidé, kteří se k směru hlásí – P135)
const movementDetails = new Map(await cached('umeni-movements', async () => {
    const result = new Map(candidates.movements.map(([qid]) => [qid, {}]));
    await inBatches(candidates.movements.map(([qid]) => qid), 80, (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "en") BIND("en" AS ?p) }
  UNION { ?item wdt:P571|wdt:P580 ?v BIND("from" AS ?p) }
  UNION { ?item wdt:P576|wdt:P582 ?v BIND("to" AS ?p) }
  UNION { ?item wdt:P495 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P279 ?v BIND("sub" AS ?p) }
}`, collect(result));
    // Představitelé: lidé s tímto směrem, kteří mají český článek (všichni kandidáti – vybírá se až podle položek tématu, pickReps)
    const reps = new Map();
    // Přes QLever – query.wikidata.org dotaz na všechny představitele směrů nestihne (HTTP 504)
    await inBatches(candidates.movements.map(([qid]) => qid), 20, (qids) => repsQuery(qids, [...ARTIST_OCCUPATIONS, ...PHOTOGRAPHER_OCCUPATIONS, 'Q42973'], HUMAN), (row) => {
        const key = id(row.item.value);
        reps.set(key, [...(reps.get(key) || []), repOfRow(row, id)]);
    }, qlever);
    for (const [qid, list] of reps) result.get(qid).reps = list.sort((a, b) => b.sl - a.sl);
    return [...result];
}));

// České (a anglické) názvy odkazovaných položek: směry, sbírky, místa, materiály, žánry, země, druhy
const referenced = new Set();
for (const work of works.values()) for (const key of ['mov', 'coll', 'loc', 'mat', 'genre', 'co', 'land', 'type', 'attr']) (work[key] || []).forEach(q => referenced.add(q));
for (const person of people.values()) for (const key of ['cit', 'mov', 'works', 'occ']) (person[key] || []).forEach(q => referenced.add(q));
for (const detail of movementDetails.values()) for (const key of ['co', 'type', 'sub']) (detail[key] || []).forEach(q => referenced.add(q));
for (const q of referenced) if (!/^Q\d+$/.test(q)) referenced.delete(q);
const labels = new Map(await cached('umeni-labels', async () => {
    const result = [];
    await inBatches([...referenced], 300, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]));
    return result;
}));
// Názvy položek, na které odkazují dočtení umělci a díla (null = položka bez českého i anglického názvu)
const missingLabels = [...new Set([...[...people.values()].flatMap(person => ['cit', 'mov', 'works', 'occ'].flatMap(key => person[key] || [])),
    ...[...works.values()].flatMap(work => ['mov', 'coll', 'loc', 'mat', 'genre', 'co', 'land', 'type', 'attr'].flatMap(key => work[key] || []))])]
    .filter(qid => /^Q\d+$/.test(qid) && !labels.has(`cs:${qid}`) && !labels.has(`en:${qid}`));
const extraLabels = await cachedByKey('umeni-labels-more', missingLabels, async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, null]));
    await inBatches(qids, 300, (batch) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(batch)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => { const qid = id(row.item.value); result[qid] = { ...(result[qid] || {}), [row.lang.value]: row.l.value }; }, qlever);
    return result;
});
for (const [qid, found] of Object.entries(extraLabels)) for (const [lang, label] of Object.entries(found || {})) labels.set(`${lang}:${qid}`, label);
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
const stillNameless = [...works, ...people].filter(([, detail]) => !detail.n).map(([qid]) => qid);
const moreMul = await cachedByKey('umeni-mul-more', stillNameless, async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, null]));
    await inBatches(qids, 300, (batch) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(batch)} } ?item rdfs:label ?l FILTER(LANG(?l) = "mul") }`,
        (row) => { result[id(row.item.value)] = row.l.value; }, qlever);
    return result;
});
for (const [qid, name] of Object.entries(moreMul)) for (const map of [works, people]) if (name && map.has(qid) && !map.get(qid).n) map.get(qid).n = name;
// Název bez upřesnění v závorce („Astronom (Vermeer)“ → Astronom), s velkým písmenem
const nameOf = (detail) => {
    const name = (detail.n || detail.t || '').replace(/ \(.*\)$/, '');
    return name.charAt(0).toUpperCase() + name.slice(1);
};
// Název díla: cizí štítek Wikidat (Portinari Altarpiece) → název českého článku (czechWorkName v scripts/lib/umeni-rules.mjs)
const workNames = (detail) => czechWorkName(nameOf(detail), nameOf({ t: detail.t }));
const sitelinks = new Map([...candidates.photographers, ...candidates.illustrators, ...candidates.paintings, ...candidates.sculptures, ...candidates.artists]);

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
    'Q924174', 'Q334138', 'Q167536', 'Q19697889', 'Q326503', 'Q10860702', 'Q134611583',
    // Athéna Parthenos zanikla (fotka ukazuje novodobou repliku)
    'Q2070605']);
// Pravěká a antická díla z širšího dotazu: jen sochy, sošky, venuše, masky, reliéfy, fresky a mozaiky (ne nápisy, papyry, brány, sloupy)
const ANCIENT_KIND = /socha|skulptur|venuše|figur|soška|sousoší|maska|busta|sfing|reliéf|artefakt|idol|freska|mozaik|nástěnná malba|daibucu|statue|sculpture|figurine|mosaic|fresco/iu;
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
const formatYearText = (year) => year < 0 ? `${-year} př. n. l.` : String(year);
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
// Kolik vzít, od kolika jazykových verzí; české položky navíc až do czLimit. Dílo ve sbírce muzea z okruhů stačí s museumMinLinks
// (sbírky Louvru, Prada či Uffizi mají české články i u méně známých obrazů). Úrovně se určí až na konci (assignLevels).
// České obrazy i s jedinou jazykovou verzí: Zbraslavská madona, Roudnický oltář, Theodorikovi světci z Karlštejna
const LIMITS = {
    obrazy: { limit: 420, czLimit: 80, minLinks: 5, czMinLinks: 1, museumMinLinks: 2 },
    sochy: { limit: 230, czLimit: 55, minLinks: 5, czMinLinks: 3, museumMinLinks: 2 },
    umelci: { limit: 650, czLimit: 130 },
    fotografove: { limit: 220, czLimit: 45 },
    ilustratori: { limit: 150, czLimit: 40 },
    smery: { limit: 120, czLimit: 0 }
};
// Sbírka chebské galerie; stát díla jen dnešní Česko (Československo by vzalo i sochy na Slovensku)
const CZECH_PLACES = new Set(['Q101017512', 'Q44385654']);
const CZECHIA = 'Q213';
const names = new Set();
// Klíč jména: bez velikosti písmen a bez „sv.“/„svatý“ (Klanění sv. Tří králů = Klanění tří králů)
const nameKey = (name) => name.toLocaleLowerCase('cs').replace(/(?<!\p{L})(?:sv\.|svat(?:ý|á|é|í|ých))\s*/gu, '').replace(/\s+/g, ' ').trim();
const items = [];
const rank = {};
const czechRank = {};
// Položky, které jsou známé vždy (nejznámější čeští výtvarníci, fotografové a ilustrátoři) a které známé nejsou nikdy
const alwaysKnown = new Set();
const neverKnown = new Set();
const renamed = new Map();
// Přidá položku, pokud se vejde do limitu (české do vlastního); force = mimo limit (kvóta okruhu, viz OKRUH_QUOTA)
const add = (category, item, isCzech, force = false) => {
    const settings = LIMITS[category];
    const position = rank[category] || 0;
    const czechPosition = czechRank[category] || 0;
    if (!force && (isCzech ? czechPosition >= settings.czLimit : position >= settings.limit)) return false;
    // Jedna položka na jméno (Zrození Venuše od Botticelliho, ne od Cabanela) – stejnojmenné dílo jiného jistého autora z dat
    // (pět Klanění tří králů v Uffizi) dostane do názvu autora; otázka „Kdo to namaloval?“ pak u něj není (název by autora prozradil)
    if (names.has(nameKey(item.n))) {
        const named = item.f && item.f.bq && item.f.by ? `${item.n} – ${item.f.by}` : null;
        if (!named || names.has(nameKey(named)) || !items.some(other => nameKey(other.n) === nameKey(item.n) && (other.c === 'obrazy' || other.c === 'sochy'))) return false;
        item = { ...item, n: named, al: [...new Set([...(item.al || []), item.n])], f: { ...item.f, bq: undefined } };
        renamed.set(named, item.al[item.al.length - 1]);
    }
    names.add(nameKey(item.n));
    rank[category] = position + 1;
    if (isCzech) czechRank[category] = czechPosition + 1;
    items.push(compact({ ...item, f: compact(item.f), c: category, k: 0, cz: isCzech ? 1 : undefined }));
    return true;
};

// Umělci (vybraní dřív, aby dílo mohlo odkázat na autora); obory z popisu, směry z Wikidat
const artistIds = new Set();
for (const [qid] of candidates.artists) {
    const detail = people.get(qid);
    if (!detail || !detail.t || !nameOf(detail) || NOT_ARTISTS.has(qid) || !(detail.type || []).includes(HUMAN) || !isArtist(detail)) continue;
    // Ilustrátor, karikaturista či autor komiksů bez malířství a sochařství patří do vlastního okruhu
    if (/(?<!\p{L})(ilustrátor|karikaturist|komiks)/iu.test(detail.d || '') && !/(?<!\p{L})(malíř|sochař|výtvarn|grafi[kč]|rytec)/iu.test(detail.d || '')) continue;
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
    // Díla jen z dotazu na pravěk a antiku: druh musí být socha, soška, maska, freska či mozaika
    const ancientOnly = ancientIds.has(qid) && !knownWorkIds.has(qid);
    if (ancientOnly && !ANCIENT_KIND.test(typeTexts(detail))) continue;
    const creators = creatorsOf(detail).map(creator => people.get(creator.id)).filter(person => person && person.n);
    const { year, approx, century } = workYear(detail);
    const isAncient = (year ?? (century !== undefined ? century * 100 : 2000)) < 500;
    if (isSculpture && !creators.length && year === undefined && century === undefined && !detail.mov && !detail.coll) continue;
    const museum = museumOf(detail);
    const author = sureCreator(detail);
    const authorDetail = author && people.get(author);
    const isCzech = (authorDetail && isCzechPerson(authorDetail)) || ['ng-praha', 'moravska-galerie', 'ajg'].includes(museum)
        || placesOf(detail).some(place => CZECH_PLACES.has(place)) || [...(detail.land || []), ...(detail.co || [])].some(state => state === CZECHIA);
    // Obraz bez autora jen jako ikona, antická freska či mozaika nebo český gotický deskový obraz s datací (Madona z Vyššího Brodu);
    // socha aspoň s autorem, dobou vzniku, směrem nebo sbírkou
    const czechMedieval = isCzech && (year ?? (century !== undefined ? century * 100 : 2000)) < 1530;
    if (!isSculpture && !creators.length && !(detail.type || []).includes('Q132137') && !isAncient && !czechMedieval) continue;
    const settings = LIMITS[category];
    if (links < (isCzech ? settings.czMinLinks : museum ? settings.museumMinLinks : settings.minLinks)) continue;
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
        ...workNames(detail),
        ty: kindOf(detail.type, isSculpture),
        // Popis osoby místo díla („malíř José (Jusepe) Ribera“) se nepoužije
        d: /^(malíř|sochař|malířka|sochařka)(?!\p{L})/u.test(detail.d || '') ? undefined : detail.d,
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
    if (add(category, item, isCzech)) workItems.push(items[items.length - 1]);
}

// Okruhy směrů (stejné jako COLLECTIONS níž): směr z Wikidat, gotika i podle doby (díla 1150–1450 a umělci narození 1150–1400
// bez jiného směru ze západní a střední Evropy – Cimabue, Gentile da Fabriano, Mistr třeboňského oltáře, Krumlovská madona)
const MOVEMENT_OKRUH = { gotika: 'gotika', renesance: 'renesance', manyrismus: 'renesance', baroko: 'baroko', rokoko: 'baroko',
    klasicismus: 'klasicismus-romantismus', romantismus: 'klasicismus-romantismus', realismus: 'realismus', akademismus: 'realismus',
    impresionismus: 'impresionismus', postimpresionismus: 'impresionismus', secese: 'secese', symbolismus: 'secese',
    expresionismus: 'moderni-umeni', kubismus: 'moderni-umeni', avantgarda: 'moderni-umeni', surrealismus: 'moderni-umeni', abstrakce: 'moderni-umeni', popart: 'moderni-umeni' };
const GOTHIC_LANDS = new Set(['Itálie', 'Francie', 'Německo', 'Česko', 'Nizozemsko', 'Flandry', 'Belgie', 'Rakousko', 'Španělsko', 'Anglie', 'Spojené království',
    'Polsko', 'Maďarsko', 'Švýcarsko', 'Portugalsko', 'Švédsko', 'Dánsko', 'Slovensko', 'Skotsko']);
const isGothicByDate = (item, category = item.c) => {
    const f = item.f || {};
    // Bez země jen díla anonymních mistrů (Mistr Krumlovské madony)
    if ((f.mk || []).length || !(item.cz || GOTHIC_LANDS.has(f.land) || (!f.land && /^Mistr /u.test(f.by || item.n)))) return false;
    // V Itálii začíná renesance dřív (Masaccio, Brunelleschi)
    const italian = f.land === 'Itálie';
    if (category === 'umelci') return f.born >= 1150 && f.born <= (italian ? 1380 : 1400);
    return (category === 'obrazy' || category === 'sochy') && item.ty !== 'ikona' && f.y >= 1150 && f.y <= (italian ? 1420 : 1450);
};
// Sienská škola vede ve Wikidatech ke gotice i renesanční malíře (Signorelli, Sodoma, Beccafumi) – gotický umělec se narodil
// v Itálii nejpozději 1405, jinde 1460 (Veit Stoss)
const lateForGothic = (item, category) => category === 'umelci' && (item.f || {}).born > ((item.f || {}).land === 'Itálie' ? 1405 : 1460);
const okruhyOf = (item, category = item.c) => [...new Set([...((item.f || {}).mk || []).map(key => MOVEMENT_OKRUH[key]).filter(Boolean),
    ...(isGothicByDate(item, category) ? ['gotika'] : [])])].filter(okruh => okruh !== 'gotika' || !lateForGothic(item, category));
// Kvóty okruhů směrů: umělci nad limit kategorie, dokud okruh nemá tolik položek
const OKRUH_QUOTA = { gotika: 55, 'klasicismus-romantismus': 110, realismus: 105, impresionismus: 115, secese: 105 };
const OKRUH_QUOTA_MIN_LINKS = 15;
const okruhCounts = new Map();
for (const work of workItems) for (const okruh of okruhyOf(work)) okruhCounts.set(okruh, (okruhCounts.get(okruh) || 0) + 1);
const okruhCount = (okruh) => okruhCounts.get(okruh) || 0;

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
    // (dílo se jménem autora v názvu jen pod původním názvem – nápověda by umělce prozradila)
    const famous = own.length ? own.map(work => renamed.get(work.n) || work.n) : (detail.works || []).map(cs).filter(name => name && name.length <= 40);
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
            // Dílo se jménem autora v názvu („Za naši svobodu!, Vojtěch Preissig“) by nápovědu prozradilo
            works: famous.filter(name => !name.includes(nameOf(detail))).slice(0, 3),
            y: born + 35
        })
    };
    // Známí jsou jen ti, o kterých data něco vědí (směr nebo díla); z Čechů vždy ti nejznámější
    const isCzech = isCzechPerson(detail);
    if (isCzech && CZECH_KNOWN.includes(item.n)) alwaysKnown.add(qid);
    if (!(item.f.mk || []).length && !(item.f.works || []).length && !alwaysKnown.has(qid)) neverKnown.add(qid);
    // Nad limit umělců jen do kvóty okruhu směru (realismus, impresionismus, secese…), s aspoň 15 jazykovými verzemi
    const quotaOkruh = !isCzech && (sitelinks.get(qid) || 0) >= OKRUH_QUOTA_MIN_LINKS
        && okruhyOf(item, 'umelci').some(okruh => OKRUH_QUOTA[okruh] && okruhCount(okruh) < OKRUH_QUOTA[okruh]);
    if (add('umelci', item, isCzech) || (quotaOkruh && add('umelci', item, isCzech, true))) {
        for (const okruh of okruhyOf(items[items.length - 1], 'umelci')) okruhCounts.set(okruh, okruhCount(okruh) + 1);
    } else artistIds.delete(qid);
}
// Fotografové a ilustrátoři: stejné údaje jako u umělců, obor podle popisu (kdo je hlavně něco jiného, vypadne)
const PERSON_CATEGORIES = [
    { category: 'fotografove', list: candidates.photographers, word: /(?<!\p{L})(fotograf|fotoreportér|fotožurnalist)/iu, english: /\bphotograph(er|y)\b/i,
        roles: [[/fotograf|fotoreportér|fotožurnalist/iu, 'fotograf', 'fotografka']] },
    { category: 'ilustratori', list: candidates.illustrators, word: /(?<!\p{L})(ilustrátor|karikaturist|kreslíř|komiks|autor kreslených)/iu,
        english: /\b(illustrator|cartoonist|comics artist|caricaturist)\b/i,
        roles: [[/karikaturist/iu, 'karikaturista', 'karikaturistka'], [/komiks/iu, 'autor komiksů', 'autorka komiksů'], [/ilustrátor/iu, 'ilustrátor', 'ilustrátorka'],
            [/kreslíř/iu, 'kreslíř', 'kreslířka']] }
];
// Fotograf či ilustrátor musí být hlavně tím: bez jiného povolání v popisu (spisovatel, horolezec, scenárista, politik…) a ilustrátor i bez malíře
// či sochaře (ti patří mezi umělce); bez českého popisu nejde poznat, kdo to je
const OTHER_PERSON = /(?<!\p{L})(cestopis|horolez|scenárist|geograf|letec|voják|lékař|reportér a spisovatel|zakladatel|aktivist|bojovník|pilot)/iu;
const FINE_ARTIST = /(?<!\p{L})(malíř|sochař|výtvarn|grafi[kč]|rytec|umělec|umělkyn)/iu;
const inPrimaryRole = (detail, { word, category }) => {
    const text = detail.d || '';
    if (!text || OTHER_PERSON.test(text)) return false;
    const own = text.search(word);
    const other = text.search(OTHER_WORD);
    return own >= 0 && (other < 0 || own < other) && (category !== 'ilustratori' || !FINE_ARTIST.test(text));
};
// Fotografové, kteří do kvízu nepatří (propagandista, obvinění, politik s fotografií v popisu)
const NOT_PHOTOGRAPHERS = new Set(['Heinrich Hoffmann', 'Terry Richardson', 'Volen Siderov', 'Giovanni Verga', 'Len Deighton', 'Andy Goldsworthy', 'Nicolas Hulot']);
const NOT_KNOWN_PEOPLE = new Set(['Manuel Rivera-Ortiz', 'Curt O. Schaller', 'Augusto De Luca']);
const personRole = (detail, { word, roles }) => {
    const text = detail.d || '';
    const found = roles.map(([pattern, male, female]) => ({ at: text.search(pattern), male, female })).filter(role => role.at >= 0).sort((a, b) => a.at - b.at)[0] || { male: roles[0][1], female: roles[0][2] };
    return detail.sex === FEMALE ? found.female : found.male;
};
// Nejznámější čeští fotografové a ilustrátoři (ostatní podle počtu jazykových verzí)
const CZECH_KNOWN_EXTRA = ['Josef Sudek', 'František Drtikol', 'Jan Saudek', 'Josef Koudelka', 'Jaromír Funke', 'Zdeněk Miler', 'Jiří Trnka', 'Ondřej Sekora',
    'Vladimír Renčín', 'Květa Pacovská', 'Helena Zmatlíková', 'Jiří Šalamoun', 'Hermína Týrlová', 'Vojtěch Preissig', 'Jindřich Štyrský', 'Kája Saudek'];
const usedPeople = new Set(items.filter(item => item.c === 'umelci').map(item => item.q));
for (const kind of PERSON_CATEGORIES) {
    for (const [qid] of kind.list) {
        const detail = people.get(qid);
        if (!detail || usedPeople.has(qid) || !detail.t || !nameOf(detail) || NOT_ARTISTS.has(qid) || !(detail.type || []).includes(HUMAN) || !inPrimaryRole(detail, kind) || NOT_PHOTOGRAPHERS.has(nameOf(detail))) continue;
        const { born, died } = lifeYears(detail);
        if (born === undefined) continue;
        const item = {
            q: qid,
            t: detail.t,
            n: nameOf(detail),
            ty: personRole(detail, kind),
            d: detail.d,
            sx: detail.sex === FEMALE ? 'f' : undefined,
            ...imageFields(detail.im),
            f: compact({
                born,
                died,
                land: landOf(detail),
                mov: (detail.mov || []).map(cs).filter(Boolean).slice(0, 2),
                works: (detail.works || []).map(cs).filter(name => name && name.length <= 40 && !name.includes(nameOf(detail))).slice(0, 3),
                y: born + 35
            })
        };
        const isCzech = isCzechPerson(detail);
        if (isCzech && CZECH_KNOWN_EXTRA.includes(item.n)) alwaysKnown.add(qid);
        if (NOT_KNOWN_PEOPLE.has(item.n)) neverKnown.add(qid);
        if (add(kind.category, item, isCzech)) usedPeople.add(qid);
    }
}

// Umělecké směry: vznik a zánik, země a nejznámější představitelé; bez obrázku (ptáme se na popis)
const repAllowed = new Set([...usedPeople, ...architectIds()]);
const movementYear = (values = []) => {
    const years = values.map(yearOf).filter(year => year !== undefined && year <= THIS_YEAR);
    return years.length ? Math.min(...years) : undefined;
};
const MOVEMENT_KINDS = [[/škola|school/iu, 'umělecká škola'], [/skupina|sdružení|spolek|group|collective/iu, 'umělecká skupina'], [/sloh|styl|style/iu, 'umělecký styl'], [/hnutí|movement/iu, 'umělecké hnutí']];
for (const [qid] of candidates.movements) {
    const detail = movementDetails.get(qid);
    if (!detail || !detail.t || !nameOf(detail)) continue;
    const from = movementYear(detail.from);
    const to = movementYear(detail.to);
    // Jen výtvarníci a architekti, které témata vedou jako položky (ne Hermann Hesse u secese), hlavní představitelé směru napřed
    const reps = pickReps(detail.reps || [], repAllowed);
    const bornYears = reps.map(rep => yearOf(rep.born)).filter(year => year !== undefined).sort((a, b) => a - b);
    const middle = bornYears.length ? bornYears[Math.floor(bornYears.length / 2)] + 30 : undefined;
    const start = from ?? middle;
    if (start === undefined) continue;
    const span = from !== undefined && to !== undefined && to > from && to - from <= 600;
    const type = (detail.d || '') + ' ' + (detail.en || '');
    const kind = (MOVEMENT_KINDS.find(([pattern]) => pattern.test(type)) || [null, 'umělecký směr'])[1];
    const years = span ? `${formatYearText(from)}–${formatYearText(to)}` : from !== undefined ? `od ${formatYearText(from)}` : undefined;
    // Popis z Wikidat; bez něj jen druh a doba (Fauvismus, Postimpresionismus Wikidata česky nepopisují)
    const description = detail.d ? detail.d : [kind, years].filter(Boolean).join(', ');
    const item = {
        q: qid,
        t: detail.t,
        n: nameOf(detail).replace(/ \((umění|výtvarné umění|tendence umění|výtvarná škola|sdružení)\)$/u, ''),
        ty: kind,
        d: description,
        f: compact({
            from: span || from !== undefined ? from : undefined,
            to: span ? to : undefined,
            reps: reps.slice(0, 3).map(rep => rep.n),
            y: start
        })
    };
    add('smery', item, false);
}

// Autor díla, který se do umělců nevešel, odkaz nemá
for (const work of workItems) if (work.f.bq && !items.some(item => item.q === work.f.bq)) delete work.f.bq;

// --- 5. krok: okruhy pro učení ---
const hasMovement = (...keys) => (item) => (item.f.mk || []).some(key => keys.includes(key));
const BY_YEAR = { by: 'y' };
const COLLECTIONS = [
    { id: 'ceske-umeni', label: 'České umění', text: 'Čeští výtvarníci, fotografové a jejich díla', sort: BY_YEAR, test: item => item.cz },
    { id: 'pravek-starovek', label: 'Pravěk a starověk', text: 'Pravěké venuše, antické sochy a jejich autoři', sort: BY_YEAR,
        test: item => ((item.c === 'obrazy' || item.c === 'sochy') && item.f.y < 500) || (item.c === 'umelci' && item.f.born < 400) },
    { id: 'gotika', label: 'Gotika', sort: BY_YEAR, test: item => okruhyOf(item).includes('gotika') },
    { id: 'renesance', label: 'Renesance', text: 'I manýrismus', sort: BY_YEAR, test: hasMovement('renesance', 'manyrismus') },
    { id: 'baroko', label: 'Baroko a rokoko', sort: BY_YEAR, test: hasMovement('baroko', 'rokoko') },
    { id: 'klasicismus-romantismus', label: 'Klasicismus a romantismus', sort: BY_YEAR, test: hasMovement('klasicismus', 'romantismus') },
    { id: 'realismus', label: 'Realismus a akademismus', sort: BY_YEAR, test: hasMovement('realismus', 'akademismus') },
    { id: 'impresionismus', label: 'Impresionismus a postimpresionismus', sort: BY_YEAR, test: hasMovement('impresionismus', 'postimpresionismus') },
    { id: 'secese', label: 'Secese a symbolismus', sort: BY_YEAR, test: hasMovement('secese', 'symbolismus') },
    { id: 'moderni-umeni', label: 'Moderní umění', text: 'Expresionismus, kubismus, surrealismus, abstrakce, pop-art', sort: BY_YEAR,
        test: hasMovement('expresionismus', 'kubismus', 'avantgarda', 'surrealismus', 'abstrakce', 'popart') },
    { id: 'nizozemsti-mistri', label: 'Nizozemští a vlámští mistři', sort: BY_YEAR, test: item => ['Nizozemsko', 'Flandry', 'Belgie'].includes(item.f.land) && item.f.y < 1750 },
    { id: 'malirky-a-socharky', label: 'Umělkyně', sort: BY_YEAR, test: item => item.sx === 'f' },
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

// --- 6. krok: úrovně obtížnosti (scripts/lib/umeni-levels.mjs) ---
// Sláva = geometrický průměr návštěvnosti článku české Wikipedie (60 dní přepočtených na rok) a počtu jazykových verzí (české ×1,3)
const pageviews = await cachedByKey('umeni-pageviews-60d', items.map(item => item.t), czechPageviewsBatch);
console.log(`Návštěvnost článků: ${items.filter(item => Object.hasOwn(pageviews, item.t)).length} z ${items.length}`);
const movementLinks = new Map(candidates.movements);
const PUBLISHED_FILE = new URL('../data/umeni.json', import.meta.url);
const PUBLISHED_KNOWN = new Set(existsSync(PUBLISHED_FILE) ? JSON.parse(readFileSync(PUBLISHED_FILE, 'utf8')).items.filter(item => item.k === 1).map(item => item.q) : []);
for (const item of items) {
    const sl = sitelinks.get(item.q) ?? movementLinks.get(item.q) ?? 0;
    item._ = { fame: fameOf({ pv: pageviews[item.t], sl, cz: item.cz }), always: alwaysKnown.has(item.q), never: neverKnown.has(item.q), protect: PUBLISHED_KNOWN.has(item.q) };
}
// Podíl známých (Základní) a expertních v každé skupině kategorie (české a ostatní zvlášť), minimální sláva známé položky
const LEVELS = {
    obrazy: { known: 0.27, czechKnown: 0.3, minKnown: 60, expert: 0.24, czechExpert: 0.15 },
    sochy: { known: 0.27, czechKnown: 0.3, minKnown: 50, expert: 0.24, czechExpert: 0.15 },
    umelci: { known: 0.22, czechKnown: 0.2, minKnown: 60, expert: 0.27, czechExpert: 0.15 },
    fotografove: { known: 0.2, czechKnown: 0.2, minKnown: 40, expert: 0.27, czechExpert: 0.15 },
    ilustratori: { known: 0.25, czechKnown: 0.3, minKnown: 40, expert: 0.25, czechExpert: 0.15 },
    smery: { known: 0.3, minKnown: 60, expert: 0.25 }
};
for (const category of Object.keys(LEVELS)) console.log(`sláva ${category}: ${fameQuantiles(items, category)}`);
const levelGroups = collections.map(collection => ({ id: collection.id, members: items.filter(item => (item.g || []).includes(collection.id)) }));
const promoted = assignLevels(items, { categories: LEVELS, groups: levelGroups });
if (promoted.length) console.log(`povýšené kvůli minimu okruhu: ${promoted.map(([okruh, name]) => `${okruh}: ${name}`).join('; ')}`);
for (const item of items) delete item._;
for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${levelSummary(category, inCategory)}, českých ${inCategory.filter(item => item.cz).length}`);
}
for (const group of levelGroups) console.log(levelSummary(`okruh ${group.id}`, group.members));
console.log(levelSummary('celkem', items));
if (renamed.size) console.log(`stejnojmenná díla s autorem v názvu: ${[...renamed.keys()].join('; ')}`);

// Popisy, které by prozradily odpověď (Čurající chlapeček / Manneken Pis = „chlapeček“, Kubištův Svatý Šebestián = „kubistický“ ~ Kubišta)
for (const item of items) {
    if (item.q === 'Q152072') item.d = 'bronzová socha močící postavy v Bruselu';
    if (item.n === 'Svatý Šebestián' && /Kubišt/u.test(item.f.by || '')) item.d = 'obraz Bohumila Kubišty z roku 1912';
}
writeTopic('umeni', { collections, items });
