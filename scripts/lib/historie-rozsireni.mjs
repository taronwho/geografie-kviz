// Historie – rozšíření tématu: kategorie Archeologie a starověk, Piráti, Mezinárodní organizace a Lidové tradice, svátky a kroje,
// objevitelé a mořeplavci jako okruh osobností s faktem „Cesty a objevy“ (a slavní objevitelé, kteří v datech chyběli).
//
// Existující položky zůstanou beze změny id, kategorie i úrovně; přidávají se nové položky, okruhy a u objevitelů fakt f.exp.
// Volá se na konci scripts/build-historie.mjs i samostatně nad hotovými daty: node scripts/build-historie.mjs --doplnit
// (s BUILD_CACHE=složka podruhé bez stahování).
//
// Kandidáti jsou ručně vybraná Q-id (nejznámější naleziště, nálezy, písma, pravěká období a kultury, národy starověku, archeologové,
// piráti, organizace a aliance, svátky, zvyky, kroje a tance). Vyřazené: Q-id, která už má jiné téma (data/<téma>.json) nebo Historie,
// památky UNESCO (P1435 = Q9259; ty mají Zeměpis a Architektura), stavby a fiktivní postavy (pirát Jack Sparrow patří k filmu).
// Údaje z Wikidat (název, popis, fotka, roky, místo nálezu, sídlo, zkratky); dny svátků ručně.
//
// Známost: návštěvnost článku na české Wikipedii za rok 2025 a jazykové verze (scripts/lib/fame-levels.mjs assignLevels): známé jsou
// nejznámější položky kategorie (KNOWN_SHARE), ale jen s návštěvností aspoň KNOWN_MIN_VIEWS (opravdu známé, ne jen první v pořadí);
// v okruzích aspoň čtvrtina známých z horní poloviny kategorie. Pro experty nejméně známá třetina kategorie.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { sparql, id, values, imageFields, yearOf, compact, cached, inBatches, parsePoint } from './wikidata.mjs';
import { landByDescription } from './nationality.mjs';
import { topicPageviews, assignLevels, levelSummary } from './fame-levels.mjs';

const require = createRequire(import.meta.url);

export const NEW_CATEGORIES = ['archeologie', 'pirati', 'organizace', 'tradice'];

// --- Kandidáti: [Q-id, druh] (u tradic ještě kdy se slaví a příznak českých tradic) ---
// Archeologie a starověk – druhy: nalez (nález, artefakt, nápis), naleziste, pismo, obdobi (pravěká období), kultura (archeologické
// kultury a civilizace), narod (národy a kmeny starověku a stěhování národů), pojem, archeolog
const ARCHEOLOGIE = [
    ['Q368138', 'nalez'], ['Q93304', 'nalez'], ['Q145780', 'nalez'], ['Q215852', 'nalez'], ['Q454667', 'nalez'], ['Q643309', 'nalez'],
    ['Q180012', 'nalez'], ['Q622770', 'nalez'], ['Q310301', 'nalez'], ['Q318813', 'nalez'], ['Q245388', 'nalez'], ['Q157094', 'nalez'],
    ['Q465338', 'nalez'], ['Q405008', 'nalez'], ['Q724954', 'nalez'], ['Q754378', 'nalez'], ['Q308855', 'nalez'], ['Q235502', 'nalez'],
    ['Q762810', 'nalez'], ['Q192993', 'nalez'], ['Q1418632', 'nalez'], ['Q1054563', 'nalez'],
    ['Q503256', 'naleziste'], ['Q866393', 'naleziste'], ['Q12042817', 'naleziste'], ['Q4443275', 'naleziste'], ['Q1430970', 'naleziste'],
    ['Q12033430', 'naleziste'], ['Q650053', 'naleziste'], ['Q543155', 'naleziste'], ['Q835966', 'naleziste'], ['Q564771', 'naleziste'],
    ['Q848509', 'naleziste'], ['Q309282', 'naleziste'], ['Q1243528', 'naleziste'], ['Q7272782', 'naleziste'], ['Q856544', 'naleziste'],
    ['Q12046031', 'naleziste'], ['Q1001379', 'naleziste'], ['Q12056190', 'naleziste'],
    ['Q401', 'pismo'], ['Q30972', 'pismo'], ['Q190102', 'pismo'], ['Q209764', 'pismo'], ['Q132659', 'pismo'], ['Q82996', 'pismo'],
    ['Q211248', 'pismo'], ['Q26752', 'pismo'], ['Q332652', 'pismo'],
    ['Q40203', 'obdobi'], ['Q44155', 'obdobi'], ['Q36422', 'obdobi'], ['Q11761', 'obdobi'], ['Q11764', 'obdobi'], ['Q11759', 'obdobi'],
    ['Q130253', 'obdobi'], ['Q202165', 'kultura'],
    ['Q806348', 'kultura'], ['Q1932196', 'kultura'], ['Q933996', 'kultura'], ['Q773818', 'kultura'], ['Q1309143', 'kultura'], ['Q611017', 'kultura'],
    ['Q208247', 'kultura'], ['Q756905', 'kultura'], ['Q221901', 'kultura'], ['Q693549', 'kultura'], ['Q259118', 'kultura'], ['Q210774', 'kultura'],
    ['Q134178', 'kultura'], ['Q181264', 'kultura'], ['Q42534', 'kultura'], ['Q478805', 'kultura'], ['Q470867', 'kultura'], ['Q223998', 'kultura'],
    ['Q875115', 'kultura'], ['Q917982', 'kultura'], ['Q135364', 'kultura'],
    ['Q17161', 'narod'], ['Q35966', 'narod'], ['Q157676', 'narod'], ['Q209851', 'narod'], ['Q308885', 'narod'], ['Q35355', 'kultura'],
    ['Q5406', 'narod'], ['Q1048468', 'narod'], ['Q144964', 'narod'], ['Q212853', 'narod'], ['Q220594', 'narod'], ['Q45914', 'narod'],
    ['Q12542', 'narod'], ['Q22633', 'narod'], ['Q40477', 'narod'], ['Q12567', 'narod'], ['Q45813', 'narod'], ['Q68962', 'narod'],
    ['Q42193', 'narod'], ['Q42211', 'narod'], ['Q130900', 'narod'], ['Q131802', 'narod'], ['Q193776', 'narod'],
    ['Q164240', 'pojem'], ['Q193475', 'pojem'], ['Q34023', 'pojem'], ['Q192601', 'pojem'], ['Q744099', 'pojem'], ['Q321053', 'pojem'],
    ['Q479448', 'pojem'], ['Q43616', 'pojem'], ['Q1570005', 'pojem'], ['Q173412', 'pojem'], ['Q23498', 'pojem'], ['Q145903', 'pojem'],
    ['Q755017', 'pojem'], ['Q180548', 'pojem'],
    ['Q133682', 'archeolog'], ['Q57106', 'archeolog'], ['Q188929', 'archeolog'], ['Q356134', 'archeolog'], ['Q260', 'archeolog'],
    ['Q311931', 'archeolog'], ['Q1063371', 'archeolog'], ['Q14837', 'archeolog'], ['Q231111', 'archeolog'], ['Q275013', 'archeolog'],
    ['Q140575', 'archeolog'], ['Q733878', 'archeolog'], ['Q838659', 'archeolog'], ['Q726314', 'archeolog'], ['Q728706', 'archeolog'],
    ['Q1101554', 'archeolog'], ['Q1938506', 'archeolog'], ['Q2375202', 'archeolog'], ['Q705285', 'archeolog'], ['Q942525', 'archeolog'],
    ['Q63224', 'archeolog'], ['Q311850', 'archeolog'], ['Q57280', 'archeolog'], ['Q158765', 'archeolog'], ['Q920340', 'archeolog']
];
// Piráti – skuteční piráti, korzáři a bukanýři (pirat) a pojmy pirátství (pojem); fiktivní piráti patří k filmu a literatuře
const PIRATI = [
    ['Q213518', 'pirat'], ['Q231549', 'pirat'], ['Q215502', 'pirat'], ['Q266715', 'pirat'], ['Q234421', 'pirat'], ['Q312905', 'pirat'],
    ['Q574014', 'pirat'], ['Q26558', 'pirat'], ['Q456882', 'pirat'], ['Q313430', 'pirat'], ['Q262705', 'pirat'], ['Q315490', 'pirat'],
    ['Q333388', 'pirat'], ['Q439123', 'pirat'], ['Q318344', 'pirat'], ['Q352478', 'pirat'], ['Q444908', 'pirat'], ['Q542786', 'pirat'],
    ['Q6473', 'pirat'], ['Q454672', 'pirat'], ['Q542796', 'pirat'], ['Q739652', 'pirat'], ['Q114206', 'pirat'], ['Q512932', 'pirat'],
    ['Q684382', 'pirat'], ['Q555329', 'pirat'], ['Q890589', 'pirat'], ['Q2989294', 'pirat'], ['Q323144', 'pirat'], ['Q6121092', 'pirat'],
    ['Q7967778', 'pirat'], ['Q434744', 'pirat'], ['Q10296396', 'pirat'], ['Q3182237', 'pirat'], ['Q119681', 'pirat'], ['Q962732', 'pirat'],
    ['Q735121', 'pirat'],
    ['Q45393', 'pojem'], ['Q182773', 'pojem'], ['Q697605', 'pojem'], ['Q850220', 'pojem'], ['Q201559', 'pojem'], ['Q214451', 'pojem'],
    ['Q18085321', 'pojem'], ['Q654347', 'pojem']
];
// Mezinárodní organizace – druhy: organizace (mezivládní), organ (orgány a instituce OSN a EU), nevladni (nevládní organizace),
// aliance (spolky, pakty a aliance v dějinách)
const ORGANIZACE = [
    ['Q1065', 'organizace'], ['Q458', 'organizace'], ['Q7184', 'organizace'], ['Q7804', 'organizace'], ['Q7164', 'organizace'], ['Q7825', 'organizace'],
    ['Q41550', 'organizace'], ['Q1764511', 'organizace'], ['Q19771', 'organizace'], ['Q243630', 'organizace'],
    ['Q7768', 'organizace'], ['Q7159', 'organizace'], ['Q7785', 'organizace'], ['Q8908', 'organizace'], ['Q244323', 'organizace'],
    ['Q166546', 'organizace'], ['Q52847', 'organizace'], ['Q161549', 'organizace'], ['Q8919', 'organizace'], ['Q8475', 'organizace'],
    ['Q40970', 'organizace'], ['Q132551', 'organizace'], ['Q82151', 'organizace'], ['Q204344', 'organizace'], ['Q376150', 'organizace'],
    ['Q125761', 'organizace'], ['Q177773', 'organizace'], ['Q201054', 'organizace'], ['Q42262', 'organizace'], ['Q83201', 'organizace'],
    ['Q42944', 'organizace'], ['Q485207', 'organizace'], ['Q170481', 'organizace'], ['Q182016', 'organizace'], ['Q161718', 'organizace'],
    ['Q842490', 'organizace'], ['Q472311', 'organizace'], ['Q229478', 'organizace'], ['Q8932', 'organizace'], ['Q674182', 'organizace'],
    ['Q171183', 'organizace'], ['Q653277', 'organizace'],
    ['Q37470', 'organ'], ['Q47423', 'organ'], ['Q7801', 'organ'], ['Q47488', 'organ'], ['Q8880', 'organ'], ['Q8889', 'organ'], ['Q8901', 'organ'],
    ['Q8886', 'organ'], ['Q8896', 'organ'], ['Q4951', 'organ'], ['Q207203', 'organ'], ['Q122880', 'organ'], ['Q219575', 'organ'],
    ['Q170075', 'organ'], ['Q192247', 'organ'], ['Q1969730', 'organ'], ['Q8268', 'organ'],
    ['Q7178', 'nevladni'], ['Q49330', 'nevladni'], ['Q42970', 'nevladni'], ['Q81307', 'nevladni'], ['Q117892', 'nevladni'], ['Q48268', 'nevladni'],
    ['Q109179', 'nevladni'], ['Q210347', 'nevladni'], ['Q174240', 'nevladni'], ['Q187052', 'nevladni'], ['Q154330', 'nevladni'], ['Q15028', 'nevladni'],
    ['Q6867', 'nevladni'], ['Q188307', 'nevladni'],
    ['Q153867', 'aliance'], ['Q177859', 'aliance'], ['Q733951', 'aliance'], ['Q239225', 'aliance'], ['Q154640', 'aliance'],
    ['Q42908', 'aliance'], ['Q208742', 'aliance'], ['Q193235', 'aliance'], ['Q623476', 'aliance'], ['Q155024', 'aliance'], ['Q527814', 'aliance'],
    ['Q43056', 'aliance'], ['Q329888', 'aliance'], ['Q152283', 'aliance'], ['Q163931', 'aliance'], ['Q183533', 'aliance'], ['Q183725', 'aliance'],
    ['Q188592', 'aliance'], ['Q159454', 'aliance'], ['Q295875', 'aliance']
];
// Lidové tradice, svátky a kroje – druhy: svatek, statni (české státní svátky), slavnost (festivaly), zvyk, postava, kroj, tanec,
// oblast (národopisné oblasti); [Q-id, druh, kdy, česká tradice]
const TRADICE = [
    ['Q19809', 'svatek', '24.–26. prosince'], ['Q106010', 'svatek', '24. prosince', 1], ['Q2703710', 'svatek', '25. prosince', 1],
    ['Q1366863', 'svatek', '26. prosince', 1], ['Q21196', 'svatek', 'březen až duben (pohyblivý svátek)'],
    ['Q209663', 'svatek', 'březen až duben (pohyblivý svátek)', 1], ['Q40317', 'svatek', 'březen až duben (pohyblivý svátek)'],
    ['Q106333', 'svatek', 'březen až duben (pohyblivý svátek)'], ['Q186206', 'svatek', 'březen až duben (pohyblivý svátek)'],
    ['Q42236', 'svatek', 'březen až duben (pohyblivý svátek)'], ['Q123542', 'svatek', 'únor až březen (pohyblivý svátek)'],
    ['Q15843011', 'svatek', 'od Tří králů do Popeleční středy', 1], ['Q285320', 'svatek', 'únor až březen (pohyblivý svátek)'],
    ['Q39864', 'svatek', 'květen až červen (pohyblivý svátek)'], ['Q1033140', 'svatek', '2. listopadu', 1], ['Q587', 'svatek', '1. listopadu'],
    ['Q760225', 'svatek', '6. prosince (nadílka večer 5. prosince)', 1], ['Q83012', 'svatek', 'čtyři neděle před 25. prosincem'],
    ['Q132001', 'svatek', '6. ledna'], ['Q18647897', 'svatek', '2. února', 1], ['Q10398273', 'svatek', 'noc z 23. na 24. června'],
    ['Q11269', 'svatek', '31. prosince'], ['Q34812', 'svatek', '1. ledna'], ['Q80949', 'svatek', '1. dubna'], ['Q47502', 'svatek', 'druhá květnová neděle'],
    ['Q134847', 'svatek', 'třetí červnová neděle'], ['Q37587', 'svatek', '14. února'], ['Q251868', 'svatek', '31. října'],
    ['Q13959', 'svatek', 'čtvrtý čtvrtek v listopadu (USA)'], ['Q47499', 'svatek', '1. května'], ['Q38964', 'svatek', '8. března'],
    ['Q37081', 'svatek', '1. června'], ['Q124473', 'svatek', '22. dubna'], ['Q152395', 'svatek', 'květen až červen (pohyblivý svátek)'],
    ['Q162691', 'svatek', '15. srpna'], ['Q51638', 'svatek', 'květen až červen (pohyblivý svátek)'], ['Q131080', 'svatek', 'březen až duben (pohyblivý svátek)'],
    ['Q10244', 'svatek', 'říjen až listopad'], ['Q10259', 'svatek', 'březen'], ['Q131772', 'svatek', 'leden až únor'],
    ['Q41662', 'svatek', 'devátý měsíc islámského kalendáře'], ['Q464458', 'svatek', 'po skončení postního měsíce'], ['Q514400', 'svatek', 'dvanáctý měsíc islámského kalendáře'],
    ['Q130881', 'svatek', 'prosinec (osm dní)'], ['Q121393', 'svatek', 'březen až duben'], ['Q132994', 'svatek', 'září až říjen'],
    ['Q131028', 'svatek', 'září až říjen'], ['Q180115', 'svatek', 'únor až březen'], ['Q182242', 'svatek', 'září až říjen'],
    ['Q483236', 'svatek', '20.–21. března'], ['Q309256', 'svatek', '1.–2. listopadu'], ['Q181817', 'svatek', '17. března'],
    ['Q86591', 'svatek', '4. července'], ['Q210150', 'svatek', 'březen až duben'], ['Q215014', 'svatek', '13.–15. dubna'], ['Q215700', 'svatek', 'květen'],
    ['Q1154888', 'svatek', 'červenec až srpen'], ['Q379519', 'svatek', 'září až říjen'], ['Q844844', 'svatek', '5. listopadu'],
    ['Q746851', 'svatek', '26. prosince – 1. ledna'], ['Q639756', 'svatek', '1. července'], ['Q502375', 'svatek', '26. ledna'],
    ['Q11156590', 'statni', '28. října', 1], ['Q15054219', 'statni', '17. listopadu', 1], ['Q2379466', 'statni', '5. července', 1],
    ['Q15054220', 'statni', '6. července', 1], ['Q11156602', 'statni', '28. září', 1], ['Q15054224', 'statni', '1. ledna', 1],
    ['Q102400', 'slavnost', 'září až říjen'], ['Q35232', 'slavnost', 'únor až březen'], ['Q25936936', 'slavnost', 'konec června', 1],
    ['Q12036139', 'slavnost', 'únor až duben', 1], ['Q57607', 'slavnost', 'advent', 1],
    ['Q200982', 'zvyk', '30. dubna', 1], ['Q73735', 'zvyk', 'jaro', 1], ['Q40270', 'zvyk', 'konec května', 1], ['Q1808937', 'zvyk', 'podzim', 1],
    ['Q608835', 'zvyk', 'konec léta', 1], ['Q807734', 'zvyk', '4. prosince', 1], ['Q20526833', 'zvyk', 'masopust', 1], ['Q194607', 'zvyk', '', 1],
    ['Q163886', 'zvyk', '', 1], ['Q252829', 'zvyk', '', 1], ['Q152862', 'zvyk', '', 1], ['Q47128', 'zvyk', '', 1], ['Q216584', 'zvyk', '', 1], ['Q503354', 'zvyk', '', 1],
    ['Q1710612', 'zvyk', '', 1], ['Q883621', 'zvyk', '', 1], ['Q954753', 'zvyk', '', 1], ['Q2555488', 'zvyk', '', 1], ['Q252670', 'zvyk', '', 1],
    ['Q270286', 'zvyk', '', 1], ['Q460653', 'zvyk'], ['Q47195', 'zvyk'], ['Q211011', 'zvyk'], ['Q882441', 'zvyk', '', 1], ['Q64407093', 'zvyk', '', 1],
    ['Q395976', 'zvyk', '', 1],
    ['Q209422', 'postava', '', 1], ['Q315796', 'postava'], ['Q814168', 'postava'],
    ['Q3172759', 'kroj'], ['Q60366260', 'kroj', '', 1], ['Q701069', 'kroj'], ['Q73603', 'kroj'], ['Q151948', 'kroj'], ['Q483444', 'kroj'], ['Q172827', 'kroj'],
    ['Q40265', 'tanec', '', 1], ['Q153071', 'tanec', '', 1], ['Q151942', 'tanec'], ['Q1432836', 'tanec', '', 1], ['Q7078447', 'tanec', '', 1],
    ['Q725991', 'tanec'],
    ['Q11726147', 'oblast', '', 1], ['Q105459', 'oblast', '', 1], ['Q1575707', 'oblast', '', 1], ['Q1957265', 'oblast', '', 1],
    ['Q5907114', 'oblast', '', 1], ['Q12045910', 'oblast', '', 1], ['Q8546837', 'oblast', '', 1]
];

// Česká naleziště a kultury pojmenované podle českých nalezišť (popis z Wikidat to neříká: „hradiště v okrese Kladno“)
const CZECH_ARCHEOLOGY = new Set(['Q12042817', 'Q4443275', 'Q1430970', 'Q12033430', 'Q1243528', 'Q12046031', 'Q1001379', 'Q12056190', 'Q773818', 'Q1309143']);

// Objevitelé a mořeplavci: fakt „Cesty a objevy“ (f.exp) bez jména objevitele a bez míst pojmenovaných po něm. Položky, které už
// jsou mezi osobnostmi, ho dostanou navíc (id, kategorie i úroveň zůstanou); EXPLORERS_NEW přibudou do kategorie Osobnosti.
export const EXPLORERS = {
    Q7322: 'objevení Ameriky pro Evropu, plavby přes Atlantik', Q6101: 'cesta do Číny na dvůr Kublajchána', Q1496: 'první plavba kolem světa (sám ji nedokončil)',
    Q7324: 'plavby Tichým oceánem, východní pobřeží Austrálie, Havaj', Q7328: 'námořní cesta z Evropy do Indie kolem Afriky',
    Q7326: 'dobytí Aztécké říše', Q44741: 'dobytí Incké říše', Q7331: 'cesty islámským světem od Maroka po Čínu',
    Q7321: 'průzkum řeky svatého Vavřince v Kanadě', Q7333: 'námořní výpravy čínského loďstva do Indického oceánu',
    Q6694: 'vědecká výprava po Jižní Americe', Q36517: 'plavba kolem světa, boj proti španělské Armadě',
    Q47674: 'plavby k pobřeží Jižní Ameriky; po něm je pojmenován celý kontinent', Q42188: 'objevení Nového Zélandu, Tongy a Fidži',
    Q42838: 'plavba do Severní Ameriky (Vinland) kolem roku 1000', Q172345: 'osídlení Grónska',
    Q48373: 'průzkum střední a jižní Afriky, Viktoriiny vodopády', Q80732: 'první výstup na Mount Everest (1953)',
    Q33817: 'první výstup na Mount Everest (1953), cesta na jižní pól', Q102527: 'výprava na jižní pól, z níž se nevrátil',
    Q957543: 'antarktické výpravy, záchrana posádky lodi Endurance', Q127641: 'průzkum úžiny mezi Asií a Amerikou, Kamčatka',
    Q130377: 'první obeplutí mysu Dobré naděje', Q174432: 'objevení Brazílie pro Portugalsko', Q133060: 'výpravy do Arktidy, Nová země a Špicberky',
    Q42063: 'pouť z Číny do Indie pro buddhistické spisy', Q171421: 'průzkum povodí Konga, nalezení ztraceného misionáře',
    Q68529: 'založení Québecu, Nová Francie', Q204397: 'portugalské državy v Indii a Malajsku (Goa, Malakka)',
    Q182897: 'organizátor portugalských výprav podél pobřeží Afriky', Q72292: 'přechod Grónska, plavba lodi Fram do Arktidy',
    Q179167: 'hledání severní cesty do Asie, průzkum řeky u dnešního New Yorku a velkého zálivu v Kanadě',
    Q186585: 'výprava k severnímu pólu (1909)', Q201510: 'dokončení první plavby kolem světa',
    Q19080: 'první Evropan, který spatřil Tichý oceán z Ameriky', Q207901: 'první plavba po celé Amazonce',
    Q205485: 'mapování severozápadního pobřeží Severní Ameriky', Q219895: 'první obeplutí Austrálie',
    Q153911: 'francouzská plavba kolem světa', Q294478: 'výprava Tichým oceánem, která beze stopy zmizela', Q219086: 'průzkum řeky Niger',
    Q2655: 'hledání Severozápadního průjezdu, ztracená výprava', Q200564: 'nalezení severního magnetického pólu, výprava do Antarktidy',
    Q125057: 'hledání pramenů Nilu, cesta do Mekky', Q125084: 'Viktoriino jezero jako pramen Nilu',
    Q60040: 'výprava do vnitrozemí Severní Ameriky k řece Mississippi', Q185974: 'objevení Floridy',
    Q271974: 'výprava na jihozápad Severní Ameriky, Velký kaňon', Q192442: 'výpravy do střední Asie a Tibetu', Q76754: 'objevení Antarktidy (1820)',
    Q189971: 'plavba k Británii a do severních moří (Thule)', Q313492: 'výprava napříč Severní Amerikou k Tichému oceánu',
    Q210268: 'lety nad severním a jižním pólem', Q44838: 'nejstarší dochovaný glóbus', Q80288: 'výpravy do kanadské Arktidy',
    Q55807: 'výpravy do kanadské Arktidy, záliv mezi Grónskem a Kanadou', Q243375: 'objevení Velikonočního ostrova',
    Q298156: 'plavba po Mississippi až k ústí, Louisiana', Q202308: 'cesty po Osmanské říši a sousedních zemích',
    Q217915: 'mapa světa s pobřežím Ameriky (1513)', Q312978: 'pouť z Číny do Indie a na Srí Lanku', Q315149: 'cesta ke dvoru mongolského chána',
    Q316083: 'cesta ke dvoru mongolského chána', Q147676: 'průzkum východního pobřeží Severní Ameriky, záliv dnešního New Yorku',
    Q238960: 'průvodkyně a tlumočnice výpravy napříč Severní Amerikou', Q312499: 'výzkum Nové Guineje', Q319834: 'průzkum povodí Konga a Gabonu',
    Q318500: 'dobytí Filipín pro Španělsko', Q197276: 'cesty do Střední Asie, počátky Hedvábné stezky', Q296478: 'plavba podél západního pobřeží Afriky',
    Q312769: 'výpravy Arktidou od Grónska po Aljašku', Q60141: 'průzkum Sahary a západní Afriky', Q39691: 'objevení Petry a Abú Simbelu pro Evropu',
    Q160888: 'první ruská plavba kolem světa', Q294147: 'vzpoura na lodi Bounty', Q204735: 'výpravy do Tichomoří a k Antarktidě',
    Q213756: 'kapitán lodi Beagle', Q221125: 'tři plavby kolem světa, průzkum Austrálie', Q182491: 'průzkum pobřeží Kalifornie',
    Q337066: 'první portugalský místokrál Indie', Q313369: 'výpravy k pobřeží Venezuely', Q345620: 'nejstarší mapa s Amerikou',
    Q250763: 'putování napříč jihem Severní Ameriky', Q40524: 'nešťastná výprava na Floridu', Q228024: 'založení Jamestownu ve Virginii',
    Q237220: 'objevení Machu Picchu pro svět', Q180339: 'odkrytí chrámu v Abú Simbelu a hrobky Setiho I.',
    Q313061: 'výzkum Hedvábné stezky, jeskyně Mogao', Q209138: 'první stálý osadník Islandu', Q311604: 'pokusy o výstup na Mount Everest, zahynul',
    Q234491: 'první žena na vrcholu Mount Everestu', Q439046: 'výzkum oceánů a hlubokého moře',
    Q315231: 'sestup batyskafem na dno Marianského příkopu', Q210719: 'let balonem do stratosféry, batyskaf',
    // Přibudou (EXPLORERS_NEW)
    Q926: 'první na jižním pólu (1911), Severozápadní průjezd', Q85642: 'plavba k Newfoundlandu v Severní Americe (1497)',
    Q133622: 'plavba na voru Kon-Tiki přes Tichý oceán', Q83233: 'výzkum moří, akvalung, loď Calypso', Q78732: 'cesty jižní Afrikou, sbírky pro muzea',
    Q697532: 'život na Novosibiřských ostrovech v Arktidě', Q291200: 'let vzducholodí Norge přes severní pól, ztroskotání vzducholodi Italia',
    Q154759: 'výpravy do Tibetu a pouště Taklamakan', Q79107: 'výprava do Jižní Ameriky a Tichomoří', Q695730: 'výzkum Arábie, pouštní zámek Kusajr Amra',
    Q1344133: 'cesty Afrikou, Jižní Amerikou a Asií', Q976683: 'výprava k severnímu pólu (1909)', Q350190: 'sporné prvenství na severním pólu (1908)',
    Q336630: 'plavba po řece Mississippi (1673)', Q506618: 'plavba po řece Mississippi (1673)', Q57763: 'výpravy vnitrozemím Austrálie, beze stopy zmizel',
    Q548928: 'průzkum řek ve vnitrozemí Austrálie', Q560403: 'první přechod Austrálie od jihu k severu, zahynul',
    Q12026265: 'cesta kolem světa, Austrálie a Oceánie', Q348325: 'první plavba Velkým kaňonem po řece Colorado'
};
// Slavní objevitelé, kteří mezi osobnostmi chyběli: [Q-id, druh (štítek ty), český cestovatel (patří i do okruhu České dějiny)]
const EXPLORERS_NEW = [['Q926', 'polárník'], ['Q85642', 'mořeplavec'], ['Q133622', 'mořeplavec'], ['Q83233', 'oceánograf'], ['Q78732', 'cestovatel', 1],
    ['Q697532', 'polárník', 1], ['Q291200', 'polárník'], ['Q154759', 'cestovatel'], ['Q79107', 'cestovatel', 1], ['Q695730', 'cestovatel', 1],
    ['Q1344133', 'cestovatel', 1], ['Q976683', 'polárník'], ['Q350190', 'polárník'], ['Q336630', 'objevitel'], ['Q506618', 'objevitel'],
    ['Q57763', 'cestovatel'], ['Q548928', 'cestovatel'], ['Q560403', 'cestovatel'], ['Q12026265', 'cestovatel', 1], ['Q348325', 'objevitel']];

// Druh položky jako štítek otázky a nápovědy (ty)
const KIND_LABELS = {
    nalez: 'archeologický nález', naleziste: 'archeologické naleziště', pismo: 'písmo', obdobi: 'pravěké období', kultura: 'archeologická kultura',
    narod: 'národ starověku', pojem: 'archeologický pojem', archeolog: 'archeolog',
    pirat: 'pirát', piratka: 'pirátka', piratstvi: 'pirátství',
    organizace: 'mezinárodní organizace', organ: 'orgán mezinárodní organizace', nevladni: 'nevládní organizace', aliance: 'spolek nebo aliance',
    svatek: 'svátek', statni: 'český státní svátek', slavnost: 'slavnost', zvyk: 'tradice', postava: 'postava lidových tradic', kroj: 'kroj', tanec: 'lidový tanec',
    oblast: 'národopisná oblast'
};
// Archeolog: žena (archeoložka, egyptoložka); pojmy pirátství a archeologie (štítek otázky „Co je to?“)
const FEMALE = 'Q6581072';

// Ruční opravy: popisy, které chybí nebo prozradí odpověď, názvy a druhy
const D_OVERRIDES = {
    Q182773: 'pirátská vlajka s lebkou a zkříženými hnáty', Q697605: 'piráti a pašeráci, kteří plenili pobřeží Číny, Koreje a Japonska',
    Q850220: 'piráti a dobrodruzi v Karibiku 17. století', Q201559: 'soukromý námořník s povolením panovníka přepadat nepřátelské lodě',
    Q45393: 'loupežné přepadení lodí na moři', Q214451: 'přepadání lodí u pobřeží Afriky na počátku 21. století', Q654347: 'bájná osada pirátů na Madagaskaru',
    Q18085321: 'pirátská samospráva na Bahamách v 18. století', Q465338: 'hliněný disk s nerozluštěnými znaky z Kréty', Q405008: 'hliněný válec s klínopisným nápisem perského krále',
    Q724954: 'kamenná deska s nápisem moábského krále z 9. století př. n. l.', Q754378: 'staroegyptská stéla s nejstarší zmínkou o Izraeli',
    Q308855: 'úlomek staroegyptské stély s letopisy nejstarších králů', Q235502: 'hliněné tabulky s diplomatickou korespondencí faraonů',
    Q762810: 'fosilní lebka australopitéka nalezená v Jihoafrické republice', Q1418632: 'téměř celá kostra mladého hominida nalezená v Keni',
    Q192993: 'fosilie člověka vzpřímeného nalezené na Jávě', Q1054563: 'staroegyptský seznam králů vytesaný v hrobce',
    Q1243528: 'paleolitické naleziště lovců mamutů na Moravě', Q856544: 'knihovna hliněných tabulek asyrského krále v Ninive',
    Q2703710: 'křesťanský svátek narození Ježíše', Q73735: 'jarní zvyk, kdy děti nesou slaměnou figuru k vodě a hodí ji do ní', Q20526833: 'zimní průvody maskovaných mužů po vesnicích, zapsané v UNESCO',
    Q12036139: 'pouť s atrakcemi na pražském Výstavišti', Q814168: 'stařena, která v Itálii nosí dětem dárky na Tři krále',
    Q151948: 'skotská mužská sukně z kostkované látky', Q73603: 'tradiční ženský oděv z Bavorska a Rakouska', Q172827: 'tradiční ženský oděv z Indie',
    Q15843011: 'období veselí, zabíjaček a průvodů masek před postní dobou', Q64407093: 'ruční výroba krajky z nití navinutých na paličkách',
    Q395976: 'dopravování dřeva po řekách na vorech', Q211011: 'lov s vycvičenými dravými ptáky', Q1808937: 'slavnost na výročí posvěcení kostela',
    Q608835: 'slavnost na konec žní', Q40270: 'jarní průvod mladíků na koních s králem v čele', Q954753: 'dřevěný nástroj, který o Velikonocích nahrazuje zvony',
    Q883621: 'štědrovečerní věštba z tvarů roztaveného olova', Q2555488: 'ryba podávaná k české štědrovečerní večeři', Q252670: 'lidová předpověď počasí vázaná na den v roce',
    // Popisy, které chybí nebo opakují název („velikonoční svátek“, „hallowenský zvyk“, „Evropské společenství uhlí a oceli“)
    Q209663: 'pondělí, kdy chlapci chodí s pomlázkou a koledují', Q106010: 'večer 24. prosince se slavnostní večeří, stromečkem a dárky',
    Q47195: 'zvyk, kdy děti v maskách obcházejí domy a žádají sladkosti', Q701069: 'tradiční korejský oděv',
    Q152862: 'kalendář s okénky, který odpočítává dny do Štědrého dne', Q270286: 'skleněné baňky, řetězy a figurky na stromeček',
    Q460653: 'velký špalek dřeva, který se o svátcích pálí v krbu', Q1710612: 'obcházení domů se zpěvem a přáním o svátcích',
    Q210150: 'japonský zvyk obdivování kvetoucích sakur', Q215700: 'buddhistický svátek narození, osvícení a smrti Buddhy',
    Q639756: 'státní svátek Kanady', Q464458: 'islámský svátek na konci ramadánu', Q514400: 'islámský svátek na památku Abrahamovy oběti',
    Q51638: 'křesťanský svátek čtyřicet dní po Velikonocích', Q35232: 'karnevalový průvod škol samby v Brazílii',
    Q844844: 'britská noc ohňostrojů na památku spiknutí proti králi a parlamentu (1605)',
    Q7825: 'mezinárodní organizace pro pravidla světového obchodu', Q166546: 'sdružení evropských států pro volný obchod mimo celní unii EU',
    Q52847: 'předchůdce Evropské unie založený Římskými smlouvami (1957)', Q161549: 'první evropské společenství, založené Pařížskou smlouvou (1951)',
    Q8919: 'společenství založené Římskými smlouvami spolu s EHS pro mírové využití jádra', Q82151: 'agentura OSN pro boj s hladem',
    Q204344: 'agentura OSN, která dováží jídlo do oblastí hladomoru a válek', Q201054: 'agentura OSN pro bezpečnost lodní dopravy',
    Q170481: 'fórum ekonomik kolem Tichého oceánu', Q229478: 'organizace, která spravuje soustavu jednotek SI', Q674182: 'fórum států kolem severního pólu',
    Q653277: 'program spolupráce NATO se státy mimo alianci', Q192247: 'finanční instituce EU, která půjčuje na velké projekty',
    Q109179: 'celosvětová síť klubů podnikatelů a dobrovolníků', Q210347: 'zastřešující organizace junáků po celém světě',
    Q623476: 'spolek severoitalských měst proti římskoněmeckému císaři', Q155024: 'spolek protestantských knížat proti císaři Karlu V.',
    Q183533: 'informační byro komunistických stran po roce 1947', Q295875: 'obranná smlouva Austrálie, Nového Zélandu a USA',
    Q177773: 'agentura OSN pro ochranu autorských práv a patentů',
    Q315490: 'anglický mořeplavec, obchodník s otroky a admirál', Q444908: 'pirát zvaný „pirát gentleman“, bohatý plantážník z Barbadosu',
    Q542786: 'anglický pirát, později lovec pirátů', Q542796: 'francouzský bukanýr proslulý krutostí', Q684382: 'irský pirát v Indickém oceánu',
    Q434744: 'janovský pirát a hrabě Malty',
    Q368138: 'staroegyptská deska z doby sjednocení Horního a Dolního Egypta', Q215852: 'mumie muže z doby železné nalezená v dánské rašelině',
    Q454667: 'mumie muže z doby železné nalezená v anglické rašelině', Q643309: 'hliněná nádoba s měděným válcem, údajný starověký článek',
    Q180012: 'perský skalní nápis ve třech jazycích, klíč k rozluštění klínopisu', Q622770: 'staroegyptský seznam panovníků na papyru',
    Q310301: 'staroegyptský lékařský papyrus', Q318813: 'zlatý kužel z doby bronzové s kalendářními symboly',
    Q503256: 'anglosaské pohřebiště s lodí a helmou krále', Q835966: 'galské oppidum, kde Caesar porazil Vercingetoriga',
    Q26752: 'souhláskové písmo, z něhož vznikla řecká abeceda', Q332652: 'nejstarší známá abeceda z klínových znaků',
    Q208247: 'keltská kultura mladší doby železné', Q221901: 'nejstarší kultura moderních lidí v Evropě',
    Q693549: 'kultura lovců sobů na konci paleolitu, malby v jeskyních', Q917982: 'kultura skytských jezdců z Altaje',
    Q144964: 'starověký národ na Balkáně', Q131802: 'kočovný národ černomořských stepí', Q193776: 'starověký národ na pobřeží Kanaánu, nepřátelé Izraelitů',
    Q132659: 'obrázkové písmo, které rozluštil Champollion', Q11759: 'nejstarší a nejdelší období pravěku',
    Q503354: 'píseň o narození Ježíše, kterou zpívají koledníci'
};
// Další názvy, které by mátly (Halloween – „Svátek všech svatých“ je jiný svátek, jmeniny – „svátek“ je obecné slovo)
const ALIAS_DROP = new Set(['Svátek všech svatých', 'svátek', 'karneval', 'Slovanské barvy', 'Slovanka', 'Egyptoložka', 'muži Fjordů', 'vánoční',
    'Velikonoční', 'Hanzovní město', 'Rotary Club', 'Rotariáni']);
// Obrázky s nápisem, který odpověď prozradí (známka „Vynášanie Moreny“, cedule u Soudního dvora EU, loga Rotary a Arktické rady)
const IMAGE_DROP = new Set(['Q73735', 'Q4951', 'Q109179', 'Q674182',
    // Vlajka Edwarda Englanda patří k Jolly Rogeru, ne k jeho podobě
    'Q684382']);
// Kde národ, kultura, tanec nebo zvyk žil či žije (nápověda Oblast; bez názvu položky)
const AREAS = {
    Q17161: 'Itálie (Toskánsko)', Q35966: 'střední a západní Evropa', Q157676: 'Čechy a Podunají', Q209851: 'Čechy', Q308885: 'Morava a jihozápadní Slovensko',
    Q5406: 'Malá Asie (Anatolie)', Q1048468: 'pobřeží dnešního Libanonu', Q144964: 'Balkán (Bulharsko, Řecko)', Q212853: 'dnešní Rumunsko',
    Q220594: 'Arábie a Jordánsko (Petra)', Q45914: 'Yucatán a Guatemala', Q12542: 'Mexiko', Q22633: 'severní a střední Evropa',
    Q40477: 'střední, východní a jihovýchodní Evropa', Q12567: 'Skandinávie', Q45813: 'stepi střední Asie, pak Panonie', Q68962: 'Panonie (Maďarsko)',
    Q42193: 'Černomoří, pak Itálie a Španělsko', Q42211: 'severní Afrika (Kartágo)', Q130900: 'severní Itálie', Q131802: 'černomořské stepi',
    Q193776: 'pobřeží Kanaánu (Gaza)', Q478805: 'jihozápad USA', Q135364: 'pobřeží Mexického zálivu', Q35355: 'jižní Mezopotámie',
    Q134178: 'Kréta', Q181264: 'Řecko (Peloponés)', Q42534: 'údolí Indu (Pákistán)', Q917982: 'pohoří Altaj',
    Q153071: 'Čechy', Q1432836: 'Čechy', Q7078447: 'Valašsko a Slovensko', Q151942: 'Polsko', Q725991: 'Maďarsko', Q40265: 'jihovýchodní Morava',
    Q11726147: 'okolí Domažlic', Q105459: 'jihovýchodní Morava', Q1575707: 'střední Morava (Olomouc, Prostějov)', Q1957265: 'východní Morava (Beskydy)',
    Q5907114: 'Vysočina', Q12045910: 'okolí Břeclavi', Q8546837: 'jižní Čechy',
    Q18085321: 'Bahamy (Nassau)', Q654347: 'Madagaskar', Q214451: 'Adenský záliv a Indický oceán', Q697605: 'pobřeží Číny, Koreje a Japonska',
    Q850220: 'Karibik', Q73735: 'Čechy, Morava a Slovensko', Q20526833: 'východní Čechy (okolí Hlinska)', Q40270: 'jihovýchodní Morava (Vlčnov)',
    Q460653: 'Francie a Katalánsko', Q210150: 'Japonsko', Q215014: 'Thajsko', Q215700: 'jižní a jihovýchodní Asie', Q1154888: 'Japonsko',
    Q379519: 'Čína a východní Asie', Q844844: 'Spojené království', Q746851: 'Spojené státy americké', Q10244: 'Indie', Q10259: 'Indie a Nepál',
    Q309256: 'Mexiko', Q181817: 'Irsko', Q483236: 'Írán a střední Asie', Q102400: 'Mnichov', Q35232: 'Brazílie', Q814168: 'Itálie'
};
// Rok vzniku, který mají Wikidata chybně (Kýrův válec: 539 př. n. l.)
const MADE_FIX = { Q405008: -539 };
const N_OVERRIDES = { Q73735: 'Vynášení smrti', Q20526833: 'Masopustní obchůzky na Hlinecku', Q2703710: 'Boží hod vánoční', Q760225: 'Svátek svatého Mikuláše' };

// --- Pomocné ---
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const first = (detail, key) => (detail[key] || [])[0];
const fold = (text) => String(text || '').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu, '');
// Fakt, který sdílí kořen slova s názvem (Disk z Faistu – místo nálezu Faistos), by odpověď prozradil
const wordsOf = (text) => fold(text).split(/[^\p{L}]+/u).filter(word => word.length >= 4);
const sharesRoot = (text, name) => wordsOf(text).some(word => wordsOf(name).some(other => word.slice(0, 5) === other.slice(0, 5)));

// Q-id ostatních témat (data/<téma>.json, státy) a vynálezů Časových souvislostí
export const takenElsewhere = () => {
    const root = new URL('../../', import.meta.url);
    const topics = readdirSync(new URL('topics/', root)).map(file => file.replace(/\.js$/, '')).filter(topicId => topicId !== 'historie');
    const taken = new Map();
    for (const topicId of [...topics, 'vynalezy']) {
        const data = JSON.parse(readFileSync(new URL(`data/${topicId}.json`, root), 'utf8'));
        for (const item of data.items || []) taken.set(item.q, topicId);
    }
    for (const qid of Object.keys(JSON.parse(readFileSync(new URL('data/countries.json', root), 'utf8')).countries)) if (!taken.has(qid)) taken.set(qid, 'countries');
    return taken;
};

const detailsQuery = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item skos:altLabel ?v FILTER(LANG(?v) = "cs") BIND("al" AS ?p) }
  UNION { ?item wdt:P1813 ?v FILTER(LANG(?v) = "cs" || LANG(?v) = "mul" || LANG(?v) = "en") BIND("short" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P27/rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("cit" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("from" AS ?p) }
  UNION { ?item wdt:P576 ?v BIND("to" AS ?p) }
  UNION { ?item wdt:P580 ?v BIND("start" AS ?p) }
  UNION { ?item wdt:P582 ?v BIND("end" AS ?p) }
  UNION { ?item wdt:P575 ?v BIND("disc" AS ?p) }
  UNION { ?item wdt:P61/rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("finder" AS ?p) }
  UNION { ?item wdt:P189/rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("found" AS ?p) }
  UNION { ?item wdt:P276/rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("loc" AS ?p) }
  UNION { ?item wdt:P195/rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("coll" AS ?p) }
  UNION { ?item wdt:P159/rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("hq" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P1435 ?v BIND("her" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
}`;
const SINGLE = new Set(['t', 'n', 'd', 'sl', 'im', 'born', 'died', 'sex', 'from', 'to', 'start', 'end', 'disc', 'coord']);
const fetchDetails = async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, {}]));
    await inBatches(qids, 40, detailsQuery, (row) => {
        const entry = result[id(row.item.value)];
        const key = row.p.value;
        const value = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (SINGLE.has(key)) { if (!(key in entry)) entry[key] = value; } else if (!(entry[key] || []).includes(value)) entry[key] = [...(entry[key] || []), value];
    });
    return result;
};

// Rok jen tehdy, když dává smysl (ne budoucnost, ne nesmyslně starý)
const THIS_YEAR = new Date().getFullYear();
const sane = (year, min = -3000000) => year !== undefined && year >= min && year <= THIS_YEAR ? year : undefined;
// Krátký název / zkratka jako další přijímaný název (OSN, NATO, EU); jen krátké a ne obecné
const aliasesOf = (detail, name) => {
    const list = [...(detail.short || []), ...(detail.al || [])].map(text => text.trim())
        .filter(text => text && text !== name && !ALIAS_DROP.has(text) && text.length >= 2 && text.length <= 40 && !/[()]/.test(text) && text.split(/\s+/).length <= 5);
    return [...new Set(list)].slice(0, 6);
};

// Nová položka z podrobností Wikidat
const buildItem = (qid, category, kind, detail, extra = {}) => {
    const title = detail.t;
    const label = N_OVERRIDES[qid] || detail.n || title.replace(/ \(.*\)$/, '');
    const name = capitalize(label);
    const person = kind === 'archeolog' || kind === 'pirat' || category === 'osobnost';
    const born = person ? sane(yearOf(detail.born)) : undefined;
    let died = person ? sane(yearOf(detail.died)) : undefined;
    if (born !== undefined && died !== undefined && (died <= born || died - born > 105)) died = undefined;
    const from = sane(yearOf(detail.from) ?? yearOf(detail.start), -3000000);
    const to = sane(yearOf(detail.to) ?? yearOf(detail.end), -3000000);
    const disc = sane(yearOf(detail.disc), 1000);
    const female = detail.sex === FEMALE;
    const description = D_OVERRIDES[qid] || detail.d;
    const keep = (text) => text && !sharesRoot(text, name) && !sharesRoot(text, title) ? text : undefined;
    let ty = KIND_LABELS[kind] || kind;
    if (kind === 'pirat' && female) ty = KIND_LABELS.piratka;
    if (kind === 'archeolog' && female) ty = 'archeoložka';
    if (kind === 'pojem' && category === 'pirati') ty = KIND_LABELS.piratstvi;
    const facts = {};
    if (person) {
        // Spojené království je až od roku 1707 (John Hawkins, William Kidd: Anglie)
        const land = landByDescription(description, detail.cit || []);
        Object.assign(facts, { born, died, land: land && /Spojené království/u.test(land) && (born ?? died) < 1690 ? 'Anglie' : land });
        facts.y = born !== undefined ? Math.min(born + 35, died !== undefined ? Math.round(born + (died - born) * 0.75) : born + 35) : died;
    } else if (category === 'organizace') {
        // Sídlo, které jen opakuje jiný název (Budova Organizace spojených národů, Sídlo NATO), se vynechá
        const hq = (detail.hq || []).find(text => !/^(Sídlo|Budova)/u.test(text));
        Object.assign(facts, { from, to: to !== undefined && from !== undefined && to >= from ? to : undefined, hq: keep(hq) });
        facts.y = from;
    } else if (category === 'archeologie') {
        // Místo nálezu jen podle P189 (P276 je u nálezů muzeum, kde jsou dnes); u písma „objevitel“ bývá vynálezce (Sumerové) – vynechá se
        const place = keep(first(detail, 'found'));
        const made = MADE_FIX[qid] ?? from;
        if (kind === 'obdobi' || kind === 'kultura' || kind === 'narod') Object.assign(facts, { from, to: to !== undefined && from !== undefined && to >= from ? to : undefined, area: AREAS[qid] });
        else if (kind === 'pismo') Object.assign(facts, { made });
        else Object.assign(facts, { made: kind === 'naleziste' || kind === 'pojem' || (made !== undefined && made < -10000) ? undefined : made, disc,
            finder: kind === 'pojem' ? undefined : keep(first(detail, 'finder')), place, coll: keep(first(detail, 'coll')) });
        facts.y = disc ?? made;
    } else if (category === 'tradice') {
        Object.assign(facts, { when: extra.when, area: AREAS[qid] });
    } else if (category === 'pirati') {
        Object.assign(facts, { y: from, area: AREAS[qid] });
    }
    const point = kind === 'naleziste' ? parsePoint(detail.coord) : null;
    return compact({
        q: qid,
        t: title,
        n: name,
        c: category,
        ty: extra.ty || ty,
        d: description,
        cz: extra.cz ? 1 : undefined,
        sx: person && female ? 'f' : undefined,
        la: point ? point.lat : undefined,
        lo: point ? point.lon : undefined,
        co: kind === 'naleziste' ? (detail.co || []) : undefined,
        ...(IMAGE_DROP.has(qid) ? {} : imageFields(detail.im)),
        al: category === 'osobnost' || person ? undefined : aliasesOf(detail, name),
        f: compact({ ...facts, exp: EXPLORERS[qid] }),
        kd: category === 'osobnost' ? undefined : kind
    });
};

// --- Okruhy ---
// OSN, její hlavní orgány, specializované agentury a programy (Mezinárodní měnový fond a Světová banka jsou také agentury OSN)
const UN_FAMILY = new Set(['Q1065', 'Q37470', 'Q47423', 'Q7801', 'Q170075', 'Q219575', 'Q132551', 'Q82151', 'Q204344', 'Q376150', 'Q125761', 'Q177773',
    'Q201054', 'Q182016', 'Q161718', 'Q171183', 'Q7804', 'Q7164']);
const BY_NAME = { by: 'name' };
const BY_YEAR = { by: 'y' };
export const NEW_COLLECTIONS = [
    { id: 'objevitele', label: 'Objevitelé a mořeplavci', text: 'Od Kolumba po polárníky', sort: BY_YEAR, test: item => Object.hasOwn(EXPLORERS, item.q) },
    { id: 'pravek', label: 'Pravěká období a kultury', text: 'Od paleolitu po Kelty', sort: BY_NAME, test: item => item.c === 'archeologie' && ['obdobi', 'kultura'].includes(item.kd) },
    { id: 'pisma', label: 'Písma starověku', sort: BY_NAME, test: item => item.c === 'archeologie' && item.kd === 'pismo' },
    { id: 'narody-staroveku', label: 'Národy starověku', text: 'Sumerové, Chetité, Keltové, Germáni…', sort: BY_NAME, test: item => item.c === 'archeologie' && item.kd === 'narod' },
    { id: 'archeologove', label: 'Archeologové', sort: BY_YEAR, test: item => item.c === 'archeologie' && item.kd === 'archeolog' },
    { id: 'ceska-archeologie', label: 'Česká archeologie', text: 'Hradiště, oppida a archeologové', sort: BY_NAME, test: item => item.c === 'archeologie' && item.cz === 1 },
    { id: 'pirati-zlaty-vek', label: 'Zlatý věk pirátství', text: 'Karibik a Atlantik 1650–1730', sort: BY_YEAR,
        test: item => item.c === 'pirati' && item.kd === 'pirat' && item.f.born >= 1610 && item.f.born <= 1700 },
    { id: 'osn', label: 'OSN a její organizace', text: 'Hlavní orgány, agentury a programy', sort: BY_NAME, test: item => item.c === 'organizace' && UN_FAMILY.has(item.q) },
    { id: 'evropska-integrace', label: 'Evropská unie a evropská spolupráce', sort: BY_NAME,
        test: item => item.c === 'organizace' && /Evrop|euro|Schengen|Visegrád|Benelux/iu.test(item.n) },
    { id: 'aliance', label: 'Aliance a spolky v dějinách', text: 'Od Hanzy po Osu', sort: BY_YEAR, test: item => item.c === 'organizace' && item.kd === 'aliance' },
    { id: 'nevladni-organizace', label: 'Nevládní organizace', sort: BY_NAME, test: item => item.c === 'organizace' && item.kd === 'nevladni' },
    { id: 'ceske-tradice', label: 'České lidové tradice a svátky', sort: BY_NAME, test: item => item.c === 'tradice' && item.cz === 1 },
    { id: 'statni-svatky', label: 'České státní svátky', sort: BY_NAME, test: item => item.c === 'tradice' && item.kd === 'statni' },
    { id: 'svatky-sveta', label: 'Svátky světa a náboženství', text: 'Díválí, chanuka, ramadán…', sort: BY_NAME, test: item => item.c === 'tradice' && item.kd === 'svatek' && !item.cz },
    { id: 'kroje-tance', label: 'Kroje, tance a národopisné oblasti', sort: BY_NAME, test: item => item.c === 'tradice' && ['kroj', 'tanec', 'oblast'].includes(item.kd) }
];

// --- Úrovně ---
// Pořadí známosti se počítá zvlášť pro české položky (tradice, hradiště, čeští archeologové; jazykových verzí mají málo, rozhoduje
// návštěvnost) a ostatní. Známé: nejznámější KNOWN_SHARE skupiny, ale jen s návštěvností článku české Wikipedie aspoň KNOWN_MIN_VIEWS
// za rok 2025 (pro srovnání: Bitva u Hastingsu má kolem 9 000); vždy známé je, co má aspoň FAMOUS_VIEWS (Velikonoce, NATO, Keltové),
// česká položka od CZECH_KNOWN_VIEWS a ručně vybraní nejslavnější piráti (FIXED_KNOWN: v češtině se o nich čte málo, znají je ale
// z filmů a knih). Expert: nejméně známá třetina skupiny; česká položka od CZECH_PROTECT_VIEWS a ostatní od PROTECT_VIEWS pro experty nejsou.
const KNOWN_SHARE = 0.25;
const KNOWN_MIN_VIEWS = 4000;
const FAMOUS_VIEWS = 25000;
const CZECH_KNOWN_VIEWS = 6000;
const CZECH_PROTECT_VIEWS = 2000;
const PROTECT_VIEWS = 4000;
const EXPERT_SHARE = 0.33;
const PROMOTE_CEILING = 0.5;
// Černovous, Henry Morgan, Anne Bonny, Mary Readová, William Kidd, Calico Jack, Jolly Roger, pirátství, korzár, bukanýr, Mikuláš
const FIXED_KNOWN = new Set(['Q213518', 'Q215502', 'Q231549', 'Q234421', 'Q26558', 'Q312905', 'Q182773', 'Q45393', 'Q201559', 'Q850220', 'Q760225']);
const levelsFor = (items, collections, pageviews) => {
    for (const item of items) {
        const pv = item.t ? pageviews[item.t] : undefined;
        const views = pv || 0;
        const fixed = FIXED_KNOWN.has(item.q);
        item.k = fixed || views >= FAMOUS_VIEWS || (item.cz && views >= CZECH_KNOWN_VIEWS) ? 1 : 0;
        item._ = { sl: item.sl || 0, pv, pool: `${item.c}|${item.cz ? 'cz' : 'svet'}`, never: !fixed && views < KNOWN_MIN_VIEWS,
            protect: views >= PROTECT_VIEWS || (Boolean(item.cz) && views >= CZECH_PROTECT_VIEWS) };
    }
    const groups = [
        ...collections.map(collection => ({ id: collection.id, members: items.filter(item => (item.g || []).includes(collection.id)) })),
        ...[...new Set(items.map(item => item.c))].map(category => ({ id: `c:${category}`, members: items.filter(item => item.c === category) }))
    ].filter(group => group.members.length);
    const promoted = assignLevels(items, { knownShare: () => KNOWN_SHARE, expertShare: () => EXPERT_SHARE,
        pvWeight: (pool) => pool.endsWith('|cz') ? 0.9 : 0.6, ceiling: () => PROMOTE_CEILING, groups });
    for (const item of items) delete item._;
    return promoted;
};

// items, collections = data tématu (mění se na místě). Vrátí přehled pro výpis.
export const extendHistorie = async ({ items, collections }) => {
    const report = { added: {}, skipped: [], promoted: [] };
    const taken = takenElsewhere();
    // Položky rozšíření z dřívějška se sestaví znovu (známost se přepočítá jen u nich)
    const isExtension = (item) => NEW_CATEGORIES.includes(item.c) || item.xe === 1;
    for (let index = items.length - 1; index >= 0; index--) if (isExtension(items[index])) items.splice(index, 1);
    const kept = new Set(items.map(item => item.q));

    const candidates = [
        ...ARCHEOLOGIE.map(([qid, kind]) => ({ qid, category: 'archeologie', kind })),
        ...PIRATI.map(([qid, kind]) => ({ qid, category: 'pirati', kind })),
        ...ORGANIZACE.map(([qid, kind]) => ({ qid, category: 'organizace', kind })),
        ...TRADICE.map(([qid, kind, when, cz]) => ({ qid, category: 'tradice', kind, when: when || undefined, cz })),
        ...EXPLORERS_NEW.map(([qid, ty, cz]) => ({ qid, category: 'osobnost', kind: 'objevitel', ty, cz }))
    ];
    const qids = [...new Set(candidates.map(candidate => candidate.qid))];
    const details = await cached(`historie-rozsireni-${qids.length}`, () => fetchDetails(qids));
    const usedImages = new Set(items.map(item => item.im).filter(Boolean));
    const seen = new Set();
    const added = [];
    for (const candidate of candidates) {
        const { qid, category, kind } = candidate;
        const detail = details[qid] || {};
        const skip = (why) => report.skipped.push(`${qid} ${detail.t || ''}: ${why}`);
        if (seen.has(qid)) { skip('dvakrát v seznamu'); continue; }
        seen.add(qid);
        if (kept.has(qid)) { skip('už je v Historii'); continue; }
        if (taken.has(qid)) { skip(`už je v tématu ${taken.get(qid)}`); continue; }
        if (!detail.t) { skip('bez článku na české Wikipedii'); continue; }
        if ((detail.her || []).includes('Q9259')) { skip('památka UNESCO'); continue; }
        const item = buildItem(qid, category, kind, detail, { when: candidate.when, cz: candidate.cz || (category === 'archeologie' && (CZECH_ARCHEOLOGY.has(qid) || /česk|morav|(?<!\p{L})čech/iu.test(detail.d || ''))), ty: candidate.ty });
        if (category === 'osobnost' || kind === 'archeolog' || kind === 'pirat') {
            // Osoba bez roku narození i úmrtí se na časové ose ani ve hře neukáže
            if (item.f.born === undefined && item.f.died === undefined) { skip('bez roků života'); continue; }
        }
        if (item.im && usedImages.has(item.im)) { delete item.im; delete item.ih; }
        if (item.im) usedImages.add(item.im);
        // Rozšíření mimo nové kategorie (objevitelé mezi osobnostmi) se pozná podle xe
        if (category === 'osobnost') item.xe = 1;
        item.sl = Number(detail.sl) || 0;
        added.push(item);
    }
    // Fakt Cesty a objevy a okruh u objevitelů, kteří už mezi osobnostmi jsou (id, kategorie a úroveň beze změny)
    for (const item of items) if (Object.hasOwn(EXPLORERS, item.q)) item.f.exp = EXPLORERS[item.q];
    // Okruhy
    for (const item of [...items, ...added]) {
        // Čeští cestovatelé, kteří přibyli, patří i do Českých dějin (jako ostatní české osobnosti)
        const groups = [...(item.xe && item.cz ? ['ceske-dejiny'] : []), ...NEW_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id)];
        if (!groups.length) continue;
        item.g = [...new Set([...(item.g || []).filter(group => !NEW_COLLECTIONS.some(collection => collection.id === group)), ...groups])];
    }
    // Známost nových položek
    const pageviews = await topicPageviews('historie-rozsireni-navstevnost-2025', added.map(item => item.t), { offline: process.env.OFFLINE === '1' });
    const newCollections = NEW_COLLECTIONS.map(({ test, ...collection }) => collection);
    // Nové osobnosti se porovnávají jen mezi sebou (objevitelé), úrovně ostatních osobností se nemění
    report.promoted = levelsFor(added, newCollections.filter(collection => collection.id !== 'objevitele'), pageviews);
    // Perlička bez popisu i fotky by byla neuhodnutelná – zůstane v úrovni Mudrlant
    for (const item of added) {
        if (item.x && !item.d && !item.im) delete item.x;
        delete item.sl;
    }
    for (const item of added) items.push(item);
    for (const collection of newCollections) {
        const index = collections.findIndex(other => other.id === collection.id);
        if (index >= 0) collections[index] = collection; else collections.push(collection);
    }
    for (const item of added) (report.added[item.c] ||= []).push(`${item.n} [${item.ty}]${item.k ? ' ZNÁMÁ' : item.x ? ' expert' : ''} pv ${pageviews[item.t] ?? '?'}`);
    for (const category of [...NEW_CATEGORIES, 'osobnost']) {
        const list = added.filter(item => item.c === category);
        if (list.length) report.summary = [...(report.summary || []), levelSummary(category, list)];
    }
    return report;
};
