-- Základ databáze pro účty a budoucí multiplayer. Spustit jednou v Supabase: SQL Editor → New query → vložit → Run.
-- Pravidla řádků (RLS) jsou zapnutá: anon klíč z config.js sám nic nepřečte ani nezapíše, dokud to pravidlo nedovolí.

-- Profil hráče: jméno a barva, která se ukazuje ostatním. Vzniká sám po prvním přihlášení.
create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text not null default 'Hráč',
    created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Profily vidí všichni přihlášení (jména soupeřů), měnit si každý jen svůj
drop policy if exists "profiles: čtení pro přihlášené" on public.profiles;
create policy "profiles: čtení pro přihlášené" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles: vlastní změna" on public.profiles;
create policy "profiles: vlastní změna" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Při registraci nového účtu se profil založí z jména od Googlu
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Hráč'))
    on conflict (id) do nothing;
    return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Dosavadním účtům (kdyby nějaké byly) profil doplnit
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', split_part(email, '@', 1), 'Hráč')
from auth.users on conflict (id) do nothing;
