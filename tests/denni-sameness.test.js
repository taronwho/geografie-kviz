// Stejnost denních módů pro všechny hráče (bez prohlížeče; v prohlížeči celé otázky porovnává scripts/audit-denni.mjs a tests/e2e-denni-audit.test.js).
// Dva hráči téhož dne: jiné časové pásmo telefonu (Praha v poledne × UTC ve 23:30 = 0:30 v Praze), vlastní kopie dat (jiná identita objektů),
// jiné nastavení, úroveň a historie (výběr je nebere – funkce je ani nedostanou). Porovná se den, Kvíz dne (plán deseti otázek), Dnešní otázky
// všech 15 témat, Tajemná otázka, Boss týdne a Řetězovka. Dál: výběr Dnešních otázek nezávisí na pořadí položek a nová/odebraná položka ho
// změní jen tam, kde by sama vyhrála; změna úrovní v datech (ku/xs) nezmění den, který už začal (core.itemsAsOf).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const DailyQuiz = require('../daily-quiz.js');
const Mystery = require('../mystery.js');
const Boss = require('../boss.js');
const Chain = require('../chain.js');

const ROOT = path.join(__dirname, '..');
const TOPICS = ['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport', 'technika', 'jidlo'];
const GROUPS = [['zemepis', 'vlajky', 'historie', 'mytologie'], ['biologie', 'geologie', 'chemie', 'fyzika', 'technika'], ['umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport', 'jidlo']];
const raw = Object.fromEntries(TOPICS.map(id => [id, fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8')]));
const modules = Object.fromEntries(TOPICS.map(id => [id, require(path.join(ROOT, 'topics', `${id}.js`))]));
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'retezovka.json'), 'utf8'));
// Každý hráč má vlastní kopii dat (jako po stažení do svého telefonu)
const playerData = () => Object.fromEntries(TOPICS.map(id => [id, JSON.parse(raw[id]).items]));
const dailySeed = (id, day) => `${modules[id].dailySeed || `mudrlant-${id}-`}${day}`;

// Co hráč dostane v den day (stejně jako app.js: data jako v ten den, výběr jen ze semínka dne)
const dayFor = (data, day) => {
    const asOf = (id) => core.itemsAsOf(data[id], day);
    const categories = (id) => modules[id].categories.map(category => category.key);
    const quiz = DailyQuiz.planDay(day, GROUPS, (id) => ({ items: asOf(id), categories: categories(id) })).map(slot => `${slot.topic}:${slot.q}`);
    const daily = Object.fromEntries(TOPICS.map(id => [id, (core.dailyPick(asOf(id), { seed: dailySeed(id, day), categories: categories(id) }) || {}).q]));
    const mysteryTopic = Mystery.topicForDay(day, TOPICS);
    const mystery = `${mysteryTopic}:${(Mystery.pickItem(day, mysteryTopic, asOf(mysteryTopic)) || {}).q}`;
    const week = Boss.weekOf(new Date(`${day}T12:00:00+01:00`));
    const boss = Boss.bossForWeek(week);
    const bossItems = core.itemsAsOf(data[boss.topic], week);
    const bossPlan = Array.from({ length: Boss.QUESTIONS }, (_, slot) => (Boss.candidatesFor(week, 1, slot, bossItems, categories(boss.topic))[0] || {}).q);
    return { quiz, daily, mystery, boss: bossPlan };
};

test('stejnost: pražský den pro všechny časová pásma (UTC 23:30 = Praha 0:30 dalšího dne)', () => {
    const late = new Date('2026-11-16T23:30:00Z');
    for (const day of [core.pragueDayKey(late), DailyQuiz.pragueDay(late), Chain.pragueDay(late), Mystery.pragueDay(late)]) assert.equal(day, '2026-11-17');
    assert.equal(core.pragueDayKey(new Date('2026-11-17T11:00:00Z')), '2026-11-17');
    assert.equal(Boss.weekOf(late), Boss.weekOf(new Date('2026-11-17T12:00:00+01:00')));
    // Den aplikace (dnešní otázky, série, cíle) je pražský, ať má telefon jakékoli pásmo
    assert.equal(core.getDayKey(), core.pragueDayKey(new Date()));
    // Výpočty s dny zůstávají kalendářní (i přes změnu času)
    assert.equal(core.shiftDayKey('2026-03-28', 1), '2026-03-29');
    assert.equal(core.shiftDayKey('2026-10-25', 1), '2026-10-26');
});

test('stejnost: dva hráči téhož dne mají Kvíz dne, Dnešní otázky, Tajemnou otázku a Bosse stejné', () => {
    const first = playerData();
    const second = playerData();
    for (const day of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-12-24']) {
        const a = dayFor(first, day);
        const b = dayFor(second, day);
        assert.deepEqual(b, a, day);
        assert.equal(a.quiz.length, DailyQuiz.QUESTIONS);
        assert.ok(a.quiz.every(entry => !entry.endsWith(':null')), `${day}: Kvíz dne má všechny otázky`);
        assert.ok(Object.values(a.daily).every(Boolean), `${day}: každé téma má dnešní otázku`);
        assert.equal(new Set(a.quiz).size, a.quiz.length, `${day}: v Kvízu dne se položka neopakuje`);
    }
});

test('stejnost: Dnešní otázky nezávisí na pořadí položek a změna dat je ovlivní jen tam, kde nová položka vyhraje', () => {
    const data = playerData();
    let changedByRemoval = 0;
    for (const id of TOPICS) {
        const categories = modules[id].categories.map(category => category.key);
        for (const day of ['2026-11-17', '2026-11-20', '2026-12-01']) {
            const items = data[id];
            const pick = core.dailyPick(items, { seed: dailySeed(id, day), categories });
            const reversed = core.dailyPick([...items].reverse(), { seed: dailySeed(id, day), categories });
            assert.equal(reversed.q, pick.q, `${id} ${day}: pořadí položek`);
            // Odebraná jiná položka (fotka, zamítnutá položka) výběr nezmění
            const other = items.find(item => item.q !== pick.q && item.c === pick.c && item.k === pick.k);
            const without = core.dailyPick(items.filter(item => item !== other), { seed: dailySeed(id, day), categories });
            if (without.q !== pick.q) changedByRemoval += 1;
            // Nové položky na začátku dat vyhrají jen se svým otiskem
            const added = Array.from({ length: 5 }, (_, i) => ({ ...pick, q: `Qnova${i}`, n: `Nová ${i}` }));
            const withNew = core.dailyPick([...added, ...items], { seed: dailySeed(id, day), categories });
            const winner = [pick, ...added].reduce((best, item) => (core.hashText(`${dailySeed(id, day)}|${item.q}`) < core.hashText(`${dailySeed(id, day)}|${best.q}`) ? item : best));
            assert.equal(withNew.q, winner.q, `${id} ${day}: nová položka`);
        }
    }
    assert.equal(changedByRemoval, 0, 'odebraná jiná položka nemění dnešní otázku');
});

test('stejnost: změna úrovní známosti (geologické věky) platí až od 17. 11. 2026, den předtím zůstane', () => {
    const data = playerData();
    const geology = data.geologie;
    const before = core.itemsAsOf(geology, '2026-11-16');
    assert.notEqual(before, geology);
    assert.equal(core.itemsAsOf(geology, '2026-11-16'), before, 'jedna kopie na den');
    assert.equal(core.itemsAsOf(geology, '2026-11-17'), geology);
    const ages = (items) => items.filter(item => item.c === 'obdobi' && item.f.lvl === 'věk');
    assert.equal(ages(before).filter(item => item.k === 1).length, 7);
    assert.equal(ages(before).filter(item => item.x).length, ages(geology).filter(item => item.x && !item.xs && !item.ku).length, 'experti jako dřív');
    assert.ok(ages(geology).every(item => item.k === 0 && item.x === 1));
    // Kvíz dne 16. 11. bere věky jako známé (tiersOf), 17. 11. už ne
    const plan = (day) => DailyQuiz.planDay(day, GROUPS, (id) => ({ items: core.itemsAsOf(data[id], day), categories: modules[id].categories.map(category => category.key) }));
    const ageIds = new Set(ages(geology).map(item => item.q));
    for (const day of ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']) {
        assert.ok(plan(day).every(slot => !ageIds.has(slot.q)), `${day}: Kvíz dne bez geologických věků`);
    }
});

test('stejnost: Řetězovka dne je pro dva hráče s vlastními kopiemi dat stejná (i den před změnou úrovní)', () => {
    const chainFor = (data, day) => {
        const sources = Object.fromEntries(Chain.SOURCES.map(id => [id, core.itemsAsOf(data[id], day)]));
        const graph = Chain.buildGraph(sources, countries, extra);
        const chain = Chain.dailyChain(graph, day);
        return chain ? [chain.start.id, ...chain.questions.map(question => `${question.to.id}|${question.options.map(option => option.id).join(',')}`)] : null;
    };
    const first = playerData();
    const second = playerData();
    for (const day of ['2026-11-16', '2026-11-17']) {
        const a = chainFor(first, day);
        assert.ok(a && a.length === Chain.LINKS + 1, day);
        assert.deepEqual(chainFor(second, day), a, day);
    }
});

test('rotace dnešních otázek: v kategorii se položky nezopakují, dokud nepřijdou všechny; stejné pro všechny a nezávislé na pořadí dat', () => {
    const items = Array.from({ length: 400 }, (_, i) => ({ q: `Q${i + 1}`, c: i < 6 ? 'mala' : 'velka', k: 1 }));
    const categories = ['mala', 'velka'];
    const day = (n) => new Date(Date.UTC(2026, 10, 24 + n)).toISOString().slice(0, 10);
    const pick = (n, list = items) => core.dailyPick(list, { seed: `t-${day(n)}`, categories, rotation: { prefix: 't-', day: day(n), from: day(0) } });
    const picked = Array.from({ length: 80 }, (_, n) => pick(n));
    // malá kategorie má 6 položek: každých 6 jejích výskytů jsou všechny různé
    const small = picked.filter(item => item.c === 'mala');
    for (let start = 0; start + 6 <= small.length; start += 6) assert.equal(new Set(small.slice(start, start + 6).map(item => item.q)).size, 6, `cyklus malé kategorie od ${start}`);
    const big = picked.filter(item => item.c === 'velka');
    assert.equal(new Set(big.map(item => item.q)).size, big.length, 'velká kategorie se za 80 dnů neopakuje');
    assert.ok(small.length < 80 * 0.3, 'malá kategorie dostane méně otázek než při rovnoměrném losu (odmocnina z počtu)');
    assert.deepEqual(picked.map((item, n) => pick(n, [...items].reverse()).q), picked.map(item => item.q), 'nezávisí na pořadí dat');
    // před začátkem rotace a bez ní platí původní los
    const before = core.dailyPick(items, { seed: `t-${day(-3)}`, categories, rotation: { prefix: 't-', day: day(-3), from: day(0) } });
    assert.equal(before.q, core.dailyPick(items, { seed: `t-${day(-3)}`, categories }).q);
});

test('trénink: vyvážený los kategorií dává malé kategorii méně otázek než rovnoměrný', () => {
    const items = [...Array.from({ length: 4 }, (_, i) => ({ q: `Qs${i}`, c: 'mala' })), ...Array.from({ length: 400 }, (_, i) => ({ q: `Qv${i}`, c: 'velka' }))];
    const share = (options) => {
        const rng = core.createSeededRandom('vyvazeny');
        let small = 0;
        for (let i = 0; i < 2000; i++) if (core.pickItem(items, rng, [], ['mala', 'velka'], null, options).c === 'mala') small++;
        return small / 2000;
    };
    assert.ok(Math.abs(share({}) - 0.5) < 0.05);
    assert.ok(share({ balanced: true }) < 0.15, 'sqrt(4) : sqrt(400) = 1 : 10');
});
