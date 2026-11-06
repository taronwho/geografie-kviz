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
alter table public.profiles add constraint profiles_badges_len check (cardinality(badges) <= 200 and char_length(array_to_string(badges, ',')) <= 4000) not valid;
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len check (char_length(btrim(display_name)) between 2 and 24);
alter table public.profiles drop constraint if exists profiles_avatar_len;
alter table public.profiles add constraint profiles_avatar_len check (char_length(avatar) between 1 and 8);
alter table public.profiles drop constraint if exists profiles_color_list;
alter table public.profiles add constraint profiles_color_list check (color in ('emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo') or color ~ '^h([0-9]?[05]|[12][0-9][05]|3[0-4][05]|35[05])$');

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
        and points <= 4 * (select c.count from public.challenges c where c.id = challenge_id)
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
        'prvni-krok', 'odpovedi-10', 'odpovedi-50', 'stovka', 'odpovedi-250', 'odpovedi-500', 'tisicovka', 'odpovedi-2500',
        'odpovedi-5000', 'odpovedi-10000', 'rada-5', 'strelec', 'neomylny', 'rada-50', 'rada-100', 'serie-3', 'tyden',
        'serie-14', 'mesic', 'serie-60', 'serie-100', 'serie-200', 'serie-365', 'dny-5', 'dny-15', 'dny-30', 'dny-60',
        'dny-100', 'dny-200', 'dny-365', 'dokonaly-den', 'dokonale-3', 'dokonale-7', 'dokonale-14', 'dokonale-30', 'dnes-10',
        'dnes-50', 'dnes-100', 'dnes-250', 'bez-napovedy-10', 'bez-napovedy', 'bez-napovedy-100', 'bez-napovedy-500',
        'psani-10', 'pisatel', 'psani-100', 'psani-500', 'do-hloubky', 'tezke-50', 'tezke-200', 'chyby-10', 'chyby-50',
        'chyby-200', 'soupere', 'vyzvy-5', 'vyzvy-25', 'vyzvy-100', 'vitez', 'vyhry-5', 'gladiator', 'vyhry-25', 'vyhry-50',
        'vyhry-100', 'vyhry-v-rade-3', 'vyhry-v-rade-5', 'vyhry-v-rade-10', 'zalozene-1', 'zalozene-10', 'zalozene-50',
        'perfektni-vyzvy-1', 'perfektni-vyzvy-5', 'perfektni-vyzvy-25', 'uroven-5', 'znalec', 'uroven-20', 'mudrc',
        'uroven-50', 'uroven-65', 'uroven-80', 'uroven-100', 'poznane-100', 'poznane-500', 'poznane-1000', 'poznane-3000',
        'vsestranny', 'hvezdar', 'mistr-oboru', 'vsechna-temata-1', 'vsechna-temata-3', 'vsechna-temata-5', 'tema-zemepis-25',
        'tema-zemepis-100', 'tema-zemepis-300', 'tema-vlajky-25', 'tema-vlajky-100', 'tema-vlajky-300', 'tema-historie-25',
        'tema-historie-100', 'tema-historie-300', 'tema-mytologie-25', 'tema-mytologie-100', 'tema-mytologie-300',
        'tema-biologie-25', 'tema-biologie-100', 'tema-biologie-300', 'tema-geologie-25', 'tema-geologie-100',
        'tema-geologie-300', 'tema-chemie-25', 'tema-chemie-100', 'tema-chemie-300', 'tema-fyzika-25', 'tema-fyzika-100',
        'tema-fyzika-300', 'tema-umeni-25', 'tema-umeni-100', 'tema-umeni-300', 'tema-architektura-25',
        'tema-architektura-100', 'tema-architektura-300', 'tema-hudba-25', 'tema-hudba-100', 'tema-hudba-300',
        'tema-literatura-25', 'tema-literatura-100', 'tema-literatura-300', 'tema-film-25', 'tema-film-100', 'tema-film-300',
        'tema-sport-25', 'tema-sport-100', 'tema-sport-300',
        'zbehly-zemepis', 'zbehly-vlajky', 'zbehly-historie', 'zbehly-mytologie', 'zbehly-biologie', 'zbehly-geologie', 'zbehly-chemie', 'zbehly-fyzika', 'zbehly-umeni', 'zbehly-architektura', 'zbehly-hudba', 'zbehly-literatura', 'zbehly-film', 'zbehly-sport',
        'turnaj-ucast', 'turnaj-ctvrtfinale', 'turnaj-semifinale', 'turnaj-bronz', 'turnaj-stribro', 'turnaj-zlato', 'turnaj-postupy-1', 'turnaj-postupy-5', 'turnaj-postupy-15'
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

create or replace function public.tournament_finish_match(mid uuid, correct_count integer, point_count integer) returns void
language plpgsql security definer set search_path = public as $$
declare m public.tournament_matches; r public.tournament_results;
begin
    if auth.uid() is null then raise exception 'Přihlas se.' using errcode = '42501'; end if;
    select * into m from public.tournament_matches where id = mid;
    select * into r from public.tournament_results where match_id = mid and user_id = auth.uid() for update;
    if m.id is null or r.match_id is null or r.finished_at is not null or m.winner is not null then raise exception 'Výsledek jde zapsat jen jednou.' using errcode = '22023'; end if;
    update public.tournament_results set finished_at = now(), correct = greatest(0, least(correct_count, 10)), points = greatest(0, least(point_count, 100)),
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

-- ===== Chyby z provozu (monitor.js) =====
-- Aplikace sem po dávkách posílá neodchycené chyby z prohlížeče: jen zprávu, zkrácený zásobník volání (adresy bez parametrů), adresu stránky bez parametrů,
-- prohlížeč, verzi aplikace a čas; žádné osobní údaje ani id hráče. Zapsat smí kdokoli s veřejným klíčem (i nepřihlášený), číst jen správce
-- v dev_admins přes dev_client_errors() (Nastavení → vývojářský režim → Chyby z provozu). Celkem nejvýš 100 řádků za hodinu (trigger).
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

-- Čas zápisu určuje server; celkem nejvýš 100 chyb za hodinu (zaplavení tabulky z jednoho zařízení nebo skriptem)
create or replace function public.limit_client_errors() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 100 then
        raise exception 'Příliš mnoho hlášených chyb za hodinu.' using errcode = '22023';
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

-- ===== Verze schématu =====
-- Číslo se zvyšuje při KAŽDÉ změně tohoto souboru (tabulka, sloupec, funkce, pravidlo) a zároveň konstanta REQUIRED_SCHEMA v app.js.
-- Aplikace ho po přihlášení porovná a správci (dev_admins nebo vývojářský režim) ukáže v Nastavení, že má schéma spustit znovu;
-- tests/sql-security.test.js hlídá, že se obě čísla shodují. Funkce patří na konec souboru.
create or replace function public.schema_version() returns integer
language sql immutable as $$ select 1 $$;
revoke all on function public.schema_version() from public, anon;
grant execute on function public.schema_version() to authenticated;
