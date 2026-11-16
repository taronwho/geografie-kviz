// Zamrzlé denní módy (PostgreSQL 16, schéma 33): question_snapshot_claim přijme i semínka Dnešních otázek, Řetězovky, Tajemné otázky (dnešek
// a včerejšek podle Prahy) a Bosse týdne (tento a minulý týden), první zápis platí; daily_snapshots_get je vrátí i nepřihlášenému (anon),
// otázky výzev ne. Budoucí dny, jiné týdny, neplatná semínka a anon zápis neprojdou. Spouští se jen s psql a serverem (viz tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const host = process.env.PGHOST || '/tmp';
const port = process.env.PGPORT || '5439';
const dbName = `mudrlant_daily_snapshots_${process.pid}`;
const psql = (db, sql, file) => spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])], { encoding: 'utf8' });
const probe = spawnSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
const available = probe.status === 0;
const schema = path.join(__dirname, '..', 'supabase', 'schema.sql');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql) => { const r = psql(dbName, sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const TUE = '2026-11-17';
const as = (uid, sql, day = TUE, role = 'authenticated') => psql(dbName, `set mudrlant.test_today = '${day}'; set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false); ${sql}`);
const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };
const last = (r) => r.stdout.trim().split('\n').pop();
const denied = (r, pattern, message) => {
    assert.notEqual(r.status, 0, message || 'mělo selhat');
    if (pattern) assert.match(r.stderr, pattern, message);
    return r.stderr;
};
const sqlText = (text) => `'${String(text).replace(/'/g, "''")}'`;
const question = (title) => ({ topic: 'zemepis', id: 'Q1', title, question: { type: 'name', title, choices: [{ label: 'Praha', correct: true }, { label: 'Brno', correct: false }] }, hints: [] });
const claim = (uid, seed, data, day = TUE, role = 'authenticated') => as(uid, `select question_snapshot_claim(${sqlText(seed)}, ${sqlText(JSON.stringify(data))}::jsonb);`, day, role);
const claimed = (r) => JSON.parse(last(ok(r)));
const publicRows = (seeds, role = 'anon', uid = '') => as(uid, `select seed || '|' || coalesce(data->>'title', data->>'seed', '') from daily_snapshots_get(array[${seeds.map(sqlText).join(',')}]::text[]) order by seed;`, TUE, role);

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

const A = id(1);
const B = id(2);

test('SQL: zamrzlé denní módy (schéma 33)', { skip: !available && 'PostgreSQL není dostupný' }, async (t) => {
    assert.equal(psql('postgres', `create database ${dbName}`).status, 0);
    t.after(() => psql('postgres', `drop database if exists ${dbName} with (force)`));
    q(bootstrap);
    for (let run = 0; run < 2; run++) ok(psql(dbName, '', schema));
    q([1, 2].map(n => `insert into auth.users (id, email, raw_user_meta_data) values ('${id(n)}', 'u${n}@example.com', '{"full_name": "Hráč ${n}"}');`).join('\n'));

    await t.test('Dnešní otázky, Řetězovka, Tajemná otázka a Boss: první zápis platí pro všechny', () => {
        for (const seed of [`mudrlant-dnes-${TUE}:zemepis`, `mudrlant-retezovka-${TUE}`, `mudrlant-tajemna-${TUE}`, 'mudrlant-boss-2026-11-16-1:otazka:0', 'mudrlant-boss-2026-11-16-3:otazka:9']) {
            assert.equal(claimed(claim(A, seed, question(`A ${seed}`))).title, `A ${seed}`, seed);
            assert.equal(claimed(claim(B, seed, question(`B ${seed}`))).title, `A ${seed}`, `${seed}: druhý hráč dostane první uloženou`);
        }
        // Včerejší den (pokus začatý před půlnocí) a minulý týden bosse ještě jdou
        assert.equal(claimed(claim(B, 'mudrlant-dnes-2026-11-16:historie', question('včera'))).title, 'včera');
        assert.equal(claimed(claim(B, 'mudrlant-boss-2026-11-09-2:otazka:4', question('minulý týden'))).title, 'minulý týden');
        // Kvíz dne funguje jako dřív
        assert.equal(claimed(claim(A, `mudrlant-kviz-dne-${TUE}:otazka:0`, question('kvíz'))).title, 'kvíz');
    });

    await t.test('budoucí a staré dny, cizí týdny, neplatná semínka a anon neprojdou', () => {
        denied(claim(A, 'mudrlant-dnes-2026-11-18:zemepis', question('zítra')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-dnes-2026-11-15:zemepis', question('předevčírem')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-retezovka-2026-11-18', question('zítra')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-tajemna-2026-12-01', question('za dva týdny')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-boss-2026-11-23-1:otazka:0', question('příští týden')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-boss-2026-11-17-1:otazka:0', question('úterý není pondělí')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-boss-2026-11-16-4:otazka:0', question('čtvrtý pokus')), /jen za dnešek/);
        denied(claim(A, 'mudrlant-dnes-2026-11-17:Zemepis!', question('x')), /Neplatné semínko/);
        denied(claim(null, `mudrlant-dnes-${TUE}:film`, question('anon'), TUE, 'anon'));
        assert.equal(q(`select count(*) from question_snapshots where seed = 'mudrlant-dnes-${TUE}:film'`), '0');
    });

    await t.test('daily_snapshots_get: host i přihlášený čtou otázky dne, otázky výzev ne', () => {
        q(`insert into challenges (id, creator_id, topic, seed, count) values ('OTEVRE', '${A}', 'zemepis', 'vyzva-OTEVRE-abc123', 3);`);
        assert.equal(claimed(claim(B, 'vyzva-OTEVRE-abc123:0', question('výzva'))).title, 'výzva');
        const seeds = [`mudrlant-dnes-${TUE}:zemepis`, `mudrlant-kviz-dne-${TUE}:otazka:0`, `mudrlant-retezovka-${TUE}`, 'mudrlant-boss-2026-11-16-1:otazka:0', 'vyzva-OTEVRE-abc123:0', `mudrlant-dnes-${TUE}:film`];
        const anon = ok(publicRows(seeds)).stdout.trim().split('\n').filter(line => line.includes('|'));
        assert.deepEqual(anon, [`mudrlant-boss-2026-11-16-1:otazka:0|A mudrlant-boss-2026-11-16-1:otazka:0`, `mudrlant-dnes-${TUE}:zemepis|A mudrlant-dnes-${TUE}:zemepis`,
            `mudrlant-kviz-dne-${TUE}:otazka:0|kvíz`, `mudrlant-retezovka-${TUE}|A mudrlant-retezovka-${TUE}`]);
        assert.deepEqual(ok(publicRows(seeds, 'authenticated', B)).stdout.trim().split('\n').filter(line => line.includes('|')), anon, 'přihlášený totéž');
        // Tabulku host přímo nečte a pomocné funkce volat nemůže
        denied(as('', 'select count(*) from question_snapshots;', TUE, 'anon'));
        denied(as('', `select daily_snapshot_seed_ok('mudrlant-dnes-${TUE}:zemepis');`, TUE, 'anon'));
    });

    await t.test('verze schématu 33 nebo novější', () => {
        assert.ok(Number(last(ok(as(A, 'select schema_version();')))) >= 33);
    });
});
