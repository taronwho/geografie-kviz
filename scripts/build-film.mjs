// Téma Film: data/film.json z Wikidat – filmy, režiséři, herci a herečky
// Spuštění: npm run build:film (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { sparql, qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic, statementOrder } from './lib/wikidata.mjs';
import { landsByDescription } from './lib/nationality.mjs';
import { cachedByKey, knownFloor } from './lib/zemepis-levels.mjs';
import { filmPageviews, fameRanks, assignLevels, levelSummary } from './lib/film-levels.mjs';

const HUMAN = 'Q5';
const FEMALE = 'Q6581072';
// Film, celovečerní film, animovaný film a celovečerní animovaný film (krátké a dokumentární filmy ne)
const FILM_TYPES = ['Q11424', 'Q24869', 'Q202866', 'Q29168811'];
// Animovaný film, celovečerní animovaný film a anime film (vlastní kategorie)
const ANIMATED_TYPES = ['Q202866', 'Q29168811', 'Q20650540'];
// Televizní seriál, animovaný seriál, minisérie, animovaný televizní seriál, anime seriál
const SERIES_TYPES = ['Q5398426', 'Q581714', 'Q1259759', 'Q117467246', 'Q63952888'];
const ANIMATED_SERIES = ['Q581714', 'Q117467246', 'Q63952888'];
const MINISERIES = 'Q1259759';
const TV_FILM = 'Q506240';
const DIRECTOR = 'Q2526255';
// Herec, filmový, televizní, divadelní a dabingový herec
const ACTOR_OCCUPATIONS = ['Q33999', 'Q10800557', 'Q10798782', 'Q2259451', 'Q2405480'];
// Česko a Československo (země původu filmu), u osob i Protektorát a České království
const CZECH_FILM_STATES = new Set(['Q213', 'Q33946']);
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q153136']);
const SLOVAKIA = 'Q214';
// Oscar za nejlepší film, režii a herecké výkony
const OSCAR_BEST_PICTURE = 'Q102427';
const OSCAR_PERSON = ['Q103360', 'Q103916', 'Q103618', 'Q106291', 'Q106301'];

const csArticle = (variable) => `?a schema:about ${variable} . ?a schema:isPartOf <https://cs.wikipedia.org/> . ${variable} wikibase:sitelinks ?sl .`;
const fromRows = (rows) => rows.map(row => [id(row.x.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);

// --- 1. krok: kandidáti ---
// Dotazy jsou jednoduché (druh, jazykové verze, český článek), zvládne je i query.wikidata.org; každý zvlášť do mezipaměti
const candidateQuery = (name, query) => cached(`film-candidates-${name}`, async () => fromRows(await sparql(query)));
const films = await candidateQuery('films', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(FILM_TYPES)} } ?x wdt:P31 ?type . ${csArticle('?x')} FILTER(?sl >= 35) }`);
// České filmy i s málo jazykovými verzemi, včetně televizních (pohádky)
const czechFilms = await candidateQuery('czech-films', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values([...FILM_TYPES, TV_FILM])} } VALUES ?state { ${values([...CZECH_FILM_STATES])} }
  ?x wdt:P31 ?type ; wdt:P495 ?state . ${csArticle('?x')} FILTER(?sl >= 3) }`);
const directors = await candidateQuery('directors', `SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P106 wd:${DIRECTOR} ; wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= 30) }`);
const actors = [];
for (const occupation of ACTOR_OCCUPATIONS.slice(0, 2)) {
    actors.push(...await candidateQuery(`actors-${occupation}`, `SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P106 wd:${occupation} ; wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= 45) }`));
}
const czechPeople = await candidateQuery('czech-people', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?occ { ${values([DIRECTOR, ...ACTOR_OCCUPATIONS])} } VALUES ?state { ${values([...CZECH_STATES])} }
  ?x wdt:P106 ?occ ; wdt:P27 ?state ; wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= 5) }`);
// Animované filmy mají vlastní kategorii: i ty s méně jazykovými verzemi (Pat a Mat ve filmu, Fimfárum)
const animatedFilms = await candidateQuery('animated-2', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(ANIMATED_TYPES)} } ?x wdt:P31 ?type . ${csArticle('?x')} FILTER(?sl >= 12) }`);
// Seriály: hrané, animované a minisérie; české i s málo jazykovými verzemi
const seriesCandidates = await candidateQuery('series', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(SERIES_TYPES)} } ?x wdt:P31 ?type . ${csArticle('?x')} FILTER(?sl >= 25) }`);
const czechSeriesCandidates = await candidateQuery('czech-series', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(SERIES_TYPES)} } VALUES ?state { ${values([...CZECH_FILM_STATES])} }
  ?x wdt:P31 ?type ; wdt:P495 ?state . ${csArticle('?x')} FILTER(?sl >= 2) }`);
// Okruhy, které mezi nejznámějšími filmy skoro chybí (westerny, horory, superhrdinové, němý film, zlatý věk Hollywoodu,
// slovenský film, sitcomy a krimi): kandidáti i s méně jazykovými verzemi. Do tématu se dostanou, jen dokud okruh nemá
// cílovou velikost (OKRUH_TARGETS), a to nejznámější z nich
const WESTERN = 'Q172980';
const HORROR = 'Q200092';
const SUPERHERO = 'Q1535153';
const SILENT = 'Q226730';
const genreFilms = await candidateQuery('genre-films', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(FILM_TYPES)} } VALUES ?g { ${values([WESTERN, HORROR, SUPERHERO])} }
  ?x wdt:P31 ?type ; wdt:P136 ?g . ${csArticle('?x')} FILTER(?sl >= 20) }`);
const silentGenreFilms = await candidateQuery('silent-films', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(FILM_TYPES)} } ?x wdt:P31 ?type ; wdt:P136 wd:${SILENT} . ${csArticle('?x')} FILTER(?sl >= 6) }`);
// Staré filmy s rokem premiéry a příznakem amerického původu (na query.wikidata.org dotaz vyprší, QLever ho zvládne)
const oldFilms = await cached('film-candidates-old', async () => (await qlever(`SELECT ?x ?sl (MIN(YEAR(?d)) AS ?y) (MAX(?u) AS ?us) WHERE {
  VALUES ?type { ${values(FILM_TYPES)} } ?x wdt:P31 ?type . ${csArticle('?x')} FILTER(?sl >= 6) ?x wdt:P577 ?d .
  OPTIONAL { ?x wdt:P495 wd:Q30 . BIND(1 AS ?u) } } GROUP BY ?x ?sl HAVING (MIN(YEAR(?d)) < 1960)`))
    .map(row => [id(row.x.value), Number(row.sl.value), Number(row.y.value), row.us ? 1 : 0]).sort((a, b) => b[1] - a[1]));
const silentFilms = oldFilms.filter(([, , year]) => year < 1928).map(([qid, sl]) => [qid, sl]);
const usClassics = oldFilms.filter(([, sl, year, us]) => year < 1960 && us && sl >= 15).map(([qid, sl]) => [qid, sl]);
const oscarFilms = await candidateQuery('oscar-films', `SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P166 wd:${OSCAR_BEST_PICTURE} . ${csArticle('?x')} }`);
const slovakFilms = await candidateQuery('slovak-films', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values([...FILM_TYPES, TV_FILM])} }
  ?x wdt:P31 ?type ; wdt:P495 wd:${SLOVAKIA} . ${csArticle('?x')} FILTER(?sl >= 3) }`);
const slovakPeople = await candidateQuery('slovak-people', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?occ { ${values([DIRECTOR, ...ACTOR_OCCUPATIONS])} }
  ?x wdt:P106 ?occ ; wdt:P27 wd:${SLOVAKIA} ; wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= 3) }`);
// České filmové a televizní pohádky mají často jen český článek (jedna jazyková verze)
const czechFairyTales = await candidateQuery('czech-fairy-tales', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values([...FILM_TYPES, TV_FILM])} }
  VALUES ?state { ${values([...CZECH_FILM_STATES])} } VALUES ?g { wd:Q1957385 wd:Q699 } ?x wdt:P31 ?type ; wdt:P495 ?state ; wdt:P136 ?g . ${csArticle('?x')} }`);
const moreSeries = await candidateQuery('series-more', `SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(SERIES_TYPES)} } ?x wdt:P31 ?type . ${csArticle('?x')} FILTER(?sl >= 12) }`);
const extraFilms = [...new Map([...czechFairyTales, ...genreFilms, ...silentGenreFilms, ...silentFilms, ...usClassics, ...oscarFilms, ...slovakFilms])];
const candidates = {
    films: [...new Map([...films, ...czechFilms, ...extraFilms])].sort((a, b) => b[1] - a[1]),
    people: [...new Map([...directors, ...actors, ...czechPeople, ...slovakPeople])].sort((a, b) => b[1] - a[1]),
    series: [...new Map([...seriesCandidates, ...czechSeriesCandidates, ...moreSeries])].sort((a, b) => b[1] - a[1])
};
console.log(`Kandidáti: ${candidates.films.length} filmů, ${animatedFilms.length} animovaných filmů, ${candidates.people.length} osob, ${candidates.series.length} seriálů`);
const czechFilmIds = new Set(czechFilms.map(([qid]) => qid));
const czechPeopleIds = new Set(czechPeople.map(([qid]) => qid));
const czechSeriesIds = new Set(czechSeriesCandidates.map(([qid]) => qid));
// Podrobnosti jen k nejznámějším (všem českým a kandidátům malých okruhů) – víc by se do tématu stejně nevešlo
const FILM_DETAILS = 2500;
const PEOPLE_DETAILS = 2200;
const ANIMATED_DETAILS = 450;
const SERIES_DETAILS = 1500;
const extraFilmIds = new Set(extraFilms.map(([qid]) => qid));
const filmIds = candidates.films.filter(([qid], index) => index < FILM_DETAILS || czechFilmIds.has(qid) || extraFilmIds.has(qid)).map(([qid]) => qid);
// Animované filmy navíc (ty mezi nejznámějšími filmy už podrobnosti mají)
const filmIdSet = new Set(filmIds);
const animatedExtraIds = animatedFilms.slice(0, ANIMATED_DETAILS).map(([qid]) => qid).filter(qid => !filmIdSet.has(qid));
const seriesIds = candidates.series.filter(([qid], index) => index < SERIES_DETAILS || czechSeriesIds.has(qid)).map(([qid]) => qid);

// --- 2. krok: podrobnosti po dávkách ---
const SINGLE = { t: 1, n: 1, d: 1, en: 1, im: 1, born: 1, died: 1, sex: 1, len: 1 };
const collect = (result) => (row) => {
    const entry = result.get(id(row.item.value));
    const key = row.p.value;
    if (!row.v) return;
    const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
    if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
    else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
};
const filmDetails = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P1476 ?v BIND("title" AS ?p) }
  UNION { ?item wdt:P577 ?v BIND("date" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("made" AS ?p) }
  UNION { ?item wdt:P136 ?v BIND("genre" AS ?p) }
  UNION { ?item wdt:P495 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P57 ?v BIND("dir" AS ?p) }
  UNION { ?item wdt:P161 ?v BIND("cast" AS ?p) }
  UNION { ?item p:P2047/psn:P2047/wikibase:quantityAmount ?v BIND("len" AS ?p) }
  UNION { ?item wdt:P166 ?v BIND("award" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P179 ?v BIND("series" AS ?p) }
}`;
const personDetails = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "mul") BIND("mul" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "en") BIND("en" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P106 ?v BIND("occ" AS ?p) }
  UNION { ?item wdt:P166 ?v BIND("award" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
}`;
const fetchDetails = async (list, query, size) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, size, query, collect(result));
    return [...result];
};
// Doplnění k uložené mezipaměti po klíčích (QID): položky, které přibyly s novými kandidáty → [[QID, hodnota], …]
const moreByKey = async (name, qids, fetchList) => {
    const wanted = new Set(qids);
    const stored = await cachedByKey(name, qids, async (missing) => Object.fromEntries(await fetchList(missing)));
    return Object.entries(stored).filter(([qid]) => wanted.has(qid));
};
const filmMap = new Map(await cached('film-films', () => fetchDetails(filmIds, filmDetails, 25)));
for (const [qid, detail] of await cached('film-animated-films', () => fetchDetails(animatedExtraIds, filmDetails, 25))) if (!filmMap.has(qid)) filmMap.set(qid, detail);
for (const [qid, detail] of await moreByKey('film-films-more', filmIds.filter(qid => !filmMap.has(qid)), (ids) => fetchDetails(ids, filmDetails, 25))) filmMap.set(qid, detail);
// Studio animovaného filmu (P272) – pro otázku „Které studio film natočilo?“
const studioRows = await cached('film-animated-studios', async () => {
    const result = [];
    const ids = [...new Set([...animatedFilms.map(([qid]) => qid)].filter(qid => filmMap.has(qid)))];
    await inBatches(ids, 200, (qids) => `SELECT ?item ?v ?l WHERE { VALUES ?item { ${values(qids)} } ?item wdt:P272 ?v . OPTIONAL { ?v rdfs:label ?l FILTER(LANG(?l) = "en") } }`,
        (row) => result.push([id(row.item.value), id(row.v.value), row.l ? row.l.value : '']));
    return result;
});
// Seriály: začátek a konec vysílání, tvůrce, scénář, stanice, počet řad a dílů
const seriesDetails = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P1476 ?v BIND("title" AS ?p) }
  UNION { ?item wdt:P580 ?v BIND("start" AS ?p) }
  UNION { ?item wdt:P582 ?v BIND("end" AS ?p) }
  UNION { ?item wdt:P577 ?v BIND("date" AS ?p) }
  UNION { ?item wdt:P136 ?v BIND("genre" AS ?p) }
  UNION { ?item wdt:P495 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P170 ?v BIND("creator" AS ?p) }
  UNION { ?item wdt:P58 ?v BIND("writer" AS ?p) }
  UNION { ?item wdt:P57 ?v BIND("dir" AS ?p) }
  UNION { ?item wdt:P161 ?v BIND("cast" AS ?p) }
  UNION { ?item wdt:P449 ?v BIND("net" AS ?p) }
  UNION { ?item wdt:P2437 ?v BIND("seasons" AS ?p) }
  UNION { ?item wdt:P1113 ?v BIND("episodes" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
}`;
const seriesMap = new Map(await cached('film-series', () => fetchDetails(seriesIds, seriesDetails, 25)));
for (const [qid, detail] of await moreByKey('film-series-more', seriesIds.filter(qid => !seriesMap.has(qid)), (ids) => fetchDetails(ids, seriesDetails, 25))) seriesMap.set(qid, detail);
// Jména tvůrců, scenáristů, herců a stanic seriálů (osoby mimo kandidáty nemají podrobnosti)
const seriesRefs = [...new Set([...seriesMap.values()].flatMap(detail => ['creator', 'writer', 'dir', 'cast', 'net', 'genre', 'co', 'type'].flatMap(key => detail[key] || [])))]
    .filter(qid => /^Q\d+$/.test(qid));
const seriesLabels = new Map(await cached('film-series-labels', async () => {
    const result = [];
    await inBatches(seriesRefs, 300, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en" || ?lang = "mul") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]));
    return result;
}));
// Popisy z Wikidat, které někdo hromadně přepsal chybně („americký film“ u italského westernu)
const DESCRIPTION_FIXES = { Q76479: 'italský spaghetti western z roku 1964 od Sergioa Leoneho' };
for (const [qid, description] of Object.entries(DESCRIPTION_FIXES)) if (filmMap.has(qid)) filmMap.get(qid).d = description;
// Osoby: kandidáti a navíc režiséři vybraných filmů (i méně známí – jejich jméno je v nápovědě)
const filmDirectors = [...new Set([...filmMap.values()].flatMap(film => film.dir || []))].filter(qid => /^Q\d+$/.test(qid));
const personIds = [...new Set([...candidates.people.filter(([qid], index) => index < PEOPLE_DETAILS || czechPeopleIds.has(qid)).map(([qid]) => qid), ...filmDirectors])];
const people = new Map(await cached('film-people', () => fetchDetails(personIds, personDetails, 80)));
// Režiséři animovaných filmů přidaných po uložení mezipaměti
const missingPeople = personIds.filter(qid => !people.has(qid));
if (missingPeople.length) for (const [qid, detail] of await cached('film-people-animated', () => fetchDetails(missingPeople, personDetails, 80))) people.set(qid, detail);
for (const [qid, detail] of await moreByKey('film-people-more', personIds.filter(qid => !people.has(qid)), (ids) => fetchDetails(ids, personDetails, 80))) people.set(qid, detail);
console.log(`Podrobnosti: ${filmMap.size} filmů, ${people.size} osob, ${seriesMap.size} seriálů`);
// Jen mezinárodní jméno (mul) mají třeba Marlon Brando nebo Pablo Picasso
for (const person of people.values()) if (!person.n && person.mul) person.n = [].concat(person.mul)[0];

// Pořadí obsazení (P161): SPARQL pořadí výroků nevrací – z API Wikidat [herec, pořadí z kvalifikátoru P1545 nebo null] v pořadí
// výroků, které bývá podle titulků (Kmotr: Brando, Pacino, Caan); zastaralé výroky vynechány
const castOrder = new Map(await cached('film-cast-order', () => statementOrder(filmIds, 'P161')));
for (const [qid, order] of await cached('film-cast-order-animated', () => statementOrder(animatedExtraIds, 'P161'))) castOrder.set(qid, order);
for (const [qid, order] of await cached('film-cast-order-series', () => statementOrder(seriesIds, 'P161'))) castOrder.set(qid, order);
// Pořadí obsazení filmů a seriálů, které přibyly s dalšími kandidáty; když API Wikidat odmítá (429), obsazení podle slávy herců
// a příští běh se zeptá znovu
const moreCastIds = [...filmIds, ...animatedExtraIds, ...seriesIds].filter(qid => !castOrder.has(qid));
// WIKIMEDIA_API=off: API Wikidat a Wikipedie se neptá (jen mezipaměť) – ladění pravidel, když API odmítá
const OFFLINE = process.env.WIKIMEDIA_API === 'off';
const moreCast = await moreByKey('film-cast-order-more', moreCastIds, (ids) => OFFLINE ? Promise.reject(new Error('WIKIMEDIA_API=off')) : statementOrder(ids, 'P161')).catch(error => {
    console.warn(`  pořadí obsazení: ${error.message} – u ${moreCastIds.length} filmů a seriálů podle slávy herců`);
    return [];
});
for (const [qid, order] of moreCast) castOrder.set(qid, order);
// Místo herce v obsazení: pořadí z kvalifikátoru, jinak pořadí výroku (za těmi s kvalifikátorem), neznámý na konec
const castPosition = (film, actor) => {
    const order = castOrder.get(film) || [];
    const index = order.findIndex(([qid]) => qid === actor);
    if (index < 0) return Infinity;
    return order[index][1] ?? 10000 + index;
};

// České názvy žánrů, zemí, ocenění a povolání
const referenced = new Set();
for (const film of filmMap.values()) for (const key of ['genre', 'co', 'award', 'type', 'series']) (film[key] || []).forEach(qid => referenced.add(qid));
for (const person of people.values()) for (const key of ['cit', 'occ']) (person[key] || []).forEach(qid => referenced.add(qid));
for (const qid of referenced) if (!/^Q\d+$/.test(qid)) referenced.delete(qid);
const labels = new Map(await cached('film-labels', async () => {
    const result = [];
    await inBatches([...referenced], 300, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]));
    return result;
}));
// Názvy, které přibyly s animovanými filmy a seriály
const missingLabels = [...referenced, ...seriesRefs].filter(qid => !labels.has(`cs:${qid}`) && !labels.has(`en:${qid}`));
for (const [key, value] of await cached('film-labels-extra', async () => {
    const result = [];
    await inBatches([...new Set(missingLabels)], 300, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]));
    return result;
})) labels.set(key, value);
for (const [key, value] of seriesLabels) if (!labels.has(key)) labels.set(key, value);
// Názvy, které přibyly s dalšími kandidáty (QID → [[jazyk, název], …])
const stillMissing = [...new Set([...referenced, ...seriesRefs])].filter(qid => !labels.has(`cs:${qid}`) && !labels.has(`en:${qid}`) && !labels.has(`mul:${qid}`));
for (const [qid, list] of await moreByKey('film-labels-more', stillMissing, async (ids) => {
    const result = new Map(ids.map(qid => [qid, []]));
    await inBatches(ids, 300, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en" || ?lang = "mul") }`,
        (row) => result.get(id(row.item.value)).push([row.lang.value, row.l.value]));
    return [...result];
})) for (const [lang, label] of list) { labels.set(`${lang}:${qid}`, label); if (!seriesLabels.has(`${lang}:${qid}`)) seriesLabels.set(`${lang}:${qid}`, label); }
const cs = (qid) => labels.get(`cs:${qid}`);
const en = (qid) => labels.get(`en:${qid}`) || '';
const sitelinks = new Map([...candidates.films, ...animatedFilms, ...candidates.people, ...candidates.series]);
// Název bez upřesnění v závorce („Kolja (film)“ → Kolja), s velkým písmenem
// Zdvojené jméno ze štítku („Zendaya Zendaya“) jen jednou
const nameOf = (detail) => {
    const name = (detail.n || detail.t || '').replace(/ \(.*\)$/, '').trim().replace(/^(\S+) \1$/u, '$1');
    return name.charAt(0).toUpperCase() + name.slice(1);
};

// --- 3. krok: pravidla ---
const THIS_YEAR = new Date().getFullYear();
// Žánry: krátký český název, v pořadí od nejvýstižnějšího (pohádka, western) po obecné (komedie, drama)
const GENRES = [['Q1957385', 'pohádka'], ['Q699', 'pohádka'], ['Q172980', 'western'], ['Q471839', 'sci-fi'], ['Q200092', 'horor'], ['Q842256', 'muzikál'],
    ['Q1535153', 'superhrdinský film'], ['Q369747', 'válečný film'], ['Q202866', 'animovaný film'], ['Q645928', 'životopisný film'],
    ['Q17013749', 'historický film'], ['Q959790', 'krimi'], ['Q2297927', 'špionážní film'], ['Q2484376', 'thriller'], ['Q157394', 'fantasy'],
    ['Q188473', 'akční film'], ['Q319221', 'dobrodružný film'], ['Q1361932', 'rodinný film'], ['Q1054574', 'romantický film'],
    ['Q859369', 'komediální drama'], ['Q157443', 'komedie'], ['Q130232', 'drama']];
const genresOf = (detail) => {
    const own = new Set([...(detail.genre || []), ...(detail.type || [])]);
    return [...new Set(GENRES.filter(([qid]) => own.has(qid)).map(([, label]) => label))];
};
const ANIMATED = ANIMATED_TYPES;
// Studio animovaného filmu podle produkční společnosti: jen velká studia, která hráč zná. Pixar a DreamWorks mají přednost
// před distributorem (Pixar s Disneyem); s více studii najednou (koprodukce) studio neuvádíme
const STUDIOS = [['Pixar', /pixar/i], ['DreamWorks', /dreamworks animation|pacific data images|^dreamworks$/i], ['Studio Ghibli', /ghibli/i], ['Illumination', /^illumination/i],
    ['Blue Sky Studios', /blue sky/i], ['Aardman', /aardman/i], ['Laika', /^laika/i], ['Sony Pictures Animation', /sony pictures animation/i],
    ['Walt Disney', /walt disney|disney animation|disneytoon/i], ['Warner Bros.', /warner/i], ['Toei Animation', /toei/i], ['Krátký film Praha', /krátký film|kratky film|bratři v triku|jiřího trnky/i]];
const studiosByFilm = new Map();
for (const [film, studio, label] of studioRows) studiosByFilm.set(film, [...(studiosByFilm.get(film) || []), label || studio]);
const studioOf = (qid) => {
    const found = [...new Set((studiosByFilm.get(qid) || []).map(label => (STUDIOS.find(([, pattern]) => pattern.test(label)) || [])[0]).filter(Boolean))];
    if (found.includes('Pixar')) return 'Pixar';
    // Filmy Aardman s DreamWorks (Slepičí úlet) jsou filmy Aardman
    if (found.includes('Aardman')) return 'Aardman';
    if (found.includes('DreamWorks')) return 'DreamWorks';
    return found.length === 1 ? found[0] : undefined;
};
const DOCUMENTARY = 'Q93204';
// Rok premiéry: nejstarší datum zveřejnění. Na desetiletí se ptáme, jen když je jisté – premiéra na přelomu desetiletí
// (festival v prosinci 1969, kina v roce 1970) nebo natočení v jiném desetiletí (Skřivánci na niti 1969/1990) by daly dvě odpovědi
const decadeOf = (year) => Math.floor(year / 10) * 10;
const filmYear = (detail) => {
    const years = [...new Set((detail.date || []).map(yearOf).filter(year => year !== undefined && year >= 1880))].sort((a, b) => a - b);
    if (!years.length) return {};
    const year = years[0];
    const made = (detail.made || []).map(yearOf).filter(Boolean);
    const sure = !(year % 10 === 9 && years.includes(year + 1)) && made.every(other => decadeOf(other) === decadeOf(year));
    return { year, sure };
};

// Osoby: obor podle prvního filmového slova v popisu (Chaplin „herec, režisér“ je herec, Hitchcock režisér);
// zpěváci, politici a spisovatelé, kteří občas hráli, ne – leda by hráli v mnoha filmech z dat (Keanu Reeves „baskytarista a herec“)
const ACTOR_WORD = /(?<!\p{L})(herec|herečk)/iu;
const DIRECTOR_WORD = /(?<!\p{L})(režisér|filmař)/iu;
const OTHER_WORD = /(?<!\p{L})(zpěv|spisovatel|politik|hudebn|básn|fotbal|model|podnikatel|moderátor|tanečn|rapper|skladatel|basketbal|hokej|kulturist|dabér|animátor|producent|komik|komičk|písničkář|král|princ|zápasník|sportov|tenist|atlet|novinář|youtuber)/iu;
const roleOf = (detail, filmCount) => {
    const text = (detail.d || '').toLowerCase();
    const actor = text.search(ACTOR_WORD);
    const director = text.search(DIRECTOR_WORD);
    const first = [actor, director].filter(index => index >= 0).sort((a, b) => a - b)[0];
    if (first === undefined) return null;
    const other = text.search(OTHER_WORD);
    if (other >= 0 && other < first && filmCount < 3) return null;
    return first === actor ? 'herci' : 'reziseri';
};
// Země podle přídavného jména na začátku popisu („americký herec“ → USA)
const NATIONS = [['československ', 'Československo'], ['česk', 'Česko'], ['slovensk', 'Slovensko'], ['americk', 'USA'], ['britsk', 'Spojené království'],
    ['anglick', 'Spojené království'], ['skotsk', 'Spojené království'], ['velšsk', 'Spojené království'], ['irsk', 'Irsko'], ['kanadsk', 'Kanada'],
    ['australsk', 'Austrálie'], ['novozélandsk', 'Nový Zéland'], ['francouzsk', 'Francie'], ['italsk', 'Itálie'], ['španělsk', 'Španělsko'],
    ['německ', 'Německo'], ['rakousk', 'Rakousko'], ['švýcarsk', 'Švýcarsko'], ['polsk', 'Polsko'], ['maďarsk', 'Maďarsko'], ['rusk', 'Rusko'],
    ['sovětsk', 'Sovětský svaz'], ['ukrajinsk', 'Ukrajina'], ['švédsk', 'Švédsko'], ['dánsk', 'Dánsko'], ['norsk', 'Norsko'], ['finsk', 'Finsko'],
    ['nizozemsk', 'Nizozemsko'], ['belgick', 'Belgie'], ['řeck', 'Řecko'], ['portugalsk', 'Portugalsko'], ['mexick', 'Mexiko'], ['brazilsk', 'Brazílie'],
    ['argentinsk', 'Argentina'], ['japonsk', 'Japonsko'], ['čínsk', 'Čína'], ['hongkongsk', 'Hongkong'], ['tchajwansk', 'Tchaj-wan'],
    ['korejsk', 'Jižní Korea'], ['jihokorejsk', 'Jižní Korea'], ['indick', 'Indie'], ['íránsk', 'Írán'], ['izraelsk', 'Izrael'], ['tureck', 'Turecko'],
    ['egyptsk', 'Egypt'], ['srbsk', 'Srbsko'], ['jugoslávsk', 'Jugoslávie'], ['chorvatsk', 'Chorvatsko'], ['bosensk', 'Bosna a Hercegovina'],
    ['rumunsk', 'Rumunsko'], ['bulharsk', 'Bulharsko'], ['gruzínsk', 'Gruzie'], ['jihoafrick', 'Jihoafrická republika'], ['islandsk', 'Island']];
const landOf = (detail) => {
    const first = ((detail.d || '').trim().split(/\s+/)[0] || '').toLowerCase().split('-')[0];
    const found = /(ský|cký|ská|cká|ký|ká)$/u.test(first) && NATIONS.find(([stem]) => first.startsWith(stem));
    return found ? found[1] : undefined;
};
const isCzechPerson = (detail) => !(detail.cit || []).includes(SLOVAKIA) && (/^(česk(?!oslovensk)|moravsk)/iu.test((detail.d || '').trim())
    || ((detail.cit || []).some(qid => CZECH_STATES.has(qid)) && !landOf(detail)));
const lifeYears = (detail) => {
    let born = yearOf(detail.born);
    let died = yearOf(detail.died);
    if (born !== undefined && born > THIS_YEAR) born = undefined;
    if (died !== undefined && died > THIS_YEAR) died = undefined;
    if (born !== undefined && died !== undefined && (died <= born || died - born > 105)) died = undefined;
    return { born, died };
};
// Nejznámější české filmy a filmaři (v jiných jazycích jich je málo, podle jazykových verzí by vyšla spíš nová vlna než Pelíšky)
const CZECH_KNOWN = new Set(['Ostře sledované vlaky', 'Kolja', 'Pelíšky', 'Obecná škola', 'Tři oříšky pro Popelku', 'Marketa Lazarová',
    'Limonádový Joe aneb Koňská opera', 'Vesničko má středisková', 'Kulový blesk', 'Hoří, má panenko', 'Lásky jedné plavovlásky', 'Obchod na korze',
    'Musíme si pomáhat', 'Tmavomodrý svět', 'Postřižiny', 'Adéla ještě nevečeřela', 'Císařův pekař – Pekařův císař', 'Pyšná princezna',
    'Byl jednou jeden král…', 'S čerty nejsou žerty', 'Princezna se zlatou hvězdou', 'Jára Cimrman ležící, spící', 'Vratné lahve', 'Občanský průkaz',
    'Samotáři', 'Vynález zkázy', 'Cesta do pravěku', 'Spalovač mrtvol', 'Sedmikrásky', 'Jáchyme, hoď ho do stroje!', 'Marečku, podejte mi pero!',
    'Slavnosti sněženek', 'Báječná léta pod psa', 'Na samotě u lesa', 'Dobrý voják Švejk', 'Želary', 'Šakalí léta', 'Knoflíkáři', 'Pupendo',
    'Ať žijí duchové!', 'Jak utopit dr. Mráčka aneb Konec vodníků v Čechách', 'Což takhle dát si špenát', 'Kdo chce zabít Jessii?', 'Ikarie XB 1',
    'Valerie a týden divů', 'Až přijde kocour', 'Nabarvené ptáče', 'Jan Žižka', 'Obsluhoval jsem anglického krále', 'Zítra vstanu a opařím se čajem',
    'Miloš Forman', 'Jiří Menzel', 'Jan Svěrák', 'Věra Chytilová', 'František Vláčil', 'Karel Zeman', 'Oldřich Lipský', 'Jan Hřebejk', 'Václav Vorlíček',
    'Karel Kachyňa', 'Martin Frič', 'Juraj Herz', 'Ladislav Smoljak', 'Jan Švankmajer', 'Otakar Vávra', 'Jiří Trnka', 'Jan Němec', 'Ivan Passer',
    'Petr Zelenka', 'Bořivoj Zeman', 'Agnieszka Holland', 'Juraj Jakubisko', 'Vojtěch Jasný',
    'Rudolf Hrušínský', 'Bolek Polívka', 'Vlastimil Brodský', 'Josef Kemr', 'Vladimír Menšík', 'Libuše Šafránková', 'Boleslav Polívka', 'Josef Abrhám', 'Zdeněk Svěrák',
    'Jiří Sovák', 'Miroslav Donutil', 'Ivan Trojan', 'Jiří Bartoška', 'Karel Roden', 'Jana Brejchová', 'Iva Janžurová', 'Jiřina Bohdalová', 'Vlasta Burian',
    'Oldřich Nový', 'Hugo Haas', 'Lída Baarová', 'Adina Mandlová', 'Jaroslav Marvan', 'Jan Werich', 'Miroslav Horníček', 'Jiří Lábus', 'Oldřich Kaiser',
    'Pavel Landovský', 'Petr Čepek', 'Jiří Hrzán', 'Dana Medřická', 'Marek Eben', 'Eva Holubová', 'Simona Stašová', 'Jaroslav Dušek', 'Anna Geislerová',
    'Tatiana Vilhelmová', 'Jiří Macháček', 'Jan Tříska', 'Josef Somr', 'Václav Neckář', 'Karel Höger', 'Radoslav Brzobohatý', 'Jiří Kodet',
    'Jana Preissová', 'Petr Nárožný', 'Ondřej Vetchý', 'Vlasta Chramostová', 'Miloš Kopecký', 'Ladislav Pešek', 'Theodor Pištěk', 'Eduard Cupák',
    // Pohádky, které každý rok běží v televizi (v jiných jazycích o nich články skoro nejsou)
    'Princ a Večernice', 'Tři veteráni', 'Hrátky s čertem', 'Jak se budí princezny', 'O princezně Jasněnce a létajícím ševci', 'Nesmrtelná teta',
    'Rumburak', 'Dvanáct měsíčků', 'Honza málem králem', 'Princezna a půl království', 'Čertova nevěsta', 'Obušku, z pytle ven!']);
// Světové filmy, které zná každý, i když české články o nich čte málokdo (Chaplinovy němé grotesky)
const WORLD_FILMS_KNOWN = new Set(['Zlaté opojení', 'Cirkus', 'Světla velkoměsta', 'Moderní doba', 'Diktátor', 'Kid']);

// Světoví filmaři a herci, které zná každý, i když v datech mají jen jeden film (podle počtu jazykových verzí vycházejí hned za limitem známých)
const FILM_KNOWN = new Set(['Sergej Michajlovič Ejzenštejn', 'Andrej Arseňjevič Tarkovskij', 'François Truffaut', 'Jean-Luc Godard', 'Pedro Almodóvar', 'John Ford',
    'Frank Capra', 'Bernardo Bertolucci', 'Judy Garlandová', 'Katharine Hepburnová', 'Ingrid Bergmanová', 'Greta Garbo', 'Mel Gibson', 'Jennifer Anistonová',
    'Whoopi Goldbergová', 'Salma Hayeková', 'Antonio Banderas', 'Gérard Depardieu', 'Sidney Poitier', 'Kirk Douglas', 'Cary Grant', 'Gene Wilder', 'Joan Crawfordová',
    'Reese Witherspoonová', 'Chuck Norris', 'Werner Herzog', 'Fritz Lang', 'Sofia Coppola', 'David Fincher', 'Wes Anderson', 'Darren Aronofsky', 'Paul Verhoeven']);

// Nejznámější české seriály (v cizích jazycích o nich články skoro nejsou)
const CZECH_SERIES_KNOWN = new Set(['Nemocnice na kraji města', 'Arabela', 'Návštěvníci', 'Pan Tau', 'Chalupáři', 'Třicet případů majora Zemana',
    'Žena za pultem', 'Sanitka', 'Létající Čestmír', 'Křeček v noční košili', 'My všichni školou povinní', 'Bylo nás pět', 'Taková normální rodinka',
    'Četnické humoresky', 'Vyprávěj', 'Ordinace v růžové zahradě', 'Ulice', 'Okresní přebor', 'Most!', 'Kriminálka Anděl', 'Byl jednou jeden dům',
    'Inženýrská odysea', 'Muž na radnici', 'Okres na severu', 'F. L. Věk', 'Malý pitaval z velkého města', 'Hříšní lidé města pražského',
    'Pohádky z mechu a kapradí', 'Krtek', 'Pat a Mat', 'Bob a Bobek', 'Maxipes Fík', 'Mach a Šebestová', 'Krkonošské pohádky', 'Byli jednou dva písaři',
    'Lucie, postrach ulice', 'Případy 1. oddělení', 'Comeback', 'Zdivočelá země', 'Cirkus Humberto', 'Rodáci', 'Dobrá voda', 'Božská Ema',
    'Třetí patro', 'Rozpaky kuchaře Svatopluka', 'Pohádky pro Emu', 'Gympl s (r)učením omezeným', 'Sanitka 2', 'Policie Modrava']);
// Okruhy pro učení (podle nich se doplňují malé okruhy a určuje spodní hranice známých položek)
const isFilmItem = (item) => item.c === 'filmy' || item.c === 'animovane';
const hasGenre = (...qids) => (item) => isFilmItem(item) && qids.some(qid => (item.genreIds || []).includes(qid));
const BY_YEAR = { by: 'y' };
const COLLECTIONS = [
    { id: 'cesky-film', label: 'Český film', text: 'České a československé filmy, seriály, režiséři a herci', sort: BY_YEAR, test: item => item.cz },
    { id: 'ceska-klasika', label: 'Česká filmová klasika', text: 'České a československé filmy do roku 1989', sort: BY_YEAR, test: item => item.c === 'filmy' && item.cz && item.f.year < 1990 },
    { id: 'zlata-sedesata', label: 'Zlatá šedesátá', text: 'Česká nová vlna a filmy 60. let', sort: BY_YEAR, test: item => item.c === 'filmy' && item.cz && item.f.year >= 1960 && item.f.year < 1970 },
    { id: 'slovensky-film', label: 'Slovenský film', text: 'Slovenské filmy, režiséři a herci', sort: BY_YEAR, test: item => [].concat(item.f.land || []).includes('Slovensko') },
    { id: 'pohadky', label: 'Filmové pohádky', sort: BY_YEAR, test: hasGenre('Q1957385', 'Q699') },
    { id: 'oscar-film', label: 'Oscar za nejlepší film', sort: BY_YEAR, test: item => item.c === 'filmy' && item.f.osc },
    { id: 'drzitele-oscara', label: 'Držitelé Oscara', text: 'Režiséři, herci a herečky s Oscarem', sort: BY_YEAR, test: item => item.c !== 'filmy' && item.f.osc },
    { id: 'ceske-serialy', label: 'České seriály', text: 'Seriály České a Československé televize i novější', sort: BY_YEAR, test: item => item.c === 'serialy' && item.cz },
    { id: 'animovane-serialy', label: 'Animované seriály', text: 'Večerníčky, Simpsonovi, anime…', sort: BY_YEAR, test: item => item.c === 'serialy' && item.ty === 'animovaný seriál' },
    { id: 'sitcomy', label: 'Sitcomy', sort: BY_YEAR, test: item => item.c === 'serialy' && (item.f.gen || []).includes('sitcom') },
    { id: 'krimi-serialy', label: 'Kriminální seriály', sort: BY_YEAR, test: item => item.c === 'serialy' && (item.f.gen || []).includes('krimi') },
    { id: 'ceska-animace', label: 'Česká animace', text: 'České a československé animované filmy a večerníčky', sort: BY_YEAR,
        test: item => item.cz && (item.c === 'animovane' || item.c === 'serialy' && item.ty === 'animovaný seriál') },
    { id: 'disney', label: 'Disney', text: 'Animované filmy studia Walta Disneyho', sort: BY_YEAR, test: item => item.f.studio === 'Walt Disney' },
    { id: 'pixar', label: 'Pixar', sort: BY_YEAR, test: item => item.f.studio === 'Pixar' },
    { id: 'dreamworks', label: 'DreamWorks', sort: BY_YEAR, test: item => item.f.studio === 'DreamWorks' },
    { id: 'ghibli', label: 'Studio Ghibli', sort: BY_YEAR, test: item => item.f.studio === 'Studio Ghibli' },
    { id: 'sci-fi', label: 'Sci-fi', sort: BY_YEAR, test: hasGenre('Q471839') },
    { id: 'westerny', label: 'Westerny', sort: BY_YEAR, test: hasGenre('Q172980') },
    { id: 'horory', label: 'Horory', sort: BY_YEAR, test: hasGenre('Q200092') },
    { id: 'valecne', label: 'Válečné filmy', sort: BY_YEAR, test: hasGenre('Q369747') },
    { id: 'muzikaly', label: 'Muzikály', sort: BY_YEAR, test: hasGenre('Q842256') },
    { id: 'superhrdinove', label: 'Superhrdinové', sort: BY_YEAR, test: hasGenre('Q1535153') },
    { id: 'nemy-film', label: 'Němý film', text: 'Filmy z doby před zvukem', sort: BY_YEAR, test: item => item.c === 'filmy' && (item.ty === 'němý film' || item.f.year < 1928) },
    { id: 'hollywood-klasika', label: 'Zlatý věk Hollywoodu', text: 'Americké filmy do roku 1960', sort: BY_YEAR,
        test: item => item.c === 'filmy' && (item.f.land || []).includes('Spojené státy americké') && item.f.year < 1960 }
];
// --- 4. krok: položky ---
// Limity kategorií: zahraniční (limit) a české (czLimit) podle jazykových verzí, navíc české podle návštěvnosti české Wikipedie
// (czPv – televizní pohádky a seriály, které Češi znají, i když v jiných jazycích o nich články nejsou); úrovně určí až 5. krok
const LIMITS = {
    // Animované filmy jsou zvlášť (dřív zabíraly asi 60 míst mezi filmy a 35 mezi známými)
    filmy: { limit: 650, czLimit: 200, czPv: 60 },
    animovane: { limit: 190, czLimit: 30, czPv: 5 },
    serialy: { limit: 180, czLimit: 70, czPv: 25 },
    reziseri: { limit: 200, czLimit: 40, czPv: 5 },
    herci: { limit: 480, czLimit: 110, czPv: 20 }
};
// Cílová velikost okruhů, které by mezi nejznámějšími v kategorii skoro chyběly (westerny, němý film, sitcomy, filmové
// pohádky): doplní se nejznámějšími dalšími kandidáty nad limit kategorie
const OKRUH_TARGETS = {
    westerny: 70, horory: 150, 'hollywood-klasika': 100, superhrdinove: 110, 'nemy-film': 42, 'oscar-film': 100,
    pohadky: 120, 'zlata-sedesata': 75, 'slovensky-film': 90, 'ceska-animace': 45,
    disney: 75, pixar: 27, dreamworks: 45, ghibli: 20,
    sitcomy: 90, 'krimi-serialy': 120, 'animovane-serialy': 120
};
const names = new Set();
const nameKey = (name) => name.toLocaleLowerCase('cs');
const items = [];
const rank = {};
const czechRank = {};
const groupsOf = (item) => COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
// Návštěvnost článků české Wikipedie (známost českých a slovenských položek, které mají málo jazykových verzí)
const pageviews = await filmPageviews([...new Set([...filmMap.values(), ...people.values(), ...seriesMap.values()].map(detail => detail.t).filter(Boolean))], { offline: OFFLINE });
// Přidá položku, pokud se vejde do limitu (české do vlastního); force = doplnění malého okruhu nad limit.
// level = { hand, never, minor, local } pro 5. krok (viz film-levels.mjs); vrátí přidanou položku
const add = (category, item, isCzech, level, force = false) => {
    const settings = LIMITS[category];
    const position = rank[category] || 0;
    const czechPosition = czechRank[category] || 0;
    // Nejznámější české položky (ruční seznam) se vejdou vždy
    const full = !force && (isCzech ? czechPosition >= settings.czLimit : position >= settings.limit) && !(level.local && level.hand);
    if (full) return null;
    // Jedna položka na jméno (Babička z roku 1940, ne remake)
    if (names.has(nameKey(item.n))) return null;
    names.add(nameKey(item.n));
    if (isCzech) czechRank[category] = czechPosition + 1;
    else rank[category] = position + 1;
    const entry = compact({ ...item, c: category, k: 0, cz: isCzech ? 1 : undefined });
    entry._ = { sl: sitelinks.get(item.q) || 0, pv: pageviews[item.t], ...level };
    items.push(entry);
    return entry;
};
// Pořadí kandidátů: české a slovenské podle lepšího ze dvou pořadí – podle jazykových verzí (klasika jako Hej rup! nebo Krakatit)
// a podle návštěvnosti české Wikipedie (televizní pohádky, novější filmy); ostatní podle jazykových verzí
const byFame = (list) => {
    const entries = list.map(candidate => ({ candidate, sl: sitelinks.get(candidate.item.q) || 0, pv: candidate.level.local ? pageviews[candidate.item.t] : undefined }));
    const localEntries = entries.filter(entry => entry.candidate.level.local);
    const bySl = fameRanks(localEntries, 0);
    const byPv = fameRanks(localEntries, 1);
    const world = fameRanks(entries.filter(entry => !entry.candidate.level.local), 0);
    return entries.map(entry => [entry.candidate, bySl.has(entry) ? Math.min(bySl.get(entry), byPv.get(entry)) : world.get(entry)])
        .sort((a, b) => a[1] - b[1]).map(([candidate]) => candidate);
};
// Nejdřív české položky (od nejznámějších v Česku), pak ostatní podle jazykových verzí
// Do limitů podle jazykových verzí (pořadí kandidátů), pak české položky s nejvyšší návštěvností nad limit (czPv)
const addMain = (list, addOne = (candidate, force) => add(candidate.category, candidate.item, candidate.isCzech, candidate.level, force), onAdd = () => {}) => {
    for (const candidate of list) {
        const entry = addOne(candidate, false);
        if (entry) onAdd(entry);
    }
    const added = {};
    const popular = list.filter(candidate => candidate.isCzech && pageviews[candidate.item.t] && hasHints(candidate) && !names.has(nameKey(candidate.item.n)))
        .sort((a, b) => pageviews[b.item.t] - pageviews[a.item.t]);
    for (const candidate of popular) {
        if ((added[candidate.category] || 0) >= LIMITS[candidate.category].czPv || names.has(nameKey(candidate.item.n))) continue;
        const entry = addOne(candidate, true);
        if (!entry) continue;
        added[candidate.category] = (added[candidate.category] || 0) + 1;
        onAdd(entry);
    }
};
// Doplní okruhy pod cílovou velikostí nejznámějšími kandidáty, kteří se do limitu kategorie nevešli; jen s popisem
const topUp = (list, onAdd = () => {}, addOne = (candidate) => add(candidate.category, candidate.item, candidate.isCzech, candidate.level, true)) => {
    const counts = new Map();
    const count = (item) => { for (const group of groupsOf(item)) counts.set(group, (counts.get(group) || 0) + 1); };
    items.forEach(count);
    let added = 0;
    for (const candidate of byFame(list)) {
        if (!candidate.item.d || !hasHints(candidate) || names.has(nameKey(candidate.item.n))) continue;
        const groups = groupsOf({ ...candidate.item, c: candidate.category, cz: candidate.isCzech ? 1 : undefined });
        if (!groups.some(group => OKRUH_TARGETS[group] && (counts.get(group) || 0) < OKRUH_TARGETS[group])) continue;
        const entry = addOne(candidate);
        if (!entry) continue;
        count(entry);
        onAdd(entry, candidate);
        added++;
    }
    return added;
};
const isSlovak = (item) => [].concat(item.f.land || []).includes('Slovensko');
// Popis z faktů, když český ve Wikidatech chybí – ve stylu popisů z Wikidat („film, western: USA“; jméno filmu ani režiséra ne)
const SHORT_LAND = { 'Spojené státy americké': 'USA' };
const factDescription = (item) => {
    const kinds = [...new Set([item.ty, ...(item.f.gen || []).map(genre => genre.replace(/ film$/u, ''))])].join(', ');
    const lands = [].concat(item.f.land || []).map(land => SHORT_LAND[land] || land).join(', ');
    // Bez roku: ten je v nápovědě „o filmu“ (s rokem v popisu by nápověda nic nepřidala)
    return lands ? `${kinds}: ${lands}` : kinds;
};
// Seriál nad limit kategorie (doplnění okruhu, návštěvnost) jen s něčím do nápověd: herci, stanice nebo žánr
const hasHints = (candidate) => candidate.category !== 'serialy' || Boolean(candidate.item.f.cast || candidate.item.f.net || candidate.item.f.gen);

// Filmy: s rokem premiéry, ne dokumenty, seriály a budoucí filmy; české = jen české a československé, nebo s českým režisérem
// (koprodukce natočené v Praze jako Casino Royale ne)
const FACT_LABEL_WORD = /(?<!\p{L})Země(?!\p{L})/u;
const filmItems = [];
const filmCandidates = [];
const personName = (qid) => people.has(qid) && people.get(qid).n ? nameOf(people.get(qid)) : undefined;
// Filmy i animované filmy podle počtu jazykových verzí
const filmOrder = [...new Map([...candidates.films, ...animatedFilms])].sort((a, b) => b[1] - a[1]);
for (const [qid] of filmOrder) {
    const detail = filmMap.get(qid);
    // Český štítek ve Wikidatech občas chybí (Avatar) – název pak vychází z názvu článku
    // Název se slovem „Země“ by prozradil fakt Země v okně otázky (Hledání Země Nezemě, Doba ledová 4: Země v pohybu)
    if (!detail || !detail.t || FACT_LABEL_WORD.test(nameOf(detail))) continue;
    const types = (detail.type || []).map(type => `${cs(type) || ''} ${en(type)}`).join(' | ');
    if (/seriál|minisérie|series|krátký|short/iu.test(types) || (detail.genre || []).includes(DOCUMENTARY) && !(detail.genre || []).some(genre => GENRES.some(([q]) => q === genre))) continue;
    const { year, sure } = filmYear(detail);
    if (year === undefined || year > THIS_YEAR) continue;
    const countries = detail.co || [];
    const directorIds = (detail.dir || []).filter(director => personName(director));
    const isCzech = countries.some(state => CZECH_FILM_STATES.has(state))
        && (countries.every(state => CZECH_FILM_STATES.has(state) || state === SLOVAKIA) || directorIds.some(director => isCzechPerson(people.get(director))));
    const isTvFilm = (detail.type || []).includes(TV_FILM) && !(detail.type || []).some(type => FILM_TYPES.includes(type));
    if (isTvFilm && !isCzech) continue;
    // Herci podle obsazení (pořadí v titulcích, castPosition), ne podle slávy – u Captain Marvel Brie Larson, ne Scarlett Johansson
    // v cameo roli; nejdřív herci, až pak režiséři a další v cameo roli (Vláčil ve Vesničko má středisková, Stan Lee ve Spider-Manovi)
    const isActor = (qid) => roleOf(people.get(qid), 0) === 'herci' ? 1 : 0;
    const cast = [...new Set(detail.cast || [])].filter(actor => personName(actor))
        .sort((a, b) => isActor(b) - isActor(a) || castPosition(qid, a) - castPosition(qid, b) || (sitelinks.get(b) || 0) - (sitelinks.get(a) || 0));
    const genres = genresOf(detail);
    const animated = (detail.type || []).some(type => ANIMATED.includes(type)) || genres.includes('animovaný film');
    const category = animated ? 'animovane' : 'filmy';
    const minutes = detail.len ? Math.round(Number(detail.len) / 60) : undefined;
    // Krátké němé filmy z počátků kinematografie (Kansas Saloon Smashers) nejsou celovečerní filmy
    if (year < 1928 && (minutes !== undefined ? minutes < 40 : year < 1910)) continue;
    const item = {
        q: qid,
        t: detail.t,
        n: nameOf(detail),
        ty: animated ? 'animovaný film' : isTvFilm ? 'televizní film' : (detail.genre || []).includes(SILENT) || year < 1928 ? 'němý film' : 'film',
        d: detail.d,
        f: compact({
            year,
            dq: sure ? 1 : undefined,
            gen: genres.filter(genre => genre !== 'animovaný film').slice(0, 2),
            // Napřed země z popisu („britský film“; Wikidata je řadí náhodně), pak Česko a Československo (Tři oříšky pro Popelku jsou i německé)
            land: landsByDescription(detail.d, [...countries].sort((a, b) => (CZECH_FILM_STATES.has(b) ? 1 : 0) - (CZECH_FILM_STATES.has(a) ? 1 : 0)).map(cs).filter(Boolean)).slice(0, 2),
            dir: directorIds.slice(0, 2).map(personName),
            dq1: directorIds.length === 1 ? directorIds[0] : undefined,
            cast: cast.slice(0, 4).map(personName),
            len: minutes >= 40 && minutes <= 300 ? minutes : undefined,
            osc: (detail.award || []).includes(OSCAR_BEST_PICTURE) ? 1 : undefined,
            // Původní název (Pulp Fiction, The Godfather) pro psanou odpověď, jen latinkou a jiný než český
            orig: (detail.title || []).find(title => /^[\p{Script=Latin}\d\s\p{P}]+$/u.test(title) && nameKey(title) !== nameKey(nameOf(detail))),
            y: year
        }),
        // Pomocné údaje pro okruhy a filmografie osob
        castIds: cast,
        directorIds,
        genreIds: [...(detail.genre || []), ...(detail.type || [])],
        animated,
        studio: animated ? studioOf(qid) : undefined
    };
    if (item.studio) item.f.studio = item.studio;
    delete item.studio;
    if (!item.d) item.d = factDescription(item);
    const level = { hand: isCzech ? CZECH_KNOWN.has(item.n) : WORLD_FILMS_KNOWN.has(item.n), local: isCzech || isSlovak(item) };
    filmCandidates.push({ category, item, isCzech, level });
}
addMain(filmCandidates, undefined, (entry) => filmItems.push(entry));
console.log(`Doplněno do malých okruhů: ${topUp(filmCandidates, (entry) => filmItems.push(entry))} filmů`);

// Filmografie z vybraných filmů: režiséři podle režie, herci podle obsazení (nejznámější filmy první)
const directed = new Map();
const starred = new Map();
for (const film of filmItems) {
    for (const director of film.directorIds || []) directed.set(director, [...(directed.get(director) || []), film]);
    for (const actor of film.castIds || []) starred.set(actor, [...(starred.get(actor) || []), film]);
}
const personCandidates = [...new Set([...candidates.people.map(([qid]) => qid), ...filmItems.flatMap(film => film.directorIds || [])])]
    .filter(qid => people.has(qid)).sort((a, b) => (sitelinks.get(b) || 0) - (sitelinks.get(a) || 0));
const peopleCandidates = [];
for (const qid of personCandidates) {
    const detail = people.get(qid);
    if (!detail.t || !(detail.type || []).includes(HUMAN)) continue;
    const ownDirected = directed.get(qid) || [];
    const ownStarred = starred.get(qid) || [];
    const category = roleOf(detail, ownDirected.length + ownStarred.length);
    if (!category) continue;
    const own = category === 'reziseri' ? ownDirected : ownStarred;
    // Bez filmu v datech by nápověda „filmy“ chyběla a s filmem by se nedal spojit
    if (!own.length) continue;
    const { born, died } = lifeYears(detail);
    if (born === undefined) continue;
    const isCzech = isCzechPerson(detail);
    const female = detail.sex === FEMALE;
    const item = {
        q: qid,
        t: detail.t,
        n: nameOf(detail),
        ty: category === 'reziseri' ? (female ? 'režisérka' : 'režisér') : (female ? 'herečka' : 'herec'),
        d: detail.d,
        sx: female ? 'f' : undefined,
        ...imageFields(detail.im),
        f: compact({
            born,
            died,
            land: landOf(detail),
            films: own.slice(0, 3).map(film => film.n),
            osc: (detail.award || []).some(award => OSCAR_PERSON.includes(award)) ? 1 : undefined,
            y: born + 30
        }),
        filmCount: own.length
    };
    // Známí: ze zahraničních jen ti s aspoň dvěma filmy v datech (jinak by mezi známé pronikly hvězdy indické televize)
    // Slovenští filmaři (Juraj Jakubisko) se porovnávají s českými; nejznámější z ručního seznamu se vejdou vždy
    const local = isCzech || item.f.land === 'Slovensko';
    const hand = CZECH_KNOWN.has(item.n) || FILM_KNOWN.has(item.n);
    const level = { hand, minor: !local && own.length < 2 && !hand, local };
    peopleCandidates.push({ category, item, isCzech, level });
}
// Osoba má přednost před filmem stejného jména (herečka Lída Baarová, ne životopisný film o ní)
const addPerson = ({ category, item, isCzech, level }, force = false) => {
    const position = isCzech ? czechRank[category] || 0 : rank[category] || 0;
    if (!force && position >= (isCzech ? LIMITS[category].czLimit : LIMITS[category].limit) && !(level.local && level.hand)) return null;
    const sameFilm = filmItems.find(film => nameKey(film.n) === nameKey(item.n));
    if (sameFilm) {
        items.splice(items.indexOf(sameFilm), 1);
        filmItems.splice(filmItems.indexOf(sameFilm), 1);
        names.delete(nameKey(item.n));
        item.f.films = (item.f.films || []).filter(name => name !== sameFilm.n);
        for (const other of items) if (other.f.films) other.f.films = other.f.films.filter(name => name !== sameFilm.n);
    }
    return add(category, item, isCzech, level, force);
};
addMain(peopleCandidates, addPerson);
console.log(`Doplněno do malých okruhů: ${topUp(peopleCandidates, () => {}, (candidate) => addPerson(candidate, true))} osob`);

// --- Seriály ---
// Pořady, které nejsou seriály (reality show, soutěže, talk show, wrestling, zpravodajství, dokumenty)
const NOT_SERIES_GENRE = /reality|talent show|game show|talk show|variety|sketch|news|documentary|wrestling|competition|stand-up/i;
const NOT_SERIES_TEXT = /reality|soutěž|talk show|zábavn|show(?![\p{L}])|dokumentární/iu;
// Seriály s mnoha jazykovými verzemi (často od robotů), které český hráč nezná, a mezi známé nepatří ani další
const SERIES_EXCLUDED = new Set(['As Aventuras de Gui & Estopa', 'Terra e Paixão', 'The Penthouse: War in Life', 'Enfermeras', 'Josinkangnim', 'Solkanghwa',
    'Čchŏrinwanghu', 'Tchäjang-ŭi huje', 'Ssŭlssŭlhago čchanranhansin – Tokkäbi', 'Kgospoda namdža', 'Vincenzo', 'Dotkni se mých ran', 'Láska padá z nebe',
    'Velkolepé století', 'Courage the Cowardly Dog', 'Bylo, nebylo']);
const SERIES_NOT_KNOWN = new Set(['Utíkej, pejsku!', 'Liv a Maddie', 'Hannah Montana', 'Glee', 'Upíří deníky', 'Hrdinové', 'Lovci duchů', 'Dragon Ball Z',
    'Neon Genesis Evangelion', 'Avatar: Legenda o Aangovi', 'Čas na dobrodružství', 'Městečko záhad', 'Xena', 'Sezame, otevři se']);
// Žánr seriálu podle anglického názvu žánru ve Wikidatech (seriály mají jiné žánry než filmy)
const SERIES_GENRES = [['sitcom', /sitcom/], ['sci-fi', /science fiction/], ['fantasy', /fantasy/], ['krimi', /crime|detective|police procedural|legal/],
    ['lékařský seriál', /medical/], ['horor', /horror/], ['thriller', /thriller/], ['western', /western/], ['válečný', /\bwar\b/], ['historický', /historical|period drama/],
    ['telenovela', /soap opera|telenovela/], ['pohádka', /fairy tale/], ['pro děti', /children|preschool/], ['akční', /action/], ['dobrodružný', /adventure/],
    ['komedie', /comedy/], ['drama', /drama/]];
const seriesGenresOf = (detail) => {
    const names = (detail.genre || []).map(qid => en(qid).toLowerCase()).filter(Boolean);
    return SERIES_GENRES.filter(([, pattern]) => names.some(name => pattern.test(name))).map(([label]) => label).slice(0, 2);
};
const labelOf = (qid) => (people.has(qid) && people.get(qid).n ? nameOf(people.get(qid)) : undefined)
    || seriesLabels.get(`cs:${qid}`) || seriesLabels.get(`mul:${qid}`) || seriesLabels.get(`en:${qid}`) || cs(qid);
// Tvůrce jen jeden a jen člověk se jménem (ne studio); u českých seriálů bez tvůrce autor scénáře (Jaroslav Dietl)
const isPersonName = (name) => /^\p{Lu}[\p{L}.'’-]+( \p{Lu}?[\p{L}.'’-]+){1,3}$/u.test(name || '') && !/studio|production|television|televize|entertainment|films?$|pictures/iu.test(name || '');
const seriesAuthor = (detail, isCzech) => {
    const creators = [...new Set(detail.creator || [])].map(labelOf);
    if (creators.length === 1 && isPersonName(creators[0])) return { by: creators[0], byk: 'tvůrce' };
    const writers = [...new Set(detail.writer || [])].map(labelOf);
    if (isCzech && !creators.length && writers.length === 1 && isPersonName(writers[0])) return { by: writers[0], byk: 'scénář' };
    return {};
};
const seriesYears = (detail) => {
    const starts = [...(detail.start || []), ...(detail.date || [])].map(yearOf).filter(year => year !== undefined && year >= 1930 && year <= THIS_YEAR).sort((a, b) => a - b);
    const ends = (detail.end || []).map(yearOf).filter(year => year !== undefined && year <= THIS_YEAR).sort((a, b) => b - a);
    const start = starts[0];
    return { start, end: start !== undefined && ends[0] !== undefined && ends[0] > start ? ends[0] : undefined };
};
const maxNumber = (list) => { const numbers = (list || []).map(Number).filter(Number.isFinite); return numbers.length ? Math.max(...numbers) : undefined; };
const seriesList = [];
for (const [qid] of candidates.series) {
    const detail = seriesMap.get(qid);
    if (!detail || !detail.t) continue;
    const types = (detail.type || []).map(type => en(type).toLowerCase()).join(' | ');
    // Epizody, pořady a filmy nejsou seriály
    if (/episode|season|film\b|program/u.test(types) && !/series/u.test(types)) continue;
    const { start, end } = seriesYears(detail);
    if (start === undefined || SERIES_EXCLUDED.has(nameOf(detail))) continue;
    if ((detail.genre || []).some(genre => NOT_SERIES_GENRE.test(en(genre))) || (NOT_SERIES_TEXT.test(detail.d || '') && !/seriál/iu.test(detail.d || ''))) continue;
    // Korejské a jiné přepisy bez českého názvu (Ssŭlssŭlhago) nejsou seriály, které by hráč znal
    if (/[ŏŭ]/u.test(nameOf(detail))) continue;
    const countries = detail.co || [];
    // Český je seriál české (československé) produkce, ne zahraniční seriál s českým koproducentem (Borgia)
    const isCzech = countries.some(state => CZECH_FILM_STATES.has(state))
        && (countries.every(state => CZECH_FILM_STATES.has(state) || state === SLOVAKIA) || /^(česk|moravsk)/iu.test((detail.d || '').trim()));
    const animated = (detail.type || []).some(type => ANIMATED_SERIES.includes(type)) || (detail.genre || []).some(genre => /animat|anime|cartoon/i.test(en(genre)));
    const cast = [...new Set(detail.cast || [])].filter(actor => isPersonName(labelOf(actor)))
        .sort((a, b) => castPosition(qid, a) - castPosition(qid, b) || (sitelinks.get(b) || 0) - (sitelinks.get(a) || 0));
    const author = seriesAuthor(detail, isCzech);
    const name = nameOf(detail);
    const item = {
        q: qid,
        t: detail.t,
        n: name,
        ty: animated ? 'animovaný seriál' : (detail.type || []).includes(MINISERIES) ? 'minisérie' : 'seriál',
        d: detail.d,
        f: compact({
            year: start,
            end,
            // Desetiletí začátku vysílání je jisté (začátek je jeden)
            dq: 1,
            gen: seriesGenresOf(detail),
            land: landsByDescription(detail.d, [...countries].sort((a, b) => (CZECH_FILM_STATES.has(b) ? 1 : 0) - (CZECH_FILM_STATES.has(a) ? 1 : 0)).map(cs).filter(Boolean)).slice(0, 2),
            by: author.by,
            byk: author.byk,
            cast: cast.slice(0, 4).map(labelOf),
            net: [...new Set((detail.net || []).map(labelOf).filter(Boolean))].slice(0, 2),
            seasons: maxNumber(detail.seasons),
            eps: maxNumber(detail.episodes),
            orig: (detail.title || []).find(title => /^[\p{Script=Latin}\d\s\p{P}]+$/u.test(title) && nameKey(title) !== nameKey(name)),
            y: start
        }),
        genreIds: [...(detail.genre || []), ...(detail.type || [])]
    };
    if (!item.d) item.d = factDescription(item);
    const level = { hand: isCzech && CZECH_SERIES_KNOWN.has(item.n), never: SERIES_NOT_KNOWN.has(item.n), local: isCzech || isSlovak(item) };
    seriesList.push({ category: 'serialy', item, isCzech, level });
}
addMain(seriesList);
console.log(`Doplněno do malých okruhů: ${topUp(seriesList)} seriálů`);

// Odkaz na režiséra filmu jen tehdy, když je mezi režiséry (otázka „Kdo film režíroval?“)
const directorItems = new Set(items.filter(item => item.c === 'reziseri').map(item => item.q));
for (const film of filmItems) {
    if (film.f.dq1 && directorItems.has(film.f.dq1)) film.f.dirq = film.f.dq1;
    delete film.f.dq1;
}

// --- 5. krok: okruhy a úrovně ---
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
for (const item of items) { delete item.castIds; delete item.directorIds; delete item.genreIds; delete item.animated; delete item.filmCount; }
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

// Úrovně: známost se porovnává v kategorii, české (a slovenské) položky zvlášť – u nich rozhoduje hlavně návštěvnost české Wikipedie.
// Známá je čtvrtina nejznámějších (u českých víc – český hráč zná české filmy a seriály líp), pro experty nejméně známá čtvrtina
// zahraničních a pětina českých; každý okruh od 8 položek má aspoň max(3, 25 %) známých a nejvýš 45 % pro experty
for (const item of items) item._.pool = `${item.c}|${item._.local ? 'cz' : 'svet'}`;
const LEVEL_SHARES = { known: { svet: 0.23, cz: 0.26 }, expert: { svet: 0.3, cz: 0.2 } };
const side = (pool) => pool.split('|')[1];
const levelGroups = [
    ...COLLECTIONS.map(collection => ({ id: collection.id, members: items.filter(item => (item.g || []).includes(collection.id)) })),
    ...Object.keys(LIMITS).map(category => ({ id: category, members: items.filter(item => item.c === category) }))
];
const promoted = assignLevels(items, {
    knownShare: (pool) => LEVEL_SHARES.known[side(pool)],
    expertShare: (pool) => LEVEL_SHARES.expert[side(pool)],
    pvWeight: (pool) => side(pool) === 'cz' ? 0.75 : 0.5,
    // Kvůli okruhu se známou stane jen položka ze 75 % nejznámějších své skupiny (V pravé poledne, Kabinet doktora Caligariho, Hrob světlušek ano)
    ceiling: 0.75,
    groups: levelGroups
});
console.log(`Povýšeno kvůli okruhům: ${promoted.length} (${promoted.slice(0, 12).map(([group, name]) => `${group}: ${name}`).join(', ')}…)`);
console.log(levelSummary('celkem', items));
for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${levelSummary(category, inCategory)}, českých ${inCategory.filter(item => item.cz).length}`);
}
for (const group of levelGroups.slice(0, COLLECTIONS.length)) console.log(`okruh ${levelSummary(group.id, group.members)}`);
// Okruh pod spodní hranicí (málo dost známých položek): nejznámější z ostatních, ať je vidět, co by šlo povýšit
for (const group of levelGroups) {
    const need = knownFloor(group.members.length);
    const known = group.members.filter(item => item.k).length;
    if (known < need) console.warn(`  pod spodní hranicí ${group.id} ${known}/${need}: ${group.members.filter(item => !item.k).sort((a, b) => a._.pct - b._.pct).slice(0, 8).map(item => `${item.n} ${item._.pct.toFixed(2)}${item._.minor ? ' m' : ''}`).join(', ')}`);
}
for (const item of items) delete item._;

writeTopic('film', { collections, items });
