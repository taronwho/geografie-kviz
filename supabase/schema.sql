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
-- Obtížnost výzvy: 1 Základní, 2 Mudrlant, 3 Mudrlant Expert (null = podle include_hard; starší klienti znají jen include_hard)
alter table public.challenges add column if not exists level smallint;
do $$ begin
    alter table public.challenges add constraint challenges_level_check check (level is null or level between 1 and 3);
exception when duplicate_object then null; end $$;
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
        'serad-5', 'serad-25', 'serad-100', 'serad-250', 'serad-500',
        -- Schéma 18: Album sbírky (milníky sbírky a celé sekce alba)
        'sberatel-25', 'sberatel-50', 'sberatel-75', 'sberatel-100',
        'album-avatars', 'album-accessories', 'album-themes', 'album-badges', 'album-diplomas',
        -- Schéma 19: Tajemná otázka dne (vyřešené tajemné otázky)
        'detektiv', 'detektiv-7', 'detektiv-30', 'detektiv-100', 'detektiv-365',
        -- Schéma 21: Zlatá otázka (správně zodpovězené zlaté otázky)
        'zlatokop-10', 'zlatokop-50', 'zlatokop-100',
        -- Schéma 21: Boss týdne (emblémy poražených bossů)
        'boss-kapitan', 'boss-rytir', 'boss-alchymista', 'boss-amper', 'boss-maestro', 'boss-druid', 'boss-olympan', 'boss-reziser',
        -- Schéma 21: Dobývání (vyhrané hry)
        'dobyvatel', 'dobyvatel-3', 'dobyvatel-10', 'dobyvatel-25', 'dobyvatel-50',
        -- Schéma 21: Kamarádské sázky (rozhodnuté sázky a vyhrané sázky v řadě)
        'sazky-1', 'sazkar', 'sazky-15', 'sazky-30', 'sazky-60', 'sazky-v-rade-3', 'sazky-v-rade-5', 'sazky-v-rade-7', 'sazky-v-rade-10', 'sazky-v-rade-15'
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
-- Vítěz je ten s víc body, při shodě s víc správnými odpověďmi; shoda obojího = remíza. Třetí a další hráč s kódem už rating nemění.
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
    -- Výzvu skupině (schéma 8, tabulka je níž v souboru) hraje víc hráčů najednou: do ratingu se nepočítá
    if exists (select 1 from public.group_challenges gc where gc.challenge_id = new.challenge_id) then return null; end if;
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
    -- o vítězi rozhodnou body (nápovědy a psaní se počítají), při shodě víc správných odpovědí
    if other.points <> new.points then score_a := case when other.points > new.points then 1 else 0 end;
    elsif other.correct <> new.correct then score_a := case when other.correct > new.correct then 1 else 0 end;
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
-- ve dvojici postoupí ten s více body, pak s více správnými odpověďmi, pak s rychlejším časem; kdo kolo neodehraje, prohrává kontumačně,
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

-- Vítěz zápasu: víc bodů, víc správných, rychlejší čas, dřívější přihlášení
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
            when r1.points <> r2.points then case when r1.points > r2.points then m.p1 else m.p2 end
            when r1.correct <> r2.correct then case when r1.correct > r2.correct then m.p1 else m.p2 end
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
    -- boti v turnajích odehrají své kolo každý den od 9:00 (Praha); před posunem kol i po něm, ať stihnou včerejší kolo i nově otevřené
    perform public.tournament_bots_due();
    for t in select id from public.tournaments where status = 'running' loop
        perform public.tournament_progress(t.id);
    end loop;
    perform public.tournament_bots_due();
    -- vývojářští boti v Dobývání (blok 22) hrají sami i bez otevřené hry
    if to_regprocedure('public.conquest_bots_tick()') is not null then perform public.conquest_bots_tick(); end if;
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

-- Boti odehrají rozehraná kola: střední úroveň (každý bot má vlastní úspěšnost 45–80 %). Každou z 10 otázek odehrají jako hráč:
-- správně/špatně, nápovědy 0–3 (body 4/3/2/1 jako ve hře, špatně 0) a čas na otázku; výsledek zápasu je součet, takže rozpis zápasu
-- ukáže i jejich odpovědi po otázkách (text odpovědi server nezná, u správné ji aplikace doplní ze zadání)
create or replace function public.dev_bots_play(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur integer; m public.tournament_matches; uid uuid; p numeric; t public.tournaments;
    k integer; ok boolean; h integer; pts integer; q_ms integer; c integer; total integer; spent integer;
begin
    select * into t from public.tournaments where id = tid;
    select max(round) into cur from public.tournament_matches where tournament_id = tid;
    -- boti hrají jen kolo, jehož den už nastal (další kolo čeká na svůj den)
    if cur is null or t.started_on + (cur - 1) > public.tournament_today() then return; end if;
    for m in select * from public.tournament_matches where tournament_id = tid and round = cur and winner is null loop
        foreach uid in array array[m.p1, m.p2] loop
            if public.dev_is_bot(uid) and not exists (select 1 from public.tournament_results where match_id = m.id and user_id = uid and finished_at is not null) then
                p := 0.45 + 0.35 * (('x' || substr(md5(uid::text), 1, 6))::bit(24)::integer % 1000) / 1000.0;
                c := 0; total := 0; spent := 0;
                delete from public.tournament_answers where match_id = m.id and user_id = uid;
                for k in 0 .. 9 loop
                    ok := random() < p;
                    h := case when random() < 0.45 then 0 else 1 + floor(random() * 3)::integer end;
                    pts := case when ok then greatest(4 - h, 1) else 0 end;
                    q_ms := 3000 + floor(random() * 9000)::integer + h * 2500;
                    insert into public.tournament_answers (match_id, user_id, idx, correct, points, answer, hints, ms) values (m.id, uid, k, ok, pts, null, h, q_ms);
                    c := c + (case when ok then 1 else 0 end); total := total + pts; spent := spent + q_ms;
                end loop;
                insert into public.tournament_results (match_id, user_id, started_at, finished_at, correct, points, time_ms)
                    values (m.id, uid, now(), now(), c, total, spent)
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

-- Smaže všechny boty; turnaje, které už běžely nebo skončily s boty, se smažou celé (jejich pavouk by bez botů nedával smysl), otevřené turnaje přijdou jen o boty;
-- stejně hry Dobývání (blok 22)
create or replace function public.dev_tournament_clear_bots() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
    perform public.dev_check();
    delete from public.tournaments where status <> 'open' and id in (select e.tournament_id from public.tournament_entries e where public.dev_is_bot(e.user_id));
    -- Dobývání (blok 22): rozehrané a dohrané hry s boty zmizí celé, hry v lobby přijdou jen o boty
    if to_regclass('public.conquest_games') is not null then
        delete from public.conquest_games where status <> 'lobby' and id in (select pl.game_id from public.conquest_players pl where public.dev_is_bot(pl.user_id));
    end if;
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

-- Hodina dne v Praze, od které boti hrají své kolo (nastavení mudrlant.test_time používají jen testy; s nastaveným test_today
-- a bez test_time je půlnoc, ať testy s pevným dnem nezávisí na tom, kolik je zrovna hodin)
create or replace function public.tournament_clock() returns time
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_time', true), '')::time,
        case when coalesce(current_setting('mudrlant.test_today', true), '') <> '' then time '00:00' else (now() at time zone 'Europe/Prague')::time end)
$$;

-- Boti v běžících turnajích odehrají aktuální kolo: v den kola od 9:00, kolo z minulých dnů hned (když tick ráno nikdo nespustil).
-- Volá ji tournament_tick (otevření aplikace, odesílání upozornění a volitelně pg_cron), takže boti hrají bez zásahu vývojáře.
create or replace function public.tournament_bots_due() returns void
language plpgsql security definer set search_path = public as $$
declare t record; today date := public.tournament_today();
begin
    for t in select tr.id, tr.started_on, (select max(m.round) from public.tournament_matches m where m.tournament_id = tr.id) as cur
             from public.tournaments tr
             where tr.status = 'running' and exists (select 1 from public.tournament_entries e where e.tournament_id = tr.id and public.dev_is_bot(e.user_id)) loop
        if t.cur is not null and (t.started_on + (t.cur - 1) < today or (t.started_on + (t.cur - 1) = today and public.tournament_clock() >= time '09:00')) then
            perform public.dev_bots_play(t.id);
        end if;
    end loop;
end;
$$;

-- Vývojářské tlačítko „Boti odehrají kolo“: boti hned odehrají aktuální kolo (bez čekání na 9:00), kolo se neposouvá
create or replace function public.dev_tournament_bots_play(tid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare t public.tournaments; before integer; after integer;
begin
    perform public.dev_check();
    select * into t from public.tournaments where id = tid for update;
    if t.id is null or t.status <> 'running' then raise exception 'Turnaj neběží.' using errcode = '22023'; end if;
    select count(*) into before from public.tournament_results r join public.tournament_matches m on m.id = r.match_id
        where m.tournament_id = tid and r.finished_at is not null and public.dev_is_bot(r.user_id);
    perform public.dev_bots_play(tid);
    select count(*) into after from public.tournament_results r join public.tournament_matches m on m.id = r.match_id
        where m.tournament_id = tid and r.finished_at is not null and public.dev_is_bot(r.user_id);
    return after - before;
end;
$$;

revoke all on function public.dev_check(), public.dev_is_bot(uuid), public.dev_bots_play(uuid), public.tournament_bots_due() from public, anon, authenticated;
revoke all on function public.dev_tournament_add_bots(uuid, integer), public.dev_tournament_start_now(uuid), public.dev_tournament_next_round(uuid), public.dev_tournament_bots_play(uuid), public.dev_tournament_clear_bots(), public.dev_tournament_reset() from public, anon;
grant execute on function public.dev_tournament_add_bots(uuid, integer), public.dev_tournament_start_now(uuid), public.dev_tournament_next_round(uuid), public.dev_tournament_bots_play(uuid), public.dev_tournament_clear_bots(), public.dev_tournament_reset() to authenticated;

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
-- útoky soupeřů v Dobývání (blok 23) a pozvánky přátel do hry (blok 24)
alter table public.profiles add column if not exists push_conquest boolean not null default true;
grant update (push_tournament, push_challenge, push_conquest) on public.profiles to authenticated;

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

-- Co poslat: (a) dnešní neodehraný turnajový zápas, (b) nevyřízená příchozí výzva mladší než 3 dny a výsledek výzvy, kterou hráč založil, (c) nepřečtená zpráva o turnaji,
-- (e) útoky soupeřů v Dobývání (conquest_push_items, blok 23), (f) pozvánky přátel do hry Dobývání (conquest_invite_push_items, blok 24).
-- Jeden řádek na odběr (zařízení); z každého druhu nejvýš jedna věc na hráče a běh a nic, co téhož druhu dostal v poslední hodině
-- (útoky a pozvánky v Dobývání: v posledních 10 minutách, období hry bývá jen hodina a pozvaný se má přidat, dokud je místo).
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
            'Výzva na ' || c.count || ' otázek čeká v aplikaci. Zahraj si ji, než vyprší.', './?tab=multi&vyzva=' || c.id,
            'chal:' || c.id || ':' || c.invited_id, c.created_at::text
        from public.challenges c
        join public.profiles me on me.id = c.invited_id and me.push_challenge
        left join public.profiles cr on cr.id = c.creator_id
        where c.invited_id is not null and c.created_at > now() - interval '3 days'
            and not exists (select 1 from public.challenge_results r where r.challenge_id = c.id and r.user_id = c.invited_id)
        union all
        -- výsledek soupeře jen zakladateli, který výzvu už sám dohrál (jinak by věděl, kolik potřebuje, a mohl taktizovat)
        select c.creator_id, 'challenge', coalesce(op.display_name, 'Hráč') || ' odehrál tvoji výzvu',
            case when exists (select 1 from public.challenge_results mine where mine.challenge_id = c.id and mine.user_id = c.creator_id)
                then 'Dal ' || r.correct || ' z ' || c.count || ' správně. Podívej se, jak jsi na tom ty.'
                else 'Jeho výsledek uvidíš, až výzvu dohraješ i ty.' end, './?tab=multi&vyzva=' || c.id,
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
        union all
        -- (e) útoky soupeřů v Dobývání: jedno souhrnné upozornění za hru (tabulky Dobývání vznikají níž, plpgsql je hledá až při běhu)
        select c.user_id, c.kind, c.title, c.body, c.url, c.dedupe_key, c.sort_at from public.conquest_push_items() c
        union all
        -- (f) pozvánky přátel do hry Dobývání: jedno upozornění za pozvánku (druh 'conquest_invite', blok 24)
        select c.user_id, c.kind, c.title, c.body, c.url, c.dedupe_key, c.sort_at from public.conquest_invite_push_items() c
    ), fresh as (
        select i.*, row_number() over (partition by i.user_id, i.kind order by i.sort_at, i.dedupe_key) as rn
        from items i
        where not exists (select 1 from public.push_sent s where s.dedupe_key = i.dedupe_key)
            and (i.kind = 'test' or not exists (select 1 from public.push_sent s where s.user_id = i.user_id and s.kind = i.kind
                and s.sent_at > now() - case when i.kind in ('conquest', 'conquest_invite') then interval '10 minutes' else interval '55 minutes' end))
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
        case split_part(k, ':', 1) when 'tour' then 'tournament' when 'chal' then 'challenge' when 'chalr' then 'challenge' when 'notice' then 'notice' when 'test' then 'test'
            when 'cq' then 'conquest' when 'cqi' then 'conquest_invite' end
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
        'kviz_dne', coalesce((select jsonb_agg(to_jsonb(k) order by k.day) from public.daily_quiz_results k where k.user_id = uid), '[]'::jsonb),
        -- Skupiny (schéma 8): moje členství (u skupiny jen její údaje, ne ostatní členové), výzvy, které jsem poslal skupině, a XP po týdnech
        'skupiny', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nazev', g.name, 'ikona', g.icon, 'kod', g.code, 'zakladatel', g.owner_id = uid,
            'zalozena', g.created_at, 'clenem_od', m.joined_at) order by m.joined_at) from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = uid), '[]'::jsonb),
        'skupiny_vyzvy', coalesce((select jsonb_agg(jsonb_build_object('vyzva', gc.challenge_id, 'skupina', gc.group_id, 'vytvoreno', gc.created_at) order by gc.created_at)
            from public.group_challenges gc join public.challenges c on c.id = gc.challenge_id where c.creator_id = uid), '[]'::jsonb),
        'xp_tydny', coalesce((select jsonb_agg(to_jsonb(x) order by x.week) from public.xp_weekly x where x.user_id = uid), '[]'::jsonb),
        -- Zamrzlé otázky (schéma 17), které hráč sestavil jako první (jen semínko a čas; otázka sama osobní údaj není)
        'zamrzle_otazky', coalesce((select jsonb_agg(jsonb_build_object('seminko', s.seed, 'vytvoreno', s.created_at) order by s.created_at)
            from public.question_snapshots s where s.created_by = uid), '[]'::jsonb),
        -- Tajemná otázka dne (schéma 19): moje tipy po dnech (bez odpovědí, ty server nezná)
        'tajemna_otazka', coalesce((select jsonb_agg(to_jsonb(m) order by m.day) from public.mystery_results m where m.user_id = uid), '[]'::jsonb),
        -- Boss týdne (schéma 21): moje výsledky po týdnech (nejlepší poškození, výhra, pokusy, vyzvednutý společný bonus)
        'boss_tydne', coalesce((select jsonb_agg(to_jsonb(b) order by b.week) from public.boss_results b where b.user_id = uid), '[]'::jsonb),
        -- Řetězovka dne (schéma 21): moje výsledky po dnech
        'retezovka', coalesce((select jsonb_agg(to_jsonb(r) order by r.day) from public.chain_results r where r.user_id = uid), '[]'::jsonb)
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

-- Moji přátelé a žádosti (oběma směry) s profilem, poslední aktivitou a vzájemnou bilancí z výzev (víc bodů, pak víc správných)
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
            (count(*) filter (where m.points > o.points or (m.points = o.points and m.correct > o.correct)))::integer as wins,
            (count(*) filter (where m.points < o.points or (m.points = o.points and m.correct < o.correct)))::integer as losses,
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

-- ===== Skupiny (schéma 8) — ZAČÁTEK BLOKU =====
-- Soukromé skupiny (třída, rodina, kamarádi) s vlastním pořadím. Skupinu založí přihlášený hráč (název 2–40 znaků, ikona z nabídky), ostatní se přidají
-- šestiznakovým kódem nebo odkazem …?skupina=KÓD. Zakladatel skupinu přejmenuje, vygeneruje nový kód (starý přestane platit), odebere člena nebo
-- skupinu smaže; člen ji může opustit. Hráč je nejvýš v 10 skupinách, skupina má nejvýš 50 členů. Skupinu a její členy vidí jen členové (RLS);
-- zapisuje se jen přes funkce níže (s právy vlastníka, s kontrolou vstupů a oprávnění). Pořadí skupiny: Kvíz dne dnes a součet za týden
-- (daily_quiz_results) a XP získané tento týden (xp_weekly). Vrací se jen veřejné údaje profilu (jméno, obrázek, barva, rámeček, titul, sova).
-- Výzva skupině: jedna výzva pro kohokoli s kódem (challenges bez invited_id), kterou hrají všichni členové; do ratingu se nepočítá (rate_challenge).

-- Týdenní XP: XP v účtu (profiles.xp) posílá aplikace po každé hře a server ho jen zvyšuje (protect_rating). Spoušť níže zapíše přírůstek do
-- týdne (pondělí, Praha). Jeden zápis se počítá nejvýš do 1500 XP (víc nedá ani několik her offline) a první nahrání postupu do prázdného účtu
-- nad 1500 XP se do týdne nepočítá (to je dřívější postup ze zařízení, ne tento týden). Řádek vidí jen jeho hráč; ostatní jen součet přes group_detail.
create table if not exists public.xp_weekly (
    user_id uuid not null references public.profiles (id) on delete cascade,
    week date not null,
    gained integer not null default 0,
    primary key (user_id, week)
);
alter table public.xp_weekly drop constraint if exists xp_weekly_values;
alter table public.xp_weekly add constraint xp_weekly_values check (gained between 0 and 100000 and extract(isodow from week) = 1);
alter table public.xp_weekly enable row level security;
drop policy if exists "týdenní XP: vlastní" on public.xp_weekly;
create policy "týdenní XP: vlastní" on public.xp_weekly for select to authenticated using (user_id = auth.uid());

-- Pondělí týdne, do kterého patří den d
create or replace function public.group_week_start(d date) returns date
language sql immutable set search_path = public as $$ select d - (extract(isodow from d)::integer - 1) $$;

create or replace function public.count_weekly_xp() returns trigger
language plpgsql security definer set search_path = public as $$
declare gain integer;
begin
    if new.xp is null or old.xp is null or new.xp <= old.xp then return null; end if;
    if old.xp = 0 and new.xp > 1500 then return null; end if;
    gain := least(new.xp - old.xp, 1500);
    insert into public.xp_weekly (user_id, week, gained) values (new.id, public.group_week_start(public.daily_quiz_today()), gain)
    on conflict (user_id, week) do update set gained = least(public.xp_weekly.gained + excluded.gained, 100000);
    return null;
end;
$$;
drop trigger if exists profiles_weekly_xp on public.profiles;
create trigger profiles_weekly_xp after update of xp on public.profiles for each row when (new.xp > old.xp) execute function public.count_weekly_xp();

-- Ikony skupin (stejný seznam je v groups.js)
create or replace function public.group_icons() returns text[]
language sql immutable as $$ select array['🦉', '🏫', '🎒', '📚', '👪', '🏠', '🤝', '🌍', '🚀', '⚽', '🎨', '🎵', '🧪', '🦊', '🐼', '🔥']::text[] $$;

create table if not exists public.groups (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    icon text not null default '🦉',
    code text not null,
    owner_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now()
);
-- Název: 2–40 znaků bez okrajových a zdvojených mezer, bez řídicích znaků a znaků <>&"'`\ (aplikace navíc pustí jen písmena, číslice a pár znaků, jako u přezdívky)
alter table public.groups drop constraint if exists groups_name_format;
alter table public.groups add constraint groups_name_format check (char_length(name) between 2 and 40 and name = btrim(name) and name !~ '\s\s' and name !~ '[[:cntrl:]<>&"''`\\]');
alter table public.groups drop constraint if exists groups_icon_list;
alter table public.groups add constraint groups_icon_list check (icon = any (public.group_icons()));
alter table public.groups drop constraint if exists groups_code_format;
alter table public.groups add constraint groups_code_format check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');
create unique index if not exists groups_code_key on public.groups (code);
create index if not exists groups_owner_idx on public.groups (owner_id);

create table if not exists public.group_members (
    group_id uuid not null references public.groups (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id, joined_at);

-- Výzvy skupině (kód výzvy → skupina); smazáním výzvy nebo skupiny zmizí i propojení
create table if not exists public.group_challenges (
    challenge_id text primary key references public.challenges (id) on delete cascade,
    group_id uuid not null references public.groups (id) on delete cascade,
    created_at timestamptz not null default now()
);
create index if not exists group_challenges_group_idx on public.group_challenges (group_id, created_at desc);

-- Neúspěšné pokusy o kód skupiny (proti hádání kódů): nejvýš 20 za hodinu na hráče; přes API je nikdo nečte
create table if not exists public.group_join_tries (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    window_start timestamptz not null default now(),
    tries integer not null default 0
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_challenges enable row level security;
alter table public.group_join_tries enable row level security;

-- Je přihlášený hráč členem skupiny? (pro pravidla řádků; s právy vlastníka, ať se pravidlo group_members nevolá samo na sebe)
create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = auth.uid());
$$;
drop policy if exists "skupiny: vidí členové" on public.groups;
create policy "skupiny: vidí členové" on public.groups for select to authenticated using (public.is_group_member(id));
drop policy if exists "členové skupin: vidí členové" on public.group_members;
create policy "členové skupin: vidí členové" on public.group_members for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "výzvy skupin: vidí členové" on public.group_challenges;
create policy "výzvy skupin: vidí členové" on public.group_challenges for select to authenticated using (public.is_group_member(group_id));
revoke all on public.xp_weekly, public.groups, public.group_members, public.group_challenges, public.group_join_tries from anon, authenticated;
grant select on public.xp_weekly, public.groups, public.group_members, public.group_challenges to authenticated;

-- Nový kód skupiny: 6 znaků bez zaměnitelných (0/O, 1/I/L) z náhodných bajtů gen_random_uuid(); opakuje se, dokud není volný
create or replace function public.group_new_code() returns text
language plpgsql volatile set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; raw bytea; candidate text; attempt integer := 0;
begin
    loop
        raw := uuid_send(gen_random_uuid());
        candidate := '';
        for i in 0..5 loop candidate := candidate || substr(alphabet, 1 + get_byte(raw, i) % 31, 1); end loop;
        exit when not exists (select 1 from public.groups where code = candidate);
        attempt := attempt + 1;
        if attempt > 20 then raise exception 'Kód skupiny se nepodařilo vytvořit, zkus to znovu.' using errcode = 'P0001'; end if;
    end loop;
    return candidate;
end;
$$;
-- Název očištěný o okrajové a zdvojené mezery; neplatný skončí chybou
create or replace function public.group_clean_name(raw text) returns text
language plpgsql immutable set search_path = public as $$
declare cleaned text := btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'));
begin
    if char_length(cleaned) < 2 or char_length(cleaned) > 40 then raise exception 'Název skupiny má mít 2 až 40 znaků.' using errcode = '22023'; end if;
    if cleaned ~ '[[:cntrl:]<>&"''`\\]' then raise exception 'Název skupiny obsahuje nepovolený znak.' using errcode = '22023'; end if;
    return cleaned;
end;
$$;
create or replace function public.group_check_icon(raw text) returns text
language plpgsql immutable set search_path = public as $$
begin
    if raw is null or not (raw = any (public.group_icons())) then raise exception 'Vyber ikonu skupiny z nabídky.' using errcode = '22023'; end if;
    return raw;
end;
$$;
-- Kód z textu: velká písmena, bez mezer a pomlček; jiný tvar = null
create or replace function public.group_parse_code(raw text) returns text
language sql immutable set search_path = public as $$
    select case when c ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then c end from (select upper(regexp_replace(coalesce(raw, ''), '[\s-]', '', 'g')) as c) x
$$;
-- Jen zakladatel skupiny (jinak chyba); vrací skupinu
create or replace function public.group_owned(gid uuid, uid uuid) returns public.groups
language plpgsql stable set search_path = public as $$
declare g public.groups;
begin
    select * into g from public.groups where id = gid;
    if g.id is null or not exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid) then
        raise exception 'Tahle skupina neexistuje nebo v ní nejsi.' using errcode = '42501';
    end if;
    if g.owner_id <> uid then raise exception 'Tohle může jen zakladatel skupiny.' using errcode = '42501'; end if;
    return g;
end;
$$;
-- Skupina jako JSON pro člena (kód vidí každý člen, ať ho může poslat dál)
create or replace function public.group_json(g public.groups, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', g.id, 'name', g.name, 'icon', g.icon, 'code', g.code, 'owner_id', g.owner_id, 'is_owner', g.owner_id = uid, 'created_at', g.created_at,
        'members', (select count(*) from public.group_members m where m.group_id = g.id))
$$;
-- Neúspěšný pokus o kód se započte (funkce pak vrací null, ne chybu, ať se zápis nevrátí); okno je hodina
create or replace function public.group_code_try(uid uuid, hit boolean) returns void
language plpgsql set search_path = public as $$
begin
    if hit then return; end if;
    insert into public.group_join_tries (user_id, window_start, tries) values (uid, now(), 1)
    on conflict (user_id) do update set
        tries = case when public.group_join_tries.window_start < now() - interval '1 hour' then 1 else public.group_join_tries.tries + 1 end,
        window_start = case when public.group_join_tries.window_start < now() - interval '1 hour' then now() else public.group_join_tries.window_start end;
end;
$$;
create or replace function public.group_code_blocked(uid uuid) returns boolean
language sql stable set search_path = public as $$
    select exists (select 1 from public.group_join_tries t where t.user_id = uid and t.tries >= 20 and t.window_start >= now() - interval '1 hour')
$$;

-- Založení skupiny: zakladatel je hned jejím členem
create or replace function public.group_create(group_name text, group_icon text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.groups; clean text; ico text;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    clean := public.group_clean_name(group_name);
    ico := public.group_check_icon(group_icon);
    perform pg_advisory_xact_lock(hashtext('groups:' || uid::text));
    if (select count(*) from public.group_members where user_id = uid) >= 10 then
        raise exception 'Můžeš být nejvýš v 10 skupinách. Nejdřív nějakou opusť.' using errcode = 'P0001';
    end if;
    insert into public.groups (name, icon, code, owner_id) values (clean, ico, public.group_new_code(), uid) returning * into g;
    insert into public.group_members (group_id, user_id) values (g.id, uid);
    return public.group_json(g, uid);
end;
$$;

-- Náhled skupiny podle kódu (před přidáním): název, ikona, počet členů, zakladatel a jestli už jsem členem; neznámý kód = null
create or replace function public.group_preview(join_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text := public.group_parse_code(join_code); g public.groups;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if public.group_code_blocked(uid) then raise exception 'Příliš mnoho špatných kódů. Zkus to za hodinu.' using errcode = 'P0001'; end if;
    if c is not null then select * into g from public.groups where code = c; end if;
    perform public.group_code_try(uid, g.id is not null);
    if g.id is null then return null; end if;
    return jsonb_build_object('id', g.id, 'name', g.name, 'icon', g.icon, 'code', g.code,
        'members', (select count(*) from public.group_members m where m.group_id = g.id),
        'owner', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl)
            from public.profiles p where p.id = g.owner_id),
        'member', exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = uid));
end;
$$;

-- Přidání do skupiny kódem; kdo už členem je, dostane skupinu zpět beze změny. Neznámý kód = null (započte se jako pokus).
create or replace function public.group_join(join_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text := public.group_parse_code(join_code); g public.groups;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if public.group_code_blocked(uid) then raise exception 'Příliš mnoho špatných kódů. Zkus to za hodinu.' using errcode = 'P0001'; end if;
    perform pg_advisory_xact_lock(hashtext('groups:' || uid::text));
    if c is not null then select * into g from public.groups where code = c for update; end if;
    perform public.group_code_try(uid, g.id is not null);
    if g.id is null then return null; end if;
    if exists (select 1 from public.group_members where group_id = g.id and user_id = uid) then return public.group_json(g, uid); end if;
    if public.is_blocked(g.owner_id, uid) then raise exception 'Do téhle skupiny se přidat nemůžeš.' using errcode = 'P0001'; end if;
    if (select count(*) from public.group_members where user_id = uid) >= 10 then
        raise exception 'Můžeš být nejvýš v 10 skupinách. Nejdřív nějakou opusť.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.group_members where group_id = g.id) >= 50 then
        raise exception 'Skupina je plná (nejvýš 50 členů).' using errcode = 'P0001';
    end if;
    insert into public.group_members (group_id, user_id) values (g.id, uid);
    return public.group_json(g, uid);
end;
$$;

-- Opuštění skupiny (zakladatel ji neopouští, může ji smazat)
create or replace function public.group_leave(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if exists (select 1 from public.groups where id = gid and owner_id = uid) then
        raise exception 'Zakladatel skupinu neopouští. Můžeš ji smazat.' using errcode = 'P0001';
    end if;
    delete from public.group_members where group_id = gid and user_id = uid;
    if not found then raise exception 'Tahle skupina neexistuje nebo v ní nejsi.' using errcode = '42501'; end if;
end;
$$;

-- Zakladatel: přejmenování a ikona
create or replace function public.group_update(gid uuid, group_name text, group_icon text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.groups;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.group_owned(gid, uid);
    update public.groups set name = public.group_clean_name(group_name), icon = public.group_check_icon(group_icon) where id = gid returning * into g;
    return public.group_json(g, uid);
end;
$$;

-- Zakladatel: nový kód (starý kód ani odkaz už nefungují; členové zůstávají)
create or replace function public.group_regenerate_code(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.group_owned(gid, uid);
    update public.groups set code = public.group_new_code() where id = gid returning code into c;
    return c;
end;
$$;

-- Zakladatel: odebrání člena (sebe ne)
create or replace function public.group_remove_member(gid uuid, member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.group_owned(gid, uid);
    if member_id is null or member_id = uid then raise exception 'Sebe ze skupiny odebrat nemůžeš.' using errcode = '22023'; end if;
    delete from public.group_members where group_id = gid and user_id = member_id;
    if not found then raise exception 'Tenhle hráč ve skupině není.' using errcode = '22023'; end if;
end;
$$;

-- Zakladatel: smazání skupiny (členství a propojení výzev zmizí s ní; výzvy samotné zůstávají)
create or replace function public.group_delete(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.group_owned(gid, uid);
    delete from public.groups where id = gid;
end;
$$;

-- Veřejné údaje profilu jako JSON (stejné jako v pořadí Kvízu dne)
create or replace function public.group_player_json(p public.profiles) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl)
$$;

-- Moje skupiny (v pořadí přidání) s dnešním vedoucím Kvízu dne (dohrané pokusy: víc bodů, pak kratší čas) a jestli jsem dnes hrál
create or replace function public.my_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := public.daily_quiz_today();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return coalesce((
        select jsonb_agg(public.group_json(g, uid) || jsonb_build_object(
            'played_today', exists (select 1 from public.daily_quiz_results r where r.user_id = uid and r.day = today and r.finished_at is not null),
            'leader', (select public.group_player_json(p) || jsonb_build_object('score', r.score, 'time_ms', r.time_ms, 'me', p.id = uid)
                from public.group_members o join public.daily_quiz_results r on r.user_id = o.user_id and r.day = today and r.finished_at is not null
                join public.profiles p on p.id = o.user_id
                where o.group_id = g.id order by r.score desc, r.time_ms, r.finished_at, o.user_id limit 1)
        ) order by m.joined_at, g.id)
        from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = uid), '[]'::jsonb);
end;
$$;

-- Detail skupiny pro člena: členové s veřejnými údaji a čísly pro pořadí (aplikace řadí sama), dnešní den a začátek týdne,
-- poslední výzva skupině s výsledky členů. Dnes = dohraný Kvíz dne; týden = součet bodů od pondělí (minulé dny i nedohrané, jak stály).
create or replace function public.group_detail(gid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := public.daily_quiz_today(); ws date := public.group_week_start(public.daily_quiz_today()); g public.groups; ch jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.groups where id = gid;
    if g.id is null or not exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid) then
        raise exception 'Tahle skupina neexistuje nebo v ní nejsi.' using errcode = '42501';
    end if;
    select jsonb_build_object('id', c.id, 'topic', c.topic, 'count', c.count, 'created_at', c.created_at,
            'creator', case when p.id is null then null else public.group_player_json(p) end,
            'results', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'correct', r.correct, 'points', r.points) order by r.points desc, r.correct desc, r.finished_at)
                from public.challenge_results r join public.group_members o on o.group_id = gid and o.user_id = r.user_id where r.challenge_id = c.id), '[]'::jsonb))
        into ch
        from public.group_challenges gc join public.challenges c on c.id = gc.challenge_id left join public.profiles p on p.id = c.creator_id
        where gc.group_id = gid order by gc.created_at desc limit 1;
    return public.group_json(g, uid) || jsonb_build_object('day', today, 'week_start', ws, 'challenge', ch,
        'rows', coalesce((select jsonb_agg(public.group_player_json(p) || jsonb_build_object('owner', p.id = g.owner_id, 'me', p.id = uid, 'joined_at', m.joined_at,
                'today', (select jsonb_build_object('score', r.score, 'correct', r.correct, 'time_ms', r.time_ms) from public.daily_quiz_results r
                    where r.user_id = m.user_id and r.day = today and r.finished_at is not null),
                'week_score', coalesce(w.score, 0), 'week_correct', coalesce(w.correct, 0), 'week_time_ms', coalesce(w.time_ms, 0), 'week_days', coalesce(w.days, 0),
                'week_xp', coalesce((select x.gained from public.xp_weekly x where x.user_id = m.user_id and x.week = ws), 0)) order by m.joined_at, m.user_id)
            from public.group_members m join public.profiles p on p.id = m.user_id
            left join lateral (select sum(r.score)::integer as score, sum(r.correct)::integer as correct, sum(r.time_ms)::integer as time_ms, count(*)::integer as days
                from public.daily_quiz_results r where r.user_id = m.user_id and r.day between ws and today and r.answered > 0 and (r.finished_at is not null or r.day < today)) w on true
            where m.group_id = gid), '[]'::jsonb));
end;
$$;

-- Výzva skupině: člen ji nejdřív založí jako výzvu pro kohokoli s kódem (challenges, invited_id prázdné) a hned ji tu připojí.
-- Jen vlastní a čerstvou výzvu (do hodiny), jednu výzvu jen k jedné skupině, nejvýš 10 výzev skupině za 24 hodin.
create or replace function public.group_set_challenge(gid uuid, challenge_code text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.challenges;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if not exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid) then
        raise exception 'Tahle skupina neexistuje nebo v ní nejsi.' using errcode = '42501';
    end if;
    select * into c from public.challenges where id = upper(coalesce(challenge_code, ''));
    if c.id is null or c.creator_id <> uid or c.invited_id is not null or c.created_at < now() - interval '1 hour' then
        raise exception 'Tuhle výzvu ke skupině připojit nejde.' using errcode = '22023';
    end if;
    perform 1 from public.groups where id = gid for update;
    if (select count(*) from public.group_challenges where group_id = gid and created_at > now() - interval '24 hours') >= 10 then
        raise exception 'Skupina dostala za poslední den už 10 výzev. Zkus to zítra.' using errcode = 'P0001';
    end if;
    insert into public.group_challenges (challenge_id, group_id) values (c.id, gid) on conflict (challenge_id) do nothing;
    if not found then raise exception 'Tahle výzva už ke skupině patří.' using errcode = '22023'; end if;
end;
$$;

-- Smazání účtu: skupiny, které hráč založil a jsou v nich i jiní, převezme nejdéle přidaný člen (ostatní zmizí s profilem)
create or replace function public.group_handover() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    update public.groups g set owner_id = (select m.user_id from public.group_members m where m.group_id = g.id and m.user_id <> old.id order by m.joined_at, m.user_id limit 1)
    where g.owner_id = old.id and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> old.id);
    return old;
end;
$$;
drop trigger if exists profiles_group_handover on public.profiles;
create trigger profiles_group_handover before delete on public.profiles for each row execute function public.group_handover();

-- Oprávnění: hráč volá jen funkce skupin (anon nic); pomocné a triggerové funkce zvenčí nikdo, is_group_member jen kvůli pravidlům řádků
revoke all on function public.group_week_start(date), public.count_weekly_xp(), public.group_icons(), public.group_new_code(), public.group_clean_name(text),
    public.group_check_icon(text), public.group_parse_code(text), public.group_owned(uuid, uuid), public.group_json(public.groups, uuid),
    public.group_player_json(public.profiles), public.group_code_try(uuid, boolean), public.group_code_blocked(uuid), public.group_handover() from public, anon, authenticated;
revoke all on function public.is_group_member(uuid), public.group_create(text, text), public.group_preview(text), public.group_join(text), public.group_leave(uuid),
    public.group_update(uuid, text, text), public.group_regenerate_code(uuid), public.group_remove_member(uuid, uuid), public.group_delete(uuid),
    public.my_groups(), public.group_detail(uuid), public.group_set_challenge(uuid, text) from public, anon;
grant execute on function public.is_group_member(uuid), public.group_create(text, text), public.group_preview(text), public.group_join(text), public.group_leave(uuid),
    public.group_update(uuid, text, text), public.group_regenerate_code(uuid), public.group_remove_member(uuid, uuid), public.group_delete(uuid),
    public.my_groups(), public.group_detail(uuid), public.group_set_challenge(uuid, text) to authenticated;
-- ===== Skupiny (schéma 8) — KONEC BLOKU =====

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

-- ===== Rozpis otázek po výzvě a zápasu turnaje (schéma 10) — ZAČÁTEK BLOKU =====
-- Ke každé uložené odpovědi výzvy (challenge_progress) a zápasu turnaje (tournament_answers) přibyly podrobnosti pro „Rozpis otázek“:
-- co hráč odpověděl (answer: zvolená možnost, napsaný text nebo krátké shrnutí, např. „Vedle o 37 km“; nejvýš 120 znaků, bez řídicích
-- a neviditelných znaků), kolik použil nápověd (hints 0–4) a jak dlouho otázku měl (ms, nejvýš hodina). Všechno je nepovinné: starší aplikace
-- je neposílá a starší odpovědi je nemají (null). Body a správnost hlídají dál stejné kontroly jako dřív (nejvýš 4, u psaní 8 bodů, správně = aspoň bod).
-- Funkce pro uložení odpovědi mají proto tři nepovinné parametry navíc; starou podobu se čtyřmi parametry (vytváří ji část souboru výš) blok
-- odstraní, aby volání se čtyřmi parametry nebylo nejednoznačné (projde novou funkcí s výchozími hodnotami).
-- Cizí odpovědi vrací jen challenge_details a tournament_details, a to jen hráči, který výzvu (zápas) sám dohrál: dokud nedohraje, nedozví se nic.
-- Výzva: odpovědi ostatních hráčů, kteří ji dohráli; u výzvy starší 7 dní i rozehrané (výzva vypršela). Zápas turnaje: soupeřovy odpovědi,
-- když zápas dohrál i on, nebo když je zápas rozhodnutý. Tabulky samy dál čte pravidlo řádků jen jejich hráči. Kdo vyhrál, se tu nemění.
alter table public.challenge_progress add column if not exists answer text;
alter table public.challenge_progress add column if not exists hints smallint;
alter table public.challenge_progress add column if not exists ms integer;
alter table public.challenge_progress drop constraint if exists challenge_progress_details;
alter table public.challenge_progress add constraint challenge_progress_details
    check ((answer is null or char_length(answer) between 1 and 120) and (hints is null or hints between 0 and 4) and (ms is null or ms between 0 and 3600000));
alter table public.tournament_answers add column if not exists answer text;
alter table public.tournament_answers add column if not exists hints smallint;
alter table public.tournament_answers add column if not exists ms integer;
alter table public.tournament_answers drop constraint if exists tournament_answers_details;
alter table public.tournament_answers add constraint tournament_answers_details
    check ((answer is null or char_length(answer) between 1 and 120) and (hints is null or hints between 0 and 4) and (ms is null or ms between 0 and 3600000));

-- Text odpovědi do rozpisu: řídicí, neviditelné a směr textu měnící znaky a lomené závorky pryč, mezery sloučené, nejvýš 120 znaků (prázdný = null)
create or replace function public.clean_answer_label(raw text) returns text
language sql immutable set search_path = public as $$
    select nullif(btrim(left(btrim(regexp_replace(regexp_replace(coalesce(raw, ''),
        '[\u0001-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]', ' ', 'g'), '\s+', ' ', 'g')), 120)), '')
$$;

-- Nápovědy a čas: null = neuvedeno; jinak 0–4 nápovědy a nezáporný čas (delší než hodina se uloží jako hodina)
create or replace function public.check_answer_details(hints integer, ms integer) returns void
language plpgsql immutable set search_path = public as $$
begin
    if hints is not null and (hints < 0 or hints > 4) then raise exception 'Neplatný počet nápověd.' using errcode = '22023'; end if;
    if ms is not null and ms < 0 then raise exception 'Neplatný čas odpovědi.' using errcode = '22023'; end if;
end;
$$;

drop function if exists public.challenge_progress_save(text, integer, boolean, integer);
create or replace function public.challenge_progress_save(code text, idx integer, correct boolean, points integer,
    answer text default null, hints integer default null, ms integer default null) returns integer
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
    perform pg_advisory_xact_lock(hashtext('challenge_progress:' || code || ':' || uid::text));
    if exists (select 1 from public.challenge_results r where r.challenge_id = code and r.user_id = uid) then
        raise exception 'Výzvu už máš dohranou.' using errcode = '22023';
    end if;
    if idx is null or idx < 0 or idx >= c.count then raise exception 'Neplatné číslo otázky.' using errcode = '22023'; end if;
    if correct is null or points is null or points < 0 or points > (case when c.variant = 'choices' then 4 else 8 end) or correct <> (points > 0) then
        raise exception 'Neplatný výsledek otázky.' using errcode = '22023';
    end if;
    perform public.check_answer_details(hints, ms);
    select count(*)::integer into saved from public.challenge_progress p where p.challenge_id = code and p.user_id = uid;
    select * into prev from public.challenge_progress p where p.challenge_id = code and p.user_id = uid and p.idx = idx;
    if prev.challenge_id is not null then
        -- stejná odpověď poslaná znovu nic nemění (ani podrobnosti, ty platí z prvního uložení)
        if prev.correct = correct and prev.points = points then return saved; end if;
        raise exception 'Odpověď na tuhle otázku už je uložená, přepsat ji nejde.' using errcode = '22023';
    end if;
    if idx <> saved then raise exception 'Nejdřív se musí uložit předchozí otázky.' using errcode = '22023'; end if;
    insert into public.challenge_progress (challenge_id, user_id, idx, correct, points, answer, hints, ms)
        values (code, uid, idx, correct, points, public.clean_answer_label(answer), hints, case when ms is null then null else least(ms, 3600000) end);
    return saved + 1;
end;
$$;

drop function if exists public.tournament_answer_save(uuid, integer, boolean, integer);
create or replace function public.tournament_answer_save(mid uuid, idx integer, correct boolean, points integer,
    answer text default null, hints integer default null, ms integer default null) returns integer
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
    perform public.check_answer_details(hints, ms);
    select count(*)::integer into saved from public.tournament_answers a where a.match_id = mid and a.user_id = uid;
    select * into prev from public.tournament_answers a where a.match_id = mid and a.user_id = uid and a.idx = idx;
    if prev.match_id is not null then
        if prev.correct = correct and prev.points = points then return saved; end if;
        raise exception 'Odpověď na tuhle otázku už je uložená, přepsat ji nejde.' using errcode = '22023';
    end if;
    if idx <> saved then raise exception 'Nejdřív se musí uložit předchozí otázky.' using errcode = '22023'; end if;
    insert into public.tournament_answers (match_id, user_id, idx, correct, points, answer, hints, ms)
        values (mid, uid, idx, correct, points, public.clean_answer_label(answer), hints, case when ms is null then null else least(ms, 3600000) end);
    return saved + 1;
end;
$$;

-- Rozpis výzvy: moje odpovědi a odpovědi hráčů, kteří výzvu dohráli (u výzvy starší 7 dní i rozehrané). Jen pro hráče s vlastním výsledkem:
-- kdo výzvu nedohrál (nebo ji vůbec nehrál), dostane chybu a nedozví se ani to, jestli výzva existuje.
create or replace function public.challenge_details(code text)
returns table (user_id uuid, idx integer, correct boolean, points integer, answer text, hints integer, ms integer)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.challenges; expired boolean;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if code is null or code !~ '^[A-Z0-9]{6}$' then raise exception 'Neplatný kód výzvy.' using errcode = '22023'; end if;
    select * into c from public.challenges ch where ch.id = code;
    if c.id is null or not exists (select 1 from public.challenge_results r where r.challenge_id = c.id and r.user_id = uid) then
        raise exception 'Rozpis otázek uvidíš, až výzvu dohraješ.' using errcode = '42501';
    end if;
    expired := c.created_at < now() - interval '7 days';
    return query
        select p.user_id, p.idx, p.correct, p.points, p.answer, p.hints::integer, p.ms
        from public.challenge_progress p
        where p.challenge_id = c.id
            and (p.user_id = uid or expired or exists (select 1 from public.challenge_results r where r.challenge_id = c.id and r.user_id = p.user_id))
        order by p.user_id, p.idx
        limit 2000;
end;
$$;

-- Rozpis zápasu turnaje: jen pro jeho hráče, až ho sám dohraje; soupeřovy odpovědi, když zápas dohrál i soupeř, nebo je zápas rozhodnutý
create or replace function public.tournament_details(mid uuid)
returns table (user_id uuid, idx integer, correct boolean, points integer, answer text, hints integer, ms integer)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); m public.tournament_matches; rival uuid; open_rival boolean;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into m from public.tournament_matches tm where tm.id = mid;
    if m.id is null then raise exception 'Zápas neexistuje.' using errcode = '42501'; end if;
    if uid not in (m.p1, m.p2) then
        -- Cizí zápas (schéma 13): kdokoli přihlášený, až je rozhodnutý. Zápasy jednoho kola mají stejné otázky, proto ho neuvidí hráč,
        -- který má v tomtéž kole vlastní zápas ještě neodehraný (dokud ho nedohraje nebo se nerozhodne)
        if m.winner is null then raise exception 'Rozpis cizího zápasu uvidíš, až bude rozhodnutý.' using errcode = '42501'; end if;
        if exists (select 1 from public.tournament_matches x where x.tournament_id = m.tournament_id and x.round = m.round and uid in (x.p1, x.p2)
                and x.winner is null and not exists (select 1 from public.tournament_results tr where tr.match_id = x.id and tr.user_id = uid and tr.finished_at is not null)) then
            raise exception 'Rozpis zápasů tohoto kola uvidíš, až odehraješ svůj zápas.' using errcode = '42501';
        end if;
        return query
            select a.user_id, a.idx, a.correct, a.points, a.answer, a.hints::integer, a.ms
            from public.tournament_answers a
            where a.match_id = m.id and a.user_id in (m.p1, m.p2)
            order by a.user_id, a.idx
            limit 20;
        return;
    end if;
    if not exists (select 1 from public.tournament_results tr where tr.match_id = m.id and tr.user_id = uid and tr.finished_at is not null) then
        raise exception 'Rozpis otázek uvidíš, až zápas dohraješ.' using errcode = '42501';
    end if;
    rival := case when m.p1 = uid then m.p2 else m.p1 end;
    open_rival := m.winner is not null
        or exists (select 1 from public.tournament_results tr where tr.match_id = m.id and tr.user_id = rival and tr.finished_at is not null);
    return query
        select a.user_id, a.idx, a.correct, a.points, a.answer, a.hints::integer, a.ms
        from public.tournament_answers a
        where a.match_id = m.id and (a.user_id = uid or (a.user_id = rival and open_rival))
        order by a.user_id, a.idx
        limit 20;
end;
$$;

revoke all on function public.clean_answer_label(text), public.check_answer_details(integer, integer) from public, anon, authenticated;
revoke all on function public.challenge_progress_save(text, integer, boolean, integer, text, integer, integer),
    public.tournament_answer_save(uuid, integer, boolean, integer, text, integer, integer),
    public.challenge_details(text), public.tournament_details(uuid) from public, anon;
grant execute on function public.challenge_progress_save(text, integer, boolean, integer, text, integer, integer),
    public.tournament_answer_save(uuid, integer, boolean, integer, text, integer, integer),
    public.challenge_details(text), public.tournament_details(uuid) to authenticated;
-- ===== Rozpis otázek po výzvě a zápasu turnaje (schéma 10) — KONEC BLOKU =====


-- ===== Rozpis Kvízu dne (schéma 15) — ZAČÁTEK BLOKU =====
-- Každá odpověď Kvízu dne se uloží i s podrobnostmi (správně, body, text odpovědi, nápovědy 0–4, čas), aby si hráči v pořadí dne mohli
-- rozkliknout, jak kdo odpověděl na kterou otázku. Otázky jsou pro všechny stejné, proto cizí odpovědi daily_quiz_details vrátí jen hráči,
-- který dnešní kvíz sám dohrál (nebo za minulé dny). daily_quiz_answer má dva nepovinné parametry navíc (starší aplikace je neposílá);
-- starou podobu s pěti parametry (vytváří ji část souboru výš) blok odstraní, aby volání s pěti parametry nebylo nejednoznačné.
create table if not exists public.daily_quiz_answers (
    user_id uuid not null references public.profiles (id) on delete cascade,
    day date not null,
    idx integer not null,
    correct boolean not null,
    points integer not null,
    answer text,
    hints smallint,
    ms integer,
    primary key (user_id, day, idx)
);
alter table public.daily_quiz_answers drop constraint if exists daily_quiz_answers_values;
alter table public.daily_quiz_answers add constraint daily_quiz_answers_values check (idx between 0 and 9 and points between 0 and 4 and correct = (points > 0)
    and (answer is null or char_length(answer) between 1 and 120) and (hints is null or hints between 0 and 4) and (ms is null or ms between 0 and 3600000));
alter table public.daily_quiz_answers enable row level security;
drop policy if exists "kvíz dne: vlastní odpovědi" on public.daily_quiz_answers;
create policy "kvíz dne: vlastní odpovědi" on public.daily_quiz_answers for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.daily_quiz_answers from anon, authenticated;

drop function if exists public.daily_quiz_answer(date, integer, boolean, integer, integer);
create or replace function public.daily_quiz_answer(for_day date, idx integer, is_correct boolean, points integer, ms integer, answer text default null, hints integer default null) returns jsonb
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
    insert into public.daily_quiz_answers (user_id, day, idx, correct, points, answer, hints, ms)
        values (uid, d, idx, is_correct, points, public.clean_answer_label(answer), case when hints between 0 and 4 then hints end, least(greatest(ms, 0), 3600000))
        on conflict do nothing;
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

-- Odpovědi hráčů z pořadí dne po otázkách (nejvýš 10 hráčů); cizí jen tomu, kdo kvíz toho dne dohrál, nebo za minulé dny
create or replace function public.daily_quiz_details(for_day date, players uuid[])
returns table (user_id uuid, idx integer, correct boolean, points integer, answer text, hints integer, ms integer)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.daily_quiz_today();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if for_day is null or for_day > d or players is null or cardinality(players) > 10 then raise exception 'Neplatný dotaz.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(players) p where p <> uid) and for_day = d
        and not exists (select 1 from public.daily_quiz_results r where r.user_id = uid and r.day = d and (r.finished_at is not null or r.answered >= 10)) then
        raise exception 'Odpovědi ostatních uvidíš, až dnešní kvíz dohraješ.' using errcode = '42501';
    end if;
    return query
        select a.user_id, a.idx, a.correct, a.points, a.answer, a.hints::integer, a.ms
        from public.daily_quiz_answers a
        where a.day = for_day and a.user_id = any(players)
        order by a.user_id, a.idx
        limit 100;
end;
$$;
revoke all on function public.daily_quiz_answer(date, integer, boolean, integer, integer, text, integer), public.daily_quiz_details(date, uuid[]) from public, anon;
grant execute on function public.daily_quiz_answer(date, integer, boolean, integer, integer, text, integer), public.daily_quiz_details(date, uuid[]) to authenticated;
-- ===== Rozpis Kvízu dne (schéma 15) — KONEC BLOKU =====

-- ===== Zamrzlé otázky (schéma 17) =====
-- Výzva (i výzva skupině a odveta), zápas turnaje a Kvíz dne mají dát všem hráčům stejné otázky se stejnými možnostmi. Aplikace otázku sestaví
-- ze semínka a z dat tématu; když se data mezi hrami hráčů změní (nové položky, jiné úrovně), vyšla by ze stejného semínka jiná otázka.
-- Proto se otázka při prvním sestavení uloží (klíč = semínko otázky) a platí první zápis: question_snapshot_claim vrátí vždy uloženou verzi
-- a aplikace hraje ji (svou sestavenou zahodí). Rozpis otázek čte uložené otázky přes question_snapshots_get.
-- Semínka otázek:
--   výzva            <semínko výzvy>:<pořadí>                       jen hráč, který výzvu smí hrát; semínko patří nejstarší výzvě s ním (kopie semínka
--                                                                   v nové výzvě ho nepřevezme), pořadí menší než počet otázek
--   zápas turnaje    <semínko turnaje>-r<kolo>:<pořadí>             jen hráč zápasu v tomto kole turnaje
--   Kvíz dne         mudrlant-kviz-dne-<YYYY-MM-DD>:otazka:<pořadí>  jen za dnešek a včerejšek (pražský čas), ať nikdo nepřipraví otázky budoucího dne
-- Číst smí každý přihlášený (otázky jsou pro všechny stejné a semínka jsou veřejná i bez toho), zapisovat jen funkce. Otázku skládá klient,
-- server kontroluje jen tvar (objekt, nejvýš 150 000 bajtů) a nejvýš 400 nových otázek za hodinu od jednoho hráče.
create table if not exists public.question_snapshots (
    seed text primary key check (char_length(seed) between 1 and 200),
    data jsonb not null check (jsonb_typeof(data) = 'object'),
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);
create index if not exists question_snapshots_author_idx on public.question_snapshots (created_by, created_at desc);
-- question_snapshot_claim hledá výzvu podle semínka
create index if not exists challenges_seed_idx on public.challenges (seed, created_at);
alter table public.question_snapshots enable row level security;
drop policy if exists "zamrzlé otázky: čtení pro přihlášené" on public.question_snapshots;
create policy "zamrzlé otázky: čtení pro přihlášené" on public.question_snapshots for select to authenticated using (true);
revoke all on public.question_snapshots from anon;
revoke insert, update, delete, truncate on public.question_snapshots from authenticated;

-- Uloží otázku, pokud pro semínko ještě žádná není, a vrátí uloženou (první zápis platí; souběžný druhý zápis dostane tu první)
create or replace function public.question_snapshot_claim(seed text, data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid();
    s text := question_snapshot_claim.seed;
    payload jsonb := question_snapshot_claim.data;
    today date := public.daily_quiz_today();
    m text[];
    d date;
    allowed boolean := false;
    stored jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if s is null or char_length(s) not between 1 and 200 or s !~ '^[A-Za-z0-9._:-]+$' then raise exception 'Neplatné semínko otázky.' using errcode = '22023'; end if;
    if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Neplatná otázka.' using errcode = '22023'; end if;
    if octet_length(payload::text) > 150000 then raise exception 'Otázka je příliš velká.' using errcode = '22023'; end if;
    -- Uložená otázka se jen vrátí (bez dalších kontrol: kdo smí hrát, dostane stejnou, jakou dostali ostatní)
    select q.data into stored from public.question_snapshots q where q.seed = s;
    if stored is not null then return stored; end if;
    -- Kvíz dne: jen dnešek a včerejšek (pokus začatý před půlnocí se dohrává po ní)
    m := regexp_match(s, '^mudrlant-kviz-dne-([0-9]{4}-[0-9]{2}-[0-9]{2}):otazka:([0-9])$');
    if m is not null then
        begin d := m[1]::date; exception when others then d := null; end;
        if d is null or d not in (today, today - 1) then raise exception 'Otázky Kvízu dne jde uložit jen za dnešek.' using errcode = '22023'; end if;
        allowed := true;
    end if;
    -- Zápas turnaje: jen hráč zápasu v tom kole
    if not allowed then
        m := regexp_match(s, '^(.+)-r([0-9]{1,2}):([0-9]{1,2})$');
        if m is not null and m[3]::integer < 20 then
            allowed := exists (select 1 from public.tournaments t join public.tournament_matches mm on mm.tournament_id = t.id
                where t.seed = m[1] and mm.round = m[2]::integer and uid in (mm.p1, mm.p2));
        end if;
    end if;
    -- Výzva: nejstarší výzva s tímhle semínkem, kterou hráč smí hrát (jako pravidlo zápisu výsledku), a pořadí v rozsahu jejích otázek
    if not allowed then
        m := regexp_match(s, '^(.+):([0-9]{1,2})$');
        if m is not null then
            select (c.invited_id is null or uid in (c.invited_id, c.creator_id)) and m[2]::integer < c.count into allowed
            from public.challenges c where c.seed = m[1] order by c.created_at, c.id limit 1;
            allowed := coalesce(allowed, false);
        end if;
    end if;
    if not allowed then raise exception 'Tuhle otázku uložit nejde.' using errcode = '42501'; end if;
    if (select count(*) from public.question_snapshots q where q.created_by = uid and q.created_at > now() - interval '1 hour') >= 400 then
        raise exception 'Příliš mnoho nových otázek, zkus to za chvíli.' using errcode = '22023';
    end if;
    insert into public.question_snapshots (seed, data, created_by) values (s, payload, uid) on conflict on constraint question_snapshots_pkey do nothing;
    select q.data into stored from public.question_snapshots q where q.seed = s;
    return stored;
end;
$$;

-- Uložené otázky k semínkům (nejvýš 200 najednou); semínko bez uložené otázky ve výsledku chybí
create or replace function public.question_snapshots_get(seeds text[]) returns table (seed text, data jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return query select q.seed, q.data from public.question_snapshots q where q.seed = any((coalesce(question_snapshots_get.seeds, '{}'::text[]))[1:200]);
end;
$$;
revoke all on function public.question_snapshot_claim(text, jsonb), public.question_snapshots_get(text[]) from public, anon;
grant execute on function public.question_snapshot_claim(text, jsonb), public.question_snapshots_get(text[]) to authenticated;
-- ===== Zamrzlé otázky (schéma 17) — KONEC BLOKU =====

-- ===== Ligové sezóny a vitrína v profilu (schéma 18) — ZAČÁTEK BLOKU =====
-- Ligová sezóna = kalendářní měsíc podle pražského času. Výsledek hráče v sezóně = nejvyšší liga, které v měsíci dosáhl: liga podle nejvyššího
-- ratingu po ohodnocené výzvě (rating_history.rating_after) v tom měsíci. Kdo v měsíci žádnou ohodnocenou výzvu nedohrál, výsledek nemá.
-- Skončená sezóna se už nezmění. Za vrchol skončené sezóny Stříbro, Zlato, Platina, Diamant nebo Mistr má hráč rámeček profilu (look.js, liga-zlato …
-- liga-mistr; vyšší liga dává i rámečky nižších) navždy: počítá se z celé historie (best), ne jen z posledního roku.

-- Nejvyšší rating hráče v měsíci RRRR-MM (pražský čas); null = v měsíci nedohrál ohodnocenou výzvu (nebo neplatný měsíc)
create or replace function public.league_month_peak(uid uuid, month text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare start_at timestamptz;
begin
    if month is null or month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then return null; end if;
    start_at := to_date(month, 'YYYY-MM')::timestamp at time zone 'Europe/Prague';
    return (select max(h.rating_after)::integer from public.rating_history h
            where h.user_id = uid and h.created_at >= start_at
              and h.created_at < ((to_date(month, 'YYYY-MM') + interval '1 month')::timestamp at time zone 'Europe/Prague'));
end;
$$;

-- Sezóny hráče po měsících (pražský čas): měsíc, nejvyšší rating a počet ohodnocených výzev
create or replace function public.league_peaks(uid uuid) returns table (month text, peak integer, games integer)
language sql stable security definer set search_path = public as $$
    select to_char(h.created_at at time zone 'Europe/Prague', 'YYYY-MM'), max(h.rating_after)::integer, count(*)::integer
    from public.rating_history h where h.user_id = uid
    group by 1;
$$;

-- Ligové sezóny hráče (bez parametru přihlášeného, s parametrem kohokoli – jen veřejné údaje, které stejně jsou v rating_history):
-- { month: běžící měsíc, seasons: [běžící a posledních 12 skončených sezón s výsledkem, nejnovější první: month, league, peak, games, finished],
--   best: nejlepší skončená sezóna vůbec (month, league, peak; při shodě ratingu ta dřívější) nebo null }
drop function if exists public.league_seasons(uuid);
create or replace function public.league_seasons(player uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    uid uuid := coalesce(player, auth.uid());
    now_month text := to_char(now() at time zone 'Europe/Prague', 'YYYY-MM');
    first_month text := to_char(date_trunc('month', now() at time zone 'Europe/Prague') - interval '12 months', 'YYYY-MM');
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return jsonb_build_object(
        'month', now_month,
        'seasons', coalesce((select jsonb_agg(jsonb_build_object('month', p.month, 'league', public.rating_league(p.peak), 'peak', p.peak, 'games', p.games,
                'finished', p.month < now_month) order by p.month desc)
            from public.league_peaks(uid) p where p.month >= first_month and p.month <= now_month), '[]'::jsonb),
        'best', (select jsonb_build_object('month', p.month, 'league', public.rating_league(p.peak), 'peak', p.peak)
            from public.league_peaks(uid) p where p.month < now_month order by p.peak desc, p.month limit 1)
    );
end;
$$;

-- Vitrína v profilu: nejvýš 3 trofeje, které uvidí ostatní v profilu hráče. Položky:
--   b:<odznak>                odznak z katalogu, který hráč má v profiles.badges (aplikace nabízí nejvyšší získaný stupeň skupiny, ten je v účtu)
--   d:<téma>                  diplom za mistrovství tématu (drží ho aplikace v profiles.rewards, server kontroluje jen tvar)
--   l:<RRRR-MM>:<liga>        skončená ligová sezóna a liga, která byla jejím vrcholem (server ověří v rating_history)
alter table public.profiles add column if not exists showcase text[] not null default '{}';
create or replace function public.showcase_format_ok(items text[]) returns boolean
language sql immutable set search_path = public as $$
    select items is not null and coalesce(array_ndims(items), 1) = 1 and cardinality(items) <= 3
        and (select count(distinct x) = count(*)
                and coalesce(bool_and(x ~ '^(b:[a-z0-9-]{1,40}|d:[a-z0-9-]{1,24}|l:[0-9]{4}-(0[1-9]|1[0-2]):(bronz|stribro|zlato|platina|diamant|mistr))$'), true)
             from unnest(items) x);
$$;
alter table public.profiles drop constraint if exists profiles_showcase_format;
alter table public.profiles add constraint profiles_showcase_format check (public.showcase_format_ok(showcase));

-- Obsah vitríny: odznak, který hráč nemá, a sezóna, která nebyla (běžící měsíc, jiná liga než vrchol, měsíc bez ohodnocené výzvy), se tiše vyřadí
-- (stejně jako odznaky mimo katalog); opakovaná položka taky. Špatný tvar a víc než 3 položky odmítne kontrola profiles_showcase_format.
-- Trigger běží po profiles_protect_rating (abecedně), takže odznaky poslané ve stejné změně už jsou sjednocené.
create or replace function public.check_showcase() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    kept text[] := '{}';
    item text;
    now_month text := to_char(now() at time zone 'Europe/Prague', 'YYYY-MM');
    peak integer;
begin
    if new.showcase is not distinct from old.showcase or new.showcase is null then return new; end if;
    foreach item in array new.showcase loop
        if item is not null and public.showcase_format_ok(array[item]) then
            continue when item = any (kept);
            if left(item, 2) = 'b:' then
                continue when not (substr(item, 3) = any (coalesce(new.badges, '{}')));
            elsif left(item, 2) = 'l:' then
                continue when substr(item, 3, 7) >= now_month;
                peak := public.league_month_peak(new.id, substr(item, 3, 7));
                continue when peak is null or public.rating_league(peak) <> substr(item, 11);
            end if;
        end if;
        kept := kept || item;
    end loop;
    new.showcase := kept;
    return new;
end;
$$;
drop trigger if exists profiles_showcase_check on public.profiles;
create trigger profiles_showcase_check before update of showcase on public.profiles for each row execute function public.check_showcase();
grant update (showcase) on public.profiles to authenticated;

revoke all on function public.league_month_peak(uuid, text), public.league_peaks(uuid), public.check_showcase() from public, anon, authenticated;
revoke all on function public.league_seasons(uuid) from public, anon;
grant execute on function public.league_seasons(uuid) to authenticated;
-- ===== Ligové sezóny a vitrína v profilu (schéma 18) — KONEC BLOKU =====

-- ===== Tajemná otázka dne (schéma 19) — ZAČÁTEK BLOKU =====
-- Každý den (pražský čas) jedna tajemná položka pro všechny hráče: vybírá ji aplikace ze semínka dne (mystery.js), odpověď server nezná.
-- Nápovědy se odkrývají podle hodin (1. o půlnoci, 2. ve 4:00, pak každé dvě hodiny až 8. v 16:00 – stejné pole CLUE_HOURS má mystery.js).
-- Hráč má na den 3 tipy; každý tip se uloží zvlášť (mystery_guess): jen další tip v pořadí, nic přeskočit ani přepsat, po správném tipu
-- nebo třetím špatném je hotovo. Body počítá server: 11 − počet odkrytých nápověd − počet předchozích špatných tipů, nejméně 1 (10 bodů
-- s 1. nápovědou, 3 body s 8.). Nápověda, kterou hráč při tipu viděl, nesmí být starší než 10 minut (pozdě odeslaný tip se počítá s tolika
-- nápovědami, kolik jich bylo vidět 10 minut před odesláním); čas vyřešení určuje server. Jeden řádek na hráče a den.
-- Statistiky dne (podíl úspěšných, nejrychlejší vyřešení, průměr nápověd) a výsledky přátel jsou vidět až hráči, který dnešní otázku
-- dořešil (uhodl nebo vyčerpal tipy), a za minulé dny (nejvýš 30 dní zpět) vždy. Tabulku hráč jen čte (svůj řádek); zapisují jen funkce níže.
create table if not exists public.mystery_results (
    user_id uuid not null references public.profiles (id) on delete cascade,
    day date not null,
    guesses smallint not null default 0,
    solved boolean not null default false,
    -- kolik nápověd bylo vidět při posledním (u vyřešené při správném) tipu
    clues smallint not null default 1,
    points smallint not null default 0,
    solved_at timestamptz,
    -- volání mystery_guess v tomto dni (limit proti zahlcení, opakované odeslání téhož tipu)
    calls smallint not null default 0,
    created_at timestamptz not null default now(),
    last_at timestamptz not null default now(),
    primary key (user_id, day)
);
alter table public.mystery_results drop constraint if exists mystery_results_values;
alter table public.mystery_results add constraint mystery_results_values check (
    guesses between 1 and 3 and clues between 1 and 8 and calls between 0 and 1000
    and ((solved and points between 1 and 10 and solved_at is not null) or (not solved and points = 0 and solved_at is null)));
create index if not exists mystery_results_day on public.mystery_results (day, solved, points desc, solved_at);
alter table public.mystery_results enable row level security;
drop policy if exists "tajemná otázka: vlastní řádky" on public.mystery_results;
create policy "tajemná otázka: vlastní řádky" on public.mystery_results for select to authenticated using (user_id = auth.uid());
revoke all on public.mystery_results from anon, authenticated;
grant select on public.mystery_results to authenticated;

-- Čas a den tajemné otázky (Praha); mudrlant.test_now používají jen testy (z API ho klient nastavit nemůže)
create or replace function public.mystery_now() returns timestamptz
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_now', true), '')::timestamptz, now())
$$;
create or replace function public.mystery_today() returns date
language sql stable set search_path = public as $$
    select (public.mystery_now() at time zone 'Europe/Prague')::date
$$;
-- Kolik nápověd je v okamžiku ts vidět (1–8): hodiny 0, 7, 9, 11, 13, 15, 17 a 20 pražského času (schéma 20; dřív končilo v 16)
create or replace function public.mystery_clues_at(ts timestamptz) returns integer
language sql stable set search_path = public as $$
    select greatest(1, (select count(*)::integer from unnest(array[0, 7, 9, 11, 13, 15, 17, 20]) h
        where h <= extract(hour from (ts at time zone 'Europe/Prague'))))
$$;
-- Stav hráče jako JSON pro aplikaci (r bez řádku = dnes ještě netipoval)
create or replace function public.mystery_json(r public.mystery_results, d date) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('day', d, 'guesses', coalesce(r.guesses, 0), 'solved', coalesce(r.solved, false), 'clues', coalesce(r.clues, 0),
        'points', coalesce(r.points, 0), 'solved_at', case when r.solved_at is not null then to_char(r.solved_at at time zone 'Europe/Prague', 'FMHH24:MI') end,
        'finished', coalesce(r.solved or r.guesses >= 3, false), 'clues_now', public.mystery_clues_at(public.mystery_now()))
$$;

-- Dnešní stav přihlášeného hráče (nic nezakládá)
create or replace function public.mystery_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.mystery_today(); r public.mystery_results;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into r from public.mystery_results where user_id = uid and day = d;
    return public.mystery_json(r, d);
end;
$$;

-- Tip idx (od 0) na dnešní tajemnou otázku; for_day = den, pro který aplikace otázku vybrala (po půlnoci už neplatí);
-- clues = kolik nápověd hráč při tipu viděl. Stejný tip poslaný znovu (ztracená odpověď serveru) nic nezmění; jiný server odmítne.
create or replace function public.mystery_guess(for_day date, idx integer, is_correct boolean, clues integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t timestamptz := public.mystery_now(); d date := public.mystery_today(); r public.mystery_results; seen integer; gained integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if for_day is distinct from d then raise exception 'Tahle tajemná otázka už skončila. Dnes je nová.' using errcode = '22023'; end if;
    if idx is null or idx < 0 or idx > 2 or is_correct is null or clues is null or clues < 1 or clues > 8 then raise exception 'Neplatný tip.' using errcode = '22023'; end if;
    -- Nápovědy: aspoň tolik, kolik jich bylo vidět před 10 minutami (pozdě odeslaný tip si nepřisvojí dřívější čas)
    seen := greatest(clues, public.mystery_clues_at(t - interval '10 minutes'));
    select * into r from public.mystery_results where user_id = uid and day = d for update;
    if r.calls >= 40 then raise exception 'Příliš mnoho pokusů o uložení tipu. Zkus to zítra.' using errcode = '22023'; end if;
    if idx < coalesce(r.guesses, 0) then
        -- Opakované odeslání: poslední tip se shoduje (správně / špatně), dřívější tipy jsou vždy špatné
        if (idx = r.guesses - 1 and r.solved = is_correct) or (idx < r.guesses - 1 and not is_correct) then
            update public.mystery_results set calls = calls + 1 where user_id = uid and day = d returning * into r;
            return public.mystery_json(r, d);
        end if;
        raise exception 'Tenhle tip už máš uložený.' using errcode = '22023';
    end if;
    if r.solved then raise exception 'Tajemnou otázku už máš vyřešenou.' using errcode = '22023'; end if;
    if coalesce(r.guesses, 0) >= 3 then raise exception 'Tipy na dnešek došly.' using errcode = '22023'; end if;
    if idx > coalesce(r.guesses, 0) then raise exception 'Nejdřív se musí uložit předchozí tip.' using errcode = '22023'; end if;
    gained := case when is_correct then greatest(1, 11 - seen - idx) else 0 end;
    if r.user_id is null then
        -- První tip dne založí řádek (souběžný první tip z druhého zařízení skončí chybou porušení klíče a aplikace stav načte znovu)
        insert into public.mystery_results (user_id, day, guesses, solved, clues, points, solved_at, last_at, calls)
        values (uid, d, 1, is_correct, seen, gained, case when is_correct then t end, t, 1)
        returning * into r;
    else
        update public.mystery_results set
            guesses = idx + 1,
            solved = is_correct,
            clues = seen,
            points = gained,
            solved_at = case when is_correct then t end,
            last_at = t,
            calls = calls + 1
        where user_id = uid and day = d
        returning * into r;
    end if;
    return public.mystery_json(r, d);
end;
$$;

-- Smí hráč vidět výsledky ostatních za den d? Minulé dny (30 zpět) ano, dnešek až po dořešení
create or replace function public.mystery_visible(uid uuid, d date) returns boolean
language plpgsql stable set search_path = public as $$
declare today date := public.mystery_today();
begin
    if d > today or d < today - 30 then raise exception 'Výsledky tajemné otázky jsou jen za posledních 30 dní.' using errcode = '22023'; end if;
    return d < today or exists (select 1 from public.mystery_results r where r.user_id = uid and r.day = d and (r.solved or r.guesses >= 3));
end;
$$;

-- Jak si vedli ostatní: hráči s aspoň jedním tipem, kolik uhodlo (a procenta), nejrychlejší vyřešení (pražský čas), průměr nápověd
-- u úspěšných a můj výsledek; dnešek až po dořešení (jinak jen { day, hidden: true }). Bez jmen hráčů.
create or replace function public.mystery_stats(for_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := coalesce(for_day, public.mystery_today()); result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if not public.mystery_visible(uid, d) then return jsonb_build_object('day', d, 'hidden', true); end if;
    select jsonb_build_object(
        'day', d, 'hidden', false,
        'players', count(*),
        'solved', count(*) filter (where r.solved),
        'solved_pct', case when count(*) > 0 then round(100.0 * count(*) filter (where r.solved) / count(*))::integer else 0 end,
        'fastest', to_char(min(r.solved_at) at time zone 'Europe/Prague', 'FMHH24:MI'),
        'avg_clues', round(avg(r.clues) filter (where r.solved), 1),
        'me', (select jsonb_build_object('solved', m.solved, 'clues', m.clues, 'guesses', m.guesses, 'points', m.points,
                'solved_at', to_char(m.solved_at at time zone 'Europe/Prague', 'FMHH24:MI'))
            from public.mystery_results m where m.user_id = uid and m.day = d)
    ) into result
    from public.mystery_results r where r.day = d;
    return result;
end;
$$;

-- Výsledky přátel (přijatá přátelství oběma směry) a můj: pořadí podle vyřešení, bodů a času vyřešení; rank = moje místo mezi nimi;
-- friends = počet přátel. Jen veřejné údaje profilu; dnešek až po dořešení.
create or replace function public.mystery_friends(for_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := coalesce(for_day, public.mystery_today()); result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if not public.mystery_visible(uid, d) then return jsonb_build_object('day', d, 'hidden', true); end if;
    with circle as (
        select case when f.user_id = uid then f.friend_id else f.user_id end as id
        from public.friendships f where f.status = 'accepted' and uid in (f.user_id, f.friend_id)
    ), ranked as (
        select r.user_id, r.solved, r.clues, r.guesses, r.points, r.solved_at,
            (rank() over (order by r.solved desc, r.points desc, r.solved_at nulls last))::integer as place,
            (row_number() over (order by r.solved desc, r.points desc, r.solved_at nulls last, r.user_id))::integer as pos
        from public.mystery_results r where r.day = d and (r.user_id = uid or r.user_id in (select id from circle))
    )
    select jsonb_build_object(
        'day', d, 'hidden', false,
        'friends', (select count(*) from circle),
        'rank', (select k.place from ranked k where k.user_id = uid),
        'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', k.place, 'id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color,
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'solved', k.solved, 'clues', k.clues, 'guesses', k.guesses, 'points', k.points,
                'solved_at', to_char(k.solved_at at time zone 'Europe/Prague', 'FMHH24:MI'), 'me', k.user_id = uid) order by k.pos)
            from ranked k join public.profiles p on p.id = k.user_id where k.pos <= 200), '[]'::jsonb)
    ) into result;
    return result;
end;
$$;

-- Pomocné funkce jen interně; hráč volá jen stav, tip, statistiky a přátele (anon nic)
revoke all on function public.mystery_now(), public.mystery_today(), public.mystery_clues_at(timestamptz), public.mystery_json(public.mystery_results, date),
    public.mystery_visible(uuid, date) from public, anon, authenticated;
revoke all on function public.mystery_state(), public.mystery_guess(date, integer, boolean, integer), public.mystery_stats(date), public.mystery_friends(date) from public, anon;
grant execute on function public.mystery_state(), public.mystery_guess(date, integer, boolean, integer), public.mystery_stats(date), public.mystery_friends(date) to authenticated;
-- ===== Tajemná otázka dne (schéma 19) — KONEC BLOKU =====

-- ===== 21: Zlatá otázka =====
-- Jen odznaky Zlatokop I–III (zlatokop-10, zlatokop-50, zlatokop-100) v badge_catalog() výše; žádná tabulka ani funkce. Počítadlo zlatých
-- otázek, střípky a Zlaté truhly jsou jen v zařízení (mudrlant.gold, gold.js); věc ze Zlaté truhly se ukládá s ostatními dárky truhel
-- v profiles.rewards (schéma 9), takže se po přihlášení přenese jako ostatní odměny.
-- ===== 21: Zlatá otázka — KONEC BLOKU =====

-- ===== 21: Kamarádské sázky =====
-- Výzva konkrétnímu hráči (podle přezdívky, příteli, odveta) může mít sázku 10, 25 nebo 50 XP; náhodný soupeř, výzva přes odkaz ani výzva skupině ne
-- (server pustí sázku jen u výzvy s vyzvaným hráčem, náhodného soupeře hlídá aplikace). Zakladatel ji nabídne hned po založení výzvy, dřív než
-- kdokoli začne hrát (challenge_offer_stake, s nepovinnou hláškou 0–7 z pevného seznamu v bets.js, žádný volný text). Vyzvaný ji před svou první
-- otázkou přijme, nebo hraje bez sázky (challenge_answer_stake); kdo začne hrát bez odpovědi, hraje bez sázky (spoušť na první odpovědi), nabídka
-- platí 7 dní. Vsadit i přijmout jde nejvýš tolik, kolik hráč získal za posledních 7 dní (odhad z xp_weekly: tento týden a poměrná část minulého),
-- bez sázek, které má ještě otevřené. Až mají výsledek oba, každý si svou část vyrovná sám a jen jednou (challenge_settle_stake, příznaky
-- stake_settled_creator a stake_settled_opponent, skutečná změna ve stake_delta_*): vítěz +vklad, poražený −vklad, ale nikdy pod hranici své
-- aktuální úrovně (stake_level_floor, stejná tabulka jako LEVEL_XP v quiz-core.js), remíza nic. XP sázky mění jen tahle funkce (s právy vlastníka;
-- jinak klient profiles.xp jen zvyšuje). Součty profiles.bet_won a bet_lost řeknou aplikaci na každém zařízení, co z výher a proher ještě
-- nepřipsala (bets.js reconcile), takže starší XP z jiného zařízení prohru nepřepíše. Prohra se odečte i z týdenních XP (xp_weekly), výhru tam
-- připíše spoušť count_weekly_xp. Sloupce sázky klient přímo nezapíše (spoušť guard_challenge_stake je při založení výzvy vynuluje).
alter table public.challenges add column if not exists stake integer;
alter table public.challenges add column if not exists stake_state text;
alter table public.challenges add column if not exists taunt smallint;
alter table public.challenges add column if not exists stake_settled_creator boolean not null default false;
alter table public.challenges add column if not exists stake_settled_opponent boolean not null default false;
alter table public.challenges add column if not exists stake_delta_creator integer;
alter table public.challenges add column if not exists stake_delta_opponent integer;
alter table public.challenges drop constraint if exists challenges_stake_values;
alter table public.challenges add constraint challenges_stake_values check (
    ((stake is null and stake_state is null and taunt is null)
        or (stake in (10, 25, 50) and stake_state in ('offered', 'accepted', 'declined') and (taunt is null or taunt between 0 and 7)))
    and (stake_state = 'accepted' or not (stake_settled_creator or stake_settled_opponent))
    and (stake_delta_creator is null or stake_delta_creator between -50 and 50)
    and (stake_delta_opponent is null or stake_delta_opponent between -50 and 50));
create index if not exists challenges_stake_creator_idx on public.challenges (creator_id, created_at desc) where stake is not null;
create index if not exists challenges_stake_invited_idx on public.challenges (invited_id, created_at desc) where stake is not null;
-- Součet vyhraných a prohraných XP ze sázek (jen roste; klient ho číst smí, zapsat ne: sloupce nejsou v grant update)
alter table public.profiles add column if not exists bet_won integer not null default 0;
alter table public.profiles add column if not exists bet_lost integer not null default 0;
alter table public.profiles drop constraint if exists profiles_bet_totals;
alter table public.profiles add constraint profiles_bet_totals check (bet_won between 0 and 100000000 and bet_lost between 0 and 100000000);

-- Výzvu zakládá klient přímo (insert do challenges): sloupce sázky při tom vždy začínají prázdné
create or replace function public.guard_challenge_stake() returns trigger
language plpgsql set search_path = public as $$
begin
    if current_user in ('authenticated', 'anon') then
        new.stake := null;
        new.stake_state := null;
        new.taunt := null;
        new.stake_settled_creator := false;
        new.stake_settled_opponent := false;
        new.stake_delta_creator := null;
        new.stake_delta_opponent := null;
    end if;
    return new;
end;
$$;
drop trigger if exists challenges_guard_stake on public.challenges;
create trigger challenges_guard_stake before insert on public.challenges for each row execute function public.guard_challenge_stake();

-- Vyzvaný začal hrát (první odpověď) a na nabídku neodpověděl: hraje se bez sázky
create or replace function public.stake_close_offer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    update public.challenges set stake_state = 'declined' where id = new.challenge_id and invited_id = new.user_id and stake_state = 'offered';
    return null;
end;
$$;
drop trigger if exists challenge_progress_close_offer on public.challenge_progress;
create trigger challenge_progress_close_offer after insert on public.challenge_progress for each row when (new.idx = 0) execute function public.stake_close_offer();

-- Hranice aktuální úrovně (XP, od kterých úroveň platí): pod ni prohraná sázka XP nesníží. Stejná tabulka jako LEVEL_XP v quiz-core.js
-- (hlídá tests/sql-bets.test.js).
create or replace function public.stake_level_floor(xp integer) returns integer
language sql immutable set search_path = public as $$
    select coalesce(max(v), 0)::integer from unnest(array[0, 90, 250, 480, 750, 1150, 1550, 2000, 2600, 3200, 3900, 4700, 5500, 6400, 7300, 8300, 9400, 10500,
        12000, 13000, 14500, 16000, 17500, 19000, 20500, 22000, 24000, 25500, 27500, 29500, 31500, 33500, 36000, 38000, 40500, 42500, 45000, 47500,
        50000, 53000, 55000, 58000, 61000, 64000, 67000, 70000, 73000, 76000, 79000, 82000, 86000, 89000, 93000, 96000, 100000, 103000, 107000,
        111000, 115000, 119000, 123000, 127000, 131000, 135000, 139000, 144000, 148000, 152000, 157000, 162000, 166000, 171000, 176000, 181000,
        185000, 190000, 196000, 201000, 206000, 211000, 216000, 222000, 227000, 233000, 238000, 244000, 250000, 255000, 261000, 267000, 273000,
        279000, 285000, 292000, 298000, 304000, 310000, 317000, 323000, 330000]::integer[]) v where v <= greatest(coalesce(xp, 0), 0)
$$;

-- XP za posledních 7 dní (odhad z týdenních součtů): tento týden celý a z minulého týdne poměr dní, které do posledních 7 dní ještě patří
-- (v pondělí 6/7, v neděli nic)
create or replace function public.stake_week_xp(uid uuid) returns integer
language plpgsql stable set search_path = public as $$
declare today date := public.daily_quiz_today(); ws date; this_week integer; last_week integer;
begin
    ws := public.group_week_start(today);
    select coalesce(sum(x.gained), 0) into this_week from public.xp_weekly x where x.user_id = uid and x.week = ws;
    select coalesce(sum(x.gained), 0) into last_week from public.xp_weekly x where x.user_id = uid and x.week = ws - 7;
    return (this_week + last_week * (7 - extract(isodow from today)::integer) / 7)::integer;
end;
$$;

-- Vklady, které hráč ještě má ve hře (nabídnuté nebo přijaté, nevyrovnané, z posledních 7 dní); skip = výzva, o kterou právě jde
create or replace function public.stake_open(uid uuid, skip text default null) returns integer
language sql stable set search_path = public as $$
    select coalesce(sum(c.stake), 0)::integer from public.challenges c
    where c.stake is not null and c.created_at > now() - interval '7 days' and c.id is distinct from skip
      and ((c.creator_id = uid and c.stake_state in ('offered', 'accepted') and not c.stake_settled_creator)
        or (c.invited_id = uid and c.stake_state = 'accepted' and not c.stake_settled_opponent))
$$;

-- Kolik hráč může právě vsadit (nejvýš 50)
create or replace function public.stake_available(uid uuid, skip text default null) returns integer
language sql stable set search_path = public as $$
    select least(50, greatest(0, public.stake_week_xp(uid) - public.stake_open(uid, skip)))::integer
$$;

-- Výsledek sázky z pohledu hráče: víc bodů, při shodě víc správných (jako rate_challenge)
create or replace function public.stake_outcome(mine_points integer, mine_correct integer, their_points integer, their_correct integer) returns text
language sql immutable as $$
    select case when mine_points > their_points then 'win' when mine_points < their_points then 'loss'
        when mine_correct > their_correct then 'win' when mine_correct < their_correct then 'loss' else 'draw' end
$$;

-- Sázka výzvy jako JSON pro hráče uid (role, stav, vklad, hláška, moje vyrovnání a výsledek, když dohráli oba)
create or replace function public.stake_json(c public.challenges, uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare
    creator boolean := uid = c.creator_id;
    other uuid := case when uid = c.creator_id then c.invited_id else c.creator_id end;
    mine public.challenge_results; theirs public.challenge_results;
begin
    select * into mine from public.challenge_results r where r.challenge_id = c.id and r.user_id = uid;
    select * into theirs from public.challenge_results r where r.challenge_id = c.id and r.user_id = other;
    return jsonb_build_object(
        'id', c.id, 'stake', c.stake, 'state', c.stake_state, 'taunt', c.taunt, 'role', case when creator then 'creator' else 'opponent' end,
        'other', other, 'created_at', c.created_at,
        'expired', coalesce(c.stake_state = 'offered' and c.created_at <= now() - interval '7 days', false),
        'settled', case when creator then c.stake_settled_creator else c.stake_settled_opponent end,
        'delta', case when creator then c.stake_delta_creator else c.stake_delta_opponent end,
        'other_settled', case when creator then c.stake_settled_opponent else c.stake_settled_creator end,
        'done', mine.user_id is not null, 'other_done', theirs.user_id is not null,
        'outcome', case when mine.user_id is not null and theirs.user_id is not null then public.stake_outcome(mine.points, mine.correct, theirs.points, theirs.correct) end);
end;
$$;

-- Nabídka sázky: jen zakladatel výzvy konkrétnímu hráči, jen jednou a jen dřív, než kdokoli začne hrát; vklad do limitu
create or replace function public.challenge_offer_stake(code text, amount integer, taunt_id integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.challenges; free integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into c from public.challenges ch where ch.id = code for update;
    if c.id is null then raise exception 'Výzva neexistuje.' using errcode = '22023'; end if;
    if c.creator_id <> uid then raise exception 'Tuhle sázku nabídnout nemůžeš: výzva není tvoje.' using errcode = '42501'; end if;
    if c.invited_id is null or exists (select 1 from public.group_challenges g where g.challenge_id = c.id) then
        raise exception 'Sázka jde jen ve výzvě konkrétnímu hráči.' using errcode = '22023';
    end if;
    if c.stake is not null then
        if c.stake = amount and c.taunt is not distinct from taunt_id::smallint then return public.stake_json(c, uid); end if;
        raise exception 'Sázka už je nabídnutá.' using errcode = '22023';
    end if;
    if amount is null or amount not in (10, 25, 50) then raise exception 'Vsadit jde 10, 25 nebo 50 XP.' using errcode = '22023'; end if;
    if taunt_id is not null and (taunt_id < 0 or taunt_id > 7) then raise exception 'Neplatná hláška.' using errcode = '22023'; end if;
    if exists (select 1 from public.challenge_progress p where p.challenge_id = c.id) or exists (select 1 from public.challenge_results r where r.challenge_id = c.id) then
        raise exception 'Sázku jde nabídnout jen před začátkem hry.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtext('stake:' || uid::text));
    free := public.stake_available(uid, c.id);
    if amount > free then
        raise exception 'Vsadit můžeš nejvýš % XP (tolik máš z posledních 7 dní).', free using errcode = 'P0001';
    end if;
    update public.challenges set stake = amount, stake_state = 'offered', taunt = taunt_id where id = c.id returning * into c;
    return public.stake_json(c, uid);
end;
$$;

-- Odpověď vyzvaného: přijmout (do jeho limitu), nebo hrát bez sázky; jen před jeho první otázkou a do 7 dní od založení. Stejná odpověď znovu nic nemění.
create or replace function public.challenge_answer_stake(code text, accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.challenges; free integer; wanted text := case when accept then 'accepted' else 'declined' end;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if accept is null then raise exception 'Chybí odpověď.' using errcode = '22023'; end if;
    select * into c from public.challenges ch where ch.id = code for update;
    if c.id is null then raise exception 'Výzva neexistuje.' using errcode = '22023'; end if;
    if c.invited_id is distinct from uid then raise exception 'Na tuhle sázku odpovědět nemůžeš.' using errcode = '42501'; end if;
    if c.stake_state is null then raise exception 'U téhle výzvy žádná sázka není.' using errcode = '22023'; end if;
    if c.stake_state = wanted then return public.stake_json(c, uid); end if;
    if c.stake_state <> 'offered' then raise exception 'Na sázku už je odpověď.' using errcode = '22023'; end if;
    if exists (select 1 from public.challenge_progress p where p.challenge_id = c.id and p.user_id = uid) or exists (select 1 from public.challenge_results r where r.challenge_id = c.id and r.user_id = uid) then
        raise exception 'Na sázku jde odpovědět jen před začátkem hry.' using errcode = '22023';
    end if;
    if c.created_at <= now() - interval '7 days' then raise exception 'Nabídka sázky vypršela.' using errcode = '22023'; end if;
    if accept then
        perform pg_advisory_xact_lock(hashtext('stake:' || uid::text));
        free := public.stake_available(uid, c.id);
        if c.stake > free then
            raise exception 'Vsadit můžeš nejvýš % XP (tolik máš z posledních 7 dní).', free using errcode = 'P0001';
        end if;
    end if;
    update public.challenges set stake_state = wanted where id = c.id returning * into c;
    return public.stake_json(c, uid);
end;
$$;

-- Vyrovnání sázky za přihlášeného hráče: až mají výsledek oba, připíše (výhra) nebo odečte (prohra, jen nad hranicí úrovně) vklad, jednou.
-- Jinak jen vrátí stav (čeká se na soupeře, sázka nebyla přijata). fresh = vyrovnáno právě teď; xp, won a lost = stav účtu po něm.
create or replace function public.challenge_settle_stake(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid(); c public.challenges; info jsonb; creator boolean; outcome text;
    old_xp integer; new_xp integer; delta integer; p public.profiles;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into c from public.challenges ch where ch.id = code for update;
    if c.id is null then raise exception 'Výzva neexistuje.' using errcode = '22023'; end if;
    if uid is distinct from c.creator_id and uid is distinct from c.invited_id then raise exception 'Tahle sázka ti nepatří.' using errcode = '42501'; end if;
    info := public.stake_json(c, uid);
    if c.stake_state is distinct from 'accepted' or (info ->> 'outcome') is null then return info || jsonb_build_object('fresh', false); end if;
    creator := uid = c.creator_id;
    if (creator and c.stake_settled_creator) or (not creator and c.stake_settled_opponent) then return info || jsonb_build_object('fresh', false); end if;
    outcome := info ->> 'outcome';
    select xp into old_xp from public.profiles where id = uid for update;
    if old_xp is null then raise exception 'Profil chybí.' using errcode = '22023'; end if;
    new_xp := case outcome when 'win' then least(old_xp + c.stake, 500000)
        when 'loss' then old_xp - least(c.stake, greatest(old_xp - public.stake_level_floor(old_xp), 0)) else old_xp end;
    delta := new_xp - old_xp;
    update public.profiles set xp = new_xp, bet_won = bet_won + greatest(delta, 0), bet_lost = bet_lost + greatest(-delta, 0) where id = uid returning * into p;
    if delta < 0 then
        update public.xp_weekly set gained = greatest(0, gained + delta) where user_id = uid and week = public.group_week_start(public.daily_quiz_today());
    end if;
    if creator then update public.challenges set stake_settled_creator = true, stake_delta_creator = delta where id = c.id returning * into c;
    else update public.challenges set stake_settled_opponent = true, stake_delta_opponent = delta where id = c.id returning * into c; end if;
    return public.stake_json(c, uid) || jsonb_build_object('fresh', true, 'xp', p.xp, 'won', p.bet_won, 'lost', p.bet_lost);
end;
$$;

-- Statistika sázek hráče (rozhodnuté přijaté sázky): počet, výhry, prohry, remízy, bilance XP (vyrovnané části), nejdelší a současná řada výher
create or replace function public.stake_stats(uid uuid) returns jsonb
language sql stable set search_path = public as $$
    with s as (
        select c.id, greatest(m.finished_at, o.finished_at) as decided_at,
            public.stake_outcome(m.points, m.correct, o.points, o.correct) as outcome,
            case when c.creator_id = uid then c.stake_delta_creator else c.stake_delta_opponent end as delta
        from public.challenges c
        join public.challenge_results m on m.challenge_id = c.id and m.user_id = uid
        join public.challenge_results o on o.challenge_id = c.id and o.user_id = case when c.creator_id = uid then c.invited_id else c.creator_id end
        where c.stake_state = 'accepted' and (c.creator_id = uid or c.invited_id = uid)
    ), islands as (
        select outcome, row_number() over (order by decided_at, id) - row_number() over (partition by outcome = 'win' order by decided_at, id) as grp from s
    )
    select jsonb_build_object(
        'bets', (select count(*) from s), 'wins', (select count(*) from s where outcome = 'win'),
        'losses', (select count(*) from s where outcome = 'loss'), 'draws', (select count(*) from s where outcome = 'draw'),
        'balance', (select coalesce(sum(delta), 0) from s),
        'best', coalesce((select max(n) from (select count(*) as n from islands where outcome = 'win' group by grp) runs), 0),
        'streak', (select count(*) from s where outcome = 'win' and decided_at > coalesce((select max(decided_at) from s where outcome <> 'win'), '-infinity'::timestamptz)))
$$;

-- Moje sázky: kolik můžu vsadit, statistika a sázky výzev z posledních 30 dní (a nevyrovnané starší), nejnovější první
create or replace function public.challenge_stakes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return jsonb_build_object(
        'limit', public.stake_available(uid), 'week_xp', public.stake_week_xp(uid), 'open', public.stake_open(uid),
        'stats', public.stake_stats(uid),
        'rows', coalesce((select jsonb_agg(public.stake_json(c, uid) order by c.created_at desc) from public.challenges c where c.id in (
            select r.id from public.challenges r
            where r.stake is not null and (r.creator_id = uid or r.invited_id = uid)
              and (r.created_at > now() - interval '30 days' or (r.stake_state = 'accepted' and not (case when r.creator_id = uid then r.stake_settled_creator else r.stake_settled_opponent end)))
            order by r.created_at desc limit 40)), '[]'::jsonb));
end;
$$;

-- Sázková bilance jiného hráče (profil hráče): jen souhrn, ne jednotlivé sázky
create or replace function public.challenge_stake_stats(player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if player is null or not exists (select 1 from public.profiles where id = player) then return null; end if;
    return public.stake_stats(player);
end;
$$;

revoke all on function public.guard_challenge_stake(), public.stake_close_offer(), public.stake_level_floor(integer), public.stake_week_xp(uuid),
    public.stake_open(uuid, text), public.stake_available(uuid, text), public.stake_outcome(integer, integer, integer, integer),
    public.stake_json(public.challenges, uuid), public.stake_stats(uuid) from public, anon, authenticated;
revoke all on function public.challenge_offer_stake(text, integer, integer), public.challenge_answer_stake(text, boolean), public.challenge_settle_stake(text),
    public.challenge_stakes(), public.challenge_stake_stats(uuid) from public, anon;
grant execute on function public.challenge_offer_stake(text, integer, integer), public.challenge_answer_stake(text, boolean), public.challenge_settle_stake(text),
    public.challenge_stakes(), public.challenge_stake_stats(uuid) to authenticated;
-- ===== 21: Kamarádské sázky — KONEC BLOKU =====

-- ===== Boss týdne (schéma 21) — ZAČÁTEK BLOKU =====
-- Každý ISO týden (pražský čas, pondělí–neděle) jiný boss pro všechny hráče; kterého a jaké otázky určuje aplikace (boss.js), server zná jen týden.
-- Hráč má na týden 3 pokusy, počítá se nejlepší: jeden řádek na hráče a týden (week = pondělí týdne). Každý dohraný souboj aplikace pošle
-- přes boss_submit (poškození 0–700, výhra = 700); idx = kolikátý pokus to podle aplikace je (od 0), opakované odeslání téhož pokusu
-- (ztracená odpověď serveru) nic nezmění. Souboj dohraný těsně po půlnoci z neděle na pondělí se přijme ještě 30 minut.
-- Společná lišta (boss_week_stats): kolik hráčů, kteří to zkusili, bosse porazilo. Když do konce týdne porazí bosse aspoň polovina z nich,
-- vyzvedne si každý z nich příští týden 50 XP (boss_claim_bonus, jednou za týden; XP si připíše aplikace jako ostatní XP).
-- Tabulku hráč jen čte (svůj řádek); zapisují jen funkce níže.
create table if not exists public.boss_results (
    user_id uuid not null references public.profiles (id) on delete cascade,
    week date not null,
    best_damage smallint not null default 0,
    defeated boolean not null default false,
    attempts smallint not null default 0,
    bonus_claimed boolean not null default false,
    -- volání boss_submit v tomto týdnu (limit proti zahlcení, opakované odeslání téhož pokusu)
    calls smallint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, week)
);
alter table public.boss_results drop constraint if exists boss_results_values;
alter table public.boss_results add constraint boss_results_values check (
    extract(isodow from week) = 1 and attempts between 1 and 3 and best_damage between 0 and 700 and defeated = (best_damage = 700)
    and calls between 0 and 1000);
create index if not exists boss_results_week on public.boss_results (week, defeated);
alter table public.boss_results enable row level security;
drop policy if exists "boss týdne: vlastní řádky" on public.boss_results;
create policy "boss týdne: vlastní řádky" on public.boss_results for select to authenticated using (user_id = auth.uid());
revoke all on public.boss_results from anon, authenticated;
grant select on public.boss_results to authenticated;

-- Čas a týden bosse (Praha); mudrlant.test_now používají jen testy (z API ho klient nastavit nemůže)
create or replace function public.boss_now() returns timestamptz
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_now', true), '')::timestamptz, now())
$$;
-- Pondělí ISO týdne, do kterého v Praze patří okamžik ts (stejně počítá boss.js weekOf)
create or replace function public.boss_week(ts timestamptz) returns date
language sql stable set search_path = public as $$
    select date_trunc('week', (ts at time zone 'Europe/Prague'))::date
$$;
-- Stav hráče v týdnu jako JSON pro aplikaci (r bez řádku = v týdnu ještě nehrál)
create or replace function public.boss_json(r public.boss_results, w date) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('week', w, 'attempts', coalesce(r.attempts, 0), 'best_damage', coalesce(r.best_damage, 0), 'defeated', coalesce(r.defeated, false),
        'bonus_claimed', coalesce(r.bonus_claimed, false))
$$;

-- Dohraný souboj: týden (pondělí; ten běžící, nebo minulý ještě 30 minut po půlnoci), idx = kolikátý pokus (0–2), uštědřené poškození
-- a výhra (jen s plnými 700). Nejvýš 3 pokusy za týden; počítá se nejlepší poškození, výhra už zůstane. first_win = tímto pokusem padl
-- boss poprvé (aplikace podle toho připíše XP za výhru jen jednou za účet).
create or replace function public.boss_submit(for_week date, idx integer, damage integer, is_defeated boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t timestamptz := public.boss_now(); r public.boss_results; first boolean;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if for_week is null or for_week not in (public.boss_week(t), public.boss_week(t - interval '30 minutes')) then
        raise exception 'Tenhle boss už odešel. Tento týden je nový.' using errcode = '22023';
    end if;
    if idx is null or idx < 0 or idx > 2 or damage is null or damage < 0 or damage > 700 or is_defeated is null or is_defeated <> (damage = 700) then
        raise exception 'Neplatný výsledek souboje.' using errcode = '22023';
    end if;
    select * into r from public.boss_results where user_id = uid and week = for_week for update;
    if r.calls >= 30 then raise exception 'Příliš mnoho pokusů o uložení. Zkus to příští týden.' using errcode = '22023'; end if;
    if idx < coalesce(r.attempts, 0) then
        -- Opakované odeslání: pokus už je uložený, nic se nemění
        update public.boss_results set calls = calls + 1 where user_id = uid and week = for_week returning * into r;
        return public.boss_json(r, for_week) || jsonb_build_object('first_win', false);
    end if;
    if coalesce(r.attempts, 0) >= 3 then raise exception 'Pokusy na tento týden došly.' using errcode = '22023'; end if;
    first := is_defeated and not coalesce(r.defeated, false);
    if r.user_id is null then
        -- První pokus v týdnu založí řádek (souběžný první pokus z druhého zařízení skončí chybou klíče a aplikace stav načte znovu)
        insert into public.boss_results (user_id, week, best_damage, defeated, attempts, calls, updated_at)
        values (uid, for_week, damage, is_defeated, 1, 1, t)
        returning * into r;
    else
        update public.boss_results set
            attempts = attempts + 1,
            best_damage = greatest(best_damage, damage),
            defeated = defeated or is_defeated,
            calls = calls + 1,
            updated_at = t
        where user_id = uid and week = for_week
        returning * into r;
    end if;
    return public.boss_json(r, for_week) || jsonb_build_object('first_win', first);
end;
$$;

-- Společná lišta týdne: kolik hráčů to zkusilo (aspoň jeden pokus), kolik bosse porazilo (a procenta), jestli je splněná polovina,
-- jestli týden skončil, a můj stav. Bez jmen hráčů. Týden: běžící (výchozí) nebo nejvýš 12 týdnů zpět.
create or replace function public.boss_week_stats(for_week date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); t timestamptz := public.boss_now(); now_week date := public.boss_week(t); w date := coalesce(for_week, public.boss_week(t)); result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if extract(isodow from w) <> 1 or w > now_week or w < now_week - 84 then raise exception 'Boss týdne je jen za posledních 12 týdnů.' using errcode = '22023'; end if;
    select jsonb_build_object(
        'week', w,
        'players', count(*),
        'defeated', count(*) filter (where b.defeated),
        'defeated_pct', case when count(*) > 0 then round(100.0 * count(*) filter (where b.defeated) / count(*))::integer else 0 end,
        'reached', count(*) > 0 and 2 * count(*) filter (where b.defeated) >= count(*),
        'over', w < public.boss_week(t - interval '30 minutes'),
        'me', (select public.boss_json(m, w) from public.boss_results m where m.user_id = uid and m.week = w)
    ) into result
    from public.boss_results b where b.week = w;
    return result;
end;
$$;

-- Společný bonus za skončený týden: hráč, který bosse aspoň jednou zkusil, si vyzvedne 50 XP, když ho porazila aspoň polovina hráčů,
-- kteří to zkusili. Jen jednou za týden (bonus_claimed), nejvýš 12 týdnů zpět. xp = kolik XP si aplikace má připsat (0 = nic).
create or replace function public.boss_claim_bonus(for_week date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t timestamptz := public.boss_now(); r public.boss_results; players integer; beaten integer; reached boolean;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if for_week is null or extract(isodow from for_week) <> 1 or for_week >= public.boss_week(t - interval '30 minutes') or for_week < public.boss_week(t) - 84 then
        raise exception 'Bonus jde vyzvednout jen za skončený týden (nejvýš 12 týdnů zpět).' using errcode = '22023';
    end if;
    select count(*), count(*) filter (where b.defeated) into players, beaten from public.boss_results b where b.week = for_week;
    reached := players > 0 and 2 * beaten >= players;
    select * into r from public.boss_results where user_id = uid and week = for_week for update;
    if r.user_id is null then return jsonb_build_object('week', for_week, 'played', false, 'reached', reached, 'claimed', false, 'xp', 0); end if;
    if r.bonus_claimed then return jsonb_build_object('week', for_week, 'played', true, 'reached', reached, 'claimed', true, 'xp', 0); end if;
    if not reached then return jsonb_build_object('week', for_week, 'played', true, 'reached', false, 'claimed', false, 'xp', 0); end if;
    update public.boss_results set bonus_claimed = true, updated_at = t where user_id = uid and week = for_week;
    return jsonb_build_object('week', for_week, 'played', true, 'reached', true, 'claimed', true, 'xp', 50);
end;
$$;

-- Pomocné funkce jen interně; hráč volá jen odeslání, statistiky a bonus (anon nic)
revoke all on function public.boss_now(), public.boss_week(timestamptz), public.boss_json(public.boss_results, date) from public, anon, authenticated;
revoke all on function public.boss_submit(date, integer, integer, boolean), public.boss_week_stats(date), public.boss_claim_bonus(date) from public, anon;
grant execute on function public.boss_submit(date, integer, integer, boolean), public.boss_week_stats(date), public.boss_claim_bonus(date) to authenticated;
-- ===== Boss týdne (schéma 21) — KONEC BLOKU =====

-- ===== 21: Dobývání — ZAČÁTEK BLOKU =====
-- Hry o mapu (conquest.js, conquest-ui.js): kdokoli přihlášený založí hru s mapou (Evropa, Afrika, Asie, Amerika, Česko), délkou
-- (6 h až 7 dní), počtem hráčů (2–8), počtem tahů za období (1–10, období = den nebo hodina od začátku hry) a viditelností (veřejná
-- v lobby, nebo soukromá jen kódem či pozvánkou od přítele, blok 24). Hráč si při založení i přidání vybere barvu (v jedné hře každou jen jeden hráč) a znak.
-- Hra začne sama, když je plná, nebo když jsou v ní aspoň 2 hráči a všichni mají „Chci hrát“: každý dostane domovské území co nejdál
-- od ostatních, na neutrálních územích se rozmístí poklady. Tah = otázka (správnost posílá aplikace, hrají spolu lidé, kteří se znají
-- z lobby); útok jen na území sousedící s vlastním, opevnění jen vlastního. Úroveň opevnění 0–3 (palisáda, hradba, pevnost; pevnost
-- jen na domovském území); úspěšný útok na opevněné území ubere úroveň, na neopevněné ho dobude. Tahy za období: základ hry, +1 za každý
-- celý region, +1 za poklad dobytý v tomto období a +1 za každé domovské území soupeře dobyté v minulém období (kořist); komu soupeř
-- v minulém období dobyl domovské území, má o 1 tah méně (blok 23). Kdo přijde
-- o všechna území, dostane v dalším období nové (Návrat do hry). Konec v ends_at: body = území + 2 za celý region, při shodě vyhrává,
-- kdo konečného počtu bodů dosáhl dřív. Pro „Rychlou hru“ drží server pro každou předvolbu jednu otevřenou veřejnou hru.
-- Lobby, které nezačalo do 7 dní, zmizí. Hráč je nejvýš v 6 hrách najednou a má nejvýš 2 vlastní otevřené hry.
-- Data hry vidí jen její hráči (RLS), souhrn otevřených veřejných her každý přihlášený; zapisuje se jen přes funkce níže.

-- Mapy: katalog, regiony a sousedství (vkládá je vygenerovaná část níže, stejně jako data/dobyvani-<mapa>.json)
create table if not exists public.conquest_maps (
    id text primary key,
    title text not null,
    territories smallint not null,
    treasures smallint not null,
    max_players smallint not null
);
create table if not exists public.conquest_regions (
    map text not null references public.conquest_maps (id) on delete cascade,
    territory text not null,
    region text not null,
    primary key (map, territory)
);
create table if not exists public.conquest_links (
    map text not null references public.conquest_maps (id) on delete cascade,
    a text not null,
    b text not null,
    primary key (map, a, b)
);

create table if not exists public.conquest_games (
    id uuid primary key default gen_random_uuid(),
    creator uuid references public.profiles (id) on delete set null,
    map text not null references public.conquest_maps (id),
    max_players smallint not null,
    duration_hours integer not null,
    period text not null,
    actions smallint not null,
    visibility text not null,
    code text not null,
    -- předvolba Rychlé hry (hru drží server), jinak null
    preset text,
    status text not null default 'lobby',
    seed text not null default replace(gen_random_uuid()::text, '-', ''),
    created_at timestamptz not null default now(),
    started_at timestamptz,
    ends_at timestamptz
);
alter table public.conquest_games drop constraint if exists conquest_games_values;
alter table public.conquest_games add constraint conquest_games_values check (
    max_players between 2 and 8 and duration_hours in (6, 12, 24, 48, 72, 120, 168) and period in ('day', 'hour') and actions between 1 and 10
    and visibility in ('public', 'private') and status in ('lobby', 'running', 'finished') and code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'
    and (status = 'lobby' or (started_at is not null and ends_at is not null)));
create unique index if not exists conquest_games_code_key on public.conquest_games (code);
create index if not exists conquest_games_status_idx on public.conquest_games (status, visibility, created_at desc);
create index if not exists conquest_games_preset_idx on public.conquest_games (preset, status);

create table if not exists public.conquest_players (
    game_id uuid not null references public.conquest_games (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    -- pořadí přidání 0–7 (vzor šrafování), barva a znak z nabídky (conquest_colors, conquest_emblems)
    seat smallint not null,
    color text not null,
    emblem text not null,
    ready boolean not null default false,
    joined_at timestamptz not null default now(),
    score smallint not null default 0,
    -- kdy hráč dosáhl současného počtu bodů (rozhoduje při shodě)
    score_at timestamptz,
    -- období, ve kterém hráč přišel o všechna území (v dalším dostane nové), jinak null
    lost_period integer,
    place smallint,
    claimed boolean not null default false,
    primary key (game_id, user_id)
);
alter table public.conquest_players drop constraint if exists conquest_players_values;
alter table public.conquest_players add constraint conquest_players_values check (seat between 0 and 7 and score between 0 and 1000 and (place is null or place between 1 and 8));
create unique index if not exists conquest_players_color_key on public.conquest_players (game_id, color);
create unique index if not exists conquest_players_seat_key on public.conquest_players (game_id, seat);
create index if not exists conquest_players_user_idx on public.conquest_players (user_id);

create table if not exists public.conquest_territories (
    game_id uuid not null references public.conquest_games (id) on delete cascade,
    territory text not null,
    owner uuid references public.profiles (id) on delete set null,
    level smallint not null default 0,
    home boolean not null default false,
    treasure boolean not null default false,
    captured_at timestamptz,
    primary key (game_id, territory)
);
alter table public.conquest_territories drop constraint if exists conquest_territories_values;
alter table public.conquest_territories add constraint conquest_territories_values check (level between 0 and 3 and (level <= 2 or home));

-- Tahy a události hry (kronika tažení a závěrečné přehrání): kind = home | respawn | attack | fortify;
-- result = home | respawn | capture (dobytí) | breach (opevnění o úroveň níž) | fortify | fail | outrun (prohraná bitva: správně, ale pomaleji; blok 25)
create table if not exists public.conquest_moves (
    id bigserial primary key,
    game_id uuid not null references public.conquest_games (id) on delete cascade,
    user_id uuid references public.profiles (id) on delete set null,
    period integer not null,
    kind text not null,
    territory text not null,
    source text,
    success boolean not null,
    result text not null,
    victim uuid references public.profiles (id) on delete set null,
    -- úroveň opevnění po tahu
    level smallint not null default 0,
    -- dobytý poklad / dobyté domovské území soupeře
    treasure boolean not null default false,
    home boolean not null default false,
    at timestamptz not null default now()
);
alter table public.conquest_moves drop constraint if exists conquest_moves_values;
alter table public.conquest_moves add constraint conquest_moves_values check (kind in ('home', 'respawn', 'attack', 'fortify') and result in ('home', 'respawn', 'capture', 'breach', 'fortify', 'fail', 'outrun') and level between 0 and 3);
create index if not exists conquest_moves_game_idx on public.conquest_moves (game_id, id);
create index if not exists conquest_moves_user_idx on public.conquest_moves (game_id, user_id, period);

-- dobyvani:data:start (vygenerováno: node scripts/build-dobyvani.js, ručně neupravovat)
delete from public.conquest_links where map not in ('evropa', 'afrika', 'asie', 'amerika', 'cesko');
delete from public.conquest_regions where map not in ('evropa', 'afrika', 'asie', 'amerika', 'cesko');
delete from public.conquest_maps where id not in ('evropa', 'afrika', 'asie', 'amerika', 'cesko');
-- Mapa Evropa: 41 území, 9 regionů
insert into public.conquest_maps (id, title, territories, treasures, max_players) values ('evropa', 'Evropa', 41, 5, 8)
    on conflict (id) do update set title = excluded.title, territories = excluded.territories, treasures = excluded.treasures, max_players = excluded.max_players;
delete from public.conquest_regions where map = 'evropa';
insert into public.conquest_regions (map, territory, region) values
    ('evropa', 'Q145', 'britske-ostrovy'),
    ('evropa', 'Q27', 'britske-ostrovy'),
    ('evropa', 'Q189', 'severske-zeme'),
    ('evropa', 'Q20', 'severske-zeme'),
    ('evropa', 'Q34', 'severske-zeme'),
    ('evropa', 'Q33', 'severske-zeme'),
    ('evropa', 'Q35', 'severske-zeme'),
    ('evropa', 'Q191', 'pobalti'),
    ('evropa', 'Q211', 'pobalti'),
    ('evropa', 'Q37', 'pobalti'),
    ('evropa', 'Q29', 'pyrenejsky-poloostrov'),
    ('evropa', 'Q45', 'pyrenejsky-poloostrov'),
    ('evropa', 'Q142', 'zapadni-evropa'),
    ('evropa', 'Q31', 'zapadni-evropa'),
    ('evropa', 'Q55', 'zapadni-evropa'),
    ('evropa', 'Q32', 'zapadni-evropa'),
    ('evropa', 'Q39', 'zapadni-evropa'),
    ('evropa', 'Q183', 'stredni-evropa'),
    ('evropa', 'Q36', 'stredni-evropa'),
    ('evropa', 'Q213', 'stredni-evropa'),
    ('evropa', 'Q214', 'stredni-evropa'),
    ('evropa', 'Q40', 'stredni-evropa'),
    ('evropa', 'Q28', 'stredni-evropa'),
    ('evropa', 'Q215', 'stredni-evropa'),
    ('evropa', 'Q224', 'balkan'),
    ('evropa', 'Q225', 'balkan'),
    ('evropa', 'Q403', 'balkan'),
    ('evropa', 'Q236', 'balkan'),
    ('evropa', 'Q1246', 'balkan'),
    ('evropa', 'Q222', 'balkan'),
    ('evropa', 'Q221', 'balkan'),
    ('evropa', 'Q159', 'vychodni-evropa'),
    ('evropa', 'Q184', 'vychodni-evropa'),
    ('evropa', 'Q212', 'vychodni-evropa'),
    ('evropa', 'Q217', 'vychodni-evropa'),
    ('evropa', 'Q218', 'vychodni-evropa'),
    ('evropa', 'Q219', 'vychodni-evropa'),
    ('evropa', 'Q38', 'stredomori'),
    ('evropa', 'Q41', 'stredomori'),
    ('evropa', 'Q229', 'stredomori'),
    ('evropa', 'Q43', 'stredomori');
delete from public.conquest_links where map = 'evropa';
insert into public.conquest_links (map, a, b) values
    ('evropa', 'Q145', 'Q142'),
    ('evropa', 'Q145', 'Q189'),
    ('evropa', 'Q145', 'Q27'),
    ('evropa', 'Q27', 'Q145'),
    ('evropa', 'Q189', 'Q145'),
    ('evropa', 'Q189', 'Q20'),
    ('evropa', 'Q20', 'Q159'),
    ('evropa', 'Q20', 'Q189'),
    ('evropa', 'Q20', 'Q33'),
    ('evropa', 'Q20', 'Q34'),
    ('evropa', 'Q20', 'Q35'),
    ('evropa', 'Q34', 'Q20'),
    ('evropa', 'Q34', 'Q33'),
    ('evropa', 'Q34', 'Q35'),
    ('evropa', 'Q33', 'Q159'),
    ('evropa', 'Q33', 'Q191'),
    ('evropa', 'Q33', 'Q20'),
    ('evropa', 'Q33', 'Q34'),
    ('evropa', 'Q35', 'Q183'),
    ('evropa', 'Q35', 'Q20'),
    ('evropa', 'Q35', 'Q34'),
    ('evropa', 'Q191', 'Q159'),
    ('evropa', 'Q191', 'Q211'),
    ('evropa', 'Q191', 'Q33'),
    ('evropa', 'Q211', 'Q159'),
    ('evropa', 'Q211', 'Q184'),
    ('evropa', 'Q211', 'Q191'),
    ('evropa', 'Q211', 'Q37'),
    ('evropa', 'Q37', 'Q159'),
    ('evropa', 'Q37', 'Q184'),
    ('evropa', 'Q37', 'Q211'),
    ('evropa', 'Q37', 'Q36'),
    ('evropa', 'Q29', 'Q142'),
    ('evropa', 'Q29', 'Q45'),
    ('evropa', 'Q45', 'Q29'),
    ('evropa', 'Q142', 'Q145'),
    ('evropa', 'Q142', 'Q183'),
    ('evropa', 'Q142', 'Q29'),
    ('evropa', 'Q142', 'Q31'),
    ('evropa', 'Q142', 'Q32'),
    ('evropa', 'Q142', 'Q38'),
    ('evropa', 'Q142', 'Q39'),
    ('evropa', 'Q31', 'Q142'),
    ('evropa', 'Q31', 'Q183'),
    ('evropa', 'Q31', 'Q32'),
    ('evropa', 'Q31', 'Q55'),
    ('evropa', 'Q55', 'Q183'),
    ('evropa', 'Q55', 'Q31'),
    ('evropa', 'Q32', 'Q142'),
    ('evropa', 'Q32', 'Q183'),
    ('evropa', 'Q32', 'Q31'),
    ('evropa', 'Q39', 'Q142'),
    ('evropa', 'Q39', 'Q183'),
    ('evropa', 'Q39', 'Q38'),
    ('evropa', 'Q39', 'Q40'),
    ('evropa', 'Q183', 'Q142'),
    ('evropa', 'Q183', 'Q213'),
    ('evropa', 'Q183', 'Q31'),
    ('evropa', 'Q183', 'Q32'),
    ('evropa', 'Q183', 'Q35'),
    ('evropa', 'Q183', 'Q36'),
    ('evropa', 'Q183', 'Q39'),
    ('evropa', 'Q183', 'Q40'),
    ('evropa', 'Q183', 'Q55'),
    ('evropa', 'Q36', 'Q159'),
    ('evropa', 'Q36', 'Q183'),
    ('evropa', 'Q36', 'Q184'),
    ('evropa', 'Q36', 'Q212'),
    ('evropa', 'Q36', 'Q213'),
    ('evropa', 'Q36', 'Q214'),
    ('evropa', 'Q36', 'Q37'),
    ('evropa', 'Q213', 'Q183'),
    ('evropa', 'Q213', 'Q214'),
    ('evropa', 'Q213', 'Q36'),
    ('evropa', 'Q213', 'Q40'),
    ('evropa', 'Q214', 'Q212'),
    ('evropa', 'Q214', 'Q213'),
    ('evropa', 'Q214', 'Q28'),
    ('evropa', 'Q214', 'Q36'),
    ('evropa', 'Q214', 'Q40'),
    ('evropa', 'Q40', 'Q183'),
    ('evropa', 'Q40', 'Q213'),
    ('evropa', 'Q40', 'Q214'),
    ('evropa', 'Q40', 'Q215'),
    ('evropa', 'Q40', 'Q28'),
    ('evropa', 'Q40', 'Q38'),
    ('evropa', 'Q40', 'Q39'),
    ('evropa', 'Q28', 'Q212'),
    ('evropa', 'Q28', 'Q214'),
    ('evropa', 'Q28', 'Q215'),
    ('evropa', 'Q28', 'Q218'),
    ('evropa', 'Q28', 'Q224'),
    ('evropa', 'Q28', 'Q40'),
    ('evropa', 'Q28', 'Q403'),
    ('evropa', 'Q215', 'Q224'),
    ('evropa', 'Q215', 'Q28'),
    ('evropa', 'Q215', 'Q38'),
    ('evropa', 'Q215', 'Q40'),
    ('evropa', 'Q224', 'Q215'),
    ('evropa', 'Q224', 'Q225'),
    ('evropa', 'Q224', 'Q236'),
    ('evropa', 'Q224', 'Q28'),
    ('evropa', 'Q224', 'Q403'),
    ('evropa', 'Q225', 'Q224'),
    ('evropa', 'Q225', 'Q236'),
    ('evropa', 'Q225', 'Q403'),
    ('evropa', 'Q403', 'Q1246'),
    ('evropa', 'Q403', 'Q218'),
    ('evropa', 'Q403', 'Q219'),
    ('evropa', 'Q403', 'Q221'),
    ('evropa', 'Q403', 'Q224'),
    ('evropa', 'Q403', 'Q225'),
    ('evropa', 'Q403', 'Q236'),
    ('evropa', 'Q403', 'Q28'),
    ('evropa', 'Q236', 'Q1246'),
    ('evropa', 'Q236', 'Q222'),
    ('evropa', 'Q236', 'Q224'),
    ('evropa', 'Q236', 'Q225'),
    ('evropa', 'Q236', 'Q403'),
    ('evropa', 'Q1246', 'Q221'),
    ('evropa', 'Q1246', 'Q222'),
    ('evropa', 'Q1246', 'Q236'),
    ('evropa', 'Q1246', 'Q403'),
    ('evropa', 'Q222', 'Q1246'),
    ('evropa', 'Q222', 'Q221'),
    ('evropa', 'Q222', 'Q236'),
    ('evropa', 'Q222', 'Q38'),
    ('evropa', 'Q222', 'Q41'),
    ('evropa', 'Q221', 'Q1246'),
    ('evropa', 'Q221', 'Q219'),
    ('evropa', 'Q221', 'Q222'),
    ('evropa', 'Q221', 'Q403'),
    ('evropa', 'Q221', 'Q41'),
    ('evropa', 'Q159', 'Q184'),
    ('evropa', 'Q159', 'Q191'),
    ('evropa', 'Q159', 'Q20'),
    ('evropa', 'Q159', 'Q211'),
    ('evropa', 'Q159', 'Q212'),
    ('evropa', 'Q159', 'Q33'),
    ('evropa', 'Q159', 'Q36'),
    ('evropa', 'Q159', 'Q37'),
    ('evropa', 'Q184', 'Q159'),
    ('evropa', 'Q184', 'Q211'),
    ('evropa', 'Q184', 'Q212'),
    ('evropa', 'Q184', 'Q36'),
    ('evropa', 'Q184', 'Q37'),
    ('evropa', 'Q212', 'Q159'),
    ('evropa', 'Q212', 'Q184'),
    ('evropa', 'Q212', 'Q214'),
    ('evropa', 'Q212', 'Q217'),
    ('evropa', 'Q212', 'Q218'),
    ('evropa', 'Q212', 'Q28'),
    ('evropa', 'Q212', 'Q36'),
    ('evropa', 'Q217', 'Q212'),
    ('evropa', 'Q217', 'Q218'),
    ('evropa', 'Q218', 'Q212'),
    ('evropa', 'Q218', 'Q217'),
    ('evropa', 'Q218', 'Q219'),
    ('evropa', 'Q218', 'Q28'),
    ('evropa', 'Q218', 'Q403'),
    ('evropa', 'Q219', 'Q218'),
    ('evropa', 'Q219', 'Q221'),
    ('evropa', 'Q219', 'Q403'),
    ('evropa', 'Q219', 'Q41'),
    ('evropa', 'Q219', 'Q43'),
    ('evropa', 'Q38', 'Q142'),
    ('evropa', 'Q38', 'Q215'),
    ('evropa', 'Q38', 'Q222'),
    ('evropa', 'Q38', 'Q39'),
    ('evropa', 'Q38', 'Q40'),
    ('evropa', 'Q41', 'Q219'),
    ('evropa', 'Q41', 'Q221'),
    ('evropa', 'Q41', 'Q222'),
    ('evropa', 'Q41', 'Q229'),
    ('evropa', 'Q41', 'Q43'),
    ('evropa', 'Q229', 'Q41'),
    ('evropa', 'Q229', 'Q43'),
    ('evropa', 'Q43', 'Q219'),
    ('evropa', 'Q43', 'Q229'),
    ('evropa', 'Q43', 'Q41');
-- Mapa Afrika: 49 území, 9 regionů
insert into public.conquest_maps (id, title, territories, treasures, max_players) values ('afrika', 'Afrika', 49, 5, 8)
    on conflict (id) do update set title = excluded.title, territories = excluded.territories, treasures = excluded.treasures, max_players = excluded.max_players;
delete from public.conquest_regions where map = 'afrika';
insert into public.conquest_regions (map, territory, region) values
    ('afrika', 'Q1028', 'severni-afrika'),
    ('afrika', 'Q262', 'severni-afrika'),
    ('afrika', 'Q948', 'severni-afrika'),
    ('afrika', 'Q1016', 'severni-afrika'),
    ('afrika', 'Q79', 'severni-afrika'),
    ('afrika', 'Q1025', 'sahel'),
    ('afrika', 'Q912', 'sahel'),
    ('afrika', 'Q965', 'sahel'),
    ('afrika', 'Q1032', 'sahel'),
    ('afrika', 'Q657', 'sahel'),
    ('afrika', 'Q1049', 'sahel'),
    ('afrika', 'Q1041', 'zapadni-pobrezi'),
    ('afrika', 'Q1005', 'zapadni-pobrezi'),
    ('afrika', 'Q1007', 'zapadni-pobrezi'),
    ('afrika', 'Q1006', 'zapadni-pobrezi'),
    ('afrika', 'Q1044', 'zapadni-pobrezi'),
    ('afrika', 'Q1014', 'zapadni-pobrezi'),
    ('afrika', 'Q1008', 'guinejsky-zaliv'),
    ('afrika', 'Q117', 'guinejsky-zaliv'),
    ('afrika', 'Q945', 'guinejsky-zaliv'),
    ('afrika', 'Q962', 'guinejsky-zaliv'),
    ('afrika', 'Q1033', 'guinejsky-zaliv'),
    ('afrika', 'Q1009', 'stredni-afrika'),
    ('afrika', 'Q983', 'stredni-afrika'),
    ('afrika', 'Q1000', 'stredni-afrika'),
    ('afrika', 'Q971', 'stredni-afrika'),
    ('afrika', 'Q974', 'stredni-afrika'),
    ('afrika', 'Q929', 'stredni-afrika'),
    ('afrika', 'Q115', 'africky-roh'),
    ('afrika', 'Q986', 'africky-roh'),
    ('afrika', 'Q977', 'africky-roh'),
    ('afrika', 'Q1045', 'africky-roh'),
    ('afrika', 'Q958', 'africky-roh'),
    ('afrika', 'Q114', 'vychodni-afrika'),
    ('afrika', 'Q1036', 'vychodni-afrika'),
    ('afrika', 'Q1037', 'vychodni-afrika'),
    ('afrika', 'Q967', 'vychodni-afrika'),
    ('afrika', 'Q924', 'vychodni-afrika'),
    ('afrika', 'Q258', 'jizni-afrika'),
    ('afrika', 'Q1013', 'jizni-afrika'),
    ('afrika', 'Q1050', 'jizni-afrika'),
    ('afrika', 'Q1030', 'jizni-afrika'),
    ('afrika', 'Q963', 'jizni-afrika'),
    ('afrika', 'Q954', 'jizni-afrika'),
    ('afrika', 'Q916', 'zambezi'),
    ('afrika', 'Q953', 'zambezi'),
    ('afrika', 'Q1020', 'zambezi'),
    ('afrika', 'Q1029', 'zambezi'),
    ('afrika', 'Q1019', 'zambezi');
delete from public.conquest_links where map = 'afrika';
insert into public.conquest_links (map, a, b) values
    ('afrika', 'Q1028', 'Q262'),
    ('afrika', 'Q262', 'Q1016'),
    ('afrika', 'Q262', 'Q1025'),
    ('afrika', 'Q262', 'Q1028'),
    ('afrika', 'Q262', 'Q1032'),
    ('afrika', 'Q262', 'Q912'),
    ('afrika', 'Q262', 'Q948'),
    ('afrika', 'Q948', 'Q1016'),
    ('afrika', 'Q948', 'Q262'),
    ('afrika', 'Q1016', 'Q1032'),
    ('afrika', 'Q1016', 'Q1049'),
    ('afrika', 'Q1016', 'Q262'),
    ('afrika', 'Q1016', 'Q657'),
    ('afrika', 'Q1016', 'Q79'),
    ('afrika', 'Q1016', 'Q948'),
    ('afrika', 'Q79', 'Q1016'),
    ('afrika', 'Q79', 'Q1049'),
    ('afrika', 'Q1025', 'Q1041'),
    ('afrika', 'Q1025', 'Q262'),
    ('afrika', 'Q1025', 'Q912'),
    ('afrika', 'Q912', 'Q1006'),
    ('afrika', 'Q912', 'Q1008'),
    ('afrika', 'Q912', 'Q1025'),
    ('afrika', 'Q912', 'Q1032'),
    ('afrika', 'Q912', 'Q1041'),
    ('afrika', 'Q912', 'Q262'),
    ('afrika', 'Q912', 'Q965'),
    ('afrika', 'Q965', 'Q1008'),
    ('afrika', 'Q965', 'Q1032'),
    ('afrika', 'Q965', 'Q117'),
    ('afrika', 'Q965', 'Q912'),
    ('afrika', 'Q965', 'Q945'),
    ('afrika', 'Q965', 'Q962'),
    ('afrika', 'Q1032', 'Q1009'),
    ('afrika', 'Q1032', 'Q1016'),
    ('afrika', 'Q1032', 'Q1033'),
    ('afrika', 'Q1032', 'Q262'),
    ('afrika', 'Q1032', 'Q657'),
    ('afrika', 'Q1032', 'Q912'),
    ('afrika', 'Q1032', 'Q962'),
    ('afrika', 'Q1032', 'Q965'),
    ('afrika', 'Q657', 'Q1009'),
    ('afrika', 'Q657', 'Q1016'),
    ('afrika', 'Q657', 'Q1032'),
    ('afrika', 'Q657', 'Q1033'),
    ('afrika', 'Q657', 'Q1049'),
    ('afrika', 'Q657', 'Q929'),
    ('afrika', 'Q1049', 'Q1016'),
    ('afrika', 'Q1049', 'Q115'),
    ('afrika', 'Q1049', 'Q657'),
    ('afrika', 'Q1049', 'Q79'),
    ('afrika', 'Q1049', 'Q929'),
    ('afrika', 'Q1049', 'Q958'),
    ('afrika', 'Q1049', 'Q986'),
    ('afrika', 'Q1041', 'Q1005'),
    ('afrika', 'Q1041', 'Q1006'),
    ('afrika', 'Q1041', 'Q1007'),
    ('afrika', 'Q1041', 'Q1025'),
    ('afrika', 'Q1041', 'Q912'),
    ('afrika', 'Q1005', 'Q1041'),
    ('afrika', 'Q1007', 'Q1006'),
    ('afrika', 'Q1007', 'Q1041'),
    ('afrika', 'Q1006', 'Q1007'),
    ('afrika', 'Q1006', 'Q1008'),
    ('afrika', 'Q1006', 'Q1014'),
    ('afrika', 'Q1006', 'Q1041'),
    ('afrika', 'Q1006', 'Q1044'),
    ('afrika', 'Q1006', 'Q912'),
    ('afrika', 'Q1044', 'Q1006'),
    ('afrika', 'Q1044', 'Q1014'),
    ('afrika', 'Q1014', 'Q1006'),
    ('afrika', 'Q1014', 'Q1008'),
    ('afrika', 'Q1014', 'Q1044'),
    ('afrika', 'Q1008', 'Q1006'),
    ('afrika', 'Q1008', 'Q1014'),
    ('afrika', 'Q1008', 'Q117'),
    ('afrika', 'Q1008', 'Q912'),
    ('afrika', 'Q1008', 'Q965'),
    ('afrika', 'Q117', 'Q1008'),
    ('afrika', 'Q117', 'Q945'),
    ('afrika', 'Q117', 'Q965'),
    ('afrika', 'Q945', 'Q117'),
    ('afrika', 'Q945', 'Q962'),
    ('afrika', 'Q945', 'Q965'),
    ('afrika', 'Q962', 'Q1032'),
    ('afrika', 'Q962', 'Q1033'),
    ('afrika', 'Q962', 'Q945'),
    ('afrika', 'Q962', 'Q965'),
    ('afrika', 'Q1033', 'Q1009'),
    ('afrika', 'Q1033', 'Q1032'),
    ('afrika', 'Q1033', 'Q657'),
    ('afrika', 'Q1033', 'Q962'),
    ('afrika', 'Q1009', 'Q1000'),
    ('afrika', 'Q1009', 'Q1032'),
    ('afrika', 'Q1009', 'Q1033'),
    ('afrika', 'Q1009', 'Q657'),
    ('afrika', 'Q1009', 'Q929'),
    ('afrika', 'Q1009', 'Q971'),
    ('afrika', 'Q1009', 'Q983'),
    ('afrika', 'Q983', 'Q1000'),
    ('afrika', 'Q983', 'Q1009'),
    ('afrika', 'Q1000', 'Q1009'),
    ('afrika', 'Q1000', 'Q971'),
    ('afrika', 'Q1000', 'Q983'),
    ('afrika', 'Q971', 'Q1000'),
    ('afrika', 'Q971', 'Q1009'),
    ('afrika', 'Q971', 'Q916'),
    ('afrika', 'Q971', 'Q929'),
    ('afrika', 'Q971', 'Q974'),
    ('afrika', 'Q974', 'Q1036'),
    ('afrika', 'Q974', 'Q1037'),
    ('afrika', 'Q974', 'Q916'),
    ('afrika', 'Q974', 'Q924'),
    ('afrika', 'Q974', 'Q929'),
    ('afrika', 'Q974', 'Q953'),
    ('afrika', 'Q974', 'Q958'),
    ('afrika', 'Q974', 'Q967'),
    ('afrika', 'Q974', 'Q971'),
    ('afrika', 'Q929', 'Q1009'),
    ('afrika', 'Q929', 'Q1049'),
    ('afrika', 'Q929', 'Q657'),
    ('afrika', 'Q929', 'Q958'),
    ('afrika', 'Q929', 'Q971'),
    ('afrika', 'Q929', 'Q974'),
    ('afrika', 'Q115', 'Q1045'),
    ('afrika', 'Q115', 'Q1049'),
    ('afrika', 'Q115', 'Q114'),
    ('afrika', 'Q115', 'Q958'),
    ('afrika', 'Q115', 'Q977'),
    ('afrika', 'Q115', 'Q986'),
    ('afrika', 'Q986', 'Q1049'),
    ('afrika', 'Q986', 'Q115'),
    ('afrika', 'Q986', 'Q977'),
    ('afrika', 'Q977', 'Q1045'),
    ('afrika', 'Q977', 'Q115'),
    ('afrika', 'Q977', 'Q986'),
    ('afrika', 'Q1045', 'Q114'),
    ('afrika', 'Q1045', 'Q115'),
    ('afrika', 'Q1045', 'Q977'),
    ('afrika', 'Q958', 'Q1036'),
    ('afrika', 'Q958', 'Q1049'),
    ('afrika', 'Q958', 'Q114'),
    ('afrika', 'Q958', 'Q115'),
    ('afrika', 'Q958', 'Q929'),
    ('afrika', 'Q958', 'Q974'),
    ('afrika', 'Q114', 'Q1036'),
    ('afrika', 'Q114', 'Q1045'),
    ('afrika', 'Q114', 'Q115'),
    ('afrika', 'Q114', 'Q924'),
    ('afrika', 'Q114', 'Q958'),
    ('afrika', 'Q1036', 'Q1037'),
    ('afrika', 'Q1036', 'Q114'),
    ('afrika', 'Q1036', 'Q924'),
    ('afrika', 'Q1036', 'Q958'),
    ('afrika', 'Q1036', 'Q974'),
    ('afrika', 'Q1037', 'Q1036'),
    ('afrika', 'Q1037', 'Q924'),
    ('afrika', 'Q1037', 'Q967'),
    ('afrika', 'Q1037', 'Q974'),
    ('afrika', 'Q967', 'Q1037'),
    ('afrika', 'Q967', 'Q924'),
    ('afrika', 'Q967', 'Q974'),
    ('afrika', 'Q924', 'Q1020'),
    ('afrika', 'Q924', 'Q1029'),
    ('afrika', 'Q924', 'Q1036'),
    ('afrika', 'Q924', 'Q1037'),
    ('afrika', 'Q924', 'Q114'),
    ('afrika', 'Q924', 'Q953'),
    ('afrika', 'Q924', 'Q967'),
    ('afrika', 'Q924', 'Q974'),
    ('afrika', 'Q258', 'Q1013'),
    ('afrika', 'Q258', 'Q1029'),
    ('afrika', 'Q258', 'Q1030'),
    ('afrika', 'Q258', 'Q1050'),
    ('afrika', 'Q258', 'Q954'),
    ('afrika', 'Q258', 'Q963'),
    ('afrika', 'Q1013', 'Q258'),
    ('afrika', 'Q1050', 'Q1029'),
    ('afrika', 'Q1050', 'Q258'),
    ('afrika', 'Q1030', 'Q258'),
    ('afrika', 'Q1030', 'Q916'),
    ('afrika', 'Q1030', 'Q953'),
    ('afrika', 'Q1030', 'Q963'),
    ('afrika', 'Q963', 'Q1030'),
    ('afrika', 'Q963', 'Q258'),
    ('afrika', 'Q963', 'Q953'),
    ('afrika', 'Q963', 'Q954'),
    ('afrika', 'Q954', 'Q1029'),
    ('afrika', 'Q954', 'Q258'),
    ('afrika', 'Q954', 'Q953'),
    ('afrika', 'Q954', 'Q963'),
    ('afrika', 'Q916', 'Q1030'),
    ('afrika', 'Q916', 'Q953'),
    ('afrika', 'Q916', 'Q971'),
    ('afrika', 'Q916', 'Q974'),
    ('afrika', 'Q953', 'Q1020'),
    ('afrika', 'Q953', 'Q1029'),
    ('afrika', 'Q953', 'Q1030'),
    ('afrika', 'Q953', 'Q916'),
    ('afrika', 'Q953', 'Q924'),
    ('afrika', 'Q953', 'Q954'),
    ('afrika', 'Q953', 'Q963'),
    ('afrika', 'Q953', 'Q974'),
    ('afrika', 'Q1020', 'Q1029'),
    ('afrika', 'Q1020', 'Q924'),
    ('afrika', 'Q1020', 'Q953'),
    ('afrika', 'Q1029', 'Q1019'),
    ('afrika', 'Q1029', 'Q1020'),
    ('afrika', 'Q1029', 'Q1050'),
    ('afrika', 'Q1029', 'Q258'),
    ('afrika', 'Q1029', 'Q924'),
    ('afrika', 'Q1029', 'Q953'),
    ('afrika', 'Q1029', 'Q954'),
    ('afrika', 'Q1019', 'Q1029');
-- Mapa Asie: 45 území, 9 regionů
insert into public.conquest_maps (id, title, territories, treasures, max_players) values ('asie', 'Asie', 45, 5, 8)
    on conflict (id) do update set title = excluded.title, territories = excluded.territories, treasures = excluded.treasures, max_players = excluded.max_players;
delete from public.conquest_regions where map = 'asie';
insert into public.conquest_regions (map, territory, region) values
    ('asie', 'Q43', 'blizky-vychod'),
    ('asie', 'Q858', 'blizky-vychod'),
    ('asie', 'Q822', 'blizky-vychod'),
    ('asie', 'Q801', 'blizky-vychod'),
    ('asie', 'Q810', 'blizky-vychod'),
    ('asie', 'Q796', 'blizky-vychod'),
    ('asie', 'Q851', 'arabie'),
    ('asie', 'Q805', 'arabie'),
    ('asie', 'Q842', 'arabie'),
    ('asie', 'Q878', 'arabie'),
    ('asie', 'Q846', 'arabie'),
    ('asie', 'Q817', 'arabie'),
    ('asie', 'Q230', 'kavkaz'),
    ('asie', 'Q399', 'kavkaz'),
    ('asie', 'Q227', 'kavkaz'),
    ('asie', 'Q794', 'kavkaz'),
    ('asie', 'Q159', 'sibir-step'),
    ('asie', 'Q232', 'sibir-step'),
    ('asie', 'Q711', 'sibir-step'),
    ('asie', 'Q265', 'stredni-asie'),
    ('asie', 'Q874', 'stredni-asie'),
    ('asie', 'Q863', 'stredni-asie'),
    ('asie', 'Q813', 'stredni-asie'),
    ('asie', 'Q889', 'stredni-asie'),
    ('asie', 'Q843', 'indicky-subkontinent'),
    ('asie', 'Q668', 'indicky-subkontinent'),
    ('asie', 'Q837', 'indicky-subkontinent'),
    ('asie', 'Q917', 'indicky-subkontinent'),
    ('asie', 'Q902', 'indicky-subkontinent'),
    ('asie', 'Q854', 'indicky-subkontinent'),
    ('asie', 'Q148', 'dalny-vychod'),
    ('asie', 'Q423', 'dalny-vychod'),
    ('asie', 'Q884', 'dalny-vychod'),
    ('asie', 'Q17', 'dalny-vychod'),
    ('asie', 'Q865', 'dalny-vychod'),
    ('asie', 'Q836', 'indocina'),
    ('asie', 'Q869', 'indocina'),
    ('asie', 'Q819', 'indocina'),
    ('asie', 'Q424', 'indocina'),
    ('asie', 'Q881', 'indocina'),
    ('asie', 'Q833', 'malajske-souostrovi'),
    ('asie', 'Q921', 'malajske-souostrovi'),
    ('asie', 'Q252', 'malajske-souostrovi'),
    ('asie', 'Q574', 'malajske-souostrovi'),
    ('asie', 'Q928', 'malajske-souostrovi');
delete from public.conquest_links where map = 'asie';
insert into public.conquest_links (map, a, b) values
    ('asie', 'Q43', 'Q230'),
    ('asie', 'Q43', 'Q399'),
    ('asie', 'Q43', 'Q794'),
    ('asie', 'Q43', 'Q796'),
    ('asie', 'Q43', 'Q858'),
    ('asie', 'Q858', 'Q43'),
    ('asie', 'Q858', 'Q796'),
    ('asie', 'Q858', 'Q801'),
    ('asie', 'Q858', 'Q810'),
    ('asie', 'Q858', 'Q822'),
    ('asie', 'Q822', 'Q801'),
    ('asie', 'Q822', 'Q858'),
    ('asie', 'Q801', 'Q810'),
    ('asie', 'Q801', 'Q822'),
    ('asie', 'Q801', 'Q858'),
    ('asie', 'Q810', 'Q796'),
    ('asie', 'Q810', 'Q801'),
    ('asie', 'Q810', 'Q851'),
    ('asie', 'Q810', 'Q858'),
    ('asie', 'Q796', 'Q43'),
    ('asie', 'Q796', 'Q794'),
    ('asie', 'Q796', 'Q810'),
    ('asie', 'Q796', 'Q817'),
    ('asie', 'Q796', 'Q851'),
    ('asie', 'Q796', 'Q858'),
    ('asie', 'Q851', 'Q794'),
    ('asie', 'Q851', 'Q796'),
    ('asie', 'Q851', 'Q805'),
    ('asie', 'Q851', 'Q810'),
    ('asie', 'Q851', 'Q817'),
    ('asie', 'Q851', 'Q842'),
    ('asie', 'Q851', 'Q846'),
    ('asie', 'Q851', 'Q878'),
    ('asie', 'Q805', 'Q842'),
    ('asie', 'Q805', 'Q851'),
    ('asie', 'Q842', 'Q794'),
    ('asie', 'Q842', 'Q805'),
    ('asie', 'Q842', 'Q851'),
    ('asie', 'Q842', 'Q878'),
    ('asie', 'Q878', 'Q794'),
    ('asie', 'Q878', 'Q842'),
    ('asie', 'Q878', 'Q846'),
    ('asie', 'Q878', 'Q851'),
    ('asie', 'Q846', 'Q851'),
    ('asie', 'Q846', 'Q878'),
    ('asie', 'Q817', 'Q796'),
    ('asie', 'Q817', 'Q851'),
    ('asie', 'Q230', 'Q159'),
    ('asie', 'Q230', 'Q227'),
    ('asie', 'Q230', 'Q399'),
    ('asie', 'Q230', 'Q43'),
    ('asie', 'Q399', 'Q227'),
    ('asie', 'Q399', 'Q230'),
    ('asie', 'Q399', 'Q43'),
    ('asie', 'Q399', 'Q794'),
    ('asie', 'Q227', 'Q159'),
    ('asie', 'Q227', 'Q230'),
    ('asie', 'Q227', 'Q399'),
    ('asie', 'Q227', 'Q794'),
    ('asie', 'Q794', 'Q227'),
    ('asie', 'Q794', 'Q399'),
    ('asie', 'Q794', 'Q43'),
    ('asie', 'Q794', 'Q796'),
    ('asie', 'Q794', 'Q842'),
    ('asie', 'Q794', 'Q843'),
    ('asie', 'Q794', 'Q851'),
    ('asie', 'Q794', 'Q874'),
    ('asie', 'Q794', 'Q878'),
    ('asie', 'Q794', 'Q889'),
    ('asie', 'Q159', 'Q148'),
    ('asie', 'Q159', 'Q17'),
    ('asie', 'Q159', 'Q227'),
    ('asie', 'Q159', 'Q230'),
    ('asie', 'Q159', 'Q232'),
    ('asie', 'Q159', 'Q423'),
    ('asie', 'Q159', 'Q711'),
    ('asie', 'Q232', 'Q148'),
    ('asie', 'Q232', 'Q159'),
    ('asie', 'Q232', 'Q265'),
    ('asie', 'Q232', 'Q813'),
    ('asie', 'Q232', 'Q874'),
    ('asie', 'Q711', 'Q148'),
    ('asie', 'Q711', 'Q159'),
    ('asie', 'Q265', 'Q232'),
    ('asie', 'Q265', 'Q813'),
    ('asie', 'Q265', 'Q863'),
    ('asie', 'Q265', 'Q874'),
    ('asie', 'Q265', 'Q889'),
    ('asie', 'Q874', 'Q232'),
    ('asie', 'Q874', 'Q265'),
    ('asie', 'Q874', 'Q794'),
    ('asie', 'Q874', 'Q889'),
    ('asie', 'Q863', 'Q148'),
    ('asie', 'Q863', 'Q265'),
    ('asie', 'Q863', 'Q813'),
    ('asie', 'Q863', 'Q889'),
    ('asie', 'Q813', 'Q148'),
    ('asie', 'Q813', 'Q232'),
    ('asie', 'Q813', 'Q265'),
    ('asie', 'Q813', 'Q863'),
    ('asie', 'Q889', 'Q148'),
    ('asie', 'Q889', 'Q265'),
    ('asie', 'Q889', 'Q794'),
    ('asie', 'Q889', 'Q843'),
    ('asie', 'Q889', 'Q863'),
    ('asie', 'Q889', 'Q874'),
    ('asie', 'Q843', 'Q148'),
    ('asie', 'Q843', 'Q668'),
    ('asie', 'Q843', 'Q794'),
    ('asie', 'Q843', 'Q889'),
    ('asie', 'Q668', 'Q148'),
    ('asie', 'Q668', 'Q836'),
    ('asie', 'Q668', 'Q837'),
    ('asie', 'Q668', 'Q843'),
    ('asie', 'Q668', 'Q854'),
    ('asie', 'Q668', 'Q902'),
    ('asie', 'Q668', 'Q917'),
    ('asie', 'Q837', 'Q148'),
    ('asie', 'Q837', 'Q668'),
    ('asie', 'Q917', 'Q148'),
    ('asie', 'Q917', 'Q668'),
    ('asie', 'Q902', 'Q668'),
    ('asie', 'Q902', 'Q836'),
    ('asie', 'Q854', 'Q668'),
    ('asie', 'Q148', 'Q159'),
    ('asie', 'Q148', 'Q232'),
    ('asie', 'Q148', 'Q423'),
    ('asie', 'Q148', 'Q668'),
    ('asie', 'Q148', 'Q711'),
    ('asie', 'Q148', 'Q813'),
    ('asie', 'Q148', 'Q819'),
    ('asie', 'Q148', 'Q836'),
    ('asie', 'Q148', 'Q837'),
    ('asie', 'Q148', 'Q843'),
    ('asie', 'Q148', 'Q863'),
    ('asie', 'Q148', 'Q865'),
    ('asie', 'Q148', 'Q881'),
    ('asie', 'Q148', 'Q889'),
    ('asie', 'Q148', 'Q917'),
    ('asie', 'Q423', 'Q148'),
    ('asie', 'Q423', 'Q159'),
    ('asie', 'Q423', 'Q884'),
    ('asie', 'Q884', 'Q17'),
    ('asie', 'Q884', 'Q423'),
    ('asie', 'Q17', 'Q159'),
    ('asie', 'Q17', 'Q884'),
    ('asie', 'Q865', 'Q148'),
    ('asie', 'Q836', 'Q148'),
    ('asie', 'Q836', 'Q668'),
    ('asie', 'Q836', 'Q819'),
    ('asie', 'Q836', 'Q869'),
    ('asie', 'Q836', 'Q902'),
    ('asie', 'Q869', 'Q424'),
    ('asie', 'Q869', 'Q819'),
    ('asie', 'Q869', 'Q833'),
    ('asie', 'Q869', 'Q836'),
    ('asie', 'Q819', 'Q148'),
    ('asie', 'Q819', 'Q424'),
    ('asie', 'Q819', 'Q836'),
    ('asie', 'Q819', 'Q869'),
    ('asie', 'Q819', 'Q881'),
    ('asie', 'Q424', 'Q819'),
    ('asie', 'Q424', 'Q869'),
    ('asie', 'Q424', 'Q881'),
    ('asie', 'Q881', 'Q148'),
    ('asie', 'Q881', 'Q424'),
    ('asie', 'Q881', 'Q819'),
    ('asie', 'Q833', 'Q252'),
    ('asie', 'Q833', 'Q869'),
    ('asie', 'Q833', 'Q921'),
    ('asie', 'Q833', 'Q928'),
    ('asie', 'Q921', 'Q833'),
    ('asie', 'Q252', 'Q574'),
    ('asie', 'Q252', 'Q833'),
    ('asie', 'Q574', 'Q252'),
    ('asie', 'Q928', 'Q833');
-- Mapa Amerika: 28 území, 6 regionů
insert into public.conquest_maps (id, title, territories, treasures, max_players) values ('amerika', 'Amerika', 28, 3, 8)
    on conflict (id) do update set title = excluded.title, territories = excluded.territories, treasures = excluded.treasures, max_players = excluded.max_players;
delete from public.conquest_regions where map = 'amerika';
insert into public.conquest_regions (map, territory, region) values
    ('amerika', 'Q16', 'severni-amerika'),
    ('amerika', 'Q30', 'severni-amerika'),
    ('amerika', 'Q96', 'severni-amerika'),
    ('amerika', 'Q774', 'stredni-amerika'),
    ('amerika', 'Q242', 'stredni-amerika'),
    ('amerika', 'Q783', 'stredni-amerika'),
    ('amerika', 'Q792', 'stredni-amerika'),
    ('amerika', 'Q811', 'stredni-amerika'),
    ('amerika', 'Q800', 'stredni-amerika'),
    ('amerika', 'Q804', 'stredni-amerika'),
    ('amerika', 'Q241', 'karibik'),
    ('amerika', 'Q778', 'karibik'),
    ('amerika', 'Q766', 'karibik'),
    ('amerika', 'Q790', 'karibik'),
    ('amerika', 'Q786', 'karibik'),
    ('amerika', 'Q754', 'karibik'),
    ('amerika', 'Q739', 'sever-jizni-ameriky'),
    ('amerika', 'Q717', 'sever-jizni-ameriky'),
    ('amerika', 'Q734', 'sever-jizni-ameriky'),
    ('amerika', 'Q730', 'sever-jizni-ameriky'),
    ('amerika', 'Q736', 'andy'),
    ('amerika', 'Q419', 'andy'),
    ('amerika', 'Q750', 'andy'),
    ('amerika', 'Q298', 'andy'),
    ('amerika', 'Q155', 'brazilie-jih'),
    ('amerika', 'Q414', 'brazilie-jih'),
    ('amerika', 'Q77', 'brazilie-jih'),
    ('amerika', 'Q733', 'brazilie-jih');
delete from public.conquest_links where map = 'amerika';
insert into public.conquest_links (map, a, b) values
    ('amerika', 'Q16', 'Q30'),
    ('amerika', 'Q30', 'Q16'),
    ('amerika', 'Q30', 'Q241'),
    ('amerika', 'Q30', 'Q778'),
    ('amerika', 'Q30', 'Q96'),
    ('amerika', 'Q96', 'Q241'),
    ('amerika', 'Q96', 'Q242'),
    ('amerika', 'Q96', 'Q30'),
    ('amerika', 'Q96', 'Q774'),
    ('amerika', 'Q774', 'Q242'),
    ('amerika', 'Q774', 'Q783'),
    ('amerika', 'Q774', 'Q792'),
    ('amerika', 'Q774', 'Q96'),
    ('amerika', 'Q242', 'Q774'),
    ('amerika', 'Q242', 'Q96'),
    ('amerika', 'Q783', 'Q774'),
    ('amerika', 'Q783', 'Q792'),
    ('amerika', 'Q783', 'Q811'),
    ('amerika', 'Q792', 'Q774'),
    ('amerika', 'Q792', 'Q783'),
    ('amerika', 'Q792', 'Q811'),
    ('amerika', 'Q811', 'Q783'),
    ('amerika', 'Q811', 'Q792'),
    ('amerika', 'Q811', 'Q800'),
    ('amerika', 'Q800', 'Q804'),
    ('amerika', 'Q800', 'Q811'),
    ('amerika', 'Q804', 'Q739'),
    ('amerika', 'Q804', 'Q800'),
    ('amerika', 'Q241', 'Q30'),
    ('amerika', 'Q241', 'Q766'),
    ('amerika', 'Q241', 'Q778'),
    ('amerika', 'Q241', 'Q790'),
    ('amerika', 'Q241', 'Q96'),
    ('amerika', 'Q778', 'Q241'),
    ('amerika', 'Q778', 'Q30'),
    ('amerika', 'Q766', 'Q241'),
    ('amerika', 'Q766', 'Q790'),
    ('amerika', 'Q790', 'Q241'),
    ('amerika', 'Q790', 'Q766'),
    ('amerika', 'Q790', 'Q786'),
    ('amerika', 'Q786', 'Q790'),
    ('amerika', 'Q754', 'Q717'),
    ('amerika', 'Q754', 'Q734'),
    ('amerika', 'Q739', 'Q155'),
    ('amerika', 'Q739', 'Q419'),
    ('amerika', 'Q739', 'Q717'),
    ('amerika', 'Q739', 'Q736'),
    ('amerika', 'Q739', 'Q804'),
    ('amerika', 'Q717', 'Q155'),
    ('amerika', 'Q717', 'Q734'),
    ('amerika', 'Q717', 'Q739'),
    ('amerika', 'Q717', 'Q754'),
    ('amerika', 'Q734', 'Q155'),
    ('amerika', 'Q734', 'Q717'),
    ('amerika', 'Q734', 'Q730'),
    ('amerika', 'Q734', 'Q754'),
    ('amerika', 'Q730', 'Q155'),
    ('amerika', 'Q730', 'Q734'),
    ('amerika', 'Q736', 'Q419'),
    ('amerika', 'Q736', 'Q739'),
    ('amerika', 'Q419', 'Q155'),
    ('amerika', 'Q419', 'Q298'),
    ('amerika', 'Q419', 'Q736'),
    ('amerika', 'Q419', 'Q739'),
    ('amerika', 'Q419', 'Q750'),
    ('amerika', 'Q750', 'Q155'),
    ('amerika', 'Q750', 'Q298'),
    ('amerika', 'Q750', 'Q414'),
    ('amerika', 'Q750', 'Q419'),
    ('amerika', 'Q750', 'Q733'),
    ('amerika', 'Q298', 'Q414'),
    ('amerika', 'Q298', 'Q419'),
    ('amerika', 'Q298', 'Q750'),
    ('amerika', 'Q155', 'Q414'),
    ('amerika', 'Q155', 'Q419'),
    ('amerika', 'Q155', 'Q717'),
    ('amerika', 'Q155', 'Q730'),
    ('amerika', 'Q155', 'Q733'),
    ('amerika', 'Q155', 'Q734'),
    ('amerika', 'Q155', 'Q739'),
    ('amerika', 'Q155', 'Q750'),
    ('amerika', 'Q155', 'Q77'),
    ('amerika', 'Q414', 'Q155'),
    ('amerika', 'Q414', 'Q298'),
    ('amerika', 'Q414', 'Q733'),
    ('amerika', 'Q414', 'Q750'),
    ('amerika', 'Q414', 'Q77'),
    ('amerika', 'Q77', 'Q155'),
    ('amerika', 'Q77', 'Q414'),
    ('amerika', 'Q733', 'Q155'),
    ('amerika', 'Q733', 'Q414'),
    ('amerika', 'Q733', 'Q750');
-- Mapa Česko: 14 území, 6 regionů
insert into public.conquest_maps (id, title, territories, treasures, max_players) values ('cesko', 'Česko', 14, 1, 6)
    on conflict (id) do update set title = excluded.title, territories = excluded.territories, treasures = excluded.treasures, max_players = excluded.max_players;
delete from public.conquest_regions where map = 'cesko';
insert into public.conquest_regions (map, territory, region) values
    ('cesko', 'Q1085', 'stredni-cechy'),
    ('cesko', 'Q188399', 'stredni-cechy'),
    ('cesko', 'Q188373', 'jihozapad'),
    ('cesko', 'Q46070', 'jihozapad'),
    ('cesko', 'Q191091', 'severozapad'),
    ('cesko', 'Q192702', 'severozapad'),
    ('cesko', 'Q193266', 'severovychod'),
    ('cesko', 'Q193295', 'severovychod'),
    ('cesko', 'Q193317', 'severovychod'),
    ('cesko', 'Q190930', 'jihovychod'),
    ('cesko', 'Q192697', 'jihovychod'),
    ('cesko', 'Q193307', 'morava'),
    ('cesko', 'Q192536', 'morava'),
    ('cesko', 'Q190550', 'morava');
delete from public.conquest_links where map = 'cesko';
insert into public.conquest_links (map, a, b) values
    ('cesko', 'Q1085', 'Q188399'),
    ('cesko', 'Q188399', 'Q1085'),
    ('cesko', 'Q188399', 'Q188373'),
    ('cesko', 'Q188399', 'Q190930'),
    ('cesko', 'Q188399', 'Q192702'),
    ('cesko', 'Q188399', 'Q193266'),
    ('cesko', 'Q188399', 'Q193295'),
    ('cesko', 'Q188399', 'Q193317'),
    ('cesko', 'Q188399', 'Q46070'),
    ('cesko', 'Q188373', 'Q188399'),
    ('cesko', 'Q188373', 'Q190930'),
    ('cesko', 'Q188373', 'Q192697'),
    ('cesko', 'Q188373', 'Q46070'),
    ('cesko', 'Q46070', 'Q188373'),
    ('cesko', 'Q46070', 'Q188399'),
    ('cesko', 'Q46070', 'Q191091'),
    ('cesko', 'Q191091', 'Q192702'),
    ('cesko', 'Q191091', 'Q46070'),
    ('cesko', 'Q192702', 'Q188399'),
    ('cesko', 'Q192702', 'Q191091'),
    ('cesko', 'Q192702', 'Q193266'),
    ('cesko', 'Q193266', 'Q188399'),
    ('cesko', 'Q193266', 'Q192702'),
    ('cesko', 'Q193266', 'Q193295'),
    ('cesko', 'Q193295', 'Q188399'),
    ('cesko', 'Q193295', 'Q193266'),
    ('cesko', 'Q193295', 'Q193317'),
    ('cesko', 'Q193317', 'Q188399'),
    ('cesko', 'Q193317', 'Q190930'),
    ('cesko', 'Q193317', 'Q192697'),
    ('cesko', 'Q193317', 'Q193295'),
    ('cesko', 'Q193317', 'Q193307'),
    ('cesko', 'Q190930', 'Q188373'),
    ('cesko', 'Q190930', 'Q188399'),
    ('cesko', 'Q190930', 'Q192697'),
    ('cesko', 'Q190930', 'Q193317'),
    ('cesko', 'Q192697', 'Q188373'),
    ('cesko', 'Q192697', 'Q190930'),
    ('cesko', 'Q192697', 'Q192536'),
    ('cesko', 'Q192697', 'Q193307'),
    ('cesko', 'Q192697', 'Q193317'),
    ('cesko', 'Q193307', 'Q190550'),
    ('cesko', 'Q193307', 'Q192536'),
    ('cesko', 'Q193307', 'Q192697'),
    ('cesko', 'Q193307', 'Q193317'),
    ('cesko', 'Q192536', 'Q190550'),
    ('cesko', 'Q192536', 'Q192697'),
    ('cesko', 'Q192536', 'Q193307'),
    ('cesko', 'Q190550', 'Q192536'),
    ('cesko', 'Q190550', 'Q193307');
-- dobyvani:data:end

-- Je přihlášený hráč ve hře? (pravidla řádků; s právy vlastníka, ať se pravidlo conquest_players nevolá samo na sebe)
create or replace function public.conquest_is_player(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.conquest_players p where p.game_id = gid and p.user_id = auth.uid());
$$;
create or replace function public.conquest_is_open(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.conquest_games g where g.id = gid and g.status = 'lobby' and g.visibility = 'public');
$$;
alter table public.conquest_maps enable row level security;
alter table public.conquest_regions enable row level security;
alter table public.conquest_links enable row level security;
alter table public.conquest_games enable row level security;
alter table public.conquest_players enable row level security;
alter table public.conquest_territories enable row level security;
alter table public.conquest_moves enable row level security;
drop policy if exists "dobývání mapy: čtení" on public.conquest_maps;
create policy "dobývání mapy: čtení" on public.conquest_maps for select to authenticated using (true);
drop policy if exists "dobývání regiony: čtení" on public.conquest_regions;
create policy "dobývání regiony: čtení" on public.conquest_regions for select to authenticated using (true);
drop policy if exists "dobývání sousedství: čtení" on public.conquest_links;
create policy "dobývání sousedství: čtení" on public.conquest_links for select to authenticated using (true);
drop policy if exists "dobývání hry: hráči a otevřené" on public.conquest_games;
create policy "dobývání hry: hráči a otevřené" on public.conquest_games for select to authenticated using ((status = 'lobby' and visibility = 'public') or public.conquest_is_player(id));
drop policy if exists "dobývání hráči: hráči a otevřené" on public.conquest_players;
create policy "dobývání hráči: hráči a otevřené" on public.conquest_players for select to authenticated using (public.conquest_is_open(game_id) or public.conquest_is_player(game_id));
drop policy if exists "dobývání území: hráči" on public.conquest_territories;
create policy "dobývání území: hráči" on public.conquest_territories for select to authenticated using (public.conquest_is_player(game_id));
drop policy if exists "dobývání tahy: hráči" on public.conquest_moves;
create policy "dobývání tahy: hráči" on public.conquest_moves for select to authenticated using (public.conquest_is_player(game_id));
revoke all on public.conquest_maps, public.conquest_regions, public.conquest_links, public.conquest_games, public.conquest_players,
    public.conquest_territories, public.conquest_moves from anon, authenticated;
grant select on public.conquest_maps, public.conquest_regions, public.conquest_links, public.conquest_games, public.conquest_players,
    public.conquest_territories, public.conquest_moves to authenticated;
revoke all on sequence public.conquest_moves_id_seq from anon, authenticated;

-- Čas hry; mudrlant.test_now používají jen testy (z API ho klient nastavit nemůže)
create or replace function public.conquest_now() returns timestamptz
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_now', true), '')::timestamptz, now())
$$;
-- Barvy a znaky hráčů (stejné seznamy má conquest.js: COLORS a EMBLEMS, hlídá tests/conquest.test.js)
-- Jen devět co nejodlišnějších barev (dřívější barvy už hráči v rozehraných hrách mají dál, vybrat je ale nejde)
create or replace function public.conquest_colors() returns text[]
language sql immutable as $$ select array['cervena', 'oranzova', 'zluta', 'zelena', 'tyrkysova', 'modra', 'fialova', 'ruzova', 'cerna']::text[] $$;
create or replace function public.conquest_emblems() returns text[]
language sql immutable as $$ select array['lev', 'orel', 'sova', 'drak', 'koruna', 'mec', 'kotva', 'strom', 'hvezda', 'slunce', 'mesic', 'blesk',
    'vez', 'klic', 'kladivo', 'lod', 'jelen', 'medved', 'vlk', 'lilie', 'stit', 'srdce', 'plamen', 'kosatka']::text[] $$;
-- Předvolby Rychlé hry: server drží pro každou jednu otevřenou veřejnou hru
create or replace function public.conquest_presets() returns table (preset text, map text, max_players integer, hours integer, period text, actions integer)
language sql immutable as $$
    select * from (values ('evropa-3d', 'evropa', 6, 72, 'day', 5), ('cesko-12h', 'cesko', 4, 12, 'hour', 3), ('afrika-7d', 'afrika', 8, 168, 'day', 5))
        v (preset, map, max_players, hours, period, actions)
$$;
create or replace function public.conquest_check_look(colour text, emblem_id text) returns void
language plpgsql immutable set search_path = public as $$
begin
    if colour is null or not (colour = any (public.conquest_colors())) then raise exception 'Vyber barvu z nabídky.' using errcode = '22023'; end if;
    if emblem_id is null or not (emblem_id = any (public.conquest_emblems())) then raise exception 'Vyber znak z nabídky.' using errcode = '22023'; end if;
end;
$$;
-- Kód hry: 6 znaků bez zaměnitelných (jako kód skupiny)
create or replace function public.conquest_new_code() returns text
language plpgsql volatile set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; raw bytea; candidate text; attempt integer := 0;
begin
    loop
        raw := uuid_send(gen_random_uuid());
        candidate := '';
        for i in 0..5 loop candidate := candidate || substr(alphabet, 1 + get_byte(raw, i) % 31, 1); end loop;
        exit when not exists (select 1 from public.conquest_games where code = candidate);
        attempt := attempt + 1;
        if attempt > 20 then raise exception 'Kód hry se nepodařilo vytvořit, zkus to znovu.' using errcode = 'P0001'; end if;
    end loop;
    return candidate;
end;
$$;

-- Období hry (od 0): kolik celých dní nebo hodin uplynulo od začátku
create or replace function public.conquest_period_length(per text) returns interval
language sql immutable as $$ select case when per = 'hour' then interval '1 hour' else interval '1 day' end $$;
create or replace function public.conquest_period(g public.conquest_games) returns integer
language sql stable set search_path = public as $$
    select greatest(0, floor(extract(epoch from (public.conquest_now() - g.started_at)) / extract(epoch from public.conquest_period_length(g.period))))::integer
$$;
-- Kolik celých regionů hráč drží
create or replace function public.conquest_regions_owned(gid uuid, map_id text, uid uuid) returns integer
language sql stable set search_path = public as $$
    select count(*)::integer from (
        select r.region from public.conquest_regions r
        left join public.conquest_territories t on t.game_id = gid and t.territory = r.territory
        where r.map = map_id and uid is not null
        group by r.region
        having bool_and(coalesce(t.owner = uid, false))
    ) x
$$;
-- Body hráče (území + 2 za celý region); čas se mění, jen když se body změní
create or replace function public.conquest_rescore(gid uuid, uid uuid) returns void
language plpgsql set search_path = public as $$
declare m text; s integer;
begin
    if uid is null then return; end if;
    select map into m from public.conquest_games where id = gid;
    s := (select count(*) from public.conquest_territories where game_id = gid and owner = uid) + 2 * public.conquest_regions_owned(gid, m, uid);
    update public.conquest_players set score = s, score_at = public.conquest_now() where game_id = gid and user_id = uid and (score <> s or score_at is null);
end;
$$;
-- Obléhaná území hry (otevřené bitvy z bloku 25): nejde na ně útočit jinak než přidáním do bitvy, opevnit je ani je dát při Návratu do hry.
-- Dokud tabulka bitev není (blok 25 ještě neproběhl), žádná.
create or replace function public.conquest_besieged(gid uuid) returns text[]
language plpgsql stable set search_path = public as $$
begin
    if to_regclass('public.conquest_sieges') is null then return '{}'::text[]; end if;
    return coalesce((select array_agg(s.territory) from public.conquest_sieges s where s.game_id = gid and s.status = 'open'), '{}'::text[]);
end;
$$;
-- Volné území co nejdál (počet kroků po sousedech) od všech obsazených; přednost mají území bez pokladu, při shodě náhoda ze semínka hry.
-- Obléhané území se nevybere (bitva o ně by jinak skončila dobytím nového domova).
create or replace function public.conquest_far_territory(gid uuid, salt text) returns text
language plpgsql volatile set search_path = public as $$
declare g public.conquest_games; pick text; besieged text[] := public.conquest_besieged(gid);
begin
    select * into g from public.conquest_games where id = gid;
    with recursive dist (territory, hops) as (
        select t.territory, 0 from public.conquest_territories t where t.game_id = gid and t.owner is not null
        union
        select l.b, d.hops + 1 from dist d join public.conquest_links l on l.map = g.map and l.a = d.territory where d.hops < 12
    ), best as (select dist.territory, min(dist.hops) as hops from dist group by dist.territory)
    select t.territory into pick from public.conquest_territories t left join best b on b.territory = t.territory
    where t.game_id = gid and t.owner is null and not (t.territory = any (besieged))
    order by t.treasure, coalesce(b.hops, 99) desc, md5(g.seed || coalesce(salt, '') || t.territory)
    limit 1;
    return pick;
end;
$$;
-- Začátek hry: území, domovy (po jednom, každý co nejdál od dosavadních), poklady (pokud možno ne vedle domova), body
create or replace function public.conquest_start(gid uuid) returns void
language plpgsql set search_path = public as $$
declare g public.conquest_games; p record; home_id text; treasure_count integer;
begin
    select * into g from public.conquest_games where id = gid for update;
    if g.id is null or g.status <> 'lobby' then return; end if;
    update public.conquest_games set status = 'running', started_at = public.conquest_now(), ends_at = public.conquest_now() + make_interval(hours => g.duration_hours)
    where id = gid returning * into g;
    insert into public.conquest_territories (game_id, territory) select gid, r.territory from public.conquest_regions r where r.map = g.map on conflict do nothing;
    for p in select * from public.conquest_players where game_id = gid order by seat loop
        home_id := public.conquest_far_territory(gid, p.user_id::text);
        update public.conquest_territories set owner = p.user_id, home = true, level = 0, captured_at = public.conquest_now() where game_id = gid and territory = home_id;
        insert into public.conquest_moves (game_id, user_id, period, kind, territory, success, result, at) values (gid, p.user_id, 0, 'home', home_id, true, 'home', public.conquest_now());
    end loop;
    select m.treasures into treasure_count from public.conquest_maps m where m.id = g.map;
    update public.conquest_territories t set treasure = true where t.game_id = gid and t.territory in (
        select c.territory from public.conquest_territories c where c.game_id = gid and c.owner is null
        order by exists (select 1 from public.conquest_links l join public.conquest_territories h on h.game_id = gid and h.territory = l.b and h.home where l.map = g.map and l.a = c.territory),
            md5(g.seed || 'poklad' || c.territory)
        limit treasure_count);
    for p in select * from public.conquest_players where game_id = gid loop perform public.conquest_rescore(gid, p.user_id); end loop;
    -- Pozvánky do hry (blok 24) začátkem hry končí
    if to_regclass('public.conquest_invites') is not null then delete from public.conquest_invites where game_id = gid; end if;
    if g.preset is not null then perform public.conquest_ensure_lobbies(); end if;
end;
$$;
-- Konec hry v ends_at: pořadí podle bodů, při shodě dřív dosažené body; jednou (další volání nic nezmění). Otevřené bitvy (blok 25)
-- se napřed vyhodnotí s odpověďmi, které do té doby přišly (kdo neodpověděl, prohrál).
create or replace function public.conquest_finish(gid uuid) returns void
language plpgsql set search_path = public as $$
declare g public.conquest_games;
begin
    select * into g from public.conquest_games where id = gid for update;
    if g.id is null or g.status <> 'running' or public.conquest_now() < g.ends_at then return; end if;
    if to_regprocedure('public.conquest_sieges_due(uuid, boolean)') is not null then perform public.conquest_sieges_due(gid, true); end if;
    update public.conquest_players pl set place = x.place from (
        select c.user_id, rank() over (order by c.score desc, c.score_at nulls last)::smallint as place from public.conquest_players c where c.game_id = gid
    ) x where pl.game_id = gid and pl.user_id = x.user_id;
    update public.conquest_games set status = 'finished' where id = gid;
end;
$$;
-- Návrat do hry: kdo v minulém období přišel o všechna území, dostane nové domovské území co nejdál od ostatních
create or replace function public.conquest_respawn(gid uuid) returns void
language plpgsql set search_path = public as $$
declare g public.conquest_games; p integer; r record; pick text;
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' then return; end if;
    p := public.conquest_period(g);
    for r in select pl.user_id from public.conquest_players pl where pl.game_id = gid and pl.lost_period is not null and pl.lost_period < p
            and not exists (select 1 from public.conquest_territories t where t.game_id = gid and t.owner = pl.user_id) order by pl.seat loop
        pick := public.conquest_far_territory(gid, r.user_id::text || p::text);
        exit when pick is null;
        update public.conquest_territories set owner = r.user_id, home = true, level = 0, treasure = false, captured_at = public.conquest_now() where game_id = gid and territory = pick;
        insert into public.conquest_moves (game_id, user_id, period, kind, territory, success, result, at) values (gid, r.user_id, p, 'respawn', pick, true, 'respawn', public.conquest_now());
        update public.conquest_players set lost_period = null where game_id = gid and user_id = r.user_id;
        perform public.conquest_rescore(gid, r.user_id);
    end loop;
end;
$$;
-- Úklid hry: bitvy po termínu (blok 25), konec hry, Návrat do hry
create or replace function public.conquest_housekeep(gid uuid) returns void
language plpgsql set search_path = public as $$
begin
    if to_regprocedure('public.conquest_sieges_due(uuid, boolean)') is not null then perform public.conquest_sieges_due(gid, false); end if;
    perform public.conquest_finish(gid);
    perform public.conquest_respawn(gid);
end;
$$;
-- Tahy hráče v tomto období: základ + celé regiony + poklady dobyté v tomto období + kořist (domovská území soupeřů dobytá v minulém období)
-- + pevnost (fortress 1, když hráč drží domovské území opevněné na Pevnost; blok 25) − ztráta hradu (penalty 1, když hráči soupeř v minulém
-- období dobyl domovské území; blok 23); nikdy méně než 0. Použité tahy (used) = zapsané útoky a opevnění období + reserved = účasti
-- v otevřených bitvách přidaných v tomto období (blok 25; po vyhodnocení bitvy je místo nich zapsaný tah téhož období).
create or replace function public.conquest_budget(gid uuid, uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare g public.conquest_games; p integer; regions integer; treasures integer; loot integer; used integer; penalty integer; total integer;
    fortress integer; reserved integer := 0;
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' then return null; end if;
    p := public.conquest_period(g);
    regions := public.conquest_regions_owned(gid, g.map, uid);
    select count(*) filter (where m.period = p and m.treasure and m.result = 'capture'),
           count(*) filter (where m.period = p - 1 and m.home and m.result = 'capture'),
           count(*) filter (where m.period = p and m.kind in ('attack', 'fortify'))
      into treasures, loot, used
      from public.conquest_moves m where m.game_id = gid and m.user_id = uid and m.period >= p - 1;
    -- Ztracený hrad: o 1 tah méně, nejvýš o jeden (rychle díky indexu conquest_moves_home_lost_idx z bloku 23)
    penalty := case when uid is not null and exists (select 1 from public.conquest_moves m where m.game_id = gid and m.victim = uid and m.period = p - 1
        and m.home and m.result = 'capture' and m.user_id is distinct from uid) then 1 else 0 end;
    -- Pevnost na domovském území: +1 tah, dokud ji hráč drží (opevnění na Pevnost platí hned, pobourání nebo dobytí ji hned bere)
    fortress := case when uid is not null and exists (select 1 from public.conquest_territories t where t.game_id = gid and t.owner = uid and t.home and t.level = 3)
        then 1 else 0 end;
    if to_regclass('public.conquest_siege_players') is not null then
        select count(*) into reserved from public.conquest_sieges s join public.conquest_siege_players sp on sp.siege_id = s.id
         where s.game_id = gid and s.status = 'open' and sp.user_id = uid and sp.period = p;
    end if;
    used := used + reserved;
    total := greatest(0, g.actions + regions + treasures + loot + fortress - penalty);
    return jsonb_build_object('period', p, 'base', g.actions, 'regions', regions, 'treasures', treasures, 'loot', loot, 'fortress', fortress, 'penalty', penalty,
        'used', used, 'reserved', reserved, 'total', total, 'left', greatest(0, total - used),
        'period_ends_at', least(g.ends_at, g.started_at + (p + 1) * public.conquest_period_length(g.period)));
end;
$$;
-- Pozvaní přátelé, kteří se do hry ještě nepřidali (pozvánky z bloku 24; v lobby „Pozváno“): jen hráčům hry a jen před začátkem, jinak null.
-- Tabulka conquest_invites vzniká až v bloku 24 (plpgsql ji hledá až při běhu; dokud není, prázdný seznam).
create or replace function public.conquest_invited_json(g public.conquest_games, uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
    if g.status <> 'lobby' or uid is null or not exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid) then return null; end if;
    if to_regclass('public.conquest_invites') is null then return '[]'::jsonb; end if;
    return coalesce((select jsonb_agg(public.group_player_json(p) || jsonb_build_object('invited_at', i.created_at, 'by_me', i.invited_by = uid) order by i.created_at, p.display_name)
        from public.conquest_invites i join public.profiles p on p.id = i.user_id
        where i.game_id = g.id and i.declined_at is null
            and not exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = i.user_id)), '[]'::jsonb);
end;
$$;
-- Souhrn hry: nastavení, hráči (veřejné údaje profilu, barva hry flag_color, znak, připravenost, body, místo); kód soukromé hry jen hráčům;
-- invited = čekající pozvaní přátelé (jen hráčům, conquest_invited_json)
create or replace function public.conquest_summary(g public.conquest_games, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', g.id, 'map', g.map, 'max_players', g.max_players, 'hours', g.duration_hours, 'period', g.period, 'actions', g.actions,
        'visibility', g.visibility, 'preset', g.preset, 'status', g.status, 'created_at', g.created_at, 'started_at', g.started_at, 'ends_at', g.ends_at,
        'mine', exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid), 'creator', g.creator is not null and g.creator = uid,
        'code', case when g.visibility = 'public' or exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid) then g.code end,
        'players', coalesce((select jsonb_agg(public.group_player_json(p) || jsonb_build_object('seat', c.seat, 'flag_color', c.color, 'emblem', c.emblem, 'ready', c.ready,
                'score', c.score, 'score_at', c.score_at, 'place', c.place, 'me', c.user_id = uid) order by c.seat)
            from public.conquest_players c join public.profiles p on p.id = c.user_id where c.game_id = g.id), '[]'::jsonb),
        'invited', public.conquest_invited_json(g, uid))
$$;
-- Otevřená Rychlá hra pro každou předvolbu (bez zakladatele); souběžné volání hlídá zámek
create or replace function public.conquest_ensure_lobbies() returns void
language plpgsql set search_path = public as $$
declare p record;
begin
    perform pg_advisory_xact_lock(hashtext('conquest:lobbies'));
    for p in select * from public.conquest_presets() loop
        if exists (select 1 from public.conquest_maps m where m.id = p.map)
            and not exists (select 1 from public.conquest_games g where g.preset = p.preset and g.status = 'lobby') then
            insert into public.conquest_games (creator, map, max_players, duration_hours, period, actions, visibility, code, preset, created_at)
            values (null, p.map, p.max_players, p.hours, p.period, p.actions, 'public', public.conquest_new_code(), p.preset, public.conquest_now());
        end if;
    end loop;
end;
$$;
-- Hry, ve kterých hráč je (rozehrané a otevřené), proti limitu 6
create or replace function public.conquest_active_count(uid uuid) returns integer
language sql stable set search_path = public as $$
    select count(*)::integer from public.conquest_players c join public.conquest_games g on g.id = c.game_id where c.user_id = uid and g.status in ('lobby', 'running')
$$;
-- Hráč do hry (zámek hry drží volající): nejnižší volné místo, kontrola barvy, plná hra začne
create or replace function public.conquest_add_player(g public.conquest_games, uid uuid, colour text, emblem_id text) returns void
language plpgsql set search_path = public as $$
declare seat_no integer;
begin
    perform public.conquest_check_look(colour, emblem_id);
    if (select count(*) from public.conquest_players where game_id = g.id) >= g.max_players then raise exception 'Hra je už plná.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.conquest_players where game_id = g.id and color = colour) then raise exception 'Tuhle barvu už má jiný hráč. Vyber jinou.' using errcode = '22023'; end if;
    if public.conquest_active_count(uid) >= 6 then raise exception 'Hrát můžeš nejvýš 6 her najednou. Nejdřív nějakou dohraj, nebo z lobby odejdi.' using errcode = 'P0001'; end if;
    select min(s) into seat_no from generate_series(0, 7) s where s not in (select c.seat from public.conquest_players c where c.game_id = g.id);
    insert into public.conquest_players (game_id, user_id, seat, color, emblem, joined_at) values (g.id, uid, seat_no, colour, emblem_id, public.conquest_now());
    if (select count(*) from public.conquest_players where game_id = g.id) >= g.max_players then perform public.conquest_start(g.id); end if;
end;
$$;

-- Lobby: otevřené veřejné hry (Rychlé hry napřed) a moje hry (otevřené, rozehrané s mými tahy a majiteli území, dohrané do 7 dnů)
create or replace function public.conquest_lobby() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    delete from public.conquest_games where status = 'lobby' and created_at < public.conquest_now() - interval '7 days';
    perform public.conquest_ensure_lobbies();
    perform public.conquest_housekeep(g.id) from public.conquest_games g join public.conquest_players c on c.game_id = g.id and c.user_id = uid where g.status = 'running';
    return jsonb_build_object(
        'open', coalesce((select jsonb_agg(public.conquest_summary(x, uid) order by x.preset is null, (select count(*) from public.conquest_players c where c.game_id = x.id) desc, x.created_at desc)
            from public.conquest_games x where x.id in (select y.id from public.conquest_games y where y.status = 'lobby' and y.visibility = 'public'
                order by y.preset is null, y.created_at desc limit 40)), '[]'::jsonb),
        'mine', coalesce((select jsonb_agg(public.conquest_summary(g, uid) || jsonb_build_object('budget', public.conquest_budget(g.id, uid), 'claimed', c.claimed,
                'owners', case when g.status <> 'lobby' then (select jsonb_object_agg(t.territory, o.seat) from public.conquest_territories t join public.conquest_players o on o.game_id = t.game_id and o.user_id = t.owner where t.game_id = g.id) end)
            order by case g.status when 'running' then 0 when 'lobby' then 1 else 2 end, g.ends_at, g.created_at desc)
            from public.conquest_games g join public.conquest_players c on c.game_id = g.id and c.user_id = uid
            where g.status in ('lobby', 'running') or (g.status = 'finished' and g.ends_at > public.conquest_now() - interval '7 days')), '[]'::jsonb));
end;
$$;

-- Založení hry: zakladatel je hned jejím hráčem
create or replace function public.conquest_create(map_id text, players integer, hours integer, per text, actions_per integer, vis text, colour text, emblem_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m public.conquest_maps; g public.conquest_games;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into m from public.conquest_maps where id = map_id;
    if m.id is null then raise exception 'Tahle mapa neexistuje.' using errcode = '22023'; end if;
    if players is null or players < 2 or players > m.max_players then raise exception 'Na mapě % může hrát 2 až % hráčů.', m.title, m.max_players using errcode = '22023'; end if;
    if hours is null or not (hours = any (array[6, 12, 24, 48, 72, 120, 168])) then raise exception 'Vyber délku hry z nabídky.' using errcode = '22023'; end if;
    if per is null or per not in ('day', 'hour') then raise exception 'Tahy jsou za den, nebo za hodinu.' using errcode = '22023'; end if;
    if actions_per is null or actions_per < 1 or actions_per > 10 then raise exception 'Tahů za období může být 1 až 10.' using errcode = '22023'; end if;
    if vis is null or vis not in ('public', 'private') then raise exception 'Hra je veřejná, nebo soukromá.' using errcode = '22023'; end if;
    perform public.conquest_check_look(colour, emblem_id);
    perform pg_advisory_xact_lock(hashtext('conquest:' || uid::text));
    if (select count(*) from public.conquest_games x where x.creator = uid and x.status = 'lobby' and exists (select 1 from public.conquest_players c where c.game_id = x.id and c.user_id = uid)) >= 2 then
        raise exception 'Otevřené můžeš mít nejvýš 2 vlastní hry. Počkej, až některá začne, nebo z ní odejdi.' using errcode = 'P0001';
    end if;
    if public.conquest_active_count(uid) >= 6 then raise exception 'Hrát můžeš nejvýš 6 her najednou. Nejdřív nějakou dohraj, nebo z lobby odejdi.' using errcode = 'P0001'; end if;
    insert into public.conquest_games (creator, map, max_players, duration_hours, period, actions, visibility, code, created_at)
    values (uid, m.id, players, hours, per, actions_per, vis, public.conquest_new_code(), public.conquest_now()) returning * into g;
    perform public.conquest_add_player(g, uid, colour, emblem_id);
    select * into g from public.conquest_games where id = g.id;
    return public.conquest_summary(g, uid);
end;
$$;

-- Přidání do hry: veřejné podle id, soukromé (i veřejné) kódem, soukromé i podle id, když má hráč čekající pozvánku (blok 24);
-- kdo už ve hře je, dostane souhrn beze změny. Přidáním pozvánka do hry zmizí (i odmítnutá).
create or replace function public.conquest_join(game uuid, join_code text, colour text, emblem_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; c text := upper(regexp_replace(coalesce(join_code, ''), '[\s-]', '', 'g')); invites boolean := to_regclass('public.conquest_invites') is not null;
    invited boolean := false;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if c <> '' then select * into g from public.conquest_games where code = c for update;
    elsif game is not null then select * into g from public.conquest_games where id = game for update; end if;
    if g.id is not null and invites then
        invited := exists (select 1 from public.conquest_invites i where i.game_id = g.id and i.user_id = uid and i.declined_at is null);
    end if;
    if g.id is null or (c = '' and g.visibility = 'private' and not invited and not exists (select 1 from public.conquest_players p where p.game_id = g.id and p.user_id = uid)) then
        raise exception 'Hra s tímhle kódem není. Zkontroluj ho.' using errcode = '22023';
    end if;
    if exists (select 1 from public.conquest_players p where p.game_id = g.id and p.user_id = uid) then return public.conquest_summary(g, uid); end if;
    if g.status <> 'lobby' then raise exception 'Tahle hra už začala. Vyber jinou, nebo založ vlastní.' using errcode = 'P0001'; end if;
    if g.creator is not null and public.is_blocked(g.creator, uid) then raise exception 'Do téhle hry se přidat nemůžeš.' using errcode = 'P0001'; end if;
    perform public.conquest_add_player(g, uid, colour, emblem_id);
    if invites then delete from public.conquest_invites where game_id = g.id and user_id = uid; end if;
    select * into g from public.conquest_games where id = g.id;
    return public.conquest_summary(g, uid);
end;
$$;

-- Jiná barva nebo znak (jen před začátkem hry)
create or replace function public.conquest_set_look(game uuid, colour text, emblem_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.conquest_check_look(colour, emblem_id);
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid) then raise exception 'Tuhle hru nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'lobby' then raise exception 'Barvu a znak jde změnit jen před začátkem hry.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.conquest_players p where p.game_id = game and p.color = colour and p.user_id <> uid) then raise exception 'Tuhle barvu už má jiný hráč. Vyber jinou.' using errcode = '22023'; end if;
    update public.conquest_players set color = colour, emblem = emblem_id where game_id = game and user_id = uid;
    return public.conquest_summary(g, uid);
end;
$$;

-- Chci hrát: když jsou ve hře aspoň 2 hráči a všichni chtějí hrát, hra začne
create or replace function public.conquest_ready(game uuid, is_ready boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid) then raise exception 'Tuhle hru nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'lobby' then return public.conquest_summary(g, uid); end if;
    update public.conquest_players set ready = coalesce(is_ready, false) where game_id = game and user_id = uid;
    if (select count(*) from public.conquest_players where game_id = game) >= 2 and not exists (select 1 from public.conquest_players where game_id = game and not ready) then
        perform public.conquest_start(game);
    end if;
    select * into g from public.conquest_games where id = game;
    return public.conquest_summary(g, uid);
end;
$$;

-- Odchod z lobby (rozehranou hru opustit nejde); prázdná vlastní hra zmizí, Rychlá hra zůstane otevřená
create or replace function public.conquest_leave(game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid) then raise exception 'Tuhle hru nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'lobby' then raise exception 'Rozehranou hru opustit nejde.' using errcode = 'P0001'; end if;
    delete from public.conquest_players where game_id = game and user_id = uid;
    if g.preset is null and not exists (select 1 from public.conquest_players where game_id = game) then delete from public.conquest_games where id = game; end if;
end;
$$;

-- Stav hry: souhrn; hráčům rozehrané nebo dohrané hry navíc území (t, o = majitel, l = úroveň, h = domov, p = poklad), moje tahy
-- v období, posledních 150 událostí pro kroniku, po konci všechny změny majitelů pro přehrání (nejvýš 3000), otevřené bitvy (sieges)
-- a značka verze (version) jako conquest_pulse (blok 25)
create or replace function public.conquest_move_json(m public.conquest_moves) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', m.id, 'u', m.user_id, 'k', m.kind, 't', m.territory, 's', m.source, 'ok', m.success, 'r', m.result, 'v', m.victim,
        'l', m.level, 'p', m.treasure, 'h', m.home, 'n', m.period, 'at', m.at)
$$;
create or replace function public.conquest_state(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; member boolean; sieges jsonb := '[]'::jsonb; ver text;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game;
    member := g.id is not null and exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid);
    if g.id is null or (not member and not (g.status = 'lobby' and g.visibility = 'public')) then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if g.status = 'running' then
        perform public.conquest_housekeep(game);
        -- vývojářští boti (blok 22) odehrají, co jim podle času v období patří
        if member then perform public.conquest_bots_due(game); end if;
        select * into g from public.conquest_games where id = game;
    end if;
    if g.status = 'lobby' or not member then return public.conquest_summary(g, uid) || jsonb_build_object('now', public.conquest_now()); end if;
    if to_regprocedure('public.conquest_sieges_json(uuid, uuid)') is not null then
        sieges := public.conquest_sieges_json(game, uid);
        ver := public.conquest_version(g);
    end if;
    return public.conquest_summary(g, uid) || jsonb_build_object(
        'now', public.conquest_now(),
        'sieges', sieges,
        'version', ver,
        'territories', coalesce((select jsonb_agg(jsonb_build_object('t', t.territory, 'o', t.owner, 'l', t.level, 'h', t.home, 'p', t.treasure) order by t.territory)
            from public.conquest_territories t where t.game_id = game), '[]'::jsonb),
        'budget', public.conquest_budget(game, uid),
        'claimed', (select p.claimed from public.conquest_players p where p.game_id = game and p.user_id = uid),
        'moves', coalesce((select jsonb_agg(public.conquest_move_json(m) order by m.id) from (select * from public.conquest_moves where game_id = game order by id desc limit 150) m), '[]'::jsonb),
        'history', case when g.status = 'finished' then coalesce((select jsonb_agg(public.conquest_move_json(m) order by m.id)
            from (select * from public.conquest_moves where game_id = game and result in ('home', 'respawn', 'capture') order by id limit 3000) m), '[]'::jsonb) end);
end;
$$;

-- Smí hráč uid zaútočit na území target (z území src, nepovinné)? Ne na vlastní, jen na sousední s vlastním a src musí být jeho sousední.
-- Jinak vyhodí českou chybu. Zámek hry drží volající (conquest_move_by, conquest_siege_begin, conquest_siege_join).
create or replace function public.conquest_attack_check(g public.conquest_games, uid uuid, target text, src text) returns void
language plpgsql stable set search_path = public as $$
begin
    if exists (select 1 from public.conquest_territories t where t.game_id = g.id and t.territory = target and t.owner = uid) then
        raise exception 'Na vlastní území útočit nejde.' using errcode = '22023';
    end if;
    if src is not null and not exists (select 1 from public.conquest_territories s join public.conquest_links l on l.map = g.map and l.a = s.territory and l.b = target
            where s.game_id = g.id and s.territory = src and s.owner = uid) then
        raise exception 'Útok musí vést z tvého sousedního území.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.conquest_territories s join public.conquest_links l on l.map = g.map and l.a = s.territory and l.b = target where s.game_id = g.id and s.owner = uid) then
        raise exception 'Útočit jde jen na území, které sousedí s tvým.' using errcode = '22023';
    end if;
end;
$$;
-- Účinek útoku (zámek hry a kontrolu drží volající): správně = dobytí neopevněného území (poklad, domov soupeře, Návrat do hry, body),
-- nebo pobourání opevnění o úroveň; špatně nic. Zapíše tah útoku (p = období tahu; u bitvy období, kdy se hráč přidal) a vrací ho.
-- Volá ho tah hráče (conquest_move_by) i vyhodnocení bitvy pro vítěze (conquest_siege_resolve, blok 25).
create or replace function public.conquest_attack_apply(gid uuid, uid uuid, target text, src text, p integer, is_correct boolean) returns public.conquest_moves
language plpgsql set search_path = public as $$
declare g public.conquest_games; t public.conquest_territories; victim uuid; res text; lvl integer; took_home boolean := false; took_treasure boolean := false;
    mv public.conquest_moves;
begin
    select * into t from public.conquest_territories where game_id = gid and territory = target for update;
    victim := t.owner;
    lvl := t.level;
    if not is_correct then res := 'fail';
    elsif t.level > 0 then
        res := 'breach'; lvl := t.level - 1;
        update public.conquest_territories set level = lvl where game_id = gid and territory = target;
    else
        res := 'capture'; took_home := t.home and t.owner is not null; took_treasure := t.treasure;
        update public.conquest_territories set owner = uid, level = 0, home = false, treasure = false, captured_at = public.conquest_now() where game_id = gid and territory = target;
        -- Kdo přišel o všechna území, dostane nové v dalším období (počítá se od období, kdy území padlo)
        if victim is not null and not exists (select 1 from public.conquest_territories x where x.game_id = gid and x.owner = victim) then
            select * into g from public.conquest_games where id = gid;
            update public.conquest_players set lost_period = public.conquest_period(g) where game_id = gid and user_id = victim;
        end if;
        perform public.conquest_rescore(gid, uid);
        perform public.conquest_rescore(gid, victim);
    end if;
    insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at)
    values (gid, uid, p, 'attack', target, src, is_correct, res, victim, lvl, took_treasure, took_home, public.conquest_now())
    returning * into mv;
    return mv;
end;
$$;
-- Tah: útok (na území sousedící s vlastním; source = vlastní území, odkud útok vede, nepovinné) nebo opevnění vlastního území.
-- is_correct = odpověď na otázku tahu. Tah za hráče uid (hráč přes conquest_move, bot přes conquest_bot_move); vrací zapsaný tah.
-- Útok je okamžitá bitva bez dalších účastníků (starší aplikace; nová začíná obléhání přes conquest_siege_begin, blok 25). Na obléhané
-- území útočit takto nejde (jen přidáním do bitvy) a obléhané území nejde opevnit.
create or replace function public.conquest_move_by(uid uuid, game uuid, target text, move_kind text, is_correct boolean, source text default null) returns public.conquest_moves
language plpgsql set search_path = public as $$
declare g public.conquest_games; t public.conquest_territories; p integer; budget jsonb; lvl integer; mv public.conquest_moves; besieged boolean;
begin
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = game and c.user_id = uid) then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if g.status = 'lobby' then raise exception 'Hra ještě nezačala.' using errcode = 'P0001'; end if;
    perform public.conquest_housekeep(game);
    select * into g from public.conquest_games where id = game;
    if g.status <> 'running' then raise exception 'Hra už skončila.' using errcode = 'P0001'; end if;
    if move_kind is null or move_kind not in ('attack', 'fortify') or is_correct is null then raise exception 'Neplatný tah.' using errcode = '22023'; end if;
    select * into t from public.conquest_territories where game_id = game and territory = target for update;
    if t.territory is null then raise exception 'Tohle území na mapě není.' using errcode = '22023'; end if;
    budget := public.conquest_budget(game, uid);
    if (budget ->> 'left')::integer <= 0 then raise exception 'Tahy na tohle období už nemáš. Další přibudou v příštím období.' using errcode = 'P0001'; end if;
    p := (budget ->> 'period')::integer;
    besieged := target = any (public.conquest_besieged(game));
    if move_kind = 'attack' then
        perform public.conquest_attack_check(g, uid, target, source);
        if besieged then raise exception 'Na území právě probíhá bitva. Můžeš se přidat.' using errcode = 'P0001'; end if;
        return public.conquest_attack_apply(game, uid, target, source, p, is_correct);
    end if;
    if t.owner is distinct from uid then raise exception 'Opevnit jde jen vlastní území.' using errcode = '22023'; end if;
    if besieged then raise exception 'Obléhané území teď nejde opevnit.' using errcode = 'P0001'; end if;
    if t.level >= (case when t.home then 3 else 2 end) then raise exception 'Tohle území už je opevněné naplno.' using errcode = '22023'; end if;
    lvl := t.level;
    if is_correct then
        lvl := t.level + 1;
        update public.conquest_territories set level = lvl where game_id = game and territory = target;
    end if;
    insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at)
    values (game, uid, p, 'fortify', target, null, is_correct, case when is_correct then 'fortify' else 'fail' end, null, lvl, false, false, public.conquest_now())
    returning * into mv;
    return mv;
end;
$$;
-- Tah hráče (tah za něj udělá conquest_move_by); vrací stav hry a výsledek tahu (move)
create or replace function public.conquest_move(game uuid, target text, move_kind text, is_correct boolean, source text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mv public.conquest_moves;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    mv := public.conquest_move_by(uid, game, target, move_kind, is_correct, source);
    return public.conquest_state(game) || jsonb_build_object('move', public.conquest_move_json(mv));
end;
$$;

-- Výsledek po konci: moje místo, počet hráčů a jestli hra odměnu dává (aspoň 3 hráči, nebo hra aspoň na den; aspoň 3 vlastní tahy
-- a aspoň 1 bod). claimed_now je true jen jednou: jen tehdy si aplikace odměnu připíše (conquest.js rewardFor).
create or replace function public.conquest_claim(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; me public.conquest_players; total integer; moves integer; eligible boolean; fresh boolean;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.conquest_finish(game);
    select * into g from public.conquest_games where id = game;
    select * into me from public.conquest_players where game_id = game and user_id = uid for update;
    if g.id is null or me.user_id is null then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'finished' then raise exception 'Hra ještě neskončila.' using errcode = 'P0001'; end if;
    select count(*) into total from public.conquest_players where game_id = game;
    select count(*) into moves from public.conquest_moves where game_id = game and user_id = uid and kind in ('attack', 'fortify');
    eligible := (total >= 3 or g.duration_hours >= 24) and moves >= 3 and me.score > 0;
    fresh := not me.claimed;
    if fresh then update public.conquest_players set claimed = true where game_id = game and user_id = uid; end if;
    return jsonb_build_object('place', me.place, 'players', total, 'score', me.score, 'moves', moves, 'eligible', eligible, 'claimed_now', fresh);
end;
$$;

-- Oprávnění: hráč volá jen funkce hry (anon nic); pomocné funkce zvenčí nikdo, conquest_is_player a conquest_is_open jen kvůli pravidlům řádků
revoke all on function public.conquest_now(), public.conquest_colors(), public.conquest_emblems(), public.conquest_presets(), public.conquest_check_look(text, text),
    public.conquest_new_code(), public.conquest_period_length(text), public.conquest_period(public.conquest_games), public.conquest_regions_owned(uuid, text, uuid),
    public.conquest_rescore(uuid, uuid), public.conquest_far_territory(uuid, text), public.conquest_start(uuid), public.conquest_finish(uuid), public.conquest_respawn(uuid),
    public.conquest_housekeep(uuid), public.conquest_budget(uuid, uuid), public.conquest_invited_json(public.conquest_games, uuid), public.conquest_summary(public.conquest_games, uuid), public.conquest_ensure_lobbies(),
    public.conquest_active_count(uuid), public.conquest_add_player(public.conquest_games, uuid, text, text), public.conquest_move_json(public.conquest_moves),
    public.conquest_besieged(uuid), public.conquest_attack_check(public.conquest_games, uuid, text, text), public.conquest_attack_apply(uuid, uuid, text, text, integer, boolean)
    from public, anon, authenticated;
revoke all on function public.conquest_is_player(uuid), public.conquest_is_open(uuid), public.conquest_lobby(), public.conquest_create(text, integer, integer, text, integer, text, text, text),
    public.conquest_join(uuid, text, text, text), public.conquest_set_look(uuid, text, text), public.conquest_ready(uuid, boolean), public.conquest_leave(uuid),
    public.conquest_state(uuid), public.conquest_move(uuid, text, text, boolean, text), public.conquest_claim(uuid) from public, anon;
grant execute on function public.conquest_is_player(uuid), public.conquest_is_open(uuid), public.conquest_lobby(), public.conquest_create(text, integer, integer, text, integer, text, text, text),
    public.conquest_join(uuid, text, text, text), public.conquest_set_look(uuid, text, text), public.conquest_ready(uuid, boolean), public.conquest_leave(uuid),
    public.conquest_state(uuid), public.conquest_move(uuid, text, text, boolean, text), public.conquest_claim(uuid) to authenticated;
-- ===== 21: Dobývání — KONEC BLOKU =====

-- ===== 22: Vývojářští boti v Dobývání =====
-- Boti jsou stejní jako v turnajích: řádky v auth.users s e-mailem bot-…@bots.invalid (dev_is_bot), přidává je jen účet z dev_admins
-- do hry, kterou sám hraje (dev_conquest_add_bots). Každý bot má vlastní úspěšnost 45–80 % (jako v turnaji), u opevněného cíle o 8 bodů
-- za úroveň nižší. Hrají sami: tahy si rozloží do období (začnou v prvních 20 % období, do 70 % mají odehráno), kdykoli se na hru někdo
-- podívá (conquest_state) nebo aplikace zavolá tournament_tick (otevření aplikace, plánovač). Vývojář je může popohnat
-- (dev_conquest_bots_play: hned všechny tahy období) a posunout hru o období (dev_conquest_next_period).
create or replace function public.conquest_bot_skill(uid uuid) returns numeric
language sql immutable as $$ select 0.45 + 0.35 * (('x' || substr(md5(uid::text), 1, 6))::bit(24)::integer % 1000) / 1000.0 $$;
-- Kdy v období bot začne hrát (podíl období 0–0,2)
create or replace function public.conquest_bot_offset(uid uuid) returns numeric
language sql immutable as $$ select 0.2 * (('x' || substr(md5(uid::text || 'tempo'), 1, 6))::bit(24)::integer % 1000) / 1000.0 $$;
-- Jeden tah bota: útok (poklad > neutrální území > domov soupeře, opevnění cíl odrazuje, trocha náhody), zhruba každý pátý tah
-- (nebo když není kam útočit) opevnění ohroženého území, nejradši domova. Obléhaná území (bitvy z bloku 25) bot vynechá: do bitev
-- se nepřidává a obléhané vlastní území neopevňuje. Vrací false, když bot nemá co hrát.
create or replace function public.conquest_bot_move(gid uuid, bot uuid) returns boolean
language plpgsql set search_path = public as $$
declare g public.conquest_games; target text; src text; lvl integer := 0; kind text := 'attack'; fort_t text; fort_l integer; ok boolean;
    besieged text[] := public.conquest_besieged(gid);
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' then return false; end if;
    select c.territory, c.level into target, lvl
      from public.conquest_territories c
     where c.game_id = gid and c.owner is distinct from bot and not (c.territory = any (besieged))
       and exists (select 1 from public.conquest_territories s join public.conquest_links l on l.map = g.map and l.a = s.territory and l.b = c.territory
                    where s.game_id = gid and s.owner = bot)
     order by (case when c.treasure then 6 else 0 end) + (case when c.owner is null then 3 else 0 end) + (case when c.home and c.owner is not null then 1.5 else 0 end)
              - 2.5 * c.level + 3 * random() desc
     limit 1;
    if target is null or random() < 0.2 then
        select t.territory, t.level into fort_t, fort_l
          from public.conquest_territories t
         where t.game_id = gid and t.owner = bot and t.level < (case when t.home then 3 else 2 end) and not (t.territory = any (besieged))
         order by (case when t.home then 2 else 0 end)
                  + (case when exists (select 1 from public.conquest_links l join public.conquest_territories e on e.game_id = gid and e.territory = l.b
                          where l.map = g.map and l.a = t.territory and e.owner is not null and e.owner <> bot) then 2 else 0 end)
                  + random() desc
         limit 1;
        if fort_t is not null then kind := 'fortify'; target := fort_t; lvl := fort_l; end if;
    end if;
    if target is null then return false; end if;
    if kind = 'attack' then
        select s.territory into src from public.conquest_territories s join public.conquest_links l on l.map = g.map and l.a = s.territory and l.b = target
         where s.game_id = gid and s.owner = bot order by s.level desc, random() limit 1;
        ok := random() < public.conquest_bot_skill(bot) - 0.08 * lvl;
    else
        ok := random() < public.conquest_bot_skill(bot);
    end if;
    begin
        perform public.conquest_move_by(bot, gid, target, kind, ok, src);
    exception when others then return false;
    end;
    return true;
end;
$$;
-- Boti hry odehrají, co jim podle času v období patří (play_all = hned všechny tahy období). Vrací počet tahů.
create or replace function public.conquest_bots_due(gid uuid, play_all boolean default false) returns integer
language plpgsql set search_path = public as $$
declare g public.conquest_games; p integer; frac numeric; b record; budget jsonb; total integer; want integer; steps integer; made integer := 0;
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' then return 0; end if;
    if not exists (select 1 from public.conquest_players pl where pl.game_id = gid and public.dev_is_bot(pl.user_id)) then return 0; end if;
    perform 1 from public.conquest_games where id = gid for update;
    perform public.conquest_housekeep(gid);
    select * into g from public.conquest_games where id = gid;
    if g.status <> 'running' then return 0; end if;
    p := public.conquest_period(g);
    frac := extract(epoch from (public.conquest_now() - (g.started_at + p * public.conquest_period_length(g.period)))) / extract(epoch from public.conquest_period_length(g.period));
    for b in select pl.user_id from public.conquest_players pl where pl.game_id = gid order by pl.seat loop
        continue when not public.dev_is_bot(b.user_id);
        steps := 0;
        loop
            budget := public.conquest_budget(gid, b.user_id);
            total := (budget ->> 'total')::integer;
            want := case when play_all then total else least(total, ceil(total * greatest(0, frac - public.conquest_bot_offset(b.user_id)) / 0.5)::integer) end;
            exit when (budget ->> 'left')::integer <= 0 or (budget ->> 'used')::integer >= want or steps >= 15;
            exit when not public.conquest_bot_move(gid, b.user_id);
            steps := steps + 1;
            made := made + 1;
        end loop;
    end loop;
    return made;
end;
$$;
-- Boti ve všech rozehraných hrách (volá tournament_tick)
create or replace function public.conquest_bots_tick() returns void
language plpgsql set search_path = public as $$
declare r record;
begin
    for r in select distinct pl.game_id from public.conquest_players pl join public.conquest_games g on g.id = pl.game_id
              where g.status = 'running' and public.dev_is_bot(pl.user_id) loop
        perform public.conquest_bots_due(r.game_id);
    end loop;
end;
$$;
-- Vývojář: účet musí být v dev_admins a hru musí sám hrát; vrací hru (zamčenou pro změnu)
create or replace function public.dev_conquest_check(game uuid) returns public.conquest_games
language plpgsql set search_path = public as $$
declare g public.conquest_games;
begin
    perform public.dev_check();
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = auth.uid()) then
        raise exception 'Boty jde ovládat jen ve hře, kterou sám hraješ.' using errcode = '42501';
    end if;
    return g;
end;
$$;
-- Vývojář: boti do hry, která ještě nezačala (nejvýš do plna). Bot dostane volnou barvu, náhodný znak a hned chce hrát;
-- plná hra začne sama, jinak až klepneš na Chci hrát. Vrací souhrn hry.
create or replace function public.dev_conquest_add_bots(game uuid, how_many integer default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.conquest_games; i integer; bot uuid; colour text; emblem_id text; free integer;
    names text[] := array['Adam', 'Barbora', 'Cyril', 'Dana', 'Emil', 'Fanda', 'Gita', 'Honza', 'Ivana', 'Jirka', 'Klára', 'Libor', 'Marta', 'Nikola', 'Ondra', 'Petra',
        'Radek', 'Soňa', 'Tomáš', 'Uršula', 'Viktor', 'Wanda', 'Xaver', 'Yvona', 'Zdeněk', 'Alena', 'Bořek', 'Cecílie', 'David', 'Eliška', 'Filip', 'Gabriela'];
    colors text[] := array['emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo'];
begin
    g := public.dev_conquest_check(game);
    if g.status <> 'lobby' then raise exception 'Boty jde přidat jen do hry, která ještě nezačala.' using errcode = 'P0001'; end if;
    free := g.max_players - (select count(*) from public.conquest_players where game_id = game)::integer;
    if free <= 0 then raise exception 'Hra je už plná.' using errcode = 'P0001'; end if;
    for i in 1 .. least(greatest(coalesce(how_many, 1), 1), free) loop
        bot := gen_random_uuid();
        insert into auth.users (id, email, raw_user_meta_data)
            values (bot, 'bot-' || bot || '@bots.invalid', jsonb_build_object('full_name', 'Bot ' || names[1 + floor(random() * array_length(names, 1))::integer]));
        update public.profiles set avatar = '🤖', color = colors[1 + floor(random() * array_length(colors, 1))::integer] where id = bot;
        select c into colour from unnest(public.conquest_colors()) c where c not in (select p.color from public.conquest_players p where p.game_id = game) order by random() limit 1;
        select e into emblem_id from unnest(public.conquest_emblems()) e order by random() limit 1;
        perform public.conquest_add_player(g, bot, colour, emblem_id);
        update public.conquest_players set ready = true where game_id = game and user_id = bot;
        select * into g from public.conquest_games where id = game;
        exit when g.status <> 'lobby';
    end loop;
    if g.status = 'lobby' and (select count(*) from public.conquest_players where game_id = game) >= 2
            and not exists (select 1 from public.conquest_players where game_id = game and not ready) then
        perform public.conquest_start(game);
    end if;
    select * into g from public.conquest_games where id = game;
    return public.conquest_summary(g, auth.uid());
end;
$$;
-- Vývojář: boti hned odehrají všechny tahy, které jim v tomto období zbývají. Vrací počet tahů.
create or replace function public.dev_conquest_bots_play(game uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare g public.conquest_games;
begin
    g := public.dev_conquest_check(game);
    if g.status <> 'running' then raise exception 'Hra neběží.' using errcode = 'P0001'; end if;
    return public.conquest_bots_due(game, true);
end;
$$;
-- Vývojář: skok na další období (začátek i konec hry se posunou o jedno období dozadu, takže hra je o období dál a o období kratší);
-- pak se hra uklidí (konec, Návrat do hry) a boti odehrají, co jim v novém období patří. Vrací stav hry.
create or replace function public.dev_conquest_next_period(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.conquest_games;
begin
    g := public.dev_conquest_check(game);
    if g.status <> 'running' then raise exception 'Hra neběží.' using errcode = 'P0001'; end if;
    update public.conquest_games set started_at = started_at - public.conquest_period_length(period), ends_at = ends_at - public.conquest_period_length(period) where id = game;
    perform public.conquest_housekeep(game);
    return public.conquest_state(game);
end;
$$;
revoke all on function public.conquest_move_by(uuid, uuid, text, text, boolean, text), public.conquest_bot_skill(uuid), public.conquest_bot_offset(uuid),
    public.conquest_bot_move(uuid, uuid), public.conquest_bots_due(uuid, boolean), public.conquest_bots_tick(), public.dev_conquest_check(uuid) from public, anon, authenticated;
revoke all on function public.dev_conquest_add_bots(uuid, integer), public.dev_conquest_bots_play(uuid), public.dev_conquest_next_period(uuid) from public, anon;
grant execute on function public.dev_conquest_add_bots(uuid, integer), public.dev_conquest_bots_play(uuid), public.dev_conquest_next_period(uuid) to authenticated;
-- ===== 22: Vývojářští boti v Dobývání — KONEC BLOKU =====

-- ===== Řetězovka dne (blok 21) — ZAČÁTEK BLOKU =====
-- Každý den (pražský čas) stejný řetěz sedmi otázek pro všechny: odpověď na jednu je začátkem další (chain.js ho sestaví z dat témat,
-- server otázky nezná). Článek k dává k bodů (celý řetěz 28), špatná odpověď řetěz přetrhne, jednou za hru Záchrana (jiná otázka na stejný
-- článek za 0 bodů). Jeden řádek na hráče a den: první odeslaný výsledek platí, další se jen vrátí. Body a články musí sedět: bez Záchrany
-- přesně 1 + 2 + … + články, se Záchranou o jeden zachráněný článek méně (nebo stejně, když Záchrana nevyšla). Tabulku hráč jen čte
-- (svůj řádek); zapisuje jen chain_submit. Pořadí dne (chain_day_stats) za posledních 30 dní: hráči, podíl celých řetězů, nejlepší
-- výsledek, moje místo a nejlepší hráči (jen veřejné údaje profilu).
create table if not exists public.chain_results (
    day date not null,
    user_id uuid not null references public.profiles (id) on delete cascade,
    links smallint not null,
    score smallint not null,
    rescued boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (user_id, day)
);
alter table public.chain_results drop constraint if exists chain_results_values;
alter table public.chain_results add constraint chain_results_values check (
    links between 0 and 7 and score between 0 and 28
    and ((not rescued and score = links * (links + 1) / 2)
        or (rescued and score between links * (links + 1) / 2 - links and links * (links + 1) / 2)));
create index if not exists chain_results_day on public.chain_results (day, score desc, created_at);
alter table public.chain_results enable row level security;
drop policy if exists "řetězovka: vlastní řádky" on public.chain_results;
create policy "řetězovka: vlastní řádky" on public.chain_results for select to authenticated using (user_id = auth.uid());
revoke all on public.chain_results from anon, authenticated;
grant select on public.chain_results to authenticated;

-- Den Řetězovky (Praha); čas bere z mystery_now (testy ho nastaví přes mudrlant.test_now)
create or replace function public.chain_today() returns date
language sql stable set search_path = public as $$
    select (public.mystery_now() at time zone 'Europe/Prague')::date
$$;

-- Výsledek a místo hráče v pořadí dne jako JSON (místo = počet lepších + 1, stejné body = stejné místo)
create or replace function public.chain_json(r public.chain_results) returns jsonb
language sql stable set search_path = public as $$
    select case when r.user_id is null then null else jsonb_build_object('day', r.day, 'links', r.links, 'score', r.score, 'rescued', r.rescued,
        'rank', 1 + (select count(*) from public.chain_results o where o.day = r.day and o.score > r.score)) end
$$;

-- Výsledek dne: for_day = den řetězu (dnešek, nebo včerejšek, když se hra dohrála těsně před půlnocí a odesílá se až po ní).
-- Odeslání podruhé (jiné zařízení, ztracená odpověď) nic nezmění a vrátí uložený výsledek.
create or replace function public.chain_submit(for_day date, links integer, score integer, rescued boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.chain_today(); r public.chain_results; tri integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if for_day is null or for_day > d or for_day < d - 1 then raise exception 'Tahle Řetězovka už skončila.' using errcode = '22023'; end if;
    if links is null or score is null or rescued is null or links < 0 or links > 7 then raise exception 'Neplatný výsledek.' using errcode = '22023'; end if;
    tri := links * (links + 1) / 2;
    if (not rescued and score <> tri) or (rescued and (score < tri - links or score > tri)) then raise exception 'Neplatný výsledek.' using errcode = '22023'; end if;
    insert into public.chain_results (day, user_id, links, score, rescued) values (for_day, uid, links, score, rescued)
    on conflict (user_id, day) do nothing;
    select * into r from public.chain_results c where c.user_id = uid and c.day = for_day;
    return public.chain_json(r);
end;
$$;

-- Jak si vedli ostatní za den (dnešek nebo nejvýš 30 dní zpět): počet hráčů, kolik dalo celý řetěz (a procenta), nejlepší body,
-- můj výsledek s místem a nejlepších 10 hráčů (místo podle bodů, při shodě dřívější odeslání výš)
create or replace function public.chain_day_stats(for_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := public.chain_today(); d date := coalesce(for_day, public.chain_today()); mine public.chain_results; result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if d > today or d < today - 30 then raise exception 'Pořadí Řetězovky je jen za posledních 30 dní.' using errcode = '22023'; end if;
    select * into mine from public.chain_results c where c.user_id = uid and c.day = d;
    with ranked as (
        select c.user_id, c.links, c.score, c.rescued, c.created_at,
            (rank() over (order by c.score desc))::integer as place,
            (row_number() over (order by c.score desc, c.links desc, c.created_at, c.user_id))::integer as pos
        from public.chain_results c where c.day = d
    )
    select jsonb_build_object(
        'day', d,
        'players', (select count(*) from ranked),
        'full', (select count(*) from ranked where links = 7),
        'full_pct', coalesce((select round(100.0 * count(*) filter (where links = 7) / nullif(count(*), 0))::integer from ranked), 0),
        'best', coalesce((select max(score) from ranked), 0),
        'me', public.chain_json(mine),
        'top', coalesce((select jsonb_agg(jsonb_build_object('rank', k.place, 'id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color,
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'links', k.links, 'score', k.score, 'rescued', k.rescued, 'me', k.user_id = uid) order by k.pos)
            from ranked k join public.profiles p on p.id = k.user_id where k.pos <= 10), '[]'::jsonb)
    ) into result;
    return result;
end;
$$;

-- Pomocné funkce jen interně; hráč volá jen odeslání výsledku a pořadí dne (anon nic)
revoke all on function public.chain_today(), public.chain_json(public.chain_results) from public, anon, authenticated;
revoke all on function public.chain_submit(date, integer, integer, boolean), public.chain_day_stats(date) from public, anon;
grant execute on function public.chain_submit(date, integer, integer, boolean), public.chain_day_stats(date) to authenticated;
-- ===== Řetězovka dne (blok 21) — KONEC BLOKU =====

-- ===== 23: Dobývání – ztracený hrad a upozornění na útoky =====
-- Ztracený hrad: komu soupeř v období P dobyl domovské území, má v období P + 1 o 1 tah méně (conquest_budget vrací penalty 0/1, tahů nikdy
-- méně než 0; boti počítají se stejným rozpočtem). Upozornění na útoky (push_pending, druh 'conquest'): hráč, na jehož území zaútočil jiný hráč
-- (dobytí, pobourání opevnění i odražený útok), dostane za každou rozehranou hru jedno souhrnné upozornění. Nadpis jmenuje nejzávažnější
-- událost (padlý domovský hrad > dobytá území > pobořené opevnění > odražený útok) a kolik dalších útoků přišlo, text útočníka a co dělat.
-- Počítají se jen útoky, které hráč v upozornění ještě neměl (číslo posledního ohlášeného tahu je 4. částí klíče cq:hra:hráč:tah v push_sent),
-- a jen čerstvé: ve hře s obdobím hodina 2 hodiny, s obdobím den 12 hodin (útoky z nočního klidu tak přijdou ráno). Upozornění z Dobývání
-- přijde nejvýš jednou za 10 minut (ostatní druhy jednou za 55 minut); vypne ho profiles.push_conquest (Nastavení, dlaždice Dobývání).
-- Boti upozornění nedostávají. Názvy území databáze nezná (jsou jen v data/dobyvani-<mapa>.json), texty proto území nejmenují.
-- Bitvy o území (blok 25) zapíšou tahy všech účastníků až při vyhodnocení, takže upozornění je ukáže stejně: vítěz jako dobytí nebo
-- pobourání, kdo odpověděl špatně, jako odražený útok. Prohraná bitva (result 'outrun': správně, ale pomaleji než vítěz) se nepočítá,
-- ohlásí ji už tah vítěze téže bitvy.
create index if not exists conquest_moves_home_lost_idx on public.conquest_moves (game_id, victim, period) where home and result = 'capture';
create index if not exists conquest_moves_attacks_idx on public.conquest_moves (at) where kind = 'attack' and victim is not null;

-- „ (+2 další útoky)“: kolik dalších útoků upozornění shrnuje (1 další útok, 2–4 další útoky, 5 a víc dalších útoků)
create or replace function public.conquest_push_more(n integer) returns text
language sql immutable as $$
    select case when coalesce(n, 0) <= 0 then '' else ' (+' || n || ' ' || case when n = 1 then 'další útok' when n between 2 and 4 then 'další útoky' else 'dalších útoků' end || ')' end
$$;

-- Upozornění na útoky soupeřů (řádky ve tvaru položek push_pending); volá ho jen push_pending
create or replace function public.conquest_push_items() returns table (user_id uuid, kind text, title text, body text, url text, dedupe_key text, sort_at text)
language sql stable set search_path = public as $$
    with sent as (
        select s.user_id, split_part(s.dedupe_key, ':', 2) as game, max(split_part(s.dedupe_key, ':', 4)::bigint) as last_id
        from public.push_sent s
        where s.kind = 'conquest' and s.dedupe_key ~ '^cq:[0-9a-f-]{36}:[0-9a-f-]{36}:[0-9]{1,18}$'
        group by s.user_id, split_part(s.dedupe_key, ':', 2)
    ), hits as (
        select m.id, m.game_id, m.victim, m.user_id as attacker, m.territory, m.level, m.at, g.map, g.code,
            case when m.result = 'capture' and m.home then 4 when m.result = 'capture' then 3 when m.result = 'breach' then 2 else 1 end as severity
        from public.conquest_moves m
        join public.conquest_games g on g.id = m.game_id and g.status = 'running'
        join public.profiles me on me.id = m.victim and me.push_conquest
        left join sent s on s.user_id = m.victim and s.game = m.game_id::text
        where m.kind = 'attack' and m.victim is not null and m.at > now() - interval '12 hours'
            and m.at > now() - case when g.period = 'hour' then interval '2 hours' else interval '12 hours' end
            -- bez 'outrun' (prohraná bitva, blok 25): bitvu ohlásí tah jejího vítěze
            and m.user_id is distinct from m.victim and m.result in ('capture', 'breach', 'fail')
            and m.id > coalesce(s.last_id, 0) and not public.dev_is_bot(m.victim)
    ), ranked as (
        select h.*, row_number() over (partition by h.game_id, h.victim order by h.severity desc, h.id desc) as rk,
            count(*) over (partition by h.game_id, h.victim) as total,
            count(*) filter (where h.severity = 3) over (partition by h.game_id, h.victim) as captures,
            max(h.id) over (partition by h.game_id, h.victim) as top_id,
            min(h.at) over (partition by h.game_id, h.victim) as first_at
        from hits h
    )
    select r.victim, 'conquest'::text,
        'Dobývání: ' || case r.severity
            when 4 then 'padl tvůj domovský hrad'
            when 3 then case when r.captures = 1 then 'jedno tvé území padlo' when r.captures <= 4 then 'padla ' || r.captures || ' tvá území' else 'padlo ' || r.captures || ' tvých území' end
            when 2 then 'tvoje ' || (array['palisáda', 'hradba', 'pevnost'])[least(r.level + 1, 3)] || ' je pobořená'
            else 'útok na tvé území odražen' end
            || public.conquest_push_more((r.total - case when r.severity = 3 then r.captures else 1 end)::integer),
        'Útočník: ' || coalesce(nullif(btrim(a.display_name), ''), 'Soupeř') || '. ' || case
            when r.severity = 4 and not x.landed then 'V dalším období dostaneš nové domovské území, ale o tah méně.'
            when r.severity = 4 then 'V dalším období máš o tah méně. Opevni se, nebo vrať úder.'
            when r.severity = 3 and not x.landed then 'V dalším období dostaneš nové domovské území.'
            when r.severity = 3 and r.captures = 1 and x.near then 'Území sousedí s tvými, můžeš ho dobýt zpět.'
            when r.severity = 3 then 'Opevni ostatní území, nebo vrať úder.'
            when r.severity = 2 and r.level > 0 then 'Zbývá ' || (array['palisáda', 'hradba', 'pevnost'])[least(r.level, 3)] || ', opevni se znovu.'
            when r.severity = 2 then 'Další úspěšný útok území dobude, opevni se.'
            else 'Možná to zkusí znovu, opevni se.' end,
        './?dobyvani=' || r.code,
        'cq:' || r.game_id || ':' || r.victim || ':' || r.top_id,
        r.first_at::text
    from ranked r
    left join public.profiles a on a.id = r.attacker
    -- landed = hráč ve hře ještě něco drží; near = dobyté území sousedí s některým jeho územím (jde dobýt zpět)
    cross join lateral (select
        exists (select 1 from public.conquest_territories t where t.game_id = r.game_id and t.owner = r.victim) as landed,
        exists (select 1 from public.conquest_links l join public.conquest_territories t on t.game_id = r.game_id and t.territory = l.b and t.owner = r.victim
            where l.map = r.map and l.a = r.territory) as near) x
    where r.rk = 1
$$;
revoke all on function public.conquest_push_more(integer), public.conquest_push_items() from public, anon, authenticated;
-- ===== 23: Dobývání – ztracený hrad a upozornění na útoky — KONEC BLOKU =====

-- ===== 24: Dobývání – pozvánky pro přátele =====
-- Hráč hry, která ještě nezačala, pozve do ní jednotlivé přátele (conquest_invite; při zakládání hry je aplikace pozve hned po založení).
-- Pozvat jde jen přijaté přátele a čekajících pozvánek smí být nejvýš tolik, kolik je ve hře volných míst (odmítnuté se nepočítají);
-- přítele, kterého zakladatel hry blokuje (nebo on jeho), pozvánka mine. Pozvaný vidí pozvánku v aplikaci (conquest_invites_mine: hra
-- v lobby s místem, kód a kdo zve), přidá se bez kódu i do soukromé hry (conquest_join s id hry; přidáním pozvánka zmizí), nebo ji odmítne
-- (conquest_decline_invite). Odmítnutého přítele jde pozvat znovu (odmítnutí se tím zruší). Hráči hry vidí čekající pozvané v souhrnu
-- (conquest_summary: invited, „Pozváno“), ostatní ne; začátkem hry pozvánky končí. Upozornění (push_pending, druh 'conquest_invite', klíč
-- cqi:hra:pozvaný v push_sent): „X tě zve do hry“ jednou za pozvánku (i po opětovném pozvání), jen do 3 dnů od pozvání a jen dokud hra čeká
-- a má místo; vypíná ho profiles.push_conquest (dlaždice Dobývání v Nastavení) jako upozornění na útoky. Tabulku nikdo nečte ani nepíše
-- přímo, jen přes funkce níže; jeden hráč pošle nejvýš 30 pozvánek za hodinu.
create table if not exists public.conquest_invites (
    game_id uuid not null references public.conquest_games (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    invited_by uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    declined_at timestamptz,
    primary key (game_id, user_id)
);
create index if not exists conquest_invites_user_idx on public.conquest_invites (user_id) where declined_at is null;
create index if not exists conquest_invites_by_idx on public.conquest_invites (invited_by, created_at);
create index if not exists conquest_invites_fresh_idx on public.conquest_invites (created_at) where declined_at is null;
alter table public.conquest_invites enable row level security;
revoke all on public.conquest_invites from public, anon, authenticated;

-- Pozvat přátele do hry: jen hráč hry, která ještě nezačala; friends = id přátel (nejvýš 7 najednou). Kdo už ve hře je nebo pozvánku
-- čeká, se přeskočí, odmítnutá pozvánka se obnoví. Vrací souhrn hry (s pozvanými v invited).
create or replace function public.conquest_invite(game uuid, friends uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; wanted uuid[]; seats integer; waiting integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid) then raise exception 'Tuhle hru nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'lobby' then raise exception 'Pozvat jde jen do hry, která ještě nezačala.' using errcode = 'P0001'; end if;
    wanted := array(select distinct f from unnest(coalesce(friends, '{}'::uuid[])) f where f is not null);
    if cardinality(wanted) = 0 then raise exception 'Vyber, koho chceš pozvat.' using errcode = '22023'; end if;
    if cardinality(wanted) > 7 then raise exception 'Najednou jde pozvat nejvýš 7 přátel.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(wanted) f where not exists (select 1 from public.friendships s where s.status = 'accepted'
            and ((s.user_id = uid and s.friend_id = f) or (s.user_id = f and s.friend_id = uid)))) then
        raise exception 'Pozvat můžeš jen své přátele.' using errcode = '22023';
    end if;
    -- Noví pozvaní: ne hráči, ne s čekající pozvánkou, ne blokovaní se zakladatelem (do hry by se stejně nepřidali)
    wanted := array(select f from unnest(wanted) f
        where not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = f)
            and not exists (select 1 from public.conquest_invites i where i.game_id = game and i.user_id = f and i.declined_at is null)
            and not (g.creator is not null and public.is_blocked(g.creator, f)));
    if cardinality(wanted) > 0 then
        seats := g.max_players - (select count(*) from public.conquest_players p where p.game_id = game);
        waiting := (select count(*) from public.conquest_invites i where i.game_id = game and i.declined_at is null
            and not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = i.user_id));
        if seats - waiting <= 0 then raise exception 'Volná místa ve hře už čekají na pozvané přátele.' using errcode = 'P0001'; end if;
        if waiting + cardinality(wanted) > seats then raise exception 'Volná místa ve hře: %. Vyber méně přátel.', seats - waiting using errcode = 'P0001'; end if;
        if (select count(*) from public.conquest_invites i where i.invited_by = uid and i.created_at > now() - interval '1 hour') + cardinality(wanted) > 30 then
            raise exception 'Pozvánek je teď moc. Zkus to za chvíli.' using errcode = 'P0001';
        end if;
        insert into public.conquest_invites (game_id, user_id, invited_by, created_at)
        select game, f, uid, now() from unnest(wanted) f
        on conflict (game_id, user_id) do update set invited_by = excluded.invited_by, created_at = excluded.created_at, declined_at = null;
    end if;
    return public.conquest_summary(g, uid);
end;
$$;

-- Moje čekající pozvánky (nejnovější první, nejvýš 20): souhrn hry, kód, kdo zve (veřejné údaje profilu) a kdy. Jen hry, které ještě
-- nezačaly, mají volné místo a nejsem v nich; bez pozvánek od blokovaných a do her blokovaného zakladatele.
create or replace function public.conquest_invites_mine() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return coalesce((select jsonb_agg(public.conquest_summary(x.g, uid) || jsonb_build_object('code', (x.g).code, 'invited_at', x.created_at,
            'invited_by', case when a.id is null then null else public.group_player_json(a) end) order by x.created_at desc)
        from (select g, i.created_at, i.invited_by from public.conquest_invites i join public.conquest_games g on g.id = i.game_id and g.status = 'lobby'
              where i.user_id = uid and i.declined_at is null and g.created_at > public.conquest_now() - interval '7 days'
                  and not exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid)
                  and (select count(*) from public.conquest_players c where c.game_id = g.id) < g.max_players
                  and not (g.creator is not null and public.is_blocked(g.creator, uid)) and not public.is_blocked(i.invited_by, uid)
              order by i.created_at desc limit 20) x
        left join public.profiles a on a.id = x.invited_by), '[]'::jsonb);
end;
$$;

-- Odmítnutí pozvánky (pozvánka zmizí z mých pozvánek; znovu pozvat mě jde). Bez pozvánky nic.
create or replace function public.conquest_decline_invite(game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    update public.conquest_invites set declined_at = now() where game_id = game and user_id = uid and declined_at is null;
end;
$$;

-- Délka hry do upozornění („hra na 12 hodin“, „na 1 den“, „na 3 dny“, „na 7 dní“)
create or replace function public.conquest_push_length(hours integer) returns text
language sql immutable as $$
    select case when hours < 24 then hours || ' hodin' when hours / 24 = 1 then '1 den' when hours / 24 between 2 and 4 then (hours / 24) || ' dny' else (hours / 24) || ' dní' end
$$;

-- Upozornění na pozvánky (řádky ve tvaru položek push_pending); volá ho jen push_pending. Bez rodu: „X tě zve do hry“.
create or replace function public.conquest_invite_push_items() returns table (user_id uuid, kind text, title text, body text, url text, dedupe_key text, sort_at text)
language sql stable set search_path = public as $$
    select i.user_id, 'conquest_invite'::text,
        'Dobývání: ' || coalesce(nullif(btrim(a.display_name), ''), 'Kamarád') || ' tě zve do hry',
        'Mapa ' || m.title || ' · hra na ' || public.conquest_push_length(g.duration_hours) || '. Vyber si barvu a přidej se.',
        './?dobyvani=' || g.code,
        'cqi:' || i.game_id || ':' || i.user_id,
        i.created_at::text
    from public.conquest_invites i
    join public.conquest_games g on g.id = i.game_id and g.status = 'lobby'
    join public.conquest_maps m on m.id = g.map
    join public.profiles me on me.id = i.user_id and me.push_conquest
    left join public.profiles a on a.id = i.invited_by
    where i.declined_at is null and i.created_at > now() - interval '3 days' and not public.dev_is_bot(i.user_id)
        and not exists (select 1 from public.conquest_players c where c.game_id = i.game_id and c.user_id = i.user_id)
        and (select count(*) from public.conquest_players c where c.game_id = g.id) < g.max_players
$$;

-- Oprávnění: hráč volá jen pozvání, své pozvánky a odmítnutí (anon nic); pomocné funkce jen interně
revoke all on function public.conquest_push_length(integer), public.conquest_invite_push_items() from public, anon, authenticated;
revoke all on function public.conquest_invite(uuid, uuid[]), public.conquest_invites_mine(), public.conquest_decline_invite(uuid) from public, anon;
grant execute on function public.conquest_invite(uuid, uuid[]), public.conquest_invites_mine(), public.conquest_decline_invite(uuid) to authenticated;
-- ===== 24: Dobývání – pozvánky pro přátele — KONEC BLOKU =====

-- ===== 25: Dobývání – bitvy o území (obléhání) =====
-- Útok začne obléhání území (conquest_siege_begin): aplikace útočníka pošle otázku (zadání, obrázky, možnosti bez příznaku správnosti)
-- a zvlášť index správné možnosti. Server otázku uloží a správnou odpověď nikomu neprozradí, dokud sám neodpoví. Obléhání vidí všichni
-- hráči hry skoro hned (conquest_pulse, aplikace ho volá každé 1,5–3 s; conquest_state má totéž v sieges): území, účastníky a termíny.
-- Přidat se do bitvy (conquest_siege_join) smí, kdo by na území mohl zaútočit (sousedí s ním, není jeho majitel, má tah), nejvýš 60 s
-- od začátku obléhání (join_until) a jen dokud bitva trvá. Každý účastník dostane stejnou otázku a má na ni 60 s od chvíle, kdy obléhání
-- začal nebo se přidal (joined_at; termín deadline = joined_at + 60 s, server přijme odpověď ještě 3 s po něm kvůli síti). Odpověď je
-- index možnosti a vyhodnotí ji server (conquest_siege_answer); čas odpovědi = answered_at − joined_at, pozdní odpověď je jako žádná.
-- Začátek i přidání stojí tah: hned je rezervovaný (conquest_budget: reserved), po vyhodnocení je místo rezervace zapsaný tah
-- (conquest_moves) v období, kdy se hráč přidal. Bitva se vyhodnotí, jakmile odpověděli všichni (s jediným účastníkem hned po odpovědi;
-- pak se už nikdo nepřidá), nebo když uplyne poslední termín – líně v conquest_state, conquest_pulse, conquest_siege_status, v úklidu hry
-- (conquest_housekeep) a před koncem hry (conquest_finish), takže opuštěná bitva nezůstane viset. Vítěz = správná odpověď s nejkratším
-- časem, při shodě kdo se přidal dřív; jeho útok má stejný účinek jako dosud správný útok (conquest_attack_apply: dobytí, nebo pobourání
-- opevnění). Ostatní mají zapsaný neúspěšný tah: špatně nebo bez odpovědi 'fail', správně, ale pomaleji 'outrun' (prohraná bitva); oběť
-- je u všech majitel území. Když nikdo neodpoví správně, útok je odražen. Během obléhání majitel území neopevní a jinak než přidáním do
-- bitvy se na něj zaútočit nedá (conquest_move_by; starší aplikace dál útočí přes conquest_move jako okamžitá bitva bez dalších účastníků),
-- boti obléhaná území vynechají a Návrat do hry je nepřidělí. Tabulky bitev nikdo nečte ani nepíše přímo, jen přes funkce níže (správná
-- odpověď je jen v conquest_sieges.correct_choice). Navíc: pevnost na domovském území dává +1 tah za období (conquest_budget: fortress).
alter table public.conquest_games add column if not exists siege_rev integer not null default 0;
create table if not exists public.conquest_sieges (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.conquest_games (id) on delete cascade,
    territory text not null,
    started_by uuid references public.profiles (id) on delete set null,
    -- otázka bez správné odpovědi (stejná pro všechny účastníky) a index správné možnosti (ven jen účastníkovi, který už odpověděl)
    question jsonb not null,
    correct_choice smallint not null,
    status text not null default 'open',
    started_at timestamptz not null,
    -- přidat se jde do join_until (60 s od začátku); ends_at = poslední termín odpovědi (nejpozdější přidání + 60 s, bez 3 s na síť)
    join_until timestamptz not null,
    ends_at timestamptz not null,
    resolved_at timestamptz,
    winner uuid references public.profiles (id) on delete set null,
    -- výsledek bitvy: capture | breach (vítěz) | fail (útok odražen)
    outcome text
);
alter table public.conquest_sieges drop constraint if exists conquest_sieges_values;
alter table public.conquest_sieges add constraint conquest_sieges_values check (status in ('open', 'resolved') and correct_choice between 0 and 7
    and (outcome is null or outcome in ('capture', 'breach', 'fail')) and ((status = 'open') = (resolved_at is null)));
-- Na území je nejvýš jedna otevřená bitva (index slouží i dotazům na otevřené bitvy hry)
create unique index if not exists conquest_sieges_open_key on public.conquest_sieges (game_id, territory) where status = 'open';
create index if not exists conquest_sieges_game_idx on public.conquest_sieges (game_id, started_at desc);
create table if not exists public.conquest_siege_players (
    siege_id uuid not null references public.conquest_sieges (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    -- vlastní území, odkud útok vede
    source text,
    -- období, kdy se hráč přidal (rezervace tahu a období zapsaného tahu)
    period integer not null,
    joined_at timestamptz not null,
    answered_at timestamptz,
    -- vybraná možnost (null = bez odpovědi) a jestli byla správná a v termínu
    picked smallint,
    is_correct boolean,
    -- po vyhodnocení: capture | breach | fail | outrun a zapsaný tah
    result text,
    move_id bigint references public.conquest_moves (id) on delete set null,
    primary key (siege_id, user_id)
);
alter table public.conquest_siege_players drop constraint if exists conquest_siege_players_values;
alter table public.conquest_siege_players add constraint conquest_siege_players_values check (result is null or result in ('capture', 'breach', 'fail', 'outrun'));
create index if not exists conquest_siege_players_user_idx on public.conquest_siege_players (user_id);
alter table public.conquest_sieges enable row level security;
alter table public.conquest_siege_players enable row level security;
revoke all on public.conquest_sieges, public.conquest_siege_players from public, anon, authenticated;

-- Čas na odpověď (60 s) a rezerva na síť (3 s)
create or replace function public.conquest_siege_window() returns interval
language sql immutable as $$ select interval '60 seconds' $$;
create or replace function public.conquest_siege_grace() returns interval
language sql immutable as $$ select interval '3 seconds' $$;

-- Značka verze hry pro conquest_pulse a conquest_state: nejvyšší id tahu, počítadlo změn bitev a stav hry („812.14.running“).
-- Když se změní, aplikace si načte celý stav (conquest_state).
create or replace function public.conquest_version(g public.conquest_games) returns text
language sql stable set search_path = public as $$
    select coalesce((select max(m.id) from public.conquest_moves m where m.game_id = g.id), 0) || '.' || g.siege_rev || '.' || g.status
$$;

-- Otázka bitvy od útočníka: objekt nejvýš 40 kB se 2–8 možnostmi (choices: objekty nebo texty) a platným indexem správné možnosti.
-- Příznaky správnosti (correct) se z otázky i z možností zahodí; správná odpověď zůstane jen v conquest_sieges.correct_choice.
create or replace function public.conquest_siege_question(q jsonb, correct_index integer) returns jsonb
language plpgsql immutable set search_path = public as $$
declare n integer;
begin
    if q is not null and octet_length(q::text) > 40000 then raise exception 'Otázka k bitvě je moc velká.' using errcode = '22023'; end if;
    if q is null or jsonb_typeof(q) <> 'object' or jsonb_typeof(q -> 'choices') is distinct from 'array' then
        raise exception 'Otázka k bitvě není v pořádku.' using errcode = '22023';
    end if;
    n := jsonb_array_length(q -> 'choices');
    if n < 2 or n > 8 or correct_index is null or correct_index < 0 or correct_index >= n
            or exists (select 1 from jsonb_array_elements(q -> 'choices') e (c) where jsonb_typeof(e.c) not in ('object', 'string')) then
        raise exception 'Otázka k bitvě není v pořádku.' using errcode = '22023';
    end if;
    return (q - 'correct' - 'correct_choice') || jsonb_build_object('choices',
        (select jsonb_agg(case when jsonb_typeof(x.c) = 'object' then x.c - 'correct' else x.c end order by x.i) from jsonb_array_elements(q -> 'choices') with ordinality x (c, i)));
end;
$$;

-- Bitva pro hráče uid (veřejné údaje, bez otázky): území, stav, termíny (join_until, ends_at), vítěz a výsledek bitvy (outcome);
-- účastníci podle přidání s veřejnými údaji profilu (jako group_player_json), barvou hry (flag_color), znakem, územím útoku, kdy se přidali,
-- svým termínem a jestli už odpověděli – po vyhodnocení i správnost, čas odpovědi (answer_ms), výsledek (result), vítěz a id zapsaného tahu;
-- u volajícího mine, answered, joined_at a deadline.
create or replace function public.conquest_siege_json(s public.conquest_sieges, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', s.id, 'game', s.game_id, 'territory', s.territory, 'status', s.status, 'started_by', s.started_by,
        'started_at', s.started_at, 'join_until', s.join_until, 'ends_at', s.ends_at, 'resolved_at', s.resolved_at, 'winner', s.winner, 'outcome', s.outcome,
        'mine', me.user_id is not null, 'answered', me.answered_at is not null, 'joined_at', me.joined_at, 'deadline', me.joined_at + public.conquest_siege_window(),
        'participants', coalesce((select jsonb_agg(public.group_player_json(p) || jsonb_build_object('seat', c.seat, 'flag_color', c.color, 'emblem', c.emblem,
                'source', sp.source, 'joined_at', sp.joined_at, 'deadline', sp.joined_at + public.conquest_siege_window(), 'answered', sp.answered_at is not null,
                'me', sp.user_id = uid)
                || case when s.status = 'resolved' then jsonb_build_object('correct', coalesce(sp.is_correct, false),
                    'answer_ms', (extract(epoch from (sp.answered_at - sp.joined_at)) * 1000)::integer, 'result', sp.result,
                    'winner', coalesce(sp.user_id = s.winner, false), 'move', sp.move_id) else '{}'::jsonb end
            order by sp.joined_at, sp.user_id)
            from public.conquest_siege_players sp join public.profiles p on p.id = sp.user_id
            left join public.conquest_players c on c.game_id = s.game_id and c.user_id = sp.user_id
            where sp.siege_id = s.id), '[]'::jsonb))
    from (select 1) one left join public.conquest_siege_players me on me.siege_id = s.id and me.user_id = uid
$$;
-- Bitva pro účastníka: conquest_siege_json, čas serveru (now) a jen účastníkovi otázka (bez správné odpovědi), moje odpověď (answer: choice,
-- correct, answer_ms, late), můj výsledek a tah po vyhodnocení (result, move) a index správné možnosti (correct_choice), až když jsem
-- odpověděl nebo je bitva vyhodnocená
create or replace function public.conquest_siege_view(s public.conquest_sieges, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select public.conquest_siege_json(s, uid) || jsonb_build_object('now', public.conquest_now())
        || case when me.user_id is null then '{}'::jsonb else jsonb_build_object(
            'question', s.question,
            'answer', case when me.answered_at is not null then jsonb_build_object('choice', me.picked, 'correct', coalesce(me.is_correct, false),
                'answer_ms', (extract(epoch from (me.answered_at - me.joined_at)) * 1000)::integer,
                'late', me.answered_at > me.joined_at + public.conquest_siege_window() + public.conquest_siege_grace()) end,
            'correct_choice', case when me.answered_at is not null or s.status = 'resolved' then s.correct_choice end,
            'result', me.result,
            'move', (select public.conquest_move_json(m) from public.conquest_moves m where m.id = me.move_id)) end
    from (select 1) one left join public.conquest_siege_players me on me.siege_id = s.id and me.user_id = uid
$$;
-- Otevřené bitvy hry pro hráče uid (nejstarší první) a can_join: smí se volající teď přidat (není účastník, přidat se ještě jde,
-- území není jeho, sousedí s ním a tah mu zbývá)
create or replace function public.conquest_sieges_json(gid uuid, uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare g public.conquest_games; moves_left integer; now_ts timestamptz := public.conquest_now(); list jsonb;
begin
    if not exists (select 1 from public.conquest_sieges s where s.game_id = gid and s.status = 'open') then return '[]'::jsonb; end if;
    select * into g from public.conquest_games where id = gid;
    moves_left := coalesce((public.conquest_budget(gid, uid) ->> 'left')::integer, 0);
    select coalesce(jsonb_agg(public.conquest_siege_json(s, uid) || jsonb_build_object('can_join',
            g.status = 'running' and moves_left > 0 and now_ts < s.join_until
            and not exists (select 1 from public.conquest_siege_players sp where sp.siege_id = s.id and sp.user_id = uid)
            and not exists (select 1 from public.conquest_territories t where t.game_id = gid and t.territory = s.territory and t.owner = uid)
            and exists (select 1 from public.conquest_territories o join public.conquest_links l on l.map = g.map and l.a = o.territory and l.b = s.territory
                        where o.game_id = gid and o.owner = uid))
        order by s.started_at, s.id), '[]'::jsonb) into list
    from public.conquest_sieges s where s.game_id = gid and s.status = 'open';
    return list;
end;
$$;

-- Vyhodnocení bitvy (zámek hry drží volající): jen otevřená bitva a jen když už všichni odpověděli, nebo uplynul poslední termín (+3 s),
-- nebo at_end (konec hry: kdo neodpověděl, prohrál). Vítěz = správně v termínu s nejkratším časem odpovědi, při shodě kdo se přidal dřív.
-- Tahy ostatních se zapíší napřed (oběť = majitel území, úroveň před útokem vítěze), tah vítěze nakonec (v kronice je nahoře).
-- Vrací true, když se bitva teď vyhodnotila.
create or replace function public.conquest_siege_resolve(sid uuid, at_end boolean default false) returns boolean
language plpgsql set search_path = public as $$
declare s public.conquest_sieges; win public.conquest_siege_players; r public.conquest_siege_players; t public.conquest_territories; mv public.conquest_moves;
    verdict text := 'fail';
begin
    select * into s from public.conquest_sieges where id = sid for update;
    if s.id is null or s.status <> 'open' then return false; end if;
    if not at_end and public.conquest_now() <= s.ends_at + public.conquest_siege_grace()
            and exists (select 1 from public.conquest_siege_players p where p.siege_id = sid and p.answered_at is null) then
        return false;
    end if;
    select * into win from public.conquest_siege_players p where p.siege_id = sid and p.is_correct
     order by p.answered_at - p.joined_at, p.joined_at, p.user_id limit 1;
    select * into t from public.conquest_territories where game_id = s.game_id and territory = s.territory for update;
    for r in select * from public.conquest_siege_players p where p.siege_id = sid and p.user_id is distinct from win.user_id order by p.joined_at, p.user_id loop
        insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at)
        values (s.game_id, r.user_id, r.period, 'attack', s.territory, r.source, coalesce(r.is_correct, false),
            case when r.is_correct then 'outrun' else 'fail' end, t.owner, t.level, false, false, public.conquest_now())
        returning * into mv;
        update public.conquest_siege_players set result = mv.result, move_id = mv.id where siege_id = sid and user_id = r.user_id;
    end loop;
    if win.user_id is not null then
        mv := public.conquest_attack_apply(s.game_id, win.user_id, s.territory, win.source, win.period, true);
        update public.conquest_siege_players set result = mv.result, move_id = mv.id where siege_id = sid and user_id = win.user_id;
        verdict := mv.result;
    end if;
    update public.conquest_sieges set status = 'resolved', resolved_at = public.conquest_now(), winner = win.user_id, outcome = verdict where id = sid;
    update public.conquest_games set siege_rev = siege_rev + 1 where id = s.game_id;
    return true;
end;
$$;
-- Bitvy hry po termínu (při at_end všechny otevřené: konec hry) se vyhodnotí. Zámek hry se bere, jen když je co vyhodnocovat, takže
-- časté dotazy (conquest_pulse) se navzájem nezdržují. Vrací počet vyhodnocených bitev.
create or replace function public.conquest_sieges_due(gid uuid, at_end boolean default false) returns integer
language plpgsql set search_path = public as $$
declare sid uuid; made integer := 0;
begin
    if not exists (select 1 from public.conquest_sieges s where s.game_id = gid and s.status = 'open'
            and (at_end or s.ends_at + public.conquest_siege_grace() < public.conquest_now())) then
        return 0;
    end if;
    perform 1 from public.conquest_games where id = gid for update;
    for sid in select s.id from public.conquest_sieges s where s.game_id = gid and s.status = 'open' order by s.started_at, s.id loop
        if public.conquest_siege_resolve(sid, at_end) then made := made + 1; end if;
    end loop;
    return made;
end;
$$;
-- Líný úklid pro časté dotazy (conquest_pulse, conquest_siege_status): bitvy po termínu; po konci hry celý úklid (konec vyhodnotí i otevřené bitvy)
create or replace function public.conquest_siege_tick(g public.conquest_games) returns void
language plpgsql set search_path = public as $$
begin
    if g.id is null or g.status <> 'running' then return; end if;
    if public.conquest_now() >= g.ends_at then perform public.conquest_housekeep(g.id);
    else perform public.conquest_sieges_due(g.id, false); end if;
end;
$$;
-- Hra bitvy pro hráče uid, zamčená: musí ji hrát a nesmí čekat na začátek; napřed se uklidí (bitvy po termínu, konec hry, Návrat do hry).
-- must_run = true: skončená hra je chyba (začátek a přidání); odpověď do bitvy, kterou vyhodnotil konec hry, vrátí výsledek.
create or replace function public.conquest_siege_game(gid uuid, uid uuid, must_run boolean) returns public.conquest_games
language plpgsql set search_path = public as $$
declare g public.conquest_games;
begin
    select * into g from public.conquest_games where id = gid for update;
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = gid and c.user_id = uid) then
        raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501';
    end if;
    if g.status = 'lobby' then raise exception 'Hra ještě nezačala.' using errcode = 'P0001'; end if;
    perform public.conquest_housekeep(gid);
    select * into g from public.conquest_games where id = gid;
    if must_run and g.status <> 'running' then raise exception 'Hra už skončila.' using errcode = 'P0001'; end if;
    return g;
end;
$$;

-- Začátek obléhání: kontrola jako u útoku (hra běží, tah zbývá, cizí území sousedící s vlastním, source = vlastní sousední území, nepovinné)
-- a na území nesmí být jiná bitva. question = otázka bez správné odpovědi, correct = index správné možnosti (conquest_siege_question).
-- Rezervuje tah. Vrací bitvu pro účastníka (conquest_siege_view: id, territory, joined_at, deadline, join_until, ends_at, now, …) a budget.
create or replace function public.conquest_siege_begin(game uuid, target text, question jsonb, correct smallint, source text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; clean jsonb; budget jsonb; s public.conquest_sieges; now_ts timestamptz := public.conquest_now();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    clean := public.conquest_siege_question(question, correct);
    g := public.conquest_siege_game(game, uid, true);
    if not exists (select 1 from public.conquest_territories c where c.game_id = game and c.territory = target) then raise exception 'Tohle území na mapě není.' using errcode = '22023'; end if;
    perform 1 from public.conquest_territories c where c.game_id = game and c.territory = target for update;
    budget := public.conquest_budget(game, uid);
    if (budget ->> 'left')::integer <= 0 then raise exception 'Tahy na tohle období už nemáš. Další přibudou v příštím období.' using errcode = 'P0001'; end if;
    perform public.conquest_attack_check(g, uid, target, source);
    if target = any (public.conquest_besieged(game)) then raise exception 'Na území právě probíhá bitva. Můžeš se přidat.' using errcode = 'P0001'; end if;
    insert into public.conquest_sieges (game_id, territory, started_by, question, correct_choice, started_at, join_until, ends_at)
    values (game, target, uid, clean, correct, now_ts, now_ts + public.conquest_siege_window(), now_ts + public.conquest_siege_window())
    returning * into s;
    insert into public.conquest_siege_players (siege_id, user_id, source, period, joined_at) values (s.id, uid, source, (budget ->> 'period')::integer, now_ts);
    update public.conquest_games set siege_rev = siege_rev + 1 where id = game;
    return public.conquest_siege_view(s, uid) || jsonb_build_object('budget', public.conquest_budget(game, uid));
end;
$$;

-- Přidání do bitvy: kdo by na území mohl zaútočit (není jeho, sousedí s jeho územím, tah zbývá), do join_until a dokud bitva trvá
-- (jinak „Bitva už skončila.“). source = vlastní sousední území (nepovinné, jinak to nejopevněnější). Rezervuje tah. Kdo už v bitvě je,
-- dostane totéž znovu (bez další rezervace). Vrací bitvu pro účastníka s otázkou (bez správné odpovědi), joined_at, deadline, now a budget.
create or replace function public.conquest_siege_join(siege uuid, source text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid uuid; g public.conquest_games; s public.conquest_sieges; budget jsonb; src text := source; now_ts timestamptz := public.conquest_now();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select x.game_id into gid from public.conquest_sieges x where x.id = siege;
    g := public.conquest_siege_game(gid, uid, true);
    select * into s from public.conquest_sieges x where x.id = siege for update;
    if exists (select 1 from public.conquest_siege_players p where p.siege_id = siege and p.user_id = uid) then
        return public.conquest_siege_view(s, uid) || jsonb_build_object('budget', public.conquest_budget(gid, uid));
    end if;
    if s.status <> 'open' or now_ts >= s.join_until
            or not exists (select 1 from public.conquest_siege_players p where p.siege_id = siege and p.answered_at is null) then
        raise exception 'Bitva už skončila.' using errcode = 'P0001';
    end if;
    budget := public.conquest_budget(gid, uid);
    if (budget ->> 'left')::integer <= 0 then raise exception 'Tahy na tohle období už nemáš. Další přibudou v příštím období.' using errcode = 'P0001'; end if;
    perform public.conquest_attack_check(g, uid, s.territory, src);
    if src is null then
        select o.territory into src from public.conquest_territories o join public.conquest_links l on l.map = g.map and l.a = o.territory and l.b = s.territory
         where o.game_id = gid and o.owner = uid order by o.level desc, o.territory limit 1;
    end if;
    insert into public.conquest_siege_players (siege_id, user_id, source, period, joined_at) values (siege, uid, src, (budget ->> 'period')::integer, now_ts);
    update public.conquest_sieges set ends_at = greatest(ends_at, now_ts + public.conquest_siege_window()) where id = siege returning * into s;
    update public.conquest_games set siege_rev = siege_rev + 1 where id = gid;
    return public.conquest_siege_view(s, uid) || jsonb_build_object('budget', public.conquest_budget(gid, uid));
end;
$$;

-- Odpověď v bitvě: choice = index možnosti (null = bez odpovědi, třeba po vypršení času). Zapíše se jen jednou (další volání vrátí totéž),
-- server ji vyhodnotí proti uložené správné odpovědi a pozdní (po termínu + 3 s) počítá jako špatnou; pak zkusí bitvu vyhodnotit.
-- Vrací { correct, status: 'waiting' | 'resolved', late, answer_ms, correct_choice, siege (conquest_siege_view s výsledky účastníků
-- po vyhodnocení), now } a po vyhodnocení navíc můj tah (move) a čerstvý stav hry (state, conquest_state).
create or replace function public.conquest_siege_answer(siege uuid, choice smallint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid uuid; g public.conquest_games; s public.conquest_sieges; me public.conquest_siege_players; pick smallint := choice;
    now_ts timestamptz := public.conquest_now(); info jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select x.game_id into gid from public.conquest_sieges x where x.id = siege;
    g := public.conquest_siege_game(gid, uid, false);
    select * into s from public.conquest_sieges x where x.id = siege for update;
    select * into me from public.conquest_siege_players p where p.siege_id = siege and p.user_id = uid;
    if me.user_id is null then raise exception 'V téhle bitvě nebojuješ.' using errcode = 'P0001'; end if;
    if me.answered_at is null and s.status = 'open' then
        if pick is not null and (pick < 0 or pick >= jsonb_array_length(s.question -> 'choices')) then raise exception 'Neplatná odpověď.' using errcode = '22023'; end if;
        update public.conquest_siege_players set answered_at = now_ts, picked = pick,
            is_correct = coalesce(now_ts <= me.joined_at + public.conquest_siege_window() + public.conquest_siege_grace() and pick = s.correct_choice, false)
         where siege_id = siege and user_id = uid;
        update public.conquest_games set siege_rev = siege_rev + 1 where id = gid;
        perform public.conquest_siege_resolve(siege, false);
        select * into s from public.conquest_sieges x where x.id = siege;
    end if;
    info := public.conquest_siege_view(s, uid);
    return jsonb_build_object('correct', coalesce((info #>> '{answer,correct}')::boolean, false),
            'status', case when s.status = 'resolved' then 'resolved' else 'waiting' end,
            'late', coalesce((info #>> '{answer,late}')::boolean, true),
            'answer_ms', info #> '{answer,answer_ms}', 'correct_choice', info -> 'correct_choice', 'siege', info, 'now', now_ts)
        || case when s.status = 'resolved' then jsonb_build_object('move', info -> 'move', 'state', public.conquest_state(gid)) else '{}'::jsonb end;
end;
$$;

-- Stav bitvy (hráčům hry; otázku a mou odpověď jen účastníkům): conquest_siege_view; bitvu po termínu napřed vyhodnotí
create or replace function public.conquest_siege_status(siege uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; s public.conquest_sieges;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = (select x.game_id from public.conquest_sieges x where x.id = siege);
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid) then
        raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501';
    end if;
    perform public.conquest_siege_tick(g);
    select * into s from public.conquest_sieges x where x.id = siege;
    return public.conquest_siege_view(s, uid);
end;
$$;

-- Puls hry (aplikace ho volá každé 1,5–3 s, levný): čas serveru (now), stav a konec hry, značka verze (version; když se změní, načíst
-- conquest_state), otevřené bitvy (sieges: conquest_siege_json + can_join) a moje bitvy vyhodnocené v posledních 2 minutách (results).
-- Bitvy po termínu a konec hry napřed líně uklidí. Stejná pravidla viditelnosti jako conquest_state (ne hráčům jen otevřená veřejná hra).
create or replace function public.conquest_pulse(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; member boolean; now_ts timestamptz := public.conquest_now();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game;
    member := g.id is not null and exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid);
    if g.id is null or (not member and not (g.status = 'lobby' and g.visibility = 'public')) then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if member and g.status = 'running' then
        perform public.conquest_siege_tick(g);
        select * into g from public.conquest_games where id = game;
    end if;
    return jsonb_build_object('id', g.id, 'now', now_ts, 'status', g.status, 'ends_at', g.ends_at, 'version', public.conquest_version(g),
        'sieges', case when member then public.conquest_sieges_json(game, uid) else '[]'::jsonb end,
        'results', case when member then coalesce((select jsonb_agg(public.conquest_siege_json(s, uid) order by s.resolved_at, s.id)
            from public.conquest_sieges s where s.game_id = game and s.status = 'resolved' and s.started_at > now_ts - interval '5 minutes'
                and s.resolved_at > now_ts - interval '2 minutes'
                and exists (select 1 from public.conquest_siege_players sp where sp.siege_id = s.id and sp.user_id = uid)), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- Oprávnění: hráč volá jen obléhání, přidání, odpověď, stav bitvy a puls (anon nic); pomocné funkce jen interně
revoke all on function public.conquest_siege_window(), public.conquest_siege_grace(), public.conquest_version(public.conquest_games),
    public.conquest_siege_question(jsonb, integer), public.conquest_siege_json(public.conquest_sieges, uuid), public.conquest_siege_view(public.conquest_sieges, uuid),
    public.conquest_sieges_json(uuid, uuid), public.conquest_siege_resolve(uuid, boolean), public.conquest_sieges_due(uuid, boolean),
    public.conquest_siege_tick(public.conquest_games), public.conquest_siege_game(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.conquest_siege_begin(uuid, text, jsonb, smallint, text), public.conquest_siege_join(uuid, text), public.conquest_siege_answer(uuid, smallint),
    public.conquest_siege_status(uuid), public.conquest_pulse(uuid) from public, anon;
grant execute on function public.conquest_siege_begin(uuid, text, jsonb, smallint, text), public.conquest_siege_join(uuid, text), public.conquest_siege_answer(uuid, smallint),
    public.conquest_siege_status(uuid), public.conquest_pulse(uuid) to authenticated;
-- ===== 25: Dobývání – bitvy o území (obléhání) — KONEC BLOKU =====

-- ===== Verze schématu =====
-- Číslo se zvyšuje při KAŽDÉ změně tohoto souboru (tabulka, sloupec, funkce, pravidlo) a zároveň konstanta REQUIRED_SCHEMA v app.js.
-- Aplikace ho po přihlášení porovná a správci (dev_admins nebo vývojářský režim) ukáže v Nastavení, že má schéma spustit znovu;
-- tests/sql-monitor.test.js hlídá, že se obě čísla shodují. Funkce patří na konec souboru: když spuštění skončí chybou dřív, verze zůstane stará.
-- 3: průběh výzev a zápasů turnaje na serveru (challenge_progress, tournament_answers), XP za výhry v turnaji jednou za účet (tournament_xp_claims).
-- 4: zkušební upozornění přes server pro dev_admins (push_tests, dev_push_test, druh 'test' v push_due a push_mark).
-- 5: okamžité odesílání upozornění (push_kick přes pg_cron a pg_net, push_kick_state, push_pending sdílené s push_due, dev_push_status).
-- 6: Jak odpověděli ostatní (answer_stats, answer_stats_limits, answer_stats_submit, answer_stats_topic, dev_suspicious_questions).
-- 7: Kvíz dne (daily_quiz_results, daily_quiz_state/start/answer/board/friends; export_my_data má i 'kviz_dne').
-- 8: Skupiny (groups, group_members, group_challenges, group_join_tries, xp_weekly, funkce group_* a my_groups; export_my_data má i 'skupiny', 'skupiny_vyzvy' a 'xp_tydny';
--    výzva skupině se nepočítá do ratingu).
-- 9: Odměny (profiles.rewards: Truhla Mudrlanta, ochrana série, diplomy; export_my_data je má v řádku profilu) a odznaky Kvízu dne, Bleskovky, Přežití,
--    mapy, odhadu a Seřaď v badge_catalog().
-- 10: Rozpis otázek (challenge_progress a tournament_answers: answer, hints, ms; challenge_progress_save a tournament_answer_save s nepovinnými
--     podrobnostmi; challenge_details a tournament_details vrací soupeřovy odpovědi až po dohrání).
-- 11: upozornění na dohranou výzvu otevřou rovnou její výsledek (push_pending: odkaz s &vyzva=KÓD).
-- 12: boti v turnajích hrají sami každý den od 9:00 (tournament_clock, tournament_bots_due v tournament_tick) a vývojářské dev_tournament_bots_play;
--     o vítězi výzvy i zápasu turnaje rozhodují body, počet správných odpovědí až při shodě (rate_challenge, tournament_pick_winner, friends_list, group_detail).
-- 13: tournament_details ukáže rozpis i cizího rozhodnutého zápasu (ne hráči, který má v tomtéž kole vlastní zápas neodehraný).
-- 14: boti v turnaji ukládají odpovědi po otázkách (správně, body, nápovědy, čas) – rozpis zápasu je ukáže i u nich.
-- 15: Rozpis Kvízu dne (daily_quiz_answers, daily_quiz_answer s textem odpovědi a nápovědami, daily_quiz_details).
-- 16: Obtížnost výzvy ve třech úrovních (challenges.level: Základní, Mudrlant, Mudrlant Expert).
-- 17: Zamrzlé otázky (question_snapshots, question_snapshot_claim, question_snapshots_get: otázka výzvy, zápasu turnaje a Kvízu dne platí pro všechny
--     tak, jak ji sestavil první hráč; export_my_data má i 'zamrzle_otazky'); upozornění „… odehrál tvoji výzvu“ ukáže výsledek, až když
--     zakladatel výzvu sám dohrál (push_pending).
-- 18: Ligové sezóny (league_seasons: nejvyšší liga hráče v každém měsíci podle pražského času, nejlepší skončená sezóna; pomocné league_peaks
--     a league_month_peak) a vitrína v profilu (profiles.showcase: nejvýš 3 položky b:<odznak>, d:<téma>, l:<RRRR-MM>:<liga>; kontrola tvaru
--     showcase_format_ok a obsahu check_showcase);
--     odznaky Album sbírky v badge_catalog() (milníky sberatel-25 … sberatel-100 a celé sekce album-*).
-- 19: Tajemná otázka dne (mystery_results, mystery_state/guess/stats/friends; pomocné mystery_now, mystery_today, mystery_clues_at, mystery_json
--     a mystery_visible; export_my_data má i 'tajemna_otazka') a odznaky Detektiv (detektiv, detektiv-7, detektiv-30, detektiv-100, detektiv-365) v badge_catalog().
-- 20: Tajemná otázka dne – nápovědy rozprostřené přes celý den (0, 7, 9, 11, 13, 15, 17, 20; mystery_clues_at).
-- 21: Nové módy. Zlatá otázka (jen odznaky zlatokop-* v badge_catalog()); Řetězovka dne (chain_results, chain_submit, chain_day_stats;
--     export_my_data má i 'retezovka'); Boss týdne (boss_results, boss_submit, boss_week_stats, boss_claim_bonus; emblémy boss-* v badge_catalog(),
--     export_my_data má i 'boss_tydne'); Dobývání (conquest_maps, conquest_regions, conquest_links, conquest_games, conquest_players,
--     conquest_territories, conquest_moves; conquest_lobby/create/join/set_look/ready/leave/state/move/claim; odznaky dobyvatel-*);
--     Kamarádské sázky (challenges.stake*, taunt, profiles.bet_won/bet_lost, challenge_offer/answer/settle_stake, challenge_stakes,
--     challenge_stake_stats; odznaky sazky-* v badge_catalog()).
-- 22: Vývojářští boti v Dobývání (dev_conquest_add_bots, dev_conquest_bots_play, dev_conquest_next_period; boti hrají sami přes conquest_state
--     a tournament_tick; tah za hráče conquest_move_by; dev_tournament_clear_bots smaže i hry Dobývání s boty).
-- 23: Dobývání – kdo přijde o domovský hrad, má v dalším období o 1 tah méně (conquest_budget: penalty); upozornění na útoky soupeřů
--     (profiles.push_conquest, conquest_push_items a conquest_push_more, druh 'conquest' a klíč cq: v push_pending a push_mark, limit 10 minut;
--     indexy conquest_moves_home_lost_idx a conquest_moves_attacks_idx).
-- 24: Dobývání – pozvánky pro přátele (conquest_invites; conquest_invite, conquest_invites_mine, conquest_decline_invite; conquest_join pustí
--     pozvaného do soukromé hry bez kódu a pozvánku smaže, conquest_start pozvánky hry smaže; conquest_summary: invited přes conquest_invited_json;
--     upozornění druhu 'conquest_invite' s klíčem cqi: v push_pending a push_mark přes conquest_invite_push_items a conquest_push_length, limit 10 minut).
-- 25: Dobývání – bitvy o území (conquest_sieges, conquest_siege_players, conquest_games.siege_rev; conquest_siege_begin/join/answer/status
--     a conquest_pulse; výsledek tahu 'outrun' = prohraná bitva; conquest_move_by neútočí na obléhané území a neopevní ho, účinek útoku
--     v conquest_attack_apply a kontrola v conquest_attack_check; conquest_budget: reserved a fortress = +1 tah za Pevnost na domovském území;
--     conquest_state: sieges a version; bitvy se vyhodnotí v conquest_housekeep a před koncem v conquest_finish; boti a Návrat do hry
--     obléhaná území vynechají přes conquest_besieged).
create or replace function public.schema_version() returns integer
language sql immutable as $$ select 25 $$;
revoke all on function public.schema_version() from public, anon;
grant execute on function public.schema_version() to authenticated;
