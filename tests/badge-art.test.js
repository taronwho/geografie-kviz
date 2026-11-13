// Ilustrované symboly odznaků, truhla (zavřená i otevřená) a ochrana série: každá skupina se symbolem v app.js (BADGE_ART) existuje, má obrázek
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
    // Odznaky alba sbírky mají obrázek Sběratel (album.js BADGE_ART, docs/OBRAZKY.md č. 149), skupina sberatel je i v BADGE_ART
    const album = (group) => group.badges.every(badge => core.isAlbumBadge(badge.id));
    // Odznaky Zlatokop mají symbol z gold.js (ART.badge: do dodání obrázku č. 211 zástupný obrázek, který už je v mezipaměti)
    const Gold = require('../gold.js');
    // Kamarádské sázky mají do dodání vlastního symbolu zástupný obrázek z bets.js (ART.badges, existující soubor v mezipaměti)
    const betArt = require('../bets.js').ART.badges;
    assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${Gold.ART.badge}.webp`)), `symbol Zlatokopa ${Gold.ART.badge}.webp`);
    assert.ok(sw.includes(`'${Gold.ART.badge}'`), 'symbol Zlatokopa je v mezipaměti');
    // Skupiny, jejichž obrázek se teprve kreslí (docs/NOVE-MODY.md): do dodání mají čárovou ikonu
    const PENDING_ART = new Set([]);
    const missing = core.BADGE_GROUPS.filter(group => !group.topic && !art.includes(group.id) && !PENDING_ART.has(group.id) && !/^(tema|zbehly)-/.test(group.id) && !album(group) && !betArt[group.id] && group.id !== Gold.BADGE_GROUP && !core.isBossBadge(group.id)).map(group => group.id);
    assert.deepEqual(missing, [], 'každá skupina (kromě témat, alba a bossů) má symbol');
    // Emblémy bossů týdne: portrét bosse (boss.js ART, do dodání ilustrací zástupná sova) existuje
    const Boss = require('../boss.js');
    for (const group of core.BADGE_GROUPS.filter(entry => core.isBossBadge(entry.id))) {
        const boss = Boss.bossOfBadge(group.id);
        assert.ok(boss, `${group.id} patří bossovi`);
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${Boss.artFor(boss.id, 1)}.webp`)), `portrét ${group.id}`);
    }
    for (const [group, name] of Object.entries(betArt)) {
        assert.ok(groups.has(group), `skupina ${group}`);
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), `zástupný symbol ${name}.webp`);
        assert.ok(sw.includes(`'${name}'`) || sw.includes(`'${name.replace(/^odznak-/, '')}'`), `${name} je v mezipaměti`);
    }
    const standIn = require('../album.js').BADGE_ART;
    assert.equal(standIn, 'odznak-sberatel');
    assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${standIn}.webp`)), `symbol alba ${standIn}.webp`);
    assert.ok(art.includes(standIn.replace(/^odznak-/, '')), 'symbol alba je v BADGE_ART (mezipaměť offline)');
    const swArt = listed(sw, /const BADGE_ART = \[([^\]]+)\]/);
    assert.match(sw, /\.\.\.BADGE_ART\.map\(id => `icons\/topics\/odznak-\$\{id\}\.webp`\)/);
    assert.deepEqual([...swArt].sort(), [...art].sort(), 'sw.js má stejný seznam');
    for (const name of [...art.map(id => `odznak-${id}`), 'truhla', 'truhla-otevrena', 'ochrana-serie', 'diplom']) {
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), `${name}.webp`);
        assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ikony', `${name}.png`)), `${name}.png`);
    }
    assert.match(sw, /'truhla', 'ochrana-serie', 'diplom', 'truhla-otevrena'/);
});
