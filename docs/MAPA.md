# Mapa pro otázku „Ukaž na mapě“

Hráč klepne na slepou mapu, kde místo leží. Mapu tvoří tři soubory a jedna kontrola:

| Soubor | Co v něm je | Kdo ho píše |
|---|---|---|
| `data/mapa.json` | podkladová mapa: svět (Mercator, 8000 jednotek) a Česko (kraje, řeky) jako cesty SVG, plochy států pro „Tvůj tip · Thajsko“ | `npm run build:mapa` (`scripts/build-mapa.mjs`) |
| `data/mapa-tvary.json` | obrysy plošných míst a průběh řek podle QID (trefa kamkoli dovnitř) | `npm run build:mapa-tvary` |
| `data/mapa-opravy.json` | místa, která se na mapě neptají (`skip`), a opravené polohy (`points`, důvod v `notes`) | ručně podle kontroly |
| `reports/audit-mapy.md`, `.json` | výsledek kontroly | `npm run audit:mapa` (`scripts/audit-mapa.mjs`) |

Zdroje jsou jen ty, které dovolují komerční užití: Natural Earth 5.1.2 (volné dílo), Wikidata (CC0) a u obrysů OpenStreetMap (ODbL,
uvedeno v licencích). Mapa nemá žádné popisky.

## Podkladová mapa (`npm run build:mapa`)

Sestavuje se **po datech témat** (čte `data/zemepis.json` a další), protože kromě vrstev 1:50m kreslí i to, na co se hra ptá:

- **Pevnina** z `ne_50m_land`. Kroužky jednoho mnohoúhelníku (obrys a díry – Kaspické moře je díra v Eurasii) zůstávají v jedné
  cestě; mnohoúhelník na švu 180. poledníku jde celý do vrstvy `seam` (výplň) a `seamCoast` (obrys bez úseků podél švu).
- **Ostrovy z položek otázek** z `ne_10m_land` a `ne_10m_minor_islands`: ostrov, na kterém leží bod položky (ostrov, město,
  stavba, sopka…), a ostrovy malých souostroví. Přidají se jen tam, kde nezasahují do pevniny z 1:50m (pravidlo sudá–lichá by
  z překryvu udělalo vodu). Ostrov, který by zaokrouhlením na celé jednotky zanikl, zůstane jako nejmenší trojúhelník („tečka“).
  Stejně se doplní pevnina nejmenších ostrovních států, kterou má jen vrstva států (Nauru, Tuvalu, Maledivy…).
- **Jezera**: z `ne_50m_lakes` od 450 km² (dřív 800: přibylo Ženevské a Bodamské jezero, Mrtvé moře, Tahoe…) a jezera z položek
  otázek od 20 km² (podle QID, jinak podle bodu položky) z 1:50m nebo 1:10m (Balaton, Gardské jezero, Lago Maggiore, Loch Ness…).
- **Hranice** z `ne_50m_admin_0_boundary_lines_land`, oříznuté podle nakreslené pevniny: úsek v moři se vypustí (námořní hranice
  u Kuril a v Kerčském průlivu, čáry protažené do Botnického zálivu, Oslofjordu a úžiny Juana de Fucy), konec blízko břehu se
  k němu dotáhne. Hranice mezi částmi státu, který hra vede jako jeden (`MERGED_STATES`: Somálsko se Somalilandem, Kypr se
  severem), se nekreslí. Úsek, který vrstva hranic nemá (`MISSING_BORDERS`: Keňa × Jižní Súdán u trojúhelníku Ilemi), se doplní
  z obvodu státu.
- **Plochy států** (`areas`) z `ne_50m_admin_0_countries` se jmény podle `data/countries.json`: velké mnohoúhelníky hruběji, malé
  (do 5000 km²) stejně podrobně jako pevnina, nejmenší jako čtverec jedné jednotky. Menší plochy jsou v poli první, takže se
  v enklávě najde vnitřní stát (Vatikán, ne Itálie). Státy z `MERGED_STATES` mají jednu sloučenou plochu.

Velikost souboru je asi 490 kB (test hlídá 600 kB a 140 kB na vrstvu).

## Kontrola (`npm run audit:mapa`)

`scripts/lib/audit-mapa-checks.mjs` dělá tyto kontroly (seznam známých míst je v `scripts/lib/audit-mapa-known.mjs`):

1. **Podkladová mapa světa** – známá moře a zálivy jsou voda, velká jezera jsou nakreslená, známá místa jsou pevnina; díra
   v pevnině smí být jen vnitrozemské moře a musí ležet ve stejné cestě jako její pevnina; každý konec hranice končí u pobřeží,
   břehu jezera, jiné hranice nebo na okraji mapy (jinak „hranice do ztracena“ – takhle se pozná chybějící moře); hranice
   nevede mořem; jezera leží na pevnině; šev na 180. poledníku se nekreslí jako pobřeží; Antarktida nezasahuje do výřezu.
   S `--source` navíc porovná pevninu se zdrojem (Natural Earth 1:50m) v mřížce půl stupně.
2. **Podkladová mapa Česka** – 14 krajů, které pokrývají Česko a nepřekrývají se, krajská města ve svých krajích, řeky na místě,
   hranice krajů končí na obrysu.
3. **Státy** – každý stát z `data/countries.json` má plochu stejného jména, hlavní město v ní leží, plochy se nepřekrývají.
4. **Polohy položek** – bod leží ve státě, který položka uvádí (tolerance 25 km, v moři 60 km; závislá a sporná území podle
   tabulky), na pevnině nebo ve vodě podle druhu; hrubé souřadnice (na půl stupně); bod daleko od města, které položka uvádí;
   stejné souřadnice u dvou míst bez obrysu. S `--wikidata` dohledá k podezřelým polohám souřadnice P625.
5. **Obrysy** (jen čtení, opravuje je `scripts/build-mapa-tvary.mjs`) – bod uvnitř nebo blízko, rozloha a délka proti datům,
   pevninská místa na nakreslené pevnině a moře na vodě, region ve svém státě, u řek mezery, ústí a úseky v moři, křížení a drobné
   kroužky. Výstup je seznam seřazený podle podezřelosti.
6. **Sestavení otázek** – poloměry bodů, oblast a pohled, zadání podle vzorů (i rod: „Kde se konala … kongres?“), stejnojmenná
   místa bez druhu v zadání.
7. **Pokrytí** – položky, otázky a obrysy podle druhu a úrovně a důvody, proč se mapa na místo neptá.

Exit kód je nenulový při kritickém nálezu (podkladová mapa, státy, sestavení otázek, soubor oprav). Obrysy kritické nejsou.
Regresní testy jsou v `tests/audit-mapa.test.js`.

## Opravy (`data/mapa-opravy.json`)

```json
{ "skip": { "QID": "důvod, proč se místo na mapě neptá" }, "points": { "QID": [šířka, délka] }, "notes": { "QID": "důvod opravy polohy" } }
```

Aplikace opravy použije při sestavení otázky (`skip` → žádná otázka na mapě, `points` → poloha místo té z dat tématu). Každý
záznam má důvod a ověření (Wikidata P625, P276, P36); kontrola hlásí záznam bez důvodu, neznámé QID i opravu, která už nic nemění.
Do `skip` patří místo, které nejde na mapě rozumně ukázat (událost na více místech, místo, které na podkladové mapě není
nakreslené a zvýraznění by nebylo vidět), do `points` poloha, kterou data mají prokazatelně špatně.
