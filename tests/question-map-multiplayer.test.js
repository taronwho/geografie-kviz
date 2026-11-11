// Otázky „Ukaž na mapě“ ve hře pro víc hráčů (výzva, zápas turnaje; question-map.js): o otázce na mapě rozhoduje semínko otázky
// (stejně v obou zařízeních, bez Math.random a počítadla), asi desetina otázek, jen položky, které na mapu jdou; výzvy a turnaje
// starších verzí aplikace (semínko bez značky, turnaj před MULTIPLAYER_TOURNAMENTS_FROM) zůstanou bez mapy. Otázka na mapě má jednu
// (správnou) možnost, aby ji starší aplikace přijala jako uloženou otázku (zamrzlé otázky) a hráči měli stejnou otázku.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Dvě „zařízení“: modul načtený dvakrát zvlášť (žádný sdílený stav)
const freshMapQuestion = () => {
    delete require.cache[require.resolve('../question-map.js')];
    return require('../question-map.js');
};
const MapQuestion = freshMapQuestion();
const mapData = JSON.parse(read('data/mapa.json'));
const countries = JSON.parse(read('data/countries.json')).countries;
const zemepis = JSON.parse(read('data/zemepis.json'));
const biologie = JSON.parse(read('data/biologie.json'));
core.setCountries(countries);
const zemepisCtx = { topic: { id: 'zemepis' }, items: zemepis.items, countries };
const biologieCtx = { topic: { id: 'biologie' }, items: biologie.items, countries };

test('rozhodnutí podle semínka otázky: stejné na obou zařízeních, vlastní řada čísel (ne rng otázky)', () => {
    const other = freshMapQuestion();
    assert.notEqual(other, MapQuestion);
    const seeds = Array.from({ length: 400 }, (_, index) => `vyzva-ABC234-mh1x9.mapa:${index % 20}-${index}`);
    for (const seed of seeds) {
        assert.equal(MapQuestion.multiplayerDue(seed), other.multiplayerDue(seed), seed);
        assert.equal(MapQuestion.multiplayerDue(seed), MapQuestion.multiplayerDue(seed), 'opakovaně stejně');
        assert.equal(MapQuestion.multiplayerDue(seed), core.createSeededRandom(`${seed}:mapa`)() < 0.1, 'řada `<semínko>:mapa`');
    }
    // Rng otázky (výběr položky a možností) se nemění: rozhodnutí ho nevolá
    const rng = core.createSeededRandom('vyzva-ABC234-mh1x9.mapa:3');
    const expected = core.createSeededRandom('vyzva-ABC234-mh1x9.mapa:3');
    MapQuestion.multiplayerDue('vyzva-ABC234-mh1x9.mapa:3');
    assert.deepEqual([rng(), rng(), rng()], [expected(), expected(), expected()]);
    for (const bad of ['', null, undefined, 12]) assert.equal(MapQuestion.multiplayerDue(bad), false);
});

test('podíl: asi desetina otázek (výzvy i kola turnaje), ne víc', () => {
    assert.equal(MapQuestion.MULTIPLAYER_SHARE, 0.1);
    assert.equal(MapQuestion.multiplayerShare, 0.1);
    let due = 0;
    let total = 0;
    for (let challengeNo = 0; challengeNo < 2000; challengeNo++) {
        for (let index = 0; index < 10; index++) {
            total += 1;
            if (MapQuestion.multiplayerDue(`vyzva-${String(challengeNo).padStart(6, '0')}-lx${challengeNo.toString(36)}.mapa:${index}`)) due += 1;
        }
    }
    assert.ok(Math.abs(due / total - 0.1) < 0.01, `výzvy: ${due}/${total}`);
    let tour = 0;
    for (let n = 0; n < 1000; n++) for (let round = 1; round <= 7; round++) for (let index = 0; index < 10; index++) if (MapQuestion.multiplayerDue(`${(n * 7919).toString(16).padStart(12, 'a')}-r${round}:${index}`)) tour += 1;
    assert.ok(Math.abs(tour / 70000 - 0.1) < 0.01, `turnaje: ${tour}/70000`);
    // Podíl jde v testech změnit (0 = jen obyčejné otázky, 1 = každá vhodná)
    assert.equal(MapQuestion.multiplayerDue('x:0', 0), false);
    assert.equal(MapQuestion.multiplayerDue('x:0', 1), true);
});

test('jen hry, které to nesou: výzva se značkou v semínku, turnaj od týdne MULTIPLAYER_TOURNAMENTS_FROM', () => {
    assert.equal(MapQuestion.MULTIPLAYER_SEED_MARK, '.mapa');
    assert.equal(MapQuestion.seedAllowsMaps('vyzva-ABC234-mh1x9.mapa'), true);
    // Výzvy založené starší verzí aplikace a semínka z testů: bez mapy
    for (const seed of ['vyzva-ABC234-mh1x9', 'vyzva-ZZZZZZ-zmena', 'cisla-vyzva', 'seed-abc-r1', 'vyzva-ABC.mapa-x', '', null, undefined]) assert.equal(MapQuestion.seedAllowsMaps(seed), false, String(seed));
    assert.equal(MapQuestion.MULTIPLAYER_TOURNAMENTS_FROM, '2026-11-16');
    assert.equal(MapQuestion.tournamentAllowsMaps({ week_start: '2026-11-16' }), true);
    assert.equal(MapQuestion.tournamentAllowsMaps({ week_start: '2027-01-04' }), true);
    for (const tour of [{ week_start: '2026-11-09' }, { week_start: '2026-10-05' }, { week_start: '' }, { week_start: 'x' }, {}, null]) assert.equal(MapQuestion.tournamentAllowsMaps(tour), false, JSON.stringify(tour));
    // Semínko nové výzvy (social.js) má značku a projde kontrolou semínka v databázi i v question_snapshot_claim
    const social = read('social.js');
    assert.match(social, /const CHALLENGE_SEED_MARK = '\.mapa';/);
    assert.match(social, /seed: `vyzva-\$\{id\}-\$\{Date\.now\(\)\.toString\(36\)\}\$\{CHALLENGE_SEED_MARK\}`/);
    const seed = `vyzva-ABC234-${Date.now().toString(36)}.mapa`;
    assert.match(seed, /^[A-Za-z0-9._-]{1,80}$/, 'challenges_seed_format');
    assert.equal(/^(.+)-r([0-9]{1,2}):([0-9]{1,2})$/.test(`${seed}:3`), false, 'není semínko zápasu turnaje');
    assert.deepEqual(/^(.+):([0-9]{1,2})$/.exec(`${seed}:3`).slice(1), [seed, '3'], 'semínko výzvy a pořadí otázky');
});

test('otázka na mapě jen z položky, která na mapu jde; jinak zůstane obyčejná (null)', () => {
    const cities = zemepis.items.filter(item => item.c === 'mesto' && item.k === 1);
    const built = cities.map(item => [item, MapQuestion.multiplayerQuestion(item, zemepisCtx, mapData)]).filter(([, question]) => question);
    assert.ok(built.length > 50, 'známá města jdou na mapu');
    const [item, question] = built[0];
    assert.equal(question.type, 'map');
    assert.equal(question.answerLabel, item.n);
    assert.deepEqual(question.map, MapQuestion.buildQuestion(item, zemepisCtx, mapData).map, 'stejná otázka jako v tréninku');
    // Starší aplikace (zamrzlé otázky) přijme uloženou otázku jen s aspoň jednou možností a polem přijímaných odpovědí
    assert.deepEqual(question.choices, [{ id: item.q, label: item.n, correct: true }]);
    assert.ok(Array.isArray(question.accepted));
    assert.equal(MapQuestion.playableMap(question), true);
    assert.equal(MapQuestion.playableMap(JSON.parse(JSON.stringify(question))), true, 'i po uložení na server (JSON)');
    // Stejná otázka na obou zařízeních
    assert.deepEqual(freshMapQuestion().multiplayerQuestion(item, zemepisCtx, mapData), question);
    // Neúplná uložená otázka se nehraje
    for (const broken of [{ ...question, map: null }, { ...question, map: { ...question.map, lat: 'x' } }, { ...question, map: { ...question.map, region: 3 } },
        { ...question, map: { ...question.map, zero: question.map.full - 1 } }, { ...question, type: 'name' }, null]) assert.equal(MapQuestion.playableMap(broken), false);
    // Témata bez mapy a druhy, které na mapu nejdou: obyčejná otázka
    for (const other of biologie.items.slice(0, 50)) assert.equal(MapQuestion.multiplayerQuestion(other, biologieCtx, mapData), null);
    const notOnMap = zemepis.items.filter(entry => !MapQuestion.candidate(entry, zemepisCtx)).slice(0, 50);
    assert.ok(notOnMap.length > 0);
    for (const other of notOnMap) assert.equal(MapQuestion.multiplayerQuestion(other, zemepisCtx, mapData), null, other.n);
    // Bez mapových dat (nenačetla se) také obyčejná
    assert.equal(MapQuestion.multiplayerQuestion(item, zemepisCtx, null), null);
});

test('celá výzva na dvou zařízeních: stejné otázky na mapě, nejvýš asi desetina, nevhodné položky obyčejné', () => {
    // Zjednodušený výběr výzvy (jako challengePicker v app.js): položka z rng otázky, rozhodnutí o mapě z vlastní řady semínka
    const play = (Q, seed, count) => Array.from({ length: count }, (_, index) => {
        const seedText = `${seed}:${index}`;
        const rng = core.createSeededRandom(seedText);
        const item = core.pickRandom(zemepis.items, rng);
        const choiceDraw = rng();
        const map = Q.seedAllowsMaps(seed) && Q.multiplayerDue(seedText) && Q.candidate(item, zemepisCtx) ? Q.multiplayerQuestion(item, zemepisCtx, mapData) : null;
        return { id: item.q, map: Boolean(map), choiceDraw };
    });
    const other = freshMapQuestion();
    let maps = 0;
    let due = 0;
    let questions = 0;
    for (let n = 0; n < 300; n++) {
        const seed = `vyzva-${String(n).padStart(6, '0')}-x${n.toString(36)}.mapa`;
        const first = play(MapQuestion, seed, 10);
        assert.deepEqual(play(other, seed, 10), first, seed);
        // Výzva starší verze (bez značky): stejné položky i rng otázky, žádná mapa
        const old = play(MapQuestion, seed.replace(/\.mapa$/, ''), 10);
        assert.ok(old.every(question => !question.map));
        questions += 10;
        maps += first.filter(question => question.map).length;
        due += Array.from({ length: 10 }, (_, index) => MapQuestion.multiplayerDue(`${seed}:${index}`)).filter(Boolean).length;
    }
    assert.ok(maps > 0, 'některé otázky jsou na mapě');
    assert.ok(maps < due, 'nevhodné položky (určené pro mapu) zůstaly obyčejné');
    assert.ok(maps / questions <= 0.11, `nejvýš asi desetina: ${maps}/${questions}`);
});

test('zapojení v aplikaci: výzva a turnaj podle semínka, Kvíz dne a dnešní otázky bez mapy, rozpis a zápas turnaje s časem', () => {
    const app = read('app.js');
    assert.match(app, /const challengeAllowsMaps = \(c\) => Boolean\(MapQuestion && c && \(c\.tournament \? c\.tournament\.maps === true : MapQuestion\.seedAllowsMaps\(c\.seed\)\)\);/);
    assert.match(app, /MapQuestion\.multiplayerDue\(seedText\) && MapQuestion\.candidate\(item, ctx\)/);
    assert.match(app, /mode === 'challenge' \? \(options\.map \? loadMapData\(\)\.then\(map => MapQuestion\.multiplayerQuestion\(item, ctx, map\)\)/);
    assert.match(app, /createRoundData\(picked\.item, picked\.ctx, picked\.rng, \{ map: Boolean\(picked\.map\) \}\)/);
    assert.match(app, /maps: tournamentMaps\(tournament\)/);
    assert.match(app, /maps: tournamentMaps\(view\.tournament\)/);
    // Kvíz dne (mode 'quiz') a dnešní otázky (mode 'daily'): mapa jen ve výzvě a v tréninku
    assert.match(app, /: mode !== 'practice' \|\| pool\.kind === 'mistakes' \|\| pool\.kind === 'review' \? null/);
    // Uložená otázka na mapě jde hrát (zamrzlé otázky) a rozpis ji ukáže jako „Ukaž na mapě“
    assert.match(app, /data\.question\.type === 'map' \? Boolean\(MapQuestion && MapQuestion\.playableMap\(data\.question\)\)/);
    assert.match(app, /const MAP_BREAKDOWN_TITLE = 'Ukaž na mapě';/);
    assert.match(app, /questionHeaderTop\(\{ timed: Boolean\(mode === 'challenge' && challenge && challenge\.tournament\) \}\);\n\s+appContent\.innerHTML = MapQuestion\.questionScreen/);
});

test('body otázky na mapě projdou kontrolami databáze: nejvýš 4 u výběru z možností (turnaj), 8 u psaní, správně = aspoň bod', () => {
    assert.equal(MapQuestion.maxPoints(false), 4);
    assert.equal(MapQuestion.maxPoints(true), 8);
    const schema = read('supabase/schema.sql');
    assert.match(schema, /tournament_answers_values check \(idx between 0 and 9 and points between 0 and 4 and correct = \(points > 0\)\)/);
    assert.match(schema, /points > \(case when c\.variant = 'choices' then 4 else 8 end\) or correct <> \(points > 0\)/);
    const item = zemepis.items.find(entry => entry.c === 'mesto' && entry.k === 1 && MapQuestion.multiplayerQuestion(entry, zemepisCtx, mapData));
    const question = MapQuestion.multiplayerQuestion(item, zemepisCtx, mapData);
    for (const typed of [false, true]) {
        for (const [dlat, dlon] of [[0, 0], [0.3, 0.3], [2, 2], [8, 8], [30, 60]]) {
            const result = MapQuestion.evaluate(question, { lat: Math.max(-80, Math.min(80, item.la + dlat)), lon: ((item.lo + dlon + 540) % 360) - 180 }, typed);
            assert.ok(Number.isInteger(result.points) && result.points >= 0 && result.points <= (typed ? 8 : 4), JSON.stringify(result));
            assert.ok(`Vedle o ${MapQuestion.formatKm(result.km)}`.length <= 120, 'text odpovědi do rozpisu');
        }
    }
});
