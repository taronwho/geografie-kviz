// Průběh výzev a zápasů turnaje na serveru a XP za výhry v turnaji jednou za účet (PostgreSQL 16, schéma 3):
// challenge_progress_save (jen další otázka v pořadí, nic přeskočit ani přepsat, stejná odpověď znovu nic nezmění), konečný výsledek výzvy
// spočítaný z průběhu, tournament_answer_save a tournament_finish_match z odpovědí, claim_tournament_xp (dvojí výplata, cizí zápas, opakování
// se stejným klíčem) i migrace starší databáze (už rozhodnuté výhry se berou jako vyplacené). Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { challengeProgressSql, tournamentAnswersSql, finishMatchSql } = require('./sql-play.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_progress_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// Jako přihlášený hráč (role authenticated) v daný den turnaje; jedna relace a jedna transakce
const as = (uid, sql, day = MON, role = 'authenticated') => psql(dbName, `set mudrlant.test_today = '${day}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const save = (uid, code, idx, correct, points) => as(uid, `select challenge_progress_save('${code}', ${idx}, ${correct}, ${points});`);
const answer = (uid, mid, idx, correct, points, day = MON) => as(uid, `select tournament_answer_save('${mid}', ${idx}, ${correct}, ${points});`, day);
const progressOf = (code, uid) => q(`select coalesce(string_agg(idx || ':' || correct || ':' || points, ',' order by idx), '') from challenge_progress where challenge_id = '${code}' and user_id = '${uid}'`);
const claim = (uid, key = null) => last(ok(as(uid, `select coalesce(string_agg(id::text || ':' || round, ',' order by id), '-') from claim_tournament_xp(${key ? `'${key}'` : 'null'});`)));

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
const TUE = '2026-11-10';
const A = id(1);
const B = id(2);
const C = id(3);

test('SQL: průběh výzev a turnajů na serveru, XP za výhry jednou za účet', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 12 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    // A vyzývá B (5 otázek, jen výběr z možností); otevřená výzva A pro kohokoli (3 otázky, i psané odpovědi)
    q(`insert into challenges (id, creator_id, invited_id, topic, seed, count, variant) values ('PRIVAT', '${A}', '${B}', 'mix', 's1', 5, 'choices');
       insert into challenges (id, creator_id, topic, seed, count) values ('OTEVRE', '${A}', 'mix', 's2', 3);`);

    await t.test('verze schématu je aspoň 3 (průběh výzev na serveru)', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 3);
    });

    await t.test('průběh výzvy: jen další otázka v pořadí, cizí výzva, přeskočení, přepsání a nesmyslné hodnoty neprojdou', () => {
        denied(save(C, 'PRIVAT', 0, true, 4), /hrát nemůžeš/, 'cizí hráč do výzvy určené jinému');
        denied(save(null, 'PRIVAT', 0, true, 4), /Přihlas se/, 'bez přihlášení');
        denied(as(B, `select challenge_progress_save('PRIVAT', 0, true, 4);`, MON, 'anon'), null, 'role anon');
        denied(save(B, 'NENIII', 0, true, 4), /hrát nemůžeš/, 'neexistující výzva');
        denied(save(B, 'PRIVAT', 1, true, 4), /předchozí otázky/, 'přeskočení první otázky');
        assert.equal(last(ok(save(B, 'PRIVAT', 0, true, 4))), '1');
        // stejná odpověď znovu (fronta po výpadku spojení): v pořádku a nic se nemění
        assert.equal(last(ok(save(B, 'PRIVAT', 0, true, 4))), '1');
        denied(save(B, 'PRIVAT', 0, false, 0), /přepsat ji nejde/, 'přepsání uložené odpovědi');
        denied(save(B, 'PRIVAT', 2, true, 3), /předchozí otázky/, 'přeskočení otázky');
        denied(save(B, 'PRIVAT', -1, true, 3), /Neplatné číslo/);
        denied(save(B, 'PRIVAT', 5, true, 3), /Neplatné číslo/, 'index za posledním');
        denied(save(B, 'PRIVAT', 1, true, 5), /Neplatný výsledek/, 'víc než 4 body při výběru z možností');
        denied(save(B, 'PRIVAT', 1, true, 0), /Neplatný výsledek/, 'správně bez bodu');
        denied(save(B, 'PRIVAT', 1, false, 2), /Neplatný výsledek/, 'špatně s body');
        denied(save(B, 'PRIVAT', 1, null, 0), /Neplatný výsledek/);
        assert.equal(progressOf('PRIVAT', B), '0:true:4');
        // psaná odpověď (výzva bez pevného způsobu odpovídání) má až 8 bodů
        ok(save(C, 'OTEVRE', 0, true, 8));
        denied(save(C, 'OTEVRE', 1, true, 9), /Neplatný výsledek/);
    });

    await t.test('průběh výzvy: přímý zápis do tabulky nejde a cizí průběh není vidět', () => {
        denied(as(B, `insert into challenge_progress (challenge_id, user_id, idx, correct, points) values ('PRIVAT', '${B}', 1, true, 4);`));
        denied(as(B, `update challenge_progress set points = 1 where challenge_id = 'PRIVAT';`));
        denied(as(B, `delete from challenge_progress where challenge_id = 'PRIVAT';`));
        denied(as(B, `truncate challenge_progress;`));
        assert.equal(last(ok(as(B, `select count(*) from challenge_progress;`))), '1', 'vlastní průběh je vidět');
        assert.equal(last(ok(as(A, `select count(*) from challenge_progress where user_id = '${B}';`))), '0', 'zakladatel průběh soupeře nevidí');
        assert.equal(last(ok(as(C, `select count(*) from challenge_progress;`))), '1', 'jen svůj řádek z otevřené výzvy');
        denied(as(B, `select * from challenge_progress;`, MON, 'anon'));
    });

    await t.test('konečný výsledek výzvy: až po celém průběhu, spočítá ho server, potom už průběh nejde měnit', () => {
        const result = (uid, forId, code, correct, points) => as(uid, `insert into challenge_results (challenge_id, user_id, correct, points) values ('${code}', '${forId}', ${correct}, ${points});`);
        denied(result(B, B, 'PRIVAT', 5, 20), /všechny otázky/, 'výsledek bez celého průběhu');
        ok(save(B, 'PRIVAT', 1, false, 0));
        ok(save(B, 'PRIVAT', 2, true, 2));
        ok(save(B, 'PRIVAT', 3, true, 1));
        denied(result(B, B, 'PRIVAT', 5, 20), /všechny otázky/, 'chybí poslední otázka');
        ok(save(B, 'PRIVAT', 4, false, 0));
        denied(result(C, B, 'PRIVAT', 5, 20), null, 'výsledek za jiného hráče');
        // hráč pošle vylepšená čísla: uloží se součet průběhu (3 správně, 7 bodů)
        ok(result(B, B, 'PRIVAT', 5, 20));
        assert.equal(q(`select correct || '/' || points from challenge_results where challenge_id = 'PRIVAT' and user_id = '${B}'`), '3/7');
        // znovu se stejným kódem (ztracená odpověď serveru, upsert aplikace): nic se nezmění
        ok(as(B, `insert into challenge_results (challenge_id, user_id, correct, points) values ('PRIVAT', '${B}', 5, 20) on conflict do nothing;`));
        assert.equal(q(`select correct || '/' || points from challenge_results where challenge_id = 'PRIVAT' and user_id = '${B}'`), '3/7');
        denied(save(B, 'PRIVAT', 4, false, 0), /dohranou/, 'po výsledku se průběh neukládá ani stejně');
        denied(save(B, 'PRIVAT', 5, true, 1), /dohranou/);
        // zakladatel výzvu dohraje: rating se spočítá jako dřív
        ok(as(A, challengeProgressSql('PRIVAT', 5, 4, 12, 4)));
        ok(result(A, A, 'PRIVAT', 0, 0));
        assert.equal(q(`select correct || '/' || points from challenge_results where challenge_id = 'PRIVAT' and user_id = '${A}'`), '4/12');
        assert.equal(q(`select string_agg(outcome, ',' order by user_id) from rating_history where challenge_id = 'PRIVAT'`), 'win,loss');
        // správce (postgres) smí zapsat výsledek i bez průběhu
        q(`insert into challenge_results (challenge_id, user_id, correct, points) values ('OTEVRE', '${id(9)}', 2, 3)`);
    });

    // Turnaj o 8 hráčích (1. kolo v pondělí 9. 11.)
    let tid;
    let matches;
    await t.test('odpovědi v turnaji: jen účastník, jen po začátku, jen v den kola, v pořadí; výsledek spočítá server', () => {
        ok(psql(dbName, `set mudrlant.test_today = '${WED}'; select tournament_tick();`));
        tid = q(`select id from tournaments where status = 'open'`);
        for (let n = 1; n <= 8; n++) ok(as(id(n), `select tournament_join('${tid}');`, WED));
        ok(psql(dbName, `set mudrlant.test_today = '${MON}'; select tournament_tick();`));
        matches = q(`select id || '|' || p1 || '|' || p2 from tournament_matches where tournament_id = '${tid}' and round = 1 order by slot`).split('\n').map(line => line.split('|'));
        const [mid, p1, p2] = matches[0];
        const outsider = [1, 2, 3, 4, 5, 6, 7, 8].map(id).find(u => u !== p1 && u !== p2);
        denied(answer(p1, mid, 0, true, 3), /nezačal/, 'odpověď před začátkem zápasu');
        ok(as(p1, `select tournament_start_match('${mid}');`));
        denied(answer(outsider, mid, 0, true, 3), /není tvůj zápas/, 'cizí zápas');
        denied(answer(p1, mid, 0, true, 3, TUE), /nehraje/, 'jiný den než den kola');
        denied(answer(p1, mid, 1, true, 3), /předchozí otázky/, 'přeskočení');
        assert.equal(last(ok(answer(p1, mid, 0, true, 3))), '1');
        assert.equal(last(ok(answer(p1, mid, 0, true, 3))), '1', 'stejná odpověď znovu');
        denied(answer(p1, mid, 0, true, 4), /přepsat/, 'přepsání');
        denied(answer(p1, mid, 1, true, 5), /Neplatný výsledek/, 'víc než 4 body');
        denied(answer(p1, mid, 10, true, 1), /Neplatné číslo/);
        denied(as(p1, `insert into tournament_answers (match_id, user_id, idx, correct, points) values ('${mid}', '${p1}', 1, true, 4);`), null, 'přímý zápis');
        denied(as(p1, `update tournament_answers set points = 4;`));
        assert.equal(last(ok(as(p2, `select count(*) from tournament_answers;`))), '0', 'soupeř odpovědi nevidí');
        // konec před všemi odpověďmi nejde (ani s devíti); s vylepšenými čísly od klienta platí součet odpovědí
        denied(as(p1, `select tournament_finish_match('${mid}', 10, 40);`), /není dohraný/);
        const all = tournamentAnswersSql(mid, 7, 20);
        ok(as(p1, all.slice(0, all.lastIndexOf('select tournament_answer_save'))));
        assert.equal(q(`select count(*) from tournament_answers where match_id = '${mid}' and user_id = '${p1}'`), '9');
        denied(as(p1, `select tournament_finish_match('${mid}', 10, 40);`), /není dohraný/, 'devět odpovědí nestačí');
        ok(as(p1, `${all} select tournament_finish_match('${mid}', 10, 40);`));
        assert.equal(q(`select correct || '/' || points || ' ' || (finished_at is not null) from tournament_results where match_id = '${mid}' and user_id = '${p1}'`), '7/20 true');
        denied(answer(p1, mid, 9, false, 0), /dohraný/, 'po konci zápasu se odpovědi neukládají');
        denied(as(p1, `select tournament_finish_match('${mid}', 7, 20);`), /jen jednou/);
        // soupeř odehraje hůř: zápas rozhodne výsledek
        ok(as(p2, `select tournament_start_match('${mid}'); ${finishMatchSql(mid, 5, 15)}`));
        assert.equal(q(`select (winner = '${p1}')::text || ' ' || decided_by from tournament_matches where id = '${mid}'`), 'true played');
    });

    await t.test('XP za výhru v turnaji: vyplatí se jednou za účet, jen vítězi a ne za postup bez hry', () => {
        const [m1, m2, m3, m4] = matches;
        // m2: odehraje jen p1 (kontumace), m3: nikdo (postup dřívějšího přihlášeného), m4: oba
        ok(as(m2[1], `select tournament_start_match('${m2[0]}'); ${finishMatchSql(m2[0], 3, 9)}`));
        ok(as(m4[1], `select tournament_start_match('${m4[0]}'); ${finishMatchSql(m4[0], 2, 4)}`));
        ok(as(m4[2], `select tournament_start_match('${m4[0]}'); ${finishMatchSql(m4[0], 6, 18)}`));
        ok(psql(dbName, `set mudrlant.test_today = '${TUE}'; select tournament_tick();`));
        assert.equal(q(`select string_agg(decided_by, ',' order by slot) from tournament_matches where tournament_id = '${tid}' and round = 1`), 'played,walkover,earlier,played');
        const m3Winner = q(`select winner from tournament_matches where id = '${m3[0]}'`);
        const m1Loser = m1[2];
        assert.equal(claim(m1[1]), `${m1[0]}:1`, 'vítěz odehraného zápasu');
        assert.equal(claim(m1[1]), '-', 'dvojí claim: podruhé nic');
        assert.equal(claim(m2[1]), `${m2[0]}:1`, 'kontumace: vítěz odehrál');
        assert.equal(claim(m3Winner), '-', 'postup dřívějšího přihlášeného bez hry XP nedává');
        assert.equal(claim(m1Loser), '-', 'poražený nic');
        // opakování se stejným klíčem vrátí tytéž zápasy (odpověď se ztratila); bez klíče nebo s jiným klíčem nic
        assert.equal(claim(m4[2], 'klic-zarizeni-1'), `${m4[0]}:1`);
        assert.equal(claim(m4[2], 'klic-zarizeni-1'), `${m4[0]}:1`, 'stejný klíč: znovu tentýž zápas');
        assert.equal(claim(m4[2]), '-');
        assert.equal(claim(m4[2], 'klic-zarizeni-2'), '-');
        assert.equal(claim(m1[1], 'klic-zarizeni-1'), '-', 'cizí klíč nevrátí cizí zápas');
        denied(as(m4[2], `select * from claim_tournament_xp('a b<c>');`), /Neplatný klíč/);
        denied(as(m4[2], `select * from claim_tournament_xp();`, MON, 'anon'), null, 'role anon');
        denied(as(null, `select * from claim_tournament_xp();`), /Přihlas se/);
        // tabulku vyplacených XP klient přímo nezmění a vidí jen svoje řádky
        denied(as(m1Loser, `insert into tournament_xp_claims (match_id, user_id, round) values ('${m1[0]}', '${m1Loser}', 1);`));
        denied(as(m1[1], `delete from tournament_xp_claims;`), null, 'smazat vyplacené (a nechat si vyplatit znovu) nejde');
        denied(as(m1[1], `update tournament_xp_claims set user_id = '${m1Loser}';`));
        assert.equal(last(ok(as(m1[1], `select count(*) from tournament_xp_claims;`))), '1');
        assert.equal(last(ok(as(m1Loser, `select count(*) from tournament_xp_claims;`))), '0');
    });

    await t.test('souběžné claimy téhož hráče vyplatí zápas jen jednou', async () => {
        // 2. kolo: vítěz m1 proti vítězi m2; odehraje jen vítěz m1
        const semi = q(`select id from tournament_matches where tournament_id = '${tid}' and round = 2 and '${matches[0][1]}' in (p1, p2)`);
        ok(as(matches[0][1], `select tournament_start_match('${semi}'); ${finishMatchSql(semi, 4, 8)}`, TUE));
        ok(psql(dbName, `set mudrlant.test_today = '2026-11-11'; select tournament_tick();`));
        const { spawn } = require('node:child_process');
        const run = () => new Promise(resolve => {
            const child = spawn('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', dbName, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c',
                `set role authenticated; select set_config('request.jwt.claim.sub', '${matches[0][1]}', false); select coalesce(string_agg(id::text, ','), '-') from claim_tournament_xp(); select pg_sleep(0.3);`]);
            let out = '';
            child.stdout.on('data', chunk => { out += chunk; });
            child.on('close', () => resolve(out.trim().split('\n').filter(Boolean)));
        });
        const outputs = await Promise.all([run(), run(), run()]);
        const paid = outputs.map(lines => lines[1]).filter(value => value && value !== '-');
        assert.deepEqual(paid, [semi], `jen jedno volání vyplatí semifinále: ${JSON.stringify(outputs)}`);
    });

    await t.test('export obsahuje průběh, odpovědi a vyplacené XP, jen vlastní', () => {
        const data = JSON.parse(last(ok(as(B, `select export_my_data();`))));
        assert.deepEqual(data.vyzvy_prubeh.map(row => `${row.challenge_id}:${row.idx}`), ['PRIVAT:0', 'PRIVAT:1', 'PRIVAT:2', 'PRIVAT:3', 'PRIVAT:4']);
        assert.ok(data.vyzvy_prubeh.every(row => row.user_id === B));
        const winner = matches[0][1];
        const mine = JSON.parse(last(ok(as(winner, `select export_my_data();`))));
        assert.ok(mine.turnaje_odpovedi.length >= 10 && mine.turnaje_odpovedi.every(row => row.user_id === winner));
        assert.ok(mine.turnaje_xp.length >= 1 && mine.turnaje_xp.every(row => row.user_id === winner));
        const other = JSON.parse(last(ok(as(id(12), `select export_my_data();`))));
        assert.deepEqual([other.vyzvy_prubeh, other.turnaje_odpovedi, other.turnaje_xp], [[], [], []]);
    });

    await t.test('migrace: při prvním spuštění se už rozhodnuté výhry berou jako vyplacené, opakované spuštění nic nemění', () => {
        // Databáze před verzí 3: tabulka vyplacených XP ještě není, výhry už rozhodnuté jsou (XP za ně hráči dostali ve svých zařízeních)
        q(`drop table tournament_xp_claims cascade`);
        const decided = q(`select count(*) from tournament_matches where winner is not null and decided_by <> 'earlier'`);
        assert.ok(Number(decided) >= 4);
        ok(psql(dbName, '', schema));
        assert.equal(q(`select count(*) || ' ' || bool_and(legacy) from tournament_xp_claims`), `${decided} true`);
        for (const [, p1, p2] of matches) { assert.equal(claim(p1), '-'); assert.equal(claim(p2), '-'); }
        assert.equal(claim(matches[0][1], 'klic-zarizeni-1'), '-', 'starší výhry se nevrací ani s klíčem');
        // spuštění schématu znovu: žádné nové ani zdvojené řádky
        ok(psql(dbName, '', schema));
        assert.equal(q(`select count(*) from tournament_xp_claims`), decided);
        // nová výhra po migraci se vyplatí normálně
        const next = q(`select id || '|' || p1 || '|' || p2 from tournament_matches where tournament_id = '${tid}' and winner is null order by round desc, third limit 1`).split('|');
        ok(as(next[1], `select tournament_start_match('${next[0]}'); ${finishMatchSql(next[0], 9, 30)}`, '2026-11-11'));
        ok(as(next[2], `select tournament_start_match('${next[0]}'); ${finishMatchSql(next[0], 1, 1)}`, '2026-11-11'));
        assert.equal(claim(next[1]).split(':')[0], next[0]);
        assert.equal(claim(next[1]), '-');
    });
});
