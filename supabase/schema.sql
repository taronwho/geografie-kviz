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
-- Stupeň prestiže (blok 32, prestige.js) je vidět i ostatním (medailon v rohu obrázku hráče): seznamy hráčů níž ho vracejí spolu s rámečkem
-- a sovou, proto sloupec vzniká už tady (meze a prestige_up() v bloku 32).
alter table public.profiles add column if not exists prestige smallint not null default 0;
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
        'sazky-1', 'sazkar', 'sazky-15', 'sazky-30', 'sazky-60', 'sazky-v-rade-3', 'sazky-v-rade-5', 'sazky-v-rade-7', 'sazky-v-rade-10', 'sazky-v-rade-15',
        -- Schéma 36: Řetězovka dne (dohrané dny a celé řetězy bez Záchrany)
        'retezovka', 'retezovka-10', 'retezovka-30', 'retezovka-100', 'retezovka-365',
        'retezovka-cela', 'retezovka-cela-5', 'retezovka-cela-15', 'retezovka-cela-30', 'retezovka-cela-60'
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
    rating integer, league text, week_delta integer, week_wins integer, week_games integer, owl text, prestige integer
)
language sql stable security definer set search_path = public as $$
    with week as (
        select h.user_id, sum(h.delta)::integer as delta, (count(*) filter (where h.outcome = 'win'))::integer as wins, count(*)::integer as games
        from public.rating_history h
        where h.created_at >= (date_trunc('week', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague')
        group by h.user_id
    )
    select p.id, p.display_name, p.avatar, p.color, p.frame, p.title_pref, p.xp, p.rating, public.rating_league(p.rating), w.delta, w.wins, w.games, p.owl, p.prestige::integer
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
-- Speciální (nárazové) turnaje na téma (blok 31; sloupce jsou tady, protože je čtou funkce turnajů níž). kind 'special' zakládá jen správce
-- (dev_special_tournament_create), nikdy tournament_tick. theme = id tématu z tournament_themes (otázky vybírá aplikace podle tournament.js THEMES),
-- title = název do karty („Hrady a zámky“), starts_at = začátek (konec přihlášek a začátek 1. kola), round_minutes = délka kola v minutách:
-- kolo n se hraje od starts_at + (n − 1) × délka do starts_at + n × délka. Týdenní Mix (kind 'weekly') je má prázdné a kola má dál po pražských dnech.
-- week_start je u speciálního turnaje den začátku (Praha), topic témata otázek (jako u výzvy).
alter table public.tournaments add column if not exists kind text not null default 'weekly';
alter table public.tournaments add column if not exists theme text;
alter table public.tournaments add column if not exists title text;
alter table public.tournaments add column if not exists starts_at timestamptz;
alter table public.tournaments add column if not exists round_minutes integer;
alter table public.tournaments add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.tournaments drop constraint if exists tournaments_kind_list;
alter table public.tournaments add constraint tournaments_kind_list check (kind in ('weekly', 'special'));
alter table public.tournaments drop constraint if exists tournaments_special_fields;
alter table public.tournaments add constraint tournaments_special_fields check (
    (kind = 'weekly' and theme is null and starts_at is null and round_minutes is null)
    or (kind = 'special' and theme ~ '^[a-z0-9-]{1,40}$' and char_length(btrim(coalesce(title, ''))) between 2 and 60 and starts_at is not null
        and round_minutes between 10 and 1440));

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
-- Okamžik pro kola speciálních turnajů (blok 31; nastavení mudrlant.test_now používají jen testy)
create or replace function public.tournament_now() returns timestamptz
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_now', true), '')::timestamptz, now())
$$;
-- Fáze kola round_no: 'before' (ještě nezačalo), 'open' (hraje se), 'over' (skončilo). Týdenní turnaj po pražských dnech od started_on
-- (kolo n v den started_on + n − 1), speciální po round_minutes od starts_at (blok 31).
create or replace function public.tournament_round_phase(t public.tournaments, round_no integer) returns text
language sql stable set search_path = public as $$
    select case when t.kind = 'special' then
            case when public.tournament_now() < t.starts_at + (round_no - 1) * t.round_minutes * interval '1 minute' then 'before'
                 when public.tournament_now() < t.starts_at + round_no * t.round_minutes * interval '1 minute' then 'open'
                 else 'over' end
        else
            case when t.started_on + (round_no - 1) > public.tournament_today() then 'before'
                 when t.started_on + (round_no - 1) = public.tournament_today() then 'open'
                 else 'over' end
        end
$$;
-- Konec kola speciálního turnaje (týdenní turnaj: null, kolo končí o půlnoci)
create or replace function public.tournament_round_end(t public.tournaments, round_no integer) returns timestamptz
language sql stable set search_path = public as $$
    select case when t.kind = 'special' then t.starts_at + round_no * t.round_minutes * interval '1 minute' end
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
        -- Kontumace (blok 31): kdo zápas začal a nedohrál (vzdal nebo mu vypršel čas), má u výsledku aspoň to, co stihl (správné a body
        -- z uložených odpovědí; finished_at zůstane prázdné, takže se to nepočítá jako odehraný zápas). Rozpis zápasu pak ukáže jeho odpovědi.
        update public.tournament_results r set correct = a.good, points = a.total
            from (select ta.user_id, (count(*) filter (where ta.correct))::integer as good, coalesce(sum(ta.points), 0)::integer as total
                  from public.tournament_answers ta where ta.match_id = m.id group by ta.user_id) a
            where r.match_id = m.id and r.user_id = a.user_id and r.finished_at is null;
        update public.tournament_results set correct = coalesce(correct, 0), points = coalesce(points, 0) where match_id = m.id and finished_at is null;
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
            -- (fáze kola: týdenní turnaj po dnech, speciální po minutách od začátku, blok 31)
            if public.tournament_round_phase(t, cur) = 'over' then
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
    -- Speciální turnaj (blok 31) začíná v starts_at; při pozdním spuštění (tick nikdo nezavolal) nebo vývojářském „Spustit hned“ od teď (na celé minuty),
    -- ať první kolo nevyprší dřív, než ho kdo uvidí. Týdenní turnaj od pondělí, nejdřív dnes.
    if t.kind = 'special' then
        update public.tournaments set status = 'running', size = s, rounds = k,
            starts_at = case when force then date_trunc('minute', public.tournament_now()) else greatest(t.starts_at, date_trunc('minute', public.tournament_now())) end
            where id = tid;
        update public.tournaments set started_on = (starts_at at time zone 'Europe/Prague')::date where id = tid;
    else
        update public.tournaments set status = 'running', size = s, rounds = k, started_on = case when force then public.tournament_today() else greatest(t.week_start, public.tournament_today()) end where id = tid;
    end if;
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
    -- týdenní od svého pondělí, speciální (blok 31) od starts_at
    for t in select id from public.tournaments where status = 'open'
            and (case when kind = 'special' then starts_at <= public.tournament_now() else week_start <= today end) order by week_start, id loop
        perform public.tournament_start(t.id);
    end loop;
    -- boti v turnajích odehrají své kolo každý den od 9:00 (Praha); před posunem kol i po něm, ať stihnou včerejší kolo i nově otevřené
    perform public.tournament_bots_due();
    for t in select id from public.tournaments where status = 'running' loop
        perform public.tournament_progress(t.id);
    end loop;
    perform public.tournament_bots_due();
    -- boti v Dobývání (blok 42) hrají sami i bez otevřené hry
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
    if t.id is null or t.status <> 'open' or (case when t.kind = 'special' then t.starts_at <= public.tournament_now() else t.week_start <= public.tournament_today() end) then
        raise exception 'Přihlášky do tohoto turnaje jsou zavřené.' using errcode = '22023';
    end if;
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
    if public.tournament_round_phase(t, m.round) <> 'open' then
        raise exception '%', case when t.kind = 'special' then 'Kolo se teď nehraje.' else 'Kolo se dnes nehraje.' end using errcode = '22023';
    end if;
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
    -- bot-…: vývojářští boti (turnaje, Dobývání), botx-…: boti, které do Dobývání přidávají hráči (blok 42)
    select exists (select 1 from auth.users u where u.id = uid and u.email like 'bot%@bots.invalid');
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
    if cur is null or public.tournament_round_phase(t, cur) = 'before' then return; end if;
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
    -- speciální turnaj (blok 31): začátek o jedno kolo dřív (den začátku podle něj)
    update public.tournaments set started_on = case when kind = 'special' then ((starts_at - round_minutes * interval '1 minute') at time zone 'Europe/Prague')::date else started_on - 1 end,
        starts_at = starts_at - round_minutes * interval '1 minute' where id = tid;
    perform public.tournament_progress(tid);
    perform public.dev_bots_play(tid);
end;
$$;

-- Smaže všechny vývojářské boty (e-mail bot-…; boty hráčů botx-… z bloku 42 nechá); turnaje, které už běžely nebo skončily s boty, se smažou celé
-- (jejich pavouk by bez botů nedával smysl), otevřené turnaje přijdou jen o boty; stejně hry Dobývání (blok 22)
create or replace function public.dev_tournament_clear_bots() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
    perform public.dev_check();
    delete from public.tournaments where status <> 'open' and id in (select e.tournament_id from public.tournament_entries e where public.dev_is_bot(e.user_id));
    -- Dobývání (blok 22): rozehrané a dohrané hry s boty zmizí celé, hry v lobby přijdou jen o boty
    if to_regclass('public.conquest_games') is not null then
        delete from public.conquest_games where status <> 'lobby' and id in (select pl.game_id from public.conquest_players pl join auth.users u on u.id = pl.user_id
            where u.email like 'bot-%@bots.invalid');
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
    for t in select tr.id, tr.kind, public.tournament_round_phase(tr, x.cur) as phase, x.cur
             from public.tournaments tr
             cross join lateral (select max(m.round) as cur from public.tournament_matches m where m.tournament_id = tr.id) x
             where tr.status = 'running' and exists (select 1 from public.tournament_entries e where e.tournament_id = tr.id and public.dev_is_bot(e.user_id)) loop
        -- speciální turnaj (blok 31): kolo je krátké, boti hrají hned, jak začne
        if t.cur is not null and (t.phase = 'over' or (t.phase = 'open' and (t.kind = 'special' or public.tournament_clock() >= time '09:00'))) then
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
-- (e) útoky soupeřů v Dobývání (conquest_push_items, blok 23), (f) pozvánky přátel do hry Dobývání (conquest_invite_push_items, blok 24),
-- (g) kola v Dobývání: všichni dohráli kolo a kolo brzy končí (conquest_round_push_items, blok 29),
-- (h) nový speciální turnaj s otevřenými přihláškami (tournament_special_push_items, blok 31),
-- (i) útok na území se strážní věží: majitel ho může bránit (conquest_defend_push_items, blok 41).
-- Jeden řádek na odběr (zařízení); z každého druhu nejvýš jedna věc na hráče a běh a nic, co téhož druhu dostal v poslední hodině
-- (útoky a pozvánky v Dobývání: v posledních 10 minutách, období hry bývá jen hodina a pozvaný se má přidat, dokud je místo;
-- kola v Dobývání: v posledních 3 minutách, kolo rychlé hry trvá 5 minut).
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
        -- speciální turnaj (blok 31): kolo končí v daný čas, připomínka jednou za zápas
        select m.p as user_id, 'tournament'::text as kind,
            case when t.kind = 'special' then 'Speciální turnaj: hraješ ' else 'Turnaj: dnes hraješ ' end || public.push_round_name(t.size, m.round, m.third) as title,
            'Soupeř: ' || coalesce(op.display_name, 'Hráč') || '. ' || case when t.kind = 'special'
                then 'Kolo musíš odehrát ' || public.tournament_push_until(public.tournament_round_end(t, m.round)) || '.' else 'Kolo musíš odehrát do půlnoci.' end as body,
            './?tab=multi'::text as url,
            'tour:' || m.id || ':' || m.p || ':' || case when t.kind = 'special' then 'special' else today || ':' || part end as dedupe_key, m.id::text as sort_at
        from (
            select mm.id, mm.tournament_id, mm.round, mm.third, mm.p1 as p, mm.p2 as other from public.tournament_matches mm where mm.winner is null
            union all
            select mm.id, mm.tournament_id, mm.round, mm.third, mm.p2, mm.p1 from public.tournament_matches mm where mm.winner is null
        ) m
        join public.tournaments t on t.id = m.tournament_id and t.status = 'running' and public.tournament_round_phase(t, m.round) = 'open'
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
            case n.kind when 'excluded_full' then 'Turnaj bez tebe' when 'cancelled' then 'Turnaj se zrušil' when 'eliminated_noplay' then 'Konec v turnaji' else 'Turnaj skončil' end,
            case n.kind
                when 'excluded_full' then 'Hrají jen nejdřív přihlášení' || case when n.detail ~ '^\d{1,3}$' then ' (' || n.detail || ' hráčů)' else '' end || ', tentokrát nehraješ. Do příštího se přihlas hned při otevření přihlášek.'
                when 'cancelled' then 'Přihlásilo se ' || case when n.detail ~ '^\d{1,3}$' then 'jen ' || n.detail else 'málo' end || ' hráčů, potřeba je aspoň 8. Přihlas se do dalšího turnaje.'
                when 'eliminated_noplay' then 'Kolo zůstalo neodehrané, prohráváš kontumačně. Příště si ho zahraj v den kola.'
                else case when n.detail ~ '^\d{1,3}$' then 'Tvoje umístění: ' || n.detail || '. místo.' || case when n.detail::integer <= 3 then ' Gratulace!' else '' end else 'Podívej se na konečné pořadí.' end end,
            './?tab=multi', 'notice:' || n.id || ':' || n.user_id, n.created_at::text
        from public.tournament_notices n
        join public.profiles me on me.id = n.user_id and me.push_tournament
        where not n.seen and n.created_at > now() - interval '7 days' and n.kind in ('excluded_full', 'cancelled', 'eliminated_noplay', 'result')
        union all
        -- (d) zkušební upozornění z vývojářského režimu (dev_push_test): bez předvoleb a bez hodinového limitu, každá žádost jednou
        select pt.user_id, 'test', 'Zkušební upozornění Mudrlanta', 'Funguje to! Klepni sem a otevře se záložka Soupeři.', './?tab=multi',
            public.push_test_key(pt.user_id, pt.requested_at), pt.requested_at::text
        from public.push_tests pt
        where pt.requested_at > now() - interval '1 day'
        union all
        -- (e) útoky soupeřů v Dobývání: jedno souhrnné upozornění za hru (tabulky Dobývání vznikají níž, plpgsql je hledá až při běhu)
        select c.user_id, c.kind, c.title, c.body, c.url, c.dedupe_key, c.sort_at from public.conquest_push_items() c
        union all
        -- (f) pozvánky přátel do hry Dobývání: jedno upozornění za pozvánku (druh 'conquest_invite', blok 24)
        select c.user_id, c.kind, c.title, c.body, c.url, c.dedupe_key, c.sort_at from public.conquest_invite_push_items() c
        union all
        -- (g) kola v Dobývání: všichni dohráli kolo (druh 'conquest_round') a kolo brzy končí (druh 'conquest_ending'), blok 29
        select c.user_id, c.kind, c.title, c.body, c.url, c.dedupe_key, c.sort_at from public.conquest_round_push_items() c
        union all
        -- (h) „Začíná speciální turnaj: …“ (druh 'tournament_special', klíč tsp:), blok 31
        select c.user_id, c.kind, c.title, c.body, c.url, c.dedupe_key, c.sort_at from public.tournament_special_push_items() c
        union all
        -- (i) „Útok na tvé území, braň ho!“ majiteli strážní věže (druh 'conquest_defend', klíč cqd:), blok 41
        select c.user_id, c.kind, c.title, c.body, c.url, c.dedupe_key, c.sort_at from public.conquest_defend_push_items() c
    ), fresh as (
        select i.*, row_number() over (partition by i.user_id, i.kind order by i.sort_at, i.dedupe_key) as rn
        from items i
        where not exists (select 1 from public.push_sent s where s.dedupe_key = i.dedupe_key)
            and (i.kind = 'test' or not exists (select 1 from public.push_sent s where s.user_id = i.user_id and s.kind = i.kind
                and s.sent_at > now() - case when i.kind in ('conquest', 'conquest_invite') then interval '10 minutes'
                    when i.kind in ('conquest_round', 'conquest_ending') then interval '3 minutes' when i.kind = 'conquest_defend' then interval '1 minute'
                    else interval '55 minutes' end))
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
            when 'cq' then 'conquest' when 'cqi' then 'conquest_invite' when 'cqr' then 'conquest_round' when 'cqe' then 'conquest_ending'
            when 'cqd' then 'conquest_defend' when 'tsp' then 'tournament_special' end
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
        -- Hlasování o tématu speciálního turnaje (schéma 31, tabulka na konci souboru)
        'turnaje_hlasovani', coalesce((select jsonb_agg(jsonb_build_object('hlasovani', v.poll_id, 'tema', v.theme, 'cas', v.voted_at, 'zmen', v.changes) order by v.voted_at)
            from public.tournament_votes v where v.user_id = uid), '[]'::jsonb),
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
        'retezovka', coalesce((select jsonb_agg(to_jsonb(r) order by r.day) from public.chain_results r where r.user_id = uid), '[]'::jsonb),
        -- Pomůcky do Dobývání (schéma 30): zásoba a odkud přišly
        'pomucky', jsonb_build_object(
            'zasoba', coalesce((select jsonb_agg(to_jsonb(i) order by i.kind) from public.player_items i where i.user_id = uid), '[]'::jsonb),
            'ziskane', coalesce((select jsonb_agg(to_jsonb(x) order by x.at) from public.player_item_grants x where x.user_id = uid), '[]'::jsonb),
            -- Použitá Záchrana navíc v Řetězovce (schéma 37)
            'pouzite', coalesce((select jsonb_agg(to_jsonb(u) order by u.at) from public.player_item_uses u where u.user_id = uid), '[]'::jsonb)),
        -- Výplně území a vzácné znaky do Dobývání (schéma 38): co hráč odemkl a kdy to aplikace ohlásila
        'dobyvani_vzhled', coalesce((select jsonb_agg(to_jsonb(l) order by l.unlocked_at, l.kind, l.item) from public.conquest_looks l where l.user_id = uid), '[]'::jsonb),
        -- Pozvi kamarády (schéma 32): můj kód přítele, kdo mě pozval, koho jsem pozval a vyzvednuté odměny (prestiž a vítězný efekt jsou v profilu)
        'pozvanky', jsonb_build_object(
            'kod', (select c.code from public.referral_codes c where c.user_id = uid),
            'pozval_me', (select jsonb_build_object('hrac', r.inviter, 'kdy', r.created_at) from public.referrals r where r.invitee = uid),
            'pozvani', coalesce((select jsonb_agg(jsonb_build_object('hrac', r.invitee, 'kdy', r.created_at) order by r.created_at) from public.referrals r where r.inviter = uid), '[]'::jsonb),
            'odmeny', coalesce((select jsonb_agg(to_jsonb(x) order by x.claimed_at) from public.referral_rewards x where x.user_id = uid), '[]'::jsonb))
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
    status text, direction text, since timestamptz, wins integer, losses integer, draws integer, prestige integer
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
        coalesce(d.wins, 0), coalesce(d.losses, 0), coalesce(d.draws, 0), p.prestige::integer
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
    if t.status <> 'running' or public.tournament_round_phase(t, m.round) <> 'open' then
        raise exception '%', case when t.kind = 'special' then 'Kolo se teď nehraje.' else 'Kolo se dnes nehraje.' end using errcode = '22023';
    end if;
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
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'prestige', p.prestige, 'score', k.score, 'correct', k.correct, 'time_ms', k.time_ms, 'me', k.user_id = uid) order by k.pos)
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
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'prestige', p.prestige, 'score', k.score, 'correct', k.correct, 'time_ms', k.time_ms, 'me', k.user_id = uid) order by k.pos)
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
        'owner', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'prestige', p.prestige)
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
    select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'prestige', p.prestige)
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
    if t.status <> 'running' or public.tournament_round_phase(t, m.round) <> 'open' then
        raise exception '%', case when t.kind = 'special' then 'Kolo se teď nehraje.' else 'Kolo se dnes nehraje.' end using errcode = '22023';
    end if;
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
    -- Kontumace (blok 31): zápas, který hráč nedohrál (vzdal, vypršel mu čas, nebo ho vůbec nezačal), uvidí v rozpisu, až je rozhodnutý
    -- (dál už se hrát nedá) – s vlastními uloženými odpověďmi a se soupeřovými
    if m.winner is null and not exists (select 1 from public.tournament_results tr where tr.match_id = m.id and tr.user_id = uid and tr.finished_at is not null) then
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
-- Odpověď, kterou hráč dohraje kvíz bez chyby (10 z 10), dá pomůcku 50/50 do Dobývání, nejvýš jednou za ISO týden (blok 30,
-- klíč daily:<RRRR-Wtt>; s plnou zásobou se zkusí znovu při dalším kvízu bez chyby téhož týdne): výsledek má navíc item. Dohraný kvíz,
-- kterým série dosáhne milníku 7, 30, 100 nebo 365 dní, dá Ankh vzkříšení do Dobývání (blok 39, klíč daily-streak:<dny>): revive_item.
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
declare uid uuid := auth.uid(); d date := public.daily_quiz_today(); r public.daily_quiz_results; gap bigint; counted integer; item jsonb; revive_item jsonb;
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
    if r.answered = 10 and r.correct = 10 and to_regprocedure('public.player_item_grant(uuid, text, text, boolean)') is not null then
        item := public.player_item_grant(uid, 'fifty', 'daily:' || public.player_items_week(d), true);
    end if;
    -- Milník série Kvízu dne (7, 30, 100 a 365 dní) dá Ankh vzkříšení do Dobývání (blok 39): revive_item
    if r.answered = 10 and to_regprocedure('public.conquest_revive_streak(uuid, date)') is not null then revive_item := public.conquest_revive_streak(uid, d); end if;
    return public.daily_quiz_json(r, d, uid) || case when item is not null then jsonb_build_object('item', item) else '{}'::jsonb end
        || case when revive_item is not null then jsonb_build_object('revive_item', revive_item) else '{}'::jsonb end;
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
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'prestige', p.prestige, 'solved', k.solved, 'clues', k.clues, 'guesses', k.guesses, 'points', k.points,
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
-- boss poprvé (aplikace podle toho připíše XP za výhru jen jednou za účet). První výhra v týdnu dá pomůcku Tah navíc do Dobývání
-- (blok 30, klíč boss:<týden>): item = { kind, granted, full, count, max }, jen u odeslání s first_win.
create or replace function public.boss_submit(for_week date, idx integer, damage integer, is_defeated boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t timestamptz := public.boss_now(); r public.boss_results; first boolean; item jsonb;
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
    if first and to_regprocedure('public.player_item_grant(uuid, text, text, boolean)') is not null then
        item := public.player_item_grant(uid, 'extra_move', 'boss:' || for_week, false);
    end if;
    return public.boss_json(r, for_week) || jsonb_build_object('first_win', first)
        || case when item is not null then jsonb_build_object('item', item) else '{}'::jsonb end;
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
declare uid uuid := auth.uid(); t timestamptz := public.boss_now(); r public.boss_results; players integer; beaten integer; reached boolean; item jsonb;
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
    -- Společný cíl splněný: k XP i pomůcka Záchrana navíc do Řetězovky (blok 37, klíč bossbonus:<týden>; s plnou zásobou nic): item
    if to_regprocedure('public.chain_use_rescue(date)') is not null then
        item := public.player_item_grant(uid, 'chain_rescue', 'bossbonus:' || for_week, false);
    end if;
    return jsonb_build_object('week', for_week, 'played', true, 'reached', true, 'claimed', true, 'xp', 50)
        || case when item is not null then jsonb_build_object('item', item) else '{}'::jsonb end;
end;
$$;

-- Pomocné funkce jen interně; hráč volá jen odeslání, statistiky a bonus (anon nic)
revoke all on function public.boss_now(), public.boss_week(timestamptz), public.boss_json(public.boss_results, date) from public, anon, authenticated;
revoke all on function public.boss_submit(date, integer, integer, boolean), public.boss_week_stats(date), public.boss_claim_bonus(date) from public, anon;
grant execute on function public.boss_submit(date, integer, integer, boolean), public.boss_week_stats(date), public.boss_claim_bonus(date) to authenticated;
-- ===== Boss týdne (schéma 21) — KONEC BLOKU =====

-- ===== 21: Dobývání — ZAČÁTEK BLOKU =====
-- Hry o mapu (conquest.js, conquest-ui.js): kdokoli přihlášený založí hru s mapou (Evropa, Afrika, Asie, Amerika, Česko), délkou
-- (6 h až 7 dní, rychlá hra 20–120 minut), počtem hráčů (2–8), počtem tahů za období (1–10, období = den, hodina, 10 nebo 5 minut od začátku
-- hry; když všichni dohrají a chtějí další kolo, začne další období dřív, blok 26) a viditelností (veřejná
-- v lobby, nebo soukromá jen kódem či pozvánkou od přítele, blok 24). Hráč si při založení i přidání vybere barvu (v jedné hře každou jen jeden hráč) a znak.
-- Hra začne sama, když je plná, nebo když jsou v ní aspoň 2 hráči a všichni mají „Chci hrát“: každý dostane domovské území co nejdál
-- od ostatních, na neutrálních územích se rozmístí poklady. Tah = otázka (správnost posílá aplikace, hrají spolu lidé, kteří se znají
-- z lobby); útok jen na území sousedící s vlastním, opevnění jen vlastního. Úroveň opevnění 0–3 (palisáda, hradba, pevnost; pevnost
-- jen na domovském území); úspěšný útok na opevněné území ubere úroveň, na neopevněné ho dobude. Tahy za období: základ hry, +1 za každý
-- celý region, +1 za poklad dobytý v tomto období a +1 za každé domovské území soupeře dobyté v minulém období (kořist); komu soupeř
-- v minulém období dobyl domovské území, má o 1 tah méně (blok 23). Kdo přijde
-- o všechna území, vrátí se do hry jen pomůckou Ankh vzkříšení (blok 39; do schématu 38 dostal v dalším období nové domovské území sám,
-- Návrat do hry). Konec v ends_at: body = území + 2 za celý region, při shodě vyhrává, kdo konečného počtu bodů dosáhl dřív (hráči bez
-- území: kdo vydržel déle). Pro „Rychlou hru“ drží server pro každou předvolbu jednu otevřenou veřejnou hru.
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
-- Námořní spoj (blok 38: vzor Vlnky a znak Kraken za území dobytá přes moře); nastavuje ho vygenerovaná část níže
alter table public.conquest_links add column if not exists sea boolean not null default false;

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
-- Rychlé hry a další kolo (blok 26; sloupce jsou tady, protože je čtou funkce bloků 21–25 a kontrola níž):
-- duration_minutes = délka rychlé hry (období 'min10' nebo 'min5'; duration_hours je pak null, u období den a hodina naopak);
-- round_no a round_at = kolo (období) round_no začalo v round_at (null = started_at), další jdou po délce období; round_at v budoucnu =
-- odpočet do předčasného začátku kola, do té doby běží kolo round_no − 1, které začalo v round_prev_at; round_rev = počítadlo změn
-- „Chci další kolo“ (značka verze conquest_version)
alter table public.conquest_games add column if not exists duration_minutes integer;
alter table public.conquest_games alter column duration_hours drop not null;
alter table public.conquest_games add column if not exists round_no integer not null default 0;
alter table public.conquest_games add column if not exists round_at timestamptz;
alter table public.conquest_games add column if not exists round_prev_at timestamptz;
alter table public.conquest_games add column if not exists round_rev integer not null default 0;
alter table public.conquest_games drop constraint if exists conquest_games_values;
alter table public.conquest_games add constraint conquest_games_values check (
    max_players between 2 and 8 and actions between 1 and 10
    and ((period in ('day', 'hour') and duration_minutes is null and coalesce(duration_hours in (6, 12, 24, 48, 72, 120, 168), false))
        or (period in ('min10', 'min5') and duration_hours is null and coalesce(duration_minutes in (20, 30, 45, 60, 90, 120), false)))
    and visibility in ('public', 'private') and status in ('lobby', 'running', 'finished') and code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'
    and (status = 'lobby' or (started_at is not null and ends_at is not null)) and round_no >= 0 and round_rev >= 0);
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
-- Výplň území hráče v této hře (vzor, blok 38: odemčený z conquest_look_catalog, jinak null = jen barva). Sloupec je tady, protože ho čte
-- conquest_summary (funkce v SQL se kontroluje už při vytvoření)
alter table public.conquest_players add column if not exists pattern text;
alter table public.conquest_players drop constraint if exists conquest_players_pattern;
alter table public.conquest_players add constraint conquest_players_pattern check (pattern is null or pattern ~ '^[a-z][a-z-]{1,23}$');
-- Sada hradů hráče v této hře (blok 40: odemčená z conquest_look_catalog druhu 'castle', jinak null = základní hrad a opevnění).
-- Na rozdíl od barevných výplní ji ve hře může mít víc hráčů. Sloupec je tady ze stejného důvodu jako pattern (čte ho conquest_summary).
alter table public.conquest_players add column if not exists castle text;
alter table public.conquest_players drop constraint if exists conquest_players_castle;
alter table public.conquest_players add constraint conquest_players_castle check (castle is null or castle ~ '^[a-z][a-z-]{1,23}$');
-- Bot (blok 42, docs/DOBYVANI-BOTI.md): obtížnost bota ve hře ('easy' Mudrlátko, 'medium' Mudrlant, 'hard' Super Mudrlant), u člověka null;
-- bot_idle = kolo, ve kterém bot neměl co hrát (dohrál ho). Sloupce jsou tady, protože bot_level čte conquest_summary (SQL se kontroluje hned).
alter table public.conquest_players add column if not exists bot_level text;
alter table public.conquest_players add column if not exists bot_idle integer;
alter table public.conquest_players drop constraint if exists conquest_players_bot_level;
alter table public.conquest_players add constraint conquest_players_bot_level check (bot_level is null or bot_level in ('easy', 'medium', 'hard'));

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
-- Ochrana po Ankhu vzkříšení (blok 39): do kdy na území nikdo jiný nesmí zaútočit (conquest_attack_check), jinak null
alter table public.conquest_territories add column if not exists shield_until timestamptz;
-- Stavba na území mimo domovský hrad (blok 41, docs/DOBYVANI-STAVBY.md): 'wall' = opevnění (level 1 Palisáda, 2 Hradba), 'tower' = strážní věž,
-- 'mine' = důl (obojí level 0), null = bez stavby. Domovský hrad stavbu nemá (opevňuje se dál levelem až na Pevnost). Opevnění z doby před
-- blokem 41 se doplní jako 'wall'. Sloupec je tady, protože ho čtou funkce v SQL níž (kontrolují se už při vytvoření).
-- Opevnění drží level: spoušť conquest_territories_building ho při každém zápisu srovná (opevněné území mimo domov = 'wall', bez
-- opevnění 'wall' zmizí, domovský hrad žádnou stavbu nemá), takže sedí i po pobourání nebo přímé úpravě úrovně.
alter table public.conquest_territories add column if not exists building text;
create or replace function public.conquest_territories_building() returns trigger
language plpgsql set search_path = public as $$
begin
    if new.home then new.building := null;
    elsif new.level > 0 then new.building := 'wall';
    elsif new.building = 'wall' then new.building := null;
    end if;
    return new;
end;
$$;
revoke all on function public.conquest_territories_building() from public, anon, authenticated;
drop trigger if exists conquest_territories_building on public.conquest_territories;
create trigger conquest_territories_building before insert or update on public.conquest_territories
    for each row execute function public.conquest_territories_building();
update public.conquest_territories set building = 'wall' where building is null and not home and level > 0;
update public.conquest_territories set building = null where building = 'wall' and (home or level = 0);
alter table public.conquest_territories drop constraint if exists conquest_territories_values;
alter table public.conquest_territories add constraint conquest_territories_values check (level between 0 and 3 and (level <= 2 or home)
    and (building is null or building in ('wall', 'tower', 'mine')) and (building is null or not home)
    and ((coalesce(building, '') = 'wall') = (level > 0 and not home)));

-- Tahy a události hry (kronika tažení a závěrečné přehrání): kind = home | respawn | attack | fortify | extra (pomůcka Tah navíc, blok 30:
-- bez území, result 'extra', hráč má v tom kole o 1 tah víc) | revive (pomůcka Ankh vzkříšení, blok 39: result 'respawn', victim = dosavadní
-- majitel, treasure = poklad na území; respawn = automatický Návrat do hry do schématu 38);
-- result = home | respawn | capture (dobytí) | breach (opevnění o úroveň níž) | fortify | fail | outrun (prohraná bitva: správně, ale pomaleji; blok 25) | extra
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
-- Tah navíc (blok 30) žádné území nemá
alter table public.conquest_moves alter column territory drop not null;
-- Stavba (blok 41): u tahu fortify co hráč stavěl ('wall' opevnění, 'tower' strážní věž, 'mine' důl), u útoku a Ankhu vzkříšení stavba,
-- které se týkal ('wall' = padlo poslední opevnění, 'tower' = padla věž, 'mine' = dobytý důl), u obrany 'tower'; jinak null
alter table public.conquest_moves add column if not exists building text;
alter table public.conquest_moves drop constraint if exists conquest_moves_values;
alter table public.conquest_moves add constraint conquest_moves_values check (kind in ('home', 'respawn', 'attack', 'fortify', 'extra', 'revive', 'defend')
    and (building is null or building in ('wall', 'tower', 'mine'))
    and result in ('home', 'respawn', 'capture', 'breach', 'fortify', 'fail', 'outrun', 'extra', 'repel') and level between 0 and 3
    and ((kind = 'extra') = (result = 'extra')) and (territory is not null or kind = 'extra'));
create index if not exists conquest_moves_game_idx on public.conquest_moves (game_id, id);
create index if not exists conquest_moves_user_idx on public.conquest_moves (game_id, user_id, period);
-- Statistiky hráče napříč hrami (blok 38: vyhrané bitvy a území přes moře pro odemčení vzorů a znaků)
create index if not exists conquest_moves_player_idx on public.conquest_moves (user_id, kind, result);

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
update public.conquest_links set sea = true where map = 'evropa' and (a, b) in (values ('Q145', 'Q189'), ('Q189', 'Q145'), ('Q189', 'Q20'), ('Q20', 'Q189'), ('Q20', 'Q35'), ('Q35', 'Q20'), ('Q34', 'Q35'), ('Q35', 'Q34'), ('Q191', 'Q33'), ('Q33', 'Q191'), ('Q142', 'Q145'), ('Q145', 'Q142'), ('Q222', 'Q38'), ('Q38', 'Q222'), ('Q229', 'Q41'), ('Q41', 'Q229'), ('Q229', 'Q43'), ('Q43', 'Q229'));
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
update public.conquest_links set sea = true where map = 'afrika' and (a, b) in (values ('Q1019', 'Q1029'), ('Q1029', 'Q1019'));
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
update public.conquest_links set sea = true where map = 'asie' and (a, b) in (values ('Q846', 'Q878'), ('Q878', 'Q846'), ('Q794', 'Q851'), ('Q851', 'Q794'), ('Q794', 'Q842'), ('Q842', 'Q794'), ('Q794', 'Q878'), ('Q878', 'Q794'), ('Q159', 'Q17'), ('Q17', 'Q159'), ('Q668', 'Q854'), ('Q854', 'Q668'), ('Q148', 'Q865'), ('Q865', 'Q148'), ('Q17', 'Q884'), ('Q884', 'Q17'), ('Q833', 'Q928'), ('Q928', 'Q833'));
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
update public.conquest_links set sea = true where map = 'amerika' and (a, b) in (values ('Q30', 'Q778'), ('Q778', 'Q30'), ('Q792', 'Q811'), ('Q811', 'Q792'), ('Q241', 'Q30'), ('Q30', 'Q241'), ('Q241', 'Q96'), ('Q96', 'Q241'), ('Q241', 'Q778'), ('Q778', 'Q241'), ('Q241', 'Q766'), ('Q766', 'Q241'), ('Q241', 'Q790'), ('Q790', 'Q241'), ('Q766', 'Q790'), ('Q790', 'Q766'), ('Q717', 'Q754'), ('Q754', 'Q717'), ('Q734', 'Q754'), ('Q754', 'Q734'));
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
-- Dvanáct co nejodlišnějších barev (dřívější barvy už hráči v rozehraných hrách mají dál, vybrat je ale nejde)
create or replace function public.conquest_colors() returns text[]
language sql immutable as $$ select array['cervena', 'oranzova', 'zluta', 'zelena', 'tyrkysova', 'nebeska', 'modra', 'fialova', 'ruzova', 'hneda', 'bila', 'cerna']::text[] $$;
create or replace function public.conquest_emblems() returns text[]
language sql immutable as $$ select array['lev', 'orel', 'sova', 'drak', 'koruna', 'mec', 'kotva', 'strom', 'hvezda', 'slunce', 'mesic', 'blesk',
    'vez', 'klic', 'kladivo', 'lod', 'jelen', 'medved', 'vlk', 'lilie', 'stit', 'srdce', 'plamen', 'kosatka']::text[] $$;
-- Předvolby Rychlé hry: server drží pro každou jednu otevřenou veřejnou hru. Délka v hodinách (období den a hodina), nebo v minutách
-- (rychlé hry s obdobím 'min10' a 'min5', blok 26); seznam sloupců se v bloku 26 změnil, proto drop
drop function if exists public.conquest_presets();
create function public.conquest_presets() returns table (preset text, map text, max_players integer, hours integer, minutes integer, period text, actions integer)
language sql immutable as $$
    select * from (values ('evropa-3d', 'evropa', 6, 72, null::integer, 'day', 5), ('cesko-12h', 'cesko', 4, 12, null, 'hour', 3),
            ('afrika-7d', 'afrika', 8, 168, null, 'day', 5), ('blesk-20m', 'evropa', 4, null, 20, 'min5', 5))
        v (preset, map, max_players, hours, minutes, period, actions)
$$;
-- Vzácné znaky (conquest_rare_emblems, blok 38) projdou jen jako platné id; jestli je hráč má odemčené, hlídá conquest_check_style
create or replace function public.conquest_check_look(colour text, emblem_id text) returns void
language plpgsql immutable set search_path = public as $$
begin
    if colour is null or not (colour = any (public.conquest_colors())) then raise exception 'Vyber barvu z nabídky.' using errcode = '22023'; end if;
    if emblem_id is null or not (emblem_id = any (public.conquest_emblems() || public.conquest_rare_emblems())) then raise exception 'Vyber znak z nabídky.' using errcode = '22023'; end if;
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

-- Délka období: den, hodina, 10 nebo 5 minut (rychlé hry, blok 26)
create or replace function public.conquest_period_length(per text) returns interval
language sql immutable as $$
    select case per when 'hour' then interval '1 hour' when 'min10' then interval '10 minutes' when 'min5' then interval '5 minutes' else interval '1 day' end
$$;
-- Délka hry v minutách (hry na hodiny i rychlé hry na minuty, blok 26)
create or replace function public.conquest_minutes(g public.conquest_games) returns integer
language sql immutable as $$ select coalesce(g.duration_minutes, g.duration_hours * 60) $$;
-- Období hry (kolo, od 0). Bez předčasného začátku (blok 26) kolik celých období uplynulo od začátku hry; jinak kolo round_no začalo
-- v round_at a další jdou po délce období. Během odpočtu do round_at (všichni chtěli další kolo) běží ještě kolo round_no − 1.
create or replace function public.conquest_period(g public.conquest_games) returns integer
language sql stable set search_path = public as $$
    select case when g.started_at is null then 0
        when g.round_at is not null and public.conquest_now() < g.round_at then greatest(0, g.round_no - 1)
        else greatest(0, g.round_no + floor(extract(epoch from (public.conquest_now() - coalesce(g.round_at, g.started_at)))
            / extract(epoch from public.conquest_period_length(g.period)))::integer) end
$$;
-- Začátek období p (kola od round_no podle round_at, kolo před ním během odpočtu z round_prev_at, bez předčasného začátku od začátku hry)
create or replace function public.conquest_period_start(g public.conquest_games, p integer) returns timestamptz
language sql stable set search_path = public as $$
    select case when p >= g.round_no then coalesce(g.round_at, g.started_at) + (p - g.round_no) * public.conquest_period_length(g.period)
        when p = g.round_no - 1 and g.round_prev_at is not null then g.round_prev_at
        else g.started_at + p * public.conquest_period_length(g.period) end
$$;
-- Konec období p = začátek dalšího (nebo odpočet do předčasného začátku), nejpozději konec hry
create or replace function public.conquest_period_end(g public.conquest_games, p integer) returns timestamptz
language sql stable set search_path = public as $$
    select least(g.ends_at, public.conquest_period_start(g, p + 1))
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
-- Body hráče (území + 1 navíc za území s dolem, blok 41 + 2 za celý region); čas se mění, jen když se body změní
create or replace function public.conquest_rescore(gid uuid, uid uuid) returns void
language plpgsql set search_path = public as $$
declare m text; s integer;
begin
    if uid is null then return; end if;
    select map into m from public.conquest_games where id = gid;
    s := (select count(*) + count(*) filter (where building = 'mine') from public.conquest_territories where game_id = gid and owner = uid)
        + 2 * public.conquest_regions_owned(gid, m, uid);
    update public.conquest_players set score = s, score_at = public.conquest_now() where game_id = gid and user_id = uid and (score <> s or score_at is null);
end;
$$;
-- Obléhaná území hry (otevřené bitvy z bloku 25): nejde na ně útočit jinak než přidáním do bitvy, opevnit je ani na ně použít Ankh vzkříšení.
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
    update public.conquest_games set status = 'running', started_at = public.conquest_now(), ends_at = public.conquest_now() + make_interval(mins => public.conquest_minutes(g)),
        round_no = 0, round_at = null, round_prev_at = null
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
-- Konec hry v ends_at: pořadí podle bodů, při shodě dřív dosažené body; hráči bez bodů (bez území) podle toho, kdo vydržel déle (o poslední
-- území přišel později; blok 39). Jednou (další volání nic nezmění). Otevřené bitvy (blok 25) se napřed vyhodnotí s odpověďmi, které
-- do té doby přišly (kdo neodpověděl, prohrál).
create or replace function public.conquest_finish(gid uuid) returns void
language plpgsql set search_path = public as $$
declare g public.conquest_games; total integer;
begin
    select * into g from public.conquest_games where id = gid for update;
    if g.id is null or g.status <> 'running' or public.conquest_now() < g.ends_at then return; end if;
    if to_regprocedure('public.conquest_sieges_due(uuid, boolean)') is not null then perform public.conquest_sieges_due(gid, true); end if;
    update public.conquest_players pl set place = x.place from (
        select c.user_id, rank() over (order by c.score desc, case when c.score > 0 then c.score_at end nulls last,
            case when c.score = 0 then c.score_at end desc nulls last)::smallint as place from public.conquest_players c where c.game_id = gid
    ) x where pl.game_id = gid and pl.user_id = x.user_id;
    update public.conquest_games set status = 'finished' where id = gid;
    -- Pomůcka Ankh vzkříšení za započítanou hru s body (blok 39): stejné podmínky jako odměna v conquest_claim (aspoň 3 hráči nebo hra aspoň
    -- na den, aspoň 3 vlastní tahy a aspoň 1 bod), jednou za hru (klíč revive:<hra>); co hráč dostal, řekne conquest_claim (revive_item)
    if to_regprocedure('public.conquest_revive_shield()') is not null then
        select count(*) into total from public.conquest_players where game_id = gid;
        if total >= 3 or public.conquest_minutes(g) >= 24 * 60 then
            perform public.player_item_grant(c.user_id, 'revive', 'revive:' || gid, false) from public.conquest_players c
            where c.game_id = gid and c.score > 0 and not public.dev_is_bot(c.user_id)
                and (select count(*) from public.conquest_moves m where m.game_id = gid and m.user_id = c.user_id and m.kind in ('attack', 'fortify', 'defend')) >= 3;
        end if;
    end if;
    -- Pomůcka 50/50 za výhru (blok 30): vítěz (1. místo, ne bot) s aspoň 3 vlastními tahy, jednou za hru (klíč conquest:<hra>);
    -- co vítěz dostal, řekne conquest_claim
    if to_regprocedure('public.player_item_grant(uuid, text, text, boolean)') is not null then
        perform public.player_item_grant(c.user_id, 'fifty', 'conquest:' || gid, false) from public.conquest_players c
        where c.game_id = gid and c.place = 1 and not public.dev_is_bot(c.user_id)
            and (select count(*) from public.conquest_moves m where m.game_id = gid and m.user_id = c.user_id and m.kind in ('attack', 'fortify', 'defend')) >= 3;
    end if;
end;
$$;
-- Návrat do hry (do schématu 38): kdo v minulém období přišel o všechna území, dostal nové domovské území co nejdál od ostatních.
-- Od bloku 39 se nikdo (ani bot) nevrací sám: hráč bez území použije pomůcku Ankh vzkříšení (conquest_use_revive), jinak hru jen sleduje.
-- Funkce zůstává kvůli volání z conquest_housekeep a nic nedělá.
create or replace function public.conquest_respawn(gid uuid) returns void
language plpgsql set search_path = public as $$
begin
    return;
end;
$$;
-- Úklid hry: bitvy po termínu (blok 25), poslední kolo dohrané všemi = konec hry hned (blok 42, conquest_end_early), konec hry
-- (Návrat do hry do schématu 38)
create or replace function public.conquest_housekeep(gid uuid) returns void
language plpgsql set search_path = public as $$
begin
    if to_regprocedure('public.conquest_sieges_due(uuid, boolean)') is not null then perform public.conquest_sieges_due(gid, false); end if;
    if to_regprocedure('public.conquest_end_early(uuid)') is not null then perform public.conquest_end_early(gid); end if;
    perform public.conquest_finish(gid);
    perform public.conquest_respawn(gid);
end;
$$;
-- Tahy hráče v tomto období: základ + celé regiony + poklady dobyté v tomto období (i Ankhem vzkříšení na území s pokladem, blok 39) + kořist (domovská území soupeřů dobytá v minulém období)
-- + pevnost (fortress 1, když hráč drží domovské území opevněné na Pevnost; blok 25) − ztráta hradu (penalty 1, když hráči soupeř v minulém
-- období dobyl domovské území; blok 23) + extra (1, když hráč v tomto období použil pomůcku Tah navíc; blok 30); nikdy méně než 0.
-- Použité tahy (used) = zapsané útoky a opevnění období + reserved = účasti v otevřených bitvách přidaných v tomto období (blok 25;
-- po vyhodnocení bitvy je místo nich zapsaný tah téhož období).
-- period_ends_at = konec období (začátek dalšího kola, i předčasný, blok 26; nejpozději konec hry).
create or replace function public.conquest_budget(gid uuid, uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare g public.conquest_games; p integer; regions integer; treasures integer; loot integer; used integer; penalty integer; total integer;
    fortress integer; reserved integer := 0; extra integer;
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' then return null; end if;
    p := public.conquest_period(g);
    regions := public.conquest_regions_owned(gid, g.map, uid);
    select count(*) filter (where m.period = p and m.treasure and m.result in ('capture', 'respawn')),
           count(*) filter (where m.period = p - 1 and m.home and m.result = 'capture'),
           count(*) filter (where m.period = p and m.kind in ('attack', 'fortify', 'defend')),
           least(1, count(*) filter (where m.period = p and m.kind = 'extra'))
      into treasures, loot, used, extra
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
    total := greatest(0, g.actions + regions + treasures + loot + fortress + extra - penalty);
    return jsonb_build_object('period', p, 'base', g.actions, 'regions', regions, 'treasures', treasures, 'loot', loot, 'fortress', fortress, 'penalty', penalty,
        'extra', extra, 'used', used, 'reserved', reserved, 'total', total, 'left', greatest(0, total - used),
        'period_ends_at', public.conquest_period_end(g, p));
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
-- Souhrn hry: nastavení, hráči (veřejné údaje profilu, barva hry flag_color, znak, výplň území pattern z bloku 38, sada hradů castle z bloku 40,
-- připravenost, body, místo);
-- kód soukromé hry jen hráčům;
-- invited = čekající pozvaní přátelé (jen hráčům, conquest_invited_json). Délka hry: minutes u každé hry (blok 26), hours jen u her
-- na hodiny a dny (u rychlé hry na minuty null). Bot (blok 42) má u sebe bot = obtížnost ('easy', 'medium', 'hard'), člověk null;
-- xp_share = kolik procent XP hra dává (conquest_xp_share: s boty podle nejsilnějšího bota).
-- XP za hru s boty (blok 42): bez botů 100 %, nejsilnější bot Super Mudrlant 100 %, Mudrlant 50 %, jen Mudrlátka 20 %.
-- Bot bez obtížnosti (vývojářský bot ze starší databáze) se počítá jako Mudrlant.
create or replace function public.conquest_xp_share(gid uuid) returns integer
language sql stable set search_path = public as $$
    select case when not exists (select 1 from public.conquest_players c where c.game_id = gid and c.bot_level is not null) then 100
        when exists (select 1 from public.conquest_players c where c.game_id = gid and c.bot_level = 'hard') then 100
        when exists (select 1 from public.conquest_players c where c.game_id = gid and c.bot_level = 'medium') then 50
        else 20 end
$$;
create or replace function public.conquest_summary(g public.conquest_games, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', g.id, 'map', g.map, 'max_players', g.max_players, 'hours', g.duration_hours, 'minutes', public.conquest_minutes(g), 'period', g.period, 'actions', g.actions,
        'visibility', g.visibility, 'preset', g.preset, 'status', g.status, 'created_at', g.created_at, 'started_at', g.started_at, 'ends_at', g.ends_at,
        'mine', exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid), 'creator', g.creator is not null and g.creator = uid,
        'code', case when g.visibility = 'public' or exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid) then g.code end,
        'players', coalesce((select jsonb_agg(public.group_player_json(p) || jsonb_build_object('seat', c.seat, 'flag_color', c.color, 'emblem', c.emblem, 'pattern', c.pattern, 'castle', c.castle,
                'ready', c.ready, 'score', c.score, 'score_at', c.score_at, 'place', c.place, 'me', c.user_id = uid, 'bot', c.bot_level) order by c.seat)
            from public.conquest_players c join public.profiles p on p.id = c.user_id where c.game_id = g.id), '[]'::jsonb),
        'invited', public.conquest_invited_json(g, uid), 'xp_share', public.conquest_xp_share(g.id))
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
            insert into public.conquest_games (creator, map, max_players, duration_hours, duration_minutes, period, actions, visibility, code, preset, created_at)
            values (null, p.map, p.max_players, p.hours, p.minutes, p.period, p.actions, 'public', public.conquest_new_code(), p.preset, public.conquest_now());
        end if;
    end loop;
end;
$$;
-- Hry, ve kterých hráč je (rozehrané a otevřené), proti limitu 6
create or replace function public.conquest_active_count(uid uuid) returns integer
language sql stable set search_path = public as $$
    select count(*)::integer from public.conquest_players c join public.conquest_games g on g.id = c.game_id where c.user_id = uid and g.status in ('lobby', 'running')
$$;
-- Hráč do hry (zámek hry drží volající): nejnižší volné místo, kontrola barvy, znaku a výplně území (vzácný znak a výplň jen odemčené,
-- barevná výplň jen jednou ve hře; blok 38),
-- plná hra začne. Dřívější podoby bez vzoru a bez sady hradů se mažou (volání se čtyřmi parametry jde dál, vzor i hrad jsou pak null).
-- Sada hradů (castle_id, blok 40) jen odemčená (conquest_check_castle), ve hře ji může mít víc hráčů.
drop function if exists public.conquest_add_player(public.conquest_games, uuid, text, text);
drop function if exists public.conquest_add_player(public.conquest_games, uuid, text, text, text);
create or replace function public.conquest_add_player(g public.conquest_games, uid uuid, colour text, emblem_id text, pattern_id text default null, castle_id text default null) returns void
language plpgsql set search_path = public as $$
declare seat_no integer;
begin
    perform public.conquest_check_look(colour, emblem_id);
    if to_regprocedure('public.conquest_check_style(uuid, text, text)') is not null then perform public.conquest_check_style(uid, emblem_id, pattern_id);
    elsif pattern_id is not null or not (emblem_id = any (public.conquest_emblems())) then raise exception 'Vyber znak z nabídky.' using errcode = '22023'; end if;
    if to_regprocedure('public.conquest_check_castle(uuid, text)') is not null then perform public.conquest_check_castle(uid, castle_id);
    elsif castle_id is not null then raise exception 'Vyber hrad z nabídky.' using errcode = '22023'; end if;
    if (select count(*) from public.conquest_players where game_id = g.id) >= g.max_players then raise exception 'Hra je už plná.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.conquest_players where game_id = g.id and color = colour) then raise exception 'Tuhle barvu už má jiný hráč. Vyber jinou.' using errcode = '22023'; end if;
    if to_regprocedure('public.conquest_check_fill(uuid, uuid, text)') is not null then perform public.conquest_check_fill(g.id, uid, pattern_id); end if;
    if public.conquest_active_count(uid) >= 6 then raise exception 'Hrát můžeš nejvýš 6 her najednou. Nejdřív nějakou dohraj, nebo z lobby odejdi.' using errcode = 'P0001'; end if;
    select min(s) into seat_no from generate_series(0, 7) s where s not in (select c.seat from public.conquest_players c where c.game_id = g.id);
    insert into public.conquest_players (game_id, user_id, seat, color, emblem, pattern, castle, joined_at)
    values (g.id, uid, seat_no, colour, emblem_id, nullif(pattern_id, ''), nullif(castle_id, ''), public.conquest_now());
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
    -- Startovní Ankh vzkříšení (blok 39): jednou pro každého hráče
    if to_regprocedure('public.conquest_revive_starter(uuid)') is not null then perform public.conquest_revive_starter(uid); end if;
    return jsonb_build_object(
        -- Zásoba pomůcek (Tah navíc, 50/50; blok 30; Ankh vzkříšení, blok 39), dokud blok 30 neproběhl null
        'items', case when to_regprocedure('public.player_items_json(uuid)') is not null then public.player_items_json(uid) end,
        -- Výplně území a vzácné znaky (blok 38: co hráč má, nově odemčené, postup), dokud blok 38 neproběhl null
        'looks', case when to_regprocedure('public.conquest_looks_json(uuid)') is not null then public.conquest_looks_json(uid) end,
        'open', coalesce((select jsonb_agg(public.conquest_summary(x, uid) order by x.preset is null, (select count(*) from public.conquest_players c where c.game_id = x.id) desc, x.created_at desc)
            from public.conquest_games x where x.id in (select y.id from public.conquest_games y where y.status = 'lobby' and y.visibility = 'public'
                order by y.preset is null, y.created_at desc limit 40)), '[]'::jsonb),
        'mine', coalesce((select jsonb_agg(public.conquest_summary(g, uid) || jsonb_build_object('budget', public.conquest_budget(g.id, uid), 'claimed', c.claimed,
                'owners', case when g.status <> 'lobby' then (select jsonb_object_agg(t.territory, o.seat) from public.conquest_territories t join public.conquest_players o on o.game_id = t.game_id and o.user_id = t.owner where t.game_id = g.id) end,
                -- Pomník vítěze v náhledu dohrané hry (blok 41): domovské území hráče na 1. místě, pokud ho drží
                'monument', case when g.status = 'finished' then (select t.territory from public.conquest_territories t join public.conquest_players w on w.game_id = t.game_id and w.user_id = t.owner and w.place = 1
                    where t.game_id = g.id and t.home order by t.territory limit 1) end)
            order by case g.status when 'running' then 0 when 'lobby' then 1 else 2 end, g.ends_at, g.created_at desc)
            from public.conquest_games g join public.conquest_players c on c.game_id = g.id and c.user_id = uid
            where g.status in ('lobby', 'running') or (g.status = 'finished' and g.ends_at > public.conquest_now() - interval '7 days')), '[]'::jsonb));
end;
$$;

-- Založení hry: zakladatel je hned jejím hráčem. Období (per) den nebo hodina: délka v hodinách (hours); rychlá hra s obdobím 10 nebo
-- 5 minut (blok 26): délka v minutách (minutes, nepovinný parametr navíc, starší volání s osmi parametry funguje dál) a aspoň 3 kola.
-- Dřívější podoba s osmi parametry se maže, ať PostgREST volání se jmény parametrů nenajde dvě funkce.
-- Výplň území (pattern_id, blok 38) a sada hradů (castle_id, blok 40) jsou nepovinné poslední parametry; podoby bez nich se mažou stejně.
drop function if exists public.conquest_create(text, integer, integer, text, integer, text, text, text);
drop function if exists public.conquest_create(text, integer, integer, text, integer, text, text, text, integer);
drop function if exists public.conquest_create(text, integer, integer, text, integer, text, text, text, integer, text);
create or replace function public.conquest_create(map_id text, players integer, hours integer, per text, actions_per integer, vis text, colour text, emblem_id text,
    minutes integer default null, pattern_id text default null, castle_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m public.conquest_maps; g public.conquest_games; fast boolean := per in ('min10', 'min5');
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into m from public.conquest_maps where id = map_id;
    if m.id is null then raise exception 'Tahle mapa neexistuje.' using errcode = '22023'; end if;
    if players is null or players < 2 or players > m.max_players then raise exception 'Na mapě % může hrát 2 až % hráčů.', m.title, m.max_players using errcode = '22023'; end if;
    if per is null or per not in ('day', 'hour', 'min10', 'min5') then raise exception 'Kolo trvá den, hodinu, 10 minut, nebo 5 minut.' using errcode = '22023'; end if;
    if fast then
        if minutes is null or not (minutes = any (array[20, 30, 45, 60, 90, 120])) then raise exception 'Vyber délku hry z nabídky.' using errcode = '22023'; end if;
        if make_interval(mins => minutes) < 3 * public.conquest_period_length(per) then
            raise exception 'Hra musí mít aspoň 3 kola. Zvol delší hru, nebo kratší kolo.' using errcode = '22023';
        end if;
    elsif hours is null or not (hours = any (array[6, 12, 24, 48, 72, 120, 168])) then raise exception 'Vyber délku hry z nabídky.' using errcode = '22023';
    end if;
    if actions_per is null or actions_per < 1 or actions_per > 10 then raise exception 'Tahů za období může být 1 až 10.' using errcode = '22023'; end if;
    if vis is null or vis not in ('public', 'private') then raise exception 'Hra je veřejná, nebo soukromá.' using errcode = '22023'; end if;
    perform public.conquest_check_look(colour, emblem_id);
    perform pg_advisory_xact_lock(hashtext('conquest:' || uid::text));
    if (select count(*) from public.conquest_games x where x.creator = uid and x.status = 'lobby' and exists (select 1 from public.conquest_players c where c.game_id = x.id and c.user_id = uid)) >= 2 then
        raise exception 'Otevřené můžeš mít nejvýš 2 vlastní hry. Počkej, až některá začne, nebo z ní odejdi.' using errcode = 'P0001';
    end if;
    if public.conquest_active_count(uid) >= 6 then raise exception 'Hrát můžeš nejvýš 6 her najednou. Nejdřív nějakou dohraj, nebo z lobby odejdi.' using errcode = 'P0001'; end if;
    insert into public.conquest_games (creator, map, max_players, duration_hours, duration_minutes, period, actions, visibility, code, created_at)
    values (uid, m.id, players, case when fast then null else hours end, case when fast then minutes end, per, actions_per, vis, public.conquest_new_code(), public.conquest_now())
    returning * into g;
    perform public.conquest_add_player(g, uid, colour, emblem_id, pattern_id, castle_id);
    select * into g from public.conquest_games where id = g.id;
    return public.conquest_summary(g, uid);
end;
$$;

-- Přidání do hry: veřejné podle id, soukromé (i veřejné) kódem, soukromé i podle id, když má hráč čekající pozvánku (blok 24);
-- kdo už ve hře je, dostane souhrn beze změny. Přidáním pozvánka do hry zmizí (i odmítnutá). Výplň území (pattern_id, blok 38) a sada
-- hradů (castle_id, blok 40) nepovinné.
drop function if exists public.conquest_join(uuid, text, text, text);
drop function if exists public.conquest_join(uuid, text, text, text, text);
create or replace function public.conquest_join(game uuid, join_code text, colour text, emblem_id text, pattern_id text default null, castle_id text default null) returns jsonb
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
    perform public.conquest_add_player(g, uid, colour, emblem_id, pattern_id, castle_id);
    if invites then delete from public.conquest_invites where game_id = g.id and user_id = uid; end if;
    select * into g from public.conquest_games where id = g.id;
    return public.conquest_summary(g, uid);
end;
$$;

-- Jiná barva, znak, výplň území nebo sada hradů (jen před začátkem hry; výplň null = jen barva, barevná výplň jen jednou ve hře; blok 38;
-- hrad null = základní, blok 40)
drop function if exists public.conquest_set_look(uuid, text, text);
drop function if exists public.conquest_set_look(uuid, text, text, text);
create or replace function public.conquest_set_look(game uuid, colour text, emblem_id text, pattern_id text default null, castle_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.conquest_check_look(colour, emblem_id);
    if to_regprocedure('public.conquest_check_style(uuid, text, text)') is not null then perform public.conquest_check_style(uid, emblem_id, pattern_id);
    elsif pattern_id is not null or not (emblem_id = any (public.conquest_emblems())) then raise exception 'Vyber znak z nabídky.' using errcode = '22023'; end if;
    if to_regprocedure('public.conquest_check_castle(uuid, text)') is not null then perform public.conquest_check_castle(uid, castle_id);
    elsif castle_id is not null then raise exception 'Vyber hrad z nabídky.' using errcode = '22023'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid) then raise exception 'Tuhle hru nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'lobby' then raise exception 'Barvu a znak jde změnit jen před začátkem hry.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.conquest_players p where p.game_id = game and p.color = colour and p.user_id <> uid) then raise exception 'Tuhle barvu už má jiný hráč. Vyber jinou.' using errcode = '22023'; end if;
    if to_regprocedure('public.conquest_check_fill(uuid, uuid, text)') is not null then perform public.conquest_check_fill(game, uid, pattern_id); end if;
    update public.conquest_players set color = colour, emblem = emblem_id, pattern = nullif(pattern_id, ''), castle = nullif(castle_id, '') where game_id = game and user_id = uid;
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

-- Odchod z lobby (rozehranou hru opustit nejde); prázdná vlastní hra zmizí (i když v ní zůstali jen boti, blok 42), Rychlá hra zůstane otevřená
create or replace function public.conquest_leave(game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid) then raise exception 'Tuhle hru nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'lobby' then raise exception 'Rozehranou hru opustit nejde.' using errcode = 'P0001'; end if;
    delete from public.conquest_players where game_id = game and user_id = uid;
    if g.preset is null and not exists (select 1 from public.conquest_players where game_id = game and bot_level is null) then delete from public.conquest_games where id = game; end if;
end;
$$;

-- Stav hry: souhrn; hráčům rozehrané nebo dohrané hry navíc území (t, o = majitel, l = úroveň, h = domov, p = poklad), moje tahy
-- v období, posledních 150 událostí pro kroniku, po konci všechny změny majitelů pro přehrání (nejvýš 3000), otevřené bitvy (sieges)
-- a značka verze (version) jako conquest_pulse (blok 25), kolo (round: conquest_round_json, blok 26; u hry, která neběží, null)
-- a moje pomůcky v této hře (items: conquest_items_json, blok 30). Území chráněné po Ankhu vzkříšení (blok 39) má navíc s = do kdy (jen dokud
-- ochrana trvá). Hráč běžící hry dostane při čtení stavu jednou startovní Ankh vzkříšení (conquest_revive_starter, blok 39).
create or replace function public.conquest_move_json(m public.conquest_moves) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', m.id, 'u', m.user_id, 'k', m.kind, 't', m.territory, 's', m.source, 'ok', m.success, 'r', m.result, 'v', m.victim,
        'l', m.level, 'p', m.treasure, 'h', m.home, 'n', m.period, 'at', m.at, 'b', m.building)
$$;
create or replace function public.conquest_state(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; member boolean; sieges jsonb := '[]'::jsonb; ver text; round_info jsonb; items jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game;
    member := g.id is not null and exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid);
    if g.id is null or (not member and not (g.status = 'lobby' and g.visibility = 'public')) then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if g.status = 'running' then
        perform public.conquest_housekeep(game);
        -- boti (blok 42) odehrají, co jim podle rozvrhu kola patří (když lidé dohráli kolo, hned všechno)
        if member then perform public.conquest_bots_due(game); end if;
        select * into g from public.conquest_games where id = game;
        if member and to_regprocedure('public.conquest_revive_starter(uuid)') is not null then perform public.conquest_revive_starter(uid); end if;
    end if;
    if g.status = 'lobby' or not member then return public.conquest_summary(g, uid) || jsonb_build_object('now', public.conquest_now()); end if;
    if to_regprocedure('public.conquest_sieges_json(uuid, uuid)') is not null then
        sieges := public.conquest_sieges_json(game, uid);
        ver := public.conquest_version(g);
    end if;
    if to_regprocedure('public.conquest_round_json(public.conquest_games, uuid)') is not null then round_info := public.conquest_round_json(g, uid); end if;
    if to_regprocedure('public.conquest_items_json(public.conquest_games, uuid)') is not null then items := public.conquest_items_json(g, uid); end if;
    return public.conquest_summary(g, uid) || jsonb_build_object(
        'now', public.conquest_now(),
        'sieges', sieges,
        'version', ver,
        'round', round_info,
        'items', items,
        'territories', coalesce((select jsonb_agg(jsonb_build_object('t', t.territory, 'o', t.owner, 'l', t.level, 'h', t.home, 'p', t.treasure, 'b', t.building)
                || case when t.shield_until > public.conquest_now() and g.status = 'running' then jsonb_build_object('s', t.shield_until) else '{}'::jsonb end order by t.territory)
            from public.conquest_territories t where t.game_id = game), '[]'::jsonb),
        'budget', public.conquest_budget(game, uid),
        -- Kolik tahů zbývá v tomto kole každému hráči (pořadí u mapy ukazuje „3/5“; schéma 27) a jestli v něm má Tah navíc (extra 0/1,
        -- blok 30): { id hráče: { left, total, extra } }
        'budgets', case when g.status = 'running' then coalesce((select jsonb_object_agg(p.user_id, jsonb_build_object('left', (x.b ->> 'left')::integer, 'total', (x.b ->> 'total')::integer,
                'extra', coalesce((x.b ->> 'extra')::integer, 0)))
            from public.conquest_players p cross join lateral (select public.conquest_budget(game, p.user_id) b) x where p.game_id = game), '{}'::jsonb) end,
        'claimed', (select p.claimed from public.conquest_players p where p.game_id = game and p.user_id = uid),
        'moves', coalesce((select jsonb_agg(public.conquest_move_json(m) order by m.id) from (select * from public.conquest_moves where game_id = game order by id desc limit 150) m), '[]'::jsonb),
        'history', case when g.status = 'finished' then coalesce((select jsonb_agg(public.conquest_move_json(m) order by m.id)
            from (select * from public.conquest_moves where game_id = game and result in ('home', 'respawn', 'capture') order by id limit 3000) m), '[]'::jsonb) end);
end;
$$;

-- Smí hráč uid zaútočit na území target (z území src, nepovinné)? Ne na vlastní, jen na sousední s vlastním a src musí být jeho sousední,
-- a ne na území chráněné po Ankhu vzkříšení (blok 39: 60 s od Ankh vzkříšení, shield_until). Jinak vyhodí českou chybu. Zámek hry drží volající
-- (conquest_move_by, conquest_siege_begin, conquest_siege_join).
create or replace function public.conquest_attack_check(g public.conquest_games, uid uuid, target text, src text) returns void
language plpgsql stable set search_path = public as $$
declare shield timestamptz;
begin
    if exists (select 1 from public.conquest_territories t where t.game_id = g.id and t.territory = target and t.owner = uid) then
        raise exception 'Na vlastní území útočit nejde.' using errcode = '22023';
    end if;
    select t.shield_until into shield from public.conquest_territories t where t.game_id = g.id and t.territory = target and t.owner is not null;
    if shield > public.conquest_now() then
        raise exception 'Území je chráněné po vzkříšení ještě % s.', greatest(1, ceil(extract(epoch from (shield - public.conquest_now()))))::integer using errcode = 'P0001';
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
-- Účinek útoku (zámek hry a kontrolu drží volající): správně = dobytí neopevněného území (poklad, domov soupeře, poslední území soupeře, body),
-- nebo pobourání opevnění o úroveň; špatně nic. Zapíše tah útoku (p = období tahu; u bitvy období, kdy se hráč přidal) a vrací ho.
-- Volá ho tah hráče (conquest_move_by) i vyhodnocení bitvy pro vítěze (conquest_siege_resolve, blok 25).
create or replace function public.conquest_attack_apply(gid uuid, uid uuid, target text, src text, p integer, is_correct boolean) returns public.conquest_moves
language plpgsql set search_path = public as $$
declare g public.conquest_games; t public.conquest_territories; victim uuid; res text; lvl integer; took_home boolean := false; took_treasure boolean := false;
    mv public.conquest_moves; fell text;
begin
    select * into t from public.conquest_territories where game_id = gid and territory = target for update;
    victim := t.owner;
    lvl := t.level;
    if not is_correct then res := 'fail';
    elsif t.level > 0 then
        res := 'breach'; lvl := t.level - 1;
        -- Poslední opevnění mimo domov padlo: území je bez stavby (na mapě Zřícenina do konce kola, blok 41)
        if lvl = 0 and not t.home then fell := 'wall'; end if;
        update public.conquest_territories set level = lvl, building = case when lvl = 0 then null else building end where game_id = gid and territory = target;
    else
        res := 'capture'; took_home := t.home and t.owner is not null; took_treasure := t.treasure;
        -- Strážní věž dobytím padne, důl zůstane dobyvateli (blok 41)
        fell := case when t.building in ('tower', 'mine') then t.building end;
        update public.conquest_territories set owner = uid, level = 0, home = false, treasure = false, captured_at = public.conquest_now(), shield_until = null,
            building = case when building = 'mine' then 'mine' end
        where game_id = gid and territory = target;
        -- Kdo přišel o všechna území: období, kdy padlo poslední (do schématu 38 v dalším dostal nové; od bloku 39 jen záznam)
        if victim is not null and not exists (select 1 from public.conquest_territories x where x.game_id = gid and x.owner = victim) then
            select * into g from public.conquest_games where id = gid;
            update public.conquest_players set lost_period = public.conquest_period(g) where game_id = gid and user_id = victim;
        end if;
        perform public.conquest_rescore(gid, uid);
        perform public.conquest_rescore(gid, victim);
    end if;
    insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at, building)
    values (gid, uid, p, 'attack', target, src, is_correct, res, victim, lvl, took_treasure, took_home, public.conquest_now(), fell)
    returning * into mv;
    return mv;
end;
$$;
-- Tah: útok (na území sousedící s vlastním; source = vlastní území, odkud útok vede, nepovinné) nebo stavba na vlastním území (blok 41,
-- move_kind 'fortify' = opevnění o úroveň, 'tower' = strážní věž, 'mine' = důl; zapíše se jako tah fortify se stavbou v building).
-- Mimo domov stojí na území nejvýš jedna stavba: opevnit jde území bez stavby nebo s opevněním, věž a důl jen území bez stavby
-- (jsou jednoúrovňové); domovský hrad se jen opevňuje (až na Pevnost).
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
    if move_kind is null or move_kind not in ('attack', 'fortify', 'tower', 'mine') or is_correct is null then raise exception 'Neplatný tah.' using errcode = '22023'; end if;
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
    if t.owner is distinct from uid then
        raise exception '%', case when move_kind = 'fortify' then 'Opevnit jde jen vlastní území.' else 'Stavět jde jen na vlastním území.' end using errcode = '22023';
    end if;
    if besieged then
        raise exception '%', case when move_kind = 'fortify' then 'Obléhané území teď nejde opevnit.' else 'Na obléhaném území teď stavět nejde.' end using errcode = 'P0001';
    end if;
    if move_kind in ('tower', 'mine') then
        if t.home then raise exception 'Na domovském hradu jde jen opevnění.' using errcode = '22023'; end if;
        if t.building is not null then raise exception 'Na území už stojí stavba. Na jedno území patří jen jedna.' using errcode = '22023'; end if;
        if is_correct then
            update public.conquest_territories set building = move_kind where game_id = game and territory = target;
            if move_kind = 'mine' then perform public.conquest_rescore(game, uid); end if;
        end if;
        insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at, building)
        values (game, uid, p, 'fortify', target, null, is_correct, case when is_correct then 'fortify' else 'fail' end, null, 0, false, false, public.conquest_now(), move_kind)
        returning * into mv;
        return mv;
    end if;
    if t.building in ('tower', 'mine') then raise exception 'Na území už stojí stavba. Opevnit jde jen území bez stavby.' using errcode = '22023'; end if;
    if t.level >= (case when t.home then 3 else 2 end) then raise exception 'Tohle území už je opevněné naplno.' using errcode = '22023'; end if;
    lvl := t.level;
    if is_correct then
        lvl := t.level + 1;
        update public.conquest_territories set level = lvl, building = case when home then null else 'wall' end where game_id = game and territory = target;
    end if;
    insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at, building)
    values (game, uid, p, 'fortify', target, null, is_correct, case when is_correct then 'fortify' else 'fail' end, null, lvl, false, false, public.conquest_now(),
        case when t.home then null else 'wall' end)
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
-- a aspoň 1 bod). claimed_now je true jen jednou: jen tehdy si aplikace odměnu připíše (conquest.js rewardFor) a jen tehdy item = pomůcka
-- 50/50 za výhru (blok 30: { kind, granted, full, count, max }; full = zásoba už byla plná), jinak bez item. looks = vzory a znaky
-- (blok 38, conquest_looks_json: i nově odemčené touto hrou), dokud blok 38 neproběhl bez looks. revive_item = pomůcka Ankh vzkříšení
-- za započítanou hru s body (blok 39, klíč revive:<hra>; stejný tvar jako item), jen s claimed_now. xp_share = kolik procent XP
-- (blok 42: hra s boty podle nejsilnějšího bota, conquest_xp_share); aplikace jím XP za místo vynásobí. Boti se do „aspoň 3 hráčů“ počítají.
create or replace function public.conquest_claim(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; me public.conquest_players; total integer; moves integer; eligible boolean; fresh boolean; item jsonb;
    revive_item jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform public.conquest_finish(game);
    select * into g from public.conquest_games where id = game;
    select * into me from public.conquest_players where game_id = game and user_id = uid for update;
    if g.id is null or me.user_id is null then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if g.status <> 'finished' then raise exception 'Hra ještě neskončila.' using errcode = 'P0001'; end if;
    select count(*) into total from public.conquest_players where game_id = game;
    select count(*) into moves from public.conquest_moves where game_id = game and user_id = uid and kind in ('attack', 'fortify', 'defend');
    eligible := (total >= 3 or public.conquest_minutes(g) >= 24 * 60) and moves >= 3 and me.score > 0;
    fresh := not me.claimed;
    if fresh then update public.conquest_players set claimed = true where game_id = game and user_id = uid; end if;
    if fresh and to_regclass('public.player_item_grants') is not null then
        select jsonb_build_object('kind', x.kind, 'granted', x.granted, 'full', not x.granted,
                'count', coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = x.kind), 0), 'max', public.player_item_cap(x.kind))
            into item from public.player_item_grants x where x.user_id = uid and x.key = 'conquest:' || game;
        select jsonb_build_object('kind', x.kind, 'granted', x.granted, 'full', not x.granted,
                'count', coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = x.kind), 0), 'max', public.player_item_cap(x.kind))
            into revive_item from public.player_item_grants x where x.user_id = uid and x.key = 'revive:' || game;
    end if;
    return jsonb_build_object('place', me.place, 'players', total, 'score', me.score, 'moves', moves, 'eligible', eligible, 'claimed_now', fresh,
            'xp_share', public.conquest_xp_share(game))
        || case when item is not null then jsonb_build_object('item', item) else '{}'::jsonb end
        || case when revive_item is not null then jsonb_build_object('revive_item', revive_item) else '{}'::jsonb end
        || case when to_regprocedure('public.conquest_looks_json(uuid)') is not null then jsonb_build_object('looks', public.conquest_looks_json(uid)) else '{}'::jsonb end;
end;
$$;

-- Oprávnění: hráč volá jen funkce hry (anon nic); pomocné funkce zvenčí nikdo, conquest_is_player a conquest_is_open jen kvůli pravidlům řádků
revoke all on function public.conquest_now(), public.conquest_colors(), public.conquest_emblems(), public.conquest_presets(), public.conquest_check_look(text, text),
    public.conquest_new_code(), public.conquest_period_length(text), public.conquest_period(public.conquest_games), public.conquest_regions_owned(uuid, text, uuid),
    public.conquest_minutes(public.conquest_games), public.conquest_period_start(public.conquest_games, integer), public.conquest_period_end(public.conquest_games, integer),
    public.conquest_rescore(uuid, uuid), public.conquest_far_territory(uuid, text), public.conquest_start(uuid), public.conquest_finish(uuid), public.conquest_respawn(uuid),
    public.conquest_housekeep(uuid), public.conquest_budget(uuid, uuid), public.conquest_invited_json(public.conquest_games, uuid), public.conquest_summary(public.conquest_games, uuid), public.conquest_ensure_lobbies(),
    public.conquest_active_count(uuid), public.conquest_add_player(public.conquest_games, uuid, text, text, text, text), public.conquest_move_json(public.conquest_moves),
    public.conquest_besieged(uuid), public.conquest_attack_check(public.conquest_games, uuid, text, text), public.conquest_attack_apply(uuid, uuid, text, text, integer, boolean),
    public.conquest_xp_share(uuid)
    from public, anon, authenticated;
revoke all on function public.conquest_is_player(uuid), public.conquest_is_open(uuid), public.conquest_lobby(), public.conquest_create(text, integer, integer, text, integer, text, text, text, integer, text, text),
    public.conquest_join(uuid, text, text, text, text, text), public.conquest_set_look(uuid, text, text, text, text), public.conquest_ready(uuid, boolean), public.conquest_leave(uuid),
    public.conquest_state(uuid), public.conquest_move(uuid, text, text, boolean, text), public.conquest_claim(uuid) from public, anon;
grant execute on function public.conquest_is_player(uuid), public.conquest_is_open(uuid), public.conquest_lobby(), public.conquest_create(text, integer, integer, text, integer, text, text, text, integer, text, text),
    public.conquest_join(uuid, text, text, text, text, text), public.conquest_set_look(uuid, text, text, text, text), public.conquest_ready(uuid, boolean), public.conquest_leave(uuid),
    public.conquest_state(uuid), public.conquest_move(uuid, text, text, boolean, text), public.conquest_claim(uuid) to authenticated;
-- ===== 21: Dobývání — KONEC BLOKU =====

-- ===== 22: Vývojářští boti v Dobývání =====
-- Boti jsou stejní jako v turnajích: řádky v auth.users s e-mailem bot…@bots.invalid (dev_is_bot). Vývojářské nástroje níž pouští jen
-- účet z dev_admins a jen ve hře, kterou sám hraje: boty do lobby přidá dev_conquest_add_bots (od bloku 42 v bloku 42, Mudrlanti),
-- popohnat je jde dev_conquest_bots_play (hned všechny tahy období) a hru posunout o období dev_conquest_next_period.
-- Jak boti hrají (obtížnost, rozložení tahů do kola, bitvy, obrana), je od bloku 42 v bloku 42 (docs/DOBYVANI-BOTI.md).
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
-- Vývojář: skok na další období (začátek i konec hry a začátky kol po předčasném začátku, blok 26, se posunou o jedno období dozadu,
-- takže hra je o období dál a o období kratší; běžící odpočet do dalšího kola tím skončí); pak se hra uklidí (bitvy, konec hry)
-- a boti odehrají, co jim v novém období patří. Vrací stav hry.
create or replace function public.dev_conquest_next_period(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.conquest_games;
begin
    g := public.dev_conquest_check(game);
    if g.status <> 'running' then raise exception 'Hra neběží.' using errcode = 'P0001'; end if;
    update public.conquest_games set started_at = started_at - public.conquest_period_length(period), ends_at = ends_at - public.conquest_period_length(period),
        round_at = round_at - public.conquest_period_length(period), round_prev_at = round_prev_at - public.conquest_period_length(period),
        round_rev = round_rev + 1
    where id = game;
    perform public.conquest_housekeep(game);
    return public.conquest_state(game);
end;
$$;
revoke all on function public.conquest_move_by(uuid, uuid, text, text, boolean, text), public.dev_conquest_check(uuid) from public, anon, authenticated;
revoke all on function public.dev_conquest_bots_play(uuid), public.dev_conquest_next_period(uuid) from public, anon;
grant execute on function public.dev_conquest_bots_play(uuid), public.dev_conquest_next_period(uuid) to authenticated;
-- ===== 22: Vývojářští boti v Dobývání — KONEC BLOKU =====

-- ===== Řetězovka dne (blok 21) — ZAČÁTEK BLOKU =====
-- Každý den (pražský čas) stejný řetěz sedmi otázek pro všechny: odpověď na jednu je začátkem další (chain.js ho sestaví z dat témat,
-- server otázky nezná). Článek k dává k bodů (celý řetěz 28), špatná odpověď řetěz přetrhne, jednou za hru Záchrana (jiná otázka na stejný
-- článek za 0 bodů). Jeden řádek na hráče a den: první odeslaný výsledek platí, další se jen vrátí. Body a články musí sedět: bez Záchrany
-- přesně 1 + 2 + … + články, se Záchranou o jeden zachráněný článek méně (nebo stejně, když Záchrana nevyšla), s pomůckou Záchrana navíc
-- (blok 37, extra_rescue: použitá ten den přes chain_use_rescue) o dva zachráněné články méně. Tabulku hráč jen čte
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
-- Hráč ten den použil pomůcku Záchrana navíc (blok 37): druhý zachráněný článek
alter table public.chain_results add column if not exists extra_rescue boolean not null default false;
alter table public.chain_results drop constraint if exists chain_results_values;
alter table public.chain_results add constraint chain_results_values check (
    links between 0 and 7 and score between 0 and 28
    and ((not rescued and not extra_rescue and score = links * (links + 1) / 2)
        or (rescued and score between links * (links + 1) / 2 - case when extra_rescue then greatest(links, 2 * links - 1) else links end and links * (links + 1) / 2)));
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

-- Výsledek a místo hráče v pořadí dne jako JSON (místo = počet lepších + 1, stejné body = stejné místo); extra: true jen s použitou
-- Záchranou navíc (blok 37)
create or replace function public.chain_json(r public.chain_results) returns jsonb
language sql stable set search_path = public as $$
    select case when r.user_id is null then null else jsonb_build_object('day', r.day, 'links', r.links, 'score', r.score, 'rescued', r.rescued,
        'rank', 1 + (select count(*) from public.chain_results o where o.day = r.day and o.score > r.score))
        || case when r.extra_rescue then jsonb_build_object('extra', true) else '{}'::jsonb end end
$$;

-- Výsledek dne: for_day = den řetězu (dnešek, nebo včerejšek, když se hra dohrála těsně před půlnocí a odesílá se až po ní).
-- Odeslání podruhé (jiné zařízení, ztracená odpověď) nic nezmění a vrátí uložený výsledek. Nově uložený celý řetěz (7 článků) dá pomůcku
-- 50/50 do Dobývání, nejvýš jednou za ISO týden (blok 30, klíč chain:<RRRR-Wtt>; s plnou zásobou se zkusí znovu): výsledek má navíc item.
-- Záchrana navíc (blok 37): druhý zachráněný článek (body o dva články méně) projde, jen když ji hráč ten den opravdu použil (player_item_uses,
-- klíč chain:<den>); starší aplikace posílá stejné čtyři údaje a dva zachráněné články nikdy nemá. Nově uložený výsledek, který dorovná
-- milník Řetězovky (dohrané dny 10, 30, 100, 365; celé řetězy bez Záchrany 5, 15, 30, 60), dá Záchranu navíc: výsledek má rescue_item.
create or replace function public.chain_submit(for_day date, links integer, score integer, rescued boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.chain_today(); r public.chain_results; tri integer; fresh boolean := false; item jsonb; rescue_item jsonb;
    extra boolean := false;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if for_day is null or for_day > d or for_day < d - 1 then raise exception 'Tahle Řetězovka už skončila.' using errcode = '22023'; end if;
    if links is null or score is null or rescued is null or links < 0 or links > 7 then raise exception 'Neplatný výsledek.' using errcode = '22023'; end if;
    tri := links * (links + 1) / 2;
    if rescued and to_regclass('public.player_item_uses') is not null then
        extra := exists (select 1 from public.player_item_uses u where u.user_id = uid and u.key = 'chain:' || for_day);
    end if;
    if (not rescued and score <> tri) or (rescued and (score > tri or score < tri - case when extra then greatest(links, 2 * links - 1) else links end)) then
        raise exception 'Neplatný výsledek.' using errcode = '22023';
    end if;
    insert into public.chain_results (day, user_id, links, score, rescued, extra_rescue) values (for_day, uid, links, score, rescued, extra)
    on conflict (user_id, day) do nothing
    returning true into fresh;
    select * into r from public.chain_results c where c.user_id = uid and c.day = for_day;
    if coalesce(fresh, false) and r.links = 7 and to_regprocedure('public.player_item_grant(uuid, text, text, boolean)') is not null then
        item := public.player_item_grant(uid, 'fifty', 'chain:' || public.player_items_week(for_day), true);
    end if;
    if coalesce(fresh, false) and to_regprocedure('public.chain_rescue_milestone(uuid)') is not null then
        rescue_item := public.chain_rescue_milestone(uid);
    end if;
    return public.chain_json(r) || case when item is not null then jsonb_build_object('item', item) else '{}'::jsonb end
        || case when rescue_item is not null then jsonb_build_object('rescue_item', rescue_item) else '{}'::jsonb end;
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
                'frame', p.frame, 'title_pref', p.title_pref, 'owl', p.owl, 'prestige', p.prestige, 'links', k.links, 'score', k.score, 'rescued', k.rescued, 'me', k.user_id = uid) order by k.pos)
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
-- a jen čerstvé: ve hře s obdobím hodina 2 hodiny, v rychlé hře s kolem 10 nebo 5 minut (blok 26) 30 minut, s obdobím den 12 hodin
-- (útoky z nočního klidu tak přijdou ráno); v rychlé hře texty mluví o dalším kole místo dalšího období. Upozornění z Dobývání
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
            case when g.period in ('min10', 'min5') then 'V dalším kole' else 'V dalším období' end as next_round,
            case when m.result = 'capture' and m.home then 4 when m.result = 'capture' then 3 when m.result = 'breach' then 2 else 1 end as severity
        from public.conquest_moves m
        join public.conquest_games g on g.id = m.game_id and g.status = 'running'
        join public.profiles me on me.id = m.victim and me.push_conquest
        left join sent s on s.user_id = m.victim and s.game = m.game_id::text
        where m.kind = 'attack' and m.victim is not null and m.at > now() - interval '12 hours'
            and m.at > now() - case g.period when 'hour' then interval '2 hours' when 'min10' then interval '30 minutes' when 'min5' then interval '30 minutes'
                else interval '12 hours' end
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
            when r.severity = 4 and not x.landed then 'Všechna tvá území padla. Vrátit se můžeš pomůckou Ankh vzkříšení.'
            when r.severity = 4 then r.next_round || ' máš o tah méně. Opevni se, nebo vrať úder.'
            when r.severity = 3 and not x.landed then 'Všechna tvá území padla. Vrátit se můžeš pomůckou Ankh vzkříšení.'
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

-- Délka hry do upozornění („hra na 12 hodin“, „na 1 den“, „na 3 dny“, „na 7 dní“; rychlá hra na minuty, blok 26: „na 20 minut“)
create or replace function public.conquest_push_length(hours integer) returns text
language sql immutable as $$
    select case when hours < 24 then hours || ' hodin' when hours / 24 = 1 then '1 den' when hours / 24 between 2 and 4 then (hours / 24) || ' dny' else (hours / 24) || ' dní' end
$$;

-- Upozornění na pozvánky (řádky ve tvaru položek push_pending); volá ho jen push_pending. Bez rodu: „X tě zve do hry“.
create or replace function public.conquest_invite_push_items() returns table (user_id uuid, kind text, title text, body text, url text, dedupe_key text, sort_at text)
language sql stable set search_path = public as $$
    select i.user_id, 'conquest_invite'::text,
        'Dobývání: ' || coalesce(nullif(btrim(a.display_name), ''), 'Kamarád') || ' tě zve do hry',
        'Mapa ' || m.title || ' · hra na ' || coalesce(g.duration_minutes || ' minut', public.conquest_push_length(g.duration_hours)) || '. Vyber si barvu a přidej se.',
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
-- boti obléhaná území vynechají a Ankh vzkříšení (blok 39) je nedovolí. Tabulky bitev nikdo nečte ani nepíše přímo, jen přes funkce níže (správná
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
    and (outcome is null or outcome in ('capture', 'breach', 'fail', 'repel')) and ((status = 'open') = (resolved_at is null)));
-- Na území je nejvýš jedna otevřená bitva (index slouží i dotazům na otevřené bitvy hry)
create unique index if not exists conquest_sieges_open_key on public.conquest_sieges (game_id, territory) where status = 'open';
create index if not exists conquest_sieges_game_idx on public.conquest_sieges (game_id, started_at desc);
-- Bitva, kterou začal bot (blok 42): server otázku nezná (otázky skládá aplikace), uloží zástupnou a needs_question = true; první člověk,
-- který se přidá, pošle otázku s sebou (conquest_siege_join: question, correct) a ta pak platí pro všechny. Sloupec je tady, protože ho čte
-- conquest_siege_json (SQL se kontroluje hned).
alter table public.conquest_sieges add column if not exists needs_question boolean not null default false;
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
-- Pomůcka 50/50 (blok 30): dvě nesprávné možnosti, které server účastníkovi odebral (indexy), jinak null; že ji použil, vidí všichni účastníci
alter table public.conquest_siege_players add column if not exists fifty smallint[];
-- Obránce (blok 41): majitel území se strážní věží, který se do bitvy přidal bránit (bez sousedství a bez území útoku)
alter table public.conquest_siege_players add column if not exists defender boolean not null default false;
alter table public.conquest_siege_players drop constraint if exists conquest_siege_players_values;
alter table public.conquest_siege_players add constraint conquest_siege_players_values check ((result is null or result in ('capture', 'breach', 'fail', 'outrun', 'repel'))
    and (fifty is null or cardinality(fifty) = 2));
create index if not exists conquest_siege_players_user_idx on public.conquest_siege_players (user_id);
alter table public.conquest_sieges enable row level security;
alter table public.conquest_siege_players enable row level security;
revoke all on public.conquest_sieges, public.conquest_siege_players from public, anon, authenticated;

-- Čas na odpověď (60 s) a rezerva na síť (3 s)
create or replace function public.conquest_siege_window() returns interval
language sql immutable as $$ select interval '60 seconds' $$;
create or replace function public.conquest_siege_grace() returns interval
language sql immutable as $$ select interval '3 seconds' $$;
-- Do kdy se může bránit majitel území se strážní věží (blok 41, od bloku 42 kratší) a jak dlouho na něj bitva počká: v rychlé hře
-- (kolo 5 nebo 10 minut) 15 s od začátku útoku, jinak 30 s; nejpozději do join_until
create or replace function public.conquest_siege_defend_wait(per text) returns interval
language sql immutable as $$ select case when per in ('min5', 'min10') then interval '15 seconds' else interval '30 seconds' end $$;
create or replace function public.conquest_siege_defend_until(s public.conquest_sieges) returns timestamptz
language sql stable set search_path = public as $$
    select least(s.join_until, s.started_at + public.conquest_siege_defend_wait((select g.period from public.conquest_games g where g.id = s.game_id)))
$$;

-- Značka verze hry pro conquest_pulse a conquest_state: nejvyšší id tahu, počítadlo změn bitev, počítadlo „Chci další kolo“ (round_rev),
-- číslo kola u běžící hry (blok 26) a stav hry („812.14.3.5.running“). Když se změní, aplikace si načte celý stav (conquest_state).
create or replace function public.conquest_version(g public.conquest_games) returns text
language sql stable set search_path = public as $$
    select coalesce((select max(m.id) from public.conquest_moves m where m.game_id = g.id), 0) || '.' || g.siege_rev || '.' || g.round_rev
        || '.' || case when g.status = 'running' then public.conquest_period(g) else 0 end || '.' || g.status
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

-- Bitva pro hráče uid (veřejné údaje, bez otázky): území, stav, termíny (join_until, ends_at, defend_until = do kdy se může bránit majitel
-- se strážní věží, blok 42), needs_question (bitva bota zatím bez otázky: kdo se přidá, pošle ji), vítěz a výsledek bitvy (outcome);
-- účastníci podle přidání s veřejnými údaji profilu (jako group_player_json), barvou hry (flag_color), znakem, územím útoku, kdy se přidali,
-- svým termínem, jestli už odpověděli a jestli použili pomůcku 50/50 (fifty, blok 30; které možnosti zmizely, vidí jen on sám) –
-- po vyhodnocení i správnost, čas odpovědi (answer_ms), výsledek (result), vítěz a id zapsaného tahu; u volajícího mine, answered, joined_at a deadline.
create or replace function public.conquest_siege_json(s public.conquest_sieges, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('id', s.id, 'game', s.game_id, 'territory', s.territory, 'status', s.status, 'started_by', s.started_by,
        'started_at', s.started_at, 'join_until', s.join_until, 'ends_at', s.ends_at, 'resolved_at', s.resolved_at, 'winner', s.winner, 'outcome', s.outcome,
        'mine', me.user_id is not null, 'answered', me.answered_at is not null, 'joined_at', me.joined_at, 'deadline', me.joined_at + public.conquest_siege_window(),
        'defend_until', public.conquest_siege_defend_until(s), 'needs_question', s.needs_question,
        'participants', coalesce((select jsonb_agg(public.group_player_json(p) || jsonb_build_object('seat', c.seat, 'flag_color', c.color, 'emblem', c.emblem,
                'source', sp.source, 'joined_at', sp.joined_at, 'deadline', sp.joined_at + public.conquest_siege_window(), 'answered', sp.answered_at is not null,
                'fifty', sp.fifty is not null, 'defender', sp.defender, 'me', sp.user_id = uid, 'bot', c.bot_level)
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
-- correct, answer_ms, late), můj výsledek a tah po vyhodnocení (result, move), index správné možnosti (correct_choice), až když jsem
-- odpověděl nebo je bitva vyhodnocená, a možnosti odebrané pomůckou 50/50 (removed, blok 30; jinak null)
create or replace function public.conquest_siege_view(s public.conquest_sieges, uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select public.conquest_siege_json(s, uid) || jsonb_build_object('now', public.conquest_now())
        || case when me.user_id is null then '{}'::jsonb else jsonb_build_object(
            'question', s.question,
            'answer', case when me.answered_at is not null then jsonb_build_object('choice', me.picked, 'correct', coalesce(me.is_correct, false),
                'answer_ms', (extract(epoch from (me.answered_at - me.joined_at)) * 1000)::integer,
                'late', me.answered_at > me.joined_at + public.conquest_siege_window() + public.conquest_siege_grace()) end,
            'correct_choice', case when me.answered_at is not null or s.status = 'resolved' then s.correct_choice end,
            'removed', to_jsonb(me.fifty),
            'result', me.result,
            'move', (select public.conquest_move_json(m) from public.conquest_moves m where m.id = me.move_id)) end
    from (select 1) one left join public.conquest_siege_players me on me.siege_id = s.id and me.user_id = uid
$$;
-- Otevřené bitvy hry pro hráče uid (nejstarší první) a can_join: smí se volající teď přidat (není účastník, přidat se ještě jde,
-- tah mu zbývá a území není jeho a sousedí s ním, nebo je jeho a stojí na něm strážní věž, blok 41); can_defend = přidal by se jako obránce
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
            and ((x.owner is distinct from uid
                and exists (select 1 from public.conquest_territories o join public.conquest_links l on l.map = g.map and l.a = o.territory and l.b = s.territory
                            where o.game_id = gid and o.owner = uid))
                or (x.owner is not distinct from uid and x.building is not distinct from 'tower' and now_ts < public.conquest_siege_defend_until(s))),
            'can_defend', x.owner is not distinct from uid and x.building is not distinct from 'tower' and g.status = 'running' and moves_left > 0
            and now_ts < public.conquest_siege_defend_until(s)
            and not exists (select 1 from public.conquest_siege_players sp where sp.siege_id = s.id and sp.user_id = uid))
        order by s.started_at, s.id), '[]'::jsonb) into list
    from public.conquest_sieges s left join public.conquest_territories x on x.game_id = gid and x.territory = s.territory
    where s.game_id = gid and s.status = 'open';
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
    -- Boti (blok 42): naplánovaná přidání a odpovědi, jejichž čas nastal, se zapíšou s tím časem; na naplánovaná přidání se čeká
    if to_regprocedure('public.conquest_bot_siege_sync(uuid)') is not null then
        perform public.conquest_bot_siege_sync(sid);
        select * into s from public.conquest_sieges where id = sid;
    end if;
    if not at_end and public.conquest_now() <= s.ends_at + public.conquest_siege_grace()
            and (exists (select 1 from public.conquest_siege_players p where p.siege_id = sid and p.answered_at is null)
                or public.conquest_siege_defender_due(s)
                or (to_regclass('public.conquest_bot_plans') is not null and exists (select 1 from public.conquest_bot_plans b where b.siege_id = sid))) then
        return false;
    end if;
    select * into win from public.conquest_siege_players p where p.siege_id = sid and p.is_correct
     order by p.answered_at - p.joined_at, p.joined_at, p.user_id limit 1;
    select * into t from public.conquest_territories where game_id = s.game_id and territory = s.territory for update;
    for r in select * from public.conquest_siege_players p where p.siege_id = sid and p.user_id is distinct from win.user_id order by p.joined_at, p.user_id loop
        -- Obránce (blok 41): tah obrany bez oběti, útočníci: oběť = majitel území
        insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at, building)
        values (s.game_id, r.user_id, r.period, case when r.defender then 'defend' else 'attack' end, s.territory, r.source, coalesce(r.is_correct, false),
            case when r.is_correct then 'outrun' else 'fail' end, case when r.defender then null else t.owner end, t.level, false, false, public.conquest_now(),
            case when r.defender then 'tower' end)
        returning * into mv;
        update public.conquest_siege_players set result = mv.result, move_id = mv.id where siege_id = sid and user_id = r.user_id;
    end loop;
    if win.user_id is not null and win.defender then
        -- Obránce odpověděl správně a nejrychleji: útok odražen, území i věž zůstávají (v kronice „Útok odražen“)
        insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at, building)
        values (s.game_id, win.user_id, win.period, 'defend', s.territory, null, true, 'repel', null, t.level, false, false, public.conquest_now(), 'tower')
        returning * into mv;
        update public.conquest_siege_players set result = mv.result, move_id = mv.id where siege_id = sid and user_id = win.user_id;
        verdict := 'repel';
    elsif win.user_id is not null then
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
            and (at_end or s.ends_at + public.conquest_siege_grace() < public.conquest_now()
                -- bot má co udělat (blok 42): naplánované přidání nebo odpověď, jejichž čas nastal; obránce se už přidat nestihne
                or (to_regprocedure('public.conquest_bot_siege_due(uuid)') is not null and public.conquest_bot_siege_due(s.id))
                or (public.conquest_now() >= public.conquest_siege_defend_until(s)
                    and not exists (select 1 from public.conquest_siege_players p where p.siege_id = s.id and p.answered_at is null)))) then
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
-- Hra bitvy pro hráče uid, zamčená: musí ji hrát a nesmí čekat na začátek; napřed se uklidí (bitvy po termínu, konec hry).
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
    -- Boti (blok 42) si naplánují, jestli se přidají nebo budou bránit
    if to_regprocedure('public.conquest_bot_react(uuid)') is not null then perform public.conquest_bot_react(s.id); end if;
    return public.conquest_siege_view(s, uid) || jsonb_build_object('budget', public.conquest_budget(game, uid));
end;
$$;

-- Přidání do bitvy: kdo by na území mohl zaútočit (není jeho, sousedí s jeho územím, tah zbývá), do join_until a dokud bitva trvá
-- (jinak „Bitva už skončila.“). Majitel území se strážní věží (blok 41) se přidá jako obránce odkudkoli (defender, bez source), od bloku 42
-- jen do defend_until (15 s v rychlé hře, jinak 30 s). source = vlastní sousední území (nepovinné, jinak to nejopevněnější). Rezervuje tah.
-- Bitva bota bez otázky (blok 42, needs_question): přidání musí poslat otázku (question, correct jako u conquest_siege_begin), ta pak platí
-- pro všechny; jinak se otázka ignoruje. Kdo už v bitvě je,
-- dostane totéž znovu (bez další rezervace). Vrací bitvu pro účastníka s otázkou (bez správné odpovědi), joined_at, deadline, now a budget.
drop function if exists public.conquest_siege_join(uuid, text);
create or replace function public.conquest_siege_join(siege uuid, source text default null, question jsonb default null, correct smallint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid uuid; g public.conquest_games; s public.conquest_sieges; budget jsonb; src text := source; now_ts timestamptz := public.conquest_now();
    t public.conquest_territories; defending boolean; clean jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select x.game_id into gid from public.conquest_sieges x where x.id = siege;
    g := public.conquest_siege_game(gid, uid, true);
    select * into s from public.conquest_sieges x where x.id = siege for update;
    if exists (select 1 from public.conquest_siege_players p where p.siege_id = siege and p.user_id = uid) then
        return public.conquest_siege_view(s, uid) || jsonb_build_object('budget', public.conquest_budget(gid, uid));
    end if;
    select * into t from public.conquest_territories x where x.game_id = gid and x.territory = s.territory;
    defending := t.owner is not distinct from uid;
    -- Obránce (blok 41) se smí přidat, dokud bitva trvá a do join_until, i když útočníci už odpověděli (bitva na něj počká)
    if s.status <> 'open' or now_ts >= s.join_until
            or (not defending and not exists (select 1 from public.conquest_siege_players p where p.siege_id = siege and p.answered_at is null)) then
        raise exception 'Bitva už skončila.' using errcode = 'P0001';
    end if;
    budget := public.conquest_budget(gid, uid);
    if (budget ->> 'left')::integer <= 0 then raise exception 'Tahy na tohle období už nemáš. Další přibudou v příštím období.' using errcode = 'P0001'; end if;
    if defending and t.building is not distinct from 'tower' and now_ts >= public.conquest_siege_defend_until(s) then
        raise exception 'Na obranu už je pozdě. Bitva běží dál bez tebe.' using errcode = 'P0001';
    end if;
    -- Bitva bota (blok 42): otázku pošle první člověk, který se přidá
    if s.needs_question then
        if question is null then raise exception 'Otázku k bitvě se nepodařilo připravit.' using errcode = '22023'; end if;
        clean := public.conquest_siege_question(question, correct);
        update public.conquest_sieges set question = clean, correct_choice = correct, needs_question = false where id = siege returning * into s;
    end if;
    if defending then
        if t.building is distinct from 'tower' then raise exception 'Na vlastní území útočit nejde. Bránit se jde jen na území se strážní věží.' using errcode = 'P0001'; end if;
        insert into public.conquest_siege_players (siege_id, user_id, source, period, joined_at, defender) values (siege, uid, null, (budget ->> 'period')::integer, now_ts, true);
        update public.conquest_sieges set ends_at = greatest(ends_at, now_ts + public.conquest_siege_window()) where id = siege returning * into s;
        update public.conquest_games set siege_rev = siege_rev + 1 where id = gid;
        return public.conquest_siege_view(s, uid) || jsonb_build_object('budget', public.conquest_budget(gid, uid));
    end if;
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
-- conquest_state), otevřené bitvy (sieges: conquest_siege_json + can_join), moje bitvy vyhodnocené v posledních 2 minutách (results)
-- a kolo (round: conquest_round_json, blok 26; jen hráčům běžící hry, jinak null).
-- Bitvy po termínu a konec hry napřed líně uklidí. Stejná pravidla viditelnosti jako conquest_state (ne hráčům jen otevřená veřejná hra).
create or replace function public.conquest_pulse(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; member boolean; now_ts timestamptz := public.conquest_now(); round_info jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game;
    member := g.id is not null and exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid);
    if g.id is null or (not member and not (g.status = 'lobby' and g.visibility = 'public')) then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if member and g.status = 'running' then
        -- Boti (blok 42): tahy podle plánu kola, nejvýš jednou za 4 s na hru (conquest_bots_due s throttle)
        if to_regprocedure('public.conquest_bots_due(uuid, boolean, boolean)') is not null then perform public.conquest_bots_due(game, false, true); end if;
        perform public.conquest_siege_tick(g);
        select * into g from public.conquest_games where id = game;
    end if;
    if member and to_regprocedure('public.conquest_round_json(public.conquest_games, uuid)') is not null then round_info := public.conquest_round_json(g, uid); end if;
    return jsonb_build_object('id', g.id, 'now', now_ts, 'status', g.status, 'ends_at', g.ends_at, 'version', public.conquest_version(g), 'round', round_info,
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
    public.conquest_siege_defend_wait(text), public.conquest_siege_defend_until(public.conquest_sieges),
    public.conquest_sieges_json(uuid, uuid), public.conquest_siege_resolve(uuid, boolean), public.conquest_sieges_due(uuid, boolean),
    public.conquest_siege_tick(public.conquest_games), public.conquest_siege_game(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.conquest_siege_begin(uuid, text, jsonb, smallint, text), public.conquest_siege_join(uuid, text, jsonb, smallint), public.conquest_siege_answer(uuid, smallint),
    public.conquest_siege_status(uuid), public.conquest_pulse(uuid) from public, anon;
grant execute on function public.conquest_siege_begin(uuid, text, jsonb, smallint, text), public.conquest_siege_join(uuid, text, jsonb, smallint), public.conquest_siege_answer(uuid, smallint),
    public.conquest_siege_status(uuid), public.conquest_pulse(uuid) to authenticated;
-- ===== 25: Dobývání – bitvy o území (obléhání) — KONEC BLOKU =====

-- ===== 26: Dobývání – rychlé hry a další kolo =====
-- Rychlé hry: období (kolo) 10 nebo 5 minut ('min10', 'min5') a délka hry v minutách (conquest_games.duration_minutes: 20, 30, 45, 60, 90
-- nebo 120; duration_hours je u nich null), aspoň 3 kola; conquest_create má nepovinný parametr minutes navíc (starší volání s osmi parametry
-- funguje dál). Každý souhrn hry (lobby, Moje hry, stav, pozvánky) má minutes = délka hry v minutách i u her na hodiny a dny (conquest_minutes).
-- Rychlá hra Blesk (předvolba 'blesk-20m'): Evropa, 4 hráči, 20 minut, kolo 5 minut, 5 tahů za kolo.
-- Další kolo dřív: kolo je hotové (done), když ve hře neběží žádná bitva a každý hráč kolo dohrál: nemá tah (budget left = 0), nemá žádné
-- území (čeká na Návrat do hry), nebo nemá co hrát (žádné cizí sousední území a všechno opevněné naplno); boti se počítají jako hotoví
-- i připravení a své tahy dohrají hned, jakmile lidé dohráli (conquest_bots_due). Pak může každý hráč chtít další kolo (conquest_round_ready;
-- značky v conquest_round_marks podle hry, kola a hráče, jen přes funkce; chtít jde přestat, dokud neběží odpočet). Jakmile chtějí všichni
-- lidé, za 10 s (odpočet; nejpozději v řádném začátku dalšího kola) začne další kolo: round_no = další kolo, round_at = jeho začátek,
-- round_prev_at = začátek dohraného kola (conquest_period, conquest_period_start a conquest_period_end v bloku 21); kola po něm jdou zase
-- po délce období. Tahy, kořist, ztracený hrad, Pevnost, Návrat do hry, bitvy i boti se řídí číslem kola (conquest_period) jako dosud.
-- Konec hry (ends_at) se nemění: předčasné kolo přidá kola navíc, poslední kolo skončí s koncem hry a další kolo po něm chtít nejde.
-- Kolo (round) vracejí conquest_state i conquest_pulse: { period, started_at, ends_at (začátek dalšího kola, i během odpočtu, nejpozději
-- konec hry), done, ready (id hráčů, kteří chtějí další kolo, i boti), next_at (začátek dalšího kola během odpočtu, jinak null), can_ready
-- (volající teď může chtít další kolo), last (poslední kolo hry) }; značka verze (conquest_version) má i round_rev a číslo kola.
-- Upozornění na útoky v rychlé hře mluví o dalším kole a počítají útoky z posledních 30 minut (blok 23), pozvánka „hra na 20 minut“ (blok 24).
create table if not exists public.conquest_round_marks (
    game_id uuid not null references public.conquest_games (id) on delete cascade,
    period integer not null,
    user_id uuid not null references public.profiles (id) on delete cascade,
    at timestamptz not null default now(),
    primary key (game_id, period, user_id)
);
alter table public.conquest_round_marks enable row level security;
revoke all on public.conquest_round_marks from public, anon, authenticated;

-- Odpočet do předčasného začátku dalšího kola
create or replace function public.conquest_round_countdown() returns interval
language sql immutable as $$ select interval '10 seconds' $$;

-- Dohrál hráč kolo? Když nemá žádné území (je mimo hru, vrátit se může Ankhem vzkříšení; blok 39), nemá tah, nebo nemá co
-- hrát (žádné cizí sousední území a všechno má opevněné naplno); bot (od bloku 42 stejně jako člověk) i tehdy, když v kole neměl co hrát
-- (bot_idle). Otevřené bitvy hlídá conquest_round_done.
create or replace function public.conquest_round_player_done(g public.conquest_games, uid uuid) returns boolean
language plpgsql stable set search_path = public as $$
begin
    if public.dev_is_bot(uid) and exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid and c.bot_idle = public.conquest_period(g)) then
        return true;
    end if;
    if not exists (select 1 from public.conquest_territories t where t.game_id = g.id and t.owner = uid) then return true; end if;
    if coalesce((public.conquest_budget(g.id, uid) ->> 'left')::integer, 0) <= 0 then return true; end if;
    return not exists (select 1 from public.conquest_territories s join public.conquest_links l on l.map = g.map and l.a = s.territory
            join public.conquest_territories c on c.game_id = g.id and c.territory = l.b and c.owner is distinct from uid
            where s.game_id = g.id and s.owner = uid)
        and not exists (select 1 from public.conquest_territories t where t.game_id = g.id and t.owner = uid and t.level < case when t.home then 3 else 2 end);
end;
$$;

-- Chce hráč další kolo sám? Bot vždy, člověk bez území také (blok 39: je mimo hru, „Chci další kolo“ za něj nikdo neklepne; když se
-- Ankhem vzkříšení vrátí, chce další kolo zase sám)
create or replace function public.conquest_round_auto(g public.conquest_games, uid uuid) returns boolean
language sql stable set search_path = public as $$
    select public.dev_is_bot(uid) or not exists (select 1 from public.conquest_territories t where t.game_id = g.id and t.owner = uid)
$$;

-- Dohráli kolo všichni? Hra běží, žádná otevřená bitva a každý hráč kolo dohrál; během odpočtu do dalšího kola ano (nikdo už tah nemá).
create or replace function public.conquest_round_done(g public.conquest_games) returns boolean
language plpgsql stable set search_path = public as $$
begin
    if g.id is null or g.status <> 'running' then return false; end if;
    if g.round_at is not null and g.round_at > public.conquest_now() then return true; end if;
    if exists (select 1 from public.conquest_sieges s where s.game_id = g.id and s.status = 'open') then return false; end if;
    return not exists (select 1 from public.conquest_players pl where pl.game_id = g.id and not public.conquest_round_player_done(g, pl.user_id));
end;
$$;

-- Kolo pro hráče uid (jen běžící hra, jinak null): číslo, začátek a konec, done, kdo chce další kolo (ready: hráči bez území vždy, boti, až kolo
-- dohrají, blok 42), začátek dalšího
-- kola během odpočtu (next_at), jestli volající teď může chtít další kolo (can_ready) a jestli je kolo poslední (last)
create or replace function public.conquest_round_json(g public.conquest_games, uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p integer; now_ts timestamptz := public.conquest_now(); next_at timestamptz; ends timestamptz; done boolean; is_last boolean; human boolean; marked boolean;
begin
    if g.id is null or g.status <> 'running' then return null; end if;
    p := public.conquest_period(g);
    next_at := case when g.round_at > now_ts then g.round_at end;
    ends := public.conquest_period_end(g, p);
    is_last := next_at is null and ends >= g.ends_at;
    done := public.conquest_round_done(g);
    human := uid is not null and not public.conquest_round_auto(g, uid) and exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid);
    marked := exists (select 1 from public.conquest_round_marks r where r.game_id = g.id and r.period = p and r.user_id = uid);
    return jsonb_build_object('period', p, 'started_at', public.conquest_period_start(g, p), 'ends_at', ends, 'done', done,
        'ready', coalesce((select jsonb_agg(c.user_id order by c.seat) from public.conquest_players c where c.game_id = g.id
            and ((public.conquest_round_auto(g, c.user_id) and (not public.dev_is_bot(c.user_id) or public.conquest_round_player_done(g, c.user_id)))
                or exists (select 1 from public.conquest_round_marks r where r.game_id = g.id and r.period = p and r.user_id = c.user_id))), '[]'::jsonb),
        'next_at', next_at, 'can_ready', human and done and not is_last and next_at is null and not marked, 'last', is_last);
end;
$$;

-- Chci další kolo (ready = true), nebo už ne (false): jen hráč běžící hry. Chtít jde, až všichni kolo dohráli (done) a když kolo není
-- poslední; přestat chtít jde, dokud neběží odpočet. Opakované volání nic nezmění. Napřed se hra uklidí a boti dohrají své tahy (když lidé
-- dohráli). Když chtějí všichni lidé (boti a lidé bez území se počítají sami), začne odpočet: další kolo začne za 10 s (nejpozději v řádném začátku dalšího
-- kola), staré značky zmizí. Vrací kolo (conquest_round_json).
create or replace function public.conquest_round_ready(game uuid, ready boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; p integer; now_ts timestamptz := public.conquest_now(); changed integer := 0;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = game and c.user_id = uid) then
        raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501';
    end if;
    if g.status = 'lobby' then raise exception 'Hra ještě nezačala.' using errcode = 'P0001'; end if;
    perform public.conquest_housekeep(game);
    perform public.conquest_bots_due(game);
    select * into g from public.conquest_games where id = game;
    if g.status <> 'running' then raise exception 'Hra už skončila.' using errcode = 'P0001'; end if;
    p := public.conquest_period(g);
    if coalesce(ready, true) then
        -- Odpočet už běží: všichni chtějí, beze změny
        if g.round_at is not null and g.round_at > now_ts then return public.conquest_round_json(g, uid); end if;
        if not public.conquest_round_done(g) then raise exception 'Další kolo jde chtít, až všichni dohrají své tahy.' using errcode = 'P0001'; end if;
        if public.conquest_period_end(g, p) >= g.ends_at then raise exception 'Tohle kolo je poslední. Hra skončí, až ho všichni dohrají.' using errcode = 'P0001'; end if;
        insert into public.conquest_round_marks (game_id, period, user_id, at) values (game, p, uid, now_ts) on conflict do nothing;
        get diagnostics changed = row_count;
        if not exists (select 1 from public.conquest_players c where c.game_id = game and not public.conquest_round_auto(g, c.user_id)
                and not exists (select 1 from public.conquest_round_marks r where r.game_id = game and r.period = p and r.user_id = c.user_id)) then
            -- Zbytek kola, který všichni přeskočili, se odečte i z celkové délky hry (počet kol zůstane stejný; schéma 28)
            update public.conquest_games set round_prev_at = public.conquest_period_start(g, p), round_no = p + 1,
                round_at = least(now_ts + public.conquest_round_countdown(), public.conquest_period_end(g, p)),
                ends_at = g.ends_at - greatest(interval '0 seconds', public.conquest_period_end(g, p) - (now_ts + public.conquest_round_countdown()))
            where id = game;
            delete from public.conquest_round_marks where game_id = game and period < p;
            changed := 1;
        end if;
    else
        if g.round_at is not null and g.round_at > now_ts then raise exception 'Odpočet už běží, další kolo začne za chvíli.' using errcode = 'P0001'; end if;
        delete from public.conquest_round_marks where game_id = game and period = p and user_id = uid;
        get diagnostics changed = row_count;
    end if;
    if changed > 0 then update public.conquest_games set round_rev = round_rev + 1 where id = game; end if;
    select * into g from public.conquest_games where id = game;
    return public.conquest_round_json(g, uid);
end;
$$;

-- Oprávnění: hráč volá jen Chci další kolo (anon nic); pomocné funkce jen interně
revoke all on function public.conquest_round_countdown(), public.conquest_round_player_done(public.conquest_games, uuid), public.conquest_round_done(public.conquest_games),
    public.conquest_round_json(public.conquest_games, uuid), public.conquest_round_auto(public.conquest_games, uuid) from public, anon, authenticated;
revoke all on function public.conquest_round_ready(uuid, boolean) from public, anon;
grant execute on function public.conquest_round_ready(uuid, boolean) to authenticated;
-- ===== 26: Dobývání – rychlé hry a další kolo — KONEC BLOKU =====

-- ===== 29: Dobývání – upozornění na konec kola a další kolo =====
-- Dvě upozornění ke kolům (push_pending přes conquest_round_push_items stejně jako útoky z bloku 23; vypíná je profiles.push_conquest,
-- noční klid hlídá odesílač, boti nic nedostanou; klepnutí otevře hru odkazem ./?dobyvani=KÓD):
-- (a) „Všichni dohráli kolo“ (druh 'conquest_round', klíč cqr:hra:hráč:kolo): kolo běžící hry je hotové (conquest_round_done), není poslední
--     a neběží odpočet do dalšího kola. Přijde každému člověku ve hře s územím (blok 39), který další kolo ještě nechce (nemá značku v conquest_round_marks),
--     tedy tomu, komu aplikace právě nabízí „Chci další kolo“ (can_ready v conquest_round_json); okno dalšího kola se po otevření hry ukáže samo.
-- (b) „Kolo brzy končí“ (druh 'conquest_ending', klíč cqe:hra:hráč:kolo): hráči, který v kole ještě má tahy (budget left > 0) a co hrát
--     (conquest_round_player_done je false), když do konce kola (conquest_period_end) zbývá nejvýš: kolo 5 minut 2 minuty, 10 minut 3 minuty,
--     hodina 15 minut, den 3 hodiny (conquest_push_warn), a jen když kolo běží aspoň stejně dlouho (ne hned po předčasném začátku).
--     Text říká, kolik tahů zbývá (conquest_push_moves) a za jak dlouho kolo skončí (conquest_push_time: minuty, nebo hodiny); v posledním
--     kole hry „hra brzy končí“ a „hra skončí za …“.
-- Obojí nejvýš jednou za hru, kolo a hráče (klíč v push_sent). Položky se počítají z aktuálního stavu hry, takže když kolo skončí (nebo začne
-- odpočet), hráč dohraje tahy nebo chce další kolo, zmizí a pozdě se nepošlou; upozornění na kola přijdou nejvýš jednou za 3 minuty
-- od posledního téhož druhu (kolo rychlé hry trvá 5 minut) a odesílač jim dává platnost jen 10 minut (scripts/send-push.mjs, ttlFor).
-- Počítá se jen u lidí s funkčním odběrem (push_subscriptions), ať push_kick každou minutu neprochází všechny hry.

-- Jak dlouho před koncem kola přijde „Kolo brzy končí“ (podle délky kola)
create or replace function public.conquest_push_warn(per text) returns interval
language sql immutable as $$
    select case per when 'min5' then interval '2 minutes' when 'min10' then interval '3 minutes' when 'hour' then interval '15 minutes' else interval '3 hours' end
$$;
-- Zbývající tahy do upozornění: „zbývá ti 1 tah“, „zbývají ti 3 tahy“, „zbývá ti 5 tahů“
create or replace function public.conquest_push_moves(n integer) returns text
language sql immutable as $$
    select case when n = 1 then 'zbývá ti 1 tah' when n between 2 and 4 then 'zbývají ti ' || n || ' tahy' else 'zbývá ti ' || n || ' tahů' end
$$;
-- Zbývající čas do upozornění (nahoru na celé minuty): do hodiny „2 min“, jinak „3 h“ nebo „2 h 15 min“
create or replace function public.conquest_push_time(left_time interval) returns text
language sql immutable as $$
    select case when m < 60 then m || ' min' else (m / 60) || ' h' || case when m % 60 > 0 then ' ' || (m % 60) || ' min' else '' end end
    from (select greatest(1, ceil(extract(epoch from left_time) / 60))::integer as m) x
$$;

-- Upozornění ke kolům (řádky ve tvaru položek push_pending); volá ho jen push_pending. Čas hry podle conquest_now (testy ho nastaví).
create or replace function public.conquest_round_push_items() returns table (user_id uuid, kind text, title text, body text, url text, dedupe_key text, sort_at text)
language sql stable set search_path = public as $$
    with people as (
        -- lidé v běžících hrách, kteří upozornění z Dobývání chtějí a mají kam je poslat
        select pl.game_id, pl.user_id
        from public.conquest_players pl
        join public.conquest_games g on g.id = pl.game_id and g.status = 'running'
        join public.profiles me on me.id = pl.user_id and me.push_conquest
        where exists (select 1 from public.push_subscriptions s where s.user_id = pl.user_id and s.fails < 3)
            and not public.dev_is_bot(pl.user_id)
    ), rounds as (
        -- běžící kolo těchto her (bez odpočtu do dalšího kola): číslo, začátek, konec a jestli je poslední
        select g, m.title as map_title, x.p, x.starts, x.ends, x.ends >= g.ends_at as last, x.now_ts
        from public.conquest_games g
        join public.conquest_maps m on m.id = g.map
        cross join lateral (select y.p, public.conquest_period_start(g, y.p) as starts, public.conquest_period_end(g, y.p) as ends, y.now_ts
            from (select public.conquest_period(g) as p, public.conquest_now() as now_ts) y) x
        where g.status = 'running' and g.ends_at > x.now_ts and (g.round_at is null or g.round_at <= x.now_ts)
            and exists (select 1 from people c where c.game_id = g.id)
    ), done as (
        select r.* from rounds r
        where not r.last
            and exists (select 1 from people c where c.game_id = (r.g).id
                and not exists (select 1 from public.conquest_round_marks k where k.game_id = c.game_id and k.period = r.p and k.user_id = c.user_id))
            and public.conquest_round_done(r.g)
    ), ending as (
        select r.* from rounds r
        where r.ends > r.now_ts and r.ends - r.now_ts <= public.conquest_push_warn((r.g).period) and r.now_ts - r.starts >= public.conquest_push_warn((r.g).period)
    )
    select c.user_id, 'conquest_round'::text, 'Dobývání: všichni dohráli kolo'::text,
        'Hra ' || d.map_title || ': chceš další kolo hned? Klepni na „Chci další kolo“.',
        './?dobyvani=' || (d.g).code,
        'cqr:' || (d.g).id || ':' || c.user_id || ':' || d.p,
        d.starts::text
    from done d
    join people c on c.game_id = (d.g).id
    where not exists (select 1 from public.conquest_round_marks k where k.game_id = c.game_id and k.period = d.p and k.user_id = c.user_id)
        -- hráč bez území (blok 39) další kolo chce sám, upozornění nedostane
        and not public.conquest_round_auto(d.g, c.user_id)
    union all
    select c.user_id, 'conquest_ending'::text,
        case when e.last then 'Dobývání: hra brzy končí' else 'Dobývání: kolo brzy končí' end,
        'Hra ' || e.map_title || ': ' || public.conquest_push_moves(b.moves) || ', ' || case when e.last then 'hra' else 'kolo' end
            || ' skončí za ' || public.conquest_push_time(e.ends - e.now_ts) || '.',
        './?dobyvani=' || (e.g).code,
        'cqe:' || (e.g).id || ':' || c.user_id || ':' || e.p,
        e.ends::text
    from ending e
    join people c on c.game_id = (e.g).id
    cross join lateral (select coalesce((public.conquest_budget((e.g).id, c.user_id) ->> 'left')::integer, 0) as moves) b
    where b.moves > 0 and not public.conquest_round_player_done(e.g, c.user_id)
$$;
-- Pomocné funkce jen interně (volá je push_pending, ne hráč)
revoke all on function public.conquest_push_warn(text), public.conquest_push_moves(integer), public.conquest_push_time(interval),
    public.conquest_round_push_items() from public, anon, authenticated;
-- ===== 29: Dobývání – upozornění na konec kola a další kolo — KONEC BLOKU =====

-- ===== 30: Dobývání – pomůcky Tah navíc a 50/50 =====
-- Dvě vzácné pomůcky do Dobývání. Zásoba je na serveru (player_items: hráč, druh, počet), strop hlídá kontrola i funkce:
-- - Tah navíc ('extra_move', nejvýš 1): v běžící hře, kterou hráč hraje, jednou za hru, ne v posledním kole (ani během odpočtu do dalšího
--   kola) a ne bez území (vrátit se jde jen Ankhem vzkříšení, blok 39). Dá +1 tah v tomto kole (conquest_budget: extra) a zapíše se do kroniky jako tah druhu
--   'extra' bez území, takže ho vidí všichni (a u jeho tahů v pořadí „+1“, conquest_state budgets.extra). conquest_use_extra.
-- - 50/50 ('fifty', nejvýš 2): u otázky tahu se 4 možnostmi, jednou za hru, před odpovědí. V bitvě (blok 25) vybere server dvě
--   nesprávné možnosti a pošle jen jejich indexy (správnou neprozradí, zůstanou dvě možnosti), zapíše je k účastníkovi (removed) a ostatní
--   účastníci vidí, že ji použil (fifty v conquest_siege_json). U otázky bez bitvy (opevnění) ji zná jen aplikace, server jen zapíše
--   použití a ubere zásobu. conquest_use_fifty.
-- Odkud (každý zdroj má klíč, takže stejná událost nedá pomůcku dvakrát; player_item_grants): Tah navíc za první poraženého Bosse týdne
-- v ISO týdnu (boss_submit, boss:<týden>) a za 15. stupeň Sezóny Mudrlanta; 50/50 za Kvíz dne bez chyby (daily_quiz_answer,
-- daily:<RRRR-Wtt>, nejvýš jednou za týden), za celou Řetězovku (chain_submit, chain:<RRRR-Wtt>, nejvýš jednou za týden), za výhru ve hře
-- Dobývání (conquest_finish, conquest:<hra>; vítěz s aspoň 3 vlastními tahy), za 5. stupeň Sezóny Mudrlanta a vzácně (5 %) z Truhly Mudrlanta
-- (nejvýš jednou za týden, chest:<RRRR-Wtt>). Sezónu a truhlu počítá aplikace, pomůcku si o ně řekne přes player_items_claim
-- (season:<RRRR-MM>:<stupeň>, jen stupně 5 a 15 a jen tento nebo minulý měsíc; chest:<týden>, los dělá server).
-- Plná zásoba: zdroj dá jen to, co dával dřív (sezóna běžnou věc, truhla jen svůj obsah); události s týdenním klíčem (Kvíz dne, Řetězovka)
-- to v tom týdnu zkusí znovu, sezóna a truhla ne. Boti pomůcky nedostávají ani nepoužívají. Tabulky hráč jen čte (své řádky), zapisují jen
-- funkce níže. Zásobu vrací player_items_mine, conquest_lobby (items) a conquest_state (items: i co jde v té hře použít).
create table if not exists public.player_items (
    user_id uuid not null references public.profiles (id) on delete cascade,
    kind text not null,
    count smallint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (user_id, kind)
);
alter table public.player_items drop constraint if exists player_items_values;
-- Záchrana navíc do Řetězovky ('chain_rescue', nejvýš 1) přibyla v bloku 37, Ankh vzkříšení do Dobývání ('revive', nejvýš 3) v bloku 39
alter table public.player_items add constraint player_items_values check (kind in ('extra_move', 'fifty', 'chain_rescue', 'revive') and count >= 0
    and count <= case kind when 'fifty' then 2 when 'revive' then 3 else 1 end);
-- Odkud pomůcky přišly: jeden řádek na hráče a klíč zdroje; granted = false: pomůcka nepřibyla (plná zásoba, nebo v truhle nevyšel los)
create table if not exists public.player_item_grants (
    user_id uuid not null references public.profiles (id) on delete cascade,
    key text not null,
    kind text not null,
    granted boolean not null,
    at timestamptz not null default now(),
    primary key (user_id, key)
);
alter table public.player_item_grants drop constraint if exists player_item_grants_values;
-- Klíče Záchrany navíc (blok 37): gold:<RRRR-Wtt> (Zlatá truhla), bossbonus:<týden> (společný cíl Bosse), season:<RRRR-MM>:12,
-- chain-days:<počet> a chain-clean:<počet> (milníky Řetězovky dne). Klíče Ankh vzkříšení (blok 39): starter (jednou na začátek),
-- revive:<hra> (započítaná hra Dobývání s body), daily-streak:<dny> (milníky série Kvízu dne), season:<RRRR-MM>:8, chest:<týden>, gold:<týden>
alter table public.player_item_grants add constraint player_item_grants_values check (kind in ('extra_move', 'fifty', 'chain_rescue', 'revive')
    and key ~ '^(boss:\d{4}-\d{2}-\d{2}|bossbonus:\d{4}-\d{2}-\d{2}|daily:\d{4}-W\d{2}|chain:\d{4}-W\d{2}|chest:\d{4}-W\d{2}|gold:\d{4}-W\d{2}|season:\d{4}-\d{2}:(5|8|12|15)|conquest:[0-9a-f-]{36}|chain-days:\d{1,3}|chain-clean:\d{1,3}|starter|revive:[0-9a-f-]{36}|daily-streak:\d{1,3})$');
alter table public.player_items enable row level security;
alter table public.player_item_grants enable row level security;
drop policy if exists "pomůcky: vlastní řádky" on public.player_items;
create policy "pomůcky: vlastní řádky" on public.player_items for select to authenticated using (user_id = auth.uid());
drop policy if exists "pomůcky: vlastní zdroje" on public.player_item_grants;
create policy "pomůcky: vlastní zdroje" on public.player_item_grants for select to authenticated using (user_id = auth.uid());
revoke all on public.player_items, public.player_item_grants from public, anon, authenticated;
grant select on public.player_items, public.player_item_grants to authenticated;
-- 50/50 jednou za hru: kdy a u čeho (ref = siege:<bitva>, nebo move:<území>:<kolo>:<použité tahy> u otázky bez bitvy)
alter table public.conquest_players add column if not exists fifty_at timestamptz;
alter table public.conquest_players add column if not exists fifty_ref text;

-- Čas pomůcek (Praha); mudrlant.test_now používají jen testy (z API ho klient nastavit nemůže)
create or replace function public.player_items_now() returns timestamptz
language sql stable set search_path = public as $$
    select coalesce(nullif(current_setting('mudrlant.test_now', true), '')::timestamptz, now())
$$;
-- ISO týden dne jako text klíče: „2026-W46“
create or replace function public.player_items_week(d date) returns text
language sql immutable as $$ select to_char(d, 'IYYY-"W"IW') $$;
-- Strop zásoby: Tah navíc 1, 50/50 2, Záchrana navíc 1 (blok 37), Ankh vzkříšení 3 (blok 39; stejně conquest.js ITEMS), jiný druh null
create or replace function public.player_item_cap(item text) returns integer
language sql immutable as $$ select case item when 'extra_move' then 1 when 'fifty' then 2 when 'chain_rescue' then 1 when 'revive' then 3 end $$;
-- Zásoba hráče: { extra_move, fifty, chain_rescue, revive, max: { extra_move, fifty, chain_rescue, revive } }
create or replace function public.player_items_json(uid uuid) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('extra_move', coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = 'extra_move'), 0),
        'fifty', coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = 'fifty'), 0),
        'chain_rescue', coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = 'chain_rescue'), 0),
        'revive', coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = 'revive'), 0),
        'max', jsonb_build_object('extra_move', public.player_item_cap('extra_move'), 'fifty', public.player_item_cap('fifty'), 'chain_rescue', public.player_item_cap('chain_rescue'),
            'revive', public.player_item_cap('revive')))
$$;
-- Pomůcka ze zdroje key (volají ji jen funkce serveru): jednou za klíč. Vrací { kind, granted (přibyla), full (zásoba už byla plná),
-- already (klíč už byl použitý: granted říká, jak to tehdy dopadlo), count (zásoba teď), max }, u bota a neznámého druhu null.
-- retry = klíč, u kterého to minule kvůli plné zásobě nevyšlo, se smí zkusit znovu (týdenní klíče Kvízu dne a Řetězovky).
create or replace function public.player_item_grant(uid uuid, item text, grant_key text, retry boolean default false) returns jsonb
language plpgsql set search_path = public as $$
declare cap integer := public.player_item_cap(item); have integer; prev public.player_item_grants; t timestamptz := public.player_items_now();
begin
    if uid is null or cap is null or grant_key is null or public.dev_is_bot(uid) then return null; end if;
    -- Řádek zásoby zamčený: souběžné zisky téhož hráče jdou po sobě
    insert into public.player_items (user_id, kind, count, updated_at) values (uid, item, 0, t) on conflict (user_id, kind) do nothing;
    select i.count into have from public.player_items i where i.user_id = uid and i.kind = item for update;
    select * into prev from public.player_item_grants x where x.user_id = uid and x.key = grant_key;
    if prev.user_id is not null and (prev.granted or not coalesce(retry, false)) then
        return jsonb_build_object('kind', prev.kind, 'granted', prev.granted, 'full', not prev.granted, 'already', true, 'count', have, 'max', cap);
    end if;
    if have >= cap then
        insert into public.player_item_grants (user_id, key, kind, granted, at) values (uid, grant_key, item, false, t) on conflict (user_id, key) do nothing;
        return jsonb_build_object('kind', item, 'granted', false, 'full', true, 'already', false, 'count', have, 'max', cap);
    end if;
    update public.player_items set count = count + 1, updated_at = t where user_id = uid and kind = item;
    insert into public.player_item_grants (user_id, key, kind, granted, at) values (uid, grant_key, item, true, t)
    on conflict (user_id, key) do update set granted = true, kind = excluded.kind, at = excluded.at;
    return jsonb_build_object('kind', item, 'granted', true, 'full', false, 'already', false, 'count', have + 1, 'max', cap);
end;
$$;
-- Los truhly: číslo 0–999 pevně dané hráčem a klíčem (týdnem), opakované volání nic nezmění. Truhla Mudrlanta: pod 50 (5 %) 50/50,
-- 50–99 (dalších 5 %) Záchrana navíc (blok 37), 130–229 (10 %) Ankh vzkříšení (blok 39; 100–129 je výplň Duha z bloku 38); Zlatá truhla:
-- pod 200 (20 %) Záchrana navíc (blok 37), 200–349 (15 %) Ankh vzkříšení (blok 39)
create or replace function public.player_item_roll(uid uuid, grant_key text) returns integer
language sql immutable as $$ select ('x' || substr(md5(uid::text || '|' || grant_key), 1, 6))::bit(24)::integer % 1000 $$;
create or replace function public.player_item_lucky(uid uuid, grant_key text) returns boolean
language sql immutable as $$ select public.player_item_roll(uid, grant_key) < 50 $$;

-- Moje zásoba pomůcek (s jednorázovým startovním Ankhem vzkříšení, blok 39)
create or replace function public.player_items_mine() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if to_regprocedure('public.conquest_revive_starter(uuid)') is not null then perform public.conquest_revive_starter(uid); end if;
    return public.player_items_json(uid);
end;
$$;

-- Pomůcka ze zdroje, který počítá aplikace: source 'season' (key season:<RRRR-MM>:<stupeň>: 5. stupeň 50/50, 8. stupeň Ankh vzkříšení
-- (blok 39), 12. stupeň Záchrana navíc (blok 37), 15. stupeň Tah navíc; jen tento a minulý měsíc podle Prahy), 'chest' (Truhla Mudrlanta,
-- key chest:<RRRR-Wtt>, tento nebo minulý týden; los dělá server, jednou za týden: 5 % 50/50, dalších 5 % Záchrana navíc, 10 %
-- Ankh vzkříšení) nebo 'gold' (Zlatá truhla, blok 37: key gold:<RRRR-Wtt>, nejvýš jednou za týden, 20 % Záchrana navíc, 15 % Ankh vzkříšení).
-- Vrací výsledek player_item_grant (u truhly bez štěstí { kind, granted: false, lucky: false }) a zásobu (items); truhla se vzácným vzorem
-- Duha (blok 38, conquest_chest_pattern) navíc pattern: 'duha'.
create or replace function public.player_items_claim(source text, key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t timestamptz := public.player_items_now(); today date := (public.player_items_now() at time zone 'Europe/Prague')::date;
    m text[]; item text; result jsonb; prev public.player_item_grants; roll integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if public.dev_is_bot(uid) then raise exception 'Boti pomůcky nedostávají.' using errcode = '42501'; end if;
    if source = 'season' then
        m := regexp_match(coalesce(key, ''), '^season:(\d{4}-\d{2}):(5|8|12|15)$');
        if m is null then raise exception 'Pomůcku dává jen 5., 8., 12. a 15. stupeň sezóny.' using errcode = '22023'; end if;
        if m[1] not in (to_char(today, 'YYYY-MM'), to_char(today - interval '1 month', 'YYYY-MM')) then
            raise exception 'Tahle sezóna už skončila.' using errcode = '22023';
        end if;
        item := case m[2] when '5' then 'fifty' when '8' then 'revive' when '12' then 'chain_rescue' else 'extra_move' end;
        result := public.player_item_grant(uid, item, key, false);
    elsif source in ('chest', 'gold') then
        if coalesce(key, '') not in (source || ':' || public.player_items_week(today), source || ':' || public.player_items_week(today - 7)) then
            raise exception 'Truhla patří k jinému týdnu.' using errcode = '22023';
        end if;
        perform 1 from public.profiles p where p.id = uid for update;
        select * into prev from public.player_item_grants x where x.user_id = uid and x.key = player_items_claim.key;
        roll := public.player_item_roll(uid, key);
        item := case when source = 'chest' and roll < 50 then 'fifty' when source = 'chest' and roll < 100 then 'chain_rescue'
            when source = 'chest' and roll >= 130 and roll < 230 then 'revive'
            when source = 'gold' and roll < 200 then 'chain_rescue' when source = 'gold' and roll < 350 then 'revive' end;
        if prev.user_id is not null then
            result := jsonb_build_object('kind', prev.kind, 'granted', prev.granted, 'already', true, 'lucky', item is not null);
        elsif item is null then
            insert into public.player_item_grants (user_id, key, kind, granted, at) values (uid, key, case source when 'gold' then 'chain_rescue' else 'fifty' end, false, t);
            result := jsonb_build_object('kind', case source when 'gold' then 'chain_rescue' else 'fifty' end, 'granted', false, 'full', false, 'already', false, 'lucky', false);
        else
            result := public.player_item_grant(uid, item, key, false) || jsonb_build_object('lucky', true);
        end if;
        -- Vzácnost do Dobývání (blok 38): los 100–129 = výplň území Duha; odemkne se hned (conquest_looks_json)
        if source = 'chest' and to_regprocedure('public.conquest_chest_pattern(uuid, text)') is not null and public.conquest_chest_pattern(uid, key) then
            perform public.conquest_looks_json(uid);
            result := result || jsonb_build_object('pattern', 'duha');
        end if;
    else
        raise exception 'Neznámý zdroj pomůcky.' using errcode = '22023';
    end if;
    return result || jsonb_build_object('items', public.player_items_json(uid));
end;
$$;

-- Proč teď nejde použít Tah navíc (česky), nebo null, když jde. Zámek hry drží volající (conquest_use_extra), conquest_items_json jen čte.
create or replace function public.conquest_extra_block(g public.conquest_games, uid uuid) returns text
language plpgsql stable set search_path = public as $$
declare p integer; now_ts timestamptz := public.conquest_now();
begin
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid) then return 'Tuhle hru nehraješ.'; end if;
    if g.status <> 'running' then return 'Hra neběží.'; end if;
    if public.dev_is_bot(uid) then return 'Boti pomůcky nepoužívají.'; end if;
    if exists (select 1 from public.conquest_moves m where m.game_id = g.id and m.user_id = uid and m.kind = 'extra') then
        return 'Tah navíc jde v jedné hře použít jen jednou.';
    end if;
    if coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = 'extra_move'), 0) < 1 then return 'Tah navíc teď nemáš.'; end if;
    if g.round_at is not null and g.round_at > now_ts then return 'Další kolo právě začíná. Tah navíc použij až v něm.'; end if;
    p := public.conquest_period(g);
    if public.conquest_period_end(g, p) >= g.ends_at then return 'V posledním kole hry Tah navíc použít nejde.'; end if;
    if not exists (select 1 from public.conquest_territories t where t.game_id = g.id and t.owner = uid) then
        return 'Bez území Tah navíc použít nejde. Vrátit se můžeš pomůckou Ankh vzkříšení.';
    end if;
    return null;
end;
$$;
-- Moje pomůcky ve hře: zásoba (player_items_json) a v této hře extra_used / fifty_used (už použité), can_extra a extra_block (proč ne);
-- Ankh vzkříšení (blok 39): can_revive, revive_block (proč ne, null = jde) a revive_used (kolikrát ho hráč v této hře použil)
create or replace function public.conquest_items_json(g public.conquest_games, uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare block text := public.conquest_extra_block(g, uid); revive jsonb := '{}'::jsonb; why text;
begin
    if to_regprocedure('public.conquest_revive_block(public.conquest_games, uuid)') is not null then
        why := public.conquest_revive_block(g, uid);
        revive := jsonb_build_object('can_revive', why is null, 'revive_block', why,
            'revive_used', (select count(*) from public.conquest_moves m where m.game_id = g.id and m.user_id = uid and m.kind = 'revive'));
    end if;
    return public.player_items_json(uid) || jsonb_build_object(
        'extra_used', exists (select 1 from public.conquest_moves m where m.game_id = g.id and m.user_id = uid and m.kind = 'extra'),
        'fifty_used', exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid and c.fifty_at is not null),
        'can_extra', block is null, 'extra_block', block) || revive;
end;
$$;

-- Tah navíc: kontrola (conquest_extra_block), zápis do kroniky (tah 'extra' bez území v tomto kole), zásoba o 1 méně; kdo už chtěl další
-- kolo (blok 26), teď zase hraje (jeho značka zmizí). Vrací stav hry (conquest_state) a used = 'extra_move'.
create or replace function public.conquest_use_extra(game uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; block text; p integer; t timestamptz := public.conquest_now(); gone integer := 0;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = game and c.user_id = uid) then
        raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501';
    end if;
    if g.status = 'lobby' then raise exception 'Hra ještě nezačala.' using errcode = 'P0001'; end if;
    perform public.conquest_housekeep(game);
    select * into g from public.conquest_games where id = game;
    perform 1 from public.player_items i where i.user_id = uid and i.kind = 'extra_move' for update;
    block := public.conquest_extra_block(g, uid);
    if block is not null then raise exception '%', block using errcode = 'P0001'; end if;
    p := public.conquest_period(g);
    insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at)
    values (game, uid, p, 'extra', null, null, true, 'extra', null, 0, false, false, t);
    update public.player_items set count = count - 1, updated_at = t where user_id = uid and kind = 'extra_move';
    if to_regclass('public.conquest_round_marks') is not null then
        delete from public.conquest_round_marks where game_id = game and period = p and user_id = uid;
        get diagnostics gone = row_count;
        if gone > 0 then update public.conquest_games set round_rev = round_rev + 1 where id = game; end if;
    end if;
    return public.conquest_state(game) || jsonb_build_object('used', 'extra_move');
end;
$$;

-- 50/50 u otázky tahu (jednou za hru, před odpovědí). siege = bitva, ve které hráč bojuje a ještě neodpověděl (otázka se 4 možnostmi,
-- ne mapa, letopočet ani číslo): server vybere dvě nesprávné možnosti a vrátí jejich indexy (removed); opakované volání pro tutéž bitvu
-- vrátí totéž. Bez bitvy (opevnění, starší útok): target = území tahu, správnou odpověď zná jen aplikace a server jen zapíše použití
-- (opakované volání před tahem nic dalšího neubere). Vrací { removed (jen v bitvě), items (zásoba), fifty_used: true }.
create or replace function public.conquest_use_fifty(game uuid, siege uuid default null, target text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; me public.conquest_players; s public.conquest_sieges; sp public.conquest_siege_players;
    t timestamptz := public.conquest_now(); have integer; gone_choices smallint[]; ref text; budget jsonb; n integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    select * into me from public.conquest_players c where c.game_id = game and c.user_id = uid;
    if g.id is null or me.user_id is null then raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501'; end if;
    if g.status = 'lobby' then raise exception 'Hra ještě nezačala.' using errcode = 'P0001'; end if;
    if public.dev_is_bot(uid) then raise exception 'Boti pomůcky nepoužívají.' using errcode = '42501'; end if;
    perform public.conquest_housekeep(game);
    select * into g from public.conquest_games where id = game;
    if g.status <> 'running' then raise exception 'Hra už skončila.' using errcode = 'P0001'; end if;
    insert into public.player_items (user_id, kind, count, updated_at) values (uid, 'fifty', 0, t) on conflict (user_id, kind) do nothing;
    select i.count into have from public.player_items i where i.user_id = uid and i.kind = 'fifty' for update;
    if siege is not null then
        select * into s from public.conquest_sieges x where x.id = siege and x.game_id = game for update;
        if s.id is null then raise exception 'Tahle bitva není.' using errcode = '22023'; end if;
        select * into sp from public.conquest_siege_players x where x.siege_id = siege and x.user_id = uid;
        if sp.user_id is null then raise exception 'V téhle bitvě nebojuješ.' using errcode = 'P0001'; end if;
        if sp.fifty is not null then
            return jsonb_build_object('removed', to_jsonb(sp.fifty), 'items', public.player_items_json(uid), 'fifty_used', true);
        end if;
        if s.status <> 'open' or sp.answered_at is not null or t > sp.joined_at + public.conquest_siege_window() then
            raise exception 'Na tuhle otázku už 50/50 použít nejde.' using errcode = 'P0001';
        end if;
        n := jsonb_array_length(s.question -> 'choices');
        if n <> 4 or coalesce(s.question ->> 'kind', '') in ('map', 'year', 'number') then
            raise exception 'U téhle otázky 50/50 použít nejde.' using errcode = 'P0001';
        end if;
    else
        if target is null or not exists (select 1 from public.conquest_territories x where x.game_id = game and x.territory = target) then
            raise exception 'Tohle území na mapě není.' using errcode = '22023';
        end if;
        budget := public.conquest_budget(game, uid);
        ref := 'move:' || target || ':' || (budget ->> 'period') || ':' || (budget ->> 'used');
        if me.fifty_at is not null and me.fifty_ref = ref then
            return jsonb_build_object('removed', null, 'items', public.player_items_json(uid), 'fifty_used', true);
        end if;
        if (budget ->> 'left')::integer <= 0 then raise exception 'Tahy na tohle kolo už nemáš.' using errcode = 'P0001'; end if;
    end if;
    if me.fifty_at is not null then raise exception '50/50 jde v jedné hře použít jen jednou.' using errcode = 'P0001'; end if;
    if have < 1 then raise exception '50/50 teď nemáš.' using errcode = 'P0001'; end if;
    if siege is not null then
        select array_agg(i order by i) into gone_choices from (
            select i::smallint as i from generate_series(0, n - 1) i where i <> s.correct_choice order by random() limit 2) x;
        update public.conquest_siege_players set fifty = gone_choices where siege_id = siege and user_id = uid;
        update public.conquest_games set siege_rev = siege_rev + 1 where id = game;
        ref := 'siege:' || siege;
    end if;
    update public.conquest_players set fifty_at = t, fifty_ref = ref where game_id = game and user_id = uid;
    update public.player_items set count = count - 1, updated_at = t where user_id = uid and kind = 'fifty';
    return jsonb_build_object('removed', to_jsonb(gone_choices), 'items', public.player_items_json(uid), 'fifty_used', true);
end;
$$;

-- Oprávnění: hráč volá jen svou zásobu, pomůcku ze sezóny či truhly a použití pomůcek ve hře (anon nic); pomocné funkce jen interně
revoke all on function public.player_items_now(), public.player_items_week(date), public.player_item_cap(text), public.player_items_json(uuid),
    public.player_item_grant(uuid, text, text, boolean), public.player_item_roll(uuid, text), public.player_item_lucky(uuid, text), public.conquest_extra_block(public.conquest_games, uuid),
    public.conquest_items_json(public.conquest_games, uuid) from public, anon, authenticated;
revoke all on function public.player_items_mine(), public.player_items_claim(text, text), public.conquest_use_extra(uuid), public.conquest_use_fifty(uuid, uuid, text)
    from public, anon;
grant execute on function public.player_items_mine(), public.player_items_claim(text, text), public.conquest_use_extra(uuid), public.conquest_use_fifty(uuid, uuid, text)
    to authenticated;
-- ===== 30: Dobývání – pomůcky Tah navíc a 50/50 — KONEC BLOKU =====

-- ===== 31: Speciální turnaje na téma, hlasování o tématu a psaní odpovědí jen pro jednoho hráče =====
-- Nárazové turnaje (kind 'special' v tournaments; sloupce a fáze kol jsou u Týdenních turnajů výš): stejný pavouk a stejné otázky pro všechny
-- ze semínka turnaje a kola (vybírá je aplikace jen z položek tématu, tournament.js THEMES), odpovědi přes tournament_answer_save, výsledek
-- z nich (tournament_finish_match), XP za výhry i odznaky jako u týdenního turnaje. Nikdy je nezakládá tournament_tick: spustí je správce
-- (dev_admins) ve vývojářských nástrojích aplikace s tématem, začátkem a délkou kola (dev_special_tournament_create), najednou nejvýš jeden.
-- Kolo n se hraje od starts_at + (n − 1) × round_minutes, přihlášky se zavřou v starts_at.
-- Téma vybírají hráči v hlasování: vždy je otevřené jedno (tournament_polls) se 4 tématy z nabídky (tournament_themes); každý přihlášený hráč
-- má jeden hlas (tournament_votes), který může do konce hlasování změnit (nejvýš 10krát). Počty hlasů uvidí, až sám hlasuje (správce vždy).
-- Když správce založí turnaj na téma z hlasování, nebo hlasování uzavře (dev_tournament_poll_close), hlasování se uzavře (vítěz = téma turnaje,
-- nebo nejvíc hlasů, při shodě dřívější v nabídce) a hned se otevře další se 4 jinými tématy: bez témat dvou posledních hlasování a šesti
-- posledních speciálních turnajů, pořadí určuje otisk (md5) id tématu a čísla hlasování – výběr dělá server a nikdo ho neovlivní.
-- Tabulky čte hráč přes pravidla řádků (svůj hlas jen sám), zapisují jen funkce.
create table if not exists public.tournament_themes (
    id text primary key,
    title text not null,
    topics text not null,
    capacity integer not null default 128,
    sort integer not null default 0,
    active boolean not null default true
);
alter table public.tournament_themes drop constraint if exists tournament_themes_values;
alter table public.tournament_themes add constraint tournament_themes_values check (id ~ '^[a-z0-9-]{1,40}$' and char_length(title) between 2 and 60
    and topics ~ '^[a-z0-9,]{1,200}$' and capacity in (8, 16, 32, 64, 128));
-- Nabídka témat (stejná id, názvy, témata otázek a kapacita jako tournament.js THEMES; hlídá tests/tournament-special.test.js). Kapacita = kolik
-- hráčů nejvýš, aby na všechna kola (10 otázek v kole) stačily položky tématu bez opakování. Téma, které ze seznamu zmizí, se jen vypne.
with list (id, title, topics, capacity, sort) as (values
    ('hrady-zamky', 'Hrady a zámky', 'zemepis,architektura', 128, 1),
    ('opery', 'Opery', 'hudba', 128, 2),
    ('olympijske-hry', 'Olympijské hry', 'sport', 128, 3),
    ('vlajky-afriky', 'Vlajky Afriky', 'vlajky', 64, 4),
    ('vlajky-statu', 'Vlajky států', 'vlajky', 128, 5),
    ('ceske-dejiny', 'České dějiny', 'historie', 128, 6),
    ('starovek', 'Starověk', 'historie', 128, 7),
    ('svetove-valky', 'Světové války', 'historie', 128, 8),
    ('panovnici', 'Králové a císaři', 'historie', 128, 9),
    ('recke-baje', 'Řecké báje', 'mytologie', 128, 10),
    ('pravek', 'Pravěká zvířata', 'biologie', 128, 11),
    ('psi-plemena', 'Psí plemena', 'biologie', 128, 12),
    ('nase-priroda', 'Naše příroda', 'biologie', 128, 13),
    ('vesmir', 'Vesmír', 'fyzika', 128, 14),
    ('chemicke-prvky', 'Chemické prvky', 'chemie', 128, 15),
    ('rock', 'Rock a punk', 'hudba', 128, 16),
    ('cesky-film', 'Český film', 'film', 128, 17),
    ('pohadky', 'Filmové pohádky', 'film', 128, 18),
    ('sci-fi', 'Sci-fi a fantasy', 'film,literatura', 128, 19),
    ('ceska-literatura', 'Česká literatura', 'literatura', 128, 20),
    ('renesance', 'Renesance', 'umeni,architektura', 128, 21),
    ('fotbal', 'Fotbal', 'sport', 128, 22),
    ('hokej', 'Lední hokej', 'sport', 128, 23),
    ('hlavni-mesta', 'Hlavní města', 'zemepis', 128, 24),
    ('ceska-mesta', 'Česká města', 'zemepis', 128, 25),
    ('unesco', 'Světové dědictví UNESCO', 'zemepis,architektura', 128, 26),
    ('kostely', 'Kostely a kláštery', 'architektura', 128, 27),
    ('nobelova-cena', 'Nobelova cena', 'chemie,fyzika,literatura', 128, 28)
), saved as (
    insert into public.tournament_themes (id, title, topics, capacity, sort) select id, title, topics, capacity, sort from list
    on conflict (id) do update set title = excluded.title, topics = excluded.topics, capacity = excluded.capacity, sort = excluded.sort, active = true
    returning id
)
update public.tournament_themes set active = false where id not in (select id from list);

create table if not exists public.tournament_polls (
    id bigint generated always as identity primary key,
    options text[] not null,
    opened_at timestamptz not null default now(),
    closed_at timestamptz,
    winner text,
    tournament_id uuid references public.tournaments (id) on delete set null
);
alter table public.tournament_polls drop constraint if exists tournament_polls_options_count;
-- (2–4 témata od bloku 34, kdy je vybírá správce; tady stejně, ať opakované spuštění neselže na hlasování se 2 nebo 3 tématy)
alter table public.tournament_polls add constraint tournament_polls_options_count check (cardinality(options) between 2 and 4);
-- otevřené je vždy nejvýš jedno
create unique index if not exists tournament_polls_one_open on public.tournament_polls ((true)) where closed_at is null;

create table if not exists public.tournament_votes (
    poll_id bigint not null references public.tournament_polls (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    theme text not null,
    voted_at timestamptz not null default now(),
    changes integer not null default 0,
    primary key (poll_id, user_id)
);
alter table public.tournament_votes drop constraint if exists tournament_votes_changes_range;
alter table public.tournament_votes add constraint tournament_votes_changes_range check (changes between 0 and 10);
create index if not exists tournament_votes_user_idx on public.tournament_votes (user_id);

alter table public.tournament_themes enable row level security;
alter table public.tournament_polls enable row level security;
alter table public.tournament_votes enable row level security;
drop policy if exists "turnaje: nabídka témat" on public.tournament_themes;
create policy "turnaje: nabídka témat" on public.tournament_themes for select to authenticated using (true);
drop policy if exists "turnaje: hlasování" on public.tournament_polls;
create policy "turnaje: hlasování" on public.tournament_polls for select to authenticated using (true);
drop policy if exists "turnaje: vlastní hlas" on public.tournament_votes;
create policy "turnaje: vlastní hlas" on public.tournament_votes for select to authenticated using (user_id = auth.uid());
revoke all on public.tournament_themes, public.tournament_polls, public.tournament_votes from public, anon, authenticated;
grant select on public.tournament_themes, public.tournament_polls, public.tournament_votes to authenticated;

-- 4 témata pro hlasování číslo seq: nejdřív ta, která nebyla ve dvou posledních hlasováních ani v šesti posledních speciálních turnajích
create or replace function public.tournament_poll_pick(seq bigint) returns text[]
language sql stable set search_path = public as $$
    with recent as (
        select unnest(p.options) as id from (select tp.options from public.tournament_polls tp order by tp.id desc limit 2) p
        union
        select s.theme from (select t.theme from public.tournaments t where t.kind = 'special' order by t.created_at desc limit 6) s
    )
    select array(select th.id from public.tournament_themes th where th.active
        order by (th.id in (select r.id from recent r)), md5(th.id || ':' || seq), th.id limit 4)
$$;

-- Otevřené hlasování; když žádné není, otevře se nové
create or replace function public.tournament_poll_current() returns public.tournament_polls
language plpgsql security definer set search_path = public as $$
declare p public.tournament_polls;
begin
    select * into p from public.tournament_polls where closed_at is null;
    if p.id is not null then return p; end if;
    perform pg_advisory_xact_lock(74631);
    select * into p from public.tournament_polls where closed_at is null;
    if p.id is not null then return p; end if;
    insert into public.tournament_polls (options) values (public.tournament_poll_pick(coalesce((select max(tp.id) from public.tournament_polls tp), 0) + 1)) returning * into p;
    return p;
end;
$$;

-- Hlasování jako JSON pro hráče uid: { id, opened_at, closed, options: [{ id, title, topics, votes }], mine, total, changes_left }.
-- votes a total jen tomu, kdo už hlasoval, a správci (dev_admins); ostatní je mají null.
create or replace function public.tournament_poll_json(p public.tournament_polls, uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
    with me as (select v.theme, v.changes from public.tournament_votes v where v.poll_id = p.id and v.user_id = uid),
    shown as (select exists (select 1 from me) or exists (select 1 from public.dev_admins d where d.user_id = uid) as ok),
    counts as (select v.theme, count(*)::integer as n from public.tournament_votes v where v.poll_id = p.id group by v.theme)
    select jsonb_build_object(
        'id', p.id, 'opened_at', p.opened_at, 'closed', p.closed_at is not null,
        'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', coalesce(th.title, o.id), 'topics', th.topics,
                'votes', case when (select ok from shown) then coalesce((select c.n from counts c where c.theme = o.id), 0) end) order by o.ord)
            from unnest(p.options) with ordinality as o(id, ord) left join public.tournament_themes th on th.id = o.id), '[]'::jsonb),
        'mine', (select me.theme from me),
        'total', case when (select ok from shown) then coalesce((select sum(c.n) from counts c), 0)::integer end,
        'changes_left', 10 - coalesce((select me.changes from me), 0))
$$;

-- Hráč: stav hlasování (otevřené, s mým hlasem; když žádné není, otevře se)
create or replace function public.tournament_poll_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return public.tournament_poll_json(public.tournament_poll_current(), uid);
end;
$$;

-- Hráč: hlas pro téma (jeden na hlasování; změna nejvýš 10krát, stejný hlas znovu nic nemění). Vrací stav hlasování.
create or replace function public.tournament_vote(poll bigint, theme text) returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare uid uuid := auth.uid(); p public.tournament_polls; prev public.tournament_votes;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    -- uzavření hlasování (for update) počká na rozjeté hlasy a naopak
    select * into p from public.tournament_polls tp where tp.id = poll for share;
    if p.id is null or p.closed_at is not null then raise exception 'Hlasování už skončilo. Hlasuj v novém.' using errcode = '22023'; end if;
    if theme is null or not (theme = any (p.options)) then raise exception 'Tohle téma v hlasování není.' using errcode = '22023'; end if;
    perform pg_advisory_xact_lock(hashtext('tournament_vote:' || poll::text || ':' || uid::text));
    select * into prev from public.tournament_votes v where v.poll_id = poll and v.user_id = uid;
    if prev.poll_id is null then
        insert into public.tournament_votes (poll_id, user_id, theme) values (poll, uid, theme);
    elsif prev.theme <> theme then
        if prev.changes >= 10 then raise exception 'Hlas jde změnit nejvýš 10krát, teď už platí ten poslední.' using errcode = '22023'; end if;
        update public.tournament_votes v set theme = theme, voted_at = now(), changes = v.changes + 1 where v.poll_id = poll and v.user_id = uid;
    end if;
    return public.tournament_poll_json(p, uid);
end;
$$;

-- Uzavře otevřené hlasování (vítěz: chosen, jinak téma s nejvíc hlasy, při shodě dřívější v nabídce; bez hlasů žádný) a hned otevře další.
-- Vrací nové hlasování.
create or replace function public.tournament_poll_close(chosen text default null, tid uuid default null) returns public.tournament_polls
language plpgsql security definer set search_path = public as $$
declare p public.tournament_polls; best text;
begin
    perform pg_advisory_xact_lock(74631);
    select * into p from public.tournament_polls where closed_at is null for update;
    if p.id is not null then
        select o.id into best from unnest(p.options) with ordinality as o(id, ord)
            join (select v.theme, count(*) as n from public.tournament_votes v where v.poll_id = p.id group by v.theme) c on c.theme = o.id
            order by c.n desc, o.ord limit 1;
        update public.tournament_polls set closed_at = now(), winner = coalesce(chosen, best), tournament_id = tid where id = p.id;
    end if;
    insert into public.tournament_polls (options) values (public.tournament_poll_pick(coalesce((select max(tp.id) from public.tournament_polls tp), 0) + 1)) returning * into p;
    return p;
end;
$$;

-- Správce: uzavře hlasování a otevře další (vrací nové hlasování jako tournament_poll_state)
create or replace function public.dev_tournament_poll_close() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
    perform public.dev_check();
    return public.tournament_poll_json(public.tournament_poll_close(), auth.uid());
end;
$$;

-- Správce: speciální turnaj na téma z nabídky se začátkem (od teď za minutu až za 60 dní) a délkou kola (10 minut až 24 hodin, po 5 minutách);
-- přihlášky se otevřou hned. Téma z otevřeného hlasování ho uzavře (vítěz = toto téma) a otevře další. Vrací id turnaje.
create or replace function public.dev_special_tournament_create(theme_id text, start_at timestamptz, round_len integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare th public.tournament_themes; tid uuid; poll public.tournament_polls;
begin
    perform public.dev_check();
    select * into th from public.tournament_themes where id = theme_id and active;
    if th.id is null then raise exception 'Takové téma v nabídce není.' using errcode = '22023'; end if;
    if start_at is null or start_at < public.tournament_now() + interval '1 minute' or start_at > public.tournament_now() + interval '60 days' then
        raise exception 'Začátek turnaje musí být v budoucnu, nejpozději za 60 dní.' using errcode = '22023';
    end if;
    if round_len is null or round_len < 10 or round_len > 1440 or round_len % 5 <> 0 then
        raise exception 'Délka kola musí být 10 minut až 24 hodin (po 5 minutách).' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(74632);
    if exists (select 1 from public.tournaments t where t.kind = 'special' and t.status in ('open', 'running')) then
        raise exception 'Speciální turnaj už běží nebo má otevřené přihlášky. Další jde založit, až skončí.' using errcode = '22023';
    end if;
    begin
        insert into public.tournaments (kind, topic, week_start, capacity, theme, title, starts_at, round_minutes, created_by)
            values ('special', th.topics, (start_at at time zone 'Europe/Prague')::date, th.capacity, th.id, th.title, date_trunc('minute', start_at), round_len, auth.uid())
            returning id into tid;
    exception when unique_violation then
        raise exception 'Ten den už začíná turnaj se stejnými tématy. Zvol jiný den.' using errcode = '22023';
    end;
    select * into poll from public.tournament_polls where closed_at is null;
    if poll.id is not null and th.id = any (poll.options) then perform public.tournament_poll_close(th.id, tid); end if;
    return tid;
end;
$$;

-- Správce: smaže speciální turnaj, který ještě nezačal (třeba se špatným začátkem); přihlášky zmizí s ním
create or replace function public.dev_special_tournament_delete(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
    perform public.dev_check();
    delete from public.tournaments where id = tid and kind = 'special' and status = 'open';
    if not found then raise exception 'Smazat jde jen speciální turnaj, který ještě nezačal.' using errcode = '22023'; end if;
end;
$$;

-- Čas do upozornění (Praha): „ve čtvrtek 26. 11. v 18:00“
create or replace function public.tournament_special_when(ts timestamptz) returns text
language sql stable set search_path = public as $$
    select (array['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'])[extract(dow from (ts at time zone 'Europe/Prague'))::integer + 1]
        || ' ' || to_char(ts at time zone 'Europe/Prague', 'FMDD. FMMM.') || ' v ' || to_char(ts at time zone 'Europe/Prague', 'FMHH24:MI')
$$;
-- Konec kola do připomínky zápasu: „do 19:00“, jiný den „do 27. 11. 18:00“
create or replace function public.tournament_push_until(ts timestamptz) returns text
language sql stable set search_path = public as $$
    select 'do ' || case when (ts at time zone 'Europe/Prague')::date = (public.tournament_now() at time zone 'Europe/Prague')::date then ''
        else to_char(ts at time zone 'Europe/Prague', 'FMDD. FMMM.') || ' ' end || to_char(ts at time zone 'Europe/Prague', 'FMHH24:MI')
$$;

-- (h) v push_pending: „Začíná speciální turnaj: Hrady a zámky“ – jednou za turnaj (klíč tsp:turnaj:hráč) každému, kdo chce upozornění na turnaje
-- (profiles.push_tournament), má funkční odběr a ještě se nepřihlásil; jen u turnaje s otevřenými přihláškami založeného v posledních 3 dnech
create or replace function public.tournament_special_push_items() returns table (user_id uuid, kind text, title text, body text, url text, dedupe_key text, sort_at text)
language sql stable set search_path = public as $$
    select pr.id, 'tournament_special'::text, 'Začíná speciální turnaj: ' || t.title,
        'Přihlášky jsou otevřené, začíná ' || public.tournament_special_when(t.starts_at) || '. Přihlas se na záložce Soupeři v okně Turnaje.',
        './?tab=multi'::text, 'tsp:' || t.id || ':' || pr.id, t.created_at::text
    from public.tournaments t
    join public.profiles pr on pr.push_tournament
    where t.kind = 'special' and t.status = 'open' and t.starts_at > public.tournament_now() and t.created_at > now() - interval '3 days'
        and exists (select 1 from public.push_subscriptions s where s.user_id = pr.id and s.fails < 3)
        and not exists (select 1 from public.tournament_entries e where e.tournament_id = t.id and e.user_id = pr.id)
        and not public.dev_is_bot(pr.id)
$$;

-- Psaní odpovědí jen pro jednoho hráče: nová výzva (i výzva skupině, odveta a výzva se sázkou) má vždy výběr z možností. Psanou výzvu
-- odmítne (starší aplikace dostane českou hlášku), bez způsobu odpovídání ji založí s výběrem z možností. Výzvy založené dřív (i psané,
-- 'typed', a bez způsobu odpovídání) se hrají dál jako dřív: challenge_progress_save u nich pustí až 8 bodů za otázku. Správce (postgres)
-- se tím neřídí (jako result_from_progress).
create or replace function public.challenge_variant_choices() returns trigger
language plpgsql set search_path = public as $$
begin
    if current_user not in ('authenticated', 'anon') then return new; end if;
    if new.variant = 'typed' then
        raise exception 'Psaní odpovědí je jen ve hře pro jednoho hráče, výzvy se hrají s výběrem z možností.' using errcode = 'P0001';
    end if;
    new.variant := 'choices';
    return new;
end;
$$;
drop trigger if exists challenges_variant_choices on public.challenges;
create trigger challenges_variant_choices before insert on public.challenges for each row execute function public.challenge_variant_choices();

-- Oprávnění: hráč volá stav hlasování a hlas, správce své nástroje (dev_check); pomocné funkce jen interně
revoke all on function public.tournament_now(), public.tournament_round_phase(public.tournaments, integer), public.tournament_round_end(public.tournaments, integer),
    public.tournament_poll_pick(bigint), public.tournament_poll_current(), public.tournament_poll_json(public.tournament_polls, uuid),
    public.tournament_poll_close(text, uuid), public.tournament_special_when(timestamptz), public.tournament_push_until(timestamptz),
    public.tournament_special_push_items(), public.challenge_variant_choices() from public, anon, authenticated;
revoke all on function public.tournament_poll_state(), public.tournament_vote(bigint, text), public.dev_tournament_poll_close(),
    public.dev_special_tournament_create(text, timestamptz, integer), public.dev_special_tournament_delete(uuid) from public, anon;
grant execute on function public.tournament_poll_state(), public.tournament_vote(bigint, text), public.dev_tournament_poll_close(),
    public.dev_special_tournament_create(text, timestamptz, integer), public.dev_special_tournament_delete(uuid) to authenticated;
-- ===== 31: Speciální turnaje na téma, hlasování o tématu a psaní odpovědí jen pro jednoho hráče — KONEC BLOKU =====

-- ===== 32: Motivace – pozvánky kamarádů, prestiž, reakce a vítězné efekty, vitrína se sezónou a kontrola odemčení =====
-- Pět věcí, které spojuje „co hráč získal“:
-- 1) Kontrola odemčení na serveru (unlock_catalog, unlock_ok, check_unlocks): rámeček, titul u jména, sova (talár, sova titulu, doplňky
--    a jejich barvy), obrázek hráče (postavička) a vítězný efekt se do profilu uloží, jen když je hráč má odemčené podle toho, co ví server:
--    úroveň z XP v účtu (level_of_xp, stejné hranice jako quiz-core.js LEVEL_XP), odznaky v účtu (i vyšší stupeň téže skupiny, badge_owned
--    a badge_tiers podle quiz-core.js BADGE_GROUPS), nejlepší skončená ligová sezóna (league_peaks), prestiž a odměny za pozvané kamarády.
--    Podmínky, které zná jen zařízení, server nehlídá a bere je ze zápisu aplikace v účtu (profiles.rewards): věci z Truhly Mudrlanta
--    a ze Sezóny Mudrlanta (gifts; truhla dává i věci za úroveň dřív, proto u nich stačí dar) a diplomy (legendární postavičky). Je to kontrola
--    soudržnosti, ne ochrana: rewards píše aplikace. Zamčenou volbu server tiše nepřijme (zůstane předchozí hodnota, ze sovy vypadne zamčený
--    doplněk, zamčený talár se změní na vínový, zamčená sova titulu na nejvyšší dosaženou); hodnoty, které profil už má, se nemění.
--    Katalog odpovídá look.js a friends.js (hlídá tests/motivace.test.js). Vlastní barva obleku (robe-color.js) je talár 'vlastni' za úroveň 20;
--    její odstín a světlost nese část sovy 'robec=odstín.světlost', kterou kontrola nechá být.
-- 2) Pozvi kamarády (referral.js): kód přítele (referral_codes), kdo koho pozval (referrals, jen nový účet do 14 dnů, jednou) a vyzvednuté
--    odměny (referral_rewards: 'novacek' pozvanému po první hře, 'pritel-1', 'pritel-3', 'pritel-10' zvoucímu za kamarády, kteří odehráli
--    aspoň 3 hry známé serveru: referral_games). Funkce referral_status, referral_join (i přátelství) a referral_claim.
-- 3) Prestiž po úrovni 100 (prestige.js): profiles.prestige a prestige_xp jen přes prestige_up() (XP v účtu musí stačit).
-- 4) Reakce po zápase navíc (friends.js EXTRA_REACTIONS): check_reaction přijme jen reakci, kterou má odesílatel odemčenou;
--    vítězný efekt profiles.victory_fx (friends.js VICTORY_EFFECTS).
-- 5) Vitrína: i titul ze Sezóny Mudrlanta (t:<titul>) a věc ze Sezóny (s:<druh>:<id>), jen když je hráč má mezi dárky v účtu.

-- Úroveň z XP (1–100): stejné hranice jako quiz-core.js LEVEL_XP
create or replace function public.level_of_xp(xp integer) returns integer
language sql immutable set search_path = public as $$
    select count(*)::integer from unnest(array[0, 90, 250, 480, 750, 1150, 1550, 2000, 2600, 3200, 3900, 4700, 5500, 6400, 7300, 8300, 9400, 10500, 12000, 13000, 14500, 16000, 17500, 19000, 20500, 22000, 24000, 25500, 27500, 29500, 31500, 33500, 36000, 38000, 40500, 42500, 45000, 47500, 50000, 53000, 55000, 58000, 61000, 64000, 67000, 70000, 73000, 76000, 79000, 82000, 86000, 89000, 93000, 96000, 100000, 103000, 107000, 111000, 115000, 119000, 123000, 127000, 131000, 135000, 139000, 144000, 148000, 152000, 157000, 162000, 166000, 171000, 176000, 181000, 185000, 190000, 196000, 201000, 206000, 211000, 216000, 222000, 227000, 233000, 238000, 244000, 250000, 255000, 261000, 267000, 273000, 279000, 285000, 292000, 298000, 304000, 310000, 317000, 323000, 330000]) t where coalesce(xp, 0) >= t;
$$;

-- Skupiny odznaků se stupni od nejnižšího (quiz-core.js BADGE_GROUPS): do účtu jde jen nejvyšší stupeň, nižší se dopočítají
create or replace function public.badge_tiers() returns table (grp text, tiers text[])
language sql immutable set search_path = public as $$
    select * from (values
        ('odpovedi', array['prvni-krok', 'odpovedi-10', 'odpovedi-50', 'stovka', 'odpovedi-250', 'odpovedi-500', 'tisicovka', 'odpovedi-2500', 'odpovedi-5000', 'odpovedi-10000']),
        ('rada', array['rada-5', 'strelec', 'neomylny', 'rada-50', 'rada-100', 'rada-200']),
        ('serie', array['serie-3', 'tyden', 'serie-14', 'mesic', 'serie-60', 'serie-100', 'serie-200', 'serie-365']),
        ('dny', array['dny-5', 'dny-15', 'dny-30', 'dny-60', 'dny-100', 'dny-200', 'dny-365']),
        ('dokonale', array['dokonaly-den', 'dokonale-3', 'dokonale-7', 'dokonale-14', 'dokonale-30', 'dokonale-60']),
        ('dnes', array['dnes-10', 'dnes-50', 'dnes-100', 'dnes-250', 'dnes-500', 'dnes-1000']),
        ('bez-napovedy', array['bez-napovedy-10', 'bez-napovedy', 'bez-napovedy-100', 'bez-napovedy-500', 'bez-napovedy-1000', 'bez-napovedy-2500']),
        ('psani', array['psani-10', 'pisatel', 'psani-100', 'psani-500', 'psani-1000', 'psani-2500']),
        ('tezke', array['do-hloubky', 'tezke-50', 'tezke-200', 'tezke-500', 'tezke-1000']),
        ('chyby', array['chyby-10', 'chyby-50', 'chyby-200', 'chyby-500', 'chyby-1000']),
        ('vyzvy', array['soupere', 'vyzvy-5', 'vyzvy-25', 'vyzvy-100', 'vyzvy-250', 'vyzvy-500']),
        ('vyhry', array['vitez', 'vyhry-5', 'gladiator', 'vyhry-25', 'vyhry-50', 'vyhry-100']),
        ('vyhry-v-rade', array['vyhry-v-rade-3', 'vyhry-v-rade-5', 'vyhry-v-rade-10', 'vyhry-v-rade-15', 'vyhry-v-rade-25']),
        ('zalozene', array['zalozene-1', 'zalozene-10', 'zalozene-50', 'zalozene-100', 'zalozene-250']),
        ('perfektni-vyzvy', array['perfektni-vyzvy-1', 'perfektni-vyzvy-5', 'perfektni-vyzvy-25', 'perfektni-vyzvy-50', 'perfektni-vyzvy-100']),
        ('uroven', array['uroven-5', 'znalec', 'uroven-20', 'mudrc', 'uroven-50', 'uroven-65', 'uroven-80', 'uroven-100']),
        ('poznane', array['poznane-100', 'poznane-500', 'poznane-1000', 'poznane-3000', 'poznane-5000', 'poznane-10000']),
        ('vsestrannost', array['vsestrannost-3', 'vsestrannost-6', 'vsestrannost-9', 'vsestrannost-12', 'vsestranny']),
        ('hvezdy', array['hvezdy-1', 'hvezdy-2', 'hvezdar', 'hvezdy-4', 'mistr-oboru']),
        ('vsechna-temata', array['vsechna-temata-1', 'vsechna-temata-2', 'vsechna-temata-3', 'vsechna-temata-4', 'vsechna-temata-5']),
        ('tema-zemepis', array['tema-zemepis-25', 'tema-zemepis-100', 'tema-zemepis-300', 'tema-zemepis-600', 'tema-zemepis-1000']),
        ('tema-vlajky', array['tema-vlajky-25', 'tema-vlajky-100', 'tema-vlajky-300', 'tema-vlajky-600', 'tema-vlajky-1000']),
        ('tema-historie', array['tema-historie-25', 'tema-historie-100', 'tema-historie-300', 'tema-historie-600', 'tema-historie-1000']),
        ('tema-mytologie', array['tema-mytologie-25', 'tema-mytologie-100', 'tema-mytologie-300', 'tema-mytologie-600', 'tema-mytologie-1000']),
        ('tema-biologie', array['tema-biologie-25', 'tema-biologie-100', 'tema-biologie-300', 'tema-biologie-600', 'tema-biologie-1000']),
        ('tema-geologie', array['tema-geologie-25', 'tema-geologie-100', 'tema-geologie-300', 'tema-geologie-600', 'tema-geologie-1000']),
        ('tema-chemie', array['tema-chemie-25', 'tema-chemie-100', 'tema-chemie-300', 'tema-chemie-600', 'tema-chemie-1000']),
        ('tema-fyzika', array['tema-fyzika-25', 'tema-fyzika-100', 'tema-fyzika-300', 'tema-fyzika-600', 'tema-fyzika-1000']),
        ('tema-umeni', array['tema-umeni-25', 'tema-umeni-100', 'tema-umeni-300', 'tema-umeni-600', 'tema-umeni-1000']),
        ('tema-architektura', array['tema-architektura-25', 'tema-architektura-100', 'tema-architektura-300', 'tema-architektura-600', 'tema-architektura-1000']),
        ('tema-hudba', array['tema-hudba-25', 'tema-hudba-100', 'tema-hudba-300', 'tema-hudba-600', 'tema-hudba-1000']),
        ('tema-literatura', array['tema-literatura-25', 'tema-literatura-100', 'tema-literatura-300', 'tema-literatura-600', 'tema-literatura-1000']),
        ('tema-film', array['tema-film-25', 'tema-film-100', 'tema-film-300', 'tema-film-600', 'tema-film-1000']),
        ('tema-sport', array['tema-sport-25', 'tema-sport-100', 'tema-sport-300', 'tema-sport-600', 'tema-sport-1000']),
        ('zbehly-zemepis', array['zbehly-zemepis-5', 'zbehly-zemepis', 'zbehly-zemepis-25', 'zbehly-zemepis-50', 'zbehly-zemepis-100']),
        ('zbehly-vlajky', array['zbehly-vlajky-5', 'zbehly-vlajky', 'zbehly-vlajky-25', 'zbehly-vlajky-50', 'zbehly-vlajky-100']),
        ('zbehly-historie', array['zbehly-historie-5', 'zbehly-historie', 'zbehly-historie-25', 'zbehly-historie-50', 'zbehly-historie-100']),
        ('zbehly-mytologie', array['zbehly-mytologie-5', 'zbehly-mytologie', 'zbehly-mytologie-25', 'zbehly-mytologie-50', 'zbehly-mytologie-100']),
        ('zbehly-biologie', array['zbehly-biologie-5', 'zbehly-biologie', 'zbehly-biologie-25', 'zbehly-biologie-50', 'zbehly-biologie-100']),
        ('zbehly-geologie', array['zbehly-geologie-5', 'zbehly-geologie', 'zbehly-geologie-25', 'zbehly-geologie-50', 'zbehly-geologie-100']),
        ('zbehly-chemie', array['zbehly-chemie-5', 'zbehly-chemie', 'zbehly-chemie-25', 'zbehly-chemie-50', 'zbehly-chemie-100']),
        ('zbehly-fyzika', array['zbehly-fyzika-5', 'zbehly-fyzika', 'zbehly-fyzika-25', 'zbehly-fyzika-50', 'zbehly-fyzika-100']),
        ('zbehly-umeni', array['zbehly-umeni-5', 'zbehly-umeni', 'zbehly-umeni-25', 'zbehly-umeni-50', 'zbehly-umeni-100']),
        ('zbehly-architektura', array['zbehly-architektura-5', 'zbehly-architektura', 'zbehly-architektura-25', 'zbehly-architektura-50', 'zbehly-architektura-100']),
        ('zbehly-hudba', array['zbehly-hudba-5', 'zbehly-hudba', 'zbehly-hudba-25', 'zbehly-hudba-50', 'zbehly-hudba-100']),
        ('zbehly-literatura', array['zbehly-literatura-5', 'zbehly-literatura', 'zbehly-literatura-25', 'zbehly-literatura-50', 'zbehly-literatura-100']),
        ('zbehly-film', array['zbehly-film-5', 'zbehly-film', 'zbehly-film-25', 'zbehly-film-50', 'zbehly-film-100']),
        ('zbehly-sport', array['zbehly-sport-5', 'zbehly-sport', 'zbehly-sport-25', 'zbehly-sport-50', 'zbehly-sport-100']),
        ('turnaje', array['turnaj-ucast', 'turnaj-ctvrtfinale', 'turnaj-semifinale', 'turnaj-bronz', 'turnaj-stribro', 'turnaj-zlato']),
        ('turnaj-postupy', array['turnaj-postupy-1', 'turnaj-postupy-5', 'turnaj-postupy-15', 'turnaj-postupy-30', 'turnaj-postupy-60']),
        ('tydenni-cile', array['tydenni-cile', 'tydenni-cile-5', 'tydenni-cile-10', 'tydenni-cile-20', 'tydenni-cile-52']),
        ('kviz-dne', array['kviz-dne', 'kviz-dne-10', 'kviz-dne-50', 'kviz-dne-100', 'kviz-dne-365']),
        ('kviz-serie', array['kviz-serie-3', 'kviz-tyden', 'kviz-serie-14', 'kviz-serie-30', 'kviz-serie-100']),
        ('kviz-perfekt', array['kviz-perfekt', 'kviz-perfekt-5', 'kviz-perfekt-20', 'kviz-perfekt-50', 'kviz-perfekt-100']),
        ('bleskovka', array['bleskovka-8', 'bleskovka-12', 'bleskovka-16', 'bleskovka-20', 'bleskovka-25']),
        ('preziti', array['preziti-10', 'preziti-20', 'preziti-35', 'preziti-50', 'preziti-75']),
        ('mapa', array['mapa-5', 'mapa-25', 'mapa-100', 'mapa-250', 'mapa-500']),
        ('odhad', array['odhad-5', 'odhad-25', 'odhad-100', 'odhad-250', 'odhad-500']),
        ('serad', array['serad-5', 'serad-25', 'serad-100', 'serad-250', 'serad-500']),
        ('detektiv', array['detektiv', 'detektiv-7', 'detektiv-30', 'detektiv-100', 'detektiv-365']),
        ('retezovka', array['retezovka', 'retezovka-10', 'retezovka-30', 'retezovka-100', 'retezovka-365']),
        ('retezovka-cela', array['retezovka-cela', 'retezovka-cela-5', 'retezovka-cela-15', 'retezovka-cela-30', 'retezovka-cela-60']),
        ('zlatokop', array['zlatokop-10', 'zlatokop-50', 'zlatokop-100']),
        ('dobyvatel', array['dobyvatel', 'dobyvatel-3', 'dobyvatel-10', 'dobyvatel-25', 'dobyvatel-50']),
        ('sazky', array['sazky-1', 'sazkar', 'sazky-15', 'sazky-30', 'sazky-60']),
        ('sazky-v-rade', array['sazky-v-rade-3', 'sazky-v-rade-5', 'sazky-v-rade-7', 'sazky-v-rade-10', 'sazky-v-rade-15']),
        ('sberatel', array['sberatel-25', 'sberatel-50', 'sberatel-75', 'sberatel-100']),
        ('album-avatars', array['album-avatars']),
        ('album-accessories', array['album-accessories']),
        ('album-themes', array['album-themes']),
        ('album-badges', array['album-badges']),
        ('album-diplomas', array['album-diplomas']),
        ('boss-kapitan', array['boss-kapitan']),
        ('boss-rytir', array['boss-rytir']),
        ('boss-alchymista', array['boss-alchymista']),
        ('boss-amper', array['boss-amper']),
        ('boss-maestro', array['boss-maestro']),
        ('boss-druid', array['boss-druid']),
        ('boss-olympan', array['boss-olympan']),
        ('boss-reziser', array['boss-reziser'])
    ) as t (grp, tiers);
$$;
-- Má hráč odznak (přímo, nebo vyšší stupeň téže skupiny)?
create or replace function public.badge_owned(badges text[], wanted text) returns boolean
language sql stable set search_path = public as $$
    select wanted = any (coalesce(badges, '{}')) or exists (
        select 1 from public.badge_tiers() g, unnest(coalesce(badges, '{}')) b
        where wanted = any (g.tiers) and array_position(g.tiers, b) > array_position(g.tiers, wanted));
$$;

-- Řádky katalogu z pozdějších bloků (blok 35: další postavičky). Tady prázdné, pozdější blok funkci nahradí (spouští se celý soubor,
-- takže po bloku 32 vždy přijde i jeho náhrada); unlock_catalog() je přidá za řádky tohoto bloku.
create or replace function public.unlock_catalog_more() returns table (cat text, item text, rule text)
language sql immutable set search_path = public as $$
    select null::text, null::text, null::text where false;
$$;
-- Katalog odemykání (look.js FRAMES, TITLES, ROBES, ACCESSORIES, ACC_COLORS, POSES, AVATARS i se starými emoji, friends.js reakce a efekty):
-- cat = druh, item = id, rule = 'free' | 'level:N' | 'badge:<odznak>' | 'league:<liga>' | 'gift' (jen dar z truhly) | 'season-gift' (dar ze Sezóny)
-- | 'diploma:<téma>' | 'season:10|20' (stupeň Sezóny podle darů) | 'referral:<klíče>' | 'prestige:N'
create or replace function public.unlock_catalog() returns table (cat text, item text, rule text)
language sql immutable set search_path = public as $$
    select * from (values
        ('frames', 'zadny', 'free'), ('frames', 'bronz', 'level:5'), ('frames', 'stribro', 'level:15'), ('frames', 'zlato', 'level:25'),
        ('frames', 'vavrin', 'badge:vitez'), ('frames', 'plamen', 'badge:mesic'), ('frames', 'diamant', 'level:60'), ('frames', 'medailista', 'badge:turnaj-bronz'),
        ('frames', 'mistr-turnaje', 'badge:turnaj-zlato'), ('frames', 'liga-stribro', 'league:stribro'), ('frames', 'liga-zlato', 'league:zlato'), ('frames', 'liga-platina', 'league:platina'),
        ('frames', 'liga-diamant', 'league:diamant'), ('frames', 'liga-mistr', 'league:mistr'), ('frames', 'jiskra', 'badge:tyden'), ('frames', 'stovka', 'badge:serie-100'),
        ('frames', 'vecny-ohen', 'badge:serie-365'), ('frames', 'sezona-01', 'season-gift'), ('frames', 'sezona-01-b', 'season-gift'), ('frames', 'sezona-02', 'season-gift'),
        ('frames', 'sezona-02-b', 'season-gift'), ('frames', 'sezona-03', 'season-gift'), ('frames', 'sezona-03-b', 'season-gift'), ('frames', 'sezona-04', 'season-gift'),
        ('frames', 'sezona-04-b', 'season-gift'), ('frames', 'sezona-05', 'season-gift'), ('frames', 'sezona-05-b', 'season-gift'), ('frames', 'sezona-06', 'season-gift'),
        ('frames', 'sezona-06-b', 'season-gift'), ('frames', 'sezona-07', 'season-gift'), ('frames', 'sezona-07-b', 'season-gift'), ('frames', 'sezona-08', 'season-gift'),
        ('frames', 'sezona-08-b', 'season-gift'), ('frames', 'sezona-09', 'season-gift'), ('frames', 'sezona-09-b', 'season-gift'), ('frames', 'sezona-10', 'season-gift'),
        ('frames', 'sezona-10-b', 'season-gift'), ('frames', 'sezona-11', 'season-gift'), ('frames', 'sezona-11-b', 'season-gift'), ('frames', 'sezona-12', 'season-gift'),
        ('frames', 'sezona-12-b', 'season-gift'), ('frames', 'sberatel', 'badge:sberatel-100'), ('frames', 'ohen', 'level:37'), ('frames', 'more', 'level:49'),
        ('frames', 'soukoli', 'level:63'), ('frames', 'galaxie', 'level:77'), ('frames', 'kralovsky-vavrin', 'level:94'), ('frames', 'blesk', 'badge:bleskovka-20'),
        ('frames', 'led', 'badge:preziti-50'), ('frames', 'drak', 'badge:vsechna-temata-3'), ('frames', 'dobyvatel', 'badge:dobyvatel'), ('frames', 'duha-mracky', 'gift'),
        ('frames', 'ruze', 'gift'), ('frames', 'pratelsky', 'referral:novacek,pritel-1'), ('frames', 'parta', 'referral:pritel-10'), ('frames', 'prestiz', 'prestige:1'),
        ('titles', 'sampion-sezony', 'season-gift'), ('robes', 'vinova', 'free'), ('robes', 'zelena', 'level:6'), ('robes', 'modra', 'level:12'),
        ('robes', 'ruzova', 'level:20'), ('robes', 'fialova', 'level:30'), ('robes', 'cerna', 'level:45'), ('robes', 'zlata', 'level:65'),
        ('robes', 'bila', 'level:100'), ('robes', 'vlastni', 'level:20'), ('accessories', 'bryle', 'level:4'), ('accessories', 'motylek', 'level:9'),
        ('accessories', 'sala', 'level:14'), ('accessories', 'slunecni-bryle', 'level:18'), ('accessories', 'lupa', 'level:24'), ('accessories', 'kvetina', 'level:32'),
        ('accessories', 'koruna', 'level:42'), ('accessories', 'sluchatka', 'level:50'), ('accessories', 'medaile', 'level:58'), ('accessories', 'vavrin', 'badge:vitez'),
        ('accessories', 'kompas', 'badge:zbehly-zemepis'), ('accessories', 'vlajka', 'badge:zbehly-vlajky'), ('accessories', 'svitek', 'badge:zbehly-historie'), ('accessories', 'helma', 'badge:zbehly-mytologie'),
        ('accessories', 'sitka', 'badge:zbehly-biologie'), ('accessories', 'prilba', 'badge:zbehly-geologie'), ('accessories', 'lab-bryle', 'badge:zbehly-chemie'), ('accessories', 'knir', 'badge:zbehly-fyzika'),
        ('accessories', 'baret', 'badge:zbehly-umeni'), ('accessories', 'metr', 'badge:zbehly-architektura'), ('accessories', 'mikrofon', 'badge:zbehly-hudba'), ('accessories', 'brk', 'badge:zbehly-literatura'),
        ('accessories', '3d-bryle', 'badge:zbehly-film'), ('accessories', 'celenka', 'badge:zbehly-sport'), ('accessories', 'cylindr', 'level:62'), ('accessories', 'letecke-bryle', 'level:68'),
        ('accessories', 'stetoskop', 'level:72'), ('accessories', 'kouzelnicky-klobouk', 'level:76'), ('accessories', 'zlaty-retez', 'level:84'), ('accessories', 'hulka', 'level:88'),
        ('accessories', 'svatozar', 'level:99'), ('accessories', 'piratsky-klobouk', 'badge:vyhry-25'), ('accessories', 'maska', 'badge:turnaj-zlato'), ('accessories', 'mec', 'badge:turnaj-postupy-15'),
        ('accessories', 'plast', 'badge:serie-100'), ('accessories', 'pochoden', 'league:diamant'), ('accessories', 'vrtulka', 'gift'), ('accessories', 'srdickove-bryle', 'gift'),
        ('accessories', 'vencek', 'gift'), ('accessories', 'paska', 'gift'), ('accessories', 'hrnek', 'gift'), ('accessories', 'cestovatelsky-klobouk', 'badge:tema-zemepis-300'),
        ('accessories', 'globus', 'badge:tema-zemepis-1000'), ('accessories', 'namornicka-cepice', 'badge:tema-vlajky-300'), ('accessories', 'praporky', 'badge:tema-vlajky-1000'), ('accessories', 'krejzlik', 'badge:tema-historie-1000'),
        ('accessories', 'blesk', 'badge:tema-mytologie-300'), ('accessories', 'zlate-rouno', 'badge:tema-mytologie-1000'), ('accessories', 'hnizdo', 'badge:tema-biologie-300'), ('accessories', 'dalekohled', 'badge:tema-biologie-1000'),
        ('accessories', 'kladivko', 'badge:tema-geologie-300'), ('accessories', 'krystal', 'badge:tema-geologie-1000'), ('accessories', 'banka', 'badge:tema-chemie-300'), ('accessories', 'vybuch', 'badge:tema-chemie-1000'),
        ('accessories', 'magnet', 'badge:tema-fyzika-300'), ('accessories', 'jablko', 'badge:tema-fyzika-1000'), ('accessories', 'paleta', 'badge:tema-umeni-300'), ('accessories', 'dali-knir', 'badge:tema-umeni-1000'),
        ('accessories', 'plany', 'badge:tema-architektura-300'), ('accessories', 'tesarska-tuzka', 'badge:tema-architektura-1000'), ('accessories', 'hvezdne-bryle', 'badge:tema-hudba-300'), ('accessories', 'kytara', 'badge:tema-hudba-1000'),
        ('accessories', 'knihy', 'badge:tema-literatura-300'), ('accessories', 'pulmesicove-bryle', 'badge:tema-literatura-1000'), ('accessories', 'popcorn', 'badge:tema-film-300'), ('accessories', 'filmovy-pas', 'badge:tema-film-1000'),
        ('accessories', 'pistalka', 'badge:tema-sport-300'), ('accessories', 'pohar', 'badge:tema-sport-1000'), ('accessories', 'cepice-zimni', 'season-gift'), ('accessories', 'karneval', 'season-gift'),
        ('accessories', 'jarni-venecek', 'season-gift'), ('accessories', 'destnik', 'season-gift'), ('accessories', 'konvalinky', 'season-gift'), ('accessories', 'slamak', 'season-gift'),
        ('accessories', 'snorchl', 'season-gift'), ('accessories', 'zmrzlina', 'season-gift'), ('accessories', 'tuzka', 'season-gift'), ('accessories', 'dyne', 'season-gift'),
        ('accessories', 'lampion', 'season-gift'), ('accessories', 'sala-zimni', 'season-gift'), ('colors', 'original', 'free'), ('colors', 'cervena', 'free'),
        ('colors', 'modra', 'free'), ('colors', 'zelena', 'level:8'), ('colors', 'oranzova', 'level:16'), ('colors', 'zluta', 'level:26'),
        ('colors', 'ruzova', 'level:38'), ('colors', 'fialova', 'level:52'), ('colors', 'cerna', 'level:60'), ('colors', 'vlastni', 'level:80'),
        ('poses', 'titul-1', 'free'), ('poses', 'titul-2', 'level:7'), ('poses', 'titul-3', 'level:12'), ('poses', 'titul-4', 'level:18'),
        ('poses', 'titul-5', 'level:27'), ('poses', 'titul-6', 'level:36'), ('poses', 'titul-7', 'level:45'), ('poses', 'titul-8', 'level:56'),
        ('poses', 'titul-9', 'level:68'), ('poses', 'titul-10', 'level:84'), ('poses', 'titul-11', 'level:100'), ('avatars', 'cervik', 'level:3'),
        ('avatars', '🦅', 'level:3'), ('avatars', 'axolot', 'level:8'), ('avatars', '🐺', 'level:8'), ('avatars', 'kaktus', 'level:13'),
        ('avatars', '🦈', 'level:13'), ('avatars', 'drak', 'level:20'), ('avatars', '🐉', 'level:20'), ('avatars', 'mamut', 'level:28'),
        ('avatars', '🦖', 'level:28'), ('avatars', 'meduza', 'level:36'), ('avatars', '🦚', 'level:36'), ('avatars', 'lenoch', 'level:44'),
        ('avatars', '🦩', 'level:44'), ('avatars', 'tukan', 'level:55'), ('avatars', '🐅', 'level:55'), ('avatars', 'lev', 'level:65'),
        ('avatars', '🦁', 'level:65'), ('avatars', 'fenix', 'level:80'), ('avatars', '👑', 'level:80'), ('avatars', 'krecek', 'badge:turnaj-ucast'),
        ('avatars', '🏅', 'badge:turnaj-ucast'), ('avatars', 'rytir', 'badge:turnaj-bronz'), ('avatars', '🥉', 'badge:turnaj-bronz'), ('avatars', 'narval', 'badge:turnaj-stribro'),
        ('avatars', '🥈', 'badge:turnaj-stribro'), ('avatars', 'zelva', 'badge:turnaj-zlato'), ('avatars', '🏆', 'badge:turnaj-zlato'), ('avatars', 'hodiny', 'badge:kviz-tyden'),
        ('avatars', '⏱️', 'badge:kviz-tyden'), ('avatars', '⏱', 'badge:kviz-tyden'), ('avatars', 'chamel', 'badge:kviz-perfekt'), ('avatars', '💯', 'badge:kviz-perfekt'),
        ('avatars', 'gepard', 'badge:bleskovka-16'), ('avatars', '⚡', 'badge:bleskovka-16'), ('avatars', 'zelvus', 'badge:preziti-20'), ('avatars', '🐻', 'badge:preziti-20'),
        ('avatars', 'tucnak', 'badge:mapa-25'), ('avatars', '🗺️', 'badge:mapa-25'), ('avatars', '🗺', 'badge:mapa-25'), ('avatars', 'zabak', 'badge:odhad-25'),
        ('avatars', '🎯', 'badge:odhad-25'), ('avatars', 'myval', 'badge:serad-25'), ('avatars', '🧩', 'badge:serad-25'), ('avatars', 'albatr', 'diploma:zemepis'),
        ('avatars', 'gryf', 'diploma:vlajky'), ('avatars', 'slon', 'diploma:historie'), ('avatars', 'sfinga', 'diploma:mytologie'), ('avatars', 'jelen', 'diploma:biologie'),
        ('avatars', 'golem', 'diploma:geologie'), ('avatars', 'liska', 'diploma:chemie'), ('avatars', 'chobot', 'diploma:fyzika'), ('avatars', 'pav', 'diploma:umeni'),
        ('avatars', 'bobr', 'diploma:architektura'), ('avatars', 'vlk', 'diploma:hudba'), ('avatars', 'kndrak', 'diploma:literatura'), ('avatars', 'panda', 'diploma:film'),
        ('avatars', 'klokan', 'diploma:sport'), ('avatars', 'ramp', 'season-gift'), ('avatars', 'kobliz', 'season-gift'), ('avatars', 'snezen', 'season-gift'),
        ('avatars', 'kapka', 'season-gift'), ('avatars', 'pampel', 'season-gift'), ('avatars', 'vysved', 'season-gift'), ('avatars', 'meloun', 'season-gift'),
        ('avatars', 'hvezda', 'season-gift'), ('avatars', 'aktovk', 'season-gift'), ('avatars', 'drakpa', 'season-gift'), ('avatars', 'caj', 'season-gift'),
        ('avatars', 'pernik', 'season-gift'), ('reactions', '👍', 'free'), ('reactions', '🔥', 'free'), ('reactions', '😅', 'free'),
        ('reactions', '🤝', 'free'), ('reactions', '😮', 'level:5'), ('reactions', '🧠', 'level:15'), ('reactions', '🦉', 'level:30'),
        ('reactions', '🙌', 'level:50'), ('reactions', '🎯', 'badge:strelec'), ('reactions', '💪', 'badge:vyzvy-25'), ('reactions', '🎉', 'season:10'),
        ('reactions', '👑', 'season:20'), ('reactions', '🤗', 'referral:pritel-3'), ('fx', 'konfety', 'level:5'), ('fx', 'hvezdy', 'level:20'),
        ('fx', 'ohnostroj', 'level:40'), ('fx', 'koruna', 'badge:vyhry-25'), ('fx', 'blesky', 'badge:vyhry-v-rade-5'), ('fx', 'sezona', 'season:20'),
        ('fx', 'srdicka', 'referral:pritel-3')
    ) as t (cat, item, rule)
    union all select * from public.unlock_catalog_more();
$$;

-- Nejlepší liga skončené ligové sezóny hráče (pořadí 1 = bronz … 6 = mistr, 0 = žádná)
create or replace function public.league_best_rank(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
    select coalesce(max(array_position(array['bronz', 'stribro', 'zlato', 'platina', 'diamant', 'mistr'], public.rating_league(p.peak))), 0)::integer
    from public.league_peaks(uid) p where p.month < to_char(now() at time zone 'Europe/Prague', 'YYYY-MM');
$$;

-- ----- Pozvi kamarády -----
create table if not exists public.referral_codes (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    code text not null unique,
    created_at timestamptz not null default now()
);
alter table public.referral_codes drop constraint if exists referral_codes_format;
alter table public.referral_codes add constraint referral_codes_format check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$');
create table if not exists public.referrals (
    invitee uuid primary key references public.profiles (id) on delete cascade,
    inviter uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    check (invitee <> inviter)
);
create index if not exists referrals_inviter_idx on public.referrals (inviter, created_at);
create table if not exists public.referral_rewards (
    user_id uuid not null references public.profiles (id) on delete cascade,
    reward text not null,
    claimed_at timestamptz not null default now(),
    primary key (user_id, reward)
);
alter table public.referral_rewards drop constraint if exists referral_rewards_list;
alter table public.referral_rewards add constraint referral_rewards_list check (reward in ('novacek', 'pritel-1', 'pritel-3', 'pritel-10'));
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;
drop policy if exists "kód přítele: vlastní" on public.referral_codes;
create policy "kód přítele: vlastní" on public.referral_codes for select to authenticated using (user_id = auth.uid());
drop policy if exists "pozvánky: obě strany" on public.referrals;
create policy "pozvánky: obě strany" on public.referrals for select to authenticated using (auth.uid() in (invitee, inviter));
drop policy if exists "odměny za pozvání: vlastní" on public.referral_rewards;
create policy "odměny za pozvání: vlastní" on public.referral_rewards for select to authenticated using (user_id = auth.uid());
revoke all on public.referral_codes, public.referrals, public.referral_rewards from anon, authenticated;
grant select on public.referral_codes, public.referrals, public.referral_rewards to authenticated;

-- Kód přítele hráče (založí se při prvním dotazu; 8 znaků bez zaměnitelných 0/O a 1/I/L)
create or replace function public.referral_code_for(uid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
    found_code text;
    candidate text;
    tries integer := 0;
begin
    select code into found_code from public.referral_codes where user_id = uid;
    if found_code is not null then return found_code; end if;
    loop
        candidate := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::integer, 1), '') from generate_series(1, 8));
        begin
            insert into public.referral_codes (user_id, code) values (uid, candidate);
            return candidate;
        exception when unique_violation then
            -- souběžné založení téhož hráče, nebo srážka kódu: zkusí se znovu
            select code into found_code from public.referral_codes where user_id = uid;
            if found_code is not null then return found_code; end if;
            tries := tries + 1;
            if tries > 20 then raise; end if;
        end;
    end loop;
end;
$$;
-- Odehrané hry, které zná server: dohraný Kvíz dne, výzva, Řetězovka, Tajemná otázka (aspoň jeden tip) a souboje s bossem
create or replace function public.referral_games(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
    select ((select count(*) from public.daily_quiz_results where user_id = uid and answered > 0)
        + (select count(*) from public.challenge_results where user_id = uid)
        + (select count(*) from public.chain_results where user_id = uid)
        + (select count(*) from public.mystery_results where user_id = uid and (solved or guesses > 0))
        + (select coalesce(sum(attempts), 0) from public.boss_results where user_id = uid))::integer;
$$;
-- Kolik pozvaných kamarádů se počítá (aspoň 3 hry)
create or replace function public.referral_qualified(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
    select count(*)::integer from (select r.invitee from public.referrals r where r.inviter = uid order by r.created_at limit 200) x
    where public.referral_games(x.invitee) >= 3;
$$;
-- Odměny, které hráč může vyzvednout (ještě nevyzvednuté): pozvaný po první hře (hra známá serveru, nebo XP v účtu), zvoucí za 1, 3 a 10 kamarádů
create or replace function public.referral_ready(uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
    select coalesce(array_agg(x.k order by x.o), '{}') from (
        select 'novacek' as k, 0 as o where exists (select 1 from public.referrals r where r.invitee = uid)
            and (public.referral_games(uid) >= 1 or coalesce((select p.xp from public.profiles p where p.id = uid), 0) > 0)
        union all
        select 'pritel-' || t, t from unnest(array[1, 3, 10]) t where public.referral_qualified(uid) >= t
    ) x where not exists (select 1 from public.referral_rewards rr where rr.user_id = uid and rr.reward = x.k);
$$;
-- Stav pro okno Pozvi kamarády
create or replace function public.referral_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return jsonb_build_object(
        'code', public.referral_code_for(uid),
        'inviter', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'owl', p.owl, 'prestige', p.prestige)
            from public.referrals r join public.profiles p on p.id = r.inviter where r.invitee = uid),
        'games', public.referral_games(uid),
        'join_until', (select u.created_at + interval '14 days' from auth.users u where u.id = uid and u.created_at > now() - interval '14 days'
            and not exists (select 1 from public.referrals r where r.invitee = uid)),
        'invited', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'owl', p.owl, 'prestige', p.prestige,
                'games', x.games, 'qualified', x.games >= 3) order by x.created_at desc)
            from (select r.invitee, r.created_at, public.referral_games(r.invitee) as games from public.referrals r where r.inviter = uid order by r.created_at desc limit 50) x
            join public.profiles p on p.id = x.invitee), '[]'::jsonb),
        'qualified', public.referral_qualified(uid),
        'claimed', coalesce((select jsonb_agg(rr.reward order by rr.claimed_at, rr.reward) from public.referral_rewards rr where rr.user_id = uid), '[]'::jsonb),
        'ready', to_jsonb(public.referral_ready(uid))
    );
end;
$$;
-- Kód od kamaráda (odkaz …?pritel=KÓD nebo ručně): jen nový účet (do 14 dnů od založení), jen jednou, ne vlastní, ne přes blok
-- a ne navzájem. Pozvaný a zvoucí se stanou přáteli (když to limit přátel dovolí). Vrací { inviter }.
create or replace function public.referral_join(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid();
    wanted text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
    host uuid;
    already uuid;
    created timestamptz;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtext('referral:' || uid::text));
    select rc.user_id into host from public.referral_codes rc where rc.code = wanted;
    if host is null then raise exception 'Takový kód přítele neexistuje. Zkontroluj, jestli je opsaný správně.' using errcode = 'P0001'; end if;
    if host = uid then raise exception 'Vlastní kód přítele použít nejde.' using errcode = 'P0001'; end if;
    select r.inviter into already from public.referrals r where r.invitee = uid;
    if already = host then
        return (select jsonb_build_object('inviter', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'owl', p.owl, 'prestige', p.prestige)) from public.profiles p where p.id = host);
    end if;
    if already is not null then raise exception 'Pozvánku od kamaráda už máš.' using errcode = 'P0001'; end if;
    select u.created_at into created from auth.users u where u.id = uid;
    if created is null or created < now() - interval '14 days' then
        raise exception 'Kód přítele platí jen pro nové hráče (do 14 dnů od založení účtu).' using errcode = 'P0001';
    end if;
    if public.is_blocked(uid, host) or exists (select 1 from public.referrals r where r.invitee = host and r.inviter = uid) then
        raise exception 'Tento kód přítele použít nejde.' using errcode = 'P0001';
    end if;
    insert into public.referrals (invitee, inviter) values (uid, host);
    -- Přátelství (žádost a hned přijetí; plný seznam přátel pozvánku nezastaví)
    begin
        insert into public.friendships (user_id, friend_id) values (uid, host) on conflict do nothing;
        update public.friendships set status = 'accepted'
            where ((user_id = uid and friend_id = host) or (user_id = host and friend_id = uid)) and status = 'pending';
    exception when others then null;
    end;
    return (select jsonb_build_object('inviter', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'color', p.color, 'frame', p.frame, 'owl', p.owl, 'prestige', p.prestige)) from public.profiles p where p.id = host);
end;
$$;
-- Vyzvednutí všech připravených odměn (každá jednou za účet); vrací pole klíčů, které se teď vyzvedly (XP a věci připíše aplikace)
create or replace function public.referral_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid();
    got text[];
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtext('referral:' || uid::text));
    with added as (
        insert into public.referral_rewards (user_id, reward) select uid, k from unnest(public.referral_ready(uid)) k
        on conflict do nothing returning reward
    ) select coalesce(array_agg(reward), '{}') into got from added;
    return to_jsonb(got);
end;
$$;

-- ----- Prestiž po úrovni 100 (prestige.js: první na 330 000 XP, další vždy o 49 500 XP později) -----
alter table public.profiles add column if not exists prestige smallint not null default 0;
alter table public.profiles add column if not exists prestige_xp integer not null default 0;
alter table public.profiles drop constraint if exists profiles_prestige_range;
alter table public.profiles add constraint profiles_prestige_range check (prestige between 0 and 99 and prestige_xp between 0 and 500000);
create or replace function public.prestige_up() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid();
    row_now public.profiles;
    need integer;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into row_now from public.profiles where id = uid for update;
    if not found then raise exception 'Profil nenalezen.' using errcode = 'P0001'; end if;
    if row_now.prestige >= 99 then raise exception 'Víc prestiží už nejde.' using errcode = 'P0001'; end if;
    need := case when row_now.prestige = 0 then (select max(t) from unnest(array[0, 90, 250, 480, 750, 1150, 1550, 2000, 2600, 3200, 3900, 4700, 5500, 6400, 7300, 8300, 9400, 10500, 12000, 13000, 14500, 16000, 17500, 19000, 20500, 22000, 24000, 25500, 27500, 29500, 31500, 33500, 36000, 38000, 40500, 42500, 45000, 47500, 50000, 53000, 55000, 58000, 61000, 64000, 67000, 70000, 73000, 76000, 79000, 82000, 86000, 89000, 93000, 96000, 100000, 103000, 107000, 111000, 115000, 119000, 123000, 127000, 131000, 135000, 139000, 144000, 148000, 152000, 157000, 162000, 166000, 171000, 176000, 181000, 185000, 190000, 196000, 201000, 206000, 211000, 216000, 222000, 227000, 233000, 238000, 244000, 250000, 255000, 261000, 267000, 273000, 279000, 285000, 292000, 298000, 304000, 310000, 317000, 323000, 330000]) t) else row_now.prestige_xp + 49500 end;
    if row_now.xp < need then
        raise exception 'Do prestiže ještě chybí % XP.', need - row_now.xp using errcode = 'P0001';
    end if;
    update public.profiles set prestige = row_now.prestige + 1, prestige_xp = row_now.xp where id = uid;
    return jsonb_build_object('prestige', row_now.prestige + 1, 'prestige_xp', row_now.xp);
end;
$$;

-- ----- Vítězný efekt (friends.js VICTORY_EFFECTS) -----
alter table public.profiles add column if not exists victory_fx text;
alter table public.profiles drop constraint if exists profiles_victory_fx_format;
alter table public.profiles add constraint profiles_victory_fx_format check (victory_fx is null or victory_fx ~ '^[a-z0-9-]{1,24}$');
grant update (victory_fx) on public.profiles to authenticated;

-- ----- Kontrola odemčení -----
-- Je věc mezi dary v účtu (profiles.rewards → gifts → druh)?
create or replace function public.unlock_gift(rewards jsonb, cat text, item text) returns boolean
language sql immutable set search_path = public as $$
    select coalesce(jsonb_typeof(rewards -> 'gifts' -> cat) = 'array' and (rewards -> 'gifts' -> cat) ? item, false);
$$;
-- Má hráč (řádek profilu) věc odemčenou? Neznámá věc: obrázek hráče ano (základní emoji), cokoli jiného ne
create or replace function public.unlock_ok(p public.profiles, category text, wanted text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
    found_rule text;
    kind text;
    val text;
begin
    select u.rule into found_rule from public.unlock_catalog() u where u.cat = category and u.item = wanted;
    if found_rule is null then return category = 'avatars'; end if;
    kind := split_part(found_rule, ':', 1);
    val := substr(found_rule, length(kind) + 2);
    if kind = 'free' then return true; end if;
    -- Prestiž a pozvaní kamarádi: jen podle serveru
    if kind = 'prestige' then return coalesce(p.prestige, 0) >= val::integer; end if;
    if kind = 'referral' then return exists (select 1 from public.referral_rewards rr where rr.user_id = p.id and rr.reward = any (string_to_array(val, ','))); end if;
    -- Ostatní: podmínka, kterou zná server, nebo dar v účtu (Truhla Mudrlanta dává věci za úroveň dřív; dary drží aplikace)
    if public.unlock_gift(p.rewards, category, wanted) then return true; end if;
    if kind = 'level' then return public.level_of_xp(p.xp) >= val::integer; end if;
    if kind = 'badge' then return public.badge_owned(p.badges, val); end if;
    if kind = 'league' then return public.league_best_rank(p.id) >= coalesce(array_position(array['bronz', 'stribro', 'zlato', 'platina', 'diamant', 'mistr'], val), 99); end if;
    if kind = 'diploma' then return coalesce(jsonb_typeof(p.rewards -> 'diplomas') = 'object' and (p.rewards -> 'diplomas') ? val, false); end if;
    if kind = 'season' then
        if val::integer >= 20 then return public.unlock_gift(p.rewards, 'titles', 'sampion-sezony'); end if;
        return exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(p.rewards -> 'gifts' -> 'frames') = 'array' then p.rewards -> 'gifts' -> 'frames' else '[]'::jsonb end) f
            where f ~ '^sezona-(0[1-9]|1[0-2])-b$');
    end if;
    return false;
end;
$$;
-- Titul u jména: úroveň, nic, odznak, který hráč má, nebo vlastní titul z katalogu
create or replace function public.unlock_title_ok(p public.profiles, wanted text) returns boolean
language sql stable security definer set search_path = public as $$
    select wanted in ('level', 'none') or (case when wanted = any (public.badge_catalog()) then public.badge_owned(p.badges, wanted) else public.unlock_ok(p, 'titles', wanted) end);
$$;
-- Obrázek hráče: postavička '<id><barvy>' (nebo staré emoji odměny) podle katalogu, jiný text (základní emoji) volně
create or replace function public.unlock_avatar_ok(p public.profiles, wanted text) returns boolean
language sql stable security definer set search_path = public as $$
    select public.unlock_ok(p, 'avatars', coalesce(substring(coalesce(wanted, '') from '^([a-z]{1,6})[0-9]{0,2}$'), coalesce(wanted, '')));
$$;
-- Barva doplňku: z katalogu, vlastní odstín h<stupně> jako „Vlastní barva“; neznámá zůstane (sova ji vykreslí jako původní)
create or replace function public.unlock_color_ok(p public.profiles, color text) returns boolean
language sql stable security definer set search_path = public as $$
    select case when color ~ '^h[0-9]{1,3}$' then public.unlock_ok(p, 'colors', 'vlastni')
        when exists (select 1 from public.unlock_catalog() u where u.cat = 'colors' and u.item = color) then public.unlock_ok(p, 'colors', color)
        else true end;
$$;
-- Sova (profiles.owl, look-owl.js encodeOwl): zamčený talár → vínový, zamčená sova titulu → nejvyšší dosažená, zamčený doplněk vypadne,
-- zamčená barva doplňku → původní. Neznámé části (novější aplikace) zůstanou.
create or replace function public.unlock_owl(p public.profiles, owl text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
    part text;
    key text;
    val text;
    acc text;
    color text;
    rest text;
    best text;
    kept text[] := '{}';
begin
    if owl is null then return null; end if;
    foreach part in array string_to_array(owl, ';') loop
        if position('=' in part) < 2 then kept := kept || part; continue; end if;
        key := split_part(part, '=', 1);
        val := substr(part, length(key) + 2);
        if key = 'robe' then
            kept := kept || (case when public.unlock_ok(p, 'robes', val) then part else 'robe=vinova' end);
        elsif key = 'pose' then
            if public.unlock_ok(p, 'poses', val) then kept := kept || part;
            else
                select u.item into best from public.unlock_catalog() u where u.cat = 'poses' and public.unlock_ok(p, 'poses', u.item)
                    order by split_part(u.item, '-', 2)::integer desc limit 1;
                if best is not null then kept := kept || ('pose=' || best); end if;
            end if;
        elsif key in ('head', 'face', 'neck', 'hand') then
            acc := split_part(val, '.', 1);
            color := split_part(val, '.', 2);
            rest := substr(val, length(acc) + length(color) + 3);
            if acc = 'bez-monoklu' or not exists (select 1 from public.unlock_catalog() u where u.cat = 'accessories' and u.item = acc) then kept := kept || part;
            elsif not public.unlock_ok(p, 'accessories', acc) then continue;
            elsif color <> '' and not public.unlock_color_ok(p, color) then kept := kept || (key || '=' || acc || '.original' || case when rest <> '' then '.' || rest else '' end);
            else kept := kept || part;
            end if;
        else kept := kept || part;
        end if;
    end loop;
    return nullif(array_to_string(kept, ';'), '');
end;
$$;
-- Trigger: jen změny od klienta (role authenticated/anon; i uvnitř funkcí security definer platí nastavená role), a jen změněné sloupce.
-- Běží po profiles_protect_rating a profiles_showcase_check (abecedně), takže XP a odznaky ze stejné změny už jsou sjednocené.
-- Hodnotu ve špatném tvaru nechá být: odmítne ji kontrola sloupce (chyba pro klienta jako dřív), ne tiché vrácení.
create or replace function public.check_unlocks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then return new; end if;
    -- Správce (dev_admins) si smí uložit cokoli: vývojářské nástroje odemykají věci jen v zařízení (zkušební úroveň, odznaky, „Vše“)
    if public.is_dev_admin() then return new; end if;
    if new.frame is distinct from old.frame and new.frame ~ '^[a-z0-9-]{1,24}$' and new.frame <> 'zadny' and not public.unlock_ok(new, 'frames', new.frame) then new.frame := old.frame; end if;
    if new.title_pref is distinct from old.title_pref and new.title_pref ~ '^[a-z0-9-]{1,40}$' and not public.unlock_title_ok(new, new.title_pref) then new.title_pref := old.title_pref; end if;
    if new.owl is distinct from old.owl and new.owl ~ '^[a-z0-9=.;-]{1,200}$' then new.owl := public.unlock_owl(new, new.owl); end if;
    -- Obrázek: jen odemčená postavička; jiné barvy postavičky, kterou už profil má, projdou vždy (pravidlo odemčení se mohlo změnit, schéma 36)
    if new.avatar is distinct from old.avatar and char_length(coalesce(new.avatar, '')) between 1 and 8 and not public.unlock_avatar_ok(new, new.avatar)
        and not coalesce(substring(new.avatar from '^([a-z]{1,6})[0-9]{0,2}$') = substring(coalesce(old.avatar, '') from '^([a-z]{1,6})[0-9]{0,2}$'), false) then new.avatar := old.avatar; end if;
    if new.victory_fx is distinct from old.victory_fx and new.victory_fx ~ '^[a-z0-9-]{1,24}$' and not public.unlock_ok(new, 'fx', new.victory_fx) then new.victory_fx := old.victory_fx; end if;
    return new;
end;
$$;
drop trigger if exists profiles_unlock_check on public.profiles;
create trigger profiles_unlock_check before update of frame, title_pref, owl, avatar, victory_fx on public.profiles for each row execute function public.check_unlocks();

-- ----- Reakce navíc: jen odemčené (seznam povolených emoji + kontrola odesílatele) -----
alter table public.match_reactions drop constraint if exists match_reactions_emoji_list;
alter table public.match_reactions add constraint match_reactions_emoji_list check (emoji in ('👍', '🔥', '😅', '🤝', '😮', '🧠', '🦉', '🙌', '🎯', '💪', '🎉', '👑', '🤗'));
create or replace function public.check_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    sender public.profiles;
begin
    new.created_at := now();
    if tg_op = 'UPDATE' then
        new.challenge_id := old.challenge_id; new.match_id := old.match_id; new.from_id := old.from_id; new.to_id := old.to_id;
    else
        if public.is_blocked(new.from_id, new.to_id) then raise exception 'Reakci nejde poslat.' using errcode = 'P0001'; end if;
        if new.challenge_id is not null and (
            not exists (select 1 from public.challenge_results where challenge_id = new.challenge_id and user_id = new.from_id)
            or not exists (select 1 from public.challenge_results where challenge_id = new.challenge_id and user_id = new.to_id)) then
            raise exception 'Reagovat jde jen na výzvu, kterou jste oba dohráli.' using errcode = 'P0001';
        end if;
        if new.match_id is not null and not exists (select 1 from public.tournament_matches m where m.id = new.match_id and new.from_id in (m.p1, m.p2) and new.to_id in (m.p1, m.p2)) then
            raise exception 'Reagovat jde jen na vlastní zápas.' using errcode = 'P0001';
        end if;
    end if;
    if tg_op = 'INSERT' or new.emoji is distinct from old.emoji then
        select * into sender from public.profiles where id = new.from_id;
        if not found or not public.unlock_ok(sender, 'reactions', new.emoji) then
            raise exception 'Tuhle reakci ještě nemáš odemčenou.' using errcode = 'P0001';
        end if;
    end if;
    return new;
end;
$$;

-- ----- Vitrína: i titul a věci ze Sezóny Mudrlanta -----
create or replace function public.showcase_format_ok(items text[]) returns boolean
language sql immutable set search_path = public as $$
    select items is not null and coalesce(array_ndims(items), 1) = 1 and cardinality(items) <= 3
        and (select count(distinct x) = count(*)
                and coalesce(bool_and(x ~ '^(b:[a-z0-9-]{1,40}|d:[a-z0-9-]{1,24}|l:[0-9]{4}-(0[1-9]|1[0-2]):(bronz|stribro|zlato|platina|diamant|mistr)|t:[a-z0-9-]{1,40}|s:(frames|avatars|accessories):[a-z0-9-]{1,30})$'), true)
             from unnest(items) x);
$$;
create or replace function public.check_showcase() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    kept text[] := '{}';
    entry text;
    now_month text := to_char(now() at time zone 'Europe/Prague', 'YYYY-MM');
    peak integer;
begin
    if new.showcase is not distinct from old.showcase or new.showcase is null then return new; end if;
    foreach entry in array new.showcase loop
        if entry is not null and public.showcase_format_ok(array[entry]) then
            continue when entry = any (kept);
            if left(entry, 2) = 'b:' then
                continue when not (substr(entry, 3) = any (coalesce(new.badges, '{}')));
            elsif left(entry, 2) = 'l:' then
                continue when substr(entry, 3, 7) >= now_month;
                peak := public.league_month_peak(new.id, substr(entry, 3, 7));
                continue when peak is null or public.rating_league(peak) <> substr(entry, 11);
            elsif left(entry, 2) = 't:' then
                -- Titul ze Sezóny Mudrlanta, který hráč má mezi dary v účtu
                continue when not exists (select 1 from public.unlock_catalog() u where u.cat = 'titles' and u.item = substr(entry, 3) and u.rule = 'season-gift')
                    or not public.unlock_gift(new.rewards, 'titles', substr(entry, 3));
            elsif left(entry, 2) = 's:' then
                -- Věc ze Sezóny Mudrlanta (rámeček, postavička, doplněk měsíce) mezi dary v účtu
                continue when not exists (select 1 from public.unlock_catalog() u where u.cat = split_part(entry, ':', 2) and u.item = split_part(entry, ':', 3) and u.rule = 'season-gift')
                    or not public.unlock_gift(new.rewards, split_part(entry, ':', 2), split_part(entry, ':', 3));
            end if;
        end if;
        kept := kept || entry;
    end loop;
    new.showcase := kept;
    return new;
end;
$$;

revoke all on function public.level_of_xp(integer), public.badge_tiers(), public.badge_owned(text[], text), public.unlock_catalog_more(), public.unlock_catalog(), public.league_best_rank(uuid),
    public.referral_code_for(uuid), public.referral_games(uuid), public.referral_qualified(uuid), public.referral_ready(uuid),
    public.unlock_gift(jsonb, text, text), public.unlock_ok(public.profiles, text, text), public.unlock_title_ok(public.profiles, text), public.unlock_avatar_ok(public.profiles, text),
    public.unlock_color_ok(public.profiles, text), public.unlock_owl(public.profiles, text), public.check_unlocks() from public, anon, authenticated;
revoke all on function public.referral_status(), public.referral_join(text), public.referral_claim(), public.prestige_up() from public, anon;
grant execute on function public.referral_status(), public.referral_join(text), public.referral_claim(), public.prestige_up() to authenticated;
-- ===== 32: Motivace — KONEC BLOKU =====

-- ===== 33: Zamrzlé denní módy — ZAČÁTEK BLOKU =====
-- Dnešní otázky, Řetězovka dne, Boss týdne a Tajemná otázka dne mají být pro všechny stejné jako Kvíz dne (schéma 17): otázku (řetěz) sestaví
-- první hráč dne v zařízení a uloží ji (question_snapshot_claim, první zápis platí), ostatní hrají uloženou – i když mezitím přišla nová verze
-- aplikace s jinými daty (odstraněné fotky a položky, jiné úrovně známosti) nebo se jim nenačetla Wikipedie. Nová semínka:
--   Dnešní otázky    mudrlant-dnes-<YYYY-MM-DD>:<téma>                     jen dnešek a včerejšek (pražský čas)
--   Řetězovka dne    mudrlant-retezovka-<YYYY-MM-DD>                         celý řetěz dne; dnešek a včerejšek
--   Tajemná otázka   mudrlant-tajemna-<YYYY-MM-DD>                           otázka dne; dnešek a včerejšek
--   Boss týdne       mudrlant-boss-<pondělí>-<pokus 1–3>:otazka:<0–9>        tento a minulý týden (pondělí podle Prahy)
-- daily_snapshots_get vrátí uložené otázky denních módů (i Kvízu dne) komukoli včetně nepřihlášených (anon): otázky dne jsou pro všechny
-- stejné a veřejné, host je tak dostane stejné jako přihlášení. Otázky výzev a turnajů dál čte jen přihlášený (question_snapshots_get).
-- Starší aplikace (bez těchto semínek) se nemění; aplikace se starší databází (bez bloku 33) hraje jako dřív, jen bez zamrzlých denních módů.

-- Semínko denního módu, které jde uložit dnes (Kvíz dne se kontroluje jako dřív v question_snapshot_claim)
create or replace function public.daily_snapshot_seed_ok(s text) returns boolean
language plpgsql stable set search_path = public as $$
declare
    today date := public.daily_quiz_today();
    m text[];
    d date;
begin
    if s is null then return false; end if;
    m := regexp_match(s, '^mudrlant-(?:dnes-([0-9]{4}-[0-9]{2}-[0-9]{2}):[a-z]{2,20}|retezovka-([0-9]{4}-[0-9]{2}-[0-9]{2})|tajemna-([0-9]{4}-[0-9]{2}-[0-9]{2}))$');
    if m is not null then
        begin d := coalesce(m[1], m[2], m[3])::date; exception when others then return false; end;
        return d in (today, today - 1);
    end if;
    m := regexp_match(s, '^mudrlant-boss-([0-9]{4}-[0-9]{2}-[0-9]{2})-([1-3]):otazka:([0-9])$');
    if m is not null then
        begin d := m[1]::date; exception when others then return false; end;
        return extract(isodow from d) = 1 and d in (date_trunc('week', today)::date, date_trunc('week', today)::date - 7);
    end if;
    return false;
end;
$$;
-- Semínko, které daily_snapshots_get vrací i hostovi: denní módy a Kvíz dne (jakéhokoli dne – uložené otázky minulých dnů pro rozpis)
create or replace function public.daily_snapshot_public(s text) returns boolean
language sql immutable set search_path = public as $$
    select s ~ '^mudrlant-(?:kviz-dne-[0-9]{4}-[0-9]{2}-[0-9]{2}:otazka:[0-9]|dnes-[0-9]{4}-[0-9]{2}-[0-9]{2}:[a-z]{2,20}|retezovka-[0-9]{4}-[0-9]{2}-[0-9]{2}|tajemna-[0-9]{4}-[0-9]{2}-[0-9]{2}|boss-[0-9]{4}-[0-9]{2}-[0-9]{2}-[1-3]:otazka:[0-9])$'
$$;

-- Jako ve schématu 17, navíc semínka denních módů (daily_snapshot_seed_ok)
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
    select q.data into stored from public.question_snapshots q where q.seed = s;
    if stored is not null then return stored; end if;
    -- Kvíz dne: jen dnešek a včerejšek (pokus začatý před půlnocí se dohrává po ní)
    m := regexp_match(s, '^mudrlant-kviz-dne-([0-9]{4}-[0-9]{2}-[0-9]{2}):otazka:([0-9])$');
    if m is not null then
        begin d := m[1]::date; exception when others then d := null; end;
        if d is null or d not in (today, today - 1) then raise exception 'Otázky Kvízu dne jde uložit jen za dnešek.' using errcode = '22023'; end if;
        allowed := true;
    end if;
    -- Denní módy (schéma 33): Dnešní otázky, Řetězovka, Tajemná otázka (dnešek a včerejšek) a Boss týdne (tento a minulý týden)
    if not allowed and s ~ '^mudrlant-(dnes|retezovka|tajemna|boss)-' then
        if not public.daily_snapshot_seed_ok(s) then raise exception 'Otázky denních módů jde uložit jen za dnešek.' using errcode = '22023'; end if;
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

-- Uložené otázky denních módů k semínkům (nejvýš 100 najednou), i pro nepřihlášené; jiná semínka (výzvy, turnaje) ve výsledku nejsou
create or replace function public.daily_snapshots_get(seeds text[]) returns table (seed text, data jsonb)
language sql stable security definer set search_path = public as $$
    select q.seed, q.data from public.question_snapshots q
    where q.seed = any((coalesce(daily_snapshots_get.seeds, '{}'::text[]))[1:100]) and public.daily_snapshot_public(q.seed)
$$;
revoke all on function public.daily_snapshot_seed_ok(text), public.daily_snapshot_public(text) from public, anon, authenticated;
revoke all on function public.question_snapshot_claim(text, jsonb), public.daily_snapshots_get(text[]) from public, anon;
grant execute on function public.question_snapshot_claim(text, jsonb) to authenticated;
grant execute on function public.daily_snapshots_get(text[]) to anon, authenticated;
-- ===== 33: Zamrzlé denní módy — KONEC BLOKU =====

-- ===== 34: Hlasování o speciálním turnaji jen na pokyn správce — ZAČÁTEK BLOKU =====
-- Hlasování hráči uvidí (a hlasovat v něm můžou), jen když ho správce (dev_admins) ve vývojářských nástrojích zapne (tournament_polls.visible).
-- Témata do hlasování (2 až 4 z nabídky tournament_themes) vybere správce sám (dev_tournament_poll_set); hlasování, které otevře server
-- sám (po založení turnaje na téma z hlasování nebo po uzavření), je skryté, dokud ho správce nenastaví a nezapne.
alter table public.tournament_polls add column if not exists visible boolean not null default false;
alter table public.tournament_polls drop constraint if exists tournament_polls_options_count;
alter table public.tournament_polls add constraint tournament_polls_options_count check (cardinality(options) between 2 and 4);
-- Tabulku hlasování přímo čte hráč jen zveřejněnou, správce celou
drop policy if exists "turnaje: hlasování" on public.tournament_polls;
create policy "turnaje: hlasování" on public.tournament_polls for select to authenticated
    using (visible or public.is_dev_admin());

-- Hlasování jako JSON (jako v bloku 31) a navíc visible
create or replace function public.tournament_poll_json(p public.tournament_polls, uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
    with me as (select v.theme, v.changes from public.tournament_votes v where v.poll_id = p.id and v.user_id = uid),
    shown as (select exists (select 1 from me) or exists (select 1 from public.dev_admins d where d.user_id = uid) as ok),
    counts as (select v.theme, count(*)::integer as n from public.tournament_votes v where v.poll_id = p.id group by v.theme)
    select jsonb_build_object(
        'id', p.id, 'opened_at', p.opened_at, 'closed', p.closed_at is not null, 'visible', p.visible,
        'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', coalesce(th.title, o.id), 'topics', th.topics,
                'votes', case when (select ok from shown) then coalesce((select c.n from counts c where c.theme = o.id), 0) end) order by o.ord)
            from unnest(p.options) with ordinality as o(id, ord) left join public.tournament_themes th on th.id = o.id), '[]'::jsonb),
        'mine', (select me.theme from me),
        'total', case when (select ok from shown) then coalesce((select sum(c.n) from counts c), 0)::integer end,
        'changes_left', 10 - coalesce((select me.changes from me), 0))
$$;

-- Hráč: stav hlasování; skryté hlasování vidí jen správce (ostatní dostanou null)
create or replace function public.tournament_poll_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.tournament_polls;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    p := public.tournament_poll_current();
    if not p.visible and not exists (select 1 from public.dev_admins d where d.user_id = uid) then return null; end if;
    return public.tournament_poll_json(p, uid);
end;
$$;

-- Hráč: hlas pro téma (jako v bloku 31), jen ve zveřejněném hlasování
create or replace function public.tournament_vote(poll bigint, theme text) returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare uid uuid := auth.uid(); p public.tournament_polls; prev public.tournament_votes;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into p from public.tournament_polls tp where tp.id = poll for share;
    if p.id is null or p.closed_at is not null or not p.visible then raise exception 'Hlasování teď neběží.' using errcode = '22023'; end if;
    if theme is null or not (theme = any (p.options)) then raise exception 'Tohle téma v hlasování není.' using errcode = '22023'; end if;
    perform pg_advisory_xact_lock(hashtext('tournament_vote:' || poll::text || ':' || uid::text));
    select * into prev from public.tournament_votes v where v.poll_id = poll and v.user_id = uid;
    if prev.poll_id is null then
        insert into public.tournament_votes (poll_id, user_id, theme) values (poll, uid, theme);
    elsif prev.theme <> theme then
        if prev.changes >= 10 then raise exception 'Hlas jde změnit nejvýš 10krát, teď už platí ten poslední.' using errcode = '22023'; end if;
        update public.tournament_votes v set theme = theme, voted_at = now(), changes = v.changes + 1 where v.poll_id = poll and v.user_id = uid;
    end if;
    return public.tournament_poll_json(p, uid);
end;
$$;

-- Správce: témata hlasování (2–4 různá z nabídky, v tomto pořadí) a jestli ho hráči vidí. Stejná témata jako v otevřeném hlasování = jen se
-- zapne či vypne (hlasy zůstanou); jiná témata = otevřené hlasování se uzavře (vítěz podle hlasů) a otevře se nové. Vrací stav hlasování.
create or replace function public.dev_tournament_poll_set(themes text[], show boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.tournament_polls; list text[]; best text;
begin
    perform public.dev_check();
    list := array(select t from unnest(coalesce(themes, '{}'::text[])) with ordinality as x(t, ord) group by t order by min(ord));
    if cardinality(list) < 2 or cardinality(list) > 4 then raise exception 'Vyber 2 až 4 různá témata.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(list) as x(t) where not exists (select 1 from public.tournament_themes th where th.id = x.t and th.active)) then
        raise exception 'Některé téma v nabídce není.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(74631);
    select * into p from public.tournament_polls where closed_at is null for update;
    if p.id is not null and p.options = list then
        update public.tournament_polls set visible = coalesce(show, false) where id = p.id returning * into p;
        return public.tournament_poll_json(p, auth.uid());
    end if;
    if p.id is not null then
        select o.id into best from unnest(p.options) with ordinality as o(id, ord)
            join (select v.theme, count(*) as n from public.tournament_votes v where v.poll_id = p.id group by v.theme) c on c.theme = o.id
            order by c.n desc, o.ord limit 1;
        update public.tournament_polls set closed_at = now(), winner = best where id = p.id;
    end if;
    insert into public.tournament_polls (options, visible) values (list, coalesce(show, false)) returning * into p;
    return public.tournament_poll_json(p, auth.uid());
end;
$$;
revoke all on function public.dev_tournament_poll_set(text[], boolean) from public, anon;
grant execute on function public.dev_tournament_poll_set(text[], boolean) to authenticated;
-- ===== 34: Hlasování o speciálním turnaji jen na pokyn správce — KONEC BLOKU =====

-- ===== 35: Další postavičky (č. 317–408) — ZAČÁTEK BLOKU =====
-- Postavičky z docs/OBRAZKY.md oddílu 26 (look.js NEW_AVATARS) jako řádky katalogu odemykání (blok 32): unlock_catalog() je přidá za
-- své řádky přes unlock_catalog_more(), takže kontrola obrázku v profilu (unlock_avatar_ok, trigger profiles_unlock_check) je zná stejně
-- jako starší postavičky. Bez tohoto bloku je server nezná a pustí je jako základní emoji (neznámý obrázek = volně).
-- Pravidla jako v bloku 32: úroveň z XP v účtu, odznak v účtu (i vyšší stupeň téže skupiny), 'gift' = jen dar z truhly (Kapybara v lázních
-- z Truhly Mudrlanta a stupňů Sezóny, Zmrzlinový kornout vzácně z Truhly Mudrlanta a ze Zlaté truhly), pozvaní kamarádi a prestiž.
-- Pavouk pletař se od schématu 36 odemyká odznakem Kovář řetězů (retezovka-10, Řetězovka dne) místo turnaj-postupy-5; kdo ho už má
-- v profilu, o něj nepřijde (check_unlocks kontroluje jen změněný obrázek).
-- Postavičky č. 341–357 a absurdní č. 379–408 jsou na konci seznamu ('gift' = jen z truhly: Dýňový strašák a Prd v láhvi z Truhly Mudrlanta,
-- stupňů Sezóny a Zlaté truhly, Jednorožec mrzout jako vzácný dárek; Kaktus, který chce obejmout, za pozvánku, Kuře influencer za 10 kamarádů,
-- Smrtka na dovolené za druhou prestiž). Funkce se
-- jen nahradí, takže stačí soubor spustit znovu; se starší databází je server nezná a uloží je volně (neznámý obrázek), nic neodmítne.
-- Krab kadeřník (č. 339) se připíše sem na konec seznamu. Shodu s look.js hlídá tests/motivace.test.js.
create or replace function public.unlock_catalog_more() returns table (cat text, item text, rule text)
language sql immutable set search_path = public as $$
    select * from (values
        ('avatars', 'vacice', 'level:10'), ('avatars', 'spisov', 'level:17'), ('avatars', 'pstros', 'badge:tema-sport-25'), ('avatars', 'koala', 'badge:bleskovka-12'),
        ('avatars', 'toust', 'badge:dnes-50'), ('avatars', 'krokod', 'badge:chyby-50'), ('avatars', 'brokol', 'badge:tydenni-cile-5'), ('avatars', 'netopy', 'badge:detektiv-7'),
        ('avatars', 'plamak', 'badge:kviz-perfekt-5'), ('avatars', 'vajko', 'badge:sazkar'), ('avatars', 'pizza', 'badge:vyhry-5'), ('avatars', 'jezek', 'badge:sberatel-50'),
        ('avatars', 'zirafa', 'level:31'), ('avatars', 'vydra', 'badge:preziti-35'), ('avatars', 'hroch', 'badge:tezke-50'), ('avatars', 'lama', 'badge:tema-hudba-100'),
        ('avatars', 'pavouk', 'badge:retezovka-10'), ('avatars', 'krava', 'badge:dobyvatel-3'), ('avatars', 'velbl', 'badge:boss-kapitan'), ('avatars', 'kapyba', 'gift'),
        ('avatars', 'zmrzl', 'gift'), ('avatars', 'kosatk', 'referral:pritel-3'), ('avatars', 'avokad', 'prestige:1'),
        -- č. 341–357
        ('avatars', 'ponozk', 'badge:vsestrannost-3'), ('avatars', 'mrak', 'badge:odhad-5'), ('avatars', 'priser', 'level:14'), ('avatars', 'zombie', 'badge:poznane-100'),
        ('avatars', 'kohout', 'badge:kviz-serie-14'), ('avatars', 'kostli', 'badge:tema-biologie-100'), ('avatars', 'havran', 'badge:tema-literatura-100'),
        ('avatars', 'holub', 'badge:sazky-v-rade-3'), ('avatars', 'medoj', 'badge:vyzvy-25'), ('avatars', 'buldok', 'badge:turnaj-semifinale'),
        ('avatars', 'nosoro', 'badge:vyhry-v-rade-5'), ('avatars', 'duch', 'badge:retezovka-30'), ('avatars', 'mumie', 'badge:tema-historie-600'),
        ('avatars', 'kocka', 'badge:boss-alchymista'), ('avatars', 'vlkodl', 'badge:boss-druid'), ('avatars', 'krysa', 'badge:zlatokop-50'), ('avatars', 'dynak', 'gift'),
        -- č. 379–408 (absurdní postavičky)
        ('avatars', 'kafe', 'level:6'), ('avatars', 'holubz', 'badge:mapa-5'), ('avatars', 'kachna', 'badge:serad-5'), ('avatars', 'slepic', 'badge:zalozene-1'),
        ('avatars', 'nuget', 'badge:rada-5'), ('avatars', 'kaktik', 'referral:novacek,pritel-1'), ('avatars', 'husa', 'badge:turnaj-postupy-1'),
        ('avatars', 'tousto', 'level:22'), ('avatars', 'racek', 'badge:kviz-dne-10'), ('avatars', 'sandal', 'badge:tema-zemepis-100'),
        ('avatars', 'aligat', 'badge:tema-geologie-100'), ('avatars', 'zralok', 'badge:tema-film-100'), ('avatars', 'snob', 'badge:tema-umeni-100'),
        ('avatars', 'rohlik', 'level:33'), ('avatars', 'komar', 'badge:psani-100'), ('avatars', 'trpas', 'badge:bez-napovedy-100'),
        ('avatars', 'tchyne', 'badge:retezovka-cela-5'), ('avatars', 'kuryr', 'level:45'), ('avatars', 'kocov', 'badge:serie-60'), ('avatars', 'gauc', 'badge:dny-100'),
        ('avatars', 'podnaj', 'badge:dobyvatel-25'), ('avatars', 'upir', 'badge:boss-reziser'), ('avatars', 'plivak', 'badge:boss-rytir'),
        ('avatars', 'bricho', 'badge:boss-olympan'), ('avatars', 'papous', 'badge:boss-maestro'), ('avatars', 'syr', 'badge:vsechna-temata-1'),
        ('avatars', 'prd', 'gift'), ('avatars', 'jednor', 'gift'), ('avatars', 'kure', 'referral:pritel-10'), ('avatars', 'smrtka', 'prestige:2')
    ) as t (cat, item, rule);
$$;
revoke all on function public.unlock_catalog_more() from public, anon, authenticated;
-- ===== 35: Další postavičky (č. 317–408) — KONEC BLOKU =====

-- ===== 36: Odznaky Řetězovky dne — ZAČÁTEK BLOKU =====
-- Dvě skupiny odznaků Řetězovky (quiz-core.js BADGE_GROUPS): Řetězovka dne (retezovka = 3 dohrané dny, retezovka-10, -30, -100, -365)
-- a Celý řetěz bez Záchrany (retezovka-cela = 1, retezovka-cela-5, -15, -30, -60). Stejně jako odznaky Detektiv je počítá zařízení
-- (počítadla chainDone a chainClean, jedna hra za den) a server je jen přijme z katalogu: jsou v badge_catalog() a badge_tiers() výše.
-- Pavouk pletař (blok 35, unlock_catalog_more) se odemyká odznakem retezovka-10. Kdo ho má v profilu z dřívějška (turnaj-postupy-5), o něj
-- nepřijde a může ho i přebarvit: check_unlocks (blok 32) kontroluje jen změněný obrázek a jiné barvy téže postavičky pustí.
-- chain_badge_counts(): kolik dní má hráč v chain_results (dohrané Řetězovky dne) a kolik z nich je celý řetěz (7 článků) bez Záchrany;
-- aplikace podle toho po přihlášení dorovná počítadla (hry z jiných zařízení i ze dnů před odznaky, chain_results jsou od začátku módu).
create or replace function public.chain_badge_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select jsonb_build_object('days', count(*), 'clean', count(*) filter (where c.links = 7 and not c.rescued)) into result
    from public.chain_results c where c.user_id = uid;
    return result;
end;
$$;
revoke all on function public.chain_badge_counts() from public, anon;
grant execute on function public.chain_badge_counts() to authenticated;
-- ===== 36: Odznaky Řetězovky dne — KONEC BLOKU =====

-- ===== 37: Pomůcka Záchrana navíc do Řetězovky — ZAČÁTEK BLOKU =====
-- Záchrana navíc ('chain_rescue', nejvýš 1; zásoba v player_items jako pomůcky do Dobývání, blok 30): v Řetězovce dne, když hráč už
-- použil svou Záchranu a znovu odpoví špatně, řetěz se nepřetrhne a dostane záchrannou otázku toho článku (za 0 bodů). Řetěz dne je pro
-- všechny stejný, mění se jen to, kolik článků hráč zvládne. Použití: chain_use_rescue(den) ubere zásobu a zapíše player_item_uses
-- (klíč chain:<den>, jednou za den; opakované volání téhož dne nic dalšího neubere). chain_submit pak přijme body se dvěma zachráněnými
-- články (chain_results.extra_rescue). Cvičná řetězovka pomůcky nepoužívá.
-- Odkud (player_item_grants, každý klíč jednou; s plnou zásobou propadne): milníky Řetězovky dne v chain_submit (chain_rescue_milestone:
-- dohrané dny 10, 30, 100, 365 a celé řetězy bez Záchrany 5, 15, 30, 60, jako stupně odznaků; počítá se z chain_results, dá se nejvyšší
-- dosažený milník, nižší se přeskočí), 12. stupeň Sezóny Mudrlanta (season:<RRRR-MM>:12), Truhla Mudrlanta (5 % ze stejného losu jako
-- 50/50, chest:<týden>), Zlatá truhla (20 %, nejvýš jednou za týden, gold:<týden>) a společný cíl Bosse týdne (boss_claim_bonus,
-- bossbonus:<týden>). Boti nic.
create table if not exists public.player_item_uses (
    user_id uuid not null references public.profiles (id) on delete cascade,
    key text not null,
    kind text not null,
    at timestamptz not null default now(),
    primary key (user_id, key)
);
alter table public.player_item_uses drop constraint if exists player_item_uses_values;
alter table public.player_item_uses add constraint player_item_uses_values check (kind = 'chain_rescue' and key ~ '^chain:\d{4}-\d{2}-\d{2}$');
alter table public.player_item_uses enable row level security;
drop policy if exists "pomůcky: vlastní použití" on public.player_item_uses;
create policy "pomůcky: vlastní použití" on public.player_item_uses for select to authenticated using (user_id = auth.uid());
revoke all on public.player_item_uses from public, anon, authenticated;
grant select on public.player_item_uses to authenticated;

-- Milník Řetězovky dne po nově uloženém výsledku (volá chain_submit): nejvyšší dosažený milník dohraných dnů a celých řetězů bez Záchrany,
-- který ještě nedal Záchranu navíc. Vrací zisk (player_item_grant s at = milník a source = 'chain-days' | 'chain-clean'), nebo null.
-- Když dorazí oba milníky naráz, vrátí ten, který pomůcku dal (druhý se zapíše jako plná zásoba).
create or replace function public.chain_rescue_milestone(uid uuid) returns jsonb
language plpgsql set search_path = public as $$
declare days integer; clean integer; m integer; got jsonb; result jsonb;
begin
    if uid is null or public.dev_is_bot(uid) then return null; end if;
    select count(*), count(*) filter (where c.links = 7 and not c.rescued) into days, clean from public.chain_results c where c.user_id = uid;
    select max(x) into m from unnest(array[10, 30, 100, 365]) x where x <= days;
    if m is not null then
        got := public.player_item_grant(uid, 'chain_rescue', 'chain-days:' || m, false);
        if got is not null and not (got ->> 'already')::boolean then result := got || jsonb_build_object('source', 'chain-days', 'at', m); end if;
    end if;
    select max(x) into m from unnest(array[5, 15, 30, 60]) x where x <= clean;
    if m is not null then
        got := public.player_item_grant(uid, 'chain_rescue', 'chain-clean:' || m, false);
        if got is not null and not (got ->> 'already')::boolean and (result is null or ((got ->> 'granted')::boolean and not (result ->> 'granted')::boolean)) then
            result := got || jsonb_build_object('source', 'chain-clean', 'at', m);
        end if;
    end if;
    return result;
end;
$$;

-- Použití Záchrany navíc v Řetězovce dne for_day (dnešek, nebo včerejšek těsně po půlnoci): jen před odesláním výsledku dne, jednou za den.
-- Opakované volání téhož dne (ztracená odpověď, druhé zařízení) vrátí used s already a zásobu neubere. Vrací { used, already, items }.
create or replace function public.chain_use_rescue(for_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.chain_today(); t timestamptz := public.player_items_now(); have integer; use_key text := 'chain:' || for_day;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    if public.dev_is_bot(uid) then raise exception 'Boti pomůcky nepoužívají.' using errcode = '42501'; end if;
    if for_day is null or for_day > d or for_day < d - 1 then raise exception 'Tahle Řetězovka už skončila.' using errcode = '22023'; end if;
    -- Řádek zásoby zamčený: souběžná použití téhož hráče jdou po sobě
    insert into public.player_items (user_id, kind, count, updated_at) values (uid, 'chain_rescue', 0, t) on conflict (user_id, kind) do nothing;
    select i.count into have from public.player_items i where i.user_id = uid and i.kind = 'chain_rescue' for update;
    if exists (select 1 from public.player_item_uses u where u.user_id = uid and u.key = use_key) then
        return jsonb_build_object('used', true, 'already', true, 'items', public.player_items_json(uid));
    end if;
    if exists (select 1 from public.chain_results c where c.user_id = uid and c.day = for_day) then
        raise exception 'Řetězovku dne už máš dohranou.' using errcode = 'P0001';
    end if;
    if have < 1 then raise exception 'Záchranu navíc teď nemáš.' using errcode = 'P0001'; end if;
    update public.player_items set count = count - 1, updated_at = t where user_id = uid and kind = 'chain_rescue';
    insert into public.player_item_uses (user_id, key, kind, at) values (uid, use_key, 'chain_rescue', t);
    return jsonb_build_object('used', true, 'already', false, 'items', public.player_items_json(uid));
end;
$$;

revoke all on function public.chain_rescue_milestone(uuid) from public, anon, authenticated;
revoke all on function public.chain_use_rescue(date) from public, anon;
grant execute on function public.chain_use_rescue(date) to authenticated;
-- ===== 37: Pomůcka Záchrana navíc do Řetězovky — KONEC BLOKU =====

-- ===== 38: Dobývání – výplně území a vzácné znaky — ZAČÁTEK BLOKU =====
-- Odměny vzhledu do Dobývání (docs/ODMENY-DOBYVANI.md oddíly 1, 2 a 8): 12 výplní území („vzory“, conquest_players.pattern: čím hráč
-- vyplní svá území na mapě) a 12 vzácných znaků (conquest_players.emblem z conquest_rare_emblems). Barevné výplně (conquest_colored_patterns:
-- Hermelín, Zlatá fólie, Zlatý brokát, Duha) se nebarví barvou hráče, proto je v jedné hře smí mít jen jeden hráč (conquest_check_fill
-- a unikátní index conquest_players_fill_key); šedé se násobí barvou hráče a barvy jsou ve hře různé, takže se mohou opakovat. Odemykají se podle statistik hráče, které server spočítá z dat, která už má
-- (conquest_look_stats), takže platí i zpětně za dřívější hry a výsledky: dohrané hry Dobývání (počítá se hra, ve které měl hráč aspoň
-- 3 vlastní tahy a aspoň 1 bod a která měla aspoň 3 hráče nebo trvala aspoň den, stejně jako odměna v conquest_claim), vyhrané bitvy
-- (útok, který dobyl území nebo pobořil opevnění, i v bitvě o území), území dobytá přes námořní spoj (conquest_links.sea), Boss týdne
-- (boss_results), Kvíz dne (nejdelší série dní z daily_quiz_results, nebo odznak série), Řetězovka (celé řetězy 7 z 7 z chain_results,
-- nebo odznak), Zlatá otázka (odznaky zlatokop-*, víc server neví), 15. stupeň Sezóny Mudrlanta v zimě (prosinec–únor; zdroj pomůcky
-- season:<RRRR-MM>:15 v player_item_grants), vzácnost z Truhly Mudrlanta (los truhly chest:<týden> 100–129 z 1000, tj. 3 %, nezávislý
-- na losu pomůcky; player_items_claim ji ohlásí jako pattern) a úroveň z XP v účtu.
-- Co hráč odemkl, se zapíše do conquest_looks (i když by se data později změnila, odemčené zůstane); seen_at = kdy ho aplikace ohlásila
-- (oslava „Nová výplň území“), do té doby je v looks.new. Zápis dělá conquest_looks_json (volá ho conquest_lobby, conquest_claim
-- a conquest_looks). Volbu hlídá conquest_check_style: vzácný znak a vzor jen odemčené (správci v dev_admins cokoli). Boti nic neodemykají.
-- Katalog (stat = klíč statistiky, need = kolik) odpovídá conquest.js PATTERNS a RARE_EMBLEMS (hlídá tests/conquest.test.js a tests/sql-conquest-looks.test.js).
create or replace function public.conquest_rare_emblems() returns text[]
language sql immutable as $$ select array['gryf', 'sfinga', 'cinsky-drak', 'orel-belohlavy', 'dvouocasy-lev', 'pegas', 'fenix', 'kraken', 'jednorozec',
    'dvouhlavy-orel', 'svatovaclavska-koruna', 'sova-mudrlant']::text[] $$;
create or replace function public.conquest_patterns() returns text[]
language sql immutable as $$ select array['sachovnice', 'pokosy', 'vlnky', 'hermelin', 'plameny', 'mramor', 'hvezdna-noc', 'listi', 'led', 'zlato', 'brokat', 'duha']::text[] $$;
-- Barevné výplně (stejně conquest.js PATTERNS s colored) a jejich názvy do hlášek
create or replace function public.conquest_colored_patterns() returns text[]
language sql immutable as $$ select array['hermelin', 'zlato', 'brokat', 'duha']::text[] $$;
create or replace function public.conquest_pattern_name(pattern_id text) returns text
language sql immutable as $$ select case pattern_id when 'hermelin' then 'Hermelín' when 'zlato' then 'Zlatá fólie' when 'brokat' then 'Zlatý brokát' when 'duha' then 'Duha' else pattern_id end $$;
-- Barevnou výplň má ve hře nejvýš jeden hráč (pojistka k conquest_check_fill pro souběžné zápisy; zámek hry drží funkce hry)
create unique index if not exists conquest_players_fill_key on public.conquest_players (game_id, pattern) where pattern in ('hermelin', 'zlato', 'brokat', 'duha');
-- Katalog odemykání: kind ('pattern' | 'emblem' | 'castle' = sada hradů z bloku 40), item, stat (klíč v conquest_look_stats), need (od kolika),
-- ord (pořadí v nabídce)
create or replace function public.conquest_look_catalog() returns table (kind text, item text, stat text, need integer, ord integer)
language sql immutable as $$
    select * from (values
        ('pattern', 'sachovnice', 'games', 5, 1), ('pattern', 'pokosy', 'regions', 10, 2), ('pattern', 'vlnky', 'sea', 15, 3),
        ('pattern', 'hermelin', 'wins4', 1, 4), ('pattern', 'plameny', 'battles', 10, 5), ('pattern', 'mramor', 'boss', 4, 6),
        ('pattern', 'hvezdna-noc', 'daily_streak', 30, 7), ('pattern', 'listi', 'chains', 15, 8), ('pattern', 'led', 'winter15', 1, 9),
        ('pattern', 'zlato', 'gold', 10, 10), ('pattern', 'brokat', 'wins', 10, 11), ('pattern', 'duha', 'chest', 1, 12),
        ('emblem', 'gryf', 'win_evropa', 1, 1), ('emblem', 'sfinga', 'win_afrika', 1, 2), ('emblem', 'cinsky-drak', 'win_asie', 1, 3),
        ('emblem', 'orel-belohlavy', 'win_amerika', 1, 4), ('emblem', 'dvouocasy-lev', 'win_cesko', 1, 5), ('emblem', 'pegas', 'win_blesk', 1, 6),
        ('emblem', 'fenix', 'win_comeback', 1, 7), ('emblem', 'kraken', 'sea', 40, 8), ('emblem', 'jednorozec', 'safe_home', 5, 9),
        ('emblem', 'dvouhlavy-orel', 'battles', 50, 10), ('emblem', 'svatovaclavska-koruna', 'wins', 25, 11), ('emblem', 'sova-mudrlant', 'level', 50, 12),
        -- Sady hradů (blok 40, conquest.js CASTLE_SETS): Pevnost na domovském hradu 10×, 25 vyhraných bitev, 15. stupeň Sezóny ve 3 sezónách
        ('castle', 'goticky', 'home_fortress', 10, 1), ('castle', 'orientalni', 'battles', 25, 2), ('castle', 'japonsky', 'season15', 3, 3),
        -- Další sady (blok 41): série Kvízu dne 100 dní, 100 vyhraných bitev, Boss týdne poražený 10×
        ('castle', 'pernikovy', 'daily_streak', 100, 4), ('castle', 'parostrojni', 'battles', 100, 5), ('castle', 'ledovy', 'boss', 10, 6)
    ) as t (kind, item, stat, need, ord);
$$;

create table if not exists public.conquest_looks (
    user_id uuid not null references public.profiles (id) on delete cascade,
    kind text not null,
    item text not null,
    unlocked_at timestamptz not null default now(),
    seen_at timestamptz,
    primary key (user_id, kind, item)
);
alter table public.conquest_looks drop constraint if exists conquest_looks_values;
alter table public.conquest_looks add constraint conquest_looks_values check (kind in ('pattern', 'emblem', 'castle') and item ~ '^[a-z][a-z-]{1,23}$');
alter table public.conquest_looks enable row level security;
drop policy if exists "dobývání vzhled: vlastní řádky" on public.conquest_looks;
create policy "dobývání vzhled: vlastní řádky" on public.conquest_looks for select to authenticated using (user_id = auth.uid());
revoke all on public.conquest_looks from public, anon, authenticated;
grant select on public.conquest_looks to authenticated;

-- Vzácnost z Truhly Mudrlanta: los truhly (player_item_roll, stejný jako u pomůcky) 100–129 z 1000 = vzor Duha
create or replace function public.conquest_chest_pattern(uid uuid, grant_key text) returns boolean
language sql immutable as $$ select grant_key like 'chest:%' and public.player_item_roll(uid, grant_key) between 100 and 129 $$;

-- Statistiky hráče pro odemykání (jen z dat serveru, tedy i zpětně). Bot nebo neznámý hráč {}.
-- Boti (blok 42, proti sbírání odemčení na botech): hry a tahy Dobývání se počítají jen ze her aspoň dvou lidí (humans) a do „aspoň
-- 3 hráčů“ se Mudrlátka nepočítají (players). Hra s jedním člověkem a boty dá XP (conquest_claim, podle nejsilnějšího bota), ale odemčení ne.
create or replace function public.conquest_look_stats(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; games jsonb; streak integer; counted_games uuid[];
begin
    select * into p from public.profiles where id = uid;
    if p.id is null or public.dev_is_bot(uid) then return '{}'::jsonb; end if;
    select coalesce(array_agg(x.gid), '{}') into counted_games
      from (select c.game_id as gid from public.conquest_players c where c.user_id = uid
            union select m.game_id from public.conquest_moves m where m.user_id = uid) x
     where (select count(*) from public.conquest_players o where o.game_id = x.gid and o.bot_level is null and not public.dev_is_bot(o.user_id)) >= 2;
    with played as (
        select g.id, g.map, coalesce(g.duration_minutes, g.duration_hours * 60) as minutes, c.place,
            (select count(*) from public.conquest_players o where o.game_id = g.id and o.bot_level is distinct from 'easy') as players
        from public.conquest_players c join public.conquest_games g on g.id = c.game_id
        where c.user_id = uid and g.status = 'finished' and c.score > 0 and g.id = any (counted_games)
            and (select count(*) from public.conquest_moves m where m.game_id = g.id and m.user_id = uid and m.kind in ('attack', 'fortify', 'defend')) >= 3
    ), counted as (
        select x.*,
            exists (select 1 from public.conquest_moves m where m.game_id = x.id and m.user_id = uid and m.kind in ('respawn', 'revive')) as comeback,
            exists (select 1 from public.conquest_moves m where m.game_id = x.id and m.victim = uid and m.home and m.result = 'capture') as lost_home
        from played x where x.players >= 3 or x.minutes >= 24 * 60
    )
    select jsonb_build_object('games', count(*), 'wins', count(*) filter (where place = 1), 'wins4', count(*) filter (where place = 1 and players >= 4),
            'win_evropa', count(*) filter (where place = 1 and map = 'evropa'), 'win_afrika', count(*) filter (where place = 1 and map = 'afrika'),
            'win_asie', count(*) filter (where place = 1 and map = 'asie'), 'win_amerika', count(*) filter (where place = 1 and map = 'amerika'),
            'win_cesko', count(*) filter (where place = 1 and map = 'cesko'), 'win_blesk', count(*) filter (where place = 1 and minutes = 20),
            'win_comeback', count(*) filter (where place = 1 and comeback), 'safe_home', count(*) filter (where not lost_home),
            'regions', coalesce(sum(public.conquest_regions_owned(id, map, uid)), 0))
        into games from counted;
    -- Nejdelší série dní v Kvízu dne (dny po sobě s pokusem)
    select coalesce(max(n), 0) into streak from (
        select count(*) as n from (select d.day - (row_number() over (order by d.day))::integer as grp from public.daily_quiz_results d where d.user_id = uid) x group by grp
    ) y;
    return games || jsonb_build_object(
        -- vyhrané bitvy: dobytí a pobourání, od bloku 41 i odražený útok strážní věží (obrana s výsledkem 'repel')
        'battles', (select count(*) from public.conquest_moves m where m.user_id = uid and m.kind in ('attack', 'defend') and m.result in ('capture', 'breach', 'repel')
            and m.game_id = any (counted_games)),
        'sea', (select count(*) from public.conquest_moves m join public.conquest_games g on g.id = m.game_id
            join public.conquest_links l on l.map = g.map and l.a = m.source and l.b = m.territory and l.sea
            where m.user_id = uid and m.kind = 'attack' and m.result = 'capture' and m.game_id = any (counted_games)),
        'boss', (select count(*) from public.boss_results b where b.user_id = uid and b.defeated),
        'daily_streak', greatest(streak, case when public.badge_owned(p.badges, 'kviz-serie-100') then 100 when public.badge_owned(p.badges, 'kviz-serie-30') then 30 else 0 end),
        'chains', greatest((select count(*) from public.chain_results r where r.user_id = uid and r.links = 7)::integer,
            case when public.badge_owned(p.badges, 'retezovka-cela-15') then 15 when public.badge_owned(p.badges, 'retezovka-cela-5') then 5 else 0 end),
        'gold', case when public.badge_owned(p.badges, 'zlatokop-100') then 100 when public.badge_owned(p.badges, 'zlatokop-50') then 50
            when public.badge_owned(p.badges, 'zlatokop-10') then 10 else 0 end,
        'winter15', case when exists (select 1 from public.player_item_grants x where x.user_id = uid and x.key ~ '^season:\d{4}-(12|01|02):15$') then 1 else 0 end,
        'chest', case when exists (select 1 from public.player_item_grants x where x.user_id = uid and public.conquest_chest_pattern(uid, x.key)) then 1 else 0 end,
        'level', public.level_of_xp(p.xp),
        -- Sady hradů (blok 40): kolikrát hráč postavil Pevnost (3. stupeň, jen domovský hrad) v kterékoli hře a v kolika sezónách
        -- dosáhl 15. stupně Sezóny Mudrlanta (zdroj pomůcky season:<RRRR-MM>:15 v player_item_grants)
        'home_fortress', (select count(*) from public.conquest_moves m where m.user_id = uid and m.kind = 'fortify' and m.result = 'fortify' and m.level = 3
            and m.game_id = any (counted_games)),
        'season15', (select count(distinct x.key) from public.player_item_grants x where x.user_id = uid and x.key ~ '^season:\d{4}-\d{2}:15$'));
end;
$$;

-- Odemčení podle statistik (zápis do conquest_looks) a stav pro aplikaci: { patterns: [id], emblems: [id], castles: [id] (sady hradů,
-- blok 40; odemčené v pořadí nabídky),
-- new: [{ kind, item, at }] (odemčené, ale ještě neohlášené), stats: { klíč: číslo } (postup „3/10“) }. I správce (dev_admins) dostane jen
-- opravdu odemčené (vidí hru jako běžný hráč); všechno mu nabídne až vývojářské „Odemknout úplně vše“ v aplikaci a conquest_check_style
-- mu to přijme.
create or replace function public.conquest_looks_json(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare stats jsonb;
begin
    if uid is null or public.dev_is_bot(uid) then
        return jsonb_build_object('patterns', '[]'::jsonb, 'emblems', '[]'::jsonb, 'castles', '[]'::jsonb, 'new', '[]'::jsonb, 'stats', '{}'::jsonb);
    end if;
    stats := public.conquest_look_stats(uid);
    insert into public.conquest_looks (user_id, kind, item, unlocked_at)
    select uid, c.kind, c.item, public.conquest_now() from public.conquest_look_catalog() c where coalesce((stats ->> c.stat)::integer, 0) >= c.need
    on conflict do nothing;
    return jsonb_build_object(
        'patterns', coalesce((select jsonb_agg(c.item order by c.ord) from public.conquest_look_catalog() c where c.kind = 'pattern'
            and exists (select 1 from public.conquest_looks l where l.user_id = uid and l.kind = c.kind and l.item = c.item)), '[]'::jsonb),
        'emblems', coalesce((select jsonb_agg(c.item order by c.ord) from public.conquest_look_catalog() c where c.kind = 'emblem'
            and exists (select 1 from public.conquest_looks l where l.user_id = uid and l.kind = c.kind and l.item = c.item)), '[]'::jsonb),
        'castles', coalesce((select jsonb_agg(c.item order by c.ord) from public.conquest_look_catalog() c where c.kind = 'castle'
            and exists (select 1 from public.conquest_looks l where l.user_id = uid and l.kind = c.kind and l.item = c.item)), '[]'::jsonb),
        'new', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'item', l.item, 'at', l.unlocked_at) order by l.unlocked_at, l.kind desc, c.ord)
            from public.conquest_looks l join public.conquest_look_catalog() c on c.kind = l.kind and c.item = l.item
            where l.user_id = uid and l.seen_at is null), '[]'::jsonb),
        'stats', stats);
end;
$$;
-- Má hráč vzor, vzácný znak nebo sadu hradů? (zapsaný v conquest_looks, správce cokoli; nezapsaný se napřed zkusí odemknout podle statistik)
create or replace function public.conquest_look_owned(uid uuid, look_kind text, look_item text) returns boolean
language plpgsql set search_path = public as $$
begin
    if uid is null or look_item is null then return false; end if;
    if exists (select 1 from public.dev_admins d where d.user_id = uid) then return true; end if;
    if exists (select 1 from public.conquest_looks l where l.user_id = uid and l.kind = look_kind and l.item = look_item) then return true; end if;
    perform public.conquest_looks_json(uid);
    return exists (select 1 from public.conquest_looks l where l.user_id = uid and l.kind = look_kind and l.item = look_item);
end;
$$;
-- Kontrola volby při založení, přidání a změně vzhledu (conquest_add_player, conquest_set_look): vzácný znak a výplň území jen odemčené
create or replace function public.conquest_check_style(uid uuid, emblem_id text, pattern_id text) returns void
language plpgsql set search_path = public as $$
begin
    if emblem_id = any (public.conquest_rare_emblems()) and not public.conquest_look_owned(uid, 'emblem', emblem_id) then
        raise exception 'Tenhle vzácný znak ještě nemáš. Vyber jiný.' using errcode = '22023';
    end if;
    if coalesce(pattern_id, '') = '' then return; end if;
    if not (pattern_id = any (public.conquest_patterns())) then raise exception 'Vyber výplň území z nabídky.' using errcode = '22023'; end if;
    if not public.conquest_look_owned(uid, 'pattern', pattern_id) then raise exception 'Tuhle výplň území ještě nemáš. Vyber jinou.' using errcode = '22023'; end if;
end;
$$;
-- Barevná výplň jen jednou ve hře (zámek hry drží volající: conquest_add_player, conquest_set_look)
create or replace function public.conquest_check_fill(gid uuid, uid uuid, pattern_id text) returns void
language plpgsql set search_path = public as $$
begin
    if coalesce(pattern_id, '') = '' or not (pattern_id = any (public.conquest_colored_patterns())) then return; end if;
    if exists (select 1 from public.conquest_players p where p.game_id = gid and p.pattern = pattern_id and p.user_id <> uid) then
        raise exception 'Výplň % už v této hře má jiný hráč. Vyber jinou.', public.conquest_pattern_name(pattern_id) using errcode = '22023';
    end if;
end;
$$;

-- Moje vzory a vzácné znaky (conquest_looks_json) a ohlášení nově odemčených: seen(upto) označí jako ohlášené vše odemčené do času upto
-- (aplikace pošle čas posledního, které ukázala; co přibude mezitím, ohlásí příště)
create or replace function public.conquest_looks() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    return public.conquest_looks_json(uid);
end;
$$;
create or replace function public.conquest_looks_seen(upto timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    update public.conquest_looks set seen_at = public.conquest_now() where user_id = uid and seen_at is null and unlocked_at <= coalesce(upto, public.conquest_now());
end;
$$;

revoke all on function public.conquest_rare_emblems(), public.conquest_patterns(), public.conquest_colored_patterns(), public.conquest_pattern_name(text),
    public.conquest_check_fill(uuid, uuid, text), public.conquest_look_catalog(), public.conquest_chest_pattern(uuid, text),
    public.conquest_look_stats(uuid), public.conquest_looks_json(uuid), public.conquest_look_owned(uuid, text, text), public.conquest_check_style(uuid, text, text)
    from public, anon, authenticated;
revoke all on function public.conquest_looks(), public.conquest_looks_seen(timestamptz) from public, anon;
grant execute on function public.conquest_looks(), public.conquest_looks_seen(timestamptz) to authenticated;
-- ===== 38: Dobývání – výplně území a vzácné znaky — KONEC BLOKU =====

-- ===== 39: Dobývání – pomůcka Ankh vzkříšení — ZAČÁTEK BLOKU =====
-- Kdo v Dobývání přijde o všechna území, už se do hry nevrací sám (automatický Návrat do hry do schématu 38, conquest_respawn je teď
-- prázdná; platí i pro boty). Vrátit se může pomůckou Ankh vzkříšení ('revive', nejvýš 3 v zásobě player_items jako ostatní pomůcky, blok 30):
-- - Použití (conquest_use_revive(hra, území)): jen v běžící hře, kterou hráč hraje, a jen když mu nezbylo žádné území (kdykoli, i uprostřed
--   kola a v posledním kole; během odpočtu do dalšího kola také). Cíl: neutrální území, nebo území jiného hráče bez opevnění (úroveň 0),
--   které není jeho domovským hradem, není obléhané (otevřená bitva, blok 25) a není chráněné po jiném Ankh vzkříšení (conquest_revive_targets).
--   Pod zámkem hry: území připadne hráči na úrovni 0 a NENÍ domovské (žádný hrad, Pevnost na něm postavit nejde), poklad na neutrálním
--   území hráč sebere (+1 tah v tomto kole jako při dobytí, conquest_budget počítá i result 'respawn'), zásoba o 1 méně. Do kroniky tah
--   druhu 'revive' s result 'respawn' (přehrání ho bere jako změnu majitele) a victim = dosavadní majitel, který o území přišel (když to bylo
--   jeho poslední, je teď mimo hru on). Hráč pak hraje se zbytkem tahů svého kola (Ankh vzkříšení tah nestojí). V jedné hře jde použít víckrát,
--   pokaždé, když hráč znovu přijde o všechno a pomůcku má.
-- - Ochrana: 60 s (conquest_revive_shield) na vzkříšené území nikdo jiný nezaútočí ani nezačne bitvu (conquest_attack_check: „Území je
--   chráněné po vzkříšení ještě N s.“), boti ho vynechají a jiné Ankh vzkříšení ho nevezme; majitel ho opevnit smí. conquest_state posílá
--   u území s = konec ochrany, dokud trvá. Dobytí ochranu smaže.
-- - Bez Ankhu vzkříšení zůstane hráč do konce hry mimo hru: hru sleduje, kolo za něj platí jako dohrané a další kolo chce sám
--   (conquest_round_auto, blok 26), upozornění na konec kola nedostane. Hra běží do svého konce (ends_at) jako dosud, Ankh vzkříšení může
--   přibýt i během hry (třeba za Kvíz dne) a hráč se pak vrátí. Pořadí: body, při shodě dřív dosažené; hráči s 0 body podle toho, kdo
--   o poslední území přišel později (conquest_finish).
-- - conquest_state: items má can_revive, revive_block (proč ne, česky) a revive_used (kolikrát v této hře); Fénix (blok 38, win_comeback)
--   počítá i výhru po Ankhu vzkříšení.
-- Odkud (player_item_grants, každý klíč jednou, s plnou zásobou propadne): startovní Ankh vzkříšení pro každého hráče jednou (klíč starter;
-- conquest_lobby, conquest_state a player_items_mine), dohraná započítaná hra Dobývání s body (conquest_finish, revive:<hra>; jako odměna:
-- aspoň 3 hráči nebo hra aspoň na den, aspoň 3 vlastní tahy, aspoň 1 bod; co hráč dostal, řekne conquest_claim v revive_item), milníky série
-- Kvízu dne 7, 30, 100 a 365 dní (daily_quiz_answer: revive_item; nejvyšší dosažený milník, nižší se přeskočí), 8. stupeň Sezóny Mudrlanta
-- (season:<RRRR-MM>:8), Truhla Mudrlanta (10 %, stejný týdenní los jako ostatní pomůcky) a Zlatá truhla (15 %). Boti nic nedostanou.

-- Délka ochrany vzkříšeného území
create or replace function public.conquest_revive_shield() returns interval
language sql immutable as $$ select interval '60 seconds' $$;

-- Startovní Ankh vzkříšení: jednou za účet (klíč starter), bot nic. Vrací zisk (player_item_grant), nebo null, když už ho hráč dostal.
create or replace function public.conquest_revive_starter(uid uuid) returns jsonb
language plpgsql set search_path = public as $$
begin
    if uid is null or public.dev_is_bot(uid) then return null; end if;
    if exists (select 1 from public.player_item_grants x where x.user_id = uid and x.key = 'starter') then return null; end if;
    return public.player_item_grant(uid, 'revive', 'starter', false);
end;
$$;

-- Milník série Kvízu dne po dohraném kvízu dne d (volá daily_quiz_answer): nejvyšší dosažený milník (7, 30, 100, 365 dní), který ještě
-- nedal Ankh vzkříšení. Vrací zisk (player_item_grant s source 'daily-streak' a at = milník), nebo null.
create or replace function public.conquest_revive_streak(uid uuid, d date) returns jsonb
language plpgsql set search_path = public as $$
declare n integer; m integer; got jsonb;
begin
    if uid is null or public.dev_is_bot(uid) then return null; end if;
    select s.streak into n from public.daily_quiz_streaks(uid, d) s;
    select max(x) into m from unnest(array[7, 30, 100, 365]) x where x <= coalesce(n, 0);
    if m is null then return null; end if;
    got := public.player_item_grant(uid, 'revive', 'daily-streak:' || m, false);
    if got is null or (got ->> 'already')::boolean then return null; end if;
    return got || jsonb_build_object('source', 'daily-streak', 'at', m);
end;
$$;

-- Území, na která teď jde hráč uid použít Ankh vzkříšení: neutrální, nebo cizí bez opevnění, ne domovský hrad, ne obléhané, ne chráněné
create or replace function public.conquest_revive_targets(g public.conquest_games, uid uuid) returns text[]
language plpgsql stable set search_path = public as $$
declare besieged text[] := public.conquest_besieged(g.id);
begin
    return coalesce((select array_agg(t.territory order by t.territory) from public.conquest_territories t
        where t.game_id = g.id and not (t.territory = any (besieged))
            and (t.owner is null or (t.owner is distinct from uid and t.level = 0 and not t.home
                and (t.shield_until is null or t.shield_until <= public.conquest_now())))), '{}'::text[]);
end;
$$;

-- Proč teď nejde použít Ankh vzkříšení (česky), nebo null, když jde. Zámek hry drží volající (conquest_use_revive), conquest_items_json jen čte.
create or replace function public.conquest_revive_block(g public.conquest_games, uid uuid) returns text
language plpgsql stable set search_path = public as $$
begin
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = uid) then return 'Tuhle hru nehraješ.'; end if;
    if g.status <> 'running' then return 'Hra neběží.'; end if;
    if public.dev_is_bot(uid) then return 'Boti pomůcky nepoužívají.'; end if;
    if exists (select 1 from public.conquest_territories t where t.game_id = g.id and t.owner = uid) then
        return 'Ankh vzkříšení jde použít, jen když ti nezbylo žádné území.';
    end if;
    if coalesce((select i.count from public.player_items i where i.user_id = uid and i.kind = 'revive'), 0) < 1 then return 'Ankh vzkříšení teď nemáš.'; end if;
    if public.conquest_now() >= g.ends_at then return 'Hra právě skončila.'; end if;
    if cardinality(public.conquest_revive_targets(g, uid)) = 0 then return 'Na mapě teď není žádné volné ani neopevněné území.'; end if;
    return null;
end;
$$;

-- Ankh vzkříšení na území target (viz začátek bloku). Opakované volání po úspěchu vrátí chybu „…jen když ti nezbylo žádné území.“
-- Vrací stav hry (conquest_state) a used = 'revive', territory, shield_until (konec ochrany).
create or replace function public.conquest_use_revive(game uuid, target text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; t public.conquest_territories; block text; p integer; now_ts timestamptz := public.conquest_now();
    victim uuid; shield timestamptz;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players c where c.game_id = game and c.user_id = uid) then
        raise exception 'Tahle hra neexistuje, nebo ji nehraješ.' using errcode = '42501';
    end if;
    if g.status = 'lobby' then raise exception 'Hra ještě nezačala.' using errcode = 'P0001'; end if;
    if public.dev_is_bot(uid) then raise exception 'Boti pomůcky nepoužívají.' using errcode = '42501'; end if;
    perform public.conquest_housekeep(game);
    select * into g from public.conquest_games where id = game;
    if g.status <> 'running' then raise exception 'Hra už skončila.' using errcode = 'P0001'; end if;
    -- Řádek zásoby zamčený: dvě souběžná Ankh vzkříšení téhož hráče (dvě zařízení, dvě hry) jdou po sobě
    insert into public.player_items (user_id, kind, count, updated_at) values (uid, 'revive', 0, now_ts) on conflict (user_id, kind) do nothing;
    perform 1 from public.player_items i where i.user_id = uid and i.kind = 'revive' for update;
    block := public.conquest_revive_block(g, uid);
    if block is not null then raise exception '%', block using errcode = 'P0001'; end if;
    select * into t from public.conquest_territories x where x.game_id = game and x.territory = target for update;
    if t.territory is null then raise exception 'Tohle území na mapě není.' using errcode = '22023'; end if;
    if target = any (public.conquest_besieged(game)) then raise exception 'Na území právě probíhá bitva. Vyber jiné.' using errcode = 'P0001'; end if;
    if t.owner is not null then
        if t.home then raise exception 'Domovský hrad Ankhem vzkříšení vzít nejde. Vyber volné nebo neopevněné území.' using errcode = 'P0001'; end if;
        if t.level > 0 then raise exception 'Opevněné území Ankhem vzkříšení vzít nejde. Vyber volné nebo neopevněné území.' using errcode = 'P0001'; end if;
        if t.shield_until > now_ts then
            raise exception 'Území je chráněné po vzkříšení ještě % s.', greatest(1, ceil(extract(epoch from (t.shield_until - now_ts))))::integer using errcode = 'P0001';
        end if;
    end if;
    victim := t.owner;
    p := public.conquest_period(g);
    shield := now_ts + public.conquest_revive_shield();
    update public.conquest_territories set owner = uid, level = 0, home = false, treasure = false, captured_at = now_ts, shield_until = shield,
        building = case when building = 'mine' then 'mine' end
    where game_id = game and territory = target;
    insert into public.conquest_moves (game_id, user_id, period, kind, territory, source, success, result, victim, level, treasure, home, at, building)
    values (game, uid, p, 'revive', target, null, true, 'respawn', victim, 0, t.treasure and victim is null, false, now_ts, case when t.building in ('tower', 'mine') then t.building end);
    update public.player_items set count = count - 1, updated_at = now_ts where user_id = uid and kind = 'revive';
    update public.conquest_players set lost_period = null where game_id = game and user_id = uid;
    if victim is not null and not exists (select 1 from public.conquest_territories x where x.game_id = game and x.owner = victim) then
        update public.conquest_players set lost_period = p where game_id = game and user_id = victim;
    end if;
    perform public.conquest_rescore(game, uid);
    perform public.conquest_rescore(game, victim);
    -- Další kolo (blok 26): hráč už nechce další kolo sám, klepne si zase on (jeho stará značka zmizí)
    delete from public.conquest_round_marks where game_id = game and period = p and user_id = uid;
    update public.conquest_games set round_rev = round_rev + 1 where id = game;
    return public.conquest_state(game) || jsonb_build_object('used', 'revive', 'territory', target, 'shield_until', shield);
end;
$$;

-- Oprávnění: hráč volá jen použití (anon nic); pomocné funkce jen interně
revoke all on function public.conquest_revive_shield(), public.conquest_revive_starter(uuid), public.conquest_revive_streak(uuid, date),
    public.conquest_revive_targets(public.conquest_games, uuid), public.conquest_revive_block(public.conquest_games, uuid) from public, anon, authenticated;
revoke all on function public.conquest_use_revive(uuid, text) from public, anon;
grant execute on function public.conquest_use_revive(uuid, text) to authenticated;
-- ===== 39: Dobývání – pomůcka Ankh vzkříšení — KONEC BLOKU =====

-- ===== 40: Dobývání – sady hradů — ZAČÁTEK BLOKU =====
-- Sady hradů (docs/ODMENY-DOBYVANI.md oddíl 3): jiný styl domovského hradu (stupně 0–3, icons/stavby/hrad-<sada>-<stupeň>.webp) a opevnění
-- ostatních území (Palisáda a Hradba, opevneni-<sada>-1 a -2) na mapě Dobývání. Volba je conquest_players.castle (null = základní hrad
-- a opevnění); ve hře ji může mít víc hráčů (střechy a praporky se barví barvou hráče, barvy jsou ve hře různé). Odemyká se stejně jako
-- výplně a vzácné znaky v bloku 38: řádky druhu 'castle' v conquest_look_catalog, statistiky home_fortress (Pevnost na domovském hradu,
-- tah fortify s úrovní 3 v kterékoli hře) a season15 (15. stupeň Sezóny Mudrlanta v různých sezónách) v conquest_look_stats, battles
-- (vyhrané bitvy) už je; seznam odemčených castles v conquest_looks_json. Volbu hlídá conquest_check_castle (conquest_add_player přes
-- conquest_create a conquest_join, conquest_set_look): jen sada z nabídky a jen odemčená (správci v dev_admins cokoli). Boti nic neodemykají
-- a hrají se základním hradem. Seznam odpovídá conquest.js CASTLE_SETS (hlídá tests/conquest.test.js a tests/sql-conquest-looks.test.js).
create or replace function public.conquest_castles() returns text[]
language sql immutable as $$ select array['goticky', 'orientalni', 'japonsky', 'pernikovy', 'parostrojni', 'ledovy']::text[] $$;
-- Kontrola sady hradů při založení, přidání a změně vzhledu (null nebo prázdná = základní hrad)
create or replace function public.conquest_check_castle(uid uuid, castle_id text) returns void
language plpgsql set search_path = public as $$
begin
    if coalesce(castle_id, '') = '' then return; end if;
    if not (castle_id = any (public.conquest_castles())) then raise exception 'Vyber hrad z nabídky.' using errcode = '22023'; end if;
    if not public.conquest_look_owned(uid, 'castle', castle_id) then raise exception 'Tenhle hrad ještě nemáš. Vyber jiný.' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.conquest_castles(), public.conquest_check_castle(uuid, text) from public, anon, authenticated;
-- ===== 40: Dobývání – sady hradů — KONEC BLOKU =====

-- ===== 41: Dobývání – stavby, ozdoby a další sady hradů — ZAČÁTEK BLOKU =====
-- Stavby na území (docs/DOBYVANI-STAVBY.md): tah „Postavit“ na vlastním území mimo domovský hrad, které není obléhané, postaví jednu
-- ze tří staveb (conquest_territories.building): Opevnění ('wall', dosavadní Palisáda a Hradba, jediná stavba s úrovněmi), Strážní věž
-- ('tower') nebo Důl ('mine'). Na území stojí nejvýš jedna stavba a stojí jeden tah (conquest_move_by: move_kind 'fortify', 'tower', 'mine';
-- zapíše se jako tah fortify s building). Domovský hrad se opevňuje jako dřív (až na Pevnost) a jiné stavby nemá.
-- Strážní věž: když na území s věží začne bitva, majitel se do ní smí přidat jako obránce, i když s územím nesousedí, pokud mu v kole
-- zbývá tah (conquest_siege_join, conquest_sieges_json: can_join a can_defend; conquest_siege_players.defender). Dokud se může přidat
-- (člověk s tahem, do join_until), bitva na něj počká i po odpovědích útočníků (conquest_siege_defender_due v conquest_siege_resolve).
-- Odpoví-li obránce správně a nejrychleji, útok je odražen (tah 'defend' s výsledkem 'repel', bitva s outcome 'repel'): území i věž
-- zůstávají. Vyhraje-li útočník, území dobude a věž padne (tah útoku má building 'tower'). Majitel dostane upozornění „Útok na tvé
-- území, braň ho!“ (druh 'conquest_defend', klíč cqd:hra:hráč:bitva v push_pending a push_mark, conquest_defend_push_items; v aplikaci
-- je totéž v pulsu jako can_defend). Odražený útok se počítá mezi vyhrané bitvy (conquest_look_stats: battles).
-- Důl: na konci hry 2 body místo 1 (conquest_rescore, body se počítají průběžně), při dobytí nepadá (dobyvatel ho má i s bodem navíc),
-- obranu nemá. Opevnění: poslední úroveň pobořená útokem mimo domov = území bez stavby (tah útoku má building 'wall').
-- Ozdoby se odvozují v aplikaci bez nové tabulky: Zřícenina na území, kde v tomto kole padlo opevnění nebo věž (tahy kola s building
-- 'wall'/'tower' v conquest_state.moves, 'b'), Tábor obléhatelů u otevřené bitvy, Pomník vítěze na domovském území vítěze po konci hry.
-- Další sady hradů (Perníkový hrad, Parostrojní pevnost, Ledový palác) v conquest_castles a conquest_look_catalog: série Kvízu dne
-- 100 dní (daily_streak), 100 vyhraných bitev (battles) a Boss týdne poražený 10× (boss).
-- Boti občas postaví věž nebo důl místo palisády (conquest_bot_move) a obranu nehrají.

-- Čeká bitva na obránce? Na území stojí strážní věž, majitel je člověk, do bitvy se ještě nepřidal, přidat se ještě jde (od bloku 42
-- defend_until: 15 s od začátku útoku v rychlé hře, jinak 30 s) a v kole mu zbývá tah. Volá ho conquest_siege_resolve (zámek hry drží volající).
create or replace function public.conquest_siege_defender_due(s public.conquest_sieges) returns boolean
language plpgsql stable set search_path = public as $$
declare t public.conquest_territories;
begin
    if s.id is null or s.status <> 'open' or public.conquest_now() >= public.conquest_siege_defend_until(s) then return false; end if;
    select * into t from public.conquest_territories x where x.game_id = s.game_id and x.territory = s.territory;
    if t.owner is null or t.building is distinct from 'tower' or public.dev_is_bot(t.owner) then return false; end if;
    if exists (select 1 from public.conquest_siege_players p where p.siege_id = s.id and p.user_id = t.owner) then return false; end if;
    return coalesce((public.conquest_budget(s.game_id, t.owner) ->> 'left')::integer, 0) > 0;
end;
$$;

-- „Útok na tvé území, braň ho!“ (řádky ve tvaru položek push_pending; volá ho jen push_pending): otevřená bitva o území se strážní věží,
-- jejíž majitel (člověk s upozorněními z Dobývání a funkčním odběrem) se ještě nepřidal, přidat se ještě může a má tah. Jednou za bitvu.
create or replace function public.conquest_defend_push_items() returns table (user_id uuid, kind text, title text, body text, url text, dedupe_key text, sort_at text)
language sql stable set search_path = public as $$
    select t.owner, 'conquest_defend'::text, 'Útok na tvé území, braň ho!'::text,
        'Hra ' || m.title || ': strážní věž hlásí útok. Přidej se do bitvy, dokud to jde. Obrana stojí 1 tah.',
        './?dobyvani=' || g.code,
        'cqd:' || g.id || ':' || t.owner || ':' || s.id,
        s.started_at::text
    from public.conquest_sieges s
    join public.conquest_games g on g.id = s.game_id and g.status = 'running'
    join public.conquest_maps m on m.id = g.map
    join public.conquest_territories t on t.game_id = s.game_id and t.territory = s.territory and t.building = 'tower' and t.owner is not null
    join public.profiles me on me.id = t.owner and me.push_conquest
    where s.status = 'open' and public.conquest_siege_defend_until(s) > public.conquest_now()
        and exists (select 1 from public.push_subscriptions ps where ps.user_id = t.owner and ps.fails < 3)
        and not public.dev_is_bot(t.owner)
        and not exists (select 1 from public.conquest_siege_players p where p.siege_id = s.id and p.user_id = t.owner)
        and coalesce((public.conquest_budget(s.game_id, t.owner) ->> 'left')::integer, 0) > 0
$$;
revoke all on function public.conquest_siege_defender_due(public.conquest_sieges), public.conquest_defend_push_items() from public, anon, authenticated;
-- ===== 41: Dobývání – stavby, ozdoby a další sady hradů — KONEC BLOKU =====

-- ===== 42: Dobývání – boti pro všechny (tři obtížnosti, hrají jako lidé) — ZAČÁTEK BLOKU =====
-- Podrobně docs/DOBYVANI-BOTI.md. Kdo hru založil, přidá do ní v lobby boty (conquest_add_bots: počet a obtížnost 'easy' Mudrlátko,
-- 'medium' Mudrlant, 'hard' Super Mudrlant; obtížnosti jde ve hře míchat) a zase je odebere (conquest_remove_bot). Aspoň jedno místo zůstane
-- člověku (zakladatel je ve hře), nejvýš 30 přidaných botů za hodinu na hráče (conquest_bot_log). Bot je účet botx-…@bots.invalid se jménem
-- z nabídky své obtížnosti (conquest_bot_names, ve hře se jméno neopakuje); volný účet se stejným jménem se použije znovu.
-- Obtížnost (conquest_players.bot_level) určuje úspěšnost, rychlost odpovědi a strategii (conquest_bot_skill, conquest_bot_answer_delay,
-- conquest_bot_attack_pick, conquest_bot_build_pick, conquest_bot_react). Boti hrají jako lidé:
--  * Tahy si rozloží do kola (conquest_bot_slots: časy z hashe hry, bota a kola, občas dva tahy blízko sebe, první po 4 % kola, poslední
--    nejpozději 45 s až 2,4 h před koncem kola). Tah, jehož čas nastal, bot zahraje, když zrovna nečeká na svou odpověď v bitvě.
--  * Útok bota je obléhání jako u člověka (conquest_bot_siege_begin): sousedé se přidají, otázku pošle první člověk, který se přidá
--    (conquest_sieges.needs_question, conquest_siege_join). Bot odpoví po své době (conquest_siege_players.bot_answer_at a bot_correct) a jeho
--    odpověď se zapíše s tímto časem (conquest_bot_siege_sync), takže o vítězi rozhoduje skutečný čas bez ohledu na to, kdy server běžel.
--  * Na začátku každé bitvy si boti naplánují, jestli se přidají nebo budou bránit svou strážní věž (conquest_bot_plans); bitva na
--    naplánované přidání počká jako na člověka.
--  * Když lidé kolo dohráli, boti zbytek tahů odehrají hned (okamžité tahy bez bitvy: nikdo se už přidat nemůže); stejně tahy, jejichž
--    čas je víc než 2 minuty pryč (nikdo hru neotevřel), a vývojářské „Boti odehrají tahy“. Další kolo chtějí, až kolo dohrají.
-- Co je pohání: conquest_pulse (aplikace ho volá každé 1,5–3 s, boti nejvýš jednou za 4 s na hru: conquest_games.bot_tick_at),
-- conquest_state, conquest_round_ready a tournament_tick → conquest_bots_tick (otevření aplikace, pg_cron úloha upozornění každou minutu).
-- XP: hra s boty dává část XP podle nejsilnějšího bota (conquest_xp_share v bloku 21). Odemčení vzhledu jen ze her aspoň dvou lidí
-- (conquest_look_stats). Pomůcky boti nepoužívají ani nedostávají.
alter table public.conquest_games add column if not exists bot_tick_at timestamptz;
alter table public.conquest_siege_players add column if not exists bot_answer_at timestamptz;
alter table public.conquest_siege_players add column if not exists bot_correct boolean;
-- Naplánovaná přidání botů do bitvy (útok, nebo obrana strážní věže): kdy, odkud
create table if not exists public.conquest_bot_plans (
    siege_id uuid not null references public.conquest_sieges (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    join_at timestamptz not null,
    source text,
    defender boolean not null default false,
    primary key (siege_id, user_id)
);
create table if not exists public.conquest_bot_log (
    user_id uuid not null references public.profiles (id) on delete cascade,
    at timestamptz not null default now()
);
create index if not exists conquest_bot_log_user_idx on public.conquest_bot_log (user_id, at);
alter table public.conquest_bot_plans enable row level security;
alter table public.conquest_bot_log enable row level security;
revoke all on public.conquest_bot_plans, public.conquest_bot_log from public, anon, authenticated;
-- Vývojářští boti ze starších her jsou Mudrlanti
update public.conquest_players set bot_level = 'medium' where bot_level is null and public.dev_is_bot(user_id);
drop function if exists public.conquest_bot_move(uuid, uuid);
drop function if exists public.conquest_bots_due(uuid, boolean);
drop function if exists public.conquest_bot_skill(uuid);
drop function if exists public.conquest_bot_offset(uuid);

-- Jména botů podle obtížnosti (nejvýš 20 znaků, žádná skutečná jména lidí)
create or replace function public.conquest_bot_names(lvl text) returns text[]
language sql immutable as $$
    select case lvl
        when 'easy' then array['Šroubek', 'Pípálek', 'Cvaklík', 'Matička', 'Drátek', 'Bzučík', 'Kolečko', 'Blikálek', 'Pružinka', 'Ťukálek',
            'Cinkálek', 'Zoubek', 'Plecháček', 'Vrtulka', 'Klapka', 'Žárovička', 'Popletík', 'Baterka', 'Vrzálek', 'Kapsáček']
        when 'hard' then array['Kvantový Profesor', 'Encyklopedor', 'Megamozek', 'Turbomudrc', 'Gigabajt Veliký', 'Velmistr Procesor',
            'Algoritmus Rex', 'Hyperpíst', 'Supravodič', 'Kybernaut', 'Titán Vědění', 'Lord Kalkulon', 'Neuronový Baron', 'Arcimudrc',
            'Omnivěd', 'Atlas Všeznalý', 'Strojmistr Všeznal', 'Generál Gigahertz', 'Císař Kvízů', 'Orákulum 3000']
        else array['Ozubec', 'Pístek', 'Ventilek', 'Dynamko', 'Magnetek', 'Pákovec', 'Motorek', 'Turbínka', 'Kladka', 'Spínač',
            'Kvízomat', 'Tipovač', 'Hádankář', 'Čipík', 'Odpovídač', 'Kalibrátor', 'Paměťák', 'Logikus', 'Bystroun', 'Otazník 2.0'] end
$$;
-- Deterministické „náhodné“ číslo 0–1 z textu (rozvrh tahů a úspěšnost bota nezávisí na tom, kdy server běží)
create or replace function public.conquest_bot_hash(t text) returns double precision
language sql immutable as $$ select ((('x' || substr(md5(t), 1, 7))::bit(28)::integer) + 0.5) / 268435456.0 $$;
-- Úspěšnost bota (pravděpodobnost správné odpovědi): Mudrlátko 45–55 %, Mudrlant 65–75 %, Super Mudrlant 85–92 % (každý bot jinak)
create or replace function public.conquest_bot_skill(uid uuid, lvl text) returns numeric
language sql immutable set search_path = public as $$
    select (case lvl when 'easy' then 0.45 + 0.10 * public.conquest_bot_hash(uid::text || 'skill') when 'hard' then 0.85 + 0.07 * public.conquest_bot_hash(uid::text || 'skill')
        else 0.65 + 0.10 * public.conquest_bot_hash(uid::text || 'skill') end)::numeric
$$;
-- Správná odpověď bota na otázku tahu; útok na opevněné území je těžší (o 8 bodů za úroveň, Super Mudrlant o 5)
create or replace function public.conquest_bot_correct(uid uuid, lvl text, fort integer default 0) returns boolean
language sql volatile set search_path = public as $$
    select random() < public.conquest_bot_skill(uid, lvl) - (case when lvl = 'hard' then 0.05 else 0.08 end) * greatest(0, coalesce(fort, 0))
$$;
-- Jak dlouho bot přemýšlí nad otázkou bitvy: Mudrlátko 25–50 s, Mudrlant 12–35 s, Super Mudrlant 6–20 s
create or replace function public.conquest_bot_answer_delay(lvl text) returns interval
language sql volatile as $$
    select make_interval(secs => case lvl when 'easy' then 25 + 25 * random() when 'hard' then 6 + 14 * random() else 12 + 23 * random() end)
$$;
-- Jak dlouho botovi trvá, než si bitvy všimne a přidá se: Mudrlátko 15–45 s, Mudrlant 8–35 s, Super Mudrlant 4–20 s
create or replace function public.conquest_bot_react_delay(lvl text) returns interval
language sql volatile as $$
    select make_interval(secs => case lvl when 'easy' then 15 + 30 * random() when 'hard' then 4 + 16 * random() else 8 + 27 * random() end)
$$;
-- Rozvrh tahů bota v kole p (total tahů): časy seřazené, mezery z hashe (exponenciální, tedy jako náhodné časy), asi třetina tahů hned
-- po předchozím (shluky); první po 4 % kola, poslední nejpozději tail před koncem kola (5 min: 45 s, 10 min: 75 s, hodina: 6 min, den: 2,4 h)
create or replace function public.conquest_bot_slots(g public.conquest_games, uid uuid, p integer, total integer) returns timestamptz[]
language plpgsql stable set search_path = public as $$
declare starts timestamptz := public.conquest_period_start(g, p); span double precision; lead double precision; tail double precision;
    gaps double precision[] := '{}'; e double precision; sum_e double precision := 0; acc double precision := 0; k integer; slots timestamptz[] := '{}';
begin
    if coalesce(total, 0) <= 0 then return slots; end if;
    span := greatest(1, extract(epoch from (public.conquest_period_end(g, p) - starts)));
    lead := span * 0.04;
    tail := least(span * 0.15, greatest(75, span * 0.1));
    for k in 0 .. total loop
        e := -ln(public.conquest_bot_hash(g.seed || uid || ':' || p || ':g' || k));
        if k between 1 and total - 1 and public.conquest_bot_hash(g.seed || uid || ':' || p || ':b' || k) < 0.3 then e := e * 0.15; end if;
        gaps := gaps || e;
        sum_e := sum_e + e;
    end loop;
    for k in 1 .. total loop
        acc := acc + gaps[k];
        slots := slots || (starts + make_interval(secs => lead + greatest(0, span - lead - tail) * acc / sum_e));
    end loop;
    return slots;
end;
$$;
-- Čeká bot v bitvě na svou odpověď (jako člověk, který zrovna odpovídá)?
create or replace function public.conquest_bot_busy(gid uuid, uid uuid) returns boolean
language sql stable set search_path = public as $$
    select exists (select 1 from public.conquest_sieges s join public.conquest_siege_players p on p.siege_id = s.id
        where s.game_id = gid and s.status = 'open' and p.user_id = uid and p.answered_at is null)
$$;

-- Bot do lobby (zámek hry drží volající): jméno z nabídky obtížnosti, které ve hře ještě není; volný účet bota se stejným jménem
-- (stejná předpona e-mailu, ve hře ještě není, má méně než 6 her) se použije znovu, jinak vznikne nový. Volná barva, náhodný znak, chce hrát.
create or replace function public.conquest_bot_insert(g public.conquest_games, lvl text, prefix text) returns uuid
language plpgsql set search_path = public as $$
declare nm text; bot uuid; colour text; emblem_id text;
    colors text[] := array['emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo'];
begin
    select n into nm from unnest(public.conquest_bot_names(lvl)) n
     where not exists (select 1 from public.conquest_players c join auth.users u on u.id = c.user_id where c.game_id = g.id and u.raw_user_meta_data ->> 'bot_name' = n)
     order by random() limit 1;
    nm := coalesce(nm, (public.conquest_bot_names(lvl))[1]);
    select u.id into bot from auth.users u
     where u.email like prefix || '-%@bots.invalid' and u.raw_user_meta_data ->> 'bot_name' = nm
       and not exists (select 1 from public.conquest_players c where c.game_id = g.id and c.user_id = u.id)
       and public.conquest_active_count(u.id) < 6
     order by u.created_at limit 1;
    if bot is null then
        bot := gen_random_uuid();
        insert into auth.users (id, email, raw_user_meta_data) values (bot, prefix || '-' || bot || '@bots.invalid', jsonb_build_object('full_name', nm, 'bot_name', nm));
        update public.profiles set avatar = '🤖', color = colors[1 + floor(random() * array_length(colors, 1))::integer] where id = bot;
    end if;
    select c into colour from unnest(public.conquest_colors()) c where c not in (select p.color from public.conquest_players p where p.game_id = g.id) order by random() limit 1;
    select e into emblem_id from unnest(public.conquest_emblems()) e order by random() limit 1;
    perform public.conquest_add_player(g, bot, colour, emblem_id);
    update public.conquest_players set ready = true, bot_level = lvl where game_id = g.id and user_id = bot;
    return bot;
end;
$$;
-- Plná nebo připravená hra začne (jako po Chci hrát)
create or replace function public.conquest_bot_lobby_start(gid uuid) returns void
language plpgsql set search_path = public as $$
begin
    if exists (select 1 from public.conquest_games g where g.id = gid and g.status = 'lobby') and (select count(*) from public.conquest_players where game_id = gid) >= 2
            and not exists (select 1 from public.conquest_players where game_id = gid and not ready) then
        perform public.conquest_start(gid);
    end if;
end;
$$;
-- Hra pro správu botů: jen ten, kdo hru založil a hraje ji, jen v lobby; vrací ji zamčenou
create or replace function public.conquest_bot_game(game uuid) returns public.conquest_games
language plpgsql set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games;
begin
    if uid is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into g from public.conquest_games where id = game for update;
    if g.id is null or not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = uid) then raise exception 'Tuhle hru nehraješ.' using errcode = '42501'; end if;
    if g.creator is distinct from uid then raise exception 'Boty může přidat a odebrat jen ten, kdo hru založil.' using errcode = '42501'; end if;
    if g.status <> 'lobby' then raise exception 'Boty jde přidat a odebrat jen ve hře, která ještě nezačala.' using errcode = 'P0001'; end if;
    return g;
end;
$$;
-- Přidat boty (zakladatel hry v lobby): how_many botů obtížnosti difficulty ('easy', 'medium', 'hard'), nejvýš do volných míst; aspoň jedno
-- místo zůstane lidem (boti nejvýš max_players − 1), nejvýš 30 botů za hodinu. Plná hra (nebo když všichni chtějí hrát) začne. Vrací souhrn hry.
create or replace function public.conquest_add_bots(game uuid, how_many integer default 1, difficulty text default 'medium') returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.conquest_games; free integer; bots integer; room integer; i integer;
begin
    if difficulty is null or difficulty not in ('easy', 'medium', 'hard') then raise exception 'Vyber obtížnost bota.' using errcode = '22023'; end if;
    g := public.conquest_bot_game(game);
    free := g.max_players - (select count(*) from public.conquest_players where game_id = game)::integer;
    bots := (select count(*) from public.conquest_players where game_id = game and bot_level is not null)::integer;
    room := least(free, g.max_players - 1 - bots);
    if free <= 0 then raise exception 'Hra je už plná.' using errcode = 'P0001'; end if;
    if room <= 0 then raise exception 'Aspoň jedno místo musí zůstat lidem.' using errcode = 'P0001'; end if;
    room := least(room, greatest(1, least(coalesce(how_many, 1), 7)));
    delete from public.conquest_bot_log where at < now() - interval '1 day';
    if (select count(*) from public.conquest_bot_log where user_id = uid and at > now() - interval '1 hour') + room > 30 then
        raise exception 'Botů bylo za poslední hodinu přidáno hodně. Zkus to zase za chvíli.' using errcode = 'P0001';
    end if;
    for i in 1 .. room loop
        perform public.conquest_bot_insert(g, difficulty, 'botx');
        insert into public.conquest_bot_log (user_id, at) values (uid, now());
        select * into g from public.conquest_games where id = game;
        exit when g.status <> 'lobby';
    end loop;
    perform public.conquest_bot_lobby_start(game);
    select * into g from public.conquest_games where id = game;
    return public.conquest_summary(g, uid);
end;
$$;
-- Odebrat bota z lobby (zakladatel hry). Vrací souhrn hry.
create or replace function public.conquest_remove_bot(game uuid, bot uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.conquest_games;
begin
    g := public.conquest_bot_game(game);
    if not exists (select 1 from public.conquest_players p where p.game_id = game and p.user_id = bot and p.bot_level is not null) then
        raise exception 'Takový bot ve hře není.' using errcode = '22023';
    end if;
    delete from public.conquest_players where game_id = game and user_id = bot;
    return public.conquest_summary(g, auth.uid());
end;
$$;
-- Vývojář: boti (Mudrlanti, e-mail bot-…) do hry, kterou sám hraje a která ještě nezačala (nejvýš do plna); plná hra začne sama,
-- jinak až klepneš na Chci hrát. Vrací souhrn hry.
create or replace function public.dev_conquest_add_bots(game uuid, how_many integer default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.conquest_games; i integer; free integer;
begin
    g := public.dev_conquest_check(game);
    if g.status <> 'lobby' then raise exception 'Boty jde přidat jen do hry, která ještě nezačala.' using errcode = 'P0001'; end if;
    free := g.max_players - (select count(*) from public.conquest_players where game_id = game)::integer;
    if free <= 0 then raise exception 'Hra je už plná.' using errcode = 'P0001'; end if;
    for i in 1 .. least(greatest(coalesce(how_many, 1), 1), free) loop
        perform public.conquest_bot_insert(g, 'medium', 'bot');
        select * into g from public.conquest_games where id = game;
        exit when g.status <> 'lobby';
    end loop;
    perform public.conquest_bot_lobby_start(game);
    select * into g from public.conquest_games where id = game;
    return public.conquest_summary(g, auth.uid());
end;
$$;

-- Cíl útoku bota (sousední cizí nebo volné území, ne obléhané, ne chráněné po Ankhu vzkříšení) a jeho skóre:
--  Mudrlátko skoro náhodně (volné území a neopevněné o trochu raději); Mudrlant poklad > volné > domov soupeře, opevnění odrazuje;
--  Super Mudrlant dokončí region (+7) a jde po regionu, kde už území má, rozbije soupeři celý region, bere poklady, volná a neopevněná
--  území a domovy soupeřů bez opevnění, slabšího soupeře raději, opevnění a strážní věž ho odrazují.
create or replace function public.conquest_bot_attack_pick(g public.conquest_games, uid uuid, lvl text, out target text, out fort integer, out score double precision)
language plpgsql volatile set search_path = public as $$
declare besieged text[] := public.conquest_besieged(g.id); my_score integer;
begin
    select c.score into my_score from public.conquest_players c where c.game_id = g.id and c.user_id = uid;
    select x.territory, x.level, x.sc into target, fort, score from (
        select c.territory, c.level, case lvl
            when 'easy' then 3 * random() + case when c.owner is null then 0.7 else 0 end - 0.6 * c.level
            when 'hard' then case when c.treasure then 5 else 0 end + case when c.owner is null then 2.5 else 0 end
                + case when rg.others = rg.mine then 7 else 3.0 * rg.mine / greatest(1, rg.others) end
                + case when c.owner is not null and rg.whole then 3.5 else 0 end
                + case when c.home and c.owner is not null and c.level = 0 then 3 else 0 end
                - 3.5 * c.level - case when c.building = 'tower' then 1.5 else 0 end
                + case when c.owner is not null and coalesce(o.score, 0) < coalesce(my_score, 0) then 1 else 0 end + random()
            else case when c.treasure then 6 else 0 end + case when c.owner is null then 3 else 0 end + case when c.home and c.owner is not null then 1.5 else 0 end
                - 2.5 * c.level + 3 * random() end as sc
          from public.conquest_territories c
          left join public.conquest_players o on o.game_id = g.id and o.user_id = c.owner
          left join public.conquest_regions r on r.map = g.map and r.territory = c.territory
          cross join lateral (select count(*) filter (where r2.territory <> c.territory) as others,
                    count(*) filter (where r2.territory <> c.territory and t2.owner = uid) as mine,
                    c.owner is not null and coalesce(bool_and(t2.owner is not distinct from c.owner), false) as whole
                from public.conquest_regions r2 join public.conquest_territories t2 on t2.game_id = g.id and t2.territory = r2.territory
                where r2.map = g.map and r2.region = r.region) rg
         where c.game_id = g.id and c.owner is distinct from uid and not (c.territory = any (besieged))
           and (c.owner is null or c.shield_until is null or c.shield_until <= public.conquest_now())
           and exists (select 1 from public.conquest_territories s join public.conquest_links l on l.map = g.map and l.a = s.territory and l.b = c.territory
                        where s.game_id = g.id and s.owner = uid)
    ) x order by x.sc desc limit 1;
end;
$$;
-- Stavba bota na vlastním neobléhaném území (kind 'fortify', 'tower', 'mine'):
--  Mudrlátko jen opevní, co ho napadne; Mudrlant raději domov a ohrožená území, neopevněné území mimo domov občas dostane věž nebo důl;
--  Super Mudrlant opevní domov (Pevnost dává tah navíc), na území s víc sousedy soupeřů postaví strážní věž, v bezpečném vnitrozemí důl.
create or replace function public.conquest_bot_build_pick(g public.conquest_games, uid uuid, lvl text, out target text, out kind text)
language plpgsql volatile set search_path = public as $$
declare besieged text[] := public.conquest_besieged(g.id); b numeric;
begin
    select x.territory, x.k into target, kind from (
        select t.territory, case
                when lvl = 'hard' and not t.home and t.level = 0 and t.building is null and e.n >= 2 then 'tower'
                when lvl = 'hard' and not t.home and t.level = 0 and t.building is null and e.n = 0 then 'mine'
                else 'fortify' end as k,
            case lvl
                when 'easy' then random()
                when 'hard' then case when t.home then 3 + case when e.n > 0 then 2 else 0 end else 0 end
                    + case when not t.home and t.level = 0 and t.building is null then case when e.n >= 2 then 2.5 when e.n = 0 then 2 else 1.5 end
                           when not t.home then case when e.n > 0 then 1 else 0 end else 0 end + 0.5 * random()
                else case when t.home then 2 else 0 end + case when e.n > 0 then 2 else 0 end + random() end as pr
          from public.conquest_territories t
          cross join lateral (select count(*) as n from public.conquest_links l join public.conquest_territories o on o.game_id = g.id and o.territory = l.b
                where l.map = g.map and l.a = t.territory and o.owner is not null and o.owner <> uid) e
         where t.game_id = g.id and t.owner = uid and not (t.territory = any (besieged))
           and coalesce(t.building, 'wall') = 'wall' and t.level < (case when t.home then 3 else 2 end)
    ) x order by x.pr desc limit 1;
    -- Mudrlant občas místo palisády na neopevněném území mimo domov postaví důl nebo věž (jako dřív)
    if lvl = 'medium' and kind = 'fortify' and exists (select 1 from public.conquest_territories h where h.game_id = g.id and h.territory = target and not h.home and h.level = 0) then
        b := random();
        if b < 0.25 then kind := 'mine'; elsif b < 0.4 then kind := 'tower'; end if;
    end if;
end;
$$;
-- Bitva bota (zámek hry drží volající): obléhání jako u člověka se zástupnou otázkou (needs_question), bot odpoví po své době.
-- Ne v posledních 75 s hry. Vrací false, když útok nejde.
create or replace function public.conquest_bot_siege_begin(g public.conquest_games, uid uuid, lvl text, target text, src text, fort integer) returns boolean
language plpgsql set search_path = public as $$
declare s public.conquest_sieges; now_ts timestamptz := public.conquest_now(); budget jsonb;
begin
    if now_ts > g.ends_at - interval '75 seconds' or target = any (public.conquest_besieged(g.id)) then return false; end if;
    begin perform public.conquest_attack_check(g, uid, target, src); exception when others then return false; end;
    budget := public.conquest_budget(g.id, uid);
    if coalesce((budget ->> 'left')::integer, 0) <= 0 then return false; end if;
    insert into public.conquest_sieges (game_id, territory, started_by, question, correct_choice, started_at, join_until, ends_at, needs_question)
    values (g.id, target, uid, '{"choices": ["?", "?"], "bot": true}'::jsonb, 0, now_ts, now_ts + public.conquest_siege_window(), now_ts + public.conquest_siege_window(), true)
    returning * into s;
    insert into public.conquest_siege_players (siege_id, user_id, source, period, joined_at, bot_answer_at, bot_correct)
    values (s.id, uid, src, (budget ->> 'period')::integer, now_ts, now_ts + public.conquest_bot_answer_delay(lvl), public.conquest_bot_correct(uid, lvl, fort));
    update public.conquest_games set siege_rev = siege_rev + 1 where id = g.id;
    perform public.conquest_bot_react(s.id);
    return true;
end;
$$;
-- Na začátku bitvy si boti hry naplánují reakci: majitel území se strážní věží brání (Mudrlátko 35 %, Mudrlant 65 %, Super Mudrlant 95 %,
-- do defend_until), soused se přidá k útoku (Mudrlátko 15 %, Mudrlant 30 %, Super Mudrlant 30 % a víc, když by dokončil region, je tam
-- poklad nebo je území neopevněné); nejvýš dva boti na bitvu. Bot potřebuje tah (zkontroluje se znovu při přidání).
create or replace function public.conquest_bot_react(sid uuid) returns void
language plpgsql set search_path = public as $$
declare s public.conquest_sieges; g public.conquest_games; t public.conquest_territories; b record; chance double precision; joiners integer := 0;
    lvl text; src text; wait interval; completes boolean;
begin
    select * into s from public.conquest_sieges where id = sid;
    if s.id is null or s.status <> 'open' then return; end if;
    select * into g from public.conquest_games where id = s.game_id;
    select * into t from public.conquest_territories where game_id = s.game_id and territory = s.territory;
    for b in select c.user_id, coalesce(c.bot_level, 'medium') as lvl from public.conquest_players c
              where c.game_id = g.id and (c.bot_level is not null or public.dev_is_bot(c.user_id))
                and not exists (select 1 from public.conquest_siege_players p where p.siege_id = sid and p.user_id = c.user_id)
              order by random() loop
        lvl := b.lvl;
        continue when coalesce((public.conquest_budget(g.id, b.user_id) ->> 'left')::integer, 0) <= 0;
        if t.owner = b.user_id then
            continue when t.building is distinct from 'tower' or random() >= case lvl when 'easy' then 0.35 when 'hard' then 0.95 else 0.65 end;
            wait := public.conquest_siege_defend_until(s) - s.started_at - interval '2 seconds';
            insert into public.conquest_bot_plans (siege_id, user_id, join_at, source, defender)
            values (sid, b.user_id, s.started_at + least(public.conquest_bot_react_delay(lvl), greatest(interval '1 second', wait * (0.3 + 0.6 * random()))), null, true)
            on conflict do nothing;
            continue;
        end if;
        continue when joiners >= 2;
        select o.territory into src from public.conquest_territories o join public.conquest_links l on l.map = g.map and l.a = o.territory and l.b = s.territory
         where o.game_id = g.id and o.owner = b.user_id order by o.level desc, o.territory limit 1;
        continue when src is null;
        completes := not exists (select 1 from public.conquest_regions r join public.conquest_regions r2 on r2.map = r.map and r2.region = r.region and r2.territory <> r.territory
            left join public.conquest_territories x on x.game_id = g.id and x.territory = r2.territory
            where r.map = g.map and r.territory = s.territory and x.owner is distinct from b.user_id);
        chance := case lvl when 'easy' then 0.15 when 'hard' then 0.3 + case when completes then 0.4 else 0 end + case when t.treasure then 0.2 else 0 end
            + case when t.level = 0 then 0.1 else 0 end else 0.3 end;
        continue when random() >= chance;
        insert into public.conquest_bot_plans (siege_id, user_id, join_at, source, defender)
        values (sid, b.user_id, least(s.started_at + public.conquest_bot_react_delay(lvl), s.join_until - interval '2 seconds'), src, false)
        on conflict do nothing;
        joiners := joiners + 1;
    end loop;
end;
$$;
-- Má bot v bitvě co udělat (naplánované přidání nebo odpověď, jejichž čas nastal)?
create or replace function public.conquest_bot_siege_due(sid uuid) returns boolean
language sql stable set search_path = public as $$
    select exists (select 1 from public.conquest_bot_plans b where b.siege_id = sid and b.join_at <= public.conquest_now())
        or exists (select 1 from public.conquest_siege_players p where p.siege_id = sid and p.answered_at is null and p.bot_answer_at <= public.conquest_now())
$$;
-- Boti v bitvě (zámek hry drží volající, volá conquest_siege_resolve): naplánovaná přidání, jejichž čas nastal, se zapíšou s tímto časem
-- (jako by se bot přidal přesně tehdy: jen když tehdy ještě někdo neodpověděl, nebo jde o obranu, a bot pořád smí útočit a má tah),
-- odpovědi botů, jejichž čas nastal, také (answered_at = bot_answer_at). Vrací true, když se něco změnilo.
create or replace function public.conquest_bot_siege_sync(sid uuid) returns boolean
language plpgsql set search_path = public as $$
declare s public.conquest_sieges; g public.conquest_games; pl public.conquest_bot_plans; t public.conquest_territories; lvl text; changed boolean := false;
    allowed boolean; n integer;
begin
    select * into s from public.conquest_sieges where id = sid;
    if s.id is null or s.status <> 'open' then return false; end if;
    for pl in select * from public.conquest_bot_plans b where b.siege_id = sid and b.join_at <= public.conquest_now() order by b.join_at loop
        delete from public.conquest_bot_plans where siege_id = sid and user_id = pl.user_id;
        changed := true;
        select * into g from public.conquest_games where id = s.game_id;
        select * into t from public.conquest_territories where game_id = s.game_id and territory = s.territory;
        select coalesce(c.bot_level, 'medium') into lvl from public.conquest_players c where c.game_id = g.id and c.user_id = pl.user_id;
        allowed := g.status = 'running' and pl.join_at < s.join_until and lvl is not null
            and coalesce((public.conquest_budget(g.id, pl.user_id) ->> 'left')::integer, 0) > 0
            and not exists (select 1 from public.conquest_siege_players p where p.siege_id = sid and p.user_id = pl.user_id);
        if allowed and pl.defender then
            allowed := t.owner = pl.user_id and t.building = 'tower' and pl.join_at < public.conquest_siege_defend_until(s);
        elsif allowed then
            allowed := t.owner is distinct from pl.user_id
                and exists (select 1 from public.conquest_siege_players p where p.siege_id = sid and coalesce(p.answered_at, p.bot_answer_at, 'infinity'::timestamptz) > pl.join_at)
                and exists (select 1 from public.conquest_territories o where o.game_id = g.id and o.territory = pl.source and o.owner = pl.user_id);
        end if;
        continue when not allowed;
        insert into public.conquest_siege_players (siege_id, user_id, source, period, joined_at, defender, bot_answer_at, bot_correct)
        values (sid, pl.user_id, pl.source, public.conquest_period(g), pl.join_at, pl.defender, pl.join_at + public.conquest_bot_answer_delay(lvl),
            public.conquest_bot_correct(pl.user_id, lvl, case when pl.defender then 0 else t.level end));
        update public.conquest_sieges set ends_at = greatest(ends_at, pl.join_at + public.conquest_siege_window()) where id = sid returning * into s;
    end loop;
    update public.conquest_siege_players set answered_at = bot_answer_at, is_correct = coalesce(bot_correct, false)
     where siege_id = sid and answered_at is null and bot_answer_at <= public.conquest_now();
    get diagnostics n = row_count;
    if n > 0 then changed := true; end if;
    if changed then update public.conquest_games set siege_rev = siege_rev + 1 where id = s.game_id; end if;
    return changed;
end;
$$;

-- Jeden tah bota: útok (siege = true: obléhání jako u člověka; jinak okamžitá bitva bez dalších účastníků), nebo stavba. Jak často staví
-- místo útoku: Mudrlátko 8 %, Mudrlant 20 %, Super Mudrlant 20 % a vždy, když nemá dobrý cíl útoku (a v polovině případů, když je domov
-- ohrožený a neopevněný naplno); kdo nemá kam útočit, staví. Bot bez území (pomůcky nemá) nehraje. Vrací false, když bot nemá co hrát.
create or replace function public.conquest_bot_move(gid uuid, bot uuid, siege boolean default false) returns boolean
language plpgsql set search_path = public as $$
declare g public.conquest_games; lvl text; atk record; bld record; kind text := 'attack'; target text; fort integer := 0; src text; ok boolean; build_now boolean;
    atk_target text; atk_fort integer; atk_score double precision;
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' then return false; end if;
    select coalesce(c.bot_level, 'medium') into lvl from public.conquest_players c where c.game_id = gid and c.user_id = bot;
    if lvl is null or not exists (select 1 from public.conquest_territories t where t.game_id = gid and t.owner = bot) then return false; end if;
    select x.target, x.fort, x.score into atk_target, atk_fort, atk_score from public.conquest_bot_attack_pick(g, bot, lvl) x;
    -- Útok těsně před koncem hry už bitvu nestihne: staví
    if siege and public.conquest_now() > g.ends_at - interval '75 seconds' then atk_target := null; end if;
    build_now := atk_target is null or random() < case lvl when 'easy' then 0.08 else 0.2 end
        or (lvl = 'hard' and (atk_score < 1 or (random() < 0.5 and exists (select 1 from public.conquest_territories h where h.game_id = gid and h.owner = bot and h.home and h.level < 3
            and exists (select 1 from public.conquest_links l join public.conquest_territories e on e.game_id = gid and e.territory = l.b
                        where l.map = g.map and l.a = h.territory and e.owner is not null and e.owner <> bot)))));
    if build_now then
        select x.target, x.kind into target, kind from public.conquest_bot_build_pick(g, bot, lvl) x;
        if target is null then kind := 'attack'; end if;
    end if;
    if target is null then
        if atk_target is null then return false; end if;
        target := atk_target; fort := atk_fort; kind := 'attack';
    end if;
    if kind = 'attack' then
        select s.territory into src from public.conquest_territories s join public.conquest_links l on l.map = g.map and l.a = s.territory and l.b = target
         where s.game_id = gid and s.owner = bot order by s.level desc, random() limit 1;
        if siege then return public.conquest_bot_siege_begin(g, bot, lvl, target, src, fort); end if;
        ok := public.conquest_bot_correct(bot, lvl, fort);
    else
        ok := public.conquest_bot_correct(bot, lvl, 0);
    end if;
    begin
        perform public.conquest_move_by(bot, gid, target, kind, ok, src);
    exception when others then return false;
    end;
    return true;
end;
$$;
-- Poslední kolo hry dohráli všichni (conquest_round_done: žádná otevřená bitva, každý hráč bez tahu, bez území, nebo nemá co hrát; boti, až
-- odehrají svůj rozvrh): hra skončí hned (ends_at = teď) a conquest_finish ji uzavře stejně jako po čase (pořadí, odměny, pomník, upozornění).
-- Volá ho conquest_housekeep. Během odpočtu do dalšího kola nic (kolo poslední není).
create or replace function public.conquest_end_early(gid uuid) returns void
language plpgsql set search_path = public as $$
declare g public.conquest_games; p integer; now_ts timestamptz := public.conquest_now();
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' or now_ts >= g.ends_at or (g.round_at is not null and g.round_at > now_ts) then return; end if;
    p := public.conquest_period(g);
    if public.conquest_period_end(g, p) < g.ends_at or not public.conquest_round_done(g) then return; end if;
    update public.conquest_games set ends_at = now_ts where id = gid and status = 'running';
end;
$$;
-- Dohráli kolo všichni lidé (boti pak zbytek odehrají hned)?
create or replace function public.conquest_round_humans_done(g public.conquest_games) returns boolean
language sql stable set search_path = public as $$
    select not exists (select 1 from public.conquest_players pl where pl.game_id = g.id and pl.bot_level is null and not public.dev_is_bot(pl.user_id)
        and not public.conquest_round_player_done(g, pl.user_id))
$$;
-- Boti hry odehrají, co jim podle rozvrhu kola (conquest_bot_slots) patří: tah, jehož čas nastal, jako obléhání, když bot zrovna nečeká
-- na svou odpověď (jeden za volání); tah víc než 2 minuty po čase (hru nikdo neotevřel) okamžitě, nejvýš co rozvrh dovolí. play_all
-- (vývojář) nebo dohrané kolo všech lidí: všechno, co zbývá, hned a okamžitě. throttle (conquest_pulse): nejvýš jednou za 4 s na hru.
-- Bot, který nemá co hrát, má kolo dohrané (bot_idle). Vrací počet tahů.
create or replace function public.conquest_bots_due(gid uuid, play_all boolean default false, throttle boolean default false) returns integer
language plpgsql set search_path = public as $$
declare g public.conquest_games; p integer; b record; budget jsonb; slots timestamptz[]; used integer; made integer := 0; steps integer; hurry boolean;
    instant boolean; now_ts timestamptz := public.conquest_now();
begin
    select * into g from public.conquest_games where id = gid;
    if g.id is null or g.status <> 'running' then return 0; end if;
    if throttle and g.bot_tick_at > now_ts - interval '4 seconds' then return 0; end if;
    if not exists (select 1 from public.conquest_players pl where pl.game_id = gid and (pl.bot_level is not null or public.dev_is_bot(pl.user_id))) then return 0; end if;
    select * into g from public.conquest_games where id = gid for update;
    if throttle and g.bot_tick_at > now_ts - interval '4 seconds' then return 0; end if;
    update public.conquest_games set bot_tick_at = now_ts where id = gid;
    perform public.conquest_housekeep(gid);
    select * into g from public.conquest_games where id = gid;
    if g.status <> 'running' then return 0; end if;
    p := public.conquest_period(g);
    hurry := play_all or public.conquest_round_humans_done(g);
    for b in select pl.user_id, pl.bot_idle from public.conquest_players pl where pl.game_id = gid and (pl.bot_level is not null or public.dev_is_bot(pl.user_id)) order by pl.seat loop
        continue when b.bot_idle is not distinct from p;
        steps := 0;
        loop
            exit when steps >= 15;
            budget := public.conquest_budget(gid, b.user_id);
            exit when coalesce((budget ->> 'left')::integer, 0) <= 0;
            if hurry then instant := true;
            else
                used := (budget ->> 'used')::integer;
                slots := public.conquest_bot_slots(g, b.user_id, p, (budget ->> 'total')::integer);
                exit when used >= coalesce(cardinality(slots), 0) or slots[used + 1] > now_ts;
                instant := now_ts - slots[used + 1] > interval '2 minutes';
                exit when not instant and public.conquest_bot_busy(gid, b.user_id);
            end if;
            if not public.conquest_bot_move(gid, b.user_id, not instant) then
                -- Nemá co hrát: kolo má dohrané (dočasně obléhané cíle se počítají, jen když žádná bitva neběží)
                if hurry or not exists (select 1 from public.conquest_sieges s where s.game_id = gid and s.status = 'open') then
                    update public.conquest_players set bot_idle = p where game_id = gid and user_id = b.user_id;
                end if;
                exit;
            end if;
            steps := steps + 1;
            made := made + 1;
            exit when not instant;
        end loop;
    end loop;
    -- Boti dohráli poslední kolo: hra může skončit hned (conquest_end_early v úklidu)
    if made > 0 then perform public.conquest_housekeep(gid); end if;
    return made;
end;
$$;
-- Boti ve všech rozehraných hrách (volá tournament_tick: otevření aplikace, odesílání upozornění, pg_cron); i jejich odpovědi v bitvách
create or replace function public.conquest_bots_tick() returns void
language plpgsql set search_path = public as $$
declare r record;
begin
    for r in select distinct pl.game_id from public.conquest_players pl join public.conquest_games g on g.id = pl.game_id
              where g.status = 'running' and (pl.bot_level is not null or public.dev_is_bot(pl.user_id)) loop
        perform public.conquest_bots_due(r.game_id);
        perform public.conquest_sieges_due(r.game_id, false);
    end loop;
end;
$$;
revoke all on function public.conquest_bot_names(text), public.conquest_bot_hash(text), public.conquest_bot_skill(uuid, text), public.conquest_bot_correct(uuid, text, integer),
    public.conquest_bot_answer_delay(text), public.conquest_bot_react_delay(text), public.conquest_bot_slots(public.conquest_games, uuid, integer, integer),
    public.conquest_bot_busy(uuid, uuid), public.conquest_bot_insert(public.conquest_games, text, text), public.conquest_bot_lobby_start(uuid), public.conquest_bot_game(uuid),
    public.conquest_bot_attack_pick(public.conquest_games, uuid, text), public.conquest_bot_build_pick(public.conquest_games, uuid, text),
    public.conquest_bot_siege_begin(public.conquest_games, uuid, text, text, text, integer), public.conquest_bot_react(uuid), public.conquest_bot_siege_due(uuid),
    public.conquest_bot_siege_sync(uuid), public.conquest_bot_move(uuid, uuid, boolean), public.conquest_round_humans_done(public.conquest_games), public.conquest_end_early(uuid),
    public.conquest_bots_due(uuid, boolean, boolean), public.conquest_bots_tick() from public, anon, authenticated;
revoke all on function public.conquest_add_bots(uuid, integer, text), public.conquest_remove_bot(uuid, uuid), public.dev_conquest_add_bots(uuid, integer) from public, anon;
grant execute on function public.conquest_add_bots(uuid, integer, text), public.conquest_remove_bot(uuid, uuid), public.dev_conquest_add_bots(uuid, integer) to authenticated;
-- ===== 42: Dobývání – boti pro všechny (tři obtížnosti, hrají jako lidé) — KONEC BLOKU =====

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
-- 26: Dobývání – rychlé hry a další kolo (období 'min10' a 'min5', conquest_games.duration_minutes, round_no, round_at, round_prev_at a round_rev;
--     conquest_create s nepovinným minutes, minutes v souhrnu hry přes conquest_minutes, předvolba 'blesk-20m' a conquest_presets s minutes;
--     kola po předčasném začátku v conquest_period, conquest_period_start a conquest_period_end; conquest_round_marks a conquest_round_ready,
--     round v conquest_state a conquest_pulse přes conquest_round_json, conquest_round_done a conquest_round_player_done; boti dohrají tahy, když
--     lidé dohráli; conquest_version s round_rev a číslem kola; upozornění rychlých her o dalším kole).
-- 27: Dobývání – conquest_state posílá v budgets tahy všech hráčů v tomto kole (zbývá a celkem), pořadí u mapy je ukazuje.
-- 28: Dobývání – Chci další kolo: přeskočený zbytek kola se odečte i z konce hry (conquest_round_ready posune ends_at).
-- 29: Dobývání – upozornění „Všichni dohráli kolo“ (druh 'conquest_round', klíč cqr:) a „Kolo brzy končí“ (druh 'conquest_ending', klíč cqe:)
--     v push_pending a push_mark přes conquest_round_push_items, conquest_push_warn, conquest_push_moves a conquest_push_time, limit 3 minuty.
-- 30: Dobývání – pomůcky Tah navíc a 50/50 (player_items, player_item_grants, conquest_players.fifty_at a fifty_ref,
--     conquest_siege_players.fifty; player_items_mine, player_items_claim (Sezóna Mudrlanta a Truhla Mudrlanta), conquest_use_extra,
--     conquest_use_fifty; tah druhu 'extra' bez území v conquest_moves, conquest_budget: extra, budgets.extra a items v conquest_state,
--     items v conquest_lobby, fifty a removed v bitvách; zisk v boss_submit, daily_quiz_answer, chain_submit, conquest_finish
--     a conquest_claim; export_my_data má i 'pomucky').
-- 31: Speciální turnaje na téma (tournaments.kind, theme, title, starts_at, round_minutes, created_by; tournament_now, tournament_round_phase,
--     tournament_round_end – kola po minutách od začátku v tournament_progress, tournament_start, tournament_tick, tournament_join,
--     tournament_start_match, tournament_answer_save, botech a připomínce zápasu; dev_special_tournament_create a dev_special_tournament_delete)
--     a hlasování o tématu (tournament_themes, tournament_polls, tournament_votes; tournament_poll_state, tournament_vote, dev_tournament_poll_close;
--     upozornění druhu 'tournament_special' s klíčem tsp: v push_pending a push_mark; export_my_data má i 'turnaje_hlasovani');
--     kontumovaný zápas: nedohraný výsledek dostane správné a body z uložených odpovědí (tournament_pick_winner) a tournament_details ukáže
--     rozpis i hráči, který zápas nedohrál, až je rozhodnutý; nová výzva má vždy výběr z možností (challenge_variant_choices, psaní jen pro
--     jednoho hráče).
-- 32: Motivace – kontrola odemčení na serveru (unlock_catalog, unlock_ok, level_of_xp, badge_tiers, badge_owned, league_best_rank,
--     trigger profiles_unlock_check pro rámeček, titul, sovu, obrázek a vítězný efekt), Pozvi kamarády (referral_codes, referrals,
--     referral_rewards; referral_status, referral_join, referral_claim; export_my_data má i 'pozvanky'), prestiž (profiles.prestige
--     a prestige_xp, prestige_up), vítězný efekt (profiles.victory_fx), reakce navíc jen odemčené (match_reactions_emoji_list, check_reaction)
--     a vitrína s titulem a věcmi ze Sezóny Mudrlanta (showcase_format_ok a check_showcase: t:<titul>, s:<druh>:<id>).
-- 33: Zamrzlé denní módy – Dnešní otázky, Řetězovka dne, Tajemná otázka dne a Boss týdne ukládá question_snapshot_claim jako Kvíz dne (semínka
--     mudrlant-dnes-, -retezovka-, -tajemna- a -boss-; daily_snapshot_seed_ok), daily_snapshots_get je vrací i nepřihlášeným (daily_snapshot_public).
-- 34: Hlasování o speciálním turnaji jen na pokyn správce (tournament_polls.visible, 2–4 témata; tournament_poll_state vrací skryté jen správci,
--     tournament_vote jen ve zveřejněném; dev_tournament_poll_set: témata a zobrazení vybere správce).
-- 35: Další postavičky (č. 317–340) v katalogu odemykání: unlock_catalog_more() (v bloku 32 prázdná, unlock_catalog() ji přidá za své řádky).
-- 36: Odznaky Řetězovky dne (retezovka-*, retezovka-cela-* v badge_catalog() a badge_tiers()), chain_badge_counts() (dohrané dny a celé
--     řetězy bez Záchrany z chain_results pro dorovnání počítadel), Pavouk pletař za odznak retezovka-10 místo turnaj-postupy-5 (unlock_catalog_more);
--     check_unlocks pustí jiné barvy postavičky, kterou profil už má (i když se mezitím změnilo, čím se odemyká), a správci (dev_admins) cokoli.
-- 37: Pomůcka Záchrana navíc do Řetězovky ('chain_rescue', nejvýš 1, v player_items, player_item_cap a player_items_json): použití
--     chain_use_rescue (player_item_uses, klíč chain:<den>), chain_results.extra_rescue a chain_submit se dvěma zachráněnými články,
--     chain_json s extra; zisk za milníky Řetězovky (chain_rescue_milestone v chain_submit: rescue_item), 12. stupeň Sezóny, Truhlu
--     Mudrlanta (player_item_roll) a Zlatou truhlu (player_items_claim 'gold') a společný cíl Bosse (boss_claim_bonus: item);
--     export_my_data má v 'pomucky' i 'pouzite'.
-- 38: Dobývání – výplně území (vzory) a vzácné znaky: conquest_players.pattern (barevná výplň jen jednou ve hře: conquest_check_fill,
--     conquest_colored_patterns, conquest_pattern_name, index conquest_players_fill_key), conquest_links.sea (námořní spoje z vygenerované části),
--     conquest_looks (odemčené a ohlášené), conquest_look_catalog, conquest_rare_emblems, conquest_patterns, conquest_look_stats (statistiky
--     z dohraných her, bitev, území přes moře, Bosse týdne, Kvízu dne, Řetězovky, odznaků Zlaté otázky, zimní Sezóny, Truhly a úrovně;
--     i zpětně), conquest_looks_json, conquest_look_owned, conquest_check_style, conquest_chest_pattern; RPC conquest_looks a conquest_looks_seen;
--     conquest_create, conquest_join a conquest_set_look s nepovinným pattern_id (vzácný znak a vzor jen odemčené), conquest_add_player
--     s pattern_id, conquest_summary s pattern, conquest_lobby a conquest_claim s looks, player_items_claim u truhly s pattern (Duha);
--     export_my_data má i 'dobyvani_vzhled'.
-- 39: Dobývání – pomůcka Ankh vzkříšení ('revive', nejvýš 3, v player_items, player_item_cap a player_items_json) místo automatického Návratu
--     do hry (conquest_respawn nic nedělá): conquest_use_revive (jen bez území, cíl neutrální nebo cizí neopevněné území mimo domovské
--     hrady a bitvy, tah 'revive' s result 'respawn', ne domovské), ochrana 60 s (conquest_territories.shield_until, conquest_attack_check,
--     conquest_bot_move, conquest_state s 's'), conquest_revive_targets, conquest_revive_block, conquest_items_json s can_revive, revive_block
--     a revive_used; zisk: startovní (conquest_revive_starter v conquest_lobby, conquest_state a player_items_mine), započítaná hra s body
--     (conquest_finish, conquest_claim: revive_item), milníky série Kvízu dne (conquest_revive_streak v daily_quiz_answer: revive_item),
--     8. stupeň Sezóny, Truhla Mudrlanta a Zlatá truhla (player_items_claim); hráči bez území chtějí další kolo sami (conquest_round_auto
--     v conquest_round_json, conquest_round_ready a upozorněních), pořadí hráčů bez bodů podle toho, kdo vydržel déle (conquest_finish),
--     poklad i po Ankhu vzkříšení (conquest_budget), Fénix i po Ankhu vzkříšení (conquest_look_stats), texty upozornění na útoky.
-- 40: Dobývání – sady hradů (Gotický hrad, Orientální palác, Japonský hrad): conquest_players.castle, conquest_castles, conquest_check_castle;
--     conquest_look_catalog s druhem 'castle', conquest_looks s druhem 'castle', conquest_look_stats s home_fortress a season15,
--     conquest_looks_json s castles; conquest_create, conquest_join, conquest_set_look a conquest_add_player s nepovinným castle_id
--     (jen odemčená sada), conquest_summary s castle.
--     Bez nové verze: seznamy hráčů vracejí i stupeň prestiže ('prestige'; weekly_leaderboard, friends_list, group_player_json, pořadí Kvízu
--     dne, Tajemné otázky a Řetězovky, skupiny, pozvánky kamarádů) pro medailon v rohu obrázku hráče; starší databáze ho nepošle a medailon chybí.
-- 41: Dobývání – stavby (conquest_territories.building: opevnění, strážní věž, důl; conquest_move_by s move_kind 'tower' a 'mine',
--     conquest_moves.building a druh 'defend' s výsledkem 'repel', conquest_siege_players.defender, bitva s outcome 'repel';
--     conquest_siege_join a conquest_sieges_json s obráncem a can_defend, conquest_siege_defender_due, conquest_siege_resolve s obranou;
--     conquest_rescore s dolem za 2 body, conquest_attack_apply a conquest_use_revive: věž padne, důl zůstane; conquest_state a conquest_move_json
--     s 'b'; upozornění 'conquest_defend' s klíčem cqd: přes conquest_defend_push_items v push_pending a push_mark; obrana v počtu tahů
--     (conquest_budget, conquest_finish, conquest_claim) a odražený útok mezi vyhranými bitvami (conquest_look_stats); boti staví věže a doly;
--     conquest_lobby s monument = domovské území vítěze dohrané hry pro pomník v náhledu)
--     a další sady hradů Perníkový hrad, Parostrojní pevnost a Ledový palác (conquest_castles, conquest_look_catalog).
-- 42: Dobývání – boti pro všechny (docs/DOBYVANI-BOTI.md): conquest_add_bots a conquest_remove_bot (zakladatel v lobby), obtížnosti
--     conquest_players.bot_level a bot_idle, rozvrh tahů v kole (conquest_bot_slots), bitvy botů s needs_question (otázku pošle člověk
--     v conquest_siege_join s novými parametry question a correct), odpovědi botů s jejich časem (conquest_siege_players.bot_answer_at
--     a bot_correct, conquest_bot_siege_sync v conquest_siege_resolve), naplánovaná přidání a obrana botů (conquest_bot_plans, conquest_bot_react),
--     conquest_bots_due s throttle v conquest_pulse (conquest_games.bot_tick_at), boti chtějí další kolo, až dohrají; XP podle nejsilnějšího
--     bota (conquest_xp_share, xp_share v souhrnu hry a conquest_claim), odemčení jen ze her aspoň dvou lidí (conquest_look_stats); obrana
--     strážní věží jen 15 s (rychlá hra) nebo 30 s od začátku útoku (conquest_siege_defend_until, defend_until v bitvě); dev_is_bot i pro botx-…,
--     dev_tournament_clear_bots maže jen vývojářské boty; prázdná lobby s boty zmizí (conquest_leave); poslední kolo dohrané všemi ukončí hru
--     hned (conquest_end_early v conquest_housekeep).
create or replace function public.schema_version() returns integer
language sql immutable as $$ select 42 $$;
revoke all on function public.schema_version() from public, anon;
grant execute on function public.schema_version() to authenticated;
