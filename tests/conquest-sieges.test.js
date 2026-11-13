// Bitvy o území v Dobývání (blok 25): volání v social.js (obléhání, přidání, odpověď, stav bitvy, puls; otázka se pošle bez příznaků
// správnosti, české hlášky databáze projdou, databáze bez bloku 25 Dobývání nevypne), kronika s prohranou bitvou, nápověda (pravidla
// bitvy a Pevnost +1 tah, bez rodu) a blok 25 ve schema.sql (pořadí, verze 25, tabulky jen přes funkce, oprávnění).
// Chování v databázi hlídá tests/sql-conquest.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../conquest.js');

const ROOT = path.join(__dirname, '..');
const evropa = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dobyvani-evropa.json'), 'utf8'));
const GAME = '11111111-2222-3333-4444-555555555555';
const SIEGE = '99999999-8888-7777-6666-555555555555';
const QUESTION = { kind: 'flag', prompt: 'Čí je tahle vlajka?', image: 'https://example.com/vlajka.svg', family: 'vlajka', level: 0,
    choices: [{ label: 'Slovinsko', correct: false }, { label: 'Slovensko', correct: true }, { label: 'Srbsko', correct: false }, { label: 'Rusko', correct: false }] };
const siegeRow = (extra = {}) => ({ id: SIEGE, game: GAME, territory: 'Q214', status: 'open', joined_at: '2026-12-10T08:00:00Z', deadline: '2026-12-10T08:01:00Z',
    participants: [{ id: 'u-1', display_name: 'Alfa', answered: false }, null, { nonsense: true }], ...extra });

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

test('social.js: obléhání pošle otázku bez příznaků správnosti a index zvlášť; přidání, odpověď, stav a puls', async () => {
    const { Social, calls, done } = loadSocial((name, body) => {
        if (name === 'conquest_siege_begin') return [200, siegeRow({ mine: true, budget: { left: 4, reserved: 1 } })];
        if (name === 'conquest_siege_join') return [200, siegeRow({ question: body && { prompt: 'Čí je tahle vlajka?', choices: ['A', 'B'] }, correct_choice: null })];
        if (name === 'conquest_siege_answer') return [200, { correct: true, status: 'resolved', late: false, answer_ms: 7000, correct_choice: 1, siege: siegeRow({ status: 'resolved' }),
            move: { id: 9, r: 'capture' }, state: { id: GAME, map: 'evropa', players: [{ id: 'u-1' }, null] } }];
        if (name === 'conquest_siege_status') return [200, siegeRow({ answer: null })];
        if (name === 'conquest_pulse') return [200, { id: GAME, now: '2026-12-10T08:00:02Z', status: 'running', version: '812.3.running', sieges: [siegeRow({ can_join: true }), { id: 'zlé id!' }], results: null }];
        return [400, { message: 'neznámé' }];
    });
    try {
        const begun = await Social.conquestSiegeBegin(GAME, 'Q214', QUESTION, null, 'Q213');
        const sent = calls.pop();
        assert.equal(sent.name, 'conquest_siege_begin');
        assert.deepEqual(Object.keys(sent.body).sort(), ['correct', 'game', 'question', 'source', 'target']);
        assert.deepEqual([sent.body.game, sent.body.target, sent.body.source, sent.body.correct], [GAME, 'Q214', 'Q213', 1], 'index správné z příznaku');
        assert.doesNotMatch(JSON.stringify(sent.body.question), /correct/, 'otázka bez příznaků správnosti');
        assert.deepEqual(sent.body.question.choices, [{ label: 'Slovinsko' }, { label: 'Slovensko' }, { label: 'Srbsko' }, { label: 'Rusko' }]);
        assert.deepEqual([sent.body.question.prompt, sent.body.question.image, sent.body.question.family], [QUESTION.prompt, QUESTION.image, 'vlajka']);
        assert.equal(QUESTION.choices[1].correct, true, 'původní otázka zůstane beze změny');
        assert.deepEqual([begun.id, begun.mine, begun.budget.left, begun.participants.length], [SIEGE, true, 4, 1]);
        // Index zadaný zvlášť má přednost; špatná otázka se vůbec neodešle
        await Social.conquestSiegeBegin(GAME, 'Q214', { prompt: 'Kolik?', choices: ['1', '2', '3'] }, 2);
        assert.deepEqual([calls.pop().body.correct], [2]);
        const before = calls.length;
        for (const [question, correct] of [[{ prompt: 'Jedna', choices: [{ label: 'A', correct: true }] }, null], [{ prompt: 'Bez správné', choices: ['A', 'B'] }, null],
            [QUESTION, 4], [QUESTION, -1], [{ prompt: 'Devět', choices: 'ABCDEFGHI'.split('') }, 0], [{ ...QUESTION, prompt: 'x'.repeat(41000) }, null], [null, 0]]) {
            await assert.rejects(Social.conquestSiegeBegin(GAME, 'Q214', question, correct), /Otázku k bitvě se nepodařilo připravit/);
        }
        assert.equal(calls.length, before, 'nic se neodeslalo');
        await assert.rejects(Social.conquestSiegeBegin('zlé id!', 'Q214', QUESTION), /Neplatná hra/);
        // Přidání: otázka bez správné odpovědi
        const joined = await Social.conquestSiegeJoin(SIEGE);
        assert.deepEqual(calls.pop(), { name: 'conquest_siege_join', body: { siege: SIEGE, source: null } });
        assert.deepEqual([joined.question.choices, joined.correct_choice], [['A', 'B'], null]);
        await Social.conquestSiegeJoin(SIEGE, 'Q36');
        assert.deepEqual(calls.pop().body, { siege: SIEGE, source: 'Q36' });
        await assert.rejects(Social.conquestSiegeJoin('x y'), /Neplatná bitva/);
        // Odpověď: index, nebo null (bez odpovědi)
        const result = await Social.conquestSiegeAnswer(SIEGE, 1);
        assert.deepEqual(calls.pop(), { name: 'conquest_siege_answer', body: { siege: SIEGE, choice: 1 } });
        assert.deepEqual([result.correct, result.status, result.late, result.answer_ms, result.correct_choice, result.move.r], [true, 'resolved', false, 7000, 1, 'capture']);
        assert.deepEqual([result.siege.id, result.siege.status, result.state.id, result.state.players.length], [SIEGE, 'resolved', GAME, 1]);
        for (const choice of [null, undefined, -1, 8, 1.5, '2']) {
            await Social.conquestSiegeAnswer(SIEGE, choice);
            assert.equal(calls.pop().body.choice, null, String(choice));
        }
        // Stav bitvy a puls
        assert.equal((await Social.conquestSiegeStatus(SIEGE)).id, SIEGE);
        assert.deepEqual(calls.pop(), { name: 'conquest_siege_status', body: { siege: SIEGE } });
        const pulse = await Social.conquestPulse(GAME);
        assert.deepEqual(calls.pop(), { name: 'conquest_pulse', body: { game: GAME } });
        assert.deepEqual([pulse.version, pulse.status, pulse.now, pulse.sieges.length, pulse.sieges[0].can_join, pulse.results], ['812.3.running', 'running', '2026-12-10T08:00:02Z', 1, true, []]);
        assert.equal(Social.conquestSiegesMissing(), false);
    } finally {
        done();
    }
});

test('social.js: české hlášky bitvy projdou, jiné chyby nahradí obecný text; databáze bez bloku 25 vypne jen bitvy', async () => {
    let missing = false;
    const { Social, calls, done } = loadSocial((name) => {
        if (missing && (name.startsWith('conquest_siege') || name === 'conquest_pulse')) return [404, { message: 'Could not find the function' }];
        if (name === 'conquest_siege_begin') return [400, { message: 'Na území právě probíhá bitva. Můžeš se přidat.' }];
        if (name === 'conquest_siege_join') return [400, { message: 'Bitva už skončila.' }];
        if (name === 'conquest_siege_answer') return [500, { message: 'internal error' }];
        if (name === 'conquest_state') return [200, { id: GAME, map: 'evropa', players: [] }];
        if (name === 'conquest_invites_mine') return [200, []];
        return [400, { message: 'neznámé' }];
    });
    try {
        await assert.rejects(Social.conquestSiegeBegin(GAME, 'Q214', QUESTION), (error) => error.status === 400 && error.message === 'Na území právě probíhá bitva. Můžeš se přidat.');
        await assert.rejects(Social.conquestSiegeJoin(SIEGE), (error) => error.status === 400 && error.message === 'Bitva už skončila.');
        await assert.rejects(Social.conquestSiegeAnswer(SIEGE, 0), /Odpověď se nepodařilo odeslat\. Zkontroluj připojení\./);
        missing = true;
        await assert.rejects(Social.conquestPulse(GAME), (error) => error.status === 404 && /Bitvy o území zatím nejdou/.test(error.message));
        assert.equal(Social.conquestSiegesMissing(), true);
        const before = calls.length;
        await assert.rejects(Social.conquestSiegeBegin(GAME, 'Q214', QUESTION), (error) => error.status === 404);
        await assert.rejects(Social.conquestSiegeStatus(SIEGE), (error) => error.status === 404);
        assert.equal(calls.length, before, 'o bitvy se dál nežádá');
        // Zbytek Dobývání jede dál (stav hry i pozvánky)
        assert.equal((await Social.conquestState(GAME)).id, GAME);
        assert.deepEqual(await Social.conquestInvitesMine(), []);
    } finally {
        done();
    }
});

test('kronika: prohraná bitva (správně, ale pomaleji) s meči; odražený útok zůstává', () => {
    const state = {
        id: 'g1', map: 'evropa', status: 'running', period: 'day', actions: 5, ends_at: '2026-12-13T07:00:00Z',
        players: [{ id: 'A', display_name: 'Alfa', seat: 0, flag_color: 'cervena', emblem: 'lev', me: true }, { id: 'B', display_name: 'Beta', seat: 1, flag_color: 'modra', emblem: 'orel' },
            { id: 'D', display_name: 'Delta', seat: 2, flag_color: 'zluta', emblem: 'vlk' }],
        territories: evropa.t.map(t => ({ t: t.id, o: { Q213: 'A', Q36: 'B', Q214: 'A', Q28: 'D' }[t.id] || null, l: 0, h: false, p: false })),
        budget: { period: 0, base: 5, regions: 0, treasures: 0, loot: 0, fortress: 0, penalty: 0, used: 1, reserved: 0, total: 5, left: 4 },
        moves: [
            { id: 1, u: 'B', k: 'attack', t: 'Q214', s: 'Q36', r: 'outrun', ok: true, v: 'D', n: 0, at: '2026-12-10T09:00:22Z' },
            { id: 2, u: 'A', k: 'attack', t: 'Q214', s: 'Q213', r: 'capture', ok: true, v: 'D', n: 0, at: '2026-12-10T09:00:22Z' },
            { id: 3, u: 'B', k: 'attack', t: 'Q28', r: 'fail', ok: false, v: 'D', n: 0, at: '2026-12-10T09:05:00Z' }
        ]
    };
    const view = C.viewOf(state, evropa, 'A');
    const items = C.feedItems(state.moves, view);
    assert.deepEqual(items.map(item => [item.title, item.text, item.icon, item.actor && item.actor.id, item.victim && item.victim.id]), [
        ['Maďarsko', 'Útok odražen', 'shield-check', 'B', 'D'],
        ['Slovensko', 'Dobyto', 'flag', 'A', 'D'],
        ['Slovensko', 'Prohraná bitva', 'swords', 'B', 'D']
    ]);
    assert.equal(items[2].id, '1');
    const html = C.feedHtml(items);
    assert.match(html, /Prohraná bitva/);
    assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=/i);
});

test('nápověda: záložka Útok s pravidly bitvy, Pevnost na domovském hradu +1 tah, bez rodu', () => {
    const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const utok = text(C.helpHtml('utok'));
    for (const sentence of ['Útok začne obléhání. Kdo s územím sousedí, může se přidat. Všichni dostanou stejnou otázku a každý má 60 s.',
        'Území získá nejrychlejší správná odpověď.', 'Pozor: Kdo odpoví správně, ale pomaleji, nezíská nic a tah ztratí.', 'Obléhané území nejde opevnit.']) {
        assert.ok(utok.includes(sentence), sentence);
    }
    assert.match(utok, /Správně:[\s\S]*Opevnění:/, 'záložky, které hlídá e2e test');
    assert.match(text(C.helpHtml('regiony')), /Pevnost na domovském hradu: \+1 tah za období\./);
    const all = C.HELP_TABS.map(([id]) => C.helpHtml(id)).join('');
    assert.doesNotMatch(all, /\b(zaútočil|zaútočila|odpověděl|odpověděla|přidal jsi|přidala jsi|prohrál|prohrála)\b/);
});

test('schema.sql: blok 25 před verzí schématu, verze 25 i v app.js; tabulky bitev jen přes funkce, prohraná bitva v tazích', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    const start = schema.indexOf('-- ===== 25: Dobývání – bitvy o území (obléhání) =====');
    assert.ok(start > schema.indexOf('-- ===== 24: Dobývání – pozvánky pro přátele — KONEC BLOKU ====='));
    assert.ok(schema.indexOf('-- ===== 25: Dobývání – bitvy o území (obléhání) — KONEC BLOKU =====') < schema.indexOf('-- ===== Verze schématu ====='));
    assert.match(schema, /language sql immutable as \$\$ select 25 \$\$;/);
    assert.match(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), /const REQUIRED_SCHEMA = 25;/);
    assert.match(schema, /^-- 25: Dobývání – bitvy o území/m, 'řádek v seznamu verzí');
    assert.match(schema, /revoke all on public\.conquest_sieges, public\.conquest_siege_players from public, anon, authenticated;/);
    assert.match(schema, /result in \('home', 'respawn', 'capture', 'breach', 'fortify', 'fail', 'outrun'\)/);
    assert.match(schema, /grant execute on function public\.conquest_siege_begin\(uuid, text, jsonb, smallint, text\), public\.conquest_siege_join\(uuid, text\), public\.conquest_siege_answer\(uuid, smallint\),\s+public\.conquest_siege_status\(uuid\), public\.conquest_pulse\(uuid\) to authenticated;/);
    for (const name of ['conquest_siege_resolve', 'conquest_sieges_due', 'conquest_siege_question', 'conquest_siege_json', 'conquest_siege_view', 'conquest_attack_apply', 'conquest_besieged']) {
        assert.doesNotMatch(schema, new RegExp(`grant [^;]*${name}`), `${name} jen interně`);
    }
    // Texty hlášek bez rodu
    const block = schema.slice(start, schema.indexOf('-- ===== Verze schématu ====='));
    for (const message of ['Na území právě probíhá bitva. Můžeš se přidat.', 'Bitva už skončila.', 'V téhle bitvě nebojuješ.', 'Otázka k bitvě není v pořádku.', 'Otázka k bitvě je moc velká.']) {
        assert.ok(block.includes(`'${message}'`), message);
    }
    assert.ok(schema.includes("'Obléhané území teď nejde opevnit.'"));
});
