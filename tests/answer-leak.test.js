// Odpověď se nesmí prozradit v popisu ani v nápovědách: zakrývají se všechny tvary jména (skloňování, přepisy, rodná jména).
// Jedna společná funkce (maskLeaks v quiz-core.js) pro všechna témata a druhy otázek; test na skutečných datech všech témat
// používá vzorek úvodů článků české Wikipedie (tests/wiki-intros.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../quiz-core.js');
const P = require('./pipeline.js');

// Zbytky jména po zakrytí: slova, která po odstranění diakritiky začínají jedním z kmenů
const plain = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const stems = (text, list) => list.filter(stem => plain(text).includes(stem));

test('krátké příjmení se zakryje i ve skloněném tvaru: Poe, Poea, Poeovi, Poeova', () => {
    const names = ['Edgar Allan Poe'];
    const text = 'Havran je jedna z nejznámějších básní významného amerického básníka Edgara Allana Poea. Poeovi přinesla slávu; Poeova báseň vyšla roku 1845.';
    const masked = core.maskLeaks(text, names, { lead: true });
    assert.deepEqual(stems(masked, ['poe']), [], masked);
    assert.match(masked, /^Havran je jedna z nejznámějších básní/);
    // Běžná slova podobná krátkému jménu zůstanou (poezie, poetika, Poznaň)
    assert.equal(core.maskLeaks('Poezie, poetika a Poznaň.', names), 'Poezie, poetika a Poznaň.');
    // Starý postup (jen zakrytí názvu) skloněné příjmení nechal
    assert.match(core.censorName(text, 'Edgar Allan Poe'), /Poea/);
});

test('všechny zápisy jména: Beneš = Beneș = Benes = Benesch, rodná jména a řada jmen', () => {
    const names = ['Carol Benesch'];
    const text = 'Benesch, Carol Benesch (také Carol Beneș nebo Carol Beneš) byl architekt. Karl Benesch Böhnich se narodil v Bukurešti, rodným jménem Karl Böhnich, německy Karl Benesch.';
    const masked = core.maskLeaks(text, names, { lead: true });
    assert.deepEqual(stems(masked, ['benes', 'carol', 'karl', 'bohnich']), [], masked);
    assert.match(masked, /byl architekt\./);
    assert.match(masked, /se narodil v Bukurešti/);
    // Opačně: v datech Beneš, v textu Benesch a Beneș
    const reversed = core.maskLeaks('Rodák Carol Benesch a Beneș.', ['Karel Beneš']);
    assert.deepEqual(stems(reversed, ['benes']), [], reversed);
    // Německé přepisy přehlásek a psaní bez diakritiky
    assert.deepEqual(stems(core.maskLeaks('Mueller i Müller a Muller.', ['Müller']), ['mu']), []);
    assert.deepEqual(stems(core.maskLeaks('Antonin Dvorak, Dvořák, Dvořákovi.', ['Antonín Dvořák']), ['dvor', 'anton']), []);
});

test('zakrývání nešetří běžná slova ani to, co hráč vidí v zadání', () => {
    // Obecná slova názvu zůstanou (park, řeka), římské číslice a předložky také
    const generic = (word) => ['park', 'národní'].includes(word.toLowerCase());
    assert.equal(core.maskLeaks('Národní park Šumava leží v Česku.', ['Národní park Šumava'], { isGeneric: generic }), 'Národní park [***] leží v Česku.');
    // Malé slovo ve víceslovném názvu je přívlastek: hudební skladatel zůstane, i když je odpovědí „hudební romantismus“
    assert.equal(core.maskLeaks('Byl to hudební skladatel romantismu.', ['hudební romantismus', 'romantismus']), 'Byl to hudební skladatel romantismu.');
    // Název díla vidí hráč v zadání (Kdo to napsal? Havran) a nezakrývá se
    assert.equal(core.maskLeaks('Havran Poeův, Poe.', ['Edgar Allan Poe'], { keep: ['Havran'] }), 'Havran [***], [***].');
    assert.equal(core.maskLeaks('Havran je báseň.', ['Havran'], { keep: ['Havran'] }), 'Havran je báseň.');
    // Název série vedle autora se nezakryje (jen jména v řadě na začátku úvodu)
    assert.equal(core.maskLeaks('Kniha Letopisy Narnie Lewise.', ['Clive Staples Lewis']), 'Kniha Letopisy Narnie [***].');
    // Jiné osoby s příbuzným jménem nezmizí s ostatními větami: Nobelovu cenu zůstane
    assert.equal(core.maskLeaks('Se svým manželem Frédéricem Joliotem získala Nobelovu cenu.', ['Irène Joliot-Curie']), 'Se svým manželem Frédéricem [***] získala Nobelovu cenu.');
});

test('slova v popisu, která prozrazují odpověď, najde findLeaks', () => {
    assert.deepEqual(core.findLeaks('Poprvé vydal Poea roku 1845.', ['Edgar Allan Poe']).map(leak => leak.word), ['Poea']);
    assert.deepEqual(core.findLeaks('Dílo vyšlo v Praze.', ['Edgar Allan Poe']), []);
    // Fakt s odpovědí se jako nápověda nenabídne
    assert.equal(core.factRevealsAnswer({ label: 'Autor', value: 'Edgara Allana Poea' }, ['Edgar Allan Poe']), true);
    assert.equal(core.factRevealsAnswer({ label: 'Rok', value: '1845' }, ['Edgar Allan Poe']), false);
});

// Skutečná položka a zvláštní otázka tématu: u díla se ptá na autora, popis nesmí obsahovat žádný tvar jména autora
test('otázka „Kdo to napsal?“: autor se zakryje i ve skloněném tvaru, název díla zůstane', () => {
    const ctx = P.loadContext('literatura');
    const item = ctx.items.find(other => other.n === 'Havran');
    assert.ok(item);
    const question = P.questionsFor(ctx, item).find(q => q.type === 'author');
    assert.ok(question, 'Havran má otázku na autora');
    const extract = 'Havran je jedna z nejznámějších básní významného amerického básníka Edgara Allana Poea. Poprvé byla vydána 29. ledna 1845 v novinách New York Evening Mirror.';
    const texts = P.textsFor(ctx, item, question, extract);
    assert.deepEqual(stems(texts.questionText, ['poe']), [], texts.questionText);
    assert.match(texts.questionText, /^Havran je jedna z nejznámějších básní/);
    // Starý postup skloněné příjmení nechal
    assert.deepEqual(stems(P.legacyTextsFor(ctx, item, question, extract).questionText, ['poe']), ['poe']);
});

test('otázka na osobu: všechny tvary jména architekta, i rodné jméno', () => {
    const base = P.loadContext('architektura');
    const item = { q: 'Q999990', t: 'Carol Benesch', n: 'Carol Benesch', c: 'architekti', k: 0, ty: 'architekt', sx: 'm', d: 'rumunský architekt', f: { born: 1822, died: 1896, land: 'Rumunsko', y: 1860 } };
    const ctx = { ...base, items: [...base.items, item], genericWords: undefined, itemNames: undefined };
    const question = { type: 'name', title: 'Kdo to je?', showName: false, choices: [{ id: item.q, label: item.n, correct: true }], accepted: core.nameAnswers(item, []), answerLabel: item.n };
    const extract = 'Carol Benesch (Karl Böhnich Benesch) byl rumunský architekt. Narodil se jako Karl Benesch Böhnich ve Vídni, v Rumunsku používal jméno Carol Beneș. Je podepsán jako Benesch, Carol.';
    const texts = P.textsFor(ctx, item, question, extract);
    assert.deepEqual(stems(`${texts.questionText} ${texts.moreText}`, ['benes', 'carol', 'karl', 'bohnich']), [], `${texts.questionText} | ${texts.moreText}`);
    assert.match(texts.questionText, /byl rumunský architekt/);
});

test('popis, který je po zakrytí skoro samá mezera, se zahodí', () => {
    const ctx = P.loadContext('film');
    const item = ctx.items.find(other => other.n === 'Kmotr');
    const question = P.questionsFor(ctx, item)[0];
    const texts = core.buildQuestionTexts(item, ctx, question, { description: 'Kmotr Kmotr Kmotr Kmotr.', more: '', funFacts: [] });
    assert.equal(texts.questionText, '');
});

// --- Vlastnost na všech tématech: v zobrazeném popisu, dalších větách ani faktech nápověd není žádný token odpovědi ---
test('všechna témata: popis ani nápovědy neobsahují žádné slovo odpovědi (skutečné úvody Wikipedie)', () => {
    // Každý třetí článek vzorku (celý vzorek ověřuje skript při přípravě testu; tady kvůli rychlosti)
    const intros = P.loadIntros();
    let questions = 0;
    const failures = [];
    for (const [key, entry] of Object.entries(intros).filter((_, index) => index % 3 === 0)) {
        const [topicId, qid] = key.split(':');
        const ctx = P.loadContext(topicId);
        const item = ctx.byId.get(qid);
        if (!item) continue;
        for (const question of P.questionsFor(ctx, item)) {
            questions++;
            const shown = P.shownTextFor(ctx, item, question);
            const texts = P.textsFor(ctx, item, question, entry.extract);
            for (const [kind, text] of [['popis', texts.questionText], ['další věty', texts.moreText], ...texts.facts.map(fact => [`fakt ${fact.label}`, fact.value])]) {
                const leaked = P.leakedWords(text, texts.names, ctx, shown);
                if (leaked.length) failures.push(`${item.n} [${question.type}] ${kind}: ${leaked.join(', ')} – ${text}`);
            }
        }
    }
    assert.ok(questions >= 500, `vzorek má jen ${questions} otázek`);
    assert.deepEqual(failures.slice(0, 5), [], `${failures.length} úniků z ${questions} otázek`);
});

test('starý postup měl v tomto vzorku netěsnosti, nový žádné', () => {
    const intros = P.loadIntros();
    // Jen osoby a díla (tam odpověď prozrazují tvary jména nejčastěji); starý postup má v tomto vzorku netěsnosti, nový žádné
    let legacy = 0;
    let current = 0;
    for (const [key, entry] of Object.entries(intros).filter((_, index) => index % 2 === 0)) {
        const [topicId, qid] = key.split(':');
        if (!['literatura', 'hudba', 'sport', 'umeni'].includes(topicId)) continue;
        const ctx = P.loadContext(topicId);
        const item = ctx.byId.get(qid);
        if (!item) continue;
        for (const question of P.questionsFor(ctx, item)) {
            const shown = P.shownTextFor(ctx, item, question);
            const old = P.legacyTextsFor(ctx, item, question, entry.extract);
            const now = P.textsFor(ctx, item, question, entry.extract);
            if (P.leakedWords(old.questionText, old.names, ctx, shown).length) legacy++;
            if (P.leakedWords(now.questionText, now.names, ctx, shown).length) current++;
        }
    }
    assert.ok(legacy > 0, 'starý postup má ve vzorku aspoň jednu netěsnost (Poea u Havrana, sportovci…)');
    assert.equal(current, 0);
});
