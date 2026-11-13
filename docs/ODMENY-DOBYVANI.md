# Odměny pro Dobývání (návrh)

Cíl: dát hráčům důvod hrát Dobývání znovu a ukázat se před ostatními. Všechny odměny jsou **jen vzhled** (žádná herní výhoda,
nic se nekupuje). Většina se získá v Dobývání, část i v jiných módech (Sezóna Mudrlanta, Truhla Mudrlanta, Boss týdne, Kvíz dne,
Zlatá otázka, Řetězovka, turnaje), aby Dobývání táhlo hráče z ostatních módů a naopak.

Kde je hráč uvidí a nastaví: v okně **Barva a znak** přibudou záložky **Vzor** a **Hrad** (k dnešním Barva a Znak). Zamčené věci
jsou vidět zašedle se zámkem a jednou větou „Jak získat“ (např. „Vyhraj 10 bitev o území“) a ukazatelem postupu (3/10). Nově
odemčená věc se oznámí jako ostatní odměny (okno s obřadem, záznam ve Vitríně).

Kde je uvidí ostatní: na mapě (praporce, pečeť v pořadí, hrad na domovském území, efekt při dobytí), v lobby a v kronice.

## 1. Vzory praporce (látky) – 12 kusů

Vzor je „látka“ praporce, pečeti a vlaječek na mapě. Barva hráče zůstává (území na mapě má pořád jeho barvu, aby se hráči nepletli),
vzor se přes ni položí (šedá textura vynásobená barvou, stejně jako dnes pečeť a střechy staveb). Dva vzory jsou vícebarevné
(Duha, Zlatý brokát): praporec je celý ve vzoru, jen lem má barvu hráče.

| Vzor | Jak vypadá | Jak ho získat |
|---|---|---|
| Šachovnice | heraldická šachovnice (kresba SVG) | Dohraj 5 her v Dobývání |
| Pokosy | šikmé heraldické pruhy (SVG) | Získej celkem 10 celých regionů |
| Vlnky | vlnité pruhy jako na starých mapách (SVG) | Dobuď 15 území přes námořní cestu |
| Hermelín | bílá s černými hermelínovými ocásky (SVG) | Vyhraj hru se 4 a více hráči |
| Plameny | stylizované plameny (obrázek č. 279) | Vyhraj 10 bitev o území |
| Mramor | žilkovaný mramor (č. 280) | Poraz Bosse týdne 4× (Boss týdne) |
| Hvězdná noc | hvězdy a souhvězdí (č. 278) | Série 30 dní v Kvízu dne |
| Listí | dubové listí (č. 283) | Řetězovka: řetěz aspoň 25 článků |
| Ledové krystaly | mrazové květy (č. 284) | Zimní sezóna (prosinec–únor), 15. stupeň |
| Zlatá fólie | tepané zlato (už máme textura-zlato) | Zlatá otázka: 10 střípků |
| Zlatý brokát | vícebarevný brokát se zlatem (č. 281) | Vyhraj 10 her v Dobývání |
| Duha | duhové pruhy (č. 282) | Vzácnost z Truhly Mudrlanta / 3× Šampion sezóny |

## 2. Vzácné znaky – 12 kusů

Znak je dnes vektorová kresba ze 24 základních. Vzácné znaky budou černé siluety z obrázků (č. 285–296) převedené na masku, takže
je jde tisknout do pečeti i na praporec v barvě hráče stejně jako dnešní znaky.

| Znak | Jak ho získat |
|---|---|
| Gryf | Vyhraj na mapě Evropa |
| Sfinga | Vyhraj na mapě Afrika |
| Čínský drak | Vyhraj na mapě Asie |
| Orel bělohlavý | Vyhraj na mapě Amerika |
| Dvouocasý lev | Vyhraj na mapě Česko |
| Pegas | Vyhraj Blesk (hru na 20 minut) |
| Fénix | Vyhraj hru po Návratu do hry (v té hře ti chvíli nezbylo žádné území) |
| Kraken | Dobuď 40 území přes námořní cestu |
| Jednorožec | 5 her bez ztráty domovského hradu |
| Dvouhlavý orel | Vyhraj 50 bitev o území |
| Svatováclavská koruna | Vyhraj 25 her |
| Sova Mudrlant | Dosáhni úrovně 50 (celá aplikace) |

## 3. Domovské hrady (sady) – 3 sady po 4 obrázcích

Domovský hrad na mapě roste s opevněním (dnes č. 262 a 275–277). Sada nahradí všechny čtyři stupně jiným stylem; střechy a praporky
se pořád barví barvou hráče (scripts/building-art.py), takže každý obrázek musí mít břidlicově modré střechy a plné zlaté praporky.

| Sada | Styl | Jak ji získat |
|---|---|---|
| Gotický hrad | vysoké věže, cimbuří, kamenné mosty (č. 297–300) | Postav Pevnost na domovském hradu 10× |
| Orientální palác | cibulové kopule, minarety, hradby z pískovce (č. 301–304) | Vyhraj 25 bitev o území |
| Japonský hrad | vícepatrová pagoda, bílé zdi, kamenný sokl (č. 305–308) | Sezóna Mudrlanta: 15. stupeň ve 3 různých sezónách |

## 4. Efekty dobytí – 6 kusů (bez obrázků, animace CSS)

Když hráč dobude území, místo rozlití inkoustu (výchozí) se přehraje jeho efekt; vidí ho i ostatní při přehrání a v kronice.

| Efekt | Jak ho získat |
|---|---|
| Zlatý déšť | Vyhraj hru (první výhra) |
| Ohňostroj | Šampion sezóny (20. stupeň Sezóny Mudrlanta) |
| Plamenná vlna | 30 dobytých domovských hradů soupeřů |
| Sněhová vánice | Zimní sezóna, 10. stupeň |
| Okvětní lístky | Jarní sezóna (březen–květen), 10. stupeň |
| Kouzelný prach | Vzácnost z Truhly Mudrlanta |

## 5. Tituly v Dobývání (profil, pořadí, lobby)

Kapitán (5 výher), Vojevůdce (15 výher), Císař (50 výher), Strážce hradu (20 odražených útoků na domov), Obléhač (100 vyhraných
bitev), Mořeplavec (100 území přes moře), Bleskový stratég (10 výher v Blesku).

## 6. Odznaky (stupně jako dnešní odznaky)

- **Dobyvatel** (už je): 1., 5., 15., 50. výhra.
- **Bitvy**: 10, 50, 150 vyhraných bitev o území.
- **Obránce**: 10, 50, 150 odražených útoků.
- **Regiony**: 10, 50, 150 celých regionů na konci kola.

## 7. Jak se to propojí s jinými módy

- **Sezóna Mudrlanta**: 5. a 15. stupeň dají věc do Dobývání (vzor, znak nebo efekt, který hráč ještě nemá), zimní a jarní sezóny
  mají vlastní efekty a Ledové krystaly.
- **Truhla Mudrlanta**: s malou šancí vzácnost do Dobývání (Duha, Kouzelný prach), jinak jako dnes.
- **Boss týdne, Kvíz dne, Zlatá otázka, Řetězovka**: po jednom vzoru (tabulka výš) – hráč, který tyto módy hraje, má v Dobývání
  hned čím se odlišit.
- **Vitrína a Album**: nová stránka „Zbrojnice“ s vystavenými vzory, znaky a hrady (počet 12 + 12 + 3 + 6).

## 8. Co je potřeba technicky (až se to bude stavět)

1. Server: statistiky hráče v Dobývání (výhry podle mapy a tempa, bitvy, odražené útoky, regiony, území přes moře, hrady, Návrat do
   hry a výhra, hry bez ztráty domova) – počítá conquest_finish a tahy; odemčené věci se uloží k profilu.
2. Volba vzhledu ve hře: `conquest_players` dostane `pattern`, `castle_set`, `effect` (server ověří, že je hráč má odemčené).
3. Vykreslení: vzor v `pennantGroup` a `sealSvg` (maska praporce + textura), hrad podle sady v `BUILDINGS`, efekty v conquest-ui.js.
4. Obrázky: č. 278–308 v docs/OBRAZKY.md (oddíl 24) + skripty na textury, siluety znaků a sady hradů (building-art.py).
