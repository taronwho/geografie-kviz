# Přihlášení účtem Google (Supabase)

Aplikace je statický web, takže účty zajišťuje služba Supabase (zdarma pro tuto velikost). Bez nastavení
(`config.js` prázdný) se přihlášení v aplikaci vůbec neukáže a hra běží jako host, jako dosud.

## Jednorázové nastavení (asi 15 minut)

1. **Projekt.** Na https://supabase.com se přihlas (třeba přes GitHub) → *New project* → název `mudrlant`, region
   *Frankfurt (eu-central-1)*, vymysli databázové heslo (uložit si ho nemusíš, nepoužívá se).
2. **Databáze.** V projektu *SQL Editor* → *New query* → vlož obsah souboru `supabase/schema.sql` → *Run*.
3. **Google přihlášení.**
   - V Supabase: *Authentication → Providers → Google*, zapnout a opsat si **Callback URL** (vypadá jako
     `https://XXXX.supabase.co/auth/v1/callback`).
   - V Google Cloud Console (https://console.cloud.google.com): nový projekt → *APIs & Services → OAuth consent screen*
     (External, název Mudrlant, tvůj e-mail) → *Credentials → Create credentials → OAuth client ID* → typ
     **Web application**. Do *Authorized redirect URIs* vlož Callback URL ze Supabase. Vznikne **Client ID** a **Client secret**.
   - Obojí vlož zpět do Supabase (*Providers → Google*) a ulož.
4. **Adresy aplikace.** V Supabase *Authentication → URL Configuration*:
   - *Site URL*: `https://taronwho.github.io/geografie-kviz/app/` (po přejmenování repozitáře `https://taronwho.github.io/mudrlant/app/`)
   - *Redirect URLs*: totéž s koncovkou `**` a pro zkoušení na počítači `http://localhost:8080/**`.
5. **Klíče do aplikace.** V Supabase *Project Settings → API* zkopíruj **Project URL** a klíč **anon public**
   a vlož je do `config.js` (nebo je pošli Claudovi a vloží je). Anon klíč je určený pro prohlížeč a je veřejný;
   *service_role* klíč **nikdy** nikam nevkládej.
6. Po nahrání změny se v Nastavení → Účet objeví tlačítko **Přihlásit se přes Google**.

## Jak to v aplikaci funguje

- `auth.js` volá Supabase Auth přes REST (bez knihovny, kvůli přísné CSP bez cizích skriptů).
- Přihlášení: Nastavení → Přihlásit se přes Google → Google → návrat na stránku s tokeny v adrese, které se hned uloží
  (`localStorage`, klíč `mudrlant.auth`) a z adresy zmizí. Token se obnovuje sám.
- Pro multiplayer: `MudrlantAuth.accessToken()` vrátí platný token a `MudrlantAuth.getState().user.id` stálé id hráče.
  Všechna budoucí data (zápasy, výsledky) se budou vázat na toto id a chránit pravidly řádků (RLS) v databázi.
- CSP povoluje připojení k `https://*.supabase.co`.

## Co přijde dál (návrh)

1. Ukládání postupu (série, statistiky) k účtu, ať se přenáší mezi telefony.
2. Tabulky `matches` a `match_players` s RLS a Supabase Realtime pro souboj o stejné otázky (otázka dne se už losuje
   stejně všem podle data, takže jde stejný základ použít pro zápas).
3. Žebříček přátel.
