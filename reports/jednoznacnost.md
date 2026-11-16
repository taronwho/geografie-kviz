# Jednoznačnost otázek

Vygenerováno 2026-11-16 13:06 UTC skriptem `npm run audit:jednoznacnost` (5407 otázek, 775 s). Úplný výpis je v `reports/jednoznacnost.json`.

Popis otázky: úvod článku z Wikipedie u 5250 otázek (tests/wiki-intros.json a jedno-uvody.json, stažené z cs.wikipedia.org volbou --fetch stejným dotazem jako aplikace), u ostatních krátký popis z Wikidat, jako když se Wikipedie nenačte.

## Pravidlo

Před první nápovědou musí otázka ukázat aspoň jeden údaj, který platí pro správnou odpověď a pro žádnou ze tří nesprávných. Posuzuje se, co hráč vidí bez nápovědy: zadání a štítek, zakrytý popis, fakta ukázaná hned u chudého popisu, rozlišující údaj a obrázek otázky. Nesprávná možnost je vyvrácená, když má v datech některý ukázaný údaj jasně jinak (rok o 10 a víc let u novověku, u starších dob víc; funkční období a doba trvání bez překryvu; číslo aspoň 1,5×; jiný stát nebo třída; dílo, které v jejích datech není a v jehož datech není ona). Z volného textu se počítá jen údaj z dat správné odpovědi, který text zmiňuje (rok, číslo, název díla, místo, národnost). Otázka je nejednoznačná, když některou nesprávnou možnost nevyvrací nic.

Druhy otázek: **popis** = otázka na název bez obrázku (posuzuje se strukturovaně), **ukázka** = obrázek jen ukazuje druh (nerost, hornina, sloh), posuzuje se jako popis; **jméno** = zvláštní otázka se jménem položky (Kdo film režíroval?, Ve kterém století?): odpověď určí jméno, nejednoznačná je, jen když ji v datech splňuje i nesprávná možnost (spolurežisér). Otázky s obrázkem věci samé (obraz, vlajka, stavba), mapové a místní otázky Dobývání se nepočítají.

## Úprava (stav „po“)

1. **Prodloužení popisu:** obecný popis (jen povolání či druh, bez roku, čísla, jména a názvu díla) převezme další věty úvodu, dokud v něm konkrétní údaj nebude; převzaté věty v nápovědě Další věty už nejsou.
2. **Rozlišující údaj:** když popis a fakta ukázaná hned odpověď neurčí, ukáže se hned pod záložkami údaj z dat, který všechny nevyvrácené možnosti vyvrací: dílo či role („Film: Císařův pekař – Pekařův císař“), roky (jen jasně jiné), místo, ocenění, autor, sloh, velikost, země. Nikdy jméno ani nic, co odpověď obsahuje (stejné kontroly jako fakta: factRevealsAnswer, answerWordsLeft). Nápověda Fakta ho už neopakuje.
3. **Dva údaje spolu:** když jeden údaj nevyvrátí všechny tři, ukážou se dva, z nichž každý vyvrací část (například rok narození a země).
4. **Výměna jedné možnosti:** teprve když ani dva údaje nestačí a nevyvrácená zbývá jediná možnost, vymění se za co nejpodobnější položku stejného druhu, pohlaví a skupiny (třída, řád, čeleď, sport, mytologie, skupina prvků, stát, kontinent, jednotka, sloh, směr…) a okruhu, kterou vyvrací jemnější ukázaný údaj (rok, číslo, dílo, rodiče) – skupina sama ne, takže otázka zůstane stejně těžká. Výzvy a denní módy rozhodují o výměně jen podle dat a krátkého popisu z Wikidat, takže mají všichni hráči stejné možnosti.
5. **Otázka se jménem, nebo víc výměn:** když by se musely vyměnit dvě nebo tři možnosti, položka se radši zeptá jinou otázkou tématu se svým jménem (Do kterého řádu patří?, Jaká je jednotka SI této veličiny?); když ta není, vymění se až tři možnosti se stejnými pravidly, a když ani to nejde, otázka je nejednoznačná: trénink vezme jinou položku, kde je položka daná semínkem (denní módy, výzvy), zůstanou nejlepší údaje, které jdou.
6. **Denní módy** mění možnosti jen se stabilními možnostmi denni-mody (Dnešní otázky, Kvíz dne a Tajemná otázka od 17. 11. 2026, Boss od týdne 23. 11. 2026), ať se dnešní sada nezmění; rozlišující údaj a prodloužený popis ukážou hned. Dobývání má pevné možnosti: chybí-li údaj, který je vyvrátí, dá místo otázky Mudrlanta místní otázku.

## Souhrn

| | Otázek | Před: nejednoznačné | Před | Po: nejednoznačné | Po | Po: jen popis | S rozlišujícím údajem | z toho dva údaje | Vyměněné možnosti | Podíl výměn | Výměna mimo skupinu | Otázka se jménem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Celkem** | 4672 | 2319 | 49.6 % | 62 | 1.3 % | 293 | 1514 | 125 | 468 | 10.0 % | 0 | 334 |
| hra | 3574 | 1679 | 47.0 % | 39 | 1.1 % | 203 | 1053 | 80 | 366 | 10.2 % | 0 | 285 |
| výzva | 430 | 278 | 64.7 % | 13 | 3.0 % | 56 | 173 | 14 | 56 | 13.0 % | 0 | 25 |
| kvíz dne | 348 | 229 | 65.8 % | 10 | 2.9 % | 34 | 150 | 11 | 46 | 13.2 % | 0 | 24 |
| Dobývání | 320 | 133 | 41.6 % | 0 | 0.0 % | 0 | 138 | 20 | 0 | 0.0 % | 0 | 0 |
| druh: ukázka | 225 | 225 | 100.0 % | 3 | 1.3 % | 0 | 222 | 24 | 36 | 16.0 % | 0 | 0 |
| druh: jméno | 1910 | 334 | 17.5 % | 0 | 0.0 % | 0 | 0 | 0 | 0 | 0.0 % | 0 | 334 |
| druh: popis | 2537 | 1760 | 69.4 % | 59 | 2.3 % | 293 | 1292 | 101 | 432 | 17.0 % | 0 | 0 |
| úroveň Základní (známé) | 2033 | 1056 | 51.9 % | 27 | 1.3 % | 134 | 733 | 63 | 189 | 9.3 % | 0 | 124 |
| úroveň Mudrlant | 1430 | 691 | 48.3 % | 22 | 1.5 % | 84 | 453 | 38 | 149 | 10.4 % | 0 | 102 |
| úroveň Mudrlant Expert | 1209 | 572 | 47.3 % | 13 | 1.1 % | 75 | 328 | 24 | 130 | 10.8 % | 0 | 108 |
| s úvodem z Wikipedie | 4515 | 2209 | 48.9 % | 58 | 1.3 % | 293 | 1421 | 116 | 448 | 9.9 % | 0 | 328 |

## Podle témat

| | Otázek | Před: nejednoznačné | Před | Po: nejednoznačné | Po | Po: jen popis | S rozlišujícím údajem | z toho dva údaje | Vyměněné možnosti | Podíl výměn | Výměna mimo skupinu | Otázka se jménem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| architektura | 194 | 52 | 26.8 % | 0 | 0.0 % | 1 | 51 | 2 | 3 | 1.5 % | 0 | 0 |
| biologie | 368 | 218 | 59.2 % | 24 | 6.5 % | 39 | 28 | 4 | 24 | 6.5 % | 0 | 127 |
| chemie | 327 | 218 | 66.7 % | 5 | 1.5 % | 88 | 118 | 7 | 33 | 10.1 % | 0 | 5 |
| film | 428 | 100 | 23.4 % | 0 | 0.0 % | 0 | 93 | 2 | 6 | 1.4 % | 0 | 4 |
| fyzika | 305 | 212 | 69.5 % | 5 | 1.6 % | 40 | 136 | 9 | 58 | 19.0 % | 0 | 19 |
| geologie | 327 | 238 | 72.8 % | 4 | 1.2 % | 2 | 209 | 24 | 55 | 16.8 % | 0 | 11 |
| historie | 438 | 152 | 34.7 % | 0 | 0.0 % | 0 | 107 | 8 | 42 | 9.6 % | 0 | 32 |
| hudba | 349 | 152 | 43.6 % | 2 | 0.6 % | 3 | 122 | 4 | 35 | 10.0 % | 0 | 15 |
| literatura | 501 | 176 | 35.1 % | 0 | 0.0 % | 1 | 105 | 1 | 29 | 5.8 % | 0 | 56 |
| mytologie | 295 | 230 | 78.0 % | 14 | 4.7 % | 96 | 56 | 2 | 53 | 18.0 % | 0 | 34 |
| sport | 341 | 143 | 41.9 % | 2 | 0.6 % | 11 | 111 | 8 | 29 | 8.5 % | 0 | 12 |
| umeni | 219 | 137 | 62.6 % | 6 | 2.7 % | 1 | 130 | 14 | 37 | 16.9 % | 0 | 0 |
| vlajky | 0 | 0 | – | 0 | – | 0 | 0 | 0 | 0 | – | 0 | 0 |
| zemepis | 580 | 291 | 50.2 % | 0 | 0.0 % | 11 | 248 | 40 | 64 | 11.0 % | 0 | 19 |

## Podle témat a druhů otázek

| Téma | Druh otázky | Otázek | Před | Po |
|---|---|---:|---:|---:|
| architektura | Jaký je to sloh? | 110 | 0.0 % | 0.0 % |
| architektura | Kdo ji navrhl? | 22 | 0.0 % | 0.0 % |
| architektura | Kdo to je? | 41 | 75.6 % | 0.0 % |
| architektura | Který sloh to je? | 21 | 100.0 % | 0.0 % |
| biologie | Co je to za houbu? | 11 | 81.8 % | 27.3 % |
| biologie | Co je to za plemeno? | 15 | 93.3 % | 26.7 % |
| biologie | Co je to za pravěkého tvora? | 15 | 100.0 % | 0.0 % |
| biologie | Co je to za ptáka? | 10 | 40.0 % | 0.0 % |
| biologie | Co je to za rostlinu? | 10 | 90.0 % | 40.0 % |
| biologie | Co je to za rybu? | 12 | 83.3 % | 16.7 % |
| biologie | Co je to za zvíře? | 24 | 75.0 % | 20.8 % |
| biologie | Do které čeledi patří? | 64 | 51.6 % | 0.0 % |
| biologie | Do kterého řádu patří? | 179 | 47.5 % | 0.0 % |
| biologie | Která část těla to je? | 12 | 100.0 % | 50.0 % |
| biologie | Ze které země plemeno pochází? | 16 | 56.3 % | 0.0 % |
| chemie | Co je to za látku? | 85 | 77.6 % | 0.0 % |
| chemie | Jakou značku má tento prvek? | 15 | 20.0 % | 0.0 % |
| chemie | Jaká reakce nebo proces to je? | 36 | 100.0 % | 2.8 % |
| chemie | Jaký pojem nebo metoda to je? | 52 | 100.0 % | 7.7 % |
| chemie | Jaký vzorec má tato látka? | 73 | 2.7 % | 0.0 % |
| chemie | Kdo to je? | 47 | 91.5 % | 0.0 % |
| chemie | Který prvek to je? | 19 | 84.2 % | 0.0 % |
| film | Kdo film režíroval? | 41 | 2.4 % | 0.0 % |
| film | Kdo napsal scénář seriálu? | 4 | 0.0 % | 0.0 % |
| film | Kdo seriál vytvořil? | 12 | 0.0 % | 0.0 % |
| film | Kdo to je? | 83 | 56.6 % | 0.0 % |
| film | Které studio film natočilo? | 20 | 0.0 % | 0.0 % |
| film | Který animovaný film to je? | 26 | 42.3 % | 0.0 % |
| film | Který film to je? | 84 | 19.0 % | 0.0 % |
| film | Který seriál to je? | 27 | 81.5 % | 0.0 % |
| film | Ve kterém desetiletí měl premiéru? | 98 | 1.0 % | 0.0 % |
| film | Ve kterém desetiletí se začal vysílat? | 33 | 6.1 % | 0.0 % |
| fyzika | Co je to za sondu nebo přístroj? | 17 | 94.1 % | 0.0 % |
| fyzika | Co je to za těleso? | 48 | 70.8 % | 0.0 % |
| fyzika | Co je to za vynález? | 15 | 93.3 % | 0.0 % |
| fyzika | Co měří tato jednotka? | 13 | 15.4 % | 0.0 % |
| fyzika | Jakou značku má tato jednotka? | 22 | 36.4 % | 0.0 % |
| fyzika | Jaká je jednotka SI této veličiny? | 21 | 42.9 % | 0.0 % |
| fyzika | Kdo to je? | 92 | 90.2 % | 0.0 % |
| fyzika | Kdo to vynalezl? | 13 | 0.0 % | 0.0 % |
| fyzika | Která jednotka to je? | 6 | 66.7 % | 0.0 % |
| fyzika | Která veličina to je? | 9 | 88.9 % | 0.0 % |
| fyzika | Která částice to je? | 9 | 100.0 % | 22.2 % |
| fyzika | Který zákon, jev nebo pojem to je? | 25 | 100.0 % | 12.0 % |
| fyzika | Ve kterém desetiletí to bylo vynalezeno? | 7 | 0.0 % | 0.0 % |
| fyzika | Ve kterém století to bylo vynalezeno? | 8 | 0.0 % | 0.0 % |
| geologie | Co je to za drahý kámen? | 21 | 100.0 % | 0.0 % |
| geologie | Co je to za horninu? | 33 | 100.0 % | 0.0 % |
| geologie | Co je to za nerost? | 70 | 100.0 % | 0.0 % |
| geologie | Co je to za zkamenělinu nebo organismus? | 19 | 100.0 % | 5.3 % |
| geologie | Co je to za útvar nebo jev? | 61 | 100.0 % | 3.3 % |
| geologie | Do které skupiny hornin patří? | 27 | 18.5 % | 0.0 % |
| geologie | Jakou má tvrdost podle Mohse? | 8 | 0.0 % | 0.0 % |
| geologie | Jaký má vzorec? | 61 | 9.8 % | 0.0 % |
| geologie | Které je to období? | 27 | 85.2 % | 3.7 % |
| historie | Kdo to je? | 132 | 66.7 % | 0.0 % |
| historie | Která bitva, válka nebo revoluce to je? | 46 | 43.5 % | 0.0 % |
| historie | Která událost to je? | 22 | 13.6 % | 0.0 % |
| historie | Který stát to je? | 12 | 75.0 % | 0.0 % |
| historie | Ve kterém dnešním státě byla podepsána? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém dnešním státě se to stalo? | 3 | 0.0 % | 0.0 % |
| historie | Ve kterém století byla podepsána? | 2 | 0.0 % | 0.0 % |
| historie | Ve kterém století nastoupil do úřadu? | 31 | 9.7 % | 0.0 % |
| historie | Ve kterém století nastoupila do úřadu? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém století se narodil? | 51 | 15.7 % | 0.0 % |
| historie | Ve kterém století se narodila? | 12 | 16.7 % | 0.0 % |
| historie | Ve kterém století se to odehrálo? | 39 | 7.7 % | 0.0 % |
| historie | Ve kterém století se to stalo? | 8 | 0.0 % | 0.0 % |
| historie | Ve kterém století tento stát vznikl? | 31 | 45.2 % | 0.0 % |
| historie | Ve kterém století to začalo? | 3 | 0.0 % | 0.0 % |
| historie | Ve kterém století začal vládnout? | 37 | 0.0 % | 0.0 % |
| historie | Ve kterém století začala vládnout? | 1 | 0.0 % | 0.0 % |
| historie | Ve kterém století zemřel? | 6 | 33.3 % | 0.0 % |
| hudba | Co je to za kapelu? | 51 | 41.2 % | 0.0 % |
| hudba | Do kterého hudebního období patří? | 17 | 5.9 % | 0.0 % |
| hudba | Kdo to je? | 120 | 74.2 % | 1.7 % |
| hudba | Kdo to složil? | 34 | 14.7 % | 0.0 % |
| hudba | Která opera nebo muzikál to je? | 26 | 42.3 % | 0.0 % |
| hudba | Které dílo to je? | 34 | 47.1 % | 0.0 % |
| hudba | Ve kterém století měla premiéru? | 26 | 0.0 % | 0.0 % |
| hudba | Čí je to album? | 31 | 29.0 % | 0.0 % |
| hudba | Čí je to píseň? | 10 | 0.0 % | 0.0 % |
| literatura | Kdo to je? | 103 | 92.2 % | 0.0 % |
| literatura | Kdo to napsal? | 122 | 30.3 % | 0.0 % |
| literatura | Kdo tuto postavu vymyslel? | 29 | 34.5 % | 0.0 % |
| literatura | Která postava to je? | 8 | 12.5 % | 0.0 % |
| literatura | Které dílo to je? | 56 | 42.9 % | 0.0 % |
| literatura | Ve kterém století dílo vzniklo? | 80 | 0.0 % | 0.0 % |
| literatura | Ve kterém století se narodil? | 50 | 6.0 % | 0.0 % |
| literatura | Ve kterém století se narodila? | 18 | 16.7 % | 0.0 % |
| literatura | Ve kterém století žil? | 27 | 3.7 % | 0.0 % |
| literatura | Ve kterém století žila? | 1 | 0.0 % | 0.0 % |
| literatura | Ze kterého díla je tato postava? | 7 | 28.6 % | 0.0 % |
| mytologie | Co je to za bytost? | 15 | 100.0 % | 13.3 % |
| mytologie | Co je to? | 1 | 100.0 % | 0.0 % |
| mytologie | Jak se jmenuje v řecké mytologii? | 4 | 0.0 % | 0.0 % |
| mytologie | Jak se jmenuje v římské mytologii? | 2 | 0.0 % | 0.0 % |
| mytologie | Kdo je to? | 192 | 93.8 % | 6.3 % |
| mytologie | Ze které mytologie je? | 38 | 34.2 % | 0.0 % |
| mytologie | Ze které mytologie tato bytost pochází? | 43 | 48.8 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1896? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1900? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1964? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 1992? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly letní olympijské hry 2020? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1932? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1960? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 1992? | 1 | 0.0 % | 0.0 % |
| sport | Kde se konaly zimní olympijské hry 2002? | 1 | 0.0 % | 0.0 % |
| sport | Kdo to je? | 110 | 53.6 % | 0.9 % |
| sport | Která soutěž to je? | 25 | 88.0 % | 0.0 % |
| sport | Které olympijské hry to jsou? | 10 | 30.0 % | 0.0 % |
| sport | Které sportoviště to je? | 52 | 26.9 % | 0.0 % |
| sport | Který klub nebo tým to je? | 44 | 75.0 % | 2.3 % |
| sport | Ve kterém sportu se proslavil? | 51 | 11.8 % | 0.0 % |
| sport | Ve kterém sportu se proslavila? | 40 | 15.0 % | 0.0 % |
| umeni | Jaký je to umělecký směr? | 17 | 94.1 % | 0.0 % |
| umeni | Kdo to je? | 152 | 79.6 % | 3.9 % |
| umeni | Kdo to namaloval? | 31 | 0.0 % | 0.0 % |
| umeni | Kdo vytvořil tuto sochu? | 3 | 0.0 % | 0.0 % |
| umeni | Ke kterému uměleckému směru patří? | 16 | 0.0 % | 0.0 % |
| zemepis | Co je to za místo? | 452 | 60.2 % | 0.0 % |
| zemepis | Ve kterém státě to je? | 128 | 14.8 % | 0.0 % |

Nepočítané otázky (odpověď určí obrázek věci samé, mapa nebo místní otázka Dobývání): obrázek 562, místní 173.

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

### Edmontosaurus (biologie, hra, Co je to za pravěkého tvora?)

- **Před:** „[***] byl rod velkého kachnozobého dinosaura, představujícího jednoho z geologicky nejmladších známých neptačích dinosaurů, žijících na samotném konci křídového období na území Severní Ameriky.“
  - možnosti: Edmontosaurus ✓, Corythosaurus, Maiasaura, Parasaurolophus
  - nevyvrácené: Corythosaurus, Maiasaura, Parasaurolophus
- **Po:** „[***] byl rod velkého kachnozobého dinosaura, představujícího jednoho z geologicky nejmladších známých neptačích dinosaurů, žijících na samotném konci křídového období na území Severní Ameriky.“ · **rozlišující údaj: Délka: až 13 m**
  - možnosti: Edmontosaurus ✓, Pachycephalosaurus, Ankylosaurus, Protoceratops (vyměněné)
  - jednoznačná (rozlišující údaj)

### Vodík (chemie, hra, Který prvek to je?)

- **Před:** „[***] je nejlehčí a nejjednodušší plynný chemický prvek. Tvoří převážnou část hmoty ve vesmíru. Elementární [***] má široké praktické využití: zdroj energie, redukční činidlo v chemické syntéze nebo metalurgii a také jako náplň meteorologických a pouťových ba…“
  - možnosti: Uhlík, Kyslík, Síra, Vodík ✓
  - nevyvrácené: Uhlík, Kyslík, Síra
- **Po:** „[***] je nejlehčí a nejjednodušší plynný chemický prvek. Tvoří převážnou část hmoty ve vesmíru. Elementární [***] má široké praktické využití: zdroj energie, redukční činidlo v chemické syntéze nebo metalurgii a také jako náplň meteorologických a pouťových ba…“ · **rozlišující údaj: Objevitel: Henry Cavendish**
  - možnosti: Uhlík, Kyslík, Síra, Vodík ✓
  - jednoznačná (rozlišující údaj)

### Kortizol (chemie, hra, Co je to za látku?)

- **Před:** „[***] je nejúčinnějším hormonem ze skupiny glukokortikoidů produkovaných kůrou nadledvin.“ · fakta: Molární hmotnost: 362,47 g/mol; Vzorec: C₂₁H₃₀O₅
  - možnosti: Testosteron, Progesteron, Kortizol ✓, Glycin
  - nevyvrácené: Progesteron
- **Po:** „[***] je nejúčinnějším hormonem ze skupiny glukokortikoidů produkovaných kůrou nadledvin.“ · fakta: Molární hmotnost: 362,47 g/mol; Vzorec: C₂₁H₃₀O₅
  - možnosti: Testosteron, Histamin, Kortizol ✓, Glycin (vyměněné)
  - jednoznačná (fakta)

### Harry Potter a Tajemná komnata (film, hra, Který film to je?)

- **Před:** „[***] je britsko-americký film natočený podle stejnojmenné předlohy britské spisovatelky J. K. Rowlingové.“ · fakta: Rok: 2002; Žánr: fantasy, dobrodružný film; Země: Spojené státy americké, Spojené království
  - možnosti: Pán prstenů: Společenstvo Prstenu, Harry Potter a vězeň z Azkabanu, Harry Potter a Tajemná komnata ✓, Mumie
  - nevyvrácené: Pán prstenů: Společenstvo Prstenu, Harry Potter a vězeň z Azkabanu, Mumie
- **Po:** „[***] je britsko-americký film natočený podle stejnojmenné předlohy britské spisovatelky J. K. Rowlingové.“ · **rozlišující údaj: Režie: Chris Columbus** · fakta: Rok: 2002; Žánr: fantasy, dobrodružný film; Země: Spojené státy americké, Spojené království
  - možnosti: Pán prstenů: Společenstvo Prstenu, Harry Potter a vězeň z Azkabanu, Harry Potter a Tajemná komnata ✓, Mumie
  - jednoznačná (rozlišující údaj)

### Oldřich Kaiser (film, hra, Kdo to je?)

- **Před:** „[***] je český herec, zpěvák a komik, držitel čtyř Českých lvů v hereckých kategoriích.“ · fakta: Filmy: Obsluhoval jsem anglického krále, Tmavomodrý svět, Rumburak
  - možnosti: Oldřich Kaiser ✓, Miroslav Donutil, Jiří Lábus, Jiří Bartoška
  - nevyvrácené: Jiří Lábus
- **Po:** „[***] je český herec, zpěvák a komik, držitel čtyř Českých lvů v hereckých kategoriích.“ · fakta: Filmy: Obsluhoval jsem anglického krále, Tmavomodrý svět, Rumburak
  - možnosti: Oldřich Kaiser ✓, Miroslav Donutil, Bolek Polívka, Jiří Bartoška (vyměněné)
  - jednoznačná (fakta)

### Radián (fyzika, hra, Která jednotka to je?)

- **Před:** „[***] je bezrozměrová odvozená jednotka soustavy SI velikosti rovinného úhlu. Používá se pro něj značka [***]. 1 [***] je velikost středového úhlu, který přísluší oblouku o stejné délce, jako je poloměr kružnice.“
  - možnosti: Stupeň, Radián ✓, Coulomb, Ohm
  - nevyvrácené: Coulomb, Ohm
- **Po:** „[***] je bezrozměrová odvozená jednotka soustavy SI velikosti rovinného úhlu. Používá se pro něj značka [***]. 1 [***] je velikost středového úhlu, který přísluší oblouku o stejné délce, jako je poloměr kružnice.“ · **rozlišující údaj: Veličina: úhlová vzdálenost**
  - možnosti: Stupeň, Radián ✓, Coulomb, Ohm
  - jednoznačná (rozlišující údaj)

### Hybnost (fyzika, hra, Která veličina to je?)

- **Před:** „[***] je fyzikální veličina, která popisuje pohybový stav tělesa či fyzikálního pole. Její definice se mohou významně lišit v závislosti na fyzikálním oboru či popisovaném objektu.“
  - možnosti: Hybnost ✓, Moment setrvačnosti, Kinetická energie, Síla
  - nevyvrácené: Moment setrvačnosti, Kinetická energie, Síla
- **Po:** „[***] je fyzikální veličina, která popisuje pohybový stav tělesa či fyzikálního pole. Její definice se mohou významně lišit v závislosti na fyzikálním oboru či popisovaném objektu.“ · **rozlišující údaj: Jednotka SI: kilogram metr za sekundu (kg·m/s)**
  - možnosti: Hybnost ✓, Elektrický výkon, Kinetická energie, Síla (vyměněné)
  - jednoznačná (rozlišující údaj)

### Diamant (geologie, hra, Co je to za drahý kámen?)

- **Před:** (bez popisu)
  - možnosti: Diamant ✓, Topaz, Citrín, Hyalit
  - nevyvrácené: Topaz, Citrín, Hyalit
- **Po:** (bez popisu) · **rozlišující údaj: Třída: prvky**
  - možnosti: Diamant ✓, Topaz, Citrín, Hyalit
  - jednoznačná (rozlišující údaj)

### Slepenec (geologie, hra, Co je to za horninu?)

- **Před:** (bez popisu)
  - možnosti: Travertin, Brekcie, Slepenec ✓, Písek
  - nevyvrácené: Travertin, Brekcie, Písek
- **Po:** (bez popisu) · **rozlišující údaj: Složení: zaoblené valouny stmelené tmelem**
  - možnosti: Travertin, Bauxit, Slepenec ✓, Písek (vyměněné)
  - jednoznačná (rozlišující údaj)

### Alexandr Veliký (historie, hra, Kdo to je?)

- **Před:** „[***], ), byl král Makedonie. [***] rozšířil hranice své říše tažením do Persie a na indický subkontinent, díky čemuž se stal zřejmě největším a nejúspěšnějším vojevůdcem celé historie, který neprohrál žádnou bitvu.“
  - možnosti: Filip II. Makedonský, Ptolemaios I. Sótér, Alexandr IV. Aigos, Alexandr Veliký ✓
  - nevyvrácené: Filip II. Makedonský, Ptolemaios I. Sótér, Alexandr IV. Aigos
- **Po:** „[***], ), byl král Makedonie. [***] rozšířil hranice své říše tažením do Persie a na indický subkontinent, díky čemuž se stal zřejmě největším a nejúspěšnějším vojevůdcem celé historie, který neprohrál žádnou bitvu.“ · **rozlišující údaj: Vláda: 335–322 př. n. l.**
  - možnosti: Filip II. Makedonský, Ptolemaios I. Sótér, Alexandr IV. Aigos, Alexandr Veliký ✓
  - jednoznačná (rozlišující údaj)

### Incká říše (historie, hra, Který stát to je?)

- **Před:** „[***] byl státní útvar v Jižní Americe, rozkládající se v hornatých andských oblastech na území dnešních států Kolumbie, Ekvádoru, Peru, Bolívie, Chile a Argentiny.“
  - možnosti: Incká říše ✓, Španělské impérium, Krymský chanát, Kazaňský chanát
  - nevyvrácené: Španělské impérium, Krymský chanát, Kazaňský chanát
- **Po:** „[***] byl státní útvar v Jižní Americe, rozkládající se v hornatých andských oblastech na území dnešních států Kolumbie, Ekvádoru, Peru, Bolívie, Chile a Argentiny.“ · **rozlišující údaj: Hlavní město: Cuzco**
  - možnosti: Incká říše ✓, Portugalská koloniální říše, Krymský chanát, Kazaňský chanát (vyměněné)
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
  - možnosti: Alban Berg, Arnold Schoenberg ✓, Anton Bruckner, Fritz Kreisler (vyměněné)
  - jednoznačná (rozlišující údaj)

### Franz Kafka (literatura, hra, Kdo to je?)

- **Před:** „[***], židovským jménem Anšel, byl český německy píšící židovský spisovatel. Je považován za jednoho z literárně nejvlivnějších spisovatelů 20. století, byl členem Pražského kruhu.“
  - možnosti: Franz Kafka ✓, Josef Lada, Jaroslav Hašek, Franz Werfel
  - nevyvrácené: Josef Lada, Jaroslav Hašek, Franz Werfel
- **Po:** „[***], židovským jménem Anšel, byl český německy píšící židovský spisovatel. Je považován za jednoho z literárně nejvlivnějších spisovatelů 20. století, byl členem Pražského kruhu.“ · **rozlišující údaj: Slavné dílo: Proměna**
  - možnosti: Franz Kafka ✓, Josef Lada, Jaroslav Hašek, Franz Werfel
  - jednoznačná (rozlišující údaj)

### Ben Jonson (literatura, hra, Kdo to je?)

- **Před:** „[***] byl anglický dramatik pozdní renesance, jehož hry předjímají poetiku klasicistního dramatu.“
  - možnosti: Ben Jonson ✓, Christopher Marlowe, John Fletcher, George Bernard Shaw
  - nevyvrácené: Christopher Marlowe, John Fletcher, George Bernard Shaw
- **Po:** „[***] byl anglický dramatik pozdní renesance, jehož hry předjímají poetiku klasicistního dramatu.“ · **rozlišující údaj: Život: 1572–1637**
  - možnosti: Ben Jonson ✓, Christopher Marlowe, Noël Coward, George Bernard Shaw (vyměněné)
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

### Benvenuto Cellini (umeni, hra, Kdo to je?)

- **Před:** „[***] byl italský zlatník, sochař a spisovatel, který se stal známý svými manýristickými kovovými sochami na přechodu renesance a baroka, šperky a mincemi i knihou Vlastní životopis.“
  - možnosti: Agnolo Bronzino, Giuseppe Arcimboldo, Francesco Primaticcio, Benvenuto Cellini ✓
  - nevyvrácené: Agnolo Bronzino, Giuseppe Arcimboldo, Francesco Primaticcio
- **Po:** „[***] byl italský zlatník, sochař a spisovatel, který se stal známý svými manýristickými kovovými sochami na přechodu renesance a baroka, šperky a mincemi i knihou Vlastní životopis.“ · **rozlišující údaj: Narození: 1500**
  - možnosti: Alessandro Allori, Giuseppe Arcimboldo, Michelozzo, Benvenuto Cellini ✓ (vyměněné)
  - jednoznačná (rozlišující údaj)

### Turecko (zemepis, hra, Co je to za místo?)

- **Před:** „[***] je transkontinentální stát ležící převážně v Anatolii v západní Asii, s menší částí zvanou Východní Thrákie v jihovýchodní Evropě.“
  - možnosti: Stát Palestina, Sýrie, Turecko ✓, Libanon
  - nevyvrácené: Stát Palestina, Sýrie, Libanon
- **Po:** „[***] je transkontinentální stát ležící převážně v Anatolii v západní Asii, s menší částí zvanou Východní Thrákie v jihovýchodní Evropě.“ · **rozlišující údaj: Hlavní město: Ankara**
  - možnosti: Stát Palestina, Sýrie, Turecko ✓, Libanon
  - jednoznačná (rozlišující údaj)

### Mount Everest (zemepis, hra, Co je to za místo?)

- **Před:** „[***] je nejvýše položený bod na Zemi nad hladinou moře. Nachází se v Mahálangurském Himálaji a přes její vrchol vede čínsko-nepálská hranice.“
  - možnosti: Manáslu, Čo Oju, Mount Everest ✓, Šiša Pangma
  - nevyvrácené: Manáslu, Čo Oju, Šiša Pangma
- **Po:** „[***] je nejvýše položený bod na Zemi nad hladinou moře. Nachází se v Mahálangurském Himálaji a přes její vrchol vede čínsko-nepálská hranice.“ · **rozlišující údaj: Mimo jiné ve státě: Čína**
  - možnosti: Kančendženga, Nošak, Mount Everest ✓, Pik Lenina (vyměněné)
  - jednoznačná (rozlišující údaj)


## Zbývající nejednoznačné otázky (62)

Hra je nepoloží tak, jak jsou: v tréninku vezme jinou položku (createRoundData: ambiguous), v denních módech, výzvách a Bossovi, kde je položka daná semínkem, zůstanou s nejlepšími údaji, které jdou; Dobývání místo nich dá místní otázku.

### Platýs velký (biologie, hra, Co je to za rybu?)

- **Před:** „[***] je druh původní evropské mořské ryby ze skupiny [***].“ · fakta: Ohrožení: málo dotčený
  - možnosti: Platýs obecný, Platýs bradavičnatý, Pakambala velká, Platýs velký ✓
  - nevyvrácené: Platýs bradavičnatý, Pakambala velká
- **Po:** „[***] je druh původní evropské mořské ryby ze skupiny [***].“ · fakta: Ohrožení: málo dotčený
  - možnosti: Platýs obecný, Platýs bradavičnatý, Pakambala velká, Platýs velký ✓
  - stále nevyvrácené: Platýs bradavičnatý, Pakambala velká

### Čolek horský (biologie, hra, Co je to za zvíře?)

- **Před:** „[***] je středně velký ocasatý obojživelník. Podobně jako u jiných [***] je poměrně velký vzhledový rozdíl mezi vodní a suchozemskou formou.“
  - možnosti: Čolek velký, Čolek obecný, Mlok skvrnitý, Čolek horský ✓
  - nevyvrácené: Čolek velký, Čolek obecný, Mlok skvrnitý
- **Po:** „[***] je středně velký ocasatý obojživelník. Podobně jako u jiných [***] je poměrně velký vzhledový rozdíl mezi vodní a suchozemskou formou.“
  - možnosti: Čolek velký, Čolek obecný, Mlok skvrnitý, Čolek horský ✓
  - stále nevyvrácené: Čolek velký, Čolek obecný, Mlok skvrnitý

### Hřib plstnatý (biologie, hra, Co je to za houbu?)

- **Před:** „[***] je jedlá houba z čeledi [***]. Názory na kuchyňskou kvalitu tohoto druhu se různí, protože plodnice více nebo méně zapáchají jodoformem.“
  - možnosti: Hřib borový, Hřib koloděj, Hřib plstnatý ✓, Hřib hnědý
  - nevyvrácené: Hřib borový, Hřib koloděj, Hřib hnědý
- **Po:** „[***] je jedlá houba z čeledi [***]. Názory na kuchyňskou kvalitu tohoto druhu se různí, protože plodnice více nebo méně zapáchají jodoformem.“
  - možnosti: Hřib borový, Hřib koloděj, Hřib plstnatý ✓, Hřib hnědý
  - stále nevyvrácené: Hřib borový, Hřib koloděj, Hřib hnědý

### Varle (biologie, hra, Která část těla to je?)

- **Před:** „[***] je samčí pohlavní žláza obratlovců, tedy i muže. Ve [***] dochází k vývoji mužské pohlavní buňky – spermie. [***] jsou také důležitá endokrinní žláza, která produkuje pohlavní hormony.“
  - možnosti: Varle ✓, Děloha, Vaječník, Játra
  - nevyvrácené: Děloha, Vaječník, Játra
- **Po:** „[***] je samčí pohlavní žláza obratlovců, tedy i muže. Ve [***] dochází k vývoji mužské pohlavní buňky – spermie. [***] jsou také důležitá endokrinní žláza, která produkuje pohlavní hormony.“
  - možnosti: Varle ✓, Děloha, Vaječník, Játra
  - stále nevyvrácené: Děloha, Vaječník, Játra

### Jilm habrolistý (biologie, hra, Co je to za rostlinu?)

- **Před:** „[***] je listnatý strom z čeledi [***].“ · fakta: Ohrožení: chybí údaje
  - možnosti: Jilm horský, Růže Banksové, Jilm vaz, Jilm habrolistý ✓
  - nevyvrácené: Jilm horský, Růže Banksové, Jilm vaz
- **Po:** „[***] je listnatý strom z čeledi [***].“ · fakta: Ohrožení: chybí údaje
  - možnosti: Jilm horský, Růže Banksové, Jilm vaz, Jilm habrolistý ✓
  - stále nevyvrácené: Jilm horský, Růže Banksové, Jilm vaz

### Huňáček severní (biologie, hra, Co je to za rybu?)

- **Před:** „[***] je menší mořská ryba z čeledi [***] z monotypického rodu [***].“
  - možnosti: Koruška evropská, Bodlok běloprsý, Aju východní, Huňáček severní ✓
  - nevyvrácené: Koruška evropská, Bodlok běloprsý, Aju východní
- **Po:** „[***] je menší mořská ryba z čeledi [***] z monotypického rodu [***].“
  - možnosti: Koruška evropská, Bodlok běloprsý, Aju východní, Huňáček severní ✓
  - stále nevyvrácené: Koruška evropská, Bodlok běloprsý, Aju východní

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

### Violka Rivinova (biologie, hra, Co je to za rostlinu?)

- **Před:** „[***] je vytrvalá bylina z čeledi [***]. V roce 2002 se stala německou Rostlinou roku.“
  - možnosti: Violka trojbarevná, Violka rolní, Violka Rivinova ✓, Violka vonná
  - nevyvrácené: Violka trojbarevná, Violka rolní, Violka vonná
- **Po:** „[***] je vytrvalá bylina z čeledi [***]. V roce 2002 se stala německou Rostlinou roku.“
  - možnosti: Violka trojbarevná, Violka rolní, Violka Rivinova ✓, Violka vonná
  - stále nevyvrácené: Violka trojbarevná, Violka rolní, Violka vonná

### Holubinka celokrajná (biologie, hra, Co je to za houbu?)

- **Před:** „[***] je jedlá houba z čeledi [***]. Druhové jméno je odvozeno od nepřerušovaných lupenů.“
  - možnosti: Holubinka bílá, Holubinka chromová, Holubinka černonachová, Holubinka celokrajná ✓
  - nevyvrácené: Holubinka bílá, Holubinka chromová, Holubinka černonachová
- **Po:** „[***] je jedlá houba z čeledi [***]. Druhové jméno je odvozeno od nepřerušovaných lupenů.“
  - možnosti: Holubinka bílá, Holubinka chromová, Holubinka černonachová, Holubinka celokrajná ✓
  - stále nevyvrácené: Holubinka bílá, Holubinka chromová, Holubinka černonachová

### Vstavač řídkokvětý (biologie, hra, Co je to za rostlinu?)

- **Před:** „[***] je rostlina patřící do čeledi [***].“
  - možnosti: Vstavač trojzubý, Vstavač bledý, Vstavač řídkokvětý ✓, Vstavač bahenní
  - nevyvrácené: Vstavač trojzubý, Vstavač bledý, Vstavač bahenní
- **Po:** „[***] je rostlina patřící do čeledi [***].“
  - možnosti: Vstavač trojzubý, Vstavač bledý, Vstavač řídkokvětý ✓, Vstavač bahenní
  - stále nevyvrácené: Vstavač trojzubý, Vstavač bledý, Vstavač bahenní

### Portugalský ovčák (biologie, hra, Co je to za plemeno?)

- **Před:** „[***] je pastevecké plemeno psa pocházející z [***]. Mezi ostatními [***] psy vynikají svojí typickou dlouhou zvlněnou srstí.“
  - možnosti: Rafeiro do Alentejo, Cão de Castro Laboreiro, Portugalský podengo, Portugalský ovčák ✓
  - nevyvrácené: Rafeiro do Alentejo, Cão de Castro Laboreiro, Portugalský podengo
- **Po:** „[***] je pastevecké plemeno psa pocházející z [***]. Mezi ostatními [***] psy vynikají svojí typickou dlouhou zvlněnou srstí.“
  - možnosti: Rafeiro do Alentejo, Cão de Castro Laboreiro, Portugalský podengo, Portugalský ovčák ✓
  - stále nevyvrácené: Rafeiro do Alentejo, Cão de Castro Laboreiro, Portugalský podengo

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

### Slávička mnohotvárná (biologie, výzva, Co je to za zvíře?)

- **Před:** „[***] je druh euryhalinního mlže z čeledi [***]. Jedná se o invazní druh.“ · fakta: Ohrožení: málo dotčený
  - možnosti: Slávka jedlá, Slávička mnohotvárná ✓, Zéva obrovská, Škeble rybničná
  - nevyvrácené: Slávka jedlá, Škeble rybničná
- **Po:** „[***] je druh euryhalinního mlže z čeledi [***]. Jedná se o invazní druh.“ · fakta: Ohrožení: málo dotčený
  - možnosti: Slávka jedlá, Slávička mnohotvárná ✓, Zéva obrovská, Škeble rybničná
  - stále nevyvrácené: Slávka jedlá, Škeble rybničná

### Cypřiš stálezelený (biologie, výzva, Co je to za rostlinu?)

- **Před:** „[***] je [***], jehličnatý, dlouhověký strom vyžadující pro zdárný růst teplejší, jihoevropské klima.“ · fakta: Ohrožení: málo dotčený
  - možnosti: Zerav západní, Cypřiš stálezelený ✓, Metasekvoje čínská, Tisovec dvouřadý
  - nevyvrácené: Zerav západní, Metasekvoje čínská, Tisovec dvouřadý
- **Po:** „[***] je [***], jehličnatý, dlouhověký strom vyžadující pro zdárný růst teplejší, jihoevropské klima.“ · fakta: Ohrožení: málo dotčený
  - možnosti: Zerav západní, Cypřiš stálezelený ✓, Metasekvoje čínská, Tisovec dvouřadý
  - stále nevyvrácené: Zerav západní, Metasekvoje čínská, Tisovec dvouřadý

### Rosolovka mozkovitá (biologie, výzva, Co je to za houbu?)

- **Před:** „[***] je nejedlá dřevokazná houba z čeledi [***].“
  - možnosti: Slizák růžový, Kyj Herkulův, Strmělka anýzka, Rosolovka mozkovitá ✓
  - nevyvrácené: Slizák růžový, Kyj Herkulův, Strmělka anýzka
- **Po:** „[***] je nejedlá dřevokazná houba z čeledi [***].“
  - možnosti: Slizák růžový, Kyj Herkulův, Strmělka anýzka, Rosolovka mozkovitá ✓
  - stále nevyvrácené: Slizák růžový, Kyj Herkulův, Strmělka anýzka

### Španělský mastin (biologie, výzva, Co je to za plemeno?)

- **Před:** „[***] je velké a těžké molossoidní psí plemeno. V zemi původu byl používán k hlídání stád ovcí před zloději, ale i vlky a medvědy, v současné době se používá především jako hlídač.“
  - možnosti: Španělský galgo, Španělský mastin ✓, Pyrenejský horský pes, Španělský alano
  - nevyvrácené: Španělský galgo, Pyrenejský horský pes, Španělský alano
- **Po:** „[***] je velké a těžké molossoidní psí plemeno. V zemi původu byl používán k hlídání stád ovcí před zloději, ale i vlky a medvědy, v současné době se používá především jako hlídač.“
  - možnosti: Španělský galgo, Španělský mastin ✓, Pyrenejský horský pes, Španělský alano
  - stále nevyvrácené: Španělský galgo, Pyrenejský horský pes, Španělský alano

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

### Pozitronium (fyzika, hra, Která částice to je?)

- **Před:** „[***] je soustava složená z elektronu a jeho antičástice [***], které jsou spojeny do exotického atomu. Orbitaly těchto dvou částic a složení energetických hladin jsou podobné jako v atomu vodíku složeného z elektronu a protonu.“
  - možnosti: Pozitronium ✓, Mion, Fermion, Tauon
  - nevyvrácené: Mion, Fermion, Tauon
- **Po:** „[***] je soustava složená z elektronu a jeho antičástice [***], které jsou spojeny do exotického atomu. Orbitaly těchto dvou částic a složení energetických hladin jsou podobné jako v atomu vodíku složeného z elektronu a protonu.“
  - možnosti: Pozitronium ✓, Mion, Fermion, Tauon
  - stále nevyvrácené: Mion, Fermion, Tauon

### Gay-Lussacův zákon (fyzika, hra, Který zákon, jev nebo pojem to je?)

- **Před:** „[***] je termodynamický vztah pro izobarický děj probíhající v ideálním plynu.“
  - možnosti: Gay-Lussacův zákon ✓, Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon
  - nevyvrácené: Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon
- **Po:** „[***] je termodynamický vztah pro izobarický děj probíhající v ideálním plynu.“
  - možnosti: Gay-Lussacův zákon ✓, Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon
  - stále nevyvrácené: Boyleův-Mariottův zákon, Wienův posunovací zákon, Avogadrův zákon

### Panská skála (geologie, hra, Co je to za útvar nebo jev?)

- **Před:** (bez popisu)
  - možnosti: Xenolit, Lakolit, Devils Tower, Panská skála ✓
  - nevyvrácené: Xenolit, Lakolit, Devils Tower
- **Po:** (bez popisu)
  - možnosti: Xenolit, Lakolit, Devils Tower, Panská skála ✓
  - stále nevyvrácené: Xenolit, Lakolit, Devils Tower

### Kappadokie (geologie, hra, Co je to za útvar nebo jev?)

- **Před:** (bez popisu)
  - možnosti: Oáza, Duna, Kappadokie ✓, Pravčická brána
  - nevyvrácené: Oáza, Duna, Pravčická brána
- **Po:** (bez popisu)
  - možnosti: Oáza, Duna, Kappadokie ✓, Pravčická brána
  - stále nevyvrácené: Oáza, Duna, Pravčická brána

### Fanerozoikum (geologie, výzva, Které je to období?)

- **Před:** „Geologické období.“ · fakta: Jednotka: eon
  - možnosti: Sinemur, Fanerozoikum ✓, Proterozoikum, Hadaikum
  - nevyvrácené: Sinemur, Proterozoikum, Hadaikum
- **Po:** „Geologické období.“ · fakta: Jednotka: eon
  - možnosti: Sinemur, Fanerozoikum ✓, Proterozoikum, Hadaikum
  - stále nevyvrácené: Sinemur, Proterozoikum, Hadaikum

### Hallucigenia (geologie, výzva, Co je to za zkamenělinu nebo organismus?)

- **Před:** (bez popisu)
  - možnosti: Tullimonstrum, Opabinia, Hallucigenia ✓, Wiwaxia
  - nevyvrácené: Tullimonstrum, Opabinia, Wiwaxia
- **Po:** (bez popisu)
  - možnosti: Tullimonstrum, Opabinia, Hallucigenia ✓, Wiwaxia
  - stále nevyvrácené: Tullimonstrum, Opabinia, Wiwaxia

### Jon Bon Jovi (hudba, hra, Kdo to je?)

- **Před:** „[***] je americký zpěvák a herec, zakládající člen hudební skupiny [***].“ · fakta: Žánr: klasický heavy metal
  - možnosti: James Hetfield, Dee Snider, Jon Bon Jovi ✓, Ronnie James Dio
  - nevyvrácené: James Hetfield, Dee Snider, Ronnie James Dio
- **Po:** „[***] je americký zpěvák a herec, zakládající člen hudební skupiny [***].“ · fakta: Žánr: klasický heavy metal
  - možnosti: James Hetfield, Dee Snider, Jon Bon Jovi ✓, Ronnie James Dio
  - stále nevyvrácené: James Hetfield, Dee Snider, Ronnie James Dio

### Michael Hutchence (hudba, hra, Kdo to je?)

- **Před:** „[***] byl australský hudebník a zpěvák skupiny INXS.“ · fakta: Žánr: rock
  - možnosti: Michael Hutchence ✓, Michael Bolton, Paul Stanley, Nick Cave
  - nevyvrácené: Nick Cave
- **Po:** „[***] byl australský hudebník a zpěvák skupiny INXS.“ · fakta: Žánr: rock
  - možnosti: Michael Hutchence ✓, Michael Bolton, Paul Stanley, Nick Cave
  - stále nevyvrácené: Nick Cave

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

### Psyché (mytologie, hra, Kdo je to?)

- **Před:** „[***] je v řecké mytologii perzonifikace lidské duše; zpodobňována bývá jako dívka s motýlími křídly.“
  - možnosti: Psyché ✓, Ínó, Kybelé, Gaia
  - nevyvrácené: Ínó, Kybelé, Gaia
- **Po:** „[***] je v řecké mytologii perzonifikace lidské duše; zpodobňována bývá jako dívka s motýlími křídly.“
  - možnosti: Psyché ✓, Ínó, Kybelé, Gaia
  - stále nevyvrácené: Ínó, Kybelé, Gaia

### Augiáš (mytologie, hra, Kdo je to?)

- **Před:** „[***] je v řecké mytologii élidský král, syn boha Hélia.“
  - možnosti: Astyanax, Abdéros, Augiáš ✓, Ioláos
  - nevyvrácené: Astyanax, Abdéros, Ioláos
- **Po:** „[***] je v řecké mytologii élidský král, syn boha Hélia.“
  - možnosti: Astyanax, Abdéros, Augiáš ✓, Ioláos
  - stále nevyvrácené: Astyanax, Abdéros, Ioláos

### Juraj Jánošík (mytologie, hra, Kdo je to?)

- **Před:** „[***] byl slovenský zbojník.“
  - možnosti: Aljoša Popovič, Juraj Jánošík ✓, Sadko, Dobryňa Nikitič
  - nevyvrácené: Aljoša Popovič, Sadko, Dobryňa Nikitič
- **Po:** „[***] byl slovenský zbojník.“
  - možnosti: Aljoša Popovič, Juraj Jánošík ✓, Sadko, Dobryňa Nikitič
  - stále nevyvrácené: Aljoša Popovič, Sadko, Dobryňa Nikitič

### Duamutef (mytologie, hra, Kdo je to?)

- **Před:** „[***] je staroegyptský pohřební bůh, jeden ze čtyř synů Horových. Je bohem spojovaným s jednou ze světových stran – východem, s východním větrem a také s ochranou těla zemřelého – jeho žaludku vyjímaného při balzamovacích obřadech a ukládaného do kanopy s uzá…“
  - možnosti: Duamutef ✓, Kebehsenuf, Apedemak, Imset
  - nevyvrácené: Kebehsenuf, Apedemak, Imset
- **Po:** „[***] je staroegyptský pohřební bůh, jeden ze čtyř synů [***]. Je bohem spojovaným s jednou ze světových stran – východem, s východním větrem a také s ochranou těla zemřelého – jeho žaludku vyjímaného při balzamovacích obřadech a ukládaného do kanopy s uzávěr…“
  - možnosti: Duamutef ✓, Heka, Horus, Seth (vyměněné)
  - stále nevyvrácené: Heka

… a dalších 22 v JSON.

## Výměny nesprávných možností (671 v 468 otázkách)

Náhrada musí být stejného druhu, pohlaví, skupiny (třída, řád, čeleď, sport, mytologie, skupina prvků, stát, kontinent, jednotka, sloh, směr, jazyk) a okruhu jako vyměněná možnost a vyvrací ji ukázaný údaj; „Stejná skupina“ to ověřuje znovu (swapSimilar). Mimo skupinu: 0, jiného druhu: 10, jiné kategorie: 0. Pokles = o kolik je náhrada správné odpovědi méně podobná než vyměněná možnost (skóre podobnosti tématu).

| Téma | Otázka (správně) | Vyměněná možnost | Náhrada | Stejná skupina | Pokles podobnosti | Rozlišující údaj |
|---|---|---|---|---|---:|---|
| hudba | Super Trouper | Ring Ring | Now You're Gone – The Album | ano | 10 | (popis) |
| fyzika | Aristarchos ze Samu | Eudoxos z Knidu | Eugène Michel Antoniadi | ano | 7 | Narození: 309 př. n. l. |
| umeni | Benvenuto Cellini | Francesco Primaticcio | Michelozzo | ano | 7 | Narození: 1500 |
| fyzika | Aristarchos ze Samu | Hipparchos | Eugène Michel Antoniadi | ano | 7 | Narození: 309 př. n. l. |
| historie | Elam | Fénicie | Římská republika | ano | 6 | Doba trvání: 2699–538 př. n. l.; Hlavní město: Súsy |
| literatura | Ben Jonson | John Fletcher | Tom Stoppard | ano | 6 | Život: 1572–1637 |
| literatura | Ronja, dcera loupežníka | Bratři Lví srdce | Kallocain | ano | 6 | (popis) |
| literatura | Phileas Fogg | Jean Passepartout | D’Artagnan | ano | 6 | (popis) |
| literatura | To | Osvícení | Jurský park | ano | 6 | Vznik: 1986 |
| umeni | Giovanni Pisano | Arnolfo di Cambio | Donatello | ano | 5.7 | Narození: 1248 |
| historie | Únorová revoluce | Říjnová revoluce | Íránská islámská revoluce | ano | 5 | (popis) |
| hudba | Oedipus rex | Příběh vojáka | Pověst o neviditelném městě Kitěži a panně Fevronii | ano | 5 | Premiéra: 1927 |
| hudba | Tři přání | Slzy nože | Osud | ano | 5 | (popis) |
| literatura | Večery na samotě u Dikaňky | Mirgorod | Zápisky mladého lékaře | ano | 5 | Vznik: 1830 |
| sport | HC Vlci Jablonec nad Nisou | IHC Králové Písek | VHK Vsetín | ano | 4.9 | (popis) |
| umeni | Giovanni Pisano | Nicola Pisano | Veit Stoss | ano | 4.9 | Narození: 1248 |
| umeni | Peter Klashorst | Erwin Olaf | Heinrich Zille | ano | 4.9 | Narození: 1957; Úmrtí: 2024 |
| historie | Gejza II. | Ladislav II. | Samuel Aba | ano | 4.3 | (popis) |
| biologie | Lenochod krátkokrký | Lenochod dvouprstý | Mravenečník čtyřprstý | ano | 4 | Hmotnost: až 400 g |
| geologie | Tyrkys | Lapis lazuli | Záhněda | ano | 4 | Třída: fosforečnany |
| geologie | Achát | Turmalín | Křišťál | ano | 4 | Barva: pruhovaný, různé barvy |
| hudba | November Rain | Sweet Child O' Mine | Smells Like Teen Spirit | ano | 4 | (popis) |
| hudba | LeAnn Rimes | Kacey Musgravesová | Mary Traversová | ano | 4 | Život: nar. 1982 |
| hudba | LeAnn Rimes | Jewel | Macy Gray | ano | 4 | Život: nar. 1982 |
| hudba | G N' R Lies | Appetite for Destruction | Nevermind | ano | 4 | Žánr: hard rock |
| hudba | Violator | Songs of Faith and Devotion | Mr. Bad Guy | ano | 4 | (popis) |
| hudba | Songs of Faith and Devotion | Violator | Mr. Bad Guy | ano | 4 | (popis) |
| hudba | 2001 | The Chronic | The Slim Shady LP | ano | 4 | (popis) |
| hudba | Carmen | Džamilé | Manon | ano | 4 | Premiéra: 1875 |
| literatura | Velký Gatsby | Něžná je noc | Osvícení | ano | 4 | (popis) |

## Otázky, které určí jen popis (293)

Pojmy, procesy, zákony a jevy (Chemický prvek, Fotosyntéza, Ohmův zákon) nemají v datech údaje, které by šly porovnat, a u některých druhů, dinosaurů nebo částí těla údaje z dat podobné možnosti nerozliší: odpověď určí definice či konkrétní údaj z úvodu článku (místo nálezu, rok, orgán, ke kterému část patří), který ale data neobsahují. Audit to strukturovaně ověřit neumí, proto je počítá zvlášť a nepovažuje je za vyřešené ani za nejednoznačné. Hra takovou otázku položí jen s plným úvodem článku (aspoň 14 slov, u položky s údaji navíc s konkrétním údajem); bez Wikipedie (krátký popis z Wikidat) je otázka nejednoznačná a trénink vezme jinou položku.

- mytologie – Kdo je to?: 86 (např. Mnémosyné, Jama, Pýthia)
- chemie – Jaký pojem nebo metoda to je?: 48 (např. Chemický prvek, Sacharidy, Beton)
- chemie – Jaká reakce nebo proces to je?: 35 (např. Dielsova–Alderova reakce, Siemensova-Martinova pec, Mannichova reakce)
- fyzika – Který zákon, jev nebo pojem to je?: 18 (např. Blesk, Radioaktivita, Maxwellovy rovnice)
- biologie – Co je to za zvíře?: 12 (např. Krokodýl orinocký, Ježek ušatý, Čolek hranatý)
- zemepis – Co je to za místo?: 11 (např. Baffinovo moře, Zámek Kroměříž, Moravskoslezské Beskydy)
- mytologie – Co je to za bytost?: 10 (např. Drak, Mořská panna, Fénix)
- biologie – Co je to za rybu?: 8 (např. Platýs limanda, Kranasovec štíhlý, Žralok rohatý)
- fyzika – Co je to za sondu nebo přístroj?: 8 (např. Apollo 11, Sputnik 1, Tepelné čerpadlo)
- fyzika – Která částice to je?: 7 (např. Atom, Antičástice, Neutrino)
- sport – Která soutěž to je?: 6 (např. Extraliga ledního hokeje, Mistrovství světa v basketbalu mužů, Coppa Italia)
- biologie – Co je to za rostlinu?: 5 (např. Lilek vejcoplodý, Olivovník evropský, Rdesno hadí kořen)
- fyzika – Co je to za těleso?: 5 (např. Betlémská hvězda, Střelec, Kentaur)
- biologie – Co je to za houbu?: 4 (např. Hřib smrkový, Hřib borový, Muchomůrka porfyrová)
- chemie – Kdo to je?: 4 (např. Fritz Pregl, Odd Hassel, Cato Guldberg)
- biologie – Která část těla to je?: 3 (např. Mozeček, Oko, Močová trubice)
- biologie – Co je to za pravěkého tvora?: 3 (např. Cryolophosaurus ellioti, Titanosaurus, Dilong)
- hudba – Co je to za kapelu?: 3 (např. Mayhem, Darkthrone, Krátky Proces)
- sport – Který klub nebo tým to je?: 3 (např. SC Corinthians Paulista, Santos FC, MFK Dubnica)
- biologie – Co je to za ptáka?: 2 (např. Páv, Papoušek běloskvrnný)
- biologie – Co je to za plemeno?: 2 (např. Australská kelpie, Turecká angora)
- geologie – Které je to období?: 2 (např. Druhohory, Druhohory)
- sport – Které sportoviště to je?: 2 (např. Sportovní areál Drnovice, Talladega Superspeedway)
- architektura – Kdo to je?: 1 (např. Ineni)
- chemie – Co je to za látku?: 1 (např. Vitamín B6)
- fyzika – Která veličina to je?: 1 (např. Měrná tepelná kapacita)
- fyzika – Kdo to je?: 1 (např. Ellen Ochoaová)
- literatura – Které dílo to je?: 1 (např. Ezopovy bajky)
- umeni – Kdo to je?: 1 (např. Jean Cabut)
