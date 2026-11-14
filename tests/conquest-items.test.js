// Pomůcky do Dobývání (blok 30) v aplikaci: Tah navíc a Půl na půl v conquest.js (strop shodný se serverem, kdy jde Půl na půl, výběr
// dvou špatných možností, zprávy o zisku, pečeť, pruh v rozcestníku, okno Pomůcky, nabídka a štítek Tahu navíc, tlačítko ½ a přeškrtnuté
// možnosti, „½“ u účastníků bitvy, „+1“ u tahů, záznam v kronice, nápověda) a volání v social.js (zásoba, zisk, použití, databáze bez
// bloku 30). Texty bez rodu hráče. Chování v databázi hlídá tests/sql-pomucky.test.js, v prohlížeči tests/e2e-conquest.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../conquest.js');

const ROOT = path.join(__dirname, '..');
const evropa = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dobyvani-evropa.json'), 'utf8'));
const GAME = '11111111-2222-3333-4444-555555555555';
const SIEGE = '99999999-8888-7777-6666-555555555555';
const GENDERED = /\b(použil|použila|získal|získala|dostal|dostala|odpověděl|odpověděla|zaútočil|zaútočila|vyhrál|vyhrála)\b/;
const state = (extra = {}) => ({
    id: GAME, map: 'evropa', status: 'running', period: 'day', actions: 2, ends_at: '2026-11-15T10:00:00Z',
    players: [
        { id: 'A', display_name: 'Jana', seat: 0, flag_color: 'cervena', emblem: 'lev', me: true, score: 2 },
        { id: 'B', display_name: 'Petr', seat: 1, flag_color: 'modra', emblem: 'orel', score: 2 }
    ],
    territories: evropa.t.map(t => ({ t: t.id, o: { Q213: 'A', Q214: 'A', Q183: 'B', Q36: 'B' }[t.id] || null, l: 0, h: t.id === 'Q213' || t.id === 'Q36', p: false })),
    budget: { period: 1, base: 2, used: 2, total: 2, left: 0, extra: 0 },
    budgets: { A: { left: 0, total: 2, extra: 0 }, B: { left: 1, total: 3, extra: 1 } },
    items: { extra_move: 1, fifty: 2, max: { extra_move: 1, fifty: 2 }, extra_used: false, fifty_used: false, can_extra: true, extra_block: null },
    moves: [{ id: 1, u: 'A', k: 'home', t: 'Q213', r: 'home', n: 0, at: '2026-11-12T10:00:00Z' },
        { id: 7, u: 'B', k: 'extra', t: null, r: 'extra', ok: true, n: 1, at: '2026-11-13T10:00:00Z' }],
    ...extra
});
const view = (extra) => C.viewOf(state(extra), evropa, 'A');
const QUESTION = { kind: 'capital', prompt: 'Které město je hlavním městem Rakouska?', difficulty: 1,
    choices: [{ label: 'Varšava' }, { label: 'Vídeň', correct: true }, { label: 'Budapešť' }, { label: 'Záhřeb' }] };

test('pravidla: strop a názvy stejné jako na serveru; Půl na půl jen u 4 textových nebo obrázkových možností; odebere vždy dvě špatné', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    assert.match(schema, /player_item_cap\(item text\) returns integer\s+language sql immutable as \$\$ select case item when 'extra_move' then 1 when 'fifty' then 2 end \$\$;/);
    assert.deepEqual(C.ITEM_IDS, ['extra_move', 'fifty']);
    assert.deepEqual([C.ITEMS.extra_move.max, C.ITEMS.fifty.max], [1, 2]);
    assert.deepEqual([C.ITEMS.extra_move.name, C.ITEMS.fifty.name], ['Tah navíc', 'Půl na půl']);
    // Server odmítá stejné druhy otázek (conquest_use_fifty)
    assert.match(schema, /coalesce\(s\.question ->> 'kind', ''\) in \('map', 'year', 'number'\)/);
    assert.equal(C.fiftyAllowed(QUESTION), true);
    assert.equal(C.fiftyAllowed({ ...QUESTION, kind: 'flag', images: true }), true, 'vlajky (obrázky)');
    assert.equal(C.fiftyAllowed({ ...QUESTION, kind: 'mudrlant', content: { text: 'Popis' } }), true, 'otázka Mudrlanta');
    for (const kind of ['map', 'year', 'number']) assert.equal(C.fiftyAllowed({ ...QUESTION, kind }), false, kind);
    assert.equal(C.fiftyAllowed({ ...QUESTION, choices: QUESTION.choices.slice(0, 3) }), false, 'jen se 4 možnostmi');
    assert.equal(C.fiftyAllowed(null), false);
    for (let seed = 0; seed < 20; seed++) {
        let n = seed;
        const picks = C.fiftyPick(QUESTION, () => ((n = (n * 9301 + 49297) % 233280) / 233280));
        assert.equal(picks.length, 2);
        assert.ok(!picks.includes(1), 'správnou nikdy');
        assert.ok(picks[0] < picks[1] && picks.every(i => i >= 0 && i < 4));
    }
    assert.equal(C.fiftyPick({ ...QUESTION, choices: QUESTION.choices.map(({ label }) => ({ label })) }), null, 'bez správné (otázka bitvy od serveru) ne');
});

test('zisk pomůcky: nová = oslava „Nová pomůcka do Dobývání“, plná zásoba = zpráva, už započítaný zdroj nic', () => {
    assert.deepEqual(C.grantNews({ kind: 'fifty', granted: true, count: 1 }), { kind: 'new', title: 'Nová pomůcka do Dobývání', text: 'Půl na půl (1/2)' });
    assert.deepEqual(C.grantNews({ kind: 'extra_move', granted: true, count: 1 }), { kind: 'new', title: 'Nová pomůcka do Dobývání', text: 'Tah navíc (1/1)' });
    assert.deepEqual(C.grantNews({ kind: 'extra_move', granted: false, full: true, count: 1 }), { kind: 'full', text: 'Tah navíc už máš, víc jich mít nejde.' });
    assert.deepEqual(C.grantNews({ kind: 'fifty', granted: false, full: true, count: 2 }), { kind: 'full', text: 'Půl na půl už máš dvakrát, víc jich mít nejde.' });
    assert.deepEqual(C.grantNews({ kind: 'fifty', granted: true, already: true, count: 2 }), { kind: null });
    assert.deepEqual(C.grantNews({ kind: 'fifty', granted: false, lucky: false }), { kind: null }, 'truhla bez štěstí');
    assert.deepEqual(C.grantNews(null), { kind: null });
});

test('rozcestník a okno Pomůcky: zásoba, co dělají, jak je získat; ve hře tlačítko Tahu navíc, nebo proč ne', () => {
    const strip = C.itemsStripHtml({ extra_move: 0, fifty: 2 });
    assert.match(strip, /data-cq="items"/);
    assert.match(strip, /aria-label="Pomůcky: Tah navíc 0 z 1, Půl na půl 2 ze 2\. Co dělají a jak je získat"/);
    assert.match(strip, /cq-item-extra_move cq-item-empty/, 'prázdná zásoba zašedlá');
    assert.equal(C.itemsStripHtml(null), '', 'starší databáze bez pomůcek: nic');
    // Moje hry: pruh pod pozvánkami; bez her rada zůstane i s pruhem
    const empty = C.mineHtml({ games: [], items: { extra_move: 1, fifty: 0 } });
    assert.match(empty, /data-cq-items[\s\S]*Zatím nehraješ žádnou hru/);
    const hub = C.itemsDialogHtml({ extra_move: 1, fifty: 0 });
    assert.match(hub, /Tah navíc[\s\S]*1\/1[\s\S]*Jak získat:<\/b> Poražený Boss týdne \(první výhra v týdnu\) a 15\. stupeň Sezóny Mudrlanta\./);
    assert.match(hub, /Půl na půl[\s\S]*0\/2[\s\S]*Kvíz dne bez chyby a celá Řetězovka \(obojí jednou za týden\), výhra v Dobývání, 5\. stupeň Sezóny Mudrlanta a vzácně Truhla Mudrlanta\./);
    assert.doesNotMatch(hub, /data-cq="extra-use"/, 'mimo hru nic k použití');
    const game = C.itemsDialogHtml(state().items, { game: true });
    assert.match(game, /data-cq="extra-use"[^>]*>[\s\S]*Použít Tah navíc/);
    assert.match(game, /Použiješ ji u otázky: tlačítko ½ vedle hvězdiček\./);
    const blocked = C.itemsDialogHtml({ ...state().items, can_extra: false, extra_block: 'V posledním kole hry Tah navíc použít nejde.' }, { game: true });
    assert.match(blocked, /V posledním kole hry Tah navíc použít nejde\./);
    assert.doesNotMatch(blocked, /data-cq="extra-use"/);
    const used = C.itemsDialogHtml({ ...state().items, extra_move: 0, extra_used: true, fifty_used: true, can_extra: false }, { game: true });
    assert.match(used, /V této hře už je použitý\.[\s\S]*V této hře už je použitá\./);
    for (const html of [strip, hub, game, blocked, used, C.extraConfirmHtml(state().items)]) {
        assert.doesNotMatch(html, /\sstyle=/);
        assert.doesNotMatch(html, GENDERED);
    }
    assert.match(C.extraConfirmHtml(state().items), /V tomto kole budeš mít o 1 tah víc\.[\s\S]*Máš 1 z 1\.[\s\S]*data-cq="extra-confirm"[\s\S]*data-cq="extra-cancel"/);
});

test('Tah navíc ve hře: nabídka v listu území a štítek na mapě, až tahy dojdou; „+1“ u počítadla a u tahů hráče; záznam v kronice', () => {
    const v = view();
    assert.equal(C.extraReady(v), true);
    const sheet = C.sheetHtml(v, 'Q40');
    assert.match(sheet, /Tahy na tohle období už nemáš\.[\s\S]*data-cq="extra-use"[\s\S]*Použít Tah navíc[\s\S]*\+1 tah v tomto kole · máš 1 z 1/);
    assert.equal(C.actionsFor(v, 'Q40').spent, true);
    assert.match(C.extraChipHtml(v), /data-cq="extra-use"[\s\S]*Tah navíc/);
    // S tahy, bez zásoby, ve skončené hře nic
    const playing = view({ budget: { period: 1, base: 2, used: 1, total: 2, left: 1, extra: 0 } });
    assert.equal(C.extraChipHtml(playing), '');
    assert.doesNotMatch(C.sheetHtml(playing, 'Q40'), /extra-use/);
    assert.equal(C.extraChipHtml(view({ items: { ...state().items, can_extra: false } })), '');
    assert.equal(C.extraChipHtml(view({ items: null })), '');
    assert.equal(C.extraChipHtml(view({ status: 'finished' })), '');
    // Počítadlo s Tahem navíc: „+1“ (i pro čtečku) a tooltip; pořadí: „+1“ u Petra, který ho použil
    const boosted = C.gameScreenHtml(view({ budget: { period: 1, base: 2, used: 2, total: 3, left: 1, extra: 1 } }));
    assert.match(boosted, /data-cq="items" data-cq-budget[^>]*title="Tahy v tomto období \(včetně tahu navíc\)\. Klepni pro pomůcky">[\s\S]*1\/3<span data-cq-extra[^>]*><span aria-hidden="true">\+1<\/span><span class="sr-only">, včetně tahu navíc<\/span>/);
    const strip = C.playersStripHtml(v);
    assert.match(strip, /aria-label="tahy 1 z 3, včetně tahu navíc" data-cq-moves-extra/);
    assert.equal((strip.match(/data-cq-moves-extra/g) || []).length, 1, 'jen u toho, kdo ho použil');
    // Kronika: Tah navíc s hráčem, bez území, bez rodu
    const items = C.feedItems(state().moves, v);
    assert.deepEqual([items[0].title, items[0].text, items[0].actor.id, items[0].tone, items[0].icon], ['Tah navíc', '+1 tah v 2. kole', 'B', 'gold', C.ITEMS.extra_move.icon]);
    assert.match(C.feedHtml(items), /Tah navíc: \+1 tah v 2\. kole/);
    assert.match(C.recentHtml(v), /Tah navíc[\s\S]*\+1 tah v 2\. kole[\s\S]*Petr/);
    // Okno Kolo dohráno: nabídka pro hráče, který Tah navíc může použít
    const round = { period: 1, started_at: '2026-11-13T10:00:00Z', ends_at: '2026-11-13T10:05:00Z', done: true, ready: [], next_at: null, can_ready: true, last: false };
    assert.match(C.roundHtml(v, round, { now: Date.parse('2026-11-13T10:01:00Z') }), /Chci další kolo[\s\S]*data-cq="extra-use"/);
    assert.doesNotMatch(C.roundHtml(view({ items: { ...state().items, can_extra: false } }), round, { now: Date.parse('2026-11-13T10:01:00Z') }), /extra-use/);
});

test('Půl na půl u otázky: tlačítko ½ (nabídka, potvrzení, použito), odebrané možnosti přeškrtnuté a vypnuté; v bitvě „½“ u účastníků', () => {
    const offer = C.questionHtml(QUESTION, { title: 'Útok na Rakousko', fifty: { state: 'offer', items: { fifty: 2 } } });
    assert.match(offer, /data-cq="fifty"[^>]*aria-label="Půl na půl: odebere dvě špatné odpovědi \(máš 2 ze 2\)"[\s\S]*½[\s\S]*Půl na půl/);
    assert.match(C.questionHtml(QUESTION, { title: 'Útok', fifty: { state: 'confirm', items: { fifty: 2 } } }), /cq-fifty-confirm[\s\S]*Opravdu\?/);
    assert.doesNotMatch(C.questionHtml(QUESTION, { title: 'Útok' }), /data-cq="fifty"/, 'bez pomůcky nic');
    const gone = C.questionHtml(QUESTION, { title: 'Útok', fifty: { state: 'used' }, removed: [0, 2], fresh: true });
    assert.match(gone, /data-cq-fifty-used/);
    assert.match(gone, /data-cq-answer="0" disabled data-cq-gone class="cq-choice cq-choice-gone cq-choice-gone-in/);
    assert.match(gone, /data-cq-answer="2" disabled data-cq-gone/);
    assert.match(gone, /data-cq-answer="1"  class="cq-choice flex/, 'zbylé možnosti jdou');
    // Otázka Mudrlanta přes celou obrazovku: totéž
    const full = C.questionHtml({ ...QUESTION, kind: 'mudrlant', content: { text: 'Hlavní město na Dunaji.' } }, { title: 'Útok', kind: 'attack', fifty: { state: 'used' }, removed: [2, 3] });
    assert.match(full, /data-cq-full[\s\S]*data-cq-fifty-used[\s\S]*data-cq-answer="2" disabled data-cq-gone[\s\S]*data-cq-answer="3" disabled data-cq-gone/);
    // Bitva: účastníci, čekání a výsledek s „½“
    const v = view();
    const fighters = [{ id: 'A', fifty: true }, { id: 'B', fifty: false }];
    const row = C.fightersHtml(v, fighters);
    assert.match(row, /data-cq-fighter="A"[\s\S]*ty<\/span><span class="cq-half-badge[^"]*" title="Pomůcka Půl na půl" aria-label="s pomůckou Půl na půl">½/);
    assert.equal((row.match(/cq-half-badge/g) || []).length, 1);
    const siege = { id: SIEGE, territory: 'Q40', status: 'resolved', outcome: 'capture', participants: [{ id: 'B', fifty: true, winner: true, answer_ms: 2100, answered: true }, { id: 'A', fifty: false, result: 'outrun', answer_ms: 3900, answered: true }] };
    assert.match(C.battleResultHtml(v, siege), /data-cq-result-player="B"[\s\S]*Petr<\/span><span class="cq-half-badge/);
    assert.match(C.battleWaitHtml(v, { ...siege, status: 'open', participants: [{ id: 'A', me: true, fifty: true }, { id: 'B' }] }, { correct: true, answerMs: 3000 }), /ty<\/span><span class="cq-half-badge/);
});

test('nápověda: záložka Pomůcky (obě pomůcky, jednou za hru, odkud), bez rodu; ikony pomůcek jsou v icons.js', () => {
    assert.deepEqual(C.HELP_TABS.map(([id]) => id), ['zaklady', 'utok', 'regiony', 'konec', 'pomucky']);
    const help = C.helpHtml('pomucky');
    assert.match(help, /data-cq-help="pomucky"/);
    assert.match(help, /Pomůcky:<\/b> Vzácné pomůcky máš v zásobě: nejvýš 1 Tah navíc a 2 Půl na půl\. Každou jde v jedné hře použít jen jednou\./);
    assert.match(help, /Tah navíc:<\/b> O 1 tah víc v tomto kole\. Nabídne se, když ti tahy dojdou\. V posledním kole hry ne\./);
    assert.match(help, /Půl na půl:<\/b> Tlačítko ½ u otázky se 4 možnostmi odebere dvě špatné odpovědi\. Jde i v bitvě/);
    assert.match(help, /Jak získat:<\/b> Tah navíc: Boss týdne \(první výhra v týdnu\) a 15\. stupeň Sezóny\. Půl na půl: Kvíz dne bez chyby a celá Řetězovka \(obojí jednou za týden\), výhra v Dobývání, 5\. stupeň Sezóny a vzácně Truhla Mudrlanta\./);
    assert.doesNotMatch(help, /Dál:/, 'poslední záložka');
    assert.match(C.helpHtml('konec'), /Dál: Pomůcky/);
    assert.doesNotMatch(C.HELP_TABS.map(([id]) => C.helpHtml(id)).join(''), GENDERED);
    const icons = fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8');
    for (const name of [C.ITEMS.extra_move.icon, C.ITEMS.fifty.icon, 'info', 'chevron-right']) assert.ok(icons.includes(`"${name}":`), name);
    // Obrázky pomůcek (č. 309 a 310) zatím nejsou: pečeť z ikony; prompty jsou v docs/OBRAZKY.md
    const prompts = fs.readFileSync(path.join(ROOT, 'docs', 'OBRAZKY.md'), 'utf8');
    assert.match(prompts, /#### 309\. `tah-navic\.png`/);
    assert.match(prompts, /#### 310\. `pul-na-pul\.png`/);
    assert.ok(C.ITEM_IDS.every(kind => C.ITEMS[kind].art === null || fs.existsSync(path.join(ROOT, 'icons', 'topics', `${C.ITEMS[kind].art}.webp`))));
});

const loadSocial = (handler) => {
    const calls = [];
    global.self = { MUDRLANT_CONFIG: { supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' }, MudrlantAuth: { accessToken: async () => 'tok' } };
    global.fetch = async (url, options) => {
        const name = String(url).split('/rpc/')[1];
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ name, body });
        const [status, json] = handler(name, body);
        return { ok: status < 300, status, json: async () => json, text: async () => (json === null ? '' : JSON.stringify(json)) };
    };
    const file = require.resolve('../social.js');
    delete require.cache[file];
    return { Social: require(file), calls, done: () => { delete global.self; delete global.fetch; delete require.cache[file]; } };
};

test('social.js: zásoba, zisk ze sezóny a truhly, Tah navíc a Půl na půl; zisk v Bossovi, Kvízu dne, Řetězovce a výhře; databáze bez bloku 30', async () => {
    let missing = false;
    const { Social, calls, done } = loadSocial((name, body) => {
        if (missing) return [404, { message: 'Could not find the function' }];
        if (name === 'player_items_mine') return [200, { extra_move: 3, fifty: 1, max: { extra_move: 9 } }];
        if (name === 'player_items_claim') return [200, { kind: 'fifty', granted: true, full: false, already: false, count: 1, max: 2, lucky: true, items: { extra_move: 0, fifty: 1 } }];
        if (name === 'conquest_use_extra') return [200, { id: GAME, map: 'evropa', players: [], used: 'extra_move', items: { extra_move: 0, fifty: 1, extra_used: true, can_extra: false, extra_block: 'Tah navíc jde v jedné hře použít jen jednou.' } }];
        if (name === 'conquest_use_fifty') return [200, { removed: body.siege ? [3, 0, 9] : null, items: { extra_move: 0, fifty: 0 }, fifty_used: true }];
        if (name === 'boss_submit') return [200, { week: '2026-11-09', attempts: 1, best_damage: 700, defeated: true, first_win: true, item: { kind: 'extra_move', granted: true, count: 1 } }];
        if (name === 'chain_submit') return [200, { links: 7, score: 28, rescued: false, rank: 1, item: { kind: 'fifty', granted: false, full: true, count: 2 } }];
        if (name === 'daily_quiz_answer') return [200, { day: '2026-11-12', started: true, answered: 10, correct: 10, finished: true, item: { kind: 'fifty', granted: true, count: 1 } }];
        if (name === 'conquest_claim') return [200, { place: 1, players: 2, score: 5, eligible: true, claimed_now: true, item: { kind: 'fifty', granted: true, count: 2 } }];
        if (name === 'conquest_state') return [200, { id: GAME, map: 'evropa', status: 'running', players: [], round: null, items: { extra_move: 1, fifty: 2, can_extra: true, extra_block: null } }];
        return [400, { message: 'neznámé' }];
    });
    try {
        assert.deepEqual(await Social.playerItemsMine(), { extra_move: 1, fifty: 1, max: { extra_move: 1, fifty: 2 } }, 'strop i v aplikaci');
        const claimed = await Social.playerItemsClaim('season', 'season:2026-11:5');
        assert.deepEqual(calls.pop(), { name: 'player_items_claim', body: { source: 'season', key: 'season:2026-11:5' } });
        assert.deepEqual(claimed, { kind: 'fifty', granted: true, full: false, already: false, count: 1, max: 2, lucky: true, items: { extra_move: 0, fifty: 1, max: { extra_move: 1, fifty: 2 } } });
        const used = await Social.conquestUseExtra(GAME);
        assert.deepEqual(calls.pop(), { name: 'conquest_use_extra', body: { game: GAME } });
        assert.deepEqual(used.items, { extra_move: 0, fifty: 1, max: { extra_move: 1, fifty: 2 }, extra_used: true, fifty_used: false, can_extra: false, extra_block: 'Tah navíc jde v jedné hře použít jen jednou.' });
        assert.deepEqual(await Social.conquestUseFifty(GAME, { target: 'Q40' }), { removed: null, items: { extra_move: 0, fifty: 0, max: { extra_move: 1, fifty: 2 } }, fifty_used: true });
        assert.deepEqual(calls.pop().body, { game: GAME, siege: null, target: 'Q40' });
        assert.deepEqual((await Social.conquestUseFifty(GAME, { siege: SIEGE })).removed, [3, 0]);
        assert.deepEqual(calls.pop().body, { game: GAME, siege: SIEGE, target: null });
        assert.equal((await Social.conquestState(GAME)).items.can_extra, true);
        // Zisky z ostatních módů projdou čištěním
        assert.deepEqual((await Social.bossSubmit('2026-11-09', 0, 700, true)).item, { kind: 'extra_move', granted: true, full: false, already: false, count: 1, max: 1 });
        assert.deepEqual((await Social.chainSubmit('2026-11-12', 7, 28, false)).item, { kind: 'fifty', granted: false, full: true, already: false, count: 2, max: 2 });
        assert.equal((await Social.dailyQuizAnswer('2026-11-12', 9, { correct: true, points: 3, ms: 3000 })).item.granted, true);
        assert.deepEqual((await Social.conquestClaim(GAME)).item, { kind: 'fifty', granted: true, full: false, already: false, count: 2, max: 2 });
        assert.equal(Social.cleanItemGrant({ kind: 'zlato', granted: true }), null, 'neznámý druh ne');
        // Databáze bez bloku 30: srozumitelná chyba 404 a příznak, Dobývání jede dál
        assert.equal(Social.conquestItemsMissing(), false);
        missing = true;
        await assert.rejects(Social.playerItemsMine(), (error) => error.status === 404 && /Pomůcky do Dobývání zatím nejdou/.test(error.message));
        assert.equal(Social.conquestItemsMissing(), true);
        await assert.rejects(Social.conquestUseExtra(GAME), (error) => error.status === 404);
    } finally { done(); }
});
