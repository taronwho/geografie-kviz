# Dobývání – boti pro všechny

Stav: **zapojeno** (schéma 42, `supabase/schema.sql` blok 42; aplikace `conquest.js` BOT_LEVELS, `conquest-ui.js` okno Boti do hry).

Dobývání je jediný mód, kde si běžný hráč (nejen vývojář) přidá do hry boty. Boti mají tři obtížnosti a hrají jako lidé:
tahy si rozloží do kola, chvíli přemýšlí, zakládají bitvy a přidávají se do nich.

## Přidání a odebrání

- Boty přidává jen ten, kdo hru založil, a jen v lobby: ve formuláři **Založit hru** (řádek Boti, přidají se hned po založení)
  nebo v detailu hry (řádek **Přidat bota**). Okno Boti do hry nabízí počet pro každou obtížnost, obtížnosti jde míchat.
- RPC `conquest_add_bots(game, how_many, difficulty)` (`easy` | `medium` | `hard`) a `conquest_remove_bot(game, bot)`;
  jen přihlášení, kontrola zakladatele uvnitř. Rychlé hry (bez zakladatele) boty nemají.
- Boti nejvýš do volných míst a nejvýš `max_players − 1` (aspoň jeden člověk). Nejvýš 30 přidaných botů za hodinu na hráče
  (`conquest_bot_log`). Bot hned chce hrát; plná hra začne sama, jinak jako dosud po „Chci hrát“.
- Kdo z lobby odejde a zůstanou v ní jen boti, hra zmizí.
- Bot je účet `botx-…@bots.invalid` (vývojářští boti dál `bot-…`, ty maže `dev_tournament_clear_bots`). Jméno je z nabídky
  obtížnosti (`conquest_bot_names`, 20 jmen na obtížnost, ve hře se neopakuje); volný účet se stejným jménem se použije znovu.
- Vývojářské nástroje zůstávají (`dev_conquest_add_bots` přidává Mudrlanty, Boti odehrají tahy, Další období).

## Obtížnosti

| | Mudrlátko (`easy`) | Mudrlant (`medium`) | Super Mudrlant (`hard`) |
|---|---|---|---|
| Správná odpověď | 45–55 % | 65–75 % | 85–92 % |
| Útok na opevněné | −8 bodů za úroveň | −8 bodů za úroveň | −5 bodů za úroveň |
| Doba odpovědi v bitvě | 25–50 s | 12–35 s | 6–20 s |
| Než si bitvy všimne | 15–45 s | 8–35 s | 4–20 s |
| Cíl útoku | skoro náhodně | poklad > volné > domov soupeře, opevnění odrazuje | dokončí region, rozbije soupeři celý region, poklady, volná a neopevněná území, domov bez opevnění, slabší soupeř |
| Stavby | jen občas palisáda (8 %) | 20 %, občas věž nebo důl | domov až na Pevnost (+1 tah), věž na území s víc sousedy soupeřů, důl ve vnitrozemí |
| Přidá se k bitvě souseda | 15 % | 30 % | 30 %, víc u regionu, pokladu, neopevněného |
| Brání svou strážní věž | 35 % | 65 % | 95 % |

Úspěšnost je každému botovi pevně daná (hash id) v rozsahu obtížnosti. Otázky skládá aplikace, takže kategorie otázky boty neovlivňuje.

## Jak boti hrají v čase

- **Rozvrh kola** (`conquest_bot_slots`): časy tahů bota v kole z hashe hry, bota a kola (pořád stejné), mezery jako náhodné
  časy, asi třetina tahů hned po předchozím (shluky). První tah po 4 % kola, poslední nejpozději 45 s (kolo 5 minut), 75 s
  (10 minut), 6 minut (hodina) nebo 2,4 h (den) před koncem kola.
- Tah, jehož čas nastal, bot zahraje jako člověk: **útok je obléhání** (bitva otevřená 60 s, sousedé se přidají). Další tah až
  po své odpovědi. Stavba je okamžitá.
- **Odpověď bota má svůj čas**: při začátku nebo přidání se uloží `bot_answer_at` a `bot_correct`; jakmile ten čas nastane, zapíše
  se jako odpověď s tímto časem (`conquest_bot_siege_sync`). O vítězi tedy rozhoduje skutečný čas, ať server běží kdykoli.
- **Reakce na bitvy**: při začátku každé bitvy (člověka i bota) si boti naplánují, jestli se přidají nebo budou bránit
  (`conquest_bot_plans`, nejvýš dva boti na bitvu). Bitva na naplánované přidání počká jako na člověka. Otázku bitvy bota pošle
  první člověk, který se přidá (`needs_question`, `conquest_siege_join` s otázkou); když se nikdo nepřidá, otázka není potřeba.
- **Lidé dohráli kolo**: boti zbytek tahů odehrají hned a okamžitě (bez bitvy, přidat se už nikdo nemůže). Další kolo chtějí,
  až kolo dohrají (`conquest_round_player_done`, `bot_idle` = v kole neměl co hrát).
- **Dohánění**: tah víc než 2 minuty po svém čase (hru nikdo neotevřel a server neběžel) se odehraje okamžitě; nikdy víc, než
  rozvrh do té chvíle dal, a nikdy přes počet tahů kola. Tahy minulých kol propadají jako lidem.
- Pomůcky boti nepoužívají ani nedostávají. Bot bez území nehraje (Ankh vzkříšení nemá).

## Co je pohání (a jak často)

Server sám nic neplánuje, kromě volitelné úlohy pg_cron `upozorneni` (každou minutu `push_kick` → `tournament_tick` →
`conquest_bots_tick`, docs/SUPABASE.md). Boti proto běží „líně“ při každém dotazu na hru:

- `conquest_pulse` (aplikace ho volá každé 1,5–3 s, dokud je hra otevřená): boti nejvýš jednou za 4 s na hru
  (`conquest_games.bot_tick_at`), odpovědi a přidání botů do bitev při každém pulsu (s přesným časem).
- `conquest_state`, `conquest_round_ready`, tahy hráčů a `tournament_tick` (otevření aplikace, pg_cron každou minutu).

Výhody: žádná nová infrastruktura, časy odpovědí jsou přesné. Nevýhody: když hru nikdo neotevře a pg_cron neběží, útoky botů
počkají a pak se doženou okamžitě (bez bitvy); bitvy bota se vyhodnotí, až se na hru někdo podívá. Den má boty i v noci
(rozvrh je rovnoměrný přes celé kolo).

## Odměny a odemčení

- **XP za hru s boty** podle nejsilnějšího bota (`conquest_xp_share`, `xp_share` v souhrnu hry a v `conquest_claim`):
  bez botů 100 %, Super Mudrlant 100 %, nejsilnější Mudrlant 50 %, jen Mudrlátka 20 %. Aplikace ukazuje „XP za hru“
  v Založit hru, v okně Boti, v lobby a ve výsledku hry.
- Do pravidla „aspoň 3 hráči, nebo hra aspoň na den“ pro odměnu (XP, Ankh vzkříšení, 50/50 za výhru) se boti počítají.
- **Odemčení vzhledu** (`conquest_look_stats`: hry, výhry, bitvy, území přes moře, Pevnosti) jen ze her aspoň dvou lidí; do
  „aspoň 3 hráčů“ se tam Mudrlátka nepočítají. Hra jen s boty tak dá XP (zmenšené), ale výplně, znaky a sady hradů ne – ani
  se Super Mudrlanty (XP se škáluje, ale sbírat 100 vyhraných bitev proti botům by šlo i se Super Mudrlantem).

## Konec hry dřív

Jakmile všichni dohrají **poslední kolo** (každý hráč bez tahu, bez území, nebo nemá co hrát; boti, až odehrají svůj rozvrh;
žádná otevřená bitva), hra skončí hned (`conquest_end_early` v `conquest_housekeep` posune `ends_at` na teď) a uzavře se
stejně jako po čase (pořadí, odměny, pomník vítěze, upozornění).

## Obrázky

Robotí postavičky (docs/OBRAZKY.md §37, č. 459–468) zatím nejsou: bot má avatar 🤖 a štítek s ikonou bota v barvě obtížnosti
(zelená Mudrlátko, fialová Mudrlant, vínová Super Mudrlant). Pro zapojení stačí doplnit `conquest.js` `BOT_ART` (obtížnost →
seznam obrázků) a vykreslit je místo ikony v `botBadgeHtml` a v okně Boti.
