#!/usr/bin/env node
// Kontrola a ukázky otázek Časové souvislosti (time-questions.js) na skutečných datech: npm run audit:souvislosti [-- --sample=30 --runs=400 --topic=hudba,film --seed=x]
// Pro každé téma sestaví otázky jako hra (plan → buildRound, Základní i Mudrlant) a ověří: právě jedna správná možnost, odstupy let,
// různé názvy, zadání bez slovesa ve shodě s pohlavím hráče, vysvětlení s roky u každé možnosti a nápovědy, které odpověď neprozradí
// (osa bez let možností, roky nanejvýš jedné nesprávné možnosti, u otázek bez osobnosti dvou). Vypíše počty podle druhu
// a ukázky (--sample); exit kód je nenulový při chybě.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = require('../quiz-core.js');
const Time = require('../time-questions.js');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const TOPICS = ['historie', 'fyzika', 'chemie', 'umeni', 'literatura', 'hudba', 'film', 'architektura', 'sport', 'biologie'];
const topics = args.topic ? args.topic.split(',') : TOPICS;
const runs = Number(args.runs || 300);
const sample = Number(args.sample || 0);
const seed = args.seed || 'audit-souvislosti';

core.setCountries(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/countries.json'), 'utf8')).countries);
Time.setIndex(JSON.parse(fs.readFileSync(path.join(ROOT, Time.DATA_FILE), 'utf8')));
const contextOf = (topicId) => {
    const topic = require(`../topics/${topicId}.js`);
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
    return { topic, items: data.items, byId: new Map(data.items.map(item => [item.q, item])), textPhotos: new Set() };
};

// Slovesa v minulém čase ve shodě s pohlavím hráče („uhodl jsi“, „víš, kdo…“ ne): zadání se ptá vždy neutrálně
const GENDERED = /\b(jsi|jste|byl[aoy]?\s+jsi|uhodl|věděl|znal|tipnul|zvolil)\b/iu;
const problems = [];
const counts = {};
const samples = [];
for (const topicId of topics) {
    const ctx = contextOf(topicId);
    const rng = core.createSeededRandom(`${seed}:${topicId}`);
    for (let run = 0; run < runs; run++) {
        const tier = run % 3 === 0 ? 'all' : 'known';
        const pool = core.filterItems(ctx.items, { tier });
        const item = core.pickRandom(pool, rng);
        const planned = Time.plan({ ctx, item, pool, rng, force: true });
        if (!planned) { counts[`${topicId}:bez otázky`] = (counts[`${topicId}:bez otázky`] || 0) + 1; continue; }
        const data = Time.buildRound(planned, ctx);
        const key = `${topicId}:${planned.type}`;
        counts[key] = (counts[key] || 0) + 1;
        const report = (text) => problems.push(`${key} „${data ? data.question.title : '?'}“ ${data ? data.time.subject ? `(${data.time.subject.name})` : '' : ''}: ${text}`);
        if (!data) { report('buildRound neprošel kontrolou'); continue; }
        const question = data.question;
        if (question.choices.length !== 4 || question.choices.filter(choice => choice.correct).length !== 1) report('správná není právě jedna');
        if (new Set(question.choices.map(choice => core.normalizeAnswer(choice.label))).size !== 4) report('stejné možnosti');
        if (GENDERED.test(question.title)) report('zadání ve shodě s pohlavím hráče');
        if (!data.time.rows.every(row => row.years)) report('řádek vysvětlení bez roků');
        if (!data.resultVisual || data.resultVisual.type !== 'chronology') report('bez osy ve výsledku');
        // Nápovědy: osa jen s osobností či věcí, fakta s roky nesprávných možností (nanejvýš dvě), nikdy správná
        const correct = question.choices.find(choice => choice.correct);
        for (const hint of data.hints) {
            if (hint.kind === 'facts' && hint.facts.some(fact => fact.label === correct.label)) report('nápověda prozradí správnou možnost');
            if (hint.kind === 'visual' && data.time.rows.some(row => hint.spec.spans.some(span => span.from === row.from && span.to === row.to && row.id !== (data.time.subject || {}).id))) report('osa v nápovědě ukazuje možnost');
        }
        if (data.hints.filter(hint => hint.kind === 'facts').length > 2) report('víc než dvě nápovědy s fakty');
        const issues = Time.check(planned, Time.entriesFor(ctx));
        issues.forEach(report);
        if (sample && samples.filter(entry => entry.key.startsWith(`${topicId}:`)).length < sample) samples.push({ key, data });
    }
}

const byType = {};
for (const [key, count] of Object.entries(counts)) {
    const type = key.split(':')[1];
    byType[type] = (byType[type] || 0) + count;
}
console.log('Otázky podle témat a druhů:');
for (const topicId of topics) console.log(`  ${topicId}: ${Object.entries(counts).filter(([key]) => key.startsWith(`${topicId}:`)).map(([key, count]) => `${key.split(':')[1]} ${count}`).join(', ')}`);
console.log(`Celkem podle druhu: ${Object.entries(byType).map(([type, count]) => `${type} ${count}`).join(', ')}`);

if (sample) {
    // Rozmanitý výběr: témata na střídačku, v každém tématu nejdřív různé druhy otázek
    const byTopic = topics.map(topicId => {
        const list = samples.filter(entry => entry.key.startsWith(`${topicId}:`));
        const firstOfType = list.filter((entry, i) => list.findIndex(other => other.key === entry.key) === i);
        return [...firstOfType, ...list.filter(entry => !firstOfType.includes(entry))];
    });
    const picked = [];
    for (let round = 0; picked.length < sample && byTopic.some(list => list.length > round); round++) {
        for (const list of byTopic) if (picked.length < sample && list[round]) picked.push(list[round]);
    }
    console.log(`\nUkázky (${picked.length}):`);
    picked.forEach(({ key, data }, index) => {
        const time = data.time;
        console.log(`\n${index + 1}. [${key}] ${data.question.title}${time.subject ? `  — ${time.subject.name}${time.subject.detail ? ` (${time.subject.detail})` : ''}` : ''}`);
        console.log(`   Možnosti: ${data.question.choices.map(choice => `${choice.correct ? '✓ ' : ''}${choice.label}${choice.detail ? ` [${choice.detail}]` : ''}`).join(' | ')}`);
        console.log(`   Nápovědy: ${data.hints.map(hint => hint.kind === 'visual' ? `osa ${hint.spec.spans.map(span => `${span.from}–${span.to}`).join(',')}${hint.spec.points.join(',')}` : hint.facts.map(fact => `${fact.label}: ${fact.value}`).join('; ')).join(' / ') || '–'}`);
        console.log(`   Vysvětlení: ${data.description}`);
    });
}
if (problems.length) {
    console.log(`\nChyby (${problems.length}):`);
    [...new Set(problems)].slice(0, 80).forEach(line => console.log(`  ${line}`));
    process.exitCode = 1;
} else console.log('\nBez chyb.');
