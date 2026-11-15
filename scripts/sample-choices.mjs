#!/usr/bin/env node
// Ukázka možností: npm run audit:moznosti [-- --topic=umeni,fyzika --count=30 --seed=mudrlant --item="Věstonická venuše"]
// Pro každé téma vylosuje (podle semínka) count položek a vypíše otázku tak, jak ji sestaví aplikace (app.js createRoundData):
// zvláštní druh otázky tématu, nebo „Co je to?“ s nesprávnými možnostmi z buildItemChoices. U každé možnosti je druh (ty) a doba,
// ať jde na první pohled vidět absurdní sadu (k pravěké sošce pomník z 20. století, k myšlenkovému experimentu fyzikální jev).
// Řádek s „!“ = nesprávná možnost z hodně jiné doby, „?“ = jiného druhu, než má správná odpověď (jen upozornění k přečtení).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = require(path.join(ROOT, 'quiz-core.js'));
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const TOPIC_IDS = fs.readdirSync(path.join(ROOT, 'topics')).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
const topics = args.topic ? args.topic.split(',').filter(id => TOPIC_IDS.includes(id)) : TOPIC_IDS;
const count = Number(args.count || 30);
const seed = args.seed || 'mudrlant';
const only = args.item ? args.item.split(',').map(name => core.normalizeAnswer(name)) : null;

const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(countries);
const yearOf = (item) => { const f = (item && item.f) || {}; return [f.y, f.year, f.born, f.from].find(Number.isFinite); };
const describe = (item) => {
    if (!item) return '';
    const year = yearOf(item);
    return [item.ty, Number.isFinite(year) ? (year < 0 ? `${-year} př. n. l.` : String(year)) : '', core.landOf(item)].filter(Boolean).join(', ');
};

// Jiná doba: přes 400 let a stáří víc než 2,5× jiné (u pravěku tedy rozhoduje poměr, 30 a 35 tisíc let je blízko)
const THIS_YEAR = new Date().getFullYear();
const farApart = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 400
    && Math.abs(Math.log(Math.max(1, THIS_YEAR - a) / Math.max(1, THIS_YEAR - b))) > Math.log(2.5);
let warnings = 0;
for (const topicId of topics) {
    const topic = require(path.join(ROOT, 'topics', `${topicId}.js`));
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
    const ctx = { topic, items: data.items, collections: data.collections || [], countries, byId: new Map(data.items.map(item => [item.q, item])) };
    const rng = core.createSeededRandom(`${seed}|${topicId}`);
    const picked = only ? data.items.filter(item => only.includes(core.normalizeAnswer(item.n))) : core.shuffle([...data.items], rng).slice(0, count);
    if (!picked.length) continue;
    console.log(`\n=== ${topic.title} (${topicId}): ${picked.length} z ${data.items.length} položek ===`);
    for (const item of picked) {
        const questionRng = core.createSeededRandom(`${seed}|${item.q}`);
        const special = topic.specialQuestion ? topic.specialQuestion(item, ctx, questionRng) : null;
        const question = special || {
            type: 'name',
            title: (topic.questionTitle && topic.questionTitle(item)) || ((topic.categories || []).find(category => category.key === item.c) || {}).question || topic.words.question,
            choices: core.buildItemChoices(item, ctx.items, questionRng, other => topic.similarity ? topic.similarity(item, other, ctx) : 0, core.cultureLandsFor(topic, ctx))
        };
        console.log(`\n${item.n} [${item.c}${item.ty ? `, ${item.ty}` : ''}] – ${question.type}: ${question.title || ''}${special && special.showName ? ` (${item.n})` : ''}`);
        for (const choice of question.choices || []) {
            const other = ctx.byId.get(choice.id);
            const own = question.type === 'name' ? item : null;
            const far = own && other && farApart(yearOf(own), yearOf(other));
            const kind = own && other && own.ty && other.ty && own.ty !== other.ty;
            const flag = choice.correct ? ' ' : far ? '!' : kind ? '?' : ' ';
            if (flag !== ' ') warnings++;
            const about = question.type === 'name' && other ? describe(other) : '';
            console.log(`  ${choice.correct ? '✓' : flag} ${choice.label}${about ? `  (${about})` : ''}`);
        }
    }
}
console.log(`\nUpozornění (! jiná doba, ? jiný druh): ${warnings}`);
