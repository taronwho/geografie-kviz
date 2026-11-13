// Tajemná otázka dne (mystery.js): výběr položky ze semínka dne (stejný pro všechny, témata se střídají), rozvrh nápověd v pražském čase
// i při změně času, osm nápověd z dat otázky (od slabé po nejsilnější), body a XP, porovnání tipu (diakritika, překlepy, přijímané názvy),
// uložený stav (poškozená data, tipy po vyřešení), text a obrázek ke sdílení bez odpovědi, karta na úvodu a obrazovka (bez inline stylů)
// a zapojení do stránky (index.html, service worker, nasazení, Tailwind, schéma 19, odznaky, tip).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../mystery.js');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const TOPICS = ['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport'];
const iso = (text) => Date.parse(text);

test('pražský čas: den, minuty a hodiny nápověd (zimní i letní čas)', () => {
    assert.deepEqual((({ day, minutes }) => [day, minutes])(M.pragueClock(iso('2026-11-12T08:41:00Z'))), ['2026-11-12', 9 * 60 + 41]);
    assert.equal(M.pragueDay(iso('2026-11-12T23:30:00Z')), '2026-11-13', '0:30 v Praze je už další den');
    assert.equal(M.pragueDay(iso('2026-07-12T22:30:00Z')), '2026-07-13', 'v létě je Praha o dvě hodiny napřed');
    assert.equal(M.formatClock(iso('2026-11-12T08:41:00Z')), '9:41');
    assert.equal(M.formatClock(iso('2026-11-11T23:12:00Z')), '0:12');
    assert.deepEqual(M.CLUE_HOURS, [0, 7, 9, 11, 13, 15, 17, 20]);
    // Zimní čas (UTC+1)
    const at = (utc) => M.cluesAt(iso(utc));
    assert.deepEqual(['2026-11-11T23:00:00Z', '2026-11-12T05:59:00Z', '2026-11-12T06:00:00Z', '2026-11-12T12:00:00Z', '2026-11-12T18:59:59Z', '2026-11-12T19:00:00Z', '2026-11-12T22:59:00Z'].map(at), [1, 1, 2, 5, 7, 8, 8]);
    // Letní čas (UTC+2): 7:00 v Praze = 5:00 UTC
    assert.equal(at('2026-07-12T04:59:00Z'), 1);
    assert.equal(at('2026-07-12T05:00:00Z'), 2);
    assert.deepEqual(M.nextClue(iso('2026-11-12T12:00:00Z')), { n: 6, label: '15:00' });
    assert.equal(M.nextClue(iso('2026-11-12T19:30:00Z')), null, 'po 20:00 je všech osm venku');
});

test('rozvrh nápověd v den změny času (29. 3. a 25. 10. 2026)', () => {
    // Jaro: 2:00 → 3:00, půlnoc je ještě zimní (UTC+1), 7:00 už letní (UTC+2)
    assert.equal(new Date(M.clueTime('2026-03-29', 1)).toISOString(), '2026-03-28T23:00:00.000Z');
    assert.equal(new Date(M.clueTime('2026-03-29', 2)).toISOString(), '2026-03-29T05:00:00.000Z');
    assert.equal(new Date(M.clueTime('2026-03-29', 8)).toISOString(), '2026-03-29T18:00:00.000Z');
    // Podzim: 3:00 → 2:00, půlnoc letní (UTC+2), 7:00 zimní (UTC+1)
    assert.equal(new Date(M.clueTime('2026-10-25', 1)).toISOString(), '2026-10-24T22:00:00.000Z');
    assert.equal(new Date(M.clueTime('2026-10-25', 2)).toISOString(), '2026-10-25T06:00:00.000Z');
    for (const day of ['2026-03-29', '2026-10-25', '2026-11-12', '2026-07-01']) {
        for (let n = 1; n <= 8; n++) {
            const unlock = M.clueTime(day, n);
            assert.equal(M.cluesAt(unlock), n, `${day} ${n}. nápověda`);
            assert.equal(M.pragueDay(unlock), day);
            assert.equal(M.formatClock(unlock), `${M.CLUE_HOURS[n - 1]}:00`);
            if (n > 1) assert.equal(M.cluesAt(unlock - 1000), n - 1);
        }
        // Den má na jaře 23 a na podzim 25 hodin: nápovědy jsou přesto ve stejné pražské hodiny
        assert.equal(M.cluesAt(M.clueTime(M.addDays(day, 1), 1) - 1000), 8);
    }
});

test('výběr: téma dne se střídá (každé jednou za 14 dní, nikdy dva dny po sobě), položka známá s fotkou, stejná pro všechny', () => {
    const days = Array.from({ length: 140 }, (_, i) => M.addDays('2026-11-13', i));
    const topics = days.map(day => M.topicForDay(day, TOPICS));
    for (let i = 1; i < topics.length; i++) assert.notEqual(topics[i], topics[i - 1], `${days[i]}: stejné téma jako včera`);
    // V každém bloku 14 dní (podle čísla dne) je každé téma právě jednou
    const blockStart = days.findIndex(day => Math.floor(Date.parse(day) / 86400000) % 14 === 0);
    for (let start = blockStart; start + 14 <= days.length; start += 14) assert.deepEqual([...topics.slice(start, start + 14)].sort(), [...TOPICS].sort());
    assert.equal(M.topicForDay('2026-11-12', [...TOPICS].reverse()), M.topicForDay('2026-11-12', TOPICS), 'pořadí seznamu nehraje roli');
    // Položka: známá (k: 1), ne nq, s fotkou JPG a fakty, z první poloviny kategorie
    const items = [];
    for (let i = 0; i < 40; i++) items.push({ q: `Q${i}`, n: `Věc ${i}`, c: i % 2 ? 'a' : 'b', k: i < 30 ? 1 : 0, im: i % 5 === 0 ? 'Mapa.svg' : `Foto_${i}.jpg`, ih: 'ab', f: i % 7 === 0 ? {} : { x: i }, ...(i === 2 ? { nq: 1 } : {}) });
    const picks = new Set();
    for (const day of days) {
        const item = M.pickItem(day, 'zemepis', items);
        picks.add(item.q);
        assert.equal(item.k, 1);
        assert.ok(!item.nq && /\.jpg$/.test(item.im) && Object.keys(item.f).length, item.q);
        const index = items.filter(other => other.c === item.c && other.k === 1 && !other.nq).indexOf(item);
        assert.ok(index < 4, `${item.q} je z první čtvrtiny kategorie (nejznámější)`);
    }
    assert.ok(picks.size >= 4, `různé položky v různé dny (${picks.size}; v testu jen pár nejznámějších)`);
    // Bez vhodných položek volnější výběr; prázdná data null
    assert.equal(M.pickItem('2026-11-12', 'x', [{ q: 'A', n: 'A', k: 0 }]).q, 'A');
    assert.equal(M.pickItem('2026-11-12', 'x', []), null);
    // Nová položka změní výběr jen tehdy, když sama vyhraje
    const extra = [...items, { q: 'Q999', n: 'Nová', c: 'a', k: 1, im: 'Nova.jpg', ih: 'ab', f: { x: 1 } }];
    const changed = days.filter(day => M.pickItem(day, 'zemepis', extra).q !== M.pickItem(day, 'zemepis', items).q);
    assert.ok(changed.every(day => M.pickItem(day, 'zemepis', extra).q === 'Q999'));
});

// Data otázky ve tvaru createRoundData (app.js)
const roundData = (over = {}) => ({
    topic: 'zemepis', id: 'Q1', name: 'Matterhorn', typeLabel: 'hora',
    question: { type: 'name', accepted: ['Matterhorn', 'Monte Cervino'], choices: [{ label: 'Matterhorn', correct: true }, { label: 'Eiger' }, { label: 'Mont Blanc' }, { label: 'Ortler' }], placeholder: 'Název hory' },
    questionText: '[***] je hora v Alpách na hranici dvou států. Je vysoká přes čtyři tisíce metrů a má tvar jehlanu. Poprvé byla zdolána roku 1865 po tragickém výstupu.',
    photoUrl: 'https://upload.wikimedia.org/foto.jpg',
    leadFacts: [],
    hints: [
        { key: 'excerpt', kind: 'excerpt', text: 'Patří k nejfotografovanějším horám světa a láká horolezce z celé Evropy.' },
        { key: 'photo', kind: 'photo', label: 'fotka', icon: 'image' },
        { key: 'visual', kind: 'visual', spec: { type: 'map', lat: 46, lon: 7.6 }, label: 'slepá mapa', icon: 'map' },
        { key: 'facts', kind: 'facts', facts: [{ label: 'Výška', value: '4 478 m' }, { label: 'Stát', value: 'Švýcarsko, Itálie' }, { label: 'Pohoří', value: 'Alpy' }, { label: 'Prvovýstup', value: '1865' }] }
    ],
    ...over
});

test('nápovědy: osm od nejslabší po nejsilnější, poslední ostrá fotka (bez možností a písmen), nikde odpověď', () => {
    const clues = M.buildClues(roundData(), { topicTitle: 'Zeměpis' });
    assert.equal(clues.length, 8);
    assert.deepEqual(clues.map(clue => clue.hour), M.CLUE_HOURS);
    assert.deepEqual(clues[0].parts[0], { type: 'type', topic: 'Zeměpis', label: 'hora' });
    assert.deepEqual(clues[0].parts[1], { type: 'facts', facts: [{ label: 'Výška', value: '4 478 m' }] });
    assert.deepEqual(clues[6].parts, [{ type: 'photo', url: 'https://upload.wikimedia.org/foto.jpg', blur: true }], '7. rozmazaná fotka');
    assert.deepEqual(clues[7].parts, [{ type: 'photo', url: 'https://upload.wikimedia.org/foto.jpg', blur: false }], '8. ostrá fotka, nic víc');
    assert.ok(!clues.some(clue => clue.parts.some(part => part.type === 'choices' || part.type === 'pattern')), 'žádné možnosti ani písmena');
    const types = clues.slice(1, 6).flatMap(clue => clue.parts.map(part => part.type));
    assert.ok(types.includes('text') && types.includes('visual') && types.includes('facts'), types.join());
    // Všechna fakta a věty se použijí, nic dvakrát
    const facts = clues.flatMap(clue => clue.parts.filter(part => part.type === 'facts').flatMap(part => part.facts.map(fact => fact.label)));
    assert.deepEqual([...facts].sort(), ['Prvovýstup', 'Pohoří', 'Stát', 'Výška'].sort());
    assert.ok(!JSON.stringify(clues).includes('Matterhorn'), 'odpověď není v žádné nápovědě');
    // Chudá data: jen počet slov (žádná písmena ani konce odpovědi), bez fotky není rozmazaná fotka
    const poor = M.buildClues(roundData({ name: 'Karel IV.', hints: [], questionText: '', photoUrl: null, question: { choices: [] } }), { topicTitle: 'Historie' });
    assert.equal(poor.length, 8);
    assert.ok(!poor.some(clue => clue.parts.some(part => part.type === 'photo')));
    assert.match(JSON.stringify(poor), /Odpověď má 2 slova\./);
    assert.doesNotMatch(JSON.stringify(poor), /písmen|končí na/);
    assert.equal(poor[7].parts[0].type, 'note', 'bez fotky závěrečná poznámka');
    // Obrázek otázky (obraz, vlajka) je fotkou nápovědy
    const shown = M.buildClues(roundData({ hints: [], questionImage: { url: 'https://upload.wikimedia.org/obraz.jpg' } }));
    assert.equal(shown[6].parts[0].url, 'https://upload.wikimedia.org/obraz.jpg');
    assert.deepEqual(M.sentencesOf('[***] je hora. Krátká. Tady jsou tři slova.'), ['Tady jsou tři slova.']);
});

test('body a XP: dřív = víc, špatný tip bod ubere, nejméně 1', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => M.pointsFor(n)), [10, 9, 8, 7, 6, 5, 4, 3]);
    assert.equal(M.pointsFor(6, 1), 4);
    assert.equal(M.pointsFor(8, 2), 1);
    assert.equal(M.pointsFor(9, 5), 1);
    assert.equal(M.pointsFor(0), 10);
    assert.deepEqual([10, 3, 1, 0].map(M.xpFor), [30, 16, 12, 0]);
});

test('tip: porovnání jako u psané odpovědi (diakritika, velká písmena, překlep, další názvy), stav a vyřešení', () => {
    const question = { type: 'name', accepted: core.nameAnswers({ n: 'Česko', t: 'Česko' }, ['Česká republika']) };
    for (const input of ['Česko', 'cesko', 'ČESKO', 'Cesk', 'česká republika']) assert.ok(core.checkAnswer(input, question) || input === 'Cesk', input);
    assert.ok(!core.checkAnswer('Slovensko', question));
    assert.ok(core.checkAnswer('Matterhorm', { type: 'name', accepted: ['Matterhorn'] }), 'drobný překlep');
    let entry = M.newEntry({ topic: 'zemepis', q: 'Q1', name: 'Matterhorn' });
    assert.equal(M.statusOf(entry), 'new');
    assert.equal(M.tipsLeft(entry), 3);
    entry = M.addTip(entry, { text: 'Eiger', correct: false, clues: 4, at: iso('2026-11-12T08:41:00Z') });
    assert.deepEqual([M.statusOf(entry), M.tipsLeft(entry), M.wrongTips(entry)], ['open', 2, 1]);
    entry = M.addTip(entry, { text: 'Matterhorn', correct: true, clues: 6, at: iso('2026-11-12T12:05:00Z') });
    assert.deepEqual([M.statusOf(entry), entry.solved, entry.clues, entry.points, M.tipsLeft(entry)], ['solved', true, 6, 4, 0]);
    assert.equal(M.addTip(entry, { text: 'X', correct: false, clues: 8, at: 0 }), entry, 'po vyřešení se nic nepřidá');
    let failed = M.newEntry({});
    for (const text of ['A', 'B', 'C']) failed = M.addTip(failed, { text, correct: false, clues: 2, at: 1 });
    assert.deepEqual([M.statusOf(failed), failed.points, M.tipsLeft(failed)], ['failed', 0, 0]);
    assert.equal(M.addTip(failed, { text: 'D', correct: true, clues: 8, at: 2 }), failed, 'po třech tipech konec');
});

test('uložený stav: poškozená data, tipy za vyřešeným se zahodí, jen 40 dní a dvě otázky', () => {
    assert.deepEqual(M.parseState(null), { v: 1, days: {}, rounds: {} });
    const days = {};
    for (let i = 0; i < 50; i++) days[M.addDays('2026-09-01', i)] = { tips: [] };
    days['x'] = { tips: [] };
    days['2026-11-12'] = { name: 'M'.repeat(500), tips: [{ text: 'a', correct: false, clues: 99, at: 'x' }, { text: 'b', correct: true, clues: 3, at: 5 }, { text: 'c', correct: false, clues: 4, at: 6 }], synced: 9, xp: 1e9, dismissed: 'ano', seen: 50 };
    const rounds = { '2026-11-10': { question: { accepted: ['a'] } }, '2026-11-11': { question: { accepted: ['b'] } }, '2026-11-12': { question: { accepted: ['c'] } }, '2026-11-13': { question: {} } };
    const state = M.parseState({ days, rounds });
    assert.equal(Object.keys(state.days).length, 40);
    assert.ok(!state.days.x);
    const entry = state.days['2026-11-12'];
    assert.equal(entry.tips.length, 2, 'tip po správném se zahodí');
    assert.deepEqual([entry.tips[0].clues, entry.tips[0].at, entry.solved, entry.points, entry.synced, entry.xp, entry.dismissed, entry.seen, entry.name.length], [8, 0, true, 7, 2, 1000, true, 8, 120]);
    assert.deepEqual(Object.keys(state.rounds), ['2026-11-11', '2026-11-12'], 'jen poslední dva dny s platnou otázkou');
});

test('sdílení: text a obrázek bez odpovědi (🔍 nápovědy, ❌ špatný tip, ✅ správný)', () => {
    let entry = M.newEntry({ name: 'Matterhorn' });
    entry = M.addTip(entry, { text: 'Eiger', correct: false, clues: 2, at: 1 });
    entry = M.addTip(entry, { text: 'Matterhorn', correct: true, clues: 3, at: 2 });
    assert.equal(M.shareGrid(entry), '🔍🔍❌✅');
    const text = M.shareText({ appName: 'Mudrlant', day: '2026-11-12', entry, url: 'https://mudrlant.cz/' });
    assert.equal(text, 'Mudrlant · Tajemná otázka 12. 11. · 🔍🔍❌✅ · 3. nápověda · 7 bodů · https://mudrlant.cz/');
    let failed = M.newEntry({ name: 'Matterhorn' });
    for (const tip of ['Eiger', 'Ortler', 'Monte Rosa']) failed = M.addTip(failed, { text: tip, correct: false, clues: 8, at: 1 });
    const failedText = M.shareText({ day: '2026-11-12', entry: failed });
    assert.equal(failedText, 'Mudrlant · Tajemná otázka 12. 11. · 🔍🔍🔍🔍🔍🔍🔍❌❌❌ · tentokrát nevyřešeno');
    for (const sample of [text, failedText, JSON.stringify(M.cardInput({ day: '2026-11-12', entry, robe: 'vinova', url: 'x', appName: 'Mudrlant' })), JSON.stringify(M.cardInput({ day: '2026-11-12', entry: failed }))]) {
        assert.ok(!/Matterhorn|Eiger|Ortler|Monte/.test(sample), `bez odpovědi i bez tipů: ${sample}`);
    }
    const card = M.cardInput({ day: '2026-11-12', entry, robe: 'modra', url: 'u', appName: 'Mudrlant' });
    assert.deepEqual([card.headline, card.detail, card.grid, card.pose], ['Vyřešeno!', '3. nápověda · 7 bodů', [false, true], 'radost']);
});

test('karta na úvodu: nápověda a další čas, vyřešeno, nevyšlo, včerejší odpověď; obrazovka bez inline stylů', () => {
    const now = iso('2026-11-12T12:00:00Z');
    const base = { kind: 'today', shown: M.cluesAt(now), next: M.nextClue(now) };
    assert.equal(M.homeText({ ...base, status: 'new', entry: null }), 'Nápověda 5/8 · další v 15:00');
    assert.match(M.homeCardHtml({ ...base, status: 'new', entry: null }), /data-mystery-new/, 'nová nápověda');
    assert.doesNotMatch(M.homeCardHtml({ ...base, status: 'open', entry: { ...M.newEntry({}), seen: 5 } }), /data-mystery-new/);
    assert.equal(M.homeText({ ...base, next: null, shown: 8, status: 'open', entry: M.addTip(M.newEntry({}), { text: 'x', correct: false, clues: 8, at: 1 }) }), 'Nápověda 8/8 · zbývají 2 tipy');
    let solved = M.addTip(M.newEntry({}), { text: 'x', correct: true, clues: 2, at: iso('2026-11-12T08:41:00Z') });
    assert.equal(M.homeText({ ...base, status: 'solved', entry: solved, solvedAt: '9:41' }), 'Vyřešeno v 9:41 s 2 nápovědami');
    solved = M.addTip(M.newEntry({}), { text: 'x', correct: true, clues: 1, at: 1 });
    assert.equal(M.homeText({ ...base, status: 'solved', entry: solved, solvedAt: '0:12' }), 'Vyřešeno v 0:12 s 1 nápovědou');
    assert.equal(M.homeText({ ...base, status: 'failed', entry: null }), 'Tentokrát ne · odpověď zítra');
    assert.equal(M.homeText({ kind: 'reveal', name: 'Matterhorn', stats: { players: 50, solved_pct: 34 } }), 'Odpověď: Matterhorn · uhodlo 34 %');
    const reveal = M.homeCardHtml({ kind: 'reveal', name: 'Matterhorn', stats: null });
    assert.match(reveal, /data-action="mystery-reveal"[\s\S]*Včerejší tajemná otázka[\s\S]*data-action="mystery-dismiss"/);
    const h = { photoFrame: (attrs) => `<div ${attrs}></div>`, visualFrame: (spec, id) => `<div id="${id}"></div>`, avatarHtml: () => '<span></span>', xpLine: () => '' };
    const clues = M.buildClues(roundData(), { topicTitle: 'Zeměpis' });
    const screen = M.screenHtml({ day: '2026-11-12', shown: 5, next: { n: 6, label: '15:00' }, clues, entry: M.newEntry({}), name: 'Matterhorn', canGuess: true, pointsNow: 6 }, h);
    assert.match(screen, /id="mystery-form"/);
    assert.match(screen, /3 tipy na celý den · teď za 6 bodů/);
    assert.equal((screen.match(/data-mystery-clue="\d"(?! data-locked)/g) || []).length, 5, 'pět odkrytých');
    assert.match(screen, /data-mystery-clue="6" data-locked[\s\S]*v 15:00/);
    assert.ok(!screen.includes('Matterhorn'), 'před vyřešením bez odpovědi');
    assert.doesNotMatch(screen, /data-action="mystery-choice"/, 'bez možností');
    const last = M.screenHtml({ day: '2026-11-12', shown: 8, next: null, clues, entry: M.newEntry({}), canGuess: true, pointsNow: 3 }, h);
    assert.equal((last.match(/data-action="mystery-choice"/g) || []).length, 0, 'ani v poslední nápovědě možnosti nejsou');
    assert.match(last, /data-mystery-photo="sharp"/);
    const stats = M.statsHtml({ stats: { players: 50, solved: 17, solved_pct: 34, fastest: '0:12', avg_clues: 3 }, friends: { friends: 2, rank: 2, rows: [{ id: 'a', rank: 1, display_name: 'Eva', solved: true, points: 10, clues: 1 }, { id: 'b', rank: 2, display_name: 'Já', me: true, solved: true, points: 7, clues: 4 }, { id: 'c', rank: 3, display_name: 'Petr', solved: false }] } }, h);
    assert.match(stats, /Uhodlo 34 % hráčů, nejrychlejší v 0:12, průměrně s 3 nápovědami/);
    assert.match(stats, /Mezi přáteli 2\. z 3/);
    assert.match(M.statsHtml({ stats: { players: 4, solved: 3, solved_pct: 75, fastest: '1:05', avg_clues: 3.4 } }, h), /průměrně s 3,4 nápovědami/);
    assert.match(M.statsHtml({ guest: true, canLogin: true }, h), /data-action="mystery-login"/);
    for (const html of [screen, last, stats, reveal]) assert.doesNotMatch(html, /style=|on[a-z]+=/i, 'CSP: bez inline stylů a skriptů');
});

test('napojení: modul v index.html, service workeru, nasazení a Tailwindu; schéma 20, odznaky Detektiv, tip a karta na úvodu', () => {
    const index = read('index.html');
    assert.match(index, /<script src="mystery\.js" defer><\/script>/);
    assert.ok(index.indexOf('mystery.js') < index.indexOf('app.js') && index.indexOf('quiz-core.js') < index.indexOf('mystery.js'));
    assert.match(read('sw.js'), /'mystery\.js'/);
    assert.match(read('.github/workflows/pages.yml'), /\bmystery\.js\b/);
    assert.match(read('tailwind.config.js'), /'\.\/mystery\.js'/);
    const sql = read('supabase/schema.sql');
    assert.match(sql, /create table if not exists public\.mystery_results/);
    assert.match(sql, /grant execute on function public\.mystery_state\(\), public\.mystery_guess\(date, integer, boolean, integer\), public\.mystery_stats\(date\), public\.mystery_friends\(date\) to authenticated/);
    assert.match(sql, /array\[0, 7, 9, 11, 13, 15, 17, 20\]/, 'stejné hodiny nápověd jako mystery.js');
    assert.ok(Number(/language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1]) >= 20 && /language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1] === /const REQUIRED_SCHEMA = (\d+);/.exec(read('app.js'))[1], 'schéma aspoň 20 a stejná verze v app.js');
    assert.deepEqual(core.BADGE_GROUPS.find(group => group.id === 'detektiv').badges.map(badge => [badge.id, badge.goal]), [['detektiv', 1], ['detektiv-7', 7], ['detektiv-30', 30], ['detektiv-100', 100], ['detektiv-365', 365]]);
    assert.equal(core.EMPTY_COUNTERS.mysterySolved, 0);
    const Tips = require('../tips.js');
    assert.equal(Tips.BY_ID.get('tajemna').action.kind, 'mystery');
    // Karta na úvodu je jedna vložená funkce (ostatní pruhy úvodu se jí nedotknou)
    assert.equal((read('app.js').match(/\$\{mysteryHomeCard\(\)\}/g) || []).length, 1);
    assert.match(read('docs/SUPABASE.md'), /## Tajemná otázka dne \(schéma 19\)/);
});

test('nápovědy se řadí podle toho, jak moc prozrazují: popis s letopočty a jmény až po slepé mapě, obecná věta dřív', () => {
    const berlin = '[***] byla střežená betonová bariéra, která v letech 1961–1989 obklopovala Západní [***] a oddělovala jej od Východního [***] a Německé demokratické republiky.';
    assert.ok(M.textScore(berlin) > 0.9, 'věta s letopočty, vlastními jmény a třemi zakrytými výskyty prozrazuje hodně');
    assert.ok(M.textScore('Je to zřícenina hradu na skalnatém ostrohu nad řekou.') < 0.4, 'obecná věta prozrazuje málo');
    const data = { typeLabel: 'stavba', name: 'Berlínská zeď', questionText: `${berlin} Při pokusu o její překonání zemřelo nejméně 140 lidí.`,
        leadFacts: [{ label: 'Délka', value: '155 km' }], hints: [{ kind: 'facts', facts: [{ label: 'Výška', value: '4 m' }] }, { kind: 'visual', spec: { type: 'map' }, label: 'slepá mapa', icon: 'map' }], photoUrl: null };
    const clues = M.buildClues(data, { topicTitle: 'Zeměpis' });
    const at = (match) => clues.findIndex(clue => clue.parts.some(match));
    const map = at(part => part.type === 'visual');
    const revealing = at(part => part.type === 'text' && part.text.startsWith('[***] byla'));
    assert.ok(map > 0 && revealing > map, `prozrazující popis (${revealing + 1}.) až po slepé mapě (${map + 1}.)`);
    assert.equal(clues.find(clue => clue.parts.some(part => part.type === 'text')).title, 'Z popisu', 'první zobrazená věta je Z popisu');
    assert.equal(clues.length, 8);
});

test('přísné zakrytí textových nápověd: státy, národnosti, vlastní jména a letopočty zmizí, začátek věty zůstane; úryvek neopakuje popis', () => {
    const masked = M.strongMask('[***] byla střežená betonová bariéra, která v letech 1961–1989 obklopovala Západní [***] a oddělovala jej od Východního [***] a Německé demokratické republiky.');
    assert.equal(masked, '[***] byla střežená betonová bariéra, která v letech ****–**** obklopovala [***] a oddělovala jej od [***] a [***] demokratické republiky.');
    assert.equal(M.strongMask('Stala se symbolem studené války, rozdělení [***], Německa a Evropy. Součástí byly strážní věže.'), 'Stala se symbolem studené války, rozdělení [***], [***] a [***]. Součástí byly strážní věže.');
    assert.equal(M.strongMask('Leží na břehu řeky, místní mu říkají „Stará“ a německé turisty láká.'), 'Leží na břehu řeky, místní mu říkají „[***]“ a [***] turisty láká.');
    const data = { typeLabel: 'stavba', name: 'Berlínská zeď', questionText: 'Stala se symbolem studené války, rozdělení [***], Německa a Evropy. Byla dlouhá a střežená.',
        leadFacts: [], hints: [{ kind: 'excerpt', text: 'Stala se symbolem studené války, rozdělení [***], Německa a Evropy. Součástí byly strážní věže rozmístěné podél zdí.' }], photoUrl: null };
    const texts = M.buildClues(data).flatMap(clue => clue.parts.filter(part => part.type === 'text').map(part => part.text));
    assert.equal(texts.filter(text => text.includes('symbolem studené války')).length, 1, 'věta z popisu se v úryvku neopakuje');
    assert.ok(texts.every(text => !/Německ|německ/.test(text)));
});
