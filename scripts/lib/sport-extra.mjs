// Téma Sport, rozšíření: kluby a týmy, sportoviště (stadiony, haly, závodní okruhy) a sportovní soutěže z Wikidat.
// Používá build-sport.mjs; vrací položky bez okruhů (g) a bez kontroly duplicit jmen (ta dělá volající).
import { qlever, sparql, id, values, parsePoint, imageFields, yearOf, compact, cached, inBatches } from './wikidata.mjs';
import { cachedEntries } from './sport-cache.mjs';

// Podrobnosti po dávkách jdou číst i z query.wikidata.org (WIKIDATA_ENDPOINT=wdqs), když je QLever přetížený
const detailsRun = process.env.WIKIDATA_ENDPOINT === 'wdqs' ? sparql : qlever;

const CS_ARTICLE = '?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> .';
const CZ_STATES = ['Q213', 'Q33946', 'Q42585'];
const CZ_LANDS = new Set(['Česko', 'Československo', 'České království']);

// --- Kluby a týmy ---
// [ID sportu]: [štítek sportu jako u sportovců, druh týmu]; kluby se dvěma a více sporty (sportovní „spolky“) se vynechají
// Druh týmu ve Wikidatech (P31) → sport
const CLUB_CLASSES = { Q476028: 'Q2736', Q4498974: 'Q41466', Q13393265: 'Q5372', Q17156793: 'Q41323', Q13027888: 'Q5369', Q10497835: 'Q1968' };
const CLUB_SPORTS = {
    Q2736: ['fotbal', 'fotbalový klub'], Q41466: ['lední hokej', 'hokejový klub'], Q5372: ['basketbal', 'basketbalový klub'],
    Q8418: ['házená', 'házenkářský klub'], Q1734: ['volejbal', 'volejbalový klub'], Q5369: ['baseball', 'baseballový klub'],
    Q41323: ['americký fotbal', 'klub amerického fotbalu'], Q5849: ['ragby', 'ragbyový klub'], Q1968: ['automobilové závody', 'stáj Formule 1'],
    Q3609: ['cyklistika', 'cyklistický tým'], Q206763: ['florbal', 'florbalový klub']
};
// Ligy, jejichž kluby se berou všechny (P118, s článkem v české Wikipedii): zámořské ligy a nejvyšší české soutěže → sport
const LEAGUE_SPORTS = {
    Q1215892: 'Q41466', Q155223: 'Q5372', Q1215884: 'Q41323', Q1163715: 'Q5369',
    Q217016: 'Q2736', Q1261184: 'Q2736', Q862240: 'Q41466', Q163071: 'Q41466', Q2664980: 'Q5372', Q11179672: 'Q206763',
    // Třetí české fotbalové ligy (ČFL, MSFL) a 2. hokejová liga – kluby s článkem, většinou pro experty
    Q341070: 'Q2736', Q1548432: 'Q2736', Q210632: 'Q41466'
};
// Reprezentace, ženské a mládežnické týmy, rezervy a zaniklé kluby. Samostatné „B“, „C“, „U21“ a „II“ (rezervy) jen jako celé slovo
// s velkým písmenem: \b v JavaScriptu bere písmena s diakritikou jako hranici slova („hrající“, „Bílí Tygři“ by vypadly), „D.C.“ ne
const NOT_CLUB_WORDS = /reprezentac|„[ABC]“|ženy|\(ženy|ženský|národní tým|do \d+ let|mládež|rezerv|akademie|zaniklý|sezóna|ročník/iu;
const RESERVE_TEAM = /(?<![\p{L}\d.])(?:B|C|U\d\d|II)(?![\p{L}\d.])/u;
const NOT_CLUB = { test: (text) => NOT_CLUB_WORDS.test(text) || RESERVE_TEAM.test(text) };
// Kluby se čtou ze tříd týmů ve Wikidatech až od tolika článků ve Wikipedii (české a slovenské od 15)
const CLUB_SITELINKS = 65;
const CZECH_CLUB_SITELINKS = 15;
// Známé kluby a týmy, které zná i laik (anglické názvy podle Wikidat); ostatní kluby jsou „méně známé“. Počet článků na známost
// nestačí (kyperské a brazilské kluby jich mají kvůli botům víc než Sparta)
const KNOWN_CLUBS = ['Real Madrid Club de Fútbol', 'Juventus FC', 'Paris Saint-Germain FC', 'Fenerbahçe SK', 'Athletic Club', 'Club Atlético Boca Juniors', 'Club Atlético River Plate',
    'Santos Futebol Clube', 'Sociedade Esportiva Palmeiras', 'Clube de Regatas do Flamengo', 'Sport Club Corinthians Paulista', 'Beşiktaş JK', 'Panathinaikos FC', 'Hamburger SV',
    'AS Monaco FC', 'Borussia Mönchengladbach', 'RSC Anderlecht', 'Club Brugge KV', 'FK Crvena zvezda', 'GNK Dinamo Zagreb', 'Manchester United FC', 'Chelsea FC', 'Arsenal FC',
    'Liverpool FC', 'Manchester City FC', 'Tottenham Hotspur FC', 'Newcastle United FC', 'Everton FC', 'Aston Villa FC', 'West Ham United FC', 'Leeds United AFC', 'Leicester City FC',
    'Celtic FC', 'Rangers FC', 'Olympiacos FC', 'Toronto Maple Leafs', 'Washington Capitals', 'Tampa Bay Lightning', 'Colorado Avalanche', 'Vegas Golden Knights',
    'Scuderia Ferrari', 'Mercedes AMG Petronas Formula One Team', 'Alpine F1 Team', 'Real Madrid CF', 'FC Barcelona', 'Manchester United F.C.', 'Liverpool F.C.', 'Chelsea F.C.', 'Arsenal F.C.', 'Manchester City F.C.',
    'Tottenham Hotspur F.C.', 'FC Bayern Munich', 'Borussia Dortmund', 'Atlético Madrid', 'Juventus F.C.', 'AC Milan', 'Inter Milan', 'AS Roma', 'S.S.C. Napoli',
    'S.S. Lazio', 'Paris Saint-Germain F.C.', 'Olympique de Marseille', 'Olympique Lyonnais', 'AFC Ajax', 'PSV Eindhoven', 'Feyenoord', 'S.L. Benfica', 'FC Porto',
    'Sporting CP', 'Celtic F.C.', 'Rangers F.C.', 'Galatasaray S.K.', 'Fenerbahçe S.K.', 'Boca Juniors', 'Club Atlético River Plate', 'Santos FC', 'Sevilla FC',
    'Valencia CF', 'Athletic Bilbao', 'Bayer 04 Leverkusen', 'Schalke 04', 'FC Dynamo Kyiv', 'FC Shakhtar Donetsk', 'FC Zenit Saint Petersburg', 'PFC CSKA Moscow',
    'Red Star Belgrade', 'Olympiacos F.C.', 'Newcastle United F.C.', 'Everton F.C.', 'Aston Villa F.C.', 'West Ham United F.C.', 'Leeds United A.F.C.', 'Leicester City F.C.',
    'AC Sparta Prague', 'SK Slavia Prague', 'FC Viktoria Plzeň', 'FC Baník Ostrava', 'ŠK Slovan Bratislava', 'Legia Warsaw', 'Ferencvárosi TC', 'FC Red Bull Salzburg',
    'Los Angeles Lakers', 'Boston Celtics', 'Chicago Bulls', 'Golden State Warriors', 'New York Knicks', 'Miami Heat', 'San Antonio Spurs', 'Brooklyn Nets', 'Dallas Mavericks',
    'Montreal Canadiens', 'Toronto Maple Leafs', 'Detroit Red Wings', 'Boston Bruins', 'Chicago Blackhawks', 'New York Rangers', 'Pittsburgh Penguins', 'Edmonton Oilers',
    'Dallas Cowboys', 'New England Patriots', 'Green Bay Packers', 'Pittsburgh Steelers', 'San Francisco 49ers', 'Kansas City Chiefs',
    'New York Yankees', 'Boston Red Sox', 'Los Angeles Dodgers', 'Chicago Cubs', 'Scuderia Ferrari', 'McLaren', 'Mercedes-AMG Petronas F1 Team', 'Red Bull Racing',
    'Williams Racing', 'HC Sparta Praha', 'HC Slavia Praha', 'HC Kometa Brno', 'HC Oceláři Třinec', 'HC Plzeň', 'HC Dynamo Pardubice', 'HC Vítkovice Ridera', 'HC Litvínov',
    'HC Bílí Tygři Liberec', 'HC Olomouc', 'BK Mladá Boleslav', 'Real Madrid Baloncesto', 'FC Barcelona Bàsquet', 'CSKA Moscow (basketball)', 'Fenerbahçe Basketbol'];
// Fotka, která je znak, logo nebo plakát, sportoviště ani klub neukazuje
const NOT_PHOTO = /logo|emblem|crest|znak|coat[ _]of|badge|poster|plak[aá]t|\.svg$|\.png$|flag/iu;
// Sportoviště: plánky a mapy také ne (fotky v PNG ano)
const NOT_VENUE_PHOTO = /logo|emblem|crest|znak|coat[ _]of|badge|poster|plak[aá]t|\.svg$|flag|plan|\bmap|mapa|scheme|diagram|layout/iu;

// --- Sportoviště ---
// Stadiony, haly, závodní okruhy a velodromy; ne koncertní sály a podobné stavby, které tak Wikidata občas vedou
const VENUE_CLASSES = { Q483110: 'stadion', Q641226: 'aréna', Q1777138: 'závodní okruh', Q830893: 'velodrom' };
// Antické hipodromy a cirky, letiště a sjezdovky vedou Wikidata jako závodní dráhy
const NOT_VENUE = /zaniklý|zbouraný|kongres|koncertní|filharmon|divadl|kostel|chrám|muzeum|goetheanum|kolos|amfiteátr|antick|zoo|hřbitov|park(?!\p{L})|zábavn|hip+odrom|cirkus|letiště|sjezdovk/iu;
// Dostihová závodiště (Ascot, Velká Chuchle) jsou ve Wikidatech závodní dráhy jako okruhy Formule 1 – mají vlastní druh
const HORSE_TRACK = /dostih|závodiště|racecourse|koňsk/iu;
// Hlavní domácí sportoviště, která zná i laik (anglické názvy podle Wikidat)
const KNOWN_VENUES = ['Wembley Stadium', 'Camp Nou', 'Santiago Bernabéu Stadium', 'Old Trafford', 'Anfield', 'Allianz Arena', 'Stadio Giuseppe Meazza', 'Maracanã Stadium',
    'Estadio Azteca', 'Signal Iduna Park', 'Stade de France', 'Olympiastadion', 'Madison Square Garden', 'Strahov Stadium', 'Autodromo Nazionale Monza',
    'Circuit de Monaco', 'Silverstone Circuit', 'Indianapolis Motor Speedway', 'Nürburgring', 'Suzuka International Racing Course', 'Circuit de Spa-Francorchamps',
    'Emirates Stadium', 'Etihad Stadium', 'Stamford Bridge', 'Parc des Princes', 'Johan Cruyff Arena', 'La Bombonera', 'Luzhniki Stadium',
    'Beijing National Stadium', 'Stade Roland Garros', 'Rod Laver Arena', 'Lord\'s', 'Melbourne Cricket Ground', 'Yankee Stadium', 'Fenway Park',
    'Staples Center', 'O2 Arena', 'Eden Arena', 'Masaryk Circuit', 'Olympic Stadium', 'Estadio Olímpico Universitario', 'Hampden Park', 'Croke Park',
    'Stadio Olimpico', 'Estadio Alberto J. Armando', 'Twickenham Stadium', 'Wimbledon Centre Court', 'Circuit de Barcelona-Catalunya', 'Interlagos',
    'Circuit Gilles Villeneuve', 'Yas Marina Circuit', 'Marina Bay Street Circuit', 'Hockenheimring', 'Circuit of the Americas', 'Albert Park Circuit',
    'Red Bull Ring', 'Hungaroring', 'Sazka Arena', 'Tipsport Arena', 'Stadion Letná', 'Toyota Park', 'Estadio Santiago Bernabéu'];

// --- Soutěže: [anglický název z Wikidat, sport (štítek jako u sportovců), druh, známá?] ---
const COMPETITIONS = [
    ['FIFA World Cup', 'fotbal', 'mistrovství světa', 1], ['UEFA European Championship', 'fotbal', 'mistrovství Evropy', 1],
    ['UEFA Champions League', 'fotbal', 'klubová soutěž', 1], ['UEFA Europa League', 'fotbal', 'klubová soutěž', 1], ['UEFA Conference League', 'fotbal', 'klubová soutěž', 0],
    ['Premier League', 'fotbal', 'liga', 1], ['La Liga', 'fotbal', 'liga', 1], ['Ligue 1', 'fotbal', 'liga', 1],
    ['Czech First League', 'fotbal', 'liga', 1], ['Eredivisie', 'fotbal', 'liga', 0], ['Primeira Liga', 'fotbal', 'liga', 0], ['Copa América', 'fotbal', 'mistrovství kontinentu', 0],
    ['Africa Cup of Nations', 'fotbal', 'mistrovství kontinentu', 0], ['Copa Libertadores', 'fotbal', 'klubová soutěž', 0], ['FA Cup', 'fotbal', 'pohár', 0],
    ['Major League Soccer', 'fotbal', 'liga', 0], ['FIFA Confederations Cup', 'fotbal', 'turnaj', 0], ['UEFA Nations League', 'fotbal', 'turnaj', 0],
    ['National Hockey League', 'lední hokej', 'liga', 1], ['Stanley Cup', 'lední hokej', 'trofej', 1], ['Czech Extraliga', 'lední hokej', 'liga', 1], ['Kontinental Hockey League', 'lední hokej', 'liga', 0],
    ['IIHF World Championship', 'lední hokej', 'mistrovství světa', 1], ['Spengler Cup', 'lední hokej', 'turnaj', 0], ['Champions Hockey League', 'lední hokej', 'klubová soutěž', 0],
    ['National Basketball Association', 'basketbal', 'liga', 1], ['EuroLeague', 'basketbal', 'klubová soutěž', 0], ['FIBA Basketball World Cup', 'basketbal', 'mistrovství světa', 0],
    ['Wimbledon Championships', 'tenis', 'grandslam', 1], ['French Open', 'tenis', 'grandslam', 1], ['US Open (tennis)', 'tenis', 'grandslam', 1], ['Australian Open', 'tenis', 'grandslam', 1],
    ['Davis Cup', 'tenis', 'týmová soutěž', 1], ['Billie Jean King Cup', 'tenis', 'týmová soutěž', 0], ['ATP Finals', 'tenis', 'turnaj', 0], ['Laver Cup', 'tenis', 'týmová soutěž', 0],
    ['Tour de France', 'cyklistika', 'etapový závod', 1], ['Giro d\'Italia', 'cyklistika', 'etapový závod', 1], ['Vuelta a España', 'cyklistika', 'etapový závod', 0],
    ['Paris–Roubaix', 'cyklistika', 'klasika', 0], ['Tour de Suisse', 'cyklistika', 'etapový závod', 0], ['Závod míru', 'cyklistika', 'etapový závod', 0],
    ['Monaco Grand Prix', 'automobilové závody', 'Velká cena', 1], ['24 Hours of Le Mans', 'automobilové závody', 'vytrvalostní závod', 1], ['Indianapolis 500', 'automobilové závody', 'závod', 1],
    ['Dakar Rally', 'automobilové závody', 'rallye', 1], ['Formula One', 'automobilové závody', 'mistrovství světa', 1], ['World Rally Championship', 'automobilové závody', 'mistrovství světa', 0],
    ['MotoGP', 'motocyklové závody', 'mistrovství světa', 0], ['Czechoslovak Grand Prix', 'automobilové závody', 'Velká cena', 0],
    ['Super Bowl', 'americký fotbal', 'finále', 1], ['National Football League', 'americký fotbal', 'liga', 1], ['Major League Baseball', 'baseball', 'liga', 0], ['World Series', 'baseball', 'finále', 0],
    ['Six Nations Championship', 'ragby', 'turnaj', 0], ['Rugby World Cup', 'ragby', 'mistrovství světa', 0],
    ['The Open Championship', 'golf', 'major', 0], ['Masters Tournament', 'golf', 'major', 0], ['Ryder Cup', 'golf', 'týmová soutěž', 0], ['PGA Championship', 'golf', 'major', 0],
    ['Four Hills Tournament', 'skoky na lyžích', 'turné', 1], ['FIS Alpine Ski World Cup', 'alpské lyžování', 'světový pohár', 0], ['Biathlon World Cup', 'biatlon', 'světový pohár', 0],
    ['Tour de Ski', 'běh na lyžích', 'turné', 0], ['Vasaloppet', 'běh na lyžích', 'závod', 0],
    ['Diamond League', 'atletika', 'seriál', 0], ['World Athletics Championships', 'atletika', 'mistrovství světa', 1], ['Zlatá tretra', 'atletika', 'mítink', 0],
    ['Boston Marathon', 'atletika', 'maraton', 0], ['London Marathon', 'atletika', 'maraton', 0], ['New York City Marathon', 'atletika', 'maraton', 0], ['Prague Marathon', 'atletika', 'maraton', 0],
    ['FINA World Aquatics Championships', 'plavání', 'mistrovství světa', 0],
    ['Universiade', 'víceboj', 'univerzitní hry', 0], ['Commonwealth Games', 'víceboj', 'hry', 0],
    ['Asian Games', 'víceboj', 'hry', 0], ['Pan American Games', 'víceboj', 'hry', 0], ['Youth Olympic Games', 'víceboj', 'hry', 0], ['X Games', 'extrémní sporty', 'hry', 0],
    ['Super Rugby', 'ragby', 'klubová soutěž', 0], ['IndyCar Series', 'automobilové závody', 'závodní série', 0], ['Mille Miglia', 'automobilové závody', 'závod', 0],
    ['Isle of Man TT', 'motocyklové závody', 'závod', 0], ['America\'s Cup', 'jachting', 'trofej', 0], ['Volvo Ocean Race', 'jachting', 'závod', 0], ['Vendée Globe', 'jachting', 'závod', 0],
    ['Ironman World Championship', 'triatlon', 'mistrovství světa', 0], ['Snooker World Championship', 'snooker', 'mistrovství světa', 0],
    // Další soutěže přímo podle položky Wikidat (anglický název je víceznačný nebo se změnil)
    ['Q190163', 'lední hokej', 'mistrovství světa', 1], ['Q15804', 'fotbal', 'liga', 1], ['Q82595', 'fotbal', 'liga', 1], ['Q1701273', 'jezdectví', 'dostihy', 1],
    ['Q182165', 'fotbal', 'liga', 0], ['Q19510', 'fotbal', 'liga', 0], ['Q485568', 'fotbal', 'liga', 0], ['Q194052', 'fotbal', 'liga', 0],
    ['Q189327', 'fotbal', 'mistrovství kontinentu', 0], ['Q193041', 'fotbal', 'klubová soutěž', 0], ['Q189188', 'fotbal', 'superpohár', 0],
    ['Q150880', 'fotbal', 'pohár', 0], ['Q169918', 'fotbal', 'pohár', 0], ['Q484028', 'fotbal', 'superpohár', 0], ['Q19323', 'fotbal', 'mistrovství světa', 0],
    ['Q459459', 'fotbal', 'mistrovství Evropy', 0], ['Q1261184', 'fotbal', 'liga', 0], ['Q254716', 'fotbal', 'pohár', 0], ['Q478770', 'fotbal', 'mistrovství Evropy', 0],
    ['Q326418', 'futsal', 'mistrovství světa', 0], ['Q223251', 'lední hokej', 'mistrovství Evropy', 0], ['Q1754117', 'lední hokej', 'mistrovství světa', 0],
    ['Q1057427', 'lední hokej', 'turnaj', 0], ['Q605945', 'lední hokej', 'turnaj', 0], ['Q1374739', 'lední hokej', 'seriál', 0], ['Q1166017', 'lední hokej', 'trofej', 0],
    ['Q456107', 'lední hokej', 'liga', 0], ['Q169519', 'lední hokej', 'liga', 0], ['Q688866', 'lední hokej', 'liga', 0], ['Q163071', 'lední hokej', 'liga', 0],
    ['Q193141', 'basketbal', 'mistrovství Evropy', 0], ['Q842375', 'basketbal', 'finále', 0], ['Q2664980', 'basketbal', 'liga', 0],
    ['Q205570', 'házená', 'mistrovství světa', 0], ['Q3118005', 'házená', 'mistrovství Evropy', 0], ['Q330395', 'házená', 'klubová soutěž', 0],
    ['Q22669035', 'volejbal', 'mistrovství světa', 0], ['Q422986', 'florbal', 'mistrovství světa', 0], ['Q11179672', 'florbal', 'liga', 0],
    ['Q974505', 'tenis', 'turnaj', 0], ['Q331570', 'tenis', 'týmová soutěž', 0], ['Q220347', 'tenis', 'turnaj', 0],
    ['Q34009', 'cyklistika', 'klasika', 0], ['Q33970', 'cyklistika', 'klasika', 0], ['Q34032', 'cyklistika', 'klasika', 0], ['Q506424', 'cyklistika', 'mistrovství světa', 0],
    ['Q487654', 'cyklistika', 'etapový závod', 0], ['Q662746', 'cyklistika', 'etapový závod', 0],
    ['Q850292', 'motocyklové závody', 'mistrovství světa', 0], ['Q319565', 'automobilové závody', 'závodní série', 0], ['Q725531', 'automobilové závody', 'rallye', 0],
    ['Q233929', 'automobilové závody', 'závodní série', 0], ['Q1548846', 'automobilové závody', 'Velká cena', 0], ['Q2609272', 'automobilové závody', 'rallye', 0],
    ['Q3505844', 'motocyklové závody', 'závod', 0], ['Q8019', 'automobilové závody', 'Velká cena', 0], ['Q8036', 'automobilové závody', 'Velká cena', 0],
    ['Q7954', 'automobilové závody', 'Velká cena', 0], ['Q7870', 'automobilové závody', 'Velká cena', 0], ['Q9233', 'automobilové závody', 'Velká cena', 0],
    ['Q210707', 'atletika', 'mistrovství Evropy', 0], ['Q725169', 'atletika', 'mistrovství světa', 0], ['Q161222', 'atletika', 'maraton', 0],
    ['Q1071822', 'atletika', 'maraton', 0], ['Q1536838', 'atletika', 'půlmaraton', 0],
    ['Q646317', 'biatlon', 'mistrovství světa', 0], ['Q943691', 'alpské lyžování', 'mistrovství světa', 0], ['Q937571', 'klasické lyžování', 'mistrovství světa', 0],
    ['Q74804', 'skoky na lyžích', 'světový pohár', 0], ['Q195537', 'běh na lyžích', 'světový pohár', 0], ['Q285389', 'krasobruslení', 'mistrovství světa', 0],
    ['Q466099', 'běh na lyžích', 'závod', 0], ['Q1542651', 'jezdectví', 'dostihy', 0], ['Q422296', 'jezdectví', 'dostihy', 0],
    ['Q887604', 'veslování', 'závod', 0], ['Q1413606', 'veslování', 'mistrovství světa', 0], ['Q2547839', 'kanoistika', 'mistrovství světa', 0],
    ['Q1473250', 'judo', 'mistrovství světa', 0], ['Q1349088', 'zápas', 'mistrovství světa', 0], ['Q246747', 'box', 'mistrovství světa', 0],
    ['Q641572', 'víceboj', 'hry', 0], ['Q673097', 'víceboj', 'hry', 0], ['Q272090', 'víceboj', 'hry', 0], ['Q498635', 'víceboj', 'hry', 0],
    ['Q192202', 'kriket', 'mistrovství světa', 0], ['Q396412', 'kriket', 'liga', 0], ['Q502948', 'snooker', 'mistrovství světa', 0],
    ['Q271725', 'kulturistika', 'soutěž', 0], ['Q1191199', 'gymnastika', 'mistrovství světa', 0]
];
// Popisy klubů z Wikidat, které opakují název („golden State Warriors je basketbalový tým…“)
const CLUB_DESCRIPTIONS = { Q157376: 'americký basketbalový tým hrající NBA' };
const isQid = (text) => /^Q\d+$/.test(text);
// Popisy soutěží z Wikidat, které jsou chybné (klasiky v Belgii „v Itálii“, „v Holandsku“)
const COMPETITION_DESCRIPTIONS = {
    Q34009: 'jednodenní cyklistický závod v Belgii, jeden z tzv. „Monumentů“',
    Q33970: 'jednodenní cyklistický závod v Belgii, jeden z tzv. „Monumentů“',
    // Popis „závody v běhu na lyžích“ by opakoval nápovědu se sportem
    Q466099: 'každoroční dálkový závod v Jizerských horách u Liberce'
};

const first = (list) => list && list.length ? list[0] : undefined;

// Podrobnosti z Wikidat pro dávku položek: pole podle klíče (t, n, d, im, sl, …), víc hodnot jen u klíčů v MULTI
const MULTI = new Set(['occ', 'sportl', 'loc', 'land', 'landid', 'city', 'cityco', 'arena', 'league', 'organizer']);
const DETAIL_UNIONS = `
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("from" AS ?p) }
  UNION { ?item wdt:P1619 ?v BIND("opened" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P1083 ?v BIND("cap" AS ?p) }
  UNION { ?item wdt:P17 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("land" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("landid" AS ?p) }
  UNION { ?item wdt:P159 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("city" AS ?p) }
  UNION { ?item wdt:P159 ?o . ?o wdt:P625 ?v BIND("cityco" AS ?p) }
  UNION { ?item wdt:P131 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("loc" AS ?p) }
  UNION { ?item wdt:P115 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("arena" AS ?p) }
  UNION { ?item wdt:P118 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("league" AS ?p) }
  UNION { ?item wdt:P466 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("occ" AS ?p) }
  UNION { ?item wdt:P664 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("organizer" AS ?p) }
  UNION { ?item wdt:P641 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("sportl" AS ?p) }`;
// V mezipaměti po položkách: při rozšíření výběru se dostahují jen nové; vrací jen požadované (v mezipaměti můžou být i dřívější)
const fetchDetails = async (name, qids) => {
    const all = await fetchAllDetails(name, qids);
    return new Map(qids.filter(qid => all.has(qid)).map(qid => [qid, all.get(qid)]));
};
const fetchAllDetails = async (name, qids) => cachedEntries(name, qids, async (missing) => {
    const result = new Map(missing.map(qid => [qid, {}]));
    await inBatches(missing, 50, (batch) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(batch)} } ${DETAIL_UNIONS} }`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const v = row.v.value;
        const raw = key === 'landid' ? id(v) : v;
        if (MULTI.has(key)) entry[key] = [...new Set([...(entry[key] || []), raw])];
        else if (!(key in entry)) entry[key] = v;
    }, detailsRun);
    return [...result];
});

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const pointOf = (detail) => parsePoint(detail.coord) || parsePoint(first(detail.cityco));

export const buildExtra = async ({ thisYear }) => {
    const items = [];

    // ---------- Kluby ----------
    const clubClassIds = Object.keys(CLUB_CLASSES);
    const clubSportIds = Object.keys(CLUB_SPORTS);
    const clubCandidates = new Map(await cached('sport-club-candidates-v4', async () => {
        const result = new Map();
        const add = (rows) => rows.forEach(row => {
            const qid = id(row.x.value);
            const entry = result.get(qid) || { sl: Number(row.sl.value), sports: [] };
            const sport = CLUB_CLASSES[id(row.k.value)];
            if (!entry.sports.includes(sport)) entry.sports.push(sport);
            result.set(qid, entry);
        });
        const base = `?x wdt:P31 ?k ; wikibase:sitelinks ?sl . ${CS_ARTICLE}`;
        add(await qlever(`SELECT ?x ?k ?sl WHERE { VALUES ?k { ${values(clubClassIds)} } ${base} FILTER(?sl >= ${CLUB_SITELINKS}) }`));
        // České a slovenské kluby mají méně článků v jiných jazycích
        add(await qlever(`SELECT ?x ?k ?sl WHERE { VALUES ?k { ${values(clubClassIds)} } VALUES ?c { ${values([...CZ_STATES, 'Q214'])} } ?x wdt:P17 ?c . ${base} FILTER(?sl >= ${CZECH_CLUB_SITELINKS} && ?sl < ${CLUB_SITELINKS}) }`));
        // Známé kluby podle názvu (třída týmu bývá u velkých klubů různá: „mužský fotbalový tým“, „profesionální tým“…)
        const labels = KNOWN_CLUBS.map(name => `"${name.replace(/"/g, '')}"@en`).join(' ');
        const known = await qlever(`SELECT ?x ?l ?sl ?sport WHERE { VALUES ?l { ${labels} } VALUES ?sport { ${values(clubSportIds)} }
  ?x rdfs:label ?l ; wikibase:sitelinks ?sl ; wdt:P641 ?sport . ${CS_ARTICLE} FILTER NOT EXISTS { ?x wdt:P31 wd:Q5 } }`);
        // Tým bez údaje o sportu: sport podle třídy týmu
        for (const row of await qlever(`SELECT ?x ?l ?sl ?k WHERE { VALUES ?l { ${labels} } VALUES ?k { ${values(clubClassIds)} }
  ?x rdfs:label ?l ; wikibase:sitelinks ?sl ; wdt:P31 ?k . ${CS_ARTICLE} }`)) known.push({ ...row, sport: { value: `http://www.wikidata.org/entity/${CLUB_CLASSES[id(row.k.value)]}` } });
        const best = new Map();
        for (const row of known) {
            const name = row.l.value;
            if (!best.has(name) || Number(row.sl.value) > best.get(name).sl) best.set(name, { qid: id(row.x.value), sl: Number(row.sl.value) });
        }
        for (const { qid, sl } of best.values()) {
            const rows = known.filter(row => id(row.x.value) === qid);
            const entry = result.get(qid) || { sl, sports: [] };
            for (const row of rows) { const sport = id(row.sport.value); if (!entry.sports.includes(sport)) entry.sports.push(sport); }
            entry.known = true;
            result.set(qid, entry);
        }
        return [...result];
    }));
    // Všechny kluby zámořských lig a nejvyšších českých soutěží (bez zaniklých)
    // Jen týmy a kluby (P118 mají i ročníky soutěže a finále – Super Bowl LX)
    const leagueClubs = await cached('sport-league-clubs-v3', async () => (await qlever(`SELECT DISTINCT ?x ?l ?sl WHERE {
  VALUES ?l { ${values(Object.keys(LEAGUE_SPORTS))} } VALUES ?team { wd:Q12973014 wd:Q847017 }
  ?x wdt:P118 ?l ; wikibase:sitelinks ?sl ; wdt:P31/wdt:P279* ?team . ${CS_ARTICLE}
  FILTER NOT EXISTS { ?x wdt:P31 wd:Q5 } FILTER NOT EXISTS { ?x wdt:P576 ?end } }`)).map(row => [id(row.x.value), id(row.l.value), Number(row.sl.value)]));
    // Sport podle ligy má přednost (Toronto Maple Leafs mají ve Wikidatech omylem i basketbal)
    const leagueSports = new Map();
    for (const [qid, league, sl] of leagueClubs) {
        leagueSports.set(qid, [...new Set([...(leagueSports.get(qid) || []), LEAGUE_SPORTS[league]])]);
        clubCandidates.set(qid, { ...(clubCandidates.get(qid) || { sl }), sports: leagueSports.get(qid) });
    }
    const clubIds = [...clubCandidates.keys()];
    const clubDetails = await fetchDetails('sport-club-details-v4', clubIds);
    // Klub bez sídla (P159) a souřadnic: poloha domácího stadionu (P115) a město podle umístění (P131)
    const homeless = clubIds.filter(qid => !pointOf(clubDetails.get(qid)));
    const clubPlaces = await cachedEntries('sport-club-places', homeless, async (qids) => {
        const result = new Map();
        await inBatches(qids, 100, (batch) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(batch)} }
  { ?item wdt:P115 ?o . ?o wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P131 ?o . ?o rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("city" AS ?p) }
  UNION { ?item wdt:P131 ?o . ?o wdt:P625 ?v BIND("cityco" AS ?p) } }`, (row) => {
            const qid = id(row.item.value);
            const entry = result.get(qid) || {};
            if (!(row.p.value in entry)) entry[row.p.value] = row.v.value;
            result.set(qid, entry);
        }, detailsRun);
        return [...result];
    });
    for (const qid of homeless) {
        const place = clubPlaces.get(qid);
        const detail = clubDetails.get(qid);
        if (!place) continue;
        if (place.coord && !detail.coord) detail.coord = place.coord;
        if (place.city && !first(detail.city)) detail.city = [place.city];
        if (place.cityco && !first(detail.cityco)) detail.cityco = [place.cityco];
    }
    const clubRows = [...clubDetails.entries()]
        .map(([qid, detail]) => ({ qid, detail, candidate: clubCandidates.get(qid) }))
        .filter(({ detail, candidate }) => detail.t && detail.n && candidate.sports.length === 1 && !NOT_CLUB.test(`${detail.t} ${detail.n} ${detail.d || ''}`))
        .sort((a, b) => b.candidate.sl - a.candidate.sl);
    for (const { qid, detail, candidate } of clubRows) {
        const [sport, kind] = CLUB_SPORTS[candidate.sports[0]];
        const land = first(detail.land);
        const point = pointOf(detail);
        // Bez města a roku vzniku nemá klub čím napovídat (jen zemí). Český klub bez polohy, fotky i města nemá ve hře nápovědu
        // (země je vidět z popisu „český klub“, aréna nese jméno města – HC Děčín, Zimní stadion Děčín)
        if (!land || !(first(detail.city) || yearOf(detail.from))) continue;
        if (CZ_LANDS.has(land) && !point && !(detail.im && !NOT_PHOTO.test(detail.im)) && !first(detail.city)) continue;
        const czech = CZ_LANDS.has(land);
        const from = yearOf(detail.from);
        items.push(compact({
            q: qid, t: detail.t, n: capitalize(detail.n.replace(/\s*\([^)]*\)\s*$/, '')), c: 'kluby',
            k: candidate.known ? 1 : 0,
            ty: kind, d: CLUB_DESCRIPTIONS[qid] || detail.d, cz: czech ? 1 : undefined,
            ...imageFields(detail.im && !NOT_PHOTO.test(detail.im) ? detail.im : undefined),
            la: point ? point.lat : undefined, lo: point ? point.lon : undefined,
            f: compact({
                sport, land, city: first(detail.city), from: from && from <= thisYear ? from : undefined, arena: first(detail.arena), league: first(detail.league),
                y: from && from <= thisYear ? from : undefined
            }),
            sl: candidate.sl
        }));
    }

    // ---------- Sportoviště ----------
    const venueClassIds = Object.keys(VENUE_CLASSES);
    const venueCandidates = new Map(await cached('sport-venue-candidates', async () => {
        const result = new Map();
        const add = (rows) => rows.forEach(row => {
            const qid = id(row.x.value);
            const entry = result.get(qid) || { sl: Number(row.sl.value), classes: [] };
            if (!entry.classes.includes(id(row.k.value))) entry.classes.push(id(row.k.value));
            result.set(qid, entry);
        });
        const base = `?x wdt:P31/wdt:P279* ?k ; wikibase:sitelinks ?sl ; wdt:P625 ?pt ; wdt:P18 ?im . ${CS_ARTICLE}`;
        add(await qlever(`SELECT ?x ?k ?sl WHERE { VALUES ?k { ${values(venueClassIds)} } ${base} FILTER(?sl >= 22) }`));
        add(await qlever(`SELECT ?x ?k ?sl WHERE { VALUES ?k { ${values(venueClassIds)} } VALUES ?c { ${values(CZ_STATES)} } ?x wdt:P17 ?c . ${base} FILTER(?sl >= 8 && ?sl < 22) }`));
        return [...result];
    }));
    const knownVenues = new Map(await cached('sport-known-venues-v3', async () => {
        const rows = await qlever(`SELECT ?x ?l ?sl ?k WHERE { VALUES ?l { ${KNOWN_VENUES.map(name => `"${name.replace(/"/g, '')}"@en`).join(' ')} } VALUES ?k { ${values(venueClassIds)} }
  ?x rdfs:label ?l ; wikibase:sitelinks ?sl ; wdt:P625 ?pt ; wdt:P31/wdt:P279* ?k . ${CS_ARTICLE} }`);
        // Víc položek se stejným názvem: nejvíc článků vyhrává
        const best = new Map();
        for (const row of rows) {
            const name = row.l.value;
            const sl = Number(row.sl.value);
            if (!best.has(name) || sl > best.get(name).sl) best.set(name, { qid: id(row.x.value), sl, classes: [] });
        }
        for (const row of rows) {
            const entry = best.get(row.l.value);
            if (entry.qid === id(row.x.value) && !entry.classes.includes(id(row.k.value))) entry.classes.push(id(row.k.value));
        }
        return [...best.values()].map(entry => [entry.qid, { sl: entry.sl, classes: entry.classes }]);
    }));
    // Závodní okruhy od 10 článků (s fotkou) a česká sportoviště od 5 článků
    const moreVenues = await cached('sport-venue-candidates-more', async () => {
        const base = `?x wdt:P31/wdt:P279* ?k ; wikibase:sitelinks ?sl ; wdt:P625 ?pt ; wdt:P18 ?im . ${CS_ARTICLE}`;
        return [
            ...await qlever(`SELECT ?x ?k ?sl WHERE { VALUES ?k { wd:Q1777138 } ${base} FILTER(?sl >= 10 && ?sl < 22) }`),
            ...await qlever(`SELECT ?x ?k ?sl WHERE { VALUES ?k { ${values(venueClassIds)} } VALUES ?c { ${values(CZ_STATES)} } ?x wdt:P17 ?c . ${base} FILTER(?sl >= 5 && ?sl < 8) }`)
        ].map(row => [id(row.x.value), id(row.k.value), Number(row.sl.value)]);
    });
    for (const [qid, kind, sl] of moreVenues) {
        const entry = venueCandidates.get(qid) || { sl, classes: [] };
        if (!entry.classes.includes(kind)) entry.classes.push(kind);
        venueCandidates.set(qid, entry);
    }
    const knownVenueIds = new Set(knownVenues.keys());
    for (const [qid, entry] of knownVenues) if (!venueCandidates.has(qid)) venueCandidates.set(qid, entry);
    const venueIds = [...venueCandidates.keys()];
    const venueDetails = await fetchDetails('sport-venue-details-v2', venueIds);
    const venueRows = [...venueDetails.entries()]
        .map(([qid, detail]) => ({ qid, detail, candidate: venueCandidates.get(qid) }))
        .filter(({ detail }) => detail.t && detail.n && detail.im && !NOT_VENUE_PHOTO.test(decodeURIComponent(detail.im.split('/').pop())))
        .filter(({ detail }) => !NOT_VENUE.test(`${detail.t} ${detail.n} ${detail.d || ''}`))
        // Aréna bez sportu a bez domácího týmu bývá koncertní a kongresový sál
        .filter(({ detail, candidate }) => !candidate.classes.includes('Q641226') || candidate.classes.includes('Q483110') || (detail.sportl || []).length || (detail.occ || []).length)
        .sort((a, b) => b.candidate.sl - a.candidate.sl);
    for (const { qid, detail, candidate } of venueRows) {
        const land = first(detail.land);
        const point = parsePoint(detail.coord);
        if (!land || !point) continue;
        // Druh podle nejužšího: okruh, velodrom, stadion; aréna jen když to stadion není
        const classes = candidate.classes;
        const horses = HORSE_TRACK.test(`${detail.n} ${detail.d || ''}`) && !/motor|automobil|okruh/iu.test(`${detail.n} ${detail.d || ''}`);
        const kind = classes.includes('Q1777138') ? (horses ? 'dostihové závodiště' : 'závodní okruh') : classes.includes('Q830893') ? 'velodrom'
            : classes.includes('Q483110') ? 'stadion' : classes.includes('Q641226') ? 'aréna' : 'stadion';
        const opened = yearOf(detail.opened) ?? yearOf(detail.from);
        const czech = CZ_LANDS.has(land);
        const capacity = detail.cap ? Math.round(Number(detail.cap)) : undefined;
        items.push(compact({
            q: qid, t: detail.t, n: capitalize(detail.n), c: 'sportoviste',
            k: knownVenueIds.has(qid) ? 1 : 0,
            ty: kind, d: detail.d, cz: czech ? 1 : undefined,
            ...imageFields(detail.im),
            la: point.lat, lo: point.lon,
            f: compact({
                land, loc: first(detail.loc), opened: opened && opened <= thisYear ? opened : undefined,
                capacity: capacity > 100 && capacity < 1e6 ? capacity : undefined,
                tenants: (detail.occ || []).slice(0, 3), sports: (detail.sportl || []).slice(0, 3),
                y: opened && opened <= thisYear ? opened : undefined
            }),
            sl: candidate.sl
        }));
    }

    // ---------- Soutěže ----------
    const competitionIds = new Map(await cached('sport-competition-ids', async () => {
        const rows = await qlever(`SELECT ?x ?l ?sl WHERE { VALUES ?l { ${COMPETITIONS.filter(([name]) => !isQid(name)).map(([name]) => `"${name.replace(/"/g, '')}"@en`).join(' ')} } ?x rdfs:label ?l ; wikibase:sitelinks ?sl . ${CS_ARTICLE} }`);
        // Víc položek se stejným názvem (ročníky, města): nejvíc článků vyhrává
        const best = new Map();
        for (const row of rows) {
            const name = row.l.value;
            if (!best.has(name) || Number(row.sl.value) > best.get(name).sl) best.set(name, { qid: id(row.x.value), sl: Number(row.sl.value) });
        }
        return [...best.entries()].map(([name, { qid, sl }]) => [qid, { name, sl }]);
    }));
    for (const [qid] of COMPETITIONS.filter(([name]) => isQid(name))) if (!competitionIds.has(qid)) competitionIds.set(qid, { name: qid });
    const competitionDetails = await fetchDetails('sport-competition-details', [...competitionIds.keys()]);
    for (const [qid, { name, sl: labelSl }] of competitionIds) {
        const detail = competitionDetails.get(qid);
        const spec = COMPETITIONS.find(([label]) => label === name);
        if (!detail || !detail.t || !spec) continue;
        // Bez českého štítku (Serie A) platí název článku
        if (!detail.n) detail.n = detail.t.replace(/ \(.*\)$/, '');
        const sl = labelSl ?? Number(detail.sl || 0);
        if (COMPETITION_DESCRIPTIONS[qid]) detail.d = COMPETITION_DESCRIPTIONS[qid];
        const [, sport, kind, known] = spec;
        // Země jen u soutěže, která patří jedné (Major League Baseball má USA i Kanadu)
        const land = (detail.land || []).length === 1 ? detail.land[0] : undefined;
        const from = yearOf(detail.from);
        // Bez roku vzniku a fotky nemá soutěž čím napovídat
        if (!from && !(detail.im && !NOT_PHOTO.test(detail.im))) continue;
        items.push(compact({
            q: qid, t: detail.t, n: capitalize(detail.n), c: 'souteze', k: known ? 1 : 0,
            ty: kind, d: detail.d, cz: land && CZ_LANDS.has(land) ? 1 : undefined,
            ...imageFields(detail.im && !NOT_PHOTO.test(detail.im) ? detail.im : undefined),
            f: compact({
                sport, land, from: from && from <= thisYear ? from : undefined,
                y: from && from <= thisYear ? from : undefined
            }),
            sl
        }));
    }
    return items;
};
