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
const CHARACTERS = Look.AVATARS.filter(item => item.parts && !item.robot);
// Odměny, které postavičky nahradily (dřívější emoji v look.js): emoji → [id, odemčení]
const REPLACED = {
    '🦅': ['cervik', { level: 3 }], '🐺': ['axolot', { level: 8 }], '🦈': ['kaktus', { level: 13 }], '🐉': ['drak', { level: 20 }], '🦖': ['mamut', { level: 28 }],
    '🦚': ['meduza', { level: 36 }], '🦩': ['lenoch', { level: 44 }], '🐅': ['tukan', { level: 55 }], '🦁': ['lev', { level: 65 }], '👑': ['fenix', { level: 80 }],
    '🏅': ['krecek', { badge: 'turnaj-ucast' }], '🥉': ['rytir', { badge: 'turnaj-bronz' }], '🥈': ['narval', { badge: 'turnaj-stribro' }], '🏆': ['zelva', { badge: 'turnaj-zlato' }],
    '⏱️': ['hodiny', { badge: 'kviz-tyden' }], '💯': ['chamel', { badge: 'kviz-perfekt' }], '⚡': ['gepard', { badge: 'bleskovka-16' }], '🐻': ['zelvus', { badge: 'preziti-20' }], '🗺️': ['tucnak', { badge: 'mapa-25' }],
    '🎯': ['zabak', { badge: 'odhad-25' }], '🧩': ['myval', { badge: 'serad-25' }]
};

test('katalog: postavičky s 1–2 částmi (21 místo emoji odměn, 84 dalších, 12 sezónních, 14 legendárních), id do 6 písmen, žádná odměna už není emoji', () => {
    assert.equal(CHARACTERS.length, Look.AVATARS.length - Look.ROBOT_AVATARS.length);
    assert.equal(Look.AVATARS.filter(item => item.was).length, 21);
    assert.equal(Look.AVATARS.filter(item => item.source === 'season').length, 12);
    assert.equal(CHARACTERS.filter(item => !item.diploma && !item.exclusive).length, 21 + 84);
    assert.equal(Look.NEW_AVATARS.length, 84);
    assert.equal(CHARACTERS.filter(item => item.diploma).length, 14);
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

test('sezónní postavičky: jedna za každý měsíc jen ze Sezónní truhly, úrovní, odznakem ani Truhlou Mudrlanta ne; ve výběru vlastněné a zašedlá postavička běžící Sezóny', () => {
    const Rewards = require('../rewards.js');
    const SEASONAL = Look.SEASON_AVATARS;
    assert.deepEqual(SEASONAL.map(item => item.id), ['ramp', 'kobliz', 'snezen', 'kapka', 'pampel', 'vysved', 'meloun', 'hvezda', 'aktovk', 'drakpa', 'caj', 'pernik']);
    assert.deepEqual(SEASONAL.map(item => item.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const item of SEASONAL) {
        assert.equal(Look.find('avatars', item.id), item, `${item.id} v katalogu postaviček`);
        assert.deepEqual([item.exclusive, item.source, item.level, item.badge, item.was], [true, 'season', undefined, undefined, undefined], item.id);
        assert.equal(item.parts.length, 2, item.id);
        // Sezónní truhla svého měsíce ji dá; nic jiného ji neodemkne
        assert.equal(Look.SEASON_BUNDLES[String(item.month).padStart(2, '0')].character, item.id);
        assert.ok(Look.seasonBundle(item.month).some(entry => entry.category === 'avatars' && entry.item === item), item.id);
        assert.equal(Look.isUnlocked(item, { level: 100, badges: core.BADGE_BY_ID, gifts: null }), false, `${item.id}: ani úroveň 100 a všechny odznaky`);
        assert.equal(Look.isUnlocked(item, { level: 1, badges: {}, gifts: { avatars: [item.id] } }), true, `${item.id}: ze Sezónní truhly`);
        assert.equal(Look.unlockText(item), `Sezóna Mudrlanta (${Look.SEASON_MONTHS[item.month - 1].toLocaleLowerCase('cs')}, Sezónní truhla na 20. stupni)`);
        // Zápis se vejde do databáze (1–8 znaků) a uloží se přes social.js
        assert.ok(Look.formatAvatar(item.id, [9, 9]).length <= 8, item.id);
        assert.deepEqual(Look.avatarPicture(`${item.id}12`).layers, [`icons/avatars/${item.id}-11.webp`, `icons/avatars/${item.id}-22.webp`]);
    }
    // Žádná oslava úrovně ani odměna za odznak, Truhla Mudrlanta je nedá ani jako vzácnost
    assert.ok(Look.newRewards(0, 100, Object.keys(core.BADGE_BY_ID)).every(entry => !entry.item.exclusive));
    assert.ok(Array.from({ length: 100 }, (_, i) => Look.rewardsAtLevel(i + 1)).flat().every(entry => entry.category !== 'avatars' || !entry.item.exclusive));
    assert.ok(Rewards.candidates(Rewards.empty(), { level: 1, badges: {} }).every(entry => entry.category !== 'avatars' || (entry.item.chest && !entry.item.exclusive)));
    assert.ok(Rewards.rareCandidates(Rewards.empty()).every(entry => entry.category !== 'avatars' || (entry.item.rare && !entry.item.exclusive)));
    // Dárek ze Sezónní truhly se uloží v odměnách (i postavička), neznámé id ne
    assert.deepEqual(Rewards.parse({ gifts: { avatars: ['caj', 'neznamy', 'drakpa'] } }).gifts.avatars, ['caj', 'drakpa']);
    // Uložení do profilu (social.js): sezónní postavička s barvami projde, dlouhé id 'drakpa' se nesplete s 'drak'
    globalThis.MudrlantLook = Look;
    try {
        assert.equal(Social.cleanAvatar('drakpa99'), 'drakpa99');
        assert.equal(Social.cleanAvatar('caj07'), 'caj07');
        assert.equal(Social.cleanAvatar('drak3'), 'drak3');
        assert.equal(Social.cleanAvatar('drakpa123'), '🦊');
    } finally { delete globalThis.MudrlantLook; }
    assert.equal(Look.parseAvatar('drakpa3').item.id, 'drakpa');
    // Výběr obrázku v Nastavení ukazuje sezónní postavičky vlastněné (nebo uloženou v profilu) a postavičku běžící Sezóny zašedlou
    // s textem „Získáš v Sezóně Mudrlanta (20. stupeň)“ (blok 32; ostatní měsíce skryté, jako sezónní rámečky)
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(app, /group === 'postavicky'\) return Look \? Look\.AVATARS\.filter\(item => !item\.diploma && !item\.robot && \(!item\.exclusive \|\| item\.month === seasonMonth \|\| Look\.isUnlocked\(item, lookContext\(\)\)/);
    assert.match(app, /Získáš v Sezóně Mudrlanta \(\$\{item\.seasonTier \|\| \(Season \? Season\.BUNDLE_TIER : 20\)\}\. stupeň\)/);
    // Zdroje obrázků jsou v branding/ikony (scripts/avatar-icons.py)
    for (const item of SEASONAL) assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ikony', `avatar-${item.id}.png`)), item.id);
});

// Legendární postavičky za diplomy témat (docs/OBRAZKY.md č. 119–132): téma → id
const LEGENDARY = {
    zemepis: 'albatr', vlajky: 'gryf', historie: 'slon', mytologie: 'sfinga', biologie: 'jelen', geologie: 'golem', chemie: 'liska',
    fyzika: 'chobot', umeni: 'pav', architektura: 'bobr', hudba: 'vlk', literatura: 'kndrak', film: 'panda', sport: 'klokan'
};
// Témata s diplomem, jejichž legendární postavička se teprve kreslí (docs/OBRAZKY.md č. 511 Mravenec konstruktér): do dodání obrázku bez ní
const PENDING_LEGENDARY = ['technika'];

test('legendární postavičky: jedna za diplom každého tématu, odemyká je jen diplom (ne úroveň, odznak, truhla ani Sezóna)', () => {
    const Rewards = require('../rewards.js');
    const Album = require('../album.js');
    const legendary = Look.AVATARS.filter(item => item.diploma);
    assert.deepEqual(Object.fromEntries(legendary.map(item => [item.diploma, item.id])), LEGENDARY);
    assert.deepEqual(Object.keys(LEGENDARY).sort(), Object.keys(Rewards.DIPLOMA_NAMES).filter(topic => !PENDING_LEGENDARY.includes(topic)).sort(), 'každé téma s diplomem má svou (kromě čekajících na obrázek)');
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

// Další postavičky (docs/OBRAZKY.md oddíly 26, 32 a 33, č. 317–408): id → jak se odemkne
const NEW = {
    vacice: { level: 10 }, spisov: { level: 17 }, pstros: { badge: 'tema-sport-25' }, koala: { badge: 'bleskovka-12' }, toust: { badge: 'dnes-50' },
    krokod: { badge: 'chyby-50' }, brokol: { badge: 'tydenni-cile-5' }, netopy: { badge: 'detektiv-7' }, plamak: { badge: 'kviz-perfekt-5' }, vajko: { badge: 'sazkar' },
    pizza: { badge: 'vyhry-5' }, jezek: { badge: 'sberatel-50', album: true }, zirafa: { level: 31 }, vydra: { badge: 'preziti-35' }, hroch: { badge: 'tezke-50' },
    lama: { badge: 'tema-hudba-100' }, pavouk: { badge: 'retezovka-10' }, krava: { badge: 'dobyvatel-3' }, velbl: { badge: 'boss-kapitan' },
    kapyba: { chest: 15 }, zmrzl: { rare: true }, kosatk: { referral: ['pritel-3'] }, avokad: { prestige: 1 },
    // č. 341–357 (krab kadeřník č. 339 chybí): strašidelné postavičky hlavně za Řetězovku, Bosse týdne, témata a truhlu
    ponozk: { badge: 'vsestrannost-3' }, mrak: { badge: 'odhad-5' }, priser: { level: 14 }, zombie: { badge: 'poznane-100' }, kohout: { badge: 'kviz-serie-14' },
    kostli: { badge: 'tema-biologie-100' }, havran: { badge: 'tema-literatura-100' }, holub: { badge: 'sazky-v-rade-3' }, medoj: { badge: 'vyzvy-25' },
    buldok: { badge: 'turnaj-semifinale' }, nosoro: { badge: 'vyhry-v-rade-5' }, duch: { badge: 'retezovka-30' }, mumie: { badge: 'tema-historie-600' },
    kocka: { badge: 'boss-alchymista' }, vlkodl: { badge: 'boss-druid' }, krysa: { badge: 'zlatokop-50' }, dynak: { chest: 25 },
    // č. 379–408 (absurdní): módy, úrovně, odznaky, Řetězovka, Dobývání, Boss týdne, truhla, vzácný dárek, pozvánky a druhá prestiž
    kafe: { level: 6 }, holubz: { badge: 'mapa-5' }, kachna: { badge: 'serad-5' }, slepic: { badge: 'zalozene-1' }, nuget: { badge: 'rada-5' },
    kaktik: { referral: ['novacek', 'pritel-1'] }, husa: { badge: 'turnaj-postupy-1' }, tousto: { level: 22 }, racek: { badge: 'kviz-dne-10' },
    sandal: { badge: 'tema-zemepis-100' }, aligat: { badge: 'tema-geologie-100' }, zralok: { badge: 'tema-film-100' }, snob: { badge: 'tema-umeni-100' },
    rohlik: { level: 33 }, komar: { badge: 'psani-100' }, trpas: { badge: 'bez-napovedy-100' }, tchyne: { badge: 'retezovka-cela-5' }, kuryr: { level: 45 },
    kocov: { badge: 'serie-60' }, gauc: { badge: 'dny-100' }, podnaj: { badge: 'dobyvatel-25' }, upir: { badge: 'boss-reziser' }, plivak: { badge: 'boss-rytir' },
    bricho: { badge: 'boss-olympan' }, papous: { badge: 'boss-maestro' }, syr: { badge: 'vsechna-temata-1' }, prd: { chest: 30 }, jednor: { rare: true },
    kure: { referral: ['pritel-10'] }, smrtka: { prestige: 2 }, brokik: { badge: 'tema-chemie-100' }, zampio: { badge: 'boss-amper' }, chrest: { badge: 'tema-mytologie-100' }, celerb: { badge: 'hvezdy-2' }, candid: { badge: 'uroven-20' }, hrozny: { badge: 'tema-fyzika-100' }, sob: { badge: 'odpovedi-500' }, cocka: { badge: 'tema-vlajky-100' }, pazitk: { badge: 'dokonale-7' }, brusin: { badge: 'zbehly-mytologie-5' }, pivonk: { badge: 'zbehly-biologie-5' }, kaprad: { badge: 'zbehly-zemepis-5' }, husita: { badge: 'zbehly-historie-5' }, hermel: { badge: 'perfektni-vyzvy-5' }
};
// Zdrojový obrázek branding/ikony/avatar-<název>.png
const NEW_SRC = {
    vacice: 'vacice-goth', spisov: 'myval-spisovatel', pstros: 'pstros-fotbalista', koala: 'koala-ninja', toust: 'toust-surfar', krokod: 'krokodyl-zubar',
    brokol: 'brokolice-kulturistka', netopy: 'netopyr-jeskynar', plamak: 'plamenak-tanecnik', vajko: 'vajicko-kaskader', pizza: 'pizza-hrdina', jezek: 'jezek-krejci',
    zirafa: 'zirafa-sala', vydra: 'vydra-plavkyne', hroch: 'hroch-potapec', lama: 'lama-rocker', pavouk: 'pavouk-pletar', krava: 'krava-kovbojka',
    velbl: 'velbloud-cestovatel', kapyba: 'kapybara-lazne', zmrzl: 'zmrzlina', kosatk: 'kosatka-komornik', avokad: 'avokado-jogin',
    ponozk: 'ponozka', mrak: 'mrak-destnik', priser: 'priserka-pod-posteli', zombie: 'zombie-kralik', kohout: 'kohout-pankac', kostli: 'kostlivec-mleko',
    havran: 'havran-hrobnik', holub: 'holub-z-ulice', medoj: 'medojed-rvac', buldok: 'buldok-motorkar', nosoro: 'nosorozec-vyhazovac', duch: 'duch-lucerna',
    mumie: 'mumie', kocka: 'cerna-kocka', vlkodl: 'vlkodlak', krysa: 'krysa-piratka', dynak: 'dynovy-strasak',
    kafe: 'krecek-kafe', holubz: 'holub-zachod', kachna: 'dement-kachna', slepic: 'slepice-tinder', nuget: 'nugetka-utek', kaktik: 'kaktus-objeti',
    husa: 'husa-vytrznice', tousto: 'toustovac-krize', racek: 'zebrak-racek', sandal: 'ponozka-sandal', aligat: 'aligator-kanal', zralok: 'zralok-vegan',
    snob: 'snob-kocka', rohlik: 'nasrany-rohlik', komar: 'komar-upir', trpas: 'zlobivy-trpaslik', tchyne: 'tchyne-nuzky', kuryr: 'lenochod-dodavka',
    kocov: 'opilec-kost', gauc: 'brambora-gauc', podnaj: 'bezdomovec-pavouk', upir: 'upir-vegetarian', plivak: 'hulvat-velbloud', bricho: 'pivni-bricho',
    papous: 'drzy-papousek', syr: 'syr-slechtic', prd: 'prd-v-lahvi', jednor: 'jednorozec-mrzout', kure: 'influencer-kure', smrtka: 'smrtka-dovolena', brokik: 'brokolik', zampio: 'zampion', chrest: 'chrestys', celerb: 'celerbrita', candid: 'candidat', hrozny: 'hroznys', sob: 'sob', cocka: 'cocka', pazitk: 'pazitka', brusin: 'brusinka', pivonk: 'pivonka', kaprad: 'kapradi', husita: 'husita', hermel: 'hermelin'
};

test('další postavičky: odměny z různých částí hry, odznaky existují, první tři snadno, server je zná', () => {
    const Rewards = require('../rewards.js');
    const Gold = require('../gold.js');
    const Album = require('../album.js');
    assert.deepEqual(Look.NEW_AVATARS.map(item => item.id), Object.keys(NEW));
    const none = { level: 1, badges: {}, gifts: null, diplomas: {}, referral: [], prestige: 0 };
    const all = { level: 100, badges: Object.fromEntries(core.BADGES.map(badge => [badge.id, '2026-11-01'])), gifts: null, diplomas: {}, referral: [], prestige: 0 };
    const groups = {};
    for (const item of Look.NEW_AVATARS) {
        const rule = NEW[item.id];
        assert.equal(Look.find('avatars', item.id), item, item.id);
        assert.deepEqual(Object.fromEntries(Object.keys(rule).map(key => [key, item[key]])), rule, item.id);
        assert.equal(item.was, undefined, `${item.id} nenahrazuje emoji`);
        assert.ok(fs.existsSync(path.join(ROOT, 'branding', 'ikony', `avatar-${NEW_SRC[item.id]}.png`)), item.id);
        assert.equal(Look.isUnlocked(item, none), false, `${item.id} není zdarma`);
        assert.equal(Album.isStarter(item), false, item.id);
        assert.ok(Look.formatAvatar(item.id, [9, 9]).length <= 8, item.id);
        if (rule.level) {
            assert.equal(Look.isUnlocked(item, { ...none, level: rule.level - 1 }), false, item.id);
            assert.equal(Look.isUnlocked(item, { ...none, level: rule.level }), true, item.id);
            assert.deepEqual(Look.newRewards(rule.level - 1, rule.level).filter(entry => entry.item === item).length, 1, `${item.id}: oslava nové odměny`);
            assert.equal(Look.unlockText(item), `Úroveň ${rule.level}`);
        } else if (rule.badge) {
            const badge = core.BADGE_BY_ID[rule.badge];
            assert.ok(badge, `${item.id}: odznak ${rule.badge} existuje`);
            (groups[badge.group] = groups[badge.group] || []).push(item.id);
            assert.equal(Look.isUnlocked(item, { ...none, badges: { [rule.badge]: '2026-11-01' } }), true, item.id);
            assert.equal(Look.isUnlocked(item, { ...all, badges: {} }), false, `${item.id}: úroveň nestačí`);
            assert.ok(Look.rewardsForBadge(rule.badge).some(entry => entry.item === item), item.id);
            assert.match(Look.badgeRewardText(rule.badge), new RegExp(`${item.title} \\(profilový obrázek\\)`));
            assert.ok(Look.newRewards(5, 5, [rule.badge]).some(entry => entry.item === item), `${item.id}: oslava za odznak`);
        } else {
            // Truhla, pozvaní kamarádi a prestiž: úroveň 100 a všechny odznaky nestačí
            assert.equal(Look.isUnlocked(item, all), false, item.id);
        }
    }
    // Odznaky z různých částí hry (každá postavička jinou skupinou), první tři snadno: do úrovně 20 nebo první stupeň snadného odznaku
    // Dvakrát jen Řetězovka dne (Pavouk pletař za 10, Duch s lucernou za 30 dohraných dní, jak plánoval oddíl 26) a Dobývání (Kráva kovbojka
    // za 3, Pavouk podnájemník za 25 vyhraných her)
    const twice = { retezovka: ['pavouk', 'duch'], dobyvatel: ['krava', 'podnaj'] };
    for (const [group, ids] of Object.entries(groups)) assert.deepEqual(ids, twice[group] || [ids[0]], `každá za jinou skupinu odznaků: ${group}`);
    for (const id of ['vacice', 'spisov', 'pstros', 'ponozk', 'mrak', 'priser', 'kafe', 'holubz', 'kachna']) {
        const item = Look.find('avatars', id);
        assert.ok(item.level ? item.level <= 20 : core.BADGE_GROUPS.find(group => group.id === core.BADGE_BY_ID[item.badge].group).badges[0].id === item.badge, id);
    }
    // Kapybara a Dýňový strašák: jen z Truhly Mudrlanta (i stupně Sezóny) a Zlaté truhly; Zmrzlina vzácně; dar je odemkne
    const kapyba = Look.find('avatars', 'kapyba');
    const dynak = Look.find('avatars', 'dynak');
    const zmrzl = Look.find('avatars', 'zmrzl');
    assert.equal(Look.unlockText(kapyba), 'Z Truhly Mudrlanta');
    assert.equal(Look.unlockText(zmrzl), 'Vzácný dárek z Truhly Mudrlanta');
    assert.equal(Look.unlockText(dynak), 'Z Truhly Mudrlanta');
    assert.deepEqual(Rewards.candidates(Rewards.empty(), { level: 1, badges: {} }).filter(entry => entry.category === 'avatars').map(entry => entry.item.id).sort(), ['dynak', 'kapyba', 'prd'], 'postavičky za úroveň truhla nedá');
    assert.ok(!Rewards.candidates({ gifts: { avatars: ['kapyba'] } }, { level: 1, badges: {} }).some(entry => entry.item === kapyba), 'jen jednou');
    assert.deepEqual(Rewards.rareCandidates(Rewards.empty()).filter(entry => entry.category === 'avatars').map(entry => entry.item.id), ['zmrzl', 'jednor']);
    assert.ok(['kapyba', 'zmrzl', 'dynak', 'prd', 'jednor'].every(id => Gold.chestCandidates(Rewards.empty()).some(entry => entry.category === 'avatars' && entry.item.id === id)), 'Zlatá truhla');
    assert.equal(Look.isUnlocked(kapyba, { ...none, gifts: { avatars: ['kapyba'] } }), true);
    assert.equal(Look.isUnlocked(dynak, { ...none, gifts: { avatars: ['dynak'] } }), true);
    assert.match(Rewards.previewHtml({ category: 'avatars', item: kapyba }), /src="icons\/avatars\/kapyba\.webp"/);
    // Pozvaní kamarádi a prestiž (bonus: album je ukáže, jen když je hráč má)
    const kosatk = Look.find('avatars', 'kosatk');
    const avokad = Look.find('avatars', 'avokad');
    assert.equal(Look.isUnlocked(kosatk, { ...none, referral: ['pritel-1'] }), false);
    assert.equal(Look.isUnlocked(kosatk, { ...none, referral: ['pritel-1', 'pritel-3'] }), true);
    assert.equal(Look.unlockText(kosatk), 'Pozvi 3 kamarády (Soupeři → Přátelé → Pozvi kamarády)');
    assert.equal(Look.isUnlocked(avokad, { ...none, prestige: 1 }), true);
    assert.equal(Look.unlockText(avokad), 'Prestiž po úrovni 100 (Postup → Úrovně a tituly)');
    const Referral = require('../referral.js');
    assert.equal(Referral.REWARDS['pritel-3'].avatar, 'kosatk');
    assert.match(Referral.REWARDS['pritel-3'].text, /postavička Kosatka komorník/);
    // Absurdní: Kaktus, který chce obejmout, za pozvánku (jako rámeček Přátelský), Kuře influencer za 10 kamarádů, Smrtka na dovolené za druhou prestiž
    const kaktik = Look.find('avatars', 'kaktik');
    const kure = Look.find('avatars', 'kure');
    const smrtka = Look.find('avatars', 'smrtka');
    assert.ok([kaktik, kure, smrtka].every(item => item.bonus), 'album je ukáže, jen když je hráč má');
    assert.equal(Look.isUnlocked(kaktik, { ...none, referral: ['novacek'] }), true);
    assert.equal(Look.unlockText(kaktik), 'Pozvi kamaráda, nebo přijď na jeho pozvánku (Soupeři → Přátelé → Pozvi kamarády)');
    assert.equal(Look.isUnlocked(kure, { ...none, referral: ['pritel-1', 'pritel-3'] }), false);
    assert.equal(Look.isUnlocked(kure, { ...none, referral: ['pritel-10'] }), true);
    assert.equal(Look.unlockText(kure), 'Pozvi 10 kamarádů (Soupeři → Přátelé → Pozvi kamarády)');
    assert.equal(Look.isUnlocked(smrtka, { ...none, prestige: 1 }), false);
    assert.equal(Look.isUnlocked(smrtka, { ...none, prestige: 2 }), true);
    assert.equal(Look.unlockText(smrtka), '2. prestiž po úrovni 100 (Postup → Úrovně a tituly)');
    assert.match(Referral.REWARDS.novacek.text, /postavička Kaktus, který chce obejmout/);
    assert.match(Referral.REWARDS['pritel-1'].text, /postavička Kaktus, který chce obejmout/);
    assert.match(Referral.REWARDS['pritel-10'].text, /postavička Kuře influencer/);
    // Prd v láhvi jen z truhly, Jednorožec mrzout jako vzácný dárek
    assert.equal(Look.unlockText(Look.find('avatars', 'prd')), 'Z Truhly Mudrlanta');
    assert.equal(Look.unlockText(Look.find('avatars', 'jednor')), 'Vzácný dárek z Truhly Mudrlanta');
    // Uložení do profilu (social.js) a server (blok 35 ve schema.sql, celý katalog porovnává tests/motivace.test.js)
    globalThis.MudrlantLook = Look;
    try {
        for (const id of Object.keys(NEW)) assert.equal(Social.cleanAvatar(`${id}9`), `${id}9`, id);
        assert.equal(Social.cleanAvatar('kosatk12'), '🦊', 'kosatka má jen jednu část');
    } finally { delete globalThis.MudrlantLook; }
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    for (const id of Object.keys(NEW)) assert.match(sql, new RegExp(`\\('avatars', '${id}', '`), id);
    // Výběr obrázku: zamčená postavička řekne, jak se odemkne (odznak s popisem, úroveň, jinak text katalogu), štítek podle druhu
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(app, /item\.chest \|\| item\.rare \? pillIcon\('sparkles'\) : item\.referral \? pillIcon\('user-plus'\) : item\.prestige \? pillIcon\('star'\)/);
    // Zdrojové obrázky a skript vrstev (scripts/avatar-icons.py) je znají
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'avatar-icons.py'), 'utf8');
    for (const item of Look.NEW_AVATARS) {
        assert.match(script, new RegExp(`'${item.id}': \\{'src': '`), item.id);
        for (const part of item.parts) assert.ok(script.includes(`'title': '${part}'`), `${item.id}: ${part}`);
    }
});

test('robotí postavičky: 26 robotů a oba Robosovy, jedna část Plátování, id z písmen, obrázky a barvy podle vrstev, odemykají se jen darem', () => {
    const robots = Look.ROBOT_AVATARS;
    assert.equal(robots.length, 28);
    assert.equal(robots.filter(item => item.robotAll).length, 2);
    for (const item of robots) {
        assert.match(item.id, /^[a-z]{1,6}$/, item.id);
        assert.deepEqual(item.parts, ['Plátování']);
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'avatars', `${item.id}.webp`)), `${item.id}.webp`);
        for (const color of item.colors[0]) assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'avatars', `${item.id}-1${color}.webp`)), `${item.id}-1${color}.webp`);
        assert.equal(Look.isUnlocked(item, { level: 100, badges: {}, gifts: null }), false, `${item.id} jen darem`);
        assert.equal(Look.isUnlocked(item, { level: 1, badges: {}, gifts: { avatars: [item.id] } }), true);
        assert.equal(Look.avatarCode(`${item.id}${item.colors[0][0]}`), `${item.id}${item.colors[0][0]}`);
    }
});
