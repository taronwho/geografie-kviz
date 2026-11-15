// Náhrady fotek v hotových datech témat: npm run build:fotky (bez sítě, po sestavení dat témat; pak node scripts/build-licenses.mjs)
// Soubor z Wikidat, který je v PHOTO_REPLACEMENTS (scripts/lib/wikidata.mjs: mapa nebo plán místo fotky, soubor bez licence,
// smazaný soubor), nahradí stejně jako sestavení dat (imageFields): nový název a hash náhledu. Ostatní údaje i pořadí položek
// zůstanou, takže se nezmění výběr dnešních otázek ani Kvízu dne.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { PHOTO_REPLACEMENTS, imageFields } from './lib/wikidata.mjs';

const dir = new URL('../data/', import.meta.url);
let changed = 0;
for (const file of readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'licenses.json').sort()) {
    const url = new URL(file, dir);
    const text = readFileSync(url, 'utf8');
    if (!text.includes('"im"')) continue;
    const data = JSON.parse(text);
    const items = Array.isArray(data.items) ? data.items : [];
    let count = 0;
    for (const item of items) {
        if (!item || typeof item.im !== 'string' || !Object.hasOwn(PHOTO_REPLACEMENTS, item.im)) continue;
        const { im, ih } = imageFields(item.im);
        if (im) { item.im = im; item.ih = ih; } else { delete item.im; delete item.ih; }
        count++;
    }
    if (!count) continue;
    // Stejný zápis jako sestavení dat (JSON na jednom řádku)
    writeFileSync(url, JSON.stringify(data));
    console.log(`data/${file}: ${count} ${count === 1 ? 'náhrada' : count < 5 ? 'náhrady' : 'náhrad'}`);
    changed += count;
}
console.log(`Hotovo: ${changed} fotek nahrazeno`);
