// Vygeneruje icons.js jen s ikonami, které aplikace používá (místo celé knihovny Lucide, 444 kB)
// Spuštění: npm run build:icons
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';

const LUCIDE_VERSION = '1.48.0';
const ICONS = [
    'arrow-right', 'atom', 'beaker', 'bird', 'book-open', 'bug', 'building-2', 'calendar-days', 'calendar-range', 'castle',
    'cat', 'check', 'chevron-down', 'chevron-left', 'chevron-right', 'circle-check', 'circle-x', 'compass', 'crown', 'dna', 'droplets',
    'lock', 'play', 'quote', 'satellite', 'square', 'square-check-big', 'type', 'users', 'expand',
    'external-link', 'eye', 'fish', 'flag', 'flame', 'flask-conical', 'flower-2', 'gauge', 'gem', 'git-branch',
    'globe', 'globe-2', 'graduation-cap', 'grid-3x3', 'hourglass', 'house', 'image', 'info', 'keyboard', 'landmark',
    'layers', 'layout-grid', 'leaf', 'magnet', 'map', 'map-pin', 'microscope', 'minus', 'mountain', 'navigation',
    'network', 'orbit', 'palmtree', 'paw-print', 'plus', 'repeat', 'rocket', 'ruler', 'scale', 'scroll',
    'search-x', 'send', 'settings-2', 'share-2', 'shell', 'shuffle', 'sigma', 'sprout', 'star', 'swords',
    'table', 'tag', 'target', 'telescope', 'test-tube', 'thermometer', 'trash-2', 'trees', 'trophy', 'turtle',
    'user', 'waves', 'wifi-off', 'x', 'zap',
    // Témata kultura, umění, sport, geologie, mytologie a vlajky
    'music', 'music-2', 'mic-vocal', 'guitar', 'piano', 'disc-3', 'book', 'library', 'feather', 'pen-tool', 'pen-line', 'book-marked',
    'book-open-text', 'scroll-text', 'clapperboard', 'film', 'popcorn', 'video', 'palette', 'brush', 'frame', 'shield', 'sparkles',
    'sun', 'moon', 'ghost', 'medal', 'dumbbell', 'bike', 'footprints', 'church', 'building', 'columns-3', 'pickaxe', 'mountain-snow',
    'hammer', 'clock', 'timer', 'calendar', 'drama', 'person-standing', 'user-round', 'venetian-mask', 'wand-sparkles', 'award', 'goal',
    'volleyball', 'hexagon', 'diamond', 'sword', 'skull', 'pyramid', 'triangle', 'tent'
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
    `window.MUDRLANT_ICONS = ${JSON.stringify(icons)};`,
    ''
].join('\n'));
console.log(`icons.js: ${ICONS.length} ikon`);
