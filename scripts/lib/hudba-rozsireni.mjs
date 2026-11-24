// Téma Hudba, rozšíření: kategorie Balet a tance (balety s autorem hudby a tance světa) a další muzikály v kategorii Opery a muzikály.
// Používá build-hudba.mjs: na konci celého sestavení, nebo samostatně nad hotovým data/hudba.json (HUDBA_ONLY=rozsireni) – existující
// položky zůstanou beze změny (id, kategorie, úroveň), přidají se jen nové; stávající balety (Slavná díla) dostanou navíc okruh Balety.
//
// Kandidáti: kategorie české Wikipedie (přes službu MWAPI dotazovací služby Wikidat – API Wikipedie samo se nečte), třídy Wikidat
// (druh tance, balet) a ruční seznamy článků. Známost nových položek: jazykové verze (sitelinks) a návštěvnost článku na české
// Wikipedii za rok 2025 (KNOWN_RULES, assignExtraLevels); pro experty nejméně známá třetina (u českých pětina).
// Vyřazené kvůli jiným tématům: Breakdance a Cheerleading (Sport), Pták Ohnivák (Mytologie), Kalinka (už mezi díly).
//
// Muzikály mají vlastní okruh Muzikály v kategorii Opery a muzikály: samostatná kategorie by bez přesunu existujících muzikálů
// (West Side Story, Kočky, Fantom opery – kategorie existujících položek se nemění) neměla nejznámější díla.
// Lidové písně: česká Wikipedie jich má jen asi dvacet, většinou s jedinou jazykovou verzí, bez fotek a údajů pro nápovědy – vynechány.
import { readFileSync, readdirSync } from 'node:fs';
import { sparql, id, values, imageFields, yearOf, compact, cached, inBatches, sleep, readCountries } from './wikidata.mjs';
import { cachedByKey, czechPageviews, knownFloor } from './zemepis-levels.mjs';

export const EXTRA_CATEGORIES = ['tance'];
export const DANCE_COLLECTIONS = [
    { id: 'balety', label: 'Balety', text: 'Od Labutího jezera po Kamenný kvítek', sort: { by: 'y' } },
    { id: 'spolecenske-tance', label: 'Společenské tance', text: 'Standardní a latinskoamerické tance', sort: { by: 'y' } },
    { id: 'lidove-tance', label: 'Lidové a národní tance', text: 'Polka, čardáš, flamenco, sirtaki a další', sort: { by: 'y' } },
    { id: 'historicke-tance', label: 'Historické tance', text: 'Renesanční a barokní tance', sort: { by: 'y' } }
];

const CACHE_PREFIX = 'hudba-x';
const quote = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// --- Kategorie české Wikipedie a ruční seznamy ---
const DANCE_CATEGORIES = ['Kategorie:Tance', 'Kategorie:Lidové tance', 'Kategorie:Swingové tance', 'Kategorie:Latinskoamerické tance',
    'Kategorie:Standardní tance', 'Kategorie:Společenské tance', 'Kategorie:Historické tance', 'Kategorie:České lidové tance'];
const BALLET_CATEGORIES = ['Kategorie:Balety'];
const MUSICAL_CATEGORIES = ['Kategorie:České muzikály', 'Kategorie:Americké muzikály', 'Kategorie:Britské muzikály', 'Kategorie:Francouzské muzikály',
    'Kategorie:Německé muzikály', 'Kategorie:Rakouské muzikály', 'Kategorie:Australské muzikály', 'Kategorie:Slovenské muzikály', 'Kategorie:Ruské muzikály',
    'Kategorie:Muzikály'];

// Balety, které v kategorii české Wikipedie chybějí (názvy článků)
const BALLETS_MORE = ['Pták Ohnivák', 'Petruška (balet)', 'Spartakus (balet)', 'Popelka (Prokofjev)', 'Popelka (balet)', 'Gajane', 'Korzár (balet)', 'Raymonda',
    'Sylfidy', 'Daphnis a Chloé', 'Podivuhodný mandarín', 'Dřevěný princ', 'Pulcinella (balet)', 'Tříhranný klobouk', 'Čarodějná láska', 'Sylvia (balet)',
    'Marná opatrnost', 'Bachčisarajská fontána (balet)', 'Pohádka o Honzovi', 'Z pohádky do pohádky', 'Šeherezáda (balet)', 'Paquita', 'Esmeralda (balet)',
    'Apollon Musagète', 'Svatba (Stravinskij)', 'Agon (balet)', 'Rodeo (balet)', 'Billy the Kid (balet)', 'Fancy Free', 'Zlatý věk (balet)', 'Parade (balet)',
    'Les Biches', 'Faunovo odpoledne (balet)', 'Kuchyňská revue', 'Šach králi', 'Othello (balet)', 'Romeo a Julie (balet)', 'Manon (balet)',
    'Hrátky s čertem (balet)', 'Krysař (balet)', 'Jitřenka (balet)', 'Bajaja (balet)', 'Vodník (balet)', 'Viktorka (balet)'];
// Tance, které v kategoriích chybějí
const DANCES_MORE = ['Rock and roll (tanec)', 'Disco (tanec)', 'Hula', 'Limbo (tanec)', 'Kozáček', 'Hora (tanec)', 'Kolo (tanec)', 'Sardana', 'Fandango',
    'Jota (tanec)', 'Bharatanatjam', 'Kathak', 'Butó', 'Krakowiak', 'Kujawiak', 'Oberek', 'Skočná', 'Sousedská', 'Obkročák', 'Odzemek', 'Slovácký verbuňk',
    'Verbuňk', 'Hip hop (tanec)', 'Vogue (tanec)', 'Moonwalk', 'Shuffle (tanec)', 'Electric boogie', 'Kizomba', 'Bachata (taneční styl)', 'Zouk',
    'Samba (tanec)', 'Salsa (tanec)', 'Tango (tanec)', 'Argentinské tango', 'Waltz', 'Vídeňský valčík', 'Quickstep', 'Slowfox', 'Jive', 'Cha-cha',
    'Rumba', 'Paso doble', 'Foxtrot', 'Charleston (tanec)', 'Lindy hop', 'Boogie-woogie (tanec)', 'Shimmy', 'Tarantela', 'Sirtaki', 'Hopak', 'Trepak',
    'Kankán', 'Čtverylka', 'Polonéza', 'Mazurka', 'Polka', 'Čardáš', 'Flamenco', 'Menuet', 'Gavota', 'Sarabanda', 'Allemanda', 'Gigue', 'Courante',
    'Bourrée', 'Pavana', 'Galliarda', 'Volta (tanec)', 'Branle', 'Passepied', 'Rigaudon', 'Lendler', 'Šotyš', 'Furiant', 'Česká beseda', 'Mambo (tanec)',
    'Merengue', 'Lambada', 'Twist', 'Macarena (tanec)', 'Belly dance', 'Orientální tanec', 'Haka', 'Lví tanec', 'Dračí tanec', 'Step (tanec)',
    'Irské tance', 'Square dance', 'Line dance', 'Breakdance', 'Popping', 'Locking', 'Krump', 'House (tanec)', 'Jazz dance', 'Moderní scénický tanec',
    'Morris dance', 'Hornpipe', 'Skotské tance', 'Country tanec', 'Letkis', 'Ptačí tanec', 'Jitterbug', 'Swing (tanec)', 'Balboa (tanec)', 'Black Bottom'];
// Muzikály, které v kategoriích chybějí
const MUSICALS_MORE = ['Kleopatra (muzikál)', 'Tři mušketýři (muzikál)', 'Golem (muzikál)', 'Galileo (muzikál)', 'Angelika (muzikál)', 'Excalibur (muzikál)',
    'Mýdlový princ', 'Romeo a Julie (muzikál)', 'Mozart! (muzikál)', 'Elisabeth (muzikál)', 'Ples upírů', 'Rebecca (muzikál)', 'Starmania',
    'Miss Saigon', 'Joseph and the Amazing Technicolor Dreamcoat', 'Starlight Express', 'Chess (muzikál)', 'We Will Rock You (muzikál)', 'Billy Elliot (muzikál)',
    'Matilda (muzikál)', 'Aida (muzikál)', 'Kráska a zvíře (muzikál)', 'Lví král (muzikál)', 'Ledové království (muzikál)', 'Wicked', 'Kniha Mormonova',
    'The Book of Mormon (muzikál)', 'Hairspray (muzikál)', 'Sweeney Todd (muzikál)', 'Show Boat', 'Kiss Me, Kate', 'Král a já', 'South Pacific (muzikál)',
    'Carousel (muzikál)', 'Gypsy (muzikál)', 'Guys and Dolls', 'Annie Get Your Gun', 'Annie (muzikál)', 'Kinky Boots (muzikál)', 'Dear Evan Hansen',
    'Blood Brothers', 'Spamalot', 'Klec bláznů (muzikál)', 'Kvítek z horrroru', 'Jekyll & Hyde', 'Divotvorný hrnec', 'Noc na Karlštejně (muzikál)',
    'Jack Rozparovač (muzikál)', 'Adam a Eva (muzikál)', 'Obraz Doriana Graye (muzikál)', 'Kat Mydlář (muzikál)', 'Baron Prášil (muzikál)',
    'Touha jménem Einodis', 'Jesus Christ Superstar', 'Producenti (muzikál)', 'Mamma Mia!', 'Le Roi Soleil', 'Mozart, l\'opéra rock',
    'Tanec upírů', 'Fantom opery (muzikál)', 'Pomáda (muzikál)', 'Hamlet (muzikál)', 'Poslední mohykán (muzikál)', 'Kapka medu pro Verunku'];
export const HAND_TITLES = [...new Set([...BALLETS_MORE, ...DANCES_MORE, ...MUSICALS_MORE])];

// Členové kategorie (MWAPI na query.wikidata.org) → [[název, QID], …]
const categoryMembers = async (category) => (await sparql(`SELECT ?title ?item WHERE {
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "cs.wikipedia.org" ; wikibase:api "Generator" ; mwapi:generator "categorymembers" ;
    mwapi:gcmtitle ${quote(category)} ; mwapi:gcmtype "page" ; mwapi:gcmlimit "max" .
    ?title wikibase:apiOutput mwapi:title . ?item wikibase:apiOutputItem mwapi:item . } }`)).filter(row => row.item).map(row => [row.title.value, id(row.item.value)]);
const membersOf = async (categories) => {
    const result = new Map();
    for (const category of categories) {
        for (const [title, qid] of await cached(`${CACHE_PREFIX}-cat-${category.replace(/\W+/gu, '-')}`, () => categoryMembers(category))) result.set(qid, title);
        await sleep(1000);
    }
    return result;
};
// Název článku → QID
const resolveTitles = async (titles) => {
    const result = Object.fromEntries(titles.map(title => [title, '']));
    for (let i = 0; i < titles.length; i += 60) {
        const rows = await sparql(`SELECT ?t ?x WHERE { VALUES ?t { ${titles.slice(i, i + 60).map(title => `${quote(title)}@cs`).join(' ')} }
  ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t . }`);
        for (const row of rows) result[row.t.value] = id(row.x.value);
        await sleep(1000);
    }
    return result;
};

// Podrobnosti položek
const SINGLE = { t: 1, n: 1, en: 1, d: 1, den: 1, sl: 1 };
const DETAIL_PROPS = [['P31', 'type'], ['P279', 'sub'], ['P136', 'genre'], ['P495', 'co'], ['P17', 'country'], ['P3440', 'takt'], ['P571', 'made'],
    ['P577', 'pub'], ['P1191', 'premiere'], ['P86', 'composer'], ['P87', 'libretto'], ['P676', 'lyrics'], ['P50', 'author'], ['P1809', 'chor'],
    ['P407', 'lang'], ['P18', 'im'], ['P144', 'basedOn']];
const detailQuery = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "en") BIND("en" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "en") BIND("den" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  ${DETAIL_PROPS.map(([property, key]) => `UNION { ?item wdt:${property} ?v BIND("${key}" AS ?p) }`).join('\n  ')}
}`;
const fetchDetails = async (qids) => {
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, 30, detailQuery, (row) => {
        const entry = result.get(id(row.item.value));
        if (!entry || !row.v) return;
        const key = row.p.value;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    });
    return Object.fromEntries(result);
};
const fetchLabels = async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, {}]));
    await inBatches(qids, 200, (batch) => `SELECT ?item ?lang ?l ?sl ?t WHERE { VALUES ?item { ${values(batch)} }
      { ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en" || ?lang = "mul") } UNION { ?item wikibase:sitelinks ?sl }
      UNION { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t . } }`,
    (row) => {
        const entry = result[id(row.item.value)];
        if (row.sl) entry.sl = Number(row.sl.value);
        else if (row.t) entry.t = row.t.value;
        else if (!entry[row.lang.value]) entry[row.lang.value] = row.l.value;
    });
    return result;
};

// Kandidáti a jejich podrobnosti (vše v mezipaměti BUILD_CACHE)
export const fetchExtra = async ({ handTitles = [] } = {}) => {
    const dances = await membersOf(DANCE_CATEGORIES);
    const ballets = await membersOf(BALLET_CATEGORIES);
    const musicals = await membersOf(MUSICAL_CATEGORIES);
    // Třídy Wikidat: druh tance (Q107357104) a balet (Q15079786, žánr balet Q41425)
    const classDances = await cached(`${CACHE_PREFIX}-class-dances`, async () => (await sparql(`SELECT DISTINCT ?x WHERE { ?x wdt:P31 wd:Q107357104 .
      ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> . }`)).map(row => id(row.x.value)));
    await sleep(1000);
    const classBallets = await cached(`${CACHE_PREFIX}-class-ballets`, async () => (await sparql(`SELECT DISTINCT ?x WHERE { { ?x wdt:P31 wd:Q15079786 } UNION { ?x wdt:P136 wd:Q41425 }
      FILTER NOT EXISTS { ?x wdt:P31 wd:Q5 } ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> . }`)).map(row => id(row.x.value)));
    const resolved = await cachedByKey(`${CACHE_PREFIX}-titles`, handTitles, resolveTitles);
    const all = [...new Set([...dances.keys(), ...ballets.keys(), ...musicals.keys(), ...classDances, ...classBallets, ...Object.values(resolved).filter(Boolean)])];
    const details = await cachedByKey(`${CACHE_PREFIX}-details`, all, fetchDetails);
    const refs = [...new Set(all.flatMap(qid => ['type', 'sub', 'genre', 'co', 'country', 'composer', 'libretto', 'lyrics', 'author', 'chor', 'lang', 'basedOn']
        .flatMap(key => (details[qid] || {})[key] || [])))].filter(qid => /^Q\d+$/.test(qid));
    const labels = await cachedByKey(`${CACHE_PREFIX}-labels`, refs, fetchLabels);
    const titles = all.map(qid => (details[qid] || {}).t).filter(Boolean);
    const views = await cachedByKey(`${CACHE_PREFIX}-pageviews`, titles, (missing) => czechPageviews(missing, { parallel: 3 }));
    return { dances, ballets, musicals, classDances: new Set(classDances), classBallets: new Set(classBallets), resolved, details, labels, views };
};

// --- Tance: ruční údaje (Wikidata mají zemi původu, takt a druh jen u části tanců) ---
// název článku → [druh, stát původu (QID v data/countries.json, null = nejasný), takt]
const STANDARD = 'standardní tanec';
const LATIN = 'latinskoamerický tanec';
const SWING = 'swingový tanec';
const FOLK = 'lidový tanec';
const HISTORIC = 'historický tanec';
const MODERN = 'moderní tanec';
const RITUAL = 'obřadní tanec';
const SOCIAL = 'společenský tanec';
const DANCES = {
    'Valčík': [STANDARD, 'Q40', '3/4'], 'Tango (tanec)': [STANDARD, 'Q414', '2/4'], 'Slowfox': [STANDARD, 'Q145', '4/4'], 'Quickstep': [STANDARD, 'Q145', '4/4'],
    'Foxtrot': [STANDARD, 'Q30', '4/4'],
    'Cha-cha': [LATIN, 'Q241', '4/4'], 'Rumba': [LATIN, 'Q241', '4/4'], 'Samba (tanec)': [LATIN, 'Q155', '2/4'], 'Paso doble': [LATIN, 'Q29', '2/4'],
    'Jive': [LATIN, 'Q30', '4/4'], 'Salsa (tanec)': [LATIN, null, '4/4'], 'Mambo (tanec)': [LATIN, 'Q241', '4/4'], 'Merengue': [LATIN, 'Q786', '2/4'],
    'Bachata (taneční styl)': [LATIN, 'Q786', '4/4'], 'Lambada': [LATIN, 'Q155'], 'Pachanga': [LATIN, 'Q241'], 'Kizomba': [SOCIAL, 'Q916'],
    'Charleston (tanec)': [SWING, 'Q30', '4/4'], 'Lindy hop': [SWING, 'Q30', '4/4'], 'Boogie-woogie (tanec)': [SWING, 'Q30'],
    'Black Bottom': [SWING, 'Q30'], 'Akrobatický rock and roll': [SWING, null], 'Twist': [SOCIAL, 'Q30', '4/4'], 'Letkis': [SOCIAL, 'Q33'],
    'Ptačí tanec': [SOCIAL, 'Q39'],
    'Polka': [FOLK, 'Q213', '2/4'], 'Furiant': [FOLK, 'Q213', '3/4'], 'Česká beseda': [FOLK, 'Q213'], 'Slovácký verbuňk': [FOLK, 'Q213'],
    'Sousedská': [FOLK, 'Q213', '3/4'],
    'Mazurka': [FOLK, 'Q36', '3/4'], 'Polonéza': [FOLK, 'Q36', '3/4'], 'Čardáš': [FOLK, 'Q28', '2/4'], 'Hopak': [FOLK, 'Q212', '2/4'],
    'Tarantela': [FOLK, 'Q38', '6/8'], 'Sirtaki': [FOLK, 'Q41'], 'Flamenco': [FOLK, 'Q29'], 'Lendler': [FOLK, 'Q40', '3/4'], 'Šotyš': [SOCIAL, null],
    'Irské tance': [FOLK, 'Q27'], 'Morris dance': [FOLK, 'Q145'], 'Hornpipe': [FOLK, 'Q145'], 'Farandola': [FOLK, 'Q142', '6/8'],
    'Călușari': [RITUAL, 'Q218'], 'Humppa': [SOCIAL, 'Q33'],
    'Menuet': [HISTORIC, 'Q142', '3/4'], 'Gavota': [HISTORIC, 'Q142'], 'Bourrée': [HISTORIC, 'Q142'], 'Courante': [HISTORIC, 'Q142'],
    'Sarabanda': [HISTORIC, null, '3/4'], 'Allemanda': [HISTORIC, 'Q183', '4/4'], 'Gigue': [HISTORIC, null, '6/8'], 'Pavana': [HISTORIC, null, '2/2'],
    'Galliarda': [HISTORIC, null, '3/4'], 'Čtverylka': [HISTORIC, 'Q142'], 'Cotillion': [HISTORIC, 'Q142'],
    'Kankán': ['kabaretní tanec', 'Q142', '2/4'],
    'Step (tanec)': [MODERN, 'Q30'], 'Moderní scénický tanec': ['scénický tanec', null],
    'Haka': [RITUAL, 'Q664'], 'Lví tanec': [RITUAL, 'Q148'], 'Kandyjský tanec': [RITUAL, 'Q854'], 'Zaouli': [RITUAL, 'Q1008'], 'Tahtíb': [FOLK, 'Q79'],
    'Capoeira': ['bojový tanec', 'Q155']
};
// Popis tance, který ve Wikidatech chybí, je chybný (Quickstep „ve 3/4 taktu“) nebo by prozradil odpověď
const DANCE_DESCRIPTIONS = {
    'Quickstep': 'rychlý společenský standardní tanec s poskoky, který vznikl ve 20. letech v Anglii',
    'Valčík': 'společenský standardní tanec, při kterém se páry plynule otáčejí',
    'Haka': 'tradiční válečný tanec, který předvádějí ragbisté před zápasem',
    'Česká beseda': 'společenský tanec čtyř párů, sestavený v 19. století z českých lidových tanců',
    'Sousedská': 'pomalý český lidový tanec v tříčtvrťovém taktu',
    'Step (tanec)': 'tanec, při kterém tanečník vyťukává rytmus kovovými plíšky na botách',
    'Menuet': 'elegantní dvorský tanec, oblíbený v 17. a 18. století',
    'Sirtaki': 'řecký tanec v řadě, který se postupně zrychluje, proslavený filmem z roku 1964',
    'Tango (tanec)': 'vášnivý párový standardní tanec s ostrými pohyby hlavy, původem z jihoamerických přístavů',
    'Samba (tanec)': 'rychlý latinskoamerický tanec, který vládne slavnému karnevalu',
    'Salsa (tanec)': 'živý latinskoamerický párový tanec z Karibiku a New Yorku',
    'Jive': 'rychlý a energický párový tanec z kategorie latinskoamerických tanců, odvozený od swingu',
    'Pachanga': 'tanec a hudební styl z Karibiku z přelomu 50. a 60. let',
    'Rumba': 'pomalý a smyslný latinskoamerický párový tanec',
    'Cha-cha': 'latinskoamerický tanec s charakteristickým trojitým krokem',
    'Foxtrot': 'společenský standardní tanec, který střídá pomalé a rychlé kroky',
    'Slowfox': 'pomalý a plynulý společenský standardní tanec původem z Velké Británie',
    'Lindy hop': 'swingový párový tanec z Harlemu s akrobatickými figurami',
    'Boogie-woogie (tanec)': 'rychlý párový tanec na stejnojmennou klavírní hudbu',
    'Morris dance': 'anglický lidový tanec se zvonečky na nohou a šátky či holemi',
    'Călușari': 'rumunský obřadní tanec mužů s holemi',
    'Polonéza': 'slavnostní promenádní tanec, kterým se tradičně zahajují plesy',
    'Lambada': 'svůdný párový tanec, který se proslavil koncem 80. let',
    'Merengue': 'párový tanec z Karibiku s pohyby boků',
    'Twist': 'tanec z přelomu 50. a 60. let, při kterém se tanečník kroutí v bocích',
    'Gavota': 'starý francouzský dvorský tanec ve dvoudobém taktu',
    'Allemanda': 'renesanční a barokní tanec, první věta barokní suity',
    'Gigue': 'rychlý tanec, obvykle poslední věta barokní suity',
    'Courante': 'barokní dvorský tanec, druhá věta suity',
    'Sarabanda': 'pomalý slavnostní tanec, věta barokní suity',
    'Bourrée': 'rychlý francouzský tanec ve dvoudobém taktu',
    'Pavana': 'pomalý slavnostní dvorský tanec 16. století',
    'Galliarda': 'živý renesanční tanec se skoky',
    'Šotyš': 'společenský párový tanec 19. století',
    'Hornpipe': 'živý lidový tanec britských námořníků',
    'Irské tance': 'tradiční tance s rychlou prací nohou a nehybným trupem',
    'Mambo (tanec)': 'rychlý latinskoamerický tanec, který se proslavil ve 40. a 50. letech',
    'Lví tanec': 'tradiční tanec, při kterém tanečníci v kostýmu zvířete napodobují jeho pohyby',
    'Čtverylka': 'historický tanec čtyř párů v čtverci',
    'Black Bottom': 'tanec z 20. let, který soupeřil s charlestonem',
    'Farandola': 'řetězový tanec, při kterém se tanečníci drží za ruce',
    'Kandyjský tanec': 'tradiční tanec z hornatého středu Srí Lanky',
    'Zaouli': 'maskovaný tanec z Afriky',
    'Tahtíb': 'tradiční tanec s holemi',
    'Humppa': 'rychlý tanec a styl taneční hudby ze severní Evropy',
    'Kizomba': 'smyslný párový tanec původem z Afriky',
    'Ptačí tanec': 'žertovný skupinový tanec s napodobováním ptáka',
    'Letkis': 'skupinový tanec z 60. let, při kterém tanečníci stojí v zástupu',
    'Akrobatický rock and roll': 'akrobatický párový tanec a soutěžní sport',
    'Moderní scénický tanec': 'výrazový tanec 20. století, který odmítl pravidla klasického baletu'
};
// Psané odpovědi navíc
const DANCE_ALIASES = { 'Sirtaki': ['Zorba'], 'Cha-cha': ['Cha-cha-cha', 'Čača'], 'Kankán': ['Can-can', 'Cancan'],
    'Step': ['Stepování', 'Stepařský tanec'], 'Slovácký verbuňk': ['Verbuňk'], 'Polonéza': ['Polonaise'], 'Čtverylka': ['Quadrilla', 'Kadrila'] };
// Tance, které zná skoro každý (taneční kurzy, StarDance), i s menší návštěvností článku; a tance, které známé nejsou (návštěvnost
// nafoukla móda či školní referáty)
const DANCES_KNOWN = new Set(['Sirtaki', 'Twist', 'Tarantela', 'Quickstep', 'Slowfox', 'Kankán', 'Haka', 'Capoeira', 'Česká beseda']);
const DANCES_NOT_KNOWN = new Set(['Moderní scénický tanec', 'Furiant']);

// --- Balety: ruční údaje k údajům z Wikidat ---
// název článku → { y: rok premiéry, d: popis }, kde Wikidata rok nemají nebo popis prozradí odpověď
const BALLET_FIX = {
    'Kamenný kvítek': { y: 1954, d: 'poslední balet Sergeje Prokofjeva na motivy uralských pohádek' },
    'Istar': { y: 1924, d: 'balet Bohuslava Martinů na motivy babylonské báje o bohyni lásky' },
    'Hašiš (balet)': { y: 1884 },
    'Pas de Quatre (balet)': { y: 1845 },
    'Rudý mák': { d: 'sovětský balet Reinholda Gliera o čínské tanečnici a sovětských námořnících' }
};
// Balety, které do kategorie nepatří: divadelní hry s hudbou (literatura), opery, část opery, koncertní skladba, název opery
// (Romeo a Julie – Gounodova opera je v datech), jevištní díla, která v datech už jsou, málo známé
const NOT_BALLET = new Set(['Zdravý nemocný', 'Měšťák šlechticem', 'Jiří Dudek aneb Napálený manžel', 'Pán z Prasečkova', 'Skvělí milenci',
    'Psyché (divadelní hra)', 'Víly (Puccini)', 'Platée', 'Ohnivý anděl (opera)', 'Balet jeptišek', 'La Valse', 'Sadler\'s Wells Theatre', 'Baletní soubor',
    'Pták Ohnivák', 'Rio Grande (skladba)', 'Zlomené srdce', 'Nico (balet)', 'Iphigenia in Tauris (balet)', 'Songs for Drella (balet)',
    'Les Indes galantes', 'Dafnis a Amaltheia', 'Opéra-ballet', 'Dvorní balet', 'Romeo a Julie (balet)', 'Příběh vojáka (Stravinskij)',
    'Marná opatrnost', 'Česká svatba', 'Pohádka o nalezeném štěstí', 'Ballet de la Nuit']);

// Obrázky, které položku neukazují (ověřeno náhledem): portrét skladatele (Istar, Špalíček), poštovní známka (Rudý mák), dračí tanec
// místo lvího (Lví tanec)
const NO_PHOTO = new Set(['Istar', 'Špalíček (Martinů)', 'Rudý mák', 'Lví tanec']);
const photoOf = (detail) => NO_PHOTO.has(detail.t) ? {} : imageFields(detail.im && detail.im[0]);

// --- Muzikály: ruční údaje ---
// název článku → { by: autor hudby (QID), y: rok premiéry, d: popis }, kde Wikidata autora, rok či popis nemají
const MUSICAL_FIX = {
    'Kleopatra (muzikál)': { by: ['Q3506625'], y: 2002, d: 'český muzikál o poslední egyptské královně' },
    'Touha (muzikál)': { by: ['Q159250'] }
};
// Muzikály, které vynecháme: amatérské a internetové muzikály, píseň z muzikálu, album, rozhlasový pořad, divadelní hra, seznam
const NOT_MUSICAL = /^(A Very Potter|Starship \(muzikál\)|I Am What I Am|Aida a jiné klenoty|Vlkův sen|Nebe na zemi|Seznam muzikálů|Bídníci \(Městské divadlo Brno\)|Klan Baťa|Kategorie:|Tři mušketýři \(muzikál\)|Malý princ|Mefisto)/u;

// --- Sestavení nových položek ---
const THIS_YEAR = new Date().getFullYear();
const CZ_STATES = new Set(['Q213', 'Q33946', 'Q42585']);
const nameKey = (name) => name.toLocaleLowerCase('cs').replace(/^the /u, '');
// Název z článku české Wikipedie bez upřesnění v závorce (Tango (tanec) → Tango)
const nameOf = (title) => title.replace(/\s*\([^)]*\)\s*$/u, '').trim();
const yearsOf = (list) => (list || []).map(yearOf).filter(year => year !== undefined && year > 1000 && year <= THIS_YEAR);
const firstYear = (...lists) => { for (const list of lists) { const years = yearsOf(list); if (years.length) return Math.min(...years); } return undefined; };
// Data ostatních témat: QID (žádná položka nesmí být ve dvou tématech) a názvy filmů (muzikál stejného jména jako film by se pletl)
export const otherTopics = (dataDir, own = 'hudba.json') => {
    const ids = new Map();
    const filmNames = new Set();
    for (const file of readdirSync(dataDir)) {
        if (!file.endsWith('.json') || file === own) continue;
        let data;
        try { data = JSON.parse(readFileSync(new URL(file, dataDir), 'utf8')); } catch { continue; }
        for (const item of Array.isArray(data.items) ? data.items : []) {
            if (item && typeof item.q === 'string') ids.set(item.q, file.replace(/\.json$/u, ''));
            if (file === 'film.json' && item && item.n) filmNames.add(nameKey(item.n));
        }
    }
    return { ids, filmNames };
};

// existing = položky data/hudba.json; others = otherTopics(); vrací { items, skipped }
export const buildExtra = (extra, { existing, others }) => {
    const countries = readCountries();
    const { details, labels, views } = extra;
    const label = (qid) => { const entry = labels[qid] || {}; return entry.cs || entry.mul || entry.en; };
    const byQ = new Map(existing.map(item => [item.q, item]));
    const existingNames = new Set(existing.map(item => nameKey(item.n)));
    const people = new Map(existing.filter(item => ['skladatele', 'hudebnici', 'kapely'].includes(item.c)).map(item => [item.q, item]));
    const skipped = [];
    const items = [];
    const taken = new Set();
    const accept = (qid, detail, name, why) => {
        if (byQ.has(qid)) return false;
        const reason = others.ids.has(qid) ? `už v tématu ${others.ids.get(qid)}` : existingNames.has(nameKey(name)) || taken.has(nameKey(name)) ? 'jméno už v tématu' : why;
        if (reason) { skipped.push([reason, detail.t || qid]); return false; }
        taken.add(nameKey(name));
        return true;
    };
    const base = (qid, detail, category) => ({ q: qid, t: detail.t, n: nameOf(detail.t), c: category, k: 0, _: { sl: Number(detail.sl) || 0, pv: views[detail.t] || 0 } });
    // Autor hudby: jediný skladatel, který je v tématu (u díla s víc autory jen jména)
    const authorOf = (composers) => {
        const list = [...new Set(composers || [])];
        const named = list.map(qid => (people.get(qid) || {}).n || label(qid)).filter(Boolean);
        if (!named.length || named.length > 3) return null;
        return { by: named.join(', '), byq: list.length === 1 && people.has(list[0]) ? list[0] : undefined };
    };
    const countryOf = (detail) => (detail.co || []).map(qid => CZ_STATES.has(qid) ? 'Q213' : qid).find(qid => countries[qid]);

    // Balety
    const balletIds = [...new Set([...extra.ballets.keys(), ...extra.classBallets])];
    for (const qid of balletIds) {
        const detail = details[qid] || {};
        if (!detail.t || byQ.has(qid) || NOT_BALLET.has(detail.t)) continue;
        const types = (detail.type || []).map(label).join('/');
        if ((detail.type || []).includes('Q5') || !/balet|choreographic/u.test(`${types} ${detail.d || ''}`)) { skipped.push(['balet: druh', detail.t]); continue; }
        const fix = BALLET_FIX[detail.t] || {};
        const year = fix.y ?? firstYear(detail.premiere, detail.made, detail.pub);
        const author = authorOf(detail.composer);
        if (!author || year === undefined) { skipped.push(['balet bez autora či roku', detail.t]); continue; }
        const item = base(qid, detail, 'tance');
        if (!accept(qid, detail, item.n)) continue;
        const authorItem = author.byq ? people.get(author.byq) : null;
        const co = countryOf(detail);
        item.ty = 'balet';
        item.d = fix.d || detail.d || `balet z roku ${year}`;
        if (authorItem && authorItem.cz === 1) item.cz = 1;
        Object.assign(item, photoOf(detail));
        item.f = compact({ year, by: author.by, byq: author.byq, kind: 'skladba',
            land: co ? countries[co].name : authorItem ? authorItem.f.land : undefined,
            lib: (detail.libretto || []).length === 1 ? label(detail.libretto[0]) : undefined, y: year });
        items.push(item);
    }

    // Tance
    const danceIds = [...new Set([...extra.dances.keys(), ...extra.classDances, ...Object.values(extra.resolved).filter(Boolean)])];
    for (const qid of danceIds) {
        const detail = details[qid] || {};
        const rule = detail.t && DANCES[detail.t];
        if (!rule) continue;
        const [kind, co, takt] = rule;
        const item = base(qid, detail, 'tance');
        if (!accept(qid, detail, item.n)) continue;
        item.ty = kind;
        item.d = DANCE_DESCRIPTIONS[detail.t] || detail.d || kind;
        if (co === 'Q213') item.cz = 1;
        Object.assign(item, photoOf(detail));
        const year = firstYear(detail.made);
        if (DANCE_ALIASES[item.n]) item.al = DANCE_ALIASES[item.n];
        item.f = compact({ co: co || undefined, land: co ? countries[co].name : undefined, takt, year, y: year });
        items.push(item);
    }
    const unknownDances = danceIds.map(qid => (details[qid] || {}).t).filter(title => title && !DANCES[title]);

    // Muzikály (do kategorie Opery a muzikály)
    const musicalIds = [...new Set([...extra.musicals.keys(), ...Object.values(extra.resolved).filter(Boolean)])];
    for (const qid of musicalIds) {
        const detail = details[qid] || {};
        if (!detail.t || byQ.has(qid) || NOT_MUSICAL.test(detail.t) || DANCES[detail.t] || (views[detail.t] || 0) < 100) continue;
        const types = (detail.type || []).join(' ');
        const isMusical = /muzikál|rocková opera/u.test(`${detail.d || ''} ${detail.t}`) || (/Q58483083/u.test(types) && extra.musicals.has(qid));
        if (!isMusical || /film|seriál|píseň|album/u.test(detail.d || '')) continue;
        const fix = MUSICAL_FIX[detail.t] || {};
        const year = fix.y ?? firstYear(detail.premiere, detail.made, detail.pub);
        const author = authorOf(fix.by || detail.composer);
        if (!author || year === undefined) { skipped.push(['muzikál bez autora či roku', detail.t]); continue; }
        const item = base(qid, detail, 'opery');
        if (others.filmNames.has(nameKey(item.n))) { skipped.push(['muzikál se jménem filmu', detail.t]); continue; }
        if (!accept(qid, detail, item.n)) continue;
        const authorItem = author.byq ? people.get(author.byq) : null;
        const co = countryOf(detail);
        item.ty = 'muzikál';
        if ((co === 'Q213') || (authorItem && authorItem.cz === 1 && !co) || /^česk/iu.test(detail.d || '')) item.cz = 1;
        const land = co ? countries[co].name : authorItem ? authorItem.f.land : undefined;
        const adjective = { 'Spojené státy americké': 'americký', 'Spojené království': 'britský', 'Česko': 'český', 'Francie': 'francouzský', 'Německo': 'německý', 'Rakousko': 'rakouský' }[land];
        item.d = fix.d || (detail.d && detail.d !== 'muzikál' ? detail.d : `${adjective ? `${adjective} ` : ''}muzikál z roku ${year}`);
        Object.assign(item, photoOf(detail));
        item.f = compact({ year, by: author.by, byq: author.byq, kind: 'skladba', land,
            lib: (detail.libretto || []).length === 1 ? label(detail.libretto[0]) : undefined, y: year });
        items.push(item);
    }
    return { items, skipped, unknownDances };
};

// --- Okruhy ---
const DANCE_GROUPS = {
    'spolecenske-tance': [STANDARD, LATIN, SWING, SOCIAL],
    'lidove-tance': [FOLK, RITUAL, 'bojový tanec'],
    'historicke-tance': [HISTORIC, 'kabaretní tanec']
};
// Polonéza je lidový tanec i slavnostní dvorský a plesový tanec
const ALSO_HISTORIC = new Set(['Polonéza']);
export const isBallet = (item) => item.ty === 'balet';
const groupsOf = (item) => {
    const groups = [];
    if (item.c === 'tance' && isBallet(item)) groups.push('balety', 'balet-a-muzikal');
    if (item.c === 'tance' && !isBallet(item)) {
        for (const [group, kinds] of Object.entries(DANCE_GROUPS)) if (kinds.includes(item.ty)) groups.push(group);
        if (ALSO_HISTORIC.has(item.n)) groups.push('historicke-tance');
    }
    if (item.c === 'opery') groups.push('muzikaly', 'balet-a-muzikal');
    if (item.cz === 1 && (item.c === 'opery' || isBallet(item))) groups.push('ceska-dila');
    if (item.cz === 1 && item.c === 'opery') groups.push('ceske-opery');
    return groups;
};

// --- Úrovně nových položek ---
// Známé: tance s návštěvností českého článku aspoň 2000 za rok nebo aspoň 45 jazykovými verzemi (a DANCES_KNOWN), muzikály od 4000
// (jako známé muzikály v datech: Chicago 3500, Monte Cristo 3000 – ale Děti ráje se 7000 známé nejsou), balety od 3000 a 30 verzí
// (Coppélia s 5500 a Giselle s 3000 známé nejsou). Okruh od 8 položek má aspoň max(3, 25 %) známých: chybějící se doplní nejznámějšími.
// Expert: nejméně známá třetina skupiny (u českých pětina) podle pořadí jazykových verzí a návštěvnosti; okruh nejvýš 40 % expertů.
const KNOWN_RULES = {
    tanec: (item) => DANCES_KNOWN.has(item.n) || ((item._.pv >= 2000 || item._.sl >= 45) && !DANCES_NOT_KNOWN.has(item.n)),
    balet: (item) => item._.pv >= 3000 && item._.sl >= 30,
    'muzikál': (item) => item._.pv >= 4000
};
const OKRUH_EXPERT = 0.4;
const poolOf = (item) => `${isBallet(item) ? 'balet' : item.c === 'opery' ? 'muzikál' : 'tanec'}|${item.cz ? 'cz' : 'svet'}`;
const fame = (list) => {
    const rank = (key) => new Map([...list].sort((a, b) => b._[key] - a._[key]).map((item, index) => [item, list.length > 1 ? index / (list.length - 1) : 0]));
    const bySl = rank('sl');
    const byPv = rank('pv');
    return new Map(list.map(item => [item, (bySl.get(item) + byPv.get(item)) / 2]));
};
export const assignExtraLevels = (fresh, all) => {
    const pools = new Map();
    for (const item of fresh) {
        delete item.x;
        item.k = KNOWN_RULES[poolOf(item).split('|')[0]](item) ? 1 : 0;
        if (!pools.has(poolOf(item))) pools.set(poolOf(item), []);
        pools.get(poolOf(item)).push(item);
    }
    const pct = new Map();
    for (const list of pools.values()) for (const [item, value] of fame(list)) pct.set(item, value);
    const freshIds = new Set(fresh.map(item => item.q));
    const members = (group) => all.filter(item => (item.g || []).includes(group));
    const groups = [...new Set(fresh.flatMap(item => item.g || []))];
    const promoted = [];
    for (const group of groups) {
        const list = members(group);
        const need = knownFloor(list.length);
        let known = list.filter(item => item.k === 1).length;
        for (const item of fresh.filter(other => (other.g || []).includes(group) && !other.k && !DANCES_NOT_KNOWN.has(other.n)).sort((a, b) => pct.get(a) - pct.get(b))) {
            if (known >= need) break;
            item.k = 1;
            known++;
            promoted.push(`${group}: ${item.n}`);
        }
    }
    for (const [pool, list] of pools) {
        const share = pool.endsWith('|cz') ? 0.2 : 0.33;
        const rest = list.filter(item => !item.k).sort((a, b) => pct.get(b) - pct.get(a));
        rest.slice(0, Math.round(list.length * share)).forEach(item => { item.x = 1; });
    }
    for (const group of groups) {
        const list = members(group);
        const excess = list.filter(item => item.x).length - Math.floor(list.length * OKRUH_EXPERT);
        const movable = fresh.filter(item => item.x && (item.g || []).includes(group) && freshIds.has(item.q)).sort((a, b) => pct.get(a) - pct.get(b));
        for (const item of movable.slice(0, Math.max(0, excess))) delete item.x;
    }
    return promoted;
};

// Sloučí rozšíření do dat tématu: nové položky na konec, okruhy na konec seznamu, existujícím baletům okruh Balety (id, kategorie
// a úroveň zůstanou). Položky, které v datech už jsou (i z dřívějšího běhu rozšíření), se nemění – buildExtra je přeskočí.
export const mergeExtra = ({ collections, items }, extra) => {
    const existing = new Set(items.map(item => item.q));
    for (const item of items) {
        if (item.c === 'dila' && isBallet(item) && !(item.g || []).includes('balety')) item.g = [...(item.g || []), 'balety'];
    }
    const fresh = extra.items.filter(item => !existing.has(item.q));
    for (const item of fresh) {
        const groups = groupsOf(item);
        if (groups.length) item.g = groups;
    }
    const all = [...items, ...fresh];
    const promoted = assignExtraLevels(fresh, all);
    for (const item of fresh) delete item._;
    const ids = new Set(DANCE_COLLECTIONS.map(collection => collection.id));
    return { collections: [...collections.filter(collection => !ids.has(collection.id)), ...DANCE_COLLECTIONS], items: all, promoted };
};

export const extraSummary = (items) => {
    const lines = [];
    const line = (label, list) => lines.push(`${label}: ${list.length} (známých ${list.filter(item => item.k === 1).length}, expert ${list.filter(item => item.x).length})`);
    line('tance – balety', items.filter(item => item.c === 'tance' && isBallet(item)));
    line('tance – tance', items.filter(item => item.c === 'tance' && !isBallet(item)));
    line('opery – muzikály', items.filter(item => item.c === 'opery' && item.ty === 'muzikál'));
    for (const collection of DANCE_COLLECTIONS) line(`  okruh ${collection.id}`, items.filter(item => (item.g || []).includes(collection.id)));
    return lines;
};
