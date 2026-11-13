# Nové módy: Zlatá otázka, Řetězovka, Boss týdne, Dobývání, Kamarádské sázky

Zadání pro pět nových částí hry. Cíl: každá je vidět na místě, kam patří, ale úvod se nepřeplní a vejde se bez posouvání
(360×640 i 360×800 s aplikací až k okrajům).

## Kde se co zobrazí

| Místo | Co tam je |
|---|---|
| Úvod, záložka **Jeden hráč** | Řada **Výzvy** (`#home-specials`, tři stejné dlaždice): **Kvíz dne · Řetězovka dne · Boss týdne**. Pod ní beze změny pruh Tajemná otázka dne, Dnešní otázky, Cíle týdne a dlaždice témat. |
| Kdekoli v běžné hře | **Zlatá otázka**: objeví se sama, zhruba jednou za 50 otázek. Nemá žádné tlačítko. |
| Úvod, záložka **Více hráčů** | Nahoře karta **Dobývání**: moje rozehrané hry (náhled mapy, zbývající čas, tahy) a cesta do lobby (Moje hry · Lobby · Založit hru). |
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

## 2. Dobývání (souboj o mapu v lobby)

Hra více hráčů o území na mapě. Hráči si hry sami zakládají a přidávají se do nich v lobby. Bez chatu.

**Hra a lobby**
- **Založit hru** (pergamenová karta ve stylu map, vejde se na 360×640): nahoře shrnutí s náhledem mapy („Hra 20 min · 4 kola po 5 min ·
  5 tahů za kolo · až 4 hráčů · kdokoli“), pod ním:
  - mapa: Evropa, Afrika, Asie, Amerika, Česko (14 krajů);
  - tempo (předvolby): **Blesk** (hra 20 min, kola po 5 min, 5 tahů), **Rychlovka** (1 h, kola po 10 min, 5 tahů), **Odpoledne** (6 h,
    kola po hodině, 3 tahy), **Tažení** (3 dny, kola po dni, 5 tahů); nebo **Vlastní**: délka kola 5 min, 10 min, 1 h, 1 den a délka hry
    z nabídky pro to kolo (vždy aspoň 3 kola: 20–60 min, 30–120 min, 6 h–2 dny, 3–7 dní);
  - nejvýš 2–8 hráčů a tahy za kolo (1–10);
  - kdo se přidá: kdokoli z Lobby, nebo jen s kódem; Barva a znak; Pozvat přátele.
- **Lobby**: seznam otevřených veřejných her. U každé je náhled mapy, parametry, hráči s barvami a tlačítko „Přidat se“. Hráč si vybere, kam se přidá, nebo založí vlastní hru a čeká.
- **Start**: hra začne sama, když je plná, nebo když jsou v ní aspoň 2 hráči a všichni zaškrtli „Chci hrát“. Pak ji hrají jen přihlášení hráči.
- **Rychlá hra**: pro 2–3 výchozí nastavení drží server vždy jednu otevřenou hru. Jakmile se spustí, hned se otevře další se stejným nastavením.
- **Pořádek**:
  - z lobby jde před startem odejít;
  - nespuštěná hra po 7 dnech zanikne;
  - jeden hráč může být najednou nejvýš v ~6 hrách a mít nejvýš 2 vlastní otevřené hry.
- **Barva a znak**: při přidání si hráč vybere barvu z velké palety (obsazené barvy ve hře nejdou zvolit) a znak na vlaječky (asi 24 heraldických znaků: lev, orel, sova, drak, koruna, kotva, věž…). Poslední volba se pamatuje.
- **Pozvánky pro přátele** (schéma 24): ve formuláři Založit hru je vedle Barvy a znaku „Pozvat přátele“ (okno se seznamem přátel s obrázky,
  víc jich jde vybrat, „Pozvat (N)“); pozvánky odejdou hned po založení. V lobby hry je „Pozvat přátele“ (jen s volným místem) a pozvaní,
  kteří se ještě nepřidali, jsou zašedlí s „Pozváno“. Čekajících pozvánek je nejvýš tolik, kolik je volných míst; pozvat jde jen přijaté přátele.
  Pozvaný vidí pozvánku na kartě Dobývání („Pozvánka od X“, Přidat se) a nahoře v Mých hrách (Přidat se / Odmítnout), dostane push
  „Dobývání: X tě zve do hry“ (jednou za pozvánku, vypíná ho dlaždice Dobývání) a přidá se i do soukromé hry bez kódu.

**Pravidla na mapě**
- **Kola** (schéma 26 přidalo kola po 5 a 10 minutách): hra je rozdělená na kola (období) podle tempa. U rychlých kol běží pod názvem
  mapy odpočet „Další kolo za 3:12“.
- **Chci další kolo** (schéma 26): když všichni hráči odehrají své tahy, vyskočí okno „Kolo N dohráno“ s obrázky všech hráčů a políčkem
  u každého. Kdo klepne na „Chci další kolo“, má fajfku (jde ji vzít zpět „Ještě ne“, okno jde zavřít a otevřít štítkem „Další kolo?“
  na mapě). Až ji mají všichni, server spustí odpočet 10 s (kruh se každou sekundu vybije, číslo poskočí, poslední tři sekundy tikají)
  a pak začne další kolo („Začalo 2. kolo.“). Jinak kolo začne samo podle času. Konec hry se nemění, rychlejší kola jen přidají kola.
- **Tahy**: počet tahů za kolo (podle nastavení hry). Nevyužité tahy propadají. Bonusy navíc:
  - +1 za každý celý region;
  - +1 jednorázově za dobytý poklad;
  - +1 další období za dobyté hlavní město soupeře (kořist);
  - −1 další období, když soupeř dobude tvůj domovský hrad (schéma 23; v liště hry červené „−1“ s hradem a toast).
- **Upozornění na útok** (schéma 23): na koho soupeř zaútočí (dobytí, pobourání opevnění, odražený útok), dostane push „Dobývání: …“
  s útočníkem a radou (opevni se, nebo vrať úder); za hru jedno souhrnné, nejvýš jednou za 10 minut; v Nastavení dlaždice Dobývání.
- **Opevnění** (úroveň 0–3):
  - 1 Palisáda, 2 Hradba, 3 Pevnost;
  - běžné území nejvýš 2, domovské území (hrad) nejvýš 3;
  - „Opevnit“ = 1 tah, otázka na vlastním území, správně +1 úroveň.
- **Útok** („Zaútočit“, 1 tah, jedna otázka) na území sousedící s některým tvým; šipka vede z vybraného vlastního území.
  - správně na opevněné území = opevnění klesne o úroveň;
  - správně na území s úrovní 0 = území je tvoje;
  - špatně = útok propadne;
  - čím vyšší opevnění, tím těžší otázka.
- **Bitvy o území** (schéma 25, blok 25): útok začne obléhání území (`conquest_siege_begin`) a otázka se ukáže hned s odpočtem 60 s.
  - Obléhání vidí všichni hráči hry skoro hned (puls `conquest_pulse` každé 3 s, v bitvě 1,5 s): rudý obíhající lem území, pečeť se
    zkříženými meči a praporky účastníků, štítek „Bitva o …“ s odpočtem dole na mapě a upozornění.
  - Přidat se (`conquest_siege_join`, 1 tah) může, kdo s územím sousedí a není jeho majitel, nejvýš 60 s od začátku obléhání
    a dokud bitva trvá. Okno bitvy v listu území ukáže účastníky, kolik zbývá, varování „Riskantní…“ a „Přidat se do bitvy“.
  - Všichni dostanou stejnou otázku, každý má 60 s od chvíle, kdy se mu otázka ukázala; správnou odpověď zná jen server.
  - Kdo už bojuje, tomu během otázky vyskočí „Do bitvy vstupuje …!“ (zvuk, vibrace) a praporek přibude mezi účastníky.
  - Vítěz = správná odpověď s nejkratším časem (při shodě kdo se přidal dřív); útok má stejný účinek jako dřív (dobytí, nebo pobourání).
    Kdo odpoví správně, ale pomaleji, nezíská nic a tah ztratí („Prohraná bitva“), stejně jako při špatné odpovědi nebo po čase.
  - Po odpovědi čekání na ostatní (kdo odpověděl, kdo přemýšlí s odpočtem); jde zavřít, výsledek přijde s pulsem. U bitvy více
    hráčů pak list „Výsledek bitvy“ s pořadím a časy. Majitel obléhané území neopevní.
  - Bez bloku 25 v databázi útočí aplikace postaru (okamžitá otázka přes `conquest_move`).
- **Rychlé hry a další kolo** (schéma 26, blok 26; server a `social.js`):
  - kolo (období) i 10 nebo 5 minut (`period` `'min10'`, `'min5'`) a délka hry 20, 30, 45, 60, 90 nebo 120 minut (`duration_minutes`,
    `conquest_create(…, minutes)`); hra musí mít aspoň 3 kola („Hra musí mít aspoň 3 kola. Zvol delší hru, nebo kratší kolo.“);
  - každý souhrn hry má `minutes` (délka v minutách i u her na hodiny a dny), `hours` je u rychlé hry null; Rychlá hra Blesk
    (`blesk-20m`: Evropa, 4 hráči, 20 minut, kolo 5 minut, 5 tahů);
  - kolo je hotové (`round.done`), když nikdo nemá tah (nebo nemá území, nebo nemá co hrát) a neběží žádná bitva; pak každý může
    „Chci další kolo“ (`conquest_round_ready` / `Social.conquestRoundReady`); když chtějí všichni, za 10 s začne další kolo
    (`round.next_at`), další kola jdou od něj po délce období a konec hry se nemění (v posledním kole další kolo chtít nejde);
  - boti se počítají jako hotoví a připravení: své tahy odehrají hned, jakmile lidé dohráli;
  - `conquest_state` a `conquest_pulse` vrací `round` = `{ period, started_at, ends_at, done, ready, next_at, can_ready, last }`;
    konec kola je v `budget.period_ends_at` i `round.ends_at` (po předčasném kole už neplatí začátek hry + N × délka období).
- **Pevnost na domovském hradu**: +1 tah za období (`conquest_budget`: fortress). Domovský hrad se s opevněním mění (č. 275–277)
  a střechy a praporky všech staveb mají barvu majitele (`scripts/building-art.py`).
- **Otázky o území**: záhlaví („Útok na Francii“, „Opevnění Francie“, hvězdy podle opevnění) území prozradí, samotná otázka ho nejmenuje.
  - skupina **Mudrlant** (asi 60 %): otázky jako v hlavní hře o věcech, které k území patří (stavby, osobnosti, díla, místa, události, kluby,
    plemena…): popis z Wikipedie se zakrytým názvem, fakta („1802–1885 · spisovatel · Bídníci“), letopočet („V jakém roce se narodil…?“);
    všechny čtyři možnosti jsou ze stejného území, rodiny i tématu (u osob stejného pohlaví), štítek druhu jen když ho mají všechny,
    takže podle národnosti ani druhu nejde nic vyloučit; položka bez tří takových možností se neptá;
  - **formy** (asi 25 %): obrázek („Co je to za stavbu?“, „Kdo je na obrázku?“, vlajka či znak regionu), bod na mapě, odhad čísla
    (výška hory nebo věže, délka řeky, rozloha ostrova, kapacita stadionu, obyvatelé české obce, obyvatelé a rozloha státu, největší město);
  - **stát** (asi 15 %): vlajka, hlavní město, soused;
  - vztahové otázky („Která z těchto staveb stojí ve Francii?“, přes 40 rodin v šesti oborech) převezmou podíl skupiny Mudrlant, když území
    nemá dost známých položek (nejvýš 25 %), jinak jsou jen zálohou;
  - na úrovni 0–1 jsou odpověď i nesprávné možnosti známé, výš i méně známé, nikdy pro znalce; výš víc popisu a faktů, méně obrázků;
  - položka se ve hře nezopakuje a stejná forma nejde dvakrát po sobě; otázka se chystá už při klepnutí na území (popis a obrázek se
    načítají předem), bez sítě nebo po 4 s přijde místní otázka ze stejného semínka; otázka Mudrlanta je přes celou obrazovku hry;
  - u krajů krajská města, místa, hrady a zámky, bitvy, kapely, kluby a sportoviště v kraji.
- **Regiony** (jako kontinenty v Risku): celý region = zlatý obrys, +1 tah za období a +2 body na konci.
- **Poklady**: 5 neutrálních území s truhličkou; dobytí = +1 tah hned.
- **Domovské území**: každý začíná jedním (hrad). Kdo přijde o všechna území, dostane v dalším období nové neutrální („Návrat do hry“).
- **Konec hry** (po uplynutí délky hry):
  - body = 1 za území a 2 za celý region;
  - přehrání průběhu na mapě a stupně vítězů;
  - 1. místo dostane odznak Dobyvatel a rámeček `ramecek-dobyvatel` (s pravidlem proti zneužití, např. aspoň 3 hráči nebo aspoň 1 den), 2. a 3. místo XP.
- **Kronika tažení**: přehled událostí u mapy, např. „Německo dobyto · Eva“.

**Vzhled**
- Mapa:
  - SVG mapa na starém pergamenu, moře se vzorem starých map;
  - území v barvě hráče „vpité“ do pergamenu, se vzorem šrafování podle hráče; vlastní území se silnějším obrysem;
  - vlaječky se znakem hráče, ikony opevnění (palisáda, hradba, pevnost, hrad, truhlička);
  - větrná růžice, kartuše, mořská příšerka a loď.
- Animace:
  - útok: oblouková šipka, otázka ve spodním listu (otázka Mudrlanta přes celou obrazovku hry na pergamenu);
  - úspěch: prasknutí opevnění, nebo rozlití barvy jako inkoust a zapíchnutí vlaječky;
  - neúspěch: zlomená šipka a otřes;
  - opevnění vyroste s obláčkem prachu;
  - celý region zazáří.
- Ovládání: přiblížení prsty a dvojitým klepnutím. Na 360×640 je celá mapa vidět.

**Kde ve hře**
- Více hráčů má kartu „Dobývání“ s mými rozehranými hrami (náhled, zbývající čas, „Tahy 3/5“, „Hrát“). Bez her je na kartě „Najdi hru, nebo založ vlastní“.
- Karta otevře okno se záložkami Moje hry, Lobby a Založit hru.

**Server** (`-- 21: Dobývání`)
- tabulky:
  - `conquest_games` (parametry, stav lobby/running/finished, začátek a konec);
  - `conquest_players` (barva, znak, připravenost, pořadí);
  - `conquest_territories`, `conquest_moves` a `conquest_links` (sousedství podle mapy);
- funkce pro založení, lobby (s doplněním rychlých her), přidání (i kódem), barvu a znak, připravenost a start, odchod, stav, tah a konec hry;
- pozvánky (`-- 24: Dobývání – pozvánky pro přátele`): tabulka `conquest_invites` (jen přes funkce), `conquest_invite`, `conquest_invites_mine`,
  `conquest_decline_invite`, pozvaní v souhrnu hry (`invited`, jen hráčům) a upozornění druhu `conquest_invite`;
- správnost odpovědi posílá klient.

**Data map**
- `data/dobyvani-<mapa>.json`: území s českými názvy, tvary, sousedství (souše i moře, graf je souvislý) a regiony;
- vyrábí je `scripts/build-dobyvani.js` z `data/world.json`, `data/countries.json` a `data/regiony.json`/`data/mapa.json`.

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
| 231, 268–274 | `arena-<boss>` | Arény bossů (na výšku): Maestro jeviště, Kapitán paluba, Rytíř kolbiště, Alchymista laboratoř, Ampér elektrická laboratoř, Druid kamenný kruh, Olympan chrám na Olympu, Režisér filmový ateliér |
| 232 | `textura-pergamen` | Bezešvý starý pergamen |
| 233 | `textura-more` | Bezešvé moře starých map |
| 234 | `dobyvani` | Sova dobyvatel s helmou a mapou (karta, tip, odznak) |
| 235 | `vetrna-ruzice` | Větrná růžice |
| 236 | `kartuse` | Prázdná ozdobná kartuše na název |
| 237 | `morska-prisera` | Roztomilá mořská příšerka |
| 238 | `plachetnice` | Plachetnice |
| 239 | `hradba` | Kamenná hradba s věží (opevnění 2. stupně) |
| 240 | `ramecek-dobyvatel` | Obrázkový rámeček vítěze |
| 241 | `mince` | Mince s Mudrlantem |
| 242 | `mince-hromadka` | Hromádka mincí |
| 243 | `sova-sazka` | Sova s měšcem mincí (tip, odznak Sázkař) |
| 244–251 | `boss-<id>-zraneny` | Bossové ve 2. fázi Zraněný (66–34 % životů): odřený, natržený kostým, pot, náplast, pořád bojují |
| 252–259 | `boss-<id>-vkoncich` | Bossové ve 3. fázi V koncích (33–1 % životů): kostým v cárech, rozbitá rekvizita, zoufalý vztek |
| 260 | `palisada` | Dřevěná palisáda (opevnění 1. stupně) |
| 261 | `pevnost` | Kamenná pevnost s praporkem (opevnění 3. stupně) |
| 262 | `hrad-domov` | Hrádek na domovském území (hlavní město) |
| 263 | `poklad` | Truhlička přetékající zlatem (poklad na neutrálním území) |
