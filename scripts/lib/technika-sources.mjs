// Téma Technika a vynálezy (scripts/build-technika.mjs): ruční seznamy položek podle názvu článku na české Wikipedii
// (nebo anglického názvu s příponou @en) a třídy z Wikidat, ze kterých se berou další položky (nejznámější podle počtu jazykových verzí).
// Hvězdička na začátku = položka je vždy známá (základní úroveň), vykřičník = nikdy známá (obskurní, nafouknuté jazykové verze).
// Položky, které už jsou v jiném tématu (fyzici a vynálezy Fyziky, mosty Architektury, průplavy Zeměpisu…), skript vynechá sám.

// --- Kategorie: třídy z Wikidat (P31), kolik nejznámějších z nich vzít, a ruční seznam ---
export const CATEGORY_SOURCES = {
    vynalezci: {
        classes: [],
        limit: 0,
        forced: [
            '*Thomas Alva Edison', '*Alexander Graham Bell', '*Karl Benz', '*Gottlieb Daimler', '*Rudolf Diesel', '*Henry Ford', '*Ferdinand Porsche',
            '*Wilbur Wright@en', '*Orville Wright', '*George Stephenson', '*Samuel F. B. Morse', '*Werner von Siemens', '*Ferdinand von Zeppelin', '*Otto Lilienthal',
            '*Louis Blériot', '*Wernher von Braun', '*Sergej Koroljov', '*Charles Babbage', '*Ada Lovelace', '*Alan Turing', '*Steve Jobs', '*Steve Wozniak',
            '*Bill Gates', '*Mark Zuckerberg', '*Elon Musk', '*Jeff Bezos', '*Tim Berners-Lee', '*Linus Torvalds', '*Larry Page', '*Sergey Brin', '*Enzo Ferrari',
            '*František Křižík', '*Josef Ressel', '*Prokop Diviš', '*Emil Škoda', '*Tomáš Baťa', '*Václav Laurin', '*Václav Klement', '*Johannes Gutenberg',
            '*Alfred Nobel', '*Louis Braille', '*Igor Sikorsky@en', '*Konstantin Tsiolkovsky@en', '*Jan Perner', '*Hans Ledwinka', '*Viktor Kaplan', '*Otto Wichterle',
            '*Ernő Rubik', '*Gustave Eiffel', '*Nicolaus Otto@en', '*Robert Bosch', '*Michail Kalašnikov', '*Jan Kašpar', '*Isambard Kingdom Brunel',
            'Paul Allen', 'Dennis Ritchie', 'Ken Thompson', 'Guido van Rossum', 'James Gosling', 'Grace Hopperová', 'Konrad Zuse', 'John von Neumann',
            'Gordon Moore', 'Akio Morita@en', 'Masaru Ibuka', 'Sóičiró Honda', 'Kiichiro Toyoda@en', 'Ferruccio Lamborghini', 'André Citroën', 'Louis Renault',
            'Wilhelm Maybach', 'Bertha Benzová', 'Elisha Otis', 'Isaac Merritt Singer', 'Eli Whitney', 'Cyrus McCormick', 'Charles Goodyear', 'John Boyd Dunlop',
            'Willis Carrier', 'Lee de Forest', 'John Logie Baird', 'Vladimir Zvorykin', 'Philo Farnsworth', 'Frank Whittle', 'Hans von Ohain@en', 'Christopher Cockerell',
            'Martin Cooper', 'Ray Tomlinson', 'Douglas Engelbart', 'Vint Cerf', 'Nolan Bushnell', 'Gunpei Yokoi@en', 'Alexej Pažitnov', 'Ole Kirk Christiansen',
            'Percy Spencer', 'Robert Goddard', 'Joseph Marie Jacquard', 'Richard Arkwright', 'James Hargreaves@en', 'Edmund Cartwright', 'Richard Trevithick',
            'Robert Fulton', 'Thomas Newcomen', 'Nicolas-Joseph Cugnot@en', 'Étienne Lenoir', 'Siegfried Marcus', 'August Horch', 'Henry Royce', 'Charles Rolls',
            'Ettore Bugatti', 'Walter Chrysler', 'Igo Etrich', 'Ludvík Očenášek', 'Josef Božek', 'Antonín Svoboda@en', 'Emil Kolben', 'Jan Antonín Baťa',
            'Jakub Kryštof Rad', 'Christopher Latham Sholes', 'Hiram Stevens Maxim', 'Richard Jordan Gatling@en', 'Samuel Colt', 'Hugo Junkers', 'Claude Dornier', 'Anthony Fokker',
            'Willy Messerschmitt', 'Andrei Tupolev@en', 'Artem Mikoyan@en', 'Oleg Antonov', 'Sergey Ilyushin@en', 'Pavel Suchoj', 'Šigeru Mijamoto', 'Jensen Huang', 'Sam Altman',
            'Sundar Pichai', 'Tim Cook', 'Satya Nadella', 'Jack Ma', 'Jack Dorsey', 'Pavel Durov', 'Daniel Ek', 'Larry Ellison', 'Michael Dell', 'Andrew Grove',
            'Federico Faggin', 'Steve Ballmer', 'Ken Kutaragi@en', 'Markus Persson', 'Jimmy Wales', 'Bjarne Stroustrup', 'Niklaus Wirth', 'Edsger Dijkstra', 'Donald Knuth@en',
            'John McCarthy', 'Claude Shannon', 'James Dyson', 'Hedy Lamarrová', 'Josephine Cochrane@en', 'Mary Andersonová', 'Stephanie Kwoleková', 'Margaret E. Knight@en',
            'Juan de la Cierva', 'Clément Ader', 'Alberto Santos-Dumont', 'Glenn Curtiss', 'William Boeing', 'Howard Hughes', 'Charles Lindbergh', 'Jurij Gagarin',
            'Niklaus Riggenbach@en', 'Rudolf Hell@en', 'Karl Drais', 'Kirkpatrick Macmillan@en', 'John Kemp Starley', 'Pierre Michaux@en', 'Ransom E. Olds@en', 'Preston Tucker@en',
            'Felix Wankel', 'Ferry Porsche@en', 'Béla Barényi@en', 'Nils Bohlin@en'
        ],
        exclude: []
    },
    vynalezy: {
        classes: [],
        limit: 0,
        // Vynálezy a stroje, které nejsou ve Fyzice (tam jsou parní stroj, telefon, žárovka, motocykl, vrtulník, bankomat…)
        forced: [
            '*Kolo', '*Jízdní kolo', '*Kompas', '*Brýle', '*Výtah', '*Šicí stroj', '*refrigerator@en', '*Pračka', '*Žehlička', '*Kalkulačka', '*Kávovar', 'toaster@en',
            'hair dryer@en', 'Rychlovarná konvice', '*Tank', '*Ponorka', '*Padák', '*Raketa', '*Robot', 'unmanned aerial vehicle@en', '*3D tisk', 'Global Positioning System@en',
            'Wi-Fi', 'USB@en', '*USB flash disk', '*Disketa', '*DVD', '*VHS', '*Magnetofon', '*Mikrofon', '*Reproduktor', '*Sluchátka', 'Zářivka',
            'Lithium-iontový akumulátor', 'Fotovoltaický článek', 'Platební karta', '*Jeřáb (stroj)', 'excavator@en', 'bulldozer@en', '*Traktor', 'combine harvester@en',
            'chainsaw@en', '*Vrtačka', '*Tramvaj', '*Trolejbus', '*Autobus', '*Nákladní automobil', 'Lanová dráha', '*Elektromobil', '*watch@en',
            '*Fotoaparát', '*Počítačová tiskárna', 'photocopier@en', 'Dálkové ovládání', 'Airbag', 'anti-lock braking system@en', 'Dotyková obrazovka',
            '*Větrná elektrárna', 'Solární panel', '*Notebook', '*Televizor', '*Chytrý telefon', 'Kompaktní disk', 'Pevný disk', 'Počítačová klávesnice', 'Tablet (počítač)',
            'Herní konzole', '*Mikrovlnná trouba', 'Kardiostimulátor', 'Koloběžka', 'Skateboard', 'Kosmický raketoplán', 'Umělá družice', '*Internet', '*Metro',
            'Optické vlákno', 'hoist@en', 'Pásový dopravník', 'computer monitor@en', 'Skener', 'Videokamera', 'Blu-ray', 'Paměťová karta', 'Router',
            'Modem', 'Chytré hodinky', 'Čtečka elektronických knih', 'Sušička prádla', 'robotic vacuum cleaner@en', 'juicer@en', 'Mixér', 'Indukční vařič',
            'Bojler', 'Termostat', 'Kotva', 'Ozubené kolo', 'Převodovka', 'Turbína', 'Elektrický generátor', 'Akumulátor', 'Palivový článek', 'Vrtule',
            'Vodní kolo', 'Větrný mlýn', 'Hrnčířský kruh', 'Tkalcovský stav', 'Kolovrat', 'electrical telegraph@en', 'Dálnopis', 'Pager', 'satellite dish@en', 'Sonar',
            'Magnetická rezonance', 'Výpočetní tomografie', 'Defibrilátor', 'insulin pump@en', 'hearing aid@en', 'artificial heart@en', 'electric toothbrush@en', 'Elektrokoloběžka',
            'Hydroplán', 'Kluzák', 'Plachetnice', 'Ledoborec', 'Letadlová loď', 'Kontejnerová loď', 'Tanker', 'Lokomotiva', 'Elektrická lokomotiva', 'diesel locomotive@en',
            'Monorail', 'Maglev', 'moving walkway@en', 'parking meter@en', 'RFID', 'near-field communication@en', 'Ethernet', 'space station@en'
        ],
        exclude: []
    },
    auta: {
        // Modely aut a automobilky
        classes: [['Q3231690', 110], ['Q59773381', 70], ['Q786820', 90], ['Q10429667', 25]],
        forced: [
            '*Škoda Octavia', '*Škoda Fabia', '*Škoda Superb', '*Škoda Felicia', '*Škoda Favorit', '*Škoda 105/120@en', '*Škoda 1000 MB', '*Škoda Kodiaq', '*Škoda Yeti',
            '*Škoda Karoq', '*Škoda Enyaq@en', '*Škoda Popular', '*Tatra 87', '*Tatra 603', '*Tatra 613', '*Tatra 77', '*Tatra 815', '*Tatra 148', '*Trabant', '*Lada Niva',
            '*VAZ-2101@en', '*Volkswagen Brouk', '*Volkswagen Golf', '*Volkswagen Passat', '*Volkswagen Transporter', '*Ford model T', '*Ford Mustang', '*Ford Transit',
            '*Mini', '*Fiat 500', '*Fiat 126', '*Citroën 2CV', '*Citroën DS', '*Renault 4', '*Porsche 911', '*Ferrari F40', '*Ferrari Testarossa', '*Lamborghini Countach',
            '*Lamborghini Aventador', '*Bugatti Veyron', '*DeLorean DMC-12', '*Tesla Model S', '*Tesla Model 3', '*Tesla Cybertruck', '*Toyota Corolla', '*Toyota Prius',
            '*Land Rover Defender', '*Willys MB@en', '*Mercedes-Benz třídy G', '*Mercedes-Benz 300 SL', '*Aston Martin DB5', '*Dacia Duster', '*Dacia Logan',
            '*Benz Patent Motorwagen číslo 1', '*Hummer H1', '*Jeep Wrangler@en', '*Wartburg 353', '*Škoda Rapid',
            '*Škoda Auto', '*Tatra', '*Volkswagen', '*BMW', '*Mercedes-Benz', '*Audi', '*Porsche', '*Ferrari', '*Lamborghini', '*Toyota', '*Honda',
            '*Ford Motor Company', '*Tesla (americká firma)', '*Renault', '*Peugeot', '*FIAT (automobilka)', '*Volvo Cars', '*Rolls-Royce Motor Cars', '*Bugatti', '*Jaguar Cars',
            '*Hyundai Motor Company@en', '*Kia', '*Dacia (automobilka)', '*Opel', '*Citroën', '*Nissan', '*Mazda', '*Suzuki', '*Subaru', '*Chevrolet', '*Jeep',
            '*Land Rover', '*Aston Martin', '*Bentley', '*Maserati', '*Alfa Romeo', '*SEAT', '*AvtoVAZ', '*Laurin & Klement', '*Velorex', '*Mitsubishi Motors',
            '*Cadillac', 'Lexus', 'McLaren Automotive', 'BYD Auto', '*Praga (company)@en', 'Aero (automobilka)', 'Avia (company)@en', 'LIAZ@en', 'Wikov',
            'Škoda Rapid (1935)', 'Škoda 110 R', 'Škoda 130 RS', 'Škoda Garde@en', 'Škoda Rapid (1984)@en', 'Škoda Octavia (1959)', 'Škoda 440@en', 'Škoda Roomster',
            'Škoda Citigo', 'Škoda Scala', 'Škoda Kamiq', 'Škoda Elroq', 'Tatra 97', 'Tatra 600', 'Tatra 700', 'Tatra 111', 'Tatra 138', 'Tatra 11', 'Tatra 57',
            'Praga V3S', 'Aero 30', 'Jawa 750'
        ],
        exclude: [/^(Mercedes-Benz Group|Volkswagen Group|Stellantis|Groupe PSA|Fiat Chrysler Automobiles|Skupina FIAT|General Motors|British Leyland|Daimler Motoren Gesellschaft|Daimler Motor Company|Auto Union|Chrysler \(divize\)|Audi Sport|Mercedes-AMG|BMW divize M|SEAT CUPRA|Donkervoort|Togg|ELVO|Waymo)$/u]
    },
    vlaky: {
        classes: [['Q19832486', 90], ['Q811704', 70], ['Q13402959', 20], ['Q67454740', 25], ['Q15141321', 25]],
        forced: [
            '*TGV', '*Šinkansen', '*Intercity-Express', '*Pendolino', '*Orient expres', '*Eurostar', '*Transrapid', '*Rocket (lokomotiva)', '*LNER Class A3 4472 Flying Scotsman@en',
            '*LNER Class A4 4468 Mallard@en', '*Lokomotiva Big Boy', '*Glacier Express', '*Bernina Express', '*Transsibiřská magistrála', '*Railjet', '*Sapsan', '*AVE',
            '*Frecciarossa', '*Maglev v Šanghaji', '*Krokodýl (lokomotiva)', '*Elektrická jednotka 680', '*Motorový vůz M 131.1', '*Motorový vůz M 290.0',
            '*Elektrická jednotka 471', '*Lokomotiva 498.1', '*Lokomotiva 387.0', '*Lokomotiva 475.1', '*Lokomotiva 556.0', '*Lokomotiva 754', '*Lokomotiva 751',
            '*Lokomotiva 380', '*Lokomotiva 363', '*Lokomotiva 242', '*Lokomotiva 781', '*Motorový vůz 810', '*Puffing Billy (lokomotiva)', '*Trans Europ Express',
            '*Tatra T3', '*Tatra T6A5', '*Tatra KT8D5', '*Škoda 15T', '*Tatra T1', '*Škoda 14T', '*Škoda 13T', '*Tatra K2', '*Tatra T2', '*Tatra RT6N1',
            'Lokomotiva 753', 'Lokomotiva 750', 'Lokomotiva 742', 'Lokomotiva 720', 'Lokomotiva 770', 'Lokomotiva 150', 'Lokomotiva 151', 'Lokomotiva 162', 'Lokomotiva 163',
            'Lokomotiva 240', 'Lokomotiva 350', 'Lokomotiva 371', 'Lokomotiva 372', 'Lokomotiva 383', 'Lokomotiva 386', 'Lokomotiva 388', 'Lokomotiva 477.0', 'Lokomotiva 534.0',
            'Lokomotiva 464.2', 'Lokomotiva 310.0', 'Lokomotiva 433.0', 'Lokomotiva 423.0', 'Lokomotiva 524.1', 
            'Elektrická jednotka 660', 'Motorová jednotka 844', 'Elektrická jednotka 451', 'Motorový vůz 830',
            'Motorový vůz 842', 'Motorový vůz M 120.3', 'Siemens Vectron', 'Alstom TRAXX', 'Siemens ES64U4',
            'Stadler FLIRT', 'Stadler KISS@en', 'Siemens Velaro@en', 'Acela', 'ICE 1', 'ICE 3', 'TGV Duplex', 'AGV', 'Talgo', 'X2000',
            'InterCity 125', 'LNER řada A4', 'DRB řada 52', 'Lokomotiva P 8 (Prusko)', 'Blue Train (vlak)'
        ],
        exclude: [/^(Železniční trať|Moskevský centrální okruh|Linka MCD|Metro v|Marmaray|Virgin Trains|Trať )/u]
    },
    letadla: {
        classes: [['Q15056993', 150], ['Q15056995', 70], ['Q133585', 6]],
        forced: [
            '*Airbus A380', '*Boeing 737', '*Boeing 747', '*Concorde', '*Boeing 777', '*Boeing 787', '*Airbus A320', '*Antonov An-225', '*Supermarine Spitfire',
            '*Messerschmitt Bf 109', '*North American P-51 Mustang', '*Boeing B-52 Stratofortress', '*Lockheed C-130 Hercules', '*General Dynamics F-16 Fighting Falcon',
            '*MiG-21', '*MiG-29', '*Lockheed SR-71 Blackbird', '*Northrop B-2 Spirit', '*Lockheed Martin F-35 Lightning II', '*Hughes AH-64 Apache', '*Mil Mi-24',
            '*Douglas DC-3', '*Tupolev Tu-144', '*Wright Flyer', '*LZ 129 Hindenburg', '*Aero L-39 Albatros', '*Aero L-159 Alca', '*Let L-410 Turbolet', '*Avia B-534',
            '*Boeing B-29 Superfortress', '*Messerschmitt Me 262', '*Junkers Ju 87', '*Spirit of St. Louis', '*Sikorsky UH-60 Black Hawk', '*Bell UH-1 Iroquois',
            '*Cessna 172', '*Airbus Beluga', '*Antonov An-2', '*Hawker Hurricane', '*MiG-15', '*Suchoj Su-27', '*Eurofighter Typhoon', '*Saab JAS-39 Gripen',
            '*Avro Lancaster', '*Micubiši A6M', '*Bayraktar TB2', '*LZ 127 Graf Zeppelin', '*Blériot XI', '*Airbus A350', '*Boeing 707', '*Enola Gay', '*Air Force One',
            '*Zlin Z-26 Trener@en', '*Aero L-29 Delfín', '*Mil Mi-8', '*Boeing CH-47 Chinook', '*Lockheed F-117 Nighthawk', '*Antonov An-124',
            'Zlín Z-37 Čmelák', 'Zlin Z 142@en', 'Zlín Z-50', 'Aero L-60 Brigadýr@en', 'Aero Ae 45@en', 'Avia BH-11', 'Letov Š-28', 'Aero A-11', 'Avia S-199', 'Aero L-410',
            'Let L-13 Blaník', 'Aero Ae 270 Ibis', 'Evektor EV-55 Outback',  'Airbus A220', 'Airbus A330', 'Airbus A400M', 'Boeing 727', 'Boeing 757',
            'Boeing 767', 'Iljušin Il-62', 'Iljušin Il-76', 'Tupolev Tu-154', 'Tupolev Tu-134', 'Jakovlev Jak-40', 'De Havilland Comet', 'Lockheed Constellation',
            'Douglas DC-8', 'McDonnell Douglas DC-10', 'Embraer E-Jet', 'ATR 72', 'Pilatus PC-12', 'Piper J-3 Cub', 'Fokker Dr.I', 'Sopwith Camel',
            'Robinson R44', 'Bell 47', 'Eurocopter EC 135', 'Bell Boeing V-22 Osprey', 'Hughes H-4 Hercules', 'Solar Impulse', 'Rutan Voyager', 'Gossamer Albatross'
        ],
        exclude: []
    },
    lode: {
        classes: [['Q852190', 50], ['Q182531', 40], ['Q39804', 12], ['Q17205', 30], ['Q2811', 25], ['Q697196', 30], ['Q12859788', 15], ['Q161705', 10], ['Q11446', 70], ['Q170483', 5]],
        forced: [
            '*Titanic', '*Bismarck (1939)', '*Jamato (1940)', '*Queen Mary 2', '*Costa Concordia', '*Mayflower', '*Santa María (karaka)', '*Kon-Tiki', '*HMS Victory', '*Vasa',
            '*Bounty', '*Cutty Sark', '*RMS Lusitania', '*HMS Beagle', '*Mary Rose', '*Endurance (1912)', '*K-141 Kursk', '*USS Nautilus (SSN-571)', '*Potěmkin (1900)',
            '*Aurora (křižník)', '*Tirpitz (1939)', '*HMS Hood (1918)', '*Admiral Graf Spee', '*Britannic (1914)', '*Carpathia', '*Mary Celeste', '*USS Constitution',
            '*Oasis of the Seas', '*Icon of the Seas', '*Great Eastern', '*SS Normandie', '*RMS Queen Mary', '*RMS Queen Elizabeth 2', '*Wilhelm Gustloff', '*Rainbow Warrior',
            '*RV Calypso@en', '*Fram', '*Golden Hind', '*Victoria (loď)', '*Batyskaf Trieste', '*USS Missouri (BB-63)', '*USS Arizona (BB-39)', '*SS Andrea Doria',
            '*Moskva (raketový křižník)', '*Admiral Kuzněcov', '*Ever Given@en', '*Lenin (ledoborec)', '*RMS Olympic@en', '*Exxon Valdez', '*USS Enterprise (CVN-65)',
            '*Julius Fučík (loď)',
            'Edmund Fitzgerald', 'Musaši (1940)', 'Scharnhorst (1935)', 'Prinz Eugen (křižník)', 'CSS H. L. Hunley', 'Turtle (ponorka)', 'German submarine U-96 (1940)@en', 'Seawise Giant@en',
            'Pomsta královny Anny', 'Nautilus (1800)', 'DSV Alvin@en', 'Deepsea Challenger@en', 'USS Thresher (SSN-593)@en', 'K-19',
            'Akula-class submarine@en', 'Typhoon-class submarine@en', 'Ohio-class submarine@en', 'USS Gerald R. Ford (CVN-78)', 'USS Nimitz (CVN-68)', 'Charles de Gaulle (R91)'
        ],
        exclude: [/^(Bílá loď|Vrak z |Syrakúsia|Deepwater Horizon)/u]
    },
    elektronika: {
        classes: [['Q17589470', 25], ['Q941818', 12], ['Q55990535', 30], ['Q473708', 5], ['Q29876482', 5]],
        forced: [
            '*IPhone', '*IPad', '*IPod', '*Macintosh', 'Apple I', 'Apple II', '*IBM Personal Computer', '*Commodore 64', '*ZX Spectrum@en', 'Amiga', 'Atari 2600',
            '*PlayStation (herní konzole)', '*PlayStation 2', 'PlayStation 4', '*PlayStation 5', '*Xbox (herní konzole)', 'Xbox 360', '*Nintendo Entertainment System',
            'Super Nintendo Entertainment System', 'Nintendo 64', '*Game Boy', '*Nintendo DS', '*Wii', '*Nintendo Switch', 'Mega Drive', 'Game & Watch',
            '*Tamagotchi@en', '*Nokia 3310', 'Nokia 3210', '*BlackBerry', '*Walkman', 'Kindle', 'GoPro', '*Raspberry Pi', 'Arduino', 'PMD 85', 'Didaktik Gama',
            'IQ 151', 'ZX81', 'Altair 8800', 'Colossus (počítač)', 'Apple Watch', 'AirPods', 'Game Boy Advance', '*PlayStation Portable', 'MacBook Air',
            'ThinkPad', 'Discman@en', 'Polaroid', 'Amazon Echo@en', 'Steam Deck', 'Samsung Galaxy S', 'Nokia 1100', 'Motorola DynaTAC@en', 'Trinitron@en',
            'Wii U@en', 'Atari ST', 'Amstrad CPC', 'ZX80', 'Commodore PET@en', 'VIC-20@en', 'Apple Lisa', 'NeXT Computer@en', 'Osborne 1',
            'Sega Saturn', 'Dreamcast@en', 'Nintendo GameCube', 'Nintendo 3DS', 'PlayStation 3', 'Xbox One', 'Xbox Series X', 'Magnavox Odyssey',
            'IMac', 'MacBook Pro', 'IPod Nano', 'Apple Newton', 'PalmPilot@en', 'Nokia N95', 'Nokia 5110', 'Motorola Razr V3@en', 
            'Samsung Galaxy Note', 'Google Pixel', 'Nexus One', 'HTC Dream@en', 'Fairphone', 'Google Glass', 'Microsoft Surface', 'Chromebook',
            'Atari Lynx', 'Neo Geo (system)@en', 'TurboGrafx-16', 'Vectrex', 'Sega Game Gear', 'PlayStation Vita', 'Nintendo DSi', 'Game Boy Color', 'Virtual Boy', 'Ouya',
            'Ondra (počítač)', 'Sharp MZ-800', 'MSX', 'BBC Micro@en', 'Acorn Archimedes', 'Cray-1@en', 'IBM System/360', 'PDP-11', 'UNIVAC I', 'Xerox Alto@en',
            'Canon EOS', 'Nikon F@en', 'Fitbit', 'Roomba'
        ],
        exclude: [/^(Rubikova kostka|Stahlhelm|Moka|Information Technology|Scalable Link|Intel \d|IPhone \d|Samsung Galaxy S\d|Samsung Galaxy Note \d)/u]
    },
    software: {
        classes: [['Q9143', 55], ['Q9135', 30], ['Q920890', 8], ['Q6368', 12], ['Q3220391', 25]],
        forced: [
            '*Python', '*Java (programovací jazyk)', '*JavaScript', '*C (programovací jazyk)', '*C++', 'PHP', 'Hypertext Markup Language', 'SQL',
            '*Linux', '*Microsoft Windows', '*MacOS', '*Android (operační systém)', '*IOS', 'MS-DOS', 'Unix', '*Windows 95', '*Windows XP', '*Google Chrome',
            '*Mozilla Firefox', '*Internet Explorer', '*Safari (webový prohlížeč)', 'Opera (webový prohlížeč)', '*Facebook', '*YouTube', '*Instagram', '*TikTok',
            '*X (sociální síť)', '*WhatsApp', '*Skype', '*Vyhledávání Google', '*Wikipedie', '*Seznam.cz', '*Microsoft Office', '*Microsoft Word', 'Microsoft Excel',
            'Adobe Photoshop', '*ChatGPT', '*Bitcoin', 'Mapy Google', 'Google Earth', '*Netflix', '*Spotify', 'Zoom (software)@en', 'Microsoft Teams', 'Snapchat',
            'LinkedIn', 'Reddit', 'Twitch', 'Telegram (software)', 'ICQ', 'Myspace', 'EBay', 'Ubuntu', 'Git', 'GitHub', 'Scratch', 'Pascal (programovací jazyk)',
            'BASIC', 'Fortran', 'COBOL', 'Kotlin (programovací jazyk)', 'Swift (programovací jazyk)', 'C Sharp', 'Windows 10', 'Windows 7', 'Microsoft Edge',
            'Facebook Messenger', '*Gmail', 'Pinterest', 'Tinder', 'Discord', 'Napster', 'Winamp', 'Microsoft PowerPoint', '*Překladač Google',
            'Mapy.cz@en', 'Avast Antivirus', 'Tor (software)', 'Ethereum', 'BitTorrent', 'WordPress@en',
            'Rust (programovací jazyk)', 'Go (programovací jazyk)', 'Ruby', 'Perl', 'Lua', 'R (programovací jazyk)', 'MATLAB', 'Visual Basic',
            'Haskell (programovací jazyk)', 'Prolog (programovací jazyk)', 'Lisp', 'Smalltalk', 'Objective-C', 'TypeScript', 'Delphi', 'Assembler',
            'Kaskádové styly', 'Debian', 'Fedora Linux', 'FreeBSD', 'Windows 11', 'Windows Vista', 'Windows 98', 'Windows 3.1', 'Symbian OS', 'ChromeOS',
            'Brave (webový prohlížeč)', 'Netscape Navigator', 'Mosaic (web browser)@en', 'Google+', 'Threads', 'Bluesky', 'Signal (software)',
            'Viber', 'WeChat', 'Vimeo', 'SoundCloud', 'Anglická Wikipedie', 'Stack Overflow', 'Dropbox', 'OneDrive', 'Disk Google', 'Microsoft Outlook', 'Thunderbird',
            'LibreOffice', 'OpenOffice.org@en', 'VLC media player', 'Blender', 'AutoCAD', 'Adobe Acrobat', 'Adobe Illustrator', 'Adobe Premiere Pro', 'Canva', 'Figma',
            'Steam', 'Airbnb', 'Booking.com', 'PayPal', 'Revolut', 'Duolingo', 'Waze', 'Shazam', 'Tetris'
        ],
        exclude: [/^(Wikizprávy|Nupedia|Projekt Gutenberg|Wikipedie:|Jazyk symbolických adres|Windows (1\.0|2\.0|ME|2000|NT|8|8\.1|Server|Mobile)|Brainfuck|Logo \(programovací jazyk\)|GNU$|ALGOL|ActionScript|Active Server Pages|GNU Octave|Scheme|Konqueror|D \(programovací jazyk\)|Ada \(programovací jazyk\)|Slackware|BeOS|NetBSD|GNU\/Linux|VK|Truth Social|Vine|Google\+$|Myspace$)/u, /^Tetris$/u]
    },
    stavby: {
        classes: [['Q134447', 45], ['Q15911738', 35], ['Q6558431', 12], ['Q5503', 55], ['Q644371', 70], ['Q1248784', 25], ['Q194188', 12]],
        forced: [
            '*Jaderná elektrárna Temelín', '*Jaderná elektrárna Dukovany', '*Černobylská jaderná elektrárna', '*Jaderná elektrárna Fukušima I', '*Záporožská jaderná elektrárna',
            '*Jaderná elektrárna Three Mile Island', '*Dlouhé Stráně Hydro Power Plant@en', '*Tři soutěsky (hráz)', '*Hooverova přehrada', '*Itaipú',
            '*Vysoká Asuánská přehrada', '*Prunéřov Power Station@en', '*Elektrárna Mělník', '*Elektrárna Počerady', '*Elektrárna Tušimice', '*Elektrárna Chvaletice',
            '*Letiště Václava Havla Praha', '*Letiště Brno-Tuřany', '*Letiště Leoše Janáčka Ostrava', '*Letiště Heathrow', '*Letiště Charlese de Gaulla Paříž',
            '*Letiště Frankfurt nad Mohanem', '*Letiště Amsterdam-Schiphol', '*Letiště JFK', '*Mezinárodní letiště Dubaj', '*Letiště Singapur-Changi',
            '*Mezinárodní letiště Hartsfield-Jackson Atlanta', '*Letiště Haneda', '*Letiště Vídeň', '*Letiště Mnichov', '*Letiště Istanbul',
            '*Mezinárodní letiště Los Angeles', "*O'Harovo mezinárodní letiště", '*Mezinárodní letiště Hongkong', '*Metro v Praze', '*Metro v Londýně', '*Metro v Moskvě',
            '*Metro v Paříži', '*Metro v New Yorku', '*Metro v Tokiu', '*U-Bahn v Berlíně', '*Metro ve Vídni', '*Metro v Budapešti', '*Metro v Barceloně',
            '*Metro v Madridu', '*Metro v Pekingu', '*Metro v Šanghaji', '*Metro v Soulu', '*Metro v Dubaji', '*Kosmodrom Bajkonur', '*Kennedyho vesmírné středisko',
            '*Guyanské kosmické centrum', '*Eurotunel', '*Gotthardský úpatní tunel', '*Seikan Tunnel@en', '*Velký hadronový urychlovač', '*Jaderná elektrárna Kašiwazaki-Kariwa',
            '*Jaderná elektrárna Mochovce', '*Bohunice Nuclear Power Plant@en', '*Jaderná elektrárna Paks', '*Jaderná elektrárna Zwentendorf', '*Isar Nuclear Power Plant@en',
            '*Vodní elektrárna Orlík', '*Vodní elektrárna Lipno I', '*Vodní elektrárna Slapy', '*Gotthardský silniční tunel', '*M. R. Štefánik Airport@en',
            'Jaderná elektrárna Flamanville', 'Jaderná elektrárna Olkiluoto', 'Jaderná elektrárna Hinkley Point', 'Jaderná elektrárna Bruce', 'Leningrad Nuclear Power Plant@en',
            'Jaderná elektrárna Kozloduj', 'Jaderná elektrárna Krško', 'Jaderná elektrárna Gundremmingen', 'Sellafield',
            'Elektrárna Ledvice', 'Elektrárna Dětmarovice', 
            'Vodní elektrárna Štěchovice', 'Vodní elektrárna Kamýk', 'Gabčíkovo–Nagymaros Dams@en', 'Grand Coulee Dam@en', 'Sayano–Shushenskaya Dam@en',
            'Krasnoyarsk Dam@en', 'Kariba Dam@en', 'Glen Canyon Dam@en', 'Guri Dam@en', 'Belo Monte Dam@en', 'Xiluodu Dam@en', 'Baihetan Dam@en', 'Ťin-pching I',
            'Letiště Pardubice', 'Letiště Karlovy Vary', 'Letiště Kbely', 'Letiště Londýn-Gatwick', 'Letiště Paříž-Orly', 'Letiště Curych', 'Letiště Kodaň',
            'Letiště Barcelona-El Prat', 'Letiště Adolfa Suáreze Madrid-Barajas', 'Mezinárodní letiště Leonarda da Vinciho Řím-Fiumicino', 'Letiště Malpensa',
            'Mezinárodní letiště Ference Liszta Budapešť', 'Chopinovo letiště Varšava', 'Mezinárodní letiště Dauhá Hamad', 'Mezinárodní letiště Inčchon',
            'Mezinárodní letiště Kansai', 'Letiště Sydney', 'Mezinárodní letiště San Francisco', 'Denver International Airport', 'Letiště Peking', 'Mezinárodní letiště Peking Ta-sing',
            'Letiště Suvarnabhumi', 'Mezinárodní letiště Šanghaj Pchu-tung', 'Mezinárodní letiště Indiry Gándhíové', 'Letiště Keflavík', 
            'Metro v Petrohradu', 'Metro v Kyjevě', 'Metro ve Varšavě', 'Metro v Římě', 'Metro v Miláně', 'Metro v Mnichově', 'Metro ve Stockholmu', 'Metro v Lisabonu',
            'Metro v Athénách', 'Metro v Istanbulu', 'Metro v Bruselu', 'Metro v Amsterdamu', 'Metro v Helsinkách', 'Metro v Kodani', 'MTR@en', 'Metro v Singapuru',
            'Metro v Dillí', 'Metro v Pchjongjangu', 'Mexico City Metro@en', 'São Paulo Metro@en', 'Metro v Buenos Aires', 'Metro v Montréalu', 'Metro v Torontu', 'Metro ve Washingtonu',
            'Metro v Chicagu', 'Bay Area Rapid Transit@en', 'Metro v Glasgow', 'Metro v Kazani', 'Metro v Minsku', 'Metro v Baku', 'Metro v Tbilisi',
            'Kosmodrom Vostočnyj', 'Kosmodrom Pleseck', 'Cape Canaveral Space Force Station', 'Vandenberg Space Force Base@en', 'Kosmodrom Ťiou-čchüan',
            'Starbase@en', 'Tanegashima Space Center@en'
        ],
        exclude: [/^(Letiště (Đồng|Cam Ranh|Cà Mau|Sao Vàng|Melilla)|Mezinárodní letiště (Tân Sơn|Đà Nẵng|Phú Quốc|Gibraltar))/u, /\p{Script=Han}/u]
    },
    firmy: {
        classes: [['Q18388277', 30], ['Q1058914', 25]],
        forced: [
            '*Apple', '*Microsoft', '*Google', '*Amazon (company)@en', '*Meta (americký podnik)', '*Samsung', '*Sony', '*Nokia', '*Siemens', '*IBM', '*Intel', '*Nvidia',
            'Advanced Micro Devices', 'Huawei', 'Xiaomi', 'LG Electronics', 'Philips', '*Robert Bosch GmbH', 'Panasonic', 'Toshiba', 'Canon', 'Nikon',
            '*Hewlett-Packard', 'Dell', 'Lenovo', 'Asus', 'Acer (firma)', 'Oracle Corporation', 'SAP', 'Cisco Systems', 'Uber', 'Avast Software', '*ČEZ',
            '*Bata (company)@en', '*Škoda Works@en', 'ČKD', '*Zetor', '*Boeing', '*Airbus', 'Lockheed Martin', 'General Electric', '*Kodak@en', 'Xerox', '*Motorola',
            'Ericsson', '*Nintendo', 'Sega', 'Atari', 'Valve', 'Adobe Systems', 'OpenAI', '*SpaceX', 'Arm Holdings@en', 'TSMC', 'Qualcomm', 'Foxconn',
            'BlackBerry Limited@en', 'Commodore International', 'Casio', 'Logitech', 'Kaspersky Lab', 'ESET', 'JetBrains', 'Prusa Research', 'Tesla (Czechoslovak company)@en',
            'Aero Vodochody', 'Meopta', 'Česká zbrojovka Uherský Brod', 'Jawa Moto@en', 'Alza.cz', 'Bohemia Interactive', 'Škoda Transportation', 'Rolls-Royce Holdings',
            'Anthropic', 'DeepSeek', 'Sun Microsystems', 'Texas Instruments', 'Hitachi', 'Fujitsu', 'NEC@en', 'Sharp Corporation@en', 'Olympus Corporation@en', 'Bang & Olufsen@en', 'Dyson (company)@en',
            'Electrolux', 'Whirlpool', 'Miele', 'Makita', 'Stihl', 'Husqvarna', 'Caterpillar', 'Komatsu', 'John Deere', 'Liebherr', 'ABB', 'Schneider Electric',
            'Honeywell', '3M', 'Dassault Aviation', 'Embraer', 'Bombardier', 'Alstom', 'Stadler Rail', 'Thales Group@en', 'Rheinmetall', 'Krupp', 'ThyssenKrupp',
            'Alibaba Group', 'Tencent', 'ByteDance', 'Baidu', 'Yandex', 'Kiwi.com', 'Rohlik.cz', 'Socialbakers',
             'Koh-i-noor Hardtmuth', 'Jablotron', 'Y Soft', 'Avast', 'AVG Technologies', 'Iveco', 'Karosa', 'SOR Libchavy',
            'Škoda Electric', 'Let Kunovice@en', 'Aircraft Industries'
        ],
        exclude: [/^(Avast|Krupp|John Deere)$/u, /^(DeepSeek|Perplexity AI|Mistral AI|Projekt Stargate|Revolut|GitHub|Gen Digital|X Corp\.|Openmoko|Poken|PKWARE|Highcharts|Maxthon|Devart|Ikarus Security|MGM COMPRO|Notum|Seyfor|MyQ|Apify|Byznys software|Ackee|Yieldigo|Gigapan|Distinctive Software|Infor|Phoenix Technologies|Santa Cruz Operation|Wistron|Zendesk|Symbian Ltd|AdMob|MySQL AB|Splunk|Microchip|Proton AG|Packard Bell|Wolters Kluwer)/u]
    }
};

// Čím se vynálezce či průkopník proslavil (podle jména v datech). Bez vlastního jména, aby fakt odpověď neprozradil
// (Fordova pásová výroba, Turingův stroj, Kaplanova turbína), jen to, co o něm uvádí česká Wikipedie a učebnice
export const PERSON_WORKS = {
    'Thomas Alva Edison': 'žárovka, fonograf', 'Alexander Graham Bell': 'telefon', 'Karl Benz': 'první automobil se spalovacím motorem (1886)',
    'Gottlieb Daimler': 'rychloběžný benzinový motor', 'Rudolf Diesel': 'vznětový motor', 'Henry Ford': 'pásová výroba automobilů', 'Ferdinand Porsche': 'Volkswagen Brouk',
    'Wilbur Wright': 'první řízený let letadla s motorem (1903)', 'Orville Wright': 'první řízený let letadla s motorem (1903)', 'George Stephenson': 'lokomotiva Rocket, první veřejná železnice',
    'Samuel Morse': 'elektrický telegraf', 'Werner von Siemens': 'dynamo, elektrická lokomotiva', 'Otto Lilienthal': 'první opakované lety na kluzáku',
    'Louis Blériot': 'první přelet kanálu La Manche (1909)', 'Sergej Pavlovič Koroljov': 'raketa R-7, první družice Sputnik', 'Charles Babbage': 'analytický stroj',
    'Ada Lovelaceová': 'první počítačový program', 'Alan Turing': 'prolomení šifry Enigma, teorie výpočtu', 'Steve Jobs': 'Apple, iPhone', 'Steve Wozniak': 'Apple I, Apple II',
    'Bill Gates': 'Microsoft', 'Mark Zuckerberg': 'Facebook', 'Elon Musk': 'Tesla, SpaceX', 'Jeff Bezos': 'Amazon', 'Tim Berners-Lee': 'World Wide Web', 'Linus Torvalds': 'Linux',
    'Larry Page': 'Google', 'Sergey Brin': 'Google', 'Enzo Ferrari': 'závodní stáj a automobilka v Maranellu', 'František Křižík': 'oblouková lampa, elektrická dráha v Praze',
    'Josef Ressel': 'lodní šroub', 'Prokop Diviš': 'bleskosvod', 'Emil Škoda': 'strojírenské závody v Plzni', 'Tomáš Baťa': 'obuvnické závody ve Zlíně',
    'Václav Laurin': 'automobilka v Mladé Boleslavi', 'Václav Klement': 'automobilka v Mladé Boleslavi', 'Johannes Gutenberg': 'knihtisk s pohyblivými literami',
    'Louis Braille': 'slepecké písmo', 'Igor Sikorskij': 'vrtulník', 'Konstantin Eduardovič Ciolkovskij': 'teorie raketového letu', 'Jan Perner': 'železnice z Olomouce do Prahy',
    'Hans Ledwinka': 'automobily Tatra 77 a Tatra 87', 'Viktor Kaplan': 'vodní turbína s natáčivými lopatkami', 'Otto Wichterle': 'měkké kontaktní čočky',
    'Ernő Rubik': 'hlavolam s barevnými kostičkami', 'Gustave Eiffel': 'železná věž v Paříži, konstrukce Sochy Svobody', 'Nicolaus Otto': 'čtyřdobý spalovací motor',
    'Robert Bosch': 'magnetické zapalování motorů', 'Michail Timofejevič Kalašnikov': 'útočná puška AK-47', 'Jan Kašpar': 'první dálkový let v Čechách (1911)',
    'Isambard Kingdom Brunel': 'parník Great Eastern, železnice Great Western', 'John von Neumann': 'architektura počítače', 'Konrad Zuse': 'počítač Z3',
    'Grace Hopperová': 'první překladač, jazyk COBOL', 'Dennis Ritchie': 'jazyk C, Unix', 'Ken Thompson': 'Unix', 'Guido van Rossum': 'jazyk Python', 'James Gosling': 'jazyk Java',
    'Bjarne Stroustrup': 'jazyk C++', 'Alexej Pažitnov': 'hra Tetris', 'Markus Persson': 'hra Minecraft', 'Jimmy Wales': 'Wikipedie', 'Jack Dorsey': 'Twitter',
    'Pavel Valerjevič Durov': 'Telegram, VKontakte', 'Daniel Ek': 'Spotify', 'Larry Ellison': 'Oracle', 'Michael Dell': 'počítače na zakázku', 'Gordon Moore': 'Intel',
    'Andrew Grove': 'Intel', 'Federico Faggin': 'první mikroprocesor Intel 4004', 'Ken Kutaragi': 'PlayStation', 'Gunpei Yokoi': 'Game Boy', 'Šigeru Mijamoto': 'Super Mario, Zelda',
    'Nolan Bushnell': 'Atari, hra Pong', 'Douglas Engelbart': 'počítačová myš', 'Martin Cooper': 'mobilní telefon', 'Ray Tomlinson': 'e-mail', 'Vint Cerf': 'protokol TCP/IP',
    'John Logie Baird': 'televize', 'Vladimir Zvorykin': 'televizní snímací elektronka', 'Philo Farnsworth': 'elektronická televize', 'Frank Whittle': 'proudový motor',
    'Hans von Ohain': 'proudový motor', 'Christopher Cockerell': 'vznášedlo', 'Elisha Otis': 'bezpečnostní výtah', 'Isaac Merritt Singer': 'šicí stroj',
    'Eli Whitney': 'stroj na čištění bavlny', 'Cyrus McCormick': 'mechanická žačka', 'John Boyd Dunlop': 'nafukovací pneumatika', 'Willis Carrier': 'klimatizace',
    'Lee de Forest': 'elektronka trioda', 'Percy Spencer': 'mikrovlnná trouba', 'Robert Goddard': 'raketa na kapalné palivo', 'Joseph Marie Jacquard': 'tkalcovský stav řízený děrnými štítky',
    'Richard Arkwright': 'spřádací stroj', 'James Hargreaves': 'spřádací stroj', 'Edmund Cartwright': 'mechanický tkalcovský stav', 'Robert Fulton': 'parník',
    'Thomas Newcomen': 'atmosférický parní stroj', 'Nicolas-Joseph Cugnot': 'první parní automobil', 'Étienne Lenoir': 'plynový spalovací motor', 'August Horch': 'automobilka Audi',
    'Ettore Bugatti': 'luxusní sportovní automobily', 'Igo Etrich': 'letoun Taube', 'Josef Božek': 'parní vůz (1815)', 'Antonín Svoboda': 'počítač SAPO', 'Emil Kolben': 'ČKD',
    'Jakub Kryštof Rad': 'kostkový cukr', 'Christopher Latham Sholes': 'psací stroj, klávesnice QWERTY', 'Hiram Maxim': 'kulomet', 'Samuel Colt': 'revolver',
    'Hugo Junkers': 'celokovová letadla', 'Willy Messerschmitt': 'stíhačka Bf 109', 'Jensen Huang': 'Nvidia', 'Sam Altman': 'OpenAI, ChatGPT', 'Sundar Pichai': 'Google',
    'Tim Cook': 'Apple', 'Satya Nadella': 'Microsoft', 'Jack Ma': 'Alibaba', 'Steve Ballmer': 'Microsoft', 'Paul Allen': 'Microsoft', 'Donald Knuth': 'sázecí systém TeX',
    'Niklaus Wirth': 'jazyk Pascal', 'Edsger Dijkstra': 'algoritmus nejkratší cesty', 'John McCarthy': 'jazyk Lisp, pojem umělá inteligence', 'Claude Shannon': 'teorie informace',
    'James Dyson': 'bezsáčkový vysavač', 'Josephine Cochrane': 'myčka nádobí', 'Mary Andersonová': 'stěrač', 'Stephanie Kwoleková': 'kevlar', 'Juan de la Cierva': 'vírník',
    'Alberto Santos-Dumont': 'vzducholodě a letoun 14-bis', 'Glenn Curtiss': 'hydroplán', 'Charles Lindbergh': 'první sólový přelet Atlantiku (1927)', 'Felix Wankel': 'rotační motor',
    'Wilhelm Maybach': 'motory a luxusní automobily', 'Bertha Benzová': 'první dálková jízda automobilem (1888)', 'Ferruccio Lamborghini': 'traktory a sportovní automobily',
    'Sóičiró Honda': 'motocykly a automobily', 'Akio Morita': 'Sony, Walkman', 'Masaru Ibuka': 'Sony, Walkman'
};

// Vynálezy s jasným rokem a vynálezcem (rok podle českých učebnic a encyklopedií; u ostatních vynálezů se rok neuvádí): název v datech → [rok, kdo, země]
export const INVENTION_FACTS = {
    'Disketa': [1971, 'IBM', 'Spojené státy americké'], 'Pevný disk': [1956, 'IBM', 'Spojené státy americké'], 'Universal Serial Bus': [1996, '', 'Spojené státy americké'],
    'VHS': [1976, 'JVC', 'Japonsko'], 'Magnetofon': [1935, 'AEG', 'Německo'], '3D tisk': [1984, 'Chuck Hull', 'Spojené státy americké'],
    'Fotovoltaický článek': [1954, 'Bellovy laboratoře', 'Spojené státy americké'], 'Tank': [1916, '', 'Spojené království'], 'Trolejbus': [1882, 'Werner von Siemens', 'Německo'],
    'Větrná elektrárna': [1887, 'James Blyth', 'Spojené království'], 'Herní konzole': [1972, 'Ralph Baer', 'Spojené státy americké'], 'Ethernet': [1973, 'Robert Metcalfe', 'Spojené státy americké'],
    'Wi-Fi': [1997, '', ''], 'Antiblokovací systém': [1978, '', 'Německo'], 'ABS': [1978, '', 'Německo'], 'Kosmický raketoplán': [1981, 'NASA', 'Spojené státy americké'],
    'Umělá družice': [1957, '', 'Sovětský svaz'], 'Kardiostimulátor': [1958, 'Rune Elmqvist', 'Švédsko'],
    'Kompaktní disk': [1979, 'Philips a Sony', ''], 'Blu-ray': [2006, 'Sony', 'Japonsko'], 'DVD': [1995, '', ''], 'Global Positioning System': [1978, '', 'Spojené státy americké']
};

// Jména, která Wikidata uvádějí úředně nebo s kódem (Telefonaktiebolaget L. M. Ericsson, SAP SE), a jména firem stejná jako jméno zakladatele
// (firma Robert Bosch – osobnost Robert Bosch): ve hře běžný název (podle jména v datech)
export const NAME_OVERRIDES = {
    'Telefonaktiebolaget L. M. Ericsson': 'Ericsson', 'Avast Software s.r.o.': 'Avast', 'AERO Vodochody Aerospace': 'Aero Vodochody', 'firmy:Robert Bosch': 'Bosch',
    'SAP SE': 'SAP', 'Dassault Systèmes SE': 'Dassault Systèmes', 'Sinclair ZX Spectrum': 'ZX Spectrum', 'Sega Genesis/Mega Drive': 'Sega Mega Drive', 'Valve Corporation': 'Valve',
    'Oracle Corporation': 'Oracle', 'Whirlpool Corporation': 'Whirlpool', 'Y Soft Corporation': 'Y Soft', 'Open AI': 'OpenAI', 'Tamagoči': 'Tamagoči', 'Diskman': 'Discman'
};
// Popisy z Wikidat, které jsou chybné nebo poškozené (podle jména ve hře)
export const DESCRIPTION_OVERRIDES = {
    Logitech: 'švýcarský výrobce počítačového příslušenství', 'Dassault Systèmes': 'francouzská softwarová společnost', Panasonic: 'japonský výrobce elektroniky',
    Bosch: 'německý výrobce automobilových dílů, nářadí a spotřebičů', Avast: 'česká softwarová společnost, výrobce antiviru'
};

// Položky, které do tématu nepatří, i když je třída přinese (podle názvu článku)
export const GLOBAL_EXCLUDE = /^(Seznam |Dějiny |Historie )/u;
