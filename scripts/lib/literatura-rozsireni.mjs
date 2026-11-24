// Téma Literatura, rozšíření: divadelní hry, pohádky a dětská literatura, jazyky a písma, filozofové (kategorie hry, pohadky, jazyky,
// filozofove – na konci seznamu kategorií). Používá build-literatura.mjs: na konci celého sestavení, nebo samostatně nad hotovým
// data/literatura.json (LITERATURA_ONLY=rozsireni) – ostatní položky se nestahují ani nemění.
//
// Kandidáti: třídy Wikidat (divadelní dílo, pohádka, jazyk, písmo, povolání filozof; přes QLever), členové kategorií české Wikipedie
// (české divadelní hry, pohádky; přes službu MWAPI dotazovací služby Wikidat) a ruční seznamy článků (písma, knihy pro děti).
// Vyřazené: položky, které už v tématu jsou (Hamlet, Malý princ, Nietzsche zůstanou ve svých kategoriích), a položky jiných témat
// (Descartes je ve Fyzice, Marx v Historii) – stejná položka nemá být ve dvou tématech.
//
// Známost: návštěvnost článku na české Wikipedii za rok 2025 a počet jazykových verzí, uvnitř skupiny (kategorie, české položky zvlášť;
// české hry a pohádky mají jazykových verzí málo, rozhoduje u nich návštěvnost). Známé: nejznámější čtvrtina skupiny a ruční seznamy
// (KNOWN), nikdy ruční seznam NEVER; pro experty nejméně známá čtvrtina (u českých položek šestina).
import { readFileSync, readdirSync } from 'node:fs';
import { sparql, qlever, id, values, imageFields, yearOf, compact, cached, inBatches, sleep, readCountries } from './wikidata.mjs';
import { cachedByKey } from './zemepis-levels.mjs';
import { topicPageviews, assignLevels, levelGroups, levelSummary, knownFloor } from './fame-levels.mjs';
import { landByDescription } from './nationality.mjs';

export const EXTRA_CATEGORIES = ['hry', 'pohadky', 'jazyky', 'filozofove'];
export const isExtraItem = (item) => EXTRA_CATEGORIES.includes(item.c);

export const EXTRA_COLLECTIONS = [
    { id: 'ceske-divadlo', label: 'České divadelní hry', text: 'Od Tyla a Klicpery po Osvobozené divadlo a Járu Cimrmana', sort: { by: 'y' } },
    { id: 'shakespeare', label: 'Shakespearovy hry', text: 'Tragédie, komedie a historické hry', sort: { by: 'y' } },
    { id: 'ceske-pohadky', label: 'České pohádky', text: 'Pohádky Erbena, Němcové a dalších', sort: { by: 'name' } },
    { id: 'svetove-pohadky', label: 'Pohádky světa', text: 'Grimmové, Andersen, Perrault a další', sort: { by: 'name' } },
    { id: 'slovanske-jazyky', label: 'Slovanské jazyky', sort: { by: 'name' } },
    { id: 'jazyky-evropy', label: 'Germánské, románské a další jazyky Evropy', sort: { by: 'name' } },
    { id: 'jazyky-sveta', label: 'Jazyky Asie, Afriky a Ameriky', sort: { by: 'name' } },
    { id: 'pisma', label: 'Písma a abecedy', text: 'Latinka, cyrilice, hieroglyfy a další', sort: { by: 'name' } },
    { id: 'anticka-filozofie', label: 'Antická filozofie', text: 'Od Thaléta po novoplatoniky', sort: { by: 'y' } },
    { id: 'novoveka-filozofie', label: 'Filozofie novověku', text: 'Narození 1500–1850', sort: { by: 'y' } },
    { id: 'moderni-filozofie', label: 'Filozofie 20. století', text: 'Narození od roku 1850', sort: { by: 'y' } },
    { id: 'vychodni-filozofie', label: 'Východní myšlení', text: 'Čína, Indie a Japonsko', sort: { by: 'y' } }
];

// --- Ruční seznamy ---
// Kategorie české Wikipedie s českými divadelními hrami
const PLAY_CATEGORIES = ['Kategorie:České divadelní hry', 'Kategorie:Divadelní hry Aloise Jiráska', 'Kategorie:Divadelní hry Františka Langera',
    'Kategorie:Divadelní hry Josefa Kajetána Tyla', 'Kategorie:Divadelní hry Karla Čapka', 'Kategorie:Divadelní hry Ladislava Stroupežnického',
    'Kategorie:Divadelní hry Václava Havla', 'Kategorie:Divadelní hry Václava Klimenta Klicpery', 'Kategorie:Divadelní hry Viktora Dyka',
    'Kategorie:Hry Divadla Járy Cimrmana', 'Kategorie:Hry Jiřího Suchého', 'Kategorie:Hry Osvobozeného divadla', 'Kategorie:Divadelní hry Williama Shakespeara'];
const CIMRMAN_CATEGORY = 'Kategorie:Hry Divadla Járy Cimrmana';
const OSVOBOZENE_CATEGORY = 'Kategorie:Hry Osvobozeného divadla';
// Hry, které zná skoro každý (české klasiky, Cimrman, Shakespeare) – názvy článků české Wikipedie
const PLAYS_KNOWN = ['Naši furianti', 'Maryša', 'Fidlovačka aneb Žádný hněv a žádná rvačka', 'Strakonický dudák aneb Hody divých žen', 'Ze života hmyzu',
    'Noc na Karlštejně (divadelní hra)', 'Dobytí severního pólu', 'Vražda v salonním coupé', 'Záskok', 'Blaník (divadelní hra)', 'Švestka (divadelní hra)',
    'Posel z Liptákova', 'Dlouhý, Široký a Krátkozraký', 'Vyšetřování ztráty třídní knihy', 'Jezinky a bezinky', 'Hospoda Na mýtince',
    'Bouře (Shakespeare)', 'Mnoho povyku pro nic', 'Richard III. (Shakespeare)', 'Zimní pohádka', 'Veselé paničky windsorské', 'Charleyova teta',
    'Limonádový Joe (divadelní hra)', 'Těžká Barbora', 'Golem (divadelní hra)', 'Věc Makropulos', 'Matka (Čapek)', 'Jan Hus (divadelní hra)'];
// Méně známé Shakespearovy hry: mají článek v mnoha jazycích, český hráč je ale nezná (známé nebudou)
const PLAYS_NEVER = new Set(['Titus Andronicus', 'Coriolanus', 'Něco za něco', 'Troilus a Kressida', 'Timon Athénský', 'Marná lásky snaha', 'Jindřich IV.',
    'Jindřich V.', 'Jindřich VI.', 'Jindřich VIII.', 'Richard II.', 'Král Jan', 'Cymbelín', 'Perikles', 'Dva vznešení příbuzní', 'Dobrý konec vše napraví']);
// Další hry, které se třídou Wikidat ani v kategoriích nenajdou
const PLAYS_MORE = ['Švestka (divadelní hra)', 'Akt (divadelní hra)', 'Němý Bobeš', 'Lijavec', 'Vizionář', 'Afrika (divadelní hra)', 'Cimrman v říši hudby',
    'České nebe', 'Věc Makropulos', 'Matka (Čapek)', 'Jan Hus (divadelní hra)', 'Mastičkář', 'Paní mincmistrová', 'Jedenácté přikázání', 'Pražský flamendr',
    'Vojnarka (divadelní hra)', 'Gazdina roba'];
// Hry, které nejsou divadelní hrou pro tento kvíz: podle názvu a začátku popisu (opery, muzikály, inscenace, rozhlasové hry)
// a podle druhu ve Wikidatech (opera, balet, film); „hra, která inspirovala řadu filmových zpracování“ (Bouře) hrou zůstane
const PLAY_NOT = /muzikál|lyrikál|opera|operet|balet|rozhlasov|inscenac|film|seriál|kabaret|revue|dílo Leonarda/iu;
const PLAY_NOT_TYPE = /opera|muzikál|balet|film|seriál|rozhlas/iu;
const PLAY_DESCRIPTION = /hr(a|y)\b|drama|dramat|komedi|tragédi|veselohr|fraška|frašk/iu;

// Pohádky: kategorie české Wikipedie a další články (knihy pro děti, které v tématu ještě nejsou)
const TALE_CATEGORIES = ['Kategorie:Pohádky', 'Kategorie:Pohádky bratří Grimmů', 'Kategorie:Pohádky Hanse Christiana Andersena', 'Kategorie:České pohádky',
    'Kategorie:Umělé pohádky', 'Kategorie:Ruské pohádky', 'Kategorie:Slovenské pohádky'];
const TALES_MORE = ['O Palečkovi', 'Perníková chaloupka', 'Princezna se zlatou hvězdou', 'O Koblížkovi', 'Otesánek', 'Zlatovláska', 'Hrnečku, vař!', 'Chytrá horákyně',
    'Pohádka o Popelce', 'Aladinova kouzelná lampa', 'Ali Baba a čtyřicet loupežníků', 'Jak šel Honza do světa', 'Kocour Mikeš', 'Děti z Bullerbynu',
    'Povídání o pejskovi a kočičce', 'Pohádky z mechu a kapradí (kniha)', 'Malá čarodějnice', 'Malý Bobeš', 'Honzíkova cesta', 'Pipi Dlouhá punčocha (kniha)',
    'Emil z Lönnebergy', 'Medvídek Pú (kniha)', 'Mach a Šebestová (kniha)', 'Krtek a kalhotky', 'Příhody včelích medvídků', 'Ferda Mravenec (kniha)',
    'Pohádka o Raškovi', 'Malý Mikuláš', 'Džungle (kniha)', 'Kniha džunglí', 'Petr Pan a Wendy', 'Mary Poppinsová (kniha)', 'Krysáci (kniha)', 'Neználkova dobrodružství',
    'Ronja, dcera loupežníka', 'Karkulka', 'Brémští muzikanti', 'Sněhurka', 'O dvanácti měsíčkách', 'Pták Ohnivák', 'Dlouhý, Široký a Bystrozraký', 'O Smolíčkovi',
    'Sůl nad zlato', 'Čert a Káča', 'Princ Bajaja', 'Tři zlaté vlasy děda Vševěda', 'O kohoutkovi a slepičce', 'Jabloňová panna', 'Jak Honza ke štěstí přišel'];
// Články, které nejsou pohádkou (žánr, seznam, rozhlasová pohádka, postava, film)
const TALE_NOT = /^(Pohádka|Umělá pohádka|Zvířecí pohádka|Filmová pohádka|Legendární pohádka|Novelistická pohádka|Strašidelná pohádka|Reklamní pohádka|Japonské pohádky|Honza \(postava\)|Hledání ztraceného manžela|Vršovická pohádková stezka|Bolek a Lolek|Kocour v botách)$|^Seznam|rozhlasov|\(\d{4}\)$|film/iu;
const TALES_KNOWN = ['Popelka', 'Červená karkulka', 'Šípková Růženka', 'O perníkové chaloupce', 'Brémští muzikanti', 'Ošklivé káčátko', 'Statečný krejčík', 'Rampelník',
    'Locika (pohádka)', 'O Smolíčkovi', 'Hrnečku, vař!', 'Otesánek', 'O dvanácti měsíčkách', 'Dlouhý, Široký a Bystrozraký', 'Sůl nad zlato', 'Pták Ohnivák',
    'Čert a Káča', 'O kohoutkovi a slepičce', 'O princezně se zlatou hvězdou na čele', 'O Koblížkovi', 'Tisíc a jedna noc', 'Pohádky bratří Grimmů', 'Malá mořská víla',
    'Děti z Bullerbynu', 'Povídání o pejskovi a kočičce', 'Kniha džunglí', 'Princ Bajaja', 'Tři zlaté vlasy děda Vševěda', 'Sedmero krkavců', 'Chytrá horákyně'];
// Autoři a sběratelé pohádek podle popisu („pohádka Boženy Němcové“) a podle kategorie
const TALE_AUTHORS = [['Božena Němcová', /Němcov/u, 'sběratel'], ['Karel Jaromír Erben', /Erben/u, 'sběratel'], ['bratři Grimmové', /Grimm/u, 'sběratel'],
    ['Hans Christian Andersen', /Andersen/u, 'autor'], ['Charles Perrault', /Perrault/u, 'autor'], ['Alexandr Nikolajevič Afanasjev', /Afanasjev/u, 'sběratel'],
    ['Alexandr Sergejevič Puškin', /Puškin/u, 'autor'], ['Wilhelm Hauff', /Hauff/u, 'autor'], ['Oscar Wilde', /Wild/u, 'autor'], ['Karel Čapek', /Čapk/u, 'autor'],
    ['Jan Drda', /Drd/u, 'autor'], ['Adolf Wenig', /Wenig/u, 'autor'], ['Giambattista Basile', /Basil/u, 'autor'], ['Gianni Rodari', /Rodari/u, 'autor'],
    ['Václav Tille', /Till/u, 'sběratel'], ['Václav Beneš Třebízský', /Třebízsk/u, 'autor']];
const TALE_CATEGORY_AUTHORS = { 'Kategorie:Pohádky bratří Grimmů': 'bratři Grimmové', 'Kategorie:Pohádky Hanse Christiana Andersena': 'Hans Christian Andersen' };
const TALE_CATEGORY_LANDS = { 'Kategorie:Pohádky bratří Grimmů': 'Německo', 'Kategorie:Pohádky Hanse Christiana Andersena': 'Dánsko', 'Kategorie:České pohádky': 'Česko',
    'Kategorie:Ruské pohádky': 'Rusko', 'Kategorie:Slovenské pohádky': 'Slovensko' };
// Pohádky, u kterých Wikidata uvádějí autora převyprávění nebo nic (Popelka – Perrault, Červená karkulka – Perrault i Grimmové)
const TALE_FIX = {
    'Popelka': { land: 'Francie', by: 'Charles Perrault', byk: 'autor' },
    'Červená karkulka': { land: 'Francie', by: 'Charles Perrault', byk: 'autor' },
    'Šípková Růženka': { land: 'Francie', by: 'Charles Perrault', byk: 'autor' },
    'Modrovous': { land: 'Francie', by: 'Charles Perrault', byk: 'autor' },
    'Kráska a zvíře (pohádka)': { land: 'Francie' },
    'Tisíc a jedna noc': { land: 'Persie', ty: 'sbírka pohádek', by: null },
    'Pohádky bratří Grimmů': { ty: 'sbírka pohádek', land: 'Německo' },
    'Pentameron': { ty: 'sbírka pohádek', land: 'Itálie' },
    'Kathásaritságara': { ty: 'sbírka pohádek', land: 'Indie' },
    'Na východ od slunce a na západ od měsíce': { land: 'Norsko' },
    'Pták Ohnivák': { land: 'Rusko', by: null },
    'O Koblížkovi': { land: 'Rusko' }
};

// Písma (názvy článků; ruční výběr – bez přepisů, číslic a typů písma)
const SCRIPTS = ['*Latinka', '*Cyrilice', '*Řecké písmo', '*Arabské písmo', '*Hebrejské písmo', '*Čínské znaky', '*Hangul', '*Dévanágarí', '*Hiragana',
    '*Katakana', 'Kandži', '*Egyptské hieroglyfy', '*Klínové písmo', '*Runy', '*Brailleovo písmo', '*Hlaholice', 'Fénické písmo', 'Arménské písmo',
    'Gruzínská písma', 'Thajské písmo', 'Tibetské písmo', 'Mongolské písmo', 'Ogam', 'Lineární písmo B', 'Lineární písmo A', 'Mayské písmo',
    'Etiopské písmo', 'Bengálské písmo', 'Koptské písmo', 'Gótské písmo', 'Aramejské písmo', 'Démotické písmo', 'Khmerské písmo', 'Barmské písmo',
    'Čerokézské písmo', 'Rongorongo', 'Tifinagh', 'Fraktura (písmo)', 'Bráhmí', 'Syrské písmo', 'Gurmukhí'];
// Jazyky: známé (k = 1) a ty, které známé nebudou, i když mají článek v mnoha jazycích (umělé jazyky s nadšenými komunitami)
const LANGUAGES_KNOWN = ['Čeština', 'Slovenština', 'Angličtina', 'Němčina', 'Francouzština', 'Španělština', 'Italština', 'Ruština', 'Polština', 'Latina', 'Řečtina',
    'Čínština', 'Japonština', 'Arabština', 'Hebrejština', 'Hindština', 'Portugalština', 'Maďarština', 'Nizozemština', 'Švédština', 'Norština', 'Finština',
    'Turečtina', 'Esperanto', 'Ukrajinština', 'Korejština', 'Rumunština', 'Chorvatština', 'Srbština', 'Bulharština', 'Dánština', 'Islandština', 'Irština',
    'Svahilština', 'Perština', 'Sanskrt', 'Jidiš', 'Romština', 'Baskičtina', 'Staroslověnština', 'Slovinština', 'Vietnamština', 'Thajština', 'Mongolština',
    'Starořečtina', 'Egyptština', 'Klingonština'];
const LANGUAGES_NOT = new Set(['Occidental', 'Lingua Franca Nova', 'Novial', 'Interlingua', 'Ido', 'Volapük', 'Zazaki', 'Praindoevropský jazyk', 'Severočínské dialekty',
    'Hindustánština', 'Srbochorvatština', 'Fidžijská hindština', 'Dolnoněmčina', 'Nynorsk', 'Bokmål', 'Kantonština', 'Malajština', 'Darí', 'Lingua franca']);
// Umělé jazyky (Wikidata je řadí i mezi přirozené)
const ARTIFICIAL = new Set(['Esperanto', 'Klingonština', 'Toki pona', 'Volapük', 'Ido', 'Interlingua', 'Quenya', 'Sindarština']);
// Písmo jazyka: národní abecedy latinky a cyrilice jako latinka a cyrilice, Braillovo písmo a anglické názvy pravopisů pryč
const CYRILLIC = /^(rusk|ukrajinsk|běloru|bulharsk|srbsk|makedonsk|kazašsk|kyrgyzsk|tádžick|mongolsk|baškirsk|tatarsk|čuvašsk|jakutsk|osetsk)/iu;
const SCRIPT_NAMES = [[/^(latinka|latinská abeceda|iroskotské písmo)$/iu, 'latinka'], [/^cyrilice$/iu, 'cyrilice'], [/^(arabské písmo|persko-arabské písmo|perská abeceda|urdský pravopis|arabská abeceda)$/iu, 'arabské písmo'],
    [/^(řecká abeceda|řecké písmo)$/iu, 'řecké písmo'], [/^(hebrejské písmo|hebrejská abeceda)$/iu, 'hebrejské písmo'], [/^dévanágarí$/iu, 'dévanágarí'],
    [/^(hangŭl|hangul)$/iu, 'hangul'], [/^(čínské znaky|čínské písmo)$/iu, 'čínské znaky']];
const scriptName = (name) => {
    if (!name || /braill|writing|alphabet|script|orthography|^rovas$/iu.test(name)) return null;
    const fixed = SCRIPT_NAMES.find(([pattern]) => pattern.test(name));
    if (fixed) return fixed[1];
    if (/ abeceda$|^latinka/iu.test(name)) return CYRILLIC.test(name) ? 'cyrilice' : 'latinka';
    return /písmo$|písma$|^[\p{Ll}-]+$/u.test(name) && name.length <= 25 ? name.toLocaleLowerCase('cs') : null;
};
const SCRIPT_FIX = { 'Japonština': ['kandži', 'hiragana', 'katakana'], 'Korejština': ['hangul'], 'Srbština': ['cyrilice', 'latinka'], 'Čínština': ['čínské znaky'],
    'Gruzínština': ['gruzínské písmo'], 'Maďarština': ['latinka'], 'Somálština': ['latinka'] };
// Jazykové skupiny podle českých názvů nadřazených tříd ve Wikidatech (od nejužší)
const BRANCHES = [['slovanské jazyky', 'slovanský'], ['germánské jazyky', 'germánský'], ['románské jazyky', 'románský'], ['italické jazyky', 'italický'],
    ['keltské jazyky', 'keltský'], ['baltské jazyky', 'baltský'], ['řecké jazyky', 'řecký'], ['indoárijské jazyky', 'indoárijský'], ['íránské jazyky', 'íránský'],
    ['turkické jazyky', 'turkický'], ['uralské jazyky', 'uralský'], ['semitské jazyky', 'semitský'], ['bantuské jazyky', 'bantuský'], ['drávidské jazyky', 'drávidský'],
    ['sinotibetské jazyky', 'sinotibetský'], ['austronéské jazyky', 'austronéský'], ['mongolské jazyky', 'mongolský'], ['tunguzské jazyky', 'tunguzský'],
    ['austroasijské jazyky', 'austroasijský'], ['tajsko-kadajské jazyky', 'thajsko-kadajský'], ['kušitské jazyky', 'kušitský'], ['afroasijské jazyky', 'afroasijský'],
    ['severozápadokavkazské jazyky', 'kavkazský'], ['severovýchodokavkazské jazyky', 'kavkazský'], ['kartvelské jazyky', 'kartvelský'],
    ['japonské jazyky', 'japonský'], ['eskymácko-aleutské jazyky', 'eskymácko-aleutský'], ['arménský jazyk', 'arménský']];
const FAMILIES = ['indoevropské jazyky', 'uralské jazyky', 'turkické jazyky', 'afroasijské jazyky', 'sinotibetské jazyky', 'austronéské jazyky', 'drávidské jazyky',
    'nigerokonžské jazyky', 'austroasijské jazyky', 'japonské jazyky', 'kartvelské jazyky', 'tajsko-kadajské jazyky'];

// Filozofové, které zná skoro každý, a ti, které počet jazykových verzí přeceňuje
const PHILOSOPHERS_KNOWN = ['Aristotelés', 'Sókratés', 'Konfucius', 'Immanuel Kant', 'Lao-c’', 'Pythagoras', 'Georg Wilhelm Friedrich Hegel', 'Diogenés ze Sinópé',
    'Díogenés ze Sinópé', 'John Locke', 'Thomas Hobbes', 'Arthur Schopenhauer', 'Søren Kierkegaard', 'Gautama Buddha', 'Thalés z Milétu', 'Démokritos', 'Epikúros',
    'Hérakleitos', 'Jan Patočka', 'David Hume', 'Ludwig Wittgenstein', 'Martin Heidegger', 'Bertrand Russell', 'Charles Louis Montesquieu'];
const PHILOSOPHERS_NOT = new Set(['Čánakja', 'Ču Si', 'Nágárdžuna', 'Svámí Vivékánanda', 'Šrí Rámakršna', 'Larry Sanger', 'Hildegarda z Bingenu', 'Marshall McLuhan', 'Adam Weishaupt', 'Mahariši Maheš Jógi']);
// Kdo je hlavně ekonom, politik, vědec či náboženský vůdce, mezi filozofy nepatří
// Název díla v cizím jazyce (štítek Wikidat bez českého překladu)
const FOREIGN_TITLE = /(^|\s)(die|der|das|des|la|le|les|de|of|the|und|sulla|dell'?\p{L}*|l'\p{L}*|kohelet)(\s|$)|[äöüœàèçñß]/iu;
const PHILOSOPHER_ROLE = /^(filozof|filosof)/u;
const SECOND_OK = /^(matematik|logik|teolog|básník|spisovatel|esejist|mystik|učenec|polyhistor|myslitel|humanist|pedagog|sémiolog|estetik)/u;

// --- Wikidata ---
const CZ_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q1998866', 'Q1991965', 'Q853348', 'Q39193', 'Q43266']);
const FEMALE = 'Q6581072';
const PHILOSOPHER = 'Q4964182';
const DRAMATIC_WORK = 'Q116476516';
const PLAY = 'Q25379';
const FAIRY_TALE = 'Q699';
const WRITING_SYSTEM = 'Q8192';
const LANGUAGE_CLASSES = ['Q34770', 'Q1288568', 'Q33742', 'Q436240', 'Q45762', 'Q38058796', 'Q33215', 'Q17376908'];
const SOVEREIGN_STATE = 'Q3624078';
const THIS_YEAR = new Date().getFullYear();

// QLever bývá přetížený (429): po dvou pokusech dotaz na query.wikidata.org
const robust = async (query) => { try { return await qlever(query, 2); } catch { return sparql(query); } };
const csArticle = (variable) => `?a schema:about ${variable} ; schema:isPartOf <https://cs.wikipedia.org/> . ${variable} wikibase:sitelinks ?sl .`;
const fromRows = (rows) => rows.map(row => [id(row.x.value), Number(row.sl.value)]);
const quote = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
// Členové kategorie české Wikipedie (MWAPI na query.wikidata.org) → [[název, QID], …]
const categoryMembers = async (category) => (await sparql(`SELECT ?title ?item WHERE {
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "cs.wikipedia.org" ; wikibase:api "Generator" ; mwapi:generator "categorymembers" ;
    mwapi:gcmtitle "${category}" ; mwapi:gcmtype "page" ; mwapi:gcmlimit "max" .
    ?title wikibase:apiOutput mwapi:title . ?item wikibase:apiOutputItem mwapi:item . } }`)).filter(row => row.item).map(row => [row.title.value, id(row.item.value)]);
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

const SINGLE = { t: 1, n: 1, d: 1, den: 1, im: 1, sl: 1, sex: 1, born: 1, died: 1 };
const PROPS = [['P31', 'type'], ['P50', 'author'], ['P577', 'pub'], ['P571', 'from'], ['P1191', 'premiere'], ['P407', 'lang'], ['P495', 'origin'], ['P136', 'genre'],
    ['P7937', 'form'], ['P569', 'born'], ['P570', 'died'], ['P27', 'cit'], ['P135', 'mov'], ['P800', 'notable'], ['P21', 'sex'], ['P279', 'parent'],
    ['P1098', 'speakers'], ['P282', 'script'], ['P170', 'creator']];
const detailQuery = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "en") BIND("den" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P19/wdt:P17 ?v BIND("bornIn" AS ?p) }
  UNION { ?country wdt:P37 ?item ; wdt:P31 wd:${SOVEREIGN_STATE} . BIND(?country AS ?v) BIND("official" AS ?p) }
  ${PROPS.map(([property, key]) => `UNION { ?item wdt:${property} ?v BIND("${key}" AS ?p) }`).join('\n  ')}
}`;
const fetchDetails = async (qids) => {
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, 80, detailQuery, (row) => {
        const entry = result.get(id(row.item.value));
        if (!entry || !row.v) return;
        const key = row.p.value;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, robust);
    return Object.fromEntries(result);
};
const fetchLabels = async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, {}]));
    await inBatches(qids, 300, (batch) => `SELECT ?item ?lang ?l ?sl WHERE { VALUES ?item { ${values(batch)} }
      { ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") } UNION { ?item wikibase:sitelinks ?sl } }`,
    (row) => {
        const entry = result[id(row.item.value)];
        if (row.sl) entry.sl = Number(row.sl.value);
        else if (!entry[row.lang.value]) entry[row.lang.value] = row.l.value;
    }, robust);
    return result;
};
// Nadřazené třídy jazyků (jazyková skupina a rodina)
const fetchAncestors = async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, []]));
    await inBatches(qids, 60, (batch) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(batch)} } ?item wdt:P279+ ?anc . ?anc rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
        (row) => { const list = result[id(row.item.value)]; if (!list.includes(row.l.value)) list.push(row.l.value); }, robust);
    return result;
};

// --- Pomocníci ---
const titleName = (title) => (title || '').replace(/\s*\([^)]*\)\s*$/u, '').trim();
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const nameKey = (name) => name.toLocaleLowerCase('cs');
const years = (list) => (list || []).map(yearOf).filter(year => year !== undefined && year <= THIS_YEAR).sort((a, b) => a - b);
const clean = (text) => (text || '').replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();
const ADJECTIVE = /^[\p{L}-]+(ý|á|é|í|ské|cké)$/u;
const NOT_A_ROLE = /^(a|z|ze|v|ve|se|i|–|-|později|původně|též|také|\d.*)$/u;
const rolesOf = (description) => clean(description).toLowerCase().split(/[\s,;]+/).filter(word => word && !ADJECTIVE.test(word) && !NOT_A_ROLE.test(word)).slice(0, 3);
// Rok narození a úmrtí (starověké roky smí být záporné; odhady na celá půlstoletí jen u starověku)
const lifeYears = (detail) => {
    const born = yearOf(detail.born);
    const died = yearOf(detail.died);
    if (born === undefined || born > THIS_YEAR - 15) return null;
    if (died !== undefined && (died <= born || died > THIS_YEAR || died - born > 110)) return { born };
    if (died === undefined && born < THIS_YEAR - 100) return { born };
    return { born, died };
};
const ANCIENT = [['starořeck', 'Starověké Řecko'], ['řeck', 'Starověké Řecko'], ['starořímsk', 'Starověký Řím'], ['římsk', 'Starověký Řím'], ['čínsk', 'Čína'],
    ['indick', 'Indie'], ['staroindick', 'Indie']];
const ancientLand = (description, born) => {
    if (born === undefined || born >= 500) return undefined;
    const word = clean(description).toLowerCase().split(/\s+/).find(other => /(ský|cký|ská|cká)$/u.test(other));
    return word ? (ANCIENT.find(([stem]) => word.startsWith(stem)) || [])[1] : undefined;
};
// Čísla mluvčích: „asi 230 milionů“
export const speakersLabel = (count) => {
    if (!count) return undefined;
    if (count >= 1e9) return `asi ${String(Math.round(count / 1e8) / 10).replace('.', ',')} miliardy`;
    if (count >= 1e6) { const m = count >= 1e7 ? Math.round(count / 1e6) : Math.round(count / 1e5) / 10; return `asi ${String(m).replace('.', ',')} ${m >= 5 ? 'milionů' : m >= 2 ? 'miliony' : 'milionu'}`; }
    if (count >= 1e3) { const k = Math.round(count / 1e3); return `asi ${k} ${k >= 5 ? 'tisíc' : 'tisíce'}`; }
    return `asi ${count}`;
};

export const buildExtra = async ({ existing }) => {
    // 0. co už v tématu a v jiných tématech je (stejná položka nemá být ve dvou tématech, existující položky se nemění)
    const kept = existing.filter(item => !isExtraItem(item));
    const keptIds = new Set(kept.map(item => item.q));
    const keptNames = new Set(kept.map(item => nameKey(item.n)));
    const other = new Map();
    const dataDir = new URL('../../data/', import.meta.url);
    for (const file of readdirSync(dataDir)) {
        if (!file.endsWith('.json') || file === 'literatura.json' || /^(souvislosti|retezovka|licenses|photo|mapa-opravy)/.test(file)) continue;
        const walk = (node) => {
            if (Array.isArray(node)) node.forEach(walk);
            else if (node && typeof node === 'object') {
                if (typeof node.q === 'string' && /^Q\d+$/.test(node.q)) other.set(node.q, file.replace(/\.json$/, ''));
                for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
            }
        };
        walk(JSON.parse(readFileSync(new URL(file, dataDir), 'utf8')));
    }
    const countries = readCountries();
    const countryName = (qid) => countries[qid] ? countries[qid].name : undefined;

    // 1. kandidáti
    const plays = await cached('literatura-x-plays', async () => fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { { ?x wdt:P31 wd:${DRAMATIC_WORK} } UNION { ?x wdt:P7937 wd:${PLAY} } ${csArticle('?x')} }`)));
    const playCats = new Map();
    for (const category of PLAY_CATEGORIES) {
        for (const [, qid] of await cached(`literatura-x-cat-${category.replace(/\W+/gu, '-')}`, () => categoryMembers(category))) playCats.set(qid, [...(playCats.get(qid) || []), category]);
        await sleep(300);
    }
    const tales = await cached('literatura-x-tales', async () => fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { { ?x wdt:P31/wdt:P279* wd:${FAIRY_TALE} } UNION { ?x wdt:P136 wd:${FAIRY_TALE} } UNION { ?x wdt:P7937 wd:${FAIRY_TALE} } ${csArticle('?x')} }`)));
    const taleCats = new Map();
    const taleTitles = new Map();
    for (const category of TALE_CATEGORIES) {
        for (const [title, qid] of await cached(`literatura-x-cat-${category.replace(/\W+/gu, '-')}`, () => categoryMembers(category))) {
            taleTitles.set(qid, title);
            taleCats.set(qid, [...(taleCats.get(qid) || []), category]);
        }
        await sleep(300);
    }
    const philosophers = await cached('literatura-x-philosophers', async () => [
        ...fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P106 wd:${PHILOSOPHER} ; wdt:P31 wd:Q5 . ${csArticle('?x')} FILTER(?sl >= 40) }`)),
        ...fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P106 wd:${PHILOSOPHER} ; wdt:P31 wd:Q5 ; wdt:P27 ?c . VALUES ?c { ${values([...CZ_STATES])} } ${csArticle('?x')} FILTER(?sl >= 8) }`))]);
    const languages = await cached('literatura-x-languages', async () => fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?cls { ${values(LANGUAGE_CLASSES)} } ?x wdt:P31 ?cls . ${csArticle('?x')} FILTER(?sl >= 80) }`)));
    const handTitles = [...new Set([...PLAYS_KNOWN, ...PLAYS_MORE, ...TALES_MORE, ...TALES_KNOWN, ...SCRIPTS.map(title => title.replace(/^\*/, ''))])];
    const byTitle = await cachedByKey('literatura-x-titles', handTitles, resolveTitles);
    const missing = handTitles.filter(title => !byTitle[title]);
    if (missing.length) console.warn(`  rozšíření: chybí články ${missing.join(', ')}`);
    const qidOf = (title) => byTitle[title] || null;

    const playIds = new Set([...plays.filter(([, sl]) => sl >= 3).map(([q]) => q), ...playCats.keys(), ...[...PLAYS_KNOWN, ...PLAYS_MORE].map(qidOf).filter(Boolean)]);
    const taleIds = new Set([...tales.map(([q]) => q), ...taleCats.keys(), ...[...TALES_MORE, ...TALES_KNOWN].map(qidOf).filter(Boolean)]);
    for (const qid of taleIds) playIds.delete(qid);
    const scriptIds = new Set(SCRIPTS.map(title => qidOf(title.replace(/^\*/, ''))).filter(Boolean));
    const languageIds = new Set(languages.map(([q]) => q).filter(q => !scriptIds.has(q)));
    const philosopherIds = new Set(philosophers.map(([q]) => q));
    const allIds = [...new Set([...playIds, ...taleIds, ...scriptIds, ...languageIds, ...philosopherIds])].filter(q => !keptIds.has(q) && !other.has(q));
    const skippedOther = [...new Set([...playIds, ...taleIds, ...scriptIds, ...languageIds, ...philosopherIds])].filter(q => other.has(q) && !keptIds.has(q));
    console.log(`Rozšíření – kandidáti: ${playIds.size} her, ${taleIds.size} pohádek, ${languageIds.size} jazyků, ${scriptIds.size} písem, ${philosopherIds.size} filozofů; v jiných tématech ${skippedOther.length}`);

    // 2. podrobnosti, názvy odkazovaných položek, nadřazené třídy jazyků, návštěvnost
    const details = await cachedByKey('literatura-x-details', allIds, fetchDetails);
    // Pohádková hra (Strakonický dudák) je divadelní hra
    for (const qid of [...taleIds]) {
        if (/^(drama|divadelní hra|veselohra)/iu.test((details[qid] || {}).d || '')) { taleIds.delete(qid); playIds.add(qid); }
    }
    const REF_KEYS = ['type', 'author', 'lang', 'origin', 'genre', 'form', 'cit', 'mov', 'notable', 'parent', 'script', 'creator', 'bornIn', 'official'];
    const refs = [...new Set(allIds.flatMap(q => REF_KEYS.flatMap(key => (details[q] || {})[key] || [])))].filter(q => /^Q\d+$/.test(q));
    const labels = await cachedByKey('literatura-x-labels', refs, fetchLabels);
    const ancestors = await cachedByKey('literatura-x-ancestors', [...languageIds].filter(q => details[q]), fetchAncestors);
    const label = (qid) => { const entry = labels[qid] || {}; return entry.cs || entry.en; };
    const labelEn = (qid) => ((labels[qid] || {}).en || '').toLowerCase();
    const pageviews = await topicPageviews('literatura-x-pageviews', allIds.map(q => (details[q] || {}).t).filter(Boolean));

    // 3. položky
    const items = [];
    const skipped = [];
    const skip = (qid, reason) => skipped.push([reason, (details[qid] || {}).t || qid]);
    const base = (qid, category) => {
        const detail = details[qid];
        return { q: qid, t: detail.t, n: capitalize(titleName(detail.t) || detail.n || ''), c: category, _: { sl: Number(detail.sl) || 0, pv: pageviews[detail.t] || 0 } };
    };
    const personName = (qid) => { const entry = labels[qid] || {}; return entry.cs || entry.en; };
    const authorsOf = (detail) => [...new Set([...(detail.author || []), ...(detail.creator || [])])].filter(q => /^Q\d+$/.test(q));
    const literatureAuthors = new Map(kept.filter(item => item.c === 'spisovatele').map(item => [item.q, item]));
    const workLand = (detail, authors) => {
        const origin = (detail.origin || []).map(countryName).find(Boolean);
        if (origin) return origin;
        const author = authors.map(q => literatureAuthors.get(q)).find(Boolean);
        if (author && author.f.land) return author.f.land;
        return undefined;
    };
    const workLang = (detail) => (detail.lang || []).map(label).filter(Boolean).map(text => /angličtina$/u.test(text) ? 'angličtina' : text).find(text => /ina$|ština$|čtina$|latina/u.test(text));

    // Divadelní hry: druh podle žánru a popisu, autor (nejvýš dva), rok premiéry nebo vydání, země a jazyk
    const PLAY_KINDS = [['tragédie', /tragédi|tragedy/u], ['komedie', /komedi|veselohr|fraška|comedy|farce/u], ['historická hra', /historick\p{L}* hr|history play/u],
        ['drama', /^drama$|drama \(|dramatick|\bdrama\b/u]];
    for (const qid of playIds) {
        const detail = details[qid];
        if (!detail || !detail.t) continue;
        if (keptIds.has(qid) || other.has(qid)) continue;
        const text = [detail.d || '', ...(detail.type || []).map(label), ...(detail.genre || []).map(labelEn), ...(detail.genre || []).map(label)].join(' | ').toLowerCase();
        const lead = (detail.d || '').split(/\s+/).slice(0, 3).join(' ');
        if (PLAY_NOT.test(`${detail.t} ${lead}`) || (detail.type || []).map(labelEn).some(type => PLAY_NOT_TYPE.test(type))) { skip(qid, 'hra: opera, muzikál, inscenace'); continue; }
        const cats = playCats.get(qid) || [];
        const authors = authorsOf(detail);
        // Hra bez českého článku o autorovi ani v kategorii by byla jen jméno – stačí autor ve Wikidatech
        const names = authors.map(personName).filter(name => name && !/^Q\d+$/.test(name));
        const cimrman = cats.includes(CIMRMAN_CATEGORY);
        const by = cimrman ? 'Ladislav Smoljak a Zdeněk Svěrák' : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} a ${names[1]}` : undefined;
        const year = years(detail.premiere)[0] ?? years(detail.pub)[0] ?? years(detail.from)[0];
        if (!by && !year) { skip(qid, 'hra bez autora i roku'); continue; }
        // Zahraniční hra bez autora (Rabinal Achí, Hejtman z Kopníku bez Zuckmayera) by měla jen rok – bez otázky na autora a s chudými nápovědami
        if (!by && !playCats.has(qid) && !(detail.lang || []).includes('Q9056')) { skip(qid, 'zahraniční hra bez autora'); continue; }
        const item = base(qid, 'hry');
        item.ty = cimrman ? 'cimrmanovská hra' : (PLAY_KINDS.find(([, pattern]) => pattern.test(text)) || ['divadelní hra'])[0];
        if (item.ty === 'drama') item.ty = 'divadelní hra';
        const author = authors.length === 1 && literatureAuthors.has(authors[0]) ? authors[0] : undefined;
        const czech = cats.length > 0 && !cats.includes('Kategorie:Divadelní hry Williama Shakespeara') || (detail.lang || []).includes('Q9056')
            || authors.some(q => literatureAuthors.get(q) && literatureAuthors.get(q).cz === 1) || /^česk/iu.test(detail.d || '');
        // Popis, který hru nepopisuje („román“ u Její pastorkyně, „kniha“ u Dona Juana), se nahradí
        item.d = detail.d && PLAY_DESCRIPTION.test(detail.d) ? detail.d : undefined;
        item.f = compact({
            year, by, byq: author, land: czech ? 'Česko' : workLand(detail, authors), lang: czech ? 'čeština' : workLang(detail),
            th: cimrman ? 'Divadlo Járy Cimrmana' : cats.includes(OSVOBOZENE_CATEGORY) ? 'Osvobozené divadlo' : undefined, y: year
        });
        if (czech) item.cz = 1;
        if (!item.d) item.d = `${czech ? 'česká ' : ''}divadelní hra${year ? ` z roku ${year}` : ''}`;
        Object.assign(item, imageFields(detail.im));
        items.push(item);
    }

    // Pohádky a knihy pro děti
    for (const qid of taleIds) {
        const detail = details[qid];
        if (!detail || !detail.t) continue;
        if (keptIds.has(qid) || other.has(qid)) continue;
        if (TALE_NOT.test(detail.t) || (detail.type || []).includes('Q5') || /rozcestník|rozhlasov|plastika|socha/iu.test(detail.d || '')) { skip(qid, 'pohádka: není pohádkou'); continue; }
        const types = (detail.type || []).map(labelEn).join(' | ');
        if (/film|television|human|character|radio|opera|ballet/.test(types) && !/fairy tale|literary work|book/.test(types)) { skip(qid, `pohádka: druh ${types}`); continue; }
        const cats = taleCats.get(qid) || [];
        const fix = TALE_FIX[detail.t] || {};
        const item = base(qid, 'pohadky');
        const authors = authorsOf(detail);
        const described = TALE_AUTHORS.find(([, pattern]) => pattern.test(detail.d || ''));
        const fromCategory = cats.map(category => TALE_CATEGORY_AUTHORS[category]).find(Boolean);
        const names = authors.map(personName).filter(name => name && !/^Q\d+$/.test(name));
        let by = fix.by !== undefined ? fix.by : fromCategory || (described && described[0]) || (names.length === 1 ? names[0] : undefined);
        if (by && /Grimm/u.test(by)) by = 'bratři Grimmové';
        const listed = TALE_AUTHORS.find(([name]) => name === by);
        const byk = fix.byk || (listed ? listed[2] : 'autor');
        const kind = fix.ty || (/sbírk|soubor/u.test(detail.d || '') || /^(\S+ )?(pohádky|pohádek|báchorky)\b|^Pohádky\b/iu.test(item.n) ? 'sbírka pohádek'
            : /pohád|fairy|tale|märchen/iu.test(`${detail.d || ''} ${types}`) || cats.length ? 'pohádka' : 'kniha pro děti');
        const year = years(detail.pub)[0] ?? years(detail.from)[0];
        const land = fix.land || cats.map(category => TALE_CATEGORY_LANDS[category]).find(Boolean) || (workLand(detail, authors) || '').replace(/^Československo$/u, 'Česko') || undefined
            || (by && literatureAuthors.size ? [...literatureAuthors.values()].find(other => other.n === by)?.f.land : undefined);
        const authorItem = [...literatureAuthors.values()].find(other => other.n === by);
        item.ty = kind;
        // Popis anglicky („Czech folk tale, recorded by…“) se nahradí
        item.d = detail.d && !/\b(the|by|tale|folk)\b/iu.test(detail.d) ? detail.d : undefined;
        const czech = land === 'Česko' || land === 'Slovensko' || (authorItem && authorItem.cz === 1) || /^(česk|slovensk)/iu.test(detail.d || '');
        const known = year !== undefined && year >= 1500 ? year : undefined;
        item.f = compact({ year: known, by: by || undefined, byk: by ? byk : undefined, byq: authorItem ? authorItem.q : undefined, land: land || (czech ? 'Česko' : undefined), y: known });
        if (czech) item.cz = 1;
        if (!item.d) item.d = `${item.cz ? 'česká ' : ''}${kind}`;
        Object.assign(item, imageFields(detail.im));
        items.push(item);
    }

    // Jazyky: skupina a rodina (nadřazené třídy), počet mluvčích, písmo, státy s úředním jazykem
    const languageItems = [];
    for (const qid of languageIds) {
        const detail = details[qid];
        if (!detail || !detail.t) continue;
        if (keptIds.has(qid) || other.has(qid)) continue;
        const item = base(qid, 'jazyky');
        if (LANGUAGES_NOT.has(item.n) || /dialekt|nářečí|varianta|skupina jazyků|makrojazyk|hypotetick/iu.test(detail.d || '')) { skip(qid, 'jazyk: nářečí, skupina nebo umělý'); continue; }
        if (!/(ina|ština|čtina|tina|ština)$/u.test(item.n) && !LANGUAGES_KNOWN.includes(item.n) && item._.sl < 100) { skip(qid, 'jazyk: neobvyklý název'); continue; }
        const anc = ancestors[qid] || [];
        const branch = BRANCHES.find(([name]) => anc.includes(name));
        const family = FAMILIES.find(name => anc.includes(name));
        const artificial = ARTIFICIAL.has(item.n) || /umělý|plánový/u.test(detail.d || '');
        const speakers = Math.max(0, ...(detail.speakers || []).map(Number).filter(Number.isFinite));
        const scripts = SCRIPT_FIX[item.n] || [...new Set((detail.script || []).map(q => scriptName(label(q))).filter(Boolean))];
        const dead = /mrtv|vymřel|historick|starověk|vyhynul/iu.test(detail.d || '') || (detail.type || []).some(q => ['Q45762', 'Q38058796', 'Q436240'].includes(q));
        const official = [...new Set((detail.official || []).map(countryName).filter(Boolean))];
        item.ty = artificial ? 'umělý jazyk' : dead ? 'mrtvý jazyk' : 'jazyk';
        // Krátký popis bez země (turkický jazyk používaný v Turecku → turkický jazyk): země je mezi nápovědami až na konci
        const adjective = /^([\p{L}-]+ý) jazyk/u.exec(detail.d || '');
        item.d = artificial ? 'umělý jazyk' : adjective ? `${adjective[1]} jazyk` : branch ? `${branch[1]} jazyk` : family ? `jazyk z rodiny ${family}` : 'jazyk';
        if (dead && !/mrtv/u.test(item.d)) item.d = `mrtvý ${item.d}`;
        item.f = compact({
            br: branch ? branch[0] : undefined,
            fam: family && (!branch || family !== branch[0]) ? family : undefined,
            sp: speakers >= 1000 && !dead && !artificial ? speakers : undefined,
            scr: scripts.slice(0, 2),
            off: official.slice(0, 4),
            no: official.length > 4 ? official.length : undefined
        });
        if (qid === 'Q9056' || item.n === 'Slovenština') item.cz = 1;
        languageItems.push(item);
    }
    // Jeden jazyk na název (Laoština dvakrát): ten s víc jazykovými verzemi; nejvýš 170 jazyků podle známosti
    const knownLanguages = new Set(LANGUAGES_KNOWN);
    languageItems.sort((a, b) => Number(knownLanguages.has(b.n)) - Number(knownLanguages.has(a.n)) || b._.sl - a._.sl);
    const languageNames = new Set();
    for (const item of languageItems) {
        if (languageNames.has(nameKey(item.n)) || languageNames.size >= 170) continue;
        languageNames.add(nameKey(item.n));
        items.push(item);
    }
    // Písma: druh (abeceda, slabičné písmo…), rok vzniku, jazyky, které jím píšou
    const scriptUsers = new Map();
    // Jazyky, které píšou hlavně tímto písmem (první písmo jazyka)
    for (const item of languageItems) for (const name of (item.f.scr || []).slice(0, 1)) scriptUsers.set(name, [...(scriptUsers.get(name) || []), item]);
    const SCRIPT_KINDS = [['slabičné písmo', /syllab|slabičn/u], ['abugida', /abugid/u], ['souhláskové písmo', /abjad|souhláskov/u], ['abeceda', /alphabet|abeced/u],
        ['obrázkové písmo', /hieroglyph|logogra|ideogra|piktogra|hierogly/u]];
    const knownScripts = new Set(SCRIPTS.filter(title => title.startsWith('*')).map(title => title.slice(1)));
    for (const title of SCRIPTS.map(entry => entry.replace(/^\*/, ''))) {
        const qid = qidOf(title);
        const detail = qid && details[qid];
        if (!detail || !detail.t || keptIds.has(qid) || other.has(qid)) continue;
        const item = base(qid, 'jazyky');
        const types = [...(detail.type || []).map(labelEn), clean(detail.d).toLowerCase()].join(' | ');
        item.ty = (SCRIPT_KINDS.find(([, pattern]) => pattern.test(types)) || ['písmo'])[0];
        item.ty = item.ty === 'písmo' ? 'písmo' : item.ty;
        const users = [...(scriptUsers.get(label(qid) || '') || []), ...(scriptUsers.get(nameKey(item.n)) || [])]
            .sort((a, b) => b._.sl - a._.sl).map(other => other.n);
        const year = years(detail.from)[0];
        item.d = `${item.ty === 'písmo' ? 'písmo' : item.ty}`;
        item.f = compact({ year: year !== undefined && year > -4000 ? year : undefined, langs: [...new Set(users)].slice(0, 3), y: year, script: 1 });
        Object.assign(item, imageFields(detail.im));
        item._.hand = knownScripts.has(title);
        items.push(item);
    }

    // Filozofové: role z popisu (filozof jako první, nebo druhá po matematikovi, teologovi…), život, země, směr, slavné dílo
    for (const qid of philosopherIds) {
        const detail = details[qid];
        if (!detail || !detail.t || !detail.d) continue;
        if (keptIds.has(qid) || other.has(qid)) continue;
        const roles = rolesOf(detail.d);
        const philosopher = roles.findIndex(role => PHILOSOPHER_ROLE.test(role));
        if (philosopher < 0 || philosopher > 1 || (philosopher === 1 && !SECOND_OK.test(roles[0]))) { skip(qid, `filozof: role ${roles.join('/')}`); continue; }
        const item = base(qid, 'filozofove');
        if (PHILOSOPHERS_NOT.has(item.n)) { skip(qid, 'filozof: vyřazen ručně'); continue; }
        const life = lifeYears(detail);
        if (!life) { skip(qid, 'filozof bez let'); continue; }
        const female = detail.sex === FEMALE;
        const lands = (detail.cit || []).map(countryName).filter(Boolean);
        const land = ancientLand(detail.d, life.born) || landByDescription(detail.d, lands) || lands[0];
        const czech = (detail.cit || []).some(q => CZ_STATES.has(q)) && /^(česk|českoslov|moravsk)/iu.test(clean(detail.d));
        const movements = (detail.mov || []).map(label).filter(name => name && name.length <= 30 && /ismus|ika$|škola/u.test(name) && !/hudb|umění|architekt|expresionism/u.test(name))
            .map(name => /ismus$/u.test(name) && !/ /u.test(name) ? name.toLocaleLowerCase('cs') : /^\p{Lu}\p{Ll}+ý (idealismus|realismus)$/u.test(name) ? name.toLocaleLowerCase('cs') : name);
        // Slavné dílo jen s českým názvem (ne anglický štítek, věta ani jméno filozofa)
        const works = (detail.notable || []).filter(q => (labels[q] || {}).cs && (labels[q].cs !== labels[q].en || /[áčďéěíňóřšťúůýž]/iu.test(labels[q].cs)))
            .map(q => labels[q].cs).filter(name => name.length <= 45 && /^\p{Lu}/u.test(name) && !/věta$|paradox|aporie|^Dílo:|w/iu.test(name) && !FOREIGN_TITLE.test(name)
                && !name.includes(item.n.split(' ').pop()));
        item.ty = female ? 'filozofka' : 'filozof';
        item.d = detail.d;
        if (female) item.sx = 'f';
        if (czech) item.cz = 1;
        item.f = compact({
            born: life.born, died: life.died, land: czech ? 'Česko' : land, mov: movements[0], work: works[0],
            y: life.died !== undefined ? Math.min(life.born + 40, Math.round(life.born + (life.died - life.born) * 0.75)) : life.born + 40
        });
        Object.assign(item, imageFields(detail.im));
        items.push(item);
    }

    // 4. jedna položka na jméno (ne stejné jméno jako existující položka tématu), nejvýš CAPS na kategorii (známější přednost)
    const CAPS = { hry: { svet: 90, cz: 90 }, pohadky: { svet: 70, cz: 60 }, jazyky: { svet: 220, cz: 5 }, filozofove: { svet: 125, cz: 15 } };
    const handKnown = new Set([...PLAYS_KNOWN, ...TALES_KNOWN].map(qidOf).filter(Boolean));
    const fame = (item) => (handKnown.has(item.q) || item._.hand ? 1e9 : 0) + item._.pv + 400 * item._.sl;
    items.sort((a, b) => fame(b) - fame(a));
    const taken = new Set(keptNames);
    const added = [];
    const counts = {};
    for (const item of items) {
        const key = nameKey(item.n);
        if (taken.has(key)) { skip(item.q, `jméno už v tématu: ${item.n}`); continue; }
        const side = `${item.c}|${item.cz ? 'cz' : 'svet'}`;
        if ((counts[side] || 0) >= CAPS[item.c][item.cz ? 'cz' : 'svet']) { skip(item.q, `nad limit ${side}`); continue; }
        counts[side] = (counts[side] || 0) + 1;
        taken.add(key);
        if (handKnown.has(item.q) || knownLanguages.has(item.n) || PHILOSOPHERS_KNOWN.includes(item.n)) item._.hand = true;
        if (PHILOSOPHERS_NOT.has(item.n) || LANGUAGES_NOT.has(item.n) || (item.c === 'hry' && PLAYS_NEVER.has(item.n))) item._.never = true;
        added.push(item);
    }
    if (process.env.LITERATURA_DEBUG) for (const [reason, title] of skipped.sort()) console.log(`  vynecháno: ${reason}: ${title}`);
    return { items: added, skippedOther: skippedOther.map(q => [q, other.get(q)]) };
};

// --- Okruhy nových položek ---
const EUROPE_BRANCHES = new Set(['germánské jazyky', 'románské jazyky', 'italické jazyky', 'keltské jazyky', 'baltské jazyky', 'řecké jazyky', 'uralské jazyky']);
const EUROPE_LANGUAGES = /^(Albánština|Řečtina|Starořečtina|Baskičtina|Maďarština|Finština|Estonština|Maltština|Latina)$/u;
const EAST = /^(Čína|Indie|Japonsko|Korea|Jižní Korea|Tibet|Vietnam|Nepál)$/u;
const groupsOf = (item) => {
    const f = item.f || {};
    const groups = [];
    if (item.c === 'hry') {
        if (item.cz) groups.push('ceske-divadlo', 'ceska-literatura');
        if (/Shakespeare/u.test(f.by || '')) groups.push('shakespeare', 'anglicka-americka');
        groups.push('drama');
    }
    if (item.c === 'pohadky') {
        groups.push(item.cz ? 'ceske-pohadky' : 'svetove-pohadky', 'detska');
        if (item.cz) groups.push('ceska-literatura');
    }
    if (item.c === 'jazyky') {
        if (f.script) groups.push('pisma');
        else if (f.br === 'slovanské jazyky') groups.push('slovanske-jazyky');
        else if (EUROPE_BRANCHES.has(f.br) || EUROPE_LANGUAGES.test(item.n)) groups.push('jazyky-evropy');
        else if (item.ty !== 'umělý jazyk') groups.push('jazyky-sveta');
    }
    if (item.c === 'filozofove') {
        if (f.born < 500) groups.push('anticka-filozofie');
        else if (f.born >= 1500 && f.born < 1850) groups.push('novoveka-filozofie');
        else if (f.born >= 1850) groups.push('moderni-filozofie');
        if (EAST.test(f.land || '')) groups.push('vychodni-filozofie');
        if (item.cz) groups.push('ceska-literatura');
    }
    return groups;
};

// Úrovně: známé = ruční seznamy a nejznámější čtvrtina skupiny (kategorie, české zvlášť); spodní hranice v okruzích a kategoriích;
// pro experty nejméně známá čtvrtina (české šestina)
export const extraLevels = (items, collections) => {
    for (const item of items) {
        item._.pool = `${item.c}|${item.cz ? 'cz' : 'svet'}`;
        item.k = item._.hand && !item._.never ? 1 : 0;
    }
    const groups = levelGroups(items, collections.filter(collection => EXTRA_COLLECTIONS.some(extra => extra.id === collection.id)));
    return assignLevels(items, {
        knownShare: (pool) => pool.endsWith('|cz') ? 0.22 : 0.2,
        expertShare: (pool) => pool.endsWith('|cz') ? 0.16 : 0.25,
        // České hry a pohádky mají jazykových verzí málo: rozhoduje návštěvnost
        pvWeight: (pool) => pool.endsWith('|cz') ? 0.85 : pool.startsWith('jazyky') ? 0.5 : 0.7,
        ceiling: () => 0.45,
        groups,
        expertMax: 0.4
    });
};

// Sloučí rozšíření do dat tématu: existující položky beze změny, položky rozšíření z dřívějšího běhu nahradí nové sestavení,
// ty, které nový běh nenašel, zůstanou (žádné id nezmizí); okruhy rozšíření na konec seznamu
export const mergeExtra = ({ collections, items }, extra) => {
    const fresh = extra.items;
    for (const item of fresh) {
        const groups = groupsOf(item);
        if (groups.length) item.g = [...new Set(groups)];
    }
    const ids = new Set(EXTRA_COLLECTIONS.map(collection => collection.id));
    const allCollections = [...collections.filter(collection => !ids.has(collection.id)), ...EXTRA_COLLECTIONS];
    const promoted = extraLevels(fresh, allCollections);
    if (promoted.length) console.log(`  povýšeno kvůli spodní hranici: ${promoted.map(([group, name]) => `${name} (${group})`).join(', ')}`);
    for (const item of fresh) delete item._;
    const freshIds = new Set(fresh.map(item => item.q));
    const stale = items.filter(item => isExtraItem(item) && !freshIds.has(item.q));
    if (stale.length) console.warn(`  rozšíření: ${stale.length} dřívějších položek nový běh nenašel, zůstávají (${stale.slice(0, 5).map(item => item.n).join(', ')}…)`);
    return {
        collections: allCollections,
        items: [...items.filter(item => !(isExtraItem(item) && freshIds.has(item.q))), ...fresh]
    };
};

export const extraSummary = (items) => {
    for (const category of EXTRA_CATEGORIES) {
        const list = items.filter(item => item.c === category);
        console.log(`${levelSummary(category, list)}, českých ${list.filter(item => item.cz).length} (známých ${list.filter(item => item.cz && item.k === 1).length})`);
    }
    for (const collection of EXTRA_COLLECTIONS) {
        const members = items.filter(item => (item.g || []).includes(collection.id));
        const known = members.filter(item => item.k === 1).length;
        console.log(`  ${levelSummary(`okruh ${collection.id}`, members)}${known < knownFloor(members.length) ? ' – POD SPODNÍ HRANICÍ' : ''}`);
    }
};
