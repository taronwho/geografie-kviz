#!/usr/bin/env node
// Audit zakrytí odpovědi v popisu: node scripts/audit-zakryti.mjs [-- --topic=chemie,biologie --short=400 --wiki=uvody.json --examples=8
//   --json=reports/zakryti.json]
//
// Sestaví otázku na název stejně jako hra (quiz-core.js composeRound, možnosti ze semínka položky) pro každou položku s uloženým
// úvodem článku (tests/wiki-intros.json, --wiki=další soubor stejného tvaru) a pro vzorek položek s krátkým popisem z Wikidat
// (--short = kolik položek na téma; jako při výpadku Wikipedie) a porovná zakrytí podle pravidel před MASK_RULES_FROM („před“,
// withLegacyMasking) a po něm („po“). Počítá, co hráč uvidí před odpovědí (popis a další věty):
//   - nečitelné popisy: aspoň MAX_DESCRIPTION_MASKS (4) zakrytých míst,
//   - výrazné slovo správné možnosti, které zůstalo vidět (answerWordsLeft podle nových pravidel: slovo, které nemá žádná nesprávná
//     možnost, ve všech tvarech), z toho tvary s vloženým e (kukaček, matek),
//   - zakrytá slova oboru (chemie, chemický, chemik… u víceslovného názvu se slovem oboru: zbytečné zakrytí),
//   - popisy, které po zakrytí zmizely (otázka je chudá) nebo se nahradily krátkým popisem z Wikidat.
// Bez sítě: úvody jen z uložených souborů.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { core, visualInfo } from './lib/audit.mjs';
import { TOPIC_IDS, loadIntros, fetchedTextOf, contextOf, nameQuestionOf } from './lib/jednoznacnost.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const topics = args.topic ? args.topic.split(',').filter(id => TOPIC_IDS.includes(id)) : TOPIC_IDS;
const SHORT = Number(args.short ?? 300);
const EXAMPLES = Number(args.examples ?? 6);
const intros = loadIntros(args.wiki ? [path.resolve(args.wiki)] : []);
// Úvody z hlášení hráčů (Kvíz dne), aby je audit počítal i bez sítě: Chemická syntéza a Kukačka obecná
const REPORTED = {
    'chemie:Q273499': 'Chemická syntéza má dva významy: chemická reakce a obor chemie. Slovo syntéza poprvé v chemii použil německý chemik Hermann Kolbe.',
    'biologie:Q18845': 'Kukačka obecná (Cuculus canorus) je druh ptáka z řádu kukaček a čeledi kukačkovitých. V Evropě jde společně s příbuznou kukačkou chocholatou o jediného zástupce kukaček a současně o jediný ptačí druh patřící mezi obligátní hnízdní parazity.'
};
for (const [key, extract] of Object.entries(REPORTED)) if (!intros.has(key)) intros.set(key, extract);
// Možnosti z hlášení (jinak ze semínka položky jako ve hře)
const REPORTED_CHOICES = {
    'chemie:Q273499': ['Substituční reakce', 'Fotosyntéza', 'Elektrolýza', 'Chemická syntéza'],
    'biologie:Q18845': ['Straka obecná', 'Kukačka obecná', 'Krahujec obecný', 'Slípka zelenonohá']
};
const evenly = (list, count) => (list.length <= count ? list : Array.from({ length: count }, (_, i) => list[Math.floor(i * list.length / count)]));
const masks = (text) => (String(text || '').match(/\[\*\*\*\]/g) || []).length;

// Slovo oboru v odpovědi (Chemická u Chemické syntézy): zakrytá odvozená slova (chemie, chemii, chemik – ne tvary slova samého:
// chemické) nic neprozrazují a jen ruší čtení
const fold = (word) => word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const fieldWordOf = (label) => {
    const words = String(label || '').split(/\s+/);
    return words.length < 2 ? null : words.find(word => core.isFieldWord(word)) || null;
};
const derivedFieldWords = (text, answerWord) => {
    const lemma = fold(answerWord).slice(0, -1);
    return (String(text || '').match(/[\p{L}\p{M}]+/gu) || []).filter(word => core.isFieldWord(word) && !fold(word).startsWith(lemma)).length;
};
// Tvar s vloženým e (2. pád množného čísla) slova správné možnosti
const fleetingLeak = (word, label) => String(label || '').split(/\s+/).some(part => {
    const bare = part.replace(/[aeiouyáéěíóúůý]$/iu, '');
    if (bare === part || bare.length < 3 || !/[^aeiouyáéěíóúůý][klnrmc]$/iu.test(bare)) return false;
    return fold(word) === fold(`${bare.slice(0, -1)}e${bare.slice(-1)}`);
});

const stats = { before: null, after: null };
const fresh = () => ({ questions: 0, heavy: 0, leaks: 0, fleeting: 0, fieldMasked: 0, fieldTotal: 0, empty: 0, short: 0, maskSum: 0, examples: { heavy: [], leaks: [] } });
stats.before = fresh();
stats.after = fresh();
const pairs = [];
const reportedOut = [];

const build = (legacy, item, ctx, fetched) => core.withLegacyMasking(legacy, () => {
    const rng = core.createSeededRandom(`zakryti:${ctx.topic.id}:${item.q}`);
    const reported = REPORTED_CHOICES[`${ctx.topic.id}:${item.q}`];
    const base = nameQuestionOf(item, ctx, rng);
    const question = reported ? { ...base, choices: reported.map(label => { const other = ctx.items.find(entry => entry.n === label); return { id: other ? other.q : label, label, correct: label === item.n }; }) } : base;
    const shown = ctx.topic.questionImage ? ctx.topic.questionImage(item, ctx, question.type) : null;
    const composed = core.composeRound({ item, ctx, question, special: false, fetched, shown, rng, photoUrl: null, describeVisual: visualInfo,
        photoMasks: ctx.photoMasks || {}, textPhotos: ctx.textPhotos || new Set(), swaps: false, plain: true });
    return { question: composed.question, texts: composed.texts, shown };
});

for (const topicId of topics) {
    const ctx = contextOf(topicId);
    const withIntro = ctx.items.filter(item => intros.has(`${topicId}:${item.q}`));
    const shortOnly = evenly(ctx.items.filter(item => !item.nq && !intros.has(`${topicId}:${item.q}`) && item.d), SHORT);
    for (const item of [...withIntro, ...shortOnly]) {
        const fetched = fetchedTextOf(topicId, item, intros);
        const extract = intros.get(`${topicId}:${item.q}`) || fetched.description;
        const results = { before: build(true, item, ctx, fetched), after: build(false, item, ctx, fetched) };
        for (const key of ['before', 'after']) {
            const { question, texts } = results[key];
            const s = stats[key];
            const keep = [question.title, item.ty, ...(ctx.topic.keepWords ? ctx.topic.keepWords(question.type, item, ctx) : [])].filter(Boolean);
            const visible = [texts.questionText, texts.moreText].filter(Boolean).join(' ');
            const extra = core.genericWordsOf(ctx);
            const leaks = core.answerWordsLeft(visible, question.choices, { isGeneric: (word) => core.isGenericWord(word, extra), keep });
            s.questions += 1;
            s.maskSum += masks(texts.questionText);
            if (masks(texts.questionText) >= core.MAX_DESCRIPTION_MASKS) { s.heavy += 1; if (s.examples.heavy.length < EXAMPLES) s.examples.heavy.push({ topic: topicId, name: item.n, text: texts.questionText }); }
            if (leaks.length) {
                s.leaks += 1;
                if (s.examples.leaks.length < EXAMPLES) s.examples.leaks.push({ topic: topicId, name: item.n, choices: question.choices.map(c => c.label), words: leaks, text: visible.slice(0, 260) });
            }
            const label = (question.choices.find(choice => choice.correct) || {}).label || item.n;
            if (leaks.some(word => fleetingLeak(word, label))) s.fleeting += 1;
            const fieldWord = fieldWordOf(label);
            if (fieldWord) {
                const description = core.processWikiText(extract).description;
                const masked = core.withLegacyMasking(key === 'before', () => core.hideAnswer(description, question, item, ctx, { lead: !fetched.fallback, aliases: fetched.aliases || [] }));
                const original = derivedFieldWords(description, fieldWord);
                s.fieldTotal += original;
                s.fieldMasked += Math.max(0, original - derivedFieldWords(masked, fieldWord));
            }
            if (!texts.questionText) s.empty += 1;
            if (texts.origin === 'fallback' && !fetched.fallback) s.short += 1;
        }
        if (REPORTED[`${topicId}:${item.q}`]) reportedOut.push({ topic: topicId, name: item.n, choices: results.after.question.choices.map(c => c.label), before: results.before.texts.questionText, after: results.after.texts.questionText });
        if (results.before.texts.questionText !== results.after.texts.questionText && pairs.length < 400) {
            pairs.push({ topic: topicId, name: item.n, choices: results.after.question.choices.map(c => c.label), before: results.before.texts.questionText, after: results.after.texts.questionText });
        }
    }
}

const row = (label, key) => `| ${label} | ${stats.before[key]} | ${stats.after[key]} |`;
const lines = [
    `Otázek: ${stats.after.questions} (témata: ${topics.join(', ')}; úvody článků: ${[...intros.keys()].filter(key => topics.includes(key.split(':')[0])).length}, krátké popisy: vzorek ${SHORT} na téma)`,
    '',
    '| | před | po |',
    '|---|---|---|',
    row(`popis s ≥ ${core.MAX_DESCRIPTION_MASKS} [***]`, 'heavy'),
    row('výrazné slovo odpovědi vidět (popis, další věty)', 'leaks'),
    row('  z toho tvar s vloženým e', 'fleeting'),
    row('zakrytá slova oboru (chemie, chemik…)', 'fieldMasked'),
    row('popis zmizel (chudá otázka)', 'empty'),
    row('popis nahrazen krátkým popisem z Wikidat', 'short'),
    `| průměr [***] v popisu | ${(stats.before.maskSum / stats.before.questions).toFixed(2)} | ${(stats.after.maskSum / stats.after.questions).toFixed(2)} |`,
    '',
    `Změněných popisů: ${pairs.length}${pairs.length >= 400 ? '+' : ''}`
];
console.log(lines.join('\n'));
for (const key of ['before', 'after']) {
    console.log(`\n## Příklady ${key === 'before' ? 'před' : 'po'}: výrazné slovo vidět`);
    for (const example of stats[key].examples.leaks) console.log(`- ${example.topic} · ${example.name} [${example.choices.join(' | ')}] → ${example.words.join(', ')}: ${example.text}`);
    console.log(`## Příklady ${key === 'before' ? 'před' : 'po'}: ≥ ${core.MAX_DESCRIPTION_MASKS} [***]`);
    for (const example of stats[key].examples.heavy) console.log(`- ${example.topic} · ${example.name}: ${example.text}`);
}
console.log('\n## Případy z hlášení');
for (const pair of reportedOut) console.log(`- ${pair.topic} · ${pair.name} [${pair.choices.join(' | ')}]\n  před: ${pair.before}\n  po:   ${pair.after}`);
console.log('\n## Změněné popisy (prvních 12)');
for (const pair of pairs.slice(0, 12)) console.log(`- ${pair.topic} · ${pair.name} [${pair.choices.join(' | ')}]\n  před: ${pair.before}\n  po:   ${pair.after}`);
if (args.json) fs.writeFileSync(path.resolve(ROOT, args.json), JSON.stringify({ stats, pairs }, null, 1));
