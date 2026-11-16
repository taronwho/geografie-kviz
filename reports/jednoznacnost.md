# Jednoznačnost otázek

Vygenerováno 2026-11-16 10:40 UTC skriptem `npm run audit:jednoznacnost` (5412 otázek, 715 s). Úplný výpis je v `reports/jednoznacnost.json`.

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
| **Celkem** | 4615 | 2279 | 49.4 % | 17 | 0.4 % | 169 | 202 | 1607 | 1135 | 13 |
| hra | 3579 | 1685 | 47.1 % | 11 | 0.3 % | 116 | 124 | 1180 | 884 | 11 |
| výzva | 430 | 280 | 65.1 % | 3 | 0.7 % | 33 | 15 | 180 | 136 | 1 |
| kvíz dne | 348 | 241 | 69.3 % | 3 | 0.9 % | 20 | 16 | 170 | 115 | 1 |
| Dobývání | 258 | 73 | 28.3 % | 0 | 0.0 % | 0 | 47 | 77 | 0 | 0 |
| druh: ukázka | 237 | 237 | 100.0 % | 0 | 0.0 % | 0 | 0 | 237 | 78 | 0 |
| druh: jméno | 1594 | 13 | 0.8 % | 0 | 0.0 % | 0 | 0 | 0 | 0 | 13 |
| druh: popis | 2784 | 2029 | 72.9 % | 17 | 0.6 % | 169 | 202 | 1370 | 1057 | 0 |
| úroveň Základní (známé) | 1983 | 1027 | 51.8 % | 7 | 0.4 % | 80 | 87 | 748 | 475 | 3 |
| úroveň Mudrlant | 1418 | 679 | 47.9 % | 7 | 0.5 % | 51 | 70 | 467 | 348 | 5 |
| úroveň Mudrlant Expert | 1214 | 573 | 47.2 % | 3 | 0.2 % | 38 | 45 | 392 | 312 | 5 |
| s úvodem z Wikipedie | 4612 | 2278 | 49.4 % | 16 | 0.3 % | 169 | 201 | 1607 | 1135 | 13 |

## Podle témat

| | Otázek | Před: nejednoznačné | Před | Po: nejednoznačné | Po | Po: jen popis | Po: dvěma údaji | S rozlišujícím údajem | Vyměněné možnosti | Otázka se jménem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| architektura | 194 | 52 | 26.8 % | 0 | 0.0 % | 0 | 3 | 52 | 6 | 0 |
| biologie | 368 | 219 | 59.5 % | 8 | 2.2 % | 24 | 15 | 76 | 186 | 0 |
| chemie | 327 | 218 | 66.7 % | 5 | 1.5 % | 85 | 1 | 115 | 50 | 12 |
| film | 428 | 100 | 23.4 % | 0 | 0.0 % | 0 | 1 | 96 | 12 | 0 |
| fyzika | 305 | 214 | 70.2 % | 3 | 1.0 % | 37 | 12 | 149 | 98 | 1 |
| geologie | 332 | 241 | 72.6 % | 0 | 0.0 % | 0 | 3 | 226 | 102 | 0 |
| historie | 438 | 154 | 35.2 % | 0 | 0.0 % | 0 | 14 | 133 | 78 | 0 |
| hudba | 349 | 155 | 44.4 % | 0 | 0.0 % | 0 | 37 | 133 | 58 | 0 |
| literatura | 501 | 178 | 35.5 % | 0 | 0.0 % | 0 | 5 | 125 | 89 | 0 |
| mytologie | 295 | 230 | 78.0 % | 1 | 0.3 % | 21 | 9 | 99 | 176 | 0 |
| sport | 341 | 145 | 42.5 % | 0 | 0.0 % | 0 | 39 | 126 | 62 | 0 |
| umeni | 219 | 137 | 62.6 % | 0 | 0.0 % | 0 | 13 | 135 | 55 | 0 |
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
| historie | Kdo to je? | 147 | 70.7 % | 0.0 % |
| historie | Která bitva, válka nebo revoluce to je? | 49 | 49.0 % | 0.0 % |
| historie | Která událost to je? | 22 | 13.6 % | 0.0 % |
| historie | Který stát to je? | 26 | 88.5 % | 0.0 % |
| historie | Ve kterém dnešním státě byla podepsána? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém dnešním státě se to stalo? | 3 | 0.0 % | 0.0 % |
| historie | Ve kterém století byla podepsána? | 2 | 0.0 % | 0.0 % |
| historie | Ve kterém století nastoupil do úřadu? | 28 | 0.0 % | 0.0 % |
| historie | Ve kterém století nastoupila do úřadu? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém století se narodil? | 43 | 0.0 % | 0.0 % |
| historie | Ve kterém století se narodila? | 10 | 0.0 % | 0.0 % |
| historie | Ve kterém století se to odehrálo? | 36 | 0.0 % | 0.0 % |
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
| mytologie | Co je to za bytost? | 36 | 100.0 % | 0.0 % |
| mytologie | Co je to? | 13 | 100.0 % | 0.0 % |
| mytologie | Jak se jmenuje v řecké mytologii? | 4 | 0.0 % | 0.0 % |
| mytologie | Jak se jmenuje v římské mytologii? | 2 | 0.0 % | 0.0 % |
| mytologie | Kdo je to? | 193 | 93.8 % | 0.5 % |
| mytologie | Ze které mytologie je? | 25 | 0.0 % | 0.0 % |
| mytologie | Ze které mytologie tato bytost pochází? | 22 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1896? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1900? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1964? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1992? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 2020? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1932? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1960? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1992? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 2002? | 1 | 0.0 % | 0.0 % |
| sport | Kdo to je? | 122 | 58.2 % | 0.0 % |
| sport | Která soutěž to je? | 25 | 88.0 % | 0.0 % |
| sport | Které olympijské hry to jsou? | 10 | 30.0 % | 0.0 % |
| sport | Které sportoviště to je? | 52 | 26.9 % | 0.0 % |
| sport | Který klub nebo tým to je? | 44 | 79.5 % | 0.0 % |
| sport | Ve kterém sportu se proslavil? | 45 | 0.0 % | 0.0 % |
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

### Tojoo Itó (architektura, hra, Kdo to je?)

- **Před:** „[***] je japonský architekt, známý svou mimořádně tvořivou koncepční architekturou, v níž usiluje o propojení fyzického světa se světem virtuálním.“
  - možnosti: Tojoo Itó ✓, Riken Jamamoto, Šigeru Ban, Fumihiko Maki
  - nevyvrácené: Riken Jamamoto, Šigeru Ban, Fumihiko Maki
- **Po:** „[***] je japonský architekt, známý svou mimořádně tvořivou koncepční architekturou, v níž usiluje o propojení fyzického světa se světem virtuálním.“ · **rozlišující údaj: Narození: 1941**
  - možnosti: Tojoo Itó ✓, Kengo Kuma, Šigeru Ban, Fumihiko Maki (vyměněné)
  - jednoznačná (rozlišující údaj)

### Alexej Viktorovič Ščusev (architektura, hra, Kdo to je?)

- **Před:** „[***] byl ruský architekt narozený na území dnešního Moldavska. Jeho starší stavby byly navrženy v historizujícím, takzvaně neoruském stylu, později čerpal i ze secese, neoklasicismu, konstruktivismu, aby se nakonec stal klíčovým představitelem architektury s…“
  - možnosti: Lev Vladimirovič Rudněv, Boris Michajlovič Iofan, Alexej Viktorovič Ščusev ✓, Alexandr Tamanjan
  - nevyvrácené: Lev Vladimirovič Rudněv, Boris Michajlovič Iofan, Alexandr Tamanjan
- **Po:** „[***] byl ruský architekt narozený na území dnešního Moldavska. Jeho starší stavby byly navrženy v historizujícím, takzvaně neoruském stylu, později čerpal i ze secese, neoklasicismu, konstruktivismu, aby se nakonec stal klíčovým představitelem architektury s…“ · **rozlišující údaj: Narození: 1873**
  - možnosti: Lev Vladimirovič Rudněv, Boris Michajlovič Iofan, Alexej Viktorovič Ščusev ✓, Konstantin Stěpanovič Melnikov (vyměněné)
  - jednoznačná (rozlišující údaj)

### Pes domácí (biologie, hra, Co je to za zvíře?)

- **Před:** „[***] je největší domestikovaná šelma a jedno z nejstarších domestikovaných zvířat vůbec. Provází člověka minimálně 14 tisíc let.“
  - možnosti: Pes domácí ✓, Pes hyenovitý, Pes bojovný, Pravlk obrovský
  - nevyvrácené: Pes hyenovitý, Pes bojovný, Pravlk obrovský
- **Po:** „[***] je největší domestikovaná šelma a jedno z nejstarších domestikovaných zvířat vůbec. Provází člověka minimálně 14 tisíc let.“
  - možnosti: Pes domácí ✓, Křeček zlatý, Sviňucha obecná, Ptakopysk podivný (vyměněné)
  - jednoznačná (popis)

### Olivovník evropský (biologie, hra, Co je to za rostlinu?)

- **Před:** „[***] je strom z čeledi [***]. Pochází z Asie a Afriky, avšak dnes se s ním běžně setkáme ve středozemních oblastech [***].“
  - možnosti: Olivovník evropský ✓, Majoránka zahradní, Jasan ztepilý, Šalvěj rozmarýna
  - nevyvrácené: Majoránka zahradní, Jasan ztepilý, Šalvěj rozmarýna
- **Po:** „[***] je strom z čeledi [***]. Pochází z Asie a Afriky, avšak dnes se s ním běžně setkáme ve středozemních oblastech [***].“ · **rozlišující údaj: Řád: hluchavkotvaré**
  - možnosti: Olivovník evropský ✓, Rohovník obecný, Čajovník čínský, Brukev zelná (vyměněné)
  - jednoznačná (rozlišující údaj)

### Cesium (chemie, hra, Který prvek to je?)

- **Před:** „[***] je chemický prvek z řady alkalických kovů, vyznačuje se velkou reaktivitou a mimořádně nízkým redoxním potenciálem.“
  - možnosti: Lithium, Draslík, Cesium ✓, Rubidium
  - nevyvrácené: Lithium, Draslík, Rubidium
- **Po:** „[***] je chemický prvek z řady alkalických kovů, vyznačuje se velkou reaktivitou a mimořádně nízkým redoxním potenciálem.“ · **rozlišující údaj: Objevitel: Gustav Kirchhoff, Robert Wilhelm Bunsen**
  - možnosti: Lithium, Draslík, Cesium ✓, Sodík (vyměněné)
  - jednoznačná (rozlišující údaj)

### Olovo (chemie, hra, Který prvek to je?)

- **Před:** „[***] je těžký, jedovatý kov, který je znám lidstvu již od starověku. Má velmi nízkou teplotu tání a je dobře kujný i při pokojové teplotě a odolný vůči korozi.“
  - možnosti: Gallium, Olovo ✓, Cín, Hliník
  - nevyvrácené: Gallium, Cín, Hliník
- **Po:** „[***] je těžký, jedovatý kov, který je znám lidstvu již od starověku. Má velmi nízkou teplotu tání a je dobře kujný i při pokojové teplotě a odolný vůči korozi.“ · **rozlišující údaj: Skupina prvků: nepřechodný kov**
  - možnosti: Zlato, Olovo ✓, Germanium, Uhlík (vyměněné)
  - jednoznačná (rozlišující údaj)

### Cesta do fantazie (film, hra, Který animovaný film to je?)

- **Před:** „[***] je jeden z nejznámějších japonských animovaných filmů vyrobených ve stylu anime. Film režíroval Hajao Mijazaki v produkci studia Ghibli a do kin byl uveden 27. července 2001.“
  - možnosti: Cesta do fantazie ✓, Království koček, Zámek v oblacích, Princezna Mononoke
  - nevyvrácené: Zámek v oblacích, Princezna Mononoke
- **Po:** „[***] je jeden z nejznámějších japonských animovaných filmů vyrobených ve stylu anime. Film režíroval Hajao Mijazaki v produkci studia Ghibli a do kin byl uveden 27. července 2001.“
  - možnosti: Cesta do fantazie ✓, Království koček, Gedo senki, Ponpoko (vyměněné)
  - jednoznačná (popis)

### Christopher Lee (film, hra, Kdo to je?)

- **Před:** „[***] byl britský herec a příležitostný zpěvák. Proslavil se v hororech studia Hammer, například jako „Mumie“ a zejména jako hrabě Drákula.“
  - možnosti: Sean Connery, Christopher Lee ✓, Patrick Stewart, Ian McKellen
  - nevyvrácené: Sean Connery, Patrick Stewart, Ian McKellen
- **Po:** „[***] byl britský herec a příležitostný zpěvák. Proslavil se v hororech studia Hammer, například jako „Mumie“ a zejména jako hrabě Drákula.“ · **rozlišující údaj: Film: Pán prstenů: Společenstvo Prstenu**
  - možnosti: Sean Connery, Christopher Lee ✓, Patrick Stewart, Richard Attenborough (vyměněné)
  - jednoznačná (rozlišující údaj)

### Energie (fyzika, hra, Která veličina to je?)

- **Před:** „[***] je skalární fyzikální veličina, která popisuje schopnost hmoty konat [***]. [***] je slovo vytvořené fyziky v polovině devatenáctého století z řeckého ἐνέργεια.“
  - možnosti: Energie ✓, Teplo, Hmotnost, Práce
  - nevyvrácené: Teplo, Hmotnost, Práce
- **Po:** „[***] je skalární fyzikální veličina, která popisuje schopnost hmoty konat práci. [***] je slovo vytvořené fyziky v polovině devatenáctého století z řeckého ἐνέργεια.“ · **rozlišující údaj: Jednotka SI: joule (J)**
  - možnosti: Energie ✓, Zrychlení, Hmotnost, Vlnová délka (vyměněné)
  - jednoznačná (rozlišující údaj)

### Délka (fyzika, hra, Která veličina to je?)

- **Před:** „[***] je jedna ze základních fyzikálních veličin. Pomocí [***] se vyjadřuje vzájemná poloha a rozprostraněnost objektů v prostoru.“
  - možnosti: Délka ✓, Vzdálenost, Průměr, Hustota
  - nevyvrácené: Vzdálenost, Průměr, Hustota
- **Po:** „[***] je jedna ze základních fyzikálních veličin. Pomocí [***] se vyjadřuje vzájemná poloha a rozprostraněnost objektů v prostoru.“ · **rozlišující údaj: Jednotka SI: metr (m)**
  - možnosti: Délka ✓, Úhlová rychlost, Kinetická energie, Atmosférický tlak (vyměněné)
  - jednoznačná (rozlišující údaj)

### Smaragd (geologie, hra, Co je to za drahý kámen?)

- **Před:** (bez popisu)
  - možnosti: Nefrit, Smaragd ✓, Chryzopras, Vltavín
  - nevyvrácené: Nefrit, Chryzopras, Vltavín
- **Po:** (bez popisu) · **rozlišující údaj: Krystalová soustava: šesterečná**
  - možnosti: Nefrit, Smaragd ✓, Chryzopras, Alexandrit (vyměněné)
  - jednoznačná (rozlišující údaj)

### Citrín (geologie, hra, Co je to za drahý kámen?)

- **Před:** (bez popisu)
  - možnosti: Ametyst, Záhněda, Citrín ✓, Jantar
  - nevyvrácené: Ametyst, Záhněda, Jantar
- **Po:** (bez popisu) · **rozlišující údaj: Barva: žlutý až oranžový**
  - možnosti: Ametyst, Záhněda, Citrín ✓, Tygří oko (vyměněné)
  - jednoznačná (rozlišující údaj)

### Jana z Arku (historie, hra, Kdo to je?)

- **Před:** „[***] byla francouzská hrdinka, která stanula v čele francouzských vojsk za stoleté války v boji proti Angličanům a posléze byla upálena za kacířství.“
  - možnosti: Jana z Arku ✓, Markéta z Valois, Isabela Bourbonská, Markéta Skotská
  - nevyvrácené: Isabela Bourbonská, Markéta Skotská
- **Po:** „[***] byla [***] hrdinka, která stanula v čele [***] vojsk za stoleté války v boji proti Angličanům a posléze byla upálena za kacířství.“ · **rozlišující údaj: Narození: 1412**
  - možnosti: Jana z Arku ✓, Markéta z Valois, Anna Francouzská, Marie Burgundská (vyměněné)
  - jednoznačná (rozlišující údaj)

### Vasco da Gama (historie, hra, Kdo to je?)

- **Před:** „[***] byl jeden z nejvýznamnějších portugalských mořeplavců a objevitelů, od roku 1519 hrabě z Vidigueiry. Byl prvním Evropanem, který se dostal do Indie po moři.“
  - možnosti: Fernão de Magalhães, Afonso de Albuquerque, Vasco da Gama ✓, Bartolomeo Diaz
  - nevyvrácené: Fernão de Magalhães, Afonso de Albuquerque, Bartolomeo Diaz
- **Po:** „[***] byl jeden z nejvýznamnějších portugalských mořeplavců a objevitelů, od roku 1519 hrabě z Vidigueiry. Byl prvním Evropanem, který se dostal do Indie po moři.“ · **rozlišující údaj: Úmrtí: 1525**
  - možnosti: Jindřich Mořeplavec, Nuno Álvares Pereira, Vasco da Gama ✓, Bartolomeo Diaz (vyměněné)
  - jednoznačná (rozlišující údaj)

### Arnold Schoenberg (hudba, hra, Kdo to je?)

- **Před:** „[***] byl rakouský modernistický hudební skladatel, hudební teoretik a příležitostný malíř.“
  - možnosti: Franz Lehár, Arnold Schoenberg ✓, Anton Bruckner, Fritz Kreisler
  - nevyvrácené: Franz Lehár, Anton Bruckner, Fritz Kreisler
- **Po:** „[***] byl rakouský modernistický hudební skladatel, hudební teoretik a příležitostný malíř. Většinu svých hudebních skladeb vytvořil mimo tradiční tonální systém – v takzvaně atonalitě. Vymyslel také metodu hudební skladby dodekafonii používající 12 zrovnoprá…“ · **rozlišující údaj: Život: 1874–1951**
  - možnosti: Max Steiner, Arnold Schoenberg ✓, Anton Bruckner, Fritz Kreisler (vyměněné)
  - jednoznačná (rozlišující údaj)

### Jimi Hendrix (hudba, hra, Kdo to je?)

- **Před:** „[***] byl americký kytarista, zpěvák a skladatel. Je považován za jednoho z nejvýznamnějších a nejvlivnějších kytaristů v historii rockové hudby.“
  - možnosti: Jim Morrison, Jimi Hendrix ✓, Lou Reed, Buddy Holly
  - nevyvrácené: Jim Morrison, Lou Reed, Buddy Holly
- **Po:** „[***] byl americký kytarista, zpěvák a skladatel. Je považován za jednoho z nejvýznamnějších a nejvlivnějších kytaristů v historii rockové hudby. Po uvedení do Rock and Rollové síně slávy v roce 1992 jako člen skupiny [***] o něm instituce prohlásila, že je „…“ · **rozlišující údaj: Život: 1942–1970**
  - možnosti: Steve Morse, Jimi Hendrix ✓, Lou Reed, Buddy Holly (vyměněné)
  - jednoznačná (rozlišující údaj)

### Alice Munroová (literatura, hra, Kdo to je?)

- **Před:** „[***] byla kanadská spisovatelka proslulá především svými povídkami. Třikrát získala nejprestižnější kanadské literární ocenění Governor General's Award a roku 2009 i Mezinárodní Man Bookerovou cenou.“
  - možnosti: Alice Munroová ✓, Lucy Maud Montgomery, Margaret Atwoodová, Nadine Gordimerová
  - nevyvrácené: Lucy Maud Montgomery, Margaret Atwoodová
- **Po:** „[***] byla kanadská spisovatelka proslulá především svými povídkami. Třikrát získala nejprestižnější kanadské literární ocenění Governor General's Award a roku 2009 i Mezinárodní Man Bookerovou cenou.“ · **rozlišující údaj: Život: 1931–2024**
  - možnosti: Alice Munroová ✓, Lucy Maud Montgomery, Agatha Christie, Nadine Gordimerová (vyměněné)
  - jednoznačná (rozlišující údaj)

### Elie Wiesel (literatura, hra, Kdo to je?)

- **Před:** „[***] byl židovský prozaik, esejista, dramatik, filozof, humanista, politický aktivista, náboženský myslitel a nositel Nobelovy ceny za mír.“
  - možnosti: Ray Bradbury, Francis Fukuyama, Gore Vidal, Elie Wiesel ✓
  - nevyvrácené: Ray Bradbury, Francis Fukuyama, Gore Vidal
- **Po:** „[***] byl židovský prozaik, esejista, dramatik, filozof, humanista, politický aktivista, náboženský myslitel a nositel Nobelovy ceny za mír.“ · **rozlišující údaj: Život: 1928–2016**
  - možnosti: Theodore Dreiser, Francis Fukuyama, Jack Kerouac, Elie Wiesel ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)

### Perseus (mytologie, hra, Kdo je to?)

- **Před:** „[***], syn Dia a Danaé, je bájná postava a jeden z nejznámějších hrdinů řecké mytologie a zakladatel Mykén. Je taky pradědem nejslavnějšího řeckého hrdiny Hérakla.“
  - možnosti: Oidipus, Perseus ✓, Iásón, Hektór
  - nevyvrácené: Iásón
- **Po:** „[***], syn Dia a Danaé, je bájná postava a jeden z nejznámějších hrdinů řecké mytologie a zakladatel Mykén. Je taky pradědem nejslavnějšího řeckého hrdiny Hérakla.“
  - možnosti: Oidipus, Perseus ✓, Agamemnón, Hektór (vyměněné)
  - jednoznačná (popis)

### Mínótauros (mytologie, hra, Co je to za bytost?)

- **Před:** „[***] je v řecké mytologii bestie s lidským tělem a býčí hlavou. Narodil se ze spojení bílého býka a krétské královny Pásifaé, její manžel, král [***], jej nechal zavřít do krétského labyrintu, který k tomu účelu postavil Daidalos a Ikaros.“
  - možnosti: Nemejský lev, Mínótauros ✓, Hydra, Siréna
  - nevyvrácené: Siréna
- **Po:** „[***] je v řecké mytologii bestie s lidským tělem a býčí hlavou. Narodil se ze spojení bílého býka a krétské královny Pásifaé, její manžel, král [***], jej nechal zavřít do krétského labyrintu, který k tomu účelu postavil Daidalos a Ikaros.“
  - možnosti: Nemejský lev, Mínótauros ✓, Hydra, Pegas (vyměněné)
  - jednoznačná (popis)

### Monika Selešová (sport, hra, Kdo to je?)

- **Před:** „[***] je bývalá jugoslávská a později americká profesionální tenistka, která se narodila maďarským rodičům v Jugoslávii.“
  - možnosti: Serena Williamsová, Billie Jean Kingová, Ana Ivanovićová, Monika Selešová ✓
  - nevyvrácené: Serena Williamsová, Billie Jean Kingová, Ana Ivanovićová
- **Po:** „[***] je bývalá jugoslávská a později americká profesionální tenistka, která se narodila maďarským rodičům v Jugoslávii.“ · **rozlišující údaj: Život: * 1973**
  - možnosti: Coco Gauffová, Billie Jean Kingová, Ana Ivanovićová, Monika Selešová ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)

### Ronnie O'Sullivan (sport, hra, Kdo to je?)

- **Před:** „[***] je profesionální hráč a sedminásobný mistr světa ve snookeru. Jeho sportovní přezdívka je Raketa.“
  - možnosti: Mark Selby, Steve Davis, Judd Trump, Ronnie O'Sullivan ✓
  - nevyvrácené: Mark Selby, Steve Davis, Judd Trump
- **Po:** „[***] je profesionální hráč a sedminásobný mistr světa ve snookeru. Jeho sportovní přezdívka je Raketa.“ · **rozlišující údaj: Život: * 1975**
  - možnosti: Wayne Rooney, Steve Davis, Judd Trump, Ronnie O'Sullivan ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)

### Andy Warhol (umeni, hra, Kdo to je?)

- **Před:** „[***] byl americký malíř, grafik, filmový tvůrce a vůdčí osobnost amerického hnutí pop-artu. Svou kariéru zahájil jako ilustrátor reklamních předmětů.“
  - možnosti: Robert Indiana, Andy Warhol ✓, Jeff Koons, Roy Lichtenstein
  - nevyvrácené: Robert Indiana, Jeff Koons, Roy Lichtenstein
- **Po:** „[***] byl americký malíř, grafik, filmový tvůrce a vůdčí osobnost amerického hnutí pop-artu. Svou kariéru zahájil jako ilustrátor reklamních předmětů. Později se stal známý po celém světě jako malíř, režisér avantgardních filmů a manažer rockové skupiny The V…“ · **rozlišující údaj: Úmrtí: 1987**
  - možnosti: Robert Indiana, Andy Warhol ✓, James Rosenquist, Roy Lichtenstein (vyměněné)
  - jednoznačná (rozlišující údaj)

### Benvenuto Cellini (umeni, hra, Kdo to je?)

- **Před:** „[***] byl italský zlatník, sochař a spisovatel, který se stal známý svými manýristickými kovovými sochami na přechodu renesance a baroka, šperky a mincemi i knihou Vlastní životopis.“
  - možnosti: Agnolo Bronzino, Giuseppe Arcimboldo, Francesco Primaticcio, Benvenuto Cellini ✓
  - nevyvrácené: Agnolo Bronzino, Giuseppe Arcimboldo, Francesco Primaticcio
- **Po:** „[***] byl italský zlatník, sochař a spisovatel, který se stal známý svými manýristickými kovovými sochami na přechodu renesance a baroka, šperky a mincemi i knihou Vlastní životopis.“ · **rozlišující údaj: Narození: 1500**
  - možnosti: Paolo Veronese, Giuseppe Arcimboldo, Giacomo della Porta, Benvenuto Cellini ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)

### Izrael (zemepis, hra, Co je to za místo?)

- **Před:** „[***] je stát v jihozápadní Asii. Leží v jižní Levantě na Blízkém východě a sousedí s [***] a Sýrií na severu, [***] na východě, Egyptem na jihozápadě a Středozemním mořem na západě.“
  - možnosti: Stát Palestina, Libanon, Jordánsko, Izrael ✓
  - nevyvrácené: Stát Palestina, Libanon, Jordánsko
- **Po:** „[***] je stát v jihozápadní Asii. Leží v jižní Levantě na Blízkém východě a sousedí s [***] a Sýrií na severu, [***] na východě, Egyptem na jihozápadě a Středozemním mořem na západě.“ · **rozlišující údaj: Hlavní město: Jeruzalém**
  - možnosti: Irák, Libanon, Jordánsko, Izrael ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)

### Kuvajt (zemepis, hra, Co je to za místo?)

- **Před:** „[***] je stát v jihozápadní Asii na Blízkém východě. Nachází se na severním okraji [***] poloostrova v cípu Perského zálivu, na severu sousedí s [***] a na jihu se [***].“
  - možnosti: Irák, Saúdská Arábie, Írán, Kuvajt ✓
  - nevyvrácené: Irák, Saúdská Arábie, Írán
- **Po:** „[***] je stát v jihozápadní Asii na Blízkém východě. Nachází se na severním okraji Arabského poloostrova v cípu Perského zálivu, na severu sousedí s Irákem a na jihu se Saúdskou Arábií.“
  - možnosti: Kypr, Egypt, Gruzie, Kuvajt ✓ (vyměněné)
  - jednoznačná (popis)


## Zbývající nejednoznačné otázky (17)

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


## Otázky, které určí jen popis (169)

Pojmy, procesy, zákony a jevy (Chemický prvek, Fotosyntéza, Ohmův zákon) nemají v datech údaje, které by šly porovnat, a u některých druhů, dinosaurů nebo částí těla údaje z dat podobné možnosti nerozliší: odpověď určí definice či konkrétní údaj z úvodu článku (místo nálezu, rok, orgán, ke kterému část patří), který ale data neobsahují. Audit to strukturovaně ověřit neumí, proto je počítá zvlášť a nepovažuje je za vyřešené ani za nejednoznačné. Hra takovou otázku položí jen s plným úvodem článku (aspoň 14 slov, u položky s údaji navíc s konkrétním údajem); bez Wikipedie (krátký popis z Wikidat) je otázka nejednoznačná a trénink vezme jinou položku.

- chemie – Jaký pojem nebo metoda to je?: 48 (např. Chemický prvek, Sacharidy, Beton)
- chemie – Jaká reakce nebo proces to je?: 35 (např. Dielsova–Alderova reakce, Siemensova-Martinova pec, Mannichova reakce)
- fyzika – Který zákon, jev nebo pojem to je?: 18 (např. Blesk, Radioaktivita, Maxwellovy rovnice)
- mytologie – Kdo je to?: 16 (např. Jama, Kuk, Harpokratés)
- biologie – Co je to za pravěkého tvora?: 11 (např. Tyrannosaurus rex, Cryolophosaurus ellioti, Sinosauropteryx)
- fyzika – Co je to za těleso?: 9 (např. Betlémská hvězda, Střelec, Kentaur)
- fyzika – Která částice to je?: 5 (např. Atom, Antičástice, Molekula)
- fyzika – Co je to za sondu nebo přístroj?: 5 (např. Tepelné čerpadlo, Galvanometr, Refraktor)
- mytologie – Co je to za bytost?: 5 (např. Drak, Mořská panna, Fénix)
- biologie – Co je to za plemeno?: 4 (např. Český teriér, Portugalský ovčák, Portugalský vodní pes)
- biologie – Která část těla to je?: 3 (např. Mozeček, Oko, Močová trubice)
- biologie – Co je to za zvíře?: 3 (např. Ježek ušatý, Skákavka pavoukožravá, Lenochod krátkokrký)
- biologie – Co je to za rostlinu?: 2 (např. Lilek vejcoplodý, Kakost krvavý)
- chemie – Co je to za látku?: 2 (např. Vitamín B6, Trijodamin)
- zemepis – Co je to za místo?: 2 (např. Tasmanovo moře, Disko)
- biologie – Co je to za ptáka?: 1 (např. Papoušek běloskvrnný)
