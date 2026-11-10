// Ilustrace dlaždic a tipu (docs/OBRAZKY.md č. 40–45) a obrázky do tlačítek a prázdných míst (č. 79–89): zdroj, WebP, mezipaměť
// service workeru, použití v aplikaci a barvy obleku sov.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Look = require('../look.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const ART = ['turnaj', 'nahodny', 'kod', 'cile', 'procvicovani', 'sova-tip'];
const isWebp = (file) => {
    const head = fs.readFileSync(file).subarray(0, 12);
    return head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP';
};

test('ilustrace dlaždic a tipu: zdroj, WebP, mezipaměť service workeru a použití v app.js', () => {
    const precached = read('sw.js').match(/\.\.\.\[([^\]]+)\]\.map\(id => `icons\/topics\/\$\{id\}\.webp`\)/)[1].match(/'[^']+'/g).map(id => id.slice(1, -1));
    const app = read('app.js');
    for (const name of ART) {
        assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ikony', `${name}.png`)), `${name}: zdroj v branding/ikony`);
        const file = path.join(ROOT, 'icons', 'topics', `${name}.webp`);
        assert.ok(fs.existsSync(file) && isWebp(file), `${name}: icons/topics/${name}.webp`);
        assert.ok(precached.includes(name), `${name}: v mezipaměti service workeru (sw.js)`);
        assert.ok(app.includes(`uiArt('${name}'`), `${name}: použité v app.js`);
    }
});

test('sova s žárovkou má všechny barvy obleku a přebarví se jako ostatní sovy', () => {
    for (const robe of Look.ROBES.filter(item => item.id !== 'vinova')) {
        const file = path.join(ROOT, 'icons', 'topics', `sova-tip-${robe.id}.webp`);
        assert.ok(fs.existsSync(file) && isWebp(file), `sova-tip-${robe.id}.webp`);
    }
    // look-robes.js přepíná obrázky sovy podle vzoru icons/topics/sova-<póza>(-<barva>).webp
    const owlSrc = new RegExp(read('look-robes.js').match(/const OWL_SRC = \/(.+)\/;/)[1]);
    assert.equal(owlSrc.exec('icons/topics/sova-tip.webp')[1], 'icons/topics/sova-tip');
    assert.equal(owlSrc.exec('icons/topics/sova-tip-zelena.webp')[1], 'icons/topics/sova-tip');
});

// Obrázky do tlačítek a prázdných míst (docs/OBRAZKY.md č. 79–89): režimy, Učení, Skupiny, Archiv turnajů a tři pózy sovy
const BUTTON_ART = ['rezim-bleskovka', 'rezim-preziti', 'rezim-mapa', 'ucit-prohlizet', 'ucit-procvicit', 'skupiny', 'archiv-turnaju'];
const OWL_POSES = ['sova-zvonek', 'sova-dalekohled', 'sova-ceka'];

test('obrázky do tlačítek a prázdných míst: zdroj, WebP, mezipaměť service workeru a použití v aplikaci', () => {
    const precached = read('sw.js').match(/\.\.\.\[([^\]]+)\]\.map\(id => `icons\/topics\/\$\{id\}\.webp`\)/)[1].match(/'[^']+'/g).map(id => id.slice(1, -1));
    const code = read('app.js') + read('groups.js');
    for (const name of [...BUTTON_ART, ...OWL_POSES]) {
        assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ikony', `${name}.png`)), `${name}: zdroj v branding/ikony`);
        const file = path.join(ROOT, 'icons', 'topics', `${name}.webp`);
        assert.ok(fs.existsSync(file) && isWebp(file), `${name}: icons/topics/${name}.webp`);
        assert.ok(precached.includes(name), `${name}: v mezipaměti service workeru (sw.js)`);
        assert.ok(code.includes(`'${name}'`), `${name}: použité v app.js nebo groups.js`);
    }
    // Režimy mají vlastní ilustrace; odznaky Bleskovka a Přežití zůstávají jen odznakům
    assert.match(read('app.js'), /const MODE_ART = \{ blitz: 'rezim-bleskovka', survival: 'rezim-preziti' \};/);
});

test('nové pózy sovy mají všechny barvy obleku a přebarví se jako ostatní sovy', () => {
    const owlSrc = new RegExp(read('look-robes.js').match(/const OWL_SRC = \/(.+)\/;/)[1]);
    for (const name of OWL_POSES) {
        for (const robe of Look.ROBES.filter(item => item.id !== 'vinova')) {
            const file = path.join(ROOT, 'icons', 'topics', `${name}-${robe.id}.webp`);
            assert.ok(fs.existsSync(file) && isWebp(file), `${name}-${robe.id}.webp`);
            assert.equal(owlSrc.exec(`icons/topics/${name}-${robe.id}.webp`)[1], `icons/topics/${name}`);
        }
        assert.equal(owlSrc.exec(`icons/topics/${name}.webp`)[1], `icons/topics/${name}`);
    }
});
