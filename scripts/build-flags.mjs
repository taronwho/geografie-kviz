// Vlajky na vlaječce sovy: look-flags.js (MudrlantFlags) = kompaktní mapa q → [název státu česky, soubor na Commons, hash cesty]
// z data/vlajky.json. Berou se položky kategorie „vlajka“ (vlajky dnešních států; znaky, území a organizace jsou v jiných
// kategoriích), které mají název státu (n), soubor (im) a hash cesty (ih). Pořadí je podle abecedy (česky), takže výběr
// v Nastavení nemusí řadit. Spuštění: node scripts/build-flags.mjs (po každém npm run build:vlajky)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data', 'vlajky.json'), 'utf8'));

const flags = data.items
    .filter(item => item.c === 'vlajka' && /^Q\d{1,9}$/.test(item.q) && item.n && item.im && /^[0-9a-f]{2}$/.test(item.ih || ''))
    .map(item => [item.q.toLowerCase(), item.n, item.im, item.ih]);
const collator = new Intl.Collator('cs');
flags.sort((a, b) => collator.compare(a[1], b[1]));
if (new Set(flags.map(flag => flag[0])).size !== flags.length) throw new Error('Vlajka se opakuje');

const entries = flags.map(([q, name, file, hash]) => `        ${q}: ${JSON.stringify([name, file, hash])}`).join(',\n');
const source = `// Vlajky států pro vlaječku sovy: id (malé q Wikidat) → [název státu, soubor na Wikimedia Commons, hash cesty].
// Vygenerováno skriptem scripts/build-flags.mjs z data/vlajky.json (${flags.length} států, podle abecedy); ručně se needituje.
// Adresu miniatury skládá MudrlantCore.commonsPhotoUrl(soubor, hash, šířka) – stejně jako u fotek v kvízu.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantFlags = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const FLAGS = {
${entries}
    };
    const ID = /^q\\d{1,9}$/;
    const has = (id) => typeof id === 'string' && ID.test(id) && Object.prototype.hasOwnProperty.call(FLAGS, id);
    // { id, name, file, hash } nebo null
    const find = (id) => has(id) ? { id, name: FLAGS[id][0], file: FLAGS[id][1], hash: FLAGS[id][2] } : null;
    // Všechny vlajky v abecedním pořadí států
    const list = () => Object.keys(FLAGS).map(find);
    return { FLAGS, ID, has, find, list };
});
`;
writeFileSync(join(root, 'look-flags.js'), source);
console.log(`look-flags.js: ${flags.length} vlajek států`);
