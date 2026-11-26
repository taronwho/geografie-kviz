// Seřaď to (sorting.js): výběr karet na skutečných datech témat (všechny vlastnosti a obtížnosti), přesuny jen mezi volnými místy,
// kontrola se zamykáním správných karet, Řazení dne stejné pro všechny, XP s denním stropem a uložený stav. Napojení na aplikaci (soubory,
// app.js, tip) na konci. Obrazovky v prohlížeči: tests/e2e-sorting.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const Numeric = require('../numeric-questions.js');
const Sorting = require('../sorting.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const cache = {};
const items = (topic) => cache[topic] || (cache[topic] = JSON.parse(read(`data/${topic}.json`)).items);
const seeded = (text) => core.createSeededRandom(text);

test('každá vlastnost a obtížnost dá kolo: počet karet, různé názvy, hodnoty dost daleko od sebe, správné pořadí', () => {
    for (const [id, spec] of Sorting.SPEC_BY_ID) {
        for (const level of Sorting.LEVEL_IDS) {
            for (const seed of ['a', 'b', 'c']) {
                const round = Sorting.makeRound({ spec: id, items: items(spec.topic), level, rng: seeded(`${id}|${level}|${seed}`) });
                assert.ok(round, `${id} ${level}`);
                const n = round.items.length;
                assert.ok(n >= 5 && n <= Sorting.LEVELS[level].cards, `${id} ${level}: ${n} karet`);
                if (!round.eased) assert.equal(n, Sorting.LEVELS[level].cards);
                assert.equal(new Set(round.items.map(card => core.normalizeAnswer(card.name))).size, n, `${id}: různé názvy`);
                const values = round.correct.map(index => round.items[index].value);
                for (let i = 1; i < n; i++) {
                    assert.ok(round.dir === 'desc' ? values[i - 1] > values[i] : values[i - 1] < values[i], `${id}: pořadí ${values}`);
                    for (let j = 0; j < i; j++) assert.ok(Sorting.apart(spec.gap, values[i], values[j], 1), `${id}: ${values[i]} a ${values[j]} jsou moc blízko`);
                }
                // Zamícháno: nejvýš jedna karta na správném místě
                assert.ok(Sorting.placedCount(round.order, round.correct) <= 1, `${id}: zamíchané pořadí`);
                assert.ok(round.title.startsWith('Seřaď') && round.subtitle, id);
                assert.ok(round.items.every(card => card.label && card.id && Number.isFinite(card.value)));
            }
        }
    }
});

test('obtížnost: lehká má hodnoty dál od sebe než těžká (u hor), těžká bere i méně známé', () => {
    const spread = (level) => {
        let total = 0;
        for (let i = 0; i < 30; i++) {
            const round = Sorting.makeRound({ spec: 'zemepis-hora-vyska', items: items('zemepis'), level, rng: seeded(`hory${level}${i}`) });
            const values = round.correct.map(index => round.items[index].value);
            total += Math.log(values[0] / values[values.length - 1]) / (values.length - 1);
        }
        return total / 30;
    };
    assert.ok(spread('easy') > spread('medium') && spread('medium') > spread('hard'), 'průměrný krok mezi kartami klesá s obtížností');
    assert.equal(Sorting.LEVELS.easy.cards, 5);
    assert.equal(Sorting.LEVELS.hard.cards, 7);
    const known = new Set(items('zemepis').filter(item => item.k === 1).map(item => item.q));
    const easy = Sorting.makeRound({ spec: 'zemepis-hora-vyska', items: items('zemepis'), level: 'easy', rng: seeded('k') });
    assert.ok(easy.items.every(card => known.has(card.id)), 'lehká jen ze známých');
});

test('přesuny jen mezi volnými místy, zamčené karty stojí; kontrola zamkne správné a počítá pokusy', () => {
    const base = Sorting.makeRound({ spec: 'chemie-prvky-z', items: items('chemie'), level: 'medium', rng: seeded('prvky') });
    const n = base.order.length;
    // Karta správně na 1. místě a zkontrolováno: první místo se zamkne
    let round = { ...base, order: [base.correct[0], ...base.order.filter(index => index !== base.correct[0])] };
    let result = Sorting.check(round);
    assert.ok(result.round.locked[0]);
    assert.ok(result.newly.includes(0));
    assert.equal(result.round.attempts, 1);
    assert.deepEqual(result.round.checks, [result.placed]);
    round = result.round;
    // Zamčená karta se nehne a nedá se přeskočit
    assert.equal(Sorting.moveCard(round, 0, 2).order, round.order);
    const lockedCard = round.order[0];
    assert.equal(Sorting.neighbour(round, 1, -1), -1, 'nad prvním volným místem už nic není');
    const moved = Sorting.moveCard(round, 1, n - 1);
    assert.equal(moved.order[0], lockedCard);
    assert.equal(moved.order[n - 1], round.order[1]);
    assert.deepEqual([...moved.order].sort(), [...round.order].sort());
    const stepped = Sorting.stepCard(round, 2, -1);
    assert.equal(stepped.order[1], round.order[2]);
    assert.equal(stepped.order[2], round.order[1]);
    assert.equal(Sorting.swapCards(round, 0, 1), round, 'prohodit se zamčenou nejde');
    const swapped = Sorting.swapCards(round, 1, 3);
    assert.equal(swapped.order[1], round.order[3]);
    // Seřadit zbytek: další kontrola je hotovo a všechno zamčené
    result = Sorting.check({ ...round, order: [...round.correct] });
    assert.ok(result.done && result.round.done && result.round.locked.every(Boolean));
    assert.equal(result.round.attempts, 2);
    assert.equal(result.wrong.length, 0);
});

test('Řazení dne: stejné pro všechny, střídá vlastnosti, dva dny po sobě jiné téma', async () => {
    const loadItems = async (topic) => ({ items: items(topic), ctx: null });
    const a = await Sorting.dailyRound('2026-11-26', loadItems);
    const b = await Sorting.dailyRound('2026-11-26', loadItems);
    assert.deepEqual(a, b);
    assert.equal(a.mode, 'daily');
    assert.equal(a.items.length, Sorting.LEVELS[Sorting.DAILY_LEVEL].cards);
    const days = Array.from({ length: Sorting.DAILY_SPECS.length }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10));
    const specs = days.map(Sorting.dailySpecId);
    assert.equal(new Set(specs).size, Sorting.DAILY_SPECS.length, 'všechny vlastnosti, než se některá zopakuje');
    for (let i = 1; i < specs.length; i++) assert.notEqual(Sorting.SPEC_BY_ID.get(specs[i]).topic, Sorting.SPEC_BY_ID.get(specs[i - 1]).topic, `${days[i]}`);
    for (const id of Sorting.DAILY_SPECS) assert.ok(Sorting.SPEC_BY_ID.has(id), id);
    for (const day of days) assert.ok(await Sorting.dailyRound(day, loadItems), day);
});

test('XP: volná hra 2 za kartu a 4 napoprvé s denním stropem 60, Řazení dne 20 + 10 jednou denně; série a rozehraný den', () => {
    const day = '2026-11-26';
    const round = (extra) => ({ ...Sorting.makeRound({ spec: 'zemepis-reka-delka', items: items('zemepis'), level: 'medium', rng: seeded('r') }), done: true, ...extra });
    let out = Sorting.finish(null, round({ attempts: 1 }), day);
    assert.equal(out.xp.total, 6 * 2 + 4);
    assert.equal(out.state.perfect, 1);
    out = Sorting.finish(out.state, round({ attempts: 3 }), day);
    assert.equal(out.xp.total, 12);
    let state = out.state;
    for (let i = 0; i < 5; i++) state = Sorting.finish(state, round({ attempts: 2 }), day).state;
    assert.equal(state.xp, Sorting.DAILY_XP_CAP);
    out = Sorting.finish(state, round({ attempts: 1 }), day);
    assert.equal(out.xp.total, 0);
    assert.match(out.xp.note, /strop 60 XP/);
    assert.equal(Sorting.xpLeftToday(out.state, day), 0);
    assert.equal(Sorting.xpLeftToday(out.state, '2026-11-27'), Sorting.DAILY_XP_CAP, 'nový den, nový strop');
    // Řazení dne mimo strop, jednou denně
    const daily = round({ mode: 'daily', day, attempts: 1 });
    out = Sorting.finish(out.state, daily, day);
    assert.equal(out.xp.total, Sorting.DAILY_XP + Sorting.DAILY_FIRST_XP);
    assert.deepEqual(out.state.daily[day], { attempts: 1, spec: 'zemepis-reka-delka' });
    assert.equal(Sorting.finish(out.state, daily, day).xp.total, 0);
    // Série dní
    let streakState = Sorting.parse({ daily: { '2026-11-24': { attempts: 2 }, '2026-11-25': { attempts: 1 } } });
    assert.equal(Sorting.dailyStreak(streakState, day), 2, 'dnešek ještě nehraný, série platí');
    streakState = Sorting.finish(streakState, daily, day).state;
    assert.equal(Sorting.dailyStreak(streakState, day), 3);
    // Rozehrané Řazení dne se obnoví jen ve stejný den a zamčené jen správné karty
    const fresh = Sorting.makeRound({ spec: 'zemepis-reka-delka', items: items('zemepis'), level: 'medium', rng: seeded('r'), mode: 'daily', day });
    const playing = Sorting.check(Sorting.moveCard(fresh, 0, 3)).round;
    const saved = Sorting.parse(JSON.parse(JSON.stringify(Sorting.savePlay(Sorting.parse(null), playing))));
    const restored = Sorting.restorePlay(saved, fresh);
    assert.deepEqual(restored.order, playing.order);
    assert.deepEqual(restored.locked, playing.locked);
    assert.equal(restored.attempts, 1);
    assert.equal(Sorting.restorePlay(saved, { ...fresh, day: '2026-11-27' }).order, fresh.order, 'jiný den: začíná se znovu');
    const forged = Sorting.parse({ play: { ...saved.play, locked: saved.play.locked.map(() => true) } });
    assert.deepEqual(Sorting.restorePlay(forged, fresh).locked, playing.locked, 'zamknout se dá jen správná karta');
    // Poškozený stav nevadí
    assert.deepEqual(Sorting.parse('x').last, { topic: 'mix', spec: '', level: 'medium' });
    assert.equal(Sorting.parse({ last: { topic: 'neco', spec: 'x', level: 'nejtezsi' } }).last.level, 'medium');
});

test('HTML: úvod, hra a výsledek bez vložených stylů, s popisky pro čtečku a hodnotami až na konci', () => {
    const ui = { uiArt: (name, cls) => `<img src="icons/topics/${name}.webp" class="${cls}" alt="">`, style: { button: 'bg-brand-700', text: 'text-brand-700', on: 'border-brand-500' }, card: 'card', cardTitle: 'title', picked: null, live: '', xpHtml: '', day: '2026-11-26', topics: [{ id: 'zemepis', title: 'Zeměpis' }], streak: 0 };
    const intro = Sorting.introHtml(Sorting.parse(null), ui);
    assert.match(intro, /Řazení dne/);
    assert.match(intro, /id="sorting-topic"/);
    assert.match(intro, /data-action="sorting-level" data-level="hard"/);
    const round = Sorting.makeRound({ spec: 'zemepis-hora-vyska', items: items('zemepis'), level: 'hard', rng: seeded('html') });
    const play = Sorting.playHtml(round, ui);
    assert.equal((play.match(/data-sort-card /g) || []).length, 7);
    assert.match(play, /aria-label="Posunout [^"]+ výš"/);
    for (const card of round.items) assert.ok(!play.includes(card.label), `hodnota ${card.label} se při hře neukazuje`);
    const done = Sorting.doneHtml({ ...round, done: true, attempts: 1, locked: round.locked.map(() => true), order: [...round.correct] }, ui);
    for (const card of round.items) assert.ok(done.includes(core.escapeHtml(card.label)), card.label);
    assert.match(done, /Seřazeno napoprvé!/);
    assert.match(done, /sort-reveal sort-d7/);
    for (const html of [intro, play, done]) assert.doesNotMatch(html, /style=/);
});

test('napojení: index.html, service worker, nasazení, Tailwind, ikony, styly, app.js a tip', () => {
    const index = read('index.html');
    assert.match(index, /<script src="sorting\.js" defer><\/script>/);
    assert.ok(index.indexOf('numeric-questions.js') < index.indexOf('sorting.js') && index.indexOf('sorting.js') < index.indexOf('app.js'));
    assert.match(read('sw.js'), /'sorting\.js'/);
    assert.match(read('.github/workflows/pages.yml'), /\bsorting\.js\b/);
    assert.match(read('tailwind.config.js'), /'\.\/sorting\.js'/);
    const icons = read('icons.js');
    for (const icon of ['chevron-up', 'chevron-down', 'lock', 'list-ordered', 'calendar-days', 'shuffle']) assert.ok(icons.includes(`"${icon}":`), icon);
    const styles = read('styles.css');
    for (const cls of ['sort-snap', 'sort-nudge', 'sort-reveal', 'sort-lift', 'sort-d7']) assert.ok(styles.includes(cls), cls);
    const app = read('app.js');
    assert.match(app, /\.\.\.\(sortingCtl \? sortingCtl\.actions : \{\}\)/);
    assert.match(app, /data-action="sorting-open"/);
    const Tips = require('../tips.js');
    const tip = Tips.TIPS.find(one => one.id === 'serad-to');
    assert.ok(tip && tip.text.length < 260);
    assert.equal(tip.action.kind, 'sorting');
    assert.match(app, /sorting: \(\) => \{ closeDialog\(\); if \(sortingCtl\) sortingCtl\.open\(\); \}/);
    assert.ok(Numeric.SPECS.length > 0);
});
