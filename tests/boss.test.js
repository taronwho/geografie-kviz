// Boss týdne (boss.js): rotace bossů po týdnech v pražském čase, hlášky (úplné, genderově neutrální), plán otázek ze semínka,
// poškození s bonusem za rychlost, čas na otázku a schválnosti, stupně bosse podle životů, pokusy, výhra a emblémy, uložený stav,
// dlaždice na úvodu a HTML bez inline stylů. Souboj v prohlížeči: tests/e2e-boss.test.js, server: tests/sql-boss.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Boss = require('../boss.js');
const Core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
// Okamžik v Praze (zimní čas UTC+1, letní UTC+2)
const at = (iso) => new Date(iso).getTime();

test('týdny v pražském čase: pondělí ISO týdne, přelom neděle a pondělí, změna času', () => {
    assert.equal(Boss.weekOf(at('2026-11-12T12:00:00Z')), '2026-11-09');
    // Neděle 23:59 v Praze je ještě starý týden, pondělí 0:00 nový (22:59 a 23:00 UTC)
    assert.equal(Boss.weekOf(at('2026-11-15T22:59:00Z')), '2026-11-09');
    assert.equal(Boss.weekOf(at('2026-11-15T23:00:00Z')), '2026-11-16');
    // Letní čas: neděle 29. 3. 2026 ve 23:30 (21:30 UTC) je ještě týden 23. 3., pondělí 0:30 (22:30 UTC) už 30. 3.
    assert.equal(Boss.weekOf(at('2026-03-29T21:30:00Z')), '2026-03-23');
    assert.equal(Boss.weekOf(at('2026-03-29T22:30:00Z')), '2026-03-30');
    assert.equal(Boss.weekOf(at('2027-01-01T10:00:00Z')), '2026-12-28', 'přes přelom roku');
    assert.ok(Boss.isWeek('2026-11-09'));
    assert.ok(!Boss.isWeek('2026-11-10'), 'úterý není začátek týdne');
    assert.ok(!Boss.isWeek('2026-13-01'));
    assert.equal(Boss.addWeeks('2026-11-09', 1), '2026-11-16');
    assert.equal(Boss.addWeeks('2026-11-09', -1), '2026-11-02');
    assert.equal(Boss.weekLabel('2026-11-09'), '9.–15. 11.');
    assert.equal(Boss.weekLabel('2026-11-30'), '30. 11. – 6. 12.');
});

test('rotace: osm bossů po sobě, každý týden jiný, stejná pro všechny', () => {
    assert.equal(Boss.BOSSES.length, 8);
    assert.equal(Boss.bossForWeek(Boss.ROTATION_START).id, 'kapitan');
    const ids = Array.from({ length: 16 }, (_, i) => Boss.bossForWeek(Boss.addWeeks(Boss.ROTATION_START, i)).id);
    assert.deepEqual(ids.slice(0, 8), ['kapitan', 'rytir', 'alchymista', 'amper', 'maestro', 'druid', 'olympan', 'reziser']);
    assert.deepEqual(ids.slice(8), ids.slice(0, 8), 'po osmi týdnech znovu od začátku');
    assert.equal(Boss.bossForWeek(Boss.addWeeks(Boss.ROTATION_START, -1)).id, 'reziser', 'i před začátkem rotace');
    for (let i = 1; i < 30; i++) assert.notEqual(Boss.bossForWeek(Boss.addWeeks('2026-01-05', i)).id, Boss.bossForWeek(Boss.addWeeks('2026-01-05', i - 1)).id);
});

test('bossové: témata, povahy, obrázky stupňů a emblémy v quiz-core', () => {
    const topics = fs.readdirSync(path.join(ROOT, 'topics')).map(file => file.replace(/\.js$/, ''));
    assert.deepEqual(Boss.BOSSES.map(boss => [boss.id, boss.topic]), [['kapitan', 'zemepis'], ['rytir', 'historie'], ['alchymista', 'chemie'], ['amper', 'fyzika'],
        ['maestro', 'hudba'], ['druid', 'biologie'], ['olympan', 'mytologie'], ['reziser', 'film']]);
    for (const boss of Boss.BOSSES) {
        assert.ok(topics.includes(boss.topic), `${boss.id}: téma ${boss.topic}`);
        assert.ok(boss.name && boss.whom && boss.epithet && /^Přemožitel /.test(boss.title), boss.id);
        assert.equal(Boss.ART[boss.id].length, 4, `${boss.id}: obrázek pro každý stupeň`);
        for (let stage = 1; stage <= 4; stage++) {
            const name = Boss.artFor(boss.id, stage);
            assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), `${boss.id} stupeň ${stage}: ${name}.webp`);
        }
        assert.notEqual(Boss.artFor(boss.id, 4), Boss.artFor(boss.id, 1), `${boss.id}: poražený má vlastní obrázek`);
    }
    // Emblémy: odznaky boss-<id> se stejnými jmény a tituly, v databázi v katalogu odznaků
    assert.deepEqual(Core.BOSS_EMBLEMS.map(([id, name, whom, title]) => ({ id, name, whom, title })), Boss.BOSSES.map(({ id, name, whom, title }) => ({ id, name, whom, title })));
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    for (const boss of Boss.BOSSES) {
        const badge = Core.BADGE_BY_ID[Boss.badgeId(boss.id)];
        assert.ok(badge && badge.title === boss.title, `odznak ${boss.id}`);
        assert.ok(Boss.isBossBadge(badge.id) && Core.isBossBadge(badge.id));
        assert.equal(Boss.bossOfBadge(badge.id), boss);
        assert.ok(sql.includes(`'${badge.id}'`), `${badge.id} v badge_catalog()`);
    }
    assert.ok(!Boss.isBossBadge('boss-neznamy') && !Boss.isBossBadge('detektiv'));
    // Zástupný obrázek ve stupni 2 a 3 dostane filtr (do dodání ilustrací)
    assert.equal(Boss.isStandIn('kapitan', 1), false);
    assert.equal(Boss.isStandIn('kapitan', 2), Boss.artFor('kapitan', 2) === Boss.artFor('kapitan', 1));
    assert.equal(Boss.isStandIn('kapitan', 4), false);
});

test('hlášky: všechny skupiny a varianty, čeština bez oslovení v minulém čase, bez opakování', () => {
    const all = [];
    for (const boss of Boss.BOSSES) {
        assert.equal(boss.intro.length, 3, `${boss.id}: tři úvodní řeči`);
        assert.ok(boss.hit.length >= 2, `${boss.id}: zásahy`);
        for (const stage of [1, 2, 3]) assert.ok(boss.taunt[stage].length >= 2, `${boss.id}: posměšky ve stupni ${stage}`);
        for (const stage of [2, 3]) assert.equal(boss.stage[stage].length, 2, `${boss.id}: dvě hlášky při přechodu do stupně ${stage}`);
        assert.equal(boss.defeat.length, 2, `${boss.id}: porážka`);
        assert.equal(boss.win.length, 2, `${boss.id}: výhra bosse`);
        const lines = [...boss.intro, ...boss.hit, ...boss.taunt[1], ...boss.taunt[2], ...boss.taunt[3], ...boss.stage[2], ...boss.stage[3], ...boss.defeat, ...boss.win];
        for (const line of lines) {
            assert.ok(line.length >= 8 && line.length <= 170, `${boss.id}: délka „${line}“`);
            assert.match(line, /[.!?…]$/u, `${boss.id}: interpunkce na konci „${line}“`);
            assert.ok(!/ {2}|\s[,.!?]/u.test(line), `${boss.id}: mezery „${line}“`);
            // Hráč se neoslovuje v minulém čase (rod): „jsi hrál“, „sis spletl“, „ses trefil“
            assert.ok(!/\b(jsi|sis|ses)\s+\p{L}+l\b/iu.test(line) && !/\p{L}+l\s+(jsi|sis|ses)\b/iu.test(line), `${boss.id}: rod hráče „${line}“`);
            assert.ok(!/["']/.test(line), `${boss.id}: uvozovky „${line}“`);
        }
        all.push(...lines);
    }
    assert.equal(new Set(all).size, all.length, 'žádná hláška se neopakuje');
    // Výběr hlášky: z dané skupiny, bez zopakování té poslední
    const kapitan = Boss.BY_ID.kapitan;
    assert.ok(kapitan.taunt[2].includes(Boss.lineFor(kapitan, 'taunt', 2, () => 0.99)));
    assert.ok(kapitan.stage[3].includes(Boss.lineFor('kapitan', 'stage', 3, () => 0)));
    assert.notEqual(Boss.lineFor(kapitan, 'hit', 1, () => 0, kapitan.hit[0]), kapitan.hit[0]);
    assert.equal(Boss.lineFor('neznamy', 'hit'), '');
});

test('poškození: 50 za správnou odpověď a bonus za rychlost (plný do 6 s, do 20 s k nule)', () => {
    assert.deepEqual([0, 3000, 6000, 6001, 13000, 19999, 20000, 45000].map(Boss.speedBonus), [30, 30, 30, 30, 15, 0, 0, 0]);
    assert.equal(Boss.damageFor(true, 1000), 80);
    assert.equal(Boss.damageFor(true, 13000), 65);
    assert.equal(Boss.damageFor(true, 30000), 50);
    assert.equal(Boss.damageFor(false, 1000), 0);
    // Bonus klesá plynule
    for (let ms = 6000; ms < 20000; ms += 500) assert.ok(Boss.speedBonus(ms) >= Boss.speedBonus(ms + 500));
});

test('čas na otázku a schválnosti: psaní u 4. a 8. otázky, poslední tři poloviční čas', () => {
    assert.deepEqual(Array.from({ length: 10 }, (_, slot) => Boss.timeLimit(slot) / 1000), [30, 30, 30, 40, 30, 30, 30, 20, 15, 15]);
    assert.deepEqual(Array.from({ length: 10 }, (_, slot) => Boss.trickOf(slot)), [null, null, null, 'typed', null, null, null, 'both', 'half', 'half']);
    assert.match(Boss.trickHtml(3), /data-boss-trick="typed"/);
    assert.equal(Boss.trickHtml(0), '');
});

test('souboj: životy, srdce, výhra, prohra a stupně bosse podle zbývajících životů', () => {
    const fast = { correct: true, ms: 1000 };
    const wrong = { correct: false, ms: 5000 };
    assert.deepEqual(Boss.fightStatus([]), { hp: 700, hearts: 3, correct: 0, answered: 0, damage: 0, won: false, over: false, stage: 1, percent: 100 });
    // 9 rychlých správných = 720 → boss padne v 9. otázce
    const win = Boss.fightStatus(Array(9).fill(fast));
    assert.equal(win.hp, 0);
    assert.ok(win.won && win.over);
    assert.equal(win.stage, 4);
    assert.equal(win.damage, 700);
    // 8 rychlých nestačí (640)
    assert.equal(Boss.fightStatus(Array(8).fill(fast)).hp, 60);
    // Tři chyby = konec
    const lost = Boss.fightStatus([fast, wrong, wrong, wrong, fast]);
    assert.ok(lost.over && !lost.won);
    assert.equal(lost.hearts, 0);
    assert.equal(lost.answered, 4, 'po třetí chybě se dál nepočítá');
    assert.equal(lost.damage, 80);
    // Došly otázky
    const out = Boss.fightStatus([...Array(7).fill(fast), wrong, { correct: true, ms: 19000 }, { correct: true, ms: 19000 }]);
    assert.ok(out.over && !out.won && out.answered === 10);
    // Stupně: 100–67 % Plná síla, 66–34 % Zraněný, 33–1 % V koncích, 0 Poražený
    assert.deepEqual([700, 469, 467, 462, 238, 237, 231, 1, 0].map(Boss.stageOf), [1, 1, 1, 2, 2, 2, 3, 3, 4]);
    assert.deepEqual([700, 462, 1, 0].map(Boss.hpPercent), [100, 66, 1, 0]);
    assert.deepEqual([1, 2, 3, 4].map(Boss.stageName), ['Plná síla', 'Zraněný', 'V koncích', 'Poražený']);
});

test('plán otázek: stejný pro všechny v týdnu a pokusu, jiný v dalším pokusu, bez opakování, těžší třetiny známých položek', () => {
    const items = [];
    for (const c of ['a', 'b']) for (let i = 0; i < 30; i++) items.push({ q: `Q${c}${i}`, n: `Položka ${c}${i}`, c, k: i < 24 ? 1 : 0 });
    const tiers = Boss.tiersOf(items);
    assert.equal(tiers.get('Qa0'), 0);
    assert.equal(tiers.get('Qa23'), 2);
    assert.ok(!tiers.has('Qa25'), 'méně známé položky nejsou v těžkých otázkách');
    const first = Boss.candidatesFor('2026-11-09', 1, 0, items, ['a', 'b']);
    assert.deepEqual(first.map(item => item.q), Boss.candidatesFor('2026-11-09', 1, 0, items, ['a', 'b']).map(item => item.q), 'stejné semínko, stejné pořadí');
    assert.equal(tiers.get(first[0].q), Boss.TIERS[0], 'první otázky ze střední třetiny');
    assert.equal(tiers.get(Boss.candidatesFor('2026-11-09', 1, 9, items, ['a', 'b'])[0].q), 2, 'pozdější z nejméně známé třetiny');
    const other = Boss.candidatesFor('2026-11-09', 2, 0, items, ['a', 'b']);
    assert.notDeepEqual(other.slice(0, 5).map(item => item.q), first.slice(0, 5).map(item => item.q), 'jiný pokus, jiné otázky');
    const used = [first[0].q, first[1].q];
    assert.ok(!Boss.candidatesFor('2026-11-09', 1, 0, items, ['a', 'b'], used).some(item => used.includes(item.q)), 'bez položek z dřívějších otázek');
    assert.equal(new Set(first.map(item => item.q)).size, first.length);
    assert.deepEqual(Boss.candidatesFor('2026-11-09', 1, 0, [], []), []);
    assert.notEqual(Boss.seedFor('2026-11-09', 1), Boss.seedFor('2026-11-09', 2));
    assert.notEqual(Boss.questionSeed('2026-11-09', 1, 0), Boss.questionSeed('2026-11-09', 1, 0, 1));
});

test('pokusy: tři za týden, počítá se nejlepší, po výhře konec; emblém a první výhra', () => {
    const week = '2026-11-09';
    let state = Boss.emptyState();
    state = Boss.startAttempt(state, week, { now: 1, owner: 'host' });
    assert.equal(state.open.n, 1);
    assert.equal(Boss.attemptsUsed(state, week), 1, 'rozehraný souboj se počítá');
    assert.equal(Boss.startAttempt(state, week), null, 'druhý souboj naráz nejde');
    const slow = { correct: true, ms: 15000 };
    for (const row of [slow, slow, { correct: false, ms: 1 }, { correct: false, ms: 1 }, { correct: false, ms: 1 }]) state = { ...state, open: Boss.addResult(state.open, row) };
    let done = Boss.finishAttempt(state, 5);
    state = done.state;
    assert.equal(state.open, null);
    assert.equal(done.firstWin, false);
    assert.deepEqual(state.weeks[week].attempts.map(row => [row.n, row.damage, row.defeated, row.correct, row.hearts, row.synced]), [[1, 122, false, 2, 0, false]]);
    assert.equal(Boss.bestDamage(state, week), 122);
    // Server ví o dalším pokusu z jiného zařízení (2 použité): třetí pokus je poslední
    state = Boss.startAttempt(state, week, { server: { attempts: 2, best_damage: 300, defeated: false } });
    assert.equal(state.open.n, 3);
    for (let i = 0; i < 9; i++) state = { ...state, open: Boss.addResult(state.open, { correct: true, ms: 100 }) };
    // Odpověď po konci souboje se nezapíše
    assert.equal(Boss.addResult(state.open, { correct: true, ms: 1 }).results.length, 9);
    done = Boss.finishAttempt(state, 6);
    state = done.state;
    assert.equal(done.firstWin, true);
    assert.equal(done.status.won, true);
    assert.equal(state.emblems.kapitan, week);
    assert.ok(Boss.isDefeated(state, week));
    assert.equal(Boss.startAttempt(state, week), null, 'poražený boss: další souboj už ne');
    assert.deepEqual(Boss.emblemsOf(state), { kapitan: week });
    assert.deepEqual(Boss.emblemsOf(Boss.emptyState(), { 'boss-rytir': '2026-11-01' }), { rytir: true }, 'emblém z odznaků účtu');
    // Pokusy došly bez výhry
    let out = Boss.emptyState();
    for (let n = 0; n < 3; n++) out = Boss.finishAttempt(Boss.startAttempt(out, week), n).state;
    assert.equal(Boss.attemptsUsed(out, week), 3);
    assert.equal(Boss.startAttempt(out, week), null);
    assert.equal(Boss.startAttempt(Boss.emptyState(), week, { server: { attempts: 3, best_damage: 0, defeated: false } }), null, 'server: pokusy došly');
    assert.equal(Boss.startAttempt(Boss.emptyState(), week, { server: { attempts: 1, best_damage: 700, defeated: true } }), null, 'server: poraženo jinde');
});

test('uložený stav: čištění, starý rozehraný souboj se po týdnu uzavře, otázka na obrazovce zůstane', () => {
    assert.deepEqual(Boss.parseState(null), Boss.emptyState());
    assert.deepEqual(Boss.parseState('nesmysl'), Boss.emptyState());
    const raw = {
        weeks: { '2026-11-09': { boss: 'kapitan', attempts: [{ n: 1, damage: 9999, correct: 4, hearts: 0, at: 1, owner: 'u-1', synced: true, idx: 0 }, null, 'x'], xp: true, bonus: 'claimed' },
            '2026-11-10': { boss: 'kapitan', attempts: [] }, 'nesmysl': {} },
        emblems: { kapitan: '2026-11-09', neznamy: '2026-11-09', rytir: 'včera' },
        claims: { 'u-1': '2026-11-02', 'u-2': 'x' },
        open: { week: '2026-11-09', boss: 'kapitan', n: 2, owner: 'host', at: 5, results: [{ correct: true, ms: 1200, answer: 'Praha' }], plan: [{ topic: 'zemepis', q: 'Q1' }, { topic: 'zemepis', q: 'Q2' }],
            shown: { slot: 1, at: 7, data: { question: { title: 'Co je to?' } } } }
    };
    const state = Boss.parseState(raw);
    assert.deepEqual(Object.keys(state.weeks), ['2026-11-09'], 'jen platné týdny (pondělí)');
    assert.equal(state.weeks['2026-11-09'].attempts.length, 1);
    assert.equal(state.weeks['2026-11-09'].attempts[0].damage, 700, 'poškození nejvýš 700');
    assert.equal(state.weeks['2026-11-09'].attempts[0].defeated, true);
    assert.deepEqual(state.emblems, { kapitan: '2026-11-09' });
    assert.deepEqual(state.claims, { 'u-1': '2026-11-02' });
    assert.equal(state.open.shown.slot, 1);
    assert.equal(state.open.results[0].answer, 'Praha');
    // Otázka na obrazovce jen pro další nezodpovězenou
    assert.equal(Boss.parseState({ ...raw, open: { ...raw.open, shown: { ...raw.open.shown, slot: 0 } } }).open.shown, null);
    // Nový týden: rozehraný souboj se uzavře, jak stál
    const next = Boss.rollover(state, '2026-11-16');
    assert.equal(next.open, null);
    assert.deepEqual(next.weeks['2026-11-09'].attempts.map(row => [row.n, row.damage]), [[1, 700], [2, 80]]);
    assert.equal(Boss.rollover(state, '2026-11-09'), state, 'stejný týden beze změny');
});

test('dlaždice na úvodu: 3 pokusy, souboj běží, zbývající životy, poraženo; obrázek podle stupně', () => {
    const week = '2026-11-09';
    const fresh = Boss.homeTile({ week });
    assert.equal(fresh.text, '3 pokusy');
    assert.ok(fresh.fresh);
    assert.equal(fresh.stage, 1);
    assert.equal(fresh.art, Boss.artFor('kapitan', 1));
    assert.match(fresh.label, /Kapitán Mudrlant/);
    assert.equal(Boss.homeTile({ week, used: 1, open: true }).text, 'Souboj běží');
    const played = Boss.homeTile({ week, used: 1, best: 266 });
    assert.equal(played.text, '❤ 62 %');
    assert.equal(played.stage, 2);
    assert.match(played.label, /Zbývá mu 62 % životů, zbývají 2 pokusy/);
    assert.ok(!played.fresh);
    assert.equal(Boss.homeTile({ week, used: 3, best: 600 }).stage, 3);
    assert.match(Boss.homeTile({ week, used: 3, best: 600 }).label, /pokusy na tento týden došly/);
    const won = Boss.homeTile({ week, used: 2, best: 700, defeated: true });
    assert.equal(won.text, 'Poraženo!');
    assert.equal(won.art, Boss.artFor('kapitan', 4));
    for (const tile of [fresh, played, won]) assert.ok(tile.text.length <= 14, tile.text);
    assert.equal(Boss.attemptsLeftText(1), 'zbývá 1 pokus');
    assert.equal(Boss.attemptsLeftText(2), 'zbývají 2 pokusy');
    assert.equal(Boss.attemptsLeftText(0), 'zbývá 0 pokusů');
});

test('odměny a společná lišta: 150 XP za výhru, bonus 50 XP při aspoň polovině', () => {
    assert.equal(Boss.winXp().total, 150);
    assert.equal(Boss.communityXp().total, 50);
    assert.equal(Boss.communityReached({ players: 10, defeated: 5 }), true);
    assert.equal(Boss.communityReached({ players: 10, defeated: 4 }), false);
    assert.equal(Boss.communityReached({ players: 0, defeated: 0 }), false);
    assert.match(Boss.communityHtml({ stats: { players: 10, defeated: 3 }, signedIn: true }), /Bosse tento týden porazilo 30 % hráčů/);
    assert.match(Boss.communityHtml({ stats: { players: 4, defeated: 2 }, signedIn: true }), /Zatím splněno! Když to vydrží do neděle/);
    assert.match(Boss.communityHtml({ stats: { players: 4, defeated: 2 }, signedIn: true, over: true }), /Cíl splněn!/);
    assert.match(Boss.communityHtml({ stats: { players: 0, defeated: 0 }, signedIn: true }), /Zatím to nikdo nezkusil/);
    assert.match(Boss.communityHtml({ signedIn: false, canLogin: true }), /data-action="boss-login"/);
    assert.match(Boss.communityHtml({ signedIn: true, loading: true }), /Načítám/);
});

test('HTML: úvod, souboj, výsledek a síň bez inline stylů, texty escapované', () => {
    const boss = Boss.BY_ID.kapitan;
    const status = Boss.fightStatus([{ correct: true, ms: 1 }]);
    const html = [
        Boss.introHtml({ boss, week: '2026-11-09', speech: '<b>Ahoj</b>', community: '', next: Boss.BY_ID.rytir, topicTitle: 'Zeměpis' }),
        Boss.introHtml({ boss, week: '2026-11-09', used: 3, best: 300, community: '' }),
        Boss.stripHtml({ boss, status, slot: 1 }),
        Boss.resultHtml({ boss, status: Boss.fightStatus(Array(9).fill({ correct: true, ms: 1 })), n: 1, used: 1, emblemNew: true, line: 'x', emblemHtml: '' }, { xpLine: () => '' }),
        Boss.resultHtml({ boss, status, n: 2, used: 2, best: 80, line: 'y' }),
        Boss.hallHtml({ week: '2026-11-09', emblems: { kapitan: '2026-11-09' } }, { medal: () => '<span></span>', topicTitle: () => 'Téma' }),
        Boss.rulesHtml(boss, 'Zeměpis'),
        Boss.bubbleHtml(boss, 'Ha!', 'taunt'),
        Boss.heartsHtml(1, 1)
    ].join('');
    assert.ok(!/\sstyle=/.test(html), 'žádné inline styly (CSP)');
    assert.ok(!html.includes('<b>Ahoj</b>') && html.includes('&lt;b&gt;Ahoj&lt;/b&gt;'));
    assert.match(Boss.introHtml({ boss, week: '2026-11-09', community: '' }), /data-action="boss-start"[^>]*>[\s\S]*Do souboje/);
    assert.match(Boss.introHtml({ boss, week: '2026-11-09', used: 3, community: '', next: Boss.BY_ID.rytir }), /V pondělí přijde Rytíř Mudrlant/);
    assert.match(Boss.resultHtml({ boss, status, n: 1, used: 1, best: 80, line: '' }), /data-action="boss-again"/);
    assert.ok(!/data-action="boss-again"/.test(Boss.resultHtml({ boss, status, n: 3, used: 3, best: 80, line: '' })), 'bez pokusů už ne');
    assert.equal((Boss.hallHtml({ week: '2026-11-09' }, {}).match(/data-boss-hall=/g) || []).length, 8);
    // Všechny obrázky bosse se nepřebarví podle obleku Mudrlanta (data-keep)
    assert.ok([...html.matchAll(/<img [^>]*>/g)].every(match => match[0].includes('data-keep')));
});
