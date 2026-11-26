// Shoda přísudku se zakrytým názvem (quiz-core.js agreementClass, neutralizeAgreement, composeRound: od AGREEMENT_FROM): tvar
// přísudku hned za zakrytým podmětem, který sedí jen na správnou možnost, se přepíše na tvar podle většiny možností. Hlášení:
// Kvíz dne, Zeměpis, „[***] jsou město, které se nachází v okrese Praha-východ…“ mezi Pískem, Kyjovem, Mikulovem a Říčany.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadContext } = require('./pipeline.js');
const core = require('../quiz-core.js');

const zemepis = loadContext('zemepis');
const byName = (name) => zemepis.items.find(item => item.n === name);
const choicesOf = (labels, correct) => labels.map(label => ({ id: (byName(label) || {}).q || label, label, correct: label === correct }));
const RICANY_INTRO = 'Říčany jsou město, které se nachází v okrese Praha-východ ve Středočeském kraji, asi 20 km jihovýchodně od centra Prahy. Žije zde přibližně 17 tisíc obyvatel.';
const ricanyRound = (options = {}) => {
    const item = byName('Říčany');
    const question = { type: 'name', title: 'Které je to místo?', showName: false, accepted: core.nameAnswers(item, []), answerLabel: item.n, placeholder: '',
        choices: choicesOf(['Písek', 'Kyjov', 'Mikulov', 'Říčany'], 'Říčany') };
    return core.composeRound({ item, ctx: zemepis, question, fetched: { ...core.processWikiText(RICANY_INTRO), fallback: false }, fallback: null,
        stableChoices: true, rng: core.createSeededRandom('ricany'), photoMasks: zemepis.photoMasks, textPhotos: zemepis.textPhotos, ...options });
};

test('pravidlo platí od dneška (2026-11-26)', () => {
    assert.equal(core.AGREEMENT_FROM, '2026-11-26');
    assert.ok(core.AGREEMENT_FROM < core.BARE_TEXT_FROM);
});

test('agreementClass: pomnožné názvy, rod v jednotném čísle, osoby', () => {
    for (const label of ['Říčany', 'Pardubice', 'Teplice', 'České Budějovice', 'Mariánské Lázně', 'Alpy', 'Vysoké Tatry', 'Krkonoše', 'Spojené státy americké', 'Filipíny', 'Seychely', 'Athény', 'Karlovy Vary']) {
        assert.equal(core.agreementClass(label), 'pl', label);
    }
    for (const label of ['Písek', 'Kyjov', 'Mikulov', 'Hradec Králové', 'Henry Ford', 'Jan Neruda']) assert.equal(core.agreementClass(label), 'm', label);
    for (const label of ['Praha', 'Plzeň', 'Paříž', 'Itálie', 'Gotika', 'Marie Curie-Skłodowská']) assert.equal(core.agreementClass(label), 'f', label);
    for (const label of ['Brno', 'Peru', 'Ústí nad Labem', 'Nové Město na Moravě', 'Rokoko']) assert.equal(core.agreementClass(label), 'n', label);
});

test('Říčany: před pravidlem „[***] jsou město…“ prozradí pomnožný název, po pravidle „[***] je město…“ a možnosti stejné', () => {
    const before = ricanyRound({ legacyAgreement: true });
    const after = ricanyRound();
    assert.match(before.texts.questionText, /^\[\*\*\*\] jsou město, které se nachází v okrese Praha-východ/);
    assert.equal(core.agreementTells(before.texts.questionText, before.question.choices).length, 1);
    assert.ok(core.agreementTells(before.texts.questionText, before.question.choices)[0].only, '„jsou“ sedí jen na Říčany');
    assert.match(after.texts.questionText, /^\[\*\*\*\] je město, které se nachází v okrese Praha-východ/);
    assert.deepEqual(core.agreementTells(after.texts.questionText, after.question.choices), []);
    assert.deepEqual(after.question.choices.map(choice => choice.label), before.question.choices.map(choice => choice.label), 'jen zobrazení: možnosti stejné');
    assert.deepEqual(after.question.choices.map(choice => choice.label), ['Písek', 'Kyjov', 'Mikulov', 'Říčany']);
});

test('neutralizeAgreement: množné číslo přísudku a příčestí za pomnožným názvem mezi jednotnými', () => {
    const choices = choicesOf(['Písek', 'Kyjov', 'Mikulov', 'Říčany'], 'Říčany');
    assert.equal(core.neutralizeAgreement('[***] byly založeny ve 13. století. [***] se nacházejí na řece.', choices), '[***] byl založen ve 13. století. [***] se nachází na řece.');
    assert.equal(core.neutralizeAgreement('Město leží u Prahy. [***] vznikly kolem roku 1200 a [***] mají 16 tisíc obyvatel.', choices),
        'Město leží u Prahy. [***] vznikl kolem roku 1200 a [***] má 16 tisíc obyvatel.');
    // Uprostřed věty (předmět, ne podmět) ani jinde se nic nemění
    assert.equal(core.neutralizeAgreement('Leží mezi městy [***] jsou blízko.', choices), 'Leží mezi městy [***] jsou blízko.');
    // Tvar, který sedí na většinu možností, zůstane
    assert.equal(core.neutralizeAgreement('[***] je město.', choices), '[***] je město.');
});

test('neutralizeAgreement: obráceně – jednotné číslo mezi většinou pomnožných názvů, a shoda bez prozrazení zůstane', () => {
    assert.equal(core.neutralizeAgreement('[***] je město v jižních Čechách.', choicesOf(['Písek', 'Říčany', 'Pardubice', 'Teplice'], 'Písek')), '[***] jsou město v jižních Čechách.');
    // Dva a dva: tvar nesedí na víc možností než druhý, nemění se
    assert.equal(core.neutralizeAgreement('[***] jsou město.', choicesOf(['Písek', 'Kyjov', 'Pardubice', 'Říčany'], 'Říčany')), '[***] jsou město.');
    // Obecné množné číslo („Tygři jsou samotáři“) u názvu v jednotném čísle nic neprozradí: tvar na správnou možnost nesedí
    assert.equal(core.neutralizeAgreement('[***] jsou obvykle samotáři.', [{ label: 'Tygr', correct: true }, { label: 'Lev' }, { label: 'Gepard štíhlý' }, { label: 'Levhart obláčkový' }]),
        '[***] jsou obvykle samotáři.');
    // Nejistá třída možnosti: nic se nemění
    assert.equal(core.neutralizeAgreement('[***] jsou město.', [{ label: 'Říčany', correct: true }, { label: 'Písek' }, { label: '1984' }]), '[***] jsou město.');
});

test('neutralizeAgreement: rod v minulém čase u míst, ne když ho nese jmenný přísudek, a ne u osob', () => {
    const praha = choicesOf(['Praha', 'Kyjov', 'Mikulov', 'Písek'], 'Praha');
    assert.equal(core.neutralizeAgreement('[***] byla založena v 9. století. [***] vznikla na Vltavě.', praha), '[***] byl založen v 9. století. [***] vznikl na Vltavě.');
    // „byla metropole“, „byla královská“: rod nese i následující slovo, přepis slovesa by nepomohl
    assert.equal(core.neutralizeAgreement('[***] byla metropole říše.', praha), '[***] byla metropole říše.');
    assert.equal(core.neutralizeAgreement('[***] byla královská rezidence.', praha), '[***] byla královská rezidence.');
    // Osoby: rod nese i podstatné jméno (vědkyně, herečka) – nemění se
    assert.equal(core.neutralizeAgreement('[***] byla v roce 1903 oceněna.', [{ label: 'Marie Curie-Skłodowská', correct: true }, { label: 'Albert Einstein' }, { label: 'Niels Bohr' }, { label: 'Max Planck' }]),
        '[***] byla v roce 1903 oceněna.');
    // Přítomný čas (je) se rodem neliší
    assert.equal(core.neutralizeAgreement('[***] je hlavní město.', praha), '[***] je hlavní město.');
});
