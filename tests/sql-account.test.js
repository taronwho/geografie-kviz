// Moje data v databázi (PostgreSQL 16): export_my_data() a delete_my_account() – export i smazání se týkají jen volajícího,
// smazání odstraní profil se všemi navázanými daty i řádek v auth.users, nepustí hráče z běžícího turnaje a nejde volat bez přihlášení.
// Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_account_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const as = (uid, sql, role = 'authenticated', day = '2026-11-09') => psql(dbName, `set mudrlant.test_today = '${day}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };

const bootstrap = `
do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, public;`;

test('SQL: export a smazání účtu', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 12 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    // Hráč 1 založil výzvu, hráč 2 ji dohrál; hráč 2 založil vlastní, kterou dohrál hráč 1
    q(`insert into challenges (id, creator_id, topic, seed, count) values ('AAAAAA', '${id(1)}', 'mix', 's1', 5), ('BBBBBB', '${id(2)}', 'mix', 's2', 5);
       insert into challenge_results (challenge_id, user_id, correct, points) values ('AAAAAA', '${id(1)}', 4, 40), ('AAAAAA', '${id(2)}', 3, 30), ('BBBBBB', '${id(2)}', 5, 50), ('BBBBBB', '${id(1)}', 2, 20)`);

    await t.test('nepřihlášený export ani smazání nevolá', () => {
        denied(as(null, `select export_my_data();`), 'bez přihlášení');
        denied(as(null, `select delete_my_account();`, 'authenticated'), 'bez přihlášení');
        denied(as(id(1), `select export_my_data();`, 'anon'), 'role anon');
        denied(as(id(1), `select delete_my_account();`, 'anon'), 'role anon');
        assert.equal(q(`select count(*) from auth.users`), '12');
    });

    await t.test('export vrací jen data volajícího', () => {
        const data = JSON.parse(last(ok(as(id(1), `select export_my_data();`))));
        assert.equal(data.ucet.email, 'u1@example.com');
        assert.equal(data.profil.id, id(1));
        assert.deepEqual(data.vyzvy_zalozene.map(row => row.id), ['AAAAAA']);
        assert.deepEqual(data.vyzvy_vysledky.map(row => row.user_id), [id(1), id(1)]);
        assert.ok(!JSON.stringify(data).includes('u2@example.com'), 'cizí e-mail v exportu není');
        assert.ok(!JSON.stringify(data).includes(id(2)) || data.rating_historie.every(row => row.user_id === id(1)), 'cizí řádky v exportu nejsou');
    });

    await t.test('export obsahuje i přátele, bloky, reakce, nahlášení, hlášení otázek a poslední aktivitu (jen vlastní)', () => {
        q(`insert into friendships (user_id, friend_id, status) values ('${id(1)}', '${id(2)}', 'pending'), ('${id(3)}', '${id(1)}', 'pending'), ('${id(4)}', '${id(5)}', 'pending');
           insert into player_blocks (blocker, blocked) values ('${id(1)}', '${id(6)}'), ('${id(7)}', '${id(1)}');
           insert into player_reports (reporter, reported, reason) values ('${id(1)}', '${id(8)}', 'jine'), ('${id(9)}', '${id(1)}', 'prezdivka');
           insert into question_reports (user_id, topic, item_id, reason) values ('${id(1)}', 'zemepis', 'Q1', 'jine'), ('${id(2)}', 'zemepis', 'Q2', 'jine');
           insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('AAAAAA', '${id(2)}', '${id(1)}', '👍');`);
        ok(as(id(1), `select touch_seen();`));
        ok(as(id(2), `select touch_seen();`));
        const data = JSON.parse(last(ok(as(id(1), `select export_my_data();`))));
        assert.ok(data.posledni_aktivita, 'poslední aktivita');
        assert.equal(data.pratele.length, 2);
        assert.ok(data.pratele.every(row => [row.user_id, row.friend_id].includes(id(1))), 'jen moje přátelství');
        assert.deepEqual(data.zablokovani_hraci.map(row => row.blocked), [id(6)], 'jen koho blokuju já (ne kdo blokuje mě)');
        assert.deepEqual(data.nahlaseni_hracu.map(row => row.reported), [id(8)], 'jen moje nahlášení (ne kdo nahlásil mě)');
        assert.deepEqual(data.hlaseni_otazek.map(row => row.item_id), ['Q1']);
        assert.deepEqual(data.reakce.map(row => row.emoji), ['👍']);
        assert.deepEqual(data.upozorneni_odbery, []);
    });

    await t.test('smazání odstraní profil, navázaná data i auth.users; cizí účty zůstanou', () => {
        assert.equal(last(ok(as(id(1), `select delete_my_account();`))), 't');
        assert.equal(q(`select count(*) from auth.users where id = '${id(1)}'`), '0');
        assert.equal(q(`select count(*) from profiles where id = '${id(1)}'`), '0');
        assert.equal(q(`select count(*) from challenge_results where user_id = '${id(1)}'`), '0');
        assert.equal(q(`select count(*) from challenges where creator_id = '${id(1)}'`), '0');
        // hráč 2 a jeho vlastní výzva zůstávají (jeho výsledek v cizí výzvě zmizel spolu s ní)
        assert.equal(q(`select count(*) from profiles where id = '${id(2)}'`), '1');
        assert.equal(q(`select count(*) from challenges where id = 'BBBBBB'`), '1');
        assert.equal(q(`select count(*) from challenge_results where challenge_id = 'BBBBBB' and user_id = '${id(2)}'`), '1');
        assert.equal(q(`select count(*) from auth.users`), '11');
        // podruhé: účet už není, volání bez účtu skončí bez chyby a nic dalšího nesmaže
        ok(as(id(1), `select delete_my_account();`));
        assert.equal(q(`select count(*) from auth.users`), '11');
    });

    await t.test('smazání nesmaže cizí účet, ani když se pokusí podvrhnout id', () => {
        // funkce nemá parametr; volání s parametrem selže
        denied(as(id(3), `select delete_my_account('${id(4)}');`));
        assert.equal(q(`select count(*) from auth.users where id = '${id(4)}'`), '1');
    });

    await t.test('hráč v běžícím turnaji účet smazat nemůže, po vypadnutí ano', () => {
        q(`select tournament_tick()`.replace('select', "set mudrlant.test_today = '2026-11-04'; select"));
        const tid = q(`select id from tournaments`);
        for (let n = 2; n <= 10; n++) ok(as(id(n), `select tournament_join('${tid}');`, 'authenticated', '2026-11-04'));
        // 9 hráčů, hraje 8, jeden přebývá; pondělí start
        ok(psql(dbName, `set mudrlant.test_today = '2026-11-09'; select tournament_tick();`));
        assert.equal(q(`select status from tournaments where id = '${tid}'`), 'running');
        const playing = q(`select user_id from tournament_entries where tournament_id = '${tid}' and status = 'playing' order by user_id limit 1`);
        const message = denied(as(playing, `select delete_my_account();`), 'v běžícím turnaji');
        assert.match(message, /hraješ turnaj/);
        assert.equal(q(`select count(*) from auth.users where id = '${playing}'`), '1');
        assert.equal(q(`select count(*) from tournament_entries where user_id = '${playing}'`), '1');
        // vyřazený z turnaje může (přihlášený hráč mimo hru: přebývající)
        const excluded = q(`select user_id from tournament_entries where tournament_id = '${tid}' and status = 'excluded' limit 1`);
        assert.equal(last(ok(as(excluded, `select delete_my_account();`))), 't');
        assert.equal(q(`select count(*) from tournament_entries where user_id = '${excluded}'`), '0');
        assert.equal(q(`select count(*) from tournament_notices where user_id = '${excluded}'`), '0');
    });

    await t.test('role bez práva na auth.users: data se smažou, profil se vrátí prázdný a funkce vrátí false', () => {
        q(`create function public.block_auth_delete() returns trigger language plpgsql as $f$ begin raise exception 'nemáš právo' using errcode = '42501'; end $f$;
           create trigger block_delete before delete on auth.users for each row execute function public.block_auth_delete();`);
        q(`insert into profiles (id, display_name, xp) values ('${id(12)}', 'Hráč 12', 500) on conflict (id) do update set xp = 500`);
        assert.equal(last(ok(as(id(12), `select delete_my_account();`))), 'f');
        assert.equal(q(`select count(*) from auth.users where id = '${id(12)}'`), '1');
        assert.equal(q(`select xp from profiles where id = '${id(12)}'`), '0');
        assert.match(q(`select display_name from profiles where id = '${id(12)}'`), /^Hráč [0-9a-f]{8}$/);
        q(`drop trigger block_delete on auth.users`);
    });
});
