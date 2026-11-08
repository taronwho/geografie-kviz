// Jak odpověděli ostatní (PostgreSQL 16): dávka odpovědí jen od přihlášeného hráče, kontrola tvarů, limit za hodinu, každá otázka
// od hráče jednou za hodinu, počítadlo nesprávných možností (nejvýš 8), souhrn tématu jen z aspoň 20 odpovědí a podezřelé otázky jen pro dev_admins.
// Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_answer_stats_${process.pid}`;
const SCHEMA = path.join(__dirname, '..', 'supabase', 'schema.sql');
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '44444444-4444-4444-4444-444444444444';
const ADMIN = '33333333-3333-3333-3333-333333333333';
const as = (role, uid, sql) => psql(dbName, `set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const asUser = (uid, sql) => as('authenticated', uid, sql);
const lines = (result) => result.stdout.trim().split('\n').filter(Boolean);
const last = (result) => lines(result).pop();
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };
// JSON odpovědí do SQL (apostrofy se zdvojí)
const batch = (answers) => `'${JSON.stringify(answers).replace(/'/g, "''")}'::jsonb`;
const submit = (uid, answers) => asUser(uid, `select answer_stats_submit(${batch(answers)});`);
const one = (over = {}) => ({ t: 'zemepis', q: 'Q213', k: 'name', v: 'choices', c: false, w: 'Q39', ...over });
const many = (from, count, over = {}) => Array.from({ length: count }, (_, i) => one({ q: `Q${from + i}`, c: true, w: undefined, ...over }));
const row = (topic, item, kind = 'name', variant = 'choices') => q(`select shown || '/' || correct || '/' || wrong::text from answer_stats where topic = '${topic}' and item_id = '${item}' and kind = '${kind}' and variant = '${variant}'`);

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

test('SQL: Jak odpověděli ostatní (souhrnné statistiky odpovědí)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    ok(psql(dbName, '', SCHEMA));
    q(`insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com'), ('${C}', 'c@example.com'), ('${ADMIN}', 'admin@example.com');`);
    q(`insert into dev_admins (user_id) values ('${ADMIN}')`);

    await t.test('nepřihlášený nic nepošle ani nepřečte; tabulky přes API nikdo nečte ani nemění', () => {
        assert.match(denied(as('anon', '', `select answer_stats_submit(${batch([one()])});`), 'anon'), /permission denied/);
        assert.match(denied(as('anon', '', "select answer_stats_topic('zemepis');"), 'anon čte'), /permission denied/);
        assert.match(denied(as('anon', '', 'select * from dev_suspicious_questions();'), 'anon dev'), /permission denied/);
        assert.match(denied(asUser('', `select answer_stats_submit(${batch([one()])});`), 'bez uid'), /Přihlas se/);
        for (const table of ['answer_stats', 'answer_stats_limits']) {
            denied(asUser(A, `select count(*) from ${table};`), `čtení ${table}`);
            denied(as('anon', '', `select count(*) from ${table};`), `anon čtení ${table}`);
        }
        denied(asUser(A, "insert into answer_stats (topic, item_id, kind, variant, shown, correct) values ('zemepis', 'Q213', 'name', 'choices', 1000, 1000);"), 'přímý zápis');
        denied(asUser(A, 'select answer_stats_bump(\'{}\'::jsonb, \'x\');'), 'pomocná funkce není veřejná');
        assert.equal(q('select count(*) from answer_stats'), '0');
    });

    await t.test('dávka: přičte se zobrazení, správně a nesprávná možnost; vrací počet započtených', () => {
        assert.equal(last(ok(submit(A, [one(), one({ q: 'Q40', c: true, w: 'Q39' }), one({ q: 'Q41', v: 'typed', w: 'Q42' })]))), '3');
        assert.equal(row('zemepis', 'Q213'), '1/0/{"Q39": 1}');
        assert.equal(row('zemepis', 'Q40'), '1/1/{}', 'u správné odpovědi se nesprávná možnost nepočítá');
        assert.equal(row('zemepis', 'Q41', 'name', 'typed'), '1/0/{"Q42": 1}', 'psaní se počítá zvlášť');
        // jiný hráč stejnou otázku započte zvlášť
        assert.equal(last(ok(submit(B, [one({ w: 'Q40' })]))), '1');
        assert.equal(row('zemepis', 'Q213'), '2/0/{"Q39": 1, "Q40": 1}');
        // o hráči se ukládá jen počet dávek a odpovědí a otisky otázek v aktuální hodině
        assert.equal(q(`select batch_count || '/' || answer_count || '/' || cardinality(seen) from answer_stats_limits where user_id = '${A}'`), '1/3/3');
    });

    await t.test('stejná otázka od hráče jen jednou za hodinu (ztracená odpověď serveru, opakované odeslání, nafukování)', () => {
        const before = row('zemepis', 'Q213');
        assert.equal(last(ok(submit(A, [one(), one({ c: true })]))), '0');
        assert.equal(row('zemepis', 'Q213'), before);
        // po hodině se okno obnoví
        q(`update answer_stats_limits set window_start = now() - interval '61 minutes' where user_id = '${A}'`);
        assert.equal(last(ok(submit(A, [one({ c: true })]))), '1');
        assert.equal(row('zemepis', 'Q213'), '3/1/{"Q39": 1, "Q40": 1}');
        assert.equal(q(`select batch_count || '/' || answer_count from answer_stats_limits where user_id = '${A}'`), '1/1');
    });

    await t.test('kontrola tvarů: špatná odpověď se přeskočí, špatná dávka je chyba', () => {
        const bad = [
            one({ t: 'Zeměpis', q: 'Q500' }), one({ t: 'x'.repeat(25), q: 'Q501' }), one({ q: 'Q0' }), one({ q: 'Q502; drop table answer_stats' }), one({ q: 'L502' }),
            one({ q: 'Q503', k: 'Name' }), one({ q: 'Q504', k: '' }), one({ q: 'Q505', v: 'psani' }), one({ q: 'Q506', c: 'true' }), one({ q: 'Q507', c: undefined }),
            'odpověď', null, 5
        ];
        assert.equal(last(ok(submit(C, bad))), '0');
        assert.equal(q("select count(*) from answer_stats where item_id in ('Q500','Q501','Q503','Q504','Q505','Q506','Q507')"), '0');
        assert.match(denied(submit(C, many(600, 31)), '31 odpovědí'), /Příliš mnoho odpovědí najednou/);
        assert.match(denied(asUser(C, `select answer_stats_submit('{"t":"zemepis"}'::jsonb);`), 'objekt místo pole'), /Neplatná dávka/);
        assert.match(denied(asUser(C, 'select answer_stats_submit(null);'), 'null'), /Neplatná dávka/);
        // nesprávná možnost: dlouhá, s řídicím znakem, hádaná položka sama nebo jiný typ než text se nezapíše (odpověď ano)
        assert.equal(last(ok(submit(C, [one({ q: 'Q510', w: 'x'.repeat(61) }), one({ q: 'Q511', w: 'a\nb' }), one({ q: 'Q512', w: 'Q512' }), one({ q: 'Q513', w: 39 }), one({ q: 'Q514', w: 'taxon-Psovití' })]))), '5');
        assert.equal(q("select string_agg(item_id || '=' || wrong::text, ' ' order by item_id) from answer_stats where item_id in ('Q510','Q511','Q512','Q513','Q514')"),
            'Q510={} Q511={} Q512={} Q513={} Q514={"taxon-Psovití": 1}');
        // počty drží kontrola tabulky i pro správce (správně nejvýš tolik, kolikrát se otázka ukázala)
        denied(psql(dbName, "update answer_stats set correct = shown + 1 where item_id = 'Q514'"), 'správně > zobrazeno');
        denied(psql(dbName, "insert into answer_stats (topic, item_id, kind, variant) values ('zemepis', 'Q1', 'name', 'jinak')"), 'neznámý způsob');
    });

    await t.test('počítadlo nesprávných možností drží nejvýš 8 a nejčastější v něm zůstane', () => {
        const users = Array.from({ length: 40 }, (_, i) => `55555555-5555-5555-5555-${String(i).padStart(12, '0')}`);
        q(`insert into auth.users (id, email) values ${users.map((id, i) => `('${id}', 'w${i}@example.com')`).join(', ')}`);
        // každý hráč zvolí jednu z 12 nesprávných možností; „Q900“ volí každý třetí
        users.forEach((uid, i) => ok(submit(uid, [one({ q: 'Q777', w: i % 3 === 0 ? 'Q900' : `Q${901 + (i % 11)}` })])));
        const wrong = JSON.parse(q("select wrong::text from answer_stats where item_id = 'Q777'"));
        assert.ok(Object.keys(wrong).length <= 8, `nejvýš 8 možností: ${Object.keys(wrong).length}`);
        const top = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
        assert.equal(top[0], 'Q900');
        assert.ok(top[1] >= 14, `Q900 započtená aspoň tolikrát, kolikrát ji hráči zvolili (${top[1]})`);
        assert.equal(row('zemepis', 'Q777').split('/')[0], '40');
    });

    await t.test('limit: nejvýš 300 odpovědí a 30 dávek za hodinu, co je navíc, se potichu nezapočte', () => {
        const D = '66666666-6666-6666-6666-666666666666';
        q(`insert into auth.users (id, email) values ('${D}', 'd@example.com')`);
        const results = [];
        for (let i = 0; i < 11; i++) results.push(Number(last(ok(submit(D, many(10000 + i * 30, 30))))));
        assert.deepEqual(results, [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 0]);
        assert.equal(q(`select answer_count from answer_stats_limits where user_id = '${D}'`), '300');
        const E = '77777777-7777-7777-7777-777777777777';
        q(`insert into auth.users (id, email) values ('${E}', 'e@example.com')`);
        const calls = Array.from({ length: 31 }, (_, i) => `select answer_stats_submit(${batch([one({ q: `Q${20000 + i}`, c: true, w: undefined })])});`).join(' ');
        const out = lines(ok(asUser(E, calls))).slice(-31).map(Number);
        assert.deepEqual(out.slice(0, 30), Array(30).fill(1));
        assert.equal(out[30], 0, '31. dávka v hodině se nezapočte');
        assert.equal(q("select count(*) from answer_stats where item_id = 'Q20030'"), '0');
    });

    await t.test('řádky limitu starší než dvě hodiny se mažou, se smazáním účtu hned; souhrn zůstává', () => {
        q(`update answer_stats_limits set window_start = now() - interval '3 hours' where user_id = '${B}'`);
        ok(submit(A, [one({ q: 'Q8000', c: true, w: undefined })]));
        assert.equal(q(`select count(*) from answer_stats_limits where user_id = '${B}'`), '0');
        const shown = row('zemepis', 'Q213').split('/')[0];
        ok(asUser(A, 'select delete_my_account();'));
        assert.equal(q(`select count(*) from answer_stats_limits where user_id = '${A}'`), '0');
        assert.equal(row('zemepis', 'Q213').split('/')[0], shown, 'souhrnná čísla nejsou vázaná na hráče');
    });

    await t.test('souhrn tématu: jen otázky s aspoň 20 odpověďmi, kompaktně, jen přihlášený', () => {
        q("insert into answer_stats (topic, item_id, kind, variant, shown, correct, wrong) values ('historie', 'Q42', 'name', 'choices', 54, 23, '{\"Q15\": 20}'), ('historie', 'Q42', 'century', 'typed', 20, 2, '{}'), ('historie', 'Q15', 'name', 'choices', 19, 1, '{}'), ('zemepis', 'Q99', 'name', 'choices', 500, 5, '{}')");
        const rows = JSON.parse(last(ok(asUser(B, "select answer_stats_topic('historie');"))));
        assert.deepEqual(rows, [['Q42', 'name', 'c', 54, 23], ['Q42', 'century', 't', 20, 2]]);
        assert.deepEqual(JSON.parse(last(ok(asUser(B, "select answer_stats_topic('neexistuje');")))), []);
        assert.match(denied(asUser(B, "select answer_stats_topic('Historie');"), 'tvar tématu'), /Neplatné téma/);
        assert.match(denied(asUser('', "select answer_stats_topic('historie');"), 'bez uid'), /Přihlas se/);
    });

    await t.test('podezřelé otázky: jen dev_admins; vedoucí nesprávná možnost i nízká úspěšnost', () => {
        assert.match(denied(asUser(B, 'select * from dev_suspicious_questions();'), 'běžný hráč'), /dev_admins/);
        q("insert into answer_stats (topic, item_id, kind, variant, shown, correct, wrong) values ('chemie', 'Q1', 'name', 'choices', 100, 30, '{\"Q2\": 60, \"Q3\": 10}'), ('chemie', 'Q4', 'name', 'choices', 60, 10, '{\"Q5\": 9}'), ('chemie', 'Q6', 'name', 'choices', 60, 40, '{\"Q7\": 15}'), ('chemie', 'Q8', 'name', 'typed', 60, 2, '{}'), ('chemie', 'Q9', 'name', 'choices', 30, 5, '{}')");
        const result = lines(ok(asUser(ADMIN, "select topic, item_id, kind, variant, shown, correct, coalesce(top_wrong, '-'), top_wrong_count, reason from dev_suspicious_questions() where topic = 'chemie';"))).filter(line => line.includes('|'));
        // Q1: Q2 vede (mate) · Q4: 17 % z 60 (nizka) · Q6 v pořádku · Q8 psaní (nízká úspěšnost u psaní je běžná) · Q9 jen 30 odpovědí
        assert.deepEqual(result, ['chemie|Q1|name|choices|100|30|Q2|60|mate', 'chemie|Q4|name|choices|60|10|Q5|9|nizka']);
        // globálně: Q42 v historii (nesprávná vede jen o málo méně, ale úspěšnost 43 %) se neukáže, zeměpisná Q99 s 1 % ano
        const all = lines(ok(asUser(ADMIN, 'select topic || \':\' || item_id || \':\' || reason from dev_suspicious_questions();')));
        assert.ok(all.includes('zemepis:Q99:nizka'));
        assert.ok(!all.some(entry => entry.startsWith('historie:Q42')));
        assert.ok(all.length <= 100);
        // práh n jde zvýšit, pod 20 ne
        assert.ok(!lines(ok(asUser(ADMIN, 'select item_id from dev_suspicious_questions(1000);'))).includes('Q4'));
        assert.ok(lines(ok(asUser(ADMIN, 'select item_id from dev_suspicious_questions(5);'))).includes('Q9'), 'Q9 (30 odpovědí, 17 %) při prahu 20');
    });

    await t.test('spuštění schématu podruhé nic nerozbije a verze je aspoň 6 (7 = Kvíz dne)', () => {
        const before = q('select count(*) || \'/\' || sum(shown) from answer_stats');
        ok(psql(dbName, '', SCHEMA));
        assert.equal(q('select count(*) || \'/\' || sum(shown) from answer_stats'), before);
        assert.ok(Number(last(ok(asUser(B, 'select schema_version();')))) >= 6);
    });
});
