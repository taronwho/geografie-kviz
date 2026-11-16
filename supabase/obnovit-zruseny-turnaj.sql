-- Obnoví zrušený týdenní turnaj (Mix) tohoto týdne se všemi přihlášenými, doplní boty do velikosti pavouka a turnaj hned spustí.
-- Spouští se ručně v Supabase → SQL Editor (běží jako správce databáze). Jednorázový zásah, ne součást schema.sql.
--
-- Proč najednou: zrušený turnaj s méně než 8 hráči by při nejbližším otevření aplikace kýmkoli (tournament_tick) zase zrušil sám,
-- takže otevřít ho a boty přidávat ručně z vývojářského okna nejde – obnovení, boti a start musí proběhnout v jednom kroku.
--
-- Pavouk má velikost mocniny dvou (8, 16, 32…); botů se přidá tolik, aby se do něj vešli všichni přihlášení skuteční hráči
-- (např. 5 hráčů + 3 boti = 8, 11 hráčů + 5 botů = 16). Boti pak hrají sami jako u vývojářských turnajů (každý den od 9:00, první kolo hned).
-- Hráčům zmizí oznámení „Turnaj se zrušil“.
do $$
declare
    tid uuid;
    real_players integer;
    target integer := 8;
    added integer := 0;
    uid uuid;
    names text[] := array['Adam', 'Barbora', 'Cyril', 'Dana', 'Emil', 'Fanda', 'Gita', 'Honza', 'Ivana', 'Jirka', 'Klára', 'Libor', 'Marta', 'Nikola', 'Ondra', 'Petra', 'Radek', 'Soňa', 'Tomáš', 'Uršula', 'Viktor', 'Wanda', 'Zdeněk', 'Alena', 'Bořek', 'Cecílie', 'David', 'Eliška', 'Filip', 'Gabriela', 'Hugo', 'Irena'];
    colors text[] := array['emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo'];
begin
    -- Zrušený týdenní turnaj tohoto týdne (pondělí podle pražského času)
    select id into tid from public.tournaments
        where kind = 'weekly' and status = 'cancelled' and week_start = date_trunc('week', public.tournament_today())::date
        order by created_at desc limit 1
        for update;
    if tid is null then raise exception 'Zrušený turnaj tohoto týdne jsem nenašel (už běží, nebo se nezrušil).'; end if;

    select count(*) into real_players from public.tournament_entries where tournament_id = tid;
    if real_players = 0 then raise exception 'Do turnaje se nikdo nepřihlásil, není koho vrátit.'; end if;
    while target < real_players loop target := target * 2; end loop;
    if target > 128 then raise exception 'Přihlášených je víc než 128.'; end if;

    -- Zpátky otevřít (přihlášení hráči v turnaji zůstali, zrušení měnilo jen stav turnaje)
    update public.tournaments set status = 'open', size = null, rounds = null, started_on = null where id = tid;
    update public.tournament_entries set status = 'registered', place = null where tournament_id = tid;

    -- Boti do velikosti pavouka (stejně jako dev_tournament_add_bots)
    for i in 1 .. (target - real_players) loop
        uid := gen_random_uuid();
        insert into auth.users (id, email, raw_user_meta_data)
            values (uid, 'bot-' || uid || '@bots.invalid', jsonb_build_object('full_name', 'Bot ' || names[1 + (random() * (array_length(names, 1) - 1))::integer]));
        update public.profiles set avatar = '🤖', color = colors[1 + (random() * 7)::integer] where id = uid;
        insert into public.tournament_entries (tournament_id, user_id, joined_at) values (tid, uid, now() + i * interval '1 millisecond');
        added := added + 1;
    end loop;

    -- Oznámení o zrušení pryč, start hned (jako „Spustit hned“ ve vývojářském okně) a boti odehrají první kolo
    delete from public.tournament_notices where tournament_id = tid and kind = 'cancelled';
    perform public.tournament_start(tid, true);
    perform public.dev_bots_play(tid);

    raise notice 'Turnaj obnoven: % přihlášených hráčů, % botů, pavouk pro % hráčů, stav: %',
        real_players, added, target, (select status from public.tournaments where id = tid);
end;
$$;
