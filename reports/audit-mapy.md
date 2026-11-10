# Audit mapy „Ukaž na mapě“

Vygenerováno 2026-11-10 13:41 UTC skriptem `npm run audit:mapa` (s porovnáním se zdrojem Natural Earth). Úplný výpis je v `reports/audit-mapy.json`.
Podkladová mapa: `data/mapa.json` (486 kB, 2026-11-10); obrysy: `data/mapa-tvary.json` (2324 obrysů); opravy: `data/mapa-opravy.json` (8 vyřazených míst, 4 opravených poloh).

## Souhrn

- Nálezů celkem: **365**, kritických: **0**. Exit kód: 0.
- Otázek na mapě: **7864** (z toho 2277 na úrovni Základní).

| Oblast | kritické | vysoké | střední | nízké | informace |
|---|---:|---:|---:|---:|---:|
| Podkladová mapa světa | 0 | 0 | 0 | 0 | 0 |
| Podkladová mapa Česka | 0 | 0 | 0 | 0 | 0 |
| Státy na mapě | 0 | 0 | 0 | 5 | 14 |
| Polohy položek | 0 | 0 | 2 | 21 | 22 |
| Obrysy (data/mapa-tvary.json) | 0 | 10 | 44 | 191 | 0 |
| Sestavení otázek | 0 | 0 | 5 | 2 | 49 |
| Soubor oprav | 0 | 0 | 0 | 0 | 0 |

## Podkladová mapa světa

Kontrolní body: 52 moří a zálivů, 47 jezer, 74 míst na pevnině. Kroužků pevniny: land 1564, seam 9; děr v pevnině 1; jezer 383; hranic 390 čar s 756 volnými konci (nejhorší konec 0.71 j od břehu/hranice).
Antarktida: výřez končí na -57° j. š.; pevnina pod výřezem je nakreslená (vidět jen na vysokém displeji při oddálení).
Porovnání se zdrojem (Natural Earth 1:50m, mřížka 0,5°): 241920 bodů, 0 neshod dál než 3 j od pobřeží.

Bez nálezů.

## Podkladová mapa Česka

Krajů 14, řek 22 čar, hranic krajů 26 čar, státních hranic 375 čar.

Bez nálezů.

## Státy na mapě

Států v data/countries.json: 197, s plochou na mapě: 197; ploch na mapě 240; položek států 197, zkontrolovaných hlavních měst 193; bodů pevniny bez státu 131.

| Závažnost | Kontrola | Nález |
|---|---|---|
| nízké | pevnina-bez-statu | Pevnina kolem -24, 32 neleží v ploše žádného státu (5 bodů mřížky, asi 80 j²) |
| nízké | pevnina-bez-statu | Pevnina kolem 24, -4 neleží v ploše žádného státu (4 bodů mřížky, asi 64 j²) |
| nízké | pevnina-bez-statu | Pevnina kolem 48, 8 neleží v ploše žádného státu (4 bodů mřížky, asi 64 j²) |
| nízké | pevnina-bez-statu | Pevnina kolem 44, 20 neleží v ploše žádného státu (4 bodů mřížky, asi 64 j²) |
| nízké | pevnina-bez-statu | Pevnina kolem 32, 36 neleží v ploše žádného státu (4 bodů mřížky, asi 64 j²) |

Informace (14): bod státu mimo jeho plochu do 150 km – Portugalsko 1 km, Indonésie 119 km, Filipíny 19 km, Monako 2 km, Spojené arabské emiráty 6 km, Haiti 5 km, Kapverdy 2 km, Bahamy 1 km, Vanuatu 11 km, Tonga 66 km, Tuvalu 8 km, Kiribati 13 km, Svatý Kryštof a Nevis 0 km, Marshallovy ostrovy 17 km.

## Polohy položek

Zkontrolováno 7864 otázek, u 7475 stát podle plochy na mapě (tolerance 25 km, v moři 60 km). Jezera: 174 nakreslených na podkladové mapě, 66 ne. Míst se stejnými souřadnicemi a jiným jménem (stavby, bitvy… na stejném místě): 128.

| Závažnost | Téma | Druh | Úr. | Místo | Nález |
|---|---|---|---|---|---|
| střední | historie | bitvy | P | Bitva o Khe Sanh (Q247253) | Bitva o Khe Sanh: bod 16.65, 106.72 leží ve státě Vietnam, 2854 km od Jižní Korea |
| střední | vlajky | regiony | P | Veracruz (Q60130) | Veracruz: bod 19.84, -96.06 leží v moři dál než 25 km od nakreslené pevniny |
| nízké | zemepis | priroda | Z | Malajský poloostrov (Q18758) | Malajský poloostrov: bod 7, 100 leží ve státě Thajsko, 46 km od Malajsie |
| nízké | zemepis | jezera | Z | Maracaibo (Q182137) | Maracaibo: bod jezera 9.82, -71.56 leží na mapě v moři (laguna nebo záliv, který podkladová mapa kreslí jako moře) |
| nízké | zemepis | ostrovy | P | Ko Samui (Q270375) | Ko Samui: souřadnice 9.5, 100 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | zemepis | ostrovy | P | Seram (Q185532) | Seram: souřadnice -3, 129 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | zemepis | jezera | P | Lagoa dos Patos (Q661235) | Lagoa dos Patos: bod jezera -31.15, -51.39 leží na mapě v moři (laguna nebo záliv, který podkladová mapa kreslí jako moře) |
| nízké | zemepis | priroda | P | Národní park Awaš (Q791635) | Národní park Awaš: souřadnice 9, 40 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | zemepis | jezera | P | Pontchartrain (Q1331750) | Pontchartrain: bod jezera 30.19, -90.1 leží na mapě v moři (laguna nebo záliv, který podkladová mapa kreslí jako moře) |
| nízké | architektura | stavby | P | Leeds Castle (Q746876) | Leeds Castle: bod 51.25, 0.63 je 319 km od města Leeds, které položka uvádí jako místo (špatně může být bod i uvedené město) |
| nízké | historie | bitvy | Z | Bitva na Katalaunských polích (Q139808) | Bitva na Katalaunských polích: souřadnice 49, 4.5 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | historie | bitvy | Z | Bitva o Okinawu (Q192660) | Bitva o Okinawu: souřadnice 26.5, 128 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | historie | bitvy | P | Bitva na řece Kalce (Q570204) | Bitva na řece Kalce: bod 47.25, 37.5 leží ve státě Ukrajina, 54 km od Rusko |
| nízké | historie | bitvy | P | Bitva o Řecko (Q2888837) | Bitva o Řecko: souřadnice 38.5, 23 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | historie | bitvy | P | Stodenní ofenzíva (Q1130507) | Stodenní ofenzíva: souřadnice 50, 3 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | historie | bitvy | P | První bitva u Mazurských jezer (Q660655) | První bitva u Mazurských jezer: bod 54, 22 leží ve státě Polsko, 42 km od Rusko |
| nízké | historie | bitvy | P | První bitva u Mazurských jezer (Q660655) | První bitva u Mazurských jezer: souřadnice 54, 22 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | historie | bitvy | P | Druhá bitva u Mazurských jezer (Q684872) | Druhá bitva u Mazurských jezer: bod 54, 22 leží ve státě Polsko, 42 km od Rusko |
| nízké | historie | bitvy | P | Druhá bitva u Mazurských jezer (Q684872) | Druhá bitva u Mazurských jezer: souřadnice 54, 22 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | historie | bitvy | P | První bitva v Champagne (Q989093) | První bitva v Champagne: souřadnice 49, 4.5 jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území |
| nízké | historie | bitvy | P | Bitva o Ardeny (Q221703) | Bitva o Ardeny: bod 50.25, 5.67 leží ve státě Belgie, 62 km od Francie |
| nízké | historie | udalosti | Z | Tridentský koncil (Q172991) | Tridentský koncil: bod 46.07, 11.12 je 176 km od města Bologna, které položka uvádí jako místo (špatně může být bod i uvedené město) |
| nízké | historie | udalosti | Z | Katyňský masakr (Q134301) | Katyňský masakr: bod 54.77, 31.79 je 347 km od města Tver, které položka uvádí jako místo (špatně může být bod i uvedené město) |
| informace | zemepis | ostrovy | P | Navassa (Q25359) | Navassa: bod 18.4, -75.01 leží na pevnině bez plochy státu, 746 km od Spojené státy americké |
| informace | zemepis | ostrovy | P | Clippertonův ostrov (Q161258) | Clippertonův ostrov: bod 10.29, -109.22 leží na pevnině bez plochy státu, 3917 km od Francie |
| informace | zemepis | ostrovy | P | Lampedusa (Q107338) | Lampedusa: bod 35.52, 12.58 leží na pevnině bez plochy státu, 146 km od Itálie |
| informace | zemepis | ostrovy | P | Ostrov lorda Howa (Q104784) | Ostrov lorda Howa: bod -31.55, 159.08 leží na pevnině bez plochy státu, 580 km od Austrálie |
| informace | zemepis | ostrovy | P | Fernando de Noronha (Q175057) | Fernando de Noronha: bod -3.85, -32.42 leží v moři, 366 km od Brazílie |
| informace | zemepis | ostrovy | P | Kavaratti (Q271287) | Kavaratti: bod 10.57, 72.64 leží na pevnině bez plochy státu, 73 km od Indie |
| informace | zemepis | ostrovy | P | Kokosový ostrov (Q215081) | Kokosový ostrov: bod 5.53, -87.06 leží v moři, 501 km od Kostarika |
| informace | zemepis | ostrovy | P | Ostrov Europa (Q193089) | Ostrov Europa: bod -22.37, 40.36 leží na pevnině bez plochy státu, 296 km od Francie, Madagaskar |
| informace | zemepis | ostrovy | P | St. Kilda (Q166479) | St. Kilda: bod 57.82, -8.59 leží na pevnině bez plochy státu, 68 km od Spojené království |
| informace | zemepis | ostrovy | P | Kastelorizo (Q212096) | Kastelorizo: bod 36.15, 29.59 leží na pevnině bez plochy státu, 127 km od Řecko |
| informace | zemepis | ostrovy | P | Tokdo (Q20317) | Tokdo: bod 37.24, 131.87 leží na pevnině bez plochy státu, 87 km od Japonsko, Jižní Korea |
| informace | zemepis | ostrovy | P | Juan da Nova (Q237034) | Juan da Nova: bod -17.05, 42.73 leží v moři, 137 km od Francie, Madagaskar |
| informace | zemepis | ostrovy | P | Bassas da India (Q220601) | Bassas da India: bod -21.48, 39.67 leží v moři, 1080 km od Francie |
| informace | zemepis | ostrovy | P | Linosa (Q497321) | Linosa: bod 35.86, 12.86 leží v moři, 124 km od Itálie |
| informace | zemepis | ostrovy | P | Tromelin (Q234208) | Tromelin: bod -15.89, 54.53 leží v moři, 569 km od Francie |
| informace | zemepis | ostrovy | P | Divoké ostrovy (Q27088) | Divoké ostrovy: bod 30.15, -15.86 leží na pevnině bez plochy státu, 299 km od Portugalsko |
| informace | zemepis | ostrovy | P | Abú Músá (Q167217) | Abú Músá: bod 25.88, 55.03 leží v moři, 68 km od Írán, Spojené arabské emiráty |
| informace | zemepis | ostrovy | P | Jonaguni (Q220701) | Jonaguni: bod 24.46, 122.99 leží v moři, 70 km od Japonsko |
| informace | zemepis | hory | P | Barren (Q248212) | Barren: bod 12.28, 93.86 leží na pevnině bez plochy státu, 95 km od Indie |
| informace | zemepis | hory | P | Pinta (Q1064098) | Pinta: bod 0.58, -90.75 leží v moři, 81 km od Ekvádor |
| informace | zemepis | priroda | P | Jonagunský podmořský výtvor (Q995511) | Jonagunský podmořský výtvor: bod 24.44, 123.01 leží v moři, 67 km od Japonsko |
| informace | historie | bitvy | P | Bitva u Visu (Q158054) | Bitva u Visu: bod 43.18, 16.05 leží v moři, 141 km od Itálie |

## Obrysy (data/mapa-tvary.json) – podle podezřelosti

Zkontrolováno 2207 obrysů otázek (z toho 345 řek), podezřelých 245; obrysů bez položky 0; u 337 ostrovů a jezer se ve výsledku použije obrys z podkladové mapy.
Skóre sčítá důvody (bod mimo obrys, rozloha/délka proti datům, pevnina × voda proti podkladové mapě, jiný stát, mezera, ústí, křížení). Obrysy opravuje `scripts/build-mapa-tvary.mjs`; tady se jen hlásí.

Důvody: krizeni 120, na-vode 34, rozloha 25, jiny-nez-mapa 18, delka 18, bod-daleko 11, mezera 10, mimo-stat 9, usti 8, trojuhelnik 5, na-pevnine 4, jezero-nesedi 4, jezero-je-more 3, delka-pohori 2, nudle 2, stat-nesedi-s-mapou 2, v-mori 1, prilis-maly 1.

| # | Skóre | Druh | Úr. | Místo | Důvody |
|---:|---:|---|---|---|---|
| 1 | 97 | regiony | Z | Ostrovy Riau (Q2223) | obrys má 255049 km², podle dat 21992 km² (11.6×; bod leží uvnitř – může být špatně i rozloha v datech); jen 0 % obrysu leží na nakreslené pevnině |
| 2 | 92 | more | P | Georgian Bay (Q1267413) | 100 % obrysu moře leží na nakreslené pevnině |
| 3 | 91 | ostrovy | P | Schiermonnikoog (Q208011) | jen 13 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 0.11× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 4 | 91 | ostrovy | P | Vlieland (Q207851) | jen 12 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 0.09× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 5 | 87 | jezera | P | Tung-tching-chu (Q216083) | obrys má 1330 km², podle dat 4350 km² (0.31×; bod leží uvnitř – může být špatně i rozloha v datech); jen 22 % obrysu leží v jezeře nakresleném na mapě; obrys se sám kříží (8×) |
| 6 | 80 | reky | Z | Jang-c'-ťiang (Q5413) | bod položky je 710 km od čáry |
| 7 | 79 | reky | Z | Columbia (Q2251) | čára má 2799 km, řeka podle dat 2000 km (1.4×); bod položky je 66 km od čáry; čára je přerušená: 3 nesouvislé části, mezera 78 km |
| 8 | 78 | ostrovy | P | Kosrae (Q459848) | jen 18 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 0.23× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 9 | 70 | reky | Z | Nil (Q3392) | čára má 2562 km, řeka podle dat 6650 km (0.39×); řeka ústí do „Středozemní moře“, ale žádný konec čáry není u pobřeží (nejblíž 106 km) |
| 10 | 61 | ostrovy | P | Bassas da India (Q220601) | obrys má 1 km², podle dat 0.2 km² (3.14×); obrys se sám kříží (3×) |
| 11 | 59 | pohori | P | Witwatersrand (Q587808) | obrys měří 495 km, pohoří podle dat 56 km (8.83×) |
| 12 | 58 | pohori | P | Cordillera Blanca (Q804330) | obrys měří 1640 km, pohoří podle dat 200 km (8.2×) |
| 13 | 58 | ostrovy | P | Falster (Q735905) | jen 49 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 14.96× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 14 | 55 | reky | P | Beni (Q142604) | bod položky je 103 km od čáry; žádný konec čáry není u ústí (Madeira): nejblíž 102 km |
| 15 | 55 | more | Z | Gibraltarský průliv (Q36124) | 66 % obrysu moře leží na nakreslené pevnině |
| 16 | 50 | reky | P | Benue (Q204806) | žádný konec čáry není u ústí (Niger): nejblíž 558 km |
| 17 | 48 | reky | P | Brazos (Q903306) | čára má 1961 km, řeka podle dat 1352 km (1.45×); čára je přerušená: 2 nesouvislé části, mezera 58 km |
| 18 | 48 | ostrovy | P | Redonda (Q457261) | obrys má 0 km², podle dat 1.5 km² (0.28×; bod leží uvnitř – může být špatně i rozloha v datech); obrys je jen trojúhelník |
| 19 | 48 | reky | P | Tocantins (Q156054) | bod položky je 119 km od čáry; čára je přerušená: 2 nesouvislé části, mezera 24 km |
| 20 | 46 | more | P | Benátská laguna (Q76925) | 50 % obrysu moře leží na nakreslené pevnině; obrys se sám kříží (1×) |
| 21 | 45 | ostrovy | P | Kalsoy (Q212043) | jen 27 % obrysu leží na nakreslené pevnině |
| 22 | 45 | reky | Z | Mackenzie (Q3411) | čára je přerušená: 2 nesouvislé části, mezera 58 km; žádný konec čáry není u ústí (Beaufortovo moře): nejblíž 61 km |
| 23 | 44 | jezera | P | Bratská přehradní nádrž (Q899803) | obrys se sám kříží (9×); největší kroužek je úzká nudle (kompaktnost 0.016) |
| 24 | 43 | reky | P | Atbara (Q753897) | čára má 444 km, řeka podle dat 1120 km (0.4×) |
| 25 | 43 | ostrovy | Z | Kanadské arktické souostroví (Q85377) | jen 47 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 0.02× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 26 | 42 | reky | P | Fraser (Q269710) | čára má 1082 km, řeka podle dat 2657 km (0.41×) |
| 27 | 42 | reky | Z | Okavango (Q188773) | řeka ústí do „delta Okavanga“, ale žádný konec čáry není u pobřeží (nejblíž 274 km) |
| 28 | 41 | priroda | P | Pelješac (Q725896) | jen 42 % obrysu leží na nakreslené pevnině; obrys se sám kříží (1×) |
| 29 | 40 | ostrovy | P | Alexandrovy ostrovy (Q140510) | jen 55 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 0.04× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 30 | 40 | ostrovy | P | Syros (Q211230) | jen 32 % obrysu leží na nakreslené pevnině |
| 31 | 39 | jezera | P | Näsijärvi (Q824371) | jezero na podkladové mapě je 4.16× větší než obrys (zvýrazní se obrys, ne tvar z mapy); obrys se sám kříží (3×) |
| 32 | 38 | reky | Z | Amazonka (Q3783) | čára má 2943 km, řeka podle dat 6400 km (0.46×) |
| 33 | 38 | ostrovy | P | Mljet (Q211306) | jen 51 % obrysu leží na nakreslené pevnině; obrys se sám kříží (3×) |
| 34 | 37 | reky | Z | Ubangi (Q171649) | čára má 497 km, řeka podle dat 1060 km (0.47×) |
| 35 | 36 | jezera | P | Ammersee (Q265336) | jen 40 % obrysu leží v jezeře nakresleném na mapě; jezero na podkladové mapě je 0.49× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 36 | 36 | reky | P | Dalälven (Q216627) | čára má 455 km, řeka podle dat 220 km (2.07×) |
| 37 | 36 | reky | P | Emajõgi (Q215378) | čára má 205 km, řeka podle dat 100 km (2.05×) |
| 38 | 35 | reky | Z | Řeka svatého Vavřince (Q134750) | 25 % čáry vede mořem (dál než 15 km od nakreslené pevniny) |
| 39 | 35 | ostrovy | P | Vieques (Q737624) | jen 37 % obrysu leží na nakreslené pevnině |
| 40 | 35 | jezera | P | Volta (Q201679) | obrys se sám kříží (5×); největší kroužek je úzká nudle (kompaktnost 0.02) |
| 41 | 34 | ostrovy | P | Suðuroy (Q210309) | jen 49 % obrysu leží na nakreslené pevnině; obrys se sám kříží (1×) |
| 42 | 33 | ostrovy | Z | Kurilské ostrovy (Q80389) | ostrov na podkladové mapě je 0.03× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 43 | 33 | regiony | P | Schaffhausen (Q12697) | jen 62 % obrysu leží ve státech, které položka uvádí (Švýcarsko) |
| 44 | 32 | reky | P | Šebeli (Q141915) | bod položky je 116 km od čáry |
| 45 | 31 | staty | P | Bahamy (Q778) | obrys pokrývá jen 80 % plochy státu na podkladové mapě; obrys se sám kříží (2×) |
| 46 | 31 | ostrovy | P | Borðoy (Q202170) | jen 42 % obrysu leží na nakreslené pevnině |
| 47 | 31 | ostrovy | P | Liparské ostrovy (Q179883) | jen 44 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 0.34× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 48 | 31 | reky | P | Orchon gol (Q237099) | žádný konec čáry není u ústí (Bajkal): nejblíž 160 km |
| 49 | 31 | jezera | P | Zvěřínské jezero (Q311217) | jen 49 % obrysu leží v jezeře nakresleném na mapě; jezero na podkladové mapě je 0.49× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 50 | 30 | more | Z | Bab-al-Mandab (Q83318) | 43 % obrysu moře leží na nakreslené pevnině |
| 51 | 30 | staty | Z | Chile (Q298) | obrys se sám kříží (9×) |
| 52 | 30 | staty | P | Kiribati (Q710) | obrys se sám kříží (8×) |
| 53 | 30 | pohori | Z | Masiv Králického Sněžníku (Q1529966) | obrys má jen 104.2 km² (podezřele malý mnohoúhelník pro pohori) |
| 54 | 30 | reky | P | Rudá řeka (Q206850) | bod položky je 103 km od čáry |
| 55 | 29 | reky | Z | Dráva (Q171009) | žádný konec čáry není u ústí (Dunaj): nejblíž 143 km |
| 56 | 29 | ostrovy | Z | Santorini (Q129296) | jen 44 % obrysu leží na nakreslené pevnině |
| 57 | 29 | ostrovy | P | Tortuga (Q208345) | jen 44 % obrysu leží na nakreslené pevnině |
| 58 | 28 | pohori | Z | Alborz (Q484725) | obrys má 57930 km², podle dat 155970 km² (0.37×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 59 | 28 | regiony | P | Altajská republika (Q5971) | obrys má 263430 km², podle dat 92903 km² (2.84×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 60 | 28 | regiony | Z | Asijút (Q29965) | obrys má 2587 km², podle dat 13720 km² (0.19×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 61 | 28 | regiony | Z | Asuán (Q29937) | obrys má 15883 km², podle dat 62726 km² (0.25×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 62 | 28 | staty | Z | Bosna a Hercegovina (Q225) | obrys má 51859 km², podle dat 10 km² (5185.91×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 63 | 28 | regiony | P | Cojedes (Q205460) | obrys má 13978 km², podle dat 1480 km² (9.44×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 64 | 28 | regiony | P | Csongrád-Csanád (Q193031) | obrys má 4263 km², podle dat 426174 km² (0.01×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 65 | 28 | regiony | P | Gíza (Q30832) | obrys má 37561 km², podle dat 13184 km² (2.85×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 66 | 28 | regiony | P | Gotland (Q103738) | obrys má 3101 km², podle dat 15196 km² (0.2×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 67 | 28 | regiony | P | Kená (Q31065) | obrys má 3523 km², podle dat 8980 km² (0.39×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 68 | 28 | reky | Z | Kongo (Q3503) | bod položky je 85 km od čáry |
| 69 | 28 | ostrovy | P | Lantau (Q502379) | jen 56 % obrysu leží na nakreslené pevnině; obrys se sám kříží (1×) |
| 70 | 28 | priroda | Z | Libyjská poušť (Q181528) | obrys má 3027595 km², podle dat 1100000 km² (2.75×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 71 | 28 | regiony | P | Ligurie (Q1256) | obrys má 1854 km², podle dat 5422 km² (0.34×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 72 | 28 | staty | P | Maledivy (Q826) | obrys má 32 km², podle dat 298 km² (0.11×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 73 | 28 | reky | Z | Missouri (Q5419) | bod položky je 83 km od čáry |
| 74 | 28 | priroda | P | Národní park Aigüestortes i Estany de Sant Maurici (Q1470066) | obrys má 143 km², podle dat 409 km² (0.35×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 75 | 28 | regiony | P | Ohňová země (Q44832) | obrys má 21019 km², podle dat 987168 km² (0.02×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 76 | 28 | regiony | P | Port Said (Q31079) | obrys má 398 km², podle dat 1345 km² (0.3×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 77 | 28 | ostrovy | P | Salamis (Q202422) | jen 45 % obrysu leží na nakreslené pevnině |
| 78 | 28 | regiony | Z | Stockholm (Q104231) | obrys má 5603 km², podle dat 16720 km² (0.34×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 79 | 28 | pohori | P | Strandža (Q539174) | obrys má 3776 km², podle dat 10000 km² (0.38×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 80 | 28 | regiony | P | Súhág (Q30669) | obrys má 2630 km², podle dat 11218 km² (0.23×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 81 | 28 | priroda | Z | Syrská poušť (Q339162) | obrys má 197623 km², podle dat 518000 km² (0.38×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 82 | 28 | regiony | Z | Tegu (Q20927) | obrys má 462 km², podle dat 1500 km² (0.31×; bod leží uvnitř – může být špatně i rozloha v datech) |
| 83 | 27 | ostrovy | Z | Barbuda (Q238752) | obrys se sám kříží (7×) |
| 84 | 27 | ostrovy | Z | Fyn (Q26503) | obrys se sám kříží (7×) |
| 85 | 27 | priroda | P | Národní park Cevenny (Q1368807) | obrys se sám kříží (7×) |
| 86 | 27 | priroda | P | Národní park Cuyahoga Valley (Q152820) | obrys se sám kříží (7×) |
| 87 | 26 | priroda | P | Národní park Biscayne (Q866080) | jen 8 % obrysu leží na nakreslené pevnině |
| 88 | 26 | reky | P | Neretva (Q190777) | čára má 350 km, řeka podle dat 225 km (1.55×) |
| 89 | 26 | jezera | P | Tisza-tó (Q1072359) | jen 28 % obrysu leží v jezeře nakresleném na mapě |
| 90 | 26 | ostrovy | P | Vnitřní Hebridy (Q81052) | ostrov na podkladové mapě je 0.21× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 91 | 26 | reky | P | Xingu (Q49544) | bod položky je 56 km od čáry |
| 92 | 25 | reky | Z | Iravadi (Q26076) | bod položky je 53 km od čáry |
| 93 | 25 | reky | P | Kagera (Q2750140) | čára má 609 km, řeka podle dat 400 km (1.52×) |
| 94 | 25 | reky | Z | Limpopo (Q173017) | bod položky je 51 km od čáry |
| 95 | 25 | reky | P | Madre de Dios (Q849693) | žádný konec čáry není u ústí (Beni): nejblíž 102 km |
| 96 | 25 | reky | Z | Rhôna (Q602) | čára je přerušená: 2 nesouvislé části, mezera 60 km |
| 97 | 24 | ostrovy | Z | Britské ostrovy (Q38272) | jen 59 % obrysu leží na nakreslené pevnině; ostrov na podkladové mapě je 0.4× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 98 | 24 | ostrovy | P | Lolland (Q605839) | obrys se sám kříží (6×) |
| 99 | 24 | reky | Z | Menam-Čao-Praja (Q118850) | čára má 546 km, řeka podle dat 372 km (1.47×) |
| 100 | 24 | jezera | Z | Saimaa (Q192770) | obrys se sám kříží (6×) |
| 101 | 24 | staty | Z | Spojené státy americké (Q30) | obrys se sám kříží (6×) |
| 102 | 23 | ostrovy | P | Amager (Q210396) | jen 51 % obrysu leží na nakreslené pevnině |
| 103 | 23 | ostrovy | P | Haida Gwaii (Q210907) | ostrov na podkladové mapě je 0.27× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 104 | 23 | reky | P | Kwando (Q182942) | čára má 1046 km, řeka podle dat 731 km (1.43×) |
| 105 | 23 | ostrovy | P | Martha's Vineyard (Q49148) | jen 51 % obrysu leží na nakreslené pevnině |
| 106 | 23 | ostrovy | P | Milos (Q203979) | jen 51 % obrysu leží na nakreslené pevnině |
| 107 | 23 | reky | P | Nelson (Q3292) | čára má 925 km, řeka podle dat 644 km (1.44×) |
| 108 | 23 | reky | Z | Něva (Q645) | čára má 105 km, řeka podle dat 74 km (1.42×) |
| 109 | 23 | ostrovy | P | Streymoy (Q192540) | jen 51 % obrysu leží na nakreslené pevnině |
| 110 | 22 | reky | Z | Dněpr (Q40855) | čára je přerušená: 2 nesouvislé části, mezera 46 km |
| 111 | 22 | jezera | P | Päijänne (Q213769) | jezero na podkladové mapě je 3.33× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 112 | 22 | reky | P | Suchona (Q82812) | čára má 782 km, řeka podle dat 558 km (1.4×) |
| 113 | 22 | ostrovy | P | Svatý Kryštof (Q204989) | jen 52 % obrysu leží na nakreslené pevnině |
| 114 | 21 | priroda | P | Delmarva (Q1044515) | obrys se sám kříží (5×) |
| 115 | 21 | ostrovy | P | Floridské ostrovy (Q537749) | obrys se sám kříží (5×) |
| 116 | 21 | ostrovy | Z | Hebridy (Q123377) | ostrov na podkladové mapě je 0.33× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 117 | 21 | priroda | P | Kerčský poloostrov (Q2084527) | obrys se sám kříží (5×) |
| 118 | 21 | staty | P | Marshallovy ostrovy (Q709) | obrys se sám kříží (5×) |
| 119 | 21 | priroda | P | Národní park Réunion (Q550389) | obrys se sám kříží (5×) |
| 120 | 21 | priroda | P | Národní park Shenandoah (Q1137401) | obrys se sám kříží (5×) |
| 121 | 21 | regiony | P | Nunavut (Q2023) | obrys se sám kříží (5×) |
| 122 | 21 | reky | Z | São Francisco (Q142148) | čára je přerušená: 2 nesouvislé části, mezera 43 km |
| 123 | 20 | reky | Z | Bílý Nil (Q4814791) | čára je přerušená: 2 nesouvislé části, mezera 41 km |
| 124 | 20 | jezera | P | Bledské jezero (Q648902) | obrys je jen trojúhelník |
| 125 | 20 | reky | P | Hrazdan (Q30548) | čára má 184 km, řeka podle dat 141 km (1.3×) |
| 126 | 20 | ostrovy | P | Chafarinas (Q130574) | obrys je jen trojúhelník |
| 127 | 20 | reky | P | Lesní Nába (Q447783) | čára má 130 km, řeka podle dat 99 km (1.31×) |
| 128 | 20 | ostrovy | Z | Lofoty (Q186822) | ostrov na podkladové mapě je 2.79× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 129 | 20 | ostrovy | P | Reichenau (Q156439) | obrys je jen trojúhelník |
| 130 | 20 | jezera | P | Tjörnin (Q945753) | obrys je jen trojúhelník |
| 131 | 18 | pohori | P | Broumovské stěny (Q981028) | obrys se sám kříží (4×) |
| 132 | 18 | ostrovy | Z | Džerba (Q188938) | obrys se sám kříží (4×) |
| 133 | 18 | jezera | Z | Eyreovo jezero (Q179970) | obrys se sám kříží (4×) |
| 134 | 18 | jezera | P | Lagoa dos Patos (Q661235) | podkladová mapa kreslí jezero jako záliv moře (92 % obrysu na vodě); obrys se sám kříží (2×) |
| 135 | 18 | priroda | P | Národní park Fiordland (Q877719) | obrys se sám kříží (4×) |
| 136 | 18 | priroda | Z | Národní park Grand Canyon (Q220289) | obrys se sám kříží (4×) |
| 137 | 18 | priroda | P | Národní park Great Smoky Mountains (Q464004) | obrys se sám kříží (4×) |
| 138 | 18 | ostrovy | P | Skyros (Q208566) | jen 56 % obrysu leží na nakreslené pevnině |
| 139 | 17 | reky | Z | Kura (Q156557) | čára je přerušená: 2 nesouvislé části, mezera 28 km |
| 140 | 17 | staty | Z | Lichtenštejnsko (Q347) | jen 79 % obrysu leží ve státech, které položka uvádí (Lichtenštejnsko) |
| 141 | 17 | ostrovy | P | Ostrovy Juana Fernandéze (Q156325) | jen 31 % obrysu leží na nakreslené pevnině |
| 142 | 17 | pohori | P | Pindos (Q201582) | jen 64 % obrysu leží ve státech, které položka uvádí (Řecko) |
| 143 | 17 | reky | Z | Rio Grande (Q160636) | čára je přerušená: 2 nesouvislé části, mezera 29 km |
| 144 | 17 | regiony | Z | Ženeva (Q11917) | jen 79 % obrysu leží ve státech, které položka uvádí (Švýcarsko) |
| 145 | 16 | ostrovy | P | Eysturoy (Q200939) | ostrov na podkladové mapě je 2.05× větší než obrys (zvýrazní se obrys, ne tvar z mapy) |
| 146 | 16 | staty | P | Kapverdy (Q1011) | jen 79 % obrysu leží v ploše státu na podkladové mapě (zvýrazní se jiná plocha, než ze které se počítají body) |
| 147 | 16 | ostrovy | P | Kunoy (Q212033) | jen 59 % obrysu leží na nakreslené pevnině |
| 148 | 16 | ostrovy | P | Nevis (Q207794) | jen 59 % obrysu leží na nakreslené pevnině |
| 149 | 16 | regiony | P | Perlis (Q213467) | jen 80 % obrysu leží ve státech, které položka uvádí (Malajsie) |
| 150 | 15 | priroda | P | Cape Cod (Q49152) | obrys se sám kříží (3×) |

… a dalších 95 (viz JSON).

## Sestavení otázek

Otázek 7864; pohled: Česko 1406, celý svět 4186, kontinent 2272; skupin stejnojmenných míst dál než 30 km od sebe 72; zadání s doplněným druhem 62.

| Závažnost | Téma | Druh | Úr. | Místo | Nález |
|---|---|---|---|---|---|
| střední | historie | udalosti | Z | Vídeňský kongres (Q46362) | Zadání nesedí v rodě: „Kde se konala Vídeňský kongres?“ |
| střední | historie | udalosti | P | Berlínský kongres (Q151423) | Zadání nesedí v rodě: „Kde se konala Berlínský kongres?“ |
| střední | historie | udalosti | P | Summit Země (Q751149) | Zadání nesedí v rodě: „Kde se konala Summit Země?“ |
| střední | historie | udalosti | P | Shromáždění v Seneca Falls (Q2736155) | Zadání nesedí v rodě: „Kde se konala Shromáždění v Seneca Falls?“ |
| střední | historie | udalosti | P | Haagský kongres (Q1566327) | Zadání nesedí v rodě: „Kde se konala Haagský kongres?“ |
| nízké | zemepis | pohori | Z | Smrčiny (Q157728) | Smrčiny: bod je na samém okraji mapy Česka |
| nízké | zemepis | pohori | P | Vnější Západní Karpaty (Q1997432) | Vnější Západní Karpaty: bod je na samém okraji mapy Česka |
| informace |  |  |  | Keňa  | Stejné jméno bez druhu v zadání („Kde leží Keňa?“): Keňa (staty, zemepis, Q114) × Kená (regiony, vlajky, Q31065) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Moskva  | Stejné jméno bez druhu v zadání („Kde leží Moskva?“): Moskva (regiony, vlajky, Q649) × Moskva (reky, zemepis, Q175117) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | New York  | Stejné jméno bez druhu v zadání („Kde leží New York?“): New York (mesta, zemepis, Q60) × New York (regiony, vlajky, Q1384) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Rio de Janeiro  | Stejné jméno bez druhu v zadání („Kde leží Rio de Janeiro?“): Rio de Janeiro (mesta, zemepis, Q8678) × Rio de Janeiro (regiony, vlajky, Q41428) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Káhira  | Stejné jméno bez druhu v zadání („Kde leží Káhira?“): Káhira (mesta, zemepis, Q85) × Káhira (regiony, vlajky, Q30805) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | São Paulo  | Stejné jméno bez druhu v zadání („Kde leží São Paulo?“): São Paulo (mesta, zemepis, Q174) × São Paulo (regiony, vlajky, Q175) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Lima  | Stejné jméno bez druhu v zadání („Kde leží Lima?“): Lima (mesta, zemepis, Q2868) × Lima (regiony, vlajky, Q211795) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Mississippi  | Stejné jméno bez druhu v zadání („Kudy teče Mississippi?“): Mississippi (reky, zemepis, Q1497) × Mississippi (regiony, vlajky, Q1494) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | La Paz  | Stejné jméno bez druhu v zadání („Kde leží La Paz?“): La Paz (mesta, zemepis, Q1491) × La Paz (regiony, vlajky, Q272784) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Sucre  | Stejné jméno bez druhu v zadání („Kde leží Sucre?“): Sucre (mesta, zemepis, Q2907) × Sucre (regiony, vlajky, Q235188) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Québec  | Stejné jméno bez druhu v zadání („Kde leží Québec?“): Québec (mesta, zemepis, Q2145) × Québec (regiony, vlajky, Q176) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Córdoba  | Stejné jméno bez druhu v zadání („Kde leží Córdoba?“): Córdoba (mesta, zemepis, Q5818) × Córdoba (regiony, vlajky, Q44759) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Santa Fe  | Stejné jméno bez druhu v zadání („Kde leží Santa Fe?“): Santa Fe (mesta, zemepis, Q38555) × Santa Fé (regiony, vlajky, Q44823) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Olympia  | Stejné jméno bez druhu v zadání („Kde leží Olympia?“): Olympia (mesta, zemepis, Q42735) × Olympia (stavby, architektura, Q915451) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | San Juan  | Stejné jméno bez druhu v zadání („Kde leží San Juan?“): San Juan (mesta, zemepis, Q41211) × San Juan (regiony, vlajky, Q44805) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Cuzco  | Stejné jméno bez druhu v zadání („Kde leží Cuzco?“): Cuzco (mesta, zemepis, Q5582862) × Cuzco (regiony, vlajky, Q205057) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Gíza  | Stejné jméno bez druhu v zadání („Kde leží Gíza?“): Gíza (mesta, zemepis, Q81788) × Gíza (regiony, vlajky, Q30832) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Santander  | Stejné jméno bez druhu v zadání („Kde leží Santander?“): Santander (mesta, zemepis, Q12233) × Santander (regiony, vlajky, Q235166) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Missouri  | Stejné jméno bez druhu v zadání („Kudy teče Missouri?“): Missouri (reky, zemepis, Q5419) × Missouri (regiony, vlajky, Q1581) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Ontario  | Stejné jméno bez druhu v zadání („Kde leží Ontario?“): Ontario (jezera, zemepis, Q1062) × Ontario (regiony, vlajky, Q1904) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Arequipa  | Stejné jméno bez druhu v zadání („Kde leží Arequipa?“): Arequipa (mesta, zemepis, Q159273) × Arequipa (regiony, vlajky, Q205068) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Yukon  | Stejné jméno bez druhu v zadání („Kudy teče Yukon?“): Yukon (reky, zemepis, Q104437) × Yukon (regiony, vlajky, Q2009) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Ohio  | Stejné jméno bez druhu v zadání („Kudy teče Ohio?“): Ohio (reky, zemepis, Q4915) × Ohio (regiony, vlajky, Q1397) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Paraná  | Stejné jméno bez druhu v zadání („Kudy teče Paraná?“): Paraná (reky, zemepis, Q127892) × Paraná (regiony, vlajky, Q15499) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Magdalena  | Stejné jméno bez druhu v zadání („Kudy teče Magdalena?“): Magdalena (reky, zemepis, Q191829) × Magdalena (regiony, vlajky, Q199910) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Arkansas  | Stejné jméno bez druhu v zadání („Kudy teče Arkansas?“): Arkansas (reky, zemepis, Q8319) × Arkansas (regiony, vlajky, Q1612) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Bío-Bío  | Stejné jméno bez druhu v zadání („Kudy teče Bío-Bío?“): Bío-Bío (reky, zemepis, Q93360) × Bío-Bío (regiony, vlajky, Q2170) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Tennessee  | Stejné jméno bez druhu v zadání („Kudy teče Tennessee?“): Tennessee (reky, zemepis, Q193737) × Tennessee (regiony, vlajky, Q1509) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Ticino  | Stejné jméno bez druhu v zadání („Kudy teče Ticino?“): Ticino (reky, zemepis, Q14366) × Ticino (regiony, vlajky, Q12724) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Ucayali  | Stejné jméno bez druhu v zadání („Kudy teče Ucayali?“): Ucayali (reky, zemepis, Q200952) × Ucayali (regiony, vlajky, Q207424) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Roraima  | Stejné jméno bez druhu v zadání („Kde leží Roraima?“): Roraima (hory, zemepis, Q4777) × Roraima (regiony, vlajky, Q42508) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Olt  | Stejné jméno bez druhu v zadání („Kudy teče Olt?“): Olt (reky, zemepis, Q126822) × Olt (regiony, vlajky, Q188945) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Santiago  | Stejné jméno bez druhu v zadání („Kde leží Santiago?“): Santiago (ostrovy, zemepis, Q108448) × Santiago (hory, zemepis, Q408217) × Santiago (regiony, vlajky, Q2131) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Argeș  | Stejné jméno bez druhu v zadání („Kudy teče Argeș?“): Argeș (reky, zemepis, Q214811) × Argeș (regiony, vlajky, Q179567) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Timiș  | Stejné jméno bez druhu v zadání („Kudy teče Timiș?“): Timiș (reky, zemepis, Q214894) × Timiș (regiony, vlajky, Q185586) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Putumayo  | Stejné jméno bez druhu v zadání („Kudy teče Putumayo?“): Putumayo (reky, zemepis, Q213782) × Putumayo (regiony, vlajky, Q232953) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Jura  | Stejné jméno bez druhu v zadání („Kde leží Jura?“): Jura (ostrovy, zemepis, Q111509) × Jura (regiony, vlajky, Q12755) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Saskatchewan  | Stejné jméno bez druhu v zadání („Kudy teče Saskatchewan?“): Saskatchewan (reky, zemepis, Q3047) × Saskatchewan (regiony, vlajky, Q1989) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Beni  | Stejné jméno bez druhu v zadání („Kudy teče Beni?“): Beni (reky, zemepis, Q142604) × Beni (regiony, vlajky, Q233169) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Colima  | Stejné jméno bez druhu v zadání („Kde leží Colima?“): Colima (hory, zemepis, Q825347) × Colima (regiony, vlajky, Q61309) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Illinois  | Stejné jméno bez druhu v zadání („Kudy teče Illinois?“): Illinois (reky, zemepis, Q8321) × Illinois (regiony, vlajky, Q1204) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Connecticut  | Stejné jméno bez druhu v zadání („Kudy teče Connecticut?“): Connecticut (reky, zemepis, Q379648) × Connecticut (regiony, vlajky, Q779) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Ialomița  | Stejné jméno bez druhu v zadání („Kudy teče Ialomița?“): Ialomița (reky, zemepis, Q726693) × Ialomița (regiony, vlajky, Q193044) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Santa Cruz  | Stejné jméno bez druhu v zadání („Kde leží Santa Cruz?“): Santa Cruz (ostrovy, zemepis, Q713127) × Santa Cruz (regiony, vlajky, Q44821) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Madre de Dios  | Stejné jméno bez druhu v zadání („Kudy teče Madre de Dios?“): Madre de Dios (reky, zemepis, Q849693) × Madre de Dios (regiony, vlajky, Q210896) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Manitoba  | Stejné jméno bez druhu v zadání („Kde leží Manitoba?“): Manitoba (jezera, zemepis, Q645901) × Manitoba (regiony, vlajky, Q1948) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Junín  | Stejné jméno bez druhu v zadání („Kde leží Junín?“): Junín (jezera, zemepis, Q941342) × Junín (regiony, vlajky, Q207973) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Radnice  | Stejné jméno bez druhu v zadání („Kde leží Radnice?“): Radnice (mesta, zemepis, Q1520116) × Radnice (stavby, architektura, Q31981324) – různá témata, rozliší jen štítek druhu nad otázkou |
| informace |  |  |  | Děvín  | Stejné jméno bez druhu v zadání („Kde leží Děvín?“): Děvín (hory, zemepis, Q11863118) × Devín (stavby, architektura, Q830976) – různá témata, rozliší jen štítek druhu nad otázkou |

### Zadání podle vzoru (k ruční kontrole)

| Vzor | Počet | Ukázky |
|---|---:|---|
| Kde leží …? | 4226 | Kde leží Turecko? · Kde leží Francie? · Kde leží Indonésie? · Kde leží Maroko? · Kde leží Namibie? · Kde leží Středoafrická republika? |
| Kde stojí …? | 2694 | Kde stojí Velká čínská zeď? · Kde stojí Eiffelova věž? · Kde stojí Abú Simbel? · Kde stojí Chrám Vasila Blaženého? · Kde stojí Kielský průplav? · Kde stojí Katedrála svatého Štěpána ve Vídni? |
| Kudy teče …? | 345 | Kudy teče Nil? · Kudy teče Amazonka? · Kudy teče Tajo? · Kudy teče řeka Paraguay? · Kudy teče Benue? · Kudy teče Adda? |
| Kde se odehrála bitva …? | 351 | Kde se odehrála bitva u Stalingradu? · Kde se odehrála bitva u Waterloo? · Kde se odehrála bitva u Stamfordského mostu? · Kde se odehrála bitva u Milvijského mostu? · Kde se odehrála bitva u Mykalé? · Kde se odehrála bitva u jezera Chasan? |
| Kde se odehrálo obléhání …? | 26 | Kde se odehrálo obléhání Jeruzaléma? · Kde se odehrálo obléhání Konstantinopole? |
| Kde se konala …? | 14 | Kde se konala Vídeňský kongres? · Kde se konala Jaltská konference? |
| Kde byla podepsána …? | 20 | Kde byla podepsána Versailleská smlouva? · Kde byla podepsána Pařížská dohoda? |
| … – kde se to stalo? | 188 | Pád Konstantinopole – kde se to stalo? · Vylodění v Normandii – kde se to stalo? · Bombardování Rotterdamu – kde se to stalo? · Vestfálský mír – kde se to stalo? · Zemětřesení v Tchang-šanu – kde se to stalo? · Let Turkish Airlines 981 – kde se to stalo? |

### Zadání s doplněným druhem (stejné jméno u jiného druhu místa)

„Kde leží stát Irsko?“ · „Kde leží město Moskva?“ · „Kde leží stát Uruguay?“ · „Kde leží stát Černá Hora?“ · „Kde leží stát Tchaj-wan?“ · „Kde leží stát San Marino?“ · „Kde leží stát Paraguay?“ · „Kde leží stát Senegal?“ · „Kde leží stát Kuvajt?“ · „Kde leží stát Panama?“ · „Kde leží stát Niger?“ · „Kde leží stát Gambie?“ · „Kde leží stát Malawi?“ · „Kde leží město Vancouver?“ · „Kde leží ostrov Irsko?“ · „Kde leží město Kuvajt?“ · „Kde leží město Panamá?“ · „Kde leží ostrov Montserrat?“ · „Kudy teče řeka Niger?“ · „Kde leží město San Marino?“ · „Kde leží pohoří Ural?“ · „Kde leží město Columbia?“ · „Kde leží město Versailles?“ · „Kudy teče řeka Ural?“ · „Kde stojí palác Versailles?“ · „Kde leží jezero Malawi?“ · „Kde leží poloostrov Kamčatka?“ · „Kde leží vodopád Iguaçu?“ · „Kde leží ostrov Tchaj-wan?“ · „Kudy teče řeka Columbia?“ · „Kudy teče řeka Uruguay?“ · „Kudy teče řeka Moskva?“ · „Kudy teče řeka Senegal?“ · „Kde leží ostrov Vancouver?“ · „Kudy teče řeka Gambie?“ · „Kudy teče řeka Paraguay?“ · „Kudy teče řeka Madeira?“ · „Kudy teče řeka Volta?“ · „Kde leží jezero Tana?“ · „Kde leží ostrov Salamis?“ · „Kde leží ostrov Fraser?“ · „Kde leží přehradní nádrž Volta?“ · „Kde leží starověké město Kiš?“ · „Kde leží jezero Athabasca?“ · „Kde leží ostrov Santiago?“ · „Kde leží ostrov Kiš?“ · „Kde leží náměstí Registán?“ · „Kudy teče řeka Fraser?“ · „Kde leží sopka Taal?“ · „Kudy teče řeka Athabasca?“ · „Kde stojí opevnění Staré město?“ · „Kudy teče řeka Kamčatka?“ · „Kde leží ostrov Madeira?“ · „Kde leží hora Montserrat?“ · „Kudy teče řeka Tugela?“ · „Kde leží vodopád Tugela?“ · „Kde leží starověké město Salamis?“ · „Kde leží sopka Santiago?“ · „Kde leží jezero Taal?“ · „Kde leží poušť Régistán?“ · „Kde leží hora Ještěd?“ · „Kde stojí rozhledna Ještěd?“

## Pokrytí

Položek s polohou / otázek na mapě / z toho s obrysem; úroveň Základní (k = 1) a Pokročilá (ostatní).

| Druh | Základní: položek | otázek | s obrysem | Pokročilá: položek | otázek | s obrysem | Vyřazeno opravami |
|---|---:|---:|---:|---:|---:|---:|---:|
| Město | 488 | 486 | 0 | 929 | 921 | 0 | 0 |
| Stát | 152 | 150 | 150 | 45 | 45 | 45 | 0 |
| Hora | 92 | 84 | 0 | 344 | 336 | 0 | 0 |
| Pohoří | 81 | 37 | 37 | 175 | 67 | 67 | 0 |
| Řeka | 139 | 130 | 130 | 417 | 215 | 215 | 0 |
| Jezero | 44 | 43 | 32 | 228 | 226 | 158 | 0 |
| Moře a zálivy | 78 | 64 | 64 | 152 | 62 | 62 | 3 |
| Ostrov | 120 | 90 | 88 | 323 | 245 | 211 | 2 |
| Příroda | 134 | 106 | 62 | 560 | 338 | 167 | 0 |
| Stavba | 817 | 660 | 0 | 2087 | 1804 | 0 | 0 |
| Bitva | 104 | 79 | 0 | 441 | 365 | 0 | 0 |
| Událost | 69 | 44 | 0 | 143 | 111 | 0 | 3 |
| Region | 198 | 196 | 196 | 524 | 523 | 523 | 0 |
| Sportoviště | 123 | 108 | 0 | 332 | 329 | 0 | 0 |
| **Celkem** | 2639 | 2277 | 759 | 6700 | 5587 | 1448 | 8 |

### Proč se mapa na místo neptá

Položky povoleného druhu s polohou, ze kterých otázka na mapě nevznikne; vypsané jsou jen položky úrovně Základní.

| Důvod | Základní | Pokročilá | Položky úrovně Základní |
|---|---:|---:|---|
| vyřazeno v data/mapa-opravy.json | 1 | 7 | Smlouva o nešíření jaderných zbraní (udalosti) |
| plošné místo nebo řeka bez obrysu v data/mapa-tvary.json | 80 | 442 | Karibik (ostrovy), Pitcairnovy ostrovy (ostrovy), Polynésie (ostrovy), Kavkaz (pohori), Indočína (priroda), Apeniny (pohori), Malé Sundy (ostrovy), Atacama (priroda), Apeninský poloostrov (priroda), Shetlandy (ostrovy), Heardův ostrov a McDonaldovy ostrovy (ostrovy), Akabský záliv (more), Keltské moře (more), Orkneje (ostrovy), Skandinávský poloostrov (priroda), Río de la Plata (reky), Mariany (ostrovy), Kyklady (ostrovy), Markézy (ostrovy), Ha Long (more), Stara planina (pohori), Země Františka Josefa (ostrovy), Kerčský průliv (more), Dolomity (pohori), Panenské ostrovy (ostrovy), Kergueleny (ostrovy), Calaiská úžina (more), Aljašský záliv (more), Sundský průliv (more), Vinson Massif (pohori), Společenské ostrovy (ostrovy), Campi Flegrei (pohori), Perlová řeka (reky), Dánský průliv (more), Tuamotu (ostrovy), Tajmyr (priroda), Arabská poušť (priroda), Moře Scotia (more), Istrie (priroda), Sajany (pohori), Gilbertovy ostrovy (ostrovy), Mohavská poušť (priroda), Labrador (priroda), Velký Kavkaz (pohori), Žluté hory (pohori), Eifel (pohori), Ahaggar (pohori), Krkonošsko-jesenická subprovincie (pohori), Arménská vysočina (pohori), Antilibanon (pohori), Aljašský poloostrov (priroda), Krkonoše (pohori), Beskydy (pohori), Šumava (pohori), Děčínská vrchovina (pohori), Lužické hory (pohori), Český ráj (pohori), Jizerské hory (pohori), Slezské Beskydy (pohori), Český les (pohori) … a dalších 20 |
| položka uvádí Česko mezi více státy, ale bod leží mimo mapu Česka (regionFor nevrátí oblast) | 2 | 0 | Karpaty (pohori), Západní Karpaty (pohori) |
| položka uvádí jen státy, které hra nezná (SSSR, nacistické Německo…), nebo státy z více kontinentů bez většiny – kontinent se neurčí, i když bod leží ve výřezu | 12 | 20 | Atomové bombardování Hirošimy a Nagasaki (bitvy), Bitva v Kurském oblouku (bitvy), Obléhání Leningradu (bitvy), Bitva před Moskvou (bitvy), Bitva u Hattínu (bitvy), Obléhání Bagdádu (1258) (bitvy), Černý leden (bitvy), Holokaust (udalosti), Zemětřesení v Indickém oceánu (2004) (udalosti), Křišťálová noc (udalosti), Nankingský masakr (udalosti), Berlínská konference (udalosti) |
| bod leží mimo výřez svého kontinentu (odlehlé ostrovy, Sibiř u státu Rusko, Antarktida) | 31 | 73 | Rusko (staty), Guam (ostrovy), Honolulu (mesta), Velikonoční ostrov (ostrovy), Vánoční ostrov (ostrovy), Špicberky (ostrovy), Nová Guinea (ostrovy), Tahiti (ostrovy), Beringovo moře (more), Karské moře (more), Východosibiřské moře (more), Grónské moře (more), Pearl Harbor (jezera), Rossovo moře (more), Mauna Kea (hory), Havajské ostrovy (ostrovy), Oahu (ostrovy), Antarktický poloostrov (priroda), Puncak Jaya (hory), Západní Špicberk (ostrovy), Wrangelův ostrov (ostrovy), Čukotský poloostrov (priroda), Maui (ostrovy), Kauai (ostrovy), Severní země (ostrovy), Mount Erebus (hory), Transantarktické pohoří (pohori), Národní park Severovýchodní Grónsko (priroda), Útok na Pearl Harbor (bitvy), Bitva u Midway (bitvy), Bitva o Iwodžimu (bitvy) |
| stejné jméno má jiné místo téhož druhu dál než 30 km | 40 | 100 | San José (mesta), Katedrála Notre-Dame (stavby), Severní ostrov (ostrovy), Colorado (reky), Río Negro (reky), Sierra Nevada (pohori), Pantheon (stavby), Umajjovská mešita (stavby), Katedrála Notre-Dame (stavby), Sierra Nevada (pohori), Nemrut (hory), Národní park Glacier (priroda), Smrk (Moravskoslezské Beskydy) (hory), Katedrála Notre-Dame (Paříž) (stavby), Vítězný oblouk (Paříž) (stavby), Pantheon (stavby), Umajjovská mešita (stavby), Katedrála Notre-Dame (Chartres) (stavby), Mešita Selimiye (stavby), Belveder (palác) (stavby), Pantheon (Paříž) (stavby), Dóžecí palác (Benátky) (stavby), Katedrála Notre-Dame (Remeš) (stavby), Katedrála Notre-Dame (Amiens) (stavby), Katedrála Nanebevzetí Panny Marie (Siena) (stavby), Katedrála svatého Patrika (New York) (stavby), Katedrála Nanebevzetí Panny Marie (Pisa) (stavby), Kostel svatého Jana Nepomuckého (Žďár nad Sázavou) (stavby), Kostel Všech svatých (Sedlec) (stavby), Katedrála Nanebevzetí Panny Marie (Monreale) (stavby), Velká synagoga (stavby), Kostel Panny Marie Sněžné (Praha) (stavby), Kostel Všech svatých (Pražský hrad) (stavby), Kostel svatého Jakuba Staršího (Brno) (stavby), Nová radnice (Praha) (stavby), Bazilika Sacré-Cœur (stavby), Velká synagoga (Budapešť) (stavby), Nová radnice (Ostrava) (stavby), O2 Arena (sportoviste), O₂ arena (sportoviste) |
| Česko na mapě Česka nebo stavba ve velkém českém městě | 151 | 208 | Česko (staty), Pražský hrad (stavby), Karlův most (stavby), Katedrála svatého Víta v Praze (stavby), Václavské náměstí (stavby), Národní muzeum (stavby), Staroměstské náměstí (stavby), Kostel Panny Marie před Týnem (stavby), Strahovský klášter (stavby), Berounka (reky), Svitava (reky), Katedrála svatého Petra a Pavla (stavby), Žižkovský vysílač (stavby), Petřín (hory), Prašná brána (stavby), Špilberk (stavby), Bazilika svatého Jiří (stavby), Pravoslavný chrám svatého Cyrila a Metoděje v Praze (stavby), Kostel svatého Mikuláše na Malé Straně (stavby), Stavovské divadlo (stavby), Petřínská rozhledna (stavby), Katedrála svatého Bartoloměje (stavby), Stalinův pomník na Letné (stavby), Letohrádek královny Anny (stavby), Zámek Troja (stavby), Emauzský klášter (stavby), Černínský palác v Praze (stavby), Hvězda (stavby), AZ Tower (stavby), Národní památník na Vítkově (stavby), Pomník svatého Václava (stavby), Letná (hory), Karlův most (stavby), Katedrála svatého Víta v Praze (stavby), Tančící dům (stavby), Vila Tugendhat (stavby), Staronová synagoga (stavby), Žižkovský vysílač (stavby), Prašná brána (stavby), Bazilika svatého Jiří (stavby), Rudolfinum (stavby), Kostel svatého Mikuláše na Malé Straně (stavby), Pravoslavný chrám svatého Cyrila a Metoděje v Praze (stavby), Bazilika svatých Petra a Pavla na Vyšehradě (stavby), Staroměstská radnice (stavby), Kostel svatého Mikuláše v Praze-Starém Městě (stavby), Palác Kinských (stavby), Obecní dům (stavby), Maiselova synagoga (stavby), Katedrála svatého Bartoloměje (stavby), Státní opera Praha (stavby), Letohrádek královny Anny (stavby), Bazilika svaté Ludmily (stavby), Pražská Loreta (stavby), Kostel Panny Marie Vítězné a svatého Antonína Paduánského (stavby), Zámek Troja (stavby), Černínský palác v Praze (stavby), Dům U Černé Matky Boží (stavby), Mánesův most (stavby), Hvězda (stavby) … a dalších 91 |
| bod neleží na nakreslené pevnině (moře, nenakreslený ostrov) | 3 | 37 | Bitva u Jutska (bitvy), Bitva v Korálovém moři (bitvy), Zemětřesení v Lisabonu v roce 1755 (udalosti) |

## Opravy (data/mapa-opravy.json)

Bez nálezů.

### Vyřazená místa

| Místo | Důvod |
|---|---|
| Smlouva o nešíření jaderných zbraní (Q186444) | Smlouva o nešíření jaderných zbraní byla podepsána současně ve Washingtonu, Londýně a Moskvě – jedno místo na mapě nemá. |
| Koupě Aljašky (Q309029) | Koupě Aljašky: otázka „kde se to stalo“ míří na Aljašku, ale bod je místo podpisu smlouvy ve Washingtonu. |
| Basilejsko-ferrarsko-florentský koncil (Q321032) | Basilejsko-ferrarsko-florentský koncil zasedal postupně v Basileji, Ferraře a Florencii – jedno místo na mapě nemá. |
| Lošinj (Q461426) | Lošinj není na podkladové mapě nakreslený (v měřítku mapy splývá s Cresem) – zvýraznění ve výsledku by nebylo vidět. |
| Hadí ostrov (Q155868) | Hadí ostrov (0,17 km²) na podkladové mapě není – hráč by hledal místo, které nevidí. |
| Syvaš (Q1130771) | Syvaš je na podkladové mapě nakreslený jako pevnina – zvýraznění zálivu ve výsledku by nebylo vidět. |
| Viselský záliv (Q5605) | Viselský záliv je na podkladové mapě nakreslený jako pevnina – zvýraznění zálivu ve výsledku by nebylo vidět. |
| Schlei (Q312433) | Schlei (úzký záliv, 55 km²) je na podkladové mapě nakreslený jako pevnina – zvýraznění ve výsledku by nebylo vidět. |

### Opravené polohy

| Místo | Poloha | Důvod |
|---|---|---|
| Tridentský koncil (Q172991) | 46.067, 11.117 | Tridentský koncil zasedal v Tridentu (Trento, Wikidata Q3376); data měla Bolognu (44,494; 11,343), kam se koncil přesunul jen na čas. |
| Seychely (Q1042) | -4.624, 55.454 | Seychely: bod státu z Wikidat (−7,1; 52,767) leží v oceánu 384 km od ostrovů; poloha hlavního města Victoria (Q3940) na ostrově Mahé. |
| Tuvalu (Q672) | -8.505, 179.117 | Tuvalu: bod státu z Wikidat (−7,475; 178,006) leží v oceánu 172 km od nakreslených ostrovů; poloha hlavního města Funafuti (Q34126). |
| Marshallovy ostrovy (Q709) | 7.092, 171.38 | Marshallovy ostrovy: bod státu z Wikidat (9,82; 169,29) leží v oceánu 283 km od nakreslených ostrovů; poloha hlavního města Majuro (Q12919). |

## Ruční prohlídka

Ruční prohlídka vykreslených map (listopad 2026): podkladová mapa světa po oblastech, mapa Česka a výsledky asi 120 otázek všech
druhů. Tento soubor (`reports/audit-mapy-poznamky.md`) se do zprávy vkládá beze změny; po opravě záznam smažte.

### Obrysy k opravě (`scripts/build-mapa-tvary.mjs`)

- **Cordillera Blanca** (Q804330): obrys měří přes 1 600 km a vede podél celého peruánského pobřeží; pohoří má 200 km – je to obrys jiného
  objektu (nejspíš Západní Kordillery).
- **Witwatersrand** (Q587808): obrys měří 495 km, hřbet má 56 km.
- **Jang-c’-ťiang** (Q5413): chybí horní tok, čára začíná 710 km od bodu položky (pramen v Tibetu).
- **Nil** (Q3392): jen úsek od Chartúmu po Káhiru (2 562 z 6 650 km), nedosahuje ke Středozemnímu moři ani proti proudu k Viktoriinu jezeru.
- **Columbia** (Q2251): čára obsahuje i přítok Snake (větev do Idaha a Wyomingu) a má tři nesouvislé části.
- **Amazonka** (Q3783), **Ubangi** (Q171649), **Fraser** (Q269710), **Atbara** (Q753897): čára má méně než polovinu délky řeky.
- **Mackenzie** (Q3411): čára pokračuje přes Velké Otročí jezero, je přerušená (58 km) a nedosahuje k Beaufortovu moři.
- **Labe** (Q1644) na mapě Česka: na horním toku jsou navíc krátké větve vedle hlavního toku.
- **Benue** (Q204806), **Dráva** (Q171009), **Beni** (Q142604), **Orchon gol** (Q237099): konec čáry není u řeky nebo jezera, do kterých
  ústí (může chybět i kus čáry té druhé řeky – Niger, Dunaj).
- **Ostrovy Riau** (Q2223): obrys je mořská oblast 255 000 km² (provincie má 22 000 km² souše) – plné body dostane i tip do moře.
- **Vlieland** (Q207851), **Schiermonnikoog** (Q208011): obrys obce včetně moře (desetkrát větší než ostrov na mapě). Podobně
  **Falster** (Q735905) a **Alexandrovy ostrovy** (Q140510) nesedí s ostrovy na podkladové mapě.
- **Francie** (Q142): obrys obsahuje Francouzskou Guyanu, takže se výsledek oddálí přes celý Atlantik a Francie je na něm malá.
  Totéž hrozí u dalších států se zámořím; do obrysu státu by stačila část na jeho kontinentu.
- **Tung-tching-chu** (Q216083): rozvětvený obrys s osmi kříženími a třetinou rozlohy.
- **Georgian Bay** (Q1267413), **Benátská laguna** (Q76925), **Gibraltarský průliv** (Q36124), **Bab-al-Mandab** (Q83318): obrys „moře“
  leží z velké části na nakreslené pevnině nebo v jezeře, takže zvýraznění oříznuté na vodu není (skoro) vidět.
- 120 obrysů se samo kříží (Chile 9×, Kiribati 8×, Bratská přehradní nádrž 9×, Volta 5×) – po zjednodušení úzkých tvarů.
- Bez obrysu je 80 míst úrovně Základní, na která se proto mapa neptá: Kavkaz, Apeniny, Krkonoše, Šumava, Beskydy, Jizerské hory,
  Skandinávský a Apeninský poloostrov, Atacama, Kyklady, Dolomity, Istrie… (celý seznam v oddíle Pokrytí).

### K opravě v aplikaci (`question-map.js` – tady se neupravoval)

- **Zadání**: „Kde se konala Vídeňský kongres / Berlínský kongres / Haagský kongres / Summit Země / Shromáždění v Seneca Falls?“ –
  u druhu konference se má sloveso řídit rodem názvu (konal se kongres, konalo se shromáždění).
- **Stát přes 180. poledník** (Fidži, Kiribati): výsledek se oddálí na celý svět a špendlík je na okraji mapy.
- **Záliv jezera** (Georgian Bay): zvýraznění „moře“ se ořezává jen podle pevniny; jezero je také pevnina, takže zvýraznění zmizí.
- **Oblast položky** (`regionFor`): položka, která uvádí Česko mezi více státy a má bod mimo mapu Česka, se neptá vůbec (Karpaty,
  Západní Karpaty); položka, která uvádí jen státy, jež hra nezná (SSSR, nacistické Německo), nemá kontinent, i když bod leží ve
  výřezu (bitva v Kurském oblouku, obléhání Leningradu, bitva před Moskvou, Křišťálová noc… 12 míst úrovně Základní, 20 pokročilých);
  stát Rusko se neptá, protože jeho bod leží na Sibiři mimo výřez Evropy.
- **Pravidlo velkého českého města** vyřadí i řeky a vrchy s bodem do 8 km od centra (Berounka, Svitava, Petřín).
- **Ostrov s obrysem** se ptá, i když na podkladové mapě není nakreslený (kontrola nakreslené pevniny platí jen bez obrysu) – Lošinj
  a Hadí ostrov jsou zatím vyřazené v `data/mapa-opravy.json`.
- Hledání stejnojmenného místa (`sameNameElsewhere`) normalizuje u každé sestavené otázky jména všech položek tématu (v kontrole
  to dělalo minuty, proto se tam otázka sestavuje jen se stejnojmennými položkami).

### Data témat (nejsou chybou mapy)

- Bitva o Khe Sanh (Q247253, historie) uvádí stát Jižní Korea místo Vietnamu.
- Rozloha v datech: Bosna a Hercegovina 10 km², Csongrád-Csanád 426 174 km² (má být 4 263), Cojedes 1 480 km² (má být 14 800),
  region Ohňová země 987 168 km² (s nárokem v Antarktidě).
- V zeměpisu vůbec nejsou Černé, Baltské a Středozemní moře ani Kilimandžáro.
- Leeds Castle má jako město Leeds (leží v Kentu); Tridentský koncil má místo Bologna (poloha opravena v `data/mapa-opravy.json`).

