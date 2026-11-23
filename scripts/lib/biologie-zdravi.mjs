// Biologie – oblast „člověk a zdraví“: nemoci, lékařství (obory, léky, přístroje, vyšetření a léčba), slavní lékaři a psychologie
// (psychologové, pojmy, jevy, fobie a slavné experimenty). Volá ji scripts/build-biologie.mjs: celý build i samotné doplnění
// (node scripts/build-biologie.mjs --zdravi), které ostatní kategorie v data/biologie.json nechá beze změny.
// Dotazy jdou přes QLever (query.wikidata.org na podrobnostech se stovkami položek vyprší), mezivýsledky do BUILD_CACHE.
// Známost (k) jen z Wikidat: počet jazykových verzí článku (sitelinks) a ručně ověřené seznamy nejznámějších položek –
// návštěvnost české Wikipedie odsud stáhnout nejde. Úrovně a spodní hranice známých v okruzích určí assignHealthLevels.
import { qlever, id, values, imageFields, thumbHash, compact, cached, inBatches, yearOf } from './wikidata.mjs';
import { createHash } from 'node:crypto';
import { landByDescription } from './nationality.mjs';
import { assignLevels, levelSummary } from './biologie-levels.mjs';

export const HEALTH_CATEGORIES = ['nemoci', 'lekarstvi', 'lekari', 'psychologie'];

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const first = (detail, key) => (detail[key] || [])[0];
const unique = (list) => [...new Set(list.filter(Boolean))];
const lower = (text) => String(text || '').toLocaleLowerCase('cs');
// Obrázek z Commons podle názvu souboru (náhrady z PHOTO_REPLACEMENTS už provedlo imageFields)
const imageOf = (file) => (file ? { im: file, ih: thumbHash(file) } : {});
const fileOf = (url) => (url ? imageFields(url).im : undefined);
const fold = (text) => String(text || '').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'k').replace(/[yj]/g, 'i').replace(/c(?=[aou])|q/g, 'k').replace(/z/g, 's').replace(/w/g, 'v');
// Slova se stejným kořenem (kardiologie – kardiovaskulární, hepatitida – hepatologie, salmonelóza – Salmonella): fakt by prozradil název
const sameRoot = (a, b) => {
    const x = fold(a);
    const y = fold(b);
    const shorter = Math.min(x.length, y.length);
    if (shorter < 4) return x === y;
    let common = 0;
    while (common < shorter && x[common] === y[common]) common++;
    return common >= 5 || common >= shorter * 0.7;
};
const wordsOf = (text) => String(text || '').split(/[^\p{L}]+/u).filter(word => word.length >= 3);
const sharesRoot = (text, other) => wordsOf(text).some(word => wordsOf(other).some(otherWord => sameRoot(word, otherWord)));

// --- Dotazy ---
const csArticle = '?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .';
// Mezipaměť podle obsahu dotazu: změněný seznam položek či názvů se stáhne znovu
const keyOf = (name, list) => `${name}-${createHash('md5').update(list.join('|')).digest('hex').slice(0, 8)}`;
// Podrobnosti po dávkách: { qid: { klíč: [hodnoty] } }; branches = další větve UNION s ?p a ?v
const fetchDetails = (name, qids, branches, size = 100) => cached(keyOf(name, [...qids, ...branches]), async () => {
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, size, (batch) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(batch)} }
  { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item skos:altLabel ?v FILTER(LANG(?v) = "cs") BIND("al" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  ${branches.join('\n  ')}
}`, (row) => {
        const entry = result.get(id(row.item.value));
        if (!entry) return;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (!(entry[row.p.value] || []).includes(v)) entry[row.p.value] = [...(entry[row.p.value] || []), v];
    }, (query) => qlever(`PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n${query}`));
    return [...result];
}).then(entries => new Map(entries));
// Hodnota vlastnosti s českým názvem: větev UNION pro fetchDetails
const labelled = (property, key) => `UNION { ?item wdt:${property} ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("${key}" AS ?p) }`;
const plain = (property, key) => `UNION { ?item wdt:${property} ?v BIND("${key}" AS ?p) }`;

// Články české Wikipedie podle názvu → [[titulek, qid, sitelinks]]
const resolveTitles = (name, titles) => cached(keyOf(name, titles), async () => {
    const result = [];
    for (let i = 0; i < titles.length; i += 150) {
        const rows = await qlever(`SELECT ?t ?item ?sl WHERE { VALUES ?t { ${titles.slice(i, i + 150).map(title => `"${title.replace(/"/g, '\\"')}"@cs`).join(' ')} }
  ?a schema:name ?t ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:about ?item . ?item wikibase:sitelinks ?sl }`);
        for (const row of rows) result.push([row.t.value, id(row.item.value), Number(row.sl.value)]);
    }
    return result;
});

// --- Obrázky ---
// Hlavní obrázek nemoci bývá pacient s vyrážkou, vředem či zrůdností – drastické fotky do kvízu nepatří. Vezme se jen snímek
// z mikroskopu (původce, tkáň), přednostně obrázek původce nemoci; jinak nemoc fotku nemá.
const MICROSCOPE = /micrograph|microscop|electron|(?<![a-z])(?:em|sem|tem|phil)(?![a-z])|\d+ ?x(?![a-z])|(?<![a-z])mag(?![a-z])|virus|virion|bacteri|bacill|coccus|cocci|mycobact|plasmod|trypanosom|leishmani|toxoplasm|giardia|treponema|borrel|chlamyd|histolog|stain|gram[- ]?(?:stain|posit|negat)|culture|colon(?:y|ies)|pollen|parasit|helminth|(?<![a-z])egg|larva|prion|cells|blood smear|smear/iu;
// Lidé, části těla, zranění, operace a lékařské snímky: ani pod mikroskopem ne
const GORY = /patient|child|kid|female|(?<![a-z])male(?![a-z])|(?<![a-z])soa(?![a-z])|oral|thrush|aphth|carcinoma(?!.*mag)|boy|girl|wom[ae]n|(?<![a-z])m[ae]n(?![a-z])|face|facial|skin|rash|lesion|ulcer|wound|gangren|necros|(?<![a-z])legs?(?![a-z])|(?<![a-z])arms?(?![a-z])|hand|foot|feet|toe|finger|eye|gum|mouth|tongue|lip|nose|penis|vagin|vulva|genital|breast|anus|anal|autops|cadaver|corpse|dead|death|surg|operat|gross|specimen|x-?ray|radiograph|(?<![a-z])ct(?![a-z])|mri|scan|endoscop|amput|baby|infant|victim|sufferer|deform|tumou?r(?! cell)|blood(?! smear| cell)|bleed|pus|abscess|teeth|tooth|dental|stool|feces|faeces|vomit|urine|swollen|swelling|limb|torso|chest|belly|abdomen|neck|head|ear(?![a-z])|scalp|hair|nail|kidney|liver|lung|brain|heart|intestin|bowel|colon(?![a-z])|stomach|naked|nude|portrait|photo of|people|person|family|hospital|bed/iu;
const isMicroscopeImage = (file) => Boolean(file) && /\.(jpe?g)$/iu.test(file) && MICROSCOPE.test(file) && !GORY.test(file.replace(MICROSCOPE, ' '));
// Lékařství a psychologie: fotky operací, porodů, pitev a těl se vynechají (přístroj, obor či pojem bez fotky nevadí)
const GORY_MEDICAL = /rash|tumou?r|mesotheliom|carcinom|surg|operat|caesar|cesar|c-section|birth|deliver|autops|dissect|cadaver|corpse|amput|wound|blood|bleed|lesion|biops|needle|syringe(?! pump)|inject|naked|nude|genital|penis|vagin|breast|patient|fetus|foetus|embryo|abortion|lobotom|trepan|leech|skull/iu;
// Hrob, pamětní deska, známka nebo rodný dům místo podoby osobnosti (stejná slova jako core.OFF_SUBJECT.memorial)
const MEMORIAL = /grave|gravestone|headstone|tombstone|hrob|n[aá]hrob|grab|plaque|pam[eě]tn[ií] deska|gedenktafel|stamp|briefmarke|birthplace|rodn[ýy] d[ůu]m|geburtshaus|statue|socha|bust|busta|monument|pomn[ií]k|memorial/iu;

// --- Nemoci ---
// Kandidáti: druh nemoci podle Wikidat (třídy níže) s článkem na české Wikipedii a aspoň DISEASE_MIN_SL jazykovými verzemi
const DISEASE_CLASSES = ['Q112193867', 'Q929833', 'Q42303753', 'Q12136', 'Q2057971', 'Q12135', 'Q179630', 'Q140421694', 'Q175854', 'Q270673',
    'Q29512471', 'Q18123741', 'Q56815734'];
const DISEASE_MIN_SL = 25;
const DISEASE_LIMIT = 340;
// Skupiny nemocí podle kapitol Mezinárodní klasifikace nemocí (MKN-10, u položek bez ní podle MKN-10-CM): [od, do, klíč, název]
// Kapitoly R (příznaky), S–T (úrazy a otravy), V–Y (vnější příčiny), O (těhotenství) a Z (faktory) nemoci nejsou – vynechají se
const ICD_CHAPTERS = [
    ['A00', 'B99', 'infekcni', 'infekční nemoci'], ['C00', 'D48', 'nadory', 'nádorová onemocnění'], ['D50', 'D89', 'krev', 'nemoci krve a imunity'],
    ['E00', 'E90', 'latkova-vymena', 'nemoci žláz a látkové výměny'], ['F00', 'F99', 'dusevni', 'duševní poruchy'], ['G00', 'G99', 'nervova', 'nemoci nervové soustavy'],
    ['H00', 'H59', 'oko', 'nemoci oka'], ['H60', 'H95', 'ucho', 'nemoci ucha'], ['I00', 'I99', 'obehova', 'nemoci srdce a cév'],
    ['J00', 'J99', 'dychaci', 'nemoci dýchací soustavy'], ['K00', 'K93', 'travici', 'nemoci trávicí soustavy'], ['L00', 'L99', 'kozni', 'kožní nemoci'],
    ['M00', 'M99', 'pohybova', 'nemoci kostí, svalů a kloubů'], ['N00', 'N99', 'mocova', 'nemoci močových a pohlavních orgánů'],
    ['P00', 'P96', 'novorozenci', 'nemoci novorozenců'], ['Q00', 'Q99', 'vrozene', 'vrozené vady a genetické nemoci'], ['U00', 'U99', 'infekcni', 'infekční nemoci']
];
// Skupina jako nápověda: bez slov „nemoc“, „porucha“ a „onemocnění“, která jsou v názvech (Parkinsonova nemoc) – fakt by se zahodil
const GROUP_HINTS = {
    infekcni: 'infekce a parazité', nadory: 'nádory', krev: 'krev a imunita', 'latkova-vymena': 'žlázy, výživa a látková výměna', dusevni: 'duševní zdraví',
    nervova: 'nervová soustava', oko: 'oko a zrak', ucho: 'ucho a sluch', obehova: 'srdce a cévy', dychaci: 'dýchací soustava', travici: 'trávicí soustava',
    kozni: 'kůže', pohybova: 'kosti, svaly a klouby', mocova: 'močové a pohlavní orgány', novorozenci: 'novorozenci', vrozene: 'vrozené vady a genetika'
};
const icdKey = (code) => {
    const match = /^([A-Z])(\d{2})/.exec(String(code || '').trim().toUpperCase());
    return match ? `${match[1]}${match[2]}` : null;
};
// Kapitola podle prvního kódu; nemoc nervové soustavy, kterou MKN-10-CM vede i jako demenci (F02 u Parkinsonovy nemoci), patří k nervové soustavě
const chapterOf = (codes) => {
    const chapters = codes.map(icdKey).filter(Boolean).map(key => ICD_CHAPTERS.find(([from, to]) => key >= from && key <= to)).filter(Boolean);
    if (chapters.some(chapter => chapter[2] === 'nervova') && chapters.some(chapter => chapter[2] === 'dusevni')) return chapters.find(chapter => chapter[2] === 'nervova');
    return chapters[0] || null;
};
// Kód MKN-10 bez chyb z Wikidat („B2424.“, „I10-I1515.“, „A01.001.0“): kód, nejvýš dvě desetinná místa, případně rozsah
const cleanIcd = (code) => {
    const match = /^([A-Z]\d{2})(\.\d{1,2}(?!\d))?(?:\.?-([A-Z]\d{2})(?!\d))?/.exec(String(code || '').trim().toUpperCase());
    return match ? `${match[1]}${match[2] || ''}${match[3] ? `–${match[3]}` : ''}` : undefined;
};
// Nemoci, proti kterým se běžně očkuje (Wikidata uvádějí u vakcín i pokusné, třeba proti Alzheimerově chorobě): české názvy
const VACCINES = new Set(['covid-19', 'chřipka', 'spalničky', 'zarděnky', 'příušnice', 'plané neštovice', 'pásový opar', 'černý kašel', 'záškrt', 'tetanus',
    'dětská obrna', 'hepatitida A', 'hepatitida B', 'vzteklina', 'tuberkulóza', 'břišní tyfus', 'cholera', 'žlutá zimnice', 'klíšťová encefalitida',
    'japonská encefalitida', 'meningitida', 'infekce lidským papilomavirem', 'rakovina děložního hrdla', 'pravé neštovice', 'opičí neštovice', 'Ebola', 'dengue',
    'malárie', 'anthrax', 'chřipka prasat', 'ptačí chřipka', 'zápal plic'].map(lower));
// Nemoci, které do rodinného kvízu nepatří (sexuální funkce a pohlavní orgány, sebepoškozování, násilí, popravy), a obecné pojmy
// (infekční onemocnění, syndrom, duševní porucha); ponechané jako fobie jdou do psychologie
const DISEASE_EXCLUDED = /erekt|ejakul|penis|priap|fimóz|mikropenis|diphall|vagin|vulv|klitor|genitál|hypersex|sexuáln[íé] (touh|vzruš|orient)|pohlavní identit|transsex|frigid|sebevra|sebepoško|násil|poprav|oběšen|utonut|dušení|hladov|střeln|pobod|výbuch|nehod|válka|uštknut|zneužív|bezdomov|antikatolic|chudob|koprofág|koprolál|asfyxie|interrupc|potrat|těhotenstv|porod|placent|kojen|siamská dvojčata|choroba rostlin|nemoci ptáků|drůbež|jelenovit|scrapie|kokcidióz|retikuloendotel|idiot|šílenstv|polyploid|^sexuálně přenosná nemoc$|^opilost$|^kocovina$|^trans$|^piha$|^jizva$|^svědění$|^závrať$|^menopauza$|^hematurie$|^úzkost$|^rotavirus$|^mycoplasma$|virinae$|^gangréna$|^bolest|^syndrom$|^infarkt$|^jed$|onemocnění$|^(duševní porucha|porucha osobnosti|afektivní porucha|specifické poruchy učení|disociativní poruchy|somatoformní poruchy|porucha příjmu potravy|tělesné postižení|řečové postižení|zrakové postižení|nemoc z povolání|srdeční choroby|genetická choroba|vrozená nemoc|vzácné onemocnění|nádor|karcinom|tumor|novotvar|fobie|specifická fobie|vřed|cysta|atrofie|hypertrofie|dysplazie|stenóza|syndrom|šok|eroze|edém|metastáza|infekce|zneužívání návykových látek|drogová závislost)$/iu;
// Nemoci s kódem příznaku či úrazu (R, T) nebo bez kódu, které přesto patří mezi známé nemoci a poruchy: skupina podle českého názvu
const DISEASE_CHAPTER_FIX = { 'cévní mozková příhoda': 'obehova', 'lupy': 'kozni', 'žloutenka': 'travici', 'dyslexie': 'dusevni', 'alergie': 'krev',
    'potravinová alergie': 'krev', 'koktavost': 'dusevni' };
// Fobie jsou v psychologii (okruh Fobie), ne mezi nemocemi
const PHOBIA = /fobie$/iu;
// Dětské nemoci (okruh): české názvy
const CHILDHOOD = new Set(['spalničky', 'zarděnky', 'příušnice', 'plané neštovice', 'spálová angína', 'černý kašel', 'záškrt', 'dětská obrna', 'pátá nemoc',
    'šestá nemoc', 'krup', 'nemoc rukou, nohou a úst', 'dětská mozková obrna']);
// Nemoci, které zná skoro každý (známé vždy, i když mají méně jazykových verzí): české názvy
const DISEASES_KNOWN = new Set(['lymeská nemoc', 'klíšťová encefalitida', 'angína', 'spálová angína', 'zarděnky', 'příušnice', 'plané neštovice', 'spalničky',
    'jednoduchý opar', 'pásový opar', 'šedý zákal', 'glaukom', 'krátkozrakost', 'dalekozrakost', 'barvoslepost', 'rýma', 'chřipka', 'nachlazení', 'migréna',
    'zubní kaz', 'osteoporóza', 'křečové žíly', 'žaludeční vřed', 'apendicitida', 'celiakie', 'psoriáza', 'ekzém', 'atopická dermatitis', 'bradavice', 'akné',
    'dna', 'revmatoidní artritida', 'osteoartróza', 'roztroušená skleróza', 'Downův syndrom', 'autismus', 'ADHD', 'dyslexie', 'deprese', 'schizofrenie',
    'mentální anorexie', 'bulimie', 'Bulimie', 'obsedantně kompulzivní porucha', 'bipolární afektivní porucha', 'insomnie', 'alkoholismus', 'mor', 'cholera',
    'tuberkulóza', 'malárie', 'vzteklina', 'tetanus', 'lepra', 'syfilis', 'kapavka', 'AIDS', 'covid-19', 'Ebola', 'leukemie', 'melanom', 'rakovina prsu',
    'rakovina plic', 'infarkt myokardu', 'cévní mozková příhoda', 'arteriální hypertenze', 'ateroskleróza', 'trombóza', 'astma', 'zápal plic', 'bronchitida',
    'diabetes mellitus', 'obezita', 'struma', 'kurděje', 'křivice', 'hemofilie', 'epilepsie', 'Alzheimerova choroba', 'Parkinsonova nemoc', 'demence',
    'meningitida', 'žloutenka', 'hepatitida B', 'hepatitida A', 'hepatitida C', 'jaterní cirhóza', 'zánět spojivek', 'zánět středního ucha', 'svrab',
    'salmonelóza', 'úplavice', 'břišní tyfus', 'žlutá zimnice', 'pravé neštovice', 'opičí neštovice', 'ptačí chřipka', 'bovinní spongiformní encefalopatie',
    'hemoroid', 'ledvinové kameny', 'cystická fibróza', 'albinismus', 'vitiligo', 'tinnitus', 'ječné zrno', 'koktavost', 'posttraumatická stresová porucha',
    'alergie', 'chudokrevnost', 'mykóza', 'rakovina', 'lupy', 'zácpa', 'průjem', 'gastroenteritida', 'sinusitida', 'zánět dásní', 'rozštěp', 'polydaktylie',
    'Turnerův syndrom', 'zánět průdušek', 'zánět mozkových blan'].map(lower));
// Druh původce podle taxonu předka (vědecké jméno) – přednostně; jinak podle popisu původce (P828) ve Wikidatech
const PATHOGEN_ROOTS = { Bacteria: 'bakterie', Fungi: 'houba', Riboviria: 'virus', Duplodnaviria: 'virus', Monodnaviria: 'virus', Varidnaviria: 'virus',
    Ribozyviria: 'virus', Adnaviria: 'virus', Apicomplexa: 'parazit', Euglenozoa: 'parazit', Amoebozoa: 'parazit', Metamonada: 'parazit', Nematoda: 'parazit',
    Platyhelminthes: 'parazit', Arthropoda: 'parazit', Ciliophora: 'parazit' };
const PATHOGEN_TYPES = [[/vir(us|ů|y)|virion/iu, 'virus'], [/bakteri|bacil|kok(y|ů|us)|mykobakter/iu, 'bakterie'], [/prion/iu, 'prion'],
    [/hub(a|y)|kvasink|plís|mikromycet/iu, 'houba'], [/prvo|parazit|hlíst|tasemnic|motolic|červ|měňavk|roztoč|zimniček|bičenk|trypanozom|plasmod/iu, 'parazit']];
// Hlavní obor (P1995): obecné obory nic neřeknou
const GENERIC_SPECIALTY = /^(lékařství|vnitřní lékařství|všeobecné lékařství|patologie|patogeneze|epidemiologie|primární péče|urgentní medicína|lékařská genetika|patologická fyziologie|histopatologie|nosologie|intenzivní medicína|paliativní péče|psychologie|klinická psychologie|lékařská psychologie|psychoterapie|genetika|infekční onemocnění)$/iu;
// Přenos nákazy (P1060): krátký český popis
const TRANSMISSION = { 'přenos vzduchem': 'vzduchem', 'kapénková infekce': 'kapénkami', 'přenos kontaktem': 'dotykem', 'přímý přenos': 'přímým kontaktem',
    'sexuálně přenosná nemoc': 'pohlavním stykem', 'transplacentární přenos nemoci': 'z matky na dítě', 'pokousání': 'pokousáním', 'přenos komáry': 'komáry',
    'alimentární nákaza': 'potravou', 'přenos potravou': 'potravou', 'fekálně-orální přenos': 'špinavýma rukama a vodou', 'přenos krví': 'krví', 'vektorový přenos': 'přenašečem (hmyzem, klíšťaty)' };
// Příznaky (P780), které nic neřeknou nebo jsou samy nemocí, a jak se zobrazí místo odborného názvu
const SYMPTOM_SKIP = /^(zánět|bolest|otrava|nemoc|syndrom|symptom|smrt|rakovina|zvýšení|změna|vylučování|zlost|strach)$/iu;
const BODY_LABEL = { 'lidský mozek': 'mozek', 'lidské tělo': 'tělo', 'pohybová soustava člověka': 'pohybová soustava', 'trávicí soustava člověka': 'trávicí soustava' };

const buildDiseases = async ({ taken, published }) => {
    // Druh nemoci podle tříd Wikidat, nebo kód MKN-10 (spalničky mají jako druh „virové onemocnění“); příznaky a úrazy vyřadí kapitola MKN
    const candidates = await cached('biologie-nemoci-candidates-2', async () => {
        const rows = await qlever(`SELECT DISTINCT ?item ?sl WHERE { { VALUES ?cls { ${values(DISEASE_CLASSES)} } ?item wdt:P31 ?cls }
  UNION { ?item wdt:P494 [] } UNION { ?item wdt:P4229 [] }
  ?item wikibase:sitelinks ?sl FILTER(?sl >= ${DISEASE_MIN_SL}) ${csArticle} }`);
        return rows.map(row => [id(row.item.value), Number(row.sl.value)]);
    });
    const sitelinks = new Map(candidates);
    for (const qid of published) if (!sitelinks.has(qid)) sitelinks.set(qid, 0);
    const qids = [...sitelinks.keys()];
    const details = await fetchDetails('biologie-nemoci-details', qids, [
        plain('P494', 'icd'), plain('P4229', 'cm'), labelled('P1995', 'spec'), plain('P828', 'cause'), labelled('P780', 'sym'),
        labelled('P1060', 'tr'), labelled('P927', 'loc'), labelled('P279', 'sup')
    ], 80);
    // Původci nemocí: druh (podle popisu), fotka a zda jde o organismus (má nadřazený taxon) nebo virus
    const causeIds = unique([...details.values()].flatMap(detail => detail.cause || []));
    const causes = await fetchDetails('biologie-nemoci-causes', causeIds, [plain('P171', 'parent'), plain('P105', 'rank')], 150);
    // Druh původce podle předků ve stromu taxonů (bakterie, houby, říše virů, prvoci a červi); popis původce bývá prázdný
    const causeTaxa = new Map(await cached(keyOf('biologie-nemoci-cause-taxa', causeIds), async () => {
        const result = [];
        await inBatches(causeIds, 150, (batch) => `SELECT DISTINCT ?item ?name WHERE { VALUES ?item { ${values(batch)} } ?item wdt:P171+ ?a . ?a wdt:P225 ?name .
  VALUES ?name { ${Object.keys(PATHOGEN_ROOTS).map(name => `"${name}"`).join(' ')} } }`, (row) => result.push([id(row.item.value), PATHOGEN_ROOTS[row.name.value]]), qlever);
        return result;
    }));
    // Nemoci, proti kterým je očkovací látka (P1924 „vakcína pro“)
    const vaccinated = new Set(await cached('biologie-nemoci-vaccines', async () => {
        const rows = await qlever(`SELECT DISTINCT ?d WHERE { ?v wdt:P1924 ?d }`);
        return rows.map(row => id(row.d.value));
    }));
    const symptomCounts = new Map();
    for (const detail of details.values()) for (const symptom of detail.sym || []) symptomCounts.set(symptom, (symptomCounts.get(symptom) || 0) + 1);
    const items = [];
    const phobias = [];
    const ordered = qids.sort((a, b) => (sitelinks.get(b) || 0) - (sitelinks.get(a) || 0));
    let count = 0;
    for (const qid of ordered) {
        const detail = details.get(qid) || {};
        const title = first(detail, 't');
        const label = first(detail, 'n');
        if (!title || !label) continue;
        if (PHOBIA.test(label)) { phobias.push([qid, sitelinks.get(qid) || 0]); continue; }
        // Původci (rod virů či bakterií s kódem MKN) a obecné či nevhodné položky nemocemi nejsou
        if (DISEASE_EXCLUDED.test(label) || /^(rod|druh|podčeleď|čeleď|řád|kmen) |^(rna|dna) vir/iu.test(first(detail, 'd') || '')) continue;
        if (count >= DISEASE_LIMIT && !published.has(qid)) continue;
        const fixKey = DISEASE_CHAPTER_FIX[lower(label)];
        const chapter = fixKey ? ICD_CHAPTERS.find(entry => entry[2] === fixKey) : chapterOf([...(detail.icd || []), ...(detail.cm || [])]);
        if (!chapter) continue;
        const name = capitalize(label);
        if (taken.names.has(name.toLocaleLowerCase('cs')) || taken.ids.has(qid)) continue;
        taken.names.add(name.toLocaleLowerCase('cs'));
        taken.ids.add(qid);
        count++;
        // Původce: organismus nebo virus s českým názvem (nejznámější napřed); druh podle popisu. Víc druhů původců (bakterie i viry
        // u zánětu mozkových blan) = oba druhy, jméno původce jen u nemoci s jediným původcem
        const pathogens = (detail.cause || []).map(cause => ({ qid: cause, ...Object.fromEntries(Object.entries(causes.get(cause) || {}).map(([key, list]) => [key, list[0]])) }))
            .filter(cause => cause.n && (cause.parent || cause.rank || /prion/iu.test(cause.d || '')))
            .map(cause => ({ ...cause, type: causeTaxa.get(cause.qid) || (PATHOGEN_TYPES.find(([pattern]) => pattern.test(`${cause.d || ''} ${cause.n}`)) || [])[1] }))
            .filter(cause => cause.type).sort((a, b) => Number(b.sl || 0) - Number(a.sl || 0));
        const types = unique(pathogens.map(cause => cause.type));
        const pathogenType = types.length ? types.slice(0, 2).join(' nebo ')
            : chapter[2] === 'infekcni' ? (PATHOGEN_TYPES.find(([pattern]) => pattern.test((detail.sup || []).join(' '))) || [])[1] : undefined;
        // Jeden původce, nebo víc druhů téhož rodu (malárie: Plasmodium falciparum, vivax…) – pak jméno rodu
        const genus = pathogens.length > 1 && pathogens.every(cause => cause.n.split(' ')[0] === pathogens[0].n.split(' ')[0]) ? pathogens[0].n.split(' ')[0] : null;
        const causeName = pathogens.length === 1 ? pathogens[0].n : genus;
        // Obrázek: snímek původce z mikroskopu (jen u jediného původce či rodu), jinak vlastní snímek z mikroskopu
        const imageFile = [...(causeName ? pathogens.map(cause => cause.im) : []), ...(detail.im || [])].map(fileOf).find(file => isMicroscopeImage(file) && !taken.images.has(file));
        if (imageFile) taken.images.add(imageFile);
        const specialties = unique(detail.spec || []).filter(spec => !GENERIC_SPECIALTY.test(spec) && !sharesRoot(spec, label)).slice(0, 2);
        const symptoms = unique(detail.sym || []).filter(symptom => !SYMPTOM_SKIP.test(symptom) && (symptomCounts.get(symptom) || 0) >= 3 && !sharesRoot(symptom, label))
            .sort((a, b) => symptomCounts.get(b) - symptomCounts.get(a)).slice(0, 4);
        const transmission = unique((detail.tr || []).map(entry => TRANSMISSION[entry])).slice(0, 3);
        const location = unique((detail.loc || []).map(entry => BODY_LABEL[entry] || entry)).filter(entry => !sharesRoot(entry, label)).slice(0, 2);
        const icd = (detail.icd || []).find(code => icdKey(code)) || (detail.cm || []).find(code => icdKey(code));
        items.push(compact({
            q: qid,
            t: title,
            n: name,
            c: 'nemoci',
            ty: chapter[2] === 'dusevni' ? 'duševní porucha' : chapter[2] === 'vrozene' ? 'vrozená vada' : 'nemoc',
            d: first(detail, 'd'),
            ...imageOf(imageFile),
            al: aliasesOf(detail, label),
            f: compact({
                grp: GROUP_HINTS[chapter[2]],
                spec: specialties,
                pt: pathogenType,
                cause: causeName && !sharesRoot(causeName, label) ? causeName : undefined,
                tr: transmission,
                sym: symptoms,
                loc: location,
                vac: vaccinated.has(qid) && VACCINES.has(lower(label)) ? 1 : undefined,
                icd: cleanIcd(icd)
            }),
            sl: sitelinks.get(qid),
            grp: chapter[2],
            child: CHILDHOOD.has(lower(label)) ? 1 : undefined,
            fixed: DISEASES_KNOWN.has(lower(label)) ? 1 : undefined
        }));
    }
    return { items, phobias };
};
// Jiné české názvy (cukrovka, borelióza, zelený zákal) jako psaná odpověď: jen slova, ne zkratky z jiných jazyků ani dlouhé opisy
// (anglické opisy bez české diakritiky o třech a více slovech a hanlivé názvy jako „čínská chřipka“ ne)
const aliasesOf = (detail, label) => unique((detail.al || []).filter(alias => alias.length >= 3 && alias.length <= 40 && /\p{Ll}/u.test(alias)
    && /^[\p{L}\d][\p{L}\d .,'-]*$/u.test(alias) && alias.toLocaleLowerCase('cs') !== label.toLocaleLowerCase('cs') && alias.split(' ').length <= 4
    && !(alias.split(' ').length >= 3 && !/[áčďéěíňóřšťúůýž]/iu.test(alias)) && !/čínsk|wuchan|španělsk/iu.test(alias))
    .map(alias => alias.toLocaleLowerCase('cs'))).slice(0, 4);

// --- Lékařství ---
// Ručně vybrané články české Wikipedie po okruzích; „*“ = zná ho skoro každý (známý vždy)
const MEDICINE = {
    obory: ['*Chirurgie', '*Stomatologie', '*Psychiatrie', '*Kardiologie', '*Neurologie', '*Gynekologie', '*Oftalmologie', '*Onkologie', '*Dermatologie', '*Urologie',
        '*Pediatrie', '*Ortopedie', '*Otorinolaryngologie', '*Radiologie', '*Anesteziologie a resuscitace', '*Geriatrie', 'Endokrinologie', 'Gastroenterologie',
        '*Imunologie', '*Alergologie', '*Vnitřní lékařství', '*Plastická chirurgie', '*Veterinární lékařství', '*Farmacie', 'Patologie', 'Hematologie', 'Nefrologie',
        'Pneumologie', 'Traumatologie', 'Neurochirurgie', 'Kardiochirurgie', '*Porodnictví', 'Sportovní medicína', 'Soudní lékařství', '*Epidemiologie', 'Logopedie',
        'Sexuologie', 'Toxikologie', 'Farmakologie', 'Urgentní medicína', 'Nukleární medicína', 'Paliativní péče', '*Praktické lékařství', 'Angiologie', 'Hepatologie',
        'Neonatologie', 'Andrologie', 'Venerologie', 'Proktologie', 'Ortodoncie', 'Optometrie', 'Audiologie', 'Foniatrie', 'Rehabilitační lékařství', 'Psychosomatika',
        'Transfuzní lékařství', 'Lékařská genetika', 'Embryologie', 'Histologie', 'Anatomie', 'Fyziologie', 'Mikrobiologie', 'Virologie', 'Parazitologie', 'Bakteriologie',
        'Gerontologie', 'Klinická biochemie', 'Telemedicína', 'Dietetika'],
    leky: ['*Antibiotikum', '*Penicilin', '*Ibuprofen', '*Vakcína', '*Analgetikum', '*Antidepresivum', '*Antihistaminikum', '*Hormonální antikoncepce', 'Antivirotikum',
        'Antipyretikum', 'Antikoagulans', '*Antiseptikum', 'Kortikosteroidy', 'Cytostatika', 'Sedativum', 'Hypnotikum', 'Laxativum', 'Diuretikum', 'Antimykotikum',
        'Antipsychotikum', 'Anxiolytikum', 'Antikonvulzivum', 'Beta-blokátor', 'Statin', 'Imunosupresivum', '*Placebo', 'Probiotikum', 'Nesteroidní antiflogistikum',
        'Opioid', 'Generikum', 'Antiparazitika', 'Antimalarikum', 'Heparin', 'Rehydratační roztok', 'Fyziologický roztok'],
    pristroje: ['*Fonendoskop', '*Injekční stříkačka', 'Injekční jehla', '*Skalpel', '*Defibrilátor', '*Kardiostimulátor', '*Inhalátor', '*Invalidní vozík', '*Berla',
        '*Obvaz', '*Náplast', '*Brýle', '*Kontaktní čočka', '*Sluchadlo', 'Kochleární implantát', 'Zubní protéza', '*Protéza', 'Endoskop', 'Glukometr', '*Lékárnička',
        '*Respirátor', 'Rouška', '*Nosítka', '*Sanitka', 'Oftalmoskop', 'Železné plíce', 'Katetr', 'Pinzeta', 'Inzulinová pumpa', 'Zubní implantát', '*Rovnátka',
        'Ortéza', 'Hyperbarická komora', '*Rentgen (zařízení)', 'Holter', 'Gama nůž', 'Zubní vrtačka'],
    lecba: ['*Očkování', '*Transplantace', '*Krevní transfuze', '*Kardiopulmonální resuscitace', '*Anestezie', '*Chemoterapie', '*Radioterapie', '*Dialýza',
        '*Akupunktura', '*Fyzioterapie', 'Rehabilitace', '*Císařský řez', '*Amputace', 'Biopsie', 'Endoskopie', 'Koloskopie', 'Gastroskopie', 'Liposukce',
        '*Asistovaná reprodukce', '*Karanténa', '*První pomoc', '*Heimlichův manévr', 'Zotavovací poloha', 'Tracheostomie', 'Koronární bypass', 'Angioplastika',
        'Lumbální punkce', 'Pouštění žilou', 'Trepanace', 'Lobotomie', 'Homeopatie', 'Sterilizace (mikrobiologie)', 'Pitva', 'Genová terapie', 'Transplantace srdce',
        'Krevní obraz', '*Krevní skupina', '*Krevní tlak', 'Elektrokonvulzivní terapie', 'Masáž', 'Imunoterapie', 'Diagnóza', '*Pandemie', '*Epidemie',
        'Imunita (biologie)', 'Protilátka', 'Antigen', 'Hygiena', 'Klinická studie', '*Operace (medicína)', 'Sutura (medicína)', 'Infuze', '*Injekce', 'Balneologie',
        'Lázně', 'Alternativní medicína', 'Tradiční čínská medicína', 'Ájurvéda', 'Fytoterapie', 'Dezinfekce', 'Třídění pacientů', 'Laparoskopie', 'Zubní plomba',
        '*Darování krve', 'Dárcovství orgánů', 'Antibiotická rezistence', '*Výpočetní tomografie', '*Magnetická rezonance', 'Mamografie',
        'Pozitronová emisní tomografie', 'Elektroencefalografie', 'Spirometrie', '*Lékařská ultrasonografie', '*Elektrokardiogram', 'Pulsní oxymetrie', 'Robotická chirurgie']
};
// Název podle článku, kde český název ve Wikidatech sedí na jinou věc (článek o přístroji má název „radiografie“, o oboru „praktický lékař“)
const MEDICINE_NAMES = { 'Rentgen (zařízení)': 'Rentgen', 'Praktické lékařství': 'Praktické lékařství' };
// Druh položky (ty, štítek u karty); otázku podle druhu („Který lékařský obor to je?“) má topics/biologie.js (KIND_QUESTIONS)
const MEDICINE_GROUPS = {
    obory: { ty: 'lékařský obor' },
    leky: { ty: 'lék' },
    pristroje: { ty: 'přístroj či pomůcka' },
    lecba: { ty: 'vyšetření, léčba či pojem' }
};
// Fotky oborů a zákroků bývají z operačních sálů a pitev (Chirurgie, Transplantace srdce) – takové položky fotku nemají
const NO_IMAGE = /chirurg|patolog|traumatolog|soudní|porod|gynekolog|urolog|proktolog|sexuolog|androlog|venerolog|transplant|amputac|císařsk|biops|pitva|trepanac|lobotom|liposukc|bypass|angioplast|tracheostom|laparoskop|endoskop|gastroskop|koloskop|punkc|operac|sutura|pouštění|asistovaná reprodukce|anatomie|embryolog|histolog/iu;

const buildMedicine = async ({ taken, published, diseases }) => {
    const entries = Object.entries(MEDICINE).flatMap(([group, titles]) => titles.map(raw => ({ group, title: raw.replace(/^\*/, ''), known: raw.startsWith('*') })));
    const resolved = new Map((await resolveTitles('biologie-lekarstvi-titles', entries.map(entry => entry.title))).map(([title, qid, sl]) => [title, { qid, sl }]));
    const missing = entries.filter(entry => !resolved.has(entry.title)).map(entry => entry.title);
    if (missing.length) console.log(`  lékařství – články nenalezeny: ${missing.join(', ')}`);
    const found = entries.filter(entry => resolved.has(entry.title)).map(entry => ({ ...entry, ...resolved.get(entry.title) }));
    const details = await fetchDetails('biologie-lekarstvi-details', unique(found.map(entry => entry.qid)), [
        labelled('P61', 'by'), plain('P575', 'year'), labelled('P2175', 'treats'), labelled('P279', 'sup'), labelled('P1995', 'spec')
    ], 80);
    // Orgány, kterými se obor zabývá (P2579 „studováno oborem“ u orgánu)
    const specialties = found.filter(entry => entry.group === 'obory').map(entry => entry.qid);
    const organs = await cached(keyOf('biologie-lekarstvi-organs', specialties), async () => {
        const rows = await qlever(`SELECT ?spec ?l WHERE { VALUES ?spec { ${values(specialties)} }
  ?organ wdt:P2579 ?spec . ?organ wdt:P1402 [] . ?organ rdfs:label ?l FILTER(LANG(?l) = "cs") }`);
        return rows.map(row => [id(row.spec.value), row.l.value]);
    });
    const organsOf = new Map();
    for (const [qid, label] of organs) organsOf.set(qid, [...(organsOf.get(qid) || []), label]);
    // Nemoci z tématu podle oboru (známé napřed): „Léčí třeba: infarkt myokardu, arytmie“
    const diseasesOf = (label) => diseases.filter(item => (item.f.spec || []).map(lower).includes(label))
        .sort((a, b) => (b.fixed || 0) - (a.fixed || 0) || (b.sl || 0) - (a.sl || 0)).map(item => item.n);
    const items = [];
    for (const entry of found) {
        const detail = details.get(entry.qid) || {};
        const label = MEDICINE_NAMES[entry.title] || first(detail, 'n') || entry.title.replace(/ \(.*\)$/, '');
        const name = capitalize(label);
        if (taken.ids.has(entry.qid) || taken.names.has(name.toLocaleLowerCase('cs'))) continue;
        taken.ids.add(entry.qid);
        taken.names.add(name.toLocaleLowerCase('cs'));
        const image = NO_IMAGE.test(label) ? undefined : (detail.im || []).map(fileOf).find(file => file && !GORY_MEDICAL.test(file) && !taken.images.has(file));
        if (image) taken.images.add(image);
        const year = yearOf(first(detail, 'year'));
        items.push(compact({
            q: entry.qid,
            t: first(detail, 't') || entry.title,
            n: name,
            c: 'lekarstvi',
            ty: MEDICINE_GROUPS[entry.group].ty,
            d: first(detail, 'd'),
            ...imageOf(image),
            al: aliasesOf(detail, label),
            f: compact({
                kind: entry.group,
                org: entry.group === 'obory' ? unique((organsOf.get(entry.qid) || []).map(organ => BODY_LABEL[organ] || organ)).filter(organ => !sharesRoot(organ, label)).slice(0, 3) : undefined,
                dis: entry.group === 'obory' ? diseasesOf(lower(label)).filter(disease => !sharesRoot(disease, label)).slice(0, 3) : undefined,
                treats: entry.group !== 'obory' ? unique(detail.treats || []).filter(disease => !sharesRoot(disease, label)).slice(0, 3) : undefined,
                by: unique(detail.by || []).filter(person => !sharesRoot(person, label)).slice(0, 2),
                year: year && year > 1000 && year <= 2026 ? year : undefined
            }),
            sl: Number(first(detail, 'sl')) || entry.sl,
            grp: entry.group,
            fixed: entry.known ? 1 : undefined
        }));
    }
    return items;
};

// --- Slavní lékaři a psychologové ---
const PHYSICIAN_OCCUPATIONS = ['Q39631', 'Q774306', 'Q2055046', 'Q10872101', 'Q3779582', 'Q186360'];
const PSYCHOLOGY_OCCUPATIONS = ['Q212980', 'Q211346', 'Q3410028'];
const NOBEL_MEDICINE = 'Q80061';
const FEMALE = 'Q6581072';
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266']);
// Popis musí říkat, že jde o lékaře či vědce medicíny (povolání lékař mají ve Wikidatech i Čechov, Schiller nebo Che Guevara)
const MEDICAL_WORD = /(?<![\p{L}])(lékař|lékařka|chirurg|chirurgyně|fyziolog|fyzioložka|anatom|anatomka|neurolog|neuroložka|imunolog|imunoložka|bakteriolog|mikrobiolog|mikrobioložka|patolog|epidemiolog|farmakolog|farmakoložka|virolog|viroložka|kardiolog|pediatr|pediatrička|gynekolog|porodník|oftalmolog|internista|zdravotní sestra|ošetřovatelka|histolog|embryolog|endokrinolog|onkolog|parazitolog|hematolog|sexuolog|psychiatr|psychiatrička|biochemik|biochemička|genetik|genetička|molekulární biolog|molekulární bioložka|neurověd|lékař-)/iu;
const PSYCHOLOGY_WORD = /(?<![\p{L}])(psycholog|psycholožka|psychoanalyti|psychoterapeut|psychiatr)/iu;
// Lidé, kteří jsou slavní něčím jiným (politika, literatura, filozofie, věštby) nebo do kvízu nepatří (nacističtí lékaři)
const NOT_DOCTORS = new Set(['Josef Mengele', 'Che Guevara', 'Anton Pavlovič Čechov', 'Carl Linné', 'Michail Bulgakov', 'Friedrich Schiller', 'John Keats']);
const NOT_DOCTOR_WORD = /nacist|vrah|zločin|politi[kc]|prezident|spisovatel|básník|dramatik|filozof|filosof|teolog|kněz|revolucion|věštec|astrolog|matematik|botanik|zoolog|cestovatel|herec|zpěvák/iu;
// Kdekoli v popisu: lékař, který se proslavil politikou, literaturou nebo zločiny (Allende, Marat, Schnitzler, Mengele)
const NOT_DOCTOR_ANYWHERE = /nacist|zločin|politi[kc]|prezident|spisovatel|básník|dramatik|revolucion/iu;
// Nejznámější lékaři a psychologové (české jméno ve Wikidatech) – známí vždy; ostatní podle počtu jazykových verzí
const DOCTORS_KNOWN = ['Hippokratés', 'Galén', 'Avicenna', 'Paracelsus', 'Andreas Vesalius', 'William Harvey', 'Edward Jenner', 'Louis Pasteur', 'Robert Koch',
    'Ignác Filip Semmelweis', 'Joseph Lister', 'Florence Nightingaleová', 'Alexander Fleming', 'Ivan Petrovič Pavlov', 'Jan Evangelista Purkyně', 'Jan Jesenius',
    'Jan Janský', 'Christiaan Barnard', 'Albert Schweitzer', 'Alois Alzheimer', 'Jonas Salk', 'Frederick Banting', 'James D. Watson',
    'Francis Crick', 'René Théophile Hyacinthe Laënnec', 'Samuel Hahnemann', 'Eduard Albert', 'Ludvík Lazar Zamenhof', 'Hans Asperger', 'Emil Adolf von Behring',
    'Rudolf Virchow', 'Santiago Ramón y Cajal', 'Anthony Fauci', 'Benjamin Spock', 'Elizabeth Blackwell', 'Josef Thomayer', 'Gerty Coriová', 'Carl Ferdinand Cori'];
const PSYCHOLOGISTS_KNOWN = ['Sigmund Freud', 'Carl Gustav Jung', 'Alfred Adler', 'Jean Piaget', 'Abraham Maslow', 'Burrhus Frederic Skinner', 'Erich Fromm',
    'Viktor Frankl', 'Wilhelm Wundt', 'William James', 'Hermann Rorschach', 'Stanley Milgram', 'Philip Zimbardo', 'Daniel Kahneman', 'Erik Erikson',
    'Elisabeth Kübler-Rossová', 'Jordan Peterson', 'Anna Freudová', 'John Watson', 'Miroslav Plzák', 'Zdeněk Matějček', 'Stanislav Grof', 'Franz Anton Mesmer'];
// Psychiatři a neurologové, kteří se proslavili psychologií (psychoanalýza, logoterapie, Rorschachův test) – jdou do psychologie
const PSYCHOLOGY_PEOPLE = new Set(['Sigmund Freud', 'Carl Gustav Jung', 'Alfred Adler', 'Viktor Frankl', 'Hermann Rorschach', 'Anna Freudová', 'Miroslav Plzák',
    'Stanislav Grof', 'Franz Anton Mesmer', 'Elisabeth Kübler-Rossová', 'Karen Horneyová', 'Eric Berne', 'Ronald David Laing', 'Wilhelm Reich']);
// Kolik lékařů a psychologů (i se známými): víc by byli samí nositelé Nobelovy ceny, které zná málokdo
const DOCTORS_LIMIT = 120;
const PSYCHOLOGISTS_LIMIT = 80;
// Obor (P101): jen lékařské a psychologické (u Avicenny je ve Wikidatech i poezie, u Pavlova vzdělávání)
const MEDICAL_FIELD = /log|lékař|medic|chirurg|anatom|psych|genet|imun|bakter|farma|neuro|kardi|onkol|pediatr|epidemi|biochem|fyziolog|terap|hygien|virol|parazit|ošetřov|zdravot/iu;
const GENERIC_FIELD = /^(lékařství|medicína|věda|biologie|přírodní vědy|filozofie|psychologie|výzkum|teologie|astrologie|ekologie|zoologie|botanika|geologie|meteorologie|technologie|ideologie|mytologie|archeologie|sociologie)$/iu;

const PSYCHOLOGY_KINDS = [['psychoanaly', 'psychoanalytik', 'psychoanalytička'], ['psychiatr', 'psychiatr', 'psychiatrička'], ['psychoterap', 'psychoterapeut', 'psychoterapeutka']];
const kindOfPerson = (description, female, psychology) => {
    // Psychologie: psychoanalytik, psychiatr, psychoterapeut, jinak psycholog (Freud „lékař-neurolog, zakladatel psychoanalýzy“ je psychoanalytik)
    if (psychology) {
        const kind = PSYCHOLOGY_KINDS.find(([stem]) => new RegExp(stem, 'iu').test(description || ''));
        return kind ? kind[female ? 2 : 1] : female ? 'psycholožka' : 'psycholog';
    }
    const words = [['psychiatr', 'psychiatrička'], ['psycholog', 'psycholožka'], ['psychoanalytik', 'psychoanalytička'], ['psychoterapeut', 'psychoterapeutka'],
        ['chirurg', 'chirurgyně'], ['fyziolog', 'fyzioložka'], ['neurolog', 'neuroložka'], ['imunolog', 'imunoložka'], ['mikrobiolog', 'mikrobioložka'],
        ['bakteriolog', 'bakterioložka'], ['virolog', 'viroložka'], ['anatom', 'anatomka'], ['patolog', 'patoložka'], ['farmakolog', 'farmakoložka'],
        ['biochemik', 'biochemička'], ['genetik', 'genetička'], ['zdravotní sestra', 'zdravotní sestra'], ['lékař', 'lékařka']];
    const text = String(description || '').toLocaleLowerCase('cs');
    const found = words.map(([male, woman]) => ({ male, woman, at: text.search(new RegExp(`(?<![\\p{L}])(${male}|${woman})`, 'u')) }))
        .filter(entry => entry.at >= 0).sort((a, b) => a.at - b.at)[0];
    if (found) return female ? found.woman : found.male;
    return psychology ? (female ? 'psycholožka' : 'psycholog') : (female ? 'lékařka' : 'lékař');
};

const buildPeople = async ({ taken, published }) => {
    const candidates = await cached('biologie-lekari-candidates', async () => {
        const rows = await qlever(`SELECT DISTINCT ?item ?sl ?kind WHERE {
  { VALUES ?occ { ${values(PHYSICIAN_OCCUPATIONS)} } ?item wdt:P106 ?occ BIND("med" AS ?kind) }
  UNION { ?item wdt:P166 wd:${NOBEL_MEDICINE} BIND("med" AS ?kind) }
  UNION { VALUES ?occ { ${values(PSYCHOLOGY_OCCUPATIONS)} } ?item wdt:P106 ?occ BIND("psy" AS ?kind) }
  ?item wdt:P31 wd:Q5 . ?item wikibase:sitelinks ?sl FILTER(?sl >= 20) ${csArticle} }`);
        const named = await qlever(`SELECT ?item ?sl WHERE { VALUES ?l { ${[...DOCTORS_KNOWN, ...PSYCHOLOGISTS_KNOWN].map(name => `"${name}"@cs`).join(' ')} }
  ?item rdfs:label ?l ; wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl . ${csArticle} }`);
        return [...rows.map(row => [id(row.item.value), Number(row.sl.value)]), ...named.map(row => [id(row.item.value), Number(row.sl.value)])];
    });
    const sitelinks = new Map();
    for (const [qid, sl] of candidates) sitelinks.set(qid, Math.max(sl, sitelinks.get(qid) || 0));
    for (const qid of published) if (!sitelinks.has(qid)) sitelinks.set(qid, 0);
    const ordered = [...sitelinks.keys()].sort((a, b) => sitelinks.get(b) - sitelinks.get(a));
    const details = await fetchDetails('biologie-lekari-details', ordered, [
        plain('P569', 'born'), plain('P570', 'died'), plain('P21', 'sex'), labelled('P27', 'cit'), plain('P27', 'citq'), plain('P166', 'award'),
        labelled('P101', 'field'), labelled('P800', 'work'),
        'UNION { ?x wdt:P61 ?item . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("disc" AS ?p) }'
    ], 60);
    const knownDoctors = new Set(DOCTORS_KNOWN);
    const knownPsychologists = new Set(PSYCHOLOGISTS_KNOWN);
    const items = [];
    const counts = { lekari: 0, psychologie: 0 };
    for (const qid of ordered) {
        const detail = details.get(qid) || {};
        const title = first(detail, 't');
        const label = first(detail, 'n') || (title || '').replace(/ \(.*\)$/, '');
        const description = first(detail, 'd') || '';
        const born = yearOf(first(detail, 'born'));
        if (!title || !label || born === undefined || NOT_DOCTORS.has(label)) continue;
        const isKnown = knownDoctors.has(label) || knownPsychologists.has(label);
        // Psychologie: psychologové, psychoanalytici a psychoterapeuti; psychiatři bez psychologie v popisu jsou mezi lékaři
        const psychology = PSYCHOLOGY_PEOPLE.has(label) || knownPsychologists.has(label)
            || (!knownDoctors.has(label) && /psycholog|psychoanalyti|psychoterapeut/iu.test(description));
        const nobel = (detail.award || []).includes(NOBEL_MEDICINE);
        const medical = MEDICAL_WORD.test(description) || nobel;
        if (!isKnown && !published.has(qid)) {
            if (!(psychology ? PSYCHOLOGY_WORD.test(description) : medical)) continue;
            // Slavní hlavně něčím jiným: první slovo popisu po národnosti není lékařské (Čechov „ruský dramatik“, Linné „botanik, lékař“)
            const firstNoun = (description.replace(/\([^)]*\)/g, '').split(/[\s,;]+/u).find(word => word.length > 2 && !/(ský|cký|ská|cká|ské|cké|ní|ný|ná|ový|ová|ý|á|í)$/u.test(word.toLocaleLowerCase('cs'))) || '');
            if (NOT_DOCTOR_WORD.test(firstNoun) || NOT_DOCTOR_ANYWHERE.test(description) || (!MEDICAL_WORD.test(firstNoun) && !PSYCHOLOGY_WORD.test(firstNoun) && !nobel)) continue;
            if (psychology && !PSYCHOLOGY_WORD.test(firstNoun)) continue;
        }
        // Bez fotky se osobnost v kvízu špatně poznává (James Parkinson žádný portrét nemá)
        if (!first(detail, 'im')) continue;
        const category = psychology ? 'psychologie' : 'lekari';
        if (counts[category] >= (psychology ? PSYCHOLOGISTS_LIMIT : DOCTORS_LIMIT) && !isKnown && !published.has(qid)) continue;
        if (taken.ids.has(qid) || taken.names.has(label.toLocaleLowerCase('cs'))) continue;
        // Portrét: přednostně soubor se jménem osobnosti (u Fleminga je mezi obrázky i továrna na penicilin)
        const surname = (word) => word.length >= 4 && !/^(von|van|der|den)$/iu.test(word);
        const nameWords = fold(label).split(/[^a-z]+/).filter(surname);
        const images = (detail.im || []).map(fileOf).filter(file => file && !MEMORIAL.test(file) && !taken.images.has(file));
        const image = images.find(file => nameWords.some(word => fold(file).includes(word))) || images[0];
        if (!image) continue;
        taken.images.add(image);
        taken.ids.add(qid);
        taken.names.add(label.toLocaleLowerCase('cs'));
        counts[category]++;
        const female = first(detail, 'sex') === FEMALE;
        const died = yearOf(first(detail, 'died'));
        // Čech: popis začíná „český“ či „československý“, nebo občanství Česka a popis bez jiné národnosti
        const isCzech = /^(česk|československ|moravsk)/iu.test(description) || ((detail.citq || []).some(country => CZECH_STATES.has(country)) && !/^\p{L}+(ský|cký|ská|cká)\s/u.test(description));
        items.push(compact({
            q: qid,
            t: title,
            n: label,
            c: category,
            ty: kindOfPerson(description, female, psychology),
            sx: female ? 'f' : undefined,
            d: description || undefined,
            cz: isCzech ? 1 : undefined,
            ...imageOf(image),
            f: compact({
                born,
                died,
                // Příslušnost podle popisu (Wikidata uvádějí i historické státy); Čech z dob Rakouska i Československa je z Česka
                land: isCzech ? 'Česko' : landByDescription(description, detail.cit || []),
                nobel: nobel ? 1 : undefined,
                field: unique(detail.field || []).filter(field => MEDICAL_FIELD.test(field) && !GENERIC_FIELD.test(field)).slice(0, 2),
                known: unique([...(detail.disc || []), ...(detail.work || [])]).filter(work => !sharesRoot(work, label) && work.length <= 50).slice(0, 2),
                y: born + 35
            }),
            sl: sitelinks.get(qid),
            grp: psychology ? 'psychologove' : 'lekari',
            fixed: isKnown ? 1 : undefined
        }));
    }
    return items;
};

// --- Psychologie: pojmy, jevy, fobie a experimenty ---
const PSYCHOLOGY = {
    pojmy: ['*Inteligence', '*Inteligenční kvocient', '*Emoce', '*Paměť', '*Vědomí', '*Nevědomí', '*Sen', '*Hypnóza', '*Temperament', '*Cholerik', '*Sangvinik',
        '*Flegmatik', '*Melancholik', '*Extraverze a introverze', '*Osobnost', '*Ego, superego a id', '*Libido', '*Narcismus', 'Frustrace', '*Stres', 'Agrese',
        'Altruismus', '*Empatie', 'Charisma', 'Intuice', 'Introspekce', 'Tvořivost', 'Flow', 'Motivace', 'Sebevědomí', '*Komplex méněcennosti', '*Oidipovský komplex',
        'Elektřin komplex', '*Déjà vu', 'Jamais vu', '*Stockholmský syndrom', '*Syndrom vyhoření', '*Prokrastinace', '*Úzkost', '*Strach', 'Hněv', 'Žárlivost', 'Stud',
        'Nuda', 'Nostalgie', 'Asertivita', '*Šikana', 'Mobbing', 'Gaslighting', '*Maslowova pyramida', 'Emoční inteligence', 'Archetyp', 'Kolektivní nevědomí',
        'Synestezie', 'Pareidolie', '*Optický klam', 'Katarze', 'Ego-obranný mechanismus', 'Sublimace (psychologie)', 'Projekce (psychologie)', 'Vytěsnění',
        'Racionalizace (psychologie)', 'Regrese (psychologie)', 'Učení', 'Pozornost', 'Vnímání', 'Myšlení', 'Fantazie', 'Instinkt', 'Zvyk', '*Závislost',
        'Resilience (psychologie)', 'Řeč těla', 'Neverbální komunikace', 'Konformita', 'Psychologie davu', 'Skupinová dynamika', 'Socializace', 'Psychopatie',
        'Sociopatie', 'Krize středního věku', 'Tréma'],
    smery: ['*Psychoanalýza', '*Behaviorismus', 'Gestaltismus', 'Kognitivní psychologie', 'Humanistická psychologie', 'Pozitivní psychologie', 'Sociální psychologie',
        'Vývojová psychologie', 'Klinická psychologie', 'Pedagogická psychologie', 'Psychologie osobnosti', 'Neuropsychologie', 'Forenzní psychologie',
        'Psychologie sportu', 'Psychologie práce', 'Psychologie náboženství', 'Parapsychologie', '*Psychoterapie', 'Kognitivně behaviorální terapie', 'Hypnoterapie',
        'Gestalt terapie', 'Arteterapie', 'Muzikoterapie', 'Dramaterapie', 'Psychodrama', 'Logoterapie', 'Skupinová psychoterapie'],
    zkresleni: ['*Dunningův–Krugerův efekt', '*Haló efekt', '*Efekt přihlížejícího', '*Konfirmační zkreslení', '*Kognitivní disonance', '*Kognitivní zkreslení',
        'Kotvení (psychologie)', 'Forerův efekt', 'Hawthornský efekt', 'Efekt prostého vystavení', 'Sebenaplňující předpověď', 'Nocebo', 'Utopené náklady',
        'Efekt falešného konsenzu', 'Heuristika dostupnosti', 'Klam přeživších'],
    experimenty: ['*Milgramův experiment', '*Stanfordský vězeňský experiment', '*Rorschachův test', 'Aschův experiment', 'Rosenhanův experiment', 'Stroopův test',
        '*Polygraf', 'Big Five', 'Myers-Briggs Type Indicator', 'Inteligenční test', 'Psychologický test']
};
// Druh položky (ty); otázky podle druhu v topics/biologie.js (KIND_QUESTIONS)
const PSYCHOLOGY_GROUPS = {
    pojmy: { ty: 'pojem z psychologie' },
    smery: { ty: 'obor či směr psychologie' },
    zkresleni: { ty: 'psychologický jev' },
    experimenty: { ty: 'experiment či test' },
    fobie: { ty: 'fobie' }
};
// Fobie s klinickým názvem, které nic nevysvětlí (sociální fobie je porucha, ne strach z věci), do okruhu nepatří
// (fotofobie a hydrofobie jsou příznaky – světloplachost, vzteklina –, ne strach)
const PHOBIA_SKIP = /^(fobie|specifická fobie|sociální fobie|fotofobie|hydrofobie|homofobie)$/iu;
// Kognitivní zkreslení podle Wikidat, která jsou spíš matematikou, ekonomií či sociologií
const NOT_PSYCHOLOGY = /^(monty hall|iracionalita|časová preference|motonormativita|berksonův paradox|spirála mlčení|locus of control)/iu;
const KNOWN_PHOBIAS = new Set(['arachnofobie', 'klaustrofobie', 'akrofobie', 'agorafobie', 'aviofobie', 'xenofobie', 'technofobie', 'nomofobie', 'hematofobie']);

const buildPsychology = async ({ taken, published, phobias }) => {
    const entries = Object.entries(PSYCHOLOGY).flatMap(([group, titles]) => titles.map(raw => ({ group, title: raw.replace(/^\*/, ''), known: raw.startsWith('*') })));
    const resolved = new Map((await resolveTitles('biologie-psychologie-titles', unique(entries.map(entry => entry.title)))).map(([title, qid, sl]) => [title, { qid, sl }]));
    const missing = unique(entries.filter(entry => !resolved.has(entry.title)).map(entry => entry.title));
    if (missing.length) console.log(`  psychologie – články nenalezeny: ${missing.join(', ')}`);
    // Kognitivní zkreslení podle Wikidat a fobie (druh nemoci s názvem na -fobie)
    const extra = await cached('biologie-psychologie-extra', async () => {
        const biases = await qlever(`SELECT DISTINCT ?item ?sl WHERE { ?item wdt:P31 wd:Q1127759 . ?item wikibase:sitelinks ?sl FILTER(?sl >= 20) ${csArticle} }`);
        const fears = await qlever(`SELECT DISTINCT ?item ?sl WHERE { { ?item wdt:P31 wd:Q175854 } UNION { ?item wdt:P279 wd:Q175854 }
  ?item wikibase:sitelinks ?sl FILTER(?sl >= 12) ${csArticle} }`);
        return [...biases.map(row => ['zkresleni', id(row.item.value), Number(row.sl.value)]), ...fears.map(row => ['fobie', id(row.item.value), Number(row.sl.value)])];
    });
    for (const [qid, sl] of phobias) extra.push(['fobie', qid, sl]);
    const list = [...entries.filter(entry => resolved.has(entry.title)).map(entry => ({ ...entry, ...resolved.get(entry.title) })),
        ...extra.map(([group, qid, sl]) => ({ group, qid, sl, known: false }))];
    for (const qid of published) if (!list.some(entry => entry.qid === qid)) list.push({ group: null, qid, sl: 0, known: false });
    // Jedna položka jen jednou (první okruh ze seznamu má přednost)
    const byId = new Map();
    for (const entry of list) if (!byId.has(entry.qid)) byId.set(entry.qid, entry);
    const details = await fetchDetails('biologie-psychologie-details', [...byId.keys()], [
        labelled('P61', 'by'), labelled('P138', 'named'), plain('P575', 'year'), plain('P31', 'type')
    ], 80);
    const items = [];
    for (const entry of [...byId.values()].sort((a, b) => b.sl - a.sl)) {
        const detail = details.get(entry.qid) || {};
        const title = first(detail, 't');
        const label = first(detail, 'n') || (title || '').replace(/ \(.*\)$/, '');
        if (!title || !label || (detail.type || []).includes('Q4167410') || (detail.type || []).includes('Q5')) continue;
        const group = PHOBIA.test(label) ? 'fobie' : entry.group;
        if (!group || (group === 'fobie' && (PHOBIA_SKIP.test(label) || !PHOBIA.test(label))) || NOT_PSYCHOLOGY.test(label)) continue;
        const name = capitalize(label);
        if (taken.ids.has(entry.qid) || taken.names.has(name.toLocaleLowerCase('cs'))) continue;
        taken.ids.add(entry.qid);
        taken.names.add(name.toLocaleLowerCase('cs'));
        const image = (detail.im || []).map(fileOf).find(file => file && !GORY_MEDICAL.test(file) && !taken.images.has(file));
        if (image) taken.images.add(image);
        const year = yearOf(first(detail, 'year'));
        items.push(compact({
            q: entry.qid,
            t: title,
            n: name,
            c: 'psychologie',
            ty: PSYCHOLOGY_GROUPS[group].ty,
            d: first(detail, 'd'),
            ...imageOf(image),
            al: aliasesOf(detail, label),
            f: compact({
                kind: group,
                by: unique([...(detail.by || []), ...(detail.named || [])]).filter(person => !sharesRoot(person, label)).slice(0, 2),
                year: year && year > 1500 && year <= 2026 ? year : undefined
            }),
            sl: Number(first(detail, 'sl')) || entry.sl,
            grp: group,
            fixed: entry.known || KNOWN_PHOBIAS.has(lower(label)) ? 1 : undefined
        }));
    }
    return items;
};

// --- Okruhy ---
const BY_NAME = { by: 'name' };
export const HEALTH_COLLECTIONS = [
    ...ICD_CHAPTERS.filter(([, , key], index, all) => all.findIndex(entry => entry[2] === key) === index).map(([, , key, label]) => ({
        id: `nemoci-${key}`, label: capitalize(label), sort: BY_NAME, test: item => item.c === 'nemoci' && item.grp === key
    })),
    { id: 'detske-nemoci', label: 'Dětské nemoci', text: 'Spalničky, zarděnky, příušnice, plané neštovice…', sort: BY_NAME, test: item => item.c === 'nemoci' && item.child === 1 },
    { id: 'ockovani', label: 'Nemoci, proti kterým se očkuje', sort: BY_NAME, test: item => item.c === 'nemoci' && item.f.vac === 1 },
    { id: 'lekarske-obory', label: 'Lékařské obory', text: 'Kardiologie, pediatrie, stomatologie…', sort: BY_NAME, test: item => item.c === 'lekarstvi' && item.grp === 'obory' },
    { id: 'leky', label: 'Léky', text: 'Antibiotika, očkovací látky, analgetika…', sort: BY_NAME, test: item => item.c === 'lekarstvi' && item.grp === 'leky' },
    { id: 'lekarske-pristroje', label: 'Lékařské přístroje a pomůcky', text: 'Fonendoskop, defibrilátor, magnetická rezonance…', sort: BY_NAME, test: item => item.c === 'lekarstvi' && item.grp === 'pristroje' },
    { id: 'vysetreni-lecba', label: 'Vyšetření a léčba', text: 'Očkování, transplantace, resuscitace…', sort: BY_NAME, test: item => item.c === 'lekarstvi' && item.grp === 'lecba' },
    // Nositelé Nobelovy ceny okruh nemají: většinu z nich zná málokdo a spodní hranice známých v okruhu by je povýšila na Základní
    { id: 'lekari-davnych-dob', label: 'Lékaři dávných dob', text: 'Od Hippokrata po Jennera', sort: { by: 'y' }, test: item => item.c === 'lekari' && item.f.born < 1800 },
    { id: 'cesti-lekari', label: 'Čeští lékaři', sort: { by: 'y' }, test: item => item.c === 'lekari' && item.cz === 1 },
    { id: 'psychologove', label: 'Psychologové', sort: { by: 'y' }, test: item => item.c === 'psychologie' && item.grp === 'psychologove' },
    { id: 'psychologicke-pojmy', label: 'Psychologické pojmy', text: 'Temperament, inteligence, empatie…', sort: BY_NAME, test: item => item.c === 'psychologie' && item.grp === 'pojmy' },
    { id: 'psychologicke-smery', label: 'Obory a směry psychologie', text: 'Psychoanalýza, behaviorismus, arteterapie…', sort: BY_NAME, test: item => item.c === 'psychologie' && item.grp === 'smery' },
    { id: 'psychologicke-jevy', label: 'Psychologické jevy a zkreslení', text: 'Dunningův–Krugerův efekt, déjà vu…', sort: BY_NAME, test: item => item.c === 'psychologie' && item.grp === 'zkresleni' },
    { id: 'fobie', label: 'Fobie', text: 'Arachnofobie, klaustrofobie…', sort: BY_NAME, test: item => item.c === 'psychologie' && item.grp === 'fobie' },
    { id: 'psychologicke-experimenty', label: 'Slavné experimenty a testy', sort: BY_NAME, test: item => item.c === 'psychologie' && item.grp === 'experimenty' }
];

// Úrovně: pořadí známosti podle jazykových verzí v každé skupině (nemoci, lékařství, lékaři, psychologové, psychologické pojmy);
// známé jsou ručně vybrané nejznámější položky (fixed), u nemocí navíc nejvíc přeložené; v každém okruhu a kategorii aspoň čtvrtina známých
const KNOWN_SHARE = { nemoci: 0.2 };
const PROMOTE_PCT = 0.65;
export const assignHealthLevels = (items, collections) => {
    for (const item of items) {
        item.k = item.fixed ? 1 : 0;
        delete item.x;
        item._ = { sl: item.sl || 0, pool: item.c === 'psychologie' ? `psychologie|${item.grp === 'psychologove' ? 'osoby' : 'pojmy'}` : item.c, fixed: item.fixed === 1 };
    }
    const groups = [
        ...collections.map(collection => ({ id: collection.id, members: items.filter(item => (item.g || []).includes(collection.id)) })),
        ...HEALTH_CATEGORIES.map(key => ({ id: `kategorie ${key}`, members: items.filter(item => item.c === key) }))
    ].filter(group => group.members.length);
    const promoted = assignLevels(items, { groups, knownShare: pool => KNOWN_SHARE[pool] || 0, ceiling: item => item._.pct <= PROMOTE_PCT });
    for (const key of HEALTH_CATEGORIES) console.log('  ' + levelSummary(key, items.filter(item => item.c === key)));
    for (const item of items) delete item._;
    return promoted;
};

// Všechny položky oblasti „člověk a zdraví“. taken = { ids, names, images } už použité v tématu (doplní se o nové);
// published = id položek těchto kategorií z dřívějška – zůstanou, i když by je limit už nevzal
export const buildHealth = async ({ takenIds, takenNames, takenImages = new Set(), published = new Set() }) => {
    const taken = { ids: takenIds, names: takenNames, images: takenImages };
    const { items: diseases, phobias } = await buildDiseases({ taken, published });
    const medicine = await buildMedicine({ taken, published, diseases });
    const people = await buildPeople({ taken, published });
    const psychology = await buildPsychology({ taken, published, phobias });
    const items = [...diseases, ...medicine, ...people, ...psychology];
    for (const item of items) {
        const groups = HEALTH_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
        if (groups.length) item.g = groups;
    }
    const collections = HEALTH_COLLECTIONS.map(({ test, ...collection }) => collection)
        .filter(collection => items.filter(item => (item.g || []).includes(collection.id)).length >= 5);
    assignHealthLevels(items, collections);
    for (const item of items) {
        delete item.sl; delete item.grp; delete item.child; delete item.fixed;
        if (!item.al || !item.al.length) delete item.al;
    }
    for (const key of HEALTH_CATEGORIES) {
        const list = items.filter(item => item.c === key);
        console.log(`${key}: ${list.length} (${list.filter(item => item.k).length} známých, ${list.filter(item => item.im).length} s obrázkem)`);
    }
    return { items, collections };
};
