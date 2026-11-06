// Audit kvality otázek: sestaví každou otázku, kterou téma pro položku umí (název, stát, století, autor, značka…), stejně jako
// hra – stejnými funkcemi jádra (quiz-core.js) a tématu (topics/*.js) – a hledá v ní chyby: odpověď prozrazenou v popisu nebo
// nápovědě, nápovědu opakující popis, rozbité možnosti, chudý popis a rozbitá data.
//
// Popis otázky bere hra z úvodu článku na Wikipedii (za běhu, přes síť); bez sítě hraje s krátkým popisem z Wikidat (pole d).
// Audit pracuje bez sítě, proto hodnotí popis z Wikidat a volitelně uložené úvody z Wikipedie (cache { titulek: text }).
// Skládání otázky (zakrytí, nápovědy) má hra v app.js (createRoundData, buildHints, censorFor); funkce zde je zrcadlí
// bez DOM a sítě – při změně app.js je třeba upravit i tento soubor (hlídá tests/audit.test.js).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const core = require(path.join(ROOT, 'quiz-core.js'));
const {
    isRealPhoto, commonsPhotoUrl, displayName, createSeededRandom, censorName, mergeCensored, processWikiText, stripFactSentences,
    takeLeadFacts, normalizeAnswer, buildItemChoices, nameAnswers, dropKnownFacts, scaleKnown, dropChoiceNames, sharesWordRoot,
    chooseDescription, getWordStems, isAnswerMatch, centuryOf, setCountries, levenshtein
} = core;

// --- Načtení témat a dat ---
export const TOPIC_IDS = fs.readdirSync(path.join(ROOT, 'topics')).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
export const loadTopic = (id) => require(path.join(ROOT, 'topics', `${id}.js`));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
let countriesCache = null;
export const loadCountries = () => {
    if (!countriesCache) {
        countriesCache = readJson('data/countries.json').countries;
        setCountries(countriesCache);
    }
    return countriesCache;
};
const safeJson = (file, fallback) => { try { return readJson(file); } catch (e) { return fallback; } };
// Kontext tématu jako v app.js (loadTopic): položky, okruhy, tabulka států, rejstřík, fotky s napsanou odpovědí
export const loadContext = (id, { items = null } = {}) => {
    const topic = loadTopic(id);
    const data = items ? { items, collections: [] } : readJson(topic.dataFile);
    const countries = loadCountries();
    const photoText = safeJson('data/photo-text.json', {});
    const photoMasks = safeJson('data/photo-masks.json', {});
    const ctx = { topic, items: data.items, collections: data.collections || [], countries, byId: new Map(data.items.map(item => [item.q, item])), photoMasks };
    ctx.textPhotos = new Set((photoText[id] || []).map(qid => (ctx.byId.get(qid) || {}).im).filter(file => file && !photoMasks[file]));
    return ctx;
};

// --- Zrcadlo app.js: zakrytí popisu (censorFor) ---
const GENERIC_NAME_WORDS = new Set(['národní', 'park', 'přírodní', 'rezervace', 'chráněná', 'krajinná', 'oblast', 'poloostrov', 'ostrov', 'ostrovy',
    'souostroví', 'moře', 'záliv', 'zátoka', 'jezero', 'řeka', 'hora', 'pohoří', 'vodopád', 'vodopády', 'poušť', 'nížina', 'průliv', 'kanál', 'údolí',
    'katedrála', 'chrám', 'kostel', 'bazilika', 'hrad', 'zámek', 'palác', 'most', 'věž', 'muzeum', 'náměstí', 'klášter', 'mešita', 'synagoga',
    'bitva', 'válka', 'obléhání', 'revoluce', 'povstání', 'říše', 'království', 'císařství', 'republika', 'jednotka', 'energie', 'síla', 'kyselina', 'kyseliny',
    'socha', 'pomník', 'busta', 'obraz', 'portrét', 'album', 'opera', 'symfonie', 'koncert', 'píseň', 'film', 'román', 'povídka', 'báseň']);
export const genericWordsOf = (ctx) => {
    if (!ctx.genericWords) {
        const counts = new Map();
        for (const other of ctx.items) {
            for (const word of new Set(other.n.split(/\s+/).slice(1).filter(word => /^\p{Ll}{4,}$/u.test(word)).map(word => word.toLocaleLowerCase('cs')))) counts.set(word, (counts.get(word) || 0) + 1);
        }
        ctx.genericWords = new Set([...counts].filter(([, count]) => count >= 4).map(([word]) => word));
    }
    return ctx.genericWords;
};
const isGenericWord = (word, extra) => GENERIC_NAME_WORDS.has(word.toLocaleLowerCase('cs')) || Boolean(extra && extra.has(word.toLocaleLowerCase('cs')));
const specificWords = (names, extra = null) => names.filter(Boolean).map(name => {
    const words = name.split(/\s+/);
    const kept = words.filter(word => !isGenericWord(word, extra));
    return kept.length ? kept.join(' ') : name;
}).join(', ');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const absorbGenericWords = (text, names, mark = '[***]', extra = null) => {
    const generic = [...new Set(names.filter(Boolean).flatMap(name => name.split(/\s+/)).filter(word => isGenericWord(word, extra)))];
    if (!generic.length || !text.includes(mark)) return text;
    const stems = generic.map(word => escapeRegExp(word.slice(0, Math.max(3, word.length - 2)))).join('|');
    const markPattern = escapeRegExp(mark);
    const after = new RegExp(`${markPattern}(?:\\s+(?:${stems})\\p{L}*(?![\\p{L}]))+`, 'giu');
    const before = new RegExp(`(?<![\\p{L}])(?:(?:${stems})\\p{L}*\\s+)+${markPattern}`, 'giu');
    return text.replace(after, mark).replace(before, mark);
};
const hideNicknames = (text, item) => {
    const roots = [item.n, displayName(item.t || '')].join(' ').split(/[\s\-–,.]+/).filter(word => word.length >= 5).map(word => normalizeAnswer(word).slice(0, 4));
    return mergeCensored(text.replace(/(?<![\p{L}\p{N}])\p{Lu}\p{L}{3,}/gu, word => roots.includes(normalizeAnswer(word).slice(0, 4)) ? '[***]' : word));
};
export const censorFor = (type, text, item, ctx) => {
    if (!text) return '';
    const custom = ctx.topic.censor ? ctx.topic.censor(type, text, item, ctx) : null;
    if (custom !== null && custom !== undefined) return custom;
    const aliases = ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : [];
    const names = [item.n, displayName(item.t || ''), ...aliases];
    const extra = genericWordsOf(ctx);
    return hideNicknames(mergeCensored(absorbGenericWords(censorName(text, specificWords(names, extra)), names, '[***]', extra)), item);
};
const CHOICE_MARK = '';
const hideOtherChoices = (text, question, ctx) => {
    if (!text || question.match) return text;
    if (!ctx.itemNames) ctx.itemNames = new Set(ctx.items.map(other => normalizeAnswer(other.n)));
    const labels = question.choices.filter(choice => !choice.correct && ctx.itemNames.has(normalizeAnswer(choice.label))).map(choice => choice.label);
    const extra = genericWordsOf(ctx);
    return labels.length ? absorbGenericWords(censorName(text, specificWords(labels, extra)), labels, '[***]', extra).replaceAll('[***]', CHOICE_MARK) : text;
};
const OUT_OF_CONTEXT = /^(?:ten|ta|to|ti|ty|tento|tato|toto|tito|tyto|tomuto|tohoto|této|těchto|tuto|tím|jeho|její|jejich|on|ona|ono|oni|ony|část|ostatní|také|rovněž|dále|však|proto|tam|zde|odtud|později|nicméně|přesto)(?![\p{L}])/iu;

// --- Zrcadlo app.js: nápovědy (buildHints) ---
const VISUAL_INFO = {
    map: { name: 'slepá mapa', icon: 'map' }, timeline: { name: 'časová osa', icon: 'calendar-range' }, periodic: { name: 'periodická tabulka', icon: 'grid-3x3' },
    scale: { name: 'stupnice', icon: 'ruler' }, image: { name: 'obrázek', icon: 'image' }
};
export const visualInfo = (spec) => {
    const visual = VISUAL_INFO[spec && spec.type];
    if (!visual) return null;
    return { name: spec.name || visual.name, icon: spec.icon || visual.icon };
};
const timelineVisible = (spec, text) => {
    if (spec.type !== 'timeline' || spec.blind) return false;
    const years = [...(spec.points || []), ...(spec.spans || []).flatMap(span => [span.from, span.to])].filter(year => Number.isFinite(year) && year >= 100);
    return years.length > 0 && years.every(year => new RegExp(`(?<!\\d)${year}(?!\\d)`).test(text));
};
export const buildHints = (plan, { photoUrl, visibleText, shared = new Set(), answers = '', textPhotos = new Set(), omit = [], rootCheck = false, extraGeneric = null, photoMasks = {} }) => {
    const rootNames = rootCheck && answers ? specificWords(answers.split(', '), extraGeneric) : '';
    const revealsAnswer = (fact) => Boolean(answers) && (censorName(String(fact.value), answers).includes('[***]')
        || (Boolean(rootNames) && sharesWordRoot(String(fact.value), rootNames)));
    const hints = [];
    let shownBefore = '';
    for (const step of plan) {
        let hint = null;
        if (step.kind === 'photo' && photoUrl) hint = { kind: 'photo', label: 'fotka', icon: 'image' };
        if (step.kind === 'excerpt' && step.text) hint = { kind: 'excerpt', text: step.text, label: 'další věty', icon: 'book-open' };
        const textImage = step.spec && step.spec.type === 'image' && textPhotos.has(step.spec.file);
        if (step.kind === 'visual' && step.spec && visualInfo(step.spec) && !timelineVisible(step.spec, visibleText) && !scaleKnown(step.spec, visibleText) && !textImage) {
            const masks = step.spec.type === 'image' && photoMasks[step.spec.file];
            hint = { kind: 'visual', spec: masks ? { ...step.spec, masks } : step.spec, label: visualInfo(step.spec).name, icon: visualInfo(step.spec).icon };
        }
        if (step.kind === 'facts') {
            const facts = dropChoiceNames(dropKnownFacts(step.facts || [], step.label ? visibleText : `${visibleText} · ${shownBefore}`), omit)
                .filter(fact => (step.label || !shared.has(`${fact.label}\u0000${fact.value}`)) && !revealsAnswer(fact));
            if (facts.length) hint = { kind: 'facts', facts, label: step.label || 'čísla a fakta', icon: step.icon || 'info', extra: Boolean(step.label) };
        }
        if (!hint) continue;
        if (hint.kind === 'facts') shownBefore += ` · ${hint.facts.map(fact => fact.value).join(' · ')}`;
        if (hint.kind === 'visual' && hint.spec.type === 'timeline' && !hint.spec.blind) {
            shownBefore += ` · ${[...(hint.spec.points || []), ...(hint.spec.spans || []).flatMap(span => [span.from, span.to])].filter(year => Number.isFinite(year) && year >= 100).join(' · ')}`;
        }
        let key = hint.kind;
        for (let n = 2; hints.some(other => other.key === key); n++) key = `${hint.kind}-${n}`;
        hints.push({ key, ...hint });
    }
    return hints;
};
const hintAnswers = (question, item, aliases = []) => {
    if (question.match) return '';
    if (question.type === 'name') return [item.n, displayName(item.t || ''), ...aliases.filter(alias => alias !== (item.f || {}).lat)].join(', ');
    return question.accepted.join(', ');
};

// --- Varianty otázky položky ---
export const categoryOf = (topic, key) => topic.categories.find(category => category.key === key) || { key, label: key, one: topic.words.one, icon: topic.icon };
// Generátor, který první voláním vrátí zvolený „hod“ (který druh otázky), dál běží ze semínka – stejné pořadí volání jako ve hře
const rollThen = (roll, seed) => {
    const seeded = createSeededRandom(seed);
    let first = true;
    return () => { if (first) { first = false; return roll; } return seeded(); };
};
// Hody, které u všech témat trefí každou větev specialQuestion (podíly 0,2–0,8 a hranice „≥ 1 − podíl“)
const ROLLS = [0.05, 0.22, 0.28, 0.33, 0.42, 0.55, 0.78, 0.9];
export const nameQuestion = (item, ctx, rng) => {
    const { topic, items } = ctx;
    const category = categoryOf(topic, item.c);
    return {
        type: 'name',
        title: category.question || topic.words.question,
        showName: false,
        choices: buildItemChoices(item, items, rng, other => topic.similarity ? topic.similarity(item, other, ctx) : 0),
        accepted: nameAnswers(item, topic.nameAliases ? topic.nameAliases(item, ctx) : []),
        placeholder: category.placeholder || topic.words.placeholder,
        answerLabel: item.n
    };
};
// Všechny druhy otázek, které téma pro položku umí (každý druh jednou); special = otázka ze specialQuestion, jinak otázka na název
export const questionVariants = (item, ctx) => {
    const { topic } = ctx;
    const variants = [];
    const seen = new Set();
    let plain = !topic.specialQuestion;
    for (const roll of ROLLS) {
        if (!topic.specialQuestion) break;
        const rng = rollThen(roll, `audit:${topic.id}:${item.q}:${roll}`);
        const special = topic.specialQuestion(item, ctx, rng);
        if (!special) { plain = true; continue; }
        const key = `${special.type}|${special.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        variants.push({ question: special, special: true, roll });
    }
    if (plain) variants.push({ question: nameQuestion(item, ctx, createSeededRandom(`audit:${topic.id}:${item.q}:name`)), special: false, roll: null });
    return variants;
};

// --- Sestavení otázky (zrcadlo createRoundData bez sítě) ---
const MIN_DESCRIPTION_WORDS = 14;
const MIN_EXCERPT_WORDS = 8;
export const realWords = (text) => String(text || '').replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word)).length;
const photoOf = (item) => isRealPhoto(item.im) && item.ih ? commonsPhotoUrl(item.im, item.ih, 960) : null;
// Text otázky: úvod z Wikipedie (cache), jinak krátký popis z Wikidat jako při výpadku sítě
export const textOf = (item, wiki = null) => {
    const extract = wiki && wiki[item.t];
    if (extract && extract.length > 40) return { ...processWikiText(extract), fallback: false };
    const shortDescription = item.d ? `${item.d.charAt(0).toUpperCase()}${item.d.slice(1)}.` : '';
    return { description: shortDescription, funFacts: [], more: '', fallback: true };
};
// variant = { question, special } z questionVariants (special = otázka ze specialQuestion tématu, jako v createRoundData)
export const assembleRound = (item, ctx, variant, text) => {
    const { topic } = ctx;
    const question = variant.question || variant;
    const isSpecial = Boolean(variant.special);
    const category = categoryOf(topic, item.c);
    const shown = topic.questionImage ? topic.questionImage(item, ctx, question.type) : null;
    const censorText = (value) => mergeCensored(censorFor(question.type, hideOtherChoices(value, question, ctx), item, ctx).replaceAll(CHOICE_MARK, '[***]'));
    const chosen = text.fallback ? text : { ...text, ...chooseDescription(text.description, text.more, censorText, { startOk: sentence => !OUT_OF_CONTEXT.test(sentence) }) };
    const photoUrl = photoOf(item);
    const visual = topic.visual ? topic.visual(item, ctx, question.type) : null;
    const typeLabel = item.ty && !censorFor(question.type, item.ty, item, ctx).includes('[***]') ? item.ty : category.one;
    const questionText = censorText(chosen.description);
    const thin = !shown && !isSpecial && (chosen.fallback || realWords(questionText) < MIN_DESCRIPTION_WORDS);
    const basePlan = (topic.hints && topic.hints(item, ctx, question.type))
        || [{ kind: 'photo' }, { kind: 'visual', spec: visual }, { kind: 'facts', facts: topic.facts(item, ctx, question.type) }];
    const moreText = isSpecial || !chosen.more ? '' : censorText(stripFactSentences(chosen.more, topic.facts(item, ctx, question.type)));
    const plan = realWords(moreText) >= MIN_EXCERPT_WORDS ? [{ kind: 'excerpt', text: moreText }, ...basePlan] : basePlan;
    const visibleText = [question.title, question.showName ? item.n : '', typeLabel, questionText, realWords(moreText) >= MIN_EXCERPT_WORDS ? moreText : ''].join(' · ');
    const wrongItems = question.type === 'name' ? question.choices.filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id)).filter(Boolean) : [];
    const factKeys = (other) => new Set(topic.facts(other, ctx, question.type).map(fact => `${fact.label}\u0000${fact.value}`));
    const wrongFacts = wrongItems.map(factKeys);
    const shared = new Set(wrongFacts.length ? [...factKeys(item)].filter(key => wrongFacts.every(keys => keys.has(key))) : []);
    let hints = buildHints(plan, {
        photoUrl: (shown && shown.file === item.im) || ctx.textPhotos.has(item.im) ? null : photoUrl,
        visibleText, shared, answers: hintAnswers(question, item, topic.nameAliases ? topic.nameAliases(item, ctx) : []), textPhotos: ctx.textPhotos,
        rootCheck: question.type === 'name', extraGeneric: genericWordsOf(ctx), photoMasks: ctx.photoMasks || {},
        omit: question.match ? [] : (question.choices || []).filter(choice => !choice.correct).map(choice => choice.label)
    });
    let leadFacts = [];
    if (thin) ({ hints, leadFacts } = takeLeadFacts(hints));
    return { question, questionText, typeLabel, questionImage: shown, photoUrl, hints, leadFacts, thin, visibleText, description: chosen.description, fallback: Boolean(chosen.fallback) };
};

// --- Hlídač prozrazení: přísnější než zakrytí ve hře (bez diakritiky, s odvozenými přídavnými jmény a čísly) ---
const SKIP_WORDS = new Set(['nad', 'pod', 'na', 've', 'de', 'la', 'le', 'les', 'des', 'du', 'di', 'da', 'del', 'der', 'die', 'das', 'am', 'an', 'im', 'of', 'the', 'and', 'et', 'san', 'saint', 'sankt',
    'al', 'el', 'ad', 'as', 'ar', 'az', 'ibn', 'bin', 'ben', 'von', 'van', 'zu', 'den', 'ten', 'ter', 'dos', 'do', 'y', 'století', 'stoleti', 'stát', 'státy', 'státu', 'států', 'státní', 'stat', 'staty', 'statu', 'statu', 'statni', 'léta', 'leta', 'mytologie', 'hornina', 'vyvřelina', 'vyvrelina']);
const isRomanNumeral = (word) => /^[IVXLC]+\.?$/.test(word);
const splitWords = (text) => String(text || '').split(/[\s,\-–:;!?„“”"…\/()]+/).filter(Boolean);
const textWordsOf = (text) => normalizeAnswer(String(text || '').replace(/\[\*\*\*\]/g, ' ')).split(' ').filter(Boolean);
// Kmeny slova odpovědi: kmeny jádra (bez diakritiky) a navíc tvary, které jádro neodvodí (Benátky → benátský)
export const detectorStems = (word) => {
    const stems = new Set(getWordStems(word).map(normalizeAnswer));
    const plain = normalizeAnswer(word);
    stems.add(plain);
    if (word.length >= 6 && /ky$/iu.test(word)) stems.add(plain.slice(0, -2));
    return [...stems].map(stem => stem.trim()).filter(stem => stem.length >= 4);
};
// Slova odpovědi, podle kterých se pozná: bez předložek, čísel, obecných slov a slov společných s nesprávnými možnostmi
// Slova, která se opakují v mnoha názvech tématu („Státní“ ve „Státní znak …“, „vlajka“): sama nic neprozradí, jen pojmenují druh věci
export const commonTitleWordsOf = (ctx) => {
    if (!ctx.commonTitleWords) {
        const counts = new Map();
        for (const other of ctx.items) {
            for (const word of new Set([other.n, other.t].filter(Boolean).flatMap(name => splitWords(name)).map(word => normalizeAnswer(word)).filter(word => word.length >= 4))) counts.set(word, (counts.get(word) || 0) + 1);
        }
        ctx.commonTitleWords = new Set([...counts].filter(([, count]) => count >= 15).map(([word]) => word));
    }
    return ctx.commonTitleWords;
};
export const distinguishingWords = (answers, wrongLabels, extra = null, common = null) => {
    const wrongStems = new Set(wrongLabels.flatMap(label => splitWords(label).flatMap(word => detectorStems(word))));
    const words = [];
    for (const answer of answers) {
        for (const word of splitWords(answer)) {
            if (word.length < 4 || isRomanNumeral(word) || /^\d/.test(word) || SKIP_WORDS.has(word.toLowerCase()) || isGenericWord(word, extra) || (common && common.has(normalizeAnswer(word)))) continue;
            const stems = detectorStems(word).filter(stem => !wrongStems.has(stem));
            if (stems.length) words.push({ word, stems });
        }
    }
    return words;
};
// Najde slovo odpovědi (i skloněné či jako přídavné jméno) v textu; vrátí nalezené slovo textu, nebo null
export const findLeak = (text, words) => {
    const textWords = textWordsOf(text);
    for (const { word, stems } of words) {
        for (const textWord of textWords) {
            for (const stem of stems) {
                const limit = stem.length >= 5 ? 6 : 3;
                if (textWord.startsWith(stem) && textWord.length <= stem.length + limit) return { word, found: textWord };
            }
        }
    }
    return null;
};
// Číselná odpověď (století, desetiletí, rok, tvrdost): číslo v textu, které ji prozradí
const findNumberLeak = (text, question, item) => {
    const plain = String(text || '');
    if (question.match === 'century' && Number.isFinite(question.century)) {
        const years = plain.match(/(?<![\d,])\d{3,4}(?![\d,])/g) || [];
        const titleNumbers = new Set(`${item.n} ${item.t || ''}`.match(/\d+/g) || []);
        const year = years.find(value => centuryOf(Number(value)) === question.century && !titleNumbers.has(value));
        if (year) return { word: question.answerLabel, found: year };
        const mentioned = new RegExp(`(?<![\\d])${Math.abs(question.century)}\\.\\s*stol`, 'u').exec(plain);
        return mentioned ? { word: question.answerLabel, found: mentioned[0] } : null;
    }
    if (question.type === 'decade') {
        const decade = /^(\d{2,4})\./.exec(question.answerLabel);
        if (!decade) return null;
        const years = (plain.match(/(?<!\d)\d{4}(?!\d)/g) || []).map(Number);
        const start = decade[1].length === 2 ? 1900 + Number(decade[1]) : Number(decade[1]);
        const year = years.find(value => Math.floor(value / 10) * 10 === start);
        if (year) return { word: question.answerLabel, found: String(year) };
        const label = new RegExp(`(?<!\\d)${decade[1]}\\.\\s*l[eé]t`, 'u').exec(plain);
        return label ? { word: question.answerLabel, found: label[0] } : null;
    }
    if (question.type === 'hardness') {
        const value = question.answerLabel.replace(',', '[,.]');
        const sentence = plain.split(/(?<=[.!?])\s+/).find(part => /tvrd|Mohs/i.test(part) && new RegExp(`(?<![\\d,.])${value}(?![\\d,.])`).test(part));
        return sentence ? { word: question.answerLabel, found: sentence.slice(0, 60) } : null;
    }
    return null;
};
// Značka či vzorec jako samostatný zápis v textu (Fe, H₂SO₄); jednopísmenná značka jen za slovem „značka“
const findSymbolLeak = (text, question) => {
    if (question.match !== 'symbol' && question.match !== 'formula') return null;
    for (const symbol of question.accepted) {
        if (!symbol || /^\d/.test(symbol) || question.type === 'decade' || question.type === 'style') continue;
        const pattern = symbol.length > 1
            ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(symbol)}(?![\\p{Ll}\\p{N}])`, 'u')
            : new RegExp(`(?<=${core.AFTER_SYMBOL_WORD})${escapeRegExp(symbol)}(?![\\p{L}])`, 'u');
        const found = pattern.exec(String(text || ''));
        if (found) return { word: symbol, found: found[0] };
    }
    return null;
};
// Odpovědi otázky pro hlídače: u názvu jméno, titulek a další názvy (bez vědeckého názvu – ten je schválně poslední nápovědou)
const detectorAnswers = (question, item, ctx) => {
    if (question.type === 'name') {
        // Slova, která téma v popisu schválně ponechá (pořadatelské město olympiády), nejsou prozrazením, i když jsou v aliasech („Paříž 1924“)
        const kept = new Set((ctx.topic.keepWords ? ctx.topic.keepWords('name', item, ctx) : []).filter(Boolean).flatMap(text => String(text).split(/\s+/)).map(core.normalizeAnswer));
        const withoutKept = (alias) => kept.size ? alias.split(/\s+/).filter(word => !kept.has(core.normalizeAnswer(word))).join(' ') : alias;
        const aliases = (ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : []).map(withoutKept);
        return [item.n, displayName(item.t || ''), ...aliases.filter(alias => alias !== (item.f || {}).lat)].filter(Boolean);
    }
    if (question.match) return [];
    return question.accepted.filter(Boolean);
};

// --- Nápověda opakující popis ---
const SIGNIFICANT = (word) => word.length >= 4 && !/^\d+$/.test(word);
// Všechna významná slova hodnoty (podle prvních pěti písmen) i všechna čísla jsou už v textu
export const isRepeated = (value, text) => {
    const textWords = textWordsOf(text);
    const words = textWordsOf(value).filter(word => SIGNIFICANT(word) || /^\d+$/.test(word));
    if (!words.length) return false;
    // Slovo textu je totéž slovo v jiném pádě (wolfram – wolframu), ne jiné slovo stejného základu (wolframany)
    const stemOf = (word) => word.slice(0, word.length <= 6 ? word.length - 1 : word.length - 2);
    const seen = (word) => /^\d+$/.test(word) ? textWords.includes(word) : textWords.some(other => other.startsWith(stemOf(word)) && other.length <= word.length + 2);
    return words.every(seen);
};

// --- Kontroly jedné sestavené otázky ---
const snippet = (text, limit = 90) => { const plain = String(text || '').replace(/\s+/g, ' ').trim(); return plain.length > limit ? `${plain.slice(0, limit - 1)}…` : plain; };
const CRITICAL = new Set(['prozrazeno', 'moznosti', 'obrazek']);
export const isCritical = (finding) => CRITICAL.has(finding.kind);
export const auditRound = (item, ctx, round) => {
    const findings = [];
    const { question } = round;
    const add = (kind, problem, text) => findings.push({ kind, problem, snippet: snippet(text), type: question.type });
    const wrongLabels = (question.choices || []).filter(choice => !choice.correct).map(choice => choice.label);
    const words = distinguishingWords(detectorAnswers(question, item, ctx), wrongLabels, genericWordsOf(ctx), commonTitleWordsOf(ctx));

    // (1) Odpověď v popisu, štítku druhu nebo v nápovědě před odhalením
    const leakIn = (text, where, numbers = true) => {
        const leak = findLeak(text, words) || (numbers && findNumberLeak(text, question, item)) || findSymbolLeak(text, question);
        if (leak) add('prozrazeno', `${where}: „${leak.found}“ prozrazuje odpověď (${leak.word})`, text);
        return Boolean(leak);
    };
    leakIn(round.questionText, 'popis');
    // Štítek druhu: obecný název kategorie („drahý kámen“ u lazurového kamene) odpověď neprozradí
    if (round.typeLabel && round.typeLabel !== categoryOf(ctx.topic, item.c).one) leakIn(round.typeLabel, 'štítek druhu');
    for (const fact of round.leadFacts) leakIn(`${fact.label}: ${fact.value}`, 'fakt v okně');
    for (const hint of round.hints) {
        if (hint.kind === 'facts') for (const fact of hint.facts) leakIn(`${fact.label}: ${fact.value}`, `nápověda „${hint.label}“`);
        if (hint.kind === 'excerpt') leakIn(hint.text, 'nápověda „další věty“');
        if (hint.kind === 'visual' && hint.spec) {
            const spec = hint.spec;
            const texts = [spec.valueLabel, spec.label, ...(spec.ticks || []).map(tick => tick.label), ...(spec.anchors || []).map(anchor => anchor[1])].filter(Boolean);
            if (spec.type === 'timeline' && Array.isArray(spec.anchors)) {
                // Na ose se ukážou jen vybrané události; stejně jako hra vyřadíme ty se jménem (hide)
                const shown = core.buildTimeline(spec, 340).anchors.map(anchor => anchor.label);
                leakIn(shown.join(' · '), `nápověda „${hint.label}“`, false); // názvy děl s číslem v titulu (román 1984) osu neprozradí
            } else if (texts.length) leakIn(texts.join(' · '), `nápověda „${hint.label}“`);
        }
    }

    // (2) Nápověda opakující informaci z popisu nebo z dřívější nápovědy
    const seenFacts = new Map();
    const inDescription = [round.visibleText, ...round.leadFacts.map(fact => fact.value)].join(' · ');
    let inHints = '';
    for (const fact of round.leadFacts) seenFacts.set(`${fact.label}\u0000${fact.value}`, 'okno');
    for (const hint of round.hints) {
        if (hint.kind !== 'facts') continue;
        for (const fact of hint.facts) {
            const key = `${fact.label}\u0000${fact.value}`;
            if (seenFacts.has(key)) add('duplicita', `nápověda „${hint.label}“ opakuje fakt z: ${seenFacts.get(key)}`, `${fact.label}: ${fact.value}`);
            else if (isRepeated(fact.value, inDescription)) add('duplicita', `nápověda „${hint.label}“ jen opakuje popis`, `${fact.label}: ${fact.value}`);
            else if (isRepeated(fact.value, inHints)) add('duplicita', `nápověda „${hint.label}“ opakuje dřívější nápovědu`, `${fact.label}: ${fact.value}`);
            seenFacts.set(key, `nápověda „${hint.label}“`);
        }
        inHints += ` · ${hint.facts.map(fact => fact.value).join(' · ')}`;
    }

    // (3) Možnosti: správná právě jednou, bez prázdných a stejných, žádná nesprávná není zároveň přijímanou odpovědí
    const choices = question.choices || [];
    const correct = choices.filter(choice => choice.correct);
    if (correct.length !== 1) add('moznosti', `správná odpověď ${correct.length}× mezi možnostmi`, choices.map(choice => choice.label).join(' | '));
    const labels = choices.map(choice => normalizeAnswer(choice.label));
    if (choices.some(choice => !String(choice.label || '').trim() || /^(undefined|null|NaN)$/.test(String(choice.label)))) add('moznosti', 'prázdná možnost', choices.map(choice => choice.label).join(' | '));
    if (new Set(labels.filter(Boolean)).size !== labels.filter(Boolean).length) add('moznosti', 'dvě možnosti se stejným textem', choices.map(choice => choice.label).join(' | '));
    for (const choice of choices) {
        if (choice.correct || !choice.label) continue;
        if (question.match === 'century' || question.match === 'symbol' || question.match === 'formula') continue;
        // Přesná shoda s přijímanou odpovědí je jistá chyba (dvě správné možnosti). Tolerantní shoda (Slovinsko ~ Slovensko) u psané odpovědi
        // dopadne dobře – hra odmítne přesný název jiné položky –, jde jen o příliš podobné možnosti, které se hlásí bez pádu auditu.
        if (question.accepted.some(answer => normalizeAnswer(answer) === normalizeAnswer(choice.label))) add('moznosti', `nesprávná možnost „${choice.label}“ je přesně přijímaná odpověď`, question.accepted.join(', '));
        else if (isAnswerMatch(choice.label, question.accepted) || levenshtein(normalizeAnswer(choice.label), normalizeAnswer(question.answerLabel || '')) <= 1) add('moznosti-podobne', `nesprávná možnost „${choice.label}“ se od správné odpovědi liší jen drobností`, `${question.answerLabel} ~ ${choice.label}`);
    }
    findings.push(...auditChoiceFit(item, ctx, question).map(found => ({ ...found, type: question.type })));
    if (choices.length && choices.length < 4) add('moznosti-malo', `jen ${choices.length} možnosti`, choices.map(choice => choice.label).join(' | '));

    // (4b) Otázka bez jediné nápovědy (chudý popis se hodnotí za položku, viz auditItemData)
    if (!round.hints.length && !round.questionImage && !round.leadFacts.length) add('bez-napovedy', 'otázka nemá žádnou nápovědu ani obrázek', round.questionText);
    return findings;
};
// Nesprávné možnosti jiné země nebo doby než správná odpověď: hráč je vyřadí podle země či století, ne podle znalosti (jen hlášení, možnosti
// generuje a ladí jiná část kódu). Země je f.land (u filmu pole), doba první číselný údaj z born/year/y.
const landsOfItem = (other) => [].concat(other && other.f && other.f.land ? other.f.land : []).filter(land => typeof land === 'string');
const eraOfItem = (other) => {
    const f = (other && other.f) || {};
    return [f.born, f.year, f.y].find(value => Number.isFinite(value)) ?? null;
};
const FIT_TOPICS = new Set(['historie', 'hudba', 'literatura', 'film', 'sport', 'umeni']);
const ERA_GAP = 200;
export const auditChoiceFit = (item, ctx, question) => {
    if (!FIT_TOPICS.has(ctx.topic.id) || question.type !== 'name' || question.match) return [];
    const wrong = (question.choices || []).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id)).filter(Boolean);
    const lands = landsOfItem(item);
    const era = eraOfItem(item);
    const otherLand = lands.length ? wrong.filter(other => landsOfItem(other).length && !landsOfItem(other).some(land => lands.includes(land))) : [];
    const otherEra = Number.isFinite(era) ? wrong.filter(other => Number.isFinite(eraOfItem(other)) && Math.abs(eraOfItem(other) - era) > ERA_GAP) : [];
    const found = [];
    if (otherLand.length) found.push({ kind: 'moznosti-zeme', problem: `${otherLand.length} z ${wrong.length} nesprávných možností je z jiné země než správná (${lands.join(', ')})`, snippet: otherLand.map(other => `${other.n} (${landsOfItem(other).join(', ')})`).join(' | ') });
    if (otherEra.length) found.push({ kind: 'moznosti-doba', problem: `${otherEra.length} z ${wrong.length} nesprávných možností je o víc než ${ERA_GAP} let jinde než správná (${era})`, snippet: otherEra.map(other => `${other.n} (${eraOfItem(other)})`).join(' | ') });
    return found;
};
// (4) Chudý popis: krátký popis z Wikidat nebo jen název kategorie – bez Wikipedie k odpovědi nestačí
export const isThinDescription = (item, ctx, text) => {
    const category = categoryOf(ctx.topic, item.c);
    const bare = String(text.description || '').replace(/[.\s]+$/u, '').toLocaleLowerCase('cs');
    return bare.length < 25 || [category.label, category.one, item.ty || ''].map(value => value.toLocaleLowerCase('cs')).includes(bare);
};

// --- Rozbitá data položky (nezávisle na druhu otázky) ---
const HTML_LIKE = /<\/?[a-z][^>]*>|&(?:amp|lt|gt|quot|nbsp|#\d+);|\{\\displaystyle|\[\*\*\*\]/i;
export const commonsHash = (file) => crypto.createHash('md5').update(String(file).replace(/ /g, '_')).digest('hex').slice(0, 2);
export const auditItemData = (item, ctx) => {
    const findings = [];
    const add = (problem, text) => findings.push({ kind: 'data', problem, snippet: snippet(text), type: '-' });
    if (item.im && !/^[0-9a-f]{2}$/.test(item.ih || '')) add('fotka bez hashe (ih)', item.im);
    if (!item.im && item.ih) add('hash fotky bez souboru (im)', item.ih);
    // Adresa na Commons je odvozená z hashe názvu souboru; nesouhlasící hash = jistě rozbitý obrázek
    if (item.im && /^[0-9a-f]{2}$/.test(item.ih || '') && commonsHash(item.im) !== item.ih) findings.push({ kind: 'obrazek', problem: `hash fotky nesouhlasí s názvem souboru (má být ${commonsHash(item.im)})`, snippet: `${item.im} (${item.ih})`, type: '-' });
    if (item.im && /[<>|\\]|^\s|\s$/.test(item.im)) findings.push({ kind: 'obrazek', problem: 'název souboru fotky obsahuje nepřípustný znak nebo okrajové mezery', snippet: item.im, type: '-' });
    const wantsImage = ctx.topic.questionImage && ctx.topic.questionImage({ ...item, im: 'x.jpg', ih: 'ab' }, ctx, 'name');
    if (wantsImage && !(item.im && item.ih)) add('položka se spoléhá na obrázek v otázce, ale fotku nemá', item.n);
    for (const [key, value] of Object.entries({ n: item.n, t: item.t, d: item.d, ty: item.ty })) {
        if (typeof value === 'string' && HTML_LIKE.test(value)) add(`HTML nebo rozbitý text v poli ${key}`, value);
    }
    for (const [key, value] of Object.entries(item.f || {})) {
        for (const part of [].concat(value)) {
            if (typeof part === 'string' && (HTML_LIKE.test(part) || /^(undefined|null|NaN)$/.test(part.trim()))) add(`rozbitá hodnota f.${key}`, part);
        }
    }
    for (const mode of ['name', 'result']) {
        for (const fact of ctx.topic.facts(item, ctx, mode)) {
            if (fact.value === undefined || fact.value === null || /^(undefined|null|NaN|)$/.test(String(fact.value).trim()) || /\bundefined\b|\bNaN\b/.test(String(fact.value))) add(`fakt „${fact.label}“ bez hodnoty`, `${fact.label}: ${fact.value}`);
        }
    }
    return findings;
};

// --- Celé téma ---
export const auditItem = (item, ctx, wiki = null) => {
    const results = [];
    const text = textOf(item, wiki);
    if (wiki && !text.fallback && HTML_LIKE.test(text.description)) results.push({ kind: 'data', problem: 'úvod z Wikipedie obsahuje HTML', snippet: snippet(text.description), type: '-' });
    if (isThinDescription(item, ctx, text)) results.push({ kind: 'chudy-popis', problem: text.fallback ? 'krátký popis z Wikidat (při výpadku Wikipedie nestačí k odpovědi)' : 'krátký úvod z Wikipedie', snippet: snippet(text.description || '(prázdný)'), type: '-' });
    for (const variant of questionVariants(item, ctx)) {
        const round = assembleRound(item, ctx, variant, text);
        results.push(...auditRound(item, ctx, round));
    }
    results.push(...auditItemData(item, ctx));
    return results.map(finding => ({ topic: ctx.topic.id, q: item.q, name: item.n, ...finding }));
};
// limit = nejvýše tolik položek, sample = rovnoměrný vzorek asi tolika položek přes celé téma (každá n-tá), step = přímo ten krok
export const auditTopic = (id, { limit = Infinity, sample = 0, step = 1, wiki = null, onProgress = null } = {}) => {
    const ctx = loadContext(id);
    if (sample) step = Math.max(1, Math.ceil(ctx.items.length / sample));
    const findings = [];
    let count = 0;
    for (let index = 0; index < ctx.items.length; index += step) {
        if (count++ >= limit) { count--; break; }
        findings.push(...auditItem(ctx.items[index], ctx, wiki));
        if (onProgress && count % 500 === 0) onProgress(count, ctx.items.length);
    }
    if (limit === Infinity && step === 1) findings.push(...auditTopicData(ctx));
    return { topic: ctx.topic, items: count, total: ctx.items.length, findings };
};

// Kontroly celého tématu (ne jedné otázky): nejednoznačná psaná odpověď a odkazy z data/photo-*.json
export const auditTopicData = (ctx) => {
    const findings = [];
    const add = (item, kind, problem, text) => findings.push({ topic: ctx.topic.id, q: item ? item.q : '-', name: item ? item.n : '-', kind, problem, snippet: snippet(text), type: 'name' });
    // Stejná psaná odpověď (název, titul, příjmení, alias) platí u dvou položek: která z nich se myslí?
    const owners = new Map();
    for (const item of ctx.items) {
        const aliases = ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : [];
        for (const answer of new Set(nameAnswers(item, aliases).map(normalizeAnswer).filter(answer => answer.length >= 3))) {
            if (!owners.has(answer)) owners.set(answer, []);
            owners.get(answer).push(item);
        }
    }
    for (const [answer, list] of owners) {
        const distinct = list.filter((item, index) => list.findIndex(other => other.q === item.q) === index);
        if (distinct.length < 2) continue;
        const categories = new Set(distinct.map(item => item.c));
        add(distinct[0], 'aliasy', `odpověď „${answer}“ platí pro ${distinct.length} položek${categories.size > 1 ? ' z různých okruhů' : ''}`, distinct.slice(0, 4).map(item => `${item.n} [${item.q}]`).join(' | '));
    }
    const ids = new Set();
    for (const item of ctx.items) {
        if (ids.has(item.q)) add(item, 'data', 'duplicitní identifikátor položky (q)', item.q);
        ids.add(item.q);
    }
    // Stejná fotka u dvou položek téže kategorie: buď duplicitní položka (stejný druh dvakrát), nebo fotka patří jen jedné z nich (nejisté, jen hlášení)
    const byPhoto = new Map();
    for (const item of ctx.items) if (item.im) byPhoto.set(`${item.c}|${item.im}`, [...(byPhoto.get(`${item.c}|${item.im}`) || []), item]);
    for (const list of byPhoto.values()) {
        if (list.length > 1) add(list[0], 'obrazek-sdileny', `stejnou fotku mají i další položky okruhu (${list.length}×)`, list.map(item => `${item.n} [${item.q}]`).join(' | '));
    }
    for (const qid of safeJson('data/photo-text.json', {})[ctx.topic.id] || []) {
        const item = ctx.byId.get(qid);
        if (!item) add(null, 'obrazek', `photo-text.json odkazuje na neexistující položku ${qid}`, qid);
        else if (!item.im) add(item, 'obrazek', 'photo-text.json označuje položku bez fotky', qid);
    }
    for (const item of ctx.items) {
        const masks = item.im && (ctx.photoMasks || {})[item.im];
        if (masks && !(Array.isArray(masks) && masks.every(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) && box[0] >= 0 && box[1] >= 0 && box[2] > 0 && box[3] > 0 && box[0] + box[2] <= 1.001 && box[1] + box[3] <= 1.001))) add(item, 'obrazek', 'rozbitý rámeček v photo-masks.json (čekáno [x, y, šířka, výška] jako podíl fotky)', JSON.stringify(masks));
    }
    return findings;
};

// --- Výjimky: odůvodněný seznam známých nálezů, které se nepočítají jako kritické (scripts/audit-allowlist.json) ---
export const loadAllowlist = (file = path.join(ROOT, 'scripts', 'audit-allowlist.json')) => {
    const list = safeJson(path.relative(ROOT, file), { entries: [] });
    return Array.isArray(list.entries) ? list.entries : [];
};
export const isAllowed = (finding, allowlist) => allowlist.some(entry => entry.topic === finding.topic && entry.q === finding.q
    && (!entry.kind || entry.kind === finding.kind) && (!entry.type || entry.type === finding.type)
    && (!entry.match || finding.problem.includes(entry.match)));
