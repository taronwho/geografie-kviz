// Neinformativní popis (quiz-core.js isBareText, composeRound: od BARE_TEXT_FROM): popis, ve kterém po zakrytí zbyde jen obecný
// druh a rod („Druh ptáka rodu [***].“), se neukáže. Otázku pak nesou fakta ukázaná hned (nejvíc rozlišující mezi možnostmi)
// a u zvířat a rostlin fotka zdarma jako obrázek otázky (leadPhoto). Hlášení: Biologie, „Co je to za ptáka?“ mezi Supem
// mrchožravým, Supem bělohlavým, Orlosupem bradatým a Motákem pilichem s popisem „Druh ptáka rodu [***].“ a jediným faktem Hmotnost.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadContext } = require('./pipeline.js');
const core = require('../quiz-core.js');

const biologie = loadContext('biologie');
const SUP = 'Q33504';
const supQuestion = () => ({
    type: 'name', title: 'Co je to za ptáka?', showName: false, accepted: core.nameAnswers(biologie.byId.get(SUP), []), answerLabel: 'Sup mrchožravý', placeholder: '',
    choices: [SUP, 'Q177856', 'Q126167', 'Q25572'].map(id => ({ id, label: biologie.byId.get(id).n, correct: id === SUP }))
});
// Úvod článku tak, jak ho vrací cs.wikipedia.org: po zakrytí „[***] je nejmenší a nejohroženější evropský [***].“ je nečitelný
// (tooManyMasks) a nahradí ho krátký popis z Wikidat „Druh ptáka rodu [***].“
const SUP_INTRO = 'Sup mrchožravý (Neophron percnopterus) je nejmenší a nejohroženější evropský sup.';
const compose = (options = {}) => core.composeRound({ item: biologie.byId.get(SUP), ctx: biologie, question: supQuestion(), fetched: { ...core.processWikiText(SUP_INTRO), fallback: false },
    stableChoices: true, swaps: true, rng: core.createSeededRandom('sup'), photoMasks: biologie.photoMasks, textPhotos: biologie.textPhotos, ...options });

test('pravidlo platí od zítřka (2026-11-27)', () => {
    assert.equal(core.BARE_TEXT_FROM, '2026-11-27');
    assert.ok(core.MASK_RULES_FROM < core.BARE_TEXT_FROM);
});

test('isBareText: obecný druh a rod bez údaje je neinformativní, číslo, jméno nebo dvě obsahová slova ne', () => {
    const known = 'Co je to za ptáka? · pták · ptáci';
    assert.equal(core.isBareText('Druh ptáka rodu [***].', { known }), true);
    assert.equal(core.isBareText('', { known }), true);
    assert.equal(core.isBareText('[***] je obec v okrese [***].', { known: 'Která je to obec? · obec' }), true);
    assert.equal(core.isBareText('[***] je nejmenší a nejohroženější evropský [***].', { known }), false);
    assert.equal(core.isBareText('Druh ptáka rodu Neophron.', { known }), false, 'vlastní jméno je údaj');
    assert.equal(core.isBareText('Americký film z roku 2005.', { known: 'Který je to film? · film' }), false, 'číslo je údaj');
    assert.equal(core.isBareText('Druh dravého ptáka z Afriky.', { known }), false);
    assert.equal(core.isBareText('Hlavní město [***].', { known: 'Co je to za místo? · město' }), false, 'hlavní město samo zařadí');
    assert.equal(core.isBareText('Mytické zvíře.', { known: 'Co je to za bytost?' }), false);
});

test('Sup mrchožravý: před pravidlem popis „Druh ptáka rodu [***].“ a jediný fakt Hmotnost', () => {
    const before = compose({ legacyBare: true, photoReady: true });
    assert.equal(before.texts.questionText, 'Druh ptáka rodu [***].');
    assert.deepEqual(before.plan.leadFacts.map(fact => fact.label), ['Hmotnost']);
    assert.equal(before.leadPhoto, null);
});

test('Sup mrchožravý: po pravidle bez popisu, fotka je součástí otázky zdarma (bez nápovědy Fotka) a možnosti se nezmění', () => {
    const before = compose({ legacyBare: true, photoReady: true });
    const after = compose({ photoReady: true });
    assert.equal(after.texts.questionText, '');
    assert.equal(after.texts.bare, true);
    assert.ok(after.leadPhoto, 'fotka je obrázek otázky');
    assert.equal(after.leadPhoto.file, biologie.byId.get(SUP).im);
    assert.ok(!after.plan.hints.some(hint => hint.kind === 'photo'), 'fotka už není placená nápověda');
    assert.equal(after.plan.thin, false, 'otázku nese fotka');
    assert.deepEqual(after.question.choices.map(choice => choice.label), before.question.choices.map(choice => choice.label), 'jen zobrazení: možnosti stejné');
    assert.equal(after.ambiguous, false);
    // Fakta zůstanou nápovědou a žádný neprozradí odpověď
    const facts = after.plan.hints.filter(hint => hint.kind === 'facts').flatMap(hint => hint.facts);
    assert.ok(facts.some(fact => fact.label === 'Hmotnost'));
    for (const fact of facts) assert.ok(!/mrchožrav/i.test(String(fact.value)), `${fact.label}: ${fact.value}`);
});

test('Sup mrchožravý bez načtené fotky: popis se neukáže, ukážou se fakta (Hmotnost) a hádá se dál podle nich', () => {
    const after = compose({ photoReady: false });
    assert.equal(after.texts.questionText, '');
    assert.equal(after.leadPhoto, null);
    assert.equal(after.plan.thin, true);
    assert.ok(after.plan.leadFacts.some(fact => fact.label === 'Hmotnost'));
    assert.ok(core.identifyAnswer({ item: biologie.byId.get(SUP), ctx: biologie, question: after.question, facts: [...after.plan.leadFacts, ...after.plan.clue] }).ok);
});

test('fotka zdarma ne v Tajemné otázce ani v Dobývání (pevné možnosti) a jen u témat, která ji chtějí (topic.leadPhoto)', () => {
    assert.equal(compose({ photoReady: true, plain: true }).leadPhoto, null);
    assert.equal(compose({ photoReady: true, fixed: true, swaps: false }).leadPhoto, null);
    assert.equal(typeof biologie.topic.leadPhoto, 'function');
    const film = loadContext('film');
    assert.equal(film.topic.leadPhoto, undefined);
});

test('rankLeadFacts: nejdřív fakt, který vyvrátí nejvíc nesprávných možností', () => {
    const item = biologie.byId.get(SUP);
    const wrong = ['Q177856', 'Q126167', 'Q25572'].map(id => biologie.byId.get(id));
    const facts = [{ label: 'Řád', value: 'dravci' }, { label: 'Hmotnost', value: 'až 2 kg' }];
    assert.deepEqual(core.rankLeadFacts(facts, item, biologie, wrong).map(fact => fact.label), ['Hmotnost', 'Řád']);
    assert.deepEqual(core.rankLeadFacts(facts, item, biologie, []).map(fact => fact.label), ['Řád', 'Hmotnost'], 'bez možností pořadí tématu');
});
