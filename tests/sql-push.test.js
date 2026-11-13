// Web push v databázi (PostgreSQL 16): odběry (RLS, tvar, přepis stejného zařízení), tajemství v app_secrets, push_due (turnajový zápas dne,
// příchozí výzva, nepřečtená zpráva, útoky v Dobývání; dedupe, část dne, hodinový a desetiminutový limit, předvolby) a push_mark (odeslané klíče,
// chyby, smazání odběrů).
// Čas se simuluje nastavením mudrlant.test_today a mudrlant.test_hour. Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { challengeProgressSql, finishMatchSql } = require('./sql-play.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_push_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const last = (r) => r.stdout.trim().split('\n').pop();
// Jako přihlášený hráč v daný den (jedna relace, ať platí nastavení dne)
const as = (uid, day, sql) => psql(dbName, `set mudrlant.test_today = '${day}'; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${sql}`);
// Jako odesílatel: veřejný klíč = role anon, bez hráče; den a hodina (Praha) podle testu
const asAnon = (day, hour, sql) => psql(dbName, `set mudrlant.test_today = '${day}'; set mudrlant.test_hour = '${hour}'; set role anon; ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };
const tick = (day) => ok(psql(dbName, `set mudrlant.test_today = '${day}'; select tournament_tick();`));

const SECRET = 'tajne-heslo-pro-cron-1234567890';
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const endpointOf = (n) => `https://push.example.com/send/${n}`;
const due = (day, hour) => asAnon(day, hour, `select user_id || '|' || endpoint || '|' || kind || '|' || title || '|' || body || '|' || url || '|' || dedupe_key from push_due('${SECRET}');`);
const dueRows = (day, hour) => { const r = ok(due(day, hour)); const text = r.stdout.trim(); return text ? text.split('\n').filter(line => line.includes('|')).map(line => { const [user, endpoint, kind, title, body, url, key] = line.split('|'); return { user, endpoint, kind, title, body, url, key }; }) : []; };
const mark = (keys, { okEndpoints = [], failed = [], gone = [] } = {}) => ok(asAnon('2026-11-09', 9, `select push_mark('${SECRET}', array[${keys.map(k => `'${k}'`).join(',')}]::text[], array[${okEndpoints.map(e => `'${e}'`).join(',')}]::text[], array[${failed.map(e => `'${e}'`).join(',')}]::text[], array[${gone.map(e => `'${e}'`).join(',')}]::text[]);`));

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

const WED = '2026-11-04';
const MON = '2026-11-09';
const TUE = '2026-11-10';

test('SQL: web push (odběry, tajemství, push_due, push_mark)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) { const r = psql(dbName, '', schema); assert.equal(r.status, 0, `schema.sql běh ${run + 1}: ${r.stderr}`); }
    q(Array.from({ length: 12 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    await t.test('odběr: jen přihlášený, jen platný tvar, vidí a maže jen své; stejné zařízení přejde na nového hráče', () => {
        denied(psql(dbName, `set role anon; select push_subscribe('${endpointOf(1)}', '${P256DH}', '${AUTH}');`), 'anon nesmí');
        ok(as(id(1), WED, `select push_subscribe('${endpointOf(1)}', '${P256DH}', '${AUTH}');`));
        ok(as(id(1), WED, `select push_subscribe('${endpointOf(2)}', '${P256DH}', '${AUTH}');`));
        ok(as(id(2), WED, `select push_subscribe('${endpointOf(3)}', '${P256DH}', '${AUTH}');`));
        denied(as(id(1), WED, `select push_subscribe('http://push.example.com/x', '${P256DH}', '${AUTH}');`), 'jen https');
        denied(as(id(1), WED, `select push_subscribe('https://push.example.com/<script>', '${P256DH}', '${AUTH}');`), 'bez podivných znaků');
        denied(as(id(1), WED, `select push_subscribe('${endpointOf(9)}', 'kratky', '${AUTH}');`), 'tvar klíče');
        denied(as(id(1), WED, `select push_subscribe('${endpointOf(9)}', '${P256DH}', 'a b');`), 'tvar auth');
        denied(as(id(1), WED, `select push_subscribe('https://push.example.com/${'x'.repeat(1600)}', '${P256DH}', '${AUTH}');`), 'délka');
        // přímý zápis cizího řádku přes RLS neprojde, vlastní ano
        denied(as(id(1), WED, `insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('${endpointOf(4)}', '${id(2)}', '${P256DH}', '${AUTH}');`));
        ok(as(id(1), WED, `insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('${endpointOf(4)}', '${id(1)}', '${P256DH}', '${AUTH}');`));
        denied(as(id(1), WED, `update push_subscriptions set fails = 0 where endpoint = '${endpointOf(4)}';`), 'update není povolený');
        // čtení: jen vlastní
        assert.equal(last(ok(as(id(1), WED, `select count(*) from push_subscriptions;`))), '3');
        assert.equal(last(ok(as(id(2), WED, `select count(*) from push_subscriptions;`))), '1');
        assert.equal(last(ok(as(id(3), WED, `select count(*) from push_subscriptions;`))), '0');
        denied(psql(dbName, `set role anon; select count(*) from push_subscriptions;`), 'anon nečte');
        // mazání: cizí řádek se nesmaže (0 řádků), vlastní ano
        assert.equal(last(ok(as(id(2), WED, `with d as (delete from push_subscriptions where endpoint = '${endpointOf(4)}' returning 1) select count(*) from d;`))), '0');
        assert.equal(last(ok(as(id(1), WED, `with d as (delete from push_subscriptions where endpoint = '${endpointOf(4)}' returning 1) select count(*) from d;`))), '1');
        // totéž zařízení (endpoint) se přihlásí jiným účtem: řádek přejde na něj
        ok(as(id(3), WED, `select push_subscribe('${endpointOf(2)}', '${P256DH}', '${AUTH}');`));
        assert.equal(q(`select user_id from push_subscriptions where endpoint = '${endpointOf(2)}'`), id(3));
        ok(as(id(3), WED, `delete from push_subscriptions where endpoint = '${endpointOf(2)}';`));
        // nejvýš 10 zařízení na hráče: jedenácté vytlačí nejstarší
        for (let n = 20; n < 30; n++) ok(as(id(4), WED, `select push_subscribe('${endpointOf(n)}', '${P256DH}', '${AUTH}');`));
        q(`update push_subscriptions set created_at = created_at - interval '1 day' where endpoint = '${endpointOf(20)}'`);
        ok(as(id(4), WED, `select push_subscribe('${endpointOf(30)}', '${P256DH}', '${AUTH}');`));
        assert.equal(q(`select count(*) from push_subscriptions where user_id = '${id(4)}'`), '10');
        assert.equal(q(`select count(*) from push_subscriptions where endpoint = '${endpointOf(20)}'`), '0');
        q(`delete from push_subscriptions where user_id = '${id(4)}'`);
    });

    await t.test('tajemství: bez řádku v app_secrets nic, špatné tajemství nic, tabulky app_secrets a push_sent jsou přes API nedostupné', () => {
        denied(asAnon(WED, 9, `select * from push_due('${SECRET}');`), 'bez tajemství v databázi');
        denied(psql(dbName, `set role anon; insert into app_secrets (name, value) values ('push_cron', '${SECRET}');`), 'anon nezapíše tajemství');
        denied(as(id(1), WED, `insert into app_secrets (name, value) values ('push_cron', '${SECRET}');`), 'hráč nezapíše tajemství');
        denied(psql(dbName, `insert into app_secrets (name, value) values ('push_cron', 'kratke');`), 'příliš krátké tajemství');
        q(`insert into app_secrets (name, value) values ('push_cron', '${SECRET}')`);
        denied(psql(dbName, `set role anon; select * from app_secrets;`), 'anon nečte tajemství');
        denied(as(id(1), WED, `select * from app_secrets;`), 'hráč nečte tajemství');
        denied(as(id(1), WED, `select * from push_sent;`), 'hráč nečte odeslané');
        denied(asAnon(WED, 9, `select * from push_due('spatne');`), 'špatné tajemství');
        denied(asAnon(WED, 9, `select * from push_due(null);`), 'prázdné tajemství');
        denied(asAnon(WED, 9, `select * from push_due('${SECRET.slice(0, -1)}');`), 'zkrácené tajemství');
        denied(asAnon(WED, 9, `select push_mark('spatne', array['x']::text[]);`), 'push_mark se špatným tajemstvím');
        denied(as(id(1), WED, `select push_check_secret('${SECRET}');`), 'interní funkce není pro hráče');
        assert.deepEqual(dueRows(WED, 9), [], 'zatím není co posílat');
    });

    let tid; let myMatch;
    await t.test('turnaj: v den kola dostane připomínku jen hráč, který kolo ještě nezačal; ráno i večer, ne dvakrát za část dne', () => {
        tick(WED);
        tid = q(`select id from tournaments where status = 'open'`);
        for (let n = 1; n <= 8; n++) ok(as(id(n), WED, `select tournament_join('${tid}');`));
        // den před startem nic
        assert.deepEqual(dueRows('2026-11-08', 9), []);
        // pondělí: push_due turnaj sám spustí (volá tick) a vrátí zápas dne hráči 1 (odběr 1) i hráči 2 (odběr 3)
        const morning = dueRows(MON, 9);
        assert.equal(q(`select status from tournaments where id = '${tid}'`), 'running', 'push_due posune turnaje');
        const mine = morning.filter(row => row.user === id(1));
        assert.equal(mine.length, 1, JSON.stringify(morning));
        assert.equal(mine[0].endpoint, endpointOf(1));
        assert.equal(mine[0].kind, 'tournament');
        assert.equal(mine[0].title, 'Turnaj: dnes hraješ čtvrtfinále');
        assert.match(mine[0].body, /^Soupeř: Hráč \d+\. Kolo musíš odehrát do půlnoci\.$/);
        assert.equal(mine[0].url, './?tab=multi');
        myMatch = q(`select id from tournament_matches where tournament_id = '${tid}' and '${id(1)}' in (p1, p2)`);
        assert.equal(mine[0].key, `tour:${myMatch}:${id(1)}:${MON}:rano`);
        assert.equal(morning.filter(row => row.user === id(2)).length, 1);
        assert.equal(morning.length, 2, 'hráči bez odběru nic nedostanou');
        // stejný běh znovu před zápisem: stejné řádky (nic se neztratí); po zápisu už ne
        assert.equal(dueRows(MON, 10).length, 2);
        mark(morning.map(row => row.key), { okEndpoints: morning.map(row => row.endpoint) });
        assert.deepEqual(dueRows(MON, 10), [], 'odeslané se neopakuje');
        assert.equal(q(`select count(*) from push_sent where kind = 'tournament' and user_id = '${id(1)}'`), '1');
        assert.ok(q(`select last_ok is not null and fails = 0 from push_subscriptions where endpoint = '${endpointOf(1)}'`) === 't');
        // večer znovu (jiná část dne), ale hodinový limit: poslední turnajová zpráva je „před chvílí“ → nejdřív nic
        assert.deepEqual(dueRows(MON, 18), []);
        q(`update push_sent set sent_at = sent_at - interval '2 hours'`);
        const evening = dueRows(MON, 18);
        assert.equal(evening.length, 2);
        assert.equal(evening.find(row => row.user === id(1)).key, `tour:${myMatch}:${id(1)}:${MON}:vecer`);
        // hráč 1 zápas začne (i nedohraný): připomínka už není; hráč 2 ji má dál
        ok(as(id(1), MON, `select tournament_start_match('${myMatch}');`));
        const after = dueRows(MON, 18);
        assert.equal(after.filter(row => row.user === id(1)).length, 0);
        assert.equal(after.filter(row => row.user === id(2)).length, 1);
        // hráč 2 vypne turnajová upozornění
        ok(as(id(2), MON, `update profiles set push_tournament = false where id = '${id(2)}';`));
        assert.deepEqual(dueRows(MON, 18), []);
        ok(as(id(2), MON, `update profiles set push_tournament = true where id = '${id(2)}';`));
        // jiný den: zápas dne není (další kolo ještě nevzniklo, dnešní kolo je po termínu a rozhodne se)
        q(`delete from push_sent`);
        ok(as(id(1), MON, finishMatchSql(myMatch, 7, 20)));
        const tuesday = dueRows(TUE, 9);
        assert.ok(tuesday.every(row => row.kind !== 'tournament' || row.key.includes(`:${TUE}:`)), JSON.stringify(tuesday));
    });

    await t.test('zprávy o turnaji: nepřečtená zpráva se pošle jednou, přečtená ne', () => {
        q(`delete from push_sent`);
        // po úterním ticku jsou kontumace: soupeř hráče 1 (neodehrál) má zprávu eliminated_noplay; bez odběru se nepošle, s odběrem jednou
        const opp = q(`select case when p1 = '${id(1)}' then p2 else p1 end from tournament_matches where id = '${myMatch}'`);
        assert.equal(q(`select count(*) from tournament_notices where user_id = '${opp}' and kind = 'eliminated_noplay'`), '1');
        // (soupeř může být náhodou hráč 2, který odběr už má; proto se sleduje jen nové zařízení 7)
        q(`delete from push_subscriptions where user_id = '${opp}'`);
        assert.equal(dueRows(TUE, 9).filter(row => row.user === opp).length, 0, 'bez odběru nic');
        ok(as(opp, TUE, `select push_subscribe('${endpointOf(7)}', '${P256DH}', '${AUTH}');`));
        const rows = dueRows(TUE, 9).filter(row => row.kind === 'notice');
        const his = rows.filter(row => row.endpoint === endpointOf(7));
        assert.equal(his.length, 1, JSON.stringify(rows));
        assert.equal(his[0].title, 'Vypadl jsi z turnaje');
        assert.match(his[0].body, /kontumačně/);
        const noticeId = q(`select id from tournament_notices where user_id = '${opp}' and kind = 'eliminated_noplay'`);
        assert.equal(his[0].key, `notice:${noticeId}:${opp}`);
        mark([his[0].key], { okEndpoints: [his[0].endpoint] });
        assert.equal(dueRows(TUE, 9).filter(row => row.endpoint === endpointOf(7)).length, 0);
        // další zpráva (ručně) se pošle až po hodině od poslední téhož druhu; přečtená vůbec ne
        q(`insert into tournament_notices (user_id, tournament_id, kind, detail) values ('${opp}', '${tid}', 'result', '3')`);
        assert.equal(dueRows(TUE, 9).filter(row => row.endpoint === endpointOf(7)).length, 0, 'hodinový limit');
        q(`update push_sent set sent_at = sent_at - interval '2 hours'`);
        const result = dueRows(TUE, 9).filter(row => row.endpoint === endpointOf(7));
        assert.equal(result.length, 1);
        assert.equal(result[0].title, 'Turnaj skončil');
        assert.equal(result[0].body, 'Skončil jsi na 3. místě. Gratulace!');
        ok(as(opp, TUE, `select tournament_notices_seen(array(select id from tournament_notices));`));
        assert.equal(dueRows(TUE, 9).filter(row => row.endpoint === endpointOf(7)).length, 0, 'přečtené se neposílá');
        // neznámý druh zprávy a stará zpráva se přeskočí
        q(`insert into tournament_notices (user_id, tournament_id, kind, detail) values ('${opp}', '${tid}', 'neznamy', 'x')`);
        q(`insert into tournament_notices (user_id, tournament_id, kind, detail, created_at) values ('${opp}', '${tid}', 'result', '2', now() - interval '8 days')`);
        assert.equal(dueRows(TUE, 9).filter(row => row.endpoint === endpointOf(7)).length, 0);
        q(`delete from push_subscriptions where endpoint = '${endpointOf(7)}'`);
        q(`delete from push_sent`);
    });

    await t.test('výzvy: příchozí výzva bez výsledku do 3 dnů, jedna za hodinu, vypnutelná', () => {
        q(`delete from push_sent`);
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('ABCDE2', '${id(3)}', '${id(1)}', 'zemepis', 'seed1', 5)`);
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('ABCDE3', '${id(3)}', '${id(1)}', 'mix', 'seed2', 10)`);
        // Čas založení relativně k teď: upozornění se posílá jen 3 dny od založení (pevné datum by test za pár dní rozbilo)
        q(`update challenges set created_at = now() - interval '2 hours' + (case id when 'ABCDE2' then interval '0' else interval '1 minute' end)`);
        // výzva pro kohokoli (bez invited_id) a stará výzva se neposílají
        q(`insert into challenges (id, creator_id, topic, seed, count) values ('ABCDE4', '${id(3)}', 'mix', 'seed3', 10)`);
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('ABCDE5', '${id(3)}', '${id(1)}', 'mix', 'seed4', 10)`);
        q(`update challenges set created_at = now() - interval '4 days' where id = 'ABCDE5'`); // (čas zakládání určuje trigger, proto až dodatečně)
        const rows = dueRows(TUE, 9).filter(row => row.kind === 'challenge');
        assert.equal(rows.length, 1, 'z každého druhu jen jedna věc na hráče a běh');
        assert.equal(rows[0].user, id(1));
        assert.equal(rows[0].title, 'Hráč 3 tě vyzývá');
        assert.equal(rows[0].body, 'Výzva na 5 otázek čeká v aplikaci. Zahraj si ji, než vyprší.');
        assert.equal(rows[0].key, `chal:ABCDE2:${id(1)}`);
        assert.equal(rows[0].url, './?tab=multi&vyzva=ABCDE2', 'klepnutí otevře rovnou výzvu');
        mark([rows[0].key], { okEndpoints: [rows[0].endpoint] });
        assert.equal(dueRows(TUE, 9).filter(row => row.kind === 'challenge').length, 0, 'druhá výzva počká hodinu');
        q(`update push_sent set sent_at = sent_at - interval '2 hours'`);
        const second = dueRows(TUE, 9).filter(row => row.kind === 'challenge');
        assert.equal(second.length, 1);
        assert.equal(second[0].key, `chal:ABCDE3:${id(1)}`);
        // vyzvaný výzvu odehraje: už se nepřipomíná
        ok(as(id(1), TUE, `${challengeProgressSql('ABCDE3', 10, 5, 10)} insert into challenge_results (challenge_id, user_id, correct, points) values ('ABCDE3', '${id(1)}', 5, 10);`));
        assert.equal(dueRows(TUE, 9).filter(row => row.kind === 'challenge').length, 0);
        q(`delete from challenge_results where challenge_id = 'ABCDE3'; delete from challenge_progress where challenge_id = 'ABCDE3'`);
        ok(as(id(1), TUE, `update profiles set push_challenge = false where id = '${id(1)}';`));
        assert.equal(dueRows(TUE, 9).filter(row => row.kind === 'challenge').length, 0, 'vypnuté výzvy');
        ok(as(id(1), TUE, `update profiles set push_challenge = true where id = '${id(1)}';`));
        assert.equal(dueRows(TUE, 9).filter(row => row.kind === 'challenge').length, 1);
        q(`delete from push_sent`);
    });

    await t.test('výsledek výzvy: zakladatel se dozví, že vyzvaný odehrál; jednou, jen se souhlasem, ne u vlastní výzvy', () => {
        q(`delete from push_sent`);
        ok(as(id(3), TUE, `select push_subscribe('${endpointOf(33)}', '${P256DH}', '${AUTH}');`));
        const mine = () => dueRows(TUE, 9).filter(row => row.kind === 'challenge' && row.user === id(3));
        assert.equal(mine().length, 0, 'bez výsledku nic');
        ok(as(id(1), TUE, `${challengeProgressSql('ABCDE3', 10, 7, 20)} insert into challenge_results (challenge_id, user_id, correct, points) values ('ABCDE3', '${id(1)}', 7, 20);`));
        const rows = mine();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].title, 'Hráč 1 odehrál tvoji výzvu');
        // zakladatel výzvu ještě nedohrál: výsledek soupeře v upozornění není (mohl by podle něj taktizovat)
        assert.equal(rows[0].body, 'Jeho výsledek uvidíš, až výzvu dohraješ i ty.');
        assert.doesNotMatch(rows[0].body, /7/);
        assert.equal(rows[0].key, `chalr:ABCDE3:${id(3)}`);
        assert.equal(rows[0].url, './?tab=multi&vyzva=ABCDE3', 'klepnutí otevře výsledky výzvy');
        // výsledek zakladatele samotného nic nespouští; po jeho dohrání upozornění výsledek soupeře ukáže
        ok(as(id(3), TUE, `${challengeProgressSql('ABCDE3', 10, 4, 8)} insert into challenge_results (challenge_id, user_id, correct, points) values ('ABCDE3', '${id(3)}', 4, 8);`));
        assert.equal(mine().length, 1);
        assert.equal(mine()[0].body, 'Dal 7 z 10 správně. Podívej se, jak jsi na tom ty.');
        mark([rows[0].key], { okEndpoints: [rows[0].endpoint] });
        assert.equal(mine().length, 0, 'odeslané se neopakuje');
        assert.equal(q(`select kind from push_sent where dedupe_key = '${rows[0].key}'`), 'challenge');
        q(`delete from push_sent`);
        ok(as(id(3), TUE, `update profiles set push_challenge = false where id = '${id(3)}';`));
        assert.equal(mine().length, 0, 'vypnuté výzvy');
        ok(as(id(3), TUE, `update profiles set push_challenge = true where id = '${id(3)}';`));
        q(`delete from challenge_results where challenge_id = 'ABCDE3'; delete from challenge_progress where challenge_id = 'ABCDE3'; delete from push_subscriptions where endpoint = '${endpointOf(33)}'; delete from push_sent;`);
    });

    await t.test('push_mark: chyby se počítají, po třech odběr mizí, 404/410 maže hned, úspěch nuluje; staré push_sent se uklidí', () => {
        ok(as(id(1), TUE, `select push_subscribe('${endpointOf(5)}', '${P256DH}', '${AUTH}');`));
        mark(['chal:ABCDE3:' + id(1)], { failed: [endpointOf(5)] });
        assert.equal(q(`select fails from push_subscriptions where endpoint = '${endpointOf(5)}'`), '1');
        mark([], { okEndpoints: [endpointOf(5)] });
        assert.equal(q(`select fails from push_subscriptions where endpoint = '${endpointOf(5)}'`), '0');
        mark([], { failed: [endpointOf(5)] });
        mark([], { failed: [endpointOf(5)] });
        assert.equal(q(`select fails from push_subscriptions where endpoint = '${endpointOf(5)}'`), '2');
        assert.equal(dueRows(TUE, 9).filter(row => row.endpoint === endpointOf(5)).length, 1, 'se dvěma chybami se ještě posílá');
        assert.equal(last(mark([], { failed: [endpointOf(5)] })), '1', 'třetí chyba = smazání');
        assert.equal(q(`select count(*) from push_subscriptions where endpoint = '${endpointOf(5)}'`), '0');
        ok(as(id(1), TUE, `select push_subscribe('${endpointOf(6)}', '${P256DH}', '${AUTH}');`));
        assert.equal(last(mark([], { gone: [endpointOf(6)] })), '1');
        assert.equal(q(`select count(*) from push_subscriptions where endpoint = '${endpointOf(6)}'`), '0');
        // klíče: hráč a druh se vyčtou z klíče, nesmyslný klíč se zapíše bez nich, duplicitní nevadí
        mark(['notice:999:' + id(7), 'tour:x:y', 'notice:999:' + id(7)]);
        assert.equal(q(`select user_id || ' ' || kind from push_sent where dedupe_key = 'notice:999:${id(7)}'`), `${id(7)} notice`);
        assert.equal(q(`select user_id is null and kind = 'tournament' from push_sent where dedupe_key = 'tour:x:y'`), 't');
        q(`update push_sent set sent_at = now() - interval '15 days' where dedupe_key = 'tour:x:y'`);
        mark([]);
        assert.equal(q(`select count(*) from push_sent where dedupe_key = 'tour:x:y'`), '0', 'staré záznamy se uklidí');
        // cizí endpoint v failed/gone nic nerozbije (odesílatel má jen to, co mu push_due dalo)
        mark([], { gone: ['https://jiny.example.com/x'] });
    });

    await t.test('zneužití: hráč nevolá push_due/push_mark bez tajemství a nedostane se k cizím odběrům ani přes funkce', () => {
        denied(as(id(1), TUE, `select * from push_due('spatne');`));
        denied(as(id(1), TUE, `select push_mark('spatne', array[]::text[]);`));
        denied(as(id(1), TUE, `select push_day_part();`));
        denied(as(id(1), TUE, `select push_round_name(8, 1, false);`));
        denied(psql(dbName, `set role anon; insert into push_sent (dedupe_key) values ('x');`));
        denied(as(id(1), TUE, `insert into push_sent (dedupe_key) values ('x');`));
        assert.equal(last(ok(as(id(1), TUE, `with u as (update profiles set push_tournament = false where id = '${id(2)}' returning 1) select count(*) from u;`))), '0', 'cizí předvolby se nezmění');
        assert.equal(q(`select push_tournament from profiles where id = '${id(2)}'`), 't');
    });

    await t.test('zkušební upozornění (dev_push_test): jen dev_admins a jen pro sebe; zařadí se, push_due ho vrátí (i do hodiny po jiném), push_mark ho uzavře', () => {
        const ADMIN = id(9);
        const OTHER = id(10);
        const tests = () => dueRows(TUE, 9).filter(row => row.kind === 'test');
        q(`delete from push_sent`);
        // bez dev_admins nic: hráč, anon ani správce bez odběru (0 = nic se nezařadilo)
        denied(as(OTHER, TUE, `select dev_push_test();`), 'hráč mimo dev_admins');
        denied(psql(dbName, `set role anon; select dev_push_test();`), 'anon');
        q(`insert into dev_admins (user_id) values ('${ADMIN}') on conflict do nothing`);
        assert.equal(last(ok(as(ADMIN, TUE, `select dev_push_test();`))), '0', 'bez odběru se nic nezařadí');
        assert.equal(q(`select count(*) from push_tests`), '0');
        // s odběrem: zařadí se jedna žádost, vrací počet zařízení
        ok(as(ADMIN, TUE, `select push_subscribe('${endpointOf(90)}', '${P256DH}', '${AUTH}');`));
        ok(as(ADMIN, TUE, `select push_subscribe('${endpointOf(91)}', '${P256DH}', '${AUTH}');`));
        ok(as(OTHER, TUE, `select push_subscribe('${endpointOf(92)}', '${P256DH}', '${AUTH}');`));
        assert.equal(last(ok(as(ADMIN, TUE, `select dev_push_test();`))), '2');
        assert.equal(q(`select count(*) from push_tests where user_id = '${ADMIN}'`), '1');
        // tabulka žádostí ani pomocná funkce klíče nejsou přes API dostupné (ani správci)
        denied(as(ADMIN, TUE, `select * from push_tests;`), 'hráč nečte žádosti');
        denied(as(OTHER, TUE, `insert into push_tests (user_id) values ('${OTHER}');`), 'hráč si žádost nezapíše');
        denied(psql(dbName, `set role anon; select * from push_tests;`), 'anon nečte žádosti');
        denied(as(ADMIN, TUE, `select push_test_key('${ADMIN}', now());`), 'pomocná funkce není pro hráče');
        // push_due vrátí zkušební zprávu pro obě zařízení správce, nikomu jinému; bez předvoleb (vypnuté turnaje i výzvy nevadí)
        ok(as(ADMIN, TUE, `update profiles set push_tournament = false, push_challenge = false where id = '${ADMIN}';`));
        const rows = tests();
        assert.deepEqual(rows.map(row => row.endpoint).sort(), [endpointOf(90), endpointOf(91)]);
        assert.ok(rows.every(row => row.user === ADMIN && row.title === 'Zkušební upozornění Mudrlanta' && row.url === './?tab=multi'), JSON.stringify(rows));
        assert.equal(rows[0].body, 'Funguje to! Klepni sem a otevře se záložka Více hráčů.');
        assert.match(rows[0].key, new RegExp(`^test:\\d+:${ADMIN}$`));
        assert.equal(rows[0].key, rows[1].key);
        // druhá žádost před odesláním žádost jen obnoví (pořád jedna, nový klíč); starý klíč ji neuzavře
        ok(as(ADMIN, TUE, `select dev_push_test();`));
        assert.equal(q(`select count(*) from push_tests`), '1');
        const fresh = tests();
        assert.notEqual(fresh[0].key, rows[0].key);
        mark([rows[0].key], { okEndpoints: [endpointOf(90)] });
        assert.equal(q(`select count(*) from push_tests`), '1', 'starý klíč novější žádost neuzavře');
        // odeslání a push_mark: žádost je vyřízená, v push_sent je druh test a hráč; znovu se neposílá
        mark([fresh[0].key], { okEndpoints: fresh.map(row => row.endpoint) });
        assert.equal(q(`select count(*) from push_tests`), '0');
        assert.equal(q(`select kind || ' ' || user_id from push_sent where dedupe_key = '${fresh[0].key}'`), `test ${ADMIN}`);
        assert.deepEqual(tests(), []);
        // nová zkouška hned po odeslané projde (hodinový limit pro zkoušky neplatí)
        ok(as(ADMIN, TUE, `select dev_push_test();`));
        assert.equal(tests().length, 2);
        // nevyřízená žádost starší než den se neposílá a push_mark ji uklidí; nedoručená (žádný úspěch) zůstává čekat
        mark([], { failed: [endpointOf(90)] });
        assert.equal(q(`select count(*) from push_tests`), '1', 'bez doručení žádost čeká na další běh');
        q(`update push_tests set requested_at = now() - interval '25 hours'`);
        assert.deepEqual(tests(), []);
        mark([]);
        assert.equal(q(`select count(*) from push_tests`), '0');
        // smazání účtu (profilu) smaže i jeho žádost
        ok(as(ADMIN, TUE, `select dev_push_test();`));
        assert.equal(q(`select count(*) from push_tests`), '1');
        assert.equal(q(`select count(*) from information_schema.table_constraints where table_name = 'push_tests' and constraint_type = 'FOREIGN KEY'`), '1');
        q(`delete from push_tests; delete from push_sent; delete from push_subscriptions where user_id in ('${ADMIN}', '${OTHER}'); delete from dev_admins where user_id = '${ADMIN}';`);
    });

    await t.test('Dobývání (blok 23): útok soupeře = jedno souhrnné upozornění oběti; nejzávažnější událost v nadpisu; ne útočníkovi ani botovi; vypnutelné; dedupe a 10 minut', () => {
        const [VICTIM, ATTACKER, BOT] = [id(11), id(12), '00000000-0000-4000-8000-0000000000b1'];
        q(`insert into auth.users (id, email, raw_user_meta_data) values ('${BOT}', 'bot-${BOT}@bots.invalid', '{"full_name": "Bot Adam"}')`);
        q(`delete from push_sent`);
        const conquest = () => dueRows(TUE, 9).filter(row => row.kind === 'conquest');
        const play = (uid, sql) => { const r = ok(as(uid, TUE, sql)); return JSON.parse(last(r)); };
        const attack = (uid, game, target, correct, source) => play(uid, `select conquest_move('${game}', '${target}', 'attack', ${correct}, '${source}');`).move;
        // Hra tří hráčů (oběť, útočník, bot): plná hra začne sama
        const game = play(VICTIM, `select conquest_create('evropa', 3, 72, 'day', 10, 'private', 'cervena', 'lev');`);
        play(ATTACKER, `select conquest_join(null, '${game.code}', 'modra', 'orel');`);
        play(BOT, `select conquest_join(null, '${game.code}', 'zelena', 'vlk');`);
        assert.equal(q(`select status from conquest_games where id = '${game.id}'`), 'running');
        q(`update conquest_territories set owner = null, level = 0, home = false, treasure = false where game_id = '${game.id}';
           update conquest_territories set owner = '${VICTIM}', home = (territory = 'Q213'), level = case territory when 'Q213' then 2 else 0 end where game_id = '${game.id}' and territory in ('Q213', 'Q214', 'Q40');
           update conquest_territories set owner = '${ATTACKER}', home = true where game_id = '${game.id}' and territory = 'Q36';
           update conquest_territories set owner = '${BOT}', home = true where game_id = '${game.id}' and territory = 'Q183';`);
        for (const [uid, n] of [[VICTIM, 60], [ATTACKER, 61], [BOT, 62]]) ok(as(uid, TUE, `select push_subscribe('${endpointOf(n)}', '${P256DH}', '${AUTH}');`));
        assert.deepEqual(conquest(), [], 'bez útoku nic');
        // Útočník dobude Slovensko (sousedí s Českem oběti): upozornění jen oběti, s odkazem do hry
        const first = attack(ATTACKER, game.id, 'Q214', true, 'Q36');
        assert.equal(first.r, 'capture');
        let rows = conquest();
        assert.equal(rows.length, 1, JSON.stringify(rows));
        assert.deepEqual([rows[0].user, rows[0].endpoint], [VICTIM, endpointOf(60)]);
        assert.equal(rows[0].title, 'Dobývání: jedno tvé území padlo');
        assert.equal(rows[0].body, 'Útočník: Hráč 12. Území sousedí s tvými, můžeš ho dobýt zpět.');
        assert.equal(rows[0].url, `./?dobyvani=${game.code}`);
        assert.equal(rows[0].key, `cq:${game.id}:${VICTIM}:${first.id}`);
        // Vlastní tahy oběti (opevnění) nic nespustí; vypnutá upozornění z Dobývání nic, ostatní druhy zůstanou zapnuté
        play(VICTIM, `select conquest_move('${game.id}', 'Q40', 'fortify', true);`);
        assert.equal(conquest().length, 1);
        ok(as(VICTIM, TUE, `update profiles set push_conquest = false where id = '${VICTIM}';`));
        assert.deepEqual(conquest(), [], 'vypnuté Dobývání');
        assert.equal(q(`select push_tournament and push_challenge from profiles where id = '${VICTIM}'`), 't');
        ok(as(VICTIM, TUE, `update profiles set push_conquest = true where id = '${VICTIM}';`));
        // Odesláno: push_mark zapíše druh conquest a oběť; tentýž útok se neopakuje
        mark([rows[0].key], { okEndpoints: [rows[0].endpoint] });
        assert.equal(q(`select kind || ' ' || user_id from push_sent where dedupe_key = '${rows[0].key}'`), `conquest ${VICTIM}`);
        assert.deepEqual(conquest(), [], 'odeslané se neopakuje');
        // Bot pobourá hradbu domova oběti: nové upozornění až 10 minut po posledním (ne 55), bez dřívějšího dobytí
        const breach = attack(BOT, game.id, 'Q213', true, 'Q183');
        assert.deepEqual([breach.r, breach.l], ['breach', 1]);
        assert.deepEqual(conquest(), [], 'do 10 minut nic');
        q(`update push_sent set sent_at = sent_at - interval '11 minutes'`);
        rows = conquest();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].title, 'Dobývání: tvoje hradba je pobořená');
        assert.equal(rows[0].body, 'Útočník: Bot Adam. Zbývá palisáda, opevni se znovu.');
        assert.equal(rows[0].key, `cq:${game.id}:${VICTIM}:${breach.id}`);
        // Víc útoků do odeslání: nadpis podle nejzávažnějšího (padlý domov), počet dalších útoků, útočník padlého domova
        const repelled = attack(ATTACKER, game.id, 'Q213', false, 'Q36');
        assert.equal(repelled.r, 'fail');
        attack(BOT, game.id, 'Q213', true, 'Q183');
        const home = attack(ATTACKER, game.id, 'Q213', true, 'Q36');
        assert.deepEqual([home.r, home.h], ['capture', true]);
        rows = conquest();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].title, 'Dobývání: padl tvůj domovský hrad (+3 další útoky)');
        assert.equal(rows[0].body, 'Útočník: Hráč 12. V dalším období máš o tah méně. Opevni se, nebo vrať úder.');
        assert.equal(rows[0].key, `cq:${game.id}:${VICTIM}:${home.id}`);
        assert.equal(rows.filter(row => row.user !== VICTIM).length, 0, 'útočník ani bot nic');
        mark([rows[0].key], { okEndpoints: [rows[0].endpoint] });
        q(`update push_sent set sent_at = sent_at - interval '11 minutes'`);
        assert.deepEqual(conquest(), []);
        // Útok na bota (i s odběrem) botovi upozornění nepošle
        attack(ATTACKER, game.id, 'Q183', true, 'Q36');
        assert.deepEqual(conquest(), [], 'bot nedostane nic');
        // Rakousko oběti má palisádu: pobourání (poslední úroveň), pak dobytí posledního území – nové domovské území přijde v dalším období
        assert.equal(attack(ATTACKER, game.id, 'Q40', true, 'Q213').r, 'breach');
        rows = conquest();
        assert.deepEqual([rows[0].title, rows[0].body], ['Dobývání: tvoje palisáda je pobořená', 'Útočník: Hráč 12. Další úspěšný útok území dobude, opevni se.']);
        assert.equal(attack(ATTACKER, game.id, 'Q40', true, 'Q213').r, 'capture');
        rows = conquest();
        assert.equal(rows.length, 1);
        assert.deepEqual([rows[0].title, rows[0].body], ['Dobývání: jedno tvé území padlo (+1 další útok)', 'Útočník: Hráč 12. V dalším období dostaneš nové domovské území.']);
        // Staré útoky (ve hře s obdobím den přes 12 hodin, s obdobím hodina přes 2 hodiny) a dohraná hra nic
        q(`update conquest_moves set at = now() - interval '13 hours' where game_id = '${game.id}'`);
        assert.deepEqual(conquest(), [], 'starší než 12 hodin');
        q(`update conquest_moves set at = now() - interval '3 hours' where game_id = '${game.id}'`);
        assert.equal(conquest().length, 1, 'hra na dny: 3 hodiny staré útoky platí');
        q(`update conquest_games set period = 'hour' where id = '${game.id}'`);
        assert.deepEqual(conquest(), [], 'hra na hodiny: 3 hodiny staré útoky ne');
        q(`update conquest_games set period = 'day', status = 'finished' where id = '${game.id}'`);
        assert.deepEqual(conquest(), [], 'dohraná hra');
        // Počet dalších útoků česky
        assert.deepEqual(q(`select string_agg(conquest_push_more(n), '|' order by n) from unnest(array[0, 1, 2, 4, 5, 21]) n`).split('|'),
            ['', ' (+1 další útok)', ' (+2 další útoky)', ' (+4 další útoky)', ' (+5 dalších útoků)', ' (+21 dalších útoků)']);
        denied(as(VICTIM, TUE, `select * from conquest_push_items();`), 'pomocná funkce není pro hráče');
        q(`delete from push_sent; delete from push_subscriptions where user_id in ('${VICTIM}', '${ATTACKER}', '${BOT}');`);
    });
});
