// Postup bonusových funkcí v účtu (bonus-sync.js): výměna telefonu, dvě zařízení souběžně (počítadla se sečtou přesně jednou, množiny
// se sjednotí, rekordy jsou maxima), opakované sloučení nic nezdvojí, souběžný zápis (odmítnutý podle verze) se sloučí znovu, víc zařízení
// než MAX_DEVICES, jiný účet na stejném zařízení, strop velikosti a odolnost proti poškozeným datům z účtu. Stavy jdou přes parse modulů.
const test = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../bonus-sync.js');
const Passport = require('../passport.js');
const Obor = require('../obor.js');
const Puzzle = require('../puzzle.js');
const Sorting = require('../sorting.js');
const Snack = require('../snack.js');
const Stats = require('../statistiky.js');

const USER = 'u-1';
const PARSE = { passport: Passport.parse, obor: Obor.parse, skladacka: Puzzle.parse, sorting: Sorting.parse, snack: Snack.parse, stats: Stats.parse, learned: (v) => v || {} };
let ids = 0;
// Zařízení: stavy modulů jako v localStorage + meta; server: dokument a číslo verze řádku (bonus_progress_save přijme jen stejnou verzi)
const device = (states = {}) => ({ meta: null, states: Object.fromEntries(Object.keys(PARSE).map(key => [key, PARSE[key](states[key])])) });
const server = () => ({ doc: null, rev: 0 });
const pull = (dev, srv, user = USER) => {
    const result = Sync.sync({ local: dev.states, remote: srv.doc, meta: dev.meta, user, now: 1000 + (ids++), newDevice: () => `dev${String(ids++).padStart(6, '0')}` });
    return result;
};
const commit = (dev, result) => {
    dev.states = Object.fromEntries(Object.entries(result.local).map(([key, value]) => [key, PARSE[key](JSON.parse(JSON.stringify(value)))]));
    dev.meta = JSON.parse(JSON.stringify(result.meta));
};
// Celé sloučení jako v app.js: načíst, sloučit, zapsat podmíněně podle verze, zapsat do zařízení
const run = (dev, srv, user = USER) => {
    const result = pull(dev, srv, user);
    if (result.upload) { srv.doc = JSON.parse(JSON.stringify(result.doc)); srv.rev += 1; }
    commit(dev, result);
    return result;
};
const answer = (dev, topic, correct, day = '2026-11-20', category = 'stat') => { dev.states.stats = Stats.parse(Stats.record(dev.states.stats, { topic, category, correct, mode: 'practice', hints: 0, ms: 4000 }, day)); };
const snack = (dev, correct, day = '2026-11-20') => { dev.states.snack = Snack.answer(dev.states.snack, correct, day).state; };
const learn = (dev, topic, id) => { const list = dev.states.learned[topic] || []; dev.states.learned = { ...dev.states.learned, [topic]: [...new Set([...list, id])] }; };

test('výměna telefonu: nové zařízení dostane razítka, poznané položky, obory, skládačky, Řazení dne, Jednohubku i Statistiky', () => {
    const srv = server();
    const old = device({
        learned: { zemepis: ['Q213', 'Q36'], biologie: ['Q144'] },
        passport: { stamps: { Q213: '2026-11-01', Q36: '' }, done: {}, seen: ['Q213', 'Q36'] },
        obor: { current: 'zemepis|c:stat', fields: { 'zemepis|c:stat': { cursor: 'Q36', at: 500, label: 'Státy' } }, seals: { 'biologie|savci': '2026-11-10' } },
        skladacka: { got: { flag: ['Q213'], outline: ['Q36'] }, done: 5, guessed: 2, day: '2026-11-20', xp: 12, recent: { flag: ['Q213'] }, daily: { '2026-11-20': { moves: 21, v: 'flag', id: 'Q213' } } },
        sorting: { games: 4, perfect: 1, cards: 24, daily: { '2026-11-19': { attempts: 2, spec: '' } }, day: '2026-11-20', xp: 8 },
        snack: { played: 10, correct: 8, streak: 3, best: 6, past: 6, day: '2026-11-20', xp: 20 }
    });
    for (let i = 0; i < 7; i++) answer(old, 'zemepis', i % 2 === 0);
    assert.equal(run(old, srv).upload, true);
    assert.equal(srv.rev, 1);
    const fresh = device();
    run(fresh, srv);
    const s = fresh.states;
    assert.deepEqual(s.learned, { zemepis: ['Q213', 'Q36'], biologie: ['Q144'] });
    assert.deepEqual(s.passport.stamps, { Q213: '2026-11-01', Q36: '' });
    assert.deepEqual(s.passport.seen.sort(), ['Q213', 'Q36'], 'razítka z účtu se nebouchají jako nová');
    assert.equal(s.obor.current, 'zemepis|c:stat');
    assert.equal(s.obor.fields['zemepis|c:stat'].cursor, 'Q36');
    assert.deepEqual(s.obor.seals, { 'biologie|savci': '2026-11-10' });
    assert.deepEqual(s.skladacka.got, { flag: ['Q213'], outline: ['Q36'] });
    assert.deepEqual([s.skladacka.done, s.skladacka.guessed, s.skladacka.xp], [5, 2, 12]);
    assert.deepEqual(s.skladacka.recent.flag, [], 'naposledy složené zůstávají v zařízení');
    assert.deepEqual(s.skladacka.daily, { '2026-11-20': { moves: 21, v: 'flag', id: 'Q213' } }, 'dohraná Skládačka dne už XP nevyplatí podruhé');
    assert.deepEqual(s.sorting.daily, { '2026-11-19': { attempts: 2, spec: '' } }, 'dohrané Řazení dne už XP nevyplatí podruhé');
    assert.deepEqual([s.sorting.games, s.sorting.perfect, s.sorting.cards], [4, 1, 24]);
    assert.deepEqual([s.snack.played, s.snack.correct, s.snack.best, s.snack.streak], [10, 8, 6, 0], 'série běží jen v zařízení, rekord se přenese');
    assert.equal(s.snack.past, 6, 'nová nejlepší série až nad rekordem z jiného zařízení');
    assert.deepEqual(s.stats.days, { '2026-11-20': [7, 4] });
    assert.deepEqual(s.stats.t, { zemepis: { stat: [7, 4] } });
    assert.equal(s.stats.ms.n, 7);
    // Opakování nic nezdvojí a do účtu se nic znovu nepíše
    assert.equal(run(fresh, srv).upload, false);
    assert.equal(run(old, srv).upload, false);
    assert.deepEqual(fresh.states.stats.days, { '2026-11-20': [7, 4] });
    assert.deepEqual(old.states.stats.days, { '2026-11-20': [7, 4] });
    assert.equal(srv.rev, 1);
});

test('dvě zařízení souběžně: počítadla se sečtou přesně jednou, množiny se sjednotí, nic se neztratí', () => {
    const srv = server();
    const a = device();
    const b = device();
    run(a, srv);
    run(b, srv);
    for (let round = 0; round < 3; round++) {
        answer(a, 'zemepis', true);
        answer(b, 'historie', false, '2026-11-21', 'statnik');
        snack(a, true);
        snack(b, true);
        learn(a, 'zemepis', `Q${100 + round}`);
        learn(b, 'historie', `Q${200 + round}`);
        a.states.skladacka = { ...a.states.skladacka, done: a.states.skladacka.done + 1, got: { ...a.states.skladacka.got, flag: [...a.states.skladacka.got.flag, `Q${300 + round}`] } };
        b.states.skladacka = { ...b.states.skladacka, done: b.states.skladacka.done + 2 };
        run(a, srv);
        run(b, srv);
    }
    run(a, srv);
    for (const dev of [a, b]) {
        const s = dev.states;
        assert.deepEqual(s.stats.days, { '2026-11-20': [3, 3], '2026-11-21': [3, 0] });
        assert.deepEqual(s.stats.t, { zemepis: { stat: [3, 3] }, historie: { statnik: [3, 0] } });
        assert.deepEqual(s.stats.m, { practice: [6, 3] });
        assert.equal(s.snack.played, 6);
        assert.equal(s.snack.correct, 6);
        assert.equal(s.skladacka.done, 9);
        assert.deepEqual(s.skladacka.got.flag, ['Q300', 'Q301', 'Q302']);
        assert.deepEqual(s.learned, { zemepis: ['Q100', 'Q101', 'Q102'], historie: ['Q200', 'Q201', 'Q202'] });
    }
    // Další sloučení už nic nemění
    const before = JSON.stringify(a.states);
    assert.equal(run(a, srv).upload, false);
    assert.equal(JSON.stringify(a.states), before);
});

test('souběžný zápis: zápis ke staré verzi server odmítne, nové sloučení s novým stavem účtu nic neztratí', () => {
    const srv = server();
    const a = device();
    const b = device();
    run(a, srv);
    run(b, srv);
    answer(a, 'zemepis', true);
    learn(a, 'zemepis', 'Q1');
    answer(b, 'zemepis', false);
    learn(b, 'zemepis', 'Q2');
    // Obě zařízení načtou účet ve stejné verzi; B zapíše první
    const fromA = pull(a, srv);
    const revA = srv.rev;
    const fromB = pull(b, srv);
    srv.doc = JSON.parse(JSON.stringify(fromB.doc)); srv.rev += 1; commit(b, fromB);
    // A zapisuje ke staré verzi: odmítnuto (bonus_progress_save vrátí null) → A sloučí znovu se současným účtem
    assert.notEqual(revA, srv.rev);
    assert.equal(fromA.upload, true);
    run(a, srv);
    run(b, srv);
    for (const dev of [a, b]) {
        assert.deepEqual(dev.states.stats.days, { '2026-11-20': [2, 1] });
        assert.deepEqual(dev.states.learned.zemepis.slice().sort(), ['Q1', 'Q2']);
    }
});

test('rekordy a data: dřívější den razítka vyhraje, nejlepší série je maximum, Řazení dne s méně pokusy, dnešní XP podle dne', () => {
    const srv = server();
    const a = device({
        passport: { stamps: { Q213: '2026-11-05', Q36: '2026-11-07' }, done: { EU: '2026-11-07' }, seen: ['Q213'] },
        snack: { played: 5, correct: 5, best: 9, past: 4, streak: 9, day: '2026-11-20', xp: 25 },
        sorting: { daily: { '2026-11-19': { attempts: 3, spec: '' } }, day: '2026-11-19', xp: 30 },
        skladacka: { daily: { '2026-11-19': { moves: 30, v: 'outline', id: 'Q36' } } }
    });
    const b = device({
        learned: { vlajky: ['Q101472'] },
        passport: { stamps: { Q213: '2026-11-02', Q30: '2026-11-03' }, done: { EU: '' }, filled: { zemepis: true, vlajky: true } },
        snack: { played: 2, correct: 1, best: 3, past: 3, day: '2026-11-20', xp: 10 },
        sorting: { daily: { '2026-11-19': { attempts: 1, spec: '' }, '2026-11-20': { attempts: 2, spec: '' } }, day: '2026-11-20', xp: 5 },
        skladacka: { daily: { '2026-11-19': { moves: 18, v: 'outline', id: 'Q36' }, '2026-11-20': { moves: 25, v: 'flag', id: 'Q213' } } }
    });
    run(a, srv);
    run(b, srv);
    run(a, srv);
    for (const dev of [a, b]) {
        const s = dev.states;
        assert.deepEqual(s.passport.stamps, { Q213: '2026-11-02', Q36: '2026-11-07', Q30: '2026-11-03' });
        assert.deepEqual(s.passport.done, { EU: '' });
        assert.equal(s.snack.best, 9);
        assert.deepEqual(s.sorting.daily, { '2026-11-19': { attempts: 1, spec: '' }, '2026-11-20': { attempts: 2, spec: '' } });
        assert.deepEqual([s.sorting.day, s.sorting.xp], ['2026-11-20', 5], 'strop dnešních XP podle pozdějšího dne');
        assert.deepEqual(s.skladacka.daily, { '2026-11-19': { moves: 18, v: 'outline', id: 'Q36' }, '2026-11-20': { moves: 25, v: 'flag', id: 'Q213' } }, 'Skládačka dne: sjednocení dnů, méně tahů vyhraje');
        assert.deepEqual([s.snack.day, s.snack.xp], ['2026-11-20', 25], 've stejný den větší XP');
    }
    assert.equal(a.states.snack.streak, 9, 'běžící série zůstane v zařízení');
    assert.equal(a.states.snack.past, 4, 'vlastní rekord se neposouvá (oslava nové nejlepší série jednou)');
    assert.equal(b.states.snack.past, 9, 'na druhém zařízení je rekord jako skončená série');
    assert.ok(a.states.passport.seen.includes('Q30'), 'razítko z jiného zařízení je viděné');
    // B přidalo poznanou vlajku: pas na A ji zpětně doplní (filled se pro vlajky smaže)
    assert.equal(a.states.passport.filled.vlajky, undefined);
});

test('víc zařízení než MAX_DEVICES: starší díl se přičte do gone, součet sedí, a vrácené zařízení se nepočítá dvakrát', () => {
    const srv = server();
    const devices = Array.from({ length: Sync.MAX_DEVICES + 2 }, () => device());
    devices.forEach((dev, i) => { for (let n = 0; n <= i; n++) answer(dev, 'zemepis', true); run(dev, srv); });
    const total = devices.reduce((sum, _, i) => sum + i + 1, 0);
    const last = devices[devices.length - 1];
    run(last, srv);
    assert.equal(last.states.stats.days['2026-11-20'][0], total);
    assert.ok(Object.keys(srv.doc.dev).length <= Sync.MAX_DEVICES);
    assert.ok(srv.doc.goneIds.length >= 2);
    // Nejstarší zařízení se vrátí, zahraje jednu odpověď a sloučí se
    const first = devices[0];
    answer(first, 'zemepis', false);
    run(first, srv);
    run(last, srv);
    assert.equal(first.states.stats.days['2026-11-20'][0], total + 1);
    assert.equal(last.states.stats.days['2026-11-20'][0], total + 1);
    // Všechna zařízení se dorovnají na stejný součet
    devices.forEach(dev => run(dev, srv));
    devices.forEach(dev => assert.equal(dev.states.stats.days['2026-11-20'][0], total + 1));
});

test('jiný účet na stejném zařízení: všechno v zařízení je jeho vlastní díl (jako XP v syncProgress)', () => {
    const one = server();
    const two = server();
    const other = device();
    answer(other, 'zemepis', true);
    answer(other, 'zemepis', true);
    run(other, one);
    const dev = device();
    run(dev, one);
    assert.equal(dev.states.stats.days['2026-11-20'][0], 2);
    run(dev, two, 'u-2');
    const fresh = device();
    run(fresh, two, 'u-2');
    assert.equal(fresh.states.stats.days['2026-11-20'][0], 2, 'u-2 nedostane nic navíc ani nic neztratí');
});

test('prázdné zařízení a prázdný účet: nic se nezapisuje', () => {
    const srv = server();
    const dev = device();
    const result = run(dev, srv);
    assert.equal(result.upload, false);
    assert.equal(srv.rev, 0);
});

test('strop velikosti: obrovský dokument se nezapíše, zařízení si sloučená data nechá', () => {
    const srv = server();
    const big = device({ learned: Object.fromEntries(['zemepis', 'biologie', 'historie'].map((topic, t) => [topic, Array.from({ length: 15000 }, (_, i) => `Q${t}${String(i).padStart(7, '0')}`)])) });
    const result = run(big, srv);
    assert.equal(result.tooBig, true);
    assert.equal(result.upload, false);
    assert.equal(srv.rev, 0);
    assert.equal(big.states.learned.zemepis.length, 15000);
    // Malý dokument se vejde
    const small = device({ learned: { zemepis: Array.from({ length: 3000 }, (_, i) => `Q${i + 1}`) } });
    const ok = run(small, srv);
    assert.equal(ok.upload, true);
    assert.ok(Sync.bytes(JSON.stringify(ok.doc)) < Sync.LIMIT);
});

test('poškozená nebo podvržená data z účtu nic nerozbijí', () => {
    const evil = JSON.parse('{"v":1,"learned":{"__proto__":["Q1"],"constructor":["Q2"],"zemepis":["Q3",5,"<b>",null]},"passport":{"stamps":{"Q1":"zítra","Q2":"2026-01-01","x":"2026-01-01"},"done":{"XX":""}},'
        + '"obor":{"current":"nic","fields":{"zemepis|c:stat":{"cursor":{"a":1},"at":"x"},"__proto__":{}}},"skladacka":{"got":{"constructor":["Q5"],"flag":"Q1"},"daily":{"2026-11-02":{"moves":-1},"__proto__":{"moves":3},"2026-11-03":{"moves":4,"v":"<x>","id":"Q1 OR"}}},'
        + '"sorting":{"daily":{"2026-11-01":{"attempts":-3}}},"snack":{"best":1e99},"stats":{"x":{"a|b|c":[2,"<i>x</i>","y","2026-11-01"]}},'
        + '"dev":{"constructor":{"at":5,"c":{"stats":{"days":{"__proto__":[1,1],"2026-11-01":[1e20,"x"]}}}},"bad id!":{}},"gone":{"snack":{"played":-5}}}');
    const dev = device({ learned: { constructor: ['Q9'] } });
    const result = Sync.sync({ local: dev.states, remote: evil, meta: null, user: USER, newDevice: () => 'devevil1' });
    commit(dev, result);
    assert.equal(Object.getPrototypeOf(dev.states.learned), Object.prototype);
    assert.deepEqual(dev.states.learned.zemepis, ['Q3']);
    assert.deepEqual(dev.states.learned.constructor, ['Q9', 'Q2']);
    assert.deepEqual(dev.states.passport.stamps, { Q2: '2026-01-01' });
    assert.equal(Object.prototype.hasOwnProperty.call(dev.states.skladacka.got, 'constructor'), false, 'neznámá varianta Skládačky se v parse zahodí');
    assert.deepEqual(dev.states.skladacka.daily, { '2026-11-03': { moves: 4, v: '', id: '' } }, 'Skládačka dne: jen platné dny a tahy');
    assert.ok(dev.states.snack.best <= 1000000);
    assert.equal(dev.states.snack.played, 0);
    assert.ok(dev.states.stats.days['2026-11-01'][0] <= 1e9);
    assert.equal(Sync.stable(Sync.cleanDoc(result.doc)), Sync.stable(result.doc), 'vlastní dokument projde čištěním beze změny');
    assert.doesNotThrow(() => Sync.sync({ local: {}, remote: 'nesmysl', meta: 42, user: USER }));
    assert.doesNotThrow(() => Sync.sync({ local: { learned: null, stats: null }, remote: [], meta: { device: 'x' }, user: USER }));
});

test('chybějící modul: jeho část v účtu zůstane beze změny', () => {
    const srv = server();
    const a = device({ snack: { played: 4, correct: 3, best: 3 } });
    run(a, srv);
    const b = device();
    const result = Sync.sync({ local: { ...b.states, snack: null }, remote: srv.doc, meta: null, user: USER, newDevice: () => 'devnosnack' });
    assert.deepEqual(result.doc.snack, srv.doc.snack);
    assert.equal(result.local.snack, undefined);
    const own = result.doc.dev.devnosnack;
    assert.equal(own, undefined, 'zařízení bez počítadel se do dev nezapisuje');
});
