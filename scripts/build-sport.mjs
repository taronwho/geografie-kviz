// Téma Sport: data/sport.json z Wikidat – sportovci, olympijské hry, sporty a disciplíny
// Spuštění: npm run build:sport (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { sparql, qlever, id, values, parsePoint, fileName, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';

const HUMAN = 'Q5';
const FEMALE = 'Q6581072';
const SUMMER = 'Q159821';
const WINTER = 'Q82414';
const MEDALS = { Q15243387: 'gold', Q15889641: 'silver', Q15889643: 'bronze' };
// Česko, Československo a České království (sportovci reprezentující české země)
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585']);
const THIS_YEAR = new Date().getFullYear();

// --- Olympijské hry: pořadatelská města podle tabulky (P276 ve Wikidatech míchá města se sportovišti) ---
// [ID her, rok, L/Z, pořadatelská města, další dějiště (nesmí být mezi nesprávnými možnostmi)]
// Zrušené hry (1916, 1940, 1944) chybí, budoucí taky
const GAMES = [
    ['Q8080', 1896, 'L', ['Q1524']], ['Q8088', 1900, 'L', ['Q90']], ['Q8098', 1904, 'L', ['Q38022']], ['Q8111', 1908, 'L', ['Q84']],
    ['Q8118', 1912, 'L', ['Q1754']], ['Q8128', 1920, 'L', ['Q12892']], ['Q8132', 1924, 'L', ['Q90']], ['Q8138', 1928, 'L', ['Q727']],
    ['Q8143', 1932, 'L', ['Q65']], ['Q8150', 1936, 'L', ['Q64']], ['Q8403', 1948, 'L', ['Q84']], ['Q8407', 1952, 'L', ['Q1757']],
    // Jezdecké soutěže v roce 1956 byly kvůli karanténě koní ve Stockholmu
    ['Q8411', 1956, 'L', ['Q3141'], ['Q1754']], ['Q8415', 1960, 'L', ['Q220']], ['Q8420', 1964, 'L', ['Q1490']], ['Q8429', 1968, 'L', ['Q1489']],
    ['Q8438', 1972, 'L', ['Q1726']], ['Q8444', 1976, 'L', ['Q340']], ['Q8450', 1980, 'L', ['Q649']], ['Q8456', 1984, 'L', ['Q65']],
    ['Q8470', 1988, 'L', ['Q8684']], ['Q8488', 1992, 'L', ['Q1492']], ['Q8531', 1996, 'L', ['Q23556']], ['Q8544', 2000, 'L', ['Q3130']],
    ['Q8558', 2004, 'L', ['Q1524']], ['Q8567', 2008, 'L', ['Q956']], ['Q8577', 2012, 'L', ['Q84']], ['Q8613', 2016, 'L', ['Q8678']],
    ['Q181278', 2020, 'L', ['Q1490']], ['Q995653', 2024, 'L', ['Q90']],
    ['Q9583', 1924, 'Z', ['Q83236']], ['Q9591', 1928, 'Z', ['Q68986']], ['Q9596', 1932, 'Z', ['Q192700']], ['Q9600', 1936, 'Z', ['Q127043']],
    ['Q9615', 1948, 'Z', ['Q68986']], ['Q9623', 1952, 'Z', ['Q585']], ['Q9632', 1956, 'Z', ['Q41158']], ['Q9634', 1960, 'Z', ['Q822230']],
    ['Q9636', 1964, 'Z', ['Q1735']], ['Q9642', 1968, 'Z', ['Q1289']], ['Q9646', 1972, 'Z', ['Q37951']], ['Q9651', 1976, 'Z', ['Q1735']],
    ['Q9652', 1980, 'Z', ['Q192700']], ['Q9657', 1984, 'Z', ['Q11194']], ['Q9658', 1988, 'Z', ['Q36312']], ['Q9660', 1992, 'Z', ['Q159469']],
    ['Q9663', 1994, 'Z', ['Q101341']], ['Q9664', 1998, 'Z', ['Q128849']], ['Q9668', 2002, 'Z', ['Q23337']], ['Q9672', 2006, 'Z', ['Q495']],
    ['Q9674', 2010, 'Z', ['Q24639']], ['Q9678', 2014, 'Z', ['Q39420']], ['Q9680', 2018, 'Z', ['Q188624']], ['Q193074', 2022, 'Z', ['Q956']],
    ['Q4630399', 2026, 'Z', ['Q490', 'Q41158']]
].filter(([, year]) => year <= THIS_YEAR);
// Jak se pořadatelská města u nás běžně jmenují (Wikidata mají Olympic Valley, Chamonix-Mont-Blanc) a další přijímané názvy
const CITY_NAMES = {
    Q83236: ['Chamonix', 'Chamonix-Mont-Blanc'], Q822230: ['Squaw Valley', 'Olympic Valley'], Q68986: ['Svatý Mořic', 'St. Moritz', 'Sankt Moritz'],
    Q1489: ['Ciudad de México', 'Mexiko', 'Mexico City'], Q41158: ['Cortina d’Ampezzo', 'Cortina d’Ampezzo', 'Cortina'], Q188624: ['Pchjongčchang', 'Pyeongchang'],
    Q1726: ['Mnichov', 'München'], Q956: ['Peking', 'Beijing'], Q8684: ['Soul', 'Seoul'], Q1490: ['Tokio', 'Tokyo'], Q1757: ['Helsinky', 'Helsinki'],
    Q12892: ['Antverpy', 'Antwerpen'], Q1524: ['Athény', 'Atény', 'Athens'], Q220: ['Řím', 'Roma'], Q495: ['Turín', 'Turin', 'Torino'],
    Q39420: ['Soči', 'Sochi'], Q38022: ['St. Louis', 'Saint Louis'], Q340: ['Montréal', 'Montreal'], Q127043: ['Garmisch-Partenkirchen', 'Garmisch'],
    Q101341: ['Lillehammer'], Q649: ['Moskva'], Q84: ['Londýn'], Q90: ['Paříž'], Q64: ['Berlín'], Q490: ['Milán', 'Milano'], Q585: ['Oslo']
};

// --- Sporty a disciplíny: vybrané sporty s jasnou fotkou; štítky určují podobné sporty (nesprávné možnosti) a okruhy ---
// mic = míčová hra, tym = kolektivní, raketa, zima, led, snih, boj, voda, lod, atletika, gym, kolo, motor, presnost, sila, kun, venku;
// x… = sporty, které se na fotce dají splést (plavání a kraul, lezení a bouldering) – nikdy nejsou spolu mezi možnostmi.
// Bez sportů, jejichž fotka sport neukazuje (kendó má jen znaky, štafeta vypadá jako sprint, kickbox jako box)
const SPORTS = {
    Q2736: 'mic tym branka', Q5372: 'mic tym kos', Q1734: 'mic tym sit', Q8418: 'mic tym branka', Q5378: 'mic tym ovalny', Q41323: 'mic tym ovalny',
    Q5369: 'mic tym palka', Q171038: 'mic tym palka', Q5375: 'mic tym palka', Q7707: 'mic tym branka voda', Q1455: 'mic tym hokejka branka',
    Q4543: 'mic sit', Q171401: 'mic tym branka', Q206763: 'tym hokejka branka', Q185851: 'mic tym hokejka branka', Q192937: 'mic tym kos',
    Q231200: 'mic tym kos', Q50776: 'mic tym ovalny', Q204632: 'mic tym', Q213711: 'mic tym hokejka', Q188818: 'mic sit', Q134211: 'mic tym hokejka kun',
    Q210778: 'mic tym branka', Q690676: 'mic tym voda lod', Q1050588: 'mic sit', Q183018: 'tym hokejka zima led', Q41466: 'tym hokejka zima led branka',
    Q946171: 'tym hokejka branka', Q8099087: 'mic tym kolo', Q244700: 'tym', Q1295867: 'mic tym palka',
    Q847: 'raketa sit mic', Q3930: 'raketa sit mic', Q7291: 'raketa sit', Q133201: 'raketa mic',
    Q186222: 'zima lyze snih', Q179687: 'zima lyze snih', Q7718: 'zima lyze snih', Q166788: 'zima lyze snih', Q178131: 'zima snih',
    Q189472: 'zima lyze snih', Q38108: 'zima led brusle', Q192431: 'zima led brusle', Q193654: 'zima led brusle',
    Q136851: 'zima led presnost', Q177275: 'zima led draha', Q186190: 'zima led draha', Q273285: 'zima led draha',
    Q32112: 'boj', Q11420: 'boj', Q11419: 'boj', Q36389: 'boj', Q42486: 'boj', Q40561: 'boj', Q12100: 'boj zbran', Q114466: 'boj', Q106500: 'boj',
    Q31920: 'voda plavani xplav', Q7735: 'voda plavani', Q180692: 'voda plavani', Q159354: 'voda lod', Q31874: 'voda lod', Q1141850: 'voda lod',
    Q14085739: 'voda lod vitr', Q191051: 'voda vitr prkno', Q159992: 'voda prkno', Q472827: 'voda prkno',
    Q376040: 'voda prkno', Q207238: 'voda lod', Q392409: 'voda plavani',
    Q828185: 'voda plavani styl xplav', Q326163: 'voda plavani styl xplav', Q245249: 'voda plavani styl xplav', Q275115: 'voda plavani styl xplav',
    Q164761: 'atletika beh xbeh', Q40244: 'atletika beh xbeh', Q537769: 'atletika beh', Q202391: 'atletika beh',
    Q165704: 'atletika skok', Q170737: 'atletika skok', Q185027: 'atletika skok', Q187204: 'atletika skok',
    Q178108: 'atletika hod', Q180935: 'atletika hod', Q182570: 'atletika hod', Q184865: 'atletika hod', Q10980: 'vytrvalost kolo voda xplav xkolo xbeh',
    Q326827: 'gym', Q61465: 'gym',
    Q3609: 'kolo xkolo', Q221635: 'kolo', Q335638: 'kolo', Q215184: 'kolo',
    Q1968: 'motor', Q7856: 'motor', Q215862: 'motor', Q750080: 'motor',
    Q5377: 'presnost mic', Q108429: 'presnost strelba', Q206989: 'presnost strelba', Q172809: 'presnost mic xbowl', Q706199: 'presnost mic xbowl',
    Q131471: 'presnost', Q3341285: 'presnost mic', Q189317: 'presnost mic xkoule', Q193387: 'presnost mic', Q895471: 'presnost mic xkoule', Q754796: 'presnost mic',
    Q83462: 'sila xcinka', Q124100: 'sila', Q213796: 'sila xcinka', Q102843: 'sila tym',
    Q187916: 'kun', Q211773: 'kun', Q207703: 'kun',
    Q1154336: 'venku lezeni xlez', Q1541373: 'venku lezeni xlez', Q852989: 'venku lezeni xlez', Q193210: 'venku vzduch', Q178380: 'venku vzduch',
    Q193847: 'venku vzduch', Q842284: 'prkno', Q483693: 'venku', Q624161: 'venku vzduch', Q169737: 'tanec', Q61391: 'tanec gym'
};
const SPORT_IDS = Object.keys(SPORTS);

// --- Sportovci: sporty (podle P641 a povolání), kolik nejznámějších vzít a kolik je „známých“ ---
// label = odpověď na „Ve kterém sportu se proslavil?“, man/woman = druh sportovce, tags = podobné sporty
const BUCKETS = {
    fotbal: { ids: ['Q2736'], label: 'fotbal', man: 'fotbalista', woman: 'fotbalistka', tags: 'mic tym', limit: 150, known: 40, cz: 40 },
    hokej: { ids: ['Q41466'], label: 'lední hokej', man: 'hokejista', woman: 'hokejistka', tags: 'zima led tym', limit: 70, known: 14, cz: 45 },
    tenis: { ids: ['Q847'], label: 'tenis', man: 'tenista', woman: 'tenistka', tags: 'raketa mic', limit: 80, known: 24, cz: 30 },
    atletika: {
        ids: ['Q542', 'Q40244', 'Q164761', 'Q180935', 'Q178108', 'Q165704', 'Q185027', 'Q184654', 'Q182570', 'Q184865', 'Q187204', 'Q202391',
            'Q537769', 'Q243264', 'Q334734', 'Q271008', 'Q191691', 'Q170737'],
        label: 'atletika', man: 'atlet', woman: 'atletka', tags: 'leto beh', limit: 90, known: 20, cz: 30
    },
    basketbal: { ids: ['Q5372'], label: 'basketbal', man: 'basketbalista', woman: 'basketbalistka', tags: 'mic tym', limit: 35, known: 8, cz: 6 },
    cyklistika: { ids: ['Q2215841', 'Q3609', 'Q221635', 'Q520611', 'Q335638', 'Q53121'], label: 'cyklistika', man: 'cyklista', woman: 'cyklistka', tags: 'leto kolo', limit: 30, known: 5, cz: 8 },
    auto: { ids: ['Q5386', 'Q1968', 'Q7856', 'Q9340418'], label: 'automobilové závody', man: 'automobilový závodník', woman: 'automobilová závodnice', tags: 'motor', limit: 35, known: 9, cz: 5 },
    moto: { ids: ['Q328716', 'Q215862', 'Q750080'], label: 'motocyklové závody', man: 'motocyklový závodník', woman: 'motocyklová závodnice', tags: 'motor', limit: 8, known: 1, cz: 3 },
    plavani: { ids: ['Q31920'], label: 'plavání', man: 'plavec', woman: 'plavkyně', tags: 'voda leto', limit: 30, known: 6, cz: 4 },
    box: { ids: ['Q32112'], label: 'box', man: 'boxer', woman: 'boxerka', tags: 'boj', limit: 22, known: 7, cz: 2 },
    alpske: { ids: ['Q186222'], label: 'alpské lyžování', man: 'lyžař', woman: 'lyžařka', tags: 'zima snih lyze', limit: 22, known: 4, cz: 6 },
    bezky: { ids: ['Q179687'], label: 'běh na lyžích', man: 'běžec na lyžích', woman: 'běžkyně na lyžích', tags: 'zima snih lyze', limit: 14, known: 2, cz: 6 },
    skoky: { ids: ['Q7718'], label: 'skoky na lyžích', man: 'skokan na lyžích', woman: 'skokanka na lyžích', tags: 'zima snih lyze', limit: 12, known: 1, cz: 6 },
    biatlon: { ids: ['Q166788'], label: 'biatlon', man: 'biatlonista', woman: 'biatlonistka', tags: 'zima snih lyze', limit: 14, known: 2, cz: 10 },
    rychlobrusleni: { ids: ['Q192431', 'Q193654'], label: 'rychlobruslení', man: 'rychlobruslař', woman: 'rychlobruslařka', tags: 'zima led brusle', limit: 10, known: 1, cz: 3 },
    krasobrusleni: { ids: ['Q38108'], label: 'krasobruslení', man: 'krasobruslař', woman: 'krasobruslařka', tags: 'zima led brusle', limit: 12, known: 2, cz: 6 },
    snowboard: { ids: ['Q178131'], label: 'snowboarding', man: 'snowboardista', woman: 'snowboardistka', tags: 'zima snih', limit: 6, known: 1, cz: 4 },
    akrobaticke: { ids: ['Q189472'], label: 'akrobatické lyžování', man: 'akrobatický lyžař', woman: 'akrobatická lyžařka', tags: 'zima snih lyze', limit: 4, known: 0, cz: 2 },
    gymnastika: { ids: ['Q326827', 'Q43450', 'Q61465', 'Q465014'], label: 'gymnastika', man: 'gymnasta', woman: 'gymnastka', tags: 'gym leto', limit: 22, known: 4, cz: 8 },
    golf: { ids: ['Q5377'], label: 'golf', man: 'golfista', woman: 'golfistka', tags: 'presnost', limit: 10, known: 3, cz: 1 },
    baseball: { ids: ['Q5369'], label: 'baseball', man: 'baseballista', woman: 'baseballistka', tags: 'mic tym palka', limit: 8, known: 2, cz: 0 },
    americky: { ids: ['Q41323'], label: 'americký fotbal', man: 'hráč amerického fotbalu', woman: 'hráčka amerického fotbalu', tags: 'mic tym', limit: 8, known: 2, cz: 0 },
    serm: { ids: ['Q12100'], label: 'šerm', man: 'šermíř', woman: 'šermířka', tags: 'boj', limit: 6, known: 0, cz: 2 },
    judo: { ids: ['Q11420'], label: 'judo', man: 'judista', woman: 'judistka', tags: 'boj', limit: 6, known: 0, cz: 3 },
    mma: { ids: ['Q114466'], label: 'smíšená bojová umění', man: 'zápasník MMA', woman: 'zápasnice MMA', tags: 'boj', limit: 6, known: 1, cz: 3 },
    zapas: { ids: ['Q42486', 'Q838089', 'Q389654', 'Q327223'], label: 'zápas', man: 'zápasník', woman: 'zápasnice', tags: 'boj', limit: 5, known: 0, cz: 3 },
    hazena: { ids: ['Q8418'], label: 'házená', man: 'házenkář', woman: 'házenkářka', tags: 'mic tym', limit: 6, known: 0, cz: 5 },
    volejbal: { ids: ['Q1734', 'Q4543'], label: 'volejbal', man: 'volejbalista', woman: 'volejbalistka', tags: 'mic tym', limit: 6, known: 0, cz: 4 },
    veslovani: { ids: ['Q159354'], label: 'veslování', man: 'veslař', woman: 'veslařka', tags: 'voda lod', limit: 5, known: 0, cz: 4 },
    kanoistika: { ids: ['Q20856109', 'Q213934', 'Q31874', 'Q1141850'], label: 'kanoistika', man: 'kanoista', woman: 'kanoistka', tags: 'voda lod', limit: 5, known: 0, cz: 10 },
    strelba: { ids: ['Q206989'], label: 'sportovní střelba', man: 'sportovní střelec', woman: 'sportovní střelkyně', tags: 'presnost', limit: 4, known: 0, cz: 5 },
    stolni: { ids: ['Q3930'], label: 'stolní tenis', man: 'stolní tenista', woman: 'stolní tenistka', tags: 'raketa mic', limit: 4, known: 0, cz: 2 },
    badminton: { ids: ['Q7291'], label: 'badminton', man: 'badmintonista', woman: 'badmintonistka', tags: 'raketa', limit: 4, known: 0, cz: 1 },
    snooker: { ids: ['Q11015', 'Q3341285'], label: 'snooker', man: 'hráč snookeru', woman: 'hráčka snookeru', tags: 'presnost', limit: 6, known: 1, cz: 0 },
    kriket: { ids: ['Q5375'], label: 'kriket', man: 'hráč kriketu', woman: 'hráčka kriketu', tags: 'mic tym palka', limit: 4, known: 1, cz: 0 },
    ragby: { ids: ['Q5378', 'Q5849'], label: 'ragby', man: 'ragbista', woman: 'ragbistka', tags: 'mic tym', limit: 4, known: 0, cz: 0 },
    lezeni: { ids: ['Q1541373', 'Q22857'], label: 'sportovní lezení', man: 'lezec', woman: 'lezkyně', tags: 'venku', limit: 3, known: 0, cz: 2 },
    jezdectvi: { ids: ['Q902378', 'Q211773', 'Q187916'], label: 'jezdectví', man: 'jezdec', woman: 'jezdkyně', tags: 'kun', limit: 4, known: 0, cz: 2 },
    triatlon: { ids: ['Q10980'], label: 'triatlon', man: 'triatlonista', woman: 'triatlonistka', tags: 'vytrvalost', limit: 3, known: 0, cz: 2 },
    vzpirani: { ids: ['Q83462'], label: 'vzpírání', man: 'vzpěrač', woman: 'vzpěračka', tags: 'sila', limit: 4, known: 0, cz: 1 },
    skoky_do_vody: { ids: ['Q7735'], label: 'skoky do vody', man: 'skokan do vody', woman: 'skokanka do vody', tags: 'voda', limit: 3, known: 0, cz: 1 },
    jachting: { ids: ['Q14085739'], label: 'jachting', man: 'jachtař', woman: 'jachtařka', tags: 'voda lod', limit: 3, known: 0, cz: 1 },
    florbal: { ids: ['Q206763'], label: 'florbal', man: 'florbalista', woman: 'florbalistka', tags: 'tym hokejka', limit: 0, known: 0, cz: 2 }
};
const BUCKET_OF = new Map(Object.entries(BUCKETS).flatMap(([key, bucket]) => bucket.ids.map(qid => [qid, key])));
const ATHLETE_SPORTS = [...BUCKET_OF.keys()];

// Povolání, která sportovce nedělají (trenér, rozhodčí, funkcionář) – kdo má jen je, není sportovec
const NOT_ATHLETE = /trenér|rozhodčí|funkcionář|manažer|komentátor|novinář|podnikatel|majitel|promotér|zakladatel|šéf|lékař|politik|herec|herečka/u;
// Povolání kolem sportu, která se při posuzování „hlavně sportovec“ nepočítají (bývalí sportovci často trénují)
const COACH = /trenér|rozhodčí|funkcionář|manažer|komentátor/u;
// Obecná sportovní povolání (sportovec, olympionik, atlet)
const GENERIC_ATHLETE = new Set(['Q2066131', 'Q50995749', 'Q58825429', 'Q11513337']);
// Slavní hlavně něčím jiným, i když je Wikidata vedou jako sportovce
const NOT_ATHLETES = new Set(['Ivana Trumpová', 'Charlene, kněžna monacká', 'Joseph Campbell', 'Philip Noel-Baker', 'Enzo Ferrari']);
// Sport v popisu („česká rychlobruslařka a cyklistka“): platí ten, který popis uvádí první; u shody na stejném místě
// rozhoduje pořadí (stolní tenis před tenisem, americký fotbal před fotbalem, běžec na lyžích před atletem)
const DESCRIPTION_SPORTS = [
    ['stolni', /stolní tenis/u], ['americky', /amerického fotbalu|americký fotbal/u], ['skoky_do_vody', /skok\p{L}* do vody/u],
    ['skoky', /skok\p{L}* na lyžích/u], ['bezky', /běž\p{L}* na lyžích|běžeck\p{L}* lyžař/u], ['akrobaticke', /akrobatick\p{L}* lyžař/u],
    ['fotbal', /fotbal/u], ['hokej', /hokej/u], ['tenis', /tenis/u],
    ['atletika', /atlet|sprint|oštěp|koulař|diskař|kladivář|desetiboj|sedmiboj|maraton|chodec|chodkyně|překážk|tyčkař|výškař|dálkař|trojskok|běž(?:ec|kyně)(?! na lyžích)/u],
    ['basketbal', /basketbal/u], ['cyklistika', /cyklist/u], ['auto', /automobil|formul|rallye|závodní jezd|pilot/u],
    ['moto', /motocykl|plochodrážní|motokros/u], ['plavani', /plav/u], ['box', /boxer|boxu|box(?!\p{L})/u],
    ['alpske', /lyžař|sjezdař|slalom/u], ['biatlon', /biatlon/u], ['rychlobrusleni', /rychlobrusl|short track/u], ['krasobrusleni', /krasobrusl/u],
    ['snowboard', /snowboard/u], ['sane', /bobist|sáňk|skeleton|saních|bobech/u], ['gymnastika', /gymnast/u], ['golf', /golf/u],
    ['baseball', /baseball/u], ['serm', /šerm/u], ['judo', /judist|juda|judo/u], ['mma', /MMA|smíšen/u], ['zapas', /zápasn/u],
    ['hazena', /házen/u], ['volejbal', /volejbal/u], ['veslovani', /vesla[řrř]|veslov/u], ['kanoistika', /kanoist|vodní slalom|kajak|deblkan/u],
    ['strelba', /střel/u], ['badminton', /badminton/u], ['snooker', /snooker|kulečník/u], ['kriket', /kriket/u], ['ragby', /ragby|rugby/u],
    ['lezeni', /lezec|lezkyně|lezen/u], ['jezdectvi', /jezdec|jezdkyně|parkur|drezur|žokej/u], ['triatlon', /triatlon/u],
    ['vzpirani', /vzpěr/u], ['jachting', /jacht/u], ['florbal', /florbal/u]
];
// Popis začíná jiným povoláním (herec, spisovatel, politik, trenér) – slavný je hlavně jinak než sportem
const NOT_SPORT_FAME = /herec|herečka|spisovatel|politi|prezident|premiér|ministr|zpěvák|zpěvačka|podnikatel|král|královna|kníže|princ|filozof|fyzik|vědec|novinář|moderátor|hudebník|houslist|režisér|kosmonaut|astronaut|model(?:ka)?(?!\p{L})|konstruktér|šlechtic|diplomat|voják|generál|malíř|básník|komik|rapper|scenárist|producent|wrestler|trenér|funkcionář|rozhodčí|manažer|komentátor|duchovní|kněz|lékař|právník|inženýr|vynálezce|letec|cestovatel|polárník|zpěv/u;
const ATHLETE_NOUN = /ist(?:a|ka)(?!\p{L})|hráč|atlet|plav[ec]|plavkyně|běž(?:ec|kyně)|skokan|lyžař|bruslař|závodn|jezd(?:ec|kyně)|boxer|gymnast|šermíř|zápasn|vesla[řr]|kanoist|střel(?:ec|kyně)|pilot|tyčkař|oštěpař|koulař|diskař|kladivář|desetibojař|sedmibojař|vícebojař|kajakář|slalomář|maratonec|maratonkyně|sprinter|lezec|lezkyně|brankář|útočník|obránce|záložník|olympi|sportov|reprezentant|cyklist|mistr|šampion|vítěz|judist|bojovník|vzpěrač|jachtař|žokej/u;
// Je to sportovec a jaký je jeho hlavní sport (podle popisu, jinak podle počtu údajů)? null = slavný hlavně něčím jiným
const mainBucket = (description, buckets) => {
    const text = (description || '').toLocaleLowerCase('cs');
    const found = DESCRIPTION_SPORTS.map(([key, pattern], order) => ({ key, at: text.search(pattern), order }))
        .filter(entry => entry.at >= 0)
        .sort((a, b) => a.at - b.at || a.order - b.order);
    return found.length ? found[0].key : buckets[0];
};
// Popis ho představuje jako sportovce: sportovní povolání v něm je a nepředchází mu jiné (trenér ano – Železný je
// „trenér atletiky, oštěpař“; čistý trenér bez sportovního povolání v popisu ne)
const describedAsAthlete = (description) => {
    const text = (description || '').toLocaleLowerCase('cs');
    const athleteAt = text.search(ATHLETE_NOUN);
    const otherAt = text.search(NOT_SPORT_FAME);
    return athleteAt >= 0 && !(otherAt >= 0 && otherAt < athleteAt && !/^(trenér|funkcionář|rozhodčí|manažer|komentátor)/u.test(text.slice(otherAt)));
};
// Sportovec, který je slavný hlavně sportem: popis ho tak představuje a aspoň čtvrtina povolání je sportovních,
// nebo jsou sportovní aspoň dvě třetiny povolání (Camus, Ivana Trumpová ani Henry Ford sem nepatří)
const isMainlyAthlete = (detail, sportOccupationIds) => {
    const occupations = (detail.occ || []).filter(q => !COACH.test(labels.get(q) ? labels.get(q).n : ''));
    const share = occupations.length ? occupations.filter(q => sportOccupationIds.has(q)).length / occupations.length : 1;
    if (!detail.d) return share >= 0.5;
    return (describedAsAthlete(detail.d) && share >= 0.25) || share >= 0.67;
};

// --- 1. krok: olympijské hry ---
const gameIds = GAMES.map(([qid]) => qid);
const hostIds = [...new Set(GAMES.flatMap(([, , , hosts, also = []]) => [...hosts, ...also]))];
const gamesDetails = new Map(await cached('sport-games', async () => {
    const result = new Map(gameIds.map(qid => [qid, { athletes: [], nations: [] }]));
    const rows = await sparql(`SELECT ?item ?p ?v ?qv WHERE {
  VALUES ?item { ${values(gameIds)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P580 ?v BIND("start" AS ?p) }
  UNION { ?item wdt:P582 ?v BIND("end" AS ?p) }
  UNION { ?item wdt:P542 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("opened" AS ?p) }
  UNION { ?item wdt:P545 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("flame" AS ?p) }
  UNION { ?item p:P1132 ?s . ?s ps:P1132 ?v . OPTIONAL { ?s pq:P11279 ?qv } BIND("count" AS ?p) }
}`);
    for (const row of rows) {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const v = row.v.value;
        if (key === 'count') {
            const kind = row.qv ? id(row.qv.value) : '';
            const number = Number(v);
            if (kind === 'Q26213387') entry.nations.push(number);
            else if (kind === 'Q58825429' || number > 400) entry.athletes.push(number);
        } else if (key === 'opened' || key === 'flame') entry[key] = [...new Set([...(entry[key] || []), v])];
        else if (!(key in entry)) entry[key] = v;
    }
    return [...result];
}));
const hostDetails = new Map(await cached('sport-hosts', async () => {
    const rows = await sparql(`SELECT ?item ?l ?coord ?co ?col WHERE {
  VALUES ?item { ${values(hostIds)} }
  OPTIONAL { ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P17 ?co . ?co rdfs:label ?col FILTER(LANG(?col) = "cs") }
}`);
    const result = new Map();
    for (const row of rows) {
        const qid = id(row.item.value);
        if (result.has(qid)) continue;
        result.set(qid, { n: row.l ? row.l.value : '', coord: row.coord ? row.coord.value : '', co: row.co ? id(row.co.value) : '', land: row.col ? row.col.value : '' });
    }
    return [...result];
}));
console.log(`Hry: ${gamesDetails.size}, pořadatelská města: ${hostDetails.size}`);

// --- 2. krok: sporty a disciplíny ---
const sportDetails = new Map(await cached('sport-sports', async () => {
    const result = new Map(SPORT_IDS.map(qid => [qid, {}]));
    await inBatches(SPORT_IDS, 60, (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("from" AS ?p) }
  UNION { ?item wdt:P495 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("origin" AS ?p) }
  UNION { ?item wdt:P1873 ?v BIND("players" AS ?p) }
  UNION { ?item wdt:P2283 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("uses" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const v = row.v.value;
        if (key === 'uses' || key === 'origin' || key === 'players') entry[key] = [...new Set([...(entry[key] || []), v])];
        else if (!(key in entry)) entry[key] = v;
    });
    return [...result];
}));
console.log(`Sporty: ${[...sportDetails.values()].filter(detail => detail.t).length} s článkem`);

// --- 3. krok: kandidáti na sportovce (QLever – přes všechny lidi se sportem) ---
const athleteCandidates = await cached('sport-athlete-candidates', async () => {
    const rows = await qlever(`SELECT ?p ?sl ?sport ?occ WHERE {
  VALUES ?sport { ${values(ATHLETE_SPORTS)} }
  { ?p wdt:P641 ?sport } UNION { ?p wdt:P106 ?occ . ?occ wdt:P641 ?sport }
  ?p wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sl .
  ?a schema:about ?p ; schema:isPartOf <https://cs.wikipedia.org/> .
  FILTER(?sl >= 12)
}`);
    // Čeští sportovci mají méně článků v jiných jazycích – berou se i méně známí
    const czechRows = await qlever(`SELECT ?p ?sl ?sport ?occ WHERE {
  VALUES ?sport { ${values(ATHLETE_SPORTS)} }
  VALUES ?c { ${values([...CZECH_STATES])} }
  { ?p wdt:P27 ?c } UNION { ?p wdt:P1532 ?c }
  { ?p wdt:P641 ?sport } UNION { ?p wdt:P106 ?occ . ?occ wdt:P641 ?sport }
  ?p wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sl .
  ?a schema:about ?p ; schema:isPartOf <https://cs.wikipedia.org/> .
  FILTER(?sl >= 5)
}`);
    const czechSet = new Set(czechRows.map(row => id(row.p.value)));
    const result = new Map();
    for (const row of [...rows, ...czechRows]) {
        const qid = id(row.p.value);
        const entry = result.get(qid) || { sl: Number(row.sl.value), sports: {}, cz: czechSet.has(qid) };
        const sport = id(row.sport.value);
        // Odkud sport je: přímo (P641), nebo z povolání
        const via = row.occ ? id(row.occ.value) : 'P641';
        entry.sports[sport] = [...new Set([...(entry.sports[sport] || []), via])];
        result.set(qid, entry);
    }
    return [...result];
});
console.log(`Kandidáti na sportovce: ${athleteCandidates.length} (českých ${athleteCandidates.filter(([, entry]) => entry.cz).length})`);

// Hlavní sport sportovce: ten, ke kterému vede nejvíc údajů (P641 i povolání); u remízy podle pořadí BUCKETS
const bucketKeys = Object.keys(BUCKETS);
const bucketsOf = (sports) => {
    const score = {};
    for (const [sport, via] of Object.entries(sports)) {
        const key = BUCKET_OF.get(sport);
        if (key) score[key] = (score[key] || 0) + via.length;
    }
    return Object.keys(score).sort((a, b) => score[b] - score[a] || bucketKeys.indexOf(a) - bucketKeys.indexOf(b));
};
// Výběr s rezervou (část kandidátů vypadne kvůli chybějícím údajům): nejznámější v každém sportu a k nim nejznámější Češi
const RESERVE = 1.6;
const candidateMap = new Map(athleteCandidates);
const selected = new Set();
for (const key of bucketKeys) {
    const inBucket = athleteCandidates.filter(([, entry]) => bucketsOf(entry.sports)[0] === key).sort((a, b) => b[1].sl - a[1].sl);
    inBucket.slice(0, Math.ceil(BUCKETS[key].limit * RESERVE)).forEach(([qid]) => selected.add(qid));
    inBucket.filter(([, entry]) => entry.cz).slice(0, Math.ceil(BUCKETS[key].cz * RESERVE)).forEach(([qid]) => selected.add(qid));
}
const selectedIds = [...selected];
console.log(`Vybráno ${selectedIds.length} sportovců k podrobnostem…`);

// --- 4. krok: podrobnosti o sportovcích ---
const PERSON_SINGLE = { t: 1, n: 1, d: 1, im: 1, born: 1, died: 1, sex: 1, ws: 1, we: 1 };
const athleteDetails = new Map(await cached('sport-athlete-details', async () => {
    const result = new Map(selectedIds.map(qid => [qid, { teams: [], oly: [] }]));
    await inBatches(selectedIds, 60, (qids) => `SELECT ?item ?p ?v ?start ?end ?medal WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P2031 ?v BIND("ws" AS ?p) }
  UNION { ?item wdt:P2032 ?v BIND("we" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P1532 ?v BIND("cfs" AS ?p) }
  UNION { ?item wdt:P641 ?v BIND("sport" AS ?p) }
  UNION { ?item wdt:P106 ?v BIND("occ" AS ?p) }
  UNION { ?item wdt:P413 ?v BIND("pos" AS ?p) }
  UNION { ?item wdt:P2416 ?v BIND("disc" AS ?p) }
  UNION { ?item p:P54 ?s . ?s ps:P54 ?v . OPTIONAL { ?s pq:P580 ?start } OPTIONAL { ?s pq:P582 ?end } BIND("team" AS ?p) }
  UNION { ?item p:P1344 ?s . ?s ps:P1344 ?v . OPTIONAL { ?s pq:P166 ?medal } BIND("oly" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (key === 'team') entry.teams.push({ id: v, start: row.start ? row.start.value : '', end: row.end ? row.end.value : '' });
        else if (key === 'oly') entry.oly.push({ id: v, medal: row.medal ? id(row.medal.value) : '' });
        else if (PERSON_SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    return [...result];
}));

// Události, kterých se sportovci účastnili (P1344): ke kterým hrám patří (finále 5000 m → atletika na LOH 1952 → LOH 1952)
const gameSet = new Set(gameIds);
const eventIds = [...new Set([...athleteDetails.values()].flatMap(detail => detail.oly.map(entry => entry.id)))].filter(q => /^Q\d+$/.test(q));
const eventGames = new Map(await cached('sport-event-games', async () => {
    const result = [];
    await inBatches(eventIds.filter(q => !gameSet.has(q)), 300, (qids) => `SELECT ?e ?g WHERE {
  VALUES ?e { ${values(qids)} } VALUES ?g { ${values(gameIds)} } ?e wdt:P361* ?g . }`,
    (row) => result.push([id(row.e.value), id(row.g.value)]), qlever);
    return result;
}));
for (const qid of gameIds) eventGames.set(qid, qid);
console.log(`Události na olympijských hrách: ${eventGames.size} z ${eventIds.length}`);

// České názvy odkazovaných položek (povolání, kluby, posty, státy, disciplíny)
const referenced = new Set();
for (const detail of athleteDetails.values()) {
    for (const key of ['occ', 'pos', 'cit', 'cfs', 'disc', 'sport']) (detail[key] || []).forEach(q => referenced.add(q));
    detail.teams.forEach(team => referenced.add(team.id));
}
for (const q of referenced) if (!/^Q\d+$/.test(q)) referenced.delete(q);
const labels = new Map(await cached('sport-labels', async () => {
    const result = [];
    await inBatches([...referenced], 400, (qids) => `SELECT ?item ?label ?sl WHERE { VALUES ?item { ${values(qids)} }
  ?item rdfs:label ?label FILTER(LANG(?label) = "cs") OPTIONAL { ?item wikibase:sitelinks ?sl } }`,
    (row) => result.push([id(row.item.value), { n: row.label.value, sl: row.sl ? Number(row.sl.value) : 0 }]), qlever);
    return result;
}));
const label = (qid) => (labels.get(qid) || {}).n;
console.log(`Názvy: ${labels.size} z ${referenced.size}`);

// --- 5. krok: položky ---
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const items = [];
const usedNames = new Set();
const addItem = (item) => {
    const key = item.n.toLocaleLowerCase('cs');
    if (usedNames.has(key)) return false;
    usedNames.add(key);
    items.push(compact(item));
    return true;
};
const largest = (list) => list && list.length ? Math.max(...list) : undefined;

// Olympijské hry: pořadatel, stát (tehdejší), počty sportovců a zemí, kdo hry zahájil a zapálil oheň
const NOT_GAMES_PHOTO = /poster|olympiade|plakat|plakát|affiche|logo|emblem|rings|medal|torch|ticket|stamp|mascot|pictogram|\.svg$|\.png$|\.tiff?$/i;
// Stát v době her (Wikidata uvádějí dnešní)
const HOST_LAND = { 'Z1984': 'Jugoslávie', 'L1980': 'Sovětský svaz', 'L1972': 'Západní Německo' };
const cityNames = (qid) => CITY_NAMES[qid] || [hostDetails.get(qid).n];
for (const [qid, year, type, hosts, also = []] of GAMES) {
    const detail = gamesDetails.get(qid);
    const host = hostDetails.get(hosts[0]);
    if (!detail || !detail.t || !host) continue;
    const point = parsePoint(host.coord);
    const startYear = yearOf(detail.start);
    // Fotka s rokem v názvu souboru ho mívá i na sobě (pamětní deska „1932 Olympiad“) – u otázky na rok by ho prozradila
    const photo = detail.im && !NOT_GAMES_PHOTO.test(fileName(detail.im)) && !fileName(detail.im).includes(String(year)) ? detail.im : undefined;
    addItem({
        q: qid, t: detail.t, n: capitalize(detail.n || detail.t), c: 'olympiady',
        // Známé: poválečné letní hry a zimní od Lake Placid 1980, k tomu první hry obou druhů a Berlín 1936
        k: (type === 'L' ? year >= 1948 || year === 1896 || year === 1936 : year >= 1980 || year === 1924) ? 1 : 0,
        ty: type === 'L' ? 'letní olympijské hry' : 'zimní olympijské hry',
        d: detail.d,
        la: point ? point.lat : undefined, lo: point ? point.lon : undefined,
        co: [host.co].filter(Boolean),
        ...imageFields(photo),
        f: compact({
            year, type,
            // Tokio 2020 se konalo až v roce 2021
            held: startYear && startYear !== year ? startYear : undefined,
            start: detail.start ? detail.start.slice(0, 10) : undefined,
            end: detail.end ? detail.end.slice(0, 10) : undefined,
            host: hosts.map(qid => cityNames(qid)[0]).join(' a '),
            hosts,
            names: [...new Set(hosts.flatMap(cityNames))],
            also: also.length ? also : undefined,
            land: HOST_LAND[`${type}${year}`] || host.land,
            athletes: largest(detail.athletes),
            nations: largest(detail.nations),
            opened: (detail.opened || [])[0],
            flame: (detail.flame || []).slice(0, 2).join(', ')
        })
    });
}

const gameInfo = new Map(GAMES.map(([qid, year, type]) => [qid, { year, type }]));
// Od kdy je sport na olympijských hrách jako soutěžní (Wikidata počítají i ukázkové sporty – baseball 1912,
// basketbal 1904); jen sporty, které na hrách dodnes jsou
const OLYMPIC_SINCE = {
    Q2736: 1900, Q5372: 1936, Q847: 1896, Q32112: 1904, Q1734: 1964, Q5377: 1900, Q11420: 1964, Q7291: 1992, Q8418: 1936, Q36389: 2000,
    Q3930: 1988, Q42486: 1896, Q41466: 1920, Q12100: 1896, Q108429: 1900, Q159992: 2020, Q1455: 1908, Q7707: 1900, Q83462: 1896, Q136851: 1924,
    Q38108: 1908, Q166788: 1960, Q159354: 1900, Q7735: 1904, Q4543: 1996, Q10980: 2000, Q186222: 1936, Q7718: 1924, Q177275: 1924,
    Q178131: 1998, Q206989: 1896, Q179687: 1924, Q31920: 1896, Q326827: 1896, Q61465: 1984, Q186190: 1928, Q180692: 1984, Q273285: 1964,
    Q192431: 1924, Q193654: 1992, Q842284: 2020, Q189472: 1992, Q1541373: 2020, Q1141850: 1936, Q31874: 1972, Q3609: 1896, Q221635: 1896,
    Q215184: 2008, Q14085739: 1900, Q40244: 1896, Q164761: 1896, Q165704: 1896, Q170737: 1896, Q185027: 1896, Q187204: 1896, Q180935: 1896,
    Q182570: 1896, Q178108: 1908, Q184865: 1900, Q537769: 1896, Q202391: 1908, Q211773: 1912, Q191051: 1984
};
// Vznik sportu, kde je rok jasný (Wikidata mají u volejbalu rok založení federace)
const FOUNDED = { Q2736: 1863, Q5372: 1891, Q1734: 1895, Q847: 1873, Q11420: 1882, Q1968: 1950, Q106500: 1938, Q192937: 1902, Q244700: 1968, Q41466: 1875 };
// Země původu: opravy a vynechání sporných (házená, skok do výšky)
const ORIGIN = { Q36389: 'Jižní Korea', Q206763: 'Švédsko', Q8418: null, Q165704: null, Q7735: null };
// Vybavení: bez míst a nejasných názvů („míč na nějaký druh fotbalu“, „paže a předloktí“)
const NOT_EQUIPMENT = /nějak|paže|předloktí|hřiště|kurt|dvorec|závodiště|bazén|hala|^led$|velodrom|dráha|divoká voda|skalní/u;
// Počet hráčů jednoho družstva na hřišti (Wikidata míchají celkový počet, soupisku i jedno družstvo)
const PLAYERS = {
    Q2736: 11, Q5372: 5, Q1734: 6, Q8418: 7, Q41323: 11, Q5369: 9, Q171038: 9, Q5375: 11, Q7707: 7, Q1455: 11, Q4543: 2, Q171401: 5,
    Q206763: 6, Q185851: 10, Q192937: 8, Q231200: 7, Q50776: 18, Q204632: 15, Q213711: 15, Q41466: 6, Q183018: 11, Q134211: 4, Q210778: 5,
    Q690676: 5, Q1050588: 5, Q946171: 5, Q8099087: 2, Q244700: 7, Q1295867: 9, Q188818: 3
};
// Druh sportu podle štítků (první, který sedí)
const SPORT_KINDS = [['vytrvalost', 'vytrvalostní sport'], ['zima', 'zimní sport'], ['styl', 'plavecký způsob'], ['atletika', 'atletická disciplína'],
    ['boj', 'bojový sport'], ['raketa', 'raketový sport'], ['tym', 'kolektivní sport'], ['voda', 'vodní sport'], ['kolo', 'cyklistický sport'],
    ['motor', 'motoristický sport'], ['gym', 'gymnastický sport'], ['presnost', 'přesnostní sport'], ['sila', 'silový sport'], ['kun', 'jezdecký sport'],
    ['vzduch', 'letecký sport'], ['lezeni', 'lezecký sport'], ['tanec', 'taneční sport'], ['prkno', 'sport na prkně']];
// Sporty, které zná každý (k nim ty s nejvíc články ve Wikipedii)
const KNOWN_SPORTS = new Set(['Q41466', 'Q206763', 'Q166788', 'Q7718', 'Q179687', 'Q186222', 'Q38108', 'Q192431', 'Q178131', 'Q178108', 'Q185027',
    'Q165704', 'Q170737', 'Q180935', 'Q182570', 'Q164761', 'Q537769', 'Q31874', 'Q159354', 'Q326827', 'Q31920', 'Q3609', 'Q7856', 'Q136851',
    'Q177275', 'Q273285', 'Q131471', 'Q172809', 'Q828185', 'Q326163', 'Q245249', 'Q275115', 'Q10980', 'Q4543', 'Q187916', 'Q215862']);
const sportRows = [...sportDetails.entries()].filter(([qid, detail]) => SPORTS[qid] && detail.t && detail.im).sort((a, b) => Number(b[1].sl) - Number(a[1].sl));
for (const [qid, detail] of sportRows) {
    const tags = SPORTS[qid].split(' ');
    const kind = SPORT_KINDS.find(([tag]) => tags.includes(tag));
    addItem({
        q: qid, t: detail.t, n: capitalize(detail.n || detail.t.replace(/ \(.*\)$/, '')), c: 'sporty',
        k: Number(detail.sl) >= 60 || KNOWN_SPORTS.has(qid) ? 1 : 0,
        ty: kind ? kind[1] : 'sport',
        d: detail.d,
        ...imageFields(detail.im),
        tg: tags,
        f: compact({
            players: PLAYERS[qid],
            oh: OLYMPIC_SINCE[qid],
            from: FOUNDED[qid],
            origin: qid in ORIGIN ? ORIGIN[qid] || undefined : (detail.origin || [])[0],
            uses: (detail.uses || []).filter(text => !NOT_EQUIPMENT.test(text)).map(text => text.charAt(0).toLowerCase() + text.slice(1)).slice(0, 4)
        })
    });
}

// Sportovci
const FEMALE_ID = FEMALE;
// Českoslovenští sportovci narození na Slovensku (Hingisová, Šťastný, Nepela) patří spíš ke slovenským dějinám
const czechoslovakOnly = [...athleteDetails.entries()].filter(([, detail]) => {
    const states = [...(detail.cit || []), ...(detail.cfs || [])];
    return states.includes('Q33946') && !states.includes('Q213');
}).map(([qid]) => qid);
const birthCountries = new Map(await cached('sport-birth-countries', async () => {
    const result = [];
    await inBatches(czechoslovakOnly, 200, (qids) => `SELECT ?item ?c WHERE { VALUES ?item { ${values(qids)} } ?item wdt:P19 ?place . ?place wdt:P17 ?c . }`,
        (row) => result.push([id(row.item.value), id(row.c.value)]));
    return result;
}));
const isCzechAthlete = (qid, detail) => {
    const states = [...(detail.cit || []), ...(detail.cfs || [])];
    if (states.includes('Q213') || states.includes('Q42585')) return true;
    return states.includes('Q33946') && !states.includes('Q214') && birthCountries.get(qid) !== 'Q214';
};
// Kluby: bez reprezentací a mládežnických týmů; nejdéle působení první
const NOT_CLUB = /reprezentac|výběr|národní|olympijsk|do \d+ let|\bU\d+|junio|mládež|rezerv|\bB$|„B“|akademie/iu;
// Kluby jen u kolektivních sportů a u automobilových závodů (stáje); atlet „hrající“ za fotbalový klub by mátl
const CLUB_BUCKETS = new Set(['fotbal', 'hokej', 'basketbal', 'americky', 'baseball', 'hazena', 'volejbal', 'ragby', 'kriket', 'florbal', 'auto']);
const clubsOf = (detail) => {
    const tenure = new Map();
    for (const team of detail.teams) {
        const name = label(team.id);
        if (!name || NOT_CLUB.test(name)) continue;
        const start = yearOf(team.start);
        const end = yearOf(team.end);
        // Bez konce počítáme rok – neznámá délka působení nesmí přebít dlouholetý klub
        const years = start !== undefined ? Math.max((end ?? start + 1) - start, 0) : 0;
        tenure.set(name, (tenure.get(name) || 0) + years + ((labels.get(team.id) || {}).sl || 0) / 10000);
    }
    return [...tenure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name);
};
// Post jen u kolektivních sportů a jen takový, který k sportu patří (Petr Čech není „hokejový brankář“, Jordan „polař“)
const POSITION_BUCKETS = new Set(['fotbal', 'hokej', 'basketbal', 'hazena', 'volejbal', 'florbal']);
const OTHER_SPORT_POSITION = { fotbal: /hokej|basketbal|polař|nadhazovač|pálkař/u, hokej: /fotbal|basketbal|polař|nadhazovač/u };
const positionOf = (detail, bucketKey) => {
    if (!POSITION_BUCKETS.has(bucketKey)) return undefined;
    const wrong = OTHER_SPORT_POSITION[bucketKey] || /hokej|fotbal|polař|nadhazovač|pálkař|chytač|quarterback/u;
    return (detail.pos || []).map(label).filter(Boolean).find(text => !wrong.test(text));
};
// Disciplína, která sport jen opakuje (tenisová dvouhra, rychlobruslení na dlouhé dráze), nic neřekne
// Obecné „disciplíny“ (ženy, sportovní dvojice) nic neřeknou a u Henieové by byly i chybně
const GENERIC_DISCIPLINE = /^(ženy|muži|sportovní dvojice|jednotlivci|družstva|smíšené družstvo)$/u;
const disciplinesOf = (detail, bucket) => {
    const stem = bucket.label.split(' ')[0].slice(0, 5);
    return (detail.disc || []).map(label).filter(text => text && !text.toLocaleLowerCase('cs').includes(stem) && !GENERIC_DISCIPLINE.test(text)).slice(0, 2).join(', ') || undefined;
};
// Život bez rozporů: narození v minulosti, úmrtí po narození a ne v budoucnosti
const lifeOf = (detail) => {
    const born = yearOf(detail.born);
    let died = yearOf(detail.died);
    if (born === undefined || born > THIS_YEAR - 14 || born < 1840) return null;
    if (died !== undefined && (died <= born || died > THIS_YEAR || died - born > 110)) died = undefined;
    return { born, died };
};
// Kariéra: období činnosti (P2031/P2032), jinak z působení v klubech a z olympijských her
const careerOf = (detail, life, olympicYears) => {
    const starts = detail.teams.map(team => yearOf(team.start)).filter(year => year !== undefined);
    const ends = detail.teams.map(team => yearOf(team.end)).filter(year => year !== undefined);
    let from = yearOf(detail.ws) ?? (starts.length ? Math.min(...starts) : undefined);
    let to = yearOf(detail.we);
    if (to === undefined && ends.length && (!starts.length || Math.max(...ends) >= Math.max(...starts))) to = Math.max(...ends);
    if (olympicYears.length) {
        from = Math.min(from ?? Infinity, ...olympicYears);
        const last = Math.max(...olympicYears);
        if (to !== undefined) to = Math.max(to, last);
        // Konec kariéry neznámý: nejpozději poslední olympiáda – kromě těch, kdo na hrách byli nedávno (asi pořád závodí)
        else if (life.died !== undefined || last < THIS_YEAR - 5) to = last;
    }
    if (from !== undefined && (from < life.born + 10 || from > THIS_YEAR)) from = undefined;
    if (to !== undefined && (to > THIS_YEAR || (life.died !== undefined && to > life.died) || from === undefined || to < from)) to = undefined;
    return { from, to };
};
const olympicsOf = (detail) => {
    const games = new Set();
    const medals = new Map();
    for (const entry of detail.oly) {
        const game = eventGames.get(entry.id);
        if (!game) continue;
        games.add(game);
        if (MEDALS[entry.medal]) medals.set(`${entry.id}-${entry.medal}`, { game, kind: MEDALS[entry.medal] });
    }
    const sorted = [...games].sort((a, b) => gameInfo.get(a).year - gameInfo.get(b).year || (gameInfo.get(a).type === 'Z' ? -1 : 1));
    const count = (kind) => [...medals.values()].filter(medal => medal.kind === kind).length;
    return {
        og: sorted,
        gold: count('gold'), silver: count('silver'), bronze: count('bronze'),
        goldAt: [...new Set([...medals.values()].filter(medal => medal.kind === 'gold').map(medal => medal.game))]
    };
};
const countryLabel = (detail) => {
    const states = (detail.cfs && detail.cfs.length ? detail.cfs : detail.cit || []).map(label).filter(Boolean);
    return states.slice(0, 2).join(', ') || undefined;
};
// Sportovci, které zná každý Čech (k nejznámějším podle článků ve Wikipedii)
const CZECH_KNOWN = new Set(['Jaromír Jágr', 'Dominik Hašek', 'Emil Zátopek', 'Dana Zátopková', 'Věra Čáslavská', 'Martina Navrátilová', 'Ivan Lendl',
    'Petra Kvitová', 'Martina Sáblíková', 'Jan Železný', 'Roman Šebrle', 'Pavel Nedvěd', 'Petr Čech', 'Ester Ledecká', 'Kateřina Neumannová',
    'Tomáš Rosický', 'Barbora Krejčíková', 'Karolína Plíšková', 'Kristýna Plíšková', 'Ondřej Synek', 'Jiří Prskavec', 'Barbora Špotáková',
    'Jarmila Kratochvílová', 'Josef Masopust', 'Antonín Panenka', 'Josef Bican', 'František Plánička', 'Karel Poborský', 'Jan Koller',
    'Milan Baroš', 'Patrik Schick', 'Tomáš Berdych', 'Radek Štěpánek', 'Jana Novotná', 'Hana Mandlíková', 'Ivan Hlinka', 'Robert Reichel',
    'Martin Straka', 'David Pastrňák', 'Patrik Eliáš', 'Tomáš Dvořák', 'Lukáš Krpálek', 'Gabriela Soukalová', 'Ondřej Moravec', 'Eva Samková',
    'Jiří Raška', 'Kateřina Emmons', 'Adam Ondra', 'Jiří Procházka', 'Štěpánka Hilgertová', 'Zdeněk Štybar', 'Vladimír Šmicer', 'Marek Jankulovski',
    'Jakub Vadlejch', 'Vítězslav Veselý', 'Zuzana Hejnová', 'Markéta Vondroušová', 'Lucie Šafářová', 'Jan Kodeš', 'Petr Korda']);
const athleteRows = [...athleteDetails.entries()]
    .map(([qid, detail]) => ({ qid, detail, candidate: candidateMap.get(qid) }))
    .filter(({ candidate }) => candidate)
    .sort((a, b) => b.candidate.sl - a.candidate.sl);
// Ze stejně pojmenovaných zůstane ten známější
const rankInBucket = {};
const czechRankInBucket = {};
let czechRank = 0;
for (const { qid, detail, candidate } of athleteRows) {
    if (!detail.t) continue;
    const buckets = bucketsOf(candidate.sports);
    const bucketKey = mainBucket(detail.d, buckets);
    const bucket = BUCKETS[bucketKey];
    if (!bucket) continue;
    // Sportovec: aspoň jedno sportovní povolání, které není trenér, rozhodčí ani funkcionář
    const sportOccupationIds = new Set(Object.values(candidate.sports).flat().filter(via => via !== 'P641' && !NOT_ATHLETE.test(label(via) || '')));
    // Sportovní je i povolání, které se tak jmenuje (oštěpař, desetibojař), i když ve Wikidatech nemá sport
    (detail.occ || []).filter(q => GENERIC_ATHLETE.has(q) || (ATHLETE_NOUN.test(label(q) || '') && !NOT_SPORT_FAME.test(label(q) || '')))
        .forEach(q => sportOccupationIds.add(q));
    const isAthlete = sportOccupationIds.size > 0 || (detail.sport || []).some(q => BUCKET_OF.has(q));
    if (!isAthlete || !isMainlyAthlete(detail, sportOccupationIds) || NOT_ATHLETES.has(detail.n)) continue;
    const life = lifeOf(detail);
    if (!life) continue;
    const isCzech = isCzechAthlete(qid, detail);
    const name = detail.n || detail.t.replace(/ \(.*\)$/, '');
    // Jméno jen z dvoupísmenných slov (Li Na) se v popisu zakrýt nedá – „na“ je i předložka
    if (!name.split(/\s+/).some(word => word.length >= 3)) continue;
    const rank = rankInBucket[bucketKey] || 0;
    const czRank = czechRankInBucket[bucketKey] || 0;
    if (rank >= bucket.limit && !(isCzech && czRank < bucket.cz)) continue;
    const olympics = olympicsOf(detail);
    // Čeští hokejisté v Naganu 1998 vyhráli zlato (u týmových turnajů Wikidata medaili často neuvádějí)
    if (bucketKey === 'hokej' && isCzech && olympics.og.includes('Q9664') && !olympics.goldAt.includes('Q9664')) {
        olympics.goldAt.push('Q9664');
        olympics.gold++;
    }
    const olympicYears = olympics.og.map(game => gameInfo.get(game).year);
    const career = careerOf(detail, life, olympicYears);
    const female = detail.sex === FEMALE_ID;
    const known = rank < bucket.known || (isCzech && (CZECH_KNOWN.has(name) || czechRank < 25));
    const added = addItem({
        q: qid, t: detail.t, n: name, c: 'sportovci', k: known ? 1 : 0,
        ty: female ? bucket.woman : bucket.man,
        d: detail.d,
        cz: isCzech ? 1 : undefined,
        sx: female ? 'f' : undefined,
        ...imageFields(detail.im),
        f: compact({
            born: life.born, died: life.died, from: career.from, to: career.to,
            sport: bucket.label,
            // Jen jeden sport – na „Ve kterém sportu se proslavil?“ je jediná odpověď
            one: buckets.length === 1 && buckets[0] === bucketKey ? 1 : undefined,
            land: countryLabel(detail),
            pos: positionOf(detail, bucketKey),
            disc: disciplinesOf(detail, bucket),
            clubs: CLUB_BUCKETS.has(bucketKey) ? clubsOf(detail) : undefined,
            og: olympics.og,
            // Počet zlatých (stříbrné a bronzové Wikidata u řady sportovců neuvádějí úplně)
            gold: olympics.gold || undefined,
            goldAt: olympics.goldAt,
            y: career.from !== undefined ? Math.round((career.from + (career.to ?? Math.min(career.from + 10, THIS_YEAR))) / 2) : life.born + 25
        }),
        sk: bucketKey,
        sl: candidate.sl
    });
    if (!added) continue;
    rankInBucket[bucketKey] = rank + 1;
    if (isCzech) {
        czechRankInBucket[bucketKey] = czRank + 1;
        czechRank++;
    }
}

// --- 6. krok: okruhy pro systematické učení ---
const winterBuckets = new Set(Object.entries(BUCKETS).filter(([, bucket]) => bucket.tags.includes('zima')).map(([key]) => key));
const BY_BORN = { by: 'born' };
const athleteIn = (...keys) => (item) => item.c === 'sportovci' && keys.includes(item.sk);
const sportTagged = (tag) => (item) => item.c === 'sporty' && item.tg.includes(tag);
const COLLECTIONS = [
    { id: 'cesti-sportovci', label: 'Čeští sportovci', sort: BY_BORN, test: item => item.c === 'sportovci' && item.cz },
    { id: 'cesti-olympijsti-vitezove', label: 'Čeští olympijští vítězové', sort: BY_BORN, test: item => item.c === 'sportovci' && item.cz && item.f.gold > 0 },
    { id: 'nagano', label: 'Nagano 1998', text: 'Zlatý hokejový tým z turnaje století', sort: BY_BORN, test: item => athleteIn('hokej')(item) && item.cz && (item.f.goldAt || []).includes('Q9664') },
    { id: 'olympijske-legendy', label: 'Olympijské legendy', text: 'Aspoň čtyři zlaté olympijské medaile', sort: BY_BORN, test: item => item.c === 'sportovci' && item.f.gold >= 4 },
    { id: 'sportovkyne', label: 'Slavné sportovkyně', sort: BY_BORN, test: item => item.c === 'sportovci' && item.sx === 'f' && item.k === 1 },
    { id: 'fotbal', label: 'Fotbal', sort: BY_BORN, test: item => athleteIn('fotbal')(item) || ['Q2736', 'Q171401', 'Q210778'].includes(item.q) },
    { id: 'hokej', label: 'Lední hokej', sort: BY_BORN, test: item => athleteIn('hokej')(item) || ['Q41466', 'Q183018', 'Q946171'].includes(item.q) },
    { id: 'tenis', label: 'Tenis', sort: BY_BORN, test: item => athleteIn('tenis')(item) || item.q === 'Q847' },
    { id: 'atletika', label: 'Atletika', sort: BY_BORN, test: item => athleteIn('atletika')(item) || sportTagged('atletika')(item) },
    { id: 'zimni-sporty', label: 'Zimní sporty', text: 'Sportovci a sporty na sněhu a ledu', sort: BY_BORN,
        test: item => (item.c === 'sportovci' && winterBuckets.has(item.sk)) || sportTagged('zima')(item) },
    { id: 'micove-hry', label: 'Míčové hry', sort: { by: 'name' }, test: sportTagged('mic') },
    { id: 'bojove-sporty', label: 'Bojové sporty', sort: BY_BORN, test: item => athleteIn('box', 'judo', 'mma', 'zapas', 'serm')(item) || sportTagged('boj')(item) },
    { id: 'vodni-sporty', label: 'Vodní sporty', sort: BY_BORN, test: item => athleteIn('plavani', 'veslovani', 'kanoistika', 'skoky_do_vody', 'jachting')(item) || sportTagged('voda')(item) },
    { id: 'motorsport', label: 'Motorsport', text: 'Formule 1, rallye a motocykly', sort: BY_BORN, test: item => athleteIn('auto', 'moto')(item) || sportTagged('motor')(item) },
    { id: 'letni-oh', label: 'Letní olympijské hry', sort: { by: 'year' }, test: item => item.c === 'olympiady' && item.f.type === 'L' },
    { id: 'zimni-oh', label: 'Zimní olympijské hry', sort: { by: 'year' }, test: item => item.c === 'olympiady' && item.f.type === 'Z' }
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);
// Pomocné údaje pro výběr už v datech nejsou potřeba
for (const item of items) { delete item.sk; delete item.sl; }

for (const category of ['sportovci', 'olympiady', 'sporty']) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.cz).length} českých)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('sport', { collections, items });
