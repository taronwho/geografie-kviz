// Téma Sport: ručně ověření olympijští vítězové, u kterých Wikidata medaile neuvádějí (týmové turnaje, starší hry, sprinteři).
// Klíče jsou názvy článků české Wikipedie (build-sport.mjs je převede na položky Wikidat), hodnoty hry, na kterých vyhráli
// zlato: „L1952“ = letní hry 1952, „Z1998“ = zimní hry 1998; víc zlatých na jedněch hrách = hry vícekrát.

// Čeští a českoslovenští olympijští vítězové podle článků „Česko/Československo na Letních/Zimních olympijských hrách RRRR“
// (Slováci z doby Československa tu jsou taky – build je podle místa narození mezi české nepočítá)
export const NAGANO_1998 = ['Roman Čechmánek', 'Dominik Hašek', 'Milan Hnilička', 'Roman Hamrlík', 'František Kučera', 'Libor Procházka',
    'Petr Svoboda (1966)', 'Jiří Šlégr', 'Richard Šmehlík', 'Jaroslav Špaček', 'Josef Beránek (1969)', 'Jan Čaloun', 'Jiří Dopita', 'Milan Hejduk',
    'Jaromír Jágr', 'Robert Lang', 'David Moravec', 'Pavel Patera', 'Martin Procházka', 'Robert Reichel', 'Martin Ručinský', 'Vladimír Růžička',
    'Martin Straka (lední hokejista)'];
// Fotbalisté, kteří vyhráli turnaj na hrách v Moskvě 1980 (bez trenéra)
const MOSCOW_1980_FOOTBALL = ['Stanislav Seman', 'Luděk Macela', 'Josef Mazura', 'Libor Radimec', 'Zdeněk Rygel', 'Petr Němec', 'Ladislav Vízek',
    'Jan Berger', 'Jindřich Svoboda (fotbalista)', 'Lubomír Pokluda', 'Verner Lička', 'Oldřich Rott', 'František Štambachr (fotbalista)', 'František Kunzo',
    'Zdeněk Šreiner', 'Rostislav Václavíček', 'Jaroslav Netolička'];
// Gymnastky, které vyhrály soutěž družstev v Londýně 1948
const LONDON_1948_GYMNASTS = ['Zdeňka Honsová', 'Miloslava Misáková', 'Věra Růžičková', 'Božena Srncová', 'Milena Müllerová', 'Zdeňka Veřmiřovská',
    'Olga Šilhánová', 'Marie Kovářová', 'Eliška Misáková'];
// Veslařská čtyřka s kormidelníkem z Helsinek 1952
const HELSINKI_1952_ROWERS = ['Karel Mejta (1928–2015)', 'Jiří Havlis', 'Jan Jindra', 'Stanislav Lusk', 'Miroslav Koranda'];

export const CZECH_GOLDS = {
    'Bedřich Šupčík': ['L1924'], 'František Ventura': ['L1928'], 'Ladislav Vácha': ['L1928'], 'Jaroslav Skobla': ['L1932'],
    'Alois Hudec': ['L1936'], 'Zdeněk Škrland': ['L1936'], 'Václav Mottl': ['L1936'], 'Vladimír Syrovátka': ['L1936'], 'Jan Brzák': ['L1936', 'L1948'],
    'Emil Zátopek': ['L1948', 'L1952', 'L1952', 'L1952'], 'Július Torma': ['L1948'], 'Josef Holeček (kanoista)': ['L1948', 'L1952'],
    'František Čapek (kanoista)': ['L1948'], 'Bohumil Kudrna': ['L1948'], 'Dana Zátopková': ['L1952'], 'Ján Zachara': ['L1952'],
    'Olga Fikotová': ['L1956'], 'Eva Bosáková': ['L1960'], 'Bohumil Němeček (boxer)': ['L1960'], 'Václav Kozák': ['L1960'], 'Pavel Schmidt': ['L1960'],
    'Věra Čáslavská': ['L1964', 'L1964', 'L1964', 'L1968', 'L1968', 'L1968', 'L1968'], 'Jiří Daler': ['L1964'], 'Hans Zdražila': ['L1964'],
    'Milena Duchková': ['L1968'], 'Jan Kůrka': ['L1968'], 'Miloslava Rezková': ['L1968'], 'Jiří Raška': ['Z1968'], 'Ondrej Nepela': ['Z1972'],
    'Ludvík Daněk': ['L1972'], 'Vítězslav Mácha': ['L1972'], 'Josef Panáček': ['L1976'], 'Anton Tkáč': ['L1976'], 'Ota Zaremba': ['L1980'],
    'Miloslav Mečíř': ['L1988'], 'Jozef Pribilinec': ['L1988'], 'Miroslav Varga': ['L1988'],
    'Jan Železný': ['L1992', 'L1996', 'L2000'], 'Robert Změlík': ['L1992'], 'Lukáš Pollert': ['L1992'], 'Petr Hrdlička': ['L1992'],
    'Martin Doktor': ['L1996', 'L1996'], 'Štěpánka Hilgertová': ['L1996', 'L2000'], 'Aleš Valenta': ['Z2002'], 'Roman Šebrle': ['L2004'],
    'Kateřina Neumannová': ['Z2006'], 'Kateřina Emmons': ['L2008'], 'David Kostelecký': ['L2008'], 'Barbora Špotáková': ['L2008', 'L2012'],
    'Martina Sáblíková': ['Z2010', 'Z2010', 'Z2014'], 'Miroslava Topinková Knapková': ['L2012'], 'David Svoboda': ['L2012'], 'Jaroslav Kulhavý': ['L2012'],
    'Eva Adamczyková': ['Z2014'], 'Lukáš Krpálek': ['L2016', 'L2020'], 'Ester Ledecká': ['Z2018', 'Z2018', 'Z2022'], 'Jiří Lipták': ['L2020'],
    'Jiří Prskavec': ['L2020'], 'Barbora Krejčíková': ['L2020'], 'Kateřina Siniaková': ['L2020', 'L2024'], 'Tomáš Macháč': ['L2024'],
    'Martin Fuksa': ['L2024'], 'Josef Dostál (kajakář)': ['L2024'], 'Zuzana Maděrová': ['Z2026'], 'Metoděj Jílek': ['Z2026'],
    ...Object.fromEntries(NAGANO_1998.map(title => [title, ['Z1998']])),
    ...Object.fromEntries(MOSCOW_1980_FOOTBALL.map(title => [title, ['L1980']])),
    ...Object.fromEntries(LONDON_1948_GYMNASTS.map(title => [title, ['L1948']])),
    ...Object.fromEntries(HELSINKI_1952_ROWERS.map(title => [title, ['L1952']]))
};

// Olympijské legendy, u kterých Wikidata medaile neuvádějí (nebo jen část); jen zlaté, které jsou jisté (spodní odhad stačí –
// počet rozhoduje jen o okruhu Olympijské legendy, ukazují se hry)
export const LEGEND_GOLDS = {
    'Usain Bolt': ['L2008', 'L2008', 'L2012', 'L2012', 'L2012', 'L2016', 'L2016', 'L2016'],
    'Carl Lewis': ['L1984', 'L1984', 'L1984', 'L1984', 'L1988', 'L1988', 'L1992', 'L1992', 'L1996'],
    'Paavo Nurmi': ['L1920', 'L1920', 'L1920', 'L1924', 'L1924', 'L1924', 'L1924', 'L1924', 'L1928'],
    'Jesse Owens': ['L1936', 'L1936', 'L1936', 'L1936'],
    'Michael Johnson': ['L1992', 'L1996', 'L1996', 'L2000'], 'Al Oerter': ['L1956', 'L1960', 'L1964', 'L1968'],
    'Allyson Felixová': ['L2008', 'L2012', 'L2012', 'L2012', 'L2016', 'L2016', 'L2020'],
    'Elaine Thompsonová-Herahová': ['L2016', 'L2016', 'L2020', 'L2020', 'L2020'],
    'Simone Bilesová': ['L2016', 'L2016', 'L2016', 'L2016', 'L2024', 'L2024', 'L2024'],
    'Viktor Čukarin': ['L1952', 'L1952', 'L1952', 'L1952', 'L1956', 'L1956', 'L1956'], 'Takaši Ono (gymnasta)': ['L1956', 'L1960', 'L1960', 'L1960', 'L1964'],
    'Caeleb Dressel': ['L2016', 'L2016', 'L2020', 'L2020', 'L2020', 'L2020', 'L2020'],
    'Emma McKeonová': ['L2016', 'L2020', 'L2020', 'L2020', 'L2020', 'L2024'],
    'Chris Hoy': ['L2004', 'L2008', 'L2008', 'L2008', 'L2012', 'L2012'], 'Jason Kenny': ['L2008', 'L2012', 'L2012', 'L2016', 'L2016', 'L2016', 'L2020'],
    'Bradley Wiggins': ['L2004', 'L2008', 'L2008', 'L2012', 'L2016'],
    'Steve Redgrave': ['L1984', 'L1988', 'L1992', 'L1996', 'L2000'], 'Aladár Gerevich': ['L1932', 'L1936', 'L1948', 'L1948', 'L1952', 'L1956', 'L1960'],
    'Edoardo Mangiarotti': ['L1936', 'L1952', 'L1952', 'L1956', 'L1956', 'L1960'], 'Mijaín López': ['L2008', 'L2012', 'L2016', 'L2020', 'L2024'],
    'Teddy Riner': ['L2012', 'L2016', 'L2020', 'L2024', 'L2024'], 'Ma Lung': ['L2012', 'L2016', 'L2016', 'L2020', 'L2020', 'L2024'],
    'Bjørn Dæhlie': ['Z1992', 'Z1992', 'Z1992', 'Z1994', 'Z1994', 'Z1998', 'Z1998', 'Z1998'],
    'Ljubov Jegorovová': ['Z1992', 'Z1992', 'Z1992', 'Z1994', 'Z1994', 'Z1994'], 'Raisa Smetaninová': ['Z1976', 'Z1976', 'Z1980', 'Z1992'],
    'Therese Johaugová': ['Z2010', 'Z2022', 'Z2022', 'Z2022'], 'Kjetil André Aamodt': ['Z1992', 'Z2002', 'Z2002', 'Z2006'],
    'Sven Kramer': ['Z2010', 'Z2014', 'Z2014', 'Z2018']
};
