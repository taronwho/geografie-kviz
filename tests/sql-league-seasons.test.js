// Ligové sezóny a vitrína v profilu (schéma 18, PostgreSQL 16): vrchol sezóny podle pražského měsíce (hranice měsíce v UTC vs. Praha),
// skončená vs. běžící sezóna, nejlepší sezóna z celé historie, parametr pro cizího hráče, kontrola vitríny (tvar, max. 3, vlastní odznak,
// skutečná sezóna) a pravidla řádků (cizí vitrínu jde číst, ne zapsat). Spouští se jen když je dostupný psql a server (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_seasons_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const as = (role, uid, sql) => psql(dbName, `set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const asUser = (uid, sql) => as('authenticated', uid, sql);
const last = (result) => result.stdout.trim().split('\n').pop();
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const denied = (r, message) => { assert.notEqual(r.status, 0, message || 'mělo selhat'); return r.stderr; };

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

// Měsíce relativně k dnešku (pražský čas), ať test platí kdykoli: m(0) = běžící, m(-1) = minulý …
const M = (offset) => `to_char(date_trunc('month', now() at time zone 'Europe/Prague') + interval '${offset} months', 'YYYY-MM')`;
// Začátek měsíce v Praze jako timestamptz (+ posun v minutách): půlnoc v Praze je 22:00 nebo 23:00 UTC předchozího dne
const START = (offset, minutes = 0) => `((date_trunc('month', now() at time zone 'Europe/Prague') + interval '${offset} months') at time zone 'Europe/Prague' + interval '${minutes} minutes')`;
let seq = 0;
// Ohodnocená výzva hráče s ratingem po ní v daném okamžiku (zápis přímo do tabulek jako správce, bez triggerů výzev)
const rated = (uid, ratingAfter, at) => {
    const code = `S${String(++seq).padStart(5, '0')}`;
    q(`set session_replication_role = replica;
        insert into challenges (id, creator_id, topic, seed, count) values ('${code}', '${uid}', 'mix', 's', 10);
        insert into rating_history (challenge_id, user_id, opponent_id, outcome, delta, rating_after, created_at) values ('${code}', '${uid}', null, 'win', 5, ${ratingAfter}, ${at});`);
};
const seasons = (uid, player = null) => JSON.parse(last(ok(asUser(uid, `select league_seasons(${player ? `'${player}'` : ''})`))));
const month = (offset) => q(`select ${M(offset)}`);

test('SQL: ligové sezóny a vitrína v profilu', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');
    for (let run = 0; run < 2; run++) { const r = psql(dbName, '', schema); assert.equal(r.status, 0, `schema.sql běh ${run + 1}: ${r.stderr}`); }
    q(`insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com'), ('${C}', 'c@example.com')`);

    await t.test('bez ohodnocené výzvy: žádná sezóna, žádná nejlepší; nepřihlášený nic', () => {
        const data = seasons(A);
        assert.equal(data.month, month(0));
        assert.deepEqual(data.seasons, []);
        assert.equal(data.best, null);
        denied(as('anon', null, 'select league_seasons()'), 'anon funkci nevolá');
        denied(as('authenticated', null, 'select league_seasons()'), 'bez přihlášení chyba');
        denied(asUser(A, `select league_month_peak('${A}', '2026-01')`), 'pomocná funkce není pro klienta');
        denied(asUser(A, `select * from league_peaks('${A}')`), 'pomocná funkce není pro klienta');
    });

    await t.test('vrchol sezóny = nejvyšší rating v pražském měsíci; hranice měsíce podle Prahy, ne UTC', () => {
        // Minulý měsíc: 1300 (Zlato), pak pokles; vrchol zůstává Zlato
        rated(A, 1300, START(-1, 60 * 24 * 3));
        rated(A, 1180, START(-1, 60 * 24 * 5));
        // 30 minut po půlnoci v Praze (v UTC je to ještě předchozí měsíc): patří do minulého měsíce, ne předminulého
        rated(A, 1420, START(-1, 30));
        // 30 minut před půlnocí v Praze na konci předminulého měsíce (v UTC už stejný den): patří do předminulého
        rated(A, 1560, START(-1, -30));
        // Konec minulého měsíce: 30 minut před začátkem běžícího měsíce v Praze je ještě minulý
        rated(A, 1100, START(0, -30));
        // Běžící měsíc: 30 minut po začátku (v UTC ještě minulý den předchozího měsíce)
        rated(A, 1260, START(0, 30));
        const data = seasons(A);
        assert.deepEqual(data.seasons.map(row => [row.month, row.league, row.peak, row.games, row.finished]), [
            [month(0), 'zlato', 1260, 1, false],
            [month(-1), 'platina', 1420, 4, true],
            [month(-2), 'diamant', 1560, 1, true]
        ]);
        assert.deepEqual(data.best, { month: month(-2), league: 'diamant', peak: 1560 }, 'nejlepší skončená sezóna');
    });

    await t.test('běžící měsíc se do nejlepší sezóny nepočítá; historie jen 12 skončených měsíců, nejlepší ze všech', () => {
        rated(A, 1800, START(0, 60 * 24));
        let data = seasons(A);
        assert.equal(data.seasons[0].league, 'mistr');
        assert.equal(data.seasons[0].finished, false);
        assert.equal(data.best.league, 'diamant', 'Mistr v běžícím měsíci zatím není výsledek sezóny');
        // Před 14 měsíci Mistr: v historii (12 měsíců) není, nejlepší sezóna ho ale má (rámeček zůstává navždy)
        rated(A, 1750, START(-14, 60 * 24 * 10));
        rated(A, 1150, START(-12, 60 * 24 * 10));
        data = seasons(A);
        assert.ok(!data.seasons.some(row => row.month === month(-14)), 'starší než rok v historii není');
        assert.ok(data.seasons.some(row => row.month === month(-12)), 'přesně 12 skončených měsíců zpět ano');
        assert.deepEqual(data.best, { month: month(-14), league: 'mistr', peak: 1750 });
        // Stejný nejvyšší rating dvakrát: platí dřívější měsíc
        rated(A, 1750, START(-3, 60 * 24 * 2));
        assert.equal(seasons(A).best.month, month(-14));
    });

    await t.test('sezóny cizího hráče jen s veřejnými údaji', () => {
        rated(B, 1255, START(-1, 60 * 24 * 7));
        const data = seasons(A, B);
        assert.deepEqual(data.seasons.map(row => Object.keys(row).sort()), [['finished', 'games', 'league', 'month', 'peak']]);
        assert.equal(data.seasons[0].league, 'zlato');
        assert.equal(data.best.league, 'zlato');
        assert.deepEqual(seasons(C).seasons, []);
    });

    await t.test('vitrína: tvar, nejvýš 3, jen vlastní odznak a skutečná skončená sezóna', () => {
        q(`update profiles set badges = array['vitez', 'serie-60'] where id = '${A}'`);
        const save = (uid, items) => asUser(uid, `update profiles set showcase = array[${items.map(item => `'${item}'`).join(', ')}]::text[] where id = '${uid}'`);
        const showcase = (uid) => q(`select array_to_string(showcase, ',') from profiles where id = '${uid}'`);
        assert.equal(showcase(A), '', 'výchozí prázdná');
        ok(save(A, ['b:vitez', `l:${month(-1)}:platina`, 'd:zemepis']));
        assert.equal(showcase(A), `b:vitez,l:${month(-1)}:platina,d:zemepis`);
        // Špatný tvar a víc než 3 položky: celá změna se odmítne
        for (const bad of [['b:Vitez'], ['x:vitez'], ['b:vitez', 'b:serie-60', 'd:zemepis', 'd:vlajky'], ['<script>'], ['l:2026-13:zlato'], ['l:2026-10:zelezo'], ['d:' + 'a'.repeat(25)], ['b:vitez,d:zemepis']]) {
            denied(save(A, bad), bad.join('|'));
        }
        denied(asUser(A, `update profiles set showcase = array['b:vitez', null]::text[] where id = '${A}'`), 'prázdná položka');
        denied(asUser(A, `update profiles set showcase = null where id = '${A}'`), 'null místo pole');
        assert.equal(showcase(A), `b:vitez,l:${month(-1)}:platina,d:zemepis`, 'po odmítnutí beze změny');
        // Odznak, který hráč nemá, a vymyšlená sezóna se tiše vyřadí; opakování taky
        ok(save(A, ['b:gladiator', 'b:serie-60', 'b:serie-60']));
        assert.equal(showcase(A), 'b:serie-60');
        ok(save(A, [`l:${month(-1)}:diamant`, `l:${month(-2)}:diamant`, `l:${month(-4)}:zlato`]));
        assert.equal(showcase(A), `l:${month(-2)}:diamant`, 'jen sezóna s tímhle vrcholem');
        ok(save(A, [`l:${month(0)}:mistr`, `l:${month(1)}:zlato`]));
        assert.equal(showcase(A), '', 'běžící ani budoucí sezónu vystavit nejde');
        // Odznak poslaný ve stejné změně (sjednotí ho profiles_protect_rating) jde vystavit hned
        ok(asUser(A, `update profiles set badges = array['gladiator'], showcase = array['b:gladiator', 'b:neexistuje'] where id = '${A}'`));
        assert.equal(showcase(A), 'b:gladiator');
        // Prázdná vitrína jde uložit
        ok(save(A, []));
        assert.equal(showcase(A), '');
    });

    await t.test('pravidla řádků: cizí vitrínu jde číst, ne zapsat', () => {
        q(`update profiles set showcase = array['b:vitez'] where id = '${A}'`);
        assert.equal(last(ok(asUser(B, `select array_to_string(showcase, ',') from profiles where id = '${A}'`))), 'b:vitez');
        assert.equal(last(ok(asUser(B, `with u as (update profiles set showcase = array['d:zemepis'] where id = '${A}' returning 1) select count(*) from u`))), '0');
        assert.equal(q(`select array_to_string(showcase, ',') from profiles where id = '${A}'`), 'b:vitez');
        denied(as('anon', null, `select showcase from profiles where id = '${A}'`), 'anon profily nečte');
        // Export dat obsahuje vitrínu (celý řádek profilu)
        assert.match(last(ok(asUser(A, 'select export_my_data()'))), /"showcase": \["b:vitez"\]/);
        assert.equal(q('select schema_version()'), '18');
    });
});
