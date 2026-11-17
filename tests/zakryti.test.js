// Zakrytí odpovědi v popisu otázky (quiz-core.js: censorItemName, sealAnswerWords, answerWordsLeft, buildQuestionTexts): slovo
// správné možnosti, které ji mezi ukázanými možnostmi odliší, se zakryje ve všech tvarech (i obecné slovo tématu a 2. pád množného
// čísla s vloženým e), slova oboru a jiná slova, která nic neprozradí, zůstanou čitelná, a nečitelný popis (samé [***]) se nahradí.
// Případy z hlášení hráčů (Kvíz dne): Chemická syntéza (chemie, reakce) a Kukačka obecná (biologie, ptáci).
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../quiz-core.js');
const P = require('./pipeline.js');

// Otázka na název s danými možnostmi tak, jak ji staví hra (createRoundData), a texty, které hráč uvidí
const questionWith = (ctx, item, labels) => {
    const category = P.categoryOf(ctx.topic, item.c);
    return {
        type: 'name', title: category.question || ctx.topic.words.question, showName: false,
        choices: labels.map(label => { const other = ctx.items.find(entry => entry.n === label); return { id: other ? other.q : label, label, correct: label === item.n }; }),
        accepted: core.nameAnswers(item, ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : []), answerLabel: item.n
    };
};
const textsOf = (topicId, name, labels, intro) => {
    const ctx = P.loadContext(topicId);
    const item = ctx.items.find(entry => entry.n === name);
    assert.ok(item, `${name} v datech ${topicId}`);
    const question = questionWith(ctx, item, labels);
    const short = { description: item.d ? `${item.d.charAt(0).toUpperCase()}${item.d.slice(1)}.` : '', more: '', fallback: true };
    return { ctx, item, question, ...core.buildQuestionTexts(item, ctx, question, core.processWikiText(intro), { short }) };
};
const masks = (text) => (String(text).match(/\[\*\*\*\]/g) || []).length;

const SYNTEZA = 'Chemická syntéza má dva významy: chemická reakce a obor chemie. Slovo syntéza poprvé v chemii použil německý chemik Hermann Kolbe.';
const SYNTEZA_CHOICES = ['Substituční reakce', 'Fotosyntéza', 'Elektrolýza', 'Chemická syntéza'];

test('Chemická syntéza: slovo syntéza (jen správná možnost ho má) se zakryje, slova oboru chemie zůstanou', () => {
    const { questionText, question, item, ctx } = textsOf('chemie', 'Chemická syntéza', SYNTEZA_CHOICES, SYNTEZA);
    assert.equal(questionText, '[***] má dva významy: chemická reakce a obor chemie. Slovo [***] poprvé v chemii použil německý chemik Hermann Kolbe.');
    // Výrazné slovo se zakryje ve všech tvarech, i když je to obecné slovo tématu (genericWordsOf: syntéza)
    assert.ok(core.genericWordsOf(ctx).has('syntéza'));
    const forms = core.hideAnswer('Syntézy, syntéze, syntézu, syntézou a syntéz je mnoho. Syntetický je jiné slovo.', question, item, ctx);
    assert.equal(forms, '[***] je mnoho. Syntetický je jiné slovo.');
    // Nezávislá kontrola ve zakrytém textu nic nenajde; v nezakrytém syntézu najde, chemii ne
    assert.deepEqual(core.answerWordsLeft(questionText, question.choices), []);
    assert.deepEqual(core.answerWordsLeft('Slovo syntéza poprvé v chemii použil chemik.', question.choices), ['syntéza']);
    // Celý název se zakryje ve všech tvarech jedním blokem
    assert.equal(core.hideAnswer('Chemickou syntézou vzniká produkt.', question, item, ctx), '[***] vzniká produkt.');
});

test('Chemická syntéza: před MASK_RULES_FROM (výběr možností denních módů) zakrytí jako dřív', () => {
    const ctx = P.loadContext('chemie');
    const item = ctx.items.find(entry => entry.n === 'Chemická syntéza');
    const question = questionWith(ctx, item, SYNTEZA_CHOICES);
    const legacy = core.withLegacyMasking(true, () => core.buildQuestionTexts(item, ctx, question, core.processWikiText(SYNTEZA)).questionText);
    assert.equal(legacy, '[***] má dva významy: [***] reakce a obor [***]. Slovo syntéza poprvé v [***] použil německý [***] Hermann Kolbe.');
    assert.equal(core.MASK_RULES_FROM, '2026-11-18');
});

const KUKACKA = 'Kukačka obecná (Cuculus canorus) je druh ptáka z řádu kukaček a čeledi kukačkovitých. V Evropě jde společně s příbuznou kukačkou chocholatou o jediného zástupce kukaček a současně o jediný ptačí druh patřící mezi obligátní hnízdní parazity.';
const KUKACKA_CHOICES = ['Straka obecná', 'Kukačka obecná', 'Krahujec obecný', 'Slípka zelenonohá'];

test('Kukačka obecná: kukaček (2. pád množného čísla s vloženým e) se zakryje, společné slovo obecná zůstane', () => {
    const { ctx, item, question } = textsOf('biologie', 'Kukačka obecná', KUKACKA_CHOICES, KUKACKA);
    const hidden = core.hideAnswer(core.processWikiText(KUKACKA).description, question, item, ctx, { lead: true });
    assert.doesNotMatch(hidden, /kuka/iu, hidden);
    for (const form of ['kukaček', 'kukačce', 'kukačkou', 'kukačky', 'Kukaček']) {
        assert.equal(core.hideAnswer(`Je mezi ${form} vidět.`, question, item, ctx), 'Je mezi [***] vidět.', form);
        assert.deepEqual(core.answerWordsLeft(`Je mezi ${form} vidět.`, question.choices), [form], form);
    }
    // Slovo, které mají i jiné možnosti (obecná u Straky a Krahujce), nic neprozradí a zůstane
    assert.equal(core.hideAnswer('Je to obecná věc.', question, item, ctx), 'Je to obecná věc.');
});

test('Kukačka obecná: popis s příliš mnoha zakrytými místy se nahradí čitelnou větou úvodu', () => {
    const { questionText } = textsOf('biologie', 'Kukačka obecná', KUKACKA_CHOICES, KUKACKA);
    // Celý úvod by měl pět [***] (≥ MAX_DESCRIPTION_MASKS): popisem je druhá věta
    assert.equal(questionText, 'V Evropě jde společně s příbuznou [***] chocholatou o jediného zástupce [***] a současně o jediný ptačí druh patřící mezi obligátní hnízdní parazity.');
    assert.ok(masks(questionText) < core.MAX_DESCRIPTION_MASKS);
});

test('vložené e a střídání souhlásek u výrazného slova: matka, okno, sestra, Praha', () => {
    const choices = (label, ...wrong) => [{ label, correct: true }, ...wrong.map(other => ({ label: other, correct: false }))];
    const sealed = (text, label) => core.sealAnswerWords(text, choices(label, 'Otec rodu', 'Dům obecní'));
    assert.equal(sealed('Mnoho matek.', 'Matka obecná'), 'Mnoho [***].');
    assert.equal(sealed('Patří matce.', 'Matka obecná'), 'Patří [***].');
    assert.equal(sealed('Matku a dítě.', 'Matka obecná'), '[***] a dítě.');
    assert.equal(sealed('Bez oken.', 'Okno obecné'), 'Bez [***].');
    assert.equal(sealed('Pět sester.', 'Sestra obecná'), 'Pět [***].');
    // Brno ani Praha vložené e nemají (Bren-, Prah- by zakrylo běžná slova)
    assert.equal(core.getWordStems('Brno').includes('Bren'), false);
});

test('čitelnost popisu: aspoň MAX_DESCRIPTION_MASKS zakrytých míst nebo víc než MAX_READABLE_MASK_SHARE slov je nepoužitelné', () => {
    assert.equal(core.tooManyMasks('[***] je řeka.'), false);
    assert.equal(core.tooManyMasks('[***] je řeka v [***] a [***] u [***] města.'), true);
    assert.equal(core.tooManyMasks('[***] a [***] jsou dvě slova.'), true);
    assert.equal(core.tooManyMasks('[***] je dlouhá řeka ve střední Evropě, která teče přes [***] do Severního moře a má mnoho přítoků.'), false);
});
