const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Look = require('../look.js');
const Owl = require('../look-owl.js');

test('doplňky sovy: katalog má 53 doplňků ve čtyřech místech a každý má obrázky ve všech barvách (kromě doplňků s pevnými barvami)', () => {
    assert.equal(Look.ACCESSORIES.length, 53);
    assert.equal(new Set(Look.ACCESSORIES.map(item => item.id)).size, 53, 'id jsou jedinečná');
    assert.deepEqual(Look.SLOTS.map(slot => slot.id), ['head', 'face', 'neck', 'hand']);
    for (const item of Look.ACCESSORIES) {
        assert.ok(Look.SLOTS.some(slot => slot.id === item.slot), item.id);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}.webp`)), `${item.id} vrstva`);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-ikona.webp`)), `${item.id} ikona`);
        if (item.fixed) assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-zaklad.webp`)), `${item.id} pevná část`);
        for (const color of Look.ACC_COLORS.filter(entry => entry.id !== 'original' && entry.id !== 'vlastni')) {
            // Pevné barvy (noColors): barevné varianty nejsou (a aplikace je nikdy nechce)
            assert.equal(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-${color.id}.webp`)), !item.noColors, `${item.id}-${color.id}`);
        }
    }
});

// Rozměry obrázku webp z hlavičky (VP8X, VP8L i VP8); bez závislostí
const webpSize = (file) => {
    const b = fs.readFileSync(file);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF', file);
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
};

test('doplňky sovy: barevné varianty mají stejný rám jako vrstva a skutečně se od ní liší (volba barvy je znatelná)', () => {
    const dir = path.join(__dirname, '..', 'icons', 'doplnky');
    for (const item of Look.ACCESSORIES) {
        const original = path.join(dir, `${item.id}.webp`);
        const [width, height] = webpSize(original);
        assert.equal(width, 402, `${item.id} šířka rámu`);
        if (item.noColors) continue;
        for (const color of Look.ACC_COLORS.filter(entry => entry.id !== 'original' && entry.id !== 'vlastni')) {
            const file = path.join(dir, `${item.id}-${color.id}.webp`);
            assert.deepEqual(webpSize(file), [width, height], `${item.id}-${color.id} rám`);
            assert.ok(!fs.readFileSync(file).equals(fs.readFileSync(original)), `${item.id}-${color.id} se od původní vrstvy neliší`);
        }
    }
});

test('doplňky sovy: výchozí čepici skrývá jen doplněk, který ji nahrazuje (helma, přilba, baret, klobouky); koruna, svatozář a síťka sedí na čepici nebo vedle ní', () => {
    const hiding = Look.ACCESSORIES.filter(item => item.hidesHat).map(item => item.id).sort();
    assert.deepEqual(hiding, ['baret', 'cepice-zimni', 'cylindr', 'helma', 'kouzelnicky-klobouk', 'piratsky-klobouk', 'prilba', 'slamak', 'vrtulka']);
    // Jarní věneček a dýně sedí na čepici (čepice je pod nimi vidět v barvě obleku), deštník je nad ní
    for (const id of ['koruna', 'sitka', 'kvetina', 'vavrin', 'sluchatka', 'celenka', 'svatozar', 'jarni-venecek', 'dyne', 'destnik']) assert.ok(!Look.find('accessories', id).hidesHat, id);
    assert.ok(Look.ACCESSORIES.filter(item => item.hidesHat).every(item => item.slot === 'head'));
    assert.match(Owl.logoHtml('', '', { head: { id: 'helma', color: 'cerna' } }), /data-owl class="[^"]*owl-nohat/);
    assert.doesNotMatch(Owl.logoHtml('', '', { head: { id: 'koruna', color: 'cerna' } }), /owl-nohat/);
    // síťka v ruce nic nemění: čepici skrývá dál baret na hlavě
    assert.match(Owl.logoHtml('', '', { head: { id: 'baret', color: 'cerna' }, hand: { id: 'sitka', color: 'modra' } }), /owl-nohat/);
    assert.doesNotMatch(Owl.logoHtml('', '', { hand: { id: 'sitka', color: 'modra' } }), /owl-nohat/);
});

test('doplňky sovy: ruku se vztyčeným prstem skryje jen doplněk v ruce, který ji kreslí jinak (hrnek, hůlka, meč, pochodeň, sezónní)', () => {
    const hiding = Look.ACCESSORIES.filter(item => item.hidesHand).map(item => item.id).sort();
    assert.deepEqual(hiding, ['destnik', 'hrnek', 'hulka', 'konvalinky', 'lampion', 'mec', 'pochoden', 'tuzka', 'zmrzlina']);
    assert.ok(Look.ACCESSORIES.filter(item => item.hidesHand).every(item => item.slot === 'hand'));
    assert.match(Owl.logoHtml('', '', { hand: { id: 'hrnek', color: 'original' } }), /data-owl class="[^"]*owl-nohand/);
    assert.doesNotMatch(Owl.logoHtml('', '', { hand: { id: 'lupa', color: 'original' } }), /owl-nohand/);
    // Čepice i ruka najednou: obě třídy (src/input.css má pro ně společnou masku), u cizí sovy stejně
    assert.match(Owl.logoHtml('', '', { head: { id: 'cylindr', color: 'original' }, hand: { id: 'mec', color: 'original' } }), /owl-nohat owl-nohand/);
    assert.match(Owl.owlAvatarHtml('robe=modra;hand=pochoden.original'), /owl-nohand/);
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    for (const mask of ['logo-maska.webp', 'logo-maska-ruka.webp', 'logo-maska-oba.webp']) {
        assert.ok(css.includes(`icons/${mask}`), `styles.css používá ${mask}`);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', mask)), mask);
    }
});

test('monokl: výchozí sova ho nosí, „Bez monoklu“ a doplněk v obličeji ho sundají, knír a páska ho nechají', () => {
    assert.equal(Look.NO_MONOCLE, 'bez-monoklu');
    assert.equal(Look.monocleShown({}), true, 'bez doplňku v obličeji (i staré uložené volby) je monokl');
    assert.equal(Look.monocleShown(null), true);
    assert.equal(Look.monocleShown({ head: { id: 'koruna', color: 'original' }, hand: { id: 'lupa', color: 'original' } }), true, 'doplňky jinde monokl nechají');
    assert.equal(Look.monocleShown({ face: { id: 'bez-monoklu' } }), false);
    for (const id of ['bryle', 'slunecni-bryle', 'lab-bryle', '3d-bryle', 'letecke-bryle', 'srdickove-bryle', 'maska', 'karneval', 'snorchl']) assert.equal(Look.monocleShown({ face: { id, color: 'original' } }), false, id);
    for (const id of ['knir', 'paska']) assert.equal(Look.monocleShown({ face: { id, color: 'modra' } }), true, id);
    assert.deepEqual(Look.ACCESSORIES.filter(item => item.keepsMonocle).map(item => item.id).sort(), ['knir', 'paska']);
    assert.equal(Look.monocleShown({ face: { id: 'neexistuje' } }), true, 'neznámý doplněk se nevykreslí, monokl zůstane');
    // Logo: s monoklem icons/logo.webp, bez něj icons/logo-bez-monoklu.webp (a jeho barvy obleku)
    assert.match(Owl.logoHtml('', '', {}), /<img src="icons\/logo\.webp"/);
    assert.match(Owl.logoHtml('', '', { face: { id: 'bez-monoklu' } }), /<img src="icons\/logo-bez-monoklu\.webp"/);
    assert.match(Owl.logoHtml('', '', { face: { id: 'maska', color: 'modra' } }), /<img src="icons\/logo-bez-monoklu\.webp".*doplnky\/maska-modra\.webp/);
    assert.match(Owl.logoHtml('', '', { face: { id: 'knir', color: 'original' } }), /<img src="icons\/logo\.webp".*doplnky\/knir\.webp/);
    assert.equal(Owl.layersHtml({ face: { id: 'bez-monoklu' } }), '', '„Bez monoklu“ nemá vrstvu');
    const dir = path.join(__dirname, '..', 'icons');
    for (const robe of Look.ROBES) assert.ok(fs.existsSync(path.join(dir, `logo-bez-monoklu${robe.id === 'vinova' ? '' : `-${robe.id}`}.webp`)), `logo bez monoklu: ${robe.id}`);
    assert.ok(fs.existsSync(path.join(dir, 'doplnky', 'monokl-ikona.webp')), 'ikona volby Monokl');
    // Cizí sova: zápis a vykreslení
    assert.equal(Owl.encodeOwl({ robe: 'modra', acc: { face: { id: 'bez-monoklu' } } }), 'robe=modra;face=bez-monoklu');
    assert.deepEqual(Owl.parseOwl('robe=modra;face=bez-monoklu'), { robe: 'modra', acc: { face: { id: 'bez-monoklu' } } });
    assert.deepEqual(Owl.parseOwl('robe=modra;head=bez-monoklu'), { robe: 'modra', acc: {} }, 'jen v obličeji');
    assert.match(Owl.owlAvatarHtml('robe=modra;face=bez-monoklu'), /src="icons\/logo-bez-monoklu-modra\.webp"/);
    assert.match(Owl.owlAvatarHtml('robe=modra;face=paska.original'), /src="icons\/logo-modra\.webp".*doplnky\/paska\.webp/);
    // Uložená volba: „Bez monoklu“ je vždy k dispozici (bez barvy), jinde se zahodí
    assert.deepEqual(Look.normalize({ acc: { face: { id: 'bez-monoklu', color: 'modra' } } }, { level: 1, badges: {} }).acc, { face: { id: 'bez-monoklu' } });
    assert.deepEqual(Look.normalize({ acc: { neck: { id: 'bez-monoklu' } } }, { level: 1, badges: {} }).acc, {});
    assert.deepEqual(Look.normalize({ acc: {} }, { level: 1, badges: {} }).acc, {}, 'starší volby bez obličeje = monokl');
});

test('výběr doplňků: v obličeji jsou volby Monokl a Bez monoklu, klepnutí je uloží', () => {
    const store = {};
    global.localStorage = { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } };
    try {
        const section = Look.getSections().find(entry => entry.id === 'owl');
        const ctx = () => ({ level: 100, badges: { 'zbehly-fyzika': 'x' }, prefs: Look.prefs({ level: 100, badges: { 'zbehly-fyzika': 'x' } }) });
        const press = (selector) => section.click({ target: { closest: (query) => (query === selector.split('|')[0] ? { dataset: JSON.parse(selector.split('|')[1]) } : null) } }, ctx());
        assert.ok(press('[data-owl-slot]|{"owlSlot":"face"}'));
        let html = section.render(ctx());
        assert.match(html, /data-owl-pick="face:none" aria-pressed="true" title="Monokl"/);
        assert.match(html, /data-owl-pick="face:bez-monoklu" aria-pressed="false" title="Bez monoklu"/);
        assert.match(html, /aria-label="Obličej: monokl"/);
        assert.ok(press('[data-owl-pick]|{"owlPick":"face:bez-monoklu"}'));
        assert.deepEqual(Look.prefs(ctx()).acc, { face: { id: 'bez-monoklu' } });
        html = section.render(ctx());
        assert.match(html, /data-owl-pick="face:bez-monoklu" aria-pressed="true"/);
        assert.match(html, /aria-label="Obličej: bez monoklu"/);
        assert.doesNotMatch(html, /data-owl-color=/, '„Bez monoklu“ nemá barvu');
        assert.ok(press('[data-owl-pick]|{"owlPick":"face:knir"}'));
        assert.deepEqual(Look.prefs(ctx()).acc, { face: { id: 'knir', color: 'original' } }, 'doplněk volbu nahradí');
        assert.ok(press('[data-owl-pick]|{"owlPick":"face:none"}'));
        assert.deepEqual(Look.prefs(ctx()).acc, {}, 'Monokl = nic uloženo');
        Look.setPref('acc', {}, ctx());
    } finally { delete global.localStorage; }
});

test('nové doplňky (obrázky č. 92–108): odemykání úrovní, odznakem, ligovou sezónou a jen z Truhly Mudrlanta', () => {
    const Core = require('../quiz-core.js');
    const of = (id) => Look.find('accessories', id);
    const levels = { cylindr: 62, 'letecke-bryle': 68, stetoskop: 72, 'kouzelnicky-klobouk': 76, 'zlaty-retez': 84, hulka: 88, svatozar: 99 };
    for (const [id, level] of Object.entries(levels)) {
        assert.equal(of(id).level, level, id);
        assert.equal(Look.isUnlocked(of(id), { level: level - 1, badges: {} }), false, `${id} před úrovní`);
        assert.equal(Look.isUnlocked(of(id), { level, badges: {} }), true, `${id} na úrovni`);
        assert.ok(Look.newRewards(level - 1, level, []).some(entry => entry.item.id === id), `${id} se oslaví`);
    }
    const badges = { 'piratsky-klobouk': 'vyhry-25', maska: 'turnaj-zlato', mec: 'turnaj-postupy-15', plast: 'serie-100' };
    for (const [id, badge] of Object.entries(badges)) {
        assert.equal(of(id).badge, badge, id);
        assert.ok(Core.BADGE_BY_ID[badge], `odznak ${badge} existuje`);
        assert.equal(Look.isUnlocked(of(id), { level: 100, badges: {} }), false, `${id} bez odznaku`);
        assert.equal(Look.isUnlocked(of(id), { level: 1, badges: { [badge]: 'x' } }), true, `${id} s odznakem`);
    }
    assert.match(Look.badgeRewardText('serie-100'), /Hrdinský plášť \(doplněk Mudrlanta\)/);
    assert.match(Look.badgeRewardText('vyhry-25'), /Pirátský klobouk/);
    // Pochodeň: vrchol ligové sezóny Diamant (nebo Mistr), jako rámeček Diamantová sezóna
    const torch = of('pochoden');
    assert.equal(torch.league, 'diamant');
    assert.equal(Look.isUnlocked(torch, { level: 100, badges: {}, leagueBest: 'platina' }), false);
    assert.equal(Look.isUnlocked(torch, { level: 1, badges: {}, leagueBest: 'diamant' }), true);
    assert.equal(Look.isUnlocked(torch, { level: 1, badges: {}, leagueBest: 'mistr' }), true);
    assert.equal(Look.unlockText(torch), 'Ligová sezóna: vrchol Diamant');
    // Jen z Truhly Mudrlanta: úrovní ani odznakem ne, z truhly ano
    const chest = Look.ACCESSORIES.filter(item => item.chest).map(item => item.id).sort();
    assert.deepEqual(chest, ['hrnek', 'paska', 'srdickove-bryle', 'vencek', 'vrtulka']);
    for (const id of chest) {
        const item = of(id);
        assert.ok(!item.level && !item.badge && !item.exclusive, id);
        assert.equal(Look.isUnlocked(item, { level: 100, badges: Object.fromEntries(Core.BADGES.map(badge => [badge.id, 'x'])), gifts: null }), false, `${id} úrovní ne`);
        assert.equal(Look.isUnlocked(item, { level: 1, badges: {}, gifts: { accessories: [id] } }), true, `${id} z truhly`);
        assert.equal(Look.unlockText(item), 'Z Truhly Mudrlanta');
        assert.ok(!Look.rewardsAtLevel(100).some(entry => entry.item.id === id) && !Look.newRewards(0, 100, []).some(entry => entry.item.id === id), `${id} se úrovní neoslaví`);
    }
    // Každý doplněk má hue (vlastní barva z palety) a sedí ve svém místě
    const counts = {};
    for (const item of Look.ACCESSORIES) counts[item.slot] = (counts[item.slot] || 0) + 1;
    assert.deepEqual(counts, { head: 17, face: 11, neck: 10, hand: 15 });
    assert.ok(Look.ACCESSORIES.every(item => Number.isInteger(item.hue)), 'hue');
});

test('doplňky sovy: uložená volba se očistí (zamčené, špatné místo, neznámé id a barva)', () => {
    const ctx = { level: 10, badges: {} };
    const value = Look.normalize({ acc: {
        face: { id: 'bryle', color: 'modra' },
        head: { id: 'bryle', color: 'cervena' },
        neck: { id: 'sala', color: 'neexistuje' },
        hand: { id: 'lupa' },
        bad: { id: 'koruna' }
    } }, ctx);
    assert.deepEqual(value.acc, { face: { id: 'bryle', color: 'modra' } }, 'sála (úr. 14) a lupa (úr. 24) jsou zamčené, brýle patří do obličeje');
    assert.deepEqual(Look.normalize({ acc: 'x' }, ctx).acc, {});
    const open = Look.normalize({ acc: { neck: { id: 'sala', color: 'neexistuje' } } }, { level: 14, badges: {} });
    assert.deepEqual(open.acc, { neck: { id: 'sala', color: 'original' } });
    // Vavřín se odemyká odznakem Vítěz
    assert.deepEqual(Look.normalize({ acc: { head: { id: 'vavrin' } } }, { level: 1, badges: {} }).acc, {});
    assert.deepEqual(Look.normalize({ acc: { head: { id: 'vavrin' } } }, { level: 1, badges: { vitez: '2026-11-04' } }).acc, { head: { id: 'vavrin', color: 'original' } });
});

test('doplňky sovy: vrstvy se kreslí v pořadí krk → obličej → hlava → ruka a neznámé se vynechají', () => {
    const html = Owl.layersHtml({ head: { id: 'koruna', color: 'modra' }, neck: { id: 'sala', color: 'original' }, face: { id: 'nic', color: 'x' }, hand: { id: 'lupa', color: 'zelena' } });
    const sources = [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(sources, ['icons/doplnky/sala.webp', 'icons/doplnky/koruna-modra.webp', 'icons/doplnky/lupa-zelena.webp']);
    assert.equal(Owl.layerSrc('koruna', 'nevim'), 'icons/doplnky/koruna.webp');
    assert.equal(Owl.layerSrc('__proto__', 'modra'), null);
    assert.equal(Owl.layersHtml({}), '');
});

test('doplňky sovy: logo je obal s vrstvami a odměny doplňků se hlásí při získání úrovně', () => {
    const html = Owl.logoHtml('mx-auto', 'h-11 w-auto', { face: { id: 'bryle', color: 'original' } });
    assert.match(html, /data-owl /);
    assert.match(html, /icons\/logo-bez-monoklu\.webp/, 'brýle monokl nahradí');
    assert.match(html, /doplnky\/bryle\.webp/);
    const rewards = Look.newRewards(3, 4, []);
    assert.deepEqual(rewards.map(entry => `${entry.category}:${entry.item.id}`), ['accessories:bryle']);
});

test('doplňky sovy: doplňky jdou přidávat v libovolném pořadí (i nejdřív spodní místo, pak horní)', () => {
    const store = {};
    global.localStorage = { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } };
    const ctx = { level: 100, badges: {} };
    // Look používá root.localStorage; v Node se bere z globálního objektu
    assert.equal(Look.setPref('acc', { neck: { id: 'sala', color: 'original' } }, ctx), true);
    assert.equal(Look.setPref('acc', { neck: { id: 'sala', color: 'original' }, head: { id: 'koruna', color: 'original' } }, ctx), true, 'horní místo po spodním');
    assert.equal(Look.setPref('acc', { neck: { id: 'sala', color: 'original' }, head: { id: 'koruna', color: 'original' }, hand: { id: 'lupa', color: 'zelena' }, face: { id: 'bryle', color: 'original' } }, ctx), true);
    assert.deepEqual(Object.keys(Look.prefs(ctx).acc), ['head', 'face', 'neck', 'hand']);
    assert.equal(Look.setPref('acc', {}, ctx), true);
    delete global.localStorage;
});

test('barvy doplňků: odemykají se úrovní a nejlepší odměna je vlastní barva z palety (odstín po 5°)', () => {
    const open = (level) => Look.ACC_COLORS.filter(color => Look.isUnlocked(color, { level, badges: {} })).map(color => color.id);
    assert.deepEqual(open(1), ['original', 'cervena', 'modra']);
    assert.ok(open(52).includes('fialova') && !open(52).includes('vlastni'));
    assert.ok(open(80).includes('vlastni'));
    const ctx = (level) => ({ level, badges: {} });
    assert.deepEqual(Look.normalize({ acc: { head: { id: 'koruna', color: 'h210' } } }, ctx(80)).acc, { head: { id: 'koruna', color: 'h210' } });
    assert.equal(Look.normalize({ acc: { head: { id: 'koruna', color: 'h210' } } }, ctx(79)).acc.head.color, 'original', 'bez odemčené palety se vlastní barva zahodí');
    assert.equal(Look.normalize({ acc: { head: { id: 'koruna', color: 'h212' } } }, ctx(90)).acc.head.color, 'original', 'odstín jen po 5°');
    assert.equal(Look.normalize({ acc: { head: { id: 'koruna', color: 'h400' } } }, ctx(90)).acc.head.color, 'original');
    assert.equal(Look.normalize({ acc: { face: { id: 'bryle', color: 'zluta' } } }, ctx(20)).acc.face.color, 'original', 'žlutá je až od úrovně 26');
    // Nové barvy se hlásí jako odměny
    assert.deepEqual(Look.newRewards(7, 8, []).filter(entry => entry.category === 'colors').map(entry => entry.item.id), ['zelena']);
    assert.ok(Look.rewardsAtLevel(80).some(entry => entry.category === 'colors' && entry.item.id === 'vlastni'));
});

test('vlastní barva doplňku: obrázek zůstane původní a barvu dá otočení odstínu podle původního odstínu doplňku', () => {
    // Koruna je zlatá (odstín 40), cíl 210 (modrá) → otočit o 170°; sluchátka jsou červená (358), cíl 120 → 122°
    assert.match(Owl.layersHtml({ head: { id: 'koruna', color: 'h210' } }), /src="icons\/doplnky\/koruna\.webp"[^>]*hue-rotate-\[170deg\]/);
    assert.match(Owl.layersHtml({ head: { id: 'sluchatka', color: 'h120' } }), /hue-rotate-\[120deg\]/);
    assert.doesNotMatch(Owl.layersHtml({ head: { id: 'koruna', color: 'h40' } }), /hue-rotate/, 'stejný odstín = bez otočení');
    assert.doesNotMatch(Owl.layersHtml({ head: { id: 'koruna', color: 'modra' } }), /hue-rotate/);
});

test('doplňky za zběhlost: každé téma má doplněk vázaný na odznak, který dá 12 v řadě nebo 3 hvězdy', () => {
    const Core = require('../quiz-core.js');
    const topics = ['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport'];
    const bySlot = {};
    for (const topic of topics) {
        const items = Look.ACCESSORIES.filter(item => item.badge === `zbehly-${topic}`);
        assert.equal(items.length, 1, topic);
        bySlot[items[0].slot] = (bySlot[items[0].slot] || 0) + 1;
        const badge = Core.BADGES.find(entry => entry.id === `zbehly-${topic}`);
        assert.ok(badge, `odznak ${topic}`);
        const base = { ...Core.normalizeCounters({}) };
        assert.equal(Core.earnedBadgeIds(base, { level: 1, topicStars: {} }).includes(badge.id), false);
        assert.ok(Core.earnedBadgeIds({ ...base, topicBest: { [topic]: 12 } }, { level: 1, topicStars: {} }).includes(badge.id), 'série 12');
        assert.equal(Core.earnedBadgeIds({ ...base, topicBest: { [topic]: 11 } }, { level: 1, topicStars: {} }).includes(badge.id), false, 'série 11 nestačí');
        assert.ok(Core.earnedBadgeIds(base, { level: 1, topicStars: { [topic]: 3 } }).includes(badge.id), '3 hvězdy');
        assert.equal(Core.earnedBadgeIds(base, { level: 1, topicStars: { [topic]: 2 } }).includes(badge.id), false, '2 hvězdy nestačí');
    }
    assert.deepEqual(bySlot, { neck: 2, hand: 5, head: 4, face: 3 });
    // Doplněk se odemkne odznakem a oslava se hlásí při jeho získání
    const item = Look.ACCESSORIES.find(entry => entry.id === 'kompas');
    assert.equal(Look.isUnlocked(item, { level: 100, badges: {} }), false);
    assert.equal(Look.isUnlocked(item, { level: 1, badges: { 'zbehly-zemepis': '2026-11-05' } }), true);
    assert.deepEqual(Look.newRewards(1, 1, ['zbehly-zemepis']).map(entry => entry.item.id), ['kompas']);
});

test('vlajka: barvu mění jen plátno, tyčka je samostatná vrstva nad ním a barvu nemění', () => {
    const html = Owl.layersHtml({ hand: { id: 'vlajka', color: 'h300' } });
    const imgs = html.match(/<img [^>]*>/g);
    assert.equal(imgs.length, 2);
    assert.match(imgs[0], /src="icons\/doplnky\/vlajka\.webp"/);
    assert.match(imgs[0], /hue-rotate-/, 'plátno se přebarví');
    assert.match(imgs[1], /src="icons\/doplnky\/vlajka-zaklad\.webp"/);
    assert.doesNotMatch(imgs[1], /hue-rotate-/, 'tyčka zůstává');
    assert.match(Owl.layersHtml({ hand: { id: 'vlajka', color: 'zelena' } }), /vlajka-zelena\.webp.*vlajka-zaklad\.webp/);
    assert.equal(Owl.layersHtml({ hand: { id: 'lupa', color: 'zelena' } }).match(/<img /g).length, 1, 'ostatní doplňky mají jednu vrstvu');
});

test('odměna za odznak: Look řekne, co přesně odznak odemkne (nebo že dává jen slávu)', () => {
    const Core = require('../quiz-core.js');
    assert.deepEqual(Look.rewardsForBadge('vitez').map(entry => `${entry.category}:${entry.item.id}`).sort(), ['accessories:vavrin', 'frames:vavrin']);
    assert.equal(Look.badgeRewardText('vitez'), 'Odměna: Vavřínový (rámeček), Vavřínový věnec (doplněk Mudrlanta)');
    assert.equal(Look.badgeRewardText('zbehly-zemepis'), 'Odměna: Kompas (doplněk Mudrlanta)');
    assert.equal(Look.badgeRewardText('turnaj-bronz'), 'Odměna: Medailista turnaje (rámeček), Pásovec rytíř (profilový obrázek)');
    assert.equal(Look.badgeRewardText('stovka'), '', 'odznak jen pro slávu: bez řádku s odměnou');
    assert.equal(Look.badgeRewardText('zbehly-zemepis-25'), '', 'další stupně zběhlosti doplněk nedávají');
    // Každý odznak z katalogu odměn skutečně existuje
    for (const items of Object.values(Look.CATALOG)) for (const item of items.filter(entry => entry.badge)) assert.ok(Core.BADGE_BY_ID[item.badge], item.badge);
});

test('sezónní doplňky (obrázky č. 134–145): jen ze Sezónní truhly svého měsíce, ve výběru jen vlastněné, pevné barvy u věnečku, konvalinek a dýně', () => {
    const season = Look.ACCESSORIES.filter(item => item.exclusive);
    // V pořadí měsíců, každý je doplněk Sezónní truhly svého měsíce
    assert.deepEqual(season.map(item => [item.month, item.id, item.slot]), [
        [1, 'cepice-zimni', 'head'], [2, 'karneval', 'face'], [3, 'jarni-venecek', 'head'], [4, 'destnik', 'hand'], [5, 'konvalinky', 'hand'], [6, 'slamak', 'head'],
        [7, 'snorchl', 'face'], [8, 'zmrzlina', 'hand'], [9, 'tuzka', 'hand'], [10, 'dyne', 'head'], [11, 'lampion', 'hand'], [12, 'sala-zimni', 'neck']]);
    for (const item of season) {
        assert.equal(Look.SEASON_BUNDLES[String(item.month).padStart(2, '0')].accessory, item.id);
        assert.equal(item.source, 'season');
        assert.ok(!item.level && !item.badge && !item.chest && !item.league && !item.rare, item.id);
        assert.ok(Look.seasonBundle(item.month).some(entry => entry.category === 'accessories' && entry.item === item), `${item.id} v Sezónní truhle`);
        assert.ok(!Look.rewardsAtLevel(item.month).some(entry => entry.item === item));
    }
    // Pevné barvy: jarní věneček, konvalinky a dýně (bez barevných variant, uloží se původní barva, výběr barvy se skryje)
    assert.deepEqual(Look.ACCESSORIES.filter(item => item.noColors).map(item => item.id), ['jarni-venecek', 'konvalinky', 'dyne']);
    const owner = { level: 100, badges: {}, gifts: { accessories: ['dyne', 'lampion'] } };
    assert.deepEqual(Look.normalize({ acc: { head: { id: 'dyne', color: 'modra' }, hand: { id: 'lampion', color: 'modra' } } }, owner).acc,
        { head: { id: 'dyne', color: 'original' }, hand: { id: 'lampion', color: 'modra' } });
    assert.deepEqual(Look.normalize({ acc: { head: { id: 'dyne' }, hand: { id: 'lampion' } } }, { level: 100, badges: {}, gifts: {} }).acc, {}, 'bez Sezónní truhly ne');
    assert.equal(Owl.layerSrc('dyne', 'modra'), 'icons/doplnky/dyne.webp');
    assert.equal(Owl.layerSrc('lampion', 'modra'), 'icons/doplnky/lampion-modra.webp');
    assert.doesNotMatch(Owl.layersHtml({ head: { id: 'dyne', color: 'h120' } }), /hue-rotate/, 'pevné barvy ani vlastní odstín');
    assert.deepEqual(Owl.parseOwl('robe=modra;head=dyne.cervena;hand=zmrzlina.zelena'), { robe: 'modra', acc: { head: { id: 'dyne', color: 'original' }, hand: { id: 'zmrzlina', color: 'zelena' } } });
    // Čepici skryje zimní čepice a slaměný klobouk, dýně ne; ruku skryje lampion
    assert.match(Owl.owlAvatarHtml('robe=zelena;head=slamak.original;hand=lampion.zluta'), /owl-nohat owl-nohand.*doplnky\/slamak\.webp.*doplnky\/lampion-zluta\.webp/);
    assert.doesNotMatch(Owl.logoHtml('', '', { head: { id: 'dyne', color: 'original' } }), /owl-nohat/);
    // Výběr v Nastavení: sezónní doplněk jen vlastněný; u pevných barev místo palety věta
    const store = {};
    global.localStorage = { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } };
    try {
        const section = Look.getSections().find(entry => entry.id === 'owl');
        const press = (ctx, selector) => section.click({ target: { closest: (query) => (query === selector.split('|')[0] ? { dataset: JSON.parse(selector.split('|')[1]) } : null) } }, ctx);
        const ctxOf = (gifts) => { const base = { level: 100, badges: {}, gifts }; return { ...base, prefs: Look.prefs(base) }; };
        press(ctxOf({}), '[data-owl-slot]|{"owlSlot":"head"}');
        let html = section.render(ctxOf({}));
        assert.doesNotMatch(html, /data-owl-pick="head:(dyne|cepice-zimni|slamak|jarni-venecek)"/, 'nevlastněné sezónní doplňky ve výběru nejsou');
        html = section.render(ctxOf({ accessories: ['dyne'] }));
        assert.match(html, /data-owl-pick="head:dyne"/);
        assert.doesNotMatch(html, /data-owl-pick="head:slamak"/);
        assert.ok(press(ctxOf({ accessories: ['dyne'] }), '[data-owl-pick]|{"owlPick":"head:dyne"}'));
        html = section.render(ctxOf({ accessories: ['dyne'] }));
        assert.match(html, /data-owl-fixed[^>]*>[\s\S]*Dýně<\/b> má pevné barvy/);
        assert.doesNotMatch(html, /data-owl-color=/, 'u pevných barev paleta není');
        assert.equal(press(ctxOf({ accessories: ['dyne'] }), '[data-owl-color]|{"owlColor":"head:modra"}'), false, 'barva se nenasadí');
        assert.deepEqual(Look.prefs(ctxOf({ accessories: ['dyne'] })).acc, { head: { id: 'dyne', color: 'original' } });
        Look.setPref('acc', {}, ctxOf({}));
    } finally { delete global.localStorage; }
});
