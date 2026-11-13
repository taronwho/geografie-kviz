// Kamarádské sázky (bets.js): vklady a limit, hlášky (8, bez rodu, bez volného textu), stav sázky u výzvy, sladění XP v zařízení se součty
// v účtu (prohra jen nad hranicí úrovně, nové zařízení nic nepřepočítá, dvojí připsání nejde), vykreslení (CSP bez inline stylů, escapování,
// genderově neutrální texty), volání serveru (404 = databáze bez sázek) a řízení v aplikaci (vyrovnání pod zámkem postupu, odznaky).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Bets = require('../bets.js');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const h = { esc, art: (name, cls) => `<img src="icons/topics/${name}.webp" class="${cls}">`, avatar: (player) => `<span data-avatar="${player ? esc(player.id) : ''}"></span>`, name: (player) => (player && player.display_name) || 'Hráč' };
const floorOf = (xp) => xp - core.levelProgress(xp).into;
const row = (extra = {}) => Bets.cleanRow({ id: 'ABC234', stake: 25, state: 'accepted', taunt: 2, role: 'creator', other: 'u-2', done: true, other_done: true, outcome: 'win', settled: true, delta: 25, ...extra });

test('vklady 10/25/50 XP, limit z posledních 7 dní a text limitu', () => {
    assert.deepEqual(Bets.STAKES, [10, 25, 50]);
    assert.deepEqual([0, 10, 25, 50, 20, '25', -10, 'x', null].map(Bets.cleanStake), [0, 10, 25, 50, 0, 25, 0, 0, 0]);
    assert.deepEqual(Bets.stakeOptions(30).map(o => [o.value, o.enabled]), [[0, true], [10, true], [25, true], [50, false]]);
    assert.deepEqual(Bets.stakeOptions(null).map(o => o.enabled), [true, true, true, true], 'neznámý limit: rozhodne server');
    assert.deepEqual(Bets.stakeOptions(5).map(o => o.enabled), [true, false, false, false]);
    assert.match(Bets.limitNote(30), /nejvýš 30 XP: tolik máš z posledních 7 dní/);
    assert.match(Bets.limitNote(5), /aspoň 10 XP z posledních 7 dní/);
    assert.equal(Bets.limitNote(null), '');
});

test('hlášky: 8 krátkých, bez rodu a volného textu; šipky jdou dokola i přes „bez hlášky“', () => {
    assert.equal(Bets.TAUNTS.length, 8);
    for (const taunt of Bets.TAUNTS) {
        assert.ok(taunt.length >= 10 && taunt.length <= 32, taunt);
        // Žádné tvary minulého času ani přídavná jména podle rodu (vyhrál/a, připravený/á …)
        const words = taunt.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
        assert.deepEqual(words.filter(word => /(l|la|ly|ý|á)$/u.test(word)), [], `bez rodu: ${taunt}`);
        assert.ok(!words.includes('jsem') && !words.includes('jsi'), `bez minulého času: ${taunt}`);
        assert.match(taunt, /^\p{Lu}.*[.!]$/u, `věta: ${taunt}`);
    }
    assert.deepEqual([null, 0, 7, 3, 8, -1, 'x', '2'].map(Bets.cleanTaunt), [null, 0, 7, 3, null, null, null, 2]);
    assert.equal(Bets.tauntText(1), 'Připrav si peněženku!');
    assert.equal(Bets.tauntText(9), '');
    assert.equal(Bets.nextTaunt(null), 0);
    assert.equal(Bets.nextTaunt(7), null);
    assert.equal(Bets.nextTaunt(null, -1), 7);
    assert.equal(Bets.nextTaunt(0, -1), null);
    // Stejný seznam hlášek jako rozsah v databázi (0–7)
    assert.match(read('supabase/schema.sql'), /taunt is null or taunt between 0 and 7/);
});

test('data ze serveru: jen tvarově platné hodnoty; stav sázky u výzvy', () => {
    assert.equal(Bets.cleanRow({ id: 'bad' }), null);
    assert.equal(Bets.cleanRow(null), null);
    const dirty = Bets.cleanRow({ id: 'ABC234', stake: 999, state: 'hacked', taunt: 99, delta: 500, role: 'x', other: '<script>' });
    assert.deepEqual([dirty.stake, dirty.state, dirty.taunt, dirty.delta, dirty.role, dirty.other], [0, null, null, 50, 'opponent', null]);
    const overview = Bets.cleanOverview({ limit: 80, week_xp: 120, open: 25, stats: { bets: 3, wins: 2, losses: 1, balance: 15, best: 2, streak: 1 }, rows: [{ id: 'ABC234', stake: 10, state: 'offered', role: 'opponent' }, { id: 'nope' }] });
    assert.deepEqual([overview.limit, overview.weekXp, overview.open, overview.rows.length, overview.stats.draws], [50, 120, 25, 1, 0]);
    assert.equal(Bets.cleanOverview(null), null);
    const kinds = [
        [{ state: 'offered', role: 'opponent', done: false }, 'offer'], [{ state: 'offered', role: 'creator' }, 'pending'], [{ state: 'offered', role: 'opponent', expired: true }, 'declined'],
        [{ state: 'declined' }, 'declined'], [{ state: 'accepted', outcome: null }, 'active'], [{ state: 'accepted', outcome: 'loss', settled: false }, 'settling'],
        [{ state: 'accepted', outcome: 'win', settled: true, delta: 25 }, 'won'], [{ state: 'accepted', outcome: 'loss', settled: true, delta: -10 }, 'lost'], [{ state: 'accepted', outcome: 'draw', settled: true, delta: 0 }, 'draw']
    ];
    for (const [extra, kind] of kinds) assert.equal(Bets.viewOf(row(extra)).kind, kind, JSON.stringify(extra));
    assert.equal(Bets.viewOf(row({ state: null })), null);
    assert.equal(Bets.viewOf(null), null);
    assert.deepEqual(Bets.countersFrom({ bets: 6, best: 4 }), { bets: 6, betBestRun: 4 });
});

test('sladění XP: nové prohry se odečtou jen nad hranicí úrovně, výhry přičtou; nové zařízení nic nepřepočítá; nic dvakrát', () => {
    // Prohra 25 XP těsně nad hranicí úrovně 9 (2600 XP): ubere jen 10
    assert.deepEqual(Bets.reconcile({ won: 0, lost: 0 }, { won: 0, lost: 25 }, 2610, floorOf), { xp: 2600, seen: { won: 0, lost: 25 }, change: -10 });
    assert.equal(core.levelFromXp(2600), core.levelFromXp(2610));
    // Výhra a prohra z jiného zařízení najednou: prohra se odečte od současné úrovně, pak se výhra přičte
    assert.deepEqual(Bets.reconcile({ won: 10, lost: 0 }, { won: 60, lost: 25 }, 3000, floorOf).xp, 3000 - 25 + 50);
    // Totéž znovu: nic se nemění (součty už zařízení zná)
    assert.equal(Bets.reconcile({ won: 60, lost: 25 }, { won: 60, lost: 25 }, 3025, floorOf).change, 0);
    // Nové zařízení (bez záznamu) jen převezme součty: XP z účtu je už obsahuje
    assert.deepEqual(Bets.reconcile(null, { won: 40, lost: 10 }, 5000, floorOf), { xp: 5000, seen: { won: 40, lost: 10 }, change: 0 });
    // Databáze bez součtů: nic; součty menší než záznam (jiný účet, smazání): jen se převezmou
    assert.deepEqual(Bets.reconcile({ won: 1, lost: 1 }, { won: undefined, lost: undefined }, 900, floorOf), { xp: 900, seen: { won: 1, lost: 1 }, change: 0 });
    assert.deepEqual(Bets.reconcile({ won: 90, lost: 0 }, { won: 10, lost: 0 }, 900, floorOf), { xp: 900, seen: { won: 10, lost: 0 }, change: 0 });
    // Vyrovnání na tomto zařízení: změna se připíše hned a zapamatuje, další sladění ji nepřipíše znovu
    const seen = Bets.settledLocally({ won: 10, lost: 0 }, { delta: -25, won: 10, lost: 25 });
    assert.deepEqual(seen, { won: 10, lost: 25 });
    assert.equal(Bets.reconcile(seen, { won: 10, lost: 25 }, 2975, floorOf).change, 0);
    assert.deepEqual(Bets.settledLocally(null, { delta: 50, won: 70, lost: 5 }), { won: 70, lost: 5 }, 'bez záznamu: součty po vyrovnání');
    assert.equal(Bets.applyDelta(2610, -25, floorOf), 2600);
    assert.equal(Bets.applyDelta(2600, -50, floorOf), 2600);
    assert.equal(Bets.applyDelta(499990, 50, floorOf), 500000);
    assert.equal(Bets.applyDelta(100, 25, floorOf), 125);
});

test('uložený stav v zařízení: jen platné záznamy, nejvýš 80 zobrazených výsledků', () => {
    const state = Bets.parseLedger({ users: { 'u-1': { won: 5, lost: 2 }, '<x>': { won: 1, lost: 1 }, 'u-2': { won: -1, lost: 0 }, 'u-3': { won: 'a' } }, shown: ['ABC234', 'bad', ...Array.from({ length: 90 }, (_, i) => `C${String(i).padStart(5, '0')}`)] });
    assert.deepEqual(state.users, { 'u-1': { won: 5, lost: 2 } });
    assert.equal(state.shown.length, 80);
    assert.deepEqual(Bets.parseLedger('nesmysl'), { users: {}, shown: [] });
});

test('vykreslení: bez inline stylů a skriptů, escapované jméno, české texty bez rodu', () => {
    const html = [
        Bets.pickerHtml({ stake: 25, taunt: 1, limit: 30, open: true }, h), Bets.pickerHtml({ stake: 0, taunt: null, limit: 5, open: false }, h),
        Bets.offerHtml({ stake: 25, taunt: 4, name: '<b>Petr</b>', limit: 10 }, h), Bets.resultHtml({ view: Bets.viewOf(row()), me: { id: 'u-1' }, other: { id: 'u-2', display_name: 'Eva' } }, h),
        Bets.resultHtml({ view: Bets.viewOf(row({ outcome: 'loss', delta: -25 })), me: null, other: null }, h), Bets.statusHtml(Bets.viewOf(row({ state: 'offered', outcome: null })), 'Eva', h),
        Bets.balanceHtml({ bets: 4, wins: 3, losses: 1, balance: 30 }, h), Bets.helpHtml({ limit: 25, stats: Bets.cleanStats({ bets: 2, wins: 1, losses: 1, balance: 0 }) }, h),
        ...['offer', 'pending', 'active', 'won', 'lost', 'draw'].map(kind => Bets.badgeHtml({ kind, stake: 10, delta: kind === 'lost' ? -10 : 10 }))
    ].join('');
    assert.doesNotMatch(html, /style=|<script|on[a-z]+=/i, 'CSP: bez inline stylů a obsluh');
    assert.doesNotMatch(html, /<b>Petr<\/b>/, 'jméno je escapované');
    assert.match(html, /&lt;b&gt;Petr&lt;\/b&gt;/);
    // Texty bez rodu (žádné „vyhrál jsi“, „prohrál“, „získal“)
    assert.doesNotMatch(html + Bets.statusText({ kind: 'pending', stake: 10 }, 'Eva'), /(vyhrál|prohrál|získal|přišel|nepřijal|vsadil)\b/);
    const picker = Bets.pickerHtml({ stake: 25, taunt: 1, limit: 30, open: true }, h);
    assert.match(picker, /data-ch-open="stake" aria-expanded="true"/);
    assert.match(picker, /data-stake-pick="50"[^>]*aria-disabled="true"/, '50 XP nad limitem');
    assert.match(picker, /„Připrav si peněženku!“/);
    assert.match(picker, /nejvýš 30 XP/);
    assert.match(Bets.pickerHtml({ stake: 0, taunt: null, limit: 50, open: false }, h), /Bez sázky/);
    assert.doesNotMatch(Bets.pickerHtml({ stake: 0, taunt: null, limit: 50, open: true }, h), /data-taunt-row/, 'hláška jen k sázce');
    assert.match(Bets.offerHtml({ stake: 25, taunt: 4, name: 'Petr', limit: 10 }, h), /data-stake-short/, 'vyzvaný nemá na sázku dost XP');
    assert.match(Bets.resultHtml({ view: Bets.viewOf(row()), me: { id: 'u-1' }, other: { id: 'u-2' } }, h), /Sázka je tvoje!.*\+25 XP/s);
    assert.match(Bets.resultHtml({ view: Bets.viewOf(row({ outcome: 'draw', delta: 0 })), me: {}, other: {} }, h), /Remíza: vklady zůstávají/);
    assert.match(Bets.resultHtml({ view: Bets.viewOf(row({ outcome: 'loss', delta: 0 })), me: {}, other: {} }, h), /Úroveň je v bezpečí/);
    assert.equal(Bets.resultHtml({ view: Bets.viewOf(row({ outcome: null })), me: {}, other: {} }, h), '', 'nerozhodnutá sázka nemá výsledek');
    assert.equal(Bets.balanceHtml({ bets: 0 }, h), '');
    assert.match(Bets.balanceHtml({ bets: 6, wins: 5, losses: 1, balance: -20 }, h), /−20 XP.*5 výher.*1 prohra/s);
    assert.equal(Bets.badgeHtml({ kind: 'declined', stake: 10 }), '');
    assert.equal(Bets.formatDelta(25), '+25 XP');
    assert.equal(Bets.formatDelta(-10), '−10 XP');
    assert.equal(Bets.formatDelta(0), '±0 XP');
});

test('obrázky: jedna konstanta ART, jen existující soubory', () => {
    for (const name of [Bets.ART.owl, ...Object.values(Bets.ART.badges), Bets.ART.coin, Bets.ART.pile].filter(Boolean)) {
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), `${name}.webp`);
    }
    const source = read('bets.js');
    assert.match(source, /\/\/ č\. 241 mince/);
    assert.match(source, /\/\/ č\. 242 mince-hromadka/);
    assert.match(source, /\/\/ č\. 243 sova-sazka/);
    assert.equal((source.match(/src="icons\/topics\//g) || []).length, 2, 'obrázky jen přes ART (mince, hromádka)');
});

test('server: názvy a parametry funkcí, 404 = databáze bez sázek, česká chyba ze serveru', async () => {
    const calls = [];
    let status = 200;
    let body = { limit: 25, rows: [], stats: {} };
    const win = {
        MUDRLANT_CONFIG: { supabaseUrl: 'https://x.supabase.co/', supabaseAnonKey: 'anon' }, MudrlantAuth: { accessToken: async () => 'tok' },
        fetch: async (url, options) => { calls.push([url, JSON.parse(options.body), options.headers.Authorization]); return { status, ok: status < 300, json: async () => body, text: async () => JSON.stringify(body) }; }
    };
    const api = Bets.createApi({ window: win });
    assert.equal((await api.stakes()).limit, 25);
    body = { id: 'ABC234', stake: 25, state: 'offered', role: 'creator' };
    assert.equal((await api.offer('ABC234', 25, 3)).state, 'offered');
    await api.answer('ABC234', true);
    await api.settle('ABC234');
    assert.deepEqual(calls.map(([url, payload]) => [url.replace('https://x.supabase.co/rest/v1/rpc/', ''), payload]), [
        ['challenge_stakes', {}], ['challenge_offer_stake', { code: 'ABC234', amount: 25, taunt_id: 3 }], ['challenge_answer_stake', { code: 'ABC234', accept: true }], ['challenge_settle_stake', { code: 'ABC234' }]
    ]);
    assert.equal(calls[0][2], 'Bearer tok');
    status = 400;
    body = { message: 'Vsadit můžeš nejvýš 10 XP (tolik máš z posledních 7 dní).' };
    await assert.rejects(api.offer('ABC234', 25, null), /nejvýš 10 XP/);
    body = { message: 'internal' };
    await assert.rejects(api.answer('ABC234', true), /Zkontroluj připojení/);
    status = 404;
    assert.equal(await api.stakes(), null);
    assert.equal(api.missing(), true);
    const before = calls.length;
    assert.equal(await api.settle('ABC234'), null, 'po 404 už se nevolá');
    assert.equal(calls.length, before);
});

test('řízení: vyrovnání pod zámkem postupu připíše XP jednou, prohru jen nad hranicí, odznaky z přehledu, výhra oznámená', async () => {
    const store = {};
    const events = [];
    let xp = 2610;
    let settleResult = { id: 'ABC234', stake: 25, state: 'accepted', role: 'opponent', done: true, other_done: true, outcome: 'loss', settled: true, delta: -10, fresh: true, won: 0, lost: 10 };
    let winSettled = false;
    const winRow = () => ({ id: 'WIN234', stake: 10, state: 'accepted', role: 'creator', done: true, other_done: true, outcome: 'win', settled: winSettled, delta: winSettled ? 10 : null });
    const api = {
        missing: () => false,
        stakes: async () => Bets.cleanOverview({ limit: 40, stats: { bets: 5, wins: 5, best: 5 }, rows: [winRow()] }),
        settle: async (code) => {
            events.push(`settle:${code}`);
            if (code !== 'WIN234') return Bets.cleanRow(settleResult);
            const fresh = !winSettled;
            winSettled = true;
            return Bets.cleanRow({ ...winRow(), fresh, won: 10, lost: 10 });
        }
    };
    const ctl = Bets.createController({
        api, user: () => ({ id: 'u-1' }), read: (key) => store[key], write: (key, value) => { store[key] = JSON.parse(JSON.stringify(value)); },
        withProgress: async (task) => { events.push('lock'); await task(); events.push('unlock'); }, floorOf,
        applyXp: (delta) => { xp = Bets.applyDelta(xp, delta, floorOf); events.push(`xp:${delta}`); },
        setCounters: (counters) => events.push(`counters:${counters.bets}/${counters.betBestRun}`), paint: () => events.push('paint'), notify: (result) => events.push(`notify:${result.delta}`)
    });
    const result = await ctl.settle('ABC234');
    assert.equal(result.outcome, 'loss');
    assert.equal(xp, 2600);
    assert.deepEqual(events.slice(0, 4), ['lock', 'settle:ABC234', 'xp:-10', 'unlock']);
    assert.deepEqual(Bets.parseLedger(store[Bets.KEY]).users['u-1'], { won: 0, lost: 10 });
    // Podruhé (server řekne, že je vyrovnáno): nic se nepřipíše
    settleResult = { ...settleResult, fresh: false };
    events.length = 0;
    await ctl.settle('ABC234');
    assert.ok(!events.some(event => event.startsWith('xp:')));
    // Sladění se součty v účtu po vlastním vyrovnání: nic dvakrát
    assert.equal(ctl.reconcileXp('u-1', xp, { bet_won: 0, bet_lost: 10 }), xp);
    // Přehled: dohraná nevyrovnaná výhra se vyrovná a oznámí, počítadla odznaků z přehledu
    events.length = 0;
    await ctl.refresh();
    assert.ok(events.includes('counters:5/5'));
    assert.ok(events.includes('settle:WIN234'));
    assert.ok(events.includes('xp:10'));
    assert.ok(events.includes('notify:10'));
    assert.equal(xp, 2610);
    assert.equal(ctl.limit(), 40);
    assert.equal(ctl.view('WIN234').kind, 'won');
    // Mince se sypou jen poprvé
    assert.equal(ctl.firstShow('WIN234'), true);
    assert.equal(ctl.firstShow('WIN234'), false);
});

test('napojení: modul v index.html před app.js, v mezipaměti, v nasazení, v Tailwindu; odznaky v katalogu; tip a zvuk', () => {
    const index = read('index.html');
    assert.match(index, /<script src="bets\.js" defer><\/script>/);
    assert.ok(index.indexOf('bets.js') < index.indexOf('app.js'));
    assert.match(read('sw.js'), /'bets\.js'/);
    assert.match(read('.github/workflows/pages.yml'), / bets\.js /);
    assert.match(read('tailwind.config.js'), /'\.\/bets\.js'/);
    const sql = read('supabase/schema.sql');
    assert.match(sql, /-- ===== 21: Kamarádské sázky =====/);
    assert.ok(sql.indexOf('-- ===== 21: Kamarádské sázky =====') < sql.indexOf('create or replace function public.schema_version()'), 'verze schématu zůstává na konci souboru');
    assert.ok(Number(/language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1]) >= 21 && /language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1] === /const REQUIRED_SCHEMA = (\d+);/.exec(read('app.js'))[1], 'schéma aspoň 21 a stejná verze v app.js');
    for (const id of ['sazkar', 'sazky-v-rade-5']) assert.ok(core.BADGE_BY_ID[id], id);
    assert.equal(core.BADGE_BY_ID.sazkar.title, 'Sázkař');
    assert.equal(core.BADGE_BY_ID.sazkar.goal, 5);
    assert.equal(core.BADGE_BY_ID['sazky-v-rade-5'].goal, 5);
    assert.ok(require('../sound.js').SOUNDS.coins, 'zvuk cinkajících mincí');
    const Tips = require('../tips.js');
    const tip = Tips.BY_ID.get('sazky');
    assert.ok(tip && tip.action.kind === 'multi');
    assert.match(tip.text, /Vyzvat.*Sázka/s, 'přesné názvy tlačítka a řádku');
    const ctx = { counters: { answered: 100, challenges: 3 }, today: '2026-11-12', now: Date.now(), launches: 1, signedIn: true, multiAvailable: true };
    const only = { ...Tips.EMPTY, seen: Tips.TIPS.filter(item => item.id !== 'sazky').map(item => item.id) };
    assert.equal(Tips.pick(only, { ...ctx, bets: true }).id, 'sazky');
    assert.equal(Tips.pick(only, ctx), null, 'bez sázek v databázi ne');
    assert.equal(Tips.pick(only, { ...ctx, bets: true, counters: { ...ctx.counters, bets: 1 } }), null, 'kdo sázel, tip nedostane');
    assert.equal(Tips.pick(Tips.touch(only, 'bets'), { ...ctx, bets: true }), null, 'kdo okno sázek viděl, tip nedostane');
});
