# Mudrlant

Kvízová aplikace s tématy **Zeměpis**, **Historie**, **Biologie**, **Chemie**, **Fyzika**, **Geologie**, **Vlajky a znaky**, **Mytologie**, **Výtvarné umění**, **Architektura**, **Hudba**, **Literatura**, **Film** a **Sport**. Všechna témata fungují stejně:

- **Dnešní otázky** – každé téma má jednu otázku denně, pro všechny stejnou (ze známých položek, asi desetina z těžších), a vlastní sérii dní; výsledek jde sdílet.
- **Kvíz dne** – každý den stejných 10 otázek z různých témat pro všechny (výběr z možností), jeden pokus, pořadí dne a přátel podle bodů a času, vlastní série dní; výsledek jde sdílet textem s mřížkou 🟩🟥 i obrázkem (`daily-quiz.js`, `share-card.js`, databáze viz `docs/SUPABASE.md`).
- **Hraní tématu** – dlaždice tématu na domovské obrazovce; poprvé se otevře okno s výběrem kategorií (výchozí všechny), pak se hraje rovnou. **Mix** míchá otázky z vybraných témat. Každé téma má svou barvu (štítek a okraj hlavičky), klepnutím na štítek jde změnit kategorie nebo téma. Jen známé položky, nebo i méně známé.
- **Bleskovka a Přežití** – režimy pro jednoho hráče, spouští se tlačítky vedle **Hrát** v okně s výběrem tématu (pro téma i Mix, s vybranými kategoriemi). Bleskovka: 60 sekund, co nejvíc správných odpovědí, vždy 4 možnosti bez nápověd, chyba ubere 3 sekundy, čas stojí při načítání otázky. Přežití: tři životy, prvních 5 otázek ze známých položek, pak přibývají méně známé (od 25. otázky celá sada), bez nápověd. Rekord se pamatuje pro každé téma, Mix i celkově (jen v zařízení, `mudrlant.modes`); XP 3 za správnou odpověď (Bleskovka) či 4 za přežitou otázku, nejvýš 150 XP denně v každém režimu, +20 XP za překonaný rekord jednou denně. Chyby jdou do Mých chyb a procvičování; do dnešních otázek, výzev, statistik tréninku ani počítadel odznaků se režimy nepočítají (`modes.js`, obrazovky v `app.js`).
- **Zvuky a vibrace** – krátké tóny syntetizované přes Web Audio (správně, špatně, tikání posledních 5 s Bleskovky, nová úroveň a titul, odznak, nový rekord) a vibrace při chybě a rekordu; AudioContext vzniká až po klepnutí hráče. Obojí jde vypnout v Nastavení → Hra (`sound.js`, `mudrlant.sound`).
- **Učení** – bez bodů a systematicky: v každém tématu jsou celé kategorie a **okruhy** (Česko, Přemyslovci, Angličtí panovníci, Šelmy, Naše příroda, Vyhynulé druhy, Halogeny, Vitamíny, Základní jednotky SI…). Okruh jde procházet popořadě jako atlas, nebo procvičovat jen jeho otázky; postup se ukládá. K tomu **Moje chyby** – co hráč neuhodl, jde si prohlédnout a procvičit znovu.

Při prvním spuštění si hráč zvolí variantu hry – výběr ze čtyř možností, nebo psaní odpovědi za dvojnásobek bodů.

## Otázky a nápovědy

Základní otázka je „Co je to?“ podle kategorie (Který prvek to je?, Kdo to je?, Co je to za zvíře?). Témata mají i vlastní druhy otázek, kde je název vidět a hádá se něco jiného:

| Téma | Další otázky |
| --- | --- |
| Zeměpis | Ve kterém státě to je? |
| Historie | Ve kterém století začal vládnout? (narodila se, nastoupil do úřadu, odehrálo se, vznikl) – vždy jeden okamžik, ať na přelomu století nejsou správně dvě odpovědi. U událostí (smlouvy, kongresy, koncily, katastrofy, výpravy, atentáty) i Ve kterém dnešním státě se to stalo (byla podepsána)? |
| Biologie | Do kterého řádu (u rostlin a hub čeledi) patří? U plemen psů a koček Ze které země plemeno pochází? Lidské tělo (kosti, svaly, orgány, žlázy) podle kresby, soustavy a latinského názvu |
| Chemie | Jakou značku má tento prvek? Jaký vzorec má tato látka? |
| Fyzika | Jaká je jednotka SI této veličiny? Jakou značku má tato jednotka? Co měří tato jednotka? Který zákon, jev či částice to je? Co je to za těleso, sondu nebo přístroj? (veličiny, jednotky, zákony a jevy, částice, vesmír, mise, fyzici a astronomové) |
| Vlajky a znaky | Vlajka či znak jsou vidět hned: Čí je to vlajka? Čí je to znak? (státy, české kraje a města, organizace) |
| Chemie | Jakou značku má tento prvek? Jaký vzorec má tato látka? Jaká reakce, pojem či metoda to je? (prvky, látky, reakce a procesy, pojmy a metody, chemici) |
| Fyzika | Jaká je jednotka SI této veličiny? Jakou značku má tato jednotka? Co měří tato jednotka? U vynálezů Kdo to vynalezl? a Ve kterém století (od roku 1900 desetiletí) to bylo vynalezeno? |
| Vlajky a znaky | Vlajka či znak jsou vidět hned: Čí je to vlajka? Čí je to znak? (státy, české kraje, města a obce, regiony států, velká města světa, zaniklé státy, území a organizace) |
| Mytologie | Jak se jmenuje v římské/řecké mytologii? Ze které mytologie je? |
| Geologie | Nerost či hornina jsou vidět hned: Jakou má tvrdost podle Mohse? Jaký má vzorec? Do které skupiny hornin patří? Které je to období? |
| Výtvarné umění | Obraz či socha jsou vidět hned: Co je to za obraz? Kdo to namaloval? Ke kterému směru patří? Dále umělci, fotografové, ilustrátoři a umělecké směry |
| Architektura | Stavba je vidět hned: Jaký je to sloh? Kdo ji navrhl? |
| Výtvarné umění | Obraz či socha jsou vidět hned: Co je to za obraz? Kdo to namaloval? Ke kterému směru patří? |
| Architektura | Stavba je vidět hned: Jaký je to sloh? Kdo ji navrhl? (u mostů, věží, muzeí a dalších staveb bez jasného slohu název; k tomu architektonické prvky a architekti) |
| Hudba | Kdo to složil? Do kterého hudebního období patří? U oper a muzikálů i Ve kterém století měla premiéru? |
| Literatura | Kdo to napsal? Kdo tuto postavu vymyslel? Ve kterém století žil či dílo vzniklo? |
| Film | Kdo film režíroval? Ve kterém desetiletí měl premiéru? U animovaných filmů Které studio film natočilo?, u seriálů Kdo seriál vytvořil (napsal scénář)? a Ve kterém desetiletí se začal vysílat? |
| Sport | Ve kterém sportu se proslavil(a)? Kde se konaly olympijské hry? Které hry to jsou? Co je to za sport (podle fotky)? Který klub, stadion, okruh nebo soutěž to je (podle země, mapy, kapacity a fotky)? |

**Ukaž na mapě** (`question-map.js`): „Kde leží Kilimandžáro?“, „Kde stojí Karlštejn?“ – hráč klepne na slepou mapu (obrysy bez popisků),
tip může klepnutím přesunout, mapu přiblížit tlačítky +/−, kolečkem nebo dvěma prsty a posunout tažením, pak **Potvrdit**.
Ptá se jen na místa, která jsou na mapě bod: ze zeměpisu města, vrcholy a sopky, jezera a nádrže, ostrovy, stavby, vodopády,
jeskyně, skály a národní parky (ne řeky, pohoří, souostroví ani moře), ze sportu stadiony, haly a okruhy. Výřez je pevný pro celou
oblast, ať nic neprozradí: kontinent (Evropa od Islandu po Ural, Afrika, Asie, Severní Amerika bez Havaje, Jižní Amerika, Austrálie
a Oceánie), u míst v Česku celé Česko s kraji a hlavními řekami. Místo mimo výřez, ostrov, který na mapě není, stejné jméno
na dvou místech a stavba ve velkém českém městě („kde je Praha“) se nekladou. **Body** podle vzdálenosti po zemském povrchu:
plný počet (4, při psaní 8) do 3 % úhlopříčky výřezu (Česko asi 18 km, Evropa asi 210 km; u ostrovů, jezer a parků navíc
poloměr podle rozlohy), pak ubývají až k nule na 20 % úhlopříčky; správně = aspoň bod. Výsledek ukáže tip, správné místo, čáru
mezi nimi, kruh plných bodů a „Vedle o 37 km“. Otázka přijde v tréninku asi u každé osmé vhodné otázky (po 6 až 10 vhodných
otázkách, počítadlo `mudrlant.mapGap` v zařízení) a nemá nápovědy. Dnešní otázky, výzvy a turnaje ji zatím nemají (stejné otázky
pro všechny hráče i starší verze aplikace), chyby a opakování karet také ne.

**Číselné otázky** (`numeric-questions.js`) se v hraní tématu, v Mixu, ve výzvách a v turnajích přimíchají asi do každé osmé otázky, jen kde téma
má spolehlivá čísla z dat (biologie a mytologie je nemají; dnešní otázky a učení nikdy). Bez nápověd, body za přesnost (ve variantě psaní dvojnásobek):

- **Seřaď** – čtyři položky ze stejné kategorie (výška hor, délka řek, rozloha a obyvatelé států, česká města, stavby, roky bitev, filmů, děl a založení
  klubů, rok narození osobností, protonové číslo, tvrdost podle Mohse, stáří geologických období, průměr a oběh planet…), hodnoty vždy dost daleko od sebe.
  Klepnutí dává pořadí 1–4, další klepnutí ho zruší. Celé pořadí 4 body, jedna prohozená sousední dvojice 2 body.
- **Odhadni číslo** – jen známé položky (Kolik metrů měří tato hora? V jakém roce proběhla tato bitva?). Velikosti podle poměru (do 5 % 4 body, do 10 % 3,
  do 25 % 2, do 50 % 1), letopočty podle rozdílu let (u 20. století rok, u starších dob víc), protonové číslo podle rozdílu. Výsledek ukáže odhad na stupnici.

Do chyb, opakování ani poznaných položek se nepočítají, v režimech Bleskovka a Přežití nejsou. Ve výzvě plán otázky určuje semínko výzvy (vlastní řada čísel),
takže všichni dostanou stejnou. Otázka je vždy jen jednoho druhu: Ukaž na mapě, číselná, nebo obyčejná.

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
| `visuals.js` | Vykreslení obrazových nápověd (mapa, časová osa, obrázek, periodická tabulka) |
| `modes.js` | Bleskovka a Přežití bez DOM: pravidla, hodiny s trestem, obtížnost Přežití, rekordy a XP s denním stropem – testovaná |
| `sound.js` | Zvuky (Web Audio, bez zvukových souborů) a vibrace, přepínače v Nastavení – testovaná |
| `question-map.js` | Otázka „Ukaž na mapě“: výběr míst a výřezu, zobrazení, body podle vzdálenosti (testované), vykreslení a ovládání mapy |
| `daily-quiz.js` | Kvíz dne: výběr otázek ze semínka dne, součty, série, XP, uložený stav a obrazovky (karta, úvod, výsledek s pořadím) |
| `share-card.js` | Sdílení textu (systémové, jinak schránka) a obrázku výsledku (PNG z plátna se sovou v barvě obleku) |
| `topics/<téma>.js` | Jedno téma: kategorie, otázky, fakta, nápovědy a zakrývání (viz níže) |
| `data/<téma>.json` | Položky a okruhy tématu (generované z Wikidat) |
| `data/countries.json`, `data/world.json` | Státy a jejich obrysy pro slepou mapu (generované) |
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
- **Audit otázek:** `npm run audit:questions` (volitelně `-- --sample=300`, `--topic=historie,hudba`, `--all`) projde témata a sestaví otázky jako hra
  (`scripts/lib/audit.mjs`). Hlásí odpověď prozrazenou v popisu či nápovědách, nápovědy opakující popis, dvě správné či příliš podobné možnosti,
  nesprávné možnosti jiné země/doby, chudé popisy, rozbité odkazy na obrázky (hash souboru na Commons) a nejednoznačné psané odpovědi (aliasy).
  Zapíše `reports/audit-otazek.md` (souhrn) a `reports/audit-otazek.json` (vše); exit kód je nenulový jen u jistých chyb, které nejsou
  v `scripts/audit-allowlist.json`.

## Účty a hra více hráčů

Hotovo: přihlášení účtem Google přes Supabase, profil hráče (jméno, emoji a barva) a **výzvy** (stejné otázky pro víc
hráčů: kód nebo odkaz `?vyzva=KÓD`, žebříček výzvy; `social.js`, tabulky `challenges` a `challenge_results`). Výzvu lze
poslat komukoli s kódem, konkrétnímu hráči podle jedinečné přezdívky, nebo náhodnému hráči (`random_opponent()`);
vyzvaný ji uvidí na úvodní stránce. Výzvu lze nastavit: téma nebo mix, okruh tématu (třeba jen vlajky států), obtížnost
(známé / i těžší), pevný způsob odpovídání (možnosti / psaní) a počet otázek. Schéma databáze je napsané tak, aby šlo pouštět opakovaně; po jeho změně ho
v Supabase spusť znovu celé.
**Týdenní turnaje** (vyřazovací pavouk v Mixu, kolo = jeden den): klient je v `tournament.js` (čistá logika: názvy kol, dny, stav karty, texty zpráv),
volání databáze v `social.js` a okno turnaje, hra zápasu a karta na záložce Více hráčů v `app.js`; pravidla a posun kol dělá databáze
(`tournament_tick()` a další funkce v `supabase/schema.sql`). Starší databáze bez turnajů kartu prostě neukáže.
Okno turnaje má pohled **Pavouk** (sloupce kol zleva doprava jako v NHL playoff, od osmifinále, „Celý pavouk“ ukáže všechna kola; klepnutí na hráče zvýrazní jeho cestu)
a rozbalovací **Celé pořadí** všech hráčů (místa 1.–4., pak skupiny podle kola vyřazení); jejich logika (`bracketColumns`, `standings`, `placeRange`) je čistě v `tournament.js`.
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
npm run build:mapa       # data/mapa.json (Natural Earth 1:50m, Česko 1:10m s kraji a řekami)
npm run build:regiony    # data/regiony.json (Natural Earth 1:10m: regiony států z okruhu Regiony států a české kraje; po build:vlajky)
npm run build:zemepis    # data/zemepis.json
npm run build:historie   # data/historie.json
npm run build:biologie   # data/biologie.json
npm run build:chemie     # data/chemie.json
npm run build:fyzika     # data/fyzika.json
```

Logo je sova v talároku (`branding/sova-original.jpg`). Z tmavého pozadí ji vyřízne `python3 scripts/logo-cutout.py branding/sova-original.jpg branding/sova.png` (Pillow, numpy) a ikony aplikace, favicon i průhledné logo `icons/logo.webp` z ní vykreslí `node scripts/render-app-icons.js` (Playwright). Barvy aplikace podle loga (vínová `brand`, zlatá `gold`, grafitová šedá místo `slate`) jsou v `tailwind.config.js`.

Service worker (`sw.js`) načítá soubory aplikace přednostně ze sítě, takže se nová verze projeví hned po nasazení; uložené kopie (včetně dat všech témat) slouží bez internetu – hrát jde i offline, jen s krátkým popisem z Wikidat místo úvodu z Wikipedie.

## Testy

```sh
npm test
```

Spustí testy logiky (`tests/quiz-core.test.js`), kontrolu témat a jejich dat (`tests/topics.test.js`, stačí Node 20+) a test celé aplikace v prohlížeči (`tests/e2e.test.js`). Ten potřebuje Playwright (`npm i -D playwright && npx playwright install chromium`), jinak se přeskočí. Používá malá testovací data (`tests/fixtures.js`) a podvrženou Wikipedii, takže nezávisí na síti, a stránku servíruje s CSP z `_headers`.

## Zdroje dat

Položky, fakta a fotky z [Wikidat](https://www.wikidata.org) a [Wikimedia Commons](https://commons.wikimedia.org), popisy z [české Wikipedie](https://cs.wikipedia.org), obrysy států, kraje a řeky [Natural Earth](https://www.naturalearthdata.com) (volné dílo), satelitní snímky NASA Blue Marble přes [GIBS](https://earthdata.nasa.gov/gibs), mapa © přispěvatelé [OpenStreetMap](https://www.openstreetmap.org/copyright), ikony [Lucide](https://lucide.dev) (ISC).
