// Řetězovka dne v databázi (PostgreSQL, blok 21): jeden řádek na hráče a den (den určuje server, Praha), první odeslaný výsledek platí,
// kontrola rozsahů (bez Záchrany přesně 1 + 2 + … + články, se Záchranou nejvýš o jeden článek méně), pořadí dne (hráči, celé řetězy,
// nejlepší, moje místo, nejlepších 10 jen s veřejnými údaji), pravidla řádků a oprávnění (hráč nezapíše nic přímo, cizí řádky nevidí,
// anon nic), export a smazání účtu. Shoda s chain.js (validSummary). Spouští se jen s psql a serverem (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Chain = require('../chain.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_chain_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const DAY = '2026-11-12';
// Pražský čas: 12. 11. je zimní čas (UTC+1)
const at = (clock, day = DAY) => { const [h, m] = clock.split(':').map(Number); return new Date(Date.UTC(...day.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))), h - 1, m)).toISOString(); };
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const as = (uid, sql, now = at('13:00'), role = 'authenticated') => psql(dbName, `set mudrlant.test_now = '${now}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const json = (r) => JSON.parse(last(ok(r)));
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const submit = (uid, links, score, rescued = false, now = at('13:00'), forDay = DAY) => as(uid, `select chain_submit('${forDay}', ${links}, ${score}, ${rescued});`, now);

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

const PLAYERS = Array.from({ length: 13 }, (_, i) => id(i + 1));
const [A, B, C, D, E, F] = PLAYERS;

test('SQL: Řetězovka dne', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    // Schéma jde spustit opakovaně (idempotentní migrace)
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q(PLAYERS.map((uid, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    await t.test('tabulka s pravidly řádků; anon nic; hráč nezapíše přímo a pomocné funkce nevolá', () => {
        assert.equal(q(`select relrowsecurity from pg_class where oid = 'public.chain_results'::regclass`), 't');
        for (const sql of [`select chain_submit('${DAY}', 1, 1, false);`, 'select chain_day_stats();', 'select * from chain_results;']) {
            denied(as(null, sql, at('13:00'), 'anon'), null, `anon: ${sql}`);
        }
        denied(as(A, `insert into chain_results (day, user_id, links, score) values ('${DAY}', '${A}', 7, 28);`), /permission denied/);
        denied(as(A, 'update chain_results set score = 28;'), /permission denied/);
        denied(as(A, 'delete from chain_results;'), /permission denied/);
        for (const sql of ['select chain_today();', 'select chain_json(null::chain_results);']) denied(as(A, sql), /permission denied/, sql);
        denied(as(null, 'select chain_day_stats();'), /Přihlas se/);
        denied(submit(null, 1, 1), /Přihlas se/);
    });

    await t.test('odeslání: den určuje server (dnešek, po půlnoci i včerejšek), kontrola rozsahů shodná s chain.js', () => {
        denied(submit(A, 3, 6, false, at('13:00'), '2026-11-13'), /už skončila/, 'zítřek');
        denied(submit(A, 3, 6, false, at('13:00'), '2026-11-10'), /už skončila/, 'předevčírem');
        for (const [links, score, rescued] of [[8, 36, false], [-1, 0, false], [3, 5, false], [3, 7, false], [5, 8, true], [5, 16, true], [0, 1, false], [7, 27, false]]) {
            denied(submit(A, links, score, rescued), /Neplatný výsledek/, `${links}/${score}/${rescued}`);
            assert.equal(Chain.validSummary({ links, score, rescued }), false, `chain.js: ${links}/${score}/${rescued}`);
        }
        for (const [links, score, rescued] of [[0, 0, false], [7, 28, false], [5, 12, true], [5, 15, true], [5, 10, true], [1, 0, true]]) assert.ok(Chain.validSummary({ links, score, rescued }), `chain.js: ${links}/${score}/${rescued}`);
        // A: 4 články bez záchrany = 10 bodů
        assert.deepEqual(json(submit(A, 4, 10)), { day: DAY, links: 4, score: 10, rescued: false, rank: 1 });
        // Druhé odeslání (jiné zařízení) nic nezmění, vrátí uložený výsledek
        assert.deepEqual(json(submit(A, 7, 28)), { day: DAY, links: 4, score: 10, rescued: false, rank: 1 });
        assert.equal(q(`select links || ':' || score || ':' || rescued from chain_results where user_id = '${A}'`), '4:10:false');
        // B: celý řetěz, C: 5 článků se Záchranou na 3. článku (15 − 3 = 12), D: Záchrana nevyšla po 2 článcích (3 body)
        assert.equal(json(submit(B, 7, 28)).rank, 1);
        assert.deepEqual(json(submit(C, 5, 12, true)), { day: DAY, links: 5, score: 12, rescued: true, rank: 2 });
        assert.equal(json(submit(D, 2, 3, true)).score, 3);
        // E: nula (hned první článek špatně); F: dohráno ve 23:59, odesláno po půlnoci → patří ke včerejšku
        assert.equal(json(submit(E, 0, 0)).rank, 5);
        // (celý řetěz dá i pomůcku Půl na půl do Dobývání, blok 30; víc tests/sql-pomucky.test.js)
        const { item, ...late } = json(submit(F, 7, 28, false, at('0:03', '2026-11-13'), DAY));
        assert.deepEqual(late, { day: DAY, links: 7, score: 28, rescued: false, rank: 1 });
        assert.deepEqual([item.kind, item.granted, item.count], ['fifty', true, 1]);
    });

    await t.test('pravidla řádků: hráč vidí jen svůj řádek; kontrola hodnot v tabulce', () => {
        assert.equal(last(ok(as(A, 'select count(*) from chain_results;'))), '1');
        denied(psql(dbName, `insert into chain_results (day, user_id, links, score, rescued) values ('2026-11-01', '${A}', 3, 5, false)`), /chain_results_values/, 'body nesedí');
        denied(psql(dbName, `insert into chain_results (day, user_id, links, score, rescued) values ('2026-11-01', '${A}', 8, 36, false)`), /chain_results_values/, 'víc než 7 článků');
        denied(psql(dbName, `insert into chain_results (day, user_id, links, score, rescued) values ('2026-11-01', '${A}', 4, 5, true)`), /chain_results_values/, 'záchrana víc než jednoho článku');
    });

    await t.test('pořadí dne: hráči, celé řetězy, nejlepší, moje místo (stejné body = stejné místo) a nejlepších 10', () => {
        // Dalších 7 hráčů po 1 bodu (1 článek), ať je vidět omezení na 10
        for (let i = 6; i < 13; i++) ok(submit(PLAYERS[i], 1, 1, false, at(`14:${String(i).padStart(2, '0')}`)));
        const stats = json(as(C, 'select chain_day_stats();', at('21:00')));
        assert.deepEqual([stats.day, stats.players, stats.full, stats.full_pct, stats.best], [DAY, 13, 2, 15, 28]);
        assert.deepEqual(stats.me, { day: DAY, links: 5, score: 12, rescued: true, rank: 3 });
        assert.equal(stats.top.length, 10);
        assert.deepEqual(stats.top.slice(0, 5).map(r => [r.rank, r.id, r.score, r.links, r.me]), [[1, B, 28, 7, false], [1, F, 28, 7, false], [3, C, 12, 5, true], [4, A, 10, 4, false], [5, D, 3, 2, false]]);
        assert.deepEqual(stats.top.slice(5).map(r => r.rank), [6, 6, 6, 6, 6]);
        assert.deepEqual(Object.keys(stats.top[0]).sort(), ['avatar', 'color', 'display_name', 'frame', 'id', 'links', 'me', 'owl', 'rank', 'rescued', 'score', 'title_pref']);
        assert.equal(stats.top[0].display_name, 'Hráč 2');
        // Kdo dnes nehrál, vidí pořadí bez sebe; budoucí a starý den ne; prázdný den = nuly
        q(`insert into auth.users (id, email) values ('${id(99)}', 'u99@example.com')`);
        const outsider = json(as(id(99), 'select chain_day_stats();', at('21:00')));
        assert.deepEqual([outsider.players, outsider.me], [13, null]);
        denied(as(A, `select chain_day_stats('2026-11-13');`, at('21:00')), /30 dní/);
        denied(as(A, `select chain_day_stats('2026-10-01');`, at('21:00')), /30 dní/);
        const empty = json(as(A, `select chain_day_stats('2026-11-11');`, at('21:00')));
        assert.deepEqual([empty.players, empty.full, empty.full_pct, empty.best, empty.me, empty.top], [0, 0, 0, 0, null, []]);
        // Druhý den: včerejšek pořád jde, dnešek je nový (prázdný)
        assert.equal(json(as(A, `select chain_day_stats('${DAY}');`, at('11:00', '2026-11-13'))).players, 13);
        assert.equal(json(as(A, 'select chain_day_stats();', at('11:00', '2026-11-13'))).players, 0);
    });

    await t.test('odznaky Řetězovky (blok 36): katalog a stupně, chain_badge_counts jen pro přihlášeného a jen vlastní dny', () => {
        const Core = require('../quiz-core.js');
        for (const id of Chain.BADGE_GROUPS) {
            const tiers = Core.BADGE_GROUPS.find(group => group.id === id).badges.map(badge => badge.id);
            assert.equal(q(`select count(*) from unnest(badge_catalog()) b where b = any (array['${tiers.join("', '")}'])`), String(tiers.length), `${id} v badge_catalog()`);
            assert.equal(q(`select array_to_string(tiers, ',') from badge_tiers() where grp = '${id}'`), tiers.join(','), `${id} v badge_tiers()`);
        }
        assert.equal(q(`select badge_owned(array['retezovka-30'], 'retezovka-10')`), 't', 'vyšší stupeň má i nižší');
        assert.equal(q(`select badge_owned(array['retezovka-cela-60'], 'retezovka-10')`), 'f', 'jiná skupina ne');
        // Hráč F: dnešek (z odeslání výše) a tři dřívější dny – dva celé řetězy, z toho jeden se Záchranou
        const before = json(as(F, 'select chain_badge_counts();'));
        q(`insert into chain_results (day, user_id, links, score, rescued) values ('2026-11-01', '${F}', 7, 28, false), ('2026-11-02', '${F}', 7, 22, true), ('2026-11-03', '${F}', 2, 3, false)`);
        const after = json(as(F, 'select chain_badge_counts();'));
        assert.deepEqual([after.days - before.days, after.clean - before.clean], [3, 1]);
        assert.equal(after.days, Number(q(`select count(*) from chain_results where user_id = '${F}'`)));
        assert.equal(after.clean, Number(q(`select count(*) from chain_results where user_id = '${F}' and links = 7 and not rescued`)));
        assert.deepEqual(json(as(id(99), 'select chain_badge_counts();')), { days: 0, clean: 0 }, 'bez her nuly');
        denied(as(null, 'select chain_badge_counts();'), /Přihlas se/);
        denied(as(null, 'select chain_badge_counts();', at('13:00'), 'anon'), /permission denied/, 'anon ne');
        q(`delete from chain_results where user_id = '${F}' and day < '2026-11-10'`);
    });

    await t.test('Záchrana navíc (blok 37): použití jednou za den před odesláním, dva zachráněné články jen s použitou pomůckou', () => {
        const DAY2 = '2026-11-14';
        const now = at('13:00', DAY2);
        const [G, H, I] = [51, 52, 53].map(id);
        q([G, H, I].map((uid, i) => `insert into auth.users (id, email) values ('${uid}', 'r${i}@example.com');`).join('\n'));
        const use = (uid, day = DAY2) => as(uid, `select chain_use_rescue('${day}');`, now);
        const stock = (uid, count) => q(`insert into player_items (user_id, kind, count) values ('${uid}', 'chain_rescue', ${count}) on conflict (user_id, kind) do update set count = excluded.count`);
        const have = (uid) => json(as(uid, 'select player_items_mine();', now)).chain_rescue;
        denied(as(null, `select chain_use_rescue('${DAY2}');`, now), /Přihlas se/);
        denied(as(null, `select chain_use_rescue('${DAY2}');`, now, 'anon'), /permission denied/);
        denied(use(G), /Záchranu navíc teď nemáš\./);
        stock(G, 1);
        denied(use(G, '2026-11-16'), /už skončila/, 'zítřek');
        denied(use(G, '2026-11-12'), /už skončila/, 'předevčírem');
        const used = json(use(G));
        assert.deepEqual([used.used, used.already, used.items.chain_rescue], [true, false, 0]);
        assert.deepEqual([json(use(G)).already, have(G)], [true, 0], 'podruhé téhož dne nic neubere (ztracená odpověď, druhé zařízení)');
        // Body se dvěma zachráněnými články (5 článků, Záchrana na 2. a 4.: 15 − 6 = 9) projdou jen s použitou pomůckou
        for (const [links, score] of [[5, 9], [5, 6], [3, 1], [1, 0]]) assert.ok(Chain.validSummary({ links, score, rescued: true, extra: true }), `chain.js: ${links}/${score} se Záchranou navíc`);
        for (const [links, score] of [[5, 9], [5, 6]]) assert.equal(Chain.validSummary({ links, score, rescued: true }), false, `chain.js: ${links}/${score} jen se Záchranou`);
        for (const [links, score] of [[5, 5], [5, 16], [3, 0]]) assert.equal(Chain.validSummary({ links, score, rescued: true, extra: true }), false, `chain.js: ${links}/${score} ani se Záchranou navíc`);
        stock(H, 1);
        denied(submit(H, 5, 9, true, now, DAY2), /Neplatný výsledek/, 'bez použité Záchrany navíc');
        denied(submit(G, 5, 5, true, now, DAY2), /Neplatný výsledek/, 'víc než dva zachráněné články');
        denied(submit(G, 5, 9, false, now, DAY2), /Neplatný výsledek/, 'bez Záchrany');
        assert.deepEqual(json(submit(G, 5, 9, true, now, DAY2)), { day: DAY2, links: 5, score: 9, rescued: true, extra: true, rank: 1 });
        assert.equal(q(`select extra_rescue from chain_results where user_id = '${G}' and day = '${DAY2}'`), 't');
        assert.deepEqual(json(as(G, `select chain_day_stats('${DAY2}');`, now)).me, { day: DAY2, links: 5, score: 9, rescued: true, extra: true, rank: 1 });
        // S použitou pomůckou platí i jedna Záchrana (druhá nevyšla): extra se zapíše, protože ji hráč ten den použil
        stock(I, 1);
        ok(use(I));
        assert.equal(json(submit(I, 3, 4, true, now, DAY2)).extra, true);
        // Po odeslání výsledku dne už použít nejde (H výsledek nemá, má ale pomůcku: zkusí to po odeslání)
        ok(submit(H, 2, 3, false, now, DAY2));
        denied(use(H), /Řetězovku dne už máš dohranou\./);
        assert.equal(have(H), 1);
        // Kontrola v tabulce: dva zachráněné články jen s extra_rescue, extra_rescue jen se Záchranou
        denied(psql(dbName, `insert into chain_results (day, user_id, links, score, rescued) values ('2026-11-01', '${G}', 5, 9, true)`), /chain_results_values/);
        denied(psql(dbName, `insert into chain_results (day, user_id, links, score, rescued, extra_rescue) values ('2026-11-01', '${G}', 3, 6, false, true)`), /chain_results_values/);
        denied(psql(dbName, `insert into chain_results (day, user_id, links, score, rescued, extra_rescue) values ('2026-11-01', '${G}', 5, 5, true, true)`), /chain_results_values/);
        // Starší aplikace volá stejnou funkci se čtyřmi údaji (jediná verze chain_submit)
        assert.equal(q(`select count(*) from pg_proc where proname = 'chain_submit'`), '1');
        // Export: použitá pomůcka (jen vlastní)
        const exported = json(as(G, 'select export_my_data();', now));
        assert.deepEqual(exported.pomucky.pouzite.map(row => [row.key, row.kind]), [[`chain:${DAY2}`, 'chain_rescue']]);
        assert.equal(exported.retezovka.find(row => row.day === DAY2).extra_rescue, true);
    });

    await t.test('Záchrana navíc za milníky Řetězovky (blok 37): dohrané dny 10, 30, 100, 365 a celé řetězy bez Záchrany 5, 15, 30, 60', () => {
        const DAY3 = '2026-11-20';
        const now = at('13:00', DAY3);
        const [M, N, O, P] = [61, 62, 63, 64].map(id);
        q([M, N, O, P].map((uid, i) => `insert into auth.users (id, email) values ('${uid}', 'm${i}@example.com');`).join('\n'));
        // Dřívější dny přímo do tabulky: days = počet dní, clean = z nich celé řetězy bez Záchrany
        const past = (uid, days, clean) => q(`insert into chain_results (day, user_id, links, score, rescued)
            select date '2026-09-01' + n, '${uid}', case when n < ${clean} then 7 else 2 end, case when n < ${clean} then 28 else 3 end, false from generate_series(0, ${days - 1}) n`);
        const pickItem = (item) => item && [item.kind, item.granted, item.full, item.source, item.at];
        // M: 9 dní, desátý dá Záchranu navíc; jedenáctý už ne
        past(M, 9, 0);
        assert.deepEqual(pickItem(json(submit(M, 2, 3, false, now, DAY3)).rescue_item), ['chain_rescue', true, false, 'chain-days', 10]);
        assert.equal(json(submit(M, 2, 3, false, at('13:00', '2026-11-21'), '2026-11-21')).rescue_item, undefined, 'jedenáctý den nic');
        // N: 4 celé řetězy bez Záchrany, pátý dá Záchranu navíc (k tomu Půl na půl za celý řetěz)
        past(N, 4, 4);
        const n = json(submit(N, 7, 28, false, now, DAY3));
        assert.deepEqual(pickItem(n.rescue_item), ['chain_rescue', true, false, 'chain-clean', 5]);
        assert.equal(n.item.kind, 'fifty');
        // Se Záchranou se celý řetěz do milníku nepočítá
        past(O, 4, 4);
        assert.equal(json(submit(O, 7, 22, true, now, DAY3)).rescue_item, undefined);
        // P: oba milníky naráz (10. den a 5. čistý řetěz): jedna pomůcka, druhý milník propadne; s plnou zásobou propadne (full)
        past(P, 9, 4);
        const both = json(submit(P, 7, 28, false, now, DAY3)).rescue_item;
        assert.deepEqual([both.granted, both.count], [true, 1]);
        assert.equal(q(`select string_agg(key || '=' || granted, ',' order by key) from player_item_grants where user_id = '${P}' and kind = 'chain_rescue'`), 'chain-clean:5=false,chain-days:10=true');
        // Hráč, který milníky přeskočil (dny z doby před pomůckou): dostane jen ten nejvyšší a nižší už ne
        const Q = id(65);
        q(`insert into auth.users (id, email) values ('${Q}', 'q@example.com');`);
        past(Q, 40, 0);
        assert.deepEqual(pickItem(json(submit(Q, 1, 1, false, now, DAY3)).rescue_item), ['chain_rescue', true, false, 'chain-days', 30]);
        assert.equal(q(`select count(*) from player_item_grants where user_id = '${Q}'`), '1');
        // Plná zásoba: milník propadne a aplikace řekne „už ji máš“
        const R = id(66);
        q(`insert into auth.users (id, email) values ('${R}', 'r@example.com');`);
        past(R, 9, 0);
        q(`insert into player_items (user_id, kind, count) values ('${R}', 'chain_rescue', 1)`);
        assert.deepEqual(pickItem(json(submit(R, 2, 3, false, now, DAY3)).rescue_item), ['chain_rescue', false, true, 'chain-days', 10]);
    });

    await t.test('export dat obsahuje Řetězovku (jen vlastní) a smazání účtu ji smaže', () => {
        const exported = json(as(A, 'select export_my_data();', at('21:00')));
        assert.equal(exported.retezovka.length, 1);
        assert.deepEqual((({ links, score, rescued }) => ({ links, score, rescued }))(exported.retezovka[0]), { links: 4, score: 10, rescued: false });
        ok(as(E, 'select delete_my_account();', at('21:00')));
        assert.equal(q(`select count(*) from chain_results where user_id = '${E}'`), '0');
    });
});
