// Rozpis otázek po výzvě a zápasu turnaje (PostgreSQL 16, schéma 10): podrobnosti odpovědí (text odpovědi, nápovědy, čas) se ukládají
// s odpovědí, kontrolují se a čistí; challenge_details a tournament_details vrací soupeřovy odpovědi jen hráči, který sám dohrál, a jen
// účastníkům. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { challengeProgressSql, finishMatchSql } = require('./sql-play.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_details_${process.pid}`;
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
const sqlText = (text) => (text === null ? 'null' : `'${String(text).replace(/'/g, "''")}'`);
const save = (uid, code, idx, correct, points, answer = null, hints = null, ms = null) =>
    as(uid, `select challenge_progress_save('${code}', ${idx}, ${correct}, ${points}, ${sqlText(answer)}, ${hints === null ? 'null' : hints}, ${ms === null ? 'null' : ms});`);
const finish = (uid, code) => as(uid, `insert into challenge_results (challenge_id, user_id, correct, points) values ('${code}', '${uid}', 0, 0);`);
// Řádky rozpisu jako „hráč|idx|správně|body|odpověď|nápovědy|ms“ (hráč jen číslem z id)
const detailRows = (r) => r.stdout.trim().split('\n').filter(line => line.split('|').length === 7).map(line => line.replace(/^0{8}-0{4}-0{4}-0{4}-0*/, ''));
const details = (uid, code) => as(uid, `select * from challenge_details(${sqlText(code)});`);
const tourDetails = (uid, mid, day = MON) => as(uid, `select * from tournament_details('${mid}');`, day);

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

test('SQL: rozpis otázek po výzvě a zápasu turnaje', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 10 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    // A vyzývá B (3 otázky z možností); otevřená výzva A pro kohokoli (3 otázky); stará výzva (8 dní) A vyzývá B
    q(`insert into challenges (id, creator_id, invited_id, topic, seed, count, variant) values ('PRIVAT', '${A}', '${B}', 'mix', 's1', 3, 'choices');
       insert into challenges (id, creator_id, topic, seed, count) values ('OTEVRE', '${A}', 'mix', 's2', 3);
       insert into challenges (id, creator_id, invited_id, topic, seed, count, variant) values ('STARAV', '${A}', '${B}', 'mix', 's3', 3, 'choices');
       update challenges set created_at = now() - interval '8 days' where id = 'STARAV';`);

    await t.test('verze schématu je aspoň 10 a staré volání se čtyřmi parametry funguje dál', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 10);
        assert.equal(q(`select count(*) from pg_proc where proname = 'challenge_progress_save'`), '1', 'jen jedna podoba funkce (volání není nejednoznačné)');
        assert.equal(q(`select count(*) from pg_proc where proname = 'tournament_answer_save'`), '1');
        assert.equal(last(ok(as(B, `select challenge_progress_save('PRIVAT', 0, true, 4);`))), '1', 'starší aplikace bez podrobností');
        assert.equal(q(`select coalesce(answer, '-') || '|' || coalesce(hints::text, '-') || '|' || coalesce(ms::text, '-') from challenge_progress where challenge_id = 'PRIVAT' and user_id = '${B}' and idx = 0`), '-|-|-');
    });

    await t.test('podrobnosti odpovědi: kontrola nápověd a času, text se vyčistí a zkrátí', () => {
        denied(save(B, 'PRIVAT', 1, true, 3, 'Praha', 5, 1000), /nápověd/, 'víc než 4 nápovědy');
        denied(save(B, 'PRIVAT', 1, true, 3, 'Praha', -1, 1000), /nápověd/, 'záporné nápovědy');
        denied(save(B, 'PRIVAT', 1, true, 3, 'Praha', 1, -5), /čas/, 'záporný čas');
        denied(save(B, 'PRIVAT', 1, true, 9, 'Praha', 1, 1000), /Neplatný výsledek/, 'body nad strop výzvy jako dřív');
        denied(save(B, 'PRIVAT', 1, false, 2, 'Praha', 0, 1000), /Neplatný výsledek/, 'špatně s body jako dřív');
        ok(save(B, 'PRIVAT', 1, true, 3, `  <b>Brno</b>\u200b\u202e\n${'x'.repeat(300)}`, 1, 99999999));
        const row = q(`select answer || '|' || hints || '|' || ms from challenge_progress where challenge_id = 'PRIVAT' and user_id = '${B}' and idx = 1`);
        const [text, hints, ms] = row.split('|');
        assert.ok(text.startsWith('b Brno /b x'), `vyčištěný text: ${text}`);
        assert.equal(text.length, 120, 'nejvýš 120 znaků');
        assert.ok(!/[<>\u200b\u202e\n]/.test(text), 'bez závorek, neviditelných znaků a zalomení');
        assert.equal(hints, '1');
        assert.equal(ms, '3600000', 'čas nejvýš hodina');
        // stejná odpověď znovu (fronta po výpadku): v pořádku, podrobnosti platí z prvního uložení
        ok(save(B, 'PRIVAT', 1, true, 3, 'Jiný text', 2, 10));
        assert.equal(q(`select hints from challenge_progress where challenge_id = 'PRIVAT' and user_id = '${B}' and idx = 1`), '1');
        ok(save(B, 'PRIVAT', 2, false, 0, '   ', 0, 4200));
        assert.equal(q(`select coalesce(answer, 'null') from challenge_progress where challenge_id = 'PRIVAT' and user_id = '${B}' and idx = 2`), 'null', 'prázdný text = null');
        denied(as(B, `update challenge_progress set answer = 'podvod' where challenge_id = 'PRIVAT';`), null, 'přímo do tabulky nejde');
    });

    await t.test('rozpis výzvy: soupeřovy odpovědi jsou skryté, dokud žadatel výzvu nedohraje', () => {
        // B ještě nemá výsledek: rozpis nedostane, ani svůj
        denied(details(B, 'PRIVAT'), /až výzvu dohraješ/, 'bez vlastního výsledku');
        ok(finish(B, 'PRIVAT'));
        // B dohrál, A ještě hraje: B vidí jen sebe
        ok(save(A, 'PRIVAT', 0, true, 4, 'Praha', 0, 3000));
        assert.deepEqual(detailRows(ok(details(B, 'PRIVAT'))).map(row => row.split('|')[0]), ['2', '2', '2'], 'jen vlastní odpovědi, A hraje');
        // A rozehrál, ale nedohrál: B výsledek má, A ne – A rozpis nedostane (nesmí vidět B odpovědi)
        denied(details(A, 'PRIVAT'), /až výzvu dohraješ/, 'rozehraný zakladatel nevidí odpovědi soupeře');
        ok(save(A, 'PRIVAT', 1, false, 0, 'Ostrava', 2, 5000));
        ok(save(A, 'PRIVAT', 2, true, 2, 'Plzeň', 2, 6000));
        ok(finish(A, 'PRIVAT'));
        const rows = detailRows(ok(details(A, 'PRIVAT')));
        assert.equal(rows.length, 6, 'po dohrání obou: všech 6 odpovědí');
        assert.ok(rows.includes('1|0|t|4|Praha|0|3000'), rows.join('\n'));
        assert.ok(rows.includes('2|0|t|4|||'), 'stará odpověď bez podrobností');
        assert.equal(detailRows(ok(details(B, 'PRIVAT'))).length, 6, 'i B vidí obě strany');
    });

    await t.test('rozpis výzvy: jen účastníci; neplatný kód, anon a cizí výzva neprojdou', () => {
        denied(details(C, 'PRIVAT'), /až výzvu dohraješ/, 'cizí hráč (výzva určená jinému)');
        denied(details(C, 'NENIII'), /až výzvu dohraješ/, 'neexistující výzva se neprozradí');
        denied(details(C, "x' or 1=1 --"), /Neplatný kód/);
        denied(details(null, 'PRIVAT'), /Přihlas se/);
        denied(as(A, `select * from challenge_details('PRIVAT');`, MON, 'anon'), null, 'role anon');
        // otevřená výzva: C dohraje; D (id 4) rozehraje a C jeho odpovědi nevidí; po dohrání ano
        ok(as(C, `${challengeProgressSql('OTEVRE', 3, 2, 5)} insert into challenge_results (challenge_id, user_id, correct, points) values ('OTEVRE', '${C}', 0, 0);`));
        ok(save(id(4), 'OTEVRE', 0, true, 4, 'Vídeň', 0, 100));
        assert.deepEqual([...new Set(detailRows(ok(details(C, 'OTEVRE'))).map(row => row.split('|')[0]))], ['3'], 'rozehraný hráč otevřené výzvy je skrytý');
        denied(details(id(5), 'OTEVRE'), /až výzvu dohraješ/, 'kdo nehrál, nevidí nic');
    });

    await t.test('rozpis vypršelé výzvy: dohraný hráč vidí i rozehrané odpovědi soupeře', () => {
        ok(as(A, `${challengeProgressSql('STARAV', 3, 1, 4, 4)} insert into challenge_results (challenge_id, user_id, correct, points) values ('STARAV', '${A}', 0, 0);`));
        ok(save(B, 'STARAV', 0, false, 0, 'Nevím', 4, 900));
        const rows = detailRows(ok(details(A, 'STARAV')));
        assert.ok(rows.includes('2|0|f|0|Nevím|4|900'), rows.join('\n'));
        denied(details(B, 'STARAV'), /až výzvu dohraješ/, 'nedohraný hráč nevidí nic ani po vypršení');
    });

    await t.test('rozpis zápasu turnaje: jen hráči zápasu a až po vlastním dohrání', () => {
        ok(psql(dbName, `set mudrlant.test_today = '${WED}'; select tournament_tick();`));
        const tid = q(`select id from tournaments where status = 'open'`);
        for (let n = 1; n <= 8; n++) ok(as(id(n), `select tournament_join('${tid}');`, WED));
        ok(psql(dbName, `set mudrlant.test_today = '${MON}'; select tournament_tick();`));
        const [mid, p1, p2] = q(`select id || '|' || p1 || '|' || p2 from tournament_matches where tournament_id = '${tid}' and round = 1 order by slot limit 1`).split('|');
        const outsider = [1, 2, 3, 4, 5, 6, 7, 8].map(id).find(u => u !== p1 && u !== p2);
        ok(as(p1, `select tournament_start_match('${mid}');`));
        denied(as(p1, `select tournament_answer_save('${mid}', 0, true, 3, 'Řím', 7, 100);`), /nápověd/);
        ok(as(p1, `select tournament_answer_save('${mid}', 0, true, 3, 'Řím', 1, 2500);`));
        denied(tourDetails(p1, mid), /až zápas dohraješ/, 'rozehraný zápas');
        // p1 dohraje (zbylé odpovědi bez podrobností jako starší aplikace; první otázka znovu stejně, to nic nemění)
        ok(as(p1, finishMatchSql(mid, 7, 20)));
        assert.equal(detailRows(ok(tourDetails(p1, mid))).length, 10, 'jen vlastních 10 odpovědí, soupeř ještě nehrál');
        denied(tourDetails(p2, mid), /až zápas dohraješ/, 'soupeř bez odehrání nevidí odpovědi p1');
        denied(tourDetails(outsider, mid), /není tvůj zápas/, 'cizí hráč');
        denied(as(p1, `select * from tournament_details('${mid}');`, MON, 'anon'), null, 'role anon');
        ok(as(p2, `select tournament_start_match('${mid}'); ${finishMatchSql(mid, 5, 15)}`));
        const rows = detailRows(ok(tourDetails(p2, mid)));
        assert.equal(rows.length, 20, 'po dohrání obou: obě strany');
        assert.ok(rows.some(row => row.endsWith('|0|t|3|Řím|1|2500')), rows.join('\n'));
        assert.equal(detailRows(ok(tourDetails(p1, mid))).length, 20);
        // výsledek zápasu se nezměnil (rozhoduje dál počet správných, pak body, pak čas)
        assert.equal(q(`select (winner = '${p1}')::text || ' ' || decided_by from tournament_matches where id = '${mid}'`), 'true played');
    });
});
