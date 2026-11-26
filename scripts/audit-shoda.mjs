#!/usr/bin/env node
// Audit shody přísudku se zakrytým názvem: node scripts/audit-shoda.mjs [-- --topic=zemepis,historie --examples=8 --json=reports/shoda.json]
//
// Sestaví otázku na název stejně jako hra (quiz-core.js composeRound, možnosti ze semínka položky) a porovná text, který hráč vidí
// před odpovědí (popis a další věty), před AGREEMENT_FROM (legacyAgreement: tvar přísudku z článku) a po něm (neutralizeAgreement).
// Prozrazující tvar (agreementTells): přísudek hned za zakrytým podmětem („[***] jsou město…“, „[***] byla založena…“) sedí na
// správnou možnost a na méně možností než jiný tvar; „jen správná“ = sedí jen na ni. Zvlášť číslo (jsou × je) a rod (byla × byl).
//   1. úvody článků z tests/wiki-intros.json (a --wiki=další soubor stejného tvaru) a úvod z hlášení (Říčany),
//   2. syntetické úvody „<název> jsou <krátký popis z Wikidat>.“ pro všechny položky s pomnožným názvem (agreementClass = pl)
//      a „<název> je <popis>.“ pro položky v jednotném čísle, mezi jejichž možnostmi převažují pomnožné názvy – tak, jak úvod
//      článku o městě, pohoří nebo státu obvykle začíná (Wikipedie bez sítě nemáme).
// Bez sítě.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { core, visualInfo } from './lib/audit.mjs';
import { TOPIC_IDS, loadIntros, fetchedTextOf, contextOf, nameQuestionOf } from './lib/jednoznacnost.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const topics = args.topic ? args.topic.split(',').filter(id => TOPIC_IDS.includes(id)) : TOPIC_IDS;
const EXAMPLES = Number(args.examples ?? 6);
const intros = loadIntros(args.wiki ? [path.resolve(args.wiki)] : []);
// Hlášení hráče (Kvíz dne, Zeměpis): úvod článku Říčany a možnosti Písek, Kyjov, Mikulov, Říčany
const REPORTED = { 'zemepis:Q386988': 'Říčany jsou město, které se nachází v okrese Praha-východ ve Středočeském kraji, asi 20 km jihovýchodně od centra Prahy. Žije zde přibližně 17 tisíc obyvatel.' };
const REPORTED_CHOICES = { 'zemepis:Q386988': ['Písek', 'Kyjov', 'Mikulov', 'Říčany'] };
for (const [key, extract] of Object.entries(REPORTED)) if (!intros.has(key)) intros.set(key, extract);

const build = (legacyAgreement, item, ctx, fetched) => {
    const rng = core.createSeededRandom(`shoda:${ctx.topic.id}:${item.q}`);
    const reported = REPORTED_CHOICES[`${ctx.topic.id}:${item.q}`];
    const base = nameQuestionOf(item, ctx, rng);
    const question = reported ? { ...base, choices: reported.map(label => { const other = ctx.items.find(entry => entry.n === label); return { id: other ? other.q : label, label, correct: label === item.n }; }) } : base;
    const shown = ctx.topic.questionImage ? ctx.topic.questionImage(item, ctx, question.type) : null;
    const composed = core.composeRound({ item, ctx, question, special: false, fetched, shown, rng, photoUrl: null, describeVisual: visualInfo,
        photoMasks: ctx.photoMasks || {}, textPhotos: ctx.textPhotos || new Set(), swaps: false, plain: true, legacyAgreement });
    return { question: composed.question, visible: [composed.texts.questionText, composed.texts.moreText].filter(Boolean).join(' ') };
};

const fresh = () => ({ questions: 0, tells: 0, only: 0, number: 0, gender: 0, unknown: 0 });
const sets = { article: { before: fresh(), after: fresh() }, synthetic: { before: fresh(), after: fresh() } };
const examples = { article: [], synthetic: [], left: [] };
const reportedOut = [];
const count = (stats, round) => {
    stats.questions += 1;
    if (round.question.choices.some(choice => !core.agreementClass(choice.label))) stats.unknown += 1;
    const tells = core.agreementTells(round.visible, round.question.choices);
    if (!tells.length) return tells;
    stats.tells += 1;
    if (tells.some(tell => tell.only)) stats.only += 1;
    if (tells.some(tell => tell.number)) stats.number += 1;
    if (tells.some(tell => !tell.number)) stats.gender += 1;
    return tells;
};
const compare = (set, topicId, item, ctx, fetched) => {
    const before = build(true, item, ctx, fetched);
    const after = build(false, item, ctx, fetched);
    const tellsBefore = count(sets[set].before, before);
    const tellsAfter = count(sets[set].after, after);
    const entry = { topic: topicId, name: item.n, choices: after.question.choices.map(choice => choice.label), before: before.visible.slice(0, 220), after: after.visible.slice(0, 220) };
    if (tellsBefore.length && before.visible !== after.visible && examples[set].length < EXAMPLES) examples[set].push(entry);
    if (tellsAfter.length && examples.left.length < EXAMPLES * 2) examples.left.push({ ...entry, verbs: tellsAfter.map(tell => tell.verb) });
    if (REPORTED[`${topicId}:${item.q}`]) reportedOut.push(entry);
};

for (const topicId of topics) {
    const ctx = contextOf(topicId);
    for (const item of ctx.items.filter(entry => intros.has(`${topicId}:${entry.q}`))) compare('article', topicId, item, ctx, fetchedTextOf(topicId, item, intros));
    // Syntetické úvody: pomnožné názvy (jsou) a jednotné názvy, u kterých by možnosti mohly být většinou pomnožné (je)
    for (const item of ctx.items.filter(entry => !entry.nq && entry.d && !intros.has(`${topicId}:${entry.q}`))) {
        const plural = core.agreementClass(item.n) === 'pl';
        if (!plural && topicId !== 'zemepis') continue;
        // Jednotný název: jen když by „je“ mezi jeho možnostmi (stejné semínko jako build) prozrazovalo
        if (!plural && !core.agreementTells('[***] je město.', nameQuestionOf(item, ctx, core.createSeededRandom(`shoda:${topicId}:${item.q}`)).choices).length) continue;
        const text = `${item.n} ${plural ? 'jsou' : 'je'} ${item.d}.`;
        compare('synthetic', topicId, item, ctx, { ...core.processWikiText(text), fallback: false });
    }
}

const row = (stats, label, key) => `| ${label} | ${stats.before[key]} | ${stats.after[key]} |`;
const table = (title, stats) => [
    `### ${title}: ${stats.after.questions} otázek`, '', '| | před | po |', '|---|---|---|',
    row(stats, 'prozrazující tvar přísudku', 'tells'), row(stats, '  z toho sedí jen na správnou možnost', 'only'),
    row(stats, '  číslo (jsou × je)', 'number'), row(stats, '  rod (byla × byl)', 'gender'),
    row(stats, 'možnost s nejistou mluvnickou třídou (nehodnoceno)', 'unknown'), ''];
console.log([`Témata: ${topics.join(', ')}`, '', ...table('Úvody článků (tests/wiki-intros.json + hlášení)', sets.article), ...table('Syntetické úvody „<název> jsou/je <popis>.“', sets.synthetic)].join('\n'));
console.log('## Případ z hlášení');
for (const pair of reportedOut) console.log(`- ${pair.topic} · ${pair.name} [${pair.choices.join(' | ')}]\n  před: ${pair.before}\n  po:   ${pair.after}`);
for (const set of ['article', 'synthetic']) {
    console.log(`\n## Příklady před → po (${set === 'article' ? 'úvody článků' : 'syntetické'})`);
    for (const pair of examples[set]) console.log(`- ${pair.topic} · ${pair.name} [${pair.choices.join(' | ')}]\n  před: ${pair.before}\n  po:   ${pair.after}`);
}
console.log('\n## Zůstává (po)');
for (const pair of examples.left) console.log(`- ${pair.topic} · ${pair.name} [${pair.choices.join(' | ')}] (${pair.verbs.join(', ')}): ${pair.after}`);
if (args.json) fs.writeFileSync(path.resolve(ROOT, args.json), JSON.stringify({ sets, examples }, null, 1));
