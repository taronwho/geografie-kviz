# Audit otázek

Vygenerováno 2026-11-06 18:12 UTC skriptem `npm run audit:questions` (14 témat, 21036 z 21036 položek, 551 s). Úplný výpis je v `reports/audit-otazek.json`.
Popis otázek: krátký popis z Wikidat (pole `d`, jako při výpadku Wikipedie); úvody z Wikipedie se načítají až ve hře (`--wiki=soubor` je doplní), proto „chudý popis“ vychází skoro u všech položek.

## Souhrn

- Nálezů celkem: **16685**, jistých chyb (kritických): **126**. Exit kód: 1.

| Problém | Počet |
|---|---:|
| Odpověď prozrazená v popisu či nápovědě (kritické) | 124 |
| Rozbité možnosti: dvě správné, prázdná, stejné (kritické) | 2 |
| Rozbitý odkaz na obrázek (kritické) | 0 |
| Nápověda opakuje popis | 153 |
| Příliš podobná nesprávná možnost | 349 |
| Nesprávné možnosti z jiné země než správná | 2195 |
| Nesprávné možnosti z jiné doby než správná | 434 |
| Málo možností | 0 |
| Nejednoznačná psaná odpověď (alias platí pro víc položek) | 547 |
| Stejná fotka u víc položek okruhu (duplicita, nebo cizí fotka) | 46 |
| Chudý nebo krátký popis | 12556 |
| Otázka bez nápovědy | 278 |
| Rozbitá data | 1 |

| Téma | Položek | Nálezů | Prozrazeno | Možnosti | Obrázky | Jiná země/doba | Podobné | Aliasy | Duplicita |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Architektura | 1057 | 757 | 66 | 0 | 0 | 0 | 2 | 39 | 10 |
| Biologie | 3324 | 2902 | 9 | 0 | 0 | 0 | 4 | 2 | 1 |
| Chemie | 764 | 592 | 0 | 0 | 0 | 0 | 26 | 2 | 5 |
| Film | 1599 | 894 | 0 | 0 | 0 | 115 | 0 | 52 | 78 |
| Fyzika | 683 | 426 | 2 | 0 | 0 | 0 | 5 | 17 | 0 |
| Geologie | 253 | 257 | 0 | 0 | 0 | 0 | 50 | 0 | 4 |
| Historie | 3274 | 3563 | 1 | 0 | 0 | 1080 | 168 | 94 | 0 |
| Hudba | 1306 | 995 | 2 | 0 | 0 | 308 | 4 | 24 | 3 |
| Literatura | 1164 | 958 | 5 | 0 | 0 | 279 | 0 | 11 | 1 |
| Mytologie | 518 | 407 | 0 | 0 | 0 | 0 | 3 | 0 | 6 |
| Sport | 1181 | 1390 | 33 | 0 | 0 | 612 | 51 | 33 | 16 |
| Výtvarné umění | 922 | 868 | 3 | 0 | 0 | 235 | 0 | 19 | 24 |
| Vlajky a znaky | 462 | 319 | 0 | 0 | 0 | 0 | 4 | 185 | 0 |
| Zeměpis | 4529 | 2357 | 3 | 2 | 0 | 0 | 32 | 69 | 5 |

Prozrazení podle druhu otázky: name 98, style 16, taxon 6, period 2, unit 1, author 1.

## Jisté chyby (kritické)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Arco dei Gavi (Q1153879) | style | popis: „staroveky“ prozrazuje odpověď (starověký) | Starověký oblouk ve Veroně. |
| architektura | Bauerova vila (Q11061354) | style | popis: „ceske“ prozrazuje odpověď (český) | Kulturní památka České republiky v obci Libodřice. |
| architektura | Beniesova vila (Q11127221) | style | popis: „ceske“ prozrazuje odpověď (český) | Kulturní památka České republiky v obci Lysá nad Labem. |
| architektura | Budova Právnické fakulty Univerzity Karlovy v Praze (Q22379612) | style | popis: „ceske“ prozrazuje odpověď (český) | Kulturní památka České republiky v Praze. |
| architektura | Caesarův chrám (Q1133288) | style | popis: „staroveky“ prozrazuje odpověď (starověký) | Starověký chrám v [***]. |
| architektura | Crám Athény Alea (Q3983230) | style | popis: „staroveky“ prozrazuje odpověď (starověké) | Starověký [***] chrám v Tegei. |
| architektura | Denderský chrámový komplex (Q735254) | style | popis: „starovekeho“ prozrazuje odpověď (starověké) | Chrámový kontext starověkého Egypta. |
| architektura | Dóžecí palác (Benátky) (Q189883) | name | popis: „benatske“ prozrazuje odpověď (Benátky) | Sídlo dóžete a benátské vlády. |
| architektura | Dům U Černé Matky Boží (Q2717859) | style | popis: „cesky“ prozrazuje odpověď (český) | Český [***] dům na roku Celetné ulice a Ovocného trhu v Praze na Starém Městě. |
| architektura | Evangelický kostel (Bludovice) (Q11985237) | name | popis: „bludovicich“ prozrazuje odpověď (Bludovice) | [***] v Bludovicích. |
| architektura | Evangelický kostel (Bystřice) (Q11985241) | name | popis: „bystrici“ prozrazuje odpověď (Bystřice) | [***] v Bystřici nad Olší. |
| architektura | Hadriánova knihovna (Q1455447) | style | popis: „staroveke“ prozrazuje odpověď (starověký) | Ruina starověké stavby v Athénách, z časů [***] nadvlády. |
| architektura | Chrám Dia Olympského (Q1123019) | style | popis: „staroveky“ prozrazuje odpověď (starověké) | Starověký chrám v Athénách. |
| architektura | Chrám svatého Alexandra Něvského (Lodž) (Q770458) | name | popis: „lodzi“ prozrazuje odpověď (Lodž) | Kostel v Lodži. |
| architektura | Chrám svatého Alexandra Něvského (Novosibirsk) (Q603289) | name | popis: „novosibirsku“ prozrazuje odpověď (Novosibirsk) | Kostel v Novosibirsku. |
| architektura | Chrám svatého Vladimíra (Kyjev) (Q1417441) | name | popis: „kyjeve“ prozrazuje odpověď (Kyjev) | Kostel v Kyjevě. |
| architektura | Chrám svatého Vladimíra (Mariánské Lázně) (Q4224989) | name | nápověda „místo“: „marianske“ prozrazuje odpověď (Mariánské) | Město: Mariánské Lázně |
| architektura | Chrám svatého Vladimíra (Sevastopol) (Q1848287) | name | popis: „sevastopolu“ prozrazuje odpověď (Sevastopol) | Kostel v Sevastopolu. |
| architektura | Janákova vila (Pelhřimov) (Q29397651) | style | popis: „ceske“ prozrazuje odpověď (český) | Kulturní památka České republiky v obci Pelhřimov. |
| architektura | Janákova vila (Pelhřimov) (Q29397651) | name | popis: „pelhrimov“ prozrazuje odpověď (Pelhřimov) | Kulturní památka České republiky v obci Pelhřimov. |
| architektura | Katedrála Nanebevzetí Panny Marie (Monreale) (Q1303856) | name | popis: „monreale“ prozrazuje odpověď (Monreale) | Kostel v Monreale na Sicílii. |
| architektura | Katedrála Nanebevzetí Panny Marie (Siena) (Q282554) | name | popis: „siene“ prozrazuje odpověď (Siena) | Kostel v Sieně. |
| architektura | Katedrála Nejsvětější Trojice (Sibiu) (Q3845208) | name | nápověda „místo“: „sibiu“ prozrazuje odpověď (Sibiu) | Město: Sibiu |
| architektura | Katedrála Notre-Dame (Amiens) (Q106934) | name | popis: „amiens“ prozrazuje odpověď (Amiens) | [***] v Amiens. |
| architektura | Katedrála Notre-Dame (Chartres) (Q180274) | name | popis: „chartres“ prozrazuje odpověď (Chartres) | Středověká katedrála, Chartres, Francie. |
| architektura | Katedrála Notre-Dame (Paříž) (Q2981) | name | popis: „parizi“ prozrazuje odpověď (Paříž) | [***] v Paříži. |
| architektura | Katedrála Notre-Dame (Remeš) (Q206823) | name | popis: „remesi“ prozrazuje odpověď (Remeš) | [***] v Remeši. |
| architektura | Katedrála svatého Jiří (Lvov) (Q1774485) | name | popis: „lvovu“ prozrazuje odpověď (Lvov) | Kostel ve Lvovu. |
| architektura | Katedrála svatého Mikuláše (Stockholm) (Q1133075) | name | popis: „stockholmu“ prozrazuje odpověď (Stockholm) | Kostel ve Stockholmu. |
| architektura | Katedrála svatého Patrika (Dublin) (Q846365) | name | popis: „dublinu“ prozrazuje odpověď (Dublin) | [***] v Dublinu. |
| architektura | Katedrála svatého Patrika (New York) (Q624556) | name | nápověda „místo“: „york“ prozrazuje odpověď (York) | Město: New York |
| architektura | Katedrála svatého Štěpána (Bourges) (Q207985) | name | nápověda „místo“: „bourges“ prozrazuje odpověď (Bourges) | Město: Bourges |
| architektura | Kostel svaté Anny (Ostrava) (Q11210548) | name | popis: „ostrave“ prozrazuje odpověď (Ostrava) | [***] v Ostravě. |
| architektura | Kostel svaté Kateřiny (Ostrava) (Q11298531) | name | popis: „ostrava“ prozrazuje odpověď (Ostrava) | Dřevěný kostel, Hrabová, Ostrava, Česká republika. |
| architektura | Kostel svatého Antonína Paduánského (Prašivá) (Q12030658) | name | popis: „prasive“ prozrazuje odpověď (Prašivá) | [***] v Prašivé. |
| architektura | Kostel svatého Bartoloměje (Vrahovice) (Q12030690) | name | popis: „vrahovicich“ prozrazuje odpověď (Vrahovice) | [***] ve Vrahovicích. |
| architektura | Kostel svatého Jana Nepomuckého (Mnichov) (Q152973) | name | nápověda „místo“: „mnichov“ prozrazuje odpověď (Mnichov) | Město: Mnichov |
| architektura | Kostel svatého Jana Nepomuckého (Žďár nad Sázavou) (Q752318) | name | nápověda „místo“: „zdar“ prozrazuje odpověď (Žďár) | Město: Žďár nad Sázavou |
| architektura | Kostel svatého Josefa (Nové Město) (Q15715662) | name | nápověda „místo“: „mesto“ prozrazuje odpověď (Město) | Město: Praha |
| architektura | Kostel svatého Michaela archanděla (Hildesheim) (Q158324) | name | popis: „hildesheimu“ prozrazuje odpověď (Hildesheim) | [***] v Hildesheimu. |
| architektura | Kostel svatého Michaela archanděla v Praze-Starém Městě (Q3508403) | name | nápověda „místo“: „mesto“ prozrazuje odpověď (Městě) | Město: Praha |
| architektura | Kostel svatého Michala (Olomouc) (Q1076187) | name | popis: „olomouci“ prozrazuje odpověď (Olomouc) | [***] v Olomouci. |
| architektura | Kostel svatého Mikuláše (Čečovice) (Q2285904) | name | popis: „cecovicich“ prozrazuje odpověď (Čečovice) | [***] v Čečovicích. |
| architektura | Kostel svatého Mikuláše v Praze-Starém Městě (Q2595999) | name | nápověda „místo“: „mesto“ prozrazuje odpověď (Městě) | Město: Praha |
| architektura | Kostel Všech svatých (Jáchymov) (Q12030553) | name | popis: „jachymove“ prozrazuje odpověď (Jáchymov) | [***] v Jáchymově. |
| architektura | Kostel Všech svatých (Sedlec) (Q513821) | name | popis: „sedlci“ prozrazuje odpověď (Sedlec) | [***] v Sedlci. |
| architektura | Mariánský sloup (Český Krumlov) (Q19558566) | name | nápověda „místo“: „cesko“ prozrazuje odpověď (Český) | Země: Česko |
| architektura | Mariánský sloup (Český Krumlov) (Q19558566) | name | nápověda „místo“: „cesky“ prozrazuje odpověď (Český) | Město: Český Krumlov |
| architektura | Mariánský sloup (Olomouc) (Q1076180) | name | popis: „olomouci“ prozrazuje odpověď (Olomouc) | Barokní morový [***] v Olomouci. |
| architektura | Městská spořitelna (Moravské Budějovice) (Q30724862) | style | popis: „ceske“ prozrazuje odpověď (český) | Kulturní památka České republiky v obci Moravské Budějovice. |
| architektura | Městská spořitelna (Moravské Budějovice) (Q30724862) | name | nápověda „místo“: „mesto“ prozrazuje odpověď (Městská) | Město: Moravské Budějovice |
| architektura | Metropolitní katedrála (Ciudad de México) (Q610961) | name | nápověda „místo“: „ciudad“ prozrazuje odpověď (Ciudad) | Město: Ciudad de México |
| architektura | Modrá mešita (Jerevan) (Q1979112) | name | nápověda „místo“: „jerevan“ prozrazuje odpověď (Jerevan) | Město: Jerevan |
| architektura | Národní dům (Prostějov) (Q4803944) | name | nápověda „místo“: „prostejov“ prozrazuje odpověď (Prostějov) | Město: Prostějov |
| architektura | Nová radnice (Mnichov) (Q152979) | name | nápověda „místo“: „mnichov“ prozrazuje odpověď (Mnichov) | Město: Mnichov |
| architektura | Obchodní dům Prior (Hradec Králové) (Q30068974) | name | nápověda „místo“: „hradec“ prozrazuje odpověď (Hradec) | Město: Hradec Králové |
| architektura | Obchodní dům Prior (Pardubice) (Q29414824) | name | popis: „pardubicich“ prozrazuje odpověď (Pardubice) | [***] na Masarykově náměstí v Pardubicích. |
| architektura | Panenská věž (Turecko) (Q848397) | name | nápověda „místo“: „turecko“ prozrazuje odpověď (Turecko) | Země: Turecko |
| architektura | Pantheon (Q99309) | style | popis: „staroveky“ prozrazuje odpověď (starověký) | Starověký kruhový chrám v [***]. |
| architektura | Pantheon (Paříž) (Q188856) | name | popis: „parizi“ prozrazuje odpověď (Paříž) | Mauzoleum v Paříži. |
| architektura | Porta Nigra (Q152339) | style | popis: „staroveka“ prozrazuje odpověď (starověký) | Starověká městská brána v německém Trevíru. |
| architektura | Rodinný dům Jakuba Demla (Q33323804) | style | popis: „ceske“ prozrazuje odpověď (český) | Kulturní památka České republiky na území obce Tasov. |
| architektura | Sbor Dr. Karla Farského (Vyškov) (Q9350175) | name | popis: „vyskove“ prozrazuje odpověď (Vyškov) | Kostel ve Vyškově, bývalá synagoga. |
| architektura | Velká mešita (Paříž) (Q392564) | name | popis: „parizi“ prozrazuje odpověď (Paříž) | [***] v Paříži. |
| architektura | Vestin chrám (Q753791) | style | popis: „staroveky“ prozrazuje odpověď (starověké) | Starověký chrám v Římě. |
| architektura | Vítězný oblouk (Paříž) (Q64436) | name | popis: „parizi“ prozrazuje odpověď (Paříž) | [***] v Paříži. |
| biologie | Borovice sibiřská (Q774829) | name | nápověda „vědecký název“: „sibirica“ prozrazuje odpověď (sibiřská) | Vědecký název: Pinus sibirica |
| biologie | Liška obecná (houba) (Q188749) | name | popis: „houba“ prozrazuje odpověď (houba) | Houba, [***]. |
| biologie | Osmák degu (Q281008) | name | nápověda „vědecký název“: „degus“ prozrazuje odpověď (degu) | Vědecký název: Octodon degus |
| biologie | Veslonos americký (Q827142) | taxon | nápověda „příbuzní“: „jeseter“ prozrazuje odpověď (jeseteři) | Ze stejného řádu: Vyza velká, Jeseter malý, Jeseter velký, Jeseter ruský |
| biologie | Veslonos čínský (Q477223) | taxon | nápověda „příbuzní“: „jeseter“ prozrazuje odpověď (jeseteři) | Ze stejného řádu: Vyza velká, Jeseter malý, Jeseter velký, Jeseter ruský |
| biologie | Vyza malá (Q201177) | taxon | nápověda „čeleď“: „jeseteroviti“ prozrazuje odpověď (jeseteři) | Čeleď: jeseterovití |
| biologie | Vyza malá (Q201177) | taxon | nápověda „příbuzní“: „jeseter“ prozrazuje odpověď (jeseteři) | Ze stejného řádu: Vyza velká, Jeseter malý, Jeseter velký, Jeseter ruský |
| biologie | Vyza velká (Q191816) | taxon | nápověda „čeleď“: „jeseteroviti“ prozrazuje odpověď (jeseteři) | Čeleď: jeseterovití |
| biologie | Vyza velká (Q191816) | taxon | nápověda „příbuzní“: „jeseter“ prozrazuje odpověď (jeseteři) | Ze stejného řádu: Jeseter malý, Jeseter velký, Jeseter ruský, Veslonos americký |
| fyzika | Elektrický proud (Q11651) | unit | nápověda „pojmenována po“: „ampere“ prozrazuje odpověď (ampér) | Pojmenována po: André-Marie Ampère |
| fyzika | Otáčky za minutu (Q206037) | name | popis: „otaceni“ prozrazuje odpověď (Otáčky) | Jednotka rychlosti otáčení. |
| historie | Štěpán I. Uherský (Q177903) | name | nápověda „časová osa“: „svate“ prozrazuje odpověď (Svatý) | 962 vznik Svaté říše římské · 1054 rozkol církve na západní a východní |
| hudba | Henryk Górecki (Q294568) | period | popis: „hudby“ prozrazuje odpověď (hudba) | Polský skladatel soudobé hudby. |
| hudba | Thomas Tallis (Q207789) | period | popis: „hudby“ prozrazuje odpověď (hudba) | Anglický skladatel chrámové hudby. |
| literatura | Canterburské povídky (Q191663) | name | popis: „povidek“ prozrazuje odpověď (povídky) | Sbírka povídek Geoffreyho Chaucera. |
| literatura | Canterburské povídky (Q191663) | name | štítek druhu: „povidek“ prozrazuje odpověď (povídky) | sbírka povídek |
| literatura | Povídky malostranské (Q7235920) | name | popis: „povidek“ prozrazuje odpověď (Povídky) | Soubor povídek Jana Nerudy. |
| literatura | Povídky malostranské (Q7235920) | name | štítek druhu: „povidek“ prozrazuje odpověď (Povídky) | sbírka povídek |
| literatura | Šťastný princ a jiné pohádky (Q797466) | name | popis: „pohadek“ prozrazuje odpověď (pohádky) | Soubor pohádek Oscara Wildea. |
| sport | Letní olympijské hry 1924 (Q8132) | name | popis: „parizi“ prozrazuje odpověď (Paříž) | [***] Olympiády, konané v Paříži. |
| sport | Letní olympijské hry 1928 (Q8138) | name | popis: „amsterdamu“ prozrazuje odpověď (Amsterdam) | [***] Olympiády, konané v Amsterdamu. |
| sport | Letní olympijské hry 1932 (Q8143) | name | popis: „angeles“ prozrazuje odpověď (Angeles) | [***] 10. olympiády, konané v Los Angeles. |
| sport | Letní olympijské hry 1936 (Q8150) | name | popis: „berline“ prozrazuje odpověď (Berlín) | [***] 11. olympiády, konané v Berlíně. |
| sport | Letní olympijské hry 1948 (Q8403) | name | popis: „londyne“ prozrazuje odpověď (Londýn) | [***] Olympiády, konané v Londýně. |
| sport | Letní olympijské hry 1952 (Q8407) | name | popis: „helsinkach“ prozrazuje odpověď (Helsinky) | [***] Olympiády, konané v Helsinkách. |
| sport | Letní olympijské hry 1956 (Q8411) | name | popis: „melbourne“ prozrazuje odpověď (Melbourne) | [***] Olympiády, konané v Melbourne. |
| sport | Letní olympijské hry 1964 (Q8420) | name | popis: „tokiu“ prozrazuje odpověď (Tokio) | [***] Olympiády, konané v Tokiu. |
| sport | Letní olympijské hry 1968 (Q8429) | name | popis: „mexico“ prozrazuje odpověď (México) | [***] Olympiády, konané v Mexico City. |
| sport | Letní olympijské hry 1972 (Q8438) | name | popis: „mnichove“ prozrazuje odpověď (Mnichov) | [***] Olympiády, konané v Mnichově. |
| sport | Letní olympijské hry 1976 (Q8444) | name | popis: „montrealu“ prozrazuje odpověď (Montréal) | [***] Olympiády, konané v Montrealu. |
| sport | Letní olympijské hry 1980 (Q8450) | name | popis: „moskve“ prozrazuje odpověď (Moskva) | [***] Olympiády, konané v Moskvě. |
| sport | Letní olympijské hry 1984 (Q8456) | name | popis: „angeles“ prozrazuje odpověď (Angeles) | XXIII. [***] konané v Los Angeles. |
| sport | Letní olympijské hry 1988 (Q8470) | name | popis: „soulu“ prozrazuje odpověď (Soul) | [***] Olympiády, konané v Soulu. |
| sport | Letní olympijské hry 1992 (Q8488) | name | popis: „barcelone“ prozrazuje odpověď (Barcelona) | [***] Olympiády, konané v Barceloně. |
| sport | Letní olympijské hry 1996 (Q8531) | name | popis: „atlante“ prozrazuje odpověď (Atlanta) | [***] Olympiády pořádané v Atlantě. |
| sport | Letní olympijské hry 2000 (Q8544) | name | popis: „sydney“ prozrazuje odpověď (Sydney) | [***] Olympiády, konané v Sydney. |
| sport | Letní olympijské hry 2004 (Q8558) | name | popis: „athenach“ prozrazuje odpověď (Athény) | [***] Olympiády, konané v Athénách. |
| sport | Letní olympijské hry 2008 (Q8567) | name | popis: „pekingu“ prozrazuje odpověď (Peking) | [***] Olympiády, konané v Pekingu. |
| sport | Letní olympijské hry 2012 (Q8577) | name | popis: „londyne“ prozrazuje odpověď (Londýn) | [***] Olympiády, konané v Londýně. |
| sport | Letní olympijské hry 2016 (Q8613) | name | popis: „janeiru“ prozrazuje odpověď (Janeiro) | [***] Olympiády, konané v Riu de Janeiru. |
| sport | Letní olympijské hry 2020 (Q181278) | name | popis: „tokiu“ prozrazuje odpověď (Tokio) | [***] Olympiády, konané v Tokiu. |
| sport | Letní olympijské hry 2024 (Q995653) | name | popis: „parizi“ prozrazuje odpověď (Paříž) | [***] Olympiády, konané v Paříži. |
| sport | Zimní olympijské hry 1928 (Q9591) | name | popis: „svatem“ prozrazuje odpověď (Svatý) | 2. [***], konané ve Svatém Mořici. |
| sport | Zimní olympijské hry 1936 (Q9600) | name | popis: „garmisch“ prozrazuje odpověď (Garmisch) | 4. [***], konané v německém Garmisch-Partenkirchenu. |
| sport | Zimní olympijské hry 1976 (Q9651) | name | popis: „innsbrucku“ prozrazuje odpověď (Innsbruck) | 12. [***], konané v rakouském Innsbrucku. |
| sport | Zimní olympijské hry 1980 (Q9652) | name | popis: „lake“ prozrazuje odpověď (Lake) | 13. [***], konané v americkém Lake Placid. |
| sport | Zimní olympijské hry 1988 (Q9658) | name | popis: „calgary“ prozrazuje odpověď (Calgary) | 15. [***], pořádané v kanadském Calgary. |
| sport | Zimní olympijské hry 1992 (Q9660) | name | popis: „albertville“ prozrazuje odpověď (Albertville) | 16. [***], pořádané roku [***] v Albertville. |
| sport | Zimní olympijské hry 1994 (Q9663) | name | popis: „lillehammeru“ prozrazuje odpověď (Lillehammer) | 17. [***], konané v norském Lillehammeru. |
| sport | Zimní olympijské hry 1998 (Q9664) | name | popis: „nagano“ prozrazuje odpověď (Nagano) | 18. [***], Nagano, Japonsko. |
| sport | Zimní olympijské hry 2014 (Q9678) | name | popis: „soci“ prozrazuje odpověď (Soči) | Olympiáda 88 států v Soči v roce [***]. |
| sport | Zimní olympijské hry 2022 (Q193074) | name | popis: „pekingu“ prozrazuje odpověď (Peking) | XXIV. [***] konané v únoru [***] v Pekingu. |
| umeni | Manneken Pis (Q152072) | name | popis: „chlapce“ prozrazuje odpověď (chlapeček) | Bronzová socha močícího chlapce v Bruselu. |
| umeni | Pomník maršála Koněva v Praze (Q45118284) | name | nápověda „časová osa“: „prazske“ prozrazuje odpověď (Praze) | 1968 pražské jaro · 1989 sametová revoluce |
| umeni | Svatý Šebestián (Q22976966) | author | popis: „kubisticky“ prozrazuje odpověď (Kubišta) | Kubistický obraz od [***]. |
| zemepis | Katedrála Nanebevzetí Panny Marie v Rouenu (Q476516) | name | nesprávná možnost „Katedrála Notre-Dame“ je přesně přijímaná odpověď | Katedrála Nanebevzetí Panny Marie v Rouenu, Katedrála Notre-Dame (Rouen), Katedrála Notre… |
| zemepis | Katedrála Panny Marie ve Štrasburku (Q745460) | name | nesprávná možnost „Katedrála Notre Dame“ je přesně přijímaná odpověď | Katedrála Panny Marie ve Štrasburku, Katedrála Notre-Dame (Štrasburk), Katedrála Notre-Da… |
| zemepis | El Misti (Q572865) | name | nápověda „slepá mapa“: „misto“ prozrazuje odpověď (Misti) | Místo je uprostřed |
| zemepis | Modrá laguna (geotermální lázně) (Q886946) | name | popis: „lazne“ prozrazuje odpověď (lázně) | [***] a minerální lázně na Islandu. |
| zemepis | Panenská věž (Turecko) (Q848397) | name | fakt v okně: „turecko“ prozrazuje odpověď (Turecko) | Stát: Turecko |

## Podezřelé a nejisté (ukázky, zbytek v JSON)

### Nápověda opakuje popis (153)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Bazilika Neposkvrněného početí (Q82387) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Bazilika Neposkvrněného početí (Q82387) | name | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Bílý dům (Q35525) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Bílý dům (Q35525) | name | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Kapitol Spojených států amerických (Q54109) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Kapitol Spojených států amerických (Q54109) | name | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Katedrála svatého Matěje apoštola (Q603535) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Katedrála svatého Matěje apoštola (Q603535) | name | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Katedrála svatých Petra a Pavla ve Washingtonu (Q668710) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Yorská katedrála (Q252575) | style | nápověda „místo“ jen opakuje popis | Město: York |
| biologie | Krab světlonohý (Q181075) | name | nápověda „vědecký název“ jen opakuje popis | Vědecký název: Grapsus grapsus |
| chemie | Fluorid sírový (Q279055) | formula | nápověda „složení“ jen opakuje popis | Prvky: síra, fluor |

### Příliš podobná nesprávná možnost (349)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Pirkštejn (Q12045348) | name | nesprávná možnost „Pernštejn“ se od správné odpovědi liší jen drobností | Pirkštejn ~ Pernštejn |
| architektura | Vila Tychonova 4 (Q31825089) | name | nesprávná možnost „Vila Tychonova 6“ se od správné odpovědi liší jen drobností | Vila Tychonova 4 ~ Vila Tychonova 6 |
| biologie | Bělásek řepkový (Q683592) | name | nesprávná možnost „Bělásek řepový“ se od správné odpovědi liší jen drobností | Bělásek řepkový ~ Bělásek řepový |
| biologie | Bělásek řepový (Q27653) | name | nesprávná možnost „Bělásek řepkový“ se od správné odpovědi liší jen drobností | Bělásek řepový ~ Bělásek řepkový |
| biologie | Lachtan jihoafrický (Q466597) | name | nesprávná možnost „Lachtan jihoamerický“ se od správné odpovědi liší jen drobností | Lachtan jihoafrický ~ Lachtan jihoamerický |
| biologie | Soumračník čárečkovaný (Q778932) | name | nesprávná možnost „Soumračník čárkovaný“ se od správné odpovědi liší jen drobností | Soumračník čárečkovaný ~ Soumračník čárkovaný |
| chemie | Arabinóza (Q71240623) | name | nesprávná možnost „Rafinóza“ se od správné odpovědi liší jen drobností | Arabinóza ~ Rafinóza |
| chemie | Dichlormethan (Q421748) | name | nesprávná možnost „Chlormethan“ se od správné odpovědi liší jen drobností | Dichlormethan ~ Chlormethan |
| chemie | Estradiol (Q422416) | name | nesprávná možnost „Estriol“ se od správné odpovědi liší jen drobností | Estradiol ~ Estriol |
| chemie | Ethan (Q52858) | name | nesprávná možnost „Methan“ se od správné odpovědi liší jen drobností | Ethan ~ Methan |
| chemie | Ethanol (Q153) | name | nesprávná možnost „Methanol“ se od správné odpovědi liší jen drobností | Ethanol ~ Methanol |
| chemie | Ethen (Q151313) | name | nesprávná možnost „Ethan“ se od správné odpovědi liší jen drobností | Ethen ~ Ethan |

### Nesprávné možnosti z jiné země než správná (2195)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| film | 2001: Vesmírná odysea (Q103474) | name | 1 z 3 nesprávných možností je z jiné země než správná (Spojené království, Spojené státy americké) | Hodný, zlý a ošklivý (Španělsko, Itálie) |
| film | Akira Kurosawa (Q8006) | name | 3 z 3 nesprávných možností je z jiné země než správná (Japonsko) | Pong Čun-ho (Jižní Korea) \| Ingmar Bergman (Švédsko) \| Pak Čchan-uk (Jižní Korea) |
| film | Alejandro González Iñárritu (Q55215) | name | 1 z 3 nesprávných možností je z jiné země než správná (Mexiko) | Peter Jackson (Nový Zéland) |
| film | Alfonso Cuarón (Q28028) | name | 1 z 3 nesprávných možností je z jiné země než správná (Mexiko) | Baz Luhrmann (Austrálie) |
| film | Alicia Vikanderová (Q439314) | name | 3 z 3 nesprávných možností je z jiné země než správná (Švédsko) | Lupita Nyong'o (Mexiko) \| Emilia Clarkeová (Spojené království) \| Margot Robbie (Austrálie) |
| film | Amarcord (Q18428) | name | 2 z 3 nesprávných možností je z jiné země než správná (Itálie, Francie) | Annie Hallová (Spojené státy americké) \| Podraz (Spojené státy americké) |
| film | Amitabh Bachchan (Q9570) | name | 3 z 3 nesprávných možností je z jiné země než správná (Indie) | Ben Kingsley (Spojené království) \| Bob Hoskins (Spojené království) \| Ian McShane (Spojené království) |
| film | Andrej Arseňjevič Tarkovskij (Q853) | name | 2 z 3 nesprávných možností je z jiné země než správná (Rusko) | Mike Nichols (Německo) \| François Truffaut (Francie) |
| film | Anita Ekbergová (Q230662) | name | 1 z 3 nesprávných možností je z jiné země než správná (Švédsko) | Judi Denchová (Spojené království) |
| film | Antonio Banderas (Q41548) | name | 2 z 3 nesprávných možností je z jiné země než správná (Španělsko) | Hugh Grant (Spojené království) \| Kenneth Branagh (Spojené království) |
| film | Bernardo Bertolucci (Q53009) | name | 1 z 3 nesprávných možností je z jiné země než správná (Itálie) | Wolfgang Petersen (Německo) |
| film | Bio Ráj (Q464032) | name | 2 z 3 nesprávných možností je z jiné země než správná (Francie, Itálie) | Mys hrůzy (Spojené státy americké) \| Říše slunce (Spojené státy americké, Spojené království) |

### Nesprávné možnosti z jiné doby než správná (434)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| historie | Abbásovská revoluce (Q5933860) | name | 3 z 3 nesprávných možností je o víc než 200 let jinde než správná (746) | Únorová revoluce 1848 (1848) \| Revoluce roku 1848 v Německu (1848) \| Tulipánová revoluce (2005) |
| historie | Abd al-Kádir al-Džílání (Q307365) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1078) | Muhammad al-Buchárí (810) \| Muhammad at-Tabarí (839) |
| historie | Ahmad Šáh Durrání (Q46798) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1722) | Džigme Khesar Namgjal Wangčhug (1980) |
| historie | Achaimenovská říše (Q389688) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (-549) | Seleukovská říše (-311) |
| historie | Akkadská říše (Q4461035) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (-2333) | Elam (-2699) \| Asýrie (-2024) |
| historie | Al-Ghazálí (Q9546) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1056) | Jan Zlatoústý (349) |
| historie | Albert Veliký (Q60059) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1200) | Gotthold Ephraim Lessing (1729) |
| historie | Albrecht z Valdštejna (Q153545) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1583) | Jan Žižka (1360) |
| historie | Alexandr Něvský (Q174044) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1220) | Jaropolk I. (972) \| Vladimír I. (956) |
| historie | Alfons I. Portugalský (Q587697) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1109) | Ferdinand I. Portugalský (1345) |
| historie | Alkibiadés (Q187982) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (-449) | Louis Antoine de Saint-Just (1767) \| Camille Desmoulins (1760) |
| historie | Amaury I. (Q311808) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1136) | Amón (-663) |

### Nejednoznačná psaná odpověď (alias platí pro víc položek) (547)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Aldo Rossi (Q322953) | name | odpověď „rossi“ platí pro 2 položek | Aldo Rossi [Q322953] \| Carl Rossi [Q619584] |
| architektura | Bazilika Nanebevzetí Panny Marie v Brně (Q11062049) | name | odpověď „bazilika nanebevzeti panny marie“ platí pro 2 položek | Bazilika Nanebevzetí Panny Marie v Brně [Q11062049] \| Bazilika Nanebevzetí Panny Marie na… |
| architektura | Carlo Lurago (Q1042267) | name | odpověď „lurago“ platí pro 2 položek | Carlo Lurago [Q1042267] \| Anselmo Lurago [Q569655] |
| architektura | Domenico Fontana (Q336806) | name | odpověď „fontana“ platí pro 2 položek | Domenico Fontana [Q336806] \| Carlo Fontana [Q704356] |
| architektura | Eero Saarinen (Q167073) | name | odpověď „saarinen“ platí pro 2 položek | Eero Saarinen [Q167073] \| Eliel Saarinen [Q312028] |
| architektura | Eero Saarinen (Q167073) | name | odpověď „e saarinen“ platí pro 2 položek | Eero Saarinen [Q167073] \| Eliel Saarinen [Q312028] |
| architektura | Evangelický kostel (Bludovice) (Q11985237) | name | odpověď „evangelicky kostel“ platí pro 2 položek | Evangelický kostel (Bludovice) [Q11985237] \| Evangelický kostel (Bystřice) [Q11985241] |
| architektura | Hrad Nové Hrady (Q1013354) | name | odpověď „nove hrady“ platí pro 2 položek | Hrad Nové Hrady [Q1013354] \| Zámek Nové Hrady [Q453713] |
| architektura | Chrám svatého Alexandra Něvského (Novosibirsk) (Q603289) | name | odpověď „chram svateho alexandra nevskeho“ platí pro 3 položek | Chrám svatého Alexandra Něvského (Novosibirsk) [Q603289] \| Chrám svatého Alexandra Něvské… |
| architektura | Chrám svatého Vladimíra (Kyjev) (Q1417441) | name | odpověď „chram svateho vladimira“ platí pro 3 položek | Chrám svatého Vladimíra (Kyjev) [Q1417441] \| Chrám svatého Vladimíra (Sevastopol) [Q18482… |
| architektura | Katedrála Nanebevzetí Panny Marie (Siena) (Q282554) | name | odpověď „katedrala nanebevzeti panny marie“ platí pro 5 položek | Katedrála Nanebevzetí Panny Marie (Siena) [Q282554] \| Katedrála Nanebevzetí Panny Marie v… |
| architektura | Katedrála Narození Panny Marie v Miláně (Q18068) | name | odpověď „katedrala narozeni panny marie“ platí pro 2 položek | Katedrála Narození Panny Marie v Miláně [Q18068] \| Chrám Narození přesvaté Bohorodice [Q1… |

### Stejná fotka u víc položek okruhu (duplicita, nebo cizí fotka) (46)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| biologie | Borovice pinie (Q106094) | name | stejnou fotku mají i další položky okruhu (2×) | Borovice pinie [Q106094] \| Borovice přímořská [Q271582] |
| biologie | Kachna (Q3736439) | name | stejnou fotku mají i další položky okruhu (2×) | Kachna [Q3736439] \| Kachna divoká [Q25348] |
| biologie | Konipas bílý (Q25399) | name | stejnou fotku mají i další položky okruhu (2×) | Konipas bílý [Q25399] \| Konipas [Q230042] |
| biologie | Páv (Q3917160) | name | stejnou fotku mají i další položky okruhu (2×) | Páv [Q3917160] \| Páv zelený [Q254636] |
| biologie | Výr (Q214293) | name | stejnou fotku mají i další položky okruhu (2×) | Výr [Q214293] \| Výr africký [Q513224] |
| fyzika | Alnilam (Q13070) | name | stejnou fotku mají i další položky okruhu (2×) | Alnilam [Q13070] \| Mintaka [Q680341] |
| historie | Bangladéšská válka za nezávislost (Q371394) | name | stejnou fotku mají i další položky okruhu (2×) | Bangladéšská válka za nezávislost [Q371394] \| Indicko-pákistánská válka [Q1922071] |
| historie | Bitva o Halič (Q659246) | name | stejnou fotku mají i další položky okruhu (2×) | Bitva o Halič [Q659246] \| První bitva u Mazurských jezer [Q660655] |
| historie | Bitva o Kyjevský kotel (Q162284) | name | stejnou fotku mají i další položky okruhu (3×) | Bitva o Kyjevský kotel [Q162284] \| Bitva u Smolenska [Q162357] \| Bitva u Bělostoku a Mins… |
| historie | Bitva u Beneventa (Q1160070) | name | stejnou fotku mají i další položky okruhu (2×) | Bitva u Beneventa [Q1160070] \| Bitva u Auscula [Q756413] |
| historie | Bitva u Kircholmu (Q937332) | name | stejnou fotku mají i další položky okruhu (2×) | Bitva u Kircholmu [Q937332] \| Polsko-švédská válka (1600–1611) [Q598774] |
| historie | Bitva u Marenga (Q273011) | name | stejnou fotku mají i další položky okruhu (2×) | Bitva u Marenga [Q273011] \| Válka druhé koalice [Q26749] |

### Otázka bez nápovědy (278)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| biologie | Dánio pruhované (Q169444) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Karančo guadalupský (Q398445) | taxon | otázka nemá žádnou nápovědu ani obrázek | Druh ptáka rodu Caracara. |
| biologie | Noni (Q234238) | name | otázka nemá žádnou nápovědu ani obrázek | Druh rostliny. |
| biologie | Pterodaktyl (Q309490) | name | otázka nemá žádnou nápovědu ani obrázek | Rod plazů. |
| biologie | Sauroposeidon (Q131693) | name | otázka nemá žádnou nápovědu ani obrázek | Rod plazů. |
| biologie | Úhoř japonský (Q1140081) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Žralok sedmižábrý (Q1126774) | taxon | otázka nemá žádnou nápovědu ani obrázek |  |
| chemie | Arsen (Q871) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 33. |
| chemie | Astat (Q999) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 85. |
| chemie | Berkelium (Q1882) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 97. |
| chemie | Bohrium (Q1249) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 107. |
| chemie | Curium (Q1876) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 96. |

### Rozbitá data (1)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| geologie | Opuka (Q4335387) | - | položka se spoléhá na obrázek v otázce, ale fotku nemá | Opuka |

