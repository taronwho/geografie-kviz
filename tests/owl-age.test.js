// Mudrlant stárne: stupně podle dní ve hře (look.js), zápis stupně do textu sovy a obrázky (look-owl.js), oči se nepřebarví (robe-color.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.window = global.window || {};
const Look = require('../look.js');
window.MudrlantLook = Look;
const Owl = require('../look-owl.js');
const RobeColor = require('../robe-color.js');
const ROOT = path.join(__dirname, '..');

test('stupně stárnutí: dnešní sova do roka, pak každý rok další, po pěti letech poslední; vývojářský náhled', () => {
    assert.deepEqual(Look.AGE_STAGES.map(item => [item.stage, item.days]), [[1, 0], [2, 365], [3, 730], [4, 1095], [5, 1825]]);
    assert.deepEqual([0, 364, 365, 729, 730, 1094, 1095, 1824, 1825, 9000].map(Look.ageStageOf), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    assert.deepEqual(Look.ageInfo(300), { stage: 1, title: 'Mudrlant', next: { stage: 2, days: 365, title: 'Zkušený mudrc', left: 65 } });
    assert.equal(Look.ageInfo(2000).next, null);
    Look.setAgeDays(800);
    assert.equal(Look.ageStage(), 3);
    Look.setDevAge(5);
    assert.equal(Look.ageStage(), 5);
    Look.setDevAge(null);
    assert.equal(Look.ageStage(), 3);
    Look.setAgeDays(0);
    assert.equal(Look.cleanAge('9'), 1);
});

test('stupeň v textu sovy (age=n) a obrázek stárnoucí sovy i u cizího hráče; obrázky existují ve všech barvách', () => {
    const text = Owl.encodeOwl({ robe: 'zelena', acc: {}, age: 4 });
    assert.equal(text, 'robe=zelena;age=4');
    assert.equal(Owl.parseOwl(text).age, 4);
    assert.equal(Owl.parseOwl('robe=zelena').age, undefined, 'dnešní sova stupeň nepíše');
    assert.equal(Owl.encodeOwl({ robe: 'vinova', acc: {}, age: 1 }), 'robe=vinova');
    assert.match(Owl.owlAvatarHtml('robe=zelena;age=4'), /icons\/logo-vek4-zelena\.webp/);
    assert.match(Owl.owlAvatarHtml('robe=vinova;age=2;face=bez-monoklu'), /icons\/logo-vek2-bez-monoklu\.webp/);
    assert.match(Owl.owlAvatarHtml('robe=vinova'), /icons\/logo\.webp/);
    for (const n of [2, 3, 4, 5]) {
        for (const mono of ['', '-bez-monoklu']) {
            for (const robe of ['', '-zelena', '-modra', '-ruzova', '-fialova', '-cerna', '-zlata', '-bila']) {
                assert.ok(fs.existsSync(path.join(ROOT, 'icons', `logo-vek${n}${mono}${robe}.webp`)), `logo-vek${n}${mono}${robe}.webp`);
            }
        }
    }
    assert.ok(RobeColor.areaFor('icons/logo-vek3.webp'), 'vlastní barva obleku nepřebarví oči');
    assert.equal(RobeColor.areaFor('icons/logo.webp'), null);
});
