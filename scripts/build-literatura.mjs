// Téma Literatura: data/literatura.json z Wikidat (přes QLever) – spisovatelé a básníci, literární díla a postavy
// Spuštění: npm run build:literatura (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { sparql, qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic, readCountries } from './lib/wikidata.mjs';
import { CHARACTERS } from './lib/literatura-postavy.mjs';
import { MOVEMENTS, MOVEMENT_YEARS } from './lib/literatura-smery.mjs';

// Zakrytí jako ve hře: popis postavy nesmí obsahovat název díla ani příjmení autora
const { censorName } = createRequire(import.meta.url)('../quiz-core.js');

const HUMAN = 'Q5';
const FEMALE = 'Q6581072';
const LITERARY_WORK = 'Q7725634';
// Státy, které patří k české literatuře (Česko, Československo, České království, Protektorát…)
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q1998866', 'Q1991965', 'Q853348', 'Q39193', 'Q43266']);
const NOBEL_LITERATURE = 'Q37922';
const THIS_YEAR = new Date().getFullYear();

// Spisovatelská povolání (P106): spisovatel, básník, romanopisec, dramatik, autor, spisovatel pro děti, autor sci-fi, prozaik, esejista
const WRITER_OCCUPATIONS = ['Q36180', 'Q49757', 'Q6625963', 'Q214917', 'Q482980', 'Q4853732', 'Q18844224', 'Q12144794', 'Q11774202'];
// Postavy: literární postava, fiktivní člověk, fiktivní postava, fiktivní zvíře
const CHARACTER_TYPES = ['Q3658341', 'Q15632617', 'Q95074', 'Q15711870', 'Q3375722'];

const csArticle = (variable) => `?a schema:about ${variable} . ?a schema:isPartOf <https://cs.wikipedia.org/> . ${variable} wikibase:sitelinks ?sl .`;
const fromRows = (rows, key = 'x') => rows.map(row => [id(row[key].value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);

// --- 1. krok: kandidáti ---
const candidates = await cached('literatura-candidates', async () => {
    const people = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?o { ${values(WRITER_OCCUPATIONS)} } ?x wdt:P106 ?o . ?x wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= 20) }`));
    // Česká stopa: občanství nebo narození v Česku – i méně známí
    const czechPeople = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?o { ${values(WRITER_OCCUPATIONS)} } ?x wdt:P106 ?o . ?x wdt:P31 wd:${HUMAN} .
  { ?x wdt:P27 ?c . VALUES ?c { ${values([...CZECH_STATES])} } } UNION { ?x wdt:P19/wdt:P17 wd:Q213 } ${csArticle('?x')} FILTER(?sl >= 6) }`));
    const works = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${LITERARY_WORK} . ?x wdt:P50 [] . ${csArticle('?x')} FILTER(?sl >= 6) }`));
    // Česká díla: autor s českým občanstvím nebo jazyk díla čeština
    const czechWorks = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${LITERARY_WORK} . ?x wdt:P50 ?au .
  { ?au wdt:P27 ?c . VALUES ?c { ${values([...CZECH_STATES])} } } UNION { ?x wdt:P407 wd:Q9056 } ${csArticle('?x')} FILTER(?sl >= 3) }`));
    const characters = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?type { ${values(CHARACTER_TYPES)} } ?x wdt:P31 ?type .
  ?x wdt:P1441 ?w . ?w wdt:P31/wdt:P279* wd:${LITERARY_WORK} . ${csArticle('?x')} FILTER(?sl >= 5) }`));
    return {
        people: [...new Map([...people.slice(0, 3500), ...czechPeople])].sort((a, b) => b[1] - a[1]),
        works: [...new Map([...works.slice(0, 3000), ...czechWorks])].sort((a, b) => b[1] - a[1]),
        characters: characters.slice(0, 800)
    };
});
// Další kandidáti: antičtí autoři (i historikové a filozofové, z nich se vezmou jen ti z ANCIENT_AUTHORS) a postavy podtříd fiktivní
// postavy (P279*) z literárních děl – mezi nimi i filmové a seriálové, ty vyřadí pravidla níže
const HISTORIAN = 'Q201788';
const PHILOSOPHER = 'Q4964182';
const FICTIONAL_CHARACTER = 'Q95074';
const moreCandidates = await cached('literatura-candidates-more', async () => ({
    ancient: fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?o { ${values([...WRITER_OCCUPATIONS, HISTORIAN, PHILOSOPHER])} } ?x wdt:P106 ?o .
  ?x wdt:P31 wd:${HUMAN} . ?x wdt:P569 ?b . FILTER(YEAR(?b) < 450) ${csArticle('?x')} FILTER(?sl >= 15) }`)),
    characters: fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${FICTIONAL_CHARACTER} . ?x wdt:P1441 ?w .
  ?w wdt:P31/wdt:P279* wd:${LITERARY_WORK} . ${csArticle('?x')} FILTER(?sl >= 8) }`))
}));
// Díla antických autorů (tragédie, komedie, básně) – obecný dotaz na literární díla najde jen část z nich
const ancientWorks = await cached('literatura-candidates-ancient-works', async () => fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE {
  VALUES ?o { ${values(WRITER_OCCUPATIONS)} } ?au wdt:P106 ?o . ?au wdt:P569 ?b . FILTER(YEAR(?b) < 450) ?x wdt:P50 ?au . ${csArticle('?x')} FILTER(?sl >= 3) }`)));
candidates.works = [...new Map([...candidates.works, ...ancientWorks])].sort((a, b) => b[1] - a[1]);
candidates.people = [...new Map([...candidates.people, ...moreCandidates.ancient])].sort((a, b) => b[1] - a[1]);
candidates.characters = [...new Map([...candidates.characters, ...moreCandidates.characters])].sort((a, b) => b[1] - a[1]);
console.log(`Kandidáti: ${candidates.people.length} osob, ${candidates.works.length} děl, ${candidates.characters.length} postav`);

// --- 2. krok: podrobnosti po dávkách ---
const SINGLE = { t: 1, n: 1, d: 1, den: 1, im: 1, born: 1, died: 1, sex: 1 };
const PROPERTIES = {
    born: 'P569', died: 'P570', sex: 'P21', cit: 'P27', occ: 'P106', genre: 'P136', mov: 'P135', notable: 'P800', writes: 'P6886',
    speaks: 'P1412', award: 'P166', author: 'P50', pub: 'P577', from: 'P571', form: 'P7937', origin: 'P495', lang: 'P407', type: 'P31',
    creator: 'P170', inWork: 'P1441', series: 'P179', partOf: 'P361', characters: 'P674'
};
const allIds = [...new Set(Object.values(candidates).flat().map(([q]) => q))];
// Podrobnosti po dávkách se dají číst i z query.wikidata.org (WIKIDATA_ENDPOINT=wdqs), když je QLever přetížený
const detailsRun = process.env.WIKIDATA_ENDPOINT === 'wdqs' ? sparql : qlever;
const fetchDetails = async (list, run = detailsRun) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, 120, (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "en") BIND("den" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P19/wdt:P17 ?v BIND("bornIn" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  ${Object.entries(PROPERTIES).map(([key, property]) => `UNION { ?item wdt:${property} ?v BIND("${key}" AS ?p) }`).join('\n  ')}
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (key === 'sl') entry.sl = Number(v);
        else if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, run);
    return result;
};
// S BUILD_CACHE se podrobnosti ukládají průběžně po 600 položkách – přerušené stahování pokračuje a nově přidaní kandidáti se jen dostáhnou
const accumulatedDetails = async (list, name) => {
    const file = process.env.BUILD_CACHE && `${process.env.BUILD_CACHE}/${name}.json`;
    const result = new Map(file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
    const missing = list.filter(qid => !result.has(qid));
    if (file && !missing.length) console.log(`  (z mezipaměti ${file})`);
    for (let i = 0; i < missing.length; i += 600) {
        for (const [qid, detail] of await fetchDetails(missing.slice(i, i + 600))) result.set(qid, detail);
        if (file) { mkdirSync(process.env.BUILD_CACHE, { recursive: true }); writeFileSync(file, JSON.stringify([...result])); }
        console.log(`  podrobnosti ${Math.min(i + 600, missing.length)}/${missing.length}`);
    }
    return result;
};
const details = await accumulatedDetails(allIds, 'literatura-details-acc');
// Slavné postavy, které obecný dotaz nenajde (Švejk nemá ve Wikidatech vazbu na dílo), z query.wikidata.org
const MUST_CHARACTERS = ['Q1976939', 'Q1932108', 'Q9323967', 'Q741432', 'Q1156620', 'Q2587533', 'Q30611756', 'Q1269082', 'Q12292447'];
for (const [qid, detail] of await cached('literatura-must-characters', async () => [...await fetchDetails(MUST_CHARACTERS, sparql)])) details.set(qid, detail);
// Ručně vybrané postavy (lib/literatura-postavy.mjs) podle názvu článku a jejich autoři, kteří mezi kandidáty nejsou
const curatedQids = new Map(await cached(`literatura-curated-characters-${createHash('sha1').update(Object.keys(CHARACTERS).join('|')).digest('hex').slice(0, 10)}`, async () => {
    const result = [];
    const titles = Object.keys(CHARACTERS);
    for (let i = 0; i < titles.length; i += 100) {
        const rows = await sparql(`SELECT ?item ?t WHERE { VALUES ?t { ${titles.slice(i, i + 100).map(title => JSON.stringify(title) + '@cs').join(' ')} }
  ?a schema:name ?t ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:about ?item . }`);
        result.push(...rows.map(row => [row.t.value, id(row.item.value)]));
    }
    return result;
}));
const curatedAuthors = Object.values(CHARACTERS).map(entry => entry.a).filter(Boolean);
const curatedMissing = [...new Set([...curatedQids.values(), ...curatedAuthors])].filter(qid => !details.has(qid));
for (const [qid, detail] of await cached(`literatura-curated-details-${createHash('sha1').update(curatedMissing.join(',')).digest('hex').slice(0, 10)}`, async () => [...await fetchDetails(curatedMissing, sparql)])) details.set(qid, detail);
const curatedOf = new Map([...curatedQids].map(([title, qid]) => [qid, CHARACTERS[title]]));
for (const title of Object.keys(CHARACTERS)) if (!curatedQids.has(title)) console.log(`  postava bez článku: ${title}`);
// Homér je ve Wikidatech „člověk, který může být smyšlený“ – obecný dotaz na lidi ho nenajde
const MUST_PEOPLE = ['Q6691'];
for (const [qid, detail] of await cached('literatura-must-people', async () => [...await fetchDetails(MUST_PEOPLE, sparql)])) details.set(qid, detail);
candidates.people.push(...MUST_PEOPLE.filter(qid => !candidates.people.some(([other]) => other === qid)).map(qid => [qid, (details.get(qid) || {}).sl || 0]));

// České a anglické názvy odkazovaných položek (žánry, země, jazyky, typy, autoři)
const REFERENCED_KEYS = ['cit', 'occ', 'genre', 'mov', 'notable', 'writes', 'speaks', 'author', 'form', 'origin', 'lang', 'type', 'creator',
    'inWork', 'series', 'partOf', 'bornIn'];
const referenced = [...new Set([...details.values()].flatMap(detail => REFERENCED_KEYS.flatMap(key => detail[key] || [])))].filter(q => /^Q\d+$/.test(q));
const fetchLabels = async (list) => {
    const result = [];
    await inBatches(list, 400, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]), detailsRun);
    return result;
};
const labels = new Map(await cached('literatura-labels', () => fetchLabels(referenced)));
// Názvy položek, na které odkazují později přidaní kandidáti
const missingLabels = referenced.filter(qid => !labels.has(`cs:${qid}`) && !labels.has(`en:${qid}`)).sort();
const labelsKey = createHash('sha1').update(missingLabels.join(',')).digest('hex').slice(0, 10);
if (missingLabels.length) for (const [key, label] of await cached(`literatura-labels-more-${labelsKey}`, () => fetchLabels(missingLabels))) labels.set(key, label);
const cs = (qid) => labels.get(`cs:${qid}`);
const en = (qid) => labels.get(`en:${qid}`) || '';

console.log(`Podrobnosti: ${details.size}, názvy: ${labels.size}`);

// --- 3. krok: pravidla pro spisovatele, díla a postavy ---
const countries = readCountries();
const yearsOf = (list) => (list || []).map(yearOf).filter(year => year !== undefined && year <= THIS_YEAR);
const minYear = (list) => yearsOf(list).length ? Math.min(...yearsOf(list)) : undefined;
const titleName = (title) => (title || '').replace(/\s*\([^)]*\)\s*$/u, '').trim();
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// Název z článku bez upřesnění v závorce („1984 (román)“ → 1984); štítek bývá jen mezinárodní nebo chybí
const nameOf = (qid) => {
    const detail = details.get(qid);
    const name = detail && (titleName(detail.t) || detail.n);
    return name ? capitalize(name) : cs(qid) || undefined;
};
const cleanText = (text) => (text || '').replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();

// Země podle popisu na české Wikipedii („ruský spisovatel“ → Rusko, „starořecký básník“ → Starověké Řecko)
const NATIONALITIES = [
    ['starořeck', 'Starověké Řecko'], ['starořímsk', 'Starověký Řím'], ['římsk', 'Starověký Řím'], ['československ', 'Československo'], ['česk', 'Česko'],
    ['moravsk', 'Česko'], ['pražsk', 'Česko'], ['slovensk', 'Slovensko'], ['německ', 'Německo'], ['rakousk', 'Rakousko'], ['americk', 'Spojené státy americké'],
    ['britsk', 'Spojené království'], ['anglick', 'Spojené království'], ['skotsk', 'Spojené království'], ['velšsk', 'Spojené království'], ['irsk', 'Irsko'],
    ['francouzsk', 'Francie'], ['italsk', 'Itálie'], ['florentsk', 'Itálie'], ['benátsk', 'Itálie'], ['španělsk', 'Španělsko'], ['katalánsk', 'Španělsko'],
    ['portugalsk', 'Portugalsko'], ['sovětsk', 'Sovětský svaz'], ['rusk', 'Rusko'], ['polsk', 'Polsko'], ['maďarsk', 'Maďarsko'], ['uhersk', 'Maďarsko'],
    ['norsk', 'Norsko'], ['švédsk', 'Švédsko'], ['finsk', 'Finsko'], ['dánsk', 'Dánsko'], ['islandsk', 'Island'], ['nizozemsk', 'Nizozemsko'],
    ['holandsk', 'Nizozemsko'], ['belgick', 'Belgie'], ['vlámsk', 'Belgie'], ['švýcarsk', 'Švýcarsko'], ['kanadsk', 'Kanada'], ['australsk', 'Austrálie'],
    ['novozélandsk', 'Nový Zéland'], ['japonsk', 'Japonsko'], ['čínsk', 'Čína'], ['korejsk', 'Jižní Korea'], ['indick', 'Indie'], ['bengálsk', 'Indie'],
    ['brazilsk', 'Brazílie'], ['argentinsk', 'Argentina'], ['mexick', 'Mexiko'], ['kubánsk', 'Kuba'], ['kolumbijsk', 'Kolumbie'], ['chilsk', 'Chile'],
    ['peruánsk', 'Peru'], ['uruguaysk', 'Uruguay'], ['nikaragujsk', 'Nikaragua'], ['řeck', 'Řecko'], ['ukrajinsk', 'Ukrajina'], ['rumunsk', 'Rumunsko'],
    ['bulharsk', 'Bulharsko'], ['srbsk', 'Srbsko'], ['chorvatsk', 'Chorvatsko'], ['slovinsk', 'Slovinsko'], ['jugoslávsk', 'Jugoslávie'], ['bosensk', 'Bosna a Hercegovina'],
    ['izraelsk', 'Izrael'], ['tureck', 'Turecko'], ['persk', 'Persie'], ['íránsk', 'Írán'], ['egyptsk', 'Egypt'], ['litevsk', 'Litva'], ['lotyšsk', 'Lotyšsko'],
    ['estonsk', 'Estonsko'], ['běloru', 'Bělorusko'], ['gruzínsk', 'Gruzie'], ['arménsk', 'Arménie'], ['jihoafrick', 'Jihoafrická republika'], ['nigerijsk', 'Nigérie'],
    ['libanonsk', 'Libanon'], ['kolumbijsk', 'Kolumbie'], ['albánsk', 'Albánie']
];
const nationalityOf = (description) => {
    const words = cleanText(description).toLowerCase().split(/[\s,;]+/);
    // Starověký řecký dramatik → Starověké Řecko
    const ancient = words.some(word => /^(starověk|antick)/u.test(word));
    for (const word of words.filter(other => /(sk|ck)(ý|á|é)$/u.test(other))) {
        const found = NATIONALITIES.find(([stem]) => word.startsWith(stem));
        if (found) return ancient && found[1] === 'Řecko' ? 'Starověké Řecko' : found[1];
    }
    return undefined;
};
const countryName = (qid) => countries[qid] ? countries[qid].name : undefined;
const landOf = (detail, ...keys) => nationalityOf(detail.d) || keys.flatMap(key => detail[key] || []).map(countryName).find(Boolean);
const isCzechDetail = (detail, ...keys) => keys.some(key => (detail[key] || []).some(q => CZECH_STATES.has(q)))
    || /^(česk|českoslov|moravsk)/iu.test(cleanText(detail.d));

// Antický autor z Řecka či Itálie (popis „řecký filozof“ bez „starověký“) → Starověké Řecko, Starověký Řím
const ancientLand = (land, detail) => {
    const born = yearOf(detail.born);
    if (born === undefined || born >= 450) return land;
    return land === 'Řecko' ? 'Starověké Řecko' : land === 'Itálie' ? 'Starověký Řím' : land;
};
// Role z popisu: podstatná jména před prvním „a“ či čárkou („britský filolog a spisovatel“ → filolog, spisovatel)
const ADJECTIVE = /^[\p{L}-]+(ý|á|é|í|ské|cké)$/u;
const NOT_A_ROLE = /^(a|z|ze|v|ve|se|i|–|-|později|původně|též|také|\d.*)$/u;
const rolesOf = (description) => cleanText(description).toLowerCase().split(/[\s,;]+/)
    .filter(word => word && !ADJECTIVE.test(word) && !NOT_A_ROLE.test(word)).slice(0, 3);
const WRITER_ROLE = /^(spisovatel|básník|básnířk|dramatik|dramatičk|prozaik|romanopis|autor|literát|pohádkář|bajkář|esejist|humorist|satirik|povídkář|novelist|epik|lyrik|epigramik)/u;
// Kdo je hlavně politik, vědec, umělec či kněz, mezi spisovatele nepatří (Churchill, Leonardo, Luther)
const OTHER_ROLE = /^(politik|prezident|papež|král|královn|císař|herec|herečk|zpěv|skladatel|hudebník|písničkář|malíř|sochař|fyzik|chemik|matematik|astronom|lékař|psycholog|ekonom|vojevůdce|generál|podnikatel|režisér|kreslíř|výtvarník|teolog|kazatel|světec|mnich|biskup|historik|vědec|přírodovědec|architekt|fotograf|novinář|aktivist|diplomat|právník|cestovatel|kněz|reformátor|polyhistor|pěv|pedagog|estetik|politolog|moderátor|komentátor|bloger)/u;

// Žánry (podle anglických názvů z Wikidat) – pro okruhy a podobné možnosti
const GENRE_GROUPS = [
    ['scifi', /science fiction|scientific fiction|cyberpunk|space opera/, 'sci-fi'], ['fantasy', /fantasy/, 'fantasy'],
    ['detektivka', /detective|crime|mystery/, 'detektivka'], ['horor', /horror/, 'horor'],
    ['detska', /children|fairy tale|young adult|picture book/, 'literatura pro děti']
];
// Skupina jen tehdy, když je žánr ve Wikidatech uveden první nebo víckrát (Lolita není detektivka, Conan Doyle není autor sci-fi)
const genreGroupOf = (detail) => {
    const names = (detail.genre || []).map(q => en(q).toLowerCase());
    let best = null;
    let bestScore = 0;
    for (const [group, pattern, label] of GENRE_GROUPS) {
        const score = names.reduce((sum, name, index) => sum + (name && pattern.test(name) ? 1 + 1 / (index + 2) : 0), 0);
        if (score > bestScore) [best, bestScore] = [{ group, label }, score];
    }
    return bestScore >= 1.45 ? best : null;
};
// U spisovatele stačí žánr mezi prvními dvěma a přednost má sci-fi a fantasy před literaturou pro děti (Tolkien)
const writerGenreOf = (detail) => {
    const names = (detail.genre || []).map(q => en(q).toLowerCase());
    const found = GENRE_GROUPS.find(([, pattern]) => names.reduce((sum, name, index) => sum + (name && pattern.test(name) ? 1 + 1 / (index + 2) : 0), 0) >= 1.3);
    return found ? { group: found[0], label: found[2] } : null;
};
// Okruhy žánrů: dílo i do více žánrů (Harry Potter je fantasy i pro mládež); práh podle toho, jak sporné žánry ve Wikidatech bývají –
// literatura pro děti a mládež stačí mezi prvními třemi žánry, horor mezi prvními dvěma, ostatní jen první nebo víckrát
// Okruh detektivek bere i thrillery a špionážní romány, okruh hororu gotické romány a weird fiction (jen díla – u spisovatele by „gotický“
// Jane Austenovou udělal autorkou hororů; „Southern Gothic“ Tennesseeho Williamse horor není)
const GROUP_THRESHOLD = { scifi: 1.45, fantasy: 1.45, detektivka: 1.45, horor: 1.3, detska: 1.24 };
const OKRUH_PATTERNS = { detektivka: /detective|crime|mystery|thriller|spy fiction/, horor: /horror|^gothic|weird fiction|vampire|ghost stor/ };
const genreGroupsOf = (detail, writer) => {
    const names = (detail.genre || []).map(q => en(q).toLowerCase());
    return GENRE_GROUPS.map(([group, pattern]) => [group, writer ? pattern : OKRUH_PATTERNS[group] || pattern]).filter(([group, pattern]) => names.reduce((sum, name, index) => sum + (name && pattern.test(name) ? 1 + 1 / (index + 2) : 0), 0)
        >= (writer ? Math.min(1.3, GROUP_THRESHOLD[group]) : GROUP_THRESHOLD[group])).map(([group]) => group);
};
// Literární směr (P135) jen ze známých směrů
const MOVEMENT = /romanticism|realism|naturalism|symbolism|modernism|existentialism|classicism|enlightenment|renaissance|baroque|surrealism|futurism|dada|decadence|beat generation|magic realism|sturm und drang|lost generation|expressionism|poetism|absurd|parnass|impressionism/;
const movementOf = (detail) => (detail.mov || []).filter(q => MOVEMENT.test(en(q).toLowerCase()) && !/music/.test(en(q).toLowerCase())).map(cs).find(text => text && text.length <= 30);
// Směr: ručně (lib/literatura-smery.mjs), jinak z Wikidat, jinak z popisu („francouzský romantický básník“) u autora narozeného v době směru
const DESCRIPTION_MOVEMENTS = [['romantismus', /romantick\p{L}* (básník|básnířk|spisovatel|dramatik|prozaik|romanopis)/u, 1750, 1835],
    ['naturalismus', /naturalistick\p{L}* (básník|spisovatel|dramatik|prozaik|romanopis)/u, 1820, 1890],
    ['realismus', /realistick\p{L}* (básník|spisovatel|dramatik|prozaik|romanopis)/u, 1790, 1880]];
const personMovement = (name, detail, born) => MOVEMENTS.get(name) || movementOf(detail)
    || (DESCRIPTION_MOVEMENTS.find(([, pattern, from, to]) => born !== undefined && born >= from && born <= to && pattern.test(cleanText(detail.d).toLowerCase())) || [])[0];
// Jazyk tvorby: „britská angličtina“ → angličtina
const languageOf = (list) => (list || []).map(cs).filter(Boolean).map(text => /angličtina$/u.test(text) ? 'angličtina' : text)
    .find(text => /ina$|ština$|čtina$|ština|latina|sanskrt/u.test(text));

// Jazyk tvorby spisovatele: Wikidata uvádějí i jazyky, kterými jen mluvil (Čapek „francouzština“) – přednost má jazyk jeho země,
// jinak jediný uvedený
const LAND_LANGUAGES = {
    'Česko': 'čeština', 'Československo': 'čeština', 'Slovensko': 'slovenština', 'Rusko': 'ruština', 'Sovětský svaz': 'ruština', 'Francie': 'francouzština',
    'Belgie': 'francouzština', 'Německo': 'němčina', 'Rakousko': 'němčina', 'Švýcarsko': 'němčina', 'Spojené království': 'angličtina',
    'Spojené státy americké': 'angličtina', 'Irsko': 'angličtina', 'Kanada': 'angličtina', 'Austrálie': 'angličtina', 'Itálie': 'italština',
    'Španělsko': 'španělština', 'Argentina': 'španělština', 'Kolumbie': 'španělština', 'Mexiko': 'španělština', 'Chile': 'španělština', 'Peru': 'španělština',
    'Polsko': 'polština', 'Starověké Řecko': 'starořečtina', 'Starověký Řím': 'latina', 'Japonsko': 'japonština', 'Čína': 'čínština', 'Norsko': 'norština',
    'Švédsko': 'švédština', 'Dánsko': 'dánština', 'Portugalsko': 'portugalština', 'Brazílie': 'portugalština', 'Maďarsko': 'maďarština', 'Ukrajina': 'ukrajinština'
};
const WRITTEN_IN = { německy: 'němčina', anglicky: 'angličtina', francouzsky: 'francouzština', rusky: 'ruština', latinsky: 'latina', česky: 'čeština', polsky: 'polština' };
const writerLanguageOf = (detail, land) => {
    // „český německy píšící spisovatel“ (Kafka) → němčina
    const written = /(\p{L}+) píšící/u.exec(detail.d || '');
    if (written && WRITTEN_IN[written[1]]) return WRITTEN_IN[written[1]];
    const list = [...new Set((detail.writes || []).map(q => languageOf([q])).filter(Boolean))];
    const expected = LAND_LANGUAGES[land];
    if (expected) return list.includes(expected) ? expected : undefined;
    return list.length === 1 ? list[0] : undefined;
};

// Kontrola dat narození a úmrtí (starověké roky smí být záporné)
const lifeYears = (detail) => {
    const born = yearOf(detail.born);
    const died = yearOf(detail.died);
    if (born === undefined || born > THIS_YEAR - 12) return null;
    if (died !== undefined && (died <= born || died > THIS_YEAR || died - born > 105)) return null;
    if (died === undefined && born < THIS_YEAR - 100) return null;
    return { born, died };
};

// Česká jména a díla, která zná skoro každý – vezmou se vždy a jsou „známá“
const CZECH_KNOWN = new Set(['Božena Němcová', 'Karel Hynek Mácha', 'Jan Neruda', 'Karel Čapek', 'Jaroslav Hašek', 'Franz Kafka', 'Bohumil Hrabal', 'Milan Kundera',
    'Jaroslav Seifert', 'Václav Havel', 'Karel Jaromír Erben', 'Alois Jirásek', 'Josef Škvorecký', 'Michal Viewegh', 'Jan Amos Komenský', 'Josef Kajetán Tyl',
    'Karel Havlíček Borovský', 'Svatopluk Čech', 'Jaroslav Vrchlický', 'Petr Bezruč', 'Jiří Wolker', 'Vítězslav Nezval', 'Ivan Olbracht', 'Vladislav Vančura',
    'Jan Werich', 'Ota Pavel', 'Arnošt Lustig', 'Jan Drda', 'Václav Čtvrtek', 'Eduard Petiška', 'Jaroslav Foglar', 'Karel Poláček', 'Viktor Dyk', 'Josef Lada',
    'Babička', 'Máj', 'Kytice', 'R.U.R.', 'Osudy dobrého vojáka Švejka za světové války', 'Proměna', 'Ostře sledované vlaky', 'Válka s mloky', 'Bílá nemoc',
    'Krakatit', 'Povídky malostranské', 'Staré pověsti české', 'Spalovač mrtvol', 'Saturnin', 'Obsluhoval jsem anglického krále', 'Nesnesitelná lehkost bytí',
    'Žert', 'Zbabělci', 'Zahradní slavnost', 'Labyrint světa a ráj srdce', 'Strakonický dudák', 'Lucerna', 'Krysař', 'Romeo, Julie a tma', 'Bylo nás pět',
    'Rychlé šípy', 'Broučci', 'Dášeňka čili život štěněte', 'Devatero pohádek', 'Kocour Mikeš', 'Ferda Mravenec', 'Josef Švejk', 'Proces', 'Zámek',
    'Markéta Lazarová', 'Audience', 'Smrt krásných srnců', 'Postřižiny', 'Krysař']);
// Slavní podle počtu jazykových verzí, které ale český čtenář většinou nezná
const NOT_KNOWN = new Set(['Abú Nuwás', 'Chvádže Šamsuddín Muhammad Háfiz', 'Džaláleddín Balchí Rúmí', 'Tu Fu', 'Li Po', 'Octave Mirbeau', 'Samuel Johnson',
    'Nagíb Mahfúz', 'Macuo Bašó', 'Taras Ševčenko', 'Helen Kellerová', 'Ralph Waldo Emerson', 'Henry David Thoreau', 'Maya Angelou', 'Mary Wollstonecraftová',
    'Pearl S. Bucková', 'George Eliot', 'Romain Rolland', 'José Saramago', 'Orhan Pamuk', 'Luigi Pirandello', 'Michel de Montaigne', 'Anatole France', 'Knut Hamsun',
    'Sen v červeném domě', 'Příběh prince Gendžiho', 'Příběhy Tří říší', 'Příběhy od jezerního břehu', 'Rámájana', 'Muž v tygří kůži', 'Theogonia',
    'Svatý Jeroným', 'Solón', 'Thomas Carlyle', 'Rachel Carsonová', 'John Ruskin', 'Hildegarda z Bingenu', 'Sa\'dí', 'Novalis', 'Muhammad Iqbal',
    'Zlatá legenda', 'Když přišli nacisté', 'Ťin Pching Mej', 'Lusovci', 'Osvobozený Jeruzalém', 'Peršané', 'Parzival', 'Oidipus na Kolónu', 'Bakchantky',
    'Zuřivý Roland', 'Oresteia', 'Sword Art Online', 'Eragon', 'Nový měsíc', 'Lovec draků', 'Klub rváčů', 'Život je sen', 'Práce a dni',
    'Alejandro Jodorowsky', 'Germaine Greerová']);
// Politici, novináři a autoři naučných knih, které popis z Wikidat má za spisovatele
const EXCLUDED = new Set(['Donald Trump', 'Bob Dylan', 'Michael D. Higgins', 'Gerhard Mercator', 'Milo Yiannopoulos', 'Dominique de Villepin',
    'Emmanuel Joseph Sieyès', 'Bear Grylls', 'Waris Dirie', 'Giuseppe Mazzini', 'Alvin Toffler', 'Christopher Hitchens', 'Valerie Solanasová',
    'Karen Armstrongová', 'Samuel Smiles', 'Aleister Crowley', 'Robert Habeck', 'Šrí Činmoj']);
const LITERARY_THINKERS = new Set(['Friedrich Nietzsche', 'Jean-Jacques Rousseau', 'Jean-Paul Sartre', 'Denis Diderot', 'Henry David Thoreau', 'Thomas de Quincey',
    'Olaf Stapledon', 'Ladislav Klíma', 'Seneca', 'John Bunyan', 'Voltaire', 'Simone de Beauvoirová', 'Petr Chelčický', 'Jan Blahoslav']);
const RELIGIOUS_WRITER = /církevní|křesťansk\p{L}* spisovatel|nábožensk\p{L}* spisovatel|teolog|kazatel|kardinál|mystik/u;
// Antičtí historikové, filozofové a řečníci, jejichž spisy patří ke klasické literatuře (popis je nemá za spisovatele)
const ANCIENT_AUTHORS = new Set(['Hérodotos', 'Thúkydidés', 'Xenofón', 'Plútarchos', 'Titus Livius', 'Publius Cornelius Tacitus', 'Gaius Suetonius Tranquillus',
    'Platón', 'Marcus Tullius Cicero', 'Lúkianos', 'Gaius Sallustius Crispus', 'Lucius Annaeus Seneca', 'Aisópos', 'Titus Lucretius Carus', 'Apuleius',
    'Petronius', 'Démosthenés', 'Tacitus', 'Livius', 'Sallustius', 'Lucius Apuleius']);

// --- Spisovatelé ---
const people = [];
for (const [qid] of candidates.people) {
    const detail = details.get(qid);
    if (!detail || !detail.t || !detail.d) continue;
    const name = nameOf(qid);
    if (EXCLUDED.has(name)) continue;
    const roles = rolesOf(detail.d);
    const writer = roles.findIndex(role => WRITER_ROLE.test(role));
    // Spisovatel podle popisu: role spisovatele mezi prvními dvěma a nejdřív ne politik či vědec (Tolkien „filolog a spisovatel“ ano)
    if (!CZECH_KNOWN.has(name) && !MUST_PEOPLE.includes(qid) && !ANCIENT_AUTHORS.has(name) && (writer < 0 || writer > 1 || OTHER_ROLE.test(roles[0]))) continue;
    // Filozofové, teologové a církevní spisovatelé (Spengler, McLuhan, Tertullianus) jen ti, jejichž dílo patří k literatuře
    if (!CZECH_KNOWN.has(name) && !ANCIENT_AUTHORS.has(name) && !LITERARY_THINKERS.has(name)
        && (/^filozof/u.test(roles[0]) || (/^esejist/u.test(roles[0]) && /^(filozof|estetik|teoretik)/u.test(roles[1] || ''))
            || /^[^,]*politick\p{L}* spisovatel/u.test(cleanText(detail.d)) || (RELIGIOUS_WRITER.test(detail.d) && !/^básn/u.test(roles[0])))) continue;
    // Starověký autor bez dat (Homér) zůstane – rok se odhadne podle jeho děl
    // (i s odhadem na celá půlstoletí – Homér „900–800 př. n. l.“), rok se odhadne podle jeho děl
    const guessed = [yearOf(detail.born), yearOf(detail.died)].every(year => year !== undefined && year < 500 && year % 50 === 0);
    const ancient = (!detail.born || guessed) && /starověk|antick|starořeck|římsk/u.test(detail.d);
    // Antický autor s rozpornými daty (Juvenalis „55–200“) zůstane bez letopočtů
    const antique = /starověk|antick|starořeck|římsk/u.test(detail.d) && yearOf(detail.born) !== undefined && yearOf(detail.born) < 450;
    const life = ancient ? {} : lifeYears(detail) || (antique ? {} : null);
    if (!life) continue;
    // Druh tvorby z rolí: básník → poezie, dramatik → drama, prozaik → próza
    const kinds = [...new Set(roles.map(role => /^básn/u.test(role) ? 'poezie' : /^dramat/u.test(role) ? 'drama' : /^(prozaik|romanopis|povídkář|novelist)/u.test(role) ? 'próza' : /^pohádk/u.test(role) ? 'pohádky' : null).filter(Boolean))];
    const female = detail.sex === FEMALE;
    const role = roles[writer >= 0 ? writer : 0] || '';
    people.push({
        qid, detail, name, category: 'spisovatele', life, kinds, genre: writerGenreOf(detail),
        ty: ANCIENT_AUTHORS.has(name) && writer < 0 && /^(historik|filozof|řečník|bajkář)$/u.test(roles[0]) && !/spisovatel/u.test(detail.d) ? roles[0] : /^básn/u.test(role) ?(female ? 'básnířka' : 'básník') : /^dramat/u.test(role) ? (female ? 'dramatička' : 'dramatik') : female ? 'spisovatelka' : 'spisovatel'
    });
}

// --- Díla ---
// Druh díla podle popisu, formy (P7937) a žánru; pořadí rozhoduje (sbírka povídek před povídkou)
const WORK_KINDS = [
    ['básnická sbírka', /sbírk\p{L}* (básní|poezie|veršů)|básnick\p{L}* sbírk/u], ['sbírka povídek', /sbírk\p{L}* (povídek|pohádek|próz)/u],
    ['román', /román/u], ['novela', /novel/u], ['povídka', /povídk/u], ['tragédie', /tragédi/u], ['komedie', /komedi|fraška|fraš/u],
    ['divadelní hra', /divadeln\p{L}* hr|drama(?!t)|dramatick\p{L}* dílo|činohr/u], ['epos', /epos|epick\p{L}* báse/u], ['pohádka', /pohád/u],
    ['bajka', /bajk/u], ['báseň', /báse|poema|balad|óda|elegie|sonet|veršovan/u],
    ['kniha pro děti', /dětsk\p{L}* (próz|knih)|kniha pro děti|literatura pro děti|obrázkov\p{L}* knih/u]
];
const workKindOf = (detail) => {
    for (const text of [detail.d || '', ...(detail.form || []).map(cs), ...(detail.type || []).map(cs), ...(detail.genre || []).map(cs)]) {
        const found = WORK_KINDS.find(([, pattern]) => pattern.test((text || '').toLowerCase()));
        if (found) return found[0];
    }
    return null;
};
// Co literaturou v užším smyslu není: vždy (posvátné texty, manga, slovníky, hymny, opery) a jen bez známky beletrie (odborné spisy,
// paměti, cestopisy, eseje, edice) – Jana Eyrová („autobiografický román“), Cizinec („filozofický román“), 1984 („politická fikce“)
// i Hledání ztraceného času („knižní edice“) literatura jsou
const NOT_LITERATURE_ALWAYS = /biblick|svat(á|é) kniha|posvátn|nábožensk|manga|komiks|encyklopedi|slovník|časopis|manifest|franšíz|hoax|falzifikát|videohr|hymna|webov|internetov|ročenk|sútra|věštb|light novel|^opera$|muzikál|balet/iu;
const NOT_LITERATURE_TYPE = /vědeck|traktát|kronik|letopis|edice|dokument|hudebn|filmov|film$|seriál|autobiografi|deník|cestopis|^esej|filozofick|politick/iu;
const FICTION_LABEL = /román|novel|povídk|báse|poezie|poema|drama$|divadeln|komedie|tragédi|fikce$|pohád|epos|^satira$/iu;
const NOT_LITERATURE_DESC = /biblick|hudební|posvátn|nábožensk|manga|komiks|encyklopedi|slovník|manifest|politolog|filozofick\p{L}* (dílo|spis|text)|ekonomick|kronik|letopis|franšíz|^opera|autobiografi|kniha bible/iu;
const isNotLiterature = (detail) => {
    if (NOT_LITERATURE_DESC.test(detail.d || '')) return true;
    const labels = [...(detail.type || []), ...(detail.genre || []), ...(detail.form || [])].map(cs).filter(Boolean);
    if (labels.some(text => NOT_LITERATURE_ALWAYS.test(text))) return true;
    return !labels.some(text => FICTION_LABEL.test(text)) && labels.some(text => NOT_LITERATURE_TYPE.test(text));
};
const workCandidateIds = new Set(candidates.works.map(([q]) => q));
const NO_GENRE = new Set(['Proměna', 'Proces', 'Lolita', 'Jako zabít ptáčka']);
// Rok díla: vydání, kromě pozdějšího vydání dávného díla (Platónova Ústava „1963“); vznik zaokrouhlený na století jen bez vydání
const workYearOf = (detail) => {
    const pub = minYear(detail.pub);
    const inception = minYear(detail.from);
    if (pub === undefined) return inception;
    return inception !== undefined && inception < pub - 30 && inception % 100 !== 0 ? inception : pub;
};
const works = [];
const workReasons = {};
const workReject = (reason) => { workReasons[reason] = (workReasons[reason] || 0) + 1; };
for (const [qid] of candidates.works) {
    const detail = details.get(qid);
    if (!detail || !detail.t) { workReject('nodetail'); continue; }
    if (isNotLiterature(detail)) { workReject('neliteratura'); continue; }
    const kind = workKindOf(detail);
    if (!kind) { workReject('druh'); continue; }
    const authors = detail.author || [];
    if (authors.length !== 1) { workReject('autori'); continue; }
    const by = nameOf(authors[0]);
    if (!by || /anonym|různí|kolektiv|neznám/iu.test(by)) { workReject('autor'); continue; }
    // Žánr, který Wikidata uvádějí sporně (Kafkova Proměna jako horor), se vynechá
    works.push({ qid, detail, name: nameOf(qid), category: 'dila', kind, author: authors[0], by, genre: NO_GENRE.has(nameOf(qid)) ? null : genreGroupOf(detail),
        year: workYearOf(detail) });
}
console.log('Díla vyřazena:', JSON.stringify(workReasons), 'zbylo', works.length);

// Postavy, které zná skoro každý
const KNOWN_CHARACTERS = new Set(['Sherlock Holmes', 'Dr. Watson', 'Harry Potter', 'Hermiona Grangerová', 'Albus Brumbál', 'Lord Voldemort', 'Gandalf', 'Frodo Pytlík',
    'Bilbo Pytlík', 'Hercule Poirot', 'Jane Marplová', 'Hrabě Drákula', 'Medvídek Pú', 'Petr Pan', 'Tarzan', 'Pinocchio', 'Kapitán Nemo', 'Phileas Fogg', 'Mauglí',
    'Tom Sawyer', 'Huckleberry Finn', 'Don Corleone', 'Josef Švejk', 'Ferda Mravenec', 'Rumcajs', 'Old Shatterhand', 'Winnetou', 'Jean Valjean', 'Alenka',
    'Dorian Gray', 'Pipi Dlouhá punčocha', 'Robert Langdon', 'Řehoř Samsa', 'Dlouhý John Silver', 'Pátek', 'Aslan', 'Grinch', 'Profesor Moriarty', 'Robinson Crusoe', 'Kočka Šklíba']);

// Popis postavy: ruční, jinak z Wikidat – jen když nejmenuje dílo ani autora (otázka na dílo a autora by jinak byla hned zodpovězená)
const surname = (name) => (name || '').split(/\s+/).filter(word => word.length >= 3).pop();
const characterDescription = (entry) => {
    if (entry.cur && entry.cur.d) return entry.cur.d;
    const text = entry.detail.d;
    const names = [entry.workName, surname(entry.by)].filter(Boolean);
    return text && names.length && censorName(text, names.join(', ')).includes('[***]') ? undefined : text;
};
// Obecný popis bez obsahu („fiktivní postava“, „postava z románu“) nestačí
const POOR_CHARACTER_DESCRIPTION = /^(hlavní |vedlejší )?(literární |fiktivní |smyšlená )?(postava|hrdina|hrdinka)( (z|ze|v|ve) [\p{L}\s]+)?$/iu;
// --- Postavy: jen ze skutečné literatury (autor je spisovatel) – Batman, Darth Vader a Mickey Mouse ne ---
const NOT_LITERARY_CHARACTER = /komiks|mang|anime|videoher|televizn|filmov|seriálov|folklór|mytolog|legendární|bódhisattva|božstv|personifikac|maskot|kreslená postava$/iu;
// Božstva a bytosti z mýtů, které román jen převzal (Čchang-e, Kuan-jin z Putování na západ)
const NOT_LITERARY_CHARACTER_DESC = /bohyn|\bbůh\b|boh(a|em)\b|božstv|bódhisattv|mytolog|mýt/iu;
const characterIds = new Set([...candidates.characters.map(([q]) => q), ...MUST_CHARACTERS, ...curatedOf.keys()]);
// Dílo ručně vybrané postavy podle názvu (z kandidátů děl), jinak jen název
const workByName = new Map(candidates.works.map(([q]) => q).filter(q => details.get(q) && details.get(q).t && !isNotLiterature(details.get(q)))
    .flatMap(q => [[nameOf(q), q], [titleName(details.get(q).t), q]]).reverse());
const characters = [];
const reasons = {};
for (const qid of characterIds) {
    const detail = details.get(qid);
    if (!detail || !detail.t) { reasons.nodetail = (reasons.nodetail || 0) + 1; continue; }
    const cur = curatedOf.get(qid);
    const typeLabels = (detail.type || []).map(cs).filter(Boolean);
    const literary = typeLabels.includes('literární postava');
    if (!cur && !MUST_CHARACTERS.includes(qid) && typeLabels.some(text => NOT_LITERARY_CHARACTER.test(text)) && !(literary && !typeLabels.some(text => /komiks|mang|anime/u.test(text)))) { reasons.type = (reasons.type || 0) + 1; continue; }
    if (!cur && !MUST_CHARACTERS.includes(qid) && NOT_LITERARY_CHARACTER_DESC.test(detail.d || '')) { reasons.type = (reasons.type || 0) + 1; continue; }
    // Dílo: první literární dílo, ve kterém vystupuje (z našich kandidátů); autor z díla, jinak tvůrce postavy
    // Postava musí být i mezi postavami díla, pokud je dílo vypisuje (Pipi ve Wikidatech „vystupuje“ i v Ronje)
    // Z více děl to nejstarší – první výskyt postavy (Bilbo → Hobit, ne Pán prstenů); dílo se jménem postavy v názvu
    // přednost, když vyšlo nejvýš 15 let po prvním (Huckleberry Finn → Dobrodružství Huckleberryho Finna, ne Opona u Poirota)
    const roots = (nameOf(qid) || '').split(/\s+/).filter(word => word.length >= 4).map(word => word.slice(0, 4).toLocaleLowerCase('cs'));
    const namesCharacter = (q) => (nameOf(q) || '').toLocaleLowerCase('cs').split(/[\s,.:;–-]+/).some(word => roots.some(root => word.startsWith(root)));
    const inWorks = (detail.inWork || []).filter(q => workCandidateIds.has(q) && details.get(q) && !isNotLiterature(details.get(q))
        && (!(details.get(q).characters || []).length || details.get(q).characters.includes(qid)))
        .map(q => ({ q, year: workYearOf(details.get(q)) ?? Infinity }))
        .sort((a, b) => a.year - b.year);
    const named = inWorks.find(entry => namesCharacter(entry.q) && inWorks.length && entry.year - inWorks[0].year <= 15);
    const workQid = (named || inWorks[0] || {}).q;
    const workDetail = workQid ? details.get(workQid) : null;
    const author = ((workDetail && workDetail.author) || []).length === 1 ? workDetail.author[0] : (detail.creator || []).length === 1 ? detail.creator[0] : null;
    if (cur) {
        // Ručně vybraná postava: dílo z tabulky (autor z dat díla), jinak dílo a autor podle Wikidat, nakonec autor z tabulky
        const curWork = cur.w ? workByName.get(cur.w) : undefined;
        const work = curWork || (cur.w ? undefined : workQid);
        const curWorkDetail = curWork ? details.get(curWork) : null;
        const fromWork = curWorkDetail && (curWorkDetail.author || []).length === 1 ? curWorkDetail.author[0] : null;
        const by = fromWork || cur.a || (cur.by ? null : author);
        characters.push({ qid, detail, name: nameOf(qid), category: 'postavy', author: by, by: by ? nameOf(by) : cur.by, work, workName: cur.w || (work ? nameOf(work) : undefined), cur });
        continue;
    }
    // Jen slavné postavy (ne vedlejší postavy Duny nebo Temné věže) a skutečné postavy (ne chór)
    // Méně slavné postavy (pod 18 jazykových verzí, Expert) jen z díla, které v kandidátech je
    const famous = KNOWN_CHARACTERS.has(nameOf(qid)) || detail.sl >= 18;
    const reject = (reason) => { reasons[reason] = (reasons[reason] || 0) + 1; };
    if (!author) { reject('noauthor'); continue; }
    if (/^Chór$/u.test(nameOf(qid) || '') || (!famous && (detail.sl < 10 || !inWorks.length))) { reject('sl'); continue; }
    // Název díla: z našich děl, jinak jen když postava vystupuje v jediném díle
    const workName = workQid ? nameOf(workQid) : (detail.inWork || []).length === 1 ? cs(detail.inWork[0]) : undefined;
    const entry = { qid, detail, name: nameOf(qid), category: 'postavy', author, by: nameOf(author), work: workQid, workName, relaxed: !famous };
    // Postava bez ručního popisu potřebuje použitelný popis z Wikidat: bez díla, autora i vlastního jména a ne jen „literární postava“
    const description = characterDescription(entry);
    if (!description || description.length < 18 || POOR_CHARACTER_DESCRIPTION.test(description) || censorName(description, entry.name).includes('[***]')) { reject('popis'); continue; }
    characters.push(entry);
}
console.log('Postavy vyřazeny:', JSON.stringify(reasons), 'zbylo', characters.length);
// --- 4. krok: výběr (úrovně obtížnosti až v 6. kroku) ---
const LIMITS = {
    spisovatele: { limit: 1250, czLimit: 160 },
    dila: { limit: 1500, czLimit: 160 },
    postavy: { limit: 420, czLimit: 40, curatedLimit: 560 }
};
const surnameOf = (name) => (name || '').split(/\s+/).filter(word => word.length >= 3).pop();
const byFame = (list) => list.sort((a, b) => Number(CZECH_KNOWN.has(b.name)) - Number(CZECH_KNOWN.has(a.name)) || b.detail.sl - a.detail.sl);
const nameKey = (name) => name.toLocaleLowerCase('cs');
const taken = new Set();
const isCzechPerson = (detail) => isCzechDetail(detail, 'cit', 'bornIn');
const selected = [];
const peopleSelected = new Set();
const perAuthor = new Map();
// Stejnojmenná díla (Matka – Čapek i Andersen): přednost má české, pak slavnější
const czechWork = (entry) => isCzechPerson(details.get(entry.author) || {}) || (entry.detail.lang || []).includes('Q9056');
// (jen české dílo, které se do tématu dostane – od vybraného autora; počítá se, až jsou vybraní spisovatelé)
const preferredWork = new Map();
const preferWorks = () => {
    for (const entry of works) {
        const key = entry.name && nameKey(entry.name);
        const other = preferredWork.get(key);
        if (!other || (czechWork(entry) && !czechWork(other) && peopleSelected.has(entry.author))) preferredWork.set(key, entry);
    }
};
for (const list of [byFame(people), byFame(works), byFame(characters)]) {
    const counts = { all: 0, cz: 0 };
    if (list === works) preferWorks();
    for (const entry of list) {
        const { detail, category, name } = entry;
        // Bez autora jen ručně vybrané postavy anonymních děl (Sindibád z Tisíce a jedné noci) – bez otázky na autora
        if (!name || (category !== 'spisovatele' && !entry.by && !entry.cur)) continue;
        const settings = LIMITS[category];
        // Díla a postavy jen od vybraných spisovatelů nebo slavná (autor v datech je potřeba pro otázku na autora)
        // Ručně vybrané postavy i od autorů, kteří v tématu nejsou (Barrie, Fleming) – bez otázky na autora
        if (category !== 'spisovatele' && !entry.cur && !peopleSelected.has(entry.author) && (category === 'postavy' || detail.sl < 18) && !CZECH_KNOWN.has(name)) continue;
        // Dílo autora, který v tématu není: popis nesmí autora jmenovat (nápověda „autor“ by u otázky na století nic nepřidala)
        if (category === 'dila' && !peopleSelected.has(entry.author) && !CZECH_KNOWN.has(name) && detail.d && surnameOf(entry.by)
            && censorName(detail.d, surnameOf(entry.by)).includes('[***]')) continue;
        const authorDetail = details.get(entry.author) || {};
        const isCzech = category === 'spisovatele' ? isCzechPerson(detail)
            : isCzechPerson(authorDetail) || (detail.lang || []).includes('Q9056') || (detail.origin || []).some(q => CZECH_STATES.has(q)) || (entry.cur && entry.cur.land === 'Česko');
        const must = CZECH_KNOWN.has(name);
        if (!must && counts.all >= (entry.cur ? settings.curatedLimit : settings.limit) && !(isCzech && counts.cz < settings.czLimit)) continue;
        if (taken.has(nameKey(name)) || (category === 'dila' && preferredWork.get(nameKey(name)) !== entry)) continue;
        if (category !== 'spisovatele') {
            // Dílo nazvané po autorovi a nejvýš 15 děl (5 postav) od jednoho autora – jinak by byl půl tématu Harry Potter
            // Ručně vybraných postav jedné série víc (Středozem, Bradavice)
            const cap = category === 'dila' ? 15 : entry.cur ? 32 : 5;
            const key = `${category}:${entry.author}`;
            if ((entry.by && nameKey(entry.by).includes(nameKey(name))) || (perAuthor.get(key) || 0) >= cap) continue;
            perAuthor.set(key, (perAuthor.get(key) || 0) + 1);
        }
        taken.add(nameKey(name));
        counts.all++;
        if (isCzech) counts.cz++;
        if (category === 'spisovatele') peopleSelected.add(entry.qid);
        // Vždy známé: slavná česká jména a díla, ručně vybrané známé postavy; nikdy: slavní jen podle počtu jazykových verzí
        const always = must || (category === 'postavy' && (KNOWN_CHARACTERS.has(name) || Boolean(entry.cur && entry.cur.k)));
        selected.push({ ...entry, isCzech, always, never: !always && NOT_KNOWN.has(name) });
    }
}
const selectedIds = new Set(selected.map(entry => entry.qid));

// Nejslavnější dílo spisovatele: z významných děl (P800) to, které máme, jinak naše nejslavnější
const worksByAuthor = new Map();
for (const entry of selected) if (entry.category === 'dila') worksByAuthor.set(entry.author, [...(worksByAuthor.get(entry.author) || []), entry]);
const famousWorkOf = (entry) => {
    // Dílo s letopočtem v názvu (1984) by u otázky na století prozradilo odpověď
    const own = (worksByAuthor.get(entry.qid) || []).filter(other => !/\d{3}/u.test(other.name));
    const notable = entry.detail.notable || [];
    const work = own.find(other => notable.includes(other.qid)) || own[0];
    if (work) return work.name;
    // Jen dílo s českým článkem a českým názvem (ne 野ざらし紀行)
    const name = notable.filter(q => workCandidateIds.has(q)).map(nameOf).find(other => other && other.length <= 50 && /^[\p{Script=Latin}\d\s\p{P}]+$/u.test(other) && !/\d{3}/u.test(other));
    return name && !nameKey(name).includes(nameKey(entry.name)) ? name : undefined;
};
const CZECH_LANDS = /^(Česko|Československo)$/u;

const items = [];
for (const entry of selected) {
    const { qid, detail, category } = entry;
    let f;
    if (category === 'spisovatele') {
        const { born, died } = entry.life;
        f = {
            born, died,
            land: ancientLand(landOf(detail, 'cit'), detail),
            lang: writerLanguageOf(detail, ancientLand(landOf(detail, 'cit'), detail)),
            genre: [...entry.kinds, ...(entry.genre && !entry.kinds.length ? [entry.genre.label] : [])].slice(0, 2).join(', ') || undefined,
            mov: personMovement(entry.name, detail, born),
            nobel: (detail.award || []).includes(NOBEL_LITERATURE) ? 1 : undefined,
            work: famousWorkOf(entry),
            y: born === undefined ? (worksByAuthor.get(qid) || []).map(work => work.year).filter(year => year !== undefined)[0]
                : Math.min(born + 35, died !== undefined ? Math.round(born + (died - born) * 0.75) : born + 35)
        };
    } else if (category === 'dila') {
        const authorDetail = details.get(entry.author) || {};
        f = {
            year: entry.year,
            by: entry.by,
            byq: selectedIds.has(entry.author) ? entry.author : undefined,
            genre: entry.genre ? entry.genre.label : undefined,
            lang: languageOf(detail.lang) || languageOf(authorDetail.writes),
            land: (detail.origin || []).map(countryName).find(Boolean) || landOf(authorDetail, 'cit'),
            // Postavy díla (bez těch, jejichž jméno je v názvu – Švejk u Švejka)
            // Nápověda „Postavy“ u názvu se slovem pošta (Zaslaná pošta) by vypadala jako prozrazení – audit to tak hodnotí
            chars: /(^|\s)po[sš]t/iu.test(entry.name) ? undefined : (detail.characters || []).filter(q => characterIds.has(q)).map(nameOf).filter(name => name !== 'Chór').filter(name => name && !nameKey(entry.name).includes(nameKey(name).split(' ').pop())).slice(0, 3).join(', ') || undefined,
            y: entry.year
        };
    } else {
        const authorDetail = details.get(entry.author) || {};
        const workEntry = selected.find(other => other.qid === entry.work);
        const cur = entry.cur || {};
        f = {
            by: entry.by,
            byq: selectedIds.has(entry.author) ? entry.author : undefined,
            work: entry.workName,
            land: cur.land || landOf(authorDetail, 'cit'),
            y: cur.y ?? (workEntry ? workEntry.year : minYear([...((details.get(entry.work) || {}).pub || [])])),
            // Otázka „Ze kterého díla je?“ jen u postavy jednoho díla; další psané odpovědi (Hobit)
            wq: cur.one && entry.workName ? 1 : undefined,
            wa: cur.wa
        };
    }
    items.push(compact({
        q: qid,
        t: detail.t,
        n: entry.name,
        c: category,
        k: 0,
        ty: category === 'dila' ? entry.kind : category === 'postavy' ? 'literární postava' : entry.ty,
        d: category === 'postavy' ? characterDescription(entry) : detail.d,
        cz: entry.isCzech ? 1 : undefined,
        sx: category !== 'dila' && (detail.sex === FEMALE || (entry.cur && entry.cur.sx === 'f')) ? 'f' : undefined,
        ...imageFields(detail.im),
        f: compact(f),
        // Žánrová skupina (sci-fi, detektivka…) pro nesprávné možnosti a okruhy
        gr: entry.genre ? entry.genre.group : undefined,
        kd: category === 'spisovatele' && entry.kinds.length ? entry.kinds : undefined
    }));
}

// Autoři stejnojmenných děl (Faust – Goethe i Marlowe): u otázky na autora nesmí být mezi možnostmi (malý dotaz, stačí query.wikidata.org)
const workNames = [...new Set(items.filter(item => item.c === 'dila').flatMap(item => [item.n, titleName(item.t)]))];
// Mezipaměť podle seznamu názvů – s jinými pravidly výběru se stáhne znovu
const namesakesKey = createHash('sha1').update(workNames.join('|')).digest('hex').slice(0, 10);
const namesakeAuthors = new Map(await cached(`literatura-namesakes-${namesakesKey}`, async () => {
    const result = [];
    await inBatches(workNames, 150, (names) => `SELECT ?l ?au WHERE { VALUES ?l { ${names.map(name => JSON.stringify(name) + '@cs').join(' ')} }
  ?w rdfs:label ?l . ?w wdt:P50 ?au }`,
    (row) => result.push([row.l.value, id(row.au.value)]));
    const grouped = new Map();
    for (const [name, author] of result) grouped.set(name, [...new Set([...(grouped.get(name) || []), author])]);
    return [...grouped];
}));
for (const item of items) {
    if (item.c !== 'dila' || !item.f.byq) continue;
    const others = [...new Set([item.n, titleName(item.t)].flatMap(name => namesakeAuthors.get(name) || []))].filter(q => q !== item.f.byq && selectedIds.has(q));
    if (others.length) item.xa = others;
}

// --- 5. krok: okruhy pro systematické učení ---
const BY_YEAR = { by: 'y' };
// Dílo do české literatury jen česky psané nebo z českých zemí (Tonio Kröger Thomase Manna s československým občanstvím ne, Kafkova Proměna ano)
const isCzechLiterature = (item) => item.cz === 1 && (item.c === 'postavy' || CZECH_LANDS.test(item.f.land || '') || item.f.lang === 'čeština');
const fromLand = (...lands) => (item) => lands.includes(item.f.land);
const writes = (...languages) => (item) => languages.includes(item.f.lang);
const ofKind = (kind, ...workKinds) => (item) => (item.kd || []).includes(kind) || workKinds.includes(item.ty);
const groupsOf = new Map(selected.map(entry => [entry.qid, entry.category === 'postavy' || (entry.category === 'dila' && NO_GENRE.has(entry.name)) ? [] : genreGroupsOf(entry.detail, entry.category === 'spisovatele')]));
const inGenre = (...groups) => (item) => groups.includes(item.gr) || (groupsOf.get(item.q) || []).some(group => groups.includes(group));
const era = (from, to) => (item) => item.f.y !== undefined && item.f.y >= from && item.f.y < to;
// Směr 19. století: spisovatel narozený v době směru (realismus Wikidat u Zadie Smithové ne, surrealismus ani socialistický realismus ne)
// a jeho díla z období směru (Máj, Bídníci; Tolstého pozdní dílo do 1920 ano)
const MOVEMENT_BORN = { romantismus: [1740, 1840], realismus: [1780, 1890], naturalismus: [1800, 1890] };
const movementKey = (mov) => (/^(romantismus|realismus|kritický realismus|naturalismus)$/iu.exec(mov || '') || [])[1]?.toLowerCase().replace('kritický ', '');
const authorMovement = new Map(items.filter(item => item.c === 'spisovatele').map(item => [item.q, item]));
const inMovement = (movement) => (item) => {
    if (item.c === 'spisovatele') {
        const [from, to] = MOVEMENT_BORN[movement];
        return movementKey(item.f.mov) === movement && item.f.born !== undefined && item.f.born >= from && item.f.born <= to;
    }
    const author = item.c === 'dila' && authorMovement.get(item.f.byq);
    const [from, to] = MOVEMENT_YEARS[movement];
    return Boolean(author) && inMovement(movement)(author) && item.f.year !== undefined && item.f.year >= from && item.f.year <= to;
};
const COLLECTIONS = [
    { id: 'ceska-literatura', label: 'Česká literatura', text: 'Spisovatelé, díla a postavy', sort: BY_YEAR, test: isCzechLiterature },
    { id: 'anglicka-americka', label: 'Anglická a americká literatura', sort: BY_YEAR, test: item => !item.cz && (fromLand('Spojené království', 'Spojené státy americké', 'Irsko')(item) || writes('angličtina')(item)) },
    { id: 'francouzska', label: 'Francouzská literatura', sort: BY_YEAR, test: item => fromLand('Francie')(item) || writes('francouzština')(item) },
    { id: 'ruska', label: 'Ruská literatura', sort: BY_YEAR, test: item => fromLand('Rusko', 'Sovětský svaz')(item) || writes('ruština')(item) },
    { id: 'nemecka', label: 'Německy psaná literatura', sort: BY_YEAR, test: item => fromLand('Německo', 'Rakousko')(item) || writes('němčina')(item) },
    { id: 'italska-spanelska', label: 'Italská a španělská literatura', text: 'I Latinská Amerika', sort: BY_YEAR, test: item => fromLand('Itálie', 'Španělsko', 'Argentina', 'Kolumbie', 'Mexiko', 'Chile', 'Peru')(item) || writes('italština', 'španělština')(item) },
    { id: 'antika', label: 'Antická literatura', text: 'Starověké Řecko a Řím', sort: BY_YEAR, test: item => /^Starověk/u.test(item.f.land || '') || (era(-1000, 500)(item) && (fromLand('Řecko', 'Itálie')(item) || writes('starořečtina', 'řečtina', 'latina')(item))) },
    { id: 'stredovek-renesance', label: 'Středověk a renesance', text: 'Zhruba 500–1650', sort: BY_YEAR, test: era(500, 1650) },
    { id: 'stoleti-19', label: 'Literatura 19. století', sort: BY_YEAR, test: era(1800, 1900) },
    { id: 'stoleti-20', label: 'Literatura 20. století', sort: BY_YEAR, test: era(1900, 2000) },
    { id: 'poezie', label: 'Poezie', text: 'Básníci, básně a sbírky', sort: BY_YEAR, test: ofKind('poezie', 'báseň', 'básnická sbírka', 'epos') },
    { id: 'drama', label: 'Drama', text: 'Dramatici a divadelní hry', sort: BY_YEAR, test: ofKind('drama', 'divadelní hra', 'tragédie', 'komedie') },
    { id: 'sci-fi-fantasy', label: 'Sci-fi a fantasy', sort: BY_YEAR, test: inGenre('scifi', 'fantasy') },
    { id: 'detektivky', label: 'Detektivky a thrillery', sort: BY_YEAR, test: inGenre('detektivka') },
    { id: 'horor', label: 'Horor a gotický román', sort: BY_YEAR, test: inGenre('horor') },
    { id: 'detska', label: 'Literatura pro děti', text: 'Pohádky, dětské knihy a jejich autoři', sort: BY_YEAR, test: item => inGenre('detska')(item) || ofKind('pohádky', 'pohádka')(item) },
    { id: 'nobelova-cena', label: 'Nositelé Nobelovy ceny za literaturu', sort: BY_YEAR, test: item => item.f.nobel === 1 },
    { id: 'romantismus', label: 'Romantismus', text: 'Spisovatelé a díla romantismu', sort: BY_YEAR, test: inMovement('romantismus') },
    { id: 'realismus', label: 'Realismus a naturalismus', text: 'Spisovatelé a díla 19. století', sort: BY_YEAR, test: item => inMovement('realismus')(item) || inMovement('naturalismus')(item) }
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
    // Druhy tvorby byly potřeba jen pro okruhy
    delete item.kd;
}
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

// --- 6. krok: úrovně obtížnosti ---
// Slávu měří počet jazykových verzí článku (české položky ×3, nositelé Nobelovy ceny a antičtí autoři méně, české dílo i podle slávy autora).
// Známé (k: 1, Základní): nejslavnějších 20–30 % kategorie, zvlášť mezi českými a ostatními položkami, a navíc nejslavnějších 28 % každého
// okruhu – i malý okruh (horor, antika) tak má dost známých položek; okruh od 8 položek jich má aspoň max(3, 25 %). Strop: méně slavné než
// minKnown známé není, ani když je okruh malý (kromě vždy známých: CZECH_KNOWN, ručně vybrané známé postavy). NOT_KNOWN známé není nikdy.
// Expert (x: 1): nejméně slavných 27 % kategorie (z českých položek 15 %) a postavy přijaté jen pod mírnějším prahem; v okruhu nejvýš 40 %.
// Ostatní = Mudrlant.
const entryOf = new Map(selected.map(entry => [entry.qid, entry]));
const CZECH_BONUS = 3;
const CZECH_EXPERT = 0.15;
// Nobelova cena přidá článek ve spoustě jazyků i spisovatelům, které u nás skoro nikdo nezná (Paul Heyse, Carl Spitteler)
const NOBEL_DISCOUNT = 0.6;
// Antičtí autoři mají článek skoro v každé jazykové verzi Wikipedie (Tertullianus, Plinius mladší) – méně než vypovídá počet verzí
const ANCIENT_DISCOUNT = 0.6;
const baseFameOf = (item) => {
    const entry = entryOf.get(item.q);
    return (entry.always ? Math.max(entry.detail.sl, 150) : entry.detail.sl) * (item.cz ? CZECH_BONUS : 1) * (item.f && item.f.nobel ? NOBEL_DISCOUNT : 1)
        * (item.c === 'spisovatele' && /^Starověk/u.test(item.f.land || '') ? ANCIENT_DISCOUNT : 1);
};
// České dílo má článek jen v pár jazycích, i když ho zná každý ze školy (Polednice, Hordubal) – počítá se i se slávou autora.
// Spisovatel je aspoň tak slavný jako polovina jeho nejslavnějšího díla (Karafiát – Broučci, Otčenášek – Romeo, Julie a tma)
const itemByQ = new Map(items.map(item => [item.q, item]));
const worksOfAuthor = new Map();
for (const item of items) if (item.c === 'dila' && item.f.byq) worksOfAuthor.set(item.f.byq, [...(worksOfAuthor.get(item.f.byq) || []), item]);
const fameCache = new Map();
const fameOf = (item) => {
    if (fameCache.has(item.q)) return fameCache.get(item.q);
    let fame = baseFameOf(item);
    if (item.c === 'spisovatele') fame = Math.max(fame, ...(worksOfAuthor.get(item.q) || []).map(work => 0.5 * baseFameOf(work)));
    else if (item.c === 'dila' && item.cz && itemByQ.has(item.f.byq)) fame = Math.max(fame, 0.3 * baseFameOf(itemByQ.get(item.f.byq)));
    fameCache.set(item.q, fame);
    return fame;
};
const LEVELS = {
    spisovatele: { known: 0.2, minKnown: 35, expert: 0.27 },
    dila: { known: 0.26, minKnown: 30, expert: 0.27 },
    postavy: { known: 0.3, minKnown: 15, expert: 0.27 }
};
const OKRUH_KNOWN = 0.28;
const OKRUH_FLOOR = 0.25;
// Od jednoho autora nejvýš 3 známá díla (4 kvůli okruhu) – jinak by Základní okruh poezie byl celý Shakespeare
const knownByAuthor = new Map();
const canBeKnown = (item, minFame, perAuthor) => {
    const entry = entryOf.get(item.q);
    if (item.k === 1 || entry.never || fameOf(item) < minFame) return false;
    return item.c !== 'dila' || (knownByAuthor.get(entry.author) || 0) < perAuthor;
};
const makeKnown = (item) => {
    item.k = 1;
    if (item.c === 'dila') knownByAuthor.set(entryOf.get(item.q).author, (knownByAuthor.get(entryOf.get(item.q).author) || 0) + 1);
};
const byFameDesc = (list) => [...list].sort((a, b) => fameOf(b) - fameOf(a));
for (const item of items) if (entryOf.get(item.q).always) makeKnown(item);
// Kategorie zvlášť pro české a pro ostatní položky – česká jména se tak s cizími nepřetahují o počet jazykových verzí
const strata = (category) => [true, false].map(czech => items.filter(item => item.c === category && Boolean(item.cz) === czech));
for (const [category, level] of Object.entries(LEVELS)) {
    for (const stratum of strata(category)) {
        const inStratum = byFameDesc(stratum);
        let known = inStratum.filter(item => item.k === 1).length;
        for (const item of inStratum) {
            if (known >= Math.round(level.known * inStratum.length)) break;
            if (canBeKnown(item, level.minKnown, 3)) { makeKnown(item); known++; }
        }
    }
}
for (const collection of collections) {
    const inOkruh = byFameDesc(items.filter(item => (item.g || []).includes(collection.id)));
    if (inOkruh.length < 8) continue;
    // Nejdřív slavné nad stropem, do minima okruhu i méně slavné (aspoň 60 % stropu)
    for (const [share, relax] of [[OKRUH_KNOWN, 1], [OKRUH_FLOOR, 0.6]]) {
        const target = Math.max(3, Math.ceil(share * inOkruh.length));
        let known = inOkruh.filter(item => item.k === 1).length;
        for (const item of inOkruh) {
            if (known >= target) break;
            if (canBeKnown(item, LEVELS[item.c].minKnown * relax, 4)) { makeKnown(item); known++; }
        }
    }
}
for (const [category, level] of Object.entries(LEVELS)) {
    for (const stratum of strata(category)) {
        // Ručně vybrané české postavy (Mirek Dušín, Brouk Pytlík) mají málo jazykových verzí, ale čeští hráči je znají – expertní nejsou
        const rest = byFameDesc(stratum.filter(item => item.k !== 1 && !(entryOf.get(item.q).cur && item.cz))).reverse();
        // Českou literaturu znají čeští hráči líp, než ukazuje počet jazykových verzí (Cirkus Humberto) – expertních je méně
        const expert = new Set(rest.slice(0, Math.round((stratum[0] && stratum[0].cz ? CZECH_EXPERT : level.expert) * stratum.length)));
        for (const item of rest) if (expert.has(item) || entryOf.get(item.q).relaxed) item.x = 1;
    }
}
// Okruh nesmí být z víc než 40 % expertní (česká literatura má hodně méně slavných autorů): nejslavnější z nich se vrátí do Mudrlanta
const OKRUH_EXPERT = 0.4;
for (const collection of collections) {
    const inOkruh = items.filter(item => (item.g || []).includes(collection.id));
    const experts = byFameDesc(inOkruh.filter(item => item.x && !entryOf.get(item.q).relaxed));
    const over = inOkruh.filter(item => item.x).length - Math.floor(OKRUH_EXPERT * inOkruh.length);
    for (const item of experts.slice(0, Math.max(0, over))) delete item.x;
}

for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.x).length} expertních, ${inCategory.filter(item => item.cz).length} českých, ${inCategory.filter(item => item.im).length} s fotkou)`);
}
for (const collection of collections) {
    const inOkruh = items.filter(item => (item.g || []).includes(collection.id));
    console.log(`okruh ${collection.label}: ${inOkruh.length} (${inOkruh.filter(item => item.k).length} známých, ${inOkruh.filter(item => item.x).length} expertních)`);
}

// Popisy, které by jinak prozradily název (Povídky malostranské – „soubor povídek“): obecné slovo druhu se nahradí
for (const item of items) {
    if (item.n === 'Povídky malostranské') Object.assign(item, { ty: 'sbírka próz', d: 'soubor próz z pražské Malé Strany od Jana Nerudy' });
    // Název s „povídky“ + druh „sbírka povídek“ = prozrazená odpověď
    else if (item.c === 'dila' && /(povíd|pohád)/iu.test(item.n)) {
        if (item.ty) item.ty = item.ty.replace(/(povídek|pohádek)/giu, 'próz');
        if (item.d) item.d = item.d.replace(/(povídek|pohádek)/giu, 'próz');
    }
}
writeTopic('literatura', { collections, items });
