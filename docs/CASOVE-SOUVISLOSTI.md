# Časové souvislosti

Otázky na vztahy v čase napříč tématy: co bylo dřív, kdo se s kým mohl potkat, co vzniklo až po něčí smrti. Logika je v `time-questions.js`
(čistá, testovaná v Node), osa výsledku v `visuals.js` (typ `chronology`), napojení na hru v `app.js` (`timePlan`, `quizTime`, `isTime`).

## Kde se hrají

| Místo | Kolik |
| --- | --- |
| Hraní tématu a Mix | asi desetina otázek (`RATE`), jen když číselná otázka nevyšla a téma má data; témata Historie, Fyzika, Chemie, Výtvarné umění, Literatura, Hudba, Film, Architektura, Sport a Biologie (jen objevy) |
| Kvíz dne | od `QUIZ_FROM` (14. 11. 2026) jedna otázka denně, asi ve třetině dní dvě (`quizSlots`): pozice od třetí otázky, jen s tématem, které otázky umí; otázka ze semínka otázky (`<semínko>:cas`), takže je pro všechny stejná a po zavření aplikace se sestaví znovu stejně |
| Dnešní otázky, učení, chyby, opakování, výzvy, turnaje, Bleskovka, Přežití | nikdy |

Testy, které počítají jen s obyčejnými otázkami (`window.MUDRLANT_NUMERIC_RATE = 0`), Časové souvislosti také nedostanou; vlastní podíl jde nastavit
`window.MUDRLANT_TIME_RATE`, druh vynutit `MudrlantTime.force = 'meet'` (nebo `true` pro libovolný).

## Druhy otázek

Vždy čtyři možnosti a právě jedna správná. Zadání je bez slovesa ve shodě s pohlavím hráče; osobnost či věc je v panelu otázky (ne v pádě
v zadání – „tuto osobnost“), slovesa u „kdo“ jsou v obecném tvaru jako jinde ve hře („Kdo z nich mohl…“).

| Druh (`type`) | Zadání | Pravidla |
| --- | --- | --- |
| `order` | Co bylo vynalezeno / objeveno nejdřív (nejpozději)? Která opera měla premiéru…, Který film…, Která stavba vznikla…, Co se stalo… | čtyři věci stejného druhu z hraného tématu (jen známé), sousední roky od sebe aspoň 10 let (od 1900 u filmů, seriálů, misí, vynálezů, objevů a událostí 5; před 1500 50, před 1000 100; stavby aspoň 25) |
| `meet` / `nomeet` | Kdo z nich mohl potkat tuto osobnost? / Kdo z nich se s touto osobností potkat nemohl? | „mohl“ = jako dospělí (od 18 let) spolu žili aspoň 10 let; „nemohl“ = mezi životy je mezera aspoň 10 let (před 1500 25, před naším letopočtem 60); nesprávné nejvýš 150–600 let daleko a s mezerou kolem 15–60 let (jasně, ne zjevně); jiný obor má přednost (Newton a Bach) |
| `after` / `during` | Co bylo vynalezeno (objeveno, vzniklo, se stalo) až po smrti této osobnosti? / Co už existovalo za života…? | odstup od úmrtí i narození aspoň 10 let (dřív víc); událost „za života“ opravdu za života; vlastní díla osobnosti a věci s jejím jménem (Kouzelná flétna, Newtonův zákon) se nenabízejí |
| `century` | Co se stalo ve stejném století jako tato událost? (vynález, objev, dílo, stavba) | věc i možnosti aspoň 8 let od přelomu století (rok 1300 patří do 13. století), nesprávné z jiného století a aspoň 40 let od věci; funguje i před naším letopočtem |
| `alive` | Kdo z nich žil v době, kdy vznikl tento vynález? (dílo, obraz, stavba, objev, událost, premiéra filmu) | jedna osoba naživu (s odstupem 10 let od narození i úmrtí), ostatní zemřely dřív nebo se narodily později; tvůrce věci se nenabízí |
| `born` | Kdo z nich se narodil nejdřív (nejpozději)? | čtyři známé osoby stejné kategorie, roky od sebe jako u `order` (od 1900 5 let) |
| `oldest` | Kdo z nich žil nejdéle? | čtyři zesnulé známé osoby stejné kategorie (narozené od roku 1000), věky od sebe aspoň 4 roky, nejstarší aspoň o 5 let |
| `age` | Kolik let bylo autorovi (autorce, režisérovi, režisérce), když toto dílo vzniklo? | rok díla minus rok narození (dílo za života autora), čtyři věky po 5 letech vzestupně (skutečný věk může být o rok menší) |

Kontrola (`check`) je stejná pro hru, testy i audit: otázka, která jí neprojde, se nesestaví (`buildRound` vrátí null a hraje se obyčejná otázka).

## Data a spolehlivé roky

- **Hrané téma**: položky z jeho dat (`timeFacts`) – na co se otázka ptá, bere se jen z položek, které hra právě nabízí (kategorie a známost z nastavení).
- **Ostatní témata**: jen známé položky z `data/souvislosti.json` (`npm run build:souvislosti`, po sestavení dat témat), bez fotek a zemí.
- **Slavné objevy a vynálezy**: `data/vynalezy.json` (`npm run build:vynalezy`): ruční seznam (rentgenové záření, penicilin, Rosettská deska, laser…)
  s rokem podle učebnic; z Wikidat český název, článek, fotka a kontrola roku (P575 doba objevu či vynálezu, P571 vznik, P585, P580). Položka, kde
  Wikidata uvádějí jiný rok o víc než 2 roky, se vynechá; u myšlenek a jevů, kde Wikidata rok neuvádějí (heliocentrismus 1543, radioaktivita 1896),
  je rok ručně ověřený (`ok: 'ucebnice'`).

Co se nebere (`timeFacts`): roky před 1500 dělitelné 50 (odhady) a roky 0 a 1 (zástupný údaj pro „1. století“), osoby narozené či zemřelé před
rokem 1000 v kulatém roce (papež Linus 10–79, Plútarchos 40–120, Hugo Kapet 940) a osoby s popisem „asi 27–66“, „cca 380“, osoby bez úmrtí narozené
před víc než 100 lety, letopočet v názvu (Zemětřesení v Lisabonu v roce 1755), dlouhé války (konec víc než 5 let po začátku), přibližné roky obrazů
(`ya`, `yc`), díla a vynálezy do roku 1700 s kulatým rokem (Kupec benátský 1600, klavír 1700), sporné vynálezy (parní stroj: Newcomen 1712, nebo
Watt 1769; papír), prvky známé od starověku (uhlík, síra) a bor, z přístrojů jen ty s rokem vynálezu, z vesmíru jen planety, měsíce, komety a hvězdy,
stavby před rokem 1850 (rok bývá začátek stavby nebo přestavba), muzea a galerie (rok založení sbírky) a kulaté roky staveb. Dílo s rokem po smrti
autora nebo dřív než 12 let po jeho narození (`authorFits`: Macbeth 1623 = první souborné vydání, Proces 1925, Turandot, Satirikon „1“) se neptá:
rok nepopisuje vznik. Roky jsou v astronomickém číslování jako ve všech datech (−355 = 356 př. n. l.), rozdíly let proto sedí i přes začátek letopočtu.

Obor osobnosti z kategorie Osobnosti v Historii se bere z popisu Wikipedie (první podstatné jméno bez roků: „portugalský fotbalový trenér“ → trenér),
povolání z Wikidat tu bývá nepřesné (Mourinho „diplomat“, Laplace „politik“). Jméno osoby v možnostech, vysvětlení i nápovědě je název článku
Wikipedie, když je kratší (Vladimir Putin, Petr Kropotkin) a jména čtyř možností se tím neslijí.

## Nápovědy a vysvětlení

1. **Časová osa** (jen u otázek s osobností či věcí): její život nebo rok s několika světovými událostmi, žádná z nich není blízko roku možnosti ani
   nenese její jméno. Osa, jejíž roky hráč už vidí, se vynechá (`timelineKnown`, jako u ostatních otázek).
2. **Jedna možnost**: roky nejbližší nesprávné možnosti (u otázek bez osobnosti i druhá nesprávná). Správnou nápověda neprozradí nikdy.

Panel otázky se u Časových souvislostí smí zmenšit až na 4 rem (`TIME_PANEL_HEIGHT` v `app.js`): dvouřádkové zadání a možnosti s oborem by jinak na
360×640 uřízly konec panelu či záložky. Popis (obor, druh) je u možností jen u otázek s osobností či věcí; u otázek bez ní jsou popisy s fotkami
v panelu.

Po odpovědi je nahoře vysvětlení (osobnost a možnosti s roky a vztahem: „současně 42 let“, „mezera 35 let“, „13 let po smrti“, „ve věku 47 let“,
„17. století“, „1866 − 1824 = 42 let“) a první záložka panelu je osa všech možností (správná zeleně, osobnost zlatě, podklad ukáže život, století
či rok). `description` nese totéž jako text pro starší aplikace, které dostanou otázku uloženou na serveru.

Body jako u výběru z možností (bez nápovědy 4, každá nápověda bod), ve variantě psaní dvojnásobek jako u číselných otázek. Do chyb, opakování,
poznaných položek ani souhrnu odpovědí ostatních se nepočítají; počítadlo `timeAnswered` řídí tip Mudrlanta „Časové souvislosti“.

## Kontrola a testy

- `npm run audit:souvislosti -- --sample=30 --runs=300` sestaví otázky všech témat jako hra, ověří je a vypíše ukázky; nenulový exit kód při chybě.
- `tests/time-questions.test.js`: výpočty (i př. n. l.), každý druh otázky na malých datech, nejednoznačné otázky, zadání, nápovědy, osa, Kvíz dne
  a otázky ze skutečných dat všech témat.
- `tests/e2e-time-questions.test.js`: otázka a výsledek v prohlížeči na 360×640 a 390×780 (i tmavý režim a varianta psaní), CSP.
