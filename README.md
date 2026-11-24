# Mudrlant

Kvízová aplikace s tématy **Zeměpis**, **Historie**, **Biologie**, **Chemie**, **Fyzika**, **Geologie**, **Vlajky a znaky**, **Mytologie**, **Výtvarné umění**, **Architektura**, **Hudba**, **Literatura**, **Film**, **Sport** a **Technika a vynálezy, **Sport** a **Jídlo a pití**. Všechna témata fungují stejně.

**Navigace** – hlavní obrazovky jsou záložky spodní lišty a žádná se neposouvá (podrobnosti se otevírají o klepnutí hlouběji):
**Dnes** (dnešní výzvy Kvíz dne, Řetězovka, Tajemná otázka a Boss týdne, karta Dnešní otázky s výběrem tématu, truhla a příležitostné pruhy),
**Hrát** (Mix, 15 témat a režimy Bleskovka, Přežití, Na mapě a Učení), **Soupeři** (Čeká na tebe, dlaždice Výzvy, Dobývání, Turnaje a Skupiny
s vlastními okny, pás přátel), **Postup** (úroveň, Sezóna, cíle týdne, odznaky, mistrovství, album…) a **Já** (profil, Mudrlant, nastavení hry,
upozornění, účet). Při hře se lišta schová. Zvolená záložka se pamatuje do zavření aplikace (`sessionStorage`), začíná se na záložce Dnes.

Co aplikace umí:

- **Dnešní otázky** – každé téma má jednu otázku denně, pro všechny stejnou (ze známých položek, asi desetina z těžších), a vlastní sérii dní; výsledek jde sdílet.
- **Kvíz dne** – každý den stejných 10 otázek z různých témat pro všechny (výběr z možností), jeden pokus, pořadí dne a přátel podle bodů a času, vlastní série dní; výsledek jde sdílet textem s mřížkou 🟩🟥 i obrázkem (`daily-quiz.js`, `share-card.js`, databáze viz `docs/SUPABASE.md`).
- **Tajemná otázka dne** – každý den jedna tajemná položka (místo, osobnost, věc) pro všechny, témata se střídají. Osm nápověd se odkrývá podle pražského času (0:00, 7:00, pak každé dvě hodiny do 17:00 a poslední ve 20:00): téma a druh, fakta, věty popisu se zakrytou odpovědí, obrazová nápověda tématu, rozmazaná fotka a nakonec ostrá fotka. Na den 3 tipy (psaná odpověď jako jinde, v poslední nápovědě i výběr). Body 10 s 1. nápovědou, s každou další o bod méně, špatný tip bod ubere (nejméně 1); XP 10 + 2 × body, odznaky Detektiv. Na úvodu kompaktní pruh „Nápověda 3/8 · další v 14:00“ / „Vyřešeno v 9:41 s 2 nápovědami“, druhý den včerejší odpověď a kolik hráčů ji uhodlo (do skrytí). Po vyřešení statistiky dne a přátel (schéma 19), sdílení textem a obrázkem bez odpovědi (`mystery.js`).
- **Boss týdne** – každý týden jiný boss (Mudrlant v převleku: Kapitán, Rytíř, Alchymista, Profesor Ampér, Maestro, Druid, Olympan, Režisér) s vlastní povahou a hláškami. Souboj v aréně: 10 těžkých otázek z tématu bosse stejných pro všechny, boss má 700 životů, správná odpověď ubere 50 + až 30 za rychlost, hráč má 3 srdce; 4. a 8. otázka se píše, poslední tři mají poloviční čas. Boss se během souboje mění (Plná síla, Zraněný, V koncích, Poražený). 3 pokusy za týden; výhra = emblém bosse (Album, Vitrína), titul „Přemožitel …“ a 150 XP. Společná lišta a bonus 50 XP, když bosse porazí aspoň polovina hráčů (schéma 21, `boss.js`).
- **Hraní tématu** – dlaždice tématu na záložce Hrát otevře okno Co hrát s výběrem kategorií (výchozí všechny) a tlačítky Hrát, Bleskovka a Přežití. **Mix** míchá otázky z vybraných témat. Každé téma má svou barvu (štítek a okraj hlavičky), klepnutím na štítek jde změnit kategorie nebo téma. Jen známé položky, nebo i méně známé.
- **Bleskovka a Přežití** – režimy pro jednoho hráče, spouští se tlačítky vedle **Hrát** v okně s výběrem tématu (pro téma i Mix, s vybranými kategoriemi). Bleskovka: 60 sekund, co nejvíc správných odpovědí, vždy 4 možnosti bez nápověd, chyba ubere 3 sekundy, čas stojí při načítání otázky. Přežití: tři životy, prvních 5 otázek ze známých položek, pak přibývají méně známé (od 25. otázky celá sada), bez nápověd. Rekord se pamatuje pro každé téma, Mix i celkově (jen v zařízení, `mudrlant.modes`); XP 3 za správnou odpověď (Bleskovka) či 4 za přežitou otázku, nejvýš 150 XP denně v každém režimu, +20 XP za překonaný rekord jednou denně. Chyby jdou do Mých chyb a procvičování; do dnešních otázek, výzev ani statistik tréninku se režimy nepočítají; mají vlastní odznaky Bleskovka a Přežití (nejlepší hra) a cíle týdne. Výsledek jde sdílet jako obrázek (`modes.js`, obrazovky v `app.js`).
- **Odměny** (`rewards.js`, bez peněz, nic se nekupuje):
  - **Truhla Mudrlanta** – za všechny tři cíle týdne. Na záložce Dnes se ukáže řádek s truhlou, truhla se po klepnutí zatřese a otevře (při „omezit pohyb“ bez animace). Vždy v ní je věc, kterou hráč ještě nemá: doplněk, barva doplňků, rámeček, talár nebo barevné téma z `look.js`, a to z věcí odemykaných úrovní, které by odemkl nejdřív (los z šesti nejbližších, jiný druh než minule; věci za odznaky truhla nedává). Zhruba jednou z deseti místo ní vzácný obrázkový rámeček, který jinde nejde získat (Duha s mráčky, Růže a trny). Každá věc jen jednou; když hráč má všechno, dá 250 XP. K tomu ochrana série, dokud jich nemá dvě. Věc jde hned nasadit.
  - **Ochrana série** – nejvýš 2. Z truhly a za každých 7 dní v řadě dnešních otázek (některého tématu) nebo Kvízu dne. Když hráč vynechá právě jeden den (série aspoň 3 dny), ochrana se při dalším spuštění použije sama a zachrání ten den pro všechny série (dnešní otázky všech témat i Kvíz dne); zachráněný den se do délky série nepočítá, dva vynechané dny v řadě nezachrání. Štít s počtem je u Dnešních otázek, ve výsledku Kvízu dne a v Mém postupu. Sérii Kvízu dne počítá server (`daily_quiz_streaks`) bez ochran; aplikace ukáže větší z obou hodnot (zachráněné dny zná jen zařízení a účet).
  - **Diplomy** – za plné mistrovství tématu (5 hvězdiček, 300 poznaných položek) obrázek 1080 × 1350 (`share-card.js`): „Mistr zeměpisu“ v barvě tématu, ikona tématu, sova v barvě obleku, jméno hráče (jde změnit) a datum. V Mém postupu → Diplomy, sdílet nebo stáhnout jako PNG.
  - **Sezóna Mudrlanta** (`season.js`) – měsíční cesta odměn zdarma: sezóna = kalendářní měsíc v Praze („Sezóna Listopad 2026“), XP sezóny = XP od začátku měsíce (kdo začne uprostřed, počítá se od té chvíle). 20 stupňů s rostoucími kroky (200 → 2 200 XP, celkem 19 100 XP: aktivní hráč s 15–20 minutami denně ji za ~20 dní dohraje, příležitostný dojde zhruba na stupeň 8–12; výpočet v komentáři `season.js`). Každý dosažený stupeň se vyzvedne klepnutím (pečeť praskne a vystoupá z ní odměna; při „omezit pohyb“ hned): věc, kterou hráč nemá (stejný výběr jako truhla, nikdy věc za odznak), na stupních 3, 7, 13 a 17 ochrana série (při plném počtu věc), na 10. Truhla v půli sezóny se dvěma věcmi a na 20. **Sezónní truhla** (fialovo-stříbrná se stuhou sezóny): rámeček měsíce, doplněk a postavička měsíce (data v `Look.SEASON_BUNDLES`, do truhly jde jen to, co už je v katalogu) a titul **Šampion sezóny**. Výběr věci je stejný na všech zařízeních (los podle sezóny, stupně a hráče). Na úvodu místo cílů týdne pruh „Sezóna Listopad: čekají 3 odměny“ (truhla týdne má přednost), v Mém postupu karta se stupněm a okno s celou cestou. Nevyzvednuté stupně skončené sezóny jdou vyzvednout ještě do 7. dne dalšího měsíce. V účtu tatáž sezóna = menší začátek (XP načtené z účtu se do sezóny zařízení nepočítá) a sjednocené stupně, novější sezóna nahradí starší.
  - **Odměny za sérii dní** – rámečky za odznaky série dnešních otázek: Jiskra (7 dní), Plamenný (30), Stovka (100) a Věčný oheň (365), animované (při „omezit pohyb“ stojí). Ve výsledku dnešní otázky a v okně ochrany série řádek „Další odměna za sérii: Stovka za 100 dní (zbývá 37)“, na úvodu v popisku štítku série.
  - **Obrázkové rámečky** (`look.js` `ART_FRAMES`, `icons/frames/`) – deset nejvzácnějších rámečků jako kreslený prsten kolem obrázku hráče (obrázek přesně vyplní jeho díru, obojí se zmenší na 80 %, ať prsten nepřekrývá okolí): Ohnivý prstenec (úroveň 37), Mořská vlna (49), Steampunk soukolí (63), Galaxie (77), Královský vavřín (94), Bleskový prstenec (odznak Hromovládce), Ledová koruna (Nesmrtelný), Strážný drak (Všude hvězdář) a jen z Truhly Mudrlanta Duha s mráčky a Růže a trny. Obrázky vyrábí `scripts/frame-images.py` z `branding/ramecky/`.
  - **Postavičky** (`look.js` AVATARS, obrázky `icons/avatars/` ze `scripts/avatar-icons.py`) – profilové obrázky za odměny s přebarvitelnými částmi (Nastavení → Profil → Postavičky). Kromě postaviček za úrovně a odznaky, legendárních za diplomy a sezónních je tu 23 dalších (`NEW_AVATARS`, docs/OBRAZKY.md oddíl 26) rozdělených do celé hry: úrovně 10, 17 a 31, odznaky Kvízu dne, Bleskovky, Přežití, Tajemné otázky, Řetězovky, Bosse týdne, výzev, sázek, Dobývání, týdenních cílů, témat, opravených chyb a těžkých otázek, Album sbírky na 50 %, Truhla Mudrlanta (i stupně Sezóny a Zlatá truhla), vzácný dárek z truhly, 3 pozvaní kamarádi a první prestiž. Zamčená řekne, jak se odemkne; server ji pustí do profilu, jen když ji hráč má (schéma 35, Pavouk pletař za odznak Řetězovky od schématu 36).
  - **Pozvi kamarády** (`referral.js`, schéma 32) – každý přihlášený hráč má kód přítele (8 znaků, „ABCD-2345“) a odkaz `?pritel=KÓD` (okno Pozvi kamarády z řádku na záložce Já a z karty v okně Přátelé na záložce Soupeři: Sdílet odkaz, odměny, pozvaní s počtem her, pole na kód od kamaráda). Kód použije jen nový účet (do 14 dnů od založení), jednou; pozvaný a zvoucí se stanou přáteli. Pozvaný po první hře dostane rámeček **Přátelský** a 200 XP; zvoucí za 1 kamaráda rámeček Přátelský a 300 XP, za 3 reakci 🤗 Vítej mezi námi, vítězný efekt Srdíčka přátel a 500 XP, za 10 rámeček **Parta** a 1 000 XP. Kamarád se počítá, až odehraje aspoň 3 hry, které zná server (Kvíz dne, výzva, Řetězovka, Tajemná otázka, souboj s bossem), takže falešné účty bez hraní nic nedají. Vše hlídá a jednou vydá server (`referral_status`, `referral_join`, `referral_claim`); odkaz bez přihlášení otevře pozvánku s přihlášením.
  - **Tematické víkendy** (`weekend.js`) – každý druhý víkend má téma („Víkend historie“): od pátku 18:00 do neděle 24:00 pražského času dávají otázky z něj dvojnásobek XP za odpověď (řádek „Víkend …: dvojnásobek XP“ v rozpisu XP). Rozpis je pevný a pro všechny stejný (pořadí 14 témat od pátku 2. 1. 2026, od 3. kola, pátku 29. 1. 2027, i s Jídlem a pitím: `ROTATION_STEPS`), bez serveru. Na úvodu pruh pod cíli týdne („Víkend filmu · do neděle · 2× XP · Hrát“, v pátek před 18:00 „dnes od 18:00“), na nízkém displeji čip 2× XP vedle cílů; dlaždice tématu má štítek 2× XP.
  - **Prestiž** (`prestige.js`, schéma 32) – na úrovni 100 jde v okně Úrovně a tituly (Můj postup) po vysvětlení a potvrzení přejít do prestiže: úroveň se ukazuje znovu od 1 se značkou ★1 (hlavička, titul u jména, profil hráče), každá další úroveň za 500 XP, na úrovni 100 další prestiž. Je to jen vrstva zobrazení nad XP: XP, odznaky, žebříčky ani nic odemčeného se nemění. Za první prestiž rámeček **Prestižní**. Přihlášenému ji drží server (`prestige_up` ověří XP v účtu), hostovi zařízení.
  - **Reakce a vítězné efekty** (`friends.js`, schéma 32) – k základním reakcím po zápase (👍 🔥 😅 🤝) další za úroveň (😮 5, 🧠 15, 🦉 30, 🙌 50), odznaky (🎯 Střelec, 💪 Zkušený bojovník), Sezónu Mudrlanta (🎉 10. stupeň, 👑 20. stupeň) a pozvané kamarády (🤗). Vítězný efekt (Konfety, Hvězdný déšť, Ohňostroj, Zlatá koruna, Blesky, Sezónní záře, Srdíčka přátel) si hráč vybere v okně Reakce a vítězné efekty (odkaz pod reakcemi po zápase) a po vyhrané výzvě ho uvidí on i poražený soupeř. Server přijme jen odemčenou reakci a efekt. Animace jsou třídy CSS (CSP bez vložených stylů), při „omezit pohyb“ jen krátké prolnutí.
  - **Vzkříšení v Dobývání** (`conquest.js` ITEMS.revive, schéma 39) – kdo přijde o všechna území, už se do hry nevrací sám: pomůckou Vzkříšení (nejvýš 3) si vybere volné nebo neopevněné území (ne domovský hrad), které je pak 60 s chráněné před útoky, a hraje dál; bez ní hru jen sleduje. Jedno dostane každý na začátek, další za dohrané započítané hry s body, sérii Kvízu dne (7, 30, 100, 365 dní), 8. stupeň Sezóny a vzácně z Truhly Mudrlanta a Zlaté truhly (docs/ODMENY-DOBYVANI.md oddíl 9).
  - **Výplně území a vzácné znaky v Dobývání** (`conquest.js` PATTERNS a RARE_EMBLEMS, schéma 38) – 12 výplní (vzor, kterým se na mapě vybarví území hráče v jeho barvě; barevnou výplň má ve hře jen jeden hráč) a 12 vzácných znaků (Gryf, Sfinga, Kraken…) za výhry na mapách, bitvy, území přes moře, hry bez ztráty hradu, ale i za Bosse týdne, sérii Kvízu dne, celé Řetězovky, Zlatou otázku, zimní Sezónu a vzácně z Truhly Mudrlanta. Server je spočítá z dat, která má (i zpětně), nové oslaví a do hry pustí jen odemčené; v okně Barva a znak jsou zamčené zašedlé s tím, jak je získat a kolik chybí.
  - **Vlastní barva obleku** (`robe-color.js`, od úrovně 20) – v Nastavení → Mudrlant pod osmi taláry řádek s duhovou dlaždicí a posuvníky odstínu a světlosti (pod úrovní 20 zamčený „Od 20. úrovně“). Sova se přebarví v prohlížeči na plátně stejným postupem jako `scripts/owl-robes.py` (jen vínová oblast taláru a čepice, stínování a obrys zůstanou) a ukáže se všude, kde sova je (hlavička, sovy titulů, profil, sdílené obrázky); u cizí sovy podle `robe=vlastni;robec=odstín.světlost` v profilu. CSP má kvůli tomu `img-src blob:`.
  - Stav je v zařízení (`mudrlant.rewards`) a po přihlášení i v účtu (`profiles.rewards`, schéma 9): věci, truhly, zachráněné dny a diplomy se sčítají, počet ochran platí z novější změny, takže přežijí přeinstalaci. Starší databáze bez sloupce nevadí (odměny zůstanou v zařízení).
- **Zvuky a vibrace** – krátké tóny syntetizované přes Web Audio (správně, špatně, tikání posledních 5 s Bleskovky, nová úroveň a titul, odznak, nový rekord) a vibrace při chybě a rekordu; AudioContext vzniká až po klepnutí hráče. Obojí jde vypnout v Nastavení → Hra (`sound.js`, `mudrlant.sound`).
- **Zdroj obrázku** – u každého obrázku z Wikimedia Commons (fotka, vlajka, obraz, mapa rozšíření; v otázce, ve výsledku, v okně s popisem i v atlasu) je vlevo dole malé „i“. Okno ukáže licenci, po odpovědi i autora, datum, popis, název souboru a odkaz na Commons – před odpovědí nic, co by prozradilo odpověď. Údaje se stáhnou z API Commons až po klepnutí, bez sítě zůstane soubor a odkaz (`photo-source.js`).
- **Učení** – bez bodů a systematicky: v každém tématu jsou celé kategorie a **okruhy** (Česko, Přemyslovci, Angličtí panovníci, Šelmy, Naše příroda, Vyhynulé druhy, Halogeny, Vitamíny, Základní jednotky SI…). Okruh jde procházet popořadě jako atlas, nebo procvičovat jen jeho otázky; postup se ukládá. K tomu **Moje chyby** – co hráč neuhodl, jde si prohlédnout a procvičit znovu.

Při prvním spuštění si hráč zvolí variantu hry – výběr ze čtyř možností, nebo psaní odpovědi za 1,5× víc bodů (zaokrouhleno na celé body: bez nápovědy 6, pak 5, 3 a 2). Psaní platí jen ve hře pro jednoho hráče: výzvy (i výzvy skupině, odvety a sázky), turnaje, Kvíz dne a Dobývání se hrají vždy s výběrem z možností a databáze psanou výzvu nezaloží (schéma 31). Výzvy založené s psaním dřív se dohrají s psaním za dvojnásobek, jako je hrál soupeř.

## Otázky a nápovědy

Základní otázka je „Co je to?“ podle kategorie (Který prvek to je?, Kdo to je?, Co je to za zvíře?). Témata mají i vlastní druhy otázek, kde je název vidět a hádá se něco jiného:

| Téma | Další otázky |
| --- | --- |
| Zeměpis | Ve kterém státě to je? |
| Historie | Ve kterém století začal vládnout? (narodila se, nastoupil do úřadu, odehrálo se, vznikl) – vždy jeden okamžik, ať na přelomu století nejsou správně dvě odpovědi. U událostí (smlouvy, kongresy, koncily, katastrofy, výpravy, atentáty) i Ve kterém dnešním státě se to stalo (byla podepsána)? |
| Biologie | Do kterého řádu (u rostlin a hub čeledi) patří? U plemen psů a koček Ze které země plemeno pochází? Lidské tělo (kosti, svaly, orgány, žlázy) podle kresby, soustavy a latinského názvu. Člověk a zdraví: nemoci (skupina podle MKN-10, příznaky, původce a přenos, jen snímky z mikroskopu), lékařství (obory, léky, přístroje, vyšetření a léčba), slavní lékaři a psychologie (psychologové, pojmy, jevy, fobie a experimenty) |
| Chemie | Jakou značku má tento prvek? Jaký vzorec má tato látka? |
| Fyzika | Jaká je jednotka SI této veličiny? Jakou značku má tato jednotka? Co měří tato jednotka? Který zákon, jev či částice to je? Co je to za těleso, sondu nebo přístroj? (veličiny, jednotky, zákony a jevy, částice, vesmír, mise, fyzici a astronomové) |
| Vlajky a znaky | Vlajka či znak jsou vidět hned: Čí je to vlajka? Čí je to znak? (státy, české kraje a města, organizace) |
| Chemie | Jakou značku má tento prvek? Jaký vzorec má tato látka? Jaká reakce, pojem či metoda to je? (prvky, látky, reakce a procesy, pojmy a metody, chemici s Nobelovou cenou – rok a za co, materiály a suroviny) |
| Fyzika | Jaká je jednotka SI této veličiny? Jakou značku má tato jednotka? Co měří tato jednotka? U vynálezů Kdo to vynalezl? a Ve kterém století (od roku 1900 desetiletí) to bylo vynalezeno? Astronomické jevy a pojmy podle druhu (Který meteorický roj to je?, Jaký druh vesmírného tělesa to je?, Který útvar to je?). U raket a kosmických lodí Ze které země je? a Ve kterém desetiletí poprvé letěla? |
| Vlajky a znaky | Vlajka či znak jsou vidět hned: Čí je to vlajka? Čí je to znak? (státy, české kraje, města a obce, regiony států, velká města světa, zaniklé státy, území a organizace) |
| Mytologie | Jak se jmenuje v římské/řecké mytologii? Ze které mytologie je? |
| Geologie | Nerost či hornina jsou vidět hned: Jakou má tvrdost podle Mohse? Jaký má vzorec? Do které skupiny hornin patří? Které je to období? |
| Výtvarné umění | Obraz či socha jsou vidět hned: Co je to za obraz? Kdo to namaloval? Ke kterému směru patří? Dále umělci, fotografové, ilustrátoři a umělecké směry |
| Architektura | Stavba je vidět hned: Jaký je to sloh? Kdo ji navrhl? |
| Výtvarné umění | Obraz či socha jsou vidět hned: Co je to za obraz? Kdo to namaloval? Ke kterému směru patří? |
| Architektura | Stavba je vidět hned: Jaký je to sloh? Kdo ji navrhl? (u mostů, věží, muzeí a dalších staveb bez jasného slohu název; k tomu architektonické prvky a architekti) |
| Hudba | Kdo to složil? Do kterého hudebního období patří? U oper a muzikálů i Ve kterém století měla premiéru? |
| Literatura | Kdo to napsal? Kdo tuto postavu vymyslel? Ve kterém století žil či dílo vzniklo? |
| Film | Kdo film režíroval? Ve kterém desetiletí měl premiéru? U animovaných filmů Které studio film natočilo?, u seriálů Kdo seriál vytvořil (napsal scénář)? a Ve kterém desetiletí se začal vysílat?, u večerníčků Kdo večerníček vytvořil (napsal předlohu)?, u televizních pořadů Kdo pořad moderoval?, u komiksů a anime Kdo postavu vytvořil? a Ve kterém desetiletí se postava poprvé objevila? |
| Sport | Ve kterém sportu se proslavil(a)? Kde se konaly olympijské hry? Které hry to jsou? Co je to za sport (podle fotky)? Který klub, stadion, okruh nebo soutěž to je (podle země, mapy, kapacity a fotky)? |
| Technika a vynálezy | Auto, vlak, letadlo, loď, přístroj či stroj jsou vidět hned (fotka): Co je to za auto (vlak, letadlo…)? Kdo to vyrobil (vyvinul)? Ve kterém desetiletí poprvé vzlétlo (přišlo na trh)? U firem a automobilek Ze které země pochází? a Ve kterém desetiletí byla založena? Dále vynálezci a průkopníci, internet a software, elektrárny, letiště, metra a kosmodromy (slepá mapa) |
| Jídlo a pití | Ze které země pochází tento pokrm (sýr, nápoj, kuchař)? (pokrmy, pečivo a sladkosti, sýry, ovoce a ořechy, zelenina a luštěniny, koření a bylinky, káva, čaj a nealko, víno, pivo a destiláty, kuchaři a gastronomové; u rostlin čeleď a vědecký název v nápovědách) |

**Ukaž na mapě** (`question-map.js`): „Kde leží Kilimandžáro?“, „Kde stojí Karlštejn?“ – hráč klepne na slepou mapu (obrysy bez popisků),
tip může klepnutím přesunout, mapu přiblížit tlačítky +/−, kolečkem nebo dvěma prsty a posunout tažením, pak **Potvrdit**.
Ptá se jen na místa, která jsou na mapě bod: ze zeměpisu města, vrcholy a sopky, jezera a nádrže, ostrovy, stavby, vodopády,
jeskyně, skály, národní parky a památky UNESCO typu historické město, centrum či naleziště (ne řeky, pohoří, souostroví, kulturní
krajiny ani moře), ze sportu stadiony, haly a okruhy. Výřez je pevný pro celou
oblast, ať nic neprozradí: kontinent (Evropa od Islandu po Ural, Afrika, Asie, Severní Amerika bez Havaje, Jižní Amerika, Austrálie
a Oceánie), u míst v Česku celé Česko s kraji a hlavními řekami. Místo mimo výřez, ostrov, který na mapě není, stejné jméno
na dvou místech a stavba ve velkém českém městě („kde je Praha“) se nekladou. **Body** podle vzdálenosti po zemském povrchu:
plný počet (4, při psaní 6) do 3 % úhlopříčky výřezu (Česko asi 18 km, Evropa asi 210 km; u ostrovů, jezer a parků navíc
poloměr podle rozlohy), pak ubývají až k nule na 20 % úhlopříčky; správně = aspoň bod. Výsledek ukáže tip, správné místo, čáru
mezi nimi, kruh plných bodů a „Vedle o 37 km“. Otázka přijde v tréninku asi u každé osmé vhodné otázky (po 6 až 10 vhodných
otázkách, počítadlo `mudrlant.mapGap` v zařízení) a nemá nápovědy. **Ve výzvě** (i výzvě skupině a odvetě) **a v zápase turnaje** je na mapě
asi desetina otázek: rozhoduje semínko otázky (vlastní řada čísel `<semínko otázky>:mapa`, ne počítadlo), takže ji oba hráči dostanou stejnou,
a jen u položky, která na mapu jde (jinak zůstane obyčejná). Mají ji jen hry, které to nesou: výzva se semínkem končícím `.mapa` (zakládá ji
tahle verze aplikace) a turnaj od týdne 16. 11. 2026; výzvy a turnaje starších verzí zůstanou bez mapy. Starší aplikaci srovná uložená otázka
na serveru (zamrzlé otázky): otázka na mapě má proto i jednu (správnou) možnost, aby ji přijala. Body nejvýš 4 (ve starší psané výzvě 8), v rozpisu otázek
„Ukaž na mapě“, místo a „Vedle o 312 km“ s body. Dnešní otázky a Kvíz dne ji nemají, chyby a opakování karet také ne.

**Číselné otázky** (`numeric-questions.js`) se v hraní tématu, v Mixu, ve výzvách a v turnajích přimíchají asi do každé osmé otázky, jen kde téma
má spolehlivá čísla z dat (biologie a mytologie je nemají; dnešní otázky a učení nikdy). Bez nápověd, body za přesnost (ve variantě psaní 1,5×):

- **Seřaď** – čtyři položky ze stejné kategorie (výška hor, délka řek, rozloha a obyvatelé států, česká města, stavby, roky bitev, filmů, děl a založení
  klubů, rok narození osobností, protonové číslo, tvrdost podle Mohse, stáří geologických období, průměr a oběh planet…), hodnoty vždy dost daleko od sebe.
  Klepnutí dává pořadí 1–4, další klepnutí ho zruší. Celé pořadí 4 body, jedna prohozená sousední dvojice 2 body.
- **Odhadni číslo** – jen známé položky (Kolik metrů měří tato hora? V jakém roce proběhla tato bitva?). Velikosti podle poměru (do 5 % 4 body, do 10 % 3,
  do 25 % 2, do 50 % 1), letopočty podle rozdílu let (u 20. století rok, u starších dob víc), protonové číslo podle rozdílu. Výsledek ukáže odhad na stupnici.

Do chyb, opakování ani poznaných položek se nepočítají, v režimech Bleskovka a Přežití nejsou. Ve výzvě plán otázky určuje semínko výzvy (vlastní řada čísel),
takže všichni dostanou stejnou. Otázka je vždy jen jednoho druhu: Ukaž na mapě, číselná, Časové souvislosti, nebo obyčejná.

**Časové souvislosti** (`time-questions.js`) se v hraní tématu a v Mixu přimíchají asi do každé desáté otázky (ne místo číselné), v Kvízu dne od 14. 11. 2026
jedna až dvě otázky denně (pozice ze semínka dne, jen u témat, která je umí). Vždy čtyři možnosti (i ve variantě psaní, body pak jako u psaní), po odpovědi
vysvětlení s roky a časová osa všech možností (`visuals.js`, typ `chronology`):

- **Co bylo dřív** – Co bylo vynalezeno (objeveno) nejdřív? Která opera (film) měla premiéru nejdřív? I nejpozději: čtyři věci stejného druhu z hraného tématu,
  sousední roky aspoň 10 let od sebe (před rokem 1500 aspoň 50, od roku 1900 u filmů, vynálezů a událostí 5, u staveb 25).
- **Mohli se potkat** – Kdo z nich mohl potkat tuto osobnost? (i Kdo z nich se s touto osobností potkat nemohl?): právě jedna osoba žila současně (jako dospělí
  aspoň 10 let), ostatní vůbec ne a s odstupem.
- **Za života** – Co vzniklo (bylo vynalezeno, objeveno, se stalo) až po smrti této osobnosti? Co už existovalo za života…? Odstup od narození i úmrtí aspoň
  10 let, vlastní díla osobnosti se nenabízejí.
- **Ve stejném století** jako událost, vynález či dílo (roky daleko od přelomu století, i před naším letopočtem), **Kdo se narodil nejdřív**, **Kdo žil nejdéle**,
  **Kolik let bylo autorovi (autorce, režisérovi), když dílo vzniklo** (čtyři věky po 5 letech) a **Kdo žil v době**, kdy vznikl vynález, dílo, stavba, objev či událost.

Osobnost či věc je v panelu otázky (zadání ji nemá v pádě a je bez sloves ve shodě s pohlavím hráče). Nápověda 1 je osa s osobností či věcí (bez let možností),
nápověda 2 roky jedné nesprávné možnosti. Položky hraného tématu podle nastavení, z ostatních témat jen známé (`data/souvislosti.json`) a slavné objevy
a vynálezy (`data/vynalezy.json`, roky ověřené proti Wikidatům). Do chyb ani opakování se nepočítají. Pravidla a data podrobně v
[docs/CASOVE-SOUVISLOSTI.md](docs/CASOVE-SOUVISLOSTI.md), kontrola a ukázky na skutečných datech: `npm run audit:souvislosti -- --sample=30`.

Nápovědy jdou postupně a každá ubere bod: **popis** z české Wikipedie (je vidět hned, odpověď je v něm zakrytá), **fotka**, **obrazová nápověda** tématu a **čísla a fakta** z Wikidat. Obrazové nápovědy:

- **slepá mapa** (zeměpis, bitvy) – obrysy států bez popisků, místo uprostřed; uvnitř velkého státu se mapa oddálí, až jsou vidět
  pobřeží nebo hranice. U regionů států, měst světa a českých znaků celý stát s hranicemi krajů, spolkových zemí či provincií,
  hledaný region zvýrazněný a místo vyznačené tečkou,
- **časová osa** (historie, chemici, fyzici) – život a vláda či úřad, s pár orientačními událostmi ze stejných dějin (u anglického krále anglické a světové, české jen u českých dějin),
- **mapa rozšíření** (biologie) a **strukturní vzorec** (chemie) – obrázek z Wikimedia Commons,
- **slepá periodická tabulka** (chemie) – políčka bez značek obarvená podle skupin, hledaný prvek zvýrazněný.

Popis a odemčené nápovědy jsou záložky jednoho panelu pevné výšky, takže se odpověď při nápovědě neposune a na telefonu není co posouvat. Po odpovědi jsou v záložkách fotka, mapa s polohou, snímek z družice a obrazová nápověda (i ty, které hráč neotevřel), fakta pod nimi a tlačítko **Další otázka** je přilepené dole. Jde rozkliknout i okno s popisem položky ze špatné odpovědi a ostatních nabízených možností.

Statická stránka bez serveru a bez build kroku. Nasazuje se na **GitHub Pages**: workflow `.github/workflows/pages.yml` po každém pushi zkopíruje aplikaci do větve `gh-pages` (v nastavení repozitáře je jednou potřeba zvolit Pages → Deploy from a branch → `gh-pages`).

## Soubory

| Soubor | Co obsahuje |
| --- | --- |
| `index.html` | Kostra stránky |
| `app.js` | Rozhraní: obrazovky, otázka s nápovědami, výsledek, okno s popisem, učení, nastavení, ukládání stavu |
| `quiz-core.js` | Čistá logika bez DOM (výběr položek, okruhy, zakrývání, odpovědi, body, fakta, slepá mapa, časová osa, periodická tabulka, série) – testovaná |
| `numeric-questions.js` | Číselné otázky Seřaď a Odhadni číslo: vlastnosti témat, výběr položek, body, čtení odhadu a vzhled otázky i výsledku – testované |
| `time-questions.js` | Časové souvislosti: spolehlivé roky z dat témat, výběr a kontrola otázek (Co bylo dřív, Mohli se potkat, Za života…), nápovědy, vysvětlení a rozvržení osy – testované |
| `visuals.js` | Vykreslení obrazových nápověd (mapa, časová osa, obrázek, periodická tabulka) |
| `photo-blob.js` | Fotky z Commons stažené přes `fetch()` a ukázané jako `blob:` – název souboru v adrese (často odpověď) nejde vyčíst podržením fotky ani z atributů; uvolnění blobů a záložní obyčejné načtení – testovaná |
| `modes.js` | Bleskovka a Přežití bez DOM: pravidla, hodiny s trestem, obtížnost Přežití, rekordy a XP s denním stropem – testovaná |
| `sound.js` | Zvuky (Web Audio, bez zvukových souborů) a vibrace, přepínače v Nastavení – testovaná |
| `question-map.js` | Otázka „Ukaž na mapě“: výběr míst a výřezu, zobrazení, body podle vzdálenosti (testované), vykreslení a ovládání mapy |
| `daily-quiz.js` | Kvíz dne: výběr otázek ze semínka dne, součty, série, XP, uložený stav a obrazovky (karta, úvod, výsledek s pořadím) |
| `groups.js` | Skupiny: název, kód a odkaz `?skupina=KÓD`, pořadí Dnes / Týden (Kvíz dne, XP) a okna (seznam, založení, přidání kódem, detail, správa) – testovaná |
| `share-card.js` | Sdílení textu (systémové, jinak schránka) a obrázku výsledku (PNG z plátna se sovou v barvě obleku) |
| `rewards.js` | Truhla Mudrlanta, ochrana série a diplomy: výběr věci, ochrana vynechaného dne, sjednocení s účtem a jejich HTML – testovaná |
| `season.js` | Sezóna Mudrlanta: stupně podle XP sezóny, měsíce v Praze, odměny stupňů (stejné na všech zařízeních), Sezónní truhla, dovybrání minulé sezóny a okna (karta, pruh, cesta, odhalení) – testovaná |
| `topics/<téma>.js` | Jedno téma: kategorie, otázky, fakta, nápovědy a zakrývání (viz níže) |
| `data/<téma>.json` | Položky a okruhy tématu (generované z Wikidat) |
| `data/countries.json`, `data/world.json` | Státy a jejich obrysy pro slepou mapu (generované) |
| `data/souvislosti.json`, `data/vynalezy.json` | Známé osobnosti a datované věci všech témat pro Časové souvislosti a slavné objevy a vynálezy (generované) |
| `data/mapa.json` | Slepé mapy otázky „Ukaž na mapě“: cesty SVG každé oblasti už v jejím zobrazení (generované) |
| `icons.js` | Použité ikony z Lucide (generované) |
| `styles.css` | Styly z Tailwindu (generované ze `src/input.css`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalace na plochu a provoz bez internetu |
| `_headers` | Bezpečnostní hlavičky pro Netlify včetně Content-Security-Policy |

## Jak přidat téma

Aplikace o tématech nic neví – všechno potřebné popisuje soubor tématu. Nové téma (třeba Umění) potřebuje:

1. `topics/umeni.js` – stejný tvar jako ostatní témata: `id`, `title`, `icon`, `color`, `dataFile`, `words`, `categories` a funkce `facts`, `subtitle`, volitelně `visual`, `specialQuestion`, `censor`, `keepWords`, `culture`, `groupOf`, `nameAliases`, `isCzech`;
2. `scripts/build-umeni.mjs` – sestaví `data/umeni.json` (položky `{ q, t, n, c, k, d, im, ih, f, g }` a okruhy `{ id, label, text, sort }`); pomocníci pro Wikidata jsou ve `scripts/lib/wikidata.mjs`;
3. řádek `<script src="topics/umeni.js" defer></script>` v `index.html` a oba soubory v `APP_SHELL` v `sw.js`.

Test `tests/topics.test.js` každé téma zkontroluje automaticky (povinné části, ikony, zapojení do stránky, data, okruhy, možnosti odpovědí). Nový druh obrazové nápovědy se přidá do `visuals.js`.

### Pravidla, která platí pro všechna témata (i budoucí)

Jádro a aplikace je uplatní samy, téma pro ně nemusí nic dělat:

- **Nápověda neopakuje popis.** Fakt, který už je v zadání nebo popisu, se z nápovědy vynechá – i v jiném tvaru
  (Tolkien × „J. R. R. Tolkiena“, Čína × „čínský malíř“, Délka 47 km × „je dlouhá 47 km“). Kontroluje se stejným
  strojem, který zakrývá název (`isFactVisible` v `quiz-core.js`).
- **Odpověď se v textu neprozradí v žádném tvaru.** Po zakrytí názvu (téma může zakrývat po svém) projde popis, další věty
  úvodu i fakta v nápovědách ještě jednou společnou funkcí `maskLeaks` (`quiz-core.js`), která zakryje každé slovo podobné
  slovu odpovědi: skloněné krátké příjmení (Poe → Poea, Poeovi), přepisy a diakritiku (Beneš = Beneș = Benesch,
  Müller = Mueller), další tvary jména za „rodným jménem“ či „německy“ a jména velkým písmenem vedle zakryté části
  (Karl [***] Böhnich). Odpovědí je to, na co se otázka ptá (`answerNamesFor`): u „Kdo to napsal?“ autor, ne dílo.
  Téma může slova, která mají zůstat vidět, vyjmenovat ve volitelné funkci `keepWords`. Popis, který je po zakrytí skoro
  samá mezera, se zahodí a otázku nesou ostatní nápovědy. Test `tests/answer-leak.test.js` hlídá, že na skutečných datech
  všech témat (vzorek úvodů v `tests/wiki-intros.json`) v textu nezůstane žádné slovo odpovědi.
- **Nesprávné možnosti jsou co nejpodobnější správné.** `buildItemChoices` skóruje kandidáty ze stejné kategorie: stejný
  druh (štítek u otázky) a podobnost, kterou určuje téma (doba, žánr, třída, skupina prvků…), a hlavně **kultura jmen**.
  Země osoby či díla (`f.land`, jinak česká stopa, jinak národnost z popisu; historické státy se převedou na dnešní,
  `landsOf`) určí vzdálenost: stejný stát (+10) → stejná skupina (Italové, jiné románské jazyky; Japonci, Korejci, Číňané)
  (+5) → stejná oblast (+1) → sousední oblast (−3) → jiná (−8). Když stejné země není dost, podobnost klesá postupně
  (k jedinému japonskému režiséru Korejci a Číňané, ne Švédové), takže správná odpověď není jediná „typová“. K tomu drobný
  los (`CHOICE_JITTER`), ať se možnosti u téže položky střídají. Téma může zemi určit jinak nebo kulturu vypnout funkcí
  `culture(item, ctx)` (bitvy a stavby podle státu, místa a vlajky podle vzdálenosti). Vlastní žebříčky tématu (autoři,
  režiséři) přičtou `core.cultureScore(odpověď, kandidát)`. Test `tests/distractors.test.js` měří na skutečných datech podíl
  možností ze stejné země a doby. Nesprávná možnost nikdy není přijímanou odpovědí správné (Katedrála Notre-Dame u katedrály
  v Rouenu) ani nadřazeným pojmem z jejího popisu (Organická kyselina k Mastné kyselině); osoby vzdálené tisíc let se
  nenabízejí. Test `tests/question-content.test.js` hlídá systémové chyby obsahu otázek nalezené při kontrole všech témat.
- **Fotka s napsanou odpovědí** (jméno na dresu, název na plakátu či cedulce) se jako nápověda nenabídne. Najde ji OCR:
  `npm run audit:photo-text` (potřebuje `tesseract`) přečte fotky všech témat a zapíše `data/photo-text.json`;
  přečtené texty si pamatuje v `.cache/ocr`, takže po přidání tématu čte jen nové fotky. Po přidání tématu nebo
  přestavbě dat ho spusťte znovu. Pak `npm run audit:photo-masks` najde u označených fotek polohu nápisu a zapíše
  `data/photo-masks.json` – taková fotka se nápovědou ukáže s rozmazaným nápisem (po odpovědi celá). Vynechá se jen
  fotka, u které poloha nápisu známá není. Náhled zakrytí: `PREVIEW=složka npm run audit:photo-masks -- téma`.
  U vlajek a znaků, kde je obrázek přímo otázkou, se čtou i kresby (SVG) a za odpověď se berou i slova z názvu souboru
  (nápis CALIFORNIA REPUBLIC na vlajce Kalifornie, `scripts/lib/photo-words.mjs`); nápis se na obrázku otázky rozmaže.
  Nápisy, které OCR nepřečte (drobné písmo v pečeti, text do oblouku – NEVADA, STATE OF IDAHO, REPÚBLICA DE COSTA RICA), mají
  ruční zakrytí v `scripts/photo-masks-manual.json` (stejný tvar, má přednost; `ONLY_MANUAL=1 npm run audit:photo-masks` je
  jen doplní). Vlajka, která je celá nápisem (OSCE, РСФСР, FIFA), má v datech `nq`: zůstává v učení, otázkou se nestane
  (`pickItem`). Rozmazání nese rozmazaná kopie fotky v obdélníku, ne jen `backdrop-filter` (ten bez GPU nefunguje).
- **Ukázka možností:** `npm run audit:moznosti` (volitelně `-- --topic=umeni,fyzika --count=30 --seed=x --item="Věstonická venuše"`) vypíše u náhodných
  položek každého tématu otázku i s možnostmi, jak je sestaví hra; „!“ = nesprávná možnost z hodně jiné doby, „?“ = jiného druhu, než ukazuje štítek
  (`scripts/sample-choices.mjs`). Rychlá kontrola absurdních sad (k pravěké sošce pomník z 20. století, k myšlenkovému experimentu jev).
- **Obrázky mimo téma:** `npm run audit:obrazky` (`-- --topic=zemepis --flagged --all`) vypíše po tématech a kategoriích, kolik hlavních obrázků
  z Wikidat pravidlo `topic.offSubjectPhoto` vyřadí (sad s poníkem místo stavby, mapa místo jezera, slon místo národního parku, výhled z vrcholu,
  hrob nebo pamětní deska místo osobnosti, logo místo alba) a podezřelé názvy souborů k ruční kontrole. Pravidlo skládá `quiz-core.js offSubjectRule`
  ze slov názvu souboru po kategoriích a ručně ověřených položek; `app.js loadTopic` vyřazený obrázek nepoužije nikde, položka zůstane.
- **Dvě možnosti se stejným popisem:** položky téhož článku Wikipedie (i po přesměrování, pole `w`) nebo ze společného článku („X a Y“) nejsou
  mezi možnostmi jedné otázky (`sameArticle`) a nesprávná možnost, jejíž jméno je v ukázaném popisu nezakryté, se nahradí (`replaceConflicts`
  v `createRoundData`; Dobývání s pevnými možnostmi vezme jinou otázku).
- **Audit otázek:** `npm run audit:questions` (volitelně `-- --sample=300`, `--topic=historie,hudba`, `--all`) projde témata a sestaví otázky jako hra
  (`scripts/lib/audit.mjs`). Hlásí odpověď prozrazenou v popisu či nápovědách, nápovědy opakující popis, dvě správné či příliš podobné možnosti,
  nesprávné možnosti jiné země/doby, chudé popisy, rozbité odkazy na obrázky (hash souboru na Commons) a nejednoznačné psané odpovědi (aliasy).
  Nápovědy sestaví stejné funkce jádra jako hra (`planRound`, `buildHints` v `quiz-core.js`), takže audit hodnotí přesně to, co uvidí hráč.
  Zásady nápověd, které jádro vynucuje a audit hlídá jako jisté chyby u všech témat:
  - **Tvar odpovědi** (`tvar`): zakrytá místa oddělená jen spojkou, předložkou či interpunkcí jsou jeden blok (`[***] a [***]` → `[***]`)
    a slovo těsně u zakrytého místa, které mají jen některé možnosti (spojka „a“ u Lišky a psa, „5“ u Prahy 5), zakrytí pohltí
    (`mergeCensored`, `sealStructure`).
  - **Šablona** (`sablona`): nápovědou je jen text z článku; náhradní popis z Wikidat a text, který téma zadrží (`withholdText`: úvod
    o kraji, městě či regionu by je prozradil), nápovědou není nikdy. Audit navíc hlásí stejný text nápovědy u tří a více položek.
  - **Prázdná nápověda** (`prazdna-napoveda`): každá nápověda přidá něco nového oproti otázce, štítku, společné části možností
    a dřívějším nápovědám (další věty stejné jako popis, fakt z dřívějšího textu, fakt společný všem možnostem, osa se známými roky).
  - **Měřítko mapy** (`mapa-meritko`): slepá mapa se přiblíží na možnosti, když leží blízko sebe (pražské obvody na mapě Prahy
    s hranicemi městských částí a Vltavou pro orientaci z OpenStreetMap, `npm run build:casti`); tlačítka +/− mapu přiblíží či oddálí.
  Zapíše `reports/audit-otazek.md` (souhrn) a `reports/audit-otazek.json` (vše); exit kód je nenulový jen u jistých chyb, které nejsou
  v `scripts/audit-allowlist.json`.
- **Audit mapy:** `npm run audit:mapa` (volitelně `-- --source`, `--wikidata`, `--only=svet,staty`) zkontroluje mapu otázky „Ukaž na
  mapě“: podkladovou mapu (moře a pevnina na známých místech, hranice končící „do ztracena“, jezera, plochy států), polohy
  položek, obrysy z `data/mapa-tvary.json`, sestavení otázek a pokrytí. Zapíše `reports/audit-mapy.md` a `reports/audit-mapy.json`;
  exit kód je nenulový při kritickém nálezu. Opravy poloh a vyřazená místa jsou v `data/mapa-opravy.json`. Podrobně v
  [docs/MAPA.md](docs/MAPA.md).

## Účty a hra více hráčů

Hotovo: přihlášení účtem Google přes Supabase, profil hráče (jméno, emoji a barva) a **výzvy** (stejné otázky pro víc
hráčů: kód nebo odkaz `?vyzva=KÓD`, žebříček výzvy; `social.js`, tabulky `challenges` a `challenge_results`). Výzvu lze
poslat komukoli s kódem, konkrétnímu hráči podle jedinečné přezdívky, nebo náhodnému hráči (`random_opponent()`);
vyzvaný ji uvidí na záložce Soupeři v části Čeká na tebe (a v okně Výzvy). Výzvu lze nastavit: téma nebo mix, okruh tématu (třeba jen vlajky států), obtížnost
(známé / i těžší) a počet otázek; odpovídá se vždy výběrem z možností (psaní jen ve hře pro jednoho hráče). Schéma databáze je napsané tak, aby šlo pouštět opakovaně; po jeho změně ho
v Supabase spusť znovu celé.
**Rozpis otázek** (schéma 10): když výzvu (nebo zápas turnaje) dohrají oba hráči, výsledek i okno výzvy nabídnou rozpis po otázkách: zadání a správná
odpověď, u obou hráčů vedle sebe co odpověděli, správně/špatně, nápovědy, body a čas; klepnutí na otázku otevře popis položky. Při hře výzvy, zápasu
turnaje, Kvízu dne i tréninku ukazuje záhlaví otázky čip s body ve hře („12 b“).
**Zamrzlé otázky** (schéma 17): otázka výzvy, zápasu turnaje a Kvízu dne se při prvním sestavení uloží na server (`question_snapshots`) a všichni další
hráči dostanou přesně ji (stejnou položku, zadání i možnosti v pořadí), i když mají po nasazení nových dat jinou verzi témat; Rozpis otázek ukazuje
uložené otázky. Než hráč výzvu sám dohraje, vidí u soupeřů jen „dohráno“ (bez bodů, pořadí a rozpisu), ať výsledek neovlivní hru.
**Zamrzlé denní módy** (schéma 33): stejně se ukládají i Dnešní otázky, Řetězovka dne, Tajemná otázka dne a otázky Bosse týdne; uložené otázky
dne čte i nepřihlášený hráč (`daily_snapshots_get`). Aplikace je stáhne jedním dotazem hned po vykreslení úvodu, takže se po klepnutí ukážou
bez čekání. Den všech denních módů je pražský (i dnešní otázky, série a cíle: `getDayKey`), výběr položek bere jen semínko dne a data tak,
jak vypadala ve hraný den (změna úrovní známosti v datech má datum, od kterého platí: pole `ku` a `xs`, `core.itemsAsOf`), nikdy nastavení,
úroveň, historii hráče ani to, jestli se mu načetla Wikipedie. Kontrola: `node scripts/audit-denni.mjs` (pět různých hráčů téhož dne),
měření načítání: `node scripts/measure-denni.mjs` (Fast 3G a běžná síť).
**Týdenní turnaje** (vyřazovací pavouk v Mixu, kolo = jeden den): klient je v `tournament.js` (čistá logika: názvy kol, dny, stav karty, texty zpráv),
volání databáze v `social.js` a okno turnaje, hra zápasu a karta v okně Turnaje (záložka Soupeři) v `app.js`; pravidla a posun kol dělá databáze
(`tournament_tick()` a další funkce v `supabase/schema.sql`). Starší databáze bez turnajů kartu prostě neukáže.
**Speciální turnaje na téma a hlasování** (schéma 31): nárazové turnaje mimo týdenní Mix, třeba Hrady a zámky, Opery, Olympijské hry nebo Vlajky Afriky.
Nabídka 28 témat je v `tournament.js` (`THEMES`: okruhy a kategorie témat, obtížnost a kapacita tak, aby otázky stačily na celý pavouk bez opakování)
a stejná v tabulce `tournament_themes`. V okně Turnaje (záložka Soupeři) je v kartě **Turnaje** hlasování „Hlasování: jaké téma příště?“ se 4 tématy:
každý přihlášený hráč má jeden hlas, může ho měnit, dokud hlasování běží (nejvýš 10krát), a po hlasování vidí procenta. Turnaj sám se nikdy
nezaloží: spustí ho správce ve vývojářských nástrojích (`?vyvojar`, Nastavení → Speciální turnaj a hlasování → Založit speciální turnaj…) s tématem
(předvybrané je vítězné téma hlasování), začátkem a délkou kola (15 minut až 24 hodin). Přihlášky jsou otevřené do začátku, kolo n se hraje
od začátku + (n − 1) × délka kola; otázky, kontumace, XP a odznaky jako v týdenním turnaji, jen z položek tématu. Založení na téma z hlasování
(nebo Uzavřít hlasování) hlasování uzavře a otevře nové se 4 jinými tématy (bez témat dvou posledních hlasování a šesti posledních turnajů).
Hráčům s upozorněními na turnaje přijde „Začíná speciální turnaj: …“. Najednou běží nejvýš jeden speciální turnaj; v archivu je mezi týdenními.
**Rozpis kontumovaného zápasu** (schéma 31): zápas turnaje, který hráč nedohrál (vzdal, nebo mu skončilo kolo), má po rozhodnutí v rozpisu jeho
uložené odpovědi, zadání všech otázek a u výsledku „nedohráno · 7 b · 2/10“; výzva, kterou soupeř nedohrál, má rozpis s mými odpověďmi
(u výzvy starší 7 dní i s jeho nedohranými).
**Skupiny** (třída, rodina, kamarádi; schéma 8): dlaždice Skupiny na záložce Soupeři otevře seznam skupin s dnešním vedoucím Kvízu dne; detail skupiny
má pořadí **Dnes** (Kvíz dne) a **Týden** (součet bodů Kvízu dne nebo XP získané od pondělí), kód s pozvánkou (odkaz `?skupina=KÓD`, po přihlášení
se okno otevře samo) a **Vyzvat skupinu** (jedna výzva pro všechny členy, do ratingu se nepočítá). Nejvýš 10 skupin na hráče a 50 členů ve skupině;
zakladatel skupinu přejmenuje, změní kód, odebere člena nebo ji smaže. Okna a pořadí jsou v `groups.js`, volání v `social.js`, pravidla a limity
v databázi (`group_*` v `supabase/schema.sql`, popis v `docs/SUPABASE.md`).
Okno turnaje má pohled **Pavouk** (sloupce kol zleva doprava jako v NHL playoff, od osmifinále, „Celý pavouk“ ukáže všechna kola; klepnutí na hráče zvýrazní jeho cestu)
a rozbalovací **Celé pořadí** všech hráčů (místa 1.–4., pak skupiny podle kola vyřazení); jejich logika (`bracketColumns`, `standings`, `placeRange`) je čistě v `tournament.js`.
**Sdílení umístění**: po skončení turnaje, ve kterém hráč hrál, nabídne okno turnaje (i turnaj z archivu), řádek v kartě turnajů a zpráva o konci
turnaje **Sdílet umístění** a **Stáhnout**: obrázek 1080 × 1350 (`share-card.js`, kind `tournament`) s názvem turnaje a týdnem (u speciálního
tématem), sovou v barvě obleku podle výsledku (1. místo vítěz, 2.–3. oslava, 4. a vyřazení ve čtvrtfinále radost, jinak výzva; u 1.–4. místa ve vavřínovém
věnci), velkým umístěním v barvě medaile, kolem („Čtvrtfinále · Top 8“, při vyřazení v prvním kole rozmezí míst), přezdívkou, počtem hráčů
a vyhraných zápasů, datem a adresou hry. Umístění je místo, které zapsala databáze při konci turnaje (`Tournament.placement`, `shareCard`, `shareText`).
Původně: přihlášení účtem Google přes Supabase (`auth.js`, `config.js`, část Účet v Nastavení) a databázové
schéma `supabase/schema.sql` (profily hráčů s pravidly řádků). Dokud není `config.js` vyplněný, přihlášení se
neukáže a hra běží jako host. Postup nastavení je v `docs/SUPABASE.md`. Další kroky: ukládání postupu k účtu, zápasy
o stejné otázky (losování podle data už dává všem stejnou otázku) a žebříček.

## Úpravy

Po změně tříd v HTML nebo JS je potřeba přegenerovat styly, po přidání ikony seznam ikon:

```sh
npm run build:css     # styles.css (Tailwind 3.4.17 přes npx)
npm run build:icons   # icons.js (seznam ikon je ve scripts/build-icons.mjs)
```

Data témat se generují z Wikidat (zeměpis a historie přes query.wikidata.org, biologie, chemie a fyzika přes [QLever](https://qlever.dev), který zvládne i strom taxonů). Pravidla – co je „známé“, okruhy, co do tématu nepatří – jsou v příslušném skriptu. S proměnnou `BUILD_CACHE=složka` se mezivýsledky ukládají a pravidla jde ladit bez opakovaného stahování.

```sh
npm run build:countries  # data/countries.json
npm run build:world      # data/world.json (Natural Earth 1:110m)
npm run build:mapa       # data/mapa.json (Natural Earth 1:50m, ostrovy a jezera z otázek 1:10m, Česko 1:10m s kraji a řekami; po datech témat)
npm run build:regiony    # data/regiony.json (Natural Earth 1:10m: regiony států z okruhu Regiony států a české kraje; po build:vlajky)
npm run build:casti      # data/regiony.json, cities: hranice pražských městských částí a Vltava (OpenStreetMap přes Nominatim; po build:regiony; RIVERS_ONLY=1 jen řeky)
npm run build:zemepis    # data/zemepis.json (-- --doplnit: jen památky UNESCO, národní parky, moře a fakta k hotovým datům)
npm run build:historie   # data/historie.json
npm run build:biologie   # data/biologie.json (node scripts/build-biologie.mjs --zdravi obnoví jen nemoci, lékařství, lékaře a psychologii)
npm run build:chemie     # data/chemie.json
npm run build:fyzika     # data/fyzika.json (FYZIKA_ONLY=vesmir přidá jen rozšíření o astronomii a kosmonautiku nad hotová data, lib/fyzika-vesmir.mjs)
npm run build:technika   # data/technika.json (ruční seznamy a třídy Wikidat, lib/technika-sources.mjs; bez položek jiných témat)
npm run build:vynalezy   # data/vynalezy.json (slavné objevy a vynálezy, roky ověřené proti Wikidatům)
npm run build:souvislosti # data/souvislosti.json (Časové souvislosti; po datech témat a build:vynalezy; známost podle návštěvnosti české Wikipedie)
npm run build:reky      # data/zemepis.json, pole ca: další státy řek (průběh řeky proti hranicím Natural Earth 1:10m, Wikidata P205 a P131)
npm run build:fotky     # náhrady fotek z PHOTO_REPLACEMENTS v hotových datech (mapa či PNG místo fotky); pak node scripts/build-licenses.mjs
npm run build:jidlo     # data/jidlo.json (ruční seznamy scripts/lib/jidlo-lists.mjs + třídy Wikidat; známost ze seznamu a počtu jazykových verzí)
npm run build:clanky    # pole w: článek Wikipedie po přesměrování (Boson W → Boson W a Z); položky téhož článku nejsou mezi možnostmi jedné otázky
```

Logo je sova v talároku (`branding/sova-original.jpg`). Z tmavého pozadí ji vyřízne `python3 scripts/logo-cutout.py branding/sova-original.jpg branding/sova.png` (Pillow, numpy) a ikony aplikace, favicon i průhledné logo `icons/logo.webp` z ní vykreslí `node scripts/render-app-icons.js` (Playwright). Barvy aplikace podle loga (vínová `brand`, zlatá `gold`, grafitová šedá místo `slate`) jsou v `tailwind.config.js`. Náhled sdíleného odkazu (Open Graph, 1200×630, `icons/og-mudrlant.png`, značky `og:` a `twitter:` v `index.html` i v přesměrování `pages-root/index.html`) vykreslí `python3 scripts/og-image.py` (Pillow) ze stejné sovy.

Service worker (`sw.js`) při instalaci stáhne celou aplikaci (`APP_SHELL`, včetně dat všech témat) a soubory z ní pak bere rovnou z mezipaměti své verze – kód i data jsou tak vždy ze stejného nasazení a nic se při spuštění znovu nestahuje; nová verze = nový service worker, který po instalaci stránku obnoví. Ostatní soubory (denní zajímavost) jdou přednostně ze sítě. Hrát jde i offline, jen s krátkým popisem z Wikidat místo úvodu z Wikipedie.

## Testy

```sh
npm test
```

Spustí testy logiky (`tests/quiz-core.test.js`), kontrolu témat a jejich dat (`tests/topics.test.js`, stačí Node 20+) a test celé aplikace v prohlížeči (`tests/e2e.test.js`; společné kroky navigace po záložkách spodní lišty mají e2e testy v `tests/nav.js`). Ten potřebuje Playwright (`npm i -D playwright && npx playwright install chromium`), jinak se přeskočí. Používá malá testovací data (`tests/fixtures.js`) a podvrženou Wikipedii, takže nezávisí na síti, a stránku servíruje s CSP z `_headers`.

## Zdroje dat

Položky, fakta a fotky z [Wikidat](https://www.wikidata.org) a [Wikimedia Commons](https://commons.wikimedia.org), popisy z [české Wikipedie](https://cs.wikipedia.org), obrysy států, kraje a řeky [Natural Earth](https://www.naturalearthdata.com) (volné dílo), satelitní snímky NASA Blue Marble přes [GIBS](https://earthdata.nasa.gov/gibs), mapa a hranice pražských městských částí © přispěvatelé [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), ikony [Lucide](https://lucide.dev) (ISC).
