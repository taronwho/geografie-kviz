// Testy rámečků, titulu u jména a obrázků hráče (look-frames.js, look.js, social.js). Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Look = require('../look.js');
const Frames = require('../look-frames.js');
const Social = require('../social.js');
const Core = require('../quiz-core.js');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('třída rámečku: jen známé rámečky, bez rámečku a neznámé hodnoty nic nepřidají', () => {
    assert.equal(Frames.frameClass('bronz'), ' frame frame-bronz');
    assert.equal(Frames.frameClass('diamant'), ' frame frame-diamant');
    for (const value of ['zadny', null, undefined, '', 'neexistuje', '"><script>', 42]) assert.equal(Frames.frameClass(value), '', String(value));
    for (const item of Look.FRAMES.filter(item => item.id !== 'zadny')) assert.match(Frames.frameClass(item.id), new RegExp(`frame-${item.id}$`));
});

test('možnosti titulu: úroveň, nic, získané odznaky; vybraný odznak je v nabídce vždy', () => {
    const badgeTitle = (id) => ({ vitez: 'Vítěz', mesic: 'Věrný měsíc' })[id];
    const options = Frames.titleOptions({ level: 12, levelTitle: 'Poutník', earnedIds: ['vitez'], current: 'mesic', badgeTitle });
    assert.deepEqual(options.map(option => option.value), ['level', 'none', 'vitez', 'mesic']);
    assert.match(options[0].label, /Úr\. 12 · Poutník/);
    assert.equal(options[2].label, 'Vítěz');
    assert.deepEqual(Frames.titleOptions({ level: 1, levelTitle: 'X', earnedIds: [], current: 'level', badgeTitle }).map(option => option.value), ['level', 'none']);
});

test('nápověda k rámečku: odemčený název, zamčený s podmínkou odemčení', () => {
    const ctx = { level: 10, badges: {} };
    const hint = (id) => Frames.frameHint(Look.find('frames', id), ctx, () => 'Vítěz');
    assert.equal(hint('bronz'), 'Bronzový');
    assert.equal(hint('stribro'), 'Stříbrný: Úroveň 15');
    assert.equal(hint('vavrin'), 'Vavřínový: Odznak: Vítěz');
    assert.equal(Frames.frameHint(Look.find('frames', 'vavrin'), { level: 1, badges: { vitez: '2026-11-01' } }, () => 'Vítěz'), 'Vavřínový');
});

test('titul u jména: výchozí úroveň, nic, jen získaný odznak', () => {
    const ctx = { level: 5, badges: { vitez: '2026-11-01' } };
    assert.equal(Look.normalize({ title: 'none' }, ctx).title, 'none');
    assert.equal(Look.normalize({ title: 'vitez' }, ctx).title, 'vitez');
    assert.equal(Look.normalize({ title: 'gladiator' }, ctx).title, 'level', 'neziskaný odznak se nepřijme');
    assert.equal(Look.normalize({}, ctx).title, 'level');
});

test('katalog: unikátní rámečky vázané na odznaky, žádný odemykatelný obrázek není zároveň základní', () => {
    assert.equal(new Set(Look.FRAMES.map(item => item.id)).size, Look.FRAMES.length);
    assert.equal(Look.FRAMES.find(item => item.id === 'vavrin').badge, 'vitez');
    assert.equal(Look.FRAMES.find(item => item.id === 'plamen').badge, 'mesic');
    for (const item of Look.AVATARS) assert.ok(!Social.AVATARS.includes(item.id), `${item.id} je zároveň základní`);
});

test('sociální modul: platné hodnoty rámečku a titulu z databáze', () => {
    assert.equal(Social.cleanFrame('bronz'), 'bronz');
    assert.equal(Social.cleanFrame('bronz', ['zlato']), null);
    for (const value of [null, '', 'Bronz', 'a b', '<b>', 5, 'x'.repeat(30)]) assert.equal(Social.cleanFrame(value), null, String(value));
    assert.equal(Social.cleanTitlePref('serie-30'), 'serie-30');
    assert.equal(Social.cleanTitlePref('none'), 'none');
    assert.equal(Social.cleanTitlePref('<x>'), null);
});

test('obrázky hráče: bez look.js jen základní, s ním i odemykatelné', () => {
    assert.equal(Social.allAvatars().length, Social.AVATARS.length);
    globalThis.MudrlantLook = Look;
    try {
        const all = Social.allAvatars();
        assert.equal(all.length, Social.AVATARS.length + Look.AVATARS.length);
        assert.ok(all.includes('drak') && all.includes('chamel') && !all.includes('🐉') && !all.includes('💯'));
    } finally { delete globalThis.MudrlantLook; }
});

// --- Obrázkové rámečky (docs/OBRAZKY.md č. 109–118): look.js ART_FRAMES, icons/frames/<id>.webp, .frame-art v src/input.css ---
const ART = Look.FRAMES.filter(item => item.art);

test('obrázkové rámečky: deset, pět za úroveň (35–95, každý na jiné úrovni než ostatní odměny), tři za těžké odznaky, dva z truhly', () => {
    assert.equal(ART.length, 10);
    assert.deepEqual(ART, Look.ART_FRAMES);
    assert.deepEqual(ART.map(item => item.id), ['ohen', 'more', 'soukoli', 'galaxie', 'kralovsky-vavrin', 'blesk', 'led', 'drak', 'duha-mracky', 'ruze']);
    for (const item of ART) assert.equal(Social.cleanFrame(item.id), item.id, 'id projde profiles_frame_format i Social.cleanFrame');
    const byLevel = ART.filter(item => item.level);
    const byBadge = ART.filter(item => item.badge);
    const fromChest = ART.filter(item => item.chest);
    assert.deepEqual([byLevel.length, byBadge.length, fromChest.length], [5, 3, 2]);
    assert.ok(ART.every(item => [item.level, item.badge, item.chest].filter(Boolean).length === 1), 'každý jen jedním způsobem');
    // Úrovně: vysoké, rostou, žádná jiná odměna (téma, talár, doplněk, postavička…) ani nová sova titulu na stejné úrovni
    const levels = byLevel.map(item => item.level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    assert.ok(levels.every(level => level >= 35 && level <= 95));
    const others = Object.values(Look.CATALOG).flat().filter(item => !item.art && !item.badge && item.level > 1).map(item => item.level);
    for (const level of levels) assert.ok(!others.includes(level), `úroveň ${level} už má jinou odměnu`);
    assert.ok(!levels.some(level => (Core.TITLE_OWL_FROM || []).includes(level)), 'ani novou sovu titulu');
    // Odznaky: existují v quiz-core i v databázi (badge_catalog), patří k nejvyšším stupňům skupiny a jinou věc nedávají
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    for (const item of byBadge) {
        assert.ok(Core.BADGE_BY_ID[item.badge], item.badge);
        assert.ok(schema.includes(`'${item.badge}'`), `${item.badge} v badge_catalog`);
        assert.deepEqual(Look.rewardsForBadge(item.badge).map(entry => entry.item.id), [item.id], `${item.badge} dává jen ${item.id}`);
        const group = Core.BADGE_GROUPS.find(entry => entry.badges.some(badge => badge.id === item.badge));
        assert.ok(group.badges.findIndex(badge => badge.id === item.badge) >= group.badges.length - 3, `${item.badge} je těžký stupeň`);
    }
    assert.match(Look.badgeRewardText('bleskovka-20'), /Bleskový prstenec \(rámeček\)/);
});

test('obrázkové rámečky: odemčení úrovní, odznakem a jen z truhly; text, jak je získat', () => {
    const find = (id) => Look.find('frames', id);
    assert.equal(Look.isUnlocked(find('ohen'), { level: 36, badges: {}, gifts: null }), false);
    assert.equal(Look.isUnlocked(find('ohen'), { level: 37, badges: {}, gifts: null }), true);
    assert.equal(Look.isUnlocked(find('blesk'), { level: 100, badges: {}, gifts: null }), false);
    assert.equal(Look.isUnlocked(find('blesk'), { level: 1, badges: { 'bleskovka-20': '2026-11-01' }, gifts: null }), true);
    assert.equal(Look.isUnlocked(find('ruze'), { level: 100, badges: { 'bleskovka-20': '2026-11-01' }, gifts: null }), false);
    assert.equal(Look.isUnlocked(find('ruze'), { level: 1, badges: {}, gifts: { frames: ['ruze'] } }), true);
    assert.equal(Look.unlockText(find('galaxie')), 'Úroveň 77');
    assert.equal(Look.unlockText(find('led'), 'Nesmrtelný'), 'Odznak: Nesmrtelný');
    assert.equal(Look.unlockText(find('duha-mracky')), 'Vzácný dárek z Truhly Mudrlanta');
    const ctx = { level: 40, badges: {}, gifts: null };
    assert.equal(Frames.frameHint(find('ohen'), ctx, () => ''), 'Ohnivý prstenec');
    assert.equal(Frames.frameHint(find('ruze'), ctx, () => ''), 'Růže a trny: Vzácný dárek z Truhly Mudrlanta');
    assert.equal(Frames.frameHint(find('drak'), ctx, (id) => Core.BADGE_BY_ID[id].title), 'Strážný drak: Odznak: Všude hvězdář');
    // Uložená volba projde jen odemčená
    assert.equal(Look.normalize({ frame: 'galaxie' }, { level: 76, badges: {}, gifts: null }).frame, 'zadny');
    assert.equal(Look.normalize({ frame: 'galaxie' }, { level: 77, badges: {}, gifts: null }).frame, 'galaxie');
    assert.ok(Look.newRewards(36, 37).some(entry => entry.item.id === 'ohen'), 'oslava na úrovni 37');
    assert.ok(Look.newRewards(1, 1, ['preziti-50']).some(entry => entry.item.id === 'led'), 'oslava za odznak');
});

test('obrázkové rámečky: třída frame-art, obrázky, CSS a service worker', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
    const built = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'branding', 'ramecky', 'rozmery.json'), 'utf8'));
    // Přesah prstenu v CSS odpovídá velikosti obrázku hráče na plátně (scripts/frame-images.py BOX)
    const inset = -((1 / table.box) - 1) / 2 * 100;
    assert.match(css, new RegExp(`\\.frame-art::after \\{[^}]*inset: ${inset}%`));
    assert.match(css, /\.frame-art::before \{ content: none; \}/, 'kroužek z přechodu se u obrázkového rámečku nekreslí');
    const listed = /const FRAME_ART = \[([^\]]+)\]/.exec(sw)[1].match(/'([a-z0-9-]+)'/g).map(entry => entry.slice(1, -1));
    assert.deepEqual(listed, ART.map(item => item.id), 'sw.js FRAME_ART = look.js ART_FRAMES');
    assert.match(sw, /\.\.\.FRAME_ART\.map\(id => `icons\/frames\/\$\{id\}\.webp`\)/);
    for (const item of ART) {
        assert.equal(Frames.frameClass(item.id), ` frame frame-art frame-${item.id}`);
        assert.match(css, new RegExp(`\\.frame-${item.id}::after \\{ background-image: url\\(icons/frames/${item.id}\\.webp\\); \\}`));
        assert.ok(built.includes(`.frame-${item.id}:after{background-image:url(icons/frames/${item.id}.webp)}`), `styles.css s .frame-${item.id} (npm run build:css)`);
        assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ramecky', `${item.id}.jpg`)), `zdroj branding/ramecky/${item.id}.jpg`);
        // WebP s průhledností (VP8X s příznakem alfa), čtverec table.size × table.size, malý soubor
        const file = fs.readFileSync(path.join(ROOT, 'icons', 'frames', `${item.id}.webp`));
        assert.equal(file.toString('ascii', 0, 4), 'RIFF');
        assert.equal(file.toString('ascii', 8, 16), 'WEBPVP8X');
        assert.ok(file[20] & 0x10, `${item.id}: průhlednost`);
        assert.deepEqual([file.readUIntLE(24, 3) + 1, file.readUIntLE(27, 3) + 1], [table.size, table.size]);
        assert.ok(file.length < 40000, `${item.id}: ${file.length} B`);
        // Rozměry z výřezu: díra je o něco menší než obrázek hráče (okraj se schová pod obrys), prsten i ozdoby se vejdou na plátno
        const size = table.frames[item.id];
        assert.ok(size, `${item.id} v rozmery.json`);
        assert.ok(size.hole > 0.9 && size.hole <= 1, `${item.id}: díra ${size.hole}`);
        assert.ok(size.ring > 1.3 && size.ring < 1.8, `${item.id}: prsten ${size.ring}`);
        assert.ok(size.reach <= 1 / table.box, `${item.id}: ozdoby ${size.reach} se vejdou na plátno`);
    }
});
