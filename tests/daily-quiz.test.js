// Kvíz dne (daily-quiz.js): výběr otázek ze semínka dne (stejný pro všechny, témata ze skupin, obtížnost, nic ze včerejška), součty a mřížka,
// text ke sdílení, série, XP, uložený stav (pokus, převzetí dne, poškozená data) a zapojení do stránky (index.html, service worker, nasazení, Tailwind).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DQ = require('../daily-quiz.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const GROUPS = [['zemepis', 'vlajky', 'historie', 'mytologie'], ['biologie', 'geologie', 'chemie', 'fyzika'], ['umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport']];
// Malá data tématu: kategorie a, b po 30 položkách, známé jen prvních 24 (seřazené podle známosti), jedna bez otázky (nq)
const topicData = (id) => {
    const items = [];
    for (const c of ['a', 'b']) for (let i = 0; i < 30; i++) items.push({ q: `${id}-${c}${i}`, n: `${id} ${c}${i}`, c, k: i < 24 ? 1 : 0, ...(i === 5 ? { nq: 1 } : {}) });
    return { items, categories: ['a', 'b'] };
};
const DATA = Object.fromEntries(GROUPS.flat().map(id => [id, topicData(id)]));
const dataOf = (id) => DATA[id] || null;

test('dny: Praha, posun, formát a čas', () => {
    assert.equal(DQ.pragueDay(new Date('2026-11-08T22:30:00Z')), '2026-11-08');
    assert.equal(DQ.pragueDay(new Date('2026-11-08T23:30:00Z')), '2026-11-09', '0:30 v Praze už je další den');
    assert.equal(DQ.pragueDay(new Date('2026-07-08T22:30:00Z')), '2026-07-09', 'v létě je Praha o dvě hodiny napřed');
    assert.equal(DQ.addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(DQ.addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(DQ.formatDay('2026-11-08'), '8. 11.');
    assert.equal(DQ.formatDay('2026-11-08', true), '8. 11. 2026');
    assert.equal(DQ.formatTime(95000), '1:35');
    assert.equal(DQ.formatTime(3725000), '1:02:05');
    assert.equal(DQ.formatTime(-5), '0:00');
    assert.equal(DQ.pointsWord(1), '1 bod');
    assert.equal(DQ.pointsWord(3), '3 body');
    assert.equal(DQ.pointsWord(26), '26 bodů');
    assert.equal(DQ.daysWord(1), '1 den');
    assert.equal(DQ.daysWord(4), '4 dny');
    assert.equal(DQ.daysWord(5), '5 dní');
});

test('témata dne: 10 různých, poměrně ze skupin, obtížnost 3/4/3 od snadnějších, pro každý den jiná a stejná pro všechny', () => {
    const slots = DQ.slotsFor('2026-11-08', GROUPS);
    assert.equal(slots.length, DQ.QUESTIONS);
    assert.equal(new Set(slots.map(slot => slot.topic)).size, 10, 'každé téma nejvýš jednou');
    const perGroup = GROUPS.map(group => slots.filter(slot => group.includes(slot.topic)).length);
    assert.deepEqual(perGroup, [3, 3, 4], 'poměrně k velikosti skupin (4, 4, 6 témat)');
    assert.deepEqual(slots.map(slot => slot.tier), [0, 0, 0, 1, 1, 1, 1, 2, 2, 2]);
    assert.deepEqual(DQ.slotsFor('2026-11-08', GROUPS), slots, 'stejné pro stejný den');
    const days = Array.from({ length: 20 }, (_, i) => DQ.slotsFor(DQ.addDays('2026-11-01', i), GROUPS).map(slot => slot.topic).join(','));
    assert.ok(new Set(days).size > 15, 'dny se liší');
    // Méně témat než otázek (jen testovací data): témata se opakují, otázek je pořád 10
    const few = DQ.slotsFor('2026-11-08', [['zemepis', 'historie'], ['biologie']]);
    assert.equal(few.length, 10);
    assert.ok(few.every(slot => ['zemepis', 'historie', 'biologie'].includes(slot.topic)));
    assert.deepEqual(DQ.slotsFor('2026-11-08', []), []);
});

test('obtížnost podle známosti: první třetina známých v kategorii snadnější, neznámé a bez otázky se nepočítají', () => {
    const tiers = DQ.tiersOf(DATA.zemepis.items);
    assert.equal(tiers.get('zemepis-a0'), 0);
    assert.equal(tiers.get('zemepis-a12'), 1);
    assert.equal(tiers.get('zemepis-a23'), 2);
    assert.equal(tiers.has('zemepis-a25'), false, 'méně známá položka do Kvízu dne nepatří');
    assert.equal(tiers.has('zemepis-a5'), false, 'položka bez otázky (nq) také ne');
});

test('plán dne: deterministický, jen známé položky v obtížnosti pozice, bez opakování v dni ani ze včerejška', () => {
    const plan = DQ.planDay('2026-11-08', GROUPS, dataOf);
    assert.equal(plan.length, 10);
    assert.deepEqual(DQ.planDay('2026-11-08', GROUPS, dataOf), plan, 'každý hráč dostane totéž');
    for (const entry of plan) {
        const item = DATA[entry.topic].items.find(candidate => candidate.q === entry.q);
        assert.ok(item, `${entry.q} existuje`);
        assert.equal(item.k, 1, 'známá položka');
        assert.equal(DQ.tiersOf(DATA[entry.topic].items).get(entry.q), entry.tier, 'obtížnost pozice');
    }
    assert.equal(new Set(plan.map(entry => entry.q)).size, 10);
    // Plán po částech (aplikace ho počítá po otázkách) se shoduje s celým
    assert.deepEqual(DQ.planDay('2026-11-08', GROUPS, dataOf, 3), plan.slice(0, 4));
    // Malá data: včerejší položka téhož tématu se nikdy nezopakuje (40 dní)
    const tiny = (id) => ({ items: DATA[id].items.filter(item => item.c === 'a').slice(0, 6).map(item => ({ ...item, nq: undefined })), categories: ['a'] });
    let previous = null;
    for (let i = 0; i < 40; i++) {
        const day = DQ.addDays('2026-10-01', i);
        const today = DQ.planDay(day, GROUPS, tiny);
        if (previous) {
            const before = new Map(previous.map(entry => [entry.topic, entry.q]));
            for (const entry of today) assert.notEqual(before.get(entry.topic), entry.q, `${day}: ${entry.topic} jako včera`);
        }
        previous = today;
    }
    // Téma, které se nenačetlo: plán skončí dřív (aplikace ho dočte, až data budou)
    const missing = DQ.slotsFor('2026-11-08', GROUPS)[2].topic;
    assert.equal(DQ.planDay('2026-11-08', GROUPS, id => (id === missing ? null : dataOf(id))).length, 2);
});

test('plán dne: nová položka v datech změní jen málo otázek (otisk místo pořadí)', () => {
    const plan = DQ.planDay('2026-11-08', GROUPS, dataOf);
    const grown = Object.fromEntries(Object.entries(DATA).map(([id, data]) => [id, { ...data, items: [...data.items, { q: `${id}-novy`, n: 'Nová', c: 'a', k: 1 }] }]));
    const after = DQ.planDay('2026-11-08', GROUPS, id => grown[id]);
    const same = after.filter((entry, i) => entry.q === plan[i].q).length;
    assert.ok(same >= 5, `většina otázek zůstala (${same}/10)`);
});

test('součty, mřížka a text ke sdílení', () => {
    const results = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1].map((ok, i) => ({ correct: Boolean(ok), points: ok ? (i % 4) + 1 : 0, ms: 5000 }));
    const summary = DQ.summarize(results);
    assert.deepEqual(summary, { answered: 10, correct: 8, score: 1 + 2 + 4 + 1 + 2 + 4 + 1 + 2, time_ms: 50000, bitmap: 0b1110111011 });
    assert.deepEqual(DQ.bitsOf(summary.bitmap, 10), [true, true, false, true, true, true, false, true, true, true]);
    assert.deepEqual(DQ.bitsOf(0b101, 3), [true, false, true, null, null, null, null, null, null, null]);
    assert.equal(DQ.shareText({ day: '2026-11-08', summary, url: 'https://taronwho.github.io/geografie-kviz/app/' }),
        'Mudrlant · Kvíz dne 8. 11. · 8/10 🟩🟩🟥🟩🟩🟩🟥🟩🟩🟩 · https://taronwho.github.io/geografie-kviz/app/');
    assert.equal(DQ.shareText({ day: '2026-11-08', summary: DQ.summarize(results.slice(0, 3)) }), 'Mudrlant · Kvíz dne 8. 11. · 2/10 🟩🟩🟥⬜⬜⬜⬜⬜⬜⬜');
    // Nesmyslné body od klienta se ořežou na 0–4
    assert.equal(DQ.summarize([{ correct: true, points: 99, ms: 1 }]).score, 4);
    assert.equal(DQ.poseFor(10), 'vitez');
    assert.equal(DQ.poseFor(8), 'oslava');
    assert.equal(DQ.poseFor(5), 'radost');
    assert.equal(DQ.poseFor(2), 'premysleni');
});

test('série a XP: dny po sobě (dnešek jen odehraný), nejlepší série, XP za dokončení, sérii a bez chyby', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07'];
    assert.equal(DQ.streakOf(days, '2026-11-08'), 3, 'dnes ještě nehráno: série od včerejška trvá');
    assert.equal(DQ.streakOf([...days, '2026-11-08'], '2026-11-08'), 4);
    assert.equal(DQ.streakOf(days, '2026-11-09'), 0, 'den vynechaný: série skončila');
    assert.equal(DQ.bestStreakOf(days), 3);
    assert.equal(DQ.bestStreakOf([]), 0);
    assert.deepEqual(DQ.xpFor({ correct: 7, streak: 1 }), { total: 30, parts: [{ label: 'za dokončený Kvíz dne', xp: 30 }] });
    assert.deepEqual(DQ.xpFor({ correct: 10, streak: 4 }), { total: 58, parts: [{ label: 'za dokončený Kvíz dne', xp: 30 }, { label: 'za sérii 4 dní Kvízu dne', xp: 8 }, { label: 'za Kvíz dne bez chyby', xp: 20 }] });
    assert.equal(DQ.xpFor({ correct: 5, streak: 40 }).total, 30 + 20, 'série nejvýš 10 dní (20 XP)');
});

test('uložený stav: poškozená data se zahodí, pokus se vyčistí, starý den se uzavře, jak stál', () => {
    assert.deepEqual(DQ.parseState(null), { v: 1, days: {}, attempt: null });
    assert.deepEqual(DQ.parseState('x'), { v: 1, days: {}, attempt: null });
    const raw = {
        days: { '2026-11-07': { answered: 10, correct: 9, score: 30, time_ms: 70000, bitmap: 1022, done: true, xp: true }, bad: {}, '2026-11-06': 'x' },
        attempt: { day: '2026-11-08', owner: 'u-1', results: [{ correct: true, points: 9, ms: 4000 }, { correct: false, points: 0, ms: 3000 }, 'x', { correct: true, points: 2, ms: 1 }], plan: [{ topic: 'zemepis', q: 'Q1' }, 5], open: { index: 2, at: 123, hint: 3 }, synced: 1, done: false }
    };
    const state = DQ.parseState(raw);
    assert.deepEqual(Object.keys(state.days), ['2026-11-07']);
    assert.equal(state.attempt.results.length, 2, 'po prvním poškozeném řádku se nic nebere');
    assert.equal(state.attempt.results[0].points, 4, 'body nejvýš 4');
    assert.deepEqual(state.attempt.plan, [{ topic: 'zemepis', q: 'Q1' }, null]);
    assert.deepEqual(state.attempt.open, { index: 2, at: 123, hint: 3 });
    assert.equal(state.attempt.synced, 1);
    // Otevřená otázka dřív než poslední odpověď nedává smysl
    assert.equal(DQ.parseState({ attempt: { ...raw.attempt, open: { index: 0, at: 1 } } }).attempt.open, null);
    // Dohraný jen s deseti odpověďmi (nebo podle serveru)
    assert.equal(DQ.parseState({ attempt: { ...raw.attempt, done: true } }).attempt.done, false);
    assert.equal(DQ.parseState({ attempt: { ...raw.attempt, done: true, server: { answered: 10, correct: 6, score: 20, time_ms: 1, bitmap: 63 } } }).attempt.done, true);
    // Nový den: včerejší nedohraný pokus se zapíše do dnů, jak stál, a dnešní místo je volné
    const rolled = DQ.rollover(DQ.parseState(raw), '2026-11-09');
    assert.equal(rolled.attempt, null);
    assert.deepEqual(rolled.days['2026-11-08'], { answered: 2, correct: 1, score: 4, time_ms: 7000, bitmap: 1, done: false, xp: false });
    assert.deepEqual(DQ.playedDays(rolled, '2026-11-09'), ['2026-11-07', '2026-11-08']);
    // Dnešek se do série počítá, až když je dohraný
    assert.deepEqual(DQ.playedDays(rolled, '2026-11-08'), ['2026-11-07']);
    assert.equal(DQ.nextIndex(state.attempt), 2);
    assert.equal(DQ.nextIndex({ results: Array(10).fill({}) }), -1);
});

test('souhrn pokusu: server má přednost, když má všechny odpovědi (jeho čas rozhoduje)', () => {
    const attempt = DQ.newAttempt('2026-11-08', 'u-1');
    attempt.results = [{ correct: true, points: 4, ms: 3000 }, { correct: false, points: 0, ms: 2000 }];
    assert.equal(DQ.attemptSummary(attempt).time_ms, 5000);
    attempt.server = { answered: 2, correct: 1, score: 4, time_ms: 9000, bitmap: 1 };
    assert.equal(DQ.attemptSummary(attempt).time_ms, 9000);
    attempt.results.push({ correct: true, points: 3, ms: 1000 });
    assert.equal(DQ.attemptSummary(attempt).answered, 3, 'neodeslaná odpověď se počítá z místních');
});

test('vykreslení: karta na úvodu, úvod, výsledek s pořadím a pozvánka pro hosta (bez inline stylů)', () => {
    const h = { avatarHtml: (row) => `<span data-avatar="${row.id}"></span>`, topicIcon: (id) => `<img data-topic="${id}">`, xpLine: (xp) => `<p data-xp>+${xp.total} XP</p>`, meRow: { id: 'u-1', display_name: 'Jana' } };
    const fresh = DQ.homeCardHtml({ status: 'new' });
    assert.match(fresh, /data-quiz-new/);
    assert.match(fresh, /10 otázek pro všechny · pořadí/);
    assert.match(DQ.homeCardHtml({ status: 'progress', answered: 3 }), /Rozehráno · otázka 4\/10/);
    const done = DQ.homeCardHtml({ status: 'done', summary: { correct: 8, score: 26 }, rank: 23, streak: 4 });
    assert.match(done, /8\/10 · 26 bodů · 23\. místo/);
    assert.doesNotMatch(done, /data-quiz-new/);
    const intro = DQ.introHtml({ day: '2026-11-08', topics: ['zemepis', 'hudba'], guest: true }, h);
    assert.match(intro, /Dnešní otázky \(jedna z každého tématu\) zůstávají zvlášť/);
    assert.match(intro, /Hraješ bez přihlášení/);
    assert.match(intro, /Začít kvíz/);
    assert.match(DQ.introHtml({ day: '2026-11-08', answered: 4 }, h), /Pokračovat · otázka 5\/10/);
    const board = { total: 60, top: [{ rank: 1, id: 'p1', display_name: '<b>Eva</b>', score: 40, correct: 10, time_ms: 55000 }], me: { rank: 23, score: 20, correct: 6, time_ms: 90000 } };
    const result = DQ.resultHtml({ day: '2026-11-08', summary: DQ.summarize([{ correct: true, points: 4, ms: 1000 }]), xp: { total: 30, parts: [] }, streak: 2, best: 5, closed: true, ranking: { tab: 'all', board, friends: null } }, h);
    assert.match(result, /Pořadí dne · 60 hráčů/);
    assert.match(result, /&lt;b&gt;Eva&lt;\/b&gt;/, 'přezdívka se escapuje');
    assert.match(result, /data-quiz-row="u-1"[\s\S]*23\./, 'moje místo pod top seznamem');
    assert.match(result, /Kvíz nebyl dohraný/);
    assert.match(result, /2 dny[\s\S]*nejlepší 5 dní/);
    assert.match(result, /data-xp/);
    const friends = DQ.rankingHtml({ tab: 'friends', board, friends: { friends: 0, rows: [] } }, h);
    assert.match(friends, /Zatím nemáš přátele/);
    assert.match(DQ.rankingHtml({ tab: 'friends', board, friends: { friends: 2, rows: [] } }, h), /Z přátel dnes ještě nikdo nehrál/);
    const guest = DQ.resultHtml({ day: '2026-11-08', summary: DQ.summarize([]), guest: true, canLogin: true }, h);
    assert.match(guest, /Přihlas se a uvidíš se v pořadí/);
    assert.match(guest, /data-action="quiz-login"/);
    for (const html of [fresh, done, intro, result, guest]) assert.doesNotMatch(html, /style=|<script/);
});

test('daily-quiz.js a share-card.js jsou zapojené: index.html, service worker, nasazení a Tailwind', () => {
    for (const file of ['daily-quiz.js', 'share-card.js']) {
        assert.match(read('index.html'), new RegExp(`<script src="${file.replace('.', '\\.')}" defer></script>`));
        assert.match(read('sw.js'), new RegExp(`'${file.replace('.', '\\.')}'`));
        assert.match(read('.github/workflows/pages.yml'), new RegExp(`\\b${file.replace('.', '\\.')}\\b`));
        assert.doesNotMatch(read(file), /setAttribute\(\s*['"]style|<script|style="/, `${file}: bez inline stylů a skriptů (CSP)`);
    }
    assert.match(read('tailwind.config.js'), /\.\/daily-quiz\.js/);
    const html = read('index.html');
    assert.ok(html.indexOf('daily-quiz.js') < html.indexOf('app.js') && html.indexOf('share-card.js') < html.indexOf('app.js'), 'před app.js');
});

test('série Kvízu dne přes den zachráněný ochranou (rewards.js) pokračuje, den se nepočítá', () => {
    const days = ['2026-11-04', '2026-11-05', '2026-11-07'];
    assert.equal(DQ.streakOf(days, '2026-11-07'), 1);
    assert.equal(DQ.streakOf(days, '2026-11-07', ['2026-11-06']), 3);
    assert.equal(DQ.streakOf(days, '2026-11-08', ['2026-11-06']), 3, 'dnes ještě nehráno');
    assert.equal(DQ.streakOf(['2026-11-05'], '2026-11-08', ['2026-11-06']), 0, 'dva vynechané dny');
});
