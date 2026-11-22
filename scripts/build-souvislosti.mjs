#!/usr/bin/env node
// Data otázek Časové souvislosti (time-questions.js): data/souvislosti.json se známými osobnostmi a datovanými věcmi všech témat
// (jen spolehlivé roky, stejná pravidla jako ve hře – timeFacts) a se slavnými objevy a vynálezy z data/vynalezy.json.
// Hra bere položky hraného tématu z jeho dat (všechny úrovně podle nastavení) a z tohoto souboru jen známé položky ostatních témat
// jako nesprávné či správné možnosti (Newton a Bach, Mozart a parní stroj). Spouští se po sestavení dat témat a po build:vynalezy:
// npm run build:souvislosti (s BUILD_CACHE=složka se návštěvnost článků uloží a další běh se sítě neptá; OFFLINE=1 jen z mezipaměti)
// Známost: k = 1 nestačí (rakouský spisovatel Klaus Ebner nebo Černý leden v Baku mají hodně jazykových verzí Wikipedie, ale český
// hráč je nezná). Položky k = 1, které podle návštěvnosti české Wikipedie a pořadí v kategorii slavné nejsou (scripts/lib/souvislosti-fame.mjs),
// jsou v poli obscure: hra je nebere mezi známé (možnosti z ostatních témat, hraní na úrovni Základní); Kvíz dne do FAME_FROM
// v time-questions.js je bere jako dřív, ať dny, které už hráči hráli, zůstanou stejné
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isFamous, pageviewsOf } from './lib/souvislosti-fame.mjs';

const require = createRequire(import.meta.url);
const Time = require('../time-questions.js');
const ROOT = new URL('../', import.meta.url);
// Pořadí určuje, ke kterému tématu patří osoba, která je ve dvou (Leonardo da Vinci: Výtvarné umění, ne Fyzika)
const TOPICS = ['historie', 'umeni', 'literatura', 'hudba', 'film', 'architektura', 'fyzika', 'chemie', 'sport', 'technika'];

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
// Známost všech položek k = 1 (i těch, které jsou ve dvou tématech): pořadí v kategorii (data jsou seřazená podle jazykových verzí)
// a návštěvnost článku na české Wikipedii za rok
const ranks = new Map();
const candidates = [];
for (const topicId of TOPICS) {
    const byCategory = new Map();
    for (const item of topicData[topicId].items) {
        if (!byCategory.has(item.c)) byCategory.set(item.c, []);
        byCategory.get(item.c).push(item);
    }
    for (const item of topicData[topicId].items) {
        const list = byCategory.get(item.c);
        ranks.set(`${topicId}:${item.q}`, { rank: list.indexOf(item), size: list.length });
        const entry = Time.timeFacts(item, topicId);
        if (entry && entry.lvl === 1 && item.t) candidates.push({ topicId, item, entry });
    }
}
const views = await pageviewsOf(candidates.map(({ item }) => item.t), { offline: process.env.OFFLINE === '1' });
const obscure = new Set();
const fameCounts = {};
for (const { topicId, item, entry } of candidates) {
    const famous = isFamous(entry, { ...ranks.get(`${topicId}:${item.q}`), views: views[item.t] });
    const key = `${topicId}:${Number.isInteger(entry.b) ? 'osoby' : entry.kd}`;
    fameCounts[key] = fameCounts[key] || [0, 0];
    fameCounts[key][famous ? 0 : 1]++;
    if (!famous) obscure.add(item.q);
}
// Položka slavná v jednom tématu (Leonardo v Umění) je slavná i v druhém
for (const { item, entry } of candidates) if (obscure.has(item.q) && candidates.some(other => other.item.q === item.q && other.entry !== entry && isFamous(other.entry, { ...ranks.get(`${other.topicId}:${item.q}`), views: views[item.t] }))) obscure.delete(item.q);
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
const out = { generated: new Date().toISOString().slice(0, 10), people, dated, obscure: [...obscure].sort() };
const text = `{"generated":${JSON.stringify(out.generated)},\n"people":[\n${people.map(entry => JSON.stringify(entry)).join(',\n')}\n],\n"dated":[\n${dated.map(entry => JSON.stringify(entry)).join(',\n')}\n],\n"obscure":${JSON.stringify(out.obscure)}}\n`;
writeFileSync(new URL('data/souvislosti.json', ROOT), text);
const famousOf = (list) => list.filter(entry => !obscure.has(entry.q)).length;
console.log(`data/souvislosti.json: ${people.length} osob (slavných ${famousOf(people)}), ${dated.length} datovaných věcí (slavných ${famousOf(dated)}), ${obscure.size} k = 1 bez slávy, ${Math.round(text.length / 1024)} kB`);
for (const [key, count] of Object.entries(counts).sort()) console.log(`  ${key}: ${count}`);
console.log('Slavné / bez slávy podle témat a druhů (i položky hraného tématu):');
for (const [key, [famous, other]] of Object.entries(fameCounts).sort()) console.log(`  ${key}: ${famous} / ${other}`);
