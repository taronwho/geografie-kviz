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
    '⏱️': ['hodiny', { badge: 'kviz-tyden' }], '💯': ['chamel', { badge: 'kviz-perfekt' }], '⚡': ['gepard', { badge: 'bleskovka-16' }], '🐻': ['zelvus', { badge: 'preziti-20' }], '🗺️': ['tucnak', { badge: 'mapa-25' }],
    '🎯': ['zabak', { badge: 'odhad-25' }], '🧩': ['myval', { badge: 'serad-25' }]
};

test('katalog: postavičky s 1–2 částmi, id do 6 písmen, žádná odměna už není emoji', () => {
    // 21 za úrovně a odznaky a 14 legendárních za diplomy (sezónní exclusive se počítají zvlášť)
    assert.equal(CHARACTERS.filter(item => !item.diploma && !item.exclusive).length, 21);
    assert.equal(CHARACTERS.filter(item => item.diploma).length, 14);
    assert.equal(CHARACTERS.length, Look.AVATARS.length);
    for (const item of CHARACTERS) {
        assert.match(item.id, /^[a-z]{1,6}$/, item.id);
        assert.ok(item.parts.length >= 1 && item.parts.length <= 2, item.id);
        assert.ok(item.title && item.parts.every(part => typeof part === 'string' && part), item.id);
        // Nabízené barvy každé části: čísla 1–9 bez opakování
        assert.equal(item.colors.length, item.parts.length, item.id);
        for (const list of item.colors) assert.ok(list.length >= 6 && list.every(color => Number.isInteger(color) && color >= 1 && color <= 9) && new Set(list).size === list.length, item.id);
    }
    assert.equal(new Set(Look.AVATARS.map(item => item.id)).size, Look.AVATARS.length);
    // Chameleon jednička nahradil Stovku (💯): stejný odznak, obě části s vlastním výběrem barev
    const chameleon = Look.find('avatars', 'chamel');
    assert.deepEqual([chameleon.title, chameleon.badge, chameleon.parts], ['Chameleon jednička', 'kviz-perfekt', ['Kůže', 'Bříško']]);
    assert.deepEqual(Look.partColors(chameleon, 1).map(color => color.id), [1, 2, 3, 5, 6, 7, 8, 9]);
    assert.deepEqual(Look.partColors(chameleon, 2).map(color => color.id), [1, 4, 5, 6, 7, 8, 9]);
    assert.equal(Look.find('avatars', '💯'), null);
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
    assert.equal(Look.formatAvatar('💯', [1]), null, 'staré emoji není id postavičky');
    assert.equal(Look.formatAvatar('chamel', [9, 9]), 'chamel99');
    assert.deepEqual(Look.parseAvatar('krecek05').colors, [0, 5]);
    assert.deepEqual(Look.parseAvatar('krecek').colors, [0, 0]);
    assert.deepEqual(Look.parseAvatar('lev9').colors, [9]);
    for (const bad of ['lev12', 'krecek123', 'KRECEK', 'krecek-1', 'krecek a', ' krecek', 'neznamy', 'krec', '', null, undefined, 42, '🦊', '<img>', 'krecek\n1', 'toString', 'constructor']) {
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
    // Základní emoji zůstávají, jak jsou; Stovka (💯) je teď Chameleon jednička
    for (const value of ['🦊', '🦉', 'nesmysl']) assert.equal(Look.migrateAvatar(value), value);
    assert.equal(Look.avatarCode('💯'), 'chamel');
    assert.deepEqual(Look.avatarPicture('chamel12').layers, ['icons/avatars/chamel-11.webp', 'icons/avatars/chamel-22.webp']);
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
        assert.equal(Social.cleanAvatar('💯'), 'chamel');
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

// Legendární postavičky za diplomy témat (docs/OBRAZKY.md č. 119–132): téma → id
const LEGENDARY = {
    zemepis: 'albatr', vlajky: 'gryf', historie: 'slon', mytologie: 'sfinga', biologie: 'jelen', geologie: 'golem', chemie: 'liska',
    fyzika: 'chobot', umeni: 'pav', architektura: 'bobr', hudba: 'vlk', literatura: 'kndrak', film: 'panda', sport: 'klokan'
};

test('legendární postavičky: jedna za diplom každého tématu, odemyká je jen diplom (ne úroveň, odznak, truhla ani Sezóna)', () => {
    const Rewards = require('../rewards.js');
    const Album = require('../album.js');
    const legendary = Look.AVATARS.filter(item => item.diploma);
    assert.deepEqual(Object.fromEntries(legendary.map(item => [item.diploma, item.id])), LEGENDARY);
    assert.deepEqual(Object.keys(LEGENDARY).sort(), Object.keys(Rewards.DIPLOMA_NAMES).sort(), 'každé téma s diplomem má svou');
    assert.deepEqual(Object.keys(Look.DIPLOMA_TOPICS).sort(), Object.keys(Rewards.DIPLOMA_NAMES).sort());
    const everything = { level: 100, badges: Object.fromEntries(core.BADGES.map(badge => [badge.id, '2026-11-01'])), gifts: null };
    for (const item of legendary) {
        assert.ok(Look.isLegendary(item), item.id);
        assert.equal(item.level, undefined, item.id);
        assert.equal(item.badge, undefined, item.id);
        assert.equal(item.was, undefined, 'legendární nenahrazuje žádné staré emoji');
        assert.equal(Look.isUnlocked(item, everything), false, `${item.id}: úroveň 100 a všechny odznaky nestačí`);
        assert.equal(Look.isUnlocked(item, { level: 1, badges: {}, gifts: null, diplomas: { [item.diploma]: '2026-11-01' } }), true, item.id);
        const other = Object.keys(LEGENDARY).find(topic => topic !== item.diploma);
        assert.equal(Look.isUnlocked(item, { level: 1, badges: {}, gifts: null, diplomas: { [other]: '2026-11-01' } }), false, `${item.id}: jiný diplom ne`);
        assert.equal(Look.unlockText(item), `Diplom: ${Look.DIPLOMA_TOPICS[item.diploma]}`);
        assert.deepEqual(Look.rewardsForDiploma(item.diploma), [{ category: 'avatars', item }]);
        assert.equal(Album.isStarter(item), false, `${item.id} do sbírky patří`);
        // Zápis s barvami obou částí se vejde do sloupce profiles.avatar (1–8 znaků) a vykreslí se vrstvami
        assert.ok(Look.formatAvatar(item.id, [9, 9]).length <= 8, item.id);
        assert.deepEqual(Look.avatarPicture(`${item.id}12`).layers, [`icons/avatars/${item.id}-11.webp`, `icons/avatars/${item.id}-22.webp`]);
    }
    globalThis.MudrlantLook = Look;
    try {
        for (const id of Object.values(LEGENDARY)) assert.equal(Social.cleanAvatar(`${id}38`), `${id}38`, id);
        assert.equal(Social.cleanAvatar('albatr123'), '🦊');
    } finally { delete globalThis.MudrlantLook; }
    assert.equal(Look.find('avatars', 'albatr').title, 'Albatros mořeplavec');
    assert.equal(Look.find('avatars', 'gryf').title, 'Gryf praporečník');
    assert.deepEqual(Look.rewardsForDiploma('neznamy'), []);
    // Oslava nové odměny podle úrovně nebo odznaku je nikdy neukáže (slaví je oslava diplomu)
    assert.deepEqual(Look.newRewards(0, 100, core.BADGES.map(badge => badge.id)).filter(entry => entry.item.diploma), []);
    // Truhla Mudrlanta ani Sezóna (bere výběr truhly) je nedají, ani vzácně
    for (const level of [1, 50, 100]) assert.equal(Rewards.candidates(Rewards.empty(), { level, badges: {} }).some(entry => entry.item.diploma), false, `úroveň ${level}`);
    assert.equal(Rewards.rareCandidates(Rewards.empty()).some(entry => entry.item.diploma), false);
    for (let month = 1; month <= 12; month++) assert.equal(Look.seasonBundle(month).some(entry => entry.item.diploma), false, `měsíc ${month}`);
});

test('legendární postavičky: okno diplomu ukáže odměnu (získanou i chybějící), Diplomy o ní mluví', () => {
    const Rewards = require('../rewards.js');
    const h = { topicIcon: () => '<i></i>', styleOf: () => ({ soft: 'bg-x' }), avatar: (id, cls) => `<span data-art="${id}" class="${cls}"></span>` };
    const topic = { id: 'zemepis', title: 'Zeměpis' };
    const locked = Rewards.diplomaDialogHtml({ topic, title: 'Mistr zeměpisu', earned: false, known: 10, needed: 300, missing: 290 }, {}, h);
    // Nezískaný: řádek s šedou postavičkou; získaný: tlačítko s postavičkou vedle Sdílet a Stáhnout (otevře výběr v Profilu)
    assert.match(locked, /data-diploma-legend-info="albatr"/);
    assert.match(locked, /Odměna: legendární postavička <b>Albatros mořeplavec<\/b>/);
    assert.match(locked, /opacity-50 grayscale"><span data-art="albatr"/);
    assert.doesNotMatch(locked, /<button[^>]*data-diploma-legend=/);
    const earned = Rewards.diplomaDialogHtml({ topic, title: 'Mistr zeměpisu', earned: true, day: '2026-11-01', known: 300, needed: 300, missing: 0 }, { name: 'Jana' }, h);
    assert.match(earned, /data-diploma-download[\s\S]*<button type="button" data-diploma-legend="albatr" aria-label="Legendární postavička Albatros mořeplavec je tvoje: vybrat jako profilový obrázek"/);
    assert.doesNotMatch(earned, /grayscale|data-diploma-legend-info/);
    // Bez obrázku (h.avatar) nic
    const plain = { topicIcon: h.topicIcon, styleOf: h.styleOf };
    assert.doesNotMatch(Rewards.diplomaDialogHtml({ topic, title: 'Mistr zeměpisu', earned: false, known: 0, needed: 300, missing: 300 }, {}, plain), /data-diploma-legend/);
    assert.doesNotMatch(Rewards.diplomaDialogHtml({ topic, title: 'Mistr zeměpisu', earned: true, day: '2026-11-01', known: 300, needed: 300, missing: 0 }, {}, plain), /data-diploma-legend/);
    assert.match(Rewards.diplomasHtml([{ topic, title: 'Mistr zeměpisu', earned: false, missing: 300 }], h), /dostaneš diplom, který můžeš sdílet, a legendární postavičku/);
});
