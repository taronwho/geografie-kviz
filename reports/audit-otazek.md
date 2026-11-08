# Audit otázek

Vygenerováno 2026-11-08 11:31 UTC skriptem `npm run audit:questions` (14 témat, 29841 z 29841 položek, 598 s). Úplný výpis je v `reports/audit-otazek.json`.
Popis otázek: krátký popis z Wikidat (pole `d`, jako při výpadku Wikipedie); úvody z Wikipedie se načítají až ve hře (`--wiki=soubor` je doplní), proto „chudý popis“ vychází skoro u všech položek.

## Souhrn

- Nálezů celkem: **23213**, jistých chyb (kritických): **0**. Exit kód: 0.

| Problém | Počet |
|---|---:|
| Odpověď prozrazená v popisu či nápovědě (kritické) | 0 |
| Rozbité možnosti: dvě správné, prázdná, stejné (kritické) | 0 |
| Rozbitý odkaz na obrázek (kritické) | 0 |
| Zakrytí ukazuje tvar odpovědi („[***] a [***]“, slovo u zakrytí jen ze správné možnosti) (kritické) | 0 |
| Nápověda z náhradního nebo obecného textu (šablona) (kritické) | 0 |
| Nápověda nic nepřidá k tomu, co hráč už viděl (kritické) | 0 |
| Slepá mapa v měřítku, které možnosti nerozliší (kritické) | 0 |
| Nápověda opakuje popis | 64 |
| Příliš podobná nesprávná možnost | 489 |
| Nesprávné možnosti z jiné země než správná | 2192 |
| Nesprávné možnosti z jiné doby než správná | 747 |
| Málo možností | 0 |
| Nejednoznačná psaná odpověď (alias platí pro víc položek) | 656 |
| Stejná fotka u víc položek okruhu (duplicita, nebo cizí fotka) | 69 |
| Chudý nebo krátký popis | 18437 |
| Otázka bez nápovědy | 558 |
| Rozbitá data | 1 |

| Téma | Položek | Nálezů | Prozrazeno | Možnosti | Obrázky | Jiná země/doba | Podobné | Aliasy | Duplicita |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Architektura | 1736 | 1122 | 0 | 0 | 0 | 0 | 2 | 65 | 0 |
| Biologie | 3772 | 3301 | 0 | 0 | 0 | 0 | 7 | 3 | 0 |
| Chemie | 1901 | 1475 | 0 | 0 | 0 | 0 | 63 | 10 | 0 |
| Film | 1978 | 944 | 0 | 0 | 0 | 80 | 3 | 57 | 34 |
| Fyzika | 1796 | 1187 | 0 | 0 | 0 | 0 | 46 | 41 | 0 |
| Geologie | 588 | 478 | 0 | 0 | 0 | 0 | 51 | 0 | 0 |
| Historie | 3455 | 3819 | 0 | 0 | 0 | 1215 | 183 | 100 | 0 |
| Hudba | 1765 | 1211 | 0 | 0 | 0 | 250 | 4 | 29 | 3 |
| Literatura | 1683 | 1200 | 0 | 0 | 0 | 286 | 0 | 16 | 4 |
| Mytologie | 1128 | 976 | 0 | 0 | 0 | 0 | 6 | 1 | 1 |
| Sport | 1985 | 2095 | 0 | 0 | 0 | 818 | 73 | 40 | 17 |
| Výtvarné umění | 1636 | 1283 | 0 | 0 | 0 | 290 | 0 | 31 | 0 |
| Vlajky a znaky | 1889 | 1770 | 0 | 0 | 0 | 0 | 19 | 194 | 0 |
| Zeměpis | 4529 | 2352 | 0 | 0 | 0 | 0 | 32 | 69 | 5 |

## Podezřelé a nejisté (ukázky, zbytek v JSON)

### Nápověda opakuje popis (64)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| film | Adéla ještě nevečeřela (Q354525) | director | nápověda „o filmu“ jen opakuje popis | Žánr: sci-fi, komedie |
| film | Adéla ještě nevečeřela (Q354525) | decade | nápověda „žánr a země“ jen opakuje popis | Žánr: sci-fi, komedie |
| film | Akumulátor 1 (Q2428688) | decade | nápověda „režie“ opakuje dřívější nápovědu | Režie: Jan Svěrák |
| film | Akumulátor 1 (Q2428688) | name | nápověda „režie“ opakuje dřívější nápovědu | Režie: Jan Svěrák |
| film | Arabela se vrací aneb Rumburak králem Říše pohádek (Q1215871) | creator | nápověda „o seriálu“ jen opakuje popis | Vysílání: od 1993 |
| film | Avatar: The Way of Water (Q3604746) | director | nápověda „o filmu“ jen opakuje popis | Žánr: sci-fi, akční film |
| film | Avatar: The Way of Water (Q3604746) | decade | nápověda „žánr a země“ jen opakuje popis | Žánr: sci-fi, akční film |
| film | Bratrstvo neohrožených (Q208048) | creator | nápověda „o seriálu“ jen opakuje popis | Vysílání: od 2001 |
| film | Byli jednou dva písaři (Q11706306) | creator | nápověda „o seriálu“ jen opakuje popis | Vysílání: od 1973 |
| film | F. L. Věk (Q11985791) | creator | nápověda „o seriálu“ jen opakuje popis | Vysílání: od 1971 |
| film | Ježek Sonic 2 (Q105970894) | decade | nápověda „žánr a země“ jen opakuje popis | Žánr: sci-fi, akční film |
| film | Kolja (Q1141186) | decade | nápověda „režie“ opakuje dřívější nápovědu | Režie: Jan Svěrák |

### Příliš podobná nesprávná možnost (489)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Vila Tychonova 4 (Q31825089) | name | nesprávná možnost „Vila Tychonova 6“ se od správné odpovědi liší jen drobností | Vila Tychonova 4 ~ Vila Tychonova 6 |
| architektura | Vila Tychonova 6 (Q31825341) | name | nesprávná možnost „Vila Tychonova 4“ se od správné odpovědi liší jen drobností | Vila Tychonova 6 ~ Vila Tychonova 4 |
| biologie | Bělásek řepkový (Q683592) | name | nesprávná možnost „Bělásek řepový“ se od správné odpovědi liší jen drobností | Bělásek řepkový ~ Bělásek řepový |
| biologie | Bělásek řepový (Q27653) | name | nesprávná možnost „Bělásek řepkový“ se od správné odpovědi liší jen drobností | Bělásek řepový ~ Bělásek řepkový |
| biologie | Brukev řepka (Q177932) | name | nesprávná možnost „Brukev řepák“ se od správné odpovědi liší jen drobností | Brukev řepka ~ Brukev řepák |
| biologie | Německý ohař drátosrstý (Q37811) | name | nesprávná možnost „Německý ohař krátkosrstý“ se od správné odpovědi liší jen drobností | Německý ohař drátosrstý ~ Německý ohař krátkosrstý |
| biologie | Německý ohař krátkosrstý (Q38084) | name | nesprávná možnost „Německý ohař drátosrstý“ se od správné odpovědi liší jen drobností | Německý ohař krátkosrstý ~ Německý ohař drátosrstý |
| biologie | Puli (Q38864) | name | nesprávná možnost „Pumi“ se od správné odpovědi liší jen drobností | Puli ~ Pumi |
| biologie | Pumi (Q38919) | name | nesprávná možnost „Puli“ se od správné odpovědi liší jen drobností | Pumi ~ Puli |
| chemie | 1-butyn (Q161597) | name | nesprávná možnost „2-butyn“ se od správné odpovědi liší jen drobností | 1-butyn ~ 2-butyn |
| chemie | 2-butyn (Q209336) | name | nesprávná možnost „1-butyn“ se od správné odpovědi liší jen drobností | 2-butyn ~ 1-butyn |
| chemie | Anorganická chemie (Q11165) | name | nesprávná možnost „Organická chemie“ se od správné odpovědi liší jen drobností | Anorganická chemie ~ Organická chemie |

### Nesprávné možnosti z jiné země než správná (2192)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| film | Alejandro González Iñárritu (Q55215) | name | 1 z 3 nesprávných možností je z jiné země než správná (Mexiko) | Peter Jackson (Nový Zéland) |
| film | Alfonso Cuarón (Q28028) | name | 1 z 3 nesprávných možností je z jiné země než správná (Mexiko) | Peter Jackson (Nový Zéland) |
| film | Amitabh Bachchan (Q9570) | name | 2 z 3 nesprávných možností je z jiné země než správná (Indie) | Jet Li (Čína) \| Toširó Mifune (Japonsko) |
| film | Andrej Arseňjevič Tarkovskij (Q853) | name | 1 z 3 nesprávných možností je z jiné země než správná (Rusko) | Jean-Luc Godard (Francie) |
| film | Antonio Banderas (Q41548) | name | 2 z 3 nesprávných možností je z jiné země než správná (Španělsko) | Gérard Depardieu (Francie) \| Jean Belmondo (Francie) |
| film | Bajaja (Q3403311) | name | 1 z 3 nesprávných možností je z jiné země než správná (Československo) | Na půdě aneb Kdo má dneska narozeniny? (Česko, Japonsko) |
| film | Baz Luhrmann (Q250545) | name | 1 z 3 nesprávných možností je z jiné země než správná (Austrálie) | Sam Mendes (Spojené království) |
| film | Cate Blanchettová (Q80966) | name | 1 z 3 nesprávných možností je z jiné země než správná (Austrálie) | Catherine Zeta-Jonesová (Spojené království) |
| film | Claudia Cardinalová (Q107006) | name | 2 z 3 nesprávných možností je z jiné země než správná (Itálie) | Jeanne Moreau (Francie) \| Sophie Marceau (Francie) |
| film | Čang C'-i (Q180852) | name | 1 z 3 nesprávných možností je z jiné země než správná (Čína) | Freida Pinto (Indie) |
| film | Čarodějův učeň (Q909740) | name | 1 z 3 nesprávných možností je z jiné země než správná (Československo, Německo) | Na půdě aneb Kdo má dneska narozeniny? (Česko, Japonsko) |
| film | Dark (Q28443710) | name | 3 z 3 nesprávných možností je z jiné země než správná (Německo) | Arrow (Spojené státy americké) \| Mandalorian (Spojené státy americké) \| Banda (Spojené státy americké) |

### Nesprávné možnosti z jiné doby než správná (747)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| historie | Abd al-Kádir al-Džílání (Q307365) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1078) | Muhammad al-Buchárí (810) \| Muhammad at-Tabarí (839) |
| historie | Abdulhamid II. (Q134817) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1842) | Andronikos III. (1297) \| Justinián I. (482) |
| historie | Abú Hanífa (Q190896) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (699) | Al-Ghazálí (1056) |
| historie | Æthelberht (Q272173) | name | 3 z 3 nesprávných možností je o víc než 200 let jinde než správná (552) | Llywelyn ap Iorwerth (1173) \| Kenneth I. (810) \| Eduard I. Starší (874) |
| historie | Achaimenovská říše (Q389688) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (-549) | Seleukovská říše (-311) |
| historie | Akkadská říše (Q4461035) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (-2333) | Asýrie (-2024) \| Elam (-2699) |
| historie | Al-Ghazálí (Q9546) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1056) | Jan Zlatoústý (349) |
| historie | Albert Veliký (Q60059) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1200) | Johann Gottfried Herder (1744) \| Gotthold Ephraim Lessing (1729) |
| historie | Albrecht III. Achilles (Q453771) | name | 1 z 3 nesprávných možností je o víc než 200 let jinde než správná (1414) | Bedřich Jindřich Braniborsko-Schwedtský (1709) |
| historie | Albrecht VII. (Q311452) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1559) | Karel Ferdinand Rakousko-Těšínský (1818) \| Rainer Ferdinand Habsbursko-Lotrinský (1827) |
| historie | Albrecht z Valdštejna (Q153545) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (1583) | Jan Žižka (1360) \| Jošt Moravský (1351) |
| historie | Alcuin (Q154332) | name | 2 z 3 nesprávných možností je o víc než 200 let jinde než správná (740) | William Ockham (1287) \| Jan Viklef (1320) |

### Nejednoznačná psaná odpověď (alias platí pro víc položek) (656)

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

### Stejná fotka u víc položek okruhu (duplicita, nebo cizí fotka) (69)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| architektura | Antonio da Sangallo mladší (Q357276) | name | stejnou fotku mají i další položky okruhu (2×) | Antonio da Sangallo mladší [Q357276] \| Antonio da Sangallo starší [Q456861] |
| biologie | Borovice pinie (Q106094) | name | stejnou fotku mají i další položky okruhu (2×) | Borovice pinie [Q106094] \| Borovice přímořská [Q271582] |
| biologie | Hlemýždík kropenatý (Q22019793) | name | stejnou fotku mají i další položky okruhu (2×) | Hlemýždík kropenatý [Q22019793] \| Hlemýžď kropenatý [Q927080] |
| biologie | Kachna (Q3736439) | name | stejnou fotku mají i další položky okruhu (2×) | Kachna [Q3736439] \| Kachna divoká [Q25348] |
| biologie | Konipas bílý (Q25399) | name | stejnou fotku mají i další položky okruhu (2×) | Konipas bílý [Q25399] \| Konipas [Q230042] |
| biologie | Ledvina (Q9377) | name | stejnou fotku mají i další položky okruhu (2×) | Ledvina [Q9377] \| Močovod [Q9385] |
| biologie | Páv (Q3917160) | name | stejnou fotku mají i další položky okruhu (2×) | Páv [Q3917160] \| Páv zelený [Q254636] |
| biologie | Potní žláza (Q243784) | name | stejnou fotku mají i další položky okruhu (2×) | Potní žláza [Q243784] \| Ekrinní potní žlázy [Q1639831] |
| biologie | Třmínkový sval (Q507538) | name | stejnou fotku mají i další položky okruhu (2×) | Třmínkový sval [Q507538] \| Napínač bubínku [Q254643] |
| biologie | Výr (Q214293) | name | stejnou fotku mají i další položky okruhu (2×) | Výr [Q214293] \| Výr africký [Q513224] |
| chemie | Exotermní reakce (Q205949) | name | stejnou fotku mají i další položky okruhu (2×) | Exotermní reakce [Q205949] \| Aluminotermická reakce [Q447852] |
| fyzika | Hubbleův–Lemaîtreův zákon (Q179916) | name | stejnou fotku mají i další položky okruhu (2×) | Hubbleův–Lemaîtreův zákon [Q179916] \| Kosmologická konstanta [Q59151] |

### Otázka bez nápovědy (558)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| biologie | Apendix (Q9656) | name | otázka nemá žádnou nápovědu ani obrázek | Část střeva. |
| biologie | Atlas (Q655357) | name | otázka nemá žádnou nápovědu ani obrázek | První [***] obratel. |
| biologie | Bartholiniho žláza (Q790949) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Cowperova žláza (Q120463) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Čepovec (Q792567) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Dřeň nadledvin (Q934888) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Duhovka (Q178748) | name | otázka nemá žádnou nápovědu ani obrázek | Část oka obratlovců. |
| biologie | Evropská krátkosrstá kočka (Q20793) | location | otázka nemá žádnou nápovědu ani obrázek | Plemeno kočky domácí. |
| biologie | Hipokampus (Q48360) | name | otázka nemá žádnou nápovědu ani obrázek | Součást velkého mozku. |
| biologie | Hypothalamus (Q164386) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Krční mandle (Q15146576) | name | otázka nemá žádnou nápovědu ani obrázek |  |
| biologie | Kůra nadledvin (Q19065) | name | otázka nemá žádnou nápovědu ani obrázek |  |

### Rozbitá data (1)

| Téma | Položka | Druh | Problém | Úryvek |
|---|---|---|---|---|
| historie | Pařížská dohoda (Q21707860) | - | HTML nebo rozbitý text v poli d | dohoda v rámci Rámcové úmluvy OSN o změně klimatu k omezení emisí CO<sub>2</sub> z roku 2… |

