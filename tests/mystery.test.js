// Tajemná otázka dne (mystery.js): výběr položky ze semínka dne (stejný pro všechny, témata se střídají), rozvrh nápověd v pražském čase
// i při změně času, osm nápověd z dat otázky (od slabé po nejsilnější), krátké nápovědy (vzdálenost a směr od Prahy, ano/ne, doba,
// indicie a související jméno – správnost na skutečných datech, nic z odpovědi), body a XP, porovnání tipu (diakritika, překlepy, přijímané názvy),
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

test('přísné zakrytí: národnost i v množném čísle (Řečtí, Čeští, Nizozemští), obecná slova zůstanou', () => {
    assert.equal(M.strongMask('Je to jeden z bohů, které uctívali staří Řekové. Řečtí bohové sídlili na hoře.'), 'Je to jeden z bohů, které uctívali staří [***]. [***] bohové sídlili na hoře.');
    assert.equal(M.strongMask('Čeští panovníci a nizozemští malíři.'), '[***] panovníci a [***] malíři.');
    assert.equal(M.strongMask('Olympští bohové a vodní mlýny.'), 'Olympští bohové a vodní mlýny.');
});

// --- Krátké nápovědy: vzdálenost a směr od Prahy, ano/ne, doba, indicie, související jméno ---
const COUNTRIES = JSON.parse(read('data/countries.json')).countries;
const contexts = new Map();
// Kontext tématu jako v app.js (loadTopic) a otázka „Co je to?“ jako createRoundData s options.plain. Přezdívky z celého tématu
// (příjmení umělců a herců) se v Node počítají sekundy, v testu stačí přezdívky z dat položky (al)
const contextOf = (id) => {
    if (!contexts.has(id)) {
        core.setCountries(COUNTRIES);
        const topic = { ...require(`../topics/${id}.js`), nameAliases: (item) => [...(item.al || [])] };
        const data = JSON.parse(read(`data/${id}.json`));
        contexts.set(id, { topic, items: data.items, collections: data.collections || [], countries: COUNTRIES, byId: new Map(data.items.map(item => [item.q, item])) });
    }
    return contexts.get(id);
};
// withChoices = nesprávné možnosti jako ve hře (pomalé: podobnost se všemi položkami), jinak jen správná
const questionOf = (item, ctx, withChoices = false) => ({ type: 'name', title: ctx.topic.words.question, showName: false, answerLabel: item.n,
    accepted: core.nameAnswers(item, ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : []),
    choices: withChoices ? core.buildItemChoices(item, ctx.items, core.createSeededRandom(`test-${item.q}`), other => (ctx.topic.similarity ? ctx.topic.similarity(item, other, ctx) : 0), core.cultureLandsFor(ctx.topic, ctx))
        : [{ label: item.n, correct: true, id: item.q }] });
const riddleFor = (topicId, name, { year = 2026, withChoices = false } = {}) => {
    const ctx = contextOf(topicId);
    const item = ctx.items.find(entry => entry.n === name);
    assert.ok(item, `${topicId}: ${name}`);
    const category = ctx.topic.categories.find(entry => entry.key === item.c) || {};
    return { item, ctx, riddle: M.riddleOf(item, { ctx, question: questionOf(item, ctx, withChoices), typeLabel: item.ty || category.one, facts: ctx.topic.facts(item, ctx, 'result'), year }) };
};
const fold = (text) => String(text).toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Čísla mají nezlomitelnou mezeru („9 100 km“ se nezalomí); v testu obyčejná
const sp = (text) => String(text).replace(/\u00a0/g, ' ');

test('vzdálenost a směr od Prahy: haversine, zaokrouhlení podle velikosti, osm směrů jako na mapě; řeka, Česko a Praha v názvu bez ní', () => {
    assert.ok(Math.abs(M.haversineKm(M.PRAGUE, { lat: 52.52, lon: 13.405 }) - 280) < 5, 'Praha–Berlín asi 280 km');
    assert.deepEqual([4, 37, 95, 98, 280, 327, 975, 1040, 7342].map(M.roundKm), [0, 40, 100, 100, 300, 350, 1000, 1000, 7300], 'do 100 km na 10, do 1 000 na 50, dál na 100');
    const at = (lat, lon) => { const compass = M.compassOf({ lat, lon }); return compass && { ...compass, text: sp(compass.text) }; };
    assert.equal(at(52.52, 13.405).text, 'Asi 300 km na sever od Prahy');
    assert.equal(at(48.2082, 16.3738).text, 'Asi 250 km na jihovýchod od Prahy', 'Vídeň');
    assert.equal(at(49.1951, 16.6068).text, 'Asi 200 km na jihovýchod od Prahy', 'Brno');
    assert.equal(at(49.9394, 14.1883).text, 'Asi 20 km na jihozápad od Prahy', 'Karlštejn');
    assert.equal(at(41.9028, 12.4964).text, 'Asi 900 km na jih od Prahy', 'Řím');
    // Směr jako na mapě (loxodroma), ne po nejkratší cestě přes sever: Tokio na východ, New York na západ
    assert.equal(at(35.6762, 139.6503).text, 'Asi 9 100 km na východ od Prahy');
    assert.equal(at(40.7128, -74.006).text, 'Asi 6 600 km na západ od Prahy');
    assert.equal(at(-33.8688, 151.2093).dir, 'na jihovýchod', 'Sydney');
    assert.equal(at(21.3069, -157.8583).dir, 'na západ', 'Honolulu: kratší cestou, přes Atlantik');
    assert.equal(at(-33.9249, 18.4241).dir, 'na jih', 'Kapské Město');
    // Všech osm směrů po 45°
    const dirs = [[51, 14.42], [50.7, 15.4], [50.09, 16], [49.5, 15.3], [49, 14.42], [49.5, 13.5], [50.09, 12.8], [50.7, 13.4]].map(([lat, lon]) => at(lat, lon));
    assert.deepEqual(dirs.map(entry => entry.dir), ['na sever', 'na severovýchod', 'na východ', 'na jihovýchod', 'na jih', 'na jihozápad', 'na západ', 'na severozápad']);
    assert.deepEqual(dirs.map(entry => entry.deg), [0, 45, 90, 135, 180, 225, 270, 315]);
    assert.deepEqual(at(50.0875, 14.4213), { km: 0, deg: 0, dir: '', text: 'Méně než 10 km od středu Prahy' }, 'v Praze bez směru');
    for (const bad of [null, {}, { lat: 'x', lon: 1 }, { lat: 91, lon: 0 }, { lat: 10, lon: 200 }]) assert.equal(M.compassOf(bad), null);
    // Kdy ne: řeka (jeden bod dlouhého toku), Česko samo, odpověď s Prahou v názvu („od Prahy“ by ji prozradilo)
    const round = (over) => ({ topic: 'zemepis', category: 'hora', name: 'Sněžka', isCzech: true, coords: { lat: 50.736, lon: 15.74 }, ...over });
    assert.equal(sp(M.compassFor(round()).text), 'Asi 100 km na severovýchod od Prahy');
    assert.equal(M.compassFor(round({ category: 'reka', name: 'Vltava' })), null);
    assert.equal(M.compassFor(round({ category: 'stat', name: 'Česko' })), null);
    for (const name of ['Praha', 'Pražský hrad', 'Praha 5', 'Pražské jaro']) assert.equal(M.compassFor(round({ name, coords: { lat: 50.09, lon: 14.4 } })), null, name);
    assert.equal(M.compassFor(round({ coords: null })), null, 'starší otázka bez souřadnic');
});

test('doba: desetiletí od 1800, polovina století od 1000, století, tisíciletí př. n. l.; rozpětí působení a války', () => {
    const years = [[1961, '60. léta 20. století'], [1883, '80. léta 19. století'], [2015, '10. léta 21. století'], [1905, 'začátek 20. století'], [2005, 'začátek 21. století'],
        [1900, 'přelom 19. a 20. století'], [1800, 'přelom 18. a 19. století'], [1600, 'přelom 16. a 17. století'], [1550, '1. polovina 16. století'], [1551, '2. polovina 16. století'],
        [1348, '1. polovina 14. století'], [800, '8. století'], [100, '1. století'], [82, '1. století'], [-781, '8. století př. n. l.'], [-1000, '1. tisíciletí př. n. l.'], [-2560, '3. tisíciletí př. n. l.']];
    for (const [year, text] of years) assert.equal(M.eraOfYear(year), text, String(year));
    assert.equal(M.eraOfYear(0), '');
    assert.equal(M.eraOfYear(-20000), '', 'pravěk bez doby');
    const spans = [[[1939, 1945], '30. a 40. léta 20. století'], [[1960, 1969], '60. léta 20. století'], [[1903, 1924], '1. polovina 20. století'], [[2009, 2017], '1. polovina 21. století'],
        [[1346, 1378], '14. století'], [[1880, 1911], '19.–20. století'], [[-246, -220], '3. století př. n. l.'], [[-258, -150], '3.–2. století př. n. l.'], [[-27, 395], '1. století př. n. l. – 4. století n. l.']];
    for (const [[from, to], text] of spans) assert.equal(M.eraOfSpan(from, to), text, `${from}–${to}`);
    // Osobnost: od úřadu (vlády, kariéry), jinak od dvaceti let; do konce, smrti, nebo dodnes; dlouhé působení jen nakouknuté do dalšího století
    const era = (f, topic = 'hudba', c = 'skladatele') => M.eraOf({ c, f }, topic, 2026);
    assert.deepEqual(era({ born: 1813, died: 1901 }), { label: 'Doba působení', value: '19. století' }, 'Verdi 1833–1901 je 19. století');
    assert.deepEqual(era({ born: 1841, died: 1904 }), { label: 'Doba působení', value: '19.–20. století' }, 'Dvořák');
    assert.deepEqual(era({ born: 1984 }, 'film', 'herci'), { label: 'Doba působení', value: '1. polovina 21. století' }, 'žijící: dodnes');
    assert.deepEqual(era({ born: 1316, died: 1378, from: 1346, to: 1378 }, 'historie', 'panovnik'), { label: 'Doba vlády', value: '14. století' });
    assert.deepEqual(M.eraOf({ c: 'stavby', f: { y: 1961 } }, 'architektura', 2026), { label: 'Doba vzniku', value: '60. léta 20. století' });
    assert.deepEqual(M.eraOf({ c: 'bitva', f: { year: 1618, end: 1648 } }, 'historie', 2026), { label: 'Doba', value: '1. polovina 17. století' });
    assert.deepEqual(M.eraOf({ c: 'prvky', f: { year: 1868 } }, 'chemie', 2026), { label: 'Doba objevu', value: '60. léta 19. století' });
    assert.deepEqual(M.eraOf({ c: 'mise', f: { year: 1969 } }, 'fyzika', 2026), { label: 'Doba', value: '60. léta 20. století' }, 'mise je událost');
    // Kde rok neznamená vznik (hora, park), nebo téma doby nemá, doba není
    assert.equal(M.eraOf({ c: 'hora', f: { year: 1865 } }, 'zemepis', 2026), null);
    assert.equal(M.eraOf({ c: 'obdobi', f: { from: -541, to: -252 } }, 'geologie', 2026), null);
    assert.equal(M.eraOf({ c: 'stavby', f: { y: 2030 } }, 'architektura', 2026), null, 'budoucí rok ne');
});

test('ano/ne: jen jisté výroky z dat (kontinent, polokoule, žije, stáří, velikost, ocenění, vlastnosti), nanejvýš tři', () => {
    const yes = (item, more = {}) => M.yesNoOf({ g: [], f: {}, ...item }, { topicId: 'zemepis', year: 2026, ...more });
    const q = (list) => list.map(entry => sp(`${entry.q} ${entry.a ? 'Ano' : 'Ne'}`));
    // Kontinent jen daleko od Prahy, na pomezí Evropy a Asie vůbec; polokoule jen mimo Evropu a jen když je celé místo na jedné straně rovníku
    assert.deepEqual(q(yes({ c: 'mesto', co: ['Q142'] }, { coords: { lat: 48.86, lon: 2.35 }, continent: 'EU' })), ['Je to v Evropě? Ano']);
    assert.deepEqual(q(yes({ c: 'mesto', co: ['Q183'] }, { coords: { lat: 52.52, lon: 13.4 }, continent: 'EU' })), [], 'Berlín: Evropa je jasná ze vzdálenosti');
    assert.deepEqual(q(yes({ c: 'mesto', co: ['Q43'] }, { coords: { lat: 39.93, lon: 32.86 }, continent: 'AS' })), ['Je to na jižní polokouli? Ne'], 'Turecko: na pomezí se na Evropu neptá');
    assert.deepEqual(q(yes({ c: 'mesto', co: ['Q408'] }, { coords: { lat: -33.87, lon: 151.21 }, continent: 'OC' })), ['Je to v Evropě? Ne', 'Je to na jižní polokouli? Ano']);
    assert.deepEqual(q(yes({ c: 'stat', co: ['Q155'], f: { area: 8515767 } }, { coords: { lat: -10, lon: -53 }, continent: 'SA' })), ['Je to v Evropě? Ne', 'Je větší než Česko? Ano'], 'Brazílie přes rovník: na polokouli se neptá');
    assert.deepEqual(q(yes({ c: 'reka', co: ['Q79'], f: { len: 6650 } }, { coords: { lat: 31.5, lon: 30.4 }, continent: 'AF' })), ['Je to v Evropě? Ne', 'Je delší než 5 000 km? Ano'], 'řeka bez polokoule');
    // Osobnost: „Žije ještě? Ne“ jen se smrtí v datech nebo narozením před víc než 110 lety; žijící bez výroku (smrt může v datech chybět)
    assert.deepEqual(q(yes({ c: 'herci', f: { born: 1889, died: 1977 } }, { topicId: 'film' })), ['Žije ještě? Ne']);
    assert.deepEqual(q(yes({ c: 'herci', f: { born: 1890 } }, { topicId: 'film' })), ['Žije ještě? Ne']);
    assert.deepEqual(q(yes({ c: 'herci', f: { born: 1984 } }, { topicId: 'film' })), []);
    // Stáří: kulatá hranice nejblíž, ne těsně u hodnoty; událost a objev jinými slovy
    assert.deepEqual(q(yes({ c: 'stavby', f: { y: 1961 } }, { topicId: 'architektura' })), ['Je to starší než 50 let? Ano']);
    assert.deepEqual(q(yes({ c: 'stavby', f: { y: 1882 } }, { topicId: 'architektura' })), ['Je to starší než 200 let? Ne']);
    assert.deepEqual(q(yes({ c: 'stavby', f: { y: 1926 } }, { topicId: 'architektura' })), ['Je to starší než 50 let? Ano'], '100 let přesně: hranice 100 se nepoužije');
    assert.deepEqual(q(yes({ c: 'bitva', f: { year: 1620 } }, { topicId: 'historie' })), ['Stalo se to před víc než 500 lety? Ne']);
    assert.deepEqual(q(yes({ c: 'udalosti', f: { year: 1932, end: 1933 } }, { topicId: 'historie' })), [], 'těsně u stovky: nic');
    assert.deepEqual(q(yes({ c: 'prvky', f: { year: 1766, fam: 'nekovy' } }, { topicId: 'chemie' })), ['Je objev starší než 200 let? Ano', 'Je to kov? Ne']);
    assert.deepEqual(q(yes({ c: 'vynalezy', f: { year: 1876 } }, { topicId: 'fyzika' })), ['Je vynález starší než 200 let? Ne'], '150 let: bližší je 200');
    // Velikost: výška hory, počet obyvatel, rozloha proti Česku (ne Česko samo, ne skoro stejná), délka řeky
    assert.deepEqual(q(yes({ c: 'hora', f: { elev: 4478 } })), ['Je vyšší než 5 000 m? Ne'], 'Matterhorn: nejbližší kulatá hranice');
    assert.deepEqual(q(yes({ c: 'mesto', f: { pop: 120000 } })), ['Má víc než 100 000 obyvatel? Ano']);
    assert.deepEqual(q(yes({ c: 'mesto', f: { pop: 1400000 } })), ['Má víc než milion obyvatel? Ano']);
    assert.deepEqual(q(yes({ c: 'stat', f: { pop: 1.4e9 } })), ['Má víc než miliardu obyvatel? Ano']);
    assert.deepEqual(q(yes({ c: 'stat', q: 'Q213', f: { area: 78871 } })), []);
    assert.deepEqual(q(yes({ c: 'jezero', f: { area: 82350 } })), [], 'Hořejší jezero je skoro jako Česko');
    assert.deepEqual(q(yes({ c: 'stavba', f: { h: 46 } })), ['Je vyšší než 50 m? Ne']);
    // Ocenění a vlastnosti, které data uvádějí přesně
    assert.deepEqual(q(yes({ c: 'savci', f: { iucn: 'EN', mass: 180 }, g: ['nase-priroda'] }, { topicId: 'biologie' })), ['Je to ohrožený druh? Ano', 'Může vážit víc než 100 kg? Ano', 'Vyskytuje se v naší přírodě? Ano']);
    assert.deepEqual(q(yes({ c: 'savci', f: { iucn: 'NT' } }, { topicId: 'biologie' })), [], 'téměř ohrožený: ani ano, ani ne');
    assert.deepEqual(q(yes({ c: 'ptaci', f: { mass: 0.016 } }, { topicId: 'biologie' })), ['Může vážit víc než 10 g? Ano']);
    assert.deepEqual(q(yes({ c: 'prvky', f: { fam: 'vzacne-plyny' } }, { topicId: 'chemie' })), ['Je to kov? Ne', 'Je za pokojové teploty plyn? Ano']);
    assert.deepEqual(q(yes({ c: 'prvky', f: { fam: 'prechodne-kovy', melt: 1538 } }, { topicId: 'chemie' })), ['Je to kov? Ano', 'Je za pokojové teploty plyn? Ne']);
    assert.deepEqual(q(yes({ c: 'kameny', f: { h: [8, 8] } }, { topicId: 'geologie' })), ['Poškrábe se nehtem? Ne', 'Je tvrdší než sklo? Ano']);
    assert.deepEqual(q(yes({ c: 'nerosty', f: { h: [1, 1] } }, { topicId: 'geologie' })), ['Poškrábe se nehtem? Ano', 'Je tvrdší než sklo? Ne']);
    assert.deepEqual(q(yes({ c: 'nerosty', f: { h: [2.5, 3] } }, { topicId: 'geologie' })), ['Je tvrdší než sklo? Ne'], 'nehet 2,5: hraniční tvrdost bez výroku');
    assert.deepEqual(q(yes({ c: 'sportovci', f: { born: 1986, gold: 8 } }, { topicId: 'sport' })), ['Má olympijské zlato? Ano']);
    assert.deepEqual(q(yes({ c: 'spisovatele', f: { born: 1883, died: 1924, nobel: 1 } }, { topicId: 'literatura' })), ['Žije ještě? Ne', 'Má Nobelovu cenu? Ano']);
    assert.deepEqual(q(yes({ c: 'mesto', g: ['hlavni-mesta'] })), ['Je to hlavní město státu? Ano']);
    assert.deepEqual(q(yes({ c: 'mesto', g: ['hlavni-mesta'] }, { typeLabel: 'hlavní město' })), [], 'druh už to říká');
    // Nanejvýš tři, střídavě kde, kdy a co
    const many = yes({ c: 'mesto', co: ['Q408'], f: { year: 1788, pop: 5e6 }, g: ['unesco'] }, { coords: { lat: -33.87, lon: 151.21 }, continent: 'OC' });
    assert.deepEqual(q(many), ['Je to v Evropě? Ne', 'Je to starší než 200 let? Ano', 'Má víc než 10 milionů obyvatel? Ne'], '5 milionů: bližší je 10 milionů');
});

test('ano/ne na skutečných datech: výroky odpovídají datům (kontinent, polokoule, smrt, rok vzniku)', () => {
    for (const topicId of ['zemepis', 'architektura', 'historie', 'literatura', 'biologie']) {
        const ctx = contextOf(topicId);
        for (const item of M.candidatesOf(ctx.items, '2026-11-13').filter((entry, i) => i % 5 === 0)) {
            const coords = ctx.topic.coords ? ctx.topic.coords(item, ctx) : null;
            const continent = (item.co || []).length ? core.getContinent(item, COUNTRIES) : '';
            const list = M.yesNoOf(item, { topicId, coords: coords && Number.isFinite(coords.lat) ? coords : null, continent, year: 2026 });
            assert.ok(list.length <= 3, item.n);
            const f = item.f || {};
            for (const entry of list) {
                if (entry.q === 'Je to v Evropě?') assert.equal(entry.a, continent === 'EU', item.n);
                if (entry.q === 'Je to na jižní polokouli?') assert.equal(entry.a, coords.lat < 0, item.n);
                if (entry.q === 'Žije ještě?') assert.ok(!entry.a && (f.died !== undefined || f.born < 1916), item.n);
                const age = /(\d[\d\u00a0]*) let(?:y)?\?/.exec(entry.q);
                if (age) {
                    const limit = Number(age[1].replace(/\u00a0/g, ''));
                    const made = f.year ?? f.y ?? f.from ?? f.opened;
                    assert.equal(entry.a, 2026 - made > limit, `${item.n}: ${entry.q} (${made})`);
                }
            }
        }
    }
});

test('indicie a související jméno ze skutečných dat: krátká, bez odpovědi, státu a národnosti, bez opakování druhu', () => {
    const { riddle: zeus } = riddleFor('mytologie', 'Zeus');
    assert.deepEqual(zeus.keywords, ['blesk', 'mytický býk', 'Olympští bohové']);
    assert.deepEqual(zeus.related, { name: 'Kronos a Rheia', strong: false });
    const { riddle: poe } = riddleFor('literatura', 'Edgar Allan Poe');
    assert.deepEqual(poe.keywords, ['romantismus', 'detektivka', 'angličtina'].filter(word => poe.keywords.includes(word)));
    assert.ok(poe.keywords.length >= 2);
    assert.deepEqual(poe.related, { name: 'Havran', strong: true }, 'slavné dílo je silné');
    assert.deepEqual(poe.yesno, [{ q: 'Žije ještě?', a: false }]);
    assert.deepEqual(poe.era, { label: 'Doba působení', value: '1. polovina 19. století' });
    const { riddle: tiger } = riddleFor('biologie', 'Tygr', { withChoices: true });
    assert.deepEqual(tiger.keywords, ['šelmy', 'kočkovití'], 'jméno nesprávné možnosti (Kočka bažinná) indicii nevadí – možnosti se neukazují');
    const { riddle: gaudi } = riddleFor('architektura', 'Sagrada Família');
    assert.deepEqual(gaudi.related, { name: 'Antoni Gaudí', strong: false });
    assert.ok(gaudi.yesno.some(entry => entry.q === 'Je na seznamu UNESCO?' && entry.a));
    const { riddle: vietnam } = riddleFor('zemepis', 'Vietnam');
    assert.deepEqual(vietnam.related, { name: 'Hanoj', strong: true }, 'hlavní město');
    const { riddle: football } = riddleFor('sport', 'Fotbal');
    assert.deepEqual(football.keywords, ['kopačky', 'Míčové hry', 'branka']);
    // Kandidáti několika témat: nic z odpovědi, žádný stát, kontinent ani národnost, indicie aspoň dvě a nanejvýš tři
    const countryNames = Object.values(COUNTRIES).map(country => fold(country.name));
    for (const topicId of ['zemepis', 'historie', 'hudba', 'film', 'umeni', 'sport', 'mytologie']) {
        const ctx = contextOf(topicId);
        for (const item of M.candidatesOf(ctx.items, '2026-11-13').filter((entry, i) => i % 9 === 0)) {
            const { riddle } = riddleFor(topicId, item.n);
            assert.ok(riddle && Array.isArray(riddle.yesno) && Array.isArray(riddle.keywords), item.n);
            assert.ok(riddle.keywords.length === 0 || (riddle.keywords.length >= 2 && riddle.keywords.length <= 3), item.n);
            const stems = fold(item.n).split(/[^\p{L}]+/u).filter(word => word.length >= 5).map(word => word.slice(0, 5));
            for (const text of [...riddle.keywords, ...(riddle.related ? [riddle.related.name] : [])]) {
                const words = fold(text).split(/[^\p{L}]+/u);
                assert.ok(!words.some(word => word.length >= 5 && stems.includes(word.slice(0, 5))), `${item.n}: „${text}“ prozrazuje odpověď`);
                assert.ok(!countryNames.some(name => ` ${words.join(' ')} `.includes(` ${name} `)), `${item.n}: „${text}“ je stát`);
                assert.ok(!/(?<![\p{L}])(evrop|asi[ei]|afri|ameri)/u.test(fold(text)), `${item.n}: „${text}“ je kontinent`);
            }
            for (const word of riddle.keywords) {
                assert.equal(M.strongMask(word), word, `${item.n}: „${word}“ má národnost nebo vlastní jméno`);
                assert.ok(word.length <= 28 && !/\d/.test(word), word);
            }
        }
    }
    // Bez položky nebo jádra nic nespadne
    assert.equal(M.riddleOf(null, {}), null);
    assert.equal(M.answerGuard(null, null, {}, {})('cokoli'), true, 'bez jádra je podezřelé všechno');
});

// Otázka s krátkými nápovědami (jako createRoundData s options.plain)
const riddleRound = (over = {}) => roundData({
    topic: 'architektura', category: 'stavby', name: 'Karlův most', typeLabel: 'most', isCzech: true, coords: { lat: 50.0865, lon: 14.4114 },
    questionText: '[***] je kamenný most přes řeku. Stavba začala roku 1357 za vlády krále. Most zdobí třicet soch světců.',
    hints: [
        { key: 'photo', kind: 'photo', label: 'fotka', icon: 'image' },
        { key: 'visual', kind: 'visual', spec: { type: 'map', lat: 50.0865, lon: 14.4114 }, label: 'slepá mapa', icon: 'map' },
        { key: 'facts', kind: 'facts', facts: [{ label: 'Sloh', value: 'Gotika' }, { label: 'Vznik', value: '1357' }, { label: 'Délka', value: '516 m' }, { label: 'Architekt', value: 'Petr Parléř' }, { label: 'Město', value: 'Praha' }] }
    ],
    riddle: { yesno: [{ q: 'Je to starší než 500 let?', a: true }], era: { label: 'Doba vzniku', value: '2. polovina 14. století' }, keywords: ['Gotika', 'Mosty a přehrady'], related: { name: 'Petr Parléř', strong: false } },
    ...over
});

test('pořadí: krátké nápovědy brzy, přesný fakt až po hrubé nápovědě, souvislost a text pozdě, fotky nakonec; nic dvakrát', () => {
    const clues = M.buildClues(riddleRound(), { topicTitle: 'Architektura' });
    assert.equal(clues.length, 8);
    assert.deepEqual(clues.map(clue => clue.hour), M.CLUE_HOURS);
    const at = (type) => clues.findIndex(clue => clue.parts.some(part => part.type === type));
    const atFact = (label) => clues.findIndex(clue => clue.parts.some(part => part.type === 'facts' && part.facts.some(fact => fact.label === label)));
    assert.equal(clues[0].title, 'Co hledáme');
    assert.deepEqual(clues[0].parts[1], { type: 'facts', facts: [{ label: 'Délka', value: '516 m' }] }, 'první nápověda: nejslabší fakt (ne rok, o kterém mluví doba, ani město)');
    for (const type of ['yesno', 'compass', 'era', 'keywords', 'related']) assert.ok(at(type) > 0 && at(type) < 6, `${type} ve středních nápovědách`);
    assert.ok(at('yesno') <= 2 && at('compass') <= 2, 'ano/ne a vzdálenost u místa v Česku brzy');
    assert.ok(atFact('Vznik') > at('era') && atFact('Vznik') > at('yesno'), 'rok až po době vzniku a stáří');
    assert.ok(at('related') >= at('keywords') && at('text') > at('keywords'), 'souvislost a text až po indiciích');
    for (const type of ['yesno', 'compass', 'era', 'keywords']) assert.ok(at(type) <= at('text'), `${type} před textem`);
    assert.ok(atFact('Město') === -1 || atFact('Město') > at('visual'), 'město až po mapě (nebo se nevejde)');
    assert.deepEqual(clues[6].parts, [{ type: 'photo', url: 'https://upload.wikimedia.org/foto.jpg', blur: true }]);
    assert.deepEqual(clues[7].parts, [{ type: 'photo', url: 'https://upload.wikimedia.org/foto.jpg', blur: false }]);
    // Indicie a související jméno se ve faktech neopakují; vzdálenost v Praze bez směru
    const factLabels = clues.flatMap(clue => clue.parts.filter(part => part.type === 'facts').flatMap(part => part.facts.map(fact => fact.label)));
    assert.ok(!factLabels.includes('Sloh') && !factLabels.includes('Architekt'), factLabels.join());
    assert.equal(clues[at('compass')].parts.find(part => part.type === 'compass').text, 'Méně než 10 km od středu Prahy');
    assert.ok(!JSON.stringify(clues).includes('Karlův'), 'odpověď nikde');
    // Přesný fakt nikdy ve stejné nápovědě jako hrubá nápověda o něm
    for (const clue of clues) assert.ok(!(clue.parts.some(part => part.type === 'era') && clue.parts.some(part => part.type === 'facts' && part.facts.some(fact => fact.label === 'Vznik'))), clue.title);
    // Kousků je víc než míst: nanejvýš dva v jedné nápovědě, spojené tituly s tečkou
    assert.ok(clues.slice(1, 6).every(clue => clue.parts.length <= 2), clues.map(clue => clue.parts.length).join());
    assert.ok(clues.some(clue => / · /.test(clue.title)));
    // Silné souvislosti (slavné dílo, hlavní město) přijdou až po textu
    const strong = M.buildClues(riddleRound({ riddle: { ...riddleRound().riddle, related: { name: 'Praha', strong: true } } }), { topicTitle: 'Architektura' });
    const strongAt = strong.findIndex(clue => clue.parts.some(part => part.type === 'related'));
    assert.ok(strongAt >= strong.findIndex(clue => clue.parts.some(part => part.type === 'text')), 'silná souvislost po první větě');
    assert.ok(strongAt <= 5);
    // Řazení podle síly: krátké nápovědy slabší než text, vzdálenost do světa uprostřed
    const score = (parts) => M.revealScore({ parts });
    assert.ok(score([{ type: 'yesno', items: [{ q: 'x', a: true }] }]) < score([{ type: 'text', text: 'Je to most přes řeku.' }]));
    assert.ok(score([{ type: 'compass', km: 20 }]) < score([{ type: 'compass', km: 6600 }]));
    assert.ok(score([{ type: 'compass', km: 6600 }]) < score([{ type: 'visual', spec: {} }]));
    assert.ok(score([{ type: 'era', value: 'x' }]) < score([{ type: 'keywords', words: ['a', 'b'] }]));
    assert.ok(score([{ type: 'related', strong: false }]) < score([{ type: 'related', strong: true }]));
});

test('starší uložená otázka bez krátkých nápověd i poškozená data: nic nespadne, zbytek jako dřív (vzdálenost ze souřadnic)', () => {
    const clues = M.buildClues(riddleRound({ riddle: undefined }), { topicTitle: 'Architektura' });
    assert.equal(clues.length, 8);
    const types = clues.flatMap(clue => clue.parts.map(part => part.type));
    assert.ok(types.includes('compass'), 'souřadnice měla otázka i dřív');
    assert.ok(!types.some(type => ['yesno', 'era', 'keywords', 'related'].includes(type)));
    for (const riddle of [null, 'x', 5, { yesno: 'x', era: 7, keywords: 'abc', related: [] }, { yesno: [{ q: 3, a: 'ano' }, null], keywords: [1, null], era: { label: '', value: 'x' } }]) {
        const broken = M.buildClues(riddleRound({ riddle }), { topicTitle: 'Architektura' });
        assert.equal(broken.length, 8);
        assert.ok(!broken.some(clue => clue.parts.some(part => ['yesno', 'era', 'keywords', 'related'].includes(part.type))), JSON.stringify(riddle));
    }
    // Jedna indicie nestačí; příliš dlouhý text z uložených dat se zkrátí
    assert.ok(!M.buildClues(riddleRound({ riddle: { keywords: ['Gotika'] } })).some(clue => clue.parts.some(part => part.type === 'keywords')));
    const long = M.buildClues(riddleRound({ riddle: { yesno: [{ q: 'x'.repeat(500), a: true }] } }));
    assert.ok(long.some(clue => clue.parts.some(part => part.type === 'yesno' && part.items[0].q.length === 80)));
});

test('vykreslení krátkých nápověd: ano/ne, růžice se šipkou, doba, indicie a souvislost bez inline stylů', () => {
    const h = { photoFrame: (attrs) => `<div ${attrs}></div>`, visualFrame: (spec, id) => `<div id="${id}"></div>`, avatarHtml: () => '<span></span>', xpLine: () => '' };
    const clues = M.buildClues(riddleRound({ coords: { lat: 50.736, lon: 15.74 } }), { topicTitle: 'Architektura' });
    const screen = M.screenHtml({ day: '2026-11-13', shown: 6, next: { n: 7, label: '17:00' }, clues, entry: M.newEntry({}), canGuess: true, pointsNow: 5 }, h);
    assert.match(screen, /data-mystery-yesno[\s\S]*Je to starší než 500 let\?[\s\S]*data-lucide="check"[\s\S]*Ano/);
    assert.match(sp(screen), /data-mystery-compass[\s\S]*<svg[\s\S]*transform="rotate\(45\)"[\s\S]*Asi 100 km[\s\S]*na severovýchod od Prahy/);
    assert.match(screen, /data-mystery-era[\s\S]*Doba vzniku[\s\S]*2\. polovina 14\. století/);
    assert.match(screen, /data-mystery-keywords[\s\S]*<li[^>]*>Gotika<\/li>[\s\S]*<li[^>]*>Mosty a přehrady<\/li>/);
    assert.match(screen, /data-mystery-related[\s\S]*Souvisí s:[\s\S]*Petr Parléř/);
    assert.doesNotMatch(screen, /style=|on[a-z]+=/i, 'CSP: bez inline stylů a skriptů');
    const prague = M.screenHtml({ day: '2026-11-13', shown: 8, next: null, clues: M.buildClues(riddleRound({ riddle: { yesno: [{ q: 'Je to v Evropě?', a: false }] }, coords: { lat: 50.09, lon: 14.42 } })), entry: M.newEntry({}), canGuess: true, pointsNow: 3 }, h);
    assert.match(prague, /data-lucide="x"[^>]*><\/i>Ne/);
    assert.match(prague, /Do 10 km[\s\S]*od středu Prahy/);
    assert.doesNotMatch(prague, /transform="rotate/, 'v Praze bez šipky');
    // Barvy růžice a odznaků jsou v sestaveném CSS (Tailwind je najde v mystery.js)
    const css = read('styles.css');
    for (const cls of ['fill-violet-50', 'stroke-violet-200', 'fill-violet-700', 'fill-gold-400', 'bg-emerald-100', 'text-emerald-800', 'bg-rose-100', 'text-rose-800']) assert.ok(css.includes(`.${cls}`), cls);
});
