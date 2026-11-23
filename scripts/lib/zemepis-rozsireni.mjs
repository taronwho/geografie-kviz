// Zeměpis – rozšíření tématu: památky UNESCO (kategorie dedictvi: historická města a centra, naleziště, kulturní krajiny),
// národní parky a přírodní dědictví UNESCO (kategorie priroda), moře, zálivy, průlivy a fjordy (kategorie jezero), okruhy k nim
// a fakta: rok zápisu do UNESCO, největší hloubka, rekordy přírody a úřední jazyky států.
//
// Existující položky zůstanou beze změny id i kategorie; přidávají se nové položky, okruhy a fakta. Známost existujících se mění jen
// u přírody kvůli spodní hranici nového okruhu Národní parky (viz FLOOR_VIEWS). Volá se na konci scripts/build-zemepis.mjs
// i samostatně nad hotovými daty: node scripts/build-zemepis.mjs --doplnit (asi 10 minut; s BUILD_CACHE=složka podruhé bez stahování).
//
// Známost nových položek: jazykové verze Wikipedie (sitelinks) a návštěvnost článku na české Wikipedii za rok 2025 (zná ho český
// hráč?), viz LEVELS; pro experty (x = 1) nejméně navštěvovaná třetina nových míst kategorie.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { sparql, id, round, values, parsePoint, imageFields, cached, sleep, CZECHIA } from './wikidata.mjs';
import { czechPageviews, cachedByKey, knownFloor } from './zemepis-levels.mjs';
import { articleTargets } from './clanky.mjs';

const require = createRequire(import.meta.url);
const { getContinent, normalizeAnswer, isRealPhoto } = require('../../quiz-core.js');
const topic = require('../../topics/zemepis.js');

const WORLD_HERITAGE_SITE = 'Q9259';
// Izraelské „národní parky“ jsou archeologická naleziště (Šivta, Arsuf), ne přírodní parky
const NOT_PARK_TYPES = new Set(['Q1814183']);
const NATIONAL_PARK = 'Q46169';
// Moře, zálivy, průlivy a fjordy (oceány už v datech jsou všechny). Vnitřní a okrajová moře (Středozemní, Baltské) mají druh podle
// Wikidat: „Ukaž na mapě“ se na ně (zatím) neptá, chybí jim obrys v data/mapa-tvary.json (question-map.js KINDS je nezná)
const SEA_TYPES = {
    Q165: 'moře', Q1973404: 'vnitřní moře', Q204894: 'okrajové moře', Q2578218: 'okrajové moře',
    Q1322134: 'zátoka', Q39594: 'zátoka', Q37901: 'průliv', Q1210950: 'průliv', Q45776: 'fjord'
};
const SEA_ORDER = ['moře', 'vnitřní moře', 'okrajové moře', 'zátoka', 'průliv', 'fjord'];
export const SEA_KINDS = new Set(['oceán', ...SEA_ORDER]);
// Kolik jazykových verzí musí mít kandidát (u parků a moří jako dřív u přírody a vodních ploch); park s méně verzemi jen tehdy,
// když ho čeští čtenáři znají (návštěvnost článku aspoň PARK_MIN_VIEWS za rok: parky v sousedních státech)
const MIN_SITELINKS = { park: 25, sea: 25, heritage: 20 };
const PARK_SITELINKS = 30;
const PARK_MIN_VIEWS = 800;
// Ručně vyřazené: bývalé moře (Zuiderzee), záliv a průliv se jménem slavnějšího (Zlatý roh ve Vladivostoku, Východní Bospor),
// linie GIUK, Dessau (obec, ne památka); budovy, které druh v datech nemá (klášter Visoki Dečani, svatyně Bom Jesus a Čongmjo,
// burza Llotja de la Seda, domy Victora Horty, budova ESMA); park Bejt Guvrin (archeologické naleziště, plete se s parky); jméno
// ze čtyř parků oddělených lomítky; fotka jiného místa nebo věci (Longs Peak v USA u kanadských parků, socha u univerzitního
// města v Caracasu, žralok u útesu Tubbataha, družicový snímek u parku Waterton-Glacier); argentinský Národní park Iguazú se jménem
// i fotkou plete s brazilským Iguaçu, lesní komplex Dong Phayayen–Khao Yai má fotku parku Khao Yai
const SKIP = new Set(['Q228655', 'Q715148', 'Q715174', 'Q922019', 'Q487070', 'Q849517', 'Q1595417', 'Q2707216', 'Q490497', 'Q588009', 'Q1426014',
    'Q1292306', 'Q2407530', 'Q604604', 'Q72895', 'Q1061531', 'Q927108', 'Q828212', 'Q474205', 'Q16963852']);
// Druh u položek, kde ho Wikidata neurčí (štítek otázky)
const TY_OVERRIDES = {
    Q179570: 'historické město', Q235004: 'historické město', Q903792: 'historické město', Q877391: 'historické město',
    Q1756286: 'historická vesnice', Q252814: 'historická vesnice', Q726842: 'historická vesnice',
    Q1238775: 'archeologická lokalita', Q179506: 'archeologická lokalita', Q844427: 'archeologická lokalita', Q20650483: 'archeologická lokalita', Q181123: 'archeologická lokalita',
    Q753162: 'poutní místo', Q332800: 'kulturní krajina', Q61757: 'kulturní krajina', Q562529: 'opevnění', Q837642: 'soubor staveb', Q319296: 'skalní umění',
    Q1330981: 'korálový útes', Q312118: 'geologická lokalita', Q107370: 'národní park', Q828417: 'historické centrum', Q1435206: 'historický přístav',
    // „Historické památky Novgorodu“: štítek „historické město“ by opakoval slovo z názvu
    Q1218832: 'soubor staveb'
};

// Kritéria UNESCO: (i)–(vi) kulturní, (vii)–(x) přírodní
const NATURAL_CRITERIA = new Set(['(vii)', '(viii)', '(ix)', '(x)']);
const CULTURAL_CRITERIA = new Set(['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)']);

// Jednotlivé budovy (kostel, hrad, pevnost, klášter, palác, most, muzeum…) patří do Staveb a Architektury, ne mezi celá místa
const BUILDING_WORDS = /(?<![\p{L}])(?:kostel|kostely|katedrál|bazilik|kapl|rotund|mešit|chrám|svatyn|klášter|opatstv|hrad|hrady|zámek|zámky|zámk|palác|pevnost|citadel|fort|tvrz|kreml|alcázar|muze|věž|most|akvadukt|budov|nádraží|stanic|hal[aey](?![\p{L}])|mauzole|hrob|pomník|památník|sloup|soch|hvězdárn|observato|divadl|oper|synagog|pagod|stúp|pyramid|vila|vily|maják|přehrad|univerzit|knihovn|archiv|nemocnic|radnic|dům|domy|stavební památka|architektonická dominanta|lázně|madras|minaret|mandir|vihár)/iu;
// Druh, podle kterého je to celé místo (naleziště, město, čtvrť, krajina, cesta, kanál, důl, zahrada…), i když má budovu v názvu
const PLACE_WORDS = /(?:archeolog|lokalit|starověk|naleziště|sídliště|sídel|sídl|město|měst|vesnic|obec|obc|čtvr|centrum|jádro|krajin|oblast|region|areál|polis|tell|pobřeží|údolí|ostrov|kanál|silnic|cesta|cest|trať|železnic|důl|dol|hornic|průmysl|zahrad|park|hřbitov|pohřebiš|skaln|jeskyn|grotta|kosa|polder|teras|pole|ksar|oáz|dědictví)/iu;
// Celé místo podle názvu (Velký kanál, Staré Město), jen celá slova
const NAME_PLACE_WORDS = /(?<![\p{L}])(?:kanál|cesta|stezka|silnice|krajina|údolí|pobřeží|ostrov|město|centrum|čtvrť|areál)(?![\p{L}])/iu;
// Kulturní místo u smíšeného dědictví (naleziště, město, krajina, klášter) – jinak patří mezi přírodu
const CULTURAL_PLACE_WORDS = /(?:archeolog|starověk|naleziště|sídliště|sídl|město|měst|vesnic|obec|čtvr|centrum|jádro|krajin|polis|tell|kanál|silnic|cesta|trať|železnic|důl|hornic|průmysl|zahrad|hřbitov|pohřebiš|klášter|chrám|svatyn|poutní)/iu;
// Správní celky (prefektura, kraj) nejsou památkou, i když mají zápis
const ADMIN_WORDS = /(?:prefektur|administrativ|kraj|okres|provinci|spolkov|distrikt|guvernor)/iu;
const PARK_WORDS = /(?<![\p{L}])národní park/iu;
// Přírodní místo podle druhu (u položek bez kritérií UNESCO)
const NATURE_WORDS = /(?:(?<![\p{L}])národní park|chráněn|rezervac|prales|(?<![\p{L}])les|mokřad|bažin|delt|korálov|útes|vodopád|jeskyn|kaňon|poušť|savan|ledov|kráter|přírodní|biosfér|obora|eskarpment|planin|čedič|vádí|geopark)/iu;
// Přírodní dědictví, které patří do jiné kategorie (ostrov, hora, jezero, řeka) – nepřidává se
const OTHER_CATEGORY_WORDS = /(?:ostrov|souostroví|atol|(?<![\p{L}])hora|masiv|pohoří|jezero|řeka|vodní tok|sopk|vulkán)/iu;

// Druh památky UNESCO podle druhu z Wikidat a názvu (štítek otázky; nic, co by prozradilo stát)
const HERITAGE_KINDS = [
    [/starověk|polis/iu, 'starověké město'],
    [/petroglyf|skalní (?:kresb|malb|umění|rytin)|pravěkým uměním/iu, 'skalní umění'],
    [/grotta/iu, 'jeskynní chrámy'],
    [/archeolog|tell|sídliště|naleziště|paleontolog|dolmen|mohyl/iu, 'archeologická lokalita'],
    [/kanál|(?<![\p{L}])canal/iu, 'kanál'],
    [/železnic|železniční|trať/iu, 'železniční trať'],
    [/silnic|cesta|cesty|stezka/iu, 'historická cesta'],
    [/hradb|limes|opevněn|(?<![\p{L}])val(?![\p{L}])/iu, 'opevnění'],
    [/důl|doly|hornic|průmysl|železárn|solivar|továrn|mlýn/iu, 'průmyslová památka'],
    [/hřbitov|pohřebiš|hrobk/iu, 'pohřebiště'],
    [/botanická zahrada/iu, 'botanická zahrada'],
    [/historický park/iu, 'archeologická lokalita'],
    [/zahrad|park/iu, 'zahrada a park'],
    [/poutní|posvátn/iu, 'poutní místo'],
    [/náměstí|(?<![\p{L}])place(?![\p{L}])/iu, 'náměstí'],
    [/avenue|třída/iu, 'třída'],
    [/krajin|vinař|polder|teras|kosa/iu, 'kulturní krajina'],
    [/historické jádro|centrum|čtvr|staré město|městská část|místní část|^star[áé] /iu, 'historické centrum'],
    [/vesnic|část obce|skupina sídel|ksar/iu, 'historická vesnice'],
    [/město|měst|obec|municipalit|sídelní|sídlo|letovisko/iu, 'historické město'],
    [/region|pobřeží|oblast|oáz/iu, 'kulturní krajina'],
    [/ostrov/iu, 'ostrov'],
    [/skupina staveb|uskupení budov|komplex budov|soubor staveb/iu, 'soubor staveb']
];
// Druh přírodního místa (štítek otázky)
const NATURE_KINDS = [
    [/(?<![\p{L}])národní park/iu, 'národní park'],
    [/korálov/iu, 'korálový útes'],
    [/delt/iu, 'říční delta'],
    [/prales|deštn/iu, 'prales'],
    [/mokřad|bažin/iu, 'mokřad'],
    [/savan/iu, 'savana'],
    [/kráter/iu, 'impaktní kráter'],
    [/jeskyn/iu, 'jeskyně'],
    [/vodopád/iu, 'vodopád'],
    [/kosa/iu, 'kosa'],
    [/pobřeží/iu, 'pobřeží'],
    [/kaňon/iu, 'kaňon'],
    [/poušť/iu, 'poušť'],
    [/údolí|vádí|eskarpment|příkop/iu, 'údolí'],
    [/čedič|skal|sloup|útes|klint/iu, 'skalní útvar'],
    [/rezervac|biosfér|obora|přírodní park|chráněn/iu, 'přírodní rezervace']
];
const kindOf = (rules, text, fallback) => (rules.find(([pattern]) => pattern.test(text)) || [null, fallback])[1];

// Známost nových položek podle návštěvnosti článku na české Wikipedii za rok 2025 (views) a jazykových verzí (sitelinks).
// Známé (k = 1): obojí aspoň known, nebo návštěvnost aspoň famous; v Česku návštěvnost aspoň czKnown. Pro srovnání známé archeologické
// lokality a národní parky ve světě v datech mají návštěvnost kolem 1 000 (medián), známá moře kolem 1 600 – nová místa jsou známá
// jen s výrazně vyšší. Pro experty (x = 1) nejméně navštěvovaná třetina nových míst kategorie ve světě (EXPERT_SHARE)
const LEVELS = {
    dedictvi: { known: { views: 3000, sitelinks: 45 }, famous: 6000, czKnown: 8000 },
    priroda: { known: { views: 3000, sitelinks: 45 }, famous: 6000, czKnown: 8000 },
    jezero: { known: { views: 1500, sitelinks: 95 }, famous: 6000, czKnown: 8000 }
};
const EXPERT_SHARE = 0.33;
// Spodní hranice: v nových okruzích aspoň čtvrtina známých (jako u ostatních okruhů), v kategorii památek UNESCO aspoň pětina
// (známých světových památek je málo, slabě známé se mezi známé nepovyšují). Doplní se
// nejnavštěvovanější místa, která nejsou pro experty, s návštěvností aspoň FLOOR_VIEWS (u známých národních parků v datech je
// medián kolem 1 000). Z míst, která už v datech byla, jen příroda (výpis při sestavení): známost hor, vod, ostrovů, měst a staveb
// zůstane, jak byla (Řetězovka starších dní z ní skládá řetězy)
const FLOOR_VIEWS = 850;
const CATEGORY_FLOOR = { dedictvi: 0.2 };
const PROMOTABLE_EXISTING = new Set(['priroda']);

// Rekordy přírody (a pár dalších zeměpisných rekordů) u položek v datech: fakt Rekord a okruh Zeměpisné rekordy. Ověřené ručně;
// položka, která v datech není nebo se jmenuje jinak, se vynechá (výpis při sestavení)
export const RECORDS = {
    Q513: ['Mount Everest', 'nejvyšší hora světa'],
    Q43512: ['K2', 'druhá nejvyšší hora světa'],
    Q82019: ['Kančendženga', 'třetí nejvyšší hora světa'],
    Q39739: ['Aconcagua', 'nejvyšší hora Ameriky a jižní polokoule'],
    Q130018: ['Denali', 'nejvyšší hora Severní Ameriky'],
    Q583: ['Mont Blanc', 'nejvyšší hora Alp'],
    Q43105: ['Elbrus', 'nejvyšší hora Kavkazu a Ruska'],
    Q163758: ['Vinson Massif', 'nejvyšší horský masiv Antarktidy'],
    Q1045888: ['Puncak Jaya', 'nejvyšší hora Oceánie'],
    Q178167: ['Mount Kosciuszko', 'nejvyšší hora pevninské Austrálie'],
    Q131230: ['Mauna Kea', 'nejvyšší hora světa měřeno od úpatí na mořském dně'],
    Q14081: ['Chimborazo', 'nejvzdálenější bod zemského povrchu od středu Země'],
    Q233836: ['Ojos del Salado', 'nejvyšší sopka světa'],
    Q16990: ['Etna', 'nejvyšší činná sopka Evropy'],
    Q81213: ['Gerlachovský štít', 'nejvyšší hora Karpat'],
    Q672936: ['Rysy', 'nejvyšší hora Polska'],
    Q617511: ['Sněžka', 'nejvyšší hora Česka'],
    Q674016: ['Praděd', 'nejvyšší hora Moravy'],
    Q5451: ['Himálaj', 'nejvyšší pohoří světa'],
    Q5456: ['Andy', 'nejdelší pohoří na souši'],
    Q3392: ['Nil', 'nejdelší řeka Afriky'],
    Q3783: ['Amazonka', 'nejvodnatější řeka světa'],
    Q5413: ["Jang-c'-ťiang", 'nejdelší řeka Asie'],
    Q626: ['Volha', 'nejdelší řeka Evropy'],
    Q1653: ['Dunaj', 'druhá nejdelší řeka Evropy'],
    Q183078: ['Murray', 'nejdelší řeka Austrálie'],
    Q3503: ['Kongo', 'nejhlubší řeka světa'],
    Q131574: ['Vltava', 'nejdelší řeka Česka'],
    Q5484: ['Kaspické moře', 'největší jezero světa'],
    Q1066: ['Hořejší jezero', 'největší sladkovodní jezero světa podle rozlohy'],
    Q5513: ['Bajkal', 'nejhlubší a nejstarší jezero světa'],
    Q5511: ['Tanganika', 'nejdelší sladkovodní jezero světa'],
    Q5505: ['Viktoriino jezero', 'největší jezero Afriky'],
    Q1169: ['Michiganské jezero', 'největší jezero, které celé leží v jednom státě'],
    Q15288: ['Ladožské jezero', 'největší jezero Evropy'],
    Q35342: ['Titicaca', 'nejvýše položené splavné jezero světa'],
    Q45642: ['Černé jezero', 'největší a nejhlubší přírodní jezero Česka'],
    Q2140385: ['Vodní nádrž Lipno', 'vodní nádrž s největší rozlohou v Česku'],
    Q1757602: ['Vodní nádrž Orlík', 'vodní nádrž s největším objemem vody v Česku'],
    Q98: ['Tichý oceán', 'největší a nejhlubší oceán'],
    Q97: ['Atlantský oceán', 'druhý největší oceán'],
    Q788: ['Severní ledový oceán', 'nejmenší a nejmělčí oceán'],
    Q169274: ['Sargasové moře', 'jediné moře bez pobřeží'],
    Q40285: ['Nová Guinea', 'druhý největší ostrov světa'],
    Q36117: ['Borneo', 'třetí největší ostrov světa'],
    Q81178: ['Baffinův ostrov', 'pátý největší ostrov světa'],
    Q3492: ['Sumatra', 'šestý největší ostrov světa'],
    Q23666: ['Velká Británie', 'největší ostrov Evropy'],
    Q6583: ['Sahara', 'největší horká poušť světa'],
    Q47141: ['Atacama', 'nejsušší poušť světa'],
    Q1379640: ['Hranická propast', 'nejhlubší zatopená propast světa'],
    Q121141369: ['NPP Pravčická brána', 'největší přírodní skalní brána v Evropě'],
    Q351: ['Yellowstonský národní park', 'nejstarší národní park světa'],
    Q309276: ['Národní park Severovýchodní Grónsko', 'největší národní park světa'],
    Q864799: ['Národní park Šumava', 'největší národní park Česka'],
    Q2043817: ['Krkonošský národní park', 'nejstarší národní park Česka'],
    Q7343: ['Velký bariérový útes', 'největší korálový útes světa'],
    Q159: ['Rusko', 'největší stát světa'],
    Q16: ['Kanada', 'druhý největší stát světa'],
    Q237: ['Vatikán', 'nejmenší stát světa'],
    Q668: ['Indie', 'nejlidnatější stát světa'],
    Q235: ['Monako', 'nejhustěji zalidněný stát světa'],
    Q12495: ['Burdž Chalífa', 'nejvyšší budova světa'],
    Q193369: ['Pražský hrad', 'největší souvislý hradní komplex světa']
};

// Nové okruhy (za okruhem Světové dědictví UNESCO)
const NEW_COLLECTIONS = [
    { id: 'unesco-priroda', label: 'Přírodní dědictví UNESCO', text: 'Přírodní a smíšené památky světového dědictví: parky, útesy, pralesy, hory a ostrovy', sort: { by: 'name' } },
    { id: 'narodni-parky', label: 'Národní parky', text: 'Národní parky celého světa od Yellowstonu po Šumavu', sort: { by: 'name' } },
    { id: 'more', label: 'Moře a oceány', text: 'Oceány, moře, zálivy, průlivy a fjordy', sort: { by: 'area', desc: true } },
    { id: 'rekordy', label: 'Zeměpisné rekordy', text: 'Nejvyšší, nejdelší, největší a nejhlubší místa světa i Česka', sort: { by: 'name' } }
];
const CONTINENT_GROUPS = { EU: 'evropa', AS: 'asie', AF: 'afrika', NA: 'severni-amerika', SA: 'jizni-amerika', OC: 'oceanie' };

const hashOf = (list) => createHash('md5').update(list.join('-')).digest('hex').slice(0, 12);
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// --- Kandidáti ---
const candidateQueries = () => [
    // Světové dědictví s článkem na české Wikipedii (bez vyškrtnutých ze seznamu: Drážďanské Labské údolí)
    ['heritage', `SELECT DISTINCT ?item ?sitelinks WHERE {
  ?item p:P1435 ?s . ?s ps:P1435 wd:${WORLD_HERITAGE_SITE} ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?s pq:P582 ?end }
  ?item wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${MIN_SITELINKS.heritage})
  ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .
}`],
    // Národní parky (i druhy národních parků jednotlivých států)
    ['park', `SELECT DISTINCT ?item ?sitelinks WHERE {
  { ?item wdt:P31 wd:${NATIONAL_PARK} } UNION { ?item wdt:P31 ?type . ?type wdt:P279 wd:${NATIONAL_PARK} . FILTER(?type NOT IN (${[...NOT_PARK_TYPES].map(type => `wd:${type}`).join(', ')})) }
  ?item wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${MIN_SITELINKS.park})
  ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .
}`],
    ...Object.keys(SEA_TYPES).map(type => [`sea`, `SELECT DISTINCT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:${type} ; wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${MIN_SITELINKS.sea})
  ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> .
}`])
];

const fetchCandidates = async () => {
    const found = {};
    for (const [kind, query] of candidateQueries()) {
        const rows = await sparql(query);
        for (const row of rows) {
            const qid = id(row.item.value);
            const entry = found[qid] || { sitelinks: Number(row.sitelinks.value), kinds: [] };
            if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
            found[qid] = entry;
        }
        console.log(`  ${kind}: ${rows.length}`);
        await sleep(1500);
    }
    return found;
};

// --- Podrobnosti ---
const detailsQuery = (qids) => `
SELECT ?item ?p ?v ?ref WHERE {
  VALUES ?item { ${values(qids)} }
  { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item p:P2046 ?s . ?s a wikibase:BestRank ; psn:P2046/wikibase:quantityAmount ?v BIND("area" AS ?p) }
  UNION { ?item p:P2044 ?s . ?s a wikibase:BestRank ; psn:P2044/wikibase:quantityAmount ?v BIND("elev" AS ?p) }
  UNION { ?item p:P2043 ?s . ?s a wikibase:BestRank ; psn:P2043/wikibase:quantityAmount ?v BIND("len" AS ?p) }
  UNION { ?item p:P4511 ?s . ?s a wikibase:BestRank ; psn:P4511/wikibase:quantityAmount ?v BIND("depth" AS ?p) }
  UNION { ?item wdt:P571 ?date BIND(YEAR(?date) AS ?v) BIND("year" AS ?p) }
  UNION { ?item wdt:P576 ?date BIND(YEAR(?date) AS ?v) BIND("end" AS ?p) }
  UNION { ?item wdt:P31 ?x . OPTIONAL { ?x rdfs:label ?label FILTER(LANG(?label) = "cs") } BIND(COALESCE(?label, "") AS ?v) BIND(STR(?x) AS ?ref) BIND("type" AS ?p) }
  UNION { ?item p:P1435 ?s . ?s ps:P1435 wd:${WORLD_HERITAGE_SITE} ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?s pq:P582 ?end }
          OPTIONAL { ?s pq:P580 ?start } BIND(COALESCE(YEAR(?start), 0) AS ?v) BIND("whs" AS ?p) }
  UNION { ?item wdt:P2614 ?c . ?c rdfs:label ?v FILTER(LANG(?v) = "en") BIND("crit" AS ?p) }
}`;
const fetchDetails = async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, { values: {}, types: {}, co: [], crit: [], depth: [], whs: [], images: [] }]));
    for (let i = 0; i < qids.length; i += 60) {
        const rows = await sparql(detailsQuery(qids.slice(i, i + 60)));
        for (const row of rows) {
            const entry = result[id(row.item.value)];
            const key = row.p.value;
            if (!row.v) continue;
            const v = row.v.value;
            if (key === 'type') entry.types[id(row.ref.value)] = v;
            else if (key === 'co') { if (!entry.co.includes(id(v))) entry.co = [...entry.co, id(v)]; }
            else if (key === 'crit') { if (!entry.crit.includes(v)) entry.crit = [...entry.crit, v]; }
            else if (key === 'depth') entry.depth = [...entry.depth, Number(v)];
            else if (key === 'whs') entry.whs = [...entry.whs, Number(v)];
            else if (key === 'im') { if (!entry.images.includes(v)) entry.images = [...entry.images, v]; }
            else if (!(key in entry.values)) entry.values[key] = v;
        }
        process.stdout.write(`  podrobnosti ${Math.min(i + 60, qids.length)}/${qids.length}\r`);
        await sleep(1500);
    }
    return result;
};

// Fakta položky (stejné jednotky jako v build-zemepis.mjs: km², m, km)
const numberOf = (detailValues, key) => detailValues[key] === undefined ? undefined : Number(detailValues[key]);
const factsOf = (detail, { sea = false } = {}) => {
    const v = detail.values;
    const area = numberOf(v, 'area');
    const length = numberOf(v, 'len');
    const depth = detail.depth.filter(value => value > 0 && value <= 11100);
    const listed = detail.whs.filter(year => year > 1970);
    const facts = {
        area: area === undefined ? undefined : round(area / 1e6, area < 1e7 ? 2 : 0),
        elev: sea || numberOf(v, 'elev') === undefined ? undefined : Math.round(numberOf(v, 'elev')),
        len: length === undefined ? undefined : round(length / 1000, length < 1e4 ? 1 : 0),
        depth: depth.length ? Math.round(Math.max(...depth)) : undefined,
        // SPARQL YEAR() počítá roky před naším letopočtem astronomicky (rok 0 = 1 př. n. l.): −2999 je 3000 př. n. l.
        year: numberOf(v, 'year') === undefined ? undefined : numberOf(v, 'year') <= 0 ? numberOf(v, 'year') - 1 : numberOf(v, 'year'),
        whs: listed.length ? Math.min(...listed) : undefined
    };
    return Object.fromEntries(Object.entries(facts).filter(([, x]) => x !== undefined && !Number.isNaN(x) && x !== 0));
};

// --- Zařazení kandidáta: kategorie a druh, nebo null ---
const typeText = (detail) => Object.values(detail.types).filter(Boolean).join(', ');
const classify = (candidate, detail, name) => {
    const types = typeText(detail);
    const typeIds = Object.keys(detail.types);
    const heritage = detail.whs.length > 0;
    const natural = detail.crit.some(c => NATURAL_CRITERIA.has(c));
    const cultural = detail.crit.some(c => CULTURAL_CRITERIA.has(c));
    const isPark = candidate.kinds.includes('park') || PARK_WORDS.test(`${types} ${name}`);
    // Moře, zálivy, průlivy, fjordy (národní park u zálivu je přírodní místo: Ao Phang Nga)
    if (candidate.kinds.includes('sea') && !isPark) {
        const seaKinds = typeIds.map(type => SEA_TYPES[type]).filter(Boolean);
        let ty = SEA_ORDER.find(kind => seaKinds.includes(kind));
        if (/záliv|zátoka/iu.test(name)) ty = 'zátoka';
        else if (/moře/iu.test(name) && !ty.endsWith('moře')) ty = 'moře';
        else if (ty === 'fjord' && !/fjord|fjörður|sound/iu.test(name)) ty = 'zátoka';
        return { c: 'jezero', ty };
    }
    // Národní parky (ne archeologická naleziště se statusem parku: Takalik Abaj) a přírodní dědictví
    const archaeological = /archeolog|starověk/iu.test(types);
    if (isPark && !(heritage && cultural && !natural) && !archaeological) return { c: 'priroda', ty: 'národní park', park: true };
    if (!heritage) return null;
    // Smíšené dědictví: mezi památky, jen když je to kulturní místo (naleziště, město, krajina), jinak příroda (Tasmánská divočina)
    if (natural && cultural && CULTURAL_PLACE_WORDS.test(types) && !NATURE_WORDS.test(types)) return heritageKind(types, name);
    if (natural || (!cultural && NATURE_WORDS.test(types))) {
        // Ostrov, hora, jezero nebo řeka patří do své kategorie (Aldabra, Putorana, Neziderské jezero)
        if (OTHER_CATEGORY_WORDS.test(name) || (OTHER_CATEGORY_WORDS.test(types) && !NATURE_WORDS.test(types))) return null;
        return { c: 'priroda', ty: kindOf(NATURE_KINDS, `${types} ${name}`, 'přírodní rezervace') };
    }
    return heritageKind(types, name);
};
const heritageKind = (types, name) => {
    const place = PLACE_WORDS.test(types) || NAME_PLACE_WORDS.test(name);
    if (ADMIN_WORDS.test(types) && !PLACE_WORDS.test(types)) return null;
    if (!place && (BUILDING_WORDS.test(types) || BUILDING_WORDS.test(name))) return null;
    // Název začínající nebo končící budovou je budova i u místa (Pevnost Ágra, Královský dům Schachen, Brémská radnice), zřícenina
    // hradu také (Spišský hrad)
    if (/^(?:Kostel|Kostely|Katedrála|Bazilika|Chrám|Chrámy|Mešita|Klášter|Kláštery|Opatství|Hrad|Hrady|Zámek|Zámky|Palác|Paláce|Pevnost|Pevnosti|Citadela|Most|Věž|Muzeum|Nádraží|Mauzoleum|Hrobka|Socha|Sloup|Synagoga|Kaple|Královský dům|Dům|Vila|Svatostánek)(?![\p{L}])/u.test(name)
        || /(?:hrad|zámek|palác|chrám|klášter|katedrála|radnice|akvadukt)$/u.test(name)
        || (/hrad/iu.test(types) && !/archeolog|starověk/iu.test(types))) return null;
    return { c: 'dedictvi', ty: kindOf(HERITAGE_KINDS, `${types} ${name}`, 'památka UNESCO') };
};

// Fotka: první skutečná fotka z Wikidat (u moří bývá první mapa), kterou téma nevyřadí jako mimo místo. Moře bez fotky dostanou
// mapu či družicový snímek jako dosavadní moře v datech (hra ukáže slepou mapu, obrázek jen v atlasu)
const photoOf = (detail, item) => {
    for (const url of detail.images) {
        const image = imageFields(url);
        if (image.im && isRealPhoto(image.im) && !topic.offSubjectPhoto({ ...item, ...image })) return image;
    }
    const first = detail.images.length ? imageFields(detail.images[0]) : {};
    return item.c === 'jezero' && first.im ? first : null;
};

// --- Hlavní funkce ---
// items a collections jsou data tématu (mění se na místě); countries = data/countries.json. Vrátí přehled pro výpis.
export const extendZemepis = async ({ items, collections, countries }) => {
    const byId = new Map(items.map(item => [item.q, item]));
    const report = { added: { dedictvi: [], priroda: [], jezero: [] }, promoted: [], skipped: [] };
    const skip = (text) => { report.skipped = [...report.skipped, text]; };

    console.log('Rozšíření: kandidáti (UNESCO, národní parky, moře)…');
    const candidates = await cached('zemepis-rozsireni-kandidati', fetchCandidates);
    const fresh = Object.keys(candidates).filter(qid => !byId.has(qid)).sort();
    console.log(`Rozšíření: podrobnosti k ${fresh.length} novým kandidátům…`);
    const details = await cached(`zemepis-rozsireni-podrobnosti-v2-${hashOf(fresh)}`, () => fetchDetails(fresh));

    // Jména a články v datech: nová položka nesmí mít stejný článek ani jméno ve stejné kategorii, ani jméno státu či města
    const articles = new Set(items.flatMap(item => [item.t, item.w].filter(Boolean)));
    const namesIn = new Map();
    const exactNames = new Set();
    const addName = (item) => {
        const key = normalizeAnswer(item.n);
        if (!namesIn.has(key)) namesIn.set(key, new Set());
        namesIn.get(key).add(item.c);
        exactNames.add(item.n.toLocaleLowerCase('cs'));
    };
    items.forEach(addName);

    const added = [];
    for (const qid of fresh.filter(qid => !SKIP.has(qid))) {
        const candidate = candidates[qid];
        const detail = details[qid];
        const v = detail.values;
        const point = parsePoint(v.coord);
        if (!v.t || !point) continue;
        const rawName = (v.n || v.t.replace(/ \(.*\)$/, '')).trim();
        if (!rawName || /^Q\d+$/.test(rawName)) continue;
        let name = capitalize(rawName);
        const kind = classify(candidate, detail, name);
        if (!kind) continue;
        // Zrušený park, zaniklé moře (naleziště konec mají vždycky: Trója, Çatal Hüyük)
        if (kind.c !== 'dedictvi' && v.end) { skip(`${name}: zaniklé`); continue; }
        const co = detail.co.filter(country => countries[country]);
        // Památka ve více než dvou státech (stavby Le Corbusiera, kůlová obydlí v Alpách) nemá jedno místo; přírodní místo do tří států
        const maxCountries = kind.c === 'dedictvi' ? 2 : kind.c === 'priroda' ? 3 : Infinity;
        if (kind.c !== 'jezero' && (co.length === 0 || co.length > maxCountries)) { skip(`${name}: ${co.length} států`); continue; }
        if (articles.has(v.t)) { skip(`${name}: stejný článek`); continue; }
        const clash = namesIn.get(normalizeAnswer(name)) || new Set();
        if (clash.has(kind.c) || clash.has('stat') || clash.has('mesto')) {
            // Upřesnění z článku (Tatranský národní park (Polsko), Staré Město (Praha)), jinak se vynechá
            if (/\(.+\)$/.test(v.t) && !exactNames.has(v.t.toLocaleLowerCase('cs'))) name = v.t;
            else { skip(`${name}: jméno už v datech`); continue; }
        }
        const head = { q: qid, t: v.t, n: name, c: kind.c, k: 0, la: point.lat, lo: point.lon, ty: TY_OVERRIDES[qid] || kind.ty, ...(v.d ? { d: v.d } : {}), co };
        const photo = photoOf(detail, head);
        if (!photo) { skip(`${name}: bez fotky`); continue; }
        const item = {
            ...head,
            ...photo,
            f: factsOf(detail, { sea: kind.c === 'jezero' }),
            _: { sitelinks: candidate.sitelinks, park: Boolean(kind.park), heritage: detail.whs.length > 0, natural: detail.crit.some(c => NATURAL_CRITERIA.has(c)) }
        };
        articles.add(v.t);
        addName(item);
        added.push(item);
    }
    // Stejně pojmenovaná nová místa by hra nerozlišila: zůstane to s víc jazykovými verzemi. Park pojmenovaný po přírodním místě
    // nebo památce, které v datech jsou (Národní park Kurská kosa × Kurská kosa), také ne; po hoře nebo ostrově smí (Národní park
    // Denali × hora Denali, jako Národní park Šumava × pohoří Šumava)
    const seen = new Set();
    const unique = [...added].sort((a, b) => b._.sitelinks - a._.sitelinks).filter(item => {
        const key = `${item.c}|${normalizeAnswer(item.n)}`;
        if (seen.has(key)) { skip(`${item.n}: dvakrát`); return false; }
        const base = normalizeAnswer(item.n.replace(/^Národní park /u, '').replace(/ národní park$/u, ''));
        const baseIn = namesIn.get(base) || new Set();
        if (item.c === 'priroda' && base !== normalizeAnswer(item.n) && (baseIn.has('priroda') || baseIn.has('dedictvi'))) { skip(`${item.n}: místo už v datech`); return false; }
        seen.add(key);
        return true;
    });

    // Článek po přesměrování (pole w hned za t): přesměrování na článek, který v datech už je, se vynechá
    const targets = await articleTargets(unique.map(item => item.t), 'zemepis-rozsireni-clanky');
    const withArticles = unique.flatMap(item => {
        const target = targets[item.t];
        if (!target) return [item];
        if (articles.has(target)) { skip(`${item.n}: článek ${target} už v datech`); return []; }
        const entries = Object.entries(item);
        entries.splice(entries.findIndex(([key]) => key === 't') + 1, 0, ['w', target]);
        return [Object.fromEntries(entries)];
    });

    // Návštěvnost článků na české Wikipedii (nové položky a položky, které mohou do nových okruhů – kvůli spodní hranici známých)
    const viewTitles = [...withArticles, ...items.filter(item => item.c === 'priroda' || item.c === 'jezero' || (item.g || []).includes('unesco'))].map(item => item.t);
    const views = await cachedByKey('zemepis-rozsireni-navstevnost', viewTitles, czechPageviews);

    // Park s málo jazykovými verzemi jen tehdy, když ho čeští čtenáři znají
    const kept = withArticles.filter(item => {
        item._.pv = views[item.t] || 0;
        if (item._.park && !item._.heritage && item._.sitelinks < PARK_SITELINKS && item._.pv < PARK_MIN_VIEWS) { skip(`${item.n}: málo známý park`); return false; }
        return true;
    });

    // Známost a úrovně
    for (const item of kept) {
        const rule = LEVELS[item.c];
        const { pv, sitelinks } = item._;
        item._.czech = item.co.includes(CZECHIA);
        const known = item._.czech ? pv >= rule.czKnown : (pv >= rule.known.views && sitelinks >= rule.known.sitelinks) || pv >= rule.famous;
        item.k = known ? 1 : 0;
    }
    for (const category of Object.keys(LEVELS)) {
        const world = kept.filter(item => item.c === category && !item._.czech).sort((a, b) => a._.pv - b._.pv || a._.sitelinks - b._.sitelinks);
        world.slice(0, Math.floor(world.length * EXPERT_SHARE)).filter(item => !item.k).forEach(item => { item.x = 1; });
    }

    // Úřední jazyky států, největší hloubka vodních ploch, rok zápisu a kritéria u položek UNESCO v datech
    console.log('Rozšíření: fakta k položkám v datech…');
    const enrichIds = items.filter(item => item.c === 'stat' || item.c === 'jezero' || (item.g || []).includes('unesco')).map(item => item.q).sort();
    const enrich = await cached(`zemepis-rozsireni-fakta-${hashOf(enrichIds)}`, () => fetchEnrichment(enrichIds));

    // Zápis do dat: nové položky za stávající, fakta a okruhy
    const before = items.length;
    items.splice(items.length, 0, ...kept);
    for (const item of items) {
        const extra = enrich[item.q];
        if (extra) {
            if (item.c === 'stat' && extra.lang.length) item.f = { ...item.f, lang: extra.lang.slice(0, 4).join(', ') };
            if (item.c === 'jezero' && extra.depth && !(item.f || {}).depth) item.f = { ...item.f, depth: extra.depth };
            if ((item.g || []).includes('unesco') && extra.whs && !(item.f || {}).whs) item.f = { ...item.f, whs: extra.whs };
        }
        if (Object.hasOwn(RECORDS, item.q)) {
            if (RECORDS[item.q][0] === item.n) item.f = { ...item.f, rec: RECORDS[item.q][1] };
            else skip(`rekord ${RECORDS[item.q][0]}: v datech ${item.n}`);
        }
    }
    const missingRecords = Object.entries(RECORDS).filter(([qid]) => !items.some(item => item.q === qid)).map(([, [name]]) => name);
    if (missingRecords.length) skip(`rekordy bez položky v datech: ${missingRecords.join(', ')}`);

    const at = collections.findIndex(collection => collection.id === 'unesco');
    const newCollections = NEW_COLLECTIONS.filter(collection => !collections.some(existing => existing.id === collection.id));
    collections.splice(at < 0 ? collections.length : at + 1, 0, ...newCollections);
    const order = collections.map(collection => collection.id);
    const naturalHeritage = (item) => item._ ? item._.heritage && item._.natural : Boolean((enrich[item.q] || {}).natural) && (item.g || []).includes('unesco');
    const tests = {
        'unesco-priroda': naturalHeritage,
        'narodni-parky': item => item.c === 'priroda' && item.ty === 'národní park',
        more: item => item.c === 'jezero' && SEA_KINDS.has(item.ty),
        rekordy: item => Boolean((item.f || {}).rec)
    };
    for (const item of items) {
        const groups = new Set(item.g || []);
        if (item._) {
            const continent = getContinent(item, countries);
            if (CONTINENT_GROUPS[continent]) groups.add(CONTINENT_GROUPS[continent]);
            if (item._.czech) groups.add('cesko');
            if (item._.heritage) groups.add('unesco');
        }
        for (const [groupId, test] of Object.entries(tests)) if (test(item)) groups.add(groupId);
        const list = order.filter(groupId => groups.has(groupId));
        if (list.length) item.g = list;
    }

    // Spodní hranice známých (viz FLOOR_VIEWS): nejdřív kategorie, pak nové okruhy
    const promote = (label, members, need) => {
        let known = members.filter(item => item.k === 1).length;
        const rest = members.filter(item => !item.k && !item.x && (item._ || PROMOTABLE_EXISTING.has(item.c)) && (views[item.t] || 0) >= FLOOR_VIEWS)
            .sort((a, b) => (views[b.t] || 0) - (views[a.t] || 0));
        for (const item of rest) {
            if (known >= need) break;
            item.k = 1;
            known++;
            report.promoted = [...report.promoted, `${label}: ${item.n}${item._ ? '' : ' (už v datech)'} [${views[item.t] || 0}]`];
        }
    };
    for (const [category, share] of Object.entries(CATEGORY_FLOOR)) {
        const members = items.filter(item => item.c === category);
        promote(`kategorie ${category}`, members, Math.ceil(members.length * share));
    }
    // Nové okruhy a okruhy, do kterých nové položky přibyly (UNESCO, kontinenty, Česko)
    for (const collection of [...newCollections, ...collections.filter(collection => !newCollections.includes(collection))]) {
        const members = items.filter(item => (item.g || []).includes(collection.id));
        promote(collection.label, members, knownFloor(members.length));
    }

    for (const item of kept) {
        report.added[item.c] = [...report.added[item.c], `${item.n} [${item.ty}${item.k ? ', známé' : item.x ? ', expert' : ''}; ${item._.sitelinks} verzí, ${item._.pv} zhlédnutí]`];
        delete item._;
    }
    report.count = items.length - before;
    return report;
};

// Úřední jazyky (P37), největší hloubka (P4511), rok zápisu do UNESCO (P1435/P580) a přírodní kritéria (P2614) položek v datech
const fetchEnrichment = async (qids) => {
    const result = {};
    for (let i = 0; i < qids.length; i += 150) {
        const rows = await sparql(`SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids.slice(i, i + 150))} }
  { ?item p:P37 ?s . ?s a wikibase:BestRank ; ps:P37 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("lang" AS ?p) }
  UNION { ?item p:P4511 ?s . ?s a wikibase:BestRank ; psn:P4511/wikibase:quantityAmount ?v BIND("depth" AS ?p) }
  UNION { ?item p:P1435 ?s . ?s ps:P1435 wd:${WORLD_HERITAGE_SITE} ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) ?s pq:P580 ?start BIND(YEAR(?start) AS ?v) BIND("whs" AS ?p) }
  UNION { ?item wdt:P2614 ?c . ?c rdfs:label ?v FILTER(LANG(?v) = "en") BIND("crit" AS ?p) }
}`);
        for (const row of rows) {
            const qid = id(row.item.value);
            const entry = result[qid] || (result[qid] = { lang: [], depth: 0, whs: 0, natural: false });
            const v = row.v.value;
            if (row.p.value === 'lang') { if (!entry.lang.includes(v)) entry.lang = [...entry.lang, v]; }
            else if (row.p.value === 'depth') { const depth = Number(v); if (depth > 0 && depth <= 11100) entry.depth = Math.max(entry.depth, Math.round(depth)); }
            else if (row.p.value === 'whs') { const year = Number(v); if (year > 1970) entry.whs = entry.whs ? Math.min(entry.whs, year) : year; }
            else if (NATURAL_CRITERIA.has(v)) entry.natural = true;
        }
        process.stdout.write(`  fakta ${Math.min(i + 150, qids.length)}/${qids.length}\r`);
        await sleep(1500);
    }
    return result;
};
