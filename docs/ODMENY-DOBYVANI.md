# Odměny pro Dobývání (návrh)

Cíl: dát hráčům důvod hrát Dobývání znovu a ukázat se před ostatními. Odměny v oddílech 1–6 jsou **jen vzhled** (žádná herní
výhoda, nic se nekupuje). Jedinou herní výhodou jsou dvě vzácné **pomůcky** (oddíl 9, už ve hře): malé, jednou za hru a se stropem
zásoby, aby nerozhodovaly hru za hráče. Většina se získá v Dobývání, část i v jiných módech (Sezóna Mudrlanta, Truhla Mudrlanta, Boss týdne, Kvíz dne,
Zlatá otázka, Řetězovka, turnaje), aby Dobývání táhlo hráče z ostatních módů a naopak.

Kde je hráč uvidí a nastaví: v okně **Barva a znak** přibudou záložky **Vzor** a **Hrad** (k dnešním Barva a Znak). Zamčené věci
jsou vidět zašedle se zámkem a jednou větou „Jak získat“ (např. „Vyhraj 10 bitev o území“) a ukazatelem postupu (3/10). Nově
odemčená věc se oznámí jako ostatní odměny (okno s obřadem, záznam ve Vitríně).

Kde je uvidí ostatní: na mapě (výplň jeho území, vzácný znak na praporcích a pečeti, hrad na domovském území, efekt při dobytí), v lobby a v kronice.

## 1. Výplně území (vzory) – 12 kusů

Výplň je vzor, kterým se vybarví území hráče na mapě (místo prosté akvarelové lazury). Barva hráče zůstává (území má pořád jeho barvu,
aby se hráči nepletli): šedá textura se vynásobí barvou hráče, stejně jako pečeť a střechy staveb. Barevné výplně (Hermelín, Zlatá fólie,
Zlatý brokát, Duha) se použijí jak jsou a barvu hráče nese sytý lem podél hranice území; v jedné hře smí každou barevnou výplň mít jen jeden
hráč (server ji druhému nepustí: „Výplň Duha už v této hře má jiný hráč.“, v okně je zašedlá). Praporce, pečeti a vlaječky zůstávají v barvě
hráče (vzácný znak na nich ano).

**Stav: hotovo (schéma 38).** Všech 12 výplní je v `conquest.js` `PATTERNS` (obrázky č. 278–284 v `icons/vzory/`, Zlatá fólie z `icons/textury/textura-zlato.webp`, Šachovnice, Pokosy, Vlnky a Hermelín jako kresby SVG). `mapSvg` vyplní území hráče podle `conquest_players.pattern` jedním `<pattern>` na hráče (dlaždice `mapTile` v jednotkách mapy; šedé vzory předbarví conquest-ui.js jednou v canvasu na obrázek blob:, do té doby filtr na dlaždici), náhledy map v seznamech her také. Odemyká server (oddíl 8), volí se v okně Barva a znak na záložce Výplň (vzorky území). Tabulka níž je tak, jak to platí; oproti návrhu: Pokosy počítají celé regiony na konci her, Listí celé Řetězovky (7 z 7; řetěz má jen 7 článků), Zlatá fólie odznak Zlatokop (10 správně zodpovězených zlatých otázek; střípky zná jen zařízení) a Duha je jen vzácnost z Truhly (Šampiona sezóny server nezná).

| Vzor | Jak vypadá | Jak ho získat |
|---|---|---|
| Šachovnice | heraldická šachovnice (kresba SVG) | Dohraj 5 her v Dobývání |
| Pokosy | šikmé heraldické pruhy (SVG) | Drž na konci her celkem 10 celých regionů |
| Vlnky | vlnité pruhy jako na starých mapách (SVG) | Dobuď 15 území přes námořní cestu |
| Hermelín | bílá s černými hermelínovými ocásky (SVG) | Vyhraj hru se 4 a více hráči |
| Plameny | stylizované plameny (obrázek č. 279) | Vyhraj 10 bitev o území |
| Mramor | žilkovaný mramor (č. 280) | Poraz Bosse týdne 4× (Boss týdne) |
| Hvězdná noc | hvězdy a souhvězdí (č. 278) | Série 30 dní v Kvízu dne |
| Listí | dubové listí (č. 283) | Řetězovka: 15 celých řetězů (7 z 7) |
| Ledové krystaly | mrazové květy (č. 284) | Zimní Sezóna Mudrlanta (prosinec–únor): 15. stupeň |
| Zlatá fólie | tepané zlato (už máme textura-zlato) | Zlatá otázka: 10 správně zodpovězených (odznak Zlatokop) |
| Zlatý brokát | vícebarevný brokát se zlatem (č. 281) | Vyhraj 10 her v Dobývání |
| Duha | duhové pruhy (č. 282) | Vzácnost z Truhly Mudrlanta (3 % na týdenní truhlu) |

## 2. Vzácné znaky – 12 kusů

Znak je dnes vektorová kresba ze 24 základních. Vzácné znaky budou černé siluety z obrázků (č. 285–296) převedené na masku, takže
je jde tisknout do pečeti i na praporec v barvě hráče stejně jako dnešní znaky.

**Stav: hotovo (schéma 38).** Všech 12 znaků (č. 285–296, i Gryf) je v `conquest.js` `RARE_EMBLEMS` jako masky `icons/znaky/<id>.webp` a `<id>-obrys.webp` (`python3 scripts/conquest-art.py znaky`); vykreslí se na praporci, pečeti i mapě. V okně Barva a znak jsou pod základními znaky (zamčené zašedlé se zámkem, klepnutí ukáže, jak znak získat, a postup); server je pustí jen odemčené (`conquest_rare_emblems`, `conquest_check_style`).

| Znak | Jak ho získat |
|---|---|
| Gryf | Vyhraj na mapě Evropa |
| Sfinga | Vyhraj na mapě Afrika |
| Čínský drak | Vyhraj na mapě Asie |
| Orel bělohlavý | Vyhraj na mapě Amerika |
| Dvouocasý lev | Vyhraj na mapě Česko |
| Pegas | Vyhraj Blesk (hru na 20 minut) |
| Fénix | Vyhraj hru po Vzkříšení (v té hře ti chvíli nezbylo žádné území; do schématu 38 po Návratu do hry) |
| Kraken | Dobuď 40 území přes námořní cestu |
| Jednorožec | Dohraj 5 her bez ztráty domovského hradu |
| Dvouhlavý orel | Vyhraj 50 bitev o území |
| Svatováclavská koruna | Vyhraj 25 her |
| Sova Mudrlant | Dosáhni úrovně 50 (celá aplikace) |

## 3. Hrady (sady) – 3 sady po 6 obrázcích

Domovský hrad na mapě roste s opevněním (dnes č. 262 a 275–277). Sada nahradí všechny čtyři stupně jiným stylem; střechy a praporky
se pořád barví barvou hráče (scripts/building-art.py), takže každý obrázek musí mít břidlicově modré střechy a plné zlaté praporky.
K sadě patří i opevnění ostatních území ve stejném stylu (Palisáda a Hradba, č. 362–367), takže je sada vidět na celé mapě, ne jen na domově.

| Sada | Styl | Jak ji získat |
|---|---|---|
| Gotický hrad | vysoké věže, cimbuří, kamenné mosty (č. 297–300, opevnění č. 362–363) | Postav Pevnost na domovském hradu 10× |
| Orientální palác | cibulové kopule, minarety, hradby z pískovce (č. 301–304, opevnění č. 364–365) | Vyhraj 25 bitev o území |
| Japonský hrad | vícepatrová pagoda, bílé zdi, kamenný sokl (č. 305–308, opevnění č. 366–367) | Sezóna Mudrlanta: 15. stupeň ve 3 různých sezónách |

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

- **Sezóna Mudrlanta**: 5. a 15. stupeň dají přihlášenému hráči pomůcku do Dobývání (oddíl 9; s plnou zásobou běžnou věc). Vzhled
  do Dobývání (vzor, znak nebo efekt, který hráč ještě nemá) proto patří na jiné stupně; zimní a jarní sezóny mají vlastní efekty
  a Ledové krystaly.
- **Truhla Mudrlanta**: vzácně (5 %, nejvýš jednou za týden) navíc pomůcka Půl na půl (oddíl 9); s malou šancí vzácnost do Dobývání
  (Duha, Kouzelný prach), jinak jako dnes.
- **Boss týdne, Kvíz dne, Zlatá otázka, Řetězovka**: po jednom vzoru (tabulka výš) – hráč, který tyto módy hraje, má v Dobývání
  hned čím se odlišit. Hotovo (schéma 38): server je počítá z `boss_results`, `daily_quiz_results`, `chain_results` a odznaků Zlatokop,
  Ledové krystaly z 15. stupně Sezóny v zimě (zdroj pomůcky v `player_item_grants`), Duhu z losu Truhly (truhla ji hned ohlásí řádkem
  „A navíc vzácná výplň území“). Nové se oslaví při příštím otevření Dobývání.
- **Vitrína a Album**: nová stránka „Zbrojnice“ s vystavenými vzory, znaky a hrady (počet 12 + 12 + 3 + 6).

## 8. Co je potřeba technicky

Body 1 a 2 pro vzory a vzácné znaky jsou hotové (schéma 38, docs/SUPABASE.md): statistiky počítá `conquest_look_stats` z dat serveru
(i zpětně, žádná nová počítadla v tazích), odemčené jsou v `conquest_looks`, volba v `conquest_players.pattern` a `emblem`. Hrady
(`castle_set`) a efekty (`effect`) zatím ne – obrázky hradů nejsou dodané.


1. Server: statistiky hráče v Dobývání (výhry podle mapy a tempa, bitvy, odražené útoky, regiony, území přes moře, hrady, Vzkříšení / Návrat do
   hry a výhra, hry bez ztráty domova) – počítá conquest_finish a tahy; odemčené věci se uloží k profilu.
2. Volba vzhledu ve hře: `conquest_players` dostane `pattern`, `castle_set`, `effect` (server ověří, že je hráč má odemčené).
3. Vykreslení: výplň území v `mapSvg` (jeden `<pattern>` na hráče), vzácný znak v `pennantGroup` a `sealSvg`, hrad podle sady v `BUILDINGS`, efekty v conquest-ui.js.
4. Obrázky: č. 278–308 v docs/OBRAZKY.md (oddíl 24) + skripty na textury, siluety znaků a sady hradů (building-art.py). Vzory a znaky (č. 278–296) jsou dodané a převedené (`scripts/conquest-art.py vzory znaky`); chybí hrady.

## 9. Pomůcky (hotovo, schéma 30 a 39)

Tři vzácné pomůcky, které si hráč schovává do zásoby a použije v kterékoli hře Dobývání. Zásoba je na serveru (`player_items`), takže
platí na všech zařízeních; odkud pomůcka přišla, zapisuje `player_item_grants` s klíčem zdroje, takže stejná událost nikdy nedá dvě.
Tah navíc a Půl na půl jdou v jedné hře použít jen jednou, Vzkříšení pokaždé, když hráč přijde o všechna území. Boti je nedostávají
ani nepoužívají.

| Pomůcka | Co dělá | Nejvýš | Jak ji získat |
|---|---|---|---|
| **Tah navíc** (pečeť s bleskem a „+1“, obrázek č. 309) | +1 tah v tomto kole (období). Ne v posledním kole hry, ne během odpočtu do dalšího kola, ne bez území. Všichni ho uvidí: záznam „Tah navíc“ v kronice s praporcem a jménem hráče a zlaté „+1“ u jeho tahů v pořadí | 1 | **Boss týdne**: první výhra v ISO týdnu (`boss:<týden>`); **Sezóna Mudrlanta**: 15. stupeň (`season:<RRRR-MM>:15`) |
| **Vzkříšení** (korálově zlatá pečeť, obrázek č. 361 se zlatým ankhem s křídly a tyrkysovým drahokamem; do dodání srdce s tepem, bez značky; schéma 39) | Nahrazuje automatický Návrat do hry. Jen když hráči v běžící hře nezbylo žádné území (kdykoli, i uprostřed kola). Vybere si neutrální území, nebo území jiného hráče bez opevnění, které není domovským hradem, není obléhané ani chráněné po jiném Vzkříšení. Území je jeho (úroveň 0, **ne domovské**), poklad na něm dá +1 tah, hraje dál se zbytkem tahů kola. Na **60 s je chráněné**: nikdo jiný na ně nezaútočí ani nezačne bitvu, boti ho vynechají, majitel opevnit smí. Kronika „Vzkříšení“ s praporcem hráče, dosavadní majitel tam vidí, že území ztratil | 3 | **Startovní** jedno pro každého (`starter`, jednou za účet, aby noví hráči nebyli hned po prvních hrách navždy venku); **dohraná započítaná hra Dobývání s body** (aspoň 3 hráči nebo hra na den a déle, aspoň 3 vlastní tahy a aspoň 1 bod, jednou za hru, `revive:<hra>`); **série Kvízu dne** 7, 30, 100 a 365 dní (jednou za milník, `daily-streak:<dny>`); **Sezóna Mudrlanta**: 8. stupeň (`season:<RRRR-MM>:8`); **Truhla Mudrlanta** 10 % (stejný týdenní los, `chest:<RRRR-Wtt>`) a **Zlatá truhla** 15 % (`gold:<RRRR-Wtt>`) |
| **Půl na půl** (pečeť s váhami a „½“, obrázek č. 310) | U otázky se 4 textovými nebo obrázkovými možnostmi (ne mapa, letopočet ani odhad čísla) odebere před odpovědí dvě špatné. Jde i v bitvě: dvě nesprávné vybere server (správnou neprozradí) a ostatní účastníci vidí „½“ u jména hráče (v otázce, při čekání i ve výsledku bitvy) | 2 | **Kvíz dne bez chyby** (10 z 10, nejvýš jednou za ISO týden, `daily:<RRRR-Wtt>`); **Řetězovka**: celý řetěz 7 článků (nejvýš jednou za ISO týden, `chain:<RRRR-Wtt>`); **výhra ve hře Dobývání** (1. místo s aspoň 3 vlastními tahy, `conquest:<hra>`); **Sezóna Mudrlanta**: 5. stupeň (`season:<RRRR-MM>:5`); **Truhla Mudrlanta**: vzácně (5 %, los na serveru, nejvýš jednou za ISO týden, `chest:<RRRR-Wtt>`) |

**Jak často Vzkříšení přijde**: aktivní hráč Dobývání dostane jedno skoro za každou dohranou hru s body (bez bodů, tedy právě vyřazený,
nic), k tomu jednou za měsíc ze Sezóny, občas z truhly a z milníků Kvízu dne; příležitostný hráč má startovní a pak zhruba jedno za
měsíc. Strop 3 drží, aby hráč nebyl nesmrtelný: kdo je vyřazen víckrát, zásobu rychle spotřebuje.

**Vyřazení bez Vzkříšení** (schéma 39): hráč zůstane do konce hry mimo hru – hru sleduje, kolo za něj platí jako dohrané a „Chci další
kolo“ za něj platí samo (jako za bota), upozornění na konec kola nedostane. Hra běží do svého konce jako dřív (nekončí dřív, protože
Vzkříšení může přibýt i během hry, třeba za Kvíz dne, a hráč se pak vrátí). Pořadí: body, při shodě dřív dosažené; hráči s 0 body podle
toho, kdo o poslední území přišel později. Odměnu (XP, odznak, Vzkříšení za hru) hráč s 0 body nedostane, stejně jako dřív.

**Plná zásoba**: zdroj dá jen to, co dával dřív. Boss, Kvíz dne, Řetězovka a výhra jen řeknou „Tah navíc už máš, víc jich mít nejde“,
nebo „Půl na půl už máš dvakrát, víc jich mít nejde“; Kvíz dne a Řetězovka to v tom týdnu zkusí znovu, až hráč pomůcku použije. Sezóna
dá na 5. a 15. stupni běžnou věc (stejným losem jako dřív) a Truhla jen svůj obsah. Bez přihlášení dá Sezóna vždy běžnou věc a Truhla
pomůcku nikdy.

**Kde je hráč uvidí**
- Rozcestník Dobývání (Moje hry): pergamenový pruh „Pomůcky“ s pečetěmi a zásobou („Tah navíc 1/1“, „Půl na půl 1/2“, „Vzkříšení 2/3“),
  klepnutím okno Pomůcky (co dělají a „Jak získat“). Ve hře totéž okno klepnutím na počítadlo tahů, i s tím, co jde v té hře použít.
  Hra, ve které hráči nezbylo žádné území, má v Mých hrách „všechna tvá území padla“ a tlačítko Mapa (nečeká na tah).
- **Vzkříšení**: když hráč přijde o poslední území (i když se na hru jen podívá), vyskočí okno „Všechna tvá území padla. Použít
  Vzkříšení?“ se zásobou (Použít / Teď ne); bez pomůcky „Vzkříšení nemáš, hru teď jen sleduješ“ a jak ho získat. Pak zůstane štítek
  dole na mapě (Vzkříšení 2/3, nebo Mimo hru · jak se vrátit) a nabídka v listu území. Po Použít mapa ztmavne, platná území zlatě září
  a nahoře je pruh „Klepni na zářící území“ se Zrušit; klepnutí na neplatné řekne proč. Po výběru zlatý ankh vystoupá, kolem běží vlny,
  území se přebarví barvou hráče, zapíchne se vlaječka a banner „Vzkříšení! … je tvoje, 60 s chráněné.“ (při omezeném pohybu bez
  animace). Chráněné území má na mapě modrý štít s odpočtem sekund; soupeř v listu území vidí zašedlé Zaútočit a „Území je chráněné po
  vzkříšení ještě N s.“, po konci ochrany se mapa sama překreslí.
- **Tah navíc** se nabídne, když hráči dojdou tahy: zlatý štítek „Tah navíc“ dole na mapě, řádek „Použít Tah navíc“ v listu území a v okně
  „Kolo N dohráno“. Použití se potvrdí v okně (vzácná pomůcka), pak zlatý banner, „+1“ u počítadla tahů a záznam v kronice.
- **Půl na půl**: tlačítko „½ Půl na půl“ v záhlaví otázky vedle hvězd. První klepnutí se zeptá „Opravdu?“, druhé ji použije; dvě
  špatné možnosti se přeškrtnou a vypnou (krátká animace, bez ní při omezeném pohybu), v záhlaví zůstane „½ použito“.
- Zisk: oslava „Nová pomůcka do Dobývání: Půl na půl (1/2)“ s pečetí pomůcky; v Sezóně obřad stupně s nadpisem „Nová pomůcka do
  Dobývání“ a pečetí i na cestě odměn (5. a 15. stupeň, dokud zásoba není plná); v Truhle řádek „A navíc pomůcka do Dobývání: Půl na půl“.
- Nápověda Dobývání má záložku Pomůcky a v záložce Konec pravidlo Vzkříšení; Mudrlant tipy `dobyvani-pomucky` a `dobyvani-vzkriseni`
  jsou pro toho, kdo Dobývání už otevřel.

**Technicky** (blok „30: Dobývání – pomůcky“ ve schema.sql)
- Tabulky `player_items` (hráč, druh, počet; strop v kontrole) a `player_item_grants` (hráč, klíč zdroje, druh, granted); hráč je jen čte.
- Zisk: `player_item_grant` volají `boss_submit`, `daily_quiz_answer`, `chain_submit` a `conquest_finish` (co vítěz dostal, řekne
  `conquest_claim`); jejich výsledky mají `item` = `{ kind, granted, full, already, count, max }`. Sezónu a truhlu počítá aplikace
  a o pomůcku si řekne přes `player_items_claim(source, key)` (sezóna jen stupně 5 a 15 a jen tento nebo minulý měsíc, truhla tento nebo
  minulý týden a los 5 % na serveru).
- Použití: `conquest_use_extra(game)` zapíše tah druhu `extra` bez území (`conquest_budget`: extra, `conquest_state` budgets.extra),
  `conquest_use_fifty(game, siege, target)` v bitvě vybere dvě nesprávné možnosti (`conquest_siege_players.fifty`, ostatním `fifty: true`),
  jinde jen zapíše použití (`conquest_players.fifty_at`). Zásobu vrací `player_items_mine`, `conquest_lobby` a `conquest_state` (`items`
  i s `can_extra` a `extra_block`, proč Tah navíc teď nejde).
- Vzkříšení (blok „39: Dobývání – pomůcka Vzkříšení“): `conquest_use_revive(game, target)`, `conquest_revive_targets`,
  `conquest_revive_block`, ochrana `conquest_territories.shield_until` v `conquest_attack_check` a `conquest_bot_move`, zisky
  `conquest_revive_starter`, `conquest_revive_streak` a `revive:<hra>` v `conquest_finish` (`conquest_claim`: `revive_item`); hráči bez území
  chtějí další kolo sami (`conquest_round_auto`); `conquest_respawn` nic nedělá. Podrobnosti v docs/SUPABASE.md (schéma 39).
- Testy: `tests/sql-pomucky.test.js` (zisky, klíče a stropy, použití), `tests/sql-vzkriseni.test.js` (Vzkříšení: zisky, cíle, ochrana,
  boti, kolo, pořadí), `tests/conquest-items.test.js`, `tests/conquest-revive.test.js`, `tests/season.test.js` (5., 8. a 15. stupeň),
  `tests/e2e-conquest.test.js` (rozcestník, otázka, bitva, Kolo dohráno, Vzkříšení).
