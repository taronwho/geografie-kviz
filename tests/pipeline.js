// Pomocné funkce testů: sestavení otázky z dat tématu stejně jako aplikace (app.js: createRoundData) – bez prohlížeče a sítě.
// Úvody článků Wikipedie jsou v tests/wiki-intros.json (vzorek položek všech témat, stejný dotaz jako v aplikaci).
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(COUNTRIES);

const TOPIC_IDS = fs.readdirSync(path.join(ROOT, 'topics')).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
const contexts = new Map();
const loadContext = (topicId) => {
    if (!contexts.has(topicId)) {
        const topic = require(path.join(ROOT, 'topics', `${topicId}.js`));
        const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
        contexts.set(topicId, { topic, items: data.items, collections: data.collections, countries: COUNTRIES, byId: new Map(data.items.map(item => [item.q, item])) });
    }
    return contexts.get(topicId);
};
let intros = null;
const loadIntros = () => {
    if (!intros) intros = JSON.parse(fs.readFileSync(process.env.WIKI_INTROS || path.join(__dirname, 'wiki-intros.json'), 'utf8')).items;
    return intros;
};

const categoryOf = (topic, key) => topic.categories.find(category => category.key === key) || { key, label: key, one: topic.words.one };

// Otázky, které aplikace u položky položí: na název a zvláštní druhy tématu (autor, režisér, stát, století…).
// Zvláštní druh vybírá téma podle čísla z rng, proto se zkouší několik hodnot.
const questionCache = new Map();
const questionsFor = (ctx, item) => {
    const key = `${ctx.topic.id}:${item.q}`;
    if (!questionCache.has(key)) questionCache.set(key, buildQuestions(ctx, item, item.q));
    return questionCache.get(key);
};
const buildQuestions = (ctx, item, seed) => {
    const { topic } = ctx;
    const category = categoryOf(topic, item.c);
    const rng = core.createSeededRandom(seed);
    const name = {
        type: 'name',
        title: category.question || topic.words.question,
        showName: false,
        choices: core.buildItemChoices(item, ctx.items, rng, other => topic.similarity ? topic.similarity(item, other, ctx) : 0, core.cultureLandsFor(topic, ctx)),
        accepted: core.nameAnswers(item, topic.nameAliases ? topic.nameAliases(item, ctx) : []),
        answerLabel: item.n
    };
    const questions = [name];
    const seen = new Set();
    if (topic.specialQuestion) {
        for (const roll of [0.02, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 0.95]) {
            const special = topic.specialQuestion(item, ctx, () => roll);
            if (special && !seen.has(special.type)) { seen.add(special.type); questions.push(special); }
        }
    }
    return questions;
};

// Popis, další věty a fakta nápověd tak, jak je uvidí hráč. extract = text úvodu článku (stejný jako z Wikipedie v aplikaci)
const textsFor = (ctx, item, question, extract) => {
    const { topic } = ctx;
    const fetched = core.processWikiText(extract);
    const { questionText, moreText } = core.buildQuestionTexts(item, ctx, question, fetched, { special: question.type !== 'name' });
    const names = core.answerNamesFor(question, item, ctx);
    const isGeneric = (word) => core.isGenericWord(word, core.genericWordsOf(ctx));
    const rootNames = question.type === 'name' && names.length ? core.specificWords(names, core.genericWordsOf(ctx)) : '';
    const plan = (topic.hints && topic.hints(item, ctx, question.type)) || [{ kind: 'facts', facts: topic.facts(item, ctx, question.type) }];
    const facts = plan.filter(step => step.kind === 'facts').flatMap(step => step.facts || [])
        .filter(fact => !core.factRevealsAnswer(fact, names, { isGeneric, rootNames }));
    return { names, questionText, moreText, facts };
};

// Starý postup (před společnou ochranou): jen zakrytí názvu bez kontroly všech tvarů jména; fakta podle zakrytí názvu
const legacyTextsFor = (ctx, item, question, extract) => {
    const { topic } = ctx;
    const fetched = core.processWikiText(extract);
    const censorText = (value) => core.mergeCensored(core.censorForItem(question.type, core.hideOtherChoices(value, question, ctx), item, ctx).replaceAll(core.CHOICE_MARK, '[***]'));
    const text = { ...fetched, ...core.chooseDescription(fetched.description, fetched.more, censorText, { startOk: sentence => !core.OUT_OF_CONTEXT.test(sentence) }) };
    const questionText = censorText(text.description);
    const moreText = question.type !== 'name' || !text.more ? '' : censorText(core.stripFactSentences(text.more, topic.facts(item, ctx, question.type)));
    const names = core.answerNamesFor(question, item, ctx);
    const answers = names.join(', ');
    const plan = (topic.hints && topic.hints(item, ctx, question.type)) || [{ kind: 'facts', facts: topic.facts(item, ctx, question.type) }];
    const facts = plan.filter(step => step.kind === 'facts').flatMap(step => step.facts || [])
        .filter(fact => !(answers && core.censorName(String(fact.value), answers).includes('[***]')));
    return { names, questionText, moreText, facts };
};

// Nezávislá kontrola úniku (jiný postup než zakrývání): slovo textu je shodné se slovem odpovědi nebo jeho skloněným tvarem
// po odstranění diakritiky, rumunských, německých a dalších zvláštních písmen i přepisů (sch = š). Obecná slova názvu, předložky,
// členy a římské číslice se nepočítají; obecné slovo malým písmenem (vlajka, obecný) musí být shodné celé, vlastní jméno i skloněné.
const STOP_TOKENS = new Set(['the', 'and', 'von', 'van', 'der', 'den', 'del', 'dos', 'bin', 'ibn', 'ben', 'des', 'las', 'los', 'san', 'nad', 'pod', 'ter', 'ten', 'les', 'sir']);
const fold = (word) => core.normalizeAnswer(word).replace(/sch/g, 's').replace(/[wv]/g, 'v').replace(/y/g, 'i').replace(/(.)\1+/g, '$1');
const answerWords = (names, ctx) => {
    const isGeneric = (word) => core.isGenericWord(word, core.genericWordsOf(ctx));
    const tokens = new Map();
    for (const name of names) {
        const words = core.stripBrackets(name).split(/[^\p{L}\p{M}]+/u).filter(Boolean);
        const specific = words.filter(word => !isGeneric(word));
        for (const word of (specific.length ? specific : words)) {
            const folded = fold(word);
            // Malé slovo ve víceslovném názvu (hudební romantismus) je jen přívlastek, ne jméno
            if (words.length > 1 && !/^\p{Lu}/u.test(word)) continue;
            if (folded.length >= 3 && !/^[ivxlc]+$/.test(folded) && !STOP_TOKENS.has(folded)) tokens.set(folded, /^\p{Lu}/u.test(word));
        }
    }
    return tokens;
};
const leakedWords = (text, names, ctx, shownText = '') => {
    const tokens = answerWords(names, ctx);
    const shown = new Set((shownText.match(/[\p{L}\p{M}]+/gu) || []).map(fold));
    return (String(text || '').match(/[\p{L}\p{M}]+/gu) || []).filter(word => {
        const folded = fold(word);
        if (folded.length < 3 || shown.has(folded) || /^[ivxlc]+$/.test(folded)) return false;
        for (const [token, proper] of tokens) {
            if (folded === token) return true;
            if (!proper) continue;
            if (token.length >= 4) {
                // skloněný nebo přivlastňovací tvar (Kafkovi, Benešova) i zkrácený tvar (Beneš – Bene)
                if (folded.startsWith(token) && folded.length - token.length <= 4) return true;
                if (token.startsWith(folded) && token.length - folded.length <= 1 && folded.length >= 5) return true;
            } else if (/^\p{Lu}/u.test(word) && folded.startsWith(token) && /^(?:[aeiouy]|em|ou|ovi|ova|ovy|ovu|ovo|ove|ovim|ovou)$/.test(folded.slice(token.length))) {
                // krátké příjmení (Poe, Li): jen skloněný tvar velkým písmenem
                return true;
            }
        }
        return false;
    });
};
// Co hráč vidí v zadání (a smí to tedy zůstat v popisu): otázka, název díla u „Kdo to napsal?“, druh položky, slova, která téma ponechává
const shownTextFor = (ctx, item, question) => [question.title, question.showName ? item.n : '', item.ty, ...(ctx.topic.keepWords ? ctx.topic.keepWords(question.type, item, ctx) : [])].filter(Boolean).join(' ');

module.exports = { shownTextFor, ROOT, COUNTRIES, TOPIC_IDS, loadContext, loadIntros, questionsFor, textsFor, legacyTextsFor, leakedWords, categoryOf };
