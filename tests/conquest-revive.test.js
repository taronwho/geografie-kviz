// Pomůcka Vzkříšení v Dobývání (blok 39) v aplikaci (conquest.js): kdy se nabídne (databáze ji zná, hráči nezbylo žádné území), platná
// území pro výběr (neutrální a cizí neopevněné, ne domovský hrad, bitva ani chráněné území; stejně jako server), ochrana 60 s (štít
// s odpočtem na mapě, zašedlé Zaútočit v listu území), okno „Všechna tvá území padla“ se Vzkříšením i bez něj, štítek dole na mapě, pruh
// výběru, kronika (i pro toho, kdo území ztratil), zisk, okno Pomůcky, pořadí hráčů bez bodů a rozcestník. Starší databáze: Návrat do hry
// jako dřív. Texty bez rodu hráče, bez vložených stylů. Chování v databázi hlídá tests/sql-vzkriseni.test.js, v prohlížeči
// tests/e2e-conquest.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../conquest.js');

const ROOT = path.join(__dirname, '..');
const evropa = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dobyvani-evropa.json'), 'utf8'));
const GAME = '11111111-2222-3333-4444-555555555555';
const GENDERED = /\b(přišel|přišla|použil|použila|získal|získala|dostal|dostala|ztratil|ztratila|vzkřísil|vzkřísila)\b/;
const NOW = Date.parse('2026-11-13T10:00:00Z');
const ITEMS = { extra_move: 0, fifty: 1, revive: 2, max: { extra_move: 1, fifty: 2, revive: 3 }, extra_used: false, fifty_used: false, can_extra: false,
    extra_block: 'Bez území Tah navíc použít nejde. Vrátit se můžeš pomůckou Vzkříšení.', can_revive: true, revive_block: null, revive_used: 0 };
// Hráč A nemá nic; B drží Německo (domov), Polsko a Rakousko (Palisáda), C Slovensko (neopevněné) a Česko chráněné po Vzkříšení
const OWNERS = { Q183: ['B', 0, true], Q36: ['B', 0, false], Q40: ['B', 1, false], Q214: ['C', 0, false], Q213: ['C', 0, false, '2026-11-13T10:00:42Z'] };
const state = (extra = {}) => ({
    id: GAME, map: 'evropa', status: 'running', period: 'day', actions: 3, ends_at: '2026-11-15T10:00:00Z', started_at: '2026-11-12T10:00:00Z',
    players: [
        { id: 'A', display_name: 'Jana', seat: 0, flag_color: 'cervena', emblem: 'lev', me: true, score: 0, score_at: '2026-11-13T09:00:00Z' },
        { id: 'B', display_name: 'Petr', seat: 1, flag_color: 'modra', emblem: 'orel', score: 3, score_at: '2026-11-13T08:00:00Z' },
        { id: 'C', display_name: 'Eva', seat: 2, flag_color: 'zelena', emblem: 'drak', score: 2, score_at: '2026-11-13T08:00:00Z' }
    ],
    territories: evropa.t.map(t => { const o = OWNERS[t.id]; return { t: t.id, o: o ? o[0] : null, l: o ? o[1] : 0, h: o ? o[2] : false, p: false, ...(o && o[3] ? { s: o[3] } : {}) }; }),
    budget: { period: 1, base: 3, used: 0, total: 3, left: 3, extra: 0 },
    items: ITEMS, sieges: [],
    moves: [{ id: 1, u: 'A', k: 'home', t: 'Q213', r: 'home', n: 0, at: '2026-11-12T10:00:00Z' },
        { id: 5, u: 'C', k: 'attack', t: 'Q213', r: 'capture', v: 'A', h: true, n: 1, at: '2026-11-13T09:00:00Z' },
        { id: 6, u: 'C', k: 'revive', t: 'Q214', r: 'respawn', v: 'B', n: 1, at: '2026-11-13T09:59:42Z' }],
    ...extra
});
const view = (extra = {}, me = 'A') => {
    const s = state(extra);
    s.players = s.players.map(player => ({ ...player, me: player.id === me }));
    const v = C.viewOf(s, evropa, me);
    v.offset = 0;
    return v;
};

test('kdy: jen s databází, která Vzkříšení zná, a jen hráči bez území; starší databáze Návrat do hry', () => {
    const v = view();
    assert.deepEqual([C.reviveOn(v), C.outOfGame(v)], [true, true]);
    assert.equal(C.reviveOn(view({ items: { ...ITEMS, can_revive: undefined } })), false, 'stav bez can_revive = databáze bez bloku 39');
    assert.equal(C.outOfGame(view({}, 'B')), false);
    assert.equal(C.outOfGame(view({ status: 'finished' })), false, 'po konci hry ne');
    // List území hráče bez území: proč nic, se Vzkříšením nabídka
    const actions = C.actionsFor(v, 'Q28');
    assert.deepEqual([actions.attack, actions.out, actions.reason], [false, true, 'Všechna tvá území padla. Vrať se do hry pomůckou Vzkříšení.']);
    assert.match(C.sheetHtml(v, 'Q28'), /Všechna tvá území padla\. Vrať se do hry pomůckou Vzkříšení\.[\s\S]*data-cq="revive-use"[\s\S]*Použít Vzkříšení[\s\S]*máš 2 ze 3/);
    const none = view({ items: { ...ITEMS, revive: 0, can_revive: false, revive_block: 'Vzkříšení teď nemáš.' } });
    assert.equal(C.actionsFor(none, 'Q28').reason, 'Všechna tvá území padla. Bez Vzkříšení hru už jen sleduješ.');
    assert.doesNotMatch(C.sheetHtml(none, 'Q28'), /revive-use/);
    const old = view({ items: { extra_move: 0, fifty: 0, max: {}, can_extra: false } });
    assert.equal(C.actionsFor(old, 'Q28').reason, 'Nemáš žádné území. V dalším období dostaneš nové.', 'starší databáze');
    assert.equal(C.reviveChipHtml(old), '');
});

test('platná území: neutrální a cizí neopevněné; ne domovský hrad, opevněné, obléhané ani chráněné (stejné hlášky jako server)', () => {
    const v = view();
    const targets = C.reviveTargets(v, NOW);
    assert.ok(targets.has('Q28') && targets.has('Q36') && targets.has('Q214'), 'neutrální Maďarsko, neopevněné Polsko a Slovensko');
    assert.ok(!targets.has('Q183') && !targets.has('Q40') && !targets.has('Q213'));
    assert.equal(C.reviveWhy(v, 'Q183', NOW), 'Domovský hrad Vzkříšením vzít nejde. Vyber volné nebo neopevněné území.');
    assert.equal(C.reviveWhy(v, 'Q40', NOW), 'Opevněné území Vzkříšením vzít nejde. Vyber volné nebo neopevněné území.');
    assert.equal(C.reviveWhy(v, 'Q213', NOW), 'Území je chráněné po vzkříšení ještě 42 s.');
    assert.equal(C.reviveWhy(v, 'Q213', NOW + 42500), '', 'po 60 s zase jde');
    const sieged = view({ sieges: [{ id: 'S', territory: 'Q36', status: 'open', participants: [] }] });
    assert.equal(C.reviveWhy(sieged, 'Q36', NOW), 'Na území právě probíhá bitva. Vyber jiné.');
    // Server: stejná pravidla a hlášky
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    for (const text of ['Domovský hrad Vzkříšením vzít nejde. Vyber volné nebo neopevněné území.', 'Opevněné území Vzkříšením vzít nejde. Vyber volné nebo neopevněné území.',
        'Území je chráněné po vzkříšení ještě % s.', 'Na území právě probíhá bitva. Vyber jiné.']) assert.ok(schema.includes(text), text);
    // Výběr: ztmavená mapa a zlatá záře jen platných území; pruh s počtem a Zrušit
    const layer = C.reviveLayerHtml(v, targets);
    assert.match(layer, /data-cq-revive-layer/);
    assert.equal((layer.match(/data-cq-revive-target=/g) || []).length, targets.size);
    assert.doesNotMatch(layer, /data-cq-revive-target="Q183"/);
    assert.match(C.reviveBarHtml(12), /Klepni na zářící území[\s\S]*12 území k výběru[\s\S]*data-cq="revive-cancel"[\s\S]*Zrušit/);
});

test('ochrana 60 s: štít s odpočtem na mapě, zašedlé Zaútočit s odpočtem v listu; po konci normální útok', () => {
    const real = Date.now;
    Date.now = () => NOW;
    try {
        const b = view({}, 'B');
        const actions = C.actionsFor(b, 'Q213');
        assert.deepEqual([actions.attack, actions.shielded, actions.reason], [false, true, 'Území je chráněné po vzkříšení ještě 42 s.']);
        const sheet = C.sheetHtml(b, 'Q213', { now: NOW });
        assert.match(sheet, /<button type="button" disabled data-cq-shielded[^>]*>[\s\S]*Zaútočit/);
        assert.match(sheet, /Území je chráněné po vzkříšení ještě <b data-cq-shield-at="\d+">42 s<\/b>\. Pak na něj půjde zaútočit\./);
        assert.doesNotMatch(sheet, /data-cq="attack"/);
        const map = C.mapSvg(evropa, b);
        assert.match(map, /data-shield="Q213"[\s\S]*data-cq-shield-at="\d+">42 s<\/text>/);
        assert.equal((map.match(/data-shield=/g) || []).length, 1, 'jen chráněné území');
        // Posun hodin serveru proti zařízení (offset) se počítá
        b.offset = 10000;
        assert.equal(C.actionsFor(b, 'Q213').reason, 'Území je chráněné po vzkříšení ještě 32 s.');
        Date.now = () => NOW + 43000;
        const later = view({}, 'B');
        assert.deepEqual([C.actionsFor(later, 'Q213').shielded, C.actionsFor(later, 'Q213').attack], [undefined, true]);
        assert.doesNotMatch(C.mapSvg(evropa, later), /data-shield=/);
        assert.match(C.sheetHtml(later, 'Q213'), /data-cq="attack"/);
        // Majitel svoje chráněné území opevnit smí
        assert.equal(C.actionsFor(view({ budget: { period: 1, base: 3, used: 0, total: 3, left: 3 } }, 'C'), 'Q213').fortify, true);
    } finally { Date.now = real; }
});

test('okno „Všechna tvá území padla“: se Vzkříšením Použít / Teď ne, bez něj jak ho získat; štítek na mapě; bez rodu a vložených stylů', () => {
    const offer = C.reviveOfferHtml(ITEMS);
    assert.match(offer, /data-cq-revive-offer[\s\S]*Všechna tvá území padla\.[\s\S]*Použít Vzkříšení\?[\s\S]*Na 60 s bude chráněné před útoky\. Domovské nebude\.[\s\S]*Máš 2 ze 3\.[\s\S]*data-cq="revive-start"[\s\S]*data-cq="revive-later"[\s\S]*Teď ne/);
    const none = C.reviveOfferHtml({ ...ITEMS, revive: 0, can_revive: false, revive_block: 'Vzkříšení teď nemáš.' });
    assert.match(none, /data-cq-revive-none[\s\S]*Vzkříšení nemáš, hru teď jen sleduješ\. Když ho během hry získáš, můžeš se vrátit\.[\s\S]*Jak získat Vzkříšení:<\/b> Jedno na začátek, dohraná započítaná hra Dobývání s body, série Kvízu dne \(7, 30, 100 a 365 dní\), 8\. stupeň Sezóny Mudrlanta a vzácně Truhla Mudrlanta nebo Zlatá truhla\. Nejvýš 3\./);
    assert.doesNotMatch(none, /revive-start/);
    const blocked = C.reviveOfferHtml({ ...ITEMS, can_revive: false, revive_block: 'Na mapě teď není žádné volné ani neopevněné území.' });
    assert.match(blocked, /Na mapě teď není žádné volné ani neopevněné území\./);
    assert.match(C.reviveChipHtml(view()), /data-cq="revive-use"[\s\S]*Vzkříšení 2\/3/);
    assert.match(C.reviveChipHtml(view({ items: { ...ITEMS, revive: 0, can_revive: false } })), /data-cq="revive-how"[\s\S]*Mimo hru · jak se vrátit/);
    assert.equal(C.reviveChipHtml(view({}, 'B')), '', 'kdo území má, štítek nemá');
    for (const html of [offer, none, blocked, C.reviveChipHtml(view()), C.reviveBarHtml(3), C.sheetHtml(view(), 'Q28'), C.helpHtml('konec'), C.helpHtml('pomucky')]) {
        assert.doesNotMatch(html, /\sstyle=/);
        assert.doesNotMatch(html, GENDERED);
    }
});

test('kronika: Vzkříšení s praporcem toho, kdo ho použil, a „dosud …“ u toho, kdo území ztratil; Návrat do hry ze starší databáze', () => {
    const v = view({}, 'B');
    const items = C.feedItems(state().moves, v);
    const revive = items.find(item => item.text === 'Vzkříšení');
    assert.deepEqual([revive.title, revive.tone, revive.icon, revive.actor.id, revive.victim.id], ['Slovensko', 'revive', C.ITEMS.revive.icon, 'C', 'B']);
    assert.match(C.feedHtml(items), /Slovensko: Vzkříšení[\s\S]*Eva<svg[\s\S]*· dosud ty/);
    assert.match(C.recentHtml(v), /cq-tone-revive[\s\S]*Slovensko[\s\S]*Vzkříšení/);
    assert.equal(C.feedItems([{ id: 9, u: 'B', k: 'respawn', r: 'respawn', t: 'Q20' }], v)[0].text, 'Návrat do hry');
    // Přehrání bere Vzkříšení jako změnu majitele (result respawn)
    assert.deepEqual(C.replaySteps([{ r: 'respawn', k: 'revive', t: 'Q214', u: 'C', n: 1 }]), [{ period: 1, changes: [{ t: 'Q214', owner: 'C' }] }]);
});

test('zisk, pečeť a okno Pomůcky: Vzkříšení bez značky, nejvýš 3; ve hře tlačítko jen bez území', () => {
    assert.deepEqual(C.grantNews({ kind: 'revive', granted: true, count: 2 }), { kind: 'new', title: 'Nová pomůcka do Dobývání', text: 'Vzkříšení (2/3). Vrátí tě do hry, když přijdeš o všechna území.' });
    assert.deepEqual(C.grantNews({ kind: 'revive', granted: true, count: 1, source: 'daily-streak', at: 7 }).text, 'Vzkříšení (1/3). Za 7 dní Kvízu dne v řadě. Vrátí tě do hry, když přijdeš o všechna území.');
    assert.deepEqual(C.grantNews({ kind: 'revive', granted: false, full: true, count: 3 }), { kind: 'full', text: 'Vzkříšení už máš třikrát, víc jich mít nejde.' });
    assert.deepEqual(C.grantNews({ kind: 'revive', granted: true, already: true }), { kind: null });
    const seal = C.itemSealHtml('revive');
    assert.match(seal, /cq-item-seal cq-item-revive[\s\S]*data-lucide="heart-pulse"/);
    assert.doesNotMatch(seal, /cq-item-mark/, 'bez značky');
    const strip = C.itemsStripHtml({ extra_move: 1, fifty: 0, revive: 2 });
    assert.match(strip, /aria-label="Pomůcky: Tah navíc 1 z 1, Půl na půl 0 ze 2, Vzkříšení 2 ze 3\. Co dělají a jak je získat"/);
    assert.doesNotMatch(C.itemsStripHtml({ extra_move: 1, fifty: 0 }), /Vzkříšení/, 'databáze bez bloku 39');
    const hub = C.itemsDialogHtml({ extra_move: 0, fifty: 0, revive: 1 });
    assert.match(hub, /Vzkříšení[\s\S]*1\/3[\s\S]*Když ti nezbude žádné území, vrátí tě do hry[\s\S]*nejvýš 1 Tah navíc, 2 Půl na půl a 3 Vzkříšení\./);
    assert.match(C.itemsDialogHtml(ITEMS, { game: true }), /data-cq="revive-use"[^>]*>[\s\S]*Použít Vzkříšení/);
    const owner = C.itemsDialogHtml({ ...ITEMS, can_revive: false, revive_block: 'Vzkříšení jde použít, jen když ti nezbylo žádné území.' }, { game: true });
    assert.match(owner, /Nabídne se samo, když přijdeš o všechna území\./);
    assert.doesNotMatch(owner, /revive-use/);
    assert.doesNotMatch(C.itemsDialogHtml({ extra_move: 0, fifty: 0 }), /Vzkříšení/);
});

test('pořadí: hráči bez bodů podle toho, kdo vydržel déle; rozcestník: hra bez mých území nečeká na tah', () => {
    const ranked = C.rank([
        { id: 'A', seat: 0, score: 0, score_at: '2026-11-13T09:00:00Z' },
        { id: 'B', seat: 1, score: 3, score_at: '2026-11-13T08:00:00Z' },
        { id: 'C', seat: 2, score: 0, score_at: '2026-11-13T11:00:00Z' },
        { id: 'D', seat: 3, score: 3, score_at: '2026-11-13T07:00:00Z' }
    ]);
    assert.deepEqual(ranked.map(player => [player.id, player.place]), [['D', 1], ['B', 2], ['C', 3], ['A', 4]]);
    const game = { id: GAME, map: 'evropa', status: 'running', actions: 3, ends_at: '2026-11-15T10:00:00Z', budget: { left: 3, total: 3 },
        players: [{ id: 'A', seat: 0, me: true, flag_color: 'cervena', emblem: 'lev' }, { id: 'B', seat: 1, flag_color: 'modra', emblem: 'orel' }], owners: { Q183: 1 } };
    assert.deepEqual([C.gameOut(game), C.movesLeft(game)], [true, 0]);
    assert.deepEqual([C.gameOut({ ...game, owners: { Q183: 1, Q213: 0 } }), C.movesLeft({ ...game, owners: { Q183: 1, Q213: 0 } })], [false, 3]);
    assert.match(C.mineHtml({ games: [game], items: null }), /všechna tvá území padla[\s\S]*Mapa/);
    assert.equal(C.homeTile({ games: [game] }).waits || 0, 0, 'nečeká na tah');
});

test('nápověda a pravidla: Vzkříšení místo Návratu do hry; Fénix po Vzkříšení', () => {
    const konec = C.helpHtml('konec');
    assert.match(konec, /Vzkříšení:<\/b> Když přijdeš o všechna území, sám se do hry nevrátíš\. S pomůckou Vzkříšení si vybereš volné nebo neopevněné území \(ne domovský hrad\) a hraješ dál, 60 s je chráněné\. Bez ní hru jen sleduješ\./);
    assert.doesNotMatch(konec, /Návrat do hry/);
    assert.equal(C.RARE_EMBLEM_BY_ID.fenix.how, 'Vyhraj hru po Vzkříšení');
});
