// Vygeneruje icons.js jen s ikonami, které aplikace používá (místo celé knihovny Lucide, 444 kB)
// Spuštění: npm run build:icons
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';

const LUCIDE_VERSION = '1.48.0';
const ICONS = [
    'arrow-right', 'book-open', 'building-2', 'calendar-days', 'circle-check', 'circle-x', 'compass', 'external-link', 'eye', 'flag',
    'flame', 'globe', 'globe-2', 'image', 'keyboard', 'layout-grid', 'leaf', 'lightbulb', 'map-pin', 'minus',
    'mountain', 'navigation', 'palmtree', 'plus', 'radar', 'search-x', 'send', 'settings-2', 'share-2', 'shuffle',
    'tag', 'target', 'trophy', 'waves', 'wifi-off', 'x'
];

const toPascalCase = (name) => name.replace(/(^|-)(\w)/g, (_, __, letter) => letter.toUpperCase());

const response = await fetch(`https://unpkg.com/lucide@${LUCIDE_VERSION}/dist/umd/lucide.js`);
if (!response.ok) throw new Error(`Stažení Lucide selhalo: HTTP ${response.status}`);
const sandbox = {};
sandbox.self = sandbox;
vm.runInNewContext(await response.text(), sandbox);

const icons = {};
for (const name of ICONS) {
    const node = sandbox.lucide.icons[toPascalCase(name)];
    if (!node) throw new Error(`Ikona ${name} v Lucide ${LUCIDE_VERSION} neexistuje`);
    icons[name] = node;
}

writeFileSync(new URL('../icons.js', import.meta.url), [
    `// Vygenerováno skriptem scripts/build-icons.mjs z Lucide ${LUCIDE_VERSION} (ISC licence, https://lucide.dev/license)`,
    `window.GEO_ICONS = ${JSON.stringify(icons)};`,
    ''
].join('\n'));
console.log(`icons.js: ${ICONS.length} ikon`);
