// Další okruhy tématu Vlajky a znaky (data/vlajky.json): vlajky a znaky regionů států (státy USA, spolkové země…), velkých měst světa,
// zaniklých států a dalších území a organizací. Volá ho scripts/build-vlajky.mjs.
// Výběr: regiony první úrovně vybraných zemí a velká města i hlavní města se Wikidat (musí mít vlajku nebo znak a článek na české
// Wikipedii); zaniklé státy, území a organizace podle ručního seznamu názvů článků (třída „zaniklý stát“ ve Wikidatech obsahuje i města a kraje).

// Země, jejichž regiony první úrovně do okruhu patří, a nejvyšší počet regionů z jedné země (podle počtu jazykových verzí článku)
export const REGION_COUNTRIES = {
    Q30: 51, Q183: 16, Q16: 13, Q408: 8, Q40: 9, Q39: 26, Q36: 16, Q214: 8, Q159: 40, Q212: 27, Q29: 19, Q38: 20, Q142: 27, Q145: 6,
    Q55: 12, Q31: 6, Q34: 21, Q20: 15, Q33: 19, Q155: 27, Q96: 32, Q414: 24, Q298: 16, Q224: 20
};
// Wikidata mezi regiony první úrovně uvádějí i obce (Papeete) a zámořská či sporná území, která mají vlastní okruh
export const NOT_A_REGION = /^(?:Papeete|Faaa|Gibraltar|Bermudy|Norfolk|Falklandy|Jan Mayen|Špicberky|Vánoční ostrov|Svatý Bartoloměj|Svatý Martin|Saint Pierre a Miquelon|Wallis a Futuna|Francouzská Polynésie|Nová Kaledonie|Mayotte|Réunion|Martinik|Guadeloupe|Francouzská Guyana|Portoriko)$/u;
export const CITY_MIN_POPULATION = 1000000;
export const MAX_CITIES = 230;

// Zaniklé státy: názvy článků na české Wikipedii (bez nacistického Německa, které má vlajku s hákovým křížem)
export const HISTORICAL_TITLES = [
    'Sovětský svaz', 'Československo', 'Jugoslávie', 'Německá demokratická republika', 'Západní Německo', 'Osmanská říše', 'Ruské impérium', 'Německé císařství', 'Rakousko-Uhersko',
    'Pruské království', 'Prusko', 'Výmarská republika', 'Srbsko a Černá Hora', 'Rakouské císařství', 'Konfederované státy americké', 'Britská Indie', 'Zair', 'Rhodesie', 'Republika Rhodesie', 'Biafra',
    'Vietnamská republika', 'Vietnamská demokratická republika', 'Sjednocená arabská republika', 'Jižní Jemen', 'Severní Jemen', 'Mandžukuo', 'Japonské císařství', 'Italské království',
    'Papežský stát', 'Francouzské království', 'První Francouzské císařství', 'Druhé Francouzské císařství', 'Třetí Francouzská republika', 'Vichistická Francie', 'Druhá Španělská republika',
    'Brazilské císařství', 'Etiopské císařství', 'Nizozemské Antily', 'Spojené provincie nizozemské', 'Velká Kolumbie', 'Uhersko', 'Království Jugoslávie', 'Ruská sovětská federativní socialistická republika',
    'Ukrajinská sovětská socialistická republika', 'Čínská republika (1912–1949)', 'Říše Čching', 'Mongolská říše', 'Incká říše', 'Abbásovský chalífát', 'Britské impérium', 'Spojené království Velké Británie a Irska',
    'Království Velké Británie', 'Svatá říše římská', 'Habsburská monarchie', 'Litevské velkoknížectví', 'Benátská republika', 'Republika Arcach', 'Hawaiian Kingdom', 'Havajské království', 'Jižní Vietnam',
    'Bavorské království', 'Saské království', 'Württemberské království', 'Hannoverské království', 'Království Sardinie', 'Neapolské království', 'Království obojí Sicílie', 'Rakouské Nizozemí',
    'Kongo-Léopoldville', 'Svobodný stát Kongo', 'Belgické Kongo', 'Francouzská západní Afrika', 'Jihoafrická unie', 'Dominion Newfoundland', 'Tibet (1912–1951)', 'Tibet', 'Korejské císařství', 'Dynastie Čoson',
    'Tanganika', 'Zanzibar', 'Východní Pákistán', 'Ceylon', 'Burma', 'Siam', 'Persie', 'Pahlavíovský Írán', 'Království Afghánistán', 'Mamlúcký sultanát', 'Republika Texas', 'Království Hawaiʻi', 'Texaská republika',
    'Rhodesie a Njasko', 'Federace Rhodesie a Nyaska', 'Federace Západních Indií', 'Svobodné město Gdaňsk', 'Svobodné město Krakov', 'Východní Rumélie', 'Krymský chanát', 'Zlatá horda', 'Ílchanát', 'Rusko (1917–1922)',
    'Ruská republika', 'Ukrajinská lidová republika', 'Hetmanát', 'Kyjevská Rus', 'Moskevské velkoknížectví', 'Ruské carství', 'Litevsko-polská unie', 'Republika obou národů', 'Polské království', 'České království',
    'Království Srbů, Chorvatů a Slovinců', 'Nezávislý stát Chorvatsko', 'Slovenský štát', 'Slovenská republika (1939–1945)', 'Protektorát Čechy a Morava', 'Zakarpatská Ukrajina', 'Karpatská Ukrajina'
];
// Známé zaniklé státy (ostatní jsou méně známé)
export const KNOWN_HISTORICAL = ['Sovětský svaz', 'Československo', 'Jugoslávie', 'Německá demokratická republika', 'Osmanská říše', 'Ruské impérium', 'Rakousko-Uhersko', 'Pruské království', 'Konfederované státy americké', 'Západní Německo', 'Srbsko a Černá Hora', 'Německé císařství'];
// Wikidata u některých zaniklých států uvádějí dnešní vlajku nebo žádnou (Československo má vlajku Česka, Rakousko-Uhersko žádnou) –
// u Československa to nejde (vlajka je táž jako česká, otázka by neměla jedinou odpověď), u Rakouska-Uherska je soubor ručně
export const HISTORICAL_FILES = { Q28513: 'Flag of Austria-Hungary (1867–1918).svg' };
export const HISTORICAL_SKIP_FILE = /nazi|hakenkreuz|swastika|reichskriegs|reichsdienst/i;

// Další území a organizace: názvy článků na české Wikipedii
export const TERRITORY_TITLES = ['Guam', 'Americká Samoa', 'Severní Mariany', 'Americké Panenské ostrovy', 'Britské Panenské ostrovy', 'Montserrat (ostrov)', 'Turks a Caicos', 'Falklandy', 'Svatá Helena (ostrov)',
    'Aruba', 'Curaçao', 'Sint Maarten', 'Martinik', 'Réunion', 'Guadeloupe', 'Mayotte', 'Francouzská Guyana', 'Wallis a Futuna', 'Niue', 'Vánoční ostrov', 'Špicberky', 'Madeira (souostroví)', 'Azory',
    'Abcházie', 'Jižní Osetie', 'Severní Kypr', 'Podněstří', 'Pásmo Gazy', 'Nová Kaledonie', 'Kokosové ostrovy', 'Saint-Pierre a Miquelon', 'Svatý Bartoloměj (ostrov)', 'Svatý Martin (ostrov)',
    'Jersey', 'Alderney', 'Kanárské ostrovy', 'Baleáry', 'Korsika', 'Sardinie', 'Sicílie', 'Kréta', 'Grónsko', 'Zanzibar', 'Zanzibarské souostroví', 'Tchaj-wan', 'Kosovo', 'Palestina', 'Západní Sahara', 'Somaliland', 'Tibet'];
export const ORGANIZATION_TITLES = ['Liga arabských států', 'Organizace zemí vyvážejících ropu', 'UNESCO', 'Světová zdravotnická organizace', 'FIFA', 'Benelux', 'Společenství nezávislých států', 'Organizace amerických států',
    'Mercosur', 'Severská rada', 'Karibské společenství', 'NAFTA', 'Mezinárodní organizace frankofonie', 'Dětský fond Organizace spojených národů', 'Mezinárodní agentura pro atomovou energii', 'Mezinárodní organizace práce',
    'Organizace pro bezpečnost a spolupráci v Evropě', 'Organizace islámské spolupráce', 'Světová meteorologická organizace', 'Unie jihoamerických národů', 'Světová poštovní unie', 'Eurasijský ekonomický svaz',
    'Organizace Smlouvy o kolektivní bezpečnosti', 'Společenství portugalsky mluvících zemí', 'Rada pro spolupráci arabských států v Zálivu', 'Organizace turkických států', 'Východoafrické společenství',
    'Jihoafrické rozvojové společenství', 'Mezinárodní olympijský výbor', 'Mezinárodní měnový fond', 'Světová banka', 'Světová obchodní organizace', 'Mezinárodní červený kříž a červený půlměsíc', 'ASEAN',
    'Sdružení národů jihovýchodní Asie', 'Evropská rada', 'Rada Evropy', 'OECD', 'Organizace pro hospodářskou spolupráci a rozvoj', 'Visegrádská skupina', 'Evropská hospodářská oblast', 'Evropská asociace volného obchodu',
    'Mezinárodní unie pro ochranu přírody', 'Mezinárodní paralympijský výbor', 'UEFA', 'Mezinárodní hokejová federace', 'Mezinárodní basketbalová federace', 'Mezinárodní tenisová federace', 'Antarktický smluvní systém', 'Arktická rada',
    'Africká rozvojová banka', 'Šanghajská organizace spolupráce', 'BRICS', 'G20', 'Skupina G7', 'Evropská organizace pro jaderný výzkum', 'Mezinárodní telekomunikační unie', 'Interpol', 'Europol', 'Evropská kosmická agentura'];
