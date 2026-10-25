// Téma Literatura: data/literatura.json z Wikidat (přes QLever) – spisovatelé a básníci, literární díla a postavy
// Spuštění: npm run build:literatura (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { sparql, qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic, readCountries } from './lib/wikidata.mjs';

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
console.log(`Kandidáti: ${candidates.people.length} osob, ${candidates.works.length} děl, ${candidates.characters.length} postav`);

// --- 2. krok: podrobnosti po dávkách ---
const SINGLE = { t: 1, n: 1, d: 1, den: 1, im: 1, born: 1, died: 1, sex: 1 };
const PROPERTIES = {
    born: 'P569', died: 'P570', sex: 'P21', cit: 'P27', occ: 'P106', genre: 'P136', mov: 'P135', notable: 'P800', writes: 'P6886',
    speaks: 'P1412', award: 'P166', author: 'P50', pub: 'P577', from: 'P571', form: 'P7937', origin: 'P495', lang: 'P407', type: 'P31',
    creator: 'P170', inWork: 'P1441', series: 'P179', partOf: 'P361', characters: 'P674'
};
const allIds = [...new Set(Object.values(candidates).flat().map(([q]) => q))];
const fetchDetails = async (list, run = qlever) => {
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
const details = new Map(await cached('literatura-details', async () => [...await fetchDetails(allIds)]));
const missingDetails = allIds.filter(qid => !details.has(qid));
if (missingDetails.length) for (const [qid, detail] of await fetchDetails(missingDetails)) details.set(qid, detail);
// Slavné postavy, které obecný dotaz nenajde (Švejk nemá ve Wikidatech vazbu na dílo), z query.wikidata.org
const MUST_CHARACTERS = ['Q1976939', 'Q1932108', 'Q9323967', 'Q741432', 'Q1156620', 'Q2587533', 'Q30611756', 'Q1269082', 'Q12292447'];
for (const [qid, detail] of await cached('literatura-must-characters', async () => [...await fetchDetails(MUST_CHARACTERS, sparql)])) details.set(qid, detail);
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
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]), qlever);
    return result;
};
const labels = new Map(await cached('literatura-labels', () => fetchLabels(referenced)));
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

// Role z popisu: podstatná jména před prvním „a“ či čárkou („britský filolog a spisovatel“ → filolog, spisovatel)
const ADJECTIVE = /^[\p{L}-]+(ý|á|é|í|ské|cké)$/u;
const NOT_A_ROLE = /^(a|z|ze|v|ve|se|i|–|-|později|původně|též|také|\d.*)$/u;
const rolesOf = (description) => cleanText(description).toLowerCase().split(/[\s,;]+/)
    .filter(word => word && !ADJECTIVE.test(word) && !NOT_A_ROLE.test(word)).slice(0, 3);
const WRITER_ROLE = /^(spisovatel|básník|básnířk|dramatik|dramatičk|prozaik|romanopis|autor|literát|pohádkář|bajkář|esejist|humorist|satirik|povídkář|novelist|epik|lyrik)/u;
// Kdo je hlavně politik, vědec, umělec či kněz, mezi spisovatele nepatří (Churchill, Leonardo, Luther)
const OTHER_ROLE = /^(politik|prezident|papež|král|královn|císař|herec|herečk|zpěv|skladatel|hudebník|písničkář|malíř|sochař|fyzik|chemik|matematik|astronom|lékař|psycholog|ekonom|vojevůdce|generál|podnikatel|režisér|kreslíř|výtvarník|teolog|kazatel|světec|mnich|biskup|historik|vědec|přírodovědec|architekt|fotograf|novinář|aktivist|diplomat|právník|cestovatel|kněz|reformátor|polyhistor)/u;

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
// Literární směr (P135) jen ze známých směrů
const MOVEMENT = /romanticism|realism|naturalism|symbolism|modernism|existentialism|classicism|enlightenment|renaissance|baroque|surrealism|futurism|dada|decadence|beat generation|magic realism|sturm und drang|lost generation|expressionism|poetism|absurd|parnass|impressionism/;
const movementOf = (detail) => (detail.mov || []).filter(q => MOVEMENT.test(en(q).toLowerCase()) && !/music/.test(en(q).toLowerCase())).map(cs).find(text => text && text.length <= 30);
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
    'Sword Art Online', 'Eragon', 'Nový měsíc', 'Lovec draků', 'Klub rváčů', 'Život je sen', 'Práce a dni']);
const EXCLUDED = new Set(['Donald Trump', 'Bob Dylan']);

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
    if (!CZECH_KNOWN.has(name) && !MUST_PEOPLE.includes(qid) && (writer < 0 || writer > 1 || OTHER_ROLE.test(roles[0]))) continue;
    // Starověký autor bez dat (Homér) zůstane – rok se odhadne podle jeho děl
    // (i s odhadem na celá půlstoletí – Homér „900–800 př. n. l.“), rok se odhadne podle jeho děl
    const guessed = [yearOf(detail.born), yearOf(detail.died)].every(year => year !== undefined && year < 500 && year % 50 === 0);
    const ancient = (!detail.born || guessed) && /starověk|antick|starořeck|římsk/u.test(detail.d);
    const life = ancient ? {} : lifeYears(detail);
    if (!life) continue;
    // Druh tvorby z rolí: básník → poezie, dramatik → drama, prozaik → próza
    const kinds = [...new Set(roles.map(role => /^básn/u.test(role) ? 'poezie' : /^dramat/u.test(role) ? 'drama' : /^(prozaik|romanopis|povídkář|novelist)/u.test(role) ? 'próza' : /^pohádk/u.test(role) ? 'pohádky' : null).filter(Boolean))];
    const female = detail.sex === FEMALE;
    const role = roles[writer >= 0 ? writer : 0] || '';
    people.push({
        qid, detail, name, category: 'spisovatele', life, kinds, genre: writerGenreOf(detail),
        ty: /^básn/u.test(role) ? (female ? 'básnířka' : 'básník') : /^dramat/u.test(role) ? (female ? 'dramatička' : 'dramatik') : female ? 'spisovatelka' : 'spisovatel'
    });
}

// --- Díla ---
// Druh díla podle popisu, formy (P7937) a žánru; pořadí rozhoduje (sbírka povídek před povídkou)
const WORK_KINDS = [
    ['básnická sbírka', /sbírk\p{L}* (básní|poezie|veršů)|básnick\p{L}* sbírk/u], ['sbírka povídek', /sbírk\p{L}* (povídek|pohádek|próz)/u],
    ['román', /román/u], ['novela', /novel/u], ['povídka', /povídk/u], ['tragédie', /tragédi/u], ['komedie', /komedi|fraška|fraš/u],
    ['divadelní hra', /divadeln\p{L}* hr|drama(?!t)|dramatick\p{L}* dílo|činohr/u], ['epos', /epos|epick\p{L}* báse/u], ['pohádka', /pohád/u],
    ['bajka', /bajk/u], ['báseň', /báse|poema|balad|óda|elegie|sonet|veršovan/u]
];
const workKindOf = (detail) => {
    for (const text of [detail.d || '', ...(detail.form || []).map(cs), ...(detail.type || []).map(cs), ...(detail.genre || []).map(cs)]) {
        const found = WORK_KINDS.find(([, pattern]) => pattern.test((text || '').toLowerCase()));
        if (found) return found[0];
    }
    return null;
};
// Co literaturou v užším smyslu není (posvátné texty, manga, slovníky, manifesty, odborné spisy, franšízy, opery, paměti)
const NOT_LITERATURE_TYPE = /biblick|svat(á|é) kniha|posvátn|nábožensk|manga|komiks|encyklopedi|slovník|časopis|manifest|vědeck|traktát|kronik|letopis|franšíz|edice|dokument|hoax|falzifikát|hudebn|filmov|film$|seriál|videohr|hymna|webov|internetov|autobiografi|deník|cestopis|^esej|filozofick|politick|ročenk|sútra|věštb|light novel/iu;
const NOT_LITERATURE_DESC = /biblick|posvátn|nábožensk|manga|komiks|encyklopedi|slovník|manifest|politolog|filozofick\p{L}* (dílo|spis|text)|ekonomick|kronik|letopis|franšíz|^opera|autobiografi|kniha bible/iu;
const isNotLiterature = (detail) => NOT_LITERATURE_DESC.test(detail.d || '') || [...(detail.type || []), ...(detail.genre || []), ...(detail.form || [])].map(cs).some(text => text && NOT_LITERATURE_TYPE.test(text));
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
for (const [qid] of candidates.works) {
    const detail = details.get(qid);
    if (!detail || !detail.t) continue;
    if (isNotLiterature(detail)) continue;
    const kind = workKindOf(detail);
    if (!kind) continue;
    const authors = detail.author || [];
    if (authors.length !== 1) continue;
    const by = nameOf(authors[0]);
    if (!by || /anonym|různí|kolektiv|neznám/iu.test(by)) continue;
    // Žánr, který Wikidata uvádějí sporně (Kafkova Proměna jako horor), se vynechá
    works.push({ qid, detail, name: nameOf(qid), category: 'dila', kind, author: authors[0], by, genre: NO_GENRE.has(nameOf(qid)) ? null : genreGroupOf(detail),
        year: workYearOf(detail) });
}

// Postavy, které zná skoro každý
const KNOWN_CHARACTERS = new Set(['Sherlock Holmes', 'Dr. Watson', 'Harry Potter', 'Hermiona Grangerová', 'Albus Brumbál', 'Lord Voldemort', 'Gandalf', 'Frodo Pytlík',
    'Bilbo Pytlík', 'Hercule Poirot', 'Jane Marplová', 'Hrabě Drákula', 'Medvídek Pú', 'Petr Pan', 'Tarzan', 'Pinocchio', 'Kapitán Nemo', 'Phileas Fogg', 'Mauglí',
    'Tom Sawyer', 'Huckleberry Finn', 'Don Corleone', 'Josef Švejk', 'Ferda Mravenec', 'Rumcajs', 'Old Shatterhand', 'Winnetou', 'Jean Valjean', 'Alenka',
    'Dorian Gray', 'Pipi Dlouhá punčocha', 'Robert Langdon', 'Řehoř Samsa', 'Dlouhý John Silver', 'Pátek', 'Aslan', 'Grinch', 'Profesor Moriarty', 'Robinson Crusoe', 'Kočka Šklíba']);

// --- Postavy: jen ze skutečné literatury (autor je spisovatel) – Batman, Darth Vader a Mickey Mouse ne ---
const NOT_LITERARY_CHARACTER = /komiks|mang|anime|videoher|folklór|mytolog|legendární|bódhisattva|božstv|personifikac|maskot|kreslená postava$/iu;
const characterIds = new Set([...candidates.characters.map(([q]) => q), ...MUST_CHARACTERS]);
const characters = [];
for (const qid of characterIds) {
    const detail = details.get(qid);
    if (!detail || !detail.t) continue;
    const typeLabels = (detail.type || []).map(cs).filter(Boolean);
    const literary = typeLabels.includes('literární postava');
    if (!MUST_CHARACTERS.includes(qid) && typeLabels.some(text => NOT_LITERARY_CHARACTER.test(text)) && !(literary && !typeLabels.some(text => /komiks|mang|anime/u.test(text)))) continue;
    // Dílo: první literární dílo, ve kterém vystupuje (z našich kandidátů); autor z díla, jinak tvůrce postavy
    // Postava musí být i mezi postavami díla, pokud je dílo vypisuje (Pipi ve Wikidatech „vystupuje“ i v Ronje)
    const workQid = (detail.inWork || []).find(q => workCandidateIds.has(q) && details.get(q) && !isNotLiterature(details.get(q))
        && (!(details.get(q).characters || []).length || details.get(q).characters.includes(qid)));
    const workDetail = workQid ? details.get(workQid) : null;
    const author = ((workDetail && workDetail.author) || []).length === 1 ? workDetail.author[0] : (detail.creator || []).length === 1 ? detail.creator[0] : null;
    // Jen slavné postavy (ne vedlejší postavy Duny nebo Temné věže) a skutečné postavy (ne chór)
    if (!author || /^Chór$/u.test(nameOf(qid) || '') || (!KNOWN_CHARACTERS.has(nameOf(qid)) && detail.sl < 25)) continue;
    // Název díla: z našich děl, jinak jen když postava vystupuje v jediném díle
    const workName = workQid ? nameOf(workQid) : (detail.inWork || []).length === 1 ? cs(detail.inWork[0]) : undefined;
    characters.push({ qid, detail, name: nameOf(qid), category: 'postavy', author, by: nameOf(author), work: workQid, workName });
}
// --- 4. krok: výběr a známost ---
const LIMITS = {
    spisovatele: { limit: 520, known: 130, czLimit: 110 },
    dila: { limit: 480, known: 110, czLimit: 80 },
    postavy: { limit: 90, known: 35, czLimit: 20 }
};
const byFame = (list) => list.sort((a, b) => Number(CZECH_KNOWN.has(b.name)) - Number(CZECH_KNOWN.has(a.name)) || b.detail.sl - a.detail.sl);
const nameKey = (name) => name.toLocaleLowerCase('cs');
const taken = new Set();
const isCzechPerson = (detail) => isCzechDetail(detail, 'cit', 'bornIn');
const selected = [];
const peopleSelected = new Set();
const perAuthor = new Map();
for (const list of [byFame(people), byFame(works), byFame(characters)]) {
    const counts = { all: 0, cz: 0, known: 0 };
    const knownPerAuthor = new Map();
    for (const entry of list) {
        const { detail, category, name } = entry;
        if (!name || (category !== 'spisovatele' && !entry.by)) continue;
        const settings = LIMITS[category];
        // Díla a postavy jen od vybraných spisovatelů nebo slavná (autor v datech je potřeba pro otázku na autora)
        if (category !== 'spisovatele' && !peopleSelected.has(entry.author) && (category === 'postavy' || detail.sl < 40) && !CZECH_KNOWN.has(name)) continue;
        const authorDetail = details.get(entry.author) || {};
        const isCzech = category === 'spisovatele' ? isCzechPerson(detail)
            : isCzechPerson(authorDetail) || (detail.lang || []).includes('Q9056') || (detail.origin || []).some(q => CZECH_STATES.has(q));
        const must = CZECH_KNOWN.has(name);
        if (!must && counts.all >= settings.limit && !(isCzech && counts.cz < settings.czLimit)) continue;
        if (taken.has(nameKey(name))) continue;
        if (category !== 'spisovatele') {
            // Dílo nazvané po autorovi a nejvýš 6 děl (3 postavy) od jednoho autora – jinak by byl půl tématu Harry Potter
            const cap = category === 'dila' ? 6 : 3;
            const key = `${category}:${entry.author}`;
            if (nameKey(entry.by).includes(nameKey(name)) || (perAuthor.get(key) || 0) >= cap) continue;
            perAuthor.set(key, (perAuthor.get(key) || 0) + 1);
        }
        taken.add(nameKey(name));
        const authorKey = entry.author || entry.qid;
        let known = category === 'postavy' ? KNOWN_CHARACTERS.has(name)
            : must || (!NOT_KNOWN.has(name) && counts.known < settings.known && (knownPerAuthor.get(authorKey) || 0) < (category === 'spisovatele' ? 1 : 3));
        if (known && !must) {
            counts.known++;
            knownPerAuthor.set(authorKey, (knownPerAuthor.get(authorKey) || 0) + 1);
        }
        counts.all++;
        if (isCzech) counts.cz++;
        if (category === 'spisovatele') peopleSelected.add(entry.qid);
        selected.push({ ...entry, isCzech, known });
    }
}
const selectedIds = new Set(selected.map(entry => entry.qid));

// Nejslavnější dílo spisovatele: z významných děl (P800) to, které máme, jinak naše nejslavnější
const worksByAuthor = new Map();
for (const entry of selected) if (entry.category === 'dila') worksByAuthor.set(entry.author, [...(worksByAuthor.get(entry.author) || []), entry]);
const famousWorkOf = (entry) => {
    const own = worksByAuthor.get(entry.qid) || [];
    const notable = entry.detail.notable || [];
    const work = own.find(other => notable.includes(other.qid)) || own[0];
    if (work) return work.name;
    // Jen dílo s českým článkem a českým názvem (ne 野ざらし紀行)
    const name = notable.filter(q => workCandidateIds.has(q)).map(nameOf).find(other => other && other.length <= 50 && /^[\p{Script=Latin}\d\s\p{P}]+$/u.test(other));
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
            land: landOf(detail, 'cit'),
            lang: writerLanguageOf(detail, landOf(detail, 'cit')),
            genre: [...entry.kinds, ...(entry.genre && !entry.kinds.length ? [entry.genre.label] : [])].slice(0, 2).join(', ') || undefined,
            mov: movementOf(detail),
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
            chars: (detail.characters || []).filter(q => characterIds.has(q)).map(nameOf).filter(name => name !== 'Chór').filter(name => name && !nameKey(entry.name).includes(nameKey(name).split(' ').pop())).slice(0, 3).join(', ') || undefined,
            y: entry.year
        };
    } else {
        const authorDetail = details.get(entry.author) || {};
        const workEntry = selected.find(other => other.qid === entry.work);
        f = {
            by: entry.by,
            byq: selectedIds.has(entry.author) ? entry.author : undefined,
            work: entry.workName,
            land: landOf(authorDetail, 'cit'),
            y: workEntry ? workEntry.year : minYear([...((details.get(entry.work) || {}).pub || [])])
        };
    }
    items.push(compact({
        q: qid,
        t: detail.t,
        n: entry.name,
        c: category,
        k: entry.known ? 1 : 0,
        ty: category === 'dila' ? entry.kind : category === 'postavy' ? 'literární postava' : entry.ty,
        d: detail.d,
        cz: entry.isCzech ? 1 : undefined,
        sx: category !== 'dila' && detail.sex === FEMALE ? 'f' : undefined,
        ...imageFields(detail.im),
        f: compact(f),
        // Žánrová skupina (sci-fi, detektivka…) pro nesprávné možnosti a okruhy
        gr: entry.genre ? entry.genre.group : undefined,
        kd: category === 'spisovatele' && entry.kinds.length ? entry.kinds : undefined
    }));
}

// Autoři stejnojmenných děl (Faust – Goethe i Marlowe): u otázky na autora nesmí být mezi možnostmi (malý dotaz, stačí query.wikidata.org)
const workNames = [...new Set(items.filter(item => item.c === 'dila').flatMap(item => [item.n, titleName(item.t)]))];
const namesakeAuthors = new Map(await cached('literatura-namesakes', async () => {
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
const isCzechLiterature = (item) => item.cz === 1 && (item.c !== 'spisovatele' || CZECH_LANDS.test(item.f.land || '') || item.f.lang === 'čeština');
const fromLand = (...lands) => (item) => lands.includes(item.f.land);
const writes = (...languages) => (item) => languages.includes(item.f.lang);
const ofKind = (kind, ...workKinds) => (item) => (item.kd || []).includes(kind) || workKinds.includes(item.ty);
const inGenre = (...groups) => (item) => groups.includes(item.gr);
const era = (from, to) => (item) => item.f.y !== undefined && item.f.y >= from && item.f.y < to;
const COLLECTIONS = [
    { id: 'ceska-literatura', label: 'Česká literatura', text: 'Spisovatelé, díla a postavy', sort: BY_YEAR, test: isCzechLiterature },
    { id: 'anglicka-americka', label: 'Anglická a americká literatura', sort: BY_YEAR, test: item => !item.cz && (fromLand('Spojené království', 'Spojené státy americké', 'Irsko')(item) || writes('angličtina')(item)) },
    { id: 'francouzska', label: 'Francouzská literatura', sort: BY_YEAR, test: item => fromLand('Francie')(item) || writes('francouzština')(item) },
    { id: 'ruska', label: 'Ruská literatura', sort: BY_YEAR, test: item => fromLand('Rusko', 'Sovětský svaz')(item) || writes('ruština')(item) },
    { id: 'nemecka', label: 'Německy psaná literatura', sort: BY_YEAR, test: item => fromLand('Německo', 'Rakousko')(item) || writes('němčina')(item) },
    { id: 'italska-spanelska', label: 'Italská a španělská literatura', text: 'I Latinská Amerika', sort: BY_YEAR, test: item => fromLand('Itálie', 'Španělsko', 'Argentina', 'Kolumbie', 'Mexiko', 'Chile', 'Peru')(item) || writes('italština', 'španělština')(item) },
    { id: 'antika', label: 'Antická literatura', text: 'Starověké Řecko a Řím', sort: BY_YEAR, test: item => era(-1000, 500)(item) || /^Starověk/u.test(item.f.land || '') },
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
    { id: 'romantismus', label: 'Romantismus', text: 'Spisovatelé romantismu', sort: BY_YEAR, test: item => /romantismus/u.test(item.f.mov || '') },
    { id: 'realismus', label: 'Realismus a naturalismus', sort: BY_YEAR, test: item => /realismus|naturalismus/u.test(item.f.mov || '') && !/magick/u.test(item.f.mov || '') }
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
    // Druhy tvorby byly potřeba jen pro okruhy
    delete item.kd;
}
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.cz).length} českých, ${inCategory.filter(item => item.im).length} s fotkou)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('literatura', { collections, items });
