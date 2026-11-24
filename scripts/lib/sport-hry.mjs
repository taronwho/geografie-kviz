// Téma Sport a hry, rozšíření o hry: deskové a karetní hry, šachy a videohry (kategorie deskove, sachy, videohry).
// Používá build-sport.mjs: na konci celého sestavení, nebo samostatně nad hotovým data/sport.json (SPORT_ONLY=hry) – existující
// položky se nemažou ani nemění, nové kategorie jsou na konci seznamu kategorií a jejich položky na konci dat.
//
// Kandidáti: deskové a karetní hry a šachové pojmy z ručních seznamů článků české Wikipedie (třídy Wikidat míchají hry s hlavolamy,
// loteriemi a sporty), videohry ze třídy Wikidat videohra (Q7889) s článkem na české Wikipedii. Vynechají se položky, které už má
// jiné téma (Technika: konzole, počítače, software; Fyzika: Rubikova kostka, Lego). Herní konzole jako kategorie nejsou: skoro
// všechny známé (PlayStation, Xbox, Nintendo, Game Boy, Atari) už má Technika a vynálezy.
//
// Známost: sláva = geometrický průměr návštěvnosti článku české Wikipedie za rok 2025 a počtu jazykových verzí (stejně jako
// u zbytku tématu), české položky ×1,3. Známé jsou nejslavnější nad minimální slávou kategorie a ruční výjimky (KNOWN, NOT_KNOWN);
// pro experty nejméně slavný podíl kategorie. Slavní šachisté nejsou položkami (mezi sportovci šachisté nejsou a část jich má Historie),
// jen fakty u soutěží, partií a počítačů.
import { sparql, id, values, imageFields, yearOf, compact, inBatches, sleep } from './wikidata.mjs';
import { cachedByKey, czechPageviews, knownFloor } from './zemepis-levels.mjs';
import { readFileSync, readdirSync } from 'node:fs';

export const HRY_CATEGORIES = ['deskove', 'sachy', 'videohry'];
const THIS_YEAR = new Date().getFullYear();

// --- Deskové a karetní hry: článek české Wikipedie → druh hry ---
// Druhy: desková hra, karetní hra, sběratelská karetní hra, kostková hra, hra s kameny, hra na hrdiny, válečná hra, hra na papíře, stolní hra
const DESKOVE = {
    'Šachy': 'desková hra', 'Go (desková hra)': 'desková hra', 'Vrhcáby': 'desková hra', 'Dáma (desková hra)': 'desková hra', 'Monopoly': 'desková hra',
    'Bridž': 'karetní hra', 'Scrabble': 'desková hra', 'Blackjack': 'karetní hra', 'Madžong': 'hra s kameny', 'Čínské šachy': 'desková hra',
    'Šógi': 'desková hra', 'Piškvorky': 'hra na papíře', 'Čaturanga': 'desková hra', 'Magic: The Gathering': 'sběratelská karetní hra',
    'Uno (karetní hra)': 'karetní hra', 'Osadníci z Katanu': 'desková hra', 'Mlýn (desková hra)': 'desková hra', 'Baccarat (hazardní hra)': 'karetní hra',
    'Lodě': 'hra na papíře', 'Rummy': 'karetní hra', 'Senet': 'desková hra', 'Královská hra z Uru': 'desková hra', 'Othello (desková hra)': 'desková hra',
    'Whist': 'karetní hra', 'Kanasta': 'karetní hra', 'Ludo': 'desková hra', 'Pokémon Trading Card Game': 'sběratelská karetní hra',
    'Rummikub číselný': 'hra s kameny', 'Čínská dáma': 'desková hra', 'Gomoku': 'desková hra', 'Člověče, nezlob se!': 'desková hra',
    'Maršál a špión': 'desková hra', 'Cestovní piškvorky': 'desková hra', 'Halma': 'desková hra', 'Diplomacie (desková hra)': 'desková hra',
    'Puerto Rico (desková hra)': 'desková hra', 'Pandemic (desková hra)': 'desková hra', 'Dominion (karetní hra)': 'karetní hra',
    '7 divů světa (hra)': 'karetní hra', 'Quoridor': 'desková hra', 'Abalone': 'desková hra', 'Munchkin (karetní hra)': 'karetní hra',
    'Krycí jména': 'karetní hra', 'Černý Petr (karetní hra)': 'karetní hra', 'Agricola (desková hra)': 'desková hra',
    'Vysoké napětí (desková hra)': 'desková hra', 'Blokus': 'desková hra', 'Arkham Horror': 'desková hra', 'Cards Against Humanity': 'karetní hra',
    'Prší': 'karetní hra', 'Jednadvacet': 'karetní hra', '6 bere!': 'karetní hra', 'Bohnanza': 'karetní hra', 'Hnefatafl': 'desková hra',
    'Dobble': 'karetní hra', 'Through the Ages: Příběh civilizace': 'karetní hra', 'Takenoko': 'desková hra', 'Terra Mystica': 'desková hra',
    'Macháček (kostková hra)': 'kostková hra', 'Mariáš': 'karetní hra', 'Žolíky': 'karetní hra', 'Sedma (karetní hra)': 'karetní hra',
    'Kvarteto (karetní hra)': 'karetní hra', 'Domino': 'hra s kameny', 'Poker': 'karetní hra', "Texas hold 'em": 'karetní hra',
    'Carcassonne (desková hra)': 'desková hra', 'Dostihy a sázky': 'desková hra', 'Pexeso': 'karetní hra', 'Dixit': 'karetní hra',
    'Jenga': 'stolní hra', 'Pasiáns': 'karetní hra', 'Skat': 'karetní hra', 'Kent (karetní hra)': 'karetní hra', 'Taroky': 'karetní hra',
    'Mankala': 'desková hra', 'Dungeons & Dragons': 'hra na hrdiny', 'Dračí doupě': 'hra na hrdiny', 'Warhammer 40,000': 'válečná hra',
    'Šibenice (hra)': 'hra na papíře', 'Lóra': 'karetní hra', 'Ferbl': 'karetní hra', 'Tichu': 'karetní hra', 'Stolní fotbal': 'stolní hra',
    'Yu-Gi-Oh!': 'sběratelská karetní hra', 'Bang! (karetní hra)': 'karetní hra'
};
// Názvy, které se běžně píšou jinak než článek (Monopoly × Dostihy), a další přijímané odpovědi
export const DESKOVE_ALIASES = {
    'Vrhcáby': ['backgammon'], 'Člověče, nezlob se!': ['Člověče nezlob se'], 'Madžong': ['mahjong', 'mah-jongg'], 'Go': ['baduk', 'weiqi'],
    'Osadníci z Katanu': ['Catan', 'Katan'], 'Čínské šachy': ['xiangqi'], 'Šógi': ['shogi', 'japonské šachy'], 'Othello': ['reversi'],
    'Pasiáns': ['solitaire', 'solitér'], 'Rummikub číselný': ['Rummikub'], 'Magic: The Gathering': ['Magic', 'MTG'], 'Jednadvacet': ['oko bere'],
    "Texas hold 'em": ['Texas holdem', 'hold em'], 'Pokémon Trading Card Game': ['Pokémon TCG', 'pokémon karty'], 'Dungeons & Dragons': ['D&D', 'DnD'],
    'Krycí jména': ['Codenames'], 'Warhammer 40,000': ['Warhammer 40k', 'Warhammer'], 'Dostihy a sázky': ['Dostihy'], 'Piškvorky': ['tic-tac-toe'],
    'Mankala': ['mancala'], 'Taroky': ['tarok']
};
// České hry (česká stopa): autor nebo vydavatel z Česka, česká lidová karetní hra
const DESKOVE_CZ = new Set(['Krycí jména', 'Dostihy a sázky', 'Through the Ages: Příběh civilizace', 'Mariáš', 'Lóra', 'Dračí doupě', 'Pexeso', 'Prší', 'Ferbl', 'Kent (karetní hra)']);
// Ruční údaje, které Wikidata nemají nebo mají chybně: autor, rok, země původu, počet hráčů (min, max)
const DESKOVE_FIX = {
    'Krycí jména': { by: ['Vlaada Chvátil'], year: 2015, land: 'Česko', min: 2, max: 8 },
    'Through the Ages: Příběh civilizace': { by: ['Vlaada Chvátil'], year: 2006, land: 'Česko', min: 2, max: 4 },
    'Dostihy a sázky': { land: 'Česko', min: 2, max: 6, year: 1984 },
    'Dračí doupě': { year: 1990, land: 'Česko' },
    'Osadníci z Katanu': { by: ['Klaus Teuber'], year: 1995, land: 'Německo', min: 3, max: 4 },
    'Carcassonne (desková hra)': { by: ['Klaus-Jürgen Wrede'], year: 2000, land: 'Německo', min: 2, max: 5 },
    'Monopoly': { year: 1935, land: 'Spojené státy americké', min: 2, max: 8 },
    'Scrabble': { by: ['Alfred Mosher Butts'], year: 1938, land: 'Spojené státy americké', min: 2, max: 4 },
    'Člověče, nezlob se!': { year: 1914, land: 'Německo', min: 2, max: 4 },
    'Uno (karetní hra)': { by: ['Merle Robbins'], year: 1971, land: 'Spojené státy americké', min: 2, max: 10 },
    'Dixit': { by: ['Jean-Louis Roubira'], year: 2008, land: 'Francie', min: 3, max: 6 },
    'Pandemic (desková hra)': { by: ['Matt Leacock'], year: 2008, min: 2, max: 4 },
    'Dungeons & Dragons': { by: ['Gary Gygax', 'Dave Arneson'], year: 1974, land: 'Spojené státy americké' },
    'Magic: The Gathering': { by: ['Richard Garfield'], year: 1993, land: 'Spojené státy americké' },
    'Jenga': { by: ['Leslie Scott'], year: 1983, land: 'Spojené království' },
    'Dobble': { year: 2009, land: 'Francie', min: 2, max: 8 },
    'Mariáš': { land: 'Česko', min: 2, max: 4 },
    'Prší': { land: 'Česko', min: 2, max: 6 },
    'Šachy': { min: 2, max: 2 }, 'Go (desková hra)': { min: 2, max: 2, land: 'Čína' }, 'Dáma (desková hra)': { min: 2, max: 2 },
    'Šógi': { min: 2, max: 2, land: 'Japonsko' }, 'Čínské šachy': { min: 2, max: 2, land: 'Čína' }, 'Vrhcáby': { min: 2, max: 2 },
    'Bridž': { min: 4, max: 4 }, 'Mlýn (desková hra)': { min: 2, max: 2 }, 'Lodě': { min: 2, max: 2 }, 'Piškvorky': { min: 2, max: 2 },
    'Madžong': { min: 4, max: 4, land: 'Čína' }, 'Senet': { land: 'Starověký Egypt' }, 'Čaturanga': { land: 'Indie' },
    'Královská hra z Uru': { land: 'Mezopotámie' }, 'Pexeso': { land: 'Česko' },
    'Blackjack': { min: 2, max: 8 }, 'Baccarat (hazardní hra)': { land: 'Itálie', min: 2 }, 'Rummy': { min: 2, max: 6 }, 'Černý Petr (karetní hra)': { min: 3, max: 8 },
    'Jednadvacet': { min: 2, max: 10 }, 'Hnefatafl': { min: 2, max: 2, land: 'Skandinávie' }, 'Macháček (kostková hra)': { min: 2 }, 'Žolíky': { min: 2, max: 6 },
    'Poker': { min: 2, max: 10, land: 'Spojené státy americké' }, 'Pasiáns': { min: 1, max: 1 }, 'Kent (karetní hra)': { min: 4, max: 4 }, 'Taroky': { min: 3, max: 4 },
    'Mankala': { min: 2, max: 2, land: 'Afrika' }, 'Šibenice (hra)': { min: 2 }, 'Lóra': { min: 4, max: 4 }, 'Ferbl': { min: 2, max: 6 }, 'Stolní fotbal': { min: 2, max: 4 }
};

// --- Šachy: článek → druh a ruční fakta ---
// Druh: figura, zahájení, pravidlo, motiv (taktika a strategie), mat (matový obrazec), vybavení, titul, organizace, soutěž, partie,
// počítač, varianta. Ruční fakta: value = hodnota figury v pěšcích, count = počet na začátku partie (jedné strany), move = tah figury;
// u soutěží, partií a počítačů slavní šachisté (champ, players, beat) – šachisté nejsou položkami
const SACHY = {
    'Král (šachy)': { ty: 'figura', count: 1, move: 'o jedno pole libovolným směrem', value: 'nevyčíslitelná (jeho mat končí partii)' },
    'Dáma (šachy)': { ty: 'figura', count: 1, move: 'libovolně daleko rovně i šikmo', value: 9 },
    'Věž (šachy)': { ty: 'figura', count: 2, move: 'libovolně daleko rovně (po řadách a sloupcích)', value: 5 },
    'Střelec (šachy)': { ty: 'figura', count: 2, move: 'libovolně daleko šikmo (po diagonálách)', value: 3 },
    'Jezdec (šachy)': { ty: 'figura', count: 2, move: 'skokem do tvaru písmene L (dvě pole rovně a jedno stranou)', value: 3 },
    'Pěšec': { ty: 'figura', count: 8, move: 'o jedno pole vpřed (z výchozí pozice i o dvě), bere šikmo', value: 1 },
    'Šach': { ty: 'pravidlo', rule: 'král je napaden a hráč musí hrozbu hned odvrátit' },
    'Mat': { ty: 'pravidlo', rule: 'napadený král nemá kam uniknout ani se ubránit – partie končí' },
    'Pat': { ty: 'pravidlo', rule: 'hráč na tahu nemá žádný povolený tah, ale jeho král napaden není – remíza' },
    'Rošáda': { ty: 'pravidlo', rule: 'král se posune o dvě pole k věži a věž přeskočí vedle něj' },
    'Braní mimochodem': { ty: 'pravidlo', rule: 'pěšec sebere soupeřova pěšce, který ho minul dvojkrokem' },
    'Dotknuto-hráno': { ty: 'pravidlo', rule: 'figurou, které se hráč dotkl, musí táhnout' },
    'Věčný šach': { ty: 'pravidlo', rule: 'jeden hráč dává šach za šachem a partie skončí remízou' },
    'Dvojšach': { ty: 'motiv', rule: 'krále napadají naráz dvě figury' },
    'Nevýhoda tahu': { ty: 'motiv', rule: 'každý možný tah pozici zhorší, nejlepší by bylo netáhnout' },
    'Vidlička (šachy)': { ty: 'motiv', rule: 'jedna figura napadá naráz dvě soupeřovy figury' },
    'Vazba (šachy)': { ty: 'motiv', rule: 'figura nesmí uhnout, protože by odkryla krále nebo cennější figuru' },
    'Oběť dámy': { ty: 'motiv', rule: 'hráč úmyslně dá soupeři nejsilnější figuru za útok' },
    'Gambit': { ty: 'motiv', rule: 'v zahájení se obětuje pěšec za rychlejší vývin figur' },
    'Fianchetto': { ty: 'motiv', rule: 'střelec stojí na dlouhé diagonále za posunutým pěšcem g nebo b' },
    'Tempo (šachy)': { ty: 'motiv', rule: 'tah navíc nebo méně ve vývinu figur' },
    'Opozice (šachy)': { ty: 'motiv', rule: 'králové stojí proti sobě a mezi nimi je jedno pole' },
    'Šachová koncovka': { ty: 'motiv', rule: 'závěrečná fáze partie, kdy na šachovnici zbývá málo figur' },
    'Hypermodernismus': { ty: 'motiv', rule: 'střed šachovnice se ovládá figurami z dálky, ne obsazením pěšci' },
    'Mat bláznů': { ty: 'mat', rule: 'nejrychlejší možný konec partie, černý vyhraje už svým druhým tahem' },
    'Ovčácký mat': { ty: 'mat', rule: 'dáma podporovaná střelcem matuje na poli f7 už ve čtvrtém tahu' },
    'Dušený mat': { ty: 'mat', rule: 'jezdec matuje krále obklopeného vlastními figurami' },
    'Légalův mat': { ty: 'mat', rule: 'po oběti dámy matují v zahájení lehké figury' },
    'Mat na poslední řadě': { ty: 'mat', rule: 'věž nebo dáma matuje krále uvězněného za vlastními pěšci' },
    'Šachovnice': { ty: 'vybavení', rule: '64 polí, 8 × 8, střídavě světlých a tmavých' },
    'Šachové hodiny': { ty: 'vybavení', rule: 'dvoje hodiny – hráč po tahu zastaví svůj čas a spustí soupeřův' },
    'Šachová notace': { ty: 'vybavení', rule: 'zápis tahů písmenem figury a polem, třeba Jf3' },
    'Elo': { ty: 'vybavení', rule: 'číslo síly hráče, po výhře roste a po prohře klesá; nejlepší mají přes 2800' },
    'Šachový velmistr': { ty: 'titul', year: 1950, by: ['FIDE'], rule: 'nejvyšší doživotní titul, potřebuje hodnocení aspoň 2500' },
    'Mezinárodní mistr': { ty: 'titul', rule: 'titul o stupeň nižší než nejvyšší, hodnocení aspoň 2400' },
    'Mistr FIDE': { ty: 'titul', rule: 'titul pro hráče s hodnocením aspoň 2300' },
    'Mezinárodní šachová federace': { ty: 'organizace', year: 1924, rule: 'pořádá mistrovství světa a uděluje šachové tituly' },
    'Mistrovství světa v šachu': { ty: 'soutěž', year: 1886, champ: ['Wilhelm Steinitz', 'Garri Kasparov', 'Bobby Fischer', 'Magnus Carlsen'] },
    'Mistrovství světa v šachu žen': { ty: 'soutěž', year: 1927, champ: ['Věra Menčíková', 'Maia Čiburdanidzeová', 'Ju Wen-ťün'] },
    'Šachová olympiáda': { ty: 'soutěž', year: 1927 },
    'Turnaj kandidátů v šachu': { ty: 'soutěž', year: 1950 },
    'Šachový turnaj ve Wijku aan Zee': { ty: 'soutěž', year: 1938, champ: ['Magnus Carlsen', 'Viswanathan Ánand'] },
    'Šachový turnaj v Linaresu': { ty: 'soutěž', year: 1978, champ: ['Garri Kasparov', 'Veselin Topalov'] },
    'Mezipásmový turnaj v šachu': { ty: 'soutěž', year: 1948 },
    'Mistrovství světa v šachu 2024': { ty: 'soutěž', year: 2024, players: ['Gukeš Dommaradžu', 'Ting Li-žen'], place: 'Singapur' },
    'Šachový turnaj v Londýně 1851': { ty: 'soutěž', year: 1851, champ: ['Adolf Anderssen'], place: 'Londýn' },
    'Šachový turnaj v New Yorku roku 1924': { ty: 'soutěž', year: 1924, champ: ['Emanuel Lasker'], place: 'New York' },
    'Nesmrtelná partie': { ty: 'partie', year: 1851, players: ['Adolf Anderssen', 'Lionel Kieseritzky'], place: 'Londýn' },
    'Nevadnoucí partie': { ty: 'partie', year: 1852, players: ['Adolf Anderssen', 'Jean Dufresne'], place: 'Berlín' },
    'Partie století': { ty: 'partie', year: 1956, players: ['Donald Byrne', 'Bobby Fischer'], place: 'New York' },
    'Operní partie': { ty: 'partie', year: 1858, players: ['Paul Morphy', 'vévoda Karel Brunšvický a hrabě Isouard'], place: 'Paříž' },
    'Deep Blue': { ty: 'počítač', year: 1996, by: ['IBM'], beat: 'Garri Kasparov (1997)' },
    'Turek (stroj)': { ty: 'počítač', year: 1770, by: ['Wolfgang von Kempelen'] },
    'Stockfish (šachy)': { ty: 'počítač', year: 2008 },
    'Šachový engine': { ty: 'počítač', rule: 'program, který propočítává tahy a hodnotí pozici' },
    'Fischerovy šachy': { ty: 'varianta', year: 1996, by: ['Bobby Fischer'], rule: 'náhodné výchozí postavení figur' },
    'Bleskový šach': { ty: 'varianta', rule: 'na celou partii jen pár minut (obvykle 3–5)' },
    'Rapid šach': { ty: 'varianta', rule: 'na partii 10 až 60 minut' },
    'Korespondenční šach': { ty: 'varianta', rule: 'tahy se posílají poštou nebo přes internet, na tah jsou i dny' },
    'Partie naslepo': { ty: 'varianta', rule: 'hráč nevidí šachovnici, tahy jen slyší a pamatuje si je' },
    'Šachbox': { ty: 'varianta', year: 2003, rule: 'střídají se kola šachu a boxu' },
    'Bughouse šach': { ty: 'varianta', rule: 'čtyři hráči ve dvojicích, sebrané figury si předávají' },
    'Kompoziční šach': { ty: 'varianta', rule: 'skládání a řešení šachových úloh' },
    'Simultánka': { ty: 'varianta', rule: 'jeden hráč hraje naráz proti mnoha soupeřům' }
};
// Zahájení (třída Wikidat šachové zahájení); tahy ručně v české notaci (Wikidata je mají u části zahájení a v anglické), skupina podle nich
const OPENINGS = ['Sicilská obrana', 'Dámský gambit', 'Španělská hra', 'Caro-Kann', 'Francouzská obrana', 'Anglická hra', 'Ruská obrana', 'Philidorova obrana',
    'Slovanská obrana', 'Grünfeldova indická obrana', 'Holandská obrana', 'Italská hra', 'Aljechinova obrana', 'Skotská hra', 'Rétiho hra',
    'Skandinávská obrana', 'Larsenova hra', 'Evansův gambit', 'Nimcovičova indická obrana', 'Hra dvou jezdců v obraně', 'Střelcova hra', 'Pircova obrana',
    'Birdova hra', 'Katalánský systém', 'Vídeňská hra', 'Královská indická obrana', 'Dámská indická obrana', 'Hra čtyř jezdců', 'Střední hra (zahájení)',
    'Sokolského hra', 'Albinův protigambit', 'Nimcovičova obrana', 'Ponzianiho hra', 'Lotyšský gambit', 'Budapešťský gambit', 'Moderní obrana',
    'Severní gambit', 'Obrana Benoni', 'Volžský gambit', 'Bogoljubovova indická obrana', 'Grobův útok', 'Hra tří jezdců', 'Čigorinova obrana',
    'Staroindická obrana', 'Najdorfův systém', 'Uherská obrana', 'Damianova hra', 'Trompowského útok', 'Owenova obrana', 'Englundův gambit',
    'Dračí varianta', 'Královský gambit', 'Torreho útok', 'Blackmarův–Diemerův gambit', 'Marshallův útok', 'Anderssenova hra', 'Van Geetovo zahájení'];
const OPENING_MOVES = {
    'Dámský gambit': '1. d4 d5 2. c4', 'Caro-Kann': '1. e4 c6', 'Francouzská obrana': '1. e4 e6', 'Philidorova obrana': '1. e4 e5 2. Jf3 d6',
    'Slovanská obrana': '1. d4 d5 2. c4 c6', 'Grünfeldova indická obrana': '1. d4 Jf6 2. c4 g6 3. Jc3 d5', 'Holandská obrana': '1. d4 f5',
    'Italská hra': '1. e4 e5 2. Jf3 Jc6 3. Sc4', 'Aljechinova obrana': '1. e4 Jf6', 'Skotská hra': '1. e4 e5 2. Jf3 Jc6 3. d4', 'Rétiho hra': '1. Jf3 d5 2. c4',
    'Skandinávská obrana': '1. e4 d5', 'Larsenova hra': '1. b3', 'Evansův gambit': '1. e4 e5 2. Jf3 Jc6 3. Sc4 Sc5 4. b4',
    'Nimcovičova indická obrana': '1. d4 Jf6 2. c4 e6 3. Jc3 Sb4', 'Hra dvou jezdců v obraně': '1. e4 e5 2. Jf3 Jc6 3. Sc4 Jf6', 'Střelcova hra': '1. e4 e5 2. Sc4',
    'Pircova obrana': '1. e4 d6 2. d4 Jf6 3. Jc3 g6', 'Birdova hra': '1. f4', 'Katalánský systém': '1. d4 Jf6 2. c4 e6 3. g3', 'Vídeňská hra': '1. e4 e5 2. Jc3',
    'Královská indická obrana': '1. d4 Jf6 2. c4 g6 3. Jc3 Sg7 4. e4 d6', 'Dámská indická obrana': '1. d4 Jf6 2. c4 e6 3. Jf3 b6',
    'Hra čtyř jezdců': '1. e4 e5 2. Jf3 Jc6 3. Jc3 Jf6', 'Střední hra (zahájení)': '1. e4 e5 2. d4 exd4 3. Dxd4', 'Sokolského hra': '1. b4',
    'Albinův protigambit': '1. d4 d5 2. c4 e5', 'Nimcovičova obrana': '1. e4 Jc6', 'Ponzianiho hra': '1. e4 e5 2. Jf3 Jc6 3. c3', 'Lotyšský gambit': '1. e4 e5 2. Jf3 f5',
    'Budapešťský gambit': '1. d4 Jf6 2. c4 e5', 'Moderní obrana': '1. e4 g6', 'Severní gambit': '1. e4 e5 2. d4 exd4 3. c3', 'Obrana Benoni': '1. d4 Jf6 2. c4 c5',
    'Volžský gambit': '1. d4 Jf6 2. c4 c5 3. d5 b5', 'Bogoljubovova indická obrana': '1. d4 Jf6 2. c4 e6 3. Jf3 Sb4+', 'Grobův útok': '1. g4',
    'Hra tří jezdců': '1. e4 e5 2. Jf3 Jc6 3. Jc3', 'Čigorinova obrana': '1. d4 d5 2. c4 Jc6', 'Staroindická obrana': '1. d4 Jf6 2. c4 d6',
    'Najdorfův systém': '1. e4 c5 2. Jf3 d6 3. d4 cxd4 4. Jxd4 Jf6 5. Jc3 a6', 'Uherská obrana': '1. e4 e5 2. Jf3 Jc6 3. Sc4 Se7', 'Damianova hra': '1. e4 e5 2. Jf3 f6',
    'Trompowského útok': '1. d4 Jf6 2. Sg5', 'Owenova obrana': '1. e4 b6', 'Englundův gambit': '1. d4 e5',
    'Dračí varianta': '1. e4 c5 2. Jf3 d6 3. d4 cxd4 4. Jxd4 Jf6 5. Jc3 g6', 'Královský gambit': '1. e4 e5 2. f4', 'Torreho útok': '1. d4 Jf6 2. Jf3 e6 3. Sg5',
    'Blackmarův–Diemerův gambit': '1. d4 d5 2. e4', 'Marshallův útok': '1. e4 e5 2. Jf3 Jc6 3. Sb5 a6 4. Sa4 Jf6 5. O-O Se7 6. Ve1 b5 7. Sb3 O-O 8. c3 d5',
    'Anderssenova hra': '1. a3', 'Van Geetovo zahájení': '1. Jc3', 'Sicilská obrana': '1. e4 c5', 'Španělská hra': '1. e4 e5 2. Jf3 Jc6 3. Sb5',
    'Anglická hra': '1. c4', 'Ruská obrana': '1. e4 e5 2. Jf3 Jf6'
};
// Skupina zahájení podle prvního tahu: otevřená (1. e4 e5), polootevřená (1. e4 jinak), zavřená (1. d4 d5), indické hry (1. d4 Jf6),
// flanková (ostatní první tahy bílého)
const openingGroup = (moves) => {
    if (/^1\. e4 e5/.test(moves)) return 'otevřená hra';
    if (/^1\. e4/.test(moves)) return 'polootevřená hra';
    if (/^1\. d4 d5/.test(moves)) return 'zavřená hra';
    if (/^1\. d4 Jf6/.test(moves)) return 'indická hra';
    if (/^1\. d4/.test(moves)) return 'polozavřená hra';
    return 'flankové zahájení';
};

// --- Videohry ---
// Kolik nejslavnějších her ze světa a z Česka vzít (podle slávy z návštěvnosti a jazykových verzí)
const VIDEOHRY_CAPS = { svet: 190, cz: 30 };
const VIDEOHRY_MIN_SITELINKS = 18;
// Hry, které v datech být nemají: nevydaná hra (GTA VI), režim jiné hry, předělávka (popis by seděl i na původní hru)
const VIDEOHRY_NOT = new Set(['Q23648408']);
const VIDEOHRY_NOT_TITLES = new Set(['Fortnite Battle Royale', 'Mafia: Definitive Edition', 'Counter-Strike 2', 'Chrome Dino']);
// Klasiky, které vezme i malá návštěvnost (článek o hře má méně čtenářů než článek o sérii) a české hry bez země ve Wikidatech
const VIDEOHRY_MUST = ['Super Mario Bros.', 'The Sims (videohra)', 'Sonic the Hedgehog (videohra, 1991)', 'Super Mario 64', 'Civilization', 'Lemmings',
    'Duke Nukem 3D', 'Warcraft: Orcs & Humans', 'Mortal Kombat (videohra, 1992)', 'Need for Speed: Most Wanted (videohra, 2005)', 'Asteroids (videohra)',
    'Polda 1', 'Bulánci', 'Prince of Persia (videohra, 1989)', 'Hledání min', 'Pong', 'Space Invaders'];
const VIDEOHRY_CZ = new Set(['Polda 1', 'Bulánci']);
// Fotky videoher: na Commons bývá obal, logo nebo fotka stánku s názvem hry (prozradí odpověď) a snímky obrazovky komerčních her
// tam nepatří; proto jen ručně prohlédnuté snímky her a jejich věrných svobodných napodobenin
const VIDEOHRY_PHOTOS = new Set(['Pac-Man', 'Tetris', 'Hledání min', 'Sokoban', 'OpenTTD', 'Simutrans', 'Wordle']);
// Šachy: obrázek, který pojem neukazuje (prázdná šachovnice u zahájení), nebo soubor, který na Commons není
const NO_PHOTO = new Set(['Birdova hra', 'Budapešťský gambit']);
// Z jedné série nejvýš tolik her (Call of Duty, Assassin's Creed a FIFA by jinak kategorii zaplavily)
const SERIES_CAP = 3;

// --- Známost ---
// Ručně: známá i s malou návštěvností (české hry, klasiky), nebo naopak neznámá i s velkou (výraz, který se hledá z jiných důvodů)
const KNOWN = new Set(['Šachy', 'Dáma (desková hra)', 'Člověče, nezlob se!', 'Monopoly', 'Dostihy a sázky', 'Pexeso', 'Prší', 'Mariáš', 'Žolíky',
    'Černý Petr (karetní hra)', 'Kvarteto (karetní hra)', 'Poker', 'Domino', 'Scrabble', 'Uno (karetní hra)', 'Osadníci z Katanu', 'Piškvorky', 'Lodě',
    'Mlýn (desková hra)', 'Šibenice (hra)', 'Jenga', 'Go (desková hra)', 'Vrhcáby', 'Krycí jména', 'Dungeons & Dragons', 'Blackjack', 'Pasiáns',
    'Král (šachy)', 'Dáma (šachy)', 'Věž (šachy)', 'Střelec (šachy)', 'Jezdec (šachy)', 'Pěšec', 'Šach', 'Mat', 'Pat', 'Rošáda', 'Šachovnice',
    'Šachové hodiny', 'Šachový velmistr', 'Mistrovství světa v šachu', 'Šachová olympiáda', 'Deep Blue', 'Sicilská obrana', 'Dámský gambit',
    'Španělská hra', 'Královský gambit', 'Italská hra', 'Mat bláznů', 'Bleskový šach', 'Elo', 'Braní mimochodem',
    'Mafia: The City of Lost Heaven', 'Kingdom Come: Deliverance', 'Euro Truck Simulator 2', 'Machinarium', 'Operace Flashpoint', 'Vietcong (videohra)',
    'Super Mario Bros.', 'Pong', 'Space Invaders', 'Hledání min', 'Prince of Persia (videohra, 1989)', 'The Sims (videohra)', 'Sonic the Hedgehog (videohra, 1991)',
    'Polda 1', 'Counter-Strike', 'Pac-Man', 'Tetris', 'Doom']);
const NOT_KNOWN = new Set([]);
// Minimální sláva známé položky a podíl známých a expertních položek kategorie (pro světové a české zvlášť)
const LEVELS = {
    deskove: { known: 0.3, minKnown: 150, expert: 0.25, czechExpert: 0.15 },
    sachy: { known: 0.22, minKnown: 400, expert: 0.3, czechExpert: 0.15 },
    videohry: { known: 0.22, minKnown: 450, expert: 0.25, czechExpert: 0.15 }
};

// --- Okruhy ---
export const HRY_COLLECTIONS = [
    { id: 'karetni-hry', label: 'Karetní hry', text: 'Mariáš, poker, prší a další hry s kartami', sort: { by: 'name' } },
    { id: 'sachova-pravidla', label: 'Šachové figury a pravidla', text: 'Figury, tahy, maty a pojmy', sort: { by: 'name' } },
    { id: 'sachova-zahajeni', label: 'Šachová zahájení', sort: { by: 'name' } },
    { id: 'ceske-hry', label: 'České hry', text: 'Videohry a deskové hry z Česka', sort: { by: 'year' } },
    { id: 'retro-videohry', label: 'Klasické videohry', text: 'Videohry ze 70. až 90. let', sort: { by: 'year' } },
    { id: 'moderni-videohry', label: 'Videohry 21. století', sort: { by: 'year' } }
];
const groupsOf = (item) => {
    const groups = [];
    if (item.c === 'deskove' && /karetní/u.test(item.ty)) groups.push('karetni-hry');
    if (item.c === 'sachy' && ['figura', 'pravidlo', 'mat', 'motiv'].includes(item.ty)) groups.push('sachova-pravidla');
    if (item.c === 'sachy' && item.ty === 'zahájení') groups.push('sachova-zahajeni');
    if (item.cz && (item.c === 'deskove' || item.c === 'videohry')) groups.push('ceske-hry');
    if (item.c === 'videohry' && item.f.year < 2000) groups.push('retro-videohry');
    if (item.c === 'videohry' && item.f.year >= 2000) groups.push('moderni-videohry');
    return groups;
};

// --- Stahování ---
const quote = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@cs`;
const resolveTitles = async (titles) => {
    const result = {};
    for (let i = 0; i < titles.length; i += 60) {
        const rows = await sparql(`SELECT ?t ?x WHERE { VALUES ?t { ${titles.slice(i, i + 60).map(quote).join(' ')} }
          ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t . }`);
        for (const row of rows) result[row.t.value] = id(row.x.value);
        await sleep(1000);
    }
    return result;
};
const SINGLE = { t: 1, n: 1, d: 1, sl: 1 };
const DETAIL_PROPS = [['P31', 'type'], ['P136', 'genre'], ['P495', 'co'], ['P577', 'date'], ['P571', 'made'], ['P575', 'disc'], ['P287', 'designer'],
    ['P178', 'dev'], ['P123', 'pub'], ['P400', 'plat'], ['P179', 'series'], ['P1872', 'min'], ['P1873', 'max'], ['P18', 'im'], ['P9838', 'eco'],
    ['P170', 'creator'], ['P61', 'inventor']];
const detailQuery = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  ${DETAIL_PROPS.map(([property, key]) => `UNION { ?item wdt:${property} ?v BIND("${key}" AS ?p) }`).join('\n  ')}
}`;
const fetchDetails = async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, {}]));
    await inBatches(qids, 30, detailQuery, (row) => {
        const entry = result[id(row.item.value)];
        if (!entry || !row.v) return;
        const key = row.p.value;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    });
    return result;
};
// Názvy odkazovaných položek (vývojáři, žánry, platformy, země) česky, jinak anglicky
const fetchLabels = async (qids) => {
    const result = Object.fromEntries(qids.map(qid => [qid, {}]));
    await inBatches(qids, 200, (batch) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(batch)} }
      ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en" || ?lang = "mul") }`,
    (row) => { const entry = result[id(row.item.value)]; if (!entry[row.lang.value]) entry[row.lang.value] = row.l.value; });
    return result;
};
// Videohry s článkem na české Wikipedii: počet jazykových verzí a země (původ hry nebo sídlo vývojáře)
const videoGameCandidates = async () => {
    const rows = await sparql(`SELECT ?x ?sl (SAMPLE(?co) AS ?c) (SAMPLE(?dc) AS ?d) WHERE {
      ?x wdt:P31 wd:Q7889 . ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> . ?x wikibase:sitelinks ?sl .
      OPTIONAL { ?x wdt:P495 ?co } OPTIONAL { ?x wdt:P178 ?dev . ?dev wdt:P17 ?dc } } GROUP BY ?x ?sl`);
    return Object.fromEntries(rows.map(row => [id(row.x.value), { sl: Number(row.sl.value), co: row.c ? id(row.c.value) : null, dc: row.d ? id(row.d.value) : null }]));
};

// Q-id položek ostatních témat (data/*.json kromě sportu): nesmí se opakovat
const otherTopicIds = () => {
    const dir = new URL('../../data/', import.meta.url);
    const ids = new Set();
    for (const file of readdirSync(dir)) {
        if (file === 'sport.json' || !file.endsWith('.json')) continue;
        let data;
        try { data = JSON.parse(readFileSync(new URL(file, dir), 'utf8')); } catch { continue; }
        for (const item of Array.isArray(data.items) ? data.items : []) if (item && item.q) ids.add(item.q);
    }
    return ids;
};

// --- Pravidla ---
const nameOf = (title) => title.replace(/ \((?:desková hra|karetní hra|hra|kostková hra|hazardní hra|šachy|stroj)\)$/u, '')
    .replace(/ \((?:videohra|počítačová hra)(?:, \d{4})?\)$/u, '').trim();
const firstYear = (...lists) => {
    const years = lists.flat().filter(Boolean).map(yearOf).filter(year => year !== undefined && year <= THIS_YEAR).sort((a, b) => a - b);
    return years[0];
};
const numberOf = (list) => { const numbers = (list || []).map(Number).filter(Number.isFinite); return numbers.length ? Math.min(...numbers) : undefined; };
const labelOf = (labels, qid) => { const entry = labels[qid] || {}; return entry.cs || entry.mul || entry.en; };
// Popisky platforem a žánrů bývají dlouhé („videoherní platforma Microsoft Windows“): jen název
const PLATFORM_NAMES = { 'Microsoft Windows': 'Windows', 'Classic Mac OS': 'Mac OS', 'macOS': 'macOS', 'Nintendo Entertainment System': 'NES',
    'Super Nintendo Entertainment System': 'SNES', 'PlayStation (herní konzole)': 'PlayStation', 'Xbox (herní konzole)': 'Xbox' };
const platformName = (name) => PLATFORM_NAMES[name] || name;
// Platformy v pořadí podle toho, jak moc určují dobu (první konzole, pak počítače a mobily)
const GENERIC_PLATFORMS = /^(Windows|Linux|macOS|Mac OS|Android|iOS|Microsoft Windows|MS-DOS|DOS|Unix|webový prohlížeč|Web|cloud gaming|Stadia)$/u;

// Vývojář: mateřská firma, která hru jen koupila nebo zastřešila (Microsoft u Minecraftu), až za skutečným studiem
const PARENT_COMPANIES = /^(Microsoft|Sony Interactive Entertainment|Sony Computer Entertainment|Electronic Arts|Take-Two Interactive|Activision Blizzard|Tencent|Embracer Group|Ubisoft|Xbox Game Studios|Warner Bros\. Games)$/u;
// Popis, když ho Wikidata nemají nebo je chybný
const DESCRIPTIONS = { 'Minecraft': 'sandboxová videohra s otevřeným světem z kostek' };
const CHESS_DESCRIPTIONS = { pravidlo: 'pravidlo šachu', motiv: 'pojem šachové taktiky a strategie', mat: 'matový obrazec v šachu', 'vybavení': 'šachový pojem',
    titul: 'šachový titul', organizace: 'šachová organizace', 'soutěž': 'šachová soutěž', partie: 'slavná šachová partie', 'počítač': 'šachový počítač',
    varianta: 'druh šachové hry', figura: 'šachová figura', 'zahájení': 'šachové zahájení' };

// Rozdělení slávy kategorie: 10., 25., 50., 75. a 90. percentil (pro ladění minimální slávy známých)
const percentiles = (list) => {
    const fames = list.map(item => item._.fame).sort((a, b) => a - b);
    return [0.1, 0.25, 0.5, 0.75, 0.9].map(share => Math.round(fames[Math.floor(share * (fames.length - 1))] || 0)).join(' / ');
};

export const buildHry = async ({ existing }) => {
    const taken = otherTopicIds();
    const own = new Set(existing.map(item => item.q));
    const skipped = [];
    // 1. Kandidáti
    const titles = [...Object.keys(DESKOVE), ...Object.keys(SACHY), ...OPENINGS, ...VIDEOHRY_MUST];
    const resolved = await cachedByKey('hry-titles', titles, resolveTitles);
    const missingTitles = titles.filter(title => !resolved[title]);
    if (missingTitles.length) console.warn(`  hry: články nenalezeny: ${missingTitles.join(', ')}`);
    const games = await cachedByKey('hry-videohry-kandidati', ['all'], async () => ({ all: await videoGameCandidates() }));
    const videoCandidates = Object.entries(games.all)
        .filter(([qid, entry]) => !VIDEOHRY_NOT.has(qid) && (entry.sl >= VIDEOHRY_MIN_SITELINKS || entry.co === 'Q213' || entry.dc === 'Q213'));
    const plan = [
        ...Object.entries(DESKOVE).map(([title, ty]) => ({ title, c: 'deskove', ty })),
        ...Object.entries(SACHY).map(([title, info]) => ({ title, c: 'sachy', ty: info.ty, info })),
        ...OPENINGS.map(title => ({ title, c: 'sachy', ty: 'zahájení', info: {} }))
    ].filter(entry => resolved[entry.title]).map(entry => ({ ...entry, q: resolved[entry.title] }));
    for (const [qid] of videoCandidates) plan.push({ q: qid, c: 'videohry', ty: 'videohra' });
    const must = new Set(VIDEOHRY_MUST.map(title => resolved[title]).filter(Boolean));
    for (const qid of must) plan.push({ q: qid, c: 'videohry', ty: 'videohra' });
    // Duplicity s jinými tématy a s položkami sportu
    const seen = new Set();
    const fresh = plan.filter(entry => {
        if (taken.has(entry.q)) { skipped.push(['jiné téma', entry.title || entry.q]); return false; }
        if (own.has(entry.q)) { skipped.push(['už ve sportu', entry.title || entry.q]); return false; }
        if (seen.has(entry.q)) return false;
        seen.add(entry.q);
        return true;
    });
    // 2. Údaje
    const qids = fresh.map(entry => entry.q);
    const details = await cachedByKey('hry-detaily', qids, fetchDetails);
    const refs = [...new Set(Object.values(details).flatMap(detail => ['genre', 'co', 'designer', 'dev', 'pub', 'plat', 'series', 'creator', 'inventor'].flatMap(key => detail[key] || [])))].filter(qid => /^Q\d+$/.test(qid));
    const labels = await cachedByKey('hry-nazvy', refs, fetchLabels);
    const pageviews = await cachedByKey('hry-navstevnost-2025', fresh.map(entry => details[entry.q].t).filter(Boolean), (list) => czechPageviews(list));
    const label = (qid) => labelOf(labels, qid);
    const names = (list, limit = 3) => [...new Set((list || []).map(label).filter(Boolean))].slice(0, limit);

    // 3. Položky
    // Platformy podle toho, kolik her z kandidátů na nich vyšlo (známé konzole napřed, Ouya a Windows Phone až nakonec)
    const platformCount = new Map();
    for (const entry of fresh.filter(other => other.c === 'videohry')) {
        for (const name of names((details[entry.q] || {}).plat, 20).map(platformName)) platformCount.set(name, (platformCount.get(name) || 0) + 1);
    }
    const items = [];
    for (const entry of fresh) {
        const detail = details[entry.q] || {};
        if (!detail.t) { skipped.push(['bez článku', entry.q]); continue; }
        if (entry.c === 'videohry' && VIDEOHRY_NOT_TITLES.has(detail.t)) { skipped.push(['vynechaná videohra', detail.t]); continue; }
        const title = detail.t;
        const n = nameOf(title);
        const sl = Number(detail.sl || 0);
        const photo = entry.c === 'videohry' ? VIDEOHRY_PHOTOS.has(title) : !NO_PHOTO.has(title);
        // U zahájení popis bez tahů (tahy jsou nápověda): „šachové zahájení 1. e4 c5“ → „šachové zahájení“
        const description = DESCRIPTIONS[title] || (entry.ty === 'zahájení' && detail.d ? detail.d.replace(/\s+(?:charakterizované tahy\s+)?1\s?\..*$/u, '').trim() : detail.d) || (entry.c === 'sachy' ? CHESS_DESCRIPTIONS[entry.ty] : entry.c === 'deskove' ? entry.ty : undefined);
        const base = { q: entry.q, t: title, n, c: entry.c, ty: entry.ty, d: description, ...(photo ? imageFields((detail.im || [])[0]) : {}) };
        let f = {};
        let cz = false;
        if (entry.c === 'deskove') {
            const fix = DESKOVE_FIX[title] || {};
            f = compact({
                year: fix.year ?? firstYear(detail.made, detail.date, detail.disc),
                by: fix.by || names(detail.designer || detail.creator || detail.inventor, 2),
                land: fix.land || names(detail.co, 1)[0],
                min: fix.min ?? numberOf(detail.min), max: fix.max ?? numberOf(detail.max),
                pub: names(detail.pub, 1)[0]
            });
            if (f.year !== undefined && (f.year < 1000 || f.year > THIS_YEAR)) delete f.year;
            if (f.min !== undefined && f.max !== undefined && f.max < f.min) { delete f.min; delete f.max; }
            cz = DESKOVE_CZ.has(title);
        }
        if (entry.c === 'sachy') {
            const info = entry.info || {};
            if (entry.ty === 'zahájení') {
                const text = OPENING_MOVES[title] || '';
                f = compact({ moves: text, group: text ? openingGroup(text) : undefined, eco: (detail.eco || [])[0] });
            } else {
                f = compact({ value: info.value, count: info.count, move: info.move, year: info.year ?? firstYear(detail.made, detail.date),
                    champ: info.champ, players: info.players, place: info.place, by: info.by, beat: info.beat, rule: info.rule });
            }
        }
        if (entry.c === 'videohry') {
            const candidate = games.all[entry.q] || {};
            const platforms = names(detail.plat, 8).map(platformName);
            const consoles = platforms.filter(name => !GENERIC_PLATFORMS.test(name));
            f = compact({
                year: firstYear(detail.date),
                dev: names(detail.dev, 4).sort((a, b) => Number(PARENT_COMPANIES.test(a)) - Number(PARENT_COMPANIES.test(b))).slice(0, 2), pub: names(detail.pub, 2),
                gen: names(detail.genre, 2),
                plat: [...consoles.sort((a, b) => (platformCount.get(b) || 0) - (platformCount.get(a) || 0)), ...platforms.filter(name => GENERIC_PLATFORMS.test(name))].slice(0, 4),
                ser: names(detail.series, 1)[0],
                land: names(detail.co, 1)[0]
            });
            cz = candidate.co === 'Q213' || (!candidate.co && candidate.dc === 'Q213') || VIDEOHRY_CZ.has(title);
            if (f.year === undefined) { skipped.push(['bez roku vydání', title]); continue; }
        }
        const views = pageviews[title] || 0;
        items.push(compact({ ...base, cz: cz ? 1 : undefined, f, _: { sl, views, fame: Math.sqrt(Math.max(views, 1) * Math.max(sl, 1)) * (cz ? 1.3 : 1) } }));
    }
    // Videohry: nejslavnější ze světa a z Česka (klasiky z VIDEOHRY_MUST vždy), z jedné série nejvýš SERIES_CAP
    const keep = new Set(items.filter(item => item.c !== 'videohry').map(item => item.q));
    for (const pool of ['svet', 'cz']) {
        const list = items.filter(item => item.c === 'videohry' && (pool === 'cz') === Boolean(item.cz))
            .sort((a, b) => Number(must.has(b.q)) - Number(must.has(a.q)) || b._.fame - a._.fame);
        const perSeries = new Map();
        let count = 0;
        for (const item of list) {
            if (count >= VIDEOHRY_CAPS[pool]) break;
            const series = item.f.ser;
            if (series && (perSeries.get(series) || 0) >= SERIES_CAP && !must.has(item.q)) { skipped.push(['série je plná', item.n]); continue; }
            if (series) perSeries.set(series, (perSeries.get(series) || 0) + 1);
            keep.add(item.q);
            count++;
        }
    }
    // Stejné jméno dvakrát v kategorii: zůstane slavnější
    const byName = new Map();
    for (const item of items.filter(other => keep.has(other.q)).sort((a, b) => b._.fame - a._.fame)) {
        const key = `${item.c}|${item.n.toLocaleLowerCase('cs')}`;
        if (byName.has(key)) { keep.delete(item.q); skipped.push(['stejné jméno', item.n]); } else byName.set(key, item);
    }
    const result = items.filter(item => keep.has(item.q));
    assignHryLevels(result);
    for (const item of result) {
        const groups = groupsOf(item);
        if (groups.length) item.g = groups;
    }
    // Okruh od 8 položek má aspoň čtvrtinu známých (jako ostatní okruhy tématu): do minima nejslavnější z ostatních
    for (const collection of HRY_COLLECTIONS) {
        const members = result.filter(item => (item.g || []).includes(collection.id)).sort((a, b) => b._.fame - a._.fame);
        let known = members.filter(item => item.k === 1).length;
        for (const item of members) {
            if (known >= knownFloor(members.length)) break;
            if (item.k !== 1 && !NOT_KNOWN.has(item.t)) { item.k = 1; delete item.x; known++; skipped.push([`známá kvůli okruhu ${collection.id}`, item.n]); }
        }
    }
    if (process.env.HRY_DEBUG) {
        for (const [reason, title] of skipped) console.log(`  vynecháno: ${reason}: ${title}`);
        for (const item of result) console.log(`  ${item.c}\t${item.k ? 'Z' : item.x ? 'E' : '-'}\t${Math.round(item._.fame)}\t${item._.views}\t${item._.sl}\t${item.n}\t${item.cz ? 'CZ' : ''}`);
    }
    for (const category of HRY_CATEGORIES) console.log(`  sláva ${category}: ${percentiles(result.filter(item => item.c === category))}`);
    return { items: result, skipped };
};

// Známé: ruční KNOWN, pak nejslavnější podíl kategorie nad minimální slávou (bez NOT_KNOWN); experti: nejméně slavný podíl
const assignHryLevels = (items) => {
    for (const [category, level] of Object.entries(LEVELS)) {
        for (const pool of ['svet', 'cz']) {
            const list = items.filter(item => item.c === category && (pool === 'cz') === Boolean(item.cz)).sort((a, b) => b._.fame - a._.fame);
            for (const item of list) { item.k = KNOWN.has(item.t) ? 1 : 0; delete item.x; }
            const target = Math.round(level.known * list.length);
            let known = list.filter(item => item.k === 1).length;
            for (const item of list) {
                if (known >= target) break;
                if (item.k !== 1 && !NOT_KNOWN.has(item.t) && item._.fame >= level.minKnown) { item.k = 1; known++; }
            }
            const share = pool === 'cz' ? level.czechExpert : level.expert;
            list.filter(item => item.k !== 1).reverse().slice(0, Math.round(share * list.length)).forEach(item => { item.x = 1; });
        }
    }
};

// Sloučí hry do dat tématu: položky her z dřívějšího běhu nahradí nové sestavení (stejné id), ty, které nový běh nenašel, zůstanou
// (žádné id nezmizí); okruhy her na konec seznamu okruhů
export const mergeHry = ({ collections, items }, hry) => {
    const fresh = hry.items;
    const freshIds = new Set(fresh.map(item => item.q));
    for (const item of fresh) delete item._;
    const stale = items.filter(item => HRY_CATEGORIES.includes(item.c) && !freshIds.has(item.q));
    if (stale.length) console.warn(`  hry: ${stale.length} dřívějších položek nový běh nenašel, zůstávají (${stale.slice(0, 5).map(item => item.n).join(', ')}…)`);
    const ids = new Set(HRY_COLLECTIONS.map(collection => collection.id));
    return {
        collections: [...collections.filter(collection => !ids.has(collection.id)), ...HRY_COLLECTIONS],
        items: [...items.filter(item => !(HRY_CATEGORIES.includes(item.c) && freshIds.has(item.q))), ...fresh]
    };
};

// Přehled: počty, známé a expertní v kategoriích her, okruhy pod spodní hranicí
export const hrySummary = (items) => {
    for (const category of HRY_CATEGORIES) {
        const list = items.filter(item => item.c === category);
        console.log(`${category}: ${list.length} (známých ${list.filter(item => item.k === 1).length}, expert ${list.filter(item => item.x).length}), českých ${list.filter(item => item.cz).length}`);
    }
    for (const collection of HRY_COLLECTIONS) {
        const members = items.filter(item => (item.g || []).includes(collection.id));
        const known = members.filter(item => item.k === 1).length;
        console.log(`  okruh ${collection.id}: ${members.length} (známých ${known}, expert ${members.filter(item => item.x).length})${known < knownFloor(members.length) ? ' – POD SPODNÍ HRANICÍ' : ''}`);
    }
};
