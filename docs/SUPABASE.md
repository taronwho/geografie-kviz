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
- **Hlášení chyb v otázkách:** tlačítko „Nahlásit chybu“ (vlajka) v okně otázky a po odpovědi uloží hlášení do tabulky `question_reports` (důvod + volitelný text, nejvýš 20 za 24 hodin na hráče, délky hlídá databáze). Bez připojení se hlášení uloží v zařízení a odešle později; bez účtu hra hráči přátelsky poradí přihlášení. Číst a mazat hlášení smí jen účet v `dev_admins`: v Nastavení v režimu vývojáře (`?vyvojar`) je oddíl „Hlášení otázek“ se seznamem a tlačítkem Vyřízeno. Po aktualizaci spusť znovu celé `supabase/schema.sql` (přibyla tabulka `question_reports`, funkce `is_dev_admin()` a spoušť s denním limitem).
- Odznaky za turnaje (`turnaj-*`) a za zběhlost v tématech (`zbehly-*`) jsou v `badge_catalog()`; přibude-li další odznak, přidej ho i tam.

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
