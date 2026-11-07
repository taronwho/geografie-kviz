# Audit otázek

Vygenerováno 2026-11-07 07:46 UTC skriptem `npm run audit:questions` (14 témat, 27998 z 27998 položek, 317 s). Úplný výpis je v `reports/audit-otazek.json`.
Popis otázek: krátký popis z Wikidat (pole `d`, jako při výpadku Wikipedie); úvody z Wikipedie se načítají až ve hře (`--wiki=soubor` je doplní), proto „chudý popis“ vychází skoro u všech položek.

## Souhrn

- Nálezů celkem: **21952**, jistých chyb (kritických): **0**. Exit kód: 0.

| Problém | Počet |
|---|---:|
| Odpověď prozrazená v popisu či nápovědě (kritické) | 0 |
| Rozbité možnosti: dvě správné, prázdná, stejné (kritické) | 0 |
| Rozbitý odkaz na obrázek (kritické) | 0 |
| Nápověda opakuje popis | 135 |
| Příliš podobná nesprávná možnost | 468 |
| Nesprávné možnosti z jiné země než správná | 2181 |
| Nesprávné možnosti z jiné doby než správná | 698 |
| Málo možností | 0 |
| Nejednoznačná psaná odpověď (alias platí pro víc položek) | 638 |
| Stejná fotka u víc položek okruhu (duplicita, nebo cizí fotka) | 59 |
| Chudý nebo krátký popis | 17358 |
| Otázka bez nápovědy | 415 |
| Rozbitá data | 0 |

| Téma | Položek | Nálezů | Prozrazeno | Možnosti | Obrázky | Jiná země/doba | Podobné | Aliasy | Duplicita |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Architektura | 1736 | 1131 | 0 | 0 | 0 | 0 | 2 | 65 | 9 |
| Biologie | 3324 | 2890 | 0 | 0 | 0 | 0 | 3 | 2 | 1 |
| Chemie | 1901 | 1481 | 0 | 0 | 0 | 0 | 63 | 10 | 6 |
| Film | 1599 | 802 | 0 | 0 | 0 | 63 | 0 | 52 | 58 |
| Fyzika | 1696 | 1133 | 0 | 0 | 0 | 0 | 46 | 41 | 0 |
| Geologie | 431 | 376 | 0 | 0 | 0 | 0 | 50 | 0 | 4 |
| Historie | 3274 | 3659 | 0 | 0 | 0 | 1182 | 170 | 89 | 0 |
| Hudba | 1609 | 1120 | 0 | 0 | 0 | 236 | 4 | 29 | 7 |
| Literatura | 1584 | 1225 | 0 | 0 | 0 | 290 | 0 | 16 | 0 |
| Mytologie | 805 | 611 | 0 | 0 | 0 | 0 | 6 | 0 | 4 |
| Sport | 1985 | 2095 | 0 | 0 | 0 | 818 | 73 | 40 | 17 |
| Výtvarné umění | 1636 | 1308 | 0 | 0 | 0 | 290 | 0 | 31 | 25 |
| Vlajky a znaky | 1889 | 1770 | 0 | 0 | 0 | 0 | 19 | 194 | 0 |
| Zeměpis | 4529 | 2351 | 0 | 0 | 0 | 0 | 32 | 69 | 4 |

## Podezřelé a nejisté (ukázky, zbytek v JSON)

### Nápověda opakuje popis (135)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Bazilika Neposkvrněného početí (Q82387) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Bílý dům (Q35525) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Bílý dům (Q35525) | name | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Chufuova pyramida (Q37200) | name | nápověda „místo“ jen opakuje popis | Město: Gíza |
| architektura | Kapitol Spojených států amerických (Q54109) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Kapitol Spojených států amerických (Q54109) | name | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Katedrála svatého Matěje apoštola (Q603535) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Katedrála svatých Petra a Pavla ve Washingtonu (Q668710) | style | nápověda „místo“ jen opakuje popis | Město: Washington, D.C. |
| architektura | Yorská katedrála (Q252575) | style | nápověda „místo“ jen opakuje popis | Město: York |
| biologie | Krab světlonohý (Q181075) | name | nápověda „vědecký název“ jen opakuje popis | Vědecký název: Grapsus grapsus |
| chemie | Fluorid boritý (Q409602) | formula | nápověda „složení“ jen opakuje popis | Prvky: bor, fluor |
| chemie | Fluorid sírový (Q279055) | formula | nápověda „složení“ jen opakuje popis | Prvky: síra, fluor |

### Příliš podobná nesprávná možnost (468)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Vila Tychonova 4 (Q31825089) | name | nesprávná možnost „Vila Tychonova 6“ se od správné odpovědi liší jen drobností | Vila Tychonova 4 ~ Vila Tychonova 6 |
| architektura | Vila Tychonova 6 (Q31825341) | name | nesprávná možnost „Vila Tychonova 4“ se od správné odpovědi liší jen drobností | Vila Tychonova 6 ~ Vila Tychonova 4 |
| biologie | Bělásek řepkový (Q683592) | name | nesprávná možnost „Bělásek řepový“ se od správné odpovědi liší jen drobností | Bělásek řepkový ~ Bělásek řepový |
| biologie | Bělásek řepový (Q27653) | name | nesprávná možnost „Bělásek řepkový“ se od správné odpovědi liší jen drobností | Bělásek řepový ~ Bělásek řepkový |
| biologie | Soumračník čárečkovaný (Q778932) | name | nesprávná možnost „Soumračník čárkovaný“ se od správné odpovědi liší jen drobností | Soumračník čárečkovaný ~ Soumračník čárkovaný |
| chemie | 1-butyn (Q161597) | name | nesprávná možnost „2-butyn“ se od správné odpovědi liší jen drobností | 1-butyn ~ 2-butyn |
| chemie | 2-butyn (Q209336) | name | nesprávná možnost „1-butyn“ se od správné odpovědi liší jen drobností | 2-butyn ~ 1-butyn |
| chemie | Anorganická chemie (Q11165) | name | nesprávná možnost „Organická chemie“ se od správné odpovědi liší jen drobností | Anorganická chemie ~ Organická chemie |
| chemie | Anorganická sloučenina (Q190065) | name | nesprávná možnost „Organická sloučenina“ se od správné odpovědi liší jen drobností | Anorganická sloučenina ~ Organická sloučenina |
| chemie | Azid sodný (Q407577) | name | nesprávná možnost „Amid sodný“ se od správné odpovědi liší jen drobností | Azid sodný ~ Amid sodný |
| chemie | Cyklohexen (Q413328) | name | nesprávná možnost „Cyklohexan“ se od správné odpovědi liší jen drobností | Cyklohexen ~ Cyklohexan |
| chemie | Dextran (Q423123) | name | nesprávná možnost „Dextrin“ se od správné odpovědi liší jen drobností | Dextran ~ Dextrin |

### Nesprávné možnosti z jiné země než správná (2181)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| film | Akira Kurosawa (Q8006) | name | 2 z 3 nesprávných možností je z jiné země než správná (Japonsko) | Pak Čchan-uk (Jižní Korea) \| Pong Čun-ho (Jižní Korea) |
| film | Alejandro González Iñárritu (Q55215) | name | 1 z 3 nesprávných možností je z jiné země než správná (Mexiko) | Sam Mendes (Spojené království) |
| film | Alfonso Cuarón (Q28028) | name | 1 z 3 nesprávných možností je z jiné země než správná (Mexiko) | Danny Boyle (Spojené království) |
| film | Alicia Vikanderová (Q439314) | name | 1 z 3 nesprávných možností je z jiné země než správná (Švédsko) | Lupita Nyong'o (Mexiko) |
| film | Amitabh Bachchan (Q9570) | name | 2 z 3 nesprávných možností je z jiné země než správná (Indie) | Jet Li (Čína) \| Toširó Mifune (Japonsko) |
| film | Andrej Arseňjevič Tarkovskij (Q853) | name | 1 z 3 nesprávných možností je z jiné země než správná (Rusko) | François Truffaut (Francie) |
| film | Anita Ekbergová (Q230662) | name | 1 z 3 nesprávných možností je z jiné země než správná (Švédsko) | Claudia Cardinalová (Itálie) |
| film | Antonio Banderas (Q41548) | name | 2 z 3 nesprávných možností je z jiné země než správná (Španělsko) | Gérard Depardieu (Francie) \| Jean Belmondo (Francie) |
| film | Cate Blanchettová (Q80966) | name | 1 z 3 nesprávných možností je z jiné země než správná (Austrálie) | Catherine Zeta-Jonesová (Spojené království) |
| film | Claudia Cardinalová (Q107006) | name | 2 z 3 nesprávných možností je z jiné země než správná (Itálie) | Jeanne Moreau (Francie) \| Juliette Binocheová (Francie) |
| film | Čang C'-i (Q180852) | name | 1 z 3 nesprávných možností je z jiné země než správná (Čína) | Freida Pinto (Indie) |
| film | Diane Krugerová (Q57118) | name | 2 z 3 nesprávných možností je z jiné země než správná (Německo) | Audrey Tautou (Francie) \| Rosamund Pikeová (Spojené království) |

### Nesprávné možnosti z jiné doby než správná (698)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| historie | Abbás I. Veliký (Q171349) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1571) | Muhammad Rezá Pahlaví (1919) |
| historie | Abd al-Kádir al-Džílání (Q307365) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1078) | Muhammad at-Tabarí (839) \| Muhammad al-Buchárí (810) |
| historie | Abdulhamid II. (Q134817) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1842) | Selim I. (1470) \| Jan VIII. Palaiologos (1392) |
| historie | Abú Hanífa (Q190896) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (699) | Al-Ghazálí (1056) |
| historie | Adolf Eichmann (Q28085) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1906) | Ondřej Rakouský (1558) |
| historie | Æthelberht (Q272173) | name | 3 z 3 nesprávných možností je o víc než 200 let jinde než správná (552) | Llywelyn ap Iorwerth (1173) \| Kenneth I. (810) \| Æthelwulf (839) |
| historie | Achaimenovská říše (Q389688) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (-549) | Maurjovská říše (-321) |
| historie | Akkadská říše (Q4461035) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (-2333) | Elam (-2699) \| Asýrie (-2024) |
| historie | Al-Ghazálí (Q9546) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1056) | Jan Zlatoústý (349) |
| historie | Alarich II. (Q110884) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (458) | Favila Asturský (700) |
| historie | Albert Veliký (Q60059) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1200) | Johann Gottfried Herder (1744) \| Gotthold Ephraim Lessing (1729) |
| historie | Albrecht III. Achilles (Q453771) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1414) | Jan Fridrich Braniborsko-Ansbašský (1654) |

### Nejednoznačná psaná odpověď (alias platí pro víc položek) (638)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Aldo Rossi (Q322953) | name | odpověď „rossi“ platí pro 2 položek | Aldo Rossi [Q322953] \| Carl Rossi [Q619584] |
| architektura | Andrea Pisano (Q311031) | name | odpověď „pisano“ platí pro 2 položek | Andrea Pisano [Q311031] \| Nicola Pisano [Q364413] |
| architektura | Balthasar Neumann (Q61349) | name | odpověď „neumann“ platí pro 2 položek | Balthasar Neumann [Q61349] \| Franz von Neumann [Q85809] |
| architektura | Báň (Q244621) | name | odpověď „ban“ platí pro 2 položek z různých okruhů | Báň [Q244621] \| Šigeru Ban [Q526725] |
| architektura | Bazilika Nanebevzetí Panny Marie v Brně (Q11062049) | name | odpověď „bazilika nanebevzeti panny marie“ platí pro 2 položek | Bazilika Nanebevzetí Panny Marie v Brně [Q11062049] \| Bazilika Nanebevzetí Panny Marie na… |
| architektura | Bazilika svatého Jana Křtitele (Q648754) | name | odpověď „katedrala svateho jana krtitele“ platí pro 2 položek | Bazilika svatého Jana Křtitele [Q648754] \| Katedrála svatého Jana Křtitele v Turíně [Q958… |
| architektura | Bolšoj těatr (Q138908) | name | odpověď „velke divadlo“ platí pro 2 položek | Bolšoj těatr [Q138908] \| Velké divadlo [Q15703409] |
| architektura | Carlo Lurago (Q1042267) | name | odpověď „lurago“ platí pro 2 položek | Carlo Lurago [Q1042267] \| Anselmo Lurago [Q569655] |
| architektura | Claude Perrault (Q347699) | name | odpověď „perrault“ platí pro 2 položek | Claude Perrault [Q347699] \| Dominique Perrault [Q504358] |
| architektura | Domenico Fontana (Q336806) | name | odpověď „fontana“ platí pro 2 položek | Domenico Fontana [Q336806] \| Carlo Fontana [Q704356] |
| architektura | Eero Saarinen (Q167073) | name | odpověď „saarinen“ platí pro 2 položek | Eero Saarinen [Q167073] \| Eliel Saarinen [Q312028] |
| architektura | Eero Saarinen (Q167073) | name | odpověď „e saarinen“ platí pro 2 položek | Eero Saarinen [Q167073] \| Eliel Saarinen [Q312028] |

### Stejná fotka u víc položek okruhu (duplicita, nebo cizí fotka) (59)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Antonio da Sangallo mladší (Q357276) | name | stejnou fotku mají i další položky okruhu (2×) | Antonio da Sangallo mladší [Q357276] \| Antonio da Sangallo starší [Q456861] |
| biologie | Borovice pinie (Q106094) | name | stejnou fotku mají i další položky okruhu (2×) | Borovice pinie [Q106094] \| Borovice přímořská [Q271582] |
| biologie | Kachna (Q3736439) | name | stejnou fotku mají i další položky okruhu (2×) | Kachna [Q3736439] \| Kachna divoká [Q25348] |
| biologie | Konipas bílý (Q25399) | name | stejnou fotku mají i další položky okruhu (2×) | Konipas bílý [Q25399] \| Konipas [Q230042] |
| biologie | Páv (Q3917160) | name | stejnou fotku mají i další položky okruhu (2×) | Páv [Q3917160] \| Páv zelený [Q254636] |
| biologie | Výr (Q214293) | name | stejnou fotku mají i další položky okruhu (2×) | Výr [Q214293] \| Výr africký [Q513224] |
| chemie | Exotermní reakce (Q205949) | name | stejnou fotku mají i další položky okruhu (2×) | Exotermní reakce [Q205949] \| Aluminotermická reakce [Q447852] |
| fyzika | Hubbleův–Lemaîtreův zákon (Q179916) | name | stejnou fotku mají i další položky okruhu (2×) | Hubbleův–Lemaîtreův zákon [Q179916] \| Kosmologická konstanta [Q59151] |
| fyzika | Newtonovy pohybové zákony (Q38433) | name | stejnou fotku mají i další položky okruhu (2×) | Newtonovy pohybové zákony [Q38433] \| Zákon setrvačnosti [Q3235671] |
| fyzika | Pioneer 10 (Q59103) | name | stejnou fotku mají i další položky okruhu (2×) | Pioneer 10 [Q59103] \| Pioneer 11 [Q59113] |
| fyzika | Statická elektřina (Q845744) | name | stejnou fotku mají i další položky okruhu (2×) | Statická elektřina [Q845744] \| Triboelektrický jev [Q876377] |
| fyzika | Voyager 1 (Q48469) | name | stejnou fotku mají i další položky okruhu (2×) | Voyager 1 [Q48469] \| Voyager 2 [Q48475] |

### Otázka bez nápovědy (415)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| biologie | Noni (Q234238) | name | otázka nemá žádnou nápovědu ani obrázek | Druh rostliny. |
| biologie | Pterodaktyl (Q309490) | name | otázka nemá žádnou nápovědu ani obrázek | Rod plazů. |
| biologie | Ryzec pravý (Q62138) | taxon | otázka nemá žádnou nápovědu ani obrázek | Houba z čeledi [***]. |
| biologie | Sauroposeidon (Q131693) | name | otázka nemá žádnou nápovědu ani obrázek | Rod plazů. |
| biologie | Žralok sedmižábrý (Q1126774) | taxon | otázka nemá žádnou nápovědu ani obrázek |  |
| chemie | Arsen (Q871) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 33. |
| chemie | Astat (Q999) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 85. |
| chemie | Berkelium (Q1882) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 97. |
| chemie | Bohrium (Q1249) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 107. |
| chemie | Curium (Q1876) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 96. |
| chemie | Darmstadtium (Q1266) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 110. |
| chemie | Dubnium (Q1232) | symbol | otázka nemá žádnou nápovědu ani obrázek | Chemický prvek se značkou [***] a protonovým číslem 105. |

