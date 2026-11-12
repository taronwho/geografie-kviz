// Tipy od Mudrlanta (tips.js): chytrý výběr, rozpočet za den, odstup, vypnutí a že tip s odkazem na funkci hry vede na existující místo
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Tips = require('../tips.js');

const NOW = Date.parse('2026-11-09T10:00:00Z');
const ACTIONS = ['settings', 'learn', 'progress', 'multi', 'single', 'quiz', 'mystery', 'modes', 'goals', 'chronicle', 'leagueSeasons', 'groups', 'gold'];
const base = (over = {}) => ({ counters: { answered: 0 }, today: '2026-11-09', now: NOW, launches: 1, signedIn: false, multiAvailable: true, reviewOn: true, ...over });

test('každý tip má id, titulek, text a ikonu, která existuje v icons.js; akce míří na známé místo', () => {
    const icons = fs.readFileSync(path.join(__dirname, '..', 'icons.js'), 'utf8');
    const ids = new Set();
    for (const tip of Tips.TIPS) {
        assert.ok(!ids.has(tip.id), `duplicitní ${tip.id}`);
        ids.add(tip.id);
        assert.ok(tip.title && tip.text.length > 30 && tip.text.length < 260, tip.id);
        assert.ok(icons.includes(`"${tip.icon}"`), `ikona ${tip.icon}`);
        if (tip.action) assert.ok(ACTIONS.includes(tip.action.kind), tip.id);
        assert.equal(typeof tip.used, 'function');
    }
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    for (const kind of ACTIONS) assert.ok(new RegExp(`${kind}: \\(\\) =>`).test(app), `akce ${kind} je v app.js`);
});

test('nový hráč dostane nejdřív základní tip, tip o více hráčích až po několika odpovědích', () => {
    assert.equal(Tips.pick(Tips.EMPTY, base()).id, 'dnesni');
    const after = Tips.markShown(Tips.EMPTY, 'dnesni', '2026-11-09', NOW);
    const later = base({ now: NOW + Tips.MIN_GAP_MS + 1, counters: { answered: 3 } });
    assert.equal(Tips.pick(after, later).id, 'napoveda');
    assert.equal(Tips.pick(after, base({ now: NOW + 1000 })), null, 'mezi tipy je odstup');
});

test('rozpočet za den klesá se zkušeností hráče', () => {
    assert.deepEqual([1, 8, 9, 30, 31, 100].map(Tips.dailyBudget), [3, 3, 2, 2, 1, 1]);
    let state = Tips.EMPTY;
    let now = NOW;
    let shown = 0;
    const counters = { answered: 500 };
    for (let i = 0; i < 6; i++) {
        const tip = Tips.pick(state, base({ now, counters, launches: 5, signedIn: true }));
        if (!tip) break;
        state = Tips.markShown(state, tip.id, '2026-11-09', now);
        now += Tips.MIN_GAP_MS + 1;
        shown++;
    }
    assert.equal(shown, 3, 'na začátku nejvýš tři tipy denně');
    assert.equal(Tips.pick(state, base({ now: now + 86400000, today: '2026-11-10', counters, launches: 5, signedIn: true })) !== null, true, 'další den zase');
    // Po 60 spuštěních jen jeden tip za tři dny
    const old = Tips.markShown(Tips.EMPTY, 'dnesni', '2026-11-09', NOW);
    assert.equal(Tips.pick(old, base({ today: '2026-11-10', now: NOW + 86400000, launches: 80, counters: { answered: 900 }, signedIn: true })), null);
    assert.ok(Tips.pick(old, base({ today: '2026-11-12', now: NOW + 3 * 86400000, launches: 80, counters: { answered: 900 }, signedIn: true })));
});

test('funkci, kterou hráč už používá, tip nenabídne; tip se ukáže jen jednou', () => {
    const player = { answered: 700, typedCorrect: 5, created: 2, challenges: 4, tourPlayed: 1, reviewed: 3, noHint: 40, bestStreak: 9, wins: 20, weeksDone: 1,
        quizDone: 9, blitzGames: 2, orderAnswered: 8, mapAnswered: 6, sharedImages: 1, freezesUsed: 1, chestsOpened: 1, mysterySolved: 2, goldCorrect: 3 };
    const ctx = base({ counters: player, signedIn: true });
    const offered = [];
    let state = { ...Tips.EMPTY, visited: { learn: true, progress: true, look: true, diplomas: true, season: true, album: true, showcase: true, leagueSeasons: true, legends: true, looks: true, groups: true } };
    let now = NOW;
    for (let day = 0; day < 20; day++) {
        const tip = Tips.pick(state, { ...ctx, today: `2026-12-${String(day + 1).padStart(2, '0')}`, now });
        if (!tip) break;
        offered.push(tip.id);
        state = Tips.markShown(state, tip.id, `2026-12-${String(day + 1).padStart(2, '0')}`, now);
        now += 86400000;
    }
    assert.deepEqual(offered, ['reakce', 'pratele'], 'zkušený hráč dostane jen to, co ještě nezná');
    assert.equal(new Set(offered).size, offered.length);
});

test('hosté dostanou jen tip na výzvu (s textem o přihlášení), tipy o více hráčích jen když je dostupná', () => {
    const counters = { answered: 100 };
    let state = Tips.EMPTY;
    const seen = [];
    let now = NOW;
    for (let i = 0; i < 40; i++) {
        const tip = Tips.pick(state, { ...base({ counters, launches: 1 }), today: `2026-12-${String((i % 28) + 1).padStart(2, '0')}`, now });
        if (!tip) { now += 86400000; continue; }
        seen.push(tip.id);
        state = Tips.markShown(state, tip.id, `2026-12-${String((i % 28) + 1).padStart(2, '0')}`, now);
        now += Tips.MIN_GAP_MS + 1;
    }
    assert.ok(seen.includes('vyzva'));
    for (const id of seen) assert.ok(!Tips.BY_ID.get(id).account, `host nedostane ${id}`);
    assert.match(Tips.textFor(Tips.BY_ID.get('vyzva'), false), /přihlášení/);
    assert.doesNotMatch(Tips.textFor(Tips.BY_ID.get('vyzva'), true), /přihlášení/);
    const offline = Tips.pick(Tips.EMPTY, base({ multiAvailable: false, counters: { answered: 100 } }));
    assert.ok(!offline.multi);
});

test('vypnuté tipy se nenabídnou; vypnuté procvičování špatných odpovědí tip o něm vynechá; stav se čistí', () => {
    assert.equal(Tips.pick(Tips.setOff(Tips.EMPTY, true), base()), null);
    assert.equal(Tips.pick(Tips.setOff(Tips.setOff(Tips.EMPTY, true), false), base()).id, 'dnesni');
    const ctx = base({ counters: { answered: 200 }, reviewOn: false });
    let state = Tips.EMPTY; const ids = [];
    for (let i = 0; i < 20; i++) { const t = Tips.pick(state, { ...ctx, launches: 1, now: NOW + i * 86400000, today: `2026-12-${String(i + 1).padStart(2, '0')}` }); if (!t) break; ids.push(t.id); state = Tips.markShown(state, t.id, `2026-12-${String(i + 1).padStart(2, '0')}`, NOW + i * 86400000); }
    assert.ok(!ids.includes('procvic'));
    assert.deepEqual(Tips.parse({ seen: ['dnesni', 'x', 5, 'dnesni'], day: 'x'.repeat(30), n: -4, lastAt: 'ne', off: 'ano', visited: { learn: true, foo: true } }),
        { seen: ['dnesni'], day: 'xxxxxxxxxx', n: 0, lastAt: 0, off: false, visited: { learn: true } });
    assert.deepEqual(Tips.parse(null), Tips.EMPTY);
    assert.equal(Tips.reset(Tips.markShown(Tips.setOff(Tips.EMPTY, true), 'dnesni', '2026-11-09', NOW)).seen.length, 0);
});

test('tipy na Kvíz dne, Bleskovku a Přežití, Seřaď a Odhadni, mapu, sdílení obrázku, ochranu série, truhlu a diplomy', () => {
    const at = (id, ctx) => Tips.pick({ ...Tips.EMPTY, seen: Tips.TIPS.filter(tip => tip.id !== id).map(tip => tip.id) }, ctx);
    // Kvíz dne: brzy, pro hosta s textem o přihlášení; kdo ho hrál, tip nedostane; bez Kvízu dne v aplikaci také ne
    assert.equal(at('kviz-dne', base({ counters: { answered: 4 } })).id, 'kviz-dne');
    assert.match(Tips.textFor(Tips.BY_ID.get('kviz-dne'), false), /Po přihlášení/);
    assert.match(Tips.textFor(Tips.BY_ID.get('kviz-dne'), true), /své pořadí/);
    assert.equal(at('kviz-dne', base({ counters: { answered: 40, quizDone: 1 } })), null);
    assert.equal(at('kviz-dne', base({ counters: { answered: 40 }, quiz: false })), null);
    assert.equal(Tips.BY_ID.get('kviz-dne').action.kind, 'quiz');
    // Pořadí Kvízu dne jen přihlášenému, který kvíz hrál
    assert.equal(at('kviz-poradi', base({ counters: { answered: 40, quizDone: 1 } })), null, 'host ne');
    assert.equal(at('kviz-poradi', base({ counters: { answered: 40, quizDone: 1 }, signedIn: true })).id, 'kviz-poradi');
    assert.equal(at('kviz-poradi', base({ counters: { answered: 40 }, signedIn: true })), null, 'ještě nehrál');
    // Bleskovka a Přežití: kde je najít (okno po klepnutí na dlaždici tématu nebo Mix), kdo hrál, nedostane
    assert.match(Tips.BY_ID.get('rezimy').text, /dlaždici tématu nebo na Mix/);
    assert.equal(at('rezimy', base({ counters: { answered: 10 } })).action.kind, 'modes');
    assert.equal(at('rezimy', base({ counters: { answered: 10, survivalGames: 1 } })), null);
    // Seřaď, Odhadni a mapa: až po první takové otázce, body za přesnost
    assert.equal(at('ciselne', base({ counters: { answered: 30 } })), null);
    assert.equal(at('ciselne', base({ counters: { answered: 30, estimateAnswered: 1 } })).id, 'ciselne');
    assert.match(Tips.BY_ID.get('ciselne').text, /čím blíž správné hodnotě/);
    assert.equal(at('mapa', base({ counters: { answered: 30, mapAnswered: 1 } })).id, 'mapa');
    assert.match(Tips.BY_ID.get('mapa').text, /Čím blíž se trefíš/);
    assert.equal(at('mapa', base({ counters: { answered: 30, mapAnswered: 5 } })), null);
    // Jak odpověděli ostatní: jen přihlášenému (statistiky se ukazují jen jemu)
    assert.equal(at('ostatni', base({ counters: { answered: 40 } })), null);
    assert.equal(at('ostatni', base({ counters: { answered: 40 }, signedIn: true })).id, 'ostatni');
    // Sdílení obrázku: po prvním výsledku, který jde sdílet
    assert.equal(at('obrazek', base({ counters: { answered: 40 } })), null);
    assert.equal(at('obrazek', base({ counters: { answered: 40, quizDone: 1 } })).id, 'obrazek');
    assert.equal(at('obrazek', base({ counters: { answered: 40, quizDone: 1, sharedImages: 1 } })), null);
    // Ochrana série: když má hráč sérii nebo ochranu; kdo ji už použil, ví
    assert.equal(at('ochrana', base({ counters: { answered: 40 } })), null);
    assert.equal(at('ochrana', base({ counters: { answered: 40 }, freezes: 1 })).id, 'ochrana');
    assert.equal(at('ochrana', base({ counters: { answered: 40, bestStreak: 3, freezesUsed: 1 } })), null);
    // Truhla: s cíli týdne; kdo ji otevřel, ví
    assert.equal(at('truhla', base({ counters: { answered: 60 } })).action.kind, 'goals');
    assert.equal(at('truhla', base({ counters: { answered: 60, chestsOpened: 1 } })), null);
    // Diplomy: až má hráč v některém tématu aspoň 3 hvězdy; po návštěvě diplomů ne
    assert.equal(at('diplomy', base({ counters: { answered: 60 }, maxStars: 2 })), null);
    assert.equal(at('diplomy', base({ counters: { answered: 60 }, maxStars: 3 })).action.kind, 'progress');
    const visited = Tips.touch(Tips.EMPTY, 'diplomas');
    assert.equal(visited.visited.diplomas, true);
    assert.equal(Tips.pick({ ...visited, seen: Tips.TIPS.filter(tip => tip.id !== 'diplomy').map(tip => tip.id) }, base({ counters: { answered: 60 }, maxStars: 5 })), null);
});

test('tip na Tajemnou otázku dne: brzy, vede na ni; kdo ji vyřešil nebo ji aplikace nemá, tip nedostane', () => {
    const at = (ctx) => Tips.pick({ ...Tips.EMPTY, seen: Tips.TIPS.filter(tip => tip.id !== 'tajemna').map(tip => tip.id) }, ctx);
    assert.equal(at(base({ counters: { answered: 8 } })), null, 'až po 9 odpovědích');
    const tip = at(base({ counters: { answered: 9 } }));
    assert.equal(tip.id, 'tajemna');
    assert.deepEqual(tip.action, { kind: 'mystery', label: 'Hádat' });
    assert.equal(tip.art, 'sova-dalekohled');
    assert.equal(at(base({ counters: { answered: 50, mysterySolved: 1 } })), null);
    assert.equal(at(base({ counters: { answered: 50 }, mystery: false })), null);
});

test('tip na Zlatou otázku: po 12 odpovědích, vede do okna Zlatá otázka; kdo ho otevřel nebo má 3 správné zlaté, tip nedostane', () => {
    const at = (ctx, state = Tips.EMPTY) => Tips.pick({ ...state, seen: Tips.TIPS.filter(tip => tip.id !== 'zlata').map(tip => tip.id) }, ctx);
    assert.equal(at(base({ counters: { answered: 11 } })), null, 'až po 12 odpovědích');
    const tip = at(base({ counters: { answered: 12 } }));
    assert.equal(tip.id, 'zlata');
    assert.deepEqual(tip.action, { kind: 'gold', label: 'Ukázat střípky' });
    assert.match(tip.text, /jednou za 50 otázek[\s\S]*trojnásobek XP[\s\S]*bez nápovědy[\s\S]*Zlatou truhlu/);
    assert.equal(at(base({ counters: { answered: 50, goldCorrect: 3 } })), null);
    assert.equal(at(base({ counters: { answered: 50 } }), Tips.touch(Tips.EMPTY, 'gold')), null, 'okno Zlatá otázka už hráč viděl');
    assert.equal(at(base({ counters: { answered: 50 }, gold: false })), null, 'bez modulu Zlaté otázky ne');
});
