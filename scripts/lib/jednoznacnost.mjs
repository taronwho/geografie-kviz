// Jednoznačnost otázek (scripts/audit-jednoznacnost.mjs, tests/jednoznacnost.test.js): sestaví otázku stejně jako hra
// (app.js createRoundData: texty buildQuestionTexts, konflikty replaceConflicts, nápovědy planRound, výměna nesprávných možností
// uniqueChoices) – stav „před“ (bez rozlišujícího údaje, bez prodloužení popisu a bez výměny) i „po“ – a posoudí, jestli to, co
// hráč vidí bez nápovědy (zadání, štítek, zakrytý popis, fakta u chudého popisu, rozlišující údaj, obrázek otázky), odpověď mezi
// čtyřmi možnostmi určí. Posouzení je strukturované (quiz-core.js identifyAnswer): každá nesprávná možnost musí mít v datech
// aspoň jeden ukázaný údaj jasně jinak; z volného textu se počítá jen údaj z dat správné odpovědi, který text zmiňuje.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { core, loadContext, categoryOf, visualInfo, TOPIC_IDS } from './audit.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DailyQuiz = require(path.join(ROOT, 'daily-quiz.js'));
export const Conquest = require(path.join(ROOT, 'conquest.js'));
export { TOPIC_IDS };

// --- Úvody článků z Wikipedie: tests/wiki-intros.json a volitelně další soubor stejného tvaru ({ items: { 'téma:Q…': { t, extract } } }) ---
export const loadIntros = (files = []) => {
    const intros = new Map();
    for (const file of [path.join(ROOT, 'tests', 'wiki-intros.json'), ...files].filter(Boolean)) {
        if (!fs.existsSync(file)) continue;
        const json = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [key, entry] of Object.entries(json.items || {})) if (entry && entry.extract) intros.set(key, entry.extract);
    }
    return intros;
};
// Text otázky jako v app.js fetchItemText: úvod článku, jinak krátký popis z Wikidat (jako při výpadku Wikipedie)
export const fetchedTextOf = (topicId, item, intros) => {
    const extract = intros && intros.get(`${topicId}:${item.q}`);
    if (extract && extract.length > 40) return { ...core.processWikiText(extract), fallback: false };
    const short = item.d ? `${item.d.charAt(0).toUpperCase()}${item.d.slice(1)}.` : '';
    return { description: short, funFacts: [], more: '', fallback: true };
};

// --- Otázka jako v createRoundData ---
const contexts = new Map();
export const contextOf = (topicId) => {
    if (!contexts.has(topicId)) contexts.set(topicId, loadContext(topicId));
    return contexts.get(topicId);
};
// Otázka na název (createRoundData bez zvláštní otázky): stejné volání rng jako ve hře
export const nameQuestionOf = (item, ctx, rng, wrong = null) => {
    const { topic } = ctx;
    const category = categoryOf(topic, item.c);
    return {
        type: 'name',
        title: (topic.questionTitle && topic.questionTitle(item)) || category.question || topic.words.question,
        showName: false,
        choices: wrong ? core.shuffle([item, ...wrong].map(other => ({ id: other.q, label: other.n, correct: other === item })), rng)
            : core.buildItemChoices(item, ctx.items, rng, other => topic.similarity ? topic.similarity(item, other, ctx) : 0, core.cultureLandsFor(topic, ctx)),
        accepted: core.nameAnswers(item, topic.nameAliases ? topic.nameAliases(item, ctx) : []),
        placeholder: category.placeholder || topic.words.placeholder,
        answerLabel: item.n
    };
};
// Otázka ze semínka jako ve hře: nejdřív zvláštní otázka tématu (plain = jen otázka na název), pak otázka na název
export const questionFromRng = (item, ctx, rng, { plain = false, wrong = null } = {}) => {
    const special = plain || wrong ? null : (ctx.topic.specialQuestion ? ctx.topic.specialQuestion(item, ctx, rng) : null);
    return { question: special || nameQuestionOf(item, ctx, rng, wrong), special: Boolean(special) };
};
// Sestavení otázky stejnou funkcí jádra jako hra (quiz-core.js composeRound). after: false = stav před úpravou (bez rozlišujícího
// údaje, prodloužení popisu a výměny možností); fixed = pevné nesprávné možnosti (Dobývání); swaps = smí se možnosti vyměnit
export const assemble = ({ item, ctx, question, special = false, fetched, after = true, fixed = false, swaps = true, plain = false, rng = Math.random }) => {
    const shown = ctx.topic.questionImage ? ctx.topic.questionImage(item, ctx, question.type) : null;
    const composed = core.composeRound({ item, ctx, question, special, fetched, shown, rng, photoUrl: null, describeVisual: visualInfo, photoMasks: ctx.photoMasks || {},
        textPhotos: ctx.textPhotos || new Set(), swaps, fixed, plain, unique: after });
    const nowShown = ctx.topic.questionImage ? ctx.topic.questionImage(item, ctx, composed.question.type) : null;
    return { item, ...composed, shown: nowShown };
};

// --- Posouzení: určí to, co hráč vidí bez nápovědy, odpověď? ---
// Zvláštní otázka se jménem (Kdo film režíroval? Ve kterém století?): odpověď určí jméno, pokud ji nesplňuje i nesprávná možnost
// (spolurežisér: obě jména v témže faktu; dílo téhož autora: nesprávné dílo má v datech stejné jméno)
const relationClash = (question, item, ctx) => {
    if (question.match) return null;
    const correct = (question.choices || []).find(choice => choice.correct);
    if (!correct) return null;
    // Celé jméno jako souvislý úsek hodnoty (metr za sekundu není v „kilogram metr čtvereční za sekundu“)
    const phrase = (value, label) => ` ${core.normalizeAnswer(value)} `.includes(` ${core.normalizeAnswer(label)} `);
    const facts = ctx.topic.facts(item, ctx, 'result').map(fact => String(fact.value));
    const naming = facts.filter(value => phrase(value, correct.label));
    for (const choice of question.choices.filter(entry => !entry.correct)) {
        if (naming.some(value => phrase(value, choice.label) && !phrase(correct.label, choice.label))) return choice.label;
        const other = ctx.byId.get(choice.id);
        const own = ctx.byId.get(correct.id);
        if (other && own && other.c === own.c && other.q !== item.q) {
            const labelsNaming = (entry) => new Set(ctx.topic.facts(entry, ctx, 'result').filter(fact => phrase(String(fact.value), item.n)).map(fact => fact.label));
            const mine = labelsNaming(own);
            if (mine.size && [...labelsNaming(other)].some(label => mine.has(label))) return choice.label;
        }
    }
    return null;
};
// Vrátí { kind, ok, strict, open: [jména nevyvrácených], via } – kind: 'popis' (otázka na název bez obrázku), 'ukázka' (obrázek
// jen ukazuje druh: nerost, sloh), 'obrázek' (obrázek věci samé: obraz, vlajka, stavba), 'jméno' (zvláštní otázka se jménem),
// 'jiné' (možnosti nejsou položky tématu), 'mapa'
export const evaluate = (round, ctx, { text = null, facts = null } = {}) => {
    const { item, question } = round;
    if (question.type === 'map') return { kind: 'mapa', ok: true, strict: true, open: [] };
    if (question.showName || question.match) {
        const clash = relationClash(question, item, ctx);
        return { kind: 'jméno', ok: !clash, strict: !clash, open: clash ? [clash] : [] };
    }
    if (question.type !== 'name') return { kind: 'jiné', ok: true, strict: true, open: [] };
    const example = round.shown && ctx.topic.exampleImage && ctx.topic.exampleImage(item, ctx);
    if (round.shown && !example) return { kind: 'obrázek', ok: true, strict: true, open: [] };
    const wrong = core.wrongItemsOf(question, ctx);
    if (!wrong) return { kind: 'jiné', ok: true, strict: true, open: [] };
    const visible = text !== null ? text : round.shown ? [question.title, round.typeLabel].filter(Boolean).join(' · ') : round.plan.visibleText;
    const shownFacts = facts !== null ? facts : [...(round.plan.leadFacts || []), ...(round.plan.clue || [])];
    const check = core.identifyAnswer({ item, ctx, question, text: visible, facts: shownFacts });
    const strict = check.shown.some(fact => wrong.every(other => core.contradicts(fact, other, ctx)));
    const fromText = core.identifyAnswer({ item, ctx, question, text: visible, facts: [] });
    const via = !check.ok ? 'nic' : fromText.ok ? 'popis' : (round.plan.clue || []).length ? 'rozlišující údaj' : 'fakta';
    return { kind: example ? 'ukázka' : 'popis', ok: check.ok, strict, open: check.open.map(other => other.n), via };
};
