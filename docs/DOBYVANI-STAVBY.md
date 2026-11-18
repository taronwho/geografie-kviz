# Dobývání – nové stavby, ozdoby a sady hradů (návrh)

Stav: **čeká na obrázky** (docs/OBRAZKY.md oddíl 34, č. 409–413, a oddíl 35, č. 414–437). Do hry se zapojí najednou, až budou
všechny obrázky. Do té doby se nic z tohoto návrhu ve hře neukazuje.

## Stavby (místo opevnění)

Na svém území (ne na domovském hradu) si hráč tahem „Postavit“ vybere jednu stavbu. Opevnění (Palisáda → Hradba) je jedna
z možností, další jsou Strážní věž a Důl. Na území stojí vždy jen jedna stavba. Postavit ji stojí jeden tah, stejně jako opevnění,
a obléhané území stavět nejde.

### Strážní věž (č. 409)
- Když někdo zaútočí na území s věží, majitel dostane upozornění „Útok na tvé území, braň ho!“ a smí se do bitvy přidat,
  i když s územím nesousedí. Odpovídá stejnou otázku se stejným časem (60 s) jako ostatní.
- Když majitel odpoví správně a nejrychleji ze všech, útok je odražen: území zůstane jeho a věž stojí dál. Do kroniky se zapíše
  „Útok odražen“.
- Když bitvu vyhraje útočník, území získá a věž padne (zůstane po ní na mapě Zřícenina do konce kola).
- Věž nemá úrovně opevnění: útočník ji nemusí bourat po stupních, stačí jedna vyhraná bitva. Je to tedy jiná volba než hradba:
  hradba odolá dvěma útokům bez obránce, věž dá šanci ubránit se pokaždé, ale jen když je majitel online.
- Obrana stojí obránce tah jen tehdy, když ho ještě v kole má; bez tahů se přidat nejde.

### Důl (č. 410)
- Na konci hry dává území s dolem 2 body místo 1.
- Důl při dobytí nepadá: dobyvatel ho získá i s bonusem. Je tedy lákavým cílem.
- Nemá žádnou obranu: padne první vyhranou bitvou.

## Ozdoby (bez účinku)

- **Zřícenina** (č. 411): na území, kde v tomto kole padlo opevnění nebo věž, do konce kola.
- **Tábor obléhatelů** (č. 412): u obléhaného území, dokud trvá bitva; praporky v barvě útočníků (vedle pečeti se zkříženými meči).
- **Pomník vítěze** (č. 413): na domovském území vítěze na konečné mapě, v přehrání a v náhledu dohrané hry.

## Nové sady hradů (č. 414–437)

Stejný systém jako Gotický hrad, Orientální palác a Japonský hrad: domovský hrad ve stupních 0–3 a opevnění ostatních území 1–2,
výběr v okně Barva a znak (záložka Hrad), odemknutí podle statistik serveru (`conquest_look_stats`).

| Sada | Styl | Jak ji získat (návrh) |
|---|---|---|
| Perníkový hrad | perník, poleva, cukrové hole a bonbony | Kvíz dne: série 100 dní |
| Parostrojní pevnost | měď, mosaz, ozubená kola, komíny s párou | Vyhraj 100 bitev o území |
| Stromová tvrz | hrad vrostlý do obřího stromu, provazové lávky, houby | Drž do konce hry celkem 30 celých regionů |
| Ledový palác | ledové bloky, rampouchy, sníh | Poraz Bosse týdne 10× |

Nové stavby (věž, důl) a ozdoby mají jednu podobu pro všechny sady; jen praporky a střechy se barví barvou hráče.
