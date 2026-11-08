// Jak odpověděli ostatní (answer-stats.js): tvar odpovědí, fronta a odesílání po dávkách, stažené souhrny témat s platností den,
// řádek po odpovědi a kalibrace losování (vážený pickItem v quiz-core.js; losování ze semínka zůstává beze změny).
const test = require('node:test');
const assert = require('node:assert/strict');
const Stats = require('../answer-stats.js');
const Core = require('../quiz-core.js');

const memoryStorage = () => {
    const data = new Map();
    return { data, getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => { data.set(key, String(value)); }, removeItem: (key) => { data.delete(key); } };
};
const answer = (over = {}) => ({ topic: 'zemepis', itemId: 'Q213', kind: 'name', variant: 'choices', correct: false, wrongId: 'Q39', ...over });
const DAY = 24 * 60 * 60 * 1000;

test('cleanAnswer: jen tvary, které přijme databáze; nesprávná možnost jen u špatné odpovědi', () => {
    assert.deepEqual(Stats.cleanAnswer(answer()), { t: 'zemepis', q: 'Q213', k: 'name', v: 'choices', c: false, w: 'Q39' });
    assert.deepEqual(Stats.cleanAnswer(answer({ correct: true })), { t: 'zemepis', q: 'Q213', k: 'name', v: 'choices', c: true });
    assert.equal(Stats.cleanAnswer(answer({ variant: 'typed' })).v, 'typed');
    assert.equal(Stats.cleanAnswer(answer({ variant: 'nesmysl' })).v, 'choices');
    assert.equal(Stats.cleanAnswer(answer({ topic: 'Zeměpis' })), null);
    assert.equal(Stats.cleanAnswer(answer({ itemId: 'Q0' })), null);
    assert.equal(Stats.cleanAnswer(answer({ itemId: 'Q213; drop table' })), null);
    assert.equal(Stats.cleanAnswer(answer({ kind: 'Na Name' })), null);
    assert.equal(Stats.cleanAnswer(answer({ correct: 'true' })).c, false, 'správně jen skutečné true');
    // nesprávná možnost: text do 60 znaků bez řídicích znaků (id jako znacka-Na, taxon-Psovití), ne hádaná položka sama
    assert.equal(Stats.cleanAnswer(answer({ wrongId: 'taxon-Psovití' })).w, 'taxon-Psovití');
    assert.equal('w' in Stats.cleanAnswer(answer({ wrongId: 'x'.repeat(61) })), false);
    assert.equal('w' in Stats.cleanAnswer(answer({ wrongId: 'a\nb' })), false);
    assert.equal('w' in Stats.cleanAnswer(answer({ wrongId: 'Q213' })), false);
    assert.equal('w' in Stats.cleanAnswer(answer({ wrongId: null })), false);
});

test('fronta: patří jednomu účtu, stejná otázka jen jednou, nejvýš QUEUE_MAX', () => {
    const storage = memoryStorage();
    assert.equal(Stats.record(storage, null, answer()), 0, 'bez účtu se nesbírá');
    assert.equal(Stats.record(storage, 'u-1', answer({ itemId: 'Q0' })), 0, 'neplatná odpověď se nezapíše');
    assert.equal(Stats.record(storage, 'u-1', answer()), 1);
    assert.equal(Stats.record(storage, 'u-1', answer({ correct: true })), 1, 'stejná otázka podruhé ne');
    assert.equal(Stats.record(storage, 'u-1', answer({ variant: 'typed' })), 2, 'jiný způsob odpovídání je jiná otázka');
    assert.equal(Stats.pending(storage, 'u-1'), 2);
    assert.equal(Stats.pending(storage, 'u-2'), 0);
    // jiný účet: fronta předchozího se zahodí
    assert.equal(Stats.record(storage, 'u-2', answer()), 1);
    assert.equal(Stats.pending(storage, 'u-1'), 0);
    for (let i = 1; i <= Stats.QUEUE_MAX + 5; i++) Stats.record(storage, 'u-2', answer({ itemId: `Q${1000 + i}` }));
    assert.equal(Stats.pending(storage, 'u-2'), Stats.QUEUE_MAX);
    assert.equal(Stats.readQueue(storage).list.at(-1).q, `Q${1000 + Stats.QUEUE_MAX + 5}`, 'zahodí se nejstarší');
    // poškozená fronta = prázdná
    storage.setItem(Stats.QUEUE_KEY, '{nesmysl');
    assert.deepEqual(Stats.readQueue(storage), { user: null, list: [] });
    // úložiště, které hází (soukromý režim): nic se nestane
    const broken = { getItem: () => { throw new Error('zakázáno'); }, setItem: () => { throw new Error('zakázáno'); }, removeItem: () => {} };
    assert.equal(Stats.record(broken, 'u-1', answer()), 1);
});

test('flush: dávky po BATCH_MAX, jedna dávka = jedno volání; síťová chyba nechá frontu, odmítnutí ji zahodí', async () => {
    Stats.reset();
    const storage = memoryStorage();
    for (let i = 1; i <= 45; i++) Stats.record(storage, 'u-1', answer({ itemId: `Q${i}` }));
    const calls = [];
    const sent = await Stats.flush({ user: 'u-1', storage, send: async (list) => { calls.push(list.length); return list.length; }, maxBatches: 2 });
    assert.deepEqual(calls, [Stats.BATCH_MAX, Stats.BATCH_MAX]);
    assert.equal(sent, 40);
    assert.equal(Stats.pending(storage, 'u-1'), 5);
    // cizí účet frontu neodešle
    assert.equal(await Stats.flush({ user: 'u-2', storage, send: async () => { throw new Error('nemá se volat'); } }), 0);
    // bez sítě (status chybí) zůstane vše
    const offline = Object.assign(new Error('offline'), { status: undefined });
    assert.equal(await Stats.flush({ user: 'u-1', storage, send: async () => { throw offline; } }), 0);
    assert.equal(Stats.pending(storage, 'u-1'), 5);
    // databáze statistiky neumí (null): fronta počká
    assert.equal(await Stats.flush({ user: 'u-1', storage, send: async () => null }), 0);
    assert.equal(Stats.pending(storage, 'u-1'), 5);
    // odmítnutí (400) dávku zahodí
    assert.equal(await Stats.flush({ user: 'u-1', storage, send: async () => { throw Object.assign(new Error('Příliš mnoho'), { status: 400 }); } }), 0);
    assert.equal(Stats.pending(storage, 'u-1'), 0);
    assert.equal(storage.getItem(Stats.QUEUE_KEY), null, 'prázdná fronta se z úložiště smaže');
});

test('flush: souběžná volání sdílí jedno odesílání a odpovědi přibylé během odesílání zůstanou', async () => {
    Stats.reset();
    const storage = memoryStorage();
    Stats.record(storage, 'u-1', answer({ itemId: 'Q1' }));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const send = async (list) => { calls++; await gate; return list.length; };
    const first = Stats.flush({ user: 'u-1', storage, send, maxBatches: 1 });
    const second = Stats.flush({ user: 'u-1', storage, send, maxBatches: 1 });
    Stats.record(storage, 'u-1', answer({ itemId: 'Q2' }));
    release();
    assert.equal(await first, 1);
    assert.equal(await second, 1);
    assert.equal(calls, 1);
    assert.deepEqual(Stats.readQueue(storage).list.map(entry => entry.q), ['Q2']);
});

test('souhrn tématu: platí den, poškozené a nesmyslné řádky se zahodí', () => {
    Stats.reset();
    const storage = memoryStorage();
    const now = Date.UTC(2026, 10, 7, 12);
    assert.equal(Stats.topicIndex(storage, 'zemepis', now), null);
    Stats.saveTopic(storage, 'zemepis', [['Q213', 'name', 'c', 54, 23], ['Q213', 'name', 't', 30, 3], ['Q39', 'location', 'c', 40, 40], ['Q1', 'name', 'c', 10, 20], ['nesmysl', 'name', 'c', 50, 1], ['Q2', 'name', 'x', 50, 1], 'řádek'], now);
    const index = Stats.topicIndex(storage, 'zemepis', now + 1000);
    assert.deepEqual([...index.keys()].sort(), ['Q213', 'Q39']);
    assert.deepEqual(Stats.statFor(index, 'Q213', 'name', 'choices'), { shown: 54, correct: 23 });
    assert.deepEqual(Stats.statFor(index, 'Q213', 'name', 'typed'), { shown: 30, correct: 3 });
    assert.equal(Stats.statFor(index, 'Q213', 'location', 'choices'), null, 'jiný druh otázky');
    assert.equal(Stats.statFor(index, 'Q999', 'name', 'choices'), null);
    assert.equal(Stats.topicIndex(storage, 'zemepis', now + DAY + 1), null, 'starší než den neplatí');
    assert.equal(Stats.topicIndex(storage, 'zemepis', now - 5 * 60 * 1000), null, 'záznam z budoucnosti neplatí');
    storage.setItem(`${Stats.CACHE_PREFIX}historie`, 'nesmysl');
    assert.equal(Stats.topicIndex(storage, 'historie', now), null);
});

test('refresh: stáhne jen chybějící nebo starý souhrn, jedno stažení naráz, po chybě pauza', async () => {
    Stats.reset();
    const storage = memoryStorage();
    const now = Date.UTC(2026, 10, 7, 12);
    let calls = 0;
    const fetchRows = async () => { calls++; return [['Q213', 'name', 'c', 54, 23]]; };
    const [a, b] = await Promise.all([Stats.refresh('zemepis', { storage, fetchRows, now }), Stats.refresh('zemepis', { storage, fetchRows, now })]);
    assert.equal(a, true);
    assert.equal(b, true);
    assert.equal(calls, 1, 'souběžná volání = jedno stažení');
    assert.equal(await Stats.refresh('zemepis', { storage, fetchRows, now: now + 60000 }), false, 'čerstvý souhrn se nestahuje');
    assert.equal(calls, 1);
    assert.equal(await Stats.refresh('zemepis', { storage, fetchRows, now: now + DAY + 1 }), true, 'po dni znovu');
    assert.equal(calls, 2);
    // chyba sítě: další pokus nejdřív za RETRY_MS
    let failures = 0;
    const failing = async () => { failures++; throw new Error('offline'); };
    assert.equal(await Stats.refresh('historie', { storage, fetchRows: failing, now }), false);
    assert.equal(await Stats.refresh('historie', { storage, fetchRows: failing, now: now + 60000 }), false);
    assert.equal(failures, 1);
    assert.equal(await Stats.refresh('historie', { storage, fetchRows: failing, now: now + Stats.RETRY_MS + 1 }), false);
    assert.equal(failures, 2);
    // databáze statistiky neumí (null): nic se neuloží
    assert.equal(await Stats.refresh('chemie', { storage, fetchRows: async () => null, now }), false);
    assert.equal(Stats.topicIndex(storage, 'chemie', now), null);
    assert.equal(await Stats.refresh('Zeměpis', { storage, fetchRows, now }), false, 'neplatné téma');
});

test('lineFor: přirozená čeština, jen od 20 odpovědí', () => {
    const nb = ' ';
    assert.equal(Stats.lineFor({ shown: 54, correct: 23 }), `Správně odpovědělo 43${nb}% hráčů`);
    assert.equal(Stats.lineFor({ shown: 54, correct: 23 }, 'typed'), `Správně napsalo 43${nb}% hráčů`);
    assert.equal(Stats.lineFor({ shown: 19, correct: 5 }), '');
    assert.equal(Stats.lineFor(null), '');
    assert.equal(Stats.lineFor({ shown: 40, correct: 0 }), 'Správně zatím neodpověděl nikdo z hráčů');
    assert.equal(Stats.lineFor({ shown: 40, correct: 0 }, 'typed'), 'Správnou odpověď zatím nenapsal nikdo z hráčů');
    assert.equal(Stats.lineFor({ shown: 40, correct: 40 }), 'Správně odpověděli všichni hráči');
    assert.equal(Stats.lineFor({ shown: 1000, correct: 3 }), `Správně odpovědělo méně než 1${nb}% hráčů`);
    assert.equal(Stats.lineFor({ shown: 1000, correct: 996 }), `Správně odpovědělo víc než 99${nb}% hráčů`);
    assert.match(Stats.sampleText({ shown: 1234, correct: 3 }), /^Podle 1\s234 odpovědí hráčů s účtem$/);
});

test('kalibrace: známá položka s úspěšností pod 15 % (n ≥ 50) méně často, zkušenému méně často i ta, kterou zná skoro každý', () => {
    Stats.reset();
    const storage = memoryStorage();
    const now = Date.now();
    Stats.saveTopic(storage, 'zemepis', [
        ['Q1', 'name', 'c', 60, 5], // 8 %: známá → 0,35
        ['Q2', 'name', 'c', 30, 1], ['Q2', 'location', 'c', 30, 1], // součet přes druhy otázek 60 / 2
        ['Q3', 'name', 'c', 40, 2], // jen 40 odpovědí: bez změny
        ['Q4', 'name', 'c', 200, 198], // 99 %
        ['Q5', 'name', 't', 200, 2], // psaní se do kalibrace nepočítá
        ['Q6', 'name', 'c', 100, 50]
    ], now);
    const index = Stats.topicIndex(storage, 'zemepis', now);
    const known = (q) => ({ q, k: 1, c: 'stat' });
    assert.equal(Stats.weightFor(known('Q1'), index), Stats.CALIBRATION.hardWeight);
    assert.equal(Stats.weightFor(known('Q2'), index), Stats.CALIBRATION.hardWeight);
    assert.equal(Stats.weightFor({ q: 'Q1', k: 0 }, index), 1, 'méně známá položka se nemění');
    assert.equal(Stats.weightFor(known('Q3'), index), 1, 'málo odpovědí');
    assert.equal(Stats.weightFor(known('Q4'), index, { level: 5 }), 1, 'začátečník dostává i snadné');
    assert.equal(Stats.weightFor(known('Q4'), index, { level: 20 }), Stats.CALIBRATION.easyWeight);
    assert.equal(Stats.weightFor(known('Q5'), index, { level: 50 }), 1);
    assert.equal(Stats.weightFor(known('Q6'), index, { level: 50 }), 1);
    assert.equal(Stats.weightFor(known('Q999'), index), 1);
    assert.equal(Stats.weigher(null), null, 'bez souhrnu se neváží');
    assert.equal(Stats.weigher(new Map()), null);
    assert.equal(Stats.weigher(index, { level: 20 })(known('Q4')), Stats.CALIBRATION.easyWeight);
});

test('pickItem: váhy jen uvnitř kategorie; bez vah stejný výsledek jako dřív (losování ze semínka)', () => {
    const items = [
        { q: 'Q1', c: 'stat', k: 1 }, { q: 'Q2', c: 'stat', k: 1 }, { q: 'Q3', c: 'stat', k: 1 }, { q: 'Q4', c: 'stat', k: 1 },
        { q: 'Q10', c: 'mesto', k: 1 }, { q: 'Q11', c: 'mesto', k: 1 }
    ];
    const keys = ['stat', 'mesto'];
    // stejné semínko: bez vah i s váhou 1 všem stejná položka (dnešní otázka a výzvy se nemění)
    for (let i = 0; i < 50; i++) {
        const seed = `den-${i}`;
        const plain = Core.pickItem(items, Core.createSeededRandom(seed), [], keys);
        const ones = Core.pickItem(items, Core.createSeededRandom(seed), [], keys, () => 1);
        assert.equal(ones.q, plain.q);
    }
    // vážený los: položka s váhou 0,35 vyjde zhruba 0,35/(3 + 0,35) ≈ 10 % v kategorii (rovnoměrně 25 %)
    const rng = Core.createSeededRandom('kalibrace');
    const counts = {};
    const weight = (item) => (item.q === 'Q1' ? 0.35 : 1);
    for (let i = 0; i < 8000; i++) { const item = Core.pickItem(items, rng, [], keys, weight); counts[item.q] = (counts[item.q] || 0) + 1; }
    const stat = ['Q1', 'Q2', 'Q3', 'Q4'].reduce((sum, q) => sum + (counts[q] || 0), 0);
    const share = counts.Q1 / stat;
    assert.ok(share > 0.07 && share < 0.14, `podíl Q1 ${share}`);
    assert.ok(counts.Q1 > 0, 'položka nevypadne úplně');
    const cities = (counts.Q10 || 0) + (counts.Q11 || 0);
    assert.ok(Math.abs(cities / 8000 - 0.5) < 0.05, 'kategorie se losuje dál rovnoměrně');
    // pickWeighted: nekladné a chybné váhy = 1
    assert.equal(Core.pickWeighted(['a', 'b'], () => NaN, () => 0.99), 'b');
    assert.equal(Core.pickWeighted(['a', 'b'], (x) => (x === 'a' ? -5 : 1), () => 0.4), 'a');
});

test('podezřelé otázky: popisky možností a očištění řádků ze serveru', () => {
    const lookup = (id) => ({ Q39: 'Švýcarsko' })[id] || null;
    assert.equal(Stats.optionLabel('Q39', lookup), 'Švýcarsko');
    assert.equal(Stats.optionLabel('Q40', lookup), 'Q40');
    assert.equal(Stats.optionLabel('stoleti-14'), '14. století');
    assert.equal(Stats.optionLabel('stoleti--3'), '3. století př. n. l.');
    assert.equal(Stats.optionLabel('desetileti-1960'), '1960. léta');
    assert.equal(Stats.optionLabel('znacka-Na'), 'Na');
    assert.equal(Stats.optionLabel('taxon-Psovití'), 'Psovití');
    const rows = Stats.cleanSuspicious([
        { topic: 'zemepis', item_id: 'Q213', kind: 'name', variant: 'choices', shown: '80', correct: 10, top_wrong: 'Q39', top_wrong_count: 50, reason: 'mate' },
        { topic: 'zemepis', item_id: 'Q213', kind: 'name', variant: 'typed', shown: 60, correct: 1, top_wrong: null, top_wrong_count: 0, reason: 'cokoli' },
        { topic: '<b>', item_id: 'Q1', kind: 'name', variant: 'choices', shown: 60, correct: 1 },
        null
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { topic: 'zemepis', itemId: 'Q213', kind: 'name', variant: 'choices', shown: 80, correct: 10, topWrong: 'Q39', topWrongCount: 50, reason: 'mate' });
    assert.equal(rows[1].reason, 'nizka');
    assert.equal(rows[1].topWrong, null);
    assert.equal(Stats.kindLabel('century'), 'století');
    assert.equal(Stats.kindLabel('ordering'), 'ordering', 'neznámý druh tak, jak je');
    assert.equal(Stats.kindLabel('constructor'), 'constructor', 'ne vlastnost objektu');
    assert.equal(Stats.percentOf(1, 3), 33);
    assert.equal(Stats.percentOf(1, 0), 0);
});

test('app.js: váhy dostane jen losování bez semínka (trénink), dnešní otázky a výzvy ne', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
    const calls = source.split('\n').filter(line => /\bpickItem\(/.test(line));
    const weighted = calls.filter(line => /answerStatsWeigher/.test(line));
    assert.equal(weighted.length, 1, 'kalibrace je zapojená právě jednou');
    assert.match(weighted[0], /pickItem\(playableItems\(ctx\), Math\.random,/);
    for (const line of calls.filter(other => !weighted.includes(other))) assert.doesNotMatch(line, /Weigher|weightOf/, line.trim());
    // dnešní otázka a výzva losují ze semínka bez vah
    assert.ok(calls.some(line => /pickItem\(harder\.length/.test(line)));
    assert.ok(calls.some(line => /return pickItem\(pool\.length \? pool/.test(line)));
});
