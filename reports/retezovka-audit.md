# Audit Řetězovky

Vygenerováno skriptem `node scripts/audit-retezovka.mjs --label=…` (before: 2026-11-14, after: 2026-11-14).
Řetězy dne: 365 dní od 2026-11-15 (semínko dne jako v aplikaci), cvičné řetězy: 1000 (semínka audit-0 …).
Odpovědi zadarmo se počítají nezávisle na generátoru jen z hotového řetězu a z polohy uzlů v grafu (město, stát, muzeum).

## Řetězovka dne

| Ukazatel | Před (původní generátor) | Po (nový generátor) |
|---|---|---|
| Řetězů (sestaveno / nesestaveno) | 365 / 0 | 365 / 0 |
| Nouzová úroveň hledání (počty podle úrovně) | 0: 47, 1: 177, 2: 126, 3: 11, 4: 4 | 0: 6, 1: 43, 2: 123, 3: 64, 4: 36, 5: 5, 6: 78, 7: 10 |
| Čas na řetěz (ms) | 778 | 1219 |
| Různých vazeb / šablon otázek | 31 / 31 | 64 / 110 |
| Oborů v řetězu (průměr) | 4.6 | 3 |
| Různých uzlů / začátků | 319 / 160 | 580 / 182 |
| Rozcestníků (stát, město) v řetězu: průměr / nejvíc | 2.61 / 4 | 1.79 / 2 |
| Řetězy se 3+ rozcestníky | 58.4 % | 0 % |
| Zeměpisných skoků (odpověď stát/město) na řetěz | 2.61 | 1.79 |
| Dva zeměpisné skoky po sobě (počet) | 109 | 0 |
| Řetězy se 3+ zeměpisnými skoky | 58.4 % | 0 % |
| Triviální otázky hlavní město / stát | 109 (4.3 % otázek, v 29.3 % řetězů) | 0 (0 % otázek, v 0 % řetězů) |
| Odpovědi zadarmo (celkem / řetězů) | 155 / 135 | 0 / 0 |
| … plyne z dřívějších článků (implied) | 84 | 0 |
| … návrat k uzlu (revisit) | 0 | 0 |
| … odpověď mezi možnostmi dřívější otázky | 71 | 0 |
| … odpověď v textu dřívější otázky | 0 | 0 |
| Řetězy s opakovaným uzlem | 0 | 0 |
| Dny se stejným rozcestníkem jako v posledních 7 dnech | 349 (757 opakování) | 27 (31 opakování) |
| Dny se stejným jiným uzlem jako v posledních 7 dnech | 282 | 61 |
| Stejný začátek do 30 dní | 72 | 20 |
| Společných uzlů se včerejškem (průměr) | 0.66 | 0.07 |

### Před (původní generátor): řetěz dne

- **Obory (podíl otázek):** stavby 25.3 %, osobnost 23.7 %, autor 21.8 %, sport 12.7 %, muzeum 6.1 %, geo 4.3 %, kapela 3.6 %, priroda 1.4 %, postava 1.1 %
- **Vazby:** personCountry 370, workAuthor 260, landmarkCity 205, countryLandmark 192, cityLandmark 190, landmarkArchitect 145, countryPerson 140, museumArt 133, cityGames 89, authorWork 78, architectLandmark 75, gamesCity 71, bandMember 68, landmarkCountry 59, cityBand 54, capital 53, countryGames 52, bandCity 42, gamesCountry 36, countryCity 32, clubCity 30, characterBook 27, memberBand 24, countryClub 24, artMuseum 23, natureCountry 18, countryNature 18, cityCountry 14, clubCountry 12, cityClub 11, capitalOf 10
- **Druhy odpovědí:** country 519, landmark 480, city 433, architect 195, band 168, artwork 162, games 141, artist 129, musician 98, writer 63, music 35, club 35, director 27, book 27, character 14, river 11, athlete 6, composer 5, peak 4, island 3
- **Nejčastější rozcestníky (podíl řetězů):** Spojené království 42.5 %, Londýn 34.5 %, Itálie 33.7 %, Francie 33.2 %, Paříž 23.8 %, Řím 20.3 %, Španělsko 14.8 %, Spojené státy americké 12.9 %, Barcelona 9.6 %, New York 9.3 %, Liverpool 7.4 %, Turín 5.5 %, Švýcarsko 3.6 %, Madrid 2.5 %, Milán 1.1 %
- **Nejčastější uzly:** Spojené království (155), Londýn (126), Itálie (123), Francie (121), Paříž (87), Řím (74), Louvre (70), Leonardo da Vinci (63), The Shard (62), Metropolitní muzeum umění (61), Smrt Sokratova (61), Renzo Piano (61), The Beatles (59), Christopher Wren (57), Queen (55)
- **Ukázky odpovědí zadarmo:**
  - 7. článek „Ve kterém státě se konaly Letní olympijské hry 1992?“ → Španělsko: plyne z dřívějších článků (Barcelona, Španělsko)
  - 5. článek „Ve kterém státě stojí Bazilika svatého Denise?“ → Francie: plyne z dřívějších článků (Paříž, Francie)
  - 5. článek „Ve kterém státě stojí La Madeleine?“ → Francie: plyne z dřívějších článků (Paříž, Francie)
  - 5. článek „Ve kterém státě stojí GE Building?“ → Spojené státy americké: plyne z dřívějších článků (New York, Spojené státy americké)
  - 5. článek „Ze které země pochází malíř Leonardo da Vinci?“ → Itálie: odpověď byla mezi možnostmi dřívější otázky
  - 4. článek „Ze které země pochází architekt Renzo Piano?“ → Itálie: odpověď byla mezi možnostmi dřívější otázky

### Po (nový generátor): řetěz dne

- **Obory (podíl otázek):** film 17.3 %, architektura 16.1 %, historie 15.1 %, umeni 12.9 %, sport 11.4 %, hudba 8.9 %, veda 7.4 %, literatura 6.4 %, priroda 3.4 %, mytologie 1 %
- **Vazby:** cityDied 176, personCountry 170, personBorn 147, cityBorn 101, filmActor 95, personDied 94, countryLandmark 92, actorFilm 92, authorWork 88, workAuthor 87, countryPerson 79, rulerRealm 70, artistMovement 70, teacherOf 66, movementArtist 65, landmarkCountry 65, realmCapital 59, studentOf 58, landmarkCity 57, landmarkStyle 56, spouse 40, realmRuler 39, goldAthlete 37, countryNature 36, artMuseum 34, cityLandmark 32, capitalRealm 30, museumArt 30, artDepicts 29, clubAthlete 27, riverInto 27, parentOf 25, childOf 25, cityGames 25, cityClub 24, clubCity 23, styleLandmark 22, predecessor 22, athleteGold 22, athleteClub 20, gamesCity 19, successor 18, landmarkArchitect 16, countryGames 14, endemicSpecies 13, countryClub 12, discovererBody 12, moonPlanet 12, cityBand 12, memberBand 11, mythSpouse 9, depictedIn 7, natureCountry 7, bandCity 7, clubCountry 6, bandMember 5, mythFather 3, discovererElement 3, peakRange 3, mythParentOf 3, clubStadium 2, bodyDiscoverer 2, architectLandmark 2, gamesCountry 1
- **Druhy odpovědí:** city 406, country 249, landmark 182, ruler 158, actor 136, artist 130, film 120, realm 100, writer 98, composer 85, director 82, athlete 81, artwork 74, movement 70, physicist 65, games 61, river 59, club 56, style 56, musician 41, astronomer 41, architect 35, figure 33, myth 26, band 23, book 15, species 13, moon 12, planet 12, statesman 9, music 8, chemist 7, range 4, element 3, peak 3, stadium 2
- **Nejčastější rozcestníky (podíl řetězů):** Londýn 13.2 %, Spojené státy americké 12.3 %, Německo 12.1 %, Francie 9.6 %, Ciudad de México 9.3 %, Itálie 9 %, Vídeň 7.7 %, Praha 7.1 %, Řím 6.6 %, Kolumbie 6.3 %, Petrohrad 6 %, Turín 6 %, Lipsko 4.9 %, Paříž 4.9 %, San Francisco 4.1 %
- **Nejčastější uzly:** Londýn (48), Spojené státy americké (45), Německo (44), Leonardo DiCaprio (41), Francie (35), REVENANT Zmrtvýchvstání (34), Alejandro González Iñárritu (34), Ciudad de México (34), Itálie (33), Louvre (28), Vídeň (28), Gottfried Wilhelm Leibniz (27), Praha (26), Řím (24), Rakouské císařství (24)

## Cvičná řetězovka

| Ukazatel | Před (původní generátor) | Po (nový generátor) |
|---|---|---|
| Řetězů (sestaveno / nesestaveno) | 1000 / 0 | 1000 / 0 |
| Nouzová úroveň hledání (počty podle úrovně) | 0: 508, 1: 482, 2: 9, 3: 1 | 0: 1000 |
| Čas na řetěz (ms) | 142 | 163 |
| Různých vazeb / šablon otázek | 31 / 31 | 66 / 114 |
| Oborů v řetězu (průměr) | 4.6 | 3.5 |
| Různých uzlů / začátků | 397 / 252 | 861 / 441 |
| Rozcestníků (stát, město) v řetězu: průměr / nejvíc | 2.62 / 4 | 1.99 / 2 |
| Řetězy se 3+ rozcestníky | 58.1 % | 0 % |
| Zeměpisných skoků (odpověď stát/město) na řetěz | 2.62 | 1.99 |
| Dva zeměpisné skoky po sobě (počet) | 270 | 0 |
| Řetězy se 3+ zeměpisnými skoky | 58.1 % | 0 % |
| Triviální otázky hlavní město / stát | 270 (3.9 % otázek, v 26.9 % řetězů) | 0 (0 % otázek, v 0 % řetězů) |
| Odpovědi zadarmo (celkem / řetězů) | 333 / 287 | 0 / 0 |
| … plyne z dřívějších článků (implied) | 187 | 0 |
| … návrat k uzlu (revisit) | 0 | 0 |
| … odpověď mezi možnostmi dřívější otázky | 146 | 0 |
| … odpověď v textu dřívější otázky | 0 | 0 |
| Řetězy s opakovaným uzlem | 0 | 0 |

### Před (původní generátor): cvičný řetěz

- **Obory (podíl otázek):** osobnost 24.4 %, stavby 22.8 %, autor 22.2 %, sport 14.6 %, muzeum 5.4 %, geo 3.9 %, kapela 3.8 %, priroda 1.6 %, postava 1.4 %
- **Vazby:** personCountry 1019, workAuthor 762, countryLandmark 498, cityLandmark 490, landmarkCity 448, landmarkArchitect 397, countryPerson 386, museumArt 333, gamesCity 231, architectLandmark 206, countryGames 200, authorWork 189, cityGames 186, bandMember 179, bandCity 165, landmarkCountry 159, cityBand 136, clubCity 132, capital 117, countryClub 111, characterBook 95, memberBand 90, countryCity 78, natureCountry 75, gamesCountry 74, cityCountry 52, cityClub 47, clubCountry 44, artMuseum 44, countryNature 34, capitalOf 23
- **Druhy odpovědí:** country 1446, landmark 1238, city 1171, architect 561, band 488, games 386, artwork 384, artist 342, musician 277, writer 223, club 158, book 95, music 91, director 50, character 47, river 13, peak 11, island 8, athlete 6, composer 3, range 2
- **Nejčastější rozcestníky (podíl řetězů):** Spojené království 52.6 %, Londýn 44.2 %, Itálie 38.7 %, Francie 33.4 %, Paříž 21.6 %, Řím 19.2 %, Liverpool 9.4 %, Španělsko 8.9 %, Spojené státy americké 8 %, Turín 6.4 %, New York 4.4 %, Barcelona 3.8 %, Glasgow 1.9 %, Švýcarsko 1.6 %, Nizozemsko 1.4 %
- **Nejčastější uzly:** Spojené království (526), Londýn (442), Itálie (387), Francie (334), The Shard (247), Renzo Piano (245), Louvre (218), Paříž (216), The Beatles (202), Leonardo da Vinci (192), Řím (192), Christopher Wren (182), Queen (171), Letní olympijské hry 1960 (131), Katedrála svatého Pavla (123)
- **Ukázky odpovědí zadarmo:**
  - 5. článek „Ve kterém státě se konaly Letní olympijské hry 1948?“ → Spojené království: plyne z dřívějších článků (Londýn, Spojené království)
  - 6. článek „Ve kterém státě sídlí klub Chelsea FC?“ → Spojené království: plyne z dřívějších článků (Londýn, Spojené království)
  - 6. článek „Ve kterém státě sídlí klub Arsenal FC?“ → Spojené království: plyne z dřívějších článků (Londýn, Spojené království)
  - 5. článek „Ve kterém státě se konaly Letní olympijské hry 1992?“ → Španělsko: plyne z dřívějších článků (Barcelona, Španělsko)
  - 4. článek „Ze které země pochází architekt Jean Nouvel?“ → Francie: odpověď byla mezi možnostmi dřívější otázky
  - 5. článek „Ve kterém státě se konaly Letní olympijské hry 2024?“ → Francie: plyne z dřívějších článků (Paříž, Francie)

### Po (nový generátor): cvičný řetěz

- **Obory (podíl otázek):** umeni 17.5 %, architektura 16.9 %, sport 14.6 %, historie 12.1 %, veda 9.8 %, literatura 8.6 %, hudba 8 %, film 6.9 %, priroda 3.1 %, mytologie 2.6 %
- **Vazby:** personCountry 690, cityDied 409, cityBorn 389, countryLandmark 346, landmarkCity 298, personDied 295, countryPerson 268, personBorn 199, teacherOf 198, authorWork 184, studentOf 178, artistMovement 177, artMuseum 169, workAuthor 162, depictedIn 151, movementArtist 148, rulerRealm 141, landmarkCountry 139, countryClub 133, goldAthlete 131, realmRuler 129, clubCity 121, countryGames 119, artDepicts 111, actorFilm 93, countryNature 86, landmarkStyle 86, filmActor 82, museumArt 77, natureCountry 77, capitalRealm 76, successor 63, gamesCity 62, childOf 62, cityLandmark 58, parentOf 56, clubAthlete 54, mythFather 53, spouse 51, landmarkArchitect 50, riverInto 49, athleteGold 45, athleteClub 44, realmCapital 42, predecessor 40, bandMember 39, cityBand 37, mythSpouse 36, mythParentOf 35, discovererBody 33, memberBand 30, cityClub 30, clubCountry 30, moonPlanet 29, gamesCountry 23, cityGames 21, bodyDiscoverer 18, bandCity 12, characterBook 10, clubStadium 9, architectLandmark 5, styleLandmark 4, discovererElement 3, endemicSpecies 2, inventorInvention 2, mythMother 1
- **Druhy odpovědí:** city 1029, country 959, landmark 582, artist 551, ruler 401, artwork 333, writer 323, physicist 245, athlete 241, realm 217, club 207, games 185, myth 180, composer 178, movement 177, actor 147, film 108, director 93, river 93, astronomer 92, chemist 87, style 86, musician 78, band 69, architect 65, figure 49, book 41, moon 33, statesman 31, music 30, planet 29, island 28, peak 11, stadium 9, element 3, character 3, species 2, range 2, invention 2, lake 1
- **Nejčastější rozcestníky (podíl řetězů):** Francie 22.6 %, Spojené království 20.6 %, Paříž 19.6 %, Londýn 18 %, Itálie 12.5 %, Španělsko 11.3 %, Spojené státy americké 10.5 %, Madrid 9.1 %, Německo 8.3 %, New York 8.2 %, Řím 5.1 %, Benátky 4.8 %, Barcelona 3.7 %, Nizozemsko 3.4 %, Florencie 3 %
- **Nejčastější uzly:** Francie (226), Spojené království (206), Paříž (196), Londýn (180), Itálie (125), Španělsko (113), Spojené státy americké (105), Saturn požírající svého syna (93), Museo del Prado (93), Kronos (92), Madrid (91), Německo (83), New York (82), Afrodíté (71), Louvre (70)

## Ukázky řetězů dne: Před (původní generátor)

### 2026-11-15: Olympia

1. Kdo namaloval obraz Olympia? → **Édouard Manet** _(Eugène Delacroix · Édouard Manet · Paul Cézanne · Edgar Degas)_
2. Ze které země pochází malíř Édouard Manet? → **Francie** _(Rusko · Spojené království · Německo · Francie)_
3. Kdo z těchto architektů pochází z Francie? → **Jean Nouvel** _(James Stirling · Richard Rogers · Jean Nouvel · Albert Speer mladší)_
4. Kterou z těchto staveb navrhl Jean Nouvel? → **Torre Glòries** _(Centre Georges Pompidou · The Shard · Turning Torso · Torre Glòries)_
5. Ve kterém městě stojí Torre Glòries? → **Barcelona** _(Valencie · Barcelona · Sevilla · Madrid)_
6. Které z těchto olympijských her se konaly ve městě Barcelona? → **Letní olympijské hry 1992** _(Letní olympijské hry 1980 · Letní olympijské hry 1992 · Letní olympijské hry 1972 · Letní olympijské hry 2024)_
7. Ve kterém státě se konaly Letní olympijské hry 1992? → **Španělsko** _(Španělsko · Albánie · Polsko · Rusko)_

### 2026-11-16: Eugène Delacroix

1. Které z těchto děl namaloval Eugène Delacroix? → **Svoboda vede lid na barikády** _(Poutník nad mořem mlhy · Svoboda vede lid na barikády · Vor Medúzy · Maratova smrt)_
2. Kde je k vidění obraz Svoboda vede lid na barikády? → **Louvre** _(Louvre · Muzeum Orsay · Britské muzeum · Museo del Prado)_
3. Ve kterém městě stojí muzeum Louvre? → **Paříž** _(Helsinky · Lyon · Bordeaux · Paříž)_
4. Která z těchto staveb stojí ve městě Paříž? → **Bazilika svatého Denise** _(Katedrála svatého Petra v Kolíně nad Rýnem · Bazilika svatého Denise · Salisburská katedrála · Katedrála v Roskilde)_
5. Ve kterém státě stojí Bazilika svatého Denise? → **Francie** _(Německo · Francie · Ukrajina · Nizozemsko)_
6. Kdo z těchto spisovatelů pochází z Francie? → **Jules Verne** _(Lewis Carroll · Jules Verne · Alexandr Sergejevič Puškin · Selma Lagerlöfová)_
7. Kterou z těchto postav vymyslel Jules Verne? → **Kapitán Nemo** _(Kapitán Nemo · Tom Sawyer · Profesor Moriarty · Mauglí)_

### 2026-11-17: Kensingtonský palác

1. Kdo navrhl stavbu Kensingtonský palác? → **Christopher Wren** _(Gian Lorenzo Bernini · Francesco Borromini · Christopher Wren · François Mansart)_
2. Kterou z těchto staveb navrhl Christopher Wren? → **Katedrála svatého Pavla** _(Katedrála svaté Hedviky Slezské · Katedrála svatého Pavla · Chrám svatých Petra a Pavla v Petrohradě · Katedrála svatého Klimenta)_
3. Ve kterém státě stojí Katedrála svatého Pavla? → **Spojené království** _(Dánsko · Finsko · Norsko · Spojené království)_
4. Které z těchto olympijských her se konaly ve Spojeném království? → **Letní olympijské hry 1948** _(Letní olympijské hry 1952 · Letní olympijské hry 1948 · Letní olympijské hry 1972 · Letní olympijské hry 1936)_
5. Které město hostilo Letní olympijské hry 1948? → **Londýn** _(Řím · Londýn · Liverpool · Praha)_
6. Která z těchto kapel vznikla ve městě Londýn? → **Queen** _(The Beatles · ABBA · Queen · Buty)_
7. Kdo z těchto hudebníků působil v kapele Queen? → **Freddie Mercury** _(John Lennon · Freddie Mercury · Paul McCartney · Ringo Starr)_

### 2026-11-18: William Faulkner

1. Ze které země pochází spisovatel William Faulkner? → **Spojené státy americké** _(Spojené státy americké · Mexiko · Kuba · Kanada)_
2. Která z těchto staveb stojí ve Spojených státech amerických? → **Metropolitní muzeum umění** _(Izraelské muzeum · Metropolitní muzeum umění · Stará národní galerie · Pavilon Secese)_
3. Které z těchto děl je k vidění v Metropolitním muzeu umění? → **Smrt Sokratova** _(Nahá Maja · Poprava povstalců v Madridu · Smrt Sokratova · Vor Medúzy)_
4. Kdo namaloval obraz Smrt Sokratova? → **Jacques-Louis David** _(Camille Pissarro · Jacques-Louis David · Jean Auguste Dominique Ingres · Édouard Manet)_
5. Ze které země pochází malíř Jacques-Louis David? → **Francie** _(Francie · Portugalsko · Albánie · Finsko)_
6. Která z těchto staveb stojí ve Francii? → **Palais de Chaillot** _(Palais de Chaillot · Livadijský palác · Thunovský palác ve Sněmovní · Medicejský palác)_
7. Ve kterém městě stojí Palais de Chaillot? → **Paříž** _(Moskva · Paříž · Lisabon · Madrid)_

### 2026-11-19: Bohemian Rhapsody

1. Kdo nahrál píseň Bohemian Rhapsody? → **Queen** _(Queen · Iron Maiden · Muse · The Rolling Stones)_
2. Kdo z těchto hudebníků působil v kapele Queen? → **Freddie Mercury** _(John Lennon · Freddie Mercury · Mick Jagger · Paul McCartney)_
3. Ze které země pochází zpěvák Freddie Mercury? → **Spojené království** _(Polsko · Spojené království · Dánsko · Nizozemsko)_
4. Která z těchto staveb stojí ve Spojeném království? → **Buckinghamský palác** _(Zámek Karlova Koruna · Buckinghamský palác · Zámek Jaroměřice nad Rokytnou · Nymphenburg)_
5. Ve kterém městě stojí Buckinghamský palác? → **Londýn** _(Glasgow · Londýn · Madrid · Budapešť)_
6. Která z těchto staveb stojí ve městě Londýn? → **Katedrála svatého Pavla** _(Katedrála svatého Alexandra Něvského · Chrám svatých Petra a Pavla v Petrohradě · Katedrála svatého Pavla · Katedrála svatého Klimenta)_
7. Kdo navrhl stavbu Katedrála svatého Pavla? → **Christopher Wren** _(Christopher Wren · François Mansart · Gian Lorenzo Bernini · Francesco Borromini)_

### 2026-11-20: Revolver

1. Kdo vydal album Revolver? → **The Beatles** _(Queen · The Beatles · Iron Maiden · Motörhead)_
2. Kdo z těchto hudebníků působil v kapele The Beatles? → **John Lennon** _(Robbie Williams · Keith Richards · Freddie Mercury · John Lennon)_
3. Ze které země pochází hudebník John Lennon? → **Spojené království** _(Ukrajina · Švýcarsko · Nizozemsko · Spojené království)_
4. Která z těchto staveb stojí ve Spojeném království? → **Tower** _(Predjamský hrad · Alhambra · Wartburg · Tower)_
5. Ve kterém městě stojí Tower? → **Londýn** _(Kyjev · Londýn · Liverpool · Moskva)_
6. Která z těchto staveb stojí ve městě Londýn? → **The Shard** _(Torre Glòries · Tour Montparnasse · The Shard · La Grande Arche)_
7. Kdo navrhl stavbu The Shard? → **Renzo Piano** _(Renzo Piano · Norman Foster · Alvar Aalto · Zaha Hadid)_

### 2026-11-21: Letní olympijské hry 1992

1. Které město hostilo Letní olympijské hry 1992? → **Barcelona** _(Madrid · Valencie · Sevilla · Barcelona)_
2. Která z těchto staveb stojí ve městě Barcelona? → **Torre Glòries** _(The Shard · 30 St Mary Axe · Tour Montparnasse · Torre Glòries)_
3. Kdo navrhl stavbu Torre Glòries? → **Jean Nouvel** _(Auguste Perret · Peter Zumthor · Jean Nouvel · André Le Nôtre)_
4. Ze které země pochází architekt Jean Nouvel? → **Francie** _(Dánsko · Francie · Nizozemsko · Spojené království)_
5. Která z těchto staveb stojí ve Francii? → **Palais Bourbon** _(Thunovský palác ve Sněmovní · Zimní palác · Christiansborg · Palais Bourbon)_
6. Ve kterém městě stojí Palais Bourbon? → **Paříž** _(Kyjev · Londýn · Paříž · Štrasburk)_
7. Které z těchto olympijských her se konaly ve městě Paříž? → **Letní olympijské hry 2024** _(Letní olympijské hry 2024 · Letní olympijské hry 2004 · Letní olympijské hry 1980 · Letní olympijské hry 2012)_

### 2026-11-22: Vincent van Gogh

1. Které z těchto děl namaloval Vincent van Gogh? → **Hvězdná noc nad Rhônou** _(Hvězdná noc nad Rhônou · Zlatá Adele · Ivan Hrozný a jeho syn Ivan 16. listopadu 1581 · Bar ve Folies Bergère)_
2. Kde je k vidění obraz Hvězdná noc nad Rhônou? → **Muzeum Orsay** _(Muzeum Orsay · Stará národní galerie · Ermitáž · Louvre)_
3. Ve kterém městě stojí Muzeum Orsay? → **Paříž** _(Varšava · Paříž · Lyon · Kyjev)_
4. Která z těchto staveb stojí ve městě Paříž? → **La Madeleine** _(La Madeleine · Kostel svatého Mikuláše v Praze-Starém Městě · Votivní kostel · Notre-Dame de la Garde)_
5. Ve kterém státě stojí La Madeleine? → **Francie** _(Francie · Nizozemsko · Švýcarsko · Albánie)_
6. Kdo z těchto spisovatelů pochází z Francie? → **Jules Verne** _(Jules Verne · Rudyard Kipling · Henrik Ibsen · Nikolaj Vasiljevič Gogol)_
7. Kterou z těchto postav vymyslel Jules Verne? → **Kapitán Nemo** _(Tom Sawyer · Kapitán Nemo · Mauglí · Huckleberry Finn)_

### 2026-11-23: John Ronald Reuel Tolkien

1. Ze které země pochází spisovatel John Ronald Reuel Tolkien? → **Spojené království** _(Polsko · Francie · Spojené království · Finsko)_
2. Která z těchto staveb stojí ve Spojeném království? → **The Shard** _(Tour Montparnasse · La Grande Arche · Torre Glòries · The Shard)_
3. Kdo navrhl stavbu The Shard? → **Renzo Piano** _(Renzo Piano · Norman Foster · Friedensreich Hundertwasser · Santiago Calatrava)_
4. Ze které země pochází architekt Renzo Piano? → **Itálie** _(Francie · Finsko · Rusko · Itálie)_
5. Které z těchto olympijských her se konaly v Itálii? → **Letní olympijské hry 1960** _(Letní olympijské hry 1972 · Letní olympijské hry 1980 · Letní olympijské hry 1952 · Letní olympijské hry 1960)_
6. Které město hostilo Letní olympijské hry 1960? → **Řím** _(Lisabon · Madrid · Kyjev · Řím)_
7. Která z těchto staveb stojí ve městě Řím? → **San Carlo alle Quattro Fontane** _(San Carlo alle Quattro Fontane · Kostel svatého Mikuláše na Malé Straně · Kostel svatého Ignáce z Loyoly v Praze · Pražská Loreta)_

### 2026-11-24: Poprava povstalců v Madridu

1. Kdo namaloval obraz Poprava povstalců v Madridu? → **Francisco Goya** _(Francisco Goya · Salvador Dalí · Joan Miró · Jean Auguste Dominique Ingres)_
2. Ze které země pochází malíř Francisco Goya? → **Španělsko** _(Norsko · Španělsko · Rusko · Spojené království)_
3. Která z těchto staveb stojí ve Španělsku? → **Torre Glòries** _(30 St Mary Axe · Torre Glòries · The Shard · Tour Montparnasse)_
4. Kdo navrhl stavbu Torre Glòries? → **Jean Nouvel** _(Auguste Perret · Richard Rogers · Jean Nouvel · François Mansart)_
5. Ze které země pochází architekt Jean Nouvel? → **Francie** _(Dánsko · Francie · Nizozemsko · Finsko)_
6. Která z těchto staveb stojí ve Francii? → **Bazilika svatého Denise** _(Bazilika svatého Denise · Katedrála Panny Marie a svatého Štěpána ve Špýru · Yorská katedrála · Katedrála v Roskilde)_
7. Ve kterém městě stojí Bazilika svatého Denise? → **Paříž** _(Roubaix · Moskva · Londýn · Paříž)_

## Ukázky řetězů dne: Po (nový generátor)

### 2026-11-15: Šifra mistra Leonarda

1. Kdo z těchto herců hrál ve filmu Šifra mistra Leonarda? → **Tom Hanks** _(Keanu Reeves · Tom Hanks · Brad Pitt · Johnny Depp)_  
   Ve filmu Šifra mistra Leonarda (2006) hrál Tom Hanks.
2. Ze které země pochází herec Tom Hanks? → **Spojené státy americké** _(Kanada · Spojené státy americké · Rusko · Mexiko)_  
   Tom Hanks pochází ze Spojených států amerických.
3. Kterou z těchto staveb najdeš ve Spojených státech amerických? → **Golden Gate Bridge** _(Golden Gate Bridge · Tower Bridge · CN Tower · Viadukt Millau)_  
   Golden Gate Bridge stojí ve Spojených státech amerických.
4. Ve kterém městě stojí Golden Gate Bridge? → **San Francisco** _(San Francisco · Atlanta · Miami · Chicago)_  
   Golden Gate Bridge stojí ve městě San Francisco.
5. Kdo z těchto hudebníků se narodil ve městě San Francisco? → **Courtney Love** _(Courtney Love · Anastacia · Diana Rossová · Nicole Scherzingerová)_  
   Courtney Love se narodila ve městě San Francisco (1964).
6. Koho měla Courtney Love za manžela? → **Kurt Cobain** _(Kurt Cobain · Louis Armstrong · Duke Ellington · Jay-Z)_  
   Courtney Love a Kurt Cobain byli manželé.
7. Ve které kapele působil Kurt Cobain? → **Nirvana** _(Linkin Park · 30 Seconds to Mars · Nirvana · Red Hot Chili Peppers)_  
   Kurt Cobain působil v kapele Nirvana.

### 2026-11-16: Lorenzo Ghiberti

1. Kdo z těchto osobností byl žákem osobnosti Lorenzo Ghiberti? → **Donatello** _(Donatello · Rafael Santi · Tizian · Leonardo da Vinci)_  
   Donatello byl žákem osobnosti Lorenzo Ghiberti.
2. Odkud pochází sochař Donatello? → **Itálie** _(Německo · Ukrajina · Itálie · Spojené království)_  
   Donatello pochází z Itálie.
3. Která z těchto staveb stojí v Itálii? → **San Clemente** _(Bazilika svatého Jiří · Bazilika svaté Ludmily · San Clemente · Bazilika svatého Prokopa)_  
   San Clemente stojí v Itálii.
4. Ve kterém městě najdeš stavbu San Clemente? → **Řím** _(Řím · Florencie · Athény · Neapol)_  
   San Clemente stojí ve městě Řím.
5. Kdo z těchto panovníků zemřel ve městě Řím? → **Viktor Emanuel II.** _(Viktor Emanuel II. · Husajn I. · Petr II. Brazilský · Josef II. Habsbursko-Lotrinský)_  
   Viktor Emanuel II. zemřel ve městě Řím (1878).
6. Kterému státu vládl panovník Viktor Emanuel II.? → **Italské království** _(Britská Indie · Třetí Francouzská republika · Japonské císařství · Italské království)_  
   Viktor Emanuel II. stál v čele státu Italské království.
7. Kdo z těchto panovníků stál v čele státu Italské království? → **Umberto I.** _(Umberto I. · Josef II. Habsbursko-Lotrinský · Abdulhamid II. · Ferdinand I. Dobrotivý)_  
   Umberto I. stál v čele státu Italské království.

### 2026-11-17: Petr III.

1. V čele kterého státu stál Petr III.? → **Ruské impérium** _(Ruské impérium · Království Velké Británie · Čching · Království obojí Sicílie)_  
   Petr III. stál v čele státu Ruské impérium.
2. Které město bylo hlavním městem státu Ruské impérium? → **Petrohrad** _(Krasnodar · Soči · Moskva · Petrohrad)_  
   Hlavním městem státu Ruské impérium bylo město Petrohrad.
3. Kdo z těchto fyziků zemřel ve městě Petrohrad? → **Leonhard Euler** _(Henri Poincaré · René Descartes · Wolfgang Pauli · Leonhard Euler)_  
   Leonhard Euler zemřel ve městě Petrohrad (1783).
4. Kdo z těchto osobností byl žákem osobnosti Leonhard Euler? → **Joseph-Louis Lagrange** _(Joseph-Louis Lagrange · Georges Edouard Lemaître · Nicolas Camille Flammarion · Fred Hoyle)_  
   Joseph-Louis Lagrange byl žákem osobnosti Leonhard Euler.
5. Kde se narodil astronom Joseph-Louis Lagrange? → **Turín** _(Turín · Milán · Neapol · Palermo)_  
   Joseph-Louis Lagrange se narodil ve městě Turín (1736).
6. Který z těchto klubů je doma ve městě Turín? → **Juventus FC** _(Rangers FC · AFC Ajax · Juventus FC · Chelsea FC)_  
   Klub Juventus FC sídlí ve městě Turín.
7. Kdo z těchto hráčů oblékal dres klubu Juventus FC? → **Zinédine Zidane** _(Zinédine Zidane · Thierry Henry · Antoine Griezmann · Kylian Mbappé)_  
   Zinédine Zidane hrál za klub Juventus FC.

### 2026-11-18: John Constable

1. Ke kterému směru se řadí malíř John Constable? → **Romantismus** _(Romantismus · Abstraktní umění · Impresionismus · Kubismus)_  
   John Constable patřil ke směru romantismus.
2. Kdo z těchto výtvarníků patřil ke směru romantismus? → **Théodore Géricault** _(Gustave Moreau · Théodore Géricault · William-Adolphe Bouguereau · Marcel Duchamp)_  
   Théodore Géricault patřil ke směru romantismus.
3. Které z těchto děl namaloval Théodore Géricault? → **Vor Medúzy** _(Nahá Maja · Vor Medúzy · Poutník nad mořem mlhy · Saturn požírající svého syna)_  
   Obraz Vor Medúzy namaloval Théodore Géricault (1819).
4. Ve kterém muzeu nebo galerii je obraz Vor Medúzy? → **Louvre** _(Britské muzeum · Muzeum Orsay · Museo del Prado · Louvre)_  
   Obraz Vor Medúzy je k vidění v Louvru.
5. Ve kterém státě stojí muzeum Louvre? → **Francie** _(Itálie · Francie · Norsko · Ukrajina)_  
   Muzeum Louvre stojí ve Francii.
6. Kdo z těchto spisovatelů pochází z Francie? → **Gustave Flaubert** _(Gustave Flaubert · Arthur Conan Doyle · Charles Dickens · Alexandr Sergejevič Puškin)_  
   Gustave Flaubert pochází z Francie.
7. Koho z těchto osobností učil Gustave Flaubert? → **Guy de Maupassant** _(Albert Camus · Antoine de Saint-Exupéry · Jean-Paul Sartre · Guy de Maupassant)_  
   Guy de Maupassant byl žákem osobnosti Gustave Flaubert.

### 2026-11-19: Katedrála svatého Petra v Řezně

1. Ve kterém státě stojí Katedrála svatého Petra v Řezně? → **Německo** _(Španělsko · Německo · Francie · Albánie)_  
   Katedrála svatého Petra v Řezně stojí v Německu.
2. Kdo z těchto skladatelů pochází z Německa? → **Ludwig van Beethoven** _(Fryderyk Chopin · Wolfgang Amadeus Mozart · Ludwig van Beethoven · Josef Mysliveček)_  
   Ludwig van Beethoven pochází z Německa.
3. Kdo byl učitelem osobnosti Ludwig van Beethoven? → **Joseph Haydn** _(Jan Dismas Zelenka · Joseph Haydn · Georg Friedrich Händel · Johann Sebastian Bach)_  
   Joseph Haydn byl učitelem osobnosti Ludwig van Beethoven.
4. Ve kterém městě zemřel Joseph Haydn? → **Vídeň** _(Stockholm · Vídeň · Berlín · Řím)_  
   Joseph Haydn zemřel ve městě Vídeň (1809).
5. Který z těchto historických států měl hlavní město Vídeň? → **Rakouské císařství** _(Výmarská republika · Ruská sovětská federativní socialistická republika · Rakouské císařství · Spojené království Velké Británie a Irska)_  
   Hlavním městem státu Rakouské císařství bylo město Vídeň.
6. Kdo z těchto panovníků vládl ve státě Rakouské císařství? → **Alžběta Bavorská** _(Viktorie Britská · Marie I. Tudorovna · Alžběta Bavorská · Cch’-si)_  
   Alžběta Bavorská stála v čele státu Rakouské císařství.
7. Koho měla Alžběta Bavorská za manžela? → **František Josef I.** _(Ludvík XVIII. · František Josef I. · Karel X. · Čaka)_  
   Alžběta Bavorská a František Josef I. byli manželé.

### 2026-11-20: Skrytá identita

1. Kdo z těchto herců hrál ve filmu Skrytá identita? → **Leonardo DiCaprio** _(Robin Williams · Leonardo DiCaprio · Johnny Depp · Will Smith)_  
   Ve filmu Skrytá identita (2006) hrál Leonardo DiCaprio.
2. Ve kterém z těchto filmů se objevil Leonardo DiCaprio? → **REVENANT Zmrtvýchvstání** _(Černá labuť · Star Wars: Síla se probouzí · Joker · REVENANT Zmrtvýchvstání)_  
   Leonardo DiCaprio hrál ve filmu REVENANT Zmrtvýchvstání (2015).
3. Kdo režíroval film REVENANT Zmrtvýchvstání? → **Alejandro González Iñárritu** _(Alejandro González Iñárritu · Sydney Pollack · Guillermo del Toro · Darren Aronofsky)_  
   Film REVENANT Zmrtvýchvstání režíroval Alejandro González Iñárritu (2015).
4. Ve kterém městě se narodil Alejandro González Iñárritu? → **Ciudad de México** _(Ottawa · Port-au-Prince · Guadalajara · Ciudad de México)_  
   Alejandro González Iñárritu se narodil ve městě Ciudad de México (1963).
5. Kdo z těchto spisovatelů zemřel ve městě Ciudad de México? → **Gabriel García Márquez** _(Gabriel García Márquez · Jorge Luis Borges · Mario Vargas Llosa · Pablo Neruda)_  
   Gabriel García Márquez zemřel ve městě Ciudad de México (2014).
6. Ze které země pochází spisovatel Gabriel García Márquez? → **Kolumbie** _(Chile · Kolumbie · Argentina · Venezuela)_  
   Gabriel García Márquez pochází z Kolumbie.
7. Kterou z těchto staveb najdeš v Kolumbii? → **Svatyně Las Lajas** _(Svatyně Las Lajas · La Madeleine · Socha Krista Spasitele · Mirante do Vale)_  
   Svatyně Las Lajas stojí v Kolumbii.

### 2026-11-21: Jindřich VIII. Tudor

1. Jindřich VIII. Tudor byl otcem které z těchto osobností? → **Alžběta I.** _(Alžběta II. · Akbar Veliký · Isabela I. · Alžběta I.)_  
   Jindřich VIII. Tudor → Alžběta I.: otec a dcera.
2. V čele kterého státu stála Alžběta I.? → **Anglické království** _(Francouzské království · Fátimovský chalífát · Anglické království · Kyjevská Rus)_  
   Alžběta I. stála v čele státu Anglické království.
3. Které město bylo hlavním městem státu Anglické království? → **Londýn** _(Londýn · Madrid · Řím · Moskva)_  
   Hlavním městem státu Anglické království bylo město Londýn.
4. Kdo z těchto herců a hereček zemřel ve městě Londýn? → **Ingrid Bergmanová** _(Greta Garbo · Jana Brejchová · Libuše Šafránková · Ingrid Bergmanová)_  
   Ingrid Bergmanová zemřela ve městě Londýn (1982).
5. Ze které země pochází herečka Ingrid Bergmanová? → **Švédsko** _(Rakousko · Česko · Norsko · Švédsko)_  
   Ingrid Bergmanová pochází ze Švédska.
6. Která z těchto staveb stojí ve Švédsku? → **Drottningholmský palác** _(Belveder · Palais Bourbon · Královský palác v Madridu · Drottningholmský palác)_  
   Drottningholmský palác stojí ve Švédsku.
7. Ke kterému architektonickému slohu patří Drottningholmský palác? → **Baroko** _(Byzantský sloh · Rokoko · Empír · Baroko)_  
   Sloh stavby Drottningholmský palác: baroko.

### 2026-11-22: Poprava povstalců v Madridu

1. Kdo je autorem obrazu Poprava povstalců v Madridu? → **Francisco Goya** _(Francisco Goya · William Turner · Pablo Picasso · Diego Velázquez)_  
   Obraz Poprava povstalců v Madridu namaloval Francisco Goya (1814).
2. Ke kterému uměleckému směru patřil Francisco Goya? → **Romantismus** _(Expresionismus · Dadaismus · Romantismus · Secese)_  
   Francisco Goya patřil ke směru romantismus.
3. Kdo z těchto umělců je představitelem směru romantismus? → **Caspar David Friedrich** _(Caspar David Friedrich · Franz Marc · Ernst Ludwig Kirchner · Otto Dix)_  
   Caspar David Friedrich patřil ke směru romantismus.
4. Kde zemřel malíř Caspar David Friedrich? → **Drážďany** _(Hannover · Drážďany · Lipsko · Stuttgart)_  
   Caspar David Friedrich zemřel ve městě Drážďany (1840).
5. Kterou z těchto staveb najdeš ve městě Drážďany? → **Semperova opera** _(Semperova opera · Mahenovo divadlo · Rudolfinum · Berlínská filharmonie)_  
   Semperova opera stojí ve městě Drážďany.
6. Ke kterému architektonickému slohu patří Semperova opera? → **Novorenesance** _(Novobaroko · Secese · Novogotika · Novorenesance)_  
   Sloh stavby Semperova opera: novorenesance.
7. Kterou z těchto staveb postavili v novorenesančním slohu? → **Livadijský palác** _(Palác Mafra · Palais de Chaillot · Livadijský palác · Palác Güell)_  
   Sloh stavby Livadijský palác: novorenesance.

### 2026-11-23: Metropolitní muzeum umění

1. Které z těchto děl je k vidění v Metropolitním muzeu umění? → **Smrt Sokratova** _(Poprava povstalců v Madridu · Nahá Maja · Vor Medúzy · Smrt Sokratova)_  
   Obraz Smrt Sokratova je k vidění v Metropolitním muzeu umění.
2. Koho zobrazuje obraz Smrt Sokratova? → **Platón** _(Platón · Fjodor Michajlovič Dostojevskij · Aristofanés · Hérodotos)_  
   Obraz Smrt Sokratova zobrazuje osobnost Platón.
3. Kdo z těchto osobností byl žákem osobnosti Platón? → **Eudoxos z Knidu** _(Aristarchos ze Samu · Poseidónios · Eudoxos z Knidu · Eratosthenés z Kyrény)_  
   Eudoxos z Knidu byl žákem osobnosti Platón.
4. Odkud pochází astronom Eudoxos z Knidu? → **Řecko** _(Švýcarsko · Rakousko · Řecko · Dánsko)_  
   Eudoxos z Knidu pochází z Řecka.
5. Které z těchto olympijských her se konaly v Řecku? → **Letní olympijské hry 2004** _(Letní olympijské hry 1992 · Letní olympijské hry 2004 · Letní olympijské hry 2012 · Letní olympijské hry 2024)_  
   Letní olympijské hry 2004 se konaly v Řecku.
6. Kdo z těchto sportovců získal zlatou medaili na Letních olympijských hrách 2004? → **Kirsty Coventryová** _(Katie Ledecká · Kirsty Coventryová · Gertrude Ederleová · Caeleb Dressel)_  
   Kirsty Coventryová vybojovala zlato na Letních olympijských hrách 2004.
7. Ve kterém městě se narodila Kirsty Coventryová? → **Harare** _(Lomé · N'Djamena · Harare · Rabat)_  
   Kirsty Coventryová se narodila ve městě Harare (1983).

### 2026-11-24: Giuseppe Arcimboldo

1. Ke kterému směru se řadí malíř Giuseppe Arcimboldo? → **Manýrismus** _(Manýrismus · Postimpresionismus · Fauvismus · Minimalismus)_  
   Giuseppe Arcimboldo patřil ke směru manýrismus.
2. Kdo z těchto výtvarníků patřil ke směru manýrismus? → **Paolo Veronese** _(Giorgio Vasari · Paolo Veronese · Antonio Allegri da Correggio · Tizian)_  
   Paolo Veronese patřil ke směru manýrismus.
3. Ze které země pochází malíř Paolo Veronese? → **Itálie** _(Francie · Rusko · Itálie · Nizozemsko)_  
   Paolo Veronese pochází z Itálie.
4. Která z těchto staveb stojí v Itálii? → **Bazilika Svatého Kříže v Jeruzalémě** _(Bazilika svatého Jiří · Bazilika Svatého Kříže v Jeruzalémě · Bom Jesus do Monte · Notre-Dame de la Garde)_  
   Bazilika Svatého Kříže v Jeruzalémě stojí v Itálii.
5. Ve kterém městě najdeš stavbu Bazilika Svatého Kříže v Jeruzalémě? → **Řím** _(Milán · Florencie · Řím · Madrid)_  
   Bazilika Svatého Kříže v Jeruzalémě stojí ve městě Řím.
6. Kdo z těchto státníků se narodil ve městě Řím? → **Julius Caesar** _(Julius Caesar · Nicolas Sarkozy · Recep Tayyip Erdoğan · Benjamin Netanjahu)_  
   Julius Caesar se narodil ve městě Řím.
7. Julius Caesar byl otcem které z těchto osobností? → **Augustus** _(Nero · Augustus · Caligula · Tiberius)_  
   Julius Caesar → Augustus: otec a syn.

