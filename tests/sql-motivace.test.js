// Motivace (blok 32, PostgreSQL 16): Pozvi kamarády (kód přítele, jen nový účet, jednou, ne vlastní, ne přes blok ani navzájem, přátelství,
// kamarád se počítá až po 3 hrách známých serveru, odměny za 1/3/10 kamarádů a za první hru jednou za účet), reakce jen odemčené (úroveň,
// odznak i vyšším stupněm, Sezóna, pozvánky; i při změně reakce), kontrola odemčení v profilu (rámeček, titul, sova, obrázek, vítězný efekt;
// dar v účtu u věcí za úroveň, prestiž a pozvánky jen podle serveru, změny od serveru se nekontrolují, uložené hodnoty zůstanou),
// prestiž (jen přes prestige_up a s dostatkem XP) a vitrína s titulem a věcmi ze Sezóny. Spouští se jen s dostupným psql (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_motivace_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const D = '44444444-4444-4444-4444-444444444444';
const OLD = '55555555-5555-5555-5555-555555555555';
const as = (role, uid, sql) => psql(dbName, `set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const asUser = (uid, sql) => as('authenticated', uid, sql);
const last = (result) => result.stdout.trim().split('\n').pop();
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const denied = (r, pattern) => { assert.notEqual(r.status, 0, 'mělo selhat'); if (pattern) assert.match(r.stderr, pattern); return r.stderr; };
const json = (r) => JSON.parse(last(ok(r)));

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

let seq = 0;
// Hra, kterou zná server: dohraný Kvíz dne v jiném dni (zápis jako správce, bez triggerů)
const quizGame = (uid) => q(`set session_replication_role = replica; insert into daily_quiz_results (user_id, day, answered, correct, score, bitmap, finished_at) values ('${uid}', current_date - ${++seq}, 10, 5, 10, 31, now())`);
// Dohraná výzva obou hráčů (pro reakce)
const duel = (a, b) => {
    const code = `M${String(++seq).padStart(5, '0')}`;
    q(`set session_replication_role = replica;
        insert into challenges (id, creator_id, topic, seed, count) values ('${code}', '${a}', 'mix', 's', 10);
        insert into challenge_results (challenge_id, user_id, correct, points) values ('${code}', '${a}', 5, 20), ('${code}', '${b}', 4, 16);`);
    return code;
};
const status = (uid) => json(asUser(uid, 'select referral_status()'));
const profile = (uid, column) => q(`select coalesce(${column}::text, '-') from profiles where id = '${uid}'`);

test('SQL: motivace (pozvánky, reakce, kontrola odemčení, prestiž, vitrína)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) { const r = psql(dbName, '', schema); assert.equal(r.status, 0, `schema.sql běh ${run + 1}: ${r.stderr}`); }
    q(`insert into auth.users (id, email, created_at) values ('${A}', 'a@example.com', now() - interval '200 days'), ('${B}', 'b@example.com', now() - interval '2 days'),
        ('${C}', 'c@example.com', now() - interval '1 day'), ('${D}', 'd@example.com', now()), ('${OLD}', 'old@example.com', now() - interval '30 days')`);
    assert.ok(Number(q('select schema_version()')) >= 32);

    await t.test('kód přítele: založí se jednou, 8 znaků bez zaměnitelných; tabulky klient nezapíše', () => {
        const first = status(A);
        assert.match(first.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
        assert.equal(status(A).code, first.code, 'stejný kód i podruhé');
        assert.equal(first.inviter, null);
        assert.deepEqual([first.invited, first.claimed, first.ready, first.qualified], [[], [], [], 0]);
        assert.equal(first.join_until, null, 'starý účet kód zadat nemůže');
        assert.ok(status(B).join_until, 'nový účet může zadat kód');
        denied(asUser(A, `insert into referral_codes (user_id, code) values ('${A}', 'ABCDEFGH')`));
        denied(asUser(A, `insert into referrals (invitee, inviter) values ('${B}', '${A}')`));
        denied(asUser(A, `insert into referral_rewards (user_id, reward) values ('${A}', 'pritel-1')`));
        denied(as('anon', null, 'select referral_status()'));
        denied(asUser(null, 'select referral_status()'), /Přihlas se/);
        assert.equal(last(asUser(B, `select count(*) from referral_codes`)), '1', 'cizí kód není vidět');
    });

    await t.test('pozvánka: jen nový účet, jednou, ne vlastní, ne neexistující, ne přes blok, ne navzájem; přátelství vznikne', () => {
        const code = status(A).code;
        denied(asUser(A, `select referral_join('${code}')`), /Vlastní kód/);
        denied(asUser(OLD, `select referral_join('${code}')`), /jen pro nové hráče/);
        denied(asUser(B, `select referral_join('XXXXXXXX')`), /neexistuje/);
        const joined = json(asUser(B, `select referral_join('${code.slice(0, 4).toLowerCase()}-${code.slice(4)}')`));
        assert.equal(joined.inviter.id, A, 'malá písmena a pomlčka nevadí');
        assert.equal(json(asUser(B, `select referral_join('${code}')`)).inviter.id, A, 'opakované použití téhož kódu nic nezmění');
        denied(asUser(B, `select referral_join('${status(C).code}')`), /už máš/);
        assert.equal(q(`select status from friendships where user_id = '${B}' and friend_id = '${A}'`), 'accepted');
        // Navzájem: B pozval A? A je starý účet; zkusí to C → B a pak B → C
        ok(asUser(C, `select referral_join('${status(B).code}')`));
        q(`delete from referrals where invitee = '${C}'`);
        q(`insert into referrals (invitee, inviter) values ('${B}', '${C}') on conflict (invitee) do update set inviter = excluded.inviter`);
        denied(asUser(C, `select referral_join('${status(B).code}')`), /nejde/);
        q(`update referrals set inviter = '${A}' where invitee = '${B}'`);
        // Blok
        q(`insert into player_blocks (blocker, blocked) values ('${A}', '${D}')`);
        denied(asUser(D, `select referral_join('${code}')`), /nejde/);
        q(`delete from player_blocks where blocker = '${A}'`);
        const mine = status(B);
        assert.equal(mine.inviter.id, A);
        assert.equal(mine.join_until, null);
        assert.deepEqual(mine.ready, [], 'bez hry odměna nečeká');
    });

    await t.test('odměny: pozvaný po první hře, zvoucí za kamarády s aspoň 3 hrami, každá jednou', () => {
        q(`update profiles set xp = 40 where id = '${B}'`);
        assert.deepEqual(status(B).ready, ['novacek'], 'XP v účtu = první hra');
        assert.deepEqual(json(asUser(B, 'select referral_claim()')), ['novacek']);
        assert.deepEqual(json(asUser(B, 'select referral_claim()')), [], 'podruhé nic');
        assert.deepEqual(status(B).claimed, ['novacek']);
        let host = status(A);
        assert.equal(host.invited.length, 1);
        assert.deepEqual([host.invited[0].games, host.invited[0].qualified, host.qualified], [0, false, 0]);
        assert.deepEqual(host.ready, [], 'kamarád bez her se nepočítá');
        quizGame(B); quizGame(B);
        assert.equal(status(A).qualified, 0, 'dvě hry nestačí');
        quizGame(B);
        host = status(A);
        assert.deepEqual([host.invited[0].games, host.invited[0].qualified, host.qualified], [3, true, 1]);
        assert.deepEqual(host.ready, ['pritel-1']);
        assert.deepEqual(json(asUser(A, 'select referral_claim()')), ['pritel-1']);
        assert.deepEqual(json(asUser(A, 'select referral_claim()')), []);
        // Další dva kamarádi (C, D) s hrami: odměna za 3
        ok(asUser(C, `select referral_join('${status(A).code}')`));
        ok(asUser(D, `select referral_join('${status(A).code}')`));
        for (const uid of [C, D]) { quizGame(uid); quizGame(uid); quizGame(uid); }
        assert.deepEqual(status(A).ready, ['pritel-3']);
        assert.deepEqual(json(asUser(A, 'select referral_claim()')), ['pritel-3']);
        assert.equal(status(A).qualified, 3);
        assert.ok(!status(A).ready.includes('pritel-10'));
    });

    await t.test('reakce: základní vždy, další jen odemčené (úroveň, odznak i vyšším stupněm, Sezóna, pozvánky), i při změně', () => {
        const code = duel(C, D);
        const react = (from, to, emoji) => asUser(from, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('${code}', '${from}', '${to}', '${emoji}')
            on conflict (challenge_id, match_id, from_id) do update set emoji = excluded.emoji`);
        ok(react(C, D, '👍'));
        denied(react(C, D, '😮'), /odemčenou/);
        denied(react(C, D, '💩'), /odemčenou|emoji_list/);
        q(`update profiles set xp = 750 where id = '${C}'`);
        ok(react(C, D, '😮'));
        assert.equal(q(`select emoji from match_reactions where challenge_id = '${code}' and from_id = '${C}'`), '😮');
        denied(react(C, D, '🎯'), /odemčenou/);
        q(`update profiles set badges = array['neomylny'] where id = '${C}'`);
        ok(react(C, D, '🎯'));
        denied(react(C, D, '🎉'), /odemčenou/);
        q(`update profiles set rewards = '{"gifts": {"frames": ["sezona-11-b"]}}' where id = '${C}'`);
        ok(react(C, D, '🎉'));
        denied(react(C, D, '👑'), /odemčenou/);
        // Odměna za 3 kamarády (A ji vyzvedl): 🤗
        const second = duel(A, D);
        ok(asUser(A, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('${second}', '${A}', '${D}', '🤗')`));
        denied(asUser(D, `insert into match_reactions (challenge_id, from_id, to_id, emoji) values ('${second}', '${D}', '${A}', '🤗')`), /odemčenou/);
    });

    await t.test('kontrola odemčení: rámeček podle úrovně, odznaku i vyššího stupně, ligy, daru v účtu; prestiž a pozvánky jen podle serveru', () => {
        const setFrame = (uid, frame) => ok(asUser(uid, `update profiles set frame = '${frame}' where id = '${uid}'`));
        q(`update profiles set xp = 0, badges = '{}', rewards = null, frame = null where id = '${D}'`);
        setFrame(D, 'zlato');
        assert.equal(profile(D, 'frame'), '-', 'úroveň 1 Zlatý nemá');
        q(`update profiles set xp = 20500 where id = '${D}'`);
        setFrame(D, 'zlato');
        assert.equal(profile(D, 'frame'), 'zlato', 'úroveň 25');
        setFrame(D, 'diamant');
        assert.equal(profile(D, 'frame'), 'zlato', 'zamčený se nepřijme, zůstane předchozí');
        q(`update profiles set rewards = '{"gifts": {"frames": ["diamant", "prestiz", "parta"]}}' where id = '${D}'`);
        setFrame(D, 'diamant');
        assert.equal(profile(D, 'frame'), 'diamant', 'dar z truhly odemyká dřív');
        setFrame(D, 'prestiz');
        assert.equal(profile(D, 'frame'), 'diamant', 'prestiž darem nejde');
        setFrame(D, 'parta');
        assert.equal(profile(D, 'frame'), 'diamant', 'Parta darem nejde');
        setFrame(D, 'plamen');
        assert.equal(profile(D, 'frame'), 'diamant');
        q(`update profiles set badges = array['serie-100'] where id = '${D}'`);
        setFrame(D, 'plamen');
        assert.equal(profile(D, 'frame'), 'plamen', 'Věrný měsíc dopočítaný z vyššího stupně série');
        setFrame(D, 'pratelsky');
        assert.equal(profile(D, 'frame'), 'plamen', 'bez odměny za pozvání ne');
        setFrame(A, 'pratelsky');
        assert.equal(profile(A, 'frame'), 'pratelsky', 'A má odměnu pritel-1');
        setFrame(B, 'pratelsky');
        assert.equal(profile(B, 'frame'), 'pratelsky', 'B má odměnu novacek');
        setFrame(D, 'neexistuje');
        assert.equal(profile(D, 'frame'), 'plamen', 'neznámý rámeček ne');
        ok(asUser(D, `update profiles set frame = null where id = '${D}'`));
        assert.equal(profile(D, 'frame'), '-', 'bez rámečku jde vždy');
        setFrame(D, 'liga-zlato');
        assert.equal(profile(D, 'frame'), '-', 'bez ligové sezóny ne');
        q(`set session_replication_role = replica;
            insert into challenges (id, creator_id, topic, seed, count) values ('LIGA01', '${D}', 'mix', 's', 10);
            insert into rating_history (challenge_id, user_id, opponent_id, outcome, delta, rating_after, created_at) values ('LIGA01', '${D}', null, 'win', 5, 1420, now() - interval '45 days');`);
        setFrame(D, 'liga-zlato');
        assert.equal(profile(D, 'frame'), 'liga-zlato', 'Platina v minulé sezóně odemkne i Zlato');
        setFrame(D, 'liga-diamant');
        assert.equal(profile(D, 'frame'), 'liga-zlato');
        // Správce a serverové funkce se nekontrolují; uložená hodnota se změnou jiného sloupce nezmění
        q(`update profiles set frame = 'galaxie' where id = '${D}'`);
        ok(asUser(D, `update profiles set display_name = 'Dana Test', frame = 'galaxie' where id = '${D}'`));
        assert.equal(profile(D, 'frame'), 'galaxie', 'stávající hodnota zůstane');
    });

    await t.test('titul, obrázek, sova a vítězný efekt', () => {
        q(`update profiles set xp = 0, badges = array['gladiator'], rewards = null, title_pref = null, avatar = '🦊', owl = null, victory_fx = null where id = '${D}'`);
        ok(asUser(D, `update profiles set title_pref = 'vitez' where id = '${D}'`));
        assert.equal(profile(D, 'title_pref'), 'vitez', 'nižší stupeň odznaku jde');
        ok(asUser(D, `update profiles set title_pref = 'vyhry-25' where id = '${D}'`));
        assert.equal(profile(D, 'title_pref'), 'vitez', 'vyšší stupeň bez odznaku ne');
        ok(asUser(D, `update profiles set title_pref = 'sampion-sezony' where id = '${D}'`));
        assert.equal(profile(D, 'title_pref'), 'vitez', 'titul ze Sezóny jen s darem');
        q(`update profiles set rewards = '{"gifts": {"titles": ["sampion-sezony"], "avatars": ["caj"]}}' where id = '${D}'`);
        ok(asUser(D, `update profiles set title_pref = 'sampion-sezony' where id = '${D}'`));
        assert.equal(profile(D, 'title_pref'), 'sampion-sezony');
        ok(asUser(D, `update profiles set avatar = 'fenix3' where id = '${D}'`));
        assert.equal(profile(D, 'avatar'), '🦊', 'Fénix až od úrovně 80');
        ok(asUser(D, `update profiles set avatar = '👑' where id = '${D}'`));
        assert.equal(profile(D, 'avatar'), '🦊', 'ani starým emoji');
        ok(asUser(D, `update profiles set avatar = 'caj12' where id = '${D}'`));
        assert.equal(profile(D, 'avatar'), 'caj12', 'sezónní postavička z daru');
        ok(asUser(D, `update profiles set avatar = '🐼' where id = '${D}'`));
        assert.equal(profile(D, 'avatar'), '🐼', 'základní emoji volně');
        const owl = 'robe=zelena;pose=titul-5;head=koruna.modra;face=bryle.fialova;neck=sala.h120;hand=vlajka.original.q213;x=y';
        ok(asUser(D, `update profiles set owl = '${owl}' where id = '${D}'`));
        assert.equal(profile(D, 'owl'), 'robe=vinova;pose=titul-1;x=y', 'úroveň 1: zamčené části pryč, talár vínový, sova titulu nejnižší');
        q(`update profiles set xp = 13000 where id = '${D}'`);
        ok(asUser(D, `update profiles set owl = '${owl}' where id = '${D}'`));
        assert.equal(profile(D, 'owl'), 'robe=zelena;pose=titul-4;face=bryle.original;neck=sala.original;x=y', 'úroveň 20: brýle a šála bez zamčených barev');
        ok(asUser(D, `update profiles set owl = '${'a'.repeat(200)}' where id = '${D}'`));
        assert.equal(profile(D, 'owl'), 'a'.repeat(200), 'text bez částí zůstane (tvar hlídá jen kontrola)');
        ok(asUser(D, `update profiles set victory_fx = 'koruna' where id = '${D}'`));
        assert.equal(profile(D, 'victory_fx'), '-');
        ok(asUser(D, `update profiles set victory_fx = 'hvezdy' where id = '${D}'`));
        assert.equal(profile(D, 'victory_fx'), 'hvezdy', 'úroveň 20');
        ok(asUser(A, `update profiles set victory_fx = 'srdicka' where id = '${A}'`));
        assert.equal(profile(A, 'victory_fx'), 'srdicka', 'za 3 kamarády');
        denied(asUser(D, `update profiles set victory_fx = 'Bad fx' where id = '${D}'`), /victory_fx_format/);
        ok(asUser(D, `update profiles set victory_fx = 'neexistuje' where id = '${D}'`));
        assert.equal(profile(D, 'victory_fx'), 'hvezdy', 'neznámý efekt se nepřijme');
        denied(asUser(D, `update profiles set frame = 'a b' where id = '${D}'`), /frame_format/);
        assert.equal(last(asUser(D, `with u as (update profiles set victory_fx = 'konfety' where id = '${A}' returning 1) select count(*) from u`)), '0', 'cizí ne');
    });

    await t.test('prestiž: jen přes prestige_up a s dostatkem XP v účtu; další o 49 500 XP později', () => {
        denied(asUser(D, `update profiles set prestige = 3 where id = '${D}'`));
        denied(asUser(D, `update profiles set prestige_xp = 1 where id = '${D}'`));
        q(`update profiles set xp = 329999 where id = '${D}'`);
        denied(asUser(D, 'select prestige_up()'), /chybí 1 XP/);
        q(`update profiles set xp = 340000 where id = '${D}'`);
        assert.deepEqual(json(asUser(D, 'select prestige_up()')), { prestige: 1, prestige_xp: 340000 });
        denied(asUser(D, 'select prestige_up()'), /chybí 49500 XP/);
        ok(asUser(D, `update profiles set frame = 'prestiz' where id = '${D}'`));
        assert.equal(profile(D, 'frame'), 'prestiz', 'rámeček Prestižní po první prestiži');
        q(`update profiles set xp = 389500 where id = '${D}'`);
        assert.deepEqual(json(asUser(D, 'select prestige_up()')), { prestige: 2, prestige_xp: 389500 });
        denied(as('anon', null, 'select prestige_up()'));
        assert.equal(last(asUser(A, `select prestige from profiles where id = '${D}'`)), '2', 'prestiž ostatních je vidět');
    });

    await t.test('vitrína: titul a věci ze Sezóny jen s darem v účtu; tvar', () => {
        q(`update profiles set rewards = '{"gifts": {"titles": ["sampion-sezony"], "frames": ["sezona-11", "duha-mracky"], "avatars": ["caj"]}}', showcase = '{}' where id = '${C}'`);
        ok(asUser(C, `update profiles set showcase = array['t:sampion-sezony', 's:frames:sezona-11', 's:avatars:caj'] where id = '${C}'`));
        assert.equal(q(`select array_to_string(showcase, ',') from profiles where id = '${C}'`), 't:sampion-sezony,s:frames:sezona-11,s:avatars:caj');
        ok(asUser(C, `update profiles set showcase = array['s:frames:sezona-12', 's:frames:duha-mracky', 's:accessories:lampion'] where id = '${C}'`));
        assert.equal(q(`select array_to_string(showcase, ',') from profiles where id = '${C}'`), '', 'bez daru a mimo Sezónu se tiše vyřadí');
        denied(asUser(C, `update profiles set showcase = array['s:robes:zelena'] where id = '${C}'`));
        denied(asUser(C, `update profiles set showcase = array['t:Sampion'] where id = '${C}'`));
    });

    await t.test('export dat má pozvánky; smazání účtu je smaže', () => {
        const data = json(asUser(A, 'select export_my_data()'));
        assert.equal(data.pozvanky.kod, status(A).code);
        assert.equal(data.pozvanky.pozvani.length, 3);
        assert.deepEqual(data.pozvanky.odmeny.map(row => row.reward), ['pritel-1', 'pritel-3']);
        assert.equal(json(asUser(B, 'select export_my_data()')).pozvanky.pozval_me.hrac, A);
        q(`delete from profiles where id = '${C}'`);
        assert.equal(q(`select count(*) from referrals where invitee = '${C}' or inviter = '${C}'`), '0');
    });
});
