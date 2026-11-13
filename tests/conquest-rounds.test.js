// Rychlé hry a Chci další kolo v Dobývání (blok 26): volání v social.js (založení s minutes, Chci další kolo, kolo ve stavu hry a v pulsu;
// české hlášky databáze projdou, databáze bez bloku 26 Dobývání nevypne a obyčejná hra se založí postaru) a blok 26 ve schema.sql
// (pořadí, verze 26 i v app.js, oprávnění, značky jen přes funkce, texty bez rodu). Chování v databázi hlídá tests/sql-conquest.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GAME = '11111111-2222-3333-4444-555555555555';
const [U1, U2, BOT] = ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003'];
const ROUND = { period: 2, started_at: '2026-12-20T11:05:30+00:00', ends_at: '2026-12-20T11:10:30+00:00', done: true, ready: [U1, BOT, U1, 'zlé id!', 7, null],
    next_at: null, can_ready: true, last: false };

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
const summary = (extra = {}) => ({ id: GAME, map: 'evropa', max_players: 4, hours: null, minutes: 20, period: 'min5', actions: 5, status: 'lobby', players: [{ id: U1 }, null], ...extra });

test('social.js: založení pošle minutes (bez nich null); rychlá hra i hra na hodiny', async () => {
    const { Social, calls, done } = loadSocial((name) => (name === 'conquest_create' ? [200, summary()] : [400, { message: 'neznámé' }]));
    try {
        const game = await Social.conquestCreate({ map: 'evropa', players: 4, period: 'min5', minutes: 20, actions: 5, visibility: 'public', color: 'cervena', emblem: 'lev' });
        const sent = calls.pop();
        assert.equal(sent.name, 'conquest_create');
        assert.deepEqual(Object.keys(sent.body).sort(), ['actions_per', 'colour', 'emblem_id', 'hours', 'map_id', 'minutes', 'per', 'players', 'vis']);
        assert.deepEqual([sent.body.per, sent.body.minutes, sent.body.hours], ['min5', 20, 0]);
        assert.deepEqual([game.id, game.minutes, game.hours, game.players.length, game.round], [GAME, 20, null, 1, null]);
        await Social.conquestCreate({ map: 'cesko', players: 2, hours: 12, period: 'hour', actions: 3, visibility: 'private', color: 'modra', emblem: 'orel' });
        assert.deepEqual([calls[calls.length - 1].body.hours, calls[calls.length - 1].body.minutes, calls[calls.length - 1].body.per], [12, null, 'hour'], 'bez minut null');
        for (const [minutes, expected] of [[null, null], [undefined, null], ['', null], ['30', 30], [45.7, 45], [-5, 0]]) {
            await Social.conquestCreate({ map: 'evropa', players: 2, period: 'min10', minutes, actions: 2, visibility: 'public', color: 'cervena', emblem: 'lev' });
            assert.equal(calls.pop().body.minutes, expected, String(minutes));
        }
        assert.equal(Social.conquestRoundsMissing(), false);
    } finally {
        done();
    }
});

test('social.js: Chci další kolo (ready true/false), kolo ve stavu hry i v pulsu je očištěné; české hlášky projdou', async () => {
    const { Social, calls, done } = loadSocial((name, body) => {
        if (name === 'conquest_round_ready' && body.ready === true) return [200, { ...ROUND, ready: [U1, U2, BOT], next_at: '2026-12-20T11:06:10+00:00', can_ready: false }];
        if (name === 'conquest_round_ready') return [400, { message: 'Odpočet už běží, další kolo začne za chvíli.' }];
        if (name === 'conquest_state') return [200, summary({ status: 'running', round: ROUND, budget: { period: 2, left: 0 } })];
        if (name === 'conquest_move') return [200, summary({ status: 'running', round: { period: '3', done: 'ano', ready: 'všichni', can_ready: 1, last: 'true' }, move: { id: 9 } })];
        if (name === 'conquest_pulse') return [200, { id: GAME, status: 'running', version: '9.0.2.2.running', sieges: [], results: [], round: ROUND }];
        return [400, { message: 'neznámé' }];
    });
    try {
        const round = await Social.conquestRoundReady(GAME);
        assert.deepEqual(calls.pop(), { name: 'conquest_round_ready', body: { game: GAME, ready: true } });
        assert.deepEqual(round, { period: 2, started_at: ROUND.started_at, ends_at: ROUND.ends_at, done: true, ready: [U1, U2, BOT], next_at: '2026-12-20T11:06:10+00:00',
            can_ready: false, last: false });
        await Social.conquestRoundReady(GAME, true);
        assert.equal(calls.pop().body.ready, true);
        await assert.rejects(Social.conquestRoundReady(GAME, false), (error) => error.status === 400 && error.message === 'Odpočet už běží, další kolo začne za chvíli.');
        assert.deepEqual(calls.pop().body, { game: GAME, ready: false });
        await assert.rejects(Social.conquestRoundReady('zlé id!'), /Neplatná hra/);
        // Kolo ve stavu hry: ready jen platná id bez opakování, příznaky jen true
        const st = await Social.conquestState(GAME);
        assert.deepEqual(st.round, { period: 2, started_at: ROUND.started_at, ends_at: ROUND.ends_at, done: true, ready: [U1, BOT], next_at: null, can_ready: true, last: false });
        const moved = await Social.conquestMove(GAME, 'Q214', 'attack', true);
        assert.deepEqual(moved.round, { period: 3, started_at: null, ends_at: null, done: false, ready: [], next_at: null, can_ready: false, last: false });
        const pulse = await Social.conquestPulse(GAME);
        assert.deepEqual([pulse.version, pulse.round.ready, pulse.round.can_ready], ['9.0.2.2.running', [U1, BOT], true]);
        assert.equal(Social.conquestRoundsMissing(), false);
    } finally {
        done();
    }
});

test('social.js: hlášky Chci další kolo (bez rodu) projdou, jiné chyby nahradí obecný text', async () => {
    let reply = [400, { message: 'Další kolo jde chtít, až všichni dohrají své tahy.' }];
    const { Social, done } = loadSocial(() => reply);
    try {
        await assert.rejects(Social.conquestRoundReady(GAME), (error) => error.status === 400 && error.message === 'Další kolo jde chtít, až všichni dohrají své tahy.');
        reply = [400, { message: 'Tohle kolo je poslední. Hra skončí, až vyprší čas.' }];
        await assert.rejects(Social.conquestRoundReady(GAME), /Tohle kolo je poslední\./);
        reply = [400, { message: 'Hra musí mít aspoň 3 kola. Zvol delší hru, nebo kratší kolo.' }];
        await assert.rejects(Social.conquestCreate({ map: 'evropa', players: 2, period: 'min10', minutes: 20, actions: 2, visibility: 'public', color: 'cervena', emblem: 'lev' }),
            /Hra musí mít aspoň 3 kola\. Zvol delší hru, nebo kratší kolo\./);
        reply = [500, { message: 'internal error' }];
        await assert.rejects(Social.conquestRoundReady(GAME), (error) => error.message === 'Nepodařilo se. Zkus to znovu.');
    } finally {
        done();
    }
});

test('social.js: databáze bez bloku 26 – Chci další kolo a rychlá hra nejdou (404), obyčejná hra se založí postaru, zbytek Dobývání jede', async () => {
    const { Social, calls, done } = loadSocial((name, body) => {
        if (name === 'conquest_round_ready') return [404, { message: 'Could not find the function' }];
        // Starší conquest_create zná jen osm parametrů
        if (name === 'conquest_create') return 'minutes' in body ? [404, { message: 'Could not find the function' }] : [200, summary({ hours: 12, minutes: undefined, period: 'hour' })];
        if (name === 'conquest_state') return [200, summary({ status: 'running', budget: { period: 0, left: 3 } })];
        if (name === 'conquest_pulse') return [200, { id: GAME, status: 'running', version: '9.0.running', sieges: [], results: [] }];
        return [400, { message: 'neznámé' }];
    });
    try {
        // Stav a puls běžící hry bez kola prozradí starší databázi
        const st = await Social.conquestState(GAME);
        assert.deepEqual([st.id, st.round], [GAME, null]);
        assert.equal(Social.conquestRoundsMissing(), true);
        const pulse = await Social.conquestPulse(GAME);
        assert.equal(pulse.round, null);
        // Obyčejná hra: napřed s minutes (404), pak postaru bez nich; další založení už rovnou postaru
        const classic = { map: 'cesko', players: 2, hours: 12, period: 'hour', actions: 3, visibility: 'private', color: 'modra', emblem: 'orel' };
        const before = calls.length;
        const made = await Social.conquestCreate(classic);
        assert.equal(made.id, GAME);
        const tried = calls.slice(before);
        assert.deepEqual(tried.map(call => [call.name, 'minutes' in call.body]), [['conquest_create', false]], 'o blok 26 se už nežádá');
        assert.deepEqual(tried[0].body, { map_id: 'cesko', players: 2, hours: 12, per: 'hour', actions_per: 3, vis: 'private', colour: 'modra', emblem_id: 'orel' });
        // Rychlá hra nejde
        await assert.rejects(Social.conquestCreate({ ...classic, period: 'min5', minutes: 20 }), (error) => error.status === 404 && /Rychlé hry a další kolo zatím nejdou/.test(error.message));
        await assert.rejects(Social.conquestRoundReady(GAME), (error) => error.status === 404 && /Rychlé hry a další kolo zatím nejdou/.test(error.message));
        assert.equal((await Social.conquestState(GAME)).id, GAME, 'Dobývání jede dál');
    } finally {
        done();
    }
});

test('social.js: databáze bez bloku 26 se pozná i při prvním založení (404 s minutes, pak postaru)', async () => {
    const { Social, calls, done } = loadSocial((name, body) => (name === 'conquest_create' && 'minutes' in body ? [404, { message: 'Could not find the function' }]
        : name === 'conquest_create' ? [200, summary({ hours: 72, period: 'day' })] : [404, { message: 'Could not find the function' }]));
    try {
        const made = await Social.conquestCreate({ map: 'evropa', players: 4, hours: 72, period: 'day', actions: 5, visibility: 'public', color: 'cervena', emblem: 'lev' });
        assert.equal(made.id, GAME);
        assert.deepEqual(calls.map(call => [call.name, 'minutes' in call.body]), [['conquest_create', true], ['conquest_create', false]]);
        assert.equal(Social.conquestRoundsMissing(), true);
        // Bez Dobývání vůbec (404 i postaru): celé Dobývání chybí
        const missing = loadSocial(() => [404, { message: 'Could not find the function' }]);
        try {
            await assert.rejects(missing.Social.conquestCreate({ map: 'evropa', players: 4, hours: 72, period: 'day', actions: 5, visibility: 'public', color: 'cervena', emblem: 'lev' }),
                (error) => error.status === 404 && /Dobývání zatím není k dispozici/.test(error.message));
        } finally {
            missing.done();
        }
    } finally {
        done();
    }
});

test('schema.sql: blok 26 před verzí schématu, verze 26 i v app.js; Chci další kolo jen přihlášeným, pomocné funkce a značky jen interně, texty bez rodu', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    const start = schema.indexOf('-- ===== 26: Dobývání – rychlé hry a další kolo =====');
    const end = schema.indexOf('-- ===== 26: Dobývání – rychlé hry a další kolo — KONEC BLOKU =====');
    assert.ok(start > schema.indexOf('-- ===== 25: Dobývání – bitvy o území (obléhání) — KONEC BLOKU ====='));
    assert.ok(end > start && end < schema.indexOf('-- ===== Verze schématu ====='));
    const version = Number(/language sql immutable as \$\$ select (\d+) \$\$;/.exec(schema)[1]);
    assert.ok(version >= 26);
    assert.equal(Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]), version);
    assert.match(schema, /^-- 26: Dobývání – rychlé hry a další kolo/m, 'řádek v seznamu verzí');
    assert.match(schema, /revoke all on public\.conquest_round_marks from public, anon, authenticated;/);
    assert.match(schema, /grant execute on function public\.conquest_round_ready\(uuid, boolean\) to authenticated;/);
    assert.match(schema, /drop function if exists public\.conquest_create\(text, integer, integer, text, integer, text, text, text\);/, 'stará podoba založení se maže');
    assert.match(schema, /grant execute on function [^;]*public\.conquest_create\(text, integer, integer, text, integer, text, text, text, integer\)/);
    for (const name of ['conquest_round_json', 'conquest_round_done', 'conquest_round_player_done', 'conquest_round_countdown', 'conquest_minutes', 'conquest_period_start', 'conquest_period_end']) {
        assert.doesNotMatch(schema, new RegExp(`grant [^;]*${name}\\(`), `${name} jen interně`);
    }
    assert.match(schema, /\('blesk-20m', 'evropa', 4, null, 20, 'min5', 5\)/, 'předvolba Blesk');
    // Hlášky v češtině a bez rodu
    const messages = ['Další kolo jde chtít, až všichni dohrají své tahy.', 'Tohle kolo je poslední. Hra skončí, až vyprší čas.', 'Odpočet už běží, další kolo začne za chvíli.',
        'Hra musí mít aspoň 3 kola. Zvol delší hru, nebo kratší kolo.', 'Kolo trvá den, hodinu, 10 minut, nebo 5 minut.'];
    for (const message of messages) assert.ok(schema.includes(`'${message}'`), message);
    assert.doesNotMatch(messages.join(' '), /\b(zvolil|zvolila|jsi|dohrál|dohrála|chtěl|chtěla)\b/);
    assert.ok(schema.includes("'V dalším kole'"), 'upozornění rychlé hry o dalším kole');
});
