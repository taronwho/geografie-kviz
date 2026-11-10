const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Look = require('../look.js');
const Owl = require('../look-owl.js');

test('doplňky sovy: katalog má 24 doplňků ve čtyřech místech a každý má obrázky ve všech barvách', () => {
    assert.equal(Look.ACCESSORIES.length, 24);
    assert.deepEqual(Look.SLOTS.map(slot => slot.id), ['head', 'face', 'neck', 'hand']);
    for (const item of Look.ACCESSORIES) {
        assert.ok(Look.SLOTS.some(slot => slot.id === item.slot), item.id);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}.webp`)), `${item.id} vrstva`);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-ikona.webp`)), `${item.id} ikona`);
        if (item.fixed) assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-zaklad.webp`)), `${item.id} pevná část`);
        for (const color of Look.ACC_COLORS.filter(entry => entry.id !== 'original' && entry.id !== 'vlastni')) {
            assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-${color.id}.webp`)), `${item.id}-${color.id}`);
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
        for (const color of Look.ACC_COLORS.filter(entry => entry.id !== 'original' && entry.id !== 'vlastni')) {
            const file = path.join(dir, `${item.id}-${color.id}.webp`);
            assert.deepEqual(webpSize(file), [width, height], `${item.id}-${color.id} rám`);
            assert.ok(!fs.readFileSync(file).equals(fs.readFileSync(original)), `${item.id}-${color.id} se od původní vrstvy neliší`);
        }
    }
});

test('doplňky sovy: výchozí čepici skrývá jen doplněk, který ji nahrazuje (helma, přilba, baret); koruna a síťka sedí na čepici nebo vedle ní', () => {
    const hiding = Look.ACCESSORIES.filter(item => item.hidesHat).map(item => item.id).sort();
    assert.deepEqual(hiding, ['baret', 'helma', 'prilba']);
    for (const id of ['koruna', 'sitka', 'kvetina', 'vavrin', 'sluchatka', 'celenka']) assert.ok(!Look.find('accessories', id).hidesHat, id);
    assert.match(Owl.logoHtml('', '', { head: { id: 'helma', color: 'cerna' } }), /data-owl class="[^"]*owl-nohat/);
    assert.doesNotMatch(Owl.logoHtml('', '', { head: { id: 'koruna', color: 'cerna' } }), /owl-nohat/);
    // síťka v ruce nic nemění: čepici skrývá dál baret na hlavě
    assert.match(Owl.logoHtml('', '', { head: { id: 'baret', color: 'cerna' }, hand: { id: 'sitka', color: 'modra' } }), /owl-nohat/);
    assert.doesNotMatch(Owl.logoHtml('', '', { hand: { id: 'sitka', color: 'modra' } }), /owl-nohat/);
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
    assert.match(html, /icons\/logo\.webp/);
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
