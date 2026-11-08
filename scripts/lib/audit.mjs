// Audit kvality otázek: sestaví každou otázku, kterou téma pro položku umí (název, stát, století, autor, značka…), stejně jako
// hra – stejnými funkcemi jádra (quiz-core.js) a tématu (topics/*.js) – a hledá v ní chyby: odpověď prozrazenou v popisu nebo
// nápovědě, nápovědu opakující popis, rozbité možnosti, chudý popis a rozbitá data.
//
// Popis otázky bere hra z úvodu článku na Wikipedii (za běhu, přes síť); bez sítě hraje s krátkým popisem z Wikidat (pole d).
// Audit pracuje bez sítě, proto hodnotí popis z Wikidat a volitelně uložené úvody z Wikipedie (cache { titulek: text }).
// Skládání otázky (zakrytí, nápovědy) dělají stejné funkce jádra jako ve hře: popis a další věty buildQuestionTexts, nápovědy
// planRound a buildHints (app.js: createRoundData) – audit tedy hodnotí přesně to, co uvidí hráč.
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

// --- Obecná slova názvů (park, řeka, bitva): stejná pravidla jako zakrývání ve hře (quiz-core.js) ---
export const genericWordsOf = (ctx) => core.genericWordsOf(ctx);
const isGenericWord = (word, extra) => core.isGenericWord(word, extra);
const specificWords = (names, extra = null) => core.specificWords(names, extra);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
// Nápovědy staví stejná funkce jádra jako hra (quiz-core.js: buildHints); audit doplní jen, které obrazové nápovědy umí aplikace
export const buildHints = (plan, options = {}) => core.buildHints(plan, { describeVisual: visualInfo, ...options });

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
        choices: buildItemChoices(item, items, rng, other => topic.similarity ? topic.similarity(item, other, ctx) : 0, core.cultureLandsFor(topic, ctx)),
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

// --- Sestavení otázky (jako createRoundData v app.js, bez sítě): texty buildQuestionTexts, nápovědy planRound ---
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
    const { text: chosen, questionText, moreText, origin } = core.buildQuestionTexts(item, ctx, question, text, { special: isSpecial });
    const typeLabel = item.ty && !core.hideAnswer(item.ty, question, { ...item, ty: '' }, ctx).includes('[***]') ? item.ty : category.one;
    const { hints, leadFacts, thin, visibleText, known } = core.planRound({
        item, ctx, question, texts: { questionText, moreText, origin }, typeLabel, shown, special: isSpecial,
        photoUrl: photoOf(item), describeVisual: visualInfo, photoMasks: ctx.photoMasks || {}, textPhotos: ctx.textPhotos || new Set()
    });
    return { question, questionText, moreText, origin, typeLabel, questionImage: shown, photoUrl: photoOf(item), hints, leadFacts, thin, visibleText, known, description: chosen.description, fallback: Boolean(chosen.fallback) };
};

// --- Hlídač prozrazení: přísnější než zakrytí ve hře (bez diakritiky, s odvozenými přídavnými jmény a čísly) ---
const SKIP_WORDS = new Set(['nad', 'pod', 'na', 've', 'de', 'la', 'le', 'les', 'des', 'du', 'di', 'da', 'del', 'der', 'die', 'das', 'am', 'an', 'im', 'of', 'the', 'and', 'et', 'san', 'saint', 'sankt',
    'al', 'el', 'ad', 'as', 'ar', 'az', 'ibn', 'bin', 'ben', 'von', 'van', 'zu', 'den', 'ten', 'ter', 'dos', 'do', 'y', 'století', 'stoleti', 'stát', 'státy', 'státu', 'států', 'státní', 'stat', 'staty', 'statu', 'statu', 'statni', 'léta', 'leta', 'mytologie', 'hornina', 'vyvřelina', 'vyvrelina',
    // Přídomek světce (Štěpán I. Svatý) není jméno: „Svatá říše římská“ na časové ose ho neprozradí
    'svatý', 'svatá', 'svaté', 'svatého', 'svatou', 'svaty', 'svata', 'svate', 'svateho']);
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
// Upřesnění v závorce (Liška obecná (houba), Panenská věž (Turecko)) není součást odpovědi, kterou hráč hádá – jen když bez něj
// nezbude žádné slovo (C/2020 F3 (NEOWISE)), je odpovědí i ono
const withoutQualifier = (answer) => {
    const base = displayName(String(answer));
    return base !== answer && /\p{L}{3,}/u.test(base) ? base : answer;
};
export const distinguishingWords = (answers, wrongLabels, extra = null, common = null) => {
    const wrongStems = new Set(wrongLabels.flatMap(label => splitWords(withoutQualifier(label)).flatMap(word => detectorStems(word))));
    const words = [];
    for (const answer of answers.map(withoutQualifier)) {
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

// --- Tvar odpovědi, prázdné nápovědy a měřítko mapy ---
const JOINED_PATTERN = new RegExp(`\\[\\*\\*\\*\\]((?:\\s*[,:\\-–—&+/]\\s*|\\s+(?:${core.JOINING_WORDS.join('|')})\\s+)+)\\[\\*\\*\\*\\]`, 'iu');
// Texty, které hráč před odpovědí uvidí: popis (volně, nebo jako nápověda u otázky s obrázkem) a další věty
const shownTexts = (round) => [
    ...(!round.questionImage && round.questionText ? [['popis', round.questionText]] : []),
    ...round.hints.filter(hint => hint.kind === 'text' && hint.text).map(hint => [`nápověda „${hint.label}“`, hint.text]),
    ...round.hints.filter(hint => hint.kind === 'excerpt').map(hint => ['nápověda „další věty“', hint.text])
];
// Obsah nápovědy jako text (null = obsah, který se textem porovnat nedá: fotka, mapa, obrázek, tabulka)
const hintContent = (hint) => {
    if (hint.kind === 'text') return `${hint.name || ''} ${hint.text || ''}`.trim();
    if (hint.kind === 'excerpt') return hint.text;
    if (hint.kind === 'facts') return hint.facts.map(fact => fact.value).join(' · ');
    if (hint.kind === 'visual' && hint.spec.type === 'timeline' && !hint.spec.blind) {
        return [...(hint.spec.points || []), ...(hint.spec.spans || []).flatMap(span => [span.from, span.to])].filter(year => Number.isFinite(year) && year >= 100).join(' · ');
    }
    return null;
};
const yearsOf = (text) => String(text).match(/\d{3,4}/g) || [];
// Fakt nic nepřidá: každou jeho část (oddělenou čárkou) už hráč viděl – všechna její slova i čísla (i krátká: LOH 2016 přidá „LOH“,
// i když rok 2016 je na ose; „X&Y“ beze slov je nové). Čísla s mezerou po tisících jsou jedno číslo (1 037 není 1 a 037 z 1 221 037);
// krátké vlastní jméno musí být vidět celé (Duna není Duncan)
const joinThousands = (text) => String(text).replace(/(\d)[\s\u00a0\u202f](?=\d{3}(?!\d))/gu, '$1');
const factAddsNothing = (value, before) => {
    const text = joinThousands(before);
    const seenWords = textWordsOf(text);
    const proper = new Set((String(value).match(/\p{Lu}\p{L}*/gu) || []).map(normalizeAnswer));
    // Krátké slovo jen celé nebo s koncovkou (Jan – Janem, měď – měďnatý), ne jako začátek jiného slova (Jan – Janáček)
    const wordSeen = (word) => /\d/.test(word) || word.length < 3 || ((word.length > 3 && !(proper.has(word) && word.length <= 5))
        || seenWords.some(other => other.startsWith(word) && other.length - word.length <= (word.length === 3 ? 4 : 2)));
    // Číslo s jednotkou jen se stejnou jednotkou (7 km není 7 m)
    const measuresSeen = (part) => [...part.matchAll(/(\d+(?:,\d+)?)\s*(\p{L}+²?)/gu)].every(([, number, unit]) => new RegExp(`(?<![\\d,])${number}\\s*${unit}(?!\\p{L})`, 'u').test(text));
    return joinThousands(value).split(/,\s+(?=\D)/).every(part => isRepeated(part, text) && textWordsOf(part).every(wordSeen) && measuresSeen(part));
};
// Text nápovědy nic nepřidá: žádné nové slovo, nová slova jsou jen pětina textu, nebo je celý obsažený v tom, co hráč už četl
const textAddsNothing = (content, before) => {
    const words = core.contentWords(content).length;
    const fresh = core.newWords(content, before).length;
    return !words || !fresh || fresh / words < 0.2 || normalizeAnswer(before).includes(normalizeAnswer(content));
};
let mapData = null;
const loadMapData = () => {
    if (!mapData) mapData = { regions: safeJson('data/regiony.json', null), world: safeJson('data/world.json', null) };
    return mapData;
};
// Výřez mapy (jak ho nakreslí hra na panelu 360 × 224 px) je víc než dvakrát širší, než kolik zaberou možnosti: tečka je jen
// tam, kde ji čekají všechny možnosti (pražský obvod na mapě celého Česka)
const mapScaleProblem = (spec, question, ctx) => {
    const points = core.choicePoints(question, ctx);
    if (points.length < 2) return null;
    const needed = core.choicesView(points);
    if (!needed) return null;
    const { regions, world } = loadMapData();
    const extent = core.mapExtent(spec, { regions, world });
    if (needed.span > extent.span * core.FIT_SHARE * 1.0001) return null;
    const km = (span, lat) => Math.round(span * 111.32 * Math.cos(lat * Math.PI / 180));
    return `slepá mapa ukazuje ${km(extent.span, extent.lat)} km, možnosti leží v ${km(needed.span / 1.8, needed.lat)} km`;
};

// --- Kontroly jedné sestavené otázky ---
const snippet = (text, limit = 90) => { const plain = String(text || '').replace(/\s+/g, ' ').trim(); return plain.length > limit ? `${plain.slice(0, limit - 1)}…` : plain; };
const CRITICAL = new Set(['prozrazeno', 'moznosti', 'obrazek', 'tvar', 'sablona', 'prazdna-napoveda', 'mapa-meritko', 'moznosti-stat']);
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
            // Popisek slepé mapy (Místo je uprostřed) je pevný text tématu, ne údaj o položce (El Misti × „Místo“)
            const texts = [spec.valueLabel, spec.type === 'map' ? '' : spec.label, ...(spec.ticks || []).map(tick => tick.label), ...(spec.anchors || []).map(anchor => anchor[1])].filter(Boolean);
            if (spec.type === 'timeline' && Array.isArray(spec.anchors)) {
                // Na ose se ukážou jen vybrané události; stejně jako hra vyřadíme ty se jménem (hide)
                const shown = core.buildTimeline(spec, 340).anchors.map(anchor => anchor.label);
                leakIn(shown.join(' · '), `nápověda „${hint.label}“`, false); // názvy děl s číslem v titulu (román 1984) osu neprozradí
            } else if (texts.length) leakIn(texts.join(' · '), `nápověda „${hint.label}“`);
        }
    }

    // (1b) Tvar odpovědi: po zakrytí nesmí zůstat spojovací slovo mezi zakrytými místy („[***] a [***]“, „[***] na [***]“)
    // ani slovo těsně u zakrytého místa, které z možností má jen ta správná („[***] 5“ mezi pražskými obvody)
    for (const [where, text] of shownTexts(round)) {
        const joined = JOINED_PATTERN.exec(text);
        if (joined) add('tvar', `${where}: zakrytá místa spojená „${joined[1].trim() || joined[0]}“ ukazují tvar odpovědi`, text);
        for (const leak of core.structureLeaks(text, question)) add('tvar', `${where}: „${leak.word}“ u zakrytého místa vybírá z možností`, text);
    }

    // (1c) Náhradní text (krátký popis z Wikidat, zadržený text tématu) nápovědou není nikdy
    for (const hint of round.hints) {
        if (hint.kind === 'text' && hint.text && round.origin !== 'article') add('sablona', `nápověda „${hint.label}“ je náhradní text (${round.origin}), ne popis z článku`, hint.text);
    }

    // (1d) Každá nápověda přidá něco nového oproti otázce, štítku, společné části možností a všem dřívějším nápovědám
    let before = [round.visibleText, round.known, ...round.leadFacts.map(fact => fact.value)].join(' · ');
    // Hodnoty faktů, které mají všechny nabízené možnosti (Stát: USA u čtyř amerických států): mezi nimi nic nerozliší
    const wrongItems = question.type === 'name' ? (question.choices || []).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id)).filter(Boolean) : [];
    const valuesOf = (other) => new Set(ctx.topic.facts(other, ctx, question.type).map(fact => String(fact.value)));
    const commonValues = wrongItems.length ? wrongItems.map(valuesOf).reduce((common, values) => new Set([...common].filter(value => values.has(value)))) : new Set();
    for (const hint of round.hints) {
        const content = hintContent(hint);
        if (content !== null) {
            const empty = hint.kind === 'facts' ? hint.facts.every(fact => factAddsNothing(fact.value, before) || (!hint.extra && commonValues.has(String(fact.value))))
                : hint.kind === 'visual' ? yearsOf(content).length > 0 && yearsOf(content).every(year => new RegExp(`(?<!\\d)${year}(?!\\d)`).test(before))
                    : textAddsNothing(content, before);
            if (empty) add('prazdna-napoveda', `nápověda „${hint.label}“ nic nepřidá k tomu, co hráč už viděl`, content);
            before += ` · ${content}`;
        }
        // Slepá mapa: výřez má odpovídat tomu, co rozliší možnosti (možnosti blízko sebe → přiblížená mapa)
        if (hint.kind === 'visual' && hint.spec.type === 'map') {
            const scale = mapScaleProblem(hint.spec, question, ctx);
            if (scale) add('mapa-meritko', scale, `${hint.label}: ${hint.spec.label}`);
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
    findings.push(...auditSameCountry(item, ctx, question).map(found => ({ ...found, type: question.type })));
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
// Kategorie, kde téma slibuje nesprávné možnosti ze stejného státu (topic.sameCountry, regiony států u vlajek): region jiného státu je
// jistá chyba (hráč ho vyřadí podle státu), pokud stát v datech má aspoň tři další položky té kategorie (jinak je to nouzová možnost)
const peersByCountry = new WeakMap();
const countryPeers = (ctx, category) => {
    if (!peersByCountry.has(ctx)) peersByCountry.set(ctx, new Map());
    const cache = peersByCountry.get(ctx);
    if (!cache.has(category)) {
        const counts = new Map();
        for (const other of ctx.items) if (other.c === category && (other.co || [])[0]) counts.set(other.co[0], (counts.get(other.co[0]) || 0) + 1);
        cache.set(category, counts);
    }
    return cache.get(category);
};
export const auditSameCountry = (item, ctx, question) => {
    if (question.type !== 'name' || !(ctx.topic.sameCountry || []).includes(item.c)) return [];
    const own = (item.co || [])[0];
    if (!own || (countryPeers(ctx, item.c).get(own) || 0) < 4) return [];
    const foreign = (question.choices || []).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id))
        .filter(other => other && (other.co || [])[0] !== own);
    return foreign.length ? [{ kind: 'moznosti-stat', problem: `${foreign.length} z 3 nesprávných možností je z jiného státu než správná odpověď (${own})`,
        snippet: foreign.map(other => `${other.n} (${(other.co || []).join(', ')})`).join(' | ') }] : [];
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
            // NaN jako číslo, ne ve vzorci (azid sodný NaN₃)
            if (fact.value === undefined || fact.value === null || /^(undefined|null|NaN|)$/.test(String(fact.value).trim()) || /\bundefined\b|(?<![\p{L}\p{N}])NaN(?![\p{L}\p{N}₀-₉])/u.test(String(fact.value))) add(`fakt „${fact.label}“ bez hodnoty`, `${fact.label}: ${fact.value}`);
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
        collectHintTexts(item, ctx, round);
    }
    results.push(...auditItemData(item, ctx));
    return results.map(finding => ({ topic: ctx.topic.id, q: item.q, name: item.n, ...finding }));
};
// Šablona: stejný text nápovědy (popis, další věty) u několika různých položek je obecná věta, ne údaj o položce – nic
// nerozliší („Vlajka jednoho z velkých měst světa. Kterému patří?“). Pozná se podle výsledku, ne podle znění.
const TEMPLATE_ITEMS = 3;
const collectHintTexts = (item, ctx, round) => {
    if (!ctx.hintTexts) ctx.hintTexts = new Map();
    for (const hint of round.hints) {
        const text = hint.kind === 'text' ? hint.text : hint.kind === 'excerpt' ? hint.text : '';
        if (!text || core.contentWords(text).length < 4) continue;
        const key = normalizeAnswer(text);
        if (!ctx.hintTexts.has(key)) ctx.hintTexts.set(key, { text, label: hint.label, type: round.question.type, items: new Map() });
        ctx.hintTexts.get(key).items.set(item.q, item.n);
    }
};
export const auditTemplates = (ctx) => [...(ctx.hintTexts || new Map()).values()].filter(entry => entry.items.size >= TEMPLATE_ITEMS).map(entry => {
    const [[q, name]] = entry.items;
    return { topic: ctx.topic.id, q, name, kind: 'sablona', type: entry.type, problem: `nápověda „${entry.label}“ má stejný text u ${entry.items.size} položek (obecná věta, ne údaj o položce)`, snippet: snippet(entry.text) };
});

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
    findings.push(...auditTemplates(ctx));
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
