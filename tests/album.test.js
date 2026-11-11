// Album sbírky (album.js): sekce z katalogů (i budoucí věci), počítání owned/total (bez věcí od začátku a odměn alba samotného),
// časově omezené věci (aktivní chybí, skončené se nepočítají, budoucí skryté), celková procenta jako průměr sekcí, milníky Sběratel
// a celé sekce (quiz-core), paměť výpočtu, HTML bez inline stylů a napojení (index.html, service worker, nasazení, Tailwind, schéma).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Album = require('../album.js');
const Look = require('../look.js');
const Core = require('../quiz-core.js');
require('../look-frames.js');

const ROOT = path.join(__dirname, '..');
const TOPICS = ['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport'].map(id => ({ id, title: id }));
const TODAY = '2026-11-10';
const input = (extra = {}) => ({ level: 1, badges: {}, gifts: {}, diplomas: {}, topics: TOPICS, today: TODAY, ...extra });
const sectionOf = (album, id) => album.sections.find(section => section.id === id);
// Všechny odznaky kromě odznaků alba (ty si album dopočítá samo)
const allBadges = () => Object.fromEntries(Core.BADGES.filter(badge => !Core.isAlbumBadge(badge.id)).map(badge => [badge.id, '2026-11-01']));
// Dočasně přidané položky katalogu (jako sezónní permanentka jiného modulu); po testu se vrátí
const withItems = (category, items, run) => {
    const list = Look.CATALOG[category];
    list.push(...items);
    try { return run(); } finally { items.forEach(item => list.splice(list.indexOf(item), 1)); }
};

test('sekce v pořadí a počty z katalogu: věci od začátku se nepočítají, odměna alba se ukáže, ale nepočítá', () => {
    const album = Album.build(input());
    assert.deepEqual(album.sections.map(section => section.id), ['avatars', 'accessories', 'frames', 'themes', 'robes', 'colors', 'badges', 'diplomas']);
    const keys = (id) => sectionOf(album, id).entries.map(entry => entry.id);
    assert.ok(!keys('themes').includes('vinova') && !keys('robes').includes('vinova') && !keys('frames').includes('zadny'), 'vínová a Bez rámečku má každý');
    assert.equal(sectionOf(album, 'themes').total, Look.THEMES.length - 1);
    assert.equal(sectionOf(album, 'robes').total, Look.ROBES.length - 1);
    assert.equal(sectionOf(album, 'avatars').total, Look.AVATARS.length);
    assert.equal(sectionOf(album, 'accessories').total, Look.ACCESSORIES.length);
    assert.equal(sectionOf(album, 'colors').total, Look.CATALOG.colors.length);
    const reward = sectionOf(album, 'frames').entries.find(entry => entry.id === 'sberatel');
    assert.equal(reward.state, 'reward');
    assert.equal(reward.counted, false);
    assert.equal(sectionOf(album, 'frames').total, Look.FRAMES.length - 2, 'bez „Bez rámečku“ a bez rámečku za album');
    // Odznaky po skupinách, počítá se každý stupeň; odznaky alba v sekci nejsou
    const badges = sectionOf(album, 'badges');
    assert.equal(badges.total, Core.BADGES.filter(badge => !Core.isAlbumBadge(badge.id)).length);
    assert.ok(badges.entries.every(entry => !Core.isAlbumBadge(entry.group.badges[0].id)));
    assert.equal(badges.entries.reduce((sum, entry) => sum + entry.size, 0), badges.total);
    assert.equal(sectionOf(album, 'diplomas').total, 14);
    assert.equal(album.percent, 0);
    assert.equal(album.owned, 0);
});

test('vlastnictví: úroveň, odznak, věc z truhly a diplom', () => {
    const level = 20;
    const album = Album.build(input({ level, badges: { vitez: '2026-11-01', 'prvni-krok': '2026-11-01' }, gifts: { themes: ['zlata'], accessories: ['koruna'] }, diplomas: { zemepis: '2026-11-02' } }));
    const avatars = sectionOf(album, 'avatars');
    assert.equal(avatars.owned, Look.AVATARS.filter(item => !item.badge && item.level <= level).length);
    const accessories = sectionOf(album, 'accessories');
    const expected = Look.ACCESSORIES.filter(item => (!item.badge && item.level <= level) || item.badge === 'vitez' || item.id === 'koruna').length;
    assert.equal(accessories.owned, expected, 'úroveň, Vavřínový věnec za Vítěze a Koruna z truhly');
    assert.ok(sectionOf(album, 'themes').entries.find(entry => entry.id === 'zlata').owned, 'téma z truhly');
    assert.ok(sectionOf(album, 'frames').entries.find(entry => entry.id === 'vavrin').owned, 'rámeček za odznak');
    assert.equal(sectionOf(album, 'badges').owned, 2);
    const odpovedi = sectionOf(album, 'badges').entries.find(entry => entry.id === 'odpovedi');
    assert.deepEqual([odpovedi.have, odpovedi.top.id, odpovedi.complete], [1, 'prvni-krok', false]);
    assert.equal(sectionOf(album, 'diplomas').owned, 1);
    // Celková procenta = průměr procent sekcí (zaokrouhleno dolů)
    const ratios = album.sections.filter(section => section.total).map(section => section.owned / section.total);
    assert.equal(album.percent, Math.floor(ratios.reduce((a, b) => a + b, 0) / ratios.length * 100 + 1e-9));
    assert.ok(album.percent > 0 && album.percent < 100);
});

test('100 % je opravdu všechno: celé album, každá sekce kompletní; odznaky alba ani rámeček za album nejsou potřeba', () => {
    const full = input({ level: 100, badges: allBadges(), diplomas: Object.fromEntries(TOPICS.map(topic => [topic.id, '2026-11-01'])) });
    const album = Album.build(full);
    assert.equal(album.percent, 100);
    assert.deepEqual(album.complete, album.sections.map(section => section.id));
    assert.equal(sectionOf(album, 'frames').entries.find(entry => entry.id === 'sberatel').state, 'reward', 'rámeček za album přijde až s odznakem 100 %');
    // Chybí jediný diplom: už ne 100 %
    const diplomas = { ...full.diplomas };
    delete diplomas.sport;
    assert.equal(Album.build({ ...full, diplomas }).percent, 99, 'průměr sekcí: 7 × 100 % a 13/14 diplomů');
    assert.ok(!Album.build({ ...full, diplomas }).complete.includes('diplomas'));
});

test('časově omezené věci: aktivní chybí, skončené se nepočítají („Sezónní – už nejde získat“), budoucí jsou skryté', () => {
    const active = { id: 'test-zima', title: 'Zimní', exclusive: true, season: { id: 'zima', from: '2026-11-01', until: '2026-12-31' }, badge: 'test-nic' };
    const ended = { id: 'test-leto', title: 'Letní', season: 'leto-2026', until: '2026-08-31', badge: 'vitez' };
    const upcoming = { id: 'test-jaro', title: 'Jarní', exclusive: true, from: '2027-03-01', until: '2027-05-31', badge: 'test-nic' };
    const league = { id: 'test-liga', title: 'Ligový', league: 'zlato', available: false, badge: 'test-nic' };
    const base = sectionOf(Album.build(input()), 'frames').total;
    const baseWinner = sectionOf(Album.build(input({ badges: { vitez: 'x' } })), 'frames').owned;
    withItems('frames', [active, ended, upcoming, league], () => {
        assert.equal(Album.availability(active, 'frames', TODAY), 'active');
        assert.equal(Album.availability(ended, 'frames', TODAY), 'ended');
        assert.equal(Album.availability(upcoming, 'frames', TODAY), 'upcoming');
        assert.equal(Album.availability(league, 'frames', TODAY), 'ended');
        assert.equal(Album.availability(Look.find('frames', 'bronz'), 'frames', TODAY), 'always');
        const frames = sectionOf(Album.build(input()), 'frames');
        const state = (id) => (frames.entries.find(entry => entry.id === id) || {}).state;
        assert.equal(state('test-zima'), 'missing', 'jde získat: chybí a počítá se');
        assert.equal(state('test-leto'), 'ended');
        assert.equal(state('test-liga'), 'ended');
        assert.equal(state('test-jaro'), undefined, 'budoucí se neukazuje');
        assert.equal(frames.total, base + 1, 'skončené ani budoucí se nepočítají');
        assert.equal(frames.ended, 2);
        const endedEntry = frames.entries.find(entry => entry.id === 'test-leto');
        assert.match(Album.howText(endedEntry), /^Sezónní – už nejde získat/);
        assert.match(Album.howText(frames.entries.find(entry => entry.id === 'test-zima')), /Sezónní věc, jde získat do 31\. 12\. 2026/);
        // Skončená věc, kterou hráč má (tady za odznak), se počítá
        const owned = sectionOf(Album.build(input({ badges: { vitez: 'x' } })), 'frames');
        assert.equal(owned.entries.find(entry => entry.id === 'test-leto').state, 'owned');
        assert.equal(owned.total, base + 2);
        assert.equal(owned.owned, baseWinner + 1);
        // Vlastní pravidlo modulu sezóny má přednost před daty
        Album.setAvailability((item) => (item.id === 'test-jaro' ? 'active' : null));
        try {
            assert.equal(sectionOf(Album.build(input()), 'frames').entries.find(entry => entry.id === 'test-jaro').state, 'missing');
        } finally { Album.setAvailability(null); }
        assert.equal(sectionOf(Album.build(input()), 'frames').entries.find(entry => entry.id === 'test-jaro'), undefined);
    });
    // Po skončení sezóny se procenta nesníží: chybějící skončená věc z celkového počtu zmizí
    withItems('frames', [ended], () => {
        assert.equal(sectionOf(Album.build(input({ level: 100, badges: allBadges() })), 'frames').complete, true);
    });
});

test('Bílý talár (noGift) je v albu běžný talár za úroveň 100, bez nabídky truhly', () => {
    const robe = Look.find('robes', 'bila');
    assert.ok(robe && robe.noGift && robe.level === 100);
    const missing = Album.findEntry(Album.build(input({ level: 99 })), 'robes:bila');
    assert.equal(missing.entry.state, 'missing');
    assert.equal(Album.howText(missing.entry), 'Od úrovně 100.');
    assert.match(Album.howText(Album.findEntry(Album.build(input({ level: 10 })), 'robes:zelena').entry), /Od úrovně \d+\.|Nebo dřív z Truhly/);
    assert.equal(Album.findEntry(Album.build(input({ level: 100 })), 'robes:bila').entry.state, 'owned');
    assert.equal(sectionOf(Album.build(input({ level: 100 })), 'robes').complete, true);
    assert.ok(Look.THEMES.length >= 16, 'všechna barevná témata');
    assert.equal(sectionOf(Album.build(input({ level: 100 })), 'themes').total, Look.THEMES.filter(item => !Album.isStarter(item)).length);
});

test('nové věci v katalogu i nový druh se v albu objeví samy (obecná sekce před odznaky)', () => {
    const robe = { id: 'test-bila', title: 'Bílý talár', level: 70 };
    const before = sectionOf(Album.build(input({ level: 80 })), 'robes');
    withItems('robes', [robe], () => {
        const robes = sectionOf(Album.build(input({ level: 80 })), 'robes');
        assert.equal(robes.total, before.total + 1);
        assert.equal(robes.owned, before.owned + 1);
    });
    Look.CATALOG.zkouska = [{ id: 'a', title: 'A', level: 5 }];
    try {
        const ids = Album.build(input({ level: 10 })).sections.map(section => section.id);
        assert.equal(ids[ids.indexOf('badges') - 1], 'zkouska');
        assert.equal(sectionOf(Album.build(input({ level: 10 })), 'zkouska').owned, 1);
    } finally { delete Look.CATALOG.zkouska; }
});

test('milníky a celé sekce: odznaky Sběratel z procent alba (quiz-core), každý jen jednou', () => {
    assert.deepEqual(Album.MILESTONES.map(entry => [entry.goal, entry.id]), [[25, 'sberatel-25'], [50, 'sberatel-50'], [75, 'sberatel-75'], [100, 'sberatel-100']]);
    for (const milestone of Album.MILESTONES) assert.ok(Core.BADGE_BY_ID[milestone.id], milestone.id);
    assert.equal(Album.nextMilestone(0).goal, 25);
    assert.equal(Album.nextMilestone(25).goal, 50);
    assert.equal(Album.nextMilestone(99).goal, 100);
    assert.equal(Album.nextMilestone(100), null);
    // Hráč na úrovni 100 bez odznaků: témata, taláry a barvy kompletní → přes 50 %, titul za barevná témata
    const top = input({ level: 100 });
    const context = Album.badgeContext(top);
    assert.ok(context.percent >= 50 && context.percent < 75, `procenta ${context.percent}`);
    assert.equal(context.sections.themes, 100);
    const due = Album.dueBadges(top);
    assert.deepEqual(due, ['sberatel-25', 'sberatel-50', 'album-themes']);
    // Už získané se znovu nehlásí (oslava jen jednou)
    assert.deepEqual(Album.dueBadges({ ...top, badges: { 'sberatel-25': '2026-11-01', 'sberatel-50': '2026-11-01', 'album-themes': '2026-11-01' } }), []);
    // Odznaky alba se do alba nepočítají: procenta se jimi nezmění
    assert.equal(Album.build({ ...top, badges: { 'sberatel-25': 'x', 'sberatel-50': 'x', 'album-themes': 'x' } }).percent, context.percent);
    // Stejné výsledky dává quiz-core přes x.album (cesta app.js: badgeContext → earnedBadgeIds)
    const earned = Core.earnedBadgeIds({}, { level: 100, learned: 0, topicStars: {}, topicCount: 14, album: context }).filter(id => Core.isAlbumBadge(id));
    assert.deepEqual(earned, due);
    assert.deepEqual(Core.earnedBadgeIds({}, { level: 1, topicStars: {}, topicCount: 14 }).filter(id => Core.isAlbumBadge(id)), [], 'bez alba nic');
    // Celé album: všechny milníky a všechny tituly za sekce
    const full = Album.dueBadges(input({ level: 100, badges: allBadges(), diplomas: Object.fromEntries(TOPICS.map(topic => [topic.id, 'x'])) }));
    assert.deepEqual(full, Core.BADGES.filter(badge => Core.isAlbumBadge(badge.id)).map(badge => badge.id));
    // Tituly jsou použitelné jako titul u jména (odznak z katalogu) a rámeček Sběratelský odemyká odznak 100 %
    assert.equal(Look.find('frames', 'sberatel').badge, 'sberatel-100');
    assert.equal(Look.isUnlocked(Look.find('frames', 'sberatel'), { level: 100, badges: { 'sberatel-100': 'x' } }), true);
    assert.equal(Look.normalize({ title: 'album-themes' }, { level: 1, badges: { 'album-themes': 'x' } }).title, 'album-themes');
    assert.match(Look.badgeRewardText('sberatel-100'), /Sběratelský \(rámeček\)/);
    assert.ok(Look.newRewards(50, 50, ['sberatel-100']).some(({ item }) => item.id === 'sberatel'), 'nový rámeček se oslaví s odznakem');
});

test('výpočet je levný: stejný vstup vrátí zapamatovaný výsledek, změna ho přepočítá', () => {
    const a = Album.build(input({ level: 30, badges: { vitez: 'x' } }));
    assert.equal(Album.build(input({ level: 30, badges: { vitez: 'x' } })), a);
    assert.notEqual(Album.build(input({ level: 31, badges: { vitez: 'x' } })), a);
    const started = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) Album.build(input({ level: 1 + (i % 100), badges: allBadges() }));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1500, `200 přepočtů za ${ms.toFixed(0)} ms`);
});

test('HTML alba: záložky sekcí, dlaždice všech věcí, podrobnosti s Nasadit, odměny alba; bez inline stylů', () => {
    const h = { medal: (badge, earned) => `<span data-medal="${badge.id}" data-earned="${earned}"></span>`, avatar: (id) => `<span data-avatar="${id}"></span>`,
        topicIcon: (topic) => `<span data-topic="${topic.id}"></span>`, styleOf: () => ({ soft: 'bg-emerald-50' }), frameClass: require('../look-frames.js').frameClass };
    const album = Album.build(input({ level: 30, badges: { vitez: 'x', 'sberatel-25': 'x' }, diplomas: { zemepis: 'x' } }));
    const all = album.sections.map(section => Album.albumHtml(album, { section: section.id, badges: { vitez: 'x', 'sberatel-25': 'x' }, worn: new Set(['frames:vavrin']) }, h)).join('');
    assert.doesNotMatch(all, /style=/);
    const avatars = Album.albumHtml(album, { section: 'avatars' }, h);
    assert.equal((avatars.match(/data-album-tab=/g) || []).length, 8);
    assert.equal((avatars.match(/data-album-item=/g) || []).length, sectionOf(album, 'avatars').entries.length);
    assert.match(avatars, /aria-selected="true"[^>]*>\s*<span[^>]*>Postavičky/);
    assert.match(avatars, /Za celou sekci titul „Celý zvěřinec“/);
    const frames = Album.albumHtml(album, { section: 'frames', worn: new Set(['frames:vavrin']) }, h);
    assert.match(frames, /class="relative flex [^"]* frame frame-vavrin"/, 'skutečná třída rámečku');
    assert.match(frames, /data-album-item="frames:vavrin" data-state="owned"[^>]*class="[^"]*ring-brand-600/, 'nasazený rámeček');
    assert.match(frames, /data-album-item="frames:sberatel" data-state="reward"/);
    assert.match(Album.albumHtml(album, { section: 'accessories' }, h), /icons\/doplnky\/bryle-ikona\.webp/);
    assert.match(Album.albumHtml(album, { section: 'badges' }, h), /data-medal="vitez" data-earned="true"/);
    // Podrobnosti: věc ve sbírce s Nasadit, chybějící s návodem, nasazená bez tlačítka
    const vavrin = Album.findEntry(album, 'frames:vavrin');
    const detail = Album.detailHtml(vavrin, { wear: { label: 'Nasadit', on: false } }, h);
    assert.match(detail, /data-album-wear[^>]*>.*Nasadit/s);
    assert.match(detail, /Za odznak „Vítěz“: Vyhraj výzvu proti jinému hráči\./);
    assert.match(Album.detailHtml(vavrin, { wear: { label: 'Nasadit', on: true, onLabel: 'Nasazeno' } }, h), /data-album-worn[^>]*>.*Nasazeno/s);
    const locked = Album.detailHtml(Album.findEntry(album, 'themes:legenda'), {}, h);
    assert.match(locked, /data-album-status="missing"/);
    assert.match(locked, /Od úrovně 90\. Nebo dřív z Truhly Mudrlanta/);
    assert.doesNotMatch(locked, /data-album-wear/);
    assert.match(Album.detailHtml(Album.findEntry(album, 'badges:odpovedi'), { badges: {} }, h), /Další stupeň „První krok“/);
    assert.match(Album.detailHtml(Album.findEntry(album, 'diplomas:historie'), {}, h), /poznej 300 různých položek/);
    const rewards = Album.rewardsHtml(album, { 'sberatel-25': 'x' }, h);
    assert.equal((rewards.match(/data-album-milestone=/g) || []).length, 4);
    assert.match(rewards, /frame-sberatel/);
    assert.doesNotMatch(detail + locked + rewards, /style=/);
});

test('napojení: album.js v index.html, service workeru, nasazení a Tailwindu; odznaky alba ve schématu, rámeček v CSS', () => {
    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(index.indexOf('rewards.js') < index.indexOf('album.js') && index.indexOf('album.js') < index.indexOf('app.js'));
    assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'album\.js'/);
    assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8'), /\balbum\.js\b/);
    assert.match(fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8'), /'\.\/album\.js'/);
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    for (const badge of Core.BADGES.filter(entry => Core.isAlbumBadge(entry.id))) assert.ok(sql.includes(`'${badge.id}'`), `${badge.id} v badge_catalog()`);
    const css = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
    assert.match(css, /\.frame-sberatel \{/);
    assert.match(css, /prefers-reduced-motion: no-preference\) \{\s*\.frame-sberatel::before \{ animation: frameSpin/, 'otáčí se jen bez omezeného pohybu');
    assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${Album.ALBUM_ART}.webp`)), 'obrázek alba existuje');
    // Tituly bez rodu a bez shody s jinými odznaky
    const titles = Core.BADGES.filter(badge => Core.isAlbumBadge(badge.id)).map(badge => badge.title);
    for (const title of titles) assert.equal(Core.BADGES.filter(badge => badge.title === title).length, 1, `${title} je jedinečný`);
});
