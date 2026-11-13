// Zlatá otázka (gold.js): kdy padne (1/50, prvních 10 otázek ne, pojistka 80), zlatá ve výzvě ze semínka, střípky a Zlatá truhla
// (vzácná věc, kterou hráč nemá, jinak XP), XP navíc, efekty (jiskřičky, let střípku), HTML bez inline stylů a napojení do aplikace
// (index.html, service worker, nasazení, Tailwind, odznaky Zlatokop v katalogu i databázi, zvuky, tip, obrázky).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../gold.js');
const Rewards = require('../rewards.js');
const Look = require('../look.js');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Opakovatelná náhoda pro testy
const rngOf = (seed) => G.seededRandom(`test-${seed}`);

test('stav: poškozená data dají prázdný stav, čísla se oříznou do rozsahu', () => {
    assert.deepEqual(G.parse(null), G.empty());
    assert.deepEqual(G.parse('nesmysl'), G.empty());
    const state = G.parse({ since: 500, total: 9, correct: 30, found: 40, shards: 12, ready: -3, chests: 'x', intro: 'ano', last: '<b>' });
    assert.equal(state.since, G.PITY);
    assert.equal(state.correct, 9, 'správných nejvýš tolik, kolik bylo zlatých');
    assert.equal(state.found, 9);
    assert.equal(state.shards, G.SHARDS - 1, 'střípků do truhly nejvýš čtyři (pátý truhlu otevře)');
    assert.equal(state.ready, 0);
    assert.equal(state.chests, 0);
    assert.equal(state.intro, false);
    assert.equal(state.last, '');
    assert.equal(G.parse({ last: 'frames:ruze' }).last, 'frames:ruze');
    assert.equal(G.parse({ last: 'themes:zlata' }).last, '', 'Zlatá truhla dává jen doplňky a rámečky');
});

test('kdy padne: prvních 10 otázek ne, pak 1/50 na otázku, nejpozději 80. otázka od poslední zlaté', () => {
    // Náhoda, která by zlatou dala vždy: prvních GRACE otázek přesto ne
    let state = G.empty();
    const always = () => 0;
    for (let i = 1; i <= G.GRACE; i++) {
        const result = G.roll(state, always);
        assert.equal(result.gold, false, `${i}. otázka`);
        state = result.state;
    }
    const eleventh = G.roll(state, always);
    assert.equal(eleventh.gold, true);
    assert.equal(eleventh.state.since, 0, 'po zlaté se počítá znovu');
    // Náhoda, která by zlatou nedala nikdy: pojistka na 80. otázce
    state = G.empty();
    const never = () => 0.999;
    let first = 0;
    for (let i = 1; i <= 200 && !first; i++) {
        const result = G.roll(state, never);
        state = result.state;
        if (result.gold) first = i;
    }
    assert.equal(first, G.PITY);
    assert.equal(G.roll({ since: G.PITY - 1 }, never).gold, true, 'uložené since = 79: příští otázka je zlatá');
    // Pravděpodobnost: zhruba jedna zlatá za 50 otázek (s pauzou po zlaté a pojistkou)
    state = G.empty();
    const rng = rngOf('cetnost');
    let golds = 0;
    const questions = 50000;
    let longest = 0;
    let gap = 0;
    for (let i = 0; i < questions; i++) {
        const result = G.roll(state, rng);
        state = result.state;
        gap += 1;
        if (result.gold) { golds += 1; longest = Math.max(longest, gap); gap = 0; }
    }
    const every = questions / golds;
    assert.ok(every > 42 && every < 55, `jednou za ${every.toFixed(1)} otázek`);
    assert.ok(longest <= G.PITY, `nejdelší čekání ${longest}`);
    assert.equal(G.CHANCE, 1 / 50);
});

test('výzva a turnaj: zlatá otázka ze semínka, stejná pro oba hráče, asi v každé 5. výzvě', () => {
    assert.equal(G.challengeIndex('ABC234-x', 10), G.challengeIndex('ABC234-x', 10), 'stejné semínko = stejné místo');
    let withGold = 0;
    const seen = new Set();
    for (let i = 0; i < 4000; i++) {
        const index = G.challengeIndex(`seed-${i}`, 10);
        assert.ok(index >= -1 && index < 10);
        if (index >= 0) { withGold += 1; seen.add(index); }
    }
    const share = withGold / 4000;
    assert.ok(share > 0.17 && share < 0.23, `podíl výzev se zlatou ${share}`);
    assert.equal(seen.size, 10, 'zlatá může být na kterémkoli místě');
    const seed = Array.from({ length: 200 }, (_, i) => `hledam-${i}`).find(text => G.challengeIndex(text, 10) >= 0);
    const index = G.challengeIndex(seed, 10);
    assert.equal(G.isChallengeGold(seed, 10, index), true);
    assert.equal(G.isChallengeGold(seed, 10, (index + 1) % 10), false);
    assert.equal(G.challengeIndex('', 10), -1);
    assert.equal(G.challengeIndex('x', 0), -1);
    // Zápas turnaje (semínko kola) i výzva skupině mají zlatou stejně
    assert.equal(G.LOCAL_MODES.includes('challenge'), false, 've výzvě rozhoduje jen semínko');
    assert.equal(G.LOCAL_MODES.includes('quiz'), false, 'Kvíz dne zlatou nemá');
    assert.deepEqual(G.LOCAL_MODES, ['daily', 'practice', 'blitz', 'survival']);
});

test('odpověď: střípek jen za správnou odpověď bez nápovědy, pět střípků = Zlatá truhla', () => {
    let state = G.empty();
    let result = G.answer(state, { correct: false });
    assert.deepEqual([result.shard, result.chest, result.state.total, result.state.correct, result.state.shards], [false, false, 1, 0, 0]);
    result = G.answer(result.state, { correct: true, hints: 2 });
    assert.deepEqual([result.shard, result.state.correct, result.state.shards], [false, 1, 0], 's nápovědou jen XP');
    state = result.state;
    for (let i = 1; i <= 4; i++) {
        result = G.answer(state, { correct: true, hints: 0 });
        assert.deepEqual([result.shard, result.chest, result.filled], [true, false, i]);
        state = result.state;
    }
    result = G.answer(state, { correct: true });
    assert.deepEqual([result.shard, result.chest, result.filled], [true, true, 5]);
    assert.deepEqual([result.state.shards, result.state.ready, result.state.found, result.state.correct, result.state.total], [0, 1, 5, 6, 7]);
    // XP navíc: dvojnásobek základu (s ním trojnásobek)
    assert.equal(G.xpBonus(30), 60);
    assert.equal(G.xpBonus(2), 4);
    assert.equal(G.xpBonus(0), 0);
    assert.equal(G.xpBonus(-5), 0);
    assert.equal(G.markIntro(G.empty()).intro, true);
});

test('Zlatá truhla: vzácná věc, kterou hráč ještě nemá (doplněk jen z truhly nebo vzácný rámeček), jinak XP', () => {
    const all = G.chestCandidates({});
    const chestOnly = Look.CATALOG.accessories.filter(item => item.chest).map(item => `accessories:${item.id}`);
    const rare = Look.CATALOG.frames.filter(item => item.rare).map(item => `frames:${item.id}`);
    assert.ok(chestOnly.length >= 5 && rare.length >= 2);
    assert.deepEqual(all.map(entry => `${entry.category}:${entry.item.id}`).sort(), [...chestOnly, ...rare].sort());
    // Co hráč má (z truhly nebo ze Sezóny), Zlatá truhla nedá
    const owned = Rewards.parse({ gifts: { accessories: ['vrtulka'], frames: ['ruze'] } });
    assert.ok(!G.chestCandidates(owned).some(entry => ['vrtulka', 'ruze'].includes(entry.item.id)));
    // Bez čekající truhly nic
    const none = G.openChest({ ready: 0 }, owned);
    assert.equal(none.opened, false);
    // Otevření: věc se připíše k dárkům truhel, truhla ubude, zapíše se, co dala
    let gold = G.parse({ ready: 2 });
    let rewards = owned;
    const got = new Set();
    for (let i = 0; i < all.length; i++) {
        gold = { ...gold, ready: 1 };
        const result = G.openChest(gold, rewards, rngOf(`truhla-${i}`));
        assert.equal(result.opened, true);
        assert.ok(result.gift, 'dokud něco chybí, dá věc');
        assert.equal(result.xp, 0);
        assert.equal(result.gold.ready, 0);
        assert.ok(!got.has(result.gold.last), 'nic dvakrát');
        got.add(result.gold.last);
        assert.ok(Rewards.parse(result.rewards).gifts[result.gift.category].includes(result.gift.item.id));
        assert.equal(Look.isUnlocked(result.gift.item, { level: 1, badges: {}, gifts: Rewards.gifts(result.rewards) }), true, 'věc je odemčená');
        gold = result.gold;
        rewards = result.rewards;
        if (!G.chestCandidates(rewards).length) break;
    }
    assert.equal(G.chestCandidates(rewards).length, 0);
    const xp = G.openChest({ ...gold, ready: 1 }, rewards);
    assert.deepEqual([xp.opened, xp.gift, xp.xp, xp.gold.last], [true, null, G.CHEST_XP, 'xp']);
    assert.equal(G.lastReward(xp.gold), `+${G.CHEST_XP} XP`);
    assert.equal(G.lastReward({ last: 'frames:ruze' }), 'Růže a trny');
    assert.equal(G.lastReward({}), '');
    assert.equal(xp.gold.chests, gold.chests + 1);
});

test('efekty: jiskřičky do všech stran a let střípku po oblouku do počítadla', () => {
    const sparks = G.burst(20, rngOf('jiskry'));
    assert.equal(sparks.length, 20);
    for (const spark of sparks) {
        assert.ok(spark.size >= 7 && spark.size <= 16 && spark.duration >= 700 && spark.duration <= 1300 && spark.delay <= 120);
        assert.ok(Math.hypot(spark.x, spark.y) < 150);
    }
    assert.ok(sparks.some(spark => spark.x > 30) && sparks.some(spark => spark.x < -30) && sparks.some(spark => spark.y < -30) && sparks.some(spark => spark.y > 20), 'do všech stran');
    const frames = G.flightPath({ x: 100, y: 400 }, { x: 250, y: 300 }, { size: 32, endSize: 24 });
    assert.equal(frames[0].offset, 0);
    assert.equal(frames[frames.length - 1].offset, 1);
    assert.ok(frames.every((frame, i) => i === 0 || frame.offset > frames[i - 1].offset), 'snímky jdou po sobě');
    const position = (frame) => frame.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/).slice(1).map(Number);
    const [endX, endY, endScale] = position(frames[frames.length - 1]);
    assert.deepEqual([endX + 16, endY + 16], [250, 300], 'dosedne doprostřed okénka');
    assert.equal(endScale, 0.75);
    const apex = Math.min(...frames.map(frame => position(frame)[1]));
    assert.ok(apex < 300 - 16 - 20, 'letí obloukem nad oběma body');
});

test('HTML: štítek, bublina, výsledek, okénko, dlaždice a okno bez inline stylů; texty bez rodu', () => {
    const ribbon = G.ribbonHtml();
    assert.match(ribbon, /data-gold-ribbon/);
    assert.match(ribbon, /Zlatá otázka · 3× XP/);
    const bubble = G.bubbleHtml();
    assert.match(bubble, /id="gold-bubble"[\s\S]*Tohle je Zlatá otázka![\s\S]*trojnásobek XP[\s\S]*zlatý střípek[\s\S]*data-gold-bubble-close[\s\S]*Rozumím/);
    const shard = G.resultHtml({ correct: true, shard: true, filled: 3, ready: 0, fresh: 2 });
    assert.match(shard, /data-gold-result="shard"/);
    assert.match(shard, /Zlatý střípek je tvůj!/);
    assert.match(shard, /Ještě 2 střípky a otevřeš Zlatou truhlu\./);
    assert.match(shard, /data-gold-slot="2" data-gold-fresh/);
    assert.equal((shard.match(/gold-slot-full/g) || []).length, 2, 'právě přilétající střípek zatím prázdný');
    assert.match(shard, /3 z 5/);
    const chest = G.resultHtml({ correct: true, shard: true, filled: 5, ready: 1 });
    assert.match(chest, /Máš všech pět\. Zlatá truhla je tvoje!/);
    assert.match(chest, /data-action="gold-chest"[\s\S]*Otevřít truhlu/);
    assert.match(G.resultHtml({ correct: true, shard: false, filled: 1 }), /Trojnásobek XP je tvůj[\s\S]*jen za správnou odpověď bez nápovědy/);
    assert.match(G.resultHtml({ correct: false, filled: 1 }), /data-gold-result="miss"[\s\S]*Tentokrát bez střípku/);
    assert.match(G.leftText(4), /Ještě 1 střípek a otevřeš/);
    assert.match(G.leftText(0), /Ještě 5 střípků a otevřeš/);
    const hud = G.hudHtml(4, 3);
    assert.match(hud, /id="gold-hud"[\s\S]*4\/5/);
    const tile = G.progressTile({ shards: 3 });
    assert.deepEqual([tile.kind, tile.title, tile.value, tile.ready], ['gold', 'Zlaté střípky', '3 z 5', false]);
    const ready = G.progressTile({ ready: 1 });
    assert.deepEqual([ready.title, ready.value, ready.ready], ['Zlatá truhla', 'Čeká!', true]);
    const info = G.infoHtml({ total: 14, correct: 11, chests: 1, shards: 3, last: 'frames:ruze' });
    assert.match(info, /data-gold-total[\s\S]*14[\s\S]*data-gold-correct[\s\S]*11[\s\S]*data-gold-chests[\s\S]*1/);
    assert.match(info, /3 z 5 střípků/);
    assert.match(info, /Minule ve Zlaté truhle: Růže a trny/);
    assert.doesNotMatch(info, /data-gold-open/);
    assert.match(G.infoHtml({ ready: 1 }), /data-gold-open[\s\S]*Otevřít Zlatou truhlu/);
    assert.match(G.infoHtml({ ready: 1 }), /Truhla čeká na otevření/);
    assert.equal(G.readyText(2), 'Čekají 2 truhly');
    assert.equal(G.readyText(5), 'Čeká 5 truhel');
    const options = G.chestOptions();
    const card = Rewards.chestHtml({ look: options });
    assert.match(card, /gold-chest[\s\S]*5 zlatých střípků[\s\S]*Zlatá truhla/);
    assert.match(card, /chest-body grid h-full w-full gold-tint/);
    const opened = Rewards.chestHtml({ opened: { gift: { category: 'frames', item: Look.find('frames', 'ruze') }, xp: 0 }, look: options });
    assert.match(opened, /Vzácný rámeček, který jinak najdeš jen v truhlách\. Teď je tvůj\./);
    assert.match(Rewards.chestHtml({ opened: { gift: null, xp: G.CHEST_XP }, look: options }), /\+300 XP[\s\S]*Všechny vzácné věci už máš/);
    // Truhla Mudrlanta beze změny
    assert.match(Rewards.chestHtml({}), /Cíle týdne splněné[\s\S]*Truhla Mudrlanta[\s\S]*icons\/topics\/truhla\.webp/);
    assert.doesNotMatch(Rewards.chestHtml({}), /gold-chest|gold-tint/);
    for (const html of [ribbon, bubble, shard, chest, hud, info, card, opened, G.slotsHtml(2)]) {
        assert.doesNotMatch(html, /style=|on[a-z]+=/i, 'CSP: bez inline stylů a skriptů');
    }
    // Genderově neutrální texty (žádné „získal jsi“, „použil“…)
    const texts = [G.INTRO_TEXT, ...G.RULES.map(rule => rule.text), ribbon, bubble, shard, chest, info, opened, G.leftText(2), Look.find('frames', 'ruze').title];
    for (const text of texts) assert.doesNotMatch(text, /\b(získal|dostal|použil|odpověděl|otevřel|nasbíral)\b/, text.slice(0, 60));
});

test('Můj postup: dlaždice Zlaté střípky v řádku Odměny (pátá dlaždice), bez ní beze změny', () => {
    const base = Rewards.progressHtml({ freezes: 1, diplomas: 2, album: { percent: 30, art: 'album' } });
    assert.match(base, /grid-cols-2 short:grid-cols-4/);
    const withGold = Rewards.progressHtml({ freezes: 1, diplomas: 2, album: { percent: 30, art: 'album' }, extra: [G.progressTile({ shards: 2 })] });
    assert.match(withGold, /grid-cols-2 short:grid-cols-5/);
    assert.match(withGold, /data-rewards-info="gold" class="col-span-2 short:col-span-1 /);
    assert.match(withGold, /Zlaté střípky[\s\S]*Střípky[\s\S]*data-gold-tile-value[^>]*>2 z 5/);
    const noAlbum = Rewards.progressHtml({ extra: [G.progressTile({ ready: 1 })] });
    assert.match(noAlbum, /grid-cols-2 short:grid-cols-4/);
    assert.match(noAlbum, /bg-gold-100 ring-2 ring-gold-400[\s\S]*Zlatá truhla[\s\S]*Čeká!/);
    assert.match(Rewards.progressHtml({}), /grid-cols-3/);
});

test('napojení: modul, service worker, nasazení, Tailwind, odznaky Zlatokop (aplikace i databáze), zvuky, tip a obrázky', () => {
    const index = read('index.html');
    assert.match(index, /<script src="gold\.js" defer><\/script>/);
    assert.ok(index.indexOf('rewards.js') < index.indexOf('gold.js') && index.indexOf('look.js') < index.indexOf('gold.js') && index.indexOf('gold.js') < index.indexOf('app.js'));
    assert.match(read('sw.js'), /'gold\.js'/);
    assert.match(read('.github/workflows/pages.yml'), /\bgold\.js\b/);
    assert.match(read('tailwind.config.js'), /'\.\/gold\.js'/);
    // Odznaky Zlatokop I–III za 10, 50 a 100 správně zodpovězených zlatých otázek, v katalogu databáze
    const group = core.BADGE_GROUPS.find(entry => entry.id === G.BADGE_GROUP);
    assert.deepEqual(group.badges.map(badge => [badge.id, badge.title, badge.goal]), [['zlatokop-10', 'Zlatokop I', 10], ['zlatokop-50', 'Zlatokop II', 50], ['zlatokop-100', 'Zlatokop III', 100]]);
    assert.deepEqual(group.badges.map(badge => badge.goal), G.BADGE_GOALS);
    assert.equal(core.EMPTY_COUNTERS.goldCorrect, 0);
    assert.deepEqual(core.earnedBadgeIds({ goldCorrect: 50 }, { level: 1 }).filter(id => id.startsWith('zlatokop')), ['zlatokop-10', 'zlatokop-50']);
    const sql = read('supabase/schema.sql');
    for (const badge of group.badges) assert.ok(sql.includes(`'${badge.id}'`), `${badge.id} v badge_catalog()`);
    assert.match(sql, /-- ===== 21: Zlatá otázka =====/);
    assert.ok(Number(/language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1]) >= 21 && /language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1] === /const REQUIRED_SCHEMA = (\d+);/.exec(read('app.js'))[1], 'schéma aspoň 21 a stejná verze v app.js');
    // Zvuky existují a jsou krátké
    const Sound = require('../sound.js');
    for (const name of ['gold', 'shard']) assert.ok(Sound.SOUNDS[name] && Sound.lengthOf(name) <= 1.2, name);
    const app = read('app.js');
    assert.match(app, /Sound\.play\('gold'\)/);
    assert.match(app, /Sound\.play\('shard'\)/);
    // Tip: obrázek stejný jako v okně, akce otevře okno Zlatá otázka
    const Tips = require('../tips.js');
    const tip = Tips.BY_ID.get('zlata');
    assert.equal(tip.art, G.ART.owl, 'tips.js má stejný obrázek jako gold.js ART.owl');
    assert.equal(tip.action.kind, 'gold');
    assert.match(app, /gold: \(\) => \{ closeDialog\(\); openGoldInfo\(\); \}/);
    assert.match(app, /touchTip\('gold'\)/);
    // Obrázky (zástupné do dodání č. 206–211) existují a jsou v mezipaměti service workeru
    const sw = read('sw.js');
    for (const name of [G.ART.owl, G.ART.chest, G.ART.chestOpen, G.ART.badge, G.ART.shard, G.ART.texture].filter(Boolean)) {
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), `${name}.webp`);
        assert.ok(sw.includes(`'${name}'`), `${name} v mezipaměti`);
    }
    // Bleskovka: čas stojí i pod bublinou vysvětlení a pod Zlatou truhlou
    assert.match(app, /const MODE_OVERLAYS = \[[^\]]*'gold-bubble'/);
    // Odznaky Zlatokop mají symbol z gold.js
    assert.match(app, /Gold && group === Gold\.BADGE_GROUP \? Gold\.ART\.badge/);
});
