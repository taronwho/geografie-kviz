// Zamrzlé otázky (PostgreSQL 16, schéma 17): question_snapshot_claim uloží otázku výzvy, zápasu turnaje a Kvízu dne při prvním sestavení a vrací
// vždy tu první (další hráči dostanou stejnou, i když se jim mezitím změnila data); question_snapshots_get je vrátí k semínkům. Neplatná semínka,
// budoucí dny Kvízu dne, cizí výzvy a turnaje, příliš velká data a anon neprojdou. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_snapshots_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const as = (uid, sql, day = MON, role = 'authenticated') => psql(dbName, `set mudrlant.test_today = '${day}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const sqlText = (text) => `'${String(text).replace(/'/g, "''")}'`;
const question = (title, choices = ['Praha', 'Brno', 'Ostrava', 'Plzeň']) => ({ topic: 'zemepis', id: 'Q1', title, question: { type: 'name', title, choices: choices.map((label, i) => ({ label, correct: i === 0 })) }, hints: [] });
const claim = (uid, seed, data, day = MON, role = 'authenticated') => as(uid, `select question_snapshot_claim(${sqlText(seed)}, ${sqlText(JSON.stringify(data))}::jsonb);`, day, role);
const claimed = (r) => JSON.parse(last(ok(r)));
const getRows = (uid, seeds, role = 'authenticated') => as(uid, `select seed || '|' || (data->>'title') from question_snapshots_get(array[${seeds.map(sqlText).join(',')}]::text[]) order by seed;`, MON, role);

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

const WED = '2026-11-04';
const MON = '2026-11-09';
const A = id(1);
const B = id(2);
const C = id(3);

test('SQL: zamrzlé otázky (první zápis platí)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 10 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    // A vyzývá B (5 otázek); otevřená výzva A pro kohokoli (3 otázky)
    q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('PRIVAT', '${A}', '${B}', 'zemepis', 'vyzva-PRIVAT-abc123', 5);
       insert into challenges (id, creator_id, topic, seed, count) values ('OTEVRE', '${A}', 'zemepis', 'vyzva-OTEVRE-abc123', 3);`);

    await t.test('verze schématu 17', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 17);
    });

    await t.test('výzva: první zápis platí, druhý hráč dostane první verzi', () => {
        const first = claimed(claim(A, 'vyzva-PRIVAT-abc123:0', question('Hlavní město?')));
        assert.equal(first.title, 'Hlavní město?');
        // B má jiná data (jiná otázka ze stejného semínka): dostane verzi A
        const second = claimed(claim(B, 'vyzva-PRIVAT-abc123:0', question('Moment setrvačnosti', ['Moment setrvačnosti', 'Síla', 'Práce', 'Výkon'])));
        assert.deepEqual(second, first, 'druhý zápis vrací první verzi celou');
        assert.deepEqual(second.question.choices.map(c => c.label), ['Praha', 'Brno', 'Ostrava', 'Plzeň']);
        assert.equal(q(`select count(*) || '|' || bool_and(created_by = '${A}')::text from question_snapshots where seed = 'vyzva-PRIVAT-abc123:0'`), '1|true');
        // A znovu (obnova stránky) také první verze
        assert.equal(claimed(claim(A, 'vyzva-PRIVAT-abc123:0', question('Jiná'))).title, 'Hlavní město?');
        // načtení k semínkům: jen ta, která jsou uložená, v libovolném počtu
        ok(claim(B, 'vyzva-PRIVAT-abc123:1', question('Druhá')));
        assert.deepEqual(ok(getRows(C, ['vyzva-PRIVAT-abc123:0', 'vyzva-PRIVAT-abc123:1', 'vyzva-PRIVAT-abc123:4'])).stdout.trim().split('\n').filter(line => line.includes('|')), ['vyzva-PRIVAT-abc123:0|Hlavní město?', 'vyzva-PRIVAT-abc123:1|Druhá'], 'jen uložená semínka');
        assert.equal(last(ok(as(C, `select count(*) from question_snapshots_get('{}'::text[]);`))), '0', 'prázdný seznam');
    });

    await t.test('výzva: jen hráč, který ji smí hrát, jen otázky v rozsahu a jen nejstarší výzva se semínkem', () => {
        denied(claim(C, 'vyzva-PRIVAT-abc123:2', question('Cizí')), /uložit nejde/, 'výzva určená jinému');
        denied(claim(B, 'vyzva-PRIVAT-abc123:5', question('Mimo')), /uložit nejde/, 'pořadí za počtem otázek');
        denied(claim(A, 'vyzva-NENIII-abc123:0', question('Neexistuje')), /uložit nejde/, 'neexistující výzva');
        // otevřená výzva: kdokoli přihlášený
        assert.equal(claimed(claim(C, 'vyzva-OTEVRE-abc123:2', question('Otevřená'))).title, 'Otevřená');
        // C založí vlastní výzvu se zkopírovaným semínkem cizí výzvy: semínko dál patří té starší (C ho nepřevezme)
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count, created_at) values ('KOPIEE', '${C}', '${A}', 'zemepis', 'vyzva-PRIVAT-abc123', 5, now() + interval '1 minute')`);
        denied(claim(C, 'vyzva-PRIVAT-abc123:3', question('Podvržená')), /uložit nejde/, 'kopie semínka neotevře cizí výzvu');
        assert.equal(q(`select count(*) from question_snapshots where seed = 'vyzva-PRIVAT-abc123:3'`), '0');
    });

    await t.test('neplatná semínka a data neprojdou', () => {
        denied(claim(A, 'x'.repeat(201), question('Dlouhé')), /Neplatné semínko/, 'semínko delší než 200 znaků');
        denied(claim(A, "vyzva-PRIVAT-abc123:0' or 1=1 --", question('Injekce')), /Neplatné semínko/);
        denied(claim(A, '', question('Prázdné')), /Neplatné semínko/);
        denied(as(A, `select question_snapshot_claim('vyzva-PRIVAT-abc123:4', '[1,2]'::jsonb);`), /Neplatná otázka/, 'pole místo objektu');
        denied(as(A, `select question_snapshot_claim('vyzva-PRIVAT-abc123:4', '"text"'::jsonb);`), /Neplatná otázka/, 'text místo objektu');
        denied(as(A, `select question_snapshot_claim('vyzva-PRIVAT-abc123:4', null);`), /Neplatná otázka/);
        // (velká data se skládají až v databázi: tak dlouhý argument psql nepřijme)
        denied(as(A, `select question_snapshot_claim('vyzva-PRIVAT-abc123:4', jsonb_build_object('topic', 'zemepis', 'description', repeat('x', 150001)));`), /příliš velká/, 'víc než 150 000 bajtů');
        assert.equal(claimed(as(A, `select question_snapshot_claim('vyzva-PRIVAT-abc123:3', jsonb_build_object('title', 'Skoro velká', 'description', repeat('x', 140000)));`)).title, 'Skoro velká', 'pod limitem projde');
        assert.equal(q(`select count(*) from question_snapshots where seed = 'vyzva-PRIVAT-abc123:4'`), '0');
        denied(claim(A, 'nesmysl', question('Bez formátu')), /uložit nejde/);
    });

    await t.test('bez přihlášení a přímý zápis do tabulky nejdou', () => {
        denied(claim(null, 'vyzva-OTEVRE-abc123:0', question('Bez účtu')), /Přihlas se/);
        denied(claim(A, 'vyzva-OTEVRE-abc123:0', question('Anon'), MON, 'anon'), /permission denied/, 'role anon nesmí volat');
        denied(getRows(A, ['vyzva-PRIVAT-abc123:0'], 'anon'), /permission denied/, 'role anon nečte');
        denied(as(null, `select * from question_snapshots_get(array['vyzva-PRIVAT-abc123:0']);`), /Přihlas se/);
        denied(as(A, `select * from question_snapshots;`, MON, 'anon'), /permission denied/, 'anon tabulku nečte');
        denied(as(A, `insert into question_snapshots (seed, data) values ('vyzva-OTEVRE-abc123:1', '{}'::jsonb);`), /permission denied/, 'přímý zápis');
        denied(as(A, `update question_snapshots set data = '{"title": "Podvod"}'::jsonb;`), /permission denied/, 'přepis');
        denied(as(A, `delete from question_snapshots;`), /permission denied/, 'mazání');
        assert.equal(last(ok(as(C, `select data->>'title' from question_snapshots where seed = 'vyzva-PRIVAT-abc123:0';`))), 'Hlavní město?', 'přihlášený čte');
    });

    await t.test('Kvíz dne: jen dnešek a včerejšek (pražský čas), budoucí den ne', () => {
        assert.equal(claimed(claim(A, 'mudrlant-kviz-dne-2026-11-09:otazka:0', question('Dnešní'))).title, 'Dnešní');
        assert.equal(claimed(claim(B, 'mudrlant-kviz-dne-2026-11-09:otazka:0', question('Jiná dnešní'))).title, 'Dnešní', 'druhý hráč dostane první verzi');
        assert.equal(claimed(claim(B, 'mudrlant-kviz-dne-2026-11-08:otazka:9', question('Včerejší'))).title, 'Včerejší', 'včerejšek (pokus přes půlnoc)');
        denied(claim(A, 'mudrlant-kviz-dne-2026-11-10:otazka:0', question('Zítřejší')), /jen za dnešek/, 'zítřek nejde připravit dopředu');
        denied(claim(A, 'mudrlant-kviz-dne-2026-11-30:otazka:3', question('Budoucí')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-kviz-dne-2026-11-01:otazka:3', question('Stará')), /jen za dnešek/, 'starší den');
        denied(claim(A, 'mudrlant-kviz-dne-2026-13-45:otazka:3', question('Nesmysl')), /jen za dnešek/, 'neplatné datum');
        denied(claim(A, 'mudrlant-kviz-dne-2026-11-09:otazka:10', question('Jedenáctá')), /uložit nejde/, 'jen otázky 0–9');
        // uložená otázka minulého dne se dál vrací (rozpis), jen nová se nezapíše
        assert.equal(claimed(claim(C, 'mudrlant-kviz-dne-2026-11-08:otazka:9', question('Jiná'), '2026-11-20')).title, 'Včerejší');
        assert.equal(q(`select count(*) from question_snapshots where seed like 'mudrlant-kviz-dne-%'`), '2');
    });

    await t.test('zápas turnaje: jen hráč zápasu v daném kole existujícího turnaje', () => {
        ok(psql(dbName, `set mudrlant.test_today = '${WED}'; select tournament_tick();`));
        const tid = q(`select id from tournaments where status = 'open'`);
        for (let n = 1; n <= 8; n++) ok(as(id(n), `select tournament_join('${tid}');`, WED));
        ok(psql(dbName, `set mudrlant.test_today = '${MON}'; select tournament_tick();`));
        const seed = q(`select seed from tournaments where id = '${tid}'`);
        const [p1, p2] = q(`select p1 || '|' || p2 from tournament_matches where tournament_id = '${tid}' and round = 1 order by slot limit 1`).split('|');
        assert.equal(claimed(claim(p1, `${seed}-r1:0`, question('Turnajová'))).title, 'Turnajová');
        assert.equal(claimed(claim(p2, `${seed}-r1:0`, question('Jiná turnajová'))).title, 'Turnajová', 'soupeř dostane stejnou');
        denied(claim(id(9), `${seed}-r1:1`, question('Nehraje')), /uložit nejde/, 'hráč mimo turnaj');
        denied(claim(p1, `${seed}-r2:0`, question('Další kolo')), /uložit nejde/, 'kolo, ve kterém zápas nemá');
        denied(claim(p1, `neznamy-turnaj-r1:0`, question('Jiný turnaj')), /uložit nejde/, 'neexistující turnaj');
    });

    await t.test('nejvýš 400 nových otázek za hodinu od jednoho hráče; export dat je obsahuje', () => {
        q(`insert into question_snapshots (seed, data, created_by) select 'plnidlo-' || g, '{}'::jsonb, '${C}' from generate_series(1, 400) g`);
        denied(claim(C, 'vyzva-OTEVRE-abc123:1', question('Moc')), /Příliš mnoho/);
        assert.equal(claimed(claim(C, 'vyzva-OTEVRE-abc123:2', question('Už uložená'))).title, 'Otevřená', 'uložená otázka se vrátí i nad limitem');
        const exported = JSON.parse(last(ok(as(A, 'select export_my_data();'))));
        assert.ok(exported.zamrzle_otazky.some(row => row.seminko === 'vyzva-PRIVAT-abc123:0'), 'export obsahuje vlastní zamrzlé otázky');
        assert.ok(!exported.zamrzle_otazky.some(row => row.seminko === 'vyzva-PRIVAT-abc123:1'), 'cizí ne');
    });
});
