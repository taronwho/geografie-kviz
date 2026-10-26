// Téma Mytologie: data/mytologie.json z Wikidat – bohové a hrdinové řecké a římské, egyptské, severské a slovanské
// mytologie, postavy Starých pověstí českých a bájné bytosti
// Spuštění: npm run build:mytologie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { qlever, sparql, id, values, imageFields, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';

// QLever, a když je přetížený, query.wikidata.org
const run = (query) => qlever(query).catch(() => sparql(query));
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
    slovanska: { label: 'slovanská', ids: ['Q201571'], classes: ['Q4436935'] }
};
const DEITY_CLASSES = ['Q22989102', 'Q11688446', 'Q146083', 'Q16513881', 'Q4436935', 'Q178885', OLYMPIAN_CLASS];
const TITAN = 'Q45713';
const OLYMPIANS = 'Q101609';
const MUSES = 'Q66016';

// Staré pověsti české a další české pověsti (podle názvu článku); Šárka článek o bájné postavě nemá (jen o jménu)
const CZECH_LEGENDS = ['Praotec Čech', 'Krok (vojvoda)', 'Libuše (kněžna)', 'Kazi', 'Teta (mytologie)', 'Přemysl Oráč', 'Bivoj',
    'Vlasta (mytologie)', 'Horymír (vladyka)', 'Šemík', 'Bruncvík', 'Golem', 'Krakonoš', 'Neklan', 'Lumír (bájný pěvec)', 'Křesomysl',
    'Nezamysl', 'Mnata', 'Vojen', 'Vnislav', 'Hostivít', 'Ječmínek'];
// Bájná knížata z výčtu Přemyslovců po Přemyslu Oráči zná málokdo – nejsou mezi známými
const OBSCURE_CZECH = new Set(['Křesomysl', 'Nezamysl', 'Mnata', 'Vojen', 'Vnislav', 'Hostivít', 'Ječmínek', 'Lumír (bájný pěvec)', 'Plivník']);
const SLAVIC_GODS = ['Perun', 'Veles', 'Mokoš', 'Svarog', 'Dažbog', 'Stribog', 'Svantovít', 'Triglav (bůh)', 'Morana', 'Jarilo', 'Černoboh',
    'Bělboh', 'Radegast', 'Lada (bohyně)', 'Živa (mytologie)', 'Chors', 'Simargl', 'Svarožic'];
const CZECH_CREATURES = ['Vodník', 'Polednice', 'Bludička', 'Hejkal', 'Ježibaba', 'Skřítek (mytologie)', 'Permoník', 'Čert', 'Bílá paní', 'Plivník', 'Meluzína (mytologie)'];
const SLAVIC_CREATURES = ['Rusalka', 'Víla', 'Baba Jaga', 'Kikimora', 'Domovoj', 'Lešij', 'Kostěj', 'Zmej', 'Pták Ohnivák', 'Polevik', 'Vlkodlak'];
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
    'Mímiho studna', 'Pelasgové', 'Arimaspové', 'Androfágové', 'Gargareáni', 'Titán', 'Kamény', 'Wendigo', 'Astarte', 'Aštarté', 'Anat', 'Bríseovna']);
// Postavy bez třídy s českým názvem (Ymir je ve Wikidatech jen „jötunn“)
const FORCE_FIGURE = new Set(['Ymir']);
// Slavní hrdinové řeckých bájí (Wikidata je mají jen jako „postavu řecké mytologie“)
const HEROES = new Set(['Achilles', 'Odysseus', 'Héraklés', 'Perseus', 'Théseus', 'Iásón', 'Hektór', 'Aineiás', 'Orfeus', 'Bellerofontés', 'Agamemnón',
    'Meneláos', 'Paris', 'Aiás', 'Patroklos', 'Diomédes', 'Meleagros', 'Kadmos', 'Atalanta', 'Nestór', 'Peleus', 'Péleus', 'Télemachos', 'Filoktétés',
    'Neoptolemos', 'Ilja Muromec', 'Dobryňa Nikitič', 'Aljoša Popovič', 'Sadko']);
// Postavy trojské války (okruh)
const TROY = new Set(['Achilles', 'Hektór', 'Paris', 'Helena', 'Agamemnón', 'Meneláos', 'Odysseus', 'Aiás', 'Patroklos', 'Priamos', 'Kassandra', 'Aineiás',
    'Hekabé', 'Andromaché', 'Diomédes', 'Nestór', 'Láokoón', 'Ífigeneia', 'Klytaimnéstra', 'Filoktétés', 'Neoptolemos', 'Penthesilea', 'Memnón']);
// Dvanáct olympských bohů (a Hádés, který na Olympu nebydlí, ale k hlavním bohům patří)
const OLYMPIAN_NAMES = new Set(['Zeus', 'Héra', 'Poseidón', 'Démétér', 'Athéna', 'Apollón', 'Artemis', 'Arés', 'Afrodíté', 'Héfaistos', 'Hermés', 'Hestia', 'Dionýsos', 'Hádés']);
// Egyptské bohy česká Wikipedie píše egyptologicky (Usir, Anup), ve škole i v knihách jsou známější řecké tvary
const EGYPTIAN_NAMES = { Eset: 'Isis', Usir: 'Osiris', Anup: 'Anubis', Hor: 'Horus', Sutech: 'Seth', Thovt: 'Thoth', Re: 'Ra', Nebthet: 'Nefthys', Tveret: 'Taweret' };
// Další názvy z Wikidat, které patří jiné bytosti (klekánice, Apis) nebo by zakryly běžné slovo (éra)
const BAD_ALIASES = new Set(['Klekánice', 'Apis', 'Era', 'Gera', 'Héire', 'Mořské panny', 'Kyklopové', 'Skarbnik', 'Duch Gór', 'Liczyrzepa', 'Rzepiór', 'Rzepolicz', 'Karkonosz']);
// Psané odpovědi navíc: běžné kratší či počeštěné tvary
const MANUAL_ALIASES = { 'Přemysl Oráč': ['Přemysl'], 'Mínótauros': ['Minotaur'], Kerberos: ['Kerber'] };
// Chybné pohlaví ve Wikidatech (Šu a Heh jsou bohové)
const MALE = new Set(['Šu', 'Heh']);
const CURATED_MYTHOLOGY = Object.fromEntries([
    ...Object.entries(CREATURE_MYTHOLOGY),
    ...SLAVIC_GODS.map(title => [title, ['slovanska']]), ...SLAVIC_CREATURES.map(title => [title, ['slovanska']]), ...CZECH_CREATURES.map(title => [title, ['slovanska']])
]);
const CREATURE_TITLES = new Set([...CZECH_CREATURES, ...SLAVIC_CREATURES, ...OTHER_CREATURES]);
// Bytosti, které patří víc mytologiím nebo lidovým pověstem celé Evropy – otázka „Ze které mytologie?“ se u nich neklade
const SHARED_CREATURES = new Set(['Drak', 'Jednorožec', 'Gryf', 'Fénix', 'Kraken', 'Trpaslík', 'Elf', 'Obr', 'Upír (nemrtvý)', 'Bazilišek', 'Vlkodlak', 'Satyr',
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
const FIGURE = /božstv|bůh|bohyně|bohové|titán|postava|hrdin|polobůh|bytost|tvor|zvíře|kůň|pes|psi|had|drak|netvor|příšer|hybrid|humanoid|taxon|obr|nymf|múz|démon|duch|víla|lid$|druh|familiár|bohatýr|pták|entit|prapředek|personifikace|věšt|čaroděj|monstr|valkýr|vlk|býk|lev|kentaur|kyklop|satyr/u;
const NOT_FIGURE = /rozcestník|rodné jméno|příjmení|město|lokalita|válka|bitva|událost|náboženství|^\S+ mytologie$|říše|předmět|zbraň|strom|loď|planetka|souhvězdí|kniha|literární dílo|pojem|svět$|místo|hora|řeka|ostrov|kultura|epos|báseň/u;
const CREATURE = /bytost|tvor|zvíře|kůň|pes|psi|had|drak|netvor|příšer|hybrid|humanoidní druh|taxon|obr|lid$|familiár|pták|monstr|vlk|býk|lev|třída/u;
const HERO = /hrdin|polobůh|bohatýr/u;

// --- 1. krok: kandidáti ---
const CANDIDATE_MIN_SITELINKS = 12;
const candidateList = await cached('mytologie-candidates', async () => {
    const classes = Object.values(MYTHOLOGIES).flatMap(m => m.classes);
    const myths = Object.values(MYTHOLOGIES).flatMap(m => m.ids);
    const rows = await run(`
SELECT DISTINCT ?item ?sl WHERE {
  { VALUES ?c { ${values(classes)} } ?item wdt:P31 ?c . }
  UNION { VALUES ?m { ${values(myths)} } ?item wdt:P1049|wdt:P361|wdt:P1080 ?m . }
  ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${CANDIDATE_MIN_SITELINKS})
}`);
    const curated = await run(titleQuery([...CZECH_LEGENDS, ...SLAVIC_GODS, ...CREATURE_TITLES]));
    return [
        ...rows.map(row => [id(row.item.value), { sl: Number(row.sl.value) }]),
        ...curated.map(row => [id(row.item.value), { sl: Number(row.sl.value), title: row.t.value }])
    ];
});
function titleQuery(titles) {
    return `
SELECT ?item ?sl ?t WHERE {
  VALUES ?t { ${titles.map(title => `"${title}"@cs`).join(' ')} }
  ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t .
  ?item wikibase:sitelinks ?sl .
}`;
}
const extraList = await cached('mytologie-extra', async () => (await run(titleQuery(EXTRA_TITLES)))
    .map(row => [id(row.item.value), { sl: Number(row.sl.value), title: row.t.value }]));
const candidates = new Map();
for (const [qid, entry] of [...candidateList, ...extraList]) candidates.set(qid, { ...(candidates.get(qid) || {}), ...entry });

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
    ...await cached('mytologie-details', () => fetchDetails(candidateList.map(([qid]) => qid).filter((qid, i, all) => all.indexOf(qid) === i))),
    ...await cached('mytologie-extra-details', () => fetchDetails(extraList.map(([qid]) => qid)))
]);

// Ikonografické symboly (P4185: blesk, orel, sova…) – česky
const symbols = new Map(await cached('mytologie-symbols', async () => {
    const result = new Map();
    await inBatches([...candidates.keys()], 150, (batch) => `
SELECT ?item ?v WHERE { VALUES ?item { ${values(batch)} } ?item wdt:P4185 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") }`,
    (row) => {
        const qid = id(row.item.value);
        result.set(qid, [...new Set([...(result.get(qid) || []), row.v.value])]);
    }, run);
    return [...result];
}));

// České názvy tříd
const classIds = new Set();
for (const detail of details.values()) for (const q of detail.cls || []) if (/^Q\d+$/.test(q)) classIds.add(q);
const classLabels = new Map(await cached('mytologie-classes', async () => {
    const result = [];
    await inBatches([...classIds], 300, (qids) => `
SELECT ?item ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
    (row) => result.push([id(row.item.value), row.l.value]), run);
    return result;
}));

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
    // Jen postavy a bytosti (ne místa, události, předměty a skupiny), lidé jen z pověstí
    if (!curated && !olympian && !FORCE_FIGURE.has(title) && !classes.some(q => JOTUNN.includes(q))) {
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
    if (!isCzechLegend && !myths.size && !isCreatureTitle) continue;
    const isDeity = olympian || classes.some(q => DEITY_CLASSES.includes(q)) || classNames.some(name => /božstv|^bůh$|^bohyně$/u.test(name)) || SLAVIC_GODS.includes(title);
    const isCreature = isCreatureTitle || (!isDeity && !isCzechLegend && classNames.some(name => CREATURE.test(name)) && !classes.some(q => JOTUNN.includes(q)));
    // Kurátorované bytosti pod názvem článku (Domovoj, ne „Dědek“; Lešij, ne „Lesní mužík“)
    let name = isCreatureTitle || isCzechLegend ? clean(title) : clean(detail.n || title);
    const female = detail.sex === FEMALE && !MALE.has(name);
    if (EXCLUDED.has(name) || EXCLUDED.has(title)) continue;
    const aliases = (detail.al || []).filter(alias => /^\p{Lu}/u.test(alias) && alias.split(' ').length <= 2 && alias.length >= 2);
    if (detail.n && clean(detail.n) !== name) aliases.push(clean(detail.n));
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
    if (isCreature) category = 'bytosti';
    else if (isCzechLegend || myths.has('slovanska')) category = 'slovanska';
    else if (myths.has('recka') || myths.has('rimska')) category = 'recka';
    else if (myths.has('egyptska')) category = 'egyptska';
    else if (myths.has('severska')) category = 'severska';
    else continue;
    const isMuse = (detail.myth || []).includes(MUSES);
    const type = isCzechLegend ? 'postava pověstí'
        : isCreature ? 'bájná bytost'
        : classes.includes(TITAN) ? (female ? 'titánka' : 'titán')
        : isDeity ? (female ? 'bohyně' : 'bůh')
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
    const isGod = /bůh|bohyně|titán/u.test(type);
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
            myk: isCzechLegend || SHARED_CREATURES.has(title) || myths.size !== 1 ? undefined : [...myths][0],
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
        olymp: OLYMPIAN_NAMES.has(name) ? 1 : undefined,
        obscure: OBSCURE_CZECH.has(title) ? 1 : undefined
    }));
}

// Jedna položka na jméno: ze stejně pojmenovaných zůstane ta s více jazykovými verzemi
items.sort((a, b) => b.sl - a.sl);
const byName = new Map();
for (const item of items) {
    const key = item.n.toLocaleLowerCase('cs');
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
const KNOWN = { recka: 72, egyptska: 14, severska: 11, slovanska: 10, bytosti: 30 };
const MIN_SITELINKS = { recka: 22, egyptska: 18, severska: 18, slovanska: 0, bytosti: 0 };
// Řeckých a římských postav je ve Wikidatech přes čtyři sta – jen ty známější (a všechny s protějškem)
const LIMIT = { recka: 240 };
const ranks = {};
const counts = {};
unique = unique.filter(item => {
    counts[item.c] = (counts[item.c] || 0) + 1;
    return (item.sl >= MIN_SITELINKS[item.c] && counts[item.c] <= (LIMIT[item.c] || Infinity)) || item.cz || item.f.cp;
});
for (const item of unique) {
    const rank = ranks[item.c] || 0;
    ranks[item.c] = rank + 1;
    item.k = (rank < KNOWN[item.c] || item.cz || item.olymp) && !item.obscure ? 1 : 0;
}

// --- 4. krok: okruhy ---
const isGodType = (item) => /bůh|bohyně|titán/u.test(item.ty);
const COLLECTIONS = [
    { id: 'olympsti-bohove', label: 'Olympští bohové', text: 'Zeus, Athéna, Poseidón, Afrodíté…', test: item => item.olymp },
    { id: 'recti-bohove', label: 'Řečtí bohové a titáni', test: item => item.c === 'recka' && item.f.myk === 'recka' && isGodType(item) },
    { id: 'rimsti-bohove', label: 'Římští bohové', test: item => item.c === 'recka' && item.f.myk === 'rimska' },
    { id: 'protejsky', label: 'Řecké a římské protějšky', text: 'Zeus a Jupiter, Afrodíté a Venuše…', test: item => item.f.cp },
    { id: 'recti-hrdinove', label: 'Řečtí hrdinové', text: 'Héraklés, Achilles, Odysseus, Perseus…', test: item => item.c === 'recka' && /hrdin/u.test(item.ty) },
    { id: 'trojska-valka', label: 'Trojská válka', test: item => TROY.has(item.n) },
    { id: 'recke-baje', label: 'Postavy řeckých bájí', test: item => item.c === 'recka' && !isGodType(item) && !/hrdin/u.test(item.ty) },
    { id: 'muzy', label: 'Múzy', test: item => item.ty === 'múza' },
    { id: 'bohyne', label: 'Slavné bohyně', test: item => item.ty === 'bohyně' && item.k === 1 },
    { id: 'egyptsti-bohove', label: 'Egyptští bohové', test: item => item.c === 'egyptska' || (item.c === 'bytosti' && item.f.myk === 'egyptska') },
    { id: 'severska', label: 'Severští bohové a obři', test: item => item.c === 'severska' },
    { id: 'severske-bytosti', label: 'Severské bytosti', text: 'Fenrir, Sleipnir, valkýry…', test: item => item.c === 'bytosti' && item.f.my === 'severská' },
    { id: 'slovansti-bohove', label: 'Slovanští bohové', text: 'Perun, Veles, Mokoš, Svarog…', test: item => item.c === 'slovanska' && !item.cz && isGodType(item) },
    { id: 'ceske-povesti', label: 'Staré pověsti české', text: 'Praotec Čech, Libuše, Bivoj, Horymír…', test: item => item.f.my === 'české pověsti' },
    { id: 'slovanske-bytosti', label: 'Strašidla a slovanské bytosti', text: 'Vodník, polednice, rusalka…', test: item => item.c === 'bytosti' && (item.cz || item.f.my === 'slovanská') },
    { id: 'recke-bytosti', label: 'Řecké nestvůry a bytosti', text: 'Pegas, Kerberos, Medúsa…', test: item => item.c === 'bytosti' && /řecká|římská/u.test(item.f.my || '') }
];
for (const item of unique) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
    delete item.olymp; delete item.obscure; delete item.sl;
}
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);

for (const category of ['recka', 'egyptska', 'severska', 'slovanska', 'bytosti']) {
    const inCategory = unique.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${unique.filter(item => (item.g || []).includes(collection.id)).length}`);
writeTopic('mytologie', { collections, items: unique });
