// Ilustrované symboly odznaků, truhla a ochrana série: každá skupina se symbolem v app.js (BADGE_ART) existuje, má obrázek
// v icons/topics, zdroj v branding/ikony a je v mezipaměti service workeru (aplikace offline)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const listed = (source, pattern) => [...pattern.exec(source)[1].matchAll(/'([a-z0-9-]+)'/g)].map(match => match[1]);

test('symboly odznaků: skupiny, obrázky, zdroje a mezipaměť', () => {
    const art = listed(app, /const BADGE_ART = new Set\(\[([^\]]+)\]\)/);
    const groups = new Set(core.BADGE_GROUPS.map(group => group.id));
    assert.ok(art.length >= 31);
    assert.deepEqual(art.filter(id => !groups.has(id)), [], 'každý symbol patří existující skupině');
    const missing = core.BADGE_GROUPS.filter(group => !group.topic && !art.includes(group.id) && !/^(tema|zbehly)-/.test(group.id)).map(group => group.id);
    assert.deepEqual(missing, [], 'každá skupina (kromě témat) má symbol');
    const swArt = listed(sw, /const BADGE_ART = \[([^\]]+)\]/);
    assert.match(sw, /\.\.\.BADGE_ART\.map\(id => `icons\/topics\/odznak-\$\{id\}\.webp`\)/);
    assert.deepEqual([...swArt].sort(), [...art].sort(), 'sw.js má stejný seznam');
    for (const name of [...art.map(id => `odznak-${id}`), 'truhla', 'ochrana-serie', 'diplom']) {
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), `${name}.webp`);
        assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ikony', `${name}.png`)), `${name}.png`);
    }
    assert.match(sw, /'truhla', 'ochrana-serie', 'diplom'/);
});
