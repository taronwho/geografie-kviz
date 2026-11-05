const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Look = require('../look.js');
const Owl = require('../look-owl.js');

test('doplňky sovy: katalog má 10 doplňků ve čtyřech místech a každý má obrázky ve všech barvách', () => {
    assert.equal(Look.ACCESSORIES.length, 10);
    assert.deepEqual(Look.SLOTS.map(slot => slot.id), ['head', 'face', 'neck', 'hand']);
    for (const item of Look.ACCESSORIES) {
        assert.ok(Look.SLOTS.some(slot => slot.id === item.slot), item.id);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}.webp`)), `${item.id} vrstva`);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-ikona.webp`)), `${item.id} ikona`);
        for (const color of Look.ACC_COLORS.filter(entry => entry.id !== 'original' && entry.id !== 'vlastni')) {
            assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'doplnky', `${item.id}-${color.id}.webp`)), `${item.id}-${color.id}`);
        }
    }
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
