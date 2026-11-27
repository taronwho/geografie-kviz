// Pořadí dne v Řazení dne a Skládačce dne (PostgreSQL 16, schéma 53): minigame_results, minigame_submit, minigame_board, minigame_friends.
// Jeden výsledek na hráče, hru a den (druhé zařízení nic nepřidá), den počítá server (Praha; po půlnoci do 1:00 ještě včerejšek), meze hodnot
// a tvar varianty, pořadí jen ve stejné variantě (vlajka / obrys), přátelé, čtení jen vlastních řádků, export_my_data a smazání účtu.
// Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_minigame_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Praha 27. 11. 2026 13:00 (zimní čas, UTC+1)
const NOON = '2026-11-27T12:00:00Z';
const as = (uid, sql, now = NOON, role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${now}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
};
const submit = (uid, game, day, value, variant, now = NOON) => as(uid, `select minigame_submit('${game}', '${day}', ${value}, '${variant}')::text;`, now);

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

const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(id);
const DAY = '2026-11-27';

test('SQL: pořadí dne v Řazení dne a Skládačce dne (minigame_*, schéma 53)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(`insert into auth.users (id, email) values ${[A, B, C, D, E].map((uid, i) => `('${uid}', 'h${i}@example.com')`).join(', ')};`);
    q([A, B, C, D, E].map((uid, i) => `update profiles set display_name = 'Hráč ${'ABCDE'[i]}' where id = '${uid}';`).join(' '));

    await t.test('verze schématu je aspoň 53', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 53);
    });

    await t.test('jeden výsledek na hráče, hru a den: druhé odeslání (jiné zařízení) vrátí uložený', () => {
        const first = json(submit(A, 'sorting', DAY, 2, 'rozloha'));
        assert.deepEqual({ value: first.value, rank: first.rank, variant: first.variant }, { value: 2, rank: 1, variant: 'rozloha' });
        const again = json(submit(A, 'sorting', DAY, 1, 'rozloha'));
        assert.equal(again.value, 2, 'první výsledek platí');
        assert.equal(q(`select count(*) from minigame_results where user_id = '${A}'`), '1');
        // Skládačka je jiná hra: vlastní řádek
        assert.equal(json(submit(A, 'puzzle', DAY, 18, 'flag:Q213')).value, 18);
        assert.equal(q(`select count(*) from minigame_results where user_id = '${A}'`), '2');
    });

    await t.test('den počítá server: jen dnešek, včerejšek jen do 1:00, budoucnost nikdy', () => {
        denied(submit(B, 'sorting', '2026-11-26', 3, 'rozloha'), /jen za dnešní den/);
        denied(submit(B, 'sorting', '2026-11-28', 3, 'rozloha'), /jen za dnešní den/);
        // 28. 11. 0:30 v Praze = 27. 11. 23:30 UTC: včerejšek ještě projde
        assert.equal(json(submit(E, 'sorting', DAY, 4, 'rozloha', '2026-11-27T23:30:00Z')).value, 4);
        // 28. 11. 1:30 v Praze: už ne
        denied(submit(E, 'puzzle', DAY, 20, 'flag:Q213', '2026-11-28T00:30:00Z'), /jen za dnešní den/);
        denied(as(B, `select minigame_submit('sorting', null, 3, 'rozloha');`), /jen za dnešní den/);
    });

    await t.test('rozumné meze a tvar varianty', () => {
        denied(submit(B, 'sorting', DAY, 0, 'rozloha'), /Neplatný výsledek/);
        denied(submit(B, 'sorting', DAY, 201, 'rozloha'), /Neplatný výsledek/);
        denied(submit(B, 'puzzle', DAY, 15, 'flag:Q213'), /Neplatný výsledek/, 'méně tahů než dílků nejde');
        denied(submit(B, 'puzzle', DAY, 2001, 'flag:Q213'), /Neplatný výsledek/);
        denied(submit(B, 'puzzle', DAY, 20, 'vlajka'), /Neplatný výsledek/);
        denied(submit(B, 'sorting', DAY, 2, 'Rozloha!'), /Neplatný výsledek/);
        denied(submit(B, 'snack', DAY, 2, 'x'), /Neznámá minihra/);
        assert.equal(q(`select count(*) from minigame_results where user_id = '${B}'`), '0');
    });

    await t.test('pořadí jen ve stejné variantě: obrys místo vlajky se jen započítá', () => {
        ok(submit(B, 'puzzle', DAY, 16, 'flag:Q213'));
        ok(submit(C, 'puzzle', DAY, 18, 'flag:Q213'));
        ok(submit(D, 'puzzle', DAY, 16, 'outline:Q213'));
        const board = json(as(A, `select minigame_board('puzzle', '${DAY}')::text;`));
        assert.equal(board.players, 3);
        assert.equal(board.other, 1);
        assert.equal(board.best, 16);
        assert.equal(board.first, 1);
        assert.equal(board.first_pct, 33);
        assert.deepEqual(board.top.map(row => [row.display_name, row.rank, row.value, row.me]), [['Hráč B', 1, 16, false], ['Hráč A', 2, 18, true], ['Hráč C', 2, 18, false]]);
        assert.equal(board.me.rank, 2);
        assert.ok(!('variant' in board.top[0]), 'cizí varianta se neposílá');
        // Hráč s obrysem vidí pořadí obrysů
        const outline = json(as(D, `select minigame_board('puzzle', '${DAY}')::text;`));
        assert.deepEqual([outline.players, outline.other, outline.me.rank], [1, 3, 1]);
        // Kdo nehrál, vidí nejčastější variantu
        const guest = json(as(E, `select minigame_board('puzzle', '${DAY}')::text;`));
        assert.deepEqual([guest.players, guest.other, guest.me], [3, 1, null]);
        // Řazení dne: napoprvé
        ok(submit(B, 'sorting', DAY, 1, 'rozloha'));
        const sorting = json(as(B, `select minigame_board('sorting', '${DAY}')::text;`));
        assert.deepEqual([sorting.players, sorting.first, sorting.first_pct, sorting.best, sorting.me.rank], [3, 1, 33, 1, 1]);
    });

    await t.test('přátelé: jen přijatá přátelství, já a přátelé ve stejné variantě', () => {
        q(`insert into friendships (user_id, friend_id) values ('${A}', '${B}'), ('${D}', '${A}'), ('${A}', '${C}');
           update friendships set status = 'accepted' where (user_id, friend_id) in (('${A}', '${B}'), ('${D}', '${A}'));`);
        const friends = json(as(A, `select minigame_friends('puzzle', '${DAY}')::text;`));
        assert.equal(friends.friends, 2);
        assert.equal(friends.other, 1, 'D skládal obrys');
        assert.deepEqual(friends.rows.map(row => [row.display_name, row.rank, row.me]), [['Hráč B', 1, false], ['Hráč A', 2, true]]);
        const alone = json(as(C, `select minigame_friends('puzzle', '${DAY}')::text;`));
        assert.deepEqual([alone.friends, alone.rows.length], [0, 1]);
    });

    await t.test('pořadí za posledních 30 dní, bez přihlášení nic, čtení jen vlastních řádků, zápis jen funkcí', () => {
        ok(as(A, `select minigame_board('sorting', '2026-10-28')::text;`));
        denied(as(A, `select minigame_board('sorting', '2026-10-27')::text;`), /posledních 30 dní/);
        denied(as(A, `select minigame_board('sorting', '2026-11-28')::text;`), /posledních 30 dní/);
        denied(as(null, `select minigame_board('sorting', null);`), /Přihlas se/);
        denied(as(null, `select minigame_submit('sorting', '${DAY}', 1, 'rozloha');`), /Přihlas se/);
        denied(as(null, `select minigame_board('sorting', null);`, NOON, 'anon'), /permission denied/);
        denied(as(null, 'select count(*) from minigame_results;', NOON, 'anon'), /permission denied/);
        assert.equal(last(ok(as(A, 'select count(*) from minigame_results;'))), '2', 'jen vlastní řádky');
        denied(as(A, `insert into minigame_results (game, day, user_id, value, variant) values ('sorting', '2026-11-25', '${A}', 1, 'rozloha');`), /permission denied/);
        denied(as(A, `update minigame_results set value = 1 where user_id = '${A}';`), /permission denied/);
        denied(as(A, `delete from minigame_results where user_id = '${A}';`), /permission denied/);
        denied(as(A, `select minigame_json(null::minigame_results);`), /permission denied/);
    });

    await t.test('export_my_data má minihry_dne, smazání účtu je smaže', () => {
        const exported = json(as(A, 'select export_my_data()::text;'));
        assert.deepEqual(exported.minihry_dne.map(row => [row.hra, row.den, row.vysledek, row.varianta]), [['puzzle', DAY, 18, 'flag:Q213'], ['sorting', DAY, 2, 'rozloha']]);
        ok(as(A, 'select delete_my_account();'));
        assert.equal(q(`select count(*) from minigame_results where user_id = '${A}'`), '0');
        assert.equal(q(`select count(*) from minigame_results where user_id = '${B}'`), '2');
    });
});
