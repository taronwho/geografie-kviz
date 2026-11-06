// Týdenní cíle (goals.js): týden podle Prahy, stabilní losování, postup ze snímku počítadel a jednorázová odměna
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Goals = require('../goals.js');
const core = require('../quiz-core.js');

const TOPICS = ['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport'].map(id => ({ id, title: id }));

test('týden začíná v pondělí podle pražského času', () => {
    assert.equal(Goals.weekKey(new Date('2026-11-06T10:00:00Z')), '2026-11-02', 'pátek → pondělí téhož týdne');
    assert.equal(Goals.weekKey(new Date('2026-11-02T00:30:00+01:00')), '2026-11-02', 'pondělí po půlnoci v Praze');
    assert.equal(Goals.weekKey(new Date('2026-11-01T23:30:00Z')), '2026-11-02', 'neděle 23:30 UTC je v Praze už pondělí');
    assert.equal(Goals.weekKey(new Date('2026-11-08T22:00:00Z')), '2026-11-02', 'neděle večer ještě starý týden');
    assert.equal(Goals.weekKey(new Date('2026-11-08T23:30:00Z')), '2026-11-09', 'půlnoc v Praze = nový týden');
    assert.equal(Goals.pragueDay(new Date('2026-07-15T22:30:00Z')), '2026-07-16', 'letní čas');
    assert.equal(Goals.weekLabel('2026-11-02'), '2. 11. – 8. 11.');
    assert.equal(Goals.daysLeft(new Date('2026-11-02T10:00:00Z')), 7);
    assert.equal(Goals.daysLeft(new Date('2026-11-08T10:00:00Z')), 1);
});

test('losování: tři různé cíle, stejné semínko dává stejné cíle, jiný týden jiné', () => {
    const a = Goals.weeklyGoals('2026-11-02', { topics: TOPICS });
    const b = Goals.weeklyGoals('2026-11-02', { topics: TOPICS });
    assert.deepEqual(a, b, 'stabilní');
    assert.equal(a.length, Goals.COUNT);
    assert.equal(new Set(a.map(goal => goal.kind)).size, 3, 'tři různé druhy');
    for (const goal of a) {
        assert.ok(goal.id && goal.title && goal.icon && goal.metric, 'úplný cíl');
        assert.ok(goal.target > 0);
        assert.ok(Goals.REWARDS.includes(goal.xp), `odměna ${goal.xp}`);
    }
    assert.deepEqual(a.map(goal => goal.xp), [...a.map(goal => goal.xp)].sort((x, y) => x - y), 'od nejlehčího');
    // Bez hry více hráčů žádné výzvy ani turnaje
    const weeks = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21'];
    for (const week of weeks) {
        for (const goal of Goals.weeklyGoals(week, { topics: TOPICS })) assert.ok(!['vyzvy', 'vyhry', 'turnaj'].includes(goal.kind), `${week}: ${goal.kind} bez přihlášení`);
    }
    const all = weeks.map(week => Goals.weeklyGoals(week, { topics: TOPICS, multiplayer: true }).map(goal => goal.id).join());
    assert.ok(new Set(all).size > 1, 'týdny se liší');
    // Cíl na téma má téma z nabídky a metriku topics.<téma>
    const withTopic = weeks.flatMap(week => Goals.weeklyGoals(week, { topics: TOPICS })).find(goal => goal.kind === 'tema');
    assert.ok(withTopic);
    assert.match(withTopic.metric, /^topics\./);
    assert.ok(TOPICS.some(topic => withTopic.metric === `topics.${topic.id}` && withTopic.id === `tema-${topic.id}`));
    // Bez témat se cíl na téma nelosuje
    for (const week of weeks) assert.ok(Goals.weeklyGoals(week, { topics: [] }).every(goal => goal.kind !== 'tema'));
    // Všechny metriky existují v počítadlech (nebo jsou poznané položky)
    for (const kind of Goals.KINDS) {
        const metric = typeof kind.metric === 'function' ? kind.metric({ id: 'historie' }) : kind.metric;
        assert.ok(metric === 'learned' || metric.startsWith('topics.') || metric in core.EMPTY_COUNTERS, `metrika ${metric}`);
    }
});

test('postup = rozdíl počítadel od snímku na začátku týdne, omezený cílem', () => {
    const metrics0 = { correct: 100, noHint: 20, topics: { historie: 30 }, learned: 200 };
    const state = Goals.ensureState(null, '2026-11-02', metrics0);
    assert.equal(state.week, '2026-11-02');
    assert.deepEqual(state.claimed, []);
    assert.equal(state.bonus, false);
    assert.deepEqual(state.snapshot, metrics0);
    const goals = [
        { id: 'spravne', target: 40, xp: 100, metric: 'correct', title: 'Správně' },
        { id: 'tema-historie', target: 20, xp: 100, metric: 'topics.historie', title: 'Historie' },
        { id: 'poznane', target: 15, xp: 100, metric: 'learned', title: 'Poznané' }
    ];
    const rows = Goals.progress(goals, state, { correct: 125, noHint: 20, topics: { historie: 70 }, learned: 190 });
    assert.deepEqual(rows.map(row => [row.goal.id, row.value, row.done]), [['spravne', 25, false], ['tema-historie', 20, true], ['poznane', 0, false]], 'omezeno cílem, nikdy pod nulu');
    // Stejný týden drží snímek; nový týden začne znovu
    const kept = Goals.ensureState({ ...state, claimed: ['x'], bonus: true }, '2026-11-02', { correct: 999 });
    assert.deepEqual(kept.snapshot, metrics0);
    assert.deepEqual(kept.claimed, ['x']);
    assert.equal(kept.bonus, true);
    const fresh = Goals.ensureState(kept, '2026-11-09', { correct: 999, topics: {} });
    assert.deepEqual(fresh, { week: '2026-11-09', snapshot: { correct: 999, topics: {} }, claimed: [], bonus: false });
    // Snímek bere jen čísla
    assert.deepEqual(Goals.snapshotOf({ a: 1, b: 'x', lastDay: '2026-11-01', topics: { z: 2, bad: 'y' }, nested: {} }), { a: 1, topics: { z: 2 } });
    assert.equal(Goals.valueOf(null, 'correct'), 0);
    assert.equal(Goals.valueOf({ topics: { a: 3 } }, 'topics.a'), 3);
    assert.equal(Goals.valueOf({ topics: { a: 3 } }, 'topics.b'), 0);
});

test('odměna za splněný cíl jen jednou, za všechny tři bonus 200 XP jednou', () => {
    const goals = [
        { id: 'a', target: 2, xp: 50, metric: 'days', title: 'Dny' },
        { id: 'b', target: 10, xp: 100, metric: 'correct', title: 'Správně' },
        { id: 'c', target: 5, xp: 150, metric: 'noHint', title: 'Bez nápovědy' }
    ];
    let state = Goals.ensureState(null, '2026-11-02', { days: 10, correct: 50, noHint: 3 });
    let result = Goals.settle(state, goals, { days: 12, correct: 55, noHint: 3 });
    assert.deepEqual(result.awards, [{ id: 'a', title: 'Dny', xp: 50 }]);
    assert.equal(result.xp, 50);
    assert.equal(result.bonus, 0);
    assert.equal(result.allDone, false);
    state = result.state;
    // Znovu totéž: nic nového
    result = Goals.settle(state, goals, { days: 12, correct: 55, noHint: 3 });
    assert.deepEqual(result.awards, []);
    assert.equal(result.xp, 0);
    // Zbývající dva najednou → bonus
    result = Goals.settle(state, goals, { days: 12, correct: 60, noHint: 8 });
    assert.deepEqual(result.awards.map(award => award.id), ['b', 'c']);
    assert.equal(result.bonus, Goals.BONUS_XP);
    assert.equal(Goals.BONUS_XP, 200);
    assert.equal(result.xp, 100 + 150 + 200);
    assert.equal(result.allDone, true);
    assert.equal(result.state.bonus, true);
    assert.deepEqual([...result.state.claimed].sort(), ['a', 'b', 'c']);
    // Bonus se už neopakuje
    result = Goals.settle(result.state, goals, { days: 50, correct: 500, noHint: 50 });
    assert.deepEqual(result, { ...result, awards: [], bonus: 0, xp: 0, allDone: true });
    // Bez cílů žádný bonus
    assert.equal(Goals.settle(Goals.ensureState(null, '2026-11-02', {}), [], {}).bonus, 0);
});

test('odznak Týdenní cíle podle počítadla weeksDone, stupně 1/5/20', () => {
    const group = core.BADGE_GROUPS.find(entry => entry.id === 'tydenni-cile');
    assert.ok(group, 'skupina odznaků existuje');
    assert.deepEqual(group.badges.map(badge => [badge.id, badge.goal]), [['tydenni-cile', 1], ['tydenni-cile-5', 5], ['tydenni-cile-20', 20]]);
    assert.equal(core.EMPTY_COUNTERS.weeksDone, 0);
    assert.equal(core.EMPTY_COUNTERS.reviewed, 0);
    assert.equal(core.EMPTY_COUNTERS.tourPlayed, 0);
    const x = { level: 1, learned: 0, topicStars: {}, topicCount: 14 };
    assert.deepEqual(core.earnedBadgeIds({ weeksDone: 5 }, x), ['tydenni-cile', 'tydenni-cile-5']);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    for (const badge of group.badges) assert.ok(sql.includes(`'${badge.id}'`), `${badge.id} v badge_catalog()`);
    const icons = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-icons.mjs'), 'utf8');
    assert.ok(icons.includes(`'${group.icon}'`), `ikona ${group.icon}`);
    for (const kind of Goals.KINDS) assert.ok(icons.includes(`'${kind.icon}'`), `ikona cíle ${kind.icon}`);
});

test('poloviční XP za otázku z opakování', () => {
    assert.equal(core.answerXp({ correct: true, points: 4 }), 30);
    assert.equal(core.answerXp({ correct: true, points: 4, review: true }), 15);
    assert.equal(core.answerXp({ correct: true, points: 3, review: true }), 13, 'zaokrouhleno nahoru');
    assert.equal(core.answerXp({ correct: false, review: true }), 1);
    assert.equal(core.answerXp({ correct: false, gaveUp: true, review: true }), 0);
});

test('goals.js je v index.html, v service workeru a v nasazení', () => {
    const root = path.join(__dirname, '..');
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /<script src="goals\.js" defer><\/script>/);
    assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /'goals\.js'/);
    assert.match(fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8'), /\bgoals\.js\b/);
});

test('vypnuté opakování: týdenní cíl na opakování karet se nikdy nevylosuje', () => {
    const G = require('../goals.js');
    for (let week = 0; week < 60; week++) {
        const key = `2026-W${String(week).padStart(2, '0')}`;
        const goals = G.weeklyGoals(key, { topics: [{ id: 'zemepis', title: 'Zeměpis' }], multiplayer: true, skip: ['opakovani'] });
        assert.ok(goals.every(goal => goal.id !== 'opakovani'), key);
        assert.equal(goals.length, 3);
    }
});
