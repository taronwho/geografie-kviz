// Číselné otázky (numeric-questions.js): čtení odhadu, body za pořadí a za odhad, plán otázky ze semínka (výzva = stejná otázka
// pro všechny), výběr položek na skutečných datech (stejná kategorie, žádné skoro stejné hodnoty, nikdy rovnou seřazené)
// a HTML bez stylů v atributech (CSP).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const Numeric = require('../numeric-questions.js');

const ROOT = path.join(__dirname, '..');
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/countries.json'), 'utf8')).countries;
core.setCountries(countries);
const contexts = new Map();
const contextOf = (topicId) => {
    if (!contexts.has(topicId)) {
        const topic = require(`../topics/${topicId}.js`);
        const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
        contexts.set(topicId, { topic, items: data.items, countries, byId: new Map(data.items.map(item => [item.q, item])), textPhotos: new Set() });
    }
    return contexts.get(topicId);
};
const TOPIC_IDS = fs.readdirSync(path.join(ROOT, 'topics')).map(file => file.replace(/\.js$/, ''));
const idOf = (ctx, name, category) => ctx.items.find(item => item.n === name && item.c === category).q;

test('čtení odhadu: mezery, tečky i čárky jako oddělovače, desetinná čárka, tis./mil., před naším letopočtem', () => {
    const cases = [
        ['1603', 1603], ['1 603', 1603], ['1 603 m', 1603], ['1.603', 1603], ['1,603', 1603], ['402 739 obyvatel', 402739],
        ['10,9', 10.9], ['10.9', 10.9], ['1.234.567', 1234567], ['1,234,567', 1234567], ['1.234,5', 1234.5], ['1,234.5', 1234.5],
        ['1,5 mil.', 1500000], ['2 miliardy', 2e9], ['15 tis.', 15000], ['  8849  ', 8849], ['rok 1805', 1805],
        ['490 př. n. l.', -490], ['490 pnl', -490], ['-490', -490], ['−44', -44], ['1500 až 1600', 1500]
    ];
    for (const [text, value] of cases) assert.equal(Numeric.parseNumber(text), value, text);
    for (const text of ['', '   ', 'hodně', 'm', null, undefined, 'x'.repeat(50)]) assert.ok(Number.isNaN(Numeric.parseNumber(text)), String(text));
});

test('odhad počtu obyvatel státu v milionech: 10,5 = 10,5 mil., celé číslo i slovo mil. platí, jak jsou', () => {
    const data = { numeric: { inMillions: true } };
    assert.equal(Numeric.readGuess(data, '10,5'), 10.5e6);
    assert.equal(Numeric.readGuess(data, '1400'), 1.4e9, 'Čína v milionech');
    assert.equal(Numeric.readGuess(data, '10 900 000'), 10.9e6);
    assert.equal(Numeric.readGuess(data, '10,9 mil.'), 10.9e6);
    assert.equal(Numeric.readGuess({ numeric: {} }, '1603'), 1603, 'jinde se nic nenásobí');
    assert.ok(Number.isNaN(Numeric.readGuess(data, 'nevím')));
});

test('Seřaď: celé pořadí 4 body, jedna prohozená sousední dvojice 2, jinak nic; neplatné pořadí bez bodů', () => {
    const data = { numeric: { order: [2, 0, 3, 1] } };
    assert.deepEqual(Numeric.scoreOrder(data, [2, 0, 3, 1]), { base: 4, inversions: 0, positions: [true, true, true, true], placed: 4 });
    const swapped = Numeric.scoreOrder(data, [0, 2, 3, 1]);
    assert.deepEqual([swapped.base, swapped.inversions, swapped.positions], [2, 1, [false, false, true, true]]);
    assert.equal(Numeric.scoreOrder(data, [2, 0, 1, 3]).base, 2, 'prohozené poslední dvě');
    assert.equal(Numeric.scoreOrder(data, [3, 0, 2, 1]).base, 0, 'prohozená první a třetí = tři chyby v párech');
    assert.equal(Numeric.scoreOrder(data, [1, 3, 0, 2]).base, 0, 'obráceně');
    for (const bad of [[2, 0, 3], [2, 2, 3, 1], [2, 0, 3, 7], null, 'abc']) assert.equal(Numeric.scoreOrder(data, bad).base, 0);
    // Náhodné klepání: v průměru méně než půl bodu (stejně jako štěstí u výběru ze 4 možností nedá víc než bod)
    const permutations = (list) => list.length <= 1 ? [list] : list.flatMap((value, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [value, ...rest]));
    const all = permutations([0, 1, 2, 3]).map(order => Numeric.scoreOrder(data, order).base);
    assert.equal(all.length, 24);
    assert.deepEqual([all.filter(base => base === 4).length, all.filter(base => base === 2).length], [1, 3]);
});

test('Odhadni číslo: velikost podle poměru (5 %, 10 %, 25 %, 50 %), letopočet podle doby, pořadové číslo podle rozdílu', () => {
    const ratio = { numeric: { mode: 'ratio', value: 1603 } };
    const scores = [1603, 1650, 1530, 1750, 1460, 1950, 1300, 2400, 1080, 2410, 1068, 0, -5].map(guess => Numeric.scoreEstimate(ratio, guess).base);
    assert.deepEqual(scores, [4, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0, 0]);
    // Stejně přísně nahoru i dolů: dvakrát víc i dvakrát méně je stejně vedle
    assert.equal(Numeric.scoreEstimate(ratio, 1603 * 1.5).base, Numeric.scoreEstimate(ratio, 1603 / 1.5).base);
    const film = { numeric: { mode: 'year', value: 1997 } };
    assert.deepEqual([1997, 1998, 2000, 2005, 2012, 2013].map(guess => Numeric.scoreEstimate(film, guess).base), [4, 4, 3, 2, 1, 0]);
    const battle = { numeric: { mode: 'year', value: 1805 } };
    assert.deepEqual([1807, 1811, 1821, 1835, 1836].map(guess => Numeric.scoreEstimate(battle, guess).base), [4, 3, 2, 1, 0]);
    const medieval = { numeric: { mode: 'year', value: 1278 } };
    assert.deepEqual([1283, 1293, 1318, 1353, 1354].map(guess => Numeric.scoreEstimate(medieval, guess).base), [4, 3, 2, 1, 0]);
    const element = { numeric: { mode: 'abs', value: 26 } };
    assert.deepEqual([26, 28, 21, 36, 37].map(guess => Numeric.scoreEstimate(element, guess).base), [4, 3, 2, 1, 0]);
    assert.equal(Numeric.scoreEstimate(ratio, NaN).base, 0);
    assert.equal(Numeric.missText(ratio, 1500), 'o 6 % méně');
    assert.equal(Numeric.missText(ratio, 1603), 'přesně');
    assert.equal(Numeric.missText(ratio, 4000), '2,5× víc');
    assert.equal(Numeric.missText(battle, 1800), 'o 5 let dříve');
    assert.equal(Numeric.missText(battle, 1807), 'o 2 roky později');
    assert.equal(Numeric.missText(element, 25), 'o 1 méně');
    assert.equal(Numeric.ladderText(ratio, 'choices'), '4 body do 5 %, 3 do 10 %, 2 do 25 %, 1 do 50 %');
    assert.equal(Numeric.ladderText(battle, 'typed'), '8 bodů do 2 let, 6 do 6 let, 4 do 16 let, 2 do 30 let');
    assert.equal(Numeric.ladderText(film, 'choices'), '4 body do 1 roku, 3 do 3 let, 2 do 8 let, 1 do 15 let');
    assert.equal(Numeric.ladderText(element, 'choices'), '4 body přesně, 3 do 2, 2 do 5, 1 do 10');
});

test('body sedí s pravidly serveru: výběr z možností nejvýš 4, psaní nejvýš 8, správně právě když jsou body', () => {
    for (const variant of ['choices', 'typed']) {
        for (let base = -1; base <= 6; base++) {
            const points = Numeric.pointsFor(base, variant);
            assert.ok(Number.isInteger(points) && points >= 0 && points <= (variant === 'typed' ? 8 : 4), `${variant} ${base}`);
        }
    }
    assert.equal(Numeric.pointsFor(4, 'choices'), 4);
    assert.equal(Numeric.pointsFor(4, 'typed'), 8);
    assert.equal(Numeric.pointsFor(2, 'typed'), 4);
    // Za body z číselné otázky stejné XP jako za stejné body jinde (10 + 5 za bod)
    assert.equal(core.answerXp({ correct: true, points: Numeric.pointsFor(2, 'choices') }), 20);
});

test('plán otázky: asi každá osmá, ze semínka vždy stejný (výzva), u témat bez spolehlivých čísel nikdy', () => {
    const ctx = contextOf('zemepis');
    const pool = ctx.items.filter(item => item.k === 1);
    const run = (seed) => {
        const rng = core.createSeededRandom(seed);
        const item = core.pickItem(pool, rng, [], ctx.topic.categories.map(c => c.key));
        return Numeric.plan({ topic: ctx.topic, item, pool, rng: core.createSeededRandom(`${seed}:cisla`) });
    };
    let planned = 0;
    for (let i = 0; i < 800; i++) {
        const first = run(`vyzva-ABC:${i}`);
        assert.deepEqual(run(`vyzva-ABC:${i}`), first, 'stejné semínko, stejná otázka');
        if (first) planned++;
    }
    assert.ok(planned > 60 && planned < 150, `asi osmina (${planned} z 800)`);
    for (const topicId of ['mytologie', 'biologie']) {
        const other = contextOf(topicId);
        assert.equal(Numeric.specsFor(topicId).length, 0, `${topicId}: žádná spolehlivá čísla`);
        assert.equal(Numeric.plan({ topic: other.topic, item: other.items[0], pool: other.items, rng: () => 0, force: 'order' }), null);
    }
    assert.equal(Numeric.plan({ topic: ctx.topic, item: pool[0], pool: [], rng: () => 0 }), null, 'bez položek nic');
    assert.equal(Numeric.plan({ topic: ctx.topic, item: pool[0], pool, rng: () => 0.99 }), null, 'mimo osminu obyčejná otázka');
});

test('Seřaď na skutečných datech: 4 položky ze stejné kategorie a skupiny, různé názvy, žádné skoro stejné hodnoty, nikdy rovnou seřazené', () => {
    let checked = 0;
    for (const topicId of TOPIC_IDS) {
        const ctx = contextOf(topicId);
        for (const spec of Numeric.specsFor(topicId).filter(other => other.order)) {
            const eligible = ctx.items.filter(item => Numeric.isEligible(spec, item));
            assert.ok(eligible.length >= 8, `${spec.id}: dost položek (${eligible.length})`);
            for (let i = 0; i < 25; i++) {
                const rng = core.createSeededRandom(`${spec.id}:${i}`);
                const anchor = core.pickRandom(eligible, rng);
                const plan = Numeric.plan({ topic: ctx.topic, item: anchor, pool: eligible, rng, force: 'order' });
                if (!plan) continue;
                const data = Numeric.buildRound(plan, ctx);
                assert.ok(data, `${spec.id}: otázka jde sestavit`);
                const items = plan.ids.map(id => ctx.byId.get(id));
                const usedSpec = Numeric.SPECS.find(other => other.id === plan.spec);
                assert.equal(new Set(items.map(item => item.c)).size, 1, 'stejná kategorie');
                if (usedSpec.group) assert.equal(new Set(items.map(item => usedSpec.group(item))).size, 1, 'stejná skupina');
                assert.equal(new Set(items.map(item => core.normalizeAnswer(item.n))).size, 4, 'různé názvy');
                const values = data.numeric.items.map(row => row.value);
                for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) assert.ok(Numeric.farEnough(usedSpec.gap, values[a], values[b]), `${plan.spec}: ${values[a]} a ${values[b]} jsou dost daleko`);
                // Hodnota je z dat (zaokrouhlená) a s jednotkou
                data.numeric.items.forEach(row => assert.equal(row.value, Numeric.valueOf(usedSpec, ctx.byId.get(row.id))));
                const sorted = [...values].sort((x, y) => x - y);
                assert.notDeepEqual(values, sorted, 'neukazuje se seřazené');
                assert.notDeepEqual(values, [...sorted].reverse(), 'ani obráceně');
                const ordered = data.numeric.order.map(index => values[index]);
                assert.deepEqual(ordered, plan.dir === 'desc' ? [...sorted].reverse() : sorted, 'správné pořadí podle směru');
                if (usedSpec.unit === 'year') assert.ok(items.every(item => !/\d{3,4}/.test(item.n)), 'název neprozradí rok');
                assert.equal(data.question.type, 'order');
                assert.deepEqual(data.hints, [], 'bez nápověd');
                assert.ok(data.question.answerLabel.split(', ').length >= 4);
                assert.deepEqual(JSON.parse(JSON.stringify(data)), data, 'uloží se do relace beze ztráty');
                checked++;
            }
        }
    }
    assert.ok(checked > 500, `prověřeno ${checked} otázek`);
});

test('Odhadni číslo na skutečných datech: jen známé položky, hodnota s jednotkou, otázka podle druhu', () => {
    const z = contextOf('zemepis');
    const snezka = Numeric.buildRound({ kind: 'estimate', spec: 'zemepis-hora-vyska', ids: [idOf(z, 'Sněžka', 'hora')] }, z);
    assert.equal(snezka.question.title, 'Kolik metrů měří tato hora?');
    assert.equal(snezka.numeric.value, 1603);
    assert.equal(snezka.numeric.label.replace(/\s/g, ' '), '1 603 m');
    assert.equal(snezka.numeric.suffix, 'm');
    assert.equal(snezka.name, 'Sněžka');
    assert.match(snezka.numeric.item.detail, /Česko/);
    const brno = Numeric.buildRound({ kind: 'estimate', spec: 'zemepis-mesto-obyvatele', ids: [idOf(z, 'Brno', 'mesto')] }, z);
    assert.equal(brno.numeric.value, 403000, 'zaokrouhleno na tři platné číslice');
    assert.equal(brno.question.title, 'Kolik obyvatel má toto město?');
    const h = contextOf('historie');
    const slavkov = Numeric.buildRound({ kind: 'estimate', spec: 'historie-bitva-rok', ids: [idOf(h, 'Bitva u Slavkova', 'bitva')] }, h);
    assert.equal(slavkov.question.title, 'V jakém roce proběhla tato bitva?');
    assert.equal(slavkov.numeric.value, 1805);
    assert.equal(slavkov.numeric.mode, 'year');
    assert.equal(slavkov.numeric.prefix, 'rok');
    const alzbeta = Numeric.buildRound({ kind: 'estimate', spec: 'historie-panovnik-narozeni', ids: [idOf(h, 'Alžběta I.', 'panovnik')] }, h);
    assert.equal(alzbeta.question.title, 'V jakém roce se narodila?');
    const chemie = contextOf('chemie');
    const zelezo = Numeric.buildRound({ kind: 'estimate', spec: 'chemie-prvky-z', ids: [idOf(chemie, 'Železo', 'prvky')] }, chemie);
    assert.deepEqual([zelezo.numeric.value, zelezo.numeric.mode, zelezo.question.title], [26, 'abs', 'Jaké protonové číslo má tento prvek?']);
    // Neznámá položka nebo položka bez čísla se nesestaví
    assert.equal(Numeric.buildRound({ kind: 'estimate', spec: 'zemepis-hora-vyska', ids: [idOf(z, 'Brno', 'mesto')] }, z), null);
    assert.equal(Numeric.buildRound({ kind: 'estimate', spec: 'neni', ids: [] }, z), null);
    // Plán vybírá pro odhad jen známé položky (k = 1) a jen u vlastností s odhadem
    for (const topicId of TOPIC_IDS) {
        const ctx = contextOf(topicId);
        for (let i = 0; i < 30; i++) {
            const rng = core.createSeededRandom(`odhad-${topicId}-${i}`);
            const plan = Numeric.plan({ topic: ctx.topic, item: core.pickRandom(ctx.items, rng), pool: ctx.items, rng, force: 'estimate' });
            if (!plan) continue;
            assert.equal(plan.kind, 'estimate');
            const item = ctx.byId.get(plan.ids[0]);
            assert.equal(item.k, 1, `${plan.spec}: ${item.n} je známá`);
            const data = Numeric.buildRound(plan, ctx);
            assert.ok(Number.isFinite(data.numeric.value) && data.numeric.label);
        }
    }
});

test('stupnice výsledku: obě hodnoty jako značky, o řád vedle logaritmicky, bez odhadu jen správná hodnota', () => {
    const z = contextOf('zemepis');
    const data = Numeric.buildRound({ kind: 'estimate', spec: 'zemepis-hora-vyska', ids: [idOf(z, 'Sněžka', 'hora')] }, z);
    const near = Numeric.scaleSpec(data, 1500);
    assert.equal(near.type, 'scale');
    assert.equal(near.value, 1603);
    assert.equal(near.marks.length, 1);
    assert.equal(near.log, false);
    assert.ok(near.min <= 1500 && near.max >= 1603);
    assert.equal(Numeric.scaleSpec(data, 50000).log, true);
    assert.deepEqual(Numeric.scaleSpec(data, NaN).marks, []);
    const h = contextOf('historie');
    const year = Numeric.scaleSpec(Numeric.buildRound({ kind: 'estimate', spec: 'historie-bitva-rok', ids: [idOf(h, 'Bitva u Slavkova', 'bitva')] }, h), 1800);
    assert.ok(year.min < 1800 && year.max > 1805 && !year.log);
});

test('HTML otázky a výsledku: bez stylů v atributech (CSP), tlačítka s popisky, body podle varianty', () => {
    const z = contextOf('zemepis');
    const ids = ['Sněžka', 'Mount Everest', 'Mont Blanc', 'Fudži'].map(name => idOf(z, name, 'hora'));
    const order = Numeric.buildRound({ kind: 'order', spec: 'zemepis-hora-vyska', dir: 'desc', ids }, z);
    const estimate = Numeric.buildRound({ kind: 'estimate', spec: 'zemepis-hora-vyska', ids: [ids[0]] }, z);
    const ui = {
        style: { solid: 'border-emerald-500 bg-emerald-700', on: 'border-emerald-500', button: 'bg-emerald-700', text: 'text-emerald-700' },
        card: 'card', cardTitle: 'title', art: () => '<img alt="">', xpLine: () => '', statsCard: '', reportIcon: '', reportText: '', nextLabel: 'Další otázka', wikiUrl: (t) => `https://cs.wikipedia.org/wiki/${t}`, variant: 'choices'
    };
    const html = [
        Numeric.questionHtml(order, { pick: [1] }, ui), Numeric.questionHtml(estimate, {}, { ...ui, variant: 'typed' }),
        Numeric.resultHtml(order, { answered: true, correct: true, points: 2, pick: [1, 2, 0, 3], score: Numeric.scoreOrder(order, [1, 2, 0, 3]) }, ui),
        Numeric.resultHtml(estimate, { answered: true, correct: true, points: 3, guess: 1500 }, ui),
        Numeric.resultHtml(estimate, { answered: true, gaveUp: true }, ui)
    ];
    for (const part of html) {
        assert.doesNotMatch(part, /\sstyle=/, 'žádný inline styl');
        assert.doesNotMatch(part, /<script|on[a-z]+=/i, 'žádný inline skript');
    }
    assert.equal((html[0].match(/data-action="order-pick"/g) || []).length, 4);
    assert.match(html[0], /aria-pressed="true" aria-label="Mount Everest: 1\. místo, klepnutím ho zrušíš"/);
    assert.match(html[0], /data-action="order-confirm" disabled/);
    assert.match(html[0], /Za 4 body/);
    assert.match(html[1], /inputmode="numeric"/);
    assert.match(html[1], /Až 8 bodů podle přesnosti/);
    assert.match(html[2], /Skoro! \+2 body/);
    assert.match(html[2], /data-action="item-info"/);
    assert.match(html[3], /Skvělý odhad! \+3 body/);
    assert.match(html[3], /o 6 % méně/);
    assert.match(html[4], /Tentokrát bez odpovědi/);
    // Klepnutí: další číslo, opakované klepnutí číslo zruší a ostatní se přečíslují
    const round = {};
    Numeric.togglePick(round, 2);
    Numeric.togglePick(round, 0);
    Numeric.togglePick(round, 3);
    assert.deepEqual(round.pick, [2, 0, 3]);
    Numeric.togglePick(round, 2);
    assert.deepEqual(round.pick, [0, 3]);
    Numeric.togglePick(round, 1);
    Numeric.togglePick(round, 2);
    Numeric.togglePick(round, 2);
    Numeric.togglePick(round, 2);
    assert.deepEqual(round.pick, [0, 3, 1, 2], 'nejvýš čtyři');
});

test('každá vlastnost má vyplněné texty, jednotku a známý způsob vzdálenosti; témata a kategorie existují', () => {
    const ids = new Set();
    for (const spec of Numeric.SPECS) {
        assert.ok(!ids.has(spec.id), `${spec.id} jen jednou`);
        ids.add(spec.id);
        assert.ok(TOPIC_IDS.includes(spec.topic), spec.id);
        const ctx = contextOf(spec.topic);
        assert.ok(ctx.topic.categories.some(category => category.key === spec.category), `${spec.id}: kategorie ${spec.category}`);
        assert.ok(Numeric.UNITS[spec.unit], `${spec.id}: jednotka`);
        assert.ok(['ratio', 'abs', 'year'].includes(spec.gap.mode));
        assert.ok(spec.order || spec.estimate);
        for (const dir of Object.keys(spec.order || {})) {
            assert.ok(['asc', 'desc'].includes(dir));
            assert.match(spec.order[dir][0], /^Seřaď /);
        }
        if (spec.estimate) assert.ok(['ratio', 'abs', 'year'].includes(spec.estimate.score));
    }
});
