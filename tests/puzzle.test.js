// Skládačka (puzzle.js): uložený stav, výběr další skládačky, tah a zapadnutí dílku, zaměnitelné dílky z pixelů, nápověda po dvou
// nepovedených pokusech, XP s denním stropem a sbírka, obrysy států (bez zámořských území, bez moc protáhlých a řídkých), rozložení
// desky se zásobníkem a kandidáti z dat témat Vlajky a Zeměpis. Obrazovky a tažení hlídá tests/e2e-puzzle.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Puzzle = require('../puzzle.js');
const Sound = require('../sound.js');

const ROOT = path.join(__dirname, '..');
const DAY = '2026-11-26';
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/countries.json'), 'utf8')).countries;
const shapes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mapa-tvary.json'), 'utf8')).shapes;

test('uložený stav: výchozí hodnoty, oprava nesmyslů, volba varianty a velikosti', () => {
    const empty = Puzzle.parse(null);
    assert.equal(empty.variant, 'flag');
    assert.equal(empty.size, 9);
    assert.deepEqual(empty.got, { flag: [], outline: [] });
    const odd = Puzzle.parse({ variant: 'nic', size: 7, got: { flag: ['Q1', 'Q1', 'x', 5], outline: 'Q2' }, xp: 999, day: 'včera', done: -3 });
    assert.equal(odd.variant, 'flag');
    assert.equal(odd.size, 9);
    assert.deepEqual(odd.got.flag, ['Q1']);
    assert.deepEqual(odd.got.outline, []);
    assert.equal(odd.xp, Puzzle.DAILY_XP_CAP);
    assert.equal(odd.day, '');
    assert.equal(odd.done, 0);
    const chosen = Puzzle.choose(empty, { variant: 'outline', size: 16 });
    assert.equal(chosen.variant, 'outline');
    assert.equal(chosen.size, 16);
    assert.equal(Puzzle.choose(chosen, { size: 5 }).size, 16, 'jen 4, 9 nebo 16 dílků');
});

test('výběr další skládačky: nejdřív nesložené známé, pak nesložené, nikdy hned ta samá', () => {
    const candidates = [{ id: 'Q1', known: true }, { id: 'Q2', known: true }, { id: 'Q3', known: false }, { id: 'Q4', known: false }];
    const state = Puzzle.parse({ got: { flag: ['Q1'] } });
    for (let seed = 1; seed < 30; seed++) assert.equal(Puzzle.pickNext(candidates, state, 'flag', seeded(seed)).id, 'Q2');
    const knownDone = Puzzle.parse({ got: { flag: ['Q1', 'Q2'] } });
    for (let seed = 1; seed < 30; seed++) assert.ok(['Q3', 'Q4'].includes(Puzzle.pickNext(candidates, knownDone, 'flag', seeded(seed)).id));
    // Celá sbírka: cokoli mimo naposledy složené a mimo právě dohranou
    const all = Puzzle.parse({ got: { flag: ['Q1', 'Q2', 'Q3', 'Q4'] }, recent: { flag: ['Q1', 'Q2'] } });
    for (let seed = 1; seed < 30; seed++) assert.ok(['Q3', 'Q4'].includes(Puzzle.pickNext(candidates, all, 'flag', seeded(seed)).id));
    for (let seed = 1; seed < 30; seed++) assert.equal(Puzzle.pickNext(candidates, all, 'flag', seeded(seed), 'Q3').id, 'Q4');
    assert.equal(Puzzle.pickNext([{ id: 'Q9' }], all, 'flag', Math.random, 'Q9').id, 'Q9', 'jediná možnost se zopakuje');
    assert.equal(Puzzle.pickNext([], all, 'flag'), null);
});

test('tip: čtyři různé možnosti, právě jedna správná, přednostně ze stejného světadílu', () => {
    const list = [
        { id: 'Q1', name: 'Francie', continent: 'EU' }, { id: 'Q2', name: 'Itálie', continent: 'EU' }, { id: 'Q3', name: 'Rakousko', continent: 'EU' },
        { id: 'Q4', name: 'Belgie', continent: 'EU' }, { id: 'Q5', name: 'Japonsko', continent: 'AS' }, { id: 'Q6', name: 'Peru', continent: 'SA' }
    ];
    for (let seed = 1; seed < 20; seed++) {
        const options = Puzzle.guessOptions(list[0], list, seeded(seed));
        assert.equal(options.length, 4);
        assert.equal(new Set(options.map(option => option.id)).size, 4);
        assert.equal(options.filter(option => option.correct).length, 1);
        assert.ok(options.every(option => ['Q1', 'Q2', 'Q3', 'Q4'].includes(option.id)), 'tři ze stejného světadílu');
    }
    const few = Puzzle.guessOptions(list[4], list, seeded(3));
    assert.equal(few.length, 4, 'chybějící doplní jiné světadíly');
});

test('tah: dílek zapadne jen na své místo (nebo stejně vypadající), jinak se vrátí a po dvou pokusech ukáže místo', () => {
    let game = Puzzle.createGame({ variant: 'flag', size: 4, item: { id: 'Q213', name: 'Česko' }, groups: [0, 1, 2, 2], rng: seeded(5) });
    assert.equal(game.side, 2);
    assert.deepEqual([...game.tray].sort(), [0, 1, 2, 3]);
    assert.notDeepEqual(game.tray, [0, 1, 2, 3], 'zásobník není seřazený');
    let step = Puzzle.place(game, 0, 1);
    assert.equal(step.result, 'wrong');
    assert.equal(step.game.moves, 1);
    assert.deepEqual(Puzzle.hintFor(step.game, 0), [], 'po jednom pokusu ještě bez nápovědy');
    step = Puzzle.place(step.game, 0, 2);
    assert.deepEqual(Puzzle.hintFor(step.game, 0), [0], 'po dvou pokusech nápověda');
    step = Puzzle.place(step.game, 0, 0);
    assert.equal(step.result, 'placed');
    game = step.game;
    assert.equal(Puzzle.placedCount(game), 1);
    assert.equal(Puzzle.place(game, 0, 3).result, 'none', 'položený dílek se už nehne');
    assert.equal(Puzzle.place(game, 1, 0).result, 'taken');
    // Dílky 2 a 3 vypadají stejně: dílek 3 smí na místo 2
    step = Puzzle.place(game, 3, 2);
    assert.equal(step.result, 'placed');
    step = Puzzle.place(step.game, 2, 3);
    assert.equal(step.result, 'placed');
    assert.equal(step.game.done, false);
    step = Puzzle.place(step.game, 1, 1);
    assert.equal(step.game.done, true);
    assert.equal(step.game.moves, 6);
    assert.equal(Puzzle.place(step.game, 1, 1).result, 'none');
});

test('tip jde jen jednou a jen před složením', () => {
    let game = Puzzle.createGame({ variant: 'outline', size: 4, item: { id: 'Q1' }, rng: seeded(2) });
    assert.ok(Puzzle.canGuess(game));
    game = Puzzle.guess(game, { id: 'Q1', name: 'X', correct: true });
    assert.deepEqual(game.guess, { id: 'Q1', name: 'X', correct: true });
    assert.equal(Puzzle.canGuess(game), false);
    assert.equal(Puzzle.guess(game, { id: 'Q2', name: 'Y', correct: false }).guess.id, 'Q1');
});

test('konec: sbírka, XP podle počtu dílků, bonus za tip a denní strop', () => {
    const done = (size, guessed = false, id = 'Q213') => ({ variant: 'flag', size, item: { id }, guess: guessed ? { correct: true } : null, done: true });
    let state = Puzzle.parse({});
    let result = Puzzle.finish(state, done(9, true), DAY);
    assert.equal(result.fresh, true);
    assert.equal(result.xp.total, Puzzle.SIZE_XP[9] + Puzzle.GUESS_XP);
    assert.deepEqual(result.xp.parts.map(part => part.label), ['za složení (9 dílků)', 'za uhodnutí předem']);
    assert.deepEqual(result.state.got.flag, ['Q213']);
    result = Puzzle.finish(result.state, done(4), DAY);
    assert.equal(result.fresh, false, 'stejná vlajka podruhé do sbírky nepřibude');
    assert.equal(result.xp.parts[0].label, 'za složení (4 dílky)');
    assert.equal(result.state.got.flag.length, 1);
    state = result.state;
    for (let i = 0; i < 10; i++) state = Puzzle.finish(state, done(16, false, `Q${100 + i}`), DAY).state;
    assert.equal(state.xp, Puzzle.DAILY_XP_CAP, 'strop');
    result = Puzzle.finish(state, done(16, false, 'Q500'), DAY);
    assert.equal(result.xp.total, 0);
    assert.match(result.xp.note, /vyčerpaný – sbírka roste dál/);
    assert.equal(result.state.got.flag.length, 12, 'sbírka roste i po stropu');
    assert.equal(Puzzle.finish(state, done(16), '2026-11-27').xp.total, Puzzle.SIZE_XP[16], 'nový den, nový strop');
    assert.equal(Puzzle.xpLeftToday(state, DAY), 0);
    assert.deepEqual(Puzzle.collection(result.state, 'flag', ['Q213', 'Q100', 'Q999']), { have: 2, total: 3, full: false });
    assert.ok(result.state.recent.flag.length <= Puzzle.RECENT);
});

test('zaměnitelné dílky z pixelů: stejné pruhy ano, i drobný rozdíl ne', () => {
    const side = 2, S = 4;
    const width = side * S;
    const pixels = new Uint8ClampedArray(width * width * 4);
    const paint = (x, y, [r, g, b, a = 255]) => { const at = (y * width + x) * 4; pixels.set([r, g, b, a], at); };
    // Horní řada bílá (průhledná = bílá), dolní červená; v dílku 3 jedna modrá tečka
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) paint(x, y, y < S ? (x < S ? [255, 255, 255] : [0, 0, 0, 0]) : [215, 20, 26]);
    assert.deepEqual(Puzzle.pieceGroups(pixels, side, S), [0, 0, 2, 2]);
    paint(width - 1, width - 1, [17, 69, 126]);
    assert.deepEqual(Puzzle.pieceGroups(pixels, side, S), [0, 0, 2, 3]);
});

test('obrys státu: hlavní území bez vzdálených ostrovů; malé, protáhlé a řídké se nepoužijí', () => {
    const france = Puzzle.outlineArt(shapes.Q142);
    assert.ok(france, 'Francie');
    assert.ok(france.km2 > 500000 && france.km2 < 600000, `Francie bez zámoří: ${france.km2} km²`);
    assert.ok(france.width / france.height > 0.8 && france.width / france.height < 1.25);
    assert.match(france.path, /^M[\d.]+ [\d.]+L/);
    const czechia = Puzzle.outlineArt(shapes.Q213);
    assert.ok(czechia.width === 1000 && czechia.height < 700, 'Česko je na šířku');
    assert.equal(Puzzle.outlineArt(shapes.Q298), null, 'Chile je moc protáhlé');
    assert.equal(Puzzle.outlineArt(shapes.Q826), null, 'Maledivy');
    assert.equal(Puzzle.outlineArt(shapes.Q235), null, 'Monako je moc malé');
    assert.equal(Puzzle.outlineArt('~1,2,3,4'), null, 'čára (řeka) není obrys');
    assert.equal(Puzzle.outlineArt(''), null);
    const portugal = Puzzle.outlineArt(shapes.Q45);
    assert.ok(portugal.km2 < 95000, `Portugalsko bez Azor a Madeiry: ${portugal.km2} km²`);
    // Deska má poměr stran nejvýš 1 : 2
    for (const q of ['Q20', 'Q30', 'Q159', 'Q241', 'Q252']) {
        const art = Puzzle.outlineArt(shapes[q]);
        if (art) assert.ok(art.width / art.height >= 0.49 && art.width / art.height <= 2.01, q);
    }
});

test('kandidáti: vlajky všech států a obrysy států Zeměpisu', () => {
    const vlajky = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/vlajky.json'), 'utf8')).items;
    const flags = Puzzle.flagCandidates(vlajky, countries);
    assert.equal(flags.length, Object.keys(countries).length - 1 >= 190 ? flags.length : 0);
    assert.ok(flags.length >= 190, `vlajek ${flags.length}`);
    assert.equal(new Set(flags.map(flag => flag.id)).size, flags.length, 'jedna vlajka na stát');
    const indonesia = flags.find(flag => flag.id === 'Q252');
    assert.equal(indonesia.name, 'Indonésie');
    assert.deepEqual(indonesia.facts, ['Stát v Asii · hlavní město Jakarta', 'Vlajka se užívá od roku 1945']);
    assert.ok(flags.every(flag => flag.image.file && flag.image.hash));
    const zemepis = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/zemepis.json'), 'utf8')).items;
    const outlines = Puzzle.outlineCandidates(zemepis, countries, shapes);
    assert.ok(outlines.length >= 140 && outlines.length < Object.keys(countries).length, `obrysů ${outlines.length}`);
    const czechia = outlines.find(outline => outline.id === 'Q213');
    assert.equal(czechia.name, 'Česko');
    assert.match(czechia.facts[0], /hlavní město Praha$/);
    assert.match(czechia.facts[1], /^Rozloha 78 \d{3} km²$/);
    assert.ok(outlines.filter(outline => outline.known).length > 80);
});

test('rozložení: deska se zásobníkem se vejde, užší obrázek dá zásobník vedle desky', () => {
    for (const [width, height] of [[336, 430], [366, 560], [296, 380]]) {
        for (const aspect of [3 / 2, 2, 1, 0.5, 0.8]) {
            for (const side of [2, 3, 4]) {
                const fit = Puzzle.layoutFor({ aspect, side, width, height });
                assert.ok(fit, `${width}×${height} ${aspect} ${side}`);
                const totalW = fit.dir === 'row' ? fit.board.w + 10 + fit.tray.w : Math.max(fit.board.w, fit.tray.w);
                const totalH = fit.dir === 'col' ? fit.board.h + 10 + fit.tray.h : Math.max(fit.board.h, fit.tray.h);
                assert.ok(totalW <= width + 1, `šířka ${totalW} > ${width} (${aspect}, ${side})`);
                assert.ok(totalH <= height + 1, `výška ${totalH} > ${height} (${aspect}, ${side})`);
                assert.ok(fit.board.w >= 120, `deska ${fit.board.w} (${aspect}, ${side})`);
                assert.ok(Math.abs(fit.cell.w - fit.piece.w * Puzzle.TRAY_SCALE) < 0.5);
            }
        }
    }
    assert.equal(Puzzle.layoutFor({ aspect: 3 / 2, side: 3, width: 336, height: 430 }).dir, 'col');
    assert.equal(Puzzle.layoutFor({ aspect: 0.5, side: 3, width: 336, height: 430 }).dir, 'row');
});

test('fakt po složení: krátce a česky', () => {
    assert.deepEqual(Puzzle.factsFor('flag', { f: { cap: 'Paříž', year: 1794 } }, 'EU'), ['Stát v Evropě · hlavní město Paříž', 'Vlajka se užívá od roku 1794']);
    assert.deepEqual(Puzzle.factsFor('flag', { f: { cap: 'Paříž' } }, ''), ['Hlavní město Paříž']);
    assert.deepEqual(Puzzle.factsFor('outline', { d: 'vnitrozemský stát ve střední Evropě', f: { cap: 'Vídeň', area: 83879 } }, 'EU'),
        ['Vnitrozemský stát ve střední Evropě · hlavní město Vídeň', 'Rozloha 83 879 km²']);
    assert.deepEqual(Puzzle.factsFor('outline', { f: {} }, 'OC'), ['Stát v Oceánii']);
});

test('zvuky a vibrace Skládačky existují, obrazovky nemají inline styly ani skripty a dílky jdou táhnout bez posouvání stránky', () => {
    const source = fs.readFileSync(path.join(ROOT, 'puzzle.js'), 'utf8');
    const played = [...source.matchAll(/sound\.play\((?:done \? )?'([a-zA-Z]+)'(?: : '([a-zA-Z]+)')?\)/g)].flatMap(match => [match[1], match[2]]).filter(Boolean);
    assert.ok(played.includes('snap') && played.includes('puzzle'));
    for (const name of played) assert.ok(Sound.SOUNDS[name], `zvuk ${name}`);
    for (const name of ['snap', 'puzzle']) assert.ok(name in Sound.VIBRATIONS, `vibrace ${name}`);
    assert.doesNotMatch(source, /style="/, 'bez inline stylů (CSP)');
    assert.doesNotMatch(source, /<script|on(click|load)=/i);
    assert.match(source, /data-pz-piece[^`]*touch-none/, 'dílek v zásobníku má touch-action: none');
    assert.ok(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes("'puzzle.js'"), 'puzzle.js v mezipaměti');
    assert.ok(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('<script src="puzzle.js" defer></script>'));
    assert.ok(fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8').includes("'./puzzle.js'"));
    const icons = fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8');
    for (const icon of ['puzzle', 'hand', 'circle-help', 'check', 'lightbulb', 'flag', 'map', 'shuffle', 'layers', 'sparkles', 'settings-2', 'arrow-right'])
        assert.ok(icons.includes(`"${icon}"`), `ikona ${icon}`);
});
