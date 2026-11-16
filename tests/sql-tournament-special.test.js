// Speciální turnaje na téma a hlasování o tématu (PostgreSQL 16, schéma 31): hlasování (jeden hlas na hráče, změna nejvýš 10krát, počty až po
// hlasování, uzavření a nová čtveřice témat), pravidla řádků a oprávnění, založení turnaje jen správcem (a uzavření hlasování tématem turnaje),
// kola po minutách od začátku, kontumace s rozpisem nedohraného zápasu, upozornění „Začíná speciální turnaj“ a psaná výzva odmítnutá
// (hra více hráčů jen s výběrem z možností). Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_special_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
let NOW = '';
const as = (uid, sql, role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${NOW}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};

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

const ADMIN = id(1);
const A = id(2);
const B = id(3);
const C = id(4);
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const minute = 60000;
// Začátek turnaje: za dvě hodiny, na celé minuty (čas testu posouvá mudrlant.test_now)
const START = new Date(Math.floor((Date.now() + 2 * 3600000) / minute) * minute);
const at = (offsetMinutes) => new Date(START.getTime() + offsetMinutes * minute).toISOString();

test('SQL: speciální turnaje na téma a hlasování', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(Array.from({ length: 6 }, (_, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(i + 1)}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));
    q(`insert into dev_admins (user_id) values ('${ADMIN}');`);
    NOW = new Date().toISOString();
    let poll;

    await t.test('verze schématu 31 nebo novější a nabídka témat', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 31, 'schéma se speciálními turnaji (31) nebo novější');
        assert.ok(Number(q('select count(*) from tournament_themes where active')) >= 12);
        assert.equal(q(`select title || '|' || topics || '|' || capacity from tournament_themes where id = 'vlajky-afriky'`), 'Vlajky Afriky|vlajky|64');
    });

    await t.test('hlasování: jedno otevřené se 4 tématy, počty až po vlastním hlasu, změna hlasu nejvýš 10krát', () => {
        denied(as(null, 'select tournament_poll_state();', 'anon'), /permission denied/, 'anon nesmí');
        denied(as(null, 'select tournament_poll_state();'), /Přihlas se/, 'bez přihlášení');
        poll = json(as(A, 'select tournament_poll_state();'));
        assert.equal(poll.options.length, 4);
        assert.equal(new Set(poll.options.map(option => option.id)).size, 4);
        assert.equal(poll.mine, null);
        assert.equal(poll.total, null, 'počty jen po hlasování');
        assert.ok(poll.options.every(option => option.votes === null && option.title));
        assert.equal(json(as(B, 'select tournament_poll_state();')).id, poll.id, 'pořád totéž hlasování');
        assert.equal(q('select count(*) from tournament_polls'), '1');
        const [first, second, third] = poll.options.map(option => option.id);
        const after = json(as(A, `select tournament_vote(${poll.id}, '${first}');`));
        assert.equal(after.mine, first);
        assert.equal(after.total, 1);
        assert.equal(after.options[0].votes, 1);
        assert.equal(json(as(A, `select tournament_vote(${poll.id}, '${first}');`)).changes_left, 10, 'stejný hlas znovu nic nemění');
        ok(as(B, `select tournament_vote(${poll.id}, '${second}');`));
        ok(as(C, `select tournament_vote(${poll.id}, '${second}');`));
        // Kdo nehlasoval, počty nevidí; správce ano
        assert.equal(json(as(id(5), 'select tournament_poll_state();')).total, null);
        assert.equal(json(as(ADMIN, 'select tournament_poll_state();')).total, 3);
        denied(as(A, `select tournament_vote(${poll.id}, 'neexistuje');`), /v hlasování není/);
        // Změna hlasu: nejvýš 10krát, pak platí poslední
        for (let i = 0; i < 10; i++) ok(as(A, `select tournament_vote(${poll.id}, '${i % 2 ? first : third}');`));
        denied(as(A, `select tournament_vote(${poll.id}, '${second}');`), /nejvýš 10krát/);
        assert.equal(q(`select theme || ':' || changes from tournament_votes where user_id = '${A}'`), `${first}:10`);
        assert.equal(q(`select count(*) from tournament_votes where poll_id = ${poll.id}`), '3', 'jeden hlas na hráče');
    });

    await t.test('pravidla řádků: svůj hlas vidí jen hráč sám, zapisují jen funkce', () => {
        assert.equal(last(ok(as(B, 'select count(*) from tournament_votes;'))), '1');
        assert.equal(last(ok(as(id(5), 'select count(*) from tournament_votes;'))), '0');
        denied(as(B, `insert into tournament_votes (poll_id, user_id, theme) values (${poll.id}, '${id(5)}', '${poll.options[0].id}');`), /permission denied/);
        denied(as(B, `update tournament_votes set theme = '${poll.options[3].id}';`), /permission denied/);
        denied(as(B, `update tournament_polls set closed_at = now();`), /permission denied/);
        denied(as(B, `insert into tournament_themes (id, title, topics) values ('x', 'Xx', 'zemepis');`), /permission denied/);
        denied(as(B, 'select tournament_poll_close();'), /permission denied/, 'interní funkce');
        denied(as(B, 'select tournament_poll_pick(1);'), /permission denied/);
    });

    let tid;
    await t.test('speciální turnaj zakládá jen správce; téma z hlasování hlasování uzavře a otevře nové bez týchž témat', () => {
        const winner = poll.options[1].id;
        denied(as(A, `select dev_special_tournament_create('${winner}', '${at(0)}', 60);`), /dev_admins/, 'hráč nesmí');
        denied(as(A, 'select dev_tournament_poll_close();'), /dev_admins/);
        denied(as(ADMIN, `select dev_special_tournament_create('neexistuje', '${at(0)}', 60);`), /nabídce není/);
        denied(as(ADMIN, `select dev_special_tournament_create('${winner}', '${new Date(Date.now() - 3600000).toISOString()}', 60);`), /v budoucnu/);
        denied(as(ADMIN, `select dev_special_tournament_create('${winner}', '${at(0)}', 7);`), /Délka kola/);
        // Turnaj na téma mimo hlasování hlasování nechá; nezačatý jde smazat
        const other = q(`select id from tournament_themes where active and id <> all ('{${poll.options.map(option => option.id).join(',')}}') order by sort limit 1`);
        const extra = last(ok(as(ADMIN, `select dev_special_tournament_create('${other}', '${at(0)}', 60);`)));
        assert.equal(q('select count(*) from tournament_polls where closed_at is null'), '1');
        assert.equal(q(`select id from tournament_polls where closed_at is null`), String(poll.id), 'hlasování běží dál');
        denied(as(ADMIN, `select dev_special_tournament_create('${winner}', '${at(0)}', 60);`), /už běží nebo má otevřené přihlášky/, 'najednou jen jeden');
        denied(as(A, `select dev_special_tournament_delete('${extra}');`), /dev_admins/);
        ok(as(ADMIN, `select dev_special_tournament_delete('${extra}');`));
        tid = last(ok(as(ADMIN, `select dev_special_tournament_create('${winner}', '${at(0)}', 60);`)));
        assert.equal(q(`select kind || '|' || theme || '|' || title || '|' || status || '|' || round_minutes || '|' || (starts_at = '${at(0)}'::timestamptz) from tournaments where id = '${tid}'`),
            `special|${winner}|${q(`select title from tournament_themes where id = '${winner}'`)}|open|60|true`);
        assert.equal(q(`select winner || '|' || (tournament_id = '${tid}') from tournament_polls where id = ${poll.id}`), `${winner}|true`, 'vítěz = téma turnaje');
        const next = json(as(A, 'select tournament_poll_state();'));
        assert.notEqual(next.id, poll.id);
        assert.equal(next.mine, null, 'v novém hlasování ještě nehlasoval');
        assert.ok(next.options.every(option => !poll.options.some(old => old.id === option.id)), 'nová čtveřice témat');
        // Správce uzavře hlasování ručně: vítěz podle hlasů, otevře se další
        ok(as(B, `select tournament_vote(${next.id}, '${next.options[2].id}');`));
        const third = json(as(ADMIN, 'select dev_tournament_poll_close();'));
        assert.notEqual(third.id, next.id);
        assert.equal(q(`select winner from tournament_polls where id = ${next.id}`), next.options[2].id);
        denied(as(A, `select tournament_vote(${next.id}, '${next.options[0].id}');`), /skončilo/, 'v uzavřeném hlasování už ne');
        // Týdenní tick speciální turnaj nezakládá ani nespouští před začátkem
        ok(as(A, 'select tournament_tick();'));
        assert.equal(q(`select count(*) from tournaments where kind = 'special'`), '1');
        assert.equal(q(`select status from tournaments where id = '${tid}'`), 'open');
    });

    await t.test('upozornění „Začíná speciální turnaj“: jednou, jen kdo chce upozornění na turnaje a ještě není přihlášený', () => {
        ok(as(C, `select push_subscribe('https://push.example.com/send/c', '${P256DH}', '${AUTH}');`));
        ok(as(A, `select push_subscribe('https://push.example.com/send/a', '${P256DH}', '${AUTH}');`));
        q(`update profiles set push_tournament = false where id = '${A}'`);
        const rows = q(`set mudrlant.test_now = '${NOW}'; select user_id || '|' || title || '|' || body || '|' || dedupe_key from push_pending() where kind = 'tournament_special'`).split('\n').filter(Boolean);
        assert.equal(rows.length, 1, rows.join('\n'));
        const [user, title, body, key] = rows[0].split('|');
        assert.equal(user, C);
        assert.equal(title, `Začíná speciální turnaj: ${q(`select title from tournaments where id = '${tid}'`)}`);
        assert.match(body, /^Přihlášky jsou otevřené, začíná (v|ve) \S+ \d+\. \d+\. v \d+:\d\d\. Přihlas se na záložce Soupeři v okně Turnaje\.$/);
        assert.equal(key, `tsp:${tid}:${C}`);
        ok(as(C, `select tournament_join('${tid}');`));
        assert.equal(q(`set mudrlant.test_now = '${NOW}'; select count(*) from push_pending() where kind = 'tournament_special'`), '0', 'přihlášenému už ne');
        ok(as(C, `select tournament_leave('${tid}');`));
        // push_mark zapíše klíč tsp: jako druh 'tournament_special'
        q(`insert into app_secrets (name, value) values ('push_cron', 'tajemstvi-pro-test-123') on conflict (name) do update set value = excluded.value`);
        q(`select push_mark('tajemstvi-pro-test-123', array['${key}'])`);
        assert.equal(q(`select kind || '|' || user_id from push_sent where dedupe_key = '${key}'`), `tournament_special|${C}`);
    });

    let mid;
    await t.test('kola po minutách: přihlášky do začátku, zápas jen v kole, kontumace uloží nedohraný výsledek a rozpis ho ukáže', () => {
        ok(as(B, `select tournament_join('${tid}');`));
        assert.equal(last(ok(as(ADMIN, `select dev_tournament_add_bots('${tid}', 7);`))), '7');
        // Začátek: přihlášky zavřené, tick turnaj spustí, boti hned odehrají 1. kolo
        NOW = at(1);
        denied(as(id(5), `select tournament_join('${tid}');`), /zavřené/);
        ok(as(B, 'select tournament_tick();'));
        assert.equal(q(`select status || '|' || size || '|' || rounds from tournaments where id = '${tid}'`), 'running|8|3');
        mid = q(`select id from tournament_matches where tournament_id = '${tid}' and '${B}' in (p1, p2)`);
        ok(as(B, `select tournament_start_match('${mid}');`));
        for (let i = 0; i < 3; i++) ok(as(B, `select tournament_answer_save('${mid}', ${i}, ${i !== 1}, ${i !== 1 ? 4 : 0}, 'Odpověď ${i}', 0, 5000);`));
        denied(as(B, `select tournament_details('${mid}');`), /až zápas dohraješ/, 'během kola rozpis nedohraného zápasu ne');
        // Konec kola (po 60 minutách): odpověď už nejde uložit, zápas se rozhodne kontumačně
        NOW = at(61);
        denied(as(B, `select tournament_answer_save('${mid}', 3, true, 4);`), /Kolo se teď nehraje/);
        ok(as(B, 'select tournament_tick();'));
        assert.equal(q(`select decided_by || '|' || (winner = '${B}') from tournament_matches where id = '${mid}'`), 'walkover|false', 'bot odehrál, nedohraný zápas prohrává kontumačně');
        assert.equal(q(`select correct || '|' || points || '|' || (finished_at is null) from tournament_results where match_id = '${mid}' and user_id = '${B}'`), '2|8|true',
            'nedohraný výsledek: správné a body z uložených odpovědí, bez dohrání');
        const rows = last(ok(as(B, `select count(*) filter (where user_id = '${B}') || '|' || count(*) from tournament_details('${mid}');`)));
        assert.equal(rows.split('|')[0], '3', 'moje tři uložené odpovědi');
        assert.ok(Number(rows.split('|')[1]) >= 3);
        // 2. kolo začíná hodinu po začátku
        assert.equal(q(`set mudrlant.test_now = '${NOW}'; select tournament_round_phase(t, 2) || '|' || tournament_round_phase(t, 3) from tournaments t where id = '${tid}'`), 'open|before');
        // Dohraný týdenní kalendář se tím nemění: týdenní turnaj má kola po dnech
        assert.equal(q(`select count(*) from tournaments where kind = 'weekly' and starts_at is not null`), '0');
    });

    await t.test('psaní odpovědí jen pro jednoho hráče: psaná výzva se nezaloží, bez způsobu odpovídání je výběr z možností, starší psaná výzva se dohraje', () => {
        denied(as(A, `insert into challenges (id, creator_id, topic, seed, count, variant) values ('PSANI1', '${A}', 'mix', 's1', 5, 'typed');`), /jen ve hře pro jednoho hráče/);
        ok(as(A, `insert into challenges (id, creator_id, topic, seed, count) values ('BEZVAR', '${A}', 'mix', 's2', 5);`));
        assert.equal(q(`select variant from challenges where id = 'BEZVAR'`), 'choices');
        denied(as(A, `select challenge_progress_save('BEZVAR', 0, true, 6);`), /Neplatný výsledek/, 'výzva s možnostmi nejvýš 4 body');
        // Výzva založená s psaním dřív (správce, jako před změnou): hraje se dál za dvojnásobek
        q(`insert into challenges (id, creator_id, topic, seed, count, variant) values ('STARAP', '${A}', 'mix', 's3', 5, 'typed');`);
        assert.equal(last(ok(as(B, `select challenge_progress_save('STARAP', 0, true, 8);`))), '1');
        // Turnaj (i speciální) má jen výběr z možností: nejvýš 4 body
        assert.match(q(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'tournament_answers_values'`), /points >= 0\) AND \(points <= 4\)/);
    });
});
