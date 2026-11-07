// Sovy titulů: deset ilustrací ke stupňům titulů (quiz-core TITLE_OWL_FROM), jejich soubory a barvy obleku, odemykání podle úrovně
// a sova titulu jako obrázek profilu (zápis pose=titul-N v textu profiles.owl, look-owl.js a social.js). Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const Core = require('../quiz-core.js');
const Look = require('../look.js');
const Owl = require('../look-owl.js');
const Social = require('../social.js');

const ROOT = path.join(__dirname, '..');
const POSE_IDS = Array.from({ length: 10 }, (_, index) => `titul-${index + 1}`);

test('sovy titulů: deset stupňů začíná vždy titulem a odpovídá zadání (1–6, 7–11, 12–17, … 84–100)', () => {
    const starts = Core.LEVEL_TITLES.map(entry => entry.from);
    assert.deepEqual(Core.TITLE_OWL_FROM, [1, 7, 12, 18, 27, 36, 45, 56, 68, 84]);
    for (const from of Core.TITLE_OWL_FROM) assert.ok(starts.includes(from), `stupeň od ${from} začíná titulem`);
    const tiers = Object.fromEntries(Core.LEVEL_TITLES.map(entry => [entry.title, Core.titleOwlTier(entry.from)]));
    assert.deepEqual(tiers, {
        Zvědavec: 1, Čtenář: 1, Posluchač: 1, Učeň: 2, Žák: 2, Student: 3, Zasvěcenec: 3, Znalec: 4, Badatel: 4, Zkoumatel: 4,
        Učenec: 5, Vzdělanec: 5, Erudit: 5, Odborník: 6, Specialista: 6, Expert: 6, Mistr: 7, Magistr: 7, Doktor: 7,
        Docent: 8, Profesor: 8, Akademik: 8, Mudrc: 9, Vševěd: 9, Velemistr: 9, Polyhistor: 9,
        Legenda: 10, 'Strážce vědění': 10, Orákulum: 10, Archimudrc: 10, Mudrlant: 10
    });
    assert.deepEqual([0, 1, 6, 7, 11, 12, 17, 18, 26, 27, 35, 36, 44, 45, 55, 56, 67, 68, 83, 84, 100].map(Core.titleOwlTier),
        [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]);
    // Každá úroveň má stupeň stejný jako její titul
    for (let level = 1; level <= Core.MAX_LEVEL; level++) assert.equal(Core.titleOwlTier(level), tiers[Core.titleForLevel(level)], `úroveň ${level}`);
    assert.deepEqual(Look.POSES.map(pose => [pose.id, pose.level]), POSE_IDS.map((id, index) => [id, Core.TITLE_OWL_FROM[index]]));
});

// Rozměry obrázku webp z hlavičky (VP8X, VP8L i VP8)
const webpSize = (file) => {
    const b = fs.readFileSync(file);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF', file);
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
};

test('sovy titulů: zdroj v branding/ikony, výřez 320 × 320 a všechny barvy obleku; v mezipaměti service workeru', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    for (const id of POSE_IDS) {
        assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ikony', `sova-${id}.png`)), `branding/ikony/sova-${id}.png`);
        const base = path.join(ROOT, 'icons', 'topics', `sova-${id}.webp`);
        assert.ok(fs.existsSync(base), base);
        assert.deepEqual(webpSize(base), [320, 320], `sova-${id}.webp`);
        for (const robe of Look.ROBES.filter(entry => entry.id !== 'vinova')) {
            const file = path.join(ROOT, 'icons', 'topics', `sova-${id}-${robe.id}.webp`);
            assert.ok(fs.existsSync(file), `sova-${id}-${robe.id}.webp`);
            assert.deepEqual(webpSize(file), [320, 320], `sova-${id}-${robe.id}.webp`);
        }
        assert.ok(sw.includes(`'sova-${id}'`), `sova-${id} v APP_SHELL`);
        assert.equal(Owl.poseSrc(id), `icons/topics/sova-${id}.webp`);
        assert.equal(Owl.poseSrc(id, 'zlata'), `icons/topics/sova-${id}-zlata.webp`);
        assert.ok(Owl.POSE_CROP[id], `výřez do kolečka pro ${id}`);
    }
    assert.equal(Owl.poseSrc('titul-11'), null);
    assert.equal(Owl.poseSrc('titul-3', 'neexistuje'), 'icons/topics/sova-titul-3.webp', 'neznámý oblek = vínový');
});

test('sovy titulů: barvy obleku přebarví talár a čepici, ale ne růžový jazyk, zobák, modrý plášť, knihy ani zlaté předměty', () => {
    // Kontrola přímo na obrázcích: v každé ilustraci titulu je nejvíc změněných pixelů vínových (talár, čepice), světlé růžové
    // (jazyk) a modré, zelené, žluté nebo hnědé plochy se nezmění. Potřebuje Python s Pillow a numpy, jinak se přeskočí.
    let report;
    try {
        report = JSON.parse(execFileSync('python3', ['-I', '-c', `
import json, sys
import numpy as np
from PIL import Image
out = {}
for name in sys.argv[1:]:
    a = np.asarray(Image.open(f'icons/topics/sova-{name}.webp').convert('RGBA')).astype(np.float32)
    b = np.asarray(Image.open(f'icons/topics/sova-{name}-zelena.webp').convert('RGBA')).astype(np.float32)
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    opaque = a[..., 3] > 200
    changed = (np.abs(a[..., :3] - b[..., :3]).max(-1) > 40) & opaque
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - bl) / d) % 6, np.where(mx == g, (bl - r) / d + 2, (r - g) / d + 4)) * 60
    hue = np.where(hue > 180, hue - 360, hue)
    pinkish = opaque & (mx > 0.8) & (hue > -4) & (hue < 12) & (sat > 0.35) & (sat < 0.72)
    other = opaque & ((bl > r + 0.08) | (g > r + 0.02))
    out[name] = {'changed': int(changed.sum()), 'pink': int(pinkish.sum()), 'pinkChanged': int((pinkish & (b[..., 1] > b[..., 0])).sum()), 'otherChanged': int((changed & other).sum()), 'other': int(other.sum())}
print(json.dumps(out))
`, ...POSE_IDS], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch (error) { return; }
    for (const [name, counts] of Object.entries(report)) {
        assert.ok(counts.changed > 3000, `${name}: talár je přebarvený (${counts.changed} px)`);
        // Světle červená až růžová (jazyk, tváře) nezezelená; ztlumení barvy na okraji drobného jazyka od ztrátové komprese WebP nevadí
        // (před úpravou masky v owl-robes.py zezelenal skoro celý jazyk)
        assert.ok(counts.pinkChanged <= Math.max(3, counts.pink * 0.15), `${name}: růžový jazyk / zobák zůstal (zezelenalo ${counts.pinkChanged} z ${counts.pink} px)`);
        assert.ok(counts.otherChanged <= counts.other * 0.01, `${name}: modré, zelené a žluté plochy zůstaly (${counts.otherChanged} z ${counts.other} px)`);
    }
});

test('sova titulu jako profilovka: encodeOwl / parseOwl zapíšou a přečtou pózu (jen titul-1 … titul-10)', () => {
    const prefs = { robe: 'zelena', acc: { face: { id: 'bryle', color: 'original' } }, pose: 'titul-5' };
    const text = Owl.encodeOwl(prefs);
    assert.equal(text, 'robe=zelena;pose=titul-5;face=bryle.original', 'póza hned za oblekem, doplňky zůstanou pro starší aplikaci');
    assert.match(text, /^[a-z0-9=.;-]{1,200}$/);
    assert.deepEqual(Owl.parseOwl(text), prefs);
    assert.equal(Owl.encodeOwl(Owl.parseOwl(text)), text);
    // Bez pózy se nic nemění (žádný klíč pose ani v textu, ani v objektu)
    assert.deepEqual(Owl.parseOwl('robe=zelena'), { robe: 'zelena', acc: {} });
    assert.equal(Owl.encodeOwl({ robe: 'modra', acc: {}, pose: null }), 'robe=modra');
    // Všech deset póz projde, cokoli jiného se zahodí
    for (const id of POSE_IDS) assert.equal(Owl.parseOwl(`robe=vinova;pose=${id}`).pose, id);
    for (const bad of ['titul-0', 'titul-11', 'titul-', 'titul-01', 'vitez', 'spi', 'titul-5x', '']) {
        assert.deepEqual(Owl.parseOwl(`robe=modra;pose=${bad}`), { robe: 'modra', acc: {} }, bad);
        assert.equal(Owl.encodeOwl({ robe: 'modra', acc: {}, pose: bad }), 'robe=modra', bad);
    }
    assert.equal(Owl.parseOwl('pose=titul-2;pose=titul-9').pose, 'titul-2', 'platí první póza');
    assert.deepEqual(Owl.parseOwl('pose=titul-3'), { robe: 'vinova', acc: {}, pose: 'titul-3' }, 'samotná póza je platná sova');
    assert.equal(Owl.parseOwl('pose=titul-12'), null);
    // Nejdelší možný zápis (póza, čtyři doplňky s vlastní barvou a vlajkou) se vejde do 200 znaků bez useknutí pózy
    const long = Owl.encodeOwl({ robe: 'fialova', pose: 'titul-10', acc: { head: { id: 'sluchatka', color: 'h355' }, face: { id: 'slunecni-bryle', color: 'h355' }, neck: { id: 'medaile', color: 'h355' }, hand: { id: 'vlajka', color: 'h355', flag: 'q213' } } });
    assert.ok(long.length <= Owl.OWL_MAX && Owl.parseOwl(long).pose === 'titul-10', long);
});

test('sova titulu jako profilovka: Social.cleanOwl pózu zná a ověří', () => {
    assert.equal(Social.cleanOwl('robe=zelena;pose=titul-5'), 'robe=zelena;pose=titul-5');
    assert.equal(Social.cleanOwl('robe=zelena;pose=titul-10;face=bryle.original'), 'robe=zelena;pose=titul-10;face=bryle.original');
    assert.equal(Social.cleanOwl('robe=zelena;pose=titul-11;face=bryle.original'), 'robe=zelena;face=bryle.original', 'neplatná póza se vynechá, zbytek zůstane');
    assert.equal(Social.cleanOwl('robe=zelena;pose=vitez'), 'robe=zelena');
    assert.equal(Social.cleanOwl('pose=titul-0'), null);
    assert.equal(Social.cleanOwl('pose=titul-1'), 'pose=titul-1');
    for (const bad of [null, '', 'pose=Titul-1', 'pose=titul 1', 'x'.repeat(201)]) assert.equal(Social.cleanOwl(bad), null, String(bad));
});

test('sova titulu jako profilovka: starší aplikace (dnešní parseOwl bez znalosti pózy) klíč přeskočí a nespadne', () => {
    // Stejný kód jako v nasazené verzi před pózami: neznámý klíč se ignoruje, ukáže se sova s doplňky v barvě obleku
    let source;
    try { source = execFileSync('git', ['show', '95f6010:look-owl.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (error) { return; }
    const sandbox = { self: { MudrlantLook: Look, MudrlantCore: Core, MudrlantFlags: require('../look-flags.js') } };
    vm.runInNewContext(source, sandbox);
    const Old = sandbox.self.MudrlantOwl;
    const text = Owl.encodeOwl({ robe: 'zelena', pose: 'titul-7', acc: { face: { id: 'bryle', color: 'original' } } });
    assert.deepEqual(JSON.parse(JSON.stringify(Old.parseOwl(text))), { robe: 'zelena', acc: { face: { id: 'bryle', color: 'original' } } });
    assert.match(Old.owlAvatarHtml(text), /src="icons\/logo-zelena\.webp"/);
    assert.ok(!Old.owlAvatarHtml(text).includes('titul'));
});

test('sova titulu jako profilovka: owlAvatarHtml vykreslí ilustraci titulu v barvě obleku, oříznutou do kolečka, bez doplňků', () => {
    const html = Owl.owlAvatarHtml('robe=zelena;pose=titul-5;face=bryle.original');
    assert.match(html, /^<span class="relative block h-full w-full overflow-hidden rounded-full"><img data-keep data-owl-pose="titul-5" src="icons\/topics\/sova-titul-5-zelena\.webp" alt="" class="absolute max-w-none select-none [^"]+"><\/span>$/);
    assert.ok(!html.includes('doplnky'), 'bez vrstev doplňků');
    assert.ok(html.includes(Owl.POSE_CROP['titul-5']));
    assert.match(Owl.owlAvatarHtml('robe=vinova;pose=titul-10'), /src="icons\/topics\/sova-titul-10\.webp"/);
    // Neplatná póza = obyčejná sova s doplňky
    assert.match(Owl.owlAvatarHtml('robe=zelena;pose=titul-99;face=bryle.original'), /src="icons\/logo-zelena\.webp".*icons\/doplnky\/bryle\.webp/);
    // Výřezy jsou celé třídy Tailwindu (styles.css je musí obsahovat, CSP nepustí inline styl)
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    for (const cls of Object.values(Owl.POSE_CROP).join(' ').split(' ')) {
        const selector = `.${cls.replace(/[[\]%.]/g, ch => `\\${ch}`)}`;
        assert.ok(css.includes(selector), `${cls} chybí ve styles.css (npm run build:css)`);
    }
});

test('sova titulu: odemyká se úrovní; po ztrátě úrovně se ukáže nejvyšší dosažená, bez úrovně běžná sova', () => {
    assert.deepEqual(POSE_IDS.map(id => Owl.allowedPose(id, 100)), POSE_IDS, 'na nejvyšší úrovni jsou všechny');
    assert.equal(Owl.allowedPose('titul-2', 7), 'titul-2');
    assert.equal(Owl.allowedPose('titul-2', 6), 'titul-1', 'úroveň 6 ještě nemá Učně');
    assert.equal(Owl.allowedPose('titul-10', 84), 'titul-10');
    assert.equal(Owl.allowedPose('titul-10', 83), 'titul-9');
    assert.equal(Owl.allowedPose('titul-9', 30), 'titul-5', 'vývojářský reset na úroveň 30');
    assert.equal(Owl.allowedPose('titul-9', 1), 'titul-1');
    assert.equal(Owl.allowedPose('titul-3', 0), null, 'bez úrovně běžná sova');
    assert.equal(Owl.allowedPose('titul-3', NaN), null);
    assert.equal(Owl.allowedPose(null, 50), null, 'bez pózy běžná sova');
    assert.equal(Owl.allowedPose('vitez', 50), null);
    // Volba ve Vzhledu (Look.prefs): platná póza se uloží, jak ji hráč zvolil (omezí se až při vykreslení), neplatná se zahodí
    assert.equal(Look.normalize({ pose: 'titul-8' }, { level: 3, badges: {} }).pose, 'titul-8');
    assert.equal(Look.normalize({ pose: 'titul-11' }, { level: 100, badges: {} }).pose, null);
    assert.equal(Look.normalize({}, null).pose, null);
    assert.equal(Look.DEFAULTS.pose, null);
});
