// Výplně území (vzory) a vzácné znaky do Dobývání (blok 38): volání v social.js (looks z lobby a po hře očištěné, pattern_id jen se vzorem,
// změna vzhledu s vzorem jen s databází, která ho zná, ohlášení nových, Duha z truhly) a blok 38 ve schema.sql (pořadí, verze 38 i v app.js,
// oprávnění, texty chyb bez rodu). Chování v databázi hlídá tests/sql-conquest-looks.test.js, okno a katalog tests/conquest.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GAME = '11111111-2222-3333-4444-555555555555';
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
const summary = (extra = {}) => ({ id: GAME, map: 'evropa', max_players: 4, hours: 72, minutes: 4320, period: 'day', actions: 5, status: 'lobby', players: [{ id: 'u1', pattern: 'plameny', emblem: 'sfinga' }], ...extra });
const LOOKS = { patterns: ['plameny', 'plameny', 'Špatně!', 7], emblems: ['sfinga'], stats: { battles: '12', games: 3, 'zlý klíč!': 5, sea: -4 },
    new: [{ kind: 'pattern', item: 'plameny', at: '2026-11-12T10:00:00Z' }, { kind: 'jiny', item: 'x' }, { kind: 'emblem', item: 'Sfinga!' }, null] };

test('social.js: looks z lobby a po hře očištěné; vzor se posílá jen vybraný; změna vzhledu se vzorem jen s blokem 38; ohlášení; Duha z truhly', async () => {
    const { Social, calls, done } = loadSocial((name) => {
        if (name === 'conquest_lobby') return [200, { open: [], mine: [summary()], items: null, looks: LOOKS }];
        if (['conquest_create', 'conquest_join', 'conquest_set_look'].includes(name)) return [200, summary()];
        if (name === 'conquest_claim') return [200, { place: 1, players: 3, score: 9, eligible: true, claimed_now: true, looks: LOOKS }];
        if (name === 'conquest_looks') return [200, LOOKS];
        if (name === 'conquest_looks_seen') return [204, null];
        if (name === 'player_items_claim') return [200, { kind: 'fifty', granted: false, full: false, already: false, lucky: false, pattern: 'duha', items: { extra_move: 0, fifty: 0 } }];
        return [400, { message: 'neznámé' }];
    });
    try {
        const clean = { patterns: ['plameny'], emblems: ['sfinga'], stats: { battles: 12, games: 3, sea: 0 }, new: [{ kind: 'pattern', item: 'plameny', at: '2026-11-12T10:00:00Z' }] };
        const lobby = await Social.conquestLobby();
        assert.deepEqual(lobby.looks, clean);
        assert.deepEqual([lobby.mine[0].players[0].pattern, lobby.mine[0].players[0].emblem], ['plameny', 'sfinga'], 'vzor hráče projde do souhrnu');
        assert.deepEqual(await Social.conquestLooks(), clean);
        assert.equal(Social.cleanLooks(null), null);
        assert.equal(Social.cleanLooks([1]), null);
        // Bez vzoru se volá postaru (starší databáze nic nepozná); se vzorem pattern_id
        await Social.conquestCreate({ map: 'evropa', players: 4, hours: 72, period: 'day', actions: 5, visibility: 'public', color: 'cervena', emblem: 'lev' });
        assert.equal('pattern_id' in calls.pop().body, false);
        await Social.conquestCreate({ map: 'evropa', players: 4, hours: 72, period: 'day', actions: 5, visibility: 'public', color: 'cervena', emblem: 'sfinga', pattern: 'plameny' });
        assert.deepEqual([calls[calls.length - 1].body.pattern_id, calls[calls.length - 1].body.emblem_id], ['plameny', 'sfinga']);
        await Social.conquestJoin({ code: 'ABCDEF', color: 'modra', emblem: 'orel' });
        assert.equal('pattern_id' in calls.pop().body, false);
        await Social.conquestJoin({ code: 'ABCDEF', color: 'modra', emblem: 'orel', pattern: 'duha' });
        assert.equal(calls.pop().body.pattern_id, 'duha');
        await Social.conquestSetLook(GAME, 'modra', 'orel');
        assert.equal('pattern_id' in calls.pop().body, false, 'starší databáze: postaru');
        await Social.conquestSetLook(GAME, 'modra', 'orel', null, true);
        assert.equal(calls.pop().body.pattern_id, null, 'databáze se vzory: null = bez vzoru');
        await Social.conquestSetLook(GAME, 'modra', 'orel', 'led', true);
        assert.equal(calls.pop().body.pattern_id, 'led');
        const claimed = await Social.conquestClaim(GAME);
        assert.deepEqual(claimed.looks, clean);
        await Social.conquestLooksSeen('2026-11-12T10:00:00Z');
        assert.deepEqual(calls.pop(), { name: 'conquest_looks_seen', body: { upto: '2026-11-12T10:00:00Z' } });
        const chest = await Social.playerItemsClaim('chest', 'chest:2026-W46');
        assert.equal(chest.pattern, 'duha');
    } finally {
        done();
    }
});

test('social.js: databáze bez bloku 38 – lobby bez looks (null), vzory nejdou (404 jen pro tuhle část), zbytek Dobývání běží', async () => {
    const { Social, done } = loadSocial((name) => {
        if (name === 'conquest_lobby') return [200, { open: [], mine: [], items: null }];
        if (name === 'conquest_looks') return [404, { message: 'Could not find the function' }];
        return [400, { message: 'neznámé' }];
    });
    try {
        assert.equal((await Social.conquestLobby()).looks, null);
        await assert.rejects(Social.conquestLooks(), (error) => error.status === 404 && /Výplně území a vzácné znaky zatím nejdou/.test(error.message));
        assert.deepEqual((await Social.conquestLobby()).open, [], 'Dobývání dál funguje');
    } finally {
        done();
    }
});

test('schema.sql: blok 38 před verzí schématu, verze 38 i v app.js; RPC jen přihlášeným, pomocné funkce jen interně, chyby česky a bez rodu', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    const start = schema.indexOf('-- ===== 38: Dobývání – výplně území a vzácné znaky — ZAČÁTEK BLOKU =====');
    const end = schema.indexOf('-- ===== 38: Dobývání – výplně území a vzácné znaky — KONEC BLOKU =====');
    assert.ok(start > schema.indexOf('-- ===== 37: Pomůcka Záchrana navíc do Řetězovky — KONEC BLOKU ====='));
    assert.ok(end > start && end < schema.indexOf('-- ===== Verze schématu ====='));
    const version = Number(/language sql immutable as \$\$ select (\d+) \$\$;/.exec(schema)[1]);
    assert.ok(version >= 38);
    assert.equal(Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]), version);
    assert.match(schema, /^-- 38: Dobývání – výplně území \(vzory\) a vzácné znaky/m, 'řádek v seznamu verzí');
    assert.match(schema, /grant execute on function public\.conquest_looks\(\), public\.conquest_looks_seen\(timestamptz\) to authenticated;/);
    for (const name of ['conquest_look_stats', 'conquest_looks_json', 'conquest_look_owned', 'conquest_check_style', 'conquest_check_fill', 'conquest_colored_patterns', 'conquest_chest_pattern', 'conquest_look_catalog']) {
        assert.doesNotMatch(schema, new RegExp(`grant [^;]*${name}\\(`), `${name} jen interně`);
    }
    // Staré podoby funkcí se vzhledem se mažou (PostgREST by jinak našel dvě)
    for (const old of ['conquest_create\\(text, integer, integer, text, integer, text, text, text, integer\\)', 'conquest_join\\(uuid, text, text, text\\)', 'conquest_set_look\\(uuid, text, text\\)',
        'conquest_add_player\\(public\\.conquest_games, uuid, text, text\\)']) {
        assert.match(schema, new RegExp(`drop function if exists public\\.${old};`), old);
    }
    const messages = ['Tenhle vzácný znak ještě nemáš. Vyber jiný.', 'Tuhle výplň území ještě nemáš. Vyber jinou.', 'Vyber výplň území z nabídky.', 'Výplň % už v této hře má jiný hráč. Vyber jinou.'];
    for (const message of messages) {
        assert.ok(schema.includes(message), message);
        assert.doesNotMatch(message, /\b(získal|získala|vybral|vybrala)\b/);
    }
});
