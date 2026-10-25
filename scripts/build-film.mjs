// Téma Film: data/film.json z Wikidat – filmy, režiséři, herci a herečky
// Spuštění: npm run build:film (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { sparql, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';

const HUMAN = 'Q5';
const FEMALE = 'Q6581072';
// Film, celovečerní film, animovaný film a celovečerní animovaný film (krátké a dokumentární filmy ne)
const FILM_TYPES = ['Q11424', 'Q24869', 'Q202866', 'Q29168811'];
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
const candidates = {
    films: [...new Map([...films, ...czechFilms])].sort((a, b) => b[1] - a[1]),
    people: [...new Map([...directors, ...actors, ...czechPeople])].sort((a, b) => b[1] - a[1])
};
console.log(`Kandidáti: ${candidates.films.length} filmů, ${candidates.people.length} osob`);
const czechFilmIds = new Set(czechFilms.map(([qid]) => qid));
const czechPeopleIds = new Set(czechPeople.map(([qid]) => qid));
// Podrobnosti jen k nejznámějším (a všem českým) – víc by se do tématu stejně nevešlo
const FILM_DETAILS = 1500;
const PEOPLE_DETAILS = 2200;
const filmIds = candidates.films.filter(([qid], index) => index < FILM_DETAILS || czechFilmIds.has(qid)).map(([qid]) => qid);

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
const filmMap = new Map(await cached('film-films', () => fetchDetails(filmIds, filmDetails, 25)));
// Osoby: kandidáti a navíc režiséři vybraných filmů (i méně známí – jejich jméno je v nápovědě)
const filmDirectors = [...new Set([...filmMap.values()].flatMap(film => film.dir || []))].filter(qid => /^Q\d+$/.test(qid));
const personIds = [...new Set([...candidates.people.filter(([qid], index) => index < PEOPLE_DETAILS || czechPeopleIds.has(qid)).map(([qid]) => qid), ...filmDirectors])];
const people = new Map(await cached('film-people', () => fetchDetails(personIds, personDetails, 80)));
console.log(`Podrobnosti: ${filmMap.size} filmů, ${people.size} osob`);
// Jen mezinárodní jméno (mul) mají třeba Marlon Brando nebo Pablo Picasso
for (const person of people.values()) if (!person.n && person.mul) person.n = [].concat(person.mul)[0];

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
const cs = (qid) => labels.get(`cs:${qid}`);
const en = (qid) => labels.get(`en:${qid}`) || '';
const sitelinks = new Map([...candidates.films, ...candidates.people]);
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
const ANIMATED = ['Q202866', 'Q29168811'];
const SILENT = 'Q226730';
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
    'Jana Preissová', 'Petr Nárožný', 'Ondřej Vetchý', 'Vlasta Chramostová', 'Miloš Kopecký', 'Ladislav Pešek', 'Theodor Pištěk', 'Eduard Cupák']);

// --- 4. krok: položky ---
const LIMITS = {
    filmy: { limit: 650, known: 130, czLimit: 200, czKnown: 12, animatedLimit: 70, animatedKnown: 25 },
    reziseri: { limit: 170, known: 45, czLimit: 40 },
    herci: { limit: 420, known: 110, czLimit: 110 }
};
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
    // Nejznámější české položky se vejdou vždy
    const full = isCzech ? czechPosition >= settings.czLimit && !CZECH_KNOWN.has(item.n) : position >= settings.limit;
    if (full) return false;
    // Jedna položka na jméno (Babička z roku 1940, ne remake)
    if (names.has(nameKey(item.n))) return false;
    names.add(nameKey(item.n));
    rank[category] = position + 1;
    if (isCzech) czechRank[category] = czechPosition + 1;
    const czechKnown = items.filter(other => other.c === category && other.cz && other.k).length;
    items.push(compact({ ...item, c: category, k: isKnown(position, czechKnown) ? 1 : 0, cz: isCzech ? 1 : undefined }));
    return true;
};

// Filmy: s rokem premiéry, ne dokumenty, seriály a budoucí filmy; české = jen české a československé, nebo s českým režisérem
// (koprodukce natočené v Praze jako Casino Royale ne)
const filmItems = [];
// Animované filmy (Disney) mají spoustu jazykových verzí – bez omezení by tvořily pětinu filmů a třetinu známých
let animatedCount = 0;
const personName = (qid) => people.has(qid) && people.get(qid).n ? nameOf(people.get(qid)) : undefined;
for (const [qid, links] of candidates.films) {
    const detail = filmMap.get(qid);
    if (!detail || !detail.t || !detail.n) continue;
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
    // Herci podle známosti (ve Wikidatech nejsou seřazení podle rolí); nejdřív herci, až pak režiséři a další v cameo roli
    // (Vláčil ve Vesničko má středisková, Stan Lee ve Spider-Manovi)
    const isActor = (qid) => roleOf(people.get(qid), 0) === 'herci' ? 1 : 0;
    const cast = [...new Set(detail.cast || [])].filter(actor => personName(actor))
        .sort((a, b) => isActor(b) - isActor(a) || (sitelinks.get(b) || 0) - (sitelinks.get(a) || 0));
    const genres = genresOf(detail);
    const animated = (detail.type || []).some(type => ANIMATED.includes(type)) || genres.includes('animovaný film');
    if (animated && animatedCount >= LIMITS.filmy.animatedLimit) continue;
    const minutes = detail.len ? Math.round(Number(detail.len) / 60) : undefined;
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
            // Česko a Československo první (Tři oříšky pro Popelku jsou i německé)
            land: [...countries].sort((a, b) => (CZECH_FILM_STATES.has(b) ? 1 : 0) - (CZECH_FILM_STATES.has(a) ? 1 : 0)).map(cs).filter(Boolean).slice(0, 2),
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
        animated
    };
    const known = (position, czechKnown) => isCzech ? CZECH_KNOWN.has(item.n) || czechKnown < LIMITS.filmy.czKnown
        : position < LIMITS.filmy.known && !(animated && animatedCount >= LIMITS.filmy.animatedKnown);
    if (add('filmy', item, isCzech, known)) {
        filmItems.push(items[items.length - 1]);
        if (animated) animatedCount++;
    }
}

// Filmografie z vybraných filmů: režiséři podle režie, herci podle obsazení (nejznámější filmy první)
const directed = new Map();
const starred = new Map();
for (const film of filmItems) {
    for (const director of film.directorIds || []) directed.set(director, [...(directed.get(director) || []), film]);
    for (const actor of film.castIds || []) starred.set(actor, [...(starred.get(actor) || []), film]);
}
const personCandidates = [...new Set([...candidates.people.map(([qid]) => qid), ...filmItems.flatMap(film => film.directorIds || [])])]
    .filter(qid => people.has(qid)).sort((a, b) => (sitelinks.get(b) || 0) - (sitelinks.get(a) || 0));
for (const qid of personCandidates) {
    const detail = people.get(qid);
    if (!detail.t || !detail.n || !(detail.type || []).includes(HUMAN)) continue;
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
    // Známí: z nejznámějších ti s aspoň dvěma filmy v datech (jinak by mezi známé pronikly hvězdy indické televize); z Čechů ti nejznámější
    const known = (position) => isCzech ? CZECH_KNOWN.has(item.n) : position < LIMITS[category].known && own.length >= 2;
    // Osoba má přednost před filmem stejného jména (herečka Lída Baarová, ne životopisný film o ní)
    const sameFilm = filmItems.find(film => nameKey(film.n) === nameKey(item.n));
    if (sameFilm) {
        items.splice(items.indexOf(sameFilm), 1);
        filmItems.splice(filmItems.indexOf(sameFilm), 1);
        names.delete(nameKey(item.n));
        item.f.films = (item.f.films || []).filter(name => name !== sameFilm.n);
        for (const other of items) if (other.f.films) other.f.films = other.f.films.filter(name => name !== sameFilm.n);
    }
    add(category, item, isCzech, known);
}
// Odkaz na režiséra filmu jen tehdy, když je mezi režiséry (otázka „Kdo film režíroval?“)
const directorItems = new Set(items.filter(item => item.c === 'reziseri').map(item => item.q));
for (const film of filmItems) {
    if (film.f.dq1 && directorItems.has(film.f.dq1)) film.f.dirq = film.f.dq1;
    delete film.f.dq1;
}

// --- 5. krok: okruhy pro učení ---
const hasGenre = (...qids) => (item) => item.c === 'filmy' && qids.some(qid => (item.genreIds || []).includes(qid));
const BY_YEAR = { by: 'y' };
const COLLECTIONS = [
    { id: 'cesky-film', label: 'Český film', text: 'České a československé filmy, režiséři a herci', sort: BY_YEAR, test: item => item.cz },
    { id: 'ceska-klasika', label: 'Česká filmová klasika', text: 'České a československé filmy do roku 1989', sort: BY_YEAR, test: item => item.c === 'filmy' && item.cz && item.f.year < 1990 },
    { id: 'zlata-sedesata', label: 'Zlatá šedesátá', text: 'Česká nová vlna a filmy 60. let', sort: BY_YEAR, test: item => item.c === 'filmy' && item.cz && item.f.year >= 1960 && item.f.year < 1970 },
    { id: 'pohadky', label: 'Filmové pohádky', sort: BY_YEAR, test: hasGenre('Q1957385', 'Q699') },
    { id: 'oscar-film', label: 'Oscar za nejlepší film', sort: BY_YEAR, test: item => item.c === 'filmy' && item.f.osc },
    { id: 'drzitele-oscara', label: 'Držitelé Oscara', text: 'Režiséři, herci a herečky s Oscarem', sort: BY_YEAR, test: item => item.c !== 'filmy' && item.f.osc },
    { id: 'animovane', label: 'Animované filmy', sort: BY_YEAR, test: item => item.c === 'filmy' && item.animated },
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
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
for (const item of items) { delete item.castIds; delete item.directorIds; delete item.genreIds; delete item.animated; delete item.filmCount; }
const sizeOf = (collection) => items.filter(item => (item.g || []).includes(collection.id)).length;
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.cz).length} českých)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${sizeOf(collection)}`);

writeTopic('film', { collections, items });
