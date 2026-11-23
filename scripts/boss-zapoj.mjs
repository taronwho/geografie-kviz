// Zapojení nových bossů týdne, až mají obrázky (docs/OBRAZKY.md oddíl 41, č. 520–559).
// Bossové ze soupisky boss.js (ROSTER), kteří ještě nejsou v rotaci (PENDING), se do hry dostanou teprve tímto skriptem:
//  1. chybějící WebP v icons/topics vyrobí ze zdrojů (branding/ikony/boss-<id>[-zraneny|-vkoncich|-porazeny].png
//     a branding/areny/arena-<id>.jpg nebo .png) přes scripts/boss-art.py;
//  2. vybere bosse, kteří mají všech pět obrázků (čtyři stupně a arénu); ostatní vypíše i s chybějícími soubory a nechá čekat;
//  3. přidá do boss.js nový úsek rotace (blok @rotace-zacatek … @rotace-konec) od budoucího týdne: výchozí je příští pondělí,
//     v sobotu a v neděli až to další, ať nasazení stihne začátek týdne (jinak --od=RRRR-MM-DD, vždy pondělí po běžícím týdnu).
//     Proběhlé ani běžící týdny se nezmění. Emblémy přidá na konec BOSS_EMBLEMS v quiz-core.js, obrázky do mezipaměti v sw.js,
//     v docs/OBRAZKY.md označí obrázky jako dodané a v docs/NOVE-MODY.md smaže „čeká na obrázky“. Katalog odznaků na serveru
//     (supabase/schema.sql, blok 51) je zná předem.
// Spuštění: node scripts/boss-zapoj.mjs [id …] [--od=RRRR-MM-DD] [--zkouska]   (--zkouska jen vypíše, co by udělal, nic nezapíše)
// Potom: node --test tests/boss.test.js tests/e2e-boss.test.js tests/quiz-core.test.js tests/album.test.js, commit a nasazení před začátkem úseku.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Boss = require(path.join(ROOT, 'boss.js'));

const args = process.argv.slice(2);
const flag = (name) => args.find(arg => arg === `--${name}` || arg.startsWith(`--${name}=`));
const dry = Boolean(flag('zkouska'));
const od = (flag('od') || '').split('=')[1] || '';
const asked = args.filter(arg => !arg.startsWith('--'));
const fail = (message) => { console.error(message); process.exit(1); };

const activeIds = Boss.BOSSES.map(boss => boss.id);
const unknown = asked.filter(id => !Boss.ROSTER_BY_ID[id]);
if (unknown.length) fail(`Neznámí bossové: ${unknown.join(', ')}. Na zapojení čekají: ${Boss.PENDING.map(boss => boss.id).join(', ') || 'nikdo'}.`);
asked.filter(id => activeIds.includes(id)).forEach(id => console.log(`${id}: už je v rotaci.`));
const wanted = (asked.length ? asked.filter(id => !activeIds.includes(id)) : Boss.PENDING.map(boss => boss.id));
// V pořadí soupisky (stejné pořadí pak mají BOSSES v boss.js i BOSS_EMBLEMS v quiz-core.js)
const candidates = Boss.ROSTER.map(boss => boss.id).filter(id => wanted.includes(id));
if (!candidates.length) fail('Žádný boss nečeká na zapojení.');

// 1. Převod zdrojů na WebP (jen chybějící)
const webp = (name) => path.join(ROOT, 'icons', 'topics', `${name}.webp`);
const sources = (name) => (name.startsWith('arena-')
    ? [path.join(ROOT, 'branding', 'areny', `${name}.jpg`), path.join(ROOT, 'branding', 'areny', `${name}.png`)]
    : [path.join(ROOT, 'branding', 'ikony', `${name}.png`)]);
const convert = candidates.flatMap(id => Boss.artNames(id)).filter(name => !fs.existsSync(webp(name)) && sources(name).some(file => fs.existsSync(file)));
if (convert.length) {
    console.log(`Převádím do WebP: ${convert.join(', ')}`);
    if (!dry) {
        const run = spawnSync('python3', [path.join('scripts', 'boss-art.py'), ...convert], { cwd: ROOT, stdio: 'inherit' });
        if (run.status !== 0) fail('Převod obrázků (scripts/boss-art.py) selhal, nic jsem nezapojil.');
    }
}

// 2. Kdo má všech pět obrázků
const missing = (id) => Boss.artNames(id).filter(name => !fs.existsSync(webp(name)) && !(dry && convert.includes(name)));
const ready = candidates.filter(id => !missing(id).length);
candidates.filter(id => missing(id).length).forEach(id => {
    const names = missing(id).map(name => `${name}.${name.startsWith('arena-') ? 'jpg (nebo .png)' : 'png'}`);
    console.log(`${Boss.ROSTER_BY_ID[id].name} (${id}) čeká, chybí: ${names.join(', ')}`);
});
if (!ready.length) fail('Žádný nový boss nemá všech pět obrázků, rotace zůstává beze změny.');

// 3. Od kterého týdne (vždy až po běžícím týdnu)
const current = Boss.weekOf();
const weekday = Math.round((Date.parse(`${Boss.pragueDay()}T00:00:00Z`) - Date.parse(`${current}T00:00:00Z`)) / 86400000);
// (a po začátku posledního úseku: kdo přijde v témže týdnu po předchozím zapojení, začne o týden později)
const lastFrom = Boss.ROTATION[Boss.ROTATION.length - 1].from;
const soonest = Boss.addWeeks(current, weekday >= 5 ? 2 : 1);
const from = od || (soonest > lastFrom ? soonest : Boss.addWeeks(lastFrom, 1));
if (!Boss.isWeek(from)) fail(`--od=${from}: týden musí začínat pondělím (RRRR-MM-DD).`);
if (from <= current) fail(`--od=${from}: nový boss smí přijít až od příštího týdne (běží týden ${current}).`);
let rotation;
try { rotation = Boss.extendRotation(Boss.ROTATION, ready, from); } catch (error) { fail(error.message); }

// Zápis
const replaceOnce = (text, pattern, replacement, what) => {
    if (!pattern.test(text)) fail(`Nenašel jsem ${what}, nic jsem nezapsal.`);
    return text.replace(pattern, replacement);
};
const q = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const files = {};
const read = (name) => (files[name] ??= fs.readFileSync(path.join(ROOT, name), 'utf8'));

const block = `    const ROTATION = [\n${rotation.map(segment => `        { from: ${q(segment.from)}, ids: [${segment.ids.map(q).join(', ')}] }`).join(',\n')}\n    ];\n`;
files['boss.js'] = replaceOnce(read('boss.js'), /(\/\/ @rotace-zacatek\n)[\s\S]*?(\s*\/\/ @rotace-konec)/, (_, start, end) => `${start}${block.replace(/\n$/, '')}${end}`, 'blok rotace v boss.js');

const emblems = ready.map(id => { const boss = Boss.ROSTER_BY_ID[id]; return `        [${[boss.id, boss.name, boss.whom, boss.title].map(q).join(', ')}]`; });
files['quiz-core.js'] = replaceOnce(read('quiz-core.js'), /(const BOSS_EMBLEMS = \[[\s\S]*?\])(\n    \];)/, (_, list, end) => `${list},\n${emblems.join(',\n')}${end}`, 'BOSS_EMBLEMS v quiz-core.js');

const swIds = [...activeIds, ...ready].map(q).join(', ');
files['sw.js'] = replaceOnce(read('sw.js'), /\.\.\.\[[^\]]*\](\.flatMap\(id => \[`boss-\$\{id\}`)/, (_, rest) => `...[${swIds}]${rest}`, 'seznam bossů v sw.js');

const doneNames = new Set(ready.flatMap(id => Boss.artNames(id)));
files['docs/OBRAZKY.md'] = read('docs/OBRAZKY.md').split('\n').map(line => {
    const match = /^#### \d+\. `([a-z-]+)\.png` – .* – čeká na dodání$/.exec(line);
    return match && doneNames.has(match[1]) ? line.replace(/ – čeká na dodání$/, ' – ✅ dodáno, zapojeno') : line;
}).join('\n');
files['docs/NOVE-MODY.md'] = read('docs/NOVE-MODY.md').split('\n')
    .map(line => (ready.some(id => line.startsWith(`| \`${id}\` |`)) ? line.replace(' *(čeká na obrázky)*', '') : line)).join('\n');

const names =ready.map(id => `${Boss.ROSTER_BY_ID[id].name} (${id})`).join(', ');
console.log(`${dry ? 'Zkouška, nic nezapisuji. ' : ''}Do rotace od ${from} (${Boss.weekLabel(from)}): ${names}`);
console.log('Rozpis od běžícího týdne:');
for (let index = 0; index < rotation[rotation.length - 1].ids.length + 2; index++) {
    const week = Boss.addWeeks(current, index);
    console.log(`  ${week}  ${Boss.rotationIdFor(rotation, week)}${week === from ? '   ← nový úsek' : ''}`);
}
if (!dry) {
    Object.entries(files).forEach(([name, text]) => fs.writeFileSync(path.join(ROOT, name), text));
    console.log(`Zapsáno: ${Object.keys(files).join(', ')}. Spusť testy bossů, commitni a nasaď nejpozději v neděli před ${from}.`);
}
