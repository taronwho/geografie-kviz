# Nové módy: Zlatá otázka, Řetězovka, Boss týdne, Dobývání Evropy, Kamarádské sázky

Zadání pro pět nových částí hry. Cíl: každá je vidět na místě, kam patří, ale úvod se nepřeplní a vejde se bez posouvání
(360×640 i 360×800 s aplikací až k okrajům).

## Kde se co zobrazí

| Místo | Co tam je |
|---|---|
| Úvod, záložka **Jeden hráč** | Řada **Výzvy** (`#home-specials`, tři stejné dlaždice): **Kvíz dne · Řetězovka dne · Boss týdne**. Pod ní beze změny pruh Tajemná otázka dne, Dnešní otázky, Cíle týdne a dlaždice témat. |
| Kdekoli v běžné hře | **Zlatá otázka**: objeví se sama, zhruba jednou za 50 otázek. Nemá žádné tlačítko. |
| Úvod, záložka **Více hráčů** | Nahoře karta **Dobývání Evropy** s malou mapou (moje území, útoky na dnešek). Bez skupiny je tam pozvánka „Založ skupinu a dobývejte Evropu“. |
| Okno **Vyzvat** a seznam výzev | **Kamarádské sázky**: volba vkladu při zakládání výzvy, mince u výzvy v seznamu a výsledek sázky po zápase. |
| **Můj postup** | Zlaté střípky a Zlatá truhla, emblémy poražených bossů (také v Albu a ve Vitríně), odznaky Zlatokop, Dobyvatel, Sázkař a Neomylný. |
| **Profil** hráče | Sázková bilance, vystavené emblémy bossů ve vitríně. |

Řada Výzvy je hotová v `app.js` (`specialTile`, `specialsRow`). Kvíz dne je první dlaždice. Řetězovka vrací svou dlaždici z `chainHomeTile()`
a Boss z `bossHomeTile()`; prázdný řetězec znamená, že se dlaždice nevykreslí. Dlaždice se staví jen přes `specialTile({...})`:
- `art`: obrázek z `icons/topics/<art>.webp`;
- `title`: nejvýš asi 10 znaků;
- `text`: krátký stav, nejvýš asi 14 znaků;
- `label`: celý stav pro čtečku;
- `ring` a `tone`: barvy;
- `dot`: zlatá tečka „dnes ještě nehráno“;
- `extra`: absolutně umístěný doplněk, třeba tenká lišta životů bosse (`absolute inset-x-2 bottom-0.5 h-1`), který nemění výšku.

Na nízkém displeji je dlaždice vodorovná: obrázek je vedle textu.

Pravidla pro všechno nové (platí v celé hře):
- **Přísná CSP**: žádné inline styly ani skripty. Animace dělej třídami v `src/input.css` (`@keyframes`), nebo přes Web Animations API (`element.animate`); `element.style.x = …` z JS je povolené. Po změně tříd spusť `npm run build:css`.
- **Telefon na prvním místě**: okna se vejdou bez posouvání na 360×640 a 390×780 (testy `tests/e2e-dialogs-fit.test.js` a `tests/e2e-ui-audit.test.js`). Dotykové plochy aspoň 40 px a kontrast v obou režimech.
- **`prefers-reduced-motion`**: všechny pohyby mají klidnou variantu, tedy jen prolnutí, nebo nic.
- **Texty**:
  - česky a genderově neutrálně (ne „získal jsi“, ale „získáváš“ nebo „máš“);
  - jednoznačně: přesné názvy tlačítek a záložek, jak jsou v aplikaci;
  - každý nový text zpětně zkontroluj (pravopis, interpunkce, srozumitelnost).
- **Ke každé nové funkci nebo oknu** patří tip v `tips.js` (akce, `touchTip`, `used`) a zvážení kroku v tutoriálu (`tutorial.js`).
- **Obrázky**:
  - nové obrázky jsou v `docs/OBRAZKY.md` od č. 206 a uživatel je teprve vygeneruje;
  - do té doby použij existující obrázek (např. `sova-tip`, `truhla`, `stopky`, `serie`) přes jednu konstantu `ART` na začátku modulu, s komentářem `// č. NNN`, aby šel obrázek později vyměnit na jednom místě;
  - textury do dodání nahraď CSS přechody.
- **Server**:
  - nové tabulky a funkce připiš na konec `supabase/schema.sql` jako blok `-- 21: <název části>`;
  - `schema_version()` ani `REQUIRED_SCHEMA` neměň, verzi 21 nastaví slučování;
  - RLS musí odpovídat ostatním tabulkám a funkce mají `security definer` s kontrolou `auth.uid()`;
  - testy proti PostgreSQL běží na clusteru `/tmp:5439` (viz `tests/sql-*.test.js`).
- **Hra bez přihlášení**: co nepotřebuje server, funguje i pro hosta (místně). Co server potřebuje, nabídne přihlášení.

## 12. Zlatá otázka

- **Kdy padne**:
  - v běžné hře: témata, Mix, dnešní otázky, Bleskovka, Přežití, procvičování;
  - nepadá v Kvízu dne, Tajemné otázce, Řetězovce, Bossovi ani v Dobývání (tam jsou otázky pevně dané nebo mají vlastní pravidla).
- **Pravděpodobnost**: 1/50 na otázku. Pojistka: nejpozději 80. otázka od poslední zlaté je zlatá. Počítadlo je místní (`mudrlant.gold`: `since`, `total`, `correct`, `shards`, `chests`).
- **Výzvy a turnaj**: zlatá otázka je dána semínkem výzvy, takže ji oba hráči mají na stejném místě. Asi v každé 5. výzvě je jedna. Body výzvy se nemění (férovost), zlatá dává jen XP a střípek.
- **Vzhled**:
  - zlatý rámeček karty otázky s jemnou texturou zlaté fólie;
  - pomalý třpyt, který kartu jednou za pár sekund přejede;
  - štítek „Zlatá otázka · 3× XP“;
  - krátký zvuk (`sound.js`);
  - po správné odpovědi déšť zlatých jiskřiček a střípek, který přiletí do počítadla.
- **Odměna**:
  - trojnásobek XP za tuto otázku;
  - správně bez nápověd: 1 zlatý střípek;
  - 5 střípků otevře **Zlatou truhlu**. Otevírá se stejně jako Truhla Mudrlanta, ale vždy obsahuje vzácnou věc, kterou hráč ještě nemá: doplněk jen z truhly (`chest`) nebo vzácný obrázkový rámeček (`rare`). Když má hráč všechno, dostane XP navíc.
- **Odznaky**: Zlatokop I, II a III za 10, 50 a 100 správně zodpovězených zlatých otázek.
- **Kde je vidět**:
  - střípky a truhla v Mém postupu;
  - počet zlatých otázek ve statistikách;
  - první zlatá otázka v životě vysvětlí pravidla v malé bublině.

## 6. Řetězovka

- **Princip**: odpověď na jednu otázku je začátkem další. Například:
  1. „Ve kterém městě stojí Eiffelova věž?“ → **Paříž**
  2. „Paříž je hlavním městem…“ → **Francie**
  3. „Který skladatel pochází z Francie?“ → **Claude Debussy**
  4. …
- **Odkud se berou vazby**: z dat témat (stát, hlavní město, místa, stavby, osobnosti podle země, vlajky…). Modul `chain.js` z nich postaví graf a z něj článek po článku řetěz.
- **Otázky**: každá má 4 možnosti. Špatné možnosti jsou stejného druhu (jiné státy, jiná města) a nesmějí být ve vztahu správné, například skladatel, který je také z Francie.
- **Řetězovka dne**:
  - 7 článků, stejných pro všechny (semínko = pražský den);
  - jeden pokus za den, čas se nepočítá;
  - článek k dává k bodů, celý řetěz tedy 28 bodů;
  - špatná odpověď řetěz přetrhne a hra končí;
  - jednou za hru můžeš použít **Záchranu**: místo špatné odpovědi dostaneš jinou otázku na stejný článek, za 0 bodů.
- **Vzhled**:
  - řetěz se skládá článek po článku, nový článek „zacvakne“;
  - nad otázkou je cesta „Eiffelova věž → Paříž → …“;
  - přetržení řetězu se rozlomí s krátkým zatřesením.
- **Výsledek**:
  - celý řetěz i s odpověďmi a body;
  - sdílení textem a obrázkem, např. „Řetězovka 12. 11. 🔗🔗🔗🔗💥 · 10 bodů“;
  - u přihlášených pořadí dne a kolik procent hráčů dalo celý řetěz.
- **Cvičná řetězovka**: po dohrání denní jde hrát náhodný řetěz bez bodů a statistik.
- **Server** (`-- 21: Řetězovka`):
  - tabulka `chain_results (day, user_id, links, score, rescued, created_at)`, jeden řádek na hráče a den;
  - `chain_submit(day, links, score, rescued)` s kontrolou rozsahů;
  - `chain_day_stats(day)` vrací počet hráčů, podíl celých řetězů, moje pořadí a nejlepší.
- **Dlaždice**: `retezovka`, „Řetězovka“, stav „7 článků“, „Článek 4/7“ nebo „18 bodů · 3.“.

## 10. Boss týdne (Výzva od Mudrlanta)

- **Bossové**: každý týden (ISO týden, pražský čas) je jiný boss, Mudrlant v převleku s vlastní povahou. Rotuje osm bossů a seznam půjde rozšířit na všech 14 témat:

| id | Jméno | Téma | Povaha |
|---|---|---|---|
| `kapitan` | Kapitán Mudrlant | Zeměpis | Mořský vlk, chlubí se, kde všude byl |
| `rytir` | Rytíř Mudrlant | Historie | Vznešený a trochu nafoukaný, mluví starobyle |
| `alchymista` | Alchymista | Chemie | Šílený vědec, všechno mu bublá a bouchá |
| `amper` | Profesor Ampér | Fyzika | Nabitý energií, srší blesky a vtipy o proudu |
| `maestro` | Maestro | Hudba | Umělec s noblesou, diriguje i otázky |
| `druid` | Druid | Biologie | Klidný mudrc lesa, vtipkuje o houbách |
| `olympan` | Olympan | Mytologie | Hromovládce, hřmí a vyhrožuje bleskem |
| `reziser` | Režisér | Film | Dramatik, každou otázku „natáčí“ znovu |

- **Úvod souboje**:
  - aréna na pozadí;
  - boss přijde s animací a pronese úvodní řeč, pro každého bosse 3 varianty;
  - pak tlačítko „Do souboje“.
- **Souboj**:
  - 10 těžkých otázek z tématu bosse, stejných pro všechny (semínko = týden a číslo pokusu);
  - boss má 700 životů;
  - správná odpověď mu ubere 50 + bonus za rychlost (až 30, plný bonus do 6 s, do 20 s klesá k nule);
  - hráč má 3 srdce a každá chyba jedno ubere;
  - **Bossovy schválnosti**: u 4. a 8. otázky schová možnosti a odpověď se píše; poslední 3 otázky mají poloviční čas.
- **Konec souboje**:
  - životy bosse klesnou na 0 = výhra;
  - dojdou srdce nebo otázky = prohra (počítá se uštědřené poškození).
- **Pokusy**: 3 za týden, počítá se nejlepší.
- **Boss se mění, jak mu ubývají životy**:
  - 1. Plná síla (100–67 %): sebevědomý portrét;
  - 2. Zraněný (66–34 %): odřený, natržený kostým, pot, pořád bojuje;
  - 3. V koncích (33–1 %): kostým v cárech, rozbitá rekvizita, zoufalý vztek;
  - 4. Poražený (0).
  - Při změně fáze: velký záblesk, otřes, prolnutí obrázku a hláška fáze.
  - Posměšky po chybách hráče se mění podle fáze: nafoukaně → nervózně → zoufale.
  - Efekty navíc: pot a prasklina (fáze 2), rudá pulzující viněta, obláček kouře a třes (fáze 3).
  - Dlaždice na úvodu ukazuje fázi nejlepšího pokusu týdne.
- **Animace**:
  - zásah: boss se zatřese, problikne a vyletí číslo poškození;
  - lišta životů ubývá plynule;
  - chyba: boss se posměje (krátká hláška) a srdce praskne;
  - výhra: boss padne (obrázek poraženého bosse) a přijde oslava.
- **Odměna za výhru**:
  - emblém bosse (portrét v kulatém rámu) do Alba a Vitríny;
  - titul „Přemožitel …“;
  - 150 XP za první výhru v týdnu.
- **Společná lišta** v okně bosse: „Bosse tento týden porazilo 37 % hráčů“. Když ho do neděle porazí aspoň polovina hráčů, kteří to zkusili, dostane každý z nich 50 XP navíc (vyzvedne si je příští týden při otevření).
- **Server** (`-- 21: Boss týdne`):
  - tabulka `boss_results (week, user_id, best_damage, defeated, attempts, updated_at)`;
  - `boss_submit(week, damage, defeated)` s kontrolou rozsahu a nejvýš 3 pokusy;
  - `boss_week_stats(week)` vrací počet hráčů, kolik bosse porazilo a moje nejlepší poškození.
  - Host hraje místně, bez společné lišty.
- **Dlaždice**: portrét bosse, „Boss týdne“, stav „3 pokusy“, „Poraženo!“ nebo „❤ 62 %“, a tenká lišta životů přes `extra`.

## 2. Dobývání Evropy (Souboj o mapu)

- **Kde**: ve Skupinách. Každá skupina má svou týdenní mapu: od pondělí 00:00 do neděle 20:00 pražského času.
- **Mapa**:
  - asi 40 evropských států bez trpasličích (Vatikán, San Marino, Monako, Lichtenštejnsko, Andorra a Malta jdou k sousedům, nebo se vynechají);
  - Rusko jen evropská část, Turecko celé;
  - tvary ze stávajících dat mapy (`data/world.json`, viz `question-map.js`), oříznutí zhruba na délku −25° až 45° a šířku 34° až 72°;
  - sousedství podle společné hranice a navíc námořní spoje (Velká Británie–Francie, Irsko–Velká Británie, Island–Norsko a Velká Británie, Dánsko–Švédsko a Norsko, Kypr–Řecko a Turecko, Estonsko–Finsko, Itálie–Albánie, Sardinie a Korsika podle států);
  - sousedství se předpočítá a uloží do `data/dobyvani.json`, aby server i klient měli stejný graf.
- **Start**: kdo v týdnu poprvé otevře mapu, dostane náhodné volné domovské území, co nejdál od ostatních.
- **Tahy**: 5 denně (obnova o půlnoci, nevyužité propadají) a bonusy: +1 za každý celý region, +1 jednorázově za dobytý
  poklad, +1 další den za dobyté hlavní město soupeře (kořist).
- **Opevnění** (úroveň 0–3): 1 Palisáda, 2 Hradba, 3 Pevnost. Běžné území nejvýš 2, domovské území (hlavní město
  s hradem) nejvýš 3. „Opevnit“ = 1 tah, otázka na vlastním území, správně +1 úroveň.
- **Útok** („Zaútočit“, 1 tah, jedna otázka): na území sousedící s některým tvým; hráč vybere, odkud útočí (výchozí
  nejbližší vlastní území), šipka vede odtud. Správně na opevněné území = opevnění o úroveň klesne (praskne a spadne);
  správně na území s úrovní 0 (neutrální nebo soupeře) = území je tvoje. Špatně = útok propadne. Čím vyšší opevnění,
  tím těžší otázka. Otázky o státu: hlavní město, vlajka, najdi na mapě, stavba nebo místo v tom státě, osobnost z něj…
  (generátory otázek témat s filtrem na stát).
- **Regiony** (jako kontinenty v Risku): asi 8–9 skupin (Britské ostrovy, Skandinávie, Pobaltí, Pyrenejský poloostrov,
  Západní Evropa, Střední Evropa, Itálie a Středomoří, Balkán, Východní Evropa). Celý region = zlatě zářící obrys
  s fanfárou, +1 tah denně a +2 body na konci.
- **Poklady**: 5 náhodných neutrálních území na mapě má truhličku; dobytí = +1 tah hned.
- **Domovské území**: každý začíná jedním (hrad). Kdo přijde o všechna území, dostane další den náhodné neutrální
  („Návrat do hry“) – nikdo nevypadne na zbytek týdne.
- **Konec týdne** (neděle 20:00): body = 1 za území + 2 za celý region, při shodě dřívější dosažení. Závěrečný ceremoniál:
  rychlé přehrání týdne na mapě (dobývání den po dni) a stupně vítězů. 1. místo: odznak Dobyvatel a rámeček
  `ramecek-dobyvatel`, 2. a 3. místo XP. Konečná mapa se uloží do Kroniky.
- **Kronika tažení**: přehled událostí u mapy („Německo dobyto · Eva“, „Hradba ve Francii pobořena · Petr“).
- **Vzhled, aby to bylo opravdu hezké**:
  - SVG mapa na textuře starého pergamenu;
  - moře s texturou starých map a jemnými vlnkami;
  - území v barvě hráče „vpité“ do pergamenu a se vzorem šrafování podle hráče (barva není jediné rozlišení), vlastní území se silnějším inkoustovým obrysem;
  - na území vlaječka s avatarem a ikona opevnění: palisáda, hradba, pevnost, hrad u domovského území, truhlička u pokladu;
  - větrná růžice, kartuše s názvem, mořská příšerka a loď jako ozdoby;
  - **Animace**:
    - útok: mapa ztmavne, z výchozího území se vykreslí obloukovitá čárkovaná šipka a otázka se ukáže ve spodním listu;
    - úspěch: záblesk dopadu, pak buď opevnění praskne a spadne o úroveň, nebo se barva rozlije od místa útoku jako inkoust (maska s rostoucím kruhem) a zapíchne se vlaječka;
    - neúspěch: šipka se zlomí a území se zatřese;
    - opevnění: ikona vyroste ze země s obláčkem prachu;
    - celý region: zlatě zářící obrys, fanfára a stuha s názvem regionu;
    - poklad: truhlička se otevře a zajiskří.
  - Přiblížení mapy prsty a dvojitým klepnutím (malé státy na Balkáně). Klepnutí na území otevře kartu s majitelem, opevněním a tlačítky Zaútočit a Opevnit.
  - Na 360×640 je mapa celá vidět; karta území se zobrazí jako spodní list.
- **Karta ve Více hráčích**: malá mapa skupiny (moje barva), „Tahy 5/5“ a „Hrát“. Při více skupinách je přepínač skupiny.
- **Server** (`-- 21: Dobývání Evropy`):
  - tabulky `conquest_maps (id, group_id, week, created_at)`, `conquest_territories (map_id, territory, owner, level, home, treasure, captured_at)` a `conquest_moves (map_id, user_id, day, territory, kind, success, at)`;
  - funkce:
    - `conquest_open(group_id)`: založí mapu týdne a přidělí domovské území;
    - `conquest_state(map_id)`: území, hráči, regiony a moje zbývající tahy;
    - `conquest_move(map_id, territory, kind, success)`: kontrola členství, sousedství, denního rozpočtu tahů (základ, regiony, poklady, kořist), opevnění, návratu do hry a konce týdne.
  - Správnost odpovědi posílá klient (hrají se kamarádi ve skupině). Sousedství ze stejného `data/dobyvani.json`, vložené do SQL jako tabulka `conquest_links`.
- **Push** (volitelně, pokud zbude čas): „Tvé území napadl …“ přes stávající push mechanismus.

## 5. Kamarádské sázky

- **Kde**: v okně Vyzvat (výzva kamarádovi podle přezdívky nebo kódu, odveta, výzva přítele). Ne u náhodného soupeře ani u skupinové výzvy.
- **Volba sázky**: „Bez sázky · 10 · 25 · 50 XP“. Vsadit jde nejvýš tolik, kolik hráč za posledních 7 dní získal (tabulka `xp_weekly`); úroveň nikdy neklesne.
- **Hláška**: k sázce si hráč může vybrat jednu z 8 přednastavených hlášek (např. „Tohle dám levou zadní“, „Připrav si peněženku“). Soupeř ji uvidí. Žádný volný text.
- **Přijetí**: vyzvaný hráč u výzvy vidí „Sázka 25 XP · Přijmout sázku / Hrát bez sázky“. Bez přijetí se hraje bez sázky.
- **Vyrovnání**:
  - až oba dohrají, vítěz získá vklad a poražený o vklad přijde; remíza = nic;
  - ztráta XP nikdy nesníží úroveň, odečte se jen nad hranicí aktuální úrovně;
  - vyrovnání je idempotentní: každý hráč si svou část připíše nebo odečte jednou (stav na serveru `stake_settled_*`).
- **Animace**: hromádka mincí se ve výsledku přesype k vítězi, mince cinkají (zvuk).
- **Statistiky**:
  - v profilu sázková bilance (+/− XP, výhry a prohry);
  - odznaky Sázkař (5 sázek) a Neomylný (5 vyhraných sázek v řadě).
- **Server** (`-- 21: Kamarádské sázky`):
  - sloupce `challenges.stake int`, `stake_state ('offered'|'accepted'|'declined')`, `taunt smallint`, `stake_settled_creator` a `stake_settled_opponent`;
  - funkce `challenge_offer_stake`, `challenge_answer_stake` a `challenge_settle_stake`;
  - podle toho, jak se dnes ukládá XP (`profiles.xp`, `xp_weekly`), zvol bezpečné místo pro změnu XP.

## Obrázky (docs/OBRAZKY.md od č. 206)

Do dodání hra používá existující obrázky. Po dodání stačí vyměnit konstanty `ART` v modulech.

| Č. | Soubor | Kam |
|---|---|---|
| 206 | `zlata-otazka` | Sova s lupou nad zlatým otazníkem: vysvětlení první zlaté otázky, tip |
| 207 | `zlaty-stripek` | Ikona střípku |
| 208 | `zlata-truhla` | Zlatá truhla, zavřená |
| 209 | `zlata-truhla-otevrena` | Zlatá truhla, otevřená |
| 210 | `textura-zlato` | Bezešvá textura zlaté fólie (karta zlaté otázky) |
| 211 | `zlatokop` | Sova zlatokop (odznaky Zlatokop) |
| 212 | `retezovka` | Sova se zlatým řetězem (dlaždice, úvod Řetězovky, tip) |
| 213 | `clanek` | Zlatý článek řetězu |
| 214 | `clanek-prasknuty` | Prasklý článek |
| 215–222 | `boss-<id>` | Portréty osmi bossů (útočná póza) |
| 223–230 | `boss-<id>-porazeny` | Poražení bossové (hvězdičky kolem hlavy) |
| 231 | `textura-arena` | Pozadí arény (na výšku) |
| 232 | `textura-pergamen` | Bezešvý starý pergamen |
| 233 | `textura-more` | Bezešvé moře starých map |
| 234 | `dobyvani` | Sova dobyvatel s helmou a mapou (karta, tip, odznak) |
| 235 | `vetrna-ruzice` | Větrná růžice |
| 236 | `kartuse` | Prázdná ozdobná kartuše na název |
| 237 | `morska-prisera` | Roztomilá mořská příšerka |
| 238 | `plachetnice` | Plachetnice |
| 239 | `hradba` | Kamenná hradba s věží |
| 240 | `ramecek-dobyvatel` | Obrázkový rámeček vítěze |
| 241 | `mince` | Mince s Mudrlantem |
| 242 | `mince-hromadka` | Hromádka mincí |
| 243 | `sova-sazka` | Sova s měšcem mincí (tip, odznak Sázkař) |
