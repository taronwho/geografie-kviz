// Téma Hudba: data/hudba.json z Wikidat (přes QLever) – skladatelé, hudebníci a zpěváci, kapely a slavná díla
// Spuštění: npm run build:hudba (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování; WIKIDATA_ENDPOINT=wdqs čte podrobnosti
// z query.wikidata.org, když je QLever přetížený). Položky, které v data/hudba.json už jsou, zůstávají, pokud je pravidla pořád berou.
// Úrovně obtížnosti: scripts/lib/hudba-levels.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assignLevels } from './lib/hudba-levels.mjs';
import { cachedByKey } from './lib/zemepis-levels.mjs';
import { qlever, sparql, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic, readCountries } from './lib/wikidata.mjs';

const HUMAN = 'Q5';
const FEMALE = 'Q6581072';
const COMPOSER = 'Q36834';
const MUSICAL_GROUP = 'Q215380';
const MUSICAL_WORK = 'Q105543609';
const ALBUM = 'Q482994';
// Státy, které patří k české hudbě (Česko, Československo, České království, Protektorát…)
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q1998866', 'Q1991965', 'Q853348', 'Q39193', 'Q43266']);
const THIS_YEAR = new Date().getFullYear();

// Hudební povolání (P106)
const MUSIC_OCCUPATIONS = ['Q36834', 'Q177220', 'Q639669', 'Q855091', 'Q2252262', 'Q488205', 'Q486748', 'Q158852', 'Q1259917', 'Q386854',
    'Q584301', 'Q15981151', 'Q2865819', 'Q765778', 'Q130857', 'Q1075651', 'Q12800682', 'Q12377274', 'Q13219637', 'Q753110', 'Q1327329', 'Q806349'];

const csArticle = (variable) => `?a schema:about ${variable} . ?a schema:isPartOf <https://cs.wikipedia.org/> . ${variable} wikibase:sitelinks ?sl .`;
const fromRows = (rows, key = 'x') => rows.map(row => [id(row[key].value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);

// --- 1. krok: kandidáti ---
const candidates = await cached('hudba-candidates-2', async () => {
    const people = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?o { ${values(MUSIC_OCCUPATIONS)} } ?x wdt:P106 ?o . ?x wdt:P31 wd:${HUMAN} . ${csArticle('?x')} FILTER(?sl >= 9) }`));
    // Česká stopa: občanství nebo narození v Česku – i méně známí
    const czechPeople = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?o { ${values(MUSIC_OCCUPATIONS)} } ?x wdt:P106 ?o . ?x wdt:P31 wd:${HUMAN} .
  { ?x wdt:P27 ?c . VALUES ?c { ${values([...CZECH_STATES])} } } UNION { ?x wdt:P19/wdt:P17 wd:Q213 } ${csArticle('?x')} FILTER(?sl >= 4) }`));
    const groups = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${MUSICAL_GROUP} . ${csArticle('?x')} FILTER(?sl >= 6) }`));
    const czechGroups = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${MUSICAL_GROUP} .
  { ?x wdt:P495 ?c } UNION { ?x wdt:P17 ?c } UNION { ?x wdt:P740/wdt:P17 ?c } VALUES ?c { ${values([...CZECH_STATES])} } ${csArticle('?x')} }`));
    const works = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${MUSICAL_WORK} . { ?x wdt:P86 [] } UNION { ?x wdt:P175 [] } ${csArticle('?x')} FILTER(?sl >= 6) }`));
    const albums = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${ALBUM} . ?x wdt:P175 [] . ${csArticle('?x')} FILTER(?sl >= 6) }`));
    return {
        people: [...new Map([...people.slice(0, 5500), ...czechPeople])].sort((a, b) => b[1] - a[1]),
        groups: [...new Map([...groups.slice(0, 2500), ...czechGroups])].sort((a, b) => b[1] - a[1]),
        works: works.slice(0, 3000),
        albums: albums.slice(0, 2500)
    };
});
// Opery, operety a muzikály: vlastní kategorie, proto i ty s málo jazykovými verzemi (české opery). Bez osob (skladatelé s žánrem opera
// by jinak zabrali většinu dotazu) a i „hudebně-dramatická díla“ bez žánru (Pomáda, My Fair Lady, Lví král)
const OPERA = 'Q1344';
const MUSICAL = 'Q2743';
const STAGE_WORK = 'Q58483083';
const stageQuery = (filter) => `SELECT DISTINCT ?x ?sl WHERE {
  { ?x wdt:P136/wdt:P279* wd:${OPERA} } UNION { ?x wdt:P31/wdt:P279* wd:${OPERA} } UNION { ?x wdt:P136 wd:${MUSICAL} } UNION { ?x wdt:P31 wd:${MUSICAL} } UNION { ?x wdt:P31 wd:${STAGE_WORK} }
  FILTER NOT EXISTS { ?x wdt:P31 wd:${HUMAN} }
  ${filter} ${csArticle('?x')} }`;
const stageCandidates = await cached('hudba-opery-candidates-2', async () => {
    const all = fromRows(await qlever(stageQuery('FILTER(?sl >= 3)')));
    // České opery, operety a muzikály i jen s českým článkem (Dimitrij, Hubička, Krysař)
    const czech = fromRows(await qlever(stageQuery(`{ ?x wdt:P86/wdt:P27 ?c . VALUES ?c { ${values([...CZECH_STATES])} } } UNION { ?x wdt:P495 ?c2 . VALUES ?c2 { ${values([...CZECH_STATES])} } } UNION { ?x wdt:P407 wd:Q9056 }`)));
    return [...new Map([...all, ...czech])].sort((a, b) => b[1] - a[1]);
});
// Slovenská hudba: hudebníci a kapely se slovenským občanstvím, narozením či původem (obecný dotaz bere jen od 9 jazykových verzí)
const SLOVAKIA = 'Q214';
const slovakCandidates = await cached('hudba-candidates-sk', async () => ({
    people: fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?o { ${values(MUSIC_OCCUPATIONS)} } ?x wdt:P106 ?o . ?x wdt:P31 wd:${HUMAN} .
  { ?x wdt:P27 wd:${SLOVAKIA} } UNION { ?x wdt:P19/wdt:P17 wd:${SLOVAKIA} } ${csArticle('?x')} FILTER(?sl >= 4) }`)),
    groups: fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:${MUSICAL_GROUP} .
  { ?x wdt:P495 wd:${SLOVAKIA} } UNION { ?x wdt:P17 wd:${SLOVAKIA} } UNION { ?x wdt:P740/wdt:P17 wd:${SLOVAKIA} } ${csArticle('?x')} }`))
}));
candidates.people = [...new Map([...candidates.people, ...slovakCandidates.people])].sort((a, b) => b[1] - a[1]);
candidates.groups = [...new Map([...candidates.groups, ...slovakCandidates.groups])].sort((a, b) => b[1] - a[1]);
const workCandidates = [...new Map([...candidates.works, ...stageCandidates])].sort((a, b) => b[1] - a[1]);
console.log(`Kandidáti: ${candidates.people.length} osob, ${candidates.groups.length} skupin, ${candidates.works.length} skladeb, ${stageCandidates.length} oper a muzikálů, ${candidates.albums.length} alb`);
// Účastníci Eurovize a jejich písně: počet jazykových verzí jim soutěž nafoukne (Alexander Rybak, Ruslana) – pro úrovně se tlumí
const EUROVISION = 'Q276';
const eurovision = new Set(await cached('hudba-eurovize', async () => (await qlever(`SELECT DISTINCT ?x WHERE {
  { ?x wdt:P1344 ?e } UNION { ?song wdt:P1344 ?e . ?song wdt:P175 ?x } ?e wdt:P179 wd:${EUROVISION} . ?a schema:about ?x . ?a schema:isPartOf <https://cs.wikipedia.org/> }`)).map(row => id(row.x.value))));

// --- 2. krok: podrobnosti po dávkách ---
const SINGLE = { t: 1, n: 1, d: 1, den: 1, im: 1, born: 1, died: 1, sex: 1 };
const PROPERTIES = {
    born: 'P569', died: 'P570', sex: 'P21', cit: 'P27', occ: 'P106', genre: 'P136', mov: 'P135', from: 'P571', to: 'P576',
    wfrom: 'P2031', wto: 'P2032', origin: 'P495', country: 'P17', formed: 'P740', members: 'P527', memberOf: 'P463', notable: 'P800',
    composer: 'P86', performer: 'P175', lyrics: 'P676', libretto: 'P87', pub: 'P577', premiere: 'P1191', lang: 'P407', type: 'P31',
    partOf: 'P361', award: 'P166'
};
const allIds = [...new Set([...Object.values(candidates).flat(), ...stageCandidates].map(([q]) => q))];
// Podrobnosti po dávkách se dají číst i z query.wikidata.org (WIKIDATA_ENDPOINT=wdqs), když je QLever přetížený
const detailsRun = process.env.WIKIDATA_ENDPOINT === 'wdqs' ? sparql : qlever;
const fetchDetails = async (list) => {
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
    }, detailsRun);
    return result;
};
const details = new Map(await cached('hudba-details', async () => [...await fetchDetails(allIds)]));
const missingDetails = allIds.filter(qid => !details.has(qid));
if (missingDetails.length) {
    for (const [qid, detail] of await fetchDetails(missingDetails)) details.set(qid, detail);
    // Dostažené podrobnosti se doplní do mezipaměti, ať se při dalším ladění nestahují znovu
    if (process.env.BUILD_CACHE) writeFileSync(`${process.env.BUILD_CACHE}/hudba-details.json`, JSON.stringify([...details]));
}

// České a anglické názvy odkazovaných položek (žánry, nástroje, země, typy, autoři, členové)
const REFERENCED_KEYS = ['cit', 'occ', 'genre', 'mov', 'origin', 'country', 'formed', 'members', 'memberOf', 'notable', 'composer',
    'performer', 'lyrics', 'libretto', 'lang', 'type', 'partOf', 'bornIn'];
const referenced = [...new Set([...details.values()].flatMap(detail => REFERENCED_KEYS.flatMap(key => detail[key] || [])))].filter(q => /^Q\d+$/.test(q));
const fetchLabels = async (list) => {
    const result = [];
    await inBatches(list, 400, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]), detailsRun);
    return result;
};
const labels = new Map(await cached('hudba-labels-2', () => fetchLabels(referenced)));
// Názvy odkazovaných položek, které přibyly s operami (skladatelé, libretisté)
const missingOpera = referenced.filter(qid => !labels.has(`cs:${qid}`) && !labels.has(`en:${qid}`));
if (missingOpera.length) for (const [key, value] of await cached('hudba-labels-opery', () => fetchLabels(missingOpera))) labels.set(key, value);
// …a s dalšími kandidáty (slovenská hudba, české opery): mezipaměť podle seznamu chybějících
const missingLabels = referenced.filter(qid => !labels.has(`cs:${qid}`) && !labels.has(`en:${qid}`)).sort();
const labelsKey = createHash('sha1').update(missingLabels.join(',')).digest('hex').slice(0, 10);
if (missingLabels.length) for (const [key, value] of await cached(`hudba-labels-more-${labelsKey}`, () => fetchLabels(missingLabels))) labels.set(key, value);
const cs = (qid) => labels.get(`cs:${qid}`);
const en = (qid) => labels.get(`en:${qid}`) || '';

console.log(`Podrobnosti: ${details.size}, názvy: ${labels.size}`);

// --- 3. krok: pravidla pro osoby, kapely a díla ---
const countries = readCountries();
const yearsOf = (list) => (list || []).map(yearOf).filter(year => year !== undefined && year <= THIS_YEAR);
const minYear = (list) => yearsOf(list).length ? Math.min(...yearsOf(list)) : undefined;

// Země podle popisu na české Wikipedii („německý skladatel“ → Německo); jinak podle občanství či původu
const NATIONALITIES = [
    ['československ', 'Československo'], ['česk', 'Česko'], ['moravsk', 'Česko'], ['slovensk', 'Slovensko'], ['rakousko-uhersk', 'Rakousko-Uhersko'],
    ['německ', 'Německo'], ['rakousk', 'Rakousko'], ['americk', 'Spojené státy americké'], ['britsk', 'Spojené království'], ['anglick', 'Spojené království'],
    ['skotsk', 'Spojené království'], ['velšsk', 'Spojené království'], ['severoirsk', 'Spojené království'], ['irsk', 'Irsko'], ['francouzsk', 'Francie'],
    ['italsk', 'Itálie'], ['španělsk', 'Španělsko'], ['katalánsk', 'Španělsko'], ['portugalsk', 'Portugalsko'], ['sovětsk', 'Sovětský svaz'], ['rusk', 'Rusko'],
    ['polsk', 'Polsko'], ['maďarsk', 'Maďarsko'], ['uhersk', 'Maďarsko'], ['norsk', 'Norsko'], ['švédsk', 'Švédsko'], ['finsk', 'Finsko'], ['dánsk', 'Dánsko'],
    ['islandsk', 'Island'], ['nizozemsk', 'Nizozemsko'], ['holandsk', 'Nizozemsko'], ['belgick', 'Belgie'], ['vlámsk', 'Belgie'], ['švýcarsk', 'Švýcarsko'],
    ['kanadsk', 'Kanada'], ['australsk', 'Austrálie'], ['novozélandsk', 'Nový Zéland'], ['japonsk', 'Japonsko'], ['čínsk', 'Čína'], ['jihokorejsk', 'Jižní Korea'],
    ['korejsk', 'Jižní Korea'], ['indick', 'Indie'], ['bengálsk', 'Indie'], ['brazilsk', 'Brazílie'], ['argentinsk', 'Argentina'], ['mexick', 'Mexiko'],
    ['kubánsk', 'Kuba'], ['jamajsk', 'Jamajka'], ['kolumbijsk', 'Kolumbie'], ['chilsk', 'Chile'], ['řeck', 'Řecko'], ['ukrajinsk', 'Ukrajina'],
    ['rumunsk', 'Rumunsko'], ['bulharsk', 'Bulharsko'], ['srbsk', 'Srbsko'], ['chorvatsk', 'Chorvatsko'], ['slovinsk', 'Slovinsko'], ['jugoslávsk', 'Jugoslávie'],
    ['izraelsk', 'Izrael'], ['tureck', 'Turecko'], ['litevsk', 'Litva'], ['lotyšsk', 'Lotyšsko'], ['estonsk', 'Estonsko'], ['běloru', 'Bělorusko'],
    ['gruzínsk', 'Gruzie'], ['arménsk', 'Arménie'], ['jihoafrick', 'Jihoafrická republika'], ['nigerijsk', 'Nigérie'], ['egyptsk', 'Egypt'],
    ['portorick', 'Portoriko'], ['barbadosk', 'Barbados'], ['venezuelsk', 'Venezuela'], ['peruánsk', 'Peru'], ['uruguaysk', 'Uruguay'], ['kypersk', 'Kypr']
];
const cleanText = (text) => (text || '').replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();
const nationalityOf = (description) => {
    const adjective = cleanText(description).toLowerCase().split(/[\s,;]+/).find(word => /(sk|ck)(ý|á|é)$/u.test(word));
    if (!adjective) return undefined;
    const found = NATIONALITIES.find(([stem]) => adjective.startsWith(stem));
    return found ? found[1] : undefined;
};
// Přídavné jméno země pro vytvořený popis (Spojené státy americké → americký)
const adjectiveOf = (land, ending) => {
    const found = land && NATIONALITIES.find(([, country]) => country === land);
    return found ? `${found[0]}${ending}` : undefined;
};
const countryName = (qid) => countries[qid] ? countries[qid].name : undefined;
// „Polsko-česká zpěvačka“ s českým občanstvím (Ewa Farna) patří k české hudbě
const landOf = (detail, ...keys) => (/^\p{L}+-česk/iu.test(cleanText(detail.d)) && (detail.cit || []).some(q => CZECH_STATES.has(q)) ? 'Česko' : undefined)
    || nationalityOf(detail.d) || keys.flatMap(key => detail[key] || []).map(countryName).find(Boolean);
const isCzechDetail = (detail, ...keys) => keys.some(key => (detail[key] || []).some(q => CZECH_STATES.has(q)))
    || /^(česk|českoslov|moravsk)/iu.test(cleanText(detail.d));

// Hlavní role z popisu: první podstatné jméno („americký jazzový trumpetista“ → trumpetista)
const ADJECTIVE = /^[\p{L}-]+(ý|á|é|í|ské|cké)$/u;
// Předložky, příslovce a žánry před rolí („později britský“, „country zpěvačka“)
const NOT_A_ROLE = /^(a|z|ze|v|ve|se|i|–|-|později|původně|raně|pozdně|též|také|country|pop|rock|folk|jazz|soul|punk|metal|rap|blues|gospel|reggae|disco|r&b|indie|heavy|hard|dance|world|\d.*)$/u;
const roleOf = (description) => cleanText(description).toLowerCase().split(/[\s,;]+/)
    .find(word => word && !ADJECTIVE.test(word) && !NOT_A_ROLE.test(word)) || '';
const COMPOSER_ROLE = /^(skladatel|komponist|dirigent|varhaník|varhanice|cembalist|kapelník|sbormistr|virtuos|virtuóz)/u;
const PERFORMER_ROLE = /^(zpěv|pěv|tenor|baryton|basist|sopr|mezzosopr|altistka|rapper|raper|písničkář|šansoni|hudebn|muzikant|kytarist|baskytarist|bubeník|bubenice|perkusionist|klávesist|klavírist|pianist|houslist|violist|violoncellist|kontrabasist|saxofonist|trumpetist|trombonist|flétnist|klarinetist|harfenist|hobojist|multiinstrumentalist|dj|diskžokej|frontman|cellist)/u;
const roleLabel = (role) => role === 'dj' ? 'DJ' : role === 'raper' ? 'rapper' : role === 'virtuóz' ? 'virtuos' : role;

// Žánrové skupiny (podle anglických názvů žánrů z Wikidat); pořadí rozhoduje při shodě
const GENRE_GROUPS = [
    ['metal', /metal/], ['punk', /punk/], ['hiphop', /hip hop|hip-hop|\brap\b|trap music|gangsta/], ['elektronicka', /electronic|house music|techno|trance|edm|drum and bass|dubstep|electro|ambient|eurodance/],
    ['jazz', /jazz|swing|bebop|big band|blues|ragtime/], ['rnb', /r&b|rhythm and blues|soul|funk|gospel|disco/], ['reggae', /reggae(?!ton)|\bska\b|dancehall/],
    ['folk', /folk|country|bluegrass|singer-songwriter|tramp/], ['rock', /rock|grunge|britpop|new wave|shoegaz|beat music|psychedeli/],
    ['pop', /pop|schlager|chanson|cabaret|easy listening|adult contemporary|latin|reggaeton/],
    ['klasika', /classical|opera|baroque|romantic|symphon|chamber music|film score|art music|sacred|choral|lied|ballet|minimal/]
];
// Rocková odnož jazzu, blues, folku a soulu (blues rock, jazz rock, folk rock, country rock) patří k rocku (Pražský výběr, Led Zeppelin)
const ROCK_BLEND = /\brock$/;
const ROCK_BLEND_GROUPS = new Set(['jazz', 'rnb', 'folk']);
const GENRE_LABELS = { metal: 'metal', punk: 'punk', hiphop: 'hip hop', elektronicka: 'elektronická hudba', jazz: 'jazz', rnb: 'R&B a soul', reggae: 'reggae', folk: 'folk', rock: 'rock', pop: 'pop', klasika: 'vážná hudba' };
// Žánr, který Wikidata uvádějí chybně (Michal David „jazz“)
const GENRE_OVERRIDES = { Q3506625: { group: 'pop', label: 'pop' } };
const genreGroupOf = (detail, qid) => {
    if (GENRE_OVERRIDES[qid]) return GENRE_OVERRIDES[qid];
    // Každý žánr se počítá, dřív uvedené ve Wikidatech o něco víc (u Michala Davida pop před jazzem)
    const names = (detail.genre || []).map(q => en(q).toLowerCase());
    let best = null;
    let bestCount = 0;
    for (const [group, pattern] of GENRE_GROUPS) {
        const count = names.reduce((sum, name, index) => sum + (name && pattern.test(name) && !(ROCK_BLEND_GROUPS.has(group) && ROCK_BLEND.test(name)) ? 1 + 1 / (index + 2) : 0), 0);
        if (count > bestCount) [best, bestCount] = [group, count];
    }
    if (!best) return null;
    const pattern = GENRE_GROUPS.find(([group]) => group === best)[1];
    const label = (detail.genre || []).filter(q => pattern.test(en(q).toLowerCase())).map(cs).find(text => text && text.length <= 25);
    return { group: best, label: label || GENRE_LABELS[best] };
};

// Hudební období skladatele z let tvorby (od 20 let do smrti) – jen když celá tvorba leží v jednom období
// a nic tomu neodporuje (směr ve Wikidatech, anglický popis „Baroque composer“)
const PERIOD_RANGES = [['renesance', 1400, 1600], ['baroko', 1600, 1750], ['klasicismus', 1750, 1820], ['romantismus', 1820, 1900], ['moderna', 1900, 2000]];
const PERIOD_HINTS = [['renesance', /renaissance/], ['baroko', /baroque/], ['klasicismus', /classical period|classicism|viennese classic/], ['romantismus', /romantic/],
    ['moderna', /20th-century|modernis|impressionis|expressionis|neoclassic|avant-garde|minimalis|serialis/]];
const hintedPeriods = (text) => PERIOD_HINTS.filter(([, pattern]) => pattern.test(text)).map(([hint]) => hint);
const periodHintsOf = (detail) => [...(detail.mov || []).flatMap(q => hintedPeriods(en(q).toLowerCase())), ...hintedPeriods((detail.den || '').toLowerCase())];
const periodFor = (detail, born, died) => {
    if (born === undefined || died === undefined) return undefined;
    const [start, end] = [born + 20, died];
    const fitting = PERIOD_RANGES.filter(([, from, to]) => start >= from - 5 && end <= to + 10 && end > from + 5);
    if (fitting.length !== 1) return undefined;
    const [key] = fitting[0];
    return periodHintsOf(detail).every(hint => hint === key) ? key : undefined;
};
// Okruhy období jsou mírnější než otázka na období: skladatel patří do období, kam spadá střed jeho tvorby (Beethoven – klasicismus,
// Telemann – baroko), nebo kam ho řadí směr či anglický popis; do dalšího období navíc, když v něm tvořil aspoň 40 % života a 15 let
// (Puccini, Janáček – romantismus i 20. století). U díla platí hlavní období skladatele.
const periodsFor = (detail, born, died) => {
    if (born === undefined) return [];
    const [start, end] = [born + 20, died ?? Math.min(THIS_YEAR, born + 85)];
    if (end <= start) return [];
    const ranges = PERIOD_RANGES.map(([key, from, to]) => [key, from, key === 'moderna' ? THIS_YEAR + 1 : to]);
    const overlap = ([, from, to]) => Math.max(0, Math.min(end, to) - Math.max(start, from));
    const mid = (start + end) / 2;
    const hints = [...new Set(periodHintsOf(detail))];
    const hinted = hints.length === 1 ? ranges.find(([key]) => key === hints[0]) : undefined;
    const primary = hinted && overlap(hinted) >= 5 ? hinted[0] : (ranges.find(([, from, to]) => mid >= from && mid < to) || [])[0];
    if (!primary) return [];
    const secondary = ranges.filter(range => range[0] !== primary && overlap(range) >= Math.max(15, 0.4 * (end - start))).map(([key]) => key);
    return [primary, ...secondary];
};

// Druh díla podle typu a žánru: opera, balet, muzikál, symfonie, píseň, album…
const WORK_KINDS = [
    ['album', /album|extended play/], ['opereta', /operetta/], ['muzikál', /^musical$|musical theatre|rock opera/], ['opera', /opera/], ['balet', /ballet/],
    ['symfonie', /^symphony$|^symphony |symphony no/], ['symfonická báseň', /symphonic poem|tone poem/], ['koncert', /concerto/], ['oratorium', /oratorio/],
    ['mše', /\bmass\b|requiem/], ['hymna', /anthem/], ['píseň', /song|single/]
];
const workKindOf = (detail) => {
    const names = [...(detail.type || []), ...(detail.genre || [])].map(q => en(q).toLowerCase());
    const found = WORK_KINDS.find(([, pattern]) => names.some(name => pattern.test(name)));
    return found ? found[0] : 'skladba';
};

// Název položky z názvu článku bez upřesnění v závorce (štítek bývá jen mezinárodní – The Beatles – nebo zpřeházený – B Cardi)
// Závorka, bez které by název nedával smysl („Vol. 3: (The Subliminal Verses)“), zůstává
const titleName = (title) => {
    const short = (title || '').replace(/\s*\([^)]*\)\s*$/u, '').trim();
    return /:$/u.test(short) ? (title || '').trim() : short;
};
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const nameOf = (qid) => {
    const detail = details.get(qid);
    const name = detail && (titleName(detail.t) || detail.n);
    return name ? capitalize(name) : cs(qid) || en(qid) || undefined;
};
const sitelinks = (qid) => (details.get(qid) || {}).sl || 0;

// Kontrola dat narození a úmrtí: úmrtí před narozením, budoucnost, žijící přes 100 let bez data úmrtí = neúplné údaje
const lifeYears = (detail) => {
    const born = yearOf(detail.born);
    const died = yearOf(detail.died);
    if (born === undefined || born > THIS_YEAR - 12) return null;
    if (died !== undefined && (died <= born || died > THIS_YEAR || died - born > 105)) return null;
    if (died === undefined && born < THIS_YEAR - 100) return null;
    return { born, died };
};

// Česká jména, která zná skoro každý – vezmou se vždy a jsou „známá“ (Wikidata mezi českými řadí podle počtu jazykových verzí,
// kde vedou účastníci Eurovize a metalové kapely)
const CZECH_KNOWN = new Set(['Bedřich Smetana', 'Antonín Dvořák', 'Leoš Janáček', 'Bohuslav Martinů', 'Josef Mysliveček', 'Josef Suk', 'Josef Suk starší', 'Zdeněk Fibich', 'Gustav Mahler',
    'Jaroslav Ježek', 'Karel Svoboda', 'Jan Dismas Zelenka', 'Karel Gott', 'Helena Vondráčková', 'Marta Kubišová', 'Hana Zagorová', 'Lucie Bílá', 'Waldemar Matuška',
    'Karel Kryl', 'Jaromír Nohavica', 'Václav Neckář', 'Iveta Bartošová', 'Ewa Farna', 'Michal David', 'Petr Janda', 'Michal Tučný', 'Pavel Bobek', 'Eva Pilarová',
    'Hana Hegerová', 'Ema Destinnová', 'Magdalena Kožená', 'Ivan Mládek', 'Jiří Schelinger', 'Olympic', 'Kabát', 'Lucie', 'Chinaski', 'Čechomor',
    'The Plastic People of the Universe', 'Katapult', 'Pražský výběr', 'Kryštof', 'Mňága a Žďorp', 'Buty', 'Tři sestry', 'Divokej Bill', 'Wanastowi Vjecy',
    'Má vlast', 'Prodaná nevěsta', 'Rusalka', 'Symfonie „Z Nového světa“', 'Kde domov můj', 'Slovanské tance', 'Její pastorkyňa', 'Modlitba pro Martu',
    'Jožin z bažin', 'Škoda lásky']);
// Mezinárodně slavní podle počtu jazykových verzí, které ale český hráč většinou nezná (boti, Eurovize, asijský pop)
const NOT_KNOWN = new Set(['Basshunter', 'Valerij Jakovlevič Leonťjev', 'Anggun', 'Agnez Mo', 'Hebe Camargová', 'Umm Kulthum', 'Lila Downs', 'Lordi', 'Twice',
    'EXO', 'Girls\' Generation', 'Momoiro Clover Z', 'Kara', 'Wanna One', 'Red Velvet', 'BigBang', 'AKB48', 'Buranovské babičky', 'Clannad', 'Lacuna Coil',
    'Stefanija Turkevyč-Lukijanovyč', 'Ičiró Mizuki', 'Alla Borisovna Pugačovová', 'Anna Netrebko', 'James Peace', 'Rafael Orozco Maestre', 'Selena', 'Jolin Tsai',
    'Lata Mangeškar', 'Miriam Makeba', 'Zendaya', 'Natalia Oreiro', 'Joakim Brodén', 'Filip Bandžak', 'Paramore', 'Victoria Beckham', 'Weird Al Yankovic', 'R. Kelly', 'Nelly Furtado', 'Ravi Šankar', 'Vladimir Vysockij',
    'Pussycat Dolls', 'Jonas Brothers', 'Sum 41', 'OneRepublic', 'Avenged Sevenfold', 'Alice in Chains', 'Evanescence', 'Soundgarden', 'Alla Pugačova',
    'Peter Machajdík', 'Valerij Leonťjev', 'Agnes Monica', 'Siti Nurhaliza', 'Twiins', 'Adonxs', 'Adéla', 'Patricia Janečková', 'Miro Šmajda', 'Varg Vikernes',
    // Dvořákova první opera (hraná až po jeho smrti) – sláva autora by z ní udělala známou
    'Alfred']);
// Díla, která zná skoro každý (u děl počet jazykových verzí nic neříká – vedou alba Lordi a písně z Eurovize)
const KNOWN_WORKS = new Set(['Kouzelná flétna', 'Don Giovanni', 'Figarova svatba', 'Carmen', 'La traviata', 'Aida', 'Nabucco', 'Rigoletto', 'Madam Butterfly',
    'Tosca', 'Turandot', 'Bohéma', 'Labutí jezero', 'Louskáček', 'Šípková Růženka', 'Čtvero ročních dob', 'Symfonie č. 9 d moll', 'Symfonie č. 5 „Osudová“',
    'Sonáta „Měsíční svit“', 'Pro Elišku', 'Malá noční hudba', 'Requiem', 'Mesiáš', 'Bolero', 'Na krásném modrém Dunaji', 'Prsten Nibelungův',
    'Lazebník sevillský', 'Carmina Burana', 'Svěcení jara', 'Rapsodie v modrém', 'West Side Story', 'Fantom opery', 'Jesus Christ Superstar', 'Kočky',
    'Bídníci', 'Mamma Mia!', 'Tichá noc', 'Braniborské koncerty', 'Peer Gynt', 'Šeherezáda', 'Obrázky z výstavy', 'Karneval zvířat', 'Planety',
    'Fantastická symfonie', 'Uherské tance', 'Netopýr', 'Veselá vdova', 'Radeckého pochod', 'Kánon D dur', 'Tokáta a fuga d moll',
    'Thriller', 'Abbey Road', "Sgt. Pepper's Lonely Hearts Club Band", 'The Dark Side of the Moon', 'The Wall', 'Nevermind', 'Back in Black', 'Rumours',
    'Bohemian Rhapsody', 'Imagine', 'Yesterday', 'Hey Jude', 'Let It Be', 'Hotel California', 'Stairway to Heaven', 'Smells Like Teen Spirit',
    'We Will Rock You', 'We Are the Champions', 'Billie Jean', 'Like a Rolling Stone', 'Waterloo', 'Dancing Queen', 'Wind of Change', 'Smoke on the Water',
    "(I Can't Get No) Satisfaction", 'Another Brick in the Wall', 'My Heart Will Go On', 'Let It Go', 'Gangnam Style', 'Despacito', 'Bad Romance',
    'Shape of You', 'Purple Rain', 'Like a Prayer', 'Internacionála', 'Happy Birthday to You', 'Jingle Bells', 'Over the Rainbow', 'What a Wonderful World',
    'My Way', 'Kaťuša', 'Hallelujah']);
// Další slavná alba, písně, opery, baletní a orchestrální díla a muzikály (vzali se jen ti, kteří mezi kandidáty jsou)
const MORE_KNOWN_WORKS = ['Wish You Were Here', 'A Night at the Opera', 'Led Zeppelin IV', 'Bad', 'Off the Wall', 'Revolver', 'Rubber Soul', 'Help!',
    'Let It Be', 'Born to Run', 'Born in the U.S.A.', 'Appetite for Destruction', 'Highway to Hell', 'Paranoid', 'Machine Head', 'The Joshua Tree', 'Achtung Baby',
    'OK Computer', 'Kid A', 'Dookie', 'American Idiot', 'Californication', 'Brothers in Arms', 'Tapestry', 'Pet Sounds', 'Purple Rain', 'Like a Virgin', 'Ray of Light',
    'Master of Puppets', 'Kill \'Em All', 'Hybrid Theory', 'Meteora', 'Back to Black', '21', '25', '1989', 'Lemonade', 'Random Access Memories', 'Discovery',
    'The Marshall Mathers LP', 'Illmatic', 'Kind of Blue', 'Sticky Fingers', 'Exile on Main St.', 'Tommy', 'Quadrophenia', 'Tubular Bells', 'Bat Out of Hell',
    'A Kind of Magic', 'News of the World', 'Innuendo', 'Definitely Maybe', "(What's the Story) Morning Glory?", 'The Bends', 'In Utero', 'Animals',
    'Hey Jude', 'Come Together', 'Here Comes the Sun', 'Eleanor Rigby', 'Penny Lane', 'Strawberry Fields Forever', 'Yellow Submarine', 'All You Need Is Love', 'Get Back',
    'Twist and Shout', 'Paint It Black', 'Sympathy for the Devil', 'Start Me Up', 'Wonderwall', "Don't Look Back in Anger", 'Creep', 'Karma Police', 'Losing My Religion',
    'With or Without You', 'One', 'Sultans of Swing', 'Every Breath You Take', 'Roxanne', "Don't Stop Believin'", "Sweet Child o' Mine", 'Welcome to the Jungle', 'November Rain',
    "Knockin' on Heaven's Door", 'Thunderstruck', 'Enter Sandman', 'Nothing Else Matters', 'Seven Nation Army', 'Come as You Are', 'Respect', 'I Will Always Love You',
    'Rolling in the Deep', 'Someone Like You', 'Skyfall', 'Uptown Funk', 'Happy', 'Blinding Lights', 'Poker Face', 'Just Dance', 'Born This Way', 'Vogue', 'Material Girl',
    'Hung Up', 'Toxic', 'Wannabe', 'Wake Me Up Before You Go-Go', 'Last Christmas', 'Careless Whisper', 'Take on Me', 'Africa', 'Girls Just Want to Have Fun', 'Time After Time',
    'Total Eclipse of the Heart', "Livin' on a Prayer", 'Smooth Criminal', 'Beat It', 'Black or White', 'Man in the Mirror', "Stayin' Alive", 'Mamma Mia',
    'Money, Money, Money', 'The Winner Takes It All', 'Fernando', 'Chiquitita', 'Whole Lotta Love', 'Kashmir', 'Comfortably Numb', 'Money', 'Another One Bites the Dust',
    "Don't Stop Me Now", 'Killer Queen', 'Somebody to Love', 'I Want to Break Free', 'Radio Ga Ga', 'Under Pressure', 'The Show Must Go On', 'Crazy in Love', 'Single Ladies',
    'Umbrella', 'Halo', 'Evžen Oněgin', 'Pikovaná dáma', 'Boris Godunov', 'Parsifal', 'Tristan a Isolda', 'Lohengrin', 'Tannhäuser', 'Valkýra', 'Rusalka', 'Dalibor', 'Libuše',
    'Čert a Káča', 'Così fan tutte', 'Čarostřelec', 'Trubadúr', 'Otello', 'Falstaff', 'Don Carlos', 'Hoffmannovy povídky',
    'Cavalleria rusticana', 'Komedianti', 'Gianni Schicchi', 'Manon Lescaut', 'Jupiterská symfonie', 'Árie na struně G', 'Gymnopédie', 'Clair de lune', 'Sen noci svatojánské',
    'Orfeus v podsvětí', 'Zlatý věk', 'Romeo a Julie', 'Spartakus', 'Chicago', 'Cabaret', 'Hair', 'Pomáda', 'Evita', 'Starci na chmelu',
    'Lví král', 'Za zvuků hudby', 'My Fair Lady', 'Hello, Dolly!', 'Oliver!', 'Notre-Dame de Paris', 'Lady Carneval', 'Hlídač krav', 'Vlak do Prahy'];
for (const name of MORE_KNOWN_WORKS) KNOWN_WORKS.add(name);
// Další známé opery a muzikály (názvy tak, jak je mají data: Vlasy, Kabaret, Piková dáma)
for (const name of ['Vlasy', 'Kabaret', 'Piková dáma', 'Fidelio', 'Faust', 'Šumař na střeše', 'Jakobín', 'Hubička', 'Káťa Kabanová', 'Příhody lišky Bystroušky',
    'Dracula', 'Krysař', 'Porgy a Bess', 'Norma', 'Salome', 'Žebrácká opera', 'Kníže Igor', 'Vilém Tell', 'Lucie z Lammermooru', 'Orfeus a Eurydika',
    'Čarodějka', 'Hamilton', 'Rent', 'Oklahoma!', 'Lví král', 'Kráska a zvíře', 'Mary Poppins', 'Hamlet', 'Johanka z Arku', 'Monte Cristo']) KNOWN_WORKS.add(name);
// Další česká a slovenská jména, která zná skoro každý
for (const name of ['Petra Černocká', 'Daniel Landa', 'Elán', 'Richard Müller', 'Jiří Suchý', 'Jiří Šlitr', 'Spirituál kvintet', 'Věra Špinarová', 'Vladimír Mišík',
    'Ivan Hlas', 'Lenka Dusilová', 'Aneta Langerová', 'Richard Krajčo', 'Janek Ledecký', 'Karel Plíhal', 'Jaroslav Uhlíř', 'Felix Slováček', 'Daniel Hůlka',
    'Support Lesbiens', 'Lucie Vondráčková', 'Dan Bárta', 'Vlasta Redl', 'Pavel Žalman Lohonka', 'Cargo', 'Bijou', 'Kamil Střihavka', 'Marek Ztracený', 'Tomáš Klus',
    'Xindl X', 'Ewa Farna', 'Vojtěch Dyk', 'Monika Absolonová', 'Miro Žbirka', 'Miroslav Žbirka', 'Marika Gombitová', 'Karel Hašler',
    'Pavol Habera', 'Jana Kirschner']) CZECH_KNOWN.add(name);
// Herci a spisovatelé, které Wikidata vedou i jako hudebníky (Max Brod patří do literatury)
const EXCLUDED = new Set(['Max Brod', 'Keanu Reeves']);

// --- Osoby: skladatelé a hudebníci ---
const INSTRUMENTALIST = /^(klavírist|pianist|houslist|violist|violoncellist|cellist|kontrabasist|harfenist|hobojist|flétnist|klarinetist|varhan)/u;
// Herci, sportovci a politici s hudební kariérou navíc (Bill Clinton) se vyloučí rolí z popisu
const people = [];
for (const [qid] of candidates.people) {
    const detail = details.get(qid);
    if (!detail || !detail.t || !detail.d) continue;
    const name = nameOf(qid);
    if (EXCLUDED.has(name)) continue;
    const role = roleOf(detail.d).split('-')[0];
    // Skladatel musí skládat i podle popisu (dirigent Karajan ne)
    let category = COMPOSER_ROLE.test(role) && /skladatel|komponist/u.test(detail.d) ? 'skladatele'
        : PERFORMER_ROLE.test(role) || CZECH_KNOWN.has(name) ? 'hudebnici' : null;
    if (!category) continue;
    const life = lifeYears(detail);
    if (!life) continue;
    const genre = genreGroupOf(detail, qid);
    const isComposer = (detail.occ || []).includes(COMPOSER) && /skladatel/u.test(detail.d);
    // Skladatel populární hudby po roce 1925 patří mezi hudebníky, virtuos starších dob, který skládal, mezi skladatele
    if (category === 'skladatele' && life.born >= 1925 && genre && genre.group !== 'klasika') category = 'hudebnici';
    if (category === 'hudebnici' && life.born < 1880 && isComposer && !CZECH_KNOWN.has(name)) category = 'skladatele';
    const female = detail.sex === FEMALE;
    const operatic = /operní|opern/u.test(detail.d) || (detail.occ || []).includes('Q2865819');
    // Interpreti vážné hudby (houslisté, hobojisté 18. století, kritici) do „Hudebníků a zpěváků“ nepatří, kromě operních pěvců a slavných
    const classical = (genre && genre.group === 'klasika') || (life.born < 1920 && INSTRUMENTALIST.test(role) && !(genre && genre.group !== 'klasika'));
    if (category === 'hudebnici' && !operatic && !CZECH_KNOWN.has(name) && ((classical && (detail.sl || 0) < 40) || life.born < 1880)) continue;
    people.push({
        qid, detail, name, category, life, genre: operatic ? { group: 'klasika', label: 'opera' } : classical && !genre ? { group: 'klasika', label: 'vážná hudba' } : genre,
        start: minYear(detail.wfrom) ?? life.born + 20,
        ty: category === 'skladatele' ? (female ? 'skladatelka' : 'skladatel')
            : /^pěv|^tenor|^sopr|^baryton/u.test(role) || (operatic && !PERFORMER_ROLE.test(role)) ? (female ? 'operní pěvkyně' : 'operní pěvec')
                : PERFORMER_ROLE.test(role) ? roleLabel(role) : (female ? 'zpěvačka' : 'zpěvák')
    });
}

// --- Kapely ---
const BAND_WORDS = /skupin|kapel|duo|trio|kvartet|kvintet|uskupení|projekt|band/iu;
const NOT_BAND = /orchestr|divadl|sbor|filharmoni|smyčcov|komorní|ansámbl|soubor/iu;
const bandTypeOf = (description) => {
    const words = cleanText(description).split(/\s+/);
    // Bez národnosti („britská rocková skupina“ → „rocková skupina“), jen krátký popis až po podstatné jméno
    while (words.length && /(sk|ck)(á|é|ý)$/u.test(words[0]) && nationalityOf(words[0])) words.shift();
    const end = words.findIndex(word => /^(skupina|kapela|duo|trio|kvartet|kvintet)$/iu.test(word));
    const type = end >= 0 && end <= 2 ? words.slice(0, end + 1).join(' ') : '';
    return type && type.length <= 30 ? type.charAt(0).toLowerCase() + type.slice(1) : 'hudební skupina';
};
const bands = [];
for (const [qid] of candidates.groups) {
    const detail = details.get(qid);
    if (!detail || !detail.t) continue;
    const description = detail.d || detail.den || '';
    if (!BAND_WORDS.test(description) || NOT_BAND.test(description)) continue;
    // Rok rozpadu ve Wikidatech bývá až po pozdějším obnovení (The Doors „2013“) – bereme jen rok založení
    const from = minYear([...(detail.from || []), ...(detail.wfrom || [])]);
    if (from === undefined) continue;
    bands.push({ qid, detail, name: nameOf(qid), category: 'kapely', from, start: from, genre: genreGroupOf(detail, qid), ty: bandTypeOf(detail.d || '') });
}

// --- Díla: skladby, písně a alba ---
// Slavná číslovaná díla pod známějším názvem (jinak by „Symfonie č. 9“ byla nejednoznačná) a další přijímané názvy
const NICKNAMES = {
    'Symfonie č. 9 (Beethoven)': ['Symfonie č. 9 d moll', ['Devátá symfonie', 'Óda na radost']],
    'Symfonie č. 5 (Beethoven)': ['Symfonie č. 5 „Osudová“', ['Osudová', 'Osudová symfonie']],
    'Symfonie č. 3 (Beethoven)': ['Symfonie č. 3 „Eroica“', ['Eroica']],
    'Symfonie č. 6 (Beethoven)': ['Symfonie č. 6 „Pastorální“', ['Pastorální symfonie']],
    'Klavírní sonáta č. 14 (Beethoven)': ['Sonáta „Měsíční svit“', ['Měsíční svit', 'Měsíční sonáta']],
    'Symfonie č. 9 (Dvořák)': ['Symfonie „Z Nového světa“', ['Z Nového světa', 'Novosvětská', 'Novosvětská symfonie']],
    'Symfonie č. 8 (Schubert)': ['Symfonie „Nedokončená“', ['Nedokončená', 'Nedokončená symfonie']],
    'Symfonie č. 6 (Čajkovskij)': ['Symfonie „Patetická“', ['Patetická']]
};
const NUMBERED = /^(\d+\.\s*)?(symfonie|klavírní sonáta|sonáta|koncert|klavírní koncert|houslový koncert|violoncellový koncert|smyčcový kvartet|kvartet|serenáda|suita)\b.*\d/iu;
// Druh díla podle českého popisu („opera Antonína Dvořáka“), jinak podle typu a žánru ve Wikidatech
const DESCRIBED_KINDS = [['opereta', /operet/u], ['muzikál', /muzikál|rockov(á|ou) oper/u], ['opera', /(?<!\p{L})oper(a|y)(?!\p{L})|operní/u], ['balet', /balet/u],
    ['symfonie', /symfonie(?! č)/u], ['symfonická báseň', /symfonick(á|ou) báseň/u], ['oratorium', /oratori/u], ['píseň', /píseň|písní|singl|song/u],
    ['album', /album/u], ['koncert', /koncert/u]];
// Díla, která do hudby nepatří (film, divadelní hra) nebo jsou z Eurovize, kde je autor neznámý
const NOT_MUSIC_WORK = /videohr|eurovi|modlitb|mariánsk|antifon|liturgi/iu;
// Film, seriál a divadelní hra hudebním dílem nejsou – kromě muzikálu „na motivy filmu“ a písně z filmu
const NOT_MUSIC_UNLESS = /film|seriál|divadelní hra/iu;
const MUSIC_WORD = /muzikál|oper|balet|píseň|písní|singl|song|soundtrack|album/iu;
// Díla bez skladatele ve Wikidatech, autor podle popisu (Krysař – „český muzikál Daniela Landy“)
const WORK_AUTHORS = { Q12031670: 'Q159250' };
const NO_AUTHOR = /^(traditional|anonym|lidová|lidové|Panna Maria|DP)$/iu;
const albumIds = new Set(candidates.albums.map(([q]) => q));
const workCandidateIds = new Set([...workCandidates, ...candidates.albums].map(([q]) => q));
// Jevištní díla s vlastní kategorií Opery a muzikály (balet zůstává mezi díly)
// Rok premiéry, který Wikidata nemají (Tanz der Vampire, Vídeň 1997)
const WORK_YEARS = { Q232134: 1874, Q1074321: 1997 };
const STAGE_KINDS = new Set(['opera', 'opereta', 'muzikál']);
const STAGE_KINDS_EN = [['opereta', /operetta|op[eé]ra bouff/i], ['muzikál', /musical/i], ['opera', /\bop[eé]ra\b/i], ['balet', /ballet/i]];
const generalWorkIds = new Set(candidates.works.map(([q]) => q));
const works = [];
for (const [qid] of [...workCandidates, ...candidates.albums]) {
    const detail = details.get(qid);
    if (!detail || !detail.t || NOT_MUSIC_WORK.test(detail.d || '') || (NOT_MUSIC_UNLESS.test(detail.d || '') && !MUSIC_WORD.test(detail.d || ''))) continue;
    const typed = workKindOf(detail);
    // Druh z popisu, jinak z upřesnění v názvu článku („Johanka z Arku (muzikál)“)
    const described = (DESCRIBED_KINDS.find(([, pattern]) => pattern.test(detail.d || '')) || [])[0]
        || (STAGE_KINDS_EN.find(([kind]) => new RegExp(`\\(${kind}`, 'u').test(detail.t)) || [])[0];
    const performers = detail.performer || [];
    let composers = WORK_AUTHORS[qid] ? [WORK_AUTHORS[qid]] : detail.composer || [];
    // Víc skladatelů ve Wikidatech, ale popis uvádí jen jednoho („opera Bedřicha Smetany“, „musical by Czech composer Karel Svoboda“; další je
    // třeba textař, chybný zápis nebo orchestrátor): platí ten z popisu
    if (composers.length >= 2) {
        const text = `${detail.d || ''} ${detail.den || ''}`.toLowerCase();
        const named = composers.filter(composer => { const last = (nameOf(composer) || '').split(' ').pop(); return last.length >= 5 && text.includes(last.slice(0, -2).toLowerCase()); });
        if (named.length === 1) composers = named;
    }
    const pub = minYear(detail.pub);
    const premiere = minYear(detail.premiere);
    const inception = minYear(detail.from);
    let kind = albumIds.has(qid) ? 'album' : typed === 'hymna' ? 'hymna' : described || typed;
    // „Hudebně-dramatické dílo“ bez žánru (Pomáda, My Fair Lady): druh z anglického popisu; když ho nemá, zůstane skladbou jen dílo z obecného
    // dotazu na skladby (z dotazu na jevištní díla by „skladba“ nebyla pravda)
    if (kind === 'skladba' && (detail.type || []).includes(STAGE_WORK)) {
        kind = (STAGE_KINDS_EN.find(([, pattern]) => pattern.test(detail.den || '')) || [])[0];
        if (!kind && !generalWorkIds.has(qid)) continue;
        kind ||= 'skladba';
    }
    // Píseň či árie z muzikálu nebo opery („píseň z muzikálu Evita“, článek „What If (píseň…)“) je píseň, ne muzikál
    if (STAGE_KINDS.has(kind) && (/(?<!\p{L})(píseň|písní|árie|song|singl|duet|sbor)(?!\p{L})/iu.test(detail.d || '') || /\((píseň|árie|singl)/iu.test(detail.t))) kind = 'píseň';
    // Osoba (dirigent u opery) jevištním dílem není
    if ((detail.type || []).includes(HUMAN)) continue;
    // Píseň populární hudby bývá jen „hudební dílo“ – pozná se podle interpreta
    if (kind === 'skladba' && performers.length && (pub || inception || 0) >= 1940) kind = 'píseň';
    const nickname = NICKNAMES[detail.t];
    let name = nickname ? nickname[0] : nameOf(qid);
    // Hymny jen česká (ostatní patří spíš k vlajkám a státům)
    const czechAnthem = kind === 'hymna' && /^Česká hymna$/u.test(detail.t);
    if (czechAnthem) name = 'Kde domov můj';
    if ((kind === 'hymna' && !czechAnthem) || (!nickname && NUMBERED.test(name))) continue;
    // Autor: u alba a písně interpret (jediný), u skladby skladatel (jediný)
    let author = null;
    let source = 'skladba';
    if ((kind === 'album' || kind === 'píseň') && performers.length === 1) [author, source] = [performers[0], kind === 'album' ? 'album' : 'pisen'];
    else if (kind !== 'album' && composers.length === 1 && (kind !== 'píseň' || performers.length === 0)) author = composers[0];
    const authorNames = (author ? [author] : composers.length ? composers : performers).map(nameOf).filter(Boolean);
    if (!authorNames.length || authorNames.length > 2 || authorNames.some(other => NO_AUTHOR.test(other))) continue;
    // Rok: u jevištních děl premiéra, jinak vznik či vydání (vznik zaokrouhlený na půlstoletí jen bez jiného údaje)
    // Chybný rok premiéry ve Wikidatech (Dvě vdovy: 1784 místo 1874)
    const year = WORK_YEARS[qid] ?? premiere ?? (inception !== undefined && !(inception % 50 === 0 && pub !== undefined) ? Math.min(inception, pub ?? inception) : pub);
    // Opera či muzikál bez roku premiéry by v otázce neměly z čeho napovědět; bez českého popisu dostanou popis ze země a roku („americký muzikál z roku 1956“)
    if (STAGE_KINDS.has(kind) && (year === undefined || !/\p{L}{3}/u.test(name))) continue;
    let desc;
    if (STAGE_KINDS.has(kind) && !detail.d) {
        // Země jen podle původu díla – podle autora by to bylo nejisté (Loewe, rodák z Berlína, psal americké muzikály)
        const adjective = adjectiveOf((detail.origin || []).map(countryName).find(Boolean), kind === 'muzikál' ? 'ý' : 'á');
        desc = `${adjective ? `${adjective} ` : ''}${kind} z roku ${year}`;
    }
    works.push({ qid, detail, desc, category: STAGE_KINDS.has(kind) ? 'opery' : 'dila', kind, source, author, name, aliases: nickname ? nickname[1] : [], year, by: authorNames.join(', '),
        genre: kind === 'album' || kind === 'píseň' ? genreGroupOf(detail, qid) : null });
}

// --- 4. krok: výběr ---
// Základ kategorie podle počtu jazykových verzí (czLimit = kolik českých nad limit). Okruhy, které by tak zůstaly malé
// (elektronická hudba, folk, baroko, slovenská hudba, české opery), se pak doplní dalšími položkami do kvóty – globální limit by je vyhladověl.
const LIMITS = {
    skladatele: { limit: 215, czLimit: 45 },
    hudebnici: { limit: 430, czLimit: 80 },
    kapely: { limit: 280, czLimit: 55 },
    dila: { limit: 466, czLimit: 60 },
    // Opery, operety a muzikály mají vlastní kategorii (dřív mezi díly zabíraly 74 míst)
    opery: { limit: 300, czLimit: 45 }
};
// Od jednoho autora nejvýš 4 díla (jinak by bylo patnáct alb Queen), oper 6 – u českých skladatelů 12 (Smetana, Dvořák, Janáček, Martinů)
const PER_AUTHOR = { dila: 4, opery: 6 };
const PER_CZECH_AUTHOR = { dila: 4, opery: 12 };
// Kvóty okruhů: kolik položek okruh má mít, když v kandidátech dost slavných je
const OKRUH_QUOTAS = {
    'cesti-skladatele': 70, 'slovenska-hudba': 50, 'ceska-dila': 100, 'ceske-opery': 80, muzikaly: 60, 'balet-a-muzikal': 80,
    renesance: 25, baroko: 70, klasicismus: 45, romantismus: 130, 'hudba-20-stoleti': 200,
    'jazz-blues': 120, 'rnb-soul': 140, 'hip-hop': 140, elektronicka: 90, 'folk-country': 100, reggae: 25, 'leta-70': 230
};
// Díla z KNOWN_WORKS, jejichž název nese i jiné dílo: známé je jen to od tohoto autora (muzikál Hamlet Janka Ledeckého, ne opera Ambroise Thomase)
const KNOWN_WORK_BY = { Hamlet: 'Ledecký', Dracula: 'Svoboda', 'Monte Cristo': 'Svoboda', Faust: 'Gounod', Otello: 'Verdi', Rusalka: 'Dvořák', 'Johanka z Arku': 'Soukup',
    // Žebrácká opera, kterou Češi znají, je Havlova hra – Pepuschova baladická opera známá není
    'Žebrácká opera': 'Havel' };
const isCurated = (entry) => CZECH_KNOWN.has(entry.name)
    || (Boolean(entry.by) && KNOWN_WORKS.has(entry.name) && (!KNOWN_WORK_BY[entry.name] || entry.by.includes(KNOWN_WORK_BY[entry.name])));
// Pořadí: nejdřív slavná česká jména, potom podle počtu jazykových verzí
const byFame = (list) => list.sort((a, b) => Number(CZECH_KNOWN.has(b.name)) - Number(CZECH_KNOWN.has(a.name)) || b.detail.sl - a.detail.sl);
const isCzechPerson = (detail) => isCzechDetail(detail, 'cit', 'bornIn', 'origin', 'country');
const isWorkCategory = (category) => category === 'dila' || category === 'opery';
// Slovenská stopa: slovenská národnost v popisu (i „česko-slovenský“), jinak občanství či původ Slovensko
const isSlovakDetail = (detail, ...keys) => {
    const words = cleanText(detail.d).toLowerCase().split(/[\s,;]+/);
    const leading = words.slice(0, Math.max(0, words.findIndex(word => !/(ý|á|é|í)$/u.test(word))));
    if (leading.some(word => /(^|-)slovensk/u.test(word)) || nationalityOf(detail.d) === 'Slovensko') return true;
    return !nationalityOf(detail.d) && keys.some(key => (detail[key] || []).includes(SLOVAKIA));
};
// Položky, které už v tématu jsou, zůstávají (pokrok hráčů, nahlášené otázky, fotky s textem v data/photo-text.json), pokud je pravidla pořád berou
const PUBLISHED_FILE = new URL('../data/hudba.json', import.meta.url);
const PUBLISHED = new Set(existsSync(PUBLISHED_FILE) ? JSON.parse(readFileSync(PUBLISHED_FILE, 'utf8')).items.map(item => item.q) : []);
// Ze stejně pojmenovaných zůstane jen jeden: ručně určený (muzikál Chicago, ne kapela), jinak ten, který už v tématu je, jinak vybraný známý,
// jinak osoba či kapela před dílem (album Queen), jinak ten známější
const nameKey = (name) => name.toLocaleLowerCase('cs').replace(/^the /u, '');
const NAME_OWNERS = { chicago: 'Q656285' };
const claimed = new Map(Object.entries(NAME_OWNERS));
for (const entry of [...people, ...bands, ...works].filter(entry => PUBLISHED.has(entry.qid))) if (!claimed.has(nameKey(entry.name))) claimed.set(nameKey(entry.name), entry.qid);
for (const entry of byFame([...people, ...bands, ...works].filter(isCurated))) if (!claimed.has(nameKey(entry.name))) claimed.set(nameKey(entry.name), entry.qid);
const taken = new Set();
const perAuthor = new Map();
const pool = [];
for (const list of [byFame(people.filter(p => p.category === 'skladatele')), byFame(people.filter(p => p.category === 'hudebnici')), byFame(bands),
    byFame(works.filter(work => work.category === 'opery')), byFame(works.filter(work => work.category === 'dila'))]) {
    const counts = { all: 0, cz: 0 };
    console.log(`  k výběru: ${list.length} (${list[0] ? list[0].category : ''})`);
    for (const entry of list) {
        const { detail, category, name } = entry;
        const settings = LIMITS[category];
        const authorDetail = details.get(entry.author) || {};
        let isCzech = isWorkCategory(category)
            ? Boolean(entry.author && isCzechPerson(authorDetail) && /^Česko|^Československo/u.test(landOf(authorDetail, 'cit', 'origin', 'country') || ''))
                || (detail.origin || []).some(q => CZECH_STATES.has(q)) || (detail.lang || []).includes('Q9056')
            : isCzechPerson(detail);
        const must = isCurated(entry);
        const key = nameKey(name);
        if (taken.has(key) || (claimed.has(key) && claimed.get(key) !== entry.qid)) continue;
        if (isWorkCategory(category)) {
            // Dílo nazvané po autorovi (album Metallica) by bylo hned poznat; u jednoho autora jen pár děl (u oper víc)
            const authorCount = `${category}:${entry.author || entry.by}`;
            const limited = !must && !PUBLISHED.has(entry.qid) && (perAuthor.get(authorCount) || 0) >= (isCzech ? PER_CZECH_AUTHOR : PER_AUTHOR)[category];
            if (nameKey(entry.by).includes(key) || limited) continue;
            perAuthor.set(authorCount, (perAuthor.get(authorCount) || 0) + 1);
        }
        taken.add(key);
        const base = must || counts.all < settings.limit || (isCzech && counts.cz < settings.czLimit) || PUBLISHED.has(entry.qid);
        if (base) {
            counts.all++;
            if (isCzech) counts.cz++;
        }
        const sk = isWorkCategory(category)
            ? (entry.author && isSlovakDetail(authorDetail, 'cit')) || (detail.origin || []).includes(SLOVAKIA) || (detail.lang || []).includes('Q9058')
            : isSlovakDetail(detail, 'cit', 'origin', 'country');
        // Slovenské dílo (Patejdlův Jack Rozparovač) mezi česká díla nepatří, i když autor měl československé občanství
        if (sk && isWorkCategory(category)) isCzech = false;
        // Období pro okruhy: u skladatele z let tvorby, u díla (ne u písně, alba a muzikálu) podle skladatele
        const authorLife = isWorkCategory(category) && entry.author && !['album', 'píseň', 'muzikál'].includes(entry.kind) ? lifeYears(authorDetail) : null;
        const periods = category === 'skladatele'
            ? [...new Set([periodFor(detail, entry.life.born, entry.life.died), ...periodsFor(detail, entry.life.born, entry.life.died)].filter(Boolean))]
            : authorLife && /skladatel|komponist/u.test(authorDetail.d || '') ? periodsFor(authorDetail, authorLife.born, authorLife.died).slice(0, 1) : [];
        pool.push({ ...entry, isCzech, must, base, sk: Boolean(sk), periods });
    }
}

const CZECH_LANDS = /^(Česko|Československo)$/u;
// Položky z vybraných záznamů; odkazy (kapela hudebníka, autor díla, nejslavnější dílo) jen mezi vybranými
const buildItems = (selected) => {
    const selectedIds = new Set(selected.map(entry => entry.qid));
    const selectedBands = new Set(selected.filter(entry => entry.category === 'kapely').map(entry => entry.qid));
    // Nejslavnější dílo osoby či kapely: z významných děl (P800) to, které máme, jinak naše nejslavnější
    const worksByAuthor = new Map();
    for (const entry of selected) if (isWorkCategory(entry.category) && entry.author) worksByAuthor.set(entry.author, [...(worksByAuthor.get(entry.author) || []), entry]);
    const famousWorkOf = (entry) => {
        const own = worksByAuthor.get(entry.qid) || [];
        const notable = (entry.detail.notable || []).filter(q => workCandidateIds.has(q));
        const work = own.find(other => notable.includes(other.qid)) || own[0];
        if (work) return work.name;
        const name = notable.map(nameOf).find(other => other && !NUMBERED.test(other) && other.length <= 40);
        return name && !nameKey(name).includes(nameKey(entry.name)) ? name : undefined;
    };
    // Kapela hudebníka (P463) z vybraných kapel; členové kapely z vybraných hudebníků, jinak z Wikidat
    const bandOf = (entry) => (entry.detail.memberOf || []).filter(q => selectedBands.has(q)).map(nameOf)[0];
    const membersOf = (entry) => {
        const members = entry.detail.members || [];
        if (!members.length || members.length > 8) return undefined;
        const ranked = [...members].sort((a, b) => Number(selectedIds.has(b)) - Number(selectedIds.has(a)) || sitelinks(b) - sitelinks(a));
        return ranked.slice(0, 3).map(nameOf).filter(Boolean).join(', ') || undefined;
    };
    const items = [];
    for (const entry of selected) {
        const { qid, detail, category } = entry;
        let f;
        if (category === 'skladatele' || category === 'hudebnici') {
            const { born, died } = entry.life;
            f = {
                born, died,
                land: landOf(detail, 'cit'),
                per: category === 'skladatele' ? periodFor(detail, born, died) : undefined,
                genre: category === 'hudebnici' && entry.genre ? entry.genre.label : undefined,
                band: category === 'hudebnici' ? bandOf(entry) : undefined,
                work: famousWorkOf(entry),
                // Vrchol tvorby zhruba ve 35 letech, u krátkého života dřív
                y: Math.min(born + 35, died !== undefined ? Math.round(born + (died - born) * 0.75) : born + 35)
            };
        } else if (category === 'kapely') {
            f = {
                from: entry.from,
                land: landOf(detail, 'origin', 'country'),
                genre: entry.genre ? entry.genre.label : undefined,
                city: (detail.formed || []).map(cs).filter(Boolean)[0],
                members: membersOf(entry),
                work: famousWorkOf(entry),
                y: entry.from
            };
        } else {
            const author = entry.author && selectedIds.has(entry.author) ? entry.author : undefined;
            const authorDetail = details.get(entry.author) || {};
            f = {
                year: entry.year,
                by: entry.by,
                byq: author,
                kind: entry.source,
                land: (detail.origin || []).map(countryName).find(Boolean) || (entry.author ? landOf(authorDetail, 'cit', 'origin', 'country') : undefined),
                genre: entry.genre ? entry.genre.label : undefined,
                album: entry.kind === 'píseň' ? (detail.partOf || []).filter(q => albumIds.has(q)).map(nameOf)[0] : undefined,
                // Libretista opery či muzikálu (jen jeden, jinak by to byl dlouhý výčet)
                lib: (detail.libretto || []).length === 1 ? nameOf(detail.libretto[0]) : undefined,
                y: entry.year
            };
        }
        items.push(compact({
            q: qid,
            t: detail.t,
            n: entry.name,
            c: category,
            k: 0,
            ty: isWorkCategory(category) ? entry.kind : entry.ty,
            d: entry.desc || detail.d,
            cz: entry.isCzech ? 1 : undefined,
            sx: (category === 'skladatele' || category === 'hudebnici') && detail.sex === FEMALE ? 'f' : undefined,
            ...imageFields(detail.im),
            al: entry.aliases && entry.aliases.length ? entry.aliases : undefined,
            f: compact(f),
            // Žánrová skupina (rock, pop, jazz…) – pro nesprávné možnosti a okruhy; začátek kariéry pro okruhy desetiletí
            gr: entry.genre ? entry.genre.group : undefined,
            st: category === 'hudebnici' || category === 'kapely' ? entry.start : undefined,
            // Jen pro okruhy: slovenská stopa a hudební období (mírnější než otázka na období)
            sk: entry.sk ? 1 : undefined,
            pg: entry.periods.length ? entry.periods : undefined
        }));
    }
    // Píseň z alba: nejznámější vybraná píseň, která na albu vyšla
    for (const item of items) {
        if (item.c !== 'dila' || item.f.kind !== 'album') continue;
        const song = items.find(other => other.c === 'dila' && other.f.album === item.n && other.f.by === item.f.by);
        if (song) item.f.song = song.n;
    }
    return items;
};

// --- 5. krok: okruhy pro systematické učení ---
const BY_YEAR = { by: 'y' };
const isPerformer = (item) => item.c === 'hudebnici' || item.c === 'kapely';
const isClassical = (item) => item.gr === 'klasika' || /operní/u.test(item.ty || '');
const isCzechLand = (item) => item.cz === 1 && (CZECH_LANDS.test(item.f.land || '') || isWorkCategory(item.c));
const inGenre = (...groups) => (item) => (isPerformer(item) || (item.c === 'dila' && item.f.kind !== 'skladba')) && groups.includes(item.gr);
const decade = (from) => (item) => isPerformer(item) && !isClassical(item) && item.st >= from && item.st < from + 10;
const inPeriod = (period) => (item) => (item.pg || []).includes(period);
const COLLECTIONS = [
    { id: 'cesti-skladatele', label: 'Čeští skladatelé', sort: BY_YEAR, test: item => item.c === 'skladatele' && isCzechLand(item) },
    { id: 'ceska-popularni', label: 'Česká populární hudba', text: 'Zpěváci, hudebníci a kapely', sort: BY_YEAR, test: item => isPerformer(item) && isCzechLand(item) && !isClassical(item) },
    { id: 'slovenska-hudba', label: 'Slovenská hudba', text: 'Slovenští skladatelé, zpěváci, kapely a díla', sort: BY_YEAR, test: item => item.sk === 1 },
    { id: 'ceska-dila', label: 'Česká hudební díla', sort: BY_YEAR, test: item => isWorkCategory(item.c) && item.cz === 1 },
    { id: 'ceske-opery', label: 'České opery a muzikály', sort: BY_YEAR, test: item => item.c === 'opery' && item.cz === 1 },
    { id: 'muzikaly', label: 'Muzikály', text: 'Od West Side Story po Draculu', sort: BY_YEAR, test: item => item.c === 'opery' && item.ty === 'muzikál' },
    { id: 'renesance', label: 'Renesance', text: 'Skladatelé a díla 15. a 16. století', sort: BY_YEAR, test: inPeriod('renesance') },
    { id: 'baroko', label: 'Baroko', text: 'Skladatelé a díla zhruba 1600–1750', sort: BY_YEAR, test: inPeriod('baroko') },
    { id: 'klasicismus', label: 'Klasicismus', text: 'Skladatelé a díla zhruba 1750–1820', sort: BY_YEAR, test: inPeriod('klasicismus') },
    { id: 'romantismus', label: 'Romantismus', text: 'Skladatelé a díla 19. století', sort: BY_YEAR, test: inPeriod('romantismus') },
    { id: 'hudba-20-stoleti', label: 'Hudba 20. století', text: 'Skladatelé a díla moderní vážné a filmové hudby', sort: BY_YEAR, test: inPeriod('moderna') },
    { id: 'opera', label: 'Opera', text: 'Opery a operní pěvci', sort: BY_YEAR, test: item => item.ty === 'opera' || /operní/u.test(item.ty || '') },
    { id: 'balet-a-muzikal', label: 'Balet, opereta a muzikál', sort: BY_YEAR, test: item => ['balet', 'opereta', 'muzikál'].includes(item.ty) },
    { id: 'rock', label: 'Rock a punk', sort: BY_YEAR, test: inGenre('rock', 'punk') },
    { id: 'metal', label: 'Metal', sort: BY_YEAR, test: inGenre('metal') },
    { id: 'pop', label: 'Pop', sort: BY_YEAR, test: inGenre('pop') },
    { id: 'jazz-blues', label: 'Jazz a blues', sort: BY_YEAR, test: inGenre('jazz') },
    { id: 'rnb-soul', label: 'R&B, soul a funk', sort: BY_YEAR, test: inGenre('rnb') },
    { id: 'hip-hop', label: 'Hip hop a rap', sort: BY_YEAR, test: inGenre('hiphop') },
    { id: 'elektronicka', label: 'Elektronická hudba', sort: BY_YEAR, test: inGenre('elektronicka') },
    { id: 'folk-country', label: 'Folk a country', sort: BY_YEAR, test: inGenre('folk') },
    { id: 'reggae', label: 'Reggae a ska', sort: BY_YEAR, test: inGenre('reggae') },
    { id: 'slavna-alba', label: 'Slavná alba', sort: BY_YEAR, test: item => item.c === 'dila' && item.f.kind === 'album' },
    { id: 'slavne-pisne', label: 'Slavné písně', sort: BY_YEAR, test: item => item.c === 'dila' && item.ty === 'píseň' },
    { id: 'leta-60', label: 'Šedesátá léta', text: 'Hvězdy a kapely, které začínaly v 60. letech', sort: BY_YEAR, test: decade(1960) },
    { id: 'leta-70', label: 'Sedmdesátá léta', text: 'Hvězdy a kapely, které začínaly v 70. letech', sort: BY_YEAR, test: decade(1970) },
    { id: 'leta-80', label: 'Osmdesátá léta', text: 'Hvězdy a kapely, které začínaly v 80. letech', sort: BY_YEAR, test: decade(1980) },
    { id: 'leta-90', label: 'Devadesátá léta', text: 'Hvězdy a kapely, které začínaly v 90. letech', sort: BY_YEAR, test: decade(1990) }
];
const groupsOf = (item) => COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);

// Doplnění okruhů do kvóty: nejslavnější dosud nevybrané položky okruhu – osoby a kapely s fotkou a aspoň 12 jazykovými verzemi
// (české a slovenské od 4), díla od 8 (česká a slovenská i s jediným článkem, přednostně od slavných autorů)
const poolItems = new Map(buildItems(pool).map(item => [item.q, item]));
const kept = new Set(pool.filter(entry => entry.base).map(entry => entry.qid));
const quotaFame = (entry) => entry.detail.sl + (isWorkCategory(entry.category) && entry.author ? sitelinks(entry.author) / 10 : 0);
const quotaEligible = (entry, item) => {
    const home = entry.isCzech || entry.sk;
    if (isWorkCategory(entry.category)) return entry.detail.sl >= (home ? 1 : 8) && Boolean(item.d);
    return Boolean(item.im) && entry.detail.sl >= (home ? 4 : 12);
};
const added = {};
for (const [okruh, quota] of Object.entries(OKRUH_QUOTAS)) {
    const inOkruh = pool.filter(entry => groupsOf(poolItems.get(entry.qid)).includes(okruh));
    let count = inOkruh.filter(entry => kept.has(entry.qid)).length;
    const extra = inOkruh.filter(entry => !kept.has(entry.qid) && quotaEligible(entry, poolItems.get(entry.qid))).sort((a, b) => quotaFame(b) - quotaFame(a));
    for (const entry of extra) {
        if (count >= quota) break;
        kept.add(entry.qid);
        count++;
        added[okruh] = (added[okruh] || 0) + 1;
    }
}
console.log(`Doplněno do okruhů: ${JSON.stringify(added)}`);
const selected = pool.filter(entry => kept.has(entry.qid));
const selectedIds = new Set(selected.map(entry => entry.qid));
const items = buildItems(selected);

// Autoři stejnojmenných děl (Rusalka – Dvořák i Dargomyžskij, Othello – Verdi i Rossini): u otázky na autora nesmí být mezi možnostmi
const workNames = [...new Set(items.filter(item => isWorkCategory(item.c)).flatMap(item => [item.n, titleName(item.t)]))];
const namesakeAuthors = await cachedByKey('hudba-namesakes-3', workNames, async (names) => {
    const result = Object.fromEntries(names.map(name => [name, []]));
    await inBatches(names, 150, (batch) => `SELECT ?l ?au WHERE { VALUES ?l { ${batch.map(name => JSON.stringify(name) + '@cs').join(' ')} }
  ?w rdfs:label ?l . { ?w wdt:P86 ?au } UNION { ?w wdt:P175 ?au } UNION { ?w wdt:P50 ?au } }`,
    (row) => {
        const author = id(row.au.value);
        if (result[row.l.value] && !result[row.l.value].includes(author)) result[row.l.value].push(author);
    }, detailsRun);
    return result;
});
for (const item of items) {
    if (!isWorkCategory(item.c) || !item.f.byq) continue;
    const others = [...new Set([item.n, titleName(item.t)].flatMap(name => namesakeAuthors[name] || []))].filter(q => q !== item.f.byq && selectedIds.has(q));
    if (others.length) item.xa = others;
}

for (const item of items) {
    const groups = groupsOf(item);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

// --- 6. krok: úrovně obtížnosti (pravidla v scripts/lib/hudba-levels.mjs) ---
const entryOf = new Map(selected.map(entry => [entry.qid, entry]));
const promoted = assignLevels(items, {
    collections,
    sitelinksOf: (item) => entryOf.get(item.q).detail.sl,
    isAlways: (item) => entryOf.get(item.q).must,
    isDamped: (item) => eurovision.has(item.q),
    isNever: (item) => NOT_KNOWN.has(item.n) || (isWorkCategory(item.c) && NOT_KNOWN.has(item.f.by)),
    authorKeyOf: (item) => isWorkCategory(item.c) ? entryOf.get(item.q).author || item.f.by : null
});
for (const [okruh, names] of Object.entries(promoted)) console.log(`  povýšeno v okruhu ${okruh}: ${names.join(', ')}`);
const itemNames = new Set(items.map(item => item.n));
console.log(`  vybraná jména, která v datech nejsou: ${[...CZECH_KNOWN, ...KNOWN_WORKS].filter(name => !itemNames.has(name)).join(', ')}`);

for (const item of items) {
    // Začátek kariéry, slovenská stopa a období byly potřeba jen pro okruhy
    delete item.st;
    delete item.sk;
    delete item.pg;
}

for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.x).length} expertních, ${inCategory.filter(item => item.cz).length} českých, ${inCategory.filter(item => item.im).length} s fotkou)`);
}
for (const collection of collections) {
    const inOkruh = items.filter(item => (item.g || []).includes(collection.id));
    console.log(`okruh ${collection.label}: ${inOkruh.length} (${inOkruh.filter(item => item.k).length} známých, ${inOkruh.filter(item => item.x).length} expertních)`);
}

writeTopic('hudba', { collections, items });
