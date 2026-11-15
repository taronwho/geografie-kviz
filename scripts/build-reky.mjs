// Další státy řek v hotových datech Zeměpisu: npm run build:reky (asi minuta, po build:zemepis a build:mapa-tvary)
// Doplní pole ca (scripts/lib/zemepis-reky.mjs) do data/zemepis.json bez nového stahování míst – ostatní údaje, pořadí položek
// i datum sestavení zůstanou, takže se nezmění výběr dnešních otázek ani Kvízu dne
import { readFileSync, writeFileSync } from 'node:fs';
import { readCountries } from './lib/wikidata.mjs';
import { addRiverCountries } from './lib/zemepis-reky.mjs';

const file = new URL('../data/zemepis.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
await addRiverCountries(data.items, readCountries());
writeFileSync(file, JSON.stringify(data));
console.log('Hotovo: data/zemepis.json (pole ca u řek)');
