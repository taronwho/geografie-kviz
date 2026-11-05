// Týdenní turnaje v databázi (PostgreSQL 16): přihlášky, spuštění (mocnina dvou, zpráva přebývajícím, zrušení pod 8), kola po dnech,
// kontumace a „dřívější přihlášení“, finále a zápas o 3. místo, zneužití. Čas se simuluje nastavením mudrlant.test_today.
// Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_tournament_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Jako přihlášený hráč v daný den (jedna relace, ať platí nastavení dne)
const as = (uid, day, sql) => psql(dbName, `set mudrlant.test_today = '${day}'; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };
const tick = (day) => ok(psql(dbName, `set mudrlant.test_today = '${day}'; select tournament_tick();`));

const bootstrap = `
do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, public;`;

// Středa; turnaj začíná v pondělí 9. 11., kola po dnech: 9., 10., 11. (osm hráčů = čtvrtfinále, semifinále, finále)
const WED = '2026-11-04';
const MON = '2026-11-09';
const TUE = '2026-11-10';
const WED2 = '2026-11-11';
const THU = '2026-11-12';

test('SQL: týdenní turnaje', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    ok(psql(dbName, '', path.join(__dirname, '..', 'supabase', 'schema.sql')));
    q(Array.from({ length: 12 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    let tid;
    await t.test('tick založí otevřený turnaj na příští pondělí a přihlášky jdou, jen jednou', () => {
        tick(WED);
        assert.equal(q(`select count(*) from tournaments`), '1');
        assert.equal(q(`select status || ' ' || week_start from tournaments`), 'open 2026-11-09');
        tick(WED);
        assert.equal(q(`select count(*) from tournaments`), '1', 'druhý tick nezaloží další');
        tid = q(`select id from tournaments`);
        // přihlásí se 10 hráčů v pořadí 1..10 (rozdílné časy přihlášení)
        for (let n = 1; n <= 10; n++) {
            ok(as(id(n), WED, `select tournament_join('${tid}');`));
            q(`update tournament_entries set joined_at = '2026-11-0${n < 10 ? n : 1}T10:00:00Z'::timestamptz + interval '${n} minutes' where tournament_id = '${tid}' and user_id = '${id(n)}'`);
        }
        ok(as(id(1), WED, `select tournament_join('${tid}');`)); // podruhé nic nevadí
        assert.equal(q(`select count(*) from tournament_entries`), '10');
        // odhlášení a návrat
        ok(as(id(10), WED, `select tournament_leave('${tid}');`));
        assert.equal(q(`select count(*) from tournament_entries`), '9');
        ok(as(id(10), WED, `select tournament_join('${tid}');`));
        q(`update tournament_entries set joined_at = '2026-11-03T12:00:00Z' where tournament_id = '${tid}' and user_id = '${id(10)}'`);
    });

    await t.test('pondělí: hraje 8 nejdřív přihlášených, ostatní dostanou zprávu, vznikne první kolo', () => {
        tick(MON);
        assert.equal(q(`select status || ' ' || size || ' ' || rounds from tournaments`), 'running 8 3');
        assert.equal(q(`select count(*) from tournament_entries where status = 'playing'`), '8');
        // přebývající jsou ti, kdo se přihlásili poslední (hráč 10 až 2 minuty po hráči 1 v den 3. 11., tj. 10 měl čas 3. 11. 12:00, takže je mezi prvními)
        const excluded = q(`select string_agg(right(user_id::text, 2), ',' order by user_id) from tournament_entries where status = 'excluded'`);
        assert.equal(excluded.split(',').length, 2);
        assert.equal(q(`select count(*) from tournament_notices where kind = 'excluded_full' and detail = '8'`), '2');
        assert.equal(q(`select count(*) from tournament_matches where round = 1`), '4');
        // otevřely se přihlášky na další týden
        assert.equal(q(`select count(*) from tournaments where status = 'open' and week_start = '2026-11-16'`), '1');
        // přihlásit se do už spuštěného turnaje nejde
        denied(as(id(11), MON, `select tournament_join('${tid}');`));
    });

    let matches;
    await t.test('zápas jde začít jen účastníkovi, jen v den kola a jen jednou; soupeřův výsledek není vidět', () => {
        matches = q(`select id || '|' || p1 || '|' || p2 from tournament_matches where round = 1 order by slot`).split('\n').map(line => line.split('|'));
        const [mid, p1, p2] = matches[0];
        const outsider = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(id).find(u => u !== p1 && u !== p2);
        denied(as(outsider, MON, `select tournament_start_match('${mid}');`), 'cizí zápas');
        denied(as(p1, TUE, `select tournament_start_match('${mid}');`), 'jiný den');
        ok(as(p1, MON, `select tournament_start_match('${mid}');`));
        denied(as(p1, MON, `select tournament_start_match('${mid}');`), 'podruhé');
        ok(as(p1, MON, `select tournament_finish_match('${mid}', 7, 20);`));
        denied(as(p1, MON, `select tournament_finish_match('${mid}', 10, 40);`), 'výsledek jen jednou');
        // soupeř vidí, že hráč 1 odehrál? Ne: výsledek je skrytý do rozhodnutí
        assert.equal(as(p2, MON, `select count(*) from tournament_results where user_id = '${p1}';`).stdout.trim().split('\n').pop(), '0');
        assert.equal(q(`select winner is null from tournament_matches where id = '${mid}'`), 't');
    });

    await t.test('1. kolo: oba odehrají (rozhodne výsledek), jeden odehraje (kontumace), nikdo (dřívější přihlášení)', () => {
        const [m1, m2, m3, m4] = matches;
        // m1: p2 odehraje hůř než p1 -> vyhrává p1 (7 správně)
        ok(as(m1[2], MON, `select tournament_start_match('${m1[0]}'); select tournament_finish_match('${m1[0]}', 5, 15);`));
        assert.equal(q(`select winner = '${m1[1]}' from tournament_matches where id = '${m1[0]}'`), 't');
        assert.equal(q(`select decided_by from tournament_matches where id = '${m1[0]}'`), 'played');
        // m2: oba stejně správně i body -> rozhoduje čas; hráč b zahájí a skončí hned, hráč a čeká -> b je rychlejší
        ok(as(m2[1], MON, `select tournament_start_match('${m2[0]}');`));
        q(`update tournament_results set started_at = now() - interval '50 seconds' where match_id = '${m2[0]}' and user_id = '${m2[1]}'`);
        ok(as(m2[2], MON, `select tournament_start_match('${m2[0]}'); select tournament_finish_match('${m2[0]}', 8, 24);`));
        ok(as(m2[1], MON, `select tournament_finish_match('${m2[0]}', 8, 24);`));
        assert.equal(q(`select winner = '${m2[2]}' from tournament_matches where id = '${m2[0]}'`), 't', 'rychlejší čas vyhrává');
        // m3: odehraje jen p1; m4: neodehraje nikdo
        ok(as(m3[1], MON, `select tournament_start_match('${m3[0]}'); select tournament_finish_match('${m3[0]}', 3, 9);`));
        assert.equal(q(`select winner is null from tournament_matches where id = '${m3[0]}'`), 't', 'do konce dne se čeká');
        tick(MON);
        assert.equal(q(`select count(*) from tournament_matches where round = 2`), '0', 'další kolo vznikne až po termínu');
        tick(TUE);
        assert.equal(q(`select (winner = '${m3[1]}')::text || ' ' || decided_by from tournament_matches where id = '${m3[0]}'`), 'true walkover');
        const earlier = q(`select decided_by || ' ' || (winner = (select user_id from tournament_entries e where e.tournament_id = '${tid}' and e.user_id in ('${m4[1]}', '${m4[2]}') order by joined_at limit 1))::text from tournament_matches where id = '${m4[0]}'`);
        assert.equal(earlier, 'earlier true', 'bez hry postupuje dřívější přihlášený');
        // poražení z kontumace dostali zprávu o vyřazení
        assert.equal(q(`select count(*) from tournament_notices where kind = 'eliminated_noplay'`), '2');
        // vzniklo semifinále se dvěma zápasy a poražení z 1. kola mají místo 5
        assert.equal(q(`select count(*) from tournament_matches where round = 2 and not third`), '2');
        assert.equal(q(`select count(distinct place) || ' ' || min(place) from tournament_entries where status = 'out'`), '1 5');
    });

    await t.test('semifinále: jeden zápas odehrají oba, druhý nikdo; další den finále a zápas o 3. místo', () => {
        const semi = q(`select id || '|' || p1 || '|' || p2 from tournament_matches where round = 2 order by slot`).split('\n').map(line => line.split('|'));
        ok(as(semi[0][1], TUE, `select tournament_start_match('${semi[0][0]}'); select tournament_finish_match('${semi[0][0]}', 9, 30);`));
        ok(as(semi[0][2], TUE, `select tournament_start_match('${semi[0][0]}'); select tournament_finish_match('${semi[0][0]}', 4, 12);`));
        tick(WED2);
        assert.equal(q(`select count(*) from tournament_matches where round = 3`), '2');
        assert.equal(q(`select count(*) from tournament_matches where round = 3 and third`), '1');
        const fin = q(`select id || '|' || p1 || '|' || p2 || '|' || third from tournament_matches where round = 3 order by third`).split('\n').map(line => line.split('|'));
        // finále: p1 vyhraje; o třetí místo: nikdo neodehraje
        ok(as(fin[0][1], WED2, `select tournament_start_match('${fin[0][0]}'); select tournament_finish_match('${fin[0][0]}', 10, 40);`));
        ok(as(fin[0][2], WED2, `select tournament_start_match('${fin[0][0]}'); select tournament_finish_match('${fin[0][0]}', 6, 20);`));
        assert.equal(q(`select status from tournaments where id = '${tid}'`), 'running', 'zápas o 3. místo ještě čeká do konce dne');
        tick(THU);
        assert.equal(q(`select status from tournaments where id = '${tid}'`), 'finished');
        assert.equal(q(`select place from tournament_entries where tournament_id = '${tid}' and user_id = '${fin[0][1]}'`), '1');
        assert.equal(q(`select place from tournament_entries where tournament_id = '${tid}' and user_id = '${fin[0][2]}'`), '2');
        assert.equal(q(`select string_agg(place::text, ',' order by place) from tournament_entries where tournament_id = '${tid}' and place is not null`), '1,2,3,4,5,5,5,5');
        assert.equal(q(`select count(*) from tournament_notices where kind = 'result'`), '8');
    });

    await t.test('moje turnajové údaje do odznaků', () => {
        const winner = q(`select user_id from tournament_entries where place = 1`);
        assert.equal(as(winner, THU, `select best || ',' || played from my_tournament_stats();`).stdout.trim().split('\n').pop(), '6,1');
        const wins = Number(as(winner, THU, `select wins from my_tournament_stats();`).stdout.trim().split('\n').pop());
        assert.ok(wins >= 3, `vítěz vyhrál aspoň 3 zápasy (${wins})`);
        const excluded = q(`select user_id from tournament_entries where status = 'excluded' limit 1`);
        assert.equal(as(excluded, THU, `select best || ',' || played from my_tournament_stats();`).stdout.trim().split('\n').pop(), '0,0');
    });

    await t.test('zprávy vidí jen vlastník a jdou označit jako přečtené', () => {
        const winner = q(`select user_id from tournament_entries where place = 1`);
        const own = Number(as(winner, THU, `select count(*) from tournament_notices;`).stdout.trim().split('\n').pop());
        assert.ok(own >= 1);
        assert.equal(as(winner, THU, `select count(*) from tournament_notices where user_id <> '${winner}';`).stdout.trim().split('\n').pop(), '0');
        ok(as(winner, THU, `select tournament_notices_seen(array(select id from tournament_notices));`));
        assert.equal(q(`select count(*) from tournament_notices where user_id = '${winner}' and not seen`), '0');
    });

    await t.test('zneužití: přímé zápisy do tabulek turnaje a volání interních funkcí jsou zakázané', () => {
        denied(as(id(1), THU, `insert into tournaments (week_start) values ('2030-01-01');`));
        denied(as(id(1), THU, `update tournament_matches set winner = '${id(1)}';`));
        denied(as(id(1), THU, `insert into tournament_entries (tournament_id, user_id) values ('${tid}', '${id(1)}');`));
        denied(as(id(1), THU, `insert into tournament_results (match_id, user_id, correct) select id, '${id(1)}', 10 from tournament_matches limit 1;`));
        denied(as(id(1), THU, `select tournament_start('${tid}');`));
        denied(as(id(1), THU, `select tournament_progress('${tid}');`));
        denied(as(id(1), THU, `select tournament_pick_winner(m, true) from tournament_matches m limit 1;`));
        denied(psql(dbName, `set role anon; select tournament_tick();`));
    });

    await t.test('pod 8 přihlášených se turnaj zruší a hráči dostanou zprávu', () => {
        const next = q(`select id from tournaments where status = 'open'`);
        for (let n = 1; n <= 5; n++) ok(as(id(n), THU, `select tournament_join('${next}');`));
        tick('2026-11-16');
        assert.equal(q(`select status from tournaments where id = '${next}'`), 'cancelled');
        assert.equal(q(`select count(*) from tournament_notices where kind = 'cancelled' and tournament_id = '${next}'`), '5');
    });

    await t.test('plný turnaj má nejvýš 128 míst a 128 hráčů dá 7 kol', () => {
        const week = q(`select id from tournaments where status = 'open'`);
        // stovky hráčů bez auth.users: přímo profily
        q(`insert into auth.users (id, email, raw_user_meta_data) select ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'b' || g || '@example.com', '{}'::jsonb from generate_series(1, 130) g`);
        q(`insert into tournament_entries (tournament_id, user_id, joined_at) select '${week}', ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, now() + g * interval '1 second' from generate_series(1, 128) g`);
        denied(as(id(1), '2026-11-17', `select tournament_join('${week}');`), 'plno');
        tick('2026-11-23');
        assert.equal(q(`select size || ' ' || rounds from tournaments where id = '${week}'`), '128 7');
        assert.equal(q(`select count(*) from tournament_matches where tournament_id = '${week}' and round = 1`), '64');
    });
});
