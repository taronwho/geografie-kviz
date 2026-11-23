#!/usr/bin/env node
// Zmrazení dat témat pro původní generátor Řetězovky (chain-legacy.js, dny před chain.js NEW_FROM): data/retezovka-legacy.json
// = pro každé téma položky přidané od základní verze dat (exclude), původní hodnoty změněných polí (patch, null = pole tehdy
// nebylo) a celé položky, které od té doby zmizely (restore).
// chain.js legacyDailyChain je na data použije, takže rozšíření témat (nové známé položky, přesuny do kategorií) nezmění řetěz dne,
// který už někdo hrál. Základ: commit s daty, ze kterých staví snímek tests/chain-legacy-snapshot.json.
//   node scripts/build-retezovka-legacy.mjs [commit]      (výchozí ccb96c3: data před rozšířeními Zeměpisu, Architektury a Filmu)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.argv[2] || 'ccb96c3';
const SOURCES = ['zemepis', 'architektura', 'hudba', 'literatura', 'umeni', 'film', 'sport'];
const out = {};
for (const topic of SOURCES) {
    const old = JSON.parse(execFileSync('git', ['show', `${BASE}:data/${topic}.json`], { encoding: 'utf8', maxBuffer: 1 << 28 })).items;
    const now = JSON.parse(readFileSync(new URL(`../data/${topic}.json`, import.meta.url), 'utf8')).items;
    const before = new Map(old.map(item => [item.q, item]));
    const exclude = [];
    const patch = {};
    for (const item of now) {
        const was = before.get(item.q);
        if (!was) { exclude.push(item.q); continue; }
        const diff = {};
        for (const key of new Set([...Object.keys(was), ...Object.keys(item)])) {
            if (JSON.stringify(was[key]) !== JSON.stringify(item[key])) diff[key] = was[key] === undefined ? null : was[key];
        }
        if (Object.keys(diff).length) patch[item.q] = diff;
    }
    // Položky, které od základu zmizely, se vrátí celé
    const present = new Set(now.map(item => item.q));
    const restore = old.filter(item => !present.has(item.q));
    if (exclude.length || Object.keys(patch).length || restore.length) out[topic] = { exclude, patch, ...(restore.length ? { restore } : {}) };
}
writeFileSync(new URL('../data/retezovka-legacy.json', import.meta.url), JSON.stringify(out));
console.log(Object.entries(out).map(([topic, { exclude, patch }]) => `${topic}: nových ${exclude.length}, změněných ${Object.keys(patch).length}`).join('; '));
