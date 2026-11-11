// Sezóna Mudrlanta (season.js) a odměny za sérii dní: stupně podle XP sezóny (kalibrace), měsíce v Praze, založení a přechod sezóny,
// sloučení se zařízením a účtem (rewards.js), dovybrání minulé sezóny 7 dní, odměny stupňů (stejné na všech zařízeních, Truhla v půli
// sezóny, Sezónní truhla s exkluzivním rámečkem a titulem), exkluzivní věci v look.js a řádek „Další odměna za sérii“.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Look = require('../look.js');
const Rewards = require('../rewards.js');
const Season = require('../season.js');
const Frames = require('../look-frames.js');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const ctx = (level = 20, badges = {}) => ({ level, badges });
const NOV = '2026-11';
const started = (startXp = 1000, claimed = {}) => Rewards.parse({ season: { id: NOV, startXp, claimed } });
const claimAll = (state, { xp, today = '2026-11-20', user = 'u1', level = 20, which = 'season' } = {}) => {
    const results = [];
    for (let tier = 1; tier <= Season.TIERS; tier++) {
        const result = Season.claim(state, { which, tier, ctx: ctx(level), xp, today, user, now: 1000 + tier });
        if (result.opened) { state = result.state; results.push(result); }
    }
    return { state, results };
};

test('stupně: 20 stupňů s rostoucími kroky, XP sezóny → dosažený stupeň a postup k dalšímu', () => {
    assert.equal(Season.TIERS, 20);
    assert.equal(Season.STEPS.length, 20);
    for (let i = 1; i < Season.STEPS.length; i++) assert.ok(Season.STEPS[i] >= Season.STEPS[i - 1], `krok ${i + 1} neklesá`);
    assert.ok(Season.STEPS[19] > Season.STEPS[0] * 5, 'poslední kroky jsou výrazně delší než první');
    assert.equal(Season.THRESHOLDS[0], 200);
    assert.equal(Season.THRESHOLDS[19], 19100);
    assert.deepEqual([0, 199, 200, 449, 450, 4550, 19099, 19100, 99999].map(Season.tierOf), [0, 0, 1, 1, 2, 10, 19, 20, 20]);
    assert.deepEqual(Season.progressOf(300), { xp: 300, tier: 1, next: 2, into: 100, needed: 250, ratio: 0.4 });
    assert.equal(Season.progressOf(-50).tier, 0);
    const end = Season.progressOf(25000);
    assert.equal(end.tier, 20);
    assert.equal(end.next, null);
    assert.equal(end.ratio, 1);
});

test('kalibrace: aktivní hráč (15–20 min denně, ~20 dní) cestu dohraje, příležitostný dojde zhruba na stupeň 8–12', () => {
    // Vzorce XP z quiz-core: odpověď 10 + 5 za bod, dnešní otázka +15, série až +20, všechna témata +50; Kvíz dne +30 a série
    const answer = 22; // průměr XP za otázku (quiz-core AVERAGE_XP_PER_QUESTION)
    assert.equal(core.answerXp({ correct: true, points: 2 }), 20);
    const quiz = 10 * answer + 30 + 16 + 4; // Kvíz dne
    const daily = (count) => count * (answer + core.DAILY_XP + 16) + (count === 14 ? core.DAILY_ALL_XP : 0); // dnešní otázky se sérií
    const goals = (3 * 100 + 200) / 7; // cíle týdne
    const shortActive = quiz + daily(10) + 5 * answer + goals; // ~15 minut
    const longActive = quiz + daily(14) + 15 * answer + goals; // ~20 minut
    assert.ok(shortActive >= 900 && longActive <= 1500, `aktivní den: ${Math.round(shortActive)}–${Math.round(longActive)} XP`);
    assert.equal(Season.tierOf(Math.round(longActive * 18)), 20, 'delší hraní: cesta hotová do 18 dní');
    assert.ok(Season.tierOf(Math.round(shortActive * 20)) >= 19, 'čtvrthodinka denně: 19.–20. stupeň za 20 dní');
    assert.equal(Season.tierOf(Math.round(shortActive * 21)), 20);
    // Příležitostný hráč: ~10 dní po 5–8 minutách (Kvíz dne a pár dnešních otázek, krátká série)
    const casualLow = 10 * (quiz + 3 * (answer + core.DAILY_XP + 4));
    const casualHigh = 10 * (quiz + daily(4) + 2 * answer + 40);
    assert.ok(Season.tierOf(casualLow) >= 7 && Season.tierOf(casualLow) <= 9, `příležitostný (málo): stupeň ${Season.tierOf(casualLow)}`);
    assert.ok(Season.tierOf(casualHigh) >= 10 && Season.tierOf(casualHigh) <= 12, `příležitostný (víc): stupeň ${Season.tierOf(casualHigh)}`);
    // První krátká hra dá první odměnu
    assert.ok(Season.THRESHOLDS[0] <= 10 * answer);
});

test('měsíce v Praze: hranice dne a měsíce podle pražského času (i letní čas), zbývající dny a dovybírání do 7. dne', () => {
    assert.equal(Season.pragueDay(new Date('2026-11-30T22:59:00Z')), '2026-11-30');
    assert.equal(Season.pragueDay(new Date('2026-11-30T23:00:00Z')), '2026-12-01', 'v Praze už je prosinec');
    assert.equal(Season.pragueDay(new Date('2026-03-31T21:59:00Z')), '2026-03-31');
    assert.equal(Season.pragueDay(new Date('2026-03-31T22:00:00Z')), '2026-04-01', 'letní čas: UTC+2');
    assert.equal(Season.seasonOf('2026-12-01'), '2026-12');
    assert.equal(Season.label('2026-11'), 'Listopad 2026');
    assert.equal(Season.label('2027-01'), 'Leden 2027');
    assert.equal(Season.shiftSeason('2026-12', 1), '2027-01');
    assert.equal(Season.shiftSeason('2027-01', -1), '2026-12');
    assert.equal(Season.lastDay('2028-02'), '2028-02-29', 'přestupný rok');
    assert.equal(Season.daysLeft('2026-11', '2026-11-10'), 21);
    assert.equal(Season.daysLeft('2026-11', '2026-11-30'), 1);
    assert.equal(Season.graceEnd('2026-12'), '2027-01-07');
    assert.equal(Season.inGrace('2026-11', '2026-11-30'), false, 'běžící sezóna není v dovybírání');
    assert.equal(Season.inGrace('2026-11', '2026-12-01'), true);
    assert.equal(Season.inGrace('2026-11', '2026-12-07'), true);
    assert.equal(Season.inGrace('2026-11', '2026-12-08'), false, 'osmý den propadne');
});

test('založení a přechod: první spuštění v měsíci počítá od teď, nový měsíc přesune sezónu do minulé s XP na konci', () => {
    let { state, changed } = Season.ensure(Rewards.empty(), { today: '2026-11-17', xp: 5300 });
    assert.equal(changed, true);
    assert.deepEqual(state.season, { id: NOV, startXp: 5300, claimed: {} }, 'uprostřed měsíce od XP v tu chvíli');
    assert.equal(Season.ensure(state, { today: '2026-11-30', xp: 9000 }).changed, false, 'během měsíce se nic nemění');
    assert.equal(Season.info(state, { today: '2026-11-17', xp: 5300 }).progress.tier, 0);
    assert.equal(Season.info(state, { today: '2026-11-20', xp: 5300 + 800 }).progress.tier, 3);
    ({ state, changed } = Season.ensure(state, { today: '2026-12-01', xp: 9000 }));
    assert.equal(changed, true);
    assert.deepEqual(state.season, { id: '2026-12', startXp: 9000, claimed: {} });
    assert.deepEqual(state.past, { id: NOV, startXp: 5300, claimed: {}, endXp: 9000 });
    // XP v prosinci se do listopadu nepočítá
    const view = Season.info(state, { today: '2026-12-03', xp: 12000 });
    assert.equal(view.progress.tier, Season.tierOf(3000));
    assert.equal(view.pastProgress.tier, Season.tierOf(3700));
    assert.equal(view.pastPending.length, Season.tierOf(3700));
    assert.equal(view.pastUntil, '2026-12-07');
    // Po 7. prosinci minulá sezóna propadne (žádné čekající stupně, vyzvednout nejde)
    assert.equal(Season.pending(state, { today: '2026-12-08', xp: 12000 }).filter(entry => entry.which === 'past').length, 0);
    assert.equal(Season.claim(state, { which: 'past', tier: 1, ctx: ctx(), xp: 12000, today: '2026-12-08' }).opened, false);
    assert.equal(Season.claim(state, { which: 'past', tier: 1, ctx: ctx(), xp: 12000, today: '2026-12-07' }).opened, true);
});

test('vyzvednutí: jen dosažený stupeň, každý jednou; ochrana série na svých stupních, jinak věc, kterou hráč nemá (nikdy za odznak)', () => {
    let state = started(1000);
    const xp = 1000 + 750; // stupně 1–3
    assert.equal(Season.pending(state, { today: '2026-11-20', xp }).length, 3);
    assert.equal(Season.claim(state, { tier: 4, ctx: ctx(), xp, today: '2026-11-20' }).opened, false, 'stupeň 4 ještě ne');
    const first = Season.claim(state, { tier: 1, ctx: ctx(), xp, today: '2026-11-20', user: 'u1' });
    assert.equal(first.opened, true);
    assert.equal(first.kind, 'item');
    assert.equal(first.parts.length, 1);
    const [{ category, item }] = first.parts;
    assert.ok(Rewards.GIFT_CATEGORIES.includes(category));
    assert.ok(!item.badge && !item.exclusive && item.level > 20, 'věc odemykaná až vyšší úrovní');
    state = first.state;
    assert.ok(Rewards.owns(state, category, item.id));
    assert.equal(state.season.claimed[1], `${category}:${item.id}`);
    assert.equal(Season.claim(state, { tier: 1, ctx: ctx(), xp, today: '2026-11-20' }).opened, false, 'podruhé nic');
    // Stupeň 3 = ochrana série (dokud jich hráč nemá plný počet)
    const third = Season.claim(state, { tier: 3, ctx: ctx(), xp, today: '2026-11-20', now: 5 });
    assert.deepEqual(third.parts, [{ freeze: true }]);
    assert.equal(third.state.freezes, 1);
    assert.equal(third.state.freezesAt, 5);
    const full = Season.claim({ ...state, freezes: Rewards.MAX_FREEZES }, { tier: 3, ctx: ctx(), xp, today: '2026-11-20' });
    assert.ok(full.parts[0].item, 'plný počet ochran: věc');
    assert.equal(full.state.freezes, Rewards.MAX_FREEZES);
    // Jiná sezóna (dnešek v prosinci) se z běžící vyzvednout nedá
    assert.equal(Season.claim(state, { tier: 2, ctx: ctx(), xp, today: '2026-12-02' }).opened, false);
});

test('celá cesta: pestré věci bez duplicit, Truhla v půli sezóny dvě věci, Sezónní truhla rámeček a postavička měsíce a titul', () => {
    const { state, results } = claimAll(started(0), { xp: 25000, level: 20 });
    assert.equal(results.length, 20);
    const items = results.flatMap(result => result.parts.filter(part => part.item));
    const keys = items.map(part => `${part.category}:${part.item.id}`);
    assert.equal(new Set(keys).size, keys.length, 'žádná věc dvakrát');
    assert.ok(items.every(part => !part.item.badge), 'nikdy věc za odznak');
    assert.ok(new Set(items.map(part => part.category)).size >= 5, 'všechny druhy věcí');
    assert.ok(results.filter(result => result.parts.some(part => part.freeze)).length >= 1, 'i ochrana série');
    const mid = results.find(result => result.tier === 10);
    assert.equal(mid.kind, 'double');
    assert.equal(mid.parts.filter(part => part.item).length, 2);
    assert.notEqual(mid.parts[0].category, mid.parts[1].category, 'dvě věci různého druhu');
    const crown = results.find(result => result.tier === 20);
    assert.equal(crown.kind, 'bundle');
    assert.deepEqual(crown.parts.map(part => `${part.category}:${part.item.id}`), ['frames:sezona-11', 'avatars:caj', 'titles:sampion-sezony']);
    assert.ok(Rewards.owns(state, 'frames', 'sezona-11'));
    assert.ok(Rewards.owns(state, 'avatars', 'caj'), 'postavička měsíce mezi dárky');
    assert.ok(results.filter(result => result.tier < 20).every(result => result.parts.every(part => part.category !== 'avatars' && !(part.item && part.item.exclusive))), 'postavičky a sezónní věci jen v Sezónní truhle');
    assert.ok(Rewards.owns(state, 'titles', 'sampion-sezony'));
    // Za sousední stupně se druh věci střídá, když to jde
    const sequence = results.filter(result => result.kind === 'item' && result.parts[0].item).map(result => result.parts[0].category);
    const repeats = sequence.filter((category, index) => index && category === sequence[index - 1]).length;
    assert.ok(repeats <= 2, `stejný druh po sobě: ${repeats}×`);
    // Hráč, který má všechno: body místo věci, Sezónní truhla přidá aspoň něco mimo titul
    const rich = Rewards.parse({ gifts: Object.fromEntries(Object.entries(Look.CATALOG).map(([key, list]) => [key, list.map(entry => entry.id)])), freezes: Rewards.MAX_FREEZES, season: { id: NOV, startXp: 0, claimed: {} } });
    const again = claimAll(rich, { xp: 25000, level: 100 });
    assert.ok(again.results.filter(result => result.tier < 20).every(result => result.parts.every(part => part.xp === Season.FALLBACK_XP)), 'jen body');
    assert.ok(again.results.find(result => result.tier === 20).parts.some(part => part.xp), 'prázdná truhla dá aspoň body');
});

test('stejná odměna na všech zařízeních: los podle sezóny, stupně a hráče', () => {
    const state = started(0, { 1: 'freeze' });
    const take = (user, tier = 2, id = state) => Season.encode(Season.claim(id, { tier, ctx: ctx(12), xp: 5000, today: '2026-11-20', user }).parts);
    assert.equal(take('hrac-a'), take('hrac-a'), 'dvě zařízení téhož hráče: stejná věc');
    assert.equal(Season.rngFor(NOV, 2, 'x')(), Season.rngFor(NOV, 2, 'x')());
    assert.notEqual(Season.rngFor(NOV, 2, 'x')(), Season.rngFor(NOV, 3, 'x')());
    assert.notEqual(Season.rngFor(NOV, 2, 'x')(), Season.rngFor('2026-12', 2, 'x')());
    const picks = new Set(Array.from({ length: 30 }, (_, i) => take(`hrac-${i}`)));
    assert.ok(picks.size > 1, 'různí hráči dostanou různé věci');
    // Text odměny jde zpátky přečíst
    const parts = Season.decode('robes:modra+freeze+xp:150');
    assert.equal(parts[0].item.title, 'Modrý talár');
    assert.deepEqual(parts.slice(1), [{ freeze: true }, { xp: 150 }]);
});

test('sloučení zařízení a účtu: tatáž sezóna menší začátek a všechny stupně, novější sezóna nahradí starší', () => {
    const a = { season: { id: NOV, startXp: 3000, claimed: { 1: 'robes:modra' } } };
    const b = { season: { id: NOV, startXp: 2500, claimed: { 2: 'freeze' } } };
    const merged = Rewards.merge(a, b);
    assert.deepEqual(merged.season, { id: NOV, startXp: 2500, claimed: { 1: 'robes:modra', 2: 'freeze' } });
    assert.deepEqual(Rewards.merge(b, a).season, merged.season, 'nezáleží na straně');
    // Zařízení už v prosinci, druhé ještě v listopadu (vyzvedlo stupeň 3): prosinec platí a listopad zůstane jako minulý se vším
    const december = { season: { id: '2026-12', startXp: 9000, claimed: {} }, past: { id: NOV, startXp: 2500, endXp: 9000, claimed: { 1: 'robes:modra' } } };
    const lagging = { season: { id: NOV, startXp: 2600, claimed: { 3: 'freeze' } } };
    const both = Rewards.merge(lagging, december);
    assert.deepEqual(both.season, { id: '2026-12', startXp: 9000, claimed: {} });
    assert.deepEqual(both.past, { id: NOV, startXp: 2500, claimed: { 1: 'robes:modra', 3: 'freeze' }, endXp: 9000 });
    // Starší sezóny než minulá se zahodí; nesmysly se nepřevezmou
    const old = Rewards.merge({ season: { id: '2026-09', startXp: 1, claimed: {} } }, december);
    assert.equal(old.past.id, NOV);
    const junk = Rewards.parse({ season: { id: '2026-13', startXp: 5 }, past: { id: 'x' } });
    assert.equal(junk.season, null);
    assert.equal(junk.past, null);
    assert.deepEqual(Rewards.parse({ season: { id: NOV, startXp: -5, claimed: { 0: 'freeze', 21: 'freeze', 4: 'nic:nic', 5: 'xp:100' } } }).season, { id: NOV, startXp: 0, claimed: { 5: 'xp:100' } });
    // V účtu se sezóna ukládá s ostatními odměnami
    assert.deepEqual(Rewards.payload(december).season, december.season);
    assert.deepEqual(Rewards.payload(december).past, december.past);
});

test('XP z účtu se do sezóny nepočítá: posun začátku o XP načtené z účtu, sloučení vrátí XP sezóny z jiného zařízení', () => {
    // Nové zařízení: sezóna založená při 0 XP, z účtu přijde 40 000 XP a sezóna jiného zařízení od 38 000
    let local = Season.ensure(Rewards.empty(), { today: '2026-11-20', xp: 0 }).state;
    local = Season.shift(local, 40000);
    assert.equal(local.season.startXp, 40000);
    const merged = Rewards.merge(local, { season: { id: NOV, startXp: 38000, claimed: {} } });
    assert.equal(Season.info(merged, { today: '2026-11-20', xp: 40000 }).progress.xp, 2000, 'jen XP sezóny, ne celý postup');
    // Minulá sezóna se posune celá (začátek i konec)
    const rolled = Season.shift({ season: { id: '2026-12', startXp: 10, claimed: {} }, past: { id: NOV, startXp: 0, endXp: 500, claimed: {} } }, 100);
    assert.deepEqual([rolled.season.startXp, rolled.past.startXp, rolled.past.endXp], [110, 100, 600]);
    assert.deepEqual(Season.shift(local, 0), Rewards.parse(local), 'bez posunu beze změny');
});

test('album: sezónní věc jde získat v sezóně svého měsíce, po ní skončila (vrátí se za rok), dřív než od spuštění skrytá', () => {
    const november = Look.find('frames', 'sezona-11');
    const january = Look.find('frames', 'sezona-01');
    assert.equal(Season.availability(november, 'frames', '2026-11-10'), 'active');
    assert.equal(Season.availability(january, 'frames', '2026-11-10'), 'upcoming', 'leden od spuštění (listopad 2026) ještě nebyl');
    assert.equal(Season.availability(november, 'frames', '2026-12-01'), 'ended');
    assert.equal(Season.availability(january, 'frames', '2027-02-01'), 'ended');
    assert.equal(Season.availability(november, 'frames', '2027-11-01'), 'active', 'každý rok znovu');
    assert.equal(Season.availability(Look.find('frames', 'bronz'), 'frames', '2026-11-10'), null, 'jiné věci řeší album samo');
});

test('účet: jen založená sezóna se do účtu nezapisuje (první přihlášení bez zápisu), s vyzvednutým stupněm ano', () => {
    assert.equal(Rewards.isEmpty({}), true);
    assert.equal(Rewards.isEmpty({ season: { id: NOV, startXp: 5000, claimed: {} } }), true);
    assert.equal(Rewards.isEmpty({ season: { id: NOV, startXp: 5000, claimed: { 1: 'freeze' } } }), false);
    assert.equal(Rewards.isEmpty({ past: { id: '2026-10', startXp: 0, endXp: 900, claimed: {} } }), false);
    assert.equal(Rewards.isEmpty({ freezes: 1 }), false);
});

test('exkluzivní věci: rámečky sezóny a titul jen jako dárek, Sezónní truhla podle dat měsíce, katalog pro album', () => {
    assert.equal(Look.SEASON_FRAMES.length, 12);
    for (const frame of Look.SEASON_FRAMES) {
        assert.match(frame.id, /^sezona-(0[1-9]|1[0-2])$/);
        assert.equal(frame.exclusive, true);
        assert.equal(Look.find('frames', frame.id), frame, 've FRAMES (album, rámeček u jména)');
        assert.equal(Look.isUnlocked(frame, { level: 100, badges: {}, gifts: null }), false, 'úrovní se neodemkne');
        assert.equal(Look.isUnlocked(frame, { level: 1, badges: {}, gifts: { frames: [frame.id] } }), true);
        assert.match(Look.unlockText(frame), /^Sezóna Mudrlanta/);
        assert.equal(Frames.frameClass(frame.id), ` frame frame-${frame.id}`);
    }
    // Každý měsíc má svou Sezónní truhlu; do ní jde jen to, co v katalogu je (doplněk zatím chybí; postavička je pro každý měsíc)
    assert.deepEqual(Object.keys(Look.SEASON_BUNDLES).sort(), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
    for (const [month, plan] of Object.entries(Look.SEASON_BUNDLES)) {
        assert.equal(plan.frame, `sezona-${month}`);
        assert.match(plan.character, /^[a-z]{1,6}$/, 'id postavičky: jen písmena, nejvýš 6 znaků');
        assert.match(plan.accessory, /^[a-z0-9-]{1,30}$/);
        const bundle = Look.seasonBundle(Number(month)).map(entry => `${entry.category}:${entry.item.id}`);
        assert.ok(bundle.includes(`frames:sezona-${month}`) && bundle.includes('titles:sampion-sezony'));
        if (!Look.find('accessories', plan.accessory)) assert.ok(!bundle.some(key => key.startsWith('accessories:')));
        if (!Look.find('avatars', plan.character)) assert.ok(!bundle.some(key => key.startsWith('avatars:')));
        const character = Look.find('avatars', plan.character);
        assert.ok(character && bundle.includes(`avatars:${plan.character}`), `${month}: postavička ${plan.character} v Sezónní truhle`);
        assert.deepEqual([character.exclusive, character.month, character.source], [true, Number(month), 'season']);
        assert.match(Season.tierText(20, `2026-${month}`), new RegExp(`postavička ${character.title}`));
    }
    // Titul: uloží se jen vlastněný (jako odznak), v nabídce je mezi tituly
    const title = Look.titleItem('sampion-sezony');
    assert.equal(title.title, 'Šampion sezóny');
    assert.equal(Look.normalize({ title: 'sampion-sezony' }, { level: 50, badges: {}, gifts: null }).title, 'level');
    assert.equal(Look.normalize({ title: 'sampion-sezony' }, { level: 1, badges: {}, gifts: { titles: ['sampion-sezony'] } }).title, 'sampion-sezony');
    const options = Frames.titleOptions({ level: 3, levelTitle: 'Čtenář', earnedIds: ['vitez'], current: 'sampion-sezony', badgeTitle: (id) => id, ownTitles: [title] });
    assert.deepEqual(options.map(option => option.value), ['level', 'none', 'sampion-sezony', 'vitez']);
    // Truhla Mudrlanta exkluzivní věci nikdy nedá
    const all = Rewards.candidates(Rewards.empty(), { level: 1, badges: {} });
    assert.ok(all.every(entry => !entry.item.exclusive));
    // Stav odměn drží i postavičky a tituly ze sezóny
    assert.ok(Rewards.OWN_CATEGORIES.includes('avatars') && Rewards.OWN_CATEGORIES.includes('titles'));
    assert.deepEqual(Rewards.parse({ gifts: { titles: ['sampion-sezony', 'neznamy'] } }).gifts.titles, ['sampion-sezony']);
});

test('odměny za sérii dní: rámečky za 7, 30, 100 a 365 dní, řádek s další odměnou', () => {
    const group = core.BADGE_GROUPS.find(entry => entry.id === 'serie');
    const goals = Object.fromEntries(group.badges.map(badge => [badge.id, badge.goal]));
    assert.equal(goals.tyden, 7);
    assert.equal(goals.mesic, 30);
    assert.equal(goals['serie-100'], 100);
    assert.equal(goals['serie-365'], 365);
    assert.deepEqual(['jiskra', 'plamen', 'stovka', 'vecny-ohen'].map(id => Look.find('frames', id).badge), ['tyden', 'mesic', 'serie-100', 'serie-365']);
    const text = (earned, streak) => { const next = Rewards.nextStreakReward(group.badges, earned, streak); return next ? Rewards.streakRewardText(next) : null; };
    assert.equal(text({}, 2), 'Další odměna za sérii: Jiskra za 7 dní (zbývá 5)');
    assert.equal(text({ tyden: 'x' }, 12), 'Další odměna za sérii: Plamenný za 30 dní (zbývá 18)');
    assert.equal(text({ tyden: 'x', mesic: 'x' }, 63), 'Další odměna za sérii: Stovka a Hrdinský plášť za 100 dní (zbývá 37)', 'za 100 dní i doplněk');
    assert.equal(text({ tyden: 'x', mesic: 'x', 'serie-100': 'x' }, 0), 'Další odměna za sérii: Věčný oheň za 365 dní (zbývá 365)');
    assert.equal(text({ tyden: 'x', mesic: 'x', 'serie-100': 'x', 'serie-365': 'x' }, 400), null, 'všechno má');
    assert.equal(Rewards.nextStreakReward(group.badges, {}, 7).left, 1, 'nejméně den');
    const html = Rewards.streakRewardHtml(Rewards.nextStreakReward(group.badges, {}, 2), { frameClass: Frames.frameClass });
    assert.match(html, /data-streak-reward/);
    assert.match(html, /frame frame-jiskra/);
    assert.doesNotMatch(html, /style=/);
});

test('napojení a HTML: season.js v index.html, service workeru, nasazení a Tailwindu; okna bez inline stylů a bez chybějících obrázků', () => {
    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(index.indexOf('rewards.js') < index.indexOf('season.js') && index.indexOf('season.js') < index.indexOf('app.js'));
    assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'season\.js'/);
    assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8'), /\bseason\.js\b/);
    assert.match(fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8'), /'\.\/season\.js'/);
    const css = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
    for (let month = 1; month <= 12; month++) assert.match(css, new RegExp(`\\.season-m${String(month).padStart(2, '0')}, \\.frame-sezona-${String(month).padStart(2, '0')} \\{`));
    for (const id of ['jiskra', 'stovka', 'vecny-ohen']) assert.match(css, new RegExp(`\\.frame-${id} \\{`));
    assert.match(css, /prefers-reduced-motion: no-preference[\s\S]*\.frame-vecny-ohen::before \{ animation/);
    const h = { frameClass: Frames.frameClass };
    const state = Rewards.parse({ season: { id: NOV, startXp: 0, claimed: { 1: 'robes:modra', 2: 'freeze', 10: 'themes:les+colors:zelena' } }, past: { id: '2026-10', startXp: 0, endXp: 900, claimed: {} } });
    const view = Season.info(state, { today: '2026-11-03', xp: 6000 });
    const opened = Season.claim(state, { tier: 20, ctx: ctx(), xp: 30000, today: '2026-11-03' });
    const html = [
        Season.cardHtml(view), Season.stripHtml({ id: NOV, count: 3 }), Season.stripHtml({ id: '2026-10', count: 2, past: true, until: '2026-11-07' }), Season.pathHtml(view, { h }),
        Season.revealHtml({ id: NOV, tier: 4, h }), Season.revealHtml({ id: NOV, tier: 10, h }), Season.revealHtml({ id: NOV, tier: 20, h }),
        Season.revealHtml({ id: NOV, tier: 20, opened, h }), Season.revealHtml({ id: NOV, tier: 3, opened: { parts: [{ freeze: true }] }, next: 2, h })
    ].join('\n');
    assert.doesNotMatch(html, /style=/);
    assert.match(Season.stripHtml({ id: '2026-10', count: 2, past: true, until: '2026-11-07' }), /Sezóna Říjen: 2 odměny jen do 7\. 11\./);
    assert.match(Season.cardHtml(view), /data-season-claim[\s\S]*data-season-count>\d+</);
    assert.equal((Season.pathHtml(view, { h }).match(/data-season-tier="/g) || []).length, 20);
    assert.match(Season.revealHtml({ id: NOV, tier: 20, opened, h }), /Sezóna Listopad 2026[\s\S]*Sezónní truhla[\s\S]*Listopadový rámeček · postavička Hrnek čaje · titul Šampion sezóny/);
    assert.match(Season.revealHtml({ id: NOV, tier: 20, opened, h }), /<img src="icons\/avatars\/caj\.webp"[\s\S]*postavičku najdeš v Nastavení → Profil\./);
    // Jen obrázky, které existují (doplňky a postavičky sezóny se objeví, až budou v katalogu a na disku)
    for (const src of new Set([...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]))) assert.ok(fs.existsSync(path.join(ROOT, src)), `obrázek ${src}`);
    assert.equal(Season.SEASON_CHEST_ART, null, 'obrázky Sezónní truhly zatím nejsou');
    // Texty bez rodu hráče
    assert.doesNotMatch(html, /\b(získal|vyzvedl|dosáhl|hrál) jsi\b/);
});
