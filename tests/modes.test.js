// Režimy Bleskovka a Přežití (modes.js): hodiny s trestem, tikání, obtížnost Přežití, rekordy a XP s denním stropem
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Modes = require('../modes.js');

const ROOT = path.join(__dirname, '..');
const DAY = '2026-11-07';

test('pravidla: Bleskovka 60 s a trest 3 s, Přežití tři životy; XP nižší než v běžné hře', () => {
    assert.equal(Modes.MODES.blitz.seconds, 60);
    assert.equal(Modes.MODES.blitz.penalty, 3);
    assert.equal(Modes.MODES.survival.lives, 3);
    assert.deepEqual(Modes.IDS, ['blitz', 'survival']);
    // Běžná správná odpověď bez nápovědy dá 30 XP; v režimech je otázka rychlá, proto o řád méně
    for (const id of Modes.IDS) assert.ok(Modes.MODES[id].xpPer > 0 && Modes.MODES[id].xpPer <= 5, id);
    assert.match(Modes.rules('blitz').map(rule => rule.text).join(' '), /60 sekund.*ubere 3 sekundy/);
    assert.match(Modes.rules('survival').map(rule => rule.text).join(' '), /3 životy/);
    for (const id of Modes.IDS) assert.ok(Modes.MODES[id].feedback.wrong > Modes.MODES[id].feedback.correct, `${id}: chyba je vidět déle`);
});

test('ikony režimů a pravidel jsou v icons.js', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8'), sandbox);
    const icons = sandbox.window.MUDRLANT_ICONS;
    const names = [...Modes.IDS.map(id => Modes.MODES[id].icon), ...Modes.IDS.flatMap(id => Modes.rules(id).map(rule => rule.icon))];
    for (const name of names) assert.ok(icons[name], name);
});

test('hodiny Bleskovky: běží jen spuštěné, pauza drží čas, trest ubere 3 s a nikdy nejde pod nulu', () => {
    let clock = Modes.createClock(60);
    assert.equal(Modes.clockLeft(clock, 5000), 60000, 'nespuštěné hodiny stojí');
    assert.equal(Modes.clockRunning(clock), false);
    clock = Modes.startClock(clock, 1000);
    assert.equal(Modes.clockRunning(clock), true);
    assert.equal(Modes.clockLeft(clock, 6000), 55000);
    assert.equal(Modes.startClock(clock, 9000), clock, 'druhé spuštění nic nezmění');
    clock = Modes.pauseClock(clock, 6000);
    assert.equal(Modes.clockLeft(clock, 100000), 55000, 'při načítání a po odpovědi čas stojí');
    clock = Modes.penalize(clock, 3000, 100000);
    assert.equal(Modes.clockLeft(clock, 200000), 52000, 'trest i za pauzy');
    assert.equal(Modes.clockRunning(clock), false);
    clock = Modes.startClock(clock, 0);
    clock = Modes.penalize(clock, 3000, 10000);
    assert.equal(Modes.clockLeft(clock, 10000), 39000, 'trest za běhu: 52 − 10 − 3');
    assert.equal(Modes.clockLeft(clock, 11000), 38000, 'po trestu hodiny běží dál');
    assert.equal(Modes.clockLeft(Modes.penalize(Modes.createClock(2), 3000, 0), 0), 0, 'ne pod nulu');
    assert.equal(Modes.clockLeft(Modes.startClock(Modes.createClock(1), 0), 5000), 0);
});

test('zobrazené sekundy a tikání v posledních 5 s (po trestu jen jednou)', () => {
    assert.equal(Modes.secondsShown(60000), 60);
    assert.equal(Modes.secondsShown(2100), 3);
    assert.equal(Modes.secondsShown(1), 1);
    assert.equal(Modes.secondsShown(0), 0);
    assert.equal(Modes.secondsShown(-50), 0);
    assert.equal(Modes.tickDue(6, 5), 5);
    assert.equal(Modes.tickDue(5, 5), 0, 'stejná sekunda netiká dvakrát');
    assert.equal(Modes.tickDue(9, 6), 0, 'mimo posledních 5 s');
    assert.equal(Modes.tickDue(7, 4), 4, 'trest přes hranici: jedno tiknutí');
    assert.equal(Modes.tickDue(2, 1), 1);
    assert.equal(Modes.tickDue(1, 0), 0, 'konec už netiká');
    // Celá hra bez chyb: tikne přesně pětkrát (5, 4, 3, 2, 1)
    let shown = 60;
    const ticks = [];
    for (let left = 60000; left >= 0; left -= 100) {
        const now = Modes.secondsShown(left);
        const tick = Modes.tickDue(shown, now);
        if (tick) ticks.push(tick);
        shown = now;
    }
    assert.deepEqual(ticks, [5, 4, 3, 2, 1]);
});

test('Přežití: prvních 5 otázek jen známé, pak přibývají těžší, od 25. otázky celá sada', () => {
    for (let asked = 0; asked < Modes.EASY_QUESTIONS; asked++) {
        assert.equal(Modes.hardShare(asked), 0);
        assert.equal(Modes.survivalTier(asked, () => 0), 'known', `otázka ${asked + 1}`);
    }
    assert.ok(Modes.hardShare(5) > 0 && Modes.hardShare(5) < 0.1);
    assert.equal(Modes.hardShare(24), 1);
    assert.equal(Modes.hardShare(200), 1);
    for (let asked = 1; asked < 40; asked++) assert.ok(Modes.hardShare(asked) >= Modes.hardShare(asked - 1), 'obtížnost neklesá');
    assert.equal(Modes.survivalTier(10, () => 0), 'all');
    assert.equal(Modes.survivalTier(10, () => 0.99), 'known');
    assert.equal(Modes.survivalTier(30, () => 0.999), 'all');
    assert.equal(Modes.difficultyLabel(0), 'Známé');
    assert.equal(Modes.difficultyLabel(12), 'Přibývají těžší');
    assert.equal(Modes.difficultyLabel(40), 'Celá sada');
});

test('otázka do režimu jen s výběrem z možností (aspoň dvě, právě jedna správná)', () => {
    const choices = (...flags) => ({ question: { choices: flags.map((correct, i) => ({ label: `M${i}`, correct })) } });
    assert.equal(Modes.playable(choices(true, false, false, false)), true);
    assert.equal(Modes.playable(choices(true, false)), true);
    assert.equal(Modes.playable(choices(true)), false);
    assert.equal(Modes.playable(choices(true, true, false)), false);
    assert.equal(Modes.playable(choices(false, false)), false);
    assert.equal(Modes.playable({ question: { type: 'order', items: [] } }), false, 'jiný druh otázky (řazení, odhad, mapa)');
    assert.equal(Modes.playable(null), false);
});

test('uložený stav: poškozená data se vyčistí, celkový rekord je aspoň nejlepší z témat', () => {
    const empty = Modes.parse(null);
    assert.deepEqual(empty.blitz, { best: {}, top: 0, games: 0, total: 0 });
    assert.deepEqual(empty.xp, { blitz: 0, survival: 0 });
    assert.deepEqual(Modes.parse('nesmysl').survival.best, {});
    const parsed = Modes.parse({ day: DAY, blitz: { best: { zemepis: 12, 'Zlé téma!': 99, mix: -3, historie: 'x', sport: 7.9 }, top: 5, games: 4, total: 30 }, xp: { blitz: 60 }, bonus: { blitz: true, survival: 'ano' } });
    assert.deepEqual(parsed.blitz.best, { zemepis: 12, sport: 7 });
    assert.equal(parsed.blitz.top, 12);
    assert.equal(parsed.xp.blitz, 60);
    assert.equal(parsed.bonus.blitz, true);
    assert.equal(parsed.bonus.survival, false);
    assert.equal(parsed.day, DAY);
    assert.equal(Modes.scopeOf({ kind: 'topic', topic: 'zemepis' }), 'zemepis');
    assert.equal(Modes.scopeOf({ kind: 'mix' }), 'mix');
    assert.equal(Modes.scopeOf(null), 'mix');
});

test('rekordy: první hra rekord založí (bez oslavy), lepší výsledek je nový rekord tématu i celkový', () => {
    let state = Modes.parse(null);
    const first = Modes.finish(state, 'blitz', 'zemepis', 8, DAY);
    assert.equal(first.firstRecord, true);
    assert.equal(first.record, false, 'první hra se neslaví');
    assert.deepEqual(first.before, { scope: 0, overall: 0, games: 0 });
    assert.deepEqual(first.after, { scope: 8, overall: 8, games: 1 });
    state = first.state;
    const worse = Modes.finish(state, 'blitz', 'zemepis', 5, DAY);
    assert.equal(worse.record, false);
    assert.equal(worse.after.scope, 8, 'horší výsledek rekord nemění');
    state = worse.state;
    const better = Modes.finish(state, 'blitz', 'zemepis', 11, DAY);
    assert.equal(better.scopeRecord, true);
    assert.equal(better.overallRecord, true);
    assert.equal(better.record, true);
    state = better.state;
    // Jiné téma: první hra v tématu, ale překoná celkový rekord
    const other = Modes.finish(state, 'blitz', 'historie', 14, DAY);
    assert.equal(other.firstRecord, true);
    assert.equal(other.scopeRecord, false);
    assert.equal(other.overallRecord, true);
    assert.equal(other.record, true);
    assert.equal(other.state.blitz.top, 14);
    assert.equal(other.state.blitz.games, 4);
    assert.equal(other.state.blitz.total, 38);
    // Přežití má rekordy zvlášť
    assert.equal(other.state.survival.top, 0);
    const survival = Modes.finish(other.state, 'survival', 'mix', 3, DAY);
    assert.deepEqual(survival.state.survival.best, { mix: 3 });
    assert.equal(survival.state.blitz.top, 14);
});

test('XP: za každou správnou odpověď, bonus za rekord jednou denně, denní strop a vysvětlení „+N XP za …“', () => {
    let state = Modes.parse(null);
    const first = Modes.finish(state, 'blitz', 'zemepis', 10, DAY);
    assert.equal(first.xp.total, 30);
    assert.deepEqual(first.xp.parts, [{ label: 'za 10 správných odpovědí', xp: 30 }]);
    assert.equal(first.xp.note, '');
    state = first.state;
    const record = Modes.finish(state, 'blitz', 'zemepis', 12, DAY);
    assert.deepEqual(record.xp.parts, [{ label: 'za 12 správných odpovědí', xp: 36 }, { label: 'za nový rekord', xp: Modes.RECORD_XP }]);
    state = record.state;
    const again = Modes.finish(state, 'blitz', 'zemepis', 14, DAY);
    assert.equal(again.record, true);
    assert.deepEqual(again.xp.parts.map(part => part.label), ['za 14 správných odpovědí'], 'bonus za rekord jen jednou denně');
    state = again.state;
    assert.equal(state.xp.blitz, 30 + 36 + 42);
    assert.equal(Modes.xpLeftToday(state, 'blitz', DAY), 150 - 108);
    // Strop: zbývá 42 XP, hra za 60 XP dá 42 a vysvětlí proč
    const capped = Modes.finish(state, 'blitz', 'zemepis', 20, DAY);
    assert.equal(capped.xp.parts[0].xp, 42);
    assert.match(capped.xp.parts[0].label, /^za 20 správných odpovědí \(dnešní strop 150 XP\)$/);
    assert.match(capped.xp.note, /naplněný/);
    state = capped.state;
    assert.equal(state.xp.blitz, Modes.DAILY_XP_CAP);
    const over = Modes.finish(state, 'blitz', 'zemepis', 25, DAY);
    assert.equal(over.record, true, 'rekord se počítá i po stropu');
    assert.deepEqual(over.xp.parts, [], 'po stropu nic (bonus za rekord už dnes byl)');
    assert.equal(over.xp.total, 0);
    assert.match(over.xp.note, /vyčerpaný – rekordy se počítají dál/);
    // Po stropu, ale první rekord dne v Přežití: bonus se vyplatí (strop je pro každý režim zvlášť a bonus stojí mimo něj)
    const survivalState = Modes.finish(over.state, 'survival', 'zemepis', 40, DAY).state;
    assert.equal(survivalState.xp.survival, Modes.DAILY_XP_CAP, '40 × 4 XP se vejde do stropu jen zčásti');
    const survivalRecord = Modes.finish(survivalState, 'survival', 'zemepis', 50, DAY);
    assert.deepEqual(survivalRecord.xp.parts, [{ label: 'za nový rekord', xp: Modes.RECORD_XP }]);
    // Přežití má vlastní strop i bonus
    assert.equal(Modes.xpLeftToday(over.state, 'survival', DAY), 150);
    // Nový den: strop i bonus od nuly
    const nextDay = Modes.finish(over.state, 'blitz', 'zemepis', 26, '2026-11-08');
    assert.deepEqual(nextDay.xp.parts, [{ label: 'za 26 správných odpovědí', xp: 78 }, { label: 'za nový rekord', xp: Modes.RECORD_XP }]);
    assert.equal(nextDay.state.xp.blitz, 78);
    // Hra bez správné odpovědi: nic, ale počítá se
    const zero = Modes.finish(Modes.parse(null), 'survival', 'mix', 0, DAY);
    assert.deepEqual(zero.xp, { total: 0, parts: [], note: '' });
    assert.equal(zero.state.survival.games, 1);
    assert.equal(zero.firstRecord, false);
});

test('XP: denní maximum z režimů je mírné (strop + bonus v každém režimu)', () => {
    let state = Modes.parse(null);
    let total = 0;
    for (let game = 1; game <= 40; game++) {
        for (const id of Modes.IDS) {
            const result = Modes.finish(state, id, game % 2 ? 'zemepis' : 'mix', game, DAY);
            total += result.xp.total;
            state = result.state;
        }
    }
    assert.equal(total, 2 * (Modes.DAILY_XP_CAP + Modes.RECORD_XP));
});

test('popisky s českým skloňováním', () => {
    assert.equal(Modes.scoreLabel('blitz', 1), '1 správná odpověď');
    assert.equal(Modes.scoreLabel('blitz', 3), '3 správné odpovědi');
    assert.equal(Modes.scoreLabel('blitz', 5), '5 správných odpovědí');
    assert.equal(Modes.scoreLabel('survival', 1), '1 přežitá otázka');
    assert.equal(Modes.scoreLabel('survival', 4), '4 přežité otázky');
    assert.equal(Modes.scoreLabel('survival', 0), '0 přežitých otázek');
    const survival = Modes.finish(Modes.parse(null), 'survival', 'zemepis', 1, DAY);
    assert.deepEqual(survival.xp.parts, [{ label: 'za 1 přežitou otázku', xp: Modes.MODES.survival.xpPer }]);
    assert.equal(Modes.finish(Modes.parse(null), 'survival', 'zemepis', 2, DAY).xp.parts[0].label, 'za 2 přežité otázky');
    assert.equal(Modes.finish(Modes.parse(null), 'blitz', 'zemepis', 1, DAY).xp.parts[0].label, 'za 1 správnou odpověď');
});

test('aplikace načítá modes.js a sound.js a service worker je drží v mezipaměti', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    for (const file of ['modes.js', 'sound.js']) {
        assert.match(html, new RegExp(`<script src="${file}" defer></script>`));
        assert.ok(html.indexOf(file) < html.indexOf('app.js'), `${file} před app.js`);
        assert.match(sw, new RegExp(`'${file}'`));
    }
});
