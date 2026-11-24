// Téma Fyzika, rozšíření o astronomii a kosmonautiku: nové kategorie Astronomické jevy a pojmy (astronomie) a Rakety a kosmické lodě
// (rakety), k tomu další mise, sondy, dalekohledy a programy (mise) a čeští astronomové s kosmonauty (astronomove).
// Používá build-fyzika.mjs: na konci celého sestavení, nebo samostatně nad hotovým data/fyzika.json (FYZIKA_ONLY=vesmir) –
// ostatní položky se nestahují ani nemění (id, kategorie a úroveň zůstanou; přibudou jen nové okruhy).
//
// Kandidáti: ruční seznamy podle ID Wikidat (vybrané z tříd Wikidat a z anglických názvů, jen s článkem na české Wikipedii); položky,
// které už má jiné téma (data/*.json), nebo které už Fyzika má, se vynechají. Kosmodromy má Technika a vynálezy (stavby), proto tu nejsou.
// Známost: pořadí podle jazykových verzí a návštěvnosti české Wikipedie (scripts/lib/veda-levels.mjs); v nových kategoriích jako
// v ostatních kategoriích tématu, v existujících kategoriích (mise, astronomové) podle pořadí mezi jejich dosavadními položkami.
import { readFileSync, readdirSync } from 'node:fs';
import { qlever, id, values, imageFields, yearOf, compact, cached, inBatches } from './wikidata.mjs';
import { landByDescription } from './nationality.mjs';
import { assignLevels, pageviewsByTitle, EXPERT_SHARE, EXPERT_MAX_SHARE, knownFloor } from './veda-levels.mjs';

export const EXTRA_CATEGORIES = ['astronomie', 'rakety'];

// --- Astronomické jevy a pojmy: [ID, druh, údaje] ---
// druh: jev, meteorický roj, druh tělesa, oblast vesmíru, útvar (na planetě nebo měsíci), hvězdný obrazec, pojem
const ASTRONOMIE = [
    // Jevy na obloze a ve vesmíru
    ['Q3887', 'jev'], ['Q44235', 'jev'], ['Q123524', 'jev'], ['Q1315', 'jev'], ['Q104641', 'jev'], ['Q108566', 'jev'], ['Q687756', 'jev'],
    ['Q328327', 'jev'], ['Q185203', 'jev'], ['Q191536', 'jev'], ['Q105562', 'jev'], ['Q202746', 'jev'], ['Q218673', 'jev'], ['Q109144', 'jev'],
    ['Q190991', 'jev'], ['Q774621', 'jev'], ['Q164160', 'jev'], ['Q131136', 'jev'], ['Q317167', 'jev'], ['Q105000', 'jev'], ['Q463796', 'jev'],
    ['Q79833', 'jev'], ['Q119830', 'jev'], ['Q6582994', 'jev'], ['Q221699', 'jev'], ['Q130011', 'jev'], ['Q22247', 'jev'], ['Q15809070', 'jev'],
    ['Q14468623', 'jev'], ['Q6458', 'jev'], ['Q4188', 'jev'], ['Q204079', 'jev'], ['Q1061350', 'jev'], ['Q741976', 'jev'], ['Q165074', 'pojem'],
    ['Q180644', 'jev'], ['Q83094', 'jev'], ['Q312021', 'jev'], ['Q11547', 'jev'], ['Q654396', 'jev'], ['Q170754', 'útvar', { on: 'Slunce' }],
    // Meteorické roje: maximum, radiant (souhvězdí) a mateřské těleso
    ['Q173708', 'meteorický roj', { max: '12.–13. srpna', rad: 'Perseus', from: 'kometa 109P/Swift-Tuttle' }],
    ['Q189698', 'meteorický roj', { max: '17.–18. listopadu', rad: 'Lev', from: 'kometa 55P/Tempel-Tuttle' }],
    ['Q1237067', 'meteorický roj', { max: '13.–14. prosince', rad: 'Blíženci', from: 'planetka 3200 Phaethon' }],
    ['Q838275', 'meteorický roj', { max: '3.–4. ledna', rad: 'Pastýř', from: 'planetka 2003 EH1' }],
    ['Q200531', 'meteorický roj', { max: '22.–23. dubna', rad: 'Lyra', from: 'kometa C/1861 G1 (Thatcher)' }],
    ['Q374114', 'meteorický roj', { max: '21.–22. října', rad: 'Orion', from: 'Halleyova kometa' }],
    ['Q249546', 'meteorický roj', { max: '5.–6. května', rad: 'Vodnář', from: 'Halleyova kometa' }],
    ['Q32334', 'meteorický roj', { max: 'začátek listopadu', rad: 'Býk', from: 'kometa 2P/Encke' }],
    ['Q740319', 'meteorický roj', { max: '8.–9. října', rad: 'Drak', from: 'kometa 21P/Giacobini-Zinner' }],
    ['Q1133679', 'meteorický roj', { max: '22. prosince', rad: 'Malá medvědice', from: 'kometa 8P/Tuttle' }],
    // Druhy vesmírných těles
    ['Q589', 'druh tělesa'], ['Q634', 'druh tělesa'], ['Q523', 'druh tělesa'], ['Q318', 'druh tělesa'], ['Q3559', 'druh tělesa'], ['Q3863', 'druh tělesa'],
    ['Q2199', 'druh tělesa'], ['Q2537', 'druh tělesa', { n: 'Přirozená družice' }], ['Q44559', 'druh tělesa'], ['Q7012', 'druh tělesa'],
    ['Q5893', 'druh tělesa'], ['Q101600', 'druh tělesa'], ['Q50081', 'druh tělesa'], ['Q5898', 'druh tělesa'], ['Q5855', 'druh tělesa'],
    ['Q231982', 'druh tělesa'], ['Q190426', 'druh tělesa'], ['Q40392', 'druh tělesa'], ['Q5976', 'druh tělesa'], ['Q188593', 'druh tělesa'],
    ['Q6243', 'druh tělesa'], ['Q50053', 'druh tělesa'], ['Q6251', 'druh tělesa'], ['Q204903', 'druh tělesa'], ['Q121750', 'druh tělesa'],
    ['Q1319599', 'druh tělesa'], ['Q128207', 'druh tělesa'], ['Q327757', 'druh tělesa'], ['Q382979', 'druh tělesa'], ['Q167910', 'druh tělesa'],
    ['Q679411', 'druh tělesa'], ['Q2488', 'druh tělesa'], ['Q184348', 'druh tělesa'], ['Q190397', 'druh tělesa'], ['Q11276', 'druh tělesa'],
    ['Q11387', 'druh tělesa'], ['Q168845', 'druh tělesa'], ['Q13632', 'druh tělesa'], ['Q221221', 'druh tělesa'], ['Q272447', 'druh tělesa'],
    ['Q505781', 'druh tělesa'], ['Q237604', 'druh tělesa'], ['Q204107', 'druh tělesa'], ['Q27521', 'druh tělesa'], ['Q6592', 'druh tělesa'],
    // Oblasti vesmíru
    ['Q544', 'oblast vesmíru'], ['Q1', 'oblast vesmíru'], ['Q40864', 'oblast vesmíru'], ['Q427', 'oblast vesmíru'], ['Q2179', 'oblast vesmíru'],
    ['Q188533', 'oblast vesmíru'], ['Q3944', 'oblast vesmíru'], ['Q17863945', 'oblast vesmíru'], ['Q656857', 'oblast vesmíru'],
    ['Q221392', 'oblast vesmíru'], ['Q4169', 'oblast vesmíru'], ['Q41872', 'oblast vesmíru'], ['Q275565', 'oblast vesmíru'],
    ['Q498792', 'oblast vesmíru'], ['Q215913', 'oblast vesmíru'], ['Q631379', 'oblast vesmíru'], ['Q175760', 'oblast vesmíru'],
    // Útvary na planetách, měsících a planetkách (kde)
    ['Q520', 'útvar', { on: 'Mars' }], ['Q621110', 'útvar', { on: 'Mars' }], ['Q194256', 'útvar', { on: 'Jupiter' }], ['Q194', 'útvar', { on: 'Saturn' }],
    ['Q816838', 'útvar', { on: 'Měsíc' }], ['Q782867', 'útvar', { on: 'Měsíc' }], ['Q180874', 'útvar', { on: 'Měsíc' }],
    ['Q320936', 'útvar', { on: 'Měsíc', n: 'Moře klidu' }], ['Q487895', 'útvar', { on: 'Měsíc', n: 'Moře dešťů' }],
    ['Q169625', 'útvar', { on: 'Měsíc', n: 'Moře jasu' }], ['Q488299', 'útvar', { on: 'Měsíc', n: 'Oceán bouří' }],
    ['Q631696', 'útvar', { on: 'Měsíc' }], ['Q748111', 'útvar', { on: 'Mars' }], ['Q374841', 'útvar', { on: 'Venuše' }],
    ['Q3115080', 'útvar', { on: 'Neptun' }], ['Q914016', 'útvar', { on: 'Mars' }], ['Q622221', 'útvar', { on: 'Mars' }],
    ['Q2631008', 'útvar', { on: 'Vesta' }], ['Q58969', 'útvar', { on: 'Mars' }],
    // Hvězdné obrazce (asterismy)
    ['Q10460', 'hvězdný obrazec'], ['Q324113', 'hvězdný obrazec'], ['Q515922', 'hvězdný obrazec'],
    // Pojmy astronomie a kosmonautiky
    ['Q40540', 'pojem'], ['Q79852', 'pojem'], ['Q82806', 'pojem'], ['Q145825', 'pojem'], ['Q43261', 'pojem'], ['Q124274', 'pojem'], ['Q76287', 'pojem'],
    ['Q13442', 'pojem'], ['Q12134', 'pojem'], ['Q187646', 'pojem'], ['Q80360', 'pojem'], ['Q124313', 'pojem'], ['Q159653', 'pojem'], ['Q101038', 'pojem'],
    ['Q4130', 'pojem'], ['Q37640', 'pojem'], ['Q208474', 'pojem'], ['Q83481', 'pojem'], ['Q192316', 'pojem'], ['Q663611', 'pojem'], ['Q223776', 'pojem'],
    ['Q275450', 'pojem'], ['Q232086', 'pojem'], ['Q51366', 'pojem'], ['Q3270143', 'pojem'], ['Q3450', 'pojem'], ['Q9262', 'pojem'], ['Q180316', 'pojem'],
    ['Q33580', 'pojem'], ['Q33297', 'pojem'], ['Q3327819', 'pojem'], ['Q139931', 'pojem'], ['Q13599969', 'pojem'], ['Q618164', 'pojem'],
    ['Q4234997', 'pojem'], ['Q191747', 'pojem'], ['Q208620', 'pojem'], ['Q181508', 'pojem'], ['Q188458', 'pojem'], ['Q204520', 'pojem'],
    ['Q223571', 'pojem'], ['Q912471', 'pojem'], ['Q268391', 'pojem']
];

// --- Rakety a kosmické lodě: [ID, druh, země, údaje] ---
// země: hlavní země nebo agentura (Sovětský svaz a Rusko jako jedna, Evropa = ESA a předchůdci); year = první let, kde ho Wikidata
// nemají; d = popis, kde ho Wikidata nemají nebo je mylný; space: false = do vesmíru nikdy neletěla (otázka na desetiletí letu se nekladě)
const SOVIET = 'SSSR a Rusko';
const RAKETY = [
    ['Q174640', 'raketa', 'Německo', { year: 1942, d: 'německá balistická raketa z druhé světové války, první předmět vyslaný lidmi do vesmíru' }],
    ['Q221675', 'raketa', SOVIET, { year: 1957, d: 'první mezikontinentální balistická raketa, která vynesla i první družici' }],
    ['Q1299641', 'raketa', SOVIET, { year: 1966, d: 'sovětská a ruská nosná raketa, která vynáší pilotované lodě stejného jména' }],
    ['Q841262', 'raketa', SOVIET, { year: 1958, d: 'sovětská nosná raketa, která vynesla do vesmíru prvního člověka' }],
    ['Q847798', 'raketa', SOVIET, { year: 1960 }],
    ['Q249231', 'raketa', SOVIET, { year: 1965 }],
    ['Q622762', 'raketa', SOVIET, { year: 1969, d: 'sovětská obří raketa pro let na Měsíc, která při všech čtyřech startech selhala' }],
    ['Q731859', 'raketa', SOVIET, { year: 1987, d: 'sovětská supertěžká nosná raketa, která vynesla raketoplán Buran' }],
    ['Q530600', 'raketa', SOVIET, { year: 2014, d: 'rodina ruských nosných raket z kosmodromů Pleseck a Vostočnyj' }],
    ['Q1748964', 'raketa', SOVIET, { year: 1985 }],
    ['Q521076', 'raketa', 'USA', { year: 1961 }],
    ['Q719315', 'raketa', 'USA', { year: 1966 }],
    ['Q1192304', 'raketa', 'USA', { year: 1958, d: 'americká raketa, která vynesla první americkou družici Explorer 1' }],
    ['Q333812', 'raketa', 'USA', { year: 1957 }],
    ['Q23625', 'raketa', 'USA', { year: 2002, d: 'americká nosná raketa firmy United Launch Alliance' }],
    ['Q1136670', 'raketa', 'USA', { year: 1959, d: 'rodina amerických raket, které vynášely i pilotované lodě programu Gemini' }],
    ['Q49538', 'raketa', 'USA', { year: 1989, d: 'americká nosná raketa, která vynesla mnoho sond k Marsu' }],
    ['Q49543', 'raketa', 'USA', { year: 2002, d: 'americká nosná raketa, jejíž těžká verze měla tři spojené první stupně' }],
    ['Q648606', 'raketa', 'USA', { year: 2006, d: 'první raketa společnosti SpaceX, první soukromá raketa na kapalné palivo na oběžné dráze' }],
    ['Q1093627', 'raketa', 'USA', { year: 2018 }],
    ['Q62833385', 'raketa', 'USA', { year: 2023, d: 'největší a nejsilnější raketa světa, opakovaně použitelná loď a nosič společnosti SpaceX' }],
    ['Q26869616', 'raketa', 'USA', { year: 2025, d: 'těžká nosná raketa společnosti Blue Origin s opakovaně použitelným prvním stupněm' }],
    ['Q3339012', 'raketa', 'USA', { year: 2015, d: 'suborbitální raketa a kabina společnosti Blue Origin pro krátké turistické lety do vesmíru' }],
    ['Q18375', 'raketa', 'Evropa', { year: 1979, d: 'první evropská nosná raketa své řady' }],
    ['Q18387', 'raketa', 'Evropa', { year: 1988, d: 'evropská nosná raketa, která v 90. letech ovládla trh se starty družic' }],
    ['Q15720682', 'raketa', 'Evropa', { year: 2024 }],
    ['Q262629', 'raketa', 'Evropa', { year: 2012, d: 'evropská lehká nosná raketa' }],
    ['Q218640', 'raketa', 'Evropa', { year: 1964 }],
    ['Q49568', 'raketa', 'Francie', { year: 1965, d: 'francouzská nosná raketa, se kterou se Francie stala třetí zemí s vlastní družicí' }],
    ['Q35307', 'raketa', 'Velká Británie', { year: 1969, d: 'britská nosná raketa, která vynesla jedinou britskou družici vlastní raketou' }],
    ['Q53665', 'raketa', 'Čína', { year: 1970 }],
    ['Q60599', 'raketa', 'Japonsko', { year: 2001 }],
    ['Q221654', 'raketa', 'Indie', { year: 1993, d: 'indická nosná raketa, která vynesla sondy k Měsíci a k Marsu' }],
    ['Q249238', 'raketa', 'Indie', { year: 2001, d: 'indická nosná raketa pro družice na geostacionární dráze' }],
    ['Q1360911', 'raketa', 'Indie', { year: 2014, d: 'nejsilnější indická nosná raketa, která vynesla sondu Čandraján-3' }],
    ['Q876010', 'raketa', 'Izrael', { year: 1988 }],
    ['Q142596', 'raketa', 'Írán', { year: 2008 }],
    ['Q128683', 'raketa', 'USA', { year: 2013 }],
    ['Q478603', 'raketa', 'USA', { year: 1990, d: 'americká nosná raketa vypouštěná z letadla' }],
    ['Q19816744', 'raketa', 'USA', { year: 2024, d: 'americká nosná raketa firmy United Launch Alliance, nástupkyně raket Atlas a Delta' }],
    // Kosmické lodě
    ['Q579421', 'kosmická loď', SOVIET, { year: 1967, d: 'sovětská a ruská pilotovaná loď pro tři kosmonauty, ve které letěl i první Čechoslovák' }],
    ['Q624038', 'kosmická loď', SOVIET, { year: 1961, d: 'sovětská jednomístná loď, ve které letěli první kosmonauti' }],
    ['Q309363', 'kosmická loď', SOVIET, { year: 1978 }],
    ['Q208382', 'kosmická loď', 'USA', { year: 1968, d: 'americká přistávací loď, ve které astronauti přistáli na Měsíci' }],
    ['Q211727', 'kosmická loď', 'USA', { year: 2014, d: 'americká pilotovaná loď programu Artemis pro lety k Měsíci' }],
    ['Q236448', 'kosmická loď', 'USA', { year: 2010, d: 'bezpilotní nákladní loď společnosti SpaceX pro zásobování vesmírné stanice' }],
    ['Q17122887', 'kosmická loď', 'USA', { year: 2019, d: 'opakovaně použitelná pilotovaná a nákladní loď společnosti SpaceX' }],
    ['Q1138653', 'kosmická loď', 'Čína', { year: 1999 }],
    ['Q15905312', 'kosmická loď', 'Čína', { year: 2017, d: 'čínská bezpilotní nákladní loď pro zásobování vesmírné stanice' }],
    ['Q127924', 'kosmická loď', 'USA', { year: 2013 }],
    ['Q153257', 'kosmická loď', 'Evropa', { year: 2008 }],
    ['Q266487', 'kosmická loď', 'Japonsko', { year: 2009 }],
    ['Q1024445', 'kosmická loď', 'USA', { year: 2019, d: 'americká pilotovaná loď firmy Boeing, jejíž první posádka zůstala na stanici místo týdne devět měsíců' }],
    ['Q38935', 'kosmická loď', 'USA', { year: 2004, d: 'první soukromá pilotovaná loď, která dosáhla vesmíru' }],
    ['Q754806', 'kosmická loď', 'USA', { year: 2018, d: 'suborbitální raketové letadlo pro turistické lety do vesmíru' }],
    ['Q1064584', 'kosmická loď', SOVIET, { year: 1976 }],
    // Raketoplány
    ['Q54383', 'raketoplán', 'USA', { year: 1981, d: 'první raketoplán, který letěl do vesmíru; zanikl s celou posádkou při návratu v roce 2003' }],
    ['Q54382', 'raketoplán', 'USA', { year: 1983, d: 'raketoplán NASA, který se v roce 1986 rozpadl 73 sekund po startu' }],
    ['Q54384', 'raketoplán', 'USA', { year: 1984, d: 'raketoplán NASA s nejvíce lety, který vynesl Hubbleův dalekohled' }],
    ['Q54381', 'raketoplán', 'USA', { year: 1985, d: 'raketoplán NASA, který v roce 2011 uskutečnil poslední let programu' }],
    ['Q182508', 'raketoplán', 'USA', { year: 1992, d: 'nejmladší raketoplán NASA, postavený jako náhrada za zničený raketoplán' }],
    ['Q202347', 'raketoplán', 'USA', { year: 1977, space: false, d: 'zkušební raketoplán NASA, který létal jen v atmosféře' }]
];

// --- Mise, sondy, dalekohledy, programy (kategorie mise) ---
// druh jako u stávajících misí (kosmický program, pilotovaný let, kosmická stanice, kosmická sonda, dalekohled, observatoř, družice)
// a nově vozítko, kosmický let (bez posádky) a družicová síť; cz = česká položka
const MISE = [
    ['Q46611', 'kosmický program'], ['Q52162', 'kosmický program'], ['Q214996', 'kosmický program'], ['Q63819987', 'kosmický program'],
    ['Q623873', 'kosmický program'], ['Q170413', 'kosmický program'], ['Q192144', 'kosmický program'], ['Q192372', 'kosmický program'],
    ['Q155311', 'kosmický program'], ['Q190108', 'kosmický program'], ['Q202894', 'kosmický program'], ['Q207933', 'kosmický program'],
    ['Q19867977', 'družicová síť'], 
    ['Q194082', 'pilotovaný let'], ['Q188486', 'pilotovaný let'], ['Q203651', 'pilotovaný let'], ['Q191746', 'pilotovaný let'], ['Q188433', 'pilotovaný let'],
    ['Q178871', 'pilotovaný let'], ['Q194068', 'pilotovaný let'], ['Q188168', 'pilotovaný let'], ['Q208759', 'pilotovaný let'], ['Q269668', 'pilotovaný let'],
    ['Q722791', 'pilotovaný let'], ['Q211254', 'pilotovaný let'], ['Q648581', 'pilotovaný let'], ['Q617708', 'pilotovaný let', { cz: 1 }],
    ['Q623903', 'pilotovaný let'], ['Q617651', 'pilotovaný let'], ['Q217543', 'pilotovaný let'], ['Q19050', 'pilotovaný let'], ['Q178836', 'pilotovaný let'],
    ['Q16947045', 'pilotovaný let'], ['Q47246047', 'pilotovaný let'], ['Q105209621', 'pilotovaný let'], ['Q110916241', 'pilotovaný let'],
    ['Q56042661', 'pilotovaný let'], ['Q115651863', 'pilotovaný let'], ['Q3389152', 'kosmický let'],
    ['Q48604', 'kosmická stanice'], ['Q904503', 'kosmická stanice'], ['Q613601', 'kosmická stanice'], ['Q3122598', 'kosmická stanice'],
    ['Q47272', 'dalekohled'], ['Q48546', 'kosmická sonda'], ['Q767805', 'dalekohled'], ['Q660356', 'kosmická sonda'], ['Q714789', 'kosmická sonda'],
    ['Q63350', 'kosmická sonda'], ['Q205747', 'kosmická sonda'], ['Q217188', 'kosmická sonda'], ['Q21076293', 'kosmická sonda'], ['Q1159913', 'kosmická sonda'],
    ['Q858293', 'kosmická sonda'], ['Q371939', 'kosmická sonda'], ['Q208984', 'kosmická sonda'], ['Q203805', 'kosmická sonda'],
    ['Q203801', 'kosmická sonda'], ['Q728292', 'kosmická sonda'], ['Q372064', 'kosmická sonda'], ['Q1153267', 'kosmická sonda'], ['Q212131', 'kosmická sonda'],
    ['Q49011', 'kosmická sonda'], ['Q2156739', 'kosmická sonda'], ['Q23580572', 'kosmická sonda'], ['Q18346001', 'kosmická sonda'], ['Q183160', 'kosmická sonda'],
    ['Q327075', 'kosmická sonda'], ['Q206300', 'kosmická sonda'], ['Q331778', 'kosmická sonda'], ['Q653731', 'kosmická sonda'], ['Q320638', 'kosmická sonda'],
    ['Q210889', 'kosmická sonda'], ['Q129091', 'kosmická sonda'], ['Q1660590', 'kosmická sonda'], ['Q416448', 'kosmická sonda'], ['Q21027958', 'kosmická sonda'],
    ['Q1042357', 'kosmická sonda'], ['Q61742389', 'kosmická sonda'], 
    ['Q574464', 'kosmická sonda'], ['Q672135', 'kosmická sonda'],
    ['Q193538', 'vozítko'], ['Q669895', 'vozítko'], ['Q275816', 'vozítko'],
    ['Q209630', 'dalekohled'], ['Q725309', 'dalekohled'], ['Q1323537', 'dalekohled'], ['Q578497', 'dalekohled'], 
    
    ['Q672021', 'observatoř'], ['Q555130', 'dalekohled'], 
    ['Q392420', 'observatoř', { cz: 1 }], ['Q12021065', 'observatoř', { cz: 1 }], ['Q18198103', 'planetárium', { cz: 1 }],
    ['Q23832741', 'družice', { cz: 1 }], ['Q30935050', 'družice', { cz: 1 }], 
];

// --- Astronomové a kosmonauti (kategorie astronomove): čeští astronomové a kosmonauti, slavní kosmonauti, kteří chyběli ---
const LIDE = [
    'Q254985', 'Q916950', 'Q448167', 'Q3564211', 'Q1355663', 'Q516055', 'Q7940578', 'Q27122', 'Q58960', 'Q241304', 'Q634543', 'Q5492573', 'Q2091473',
    'Q2576640', 'Q12044261',
    'Q1687593', 'Q554409', 'Q379039', 'Q17519', 'Q210184', 'Q227030', 'Q6160001', 'Q539385', 'Q375065', 'Q349365', 'Q81129', 'Q353687',
    'Q434205', 'Q362998', 'Q375659', 'Q462132', 'Q126127455', 'Q466513', 'Q255764'
];
// Lidé: druh, kde ho popis ve Wikidatech neuvádí (k = kosmonaut), popis, země a české, kde Wikidata občanství nemají
const LIDE_FIX = {
    Q554409: { k: 1, d: 'americký astronaut, který s Sunitou Williamsovou zůstal na vesmírné stanici místo týdne devět měsíců' },
    Q379039: { k: 1, d: 'italská astronautka Evropské kosmické agentury, první Evropanka ve velení vesmírné stanice', land: 'Itálie' },
    Q17519: { k: 1 }, Q210184: { k: 1, d: 'americký podnikatel, první platící vesmírný turista' },
    Q349365: { k: 1, d: 'americký astronaut, zahynul při havárii raketoplánu Challenger' },
    Q3492123: { k: 1, d: 'ruská kosmonautka, v roce 2014 pracovala na Mezinárodní vesmírné stanici' },
    Q255764: { k: 1, d: 'ruská kosmonautka, první žena na dlouhodobém pobytu na stanici Mir' },
    Q215124: { land: 'Německo' }, Q499636: { land: 'Dánsko' }, Q227030: { land: 'Jihoafrická republika' },
    Q7940578: { cz: 1 }, Q634543: { cz: 1, land: 'Česko' }, Q12044261: { cz: 1 }
};
// Popisy, které ve Wikidatech chybějí, nic neříkají („astronomický jev“) nebo prozrazují název (Lyridy – „v souhvězdí Lyry“)
const DESCRIPTIONS = {
    Q3887: 'jev, kdy Měsíc zakryje Slunce a na Zemi dopadne jeho stín',
    Q44235: 'jev, kdy Měsíc vstoupí do stínu Země a ztmavne, často do červena',
    Q123524: 'okamžik, kdy je polední Slunce nejvýše nebo nejníže nad obzorem v roce; nejdelší a nejkratší den',
    Q1315: 'okamžik na jaře a na podzim, kdy je den na celé Zemi stejně dlouhý jako noc',
    Q108566: 'fáze Měsíce, kdy je Měsíc mezi Zemí a Sluncem a není vidět',
    Q328327: 'druhý úplněk v jednom kalendářním měsíci',
    Q185203: 'vzácný jev, kdy druhá planeta od Slunce přejde jako černá tečka přes sluneční kotouč; naposledy v roce 2012',
    Q105562: 'postavení, kdy je planeta na opačné straně oblohy než Slunce a je nejlépe vidět',
    Q202746: 'jev, kdy bližší těleso (třeba Měsíc) zakryje vzdálenější hvězdu nebo planetu',
    Q109144: 'stav, kdy se těleso otočí kolem osy za stejnou dobu, za jakou oběhne své centrální těleso, a ukazuje mu stále stejnou stranu',
    Q105000: 'zvýšený počet meteorů, které jako by vylétaly z jednoho místa na obloze',
    Q463796: 'dopad planetky nebo komety na povrch planety či měsíce',
    Q221699: 'obrovský oblouk žhavého plazmatu vyčnívající nad okraj Slunce',
    Q130011: 'porucha magnetického pole Země vyvolaná proudem částic ze Slunce',
    Q22247: 'krátký, nesmírně silný výbuch záření gama ze vzdálené galaxie',
    Q15809070: 'záblesk rádiového záření ze vzdáleného vesmíru, trvá jen tisíciny sekundy',
    Q204079: 'slabá kuželovitá záře na obloze po soumraku nebo před svítáním – sluneční světlo rozptýlené na meziplanetárním prachu',
    Q1061350: 'slabá skvrna světla na noční obloze přesně naproti Slunci',
    Q180644: 'umělé světlo, které rozjasňuje noční oblohu a zakrývá hvězdy',
    Q83094: 'pomalé kroužení zemské osy, jeden oběh trvá asi 26 000 let',
    Q312021: 'zdánlivý pohyb planety po obloze zpět, opačným směrem než obvykle',
    Q170754: 'nejvyšší vrstva atmosféry Slunce, zářící perleťová záře vidět při úplném zatmění',
    Q165074: 'zdánlivý posun bližší hvězdy vůči vzdáleným, když ji pozorujeme z opačných míst oběžné dráhy Země',
    Q173708: 'nejznámější letní meteorický roj, lidově „slzy svatého Vavřince“',
    Q189698: 'listopadový meteorický roj, který občas vytvoří meteorický déšť s tisíci meteorů za hodinu',
    Q1237067: 'nejbohatší meteorický roj roku, s maximem v prosinci',
    Q838275: 'novoroční meteorický roj, pojmenovaný po zaniklém souhvězdí',
    Q200531: 'dubnový meteorický roj, jeden z nejdéle pozorovaných',
    Q374114: 'říjnový meteorický roj z prachu Halleyovy komety',
    Q249546: 'květnový meteorický roj z prachu Halleyovy komety, lépe viditelný z jižní polokoule',
    Q32334: 'podzimní meteorický roj s pomalými jasnými bolidy',
    Q740319: 'říjnový meteorický roj, nejsilnější večer po setmění',
    Q1133679: 'meteorický roj kolem zimního slunovratu',
    Q589: 'oblast vesmíru s tak silnou gravitací, že z ní neunikne ani světlo',
    Q318: 'obrovská soustava miliard hvězd, plynu a prachu držená pohromadě gravitací',
    Q3863: 'malé kamenné nebo kovové těleso obíhající kolem Slunce, většinou mezi Marsem a Jupiterem',
    Q2199: 'těleso obíhající Slunce, dost velké na kulatý tvar, které ale nevyčistilo okolí své dráhy; patří k nim Pluto',
    Q5893: 'malá, chladná a slabě svítící hvězda, nejčastější druh hvězd v Galaxii',
    Q101600: 'těleso mezi planetou a hvězdou, příliš malé na trvalou jadernou fúzi vodíku',
    Q5898: 'největší hvězdy vůbec, ve stáří obrovsky nafouklé; patří k nim Betelgeuze',
    Q5855: 'velmi horká, hmotná a jasná hvězda modrobílé barvy',
    Q190426: 'neutronová hvězda s nesmírně silným magnetickým polem',
    Q40392: 'těleso o hmotnosti milionů až miliard Sluncí ve středu galaxie, ze kterého neunikne ani světlo',
    Q6251: 'velmi horká a hmotná hvězda, která silným větrem ztrácí svůj vnější obal',
    Q204903: 'mladá hvězda, která se teprve smršťuje z oblaku plynu a prachu',
    Q382979: 'obří plynné exoplanety obíhající velmi blízko své hvězdy',
    Q168845: 'skupina hvězd, které vznikly společně a drží je pohromadě gravitace',
    Q13632: 'zářící obal plynu, který odhodila umírající hvězda podobná Slunci',
    Q272447: 'chladný a hustý oblak plynu a prachu, ve kterém vznikají hvězdy',
    Q505781: 'rotující disk plynu a prachu kolem mladé hvězdy, ze kterého vznikají planety',
    Q237604: 'rotující disk hmoty, která padá na černou díru, neutronovou hvězdu nebo jiné těleso',
    Q27521: 'obrovské seskupení kup a skupin galaxií',
    Q6592: 'těleso Sluneční soustavy obíhající za drahou poslední planety',
    Q427: 'oblast ledových těles za drahou Neptunu, ve které obíhá i Pluto',
    Q656857: 'oblast vesmíru, ke které gravitace táhne Mléčnou dráhu i okolní galaxie',
    Q221392: 'část vesmíru, ze které k nám od velkého třesku mohlo dorazit světlo',
    Q41872: 'řídký plyn a prach v prostoru mezi hvězdami',
    Q215913: 'oblast kolem hvězdy, kde může na povrchu planety být kapalná voda',
    Q320936: 'měsíční moře, ve kterém v roce 1969 přistála výprava Apolla 11',
    Q487895: 'jedno z největších měsíčních moří, na severozápadě přivrácené strany',
    Q169625: 'měsíční moře na severovýchodě přivrácené strany, u jehož okraje přistálo Apollo 17',
    Q488299: 'největší z měsíčních moří, na západě přivrácené strany',
    Q2631008: 'obří kráter na jižním pólu planetky Vesta s jednou z nejvyšších hor Sluneční soustavy',
    Q58969: 'skalní útvar v oblasti Cydonia, který na snímku sondy Viking 1 připomínal lidský obličej',
    Q914016: 'kráter na Marsu, ve kterém přistálo vozítko Perseverance',
    Q622221: 'kráter na Marsu, ve kterém přistálo vozítko Curiosity',
    Q631696: 'výrazný mladý kráter na jihu Měsíce s jasnými paprsky',
    Q324113: 'obrazec ze tří jasných hvězd Vega, Deneb a Altair na letní obloze',
    Q515922: 'obrazec ze šesti jasných hvězd na zimní obloze kolem Orionu',
    Q82806: 'bod na obloze přímo nad hlavou pozorovatele',
    Q145825: 'bod nebeské sféry přímo pod pozorovatelem',
    Q124274: 'úhel měřený podél obzoru od severu ve směru hodinových ručiček',
    Q76287: 'úhlová vzdálenost hvězdy od nebeského rovníku, obdoba zeměpisné šířky na obloze',
    Q187646: 'průmět zemského rovníku na nebeskou sféru',
    Q208474: 'číslo, které udává, jak moc je oběžná dráha protáhlá',
    Q223776: 'změna rychlosti a směru sondy průletem kolem planety',
    Q275450: 'nefunkční družice, zbytky raket a úlomky na oběžné dráze Země',
    Q232086: 'nejmenší vzdálenost, ve které měsíc přežije, než ho slapové síly planety roztrhají',
    Q51366: 'největší hmotnost bílého trpaslíka, asi 1,4 hmotnosti Slunce',
    Q3450: 'pás v diagramu hvězd, kde leží většina hvězd včetně Slunce, které v jádru spalují vodík',
    Q33580: 'otázka, proč jsme dosud nenašli žádné stopy mimozemských civilizací, když by jich mělo být mnoho',
    Q3327819: 'představa, že vedle našeho vesmíru existuje mnoho dalších',
    Q139931: 'možný konec vesmíru, kdy se všechna energie rovnoměrně rozptýlí a nic se už neděje',
    Q4234997: 'rychlost, kterou musí těleso mít, aby obíhalo kolem Země nebo z jejího vlivu uniklo',
    Q191747: 'čas měřený podle otáčení Země vůči hvězdám, ne vůči Slunci',
    Q181508: 'život, který by vznikl jinde než na Zemi',
    Q204520: 'myšlenka přeměnit jinou planetu tak, aby na ní mohli žít lidé',
    Q223571: 'ochranný oblek, ve kterém kosmonaut přežije ve vesmíru',
    Q268391: 'doba, za kterou Slunce oběhne střed Mléčné dráhy, asi 230 milionů let',
    // Rakety a lodě
    Q847798: 'sovětská nosná raketa pro družice na protáhlých drahách, odvozená z rakety R-7',
    Q249231: 'sovětská a ruská těžká nosná raketa, která vynesla moduly stanic Mir i ISS',
    Q1748964: 'sovětská a ukrajinská nosná raketa, startovala i z plovoucí plošiny v oceánu',
    Q521076: 'americká raketa, předchůdkyně měsíční rakety programu Apollo',
    Q719315: 'americká raketa, která vynesla první pilotovaný let programu Apollo a posádky stanice Skylab',
    Q876010: 'izraelská nosná raketa, která kvůli sousedním státům startuje na západ nad moře',
    Q142596: 'íránská nosná raketa, se kterou Írán vynesl svou první družici',
    Q128683: 'americká nosná raketa pro zásobovací lodě vesmírné stanice',
    Q15720682: 'nejnovější evropská nosná raketa, poprvé startovala v roce 2024',
    Q1093627: 'nejsilnější raketa společnosti SpaceX se třemi spojenými prvními stupni; na prvním letu vezla sportovní auto',
    Q1138653: 'čínská pilotovaná kosmická loď, odvozená z lodí Sojuz',
    Q1064584: 'sovětská loď pro vojenské stanice Almaz, s posádkou nikdy neletěla',
    // Mise, sondy a dalekohledy
    Q192144: 'sovětský program sond, které jako první přistály na jiné planetě a poslaly snímky z jejího povrchu',
    Q202894: 'americký program sond k Merkuru, Venuši a Marsu (1962–1973)',
    Q207933: 'sovětský program prvních vesmírných stanic (1971–1986)',
    Q63819987: 'americký program návratu lidí na Měsíc',
    Q849791: 'americké družice, které od roku 1972 snímkují povrch Země',
    Q194082: 'mise, jejíž posádka zahynula při požáru kabiny na startovací rampě',
    Q188486: 'první pilotovaný let programu Apollo, na oběžné dráze Země',
    Q203651: 'let, při kterém posádka na oběžné dráze Země vyzkoušela lunární modul',
    Q191746: 'generální zkouška přistání na Měsíci, lunární modul se přiblížil na 15 km k povrchu',
    Q178871: 'třetí přistání lidí na Měsíci; Alan Shepard tam odpálil golfové míčky',
    Q188168: 'páté přistání lidí na Měsíci, v měsíční vysočině',
    Q208759: 'první společný let USA a SSSR, spojení dvou lodí na oběžné dráze v roce 1975',
    Q269668: 'let, kterým se Valentina Těreškovová stala první ženou ve vesmíru',
    Q211254: 'let, při kterém zahynul Vladimir Komarov, první oběť kosmického letu',
    Q648581: 'let, jehož tříčlenná posádka zahynula při návratu z první vesmírné stanice',
    Q617708: 'let, při kterém se do vesmíru dostal první Čechoslovák',
    Q623903: 'první americký pilotovaný let, Alan Shepard v kabině Freedom 7',
    Q617651: 'let, při kterém Neil Armstrong poprvé spojil dvě tělesa na oběžné dráze',
    Q217543: 'první let raketoplánu, Columbia v dubnu 1981',
    Q19050: 'let raketoplánu Challenger, který skončil výbuchem 73 sekund po startu',
    Q110916241: 'soukromý let lodi Dragon s prvním soukromým výstupem do vesmíru',
    Q115651863: 'soukromý let k vesmírné stanici s prvními astronauty z Indie, Polska a Maďarska po desítkách let',
    Q904503: 'sovětská vesmírná stanice, kterou v roce 1985 zachránili kosmonauti po ztrátě spojení',
    Q613601: 'sovětská vesmírná stanice, na které pracoval i první Čechoslovák',
    Q217188: 'první sonda, která obíhala planetku a přistála na ní',
    Q1159913: 'první sonda, která unikla gravitaci Země a prolétla kolem Měsíce',
    Q858293: 'první automatická sonda, která přivezla vzorky z Měsíce',
    Q371939: 'sonda, která na Měsíc dopravila první dálkově řízené vozítko',
    Q657771: 'poslední sovětská sonda k Měsíci, přivezla vzorky jeho horniny',
    Q208984: 'první sonda, která úspěšně prolétla kolem jiné planety – Venuše',
    Q203805: 'první sonda, která pořídila snímky Marsu zblízka',
    Q203801: 'první sonda na oběžné dráze kolem jiné planety – Marsu',
    Q728292: 'sonda, která poslala první snímky z povrchu Venuše',
    Q372064: 'sonda, která poslala první barevné snímky z povrchu Venuše',
    Q1153267: 'sovětská sonda, která pustila balon do atmosféry Venuše a prolétla kolem Halleyovy komety',
    Q212131: 'druhý americký přistávací modul na Marsu (1976)',
    Q2156739: 'první indická sonda u Marsu, zvaná Mangalaján',
    Q18346001: 'čínská sonda, která jako první přivezla vzorky z odvrácené strany Měsíce',
    Q320638: 'evropsko-americká sluneční observatoř, která objevila tisíce komet',
    Q210889: 'evropská sonda, která zkoumala atmosféru Venuše',
    Q574464: 'sonda, která zanikla u Marsu kvůli záměně palců a centimetrů v programu',
    Q724913: 'první infračervený vesmírný dalekohled, který prozkoumal celou oblohu',
    Q54284: 'německý rentgenový vesmírný dalekohled',
    Q719789: 'třetí sovětská družice, první vědecká laboratoř na oběžné dráze',
    Q63350: 'evropská sonda na cestě k ledovým měsícům Jupiteru',
    Q1660590: 'americký přistávací modul, který měřil zemětřesení na Marsu',
    Q578497: 'evropský vesmírný dalekohled, který mapuje temnou hmotu a temnou energii',
    Q862558: 'americká sonda, která před dopadem poslala první detailní snímky Měsíce',
    Q1200061: 'soustava radioteleskopů v Kalifornii pro hledání signálů mimozemských civilizací',
    Q1323537: 'americký vesmírný dalekohled, který hledá exoplanety u blízkých jasných hvězd',
    Q49502: 'americká sonda, která vyzkoušela iontový motor'
};
// Názvy: upřesnění, kde český název ve Wikidatech nestačí (Jezero, Gale) nebo neodpovídá článku
const NAMES = {
    Q618164: 'Žebřík kosmických vzdáleností', Q912471: 'Einsteinův prstenec', Q914016: 'Kráter Jezero', Q622221: 'Kráter Gale', Q3863: 'Planetka',
    Q3339012: 'New Shepard', Q1024445: 'Starliner', Q236448: 'Dragon', Q221654: 'PSLV', Q249238: 'GSLV', Q52162: 'Program Mercury', Q47272: 'Kepler (sonda)',
    Q767805: 'Gaia (sonda)', Q660356: 'Giotto (sonda)', Q714789: 'Huygens (sonda)', Q725309: 'Planck (družice)', Q21076293: 'Lucy (sonda)',
    Q129091: 'Phoenix (sonda)', Q327075: 'MAVEN', Q672021: 'Observatoř Very Rubinové', Q105209621: 'Inspiration4'
};
// Rok, který Wikidata nemají; výrobce, který Wikidata uvádějí pod pozdějším jménem firmy (Stellantis místo Chrysleru)
const YEARS = { Q194082: 1967, Q275816: 1971, Q192144: 1961, Q849791: 1972 };
const NO_MAKER = new Set(['Q521076', 'Q719315', 'Q1192304', 'Q127924']);
// Fotka, kterou má i jiná položka (Obří černá díra – Černá díra, Sluneční koróna – Zatmění Slunce): u méně známé se nepoužije
const NO_IMAGE = new Set(['Q40392', 'Q170754']);
// Nikdy známé: pojmy, jejichž návštěvnost nafukuje jiný význam slova (deklinace v mluvnici, azimut v navigaci, paralaxa ve fotografii)
const NEVER_KNOWN = new Set(['Q13442', 'Q76287', 'Q124274', 'Q12134', 'Q165074', 'Q101038']);
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266']);
const FEMALE = 'Q6581072';
// Čeští astronomové a kosmonauti jsou známí, jen když je Češi opravdu čtou (návštěvnost článku za rok); pro experty nejsou nikdy
const CZECH_KNOWN_PV = 1000;

// Okruhy rozšíření (na konci seznamu okruhů). Nové okruhy misí zahrnou i dosavadní mise téhož druhu (jen přibude okruh, nic jiného se nemění)
export const EXTRA_COLLECTIONS = [
    { id: 'jevy-na-obloze', label: 'Jevy na obloze', text: 'Zatmění, slunovrat, úplněk, meteory, hvězdné obrazce…', test: item => item.c === 'astronomie' && ['jev', 'meteorický roj', 'hvězdný obrazec'].includes(item.ty) },
    { id: 'meteoricke-roje', label: 'Meteorické roje', text: 'Perseidy, Leonidy, Geminidy…', test: item => item.c === 'astronomie' && item.ty === 'meteorický roj' },
    { id: 'druhy-teles', label: 'Druhy vesmírných těles', text: 'Černá díra, exoplaneta, červený obr, kulová hvězdokupa…', test: item => item.c === 'astronomie' && item.ty === 'druh tělesa' },
    { id: 'oblasti-vesmiru', label: 'Oblasti vesmíru', text: 'Kuiperův pás, Oortův oblak, Místní skupina galaxií…', test: item => item.c === 'astronomie' && item.ty === 'oblast vesmíru' },
    { id: 'utvary-planet', label: 'Útvary na planetách a Měsíci', text: 'Olympus Mons, Velká rudá skvrna, Moře klidu…', test: item => item.c === 'astronomie' && item.ty === 'útvar' },
    { id: 'astronomicke-pojmy', label: 'Pojmy astronomie a kosmonautiky', text: 'Ekliptika, zenit, oběžná dráha, kosmická rychlost…', test: item => item.c === 'astronomie' && item.ty === 'pojem' },
    { id: 'nosne-rakety', label: 'Nosné rakety', text: 'V-2, Sojuz, Starship, Ariane…', sort: { by: 'year' }, test: item => item.c === 'rakety' && item.ty === 'raketa' },
    { id: 'kosmicke-lode', label: 'Kosmické lodě a raketoplány', text: 'Vostok, Sojuz, Challenger, Dragon…', sort: { by: 'year' }, test: item => item.c === 'rakety' && ['kosmická loď', 'raketoplán'].includes(item.ty) },
    { id: 'pilotovane-lety', label: 'Pilotované lety a stanice', text: 'Apollo, Vostok, Sojuz, Mir, Mezinárodní vesmírná stanice…', sort: { by: 'year' },
        test: item => item.c === 'mise' && ['pilotovaný let', 'kosmická stanice'].includes(item.ty) },
    { id: 'ceska-kosmonautika', label: 'Česká astronomie a kosmonautika', text: 'Remek, Hájek z Hájku, Magion, hvězdárny…',
        test: item => ['astronomove', 'mise'].includes(item.c) && item.cz === 1 }
].map(collection => ({ sort: { by: 'name' }, ...collection }));

// Okruhy stávajících kategorií (stejná pravidla jako COLLECTIONS v build-fyzika.mjs) pro nové položky misí a astronomů
const SPACE_KINDS = ['kosmická sonda', 'družice', 'kosmická loď', 'kosmický program', 'kosmická stanice', 'raketa', 'dalekohled', 'pilotovaný let', 'vozítko', 'kosmický let', 'družicová síť'];
const INSTRUMENT_KINDS = ['přístroj', 'urychlovač částic', 'observatoř', 'planetárium'];
const baseGroups = (item) => {
    if (item.c === 'mise') return SPACE_KINDS.includes(item.ty) ? ['kosmicke-mise'] : INSTRUMENT_KINDS.includes(item.ty) ? ['pristroje'] : [];
    if (item.c === 'astronomove') return [/kosmonaut/.test(item.ty) ? 'kosmonauti' : 'astronomove'];
    return [];
};

// --- Wikidata ---
const ALL_IDS = [...new Set([...ASTRONOMIE.map(([q]) => q), ...RAKETY.map(([q]) => q), ...MISE.map(([q]) => q), ...LIDE])];
export const EXTRA_IDS = new Set(ALL_IDS);
const SINGLE = { t: 1, n: 1, d: 1, im: 1, sl: 1, born: 1, died: 1, sex: 1, launch: 1, inc: 1, first: 1, start: 1 };
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
    `{ ?item wdt:P619 ?v BIND("launch" AS ?p) }`,
    `{ ?item wdt:P571 ?v BIND("inc" AS ?p) }`,
    `{ ?item wdt:P606 ?v BIND("first" AS ?p) }`,
    `{ ?item wdt:P580 ?v BIND("start" AS ?p) }`,
    `{ ?item wdt:P137 ?v BIND("op" AS ?p) }`,
    `{ ?item wdt:P176 ?v BIND("by" AS ?p) }`
];
const fetchDetails = () => cached(`fyzika-vesmir-details-${ALL_IDS.length}`, async () => {
    const result = new Map(ALL_IDS.map(qid => [qid, {}]));
    await inBatches(ALL_IDS, 80, (qids) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(qids)} } ${BRANCHES.join(' UNION ')} }`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = key === 'sl' ? Number(v) : v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    const referenced = [...new Set([...result.values()].flatMap(entry => [...(entry.cit || []), ...(entry.op || []), ...(entry.by || [])]))];
    const labels = {};
    await inBatches(referenced, 300, (qids) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
        (row) => { labels[id(row.item.value)] = row.l.value; }, qlever);
    return { details: [...result], labels };
});

// Q-id všech položek jiných témat (stejná položka nemá být ve dvou tématech)
const otherTopicIds = () => {
    const ids = new Map();
    const dir = new URL('../../data/', import.meta.url);
    const topics = readdirSync(new URL('../../topics/', import.meta.url)).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
    for (const topic of topics) {
        if (topic === 'fyzika') continue;
        let data;
        try { data = JSON.parse(readFileSync(new URL(`${topic}.json`, dir), 'utf8')); } catch { continue; }
        for (const item of data.items || []) if (item.q) ids.set(item.q, topic);
    }
    return ids;
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const firstYear = (detail) => [detail.first, detail.launch, detail.start, detail.inc].map(yearOf).find(year => year !== undefined);

// Sestaví nové položky (bez úrovní) nad dosavadními položkami tématu (existing): vynechá ID a názvy, které téma už má, a položky jiných témat
export const buildExtra = async ({ existing }) => {
    const { details: detailRows, labels } = await fetchDetails();
    const details = new Map(detailRows);
    const cs = (qid) => labels[qid];
    const other = otherTopicIds();
    const base = existing.filter(item => !EXTRA_IDS.has(item.q) || !isExtraItem(item));
    const haveIds = new Set(base.map(item => item.q));
    const names = new Set(base.map(item => item.n.toLowerCase()));
    const skipped = { other: [], have: [], missing: [], name: [] };
    const items = [];
    const add = (qid, make) => {
        const detail = { ...(details.get(qid) || {}), q: qid };
        if (other.has(qid)) { skipped.other.push(`${detail.t || qid} (${other.get(qid)})`); return; }
        if (haveIds.has(qid)) { skipped.have.push(detail.t || qid); return; }
        if (!detail.t) { skipped.missing.push(qid); return; }
        const item = make(detail);
        if (!item) { skipped.missing.push(`${detail.t} (${qid})`); return; }
        // Stejný název jako jiná položka tématu (Proton, Orion): název článku s upřesněním v závorce (Proton (nosná raketa))
        if (names.has(item.n.toLowerCase()) && /\(/.test(detail.t)) item.n = capitalize(detail.t);
        if (names.has(item.n.toLowerCase())) { skipped.name.push(item.n); return; }
        names.add(item.n.toLowerCase());
        haveIds.add(qid);
        items.push(compact({ ...item, _: { sl: detail.sl || 0, title: detail.t } }));
    };
    const nameOf = (detail, extra = {}) => extra.n || NAMES[detail.q] || capitalize(detail.n || detail.t.replace(/ \(.*\)$/, ''));
    const descOf = (detail, extra = {}) => extra.d || DESCRIPTIONS[detail.q] || detail.d;
    for (const [qid, ty, extra = {}] of ASTRONOMIE) {
        add(qid, (detail) => ({
            q: qid, t: detail.t, n: nameOf(detail, extra), c: 'astronomie', k: 0, ty, d: descOf(detail, extra),
            ...(NO_IMAGE.has(qid) ? {} : imageFields(detail.im)),
            f: compact({ max: extra.max, rad: extra.rad, from: extra.from, on: extra.on })
        }));
    }
    for (const [qid, ty, land, extra = {}] of RAKETY) {
        add(qid, (detail) => {
            if (!detail.im) return null;
            const year = extra.year ?? firstYear(detail);
            const maker = NO_MAKER.has(qid) ? undefined : (detail.by || []).map(cs).filter(Boolean)[0] || (detail.op || []).map(cs).filter(Boolean)[0];
            return {
                q: qid, t: detail.t, n: nameOf(detail, extra), c: 'rakety', k: 0, ty, d: descOf(detail, extra),
                ...imageFields(detail.im),
                f: compact({ land, year, by: maker, ns: extra.space === false ? 1 : undefined })
            };
        });
    }
    for (const [qid, ty, extra = {}] of MISE) {
        add(qid, (detail) => {
            if (!detail.im) return null;
            const operator = (detail.op || []).map(cs).filter(Boolean)[0];
            return {
                q: qid, t: detail.t, n: nameOf(detail, extra), c: 'mise', k: 0, ty, d: descOf(detail, extra), cz: extra.cz,
                ...imageFields(detail.im),
                f: compact({ year: YEARS[qid] ?? yearOf(detail.launch) ?? yearOf(detail.inc) ?? yearOf(detail.start), op: operator })
            };
        });
    }
    for (const qid of LIDE) {
        add(qid, (detail) => {
            const born = yearOf(detail.born);
            if (!detail.im || born === undefined) return null;
            const fix = LIDE_FIX[qid] || {};
            const kind = fix.k || /kosmonaut|astronaut|taikonaut|vesmírn\p{L}* turist/iu.test(detail.d || '') ? 'kosmonaut' : 'astronom';
            const female = detail.sex === FEMALE;
            const isCzech = Boolean(fix.cz) || (detail.cit || []).some(q => CZECH_STATES.has(q));
            return {
                q: qid, t: detail.t, n: detail.n || detail.t.replace(/ \(.*\)$/, ''), c: 'astronomove', k: 0,
                ty: kind === 'kosmonaut' ? (female ? 'kosmonautka' : 'kosmonaut') : (female ? 'astronomka' : 'astronom'), sx: female ? 'f' : undefined,
                d: fix.d || detail.d, cz: isCzech ? 1 : undefined,
                ...imageFields(detail.im),
                f: compact({ born, died: yearOf(detail.died), land: fix.land || landByDescription(detail.d, (detail.cit || []).map(cs)), y: born + 35 })
            };
        });
    }
    return { items, skipped };
};

// Položka rozšíření z dřívějšího běhu: nové sestavení ji nahradí (stejné id)
export const isExtraItem = (item) => EXTRA_CATEGORIES.includes(item.c) || (EXTRA_IDS.has(item.q) && ['mise', 'astronomove'].includes(item.c));

// --- Úrovně ---
const KNOWN_SHARE = { astronomie: 0.3, rakety: 0.3, mise: 0.25, astronomove: 0.15 };
const poolOf = (item) => item.c === 'astronomove' ? `astronomove|${/kosmonaut/.test(item.ty) ? 'kosmonaut' : 'astronom'}` : item.c;
// Pořadí známosti (0 = nejznámější) jako ve scripts/lib/veda-levels.mjs: průměr pořadí podle jazykových verzí a podle návštěvnosti
const rankWithin = (list) => {
    const rank = (key) => {
        const sorted = [...list].sort((a, b) => (b[key] || 0) - (a[key] || 0));
        return new Map(sorted.map((entry, index) => [entry, list.length > 1 ? index / (list.length - 1) : 0]));
    };
    const bySl = rank('sl');
    const byPv = rank('pv');
    return new Map(list.map(entry => [entry, entry.pv === undefined ? bySl.get(entry) : (bySl.get(entry) + byPv.get(entry)) / 2]));
};

// Nové kategorie: stejný postup jako v build-fyzika.mjs (podíl známých, spodní hranice okruhu, experti). Nové položky stávajících
// kategorií: pořadí mezi dosavadními položkami skupiny (jazykové verze a návštěvnost se dočtou), známé v nejznámějším KNOWN_SHARE,
// pro experty v nejméně známých EXPERT_SHARE; Češi podle návštěvnosti (CZECH_KNOWN_PV), pro experty nikdy
export const extraLevels = async (fresh, existing) => {
    const pageviews = await pageviewsByTitle('fyzika-vesmir-pageviews', fresh.map(item => item._.title));
    for (const item of fresh) item._.pv = pageviews[item._.title];
    const newCategory = fresh.filter(item => EXTRA_CATEGORIES.includes(item.c));
    for (const item of newCategory) Object.assign(item._, { pool: item.c, fixed: false, never: NEVER_KNOWN.has(item.q) });
    const groups = [...EXTRA_COLLECTIONS.map(collection => ({ id: collection.id, members: newCategory.filter(item => collection.test(item)) })),
        ...EXTRA_CATEGORIES.map(category => ({ id: `kategorie ${category}`, members: newCategory.filter(item => item.c === category) }))].filter(group => group.members.length);
    const promoted = assignLevels(newCategory, { groups, knownShare: pool => KNOWN_SHARE[pool], ceiling: item => item._.pct <= 0.55 || (item._.pv || 0) >= 8000 });
    // Stávající kategorie: dosavadní položky skupiny (jen ke srovnání, jejich úroveň se nemění)
    const inOld = fresh.filter(item => !EXTRA_CATEGORIES.includes(item.c));
    const pools = [...new Set(inOld.map(poolOf))];
    const reference = existing.filter(item => pools.includes(poolOf(item)));
    const refSl = new Map(await cached(`fyzika-vesmir-ref-sl-${reference.length}`, async () => {
        const rows = [];
        await inBatches(reference.map(item => item.q), 300, (qids) => `SELECT ?item ?sl WHERE { VALUES ?item { ${values(qids)} } ?item wikibase:sitelinks ?sl }`,
            (row) => rows.push([id(row.item.value), Number(row.sl.value)]), qlever);
        return rows;
    }));
    const refPv = await pageviewsByTitle('fyzika-pageviews', reference.map(item => item.t));
    for (const pool of pools) {
        const old = reference.filter(item => poolOf(item) === pool).map(item => ({ sl: refSl.get(item.q) || 0, pv: refPv[item.t], item, old: true }));
        const added = inOld.filter(item => poolOf(item) === pool).map(item => ({ sl: item._.sl, pv: item._.pv, item }));
        const pct = rankWithin([...old, ...added]);
        for (const entry of added) {
            const item = entry.item;
            const p = pct.get(entry);
            item._.pct = p;
            delete item.x;
            if (item.cz) { item.k = (item._.pv || 0) >= CZECH_KNOWN_PV ? 1 : 0; continue; }
            item.k = p <= KNOWN_SHARE[item.c] ? 1 : 0;
            if (!item.k && p >= 1 - EXPERT_SHARE) item.x = 1;
        }
    }
    return promoted;
};

// Sloučí rozšíření do dat tématu: dosavadní položky beze změny (jen okruhy rozšíření navíc), nové položky na konec, okruhy na konec seznamu.
// Položky rozšíření z dřívějšího běhu nahradí nové sestavení (stejné id); ty, které nový běh nenašel, zůstanou (žádné id nezmizí)
export const mergeExtra = async ({ collections, items }, extra) => {
    const fresh = extra.items;
    const freshIds = new Set(fresh.map(item => item.q));
    const kept = items.filter(item => !(isExtraItem(item) && freshIds.has(item.q)));
    const promoted = await extraLevels(fresh, kept.filter(item => !EXTRA_IDS.has(item.q)));
    for (const item of fresh) item.g = [...new Set([...baseGroups(item), ...EXTRA_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id)])];
    const all = [...kept, ...fresh];
    // Nové okruhy rozšíření i u dosavadních položek (pilotované lety, česká kosmonautika)
    for (const item of kept) {
        const add = EXTRA_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id).filter(group => !(item.g || []).includes(group));
        if (add.length) item.g = [...(item.g || []), ...add];
    }
    // Spodní hranice známých v okruzích s novými položkami (stejná jako v build-fyzika.mjs): doplní se jen nové položky, nejznámější
    // napřed a jen dost známé (lepší polovina skupiny nebo návštěvnost); úroveň dosavadních položek se nemění
    for (const group of new Set(fresh.flatMap(item => item.g))) {
        const members = all.filter(item => (item.g || []).includes(group));
        let known = members.filter(item => item.k === 1).length;
        const rest = fresh.filter(item => item.g.includes(group) && item.k !== 1 && !item._.never && (item._.pct <= 0.55 || (item._.pv || 0) >= 8000))
            .sort((a, b) => a._.pct - b._.pct);
        for (const item of rest) {
            if (known >= knownFloor(members.length)) break;
            item.k = 1;
            delete item.x;
            known++;
            promoted.push([group, item.n]);
        }
    }
    // Nejvýš 45 % okruhu pro experty: nejznámější z nových expertních položek zůstanou v úrovni Mudrlant
    for (const group of new Set(fresh.flatMap(item => item.g || []))) {
        const members = all.filter(item => (item.g || []).includes(group));
        const excess = members.filter(item => item.x).length - Math.floor(members.length * EXPERT_MAX_SHARE);
        const movable = fresh.filter(item => item.x && (item.g || []).includes(group)).sort((a, b) => a._.pct - b._.pct);
        for (const item of movable.slice(0, Math.max(0, excess))) delete item.x;
    }
    for (const item of fresh) { delete item._; if (!item.g.length) delete item.g; }
    const stale = items.filter(item => EXTRA_CATEGORIES.includes(item.c) && !freshIds.has(item.q));
    if (stale.length) console.warn(`  rozšíření: ${stale.length} dřívějších položek nový běh nenašel, zůstávají (${stale.slice(0, 5).map(item => item.n).join(', ')}…)`);
    const ids = new Set(EXTRA_COLLECTIONS.map(collection => collection.id));
    return {
        collections: [...collections.filter(collection => !ids.has(collection.id)), ...EXTRA_COLLECTIONS.map(({ test, ...collection }) => collection)],
        items: all,
        promoted
    };
};

// Přehled pro výpis: počty a úrovně v nových kategoriích a okruzích, vynechané položky
export const extraSummary = (items, skipped) => {
    for (const category of [...EXTRA_CATEGORIES, 'mise', 'astronomove']) {
        const list = items.filter(item => item.c === category && (EXTRA_CATEGORIES.includes(category) || EXTRA_IDS.has(item.q)));
        console.log(`${category}: nových ${list.length} (známých ${list.filter(item => item.k === 1).length}, expert ${list.filter(item => item.x).length})`);
    }
    for (const collection of EXTRA_COLLECTIONS) {
        const members = items.filter(item => (item.g || []).includes(collection.id));
        const knownCount = members.filter(item => item.k === 1).length;
        console.log(`  okruh ${collection.id}: ${members.length} (známých ${knownCount}, expert ${members.filter(item => item.x).length})${knownCount < knownFloor(members.length) ? ' – POD SPODNÍ HRANICÍ' : ''}`);
    }
    if (skipped) {
        if (skipped.other.length) console.log(`  vynecháno, už je v jiném tématu: ${skipped.other.join(', ')}`);
        if (skipped.have.length) console.log(`  vynecháno, Fyzika už má: ${skipped.have.join(', ')}`);
        if (skipped.missing.length) console.log(`  vynecháno, chybí článek, fotka nebo údaje: ${skipped.missing.join(', ')}`);
        if (skipped.name.length) console.log(`  vynecháno, název už téma má: ${skipped.name.join(', ')}`);
    }
};
