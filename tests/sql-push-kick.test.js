// Okamžité odesílání upozornění v databázi (PostgreSQL 16): push_kick() bez tokenu a bez pg_net nic nedělá, s pg_net (atrapa net.http_post,
// která jen zapisuje volání) spustí workflow na GitHubu jen tehdy, když by push_due teď něco vrátilo (stejná pravidla, v nočním klidu jen
// zkoušky jako ruční běh v scripts/send-push.mjs), a nikdy se nezacyklí: 3 minuty mezi spuštěními, nejvýš 12 za hodinu, delší odstupy, když
// čekají pořád tytéž zprávy. dev_push_status() (jen dev_admins) řekne, jestli je okamžité odesílání nastavené (atrapa cron.job).
// push_kick, push_kick_state a app_secrets nejsou přes API dostupné. Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_kick_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };

const TUE = '2026-11-10';
const DAY = 10;    // 10:00 Praha
const NIGHT = 23;  // 23:00 Praha (noční klid)
const SECRET = 'tajne-heslo-pro-cron-1234567890';
// Zástupný token (skutečný token v repozitáři být nesmí): tvar jako token GitHubu, jen písmena, číslice a podtržítka
const TOKEN = 'SEM_VLOZ_TOKEN_pro_testy_0000000000';
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const endpointOf = (n) => `https://push.example.com/send/${n}`;
const ADMIN = id(1);
const PLAYER = id(2);
const CREATOR = id(3);

// Jako pg_cron (vlastník databáze) v daný den a hodinu (Praha)
const kick = (hour = DAY) => last(ok(psql(dbName, `set mudrlant.test_today = '${TUE}'; set mudrlant.test_hour = '${hour}'; select push_kick();`)));
// Co by teď vrátilo push_due (odesílač se hlásí jako anon s tajemstvím)
const due = (hour = DAY) => {
    const text = ok(psql(dbName, `set mudrlant.test_today = '${TUE}'; set mudrlant.test_hour = '${hour}'; set role anon; select kind || '|' || dedupe_key || '|' || endpoint from push_due('${SECRET}');`)).stdout.trim();
    return text ? text.split('\n').filter(line => line.includes('|')).map(line => { const [kind, key, endpoint] = line.split('|'); return { kind, key, endpoint }; }) : [];
};
const calls = () => Number(q('select count(*) from net.calls'));
const state = () => JSON.parse(q(`select coalesce((select row_to_json(k) from push_kick_state k), '{}'::json)`));
// Posun stavu do minulosti: poslední spuštění před `lastAgo` minutami, spuštění za poslední hodinu před `recentAgo` minutami
const setState = ({ lastAgo = null, recentAgo = null, retries = null } = {}) => {
    const sets = [];
    if (lastAgo !== null) sets.push(`last_at = now() - interval '${lastAgo} minutes'`);
    if (recentAgo !== null) sets.push(`recent = array[${recentAgo.map(m => `now() - interval '${m} minutes'`).join(', ')}]::timestamptz[]`);
    if (retries !== null) sets.push(`retries = ${retries}`);
    q(`update push_kick_state set ${sets.join(', ')}`);
};
const resetKick = () => q('delete from push_kick_state; delete from net.calls;');
const as = (uid, sql) => psql(dbName, `set mudrlant.test_today = '${TUE}'; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${sql}`);
const status = (uid = ADMIN) => JSON.parse(last(ok(as(uid, 'select dev_push_status();'))));
const subscribe = (uid, n) => ok(as(uid, `select push_subscribe('${endpointOf(n)}', '${P256DH}', '${AUTH}');`));
const markAll = (rows) => ok(psql(dbName, `set role anon; select push_mark('${SECRET}', array[${rows.map(r => `'${r.key}'`).join(',') || "''"}]::text[], array[${rows.map(r => `'${r.endpoint}'`).join(',') || "''"}]::text[]);`));

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

// Atrapa pg_net: stejný podpis jako net.http_post, volání se jen zapíše; net._http_response jako v pg_net (odpověď GitHubu)
const netStub = `
create schema net;
create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb, timeout_milliseconds integer, by_user text default current_user);
create table net._http_response (id bigint, status_code integer, content text, timed_out boolean, error_msg text, created timestamptz default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $f$ insert into net.calls (url, body, headers, timeout_milliseconds) values (url, body, headers, timeout_milliseconds) returning id $f$;`;
// Atrapa pg_cron: tabulka cron.job se stejnými sloupci, jaké čte dev_push_status
const cronStub = `
create schema cron;
create table cron.job (jobid bigserial primary key, schedule text, command text, nodename text default 'localhost', database text default current_database(), username text default current_user, active boolean default true, jobname text);`;

test('SQL: okamžité odesílání upozornění (push_kick, dev_push_status)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) { const r = psql(dbName, '', schema); assert.equal(r.status, 0, `schema.sql běh ${run + 1}: ${r.stderr}`); }
    q([ADMIN, PLAYER, CREATOR, id(4)].map((uid, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    q(`insert into dev_admins (user_id) values ('${ADMIN}')`);
    q(`insert into app_secrets (name, value) values ('push_cron', '${SECRET}')`);
    subscribe(ADMIN, 1);
    subscribe(PLAYER, 2);
    const { planRun } = await import('../scripts/send-push.mjs');

    await t.test('bez tokenu: push_kick vrátí no-token a nic neudělá (ani neposune turnaje, nezaloží stav)', () => {
        ok(as(ADMIN, 'select dev_push_test();'));
        const tournaments = q('select count(*) from tournaments');
        assert.equal(kick(), 'no-token');
        assert.equal(q('select count(*) from push_kick_state'), '0');
        assert.equal(q('select count(*) from tournaments'), tournaments, 'bez tokenu se turnaje neposouvají');
        assert.equal(q(`select count(*) from pg_namespace where nspname = 'net'`), '0', 'testovací databáze nemá pg_net');
        assert.deepEqual(status(), { instant: false, token: false, pg_net: false, cron: false, github: null, last_dispatch: null, last_check: null, last_status: null });
    });

    await t.test('token bez pg_net: krátký stav bez chyby; špatný tvar tokenu nebo repozitáře se pozná', () => {
        denied(psql(dbName, `insert into app_secrets (name, value) values ('github_token', 'SEM_VLOZ_TOKEN');`), 'zástupný text z návodu (příliš krátký) se neuloží');
        q(`insert into app_secrets (name, value) values ('github_token', 'token s mezerou uprostred') on conflict (name) do update set value = excluded.value`);
        assert.equal(kick(), 'bad-token');
        q(`update app_secrets set value = '  ${TOKEN}  ' where name = 'github_token'`);
        assert.equal(kick(), 'no-pg_net', 'mezery okolo tokenu (kopírování) nevadí');
        assert.equal(q('select count(*) from push_kick_state'), '0');
        // repozitář: výchozí taronwho/geografie-kviz; vlastní jen ve tvaru vlastník/repozitář (krátký název je výjimka z minimální délky)
        q(`insert into app_secrets (name, value) values ('github_repo', 'spatny repozitar bez lomitka')`);
        assert.equal(kick(), 'bad-repo');
        q(`update app_secrets set value = 'jan/kviz' where name = 'github_repo'`);
        assert.equal(kick(), 'no-pg_net');
        denied(psql(dbName, `insert into app_secrets (name, value) values ('jine', 'jan/kviz');`), 'výjimka z délky platí jen pro github_repo');
        const s = status();
        assert.equal(s.token, true);
        assert.equal(s.pg_net, false);
        assert.equal(s.instant, false);
        q(`delete from app_secrets where name = 'github_repo'`);
    });

    await t.test('přes API nic: anon ani hráč nespustí push_kick ani pomocné funkce a nepřečtou stav, tajemství ani token', () => {
        for (const [who, run] of [['anon', (sql) => psql(dbName, `set role anon; ${sql}`)], ['hráč', (sql) => as(PLAYER, sql)], ['správce', (sql) => as(ADMIN, sql)]]) {
            denied(run('select push_kick();'), `${who}: push_kick`);
            denied(run('select * from push_pending();'), `${who}: push_pending`);
            denied(run('select push_quiet_now();'), `${who}: push_quiet_now`);
            denied(run('select push_net_ready();'), `${who}: push_net_ready`);
            denied(run('select * from push_kick_state;'), `${who}: čtení stavu`);
            denied(run('insert into push_kick_state (id) values (true);'), `${who}: zápis stavu`);
            denied(run('update push_kick_state set retries = 0;'), `${who}: změna stavu`);
            denied(run('select * from app_secrets;'), `${who}: čtení tajemství`);
            denied(run(`update app_secrets set value = 'x' where name = 'github_token';`), `${who}: změna tokenu`);
            denied(run(`insert into app_secrets (name, value) values ('github_repo', 'utocnik/repozitar');`), `${who}: podvržený repozitář`);
        }
        assert.equal(q(`select count(*) from information_schema.role_table_grants where table_name in ('push_kick_state', 'app_secrets') and grantee in ('anon', 'authenticated', 'PUBLIC')`), '0');
        for (const fn of ['push_kick()', 'push_pending()', 'push_quiet_now()', 'push_net_ready()']) {
            for (const role of ['anon', 'authenticated', 'public']) assert.equal(q(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`), 'f', `${role} ${fn}`);
        }
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.push_kick_state'::regclass`), 't', 'RLS zapnuté');
        // stav smí číst jen správce
        denied(psql(dbName, 'set role anon; select dev_push_status();'), 'anon: stav');
        denied(as(PLAYER, 'select dev_push_status();'), 'hráč mimo dev_admins: stav');
        assert.doesNotMatch(last(ok(as(ADMIN, 'select dev_push_status();'))), /SEM_VLOZ|token_hash|Bearer/, 'stav neukazuje token');
    });

    q(netStub);

    await t.test('s pg_net: co čeká, pozná stejně jako push_due (předvolby, hodinový limit, odběry, noční klid jako ruční běh)', () => {
        const night = planRun({ now: new Date('2026-11-10T22:30:00Z'), manual: true });
        const day = planRun({ now: new Date('2026-11-10T09:00:00Z'), manual: true });
        assert.deepEqual(night.kinds, ['test'], 'ruční běh v noci pošle jen zkoušky');
        assert.equal(day.kinds, null);
        // push_kick spustí workflow právě tehdy, když by ručně spuštěný běh teď něco poslal
        const expectKick = (hour, label) => {
            const plan = hour >= 21 || hour < 7 ? night : day;
            const rows = due(hour).filter(row => !plan.kinds || plan.kinds.includes(row.kind));
            resetKick();
            const outcome = kick(hour);
            assert.equal(outcome, rows.length ? 'dispatched' : 'nothing', `${label}: push_due ${JSON.stringify(rows)}`);
            assert.equal(calls(), rows.length ? 1 : 0, label);
            return rows;
        };
        // zkouška z vývojářského režimu (zařazená v prvním testu) přijde ve dne i v noci
        assert.equal(expectKick(DAY, 'zkouška ve dne').length, 1);
        assert.equal(expectKick(NIGHT, 'zkouška v noci').length, 1);
        assert.ok(Number(q('select count(*) from tournaments')) >= 1, 'push_kick posouvá turnaje jako push_due');
        markAll(due(DAY));
        assert.equal(expectKick(DAY, 'odeslaná zkouška už nečeká').length, 0);
        // příchozí výzva: ve dne ano, v noci ne (ruční běh by ji v noci neposlal), s vypnutými výzvami ne
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('KICK01', '${CREATOR}', '${PLAYER}', 'mix', 'seed1', 10)`);
        assert.equal(expectKick(DAY, 'výzva ve dne').length, 1);
        assert.equal(expectKick(NIGHT, 'výzva v noci').length, 0);
        ok(as(PLAYER, `update profiles set push_challenge = false where id = '${PLAYER}';`));
        assert.equal(expectKick(DAY, 'vypnuté výzvy').length, 0);
        ok(as(PLAYER, `update profiles set push_challenge = true where id = '${PLAYER}';`));
        // odeslaná výzva a hned další: hodinový limit téhož druhu platí i pro push_kick
        markAll(due(DAY));
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('KICK02', '${CREATOR}', '${PLAYER}', 'mix', 'seed2', 10)`);
        assert.equal(expectKick(DAY, 'hodinový limit').length, 0);
        q(`update push_sent set sent_at = sent_at - interval '2 hours'`);
        assert.equal(expectKick(DAY, 'po hodině').length, 1);
        // hráč bez odběru nic nedostane, takže se nic nespouští; odběr se třemi chybami taky ne
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('KICK03', '${CREATOR}', '${id(4)}', 'mix', 'seed3', 10)`);
        q(`update push_subscriptions set fails = 3 where user_id = '${PLAYER}'`);
        assert.equal(expectKick(DAY, 'bez platného odběru').length, 0);
        q(`update push_subscriptions set fails = 0 where user_id = '${PLAYER}'`);
        markAll(due(DAY));
        assert.equal(expectKick(DAY, 'vše odeslané').length, 0);
    });

    await t.test('požadavek na GitHub: přesná adresa, tělo a hlavičky; běží pod vlastníkem databáze', () => {
        resetKick();
        ok(as(ADMIN, 'select dev_push_test();'));
        assert.equal(kick(), 'dispatched');
        const call = JSON.parse(q('select row_to_json(c) from net.calls c'));
        assert.equal(call.url, 'https://api.github.com/repos/taronwho/geografie-kviz/actions/workflows/push.yml/dispatches');
        assert.deepEqual(call.body, { ref: 'main', inputs: { dry_run: 'false' } });
        assert.deepEqual(call.headers, {
            Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'mudrlant-push', 'Content-Type': 'application/json'
        });
        assert.equal(call.timeout_milliseconds, 10000);
        assert.equal(call.by_user, 'postgres');
        const s = state();
        assert.equal(s.last_status, 'dispatched');
        assert.equal(s.request_id, call.id);
        assert.equal(s.recent.length, 1);
        assert.equal(s.pending.length, 1);
        assert.match(s.pending[0], /^[0-9a-f]{32}$/, 've stavu jsou jen otisky klíčů');
        // vlastní repozitář z app_secrets
        resetKick();
        q(`insert into app_secrets (name, value) values ('github_repo', 'jan/kviz')`);
        assert.equal(kick(), 'dispatched');
        assert.equal(q('select url from net.calls'), 'https://api.github.com/repos/jan/kviz/actions/workflows/push.yml/dispatches');
        q(`delete from app_secrets where name = 'github_repo'`);
    });

    await t.test('pojistky: 3 minuty mezi spuštěními, odstup 10/20/40/60 minut u týchž zpráv, nejvýš 12 za hodinu', () => {
        resetKick();
        // zkouška čeká (z minulého testu): první spuštění hned
        assert.equal(kick(), 'dispatched');
        // pořád tytéž zprávy (běh ještě nedoběhl nebo doručení selhalo): žádné další spuštění
        assert.equal(kick(), 'backoff');
        setState({ lastAgo: 4, recentAgo: [4] });
        assert.equal(kick(), 'backoff', 'tytéž zprávy po 4 minutách ještě ne');
        setState({ lastAgo: 11, recentAgo: [11] });
        assert.equal(kick(), 'dispatched', 'tytéž zprávy po 10 minutách znovu');
        assert.equal(state().retries, 1);
        setState({ lastAgo: 19, recentAgo: [30, 19] });
        assert.equal(kick(), 'backoff', 'druhý opakovaný pokus až po 20 minutách');
        setState({ lastAgo: 21, recentAgo: [30, 21] });
        assert.equal(kick(), 'dispatched');
        assert.equal(state().retries, 2);
        setState({ lastAgo: 39, recentAgo: [39] });
        assert.equal(kick(), 'backoff', 'třetí až po 40 minutách');
        setState({ lastAgo: 41, recentAgo: [41] });
        assert.equal(kick(), 'dispatched');
        setState({ lastAgo: 59, recentAgo: [59], retries: 7 });
        assert.equal(kick(), 'backoff', 'dál nejvýš jednou za hodinu');
        setState({ lastAgo: 61, recentAgo: [61] });
        assert.equal(kick(), 'dispatched');
        assert.equal(state().retries, 8);
        assert.equal(state().recent.length, 1, 'spuštění starší než hodina se nepočítají');
        // nová zpráva (další zkouška = nový klíč): stačí 3 minuty od posledního spuštění, opakované pokusy se vynulují
        ok(as(ADMIN, 'select dev_push_test();'));
        assert.equal(kick(), 'wait');
        setState({ lastAgo: 2, recentAgo: [2] });
        assert.equal(kick(), 'wait', 'ani nová zpráva dřív než po 3 minutách');
        setState({ lastAgo: 3.5, recentAgo: [3.5] });
        assert.equal(kick(), 'dispatched');
        assert.equal(state().retries, 0);
        // hodinový strop: po 12 spuštěních za poslední hodinu nic, ani kvůli nové zprávě
        const twelve = Array.from({ length: 12 }, (_, i) => 4 + i * 4);
        ok(as(ADMIN, 'select dev_push_test();'));
        setState({ lastAgo: 4, recentAgo: twelve });
        const before = calls();
        assert.equal(kick(), 'hour-limit');
        assert.equal(calls(), before);
        setState({ lastAgo: 4, recentAgo: twelve.slice(0, 11) });
        assert.equal(kick(), 'dispatched', 'jedenácté spuštění v hodině ještě projde');
        assert.equal(state().recent.length, 12);
        // doručeno (push_mark): fronta prázdná, stav se uklidí; opakované volání nic nespouští
        markAll(due(DAY));
        assert.equal(kick(), 'nothing');
        assert.deepEqual(state().pending, []);
        assert.equal(state().retries, 0);
        const quiet = calls();
        for (let i = 0; i < 5; i++) assert.equal(kick(), 'nothing');
        assert.equal(calls(), quiet, 'bez zpráv žádná volání');
        // zpráva, která v noci počkala (výzva), se ráno spustí hned, i když stejná čekala už večer
        resetKick();
        q(`insert into challenges (id, creator_id, invited_id, topic, seed, count) values ('KICK04', '${CREATOR}', '${PLAYER}', 'mix', 'seed4', 10)`);
        q(`update push_sent set sent_at = sent_at - interval '2 hours'`);
        assert.equal(kick(20), 'dispatched', 'večer ve 20 h');
        assert.equal(kick(NIGHT), 'nothing', 'v noci se nečeká na nic, co by ruční běh poslal');
        setState({ lastAgo: 9 * 60, recentAgo: [9 * 60] });
        assert.equal(kick(7), 'dispatched', 'ráno v 7 h');
        markAll(due(DAY));
    });

    await t.test('dev_push_status: okamžité odesílání je nastavené, až je token, pg_net i úloha pg_cron s push_kick; ukáže odmítnutí GitHubem', () => {
        let s = status();
        assert.equal(s.token, true);
        assert.equal(s.pg_net, true);
        assert.equal(s.cron, false, 'bez pg_cron');
        assert.equal(s.instant, false);
        assert.equal(s.last_status, 'dispatched', 'poslední spuštění (ráno v 7 h)');
        assert.ok(s.last_dispatch && s.last_check);
        q(cronStub);
        assert.equal(status().cron, false, 'pg_cron bez úlohy');
        q(`insert into cron.job (schedule, command, jobname, active) values ('* * * * *', 'select public.push_kick()', 'upozorneni', false)`);
        assert.equal(status().instant, false, 'vypnutá úloha');
        q(`update cron.job set active = true`);
        s = status();
        assert.equal(s.cron, true);
        assert.equal(s.instant, true);
        assert.equal(s.github, null, 'odpověď GitHubu zatím není');
        // odpověď na poslední spuštění: 204 = v pořádku, 401 = token neplatí; po výměně tokenu se stará odpověď nepočítá
        const request = state().request_id;
        q(`insert into net._http_response (id, status_code) values (${request}, 401)`);
        assert.equal(status().github, 401);
        q(`update app_secrets set value = '${TOKEN}_novy' where name = 'github_token'`);
        assert.equal(status().github, null, 'nový token: stará chyba neplatí');
        assert.equal(status().instant, true);
        // bez tokenu není nastavené
        q(`delete from app_secrets where name = 'github_token'`);
        assert.equal(status().instant, false);
        assert.equal(kick(), 'no-token');
    });

    await t.test('push_due se navenek nezměnilo: stejné sloupce a ověření tajemství', () => {
        assert.equal(q(`select string_agg(parameter_name || ' ' || data_type, ', ' order by ordinal_position) from information_schema.parameters where specific_name like 'push_due_%' and parameter_mode = 'OUT'`),
            'user_id uuid, endpoint text, p256dh text, auth text, kind text, title text, body text, url text, dedupe_key text');
        denied(psql(dbName, `set role anon; select * from push_due('spatne');`));
        ok(as(ADMIN, 'select dev_push_test();'));
        const rows = due(DAY);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].kind, 'test');
        assert.equal(rows[0].endpoint, endpointOf(1));
    });
});
