// Testy ratingu (ELO) a lig (rating.js). Stejný výpočet má databáze (supabase/schema.sql, test v tests/sql-rating.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Rating = require('../rating.js');

test('ligy podle hranic ratingu', () => {
    const expectations = [[100, 'bronz'], [1000, 'bronz'], [1099, 'bronz'], [1100, 'stribro'], [1249, 'stribro'], [1250, 'zlato'], [1399, 'zlato'], [1400, 'platina'], [1549, 'platina'], [1550, 'diamant'], [1699, 'diamant'], [1700, 'mistr'], [4000, 'mistr']];
    for (const [rating, id] of expectations) assert.equal(Rating.leagueFor(rating).id, id, `rating ${rating}`);
    assert.equal(Rating.leagueFor('nesmysl').id, 'bronz', 'neplatný rating = výchozí 1000');
    assert.equal(Rating.leagueById('zlato').name, 'Zlato');
    assert.equal(Rating.leagueById('x').id, 'bronz');
});

test('každá liga má jedinečné id, název, ikonu a CSS třídu a hranice rostou', () => {
    const leagues = Rating.LEAGUES;
    assert.equal(leagues.length, 6);
    for (const key of ['id', 'name', 'icon', 'css']) assert.equal(new Set(leagues.map(league => league[key])).size, leagues.length);
    assert.deepEqual(leagues.map(league => league.from), [...leagues.map(league => league.from)].sort((a, b) => a - b));
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'input.css'), 'utf8');
    const icons = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-icons.mjs'), 'utf8');
    for (const league of leagues) {
        assert.ok(css.includes(`.${league.css} `), `CSS ${league.css}`);
        assert.ok(css.includes(`.league-fg-${league.id} `), `CSS barva ${league.id}`);
        assert.ok(icons.includes(`'${league.icon}'`), `ikona ${league.icon} v build-icons.mjs`);
    }
});

test('hranice lig odpovídají databázi (rating_league v schema.sql)', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    const body = sql.slice(sql.indexOf('function public.rating_league'), sql.indexOf('rating_history ('));
    for (const league of Rating.LEAGUES.slice(1)) assert.match(body, new RegExp(`r >= ${league.from} then '${league.id}'`));
});

test('ELO: očekávané skóre a změna ratingu', () => {
    assert.equal(Rating.expectedScore(1000, 1000), 0.5);
    assert.ok(Rating.expectedScore(1400, 1000) > 0.9);
    assert.equal(Rating.ratingChange(1000, 1000, 1), 12);
    assert.equal(Rating.ratingChange(1000, 1000, 0), -12);
    assert.equal(Rating.ratingChange(1000, 1000, 0.5), 0);
    // silnější proti slabšímu získá málo, slabší proti silnějšímu hodně
    assert.equal(Rating.ratingChange(1400, 1000, 1), 2);
    assert.equal(Rating.ratingChange(1000, 1400, 1), 22);
    assert.equal(Rating.ratingChange(1400, 1000, 0), -22);
    // zero-sum: A vyhraje o tolik, o kolik B ztratí
    for (const [a, b] of [[1000, 1000], [1123, 1480], [1700, 1010]]) assert.equal(Rating.ratingChange(a, b, 1), -Rating.ratingChange(b, a, 0));
    // rating neklesne pod minimum
    assert.equal(Rating.ratingChange(100, 1500, 0), 0);
});

test('výsledek výzvy: víc správných, pak víc bodů, jinak remíza', () => {
    assert.equal(Rating.duelScore({ correct: 5, points: 1 }, { correct: 4, points: 90 }), 1);
    assert.equal(Rating.duelScore({ correct: 3, points: 10 }, { correct: 3, points: 12 }), 0);
    assert.equal(Rating.duelScore({ correct: 3, points: 10 }, { correct: 3, points: 10 }), 0.5);
});

test('postup do další ligy', () => {
    const start = Rating.leagueProgress(1000);
    assert.equal(start.league.id, 'bronz');
    assert.equal(start.next.id, 'stribro');
    assert.equal(start.toNext, 100);
    assert.equal(start.percent, 50);
    assert.equal(Rating.leagueProgress(1250).percent, 0);
    assert.equal(Rating.leagueProgress(1325).percent, 50);
    assert.equal(Rating.leagueProgress(1749).next, null);
    assert.equal(Rating.leagueProgress(1749).percent, 100);
});

test('formát změny a týden (pondělí až neděle)', () => {
    assert.equal(Rating.formatDelta(12), '+12');
    assert.equal(Rating.formatDelta(-5), '−5');
    assert.equal(Rating.formatDelta(0), '±0');
    assert.equal(Rating.weekLabel(new Date(2026, 10, 4)), '2. 11. – 8. 11.');
    assert.equal(Rating.weekLabel(new Date(2026, 10, 8, 23, 0)), '2. 11. – 8. 11.', 'neděle patří k týdnu');
    assert.equal(Rating.weekLabel(new Date(2026, 10, 9)), '9. 11. – 15. 11.');
    assert.equal(Rating.weekStart(new Date(2026, 10, 4)).getDay(), 1);
});

test('závěrečná obrazovka výzvy: výsledek slovy a hlášky (15+ pro každou situaci)', () => {
    assert.equal(Rating.outcomeOf({ correct: 7, points: 20 }, null), 'cekani');
    assert.equal(Rating.outcomeOf({ correct: 7, points: 20 }, { correct: 6, points: 99 }), 'vyhra');
    assert.equal(Rating.outcomeOf({ correct: 6, points: 99 }, { correct: 7, points: 1 }), 'prohra');
    assert.equal(Rating.outcomeOf({ correct: 5, points: 21 }, { correct: 5, points: 20 }), 'vyhra', 'při shodě rozhodují body');
    assert.equal(Rating.outcomeOf({ correct: 5, points: 20 }, { correct: 5, points: 21 }), 'prohra');
    assert.equal(Rating.outcomeOf({ correct: 5, points: 20 }, { correct: 5, points: 20 }), 'remiza');
    for (const situation of ['vyhra', 'prohra', 'remiza', 'cekani']) {
        const list = Rating.QUIPS[situation];
        assert.ok(list.length >= 15, `${situation}: ${list.length} hlášek`);
        assert.equal(new Set(list).size, list.length, `${situation}: bez duplicit`);
        assert.ok(list.every(line => line.length >= 12 && line.length <= 90), `${situation}: rozumná délka`);
        assert.ok(Rating.HEADLINES[situation], `${situation}: nadpis`);
        // Stejná výzva = stejná hláška, jiná výzva může mít jinou
        assert.equal(Rating.quipFor(situation, 'ABC123'), Rating.quipFor(situation, 'ABC123'));
    }
    const seen = new Set(Array.from({ length: 200 }, (_, i) => Rating.quipFor('vyhra', `K${i}`)));
    assert.ok(seen.size >= 12, `hlášky se střídají (${seen.size})`);
    assert.match(Rating.quipFor('neznámá', 'x'), /\S/, 'neznámá situace nespadne');
});

test('každá liga má erb (vlastní ilustraci) v icons/topics', () => {
    const R = require('../rating.js');
    const fs2 = require('node:fs');
    const path2 = require('node:path');
    for (const league of R.LEAGUES) {
        const file = path2.join(__dirname, '..', 'icons', 'topics', `liga-${league.id}.webp`);
        assert.ok(fs2.existsSync(file), file);
        assert.equal(fs2.readFileSync(file).subarray(0, 4).toString(), 'RIFF');
    }
});
