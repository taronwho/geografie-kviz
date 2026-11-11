// Odměny (rewards.js): Truhla Mudrlanta (vždy nová věc, bez duplicit, jinak XP), ochrana série (strop 2, právě jeden vynechaný den),
// diplomy za mistrovství tématu a sjednocení se stavem v účtu (profiles.rewards). K tomu napojení na look.js, goals.js a schéma.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Look = require('../look.js');
const Rewards = require('../rewards.js');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const ctx = (level = 3) => ({ level, badges: {} });
const okDays = (days) => (day) => days.includes(day);

test('truhla: jednou za týden, vždy věc odemykaná úrovní, kterou hráč nemá, z nejbližších', () => {
    let state = Rewards.addChest(Rewards.empty(), '2026-11-02');
    assert.equal(Rewards.pendingChest(state), '2026-11-02');
    assert.deepEqual(Rewards.addChest(state, '2026-11-02').ready, ['2026-11-02'], 'týden jen jednou');
    const result = Rewards.openChest(state, '2026-11-02', ctx(3), { rng: () => 0, now: 1000 });
    assert.equal(result.opened, true);
    assert.ok(result.gift, 'věc');
    assert.ok(Rewards.GIFT_CATEGORIES.includes(result.gift.category));
    assert.ok(!result.gift.item.badge, 'ne věc za odznak');
    assert.ok(result.gift.item.level > 3, 'ještě neodemčená');
    const nearest = Rewards.candidates(Rewards.empty(), ctx(3)).slice(0, Rewards.NEAREST).map(entry => entry.item);
    assert.ok(nearest.includes(result.gift.item), 'z nejbližších k odemčení');
    assert.equal(result.xp, 0);
    assert.equal(result.freeze, true, 'k tomu ochrana série');
    state = result.state;
    assert.equal(Rewards.pendingChest(state), null);
    assert.ok(Rewards.owns(state, result.gift.category, result.gift.item.id));
    // Znovu otevřít nejde
    assert.equal(Rewards.openChest(state, '2026-11-02', ctx(3)).opened, false);
    // Další truhla je jiného druhu, když to jde
    state = Rewards.addChest(state, '2026-11-09');
    const second = Rewards.openChest(state, '2026-11-09', ctx(3), { rng: () => 0 });
    assert.notEqual(second.gift.category, result.gift.category);
    assert.notEqual(`${second.gift.category}:${second.gift.item.id}`, `${result.gift.category}:${result.gift.item.id}`);
});

test('truhla: bez duplicit, po všem XP; ochrana jen do stropu', () => {
    let state = Rewards.empty();
    const seen = new Set();
    // Běžné věci a k nim vzácné rámečky jen z truhly (ty truhla dá dřív nebo později také, než začne dávat XP)
    const all = Rewards.candidates(state, ctx(1)).length + Rewards.rareCandidates(state).length;
    assert.ok(all >= 25, `dost věcí do truhly (${all})`);
    for (let week = 0; week < all + 3; week++) {
        const key = new Date(Date.UTC(2026, 0, 5) + week * 7 * 86400000).toISOString().slice(0, 10);
        state = Rewards.addChest(state, key);
        const result = Rewards.openChest(state, key, ctx(1), { rng: Math.random });
        state = result.state;
        if (week < all) {
            assert.ok(result.gift, `týden ${week}: věc`);
            const id = `${result.gift.category}:${result.gift.item.id}`;
            assert.ok(!seen.has(id), `duplicita ${id}`);
            // Postavičky (i sezónní ze Sezónní truhly) a jiné exkluzivní věci truhla nedává
            assert.ok(result.gift.category !== 'avatars' && !result.gift.item.exclusive, `týden ${week}: ${id} není z truhly`);
            seen.add(id);
        } else {
            assert.equal(result.gift, null, 'všechno má');
            assert.equal(result.xp, Rewards.CHEST_XP);
        }
        assert.ok(state.freezes <= Rewards.MAX_FREEZES, 'strop ochran');
    }
    assert.equal(Rewards.chestReward(state, Object.keys(state.chests).pop()).xp, Rewards.CHEST_XP);
    // Hráč s vysokou úrovní: věci, které už má odemčené, truhla nedává; zbývají věci jen z truhly (chest v look.js), pak vzácné
    // rámečky (rare) a po nich XP
    const chestOnly = Look.ACCESSORIES.filter(item => item.chest).map(item => item.id);
    assert.deepEqual(Rewards.candidates(Rewards.empty(), ctx(100)).map(entry => entry.item.id).sort(), [...chestOnly].sort());
    let top = { ...Rewards.empty(), gifts: { ...Rewards.empty().gifts, accessories: chestOnly } };
    assert.ok(Rewards.candidates(top, ctx(100)).length === 0);
    for (const [index, entry] of Rewards.rareCandidates(top).entries()) {
        const week = `2026-11-0${2 + index}`;
        const result = Rewards.openChest(Rewards.addChest(top, week), week, ctx(100));
        assert.equal(result.gift && result.gift.item.rare, true, `vzácná věc ${entry.item.id}`);
        top = result.state;
    }
    assert.equal(Rewards.rareCandidates(top).length, 0);
    assert.equal(Rewards.openChest(Rewards.addChest(top, '2026-11-16'), '2026-11-16', ctx(100)).xp, Rewards.CHEST_XP);
});

test('vzácné rámečky jen z truhly (rare): úrovní ani odznakem se neodemknou, truhla je dá občas, Sezóna ne', () => {
    const rare = Rewards.rareCandidates(Rewards.empty());
    assert.deepEqual(rare.map(entry => `${entry.category}:${entry.item.id}`).sort(), Look.FRAMES.filter(item => item.rare).map(item => `frames:${item.id}`).sort());
    assert.ok(rare.length >= 2 && rare.length <= 3, 'dva až tři vzácné rámečky');
    for (const { item } of rare) {
        assert.equal(Look.isUnlocked(item, { level: 100, badges: Object.fromEntries(core.BADGES.map(badge => [badge.id, '2026-11-01'])), gifts: null }), false, `${item.id} jen z truhly`);
        assert.equal(Look.isUnlocked(item, { level: 1, badges: {}, gifts: { frames: [item.id] } }), true, `${item.id} z truhly odemčený`);
        assert.ok(!Look.newRewards(1, 100).some(entry => entry.item === item), 'oslava úrovně ho neohlásí');
    }
    // Mezi běžnými věcmi (truhla i Sezóna Mudrlanta berou z candidates) nejsou
    assert.ok(!Rewards.candidates(Rewards.empty(), ctx(1)).some(entry => entry.item.rare));
    // Nízký hod = běžná věc (jako dřív), vysoký (≥ 1 − RARE_CHANCE) = vzácná; už získaná se nezopakuje
    const opened = (rng, state = Rewards.empty()) => Rewards.openChest(Rewards.addChest(state, '2026-11-02'), '2026-11-02', ctx(3), { rng }).gift;
    assert.ok(!opened(() => 0).item.rare);
    assert.ok(!opened(() => 0.5).item.rare);
    assert.ok(!opened(() => 0.89).item.rare);
    const lucky = opened(() => 0.95);
    assert.equal(lucky.category, 'frames');
    assert.equal(lucky.item.rare, true);
    const owned = Rewards.parse({ gifts: { frames: rare.map(entry => entry.item.id) } });
    assert.ok(!opened(() => 0.95, owned).item.rare, 'všechny vzácné má: běžná věc');
    // Zhruba jedna truhla z deseti
    let hits = 0;
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2000; i++) if (Rewards.pickGift(Rewards.empty(), ctx(3), rng).item.rare) hits += 1;
    assert.ok(hits > 2000 * Rewards.RARE_CHANCE * 0.7 && hits < 2000 * Rewards.RARE_CHANCE * 1.3, `vzácná věc v ${hits} z 2000 truhel`);
    // Text v okně truhly: vzácný dárek, ne „jinak až na úrovni“
    const html = Rewards.chestHtml({ opened: { gift: lucky, xp: 0, freeze: false } }, { frameClass: () => ' frame frame-art' });
    assert.match(html, /Vzácný rámeček profilu/);
    assert.match(html, /jen z truhly/);
    assert.doesNotMatch(html, /na úrovni undefined/);
});

test('truhla nedá Bílý talár (noGift): ten je jen za úroveň 100', () => {
    const all = Rewards.candidates(Rewards.empty(), ctx(1));
    assert.ok(all.length > 10);
    assert.equal(all.some(entry => entry.category === 'robes' && entry.item.id === 'bila'), false);
});

test('věc z truhly je ve Vzhledu odemčená (look.js setGifts), oslava úrovně ji znovu neohlásí', () => {
    const result = Rewards.openChest(Rewards.addChest(Rewards.empty(), '2026-11-02'), '2026-11-02', ctx(3), { rng: () => 0 });
    const item = result.gift.item;
    Look.setGifts({});
    assert.equal(Look.isUnlocked(item, ctx(3)), false);
    Look.setGifts(Rewards.gifts(result.state));
    assert.equal(Look.isUnlocked(item, ctx(3)), true);
    assert.equal(Look.isUnlocked(item, { ...ctx(3), gifts: null }), false, 'gifts: null = bez věcí z truhly');
    // Stejné id v jiné kategorii odemčené není (vinova, zlata, zelena…)
    const twin = Object.entries(Look.CATALOG).filter(([category]) => category !== result.gift.category).flatMap(([, items]) => items).find(other => other.id === item.id && other.level > 3);
    if (twin) assert.equal(Look.isUnlocked(twin, ctx(3)), false);
    assert.ok(!Look.newRewards(3, 100).some(entry => entry.item === item), 'už ji má');
    Look.setGifts({});
});

test('ochrana série: zachrání právě jeden vynechaný den série aspoň tří dní', () => {
    const series = [{ id: 'zemepis', ok: okDays(['2026-11-03', '2026-11-04', '2026-11-05']) }];
    let state = Rewards.earnFreeze(Rewards.empty(), 'c:2026-11-02', 10).state;
    assert.equal(state.freezes, 1);
    // 6. 11. vynechán, dnes 7. 11.
    const used = Rewards.checkFreeze(state, '2026-11-07', series, 20);
    assert.equal(used.used, true);
    assert.equal(used.day, '2026-11-06');
    assert.deepEqual(used.saved, ['zemepis']);
    assert.equal(used.state.freezes, 0);
    assert.deepEqual(used.state.frozen, ['2026-11-06']);
    // Série přes zachráněný den pokračuje, ten den se nepočítá
    assert.equal(Rewards.bridgedStreak(series[0].ok, '2026-11-07', used.state.frozen), 3);
    const results = { '2026-11-03': { correct: true }, '2026-11-04': { correct: true }, '2026-11-05': { correct: true }, '2026-11-07': { correct: true } };
    assert.equal(core.computeStreak(results, '2026-11-07'), 1, 'bez ochrany jen dnešek');
    assert.equal(core.computeStreak(results, '2026-11-07', used.state.frozen), 4, 's ochranou');
    // Jednou denně
    assert.equal(Rewards.checkFreeze(used.state, '2026-11-07', series).used, false);
    // Dva vynechané dny: nic
    const two = Rewards.checkFreeze(state, '2026-11-08', series);
    assert.equal(two.used, false);
    assert.equal(two.state.freezes, 1);
    // Krátká série (2 dny) se nechrání
    const short = Rewards.checkFreeze(state, '2026-11-07', [{ id: 'x', ok: okDays(['2026-11-04', '2026-11-05']) }]);
    assert.equal(short.used, false);
    // Bez ochrany nic
    assert.equal(Rewards.checkFreeze(Rewards.empty(), '2026-11-07', series).used, false);
    // Jedna ochrana zachrání den pro všechny série najednou
    const both = Rewards.checkFreeze(state, '2026-11-07', [...series, { id: 'kviz-dne', ok: okDays(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) }]);
    assert.deepEqual(both.saved, ['zemepis', 'kviz-dne']);
    assert.equal(both.state.freezes, 0);
});

test('ochrana série: nejvýš dvě, za 7 dní v řadě jedna za den a zdroj', () => {
    let state = Rewards.empty();
    assert.equal(Rewards.streakFreeze(state, 'q', '2026-11-08', 6).gained, false);
    let result = Rewards.streakFreeze(state, 'q', '2026-11-08', 7);
    assert.equal(result.gained, true);
    state = result.state;
    assert.equal(Rewards.streakFreeze(state, 'q', '2026-11-08', 7).gained, false, 'stejný den znovu ne');
    state = Rewards.streakFreeze(state, 'd', '2026-11-08', 14).state;
    assert.equal(state.freezes, 2);
    result = Rewards.streakFreeze(state, 'd', '2026-11-15', 21);
    assert.equal(result.gained, false, 'strop');
    assert.equal(result.state.freezes, Rewards.MAX_FREEZES);
    assert.equal(Rewards.parse({ freezes: 9 }).freezes, Rewards.MAX_FREEZES);
});

test('diplomy: za 5 hvězd tématu jednou, se dnem; názvy ve 2. pádě', () => {
    const result = Rewards.noteDiplomas(Rewards.empty(), { zemepis: 5, historie: 4 }, '2026-11-08');
    assert.deepEqual(result.fresh, ['zemepis']);
    assert.deepEqual(result.state.diplomas, { zemepis: '2026-11-08' });
    assert.deepEqual(Rewards.noteDiplomas(result.state, { zemepis: 5 }, '2026-11-09').fresh, []);
    const topics = require('./fixtures.js').TOPIC_IDS || fs.readdirSync(path.join(ROOT, 'topics')).filter(file => file.endsWith('.js')).map(file => file.replace('.js', ''));
    for (const id of topics) assert.ok(Rewards.DIPLOMA_NAMES[id], `název diplomu pro ${id}`);
    assert.equal(Rewards.diplomaTitle({ id: 'zemepis', title: 'Zeměpis' }), 'Mistr zeměpisu');
    assert.equal(Rewards.diplomaTitle({ id: 'vlajky', title: 'Vlajky a znaky' }), 'Mistr vlajek a znaků');
    assert.equal(Rewards.diplomaTitle({ id: 'fyzika', title: 'Fyzika' }), 'Mistr fyziky');
    assert.equal(Rewards.setName(Rewards.empty(), '  Jana   Nováková  ').name, 'Jana Nováková');
});

test('účet: sjednocení věcí, truhel, dnů a diplomů; ochrany z novější změny; zpětně kompatibilní tvar', () => {
    const local = Rewards.parse({ gifts: { robes: ['zelena'] }, chests: { '2026-11-02': 'robes:zelena' }, freezes: 1, freezesAt: 100, frozen: ['2026-11-01'], diplomas: { zemepis: '2026-11-05' }, name: 'Jana' });
    const remote = { v: 1, gifts: { themes: ['les'], robes: ['zelena'] }, chests: { '2026-10-26': 'themes:les' }, ready: ['2026-11-02', '2026-11-09'], freezes: 2, freezesAt: 200, frozen: ['2026-10-20'], diplomas: { zemepis: '2026-11-01', sport: '2026-11-03' } };
    const merged = Rewards.merge(local, remote);
    assert.deepEqual(merged.gifts.robes, ['zelena']);
    assert.deepEqual(merged.gifts.themes, ['les']);
    assert.deepEqual(Object.keys(merged.chests).sort(), ['2026-10-26', '2026-11-02']);
    assert.deepEqual(merged.ready, ['2026-11-09'], 'otevřená truhla nečeká');
    assert.equal(merged.freezes, 2, 'novější změna');
    assert.deepEqual(merged.frozen, ['2026-10-20', '2026-11-01']);
    assert.deepEqual(merged.diplomas, { zemepis: '2026-11-01', sport: '2026-11-03' }, 'dřívější den');
    assert.equal(merged.name, 'Jana', 'jméno na diplomu jen v zařízení');
    assert.ok(!('name' in Rewards.payload(merged)) && !('checked' in Rewards.payload(merged)));
    assert.ok(Rewards.samePayload(merged, Rewards.merge(merged, remote)), 'opakované sjednocení nic nemění');
    // Cizí a rozbité hodnoty se zahodí
    const bad = Rewards.parse({ gifts: { robes: ['neexistuje', 5], hacks: ['x'] }, chests: { x: 'robes:zelena', '2026-11-02': 'eval:x' }, frozen: ['zitra'], earned: ['zz'], diplomas: { 'Ab': '2026-11-01' } });
    assert.deepEqual(bad.gifts.robes, []);
    assert.deepEqual(bad.chests, {});
    assert.deepEqual(bad.frozen, []);
    assert.deepEqual(bad.diplomas, {});
    assert.deepEqual(Rewards.parse(null), Rewards.empty());
    assert.ok(JSON.stringify(Rewards.payload(merged)).length < 8000);
});

test('napojení: rewards.js v index.html, service workeru, nasazení a Tailwindu; sloupec rewards a odznaky ve schématu 9', () => {
    assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /<script src="rewards\.js" defer><\/script>/);
    assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'rewards\.js'/);
    assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8'), /\brewards\.js\b/);
    assert.match(fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8'), /'\.\/rewards\.js'/);
    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(index.indexOf('look.js') < index.indexOf('rewards.js') && index.indexOf('rewards.js') < index.indexOf('app.js'));
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    assert.match(sql, /add column if not exists rewards jsonb/);
    assert.match(sql, /grant update \(rewards\) on public\.profiles to authenticated/);
    for (const badge of core.BADGES) assert.ok(sql.includes(`'${badge.id}'`), `${badge.id} v badge_catalog()`);
    // Truhla (zavřená i otevřená s věcí nebo XP) a štít se kreslí bez inline stylů (CSP)
    const robe = { category: 'robes', item: Look.find('robes', 'zelena') };
    const opened = Rewards.chestHtml({ opened: { gift: robe, xp: 0, freeze: true } }, {}) + Rewards.chestHtml({ opened: { gift: null, xp: Rewards.CHEST_XP, freeze: false } }, {});
    assert.doesNotMatch(Rewards.chestHtml({}, {}) + opened + Rewards.chestStripHtml() + Rewards.freezeChip(2), /style=/);
    // Zavřená truhla je tlačítko s nápovědou a obě podoby truhly jsou v okně (otevřená se načte dopředu)
    assert.match(Rewards.chestHtml({}, {}), /data-chest-go aria-label="Otevřít truhlu"[^>]*class="chest-box/);
    for (const html of [Rewards.chestHtml({}, {}), opened]) assert.match(html, /truhla\.webp[\s\S]*truhla-otevrena\.webp/);
    assert.match(opened, /data-chest-prize/);
});

test('nové odznaky: Kvíz dne, Bleskovka, Přežití, mapa, odhad a Seřaď podle počítadel, s odměnou a ikonou', () => {
    const x = { level: 1, learned: 0, topicStars: {}, topicCount: 14 };
    const earned = core.earnedBadgeIds({ quizDone: 1, quizBestStreak: 7, quizPerfect: 1, blitzBest: 16, survivalBest: 20, mapExact: 5, estimateGood: 25, orderPerfect: 5 }, x);
    for (const id of ['kviz-dne', 'kviz-serie-3', 'kviz-tyden', 'kviz-perfekt', 'bleskovka-8', 'bleskovka-12', 'bleskovka-16', 'preziti-10', 'preziti-20', 'mapa-5', 'odhad-5', 'odhad-25', 'serad-5']) assert.ok(earned.includes(id), id);
    assert.ok(!earned.includes('bleskovka-20'));
    const icons = fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8');
    for (const group of core.BADGE_GROUPS.filter(entry => /^(kviz|bleskovka|preziti|mapa|odhad|serad)/.test(entry.id))) {
        assert.ok(icons.includes(`"${group.icon}"`), `ikona ${group.icon}`);
        assert.ok(fs.readFileSync(path.join(ROOT, 'docs', 'OBRAZKY.md'), 'utf8').includes(`odznak-${group.id}.png`), `prompt ${group.id}`);
    }
    // Některé dávají obrázek hráče, ostatní jen slávu (stejně jako dřívější odznaky)
    assert.match(Look.badgeRewardText('kviz-tyden'), /Utíkající přesýpačky \(profilový obrázek\)/);
    assert.match(Look.badgeRewardText('bleskovka-16'), /Blesk/);
    assert.equal(Look.badgeRewardText('kviz-dne'), '', 'jen sláva: bez řádku s odměnou');
    for (const item of Look.AVATARS.filter(entry => entry.badge)) assert.ok(core.BADGE_BY_ID[item.badge], `${item.title}: odznak ${item.badge}`);
});
