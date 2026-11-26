// Statistiky pro nadšence (statistiky.js): zápis odpovědí do souhrnu, doplnění starších dní z kroniky a dnešních otázek, tabulka témat
// s okruhy a řazením, vývoj po týdnech a měsících, kalendář hraní, záměny, rekordy a HTML okna (bez inline stylů, čísla jako text).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../statistiky.js');

const TOPICS = [
    { id: 'zemepis', title: 'Zeměpis', categories: [{ key: 'stat', label: 'Státy' }, { key: 'mesto', label: 'Města' }] },
    { id: 'historie', title: 'Historie', categories: [{ key: 'panovnik', label: 'Panovníci' }] },
    { id: 'hudba', title: 'Hudba', categories: [{ key: 'skladatele', label: 'Skladatelé' }] }
];
const answer = (over = {}) => ({ topic: 'zemepis', category: 'stat', correct: true, typed: false, hints: 0, known: true, ms: 4000, mode: 'practice', ...over });
const many = (list, day) => list.reduce((state, event) => S.record(state, event, day), S.parse(null));

test('prázdný nebo poškozený souhrn je prázdný, nesmysly se zahodí', () => {
    for (const raw of [null, undefined, 7, 'x', [], { days: 5 }]) {
        const state = S.parse(raw);
        assert.equal(state.since, '');
        assert.deepEqual(state.days, {});
        assert.deepEqual(state.t, {});
    }
    const state = S.parse({ since: '2026-02-30', days: { '2026-11-01': [3, 9], nonsense: [1, 1], '2026-11-02': [0, 0] }, t: { 'ZEM!': { stat: [1, 1] }, zemepis: { stat: [2, 1], 'a b': [1, 1] } },
        m: { daily: [2, 1], hack: [5, 5] }, h: [[1, 1], 'x'], ms: { sum: -5, n: 2, cn: 9, b: [1, 'a'] }, x: { 'zemepis|Q1|Q2': [2, 'A', 'B', '2026-11-01'], bad: [1, 'A', 'B'], 'zemepis|Q1|Q3': [1, '', 'B'] } });
    assert.equal(state.since, '', 'neplatné datum');
    assert.deepEqual(state.days, { '2026-11-01': [3, 3] }, 'správně nejvýš tolik, kolik odpovědí');
    assert.deepEqual(state.t, { zemepis: { stat: [2, 1] } });
    assert.deepEqual(state.m, { daily: [2, 1] });
    assert.deepEqual(state.h[0], [1, 1]);
    assert.deepEqual(state.h[1], [0, 0]);
    assert.equal(state.ms.sum, 0);
    assert.equal(state.ms.cn, 2, 'správných měřených nejvýš tolik jako měřených');
    assert.deepEqual(Object.keys(state.x), ['zemepis|Q1|Q2']);
});

test('zápis odpovědi: den, téma a okruh, druh hry, obtížnost, nápovědy, způsob a doba', () => {
    const state = many([
        answer(),
        answer({ correct: false, category: 'mesto', hints: 2, known: false, typed: true, mode: 'daily', ms: 12000 }),
        answer({ category: 'neexistuje-ale-platny', mode: 'quiz', hints: 9, ms: 200000 }),
        answer({ category: undefined, mode: 'neznamy', known: null, ms: null, gaveUp: false }),
        answer({ correct: false, gaveUp: true, ms: 3000 })
    ], '2026-11-26');
    assert.equal(state.since, '2026-11-26');
    assert.deepEqual(state.days, { '2026-11-26': [5, 3] });
    assert.deepEqual(state.t.zemepis, { stat: [2, 1], mesto: [1, 0], 'neexistuje-ale-platny': [1, 1], [S.NO_CATEGORY]: [1, 1] });
    assert.deepEqual(state.m, { practice: [3, 2], daily: [1, 0], quiz: [1, 1] }, 'neznámý druh hry = trénink');
    assert.deepEqual(state.k, { known: [3, 2], hard: [1, 0] }, 'bez údaje o známosti se nepočítá');
    assert.deepEqual(state.h.map(p => p[0]), [3, 0, 1, 0, 1], 'nápovědy 0–4, víc = 4');
    assert.deepEqual(state.w, { choices: [4, 3], typed: [1, 0] });
    // Doba: 4 s a 12 s do průměru, 200 s je pauza, bez času a vzdaná otázka se neměří
    assert.equal(state.ms.n, 2);
    assert.equal(state.ms.sum, 16000);
    assert.equal(state.ms.slow, 1);
    assert.equal(state.ms.cn, 1);
    assert.equal(state.ms.cs, 4000);
    assert.deepEqual(state.ms.b, [1, 0, 1, 0, 0, 1]);
    // Bez platného dne nebo tématu se nic nezapíše; vstupní stav se nemění
    const before = JSON.stringify(state);
    assert.deepEqual(S.record(state, answer(), 'včera'), S.parse(state));
    assert.deepEqual(S.record(state, answer({ topic: '' }), '2026-11-26'), S.parse(state));
    assert.equal(JSON.stringify(state), before);
});

test('staré dny vypadnou po KEEP_DAYS, první den záznamu zůstává', () => {
    let state = S.record(null, answer(), '2023-01-01');
    state = S.record(state, answer(), '2026-11-26');
    assert.deepEqual(Object.keys(state.days), ['2026-11-26']);
    assert.equal(state.since, '2023-01-01');
});

test('záměny: jen u nesprávné odpovědi jinou položkou, dvojice bez ohledu na směr, přeplnění vyhodí nejméně častou', () => {
    const wrong = (rightId, right, wrongId, wrongLabel, over = {}) => answer({ correct: false, right: { id: rightId, label: right }, wrong: { id: wrongId, label: wrongLabel }, ...over });
    let state = many([
        wrong('Q40', 'Rakousko', 'Q408', 'Austrálie'),
        wrong('Q40', 'Rakousko', 'Q408', 'Austrálie'),
        wrong('Q408', 'Austrálie', 'Q40', 'Rakousko'),
        wrong('Q40', 'Rakousko', 'Q408', 'Austrálie', { gaveUp: true }),
        wrong('Q40', 'Rakousko', 'Q40', 'Rakousko'),
        answer({ correct: true, right: { id: 'Q1', label: 'A' }, wrong: { id: 'Q2', label: 'B' } }),
        wrong('Q36', 'Polsko', 'Q252', 'Indonésie', { topic: 'vlajky' })
    ], '2026-11-20');
    assert.deepEqual(Object.keys(state.x).sort(), ['vlajky|Q36|Q252', 'zemepis|Q40|Q408', 'zemepis|Q408|Q40'].sort());
    assert.deepEqual(state.x['zemepis|Q40|Q408'], [2, 'Rakousko', 'Austrálie', '2026-11-20']);
    const pairs = S.confusions(state, (id) => ({ zemepis: 'Zeměpis', vlajky: 'Vlajky a znaky' }[id]));
    assert.equal(pairs.length, 2);
    assert.deepEqual({ a: pairs[0].a, b: pairs[0].b, count: pairs[0].count, topic: pairs[0].topicTitle }, { a: 'Rakousko', b: 'Austrálie', count: 3, topic: 'Zeměpis' });
    assert.deepEqual(pairs[0].ways.map(way => [way.right, way.wrong, way.count]), [['Rakousko', 'Austrálie', 2], ['Austrálie', 'Rakousko', 1]]);
    // Přeplnění: MAX_PAIRS různých dvojic, pak nová vyhodí nejméně častou s nejstarším výskytem
    state = S.parse(null);
    for (let i = 0; i < S.MAX_PAIRS; i++) state = S.record(state, wrong(`Q${i + 1000}`, `A${i}`, 'Q9', 'B'), i === 0 ? '2026-01-01' : '2026-02-01');
    state = S.record(state, wrong('Q1001', 'A1', 'Q9', 'B'), '2026-02-02');
    state = S.record(state, wrong('Q5', 'Nová', 'Q9', 'B'), '2026-03-01');
    assert.equal(Object.keys(state.x).length, S.MAX_PAIRS);
    assert.ok(!state.x['zemepis|Q1000|Q9'], 'nejstarší z jednorázových zmizela');
    assert.ok(state.x['zemepis|Q1001|Q9'], 'častější zůstala');
    assert.ok(state.x['zemepis|Q5|Q9'], 'právě zapsaná zůstala');
});

test('dny hraní: vlastní souhrn, jinak kronika, jinak dnešní otázky a Kvíz dne', () => {
    const totals = S.dayTotals({
        state: { days: { '2026-11-20': [5, 4], '2026-11-21': [1, 1] } },
        chronicle: { days: { '2026-11-19': { a: 7, c: 5 }, '2026-11-21': { a: 3, c: 2 } } },
        legacy: { daily: { zemepis: { '2026-11-01': { correct: true }, '2026-11-19': { correct: true } }, historie: { '2026-11-01': { correct: false } } }, quiz: { '2026-11-02': { answered: 10, correct: 7 } } }
    });
    assert.deepEqual(totals['2026-11-01'], { a: 2, c: 1, source: 'legacy' });
    assert.deepEqual(totals['2026-11-02'], { a: 10, c: 7, source: 'legacy' });
    assert.deepEqual(totals['2026-11-19'], { a: 7, c: 5, source: 'chronicle' }, 'kronika má celý den, dnešní otázky jsou jeho část');
    assert.deepEqual(totals['2026-11-20'], { a: 5, c: 4, source: 'own' });
    assert.deepEqual(totals['2026-11-21'], { a: 3, c: 2, source: 'chronicle' }, 'první den souhrnu: úplnější kronika');
});

test('témata a okruhy: souhrn + dnešní otázky jen ze dnů před ním; okruhy v pořadí tématu; řazení', () => {
    const state = many([answer(), answer({ category: 'mesto', correct: false }), answer({ topic: 'hudba', category: 'skladatele' })], '2026-11-20');
    const legacy = { daily: { zemepis: { '2026-11-01': { correct: true, category: 'mesto' }, '2026-11-20': { correct: true, category: 'stat' } }, historie: { '2026-10-30': { correct: false, category: 'panovnik' } } } };
    const rows = S.topicRows({ state, legacy, topics: TOPICS, learned: { zemepis: 12, hudba: 1 } });
    const zem = rows.find(row => row.id === 'zemepis');
    assert.deepEqual({ a: zem.answered, c: zem.correct, rate: zem.rate, learned: zem.learned }, { a: 3, c: 2, rate: 66.7, learned: 12 }, 'den souhrnu se z dnešních otázek nepřičte podruhé');
    assert.deepEqual(zem.okruhy.map(cat => [cat.label, cat.answered, cat.correct]), [['Státy', 1, 1], ['Města', 2, 1]]);
    assert.equal(zem.okruhy.reduce((sum, cat) => sum + cat.answered, 0), zem.answered, 'okruhy dávají dohromady téma');
    assert.deepEqual(rows.find(row => row.id === 'historie').okruhy.map(cat => cat.label), ['Panovníci']);
    assert.deepEqual(S.sortRows(rows, 'answered', 'desc').map(row => row.id), ['zemepis', 'historie', 'hudba']);
    assert.deepEqual(S.sortRows(rows, 'rate', 'desc').map(row => row.id), ['hudba', 'zemepis', 'historie']);
    assert.deepEqual(S.sortRows(rows, 'title', 'asc').map(row => row.id), ['historie', 'hudba', 'zemepis']);
    const withEmpty = [...rows, { id: 'film', title: 'Film', answered: 0, correct: 0, rate: null, learned: 0, okruhy: [] }];
    assert.equal(S.sortRows(withEmpty, 'rate', 'asc').pop().id, 'film', 'téma bez odpovědí je u úspěšnosti vždy na konci');
    assert.deepEqual(S.nextSort({ key: 'answered', dir: 'desc' }, 'answered'), { key: 'answered', dir: 'asc' });
    assert.deepEqual(S.nextSort({ key: 'answered', dir: 'desc' }, 'title'), { key: 'title', dir: 'asc' });
    assert.deepEqual(S.nextSort({ key: 'title', dir: 'asc' }, 'rate'), { key: 'rate', dir: 'desc' });
    assert.deepEqual(S.nextSort({ key: 'title', dir: 'asc' }, 'hack'), { key: 'title', dir: 'asc' });
});

test('vývoj po týdnech (od pondělí) a měsících, kalendář hraní a řady dní', () => {
    const totals = { '2026-11-23': { a: 10, c: 8 }, '2026-11-26': { a: 30, c: 15 }, '2026-11-16': { a: 4, c: 1 }, '2026-10-05': { a: 60, c: 30 }, '2026-11-27': { a: 9, c: 9 } };
    const weeks = S.trend(totals, '2026-11-26', 'weeks');
    assert.equal(weeks.length, S.TREND_COUNT);
    assert.deepEqual(weeks.at(-1), { key: '2026-11-23', label: '23. 11. – 29. 11.', short: '23. 11.', a: 40, c: 23, days: 2, rate: 57.5 }, 'budoucí den se nepočítá');
    assert.deepEqual([weeks.at(-2).a, weeks.at(-2).rate], [4, 25]);
    assert.equal(weeks.at(-3).rate, null);
    const months = S.trend(totals, '2026-11-26', 'months');
    assert.deepEqual(months.at(-1).label, 'listopad 2026');
    assert.deepEqual([months.at(-2).label, months.at(-2).a, months.at(-2).rate], ['říjen 2026', 60, 50]);
    assert.equal(months[0].label, 'prosinec 2025');
    const heat = S.heatmap({ '2026-11-24': { a: 1, c: 1 }, '2026-11-25': { a: 12, c: 1 }, '2026-11-26': { a: 60, c: 1 }, '2026-11-10': { a: 30, c: 1 }, '2026-11-11': { a: 3, c: 1 } }, '2026-11-26', { '2026-11-12': ['Řetězovka'] });
    assert.equal(heat.columns.length, S.HEAT_WEEKS);
    assert.equal(heat.start, '2026-06-29', 'začíná pondělím');
    const last = heat.columns.at(-1);
    assert.deepEqual(last.map(cell => cell && cell.level), [0, 1, 2, 4, null, null, null], 'Po–Ne, budoucnost prázdná');
    assert.deepEqual([heat.played, heat.answers, heat.best, heat.current], [6, 106, 3, 3]);
    assert.deepEqual(heat.columns.at(-3)[3], { day: '2026-11-12', a: 0, games: ['Řetězovka'], level: 1 });
    assert.deepEqual([0, 1, 9, 10, 24, 25, 49, 50, 999].map(S.levelOf), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
    // Současná řada: dnes ještě nehráno = řada do včerejška
    assert.equal(S.heatmap({ '2026-11-25': { a: 1, c: 1 }, '2026-11-24': { a: 1, c: 1 } }, '2026-11-26').current, 2);
    assert.equal(S.heatmap({ '2026-11-23': { a: 1, c: 1 } }, '2026-11-26').current, 0);
});

test('formát čísel: úspěšnost na jedno desetinné místo, sekundy', () => {
    assert.equal(S.rateOf(2, 3), 66.7);
    assert.equal(S.rateOf(0, 0), null);
    assert.equal(S.pct(66.7), '66,7 %');
    assert.equal(S.pct(100), '100,0 %');
    assert.equal(S.pct(null), '–');
    assert.equal(S.seconds(16840), '16,8 s');
});

test('rekordy ze všech módů', () => {
    const groups = S.records({
        counters: { answered: 100, correct: 75, bestRun: 23, topicBest: { zemepis: 17, hudba: 9 }, bestStreak: 12, tourBest: 3, wins: 5, challenges: 9, mapExact: 2, mapAnswered: 8 },
        modes: { blitz: { top: 18, games: 7, best: { mix: 14, zemepis: 18 } }, survival: { top: 0, games: 0, best: {} } },
        quiz: { days: { '2026-11-01': { score: 400 }, '2026-11-03': { score: 812 } }, max: 1000 },
        mystery: { days: { '2026-11-02': { solved: true, points: 8 }, '2026-11-04': { solved: false, points: 0 } }, max: 10 },
        chain: { days: {}, max: 28 },
        totals: { '2026-11-01': { a: 40, c: 30 }, '2026-11-02': { a: 40, c: 35 } },
        topicTitle: (id) => ({ zemepis: 'Zeměpis' }[id] || id)
    });
    const find = (label) => groups.flatMap(group => group.rows).find(row => row.label === label);
    assert.deepEqual(groups.map(group => group.title), ['Běžná hra', 'Dnešní otázky', 'Režimy a denní hry', 'Soupeři']);
    assert.equal(find('Odpovědí celkem').note, 'správně 75 (75,0 %)');
    assert.deepEqual([find('Nejdelší řada v jednom tématu').value, find('Nejdelší řada v jednom tématu').note], ['17', 'Zeměpis']);
    assert.deepEqual([find('Nejvíc odpovědí za den').value, find('Nejvíc odpovědí za den').note], ['40', '2. 11. 2026'], 'při shodě novější den');
    assert.equal(find('Nejvíc správných za den').value, '35');
    assert.equal(find('Nejdelší série dní').value, '12 dní');
    assert.equal(find('Bleskovka: rekord').value, '18 správně');
    assert.match(find('Bleskovka: rekord').note, /odehráno 7 · nejlepší téma Zeměpis \(18\)/);
    assert.equal(find('Přežití: rekord').note, 'zatím neodehráno');
    assert.equal(find('Kvíz dne: nejvíc bodů').value, '812 z 1 000');
    assert.match(find('Tajemná otázka: vyřešené dny').note, /nejvíc bodů 8 z 10/);
    assert.equal(find('Řetězovka: nejvíc bodů').value, '–');
    assert.equal(find('Ukaž na mapě: plný počet bodů').value, '2 z 8');
    assert.equal(find('Výzvy: výhry').value, '5 z 9');
    assert.equal(find('Turnaj: nejlepší výsledek').value, 'semifinále');
});

test('okno: pět částí, tabulka se řazením a okruhy, grafy jako SVG s čísly v textu, bez inline stylů', () => {
    let state = S.parse(null);
    for (const [day, list] of [['2026-11-02', [answer(), answer({ correct: false })]], ['2026-11-25', [answer({ topic: 'hudba', category: 'skladatele' }), answer({ correct: false, right: { id: 'Q40', label: 'Rakousko' }, wrong: { id: 'Q408', label: 'Austrálie <b>' } })]]]) {
        for (const event of list) state = S.record(state, event, day);
    }
    const view = S.build({ state, topics: TOPICS, learned: { zemepis: 3 }, counters: { answered: 4, correct: 2 }, today: '2026-11-26' });
    assert.deepEqual(view.summary, { answered: 4, correct: 2, rate: 50, days: 2, first: '2026-11-02' });
    const pages = Object.fromEntries(S.TABS.map(([id]) => [id, S.pageHtml(view, { tab: id, open: 'zemepis', sort: { key: 'rate', dir: 'asc' }, period: 'months' })]));
    for (const [id, html] of Object.entries(pages)) {
        assert.ok(!/style=/.test(html), `${id}: bez inline stylů`);
        assert.ok(!/<script/i.test(html));
        assert.match(html, new RegExp(`data-st-current="${id}"`));
        assert.equal((html.match(/role="tab"/g) || []).length >= 5, true);
        assert.match(html, /aria-selected="true"/);
    }
    assert.match(pages.prehled, /1 nápověda|Bez nápovědy/);
    assert.match(pages.prehled, /Průměr 4,0 s/);
    // Tabulka: řazení podle úspěšnosti vzestupně, rozbalené okruhy Zeměpisu, aria-sort
    assert.match(pages.temata, /<th scope="col" aria-sort="ascending"[^>]*><button type="button" data-st-sort="rate"/);
    assert.match(pages.temata, /data-st-open="zemepis" aria-expanded="true"/);
    assert.match(pages.temata, /data-st-okruh="stat"/);
    assert.ok(pages.temata.indexOf('data-st-topic="zemepis"') < pages.temata.indexOf('data-st-topic="hudba"'), 'nižší úspěšnost první');
    // Vývoj: kalendář i graf jako SVG s popisem, měsíce v tabulce
    assert.match(pages.vyvoj, /<svg[^>]+role="img" aria-label="Kalendář hraní od /);
    assert.match(pages.vyvoj, /data-st-chart="months"/);
    assert.match(pages.vyvoj, /listopad 2026<\/th>/);
    assert.match(pages.vyvoj, /hráno 2 dny, 4 odpovědi/);
    // Záměny: text je escapovaný
    assert.match(pages.zameny, /Rakousko <span aria-label="a">↔<\/span> Austrálie &lt;b&gt;/);
    assert.match(pages.rekordy, /<dl/);
    // Prázdný stav bez chyb
    const blank = S.build({ topics: TOPICS, today: '2026-11-26' });
    for (const [id] of S.TABS) assert.ok(S.pageHtml(blank, { tab: id }).length > 200, id);
    assert.match(S.pageHtml(blank, { tab: 'zameny' }), /Zatím tu žádné záměny nejsou/);
    assert.match(S.pageHtml(blank, { tab: 'prehled' }), /Doba odpovědi se zatím neměřila/);
});
