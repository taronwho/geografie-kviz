// Přátelé, reakce po zápase, blokování a nahlášení: čistá logika a vykreslení (friends.js) a volání API (social.js) s napodobeným fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const F = require('../friends.js');

const NOW = Date.parse('2026-11-06T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const row = (id, extra = {}) => ({ id, display_name: `Hráč ${id}`, avatar: '🦊', color: 'sky', status: 'accepted', direction: 'out', last_seen: day(0), wins: 0, losses: 0, draws: 0, ...extra });
const helpers = { avatarHtml: (player, size) => `<i data-av="${player.id}" class="${size}"></i>`, register: () => {} };

test('aktivita podle poslední návštěvy', () => {
    assert.deepEqual(F.activity(null, NOW), { level: 'unknown', text: '' });
    assert.deepEqual(F.activity('nesmysl', NOW), { level: 'unknown', text: '' });
    assert.equal(F.activity(day(0), NOW).text, 'aktivní dnes');
    assert.equal(F.activity(day(0.5), NOW).level, 'today');
    assert.equal(F.activity(day(1), NOW).text, 'aktivní včera');
    assert.equal(F.activity(day(3), NOW).text, 'před 3 dny');
    assert.equal(F.activity(day(8), NOW).text, 'před 1 týdnem');
    assert.equal(F.activity(day(15), NOW).text, 'před 2 týdny');
    assert.equal(F.activity(day(90), NOW).text, 'dlouho nehrál');
    assert.equal(F.activity(new Date(NOW + 5000).toISOString(), NOW).level, 'today', 'budoucí čas nespadne');
});

test('jména, bilance a vztahy', () => {
    assert.equal(F.shortName('Lenka Dvořáková'), 'Lenka Dv…');
    assert.equal(F.shortName('Eva'), 'Eva');
    assert.equal(F.shortName(''), 'Hráč');
    assert.equal(F.balanceText({ wins: 0, losses: 0, draws: 0 }), '');
    assert.equal(F.balanceText({ wins: 3, losses: 1, draws: 0 }), '3:1');
    assert.equal(F.balanceText({ wins: 3, losses: 1, draws: 2 }), '3:1 (2 remízy)');
    const rows = [row('a'), row('b', { status: 'pending', direction: 'in' }), row('c', { status: 'pending', direction: 'out' })];
    assert.deepEqual(F.split(rows).friends.map(r => r.id), ['a']);
    assert.deepEqual(F.split(rows).incoming.map(r => r.id), ['b']);
    assert.deepEqual(F.split(rows).outgoing.map(r => r.id), ['c']);
    assert.deepEqual(F.split(null), { friends: [], incoming: [], outgoing: [] });
    assert.deepEqual(['a', 'b', 'c', 'x'].map(id => F.relation(rows, id)), ['friend', 'in', 'out', 'none']);
    assert.equal(F.relation(null, 'a'), 'none');
    assert.equal(F.atLimit(new Array(200).fill(row('a'))), true);
    assert.equal(F.atLimit(rows), false);
});

test('tlačítko přátelství: čtyři stavy, při bloku nic', () => {
    assert.match(F.friendButton('none'), /data-friend="add"[\s\S]*Přidat do přátel/);
    assert.match(F.friendButton('out'), /data-friend="cancel"[\s\S]*Žádost odeslána/);
    assert.match(F.friendButton('in'), /data-friend="accept"[\s\S]*Přijmout žádost/);
    assert.match(F.friendButton('friend'), /data-friend="remove"[\s\S]*Odebrat z přátel/);
    assert.match(F.friendButton('none', { busy: true }), /disabled/);
    assert.equal(F.friendButton('none', { blocked: true }), '');
    assert.match(F.moreMenu(false), /data-block="on"[\s\S]*Zablokovat/);
    assert.match(F.moreMenu(true), /data-block="off"[\s\S]*Odblokovat/);
});

test('vykreslení: jména a texty se escapují, nic se nerozbije', () => {
    const evil = row('x', { display_name: '<img src=x onerror=alert(1)>"\'', status: 'pending', direction: 'in' });
    for (const html of [F.friendsStrip([evil], helpers, NOW), F.requestRows([evil], helpers), F.quickFriends([evil], helpers), F.blockConfirm(evil.display_name), F.blockedNote(evil.display_name), F.reactionBar('x', null, { name: evil.display_name }),
        F.blockedList([{ id: 'x', player: evil }], helpers), F.devReports([{ id: 1, reported_id: 'x', reported_name: evil.display_name, reporter_name: evil.display_name, reason: 'jine', note: evil.display_name, created_at: day(0) }], [{ id: 'jine', label: 'Jiné' }], helpers)]) {
        assert.ok(!/<img/.test(html), html.slice(0, 200));
    }
    assert.equal(F.friendsStrip([], helpers), '');
    assert.equal(F.requestRows([], helpers), '');
    assert.equal(F.quickFriends([], helpers), '');
    assert.match(F.friendsStrip([row('a'), row('b')], helpers, NOW), /Přátelé <span[^>]*>· 2<\/span>[\s\S]*data-player-id="a"[\s\S]*data-player-id="b"/);
    assert.equal((F.requestRows(new Array(9).fill(0).map((_, i) => row(`r${i}`, { status: 'pending', direction: 'in' })), helpers).match(/data-friend-request/g) || []).length, 5, 'žádostí se ukáže nejvýš pět');
    assert.match(F.requestRows([evil], helpers), /data-action="friend-accept"[\s\S]*data-action="friend-decline"/);
    assert.match(F.quickFriends([row('a')], helpers), /data-pick-opp="a"/);
    assert.match(F.blockedList(null, helpers), /není k dispozici/);
    assert.match(F.blockedList([], helpers), /Nikoho zablokovaného/);
});

test('inline styly nikde (přísné CSP style-src self)', () => {
    const all = [F.friendsStrip([row('a')], helpers, NOW), F.requestRows([row('a', { status: 'pending', direction: 'in' })], helpers), F.quickFriends([row('a')], helpers), F.reactionBar('a', '🔥'), F.reportBody([{ id: 'jine', label: 'Jiné' }], 'jine', 'x'), F.moreMenu(false), F.blockConfirm('A')].join('');
    assert.ok(!/\sstyle=/.test(all));
});

test('reakce: čtyři emoji, vybraná je označená, cizí se nezobrazí', () => {
    assert.deepEqual(F.REACTIONS, ['👍', '🔥', '😅', '🤝']);
    const bar = F.reactionBar('u2', '🔥');
    assert.equal((bar.match(/data-action="react"/g) || []).length, 4);
    assert.match(bar, /data-emoji="🔥"[^>]*aria-pressed="true"/);
    assert.match(bar, /data-to="u2"/);
    assert.match(F.reactionBar('u2', null), /Pošli reakci/);
    assert.match(F.reactionBar('u2', '🔥', { busy: true }), /disabled/);
    assert.match(F.reactionBadge('🔥'), /data-reaction-badge/);
    assert.equal(F.reactionBadge('💩'), '');
    assert.equal(F.reactionBadge(null), '');
    const reactions = [{ challenge_id: 'ABC234', from_id: 'u2', to_id: 'me', emoji: '🤝' }, { challenge_id: 'ABC234', from_id: 'me', to_id: 'u2', emoji: '👍' }];
    assert.equal(F.reactionFor(reactions, 'ABC234', 'me'), '🤝');
    assert.equal(F.reactionFor(reactions, 'OTHER1', 'me'), null);
    assert.equal(F.myReactionFor(reactions, { challengeId: 'ABC234' }, 'me'), '👍');
});

test('nahlášení: formulář vyžaduje důvod, poznámka má limit 300 znaků', () => {
    const reasons = [{ id: 'prezdivka', label: 'Nevhodná přezdívka' }, { id: 'jine', label: 'Jiné' }];
    assert.match(F.reportBody(reasons, null), /data-report-send disabled/);
    assert.ok(!/data-report-send disabled/.test(F.reportBody(reasons, 'jine')));
    assert.match(F.reportBody(reasons, 'jine'), /maxlength="300"/);
    assert.match(F.reportBody(reasons, 'jine'), /aria-checked="true"[^>]*data-reason="jine"|data-reason="jine"[^>]*>/);
    assert.equal(F.reasonLabel(reasons, 'jine'), 'Jiné');
    assert.equal(F.reasonLabel(reasons, 'xx'), 'xx');
});

// ===== social.js: volání API =====
const setup = (handler) => {
    const calls = [];
    globalThis.self = globalThis;
    globalThis.MUDRLANT_CONFIG = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'sb_publishable_test' };
    globalThis.MudrlantAuth = { accessToken: async () => 'tok' };
    globalThis.fetch = async (url, init = {}) => {
        const call = { url: String(url).replace('https://x.supabase.co/rest/v1/', ''), method: init.method, body: init.body ? JSON.parse(init.body) : undefined, prefer: init.headers.Prefer };
        calls.push(call);
        const result = await handler(call);
        return { ok: result.status < 400, status: result.status, json: async () => result.body, text: async () => result.body === undefined ? '' : JSON.stringify(result.body) };
    };
    delete require.cache[require.resolve(path.join('..', 'social.js'))];
    return { Social: require('../social.js'), calls };
};
const ok = (body) => ({ status: 200, body });
const U = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';

test('social: žádost, přijetí a zrušení posílají správné dotazy a neplatné id odmítnou', async () => {
    const { Social, calls } = setup(() => ok(null));
    await Social.addFriend(U, V);
    assert.deepEqual([calls[0].method, calls[0].url, calls[0].body], ['POST', 'friendships', { user_id: U, friend_id: V, status: 'pending' }]);
    await Social.acceptFriend(U, V);
    assert.deepEqual([calls[1].method, calls[1].url, calls[1].body], ['PATCH', `friendships?user_id=eq.${V}&friend_id=eq.${U}`, { status: 'accepted' }]);
    await Social.removeFriend(U, V);
    assert.equal(calls[2].method, 'DELETE');
    assert.match(calls[2].url, /^friendships\?or=\(and\(user_id\.eq\./);
    for (const bad of ['', null, 'a b', 'x,y', 'a)or(b', '1'.repeat(50)]) {
        await assert.rejects(() => Social.addFriend(U, bad), /Neplatný hráč/);
        await assert.rejects(() => Social.blockPlayer(U, bad), /Neplatný hráč/);
        await assert.rejects(() => Social.reportPlayer(U, bad, 'jine'), /Neplatný hráč/);
    }
    assert.equal(calls.length, 3, 'neplatné id nejde na server');
});

test('social: chyba databáze se přeloží, česká hláška triggeru projde, 404 = funkce není', async () => {
    let result = { status: 400, body: { message: 'Máš už 200 přátel, víc se nevejde.' } };
    const { Social } = setup(() => result);
    await assert.rejects(() => Social.addFriend(U, V), /Máš už 200 přátel/);
    result = { status: 400, body: { message: 'duplicate key value violates unique constraint' } };
    await assert.rejects(() => Social.addFriend(U, V), /Žádost se nepodařilo odeslat/);
    result = { status: 404, body: { message: 'relation does not exist' } };
    assert.equal(await Social.friendsList(), null, 'bez tabulky se seznam jen vrátí prázdný');
    await assert.rejects(() => Social.blockPlayer(U, V), /schema\.sql/);
    assert.deepEqual(await Social.reactionsFor({ challengeIds: ['ABC234'] }), []);
    assert.equal(await Social.blockedPlayers(U), null);
});

test('social: friends_list se očistí a hodnoty mimo rozsah neprojdou', async () => {
    const { Social } = setup(() => ok([{ id: U, display_name: null, avatar: '🦊', color: 'sky', rating: 99999, last_seen: null, status: 'accepted', direction: 'in', wins: -5, losses: 'x', draws: 2, since: null }]));
    const [friend] = await Social.friendsList();
    assert.equal(friend.display_name, 'Hráč');
    assert.equal(friend.wins, 0);
    assert.equal(friend.losses, 0);
    assert.equal(friend.draws, 2);
    assert.ok(friend.rating === null || friend.rating <= 5000);
});

test('social: reakce jen ze seznamu, upsert, nahlášení s důvodem a krácenou poznámkou', async () => {
    const { Social, calls } = setup(() => ok(null));
    await assert.rejects(() => Social.react(U, { challengeId: 'ABC234' }, V, '💩'), /Neznámá reakce/);
    await assert.rejects(() => Social.react(U, {}, V, '🔥'), /Neplatný zápas/);
    assert.equal(calls.length, 0);
    await Social.react(U, { challengeId: 'abc234' }, V, '🔥');
    assert.equal(calls[0].url, 'match_reactions?on_conflict=challenge_id,match_id,from_id');
    assert.match(calls[0].prefer, /merge-duplicates/);
    assert.deepEqual(calls[0].body, { from_id: U, to_id: V, emoji: '🔥', challenge_id: 'ABC234', match_id: null });
    await assert.rejects(() => Social.reportPlayer(U, V, 'spam'), /Vyber důvod/);
    await Social.reportPlayer(U, V, 'obtezovani', `  Ahoj\n\u0007${'x'.repeat(400)}  `);
    const sent = calls[1].body;
    assert.equal(sent.reason, 'obtezovani');
    assert.ok(sent.note.length <= 300 && !/[\u0000-\u001f]/.test(sent.note));
    await Social.reportPlayer(U, V, 'jine', '   ');
    assert.equal(calls[2].body.note, null);
});

test('social: hledání používá rpc search_players, starší databáze padá zpět na profily', async () => {
    const { Social, calls } = setup((call) => call.url === 'rpc/search_players' ? { status: 404, body: {} } : ok([{ id: V, display_name: 'Eva' }]));
    const rows = await Social.searchPlayers(U, 'Ev');
    assert.equal(rows[0].display_name, 'Eva');
    assert.equal(calls[0].url, 'rpc/search_players');
    assert.match(calls[1].url, /^profiles\?display_name=ilike/);
    await Social.searchPlayers(U, 'Ev');
    assert.equal(calls.filter(c => c.url === 'rpc/search_players').length, 1, 'po 404 se rpc už neopakuje');
});
