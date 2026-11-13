#!/usr/bin/env node
// Data otázek Časové souvislosti (time-questions.js): data/souvislosti.json se známými osobnostmi a datovanými věcmi všech témat
// (jen spolehlivé roky, stejná pravidla jako ve hře – timeFacts) a se slavnými objevy a vynálezy z data/vynalezy.json.
// Hra bere položky hraného tématu z jeho dat (všechny úrovně podle nastavení) a z tohoto souboru jen známé položky ostatních témat
// jako nesprávné či správné možnosti (Newton a Bach, Mozart a parní stroj). Spouští se po sestavení dat témat a po build:vynalezy:
// npm run build:souvislosti
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Time = require('../time-questions.js');
const ROOT = new URL('../', import.meta.url);
// Pořadí určuje, ke kterému tématu patří osoba, která je ve dvou (Leonardo da Vinci: Výtvarné umění, ne Fyzika)
const TOPICS = ['historie', 'umeni', 'literatura', 'hudba', 'film', 'architektura', 'fyzika', 'chemie', 'sport'];

const people = [];
const dated = [];
const seen = new Set();
const counts = {};
const extras = JSON.parse(readFileSync(new URL('data/vynalezy.json', ROOT), 'utf8')).items;
const extraIds = new Set(extras.map(entry => entry.q));
const topicData = Object.fromEntries(TOPICS.map(topicId => [topicId, JSON.parse(readFileSync(new URL(`data/${topicId}.json`, ROOT), 'utf8'))]));
// Autoři všech témat (i méně známí): dílo vydané až po smrti autora (Proces, Macbeth 1623) se neptá
const authors = new Map();
for (const topicId of TOPICS) Time.authorsOf(topicData[topicId].items, topicId, authors);
for (const topicId of TOPICS) {
    for (const item of topicData[topicId].items) {
        if (seen.has(item.q) || extraIds.has(item.q)) continue;
        const entry = Time.timeFacts(item, topicId);
        // Z ostatních témat jen známé položky (úroveň Základní)
        if (!entry || entry.lvl !== 1) continue;
        if (!Number.isInteger(entry.b) && !Time.authorFits(entry, authors.get(entry.byq))) continue;
        seen.add(item.q);
        // Do souboru jen to, co hra u možností z jiných témat potřebuje (bez úrovně, kategorie a země; žijící bez roku úmrtí)
        const { lvl, c, l, ...rest } = entry;
        if (rest.d === null) delete rest.d;
        (Number.isInteger(rest.b) ? people : dated).push(rest);
        const key = `${topicId}:${Number.isInteger(rest.b) ? 'osoby' : rest.kd}`;
        counts[key] = (counts[key] || 0) + 1;
    }
}
for (const entry of extras) {
    const { lvl, ...rest } = Time.extraFacts(entry);
    dated.push(rest);
    counts[`${rest.tp}:${rest.kd} (vynalezy.json)`] = (counts[`${rest.tp}:${rest.kd} (vynalezy.json)`] || 0) + 1;
}
const out = { generated: new Date().toISOString().slice(0, 10), people, dated };
const text = `{"generated":${JSON.stringify(out.generated)},\n"people":[\n${people.map(entry => JSON.stringify(entry)).join(',\n')}\n],\n"dated":[\n${dated.map(entry => JSON.stringify(entry)).join(',\n')}\n]}\n`;
writeFileSync(new URL('data/souvislosti.json', ROOT), text);
console.log(`data/souvislosti.json: ${people.length} osob, ${dated.length} datovaných věcí, ${Math.round(text.length / 1024)} kB`);
for (const [key, count] of Object.entries(counts).sort()) console.log(`  ${key}: ${count}`);
