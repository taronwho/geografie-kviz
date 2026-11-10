// Postavičky (profilové obrázky za odměny, look.js): zápis s barvami částí, přísná kontrola, odemykání stejně jako nahrazená emoji,
// převod starých emoji, ukládání přes social.js, seznam v service workeru a obrázky. Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Look = require('../look.js');
const Social = require('../social.js');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const CHARACTERS = Look.AVATARS.filter(item => item.parts);
// Odměny, které postavičky nahradily (dřívější emoji v look.js): emoji → [id, odemčení]
const REPLACED = {
    '🦅': ['cervik', { level: 3 }], '🐺': ['axolot', { level: 8 }], '🦈': ['kaktus', { level: 13 }], '🐉': ['drak', { level: 20 }], '🦖': ['mamut', { level: 28 }],
    '🦚': ['meduza', { level: 36 }], '🦩': ['lenoch', { level: 44 }], '🐅': ['tukan', { level: 55 }], '🦁': ['lev', { level: 65 }], '👑': ['fenix', { level: 80 }],
    '🏅': ['krecek', { badge: 'turnaj-ucast' }], '🥉': ['rytir', { badge: 'turnaj-bronz' }], '🥈': ['narval', { badge: 'turnaj-stribro' }], '🏆': ['zelva', { badge: 'turnaj-zlato' }],
    '⏱️': ['hodiny', { badge: 'kviz-tyden' }], '⚡': ['gepard', { badge: 'bleskovka-16' }], '🐻': ['zelvus', { badge: 'preziti-20' }], '🗺️': ['tucnak', { badge: 'mapa-25' }],
    '🎯': ['zabak', { badge: 'odhad-25' }], '🧩': ['myval', { badge: 'serad-25' }]
};

test('katalog: 20 postaviček s 1–2 částmi, id do 6 písmen, Stovka zatím jako emoji', () => {
    assert.equal(CHARACTERS.length, 20);
    assert.equal(Look.AVATARS.length, 21);
    for (const item of CHARACTERS) {
        assert.match(item.id, /^[a-z]{1,6}$/, item.id);
        assert.ok(item.parts.length >= 1 && item.parts.length <= 2, item.id);
        assert.ok(item.title && item.parts.every(part => typeof part === 'string' && part), item.id);
        // Nabízené barvy každé části: čísla 1–9 bez opakování
        assert.equal(item.colors.length, item.parts.length, item.id);
        for (const list of item.colors) assert.ok(list.length >= 6 && list.every(color => Number.isInteger(color) && color >= 1 && color <= 9) && new Set(list).size === list.length, item.id);
    }
    assert.equal(new Set(Look.AVATARS.map(item => item.id)).size, 21);
    const hundred = Look.find('avatars', '💯');
    assert.deepEqual([hundred.badge, hundred.parts], ['kviz-perfekt', undefined]);
    assert.deepEqual(Look.AVATAR_COLORS.map(color => [color.id, color.hex]), [[1, '#db2c3a'], [2, '#f57e22'], [3, '#fad325'], [4, '#3cbd4d'], [5, '#31ccc7'], [6, '#3a77e0'], [7, '#9556cc'], [8, '#f576b9'], [9, '#3f424c']]);
    assert.deepEqual(Look.partColors(Look.find('avatars', 'mamut'), 2).map(color => color.id), [4, 5, 6, 7, 8, 9]);
    assert.equal(Look.partColors(Look.find('avatars', 'lev'), 1).length, 9);
});

test('odemčení: každá postavička se odemyká přesně jako emoji, které nahradila', () => {
    for (const [emoji, [id, unlock]] of Object.entries(REPLACED)) {
        const item = Look.find('avatars', id);
        assert.ok(item, id);
        assert.equal(item.was, emoji, id);
        if (unlock.level) {
            assert.equal(item.level, unlock.level, id);
            assert.equal(Look.isUnlocked(item, { level: unlock.level - 1, badges: {}, gifts: null }), false, id);
            assert.equal(Look.isUnlocked(item, { level: unlock.level, badges: {}, gifts: null }), true, id);
        } else {
            assert.equal(item.badge, unlock.badge, id);
            assert.ok(core.BADGE_BY_ID[item.badge], `${id}: odznak ${item.badge} existuje`);
            assert.equal(Look.isUnlocked(item, { level: 100, badges: {}, gifts: null }), false, id);
            assert.equal(Look.isUnlocked(item, { level: 1, badges: { [unlock.badge]: '2026-11-01' }, gifts: null }), true, id);
        }
    }
    // Oslava nové odměny (úroveň 28) a odměna za odznak mluví o postavičce
    assert.deepEqual(Look.newRewards(27, 28).filter(entry => entry.category === 'avatars').map(entry => entry.item.id), ['mamut']);
    assert.match(Look.badgeRewardText('kviz-tyden'), /Utíkající přesýpačky \(profilový obrázek\)/);
    assert.equal(Look.settingsPlace('avatars'), 'Nastavení → Profil');
    assert.equal(Look.settingsPlace('robes'), 'Nastavení → Mudrlant');
    assert.equal(Look.settingsPlace('themes'), 'Nastavení → Hra');
});

test('zápis: id + číslice barev částí (0 = původní, koncové nuly pryč), přísná kontrola', () => {
    assert.equal(Look.formatAvatar('krecek', [0, 0]), 'krecek');
    assert.equal(Look.formatAvatar('krecek', [3]), 'krecek3');
    assert.equal(Look.formatAvatar('krecek', [3, 0]), 'krecek3');
    assert.equal(Look.formatAvatar('krecek', [0, 5]), 'krecek05');
    assert.equal(Look.formatAvatar('krecek', [9, 9]), 'krecek99');
    assert.equal(Look.formatAvatar('lev', [4, 7]), 'lev4', 'lev má jen hřívu');
    assert.equal(Look.formatAvatar('krecek', [12, -1]), 'krecek', 'neplatné barvy = původní');
    assert.equal(Look.formatAvatar('neznamy', [1]), null);
    assert.equal(Look.formatAvatar('💯', [1]), null, 'emoji bez obrázku nemá části');
    assert.deepEqual(Look.parseAvatar('krecek05').colors, [0, 5]);
    assert.deepEqual(Look.parseAvatar('krecek').colors, [0, 0]);
    assert.deepEqual(Look.parseAvatar('lev9').colors, [9]);
    for (const bad of ['lev12', 'krecek123', 'KRECEK', 'krecek-1', 'krecek a', ' krecek', 'neznamy', 'krec', '', null, undefined, 42, '🦊', '💯', '<img>', 'krecek\n1', 'toString', 'constructor']) {
        assert.equal(Look.parseAvatar(bad), null, String(bad));
        assert.equal(Look.avatarPicture(bad), null, String(bad));
        assert.equal(Look.avatarCode(bad), null, String(bad));
    }
    // Každý zápis se vejde do sloupce profiles.avatar (1–8 znaků)
    for (const item of CHARACTERS) assert.ok(Look.formatAvatar(item.id, [9, 9]).length <= 8, item.id);
    // Uložená barva mimo nabídku (1–9) se pořád vykreslí, vrstva pro ni existuje
    assert.deepEqual(Look.avatarPicture('kaktus1').layers, ['icons/avatars/kaktus-11.webp']);
});

test('obrázek: základ a vrstvy přebarvených částí; staré emoji odměny = postavička, která ho nahradila', () => {
    assert.deepEqual(Look.avatarPicture('krecek'), { item: Look.find('avatars', 'krecek'), colors: [0, 0], base: 'icons/avatars/krecek.webp', layers: [] });
    assert.deepEqual(Look.avatarPicture('krecek3').layers, ['icons/avatars/krecek-13.webp']);
    assert.deepEqual(Look.avatarPicture('krecek05').layers, ['icons/avatars/krecek-25.webp']);
    assert.deepEqual(Look.avatarPicture('krecek38').layers, ['icons/avatars/krecek-13.webp', 'icons/avatars/krecek-28.webp']);
    for (const [emoji, [id]] of Object.entries(REPLACED)) {
        assert.equal(Look.migrateAvatar(emoji), id, emoji);
        assert.equal(Look.avatarCode(emoji), id, emoji);
        assert.equal(Look.avatarPicture(emoji).base, `icons/avatars/${id}.webp`, emoji);
        assert.equal(Look.avatarItem(emoji), Look.find('avatars', id), emoji);
    }
    // I bez neviditelného výběru varianty (U+FE0F)
    assert.equal(Look.migrateAvatar('⏱'), 'hodiny');
    assert.equal(Look.migrateAvatar('🗺'), 'tucnak');
    // Základní emoji a Stovka zůstávají, jak jsou
    for (const value of ['🦊', '🦉', '💯', 'nesmysl']) assert.equal(Look.migrateAvatar(value), value);
    assert.equal(Look.avatarItem('💯'), Look.find('avatars', '💯'));
    assert.equal(Look.avatarItem('🦊'), null);
    assert.equal(Look.avatarItem('krecek38'), Look.find('avatars', 'krecek'));
});

test('ukládání (social.js): postavička s barvami projde, staré emoji se uloží jako postavička, nesmysl ne', async () => {
    globalThis.MudrlantLook = Look;
    try {
        assert.equal(Social.cleanAvatar('krecek05'), 'krecek05');
        assert.equal(Social.cleanAvatar('krecek50'), 'krecek5', 'koncová nula pryč');
        assert.equal(Social.cleanAvatar('🦁'), 'lev');
        assert.equal(Social.cleanAvatar('🐼'), '🐼');
        assert.equal(Social.cleanAvatar('💯'), '💯');
        for (const bad of ['lev12', 'krecek123', 'neznamy', '<b>x</b>', '', null, 7, '🍕']) assert.equal(Social.cleanAvatar(bad), '🦊', String(bad));
    } finally { delete globalThis.MudrlantLook; }
    // Uložení profilu pošle do databáze vyčištěnou hodnotu (social.js v falešném okně s přihlášením, look.js a fetch)
    const calls = [];
    const fakeFetch = async (url, init) => { const body = JSON.parse(init.body); calls.push(body); return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 'u', ...body }]) }; };
    const sandbox = { self: { MUDRLANT_CONFIG: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' }, MudrlantAuth: { accessToken: async () => 'tok' }, MudrlantLook: Look }, fetch: fakeFetch, console };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'social.js'), 'utf8'), sandbox);
    const Fresh = sandbox.self.MudrlantSocial;
    for (const avatar of ['🦁', 'zabak12', 'zabak123', '🐉']) await Fresh.saveProfile('u', { name: 'Jana', avatar, color: 'sky', owl: null });
    assert.deepEqual(calls.map(call => call.avatar), ['lev', 'zabak12', '🦊', 'drak']);
});

test('service worker má v mezipaměti obrázky všech postaviček a obrázky i vrstvy existují', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const listed = /const AVATAR_ART = \[([^\]]+)\]/.exec(sw)[1].match(/'([a-z]+)'/g).map(entry => entry.slice(1, -1));
    assert.deepEqual(listed, CHARACTERS.map(item => item.id));
    assert.match(sw, /\.\.\.AVATAR_ART\.map\(id => `icons\/avatars\/\$\{id\}\.webp`\)/);
    for (const item of CHARACTERS) {
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'avatars', `${item.id}.webp`)), `${item.id}.webp`);
        item.parts.forEach((part, index) => {
            for (let color = 1; color <= 9; color++) assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'avatars', `${item.id}-${index + 1}${color}.webp`)), `${item.id}-${index + 1}${color}.webp`);
        });
    }
});
