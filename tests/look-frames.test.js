// Testy rámečků, titulu u jména a obrázků hráče (look-frames.js, look.js, social.js). Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Look = require('../look.js');
const Frames = require('../look-frames.js');
const Social = require('../social.js');

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
    assert.equal(Look.FRAMES.find(item => item.id === 'plamen').badge, 'serie-30');
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
        assert.ok(all.includes('🐉'));
    } finally { delete globalThis.MudrlantLook; }
});
