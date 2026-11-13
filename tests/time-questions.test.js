// Časové souvislosti (time-questions.js): výpočty vztahů v čase (i před naším letopočtem), odstupy, právě jedna správná možnost
// u každého druhu otázky, neutrální zadání, nápovědy bez prozrazení, rozvržení osy, Kvíz dne a otázky ze skutečných dat všech témat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const Time = require('../time-questions.js');

const ROOT = path.join(__dirname, '..');
const THIS_YEAR = new Date().getFullYear();

// --- Malá zkušební data: téma s osobami a věcmi, z jiných témat jen známé (index) ---
const person = (q, n, born, died, extra = {}) => ({ q, n, c: 'osobnost', k: 1, ty: 'osobnost', f: { born, ...(died === undefined ? {} : { died }) }, ...extra });
const event = (q, n, year, extra = {}) => ({ q, n, c: 'udalosti', k: 1, ty: 'událost', f: { year, ...extra.f }, ...extra, ...(extra.f ? { f: { year, ...extra.f } } : {}) });
const TOPIC = { id: 'historie', categories: [{ key: 'osobnost' }, { key: 'udalosti' }, { key: 'bitva' }, { key: 'panovnik' }, { key: 'statnik' }, { key: 'rise' }] };
const contextFor = (items) => ({ topic: TOPIC, items, byId: new Map(items.map(item => [item.q, item])), textPhotos: new Set() });
const indexWith = (people = [], dated = []) => Time.setIndex({ people, dated });
const ent = (q, n, b, d, tp = 'hudba', ty = 'skladatel') => ({ q, tp, n, b, ...(d === null ? {} : { d }), ty });
const thing = (q, n, y, kd = 'vynalez', tp = 'fyzika', by = '') => ({ q, tp, n, y, kd, ty: kd === 'vynalez' ? 'vynález' : kd, ...(by ? { by } : {}) });
const seeded = (text) => core.createSeededRandom(text);
const planMany = (ctx, items, force, runs = 60, seed = 't') => {
    const plans = [];
    for (let i = 0; i < runs; i++) {
        const rng = seeded(`${seed}:${i}`);
        const item = items[i % items.length];
        const planned = Time.plan({ ctx, item, pool: ctx.items, rng, force });
        if (planned) plans.push(planned);
    }
    return plans;
};

test('vztahy v čase: překryv dospělých let, mezera a odstupy i před naším letopočtem', () => {
    const newton = { b: 1643, d: 1727 };
    const bach = { b: 1685, d: 1750 };
    assert.equal(Time.lifeOverlap(newton, bach), 42);
    assert.equal(Time.adultOverlap(newton, bach), 1727 - (1685 + 18));
    assert.ok(Time.canMeet(newton, bach));
    const galileo = { b: 1564, d: 1642 };
    assert.equal(Time.lifeGap(newton, galileo), 1);
    assert.ok(!Time.canMeet(newton, galileo));
    assert.ok(!Time.cannotMeet(newton, galileo), 'rok mezera není „jasně“ mimo (odstup aspoň 10 let)');
    // Astronomické číslování roků (−355 = 356 př. n. l.): rozdíly sedí i přes začátek letopočtu
    const alexander = { b: -355, d: -322 };
    const aristotle = { b: -383, d: -321 };
    const caesar = { b: -99, d: -43 };
    assert.ok(Time.canMeet(alexander, aristotle));
    assert.ok(Time.cannotMeet(alexander, caesar));
    assert.equal(Time.lifeGap(alexander, caesar), 223);
    assert.equal(Time.marginAt(-300), 60, 'u starověku větší odstup (data jsou nejistá)');
    assert.equal(Time.marginAt(1700), 10);
    // Žijící osoba: do dneška
    assert.equal(Time.lifeOverlap({ b: 1950, d: null }, { b: 1990, d: null }), THIS_YEAR - 1990);
});

test('roky z dat: odhady, letopočet v názvu, prvky známé od starověku a nejisté stavby se neptají', () => {
    assert.equal(Time.timeFacts(person('Q1', 'Alexandr Veliký', -355, -322), 'historie').b, -355);
    assert.equal(Time.timeFacts(person('Q1a', 'Sókratés', -470, -399), 'historie'), null, 'kulatý rok před rokem 1000 je odhad (asi 470 př. n. l.)');
    assert.equal(Time.timeFacts(person('Q1b', 'Linus', 10, 79), 'historie'), null, 'legendární data raných papežů');
    assert.equal(Time.timeFacts(person('Q1c', 'Petronius', 27, 66, { d: 'římský patricij (asi 27–66 n. l.)' }), 'historie'), null, 'popis s „asi“ u roku');
    // Obor osobnosti z popisu Wikipedie, když Wikidata uvádějí nepřesné povolání
    assert.equal(Time.timeFacts(person('Q1d', 'José Mourinho', 1963, undefined, { ty: 'diplomat', d: 'portugalský fotbalový trenér' }), 'historie').ty, 'trenér');
    assert.equal(Time.timeFacts(person('Q1e', 'Pierre Simon de Laplace', 1749, 1827, { ty: 'politik', d: 'francouzský matematik, fyzik, astronom a politik (1749–1827)' }), 'historie').ty, 'matematik');
    assert.equal(Time.timeFacts(person('Q1f', 'Karel IV.', 1316, 1378, { c: 'panovnik', ty: 'český král', d: 'český král a římský císař' }), 'historie').ty, 'český král', 'panovník podle Wikidat');
    // Díla a vynálezy s kulatým rokem do roku 1700 a sporné vynálezy se neptají
    assert.equal(Time.timeFacts({ q: 'Q13', n: 'Kupec benátský', c: 'dila', k: 1, f: { year: 1600 } }, 'literatura'), null, 'kulatý rok díla před 1700');
    assert.equal(Time.timeFacts({ q: 'Q14', n: 'Hamlet', c: 'dila', k: 1, f: { year: 1602 } }, 'literatura').y, 1602);
    assert.equal(Time.timeFacts({ q: 'Q15', n: 'Parní stroj', c: 'vynalezy', k: 1, f: { year: 1769 } }, 'fyzika'), null, 'Newcomen 1712, nebo Watt 1769');
    assert.equal(Time.timeFacts({ q: 'Q16', n: 'Proměny', c: 'dila', k: 1, f: { year: 1 } }, 'literatura'), null, 'rok 1 je zástupný údaj');
    // Dílo vydané až po smrti autora (nebo dřív, než mohl tvořit) neodpovídá vzniku
    const shakespeare = { b: 1564, d: 1616 };
    assert.ok(!Time.authorFits({ kd: 'literarni', y: 1623 }, shakespeare), 'Macbeth 1623 = první souborné vydání');
    assert.ok(Time.authorFits({ kd: 'literarni', y: 1602 }, shakespeare));
    assert.ok(!Time.authorFits({ kd: 'literarni', y: 1304 }, { b: 1304, d: 1374 }), 'dílo v roce narození');
    assert.ok(Time.authorFits({ kd: 'stavba', y: 1904 }, { b: 1839, d: 1902 }), 'stavbu po smrti architekta dokončí jiní');
    assert.ok(Time.authorFits({ kd: 'literarni', y: 1900 }, null), 'bez autora v datech se nekontroluje');
    assert.equal(Time.timeFacts(person('Q2', 'Odhadnutý', 1100, 1150), 'historie'), null, 'rok dělitelný 50 před 1500 je odhad');
    assert.equal(Time.timeFacts(person('Q3', 'Bez úmrtí', 1700), 'historie'), null, 'narozen před 100 lety a bez úmrtí: chybí data');
    assert.equal(Time.timeFacts(person('Q4', 'Žijící', 1960), 'historie').d, null);
    assert.equal(Time.timeFacts(event('Q5', 'Zemětřesení v Lisabonu v roce 1755', 1755), 'historie'), null, 'letopočet v názvu by odpověď prozradil');
    assert.equal(Time.timeFacts(event('Q6', 'Stoletá válka', 1337, { f: { end: 1453 } }), 'historie'), null, 'dlouhá válka není jeden okamžik');
    assert.equal(Time.timeFacts({ q: 'Q7', n: 'Uhlík', c: 'prvky', k: 1, f: { year: 1789 } }, 'chemie'), null);
    assert.equal(Time.timeFacts({ q: 'Q8', n: 'Kyslík', c: 'prvky', k: 1, f: { year: 1774, disc: 'Joseph Priestley' } }, 'chemie').kd, 'prvek');
    assert.equal(Time.timeFacts({ q: 'Q9', n: 'Koloseum', c: 'stavby', k: 1, ty: 'divadlo', f: { y: 82 } }, 'architektura'), null, 'stavby jen od roku 1850');
    assert.equal(Time.timeFacts({ q: 'Q10', n: 'Muzeum', c: 'stavby', k: 1, ty: 'muzeum', f: { y: 1902 } }, 'architektura'), null, 'u muzea rok založení sbírky');
    assert.equal(Time.timeFacts({ q: 'Q11', n: 'Eiffelova věž', c: 'stavby', k: 1, ty: 'věž', f: { y: 1887 } }, 'architektura').kd, 'stavba');
    assert.equal(Time.timeFacts({ q: 'Q12', n: 'Mona Lisa', c: 'obrazy', k: 1, f: { year: 1503, ya: 1 } }, 'umeni'), null, 'přibližný rok obrazu');
});

test('dílo vydané až po smrti autora se z dat tématu neptá (Proces 1925, Kafka zemřel 1924)', () => {
    indexWith([], []);
    const topic = { id: 'literatura', categories: [{ key: 'spisovatele' }, { key: 'dila' }] };
    const items = [
        { q: 'Q900', n: 'Franz Kafka', c: 'spisovatele', k: 1, ty: 'spisovatel', f: { born: 1883, died: 1924 } },
        { q: 'Q901', n: 'Proces', c: 'dila', k: 1, ty: 'román', f: { year: 1925, by: 'Franz Kafka', byq: 'Q900' } },
        { q: 'Q902', n: 'Proměna', c: 'dila', k: 1, ty: 'novela', f: { year: 1915, by: 'Franz Kafka', byq: 'Q900' } }
    ];
    const data = Time.entriesFor({ topic, items, byId: new Map(items.map(item => [item.q, item])), textPhotos: new Set() });
    assert.ok(!data.byId.has('Q901'));
    assert.equal(data.byId.get('Q902').y, 1915);
    assert.equal(data.byId.get('Q900').b, 1883);
});

test('Mohli se potkat: právě jedna osoba žila současně (10 let jako dospělí), ostatní vůbec ne a s odstupem', () => {
    indexWith([
        ent('Q100', 'Johann Sebastian Bach', 1685, 1750), ent('Q101', 'Galileo Galilei', 1564, 1642, 'fyzika', 'fyzik'), ent('Q102', 'Albert Einstein', 1879, 1955, 'fyzika', 'fyzik'),
        ent('Q103', 'Wolfgang Amadeus Mozart', 1756, 1791), ent('Q104', 'Mikuláš Koperník', 1473, 1543, 'fyzika', 'astronom'), ent('Q105', 'Ludwig van Beethoven', 1770, 1827),
        ent('Q106', 'Georg Friedrich Händel', 1685, 1759), ent('Q107', 'Antonio Vivaldi', 1678, 1741), ent('Q108', 'Leonardo da Vinci', 1452, 1519, 'umeni', 'malíř'),
        ent('Q109', 'Gottfried Wilhelm Leibniz', 1646, 1716, 'fyzika', 'matematik'), ent('Q110', 'Jean-Baptiste Lully', 1632, 1687)
    ]);
    const ctx = contextFor([person('Q1', 'Isaac Newton', 1643, 1727)]);
    const plans = planMany(ctx, ctx.items, 'meet');
    assert.ok(plans.length > 10);
    const data = Time.entriesFor(ctx);
    for (const planned of plans) {
        assert.deepEqual(Time.check(planned, data), []);
        const subject = data.byId.get(planned.subject);
        const choices = planned.ids.map(id => data.byId.get(id));
        assert.equal(choices.filter(choice => Time.canMeet(subject, choice)).length, 1);
        assert.ok(Time.canMeet(subject, choices[planned.correct]));
        choices.filter((choice, index) => index !== planned.correct).forEach(choice => assert.ok(Time.lifeGap(subject, choice) >= 10, choice.n));
    }
    const round = Time.buildRound(plans[0], ctx);
    assert.equal(round.question.title, 'Kdo z nich mohl potkat tuto osobnost?');
    assert.equal(round.question.choices.length, 4);
    assert.ok(round.question.choicesOnly);
    const correct = round.time.rows.find(row => row.correct);
    assert.match(correct.relation, /^současně \d+ (let|roky|rok)$/);
    assert.match(round.description, /^Isaac Newton 1643–1727 · .+ → současně \d+/);
    // Obrácená otázka: právě jedna se potkat nemohla
    const inverse = planMany(ctx, ctx.items, 'nomeet');
    assert.ok(inverse.length > 5);
    for (const planned of inverse) {
        assert.deepEqual(Time.check(planned, data), []);
        const subject = data.byId.get(planned.subject);
        const choices = planned.ids.map(id => data.byId.get(id));
        assert.equal(choices.filter(choice => !Time.canMeet(subject, choice)).length, 1);
        assert.ok(Time.cannotMeet(subject, choices[planned.correct]));
    }
    assert.equal(Time.buildRound(inverse[0], ctx).question.title, 'Kdo z nich se s touto osobností potkat nemohl?');
});

test('Mohli se potkat před naším letopočtem: osy a roky ve vysvětlení', () => {
    indexWith([
        ent('Q200', 'Aristotelés', -383, -321, 'literatura', 'filozof'), ent('Q201', 'Gaius Iulius Caesar', -99, -43, 'literatura', 'vojevůdce'), ent('Q202', 'Kleopatra VII.', -68, -29, 'umeni', 'královna'),
        ent('Q203', 'Augustus', -62, 14, 'umeni', 'císař'), ent('Q204', 'Homér', -800, -720, 'literatura', 'básník'), ent('Q205', 'Konfucius', -550, -478, 'literatura', 'filozof'),
        ent('Q206', 'Archimédés', -286, -211, 'fyzika', 'fyzik')
    ]);
    const ctx = contextFor([{ ...person('Q2', 'Alexandr Veliký', -355, -322), c: 'panovnik' }]);
    const plans = planMany(ctx, ctx.items, 'meet', 80);
    assert.ok(plans.length > 0);
    const data = Time.entriesFor(ctx);
    for (const planned of plans) {
        assert.deepEqual(Time.check(planned, data), []);
        assert.equal(data.byId.get(planned.ids[planned.correct]).n, 'Aristotelés', 'jen Aristotelés žil současně');
    }
    const round = Time.buildRound(plans[0], ctx);
    assert.equal(round.time.subject.years, '355–322 př. n. l.');
    assert.ok(round.resultVisual.rows.some(row => row.from < 0));
    // Osa výsledku zvládne roky před naším letopočtem
    const layout = Time.chronologyLayout(round.resultVisual, 360, 230);
    assert.ok(layout.ticks.some(tick => /př\. n\. l\./.test(tick.label)));
    layout.rows.forEach(row => { assert.ok(row.x1 >= 0 && row.x2 <= 360, row.label); });
});

test('Za života: věc po smrti a věci za života s odstupem aspoň 10 let, vlastní díla osobnosti se nenabízejí', () => {
    indexWith([], [
        thing('Q300', 'Parní stroj', 1769), thing('Q301', 'Hromosvod', 1752), thing('Q302', 'Horkovzdušný balon', 1783), thing('Q303', 'Parní lokomotiva', 1804),
        thing('Q304', 'Parník', 1807), thing('Q305', 'Litografie', 1796), thing('Q306', 'Telefon', 1876), thing('Q307', 'Kouzelná flétna', 1791, 'opera', 'hudba', 'Wolfgang Amadeus Mozart'),
        thing('Q308', 'Ladička', 1711), thing('Q309', 'Metronom', 1815), thing('Q310', 'Fotografie', 1826),
        thing('Q311', 'Námořní chronometr', 1736), thing('Q312', 'Secí stroj', 1701), thing('Q313', 'Ponorka Turtle', 1775)
    ]);
    const ctx = contextFor([person('Q3', 'Wolfgang Amadeus Mozart', 1756, 1791)]);
    const data = Time.entriesFor(ctx);
    for (const type of ['after', 'during']) {
        const plans = planMany(ctx, ctx.items, type, 60, type);
        assert.ok(plans.length > 5, type);
        for (const planned of plans) {
            assert.deepEqual(Time.check(planned, data), [], type);
            const choices = planned.ids.map(id => data.byId.get(id));
            assert.ok(!choices.some(choice => choice.n === 'Kouzelná flétna'), 'vlastní dílo osobnosti by bylo zjevné');
            choices.forEach(choice => assert.ok(Math.abs(choice.y - 1791) >= 10, `${choice.n}: odstup od úmrtí`));
            const correct = choices[planned.correct];
            if (type === 'after') assert.ok(correct.y >= 1801);
            else assert.ok(correct.y <= 1781);
        }
        const round = Time.buildRound(plans[0], ctx);
        assert.equal(round.question.title, type === 'after' ? 'Co bylo vynalezeno až po smrti této osobnosti?' : 'Co už bylo vynalezeno za života této osobnosti?');
        assert.ok(round.time.rows.every(row => /po smrti|ve věku|před narozením/.test(row.relation)));
    }
});

test('Ve stejném století: jen roky daleko od přelomu století, nesprávné z jiného století, i před naším letopočtem', () => {
    assert.ok(Time.centuryCore(1648));
    assert.ok(!Time.centuryCore(1601) && !Time.centuryCore(1600) && !Time.centuryCore(1695));
    assert.ok(Time.centuryCore(-43) && !Time.centuryCore(-3));
    // Možnosti z indexu (jiné téma než otázka, jen známé)
    indexWith([], [
        thing('Q400', 'Bitva u Actia', -30, 'udalost', 'umeni'), thing('Q401', 'Bitva u Kann', -215, 'udalost', 'umeni'), thing('Q402', 'Výbuch Vesuvu', 79, 'udalost', 'umeni'),
        thing('Q403', 'Bitva u Marathónu', -489, 'udalost', 'umeni'), thing('Q404', 'Bitva v Teutoburském lese', 9, 'udalost', 'umeni'), thing('Q405', 'Velký požár Říma', 64, 'udalost', 'umeni'),
        thing('Q406', 'Bitva u Gaugamél', -330, 'udalost', 'umeni')
    ]);
    const ctx = contextFor([event('Q4', 'Zavraždění Caesara', -43)]);
    const data = Time.entriesFor(ctx);
    const plans = planMany(ctx, ctx.items, 'century', 80);
    // Zavraždění Caesara patří do 1. století př. n. l.; Bitva u Actia také, Vesuv (79) do 1. století n. l.
    assert.ok(plans.length > 0);
    for (const planned of plans) {
        assert.deepEqual(Time.check(planned, data), []);
        assert.equal(data.byId.get(planned.ids[planned.correct]).n, 'Bitva u Actia');
    }
    const round = Time.buildRound(plans[0], ctx);
    assert.equal(round.question.title, 'Co se stalo ve stejném století jako tato událost?');
    assert.ok(round.time.rows.some(row => row.relation === '1. století př. n. l.'));
});

test('Co bylo dřív, Kdo se narodil nejdřív, Kdo žil nejdéle: roky dost daleko od sebe, správná je nejmenší či největší', () => {
    assert.equal(Time.orderGap(1950, 'film'), 5);
    assert.equal(Time.orderGap(1950, 'literarni'), 10);
    assert.equal(Time.orderGap(1700, 'vynalez'), 10);
    assert.equal(Time.orderGap(1200, 'udalost'), 50);
    assert.equal(Time.orderGap(1900, 'stavba'), 25);
    indexWith();
    const years = [105, 1440, 1608, 1700, 1752, 1769, 1804, 1826, 1876, 1879, 1903, 1926, 1947, 1971];
    const inventions = years.map((year, i) => ({ q: `QV${i}`, n: `Vynález ${String.fromCharCode(65 + i)}`, c: 'vynalezy', k: 1, ty: 'vynález', f: { year, by: `Vynálezce ${i}` } }));
    const ctx = { topic: { id: 'fyzika', categories: [{ key: 'vynalezy' }] }, items: inventions, byId: new Map(inventions.map(item => [item.q, item])), textPhotos: new Set() };
    const data = Time.entriesFor(ctx);
    const plans = planMany(ctx, inventions, 'order', 60);
    assert.ok(plans.length > 20);
    for (const planned of plans) {
        assert.deepEqual(Time.check(planned, data), []);
        const values = planned.ids.map(id => data.byId.get(id).y);
        const sorted = [...values].sort((a, b) => a - b);
        sorted.forEach((value, i) => { if (i) assert.ok(value - sorted[i - 1] >= Time.orderGap(sorted[i - 1], 'vynalez')); });
        assert.equal(values[planned.correct], planned.dir === 'last' ? sorted[3] : sorted[0]);
    }
    const round = Time.buildRound(plans.find(planned => planned.dir === 'first'), ctx);
    assert.equal(round.question.title, 'Co bylo vynalezeno nejdřív?');
    assert.equal(round.time.subject, null);
    assert.equal(round.hints.length, 2, 'dvě nápovědy: roky dvou nesprávných možností');
    const correct = round.question.choices.find(choice => choice.correct).label;
    round.hints.forEach(hint => assert.ok(!hint.facts.some(fact => fact.label === correct)));
    // Lidé: narození a délka života
    const people = [['Q61', 'Wolfgang Amadeus Mozart', 1756, 1791], ['Q62', 'Ludwig van Beethoven', 1770, 1827], ['Q63', 'Frédéric Chopin', 1810, 1849], ['Q64', 'Bedřich Smetana', 1824, 1884],
        ['Q65', 'Antonín Dvořák', 1841, 1904], ['Q66', 'Gustav Mahler', 1860, 1911], ['Q67', 'Igor Stravinskij', 1882, 1971], ['Q68', 'Johann Sebastian Bach', 1685, 1750], ['Q69', 'Joseph Haydn', 1732, 1809]]
        .map(([q, n, born, died]) => ({ q, n, c: 'skladatele', k: 1, ty: 'skladatel', f: { born, died } }));
    const musicCtx = { topic: { id: 'hudba', categories: [{ key: 'skladatele' }] }, items: people, byId: new Map(people.map(item => [item.q, item])), textPhotos: new Set() };
    const musicData = Time.entriesFor(musicCtx);
    for (const type of ['born', 'oldest']) {
        const list = planMany(musicCtx, people, type, 60, type);
        assert.ok(list.length > 3, type);
        for (const planned of list) {
            assert.deepEqual(Time.check(planned, musicData), [], type);
            if (type === 'oldest') {
                const ages = planned.ids.map(id => { const entry = musicData.byId.get(id); return entry.d - entry.b; });
                const sorted = [...ages].sort((a, b) => b - a);
                assert.equal(ages[planned.correct], sorted[0]);
                assert.ok(sorted[0] - sorted[1] >= 5, 'nejdelší život jasně nejdelší');
            }
        }
    }
});

test('Kolik let bylo autorovi: věk z roku díla a narození, možnosti po 5 letech vzestupně, autorka v ženském tvaru', () => {
    indexWith();
    const items = [
        { q: 'QA', n: 'Bedřich Smetana', c: 'skladatele', k: 1, ty: 'skladatel', f: { born: 1824, died: 1884 } },
        { q: 'QW', n: 'Prodaná nevěsta', c: 'opery', k: 1, ty: 'opera', f: { year: 1866, by: 'Bedřich Smetana', byq: 'QA' } },
        { q: 'QB', n: 'Clara Schumannová', c: 'skladatele', k: 1, ty: 'skladatelka', sx: 'f', f: { born: 1819, died: 1896 } },
        { q: 'QC', n: 'Klavírní koncert a moll', c: 'dila', k: 1, ty: 'koncert', f: { year: 1835, by: 'Clara Schumannová', byq: 'QB' } }
    ];
    const ctx = { topic: { id: 'hudba', categories: [{ key: 'skladatele' }, { key: 'opery' }, { key: 'dila' }] }, items, byId: new Map(items.map(item => [item.q, item])), textPhotos: new Set() };
    const data = Time.entriesFor(ctx);
    const plans = planMany(ctx, [items[1], items[3]], 'age', 40);
    assert.ok(plans.length > 5);
    for (const planned of plans) {
        assert.deepEqual(Time.check(planned, data), []);
        const work = data.byId.get(planned.subject);
        const author = data.byId.get(planned.author);
        assert.equal(planned.ages[planned.correct], work.y - author.b);
        assert.deepEqual([...planned.ages].sort((a, b) => a - b), planned.ages);
        planned.ages.forEach((age, i) => { if (i) assert.equal(age - planned.ages[i - 1], 5); });
        assert.ok(planned.ages.every(age => age >= 10 && age <= author.d - author.b));
    }
    const smetana = Time.buildRound(plans.find(planned => planned.subject === 'QW'), ctx);
    assert.equal(smetana.question.title, 'Kolik let bylo autorovi, když toto dílo vzniklo?');
    assert.equal(smetana.question.answerLabel, '42 let');
    assert.match(smetana.description, /1866 − 1824 = 42 let/);
    const clara = Time.buildRound(plans.find(planned => planned.subject === 'QC'), ctx);
    assert.equal(clara.question.title, 'Kolik let bylo autorce, když toto dílo vzniklo?');
    assert.equal(clara.question.answerLabel, '16 let');
});

test('Kdo žil v době vzniku: osoba naživu s odstupem, ostatní zemřeli dřív nebo se narodili později; vynálezce se nenabízí', () => {
    indexWith([
        ent('Q500', 'Antonín Dvořák', 1841, 1904), ent('Q501', 'Wolfgang Amadeus Mozart', 1756, 1791), ent('Q502', 'Ludwig van Beethoven', 1770, 1827),
        ent('Q503', 'Igor Stravinskij', 1882, 1971), ent('Q504', 'Alexander Graham Bell', 1847, 1922, 'fyzika', 'vynálezce'), ent('Q505', 'Leoš Janáček', 1854, 1928),
        ent('Q506', 'Elvis Presley', 1935, 1977), ent('Q507', 'Frédéric Chopin', 1810, 1849)
    ]);
    const items = [{ q: 'QT', n: 'Telefon', c: 'vynalezy', k: 1, ty: 'vynález', f: { year: 1876, by: 'Alexander Graham Bell' } }];
    const ctx = { topic: { id: 'fyzika', categories: [{ key: 'vynalezy' }] }, items, byId: new Map(items.map(item => [item.q, item])), textPhotos: new Set() };
    const data = Time.entriesFor(ctx);
    const plans = planMany(ctx, items, 'alive', 40);
    assert.ok(plans.length > 5);
    for (const planned of plans) {
        assert.deepEqual(Time.check(planned, data), []);
        const choices = planned.ids.map(id => data.byId.get(id).n);
        assert.ok(!choices.includes('Alexander Graham Bell'), 'vynálezce by byl zjevná odpověď');
        assert.ok(['Antonín Dvořák', 'Leoš Janáček'].includes(choices[planned.correct]));
    }
    assert.equal(Time.buildRound(plans[0], ctx).question.title, 'Kdo z nich žil v době, kdy vznikl tento vynález?');
});

test('kontrola odhalí nejednoznačnou otázku (dvě správné, blízké roky, stejné názvy)', () => {
    indexWith([ent('Q600', 'A Aaa', 1685, 1750), ent('Q601', 'B Bbb', 1690, 1760), ent('Q602', 'C Ccc', 1500, 1560), ent('Q603', 'D Ddd', 1800, 1850), ent('Q604', 'E Eee', 1720, 1780)]);
    const ctx = contextFor([person('Q6', 'Isaac Newton', 1643, 1727)]);
    const data = Time.entriesFor(ctx);
    assert.ok(Time.check({ type: 'meet', subject: 'Q6', ids: ['Q600', 'Q601', 'Q602', 'Q603'], correct: 0 }, data).includes('správná není právě jedna'));
    assert.ok(Time.check({ type: 'meet', subject: 'Q6', ids: ['Q600', 'Q604', 'Q602', 'Q603'], correct: 0 }, data).some(text => /nejasný vztah/.test(text)));
    assert.deepEqual(Time.check({ type: 'meet', subject: 'Q6', ids: ['Q600', 'Q602', 'Q603', 'Q602'], correct: 0 }, data).includes('stejné názvy'), true);
    assert.deepEqual(Time.check({ type: 'born', ids: ['Q600', 'Q601', 'Q602', 'Q603'], correct: 2, dir: 'first' }, data), ['hodnoty blízko sebe']);
    assert.equal(Time.buildRound({ type: 'meet', subject: 'Q6', ids: ['Q600', 'Q601', 'Q602', 'Q603'], correct: 0, anchor: 'Q6' }, ctx), null, 'nejednoznačná otázka se nesestaví');
});

test('zadání bez sloves ve shodě s pohlavím hráče; osobnost v kartě, ne v pádě', () => {
    const titles = [];
    for (const type of Time.TYPES) {
        for (const group of Object.keys(Time.GROUPS)) {
            for (const dir of ['first', 'last']) {
                for (const kind of Object.keys(Time.KIND_ONE)) {
                    const title = Time.titleOf({ type, group, dir, kind }, { kd: kind }, { sx: dir === 'last' ? 'f' : undefined });
                    if (title) titles.push(title);
                }
            }
        }
    }
    assert.ok(titles.length > 50);
    for (const title of new Set(titles)) {
        assert.doesNotMatch(title, /\b(jsi|jste|uhodl|věděl|znal|zvolil|vybral)\b/iu, title);
        assert.match(title, /\?$/);
        assert.doesNotMatch(title, /undefined|null/);
    }
});

test('nápověda s osou ukazuje jen osobnost; známé události blízko roků možností se vynechají', () => {
    const subject = { q: 'S', n: 'Isaac Newton', b: 1643, d: 1727 };
    const choices = [{ q: 'A', n: 'Johann Sebastian Bach', b: 1685, d: 1750 }, { q: 'B', n: 'Galileo Galilei', b: 1564, d: 1642 }, { q: 'C', n: 'Albert Einstein', b: 1879, d: 1955 }, { q: 'D', n: 'Bitva na Bílé hoře', y: 1620, kd: 'udalost' }];
    const spec = Time.hintTimeline(subject, choices);
    assert.deepEqual(spec.spans, [{ kind: 'life', from: 1643, to: 1727 }]);
    const near = [1685, 1750, 1564, 1642, 1879, 1955, 1620];
    spec.anchors.forEach(([year, text]) => {
        assert.ok(near.every(other => Math.abs(other - year) > 3), `${text} ${year}`);
        assert.ok(!/bílé hoře/i.test(text));
    });
    assert.ok(!core.timelineKnown(spec, 'Kdo z nich mohl potkat tuto osobnost? Isaac Newton'));
    assert.ok(core.timelineKnown(spec, 'Isaac Newton (1643–1727)'), 'osa s roky, které hráč vidí, by nic nepřidala');
});

test('rozvržení osy výsledku: řádky uvnitř šířky, nejvýš pět značek, zkrácené dlouhé názvy', () => {
    const spec = { type: 'chronology', rows: [
        { label: 'Isaac Newton', sub: '1643–1727', from: 1643, to: 1727, role: 'subject' },
        { label: 'Invaze vojsk Varšavské smlouvy do Československa a další dlouhý název', sub: '1968', from: 1968, to: 1968, point: true, role: 'wrong' },
        { label: 'Johann Sebastian Bach', sub: '1685–1750', from: 1685, to: 1750, role: 'correct' }
    ], band: { from: 1643, to: 1727 } };
    for (const width of [300, 360, 420]) {
        const layout = Time.chronologyLayout(spec, width, 200);
        assert.ok(layout.ticks.length <= 5 && layout.ticks.length >= 2);
        for (const row of layout.rows) {
            assert.ok(row.x1 >= 0 && row.x2 <= width);
            const textWidth = row.text.length * 6.1;
            const left = row.anchor === 'start' ? row.tx : row.tx - textWidth;
            assert.ok(left >= 0 && left + textWidth <= width + 1, `${row.text} (${width})`);
        }
        assert.ok(layout.rows[1].text.includes('…'));
        assert.ok(layout.band.x1 < layout.band.x2);
    }
});

test('Kvíz dne: od začátku Časových souvislostí jedna až dvě pozice denně, ne první dvě, jen u témat s daty', () => {
    const topics = ['zemepis', 'historie', 'vlajky', 'hudba', 'biologie', 'film', 'mytologie', 'geologie', 'fyzika', 'sport'];
    assert.deepEqual(Time.quizSlots('2026-11-01', topics), [], 'dřívější dny zůstanou, jak se hrály');
    let total = 0;
    for (let day = 14; day <= 30; day++) {
        const key = `2026-11-${String(day).padStart(2, '0')}`;
        const slots = Time.quizSlots(key, topics);
        assert.deepEqual(Time.quizSlots(key, topics), slots, 'stejné pro všechny');
        assert.ok(slots.length >= 1 && slots.length <= 2, key);
        slots.forEach(index => { assert.ok(index >= 2); assert.ok(!['zemepis', 'vlajky', 'mytologie', 'geologie'].includes(topics[index])); });
        total += slots.length;
    }
    assert.ok(total / 17 < 1.7, 'v průměru méně než dvě otázky z deseti');
    assert.deepEqual(Time.quizSlots('2026-11-20', ['zemepis', 'vlajky', 'geologie']), [], 'den bez vhodných témat');
});

// --- Skutečná data všech témat ---
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/countries.json'), 'utf8')).countries;
const realContext = (topicId) => {
    const topic = require(`../topics/${topicId}.js`);
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
    return { topic, items: data.items, byId: new Map(data.items.map(item => [item.q, item])), textPhotos: new Set() };
};

test('skutečná data: data/souvislosti.json odpovídá datům témat a data/vynalezy.json', () => {
    const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/souvislosti.json'), 'utf8'));
    const extras = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/vynalezy.json'), 'utf8')).items;
    assert.ok(index.people.length > 2000 && index.dated.length > 1500);
    assert.equal(new Set([...index.people, ...index.dated].map(entry => entry.q)).size, index.people.length + index.dated.length, 'každá položka jen jednou');
    for (const entry of index.people) assert.ok(Number.isInteger(entry.b) && (entry.d === undefined || entry.d > entry.b) && !/\d/.test(entry.n), entry.n);
    for (const entry of index.dated) assert.ok(Number.isInteger(entry.y) && entry.kd && !/\d{3,4}/.test(entry.n), entry.n);
    assert.ok(extras.length >= 30);
    for (const entry of extras) {
        assert.ok(entry.t && entry.n && Number.isInteger(entry.year), entry.n);
        // Rok buď souhlasí s Wikidaty (P575, P571…), nebo je ručně ověřený z učebnic
        assert.ok((entry.wd !== undefined && Math.abs(entry.wd - entry.year) <= 2) || entry.ok === 'ucebnice', entry.n);
        assert.ok(index.dated.some(other => other.q === entry.q && other.x === 1), entry.n);
    }
});

test('skutečná data: otázky všech témat projdou kontrolou, druhy podle dat a zadání bez chyb', { timeout: 120000 }, () => {
    core.setCountries(countries);
    Time.setIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/souvislosti.json'), 'utf8')));
    const expected = {
        historie: ['meet', 'after', 'century', 'order', 'born', 'alive'], fyzika: ['meet', 'order', 'alive', 'born'], chemie: ['meet', 'order', 'born'],
        umeni: ['meet', 'age', 'born'], literatura: ['meet', 'order', 'age', 'alive'], hudba: ['meet', 'order', 'age'], film: ['order', 'age', 'alive'],
        architektura: ['order', 'meet'], sport: ['meet', 'born'], biologie: ['order', 'alive']
    };
    for (const [topicId, types] of Object.entries(expected)) {
        const ctx = realContext(topicId);
        const data = Time.entriesFor(ctx);
        const seen = new Set();
        for (let run = 0; run < 90; run++) {
            const rng = seeded(`real:${topicId}:${run}`);
            const pool = core.filterItems(ctx.items, { tier: run % 3 ? 'known' : 'all' });
            const item = core.pickRandom(pool, rng);
            const planned = Time.plan({ ctx, item, pool, rng, force: true });
            if (!planned) continue;
            seen.add(planned.type);
            assert.deepEqual(Time.check(planned, data), [], `${topicId} ${planned.type}`);
            const round = Time.buildRound(planned, ctx);
            assert.ok(round, `${topicId} ${planned.type}`);
            assert.ok(Time.isKind(round));
            assert.equal(round.question.choices.length, 4);
            assert.equal(round.question.choices.filter(choice => choice.correct).length, 1);
            assert.equal(new Set(round.question.choices.map(choice => core.normalizeAnswer(choice.label))).size, 4);
            assert.ok(Array.isArray(round.question.accepted) && round.question.accepted.length === 1);
            assert.ok(round.hints.length >= 1 && round.hints.length <= 2);
            assert.ok(round.time.rows.every(row => row.years));
            // Možnosti z jiných témat jen známé, otázka z pool
            const choiceEntries = planned.type === 'age' ? [] : planned.ids.map(id => data.byId.get(id));
            choiceEntries.filter(entry => entry.tp !== topicId).forEach(entry => assert.equal(entry.lvl, 1, entry.n));
            if (planned.subject && data.byId.get(planned.subject).tp === topicId && !data.byId.get(planned.subject).x) assert.ok(pool.some(other => other.q === planned.subject), 'osobnost z vybraných položek');
        }
        for (const type of types) assert.ok(seen.has(type), `${topicId}: druh ${type}`);
    }
});

test('skutečná data: Kvíz dne sestaví otázku pro vybrané pozice se stejným semínkem stejně', () => {
    Time.setIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/souvislosti.json'), 'utf8')));
    const ctx = realContext('hudba');
    const item = ctx.items.find(entry => entry.n === 'Antonín Dvořák');
    const first = Time.quizPlan('mudrlant-kviz-dne-2026-11-20:otazka:5', ctx, item);
    const second = Time.quizPlan('mudrlant-kviz-dne-2026-11-20:otazka:5', ctx, item);
    assert.ok(first);
    assert.deepEqual(first, second);
    assert.equal(first.anchor, item.q, 'otázka patří k položce plánu dne (pokračování po zavření aplikace)');
    const round = Time.buildRound(first, ctx);
    assert.ok(Time.idsOf(round).length >= 4);
});
