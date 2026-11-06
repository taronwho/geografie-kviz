// Knihovna auditu otázek (scripts/lib/audit.mjs): detekce prozrazení, možností, obrázků, aliasů a výjimek.
// Spuštění celého auditu: npm run audit:questions (tady jen rychlé kontroly na vymyšlených datech a malý vzorek skutečných).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const audit = () => import(path.join(__dirname, '..', 'scripts', 'lib', 'audit.mjs'));

const makeCtx = (items, id = 'historie') => ({
    topic: { id, categories: [{ key: 'osoba', label: 'Osobnosti', one: 'osobnost', icon: 'user' }], words: { one: 'věc', question: 'Kdo to je?' }, icon: 'user', facts: () => [] },
    items, byId: new Map(items.map(item => [item.q, item])), collections: [], countries: [], textPhotos: new Set(), photoMasks: {}
});
const person = (q, n, extra = {}) => ({ q, t: n, n, c: 'osoba', d: 'český panovník', f: {}, ...extra });
const round = (question, extra = {}) => ({ question, questionText: 'Panovník, který vládl dlouho.', typeLabel: 'osobnost', leadFacts: [], hints: [], questionImage: { file: 'x' }, ...extra });
const choice = (label, correct = false, id = label) => ({ label, correct, id });
const nameQuestion = (choices, accepted = ['Karel IV.'], extra = {}) => ({ type: 'name', title: 'Kdo to je?', choices, accepted, answerLabel: accepted[0], ...extra });

test('findLeak: odpověď i skloněná nebo jako přídavné jméno, ale ne cizí slova', async () => {
    const { distinguishingWords, findLeak, detectorStems } = await audit();
    const words = distinguishingWords(['Benátky'], []);
    assert.ok(findLeak('Obchodní republika v Benátkách', words), 'sedmý pád');
    assert.ok(findLeak('Benátský kupec', words), 'přídavné jméno (Benátky → benátský)');
    assert.equal(findLeak('Obchodní republika u Jadranu', words), null);
    assert.ok(detectorStems('Moskva').length > 0);
    assert.ok(findLeak('Narodil se v Praze', distinguishingWords(['Praha'], [])), 'Praha → Praze');
    assert.deepEqual(distinguishingWords(['Karel IV.'], ['Karel V.']), [], 'slovo společné se špatnou možností nic neprozradí');
});

test('auditRound: jisté chyby (kritické) a nejisté nálezy', async () => {
    const { auditRound, isCritical } = await audit();
    const karel = person('Q1', 'Karel IV.');
    const ctx = makeCtx([karel, person('Q2', 'Václav IV.'), person('Q3', 'Jan Lucemburský'), person('Q4', 'Vladislav II.')]);
    const good = nameQuestion([choice('Karel IV.', true, 'Q1'), choice('Václav IV.', false, 'Q2'), choice('Jan Lucemburský', false, 'Q3'), choice('Vladislav II.', false, 'Q4')]);
    const kinds = (found) => found.map(item => item.kind);
    assert.deepEqual(kinds(auditRound(karel, ctx, round(good))), [], 'čistá otázka bez nálezů');

    const leak = auditRound(karel, ctx, round(good, { questionText: 'Karel byl český král a císař.' }));
    assert.ok(leak.some(item => item.kind === 'prozrazeno' && isCritical(item)), 'jméno v popisu');
    const hintLeak = auditRound(karel, ctx, round(good, { hints: [{ kind: 'facts', label: 'čísla a fakta', facts: [{ label: 'Syn', value: 'otec Karla IV.' }] }] }));
    assert.ok(hintLeak.some(item => item.kind === 'prozrazeno' && /nápověda/.test(item.problem)), 'jméno v nápovědě (jiný pád)');

    const twice = nameQuestion([choice('Karel IV.', true, 'Q1'), choice('Karel IV.', false, 'Q9'), choice('Václav IV.', false, 'Q2'), choice('Vladislav II.', false, 'Q4')]);
    const duplicates = auditRound(karel, ctx, round(twice));
    assert.ok(duplicates.some(item => item.kind === 'moznosti' && /stejným textem/.test(item.problem)), 'dvě stejné možnosti');
    assert.ok(duplicates.some(item => item.kind === 'moznosti' && /přesně přijímaná/.test(item.problem)), 'nesprávná možnost je přijímaná odpověď');
    const none = nameQuestion([choice('Václav IV.'), choice('Jan Lucemburský'), choice('Vladislav II.'), choice('Karel V.')]);
    assert.ok(auditRound(karel, ctx, round(none)).some(item => item.kind === 'moznosti' && /0×/.test(item.problem)), 'žádná správná možnost');
    const empty = nameQuestion([choice('Karel IV.', true, 'Q1'), choice(''), choice('Jan Lucemburský', false, 'Q3'), choice('Vladislav II.', false, 'Q4')]);
    assert.ok(auditRound(karel, ctx, round(empty)).some(item => item.kind === 'moznosti' && /prázdná/.test(item.problem)));

    const similar = nameQuestion([choice('Karel IV.', true, 'Q1'), choice('Karel V.', false, 'Q5'), choice('Jan Lucemburský', false, 'Q3'), choice('Vladislav II.', false, 'Q4')]);
    const found = auditRound(karel, ctx, round(similar));
    const near = found.find(item => item.kind === 'moznosti-podobne');
    assert.ok(near, 'drobný rozdíl v názvu se hlásí');
    assert.equal(isCritical(near), false, 'ale nepadá na něm audit');

    const bare = auditRound(karel, ctx, round(good, { questionImage: null }));
    assert.ok(bare.some(item => item.kind === 'bez-napovedy'));
});

test('auditChoiceFit: nesprávné možnosti jiné země nebo doby', async () => {
    const { auditChoiceFit } = await audit();
    const make = (q, n, land, born) => person(q, n, { f: { land, born } });
    const correct = make('Q1', 'Karel IV.', 'Česko', 1316);
    const ctx = makeCtx([correct, make('Q2', 'Ludvík XIV.', 'Francie', 1638), make('Q3', 'Přemysl Otakar II.', 'Česko', 1233), make('Q4', 'Napoleon', 'Francie', 1769), make('Q5', 'Julius Caesar', 'Itálie', -100)]);
    const question = nameQuestion(['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].map((id, i) => choice(ctx.byId.get(id).n, i === 0, id)));
    const found = auditChoiceFit(correct, ctx, question);
    assert.deepEqual(found.map(item => item.kind), ['moznosti-zeme', 'moznosti-doba']);
    assert.match(found[0].problem, /3 z 4/);
    assert.match(found[1].problem, /3 z 4/, 'Ludvík XIV., Napoleon a Caesar jsou o víc než 200 let jinde než Karel IV.');
    assert.deepEqual(auditChoiceFit(correct, makeCtx(ctx.items, 'zemepis'), question), [], 'jen témata s osobnostmi a díly');
    assert.deepEqual(auditChoiceFit(correct, ctx, { ...question, type: 'century', match: 'century' }), []);
});

test('auditTopicData: nejednoznačná psaná odpověď (alias platí pro dvě položky) a duplicitní id', async () => {
    const { auditTopicData } = await audit();
    const ctx = makeCtx([person('Q1', 'Moskva'), person('Q2', 'Moskva'), person('Q3', 'Praha'), person('Q4', 'Brno'), person('Q1', 'Duplikát')]);
    ctx.topic.nameAliases = (item) => item.q === 'Q4' ? ['Praha'] : [];
    const found = auditTopicData(ctx);
    assert.equal(found.filter(item => item.kind === 'aliasy').length, 2, 'Moskva ×2 a alias Praha');
    assert.ok(found.some(item => item.kind === 'data' && /duplicitní/.test(item.problem)));
    const shared = makeCtx([person('Q1', 'Druh A', { im: 'Snail.jpg', ih: '53' }), person('Q2', 'Druh B', { im: 'Snail.jpg', ih: '53' }), person('Q3', 'Druh C', { im: 'Other.jpg', ih: '11' })]);
    assert.equal(auditTopicData(shared).filter(item => item.kind === 'obrazek-sdileny').length, 1, 'stejná fotka u dvou položek okruhu');
});

test('obrázky: hash souboru na Commons a kontrola dat', async () => {
    const { commonsHash, auditItemData, isCritical, TOPIC_IDS } = await audit();
    assert.equal(commonsHash('Flag of Japan.svg'), '9e', 'známý soubor z data/vlajky.json');
    assert.equal(commonsHash('Flag_of_Japan.svg'), '9e', 'mezera a podtržítko jsou totéž');
    const ctx = makeCtx([]);
    const broken = auditItemData(person('Q1', 'X', { im: 'Flag of Japan.svg', ih: 'aa' }), ctx);
    assert.ok(broken.some(item => item.kind === 'obrazek' && isCritical(item)), 'špatný hash = rozbitý obrázek');
    assert.deepEqual(auditItemData(person('Q1', 'X', { im: 'Flag of Japan.svg', ih: '9e' }), ctx).filter(item => item.kind === 'obrazek'), []);
    // skutečná data: u každé fotky hash souhlasí s názvem souboru
    const wrong = [];
    for (const id of TOPIC_IDS) {
        for (const item of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${id}.json`), 'utf8')).items) {
            if (item.im && commonsHash(item.im) !== item.ih) wrong.push(`${id}/${item.n}`);
        }
    }
    assert.deepEqual(wrong.slice(0, 5), [], 'rozbité odkazy na obrázky v datech');
});

test('výjimky a vzorek skutečného tématu', async () => {
    const { isAllowed, isCritical, auditTopic } = await audit();
    const finding = { topic: 'zemepis', q: 'Q1', kind: 'prozrazeno', type: 'name', problem: 'popis: „x“ prozrazuje odpověď' };
    assert.equal(isAllowed(finding, [{ topic: 'zemepis', q: 'Q1', kind: 'prozrazeno' }]), true);
    assert.equal(isAllowed(finding, [{ topic: 'zemepis', q: 'Q2' }]), false);
    assert.equal(isAllowed(finding, [{ topic: 'zemepis', q: 'Q1', match: 'jiný text' }]), false);
    assert.equal(isCritical({ kind: 'chudy-popis' }), false);
    const result = auditTopic('geologie', { sample: 20 });
    assert.ok(result.items > 0 && result.items <= 22, `vzorek má ${result.items} položek`);
    assert.ok(result.total > result.items);
    for (const item of result.findings) assert.ok(item.kind && item.topic === 'geologie' && item.problem !== undefined);
});
