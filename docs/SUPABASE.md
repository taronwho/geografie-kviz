# Přihlášení účtem Google (Supabase) – návod od nuly

Stav k 3. 11. 2026. Aplikace je statický web, takže účty zajišťuje služba Supabase (zdarma pro tuto velikost).
Bez nastavení (`config.js` prázdný) se přihlášení v aplikaci vůbec neukáže a hra běží jako host, jako dosud.
Rozhraní Supabase i Googlu se občas mění; kdyby se menu jmenovalo trochu jinak, hledej podobný název.

Potřebuješ: účet na GitHubu (máš) a účet Google (stačí běžný Gmail). Platební kartu **nepotřebuješ**.

## Část 1: Projekt v Supabase

1. Otevři https://supabase.com → **Start your project** → přihlas se přes **Continue with GitHub**.
2. Při prvním přihlášení tě vyzve k vytvoření *organizace*: název třeba `Mudrlant`, typ **Personal**, tarif **Free**.
3. **New project**:
   - *Project name*: `mudrlant`
   - *Database password*: klikni na **Generate a password** (nikam se nezadává, jen si ho ulož, kdyby ses později hodil)
   - *Region*: **Central EU (Frankfurt)**
   - **Create new project**. Vytváření trvá 1–2 minuty.
4. Až projekt naběhne, v adrese prohlížeče uvidíš `supabase.com/dashboard/project/XXXXXXXX`. Ten kód `XXXXXXXX`
   je tvé *project ref* a adresa projektu je `https://XXXXXXXX.supabase.co` (potřebuješ ji dál).

## Část 2: Databáze (profily hráčů)

1. V levém menu **SQL Editor** → **New query**.
2. Otevři v repozitáři soubor `supabase/schema.sql` (na GitHubu: `taronwho/geografie-kviz` → `supabase` → `schema.sql`
   → ikona kopírování), vlož celý obsah do editoru a stiskni **Run**.
3. Dole má být *Success. No rows returned*. Kdyby Supabase zobrazil varování o „destructive operations“, je to v pořádku
   (skript jen odstraňuje a zakládá vlastní pravidla), potvrď **Run this query**.

## Část 3: Google Cloud (klíče pro přihlášení)

1. Otevři https://console.cloud.google.com a přihlas se svým Google účtem. Případné podmínky odsouhlas.
2. Nahoře u názvu projektu klikni na výběr projektu → **New project** → název `Mudrlant` → **Create**. Pak ho nahoře vyber.
3. V horním vyhledávání napiš **Google Auth Platform** a otevři ho. Tlačítko **Get started** a vyplň:
   - *App name*: `Mudrlant`, *User support email*: tvůj e-mail → **Next**
   - *Audience*: **External** → **Next**
   - *Contact information*: tvůj e-mail → **Next**
   - zaškrtni souhlas s podmínkami → **Continue** → **Create**
4. V levém menu **Data Access** (Scopes): ověř, že jsou tam `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   a `openid`. Kdyby `openid` chyběl, přidej ho přes **Add or remove scopes** a ulož. Nic dalšího nepřidávej.
5. **Publish app dávat nemusíš.** U aplikace, která žádá jen e-mail, jméno a `openid`, Google v režimu *Testing*
   nevyžaduje seznam testovacích uživatelů, neukazuje varování a přihlášení nevyprší. (Tlačítko **Publish app** je
   v levém menu pod **Audience**; kdybys někdy přidal další oprávnění, bude ho potřeba.)
6. Teď potřebuješ adresu zpětného volání ze Supabase. Přepni se na záložku Supabase:
   **Authentication** (ikona dvou lidí) → **Sign In / Providers** (v některých verzích jen **Providers**) → **Google**.
   Rozbal ho a zkopíruj **Callback URL (for OAuth)**, vypadá jako `https://XXXXXXXX.supabase.co/auth/v1/callback`.
7. Zpět v Google Auth Platform: **Clients** → **Create client**:
   - *Application type*: **Web application**, *Name*: `Mudrlant web`
   - *Authorized JavaScript origins* → **Add URI**: `https://taronwho.github.io`
   - *Authorized redirect URIs* → **Add URI**: vlož Callback URL ze Supabase z kroku 6
   - **Create**
8. Zobrazí se **Client ID** a **Client secret**. Obojí zkopíruj (secret se ukáže jen teď, jinak ho později založíš znovu).

## Část 4: Zapnutí Google v Supabase

1. Supabase → **Authentication** → **Sign In / Providers** → **Google**.
2. Zapni přepínač **Enable Sign in with Google**, vlož **Client ID** a **Client Secret** z části 3, kroku 8 → **Save**.
3. Hned pod tím nech zapnuté *Allow new users to sign up* (výchozí).
4. **Authentication → URL Configuration**:
   - **Site URL**: `https://taronwho.github.io/geografie-kviz/app/`
   - **Redirect URLs** → **Add URL**: `https://taronwho.github.io/geografie-kviz/app/` a přidej i
     `https://taronwho.github.io/mudrlant/app/` (pro případ přejmenování repozitáře) → **Save**.
   Pokud tato adresa v seznamu není, Supabase po přihlášení vrátí na Site URL a přihlášení „nevyjde“.

## Část 5: Klíče do aplikace

1. Supabase → **Project Settings** (ozubené kolo vlevo dole) → **API Keys**.
2. Potřebuješ dvě veřejné hodnoty:
   - **Project URL** (`https://XXXXXXXX.supabase.co`; najdeš ji i v tlačítku **Connect** nahoře)
   - **Publishable key** (začíná `sb_publishable_`). Starší projekty můžou mít jen klíč **anon** (dlouhý, začíná `eyJ`);
     ten funguje stejně a stačí jeden z nich.
3. Pošli mi obě hodnoty do chatu, vložím je do `config.js` a nahraju. Jsou veřejné, patří do repozitáře a v prohlížeči
   je stejně každý uvidí. Počítač za tebe nic neschová, schovává to Supabase pravidly řádků v databázi.
4. **Nikdy neposílej a nikam nevkládej** klíč **Secret** (`sb_secret_…`) ani **service_role**. Ten obchází veškerou ochranu.

## Část 6: Vyzkoušení

1. Až ti napíšu, že je nahráno (do minuty se v Nastavení dole objeví verze), otevři hru → **Nastavení** → **Účet** →
   **Přihlásit se přes Google**.
2. Vyber svůj Google účet. Při prvním přihlášení Google upozorní, co aplikace uvidí (jméno, e-mail). Potvrď.
3. Vrátíš se do hry a v Nastavení uvidíš své jméno a e-mail. V Supabase v **Authentication → Users** se objeví tvůj
   účet a v **Table Editor → profiles** tvůj profil.

## Když to nejde

| Co se stane | Příčina |
|---|---|
| Google hlásí `redirect_uri_mismatch` | Callback URL v Google klientu (část 3, krok 7) se nerovná té ze Supabase, i lomítko na konci |
| Po přihlášení skončíš na jiné stránce nebo na adrese `localhost` | Adresa hry chybí v **Redirect URLs** (část 4, krok 4) |
| Google hlásí „Access blocked“ nebo „app not verified“ | V **Audience** zkontroluj, že máš typ **External**; případně klikni na **Publish app** |
| V Nastavení není část Účet | `config.js` je prázdný nebo se ještě nenačetla nová verze (Nastavení → Aktualizovat) |
| Přihlášení se vrátí s hlášením o chybě | Zkontroluj Client ID a Secret v Supabase (části 3 a 4) |
| Projekt po týdnu nečinnosti „usnul“ | Bezplatné projekty Supabase se po delší nečinnosti pozastaví; v dashboardu stiskni **Restore project** |

## Aktualizace databáze (profily a výzvy)

Soubor `supabase/schema.sql` se rozšiřuje (obrázky profilů, výzvy, výsledky). **Po každé jeho změně ho spusť znovu celý**
(SQL Editor → New query → vložit → Run); je napsaný tak, aby šel pouštět opakovaně a nic nesmazal.
Bez nejnovější verze přihlášení funguje, ale profil a výzvy hlásí chybu.

Sloupec `profiles.owl` (upravená sova jako obrázek profilu, např. `robe=zelena;head=koruna.modra`) přibyl pozdější verzí
schématu a smí ho měnit jen vlastník řádku. Bez něj aplikace sovu jako profilovku prostě neukládá (zůstane emoji 🦉)
a týdenní žebříček (`weekly_leaderboard`) se po novém spuštění `schema.sql` vrací i se sovou.

Verze po bezpečnostním auditu navíc zužuje oprávnění tabulek (klient smí měnit jen své sloupce), hlídá, že XP jen roste a odznaky
jsou z katalogu, omezuje zakládání výzev (30 za hodinu) a vyzvaný hráč smí hrát jen výzvu určenou jemu. Přibude-li v aplikaci nový
odznak, přidej jeho id i do funkce `badge_catalog()` v `schema.sql` (test `tests/sql-security.test.js` hlídá, že se shodují) a spusť schéma znovu.
Odznaků je přes 270 (skupiny mají 5 až 10 stupňů), proto je limit sloupce `profiles.badges` 500 položek a 12 000 znaků; po aktualizaci aplikace je třeba schéma spustit znovu, jinak by hráč s mnoha odznaky nešel uložit.

## Týdenní turnaje

Turnaje potřebují nejnovější `schema.sql` (tabulky `tournaments`, `tournament_entries`, `tournament_matches`, `tournament_results`, `tournament_notices` a funkce `tournament_*`).
Bez něj se karta turnaje v aplikaci prostě neukáže.

- Každý týden se hraje turnaj v Mixu všech témat od pondělí; přihlášky na další týden jsou otevřené celý týden.
- Hraje nejvyšší mocnina dvou nejdřív přihlášených (nejvýš 128, nejméně 8); přebývající dostanou zprávu, pod 8 přihlášených se turnaj zruší.
- Jedno kolo = jeden den (čas Praha), 10 otázek, v kole stejné pro všechny; vítěz zápasu: víc správných, víc bodů, rychlejší čas (měří server), dřívější přihlášení.
  Kdo kolo neodehraje, prohrává; když neodehraje nikdo, postupuje dřívější přihlášený. Semifinalisté hrají o bronz v den finále.
- Kola posouvá funkce `tournament_tick()`: volá ji aplikace při otevření (nic jiného není potřeba). Pokud chceš, aby se kola posouvala o půlnoci i bez návštěvníků,
  zapni v Supabase rozšíření **pg_cron** (Database → Extensions) a spusť jednou v SQL Editoru:
  `select cron.schedule('turnaje', '5 22,23 * * *', $$select public.tournament_tick()$$);` (22:05 a 23:05 UTC pokryje půlnoc v Praze v zimě i v létě; funkce je idempotentní).
- **Vývojářské nástroje (boti):** pro zkoušení turnaje bez 32 lidí. V Nastavení v režimu vývojáře (`?vyvojar` v adrese) je oddíl „Turnaj (boti)“:
  **+31 botů** (do otevřeného turnaje), **Spustit hned** (turnaj začne dnes a boti odehrají 1. kolo), **Další kolo** (boti odehrají kolo, den kola uplyne, vznikne další), **Smazat odehraný turnaj** (smaže běžící i skončené turnaje a hned znovu otevře přihlášky na příští pondělí) a **Smazat boty**
  (smaže i turnaje, ve kterých boti hráli). Boti hrají na střední úrovni (úspěšnost 45–80 %). Databáze tyto funkce pustí jen účtu zapsanému v `dev_admins`; zapiš se jednou v SQL Editoru
  (přezdívku nahraď svou): `insert into public.dev_admins (user_id) select id from public.profiles where lower(display_name) = lower('Taron');`
  Boti jsou řádky v `auth.users` s e-mailem `bot-…@bots.invalid`; ostrý provoz s nimi nepočítej a po zkoušce je smaž.
- **Rozehraný zápas turnaje:** každá odpověď se hned uloží na server (`tournament_answer_save`, viz „Průběh výzev a zápasů na serveru“ níž) a zároveň do `localStorage`; po zavření, ztrátě spojení, smazání dat nebo na jiném zařízení nabídne karta turnaje v den kola **Pokračovat** od první otázky, kterou server nemá. Server o začátku zná (`tournament_start_match`) a čas měří od něj, nic se tím nezastavuje; po půlnoci dne kola se zápas nabízet přestane a hráč dostane hlášku, že vypršel. Výsledek zápasu (`tournament_finish_match`) server sečte z uložených odpovědí a bez všech deseti ho nezapíše. Ve starší databázi bez `tournament_answers` jde pokračovat jen na zařízení, kde zápas začal.
- **Chyby z provozu:** `monitor.js` posílá neodchycené chyby (nejvýš 5 za relaci a 20 za den a zařízení) do tabulky `client_errors` (zpráva, zkrácený zásobník, adresa bez parametrů, prohlížeč, verze aplikace; žádné osobní údaje). Zapisovat smí kdokoli s veřejným klíčem, číst jen `dev_admins` (Nastavení → vývojářský režim → Chyby z provozu, `dev_client_errors()`). Server pustí nejvýš 100 řádků za hodinu a 500 za den.
- **Verze schématu:** `schema_version()` na konci `schema.sql` se zvyšuje při každé změně souboru spolu s `REQUIRED_SCHEMA` v `app.js` (hlídá `tests/sql-monitor.test.js`). Je-li databáze novější než aplikace, hráč uvidí „Aktualizuj stránku“; je-li starší (funkce chybí nebo má nižší číslo), uvidí jednou denně „Databáze není aktuální“ a správce v Nastavení návod spustit `schema.sql` znovu.
- **Hlášení chyb v otázkách:** tlačítko „Nahlásit chybu“ (vlajka) v okně otázky a po odpovědi uloží hlášení do tabulky `question_reports` (důvod + volitelný text, nejvýš 20 za 24 hodin na hráče, délky hlídá databáze). Bez připojení se hlášení uloží v zařízení a odešle později; bez účtu hra hráči přátelsky poradí přihlášení. Číst a mazat hlášení smí jen účet v `dev_admins`: v Nastavení v režimu vývojáře (`?vyvojar`) je oddíl „Hlášení otázek“ se seznamem a tlačítkem Vyřízeno. Po aktualizaci spusť znovu celé `supabase/schema.sql` (přibyla tabulka `question_reports`, funkce `is_dev_admin()` a spoušť s denním limitem).
- **Přátelé, reakce, blokování a nahlášení:** tabulky `friendships`, `player_blocks`, `match_reactions`, `player_reports` a funkce `friends_list`, `search_players`, `touch_seen`
  jsou na konci `schema.sql` (spusť soubor znovu celý, je idempotentní). Starší databáze bez nich nic nerozbije, aplikace jen sekce neukáže.
  Žádost o přátelství vidí jen obě strany, přijímá ji oslovený (opačná čekající žádost se přijme sama), limit 200 přátel a 30 žádostí za hodinu. Blokovaný hráč (oběma směry)
  nejde najít, vyzvat ani nevyjde jako náhodný soupeř a přátelství s ním skončí. Reagovat (👍 🔥 😅 🤝) jde jen na zápas, který oba odehráli. Nahlášení (důvod + poznámka do 300 znaků,
  nejvýš 10 za den) čte jen správce: V Nastavení v režimu vývojáře je „Nahlášení hráči“ (jen účet v `dev_admins`) s tlačítkem Vyřešeno.
- Odznaky za turnaje (`turnaj-*`) a za zběhlost v tématech (`zbehly-*`) jsou v `badge_catalog()`; přibude-li další odznak, přidej ho i tam.
- **XP za vyhrané zápasy jednou za účet (schéma 3):** dřív si vyplacené zápasy pamatovalo jen zařízení (`mudrlant.tourXp`), takže nové zařízení nebo smazaná data XP připsaly znovu.
  Teď vyplacení eviduje tabulka `tournament_xp_claims` (zápas, hráč, kolo, čas): `claim_tournament_xp(retry_key)` (security definer, jen pro `auth.uid()`) atomicky zapíše dosud
  nevyplacené výhry volajícího (vítěz = volající, `decided_by <> 'earlier'`, tedy ne postup dřívějšího přihlášeného bez hry) a vrátí jejich `id` a `round`; aplikace připíše XP
  (`winXp(kolo)` z `tournament.js`) jen za vrácené. Dvě souběžná volání téhož hráče jdou po sobě a zápas se vyplatí jen jednou. `retry_key` je náhodný klíč zařízení
  (`mudrlant.tourXpClaim`): když se odpověď serveru ztratí, další volání se stejným klíčem vrátí tytéž zápasy; po připsání XP aplikace klíč smaže. Seznam `mudrlant.tourXp`
  zůstává jen jako záložní ochrana proti dvojímu připsání v jednom zařízení. Hráč vidí jen své řádky, zapisuje jen funkce. Starší databáze bez funkce (404): aplikace vyplácí jako dřív podle zařízení.
  - **Migrace:** tabulka vzniká při prvním spuštění `schema.sql` verze 3 a všechny výhry rozhodnuté do té chvíle se do ní zapíšou jako vyplacené (`legacy = true`):
    XP za ně hráči dostali ve svých zařízeních a znovu se vyplácet nemají. Kdo vyhrál a od té doby aplikaci neotevřel (XP za výhru ještě nedostal), o XP za tyto zápasy přijde –
    je to nejvýš pár zápasů běžícího týdne a je to menší zlo než dvojí výplata všem. Další spuštění `schema.sql` už nic nemění (tabulka existuje).

## Průběh výzev a zápasů na serveru (schéma 3)

Dřív se průběh rozehrané výzvy (které otázky už hráč zodpověděl) držel jen v zařízení: po smazání dat šla výzva hrát znovu od první otázky. Teď ho eviduje server.

- Tabulka `challenge_progress` (výzva, hráč, `idx` od 0, `correct`, `points`, čas): po každé odpovědi aplikace zavolá `challenge_progress_save(code, idx, correct, points)`
  (security definer, jen za `auth.uid()`). Funkce přijme jen **další index v pořadí**: nic přeskočit ani přepsat nejde; stejná odpověď poslaná znovu (fronta po výpadku spojení,
  ztracená odpověď serveru) nic nezmění a projde. Hrát smí jen ten, kdo smí zapsat výsledek (výzva pro kohokoli s kódem, jinak jen vyzvaný a zakladatel); po zapsání výsledku
  už průběh nejde měnit. Body se kontrolují (správně 1–4, psaná odpověď až 8, špatně 0; výzva s pevným výběrem z možností nejvýš 4).
- Konečný výsledek (`challenge_results`) se zapisuje dál stejně, ale spoušť `result_from_progress` ho pro hráče (role `authenticated`) přijme, až když server má odpovědi
  na všechny otázky, a počet správných i body **spočítá sama z průběhu** (čísla od klienta se přepíšou). Správce (`postgres`) se tím neřídí.
- Aplikace při otevření výzvy průběh načte (`GET challenge_progress`, pravidlo řádků pustí jen vlastní řádky) a pokračuje první nezodpovězenou otázkou s výsledky ze serveru;
  totéž před pokračováním z úvodní stránky (průběh mohl přibýt na jiném zařízení). Bez spojení odpovědi čekají v zařízení (rozehraná výzva v relaci a v `mudrlant.openChallenges`)
  a dopošlou se v pořadí s další odpovědí nebo před odesláním výsledku; výsledek se bez nich neposílá.
- Zápasy turnaje: stejně tabulka `tournament_answers` a `tournament_answer_save(mid, idx, correct, points)` – jen účastník, jen po `tournament_start_match`, jen v den kola
  a před koncem zápasu; `tournament_finish_match` výsledek sečte z odpovědí a bez všech deseti ho nezapíše (argumenty `correct_count` a `point_count` zůstaly kvůli starším
  aplikacím, nepoužijí se). Opakování zápasu od první otázky tu server bránil už dřív (zápas jde začít jen jednou), nově jde rozehraný zápas dohrát i po smazání dat nebo na jiném zařízení.
- Starší databáze bez tabulek a funkcí (404): aplikace průběh neposílá a chová se jako dřív.
- **Omezení:** server zná jen odpovědi, které k němu dorazily. Odpověď zodpovězená bez spojení, která se ještě neodeslala, by po smazání dat zmizela a otázka
  by se nabídla znovu; online se každá odpověď ukládá hned po zodpovězení. Počet správných a body počítá aplikace (správnost odpovědi server neověřuje),
  server hlídá jen pořadí, tvar a rozsah hodnot a že výsledek odpovídá součtu průběhu.
- **Pořadí nasazení:** nejdřív spusť `schema.sql`, pak nasaď aplikaci. Starší verze aplikace, která ještě běží v něčím prohlížeči, průběh neposílá, takže jí server výsledek
  výzvy ani zápasu nepřijme; po obnovení stránky (nová verze) se odpovědi uložené v zařízení dopošlou a výsledek se odešle.
- Test: `tests/sql-progress.test.js` (pokusy o podvod: cizí výzva, přeskočení a přepsání otázky, výsledek bez průběhu nebo s vylepšenými čísly, dvojí a souběžný claim XP, migrace).

## Upozornění (web push)

Aplikace umí poslat upozornění: **začíná tvůj turnajový zápas** (dnes hraješ kolo, večer podruhé), **nová výzva od hráče**, **soupeř odehrál tvoji výzvu** a **zpráva o turnaji** (nepřijat, zrušen, vypadl jsi, výsledek).
Odesílá je GitHub Actions (`.github/workflows/push.yml`, posílá se mezi 7:00 a 21:00 pražského času). Spouští ho hodinový plán GitHubu, který ale běží nespolehlivě
(někdy jen párkrát za den), a po nastavení [okamžitého odesílání](#okamžité-odesílání-upozornění) hlavně sama databáze, takže upozornění přijde do 1–2 minut.
Nepoužívá se žádný klíč `service_role` ani `sb_secret_…`: odesílač volá v databázi funkce `push_due` a `push_mark` s veřejným klíčem z `config.js` a vlastním tajemstvím,
které leží jen v tabulce `app_secrets` (přes API ji nejde ani přečíst) a v GitHub secrets.
Bez níže popsaného nastavení se v aplikaci tlačítko „Zapnout upozornění“ vůbec neukáže a nic se neposílá.

**Souhlas a odhlášení:** upozornění vzniknou až po klepnutí na **Nastavení → Hra → Zapnout upozornění** a po souhlasu v prohlížeči. Tamtéž jdou vypnout (smaže se předplatné v prohlížeči i v databázi)
a jdou odděleně zapnout/vypnout turnaje a výzvy. **Odhlášení z účtu** předplatné na tom zařízení také smaže, takže jiný hráč na sdíleném telefonu nic cizího nedostane. Předplatné vidí a maže jen jeho vlastník (RLS);
odběry, které prohlížeč zrušil (odpověď 404/410), nebo které třikrát selhaly, server smaže sám. Zpráva o stejné věci se pošle nejvýš jednou, od každého druhu nejvýš jedna za hodinu.

**Nabídka v aplikaci:** hra se sama zeptá („Mám ti dát vědět?“ se sovou, třemi důvody a poznámkou o nočním klidu, tlačítka „Zapnout upozornění“ a „Teď ne“), ale jen když
to dává smysl: hráč je přihlášený, prohlížeč push umí, `vapidPublicKey` je vyplněný, prohlížeč se ještě neptal (`Notification.permission` = `default`) a upozornění
nejsou zapnutá. Kdy: hned po přihlášení do turnaje, po dohrání výzvy, na jejíhož soupeře se čeká (i po založení výzvy, protože založení ji rovnou spustí), jinak
nejdřív při 3. otevření záložky Více hráčů. „Teď ne“ (i zavření okna) = znovu nejdřív za 7 dní, celkem nejvýš 3×; po zapnutí nebo zamítnutí v prohlížeči už nikdy.
Nikdy během tutoriálu, uprostřed otázky nebo zápasu ani přes jiné otevřené okno (po turnaji a výzvě počká až 3 minuty, než se okno zavře). Na iPhonu bez přidání na
plochu se místo nabídky jednou ukáže rada „Sdílet → Přidat na plochu“. Stav je v `localStorage` (`mudrlant.pushOffer`, zvlášť pro každý účet). Zapnutí z nabídky je
stejné jako přepínač v Nastavení (souhlas prohlížeče, předplatné, uložení) a skončí potvrzením „Upozornění jsou zapnutá“, nebo srozumitelnou chybou s možností zkusit znovu.

Jednorázové nastavení:

1. **Databáze:** spusť znovu celý `supabase/schema.sql` (přibyly tabulky `push_subscriptions`, `app_secrets`, `push_sent`, sloupce `profiles.push_tournament` a `push_challenge` a funkce `push_*`).
2. **Klíče VAPID** (na svém počítači, potřebuješ Node.js): `npx web-push generate-vapid-keys`. Vypíše *Public Key* a *Private Key*.
3. **Veřejný klíč** vlož do `config.js` jako `vapidPublicKey: '…'` (je veřejný, patří do repozitáře) a změnu nasaď.
4. **Tajemství pro odesílače:** vymysli dlouhý náhodný řetězec (16 až 200 znaků, např. `openssl rand -hex 32`) a vlož ho do Supabase SQL Editoru (nahraď `TAJEMSTVI`):
   `insert into public.app_secrets (name, value) values ('push_cron', 'TAJEMSTVI') on conflict (name) do update set value = excluded.value;`
5. **GitHub secrets** (repozitář → Settings → Secrets and variables → Actions → *New repository secret*):
   - `VAPID_PRIVATE_KEY`: *Private Key* z kroku 2 (nikam jinam ho nevkládej),
   - `PUSH_CRON_SECRET`: stejné tajemství jako v kroku 4.
   Volitelně v záložce *Variables* proměnná `VAPID_SUBJECT` (kontakt provozovatele, `mailto:tvuj@email.cz`); výchozí je adresa aplikace.
6. **Okamžité odesílání:** nastav podle části [Okamžité odesílání upozornění](#okamžité-odesílání-upozornění) níž (token GitHubu, `pg_cron`, `pg_net`, jedno SQL).
   Bez něj upozornění chodí jen při hodinových bězích GitHubu, které se často zpozdí o hodiny.
7. **Vyzkoušení:** Actions → *Upozornění* → **Run workflow** (s `dry_run` = `true` jen vypíše, co by poslal). Plánované spouštění funguje jen z výchozí větve (`main`).
   V aplikaci zapni upozornění a zkus založit výzvu ze druhého účtu; s okamžitým odesíláním přijde upozornění do 1–2 minut, jinak až při běhu GitHubu.

Poznámky: na iPhonu fungují upozornění jen v aplikaci přidané na plochu (iOS 16.4 a novější). Výměna klíčů VAPID zneplatní všechna předplatná, hráči si upozornění zapnou znovu.
Častější `cron` v `push.yml` nepomůže (GitHub plánované běhy zpožďuje nebo vynechává); rychlé doručení zajistí okamžité odesílání níž.

**Schéma 4 (zkušební upozornění):** spusť znovu celý `supabase/schema.sql` (přibyla tabulka `push_tests`, funkce `dev_push_test()` a `push_test_key()`
a druh `test` v `push_due` a `push_mark`).

**Schéma 5 (okamžité odesílání):** spusť znovu celý `supabase/schema.sql` (přibyla funkce `push_kick()`, tabulka `push_kick_state`, funkce `dev_push_status()`
pro vývojářské okno a interní `push_pending()`, kterou teď sdílí `push_due` – navenek se `push_due` nemění). Schéma jde spustit i bez rozšíření `pg_cron` a `pg_net`.
Aplikace potřebuje verzi 5; správci (vývojářský režim) jinak v Nastavení ukáže „Databáze není aktuální“ a zkouška upozornění napíše obecný text.

**Když přepínač nejde zapnout:** výsledek se ukáže hned u přepínače (podtitulek řádku Upozornění, pod ním rada, krátce i v hlášce dole). Během čekání je tam „Zapínám…“.
Možné příčiny: *Prohlížeč upozornění zablokoval* (klepnutí na řádek otevře okno „Jak povolit upozornění“ s postupem pro Android, aplikaci na ploše, iPhone a počítač;
tlačítko „Už jsem povolil – zkontrolovat“ zapnutí dokončí, stejně tak samotný návrat do aplikace z nastavení), *Dotaz prohlížeče se zavřel bez volby* (Chrome dotaz
někdy ztlumí – ikona zvonku v adresním řádku), *Nespustila se část aplikace pro upozornění (service worker)* (obnovit stránku), *Push služba prohlížeče odběr odmítla*
(s názvem chyby, např. `AbortError`; v Brave je potřeba zapnout „Používat služby Google pro zasílání zpráv“), *Databáze nemá funkce upozornění* (404: spustit schéma),
*Přihlášení vypršelo* (401) a *Server odpověděl chybou …* (jiný kód).

### Okamžité odesílání upozornění

GitHub spouští hodinový plán odesílače velmi nespolehlivě (někdy jen dvakrát za den), takže upozornění by čekala hodiny. Proto může odesílač spouštět
sama databáze: každou minutu se podívá, jestli je co poslat, a když ano, řekne GitHubu „spusť Upozornění“. Upozornění pak přijde **do 1–2 minut**.
K tomu potřebuje token z GitHubu, který má přístup jen k Actions (spouštění workflow) v tomto jediném repozitáři – kód měnit ani číst secrets nemůže. Token leží jen ve tvé databázi (tabulka `app_secrets`, přes API
ji nikdo nepřečte); klíč `service_role` ani `sb_secret_…` se ani tady nepoužívá. Nastavení se dělá jednou a zabere asi 10 minut.

Předpoklad: upozornění fungují podle kroků výš (VAPID, `PUSH_CRON_SECRET`) a databáze má **schéma 5** – spusť znovu celý `supabase/schema.sql`
(SQL Editor → New query → vložit → Run, viz [Aktualizace databáze](#aktualizace-databáze-profily-a-výzvy)).

**a) Token na GitHubu**

1. Na https://github.com klikni vpravo nahoře na svou **profilovou fotku** → **Settings**.
2. V levém menu úplně dole **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
3. *Token name*: `Mudrlant upozornění`. *Resource owner* nech svůj účet.
4. *Expiration*: vyber nejdelší dobu, kterou nabídka dovolí (u *Custom* datum co nejdál, nebo *No expiration*, pokud ho GitHub nabízí).
   Až token vyprší (GitHub ti předem pošle e-mail), upozornění zase chodí jen při hodinových bězích. Pak vytvoř nový token stejným postupem
   a spusť znovu SQL z kroku c) s novým tokenem.
5. *Repository access*: **Only select repositories** → v seznamu vyber **geografie-kviz**.
6. *Permissions* → **Repository permissions** → u **Actions** zvol **Read and write** (v novějším vzhledu **+ Add permissions** → zaškrtni **Actions**
   → vpravo **Read and write**). *Metadata: Read-only* se přidá samo. Nic dalšího nezapínej.
7. Dole **Generate token** (a v okně ještě jednou potvrď). Token začíná `github_pat_` a ukáže se **jen jednou**: hned ho zkopíruj ikonou vedle něj.
   Nikam ho neposílej a nevkládej do repozitáře ani do GitHub secrets.

**b) Rozšíření v Supabase**

1. V projektu Supabase v levém menu **Database** → **Extensions**.
2. Do hledání napiš `pg_cron` a zapni přepínač (potvrď **Enable extension**, schéma nech, jak je nabídnuté).
3. Totéž pro `pg_net`.

**c) SQL Editor**

1. **SQL Editor** → **New query** a vlož tohle SQL. `SEM_VLOZ_TOKEN` nahraď zkopírovaným tokenem (apostrofy kolem nech):

   ```sql
   -- Token z GitHubu (jen v databázi, přes API ho nikdo nepřečte)
   insert into public.app_secrets (name, value) values ('github_token', 'SEM_VLOZ_TOKEN')
   on conflict (name) do update set value = excluded.value;
   -- Každou minutu se podívat, jestli je co poslat (úloha se stejným názvem se při dalším spuštění jen přepíše)
   select cron.schedule('upozorneni', '* * * * *', $$select public.push_kick()$$);
   ```

2. **Run**. Dole se ukáže číslo úlohy (např. `1`). Spustit totéž znovu je bezpečné: token se přepíše a úloha `upozorneni` zůstane jedna
   (pg_cron úlohu se stejným názvem jen aktualizuje). Chyba *violates check constraint* znamená, že místo tokenu zůstal `SEM_VLOZ_TOKEN` nebo jen jeho kus.
3. Jen když máš repozitář pod jiným názvem než `taronwho/geografie-kviz` (vlastní kopie), přidej ještě (s vlastním názvem):
   `insert into public.app_secrets (name, value) values ('github_repo', 'vlastnik/repozitar') on conflict (name) do update set value = excluded.value;`

**d) Jak ověřit**

1. Otevři aplikaci s `?vyvojar` → Nastavení → Vývojářský režim → **Poslat zkušební upozornění přes server**. Okno má napsat
   **„Upozornění přijde do 1–2 minut.“** Když napíše, že okamžité odesílání je nastavené jen zčásti, vypíše i to, co chybí.
2. Do 1–2 minut přijde „Zkušební upozornění Mudrlanta“ (i v noci – zkušební upozornění se posílají i v nočním klidu).
3. Na GitHubu → **Actions** → vlevo **Upozornění** je nový běh s událostí **workflow_dispatch** (hodinové běhy mají **schedule**);
   v logu kroku *Odeslání* je „Odesláno 1 zařízením“.
4. Když nic nepřijde, spusť v SQL Editoru `select public.push_kick();` – vrátí krátký stav: `no-token` (chybí token, krok c), `bad-token` (token se
   nezkopíroval celý nebo s mezerou uvnitř), `no-pg_net` (krok b), `nothing` (není co poslat), `wait`/`backoff`/`hour-limit` (pojistky níž),
   `dispatched` (GitHub dostal pokyn). Odpověď GitHubu ukáže `select status_code, created from net._http_response order by created desc limit 5;`:
   `204` = v pořádku, `401` = token neplatí nebo vypršel, `403` nebo `404` = token nemá u repozitáře **geografie-kviz** právo *Actions: Read and write*.
   Okno zkoušky v aplikaci po odmítnutí GitHubem napíše „GitHub ho naposledy odmítl“.

**e) Záloha a pojistky**

- Hodinový plán v `push.yml` zůstává jako **záloha** (třeba když token vyprší); nic v něm neměň.
- Databáze spustí workflow, jen když by odesílač opravdu něco poslal – podle stejných pravidel jako `push_due` (předvolby hráče, nejvýš jedna zpráva
  téhož druhu za hodinu, platné odběry). V nočním klidu (21:00–7:00) jen kvůli zkušebnímu upozornění; ostatní počkají a spustí se ráno v 7:00.
- Proti zacyklení a zbytečným během: další spuštění nejdřív 3 minuty po předchozím, nejvýš 12 za hodinu, a když čekají pořád tytéž zprávy
  (doručení selhává nebo GitHub běh nespustil), další pokus až za 10, 20, 40 a pak 60 minut. Stav je v tabulce `push_kick_state` (přes API nedostupná).
- Vypnutí: `select cron.unschedule('upozorneni');` (případně ještě `delete from public.app_secrets where name = 'github_token';` a token smaž na GitHubu
  ve Fine-grained tokens → **Delete**). Upozornění pak chodí jen podle hodinového plánu.
- Token prochází jen databází a rozšířením `pg_net` (jeho schéma `net` není přes API vidět – nepřidávej ho v Settings → API do *Exposed schemas*).

**f) Schéma 5:** okamžité odesílání potřebuje `supabase/schema.sql` ve verzi 5 (viz výš). Po každé budoucí aktualizaci schématu stačí spustit
celý soubor znovu; token i úloha `upozorneni` zůstanou.

### Jak upozornění vyzkoušet (krok za krokem)

1. **Vývojářský režim:** otevři aplikaci s `?vyvojar` na konci adresy (např. `https://taronwho.github.io/geografie-kviz/app/?vyvojar`). V Nastavení → Hra se dole objeví
   oranžově orámovaný „Vývojářský režim“ s oddílem **Upozornění** (tři tlačítka). Vypne se adresou s `?vyvojar=0`.
2. **Zapni upozornění:** přihlas se, Nastavení → Hra → přepínač **Upozornění** → v dotazu prohlížeče **Povolit**. Podtitulek řádku napíše „Hotovo: upozornění jsou zapnutá“.
3. **Diagnostika upozornění** (když něco nejde): ukáže povolení prohlížeče (`granted` = povoleno, `denied` = zablokováno, `default` = ještě se neptal), jestli běží
   service worker, jestli má prohlížeč předplatné (adresa zkráceně), prvních 8 znaků klíče `vapidPublicKey` a jestli server odpovídá a zná toto zařízení.
   Klíče předplatného se nezobrazují, snímek obrazovky se dá bez obav poslat vývojáři.
4. **Zkusit upozornění v tomto zařízení** (bez serveru, hned): stránka pošle zprávu service workeru a ten ukáže upozornění „Zkušební upozornění Mudrlanta“ stejnou
   funkcí jako skutečné upozornění ze serveru. Klepni na něj: aplikace se otevře na záložce Více hráčů a napíše „Klepnutí na upozornění funguje“. Když upozornění nejsou
   povolená, okno to řekne a nabídne povolení. Tím je ověřený telefon a prohlížeč (zobrazení i klepnutí), ne server.
5. **Poslat zkušební upozornění přes server** (celá cesta: databáze → GitHub → push služba → telefon). Jednou zapiš svůj účet do `dev_admins` (SQL Editor, přezdívku
   nahraď svou): `insert into public.dev_admins (user_id) select id from public.profiles where lower(display_name) = lower('Taron') on conflict do nothing;`
   Po klepnutí databáze (`dev_push_test()`) zařadí zkušební zprávu pro tvůj účet (všechna tvoje zařízení se zapnutými upozorněními) a aplikace napíše, co dál:
   - s **okamžitým odesíláním** (část výš): **„Upozornění přijde do 1–2 minut.“** – nic dalšího dělat nemusíš;
   - bez něj (nebo se schématem starším než 5): že server posílá, jen když ho spustí GitHub (má to být každou hodinu, ale často je to mnohem později),
     odkaz na návod [Okamžité odesílání upozornění](#okamžité-odesílání-upozornění) a vedlejší rada **„Hned ho pošleš na GitHubu: Actions → Upozornění → Run workflow“**
     (`dry_run` nech `false`); když je nastavení rozpracované, i co chybí (token GitHubu, pg_net, úloha pg_cron);
   - když GitHub poslední spuštění odmítl (např. vypršelý token): „GitHub ho naposledy odmítl (chyba 401)“ a odkaz na návod.

   Do minuty po doběhnutí workflow přijde „Zkušební upozornění Mudrlanta“; v logu běhu je „Odesláno N zařízením“. Klepnutí otevře záložku Více hráčů.
   - Zpráva se pošle jen jednou (pak ji `push_mark` uzavře), čeká nejvýš 24 hodin; další klepnutí na tlačítko ji zařadí znovu (hodinový limit pro zkoušky neplatí).
   - **Noční klid** (21:00–7:00 Praha): plánované běhy nic neposílají; běh spuštěný **ručně** (Run workflow) nebo **databází** (okamžité odesílání) pošle i v noci,
     ale jen zkušební upozornění – ostatní (turnaje, výzvy) počkají na ráno. Skript to pozná podle proměnné `MANUAL` (workflow ji nastaví u každého
     spuštění typu `workflow_dispatch`); `FORCE=true` při ručním spuštění skriptu pošle vše.
   - Účet mimo `dev_admins` dostane „Tenhle účet není v dev_admins“; účet bez zapnutých upozornění „Účet nemá zapnutá upozornění na žádném zařízení“ (nic se nezařadí).
   - `dry_run = true` jen vypíše, co by se poslalo (zkušební zprávu nechá čekat).
## Moje data: export a smazání účtu (zveřejnění, Google Play)

Nastavení → dole **Moje data** (jen přihlášený hráč) → **Stáhnout moje data (JSON)** a **Smazat účet a data** (s potvrzením). Potřebují aktuální `supabase/schema.sql`
(spustit celé znovu v SQL Editoru); bez něj aplikace ukáže „Tato funkce na serveru zatím není zapnutá“ a export stáhne aspoň data ze zařízení.

- `export_my_data()` vrátí jako JSON jen řádky přihlášeného hráče (`auth.uid()`): účet (id, e-mail, časy), profil, založené výzvy, výsledky,
  historii ratingu, přihlášky/zápasy/výsledky/zprávy turnajů, poslední aktivitu, přátelství a žádosti, zablokované hráče, reakce,
  vlastní nahlášení hráčů a hlášení otázek, odběry upozornění (bez klíčů) a od schématu 3 i průběh výzev (`vyzvy_prubeh`), odpovědi v zápasech turnaje
  (`turnaje_odpovedi`) a vyplacené XP za výhry v turnaji (`turnaje_xp`).
- Poslední aktivita (`player_seen`, zapisuje jen `touch_seen()`) je ve vlastní tabulce: hráč čte jen svůj řádek, přátelé ji dostanou
  přes `friends_list()` (žadatel ani oslovený u nepřijaté žádosti ne). Starší sloupec `profiles.last_seen` (četl ho kdokoli přihlášený)
  schéma při spuštění převede a odstraní.
- `delete_my_account()` (security definer, vlastník `postgres`) smaže řádek v `profiles` – ostatní tabulky na něj navazují přes `ON DELETE CASCADE`
  – a pak i řádek v `auth.users` (stejně jako vývojářská funkce `dev_tournament_clear_bots`). Nepoužívá se žádný klíč `service_role`,
  klient volá funkci jen s tokenem přihlášeného hráče (grant jen pro `authenticated`).
  Aplikace po úspěchu odhlásí hráče, vymaže `mudrlant.*` z `localStorage` a načte se znovu.
- **Omezení:**
  - Kdyby role vlastníka funkce neměla právo mazat v `auth.users` (v běžném Supabase projektu ho má), funkce vrátí `false`: data v `public` jsou smazaná,
    profil je vrácen na prázdný výchozí a aplikace hráči řekne, že přihlašovací záznam smaže provozovatel (Authentication → Users → … → Delete user).
  - Hráč, který je ještě ve hře (`status = 'playing'`) v běžícím turnaji, účet smazat nemůže (smazané zápasy by rozbily pavouk soupeřů) – funkce
    skončí hláškou „Právě hraješ turnaj…“. Po vypadnutí nebo konci turnaje to jde.
  - Společné záznamy se mažou celé: výzva založená smazaným hráčem zmizí i s výsledky soupeřů a historií ratingu v ní, zápasy turnajů smazaného hráče zmizí z historie
    turnaje. Aktuální rating soupeřů (`profiles.rating`) se nemění; týdenní žebříček ale ztratí změny z nich.
  - Zálohy Supabase (podle tarifu) mohou kopii dat držet ještě krátce; uveď to v zásadách (`soukromi.html`, zvýrazněná místa `[DOPLNIT …]`).
- Test: `tests/sql-account.test.js` (PostgreSQL 16, viz `tests/sql-rating.test.js`).

## Právní stránky (`soukromi.html`, `licence.html`)

- `soukromi.html` obsahuje zvýrazněná místa **[DOPLNIT …]** (provozovatel, e-mail, datum, region databáze, lhůty). Před zveřejněním je vyplň a text nech zkontrolovat;
  stejnou adresu zásad zadej do Google Play Console (Obsah aplikace → Zásady ochrany osobních údajů) a návod ke smazání účtu odkazuje na `soukromi.html#smazani`.
- `licence.html` + `licence.js` čtou `data/licenses.json` (autor a licence každého obrázku z Wikimedia Commons). Soubor sestavuje `node scripts/build-licenses.mjs`
  (nebo GitHub Action **Licence obrázků**, Run workflow – commitne `data/licenses.json` a `reports/licence-problemy.md`). Po přidání nových položek s obrázky spusť znovu.
  `reports/licence-problemy.md` vypisuje soubory s licencí NC/ND, „fair use“ nebo bez licence, které je před komerčním vydáním potřeba nahradit.

## Jak to v aplikaci funguje

- `auth.js` volá Supabase Auth přes REST (bez knihovny, kvůli přísné CSP bez cizích skriptů); klíč jde v hlavičce `apikey`.
- Přihlášení: Nastavení → Přihlásit se přes Google → Google → návrat na stránku s tokeny v adrese, které se hned uloží
  (`localStorage`, klíč `mudrlant.auth`) a z adresy zmizí. Token se obnovuje sám.
- Pro multiplayer: `MudrlantAuth.accessToken()` vrátí platný token a `MudrlantAuth.getState().user.id` stálé id hráče.
  Všechna budoucí data (zápasy, výsledky) se budou vázat na toto id a chránit pravidly řádků (RLS) v databázi.
- CSP povoluje připojení k `https://*.supabase.co`.

## Co přijde dál (návrh)

1. Ukládání postupu (série, statistiky) k účtu, ať se přenáší mezi telefony.
2. Tabulky `matches` a `match_players` s RLS a Supabase Realtime pro souboj o stejné otázky (otázka dne se už losuje
   stejně všem podle data).
3. Žebříček přátel.
