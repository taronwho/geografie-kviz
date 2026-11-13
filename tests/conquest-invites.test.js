// Pozvánky přátel do Dobývání (blok 24): vykreslení okna Pozvat přátele, řádku ve formuláři Založit hru, „Pozváno“ v lobby, karet pozvánek
// v Mých hrách, odznaku na záložce a karty na Více hráčů; texty bez rodu a bez inline stylů (CSP); tip Mudrlanta; blok 24 ve schema.sql
// a volání v social.js (pozvat, moje pozvánky, odmítnout; databáze bez pozvánek Dobývání nevypne).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../conquest.js');
const Tips = require('../tips.js');

const ROOT = path.join(__dirname, '..');
const maps = Object.fromEntries(['evropa', 'asie'].map(id => [id, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `dobyvani-${id}.json`), 'utf8'))]));
const person = (id, name, avatar = '🐼') => ({ id, display_name: name, avatar, color: 'sky', frame: null, title_pref: null, owl: null });
const friends = [person('u-2', 'Petr Svoboda'), person('u-3', 'Eva Mistr', '🦉'), person('u-4', '<b>Zlý</b> "host"', '🐸')];
const lobbyGame = (extra = {}) => ({
    id: 'g-1', map: 'evropa', max_players: 4, hours: 72, period: 'day', actions: 5, visibility: 'private', status: 'lobby', code: 'K7M2QX',
    players: [{ id: 'u-1', display_name: 'Jana Nováková', seat: 0, flag_color: 'cervena', emblem: 'lev', ready: false, me: true }],
    invited: [{ ...friends[0], by_me: true }], ...extra
});
const invite = (extra = {}) => ({
    id: 'g-2', map: 'evropa', max_players: 4, hours: 72, period: 'day', actions: 5, visibility: 'private', status: 'lobby', code: 'K7M2QX', mine: false,
    players: [{ id: 'u-1', display_name: 'Jana Nováková', seat: 0, flag_color: 'cervena', emblem: 'lev' }], invited: [], invited_by: person('u-1', 'Jana Nováková', '🦊'), ...extra
});
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Obrázek hráče jako v app.js (třídy, žádné styly)
const avatar = (player, cls) => `<span class="avatar ${cls}" data-avatar-of="${player.id || ''}">${player.avatar || '🦊'}</span>`;
const clean = (html, label) => {
    assert.doesNotMatch(html, /\sstyle=/, `${label}: bez inline stylů`);
    assert.doesNotMatch(html, /\son[a-z]+=/i, `${label}: bez inline skriptů`);
    assert.doesNotMatch(html, /NaN|undefined|\[object/, label);
    // Bez rodu hráče: nikdy „pozval/pozvala“, „přidal/přidala ses“
    assert.doesNotMatch(text(html), /\bpozval|\bpřidal(a)? ses\b|\bodmítl/i, `${label}: bez rodu`);
};

test('okno Pozvat přátele: načítání, chyba, bez přátel rada, seznam s obrázky; kdo hraje nebo je pozvaný, nejde vybrat; limit volných míst', () => {
    assert.match(text(C.friendsPickerHtml({ loading: true })), /Načítám přátele…/);
    assert.match(text(C.friendsPickerHtml({ friends: null })), /Přátele se nepodařilo načíst/);
    const none = C.friendsPickerHtml({ friends: [], limit: 3, create: true });
    assert.match(text(none), /^Zatím nemáš přátele\. Přidáš je v profilu hráče na záložce Více hráčů\.$/);
    assert.doesNotMatch(none, /data-cq="invite-done"/, 'bez přátel není co potvrdit');
    // Formulář Založit hru: 3 volná místa, nic nevybráno → Hotovo (jde i bez výběru), rada, kdy pozvánky odejdou
    const create = C.friendsPickerHtml({ friends, limit: 3, create: true, avatar });
    clean(create, 'okno při zakládání');
    assert.equal((create.match(/role="checkbox"/g) || []).length, 3);
    assert.equal((create.match(/data-avatar-of="u-/g) || []).length, 3, 'obrázek u každého přítele');
    assert.match(create, /&lt;b&gt;Zlý&lt;\/b&gt; &quot;host&quot;/, 'jméno je escapované');
    assert.match(text(create), /Volná místa: 3\. Pozvánky odejdou, hned jak hru založíš\./);
    assert.match(create, /data-cq="invite-done"\s+class="[^"]*"><i data-lucide="check"[^>]*><\/i> Hotovo/);
    assert.match(create, /data-cq-friend-list[^>]*max-h-\[min\(19rem,46dvh\)\][^>]*overflow-y-auto/, 'seznam se posouvá uvnitř okna');
    // Vybráno 2 z limitu 2: ostatní zašednou, vybrané jdou odznačit, tlačítko Pozvat (2)
    const full = C.friendsPickerHtml({ friends, limit: 2, selected: ['u-2', 'u-3'], avatar });
    assert.match(full, /aria-checked="true" data-cq-friend="u-2"(?! disabled)/);
    assert.match(full, /aria-checked="false" data-cq-friend="u-4" disabled/);
    assert.match(text(full), /Volná místa: 2\. Vybráno: 2\./);
    assert.match(text(full), /Pozvat \(2\)/);
    // Lobby: kdo už hraje / je pozvaný, je zašedlý se stavem; bez výběru Pozvat nejde; místa obsazená pozvánkami
    const lobby = C.friendsPickerHtml({ friends, limit: 1, joined: ['u-3'], invited: ['u-2'], avatar });
    clean(lobby, 'okno v lobby');
    assert.match(lobby, /data-cq-friend="u-2" disabled[\s\S]*?Pozváno/);
    assert.match(lobby, /data-cq-friend="u-3" disabled[\s\S]*?Už hraje/);
    assert.match(lobby, /data-cq-friend="u-4"(?! disabled)/);
    assert.match(lobby, /data-cq="invite-done" disabled/);
    assert.match(text(lobby), /Volná místa: 1\. Vyber, koho pozveš\./);
    assert.match(text(C.friendsPickerHtml({ friends, limit: 0, invited: ['u-2', 'u-3'] })), /Volná místa ve hře už čekají na pozvané přátele\./);
    assert.match(text(C.friendsPickerHtml({ friends, limit: 1, selected: ['u-4'], busy: true })), /Posílám pozvánky…/);
    assert.match(text(C.friendsPickerHtml({ friends, limit: 1, error: 'Pozvat můžeš jen své přátele.' })), /Pozvat můžeš jen své přátele\./);
});

test('Založit hru: Pozvat přátele vedle Barvy a znaku (vybraní s obrázky a jmény); bez pozvánek v databázi původní řádek', () => {
    const draft = { map: 'evropa', hours: 72, players: 4, actions: 5, period: 'day', visibility: 'private', color: 'modra', emblem: 'vlk' };
    const empty = C.createHtml({ draft, maps, invitable: true, avatar });
    clean(empty, 'formulář');
    assert.match(empty, /<div class="grid grid-cols-2 gap-2"><button type="button" data-cq="look"[\s\S]*?<button type="button" data-cq="invite-pick"/);
    assert.match(text(empty), /Barva a znak Modrá · Vlk Pozvat přátele Zatím nikoho/);
    const chosen = C.createHtml({ draft, maps, invitable: true, avatar, invites: friends.slice(0, 2) });
    assert.match(text(chosen), /Pozvánky \(2\) Petr Svoboda, Eva Mistr/);
    assert.equal((chosen.match(/data-avatar-of="u-/g) || []).length, 2);
    // Starší databáze (blok 24 chybí): bez Pozvat přátele, Barva a znak přes celou šířku s tužkou
    const old = C.createHtml({ draft, maps });
    assert.doesNotMatch(old, /invite-pick/);
    assert.match(old, /data-cq="look"[\s\S]*?data-lucide="pencil"/);
});

test('lobby: pozvaní zašedlí „Pozváno“ jen hráčům hry; Pozvat přátele jen hráči, s databází s pozvánkami a s volným místem', () => {
    const html = C.lobbyDetailHtml({ game: lobbyGame(), maps, invitable: true, avatar });
    clean(html, 'lobby');
    assert.match(html, /data-cq-invited="u-2"[^>]*border-dashed[\s\S]*?grayscale[\s\S]*?data-avatar-of="u-2"[\s\S]*?Petr Svoboda[\s\S]*?Pozváno/);
    assert.match(text(html), /Pozvat přátele Sdílet odkaz Barva a znak Odejít/);
    assert.doesNotMatch(html, /col-span-2/, 'čtyři tlačítka po dvou');
    // Kdo hru nehraje, pozvané nevidí a pozvat nemůže
    const stranger = C.lobbyDetailHtml({ game: lobbyGame({ players: [{ ...lobbyGame().players[0], me: false }] }), maps, invitable: true, avatar });
    assert.doesNotMatch(stranger, /data-cq-invited|invite-pick/);
    assert.match(stranger, /data-cq="share" class="col-span-2 [^"]*"><i data-lucide="share-2"[^>]*><\/i> Pozvat/, 'jen sdílení přes celou šířku');
    // Starší databáze: tlačítko sdílení se jmenuje Pozvat jako dřív, Odejít přes celou šířku
    const old = C.lobbyDetailHtml({ game: lobbyGame({ invited: [] }), maps });
    assert.doesNotMatch(old, /invite-pick/);
    assert.match(text(old), /Pozvat Barva a znak Odejít/);
    assert.match(old, /data-cq="leave" class="col-span-2 /);
});

test('Moje hry: pozvánky od přátel nahoře (kdo zve, mapa, délka, obsazenost, Přidat se a Odmítnout); odznak s počtem na záložce', () => {
    const invites = [invite(), invite({ id: 'g-3', map: 'asie', hours: 24, max_players: 3, visibility: 'public', invited_by: person('u-3', 'Eva Mistr', '🦉') })];
    const html = C.mineHtml({ games: [], invites, maps, avatar });
    clean(html, 'Moje hry');
    assert.match(text(html), /^Pozvánky od přátel 🦊 Jana Nováková tě zve do hry Evropa · 3 dny · 1\/4 Přidat se Odmítnout 🦉 Eva Mistr tě zve do hry Asie · 1 den · 1\/3 Přidat se Odmítnout/);
    assert.match(html, /data-cq-accept="g-2"[\s\S]*data-cq-decline="g-2"[\s\S]*data-cq-accept="g-3"/);
    assert.doesNotMatch(html, /Zatím nehraješ žádnou hru/, 's pozvánkou bez rady „Zatím nehraješ“');
    assert.match(html, /data-cq-tab="lobby"/, 'Lobby a Založit hru zůstanou');
    // Dlouhé jméno: zkrátí se jen jméno, „tě zve do hry“ zůstane
    assert.match(C.inviteCardHtml(invite({ invited_by: person('u-9', 'Alexandra Dlouhájménová-Nováková') })), /<span class="truncate">Alexandra Dlouhájménová-Nováková<\/span><span class="shrink-0 whitespace-pre"> tě zve do hry<\/span>/);
    // Bez pozvánek jako dřív
    assert.match(text(C.mineHtml({ games: [], maps })), /^Zatím nehraješ žádnou hru/);
    assert.doesNotMatch(C.mineHtml({ games: [], maps }), /Pozvánky od přátel/);
    // Odznak na záložce Moje hry
    assert.match(C.hubHtml({ tab: 'mine', body: '', invites: 2 }), /data-cq-tab="mine"[^>]*>[\s\S]*?Moje hry<span data-cq-invite-count[^>]*><span class="sr-only">Pozvánky: <\/span>2<\/span>/);
    assert.doesNotMatch(C.hubHtml({ tab: 'mine', body: '' }), /data-cq-invite-count/);
});

test('karta na Více hráčů: pozvánka od přítele s Přidat se; s rozehranou hrou proužek pod ní; víc pozvánek +N', () => {
    const one = C.homeCardHtml({ games: [], invites: [invite()], maps, avatar });
    clean(one, 'karta s pozvánkou');
    assert.match(text(one), /Dobývání Pozvánka od Jana Nováková Evropa · 3 dny Přidat se$/);
    assert.match(one, /data-action="conquest-invite" data-game="g-2"/);
    assert.match(one, /data-avatar-of="u-1"/, 'obrázek toho, kdo zve');
    assert.match(text(C.homeCardHtml({ games: [], invites: [invite(), invite({ id: 'g-3' })], maps, avatar })), /Evropa · 3 dny · \+1 Přidat se$/);
    // Bez toho, kdo zve (smazaný účet): „Pozvánka do hry“, ne „Pozvánka od Kamarád“; v Mých hrách „Kamarád tě zve do hry“
    assert.match(text(C.homeCardHtml({ games: [], invites: [invite({ invited_by: null })], maps })), /Dobývání Pozvánka do hry Evropa/);
    assert.match(text(C.inviteCardHtml(invite({ invited_by: null }))), /Kamarád tě zve do hry/);
    const running = { ...lobbyGame(), status: 'running', ends_at: '2026-11-14T10:00:00Z', budget: { left: 4, total: 5 }, players: [{ ...lobbyGame().players[0] }] };
    const both = C.homeCardHtml({ games: [running], invites: [invite()], maps, avatar, now: Date.parse('2026-11-11T10:00:00Z') });
    clean(both, 'karta s hrou a pozvánkou');
    assert.match(text(both), /Tahy 4\/5 Hrát 🦊 Pozvánka od Jana Nováková Evropa · 3 dny Přidat se$/);
    assert.match(both, /data-action="conquest-play"[\s\S]*data-cq-card-invite="g-2"[\s\S]*data-action="conquest-invite" data-game="g-2"/);
    // Bez pozvánky beze změny
    assert.doesNotMatch(C.homeCardHtml({ games: [running], maps }), /conquest-invite/);
    assert.match(C.homeCardHtml({ games: [], maps }), /Najdi hru nebo založ vlastní/);
});

test('tip Pozvi přátele do Dobývání: jen kdo Dobývání otevřel a má přátele; kdo už pozval, ho nedostane', () => {
    const tip = Tips.BY_ID.get('dobyvani-pratele');
    assert.ok(tip, 'tip existuje');
    assert.deepEqual(tip.action, { kind: 'conquest', label: 'Otevřít Dobývání' });
    assert.match(tip.text, /Pozvat přátele/);
    assert.doesNotMatch(tip.text, /\b(pozval|pozvala|přišel|přišla|byl jsi|byla jsi)\b/);
    const others = Tips.TIPS.filter(item => item.id !== 'dobyvani-pratele').map(item => item.id);
    const base = { counters: { answered: 50 }, today: '2026-11-09', now: Date.parse('2026-11-09T10:00:00Z'), launches: 1, signedIn: true, multiAvailable: true, reviewOn: true };
    const at = (ctx, state) => Tips.pick({ ...state, seen: others }, { ...base, ...ctx });
    const visited = Tips.touch(Tips.EMPTY, 'conquest');
    assert.equal(at({ friends: 2 }, Tips.EMPTY), null, 'kdo Dobývání neotevřel, ne');
    assert.equal(at({ friends: 0 }, visited), null, 'bez přátel ne');
    assert.equal(at({ friends: 2, signedIn: false }, visited), null, 'host ne');
    assert.equal(at({ friends: 2 }, visited).id, 'dobyvani-pratele');
    assert.equal(at({ friends: 2 }, Tips.touch(visited, 'conquestInvite')), null, 'kdo už pozval, tip nepotřebuje');
});

test('schema.sql: blok 24 před verzí schématu, verze aspoň 24 a stejná v app.js; pozvánky jen přes funkce', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    const start = schema.indexOf('-- ===== 24: Dobývání – pozvánky pro přátele =====');
    assert.ok(start > schema.indexOf('-- ===== 23: Dobývání – ztracený hrad a upozornění na útoky — KONEC BLOKU ====='));
    assert.ok(start < schema.indexOf('-- ===== Verze schématu ====='));
    const version = Number(/language sql immutable as \$\$ select (\d+) \$\$;/.exec(schema)[1]);
    assert.ok(version >= 24, `schéma ${version}`);
    assert.match(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), new RegExp(`const REQUIRED_SCHEMA = ${version};`));
    assert.match(schema, /revoke all on public\.conquest_invites from public, anon, authenticated;/);
    assert.match(schema, /grant execute on function public\.conquest_invite\(uuid, uuid\[\]\), public\.conquest_invites_mine\(\), public\.conquest_decline_invite\(uuid\) to authenticated;/);
    assert.doesNotMatch(schema, /grant [^;]*conquest_invite_push_items/, 'upozornění jen interně');
});

test('social.js: pozvat (jen platná id, nejvýš 7), moje pozvánky (kdo zve, kód), odmítnout; databáze bez pozvánek Dobývání nevypne', async () => {
    const calls = [];
    let missing = false;
    global.self = { MUDRLANT_CONFIG: { supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' }, MudrlantAuth: { accessToken: async () => 'tok' } };
    global.fetch = async (url, options) => {
        const name = String(url).split('/rpc/')[1];
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ name, body });
        const reply = (status, json) => ({ ok: status < 300, status, json: async () => json, text: async () => (json === null ? '' : JSON.stringify(json)) });
        if (missing && name.startsWith('conquest_invite')) return reply(404, { message: 'Could not find the function' });
        if (name === 'conquest_invite') return reply(200, { id: body.game, map: 'evropa', players: [{ id: 'u-1' }], invited: [{ id: 'u-2', display_name: 'Petr' }, null] });
        if (name === 'conquest_invites_mine') return reply(200, [{ id: 'g-2', map: 'evropa', players: [{ id: 'u-1' }], invited: null, code: 'K7M2QX', invited_at: '2026-11-11T10:00:00Z', invited_by: { id: 'u-1', display_name: 'Jana', avatar: '🦊', owl: null } }, { nonsense: true }]);
        if (name === 'conquest_decline_invite') return reply(204, null);
        if (name === 'conquest_lobby') return reply(200, { open: [], mine: [] });
        return reply(400, { message: 'neznámé' });
    };
    const file = require.resolve('../social.js');
    delete require.cache[file];
    const Social = require(file);
    try {
        await assert.rejects(Social.conquestInvite('g-1', []), /Vyber, koho chceš pozvat/);
        const updated = await Social.conquestInvite('g-1', ['u-2', 'u-2', 'x y', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8', 'u-9']);
        assert.deepEqual(calls.pop(), { name: 'conquest_invite', body: { game: 'g-1', friends: ['u-2', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8'] } });
        assert.deepEqual(updated.invited, [{ id: 'u-2', display_name: 'Petr' }]);
        const mine = await Social.conquestInvitesMine();
        assert.equal(mine.length, 1);
        assert.deepEqual([mine[0].id, mine[0].code, mine[0].invited_by.display_name, mine[0].invited_by.avatar, mine[0].invited], ['g-2', 'K7M2QX', 'Jana', '🦊', []]);
        await Social.conquestDeclineInvite('g-2');
        assert.deepEqual(calls.pop(), { name: 'conquest_decline_invite', body: { game: 'g-2' } });
        // Databáze bez bloku 24: pozvánky hlásí 404 a dál se o ně nežádá, Dobývání jede dál
        missing = true;
        await assert.rejects(Social.conquestInvitesMine(), (error) => error.status === 404 && /Pozvánky do Dobývání zatím nejdou/.test(error.message));
        const before = calls.length;
        await assert.rejects(Social.conquestInvite('g-1', ['u-2']), (error) => error.status === 404);
        assert.equal(calls.length, before, 'podruhé se o pozvánky nežádá');
        assert.deepEqual(await Social.conquestLobby(), { open: [], mine: [] });
    } finally {
        delete global.self;
        delete global.fetch;
        delete require.cache[file];
    }
});
