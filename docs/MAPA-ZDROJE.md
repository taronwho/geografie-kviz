# Zdroje obrysů pro „Ukaž na mapě“ (`data/mapa-tvary.json`)

Soubor `data/mapa-tvary.json` drží obrysy plošných míst (jezera, moře, zálivy, průlivy, ostrovy, souostroví, národní parky, pouště, poloostrovy, pohoří, CHKO a národní přírodní rezervace, státy, regiony a kraje) a průběh řek. Sestavuje ho `scripts/build-mapa-tvary.mjs` (`npm run build:mapa-tvary`). Tento dokument říká, **odkud která data jsou, pod jakou licencí a co se u nich musí uvádět**.

Pravidlo: berou se jen zdroje použitelné i komerčně – volné dílo / CC0, CC BY (s uvedením původu) a ODbL (OpenStreetMap; uvedení původu, odvozená databáze pod stejnou licencí). Zdroje s omezením na nekomerční užití (CC BY-NC…) a zdroje s nejasnou nebo vlastní licencí se **neberou** – viz oddíl Odmítnuté zdroje. Licence byly ověřeny na oficiálních stránkách zdrojů 10. 11. 2026.

Stejný výčet (zkráceně) je v `licence.html` a v poli `source` přímo v datovém souboru.

## Použité zdroje

| # | Zdroj | Licence | K čemu | Obrysů |
|---|---|---|---|---|
| 1 | Natural Earth 5.1.2 | volné dílo | státy, regiony, moře, velká jezera a ostrovy, velké řeky | 1 664 |
| 2 | OpenStreetMap | ODbL 1.0 | národní parky, CHKO, NPR, menší ostrovy, jezera, zálivy, průlivy, menší řeky | 1 084 |
| 3 | GMBA Mountain Inventory v2 | CC BY 4.0 | pohoří světa | 161 |
| 4 | AOPK ČR – Geomorfologické členění ČR | CC BY 4.0 | česká pohoří | 46 |
| 5 | Wikimedia Commons, stránky `Data:*.map` | CC0 1.0 | několik ostrovů a souostroví | 8 |
| 6 | Marine Regions – SeaVoX Salt and Fresh Water Body Gazetteer | CC BY 4.0 | moře | 3 |
| – | Wikidata | CC0 1.0 | propojení položek se zdroji (QID, P402, P3896, jména) | – |

Počty platí pro sestavení z 10. 11. 2026 (celkem 2 966 obrysů, 1 089 kB; z OpenStreetMap je 276 řek, 192 národních parků, 224 ostrovů a 113 chráněných území Česka); přesný rozpis podle druhu vypíše sestavení na konci (tabulka „Pokrytí“).

### 1. Natural Earth 5.1.2

- **Web:** <https://www.naturalearthdata.com> (data z <https://github.com/nvkelso/natural-earth-vector>, značka `v5.1.2`)
- **Licence:** volné dílo (public domain), <https://www.naturalearthdata.com/about/terms-of-use/>. Uvedení původu není povinné, uvádíme ho.
- **Co se bere:** státy (`ne_50m_admin_0_countries`, drobné z `ne_10m_admin_0_countries`), regiony a kraje (`ne_10m_admin_1_states_provinces`), jezera (`ne_10m_lakes` a doplňkové vrstvy), moře, zálivy a průlivy (`ne_10m_geography_marine_polys`), ostrovy, poloostrovy, pouště a pár pohoří (`ne_10m_geography_regions_polys`), řeky (`ne_10m_rivers_lake_centerlines` a doplňkové vrstvy).
- **Shoda:** podle vlastnosti `wikidataid`, u regionů i podle bodu položky ve správné zemi, u řek i podle jména. Čtyři řeky, jejichž délka se počítá i se zdrojnicemi jiného jména (Jang-c’-ťiang, Nil, Amazonka, Kongo), mají v sestavení vyjmenované úseky (`RIVER_EXTRA_NAMES`).
- Vrstva států 1 : 10 mil. slouží i jako **pevnina pro kontrolu** (ostrov má ležet na pevnině, moře ve vodě) a pro šířku průlivů.

### 2. OpenStreetMap

- **Web:** <https://www.openstreetmap.org>, podmínky <https://www.openstreetmap.org/copyright>
- **Licence:** Open Database License (ODbL) 1.0, <https://opendatacommons.org/licenses/odbl/1-0/>
- **Povinné uvedení:** „© přispěvatelé OpenStreetMap“ s odkazem na <https://www.openstreetmap.org/copyright>. Soubor `data/mapa-tvary.json` je z části odvozená databáze – ta část se smí šířit jen pod ODbL (uvedeno v `licence.html`).
- **Co se bere a odkud:**
  - obrysy relací z vlastnosti Wikidat P402 – ze služby <https://polygons.openstreetmap.fr> (generuje obrys relace z dat OSM);
  - objekty se značkou `wikidata=Q…` (relace i uzavřené cesty) a jejich geometrie – z **QLever** (<https://qlever.dev/osm-planet>, Univerzita Freiburg; kopie planety OSM převedená nástrojem osm2rdf, dotazy SPARQL). QLever je jen přístupová služba, data jsou OSM pod ODbL;
  - průběh řek – cesty relací `type=waterway` z **API OpenStreetMap** (`/api/0.6/relation/<id>/full.json`), po jedné s prodlevou 1,5 s a hlavičkou `User-Agent: MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)`.
- **Zpracování:**
  - řeky: z cest relace se složí síť a v ní se najde hlavní tok (nejdelší z nejkratších cest mezi konci sítě); vedlejší ramena, náhony a slepé odbočky odpadnou, krátké mezery (jezero, přehrada) se spojí, krátké „ostny“ se odstraní (`scripts/lib/mapa-tvary-reky.mjs`). OpenStreetMap se použije tam, kde čára z Natural Earth chybí, je kratší než 70 % délky řeky nebo leží přes 50 km od bodu položky, a jen když je relace o 15 % délky lepší;
  - průlivy nakreslené jen osou (`natural=strait` jako čára): obal čáry o poloměru podle vzdálenosti osy od pobřeží (dolní kvartil, 1,5–40 km) – v tabulce pokrytí jako `osm-osa` (13 průlivů);
  - souostroví zapsaná jen pobřežními čarami ostrovů: uzavřené čáry jako prstence.
- **Chráněná území Česka:** hranice CHKO (27 z 27) a národních přírodních rezervací (86 z 91) jsou relace `boundary=protected_area` v OpenStreetMap. Rozloha rezervací bývá ve Wikidatech v hektarech, proto u nich stačí shoda značky `wikidata` a bod položky uvnitř hranice.

### 3. GMBA Mountain Inventory v2

- **Web:** <https://www.earthenv.org/mountains>, popis <https://github.com/GMBA-biodiversity/Inventory>
- **Soubor:** <https://data.earthenv.org/mountains/broad/GMBA_Inventory_v2.0_broad.zip> (shapefile, 140 MB; ukládá se do `BUILD_CACHE/gmba`)
- **Licence:** Creative Commons Attribution 4.0 (CC BY 4.0), <https://creativecommons.org/licenses/by/4.0/> – uvedeno v repozitáři GMBA („LICENSE: CC BY 4.0“, držitel práv Global Mountain Biodiversity Assessment); článek popisující data (Scientific Data, CC BY 4.0) uvádí „available for unrestricted download“.
- **Povinné uvedení (citace):** Snethlage, M. A., Geschke, J., Spehn, E. M., Ranipeta, A., Yoccoz, N. G., Körner, Ch., Jetz, W., Fischer, M. & Urbach, D. (2022): *GMBA Mountain Inventory v2*. GMBA-EarthEnv. <https://doi.org/10.48601/earthenv-t9k2-1407>. Popis: Snethlage, M. A. et al. (2022): A hierarchical inventory of the world’s mountains for global comparative mountain science. *Scientific Data*. <https://doi.org/10.1038/s41597-022-01256-y>. Obrysy jsou zjednodušené (uvedeno).
- **Verze:** „broad“ (celý vymezený rozsah pohoří). Verze „standard“ ořezává pohoří jen na plochy splňující definici hor – nízká pohoří z ní zbudou jako ostrůvky (Eifel 180 km² místo 8 tisíc), proto se nebere.
- **Shoda:** podle QID v poli `WikiDataUR` (187 položek), jinak podle jména (česky, anglicky, německy, francouzsky, španělsky, rusky; bod položky musí ležet do 5 km uvnitř).
- **Kdy GMBA nahradí dosavadní obrys** (Natural Earth, OpenStreetMap): vždy, když projde kontrolou – jeden vědecký zdroj se shodným vymezením. Dosavadní obrys zůstane, jen když je zjevně lepší: bod položky leží v něm a v obrysu GMBA ne, nebo jeho rozloha sedí s Wikidaty aspoň 1,5× líp (8 pohoří: Tatry, Harz, Julské Alpy, Jezerní oblast, Kopet Dag, Střední Atlas, Středosibiřská vysočina, Jabloňový hřbet). Nahrazeno bylo 87 dosavadních obrysů.

### 4. AOPK ČR – Geomorfologické členění ČR

- **Web:** Agentura ochrany přírody a krajiny ČR, <https://data.nature.cz>; služba <https://gis.nature.cz/arcgis/rest/services/PrirodniPomery/Geomorfologie/MapServer>
- **Datová sada:** „Geomorfologické členění“, identifikátor `CZ-AOPKCR-GMCLEN`; hranice geomorfologických jednotek podle: Mackovčin, P. (ed.) et al. (2005): Mapy geomorfologického členění: Geomorfologické jednotky ČR 2005. In: Demek, J.; Mackovčin, P. (eds.) et al. (2006): *Hory a nížiny: Zeměpisný lexikon ČR*. Vydání II. Brno: AOPK ČR.
- **Licence:** CC BY 4.0 – metadatový záznam v Národním geoportálu (<https://geoportal.gov.cz/php/micka/record/turtle/F2A91622-4AF9-41E7-B5DE-E4C2A0905C54>: `dc:license <https://creativecommons.org/licenses/by/4.0/>`, „bez omezení veřejného přístupu“); otevřená data AOPK ČR obecně: „Všechna data v mapové službě podléhají licenci Creative Commons (CC-BY 4.0): Uveďte původ.“
- **Povinné uvedení:** „© AOPK ČR; Mackovčin, P. (ed.) et al., 2005 – Geomorfologické členění ČR“, licence CC BY 4.0, obrysy zjednodušeny.
- **Co se bere:** 935 okrsků s názvy vyšších jednotek (soustava, podsoustava, celek, podcelek, okrsek); položka se spáruje podle jména jednotky (Krkonoše, Šumava, Hrubý Jeseník, Brdy, Moravský kras…) a okrsky se sloučí. Tři položky se jmenují jinak (`CZECH_UNIT_ALIASES`).
- **Pozor:** data končí na státní hranici – přeshraniční pohoří (Krkonoše, Šumava, Krušné hory) mají obrys jen české části. Když bod položky leží dál než 2 km za hranicí (pohoří je hlavně v cizině), má přednost GMBA.

### 5. Wikimedia Commons – stránky `Data:*.map`

- **Web:** <https://commons.wikimedia.org> (jmenný prostor Data, vlastnost Wikidat P3896 „geoshape“)
- **Licence:** každý soubor nese vlastní pole `license`; bere se **jen CC0-1.0** (volné dílo). Všech 11 souborů, na které položky odkazují, CC0 má; podle pole `sources` jsou odvozené z Natural Earth. Soubor s jinou licencí sestavení zamítne a vypíše.
- **Co se bere:** 3 ostrovy a 5 souostroví (Shetlandy, Orkneje, Markézy, Montserrat…), které nemají vlastní obrys v Natural Earth ani použitelnou relaci v OpenStreetMap.

### 6. Marine Regions – SeaVoX Salt and Fresh Water Body Gazetteer

- **Web:** <https://www.marineregions.org> (Flanders Marine Institute, VLIZ), rozhraní `https://marineregions.org/rest/`
- **Datová sada:** Polygon dataset of the extent of water bodies from the SeaVoX Salt and Fresh Water Body Gazetteer (v19), British Oceanographic Data Centre (BODC), 2023, <https://doi.org/10.14284/590>
- **Licence:** CC BY 4.0 – záznam datové sady (<https://marineinfo.org/doc/dataset/8194>): „This dataset is licensed under a Creative Commons Attribution 4.0 International License.“
- **Povinné uvedení (citace):** British Oceanographic Data Centre (BODC), United Kingdom (2023): Polygon dataset of the extent of water bodies from the SeaVoX Salt and Fresh Water Body Gazetteer (v19). Available online at <https://www.marineregions.org/>. <https://doi.org/10.14284/590>.
- **Co se bere:** moře, zálivy a průlivy, které jinde nejsou – hledá se anglické jméno z Wikidat v místopisu a přijme se jen záznam typu SeaVoX a jen geometrie se zdrojem SeaVoX (`source=128`). Vyšla 3 moře (Keltské moře, Moře Scotia, Muhuský průliv); ostatní chybějící vody SeaVoX nemá nebo je vymezuje jinak než Wikidata.

### Wikidata

- **Web:** <https://www.wikidata.org>, licence CC0 1.0. Slouží jen k propojení: QID položek, P402 (relace OSM), P3896 (mapa na Commons), jména ve více jazycích. Dotazy jdou přes QLever (<https://qlever.dev/wikidata>).

## Odmítnuté zdroje

| Zdroj | Důvod |
|---|---|
| **Marine Regions – IHO Sea Areas v3** (Flanders Marine Institute 2018, doi:10.14284/323) | Záznam datové sady uvádí **CC BY-NC-SA 4.0** (nekomerční). Obecné prohlášení webu Marine Regions mluví o CC BY „since Maritime Boundaries version 11 (2019)“, tato sada je starší a její záznam říká něco jiného – při rozporu se nebere. Většina identifikátorů Marine Regions ve Wikidatech (P3006) míří právě na oblasti IHO – proto se P3006 nepoužívá a geometrie se filtruje podle zdroje. |
| **ČÚZK – Geomorfologické jednotky ČR 1998** (prohlížecí služba ArcGIS) | U služby je jen „© ČÚZK“ a odkaz na podmínky, které se nepodařilo dohledat (stránka vrací 404); licence nejasná. Místo ní se bere členění AOPK ČR s výslovnou CC BY 4.0. |
| **GMBA Mountain Inventory v2 – verze „standard“** | Licence stejná (CC BY 4.0), ale obrysy se pro hru nehodí (viz výš). |
| Soubory `Data:*.map` na Commons s jinou licencí než CC0 | Pravidlo je v sestavení pro jistotu; žádný takový soubor se mezi položkami nenašel. |

## Kontroly

Každý obrys musí projít, jinak se zahodí a sestavení ho vypíše v seznamu „Zamítnuté obrysy“ s důvodem:

1. **Bod položky** leží uvnitř nebo do 15 km (nebo 5 % velikosti obrysu); u řeky do 30 km od čáry (u řeky s čárou aspoň z poloviny délky do 12 % délky).
2. **Rozloha** se od rozlohy z Wikidat liší nejvýš 3× (u shody QID v GMBA a u SeaVoX až 5×, resp. 4×, ale jen s bodem uvnitř). Čtyři zjevně chybné rozlohy z Wikidat se nepoužijí (`AREA_UNRELIABLE`: Apeninský poloostrov, Akabský záliv, Aljašský poloostrov, Kergueleny).
3. **Obvyklá velikost druhu** (`TYPICAL_KM2`): horní mez vždy, dolní bez známé rozlohy – pohoří menší než 50 km² je spíš rezervace než pohoří (úřední jednotky AOPK ČR jsou z dolní meze vyňaté).
4. **Pevnina a voda** proti Natural Earth 1 : 10 mil.: ostrov od 200 km², ze kterého leží na pevnině míň než polovina, je obrys i s pobřežními vodami (vyřazeny obce Vlieland a Schiermonnikoog s Waddenzee); nová moře, zálivy a průlivy od 3 000 km² nesmí ležet z víc než 80 % na pevnině; nové souostroví bez známé rozlohy nesmí být z víc než tří čtvrtin moře.
5. **Řeky:** délka před zjednodušením v rozmezí 2,5× od délky z Wikidat; žádný „osten“ (otočení o víc než 150° s úsekem kratším než 2 km).

Totéž (bod, formát, ostny, ukázková místa, velikost souboru) hlídá `tests/mapa-tvary.test.js`.

## Sestavení a mezipaměť

```
BUILD_CACHE=/cesta/k/mezipameti npm run build:mapa-tvary            # stáhne, co chybí (GMBA 140 MB, ~290 relací řek)
OFFLINE=1 BUILD_CACHE=/cesta/k/mezipameti npm run build:mapa-tvary  # jen z mezipaměti, výsledek je stejný
```

Do `BUILD_CACHE` se ukládá každá odpověď (`osm-polygons/`, `osm-wkt/`, `osm-rivers/`, `gmba/`, `aopk/`, `marineregions/`, `commons-data/` a soubory `mapa-tvary-*.json` s odpověďmi Wikidat a QLever), takže přerušené sestavení pokračuje tam, kde skončilo. Nedostupný server se přeskočí a vypíše na konci („Nedostupné servery“); jeho obrysy se doplní při dalším běhu.
