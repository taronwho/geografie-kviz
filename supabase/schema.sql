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
alter table public.profiles add constraint profiles_color_list check (color in ('emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo'));

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
        'tema-sport-25', 'tema-sport-100', 'tema-sport-300'
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
