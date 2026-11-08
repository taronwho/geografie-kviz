-- Databáze pro účty, profily a výzvy hráčů. Spustit v Supabase: SQL Editor → New query → vložit → Run.
-- Lze pouštět opakovaně (po každé aktualizaci tohoto souboru znovu celé). Pravidla řádků (RLS) jsou zapnutá:
-- veřejný klíč z config.js sám nic nepřečte ani nezapíše, dokud to pravidlo nedovolí.

-- ===== Profil hráče: jméno a obrázek (emoji + barva), které vidí ostatní =====
create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text not null default 'Hráč',
    created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar text not null default '🦊';
alter table public.profiles add column if not exists color text not null default 'emerald';
update public.profiles set display_name = left(display_name, 24) where char_length(display_name) > 24;
-- Postup hráče: úroveň (XP) a získané odznaky; aplikace je po přihlášení ukládá sem, ať jsou vidět ostatním a platí na všech zařízeních
alter table public.profiles add column if not exists xp integer not null default 0;
alter table public.profiles add column if not exists badges text[] not null default '{}';
-- Témata, ze kterých hráč nepřijímá výzvy (ostatní ho v nich nevyzvou a náhodný soupeř ho přeskočí)
alter table public.profiles add column if not exists blocked_topics text[] not null default '{}';
-- Přijímá hráč výzvy z Mixu všech témat? (výchozí ano; Mix se pak zúží o témata, která má vypnutá)
alter table public.profiles add column if not exists accepts_mix boolean not null default true;
-- Odměny na profilu: zvolený rámeček kolem obrázku a titul u jména ('level', 'none' nebo id odznaku); vidí je i ostatní hráči.
-- Odemčení hlídá jen aplikace (server hodnotu jen tvarově zkontroluje).
alter table public.profiles add column if not exists frame text;
alter table public.profiles add column if not exists title_pref text;
alter table public.profiles drop constraint if exists profiles_frame_format;
alter table public.profiles add constraint profiles_frame_format check (frame is null or frame ~ '^[a-z0-9-]{1,24}$');
alter table public.profiles drop constraint if exists profiles_title_pref_format;
alter table public.profiles add constraint profiles_title_pref_format check (title_pref is null or title_pref ~ '^[a-z0-9-]{1,40}$');
-- Upravená sova jako obrázek profilu (barva obleku + doplňky), např. 'robe=zelena;head=koruna.modra;face=bryle.original'; vidí ji i ostatní.
-- Sloupec avatar zůstává (záložka '🦉' pro starší aplikaci); tvar hlídá jen kontrola, platnost id a odemčení aplikace.
alter table public.profiles add column if not exists owl text;
alter table public.profiles drop constraint if exists profiles_owl_format;
alter table public.profiles add constraint profiles_owl_format check (owl is null or owl ~ '^[a-z0-9=.;-]{1,200}$') not valid;
alter table public.profiles drop constraint if exists profiles_blocked_len;
alter table public.profiles add constraint profiles_blocked_len check (cardinality(blocked_topics) <= 30 and char_length(array_to_string(blocked_topics, ',')) <= 400) not valid;
alter table public.profiles drop constraint if exists profiles_xp_range;
alter table public.profiles add constraint profiles_xp_range check (xp between 0 and 500000);
alter table public.profiles drop constraint if exists profiles_badges_len;
alter table public.profiles add constraint profiles_badges_len check (cardinality(badges) <= 500 and char_length(array_to_string(badges, ',')) <= 12000) not valid;
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len check (char_length(btrim(display_name)) between 2 and 24);
alter table public.profiles drop constraint if exists profiles_avatar_len;
alter table public.profiles add constraint profiles_avatar_len check (char_length(avatar) between 1 and 8);
alter table public.profiles drop constraint if exists profiles_color_list;
alter table public.profiles add constraint profiles_color_list check (color in ('emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo', 'cerna') or color ~ '^h([0-9]?[05]|[12][0-9][05]|3[0-4][05]|35[05])$');

-- Přezdívka je jedinečná (bez ohledu na velikost písmen), podle ní se hráči hledají. Stejná jména od Googlu se rozliší číslem.
with dup as (
    select id, display_name, row_number() over (partition by lower(display_name) order by created_at, id) as rn from public.profiles
)
update public.profiles p set display_name = left(d.display_name, 20) || ' ' || d.rn from dup d where p.id = d.id and d.rn > 1;
create unique index if not exists profiles_display_name_lower on public.profiles (lower(display_name));

create or replace function public.unique_display_name(base text) returns text
language plpgsql set search_path = public as $$
declare
    cleaned text := left(btrim(coalesce(nullif(btrim(regexp_replace(coalesce(base, ''), '[[:cntrl:]<>&"''`\\]', '', 'g')), ''), 'Hráč')), 24);
    candidate text := cleaned;
    attempt integer := 0;
begin
    if char_length(candidate) < 2 then candidate := 'Hráč'; cleaned := candidate; end if;
    while exists (select 1 from public.profiles where lower(display_name) = lower(candidate)) and attempt < 50 loop
        attempt := attempt + 1;
        candidate := left(cleaned, 20) || ' ' || (100 + floor(random() * 900))::int;
    end loop;
    return candidate;
end;
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles: čtení pro přihlášené" on public.profiles;
create policy "profiles: čtení pro přihlášené" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles: vlastní změna" on public.profiles;
create policy "profiles: vlastní změna" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Při registraci nového účtu se profil založí z jména od Googlu (s jedinečnou přezdívkou)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    begin
        insert into public.profiles (id, display_name)
        values (new.id, public.unique_display_name(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))))
        on conflict (id) do nothing;
    exception when unique_violation then
        -- souběžná registrace stejného jména: náhodná přezdívka, registrace se nikdy nezablokuje
        insert into public.profiles (id, display_name) values (new.id, 'Hráč ' || substr(md5(new.id::text), 1, 8)) on conflict (id) do nothing;
    end;
    return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Účtům, které profil ještě nemají, ho doplnit
do $$
declare account record;
begin
    for account in select id, raw_user_meta_data, email from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id) loop
        insert into public.profiles (id, display_name)
        values (account.id, public.unique_display_name(coalesce(account.raw_user_meta_data ->> 'full_name', account.raw_user_meta_data ->> 'name', split_part(account.email, '@', 1))))
        on conflict (id) do nothing;
    end loop;
end;
$$;

-- Náhodný soupeř: jiný hráč než já (jména a obrázky vidí přihlášení stejně, funkce jen vybírá)
-- Náhodný soupeř, který přijímá výzvy z daných témat (wanted = témata výzvy; prázdné = bez omezení; wants_mix = výzva je Mix)
drop function if exists public.random_opponent();
drop function if exists public.random_opponent(text[]);
create or replace function public.random_opponent(wanted text[] default '{}', wants_mix boolean default false) returns setof public.profiles
language sql stable security definer set search_path = public as $$
    select * from public.profiles
    where id <> auth.uid() and not (blocked_topics && coalesce(wanted, '{}')) and (not coalesce(wants_mix, false) or accepts_mix)
    order by random() limit 1;
$$;
revoke all on function public.random_opponent(text[], boolean) from public, anon;
grant execute on function public.random_opponent(text[], boolean) to authenticated;

-- ===== Výzvy: stejné otázky pro víc hráčů (otázky se losují ze zadaného semínka, takže je každý dostane stejné) =====
create table if not exists public.challenges (
    id text primary key check (id ~ '^[A-Z0-9]{6}$'),
    creator_id uuid not null references public.profiles (id) on delete cascade,
    topic text not null,
    seed text not null check (char_length(seed) between 1 and 80),
    count integer not null check (count between 3 and 20),
    created_at timestamptz not null default now()
);
-- Vyzvaný hráč (podle přezdívky nebo náhodný); prázdné = výzva pro kohokoli s kódem
alter table public.challenges add column if not exists invited_id uuid references public.profiles (id) on delete set null;
-- Téma výzvy: „mix“, jedno téma, nebo víc témat oddělených čárkou
alter table public.challenges drop constraint if exists challenges_topic_check;
alter table public.challenges drop constraint if exists challenges_topic_len;
alter table public.challenges add constraint challenges_topic_len check (char_length(topic) between 1 and 200 and topic ~ '^[a-z0-9,]+$') not valid;

-- Výzvu konkrétnímu hráči nejde založit v tématu, které nepřijímá („mix“ = všechna témata, tak ho aplikace pošle jako seznam bez nich)
create or replace function public.check_challenge_topics() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    blocked text[];
    mix_ok boolean;
begin
    if new.invited_id is null then return new; end if;
    select blocked_topics, accepts_mix into blocked, mix_ok from public.profiles where id = new.invited_id;
    if blocked is null then return new; end if;
    if (new.topic = 'mix' and (not mix_ok or cardinality(blocked) > 0)) or (cardinality(blocked) > 0 and string_to_array(new.topic, ',') && blocked) then
        raise exception 'Tenhle hráč nepřijímá výzvy z některého z vybraných témat.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists challenges_check_topics on public.challenges;
create trigger challenges_check_topics before insert on public.challenges for each row execute function public.check_challenge_topics();
-- Zakládání výzev: čas určuje server a jeden hráč jich za hodinu založí nejvýš 30 (jinak by šla tabulka zaplavit)
create or replace function public.limit_challenges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    new.created_at := now();
    if (select count(*) from public.challenges where creator_id = new.creator_id and created_at > now() - interval '1 hour') >= 30 then
        raise exception 'Založil jsi příliš mnoho výzev, zkus to za chvíli.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists challenges_limit on public.challenges;
create trigger challenges_limit before insert on public.challenges for each row execute function public.limit_challenges();
-- Nastavení výzvy: i těžší (méně známé) otázky, vybrané okruhy tématu (prázdné = všechny) a pevný způsob odpovídání
alter table public.challenges add column if not exists include_hard boolean not null default false;
alter table public.challenges add column if not exists categories text[] not null default '{}';
alter table public.challenges add column if not exists variant text;
alter table public.challenges drop constraint if exists challenges_variant_list;
alter table public.challenges add constraint challenges_variant_list check (variant is null or variant in ('choices', 'typed'));
alter table public.challenges drop constraint if exists challenges_categories_len;
alter table public.challenges add constraint challenges_categories_len check (cardinality(categories) <= 20 and char_length(array_to_string(categories, ',')) <= 400) not valid;
alter table public.challenges drop constraint if exists challenges_seed_format;
alter table public.challenges add constraint challenges_seed_format check (seed ~ '^[A-Za-z0-9._-]{1,80}$') not valid;
create index if not exists challenges_invited_idx on public.challenges (invited_id, created_at desc);
alter table public.challenges enable row level security;
-- Kód výzvy stačí k jejímu otevření; číst ji smí každý přihlášený, zakládat jen vlastní
drop policy if exists "challenges: čtení pro přihlášené" on public.challenges;
create policy "challenges: čtení pro přihlášené" on public.challenges for select to authenticated using (true);
drop policy if exists "challenges: zakládá vlastník" on public.challenges;
create policy "challenges: zakládá vlastník" on public.challenges for insert to authenticated with check (creator_id = auth.uid() and (invited_id is null or invited_id <> auth.uid()));

-- Výsledek jednoho hráče ve výzvě; zapsat jde jen jednou (nejde si zahrát znovu a přepsat si skóre)
create table if not exists public.challenge_results (
    challenge_id text not null references public.challenges (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    correct integer not null check (correct >= 0),
    points integer not null check (points >= 0),
    finished_at timestamptz not null default now(),
    primary key (challenge_id, user_id)
);
alter table public.challenge_results enable row level security;
drop policy if exists "výsledky: čtení pro přihlášené" on public.challenge_results;
create policy "výsledky: čtení pro přihlášené" on public.challenge_results for select to authenticated using (true);
drop policy if exists "výsledky: zapisuje hráč sám" on public.challenge_results;
create policy "výsledky: zapisuje hráč sám" on public.challenge_results for insert to authenticated
    with check (
        user_id = auth.uid()
        and exists (select 1 from public.challenges c where c.id = challenge_id and (c.invited_id is null or c.invited_id = auth.uid() or c.creator_id = auth.uid()))
        and correct <= (select c.count from public.challenges c where c.id = challenge_id)
        -- psaná odpověď má dvojnásobek bodů (nejvýš 8 za otázku)
        and points <= 8 * (select c.count from public.challenges c where c.id = challenge_id)
    );
-- Čas dohrání určuje server (klient si ho nemůže zpětně upravit)
create or replace function public.stamp_result() returns trigger
language plpgsql as $$
begin
    new.finished_at := now();
    return new;
end;
$$;
drop trigger if exists challenge_results_stamp on public.challenge_results;
create trigger challenge_results_stamp before insert on public.challenge_results for each row execute function public.stamp_result();
create index if not exists challenge_results_user_idx on public.challenge_results (user_id, finished_at desc);

-- ===== Rating (ELO), ligy a týdenní žebříček =====
-- Rating je oddělený od úrovně (XP): mění se jen výsledky výzev proti jinému hráči, nikdy sólovou hrou.
-- Počítá ho databáze sama (trigger níže), klient do sloupce rating psát nemůže.
alter table public.profiles add column if not exists rating integer not null default 1000;
alter table public.profiles add column if not exists rated_games integer not null default 0;
alter table public.profiles drop constraint if exists profiles_rating_range;
alter table public.profiles add constraint profiles_rating_range check (rating between 100 and 5000);

-- Liga podle ratingu (stejné hranice jako v rating.js): bronz, stribro, zlato, platina, diamant, mistr
create or replace function public.rating_league(r integer) returns text
language sql immutable as $$
    select case
        when r >= 1700 then 'mistr'
        when r >= 1550 then 'diamant'
        when r >= 1400 then 'platina'
        when r >= 1250 then 'zlato'
        when r >= 1100 then 'stribro'
        else 'bronz'
    end;
$$;

-- Záznam jednoho hráče o jedné ohodnocené výzvě; (výzva, hráč) je jedinečné, takže se výzva nikdy nepočítá dvakrát
create table if not exists public.rating_history (
    challenge_id text not null references public.challenges (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    opponent_id uuid references public.profiles (id) on delete set null,
    outcome text not null check (outcome in ('win', 'loss', 'draw')),
    delta integer not null,
    rating_after integer not null,
    capped boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (challenge_id, user_id)
);
create index if not exists rating_history_week_idx on public.rating_history (created_at desc);
create index if not exists rating_history_pair_idx on public.rating_history (user_id, opponent_id, created_at desc);
alter table public.rating_history enable row level security;
drop policy if exists "rating: čtení pro přihlášené" on public.rating_history;
create policy "rating: čtení pro přihlášené" on public.rating_history for select to authenticated using (true);
-- zápis jen přes trigger (security definer); klientovi žádná politika pro zápis nepatří
revoke insert, update, delete on public.rating_history from anon, authenticated;

-- Katalog odznaků (musí odpovídat BADGES v quiz-core.js; hlídá to tests/sql-security.test.js). Do účtu se uloží jen odznak z katalogu.
create or replace function public.badge_catalog() returns text[]
language sql immutable set search_path = public as $$
    select array[
        'prvni-krok', 'odpovedi-10', 'odpovedi-50', 'stovka', 'odpovedi-250', 'odpovedi-500', 'tisicovka', 'odpovedi-2500', 'odpovedi-5000', 'odpovedi-10000',
        'rada-5', 'strelec', 'neomylny', 'rada-50', 'rada-100', 'rada-200',
        'serie-3', 'tyden', 'serie-14', 'mesic', 'serie-60', 'serie-100', 'serie-200', 'serie-365',
        'dny-5', 'dny-15', 'dny-30', 'dny-60', 'dny-100', 'dny-200', 'dny-365',
        'dokonaly-den', 'dokonale-3', 'dokonale-7', 'dokonale-14', 'dokonale-30', 'dokonale-60',
        'dnes-10', 'dnes-50', 'dnes-100', 'dnes-250', 'dnes-500', 'dnes-1000',
        'bez-napovedy-10', 'bez-napovedy', 'bez-napovedy-100', 'bez-napovedy-500', 'bez-napovedy-1000', 'bez-napovedy-2500',
        'psani-10', 'pisatel', 'psani-100', 'psani-500', 'psani-1000', 'psani-2500',
        'do-hloubky', 'tezke-50', 'tezke-200', 'tezke-500', 'tezke-1000',
        'chyby-10', 'chyby-50', 'chyby-200', 'chyby-500', 'chyby-1000',
        'soupere', 'vyzvy-5', 'vyzvy-25', 'vyzvy-100', 'vyzvy-250', 'vyzvy-500',
        'vitez', 'vyhry-5', 'gladiator', 'vyhry-25', 'vyhry-50', 'vyhry-100',
        'vyhry-v-rade-3', 'vyhry-v-rade-5', 'vyhry-v-rade-10', 'vyhry-v-rade-15', 'vyhry-v-rade-25',
        'zalozene-1', 'zalozene-10', 'zalozene-50', 'zalozene-100', 'zalozene-250',
        'perfektni-vyzvy-1', 'perfektni-vyzvy-5', 'perfektni-vyzvy-25', 'perfektni-vyzvy-50', 'perfektni-vyzvy-100',
        'uroven-5', 'znalec', 'uroven-20', 'mudrc', 'uroven-50', 'uroven-65', 'uroven-80', 'uroven-100',
        'poznane-100', 'poznane-500', 'poznane-1000', 'poznane-3000', 'poznane-5000', 'poznane-10000',
        'vsestrannost-3', 'vsestrannost-6', 'vsestrannost-9', 'vsestrannost-12', 'vsestranny',
        'hvezdy-1', 'hvezdy-2', 'hvezdar', 'hvezdy-4', 'mistr-oboru',
        'vsechna-temata-1', 'vsechna-temata-2', 'vsechna-temata-3', 'vsechna-temata-4', 'vsechna-temata-5',
        'tema-zemepis-25', 'tema-zemepis-100', 'tema-zemepis-300', 'tema-zemepis-600', 'tema-zemepis-1000',
        'tema-vlajky-25', 'tema-vlajky-100', 'tema-vlajky-300', 'tema-vlajky-600', 'tema-vlajky-1000',
        'tema-historie-25', 'tema-historie-100', 'tema-historie-300', 'tema-historie-600', 'tema-historie-1000',
        'tema-mytologie-25', 'tema-mytologie-100', 'tema-mytologie-300', 'tema-mytologie-600', 'tema-mytologie-1000',
        'tema-biologie-25', 'tema-biologie-100', 'tema-biologie-300', 'tema-biologie-600', 'tema-biologie-1000',
        'tema-geologie-25', 'tema-geologie-100', 'tema-geologie-300', 'tema-geologie-600', 'tema-geologie-1000',
        'tema-chemie-25', 'tema-chemie-100', 'tema-chemie-300', 'tema-chemie-600', 'tema-chemie-1000',
        'tema-fyzika-25', 'tema-fyzika-100', 'tema-fyzika-300', 'tema-fyzika-600', 'tema-fyzika-1000',
        'tema-umeni-25', 'tema-umeni-100', 'tema-umeni-300', 'tema-umeni-600', 'tema-umeni-1000',
        'tema-architektura-25', 'tema-architektura-100', 'tema-architektura-300', 'tema-architektura-600', 'tema-architektura-1000',
        'tema-hudba-25', 'tema-hudba-100', 'tema-hudba-300', 'tema-hudba-600', 'tema-hudba-1000',
        'tema-literatura-25', 'tema-literatura-100', 'tema-literatura-300', 'tema-literatura-600', 'tema-literatura-1000',
        'tema-film-25', 'tema-film-100', 'tema-film-300', 'tema-film-600', 'tema-film-1000',
        'tema-sport-25', 'tema-sport-100', 'tema-sport-300', 'tema-sport-600', 'tema-sport-1000',
        'zbehly-zemepis-5', 'zbehly-zemepis', 'zbehly-zemepis-25', 'zbehly-zemepis-50', 'zbehly-zemepis-100',
        'zbehly-vlajky-5', 'zbehly-vlajky', 'zbehly-vlajky-25', 'zbehly-vlajky-50', 'zbehly-vlajky-100',
        'zbehly-historie-5', 'zbehly-historie', 'zbehly-historie-25', 'zbehly-historie-50', 'zbehly-historie-100',
        'zbehly-mytologie-5', 'zbehly-mytologie', 'zbehly-mytologie-25', 'zbehly-mytologie-50', 'zbehly-mytologie-100',
        'zbehly-biologie-5', 'zbehly-biologie', 'zbehly-biologie-25', 'zbehly-biologie-50', 'zbehly-biologie-100',
        'zbehly-geologie-5', 'zbehly-geologie', 'zbehly-geologie-25', 'zbehly-geologie-50', 'zbehly-geologie-100',
        'zbehly-chemie-5', 'zbehly-chemie', 'zbehly-chemie-25', 'zbehly-chemie-50', 'zbehly-chemie-100',
        'zbehly-fyzika-5', 'zbehly-fyzika', 'zbehly-fyzika-25', 'zbehly-fyzika-50', 'zbehly-fyzika-100',
        'zbehly-umeni-5', 'zbehly-umeni', 'zbehly-umeni-25', 'zbehly-umeni-50', 'zbehly-umeni-100',
        'zbehly-architektura-5', 'zbehly-architektura', 'zbehly-architektura-25', 'zbehly-architektura-50', 'zbehly-architektura-100',
        'zbehly-hudba-5', 'zbehly-hudba', 'zbehly-hudba-25', 'zbehly-hudba-50', 'zbehly-hudba-100',
        'zbehly-literatura-5', 'zbehly-literatura', 'zbehly-literatura-25', 'zbehly-literatura-50', 'zbehly-literatura-100',
        'zbehly-film-5', 'zbehly-film', 'zbehly-film-25', 'zbehly-film-50', 'zbehly-film-100',
        'zbehly-sport-5', 'zbehly-sport', 'zbehly-sport-25', 'zbehly-sport-50', 'zbehly-sport-100',
        'turnaj-ucast', 'turnaj-ctvrtfinale', 'turnaj-semifinale', 'turnaj-bronz', 'turnaj-stribro', 'turnaj-zlato',
        'turnaj-postupy-1', 'turnaj-postupy-5', 'turnaj-postupy-15', 'turnaj-postupy-30', 'turnaj-postupy-60',
        'tydenni-cile', 'tydenni-cile-5', 'tydenni-cile-10', 'tydenni-cile-20', 'tydenni-cile-52',
        -- Schéma 9: Kvíz dne, Bleskovka, Přežití, Ukaž na mapě, Odhadni a Seřaď
        'kviz-dne', 'kviz-dne-10', 'kviz-dne-50', 'kviz-dne-100', 'kviz-dne-365',
        'kviz-serie-3', 'kviz-tyden', 'kviz-serie-14', 'kviz-serie-30', 'kviz-serie-100',
        'kviz-perfekt', 'kviz-perfekt-5', 'kviz-perfekt-20', 'kviz-perfekt-50', 'kviz-perfekt-100',
        'bleskovka-8', 'bleskovka-12', 'bleskovka-16', 'bleskovka-20', 'bleskovka-25',
        'preziti-10', 'preziti-20', 'preziti-35', 'preziti-50', 'preziti-75',
        'mapa-5', 'mapa-25', 'mapa-100', 'mapa-250', 'mapa-500', 'odhad-5', 'odhad-25', 'odhad-100', 'odhad-250', 'odhad-500',
        'serad-5', 'serad-25', 'serad-100', 'serad-250', 'serad-500'
    ]::text[];
$$;

-- Klient nesmí přepsat rating ani počet ohodnocených her, měnit id a čas založení; XP jen roste (a má strop),
-- odznaky jen přibývají a jen z katalogu. Role postgres/service_role (triggery, správce) se tím neřídí.
create or replace function public.protect_rating() returns trigger
language plpgsql set search_path = public as $$
begin
    if current_user in ('authenticated', 'anon') then
        new.id := old.id;
        new.created_at := old.created_at;
        new.rating := old.rating;
        new.rated_games := old.rated_games;
        new.xp := greatest(old.xp, least(new.xp, 500000));
        new.badges := coalesce((select array_agg(b order by b) from (select distinct b from unnest(old.badges || new.badges) b where b = any (public.badge_catalog())) kept), '{}');
    end if;
    return new;
end;
$$;
drop trigger if exists profiles_protect_rating on public.profiles;
create trigger profiles_protect_rating before update on public.profiles for each row execute function public.protect_rating();

-- Ohodnocení výzvy: jakmile mají výsledek přesně dva hráči (tvůrce a soupeř), spočítá se ELO (K = 24).
-- Vítěz je ten s víc správnými, při shodě s víc body; shoda obojího = remíza. Třetí a další hráč s kódem už rating nemění.
-- Tytéž dva hráči si za 7 dní započítají nejvýš 3 výzvy (jinak se výzva zapíše se změnou 0), aby se rating nedal „farmit“.
create or replace function public.rate_challenge() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    other public.challenge_results%rowtype;
    a_id uuid; b_id uuid;
    ra integer; rb integer;
    score_a numeric; expected_a numeric;
    da integer; out_a text; out_b text;
    is_capped boolean;
begin
    perform pg_advisory_xact_lock(hashtext('rating:' || new.challenge_id));
    if (select count(*) from public.challenge_results where challenge_id = new.challenge_id) <> 2 then return null; end if;
    if exists (select 1 from public.rating_history where challenge_id = new.challenge_id) then return null; end if;
    select * into other from public.challenge_results where challenge_id = new.challenge_id and user_id <> new.user_id;
    if not found then return null; end if;
    -- A = ten, kdo výzvu dohrál první (stabilní pořadí), B = ten, kdo ji právě dohrál
    a_id := other.user_id; b_id := new.user_id;
    perform 1 from public.profiles where id in (a_id, b_id) order by id for update;
    select rating into ra from public.profiles where id = a_id;
    select rating into rb from public.profiles where id = b_id;
    if ra is null or rb is null then return null; end if;
    if other.correct <> new.correct then score_a := case when other.correct > new.correct then 1 else 0 end;
    elsif other.points <> new.points then score_a := case when other.points > new.points then 1 else 0 end;
    else score_a := 0.5; end if;
    is_capped := (select count(*) from public.rating_history where user_id = a_id and opponent_id = b_id and created_at > now() - interval '7 days') >= 3;
    expected_a := 1 / (1 + power(10::numeric, (rb - ra)::numeric / 400));
    da := case when is_capped then 0 else round(24 * (score_a - expected_a))::integer end;
    -- součet změn je nulový; rating neklesne pod 100
    da := greatest(da, 100 - ra);
    da := least(da, rb - 100);
    out_a := case when score_a = 1 then 'win' when score_a = 0 then 'loss' else 'draw' end;
    out_b := case when score_a = 1 then 'loss' when score_a = 0 then 'win' else 'draw' end;
    update public.profiles set rating = ra + da, rated_games = rated_games + 1 where id = a_id;
    update public.profiles set rating = rb - da, rated_games = rated_games + 1 where id = b_id;
    insert into public.rating_history (challenge_id, user_id, opponent_id, outcome, delta, rating_after, capped)
    values (new.challenge_id, a_id, b_id, out_a, da, ra + da, is_capped),
           (new.challenge_id, b_id, a_id, out_b, -da, rb - da, is_capped)
    on conflict do nothing;
    return null;
end;
$$;
drop trigger if exists challenge_results_rate on public.challenge_results;
create trigger challenge_results_rate after insert on public.challenge_results for each row execute function public.rate_challenge();
revoke all on function public.rate_challenge() from public, anon, authenticated;

-- Týdenní žebříček: top 20 podle součtu změn ratingu od pondělí 00:00 (Praha); při shodě víc výher, pak vyšší rating.
-- Vrací jen veřejné údaje hráče.
drop function if exists public.weekly_leaderboard();
create or replace function public.weekly_leaderboard() returns table (
    id uuid, display_name text, avatar text, color text, frame text, title_pref text, xp integer,
    rating integer, league text, week_delta integer, week_wins integer, week_games integer, owl text
)
language sql stable security definer set search_path = public as $$
    with week as (
        select h.user_id, sum(h.delta)::integer as delta, (count(*) filter (where h.outcome = 'win'))::integer as wins, count(*)::integer as games
        from public.rating_history h
        where h.created_at >= (date_trunc('week', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague')
        group by h.user_id
    )
    select p.id, p.display_name, p.avatar, p.color, p.frame, p.title_pref, p.xp, p.rating, public.rating_league(p.rating), w.delta, w.wins, w.games, p.owl
    from week w join public.profiles p on p.id = w.user_id
    where auth.uid() is not null
    order by w.delta desc, w.wins desc, p.rating desc, p.display_name
    limit 20;
$$;
revoke all on function public.weekly_leaderboard() from public, anon;
grant execute on function public.weekly_leaderboard() to authenticated;

-- ===== Oprávnění: jen to, co aplikace skutečně dělá =====
-- Pravidla řádků (RLS) hlídají řádky, ale ne TRUNCATE ani sloupce, proto se oprávnění zužují i tady.
revoke all on public.profiles, public.challenges, public.challenge_results, public.rating_history from anon, authenticated;
grant select on public.profiles, public.challenges, public.challenge_results, public.rating_history to authenticated;
grant update (display_name, avatar, color, xp, badges, blocked_topics, accepts_mix, frame, title_pref, owl) on public.profiles to authenticated;
grant insert on public.challenges, public.challenge_results to authenticated;
-- Pomocné funkce a triggerové funkce se přes API volat nemají
revoke all on function public.unique_display_name(text), public.handle_new_user(), public.check_challenge_topics(), public.limit_challenges(),
    public.stamp_result(), public.protect_rating() from public, anon, authenticated;

-- ===== Týdenní turnaje (vyřazovací pavouk, kolo = jeden den) =====
-- Turnaj se hraje od pondělí; mocnina dvou nejlepších přihlášených (max. 128, min. 8) hraje, ostatní dostanou zprávu. Každé kolo má jeden den (Praha),
-- ve dvojici postoupí ten s více správnými odpověďmi, pak s více body, pak s rychlejším časem; kdo kolo neodehraje, prohrává kontumačně,
-- a když neodehraje nikdo, postupuje dřívější přihlášený. Kola posouvá tournament_tick() (volá ji aplikace při otevření; volitelně i plánovač pg_cron).
create table if not exists public.tournaments (
    id uuid primary key default gen_random_uuid(),
    topic text not null default 'mix',
    week_start date not null,
    started_on date,
    capacity integer not null default 128,
    status text not null default 'open',
    size integer,
    rounds integer,
    seed text not null default substr(md5(random()::text), 1, 12),
    created_at timestamptz not null default now(),
    unique (topic, week_start)
);
alter table public.tournaments drop constraint if exists tournaments_status_list;
alter table public.tournaments add constraint tournaments_status_list check (status in ('open', 'running', 'finished', 'cancelled'));
alter table public.tournaments drop constraint if exists tournaments_capacity_range;
alter table public.tournaments add constraint tournaments_capacity_range check (capacity between 8 and 128);
alter table public.tournaments drop constraint if exists tournaments_topic_format;
alter table public.tournaments add constraint tournaments_topic_format check (topic ~ '^[a-z0-9,]{1,200}$');

create table if not exists public.tournament_entries (
    tournament_id uuid not null references public.tournaments (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    joined_at timestamptz not null default now(),
    status text not null default 'registered',
    place integer,
    primary key (tournament_id, user_id)
);
alter table public.tournament_entries drop constraint if exists tournament_entries_status_list;
alter table public.tournament_entries add constraint tournament_entries_status_list check (status in ('registered', 'playing', 'out', 'excluded', 'finished'));
create index if not exists tournament_entries_user_idx on public.tournament_entries (user_id, joined_at desc);

create table if not exists public.tournament_matches (
    id uuid primary key default gen_random_uuid(),
    tournament_id uuid not null references public.tournaments (id) on delete cascade,
    round integer not null,
    slot integer not null,
    third boolean not null default false,
    p1 uuid not null references public.profiles (id) on delete cascade,
    p2 uuid not null references public.profiles (id) on delete cascade,
    winner uuid references public.profiles (id) on delete set null,
    decided_by text,
    unique (tournament_id, round, slot, third)
);
alter table public.tournament_matches drop constraint if exists tournament_matches_decided_list;
alter table public.tournament_matches add constraint tournament_matches_decided_list check (decided_by is null or decided_by in ('played', 'walkover', 'earlier'));
create index if not exists tournament_matches_user_idx on public.tournament_matches (p1, p2);

create table if not exists public.tournament_results (
    match_id uuid not null references public.tournament_matches (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    correct integer,
    points integer,
    time_ms integer,
    primary key (match_id, user_id)
);

create table if not exists public.tournament_notices (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    tournament_id uuid references public.tournaments (id) on delete cascade,
    kind text not null,
    detail text,
    created_at timestamptz not null default now(),
    seen boolean not null default false
);
create index if not exists tournament_notices_user_idx on public.tournament_notices (user_id, seen, created_at desc);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_results enable row level security;
alter table public.tournament_notices enable row level security;
drop policy if exists "turnaje: čtení pro přihlášené" on public.tournaments;
create policy "turnaje: čtení pro přihlášené" on public.tournaments for select to authenticated using (true);
drop policy if exists "turnaje: přihlášky vidí přihlášení" on public.tournament_entries;
create policy "turnaje: přihlášky vidí přihlášení" on public.tournament_entries for select to authenticated using (true);
drop policy if exists "turnaje: zápasy vidí přihlášení" on public.tournament_matches;
create policy "turnaje: zápasy vidí přihlášení" on public.tournament_matches for select to authenticated using (true);
-- Výsledek soupeře se nesmí ukázat dřív, než je zápas rozhodnutý (jinak by druhý hráč věděl, kolik má překonat)
drop policy if exists "turnaje: výsledky" on public.tournament_results;
create policy "turnaje: výsledky" on public.tournament_results for select to authenticated using (
    user_id = auth.uid() or exists (select 1 from public.tournament_matches m where m.id = match_id and m.winner is not null));
drop policy if exists "turnaje: vlastní zprávy" on public.tournament_notices;
create policy "turnaje: vlastní zprávy" on public.tournament_notices for select to authenticated using (user_id = auth.uid());

-- Den kola (Praha)
-- (nastavení mudrlant.test_today používají jen testy; z API ho klient nastavit nemůže)
create or replace function public.tournament_today() returns date
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_today', true), '')::date, (now() at time zone 'Europe/Prague')::date)
$$;

create or replace function public.tournament_notice(uid uuid, tid uuid, notice_kind text, notice_detail text default null) returns void
language sql security definer set search_path = public as $$
    insert into public.tournament_notices (user_id, tournament_id, kind, detail) values (uid, tid, notice_kind, notice_detail);
$$;

-- Vítěz zápasu: víc správných, víc bodů, rychlejší čas, dřívější přihlášení
create or replace function public.tournament_pick_winner(m public.tournament_matches, force boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    r1 public.tournament_results; r2 public.tournament_results;
    d1 boolean; d2 boolean; j1 timestamptz; j2 timestamptz; win uuid; how text;
begin
    select * into r1 from public.tournament_results where match_id = m.id and user_id = m.p1 and finished_at is not null;
    select * into r2 from public.tournament_results where match_id = m.id and user_id = m.p2 and finished_at is not null;
    d1 := r1.match_id is not null; d2 := r2.match_id is not null;
    select joined_at into j1 from public.tournament_entries where tournament_id = m.tournament_id and user_id = m.p1;
    select joined_at into j2 from public.tournament_entries where tournament_id = m.tournament_id and user_id = m.p2;
    if d1 and d2 then
        how := 'played';
        win := case
            when r1.correct <> r2.correct then case when r1.correct > r2.correct then m.p1 else m.p2 end
            when r1.points <> r2.points then case when r1.points > r2.points then m.p1 else m.p2 end
            when r1.time_ms <> r2.time_ms then case when r1.time_ms < r2.time_ms then m.p1 else m.p2 end
            else case when j1 <= j2 then m.p1 else m.p2 end end;
    elsif force and (d1 or d2) then
        how := 'walkover'; win := case when d1 then m.p1 else m.p2 end;
    elsif force then
        how := 'earlier'; win := case when j1 <= j2 then m.p1 else m.p2 end;
    else
        return null;
    end if;
    update public.tournament_matches set winner = win, decided_by = how where id = m.id;
    if how <> 'played' then
        perform public.tournament_notice(case when win = m.p1 then m.p2 else m.p1 end, m.tournament_id, 'eliminated_noplay', null);
    end if;
    return win;
end;
$$;

-- Posune turnaj: rozhodne zápasy po termínu, založí další kolo, nebo turnaj uzavře (smyčka dožene i vynechané dny)
create or replace function public.tournament_progress(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
    t public.tournaments; cur integer; m public.tournament_matches; today date := public.tournament_today(); changed boolean := true;
    pending integer; w1 uuid; w2 uuid; l1 uuid; l2 uuid; slot_no integer; e record;
begin
    select * into t from public.tournaments where id = tid for update;
    if t.status <> 'running' then return; end if;
    while changed loop
        changed := false;
        select max(round) into cur from public.tournament_matches where tournament_id = tid;
        -- po termínu (konec dne kola) se zápasy rozhodnou i bez odehrání
        for m in select * from public.tournament_matches where tournament_id = tid and round = cur and winner is null loop
            if t.started_on + (cur - 1) < today then
                perform public.tournament_pick_winner(m, true); changed := true;
            else
                perform public.tournament_pick_winner(m, false);
            end if;
        end loop;
        select count(*) into pending from public.tournament_matches where tournament_id = tid and round = cur and winner is null;
        if pending > 0 then exit; end if;
        -- poražení vypadávají (místo podle kola); semifinalisté hrají o bronz
        for m in select * from public.tournament_matches where tournament_id = tid and round = cur loop
            if cur < t.rounds - 1 then
                update public.tournament_entries set status = 'out', place = (t.size >> cur) + 1
                    where tournament_id = tid and user_id = (case when m.winner = m.p1 then m.p2 else m.p1 end);
            end if;
        end loop;
        if cur < t.rounds then
            if cur = t.rounds - 1 then
                -- semifinále: vítězové do finále, poražení do zápasu o 3. místo
                select winner into w1 from public.tournament_matches where tournament_id = tid and round = cur and slot = 1 and not third;
                select winner into w2 from public.tournament_matches where tournament_id = tid and round = cur and slot = 2 and not third;
                select case when winner = p1 then p2 else p1 end into l1 from public.tournament_matches where tournament_id = tid and round = cur and slot = 1 and not third;
                select case when winner = p1 then p2 else p1 end into l2 from public.tournament_matches where tournament_id = tid and round = cur and slot = 2 and not third;
                insert into public.tournament_matches (tournament_id, round, slot, third, p1, p2) values (tid, cur + 1, 1, false, w1, w2), (tid, cur + 1, 1, true, l1, l2);
            else
                for slot_no in 1 .. (t.size >> (cur + 1)) loop
                    select winner into w1 from public.tournament_matches where tournament_id = tid and round = cur and slot = 2 * slot_no - 1 and not third;
                    select winner into w2 from public.tournament_matches where tournament_id = tid and round = cur and slot = 2 * slot_no and not third;
                    insert into public.tournament_matches (tournament_id, round, slot, third, p1, p2) values (tid, cur + 1, slot_no, false, w1, w2);
                end loop;
            end if;
            changed := true;
        else
            -- konec: pořadí 1. až 4., ostatní už mají místo z vypadnutí
            for e in select m2.winner as w, case when m2.winner = m2.p1 then m2.p2 else m2.p1 end as l, m2.third
                    from public.tournament_matches m2 where m2.tournament_id = tid and m2.round = cur loop
                update public.tournament_entries set place = case when e.third then 3 else 1 end where tournament_id = tid and user_id = e.w;
                update public.tournament_entries set place = case when e.third then 4 else 2 end where tournament_id = tid and user_id = e.l;
            end loop;
            -- přesná místa uvnitř skupiny vypadlých: víc bodů celkem, při shodě menší celkový čas, pak dřívější přihlášení
            with totals as (
                select te.user_id, te.place as base, te.joined_at, coalesce(sum(tr.points), 0) as pts, coalesce(sum(tr.time_ms), 0) as tms
                from public.tournament_entries te
                left join public.tournament_matches tm on tm.tournament_id = te.tournament_id and te.user_id in (tm.p1, tm.p2)
                left join public.tournament_results tr on tr.match_id = tm.id and tr.user_id = te.user_id and tr.finished_at is not null
                where te.tournament_id = tid and te.status in ('playing', 'out') and te.place > 4
                group by te.user_id, te.place, te.joined_at
            ), ranked as (
                select user_id, base + (row_number() over (partition by base order by pts desc, tms asc, joined_at asc, user_id) - 1)::integer as exact
                from totals
            )
            update public.tournament_entries ue set place = ranked.exact from ranked where ue.tournament_id = tid and ue.user_id = ranked.user_id;
            update public.tournament_entries set status = 'finished' where tournament_id = tid and status in ('playing', 'out');
            update public.tournaments set status = 'finished' where id = tid;
            for e in select user_id, place from public.tournament_entries where tournament_id = tid and place is not null loop
                perform public.tournament_notice(e.user_id, tid, 'result', e.place::text);
            end loop;
            exit;
        end if;
    end loop;
end;
$$;

-- Spustí turnaj: vybere nejvyšší mocninu dvou přihlášených (v pořadí přihlášení), ostatním pošle zprávu; pod 8 přihlášených turnaj ruší
drop function if exists public.tournament_start(uuid);
create or replace function public.tournament_start(tid uuid, force boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
    t public.tournaments; n integer; s integer := 8; k integer := 3; e record; i integer;
    ids uuid[];
begin
    select * into t from public.tournaments where id = tid for update;
    if t.status <> 'open' then return; end if;
    select count(*) into n from public.tournament_entries where tournament_id = tid;
    if n < 8 then
        update public.tournaments set status = 'cancelled' where id = tid;
        for e in select user_id from public.tournament_entries where tournament_id = tid loop
            perform public.tournament_notice(e.user_id, tid, 'cancelled', n::text);
        end loop;
        return;
    end if;
    while s * 2 <= least(n, t.capacity) loop s := s * 2; k := k + 1; end loop;
    update public.tournament_entries set status = 'playing'
        where tournament_id = tid and user_id in (select user_id from public.tournament_entries where tournament_id = tid order by joined_at, user_id limit s);
    for e in select user_id from public.tournament_entries where tournament_id = tid and status = 'registered' loop
        perform public.tournament_notice(e.user_id, tid, 'excluded_full', s::text);
    end loop;
    update public.tournament_entries set status = 'excluded' where tournament_id = tid and status = 'registered';
    update public.tournaments set status = 'running', size = s, rounds = k, started_on = case when force then public.tournament_today() else greatest(t.week_start, public.tournament_today()) end where id = tid;
    -- náhodné nasazení do pavouka (podle id hráče a semínka turnaje)
    select array_agg(user_id order by md5(user_id::text || t.seed)) into ids from public.tournament_entries where tournament_id = tid and status = 'playing';
    for i in 1 .. s / 2 loop
        insert into public.tournament_matches (tournament_id, round, slot, p1, p2) values (tid, 1, i, ids[2 * i - 1], ids[2 * i]);
    end loop;
end;
$$;

-- Volá ji aplikace (při otevření) i plánovač: otevře přihlášky na další týden, spustí turnaje, jejichž týden začal, a posune běžící
create or replace function public.tournament_tick() returns void
language plpgsql security definer set search_path = public as $$
declare today date := public.tournament_today(); next_monday date; t record;
begin
    perform pg_advisory_xact_lock(74610);
    next_monday := today + (8 - extract(isodow from today)::integer);
    insert into public.tournaments (topic, week_start) values ('mix', next_monday) on conflict (topic, week_start) do nothing;
    for t in select id from public.tournaments where status = 'open' and week_start <= today order by week_start loop
        perform public.tournament_start(t.id);
    end loop;
    for t in select id from public.tournaments where status = 'running' loop
        perform public.tournament_progress(t.id);
    end loop;
end;
$$;

create or replace function public.tournament_join(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tournaments; n integer;
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.tournament_tick();
    select * into t from public.tournaments where id = tid for update;
    if t.id is null or t.status <> 'open' or t.week_start <= public.tournament_today() then raise exception 'Přihlášky do tohoto turnaje jsou zavřené.' using errcode = '22023'; end if;
    select count(*) into n from public.tournament_entries where tournament_id = tid;
    if exists (select 1 from public.tournament_entries where tournament_id = tid and user_id = auth.uid()) then return; end if;
    if n >= t.capacity then raise exception 'Turnaj je plný.' using errcode = '22023'; end if;
    insert into public.tournament_entries (tournament_id, user_id) values (tid, auth.uid());
end;
$$;

create or replace function public.tournament_leave(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    delete from public.tournament_entries e using public.tournaments t
        where e.tournament_id = tid and e.user_id = auth.uid() and t.id = e.tournament_id and t.status = 'open';
end;
$$;

-- Začátek zápasu: jen účastník, jen v den kola, jen jednou (čas se měří na serveru od tohoto okamžiku)
create or replace function public.tournament_start_match(mid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.tournament_matches; t public.tournaments;
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.tournament_tick();
    select * into m from public.tournament_matches where id = mid;
    if m.id is null or auth.uid() not in (m.p1, m.p2) then raise exception 'Tohle není tvůj zápas.' using errcode = '42501'; end if;
    select * into t from public.tournaments where id = m.tournament_id;
    if m.winner is not null or t.status <> 'running' then raise exception 'Zápas už je rozhodnutý.' using errcode = '22023'; end if;
    if t.started_on + (m.round - 1) <> public.tournament_today() then raise exception 'Kolo se dnes nehraje.' using errcode = '22023'; end if;
    if exists (select 1 from public.tournament_results where match_id = mid and user_id = auth.uid()) then raise exception 'Kolo jsi už začal.' using errcode = '22023'; end if;
    insert into public.tournament_results (match_id, user_id) values (mid, auth.uid());
end;
$$;

-- Konec zápasu: počet správných a body spočítá server z odpovědí uložených přes tournament_answer_save (níž v souboru; tělo se kontroluje až při volání).
-- Bez všech deseti uložených odpovědí výsledek zapsat nejde; čísla od klienta (correct_count, point_count) zůstávají v podpisu kvůli starším aplikacím, nepoužijí se.
create or replace function public.tournament_finish_match(mid uuid, correct_count integer, point_count integer) returns void
language plpgsql security definer set search_path = public as $$
declare m public.tournament_matches; r public.tournament_results; answered integer; good integer; total integer;
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into m from public.tournament_matches where id = mid;
    select * into r from public.tournament_results where match_id = mid and user_id = auth.uid() for update;
    if m.id is null or r.match_id is null or r.finished_at is not null or m.winner is not null then raise exception 'Výsledek jde zapsat jen jednou.' using errcode = '22023'; end if;
    select count(*)::integer, (count(*) filter (where a.correct))::integer, coalesce(sum(a.points), 0)::integer into answered, good, total
        from public.tournament_answers a where a.match_id = mid and a.user_id = auth.uid();
    -- 10 otázek na zápas (QUESTIONS v tournament.js)
    if answered < 10 then raise exception 'Zápas ještě není dohraný: nejdřív se musí uložit všechny odpovědi.' using errcode = '22023'; end if;
    update public.tournament_results set finished_at = now(), correct = good, points = total,
        time_ms = greatest(0, least(extract(epoch from now() - started_at) * 1000, 3600000))::integer
        where match_id = mid and user_id = auth.uid();
    perform public.tournament_progress(m.tournament_id);
end;
$$;

-- Moje turnajové údaje do odznaků: nejlepší umístění (1 = hrál, 2 = čtvrtfinále, 3 = semifinále, 4 = bronz, 5 = stříbro, 6 = vítěz) a počet vyhraných zápasů
create or replace function public.my_tournament_stats() returns table (best integer, wins integer, played integer)
language sql stable security definer set search_path = public as $$
    select coalesce(max(case when e.place = 1 then 6 when e.place = 2 then 5 when e.place = 3 then 4 when e.place <= 4 then 3 when e.place <= 8 then 2 else 1 end), 0)::integer,
        (select count(*) from public.tournament_matches m where m.winner = auth.uid())::integer,
        count(*)::integer
    from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
    where e.user_id = auth.uid() and e.status in ('playing', 'out', 'finished') and t.status in ('running', 'finished');
$$;

create or replace function public.tournament_notices_seen(ids bigint[]) returns void
language sql security definer set search_path = public as $$
    update public.tournament_notices set seen = true where user_id = auth.uid() and id = any (ids);
$$;

revoke all on public.tournaments, public.tournament_entries, public.tournament_matches, public.tournament_results, public.tournament_notices from anon, authenticated;
grant select on public.tournaments, public.tournament_entries, public.tournament_matches, public.tournament_results, public.tournament_notices to authenticated;
revoke all on function public.tournament_today(), public.tournament_notice(uuid, uuid, text, text), public.tournament_pick_winner(public.tournament_matches, boolean),
    public.tournament_progress(uuid), public.tournament_start(uuid, boolean) from public, anon, authenticated;
revoke all on function public.tournament_tick(), public.tournament_join(uuid), public.tournament_leave(uuid), public.tournament_start_match(uuid),
    public.tournament_finish_match(uuid, integer, integer), public.my_tournament_stats(), public.tournament_notices_seen(bigint[]) from public, anon;
grant execute on function public.tournament_tick(), public.tournament_join(uuid), public.tournament_leave(uuid), public.tournament_start_match(uuid),
    public.tournament_finish_match(uuid, integer, integer), public.my_tournament_stats(), public.tournament_notices_seen(bigint[]) to authenticated;

-- ===== Vývojářské nástroje turnajů (boti) =====
-- Smí je volat jen hráč zapsaný v dev_admins (zapíše se ručně v SQL Editoru, viz docs/SUPABASE.md); boti jsou skutečné řádky v auth.users s e-mailem bot-…@bots.invalid.
create table if not exists public.dev_admins (user_id uuid primary key references public.profiles (id) on delete cascade);
alter table public.dev_admins enable row level security;
revoke all on public.dev_admins from anon, authenticated;

create or replace function public.dev_check() returns void
language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null or not exists (select 1 from public.dev_admins where user_id = auth.uid()) then
        raise exception 'Vývojářské nástroje turnajů nejsou pro tento účet zapnuté (viz docs/SUPABASE.md, dev_admins).' using errcode = '42501';
    end if;
end;
$$;

create or replace function public.dev_is_bot(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from auth.users u where u.id = uid and u.email like 'bot-%@bots.invalid');
$$;

-- Boti odehrají rozehraná kola: střední úroveň (každý bot má vlastní úspěšnost 45–80 %, 10 otázek, čas 30–90 s)
create or replace function public.dev_bots_play(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur integer; m public.tournament_matches; uid uuid; p numeric; c integer; t public.tournaments;
begin
    select * into t from public.tournaments where id = tid;
    select max(round) into cur from public.tournament_matches where tournament_id = tid;
    -- boti hrají jen kolo, jehož den už nastal (další kolo čeká na svůj den)
    if cur is null or t.started_on + (cur - 1) > public.tournament_today() then return; end if;
    for m in select * from public.tournament_matches where tournament_id = tid and round = cur and winner is null loop
        foreach uid in array array[m.p1, m.p2] loop
            if public.dev_is_bot(uid) and not exists (select 1 from public.tournament_results where match_id = m.id and user_id = uid and finished_at is not null) then
                p := 0.45 + 0.35 * (('x' || substr(md5(uid::text), 1, 6))::bit(24)::integer % 1000) / 1000.0;
                select count(*)::integer into c from generate_series(1, 10) where random() < p;
                insert into public.tournament_results (match_id, user_id, started_at, finished_at, correct, points, time_ms)
                    values (m.id, uid, now(), now(), c, least(100, c * 3 + (random() * 4)::integer), 30000 + (random() * 60000)::integer)
                    on conflict (match_id, user_id) do update set finished_at = now(), correct = excluded.correct, points = excluded.points, time_ms = excluded.time_ms;
            end if;
        end loop;
    end loop;
    perform public.tournament_progress(tid);
end;
$$;

create or replace function public.dev_tournament_add_bots(tid uuid, how_many integer default 31) returns integer
language plpgsql security definer set search_path = public as $$
declare t public.tournaments; n integer; i integer; uid uuid; made integer := 0;
    names text[] := array['Adam', 'Barbora', 'Cyril', 'Dana', 'Emil', 'Fanda', 'Gita', 'Honza', 'Ivana', 'Jirka', 'Klára', 'Libor', 'Marta', 'Nikola', 'Ondra', 'Petra', 'Radek', 'Soňa', 'Tomáš', 'Uršula', 'Viktor', 'Wanda', 'Xaver', 'Yvona', 'Zdeněk', 'Alena', 'Bořek', 'Cecílie', 'David', 'Eliška', 'Filip', 'Gabriela', 'Hugo', 'Irena', 'Jakub', 'Kamila'];
    colors text[] := array['emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo'];
begin
    perform public.dev_check();
    select * into t from public.tournaments where id = tid for update;
    if t.id is null or t.status <> 'open' then raise exception 'Boti jdou přidat jen do turnaje s otevřenými přihláškami.' using errcode = '22023'; end if;
    select count(*) into n from public.tournament_entries where tournament_id = tid;
    how_many := least(greatest(how_many, 0), t.capacity - n, 127);
    for i in 1 .. how_many loop
        uid := gen_random_uuid();
        insert into auth.users (id, email, raw_user_meta_data) values (uid, 'bot-' || uid || '@bots.invalid', jsonb_build_object('full_name', 'Bot ' || names[1 + (random() * (array_length(names, 1) - 1))::integer]));
        update public.profiles set avatar = '🤖', color = colors[1 + (random() * 7)::integer] where id = uid;
        insert into public.tournament_entries (tournament_id, user_id, joined_at) values (tid, uid, now() + i * interval '1 millisecond');
        made := made + 1;
    end loop;
    return made;
end;
$$;

create or replace function public.dev_tournament_start_now(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
    perform public.dev_check();
    perform public.tournament_start(tid, true);
    perform public.dev_bots_play(tid);
end;
$$;

-- Skok na další kolo: boti dohrají kolo, termín kola uplyne (nehrající dostane kontumaci), vznikne další kolo a boti ho hned odehrají
create or replace function public.dev_tournament_next_round(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tournaments;
begin
    perform public.dev_check();
    select * into t from public.tournaments where id = tid for update;
    if t.id is null or t.status <> 'running' then raise exception 'Turnaj neběží.' using errcode = '22023'; end if;
    perform public.dev_bots_play(tid);
    update public.tournaments set started_on = started_on - 1 where id = tid;
    perform public.tournament_progress(tid);
    perform public.dev_bots_play(tid);
end;
$$;

-- Smaže všechny boty; turnaje, které už běžely nebo skončily s boty, se smažou celé (jejich pavouk by bez botů nedával smysl), otevřené turnaje přijdou jen o boty
create or replace function public.dev_tournament_clear_bots() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
    perform public.dev_check();
    delete from public.tournaments where status <> 'open' and id in (select e.tournament_id from public.tournament_entries e where public.dev_is_bot(e.user_id));
    delete from auth.users where email like 'bot-%@bots.invalid';
    get diagnostics removed = row_count;
    return removed;
end;
$$;

-- Smaže odehrané (běžící, skončené, zrušené) turnaje, ať jde zkoušet znovu; tick hned založí turnaj s otevřenými přihláškami na příští pondělí
create or replace function public.dev_tournament_reset() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
    perform public.dev_check();
    delete from public.tournaments where status <> 'open';
    get diagnostics removed = row_count;
    perform public.tournament_tick();
    return removed;
end;
$$;

revoke all on function public.dev_check(), public.dev_is_bot(uuid), public.dev_bots_play(uuid) from public, anon, authenticated;
revoke all on function public.dev_tournament_add_bots(uuid, integer), public.dev_tournament_start_now(uuid), public.dev_tournament_next_round(uuid), public.dev_tournament_clear_bots(), public.dev_tournament_reset() from public, anon;
grant execute on function public.dev_tournament_add_bots(uuid, integer), public.dev_tournament_start_now(uuid), public.dev_tournament_next_round(uuid), public.dev_tournament_clear_bots(), public.dev_tournament_reset() to authenticated;

-- ===== Web push: upozornění na turnaje a výzvy =====
-- Odběr (endpoint + klíče) si uloží prohlížeč hráče (push.js); odesílá GitHub Actions (scripts/send-push.mjs): zavolá push_due(secret),
-- pošle notifikace a zapíše push_mark(...). Tajemství push_cron leží jen v app_secrets (žádný přístup přes API), takže veřejný klíč z config.js nic nevyčte.
-- Workflow běží podle hodinového plánu GitHubu (nespolehlivě) a navíc ho spouští sama databáze: push_kick() (pg_cron každou minutu, pg_net) zavolá
-- GitHub API, jakmile je co poslat (viz níž a docs/SUPABASE.md, Okamžité odesílání upozornění).
create table if not exists public.push_subscriptions (
    endpoint text primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    p256dh text not null,
    auth text not null,
    created_at timestamptz not null default now(),
    last_ok timestamptz,
    fails integer not null default 0
);
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_format;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_format check (char_length(endpoint) between 16 and 1500 and endpoint ~ '^https://[^\s"''<>\\]+$');
alter table public.push_subscriptions drop constraint if exists push_subscriptions_keys_format;
alter table public.push_subscriptions add constraint push_subscriptions_keys_format check (p256dh ~ '^[A-Za-z0-9_=-]{60,200}$' and auth ~ '^[A-Za-z0-9_=-]{16,64}$');
alter table public.push_subscriptions drop constraint if exists push_subscriptions_fails_range;
alter table public.push_subscriptions add constraint push_subscriptions_fails_range check (fails between 0 and 100);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push: vlastní odběry" on public.push_subscriptions;
create policy "push: vlastní odběry" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists "push: vlastní zápis" on public.push_subscriptions;
create policy "push: vlastní zápis" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "push: vlastní smazání" on public.push_subscriptions;
create policy "push: vlastní smazání" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- Co hráč chce dostávat (výchozí všechno); vypnutí odběru v aplikaci maže řádky push_subscriptions, tyhle sloupce jsou jemnější volba
alter table public.profiles add column if not exists push_tournament boolean not null default true;
alter table public.profiles add column if not exists push_challenge boolean not null default true;
grant update (push_tournament, push_challenge) on public.profiles to authenticated;

-- Odběr přes funkci: stejný endpoint (totéž zařízení) přejde na právě přihlášeného hráče a počítadlo chyb se vynuluje; nejvýš 10 zařízení na hráče
drop function if exists public.push_subscribe(text, text, text);
create or replace function public.push_subscribe(endpoint_url text, key_p256dh text, key_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if (select count(*) from public.push_subscriptions s where s.user_id = auth.uid() and s.endpoint <> endpoint_url) >= 10 then
        delete from public.push_subscriptions s where s.endpoint in (select s2.endpoint from public.push_subscriptions s2 where s2.user_id = auth.uid() order by coalesce(s2.last_ok, s2.created_at) limit 1);
    end if;
    insert into public.push_subscriptions as s (endpoint, user_id, p256dh, auth) values (endpoint_url, auth.uid(), key_p256dh, key_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, fails = 0, created_at = now();
end;
$$;

-- Tajemství pro odesílatele (GitHub Actions). Řádek 'push_cron' vložíš ručně v SQL Editoru (docs/SUPABASE.md); přes API se tabulka nedá ani číst.
-- Okamžité odesílání (push_kick) tu má token GitHubu 'github_token' a volitelně 'github_repo' (vlastník/repozitář, výchozí taronwho/geografie-kviz).
create table if not exists public.app_secrets (
    name text primary key check (name ~ '^[a-z_]{1,40}$'),
    value text not null check (char_length(value) between 16 and 200)
);
-- Krátký název repozitáře (např. jan/kviz) je výjimka z minimální délky; tvar vlastník/repozitář hlídá i push_kick
alter table public.app_secrets drop constraint if exists app_secrets_value_check;
alter table public.app_secrets add constraint app_secrets_value_check check (char_length(value) between 16 and 200
    or (name = 'github_repo' and value ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'));
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from public, anon, authenticated;

-- Odeslané notifikace (klíč = druh:id:hráč[:den:část dne]); push_due už odeslané nevrací, staré řádky maže push_mark
create table if not exists public.push_sent (
    dedupe_key text primary key,
    user_id uuid,
    kind text,
    sent_at timestamptz not null default now()
);
create index if not exists push_sent_user_idx on public.push_sent (user_id, kind, sent_at desc);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from public, anon, authenticated;

-- Zkušební upozornění z vývojářského režimu (dev_push_test, jen dev_admins): nejvýš jedno čekající na účet. push_due ho vrátí (druh 'test'),
-- odesílač pošle a push_mark řádek smaže; nevyřízené se po 24 hodinách zahodí. Přes API se tabulka nedá číst ani zapisovat.
create table if not exists public.push_tests (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    requested_at timestamptz not null default now()
);
alter table public.push_tests enable row level security;
revoke all on public.push_tests from public, anon, authenticated;
-- Klíč zkušební zprávy (test:čas v ms:hráč) – push_mark z něj pozná hráče (3. část) a smaže jen tu žádost, která se opravdu odeslala
create or replace function public.push_test_key(uid uuid, at timestamptz) returns text
language sql stable as $$ select 'test:' || floor(extract(epoch from at) * 1000)::bigint || ':' || uid $$;

-- Ověření tajemství: porovnávají se otisky (md5) obou hodnot, takže shoda prvních znaků nic neprozradí
create or replace function public.push_check_secret(secret text) returns void
language plpgsql security definer set search_path = public as $$
declare stored text;
begin
    select value into stored from public.app_secrets where name = 'push_cron';
    if stored is null then raise exception 'Tajemství push_cron v app_secrets chybí (viz docs/SUPABASE.md).' using errcode = '42501'; end if;
    if secret is null or md5(coalesce(secret, '')) <> md5(stored) then
        raise exception 'Neplatné tajemství.' using errcode = '42501';
    end if;
end;
$$;

-- Část dne (Praha): 'rano' do 17:00, pak 'vecer' – turnajová připomínka přijde nejvýš dvakrát denně. (mudrlant.test_hour používají jen testy.)
create or replace function public.push_day_part() returns text
language sql stable set search_path = public as $$
    select case when coalesce(nullif(current_setting('mudrlant.test_hour', true), '')::integer, extract(hour from now() at time zone 'Europe/Prague')::integer) < 17 then 'rano' else 'vecer' end
$$;

-- Název kola podle počtu hráčů v kole (jako tournament.js)
create or replace function public.push_round_name(size integer, round integer, third boolean) returns text
language sql immutable as $$
    select case when third then 'zápas o 3. místo' else
        case greatest(2, coalesce(size, 2) >> greatest(coalesce(round, 1) - 1, 0))
            when 128 then '1. kolo' when 64 then '2. kolo' when 32 then 'šestnáctifinále' when 16 then 'osmifinále'
            when 8 then 'čtvrtfinále' when 4 then 'semifinále' when 2 then 'finále' else 'kolo' end end
$$;

-- Co poslat: (a) dnešní neodehraný turnajový zápas, (b) nevyřízená příchozí výzva mladší než 3 dny a výsledek výzvy, kterou hráč založil, (c) nepřečtená zpráva o turnaji.
-- Jeden řádek na odběr (zařízení); z každého druhu nejvýš jedna věc na hráče a běh a nic, co téhož druhu dostal v poslední hodině.
-- push_pending() je interní (bez ověření tajemství a bez posunu turnajů): totéž, co by teď vrátilo push_due, a totéž, podle čeho
-- push_kick pozná, že je co poslat – pravidla jsou tak na jednom místě. Práva volajícího (spouští ji jen push_due a push_kick), přes API nejde.
create or replace function public.push_pending() returns table (
    user_id uuid, endpoint text, p256dh text, auth text, kind text, title text, body text, url text, dedupe_key text
)
language plpgsql stable set search_path = public as $$
declare today date := public.tournament_today(); part text := public.push_day_part();
begin
    return query
    with items as (
        select m.p as user_id, 'tournament'::text as kind,
            'Turnaj: dnes hraješ ' || public.push_round_name(t.size, m.round, m.third) as title,
            'Soupeř: ' || coalesce(op.display_name, 'Hráč') || '. Kolo musíš odehrát do půlnoci.' as body,
            './?tab=multi'::text as url,
            'tour:' || m.id || ':' || m.p || ':' || today || ':' || part as dedupe_key, m.id::text as sort_at
        from (
            select mm.id, mm.tournament_id, mm.round, mm.third, mm.p1 as p, mm.p2 as other from public.tournament_matches mm where mm.winner is null
            union all
            select mm.id, mm.tournament_id, mm.round, mm.third, mm.p2, mm.p1 from public.tournament_matches mm where mm.winner is null
        ) m
        join public.tournaments t on t.id = m.tournament_id and t.status = 'running' and t.started_on + (m.round - 1) = today
        join public.profiles me on me.id = m.p and me.push_tournament
        left join public.profiles op on op.id = m.other
        where not exists (select 1 from public.tournament_results r where r.match_id = m.id and r.user_id = m.p)
        union all
        select c.invited_id, 'challenge', coalesce(cr.display_name, 'Hráč') || ' tě vyzývá',
            'Výzva na ' || c.count || ' otázek čeká v aplikaci. Zahraj si ji, než vyprší.', './?tab=multi',
            'chal:' || c.id || ':' || c.invited_id, c.created_at::text
        from public.challenges c
        join public.profiles me on me.id = c.invited_id and me.push_challenge
        left join public.profiles cr on cr.id = c.creator_id
        where c.invited_id is not null and c.created_at > now() - interval '3 days'
            and not exists (select 1 from public.challenge_results r where r.challenge_id = c.id and r.user_id = c.invited_id)
        union all
        select c.creator_id, 'challenge', coalesce(op.display_name, 'Hráč') || ' odehrál tvoji výzvu',
            'Dal ' || r.correct || ' z ' || c.count || ' správně. Podívej se, jak jsi na tom ty.', './?tab=multi',
            'chalr:' || c.id || ':' || c.creator_id, r.finished_at::text
        from public.challenges c
        join public.challenge_results r on r.challenge_id = c.id and r.user_id = c.invited_id
        join public.profiles me on me.id = c.creator_id and me.push_challenge
        left join public.profiles op on op.id = c.invited_id
        where c.invited_id is not null and c.invited_id <> c.creator_id and r.finished_at > now() - interval '3 days'
        union all
        select n.user_id, 'notice',
            case n.kind when 'excluded_full' then 'Turnaj bez tebe' when 'cancelled' then 'Turnaj se zrušil' when 'eliminated_noplay' then 'Vypadl jsi z turnaje' else 'Turnaj skončil' end,
            case n.kind
                when 'excluded_full' then 'Hrají jen nejdřív přihlášení' || case when n.detail ~ '^\d{1,3}$' then ' (' || n.detail || ' hráčů)' else '' end || ', tentokrát nehraješ. Do příštího se přihlas hned při otevření přihlášek.'
                when 'cancelled' then 'Přihlásilo se ' || case when n.detail ~ '^\d{1,3}$' then 'jen ' || n.detail else 'málo' end || ' hráčů, potřeba je aspoň 8. Přihlas se do dalšího turnaje.'
                when 'eliminated_noplay' then 'Své kolo jsi neodehrál, prohráváš kontumačně. Příště si ho zahraj v den kola.'
                else case when n.detail ~ '^\d{1,3}$' then 'Skončil jsi na ' || n.detail || '. místě.' || case when n.detail::integer <= 3 then ' Gratulace!' else '' end else 'Podívej se na konečné pořadí.' end end,
            './?tab=multi', 'notice:' || n.id || ':' || n.user_id, n.created_at::text
        from public.tournament_notices n
        join public.profiles me on me.id = n.user_id and me.push_tournament
        where not n.seen and n.created_at > now() - interval '7 days' and n.kind in ('excluded_full', 'cancelled', 'eliminated_noplay', 'result')
        union all
        -- (d) zkušební upozornění z vývojářského režimu (dev_push_test): bez předvoleb a bez hodinového limitu, každá žádost jednou
        select pt.user_id, 'test', 'Zkušební upozornění Mudrlanta', 'Funguje to! Klepni sem a otevře se záložka Více hráčů.', './?tab=multi',
            public.push_test_key(pt.user_id, pt.requested_at), pt.requested_at::text
        from public.push_tests pt
        where pt.requested_at > now() - interval '1 day'
    ), fresh as (
        select i.*, row_number() over (partition by i.user_id, i.kind order by i.sort_at, i.dedupe_key) as rn
        from items i
        where not exists (select 1 from public.push_sent s where s.dedupe_key = i.dedupe_key)
            and (i.kind = 'test' or not exists (select 1 from public.push_sent s where s.user_id = i.user_id and s.kind = i.kind and s.sent_at > now() - interval '55 minutes'))
    )
    select f.user_id, s.endpoint, s.p256dh, s.auth, f.kind, f.title, f.body, f.url, f.dedupe_key
    from fresh f join public.push_subscriptions s on s.user_id = f.user_id and s.fails < 3
    where f.rn = 1
    order by f.user_id, f.kind, s.endpoint;
end;
$$;

-- Odesílač (GitHub Actions) si řekne, co poslat: ověří tajemství, posune turnaje (připomínky a zprávy o turnaji) a vrátí push_pending()
drop function if exists public.push_due(text);
create or replace function public.push_due(secret text) returns table (
    user_id uuid, endpoint text, p256dh text, auth text, kind text, title text, body text, url text, dedupe_key text
)
language plpgsql security definer set search_path = public as $$
begin
    perform public.push_check_secret(secret);
    perform public.tournament_tick();
    return query select * from public.push_pending();
end;
$$;

-- Zápis po odeslání: klíče do push_sent (hráč a druh z klíče kvůli hodinovému limitu), úspěšné odběry dostanou last_ok, neúspěšné +1 chyba
-- (po třech chybách odběr mizí), odběry s odpovědí 404/410 (gone) se smažou hned. Staré záznamy push_sent (14 dní) se uklidí. Vrací počet smazaných odběrů.
drop function if exists public.push_mark(text, text[], text[]);
create or replace function public.push_mark(secret text, keys text[], ok_endpoints text[] default '{}', failed_endpoints text[] default '{}', gone_endpoints text[] default '{}') returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer := 0;
begin
    perform public.push_check_secret(secret);
    insert into public.push_sent (dedupe_key, user_id, kind)
    select k, case when split_part(k, ':', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(k, ':', 3)::uuid end,
        case split_part(k, ':', 1) when 'tour' then 'tournament' when 'chal' then 'challenge' when 'chalr' then 'challenge' when 'notice' then 'notice' when 'test' then 'test' end
    from unnest(coalesce(keys, '{}')) k where char_length(k) between 1 and 200
    on conflict (dedupe_key) do nothing;
    -- Odeslaná zkušební zpráva je vyřízená; novější žádost (jiný čas, jiný klíč) zůstane čekat. Nevyřízené žádosti starší než den se zahodí.
    delete from public.push_tests t where public.push_test_key(t.user_id, t.requested_at) = any (coalesce(keys, '{}')) or t.requested_at < now() - interval '1 day';
    update public.push_subscriptions set last_ok = now(), fails = 0 where endpoint = any (coalesce(ok_endpoints, '{}'));
    update public.push_subscriptions set fails = least(fails + 1, 100) where endpoint = any (coalesce(failed_endpoints, '{}'));
    delete from public.push_subscriptions where endpoint = any (coalesce(gone_endpoints, '{}')) or fails >= 3;
    get diagnostics removed = row_count;
    delete from public.push_sent where sent_at < now() - interval '14 days';
    return removed;
end;
$$;

-- Zkušební upozornění přes server (Nastavení → Vývojářský režim → Poslat zkušební upozornění přes server): jen účet v dev_admins a jen pro sebe.
-- Zařadí (nebo obnoví) jednu žádost; vrátí počet zařízení účtu, kam zpráva půjde – 0 = účet nemá zapnutá upozornění nikde a nic se nezařadí.
create or replace function public.dev_push_test() returns integer
language plpgsql security definer set search_path = public as $$
declare devices integer;
begin
    if auth.uid() is null or not exists (select 1 from public.dev_admins where user_id = auth.uid()) then
        raise exception 'Zkušební upozornění smí poslat jen účet v dev_admins (viz docs/SUPABASE.md).' using errcode = '42501';
    end if;
    select count(*) into devices from public.push_subscriptions s where s.user_id = auth.uid() and s.fails < 3;
    if devices = 0 then return 0; end if;
    insert into public.push_tests (user_id, requested_at) values (auth.uid(), clock_timestamp())
    on conflict (user_id) do update set requested_at = excluded.requested_at;
    return devices;
end;
$$;

-- ===== Okamžité odesílání: databáze sama spustí workflow Upozornění na GitHubu =====
-- Hodinový plán GitHubu běží nespolehlivě (někdy jen párkrát za den), proto pg_cron každou minutu volá push_kick(): když push_pending() vrací
-- něco, co by odesílač právě teď poslal, zavolá přes pg_net GitHub API (workflow_dispatch pro push.yml, dry_run = false) a upozornění přijde do 1–2 minut.
-- Takto spuštěný workflow běží s MANUAL=true, takže v nočním klidu (21:00–7:00 Praha) pošle jen zkušební upozornění; push_kick proto v noci počítá
-- jen s nimi a ostatní spustí ráno. Token GitHubu je jen v app_secrets ('github_token'), přes API ho nikdo nepřečte, a push_kick přes API zavolat
-- nejde (jen vlastník databáze, tedy úloha pg_cron). Pojistky proti zacyklení: další spuštění nejdřív 3 minuty po posledním, nejvýš 12 za hodinu,
-- a když čekají jen tytéž zprávy jako při posledním spuštění (doručení selhává nebo GitHub běh nespustil), další pokus za 10, 20, 40, pak 60 minut.
-- Vrací krátký stav: no-token, bad-token, bad-repo, no-pg_net (nic neudělá), nothing (není co poslat), wait (něco nového, čeká se na 3 minuty),
-- backoff (tytéž zprávy, další pokus později), hour-limit (12 spuštění za hodinu), dispatched (požadavek zařazen; pg_net ho odešle po konci transakce).

-- Noční klid jako ve scripts/send-push.mjs (QUIET_FROM 7, QUIET_TO 21, pražský čas); mudrlant.test_hour používají jen testy
create or replace function public.push_quiet_now() returns boolean
language sql stable set search_path = public as $$
    select h < 7 or h >= 21 from (select coalesce(nullif(current_setting('mudrlant.test_hour', true), '')::integer, extract(hour from now() at time zone 'Europe/Prague')::integer) as h) x
$$;

-- Je k dispozici pg_net (funkce net.http_post)? Funkce níž jsou v plpgsql a net volají dynamicky, takže schéma jde spustit i bez rozšíření.
create or replace function public.push_net_ready() returns boolean
language sql stable set search_path = public as $$
    select exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post')
$$;

-- Stav push_kick (jediný řádek): poslední spuštění workflow, spuštění za poslední hodinu, otisky (md5 klíčů) zpráv, které tehdy čekaly, počet
-- opakovaných pokusů kvůli týmž zprávám, id posledního požadavku v pg_net (odpověď GitHubu drží pg_net v net._http_response), otisk tokenu, kterým
-- šel, a kdy a s jakým výsledkem push_kick naposledy běžel. Přes API nedostupná.
create table if not exists public.push_kick_state (
    id boolean primary key default true check (id),
    last_at timestamptz,
    recent timestamptz[] not null default '{}',
    pending text[] not null default '{}',
    retries integer not null default 0,
    request_id bigint,
    token_hash text,
    checked_at timestamptz,
    last_status text
);
alter table public.push_kick_state enable row level security;
revoke all on public.push_kick_state from public, anon, authenticated;

create or replace function public.push_kick() returns text
language plpgsql security definer set search_path = public as $$
declare
    tok text; repo_name text; st public.push_kick_state; fps text[]; runs timestamptz[]; is_new boolean; gap interval; req bigint; outcome text;
begin
    select btrim(s.value) into tok from public.app_secrets s where s.name = 'github_token';
    if coalesce(tok, '') = '' then return 'no-token'; end if;
    if tok !~ '^[A-Za-z0-9_]{20,200}$' then return 'bad-token'; end if;
    select btrim(s.value) into repo_name from public.app_secrets s where s.name = 'github_repo';
    repo_name := coalesce(nullif(repo_name, ''), 'taronwho/geografie-kviz');
    if repo_name !~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$' then return 'bad-repo'; end if;
    if not public.push_net_ready() then return 'no-pg_net'; end if;
    -- jeden běh naráz: řádek stavu zůstane zamčený do konce transakce
    insert into public.push_kick_state (id) values (true) on conflict (id) do nothing;
    select * into st from public.push_kick_state k where k.id for update;
    -- stejně jako push_due: nejdřív posunout turnaje, pak co čeká; v nočním klidu jen zkoušky (víc ručně spuštěný workflow nepošle)
    perform public.tournament_tick();
    select coalesce(array_agg(distinct md5(p.dedupe_key)), '{}') into fps
        from public.push_pending() p where p.kind = 'test' or not public.push_quiet_now();
    runs := array(select r from unnest(st.recent) r where r > now() - interval '1 hour' order by r);
    -- nové = aspoň jedna zpráva, která při posledním spuštění nečekala; jinak jde o opakovaný pokus kvůli týmž zprávám
    is_new := not (fps <@ st.pending);
    gap := case when is_new then interval '3 minutes' else least(interval '10 minutes' * power(2, least(st.retries, 3)), interval '1 hour') end;
    if cardinality(fps) = 0 then outcome := 'nothing';
    elsif st.last_at is not null and now() < st.last_at + gap then outcome := case when is_new then 'wait' else 'backoff' end;
    elsif cardinality(runs) >= 12 then outcome := 'hour-limit';
    else
        execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)' into req using
            'https://api.github.com/repos/' || repo_name || '/actions/workflows/push.yml/dispatches',
            jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('dry_run', 'false')),
            jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json', 'X-GitHub-Api-Version', '2022-11-28',
                'User-Agent', 'mudrlant-push', 'Content-Type', 'application/json'),
            10000;
        outcome := 'dispatched';
    end if;
    update public.push_kick_state k set checked_at = now(), last_status = outcome,
        recent = case when outcome = 'dispatched' then runs || now() else runs end,
        pending = case outcome when 'dispatched' then fps when 'nothing' then '{}'::text[] else k.pending end,
        retries = case outcome when 'dispatched' then case when is_new then 0 else k.retries + 1 end when 'nothing' then 0 else k.retries end,
        last_at = case when outcome = 'dispatched' then now() else k.last_at end,
        request_id = case when outcome = 'dispatched' then req else k.request_id end,
        token_hash = case when outcome = 'dispatched' then md5(tok) else k.token_hash end
    where k.id;
    return outcome;
end;
$$;

-- Stav okamžitého odesílání pro okno „Zkouška upozornění“ (jen dev_admins). instant = je token, pg_net i úloha pg_cron, která volá push_kick;
-- funguje i bez pg_cron a pg_net (jen vrátí false). github = kód odpovědi GitHubu na poslední spuštění (dokud ho pg_net drží a token se mezitím neměnil).
create or replace function public.dev_push_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare tok text; token_ok boolean; net_ok boolean; cron_ok boolean := false; st public.push_kick_state; code integer;
begin
    if auth.uid() is null or not exists (select 1 from public.dev_admins where user_id = auth.uid()) then
        raise exception 'Stav upozornění smí číst jen účet v dev_admins (viz docs/SUPABASE.md).' using errcode = '42501';
    end if;
    select btrim(s.value) into tok from public.app_secrets s where s.name = 'github_token';
    token_ok := coalesce(tok ~ '^[A-Za-z0-9_]{20,200}$', false);
    net_ok := public.push_net_ready();
    if to_regclass('cron.job') is not null then
        begin
            execute $q$select exists (select 1 from cron.job j where j.command ilike '%push_kick%' and coalesce((to_jsonb(j) ->> 'active')::boolean, true))$q$ into cron_ok;
        exception when others then cron_ok := false;
        end;
    end if;
    select * into st from public.push_kick_state k where k.id;
    if st.request_id is not null and st.token_hash = md5(coalesce(tok, '')) and to_regclass('net._http_response') is not null then
        begin
            execute 'select status_code from net._http_response where id = $1' into code using st.request_id;
        exception when others then code := null;
        end;
    end if;
    return jsonb_build_object('instant', token_ok and net_ok and coalesce(cron_ok, false), 'token', token_ok, 'pg_net', net_ok, 'cron', coalesce(cron_ok, false),
        'github', code, 'last_dispatch', st.last_at, 'last_check', st.checked_at, 'last_status', st.last_status);
end;
$$;

revoke all on function public.push_check_secret(text), public.push_day_part(), public.push_round_name(integer, integer, boolean), public.push_test_key(uuid, timestamptz) from public, anon, authenticated;
-- Okamžité odesílání: push_kick spouští jen pg_cron (vlastník databáze), pomocné funkce nejsou pro nikoho přes API
revoke all on function public.push_pending(), public.push_quiet_now(), public.push_net_ready(), public.push_kick() from public, anon, authenticated;
revoke all on function public.dev_push_test(), public.dev_push_status() from public, anon;
grant execute on function public.dev_push_test(), public.dev_push_status() to authenticated;
revoke all on function public.push_subscribe(text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text) to authenticated;
-- Odesílatel se hlásí veřejným klíčem (role anon) a prokazuje se tajemstvím
revoke all on function public.push_due(text), public.push_mark(text, text[], text[], text[], text[]) from public;
grant execute on function public.push_due(text), public.push_mark(text, text[], text[], text[], text[]) to anon, authenticated;
-- ===== Chyby z provozu (monitor.js) =====
-- Aplikace sem po dávkách posílá neodchycené chyby z prohlížeče: jen zprávu, zkrácený zásobník volání (adresy bez parametrů), adresu stránky bez parametrů,
-- prohlížeč, verzi aplikace a čas; žádné osobní údaje ani id hráče. Zapsat smí kdokoli s veřejným klíčem (i nepřihlášený), číst jen správce
-- v dev_admins přes dev_client_errors() (Nastavení → vývojářský režim → Chyby z provozu). Celkem nejvýš 100 řádků za hodinu a 500 za den (trigger);
-- aplikace sama pošle nejvýš 5 chyb za relaci a 20 za den a zařízení.
create table if not exists public.client_errors (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    happened_at timestamptz,
    kind text not null default 'error',
    message text not null,
    stack text,
    url text,
    user_agent text,
    app_version text,
    hash text not null
);
alter table public.client_errors drop constraint if exists client_errors_sizes;
alter table public.client_errors add constraint client_errors_sizes check (
    char_length(kind) between 1 and 20 and char_length(message) between 1 and 500 and coalesce(char_length(stack), 0) <= 1000
    and coalesce(char_length(url), 0) <= 300 and coalesce(char_length(user_agent), 0) <= 300 and coalesce(char_length(app_version), 0) <= 40
    and char_length(hash) between 1 and 32);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
drop policy if exists "chyby: zapisuje kdokoli" on public.client_errors;
create policy "chyby: zapisuje kdokoli" on public.client_errors for insert to anon, authenticated with check (true);
-- žádná politika pro čtení: přes API nikdo, jen dev_client_errors()

-- Čas zápisu určuje server; celkem nejvýš 100 chyb za hodinu a 500 za den (zaplavení tabulky z jednoho zařízení nebo skriptem)
create or replace function public.limit_client_errors() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 100
        or (select count(*) from public.client_errors where created_at > now() - interval '1 day') >= 500 then
        raise exception 'Příliš mnoho hlášených chyb.' using errcode = '22023';
    end if;
    new.created_at := now();
    return new;
end;
$$;
drop trigger if exists client_errors_limit on public.client_errors;
create trigger client_errors_limit before insert on public.client_errors for each row execute function public.limit_client_errors();

-- Posledních 50 chyb seskupených podle otisku (stejná zpráva a zásobník), nejnovější skupina první; jen dev_admins
create or replace function public.dev_client_errors() returns table (hash text, count bigint, last_at timestamptz, kind text, message text, stack text, url text, user_agent text, app_version text)
language plpgsql security definer set search_path = public as $$
begin
    perform public.dev_check();
    return query
        with recent as (select * from public.client_errors e order by e.created_at desc, e.id desc limit 50)
        select r.hash, count(*)::bigint, max(r.created_at),
            (array_agg(r.kind order by r.created_at desc, r.id desc))[1], (array_agg(r.message order by r.created_at desc, r.id desc))[1],
            (array_agg(r.stack order by r.created_at desc, r.id desc))[1], (array_agg(r.url order by r.created_at desc, r.id desc))[1],
            (array_agg(r.user_agent order by r.created_at desc, r.id desc))[1], (array_agg(r.app_version order by r.created_at desc, r.id desc))[1]
        from recent r group by r.hash order by max(r.created_at) desc;
end;
$$;
-- Je přihlášený hráč správce (dev_admins)? Aplikace podle toho ukáže upozornění na zastaralé schéma
create or replace function public.dev_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.dev_admins where user_id = auth.uid());
$$;

revoke all on public.client_errors from anon, authenticated;
grant insert (kind, message, stack, url, user_agent, app_version, hash, happened_at) on public.client_errors to anon, authenticated;
revoke all on function public.limit_client_errors() from public, anon, authenticated;
revoke all on function public.dev_client_errors(), public.dev_is_admin() from public, anon;
grant execute on function public.dev_client_errors(), public.dev_is_admin() to authenticated;

-- ===== Hlášení chyb v otázkách =====
-- Hráč v okně otázky nahlásí chybu (špatná odpověď, nejasné zadání, špatný obrázek, jiné) s volitelným textem. Vložit smí jen vlastní
-- hlášení (omezená délka, nejvýš 20 za 24 hodin), číst a mazat je smí jen dev_admins (seznam ve vývojářském panelu v Nastavení).
create table if not exists public.question_reports (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    topic text not null,
    item_id text not null,
    question_type text not null default '',
    reason text not null,
    note text not null default '',
    title text not null default '',
    answer text not null default '',
    created_at timestamptz not null default now(),
    constraint question_reports_topic_format check (topic ~ '^[a-z0-9-]{1,24}$'),
    constraint question_reports_item_format check (item_id ~ '^[A-Za-z0-9_.:-]{1,40}$'),
    constraint question_reports_type_len check (char_length(question_type) <= 24),
    constraint question_reports_reason_values check (reason in ('spatna-odpoved', 'nejasne-zadani', 'spatny-obrazek', 'jine')),
    constraint question_reports_note_len check (char_length(note) <= 500),
    constraint question_reports_title_len check (char_length(title) <= 200),
    constraint question_reports_answer_len check (char_length(answer) <= 200)
);
create index if not exists question_reports_user_created_idx on public.question_reports (user_id, created_at desc);
create index if not exists question_reports_created_idx on public.question_reports (created_at desc);
alter table public.question_reports enable row level security;

-- Je přihlášený hráč v dev_admins? (dev_admins samo hráči čtení nedovolí, proto funkce s právy vlastníka)
create or replace function public.is_dev_admin() returns boolean
language sql stable security definer set search_path = public as $$
    select auth.uid() is not null and exists (select 1 from public.dev_admins where user_id = auth.uid());
$$;
revoke all on function public.is_dev_admin() from public, anon;
grant execute on function public.is_dev_admin() to authenticated;

-- Denní limit hlášení: jeden hráč nejvýš 20 za posledních 24 hodin (zpráva se hráči ukáže tak, jak je)
create or replace function public.question_reports_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if (select count(*) from public.question_reports where user_id = new.user_id and created_at > now() - interval '24 hours') >= 20 then
        raise exception 'Dnes už jsi poslal hodně hlášení, zkus to zítra.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists question_reports_limit on public.question_reports;
create trigger question_reports_limit before insert on public.question_reports for each row execute function public.question_reports_limit();

drop policy if exists "hlášení otázek: vkládá hráč sám" on public.question_reports;
create policy "hlášení otázek: vkládá hráč sám" on public.question_reports for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "hlášení otázek: čtou dev_admins" on public.question_reports;
create policy "hlášení otázek: čtou dev_admins" on public.question_reports for select to authenticated using (public.is_dev_admin());
drop policy if exists "hlášení otázek: mažou dev_admins" on public.question_reports;
create policy "hlášení otázek: mažou dev_admins" on public.question_reports for delete to authenticated using (public.is_dev_admin());
revoke all on public.question_reports from anon, authenticated;
grant select, insert, delete on public.question_reports to authenticated;
revoke all on function public.question_reports_limit() from public, anon, authenticated;
-- ===== Moje data: export a smazání účtu (zásady ochrany osobních údajů, soukromi.html) =====
-- Obě funkce pracují jen s účtem volajícího (auth.uid()); běží s právy vlastníka, protože musí číst/mazat i řádky, které RLS jinak hlídá.

-- Export: všechna data hráče na serveru jako jeden JSON (aplikace ho nabídne ke stažení)
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select jsonb_build_object(
        'vytvoreno', now(),
        'ucet', (select jsonb_build_object('id', u.id, 'email', u.email, 'vytvoren', u.created_at, 'posledni_prihlaseni', u.last_sign_in_at) from auth.users u where u.id = uid),
        'profil', (select to_jsonb(p) from public.profiles p where p.id = uid),
        'vyzvy_zalozene', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.challenges c where c.creator_id = uid), '[]'::jsonb),
        'vyzvy_vysledky', coalesce((select jsonb_agg(to_jsonb(r) order by r.finished_at) from public.challenge_results r where r.user_id = uid), '[]'::jsonb),
        'rating_historie', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.rating_history h where h.user_id = uid), '[]'::jsonb),
        'turnaje_prihlasky', coalesce((select jsonb_agg(to_jsonb(e) order by e.joined_at) from public.tournament_entries e where e.user_id = uid), '[]'::jsonb),
        'turnaje_zapasy', coalesce((select jsonb_agg(to_jsonb(m)) from public.tournament_matches m where uid in (m.p1, m.p2)), '[]'::jsonb),
        'turnaje_vysledky', coalesce((select jsonb_agg(to_jsonb(t) order by t.started_at) from public.tournament_results t where t.user_id = uid), '[]'::jsonb),
        'turnaje_zpravy', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.tournament_notices n where n.user_id = uid), '[]'::jsonb),
        -- Sociální vrstva a hlášení (tabulky jsou níž v tomto souboru; tělo funkce se kontroluje až při volání)
        'posledni_aktivita', (select s.last_seen from public.player_seen s where s.user_id = uid),
        'pratele', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.friendships f where uid in (f.user_id, f.friend_id)), '[]'::jsonb),
        'zablokovani_hraci', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.player_blocks b where b.blocker = uid), '[]'::jsonb),
        'reakce', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.match_reactions r where uid in (r.from_id, r.to_id)), '[]'::jsonb),
        'nahlaseni_hracu', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.player_reports r where r.reporter = uid), '[]'::jsonb),
        'hlaseni_otazek', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.question_reports r where r.user_id = uid), '[]'::jsonb),
        'upozorneni_odbery', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'vytvoren', s.created_at)) from public.push_subscriptions s where s.user_id = uid), '[]'::jsonb),
        -- Průběh výzev a zápasů turnaje (odpovědi po otázkách) a vyplacené XP za vyhrané zápasy (schéma 3, tabulky na konci souboru)
        'vyzvy_prubeh', coalesce((select jsonb_agg(to_jsonb(p) order by p.answered_at, p.challenge_id, p.idx) from public.challenge_progress p where p.user_id = uid), '[]'::jsonb),
        'turnaje_odpovedi', coalesce((select jsonb_agg(to_jsonb(a) order by a.answered_at, a.idx) from public.tournament_answers a where a.user_id = uid), '[]'::jsonb),
        'turnaje_xp', coalesce((select jsonb_agg(to_jsonb(x) order by x.claimed_at) from public.tournament_xp_claims x where x.user_id = uid), '[]'::jsonb),
        -- Kvíz dne (schéma 7, tabulka na konci souboru)
        'kviz_dne', coalesce((select jsonb_agg(to_jsonb(k) order by k.day) from public.daily_quiz_results k where k.user_id = uid), '[]'::jsonb)
    ) into result;
    return result;
end;
$$;

-- Smazání účtu: smaže profil a s ním (ON DELETE CASCADE) výzvy, výsledky, rating, přihlášky a zprávy turnajů a nakonec i řádek v auth.users.
-- Vrací true, když zmizel i přihlašovací záznam; false, když ho role vlastníka funkce nesmí smazat (data jsou pak smazaná a profil vrácen na prázdný výchozí,
-- přihlašovací záznam smaže správce v Supabase → Authentication → Users). Bez nastavení klíčů service_role se funkce nikdy nevolá zvenčí jinak než přihlášeným hráčem.
-- Hráč, který je ještě ve hře v běžícím turnaji, smazat účet nemůže (smazané zápasy by rozbily pavouk soupeřů); po vypadnutí nebo konci turnaje to jde.
create or replace function public.delete_my_account() returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); auth_removed boolean := true;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if exists (select 1 from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
               where e.user_id = uid and t.status = 'running' and e.status = 'playing') then
        raise exception 'Právě hraješ turnaj. Účet půjde smazat, až z turnaje vypadneš nebo skončí.';
    end if;
    delete from public.profiles where id = uid;
    begin
        delete from auth.users where id = uid;
    exception when insufficient_privilege then
        auth_removed := false;
        insert into public.profiles (id, display_name) values (uid, 'Hráč ' || substr(md5(uid::text), 1, 8)) on conflict (id) do nothing;
    end;
    return auth_removed;
end;
$$;

revoke all on function public.export_my_data(), public.delete_my_account() from public, anon;
grant execute on function public.export_my_data(), public.delete_my_account() to authenticated;
-- ===== Sociální vrstva: přátelé, reakce po zápase, blokování a nahlášení =====
-- Kdy byl hráč naposled v aplikaci (touch_seen() nejvýš jednou za 5 minut; klient řádek psát nemůže). Vidí to jen přátelé („aktivní dnes / před 3 dny“)
-- přes friends_list(), proto je to ve vlastní tabulce (sloupec v profiles by přes čtení profilů viděl kdokoli přihlášený).
create table if not exists public.player_seen (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    last_seen timestamptz not null default now()
);
alter table public.player_seen enable row level security;
drop policy if exists "aktivita: vlastní" on public.player_seen;
create policy "aktivita: vlastní" on public.player_seen for select to authenticated using (user_id = auth.uid());
revoke all on public.player_seen from anon, authenticated;
grant select on public.player_seen to authenticated;
-- Starší verze měla sloupec profiles.last_seen: hodnoty se přenesou a sloupec zmizí
do $$ begin
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_seen') then
        insert into public.player_seen (user_id, last_seen) select id, last_seen from public.profiles where last_seen is not null
            on conflict (user_id) do update set last_seen = greatest(public.player_seen.last_seen, excluded.last_seen);
        alter table public.profiles drop column last_seen;
    end if;
end $$;
create or replace function public.touch_seen() returns void
language sql security definer set search_path = public as $$
    insert into public.player_seen (user_id, last_seen) select p.id, now() from public.profiles p where p.id = auth.uid()
        on conflict (user_id) do update set last_seen = now() where public.player_seen.last_seen < now() - interval '5 minutes';
$$;

-- Blokování: zablokovaný hráč mě nenajde v hledání, nevyzve mě, nevybere se mi jako náhodný soupeř (a naopak); v žebříčku zůstává (veřejný)
create table if not exists public.player_blocks (
    blocker uuid not null references public.profiles (id) on delete cascade,
    blocked uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker, blocked),
    check (blocker <> blocked)
);
create index if not exists player_blocks_blocked_idx on public.player_blocks (blocked);
alter table public.player_blocks enable row level security;
drop policy if exists "bloky: vlastní" on public.player_blocks;
create policy "bloky: vlastní" on public.player_blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());
-- Je mezi dvěma hráči blok (kterýmkoli směrem)?
create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.player_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- Přátelství: řádek (kdo žádá, koho) se stavem pending → accepted; přijímá jen oslovený, ruší kdokoli z dvojice
create table if not exists public.friendships (
    user_id uuid not null references public.profiles (id) on delete cascade,
    friend_id uuid not null references public.profiles (id) on delete cascade,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    primary key (user_id, friend_id),
    check (user_id <> friend_id)
);
alter table public.friendships drop constraint if exists friendships_status_list;
alter table public.friendships add constraint friendships_status_list check (status in ('pending', 'accepted'));
create index if not exists friendships_friend_idx on public.friendships (friend_id, status);
alter table public.friendships enable row level security;
drop policy if exists "přátelé: vidí obě strany" on public.friendships;
create policy "přátelé: vidí obě strany" on public.friendships for select to authenticated using (auth.uid() in (user_id, friend_id));
drop policy if exists "přátelé: žádost posílá hráč sám" on public.friendships;
create policy "přátelé: žádost posílá hráč sám" on public.friendships for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "přátelé: přijímá oslovený" on public.friendships;
create policy "přátelé: přijímá oslovený" on public.friendships for update to authenticated using (friend_id = auth.uid()) with check (friend_id = auth.uid() and status = 'accepted');
drop policy if exists "přátelé: ruší kdokoli z dvojice" on public.friendships;
create policy "přátelé: ruší kdokoli z dvojice" on public.friendships for delete to authenticated using (auth.uid() in (user_id, friend_id));

-- Blok: nejvýš 500 na hráče, čas určuje server a přátelství s blokovaným končí
create or replace function public.on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    new.created_at := now();
    if (select count(*) from public.player_blocks where blocker = new.blocker) >= 500 then
        raise exception 'Máš zablokováno příliš mnoho hráčů.' using errcode = 'P0001';
    end if;
    delete from public.friendships where (user_id = new.blocker and friend_id = new.blocked) or (user_id = new.blocked and friend_id = new.blocker);
    return new;
end;
$$;
drop trigger if exists player_blocks_on_block on public.player_blocks;
create trigger player_blocks_on_block before insert on public.player_blocks for each row execute function public.on_block();

-- Počet přátel a čekajících žádostí hráče (limit 200)
create or replace function public.friend_count(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
    select count(*)::integer from public.friendships where uid in (user_id, friend_id);
$$;
-- Žádost o přátelství: ne blokovanému, nejvýš 200 přátel, nejvýš 30 žádostí za hodinu; opačná čekající žádost se rovnou přijme (nový řádek nevznikne)
create or replace function public.on_friend_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare reverse_status text;
begin
    new.created_at := now();
    new.status := 'pending';
    if public.is_blocked(new.user_id, new.friend_id) then raise exception 'Tohoto hráče nejde přidat do přátel.' using errcode = 'P0001'; end if;
    select status into reverse_status from public.friendships where user_id = new.friend_id and friend_id = new.user_id;
    if reverse_status = 'accepted' then return null; end if;
    if reverse_status = 'pending' then
        update public.friendships set status = 'accepted' where user_id = new.friend_id and friend_id = new.user_id;
        return null;
    end if;
    if public.friend_count(new.user_id) >= 200 then raise exception 'Máš už 200 přátel, víc se nevejde.' using errcode = 'P0001'; end if;
    if (select count(*) from public.friendships where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
        raise exception 'Poslal jsi příliš mnoho žádostí, zkus to za chvíli.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists friendships_request on public.friendships;
create trigger friendships_request before insert on public.friendships for each row execute function public.on_friend_request();
-- Přijetí: mění se jen stav (ne dvojice ani čas), zpět na čekající to nejde, přijímající má také nejvýš 200 přátel
create or replace function public.on_friend_accept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    new.user_id := old.user_id;
    new.friend_id := old.friend_id;
    new.created_at := old.created_at;
    if old.status = 'accepted' and new.status <> 'accepted' then raise exception 'Přátelství jde jen zrušit.' using errcode = 'P0001'; end if;
    if old.status = 'pending' and new.status = 'accepted' and (select count(*) from public.friendships where new.friend_id in (user_id, friend_id) and status = 'accepted') >= 200 then
        raise exception 'Máš už 200 přátel, víc se nevejde.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists friendships_accept on public.friendships;
create trigger friendships_accept before update on public.friendships for each row execute function public.on_friend_accept();

-- Moji přátelé a žádosti (oběma směry) s profilem, poslední aktivitou a vzájemnou bilancí z výzev (víc správných, pak víc bodů)
drop function if exists public.friends_list();
create or replace function public.friends_list() returns table (
    id uuid, display_name text, avatar text, color text, frame text, title_pref text, owl text, rating integer, last_seen timestamptz,
    status text, direction text, since timestamptz, wins integer, losses integer, draws integer
)
language sql stable security definer set search_path = public as $$
    with mine as (
        select case when f.user_id = auth.uid() then f.friend_id else f.user_id end as other, f.status,
            case when f.user_id = auth.uid() then 'out' else 'in' end as direction, f.created_at
        from public.friendships f where auth.uid() is not null and auth.uid() in (f.user_id, f.friend_id)
    ), duel as (
        select o.user_id as other,
            (count(*) filter (where m.correct > o.correct or (m.correct = o.correct and m.points > o.points)))::integer as wins,
            (count(*) filter (where m.correct < o.correct or (m.correct = o.correct and m.points < o.points)))::integer as losses,
            (count(*) filter (where m.correct = o.correct and m.points = o.points))::integer as draws
        from public.challenge_results m join public.challenge_results o on o.challenge_id = m.challenge_id and o.user_id <> m.user_id
        where m.user_id = auth.uid() and o.user_id in (select other from mine)
        group by o.user_id
    )
    -- Poslední aktivitu vidí jen přátelé (ne ten, komu jsem jen poslal žádost, ani ten, kdo mi ji poslal)
    select p.id, p.display_name, p.avatar, p.color, p.frame, p.title_pref, p.owl, p.rating, case when mine.status = 'accepted' then s.last_seen end, mine.status, mine.direction, mine.created_at,
        coalesce(d.wins, 0), coalesce(d.losses, 0), coalesce(d.draws, 0)
    from mine join public.profiles p on p.id = mine.other left join duel d on d.other = mine.other left join public.player_seen s on s.user_id = mine.other
    order by (mine.status = 'pending' and mine.direction = 'in') desc, case when mine.status = 'accepted' then s.last_seen end desc nulls last, p.display_name
    limit 400;
$$;

-- Hledání hráčů podle části přezdívky bez blokovaných (oběma směry) a bez mě
create or replace function public.search_players(term text) returns setof public.profiles
language sql stable security definer set search_path = public as $$
    select * from public.profiles p
    where auth.uid() is not null and p.id <> auth.uid() and char_length(btrim(coalesce(term, ''))) >= 2
        and p.display_name ilike '%' || replace(replace(replace(left(btrim(term), 24), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        and not public.is_blocked(auth.uid(), p.id)
    order by p.display_name limit 8;
$$;
-- Náhodný soupeř také bez blokovaných
create or replace function public.random_opponent(wanted text[] default '{}', wants_mix boolean default false) returns setof public.profiles
language sql stable security definer set search_path = public as $$
    select * from public.profiles
    where id <> auth.uid() and not (blocked_topics && coalesce(wanted, '{}')) and (not coalesce(wants_mix, false) or accepts_mix)
        and not public.is_blocked(auth.uid(), id)
    order by random() limit 1;
$$;
-- Výzva konkrétnímu hráči nejde přes blok (kterýmkoli směrem)
create or replace function public.check_challenge_blocks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.invited_id is not null and public.is_blocked(new.creator_id, new.invited_id) then
        raise exception 'Tohoto hráče nejde vyzvat.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists challenges_check_blocks on public.challenges;
create trigger challenges_check_blocks before insert on public.challenges for each row execute function public.check_challenge_blocks();

-- Reakce po zápase (👍 🔥 😅 🤝): jedna na výzvu nebo zápas turnaje od hráče, jen mezi účastníky, soupeř ji vidí
create table if not exists public.match_reactions (
    id bigint generated always as identity primary key,
    challenge_id text references public.challenges (id) on delete cascade,
    match_id uuid references public.tournament_matches (id) on delete cascade,
    from_id uuid not null references public.profiles (id) on delete cascade,
    to_id uuid not null references public.profiles (id) on delete cascade,
    emoji text not null,
    created_at timestamptz not null default now(),
    check ((challenge_id is null) <> (match_id is null)),
    check (from_id <> to_id),
    unique nulls not distinct (challenge_id, match_id, from_id)
);
alter table public.match_reactions drop constraint if exists match_reactions_emoji_list;
alter table public.match_reactions add constraint match_reactions_emoji_list check (emoji in ('👍', '🔥', '😅', '🤝'));
create index if not exists match_reactions_to_idx on public.match_reactions (to_id, created_at desc);
alter table public.match_reactions enable row level security;
drop policy if exists "reakce: vidí obě strany" on public.match_reactions;
create policy "reakce: vidí obě strany" on public.match_reactions for select to authenticated using (auth.uid() in (from_id, to_id));
drop policy if exists "reakce: posílá hráč sám" on public.match_reactions;
create policy "reakce: posílá hráč sám" on public.match_reactions for insert to authenticated with check (from_id = auth.uid());
drop policy if exists "reakce: mění hráč sám" on public.match_reactions;
create policy "reakce: mění hráč sám" on public.match_reactions for update to authenticated using (from_id = auth.uid()) with check (from_id = auth.uid());
-- Reagovat jde jen na zápas, který oba hráli (výzva: oba mají výsledek; turnaj: oba jsou v zápase), ne přes blok
create or replace function public.check_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    new.created_at := now();
    if tg_op = 'UPDATE' then
        new.challenge_id := old.challenge_id; new.match_id := old.match_id; new.from_id := old.from_id; new.to_id := old.to_id;
        return new;
    end if;
    if public.is_blocked(new.from_id, new.to_id) then raise exception 'Reakci nejde poslat.' using errcode = 'P0001'; end if;
    if new.challenge_id is not null and (
        not exists (select 1 from public.challenge_results where challenge_id = new.challenge_id and user_id = new.from_id)
        or not exists (select 1 from public.challenge_results where challenge_id = new.challenge_id and user_id = new.to_id)) then
        raise exception 'Reagovat jde jen na výzvu, kterou jste oba dohráli.' using errcode = 'P0001';
    end if;
    if new.match_id is not null and not exists (select 1 from public.tournament_matches m where m.id = new.match_id and new.from_id in (m.p1, m.p2) and new.to_id in (m.p1, m.p2)) then
        raise exception 'Reagovat jde jen na vlastní zápas.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists match_reactions_check on public.match_reactions;
create trigger match_reactions_check before insert or update on public.match_reactions for each row execute function public.check_reaction();

-- Nahlášení hráče (důvod: prezdivka, obrazek, podvadeni, obtezovani, jine; poznámka do 300 znaků), nejvýš 10 za den; řeší správce (dev_admins)
create table if not exists public.player_reports (
    id bigint generated always as identity primary key,
    reporter uuid not null references public.profiles (id) on delete cascade,
    reported uuid not null references public.profiles (id) on delete cascade,
    reason text not null,
    note text,
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    check (reporter <> reported)
);
alter table public.player_reports drop constraint if exists player_reports_reason_list;
alter table public.player_reports add constraint player_reports_reason_list check (reason in ('prezdivka', 'obrazek', 'podvadeni', 'obtezovani', 'jine'));
alter table public.player_reports drop constraint if exists player_reports_note_len;
alter table public.player_reports add constraint player_reports_note_len check (note is null or char_length(note) <= 300);
create index if not exists player_reports_open_idx on public.player_reports (resolved_at, created_at desc);
alter table public.player_reports enable row level security;
drop policy if exists "nahlášení: vlastní" on public.player_reports;
create policy "nahlášení: vlastní" on public.player_reports for select to authenticated using (reporter = auth.uid());
drop policy if exists "nahlášení: posílá hráč sám" on public.player_reports;
create policy "nahlášení: posílá hráč sám" on public.player_reports for insert to authenticated with check (reporter = auth.uid());
create or replace function public.on_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    new.created_at := now();
    new.resolved_at := null;
    new.note := nullif(btrim(regexp_replace(coalesce(new.note, ''), '[[:cntrl:]]', ' ', 'g')), '');
    if (select count(*) from public.player_reports where reporter = new.reporter and created_at > now() - interval '1 day') >= 10 then
        raise exception 'Dnes už jsi nahlásil příliš mnoho hráčů.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists player_reports_limit on public.player_reports;
create trigger player_reports_limit before insert on public.player_reports for each row execute function public.on_report();
-- Správce (dev_admins): seznam nahlášení (nevyřešená první) a označení za vyřešené
drop function if exists public.dev_player_reports();
create or replace function public.dev_player_reports() returns table (
    id bigint, reporter_id uuid, reporter_name text, reported_id uuid, reported_name text, reported_avatar text, reported_color text,
    reason text, note text, created_at timestamptz, resolved_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
    perform public.dev_check();
    return query select r.id, r.reporter, a.display_name, r.reported, b.display_name, b.avatar, b.color, r.reason, r.note, r.created_at, r.resolved_at
        from public.player_reports r join public.profiles a on a.id = r.reporter join public.profiles b on b.id = r.reported
        order by (r.resolved_at is null) desc, r.created_at desc limit 200;
end;
$$;
create or replace function public.dev_report_resolve(rid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
    perform public.dev_check();
    update public.player_reports set resolved_at = now() where id = rid;
end;
$$;

revoke all on public.friendships, public.player_blocks, public.match_reactions, public.player_reports from anon, authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;
grant select, insert, delete on public.player_blocks to authenticated;
grant select, insert on public.match_reactions to authenticated;
-- PostgREST přepisuje reakci upsertem se všemi sloupci, proto jsou povolené všechny; kdo/komu/kam pevně drží trigger check_reaction()
grant update (challenge_id, match_id, from_id, to_id, emoji) on public.match_reactions to authenticated;
grant select, insert on public.player_reports to authenticated;
revoke all on function public.on_block(), public.on_friend_request(), public.on_friend_accept(),
    public.friend_count(uuid), public.check_challenge_blocks(), public.check_reaction(), public.on_report(), public.is_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.touch_seen(), public.friends_list(), public.search_players(text), public.dev_player_reports(), public.dev_report_resolve(bigint) from public, anon;
grant execute on function public.touch_seen(), public.friends_list(), public.search_players(text), public.dev_player_reports(), public.dev_report_resolve(bigint) to authenticated;
-- ===== Průběh výzev a zápasů turnaje na serveru (schéma 3) =====
-- Každá odpověď se hned po zodpovězení uloží (pořadí otázky od 0, správně, body). Uložit jde jen další otázku v pořadí, nic přeskočit ani přepsat;
-- stejná odpověď poslaná znovu (fronta po výpadku spojení, ztracená odpověď serveru) nic nezmění. Po smazání dat v zařízení nebo na jiném zařízení
-- aplikace průběh načte a pokračuje první nezodpovězenou otázkou, takže výzvu nejde hrát znovu od první otázky. Konečný výsledek spočítá server
-- z průběhu (výzva: spoušť result_from_progress na challenge_results; turnaj: tournament_finish_match). Průběh vidí jen jeho hráč, zapisuje se jen přes funkce.
create table if not exists public.challenge_progress (
    challenge_id text not null references public.challenges (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    idx integer not null,
    correct boolean not null,
    points integer not null,
    answered_at timestamptz not null default now(),
    primary key (challenge_id, user_id, idx)
);
-- správná odpověď má aspoň bod, špatná žádný; nejvýš 8 bodů (psaná odpověď bez nápovědy), výzva má nejvýš 20 otázek
alter table public.challenge_progress drop constraint if exists challenge_progress_values;
alter table public.challenge_progress add constraint challenge_progress_values check (idx between 0 and 19 and points between 0 and 8 and correct = (points > 0));
create index if not exists challenge_progress_user_idx on public.challenge_progress (user_id, answered_at desc);
alter table public.challenge_progress enable row level security;
drop policy if exists "průběh výzvy: vlastní" on public.challenge_progress;
create policy "průběh výzvy: vlastní" on public.challenge_progress for select to authenticated using (user_id = auth.uid());

-- Uloží odpověď na otázku idx výzvy code za přihlášeného hráče; vrací počet uložených odpovědí (= index další otázky)
create or replace function public.challenge_progress_save(code text, idx integer, correct boolean, points integer) returns integer
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare uid uuid := auth.uid(); c public.challenges; prev public.challenge_progress; saved integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into c from public.challenges ch where ch.id = code;
    -- hrát smí každý s kódem, u výzvy určenému hráči jen on a zakladatel (stejně jako zápis výsledku)
    if c.id is null or not (c.invited_id is null or c.invited_id = uid or c.creator_id = uid) then
        raise exception 'Tuhle výzvu hrát nemůžeš.' using errcode = '42501';
    end if;
    -- souběžné zápisy téhož hráče do téže výzvy jdou po sobě (pořadí otázek)
    perform pg_advisory_xact_lock(hashtext('challenge_progress:' || code || ':' || uid::text));
    if exists (select 1 from public.challenge_results r where r.challenge_id = code and r.user_id = uid) then
        raise exception 'Výzvu už máš dohranou.' using errcode = '22023';
    end if;
    if idx is null or idx < 0 or idx >= c.count then raise exception 'Neplatné číslo otázky.' using errcode = '22023'; end if;
    -- výběr z možností nejvýš 4 body za otázku, psaná odpověď dvojnásobek (jen výzva bez pevného způsobu odpovídání)
    if correct is null or points is null or points < 0 or points > (case when c.variant = 'choices' then 4 else 8 end) or correct <> (points > 0) then
        raise exception 'Neplatný výsledek otázky.' using errcode = '22023';
    end if;
    select count(*)::integer into saved from public.challenge_progress p where p.challenge_id = code and p.user_id = uid;
    select * into prev from public.challenge_progress p where p.challenge_id = code and p.user_id = uid and p.idx = idx;
    if prev.challenge_id is not null then
        if prev.correct = correct and prev.points = points then return saved; end if;
        raise exception 'Odpověď na tuhle otázku už je uložená, přepsat ji nejde.' using errcode = '22023';
    end if;
    if idx <> saved then raise exception 'Nejdřív se musí uložit předchozí otázky.' using errcode = '22023'; end if;
    insert into public.challenge_progress (challenge_id, user_id, idx, correct, points) values (code, uid, idx, correct, points);
    return saved + 1;
end;
$$;

-- Konečný výsledek výzvy počítá server z průběhu: hráč (role authenticated) ho uloží, až když má na serveru odpovědi na všechny otázky,
-- a počet správných i body se vezmou z nich (čísla od klienta se přepíšou). Průběh čte pravidlo řádků jen hráči samotnému, výsledek za jiného
-- hráče tak průběh nemá a neprojde. Správce (postgres) se tím neřídí; opakovaný zápis už uloženého výsledku řeší primární klíč (ON CONFLICT).
create or replace function public.result_from_progress() returns trigger
language plpgsql set search_path = public as $$
declare answered integer; good integer; total integer; question_count integer;
begin
    if current_user not in ('authenticated', 'anon') then return new; end if;
    if exists (select 1 from public.challenge_results r where r.challenge_id = new.challenge_id and r.user_id = new.user_id) then return new; end if;
    select c.count into question_count from public.challenges c where c.id = new.challenge_id;
    select count(*)::integer, (count(*) filter (where p.correct))::integer, coalesce(sum(p.points), 0)::integer into answered, good, total
        from public.challenge_progress p where p.challenge_id = new.challenge_id and p.user_id = new.user_id;
    if question_count is null or answered < question_count then
        raise exception 'Výsledek výzvy jde uložit až po uložení odpovědí na všechny otázky.' using errcode = 'P0001';
    end if;
    new.correct := good;
    new.points := total;
    return new;
end;
$$;
drop trigger if exists challenge_results_from_progress on public.challenge_results;
create trigger challenge_results_from_progress before insert on public.challenge_results for each row execute function public.result_from_progress();

-- Odpovědi v zápase turnaje: stejně jako průběh výzvy, jen v den kola, po tournament_start_match a před tournament_finish_match.
-- Po smazání dat nebo na jiném zařízení se tak dá rozehraný zápas dohrát od první nezodpovězené otázky (čas dál běží od začátku zápasu).
create table if not exists public.tournament_answers (
    match_id uuid not null references public.tournament_matches (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    idx integer not null,
    correct boolean not null,
    points integer not null,
    answered_at timestamptz not null default now(),
    primary key (match_id, user_id, idx)
);
-- zápas má 10 otázek z výběru z možností (nejvýš 4 body za otázku)
alter table public.tournament_answers drop constraint if exists tournament_answers_values;
alter table public.tournament_answers add constraint tournament_answers_values check (idx between 0 and 9 and points between 0 and 4 and correct = (points > 0));
create index if not exists tournament_answers_user_idx on public.tournament_answers (user_id, answered_at desc);
alter table public.tournament_answers enable row level security;
drop policy if exists "turnaje: vlastní odpovědi" on public.tournament_answers;
create policy "turnaje: vlastní odpovědi" on public.tournament_answers for select to authenticated using (user_id = auth.uid());

create or replace function public.tournament_answer_save(mid uuid, idx integer, correct boolean, points integer) returns integer
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare uid uuid := auth.uid(); m public.tournament_matches; t public.tournaments; r public.tournament_results; prev public.tournament_answers; saved integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into m from public.tournament_matches tm where tm.id = mid;
    if m.id is null or uid not in (m.p1, m.p2) then raise exception 'Tohle není tvůj zápas.' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtext('tournament_answers:' || mid::text || ':' || uid::text));
    select * into r from public.tournament_results tr where tr.match_id = mid and tr.user_id = uid;
    if r.match_id is null then raise exception 'Zápas jsi ještě nezačal.' using errcode = '22023'; end if;
    if r.finished_at is not null or m.winner is not null then raise exception 'Zápas už je dohraný.' using errcode = '22023'; end if;
    select * into t from public.tournaments tt where tt.id = m.tournament_id;
    if t.status <> 'running' or t.started_on + (m.round - 1) <> public.tournament_today() then raise exception 'Kolo se dnes nehraje.' using errcode = '22023'; end if;
    if idx is null or idx < 0 or idx > 9 then raise exception 'Neplatné číslo otázky.' using errcode = '22023'; end if;
    if correct is null or points is null or points < 0 or points > 4 or correct <> (points > 0) then raise exception 'Neplatný výsledek otázky.' using errcode = '22023'; end if;
    select count(*)::integer into saved from public.tournament_answers a where a.match_id = mid and a.user_id = uid;
    select * into prev from public.tournament_answers a where a.match_id = mid and a.user_id = uid and a.idx = idx;
    if prev.match_id is not null then
        if prev.correct = correct and prev.points = points then return saved; end if;
        raise exception 'Odpověď na tuhle otázku už je uložená, přepsat ji nejde.' using errcode = '22023';
    end if;
    if idx <> saved then raise exception 'Nejdřív se musí uložit předchozí otázky.' using errcode = '22023'; end if;
    insert into public.tournament_answers (match_id, user_id, idx, correct, points) values (mid, uid, idx, correct, points);
    return saved + 1;
end;
$$;

-- ===== XP za vyhrané zápasy turnaje: vyplácí se jednou za účet =====
-- Dřív si vyplacené zápasy pamatovalo jen zařízení (mudrlant.tourXp): na novém zařízení nebo po smazání dat se XP připsalo znovu. Teď vyplacení eviduje
-- server: claim_tournament_xp() atomicky zapíše dosud nevyplacené výhry volajícího (vítěz = volající, ne postup „dřívější přihlášení“ bez hry) a vrátí
-- jejich id a kolo; aplikace připíše XP jen za vrácené. Volitelný retry_key: zopakované volání se stejným klíčem (odpověď serveru se ztratila) vrátí
-- tytéž zápasy znovu (proti dvojímu připsání v jednom zařízení chrání mudrlant.tourXp).
-- Migrace: tabulka vzniká při prvním spuštění téhle verze a všechny výhry rozhodnuté do té doby se do ní zapíšou jako vyplacené (legacy = true):
-- XP za ně hráč dostal ve svém zařízení. Kdo vyhrál a od té doby aplikaci neotevřel, XP za tyto zápasy už nedostane (méně zlé než dvojí výplata).
do $$
begin
    if to_regclass('public.tournament_xp_claims') is null then
        create table public.tournament_xp_claims (
            match_id uuid primary key references public.tournament_matches (id) on delete cascade,
            user_id uuid not null references public.profiles (id) on delete cascade,
            round integer not null,
            retry_key text,
            legacy boolean not null default false,
            claimed_at timestamptz not null default now()
        );
        insert into public.tournament_xp_claims (match_id, user_id, round, legacy)
            select m.id, m.winner, m.round, true from public.tournament_matches m where m.winner is not null and m.decided_by <> 'earlier';
    end if;
end
$$;
alter table public.tournament_xp_claims drop constraint if exists tournament_xp_claims_key_format;
alter table public.tournament_xp_claims add constraint tournament_xp_claims_key_format check (retry_key is null or retry_key ~ '^[A-Za-z0-9_-]{8,64}$');
create index if not exists tournament_xp_claims_user_idx on public.tournament_xp_claims (user_id, retry_key);
alter table public.tournament_xp_claims enable row level security;
drop policy if exists "turnaje: vlastní vyplacené XP" on public.tournament_xp_claims;
create policy "turnaje: vlastní vyplacené XP" on public.tournament_xp_claims for select to authenticated using (user_id = auth.uid());

create or replace function public.claim_tournament_xp(retry_key text default null) returns table (id uuid, round integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare uid uuid := auth.uid(); k text := nullif(btrim(coalesce(retry_key, '')), '');
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if k is not null and k !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'Neplatný klíč.' using errcode = '22023'; end if;
    -- dvě souběžná volání téhož hráče jdou po sobě (zápas se vyplatí jen jednomu z nich)
    perform pg_advisory_xact_lock(hashtext('tournament_xp:' || uid::text));
    return query
        with fresh as (
            insert into public.tournament_xp_claims (match_id, user_id, round, retry_key)
            select m.id, uid, m.round, k from public.tournament_matches m where m.winner = uid and m.decided_by <> 'earlier'
            on conflict (match_id) do nothing
            returning tournament_xp_claims.match_id, tournament_xp_claims.round
        )
        select f.match_id, f.round from fresh f
        union
        select x.match_id, x.round from public.tournament_xp_claims x where k is not null and x.user_id = uid and x.retry_key = k and not x.legacy;
end;
$$;

revoke all on public.challenge_progress, public.tournament_answers, public.tournament_xp_claims from anon, authenticated;
grant select on public.challenge_progress, public.tournament_answers, public.tournament_xp_claims to authenticated;
revoke all on function public.result_from_progress() from public, anon, authenticated;
revoke all on function public.challenge_progress_save(text, integer, boolean, integer), public.tournament_answer_save(uuid, integer, boolean, integer), public.claim_tournament_xp(text) from public, anon;
grant execute on function public.challenge_progress_save(text, integer, boolean, integer), public.tournament_answer_save(uuid, integer, boolean, integer), public.claim_tournament_xp(text) to authenticated;

-- ===== ZAČÁTEK BLOKU: Jak odpověděli ostatní – souhrnné statistiky odpovědí (schéma 6) =====
-- Samostatný blok (tabulky answer_stats a answer_stats_limits, funkce answer_stats_*, dev_suspicious_questions); mimo něj mění jen číslo verze na konci.
-- Po dohrané hře pošle aplikace přihlášeného hráče jednou dávkou (answer_stats_submit, nejvýš 30 odpovědí) své odpovědi: téma, položka (Wikidata Q…),
-- druh otázky, způsob odpovídání (choices = výběr z možností, typed = psaní), správně / špatně a u špatné odpovědi id zvolené nesprávné možnosti.
-- Server k otázce jen přičte do souhrnných počítadel (zobrazeno, správně, nejčastější nesprávné možnosti); kdo, kdy a jak odpověděl, se neukládá.
-- O hráči leží jen řádek v answer_stats_limits kvůli limitu: počet dávek a odpovědí v aktuální hodině a otisky (hashtext) otázek, které se v ní
-- už započetly (každá otázka se od jednoho hráče započte nejvýš jednou za hodinu: proti dvojímu započtení po ztracené odpovědi serveru a proti
-- „nafukování“ jedné otázky). Řádek se po dvou hodinách maže (a se smazáním účtu hned). Souhrn tématu čte přihlášený hráč přes answer_stats_topic
-- (jen otázky s aspoň 20 odpověďmi), podezřelé otázky jen dev_admins přes dev_suspicious_questions; tabulky samy přes API nikdo nečte ani nezapisuje.
create table if not exists public.answer_stats (
    topic text not null,
    item_id text not null,
    kind text not null,
    variant text not null,
    shown bigint not null default 0,
    correct bigint not null default 0,
    -- nejčastější nesprávné možnosti { "<id možnosti>": počet }, nejvýš 8 (answer_stats_bump)
    wrong jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (topic, item_id, kind, variant)
);
alter table public.answer_stats drop constraint if exists answer_stats_values;
alter table public.answer_stats add constraint answer_stats_values check (
    topic ~ '^[a-z0-9-]{1,24}$' and item_id ~ '^Q[1-9][0-9]{0,11}$' and kind ~ '^[a-z0-9-]{1,24}$' and variant in ('choices', 'typed')
    and shown >= 0 and correct >= 0 and correct <= shown and jsonb_typeof(wrong) = 'object');
alter table public.answer_stats enable row level security;
-- žádná pravidla řádků: čtení i zápis jen přes funkce níž

create table if not exists public.answer_stats_limits (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    window_start timestamptz not null default now(),
    batch_count integer not null default 0,
    answer_count integer not null default 0,
    seen integer[] not null default '{}'
);
create index if not exists answer_stats_limits_window_idx on public.answer_stats_limits (window_start);
alter table public.answer_stats_limits enable row level security;

-- Počítadlo nesprávných možností: nejvýš 8 nejčastějších (Space-Saving: nová možnost při plném počítadle vystřídá tu nejméně
-- častou a převezme její počet + 1, takže možnost, kterou hráči volí opravdu často, v počítadle zůstane vždy)
create or replace function public.answer_stats_bump(counts jsonb, choice text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare low_key text; low_value bigint;
begin
    if choice is null then return counts; end if;
    if counts ? choice then return jsonb_set(counts, array[choice], to_jsonb((counts ->> choice)::bigint + 1)); end if;
    if (select count(*) from jsonb_object_keys(counts)) < 8 then return counts || jsonb_build_object(choice, 1); end if;
    select e.key, e.value::bigint into low_key, low_value from jsonb_each_text(counts) e order by e.value::bigint asc, e.key asc limit 1;
    return (counts - low_key) || jsonb_build_object(choice, low_value + 1);
end;
$$;

-- Dávka odpovědí přihlášeného hráče: [{ "t": téma, "q": "Q123", "k": druh, "v": "choices" | "typed", "c": true | false, "w": id nesprávné možnosti }].
-- Víc než 30 odpovědí najednou nebo jiný tvar než pole = chyba; jednotlivá odpověď ve špatném tvaru se jen přeskočí. Limit na hráče:
-- nejvýš 30 dávek a 300 odpovědí za hodinu, každá otázka (téma, položka, druh, způsob) jednou za hodinu; co je nad limit, se potichu nezapočte.
-- Vrací počet započtených odpovědí.
create or replace function public.answer_stats_submit(answers jsonb) returns integer
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
    uid uuid := auth.uid();
    lim public.answer_stats_limits;
    entry jsonb;
    t text; q text; k text; v text; c boolean; w text; h integer;
    counted integer := 0;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if answers is null or jsonb_typeof(answers) <> 'array' then raise exception 'Neplatná dávka odpovědí.' using errcode = '22023'; end if;
    if jsonb_array_length(answers) > 30 then raise exception 'Příliš mnoho odpovědí najednou.' using errcode = '22023'; end if;
    -- souběžné dávky téhož hráče jdou po sobě (limit a otisky)
    perform pg_advisory_xact_lock(hashtext('answer_stats:' || uid::text));
    delete from public.answer_stats_limits l where l.window_start < now() - interval '2 hours';
    insert into public.answer_stats_limits (user_id) values (uid) on conflict (user_id) do nothing;
    select * into lim from public.answer_stats_limits l where l.user_id = uid;
    if lim.window_start < now() - interval '1 hour' then
        lim.window_start := now(); lim.batch_count := 0; lim.answer_count := 0; lim.seen := '{}';
    end if;
    if lim.batch_count >= 30 then return 0; end if;
    lim.batch_count := lim.batch_count + 1;
    for entry in select e.value from jsonb_array_elements(answers) e loop
        exit when lim.answer_count >= 300;
        if jsonb_typeof(entry) <> 'object' or coalesce(jsonb_typeof(entry -> 'c'), '') <> 'boolean' then continue; end if;
        t := entry ->> 't'; q := entry ->> 'q'; k := entry ->> 'k'; v := entry ->> 'v';
        c := (entry ->> 'c')::boolean;
        w := case when jsonb_typeof(entry -> 'w') = 'string' then entry ->> 'w' end;
        if t is null or t !~ '^[a-z0-9-]{1,24}$' or q is null or q !~ '^Q[1-9][0-9]{0,11}$' or k is null or k !~ '^[a-z0-9-]{1,24}$'
            or v is null or v not in ('choices', 'typed') then continue; end if;
        -- nesprávná možnost jen u špatné odpovědi: krátký text bez řídicích znaků, jiný než hádaná položka
        if c or w is null or char_length(w) not between 1 and 60 or w ~ '[[:cntrl:]]' or w = q then w := null; end if;
        h := hashtext(t || '/' || q || '/' || k || '/' || v);
        if h = any(lim.seen) then continue; end if;
        lim.seen := array_append(lim.seen, h);
        lim.answer_count := lim.answer_count + 1;
        insert into public.answer_stats as s (topic, item_id, kind, variant, shown, correct, wrong)
            values (t, q, k, v, 1, case when c then 1 else 0 end, public.answer_stats_bump('{}'::jsonb, w))
            on conflict (topic, item_id, kind, variant) do update
            set shown = s.shown + 1, correct = s.correct + (case when c then 1 else 0 end), wrong = public.answer_stats_bump(s.wrong, w), updated_at = now();
        counted := counted + 1;
    end loop;
    update public.answer_stats_limits l set window_start = lim.window_start, batch_count = lim.batch_count, answer_count = lim.answer_count, seen = lim.seen
        where l.user_id = uid;
    return counted;
end;
$$;

-- Souhrn tématu pro aplikaci (stáhne ho nejvýš jednou denně): [[položka, druh, 'c' | 't', zobrazeno, správně], …],
-- jen otázky s aspoň 20 odpověďmi, nejvýš 8 000 nejhranějších
create or replace function public.answer_stats_topic(topic_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if topic_id is null or topic_id !~ '^[a-z0-9-]{1,24}$' then raise exception 'Neplatné téma.' using errcode = '22023'; end if;
    return coalesce((
        select jsonb_agg(jsonb_build_array(s.item_id, s.kind, case when s.variant = 'typed' then 't' else 'c' end, s.shown, s.correct) order by s.shown desc, s.item_id, s.kind, s.variant)
        from (select a.item_id, a.kind, a.variant, a.shown, a.correct from public.answer_stats a
              where a.topic = topic_id and a.shown >= 20 order by a.shown desc, a.item_id, a.kind, a.variant limit 8000) s
    ), '[]'::jsonb);
end;
$$;

-- Podezřelé otázky (jen dev_admins): u výběru z možností úspěšnost pod 25 % (hůř než tipování) při aspoň min_n odpovědích (výchozí 50),
-- nebo jedna nesprávná možnost volená častěji než správná odpověď (při aspoň 20 odpovědích). Nejpodezřelejší první, nejvýš 100.
-- reason: 'mate' = nesprávná možnost vede, 'nizka' = nízká úspěšnost
create or replace function public.dev_suspicious_questions(min_n integer default 50) returns table (
    topic text, item_id text, kind text, variant text, shown bigint, correct bigint, top_wrong text, top_wrong_count bigint, reason text
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare n integer := greatest(20, least(coalesce(min_n, 50), 1000000));
begin
    perform public.dev_check();
    return query
        with ranked as (
            select s.topic, s.item_id, s.kind, s.variant, s.shown, s.correct, w.key as wrong_key, coalesce(w.value::bigint, 0) as wrong_count
            from public.answer_stats s
            left join lateral (select e.key, e.value from jsonb_each_text(s.wrong) e order by e.value::bigint desc, e.key asc limit 1) w on true
            where s.shown >= 20
        )
        select r.topic, r.item_id, r.kind, r.variant, r.shown, r.correct, r.wrong_key, r.wrong_count,
            case when r.wrong_count > r.correct then 'mate' else 'nizka' end
        from ranked r
        where r.wrong_count > r.correct or (r.variant = 'choices' and r.shown >= n and r.correct * 4 < r.shown)
        order by (r.wrong_count - r.correct)::numeric / r.shown desc, r.correct::numeric / r.shown asc, r.shown desc, r.topic, r.item_id
        limit 100;
end;
$$;

revoke all on public.answer_stats, public.answer_stats_limits from anon, authenticated;
revoke all on function public.answer_stats_bump(jsonb, text) from public, anon, authenticated;
revoke all on function public.answer_stats_submit(jsonb), public.answer_stats_topic(text), public.dev_suspicious_questions(integer) from public, anon;
grant execute on function public.answer_stats_submit(jsonb), public.answer_stats_topic(text), public.dev_suspicious_questions(integer) to authenticated;
-- ===== KONEC BLOKU: Jak odpověděli ostatní =====
-- ===== Kvíz dne (schéma 7) — ZAČÁTEK BLOKU =====
-- Každý den (pražský čas) stejných 10 otázek pro všechny hráče: otázky losuje aplikace ze semínka dne (daily-quiz.js), server hlídá jeden
-- započítaný pokus na hráče a den, pořadí a sérii. Řádek pokusu vzniká při daily_quiz_start() a den určuje server, takže pokus nejde začít znovu
-- (ani po smazání dat nebo na jiném zařízení). Odpovědi se ukládají po otázkách (daily_quiz_answer): jen další otázka v pořadí, nic přeskočit
-- ani přepsat, body jen 1–4 za správnou (výběr z možností) a 0 za špatnou. Rozehraný pokus jde dokončit později, čas ale běží dál: server ke každé
-- odpovědi započte aspoň dobu od předchozí odpovědi (nebo od začátku) bez 15 s na načtení otázky, nejvýš 5 minut na otázku. Odpověď rychlejší
-- než 0,5 s server odmítne. Po půlnoci se nedohraný pokus počítá, jak stál (nezodpovězené otázky jako špatné). Pořadí: víc bodů, při shodě kratší čas.
-- Tabulku hráč jen čte (svůj řádek); zapisují jen funkce níže. Pořadí dne a přátel vracejí funkce s právy vlastníka a jen veřejné údaje profilu.
create table if not exists public.daily_quiz_results (
    user_id uuid not null references public.profiles (id) on delete cascade,
    day date not null,
    answered smallint not null default 0,
    correct smallint not null default 0,
    score smallint not null default 0,
    time_ms integer not null default 0,
    -- bit i = otázka i zodpovězená správně (sdílená mřížka 🟩🟥)
    bitmap integer not null default 0,
    -- volání start/answer v tomto dni (limit proti zahlcení)
    calls smallint not null default 0,
    started_at timestamptz not null default now(),
    last_at timestamptz not null default now(),
    finished_at timestamptz,
    primary key (user_id, day)
);
alter table public.daily_quiz_results drop constraint if exists daily_quiz_results_values;
alter table public.daily_quiz_results add constraint daily_quiz_results_values check (
    answered between 0 and 10 and correct between 0 and answered and score between correct and 4 * correct
    and time_ms between 0 and 3000000 and bitmap >= 0 and bitmap < (1 << answered::integer)
    and correct = length(replace((bitmap::bit(10))::text, '0', ''))
    and calls between 0 and 1000 and (finished_at is null) = (answered < 10));
create index if not exists daily_quiz_results_rank on public.daily_quiz_results (day, score desc, time_ms);
alter table public.daily_quiz_results enable row level security;
drop policy if exists "kvíz dne: vlastní řádky" on public.daily_quiz_results;
create policy "kvíz dne: vlastní řádky" on public.daily_quiz_results for select to authenticated using (user_id = auth.uid());
revoke all on public.daily_quiz_results from anon, authenticated;
grant select on public.daily_quiz_results to authenticated;

-- Den kvízu (Praha); mudrlant.test_today používají jen testy (z API ho klient nastavit nemůže)
create or replace function public.daily_quiz_today() returns date
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_today', true), '')::date, (now() at time zone 'Europe/Prague')::date)
$$;
-- Série hráče: dny po sobě s odehraným kvízem (dnešek jen dohraný, minulé dny i nedohrané) končící dnes nebo včera, a nejdelší série
create or replace function public.daily_quiz_streaks(uid uuid, today date) returns table (streak integer, best integer)
language sql stable set search_path = public as $$
    with played as (
        select r.day from public.daily_quiz_results r
        where r.user_id = uid and r.answered > 0 and (r.finished_at is not null or r.day < today) and r.day <= today
    ), runs as (
        select min(p.day) as first_day, max(p.day) as last_day, count(*)::integer as len
        from (select day, day - (row_number() over (order by day))::integer as grp from played) p group by p.grp
    )
    select coalesce((select len from runs where last_day >= today - 1 order by last_day desc limit 1), 0),
           coalesce((select max(len) from runs), 0)
$$;
-- Stav pokusu jako JSON pro aplikaci (r bez řádku = ještě nezačatý)
create or replace function public.daily_quiz_json(r public.daily_quiz_results, d date, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('day', d, 'started', r.user_id is not null, 'answered', coalesce(r.answered, 0), 'correct', coalesce(r.correct, 0),
        'score', coalesce(r.score, 0), 'time_ms', coalesce(r.time_ms, 0), 'bitmap', coalesce(r.bitmap, 0), 'finished', r.finished_at is not null,
        'streak', s.streak, 'best_streak', s.best)
    from public.daily_quiz_streaks(uid, d) s
$$;

-- Dnešní stav přihlášeného hráče (nic nezakládá)
create or replace function public.daily_quiz_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.daily_quiz_today(); r public.daily_quiz_results;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into r from public.daily_quiz_results where user_id = uid and day = d;
    return public.daily_quiz_json(r, d, uid);
end;
$$;

-- Začátek (nebo pokračování) dnešního pokusu: řádek vznikne jen jednou, čas začátku určuje server. Nejvýš 40 volání start/answer za den.
create or replace function public.daily_quiz_start() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.daily_quiz_today(); r public.daily_quiz_results;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    insert into public.daily_quiz_results (user_id, day) values (uid, d) on conflict (user_id, day) do nothing;
    select * into r from public.daily_quiz_results where user_id = uid and day = d for update;
    if r.calls >= 40 then raise exception 'Příliš mnoho pokusů o uložení Kvízu dne. Zkus to zítra.' using errcode = '22023'; end if;
    update public.daily_quiz_results set calls = calls + 1 where user_id = uid and day = d returning * into r;
    return public.daily_quiz_json(r, d, uid);
end;
$$;

-- Odpověď na otázku idx (od 0) dnešního kvízu; for_day = den, pro který aplikace otázky losovala (po půlnoci už neplatí).
-- Stejná odpověď poslaná znovu (ztracená odpověď serveru) nic nezmění; jinou odpověď na zodpovězenou otázku server odmítne.
create or replace function public.daily_quiz_answer(for_day date, idx integer, is_correct boolean, points integer, ms integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.daily_quiz_today(); r public.daily_quiz_results; gap bigint; counted integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if for_day is distinct from d then raise exception 'Tenhle Kvíz dne už skončil. Dnes je nový.' using errcode = '22023'; end if;
    if idx is null or idx < 0 or idx > 9 or is_correct is null or points is null or ms is null then raise exception 'Neplatná odpověď.' using errcode = '22023'; end if;
    if (is_correct and (points < 1 or points > 4)) or (not is_correct and points <> 0) then raise exception 'Neplatné body.' using errcode = '22023'; end if;
    select * into r from public.daily_quiz_results where user_id = uid and day = d for update;
    if r.user_id is null then raise exception 'Kvíz dne nejdřív začni.' using errcode = '22023'; end if;
    if r.calls >= 40 then raise exception 'Příliš mnoho pokusů o uložení Kvízu dne. Zkus to zítra.' using errcode = '22023'; end if;
    if idx < r.answered then
        if ((r.bitmap >> idx) & 1 = 1) = is_correct then
            update public.daily_quiz_results set calls = calls + 1 where user_id = uid and day = d returning * into r;
            return public.daily_quiz_json(r, d, uid);
        end if;
        raise exception 'Na tuhle otázku už odpověď máš.' using errcode = '22023';
    end if;
    if idx > r.answered then raise exception 'Nejdřív se musí uložit předchozí otázka.' using errcode = '22023'; end if;
    if ms < 500 then raise exception 'Odpověď přišla příliš rychle.' using errcode = '22023'; end if;
    -- čas na otázku: aspoň to, co uplynulo od předchozí odpovědi (bez 15 s na načtení), nejvýš 5 minut
    gap := floor(extract(epoch from (now() - r.last_at)) * 1000)::bigint;
    counted := least(greatest(ms::bigint, gap - 15000), 300000)::integer;
    update public.daily_quiz_results set
        answered = answered + 1,
        correct = correct + (case when is_correct then 1 else 0 end),
        score = score + points,
        time_ms = time_ms + counted,
        bitmap = bitmap | (case when is_correct then 1 << idx else 0 end),
        last_at = now(),
        calls = calls + 1,
        finished_at = case when answered + 1 = 10 then now() end
    where user_id = uid and day = d
    returning * into r;
    return public.daily_quiz_json(r, d, uid);
end;
$$;

-- Pokusy, které se v daném dni počítají do pořadí: dohrané, a u minulých dnů i nedohrané (jak stály)
create or replace function public.daily_quiz_counted(d date, today date) returns setof public.daily_quiz_results
language sql stable set search_path = public as $$
    select r.* from public.daily_quiz_results r where r.day = d and r.answered > 0 and (r.finished_at is not null or r.day < today)
$$;

-- Pořadí dne: top N (výchozí 50, nejvýš 100) a moje místo; for_day null = dnes, jinak nejvýš 30 dní zpět. Jen veřejné údaje profilu.
create or replace function public.daily_quiz_board(for_day date default null, top_n integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := public.daily_quiz_today(); d date := coalesce(for_day, public.daily_quiz_today());
    n integer := least(greatest(coalesce(top_n, 50), 1), 100); result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if d > today or d < today - 30 then raise exception 'Pořadí Kvízu dne je jen za posledních 30 dní.' using errcode = '22023'; end if;
    with ranked as (
        select c.user_id, c.score, c.correct, c.time_ms, c.bitmap, c.answered,
            (rank() over (order by c.score desc, c.time_ms))::integer as place,
            (row_number() over (order by c.score desc, c.time_ms, c.finished_at nulls last, c.user_id))::integer as pos
        from public.daily_quiz_counted(d, today) c
    )
    select jsonb_build_object(
        'day', d,
        'total', (select count(*) from ranked),
        'top', coalesce((select jsonb_agg(jsonb_build_object('rank', k.place, 'id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color,
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'score', k.score, 'correct', k.correct, 'time_ms', k.time_ms, 'me', k.user_id = uid) order by k.pos)
            from ranked k join public.profiles p on p.id = k.user_id where k.pos <= n), '[]'::jsonb),
        'me', (select jsonb_build_object('rank', k.place, 'score', k.score, 'correct', k.correct, 'time_ms', k.time_ms, 'bitmap', k.bitmap, 'answered', k.answered)
            from ranked k where k.user_id = uid),
        'streak', s.streak, 'best_streak', s.best
    ) into result
    from public.daily_quiz_streaks(uid, today) s;
    return result;
end;
$$;

-- Pořadí mezi přáteli (přijatá přátelství oběma směry) a mnou; friends = počet přátel (aplikace pozná „nemáš přátele“ od „ještě nehráli“)
create or replace function public.daily_quiz_friends(for_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := public.daily_quiz_today(); d date := coalesce(for_day, public.daily_quiz_today()); result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if d > today or d < today - 30 then raise exception 'Pořadí Kvízu dne je jen za posledních 30 dní.' using errcode = '22023'; end if;
    with circle as (
        select case when f.user_id = uid then f.friend_id else f.user_id end as id
        from public.friendships f where f.status = 'accepted' and uid in (f.user_id, f.friend_id)
    ), ranked as (
        select c.user_id, c.score, c.correct, c.time_ms,
            (rank() over (order by c.score desc, c.time_ms))::integer as place,
            (row_number() over (order by c.score desc, c.time_ms, c.finished_at nulls last, c.user_id))::integer as pos
        from public.daily_quiz_counted(d, today) c where c.user_id = uid or c.user_id in (select id from circle)
    )
    select jsonb_build_object(
        'day', d,
        'friends', (select count(*) from circle),
        'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', k.place, 'id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color,
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'score', k.score, 'correct', k.correct, 'time_ms', k.time_ms, 'me', k.user_id = uid) order by k.pos)
            from ranked k join public.profiles p on p.id = k.user_id where k.pos <= 200), '[]'::jsonb)
    ) into result;
    return result;
end;
$$;

-- Pomocné funkce jen interně; hráč volá jen stav, start, odpověď, pořadí a přátele (anon nic)
revoke all on function public.daily_quiz_today(), public.daily_quiz_streaks(uuid, date), public.daily_quiz_json(public.daily_quiz_results, date, uuid),
    public.daily_quiz_counted(date, date) from public, anon, authenticated;
revoke all on function public.daily_quiz_state(), public.daily_quiz_start(), public.daily_quiz_answer(date, integer, boolean, integer, integer),
    public.daily_quiz_board(date, integer), public.daily_quiz_friends(date) from public, anon;
grant execute on function public.daily_quiz_state(), public.daily_quiz_start(), public.daily_quiz_answer(date, integer, boolean, integer, integer),
    public.daily_quiz_board(date, integer), public.daily_quiz_friends(date) to authenticated;
-- ===== Kvíz dne (schéma 7) — KONEC BLOKU =====

-- ===== Odměny (schéma 9) — ZAČÁTEK BLOKU =====
-- Truhla Mudrlanta, ochrana série a diplomy (rewards.js): co hráč z truhly dostal, kolik má ochran a které dny zachránily, kdy získal
-- diplomy. Aplikace drží stav v zařízení a s účtem ho sjednocuje (věci, truhly a dny se sčítají, počet ochran platí z novější změny),
-- aby přežil přeinstalaci. Jen kosmetika bez peněz: databáze hlídá tvar a velikost, obsah ověřuje aplikace. Odznaky schématu 9 jsou
-- v badge_catalog() výše. Export dat (export_my_data) bere celý řádek profilu, takže sloupec obsahuje i on.
alter table public.profiles add column if not exists rewards jsonb;
alter table public.profiles drop constraint if exists profiles_rewards_shape;
alter table public.profiles add constraint profiles_rewards_shape check (rewards is null or (jsonb_typeof(rewards) = 'object' and pg_column_size(rewards) <= 8000)) not valid;
grant update (rewards) on public.profiles to authenticated;
-- ===== Odměny (schéma 9) — KONEC BLOKU =====

-- ===== Verze schématu =====
-- Číslo se zvyšuje při KAŽDÉ změně tohoto souboru (tabulka, sloupec, funkce, pravidlo) a zároveň konstanta REQUIRED_SCHEMA v app.js.
-- Aplikace ho po přihlášení porovná a správci (dev_admins nebo vývojářský režim) ukáže v Nastavení, že má schéma spustit znovu;
-- tests/sql-monitor.test.js hlídá, že se obě čísla shodují. Funkce patří na konec souboru: když spuštění skončí chybou dřív, verze zůstane stará.
-- 3: průběh výzev a zápasů turnaje na serveru (challenge_progress, tournament_answers), XP za výhry v turnaji jednou za účet (tournament_xp_claims).
-- 4: zkušební upozornění přes server pro dev_admins (push_tests, dev_push_test, druh 'test' v push_due a push_mark).
-- 5: okamžité odesílání upozornění (push_kick přes pg_cron a pg_net, push_kick_state, push_pending sdílené s push_due, dev_push_status).
-- 6: Jak odpověděli ostatní (answer_stats, answer_stats_limits, answer_stats_submit, answer_stats_topic, dev_suspicious_questions).
-- 7: Kvíz dne (daily_quiz_results, daily_quiz_state/start/answer/board/friends; export_my_data má i 'kviz_dne').
-- 9: Odměny (profiles.rewards: Truhla Mudrlanta, ochrana série, diplomy) a odznaky Kvízu dne, Bleskovky, Přežití, mapy, odhadu a Seřaď v badge_catalog().
create or replace function public.schema_version() returns integer
language sql immutable as $$ select 9 $$;
revoke all on function public.schema_version() from public, anon;
grant execute on function public.schema_version() to authenticated;
