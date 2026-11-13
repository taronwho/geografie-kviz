// Kamarádské sázky v databázi (PostgreSQL, blok 21): nabídka jen zakladatele výzvy konkrétnímu hráči a jen před začátkem hry, vklad 10/25/50 XP
// do limitu z XP posledních 7 dní (xp_weekly) bez otevřených sázek, hláška jen 0–7, odpověď jen vyzvaného před jeho první otázkou (kdo začne hrát
// bez odpovědi, hraje bez sázky), vyrovnání každého hráče jednou (výhra +vklad, prohra −vklad jen nad hranicí úrovně, remíza nic, týdenní XP),
// součty bet_won a bet_lost, přehled mých sázek a statistika hráče (řada výher), oprávnění (klient sloupce sázky ani součty nezapíše, anon nic).
// Spouští se jen s psql a serverem (viz tests/sql-rating.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('../quiz-core.js');
const { challengeProgressSql } = require('./sql-play.js');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_bets_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

// Čtvrtek 12. 11. 2026: týden od pondělí 9. 11., z minulého týdne (od 2. 11.) se počítají 3/7
const DAY = '2026-11-12';
const MONDAY = '2026-11-09';
const LAST_MONDAY = '2026-11-02';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const as = (uid, sql, role = 'authenticated', day = DAY) => psql(dbName, `set mudrlant.test_today = '${day}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
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

const [A, B, C, D] = [1, 2, 3, 4].map(id);
let codeNo = 0;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';
// Nová výzva hráče creator pro hráče invited (kód z písmen, jako aplikace: 6 znaků)
const challenge = (creator, invited = null, count = 5) => {
    const n = codeNo++;
    const code = `S${ALPHA[Math.floor(n / ALPHA.length) % ALPHA.length]}${ALPHA[n % ALPHA.length]}234`;
    ok(as(creator, `insert into challenges (id, creator_id, topic, seed, count, invited_id) values ('${code}', '${creator}', 'zemepis', 'vyzva-${code}', ${count}, ${invited ? `'${invited}'` : 'null'});`));
    return code;
};
// Celá hra hráče (odpovědi po otázkách a výsledek, jako aplikace)
const play = (code, uid, correct, points, count = 5) => ok(as(uid, `${challengeProgressSql(code, count, correct, points)} insert into challenge_results (challenge_id, user_id, correct, points) values ('${code}', '${uid}', ${correct}, ${points});`));
const offer = (uid, code, amount, taunt = 'null') => as(uid, `select challenge_offer_stake('${code}', ${amount}, ${taunt});`);
const answer = (uid, code, accept) => as(uid, `select challenge_answer_stake('${code}', ${accept});`);
const settle = (uid, code) => json(as(uid, `select challenge_settle_stake('${code}');`));
const xpOf = (uid) => Number(q(`select xp from profiles where id = '${uid}'`));
const setXp = (uid, xp) => q(`update profiles set xp = ${xp} where id = '${uid}'; delete from xp_weekly where user_id = '${uid}';`);
const setWeek = (uid, thisWeek, lastWeek = 0) => q(`delete from xp_weekly where user_id = '${uid}'; insert into xp_weekly (user_id, week, gained) values ('${uid}', '${MONDAY}', ${thisWeek}), ('${uid}', '${LAST_MONDAY}', ${lastWeek});`);
const weekGained = (uid) => Number(q(`select coalesce((select gained from xp_weekly where user_id = '${uid}' and week = '${MONDAY}'), 0)`));

test('SQL: Kamarádské sázky', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    // Schéma jde spustit opakovaně (idempotentní migrace)
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q([A, B, C, D].map((uid, i) => `insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', 'u${i + 1}@example.com', '{"full_name": "Hráč ${i + 1}"}');`).join('\n'));

    await t.test('sloupce a součty, hranice úrovní jako v quiz-core.js, odznaky sázek (Sázkař, Neomylný sázkař) v katalogu', () => {
        assert.equal(q(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name = 'challenges' and column_name like 'stake%' or (table_name = 'challenges' and column_name = 'taunt')`),
            'stake,stake_delta_creator,stake_delta_opponent,stake_settled_creator,stake_settled_opponent,stake_state,taunt');
        assert.equal(q(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name = 'profiles' and column_name like 'bet_%'`), 'bet_lost,bet_won');
        // Každá hranice úrovně je sama sebou, o 1 XP níž je předchozí úroveň (stejná tabulka jako LEVEL_XP)
        const floors = q(`select string_agg(stake_level_floor(v)::text || ':' || stake_level_floor(v - 1)::text, ',' order by v) from unnest(array[${core.LEVEL_XP.slice(1).join(',')}]::integer[]) v`).split(',');
        assert.deepEqual(floors, core.LEVEL_XP.slice(1).map((xp, i) => `${xp}:${core.LEVEL_XP[i]}`));
        assert.equal(q('select stake_level_floor(0)'), '0');
        assert.equal(q('select stake_level_floor(999999)'), String(core.LEVEL_XP[core.LEVEL_XP.length - 1]));
        assert.equal(q(`select count(*) from unnest(badge_catalog()) b where b like 'sazk%'`), '10');
        assert.equal(q(`select count(*) from unnest(badge_catalog()) b where b in ('sazkar', 'sazky-v-rade-5')`), '2');
    });

    await t.test('anon nic; hráč nevolá pomocné funkce, sloupce sázky ani součty nezapíše', () => {
        const code = challenge(A, B);
        for (const sql of [`select challenge_offer_stake('${code}', 10, null);`, `select challenge_answer_stake('${code}', true);`, `select challenge_settle_stake('${code}');`, 'select challenge_stakes();', `select challenge_stake_stats('${A}');`]) {
            denied(as(null, sql, 'anon'), null, `anon: ${sql}`);
        }
        for (const sql of [`select stake_level_floor(100);`, `select stake_week_xp('${A}');`, `select stake_open('${A}', null);`, `select stake_available('${A}', null);`, `select stake_stats('${A}');`, 'select stake_outcome(1, 1, 0, 0);']) {
            denied(as(A, sql), /permission denied/, `pomocná funkce: ${sql}`);
        }
        denied(as(A, `update profiles set bet_won = 500 where id = '${A}';`), /permission denied/);
        denied(as(A, `update profiles set bet_lost = 0 where id = '${A}';`), /permission denied/);
        denied(as(A, `update challenges set stake = 50, stake_state = 'accepted' where id = '${code}';`), /permission denied/);
        // Výzva založená přímo se sázkou: spoušť sloupce sázky vynuluje
        ok(as(A, `insert into challenges (id, creator_id, topic, seed, count, invited_id, stake, stake_state, taunt, stake_settled_creator, stake_delta_creator) values ('HACK23', '${A}', 'mix', 'vyzva-HACK23', 5, '${B}', 50, 'accepted', 3, true, 50);`));
        assert.equal(q(`select concat_ws('|', stake, stake_state, taunt, stake_settled_creator, stake_delta_creator) from challenges where id = 'HACK23'`), 'f');
    });

    await t.test('nabídka: jen zakladatel výzvy konkrétnímu hráči, 10/25/50 XP, hláška 0–7, do limitu, jen před začátkem hry, jednou', () => {
        setXp(A, 3000); setXp(B, 3000); setXp(C, 3000);
        setWeek(A, 30, 70); // 30 + 70 × 3/7 = 60 → nejvýš 50
        setWeek(B, 12, 0);
        const code = challenge(A, B);
        denied(offer(B, code, 10), /nabídnout nemůžeš: výzva není tvoje/);
        denied(offer(A, challenge(A), 10), /konkrétnímu hráči/, 'výzva přes odkaz');
        const group = challenge(A);
        q(`insert into groups (id, name, icon, code, owner_id) values ('${id(900)}', 'Třída', '🏫', 'GRPABC', '${A}'); insert into group_challenges (challenge_id, group_id) values ('${group}', '${id(900)}');`);
        denied(offer(A, group, 10), /konkrétnímu hráči/, 'výzva skupině');
        for (const amount of [0, 5, 20, 100, -10, 'null']) denied(offer(A, code, amount), /10, 25 nebo 50/, `vklad ${amount}`);
        for (const taunt of [-1, 8, 99]) denied(offer(A, code, 10, taunt), /hláška/, `hláška ${taunt}`);
        const offered = json(offer(A, code, 50, 3));
        assert.deepEqual([offered.stake, offered.state, offered.taunt, offered.role, offered.other], [50, 'offered', 3, 'creator', B]);
        assert.deepEqual(json(offer(A, code, 50, 3)).state, 'offered', 'stejná nabídka znovu nic nemění');
        denied(offer(A, code, 25), /už je nabídnutá/);
        // Limit: otevřená nabídka 50 XP z limitu 60 nechá na další sázku nejvýš 10
        assert.equal(json(as(A, 'select challenge_stakes();')).limit, 10);
        denied(offer(A, challenge(A, C), 25), /nejvýš 10 XP/);
        ok(offer(A, challenge(A, C), 10));
        assert.equal(json(as(A, 'select challenge_stakes();')).limit, 0);
        // Po první odpovědi kohokoli už sázka nejde
        setWeek(C, 500);
        const started = challenge(C, A);
        ok(as(C, `select challenge_progress_save('${started}', 0, true, 2);`));
        denied(offer(C, started, 10), /před začátkem hry/);
    });

    await t.test('odpověď: jen vyzvaný, do jeho limitu, jen před jeho první otázkou a do 7 dní; kdo začne hrát bez odpovědi, hraje bez sázky', () => {
        setXp(A, 3000); setXp(B, 3000); setXp(C, 3000);
        q(`update challenges set created_at = now() - interval '40 days' where stake is not null;`);
        setWeek(A, 200); setWeek(B, 20); setWeek(C, 200);
        const code = challenge(A, B);
        ok(offer(A, code, 25, 0));
        denied(answer(A, code, true), /odpovědět nemůžeš/);
        denied(answer(C, code, true), /odpovědět nemůžeš/);
        denied(answer(B, code, true), /nejvýš 20 XP/, 'vyzvaný má za 7 dní jen 20 XP');
        assert.equal(json(answer(B, code, false)).state, 'declined', 'hrát bez sázky jde vždy');
        assert.equal(json(answer(B, code, false)).state, 'declined', 'stejná odpověď znovu nic nemění');
        denied(answer(B, code, true), /už je odpověď/);
        // Přijetí v limitu
        setWeek(B, 300);
        const second = challenge(A, B);
        ok(offer(A, second, 25));
        const accepted = json(answer(B, second, true));
        assert.deepEqual([accepted.state, accepted.role, accepted.stake], ['accepted', 'opponent', 25]);
        // Bez odpovědi a s první odpovědí: hraje se bez sázky; potom už odpovědět nejde
        const silent = challenge(A, B);
        ok(offer(A, silent, 10));
        ok(as(B, `select challenge_progress_save('${silent}', 0, true, 2);`));
        assert.equal(q(`select stake_state from challenges where id = '${silent}'`), 'declined');
        // Zakladatel začne hrát první: nabídka trvá, vyzvaný ji přijme až potom
        const creatorFirst = challenge(A, C);
        ok(offer(A, creatorFirst, 10));
        play(creatorFirst, A, 3, 9);
        assert.equal(q(`select stake_state from challenges where id = '${creatorFirst}'`), 'offered');
        assert.equal(json(answer(C, creatorFirst, true)).state, 'accepted');
        // Rozehraná výzva: odpověď už nejde
        const begun = challenge(A, C);
        ok(offer(A, begun, 10));
        q(`update challenges set stake_state = 'offered' where id = '${begun}'`);
        q(`insert into challenge_progress (challenge_id, user_id, idx, correct, points) values ('${begun}', '${C}', 1, true, 2)`);
        denied(answer(C, begun, true), /před začátkem hry/);
        // Nabídka po 7 dnech vyprší
        const old = challenge(A, C);
        ok(offer(A, old, 10));
        q(`update challenges set created_at = now() - interval '8 days' where id = '${old}'`);
        denied(answer(C, old, true), /vypršela/);
        assert.equal(json(as(C, 'select challenge_stakes();')).rows.find(row => row.id === old).expired, true);
        denied(as(C, `select challenge_answer_stake('${challenge(A, C)}', true);`), /žádná sázka/);
    });

    await t.test('vyrovnání: až po dohrání obou; výhra +vklad, prohra −vklad jen nad hranicí úrovně, remíza nic; každý jednou; týdenní XP a součty', () => {
        q(`update challenges set created_at = now() - interval '40 days' where stake is not null;`);
        setXp(A, 3000); setXp(B, 2610);
        setWeek(A, 400); setWeek(B, 400);
        const code = challenge(A, B);
        ok(offer(A, code, 50, 5));
        ok(answer(B, code, true));
        play(code, A, 4, 14);
        const waiting = settle(A, code);
        assert.deepEqual([waiting.state, waiting.outcome, waiting.fresh, waiting.done, waiting.other_done], ['accepted', null, false, true, false], 'čeká se na soupeře');
        assert.equal(xpOf(A), 3000);
        denied(as(C, `select challenge_settle_stake('${code}');`), /nepatří/);
        play(code, B, 4, 10);
        // B prohrál: úroveň 9 začíná na 2600 XP, odečte se jen 10 XP (ne 50)
        const lost = settle(B, code);
        assert.deepEqual([lost.outcome, lost.delta, lost.fresh, lost.xp, lost.lost, lost.won, lost.settled, lost.other_settled], ['loss', -10, true, 2600, 10, 0, true, false]);
        assert.equal(xpOf(B), 2600);
        assert.equal(core.levelFromXp(2600), core.levelFromXp(2610), 'úroveň neklesla');
        assert.equal(weekGained(B), 390, 'prohra se odečte z týdenních XP');
        const again = settle(B, code);
        assert.deepEqual([again.fresh, again.delta, xpOf(B)], [false, -10, 2600], 'podruhé nic');
        const won = settle(A, code);
        assert.deepEqual([won.outcome, won.delta, won.fresh, won.xp, won.won, won.other_settled], ['win', 50, true, 3050, 50, true]);
        assert.equal(weekGained(A), 450, 'výhru připíše do týdne spoušť count_weekly_xp');
        assert.equal(settle(A, code).fresh, false);
        assert.equal(xpOf(A), 3050);
        assert.equal(q(`select concat_ws('|', stake_settled_creator, stake_settled_opponent, stake_delta_creator, stake_delta_opponent) from challenges where id = '${code}'`), 't|t|50|-10');
        // Remíza: nic se nemění, ale je vyrovnaná
        const draw = challenge(B, A);
        ok(offer(B, draw, 10));
        ok(answer(A, draw, true));
        play(draw, A, 3, 9);
        play(draw, B, 3, 9);
        const drawn = settle(A, draw);
        assert.deepEqual([drawn.outcome, drawn.delta, drawn.fresh, xpOf(A)], ['draw', 0, true, 3050]);
        // Hráč na hranici úrovně nepřijde o nic (prohra se zapíše jako −0)
        setXp(B, 2600);
        setWeek(B, 400);
        const edge = challenge(A, B);
        ok(offer(A, edge, 25));
        ok(answer(B, edge, true));
        play(edge, A, 5, 20);
        play(edge, B, 1, 2);
        assert.deepEqual([settle(B, edge).delta, xpOf(B)], [0, 2600]);
        // Odmítnutá sázka: vyrovnání nic nedělá
        const declined = challenge(A, B);
        ok(offer(A, declined, 10));
        ok(answer(B, declined, false));
        play(declined, A, 5, 20);
        play(declined, B, 0, 0);
        const none = settle(A, declined);
        assert.deepEqual([none.state, none.fresh, none.settled], ['declined', false, false]);
        assert.equal(xpOf(A), 3050);
        // Výzva bez sázky
        const plain = challenge(A, B);
        assert.equal(settle(A, plain).state, null);
    });

    await t.test('přehled mých sázek a statistika hráče: bilance, výhry, prohry, nejdelší a současná řada výher', () => {
        q(`update challenges set created_at = now() - interval '40 days' where stake is not null;`);
        setXp(C, 20000); setXp(D, 20000);
        setWeek(C, 5000); setWeek(D, 5000);
        // C proti D: výhra, výhra, prohra, výhra, výhra, výhra (nejdelší řada 3, současná 3)
        [true, true, false, true, true, true].forEach((cWins, i) => {
            const code = i % 2 ? challenge(D, C) : challenge(C, D);
            const creator = i % 2 ? D : C;
            const opponent = creator === C ? D : C;
            ok(offer(creator, code, 10, i));
            ok(answer(opponent, code, true));
            play(code, C, cWins ? 5 : 1, cWins ? 20 : 3);
            play(code, D, cWins ? 1 : 5, cWins ? 3 : 20);
            settle(C, code);
        });
        const mine = json(as(C, 'select challenge_stakes();'));
        assert.deepEqual(mine.stats, { bets: 6, wins: 5, losses: 1, draws: 0, balance: 40, best: 3, streak: 3 });
        // Starší nevyrovnaná přijatá sázka (C ji ještě nedohrál) v přehledu zůstává, i když je starší než 30 dní
        assert.equal(mine.rows.length, 7);
        assert.equal(mine.rows.filter(row => row.other === A).length, 1);
        const versusD = mine.rows.filter(row => row.other === D);
        assert.ok(versusD.every(row => row.state === 'accepted' && row.settled && row.done && row.other_done));
        assert.deepEqual(versusD.map(row => row.outcome), ['win', 'win', 'win', 'loss', 'win', 'win'], 'nejnovější první');
        assert.equal(mine.limit, 50, 'limit nejvýš 50');
        // D své části ještě nevyrovnal: v přehledu je vidí, bilanci zatím nemá
        const theirs = json(as(D, 'select challenge_stakes();'));
        assert.deepEqual([theirs.stats.bets, theirs.stats.wins, theirs.stats.losses, theirs.stats.balance], [6, 1, 5, 0]);
        assert.equal(theirs.rows.filter(row => !row.settled).length, 6);
        assert.equal(theirs.open, 60, 'nevyrovnané sázky blokují limit, dokud je hráč nevyrovná');
        theirs.rows.forEach(row => settle(D, row.id));
        const after = json(as(D, 'select challenge_stakes();'));
        assert.deepEqual([after.open, after.stats.balance, after.rows.filter(row => !row.settled).length], [0, -40, 0]);
        assert.equal(xpOf(D), 20000 - 40);
        // Statistika jiného hráče (profil hráče): jen souhrn
        assert.deepEqual(json(as(A, `select challenge_stake_stats('${C}');`)), mine.stats);
        assert.equal(last(ok(as(A, `select coalesce(challenge_stake_stats('${id(777)}')::text, 'žádný');`))), 'žádný', 'neznámý hráč');
    });

    await t.test('limit z posledních 7 dní: tento týden celý a poměrná část minulého (pondělí 6/7, neděle nic)', () => {
        q(`update challenges set created_at = now() - interval '40 days' where stake is not null;`);
        setWeek(A, 7, 49);
        const limitOn = (day) => json(as(A, 'select challenge_stakes();', 'authenticated', day)).week_xp;
        assert.equal(limitOn('2026-11-09'), 7 + 42, 'pondělí: 6/7 minulého týdne');
        assert.equal(limitOn('2026-11-12'), 7 + 21, 'čtvrtek: 3/7');
        assert.equal(limitOn('2026-11-15'), 7, 'neděle: jen tento týden');
        setWeek(A, 0, 0);
        assert.equal(json(as(A, 'select challenge_stakes();')).limit, 0, 'bez XP za týden se sázet nedá');
        denied(offer(A, challenge(A, B), 10), /nejvýš 0 XP/);
    });
});
