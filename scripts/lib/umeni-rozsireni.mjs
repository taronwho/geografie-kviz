// Téma Výtvarné umění, rozšíření o užité umění: nové kategorie Móda a návrháři (moda), Design a nábytek (design), Šperky a klenoty
// (sperky) a Písma a typografie (pisma). Používá build-umeni.mjs: na konci celého sestavení, nebo samostatně nad hotovým
// data/umeni.json (UMENI_ONLY=rozsireni) – dosavadní položky se nestahují ani nemění (id, kategorie a úroveň zůstanou; české položky
// přibudou jen do okruhu České umění).
//
// Kandidáti: ruční seznamy podle ID Wikidat (vybrané z povolání módní návrhář, designér, typograf a zlatník, z modelů nábytku, rodin
// písma a korunovačních klenotů, jen s článkem na české Wikipedii). Položky, které už má jiné téma (data/*.json) nebo Umění, se
// vynechají: slavné diamanty (Koh-i-Noor, Cullinan, Hope, Orlov) a drahokamy má Geologie, smalt Chemie, džíny, bikiny, Rubikovu
// kostku a Lego Fyzika, architekty-designéry (Breuer, Mies van der Rohe, Jacobsen, Panton, Aalto, Rietveld) Architektura, auta a
// skútry Technika, Bauhaus a art deco Umělecké směry.
// Známost: sláva = geometrický průměr návštěvnosti článku české Wikipedie za rok a počtu jazykových verzí (jako v celém tématu,
// scripts/lib/umeni-levels.mjs); podíly známých a expertních jako u fotografů a ilustrátorů, zvlášť pro lidi a pro věci.
import { readFileSync, readdirSync } from 'node:fs';
import { sparql, id, values, imageFields, yearOf, compact, cached, inBatches } from './wikidata.mjs';
import { landByDescription } from './nationality.mjs';
import { assignLevels, fameOf, levelSummary } from './umeni-levels.mjs';
import { pageviewsByTitle } from './veda-levels.mjs';

export const EXTRA_CATEGORIES = ['moda', 'design', 'sperky', 'pisma'];

// --- Ruční seznamy: [ID, druh, úpravy] ---
// Druhy osob: navrhar, obuv, kostym (Móda), designer, sklar, nabytkar, keramik (Design), klenotnik, zlatnik, sperkar (Šperky),
// typograf, tiskar, grafik (Písma). Druhy věcí: dum, znacka (Móda); nabytek, predmet, firma, hnuti (Design);
// koruna, klenoty, klenot, poklad, diamant, druh, firma, pojem (Šperky); pismo, druh, pojem, znak (Písma).
// Úpravy: d = popis (kde ho Wikidata nemají, nic neříká nebo prozrazuje název), n = název, cz = česká položka, noImage = bez obrázku,
// land = země, year = rok vzniku, by = autor či zakladatel (kde ho Wikidata nemají)
const MODA = [
    // Módní návrháři a návrhářky
    ['Q45661', 'navrhar'], ['Q76716', 'navrhar'], ['Q157054', 'navrhar'], ['Q159694', 'navrhar'], ['Q171556', 'navrhar'], ['Q158067', 'navrhar'],
    ['Q229437', 'navrhar'], ['Q264490', 'navrhar'], ['Q214800', 'navrhar'], ['Q299211', 'navrhar'], ['Q242868', 'navrhar'], ['Q207939', 'navrhar'],
    ['Q379664', 'navrhar'], ['Q296647', 'navrhar'], ['Q232812', 'navrhar'], ['Q242342', 'navrhar'], ['Q230728', 'navrhar'], ['Q167318', 'navrhar'],
    ['Q136687', 'navrhar'], ['Q234147', 'navrhar'], ['Q467754', 'navrhar'], ['Q318149', 'navrhar'], ['Q272438', 'navrhar'], ['Q381088', 'navrhar'],
    ['Q313607', 'navrhar'], ['Q262789', 'navrhar'], ['Q313108', 'navrhar'], ['Q464497', 'navrhar'], ['Q237944', 'navrhar'], ['Q454927', 'navrhar'],
    ['Q464023', 'navrhar'], ['Q288029', 'navrhar'], ['Q264589', 'navrhar'], ['Q717618', 'navrhar'], ['Q469027', 'navrhar'], ['Q275094', 'navrhar'],
    ['Q350844', 'navrhar'], ['Q234503', 'navrhar'], ['Q551674', 'navrhar'], ['Q707890', 'navrhar'], ['Q705844', 'navrhar'], ['Q454330', 'navrhar'],
    ['Q79147', 'navrhar'], ['Q449114', 'navrhar'], ['Q465447', 'navrhar'], ['Q775324', 'navrhar', { noImage: true }], ['Q1225616', 'navrhar', { noImage: true, d: 'italský módní návrhář, spoluzakladatel módní značky' }], ['Q467665', 'navrhar'],
    ['Q266934', 'navrhar'], ['Q152116', 'navrhar'], ['Q255184', 'navrhar'], ['Q268033', 'navrhar'], ['Q371411', 'navrhar'], ['Q529203', 'navrhar'],
    ['Q1362757', 'navrhar'], ['Q1231482', 'navrhar'], ['Q1343117', 'navrhar'], ['Q3435802', 'navrhar'], ['Q1258918', 'navrhar'], ['Q556462', 'navrhar'],
    ['Q440616', 'navrhar', { d: 'francouzská módní návrhářka' }], ['Q2553832', 'navrhar'],
    ['Q456243', 'navrhar', { noImage: true, d: 'americký módní návrhář, autor minimalistických šatů 70. let' }],
    ['Q89412', 'navrhar', { d: 'rakouský módní návrhář a výtvarník' }],
    ['Q714126', 'navrhar', { d: 'italský obchodník s koženým zbožím a módní návrhář, zakladatel módního domu' }],
    ['Q156343', 'navrhar', { d: 'americký obchodník a výrobce džínsů německého původu' }],
    ['Q452136', 'obuv'], ['Q334412', 'obuv'], ['Q362249', 'obuv', { d: 'malajsijský návrhář obuvi čínského původu, který žije v Londýně' }],
    ['Q234961', 'kostym'],
    // Čeští módní návrháři
    ['Q11158353', 'navrhar', { cz: 1 }], ['Q56460634', 'navrhar', { cz: 1 }], ['Q100382939', 'navrhar', { cz: 1 }],
    ['Q12042993', 'navrhar', { cz: 1, d: 'kubánský módní návrhář, který tvoří v Praze', land: 'Kuba' }],
    ['Q95170406', 'navrhar', { cz: 1, d: 'česká módní návrhářka a textilní výtvarnice' }],
    ['Q112370885', 'navrhar', { cz: 1, d: 'česká módní návrhářka a kostýmní výtvarnice z Brna' }],
    // Módní domy
    ['Q178516', 'dum'], ['Q191485', 'dum'], ['Q193136', 'dum'], ['Q843887', 'dum'], ['Q696376', 'dum'], ['Q214480', 'dum'], ['Q635484', 'dum'],
    ['Q1530892', 'dum'], ['Q759210', 'dum'], ['Q390107', 'dum'], ['Q659863', 'dum'], ['Q948531', 'dum'], ['Q1075391', 'dum'], ['Q1115170', 'dum'],
    // Oděvní značky a firmy
    ['Q188326', 'znacka'], ['Q147662', 'znacka', { seat: 'Arteixo' }], ['Q26070', 'znacka'], ['Q136503', 'znacka'], ['Q137023', 'znacka'], ['Q127962', 'znacka'],
    ['Q309031', 'znacka'], ['Q491627', 'znacka'], ['Q332477', 'znacka'], ['Q2470307', 'znacka'],
    ['Q653941', 'znacka', { d: 'americká značka slunečních brýlí', land: 'USA', fo: '' }]
];
const DESIGN = [
    // Designéři a výrobci nábytku
    ['Q60229', 'nabytkar'], ['Q314278', 'nabytkar'], ['Q128964', 'nabytkar', { d: 'francouzský ebenista, mistr intarzovaného nábytku na dvoře Ludvíka XIV.' }],
    ['Q61130', 'designer'], ['Q89542', 'designer', { d: 'rakousko-americký designér a teoretik designu' }], ['Q164750', 'designer'],
    ['Q216141', 'designer', { d: 'americká průmyslová designérka maďarského původu, autorka keramiky' }], ['Q273511', 'designer', { d: 'finská architektka a designérka skla a nábytku' }],
    ['Q316906', 'designer', { works: [] }], ['Q435509', 'designer', { d: 'americký průmyslový designér francouzského původu' }], ['Q438129', 'designer'],
    ['Q442628', 'designer', { d: 'japonsko-americký sochař a designér nábytku a svítidel' }], ['Q456521', 'designer', { d: 'německá designérka a fotografka z Bauhausu' }],
    ['Q550411', 'designer'], ['Q700073', 'designer', { d: 'dánský designér nábytku' }], ['Q707025', 'designer', { d: 'finský designér futuristického nábytku' }],
    ['Q728087', 'designer'], ['Q1086650', 'designer'], ['Q319331', 'keramik', { d: 'anglický keramik a podnikatel, zakladatel porcelánky' }],
    // Čeští designéři a skláři
    ['Q21000417', 'designer', { cz: 1 }], ['Q2923151', 'designer', { cz: 1 }], ['Q6469715', 'designer', { cz: 1 }], ['Q78894658', 'designer', { cz: 1, d: 'česká designérka hraček z plastu a nafukovacích zvířat' }],
    ['Q15230210', 'designer', { cz: 1 }], ['Q15951742', 'designer', { cz: 1 }], ['Q12043190', 'designer', { cz: 1 }],
    ['Q3506293', 'designer', { cz: 1, d: 'český výtvarník, autor návrhů skla, tapiserií a vitráží' }], ['Q10853985', 'designer', { cz: 1, d: 'český textilní výtvarník a designér' }],
    ['Q13398640', 'sklar', { cz: 1, works: [] }], ['Q13403189', 'sklar', { cz: 1 }], ['Q21198042', 'sklar', { cz: 1 }], ['Q58875585', 'sklar', { cz: 1 }],
    ['Q12034220', 'sklar', { cz: 1, d: 'česká sklářská výtvarnice, malířka a grafička' }],
    // Ikonický nábytek a předměty
    ['Q733154', 'nabytek', { land: 'Německo' }], ['Q2629013', 'nabytek'], ['Q862980', 'nabytek'], ['Q1059232', 'nabytek'],
    ['Q1054566', 'predmet'], ['Q839679', 'predmet'], ['Q5090371', 'predmet'], ['Q23719', 'predmet'], ['Q822407', 'predmet'],
    // Značky designu, sklárny, hnutí a dílny
    ['Q54078', 'firma'], ['Q3639365', 'firma'], ['Q1241369', 'firma'], ['Q1129117', 'firma'], ['Q1658018', 'firma'],
    ['Q637767', 'firma', { cz: 1, n: 'Moser', d: 'česká sklárna v Karlových Varech, výrobce broušeného křišťálu' }],
    ['Q15249626', 'firma', { cz: 1, n: 'Lasvit', d: 'česká firma, která vyrábí skleněná svítidla a instalace' }],
    ['Q1273221', 'hnuti'], ['Q330369', 'hnuti'], ['Q1793969', 'hnuti'], ['Q9322693', 'hnuti', { cz: 1, n: 'Rondokubismus', d: 'český národní styl architektury a užitého umění 20. let 20. století' }],
    ['Q716003', 'hnuti', { cz: 1 }], ['Q241338', 'hnuti', { d: 'vídeňská dílna uměleckých řemesel založená roku 1903', fo: 'Josef Hoffmann a Koloman Moser' }]
];
const SPERKY = [
    // Koruny a korunovační klenoty
    ['Q161991', 'koruna', { cz: 1, loc: 'katedrála svatého Víta v Praze' }], ['Q51081', 'koruna', { loc: 'budova parlamentu v Budapešti' }], ['Q147883', 'koruna'], ['Q303507', 'koruna'], ['Q1358618', 'koruna'], ['Q1294341', 'koruna'],
    ['Q1524939', 'koruna'], ['Q1421284', 'koruna'],
    ['Q2716880', 'klenoty', { cz: 1 }], ['Q918264', 'klenoty'], ['Q1848668', 'klenoty'], ['Q1270166', 'klenoty'],
    // Slavné klenoty, poklady a diamanty
    ['Q331225', 'klenot'], ['Q157012', 'klenot', { loc: 'Kateřinský palác v Carském Selu (obnovená)' }], ['Q22977988', 'klenot', { cz: 1, loc: 'pražská Loreta' }],
    ['Q1636942', 'klenot', { cz: 1, loc: 'zámek Bečov nad Teplou' }],
    ['Q12057381', 'poklad', { cz: 1 }], ['Q22977955', 'poklad', { cz: 1 }], ['Q1135210', 'poklad'], ['Q21518299', 'diamant'],
    // Druhy šperků a klenotů
    ['Q46847', 'druh'], ['Q842096', 'druh'], ['Q7929', 'druh'], ['Q168456', 'druh'], ['Q189299', 'druh'], ['Q201664', 'druh'], ['Q499916', 'druh'],
    ['Q746591', 'druh'], ['Q749249', 'druh'], ['Q2111434', 'druh'], ['Q1402709', 'druh'], ['Q28512', 'druh'], ['Q617567', 'druh'], ['Q474828', 'druh'],
    ['Q397447', 'druh'], ['Q324926', 'druh'],
    // Klenotnické firmy a klenotníci
    ['Q538587', 'firma'], ['Q1066858', 'firma'], ['Q752515', 'firma'], ['Q611115', 'firma'], ['Q848553', 'firma'], ['Q658961', 'firma'],
    ['Q189762', 'zlatnik'], ['Q93705', 'klenotnik', { d: 'rakouský sklář a vynálezce stroje na broušení křišťálu, zakladatel firmy' }],
    ['Q342277', 'klenotnik'], ['Q24257177', 'sperkar', { cz: 1 }],
    // Pojmy
    ['Q429571', 'pojem'], ['Q1401905', 'pojem'], ['Q2118609', 'pojem'], ['Q211423', 'pojem'], ['Q1102226', 'pojem']
];
const PISMA = [
    // Písma (rodiny písma)
    ['Q213048', 'pismo'], ['Q504745', 'pismo'], ['Q653123', 'pismo'], ['Q868492', 'pismo'], ['Q246937', 'pismo'], ['Q2300682', 'pismo'],
    ['Q1093499', 'pismo'], ['Q16948181', 'pismo'], ['Q1122282', 'pismo'], ['Q591913', 'pismo'], ['Q651105', 'pismo'], ['Q1388048', 'pismo'],
    ['Q2560024', 'pismo'], ['Q246150', 'pismo'], ['Q11777888', 'pismo', { cz: 1, d: 'bezpatkové písmo pražského metra' }], ['Q11773646', 'pismo', { cz: 1 }],
    // Druhy písma
    ['Q148443', 'druh'], ['Q640799', 'druh'], ['Q213686', 'druh'], ['Q490332', 'druh'], ['Q1418954', 'druh'], ['Q784235', 'druh'], ['Q785729', 'druh'],
    ['Q3953117', 'druh'], ['Q582732', 'druh'], ['Q602812', 'druh'], ['Q1892715', 'druh'], ['Q344098', 'druh'], ['Q616216', 'druh'], ['Q1056421', 'druh'],
    ['Q1432616', 'druh'], ['Q2992110', 'druh'], ['Q864011', 'druh'], ['Q1570349', 'druh'],
    // Typografické pojmy a znaky
    ['Q159964', 'pojem'], ['Q17451', 'pojem'], ['Q4868296', 'pojem'], ['Q243449', 'pojem'], ['Q1139211', 'pojem'], ['Q188725', 'pojem'], ['Q1163271', 'pojem'],
    ['Q1968967', 'pojem'], ['Q518371', 'pojem'], ['Q4045635', 'pojem'], ['Q1262182', 'pojem'], ['Q2916348', 'pojem'], ['Q1334525', 'pojem'], ['Q36975', 'pojem'],
    ['Q837721', 'pojem'], ['Q582102', 'pojem'], ['Q1149547', 'pojem'], ['Q188610', 'pojem'], ['Q1075232', 'pojem', { n: 'Vdovy a sirotci' }], ['Q188546', 'pojem'], ['Q152036', 'pojem'],
    ['Q260180', 'pojem'], ['Q751800', 'pojem'], ['Q12681', 'pojem'], ['Q8185162', 'pojem'],
    ['Q11213', 'znak'], ['Q10714', 'znak'], ['Q1136371', 'znak', { d: 'typografický znak §, který označuje oddíl zákona či jiného předpisu' }], ['Q8043', 'znak'],
    ['Q187819', 'znak'], ['Q180309', 'znak'],
    // Typografové, tiskaři a grafičtí designéři
    ['Q442851', 'typograf'], ['Q455265', 'typograf'], ['Q220768', 'typograf'], ['Q123621', 'typograf'], ['Q118270', 'typograf'], ['Q60302', 'typograf'],
    ['Q455232', 'typograf'], ['Q384501', 'typograf'], ['Q383244', 'typograf'], ['Q1346563', 'typograf'], ['Q1292717', 'typograf'], ['Q11873104', 'typograf'],
    ['Q2018951', 'typograf', { cz: 1 }], ['Q1705922', 'typograf', { cz: 1 }], ['Q1445729', 'typograf', { cz: 1 }],
    ['Q231210', 'typograf', { d: 'americká návrhářka písem slovenského původu' }], ['Q441360', 'typograf'], ['Q456371', 'typograf'], ['Q331241', 'typograf'],
    ['Q361753', 'typograf', { d: 'francouzský typograf a návrhář písem' }], ['Q1353575', 'typograf', { d: 'americký typograf a návrhář písem' }],
    ['Q965340', 'tiskar'], ['Q213220', 'tiskar'], ['Q62560', 'tiskar'], ['Q380360', 'tiskar'],
    ['Q61191', 'grafik'], ['Q555389', 'grafik', { d: 'nizozemský grafický designér a typograf' }], ['Q1607882', 'grafik'], ['Q89568', 'grafik'],
    ['Q116848', 'grafik'], ['Q123409', 'grafik', { d: 'švýcarský grafický designér a typograf' }], ['Q370645', 'grafik']
];
const LISTS = { moda: MODA, design: DESIGN, sperky: SPERKY, pisma: PISMA };

// Popisy, které ve Wikidatech chybějí, nic neříkají („americká firma“, „font“) nebo nevystihují, čím je položka známá
const DESCRIPTIONS = {
    Q193136: 'italský módní dům z Milána, známý koženými kabelkami',
    Q843887: 'francouzský módní dům, původně sedlářství, známý hedvábnými šátky a kabelkami',
    Q696376: 'italský módní dům se znakem hlavy Medúzy',
    Q214480: 'italský módní dům založený dvojicí návrhářů v Miláně',
    Q759210: 'francouzský módní dům, který oblékal Audrey Hepburnovou',
    Q390107: 'britský módní dům známý trenčkoty a károvaným vzorem',
    Q659863: 'italský módní dům známý hravými a ironickými modely',
    Q948531: 'francouzský módní dům, původně výrobce dětské obuvi',
    Q1115170: 'japonský módní dům avantgardní módy z Tokia',
    Q188326: 'švédský řetězec levného oblečení, jeden z největších na světě',
    Q147662: 'španělský řetězec módních obchodů skupiny Inditex',
    Q136503: 'španělský řetězec dámské módy z Barcelony',
    Q137023: 'irský řetězec levného oblečení',
    Q332477: 'americká značka spodního prádla známá módními přehlídkami s „anděly“',
    Q2470307: 'americká značka džínů a módy z Los Angeles',
    Q288029: 'americký módní návrhář dominikánského původu',
    Q164750: 'britský designér, autor vzhledu počítačů a telefonů firmy Apple',
    Q316906: 'francouzský designér nábytku, interiérů a předmětů, autor citrusového lisu Juicy Salif',
    Q1086650: 'skotský designér, průkopník průmyslového designu 19. století',
    Q733154: 'křeslo z ocelových pásů a kůže navržené pro německý pavilon na světové výstavě v roce 1929',
    Q839679: 'dekorativní svítidlo s barevným voskem, který stoupá a klesá v tekutině',
    Q5090371: 'skleněná konvice ve tvaru přesýpacích hodin na překapávanou kávu',
    Q23719: 'kapesní nůž s mnoha nástroji v červené rukojeti se znakem kříže',
    Q3639365: 'italský výrobce kávovarů a nádobí, proslulý osmibokou konvicí na kávu',
    Q1241369: 'finská firma, výrobce nůžek s oranžovými rukojeťmi a zahradního nářadí',
    Q1129117: 'americká značka plastových dóz na potraviny prodávaných na domácích večírcích',
    Q1658018: 'finská sklárna a značka designového nádobí',
    Q330369: 'britské hnutí uměleckých řemesel z 2. poloviny 19. století, vedené Williamem Morrisem',
    Q303507: 'koruna císaře Rudolfa II. z roku 1602, později koruna rakouských císařů, uložená ve vídeňské klenotnici',
    Q1358618: 'koruna, kterou britský panovník nosí při slavnostním zahájení zasedání parlamentu',
    Q1294341: 'nejposvátnější koruna britských panovníků, používaná jen při korunovaci',
    Q1524939: 'koruna vyrobená pro korunovaci Jiřího V. indickým císařem v Dillí roku 1911',
    Q918264: 'soubor korun, žezel a dalších klenotů britských panovníků uložený v londýnském Toweru',
    Q1270166: 'koruny, žezlo a jablko dánských králů uložené na zámku Rosenborg v Kodani',
    Q331225: 'zdobená klenotnická vejce z dílny petrohradského zlatníka, velikonoční dary ruských carů',
    Q22977988: 'diamantová monstrance z roku 1699 s více než šesti tisíci diamanty, uložená v pražské Loretě',
    Q22977955: 'sbírka liturgických předmětů a klenotů v pražské Loretě',
    Q1135210: 'největší nalezený poklad anglosaského zlata a stříbra, objevený roku 2009 v Anglii',
    Q21518299: 'druhý největší diamant drahokamové kvality, nalezený roku 2015 v Botswaně',
    Q842096: 'prsten, který si vyměňují novomanželé při svatbě',
    Q7929: 'prsten, který žena dostává při zasnoubení',
    Q189299: 'šperk nošený kolem krku',
    Q746591: 'ozdobná obruč či čelenka na hlavu, odznak panovnické moci',
    Q749249: 'ozdobná polokruhová čelenka s drahokamy nošená na hlavě při slavnostních příležitostech',
    Q2111434: 'šperk zavěšený na řetízku nebo šňůrce',
    Q28512: 'šperk s reliéfem vyřezaným do vrstveného kamene nebo mušle',
    Q617567: 'ozdobné spínadlo manžety pánské košile',
    Q474828: 'šperky nošené v propíchnuté kůži, například v nose nebo pupíku',
    Q324926: 'kovová jehlice na sepnutí oděvu, známá z doby bronzové a římské',
    Q538587: 'francouzská klenotnická firma, dodavatel královských dvorů, známá i náramkovými hodinkami',
    Q611115: 'rakouská firma vyrábějící broušené křišťálové sklo a bižuterii',
    Q848553: 'francouzská klenotnická firma z pařížského náměstí Vendôme',
    Q1066858: 'americká klenotnická firma z New Yorku s typickou modrou krabičkou',
    Q189762: 'ruský zlatník a klenotník, autor velikonočních vajec pro carskou rodinu',
    Q342277: 'alsaský klenotník, vynálezce napodobenin drahokamů ze skla',
    Q429571: 'kulatý brus diamantu s 57 fazetami, při kterém kámen nejvíc září',
    Q1401905: 'podíl drahého kovu ve slitině, udávaný v tisícinách nebo karátech',
    Q2118609: 'úřední zkoušení a označování ryzosti předmětů z drahých kovů značkou',
    Q213048: 'patkové písmo navržené pro londýnský deník The Times v roce 1931',
    Q653123: 'bezpatkové písmo dodávané s Windows jako náhrada Helveticy',
    Q868492: 'neformální písmo od Microsoftu napodobující písmo komiksových bublin',
    Q246937: 'bezpatkové písmo, výchozí písmo kancelářského balíku Microsoft Office v letech 2007–2023',
    Q2300682: 'patkové písmo firmy Microsoft určené pro čtení na obrazovce i v tisku',
    Q1093499: 'patkové písmo Hermanna Zapfa inspirované italskou renesancí',
    Q16948181: 'rodina písem od Googlu, která má pokrýt všechna písma světa',
    Q651105: 'písmo pro strojové čtení textu, používané například v pasech',
    Q2560024: 'bezpatkové systémové písmo počítačů Apple Macintosh',
    Q246150: 'secesní ozdobné písmo z roku 1904',
    Q602812: 'bezpatkové písmo s tahy stejné tloušťky z 19. a 20. století',
    Q1892715: 'tiskové písmo se silnými hranatými patkami',
    Q1056421: 'německé psací písmo užívané ve školách v první polovině 20. století',
    Q1432616: 'tradiční písmo, kterým se tiskly texty v irštině a skotské gaelštině',
    Q1968967: 'vzdálenost mezi sousedními řádky textu',
    Q518371: 'část písmene, která přesahuje nad výšku malých písmen, jako u b, d nebo h',
    Q4045635: 'část písmene, která sahá pod účaří, jako u g, p nebo y',
    Q2916348: 'výška malých písmen bez dotahů, měřená podle písmene x',
    Q36975: 'konkrétní grafická podoba znaku v písmu',
    Q1149547: 'sazba textu promítáním znaků na světlocitlivý materiál',
    Q8043: 'interpunkční znaménka, která ohraničují přímou řeč nebo citaci',
    Q187819: 'delší vodorovná čárka, která odděluje vsuvky a části věty',
    Q180309: 'krátká vodorovná čárka spojující části slov, například ve slově česko-slovenský',
    Q10714: 'znak @ používaný v e-mailových adresách',
    Q123621: 'švýcarský typograf, autor písma Univers a písma pro letiště Charlese de Gaulla',
    Q118270: 'švýcarský typograf, autor nejznámějšího bezpatkového písma 20. století',
    Q60302: 'německý typograf, autor písem Palatino a Optima',
    Q1292717: 'britský typograf a kaligraf, autor písma londýnského metra',
    Q11873104: 'švýcarský typograf a majitel písmolijny, spoluautor písma Helvetica',
    Q2018951: 'český typograf a kaligraf, autor mnoha tiskových písem',
    Q1705922: 'český typograf, autor písem pro knižní sazbu'
};

// Druh v otázce (štítek) podle druhu ze seznamu; osoby podle pohlaví
const PERSON_KINDS = {
    navrhar: ['módní návrhář', 'módní návrhářka'], obuv: ['návrhář obuvi', 'návrhářka obuvi'], kostym: ['kostýmní návrhář', 'kostýmní návrhářka'],
    designer: ['designér', 'designérka'], sklar: ['sklářský výtvarník', 'sklářská výtvarnice'], nabytkar: ['výrobce nábytku', 'výrobkyně nábytku'],
    keramik: ['keramik', 'keramička'], klenotnik: ['klenotník', 'klenotnice'], zlatnik: ['zlatník', 'zlatnice'], sperkar: ['šperkař', 'šperkařka'],
    typograf: ['typograf', 'typografka'], tiskar: ['tiskař', 'tiskařka'], grafik: ['grafický designér', 'grafická designérka']
};
const THING_KINDS = {
    moda: { dum: 'módní dům', znacka: 'oděvní značka' },
    design: { nabytek: 'nábytek', predmet: 'designový předmět', firma: 'značka designu', hnuti: 'designové hnutí či sdružení' },
    sperky: { koruna: 'koruna', klenoty: 'korunovační klenoty', klenot: 'klenot', poklad: 'poklad', diamant: 'diamant', druh: 'druh šperku', firma: 'klenotnická firma', pojem: 'klenotnický pojem' },
    pisma: { pismo: 'písmo', druh: 'druh písma', pojem: 'typografický pojem', znak: 'typografický znak' }
};
// Věci bez obrázku: firmy a značky (fotka ukazuje vývěsní štít či logo s názvem), pojmy (schéma, ne věc)
const NO_IMAGE_KINDS = new Set(['dum', 'znacka', 'firma', 'hnuti', 'pojem', 'znak']);
// Obrázky, které se nepoužijí: vzorník, na kterém je velký název písma (Fraktur, Antiqua, Unziale, Rodina písma Helvetica – ručně
// prohlédnuté; vzorníky s názvem jen v záhlaví zakrývá scripts/photo-masks-manual.json), stejný obrázek jako u jiné položky
// (Textura – Gotické písmo) a TIFF, který prohlížeč neukáže (Noto)
const NAME_ON_IMAGE = new Set(['Q640799', 'Q148443', 'Q1418954', 'Q1432616', 'Q1570349', 'Q582732', 'Q784235', 'Q504745', 'Q602812', 'Q864011',
    'Q1056421', 'Q490332', 'Q16948181']);
const FEMALE = 'Q6581072';
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585']);
// Země z popisu (nationality.mjs) v podobě, jakou používá téma (USA, Spojené království…)
const LAND_LABELS = { 'Spojené státy americké': 'USA', 'Nizozemské království': 'Nizozemsko', 'Dánské království': 'Dánsko', 'Hamburk': 'Německo',
    'Království Velké Británie': 'Spojené království', 'Francouzské království': 'Francie', 'Československá republika': 'Československo', 'nacistické Německo': 'Německo' };
const landLabel = (land) => LAND_LABELS[land] || land;
// Díla osoby, která do nápovědy nepatří: škola, kde učila, orchestr, nadace, muzeum
const NOT_WORK = /univerzit|universit|orchestr|škola|school|akademi|academy|muzeum|museum|institut|vysoká|college|nadace|foundation|společnost/iu;

const ALL = EXTRA_CATEGORIES.flatMap(category => LISTS[category].map(([q, kind, extra = {}]) => ({ q, kind, extra, category })));
export const EXTRA_IDS = new Set(ALL.map(entry => entry.q));
const ALL_IDS = [...EXTRA_IDS];

// --- Wikidata (query.wikidata.org; QLever bývá přetížený) ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1, sl: 1, born: 1, died: 1, sex: 1, inc: 1, pub: 1 };
const BRANCHES = [
    `{ ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }`,
    `{ ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }`,
    `{ ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }`,
    `{ ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }`,
    `{ ?item wdt:P18 ?v BIND("im" AS ?p) }`,
    `{ ?item wdt:P569 ?v BIND("born" AS ?p) }`,
    `{ ?item wdt:P570 ?v BIND("died" AS ?p) }`,
    `{ ?item wdt:P21 ?v BIND("sex" AS ?p) }`,
    `{ ?item wdt:P27 ?v BIND("cit" AS ?p) }`,
    `{ ?item wdt:P571 ?v BIND("inc" AS ?p) }`,
    `{ ?item wdt:P577 ?v BIND("pub" AS ?p) }`,
    `{ ?item wdt:P287|wdt:P170 ?v BIND("by" AS ?p) }`,
    `{ ?item wdt:P112 ?v BIND("fo" AS ?p) }`,
    `{ ?item wdt:P17|wdt:P495 ?v BIND("land" AS ?p) }`,
    `{ ?item wdt:P159 ?v BIND("seat" AS ?p) }`,
    `{ ?item wdt:P276|wdt:P195 ?v BIND("loc" AS ?p) }`,
    `{ ?item wdt:P108 ?v BIND("emp" AS ?p) }`,
    `{ ?item wdt:P800 ?v BIND("works" AS ?p) }`
];
const fetchDetails = () => cached(`umeni-rozsireni-details-${ALL_IDS.length}`, async () => {
    const result = new Map(ALL_IDS.map(qid => [qid, {}]));
    await inBatches(ALL_IDS, 50, (qids) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(qids)} } ${BRANCHES.join(' UNION ')} }`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = key === 'sl' ? Number(v) : v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    });
    // Díla osob opačným směrem: co navrhli, vytvořili nebo založili (písma, nábytek, módní domy) – s jazykovými verzemi pro pořadí
    const people = ALL.filter(entry => PERSON_KINDS[entry.kind]).map(entry => entry.q);
    const made = {};
    await inBatches(people, 50, (qids) => `SELECT ?who ?w ?sl ?l WHERE { VALUES ?who { ${values(qids)} } ?w wdt:P287|wdt:P170|wdt:P112 ?who .
      ?w wikibase:sitelinks ?sl . ?w rdfs:label ?l FILTER(LANG(?l) = "cs") }`, (row) => {
        const who = id(row.who.value);
        made[who] = [...(made[who] || []), [id(row.w.value), Number(row.sl.value), row.l.value]];
    });
    const referenced = [...new Set([...result.values()].flatMap(entry => ['cit', 'by', 'fo', 'land', 'seat', 'loc', 'emp', 'works'].flatMap(key => entry[key] || [])))]
        .filter(qid => /^Q\d+$/.test(qid));
    const labels = {};
    await inBatches(referenced, 250, (qids) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
        (row) => { labels[id(row.item.value)] = row.l.value; });
    return { details: [...result], made, labels };
});

// Q-id všech položek jiných témat (stejná položka nemá být ve dvou tématech)
const otherTopicIds = () => {
    const ids = new Map();
    const dir = new URL('../../data/', import.meta.url);
    const topics = readdirSync(new URL('../../topics/', import.meta.url)).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
    for (const topic of topics) {
        if (topic === 'umeni') continue;
        let data;
        try { data = JSON.parse(readFileSync(new URL(`${topic}.json`, dir), 'utf8')); } catch { continue; }
        for (const item of data.items || []) if (item.q) ids.set(item.q, topic);
    }
    return ids;
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const plainName = (detail) => capitalize((detail.n || detail.t || '').replace(/ \(.*\)$/, ''));
const THIS_YEAR = new Date().getFullYear();
const landOfPerson = (detail, cs) => {
    return landLabel(landByDescription(detail.d, (detail.cit || []).map(cs).filter(Boolean)));
};

// Sestaví nové položky (bez úrovní) nad dosavadními položkami tématu (existing): vynechá ID a názvy, které téma už má, a položky jiných témat
export const buildExtra = async ({ existing }) => {
    const { details: detailRows, made, labels } = await fetchDetails();
    const details = new Map(detailRows);
    const cs = (qid) => labels[qid];
    const other = otherTopicIds();
    const base = existing.filter(item => !isExtraItem(item));
    const haveIds = new Set(base.map(item => item.q));
    const names = new Set(base.map(item => item.n.toLowerCase()));
    const skipped = { other: [], have: [], missing: [], name: [] };
    const items = [];
    for (const { q, kind, extra, category } of ALL) {
        const detail = details.get(q) || {};
        if (other.has(q)) { skipped.other.push(`${detail.t || q} (${other.get(q)})`); continue; }
        if (haveIds.has(q)) { skipped.have.push(detail.t || q); continue; }
        if (!detail.t) { skipped.missing.push(q); continue; }
        const person = Boolean(PERSON_KINDS[kind]);
        const female = detail.sex === FEMALE;
        let n = extra.n || plainName(detail);
        if (names.has(n.toLowerCase()) && /\(/.test(detail.t)) n = capitalize(detail.t);
        if (names.has(n.toLowerCase())) { skipped.name.push(n); continue; }
        const image = extra.noImage || NO_IMAGE_KINDS.has(kind) || NAME_ON_IMAGE.has(q) ? {} : imageFields(detail.im);
        let item;
        if (person) {
            const born = yearOf(detail.born);
            let died = yearOf(detail.died);
            if (born === undefined) { skipped.missing.push(`${detail.t} (bez roku narození)`); continue; }
            if (died !== undefined && (died <= born || died - born > 105 || died > THIS_YEAR)) died = undefined;
            const isCzech = Boolean(extra.cz) || (detail.cit || []).some(qid => CZECH_STATES.has(qid));
            // Díla: módní domy, kde pracoval(a) a které založil(a); navržená písma, nábytek a předměty (nejznámější napřed, bez vlastního jména)
            const own = (made[q] || []).sort((a, b) => b[1] - a[1]).map(([, , label]) => label);
            const listed = [...(category === 'moda' ? (detail.emp || []) : []), ...(detail.works || [])].map(cs);
            // (bez variant téhož díla: Lavička Václava Havla, Lavička Václava Havla, Plzeň)
            const works = [];
            for (const raw of [...own, ...listed]) {
                // Názvy výrobků Applu se v českých štítcích Wikidat píšou s velkým I (IPod)
                const label = raw && /^I(Pod|Phone|Mac|Pad)/u.test(raw) ? `i${raw.slice(1)}` : raw;
                if (!label || label.length > 40 || /^Q\d+$/.test(label) || NOT_WORK.test(label) || label.toLocaleLowerCase('cs').includes(n.split(' ').pop().toLocaleLowerCase('cs'))) continue;
                if (works.some(other => label.startsWith(other) || other.startsWith(label))) continue;
                works.push(label);
            }
            item = {
                q, t: detail.t, n, c: category, k: 0, ty: PERSON_KINDS[kind][female ? 1 : 0], d: extra.d || DESCRIPTIONS[q] || detail.d, sx: female ? 'f' : undefined,
                cz: isCzech ? 1 : undefined, ...image,
                f: compact({ born, died, land: extra.land || landOfPerson(detail, cs) || (isCzech ? 'Česko' : undefined), works: (extra.works || works).slice(0, 3), y: born + 35 })
            };
        } else {
            const year = extra.year ?? [detail.inc, detail.pub].map(yearOf).find(value => value !== undefined && value <= THIS_YEAR);
            const by = extra.by || (detail.by || []).map(cs).filter(Boolean).slice(0, 2).join(' a ') || undefined;
            const founder = extra.fo ?? ((detail.fo || []).map(cs).filter(Boolean).slice(0, 2).join(' a ') || undefined);
            const lands = [...new Set((detail.land || []).map(cs).filter(Boolean).map(landLabel))];
            const concept = ['druh', 'pojem', 'znak'].includes(kind);
            const seat = extra.seat || (detail.seat || []).map(cs).filter(Boolean).find(text => !lands.includes(text));
            item = {
                q, t: detail.t, n, c: category, k: 0, ty: THING_KINDS[category][kind], d: extra.d || DESCRIPTIONS[q] || detail.d, cz: extra.cz ? 1 : undefined, ...image,
                f: compact({
                    year: ['druh', 'pojem', 'znak'].includes(kind) ? undefined : year,
                    by: ['pismo', 'nabytek', 'predmet', 'klenot'].includes(kind) ? by : undefined,
                    // (zakladatel stejného jména jako firma – Louis Vuitton – nic neřekne)
                    fo: ['dum', 'znacka', 'firma', 'hnuti'].includes(kind) && founder !== n ? founder || undefined : undefined,
                    land: concept ? undefined : extra.land || (lands.length === 1 ? lands[0] : undefined),
                    seat: ['dum', 'znacka', 'firma'].includes(kind) ? seat : undefined,
                    loc: ['koruna', 'klenoty', 'klenot', 'diamant'].includes(kind) ? extra.loc || (detail.loc || []).map(cs).filter(text => text && text.length <= 50)[0] : undefined,
                    y: ['druh', 'pojem', 'znak'].includes(kind) ? undefined : year
                })
            };
        }
        names.add(n.toLowerCase());
        haveIds.add(q);
        items.push(compact({ ...item, _: { sl: detail.sl || 0, title: detail.t, group: groupOf(category, kind) } }));
    }
    return { items, skipped };
};

// Skupina, ve které se úrovně a nesprávné možnosti porovnávají: lidé, značky a firmy, věci, druhy a pojmy
const groupOf = (category, kind) => PERSON_KINDS[kind] ? 'osoba'
    : ['dum', 'znacka', 'firma'].includes(kind) ? 'firma'
        : kind === 'hnuti' ? 'hnuti'
            : ['druh', 'pojem', 'znak'].includes(kind) ? 'pojem' : 'vec';

// Položka rozšíření z dřívějšího běhu: nové sestavení ji nahradí (stejné id)
export const isExtraItem = (item) => EXTRA_CATEGORIES.includes(item.c);

// --- Okruhy rozšíření (na konci seznamu okruhů) ---
const kindIs = (category, ...kinds) => (item) => item.c === category && kinds.includes(item.ty);
const PERSON_TY = new Set(Object.values(PERSON_KINDS).flat());
const personIn = (category) => (item) => item.c === category && PERSON_TY.has(item.ty);
export const EXTRA_COLLECTIONS = [
    { id: 'modni-navrhari', label: 'Módní návrháři', text: 'Chanel, Dior, Lagerfeld, Armani, Versace…', sort: { by: 'y' }, test: personIn('moda') },
    { id: 'modni-domy', label: 'Módní domy a značky', text: 'Gucci, Louis Vuitton, Prada, Hermès, H&M…', sort: { by: 'name' }, test: kindIs('moda', 'módní dům', 'oděvní značka') },
    { id: 'designeri', label: 'Designéři', text: 'Thonet, Starck, Ive, Eileen Grayová, Šípek…', sort: { by: 'y' }, test: personIn('design') },
    { id: 'ikony-designu', label: 'Ikony designu', text: 'Křeslo Barcelona, moka konvice, IKEA, Memphis…', sort: { by: 'name' },
        test: item => item.c === 'design' && !PERSON_TY.has(item.ty) },
    { id: 'cesky-design', label: 'Český design a sklo', text: 'Moser, Artěl, rondokubismus, Libenský, Šípek…', sort: { by: 'y' }, test: item => item.c === 'design' && item.cz === 1 },
    { id: 'korunovacni-klenoty', label: 'Koruny a klenoty', text: 'Svatováclavská koruna, britské korunovační klenoty, Fabergého vejce…', sort: { by: 'name' },
        test: kindIs('sperky', 'koruna', 'korunovační klenoty', 'klenot', 'poklad', 'diamant') },
    { id: 'druhy-sperku', label: 'Druhy šperků', text: 'Prsten, náhrdelník, brož, diadém, kamej…', sort: { by: 'name' }, test: kindIs('sperky', 'druh šperku', 'klenotnický pojem') },
    { id: 'klenotnici', label: 'Klenotníci a značky šperků', text: 'Cartier, Tiffany, Swarovski, Fabergé…', sort: { by: 'name' },
        test: item => item.c === 'sperky' && (item.ty === 'klenotnická firma' || PERSON_TY.has(item.ty)) },
    { id: 'slavna-pisma', label: 'Slavná písma', text: 'Helvetica, Times New Roman, Arial, Comic Sans…', sort: { by: 'name' }, test: kindIs('pisma', 'písmo') },
    { id: 'druhy-pisma', label: 'Druhy písma', text: 'Antikva, fraktura, unciála, kurziva…', sort: { by: 'name' }, test: kindIs('pisma', 'druh písma') },
    { id: 'typograficke-pojmy', label: 'Typografické pojmy a znaky', text: 'Patka, kerning, ligatura, ampersand, zavináč…', sort: { by: 'name' },
        test: kindIs('pisma', 'typografický pojem', 'typografický znak') },
    { id: 'typografove', label: 'Typografové', text: 'Garamond, Bodoni, Frutiger, Zapf, Menhart…', sort: { by: 'y' }, test: personIn('pisma') }
];

// --- Úrovně (scripts/lib/umeni-levels.mjs, stejně jako u fotografů a ilustrátorů) ---
// Skupiny kategorie: lidé a věci zvlášť, české zvlášť (podíl známých se počítá v každé skupině)
// Minimální sláva známé položky 80: tolik má nejméně slavný známý fotograf či ilustrátor tématu (Shirin Neshatová, Milo Manara)
const LEVELS = {
    moda: { known: 0.25, czechKnown: 0.3, minKnown: 80, expert: 0.25, czechExpert: 0.15 },
    design: { known: 0.25, czechKnown: 0.3, minKnown: 80, expert: 0.25, czechExpert: 0.15 },
    sperky: { known: 0.25, czechKnown: 0.3, minKnown: 80, expert: 0.25, czechExpert: 0.15 },
    pisma: { known: 0.25, czechKnown: 0.3, minKnown: 80, expert: 0.25, czechExpert: 0.15 }
};
export const extraLevels = async (fresh) => {
    const pageviews = await pageviewsByTitle('umeni-rozsireni-pageviews', fresh.map(item => item._.title));
    for (const item of fresh) {
        item._.pv = pageviews[item._.title];
        item._.fame = fameOf({ pv: item._.pv, sl: item._.sl, cz: item.cz });
    }
    const groups = EXTRA_COLLECTIONS.map(collection => ({ id: collection.id, members: fresh.filter(item => collection.test(item)) })).filter(group => group.members.length);
    return assignLevels(fresh, { categories: LEVELS, groups, stratumOf: item => `${item.cz ? 'cz' : 'svet'}|${item._.group}` });
};

// Sloučí rozšíření do dat tématu: dosavadní položky beze změny, nové položky na konec, okruhy na konec seznamu. České nové položky
// patří i do okruhu České umění. Položky rozšíření z dřívějšího běhu nahradí nové sestavení (stejné id); ty, které nový běh nenašel,
// zůstanou (žádné id nezmizí)
export const mergeExtra = async ({ collections, items }, extra) => {
    const fresh = extra.items;
    const freshIds = new Set(fresh.map(item => item.q));
    const kept = items.filter(item => !(isExtraItem(item) && freshIds.has(item.q)));
    const promoted = await extraLevels(fresh);
    const czech = collections.some(collection => collection.id === 'ceske-umeni');
    for (const item of fresh) {
        item.g = [...(czech && item.cz ? ['ceske-umeni'] : []), ...EXTRA_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id)];
        delete item._;
        if (!item.g.length) delete item.g;
    }
    const stale = items.filter(item => isExtraItem(item) && !freshIds.has(item.q));
    if (stale.length) console.warn(`  rozšíření: ${stale.length} dřívějších položek nový běh nenašel, zůstávají (${stale.slice(0, 5).map(item => item.n).join(', ')}…)`);
    const ids = new Set(EXTRA_COLLECTIONS.map(collection => collection.id));
    return {
        collections: [...collections.filter(collection => !ids.has(collection.id)), ...EXTRA_COLLECTIONS.map(({ test, ...collection }) => collection)],
        items: [...kept, ...fresh],
        promoted
    };
};

// Přehled pro výpis: počty a úrovně v nových kategoriích a okruzích, vynechané položky
export const extraSummary = (items, skipped) => {
    for (const category of EXTRA_CATEGORIES) console.log(levelSummary(category, items.filter(item => item.c === category)));
    for (const collection of EXTRA_COLLECTIONS) console.log(`  ${levelSummary(`okruh ${collection.id}`, items.filter(item => (item.g || []).includes(collection.id)))}`);
    if (skipped) {
        if (skipped.other.length) console.log(`  vynecháno, už je v jiném tématu: ${skipped.other.join(', ')}`);
        if (skipped.have.length) console.log(`  vynecháno, Umění už má: ${skipped.have.join(', ')}`);
        if (skipped.missing.length) console.log(`  vynecháno, chybí článek nebo údaje: ${skipped.missing.join(', ')}`);
        if (skipped.name.length) console.log(`  vynecháno, název už téma má: ${skipped.name.join(', ')}`);
    }
};
