# Jednoznačnost otázek

Vygenerováno 2026-11-16 11:08 UTC skriptem `npm run audit:jednoznacnost` (5412 otázek, 711 s). Úplný výpis je v `reports/jednoznacnost.json`.

Popis otázky: úvod článku z Wikipedie u 5409 otázek (tests/wiki-intros.json a jedno-uvody.json, stažené z cs.wikipedia.org volbou --fetch stejným dotazem jako aplikace), u ostatních krátký popis z Wikidat, jako když se Wikipedie nenačte.

## Pravidlo

Před první nápovědou musí otázka ukázat aspoň jeden údaj, který platí pro správnou odpověď a pro žádnou ze tří nesprávných. Posuzuje se, co hráč vidí bez nápovědy: zadání a štítek, zakrytý popis, fakta ukázaná hned u chudého popisu, rozlišující údaj a obrázek otázky. Nesprávná možnost je vyvrácená, když má v datech některý ukázaný údaj jasně jinak (rok o 10 a víc let u novověku, u starších dob víc; funkční období a doba trvání bez překryvu; číslo aspoň 1,5×; jiný stát nebo třída; dílo, které v jejích datech není a v jehož datech není ona). Z volného textu se počítá jen údaj z dat správné odpovědi, který text zmiňuje (rok, číslo, název díla, místo, národnost). Otázka je nejednoznačná, když některou nesprávnou možnost nevyvrací nic.

Druhy otázek: **popis** = otázka na název bez obrázku (posuzuje se strukturovaně), **ukázka** = obrázek jen ukazuje druh (nerost, hornina, sloh), posuzuje se jako popis; **jméno** = zvláštní otázka se jménem položky (Kdo film režíroval?, Ve kterém století?): odpověď určí jméno, nejednoznačná je, jen když ji v datech splňuje i nesprávná možnost (spolurežisér). Otázky s obrázkem věci samé (obraz, vlajka, stavba), mapové a místní otázky Dobývání se nepočítají.

## Úprava (stav „po“)

1. **Prodloužení popisu:** obecný popis (jen povolání či druh, bez roku, čísla, jména a názvu díla) převezme další věty úvodu, dokud v něm konkrétní údaj nebude; převzaté věty v nápovědě Další věty už nejsou.
2. **Rozlišující údaj:** když popis a fakta ukázaná hned odpověď neurčí, ukáže se hned pod záložkami údaj z dat, který všechny nevyvrácené možnosti vyvrací: dílo či role („Film: Císařův pekař – Pekařův císař“), roky (jen jasně jiné), místo, ocenění, autor, sloh, velikost, země. Nikdy jméno ani nic, co odpověď obsahuje (stejné kontroly jako fakta: factRevealsAnswer, answerWordsLeft). Nápověda Fakta ho už neopakuje.
3. **Výměna nesprávných možností:** když takový údaj není, nesprávné možnosti, které nevyvrací nic, se vymění za co nejpodobnější položky stejné kategorie, které nejlepší údaj vyvrací (stejné skóre podobnosti jako výběr možností, bez náhody). Možnosti vyvrácené popisem zůstanou.
4. **Otázka se jménem:** když nejde ani výměna, položka se zeptá jinou otázkou tématu se svým jménem (Ze které mytologie je?), a když ani ta není, otázka je nejednoznačná: trénink vezme jinou položku, jinde rozliší aspoň dva údaje spolu.
5. **Denní módy** (Dnešní otázky, Kvíz dne, Tajemná otázka, Boss) mění možnosti až od 17. 11. 2026, ať se dnešní sada nezmění; rozlišující údaj a prodloužený popis ukážou hned. Dobývání má pevné možnosti: chybí-li údaj, který je vyvrátí, dá místo otázky Mudrlanta místní otázku.

## Souhrn

| | Otázek | Před: nejednoznačné | Před | Po: nejednoznačné | Po | Po: jen popis | Po: dvěma údaji | S rozlišujícím údajem | Vyměněné možnosti | Otázka se jménem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Celkem** | 4615 | 2279 | 49.4 % | 21 | 0.5 % | 203 | 201 | 1596 | 1089 | 21 |
| hra | 3579 | 1685 | 47.1 % | 14 | 0.4 % | 141 | 123 | 1169 | 848 | 19 |
| výzva | 430 | 280 | 65.1 % | 4 | 0.9 % | 38 | 15 | 181 | 130 | 1 |
| kvíz dne | 348 | 241 | 69.3 % | 3 | 0.9 % | 24 | 16 | 169 | 111 | 1 |
| Dobývání | 258 | 73 | 28.3 % | 0 | 0.0 % | 0 | 47 | 77 | 0 | 0 |
| druh: ukázka | 237 | 237 | 100.0 % | 0 | 0.0 % | 0 | 0 | 237 | 78 | 0 |
| druh: jméno | 1602 | 21 | 1.3 % | 0 | 0.0 % | 0 | 0 | 0 | 0 | 21 |
| druh: popis | 2776 | 2021 | 72.8 % | 21 | 0.8 % | 203 | 201 | 1359 | 1011 | 0 |
| úroveň Základní (známé) | 1983 | 1027 | 51.8 % | 10 | 0.5 % | 96 | 86 | 743 | 453 | 6 |
| úroveň Mudrlant | 1418 | 679 | 47.9 % | 8 | 0.6 % | 58 | 70 | 467 | 338 | 7 |
| úroveň Mudrlant Expert | 1214 | 573 | 47.2 % | 3 | 0.2 % | 49 | 45 | 386 | 298 | 8 |
| s úvodem z Wikipedie | 4612 | 2278 | 49.4 % | 20 | 0.4 % | 203 | 200 | 1596 | 1089 | 21 |

## Podle témat

| | Otázek | Před: nejednoznačné | Před | Po: nejednoznačné | Po | Po: jen popis | Po: dvěma údaji | S rozlišujícím údajem | Vyměněné možnosti | Otázka se jménem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| architektura | 194 | 52 | 26.8 % | 0 | 0.0 % | 0 | 3 | 52 | 6 | 0 |
| biologie | 368 | 219 | 59.5 % | 8 | 2.2 % | 24 | 15 | 76 | 186 | 0 |
| chemie | 327 | 218 | 66.7 % | 5 | 1.5 % | 85 | 1 | 115 | 50 | 12 |
| film | 428 | 100 | 23.4 % | 0 | 0.0 % | 0 | 1 | 96 | 12 | 0 |
| fyzika | 305 | 214 | 70.2 % | 3 | 1.0 % | 41 | 11 | 146 | 94 | 1 |
| geologie | 332 | 241 | 72.6 % | 0 | 0.0 % | 0 | 3 | 226 | 102 | 0 |
| historie | 438 | 154 | 35.2 % | 0 | 0.0 % | 0 | 14 | 131 | 75 | 3 |
| hudba | 349 | 155 | 44.4 % | 0 | 0.0 % | 0 | 37 | 133 | 58 | 0 |
| literatura | 501 | 178 | 35.5 % | 0 | 0.0 % | 0 | 5 | 125 | 89 | 0 |
| mytologie | 295 | 230 | 78.0 % | 5 | 1.7 % | 51 | 9 | 93 | 139 | 3 |
| sport | 341 | 145 | 42.5 % | 0 | 0.0 % | 0 | 39 | 124 | 60 | 2 |
| umeni | 219 | 137 | 62.6 % | 0 | 0.0 % | 0 | 13 | 137 | 55 | 0 |
| vlajky | 0 | 0 | – | 0 | – | 0 | 0 | 0 | 0 | 0 |
| zemepis | 518 | 236 | 45.6 % | 0 | 0.0 % | 2 | 50 | 142 | 163 | 0 |

## Podle témat a druhů otázek

| Téma | Druh otázky | Otázek | Před | Po |
|---|---|---:|---:|---:|
| architektura | Jaký je to sloh? | 110 | 0.0 % | 0.0 % |
| architektura | Kdo ji navrhl? | 22 | 0.0 % | 0.0 % |
| architektura | Kdo to je? | 41 | 75.6 % | 0.0 % |
| architektura | Který sloh to je? | 21 | 100.0 % | 0.0 % |
| biologie | Co je to za houbu? | 12 | 83.3 % | 0.0 % |
| biologie | Co je to za plemeno? | 24 | 95.8 % | 8.3 % |
| biologie | Co je to za pravěkého tvora? | 15 | 100.0 % | 0.0 % |
| biologie | Co je to za ptáka? | 35 | 82.9 % | 0.0 % |
| biologie | Co je to za rostlinu? | 42 | 100.0 % | 0.0 % |
| biologie | Co je to za rybu? | 20 | 90.0 % | 0.0 % |
| biologie | Co je to za zvíře? | 76 | 92.1 % | 0.0 % |
| biologie | Do které čeledi patří? | 31 | 0.0 % | 0.0 % |
| biologie | Do kterého řádu patří? | 94 | 0.0 % | 0.0 % |
| biologie | Která část těla to je? | 12 | 100.0 % | 50.0 % |
| biologie | Ze které země plemeno pochází? | 7 | 0.0 % | 0.0 % |
| chemie | Co je to za látku? | 75 | 74.7 % | 0.0 % |
| chemie | Jakou značku má tento prvek? | 12 | 0.0 % | 0.0 % |
| chemie | Jaká reakce nebo proces to je? | 36 | 100.0 % | 2.8 % |
| chemie | Jaký pojem nebo metoda to je? | 52 | 100.0 % | 7.7 % |
| chemie | Jaký vzorec má tato látka? | 83 | 14.5 % | 0.0 % |
| chemie | Kdo to je? | 47 | 91.5 % | 0.0 % |
| chemie | Který prvek to je? | 22 | 86.4 % | 0.0 % |
| film | Kdo film režíroval? | 40 | 0.0 % | 0.0 % |
| film | Kdo napsal scénář seriálu? | 4 | 0.0 % | 0.0 % |
| film | Kdo seriál vytvořil? | 12 | 0.0 % | 0.0 % |
| film | Kdo to je? | 83 | 56.6 % | 0.0 % |
| film | Které studio film natočilo? | 20 | 0.0 % | 0.0 % |
| film | Který animovaný film to je? | 27 | 44.4 % | 0.0 % |
| film | Který film to je? | 85 | 20.0 % | 0.0 % |
| film | Který seriál to je? | 29 | 82.8 % | 0.0 % |
| film | Ve kterém desetiletí měl premiéru? | 97 | 0.0 % | 0.0 % |
| film | Ve kterém desetiletí se začal vysílat? | 31 | 0.0 % | 0.0 % |
| fyzika | Co je to za sondu nebo přístroj? | 17 | 94.1 % | 0.0 % |
| fyzika | Co je to za těleso? | 48 | 75.0 % | 0.0 % |
| fyzika | Co je to za vynález? | 15 | 93.3 % | 0.0 % |
| fyzika | Co měří tato jednotka? | 11 | 0.0 % | 0.0 % |
| fyzika | Jakou značku má tato jednotka? | 14 | 0.0 % | 0.0 % |
| fyzika | Jaká je jednotka SI této veličiny? | 13 | 7.7 % | 0.0 % |
| fyzika | Kdo to je? | 92 | 90.2 % | 0.0 % |
| fyzika | Kdo to vynalezl? | 13 | 0.0 % | 0.0 % |
| fyzika | Která jednotka to je? | 16 | 87.5 % | 0.0 % |
| fyzika | Která veličina to je? | 17 | 94.1 % | 0.0 % |
| fyzika | Která částice to je? | 9 | 100.0 % | 0.0 % |
| fyzika | Který zákon, jev nebo pojem to je? | 25 | 100.0 % | 12.0 % |
| fyzika | Ve kterém desetiletí to bylo vynalezeno? | 7 | 0.0 % | 0.0 % |
| fyzika | Ve kterém století to bylo vynalezeno? | 8 | 0.0 % | 0.0 % |
| geologie | Co je to za drahý kámen? | 22 | 100.0 % | 0.0 % |
| geologie | Co je to za horninu? | 38 | 100.0 % | 0.0 % |
| geologie | Co je to za nerost? | 76 | 100.0 % | 0.0 % |
| geologie | Co je to za zkamenělinu nebo organismus? | 19 | 100.0 % | 0.0 % |
| geologie | Co je to za útvar nebo jev? | 61 | 100.0 % | 0.0 % |
| geologie | Do které skupiny hornin patří? | 21 | 0.0 % | 0.0 % |
| geologie | Jakou má tvrdost podle Mohse? | 7 | 0.0 % | 0.0 % |
| geologie | Jaký má vzorec? | 62 | 0.0 % | 0.0 % |
| geologie | Které je to období? | 26 | 96.2 % | 0.0 % |
| historie | Kdo to je? | 145 | 70.3 % | 0.0 % |
| historie | Která bitva, válka nebo revoluce to je? | 48 | 47.9 % | 0.0 % |
| historie | Která událost to je? | 22 | 13.6 % | 0.0 % |
| historie | Který stát to je? | 26 | 88.5 % | 0.0 % |
| historie | Ve kterém dnešním státě byla podepsána? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém dnešním státě se to stalo? | 3 | 0.0 % | 0.0 % |
| historie | Ve kterém století byla podepsána? | 2 | 0.0 % | 0.0 % |
| historie | Ve kterém století nastoupil do úřadu? | 29 | 3.4 % | 0.0 % |
| historie | Ve kterém století nastoupila do úřadu? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém století se narodil? | 44 | 2.3 % | 0.0 % |
| historie | Ve kterém století se narodila? | 10 | 0.0 % | 0.0 % |
| historie | Ve kterém století se to odehrálo? | 37 | 2.7 % | 0.0 % |
| historie | Ve kterém století se to stalo? | 8 | 0.0 % | 0.0 % |
| historie | Ve kterém století tento stát vznikl? | 17 | 0.0 % | 0.0 % |
| historie | Ve kterém století to začalo? | 3 | 0.0 % | 0.0 % |
| historie | Ve kterém století začal vládnout? | 37 | 0.0 % | 0.0 % |
| historie | Ve kterém století začala vládnout? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém století zemřel? | 4 | 0.0 % | 0.0 % |
| hudba | Co je to za kapelu? | 51 | 43.1 % | 0.0 % |
| hudba | Do kterého hudebního období patří? | 16 | 0.0 % | 0.0 % |
| hudba | Kdo to je? | 121 | 74.4 % | 0.0 % |
| hudba | Kdo to složil? | 29 | 0.0 % | 0.0 % |
| hudba | Která opera nebo muzikál to je? | 31 | 54.8 % | 0.0 % |
| hudba | Které dílo to je? | 43 | 60.5 % | 0.0 % |
| hudba | Ve kterém století měla premiéru? | 26 | 0.0 % | 0.0 % |
| hudba | Čí je to album? | 22 | 0.0 % | 0.0 % |
| hudba | Čí je to píseň? | 10 | 0.0 % | 0.0 % |
| literatura | Kdo to je? | 110 | 92.7 % | 0.0 % |
| literatura | Kdo to napsal? | 85 | 0.0 % | 0.0 % |
| literatura | Kdo tuto postavu vymyslel? | 19 | 0.0 % | 0.0 % |
| literatura | Která postava to je? | 20 | 65.0 % | 0.0 % |
| literatura | Které dílo to je? | 93 | 67.7 % | 0.0 % |
| literatura | Ve kterém století dílo vzniklo? | 80 | 0.0 % | 0.0 % |
| literatura | Ve kterém století se narodil? | 47 | 0.0 % | 0.0 % |
| literatura | Ve kterém století se narodila? | 15 | 0.0 % | 0.0 % |
| literatura | Ve kterém století žil? | 26 | 0.0 % | 0.0 % |
| literatura | Ve kterém století žila? | 1 | 0.0 % | 0.0 % |
| literatura | Ze kterého díla je tato postava? | 5 | 0.0 % | 0.0 % |
| mytologie | Co je to za bytost? | 35 | 100.0 % | 0.0 % |
| mytologie | Co je to? | 11 | 100.0 % | 0.0 % |
| mytologie | Jak se jmenuje v řecké mytologii? | 4 | 0.0 % | 0.0 % |
| mytologie | Jak se jmenuje v římské mytologii? | 2 | 0.0 % | 0.0 % |
| mytologie | Kdo je to? | 193 | 93.8 % | 2.6 % |
| mytologie | Ze které mytologie je? | 27 | 7.4 % | 0.0 % |
| mytologie | Ze které mytologie tato bytost pochází? | 23 | 4.3 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1896? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1900? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1964? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1992? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 2020? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1932? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1960? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1992? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 2002? | 1 | 0.0 % | 0.0 % |
| sport | Kdo to je? | 120 | 57.5 % | 0.0 % |
| sport | Která soutěž to je? | 25 | 88.0 % | 0.0 % |
| sport | Které olympijské hry to jsou? | 10 | 30.0 % | 0.0 % |
| sport | Které sportoviště to je? | 52 | 26.9 % | 0.0 % |
| sport | Který klub nebo tým to je? | 44 | 79.5 % | 0.0 % |
| sport | Ve kterém sportu se proslavil? | 47 | 4.3 % | 0.0 % |
| sport | Ve kterém sportu se proslavila? | 34 | 0.0 % | 0.0 % |
| umeni | Jaký je to umělecký směr? | 17 | 94.1 % | 0.0 % |
| umeni | Kdo to je? | 152 | 79.6 % | 0.0 % |
| umeni | Kdo to namaloval? | 31 | 0.0 % | 0.0 % |
| umeni | Kdo vytvořil tuto sochu? | 3 | 0.0 % | 0.0 % |
| umeni | Ke kterému uměleckému směru patří? | 16 | 0.0 % | 0.0 % |
| zemepis | Co je to za místo? | 409 | 57.7 % | 0.0 % |
| zemepis | Ve kterém státě to je? | 109 | 0.0 % | 0.0 % |

Nepočítané otázky (odpověď určí obrázek věci samé, mapa nebo místní otázka Dobývání): obrázek 562, místní 235.

## Příklady před a po

### Jan Werich (film, zadání, Kdo to je?)

- **Před:** „[***] byl český filmový a divadelní herec, komik, dramatik a filmový scénárista, písňový textař a spisovatel.“
  - možnosti: Jan Werich ✓, Karel Höger, Ladislav Pešek, Jaroslav Marvan
  - nevyvrácené: Karel Höger, Ladislav Pešek, Jaroslav Marvan
- **Po:** „[***] byl český filmový a divadelní herec, komik, dramatik a filmový scénárista, písňový textař a spisovatel.“ · **rozlišující údaj: Film: Císařův pekař – Pekařův císař**
  - možnosti: Jan Werich ✓, Karel Höger, Ladislav Pešek, Jaroslav Marvan
  - jednoznačná (rozlišující údaj)

### Řecká antika (architektura, hra, Který sloh to je?)

- **Před:** (bez popisu)
  - možnosti: Byzantský sloh, Gotika, Řecká antika ✓, Románský sloh
  - nevyvrácené: Byzantský sloh, Gotika, Románský sloh
- **Po:** (bez popisu) · **rozlišující údaj: Slavná stavba: Artemidin chrám v Efesu**
  - možnosti: Byzantský sloh, Gotika, Řecká antika ✓, Románský sloh
  - jednoznačná (rozlišující údaj)

### Tojoo Itó (architektura, hra, Kdo to je?)

- **Před:** „[***] je japonský architekt, známý svou mimořádně tvořivou koncepční architekturou, v níž usiluje o propojení fyzického světa se světem virtuálním.“
  - možnosti: Tojoo Itó ✓, Riken Jamamoto, Šigeru Ban, Fumihiko Maki
  - nevyvrácené: Riken Jamamoto, Šigeru Ban, Fumihiko Maki
- **Po:** „[***] je japonský architekt, známý svou mimořádně tvořivou koncepční architekturou, v níž usiluje o propojení fyzického světa se světem virtuálním.“ · **rozlišující údaj: Narození: 1941**
  - možnosti: Tojoo Itó ✓, Kengo Kuma, Šigeru Ban, Fumihiko Maki (vyměněné)
  - jednoznačná (rozlišující údaj)

### Čirůvka zelánka (biologie, hra, Co je to za houbu?)

- **Před:** „[***] je fakultativně jedovatá podzimní houba. V důsledku kyselých dešťů došlo k úbytku této houby. Jde o mykorhizní druh.“
  - možnosti: Čirůvka zelánka ✓, Čirůvka sírožlutá, Čirůvka havelka, Čirůvka tygrovaná
  - nevyvrácené: Čirůvka sírožlutá, Čirůvka havelka, Čirůvka tygrovaná
- **Po:** „[***] je fakultativně jedovatá podzimní houba. V důsledku kyselých dešťů došlo k úbytku této houby. Jde o mykorhizní druh.“ · **rozlišující údaj: Jedlost: nutná opatrnost**
  - možnosti: Čirůvka zelánka ✓, Čirůvka sírožlutá, Čirůvka havelka, Čirůvka tygrovaná
  - jednoznačná (rozlišující údaj)

### Pes domácí (biologie, hra, Co je to za zvíře?)

- **Před:** „[***] je největší domestikovaná šelma a jedno z nejstarších domestikovaných zvířat vůbec. Provází člověka minimálně 14 tisíc let.“
  - možnosti: Pes domácí ✓, Pes hyenovitý, Pes bojovný, Pravlk obrovský
  - nevyvrácené: Pes hyenovitý, Pes bojovný, Pravlk obrovský
- **Po:** „[***] je největší domestikovaná šelma a jedno z nejstarších domestikovaných zvířat vůbec. Provází člověka minimálně 14 tisíc let.“
  - možnosti: Pes domácí ✓, Křeček zlatý, Sviňucha obecná, Ptakopysk podivný (vyměněné)
  - jednoznačná (popis)

### Vodík (chemie, hra, Který prvek to je?)

- **Před:** „[***] je nejlehčí a nejjednodušší plynný chemický prvek. Tvoří převážnou část hmoty ve vesmíru. Elementární [***] má široké praktické využití: zdroj energie, redukční činidlo v chemické syntéze nebo metalurgii a také jako náplň meteorologických a pouťových ba…“
  - možnosti: Uhlík, Kyslík, Síra, Vodík ✓
  - nevyvrácené: Uhlík, Kyslík, Síra
- **Po:** „[***] je nejlehčí a nejjednodušší plynný chemický prvek. Tvoří převážnou část hmoty ve vesmíru. Elementární [***] má široké praktické využití: zdroj energie, redukční činidlo v chemické syntéze nebo metalurgii a také jako náplň meteorologických a pouťových ba…“ · **rozlišující údaj: Objevitel: Henry Cavendish**
  - možnosti: Uhlík, Kyslík, Síra, Vodík ✓
  - jednoznačná (rozlišující údaj)

### Cesium (chemie, hra, Který prvek to je?)

- **Před:** „[***] je chemický prvek z řady alkalických kovů, vyznačuje se velkou reaktivitou a mimořádně nízkým redoxním potenciálem.“
  - možnosti: Lithium, Draslík, Cesium ✓, Rubidium
  - nevyvrácené: Lithium, Draslík, Rubidium
- **Po:** „[***] je chemický prvek z řady alkalických kovů, vyznačuje se velkou reaktivitou a mimořádně nízkým redoxním potenciálem.“ · **rozlišující údaj: Objevitel: Gustav Kirchhoff, Robert Wilhelm Bunsen**
  - možnosti: Lithium, Draslík, Cesium ✓, Sodík (vyměněné)
  - jednoznačná (rozlišující údaj)

### Harry Potter a Tajemná komnata (film, hra, Který film to je?)

- **Před:** „[***] je britsko-americký film natočený podle stejnojmenné předlohy britské spisovatelky J. K. Rowlingové.“ · fakta: Rok: 2002; Žánr: fantasy, dobrodružný film; Země: Spojené státy americké, Spojené království
  - možnosti: Pán prstenů: Společenstvo Prstenu, Harry Potter a vězeň z Azkabanu, Harry Potter a Tajemná komnata ✓, Mumie
  - nevyvrácené: Pán prstenů: Společenstvo Prstenu, Harry Potter a vězeň z Azkabanu, Mumie
- **Po:** „[***] je britsko-americký film natočený podle stejnojmenné předlohy britské spisovatelky J. K. Rowlingové.“ · **rozlišující údaj: Režie: Chris Columbus** · fakta: Rok: 2002; Žánr: fantasy, dobrodružný film; Země: Spojené státy americké, Spojené království
  - možnosti: Pán prstenů: Společenstvo Prstenu, Harry Potter a vězeň z Azkabanu, Harry Potter a Tajemná komnata ✓, Mumie
  - jednoznačná (rozlišující údaj)

### Cesta do fantazie (film, hra, Který animovaný film to je?)

- **Před:** „[***] je jeden z nejznámějších japonských animovaných filmů vyrobených ve stylu anime. Film režíroval Hajao Mijazaki v produkci studia Ghibli a do kin byl uveden 27. července 2001.“
  - možnosti: Cesta do fantazie ✓, Království koček, Zámek v oblacích, Princezna Mononoke
  - nevyvrácené: Zámek v oblacích, Princezna Mononoke
- **Po:** „[***] je jeden z nejznámějších japonských animovaných filmů vyrobených ve stylu anime. Film režíroval Hajao Mijazaki v produkci studia Ghibli a do kin byl uveden 27. července 2001.“
  - možnosti: Cesta do fantazie ✓, Království koček, Gedo senki, Ponpoko (vyměněné)
  - jednoznačná (popis)

### Radián (fyzika, hra, Která jednotka to je?)

- **Před:** „[***] je bezrozměrová odvozená jednotka soustavy SI velikosti rovinného úhlu. Používá se pro něj značka [***]. 1 [***] je velikost středového úhlu, který přísluší oblouku o stejné délce, jako je poloměr kružnice.“
  - možnosti: Stupeň, Radián ✓, Coulomb, Ohm
  - nevyvrácené: Coulomb, Ohm
- **Po:** „[***] je bezrozměrová odvozená jednotka soustavy SI velikosti rovinného úhlu. Používá se pro něj značka [***]. 1 [***] je velikost středového úhlu, který přísluší oblouku o stejné délce, jako je poloměr kružnice.“ · **rozlišující údaj: Veličina: úhlová vzdálenost**
  - možnosti: Stupeň, Radián ✓, Coulomb, Ohm
  - jednoznačná (rozlišující údaj)

### Energie (fyzika, hra, Která veličina to je?)

- **Před:** „[***] je skalární fyzikální veličina, která popisuje schopnost hmoty konat [***]. [***] je slovo vytvořené fyziky v polovině devatenáctého století z řeckého ἐνέργεια.“
  - možnosti: Energie ✓, Teplo, Hmotnost, Práce
  - nevyvrácené: Teplo, Hmotnost, Práce
- **Po:** „[***] je skalární fyzikální veličina, která popisuje schopnost hmoty konat práci. [***] je slovo vytvořené fyziky v polovině devatenáctého století z řeckého ἐνέργεια.“ · **rozlišující údaj: Jednotka SI: joule (J)**
  - možnosti: Energie ✓, Zrychlení, Hmotnost, Vlnová délka (vyměněné)
  - jednoznačná (rozlišující údaj)

### Diamant (geologie, hra, Co je to za drahý kámen?)

- **Před:** (bez popisu)
  - možnosti: Diamant ✓, Topaz, Citrín, Hyalit
  - nevyvrácené: Topaz, Citrín, Hyalit
- **Po:** (bez popisu) · **rozlišující údaj: Třída: prvky**
  - možnosti: Diamant ✓, Topaz, Citrín, Hyalit
  - jednoznačná (rozlišující údaj)

### Smaragd (geologie, hra, Co je to za drahý kámen?)

- **Před:** (bez popisu)
  - možnosti: Nefrit, Smaragd ✓, Chryzopras, Vltavín
  - nevyvrácené: Nefrit, Chryzopras, Vltavín
- **Po:** (bez popisu) · **rozlišující údaj: Krystalová soustava: šesterečná**
  - možnosti: Nefrit, Smaragd ✓, Chryzopras, Alexandrit (vyměněné)
  - jednoznačná (rozlišující údaj)

### Alexandr Veliký (historie, hra, Kdo to je?)

- **Před:** „[***], ), byl král Makedonie. [***] rozšířil hranice své říše tažením do Persie a na indický subkontinent, díky čemuž se stal zřejmě největším a nejúspěšnějším vojevůdcem celé historie, který neprohrál žádnou bitvu.“
  - možnosti: Filip II. Makedonský, Ptolemaios I. Sótér, Alexandr IV. Aigos, Alexandr Veliký ✓
  - nevyvrácené: Filip II. Makedonský, Ptolemaios I. Sótér, Alexandr IV. Aigos
- **Po:** „[***], ), byl král Makedonie. [***] rozšířil hranice své říše tažením do Persie a na indický subkontinent, díky čemuž se stal zřejmě největším a nejúspěšnějším vojevůdcem celé historie, který neprohrál žádnou bitvu.“ · **rozlišující údaj: Vláda: 335–322 př. n. l.**
  - možnosti: Filip II. Makedonský, Ptolemaios I. Sótér, Alexandr IV. Aigos, Alexandr Veliký ✓
  - jednoznačná (rozlišující údaj)

### Jana z Arku (historie, hra, Kdo to je?)

- **Před:** „[***] byla francouzská hrdinka, která stanula v čele francouzských vojsk za stoleté války v boji proti Angličanům a posléze byla upálena za kacířství.“
  - možnosti: Jana z Arku ✓, Markéta z Valois, Isabela Bourbonská, Markéta Skotská
  - nevyvrácené: Isabela Bourbonská, Markéta Skotská
- **Po:** „[***] byla [***] hrdinka, která stanula v čele [***] vojsk za stoleté války v boji proti Angličanům a posléze byla upálena za kacířství.“ · **rozlišující údaj: Narození: 1412**
  - možnosti: Jana z Arku ✓, Markéta z Valois, Anna Francouzská, Marie Burgundská (vyměněné)
  - jednoznačná (rozlišující údaj)

### Gustav Mahler (hudba, hra, Kdo to je?)

- **Před:** „[***] byl rakousko-uherský hudební skladatel původem z Čech a jeden z předních dirigentů své generace. Jako skladatel tvoří most mezi romantickou tradicí 19. století a modernismem počátku 20. století.“
  - možnosti: Zdeněk Fibich, Bedřich Smetana, Gustav Mahler ✓, Antonín Dvořák
  - nevyvrácené: Zdeněk Fibich, Bedřich Smetana, Antonín Dvořák
- **Po:** „[***] byl rakousko-uherský hudební skladatel původem z Čech a jeden z předních dirigentů své generace. Jako skladatel tvoří most mezi romantickou tradicí 19. století a modernismem počátku 20. století.“ · **rozlišující údaj: Slavné dílo: Písně o mrtvých dětech**
  - možnosti: Zdeněk Fibich, Bedřich Smetana, Gustav Mahler ✓, Antonín Dvořák
  - jednoznačná (rozlišující údaj)

### Arnold Schoenberg (hudba, hra, Kdo to je?)

- **Před:** „[***] byl rakouský modernistický hudební skladatel, hudební teoretik a příležitostný malíř.“
  - možnosti: Franz Lehár, Arnold Schoenberg ✓, Anton Bruckner, Fritz Kreisler
  - nevyvrácené: Franz Lehár, Anton Bruckner, Fritz Kreisler
- **Po:** „[***] byl rakouský modernistický hudební skladatel, hudební teoretik a příležitostný malíř. Většinu svých hudebních skladeb vytvořil mimo tradiční tonální systém – v takzvaně atonalitě. Vymyslel také metodu hudební skladby dodekafonii používající 12 zrovnoprá…“ · **rozlišující údaj: Život: 1874–1951**
  - možnosti: Max Steiner, Arnold Schoenberg ✓, Anton Bruckner, Fritz Kreisler (vyměněné)
  - jednoznačná (rozlišující údaj)

### Franz Kafka (literatura, hra, Kdo to je?)

- **Před:** „[***], židovským jménem Anšel, byl český německy píšící židovský spisovatel. Je považován za jednoho z literárně nejvlivnějších spisovatelů 20. století, byl členem Pražského kruhu.“
  - možnosti: Franz Kafka ✓, Josef Lada, Jaroslav Hašek, Franz Werfel
  - nevyvrácené: Josef Lada, Jaroslav Hašek, Franz Werfel
- **Po:** „[***], židovským jménem Anšel, byl český německy píšící židovský spisovatel. Je považován za jednoho z literárně nejvlivnějších spisovatelů 20. století, byl členem Pražského kruhu.“ · **rozlišující údaj: Slavné dílo: Proměna**
  - možnosti: Franz Kafka ✓, Josef Lada, Jaroslav Hašek, Franz Werfel
  - jednoznačná (rozlišující údaj)

### Alice Munroová (literatura, hra, Kdo to je?)

- **Před:** „[***] byla kanadská spisovatelka proslulá především svými povídkami. Třikrát získala nejprestižnější kanadské literární ocenění Governor General's Award a roku 2009 i Mezinárodní Man Bookerovou cenou.“
  - možnosti: Alice Munroová ✓, Lucy Maud Montgomery, Margaret Atwoodová, Nadine Gordimerová
  - nevyvrácené: Lucy Maud Montgomery, Margaret Atwoodová
- **Po:** „[***] byla kanadská spisovatelka proslulá především svými povídkami. Třikrát získala nejprestižnější kanadské literární ocenění Governor General's Award a roku 2009 i Mezinárodní Man Bookerovou cenou.“ · **rozlišující údaj: Život: 1931–2024**
  - možnosti: Alice Munroová ✓, Lucy Maud Montgomery, Agatha Christie, Nadine Gordimerová (vyměněné)
  - jednoznačná (rozlišující údaj)

### Venuše (mytologie, hra, Kdo je to?)

- **Před:** „[***] je římská bohyně smyslnosti, krásy a lásky. Později byla ztotožňována s řeckou bohyní [***]. V římské mytologii představovala [***] zrozená z pěny matku Aenea, bájného zakladatele římského národa.“
  - možnosti: Juno, Ceres, Venuše ✓, Vesta
  - nevyvrácené: Juno, Ceres, Vesta
- **Po:** „[***] je římská bohyně smyslnosti, krásy a lásky. Později byla ztotožňována s řeckou bohyní [***]. V římské mytologii představovala [***] zrozená z pěny matku Aenea, bájného zakladatele římského národa.“ · **rozlišující údaj: Oblast: láska, jaro, krása, lidská sexualita**
  - možnosti: Juno, Ceres, Venuše ✓, Vesta
  - jednoznačná (rozlišující údaj)

### Perseus (mytologie, hra, Kdo je to?)

- **Před:** „[***], syn Dia a Danaé, je bájná postava a jeden z nejznámějších hrdinů řecké mytologie a zakladatel Mykén. Je taky pradědem nejslavnějšího řeckého hrdiny Hérakla.“
  - možnosti: Oidipus, Perseus ✓, Iásón, Hektór
  - nevyvrácené: Iásón
- **Po:** „[***], syn Dia a Danaé, je bájná postava a jeden z nejznámějších hrdinů řecké mytologie a zakladatel Mykén. Je taky pradědem nejslavnějšího řeckého hrdiny Hérakla.“
  - možnosti: Oidipus, Perseus ✓, Agamemnón, Hektór (vyměněné)
  - jednoznačná (popis)

### Letní olympijské hry 1992 (sport, hra, Které olympijské hry to jsou?)

- **Před:** „[***] letní olympijské hry se uskutečnily v době od 25. července až do 9. srpna [***], Katalánsko. Zúčastnilo se jich 9 956 sportovců ze 169 zemí.“
  - možnosti: Letní olympijské hry 1984, Letní olympijské hry 1992 ✓, Letní olympijské hry 1996, Letní olympijské hry 1988
  - nevyvrácené: Letní olympijské hry 1984, Letní olympijské hry 1996, Letní olympijské hry 1988
- **Po:** „[***] letní olympijské hry se uskutečnily v době od 25. července až do 9. srpna [***], Katalánsko. Zúčastnilo se jich 9 956 sportovců ze 169 zemí.“ · **rozlišující údaj: Mezi vítězi: Lukáš Pollert**
  - možnosti: Letní olympijské hry 1984, Letní olympijské hry 1992 ✓, Letní olympijské hry 1996, Letní olympijské hry 1988
  - jednoznačná (rozlišující údaj)

### Monika Selešová (sport, hra, Kdo to je?)

- **Před:** „[***] je bývalá jugoslávská a později americká profesionální tenistka, která se narodila maďarským rodičům v Jugoslávii.“
  - možnosti: Serena Williamsová, Billie Jean Kingová, Ana Ivanovićová, Monika Selešová ✓
  - nevyvrácené: Serena Williamsová, Billie Jean Kingová, Ana Ivanovićová
- **Po:** „[***] je bývalá jugoslávská a později americká profesionální tenistka, která se narodila maďarským rodičům v Jugoslávii.“ · **rozlišující údaj: Život: * 1973**
  - možnosti: Coco Gauffová, Billie Jean Kingová, Ana Ivanovićová, Monika Selešová ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)

### Pablo Picasso (umeni, hra, Kdo to je?)

- **Před:** „[***] byl španělský malíř a sochař. Je jednou z nejvýznamnějších osobností umění 20. století. Společně s Georgesem Braquem je považován za zakladatele kubismu.“
  - možnosti: Salvador Dalí, Pablo Picasso ✓, Joan Miró, Juan Gris
  - nevyvrácené: Salvador Dalí, Joan Miró, Juan Gris
- **Po:** „[***] byl španělský malíř a sochař. Je jednou z nejvýznamnějších osobností umění 20. století. Společně s Georgesem Braquem je považován za zakladatele kubismu.“ · **rozlišující údaj: Slavné dílo: Guernica**
  - možnosti: Salvador Dalí, Pablo Picasso ✓, Joan Miró, Juan Gris
  - jednoznačná (rozlišující údaj)

### Andy Warhol (umeni, hra, Kdo to je?)

- **Před:** „[***] byl americký malíř, grafik, filmový tvůrce a vůdčí osobnost amerického hnutí pop-artu. Svou kariéru zahájil jako ilustrátor reklamních předmětů.“
  - možnosti: Robert Indiana, Andy Warhol ✓, Jeff Koons, Roy Lichtenstein
  - nevyvrácené: Robert Indiana, Jeff Koons, Roy Lichtenstein
- **Po:** „[***] byl americký malíř, grafik, filmový tvůrce a vůdčí osobnost amerického hnutí pop-artu. Svou kariéru zahájil jako ilustrátor reklamních předmětů. Později se stal známý po celém světě jako malíř, režisér avantgardních filmů a manažer rockové skupiny The V…“ · **rozlišující údaj: Úmrtí: 1987**
  - možnosti: Robert Indiana, Andy Warhol ✓, James Rosenquist, Roy Lichtenstein (vyměněné)
  - jednoznačná (rozlišující údaj)

### Turecko (zemepis, hra, Co je to za místo?)

- **Před:** „[***] je transkontinentální stát ležící převážně v Anatolii v západní Asii, s menší částí zvanou Východní Thrákie v jihovýchodní Evropě.“
  - možnosti: Stát Palestina, Sýrie, Turecko ✓, Libanon
  - nevyvrácené: Stát Palestina, Sýrie, Libanon
- **Po:** „[***] je transkontinentální stát ležící převážně v Anatolii v západní Asii, s menší částí zvanou Východní Thrákie v jihovýchodní Evropě.“ · **rozlišující údaj: Hlavní město: Ankara**
  - možnosti: Stát Palestina, Sýrie, Turecko ✓, Libanon
  - jednoznačná (rozlišující údaj)

### Izrael (zemepis, hra, Co je to za místo?)

- **Před:** „[***] je stát v jihozápadní Asii. Leží v jižní Levantě na Blízkém východě a sousedí s [***] a Sýrií na severu, [***] na východě, Egyptem na jihozápadě a Středozemním mořem na západě.“
  - možnosti: Stát Palestina, Libanon, Jordánsko, Izrael ✓
  - nevyvrácené: Stát Palestina, Libanon, Jordánsko
- **Po:** „[***] je stát v jihozápadní Asii. Leží v jižní Levantě na Blízkém východě a sousedí s [***] a Sýrií na severu, [***] na východě, Egyptem na jihozápadě a Středozemním mořem na západě.“ · **rozlišující údaj: Hlavní město: Jeruzalém**
  - možnosti: Irák, Libanon, Jordánsko, Izrael ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)


## Zbývající nejednoznačné otázky (21)

Hra je nepoloží tak, jak jsou: v tréninku vezme jinou položku (createRoundData: ambiguous), v denních módech, výzvách a Bossovi, kde je položka daná semínkem, zůstanou s nejlepšími údaji, které jdou; Dobývání místo nich dá místní otázku.

### Varle (biologie, hra, Která část těla to je?)

- **Před:** „[***] je samčí pohlavní žláza obratlovců, tedy i muže. Ve [***] dochází k vývoji mužské pohlavní buňky – spermie. [***] jsou také důležitá endokrinní žláza, která produkuje pohlavní hormony.“
  - možnosti: Varle ✓, Děloha, Vaječník, Játra
  - nevyvrácené: Děloha, Vaječník, Játra
- **Po:** „[***] je samčí pohlavní žláza obratlovců, tedy i muže. Ve [***] dochází k vývoji mužské pohlavní buňky – spermie. [***] jsou také důležitá endokrinní žláza, která produkuje pohlavní hormony.“
  - možnosti: Varle ✓, Děloha, Vaječník, Játra
  - stále nevyvrácené: Děloha, Vaječník, Játra

### Pokožka (biologie, hra, Která část těla to je?)

- **Před:** „[***] je nejsvrchnější vrstva [***]. Tvoří vodotěsný ochranný obal kolem povrchu těla a je tvořena jednak tenkým vrstevnatým epitelem z dlaždicovitých buněk a jednak pod nimi je bazální membrána.“
  - možnosti: Nehet, Kůže, Škára, Pokožka ✓
  - nevyvrácené: Nehet, Kůže, Škára
- **Po:** „[***] je nejsvrchnější vrstva [***]. Tvoří vodotěsný ochranný obal kolem povrchu těla a je tvořena jednak tenkým vrstevnatým epitelem z dlaždicovitých buněk a jednak pod nimi je bazální membrána.“
  - možnosti: Nehet, Kůže, Škára, Pokožka ✓
  - stále nevyvrácené: Nehet, Kůže, Škára

### Bartholiniho žláza (biologie, hra, Která část těla to je?)

- **Před:** „[***] je párová žláza velikosti hrášku nacházející se v oblasti ženských zevních pohlavních orgánů.“
  - možnosti: Mléčná žláza, Cowperova žláza, Předstojná žláza, Bartholiniho žláza ✓
  - nevyvrácené: Mléčná žláza, Cowperova žláza, Předstojná žláza
- **Po:** „[***] je párová žláza velikosti hrášku nacházející se v oblasti ženských zevních pohlavních orgánů.“
  - možnosti: Mléčná žláza, Cowperova žláza, Předstojná žláza, Bartholiniho žláza ✓
  - stále nevyvrácené: Mléčná žláza, Cowperova žláza, Předstojná žláza

### Brazilská krátkosrstá kočka (biologie, hra, Co je to za plemeno?)

- **Před:** „[***] je kočičí plemeno původem z [***]. Je to první uznané kočičí plemeno z [***].“
  - možnosti: Brazilská krátkosrstá kočka ✓, Evropská krátkosrstá kočka, Americký curl, Kartouzská kočka
  - nevyvrácené: Evropská krátkosrstá kočka, Americký curl, Kartouzská kočka
- **Po:** „[***] je kočičí plemeno původem z [***]. Je to první uznané kočičí plemeno z [***].“
  - možnosti: Brazilská krátkosrstá kočka ✓, Evropská krátkosrstá kočka, Americký curl, Kartouzská kočka
  - stále nevyvrácené: Evropská krátkosrstá kočka, Americký curl, Kartouzská kočka

### Mozková hemisféra (biologie, hra, Která část těla to je?)

- **Před:** „[***] je párová struktura koncového [***] obratlovců. U některých nižších obratlovců jsou [***] tvořeny především jádry šedé hmoty, u jiných obratlovců se objevuje na povrchu [***] kůra.“
  - možnosti: Prodloužená mícha, Kalózní těleso, Mozková hemisféra ✓, Mozková kůra
  - nevyvrácené: Prodloužená mícha, Kalózní těleso, Mozková kůra
- **Po:** „[***] je párová struktura koncového [***] obratlovců. U některých nižších obratlovců jsou [***] tvořeny především jádry šedé hmoty, u jiných obratlovců se objevuje na povrchu [***] kůra.“
  - možnosti: Prodloužená mícha, Kalózní těleso, Mozková hemisféra ✓, Mozková kůra
  - stále nevyvrácené: Prodloužená mícha, Kalózní těleso, Mozková kůra

### Hypofýza (biologie, výzva, Která část těla to je?)

- **Před:** „[***] je centrální endokrinní žláza, do velké míry nadřazená všem ostatním žlázám s vnitřní sekrecí v těle.“
  - možnosti: Nadledvina, Štítná žláza, Šišinka, Hypofýza ✓
  - nevyvrácené: Nadledvina, Štítná žláza, Šišinka
- **Po:** „[***] je centrální endokrinní žláza, do velké míry nadřazená všem ostatním žlázám s vnitřní sekrecí v těle.“
  - možnosti: Nadledvina, Štítná žláza, Šišinka, Hypofýza ✓
  - stále nevyvrácené: Nadledvina, Štítná žláza, Šišinka

### Hypothalamus (biologie, výzva, Která část těla to je?)

- **Před:** „[***] je částí mezimozku. Jeho činnost spočívá hlavně ve slaďování jednotlivých vnitřních orgánů do komplexní odpovědi.“
  - možnosti: Amygdala, Hypothalamus ✓, Lidský mozek, Mozek
  - nevyvrácené: Amygdala, Lidský mozek, Mozek
- **Po:** „[***] je částí mezimozku. Jeho činnost spočívá hlavně ve slaďování jednotlivých vnitřních orgánů do komplexní odpovědi.“
  - možnosti: Amygdala, Hypothalamus ✓, Lidský mozek, Mozek
  - stále nevyvrácené: Amygdala, Lidský mozek, Mozek

### Rutherfordův model atomu (chemie, hra, Jaký pojem nebo metoda to je?)

- **Před:** „[***] je [***], který navrhl Ernest [***] v roce 1911 na základě analýzy experimentů Geigera a Marsdena.“
  - možnosti: Boyleův-Mariottův zákon, Lambertův–Beerův zákon, Bohrův model atomu, Rutherfordův model atomu ✓
  - nevyvrácené: Boyleův-Mariottův zákon, Lambertův–Beerův zákon, Bohrův model atomu
- **Po:** „[***] je [***], který navrhl Ernest [***] v roce 1911 na základě analýzy experimentů Geigera a Marsdena.“
  - možnosti: Boyleův-Mariottův zákon, Lambertův–Beerův zákon, Bohrův model atomu, Rutherfordův model atomu ✓
  - stále nevyvrácené: Boyleův-Mariottův zákon, Lambertův–Beerův zákon, Bohrův model atomu

### Gay-Lussacův zákon (chemie, hra, Jaký pojem nebo metoda to je?)

- **Před:** „[***] je termodynamický vztah pro izobarický děj probíhající v ideálním plynu.“
  - možnosti: Raoultův zákon, Periodický zákon, Gay-Lussacův zákon ✓, Charlesův zákon
  - nevyvrácené: Raoultův zákon, Periodický zákon, Charlesův zákon
- **Po:** „[***] je termodynamický vztah pro izobarický děj probíhající v ideálním plynu.“
  - možnosti: Raoultův zákon, Periodický zákon, Gay-Lussacův zákon ✓, Charlesův zákon
  - stále nevyvrácené: Raoultův zákon, Periodický zákon, Charlesův zákon

### Ftaláty (chemie, hra, Jaký pojem nebo metoda to je?)

- **Před:** „Estery kyseliny ftalové.“
  - možnosti: Sulfoxidy, Ftaláty ✓, Chlorid, Aniont
  - nevyvrácené: Sulfoxidy, Chlorid, Aniont
- **Po:** „Estery kyseliny ftalové.“
  - možnosti: Sulfoxidy, Ftaláty ✓, Chlorid, Aniont
  - stále nevyvrácené: Sulfoxidy, Chlorid, Aniont

### Lorentzova síla (fyzika, hra, Který zákon, jev nebo pojem to je?)

- **Před:** „[***] je [***] působící na [***] náboj pohybující se v elektromagnetickém poli, pojmenována po [***] Antoonovi [***].“
  - možnosti: Elektrický proud v plynech, Lorentzova síla ✓, Magnetická levitace, Termoelektrický jev
  - nevyvrácené: Elektrický proud v plynech, Magnetická levitace, Termoelektrický jev
- **Po:** „[***] je [***] působící na [***] náboj pohybující se v elektromagnetickém poli, pojmenována po [***] Antoonovi [***].“
  - možnosti: Elektrický proud v plynech, Lorentzova síla ✓, Magnetická levitace, Termoelektrický jev
  - stále nevyvrácené: Elektrický proud v plynech, Magnetická levitace, Termoelektrický jev

### Thomsonův model atomu (fyzika, hra, Který zákon, jev nebo pojem to je?)

- **Před:** „[***] zvaný [***] navrhl objevitel elektronu [***] v roce 1904 ještě před objevem [***] jádra.“
  - možnosti: Teorie ustáleného stavu, Kodaňská interpretace, Thomsonův model atomu ✓, Rutherfordův model atomu
  - nevyvrácené: Teorie ustáleného stavu, Kodaňská interpretace, Rutherfordův model atomu
- **Po:** „[***] zvaný [***] navrhl objevitel elektronu [***] v roce 1904 ještě před objevem [***] jádra.“
  - možnosti: Teorie ustáleného stavu, Kodaňská interpretace, Thomsonův model atomu ✓, Rutherfordův model atomu
  - stále nevyvrácené: Teorie ustáleného stavu, Kodaňská interpretace, Rutherfordův model atomu

### Gay-Lussacův zákon (fyzika, hra, Který zákon, jev nebo pojem to je?)

- **Před:** „[***] je termodynamický vztah pro izobarický děj probíhající v ideálním plynu.“
  - možnosti: Gay-Lussacův zákon ✓, Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon
  - nevyvrácené: Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon
- **Po:** „[***] je termodynamický vztah pro izobarický děj probíhající v ideálním plynu.“
  - možnosti: Gay-Lussacův zákon ✓, Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon
  - stále nevyvrácené: Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon

### Golem (mytologie, hra, Kdo je to?)

- **Před:** „[***] je v židovské mystice člověkem oživená socha. Takových [***] je známo poměrně dost. Většina lidí si [***] představuje jako oživenou sochu v podobě člověka, ale je to postava mytická, a proto může mít různé podoby.“
  - možnosti: Krakonoš, Jehuda ben Becalel, Neklan, Golem ✓
  - nevyvrácené: Krakonoš, Jehuda ben Becalel, Neklan
- **Po:** „[***] je v židovské mystice člověkem oživená socha. Takových [***] je známo poměrně dost. Většina lidí si [***] představuje jako oživenou sochu v podobě člověka, ale je to postava mytická, a proto může mít různé podoby.“
  - možnosti: Krakonoš, Jehuda ben Becalel, Neklan, Golem ✓
  - stále nevyvrácené: Krakonoš, Jehuda ben Becalel, Neklan

### Sun Wu-kchung (mytologie, hra, Kdo je to?)

- **Před:** „[***] je ústřední postava populárního čínského románu spisovatele [***] Čcheng-ena Putování na západ ze 16. století.“
  - možnosti: Momotaró, Sun Wu-kchung ✓, Šen-nung, Žlutý císař
  - nevyvrácené: Šen-nung, Žlutý císař
- **Po:** „[***] je ústřední postava populárního čínského románu spisovatele [***] Čcheng-ena Putování na západ ze 16. století.“
  - možnosti: Momotaró, Sun Wu-kchung ✓, Šen-nung, Žlutý císař
  - stále nevyvrácené: Šen-nung, Žlutý císař

### Přemysl Oráč (mytologie, hra, Kdo je to?)

- **Před:** „[***] je mytický český vládce, manžel kněžny Libuše a zakladatel nejstarší české vládnoucí dynastie [***].“
  - možnosti: Krakonoš, Přemysl Oráč ✓, Bivoj, Mistr Hanuš
  - nevyvrácené: Krakonoš, Bivoj, Mistr Hanuš
- **Po:** „[***] je mytický český vládce, manžel kněžny Libuše a zakladatel nejstarší české vládnoucí dynastie [***].“
  - možnosti: Krakonoš, Přemysl Oráč ✓, Bivoj, Mistr Hanuš
  - stále nevyvrácené: Krakonoš, Bivoj, Mistr Hanuš

### Černoboh (mytologie, výzva, Kdo je to?)

- **Před:** „[***] bylo božstvo Polabských Slovanů zmiňované ve 12. století Helmoldem z Bosau.“
  - možnosti: Bělbog, Černoboh ✓, Radegast, Rod
  - nevyvrácené: Bělbog, Radegast, Rod
- **Po:** „[***] bylo božstvo Polabských Slovanů zmiňované ve 12. století Helmoldem z Bosau.“
  - možnosti: Bělbog, Černoboh ✓, Radegast, Rod
  - stále nevyvrácené: Bělbog, Radegast, Rod

### Weret Hekau (mytologie, výzva, Kdo je to?)

- **Před:** „[***] byla staroegyptská bohyně. Byla zosobněním nadpřirozených sil.“
  - možnosti: Bat, Mehetveret, Vadžet, Weret Hekau ✓
  - nevyvrácené: Bat, Mehetveret, Vadžet
- **Po:** „[***] byla staroegyptská bohyně. Byla zosobněním nadpřirozených sil.“
  - možnosti: Bat, Mehetveret, Vadžet, Weret Hekau ✓
  - stále nevyvrácené: Bat, Mehetveret, Vadžet

### Amidy (chemie, kvíz dne, Jaký pojem nebo metoda to je?)

- **Před:** „[***] jsou skupina organických i anorganických sloučenin.“
  - možnosti: Monosacharidy, Amidy ✓, Hydroxidy, Polysacharidy
  - nevyvrácené: Monosacharidy, Hydroxidy, Polysacharidy
- **Po:** „[***] jsou skupina organických i anorganických sloučenin.“
  - možnosti: Monosacharidy, Amidy ✓, Hydroxidy, Polysacharidy
  - stále nevyvrácené: Monosacharidy, Hydroxidy, Polysacharidy

### Řetězová reakce (chemie, kvíz dne, Jaká reakce nebo proces to je?)

- **Před:** „[***] je série reakcí, při kterých reaktivní produkt nebo meziprodukt vyvolá další reakci.“
  - možnosti: Substituční reakce, Exotermní reakce, Endotermické reakce, Řetězová reakce ✓
  - nevyvrácené: Substituční reakce, Exotermní reakce, Endotermické reakce
- **Po:** „[***] je série reakcí, při kterých reaktivní produkt nebo meziprodukt vyvolá další reakci.“
  - možnosti: Substituční reakce, Exotermní reakce, Endotermické reakce, Řetězová reakce ✓
  - stále nevyvrácené: Substituční reakce, Exotermní reakce, Endotermické reakce

### Americký pitbulteriér (biologie, kvíz dne, Co je to za plemeno?)

- **Před:** „[***] je plemeno psa ze skupiny teriérů pocházející ze Spojených států amerických.“ · fakta: Výška: až 50 cm; Dožívá se: až 13 let
  - možnosti: Australský ovčák, Americký pitbulteriér ✓, Americký stafordširský teriér, Black and tan coonhound
  - nevyvrácené: Australský ovčák, Americký stafordširský teriér, Black and tan coonhound
- **Po:** „[***] je plemeno psa ze skupiny teriérů pocházející ze Spojených států amerických.“ · fakta: Výška: až 50 cm; Dožívá se: až 13 let
  - možnosti: Australský ovčák, Americký pitbulteriér ✓, Americký stafordširský teriér, Black and tan coonhound
  - stále nevyvrácené: Australský ovčák, Americký stafordširský teriér, Black and tan coonhound


## Otázky, které určí jen popis (203)

Pojmy, procesy, zákony a jevy (Chemický prvek, Fotosyntéza, Ohmův zákon) nemají v datech údaje, které by šly porovnat, a u některých druhů, dinosaurů nebo částí těla údaje z dat podobné možnosti nerozliší: odpověď určí definice či konkrétní údaj z úvodu článku (místo nálezu, rok, orgán, ke kterému část patří), který ale data neobsahují. Audit to strukturovaně ověřit neumí, proto je počítá zvlášť a nepovažuje je za vyřešené ani za nejednoznačné. Hra takovou otázku položí jen s plným úvodem článku (aspoň 14 slov, u položky s údaji navíc s konkrétním údajem); bez Wikipedie (krátký popis z Wikidat) je otázka nejednoznačná a trénink vezme jinou položku.

- chemie – Jaký pojem nebo metoda to je?: 48 (např. Chemický prvek, Sacharidy, Beton)
- mytologie – Kdo je to?: 46 (např. Mnémosyné, Jama, Jehuda ben Becalel)
- chemie – Jaká reakce nebo proces to je?: 35 (např. Dielsova–Alderova reakce, Siemensova-Martinova pec, Mannichova reakce)
- fyzika – Který zákon, jev nebo pojem to je?: 18 (např. Blesk, Radioaktivita, Maxwellovy rovnice)
- biologie – Co je to za pravěkého tvora?: 11 (např. Tyrannosaurus rex, Cryolophosaurus ellioti, Sinosauropteryx)
- fyzika – Co je to za těleso?: 10 (např. Saturn, Betlémská hvězda, Střelec)
- fyzika – Co je to za sondu nebo přístroj?: 8 (např. Apollo 11, Sputnik 1, Tepelné čerpadlo)
- fyzika – Která částice to je?: 5 (např. Atom, Antičástice, Molekula)
- mytologie – Co je to za bytost?: 5 (např. Drak, Mořská panna, Fénix)
- biologie – Co je to za plemeno?: 4 (např. Český teriér, Portugalský ovčák, Portugalský vodní pes)
- biologie – Která část těla to je?: 3 (např. Mozeček, Oko, Močová trubice)
- biologie – Co je to za zvíře?: 3 (např. Ježek ušatý, Skákavka pavoukožravá, Lenochod krátkokrký)
- biologie – Co je to za rostlinu?: 2 (např. Lilek vejcoplodý, Kakost krvavý)
- chemie – Co je to za látku?: 2 (např. Vitamín B6, Trijodamin)
- zemepis – Co je to za místo?: 2 (např. Tasmanovo moře, Disko)
- biologie – Co je to za ptáka?: 1 (např. Papoušek běloskvrnný)
