// Téma Mytologie: data/mytologie.json z Wikidat – bohové a hrdinové řecké a římské, egyptské, severské a slovanské
// mytologie, postavy Starých pověstí českých a bájné bytosti
// Spuštění: npm run build:mytologie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { qlever, sparql, id, values, imageFields, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';
import { cachedByKey } from './lib/zemepis-levels.mjs';
import { topicPageviews, assignLevels, levelGroups, levelSummary } from './lib/fame-levels.mjs';
import { categoryMembers, FORCED_SOURCES, FORCED_EXCLUDE, FORCED_LISTS, FORCED_CREATURES, FORCED_OBJECTS, NAME_OVERRIDES } from './lib/mytologie-sources.mjs';

// QLever, a když je přetížený, query.wikidata.org (WIKIDATA_ENDPOINT=wdqs rovnou query.wikidata.org)
const run = process.env.WIKIDATA_ENDPOINT === 'wdqs' ? (query) => sparql(query) : (query) => qlever(query, 2).catch(() => sparql(query));
const ALT_LABEL = '<http://www.w3.org/2004/02/skos/core#altLabel>';
const FEMALE = 'Q6581072';
const HUMAN = 'Q5';

// Mytologie: podle třídy (řecké božstvo…) a podle P1049 (uctíván v), P361 (součást), P1080 (z fikčního světa)
const OLYMPIAN_CLASS = 'Q113103481';
const JOTUNN = ['Q1632426', 'Q24267081'];
const MYTHOLOGIES = {
    recka: { label: 'řecká', ids: ['Q34726', 'Q855270'], classes: ['Q22988604', 'Q22989102', 'Q23015925', 'Q45713', OLYMPIAN_CLASS] },
    rimska: { label: 'římská', ids: ['Q122173', 'Q337547'], classes: ['Q11688446'] },
    egyptska: { label: 'egyptská', ids: ['Q205740'], classes: ['Q146083'] },
    severska: { label: 'severská', ids: ['Q128285', 'Q121617'], classes: ['Q16513881', ...JOTUNN] },
    slovanska: { label: 'slovanská', ids: ['Q201571'], classes: ['Q4436935'] },
    // Další mytologie vybírají kategorie české Wikipedie a ruční seznamy (lib/mytologie-sources.mjs), ne třídy z Wikidat
    indicka: { label: 'indická', ids: [], classes: [] },
    keltska: { label: 'keltská', ids: [], classes: [] },
    artus: { label: 'artušovské legendy', ids: [], classes: [] },
    japonska: { label: 'japonská', ids: [], classes: [] },
    cinska: { label: 'čínská', ids: [], classes: [] },
    mezopotamska: { label: 'mezopotámská', ids: [], classes: [] },
    kanaanska: { label: 'kanaánská', ids: [], classes: [] },
    perska: { label: 'perská', ids: [], classes: [] },
    aztecka: { label: 'aztécká', ids: [], classes: [] },
    mayska: { label: 'mayská', ids: [], classes: [] },
    incka: { label: 'incká', ids: [], classes: [] },
    biblicka: { label: 'židovsko-křesťanská', ids: [], classes: [] }
};
const DEITY_CLASSES = ['Q22989102', 'Q11688446', 'Q146083', 'Q16513881', 'Q4436935', 'Q178885', OLYMPIAN_CLASS];
const TITAN = 'Q45713';
const OLYMPIANS = 'Q101609';
const MUSES = 'Q66016';

// Staré pověsti české a další české pověsti (podle názvu článku); Šárka článek o bájné postavě nemá (jen o jménu)
const CZECH_LEGENDS = ['Praotec Čech', 'Krok (vojvoda)', 'Libuše (kněžna)', 'Kazi', 'Teta (mytologie)', 'Přemysl Oráč', 'Bivoj',
    'Vlasta (mytologie)', 'Horymír (vladyka)', 'Šemík', 'Bruncvík', 'Golem', 'Krakonoš', 'Neklan', 'Lumír (bájný pěvec)', 'Křesomysl',
    'Nezamysl', 'Mnata', 'Vojen', 'Vnislav', 'Hostivít', 'Ječmínek',
    // Pověsti o Praze a o hradech (rabi Löw a golem, orlojník Hanuš, kouzelník Žito, rytíř Dalibor)
    'Jehuda ben Becalel', 'Mistr Hanuš', 'Žito (kouzelník)', 'Dalibor z Kozojed'];
// Bájná knížata z výčtu Přemyslovců po Přemyslu Oráči zná málokdo – nejsou mezi známými
const OBSCURE_CZECH = new Set(['Křesomysl', 'Nezamysl', 'Mnata', 'Vojen', 'Vnislav', 'Hostivít', 'Ječmínek', 'Lumír (bájný pěvec)', 'Plivník', 'Žito (kouzelník)', 'Rarášek', 'Světlonoš', 'Ohnivý muž']);
const SLAVIC_GODS = ['Perun', 'Veles', 'Mokoš', 'Svarog', 'Dažbog', 'Stribog', 'Svantovít', 'Triglav (bůh)', 'Morana', 'Jarilo', 'Černoboh',
    'Bělboh', 'Radegast', 'Lada (bohyně)', 'Živa (mytologie)', 'Chors', 'Simargl', 'Svarožic'];
const CZECH_CREATURES = ['Vodník', 'Polednice', 'Bludička', 'Hejkal', 'Ježibaba', 'Skřítek (mytologie)', 'Permoník', 'Čert', 'Bílá paní', 'Plivník', 'Meluzína (mytologie)',
    'Fext', 'Ohnivý muž', 'Světlonoš', 'Rarášek'];
const SLAVIC_CREATURES = ['Rusalka', 'Víla', 'Baba Jaga', 'Kikimora', 'Domovoj', 'Lešij', 'Kostěj', 'Zmej', 'Pták Ohnivák', 'Polevik', 'Vlkodlak', 'Karzelek', 'Můra (mytologie)'];
const OTHER_CREATURES = ['Drak', 'Jednorožec', 'Gryf', 'Fénix', 'Kraken', 'Kentaur', 'Satyr', 'Faun', 'Kyklop', 'Trpaslík', 'Elf', 'Troll (severská mytologie)',
    'Obr', 'Siréna (mytologie)', 'Harpyje', 'Sfinx', 'Mínótauros', 'Pegas', 'Kerberos', 'Medúsa', 'Hydra (mytologie)', 'Chiméra (mytologie)', 'Bazilišek',
    'Upír (nemrtvý)', 'Valkýra', 'Sleipnir', 'Fenrir', 'Jörmungandr', 'Nemejský lev', 'Skylla', 'Gorgony', 'Echidna', 'Pýthón', 'Ládón',
    'Krétský býk', 'Hippocampus (mytologie)', 'Amemait', 'Apop', 'Níðhöggr', 'Ratatosk', 'Hugin a Munin', 'Geri a Freki', 'Audhumla', 'Garm', 'Orthos', 'Kampé',
    'Empúsa', 'Lamia (řecká mytologie)', 'Mořská panna'];
// Tituly, které v prvním dotazu na kandidáty nebyly (doplněné později)
const EXTRA_TITLES = ['Ječmínek', 'Mořská panna'];
// Mytologie bytostí ručně: ve Wikidatech chybí nebo je sporná (sfinga je egyptská i řecká)
const CREATURE_MYTHOLOGY = { Kentaur: ['recka'], Kyklop: ['recka'], Satyr: ['recka'], Faun: ['rimska'], 'Troll (severská mytologie)': ['severska'],
    Sfinx: ['recka', 'egyptska'], Gryf: [], Fénix: [], 'Mořská panna': [], Bazilišek: [], Jednorožec: [], Drak: [], Obr: [], Kraken: ['severska'] };
// Nejsou to postavy ani bytosti (místa, předměty, národy, pojmy) nebo jsou sporné (Lucifer je spíš ďábel)
const EXCLUDED = new Set(['Lucifer', 'Jablko sváru', 'Gaius Mucius Scaevola', 'Egyptská představa člověka', 'Staroegyptská představa člověka', 'Urdina studna',
    'Mímiho studna', 'Pelasgové', 'Arimaspové', 'Androfágové', 'Gargareáni', 'Titán', 'Kamény', 'Wendigo', 'Astarte', 'Aštarté', 'Anat', 'Bríseovna',
    // Caissa je bohyně šachu z básně 18. století, Agis I. spartský král, Penáti skupina bohů; Sabazios a Agdistis jsou frýžští, ne řečtí bohové
    'Caissa', 'Agis I.', 'Penáti', 'Sabazios', 'Agdistis']);
// Postavy bez třídy s českým názvem (Ymir je ve Wikidatech jen „jötunn“)
const FORCE_FIGURE = new Set(['Ymir']);
// Slavní hrdinové řeckých bájí (Wikidata je mají jen jako „postavu řecké mytologie“)
const HEROES = new Set(['Achilles', 'Odysseus', 'Héraklés', 'Perseus', 'Théseus', 'Iásón', 'Hektór', 'Aineiás', 'Orfeus', 'Bellerofontés', 'Agamemnón',
    'Meneláos', 'Paris', 'Aiás', 'Patroklos', 'Diomédes', 'Meleagros', 'Kadmos', 'Atalanta', 'Nestór', 'Peleus', 'Péleus', 'Télemachos', 'Filoktétés',
    'Neoptolemos', 'Ilja Muromec', 'Dobryňa Nikitič', 'Aljoša Popovič', 'Sadko',
    // další hrdinové bájí (thébské, argonauti, trojská válka)
    'Oidipus', 'Orestés', 'Peirithoos', 'Admétos', 'Pelops', 'Ídomeneus', 'Antilochos', 'Prótesiláos', 'Palamédés', 'Teukros', 'Tydeus', 'Amfiaraos',
    'Iolaos', 'Kastór', 'Polydeukés', 'Sarpédón', 'Tróilos', 'Rhésos']);
// Okruh hrdinů ze všech mytologií: kromě druhu „hrdina“ i ti, kdo jsou v datech postavou pověstí či mytickou postavou
// Devět světů na stromě Yggdrasil (a strom sám)
const NINE_WORLDS = new Set(['Ásgard', 'Vanaheim', 'Ljósálfheim', 'Midgard', 'Jötunheim', 'Svartálfheim', 'Niflheim', 'Múspellheim', 'Helheim', 'Yggdrasil']);
const WORLD_HEROES = new Set(['Gilgameš', 'Enkidu', 'Isfandijár', 'Keresáspa', 'Džamšíd', 'Rávana', 'Momotaró', 'Bivoj', 'Horymír', 'Bruncvík', 'Praotec Čech',
    'Romulus a Remus', 'Kovář Wieland', 'Brunhilda', 'Ráma', 'Ardžuna', 'Hanumán', 'Sun Wu-kchung']);
// Postavy trojské války (okruh)
// (a další postavy Íliady a trojské války podle Wikidat – položka troy)
const TROY = new Set(['Achilles', 'Hektór', 'Paris', 'Helena', 'Agamemnón', 'Meneláos', 'Odysseus', 'Aiás', 'Patroklos', 'Priamos', 'Kassandra', 'Aineiás',
    'Hekabé', 'Andromaché', 'Diomédes', 'Nestór', 'Láokoón', 'Ífigeneia', 'Klytaimnéstra', 'Filoktétés', 'Neoptolemos', 'Penthesilea', 'Memnón',
    'Thetis', 'Anchísés', 'Astyanax', 'Kalchás', 'Sinón', 'Déifobos', 'Helenos', 'Ídomeneus', 'Antilochos', 'Prótesiláos', 'Palamédés', 'Teukros',
    'Polyxena', 'Chrýseis', 'Sarpédón', 'Pandaros', 'Thersítés', 'Tróilos', 'Polydóros', 'Rhésos', 'Trójský kůň']);
// Dvanáct olympských bohů (a Hádés, který na Olympu nebydlí, ale k hlavním bohům patří)
const OLYMPIAN_NAMES = new Set(['Zeus', 'Héra', 'Poseidón', 'Démétér', 'Athéna', 'Apollón', 'Artemis', 'Arés', 'Afrodíté', 'Héfaistos', 'Hermés', 'Hestia', 'Dionýsos', 'Hádés']);
// Egyptské bohy česká Wikipedie píše egyptologicky (Usir, Anup), ve škole i v knihách jsou známější řecké tvary
const EGYPTIAN_NAMES = { Eset: 'Isis', Usir: 'Osiris', Anup: 'Anubis', Hor: 'Horus', Sutech: 'Seth', Thovt: 'Thoth', Re: 'Ra', Nebthet: 'Nefthys', Tveret: 'Taweret' };
// Další názvy z Wikidat, které patří jiné bytosti (klekánice, Apis) nebo by zakryly běžné slovo (éra)
const BAD_ALIASES = new Set(['Klekánice', 'Apis', 'Era', 'Gera', 'Héire', 'Mořské panny', 'Kyklopové', 'Skarbnik', 'Duch Gór', 'Liczyrzepa', 'Rzepiór', 'Rzepolicz', 'Karkonosz',
    // Bouřňák je pták, Kalydónský lov báje, Rhodos ostrov, Šejtan jiný ďábel (Šajtán) a anděl smrti je Azrael
    'Bouřňák', 'Kalydónský kanec', 'Kalydónský lov', 'Rhodos', 'Šejtan', 'Anděl smrti']);
// Psané odpovědi navíc: běžné kratší či počeštěné tvary
const MANUAL_ALIASES = { 'Přemysl Oráč': ['Přemysl'], 'Mínótauros': ['Minotaur'], Kerberos: ['Kerber'], 'Jehuda ben Becalel': ['Maharal'], 'Mistr Hanuš': ['Hanuš'],
    'Juraj Jánošík': ['Jánošík'], 'Dalibor z Kozojed': ['Dalibor'] };
// Chybné nebo chybějící pohlaví ve Wikidatech (Šu a Heh jsou bohové, Elpis a Ninkasi bohyně)
const MALE = new Set(['Šu', 'Heh', 'Hapi', 'Hemen', 'Bhaga', 'Pohvizd', 'Enkimdu']);
const FEMALE_FIX = new Set(['Elpis', 'Ninkasi', 'Sófrosyné']);
const CURATED_MYTHOLOGY = Object.fromEntries([
    ...Object.entries(CREATURE_MYTHOLOGY),
    ...SLAVIC_GODS.map(title => [title, ['slovanska']]), ...SLAVIC_CREATURES.map(title => [title, ['slovanska']]), ...CZECH_CREATURES.map(title => [title, ['slovanska']])
]);
const CREATURE_TITLES = new Set([...CZECH_CREATURES, ...SLAVIC_CREATURES, ...OTHER_CREATURES]);
// Bytosti, které patří víc mytologiím nebo lidovým pověstem celé Evropy – otázka „Ze které mytologie?“ se u nich neklade
const SHARED_CREATURES = new Set(['Drak', 'Jednorožec', 'Gryf', 'Fénix', 'Kraken', 'Trpaslík', 'Elf', 'Obr', 'Upír (nemrtvý)', 'Bazilišek', 'Vlkodlak', 'Satyr', 'Můra (mytologie)',
    'Faun', 'Čert', 'Bílá paní', 'Víla', 'Meluzína (mytologie)', 'Sfinx', 'Bludička', 'Skřítek (mytologie)', 'Mořská panna', 'Troll (severská mytologie)', 'Ježibaba',
    'Permoník', 'Hejkal', 'Plivník']);

// Řecké a římské protějšky (Wikidata je mají jen jako „podobné“ i s Indrou a Perunem) – ručně; Apollón je v obou stejný.
// Prvních 16 jsou klasické dvojice, na které se ptáme; ostatní jsou jen fakt
const COUNTERPARTS = [
    ['Zeus', 'Jupiter', ['Jova']], ['Héra', 'Juno', []], ['Poseidón', 'Neptun', ['Neptunus']], ['Athéna', 'Minerva', []], ['Arés', 'Mars', []],
    ['Afrodíté', 'Venuše', ['Venus']], ['Hermés', 'Merkur', ['Mercurius']], ['Artemis', 'Diana', []], ['Héfaistos', 'Vulkán', ['Vulcanus']],
    ['Hestia', 'Vesta', []], ['Démétér', 'Ceres', []], ['Dionýsos', 'Bakchus', ['Bacchus', 'Liber']], ['Hádés', 'Pluto', ['Pluton']],
    ['Erós', 'Amor', ['Kupido', 'Cupido', 'Cupid']], ['Kronos', 'Saturn', ['Saturnus']], ['Persefona', 'Proserpina', []], ['Gaia', 'Tellus', ['Terra']],
    ['Éós', 'Aurora', []], ['Seléné', 'Luna', []], ['Hélios', 'Sol', []], ['Níké', 'Victoria', ['Viktorie']], ['Týché', 'Fortuna', []],
    ['Hypnos', 'Somnus', []], ['Pan', 'Faunus', []], ['Eiréné', 'Pax', []], ['Enýó', 'Bellona', []], ['Héraklés', 'Herkules', ['Hercules']],
    ['Asklépios', 'Aesculapius', ['Eskulap']], ['Rheia', 'Ops', []], ['Úranos', 'Caelus', []], ['Létó', 'Latona', []], ['Hébé', 'Juventas', []],
    ['Thanatos', 'Mors', []]
];
const MAJOR_PAIRS = 16;

// Třídy, podle kterých položka je (nebo není) postava či bytost
const FIGURE = /božstv|bůh|bohyně|bohové|bozi|titán|postava|hrdin|polobůh|bytost|tvor|zvíře|kůň|pes|psi|had|drak|netvor|příšer|hybrid|humanoid|taxon|obr|nymf|múz|démon|duch|víla|lid$|druh|familiár|bohatýr|pták|entit|prapředek|personifikace|věšt|čaroděj|monstr|valkýr|vlk|býk|lev|kentaur|kyklop|satyr|oread|najád|dryád|ókeanovn|okeanovn|plejád|anemoi|gigant|potamoi/iu;
const NOT_FIGURE = /rozcestník|rodné jméno|příjmení|město|lokalita|válka|bitva|událost|náboženství|^\S+ mytologie$|říše|předmět|zbraň|strom|loď|planetka|souhvězdí|kniha|literární dílo|pojem|svět$|místo|hora|řeka|ostrov|kultura|epos|báseň/u;
const CREATURE = /bytost|tvor|zvíře|kůň|pes|psi|had|drak|netvor|příšer|hybrid|humanoidní druh|taxon|obr|lid$|familiár|pták|monstr|vlk|býk|lev|třída/u;
const HERO = /hrdin|polobůh|bohatýr/u;

// --- 1. krok: kandidáti ---
const CANDIDATE_MIN_SITELINKS = 12;
// Postavy Íliady a trojské války (P1441 vystupuje v díle, P607 účastník konfliktu) – i méně známé (Kalchás, Sinón, Déifobos)
const ILIAD = 'Q8275';
const TROJAN_WAR = 'Q42804';
const candidateList = await (async () => {
    const classes = Object.values(MYTHOLOGIES).flatMap(m => m.classes);
    const myths = Object.values(MYTHOLOGIES).flatMap(m => m.ids);
    const rows = await cached('mytologie-candidates-main', async () => (await run(`
SELECT DISTINCT ?item ?sl WHERE {
  { VALUES ?c { ${values(classes)} } ?item wdt:P31 ?c . }
  UNION { VALUES ?m { ${values(myths)} } ?item wdt:P1049|wdt:P361|wdt:P1080 ?m . }
  UNION { ?item wdt:P1441 wd:${ILIAD} . } UNION { ?item wdt:P607 wd:${TROJAN_WAR} . }
  ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${CANDIDATE_MIN_SITELINKS})
}`)).map(row => [id(row.item.value), { sl: Number(row.sl.value) }]));
    // Kurátorované názvy článků (české pověsti, slovanští bohové, bytosti) po názvech – nové se dostáhnou
    const curatedTitles = [...CZECH_LEGENDS, ...SLAVIC_GODS, ...CREATURE_TITLES];
    const curated = await cachedByKey('mytologie-curated-titles', curatedTitles, async (missing) => {
        const result = Object.fromEntries(missing.map(title => [title, null]));
        for (let i = 0; i < missing.length; i += 100) {
            for (const row of await run(titleQuery(missing.slice(i, i + 100)))) result[row.t.value] = [id(row.item.value), Number(row.sl.value)];
        }
        return result;
    });
    return [...rows, ...curatedTitles.filter(title => curated[title]).map(title => [curated[title][0], { sl: curated[title][1], title }])];
})();
function titleQuery(titles) {
    return `
SELECT ?item ?sl ?t WHERE {
  VALUES ?t { ${titles.map(title => `"${title}"@cs`).join(' ')} }
  ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t .
  ?item wikibase:sitelinks ?sl .
}`;
}
const extraByTitle = await cachedByKey('mytologie-extra-titles', EXTRA_TITLES, async (missing) => {
    const result = Object.fromEntries(missing.map(title => [title, null]));
    for (const row of await run(titleQuery(missing))) result[row.t.value] = [id(row.item.value), Number(row.sl.value)];
    return result;
});
const extraList = EXTRA_TITLES.filter(title => extraByTitle[title]).map(title => [extraByTitle[title][0], { sl: extraByTitle[title][1], title }]);
const candidates = new Map();
for (const [qid, entry] of [...candidateList, ...extraList]) candidates.set(qid, { ...(candidates.get(qid) || {}), ...entry });

// Kategorie české Wikipedie a ruční seznamy: postavy a bytosti dalších mytologií i méně známé řecké, římské a egyptské.
// Přebírá se jen to, co ještě není mezi kandidáty z Wikidat (jejich mytologie a druh se nemění)
// Mezipaměť po kategoriích a po názvech článků: nové položky ručních seznamů se dostáhnou, kategorie se znovu nestahují
const categoryLists = await cachedByKey('mytologie-categories', FORCED_SOURCES.map(source => source.cat), async (missing) => {
    const result = {};
    for (const category of missing) result[category] = await categoryMembers(category);
    return result;
});
const forcedList = await (async () => {
    const wanted = new Map();
    const want = (title, entry) => { if (!wanted.has(title) && !FORCED_EXCLUDE.has(title) && !/^Seznam /u.test(title)) wanted.set(title, entry); };
    // Ruční seznamy mají přednost před kategoriemi (Epona je keltská, ne řecká) a platí i pro kandidáty z Wikidat
    for (const list of FORCED_LISTS) for (const title of list.titles) want(title, { myths: list.myths, kind: 'figure', deity: list.deity, female: list.female, type: list.ty, manual: true, czech: list.czech });
    for (const [title, [type, myths]] of Object.entries(FORCED_CREATURES)) want(title, { myths, kind: 'creature', type, manual: true });
    for (const [title, [type, myths]] of Object.entries(FORCED_OBJECTS)) want(title, { myths, kind: 'object', type, manual: true });
    for (const source of FORCED_SOURCES) {
        for (const title of categoryLists[source.cat] || []) want(title, { myths: source.myths, kind: 'figure', deity: source.deity, female: source.female });
    }
    const byTitle = await cachedByKey('mytologie-titles', [...wanted.keys()], async (missing) => {
        const result = Object.fromEntries(missing.map(title => [title, null]));
        for (let i = 0; i < missing.length; i += 100) {
            for (const row of await run(titleQuery(missing.slice(i, i + 100)))) result[row.t.value] = [id(row.item.value), Number(row.sl.value)];
        }
        return result;
    });
    return [...wanted].filter(([title]) => byTitle[title]).map(([title, forced]) => [byTitle[title][0], { sl: byTitle[title][1], title, forced }]);
})();
for (const [qid, entry] of forcedList) if (entry.forced.manual || !candidates.has(qid)) candidates.set(qid, { ...(candidates.get(qid) || {}), ...entry });

// --- 2. krok: podrobnosti ---
const SINGLE = new Set(['t', 'n', 'd', 'im', 'sex', 'sl']);
const fetchDetails = async (qids) => {
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, 60, (batch) => `
SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(batch)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item ${ALT_LABEL} ?v FILTER(LANG(?v) = "cs") BIND("al" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("cls" AS ?p) }
  UNION { ?item wdt:P1049|wdt:P361|wdt:P1080 ?v BIND("myth" AS ?p) }
  UNION { ?item wdt:P2925 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("dom" AS ?p) }
  UNION { ?item wdt:P22 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("father" AS ?p) }
  UNION { ?item wdt:P25 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("mother" AS ?p) }
  UNION { ?item wdt:P3373 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("sib" AS ?p) }
  UNION { ?item wdt:P26 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("sp" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P1441|wdt:P607 ?v BIND("work" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (SINGLE.has(key)) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, run);
    return [...result];
};
const details = new Map([
    ...await (async () => {
        const qids = [...new Set(candidateList.map(([qid]) => qid))];
        const stored = await cachedByKey('mytologie-details-by-id', qids, async (missing) => Object.fromEntries(await fetchDetails(missing)));
        return qids.map(qid => [qid, stored[qid] || {}]);
    })(),
    ...await (async () => {
        const qids = extraList.map(([qid]) => qid);
        const stored = await cachedByKey('mytologie-extra-details-by-id', qids, async (missing) => Object.fromEntries(await fetchDetails(missing)));
        return qids.map(qid => [qid, stored[qid] || {}]);
    })(),
    ...await (async () => {
        const qids = forcedList.map(([qid]) => qid).filter(qid => candidates.get(qid).forced && !candidateList.some(([other]) => other === qid));
        const stored = await cachedByKey('mytologie-forced-details-by-id', qids, async (missing) => Object.fromEntries(await fetchDetails(missing)));
        return [...new Set(qids)].map(qid => [qid, stored[qid] || {}]);
    })()
]);

// Ikonografické symboly (P4185: blesk, orel, sova…) – česky
const symbols = new Map(Object.entries(await cachedByKey('mytologie-symbols-by-id', [...candidates.keys()], async (missing) => {
    const result = Object.fromEntries(missing.map(qid => [qid, []]));
    await inBatches(missing, 150, (batch) => `
SELECT ?item ?v WHERE { VALUES ?item { ${values(batch)} } ?item wdt:P4185 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") }`,
    (row) => {
        const qid = id(row.item.value);
        result[qid] = [...new Set([...(result[qid] || []), row.v.value])];
    }, run);
    return result;
})).filter(([, list]) => list.length));

// České názvy tříd
const classIds = new Set();
for (const detail of details.values()) for (const q of detail.cls || []) if (/^Q\d+$/.test(q)) classIds.add(q);
const classLabels = new Map(Object.entries(await cachedByKey('mytologie-classes-by-id', [...classIds], async (missing) => {
    const result = Object.fromEntries(missing.map(qid => [qid, '']));
    await inBatches(missing, 300, (qids) => `
SELECT ?item ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
    (row) => { result[id(row.item.value)] = row.v ? row.v.value : row.l.value; }, run);
    return result;
})).filter(([, label]) => label));

// --- 3. krok: položky ---
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const clean = (name) => capitalize(name.replace(/ \(.*\)$/, '').trim());
const counterpartOf = new Map();
for (const [index, [greek, roman, romanAliases]] of COUNTERPARTS.entries()) {
    const major = index < MAJOR_PAIRS;
    counterpartOf.set(greek, { name: roman, aliases: romanAliases, side: 'rimska', major });
    counterpartOf.set(roman, { name: greek, aliases: [], side: 'recka', major });
}
const romanByAlias = (name) => COUNTERPARTS.find(([, , romanAliases]) => romanAliases.includes(name));

const items = [];
for (const [qid, candidate] of candidates) {
    const detail = details.get(qid) || {};
    if (!detail.t) continue;
    const title = detail.t;
    const classes = detail.cls || [];
    const classNames = classes.map(q => classLabels.get(q) || '').filter(Boolean);
    const isCzechLegend = CZECH_LEGENDS.includes(title);
    const isCreatureTitle = CREATURE_TITLES.has(title);
    const curated = isCzechLegend || isCreatureTitle || title in CURATED_MYTHOLOGY;
    const olympian = (detail.myth || []).includes(OLYMPIANS) || classes.includes(OLYMPIAN_CLASS);
    const forced = candidate.forced;
    // Z kategorií a seznamů jen skutečný popis (ne rozcestník, jméno nebo skupinu); z kategorií navíc jen s fotkou,
    // ruční seznamy jsou vybrané po jednom (otázku nese úvod článku)
    if (forced && ((!detail.im && !forced.manual) || /rozcestník|křestní jméno|příjmení|moučník|hudební skupina|skupina(?! mytických bytostí)/u.test(`${detail.d || ''} ${classNames.filter(name => !forced.manual || !/skupina/u.test(name)).join(' ')}`))) continue;
    // Jen postavy a bytosti (ne místa, události, předměty a skupiny), lidé jen z pověstí
    if (!forced && !curated && !olympian && !FORCE_FIGURE.has(title) && !classes.some(q => JOTUNN.includes(q))) {
        if (classes.includes(HUMAN)) continue;
        if (!classNames.some(name => FIGURE.test(name)) || classNames.some(name => NOT_FIGURE.test(name) || /skupin/u.test(name))) continue;
    }
    const myths = new Set();
    for (const [key, mythology] of Object.entries(MYTHOLOGIES)) {
        if (classes.some(q => mythology.classes.includes(q)) || (detail.myth || []).some(q => mythology.ids.includes(q))) myths.add(key);
    }
    if (olympian) myths.add('recka');
    if (CURATED_MYTHOLOGY[title]) { myths.clear(); CURATED_MYTHOLOGY[title].forEach(key => myths.add(key)); }
    if (isCzechLegend) myths.clear();
    if (forced) { myths.clear(); forced.myths.forEach(key => myths.add(key)); }
    if (!forced && !isCzechLegend && !myths.size && !isCreatureTitle) continue;
    const isDeity = (forced && forced.kind === 'figure' && forced.deity) || olympian || classes.some(q => DEITY_CLASSES.includes(q)) || classNames.some(name => /božstv|^bůh$|^bohyně$/u.test(name)) || SLAVIC_GODS.includes(title);
    const isCreature = (forced && forced.kind === 'creature') || (!forced && isCreatureTitle) || (!(forced && forced.kind === 'object') && !isDeity && !isCzechLegend && classNames.some(name => CREATURE.test(name)) && !classes.some(q => JOTUNN.includes(q)) && title !== 'Sun Wu-kchung');
    // Kurátorované bytosti pod názvem článku (Domovoj, ne „Dědek“; Lešij, ne „Lesní mužík“)
    let name = isCreatureTitle || isCzechLegend || forced ? clean(title) : clean(detail.n || title);
    // Známější jméno, než má článek (Mjöllni → Mjölnir, Hapi (býk) → Apis)
    const renamed = NAME_OVERRIDES[title];
    const female = (detail.sex === FEMALE || (forced && forced.female && !detail.sex) || FEMALE_FIX.has(name)) && !MALE.has(name);
    if (!forced && (EXCLUDED.has(name) || EXCLUDED.has(title))) continue;
    const aliases = (detail.al || []).filter(alias => /^\p{Lu}/u.test(alias) && alias.split(' ').length <= 2 && alias.length >= 2);
    if (detail.n && clean(detail.n) !== name) aliases.push(clean(detail.n));
    if (renamed) {
        aliases.unshift(name);
        name = renamed;
    }
    if (EGYPTIAN_NAMES[name] && myths.has('egyptska')) {
        aliases.unshift(name);
        name = EGYPTIAN_NAMES[name];
    }
    // Římský bůh s latinským názvem dostane běžné české jméno (Vulcanus → Vulkán, Cupid → Amor)
    const pair = romanByAlias(name);
    if (pair && myths.has('rimska')) {
        aliases.unshift(name);
        name = pair[1];
    }
    let category;
    if (forced && forced.kind === 'object') category = 'predmety';
    else if (isCreature) category = 'bytosti';
    else if (myths.has('indicka')) category = 'indicka';
    else if (myths.has('keltska') || myths.has('artus')) category = 'keltska';
    else if (myths.has('japonska') || myths.has('cinska')) category = 'vychod';
    else if (myths.has('mezopotamska') || myths.has('kanaanska') || myths.has('perska')) category = 'orient';
    else if (myths.has('aztecka') || myths.has('mayska') || myths.has('incka')) category = 'amerika';
    else if (isCzechLegend || myths.has('slovanska')) category = 'slovanska';
    else if (myths.has('recka') || myths.has('rimska')) category = 'recka';
    else if (myths.has('egyptska')) category = 'egyptska';
    else if (myths.has('severska')) category = 'severska';
    else continue;
    const isMuse = (detail.myth || []).includes(MUSES);
    const type = forced && forced.type ? forced.type
        : isCzechLegend ? 'postava pověstí'
        : isCreature ? 'bájná bytost'
        : classes.includes(TITAN) ? (female ? 'titánka' : 'titán')
        : isDeity ? (female ? 'bohyně' : forced && !detail.sex && !MALE.has(name) ? 'božstvo' : 'bůh')
        : isMuse ? 'múza'
        : classes.some(q => JOTUNN.includes(q)) ? (female ? 'obryně' : 'obr')
        : classNames.some(name => /nymf/u.test(name)) ? 'nymfa'
        : classNames.some(name => HERO.test(name)) || HEROES.has(name) ? (female ? 'hrdinka' : 'hrdina')
        : 'mytická postava';
    const counterpart = counterpartOf.get(name);
    const hasCounterpart = Boolean(counterpart) && myths.has(counterpart.side === 'rimska' ? 'recka' : 'rimska');
    // V rodině egyptských bohů běžná jména (Usir → Osiris), stejně jako u nich samotných,
    // a římští bohové pod běžným českým jménem (Vulcanus → Vulkán)
    const familyName = (other) => {
        const plain = clean(other);
        if (myths.has('egyptska') && EGYPTIAN_NAMES[plain]) return EGYPTIAN_NAMES[plain];
        const roman = romanByAlias(plain);
        return roman ? roman[1] : plain;
    };
    const family = (list) => [...new Set((list || []).map(familyName))].filter(other => other !== name).slice(0, 4);
    const isGod = /bůh|bohyně|titán|božstvo/u.test(type);
    // Postava Íliady nebo účastník trojské války (ne bůh)
    const troy = !isGod && category !== 'predmety' && (detail.work || []).some(q => q === ILIAD || q === TROJAN_WAR);
    items.push(compact({
        q: qid, t: title, n: name, c: category,
        sl: Number(detail.sl) || candidate.sl || 0,
        ty: type,
        d: detail.d,
        cz: isCzechLegend || CZECH_CREATURES.includes(title) ? 1 : undefined,
        sx: female ? 'f' : undefined,
        ...imageFields(detail.im),
        al: aliases,
        f: compact({
            my: isCzechLegend ? 'české pověsti' : [...myths].map(key => MYTHOLOGIES[key].label).join(' a ') || undefined,
            myk: isCzechLegend || SHARED_CREATURES.has(title) || myths.size !== 1 || myths.has('artus') ? undefined : [...myths][0],
            dom: (detail.dom || []).slice(0, 4),
            sym: (symbols.get(qid) || []).filter(symbol => symbol.length <= 30).slice(0, 4),
            // Otec a matka jen jednoznační – víc otců či matek znamená různé verze bájí (Dionýsos: Semelé i Démétér)
            fa: (detail.father || []).length === 1 ? family(detail.father)[0] : undefined,
            mo: (detail.mother || []).length === 1 ? family(detail.mother)[0] : undefined,
            sib: family(detail.sib),
            // Manželé jen u bohů – u hrdinů uvádějí Wikidata i pozdní a sporné varianty bájí (Achilles a Helena)
            sp: isGod ? family(detail.sp).slice(0, 3) : undefined,
            cp: hasCounterpart ? counterpart.name : undefined,
            cpa: hasCounterpart && counterpart.aliases.length ? counterpart.aliases : undefined,
            // Na které straně je protějšek: rimska = ptáme se na římské jméno
            cpk: hasCounterpart ? counterpart.side : undefined,
            // Klasická dvojice (Zeus – Jupiter): jen na ty se ptáme „Jak se jmenuje v římské mytologii?“
            cpm: hasCounterpart && counterpart.major ? 1 : undefined
        }),
        fc: forced ? 1 : undefined,
        mn: forced && forced.manual ? 1 : undefined,
        olymp: OLYMPIAN_NAMES.has(name) ? 1 : undefined,
        obscure: OBSCURE_CZECH.has(title) ? 1 : undefined,
        troy: troy || TROY.has(name) ? 1 : undefined
    }));
}

// Jedna položka na jméno (i bez diakritiky – hindská Dánu a keltská Danu by se psanou odpovědí nerozlišily):
// ze stejně pojmenovaných zůstane ta s více jazykovými verzemi
items.sort((a, b) => b.sl - a.sl);
const byName = new Map();
for (const item of items) {
    const key = item.n.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs');
    if (!byName.has(key)) byName.set(key, item);
}
let unique = [...byName.values()];
// Další názvy jen ty, které nejsou jménem jiné položky ani protějškem (Bakchus u Dionýsa je římský bůh)
// (porovnání bez diakritiky – Herkulés je Herkules) a jen latinkou (ne Ηρακλής)
const plain = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const allNames = new Set(unique.map(item => plain(item.n)));
const counterpartNames = new Set(COUNTERPARTS.flatMap(([greek, roman, aliases]) => [greek, roman, ...aliases].map(plain)));
// Vlastní latinské tvary římských bohů (Venus, Vulcanus) a ruční zkratky
const ownAliases = (item) => [...((COUNTERPARTS.find(([, roman]) => roman === item.n) || [])[2] || []), ...(MANUAL_ALIASES[item.n] || [])];
for (const item of unique) item.al = [...(item.al || []), ...ownAliases(item)];
const aliasCount = new Map();
for (const item of unique) for (const alias of new Set((item.al || []).map(plain))) aliasCount.set(alias, (aliasCount.get(alias) || 0) + 1);
// Jen česká písmena (ne Wōđanaz, Rübezahl), aspoň tři písmena a nejvýš pět – jména se zakrývají i v popisu
const CZECH_LETTERS = /^[a-zA-ZáčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ' -]{3,}$/u;
for (const item of unique) {
    item.al = [...new Set(item.al || [])].filter(alias => CZECH_LETTERS.test(alias) && !BAD_ALIASES.has(alias) && !allNames.has(plain(alias))
        && (!counterpartNames.has(plain(alias)) || ownAliases(item).includes(alias)) && plain(alias) !== plain(item.n) && aliasCount.get(plain(alias)) === 1)
        .sort((a, b) => ownAliases(item).includes(b) - ownAliases(item).includes(a)).slice(0, 5);
    if (!item.al.length) delete item.al;
}

// Známost: nejznámější podle počtu jazykových verzí v každé kategorii, české pověsti a česká stvoření (bez bájných knížat)
const KNOWN = { recka: 105, egyptska: 22, severska: 18, slovanska: 14, bytosti: 66, indicka: 18, keltska: 12, vychod: 18, orient: 13, amerika: 6, predmety: 28 };
const MIN_SITELINKS = { recka: 22, egyptska: 18, severska: 18, slovanska: 0, bytosti: 0, indicka: 0, keltska: 0, vychod: 0, orient: 0, amerika: 0, predmety: 0 };
// Postavy z kategorií a seznamů (méně známé) se berou od 16 jazykových verzí; známá jména mají víc
const FORCED_MIN_SITELINKS = { recka: 20, egyptska: 20, severska: 20 };
const FORCED_MIN_DEFAULT = 14;
// Ruční seznamy jsou vybrané po jednom: stačí pár jazykových verzí (slovanské a keltské bytosti jich víc nemají);
// u slovanských a českých postav a bytostí ani to ne (Fext, Ohnivý muž mají jen českou a pár dalších verzí)
const MANUAL_MIN_SITELINKS = 6;
// Postavy Íliady a trojské války (méně známé jako Kalchás či Sinón) od tolika jazykových verzí
const TROY_MIN_SITELINKS = 12;
// Řeckých a římských postav je ve Wikidatech přes čtyři sta – jen ty známější (a všechny s protějškem a z ručních seznamů)
const LIMIT = { recka: 420 };
const ranks = {};
const counts = {};
unique = unique.filter(item => {
    if (item.mn) return item.sl >= MANUAL_MIN_SITELINKS || item.cz || /slovanská/u.test(item.f.my || '');
    if (item.troy && item.sl >= TROY_MIN_SITELINKS) return true;
    counts[item.c] = (counts[item.c] || 0) + 1;
    // Řecké postavy bez obrázku jen mezi prvními 280, další už s obrázkem
    if (item.c === 'recka' && !item.im && counts[item.c] > 280 && !item.f.cp) return false;
    return (item.sl >= (item.fc ? FORCED_MIN_SITELINKS[item.c] ?? FORCED_MIN_DEFAULT : MIN_SITELINKS[item.c]) && counts[item.c] <= (LIMIT[item.c] || Infinity)) || item.cz || item.f.cp;
});
for (const item of unique) {
    const rank = ranks[item.c] || 0;
    ranks[item.c] = rank + 1;
    // Všech devět múz zná, kdo zná jednu (okruh Múzy)
    item.k = (rank < KNOWN[item.c] || item.cz || item.olymp || item.ty === 'múza') && !item.obscure ? 1 : 0;
}

// --- 4. krok: okruhy ---
const isGodType = (item) => /bůh|bohyně|titán|božstvo/u.test(item.ty);
const COLLECTIONS = [
    { id: 'olympsti-bohove', label: 'Olympští bohové', text: 'Zeus, Athéna, Poseidón, Afrodíté…', test: item => item.olymp },
    { id: 'recti-bohove', label: 'Řečtí bohové a titáni', test: item => item.c === 'recka' && item.f.myk === 'recka' && isGodType(item) },
    { id: 'rimsti-bohove', label: 'Římští bohové', test: item => item.c === 'recka' && item.f.myk === 'rimska' },
    { id: 'protejsky', label: 'Řecké a římské protějšky', text: 'Zeus a Jupiter, Afrodíté a Venuše…', test: item => item.f.cp },
    { id: 'recti-hrdinove', label: 'Řečtí hrdinové', text: 'Héraklés, Achilles, Odysseus, Perseus…', test: item => item.c === 'recka' && /hrdin/u.test(item.ty) },
    { id: 'trojska-valka', label: 'Trojská válka', text: 'Achilles, Hektór, Helena, Kalchás, trójský kůň…', test: item => item.troy === 1 },
    { id: 'recke-baje', label: 'Postavy řeckých bájí', test: item => item.c === 'recka' && !isGodType(item) && !/hrdin/u.test(item.ty) },
    { id: 'muzy', label: 'Múzy', test: item => item.ty === 'múza' },
    { id: 'bohyne', label: 'Slavné bohyně', test: item => item.ty === 'bohyně' && item.k === 1 },
    { id: 'egyptsti-bohove', label: 'Egyptští bohové', test: item => item.c === 'egyptska' || (item.c === 'bytosti' && item.f.myk === 'egyptska') },
    { id: 'severska', label: 'Severští bohové a obři', test: item => item.c === 'severska' },
    { id: 'severske-bytosti', label: 'Severské bytosti', text: 'Fenrir, Sleipnir, valkýry…', test: item => item.c === 'bytosti' && item.f.my === 'severská' },
    { id: 'slovansti-bohove', label: 'Slovanští bohové', text: 'Perun, Veles, Mokoš, Svarog…', test: item => item.c === 'slovanska' && !item.cz && isGodType(item) },
    { id: 'ceske-povesti', label: 'Staré pověsti české', text: 'Praotec Čech, Libuše, Bivoj, Horymír…', test: item => item.f.my === 'české pověsti' },
    { id: 'slovanske-bytosti', label: 'Strašidla a slovanské bytosti', text: 'Vodník, polednice, rusalka…', test: item => item.c === 'bytosti' && (item.cz || item.f.my === 'slovanská') },
    { id: 'indicti-bohove', label: 'Hinduistická božstva a hrdinové', text: 'Šiva, Višnu, Ganéša, Kálí, Hanumán…', test: item => item.c === 'indicka' },
    { id: 'keltska-mytologie', label: 'Keltská mytologie', text: 'Lugh, Morrígan, Cernunnos, leprikón…', test: item => item.f.myk === 'keltska' },
    { id: 'artusovske-legendy', label: 'Legendy o králi Artušovi', text: 'Artuš, Merlin, Lancelot, Excalibur…', test: item => item.f.my === 'artušovské legendy' },
    { id: 'japonska-mytologie', label: 'Japonská mytologie', text: 'Amaterasu, Susanoo, kappa, kicune…', test: item => item.f.myk === 'japonska' },
    { id: 'cinska-mytologie', label: 'Čínská mytologie', text: 'Nefritový císař, Sun Wu-kchung, Čchi-lin…', test: item => item.f.myk === 'cinska' },
    { id: 'mezopotamie', label: 'Mezopotámie a starověký Orient', text: 'Marduk, Inanna, Gilgameš, Baal…', test: item => item.c === 'orient' || ['mezopotamska', 'kanaanska', 'perska'].includes(item.f.myk) },
    { id: 'amerika', label: 'Aztékové, Mayové a Inkové', text: 'Quetzalcoatl, Tlaloc, Chaac, Pačamama…', test: item => item.c === 'amerika' },
    { id: 'andele-a-demoni', label: 'Andělé a démoni', text: 'Michael, Gabriel, Satan, Lilith…', test: item => item.f.myk === 'biblicka' },
    { id: 'bajna-mista', label: 'Bájná místa a předměty', text: 'Atlantida, Excalibur, Valhalla, zlaté rouno…', test: item => item.c === 'predmety' },
    { id: 'hrdinove', label: 'Hrdinové světových bájí', text: 'Héraklés, Gilgameš, Cúchulainn, Ilja Muromec, Bivoj…', test: item => /hrdin/u.test(item.ty) || WORLD_HEROES.has(item.n) },
    { id: 'zbrane-a-predmety', label: 'Bájné zbraně a předměty', text: 'Mjölnir, Excalibur, zlaté rouno, trójský kůň…', test: item => item.c === 'predmety' && /předmět|zbraň|prsten|loď|nápoj|trůn|symbol|koruna|kámen/u.test(item.ty) },
    { id: 'rise-a-podsveti', label: 'Podsvětí, nebesa a bájné země', text: 'Ásgard, Valhalla, Tartaros, Duat, Avalon, Atlantida…', test: item => item.c === 'predmety' && /místo|říše|podsvětí|nebe|země|ostrov|město|hrad|řeka|hora|most|pramen|skály|obydlí/u.test(item.ty) },
    { id: 'devet-svetu', label: 'Devět světů severské mytologie', text: 'Ásgard, Midgard, Jötunheim, Helheim a strom Yggdrasil', test: item => NINE_WORLDS.has(item.n) },
    { id: 'recke-bytosti', label: 'Řecké nestvůry a bytosti', text: 'Pegas, Kerberos, Medúsa…', test: item => item.c === 'bytosti' && /řecká|římská/u.test(item.f.my || '') },
    // Bytosti pověstí mnoha národů (bez jedné mytologie): drak, jednorožec, upír, džin…
    { id: 'bajni-tvorove', label: 'Bájní tvorové', text: 'Drak, jednorožec, fénix, gryf, upír, džin…', test: item => item.c === 'bytosti' && !item.cz
        && (!item.f.my || SHARED_CREATURES.has(item.t)) && !/slovanská/u.test(item.f.my || '') }
];
const assignGroups = () => {
    for (const item of unique) {
        const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
        if (groups.length) item.g = groups;
        else delete item.g;
    }
};
assignGroups();
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

// Stejný obrázek u dvou položek (Boreás a Óreithýia na jedné váze, Kazi a Teta na jedné ilustraci) by otázka
// nerozlišila – zůstane jen známější položce (víc jazykových verzí), ostatní se ptají popisem
{
    const byImage = new Map();
    for (const item of [...unique].sort((a, b) => b.sl - a.sl)) {
        if (!item.im) continue;
        const key = item.im;
        if (byImage.has(key)) { delete item.im; delete item.ih; } else byImage.set(key, item);
    }
}

// --- 5. krok: úrovně obtížnosti (lib/fame-levels.mjs) ---
// Známost: jazykové verze a návštěvnost článku na české Wikipedii v kategorii (české pověsti a bytosti zvlášť). Známé určí
// pravidla výše (nejznámější v kategorii, olympští bohové, múzy, české pověsti); okruh od 8 položek dostane aspoň max(3, 25 %)
// známých (jen z lepší poloviny skupiny); nejméně známá čtvrtina je pro experty (české položky jen nejméně známá desetina,
// olympští bohové, klasické dvojice protějšků a múzy nikdy). Okruh Slavné bohyně vzniká ze známých – spodní hranici nemá
const pageviews = await topicPageviews('mytologie-pageviews', unique.map(item => item.t), { offline: process.env.PAGEVIEWS_OFFLINE === '1' });
for (const item of unique) {
    item._ = { sl: item.sl, pv: pageviews[item.t], pool: item.cz ? `${item.c}:cz` : item.c, never: Boolean(item.obscure) && !item.k,
        protect: Boolean(item.olymp || item.f.cpm || item.ty === 'múza') };
}
const promoted = assignLevels(unique, {
    expertShare: (pool) => pool.endsWith(':cz') ? 0.1 : 0.27,
    ceiling: () => 0.5,
    groups: levelGroups(unique, collections).filter(group => group.id !== 'bohyne')
});
console.log(`Povýšeno kvůli spodní hranici okruhu: ${promoted.map(([group, name]) => `${name} (${group})`).join(', ')}`);
assignGroups();
for (const item of unique) {
    delete item.olymp; delete item.obscure; delete item.sl; delete item.fc; delete item.mn; delete item.troy; delete item._;
}

for (const category of ['recka', 'egyptska', 'severska', 'slovanska', 'bytosti', 'indicka', 'keltska', 'vychod', 'orient', 'amerika', 'predmety']) {
    console.log(levelSummary(category, unique.filter(item => item.c === category)));
}
for (const collection of collections) console.log(levelSummary(`okruh ${collection.id}`, unique.filter(item => (item.g || []).includes(collection.id))));
console.log(levelSummary('celkem', unique));
writeTopic('mytologie', { collections, items: unique });
