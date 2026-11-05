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
        for (const color of Look.ACC_COLORS.filter(entry => entry.id !== 'original')) {
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
