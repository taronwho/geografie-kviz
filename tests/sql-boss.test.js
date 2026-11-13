// Boss týdne v databázi (PostgreSQL, schéma 21): jeden řádek na hráče a týden (pondělí v pražském čase), nejvýš 3 pokusy, nejlepší poškození
// a výhra (jen s plnými 700), opakované odeslání téhož pokusu nic nezmění, souboj dohraný těsně po půlnoci z neděle na pondělí se přijme
// ještě 30 minut, společná lišta (hráči, výhry, procenta, splněná polovina) a společný bonus 50 XP jen za skončený týden a jen jednou,
// pravidla řádků a oprávnění (hráč nezapíše nic přímo, cizí řádky nevidí, anon nic), emblémy v katalogu odznaků, export a smazání účtu.
// Spouští se jen s psql a serverem (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Boss = require('../boss.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_boss_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const WEEK = '2026-11-09';
// Čtvrtek 12. 11. 2026 ve 13:00 pražského času (UTC+1)
const NOW = '2026-11-12T12:00:00Z';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const as = (uid, sql, now = NOW, role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${now}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const submit = (uid, idx, damage, defeated, now = NOW, week = WEEK) => as(uid, `select boss_submit('${week}', ${idx}, ${damage}, ${defeated});`, now);
const stats = (uid, now = NOW, week = null) => json(as(uid, `select boss_week_stats(${week ? `'${week}'` : 'null'});`, now));

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

test('SQL: Boss týdne', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    // Schéma jde spustit opakovaně (idempotentní migrace)
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 5 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    await t.test('tabulka s pravidly řádků, emblémy bossů v katalogu odznaků, týden = pondělí v Praze', () => {
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.boss_results'::regclass`), 't');
        assert.equal(q(`select count(*) from unnest(badge_catalog()) b where b like 'boss-%'`), String(Boss.BOSSES.length));
        for (const boss of Boss.BOSSES) assert.equal(q(`select '${Boss.badgeId(boss.id)}' = any (badge_catalog())`), 't', boss.id);
        // Stejný týden jako boss.js weekOf: neděle 23:59 ještě starý, pondělí 0:00 nový (i v letním čase)
        for (const iso of ['2026-11-15T22:59:00Z', '2026-11-15T23:00:00Z', '2026-03-29T21:30:00Z', '2026-03-29T22:30:00Z', '2027-01-01T10:00:00Z']) {
            assert.equal(q(`select boss_week('${iso}'::timestamptz)`), Boss.weekOf(new Date(iso).getTime()), iso);
        }
    });

    await t.test('anon nic; hráč nezapíše přímo do tabulky a pomocné funkce nevolá', () => {
        for (const sql of [`select boss_submit('${WEEK}', 0, 100, false);`, 'select boss_week_stats();', `select boss_claim_bonus('2026-11-02');`, 'select * from boss_results;']) {
            denied(as(null, sql, NOW, 'anon'), null, `anon: ${sql}`);
        }
        denied(as(A, `insert into boss_results (user_id, week, best_damage, defeated, attempts) values ('${A}', '${WEEK}', 700, true, 1);`), /permission denied/);
        denied(as(A, 'update boss_results set best_damage = 700;'), /permission denied/);
        denied(as(A, 'delete from boss_results;'), /permission denied/);
        for (const sql of ['select boss_now();', `select boss_week(now());`]) denied(as(A, sql), /permission denied/, sql);
        denied(as(null, 'select boss_week_stats();'), /Přihlas se/);
        denied(as(null, `select boss_submit('${WEEK}', 0, 1, false);`), /Přihlas se/);
    });

    await t.test('odeslání souboje: kontrola rozsahu a týdne, nejlepší poškození, výhra zůstane, nejvýš 3 pokusy', () => {
        // Neplatné výsledky
        denied(submit(A, 0, -1, false), /Neplatný výsledek/);
        denied(submit(A, 0, 701, false), /Neplatný výsledek/);
        denied(submit(A, 0, 700, false), /Neplatný výsledek/, 'plných 700 je výhra');
        denied(submit(A, 0, 650, true), /Neplatný výsledek/, 'výhra jen s 700');
        denied(submit(A, 3, 100, false), /Neplatný výsledek/, 'nejvýš 3 pokusy (idx 0–2)');
        // Jiný než běžící týden
        denied(submit(A, 0, 100, false, NOW, '2026-11-02'), /Tenhle boss už odešel/);
        denied(submit(A, 0, 100, false, NOW, '2026-11-16'), /Tenhle boss už odešel/);
        denied(submit(A, 0, 100, false, NOW, '2026-11-10'), /Tenhle boss už odešel/, 'týden začíná pondělím');
        // První pokus
        let me = json(submit(A, 0, 430, false));
        assert.deepEqual(me, { week: WEEK, attempts: 1, best_damage: 430, defeated: false, bonus_claimed: false, first_win: false });
        // Opakované odeslání téhož pokusu (ztracená odpověď) nic nezmění
        me = json(submit(A, 0, 430, false));
        assert.equal(me.attempts, 1);
        // Druhý pokus horší: nejlepší zůstane
        me = json(submit(A, 1, 200, false));
        assert.deepEqual([me.attempts, me.best_damage, me.defeated], [2, 430, false]);
        // Třetí pokus výhra
        me = json(submit(A, 2, 700, true));
        assert.deepEqual([me.attempts, me.best_damage, me.defeated, me.first_win], [3, 700, true, true]);
        // Čtvrtý pokus nejde
        denied(submit(A, 3, 100, false), /Neplatný výsledek/);
        assert.equal(json(submit(A, 2, 700, true)).first_win, false, 'opakované odeslání výhry ji nezapočítá podruhé');
        assert.equal(q(`select attempts || ',' || best_damage || ',' || defeated from boss_results where user_id = '${A}'`), '3,700,true');
        // Hráč B: tři prohry, pak už se nic nezapíše (další odeslání je jen opakování uloženého pokusu)
        for (let idx = 0; idx < 3; idx++) ok(submit(B, idx, 100 * (idx + 1), false));
        me = json(submit(B, 2, 650, false));
        assert.deepEqual([me.attempts, me.best_damage], [3, 300]);
        // Výhra zůstane i po horším pokusu
        ok(submit(C, 0, 700, true));
        me = json(submit(C, 1, 120, false));
        assert.deepEqual([me.best_damage, me.defeated, me.first_win], [700, true, false]);
        // Pokus nesmí přeskočit (idx větší než uložené pokusy se bere jako další)
        me = json(submit(D, 1, 90, false));
        assert.equal(me.attempts, 1);
    });

    await t.test('souboj dohraný po půlnoci z neděle na pondělí: minulý týden se přijme ještě 30 minut', () => {
        // Pondělí 16. 11. 0:20 v Praze (23:20 UTC v neděli)
        ok(submit(E, 0, 300, false, '2026-11-15T23:20:00Z', WEEK));
        // 0:40 už ne
        denied(submit(E, 1, 300, false, '2026-11-15T23:40:00Z', WEEK), /Tenhle boss už odešel/);
        // nový týden jde hned
        ok(submit(E, 0, 50, false, '2026-11-15T23:40:00Z', '2026-11-16'));
        q(`delete from boss_results where user_id = '${E}'`);
    });

    await t.test('společná lišta: hráči, kteří to zkusili, výhry, procenta, polovina a můj stav', () => {
        // A vyhrál, B prohrál (3 pokusy), C vyhrál, D prohrál (1 pokus)
        const s = stats(A);
        assert.deepEqual({ ...s, me: undefined }, { week: WEEK, players: 4, defeated: 2, defeated_pct: 50, reached: true, over: false, me: undefined });
        assert.deepEqual(s.me, { week: WEEK, attempts: 3, best_damage: 700, defeated: true, bonus_claimed: false });
        assert.equal(stats(E).me, null, 'hráč, který nehrál, nemá řádek');
        // Minulý týden (bez hráčů) a jen 12 týdnů zpět
        assert.deepEqual(stats(A, NOW, '2026-11-02'), { week: '2026-11-02', players: 0, defeated: 0, defeated_pct: 0, reached: false, over: true, me: null });
        denied(as(A, `select boss_week_stats('2026-08-03');`), /posledních 12 týdnů/);
        denied(as(A, `select boss_week_stats('2026-11-16');`), /posledních 12 týdnů/);
        denied(as(A, `select boss_week_stats('2026-11-10');`), /posledních 12 týdnů/);
        // Cizí řádky přímo nevidí
        assert.equal(last(ok(as(B, 'select count(*) from boss_results;'))), '1');
    });

    await t.test('společný bonus: jen za skončený týden, jen hráčům, kteří to zkusili, jen jednou a jen při aspoň polovině výher', () => {
        denied(as(A, `select boss_claim_bonus('${WEEK}');`), /skončený týden/, 'běžící týden ne');
        // Příští týden v pondělí 0:10 ještě ne (30 minut se přijímají souboje), v 1:00 už ano
        denied(as(A, `select boss_claim_bonus('${WEEK}');`, '2026-11-15T23:10:00Z'), /skončený týden/);
        const later = '2026-11-16T09:00:00Z';
        assert.deepEqual(json(as(A, `select boss_claim_bonus('${WEEK}');`, later)), { week: WEEK, played: true, reached: true, claimed: true, xp: 50 });
        assert.equal(json(as(A, `select boss_claim_bonus('${WEEK}');`, later)).xp, 0, 'podruhé nic');
        assert.equal(json(as(B, `select boss_claim_bonus('${WEEK}');`, later)).xp, 50, 'i hráč, který prohrál');
        assert.deepEqual(json(as(E, `select boss_claim_bonus('${WEEK}');`, later)), { week: WEEK, played: false, reached: true, claimed: false, xp: 0 }, 'kdo nehrál, nic');
        assert.equal(q(`select bonus_claimed from boss_results where user_id = '${A}'`), 't');
        assert.equal(stats(A, later, WEEK).me.bonus_claimed, true);
        assert.equal(stats(A, later, WEEK).over, true);
        // Týden, kdy polovina nevyhrála: bonus ne
        const nextWeek = '2026-11-16';
        ok(submit(A, 0, 700, true, later, nextWeek));
        ok(submit(B, 0, 100, false, later, nextWeek));
        ok(submit(C, 0, 200, false, later, nextWeek));
        const after = '2026-11-23T09:00:00Z';
        assert.deepEqual(json(as(A, `select boss_claim_bonus('${nextWeek}');`, after)), { week: nextWeek, played: true, reached: false, claimed: false, xp: 0 });
        denied(as(A, `select boss_claim_bonus('2026-08-03');`, after), /nejvýš 12 týdnů/);
        denied(as(A, `select boss_claim_bonus('2026-11-17');`, after), /skončený týden/);
    });

    await t.test('limit volání a kontrola hodnot v tabulce', () => {
        q(`update boss_results set calls = 30 where user_id = '${D}' and week = '${WEEK}'`);
        denied(submit(D, 0, 90, false), /Příliš mnoho pokusů/);
        denied(psql(dbName, `insert into boss_results (user_id, week, best_damage, defeated, attempts) values ('${E}', '2026-11-10', 10, false, 1);`), /boss_results_values/, 'týden je pondělí');
        denied(psql(dbName, `insert into boss_results (user_id, week, best_damage, defeated, attempts) values ('${E}', '${WEEK}', 700, false, 1);`), /boss_results_values/, 'výhra = 700');
        denied(psql(dbName, `insert into boss_results (user_id, week, best_damage, defeated, attempts) values ('${E}', '${WEEK}', 10, false, 4);`), /boss_results_values/, 'nejvýš 3 pokusy');
    });

    await t.test('export dat a smazání účtu', () => {
        const data = json(as(A, 'select export_my_data();'));
        assert.deepEqual(data.boss_tydne.map(row => [row.week, row.best_damage, row.defeated, row.attempts]), [[WEEK, 700, true, 3], ['2026-11-16', 700, true, 1]]);
        assert.ok(data.boss_tydne.every(row => row.user_id === A));
        ok(as(C, 'select delete_my_account();'));
        assert.equal(q(`select count(*) from boss_results where user_id = '${C}'`), '0');
        assert.equal(q(`select count(*) from boss_results where user_id = '${A}'`), '2');
    });
});
