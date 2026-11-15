// Speciální turnaje na téma a hlasování o tématu (tournament.js, schéma 31): nabídka témat v aplikaci a v databázi se shoduje, každé téma
// má na celý turnaj dost otázek (bez opakování, i když se otázky střídají mezi tématy otázek), kola speciálního turnaje po minutách
// od začátku, texty karty bez rodu a stav hlasování do karty.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../tournament.js');

const ROOT = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const levelOf = (item) => (item.k === 1 ? 1 : item.x ? 3 : 2);

test('nabídka témat: stejná id, názvy, témata otázek a kapacita jako tabulka tournament_themes v databázi', () => {
    const block = schema.match(/with list \(id, title, topics, capacity, sort\) as \(values\n([\s\S]+?)\n\), saved as/);
    assert.ok(block, 'seznam témat v schema.sql');
    const rows = [...block[1].matchAll(/\('([a-z0-9-]+)', '([^']+)', '([a-z,]+)', (\d+), (\d+)\)/g)].map(m => ({ id: m[1], title: m[2], topics: m[3], capacity: Number(m[4]) }));
    assert.equal(rows.length, T.THEMES.length);
    assert.deepEqual(rows.map(row => row.id), T.THEMES.map(theme => theme.id));
    T.THEMES.forEach((theme, index) => {
        assert.equal(rows[index].title, theme.title, theme.id);
        assert.equal(rows[index].topics, T.themeTopics(theme), theme.id);
        assert.equal(rows[index].capacity, theme.capacity, theme.id);
    });
    assert.ok(T.THEMES.length >= 12, 'dost témat, ať se hlasování obměňuje');
    // Témata z přání: hrady a zámky, opery, olympijské hry, vlajky Afriky
    for (const id of ['hrady-zamky', 'opery', 'olympijske-hry', 'vlajky-afriky']) assert.ok(T.themeOf(id), id);
    const icons = fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8');
    for (const theme of T.THEMES) assert.ok(icons.includes(`"${theme.icon}"`), `ikona ${theme.icon}`);
});

test('každé téma má otázky na celý turnaj: kola × 10 položek bez opakování, i v každém tématu otázek zvlášť', () => {
    const data = {};
    const load = (topic) => (data[topic] = data[topic] || JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${topic}.json`), 'utf8')));
    for (const theme of T.THEMES) {
        const matcher = T.themeMatcher(theme.id);
        const rounds = Math.round(Math.log2(theme.capacity));
        const needed = rounds * 10;
        const topics = Object.keys(theme.from);
        const all = new Set();
        for (const topic of topics) {
            const items = load(topic).items.filter(item => !item.nq && levelOf(item) <= theme.level && matcher(topic, item));
            items.forEach(item => all.add(item.q));
            // témata otázek se v turnaji losují rovnoměrně: každé musí stačit na svůj díl
            assert.ok(items.length >= Math.ceil(needed / topics.length), `${theme.id}/${topic}: ${items.length} položek`);
            // okruhy a kategorie z výčtu existují
            const keys = new Set(load(topic).collections.map(collection => collection.id));
            for (const key of theme.from[topic].g || []) assert.ok(keys.has(key), `${theme.id}: okruh ${topic}/${key}`);
            for (const key of theme.from[topic].c || []) assert.ok(load(topic).items.some(item => item.c === key), `${theme.id}: kategorie ${topic}/${key}`);
        }
        assert.ok(all.size >= needed, `${theme.id}: ${all.size} položek na ${needed} otázek`);
    }
});

test('položka patří do tématu podle kategorie nebo okruhu svého tématu otázek', () => {
    const inCastles = T.themeMatcher('hrady-zamky');
    assert.equal(inCastles('zemepis', { c: 'stavba', g: ['hrady-zamky', 'cesko'] }), true);
    assert.equal(inCastles('zemepis', { c: 'stavba', g: ['cesko'] }), false);
    assert.equal(inCastles('historie', { c: 'bitva', g: ['hrady-zamky'] }), false, 'jiné téma otázek');
    const olympics = T.themeMatcher('olympijske-hry');
    assert.equal(olympics('sport', { c: 'olympiady' }), true);
    assert.equal(olympics('sport', { c: 'sportovci', g: ['olympijske-legendy'] }), true);
    assert.equal(olympics('sport', { c: 'sportovci', g: ['fotbal'] }), false);
    assert.equal(T.themeMatcher('neexistuje'), null);
});

test('kola speciálního turnaje běží po minutách od začátku; karta: přihlášky do začátku, hraj, další kolo, kolo skončilo', () => {
    const start = Date.parse('2026-11-21T17:00:00Z'); // sobota 18:00 v Praze
    const tournament = { id: 't', kind: 'special', theme: 'opery', title: 'Opery', starts_at: new Date(start).toISOString(), round_minutes: 60, status: 'open', capacity: 128, week_start: '2026-11-21' };
    const before = start - 3600000;
    const open = T.cardState({ tournament, entries: [], me: 'a', today: '2026-11-21', now: before });
    assert.equal(open.closed, false);
    assert.equal(open.canJoin, true);
    assert.equal(T.statusText(open, {}, '2026-11-21', before), 'Začíná dnes v 18:00');
    assert.equal(T.cardState({ tournament, entries: [], me: 'a', today: '2026-11-21', now: start }).closed, true, 'začátkem se přihlášky zavřou');
    assert.equal(T.statusText(open, {}, '2026-11-14', Date.parse('2026-11-14T10:00:00Z')), 'Začíná v sobotu 21. 11. v 18:00');
    const running = { ...tournament, status: 'running', size: 8, rounds: 3, started_on: '2026-11-21' };
    const entries = ['a', 'b'].map(id => ({ user_id: id, status: 'playing', player: { display_name: id === 'b' ? 'Petra' : 'Já' } }));
    const matches = [{ id: 'm1', round: 1, slot: 1, p1: 'a', p2: 'b', results: [] }];
    const at = (now) => T.cardState({ tournament: running, entries, matches, me: 'a', today: '2026-11-21', now });
    assert.equal(T.roundPhase(running, 1, '2026-11-21', start + 10 * 60000), 'open');
    assert.equal(T.roundPhase(running, 2, '2026-11-21', start + 10 * 60000), 'before');
    assert.equal(T.roundPhase(running, 1, '2026-11-21', start + 61 * 60000), 'over');
    const play = at(start + 10 * 60000);
    assert.equal(play.step, 'play');
    assert.equal(T.statusText(play, { b: 'Petra' }, '2026-11-21', start + 10 * 60000), 'Hraj teď, soupeř: Petra. Kolo končí v 19:00.');
    assert.equal(at(start + 61 * 60000).step, 'counting', 'po konci kola se dopočítává');
    // Vyhraný zápas: další kolo začíná v 19:00
    const won = T.cardState({ tournament: running, entries, matches: [{ ...matches[0], winner: 'a', decided_by: 'played' }], me: 'a', today: '2026-11-21', now: start + 30 * 60000 });
    assert.equal(won.step, 'won');
    assert.equal(T.statusText(won, {}, '2026-11-21', start + 30 * 60000), 'Postup do dalšího kola, začíná dnes v 19:00.');
    // Kolo 2 ještě nezačalo
    const later = T.cardState({ tournament: running, entries, matches: [{ ...matches[0], winner: 'a', decided_by: 'played' }, { id: 'm2', round: 2, slot: 1, p1: 'a', p2: 'b', results: [] }], me: 'a', today: '2026-11-21', now: start + 30 * 60000 });
    assert.equal(later.step, 'later');
    assert.equal(T.statusText(later, { b: 'Petra' }, '2026-11-21', start + 30 * 60000), 'Další kolo začíná dnes v 19:00, soupeř: Petra.');
    assert.equal(T.roundWhen(running, 2, '2026-11-21', start), 'dnes 19:00');
    assert.equal(T.titleOf(running), 'Speciální turnaj: Opery');
    assert.equal(T.titleOf({ kind: 'weekly' }), 'Týdenní turnaj');
});

test('týdenní turnaj se kolem po minutách neřídí (kola po dnech jako dřív)', () => {
    const weekly = { id: 'w', topic: 'mix', status: 'running', size: 8, rounds: 3, week_start: '2026-11-09', started_on: '2026-11-09' };
    assert.equal(T.roundPhase(weekly, 1, '2026-11-09'), 'open');
    assert.equal(T.roundPhase(weekly, 2, '2026-11-09'), 'before');
    assert.equal(T.roundPhase(weekly, 1, '2026-11-10'), 'over');
    assert.equal(T.roundWhen(weekly, 2, '2026-11-09'), 'zítra');
});

test('délka kola a časy slovy', () => {
    assert.deepEqual([15, 30, 60, 120, 180, 1440, 90].map(T.durationText), ['15 minut', '30 minut', '1 hodinu', '2 hodiny', '3 hodiny', '24 hodin', '1 h 30 min']);
    const now = Date.parse('2026-11-21T08:00:00Z');
    assert.equal(T.whenText(Date.parse('2026-11-22T08:30:00Z'), now), 'zítra v 9:30');
    assert.equal(T.untilText(Date.parse('2026-11-21T18:00:00Z'), now), 'v 19:00');
    assert.equal(T.dateLabel('2026-11-21'), '21. 11. 2026');
});

test('pravidla speciálního turnaje: téma, začátek, délka kola; bez rodu', () => {
    const rules = T.specialRules({ title: 'Hrady a zámky', starts_at: '2026-11-21T17:00:00Z', round_minutes: 180, capacity: 64 }, Date.parse('2026-11-14T10:00:00Z')).join(' ');
    assert.match(rules, /Hrady a zámky/);
    assert.match(rules, /v sobotu 21\. 11\. v 18:00/);
    assert.match(rules, /Každé kolo trvá 3 hodiny/);
    assert.match(rules, /nejvýš 64/);
    assert.match(rules, /hlasování/);
    assert.doesNotMatch(rules, /\b(přihlásil|přihlásila|vyhrál|vyhrála|hrál|hrála|odehrál|postoupil)\b/);
});

test('hlasování do karty: bez hlasu bez počtů, po hlasu procenta a vedoucí téma; uzavřené nic', () => {
    const options = [{ id: 'opery', title: 'Opery', votes: null }, { id: 'rock', title: 'Rock a punk', votes: null }, { id: 'fotbal', title: 'Fotbal', votes: null }, { id: 'pravek', title: 'Pravěká zvířata', votes: null }];
    const fresh = T.pollView({ id: 5, options, mine: null, total: null, changes_left: 10 });
    assert.equal(fresh.voted, false);
    assert.equal(fresh.counted, false);
    assert.ok(fresh.options.every(option => option.votes === null && !option.leader));
    assert.equal(fresh.options[0].icon, 'drama');
    const voted = T.pollView({ id: 5, options: options.map((option, i) => ({ ...option, votes: [3, 1, 0, 0][i] })), mine: 'rock', total: 4, changes_left: 9 });
    assert.equal(voted.voted, true);
    assert.deepEqual(voted.options.map(option => option.percent), [75, 25, 0, 0]);
    assert.deepEqual(voted.options.map(option => option.leader), [true, false, false, false]);
    assert.equal(voted.options[1].mine, true);
    assert.equal(T.pollView({ id: 5, options, closed: true }), null);
    assert.equal(T.pollView(null), null);
    assert.equal(T.votesWord(1), '1 hlas');
    assert.equal(T.votesWord(3), '3 hlasy');
    assert.equal(T.votesWord(12), '12 hlasů');
});
