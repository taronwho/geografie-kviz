// Jednoznačnost otázek (quiz-core.js: rozlišující údaj, výměna nesprávných možností, composeRound; conquest.js completeQuestion):
// už bez nápovědy musí otázka ukázat údaj, který platí pro správnou odpověď a pro žádnou ze tří nesprávných. Vzorek otázek všech
// témat a her (hlavní hra, Kvíz dne, výzvy, Dobývání) sestavený jako ve hře hlídá, že se to nevrátí (scripts/audit-jednoznacnost.mjs
// dělá totéž na tisících otázek a píše reports/jednoznacnost.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadContext } = require('./pipeline.js');
const core = require('../quiz-core.js');
const Conquest = require('../conquest.js');

const byName = (ctx, name, category = null) => ctx.items.find(item => item.n === name && (!category || item.c === category));
const questionOf = (ctx, answer, wrong) => ({
    type: 'name', title: 'Kdo to je?', showName: false, accepted: [answer.n], answerLabel: answer.n,
    choices: [answer, ...wrong].map(other => ({ id: other.q, label: other.n, correct: other === answer }))
});
const WERICH_TEXT = '[***] byl český filmový a divadelní herec, komik, dramatik a filmový scénárista, písňový textař a spisovatel.';

test('Jan Werich mezi Högerem, Peškem a Marvanem: obecný popis ani léta života odpověď neurčí, rozlišující údaj ano (film, který ostatní nemají)', () => {
    const ctx = loadContext('film');
    const werich = byName(ctx, 'Jan Werich');
    const others = ['Karel Höger', 'Ladislav Pešek', 'Jaroslav Marvan'].map(name => byName(ctx, name));
    const question = questionOf(ctx, werich, others);
    const before = core.identifyAnswer({ item: werich, ctx, question, text: WERICH_TEXT });
    assert.equal(before.ok, false);
    assert.equal(before.open.length, 3);
    // Roky narození a úmrtí jsou moc blízko (1905–1980 × 1901–1974 a 1906–1986): nevyvracejí
    const years = core.clueFactsOf(werich, ctx).facts.filter(fact => fact.kind === 'years');
    assert.ok(years.length >= 2);
    for (const fact of years) assert.ok(!others.every(other => core.contradicts(fact, other, ctx)), `${fact.label} ${fact.value}`);
    const { clue, open } = core.clueFor({ item: werich, ctx, question, text: WERICH_TEXT });
    assert.equal(open.length, 0);
    assert.equal(clue.length, 1);
    assert.equal(clue[0].label, 'Film');
    assert.ok(werich.f.films.includes(clue[0].value));
    for (const other of others) assert.ok(!(other.f.films || []).includes(clue[0].value));
    // Baron Prášil hrál i Höger: takový film rozlišujícím údajem není
    assert.notEqual(clue[0].value, 'Baron Prášil');
    assert.ok(core.identifyAnswer({ item: werich, ctx, question, text: WERICH_TEXT, facts: clue }).ok);
});

test('Rozlišení údajů: navazující funkční období rozliší, rok blízko ne, číslo až 1,5×, stát podle dnešního státu, dílo i s vazbou z druhé strany', () => {
    const history = loadContext('historie');
    const [harding, coolidge, taft, hoover] = ['Warren G. Harding', 'Calvin Coolidge', 'William Howard Taft', 'Herbert Hoover'].map(name => byName(history, name));
    const office = core.clueFactsOf(harding, history).facts.find(fact => fact.label === 'V úřadu');
    assert.ok(office && office.term);
    for (const other of [coolidge, taft, hoover]) assert.ok(core.contradicts(office, other, history), other.n);
    const death = core.clueFactsOf(harding, history).facts.find(fact => fact.label === 'Úmrtí');
    assert.equal(core.contradicts(death, taft, history), false, 'úmrtí 1923 × 1930 je moc blízko');
    assert.equal(core.contradicts(death, hoover, history), true);
    // Čísla a texty
    const fact = (label, value) => core.parseClueFact({ f: {} }, label, value)[0];
    const fake = (facts) => ({ q: `Q${Math.random()}`, n: 'X', f: {}, facts });
    const ctx = { topic: { facts: (item) => item.facts }, items: [] };
    assert.equal(core.contradicts(fact('Výška', 'až 66 cm'), fake([{ label: 'Výška', value: 'až 1,5 m' }]), ctx), true);
    assert.equal(core.contradicts(fact('Výška', 'až 66 cm'), fake([{ label: 'Výška', value: 'až 80 cm' }]), ctx), false);
    assert.equal(core.contradicts(fact('Země', 'Česko'), fake([{ label: 'Země', value: 'Československo' }]), ctx), false);
    assert.equal(core.contradicts(fact('Země', 'Česko'), fake([{ label: 'Země', value: 'Polsko' }]), ctx), true);
    assert.equal(core.contradicts(fact('Sloh', 'Gotika'), fake([{ label: 'Sloh', value: 'Pozdní gotika' }]), ctx), false);
    assert.equal(core.contradicts(fact('Sloh', 'Gotika'), fake([{ label: 'Sloh', value: 'Baroko' }]), ctx), true);
    // Bez údaje u nesprávné možnosti nevíme: nevyvrací
    assert.equal(core.contradicts(fact('Sloh', 'Gotika'), fake([]), ctx), false);
    assert.equal(core.contradicts(fact('Století', '19. století'), fake([{ label: 'Století', value: '18.–19. století' }]), ctx), false);
    assert.equal(core.contradicts(fact('Století', '19. století'), fake([{ label: 'Století', value: '15. století' }]), ctx), true);
});

test('Obecný popis se prodlouží o další větu s konkrétním údajem; konkrétní popis zůstane, jak je', () => {
    assert.equal(core.isSpecificText(WERICH_TEXT), false);
    assert.equal(core.isSpecificText('[***] byl český herec, který hrál v Osvobozeném divadle.'), true);
    assert.equal(core.isSpecificText('[***] je film z roku 1951.'), true);
    const ctx = loadContext('film');
    const werich = byName(ctx, 'Jan Werich');
    const question = questionOf(ctx, werich, ['Karel Höger', 'Ladislav Pešek', 'Jaroslav Marvan'].map(name => byName(ctx, name)));
    const fetched = core.processWikiText('Jan Werich byl český filmový a divadelní herec, komik, dramatik a filmový scénárista, písňový textař, spisovatel a vypravěč pohádek pro děti. '
        + 'S Jiřím Voskovcem založil Osvobozené divadlo. Proslavil se rolemi v komediích.');
    const extended = core.buildQuestionTexts(werich, ctx, question, { ...fetched, fallback: false });
    assert.match(extended.questionText, /Osvobozené divadlo/);
    assert.doesNotMatch(extended.moreText, /Osvobozené divadlo/);
    const plain = core.buildQuestionTexts(werich, ctx, question, { ...fetched, fallback: false }, { extend: false });
    assert.doesNotMatch(plain.questionText, /Osvobozené/);
});

// Malé téma: stavby, které se liší jen slohem; Beta a Gama mají stejný sloh jako Alfa, Delta jiný
const toyContext = () => {
    const make = (q, n, style, sim) => ({ q, t: n, n, c: 'stavby', k: 1, f: {}, style, sim });
    const items = [make('QA', 'Alfa', 'Gotika', 0), make('QB', 'Beta', 'Gotika', 5), make('QC', 'Gama', 'Gotika', 4), make('QD', 'Delta', 'Baroko', 3),
        make('QE', 'Epsilon', 'Renesance', 2), make('QF', 'Fí', 'Klasicismus', 1), make('QG', 'Gotická kopie', 'Gotika', 6)];
    const topic = { id: 'hracka', words: { one: 'stavba', question: 'Co je to?' }, categories: [{ key: 'stavby', one: 'stavba', question: 'Která stavba to je?' }],
        facts: (item) => [{ label: 'Sloh', value: item.style }], similarity: (item, other) => other.sim };
    return { topic, items, byId: new Map(items.map(item => [item.q, item])), countries: {} };
};
test('composeRound: nesprávnou možnost, kterou nic nevyvrací, vymění za co nejpodobnější, kterou údaj vyvrací (pevné pořadí bez náhody); pevné možnosti nemění', () => {
    const ctx = toyContext();
    const [alfa, beta, gama, delta] = ctx.items;
    const question = { ...questionOf(ctx, alfa, [beta, gama, delta]), title: 'Která stavba to je?' };
    const fetched = { description: 'Stavba.', funFacts: [], more: '', fallback: true };
    const run = () => core.composeRound({ item: alfa, ctx, question, fetched, rng: core.createSeededRandom('x') });
    const first = run();
    assert.equal(first.ambiguous, false);
    assert.ok(first.swapped);
    // Beta a Gama (stejný sloh) pryč, Delta zůstala, místo nich nejpodobnější jiného slohu; Gotická kopie má sloh stejný
    assert.deepEqual(first.question.choices.map(choice => choice.label), ['Alfa', 'Epsilon', 'Fí', 'Delta']);
    assert.deepEqual(run().question.choices, first.question.choices);
    assert.ok(core.identifyAnswer({ item: alfa, ctx, question: first.question, facts: [...first.plan.leadFacts, ...first.plan.clue] }).ok);
    // Pevné možnosti (Dobývání) se nemění: otázka je nejednoznačná a ukáže, co jde
    const fixed = core.composeRound({ item: alfa, ctx, question, fetched, rng: core.createSeededRandom('x'), fixed: true });
    assert.deepEqual(fixed.question.choices, question.choices);
    assert.equal(fixed.ambiguous, true);
    // Bez úpravy (stav před) se nic nemění ani neukazuje
    const before = core.composeRound({ item: alfa, ctx, question, fetched, rng: core.createSeededRandom('x'), unique: false });
    assert.deepEqual(before.question.choices, question.choices);
    assert.deepEqual(before.plan.clue, []);
    // Výměnu denní módy do svého dne nedělají (swaps: false): jen co nejlepší údaje
    const today = core.composeRound({ item: alfa, ctx, question, fetched, rng: core.createSeededRandom('x'), swaps: false });
    assert.deepEqual(today.question.choices, question.choices);
});

test('Dobývání: completeQuestion přidá rozlišující údaj, když popis a fakta nevyvrátí všechny možnosti; bez údaje otázku vzdá', () => {
    const pending = { form: 'text', pending: true, prompt: 'Kdo to je?', choices: [{ label: 'A', correct: true }, { label: 'B' }, { label: 'C' }, { label: 'D' }], request: {} };
    const text = 'Toto je dost dlouhý popis z článku, který má rozhodně víc než čtrnáct skutečných slov a nic neprozradí o odpovědi.';
    const unique = { wrong: ['b', 'c', 'd'], text: ['b'], clues: [{ label: 'Film', value: 'X', excludes: ['b', 'c', 'd'] }] };
    const done = Conquest.completeQuestion(pending, { text, origin: 'article', facts: [], unique });
    assert.deepEqual(done.content.clue, [{ label: 'Film', value: 'X' }]);
    assert.equal(Conquest.completeQuestion(pending, { text, origin: 'article', facts: [], unique: { ...unique, clues: [] } }), null);
    // Popis, který vyvrátí všechny, údaj nepotřebuje
    assert.equal(Conquest.completeQuestion(pending, { text, origin: 'article', facts: [], unique: { ...unique, text: ['b', 'c', 'd'] } }).content.clue, undefined);
    // Fakta: počítá se jen to, co otázka opravdu ukáže
    const facts = { ...pending, form: 'facts' };
    const shown = [{ label: 'Rok', value: '1900', excludes: ['b', 'c'] }, { label: 'Země', value: 'Česko', excludes: ['d'] }];
    assert.equal(Conquest.completeQuestion(facts, { text: '', origin: 'article', facts: shown, unique: { ...unique, text: [] } }).content.clue, undefined);
    // Starší app.js bez údajů o jednoznačnosti: beze změny
    assert.equal(Conquest.completeQuestion(pending, { text, origin: 'article', facts: [] }).content.clue, undefined);
});

test('Vzorek her a témat: po úpravě odpověď určí to, co hráč vidí bez nápovědy (nebo ji hra nepoloží); rozlišující údaj nic neprozradí', async () => {
    const { contextOf, fetchedTextOf, loadIntros, questionFromRng, assemble, evaluate, TOPIC_IDS } = await import(path.join(__dirname, '..', 'scripts', 'lib', 'jednoznacnost.mjs'));
    const intros = loadIntros();
    const failures = [];
    let before = 0;
    let total = 0;
    let skipped = 0;
    for (const topicId of TOPIC_IDS) {
        const ctx = contextOf(topicId);
        for (const level of [1, 2, 3]) {
            const items = ctx.items.filter(item => !item.nq && core.levelOf(item) === level);
            for (let n = 0; n < 4 && items.length; n++) {
                const item = items[Math.floor((n * 7919 + level * 104729) % items.length)];
                const fetched = fetchedTextOf(topicId, item, intros);
                const seed = `test-jedno|${topicId}|${item.q}`;
                const made = (after) => { const rng = core.createSeededRandom(seed); const { question, special } = questionFromRng(item, ctx, rng); return assemble({ item, ctx, question, special, fetched, after, rng }); };
                const old = evaluate(made(false), ctx);
                const round = made(true);
                const now = evaluate(round, ctx);
                if (!['popis', 'ukázka', 'jméno'].includes(now.kind)) continue;
                total += 1;
                if (!old.ok) before += 1;
                if (round.ambiguous) { skipped += 1; continue; }
                if (!now.ok && !now.definition) failures.push(`${topicId}/${item.n}: ${now.open.join(', ')}`);
                for (const fact of round.plan.clue || []) {
                    assert.equal(core.answerWordsLeft(fact.value, round.question.choices).length, 0, `${item.n}: ${fact.value}`);
                    assert.ok(!core.factRevealsAnswer(fact, core.answerNamesFor(round.question, item, ctx)), `${item.n}: ${fact.value}`);
                }
            }
        }
    }
    assert.ok(total >= 120, `posouzeno ${total}`);
    assert.ok(before > total * 0.1, `před úpravou nejednoznačných ${before} z ${total}`);
    assert.deepEqual(failures, []);
    // Otázky, které nejde určit ani výměnou, ani otázkou se jménem, hra v tréninku nahradí jinou položkou: jen výjimečně
    assert.ok(skipped <= total * 0.08, `nepoložených ${skipped} z ${total}`);
});
