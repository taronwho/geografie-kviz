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
// Odměny (pět za úroveň, tři za odznak, dva z truhly) jsou v ART_FRAMES; obrázkový je i Věčný oheň za sérii 365 dní (č. 146) a oba
// rámečky každého měsíce Sezóny Mudrlanta (č. 163–174: sezona-MM ze Sezónní truhly, sezona-MM-b z Truhly v půli sezóny)
const ART = Look.ART_FRAMES;
const ALL_ART = Look.FRAMES.filter(item => item.art);
const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const SEASON_ART = MONTHS.flatMap(month => [`sezona-${month}`, `sezona-${month}-b`]);

test('obrázkové rámečky: deset, pět za úroveň (35–95, každý na jiné úrovni než ostatní odměny), tři za těžké odznaky, dva z truhly', () => {
    assert.equal(ART.length, 10);
    assert.deepEqual(ALL_ART.map(item => item.id), ['vecny-ohen', ...SEASON_ART, ...ART.map(item => item.id)], 'obrázkové jsou odměny, Věčný oheň a rámečky sezóny');
    assert.equal(Look.find('frames', 'vecny-ohen').badge, 'serie-365');
    assert.deepEqual(ART.map(item => item.id), ['ohen', 'more', 'soukoli', 'galaxie', 'kralovsky-vavrin', 'blesk', 'led', 'drak', 'duha-mracky', 'ruze']);
    for (const item of ART) assert.equal(Social.cleanFrame(item.id), item.id, 'id projde profiles_frame_format i Social.cleanFrame');
    const byLevel = ART.filter(item => item.level);
    const byBadge = ART.filter(item => item.badge);
    const fromChest = ART.filter(item => item.rare);
    assert.deepEqual([byLevel.length, byBadge.length, fromChest.length], [5, 3, 2]);
    assert.ok(ART.every(item => [item.level, item.badge, item.rare].filter(Boolean).length === 1), 'každý jen jedním způsobem');
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

test('rámečky sezóny: dva obrázkové na každý měsíc, jen ze Sezóny (zdobnější na 20. stupni, druhý na 10.), v řadě jen ty, které hráč má', () => {
    const season = Look.FRAMES.filter(item => item.source === 'season');
    assert.deepEqual(season.map(item => item.id), SEASON_ART, 'po měsících: sezona-MM, sezona-MM-b');
    assert.deepEqual(Look.SEASON_FRAMES.map(item => item.id), MONTHS.map(month => `sezona-${month}`));
    assert.deepEqual(Look.SEASON_MID_FRAMES.map(item => item.id), MONTHS.map(month => `sezona-${month}-b`));
    const everyBadge = Object.fromEntries(Core.BADGES.map(badge => [badge.id, '2026-11-01']));
    for (const item of season) {
        const month = Number(item.id.slice(7, 9));
        assert.deepEqual([item.art, item.exclusive, item.month, item.seasonTier], [true, true, month, item.id.endsWith('-b') ? 10 : 20], item.id);
        assert.equal(Social.cleanFrame(item.id), item.id, 'id projde profiles_frame_format i Social.cleanFrame (bez změny schématu)');
        assert.equal(Look.isUnlocked(item, { level: 100, badges: everyBadge, gifts: null }), false, 'úrovní ani odznakem ne');
        assert.equal(Look.isUnlocked(item, { level: 1, badges: {}, gifts: { frames: [item.id] } }), true, 'jako dárek ze sezóny');
        assert.equal(Frames.frameClass(item.id), ` frame frame-art frame-${item.id}`);
    }
    // Jména: zdobnější = přídavné jméno měsíce (jako dřív), druhý vlastní jméno s měsícem; všechna různá
    assert.deepEqual(Look.SEASON_FRAMES.map(item => item.title), Look.SEASON_ADJECTIVES);
    assert.equal(new Set(season.map(item => item.title)).size, 24);
    assert.equal(Look.find('frames', 'sezona-11-b').title, 'Listopadové lampiony');
    assert.equal(Look.seasonMidFrame(11), Look.find('frames', 'sezona-11-b'));
    assert.equal(Look.seasonMidFrame(1).id, 'sezona-01-b');
    // Kde se získají
    assert.equal(Look.unlockText(Look.find('frames', 'sezona-11')), 'Sezóna Mudrlanta (listopad, Sezónní truhla na 20. stupni)');
    assert.equal(Look.unlockText(Look.find('frames', 'sezona-11-b')), 'Sezóna Mudrlanta (listopad, Truhla v půli sezóny na 10. stupni)');
    assert.equal(Frames.frameHint(Look.find('frames', 'sezona-03-b'), { level: 50, badges: {}, gifts: null }, () => ''), 'Březnové sněženky: Sezóna Mudrlanta (březen, Truhla v půli sezóny na 10. stupni)');
    // Sezónní truhla dá zdobnější rámeček, druhý do ní nepatří
    for (const month of MONTHS) {
        assert.deepEqual(Look.seasonBundle(Number(month)).filter(entry => entry.category === 'frames').map(entry => entry.item.id), [`sezona-${month}`]);
    }
    // Řada rámečků v Profilu: sezónní jen vlastněné (a vybraný), krátký popisek pro čtečku
    const render = (gifts, frame = 'zadny') => Look.getSections().find(section => section.id === 'frames').render({ level: 50, badges: {}, gifts, prefs: { frame }, profile: { avatar: '🦉', color: 'emerald' }, avatarHtml: () => '' });
    const ids = (html) => [...html.matchAll(/data-frame="([^"]+)"/g)].map(match => match[1]);
    assert.ok(!ids(render({})).some(id => id.startsWith('sezona-')));
    assert.deepEqual(ids(render({ frames: ['sezona-11-b', 'sezona-02'] })).filter(id => id.startsWith('sezona-')), ['sezona-02', 'sezona-11-b']);
    assert.match(render({ frames: ['sezona-11-b'] }, 'sezona-11-b'), /aria-label="Listopadové lampiony"[^>]*>[\s\S]*?<span class="sr-only">Lampiony<\/span>/);
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
    assert.deepEqual(listed, ALL_ART.map(item => item.id), 'sw.js FRAME_ART = obrázkové rámečky v look.js');
    assert.match(sw, /\.\.\.FRAME_ART\.map\(id => `icons\/frames\/\$\{id\}\.webp`\)/);
    for (const item of ALL_ART) {
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
